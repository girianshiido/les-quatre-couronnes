import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  LEVELS,
  tile,
  addHouse,
  step,
  refreshKings,
  resolveEncounter,
  armyCapacity,
  armyHP,
  kingCapacity,
  supportDrain,
  suppliedUpkeep,
  supplyDistance,
  maintenanceCost,
  goldIncome,
  houseDestructionCost,
  razeHouse,
  buildCrossing,
  saveGame,
  loadGame,
  type State,
  type Unit,
} from "../src/engine.ts";
function soldier(
  s: State,
  team: number,
  hp: number,
  x: number,
  y: number,
): Unit {
  const u: Unit = {
    id: s.nextId++,
    team,
    hp,
    x,
    y,
    age: 2,
    wait: 999,
    order: "hold",
    heading: { x: 1, y: 0 },
  };
  s.units.push(u);
  return u;
}
function freeze(s: State) {
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 30;
  }
  for (const h of s.houses) {
    h.timer = 0;
    h.interval = 180;
  }
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
}
for (const team of [0, 1, 2, 3]) {
  test(`kingdom ${team} collapses on its last house despite a rich treasury, king and 3000 HP army`, () => {
    const s = createGame();
    const u = soldier(s, team, 3000, 20, 20);
    s.kingdoms[team].gold = 5000;
    const king = s.units.find((u) => u.team === team && u.royal)!;
    king.reserve = 60000;
    const homes = s.houses.filter((h) => h.team === team);
    for (const h of homes.slice(1)) razeHouse(s, h);
    assert.equal(s.kingdoms[team].alive, true);
    razeHouse(s, homes[0]);
    assert.equal(s.kingdoms[team].alive, false);
    assert.equal(u.hp, 0);
    assert.equal(king.hp, 0);
    assert.equal(s.ruins.filter((r) => r.team === team).length, 1);
    step(s);
    assert.equal(s.result, team === 0 ? "lost" : "playing");
    assert.ok(loadGame(saveGame(s)));
  });
}
test("remaining houses cap royal HP proportionally, including an old overpowered save", () => {
  const s = createGame();
  const king = s.units.find((u) => u.team === 0 && u.royal)!;
  king.reserve = 60000;
  soldier(s, 0, 60000, 20, 20);
  const loaded = loadGame(saveGame(s))!;
  refreshKings(loaded);
  assert.equal(loaded.kingdoms[0].hp, 500);
  razeHouse(
    loaded,
    loaded.houses.find((h) => h.team === 0)!,
  );
  refreshKings(loaded);
  assert.equal(loaded.kingdoms[0].hp, 400);
  assert.equal(kingCapacity(loaded, 0), 400);
});
test("developing houses directly strengthens every king without needing idle soldiers", () => {
  for (const team of [0, 1, 2, 3]) {
    const s = createGame();
    const king = s.units.find((u) => u.team === team && u.royal)!;
    refreshKings(s);
    assert.equal(king.hp, 100);
    tile(s, 20, 20)!.terrain = "grass";
    assert.ok(addHouse(s, team, 20, 20, false));
    refreshKings(s);
    assert.equal(king.hp, 150);
    razeHouse(s, s.houses.at(-1)!);
    assert.equal(king.hp, 100);
  }
});
test("royal absorption cannot bypass the housing ceiling, even before the next step", () => {
  const s = createGame();
  const king = s.units.find((u) => u.team === 0 && u.royal)!;
  const ally = soldier(s, 0, 5000, king.x, king.y + 1);
  resolveEncounter(s, ally, king);
  assert.equal(king.hp, 500);
  assert.equal(ally.hp, 0);
});
test("wounds are not hidden by a capped royal reserve or healed by save/load", () => {
  const s = createGame();
  const king = s.units.find((u) => u.team === 0 && u.royal)!;
  king.reserve = 60000;
  king.x = 20;
  king.y = 20;
  tile(s, 20, 20)!.terrain = "grass";
  refreshKings(s);
  resolveEncounter(s, soldier(s, 1, 100, 21, 20), king);
  assert.equal(king.hp, 430);
  refreshKings(s);
  assert.equal(king.hp, 430);
  s.units = s.units.filter((u) => u.hp > 0);
  const loaded = loadGame(saveGame(s))!;
  refreshKings(loaded);
  assert.equal(loaded.kingdoms[0].hp, 430);
  assert.equal(loaded.units.find((u) => u.id === king.id)!.wounds, 70);
  razeHouse(
    loaded,
    loaded.houses.find((h) => h.team === 0)!,
  );
  refreshKings(loaded);
  assert.equal(loaded.kingdoms[0].hp, 330);
  const bad = JSON.parse(saveGame(s));
  bad.units.find((u: Unit) => u.id === king.id).wounds = -1;
  assert.equal(loadGame(JSON.stringify(bad)), undefined);
});
test("splitting an oversized army does not create more housing support", () => {
  const a = createGame(),
    b = createGame();
  const h = a.houses.find((h) => h.team === 0)!;
  const stack = soldier(a, 0, 3000, h.x, h.y);
  const split = Array.from({ length: 15 }, () => soldier(b, 0, 200, h.x, h.y));
  assert.equal(armyCapacity(a, 0), 1000);
  assert.equal(armyHP(a, 0), armyHP(b, 0));
  assert.ok(
    Math.abs(
      supportDrain(a, stack) -
        split.reduce((n, u) => n + supportDrain(b, u), 0),
    ) < 1e-8,
  );
  assert.ok(Math.abs(supportDrain(a, stack) - 80) < 1e-8);
});
test("supply crosses an open one-cell bridge, but not a closed river", () => {
  const s = createGame();
  for (const t of s.tiles) {
    t.terrain = "rock";
    delete t.castle;
  }
  for (let x = 10; x <= 20; x++) tile(s, x, 25)!.terrain = "grass";
  assert.ok(addHouse(s, 0, 10, 25, false));
  tile(s, 15, 25)!.terrain = "water";
  const u = soldier(s, 0, 3000, 16, 25);
  assert.equal(supplyDistance(s, u), 24);
  const drain = supportDrain(s, u),
    upkeep = suppliedUpkeep(s, u);
  const builder = soldier(s, 0, 100, 14, 25);
  assert.ok(buildCrossing(s, builder, { x: 15, y: 25 }));
  assert.equal(supplyDistance(s, u), 6);
  assert.ok(supportDrain(s, u) < drain);
  assert.ok(suppliedUpkeep(s, u) < upkeep);
});
test("adding houses expands support; losing a supply house immediately weakens an army", () => {
  const s = createGame();
  for (let y = 22; y <= 30; y++)
    for (let x = 8; x <= 40; x++) tile(s, x, y)!.terrain = "grass";
  const u = soldier(s, 0, 3000, 30, 26);
  const before = supportDrain(s, u),
    cost = suppliedUpkeep(s, u);
  assert.ok(addHouse(s, 0, 30, 26, false));
  const h = s.houses.at(-1)!;
  assert.ok(supportDrain(s, u) < before);
  assert.ok(suppliedUpkeep(s, u) < cost);
  razeHouse(s, h);
  assert.equal(supportDrain(s, u), before);
});
function expedition(team: number, supported: boolean, funded: boolean) {
  const currentSize = LEVELS[0].size;
  LEVELS[0].size = 64;
  const s = createGame();
  LEVELS[0].size = currentSize;
  for (const t of s.tiles) t.terrain = "rock";
  for (let y = 28; y <= 34; y++)
    for (let x = 2; x <= 60; x++) tile(s, x, y)!.terrain = "grass";
  for (const h of [...s.houses].filter((h) => h.team === team)) {
    s.houses = s.houses.filter((v) => v.id !== h.id);
    delete tile(s, h.x, h.y)!.house;
  }
  for (let i = 0; i < (supported ? 25 : 10); i++)
    assert.ok(addHouse(s, team, 4 + i * 2, 30, false));
  const enemy = (team + 1) % 4;
  for (let x = 40; x <= 58; x += 2) assert.ok(addHouse(s, enemy, x, 32, false));
  freeze(s);
  s.kingdoms[team].gold = funded ? 5000 : 0;
  const u = soldier(s, team, 3000, 5, 32);
  u.order = "move";
  u.wait = 0;
  u.target = { x: 58, y: 32 };
  let seconds = 0,
    arrivalHP = 0;
  for (let i = 0; i < 350 && u.hp > 0 && u.x < 58; i++) {
    step(s);
    seconds += 0.2;
    if (!arrivalHP && u.x >= 39) arrivalHP = u.hp;
  }
  return {
    s,
    u,
    seconds,
    arrivalHP,
    razed: 10 - s.houses.filter((h) => h.team === enemy && h.y === 32).length,
  };
}
for (const team of [0, 1, 2, 3])
  test(`a remote 3000 HP raid with ten houses cannot sweep kingdom ${team}'s opponent`, () => {
    const poor = expedition(team, false, false);
    const rich = expedition(team, false, true);
    const supported = expedition(team, true, true);
    assert.ok(
      poor.razed <= 6,
      JSON.stringify({ hp: poor.u.hp, razed: poor.razed }),
    );
    assert.ok(
      rich.razed <= 6,
      JSON.stringify({ hp: rich.u.hp, razed: rich.razed }),
    );
    assert.ok(poor.u.hp <= 0);
    assert.ok(
      poor.arrivalHP <= rich.arrivalHP && rich.arrivalHP < supported.arrivalHP,
    );
    assert.ok(poor.arrivalHP < 2000 && rich.arrivalHP < 2000);
    assert.ok(supported.arrivalHP > 2000);
    assert.ok(supported.razed >= 9);
    assert.ok(poor.s.kingdoms[team].gold >= 0);
  });
test("doubled tax revenue can fund a remote 3000 HP army but does not remove the housing support penalty", () => {
  const s = createGame();
  for (let y = 22; y <= 24; y++)
    for (let x = 4; x <= 24; x++) tile(s, x, y)!.terrain = "grass";
  for (let x = 4; x <= 12; x += 2) assert.ok(addHouse(s, 0, x, 24, false));
  freeze(s);
  const u = soldier(s, 0, 3000, 45, 40);
  const homes = s.houses.filter((h) => h.team === 0).length;
  assert.equal(homes, 10);
  assert.equal(armyCapacity(s, 0), 2000);
  assert.ok(Math.abs(goldIncome(s, 0) - 21) < 1e-8);
  assert.ok(maintenanceCost(s, 0) < goldIncome(s, 0));
  assert.ok(supportDrain(s, u) >= 220);
  assert.equal(houseDestructionCost(3000), 350);
});
