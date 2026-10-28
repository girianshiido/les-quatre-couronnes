import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, type State } from "../src/engine";
import { MapMusic, mapMusicMood } from "../src/music";

function finalOpponent(homes = 2, health = 1000): State {
  const s = createGame();
  s.kingdoms[2].alive = s.kingdoms[3].alive = false;
  s.houses = Array.from({ length: 12 + homes }, (_, i) => ({
    ...s.houses[0],
    id: i,
    team: i < 12 ? 0 : 1,
  }));
  s.units = [
    { ...s.units[0], team: 0, hp: 6000 },
    { ...s.units[1], team: 1, hp: health },
  ];
  return s;
}

test("map music starts normally and needs one weak opponent in territory AND HP", () => {
  assert.equal(mapMusicMood(createGame()), "normal");
  assert.equal(mapMusicMood(finalOpponent()), "victory");
  assert.equal(mapMusicMood(finalOpponent(10, 1000)), "normal");
  assert.equal(mapMusicMood(finalOpponent(2, 5000)), "normal");
  const weakPlayer = finalOpponent();
  weakPlayer.units[0].hp = 300;
  assert.equal(mapMusicMood(weakPlayer), "normal");
  const twoEnemies = finalOpponent();
  twoEnemies.kingdoms[2].alive = true;
  assert.equal(mapMusicMood(twoEnemies), "normal");
});

test("musical hysteresis prevents oscillation; recovered opponent returns to normal", () => {
  const s = finalOpponent(5, 3000);
  assert.equal(mapMusicMood(s, "victory"), "victory");
  assert.equal(mapMusicMood(s, "normal"), "normal");
  s.units[1].hp = 4500;
  assert.equal(mapMusicMood(s, "victory"), "normal");
  s.result = "won";
  assert.equal(mapMusicMood(s), "victory");
  s.result = "lost";
  assert.equal(mapMusicMood(s, "victory"), "normal");
});

class Param {
  value = 1;
  calls: [string, number, number?][] = [];
  cancelScheduledValues(at: number) {
    this.calls.push(["cancel", at]);
  }
  setValueAtTime(value: number, at: number) {
    this.calls.push(["set", value, at]);
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.calls.push(["ramp", value, at]);
  }
  setTargetAtTime(value: number, at: number) {
    this.calls.push(["target", value, at]);
  }
}
class Gain {
  gain = new Param();
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
}
class Source {
  buffer: unknown;
  loop = false;
  loopStart = -1;
  loopEnd = -1;
  started?: number;
  stopped = false;
  connect() {}
  disconnect() {}
  start(at: number) {
    this.started = at;
  }
  stop() {
    this.stopped = true;
  }
}
class Context {
  currentTime = 10;
  state = "suspended";
  destination = {};
  gains: Gain[] = [];
  sources: Source[] = [];
  decoded = 0;
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async decodeAudioData() {
    this.decoded++;
    return { duration: 64 };
  }
  createGain() {
    const g = new Gain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new Source();
    this.sources.push(s);
    return s;
  }
}
function player(
  fetchAudio: (url: string) => Promise<ArrayBuffer> = async () =>
    new ArrayBuffer(0),
) {
  const c = new Context();
  const urls: string[] = [];
  let errors = 0,
    created = 0;
  const music = new MapMusic({
    baseUrl: "/game/",
    createContext: () => {
      created++;
      return c as unknown as AudioContext;
    },
    fetchAudio: async (url) => {
      urls.push(url);
      return fetchAudio(url);
    },
    onError: () => {
      errors++;
    },
  });
  return { c, music, urls, errors: () => errors, created: () => created };
}

test("audio waits for a gesture AND a game, loads once and loops phase-aligned buffers", async () => {
  const { c, music, urls, created } = player();
  music.begin();
  assert.equal(created(), 0);
  await Promise.all([music.unlock(), music.unlock(), music.unlock()]);
  assert.equal(created(), 1);
  assert.equal(urls.length, 2);
  assert.equal(c.sources.length, 2);
  assert.deepEqual(urls, [
    "/game/audio/theme-normal.ogg",
    "/game/audio/theme-victoire.ogg",
  ]);
  assert.equal(c.sources[0].started, c.sources[1].started);
  assert.ok(
    c.sources.every((s) => s.loop && s.loopStart === 0 && s.loopEnd === 64),
  );
  assert.equal(c.gains[1].gain.value, 1);
  assert.equal(c.gains[2].gain.value, 0);
  music.end();
  assert.ok(c.sources.every((s) => s.stopped));
  music.begin();
  await music.unlock();
  assert.equal(c.decoded, 2);
  assert.equal(c.sources.length, 4);
});

test("title screen remains silent after unlocking", async () => {
  const { c, music, urls } = player();
  await music.unlock();
  assert.equal(urls.length, 0);
  assert.equal(c.sources.length, 0);
});

test("mood changes crossfade for a whole bar and interrupted transitions stay continuous", async () => {
  const { c, music } = player();
  music.begin();
  await music.unlock();
  c.currentTime = 11.2;
  music.setMood("victory");
  assert.deepEqual(c.gains[2].gain.calls.at(-1), ["ramp", 1, 14.05]);
  assert.deepEqual(c.gains[1].gain.calls.at(-1), ["ramp", 0, 14.05]);
  c.currentTime = 13.05;
  music.setMood("normal");
  const starts = c.gains[2].gain.calls.filter((x) => x[0] === "set");
  assert.ok(Math.abs(starts.at(-2)![1] - 0.5) < 0.0001);
  assert.deepEqual(c.gains[2].gain.calls.at(-1), ["ramp", 0, 16.05]);
  assert.equal(c.sources.length, 2);
});

test("mute and volume use a separate smooth gain; hiding suspends the shared clock", async () => {
  const { c, music } = player();
  music.begin();
  await music.unlock();
  music.setMuted(true);
  assert.equal(c.gains[0].gain.calls.at(-1)?.[1], 0);
  music.setVolume(0.3);
  music.setMuted(false);
  assert.equal(c.gains[0].gain.calls.at(-1)?.[1], 0.3);
  music.setVisible(false);
  assert.equal(c.state, "suspended");
  music.setVisible(true);
  await music.unlock();
  assert.equal(c.state, "running");
  assert.equal(c.sources.length, 2);
});

test("leaving before loading finishes never starts music on the title screen", async () => {
  let resolve!: (v: ArrayBuffer) => void;
  const ready = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const { c, music } = player(() => ready);
  music.begin();
  const loading = music.unlock();
  music.end();
  resolve(new ArrayBuffer(0));
  await loading;
  assert.equal(c.sources.length, 0);
});

test("audio failure reports once, leaves the game usable and can be retried", async () => {
  let failing = true;
  const { c, music, errors } = player(async () => {
    if (failing) throw new Error("offline cache missing");
    return new ArrayBuffer(0);
  });
  music.begin();
  await music.unlock();
  await music.unlock();
  assert.equal(errors(), 1);
  assert.equal(c.sources.length, 0);
  failing = false;
  await music.retry();
  assert.equal(c.sources.length, 2);
});
