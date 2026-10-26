import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  step,
  saveGame,
  loadGame,
  type Unit,
} from "../src/engine.ts";
function scenario(team = 3) {
  const s = createGame();
  s.time = 100;
  for (const t of s.tiles) {
    t.terrain = "water";
    if (t.castle === 0) delete t.castle;
  }
  for (const h of s.houses.filter((h) => h.team === 0))
    delete tile(s, h.x, h.y)!.house;
  s.houses = s.houses.filter((h) => h.team !== 0);
  for (let y = 18; y <= 23; y++)
    for (let x = 9; x <= 26; x++) tile(s, x, y)!.terrain = "grass";
  const king = s.units.find((u) => u.team === 0 && u.royal)!;
  king.x = 17;
  king.y = 20;
  king.reserve = 60000;
  king.hp = 60000;
  s.kingdoms[0].castle = { x: 17, y: 20 };
  for (let y = 19; y <= 21; y++)
    for (let x = 16; x <= 18; x++) tile(s, x, y)!.castle = 0;
  for (const x of [10, 12, 14, 20, 22, 24])
    assert.ok(addHouse(s, 0, x, 20, false));
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 30;
    k.gold = 100000;
  }
  for (const h of s.houses) h.timer = 0;
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
  tile(s, 40, 40)!.terrain = "grass";
  const survivor: Unit = {
    id: s.nextId++,
    team: 0,
    hp: 100,
    x: 40,
    y: 40,
    order: "hold",
    age: 0,
    wait: 999,
    heading: { x: 0, y: 1 },
  };
  const raider: Unit = {
    id: s.nextId++,
    team,
    hp: 57400,
    x: 9,
    y: 20,
    order: "auto",
    age: 10,
    wait: 0,
    heading: { x: 1, y: 0 },
  };
  s.units.push(survivor, raider);
  return { s, king, raider };
}
function advance(s: ReturnType<typeof createGame>, seconds: number) {
  for (let i = 0; i < seconds * 5; i++) step(s);
}
for (const team of [1, 2, 3])
  test(`a 57400 HP army of kingdom ${team} razes successive houses instead of orbiting a castle`, () => {
    const { s, king, raider } = scenario(team);
    const own = s.houses.filter((h) => h.team === team).length;
    s.kingdoms[team].gold = 0;
    step(s);
    assert.equal(raider.order, "raid");
    assert.deepEqual(raider.target, { x: 10, y: 20 });
    advance(s, 35);
    assert.equal(s.houses.filter((h) => h.team === 0).length, 0);
    assert.equal(s.houses.filter((h) => h.team === team).length, own);
    assert.ok(raider.hp > 0 && raider.hp < 20000);
    assert.equal(king.hp, 0);
    assert.equal(s.kingdoms[0].alive, false);
    assert.equal(s.ruins.length, 1);
  });
