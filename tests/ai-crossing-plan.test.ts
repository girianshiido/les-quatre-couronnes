import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  step,
  planAiCrossing,
  saveGame,
  loadGame,
  type Unit,
  type State,
} from "../src/engine.ts";
function river() {
  const s = createGame(1);
  s.time = 70;
  s.structures = [];
  s.bridgeSites = [];
  s.caves = [];
  s.monsters = [];
  s.stats.bridges = 0;
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const t = tile(s, x, y)!;
      delete t.permanent;
      delete t.castle;
      delete t.cave;
      t.terrain = x >= 22 && x <= 24 ? "water" : "grass";
    }
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 0;
    k.castle = { x: k.id === 1 ? 36 : 10, y: 8 + k.id * 9 };
    const king = s.units.find((u) => u.team === k.id && u.royal)!;
    king.x = k.castle.x;
    king.y = k.castle.y;
    king.order = "hold";
    king.wait = 9999;
  }
  for (const h of s.houses) h.timer = 0;
  const u: Unit = {
    id: s.nextId++,
    team: 1,
    x: 30,
    y: 17,
    hp: 7000,
    age: 10,
    wait: 0,
    order: "auto",
    heading: { x: -1, y: 0 },
  };
  s.units.push(u);
  s.kingdoms[1].gold = 5000;
  return { s, u };
}
test("AI plans exactly three aligned cells to cross a three-cell river", () => {
  const { s } = river();
  const p = planAiCrossing(s, 1)!;
  assert.equal(p.length, 3);
  assert.deepEqual(
    p.map((p) => p.x),
    [24, 23, 22],
  );
  assert.equal(new Set(p.map((p) => p.y)).size, 1);
});
test("AI finishes a shared three-cell crossing without building parallel starts", () => {
  const { s } = river();
  for (let i = 0; i < 200; i++) step(s);
  const bridges = s.structures.filter(
    (b) => b.team === 1 && b.kind === "bridge",
  );
  assert.equal(bridges.length, 3);
  assert.ok(bridges.every((b) => b.cells.length === 1 && !b.construction));
  assert.equal(new Set(bridges.map((b) => b.cells[0].y)).size, 1);
});
test("a saved crossing plan survives loading and a dead builder is replaced", () => {
  let { s, u } = river();
  for (let i = 0; i < 40 && !s.structures.some((b) => b.team === 1); i++)
    step(s);
  assert.ok(s.kingdoms[1].crossingPlan);
  const route = s.kingdoms[1].crossingPlan;
  u.hp = 0;
  s.units = s.units.filter((v) => v.hp > 0);
  const replacement: Unit = {
    ...u,
    id: s.nextId++,
    hp: 7000,
    x: 30,
    y: 17,
    order: "auto",
    wait: 0,
  };
  s.units.push(replacement);
  s = loadGame(saveGame(s))!;
  assert.deepEqual(s.kingdoms[1].crossingPlan, route);
  for (let i = 0; i < 200; i++) step(s);
  assert.equal(
    s.structures.filter((b) => b.team === 1 && b.kind === "bridge").length,
    3,
  );
});
test("AI never plans a crossing into an immutable boundary", () => {
  const { s } = river();
  for (let y = 0; y < 48; y++) tile(s, 23, y)!.permanent = true;
  assert.equal(planAiCrossing(s, 1), undefined);
});
