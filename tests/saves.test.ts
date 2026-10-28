import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, saveGame, loadGame } from "../src/engine.ts";
import {
  SaveLibrary,
  AUTO_SAVE_ID,
  type SaveBackend,
  type SaveEntry,
  type SaveRecord,
  type AutomaticMode,
} from "../src/saves.ts";
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
  async updateAutomatic(
    candidate?: SaveRecord,
    mode: AutomaticMode = "replace",
  ) {
    if (this.fail) throw Error("storage full");
    const current = this.entries.get(AUTO_SAVE_ID);
    if (current && current.kind !== "auto") throw Error("protected copy");
    const old = [...this.entries.values()].filter((e) => e.kind === "auto");
    const choices = old.map((entry) => ({
      entry,
      data: this.data.get(entry.id),
      incoming: false,
    }));
    if (candidate) choices.push({ ...candidate, incoming: true });
    choices.sort(
      (a, b) =>
        (mode === "fallback" ? Number(a.incoming) - Number(b.incoming) : 0) ||
        b.entry.updatedAt - a.entry.updatedAt ||
        (a.incoming !== b.incoming
          ? a.incoming === (mode === "replace")
            ? -1
            : 1
          : a.entry.id.localeCompare(b.entry.id)),
    );
    const chosen = choices.find((c) => c.data && loadGame(c.data));
    if (!chosen) return undefined;
    const entry: SaveEntry = {
      ...chosen.entry,
      id: AUTO_SAVE_ID,
      kind: "auto",
      name: "Reprise automatique",
      createdAt: current?.createdAt ?? chosen.entry.createdAt,
    };
    for (const e of old) {
      this.entries.delete(e.id);
      this.data.delete(e.id);
    }
    this.entries.set(AUTO_SAVE_ID, structuredClone(entry));
    this.data.set(AUTO_SAVE_ID, chosen.data!);
    return structuredClone(entry);
  }
  async rename(id: string, name: string) {
    if (this.fail) throw Error("storage full");
    const e = this.entries.get(id);
    if (e) e.name = name;
  }
  async removeMany(ids: string[]) {
    if (this.fail) throw Error("storage unavailable");
    for (const id of ids) await this.remove(id);
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
async function seed(
  backend: MemoryBackend,
  id: string,
  kind: SaveEntry["kind"],
  updatedAt: number,
  level = 0,
  seconds = 0,
) {
  const state = createGame(level);
  state.time = seconds;
  const data = saveGame(state);
  await backend.put(
    {
      id,
      name: id,
      kind,
      createdAt: updatedAt,
      updatedAt,
      level,
      seconds,
      units: 0,
      houses: state.houses.length,
    },
    data,
  );
  return data;
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
});
test("one autosave follows every level and restart without changing named copies", async () => {
  const { lib } = library(),
    s = createGame();
  const manual = await lib.create(s, "Avant la guerre");
  await lib.automatic(s);
  s.time = 120;
  await lib.automatic(s);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 120);
  for (let level = 1; level < 25; level++)
    await lib.automatic(createGame(level));
  const entries = await lib.list();
  assert.equal(entries.length, 2);
  assert.equal(entries.filter((e) => e.kind === "auto").length, 1);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.level, 24);
  assert.equal((await lib.load(manual.id))!.time, 0);
  await lib.automatic(createGame());
  assert.equal((await lib.list()).length, 2);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.level, 0);
});
test("queued writes capture snapshots, and loading a manual copy continues in the one automatic slot", async () => {
  const { lib } = library(),
    s = createGame();
  const first = lib.create(s, "Départ");
  s.time = 50;
  const second = lib.automatic(s);
  s.time = 100;
  const third = lib.automatic(s);
  s.time = 200;
  const manual = await first;
  await second;
  await third;
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 100);
  const replay = (await lib.load(manual.id))!;
  replay.time = 10;
  await lib.automatic(replay);
  assert.equal((await lib.list()).length, 2);
  assert.equal((await lib.load(manual.id))!.time, 0);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 10);
});
test("manual slots remain unlimited and rename/removal affect only the chosen copy", async () => {
  const { lib } = library(),
    s = createGame(),
    ids: string[] = [];
  for (let i = 0; i < 100; i++) {
    s.time = i;
    ids.push((await lib.create(s, `Étape ${i}`)).id);
  }
  await lib.automatic(s);
  await lib.rename(ids[0], "Nouvelle stratégie");
  await lib.remove(ids[1]);
  assert.equal((await lib.list()).length, 100);
  assert.equal(
    (await lib.list()).find((e) => e.id === ids[0])!.name,
    "Nouvelle stratégie",
  );
  assert.equal((await lib.load(ids[0]))!.time, 0);
  assert.equal((await lib.load(ids[99]))!.time, 99);
  assert.equal(await lib.load(ids[1]), undefined);
  await assert.rejects(lib.rename(ids[0], "  "));
});
test("68 old automatic slots collapse to the most recently saved valid state, preserving all manual bytes", async () => {
  const { lib, backend } = library();
  const manual = await seed(
    backend,
    "auto-looking-manual",
    "manual",
    10000,
    1,
    123,
  );
  const other = await seed(backend, "manual-two", "manual", 5, 2, 77);
  for (let i = 0; i < 68; i++)
    await seed(
      backend,
      `auto-old-${i}`,
      "auto",
      100 + i,
      i % 25,
      i === 67 ? 12 : 900,
    );
  const expected = backend.data.get("auto-old-67");
  await lib.consolidateAutomatic();
  assert.equal((await lib.list()).length, 3);
  assert.equal(backend.data.get(AUTO_SAVE_ID), expected);
  assert.equal(
    (await lib.load(AUTO_SAVE_ID))!.time,
    12,
    "use save date, not furthest simulation time",
  );
  assert.equal(backend.data.get("auto-looking-manual"), manual);
  assert.equal(backend.data.get("manual-two"), other);
  assert.equal(backend.data.size, 3);
  await lib.consolidateAutomatic();
  assert.equal(backend.data.size, 3);
});
test("migration skips a corrupt or missing latest automatic file rather than losing the usable state", async () => {
  const { lib, backend } = library();
  const good = await seed(backend, "auto-good", "auto", 1, 3, 100);
  await seed(backend, "auto-corrupt", "auto", 3);
  backend.data.set("auto-corrupt", "bad");
  await seed(backend, "auto-missing", "auto", 4);
  backend.data.delete("auto-missing");
  await lib.consolidateAutomatic();
  assert.equal(backend.data.get(AUTO_SAVE_ID), good);
  assert.equal((await lib.list()).length, 1);
});
test("if all old automatic files are unreadable migration leaves them intact until a valid new recovery exists", async () => {
  const { lib, backend } = library();
  await seed(backend, "auto-bad", "auto", 1);
  backend.data.set("auto-bad", "bad");
  assert.equal(await lib.consolidateAutomatic(), undefined);
  assert.equal(backend.data.get("auto-bad"), "bad");
  await lib.automatic(createGame());
  assert.equal((await lib.list()).length, 1);
  assert.ok(await lib.load(AUTO_SAVE_ID));
});
test("failed consolidation leaves every file intact and can be retried", async () => {
  const { lib, backend } = library();
  await seed(backend, "auto-a", "auto", 1);
  await seed(backend, "auto-b", "auto", 2, 2, 88);
  const before = structuredClone([...backend.data]);
  backend.fail = true;
  await assert.rejects(lib.consolidateAutomatic());
  assert.deepEqual([...backend.data], before);
  backend.fail = false;
  await lib.consolidateAutomatic();
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 88);
});
test("a storage failure preserves the recovery and does not poison later writes", async () => {
  const { lib, backend } = library(),
    s = createGame();
  await lib.automatic(s);
  backend.fail = true;
  s.time = 100;
  await assert.rejects(lib.automatic(s));
  await assert.rejects(lib.create(s, "Échec"));
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 0);
  backend.fail = false;
  await lib.automatic(s);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 100);
  assert.equal((await lib.list()).length, 1);
});
test("old single-slot migration is a recovery fallback, not an unsolicited manual copy", async () => {
  const { lib } = library(),
    raw = JSON.parse(saveGame(createGame()));
  delete raw.doctrine;
  const source = JSON.stringify(raw);
  assert.equal(await lib.migrateLegacy(source), true);
  assert.equal(await lib.migrateLegacy(source), true);
  const entries = await lib.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, AUTO_SAVE_ID);
  assert.equal(entries[0].kind, "auto");
  assert.deepEqual((await lib.load(AUTO_SAVE_ID))!.tiles, raw.tiles);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.doctrine, "builder");
  const newer = createGame(1);
  await lib.automatic(newer);
  await lib.migrateLegacy(source);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.level, 1);
  assert.equal(await lib.migrateLegacy("bad"), false);
});
test("closing checkpoint from an old run ID updates the singleton only when newer than every existing autosave", async () => {
  const { lib, backend } = library();
  await seed(backend, "auto-old-a", "auto", 100, 0, 1);
  await seed(backend, "auto-old-b", "auto", 200, 1, 2);
  const s = createGame(2);
  s.time = 42;
  const c = JSON.parse(lib.checkpoint(s));
  assert.equal(c.id, AUTO_SAVE_ID);
  c.id = "auto-old-a";
  c.savedAt = 300;
  assert.equal(await lib.restoreCheckpoint(JSON.stringify(c)), true);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 42);
  assert.equal((await lib.list()).length, 1);
  c.savedAt = 200;
  c.data = saveGame(createGame());
  await lib.restoreCheckpoint(JSON.stringify(c));
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 42);
  c.savedAt = 300;
  await lib.restoreCheckpoint(JSON.stringify(c));
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 42);
});
test("an older checkpoint cannot replace the latest old-format run, and a recovered checkpoint beats legacy fallback", async () => {
  const { lib, backend } = library();
  await seed(backend, "auto-old", "auto", 200, 4, 88);
  const c = JSON.parse(lib.checkpoint(createGame()));
  c.savedAt = 100;
  await lib.restoreCheckpoint(JSON.stringify(c));
  assert.equal((await lib.load(AUTO_SAVE_ID))!.level, 4);
  c.savedAt = 300;
  c.data = saveGame(createGame(5));
  await lib.restoreCheckpoint(JSON.stringify(c));
  await lib.migrateLegacy(saveGame(createGame()));
  assert.equal((await lib.load(AUTO_SAVE_ID))!.level, 5);
});
test("malformed checkpoints cannot overwrite saved games", async () => {
  const { lib } = library(),
    s = createGame();
  await lib.automatic(s);
  for (const raw of [
    "bad",
    JSON.stringify({ id: "manual-x", savedAt: Date.now(), data: saveGame(s) }),
    JSON.stringify({ id: AUTO_SAVE_ID, savedAt: Date.now(), data: "bad" }),
    JSON.stringify({ id: AUTO_SAVE_ID, savedAt: -1, data: saveGame(s) }),
  ])
    assert.equal(await lib.restoreCheckpoint(raw), false);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 0);
});
test("two library instances share the same recovery rather than creating independent runs", async () => {
  const backend = new MemoryBackend(),
    a = new SaveLibrary(backend),
    b = new SaveLibrary(backend);
  const s = createGame();
  s.time = 50;
  await Promise.all([a.automatic(s), b.consolidateAutomatic()]);
  const next = createGame(1);
  await b.automatic(next);
  await a.consolidateAutomatic();
  assert.equal((await a.list()).length, 1);
  assert.equal((await a.load(AUTO_SAVE_ID))!.level, 1);
});
test("a manual file occupying the reserved ID is protected rather than overwritten", async () => {
  const { lib, backend } = library();
  const data = await seed(backend, AUTO_SAVE_ID, "manual", 1);
  await assert.rejects(lib.automatic(createGame(1)));
  await assert.rejects(lib.consolidateAutomatic());
  assert.equal(backend.data.get(AUTO_SAVE_ID), data);
});
test("bulk deletion preserves unselected copies and protects the current automatic recovery", async () => {
  const { lib } = library(),
    s = createGame();
  const a = await lib.create(s, "A"),
    b = await lib.create(s, "B"),
    c = await lib.create(s, "C");
  await lib.automatic(s);
  await assert.rejects(lib.removeMany([a.id, AUTO_SAVE_ID], AUTO_SAVE_ID));
  assert.ok(await lib.load(a.id));
  await lib.removeMany([a.id, b.id, a.id], AUTO_SAVE_ID);
  assert.equal(await lib.load(a.id), undefined);
  assert.equal(await lib.load(b.id), undefined);
  assert.ok(await lib.load(c.id));
  assert.ok(await lib.load(AUTO_SAVE_ID));
});
test("failed bulk deletion leaves copies intact and the library can retry", async () => {
  const { lib, backend } = library(),
    s = createGame();
  const a = await lib.create(s, "A"),
    b = await lib.create(s, "B");
  backend.fail = true;
  await assert.rejects(lib.removeMany([a.id, b.id]));
  assert.ok(await lib.load(a.id));
  assert.ok(await lib.load(b.id));
  backend.fail = false;
  await lib.removeMany([a.id, b.id]);
  assert.equal((await lib.list()).length, 0);
});

test("the old single-slot fallback is retained when modern automatic files are all corrupt", async () => {
  const { lib, backend } = library();
  await seed(backend, "auto-corrupt", "auto", Date.now() + 10000);
  backend.data.set("auto-corrupt", "bad");
  const s = createGame(2);
  s.time = 123;
  await lib.migrateLegacy(saveGame(s));
  assert.equal((await lib.list()).length, 1);
  assert.equal((await lib.load(AUTO_SAVE_ID))!.time, 123);
});