test("a raid continues after save/load and retargets a house destroyed by another troop", () => {
  const { s, raider } = scenario();
  s.kingdoms[raider.team].gold = 0;
  raider.hp = 2000;
  step(s);
  for (let i = 0; i < 10; i++) {
    if (
      raider.target &&
      tile(s, raider.target.x, raider.target.y)?.house !== undefined
    )
      break;
    step(s);
  }
  const loaded = loadGame(saveGame(s));
  assert.ok(loaded);
  assert.equal(loaded.units.find((u) => u.id === raider.id)!.order, "raid");
  const goal = loaded.units.find((u) => u.id === raider.id)!.target!;
  const target = loaded.houses.find((h) => h.x === goal.x && h.y === goal.y)!;
  loaded.houses = loaded.houses.filter((h) => h.id !== target.id);
  delete tile(loaded, target.x, target.y)!.house;
  advance(loaded, 4);
  assert.ok(loaded.houses.filter((h) => h.team === 0).length < 5);
  assert.ok(loaded.units.find((u) => u.id === raider.id)!.hp > 0);
});
test("a raider crosses a shared bridge and destroys houses without gold while preserving the bridge", () => {
  const { s, raider } = scenario();
  for (const t of s.tiles) {
    if (t.castle === undefined) t.terrain = "water";
  }
  for (let x = 9; x <= 14; x++) tile(s, x, 20)!.terrain = "grass";
  tile(s, 11, 20)!.terrain = "bridge";
  s.structures.push({
    id: s.nextId++,
    kind: "bridge",
    team: 0,
    hp: 1000,
    maxHp: 1000,
    cells: [{ x: 11, y: 20 }],
  });
  s.kingdoms[raider.team].gold = 0;
  advance(s, 5);
  assert.equal(tile(s, 12, 20)!.house, undefined);
  assert.equal(tile(s, 14, 20)!.house, undefined);
  assert.equal(tile(s, 11, 20)!.terrain, "bridge");
  assert.equal(s.structures[0].hp, 1000);
});
test("a closed river really blocks raiding until a passage opens", () => {
  const { s, raider } = scenario();
  for (let y = 0; y < s.size; y++) tile(s, 11, y)!.terrain = "water";
  s.kingdoms[raider.team].gold = 0;
  advance(s, 3);
  assert.ok(tile(s, 12, 20)!.house);
  tile(s, 11, 20)!.terrain = "bridge";
  s.structures.push({
    id: s.nextId++,
    kind: "bridge",
    team: 0,
    hp: 1000,
    maxHp: 1000,
    cells: [{ x: 11, y: 20 }],
  });
  s.stats.bridges++;
  advance(s, 7);
  assert.equal(tile(s, 12, 20)!.house, undefined);
});
test("an urgent invasion at home interrupts a raid, while a far border skirmish does not", () => {
  const { s, raider } = scenario();
  s.kingdoms[raider.team].gold = 0;
  step(s);
  for (let y = 23; y <= 30; y++) tile(s, 9, y)!.terrain = "grass";
  for (let x = 9; x <= 21; x++) tile(s, x, 30)!.terrain = "grass";
  assert.ok(addHouse(s, raider.team, 20, 30, false));
  s.units.push({
    id: s.nextId++,
    team: 0,
    hp: 100,
    x: 21,
    y: 30,
    age: 0,
    wait: 999,
    order: "hold",
    heading: { x: 0, y: 1 },
  });
  raider.wait = 0;
  step(s);
  assert.equal(raider.order, "raid");
  const c = s.kingdoms[raider.team].castle;
  for (let y = 18; y <= c.y + 2; y++) tile(s, 9, y)!.terrain = "grass";
  for (let x = 9; x <= c.x + 2; x++) tile(s, x, c.y + 2)!.terrain = "grass";
  const invader: Unit = {
    id: s.nextId++,
    team: 0,
    hp: 2500,
    x: c.x + 2,
    y: c.y + 2,
    age: 0,
    wait: 999,
    order: "hold",
    heading: { x: 0, y: 1 },
  };
  s.units.push(invader);
  raider.wait = 0;
  step(s);
  assert.equal(raider.order, "defend");
  assert.equal(raider.defending, invader.id);
});

test("a well-funded large army occupies nearby free land before raiding and survives many foundations", () => {
  const { s, raider, king } = scenario();
  const own = s.houses.filter((h) => h.team === raider.team).length;
  step(s);
  assert.equal(raider.order, "raid");
  assert.equal(tile(s, raider.target!.x, raider.target!.y)!.house, undefined);
  advance(s, 12);
  assert.ok(s.houses.filter((h) => h.team === raider.team).length >= own + 4);
  assert.ok(raider.hp > 20000);
  // This small kingdom may now collapse after losing its last house or king.
  assert.ok(king.hp <= 600);
});
test("an overwhelming local advantage permits an immediate royal capture", () => {
  const { s, king, raider } = scenario();
  king.reserve = 100;
  king.hp = 125;
  s.kingdoms[0].fortification = 2000;
  raider.x = 15;
  raider.y = 20;
  step(s);
  assert.equal(raider.order, "attack");
  assert.equal(raider.pursue, king.id);
  advance(s, 2);
  assert.equal(s.kingdoms[0].alive, false);
  assert.ok(s.houses.filter((h) => h.team === raider.team).length >= 8);
});
test("a strong king is bypassed rather than attacked merely because it is nearby", () => {
  const { s, king, raider } = scenario();
  raider.x = 15;
  raider.y = 20;
  raider.hp = 2000;
  step(s);
  assert.notEqual(raider.order, "attack");
  advance(s, 5);
  assert.ok(s.kingdoms[0].alive && king.hp <= 600);
});

test("a nearby king across a closed river does not trigger a supposedly immediate assault", () => {
  const { s, king, raider } = scenario();
  king.reserve = 100;
  king.hp = 125;
  s.kingdoms[0].fortification = 2000;
  raider.x = 15;
  raider.y = 20;
  for (let y = 19; y <= 21; y++) tile(s, 16, y)!.terrain = "water";
  step(s);
  assert.notEqual(raider.order, "attack");
  assert.ok(s.kingdoms[0].alive);
});
