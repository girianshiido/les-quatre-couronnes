import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import {
  actorFrame,
  monsterFrame,
  terrainFrame,
  TERRAIN_FRAMES,
} from "../src/atlas.ts";
import { Renderer } from "../src/render.ts";
import { createGame } from "../src/engine.ts";
const [actors, world, buildings] = await Promise.all(
  ["actors", "world", "buildings"].map((n) => loadImage(`public/art/${n}.png`)),
);
const hash = (x: number, y: number, w: number, h: number, img = actors) => {
  const c = createCanvas(w, h),
    ctx = c.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return createHash("sha256")
    .update(ctx.getImageData(0, 0, w, h).data)
    .digest("hex");
};
test("all 216 directional actor frames are distinct, populated and in the atlas bounds", () => {
  assert.deepEqual([actors.width, actors.height], [512, 1728]);
  const hashes = new Set<string>();
  for (let role = 0; role < 3; role++)
    for (let team = 0; team < (role === 2 ? 1 : 4); team++)
      for (let rank = 0; rank < 3; rank++)
        for (const dir of ["front", "back", "left", "right"])
          for (let pose = 0; pose < 2; pose++) {
            const f =
              role === 2
                ? monsterFrame(rank, dir, pose)
                : actorFrame(team, rank, dir, pose, role === 1);
            assert.ok(
              f.x >= 0 &&
                f.x + 64 <= actors.width &&
                f.y >= 0 &&
                f.y + 64 <= actors.height,
            );
            hashes.add(hash(f.x, f.y, 64, 64));
          }
  assert.equal(hashes.size, 216);
});
test("five biomes and every terrain variant fit the committed world atlas", () => {
  assert.deepEqual([world.width, world.height], [256, 1920]);
  for (let b = 0; b < 5; b++)
    for (const kind of TERRAIN_FRAMES)
      for (let v = 0; v < 8; v++) {
        const f = terrainFrame(b, kind, v);
        assert.ok(f.x + 32 <= world.width && f.y + 32 <= world.height);
      }
  assert.equal(
    new Set(
      Array.from({ length: 5 }, (_, b) => {
        const f = terrainFrame(b, "tree", 0);
        return hash(f.x, f.y, 32, 32, world);
      }),
    ).size,
    5,
  );
  assert.deepEqual([buildings.width, buildings.height], [512, 640]);
});
test("loaded actors and houses use single image copies; terrain cache is reused", () => {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => createCanvas(1, 1),
  } as unknown as Document;
  const r = new Renderer(
    createCanvas(900, 900) as unknown as HTMLCanvasElement,
  );
  globalThis.document = prev;
  r.atlases = { actors, world, buildings } as any;
  r.width = 900;
  r.height = 900;
  let fills = 0,
    images = 0;
  const fill = r.ctx.fillRect.bind(r.ctx),
    draw = r.ctx.drawImage.bind(r.ctx);
  r.ctx.fillRect = (...args) => {
    fills++;
    fill(...args);
  };
  r.ctx.drawImage = ((...args: any[]) => {
    images++;
    (draw as any)(...args);
  }) as any;
  r.sprite(r.ctx, 100, 100, 0, "front", 2, 0, true);
  r.house(r.ctx, 10, 10, 0);
  r.monsterSprite(r.ctx, 200, 200, { x: 1, y: 0 }, 12000);
  assert.equal(fills, 0);
  assert.equal(images, 3);
  const s = createGame();
  r.draw(s, new Set());
  const key = r.cached;
  let repaints = 0;
  r.paintTerrain = () => {
    repaints++;
  };
  r.draw(s, new Set());
  assert.ok(key);
  assert.equal(repaints, 0);
});

test("houses including their shadows stay entirely inside one tile", () => {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => createCanvas(1, 1),
  } as unknown as Document;
  const canvas = createCanvas(64, 64),
    r = new Renderer(canvas as unknown as HTMLCanvasElement);
  globalThis.document = prev;
  r.atlases = { actors, world, buildings } as any;
  r.ctx.imageSmoothingEnabled = false;
  for (let team = 0; team < 4; team++) {
    r.ctx.clearRect(0, 0, 64, 64);
    r.house(r.ctx, 1, 1, team);
    const pixels = r.ctx.getImageData(0, 0, 64, 64).data;
    let visible = 0;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        if (pixels[(y * 64 + x) * 4 + 3]) {
          assert.ok(
            x >= 16 && x < 32 && y >= 16 && y < 32,
            `outside tile: ${x},${y}`,
          );
          visible++;
        }
    assert.ok(visible > 50);
  }
});
