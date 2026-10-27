import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  command,
  step,
  spawn,
  saveGame,
  loadGame,
  refreshKings,
  type Unit,
  type State,
} from "../src/engine.ts";
function prepare() {
  const s = createGame();
  for (const k of s.kingdoms) {
    k.tax = 0;
    k.automatic = false;
    k.gold = 5000;
  }
  for (const h of s.houses) h.timer = 0;
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 9999;
  }
  return s;
}
function person(s: State, team: number, x: number, y: number, hp = 100): Unit {
  const u: Unit = {
    id: s.nextId++,
    team,
    x,
    y,
    hp,
    age: 0,
    wait: 9999,
    order: "hold",
    heading: { x: 0, y: 1 },
  };
  s.units.push(u);
  return u;
}
function noStacks(s: State) {
  const keys = s.units
    .filter((u) => u.hp > 0)
    .map((u) => `${u.team}:${u.x}:${u.y}`);
  assert.equal(new Set(keys).size, keys.length);
}
for (let team = 0; team < 4; team++)
  test(`faction ${team}: stationary units sharing a house always fuse`, () => {
    const s = prepare(),
      h = s.houses.find((h) => h.team === team)!;
    person(s, team, h.x, h.y, 100);
    person(s, team, h.x, h.y, 200);
    person(s, team, h.x, h.y, 300);
    step(s, 0);
    const residents = s.units.filter(
      (u) => u.team === team && u.x === h.x && u.y === h.y,
    );
    assert.equal(residents.length, 1);
    assert.equal(residents[0].hp, 600);
    assert.equal(s.stats.merged, 2);
    noStacks(s);
  });
test("shelter orders merge the entire arriving group on its destination house", () => {
  const s = prepare(),
    h = s.houses.find((h) => h.team === 0)!;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      tile(s, h.x + dx, h.y + dy)!.terrain = "grass";
  const a = person(s, 0, h.x - 2, h.y),
    b = person(s, 0, h.x + 2, h.y);
  command(s, [a.id, b.id], "shelter", h);
  for (let i = 0; i < 15; i++) {
    step(s);
    noStacks(s);
  }
  const units = s.units.filter((u) => u.id === a.id || u.id === b.id);
  assert.equal(units.length, 1);
  assert.equal(units[0].x, h.x);
  assert.equal(units[0].y, h.y);
  assert.equal(units[0].order, "shelter");
  assert.ok(units[0].hp > 190);
});
test("a newborn still contributes exactly 100 HP when it immediately merges with a stationed ally", () => {
  const s = prepare(),
    h = s.houses.find((h) => h.team === 0)!;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    tile(s, h.x + dx, h.y + dy)!.terrain = "water";
  tile(s, h.x + 1, h.y)!.terrain = "grass";
  const resident = person(s, 0, h.x + 1, h.y, 200);
  spawn(s, h);
  noStacks(s);
  const one = s.units.filter(
    (u) => u.team === 0 && u.x === resident.x && u.y === resident.y,
  );
  assert.equal(one.length, 1);
  assert.equal(one[0].hp, 300);
  assert.equal(s.kingdoms[0].births, 1);
});
test("a stacked royal absorbs its allies and stays the only unit in its cell", () => {
  const s = prepare(),
    king = s.units.find((u) => u.royal && u.team === 0)!;
  const reserve = king.reserve!;
  person(s, 0, king.x, king.y, 200);
  person(s, 0, king.x, king.y, 300);
  step(s);
  noStacks(s);
  assert.equal(king.reserve, reserve + 500 * 1.25);
  assert.ok(s.units.includes(king));
  assert.equal(
    s.units.filter((u) => u.team === 0 && u.x === king.x && u.y === king.y)
      .length,
    1,
  );
});
test("loading an older stacked save merges allied residents without losing their HP", () => {
  const s = prepare(),
    h = s.houses.find((h) => h.team === 0)!;
  person(s, 0, h.x, h.y, 100);
  person(s, 0, h.x, h.y, 250);
  const loaded = loadGame(saveGame(s))!;
  assert.ok(loaded);
  noStacks(loaded);
  const at = loaded.units.filter(
    (u) => u.team === 0 && u.x === h.x && u.y === h.y,
  );
  assert.equal(at.length, 1);
  assert.equal(at[0].hp, 350);
});
