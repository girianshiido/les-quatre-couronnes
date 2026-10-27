import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Renderer } from "../src/render.ts";
import { createGame, tile, addHouse } from "../src/engine.ts";
import { terrainFrame } from "../src/atlas.ts";
const [actors, world, buildings] = await Promise.all(
  ["actors", "world", "buildings"].map((n) => loadImage(`public/art/${n}.png`)),
);
function renderer() {
  const old = globalThis.document;
  globalThis.document = { createElement: () => createCanvas(1, 1) } as any;
  const r = new Renderer(createCanvas(768, 768) as any);
  globalThis.document = old;
  r.atlases = { actors, world, buildings } as any;
  r.width = 768;
  r.height = 768;
  r.zoom = 1;
  return r;
}
test("clearing one tree repaints only its tile and the affected neighbour masks", () => {
  const s = createGame(),
    r = renderer();
  r.draw(s, new Set());
  let copies = 0;
  const ctx = r.tctx as any,
    draw = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...a: any[]) => {
    copies++;
    draw(...a);
  };
  const p = s.tiles.findIndex((t) => t.terrain === "tree");
  s.tiles[p].terrain = "grass";
  s.stats.cleared++;
  r.draw(s, new Set());
  assert.ok(copies > 0 && copies < 20, `${copies} terrain copies`);
  copies = 0;
  r.draw(s, new Set());
  assert.equal(copies, 0);
});
test("gazon updates erase destroyed influence locally without resizing its canvas", () => {
  const s = createGame(),
    r = renderer();
  s.time = 20;
  r.draw(s, new Set());
  const width = r.influence.width;
  const h = s.houses[0];
  s.clearedTurf[h.y * s.size + h.x] = h.id;
  s.turfRevision++;
  r.draw(s, new Set());
  assert.equal(r.influence.width, width);
  const data = r.influence
    .getContext("2d")!
    .getImageData(h.x * 16, h.y * 16, 16, 16).data;
  assert.ok(!data.some((v, i) => i % 4 === 3 && v));
});
test("ground and water in every biome have matching variable opposite edges, without divider strips", () => {
  const c = createCanvas(32, 32),
    ctx = c.getContext("2d");
  for (let biome = 0; biome < 5; biome++)
    for (const kind of ["grass", "water"] as const) {
      const f = terrainFrame(biome, kind, 0);
      ctx.drawImage(world, f.x, f.y, 32, 32, 0, 0, 32, 32);
      const p = ctx.getImageData(0, 0, 32, 32).data;
      const colour = (x: number, y: number) =>
        Array.from(p.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));
      for (let n = 0; n < 32; n++) {
        assert.deepEqual(colour(0, n), colour(31, n));
        assert.deepEqual(colour(n, 0), colour(n, 31));
      }
      assert.ok(
        new Set(Array.from({ length: 32 }, (_, n) => colour(n, 0).join()))
          .size > 1,
      );
    }
});
test("connected mountain atlas pieces differ with their neighbouring cells", () => {
  const r = renderer(),
    s = createGame(1);
  const x = 20,
    y = 10;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = tile(s, x + dx, y + dy)!;
      t.terrain = "grass";
      delete t.permanent;
    }
  r.paintTerrain(s);
  tile(s, x, y)!.terrain = "rock";
  tile(s, x, y)!.permanent = true;
  s.stats.cleared++;
  r.paintTerrain(s);
  const before = r.tctx.getImageData(x * 16, y * 16, 16, 16).data;
  tile(s, x + 1, y)!.terrain = "rock";
  tile(s, x + 1, y)!.permanent = true;
  s.stats.cleared++;
  r.paintTerrain(s);
  const after = r.tctx.getImageData(x * 16, y * 16, 16, 16).data;
  assert.notDeepEqual(before, after);
});
