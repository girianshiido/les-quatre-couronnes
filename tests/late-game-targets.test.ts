import { test } from "node:test";
import assert from "node:assert/strict";
import {
  step,
  tile,
  addHouse,
  buildCrossing,
  razeHouse,
  command,
  saveGame,
  loadGame,
} from "../src/engine";
import { lateGame, advance } from "./helpers/late-game";

test("a nearby 5000 HP army finishes the last house instead of waiting for a far 100 HP claimant", () => {
  const { s, army, claimant } = lateGame();
  step(s);
  assert.equal(army.x, 29);
  assert.deepEqual(army.target, { x: 30, y: 20 });
  advance(s, 1.4);
  assert.equal(s.result, "won");
  assert.equal(s.houses.filter((h) => h.team === 1).length, 0);
  assert.equal(
    claimant.x,
    8,
    "the distant troop stops making an unnecessary journey",
  );
});
test("a closer capable troop can take over even when the distant claimant is stronger", () => {
  const { s, army, claimant } = lateGame();
  army.hp = 500;
  claimant.hp = 7000;
  step(s);
  assert.equal(army.x, 29);
  advance(s, 1.4);
  assert.equal(s.result, "won");
});
test("an insufficiently strong nearby troop does not replace a capable attacker", () => {
  const { s, army, claimant } = lateGame();
  army.hp = 100;
  claimant.hp = 5000;
  step(s);
  assert.equal(army.x, 28);
  assert.equal(army.order, "rest");
  assert.deepEqual(claimant.target, { x: 30, y: 20 });
});
test("an attacker already next to the house keeps its attempt, then the nearby army can finish the damage", () => {
  const { s, army, claimant } = lateGame();
  claimant.x = 29;
  step(s);
  assert.equal(army.x, 28);
  assert.equal(army.order, "rest");
  advance(s, 3);
  assert.equal(s.result, "won");
});
test("a small path advantage does not make equal-strength armies swap the same target", () => {
  const { s, army, claimant } = lateGame();
  claimant.x = 26;
  claimant.hp = 5000;
  step(s);
  assert.equal(army.x, 28);
  assert.equal(army.order, "rest");
  assert.deepEqual(claimant.target, { x: 30, y: 20 });
});
test("distance comparisons include the actual long detour to the bridge rather than just nearby coordinates", () => {
  const { s, army, claimant } = lateGame();
  claimant.x = 22;
  claimant.hp = 1000;
  for (let x = 8; x <= 28; x++) tile(s, x, 18)!.terrain = "grass";
  tile(s, 8, 19)!.terrain = "bridge";
  s.stats.bridges++;
  army.y = 18;
  step(s);
  assert.equal(army.order, "rest");
  assert.notDeepEqual(army.target, { x: 30, y: 20 });
  assert.deepEqual(claimant.target, { x: 30, y: 20 });
});
test("a reservation behind a closed river does not block an army that can already reach the enemy house", () => {
  const { s, army, claimant } = lateGame();
  claimant.hp = 5000;
  tile(s, 9, 20)!.terrain = "water";
  step(s);
  assert.equal(army.x, 29);
  advance(s, 1.4);
  assert.equal(s.result, "won");
});
test("a broken bridge on the only path prevents takeover until the path actually opens", () => {
  const { s, army, claimant } = lateGame();
  army.x = 26;
  claimant.x = 29;
  claimant.hp = 1000;
  tile(s, 27, 20)!.terrain = "water";
  step(s);
  assert.equal(army.order, "rest");
  assert.notDeepEqual(army.target, { x: 30, y: 20 });
  assert.ok(tile(s, 30, 20)!.house);
});
test("a damaged house can be finished by a smaller nearby troop", () => {
  const { s, army, claimant, house } = lateGame();
  house.damage = 150;
  army.hp = 100;
  claimant.hp = 1000;
  step(s);
  assert.equal(army.x, 29);
  advance(s, 1.4);
  assert.equal(s.result, "won");
});
test("explicit holding and shelter orders are preserved", () => {
  for (const order of ["hold", "shelter"] as const) {
    const { s, army } = lateGame();
    command(
      s,
      [army.id],
      order,
      order === "shelter" ? { x: 28, y: 20 } : undefined,
    );
    advance(s, 2);
    assert.equal(army.x, 28);
    assert.equal(army.order, order);
  }
});
test("explicit construction reservations are not stolen, even on a contested location", () => {
  const { s, army, claimant } = lateGame();
  claimant.order = "house";
  step(s);
  assert.equal(army.x, 28);
  assert.equal(army.order, "rest");
  assert.equal(claimant.order, "house");
});
test("building reservations remain exclusive on neutral plots", () => {
  const { s, army, claimant, house } = lateGame();
  tile(s, 38, 20)!.terrain = "grass";
  assert.ok(addHouse(s, 1, 38, 20, false));
  razeHouse(s, house);
  s.kingdoms[0].gold = 150;
  step(s);
  assert.notDeepEqual(army.target, { x: 30, y: 20 });
  assert.deepEqual(claimant.target, { x: 30, y: 20 });
});
test("a loaded late-game save gets the same immediate takeover without changing the save format", () => {
  const original = lateGame();
  const s = loadGame(saveGame(original.s))!;
  assert.ok(s);
  const army = s.units.find((u) => u.id === original.army.id)!;
  step(s);
  assert.equal(army.x, 29);
  advance(s, 1.4);
  assert.equal(s.result, "won");
});

test("an unfunded tree on a claimant's route does not reserve a house on the already open side", () => {
  const { s, army, claimant } = lateGame();
  claimant.hp = 5000;
  tile(s, 9, 20)!.terrain = "tree";
  step(s);
  assert.equal(army.x, 29);
  assert.equal(tile(s, 9, 20)!.terrain, "tree");
});

test("opening a bridge invalidates old route distances and releases the nearby army", () => {
  const { s, army } = lateGame();
  army.x = 26;
  tile(s, 27, 20)!.terrain = "water";
  step(s);
  assert.equal(army.order, "rest");
  s.kingdoms[0].gold = 1000;
  assert.ok(buildCrossing(s, army, { x: 27, y: 20 }));
  advance(s, 4);
  assert.equal(s.result, "won");
  assert.equal(tile(s, 27, 20)!.terrain, "bridge");
});

test("a capable army clears three remaining reserved houses in succession", () => {
  const { s, claimant } = lateGame();
  for (const t of s.tiles) if (t.castle === 1) delete t.castle;
  s.kingdoms[1].castle = { x: 40, y: 20 };
  const king = s.units.find((u) => u.team === 1 && u.royal)!;
  king.x = 40;
  for (let y = 19; y <= 21; y++)
    for (let x = 39; x <= 41; x++) {
      const t = tile(s, x, y)!;
      t.terrain = "grass";
      t.castle = 1;
    }
  for (let x = 31; x <= 35; x++) tile(s, x, 20)!.terrain = "grass";
  for (const [i, x] of [32, 34].entries()) {
    assert.ok(addHouse(s, 1, x, 20, false));
    s.houses.at(-1)!.timer = 0;
    s.units.push({
      ...claimant,
      id: s.nextId++,
      x: 10 + i * 2,
      target: { x, y: 20 },
    });
  }
  advance(s, 6);
  assert.equal(s.result, "won");
  assert.equal(s.houses.filter((h) => h.team === 1).length, 0);
});
