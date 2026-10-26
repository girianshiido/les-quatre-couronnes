import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  command,
  step,
  buildCrossing,
  resolveEncounter,
  nextStep,
  saveGame,
  loadGame,
  setPriorities,
  type Unit,
} from "../src/engine.ts";

function corridor() {
  const s = createGame();
  for (const t of s.tiles) t.terrain = "water";
  for (let x = 10; x <= 26; x++) tile(s, x, 20)!.terrain = "grass";
  for (const h of s.houses) h.timer = 0;
  for (const u of s.units) u.order = "hold";
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 30;
  }
  return s;
}
function troop(s: ReturnType<typeof createGame>, x: number, hp = 100): Unit {
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x,
    y: 20,
    hp,
    age: 2,
    wait: 0,
    order: "auto",
    heading: { x: -1, y: 0 },
  };
  s.units.push(u);
  return u;
}
function advance(s: ReturnType<typeof createGame>, seconds: number) {
  for (let i = 0; i < seconds * 5; i++) step(s);
}

test("a mission survives fusion into a stationary 7000 HP troop", () => {
  const s = corridor(),
    idle = troop(s, 11, 7000),
    moving = troop(s, 10);
  idle.order = "hold";
  command(s, [moving.id], "move", { x: 22, y: 20 });
  s.kingdoms[0].gold = 149;
  advance(s, 10);
  const survivor = s.units.find((u) => !u.royal && u.team === 0)!;
  assert.equal(survivor.id, idle.id);
  assert.equal(survivor.x, 22);
  assert.equal(survivor.order, "auto");
  assert.ok(survivor.hp > 6000);
});

test("an automatic passer-by preserves the mission of its commanded ally", () => {
  const s = corridor(),
    a = troop(s, 10),
    b = troop(s, 11, 7000);
  command(s, [b.id], "attack", { x: 24, y: 20 });
  const survivor = resolveEncounter(s, a, b)!;
  assert.equal(survivor.order, "attack");
  assert.deepEqual(survivor.target, { x: 24, y: 20 });
});

test("a group including a 7000 HP troop attacks across a bridge without destroying it", () => {
  const s = corridor();
  tile(s, 18, 20)!.terrain = "water";
  const builder = troop(s, 17);
  assert.ok(buildCrossing(s, builder, { x: 18, y: 20 }));
  builder.order = "hold";
  assert.ok(addHouse(s, 1, 24, 20, false));
  s.houses.at(-1)!.timer = 0;
  const group = Array.from({ length: 8 }, (_, i) =>
    troop(s, 10 + i, i === 0 ? 7000 : 100),
  );
  command(
    s,
    group.map((u) => u.id),
    "attack",
    { x: 24, y: 20 },
  );
  assert.ok(group.every((u) => u.formation));
  s.kingdoms[0].gold = 149;
  advance(s, 16);
  assert.equal(tile(s, 18, 20)!.terrain, "bridge");
  assert.equal(s.structures[0].hp, 1000);
  assert.equal(tile(s, 24, 20)!.house, undefined);
  assert.ok(
    s.units.some((u) => !u.royal && u.team === 0 && u.x === 24 && u.hp > 6000),
  );
});

test("a blocked explicit order waits and resumes when a bridge opens, including after load", () => {
  const s = corridor(),
    u = troop(s, 16, 7000);
  tile(s, 18, 20)!.terrain = "water";
  command(s, [u.id], "move", { x: 24, y: 20 });
  advance(s, 2);
  assert.equal(u.order, "move");
  assert.deepEqual(u.target, { x: 24, y: 20 });
  const loaded = loadGame(saveGame(s))!;
  const worker = troop(loaded, 17);
  assert.ok(buildCrossing(loaded, worker, { x: 18, y: 20 }));
  worker.order = "hold";
  loaded.kingdoms[0].gold = 149;
  advance(loaded, 10);
  assert.ok(
    loaded.units.some(
      (v) => !v.royal && v.team === 0 && v.x === 24 && v.hp > 6000,
    ),
  );
});

test("both path strategies take an open detour instead of demanding gold for a tree", () => {
  for (const formation of [false, true]) {
    const s = corridor(),
      u = troop(s, 10, 7000);
    for (let x = 10; x <= 14; x++) tile(s, x, 21)!.terrain = "grass";
    tile(s, 11, 20)!.terrain = "tree";
    u.order = "move";
    u.formation = formation;
    assert.deepEqual(nextStep(s, u, { x: 14, y: 20 }, 0), { x: 10, y: 21 });
  }
});

for (const hp of [100, 7000])
  test(`autonomous ${hp} HP troop crosses an opened bridge to settle the nearest free plot`, () => {
    const s = corridor();
    for (const x of [10, 12, 14, 16]) {
      assert.ok(addHouse(s, 0, x, 20, false));
      s.houses.at(-1)!.timer = 0;
    }
    tile(s, 17, 20)!.terrain = "water";
    const u = troop(s, 14, hp);
    advance(s, 2);
    assert.equal(u.order, "rest");
    const worker = troop(s, 16);
    assert.ok(buildCrossing(s, worker, { x: 17, y: 20 }));
    worker.order = "hold";
    advance(s, 8);
    assert.ok(s.houses.some((h) => h.team === 0 && h.x === 18 && h.y === 20));
  });

