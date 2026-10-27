import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  command,
  step,
  addHouse,
  structureAt,
  fundConstruction,
  saveGame,
  loadGame,
  distance,
  type Unit,
} from "../src/engine.ts";
function scene(kind: "bridge" | "barricade") {
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
  for (let y = 16; y <= 26; y++)
    for (let x = 16; x <= 28; x++) tile(s, x, y)!.terrain = "grass";
  const target = { x: 24, y: 20 };
  if (kind === "bridge")
    for (let y = 16; y <= 26; y++) tile(s, 24, y)!.terrain = "water";
  const us = [18, 20, 22].map((y): Unit => ({
    id: s.nextId++,
    team: 0,
    x: 19,
    y,
    hp: 1000,
    age: 0,
    wait: 999,
    order: "hold",
    heading: { x: 0, y: 1 },
  }));
  s.units.push(...us);
  return { s, us, target };
}
for (const kind of ["bridge", "barricade"] as const) {
  test(`${kind}: all selected units leave immediately and converge, including on a house`, () => {
    const { s, us, target } = scene(kind);
    assert.ok(addHouse(s, 0, 23, 20, false));
    s.kingdoms[0].gold = 0;
    command(
      s,
      us.map((u) => u.id),
      kind,
      target,
    );
    const before = us.map((u) => distance(u, target));
    step(s);
    for (let i = 0; i < us.length; i++) {
      assert.equal(us[i].order, kind);
      assert.ok(distance(us[i], target) < before[i]);
    }
    for (let i = 0; i < 70; i++) {
      for (const h of s.houses) h.timer = 0;
      step(s);
    }
    const workers = s.units.filter(
      (u) => us.some((v) => u.id === v.id) && u.hp > 0,
    );
    assert.equal(workers.length, 1);
    assert.equal(distance(workers[0], target), 1);
    assert.equal(workers[0].order, kind);
  });
  test(`${kind}: late workers finish their approach after another unit completes the site`, () => {
    const { s, us, target } = scene(kind);
    us[0].x = 23;
    us[0].y = 20;
    s.kingdoms[0].gold = kind === "bridge" ? 1050 : 800;
    command(
      s,
      us.map((u) => u.id),
      kind,
      target,
    );
    step(s);
    assert.ok(!structureAt(s, target)!.construction);
    for (const u of us.slice(1)) {
      assert.equal(u.order, kind);
      assert.ok(distance(u, target) > 1);
    }
    let reached = false;
    for (let i = 0; i < 100; i++) {
      step(s);
      if (
        s.units.some(
          (u) =>
            u.hp > 0 &&
            us.slice(1).some((v) => v.id === u.id) &&
            distance(u, target) <= 1,
        )
      )
        reached = true;
    }
    assert.ok(reached, "late builders still reach the site");
    assert.ok(
      s.units
        .filter((u) => u.hp > 0 && us.some((v) => v.id === u.id))
        .every((u) => u.order !== kind),
    );
  });
  test(`${kind}: the entire group keeps its destination through a save`, () => {
    const { s, us, target } = scene(kind);
    command(
      s,
      us.map((u) => u.id),
      kind,
      target,
    );
    const loaded = loadGame(saveGame(s))!;
    assert.ok(loaded);
    for (const u of us) {
      const copy = loaded.units.find((v) => v.id === u.id)!;
      assert.equal(copy.order, kind);
      assert.deepEqual(copy.target, target);
      assert.equal(copy.wait, 0);
    }
  });
}

for (const order of ["move", "attack", "merge", "house", "shelter"] as const) {
  test(`${order}: every selected unit starts towards the destination in the first simulation step`, () => {
    const { s, us, target } = scene("barricade");
    if (order === "shelter")
      assert.ok(addHouse(s, 0, target.x, target.y, false));
    command(
      s,
      us.map((u) => u.id),
      order,
      target,
    );
    const before = us.map((u) => distance(u, target));
    step(s);
    for (let i = 0; i < us.length; i++)
      assert.ok(
        distance(us[i], target) < before[i],
        `${order}, unit ${us[i].id}`,
      );
  });
}

test("dam: the whole group moves and late arrivals continue after completion", () => {
  const { s, us, target } = scene("bridge");
  us[0].x = 23;
  us[0].y = 20;
  assert.ok(fundConstruction(s, us[0], target, "bridge"));
  us[0].x = 19;
  us[0].y = 18;
  command(
    s,
    us.map((u) => u.id),
    "dam",
    target,
  );
  const before = us.map((u) => distance(u, target));
  step(s);
  for (let i = 0; i < us.length; i++)
    assert.ok(distance(us[i], target) < before[i]);
  for (let i = 0; i < 80; i++) step(s);
  assert.equal(tile(s, target.x, target.y)!.terrain, "dam");
  assert.ok(
    s.units
      .filter((u) => u.hp > 0 && us.some((v) => u.id === v.id))
      .every((u) => u.order !== "dam"),
  );
});

test("attack: a target killed by another unit does not cancel the rest of the march", () => {
  const { s, us, target } = scene("barricade");
  const enemy: Unit = { ...us[0], ...target, team: 1, id: s.nextId++, hp: 100 };
  s.units.push(enemy);
  command(
    s,
    us.map((u) => u.id),
    "attack",
    target,
  );
  enemy.hp = 0;
  const before = us.map((u) => distance(u, target));
  step(s);
  for (let i = 0; i < us.length; i++) {
    assert.ok(distance(us[i], target) < before[i]);
    assert.deepEqual(us[i].target, target);
  }
});
