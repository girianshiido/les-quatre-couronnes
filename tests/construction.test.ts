import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  command,
  step,
  structureAt,
  fundConstruction,
  walkable,
  canHouse,
  buildCrossing,
  destroyStructure,
  attackStructure,
  bridgeCost,
  saveGame,
  loadGame,
  nextStep,
  type State,
  type Unit,
} from "../src/engine.ts";
import { destinationActions } from "../src/orders.ts";
function site(kind: "bridge" | "barricade" = "bridge") {
  const s = createGame();
  for (const k of s.kingdoms) {
    k.tax = 0;
    k.automatic = false;
  }
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
  for (const h of s.houses) h.timer = 0;
  for (let y = 18; y <= 24; y++)
    for (let x = 18; x <= 28; x++) tile(s, x, y)!.terrain = "grass";
  const p = { x: 21, y: 20 };
  if (kind === "bridge") tile(s, p.x, p.y)!.terrain = "water";
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x: 20,
    y: 20,
    hp: 100,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 1, y: 0 },
  };
  s.units.push(u);
  return { s, u, p };
}
for (const kind of ["bridge", "barricade"] as const) {
  const total = kind === "bridge" ? 1000 : 750;
  test(`${kind} accepts a command with no gold and saves only the money actually invested`, () => {
    const { s, u, p } = site(kind);
    s.kingdoms[0].gold = 0;
    const action = destinationActions(s, [u], p).find((a) => a.order === kind)!;
    assert.ok(action && !action.disabled);
    command(s, [u.id], kind, p);
    step(s);
    assert.equal(u.order, kind);
    assert.equal(structureAt(s, p), undefined);
    s.kingdoms[0].gold = 250;
    u.wait = 0;
    step(s);
    const b = structureAt(s, p)!;
    assert.deepEqual(b.construction, { paid: 250, total });
    assert.equal(s.kingdoms[0].gold, 0);
    assert.equal(
      tile(s, p.x, p.y)!.terrain,
      kind === "bridge" ? "water" : "grass",
    );
    assert.equal(walkable(s, p.x, p.y, 0), kind !== "bridge");
    assert.equal(canHouse(s, p.x, p.y), false);
    const resume = destinationActions(s, [u], p).find((a) => a.order === kind)!;
    assert.ok(
      resume && !resume.disabled && resume.label.includes(String(total - 250)),
    );
  });
  test(`${kind} survives its worker's death and save/load, then another unit completes the remainder`, () => {
    const { s, u, p } = site(kind);
    assert.ok(addHouse(s, 0, u.x, u.y, false));
    u.hp = 1;
    s.kingdoms[0].gold = 500;
    command(s, [u.id], kind, p);
    step(s);
    assert.ok(!s.units.includes(u));
    const b = structureAt(s, p)!;
    assert.equal(b.construction!.paid, 500);
    assert.equal(s.kingdoms[0].gold, 0);
    const loaded = loadGame(saveGame(s))!;
    assert.ok(loaded);
    const next: Unit = {
      ...u,
      id: loaded.nextId++,
      hp: 100,
      wait: 0,
      order: "hold",
    };
    loaded.units.push(next);
    loaded.kingdoms[0].gold = total - 500;
    command(loaded, [next.id], kind, p);
    step(loaded);
    assert.equal(structureAt(loaded, p)!.id, b.id);
    assert.equal(structureAt(loaded, p)!.construction, undefined);
    assert.equal(tile(loaded, p.x, p.y)!.terrain, kind);
    assert.equal(loaded.kingdoms[0].gold, 0);
    assert.equal(next.order, "auto");
    assert.ok(loadGame(saveGame(loaded)));
  });
  test(`${kind} accepts successive contributions and cannot be charged twice or rebuilt automatically`, () => {
    const { s, u, p } = site(kind);
    for (const amount of [200, 100, total - 300]) {
      s.kingdoms[0].gold = amount;
      assert.ok(fundConstruction(s, u, p, kind));
      assert.equal(s.kingdoms[0].gold, 0);
    }
    const b = structureAt(s, p)!;
    assert.equal(b.construction, undefined);
    assert.equal(
      s.structures.filter((v) =>
        v.cells.some((q) => q.x === p.x && q.y === p.y),
      ).length,
      1,
    );
    s.kingdoms[0].gold = 1000;
    assert.equal(fundConstruction(s, u, p, kind), false);
    assert.equal(s.kingdoms[0].gold, 1000);
  });
}
test("a new unfinished bridge has no reconstruction discount; a completed bridge does", () => {
  const { s, u, p } = site();
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  destroyStructure(s, structureAt(s, p)!);
  assert.equal(bridgeCost(s, p), 1000);
  s.kingdoms[0].gold = 1000;
  assert.ok(buildCrossing(s, u, p));
  destroyStructure(s, structureAt(s, p)!);
  assert.equal(bridgeCost(s, p), 500);
  s.kingdoms[0].gold = 200;
  fundConstruction(s, u, p, "bridge");
  assert.deepEqual(structureAt(s, p)!.construction, { paid: 200, total: 500 });
  s.kingdoms[0].gold = 300;
  fundConstruction(s, u, p, "bridge");
  assert.equal(tile(s, p.x, p.y)!.terrain, "bridge");
  assert.equal(s.kingdoms[0].gold, 0);
});
test("bridge construction stays a single impassable water cell until fully funded", () => {
  const { s, u, p } = site();
  for (let y = 0; y < s.size; y++) {
    tile(s, 21, y)!.terrain = "water";
    tile(s, 22, y)!.terrain = "water";
  }
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  assert.equal(nextStep(s, u, { x: 24, y: 20 }, 0), undefined);
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  assert.equal(tile(s, 21, 20)!.terrain, "bridge");
  assert.equal(tile(s, 22, 20)!.terrain, "water");
  assert.equal(nextStep(s, u, { x: 24, y: 20 }, 0), undefined);
});
test("malformed funding progress is rejected and legacy structures still load", () => {
  const { s, u, p } = site();
  s.kingdoms[0].gold = 300;
  fundConstruction(s, u, p, "bridge");
  for (const construction of [
    { paid: -1, total: 1000 },
    { paid: 1000, total: 1000 },
    { paid: 300, total: 99 },
    { paid: 1, total: 0 },
  ]) {
    const bad = JSON.parse(saveGame(s));
    bad.structures[0].construction = construction;
    assert.equal(loadGame(JSON.stringify(bad)), undefined);
  }
  s.kingdoms[0].gold = 700;
  fundConstruction(s, u, p, "bridge");
  assert.ok(loadGame(saveGame(s)));
});
test("a worker on a house can keep a construction order while waiting without normal fatigue", () => {
  const { s, u, p } = site();
  assert.ok(addHouse(s, 0, u.x, u.y, false));
  s.kingdoms[0].gold = 100;
  command(s, [u.id], "bridge", p);
  step(s);
  const hp = u.hp;
  for (let i = 0; i < 50; i++) step(s);
  assert.equal(u.hp, hp);
  assert.equal(u.order, "bridge");
  assert.equal(structureAt(s, p)!.construction!.paid, 100);
});

test("damage to a partial bridge is preserved when its funding is completed", () => {
  const { s, u, p } = site();
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  const b = structureAt(s, p)!;
  const enemy: Unit = { ...u, id: s.nextId++, team: 1, hp: 100 };
  attackStructure(s, enemy, b);
  assert.equal(b.hp, 430);
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  assert.equal(b.hp, 930);
  assert.equal(b.construction, undefined);
});
test("an enemy cannot pay to take over a friendly unfinished construction", () => {
  const { s, u, p } = site();
  s.kingdoms[0].gold = 500;
  fundConstruction(s, u, p, "bridge");
  const enemy: Unit = { ...u, id: s.nextId++, team: 1, hp: 100 };
  s.kingdoms[1].gold = 500;
  assert.equal(fundConstruction(s, enemy, p, "bridge"), false);
  assert.equal(s.kingdoms[1].gold, 500);
  assert.equal(structureAt(s, p)!.construction!.paid, 500);
});
