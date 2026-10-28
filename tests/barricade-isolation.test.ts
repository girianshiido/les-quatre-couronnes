import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  spawn,
  step,
  command,
  nextStep,
  fundConstruction,
  canBarricade,
  buildBarricade,
  chooseAlliance,
  saveGame,
  loadGame,
  destroyStructure,
  type State,
  type Unit,
  type Structure,
} from "../src/engine";
import { spawnMonster, tickMonsters } from "../src/monsters";

function isolated(team = 0, owner = 4) {
  const s = createGame();
  for (const k of s.kingdoms) {
    k.tax = 0;
    k.automatic = false;
    k.gold = 5000;
  }
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
  for (const h of s.houses) h.timer = 0;
  for (let y = 18; y <= 26; y++)
    for (let x = 18; x <= 26; x++) {
      const t = tile(s, x, y)!;
      t.terrain = "water";
      delete t.permanent;
    }
  const home = { x: 20, y: 22 },
    gate = { x: 21, y: 22 },
    inside = { x: 22, y: 22 };
  tile(s, home.x, home.y)!.terrain = "grass";
  for (let x = 22; x <= 24; x++) tile(s, x, 22)!.terrain = "grass";
  assert.ok(addHouse(s, team, home.x, home.y, false));
  const h = s.houses.at(-1)!;
  const b: Structure = {
    id: s.nextId++,
    kind: "barricade",
    team: owner,
    hp: 1500,
    maxHp: 1500,
    cells: [gate],
  };
  s.structures.push(b);
  tile(s, gate.x, gate.y)!.terrain = "barricade";
  tile(s, gate.x, gate.y)!.owner = owner;
  return { s, h, b, home, gate, inside };
}
function person(s: State, team: number, x: number, y: number, hp = 100): Unit {
  const u: Unit = {
    id: s.nextId++,
    team,
    x,
    y,
    hp,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 0, y: 0 },
  };
  s.units.push(u);
  return u;
}
for (let team = 0; team < 4; team++)
  test(`faction ${team}: births never appear inside a closed barricade of any owner`, () => {
    for (const owner of [0, 1, 2, 3, 4]) {
      const { s, h, b, gate } = isolated(team, owner),
        before = s.units.length,
        births = s.kingdoms[team].births;
      spawn(s, h);
      assert.equal(
        s.units.length,
        before,
        `owner ${owner}: no newborn on gate ${gate.x},${gate.y}`,
      );
      assert.equal(s.kingdoms[team].births, births);
      assert.equal(b.hp, 1500);
    }
  });
