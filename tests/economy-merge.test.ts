import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  addHouse,
  step,
  setDoctrine,
  command,
  goldIncome,
  birthInterval,
  saveGame,
  loadGame,
  type State,
  type Unit,
} from "../src/engine.ts";
function setup(homes = 5) {
  const s = createGame();
  // This isolated scenario replaces the tutorial geography and its bridges.
  s.structures = [];
  s.bridgeSites = [];
  s.stats.bridges = 0;
  for (const t of s.tiles) t.terrain = "grass";
  if (homes > 5) {
    assert.ok(addHouse(s, 0, 20, 30, false));
    for (
      let y = 2;
      y < 24 && s.houses.filter((h) => h.team === 0).length < homes;
      y += 2
    )
      for (
        let x = 2;
        x < 60 && s.houses.filter((h) => h.team === 0).length < homes;
        x += 2
      )
        addHouse(s, 0, x, y, false);
  }
  for (const k of s.kingdoms) {
    k.tax = 24;
    k.automatic = false;
  }
  for (const h of s.houses) {
    h.timer = 0;
    h.interval = birthInterval(24);
  }
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
  setDoctrine(s, "builder");
  return s;
}
function troop(s: State, x: number, y = 30, hp = 500): Unit {
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x,
    y,
    hp,
    wait: 0,
    age: 2,
    order: "auto",
    heading: { x: 1, y: 0 },
  };
  s.units.push(u);
  return u;
}
function advance(s: State, seconds: number) {
  for (let i = 0; i < seconds * 5; i++) step(s);
}
test("50 houses earn 84 gold/s at 24% without accelerating births", () => {
  const s = setup(50);
  assert.ok(Math.abs(goldIncome(s, 0) - 84) < 1e-8);
  assert.ok(birthInterval(24) > 117);
  s.kingdoms[0].tax = 0;
  assert.ok(Math.abs(goldIncome(s, 0) - 0) < 1e-8);
  assert.equal(birthInterval(0), 6);
  s.kingdoms[0].tax = 30;
  assert.ok(Math.abs(goldIncome(s, 0) - 105) < 1e-8);
});
test("starting at automatic 24% taxes, doubled income keeps a 3000 HP builder founding and lets taxes ease", () => {
  const s = setup(50),
    u = troop(s, 20, 30, 3000);
  s.kingdoms[0].gold = 0;
  s.kingdoms[0].automatic = true;
  const before = s.houses.filter((h) => h.team === 0).length;
  advance(s, 30);
  assert.ok(s.houses.filter((h) => h.team === 0).length >= before + 5);
  assert.ok(u.hp > 1000 && u.order !== "merge");
  assert.ok(s.kingdoms[0].tax > 0 && s.kingdoms[0].tax < 24);
  assert.equal(s.kingdoms[0].births, 0);
  assert.ok(s.kingdoms[0].gold >= 0);
});
test("builders waiting for 150 gold stay on their current house instead of commuting or raiding", () => {
  const s = setup(),
    h = s.houses.find((h) => h.team === 0)!;
  tile(s, h.x + 1, h.y)!.terrain = "tree";
  const us = Array.from({ length: 3 }, () => troop(s, h.x, h.y, 100));
  s.kingdoms[0].gold = 0;
  advance(s, 10);
  const residents = s.units.filter((u) => us.some((v) => v.id === u.id));
  assert.equal(residents.length, 1);
  assert.equal(residents[0].x, h.x);
  assert.equal(residents[0].y, h.y);
  assert.equal(residents[0].order, "rest");
  assert.equal(residents[0].hp, 300);
  assert.equal(tile(s, h.x + 1, h.y)!.terrain, "tree");
  assert.ok(s.kingdoms[0].gold > 40 && s.kingdoms[0].gold < 150);
  advance(s, 35);
  assert.ok(s.houses.filter((h) => h.team === 0).length > 5);
});
test("a chosen foundation is built on arrival without a second random decision", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const s = setup(),
      u = troop(s, 20, 30, 300);
    u.target = { x: 20, y: 30 };
    s.rng = seed;
    step(s);
    assert.ok(tile(s, 20, 30)!.house);
    assert.ok(u.hp > 190 && u.hp < 201);
  }
});
test("a fusion waits for the whole group, survives save/load, then resumes building", () => {
  let s = setup(50);
  const a = troop(s, 20),
    b = troop(s, 14);
  const ids = [a.id, b.id];
  command(s, ids, "merge", { x: 26, y: 30 });
  for (let i = 0; i < 50 && a.x !== 26; i++) step(s);
  assert.equal(a.x, 26);
  assert.ok(b.hp > 0);
  assert.equal(a.order, "merge");
  assert.equal(tile(s, 26, 30)!.house, undefined);
  s = loadGame(saveGame(s))!;
  assert.ok(s);
  for (let i = 0; i < 100 && s.units.some((u) => u.order === "merge"); i++)
    step(s);
  const survivors = s.units.filter((u) => ids.includes(u.id));
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].order, "auto");
  assert.equal(survivors[0].mergeGroup, undefined);
  advance(s, 3);
  assert.ok(tile(s, 26, 30)!.house);
});
test("fusion into an unselected stationed ally retains the group until its last member arrives", () => {
  const s = setup(50),
    a = troop(s, 20, 30, 300),
    b = troop(s, 14, 30, 300),
    idle = troop(s, 26, 30, 700);
  idle.order = "hold";
  command(s, [a.id, b.id], "merge", { x: 26, y: 30 });
  for (let i = 0; i < 50 && a.hp > 0; i++) step(s);
  assert.equal(idle.order, "merge");
  assert.ok(b.hp > 0);
  assert.equal(idle.pursue, undefined);
  for (let i = 0; i < 100 && s.units.some((u) => u.order === "merge"); i++)
    step(s);
  assert.equal(
    s.units.filter((u) => [a.id, b.id, idle.id].includes(u.id)).length,
    1,
  );
  assert.ok(!s.units.some((u) => u.order === "merge"));
  advance(s, 3);
  assert.ok(tile(s, 26, 30)!.house);
});
for (const cancelled of [false, true])
  test(`a fusion resumes when its missing member is ${cancelled ? "given another order" : "dead"}`, () => {
    const s = setup(50),
      a = troop(s, 26),
      b = troop(s, 14);
    command(s, [a.id, b.id], "merge", { x: 26, y: 30 });
    if (cancelled) command(s, [b.id], "hold");
    else b.hp = 0;
    step(s);
    assert.equal(a.order, "auto");
    assert.equal(a.mergeGroup, undefined);
  });
