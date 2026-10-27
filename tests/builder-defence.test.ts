import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  step,
  canHouse,
  type Unit,
} from "../src/engine.ts";

function frontier() {
  const s = createGame();
  s.structures = [];
  s.bridgeSites = [];
  s.stats.bridges = 0;
  for (const t of s.tiles)
    t.terrain =
      t.house !== undefined || t.castle !== undefined ? "grass" : "water";
  for (let y = 16; y <= 25; y++)
    for (let x = 18; x <= 33; x++) tile(s, x, y)!.terrain = "grass";
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 0;
  }
  for (const h of s.houses) h.timer = 0;
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 99999;
  }
  assert.ok(addHouse(s, 0, 22, 18, false));
  assert.ok(addHouse(s, 1, 30, 20, false));
  function troop(x: number, y: number, hp: number, team = 0): Unit {
    const u: Unit = {
      id: s.nextId++,
      team,
      x,
      y,
      hp,
      age: 5,
      wait: 0,
      order: team === 0 ? "auto" : "hold",
      heading: { x: 1, y: 0 },
    };
    s.units.push(u);
    return u;
  }
  const guard = troop(23, 20, 3000);
  const worker = troop(23, 22, 3000);
  const enemy = troop(25, 20, 100, 1);
  enemy.wait = 99999;
  s.kingdoms[0].gold = 1000;
  s.kingdoms[0].bridgeSaving = false;
  assert.ok(canHouse(s, worker.x, worker.y));
  return { s, guard, worker, enemy, troop };
}

test("one defender intercepts an invader while another builder founds a frontier house", () => {
  const { s, guard, worker, enemy } = frontier();
  step(s);
  assert.equal(guard.order, "defend");
  assert.equal(guard.defending, enemy.id);
  assert.ok(tile(s, worker.x, worker.y)!.house);
  assert.equal(worker.order, "auto");
  assert.ok(s.kingdoms[0].gold < 1000);
});

for (const unavailable of [
  "weak",
  "manual-hold",
  "dead",
  "unreachable",
] as const)
  test(`a ${unavailable} ally does not leave the frontier undefended`, () => {
    const { s, guard, worker, enemy } = frontier();
    if (unavailable === "weak") guard.hp = 50;
    if (unavailable === "manual-hold") {
      guard.order = "hold";
      guard.wait = 99999;
    }
    if (unavailable === "dead") guard.hp = 0;
    if (unavailable === "unreachable") {
      guard.x = 20;
      guard.order = "defend";
      guard.defending = enemy.id;
      guard.target = { x: enemy.x, y: enemy.y };
      guard.wait = 99999;
      for (let y = 16; y <= 25; y++) tile(s, 21, y)!.terrain = "water";
    }
    step(s);
    assert.equal(worker.order, "defend");
    assert.equal(worker.defending, enemy.id);
    assert.equal(tile(s, 23, 22)!.house, undefined);
  });

test("a second invader gets a defender instead of attracting everyone to the first", () => {
  const { s, guard, worker, enemy, troop } = frontier();
  const second = troop(24, 21, 100, 1);
  second.wait = 99999;
  step(s);
  assert.deepEqual(
    new Set([guard.defending, worker.defending]),
    new Set([enemy.id, second.id]),
  );
});

test("adjacent danger still interrupts building even when reinforcements are approaching", () => {
  const { s, worker, enemy } = frontier();
  enemy.x = 24;
  enemy.y = 22;
  step(s);
  assert.equal(worker.order, "defend");
  assert.equal(worker.defending, enemy.id);
});

test("redundant defenders already pursuing the same enemy resume building", () => {
  const { s, guard, worker, enemy } = frontier();
  for (const u of [guard, worker]) {
    u.order = "defend";
    u.defending = enemy.id;
    u.target = { x: enemy.x, y: enemy.y };
  }
  guard.wait = 99999;
  step(s);
  assert.equal(guard.defending, enemy.id);
  assert.equal(worker.order, "auto");
  assert.ok(tile(s, worker.x, worker.y)!.house);
});

test("a defender that has become weaker than its enemy does not prevent a stronger response", () => {
  const { s, guard, worker, enemy } = frontier();
  guard.order = "defend";
  guard.defending = enemy.id;
  guard.target = { x: enemy.x, y: enemy.y };
  guard.wait = 99999;
  enemy.hp = 4000;
  worker.hp = 6000;
  step(s);
  assert.equal(worker.order, "defend");
  assert.equal(worker.defending, enemy.id);
});
