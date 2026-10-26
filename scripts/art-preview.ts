import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { createGame, step } from "../src/engine.ts";
import { Renderer } from "../src/render.ts";
import { actorFrame, terrainFrame } from "../src/atlas.ts";
const imgs = await Promise.all(
  ["actors", "world", "buildings"].map((n) => loadImage(`public/art/${n}.png`)),
);
const [actors, world, buildings] = imgs;
const c = createCanvas(1040, 620),
  ctx = c.getContext("2d");
ctx.fillStyle = "#182a30";
ctx.fillRect(0, 0, 1040, 620);
ctx.imageSmoothingEnabled = false;
ctx.font = "22px sans-serif";
ctx.fillStyle = "#f5dfad";
ctx.fillText("Les Quatre Couronnes · Nouveaux atlas", 24, 34);
for (let team = 0; team < 4; team++)
  for (let rank = 0; rank < 3; rank++)
    for (let royal = 0; royal < 2; royal++) {
      const f = actorFrame(team, rank, "front", 0, !!royal);
      ctx.drawImage(
        actors,
        f.x,
        f.y,
        64,
        64,
        24 + (rank + royal * 3) * 76,
        58 + team * 84,
        76,
        76,
      );
    }
for (let team = 0; team < 4; team++) {
  ctx.drawImage(
    buildings,
    team * 128,
    0,
    128,
    128,
    520 + team * 128,
    52,
    128,
    128,
  );
  ctx.drawImage(
    buildings,
    team * 128,
    128,
    128,
    128,
    520 + team * 128,
    184,
    128,
    128,
  );
}
for (let b = 0; b < 5; b++)
  for (let k = 0; k < 3; k++) {
    const f = terrainFrame(b, ["grass", "tree", "rock"][k] as any, 2);
    ctx.drawImage(world, f.x, f.y, 32, 32, 24 + b * 200 + k * 58, 448, 58, 58);
  }
for (let dir = 0; dir < 4; dir++) {
  const f = actorFrame(0, 1, ["front", "back", "left", "right"][dir], 1, true);
  ctx.drawImage(actors, f.x, f.y, 64, 64, 530 + dir * 105, 320, 90, 90);
}
mkdirSync("qa", { recursive: true });
writeFileSync("qa/new-art.png", c.toBuffer("image/png"));
const prev = globalThis.document;
globalThis.document = { createElement: () => createCanvas(1, 1) } as any;
const canvas = createCanvas(1100, 900),
  r = new Renderer(canvas as any);
globalThis.document = prev;
r.width = 1100;
r.height = 900;
r.zoom = 1.55;
r.ox = 0;
r.oy = 0;
const s = createGame();
for (let i = 0; i < 150; i++) step(s);
for (const atlas of [false, true]) {
  r.atlases = atlas ? ({ actors, world, buildings } as any) : undefined;
  r.cached = "";
  r.influenceKey = "";
  r.draw(s, new Set());
  writeFileSync(
    `qa/map-${atlas ? "atlas" : "legacy"}.png`,
    canvas.toBuffer("image/png"),
  );
  let samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    let start = performance.now();
    r.draw(s, new Set());
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log({
    atlas,
    units: s.units.length,
    homes: s.houses.length,
    medianFrameMs: samples[20],
    p90: samples[36],
  });
}