test("legacy fusion saves without a group tag also resume once the group has arrived", () => {
  const s = setup(50),
    a = troop(s, 20),
    b = troop(s, 14);
  command(s, [a.id, b.id], "merge", { x: 26, y: 30 });
  delete a.mergeGroup;
  delete b.mergeGroup;
  const loaded = loadGame(saveGame(s))!;
  assert.ok(loaded);
  advance(loaded, 15);
  assert.ok(!loaded.units.some((u) => u.order === "merge"));
  assert.ok(tile(loaded, 26, 30)!.house);
});

test("zero taxes generate no gold, including dams, on a frozen kingdom", () => {
  const s = setup(50);
  s.kingdoms[0].tax = 0;
  tile(s, 30, 30)!.terrain = "dam";
  tile(s, 30, 30)!.owner = 0;
  const before = s.kingdoms[0].gold;
  assert.equal(goldIncome(s, 0), 0);
  step(s, 1);
  assert.equal(s.kingdoms[0].gold, before);
});
test("gold rises and births slow continuously across every tax rate for every kingdom", () => {
  const s = setup();
  for (const k of s.kingdoms) {
    const homes = s.houses.filter((h) => h.team === k.id).length;
    let previousGold = -1,
      previousInterval = -1;
    for (let tax = 0; tax <= 30; tax++) {
      k.tax = tax;
      const income = goldIncome(s, k.id),
        interval = birthInterval(tax);
      assert.ok(Math.abs(income - homes * tax * 0.07) < 1e-8);
      assert.ok(income > previousGold && interval > previousInterval);
      previousGold = income;
      previousInterval = interval;
    }
  }
});
test("residents already sharing a house can fuse there and resume their doctrine", () => {
  const s = setup(50),
    a = troop(s, 20),
    b = troop(s, 20),
    c = troop(s, 20);
  const ids = [a.id, b.id, c.id];
  command(s, ids, "merge", { x: 20, y: 30 });
  advance(s, 2);
  assert.equal(s.units.filter((u) => ids.includes(u.id)).length, 1);
  assert.ok(!s.units.some((u) => u.order === "merge"));
});
