import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  saveGame,
  loadGame,
  LEVELS,
  tile,
  nextStep,
  command,
  step,
  canHouse,
  crossing,
  type Unit,
} from "../src/engine.ts";
import { CAMPAIGN_MAPS } from "../src/campaign-maps.ts";
import { destinationActions } from "../src/orders.ts";
import { monsterCanMove } from "../src/monsters.ts";
for (let level = 0; level < 25; level++)
  test(`fixed map ${level + 1} has stable geometry and four viable starts`, () => {
    const a = createGame(level, 1),
      b = createGame(level, 98765);
    assert.equal(a.size, 48);
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual(
      a.kingdoms.map((k) => k.castle),
      b.kingdoms.map((k) => k.castle),
    );
    assert.ok(loadGame(saveGame(a)));
    for (const k of a.kingdoms) {
      assert.equal(
        a.houses.filter((h) => h.team === k.id).length,
        k.id === 0
          ? level === 0
            ? 5
            : 4
          : level === 0
            ? 2
            : LEVELS[level].enemyHouses,
      );
      assert.equal(a.tiles.filter((t) => t.castle === k.id).length, 9);
    }
    for (let n = 0; n < 48; n++)
      for (const p of [
        { x: n, y: 0 },
        { x: n, y: 47 },
        { x: 0, y: n },
        { x: 47, y: n },
      ])
        assert.ok(tile(a, p.x, p.y)!.permanent);
  });
test("the twenty-five authored grids have unique terrain, beyond biome colours", () => {
  assert.equal(new Set(CAMPAIGN_MAPS.map((m) => m.rows.join(""))).size, 25);
});
test("permanent rock cannot be cleared, built on, crossed, selected as work, or entered by monsters", () => {
  const s = createGame();
  const p = { x: 14, y: 14 };
  const t = tile(s, p.x, p.y)!;
  t.terrain = "rock";
  t.permanent = true;
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x: 13,
    y: 14,
    hp: 3000,
    age: 5,
    wait: 0,
    order: "hold",
    heading: { x: 0, y: 1 },
  };
  s.units.push(u);
  assert.equal(canHouse(s, p.x, p.y), false);
  assert.equal(nextStep(s, u, p, 0), undefined);
  assert.equal(monsterCanMove(s, p), false);
  assert.deepEqual(destinationActions(s, [u], p), []);
  command(s, [u.id], "move", p);
  for (let i = 0; i < 20; i++) step(s);
  assert.equal(tile(s, p.x, p.y)!.terrain, "rock");
  assert.ok(t.permanent);
  const restored = loadGame(saveGame(s))!;
  assert.ok(tile(restored, p.x, p.y)!.permanent);
});
test("outer water cannot be bridged and older saves without permanence retain their geometry", () => {
  const s = createGame(2);
  assert.equal(crossing(s, { x: 0, y: 15 }), undefined);
  for (const t of s.tiles) delete t.permanent;
  const data = saveGame(s);
  assert.deepEqual(loadGame(data)!.tiles, s.tiles);
});