test("a house next to a neutral cave gate cannot seed houses on its other side", () => {
  const { s, h, b, inside } = isolated();
  spawn(s, h);
  for (let i = 0; i < 80; i++) step(s);
  assert.equal(b.hp, 1500);
  assert.ok(
    !s.units.some(
      (u) => u.hp > 0 && u.x >= inside.x && u.x <= 24 && u.y === inside.y,
    ),
  );
  assert.ok(
    !s.houses.some((h) => h.x >= inside.x && h.x <= 24 && h.y === inside.y),
  );
});
test("births reject trees, rocks, caves and water, but resume at 100 HP once the exit opens", () => {
  for (const terrain of ["tree", "rock", "water", "dam"] as const) {
    const { s, h, gate, b } = isolated();
    s.structures = [];
    const t = tile(s, gate.x, gate.y)!;
    t.terrain = terrain;
    delete t.owner;
    const before = s.units.length;
    spawn(s, h);
    assert.equal(s.units.length, before, terrain);
    t.terrain = "grass";
    spawn(s, h);
    assert.equal(s.units.at(-1)!.hp, 100);
  }
  const { s, h, gate } = isolated();
  s.structures = [];
  tile(s, gate.x, gate.y)!.terrain = "grass";
  tile(s, gate.x, gate.y)!.cave = 999;
  const before = s.units.length;
  spawn(s, h);
  assert.equal(s.units.length, before, "cave");
});
test("opening the gate really unlocks births and crossing, including after save/load", () => {
  const original = isolated();
  const s = loadGame(saveGame(original.s))!;
  assert.ok(s);
  const h = s.houses.find((h) => h.id === original.h.id)!,
    b = s.structures.find((b) => b.id === original.b.id)!;
  const before = s.units.length;
  spawn(s, h);
  assert.equal(s.units.length, before);
  destroyStructure(s, b);
  spawn(s, h);
  const newborn = s.units.at(-1)!;
  assert.equal(newborn.hp, 100);
  assert.deepEqual({ x: newborn.x, y: newborn.y }, original.gate);
  command(s, [newborn.id], "move", original.inside);
  step(s);
  assert.deepEqual({ x: newborn.x, y: newborn.y }, original.inside);
});
test("short and shared formation paths cannot cross an intact neutral barricade", () => {
  const { s, home, inside, gate } = isolated();
  for (const formation of [false, true]) {
    const u = person(s, 0, home.x, home.y);
    u.order = "move";
    u.formation = formation;
    assert.equal(nextStep(s, u, inside, 0), undefined);
  }
});
test("an allied barricade blocks births as well as enemy and neutral barricades", () => {
  const { s, h } = isolated(0, 1);
  assert.ok(chooseAlliance(s, 1));
  const before = s.units.length;
  spawn(s, h);
  assert.equal(s.units.length, before);
});
test("monsters cannot spawn in an opposing barricade beside their cave", () => {
  const { s, home, gate, b } = isolated(0, 0);
  s.houses = s.houses.filter((h) => h.x !== home.x || h.y !== home.y);
  delete tile(s, home.x, home.y)!.house;
  const cave = {
    id: s.nextId++,
    x: home.x,
    y: home.y,
    hp: 1500,
    maxHp: 1500,
    timer: 0,
    interval: 35,
    spawnHp: 500,
  };
  s.caves.push(cave);
  tile(s, home.x, home.y)!.cave = cave.id;
  spawnMonster(s, cave);
  assert.equal(s.monsters.length, 0);
  assert.equal(b.hp, 1500);
});
test("a saved unit placed on a neutral barricade cannot leave it without paying for its destruction", () => {
  const { s, b, gate, inside } = isolated();
  const u = person(s, 0, gate.x, gate.y);
  command(s, [u.id], "move", inside);
  const loaded = loadGame(saveGame(s))!;
  assert.ok(loaded);
  const actor = loaded.units.find((v) => v.id === u.id)!;
  step(loaded);
  assert.ok(actor.hp <= 0);
  assert.ok(loaded.structures.find((v) => v.id === b.id)!.hp > 0);
  assert.ok(loaded.structures.find((v) => v.id === b.id)!.hp < 1500);
  assert.ok(!loaded.units.some((v) => v.x === inside.x && v.y === inside.y));
});
test("a barricade cannot be created or completed underneath a living monster", () => {
  const { s, b, gate, home } = isolated();
  s.structures = [];
  tile(s, gate.x, gate.y)!.terrain = "grass";
  delete tile(s, gate.x, gate.y)!.owner;
  const worker = person(s, 0, home.x, home.y, 1000);
  const m = {
    id: s.nextId++,
    x: gate.x,
    y: gate.y,
    hp: 500,
    wait: 999,
    heading: { x: 0, y: 0 },
    cave: 0,
  };
  s.monsters.push(m);
  assert.equal(canBarricade(s, gate), false);
  assert.equal(buildBarricade(s, worker, gate), false);
  s.monsters = [];
  s.kingdoms[0].gold = 200;
  assert.ok(fundConstruction(s, worker, gate, "barricade"));
  s.monsters.push(m);
  s.kingdoms[0].gold = 1000;
  fundConstruction(s, worker, gate, "barricade");
  assert.ok(s.structures[0].construction);
  assert.equal(s.structures[0].construction!.paid, 200);
});

test("a legacy monster standing on an enemy barricade cannot leave through the wall", () => {
  const { s, b, gate, inside } = isolated(0, 0);
  const monster = {
    id: s.nextId++,
    x: gate.x,
    y: gate.y,
    hp: 500,
    wait: 0,
    heading: { x: 1, y: 0 },
    cave: 0,
  };
  s.monsters.push(monster);
  tickMonsters(s, 0.2);
  assert.ok(monster.hp <= 0);
  assert.ok(b.hp > 0 && b.hp < 1500);
  assert.ok(
    !s.monsters.some((m) => m.hp > 0 && m.x === inside.x && m.y === inside.y),
  );
});
test("a completed bridge and an unfinished barricade remain legitimate birth exits", () => {
  for (const kind of ["bridge", "unfinished"] as const) {
    const { s, h, gate, b } = isolated();
    if (kind === "bridge") {
      b.kind = "bridge";
      b.hp = b.maxHp = 1000;
      tile(s, gate.x, gate.y)!.terrain = "bridge";
    } else {
      b.hp = 300;
      b.construction = { paid: 150, total: 750 };
      tile(s, gate.x, gate.y)!.terrain = "grass";
    }
    const before = s.units.length;
    spawn(s, h);
    assert.equal(s.units.length, before + 1);
    assert.equal(s.units.at(-1)!.hp, 100);
    assert.deepEqual({ x: s.units.at(-1)!.x, y: s.units.at(-1)!.y }, gate);
  }
});
