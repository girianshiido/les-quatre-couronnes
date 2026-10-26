import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  step,
  command,
  lifeDrain,
  unitUpkeep,
  combatPower,
  resolveEncounter,
  birthInterval,
  saveGame,
  loadGame,
  nextStep,
  type Unit,
} from "../src/engine.ts";
import { destinationActions } from "../src/orders.ts";
const unit = (id = 100, x = 20, y = 20, hp = 100): Unit => ({
  id,
  team: 0,
  x,
  y,
  hp,
  age: 0,
  wait: 0,
  order: "hold",
  heading: { x: 0, y: 1 },
});
test("water at an accessible bank offers exactly a one-cell bridge", () => {
  const s = createGame(),
    u = unit(100, 29, 20);
  s.units.push(u);
  tile(s, 29, 20)!.terrain = "grass";
  tile(s, 30, 20)!.terrain = "water";
  const choices = destinationActions(s, [u], { x: 30, y: 20 });
  assert.deepEqual(
    choices.map((c) => c.order),
    ["bridge"],
  );
  assert.equal(choices[0].workerId, u.id);
  assert.equal(choices[0].disabled, false);
});
test("a free destination offers relevant orders and excludes water actions", () => {
  const s = createGame(),
    u = unit(100, 20, 20);
  s.units.push(u);
  tile(s, 20, 20)!.terrain = "grass";
  tile(s, 21, 20)!.terrain = "grass";
  const choices = destinationActions(s, [u], { x: 21, y: 20 }).map(
    (c) => c.order,
  );
  assert.ok(
    choices.includes("move") &&
      choices.includes("house") &&
      choices.includes("barricade"),
  );
  assert.ok(!choices.includes("bridge") && !choices.includes("dam"));
});
test("enemy houses can be attacked with zero gold", () => {
  const s = createGame(),
    h = s.houses.find((h) => h.team === 1)!,
    u = unit(100, h.x - 1, h.y);
  s.units.push(u);
  s.kingdoms[0].gold = 0;
  tile(s, u.x, u.y)!.terrain = "grass";
  const choices = destinationActions(s, [u], h);
  assert.deepEqual(
    choices.map((c) => c.order),
    ["attack"],
  );
  assert.equal(choices[0].disabled, false);
  command(s, [u.id], "attack", h);
  step(s);
  assert.ok(!s.houses.some((v) => v.id === h.id));
});
test("ordinary upkeep grows with the actual king distance and stops on any friendly house", () => {
  const s = createGame(),
    king = s.units.find((u) => u.royal && u.team === 0)!;
  const near = unit(100, king.x + 2, king.y),
    far = unit(101, king.x + 25, king.y);
  s.units.push(near, far);
  assert.equal(lifeDrain(s, near), 0.12);
  assert.ok(lifeDrain(s, far) > lifeDrain(s, near) * 2);
  tile(s, far.x, far.y)!.terrain = "grass";
  assert.ok(addHouse(s, 0, far.x, far.y));
  far.order = "auto";
  assert.equal(lifeDrain(s, far), 0);
  king.x = far.x - 1;
  far.x -= 3;
  assert.equal(lifeDrain(s, far), 0.12);
});
test("a moving unit loses no step HP when entering a friendly house, and manual shelter persists", () => {
  const s = createGame(),
    h = s.houses[0],
    u = unit(100, h.x + 1, h.y);
  tile(s, u.x, u.y)!.terrain = "grass";
  u.order = "shelter";
  u.target = { x: h.x, y: h.y };
  s.units.push(u);
  const drain = lifeDrain(s, u);
  step(s);
  assert.equal(u.x, h.x);
  assert.ok(Math.abs(u.hp - (100 - 0.2 * drain)) < 1e-8);
  const hp = u.hp;
  for (let i = 0; i < 5; i++) step(s);
  assert.equal(u.hp, hp);
  assert.equal(u.order, "shelter");
});
test("tax births are fast at zero and much slower at 24 and 30, equally for both factions", () => {
  assert.equal(birthInterval(0), 6);
  assert.ok(birthInterval(24) > 110);
  assert.equal(birthInterval(30), 180);
  const s = createGame();
  for (const k of s.kingdoms) {
    k.tax = 24;
    k.automatic = false;
  }
  step(s);
  assert.equal(
    s.houses.find((h) => h.team === 0)!.interval,
    s.houses.find((h) => h.team === 1)!.interval,
  );
});
test("changing taxes preserves cycle progress instead of releasing a backlog", () => {
  const s = createGame(),
    h = s.houses[0];
  s.kingdoms[0].automatic = false;
  s.kingdoms[0].tax = 0;
  h.interval = 180;
  h.timer = 162;
  const before = s.kingdoms[0].births;
  step(s);
  assert.equal(s.kingdoms[0].births, before);
  for (let i = 0; i < 4; i++) step(s);
  assert.equal(s.kingdoms[0].births, before + 1);
});
test("large troops spend gold and starve rapidly without it, even at a house", () => {
  const a = createGame(),
    h = a.houses[0],
    u = unit(100, h.x, h.y, 5000);
  a.units.push(u);
  a.kingdoms[0].automatic = false;
  a.kingdoms[0].tax = 0;
  assert.equal(unitUpkeep(u), 2);
  const before = a.kingdoms[0].gold;
  step(a, 1);
  assert.ok(a.kingdoms[0].gold < before - 1.8);
  assert.equal(u.hp, 5000);
  const b = loadGame(saveGame(a))!,
    v = b.units.find((v) => v.id === u.id)!;
  b.kingdoms[0].gold = 0;
  step(b, 1);
  assert.ok(v.hp < 4900);
  assert.ok(v.hp > 4500);
});
test("ramparts absorb repeated assaults and a modest merged unit cannot instantly kill the king", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 1 && u.royal)!;
  assert.equal(combatPower(s, king), 2800);
  const small = { ...unit(100, king.x + 1, king.y, 1500), team: 0 };
  assert.equal(resolveEncounter(s, small, king), king);
  assert.equal(small.hp, 0);
  assert.equal(king.hp, 100);
  assert.equal(s.kingdoms[1].fortification, 950);
  const strong = unit(101, king.x + 1, king.y, combatPower(s, king) + 1);
  assert.equal(resolveEncounter(s, strong, king), strong);
  assert.equal(king.hp, 0);
});
test("shared formation paths preserve normal shortest steps and survive save/load", () => {
  const s = createGame();
  for (const t of s.tiles) t.terrain = "grass";
  const u = unit(100, 5, 5);
  u.order = "move";
  u.formation = true;
  const p = { x: 25, y: 40 };
  assert.deepEqual(nextStep(s, u, p, 0), nextStep(s, { x: u.x, y: u.y }, p, 0));
  s.units.push(u);
  command(s, [u.id], "move", p);
  const loaded = loadGame(saveGame(s))!;
  step(s);
  step(loaded);
  assert.equal(saveGame(s), saveGame(loaded));
});
