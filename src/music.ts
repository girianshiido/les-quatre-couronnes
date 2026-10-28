import type { State } from "./engine";

export type MusicMood = "normal" | "victory";

/** The last opponent must be weak in both population and territory. Wider exit
 * thresholds prevent a single birth or new house from toggling the arrangement. */
export function mapMusicMood(
  s: State,
  previous: MusicMood = "normal",
): MusicMood {
  if (s.result === "won") return "victory";
  if (s.result === "lost" || !s.kingdoms[0].alive) return "normal";
  const enemies = s.kingdoms.filter((k) => k.id !== 0 && k.alive);
  if (enemies.length !== 1) return "normal";
  const homes = [0, 0, 0, 0],
    hp = [0, 0, 0, 0];
  for (const h of s.houses) homes[h.team]++;
  for (const u of s.units) hp[u.team] += Math.max(0, u.hp);
  const enemy = enemies[0].id,
    holding = previous === "victory";
  return homes[0] >= 4 &&
    hp[0] >= 500 &&
    homes[enemy] <= Math.max(2, homes[0] * (holding ? 0.5 : 0.3)) &&
    hp[enemy] <= hp[0] * (holding ? 0.65 : 0.4)
    ? "victory"
    : "normal";
}

interface MusicOptions {
  baseUrl: string;
  muted?: boolean;
  volume?: number;
  onError?: () => void;
  createContext?: () => AudioContext;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
}

/** Two decoded buffers share one clock and one phase. Gain automation performs
 * transitions on a bar boundary; neither looping nor mixing relies on timers. */
export class MapMusic {
  private context?: AudioContext;
  private master?: GainNode;
  private gains: GainNode[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private loading?: Promise<AudioBuffer[]>;
  private buffers?: AudioBuffer[];
  private active = false;
  private visible = true;
  private failed = false;
  private epoch = 0;
  private mood: MusicMood = "normal";
  private mix = 0;
  private ramp?: { at: number; from: number; to: number };
  muted: boolean;
  volume: number;

  constructor(private options: MusicOptions) {
    this.muted = options.muted ?? false;
    this.volume = Math.max(0, Math.min(1, options.volume ?? 0.65));
  }

  /** Call directly from a user gesture to satisfy browser autoplay rules. */
  async unlock() {
    try {
      if (!this.context) {
        this.context =
          this.options.createContext?.() ??
          new AudioContext({ sampleRate: 44100 });
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
      }
      if (this.visible && this.context.state === "suspended")
        await this.context.resume();
      await this.ensurePlaying();
    } catch {
      this.reportError();
    }
  }

  begin() {
    this.active = true;
    this.failed = false;
    this.setMood("normal");
    void this.ensurePlaying();
  }

  retry() {
    this.failed = false;
    return this.unlock();
  }

  end() {
    this.active = false;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    for (const gain of this.gains) gain.disconnect();
    this.sources = [];
    this.gains = [];
    this.ramp = undefined;
    this.mix = 0;
    this.mood = "normal";
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateVolume();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateVolume();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.context) return;
    if (!visible) void this.context.suspend().catch(() => {});
    else void this.unlock();
  }

  setMood(mood: MusicMood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const c = this.context;
    if (!c || !this.sources.length) return;
    const now = c.currentTime;
    // Preserve the current mix if an earlier transition is interrupted.
    if (this.ramp) {
      const t = Math.max(0, Math.min(1, (now - this.ramp.at) / 2));
      this.mix = this.ramp.from + (this.ramp.to - this.ramp.from) * t;
    }
    const at = this.epoch + Math.ceil(Math.max(0, now - this.epoch) / 2) * 2;
    const target = mood === "victory" ? 1 : 0;
    this.gains.forEach((node, i) => {
      const value = i === 0 ? 1 - this.mix : this.mix;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(value, now);
      node.gain.setValueAtTime(value, at);
      node.gain.linearRampToValueAtTime(i === 0 ? 1 - target : target, at + 2);
    });
    this.ramp = { at, from: this.mix, to: target };
  }

  private updateVolume() {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      this.context.currentTime,
      0.035,
    );
  }

  private reportError() {
    if (this.failed) return;
    this.failed = true;
    this.options.onError?.();
  }

  private async ensurePlaying() {
    const c = this.context;
    if (!this.active || !c || this.failed || this.sources.length) return;
    try {
      this.loading ??= Promise.all(
        ["normal", "victoire"].map(async (name) => {
          const url = `${this.options.baseUrl}audio/theme-${name}.ogg`;
          const data = this.options.fetchAudio
            ? await this.options.fetchAudio(url)
            : await fetch(url).then((r) => {
                if (!r.ok) throw new Error(`Music ${r.status}`);
                return r.arrayBuffer();
              });
          return c.decodeAudioData(data);
        }),
      );
      this.buffers ??= await this.loading;
      // Multiple clicks may await the same load, or return to the title meanwhile.
      if (!this.active || this.sources.length) return;
      if (this.buffers.some((b) => Math.abs(b.duration - 64) > 0.02))
        throw new Error("Music loop duration mismatch");
      this.epoch = c.currentTime + 0.05;
      this.mix = this.mood === "victory" ? 1 : 0;
      this.buffers.forEach((buffer, i) => {
        const source = c.createBufferSource(),
          gain = c.createGain();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = 64;
        gain.gain.value = i === 0 ? 1 - this.mix : this.mix;
        source.connect(gain);
        gain.connect(this.master!);
        source.start(this.epoch);
        this.sources.push(source);
        this.gains.push(gain);
      });
    } catch {
      this.loading = undefined;
      this.reportError();
    }
  }
}
