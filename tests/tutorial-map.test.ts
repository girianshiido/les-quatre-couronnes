import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  tile,
  step,
  buildCrossing,
  saveGame,
  loadGame,
  LEVELS,
  type State,
  type Point,
  type Unit,
} from "../src/engine.ts";
function region(s: State, start: Point, types: readonly string[]) {
  const seen = new Set<number>([start.y * s.size + start.x]),
    queue = [start];
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = queue[i].x + dx,
        y = queue[i].y + dy,
        t = tile(s, x, y),
        n = y * s.size + x;
      if (t && types.includes(t.terrain) && !seen.has(n)) {
        seen.add(n);
        queue.push({ x, y });
      }
    }
  return seen;
}
const seeds = [
  14243,
  98914,
  5321,
  ...Array.from({ length: 40 }, (_, i) => i * 7919 + 1),
];
test("the introductory green basin is larger and has more accessible development space across seeds", () => {
  for (const seed of seeds) {
    const s = createGame(0, seed);
    const areas = s.kingdoms.map(
      (k) => region(s, k.castle, ["grass", "tree", "rock"]).size,
    );
    const usable = s.kingdoms.map(
      (k) => region(s, k.castle, ["grass", "tree"]).size,
    );
    assert.ok(
      areas[0] > Math.max(...areas.slice(1)) * 1.1,
      `${seed}: ${areas}`,
    );
    assert.ok(
      usable[0] > Math.max(...usable.slice(1)) * 1.15,
      `${seed}: ${usable}`,
    );
    assert.ok(
      s.tiles.some((t) => t.terrain === "tree") &&
        s.tiles.some((t) => t.terrain === "rock"),
    );
  }
});
test("two finished single-cell bridges join all three opponents through cleared routes without opening green", () => {
  for (const seed of seeds) {
    const s = createGame(0, seed);
    assert.equal(s.structures.length, 2);
    assert.equal(s.stats.bridges, 2);
    assert.equal(s.bridgeSites.length, 2);
    for (const b of s.structures) {
      assert.equal(b.kind, "bridge");
      assert.equal(b.cells.length, 1);
      assert.equal(b.hp, 1000);
      assert.equal(b.construction, undefined);
      assert.notEqual(b.team, 0);
      assert.equal(tile(s, b.cells[0].x, b.cells[0].y)!.terrain, "bridge");
    }
    for (const k of s.kingdoms) {
      assert.equal(k.gold, 5000);
      assert.equal(k.hp, 100);
      const reachable = region(s, k.castle, ["grass", "bridge"]);
      const crowns = s.kingdoms
        .filter((v) => reachable.has(v.castle.y * s.size + v.castle.x))
        .map((v) => v.id);
      assert.deepEqual(crowns, k.id === 0 ? [0] : [1, 2, 3]);
    }
    assert.ok(loadGame(saveGame(s)));
  }
});
test("green can enter the opposing network by explicitly constructing a single bridge", () => {
  const s = createGame(),
    green = region(s, s.kingdoms[0].castle, ["grass", "tree"]),
    opponents = region(s, s.kingdoms[1].castle, ["grass", "tree", "bridge"]);
  let goal: Point | undefined;
  for (let y = 4; y < 30 && !goal; y++)
    for (let x = 1; x < s.size - 1; x++) {
      if (
        tile(s, x, y)!.terrain === "water" &&
        tile(s, x - 1, y)!.terrain === "grass" &&
        green.has(y * s.size + x - 1) &&
        opponents.has(y * s.size + x + 1)
      ) {
        goal = { x, y };
        break;
      }
    }
  assert.ok(goal);
  const u: Unit = {
    id: s.nextId++,
    team: 0,
    x: goal.x - 1,
    y: goal.y,
    hp: 100,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 1, y: 0 },
  };
  assert.ok(buildCrossing(s, u, goal));
  assert.equal(s.kingdoms[0].gold, 4000);
  const reachable = region(s, s.kingdoms[0].castle, [
    "grass",
    "tree",
    "bridge",
  ]);
  assert.ok(
    s.kingdoms.every((k) => reachable.has(k.castle.y * s.size + k.castle.x)),
  );
  assert.equal(s.structures.length, 3);
});
test("tutorial saves retain the prepared bridges and older maps are never retrofitted on load", () => {
  const s = createGame();
  assert.deepEqual(loadGame(saveGame(s)), s);
  for (const b of s.structures)
    for (const p of b.cells) {
      tile(s, p.x, p.y)!.terrain = "water";
      delete tile(s, p.x, p.y)!.owner;
    }
  s.structures = [];
  s.bridgeSites = [];
  s.stats.bridges = 0;
  assert.deepEqual(loadGame(saveGame(s)), s);
});
test("later levels keep their own geography and receive no introductory bridges", () => {
  for (let level = 1; level < LEVELS.length; level++) {
    const s = createGame(level);
    assert.equal(s.structures.filter((b) => b.kind === "bridge").length, 0);
    assert.equal(s.stats.bridges, 0);
  }
});
test("the new introductory geography and bridges remain reproducible for a seed", () => {
  assert.deepEqual(createGame(0, 14243), createGame(0, 14243));
  assert.notDeepEqual(createGame(0, 14243).tiles, createGame(0, 98914).tiles);
});
test("opponents fight across their existing links while green develops behind closed rivers", () => {
  const s = createGame(),
    green = region(s, s.kingdoms[0].castle, ["grass", "tree"]);
  for (let i = 0; i < 1500 && s.result === "playing"; i++) {
    step(s);
    if (s.kingdoms.slice(1).filter((k) => k.alive).length >= 2) {
      assert.equal(s.structures.filter((b) => b.kind === "bridge").length, 2);
      assert.ok(
        !s.units.some((u) => u.team !== 0 && green.has(u.y * s.size + u.x)),
      );
    }
  }
  assert.ok(s.kingdoms[0].alive);
  assert.ok(s.houses.filter((h) => h.team === 0).length > 5);
  assert.ok(s.kingdoms.slice(1).reduce((n, k) => n + k.kills, 0) > 0);
});
