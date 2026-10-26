import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, saveGame } from "../src/engine.ts";
import { SaveLibrary, type SaveBackend, type SaveEntry } from "../src/saves.ts";
class MemoryBackend implements SaveBackend {
  entries = new Map<string, SaveEntry>();
  data = new Map<string, string>();
  fail = false;
  async list() {
    return structuredClone([...this.entries.values()]);
  }
  async metadata(id: string) {
    const e = this.entries.get(id);
    return e ? structuredClone(e) : undefined;
  }
  async read(id: string) {
    return this.data.get(id);
  }
  async put(entry: SaveEntry, data: string) {
    if (this.fail) throw Error("storage full");
    this.entries.set(entry.id, structuredClone(entry));
    this.data.set(entry.id, data);
  }
  async rename(id: string, name: string) {
    if (this.fail) throw Error("storage full");
    const e = this.entries.get(id);
    if (e) e.name = name;
  }
  async remove(id: string) {
    this.entries.delete(id);
    this.data.delete(id);
  }
}
function library() {
  const backend = new MemoryBackend();
  return { backend, lib: new SaveLibrary(backend) };
}
test("named saves keep independent maps and states, including duplicate names", async () => {
  const { lib } = library(),
    s = createGame();
  const a = await lib.create(s, "Plan A");
  s.kingdoms[0].gold = 1234;
  s.time = 45;
  const b = await lib.create(s, "Plan A");
  assert.notEqual(a.id, b.id);
  assert.equal((await lib.list()).length, 2);
  assert.equal((await lib.load(a.id))!.kingdoms[0].gold, 5000);
  assert.equal((await lib.load(b.id))!.kingdoms[0].gold, 1234);
  assert.equal((await lib.load(b.id))!.time, 45);
  assert.deepEqual((await lib.load(a.id))!.structures, createGame().structures);
});
test("each run has a separate autosave, and autosaves never overwrite named copies", async () => {
  const { lib } = library(),
    s = createGame();
  const manual = await lib.create(s, "Avant la guerre");
  await lib.automatic("auto-first", s);
  s.time = 120;
  s.kingdoms[0].gold = 500;
  await lib.automatic("auto-first", s);
  await lib.automatic("auto-second", createGame(1));
  assert.equal((await lib.list()).length, 3);
  assert.equal((await lib.load(manual.id))!.time, 0);
  assert.equal((await lib.load("auto-first"))!.time, 120);
  assert.equal((await lib.load("auto-second"))!.level, 1);
  await assert.rejects(lib.automatic(manual.id, s));
});
test("queued writes capture a snapshot at the call rather than a later mutated game", async () => {
  const { lib } = library(),
    s = createGame();
  const first = lib.create(s, "Départ");
  s.time = 50;
  const second = lib.automatic("auto-run", s);
  s.time = 100;
  const third = lib.automatic("auto-run", s);
  s.time = 200;
  const entry = await first;
  await second;
  await third;
  assert.equal((await lib.load(entry.id))!.time, 0);
  assert.equal((await lib.load("auto-run"))!.time, 100);
  assert.equal(
    (await lib.list()).find((e) => e.id === "auto-run")!.seconds,
    100,
  );
});
test("the library supports many slots without a fixed slot limit", async () => {
  const { lib } = library(),
    s = createGame();
  const ids = [];
  for (let i = 0; i < 100; i++) {
    s.time = i;
    ids.push((await lib.create(s, `Étape ${i}`)).id);
  }
  assert.equal((await lib.list()).length, 100);
  assert.equal((await lib.load(ids[0]))!.time, 0);
  assert.equal((await lib.load(ids[99]))!.time, 99);
});
test("rename and removal affect only the selected entry and preserve renamed autosave titles", async () => {
  const { lib } = library(),
    s = createGame();
  const a = await lib.create(s, "A"),
    b = await lib.create(s, "B");
  await lib.rename(a.id, "Nouvelle stratégie");
  assert.equal(
    (await lib.list()).find((e) => e.id === a.id)!.name,
    "Nouvelle stratégie",
  );
  await lib.automatic("auto-run", s);
  await lib.rename("auto-run", "Mon royaume");
  await lib.automatic("auto-run", s);
  assert.equal(
    (await lib.list()).find((e) => e.id === "auto-run")!.name,
    "Mon royaume",
  );
  await lib.remove(a.id);
  assert.equal(await lib.load(a.id), undefined);
  assert.ok(await lib.load(b.id));
  await assert.rejects(lib.rename(b.id, "  "));
});
test("the former single save migrates once without changing its map or losing valid legacy fields", async () => {
  const { lib } = library(),
    raw = JSON.parse(saveGame(createGame()));
  delete raw.doctrine;
  const source = JSON.stringify(raw);
  assert.equal(await lib.migrateLegacy(source), true);
  assert.equal(await lib.migrateLegacy(source), true);
  const entries = await lib.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "manual");
  assert.equal(entries[0].name, "Ancienne sauvegarde");
  const loaded = await lib.load(entries[0].id);
  assert.deepEqual(loaded!.tiles, raw.tiles);
  assert.equal(loaded!.doctrine, "builder");
  assert.equal(await lib.migrateLegacy("bad"), false);
  assert.equal((await lib.list()).length, 1);
});
test("a storage failure keeps older saves and does not poison subsequent writes", async () => {
  const { lib, backend } = library(),
    s = createGame();
  await lib.automatic("auto-run", s);
  backend.fail = true;
  s.time = 100;
  await assert.rejects(lib.automatic("auto-run", s));
  await assert.rejects(lib.create(s, "Échec"));
  assert.equal((await lib.load("auto-run"))!.time, 0);
  assert.equal((await lib.list()).length, 1);
  backend.fail = false;
  await lib.automatic("auto-run", s);
  assert.equal((await lib.load("auto-run"))!.time, 100);
});
test("a newer synchronous closing checkpoint restores its own run without overwriting other runs", async () => {
  const { lib, backend } = library(),
    s = createGame();
  await lib.automatic("auto-run", s);
  await lib.automatic("auto-other", s);
  const updated = backend.entries.get("auto-run")!.updatedAt;
  s.time = 42;
  const c = JSON.parse(lib.checkpoint("auto-run", s));
  c.savedAt = updated + 1000;
  assert.equal(await lib.restoreCheckpoint(JSON.stringify(c)), true);
  assert.equal((await lib.load("auto-run"))!.time, 42);
  assert.equal((await lib.load("auto-other"))!.time, 0);
  c.savedAt = updated - 1000;
  c.data = saveGame(createGame());
  await lib.restoreCheckpoint(JSON.stringify(c));
  assert.equal((await lib.load("auto-run"))!.time, 42);
});
test("malformed checkpoints cannot overwrite saved games", async () => {
  const { lib } = library(),
    s = createGame();
  await lib.automatic("auto-run", s);
  for (const raw of [
    "bad",
    JSON.stringify({ id: "manual-x", savedAt: Date.now(), data: saveGame(s) }),
    JSON.stringify({ id: "auto-run", savedAt: Date.now(), data: "bad" }),
    JSON.stringify({ id: "auto-run", savedAt: -1, data: saveGame(s) }),
  ]) {
    assert.equal(await lib.restoreCheckpoint(raw), false);
  }
  assert.equal((await lib.load("auto-run"))!.time, 0);
});
