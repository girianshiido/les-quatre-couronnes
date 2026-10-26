import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { Renderer } from "../src/render.ts";
const [actors,world,buildings]=await Promise.all(['actors','world','buildings'].map(n=>loadImage(`public/art/${n}.png`)));
const atlases={actors,world,buildings} as unknown as import('../src/atlas.ts').Atlases;

const c = createCanvas(768, 640),
  ctx = c.getContext("2d");
ctx.fillStyle = "#152b29";
ctx.fillRect(0, 0, 768, 640);
ctx.imageSmoothingEnabled = false;
for (let team = 0; team < 4; team++)
  for (let rank = 0; rank < 3; rank++)
    for (let d = 0; d < 4; d++)
      for (let frame = 0; frame < 2; frame++) {
        ctx.save();
        ctx.translate((d * 2 + frame) * 96 + 48, team * 160 + rank * 50 + 35);
        ctx.scale(2, 2);
        Renderer.prototype.sprite.call(
          {atlases} as Renderer,
          ctx,
          0,
          0,
          team,
          ["front", "back", "left", "right"][d],
          rank,
          frame,
        );
        ctx.restore();
      }
writeFileSync("public/sprites-atlas.png", c.toBuffer("image/png"));
const kings = createCanvas(768, 200),
  kc = kings.getContext("2d");
kc.fillStyle = "#152b29";
kc.fillRect(0, 0, 768, 200);
for (let t = 0; t < 4; t++)
  for (let d = 0; d < 4; d++)
    for (let f = 0; f < 2; f++) {
      kc.save();
      kc.translate((d * 2 + f) * 96 + 48, t * 50 + 27);
      kc.scale(2, 2);
      Renderer.prototype.sprite.call(
        {atlases} as Renderer,
        kc,
        0,
        0,
        t,
        ["front", "back", "left", "right"][d],
        0,
        f,
        true,
      );
      kc.restore();
    }
writeFileSync("public/kings-atlas.png", kings.toBuffer("image/png"));
console.log(
  "Sprite atlas: four teams × three tiers × four directions × two frames.",
);
