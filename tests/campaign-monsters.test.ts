import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  LEVELS,
  step,
  tile,
  saveGame,
  loadGame,
  attackStructure,
  buildCrossing,
  type Unit,
} from "../src/engine.ts";
import { tickMonsters, attackCave } from "../src/monsters.ts";
const fighter = (x: number, y: number): Unit => ({
  id: 9000,
  team: 0,
  x,
  y,
  hp: 5000,
  age: 0,
  wait: 0,
  order: "move",
  heading: { x: 1, y: 0 },
});
test("campaign contains five distinct series of five maps of 48 × 48", () => {
  assert.equal(LEVELS.length, 25);
  for (let b = 0; b < 5; b++) {
    const levels = LEVELS.filter((l) => l.biomeId === b);
    assert.equal(levels.length, 5);
    assert.equal(new Set(levels.map((l) => l.scenario)).size, 5);
    assert.ok(levels.every((l) => l.size === 48));
  }
  assert.equal(LEVELS[24].size, 48);
});
test("terrain is asymmetric and confined starts occur; all houses and castles remain valid", () => {
  for (const level of [0, 2, 4, 5, 8, 12, 19, 24]) {
    const s = createGame(level, 14243);
    let different = 0;
    for (let i = 0; i < s.tiles.length; i++)
      if (s.tiles[i].terrain !== s.tiles[s.tiles.length - 1 - i].terrain)
        different++;
    assert.ok(different > s.tiles.length * 0.1);
    for (const k of s.kingdoms) {
      assert.equal(k.gold, 5000);
      assert.equal(s.tiles.filter((t) => t.castle === k.id).length, 9);
    }
    assert.ok(s.houses.every((h) => tile(s, h.x, h.y)?.house === h.id));
    assert.ok(loadGame(saveGame(s)));
  }
});
test("old five-level campaign saves migrate without losing map or royal position", () => {
  const s = createGame(1);
  const old = JSON.parse(saveGame(s));
  delete old.campaignVersion;
  old.kingdoms[0].wood = 55;
  old.kingdoms[0].stone = 22;
  const migrated = loadGame(JSON.stringify(old))!;
  assert.ok(migrated);
  assert.equal(migrated.level, 5);
  assert.equal(migrated.size, s.size);
  assert.deepEqual(migrated.units, s.units);
  assert.equal("wood" in migrated.kingdoms[0], false);
});
test("caves are occasional optional threats, not another taxed kingdom", () => {
  const count = LEVELS.filter((l) => l.caves).length;
  assert.ok(count > 0 && count < LEVELS.length / 2);
  assert.equal(createGame(0).caves.length, 0);
  const s = createGame(3);
  assert.ok(s.caves.length > 0 && s.monsters.length > 0);
  assert.equal(s.kingdoms.length, 4);
  assert.ok(loadGame(saveGame(s)));
});
test("monsters move and merge without losing HP to time or movement", () => {
  const s = createGame(3),
    m = s.monsters[0];
  s.caves[0].interval = 1e9;
  m.wait = 0;
  s.monsters.push({ ...m, id: s.nextId++, hp: 200, heading: { ...m.heading } });
  const before = s.monsters.reduce((n, m) => n + m.hp, 0);
  for (let i = 0; i < 200; i++) tickMonsters(s, 0.2);
  assert.equal(
    s.monsters.reduce((n, m) => n + m.hp, 0),
    before,
  );
  assert.equal(s.monsters.length, 1);
  assert.ok(s.monsters[0].hp >= 300);
});
test("closed cave enclosures keep growing monsters inside until a real opening exists", () => {
  const s = createGame(3),
    c = s.caves[0];
  for (let i = 0; i < 700; i++) tickMonsters(s, 0.2);
  assert.ok(s.monsters.reduce((n, m) => n + m.hp, 0) > 100);
  assert.ok(
    s.monsters.every(
      (m) => Math.abs(m.x - c.x) <= 4 && Math.abs(m.y - c.y) <= 4,
    ),
  );
});
test("breaking a neutral barricade releases a monster through the newly opened cell", () => {
  const s = createGame(3),
    c = s.caves[0],
    gate = s.structures.find((b) => b.team === 4)!;
  assert.ok(gate);
  const p = gate.cells[0];
  attackStructure(s, fighter(p.x + 1, p.y), gate);
  assert.equal(tile(s, p.x, p.y)!.terrain, "grass");
  const m = s.monsters[0];
  m.x = p.x - 1;
  m.y = p.y;
  m.wait = 0;
  for (const [dx, dy] of [
    [-1, 0],
    [0, -1],
    [0, 1],
  ])
    tile(s, m.x + dx, m.y + dy)!.terrain = "rock";
  tickMonsters(s, 0.2);
  assert.equal(m.x, p.x);
  assert.ok(Math.abs(m.x - c.x) > 4);
  assert.equal(m.hp, c.spawnHp);
});
test("a one-cell bridge releases monsters without costing them movement HP", () => {
  const s = createGame(8),
    c = s.caves[0],
    p = { x: c.x + 5, y: c.y };
  assert.equal(tile(s, p.x, p.y)!.terrain, "water");
  const u = fighter(p.x + 1, p.y);
  assert.ok(buildCrossing(s, u, p));
  assert.equal(s.structures.at(-1)!.cells.length, 1);
  const m = s.monsters[0];
  m.x = p.x - 1;
  m.y = p.y;
  m.wait = 0;
  for (const [dx, dy] of [
    [-1, 0],
    [0, -1],
    [0, 1],
  ])
    tile(s, m.x + dx, m.y + dy)!.terrain = "rock";
  const hp = m.hp;
  tickMonsters(s, 0.2);
  assert.equal(m.x, p.x);
  assert.equal(m.hp, hp);
});
test("destroying a cave stops births while existing monsters remain", () => {
  const s = createGame(3),
    c = s.caves[0],
    before = s.monsters.reduce((n, m) => n + m.hp, 0);
  c.timer = c.interval - 0.1;
  assert.ok(attackCave(s, fighter(c.x + 1, c.y), c));
  assert.equal(s.caves.length, 0);
  tickMonsters(s, 20);
  assert.equal(
    s.monsters.reduce((n, m) => n + m.hp, 0),
    before,
  );
  assert.equal(tile(s, c.x, c.y)!.cave, undefined);
  assert.ok(loadGame(saveGame(s)));
});
test("victory does not require clearing optional monster areas", () => {
  const s = createGame(3);
  s.kingdoms.slice(1).forEach((k) => (k.alive = false));
  step(s);
  assert.equal(s.result, "won");
  assert.ok(s.monsters.length > 0);
});
test("monsters also spend HP when destroying turf and houses", () => {
  const s = createGame(3),
    m = s.monsters[0],
    h = s.houses.find((h) => h.team === 1)!;
  s.time = 20;
  m.x = h.x - 1;
  m.y = h.y;
  m.wait = 0;
  tile(s, h.x, h.y)!.terrain = "grass";
  for (const [dx, dy] of [
    [-1, 0],
    [0, -1],
    [0, 1],
  ])
    tile(s, m.x + dx, m.y + dy)!.terrain = "rock";
  tickMonsters(s, 0.2);
  assert.ok(m.hp <= 0);
  assert.ok(!s.houses.includes(h));
});
