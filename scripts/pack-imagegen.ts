import {
  createCanvas,
  loadImage,
  type Canvas,
  type Image,
} from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { actorFrame, monsterFrame, terrainFrame } from "../src/atlas.ts";
const root = "art-source/imagegen/pixel-v2";
const [people, props, biomes] = await Promise.all(
  ["actors", "structures", "biomes"].map((n) => loadImage(`${root}/${n}.png`)),
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
  ctx.imageSmoothingEnabled = false;
  const native = createCanvas(
    Math.max(1, Math.round(dw / 2)),
    Math.max(1, Math.round(dh / 2)),
  );
  native.getContext("2d").imageSmoothingEnabled = false;
  native.getContext("2d").drawImage(src, 0, 0, native.width, native.height);
  ctx.drawImage(
    native,
    Math.round(x + (w - dw) / 2),
    Math.round(y + (bottom ? h - dh : (h - dh) / 2)),
    dw,
    dh,
  );
}
const actors = createCanvas(512, 1728);
const rows = [
  [0, 123],
  [123, 255],
  [255, 398],
  [398, 518],
  [518, 674],
  [518, 674],
  [674, 797],
  [797, 941],
  [941, 1182],
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
function cleanBackdrop(img: Canvas) {
  const c = img.getContext("2d"),
    p = c.getImageData(0, 0, img.width, img.height),
    d = p.data;
  const seen = new Uint8Array(img.width * img.height),
    q: number[] = [];
  const pale = (i: number) => {
    const a = i * 4;
    return (
      d[a + 3] < 32 ||
      (Math.min(d[a], d[a + 1], d[a + 2]) > 175 &&
        Math.max(d[a], d[a + 1], d[a + 2]) -
          Math.min(d[a], d[a + 1], d[a + 2]) <
          28)
    );
  };
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (x === 0 || y === 0 || x === img.width - 1 || y === img.height - 1) {
        const i = y * img.width + x;
        if (pale(i)) {
          seen[i] = 1;
          q.push(i);
        }
      }
  for (let head = 0; head < q.length; head++) {
    const i = q[head],
      x = i % img.width,
      y = Math.floor(i / img.width);
    d[i * 4 + 3] = 0;
    for (const n of [
      x > 0 ? i - 1 : -1,
      x < img.width - 1 ? i + 1 : -1,
      y > 0 ? i - img.width : -1,
      y < img.height - 1 ? i + img.width : -1,
    ])
      if (n >= 0 && !seen[n] && pale(n)) {
        seen[n] = 1;
        q.push(n);
      }
  }
  c.putImageData(p, 0, 0);
  return img;
}
function texture(source: Canvas) {
  const tiny = createCanvas(16, 16),
    t = tiny.getContext("2d");
  t.imageSmoothingEnabled = false;
  t.drawImage(
    source,
    source.width * 0.15,
    source.height * 0.15,
    source.width * 0.7,
    source.height * 0.7,
    0,
    0,
    16,
    16,
  );
  const pixels = t.getImageData(0, 0, 16, 16),
    d = pixels.data,
    mean = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4)
    for (let k = 0; k < 3; k++) mean[k] += d[i + k] / 256;
  for (let i = 0; i < d.length; i += 4) {
    const delta = Math.max(
      -12,
      Math.min(
        12,
        Math.round(
          (((d[i] - mean[0] + (d[i + 1] - mean[1]) + (d[i + 2] - mean[2])) /
            3) *
            0.22) /
            4,
        ) * 4,
      ),
    );
    for (let k = 0; k < 3; k++)
      d[i + k] = Math.max(0, Math.min(255, Math.round(mean[k] + delta)));
    d[i + 3] = 255;
  }
  // Matching opposite edges, with local variation instead of uniform separator strips.
  const pair = (a: number, b: number) => {
    for (let k = 0; k < 3; k++)
      d[a * 4 + k] = d[b * 4 + k] = Math.round(
        (d[a * 4 + k] + d[b * 4 + k]) / 2,
      );
  };
  for (let y = 0; y < 16; y++) pair(y * 16, y * 16 + 15);
  for (let x = 0; x < 16; x++) pair(x, 240 + x);
  t.putImageData(pixels, 0, 0);
  const out = createCanvas(32, 32),
    c = out.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.drawImage(tiny, 0, 0, 32, 32);
  return out;
}
const mountains = await loadImage(`${root}/mountains.png`);
const world = createCanvas(256, 4640);
const bases = ["#64774a", "#c8a567", "#d1dddd", "#4f6653", "#736482"];
for (let b = 0; b < 5; b++) {
  const cuts = [0, 254, 514, 782, 1066, 1402];
  const height = cuts[b + 1] - cuts[b],
    width = biomes.width / 4;
  const ground = crop(biomes, 0, cuts[b], width, height, false);
  const tree = crop(biomes, Math.round(width), cuts[b], width, height);
  const rock = crop(biomes, Math.round(width * 2), cuts[b], width, height);
  const water = crop(
    biomes,
    Math.round(width * 3),
    cuts[b],
    width,
    height,
    false,
  );
  cleanBackdrop(tree);
  cleanBackdrop(rock);
  const groundTexture = texture(ground),
    waterTexture = texture(water);
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
      ...Array.from({ length: 16 }, (_, i) => `massif-${i}` as const),
      "massif-peak",
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
        ctx.drawImage(groundTexture, 0, 0, 32, 2, 0, 0, 32, 2);
        ctx.restore();
        continue;
      }
      const wet = ["water", "bridge-x", "bridge-y", "dam"].includes(kind);
      ctx.fillStyle = wet ? "#315c72" : bases[b];
      ctx.fillRect(0, 0, 32, 32);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(wet ? waterTexture : groundTexture, 0, 0);
      if (kind.startsWith("massif-")) {
        const peak = kind === "massif-peak",
          mask = peak ? 0 : Number(kind.slice(7));
        const piece = crop(
          mountains,
          ((mask % 4) * mountains.width) / 4,
          (Math.floor(mask / 4) * mountains.height) / 4,
          mountains.width / 4,
          mountains.height / 4,
        );
        const size = peak ? 32 : 16,
          native = createCanvas(size, size),
          c = native.getContext("2d");
        c.imageSmoothingEnabled = false;
        c.drawImage(piece, 0, 0, size, size);
        const p = c.getImageData(0, 0, size, size),
          d = p.data;
        const tint = [
          [0.94, 0.96, 0.9],
          [0.95, 0.62, 0.34],
          [1.16, 1.28, 1.4],
          [0.66, 0.77, 0.66],
          [1.04, 0.73, 1.28],
        ][b];
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 64) {
            d[i + 3] = 0;
            continue;
          }
          const l = d[i] * 0.3 + d[i + 1] * 0.5 + d[i + 2] * 0.2;
          for (let k = 0; k < 3; k++)
            d[i + k] = Math.min(255, Math.round((l * tint[k]) / 4) * 4);
          d[i + 3] = 255;
        }
        c.putImageData(p, 0, 0);
        if (!peak) {
          const face = createCanvas(16, 16),
            fc = face.getContext("2d");
          fc.imageSmoothingEnabled = false;
          fc.fillStyle = `rgb(${Math.round(120 * tint[0])},${Math.round(120 * tint[1])},${Math.round(120 * tint[2])})`;
          fc.fillRect(0, 0, 16, 16);
          fc.drawImage(native, 5, 4, 6, 8, 0, 0, 16, 16);
          c.save();
          c.globalCompositeOperation = "destination-over";
          c.fillStyle = c.createPattern(face, "repeat")!;
          c.fillRect(2, 2, 12, 12);
          if (mask & 1) c.fillRect(2, 0, 12, 8);
          if (mask & 2) c.fillRect(8, 2, 8, 12);
          if (mask & 4) c.fillRect(2, 8, 12, 8);
          if (mask & 8) c.fillRect(0, 2, 8, 12);
          if ((mask & 3) === 3) c.fillRect(14, 0, 2, 2);
          if ((mask & 6) === 6) c.fillRect(14, 14, 2, 2);
          if ((mask & 12) === 12) c.fillRect(0, 14, 2, 2);
          if ((mask & 9) === 9) c.fillRect(0, 0, 2, 2);
          c.restore();
        }
        // Join complete, purpose-drawn mountain pieces; never splice a photograph by map coordinates.
        if (peak) ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(native, 0, 0, 32, 32);
        ctx.restore();
        continue;
      }
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
        const small = createCanvas(
          Math.max(1, Math.round(w / 2)),
          Math.max(1, Math.round(h / 2)),
        );
        small.getContext("2d").imageSmoothingEnabled = false;
        small
          .getContext("2d")
          .drawImage(asset, 0, 0, small.width, small.height);
        ctx.drawImage(
          small,
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
