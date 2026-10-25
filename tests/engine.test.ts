import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  canHouse,
  addHouse,
  resolveEncounter,
  spawn,
  step,
  command,
  crossing,
  buildCrossing,
  nextStep,
  tile,
  saveGame,
  loadGame,
  refreshKings,
  totalHP,
  sheltered,
  resting,
  bridgeCost,
  destroyStructure,
  attackStructure,
  buildBarricade,
  structureAt,
  type Unit,
} from "../src/engine.ts";
import { tier, direction } from "../src/render.ts";
const unit = (team = 0, hp = 100, x = 20, y = 20): Unit => ({
  id: 100 + team,
  team,
  hp,
  x,
  y,
  age: 0,
  wait: 0,
  order: "auto",
  heading: { x: 0, y: 1 },
});
test("80 × 80, four castles of nine cells; tutorial grants five houses versus two", () => {
  const s = createGame();
  assert.equal(s.size, 80);
  assert.equal(s.tiles.length, 6400);
  assert.equal(s.kingdoms.length, 4);
  for (let team = 0; team < 4; team++) {
    assert.equal(s.tiles.filter((t) => t.castle === team).length, 9);
    assert.equal(
      s.houses.filter((h) => h.team === team).length,
      team === 0 ? 5 : 2,
    );
  }
  for (const h of s.houses)
    for (const other of s.houses)
      if (h !== other)
        assert.ok(
          Math.max(Math.abs(h.x - other.x), Math.abs(h.y - other.y)) > 1,
        );
});
test("houses cannot touch even diagonally; costs are real", () => {
  const s = createGame(),
    h = s.houses[0];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      assert.equal(canHouse(s, h.x + dx, h.y + dy), false);
  const k = s.kingdoms[0];
  tile(s, 20, 20)!.terrain = "grass";
  assert.ok(addHouse(s, 0, 20, 20));
  assert.equal(k.gold, 4900);
  assert.equal(k.wood, 32);
  assert.equal(addHouse(s, 0, 21, 21), false);
});
test("births have exactly 100 HP", () => {
  const s = createGame();
  spawn(s, s.houses[0]);
  assert.equal(s.units.at(-1)!.hp, 100);
});
test("fusion adds all HP; enemy largest always survives including near ties", () => {
  const s = createGame();
  let a = unit(0, 123),
    b = unit(0, 456);
  resolveEncounter(s, a, b);
  assert.equal(a.hp, 579);
  assert.equal(b.hp, 0);
  for (const [x, y] of [
    [101, 100],
    [500, 1],
    [10000, 9999],
    [100, 101],
  ]) {
    a = unit(0, x);
    b = unit(1, y);
    const winner = resolveEncounter(s, a, b)!;
    assert.equal(winner.team, x > y ? 0 : 1);
    assert.ok(winner.hp > 0);
  }
  a = unit(0, 100);
  b = unit(1, 100);
  assert.equal(resolveEncounter(s, a, b), null);
});
test("three sprite tiers including exact 10000 boundary; four directions", () => {
  assert.deepEqual(
    [tier(100), tier(999), tier(1000), tier(10000), tier(10001)],
    [0, 0, 1, 1, 2],
  );
  for (const [heading, d] of [
    [{ x: 0, y: 1 }, "front"],
    [{ x: 0, y: -1 }, "back"],
    [{ x: -1, y: 0 }, "left"],
    [{ x: 1, y: 0 }, "right"],
  ] as const)
    assert.equal(direction({ heading }), d);
});
test("impôts 30 slow each house compared to zero and produce more gold", () => {
  const a = createGame(),
    b = createGame();
  for (const s of [a, b]) {
    s.kingdoms[0].automatic = false;
    s.houses[0].timer = 0;
  }
  safesim(a, 0);
  safesim(b, 30);
  assert.ok(a.kingdoms[0].births > b.kingdoms[0].births);
  assert.ok(b.kingdoms[0].gold > a.kingdoms[0].gold);
  function safesim(s: ReturnType<typeof createGame>, tax: number) {
    s.kingdoms[0].tax = tax;
    for (let i = 0; i < 150; i++) {
      step(s);
      s.units = s.units.filter((u) => u.royal);
    }
  }
});
test("water blocks routing, a complete bridge connects both banks", () => {
  const s = createGame();
  for (let y = 0; y < s.size; y++)
    for (let x = 0; x < s.size; x++) {
      const t = tile(s, x, y)!;
      t.castle = undefined;
      t.house = undefined;
      t.terrain = x === 30 || x === 31 ? "water" : "grass";
    }
  s.houses = [];
  assert.equal(nextStep(s, { x: 28, y: 20 }, { x: 33, y: 20 }, 0), undefined);
  const cr = crossing(s, { x: 30, y: 20 })!;
  assert.equal(cr.cells.length, 2);
  const u = unit(0, 100, 29, 20);
  assert.ok(buildCrossing(s, u, { x: 30, y: 20 }));
  assert.ok(nextStep(s, u, { x: 33, y: 20 }, 0));
  assert.equal(s.kingdoms[0].gold, 4000);
  assert.equal(s.kingdoms[0].wood, 24);
});
test("dam costs stone, remains impassable and yields income", () => {
  const s = createGame();
  for (let x = 20; x < 25; x++)
    tile(s, x, 20)!.terrain = x === 22 ? "water" : "grass";
  const u = unit(0, 100, 21, 20);
  assert.ok(buildCrossing(s, u, { x: 22, y: 20 }, true));
  assert.equal(s.kingdoms[0].stone, 6);
  assert.equal(tile(s, 22, 20)!.terrain, "dam");
  const before = s.kingdoms[0].gold;
  step(s, 1);
  assert.ok(s.kingdoms[0].gold > before);
});
test("commands affect selected own units only, persist through save/load", () => {
  const s = createGame();
  s.units.push(unit(), unit(1));
  command(s, [100, 101], "move", { x: 25, y: 25 });
  assert.equal(s.units.find((u) => u.id === 100)!.order, "move");
  assert.equal(s.units.find((u) => u.id === 101)!.order, "auto");
  const loaded = loadGame(saveGame(s))!;
  assert.deepEqual(loaded, s);
  step(s);
  step(loaded);
  assert.deepEqual(loaded, s);
  assert.equal(loadGame("bad"), undefined);
  assert.equal(loadGame('{"version":2}'), undefined);
});
test("seeded simulations are reproducible; population, HP and resources stay valid", () => {
  const a = createGame(),
    b = createGame();
  for (let i = 0; i < 900; i++) {
    step(a);
    step(b);
  }
  assert.deepEqual(a, b);
  assert.ok(a.stats.cleared > 0);
  assert.ok(a.kingdoms.every((k) => k.births > 0));
  assert.ok(a.houses.length > 11);
  assert.ok(a.units.every((u) => u.hp > 0 && Number.isFinite(u.hp)));
  assert.ok(
    a.kingdoms.every(
      (k) => k.gold >= 0 && k.wood >= 0 && k.tax >= 0 && k.tax <= 30,
    ),
  );
});
test("king elimination yields defeat/victory", () => {
  const s = createGame();
  s.kingdoms[0].alive = false;
  step(s);
  assert.equal(s.result, "lost");
  const v = createGame();
  v.kingdoms.slice(1).forEach((k) => (k.alive = false));
  step(v);
  assert.equal(v.result, "won");
});
test("malformed nested saves are rejected without crashing", () => {
  const s = createGame();
  for (const mutate of [
    (v: any) => (v.level = 99),
    (v: any) => (v.kingdoms[0].hp = -1),
    (v: any) => (v.units = [{ hp: 5 }]),
    (v: any) => (v.tiles[0].terrain = "lava"),
    (v: any) => (v.events = [{ time: 0, team: 0, text: 2 }]),
    (v: any) => (v.stats = null),
  ]) {
    const v = JSON.parse(saveGame(s));
    mutate(v);
    assert.equal(loadGame(JSON.stringify(v)), undefined);
  }
});
test("all kingdoms start with 5000 gold and a 100 HP movable king on every level", () => {
  for (let level = 0; level < 5; level++) {
    const s = createGame(level);
    for (const k of s.kingdoms) {
      assert.equal(k.gold, 5000);
      const king = s.units.find((u) => u.team === k.id && u.royal)!;
      assert.equal(king.hp, 100);
      assert.ok(sheltered(s, king));
    }
  }
});
test("king gains 25% of army HP; absorbing an ally preserves the full sum", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 0 && u.royal)!;
  const ally = unit(0, 400, king.x, king.y + 1);
  s.units.push(ally);
  refreshKings(s);
  assert.equal(king.hp, 200);
  const sum = totalHP(s, 0);
  assert.equal(resolveEncounter(s, ally, king), king);
  refreshKings(s);
  assert.equal(king.hp, 600);
  assert.equal(totalHP(s, 0), sum);
  assert.equal(ally.hp, 0);
});
test("castle defence requires a large advantage to kill a king", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 1 && u.royal)!;
  const attacker = unit(0, 200, king.x, king.y + 1);
  assert.equal(resolveEncounter(s, attacker, king), king);
  assert.ok(king.hp > 0);
  const huge = unit(0, king.hp * 4 + 1, king.x, king.y + 1);
  assert.equal(resolveEncounter(s, huge, king), huge);
  assert.equal(king.hp, 0);
});
test("a sheltered king does not decay, a king outside quickly does; return stops the loss", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 0 && u.royal)!;
  for (let i = 0; i < 10; i++) step(s);
  assert.equal(king.hp, 100);
  king.x += 3;
  king.order = "hold";
  for (let i = 0; i < 10; i++) step(s);
  assert.ok(king.hp < 92);
  const hp = king.hp;
  king.x = s.kingdoms[0].castle.x;
  for (let i = 0; i < 10; i++) step(s);
  assert.ok(Math.abs(king.hp - hp) < 0.01);
});
test("holding on an allied house stops ageing for inhabitants and king", () => {
  const s = createGame(),
    h = s.houses[0],
    u = unit(0, 100, h.x, h.y);
  u.order = "hold";
  s.units.push(u);
  assert.ok(resting(s, u));
  const king = s.units.find((v) => v.team === 0 && v.royal)!;
  king.x = h.x;
  king.y = h.y;
  king.order = "hold";
  for (let i = 0; i < 15; i++) step(s);
  assert.equal(u.hp, 100);
  assert.equal(king.hp, 125);
  u.x += 1;
  step(s);
  assert.ok(u.hp < 100);
});
test("empty terrain prompts rapid founding and charges 100 gold", () => {
  const s = createGame(),
    u = unit(0, 100, 20, 20);
  tile(s, 20, 20)!.terrain = "grass";
  u.age = 2;
  u.order = "house";
  u.target = { x: 20, y: 20 };
  s.units.push(u);
  const before = s.kingdoms[0].gold;
  step(s);
  assert.ok(s.houses.some((h) => h.x === 20 && h.y === 20));
  assert.ok(!s.units.includes(u));
  assert.ok(s.kingdoms[0].gold < before - 99);
});
test("clearing costs gold and pauses when the treasury is empty", () => {
  const s = createGame(),
    u = unit(0, 100, 20, 20);
  u.order = "move";
  u.target = { x: 21, y: 20 };
  s.units.push(u);
  tile(s, 21, 20)!.terrain = "tree";
  s.kingdoms[0].gold = 0;
  step(s);
  assert.equal(tile(s, 21, 20)!.terrain, "tree");
  s.kingdoms[0].gold = 10;
  u.wait = 0;
  step(s);
  assert.equal(tile(s, 21, 20)!.terrain, "grass");
  assert.ok(s.kingdoms[0].gold < 9);
  assert.equal(s.kingdoms[0].wood, 37);
});
test("a royal raid razes an enemy house", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 0 && u.royal)!,
    h = s.houses.find((h) => h.team === 1)!;
  king.x = h.x - 1;
  king.y = h.y;
  king.order = "move";
  king.target = { x: h.x, y: h.y };
  tile(s, king.x, king.y)!.terrain = "grass";
  step(s);
  assert.ok(!s.houses.some((v) => v.id === h.id));
  assert.equal(tile(s, h.x, h.y)!.house, undefined);
});
test("a kingdom without houses or inhabitants collapses even with a living king", () => {
  const s = createGame();
  for (const h of s.houses.filter((h) => h.team === 1))
    tile(s, h.x, h.y)!.house = undefined;
  s.houses = s.houses.filter((h) => h.team !== 1);
  step(s);
  assert.equal(s.kingdoms[1].alive, false);
  assert.equal(s.ruins.length, 1);
  assert.equal(s.ruins[0].team, 1);
  assert.equal(s.tiles.filter((t) => t.castle === 1).length, 0);
  assert.ok(loadGame(saveGame(s)));
});
test("a king can move, arrive, hold and retain orders in a save", () => {
  const s = createGame(),
    king = s.units.find((u) => u.team === 0 && u.royal)!;
  const p = { x: king.x + 1, y: king.y };
  command(s, [king.id], "move", p);
  for (let i = 0; i < 6; i++) step(s);
  assert.equal(king.x, p.x);
  assert.equal(king.order, "hold");
  assert.deepEqual(loadGame(saveGame(s)), JSON.parse(saveGame(s)));
});
test("a 1000 HP bridge costs 1000, takes battle damage, and rebuilds for 500 at the saved site", () => {
  const s = createGame();
  for (let y = 0; y < s.size; y++)
    for (let x = 0; x < s.size; x++) {
      const t = tile(s, x, y)!;
      t.terrain = x === 30 || x === 31 ? "water" : "grass";
    }
  const p = { x: 30, y: 20 },
    builder = unit(0, 100, 29, 20);
  assert.equal(bridgeCost(s, p), 1000);
  assert.ok(buildCrossing(s, builder, p));
  const bridge = structureAt(s, p)!;
  assert.equal(bridge.hp, 1000);
  assert.equal(s.kingdoms[0].gold, 4000);
  const weak = unit(1, 100, 32, 20);
  attackStructure(s, weak, bridge);
  assert.equal(weak.hp, 0);
  assert.equal(bridge.hp, 930);
  const strong = unit(1, 2000, 32, 20);
  attackStructure(s, strong, bridge);
  assert.ok(strong.hp > 0);
  assert.equal(tile(s, p.x, p.y)!.terrain, "water");
  assert.equal(bridgeCost(s, p), 500);
  const loaded = loadGame(saveGame(s))!;
  assert.ok(loaded);
  assert.equal(bridgeCost(loaded, p), 500);
  assert.ok(buildCrossing(loaded, builder, p));
  assert.equal(loaded.kingdoms[0].gold, 3500);
  assert.equal(structureAt(loaded, p)!.hp, 1000);
});
test("barricades cost 750 gold, block friendly traffic, can be routed around or attacked", () => {
  const s = createGame();
  for (let y = 18; y < 24; y++)
    for (let x = 18; x < 26; x++) tile(s, x, y)!.terrain = "grass";
  const builder = unit(0, 100, 21, 20),
    p = { x: 22, y: 20 };
  assert.ok(buildBarricade(s, builder, p));
  assert.equal(s.kingdoms[0].gold, 4250);
  assert.equal(s.kingdoms[0].wood, 20);
  let pos = { x: 20, y: 20 };
  for (let i = 0; i < 20 && (pos.x !== 24 || pos.y !== 20); i++) {
    pos = nextStep(s, pos, { x: 24, y: 20 }, 1)!;
    assert.ok(pos);
    assert.notDeepEqual(pos, p);
  }
  assert.deepEqual(pos, { x: 24, y: 20 });
  const b = structureAt(s, p)!;
  assert.equal(b.hp, 1500);
  attackStructure(s, unit(1, 2000, 23, 20), b);
  assert.equal(tile(s, 22, 20)!.terrain, "grass");
  assert.equal(structureAt(s, p), undefined);
});
test("player autonomy never builds bridges, barricades or dams and never clears rocks", () => {
  const s = createGame();
  s.time = 70;
  const u = unit(0, 100, 20, 20);
  u.age = 0;
  s.units.push(u);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    tile(s, 20 + dx, 20 + dy)!.terrain = "rock";
  tile(s, 20, 20)!.terrain = "grass";
  for (let i = 0; i < 30; i++) step(s);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    assert.equal(tile(s, 20 + dx, 20 + dy)!.terrain, "rock");
  assert.equal(s.structures.filter((b) => b.team === 0).length, 0);
  assert.equal(
    s.tiles.filter(
      (t) =>
        t.owner === 0 &&
        (t.terrain === "bridge" ||
          t.terrain === "dam" ||
          t.terrain === "barricade"),
    ).length,
    0,
  );
});
test("idle inhabitants share houses without forced fusion and wake when new land opens", () => {
  const s = createGame();
  for (const h of s.houses.filter((h) => h.team === 0))
    tile(s, h.x, h.y)!.house = undefined;
  s.houses = s.houses.filter((h) => h.team !== 0);
  for (let y = 7; y < 14; y++)
    for (let x = 7; x < 14; x++) {
      const t = tile(s, x, y)!;
      t.terrain = "water";
      delete t.house;
      delete t.castle;
    }
  for (let y = 9; y <= 11; y++)
    for (let x = 9; x <= 11; x++) tile(s, x, y)!.terrain = "grass";
  assert.ok(addHouse(s, 0, 10, 10, false));
  const h = s.houses.find((h) => h.team === 0)!;
  h.timer = 0;
  const a = unit(0, 100, 10, 9),
    b = unit(0, 100, 9, 10);
  b.id = 200;
  s.units.push(a, b);
  for (let i = 0; i < 10; i++) step(s);
  assert.ok(s.units.includes(a) && s.units.includes(b));
  assert.equal(a.order, "rest");
  assert.equal(b.order, "rest");
  assert.ok(resting(s, a) && resting(s, b));
  const hp = a.hp;
  for (let i = 0; i < 10; i++) step(s);
  assert.equal(a.hp, hp);
  tile(s, 12, 10)!.terrain = "grass";
  s.stats.cleared++;
  step(s);
  assert.notEqual(a.order, "rest");
});
test("house founding time is saved for gradual coloured turf", () => {
  const s = createGame();
  s.time = 42;
  tile(s, 20, 20)!.terrain = "grass";
  assert.ok(addHouse(s, 0, 20, 20));
  assert.equal(s.houses.at(-1)!.founded, 42);
  assert.equal(loadGame(saveGame(s))!.houses.at(-1)!.founded, 42);
});
test("inhabitants defend nearby houses automatically but explicit commands remain prioritary", () => {
  const s = createGame();
  tile(s, 20, 23)!.terrain = "grass";
  assert.ok(addHouse(s, 0, 20, 23));
  const defender = unit(0, 500, 20, 22),
    invader = unit(1, 100, 21, 22);
  tile(s, 20, 22)!.terrain = "grass";
  tile(s, 21, 22)!.terrain = "grass";
  invader.wait = 999;
  s.units.push(defender, invader);
  step(s);
  assert.equal(invader.hp, 0);
  assert.ok(defender.hp > 0);
  assert.equal(defender.order, "defend");
  assert.ok(loadGame(saveGame(s)));
  command(s, [defender.id], "move", { x: 20, y: 25 });
  assert.equal(defender.defending, undefined);
  defender.wait = 0;
  step(s);
  assert.notEqual(defender.order, "defend");
  assert.ok(loadGame(saveGame(s)));
});
test("a manual hold order suppresses automatic pursuit of an invader", () => {
  const s = createGame();
  tile(s, 20, 23)!.terrain = "grass";
  addHouse(s, 0, 20, 23);
  const defender = unit(0, 500, 20, 22),
    invader = unit(1, 100, 21, 22);
  defender.order = "hold";
  invader.wait = 999;
  s.units.push(defender, invader);
  step(s);
  assert.equal(defender.order, "hold");
  assert.ok(invader.hp > 99);
  assert.equal(defender.x, 20);
});
