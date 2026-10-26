import {
  createCanvas,
  loadImage,
  type Canvas,
  type Image,
} from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { actorFrame, monsterFrame, terrainFrame } from "../src/atlas.ts";
const root = "art-source/imagegen";
const [people, props, biomes] = await Promise.all(
  ["characters", "structures", "biomes-final"].map((n) =>
    loadImage(`${root}/${n}.png`),
  ),
);
function crop(
  img: Image,
  x: number,
  y: number,
  w: number,
  h: number,
  trim = true,
) {
  const out = createCanvas(Math.round(w), Math.round(h)),
    ctx = out.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, out.width, out.height);
  if (!trim) return out;
  const { data } = ctx.getImageData(0, 0, out.width, out.height);
  let minX = out.width,
    minY = out.height,
    maxX = -1,
    maxY = -1;
  for (let py = 0; py < out.height; py++)
    for (let px = 0; px < out.width; px++)
      if (data[(py * out.width + px) * 4 + 3] > 32) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
  if (maxX < 0) throw new Error("Empty source sprite");
  const cut = createCanvas(maxX - minX + 1, maxY - minY + 1);
  cut
    .getContext("2d")
    .drawImage(
      out,
      minX,
      minY,
      cut.width,
      cut.height,
      0,
      0,
      cut.width,
      cut.height,
    );
  return cut;
}
const colors = [
  [72, 188, 120],
  [85, 155, 241],
  [239, 198, 72],
  [224, 78, 81],
];
function faction(source: Canvas, team: number) {
  const out = createCanvas(source.width, source.height),
    ctx = out.getContext("2d");
  ctx.drawImage(source, 0, 0);
  if (team === 0) return out;
  const pixels = ctx.getImageData(0, 0, out.width, out.height),
    d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (!d[i + 3] || g < r * 1.13 || g < b * 1.02 || g - r < 10) continue;
    const v = Math.max(r, g, b) / 188;
    const neutral = Math.min(r, g, b) * 0.16;
    for (let k = 0; k < 3; k++)
      d[i + k] = Math.min(
        255,
        Math.round(colors[team][k] * v * 0.93 + neutral),
      );
  }
  ctx.putImageData(pixels, 0, 0);
  return out;
}
function fit(
  dst: Canvas,
  src: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  bottom = false,
) {
  const ctx = dst.getContext("2d"),
    scale = Math.min(w / src.width, h / src.height),
    dw = Math.max(1, Math.round(src.width * scale)),
    dh = Math.max(1, Math.round(src.height * scale));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    src,
    Math.round(x + (w - dw) / 2),
    Math.round(y + (bottom ? h - dh : (h - dh) / 2)),
    dw,
    dh,
  );
}
const actors = createCanvas(512, 1728);
const rows = [
  [22, 149],
  [154, 290],
  [291, 451],
  [451, 590],
  [590, 744],
  [744, 913],
  [913, 1028],
  [1028, 1155],
  [1155, 1330],
];
for (let row = 0; row < 9; row++)
  for (let col = 0; col < 8; col++) {
    const [y, end] = rows[row];
    const source = crop(
      people,
      Math.round((col * people.width) / 8),
      y,
      Math.round(people.width / 8),
      end - y,
    );
    const rank = row % 3,
      dir = ["front", "back", "left", "right"][Math.floor(col / 2)],
      pose = col % 2;
    const size = rank === 0 ? 32 : rank === 1 ? 40 : 48;
    for (let team = 0; team < (row >= 6 ? 1 : 4); team++) {
      const f =
        row >= 6
          ? monsterFrame(rank, dir, pose)
          : actorFrame(team, rank, dir, pose, row >= 3);
      fit(
        actors,
        faction(source, row >= 6 ? 0 : team),
        f.x + 3,
        f.y + 54 - size,
        58,
        size,
        true,
      );
    }
  }
