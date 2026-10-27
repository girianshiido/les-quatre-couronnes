import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, tile, step, type Unit } from "../src/engine.ts";
import { destinationActions } from "../src/orders.ts";
test("rock clearing costs 15 gold for every faction, waits below 15, and is reflected by contextual orders", () => {
  for (let team = 0; team < 4; team++) {
    const s = createGame();
    for (const k of s.kingdoms) {
      k.tax = 0;
      k.automatic = false;
    }
    for (const u of s.units) {
      u.order = "hold";
      u.wait = 9999;
    }
    for (const h of s.houses) h.timer = 0;
    tile(s, 20, 20)!.terrain = "grass";
    tile(s, 21, 20)!.terrain = "rock";
    const u: Unit = {
      id: s.nextId++,
      team,
      x: 20,
      y: 20,
      hp: 100,
      age: 5,
      wait: 0,
      order: "move",
      target: { x: 21, y: 20 },
      heading: { x: 1, y: 0 },
    };
    s.units.push(u);
    s.kingdoms[team].gold = 14;
    if (team === 0) {
      const a = destinationActions(s, [u], { x: 21, y: 20 });
      assert.ok(a.find((a) => a.order === "move")!.disabled);
      assert.ok(a.find((a) => a.order === "clear-many")!.disabled);
    }
    step(s);
    assert.equal(tile(s, 21, 20)!.terrain, "rock");
    assert.equal(s.kingdoms[team].gold, 14);
    s.kingdoms[team].gold = 15;
    u.wait = 0;
    if (team === 0)
      assert.ok(
        !destinationActions(s, [u], { x: 21, y: 20 }).find(
          (a) => a.order === "move",
        )!.disabled,
      );
    step(s);
    assert.equal(tile(s, 21, 20)!.terrain, "grass");
    assert.equal(s.kingdoms[team].gold, 0);
  }
});
