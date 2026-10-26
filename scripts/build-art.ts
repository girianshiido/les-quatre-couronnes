import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ACTOR_CELL,
  BUILDING_CELL,
  TILE_CELL,
  TERRAIN_FRAMES,
} from "../src/atlas.ts";
const C = ACTOR_CELL,
  B = BUILDING_CELL,
  T = TILE_CELL;
const teams = ["#73cc97", "#70baff", "#edc86b", "#ef8580"];
type G = SKRSContext2D;
const rect = (
  c: G,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
const poly = (c: G, points: number[][], color: string) => {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
};
const oval = (
  c: G,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};
const shade = (hex: string, f: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.max(
        0,
        Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f)),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
function character(
  c: G,
  team: number,
  rank: number,
  dir: number,
  pose: number,
  royal: boolean,
) {
  const color = teams[team],
    dark = shade(color, 0.48),
    light = shade(color, 1.16),
    side = dir >= 2,
    back = dir === 1;
  c.save();
  c.translate(32, 40);
  if (dir === 2) c.scale(-1, 1);
  oval(c, 1, 13, rank === 2 ? 17 : 12, 4, "#15282e55");
  const w = rank === 2 ? 11 : rank === 1 ? 9 : 7,
    step = pose ? 2 : 0;
  if (royal || rank === 2) {
    poly(
      c,
      [
        [-w - 2, -11],
        [w + 2, -11],
        [w + 5, 12],
        [-w - 3, 11],
      ],
      dark,
    );
    rect(c, -w - 1, -8, 3, 16, color);
    rect(c, w, 0, 2, 11, shade(color, 0.7));
  }
  rect(c, -w + 2, 3, 6, 10 + step, "#26383e");
  rect(c, 2, 3, 6, 12 - step, "#39494d");
  rect(c, -w + 1, 11 + step, 7, 3, "#1c2a2d");
  rect(c, 2, 12 - step, 8, 3, "#1b292b");
  rect(c, -w, -11, w * 2, 17, dark);
  rect(c, -w + 1, -10, w * 2 - 3, 14, color);
  rect(c, -w + 2, -9, 3, 11, light);
  rect(c, -w, 2, w * 2, 3, "#715637");
  rect(c, -1, 2, 3, 3, "#e7c66d");
  if (rank) {
    poly(
      c,
      [
        [-w, -10],
        [w, -10],
        [w - 1, 1],
        [0, 4],
        [-w + 1, 1],
      ],
      "#566d73",
    );
    rect(c, -w + 1, -9, w - 1, 9, "#b2c4c3");
    rect(c, 1, -8, w - 3, 8, "#859fA3");
    rect(c, -w - 4, -12, 7, 6, "#3c555e");
    rect(c, -w - 4, -13, 6, 3, "#c4d1cb");
    rect(c, w - 2, -12, 7, 6, "#526a71");
    rect(c, w - 2, -13, 6, 3, "#dce0cb");
    rect(c, -3, -8, 6, 3, color);
    rect(c, -1, -9, 2, 6, light);
  }
  rect(c, -w - 3, -7, 4, 10 + step, rank ? "#758d91" : dark);
  rect(c, -w - 3, 2 + step, 4, 4, "#d9a475");
  rect(c, w, -7, 4, 12 - step, rank ? "#a3b8b7" : color);
  rect(c, w, 3 - step, 4, 4, "#f1c899");
  if (rank && !back) {
    poly(
      c,
      [
        [w + 6, -24],
        [w + 8, -18],
        [w + 8, 1],
        [w + 5, 1],
        [w + 5, -18],
      ],
      "#e1e8df",
    );
    rect(c, w + 5, -18, 1, 19, "#789299");
    rect(c, w + 4, 0, 7, 2, "#dfbd65");
    rect(c, w + 6, 2, 2, 5, "#685138");
    poly(
      c,
      [
        [-w - 6, -5],
        [-w - 1, -7],
        [-w + 3, -4],
        [-w + 2, 6],
        [-w - 2, 10],
        [-w - 6, 5],
      ],
      "#233c45",
    );
    poly(
      c,
      [
        [-w - 5, -4],
        [-w - 1, -5],
        [-w + 1, -3],
        [-w, 5],
        [-w - 2, 7],
        [-w - 5, 4],
      ],
      color,
    );
    rect(c, -w - 3, -3, 2, 8, "#ecd38d");
  }
  const hx = side ? 2 : 0,
    hw = rank === 2 ? 15 : 13;
  rect(c, hx - Math.floor(hw / 2) - 1, -24, hw + 2, 13, "#27353b");
  rect(c, hx - Math.floor(hw / 2), -23, hw, 12, back ? "#665343" : "#d6a475");
  if (!back) {
    rect(c, hx - 4, -22, 7, 9, "#f0c99b");
    rect(c, hx - 5, -15, 3, 3, "#dfb383");
  }
  if (rank) {
    rect(c, hx - 8, -24, 16, 5, "#8fa6aa");
    rect(c, hx - 6, -26, 12, 3, "#cdd8d0");
    rect(c, hx - 8, -20, 3, 6, "#5a737d");
    if (back) rect(c, hx - 6, -20, 12, 8, "#7f969b");
  } else {
    rect(c, hx - 7, -25, 14, 5, "#594633");
    rect(c, hx - 6, -26, 11, 3, dark);
    rect(c, hx - 6, -25, 8, 2, color);
    if (back) rect(c, hx - 6, -20, 12, 9, "#69503a");
  }
  if (!back) {
    if (side) {
      rect(c, hx + 3, -19, 2, 2, "#26363b");
      rect(c, hx + 6, -17, 2, 3, "#f5d2a8");
    } else {
      rect(c, hx - 4, -19, 2, 2, "#24363b");
      rect(c, hx + 3, -19, 2, 2, "#24363b");
      rect(c, hx, -15, 3, 1, "#9f7356");
    }
  }
  if (royal) {
    rect(c, hx - 8, -27, 16, 4, "#986c2c");
    rect(c, hx - 7, -29, 14, 4, "#f0cf71");
    for (const x of [-7, -1, 5]) {
      rect(c, hx + x, -32, 3, 5, "#f8dfa0");
      rect(c, hx + x, -33, 2, 2, "#e9bc5f");
    }
    rect(c, hx - 1, -27, 3, 2, "#a65454");
  }
  if (rank === 2) {
    rect(c, -w - 5, -14, 5, 3, "#f0d293");
    rect(c, w + 2, -14, 5, 3, "#f0d293");
  }
  c.restore();
}
function monster(c: G, rank: number, dir: number, pose: number) {
  c.save();
  c.translate(32, 39);
  if (dir === 2) c.scale(-1, 1);
  const w = 8 + rank * 3,
    h = 13 + rank * 2;
  oval(c, 0, 15, w + 4, 4, "#16243055");
  rect(c, -w + 1, 5, 6, 11 + (pose ? 2 : 0), "#463950");
  rect(c, w - 6, 6, 6, 11 - (pose ? 1 : 0), "#624b6c");
  poly(
    c,
    [
      [-w - 2, -h + 1],
      [w - 1, -h - 2],
      [w + 3, 7],
      [w - 2, 12],
      [-w, 10],
    ],
    "#3d3548",
  );
  poly(
    c,
    [
      [-w, -h + 2],
      [1, -h - 1],
      [w, 6],
      [w - 3, 10],
      [-w + 2, 7],
    ],
    "#967498",
  );
  rect(c, -w - 5, -5, 5, 12, "#6e547c");
  rect(c, w, -6, 5, 12, "#a282aa");
  for (const x of [-w - 5, -w - 2, w, w + 3]) rect(c, x, 5, 2, 4, "#ded1ad");
  poly(
    c,
    [
      [-w, -h + 1],
      [-w - 2, -h - 11],
      [-w + 3, -h - 7],
      [-w + 5, -h + 2],
    ],
    "#d1bd93",
  );
  poly(
    c,
    [
      [w - 5, -h],
      [w - 2, -h - 12],
      [w + 2, -h - 8],
      [w, -h + 2],
    ],
    "#f0d9ac",
  );
  if (dir >= 2) {
    rect(c, 4, -h + 5, 6, 4, "#ffe5a0");
    rect(c, 8, -h + 5, 2, 4, "#27333a");
    rect(c, 7, -h + 11, 7, 4, "#a282aa");
    rect(c, 9, -h + 14, 5, 3, "#302c39");
    rect(c, 11, -h + 14, 2, 3, "#f0dfb7");
  } else if (dir !== 1) {
    rect(c, -6, -h + 6, 5, 3, "#f3cf6d");
    rect(c, 3, -h + 5, 5, 3, "#ffe5a0");
    rect(c, -3, -h + 6, 2, 3, "#27333a");
    rect(c, 5, -h + 5, 2, 3, "#27333a");
    rect(c, -3, -2, 9, 4, "#302c39");
    rect(c, -2, -2, 2, 3, "#f0dfb7");
    rect(c, 3, -2, 2, 3, "#f0dfb7");
  } else {
    poly(
      c,
      [
        [0, -h + 1],
        [4, -h + 4],
        [2, 8],
        [-2, 8],
      ],
      "#b495ad",
    );
  }
  if (rank) {
    for (const x of [-w - 2, w - 1]) {
      rect(c, x, -8, 5, 8, "#6a6c72");
      rect(c, x, -9, 5, 3, "#c5b6b8");
    }
    rect(c, -w, 6, w * 2, 3, "#543b3f");
  }
  c.restore();
}
const actors = createCanvas(8 * C, 27 * C),
  ac = actors.getContext("2d");
for (let royal = 0; royal < 2; royal++)
  for (let team = 0; team < 4; team++)
    for (let rank = 0; rank < 3; rank++)
      for (let dir = 0; dir < 4; dir++)
        for (let pose = 0; pose < 2; pose++) {
          ac.save();
          ac.translate(
            (dir * 2 + pose) * C,
            (royal * 12 + team * 3 + rank) * C,
          );
          character(ac, team, rank, dir, pose, !!royal);
          ac.restore();
        }
for (let rank = 0; rank < 3; rank++)
  for (let dir = 0; dir < 4; dir++)
    for (let pose = 0; pose < 2; pose++) {
      ac.save();
      ac.translate((dir * 2 + pose) * C, (24 + rank) * C);
      monster(ac, rank, dir, pose);
      ac.restore();
    }
const palettes = [
  {
    ground: "#607a4d",
    water: "#356f7c",
    leaf: "#345f44",
    rock: "#738078",
    edge: "#9b9b69",
  },
  {
    ground: "#c2a373",
    water: "#438f97",
    leaf: "#557447",
    rock: "#a78a5f",
    edge: "#ddc58e",
  },
  {
    ground: "#c8d7d8",
    water: "#638ba0",
    leaf: "#567b7e",
    rock: "#8297a3",
    edge: "#e2e9df",
  },
  {
    ground: "#4e6658",
    water: "#365b68",
    leaf: "#315c50",
    rock: "#68766c",
    edge: "#809174",
  },
  {
    ground: "#6b6180",
    water: "#677cad",
    leaf: "#86bbc2",
    rock: "#a194b3",
    edge: "#aca0ba",
  },
];
function terrain(c: G, biome: number, kind: string, variant: number) {
  const p = palettes[biome];
  let random = variant * 7919 + biome * 199 + 19;
  const next = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  if (kind.startsWith("shore-")) {
    c.save();
    c.translate(16, 16);
    c.rotate(
      (["shore-n", "shore-e", "shore-s", "shore-w"].indexOf(kind) * Math.PI) /
        2,
    );
    c.translate(-16, -16);
    rect(c, 0, 0, 32, 2, p.edge);
    rect(c, 0, 2, 32, 1, shade(p.water, 1.35));
    for (let i = 0; i < 4; i++)
      rect(c, i * 8 + (variant % 3), 3, 4, 1, shade(p.water, 1.2));
    c.restore();
    return;
  }
  const wet = ["water", "bridge-x", "bridge-y", "dam"].includes(kind);
  rect(c, 0, 0, 32, 32, wet ? p.water : p.ground);
  if (wet) {
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(next() * 28),
        y = Math.floor(next() * 30);
      rect(
        c,
        x,
        y,
        3 + Math.floor(next() * 6),
        1,
        i % 2 ? shade(p.water, 0.9) : shade(p.water, 1.22),
      );
    }
  } else
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(next() * 31),
        y = Math.floor(next() * 31);
      rect(
        c,
        x,
        y,
        1 + Math.floor(next() * 3),
        1,
        shade(p.ground, 0.88 + next() * 0.24),
      );
    }
  if (kind === "grass") {
    for (let i = 0; i < 3; i++) {
      const x = 3 + Math.floor(next() * 25),
        y = 3 + Math.floor(next() * 25);
      rect(c, x, y, 1, 3, shade(p.ground, 1.17));
      rect(c, x - 1, y + 2, 3, 1, shade(p.ground, 0.82));
    }
    if (variant === 5) {
      rect(c, 22, 10, 2, 2, biome === 2 ? "#f3f5ed" : "#d3c598");
      rect(c, 23, 12, 1, 2, shade(p.ground, 0.7));
    }
  }
  if (kind === "tree") {
    oval(c, 18, 27, 12, 4, "#1b354649");
    rect(c, 14, 16, 5, 14, "#5a4734");
    rect(c, 15, 17, 2, 12, "#a18657");
    if (biome === 1) {
      if (variant % 3 === 0) {
        rect(c, 12, 5, 8, 23, "#557344");
        rect(c, 8, 13, 5, 10, "#45653e");
        rect(c, 20, 9, 5, 10, "#63814b");
        rect(c, 13, 7, 2, 18, "#8da367");
        rect(c, 7, 21, 8, 3, "#557344");
      } else {
        rect(c, 15, 10, 3, 18, "#a2804f");
        poly(
          c,
          [
            [16, 9],
            [6, 2],
            [1, 7],
            [13, 12],
          ],
          "#658749",
        );
        poly(
          c,
          [
            [16, 9],
            [28, 2],
            [31, 8],
            [18, 12],
          ],
          "#4d7444",
        );
        poly(
          c,
          [
            [16, 9],
            [10, 15],
            [2, 18],
            [8, 10],
          ],
          "#3c663c",
        );
        poly(
          c,
          [
            [17, 9],
            [26, 13],
            [30, 19],
            [20, 14],
          ],
          "#729452",
        );
        rect(c, 14, 9, 5, 4, "#97703d");
      }
    } else if (biome === 4) {
      poly(
        c,
        [
          [15, 1],
          [24, 10],
          [20, 26],
          [10, 29],
          [7, 13],
        ],
        "#56959e",
      );
      poly(
        c,
        [
          [15, 1],
          [15, 24],
          [10, 29],
          [7, 13],
        ],
        "#bdeded",
      );
      poly(
        c,
        [
          [15, 1],
          [24, 10],
          [15, 15],
        ],
        "#d9f4df",
      );
      poly(
        c,
        [
          [26, 13],
          [30, 18],
          [27, 28],
          [23, 26],
        ],
        "#a3a8df",
      );
      rect(c, 13, 6, 1, 12, "#f0fff3");
    } else if (biome === 3) {
      oval(c, 15, 12, 12, 10, "#254d43");
      oval(c, 13, 9, 10, 8, p.leaf);
      oval(c, 10, 7, 6, 4, "#66816a");
      rect(c, 6, 15, 2, 10, "#7f9b6e");
      rect(c, 24, 12, 1, 13, "#88a77a");
      rect(c, 21, 18, 1, 9, "#668965");
    } else {
      for (const [top, bottom, width] of [
        [1, 14, 9],
        [7, 22, 13],
        [14, 29, 15],
      ]) {
        poly(
          c,
          [
            [16, top],
            [16 + width, bottom],
            [23, bottom],
            [21, bottom + 2],
            [11, bottom + 2],
            [9, bottom],
            [16 - width, bottom],
          ],
          shade(p.leaf, 0.83),
        );
        poly(
          c,
          [
            [15, top + 1],
            [17, bottom - 1],
            [16 - width + 2, bottom - 1],
          ],
          shade(p.leaf, 1.32),
        );
        rect(c, 13, top + 5, 3, 2, shade(p.leaf, 1.5));
        if (biome === 2)
          poly(
            c,
            [
              [16, top],
              [16 + width - 2, bottom - 4],
              [13, bottom - 3],
              [16 - width + 2, bottom - 4],
            ],
            "#ecf1e6",
          );
      }
    }
  }
  if (kind === "rock") {
    oval(c, 18, 27, 13, 4, "#263b4544");
    poly(
      c,
      [
        [3, 25],
        [5, 12],
        [14, 5],
        [24, 9],
        [30, 23],
        [24, 28],
        [10, 28],
      ],
      shade(p.rock, 0.64),
    );
    poly(
      c,
      [
        [5, 12],
        [14, 5],
        [19, 15],
        [11, 25],
        [3, 25],
      ],
      shade(p.rock, 1.29),
    );
    poly(
      c,
      [
        [14, 5],
        [24, 9],
        [30, 23],
        [19, 24],
        [19, 15],
      ],
      p.rock,
    );
    poly(
      c,
      [
        [5, 12],
        [14, 5],
        [18, 12],
        [10, 17],
      ],
      shade(p.rock, 1.55),
    );
    rect(c, 19, 18, 5, 1, shade(p.rock, 0.7));
    rect(c, 22, 20, 3, 1, shade(p.rock, 0.7));
    if (biome === 2)
      poly(
        c,
        [
          [5, 12],
          [14, 5],
          [24, 9],
          [25, 13],
          [16, 10],
          [10, 15],
        ],
        "#edf2ec",
      );
  }
  if (kind === "bridge-x" || kind === "bridge-y") {
    c.save();
    if (kind === "bridge-y") {
      c.translate(32, 0);
      c.rotate(Math.PI / 2);
    }
    rect(c, 0, 6, 32, 23, "#213c474d");
    rect(c, 0, 4, 32, 24, "#604830");
    for (let x = 0; x < 32; x += 5) {
      rect(c, x, 6, 4, 20, "#b59262");
      rect(c, x, 6, 4, 2, "#dfbd85");
      rect(c, x + 1, 11, 1, 10, "#987348");
      rect(c, x + 2, 8, 1, 1, "#5c4d3b");
    }
    rect(c, 0, 3, 32, 3, "#e0bd82");
    rect(c, 0, 26, 32, 3, "#88623d");
    for (const x of [1, 27]) {
      rect(c, x, 1, 3, 9, "#654b32");
      rect(c, x, 23, 3, 8, "#674e35");
      rect(c, x, 0, 3, 2, "#dfbd85");
    }
    c.restore();
  }
  if (kind === "barricade") {
    oval(c, 17, 27, 14, 4, "#152d3449");
    rect(c, 1, 11, 30, 15, "#594631");
    for (let x = 2; x < 31; x += 6) {
      poly(
        c,
        [
          [x, 8],
          [x + 2, 3],
          [x + 4, 8],
          [x + 4, 27],
          [x, 27],
        ],
        "#a68557",
      );
      rect(c, x + 1, 9, 1, 16, "#d9b77c");
    }
    rect(c, 1, 13, 30, 3, "#685132");
    rect(c, 1, 22, 30, 3, "#6e5639");
    for (const x of [4, 16, 28]) rect(c, x, 13, 2, 2, "#d6c7a4");
  }
  if (kind === "dam") {
    rect(c, 0, 5, 32, 24, "#4a5050");
    for (let y = 5; y < 28; y += 6)
      for (let x = (y % 2) * 4 - 4; x < 32; x += 10) {
        rect(c, x, y, 9, 5, "#9b9e8a");
        rect(c, x, y, 9, 1, "#d1c8a4");
      }
    rect(c, 0, 3, 32, 3, "#d9cfac");
    rect(c, 0, 28, 32, 2, "#434e50");
  }
}
const world = createCanvas(8 * T, 5 * TERRAIN_FRAMES.length * T),
  wc = world.getContext("2d");
