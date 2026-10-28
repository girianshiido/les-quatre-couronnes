import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, type State } from "../src/engine";
import { MapMusic, mapMusicMood, BIOME_MUSIC } from "../src/music";

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
  async decodeAudioData(data: ArrayBuffer) {
    this.decoded++;
    const code = data.byteLength ? new Uint8Array(data)[0] : 0;
    return { duration: [57.6, 60, 30, 36, 42, 45, 48, 40][code] ?? 57.6 };
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
async function audioFile(url: string) {
  const code = url.includes("ecran-titre")
    ? 1
    : url.includes("victoire-finale")
      ? 2
      : url.includes("ecran-defaite")
        ? 3
        : url.includes("carte-desert")
          ? 4
          : url.includes("carte-neige")
            ? 5
            : url.includes("carte-marais")
              ? 6
              : url.includes("carte-cristal")
                ? 7
                : 0;
  return new Uint8Array([code]).buffer;
}
function player(fetchAudio: (url: string) => Promise<ArrayBuffer> = audioFile) {
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
    "/game/audio/carte-foret-normal.ogg",
    "/game/audio/carte-foret-essor.ogg",
  ]);
  assert.equal(c.sources[0].started, c.sources[1].started);
  assert.ok(
    c.sources.every((s) => s.loop && s.loopStart === 0 && s.loopEnd === 57.6),
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

test("without a selected scene unlocking alone remains silent", async () => {
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
  for (const [gain, value] of [
    [2, 1],
    [1, 0],
  ]) {
    const call = c.gains[gain].gain.calls.at(-1)!;
    assert.deepEqual(call.slice(0, 2), ["ramp", value]);
    assert.ok(Math.abs(call[2]! - 13.65) < 1e-8);
  }
  c.currentTime = 12.75;
  music.setMood("normal");
  const starts = c.gains[2].gain.calls.filter((x) => x[0] === "set");
  assert.ok(Math.abs(starts.at(-2)![1] - 0.5) < 0.0001);
  assert.equal(c.gains[2].gain.calls.at(-1)![0], "ramp");
  assert.ok(Math.abs(c.gains[2].gain.calls.at(-1)![2]! - 15.45) < 1e-8);
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

test("title music starts only after a gesture, loops for 60 seconds and is not duplicated by clicks", async () => {
  const { c, music, urls, created } = player();
  music.showTitle();
  assert.equal(created(), 0);
  await Promise.all([music.unlock(), music.unlock()]);
  assert.deepEqual(urls, ["/game/audio/ecran-titre.ogg"]);
  assert.equal(c.sources.length, 1);
  assert.equal(c.sources[0].loopEnd, 60);
  music.showTitle();
  await music.unlock();
  assert.equal(c.sources.length, 1);
});

test("each result replaces map music with its distinct screen loop, without changing mute or volume", async () => {
  for (const [result, file, seconds] of [
    ["won", "victoire-finale", 30],
    ["lost", "defaite", 36],
  ] as const) {
    const { c, music, urls } = player();
    music.begin();
    await music.unlock();
    music.setVolume(0.4);
    music.setMuted(true);
    music.finish(result);
    await music.unlock();
    assert.equal(urls.at(-1), `/game/audio/ecran-${file}.ogg`);
    assert.equal(c.sources.length, 3);
    assert.equal(c.sources.at(-1)!.loopEnd, seconds);
    assert.ok(c.sources.slice(0, 2).every((s) => s.stopped));
    assert.ok(music.muted);
    assert.equal(music.volume, 0.4);
    music.setMood("victory");
    await music.unlock();
    assert.equal(c.sources.length, 3);
  }
});

test("title, game, result, title and replay select the right tracks and reuse compressed files", async () => {
  const { c, music, urls } = player();
  music.showTitle();
  await music.unlock();
  music.begin();
  await music.unlock();
  music.finish("won");
  await music.unlock();
  music.showTitle();
  await music.unlock();
  music.begin();
  await music.unlock();
  assert.deepEqual(
    c.sources.map((s) => s.loopEnd),
    [60, 57.6, 57.6, 30, 60, 57.6, 57.6],
  );
  assert.equal(urls.length, 4); // title + two map arrangements + final victory
  assert.ok(c.decoded > urls.length); // previous screens are not retained as decoded buffers
});

test("screen changes fade layers using the audio clock and schedule old sources to stop", async () => {
  const { c, music } = player();
  music.showTitle();
  await music.unlock();
  music.begin();
  await music.unlock();
  // Master, title mix, title layer, two map mixes, map layer.
  assert.deepEqual(c.gains[2].gain.calls.at(-1), ["ramp", 0, 10.4]);
  assert.deepEqual(c.gains[5].gain.calls.at(-1), ["ramp", 1, 10.4]);
  assert.equal(c.sources[1].started, c.sources[2].started);
});

test("a late title load cannot replace a result selected meanwhile", async () => {
  let resolve!: (v: ArrayBuffer) => void;
  const title = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const { c, music } = player(async (url) =>
    url.includes("titre") ? title : new Uint8Array([2]).buffer,
  );
  music.showTitle();
  const loading = music.unlock();
  music.finish("won");
  await music.unlock();
  resolve(new Uint8Array([1]).buffer);
  await loading;
  assert.equal(c.sources.length, 1);
  assert.equal(c.sources[0].loopEnd, 30);
});

test("return to title during a map load never launches stale map loops", async () => {
  let resolve!: (v: ArrayBuffer) => void;
  const map = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const { c, music } = player(async (url) =>
    url.includes("carte-") ? map : new Uint8Array([1]).buffer,
  );
  music.begin();
  const loading = music.unlock();
  music.showTitle();
  await music.unlock();
  resolve(new Uint8Array([0]).buffer);
  await loading;
  assert.equal(c.sources.length, 1);
  assert.equal(c.sources[0].loopEnd, 60);
});

test("a paused new or loaded map stays silent until explicit playback begins", async () => {
  const { c, music, urls } = player();
  music.showTitle();
  await music.unlock();
  music.prepareMap();
  await music.unlock();
  assert.equal(c.sources.length, 1);
  assert.ok(c.sources[0].stopped);
  assert.deepEqual(urls, ["/game/audio/ecran-titre.ogg"]);
  music.begin();
  await music.unlock();
  assert.deepEqual(
    c.sources.slice(1).map((s) => s.loopEnd),
    [57.6, 57.6],
  );
  music.prepareMap();
  await music.unlock();
  assert.equal(c.sources.length, 3);
  assert.ok(c.sources.every((s) => s.stopped));
});
test("a title that finishes loading after a paused map opens cannot start playing", async () => {
  let resolve!: (v: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const { c, music } = player(() => pending);
  music.showTitle();
  const loading = music.unlock();
  music.prepareMap();
  resolve(new Uint8Array([1]).buffer);
  await loading;
  assert.equal(c.sources.length, 0);
});

test("five biomes select independent paired loops with bar-aligned rising variations", async () => {
  const seen = new Set<string>();
  for (const [biome, profile] of BIOME_MUSIC.entries()) {
    const { c, music, urls, errors } = player();
    music.prepareMap(biome);
    await music.unlock();
    assert.equal(c.sources.length, 0);
    music.begin();
    await music.unlock();
    assert.equal(errors(), 0);
    assert.deepEqual(
      urls,
      profile.files.map((file) => `/game/audio/${file}.ogg`),
    );
    assert.ok(c.sources.every((s) => s.loopEnd === profile.seconds));
    const epoch = c.sources[0].started!;
    assert.equal(epoch, c.sources[1].started);
    c.currentTime = epoch + profile.barSeconds / 2;
    music.setMood("victory");
    const end = c.gains[2].gain.calls.at(-1)!;
    assert.equal(end[0], "ramp");
    assert.ok(Math.abs(end[2]! - (epoch + profile.barSeconds * 2)) < 1e-8);
    assert.equal(
      urls.length,
      2,
      "approaching victory never starts the final fanfare",
    );
    assert.equal(c.sources.length, 2, "no restart at a mood change");
    urls.forEach((u) => seen.add(u));
    music.finish("won");
    await music.unlock();
    assert.equal(urls.at(-1), "/game/audio/ecran-victoire-finale.ogg");
    assert.equal(c.sources.at(-1)!.loopEnd, 30);
  }
  assert.equal(seen.size, 10);
});

test("changing biome replaces decoded map buffers and reuses only matching compressed files", async () => {
  const { c, music, urls, errors } = player();
  music.begin(0);
  await music.unlock();
  music.begin(1);
  await music.unlock();
  music.begin(2);
  await music.unlock();
  music.begin(0);
  await music.unlock();
  assert.equal(errors(), 0);
  assert.deepEqual(
    c.sources.map((s) => s.loopEnd),
    [57.6, 57.6, 42, 42, 45, 45, 57.6, 57.6],
  );
  assert.equal(urls.length, 6);
  assert.equal(c.decoded, 8);
});

test("a slow earlier biome cannot replace the current map soundtrack", async () => {
  let resolve!: (v: ArrayBuffer) => void;
  const forest = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const { c, music, errors } = player((url) =>
    url.includes("foret") ? forest : audioFile(url),
  );
  music.begin(0);
  const loading = music.unlock();
  music.prepareMap(3);
  music.begin();
  await music.unlock();
  resolve(new Uint8Array([0]).buffer);
  await loading;
  assert.equal(errors(), 0);
  assert.deepEqual(
    c.sources.map((s) => s.loopEnd),
    [48, 48],
  );
});