test("automatic settlers use separate nearest plots and weak units wait on a house", () => {
  const s = corridor();
  assert.ok(addHouse(s, 0, 10, 20, false));
  s.houses.at(-1)!.timer = 0;
  const a = troop(s, 11),
    b = troop(s, 11),
    weak = troop(s, 10, 20);
  step(s);
  assert.notDeepEqual(a.target, b.target);
  assert.equal(weak.order, "rest");
  assert.deepEqual(weak.target, { x: 10, y: 20 });
});

test("move into enemy territory resumes occupation, razes a nearby house then settles", () => {
  const s = corridor();
  assert.ok(addHouse(s, 1, 22, 20, false));
  const enemyId = s.houses.at(-1)!.id;
  setPriorities(s, ["raid", "house", "clear"]);
  const u = troop(s, 18, 7000);
  command(s, [u.id], "move", { x: 21, y: 20 });
  assert.equal(u.occupying, true);
  // Preserve the destination until reached, then continue automatically nearby.
  for (let i = 0; i < 30 && u.order === "move"; i++) step(s);
  assert.equal(u.x, 21);
  assert.equal(u.order, "auto");
  assert.equal(
    loadGame(saveGame(s))!.units.find((v) => v.id === u.id)!.occupying,
    true,
  );
  advance(s, 5);
  assert.ok(!s.houses.some((h) => h.id === enemyId));
  assert.ok(
    s.houses.some((h) => h.team === 0 && Math.abs(h.x - 22) <= 1 && h.y === 20),
  );
});
test("a deliberate hold cancels occupation and remains still by an enemy house", () => {
  const s = corridor();
  assert.ok(addHouse(s, 1, 22, 20, false));
  const u = troop(s, 21, 7000);
  u.occupying = true;
  command(s, [u.id], "hold");
  advance(s, 3);
  assert.equal(u.x, 21);
  assert.equal(u.occupying, false);
  assert.ok(s.houses.some((h) => h.team === 1 && h.x === 22 && h.y === 20));
});

test("reordering the doctrine changes a real choice between a free plot and an enemy house", () => {
  for (const raidFirst of [false, true]) {
    const s = corridor();
    assert.ok(addHouse(s, 1, 22, 20, false));
    const u = troop(s, 21, 100);
    setPriorities(
      s,
      raidFirst ? ["raid", "house", "clear"] : ["house", "raid", "clear"],
    );
    step(s);
    if (raidFirst) assert.equal(tile(s, 22, 20)!.house, undefined);
    else {
      assert.equal(u.x, 20);
      assert.ok(tile(s, 22, 20)!.house);
    }
  }
});
test("clearing can be prioritised before a nearby foundation and manual orders still win", () => {
  const s = corridor(),
    u = troop(s, 21);
  tile(s, 20, 20)!.terrain = "tree";
  setPriorities(s, ["clear", "house", "raid"]);
  step(s);
  assert.equal(tile(s, 20, 20)!.terrain, "grass");
  command(s, [u.id], "hold");
  setPriorities(s, ["raid", "house", "clear"]);
  assert.equal(u.order, "hold");
});
test("doctrine changes cancel only autonomous tasks and persist in saves", () => {
  const s = corridor(),
    automatic = troop(s, 19),
    manual = troop(s, 21);
  automatic.target = { x: 24, y: 20 };
  command(s, [manual.id], "move", { x: 26, y: 20 });
  assert.ok(setPriorities(s, ["clear", "raid", "house"]));
  assert.equal(automatic.target, undefined);
  assert.equal(manual.order, "move");
  assert.deepEqual(loadGame(saveGame(s))!.priorities, [
    "clear",
    "raid",
    "house",
  ]);
  assert.equal(setPriorities(s, ["house", "house", "raid"]), false);
  const bad = JSON.parse(saveGame(s));
  bad.priorities = ["house", "house", "raid"];
  assert.equal(loadGame(JSON.stringify(bad)), undefined);
});
test("old saves receive a complete default doctrine", () => {
  const s = corridor(),
    old = JSON.parse(saveGame(s));
  delete old.priorities;
  assert.deepEqual(loadGame(JSON.stringify(old))!.priorities, [
    "house",
    "raid",
    "clear",
  ]);
});

test("automatic occupation takes a detour rather than clearing a rock or assaulting a castle", () => {
  const s = corridor(),
    u = troop(s, 20);
  assert.ok(addHouse(s, 0, 20, 20, false));
  for (let x = 20; x <= 22; x++) tile(s, x, 21)!.terrain = "grass";
  tile(s, 21, 20)!.terrain = "rock";
  u.target = { x: 22, y: 20 };
  step(s);
  assert.equal(tile(s, 21, 20)!.terrain, "rock");
  assert.equal(u.y, 21);
});