for (let biome = 0; biome < 5; biome++)
  for (let row = 0; row < TERRAIN_FRAMES.length; row++)
    for (let v = 0; v < 8; v++) {
      wc.save();
      wc.translate(v * T, (biome * TERRAIN_FRAMES.length + row) * T);
      terrain(wc, biome, TERRAIN_FRAMES[row], v);
      wc.restore();
    }
function house(c: G, team: number) {
  const col = teams[team];
  oval(c, 67, 81, 25, 7, "#1c333f55");
  rect(c, 46, 48, 37, 30, "#3b4640");
  rect(c, 48, 47, 24, 30, "#e3d4ae");
  rect(c, 72, 48, 11, 29, "#a89f83");
  rect(c, 48, 74, 35, 5, "#9a9e8b");
  rect(c, 48, 74, 24, 2, "#c6c6a4");
  poly(
    c,
    [
      [41, 47],
      [62, 24],
      [87, 47],
    ],
    shade(col, 0.51),
  );
  poly(
    c,
    [
      [43, 45],
      [62, 23],
      [81, 44],
    ],
    col,
  );
  poly(
    c,
    [
      [62, 23],
      [87, 45],
      [80, 48],
    ],
    shade(col, 0.7),
  );
  for (let y = 31; y < 44; y += 4)
    rect(c, 54 - (y - 31) * 0.7, y, 18 + (y - 31) * 1.3, 1, shade(col, 1.17));
  rect(c, 76, 25, 5, 16, "#6d7064");
  rect(c, 75, 24, 7, 3, "#bcb99e");
  rect(c, 59, 58, 10, 19, "#584b36");
  rect(c, 61, 60, 6, 16, "#765b3a");
  rect(c, 65, 68, 1, 2, "#efcc79");
  rect(c, 49, 52, 7, 9, "#5e705f");
  rect(c, 50, 53, 5, 6, "#f1d592");
  rect(c, 52, 53, 1, 6, "#8e7951");
  rect(c, 74, 54, 6, 8, "#53645b");
  rect(c, 75, 55, 4, 5, "#c5c09a");
  rect(c, 48, 62, 9, 2, "#9c8050");
  rect(c, 47, 71, 9, 4, "#6e7b50");
  rect(c, 49, 69, 2, 2, "#d7b37d");
  rect(c, 54, 70, 2, 2, col);
}
function castle(c: G, team: number, breached: boolean) {
  const col = teams[team];
  oval(c, 65, 110, 53, 11, "#142a374d");
  rect(c, 18, 42, 92, 62, "#526765");
  rect(c, 20, 40, 88, 61, "#b6b8a0");
  rect(c, 25, 50, 78, 45, "#747e6d");
  rect(c, 30, 53, 68, 40, "#87917b");
  for (let y = 56; y < 91; y += 8)
    for (let x = 32; x < 96; x += 8) rect(c, x, y, 6, 6, "#929b85");
  rect(c, 20, 43, 88, 10, "#ced1b5");
  rect(c, 20, 48, 88, 5, "#8d9b8a");
  for (const x of [14, 89]) {
    rect(c, x, 34, 26, 72, "#506763");
    rect(c, x + 2, 34, 22, 70, "#a9b2a0");
    rect(c, x + 3, 35, 7, 67, "#d3d3b9");
    rect(c, x + 20, 35, 4, 67, "#7c948a");
    for (let y = 47; y < 103; y += 10) {
      rect(c, x + 4, y, 18, 1, "#809486");
      rect(c, x + 12 + (y % 3), y - 8, 1, 8, "#809486");
    }
    rect(c, x - 1, 29, 28, 9, "#ced1b6");
    for (let i = 0; i < 3; i++) rect(c, x + i * 10, 23, 7, 10, "#c7ceb8");
    rect(c, x + 9, 44, 6, 12, "#354d4b");
    rect(c, x + 10, 45, 2, 7, "#859d8b");
    rect(c, x + 5, 61, 15, 21, shade(col, 0.62));
    rect(c, x + 6, 60, 12, 17, col);
    poly(
      c,
      [
        [x + 6, 77],
        [x + 12, 73],
        [x + 18, 77],
      ],
      col,
    );
    rect(c, x + 11, 63, 2, 10, "#e9dab0");
    rect(c, x + 12, 5, 2, 19, "#6f6e4f");
    poly(
      c,
      [
        [x + 14, 5],
        [x + 30, 8],
        [x + 25, 15],
        [x + 14, 13],
      ],
      col,
    );
  }
  rect(c, 39, 89, 50, 17, "#71857a");
  rect(c, 39, 88, 50, 5, "#d1d1b3");
  if (breached) {
    poly(
      c,
      [
        [52, 89],
        [56, 98],
        [65, 93],
        [72, 105],
        [48, 105],
      ],
      "#374c49",
    );
  } else {
    rect(c, 55, 88, 19, 18, "#3b4940");
    rect(c, 58, 90, 13, 15, "#8c7953");
    for (let x = 59; x < 72; x += 4) rect(c, x, 91, 1, 13, "#554d3b");
  }
  for (let x = 40; x < 89; x += 12) rect(c, x, 83, 8, 8, "#d1d1b3");
  rect(c, 45, 105, 39, 5, "#5b7168");
  rect(c, 49, 109, 31, 3, "#8c9980");
}
function cave(c: G) {
  oval(c, 66, 91, 38, 9, "#142c3a55");
  poly(
    c,
    [
      [24, 87],
      [31, 49],
      [52, 29],
      [75, 31],
      [101, 58],
      [106, 89],
    ],
    "#414b51",
  );
  poly(
    c,
    [
      [31, 49],
      [52, 29],
      [68, 47],
      [57, 81],
      [24, 87],
    ],
    "#89978b",
  );
  poly(
    c,
    [
      [52, 29],
      [75, 31],
      [101, 58],
      [69, 54],
    ],
    "#b3b5a1",
  );
  poly(
    c,
    [
      [46, 62],
      [62, 48],
      [80, 58],
      [86, 88],
      [42, 88],
    ],
    "#1b2e35",
  );
  poly(
    c,
    [
      [54, 69],
      [64, 61],
      [76, 71],
      [80, 88],
      [50, 88],
    ],
    "#443e59",
  );
  rect(c, 56, 76, 3, 3, "#dbc997");
  rect(c, 69, 74, 3, 3, "#e6ce86");
  poly(
    c,
    [
      [37, 48],
      [40, 65],
      [44, 58],
    ],
    "#d9d8bd",
  );
}
function scaffold(c: G, kind: number) {
  const col = "#b29970";
  for (const x of [48, 76]) {
    rect(c, x, 49, 4, 35, "#634d36");
    rect(c, x, 48, 3, 34, col);
  }
  rect(c, 47, 57, 35, 4, col);
  rect(c, 47, 75, 35, 4, col);
  poly(
    c,
    [
      [49, 57],
      [52, 57],
      [80, 78],
      [77, 78],
    ],
    "#d7bd8a",
  );
  if (kind) for (let x = 55; x < 75; x += 8) rect(c, x, 65, 3, 16, "#806746");
}
function ruin(c: G, team: number) {
  oval(c, 65, 94, 45, 8, "#182d3655");
  for (let i = 0; i < 15; i++) {
    const x = 25 + ((i * 29) % 70),
      y = 74 + ((i * 17) % 25);
    rect(c, x, y, 10 + (i % 6), 6, "#7f8b7e");
    rect(c, x, y, 10 + (i % 6), 2, "#b7b8a0");
  }
  rect(c, 52, 87, 22, 5, shade(teams[team], 0.7));
}
const buildings = createCanvas(4 * B, 5 * B),
  bc = buildings.getContext("2d");
for (let team = 0; team < 4; team++)
  for (let row = 0; row < 3; row++) {
    bc.save();
    bc.translate(team * B, row * B);
    if (row === 0) house(bc, team);
    else castle(bc, team, row === 2);
    bc.restore();
  }
for (let col = 0; col < 3; col++) {
  bc.save();
  bc.translate(col * B, 3 * B);
  if (col === 0) cave(bc);
  else scaffold(bc, col - 1);
  bc.restore();
}
for (let team = 0; team < 4; team++) {
  bc.save();
  bc.translate(team * B, 4 * B);
  ruin(bc, team);
  bc.restore();
}
mkdirSync("public/art", { recursive: true });
for (const [name, canvas] of [
  ["actors", actors],
  ["world", world],
  ["buildings", buildings],
] as const) {
  const data = canvas.toBuffer("image/png");
  writeFileSync(`public/art/${name}.png`, data);
  console.log(
    `${name}.png: ${canvas.width}×${canvas.height}, ${Math.round(data.length / 1024)} Ko`,
  );
}
