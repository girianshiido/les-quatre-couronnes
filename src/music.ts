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

export type MusicScene = "silent" | "title" | "map" | "won" | "lost";
export const BIOME_MUSIC = [
  {
    files: ["theme-normal", "theme-victoire"],
    seconds: 64,
    barSeconds: 2,
  },
  {
    files: ["carte-desert-normal", "carte-desert-essor"],
    seconds: 42,
    barSeconds: 1.75,
  },
  {
    files: ["carte-neige-normal", "carte-neige-essor"],
    seconds: 45,
    barSeconds: 1.875,
  },
  {
    files: ["carte-marais-normal", "carte-marais-essor"],
    seconds: 48,
    barSeconds: 3,
  },
  {
    files: ["carte-cristal-normal", "carte-cristal-essor"],
    seconds: 40,
    barSeconds: 2.5,
  },
] as const;
const TRACKS = {
  title: { files: ["ecran-titre"], seconds: 60 },
  won: { files: ["ecran-victoire-finale"], seconds: 30 },
  lost: { files: ["ecran-defaite"], seconds: 36 },
} as const;
type AudibleScene = Exclude<MusicScene, "silent">;
interface MusicOptions {
  baseUrl: string;
  muted?: boolean;
  volume?: number;
  onError?: () => void;
  createContext?: () => AudioContext;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
}
interface Layer {
  sources: AudioBufferSourceNode[];
  gains: GainNode[];
  volume: GainNode;
}
/** One audio clock, seamless loops and a shared volume for every screen. Only
 * the current scene's decoded buffers are cached; compressed files can be reused. */
