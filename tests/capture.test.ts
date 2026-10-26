import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  resolveEncounter,
  refreshKings,
  territoryAt,
  saveGame,
  loadGame,
  spawn,
  step,
  type Unit,
} from "../src/engine.ts";
function attacker(
  s: ReturnType<typeof createGame>,
  team: number,
  hp = 20000,
): Unit {
  const u: Unit = {
    id: s.nextId++,
    team,
    hp,
    x: 20,
    y: 20,
    age: 0,
    wait: 999,
    order: "hold",
    heading: { x: 0, y: 1 },
  };
  s.units.push(u);
  return u;
}
test("taking a king transfers every house, its production cycle and turf without charging gold", () => {
  const s = createGame();
  s.time = 20;
  const king = s.units.find((u) => u.team === 1 && u.royal)!;
  const houses = s.houses.filter((h) => h.team === 1);
  const before = s.houses.filter((h) => h.team === 0).length;
  const timers = houses.map((h) => h.timer);
  const gold = s.kingdoms[0].gold;
  const a = attacker(s, 0);
  resolveEncounter(s, a, king);
  assert.equal(s.kingdoms[1].alive, false);
  assert.equal(
    s.houses.filter((h) => h.team === 0).length,
    before + houses.length,
  );
  assert.ok(houses.every((h) => h.team === 0));
  assert.deepEqual(
    houses.map((h) => h.timer),
    timers,
  );
  assert.ok(houses.every((h) => territoryAt(s, h)?.team === 0));
  assert.equal(s.kingdoms[0].gold, gold);
  assert.equal(s.ruins.filter((r) => r.team === 1).length, 1);
  assert.ok(s.units.filter((u) => u.team === 1).every((u) => u.hp <= 0));
  step(s);
  const loaded = loadGame(saveGame(s));
  assert.ok(loaded);
  assert.ok(
    houses.every((h) => loaded.houses.find((v) => v.id === h.id)?.team === 0),
  );
  spawn(
    loaded,
    loaded.houses.find((h) => h.id === houses[0].id)!,
  );
  assert.equal(loaded.units.at(-1)!.team, 0);
  assert.equal(loaded.units.at(-1)!.hp, 100);
});
test("a defending king inherits the houses of a king whose assault fails", () => {
  const s = createGame();
  const attackingKing = s.units.find((u) => u.team === 0 && u.royal)!;
  const defender = s.units.find((u) => u.team === 1 && u.royal)!;
  const ids = s.houses.filter((h) => h.team === 0).map((h) => h.id);
  resolveEncounter(s, attackingKing, defender);
  assert.equal(s.kingdoms[0].alive, false);
  assert.ok(ids.every((id) => s.houses.find((h) => h.id === id)?.team === 1));
  step(s);
  assert.equal(s.result, "lost");
});
test("capture works between opponents and does not gift their houses to the player", () => {
  const s = createGame();
  const red = s.units.find((u) => u.team === 3 && u.royal)!;
  const ids = s.houses.filter((h) => h.team === 3).map((h) => h.id);
  const own = s.houses.filter((h) => h.team === 0).length;
  resolveEncounter(s, attacker(s, 1), red);
  assert.ok(ids.every((id) => s.houses.find((h) => h.id === id)?.team === 1));
  assert.equal(s.houses.filter((h) => h.team === 0).length, own);
});
test("a king dying without a captor leaves no inherited houses", () => {
  const s = createGame();
  const red = s.units.find((u) => u.team === 3 && u.royal)!;
  const before = s.houses.filter((h) => h.team === 0).length;
  red.reserve = -1;
  refreshKings(s);
  assert.equal(s.kingdoms[3].alive, false);
  assert.equal(s.houses.filter((h) => h.team === 3).length, 0);
  assert.equal(s.houses.filter((h) => h.team === 0).length, before);
});
test("monsters cannot inherit a kingdom and mutual royal deaths have no surviving captor", () => {
  const s = createGame();
  const red = s.units.find((u) => u.team === 3 && u.royal)!;
  resolveEncounter(s, { ...attacker(s, 0), team: 4 }, red);
  assert.ok(s.houses.every((h) => h.team !== 3 && h.team !== 4));
  const a = s.units.find((u) => u.team === 0 && u.royal)!;
  const b = s.units.find((u) => u.team === 1 && u.royal)!;
  a.hp = 2800;
  a.reserve = 2800;
  resolveEncounter(s, a, b);
  assert.equal(s.kingdoms[0].alive, false);
  assert.equal(s.kingdoms[1].alive, false);
  assert.ok(s.houses.every((h) => h.team !== 0 && h.team !== 1));
});
