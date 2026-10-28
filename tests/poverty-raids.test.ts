import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  setDoctrine,
  assaultHouse,
  addHouse,
  step,
  tile,
  unitUpkeep,
  suppliedUpkeep,
  saveGame,
  loadGame,
  goldIncome,
  birthInterval,
  type Unit,
} from "../src/engine.ts";
const fighter = (
  s: ReturnType<typeof createGame>,
  hp = 100,
  team = 0,
): Unit => ({
  id: s.nextId++,
  team,
  hp,
  x: 20,
  y: 20,
  age: 5,
  wait: 999,
  order: "hold",
  heading: { x: 1, y: 0 },
});
for (const team of [0, 1, 2, 3, 4])
  test(`faction ${team} cannot erase a whole house with a 100 HP suicide attack`, () => {
    const s = createGame();
    const h = s.houses.find((h) => h.team === (team + 1) % 4)!;
    const u = fighter(s, 100, team);
    const gold = s.kingdoms.map((k) => k.gold);
    assert.equal(assaultHouse(s, h, u), false);
    assert.equal(u.hp, 0);
    assert.equal(h.damage, 95);
    assert.ok(s.houses.includes(h));
    assert.deepEqual(
      s.kingdoms.map((k) => k.gold),
      gold,
    );
    const next = fighter(s, 100, team);
    assert.equal(assaultHouse(s, h, next), false);
    assert.equal(h.damage, 190);
    const last = fighter(s, 100, team);
    assert.equal(assaultHouse(s, h, last), true);
    assert.equal(last.hp, 85);
    assert.ok(!s.houses.includes(h));
  });
test("partial house damage persists across saves and malformed resistance is rejected", () => {
  const s = createGame(),
    h = s.houses.find((h) => h.team === 1)!;
  assaultHouse(s, h, fighter(s));
  assert.equal(
    loadGame(saveGame(s))!.houses.find((v) => v.id === h.id)!.damage,
    95,
  );
  for (const damage of [-1, 200, Infinity, "95"]) {
    const data = JSON.parse(saveGame(s));
    data.houses.find((v: any) => v.id === h.id).damage = damage;
    assert.equal(loadGame(JSON.stringify(data)), undefined);
  }
});
test("a large funded attacker still pays the full house cost in HP and no gold", () => {
  const s = createGame(),
    h = s.houses.find((h) => h.team === 1)!,
    u = fighter(s, 3000);
  const before = s.kingdoms[0].gold;
  assert.equal(assaultHouse(s, h, u), true);
  assert.equal(u.hp, 2650);
  assert.equal(s.kingdoms[0].gold, before);
});
for (const team of [0, 1, 2, 3])
  test(`small field units in kingdom ${team} require funding while small sheltered residents remain safe`, () => {
    const s = createGame();
    for (const k of s.kingdoms) {
      k.automatic = false;
      k.tax = 0;
    }
    for (const h of s.houses) h.timer = 0;
    const u = fighter(s, 100, team);
    s.units.push(u);
    tile(s, 20, 20)!.terrain = "grass";
    assert.equal(unitUpkeep(u), 0.2);
    assert.ok(suppliedUpkeep(s, u) >= 0.2);
    s.kingdoms[team].gold = 0;
    step(s, 1);
    assert.ok(u.hp < 92);
    const home = s.houses.find((h) => h.team === team)!;
    u.x = home.x;
    u.y = home.y;
    const hp = u.hp;
    assert.equal(suppliedUpkeep(s, u), 0);
    step(s, 1);
    assert.equal(u.hp, hp);
  });
test("splitting a 1000 HP army into ten small field units does not avoid its base maintenance", () => {
  const s = createGame(),
    large = fighter(s, 1000);
  const small = Array.from({ length: 10 }, () => fighter(s, 100));
  assert.ok(
    Math.abs(small.reduce((n, u) => n + unitUpkeep(u), 0) - unitUpkeep(large)) <
      1e-10,
  );
});
test("zero tax retains fast 100 HP births and absolutely no income", () => {
  const s = createGame();
  s.kingdoms[0].tax = 0;
  assert.equal(goldIncome(s, 0), 0);
  assert.equal(birthInterval(0), 6);
  assert.ok(birthInterval(2) < 7);
});

for (const tax of [0, 2])
  test(`level-five low-tax rush at ${tax}% cannot erase all three kingdoms in one real minute at x5`, () => {
    const data = readFileSync(
      new URL("./fixtures/low-tax-level5.json", import.meta.url),
      "utf8",
    );
    const s = loadGame(data)!;
    setDoctrine(s, "conqueror");
    s.kingdoms[0].automatic = false;
    s.kingdoms[0].tax = tax;
    for (let i = 0; i < 1500 && s.result === "playing"; i++) step(s);
    assert.notEqual(s.result, "won");
    assert.ok(s.kingdoms.slice(1).filter((k) => k.alive).length >= 2);
    assert.equal(s.kingdoms[0].tax, tax);
    assert.ok(s.kingdoms[0].births > 50);
  });