const propRows = [
  [0, 400],
  [400, 735],
  [735, 1086],
];
const prop = (col: number, row: number) => {
  const [y, end] = propRows[row];
  return crop(
    props,
    Math.round((col * props.width) / 4),
    y,
    Math.round(props.width / 4),
    end - y,
  );
};
const buildings = createCanvas(512, 640);
for (let team = 0; team < 4; team++) {
  fit(buildings, faction(prop(0, 0), team), team * 128 + 34, 22, 60, 68);
  fit(buildings, faction(prop(1, 0), team), team * 128 + 4, 128 + 4, 120, 120);
  fit(buildings, faction(prop(2, 0), team), team * 128 + 4, 256 + 4, 120, 120);
  fit(buildings, faction(prop(3, 0), team), team * 128 + 4, 512 + 4, 120, 120);
}
fit(buildings, prop(0, 1), 16, 384 + 24, 96, 80);
fit(buildings, prop(1, 2), 128 + 44, 384 + 46, 40, 40);
fit(buildings, prop(2, 2), 256 + 44, 384 + 46, 40, 40);
const world = createCanvas(256, 1920);
const bases = ["#64774a", "#c8a567", "#d1dddd", "#4f6653", "#736482"];
for (let b = 0; b < 5; b++) {
  const height = biomes.height / 5,
    width = biomes.width / 4;
  const ground = crop(biomes, 0, Math.round(b * height), width, height, false);
  const tree = crop(
    biomes,
    Math.round(width),
    Math.round(b * height),
    width,
    height,
  );
  const rock = crop(
    biomes,
    Math.round(width * 2),
    Math.round(b * height),
    width,
    height,
  );
  const water = crop(
    biomes,
    Math.round(width * 3),
    Math.round(b * height),
    width,
    height,
    false,
  );
  for (let v = 0; v < 8; v++)
    for (const kind of [
      "grass",
      "tree",
      "rock",
      "water",
      "bridge-x",
      "bridge-y",
      "dam",
      "barricade",
      "shore-n",
      "shore-e",
      "shore-s",
      "shore-w",
    ] as const) {
      const f = terrainFrame(b, kind, v),
        ctx = world.getContext("2d");
      ctx.save();
      ctx.translate(f.x, f.y);
      if (kind.startsWith("shore-")) {
        ctx.translate(16, 16);
        ctx.rotate(
          (["shore-n", "shore-e", "shore-s", "shore-w"].indexOf(kind) *
            Math.PI) /
            2,
        );
        ctx.translate(-16, -16);
        ctx.drawImage(
          ground,
          0,
          0,
          ground.width,
          Math.max(1, ground.height * 0.06),
          0,
          0,
          32,
          1,
        );
        ctx.restore();
        continue;
      }
      const wet = ["water", "bridge-x", "bridge-y", "dam"].includes(kind);
      ctx.fillStyle = wet ? "#315c72" : bases[b];
      ctx.fillRect(0, 0, 32, 32);
      const base = wet ? water : ground;
      ctx.imageSmoothingEnabled = true;
      // All variations are crops or mirrored copies of the generated source art.
      ctx.save();
      if (v % 2) {
        ctx.translate(32, 0);
        ctx.scale(-1, 1);
      }
      if (v % 4 >= 2) {
        ctx.translate(0, 32);
        ctx.scale(1, -1);
      }
      const inset = v >= 4 ? base.width * 0.06 : 0;
      ctx.drawImage(
        base,
        inset,
        inset,
        base.width - 2 * inset,
        base.height - 2 * inset,
        0,
        0,
        32,
        32,
      );
      ctx.restore();
      let asset: Canvas | undefined;
      if (kind === "tree") asset = tree;
      if (kind === "rock") asset = rock;
      if (kind === "bridge-x") asset = prop(1, 1);
      if (kind === "bridge-y") asset = prop(2, 1);
      if (kind === "dam") asset = prop(3, 1);
      if (kind === "barricade") asset = prop(0, 2);
      if (asset) {
        const scale = Math.min(30 / asset.width, 30 / asset.height),
          w = Math.round(asset.width * scale),
          h = Math.round(asset.height * scale);
        ctx.drawImage(
          asset,
          Math.floor((32 - w) / 2),
          Math.floor((32 - h) / 2),
          w,
          h,
        );
      }
      ctx.restore();
    }
}
mkdirSync("public/art", { recursive: true });
for (const [name, img] of [
  ["actors", actors],
  ["buildings", buildings],
  ["world", world],
] as const) {
  writeFileSync(`public/art/${name}.png`, img.toBuffer("image/png"));
  console.log(`${name}: ${img.width}×${img.height}`);
}
