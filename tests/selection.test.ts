import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, type Unit } from "../src/engine.ts";
import { rectangleSelection, clickSelection } from "../src/selection.ts";
const king = createGame().units[0];
const a: Unit = { ...king, id: 100, royal: false, x: 12, y: 13 },
  b: Unit = { ...a, id: 101, x: 14 };
const units = [king, a, b];
const project = (u: Unit) => ({ x: u.x, y: u.y });
test("a rectangle across the king selects the surrounding inhabitants and silently ignores the king", () => {
  assert.deepEqual(
    [
      ...rectangleSelection(
        units,
        new Set(),
        { x: 11, y: 12, w: 4, h: 2 },
        project,
      ),
    ],
    [100, 101],
  );
});
test("a rectangle containing only the king is an empty selection", () => {
  assert.equal(
    rectangleSelection(
      units,
      new Set(),
      { x: 12.9, y: 12.9, w: 0.2, h: 0.2 },
      project,
    ).size,
    0,
  );
});
test("an additive rectangle removes a previously selected king", () => {
  assert.deepEqual(
    [
      ...rectangleSelection(
        units,
        new Set([king.id]),
        { x: 11, y: 12, w: 4, h: 2 },
        project,
        true,
      ),
    ],
    [100, 101],
  );
});
test("a direct click selects the king alone even with an additive modifier", () => {
  assert.deepEqual(
    [...clickSelection(units, new Set([100, 101]), king, true)],
    [king.id],
  );
});
test("clicking an ordinary inhabitant after the king removes the king from the group", () => {
  assert.deepEqual(
    [...clickSelection(units, new Set([king.id]), a, true)],
    [100],
  );
});
