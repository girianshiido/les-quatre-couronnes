import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { createGame, type Unit } from "../src/engine.ts";
import { Renderer } from "../src/render.ts";
function scene() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => createCanvas(1, 1),
  } as unknown as Document;
  const canvas = createCanvas(800, 600);
  const r = new Renderer(canvas as unknown as HTMLCanvasElement);
  globalThis.document = previous;
  r.width = 800;
  r.height = 600;
  const s = createGame();
  s.units = [100, 12345, 3000, 99].map((hp, team): Unit => ({
    id: team + 100,
    team,
    hp,
    x: 10 + team * 3,
    y: 10,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 0, y: 1 },
    ...(team === 0 ? { royal: true, reserve: 100 } : {}),
  }));
  s.monsters = [
    {
      id: 500,
      hp: 12000,
      x: 24,
      y: 10,
      wait: 0,
      heading: { x: 0, y: 1 },
      cave: 0,
    },
  ];
  const text: string[] = [];
  const fill = r.ctx.fillText.bind(r.ctx);
  r.ctx.fillText = (value, x, y) => {
    text.push(value);
    fill(value, x, y);
  };
  return {
    s,
    r,
    text,
    draw() {
      text.length = 0;
      r.draw(s, new Set([100, 101]));
    },
  };
}
test("no persistent HP labels by default, including selected units, kings, giants and monsters", () => {
  const { r, text, draw } = scene();
  assert.equal(r.showUnitHP, false);
  draw();
  assert.deepEqual(text, []);
});
test("hover displays exact royal, enemy and monster HP at a readable screen scale", () => {
  const { s, r, text, draw } = scene();
  for (const u of [...s.units, s.monsters[0]]) {
    r.pointer = r.screen(u.x, u.y);
    r.pointer.y -= 5;
    draw();
    assert.equal(text.length, 1);
    assert.ok(
      text[0].includes(Math.ceil(u.hp).toLocaleString("fr-FR") + " PV"),
    );
  }
  r.pointer = { x: 0, y: 0 };
  draw();
  assert.deepEqual(text, []);
});
test("the permanent display option applies to all troops and can be disabled again", () => {
  const { s, r, text, draw } = scene();
  r.showUnitHP = true;
  draw();
  assert.equal(text.length, s.units.length + s.monsters.length);
  r.showUnitHP = false;
  draw();
  assert.deepEqual(text, []);
});
test("a stationary cursor follows changing HP and loses the tooltip when the unit leaves", () => {
  const { s, r, text, draw } = scene();
  r.pointer = r.screen(s.units[1].x, s.units[1].y);
  s.units[1].hp = 2345;
  draw();
  assert.ok(text[0].includes("2 345 PV"));
  s.units[1].x += 2;
  draw();
  assert.deepEqual(text, []);
});

test("selected units retain their aura without drawing destination lines", () => {
  const { s, r, draw } = scene();
  for (const u of s.units) u.target = { x: 35, y: 35 };
  let ellipses = 0,
    dashed = 0;
  const ellipse = r.ctx.ellipse.bind(r.ctx),
    dash = r.ctx.setLineDash.bind(r.ctx);
  r.ctx.ellipse = ((...args: Parameters<typeof ellipse>) => {
    ellipses++;
    ellipse(...args);
  }) as typeof r.ctx.ellipse;
  r.ctx.setLineDash = (segments: number[]) => {
    if (segments.length) dashed++;
    dash(segments);
  };
  draw();
  assert.equal(ellipses, 2);
  assert.equal(dashed, 0);
});
