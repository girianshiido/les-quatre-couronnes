import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, LEVELS, tile, saveGame, loadGame } from "../src/engine.ts";

test("every campaign level uses a valid 48 by 48 map across several seeds", () => {
  for (let level = 0; level < LEVELS.length; level++)
    for (const seed of [1, 5321, 14243, 63353, 98914, 79191]) {
      const s = createGame(level, seed);
      assert.equal(s.size, 48);
      assert.equal(s.tiles.length, 2304);
      for (const k of s.kingdoms) {
        assert.equal(
          s.tiles.filter((t) => t.castle === k.id).length,
          9,
          `${level}, ${seed}, castle ${k.id}`,
        );
        assert.equal(
          s.houses.filter((h) => h.team === k.id).length,
          k.id === 0
            ? level === 0
              ? 5
              : 4
            : level === 0
              ? 2
              : LEVELS[level].enemyHouses,
        );
      }
      assert.ok(s.houses.every((h) => tile(s, h.x, h.y)?.house === h.id));
      assert.equal(
        s.caves.length,
        LEVELS[level].caves ? (LEVELS[level].stage === 4 ? 2 : 1) : 0,
      );
      for (const c of s.caves) {
        assert.equal(tile(s, c.x, c.y)?.cave, c.id);
        assert.equal(tile(s, c.x, c.y)?.castle, undefined);
        assert.equal(tile(s, c.x, c.y)?.house, undefined);
      }
      assert.ok(
        loadGame(saveGame(s)),
        `${level}, ${seed}: saved map remains valid`,
      );
    }
});
test("legacy 64 and 80 square saves preserve their original geography and units", () => {
  const current = LEVELS[0].size;
  for (const size of [64, 80]) {
    let original;
    try {
      LEVELS[0].size = size;
      original = createGame(0, 5321);
    } finally {
      LEVELS[0].size = current;
    }
    const loaded = loadGame(saveGame(original))!;
    assert.equal(loaded.size, size);
    assert.deepEqual(loaded.tiles, original.tiles);
    assert.deepEqual(loaded.units, original.units);
    assert.equal(createGame().size, 48);
  }
});
