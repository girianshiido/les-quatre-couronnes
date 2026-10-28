import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  chooseAlliance,
  areAllied,
  resolveEncounter,
  step,
  command,
  tile,
  addHouse,
  assaultHouse,
  destroyTurf,
  resting,
  attackStructure,
  loadGame,
  saveGame,
  razeHouse,
  type State,
  type Unit,
} from "../src/engine";
import { destinationActions } from "../src/orders";

function scene(partner = 1) {
  const s = createGame();
  assert.ok(chooseAlliance(s, partner));
  for (const k of s.kingdoms) {
    k.automatic = false;
    k.tax = 0;
    k.gold = 100000;
  }
  for (const u of s.units) {
    u.order = "hold";
    u.wait = 999;
  }
  for (let y = 16; y <= 26; y++)
    for (let x = 16; x <= 28; x++) {
      const t = tile(s, x, y)!;
      t.terrain = "grass";
      delete t.permanent;
    }
  return s;
}
function unit(s: State, team: number, x = 20, y = 20, hp = 1000): Unit {
  const u: Unit = {
    id: s.nextId++,
    team,
    x,
    y,
    hp,
    age: 10,
    wait: 999,
    order: "hold",
    heading: { x: 0, y: 1 },
  };
  s.units.push(u);
  return u;
}
for (const partner of [1, 2, 3]) {
  test(`partner ${partner}: two symmetric pairs; neutral monsters never allied`, () => {
    const s = scene(partner),
      others = [1, 2, 3].filter((t) => t !== partner);
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++)
        assert.equal(
          areAllied(s, a, b),
          a === b || [0, partner].includes(a) === [0, partner].includes(b),
        );
    assert.ok(areAllied(s, others[0], others[1]));
    for (let t = 0; t < 4; t++) assert.equal(areAllied(s, t, 4), false);
    const a = unit(s, 0),
      b = unit(s, partner, 21, 20, 100);
    const sum = a.hp + b.hp;
    resolveEncounter(s, a, b);
    assert.equal(a.hp + b.hp, sum);
    assert.ok(a.hp && b.hp);
    assert.equal(s.stats.merged, 0);
  });
}
test("same crown still merges; rival alliances still fight", () => {
  const s = scene(),
    a = unit(s, 0),
    b = unit(s, 0, 20, 20, 100);
  const merged = resolveEncounter(s, a, b)!;
  assert.equal(a.hp + b.hp, 1100);
  assert.equal(s.stats.merged, 1);
  const enemy = unit(s, 2, 21, 20, 100);
  resolveEncounter(s, merged, enemy);
  assert.equal(enemy.hp, 0);
  assert.ok(merged.hp < 1100);
});
test("units cross an allied occupied cell without merging, then keep travelling", () => {
  const s = scene(),
    a = unit(s, 0),
    b = unit(s, 1, 21, 20, 100);
  command(s, [a.id], "move", { x: 22, y: 20 });
  step(s);
  assert.deepEqual({ x: a.x, y: a.y }, { x: 21, y: 20 });
  assert.ok(b.hp > 0);
  assert.equal(s.stats.merged, 0);
  assert.equal(s.units.filter((u) => u.x === 21 && u.y === 20).length, 2);
  a.wait = 0;
  step(s);
  assert.equal(a.x, 22);
  assert.ok(b.hp > 0);
});
test("houses, turf, kings and structures of the allied crown are protected", () => {
  const s = scene(),
    a = unit(s, 0);
  assert.ok(addHouse(s, 1, 21, 20, false));
  s.time = 20;
  const house = s.houses.find((h) => h.x === 21 && h.y === 20)!;
  assert.equal(assaultHouse(s, house, a), false);
  assert.equal(house.damage, undefined);
  assert.equal(destroyTurf(s, { x: 21, y: 21 }, 0, 1000), 0);
  assert.deepEqual(s.clearedTurf, {});
  const b = {
    id: s.nextId++,
    kind: "barricade" as const,
    team: 1,
    hp: 1500,
    maxHp: 1500,
    cells: [{ x: 23, y: 20 }],
  };
  s.structures.push(b);
  assert.equal(attackStructure(s, a, b), false);
  assert.equal(b.hp, 1500);
  const king = s.units.find((u) => u.royal && u.team === 1)!;
  resolveEncounter(s, a, king);
  assert.equal(king.hp, 100);
  assert.ok(s.kingdoms[1].alive);
  command(s, [a.id], "move", house);
  step(s);
  assert.equal(a.x, 21);
  assert.ok(resting(s, a));
  assert.ok(s.houses.includes(house));
});
test("contextual orders offer movement and shelter, never attacks against a partner", () => {
  const s = scene(),
    a = unit(s, 0);
  const king = s.units.find((u) => u.royal && u.team === 1)!;
  assert.ok(
    destinationActions(s, [a], king).every(
      (o) => o.order !== "attack" && o.order !== "merge",
    ),
  );
  addHouse(s, 1, 21, 20, false);
  const actions = destinationActions(s, [a], { x: 21, y: 20 });
  assert.ok(actions.some((a) => a.order === "shelter"));
  assert.ok(actions.every((a) => a.order !== "attack"));
});
test("AI does not defend against or raid its partner, even a vulnerable king nearby", () => {
  const s = scene(),
    a = unit(s, 1, 20, 20, 20000);
  const ally = s.units.find((u) => u.royal && u.team === 0)!;
  ally.x = 21;
  ally.y = 20;
  ally.hp = 20;
  a.order = "auto";
  a.wait = 0;
  step(s);
  assert.ok(ally.hp > 0);
  assert.notEqual(a.pursue, ally.id);
  assert.notEqual(a.defending, ally.id);
});
test("the pact breaks only when an entire alliance disappears, without granting victory early", () => {
  const s = scene();
  for (const h of [...s.houses].filter((h) => h.team === 2)) razeHouse(s, h);
  step(s);
  assert.equal(s.alliance!.broken, false);
  assert.equal(s.result, "playing");
  for (const h of [...s.houses].filter((h) => h.team === 3)) razeHouse(s, h);
  step(s);
  assert.equal(s.alliance!.broken, true);
  assert.equal(areAllied(s, 0, 1), false);
  assert.equal(s.result, "playing");
  const a = unit(s, 0),
    b = unit(s, 1, 21, 20, 100);
  resolveEncounter(s, a, b);
  assert.equal(b.hp, 0);
});
test("surviving former allies on one cell fight when the pact breaks", () => {
  const s = scene(),
    a = unit(s, 0),
    b = unit(s, 1, 20, 20, 100);
  for (const h of [...s.houses].filter((h) => h.team >= 2)) razeHouse(s, h);
  step(s);
  assert.ok(s.alliance!.broken);
  assert.equal(b.hp, 0);
  assert.ok(a.hp > 0);
});
test("alliance selection is optional, editable before start and locked after play", () => {
  const s = scene();
  assert.ok(chooseAlliance(s, 3));
  assert.ok(chooseAlliance(s));
  assert.equal(s.alliance, undefined);
  assert.equal(chooseAlliance(s, 4), false);
  assert.equal(chooseAlliance(s, 0), false);
  assert.ok(chooseAlliance(s, 2));
  s.battleStarted = true;
  assert.equal(chooseAlliance(s, 1), false);
  s.battleStarted = false;
  step(s);
  assert.equal(chooseAlliance(s), false);
});
test("saves preserve active/broken pacts and migrate legacy games without adding alliances", () => {
  const s = scene(3);
  assert.deepEqual(loadGame(saveGame(s))!.alliance, s.alliance);
  s.alliance!.broken = true;
  s.battleStarted = true;
  const loaded = loadGame(saveGame(s))!;
  assert.equal(loaded.alliance!.broken, true);
  assert.equal(loaded.battleStarted, true);
  const old = JSON.parse(saveGame(createGame()));
  delete old.alliance;
  delete old.battleStarted;
  old.time = 12;
  assert.equal(loadGame(JSON.stringify(old))!.alliance, undefined);
  assert.equal(loadGame(JSON.stringify(old))!.battleStarted, true);
  for (const alliance of [
    null,
    {},
    { partner: 0, broken: false },
    { partner: 4, broken: false },
    { partner: 1, broken: "false" },
  ]) {
    old.alliance = alliance;
    assert.equal(loadGame(JSON.stringify(old)), undefined);
  }
});