export class MapMusic {
  private context?: AudioContext;
  private master?: GainNode;
  private layer?: Layer;
  private retiring = new Set<Layer>();
  private encoded = new Map<string, Promise<ArrayBuffer>>();
  private loading = new Map<string, Promise<AudioBuffer[]>>();
  private decoded?: { key: string; buffers: AudioBuffer[] };
  private biome = 0;
  private playingKey = "";
  private scene: MusicScene = "silent";
  private playing: MusicScene = "silent";
  private revision = 0;
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
  /** Called by the first pointer/key gesture: browsers gate initial audio. */
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
  begin(biome = this.biome) {
    this.chooseBiome(biome);
    this.setMood("normal");
    this.select("map");
  }
  prepareMap(biome = 0) {
    this.chooseBiome(biome);
    this.scene = "silent";
    this.playing = "silent";
    this.revision++;
    if (this.layer && this.context)
      this.retire(this.layer, this.context.currentTime);
    this.layer = undefined;
    this.ramp = undefined;
    this.mix = 0;
    this.mood = "normal";
  }
  showTitle() {
    this.select("title");
  }
  finish(result: "won" | "lost") {
    this.select(result);
  }
  retry() {
    this.failed = false;
    return this.unlock();
  }
  end() {
    this.scene = "silent";
    this.playing = "silent";
    this.revision++;
    for (const layer of [
      ...this.retiring,
      ...(this.layer ? [this.layer] : []),
    ]) {
      for (const source of layer.sources) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      for (const gain of layer.gains) gain.disconnect();
      layer.volume.disconnect();
    }
    this.retiring.clear();
    this.layer = undefined;
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
    if (
      !c ||
      this.playing !== "map" ||
      this.scene !== "map" ||
      this.playingKey !== this.trackKey("map") ||
      !this.layer
    )
      return;
    const now = c.currentTime;
    const bar = BIOME_MUSIC[this.biome].barSeconds;
    if (this.ramp) {
      const t = Math.max(0, Math.min(1, (now - this.ramp.at) / bar));
      this.mix = this.ramp.from + (this.ramp.to - this.ramp.from) * t;
    }
    const at =
      this.epoch + Math.ceil(Math.max(0, now - this.epoch) / bar) * bar;
    const target = mood === "victory" ? 1 : 0;
    this.layer.gains.forEach((node, i) => {
      const value = i === 0 ? 1 - this.mix : this.mix;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(value, now);
      node.gain.setValueAtTime(value, at);
      node.gain.linearRampToValueAtTime(
        i === 0 ? 1 - target : target,
        at + bar,
      );
    });
    this.ramp = { at, from: this.mix, to: target };
  }
  private chooseBiome(biome: number) {
    const next =
      Number.isInteger(biome) && biome >= 0 && biome < BIOME_MUSIC.length
        ? biome
        : 0;
    if (next === this.biome) return;
    this.biome = next;
    this.revision++;
  }
  private trackKey(scene: AudibleScene) {
    return scene === "map" ? `map-${this.biome}` : scene;
  }
  private tracks(scene: AudibleScene) {
    return scene === "map" ? BIOME_MUSIC[this.biome] : TRACKS[scene];
  }
  private select(scene: AudibleScene) {
    if (this.scene !== scene) {
      this.scene = scene;
      this.revision++;
    }
    this.failed = false;
    void this.ensurePlaying();
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
  private async load(scene: AudibleScene, c: AudioContext) {
    const key = this.trackKey(scene);
    if (this.decoded?.key === key) return this.decoded.buffers;
    let pending = this.loading.get(key);
    if (!pending) {
      pending = Promise.all(
        this.tracks(scene).files.map(async (name) => {
          const url = `${this.options.baseUrl}audio/${name}.ogg`;
          let request = this.encoded.get(url);
          if (!request) {
            request = this.options.fetchAudio
              ? this.options.fetchAudio(url)
              : fetch(url).then((r) => {
                  if (!r.ok) throw new Error(`Music ${r.status}`);
                  return r.arrayBuffer();
                });
            this.encoded.set(url, request);
          }
          try {
            return await c.decodeAudioData((await request).slice(0));
          } catch (error) {
            if (this.encoded.get(url) === request) this.encoded.delete(url);
            throw error;
          }
        }),
      );
      this.loading.set(key, pending);
    }
    try {
      return await pending;
    } finally {
      if (this.loading.get(key) === pending) this.loading.delete(key);
    }
  }
  private retire(layer: Layer, at: number) {
    this.retiring.add(layer);
    const gain = layer.volume.gain;
    if (typeof gain.cancelAndHoldAtTime === "function")
      gain.cancelAndHoldAtTime(at);
    else {
      gain.cancelScheduledValues(at);
      gain.setValueAtTime(gain.value, at);
    }
    gain.linearRampToValueAtTime(0, at + 0.4);
    let remaining = layer.sources.length;
    for (const source of layer.sources) {
      source.onended = () => {
        source.disconnect();
        if (--remaining) return;
        layer.gains.forEach((g) => g.disconnect());
        layer.volume.disconnect();
        this.retiring.delete(layer);
      };
      source.stop(at + 0.4);
    }
  }
  private async ensurePlaying() {
    const c = this.context,
      scene = this.scene,
      revision = this.revision;
    if (
      scene === "silent" ||
      !c ||
      this.failed ||
      (this.layer && this.playingKey === this.trackKey(scene))
    )
      return;
    const key = this.trackKey(scene),
      tracks = this.tracks(scene);
    try {
      const buffers = await this.load(scene, c);
      if (
        revision !== this.revision ||
        this.scene !== scene ||
        (this.layer && this.playingKey === key)
      )
        return;
      if (buffers.some((b) => Math.abs(b.duration - tracks.seconds) > 0.02))
        throw new Error("Music loop duration mismatch");
      this.decoded = { key, buffers };
      const now = c.currentTime,
        previous = this.layer;
      const gains = buffers.map(() => c.createGain()),
        volume = c.createGain();
      const crossfade = !!previous || this.retiring.size > 0;
      volume.gain.value = crossfade ? 0 : 1;
      volume.connect(this.master!);
      this.epoch = now + 0.05;
      this.ramp = undefined;
      this.mix = scene === "map" && this.mood === "victory" ? 1 : 0;
      const sources = buffers.map((buffer, i) => {
        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = tracks.seconds;
        gains[i].gain.value =
          scene !== "map" ? 1 : i === 0 ? 1 - this.mix : this.mix;
        source.connect(gains[i]);
        gains[i].connect(volume);
        source.start(this.epoch);
        return source;
      });
      if (crossfade) {
        volume.gain.setValueAtTime(0, now);
        volume.gain.linearRampToValueAtTime(1, now + 0.4);
      }
      if (previous) this.retire(previous, now);
      this.layer = { sources, gains, volume };
      this.playing = scene;
      this.playingKey = key;
    } catch {
      if (revision === this.revision) this.reportError();
    }
  }
}
