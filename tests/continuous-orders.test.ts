import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  addHouse,
  tile,
  step,
  command,
  structureAt,
  resolveEncounter,
  saveGame,
  loadGame,
  type State,
  type Structure,
  type Unit,
  type Order,
} from "../src/engine.ts";
import { destinationActions } from "../src/orders.ts";
function scene(hp = 1000) {
  const s = createGame();
  s.structures = [];
  s.bridgeSites = [];
  s.stats.bridges = 0;
  s.stats.dams = 0;
  for (const t of s.tiles)
    t.terrain =
      t.house !== undefined || t.castle !== undefined ? "grass" : "water";
  for (let y = 18; y <= 25; y++)
    for (let x = 18; x <= 40; x++) tile(s, x, y)!.terrain = "grass";
  for (const k of s.kingdoms) {
    k.tax = 0;
    k.automatic = false;
  }
  for (const v of s.units) {
    v.order = "hold";
    v.wait = 99999;
  }
  assert.ok(addHouse(s, 0, 18, 20, false));
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x: 20,
    y: 20,
    hp,
    age: 5,
    wait: 0,
    order: "hold",
    heading: { x: 1, y: 0 },
  };
  s.units.push(u);
  return { s, u };
}
function tick(s: State, n = 1) {
  for (let i = 0; i < n; i++) {
    for (const h of s.houses) h.timer = 0;
    step(s);
  }
}
function bar(s: State, x: number, y: number, hp = 50, team = 1) {
  tile(s, x, y)!.terrain = "barricade";
  tile(s, x, y)!.owner = team;
  const b: Structure = {
    id: s.nextId++,
    kind: "barricade" as const,
    team,
    hp,
    maxHp: 1500,
    cells: [{ x, y }],
  };
  s.structures.push(b);
  return b;
}
test("continuous building founds several houses, then shelters when the next house is unaffordable", () => {
  const { s, u } = scene();
  s.kingdoms[0].gold = 500;
  const before = s.houses.length;
  command(s, [u.id], "build-many");
  tick(s, 100);
  assert.equal(s.houses.length - before, 3);
  assert.ok(s.kingdoms[0].gold < 150);
  assert.ok(["shelter", "hold"].includes(u.order));
  const houses = s.houses.length;
  s.kingdoms[0].gold = 500;
  tick(s, 20);
  assert.equal(
    s.houses.length,
    houses,
    "new income does not silently restart a completed manual order",
  );
  command(s, [u.id], "build-many");
  tick(s, 30);
  assert.ok(s.houses.length > houses);
});
test("continuous builders can raze enemy houses and establish new houses in their advance", () => {
  const { s, u } = scene(1400);
  s.kingdoms[0].gold = 1500;
  const h = addHouse(s, 1, 22, 20, false);
  assert.ok(h);
  command(s, [u.id], "build-many");
  tick(s, 90);
  assert.ok(!s.houses.some((v) => v.team === 1 && v.x === 22 && v.y === 20));
  assert.ok(s.houses.some((v) => v.team === 0 && v.x === 22 && v.y === 20));
  assert.ok(
    u.hp < 1400,
    "founding, walking and destruction retain their HP cost",
  );
});
test("continuous clearing spends on successive trees and rocks without building houses", () => {
  const { s, u } = scene(100);
  s.kingdoms[0].gold = 63;
  for (const [x, kind] of [
    [21, "tree"],
    [23, "rock"],
    [26, "tree"],
  ] as const)
    tile(s, x, 20)!.terrain = kind;
  const houses = s.houses.length;
  command(s, [u.id], "clear-many");
  tick(s, 100);
  for (const x of [21, 23, 26]) assert.equal(tile(s, x, 20)!.terrain, "grass");
  assert.equal(s.kingdoms[0].gold, 0);
  assert.equal(s.houses.length, houses);
  assert.ok(["shelter", "hold"].includes(u.order));
});
test("a clearing worker with only three gold can clear a rock but never starts an unaffordable tree", () => {
  const { s, u } = scene(100);
  s.kingdoms[0].gold = 3;
  tile(s, 21, 20)!.terrain = "tree";
  tile(s, 23, 20)!.terrain = "rock";
  command(s, [u.id], "clear-many");
  tick(s, 80);
  assert.equal(tile(s, 21, 20)!.terrain, "tree");
  assert.equal(tile(s, 23, 20)!.terrain, "grass");
  assert.equal(s.kingdoms[0].gold, 0);
});
test("builders do not spend their construction money on incidental natural obstacles", () => {
  const { s, u } = scene();
  s.kingdoms[0].gold = 200;
  tile(s, 21, 20)!.terrain = "tree";
  command(s, [u.id], "build-many");
  tick(s, 40);
  assert.equal(tile(s, 21, 20)!.terrain, "tree");
});
test("continuous demolition starts with the closest reachable barricade and reaches distant ones without gold", () => {
  const { s, u } = scene(500);
  s.kingdoms[0].gold = 0;
  const far = bar(s, 37, 20),
    near = bar(s, 22, 20),
    middle = bar(s, 30, 20, 50, 0);
  const sealed = bar(s, 45, 45);
  command(s, [u.id], "demolish-many");
  tick(s);
  assert.deepEqual(u.target, near.cells[0]);
  tick(s, 180);
  for (const b of [near, middle, far]) assert.ok(!s.structures.includes(b));
  assert.ok(s.structures.includes(sealed));
  assert.equal(s.kingdoms[0].gold, 0);
  assert.ok(u.hp > 0 && u.hp < 500);
  assert.ok(["shelter", "hold"].includes(u.order));
});
test("a barricade under construction is also a valid continuous demolition target", () => {
  const { s, u } = scene(500),
    b = bar(s, 22, 20, 30);
  tile(s, 22, 20)!.terrain = "grass";
  b.construction = { paid: 15, total: 750 };
  s.kingdoms[0].gold = 0;
  command(s, [u.id], "demolish-many");
  tick(s, 40);
  assert.ok(!structureAt(s, { x: 22, y: 20 }));
});
test("continuous work ends when no job is reachable and does not open its own bridge", () => {
  const { s, u } = scene(100);
  s.kingdoms[0].gold = 100;
  tile(s, 45, 45)!.terrain = "tree";
  command(s, [u.id], "clear-many");
  tick(s, 20);
  assert.equal(tile(s, 45, 45)!.terrain, "tree");
  assert.equal(s.structures.length, 0);
  assert.equal(u.order, "shelter");
});
for (const order of ["build-many", "clear-many", "demolish-many"] as const) {
  test(`${order} persists through save/load, survives a fusion and can be replaced by a new order`, () => {
    const { s, u } = scene();
    command(s, [u.id], order);
    const loaded = loadGame(saveGame(s))!;
    assert.ok(loaded);
    const copy = loaded.units.find((v) => v.id === u.id)!;
    assert.equal(copy.order, order);
    const other: Unit = {
      ...copy,
      id: loaded.nextId++,
      order: "hold",
      hp: 100,
    };
    loaded.units.push(other);
    const win = resolveEncounter(loaded, copy, other)!;
    assert.equal(win.order, order);
    command(loaded, [win.id], "move", { x: 28, y: 20 });
    assert.equal(win.order, "move");
  });
}
test("continuous orders are contextual and never assign building or demolition work to the king", () => {
  const { s, u } = scene();
  const land = destinationActions(s, [u], { x: 24, y: 20 }).map((a) => a.order);
  for (const order of ["build-many", "clear-many", "demolish-many"])
    assert.ok(land.includes(order as Order));
  tile(s, 21, 20)!.terrain = "tree";
  assert.ok(
    destinationActions(s, [u], { x: 21, y: 20 }).some(
      (a) => a.order === "clear-many",
    ),
  );
  const b = bar(s, 23, 20);
  assert.ok(
    destinationActions(s, [u], b.cells[0]).some(
      (a) => a.order === "demolish-many",
    ),
  );
  const king = s.units.find((v) => v.royal && v.team === 0)!;
  for (const order of ["build-many", "clear-many", "demolish-many"] as const) {
    command(s, [king.id], order);
    assert.equal(king.order, "hold");
  }
});
