import {
  actorFrame,
  monsterFrame,
  terrainFrame,
  type Atlases,
  type TerrainFrame,
} from "./atlas";
import {
  type State,
  type Unit,
  COLORS,
  TEAM_NAMES,
  tile,
  LEVELS,
} from "./engine";
export const CELL = 16;
const factionColor = (team: number) => COLORS[team] ?? "#c3a1db";
export function tier(hp: number) {
  return hp > 10000 ? 2 : hp >= 1000 ? 1 : 0;
}
export function direction(u: Pick<Unit, "heading">) {
  return u.heading.x > 0
    ? "right"
    : u.heading.x < 0
      ? "left"
      : u.heading.y < 0
        ? "back"
        : "front";
}
export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  terrain = document.createElement("canvas");
  tctx: CanvasRenderingContext2D;
  influence = document.createElement("canvas");
  influenceKey = "";
  cached = "";
  terrainCells: string[] = [];
  influenceCells: string[] = [];
  atlases?: Atlases;
  collapseTimes = new Map<string, number>();
  zoom = 1;
  ox = 0;
  oy = 0;
  width = 0;
  height = 0;
  dpr = 1;
  state!: State;
  showUnitHP = false;
  pointer?: { x: number; y: number };
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.tctx = this.terrain.getContext("2d")!;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
  }
  fit(s: State) {
    this.zoom = (Math.min(this.width, this.height) / (s.size * CELL)) * 0.98;
    this.ox = (this.width - s.size * CELL * this.zoom) / 2;
    this.oy = (this.height - s.size * CELL * this.zoom) / 2;
  }
  point(px: number, py: number) {
    return {
      x: Math.floor((px - this.ox) / this.zoom / CELL),
      y: Math.floor((py - this.oy) / this.zoom / CELL),
    };
  }
  screen(x: number, y: number) {
    return {
      x: this.ox + (x + 0.5) * CELL * this.zoom,
      y: this.oy + (y + 0.5) * CELL * this.zoom,
    };
  }
  zoomAt(factor: number, x = this.width / 2, y = this.height / 2) {
    const z = Math.max(0.25, Math.min(4, this.zoom * factor));
    this.ox = x - ((x - this.ox) * z) / this.zoom;
    this.oy = y - ((y - this.oy) * z) / this.zoom;
    this.zoom = z;
  }
  paintAtlasTerrain(s: State) {
    if (
      this.terrain.width !== s.size * CELL ||
      this.terrain.height !== s.size * CELL ||
      !this.cached
    ) {
      this.terrain.width = s.size * CELL;
      this.terrain.height = s.size * CELL;
      this.terrainCells = [];
    }
    const c = this.tctx,
      biome = LEVELS[s.level].biomeId;
    c.imageSmoothingEnabled = false;
    const wet = (x: number, y: number) =>
      ["water", "bridge", "dam"].includes(tile(s, x, y)?.terrain ?? "");
    for (let y = 0; y < s.size; y++)
      for (let x = 0; x < s.size; x++) {
        const t = tile(s, x, y)!,
          i = y * s.size + x;
        const dirs = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ];
        let mask = 0,
          shore = 0;
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = dirs[d],
            n = tile(s, x + dx, y + dy);
          if (n?.terrain === "rock" && n.permanent) mask |= 1 << d;
          if (n && !wet(x + dx, y + dy)) shore |= 1 << d;
        }
        const token = `${biome}/${t.terrain}/${t.variant}/${t.permanent}/${mask}/${shore}`;
        if (this.terrainCells[i] === token) continue;
        this.terrainCells[i] = token;
        const draw = (kind: TerrainFrame) => {
          const f = terrainFrame(biome, kind, t.variant);
          c.drawImage(
            this.atlases!.world,
            f.x,
            f.y,
            32,
            32,
            x * CELL,
            y * CELL,
            CELL,
            CELL,
          );
        };
        let kind: TerrainFrame =
          t.terrain === "bridge"
            ? !wet(x - 1, y) && !wet(x + 1, y)
              ? "bridge-x"
              : "bridge-y"
            : t.terrain;
        if (t.terrain === "rock" && t.permanent)
          kind = `massif-${mask}` as TerrainFrame;
        draw(kind);
        if (wet(x, y))
          for (let d = 0; d < 4; d++)
            if (shore & (1 << d))
              draw(
                ["shore-n", "shore-e", "shore-s", "shore-w"][d] as TerrainFrame,
              );
      }
    // A complete larger summit spans a solid 2x2 footprint, never arbitrary image fragments.
    const covered = new Set<number>();
    const rock = (x: number, y: number) => {
      const t = tile(s, x, y);
      return t?.terrain === "rock" && t.permanent;
    };
    for (let y = 1; y < s.size - 2; y++)
      for (let x = 1; x < s.size - 2; x++) {
        const cells = [
          y * s.size + x,
          y * s.size + x + 1,
          (y + 1) * s.size + x,
          (y + 1) * s.size + x + 1,
        ];
        if (
          cells.some((i) => covered.has(i)) ||
          !rock(x, y) ||
          !rock(x + 1, y) ||
          !rock(x, y + 1) ||
          !rock(x + 1, y + 1)
        )
          continue;
        for (const i of cells) covered.add(i);
        const f = terrainFrame(biome, "massif-peak", 0);
        c.drawImage(
          this.atlases!.world,
          f.x,
          f.y,
          32,
          32,
          x * CELL,
          y * CELL,
          CELL * 2,
          CELL * 2,
        );
      }
    this.cached = `${s.level}-${s.seed}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}`;
  }
  paintTerrain(s: State) {
    const biome = LEVELS[s.level].biomeId;
    if (!this.atlases) {
      this.terrain.width = s.size * CELL;
      this.terrain.height = s.size * CELL;
    }
    const c = this.tctx;
    c.imageSmoothingEnabled = false;
    if (this.atlases) {
      this.paintAtlasTerrain(s);
      return;
    }
    for (let y = 0; y < s.size; y++)
      for (let x = 0; x < s.size; x++) {
        const t = tile(s, x, y)!,
          px = x * CELL,
          py = y * CELL;
        const grass = [
          [
            "#59774a",
            "#5e7c4f",
            "#628052",
            "#587547",
            "#668354",
            "#5b794b",
            "#607d4e",
            "#648150",
          ],
          [
            "#b79b68",
            "#bfa572",
            "#c5ab77",
            "#c3a570",
            "#c7ae7a",
            "#b69a67",
            "#baa16e",
            "#c8ae7d",
          ],
          [
            "#bfcecf",
            "#c6d4d4",
            "#cbd9d8",
            "#b9cacc",
            "#ccdad8",
            "#c0d0d2",
            "#c6d5d7",
            "#cfdddc",
          ],
          [
            "#455d50",
            "#4b6556",
            "#506958",
            "#435e50",
            "#526d5c",
            "#496457",
            "#4d6758",
            "#536d5e",
          ],
          [
            "#625877",
            "#685e80",
            "#6e6385",
            "#605776",
            "#73688a",
            "#655b7b",
            "#6b6181",
            "#746a8c",
          ],
        ][biome];
        c.fillStyle =
          t.terrain === "water" || t.terrain === "dam"
            ? ["#407d86", "#4a9796", "#61889f", "#355e68", "#626eab"][biome]
            : grass[t.variant];
        c.fillRect(px, py, CELL, CELL);
        if (t.terrain === "water") {
          c.fillStyle = ["#53939a", "#6bb5ab", "#8caebb", "#4c7b83", "#919acb"][
            s.level
          ];
          c.fillRect(px + 2, py + 5 + (t.variant % 3), 7, 1);
          c.fillStyle = "#366d77";
          c.fillRect(px + 8, py + 12, 6, 1);
        } else {
          c.fillStyle = "#88a06855";
          c.fillRect(px + 3, py + 3, 1, 2);
          c.fillRect(px + 11, py + 12, 2, 1);
        }
        if (t.terrain === "tree" && biome === 1) {
          c.fillStyle = "#4e693d";
          if (t.variant % 2) {
            c.fillRect(px + 6, py + 1, 4, 14);
            c.fillRect(px + 2, py + 5, 3, 6);
            c.fillRect(px + 3, py + 9, 4, 2);
            c.fillRect(px + 11, py + 3, 3, 5);
            c.fillRect(px + 8, py + 6, 4, 2);
            c.fillStyle = "#7f9455";
            c.fillRect(px + 7, py + 2, 1, 11);
          } else {
            c.fillStyle = "#896b42";
            c.fillRect(px + 7, py + 4, 2, 11);
            c.fillRect(px + 8, py + 1, 2, 6);
            c.fillStyle = "#4f7648";
            for (const [dx, dy] of [
              [-7, 2],
              [6, 3],
              [-5, -3],
              [5, -3],
            ]) {
              c.beginPath();
              c.moveTo(px + 8, py + 1);
              c.lineTo(px + 8 + dx, py + 1 + dy);
              c.lineTo(px + 8 + dx, py + 4 + dy);
              c.fill();
            }
          }
        } else if (t.terrain === "tree" && biome === 3) {
          c.fillStyle = "#665d3f";
          c.fillRect(px + 7, py + 4, 3, 11);
          c.fillStyle = "#254e43";
          c.beginPath();
          c.ellipse(px + 8, py + 4, 7, 6, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#4d7860";
          c.fillRect(px + 3, py + 1, 6, 3);
          c.fillStyle = "#506b4a";
          c.fillRect(px + 2, py + 6, 1, 6);
          c.fillRect(px + 12, py + 6, 1, 5);
        } else if (t.terrain === "tree" && biome === 4) {
          c.fillStyle = "#37314988";
          c.fillRect(px + 3, py + 10, 12, 6);
          c.fillStyle = "#8fc9c9";
          c.beginPath();
          c.moveTo(px + 8, py - 3);
          c.lineTo(px + 13, py + 5);
          c.lineTo(px + 9, py + 14);
          c.lineTo(px + 3, py + 5);
          c.fill();
          c.fillStyle = "#d6ece0";
          c.beginPath();
          c.moveTo(px + 8, py - 3);
          c.lineTo(px + 9, py + 14);
          c.lineTo(px + 3, py + 5);
          c.fill();
          c.fillStyle = "#8f91c5";
          c.fillRect(px + 1, py + 8, 3, 6);
        } else if (t.terrain === "tree") {
          c.fillStyle = "#294b354f";
          c.fillRect(px + 3, py + 8, 12, 8);
          c.fillStyle = "#644c37";
          c.fillRect(px + 7, py + 8, 3, 7);
          c.fillStyle = "#264b37";
          c.beginPath();
          c.moveTo(px + 8, py - 2);
          c.lineTo(px + 15, py + 11);
          c.lineTo(px + 1, py + 11);
          c.fill();
          c.fillStyle = "#3c6541";
          c.beginPath();
          c.moveTo(px + 7, py);
          c.lineTo(px + 11, py + 7);
          c.lineTo(px + 3, py + 7);
          c.fill();
          c.fillStyle = "#658252";
          c.fillRect(px + 6, py + 2, 2, 3);
          if (biome === 2) {
            c.fillStyle = "#eff4ec";
            c.beginPath();
            c.moveTo(px + 8, py - 2);
            c.lineTo(px + 13, py + 6);
            c.lineTo(px + 4, py + 6);
            c.fill();
            c.fillRect(px + 1, py + 10, 13, 2);
          }
        }
        if (t.terrain === "rock") {
          c.fillStyle = "#31423f55";
          c.fillRect(px + 2, py + 10, 13, 5);
          c.fillStyle = ["#6f7973", "#997947", "#7e96a2", "#657466", "#9791b1"][
            s.level
          ];
          c.beginPath();
          c.moveTo(px + 2, py + 12);
          c.lineTo(px + 3, py + 5);
          c.lineTo(px + 8, py + 1);
          c.lineTo(px + 13, py + 5);
          c.lineTo(px + 15, py + 12);
          c.fill();
          c.fillStyle = ["#a1a69a", "#d6b782", "#e0e9e8", "#8f9b7d", "#c5bde0"][
            s.level
          ];
          c.beginPath();
          c.moveTo(px + 3, py + 5);
          c.lineTo(px + 8, py + 1);
          c.lineTo(px + 9, py + 7);
          c.lineTo(px + 3, py + 10);
          c.fill();
        }
        if (t.terrain === "barricade") {
          c.fillStyle = "#403c2b";
          c.fillRect(px, py + 5, 16, 9);
          c.fillStyle = "#a38556";
          for (let i = 1; i < 16; i += 4) {
            c.fillRect(px + i, py + 2, 2, 12);
            c.fillStyle = "#ccaf74";
            c.fillRect(px + i, py + 1, 2, 2);
            c.fillStyle = "#a38556";
          }
          c.fillStyle = factionColor(t.owner ?? 0);
          c.fillRect(px, py + 6, 16, 2);
        }
        if (t.terrain === "bridge" || t.terrain === "dam") {
          c.fillStyle = t.terrain === "dam" ? "#aaa58b" : "#94714b";
          c.fillRect(px, py + 1, 16, 14);
          c.fillStyle = t.terrain === "dam" ? "#d1c8a8" : "#c7a573";
          for (let j = 2; j < 15; j += 4) c.fillRect(px, py + j, 16, 2);
          c.fillStyle = factionColor(t.owner ?? 0);
          c.fillRect(px, py + 1, 2, 14);
        }
      }
    this.cached = `${s.level}-${s.seed}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}`;
  }
  paintInfluence(s: State) {
    const growthClock = s.houses.some((h) => s.time - h.founded < 8)
      ? Math.floor(s.time * 2)
      : 0;
    const key = `${s.level}-${s.seed}-${s.turfRevision}-${growthClock}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}-${s.stats.cleared}`;
    if (key === this.influenceKey) return;
    this.influenceKey = key;
    if (
      this.influence.width !== s.size * CELL ||
      this.influence.height !== s.size * CELL
    ) {
      this.influence.width = s.size * CELL;
      this.influence.height = s.size * CELL;
      this.influenceCells = [];
    }
    const c = this.influence.getContext("2d")!,
      owners = new Int8Array(s.tiles.length).fill(-1),
      strength = new Float32Array(s.tiles.length),
      sources = new Int32Array(s.tiles.length),
      nearest = new Float32Array(s.tiles.length).fill(99);
    for (const h of s.houses) {
      const growth = Math.max(0, Math.min(1, (s.time - h.founded - 3) / 5));
      if (!growth) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = h.x + dx,
            y = h.y + dy,
            t = tile(s, x, y);
          if (t?.terrain !== "grass") continue;
          const i = y * s.size + x,
            d = dx * dx + dy * dy;
          if (d < nearest[i] || (d === nearest[i] && growth > strength[i])) {
            nearest[i] = d;
            owners[i] = h.team;
            sources[i] = h.id;
            strength[i] = growth;
          }
        }
    }
    for (let i = 0; i < owners.length; i++) {
      const active = owners[i] >= 0 && s.clearedTurf[i] !== sources[i];
      const token = active ? `${owners[i]}/${strength[i].toFixed(3)}` : "";
      if (this.influenceCells[i] === token) continue;
      this.influenceCells[i] = token;
      c.clearRect(
        (i % s.size) * CELL,
        Math.floor(i / s.size) * CELL,
        CELL,
        CELL,
      );
      if (active) {
        const x = (i % s.size) * CELL,
          y = Math.floor(i / s.size) * CELL;
        c.globalAlpha = strength[i] * 0.38;
        c.fillStyle = COLORS[owners[i]];
        c.fillRect(x, y, CELL, CELL);
        c.globalAlpha = strength[i] * 0.56;
        c.fillRect(x + 3, y + 8, 1, 3);
        c.fillRect(x + 2, y + 9, 3, 1);
        c.fillRect(x + 12, y + 2, 1, 3);
        c.fillRect(x + 11, y + 3, 3, 1);
      }
    }
    c.globalAlpha = 1;
  }
  house(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    team: number,
    damage = 0,
  ) {
    if (this.atlases) {
      c.drawImage(
        this.atlases.buildings,
        team * 128 + 32,
        20,
        64,
        72,
        x * CELL + 1,
        y * CELL,
        14,
        CELL,
      );
      if (damage > 0) {
        c.fillStyle = "#102629";
        c.fillRect(x * CELL + 2, y * CELL + 14, 12, 2);
        c.fillStyle = "#e4ae76";
        c.fillRect(
          x * CELL + 2,
          y * CELL + 14,
          12 * Math.max(0, 1 - damage / 200),
          1,
        );
      }
      return;
    }
    const px = x * CELL,
      py = y * CELL;
    c.fillStyle = "#18332b66";
    c.fillRect(px + 1, py + 9, 17, 9);
    c.fillStyle = "#d8cfad";
    c.fillRect(px + 3, py + 5, 11, 10);
    c.fillStyle = "#8b6f4d";
    c.fillRect(px + 7, py + 10, 3, 5);
    c.fillStyle = "#253d3c";
    c.fillRect(px + 11, py + 8, 2, 3);
    c.fillStyle = "#233934";
    c.beginPath();
    c.moveTo(px, py + 6);
    c.lineTo(px + 8, py - 1);
    c.lineTo(px + 17, py + 6);
    c.fill();
    c.fillStyle = COLORS[team];
    c.beginPath();
    c.moveTo(px + 1, py + 5);
    c.lineTo(px + 8, py - 1);
    c.lineTo(px + 15, py + 5);
    c.fill();
    c.fillStyle = "#ffffff55";
    c.fillRect(px + 3, py + 4, 11, 1);
    c.fillStyle = "#706653";
    c.fillRect(px + 12, py - 1, 2, 4);
  }
  castle(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    team: number,
    hp: number,
    fortification = 2000,
  ) {
    const px = (x - 1) * CELL,
      py = (y - 1) * CELL;
    if (this.atlases) {
      c.drawImage(
        this.atlases.buildings,
        team * 128,
        (fortification > 0 ? 1 : 2) * 128,
        128,
        128,
        (x - 1) * CELL,
        (y - 1) * CELL,
        48,
        48,
      );
    } else {
      c.fillStyle = "#20392d88";
      c.fillRect(px + 4, py + 14, 46, 38);
      c.fillStyle = "#8c9589";
      c.fillRect(px + 5, py + 16, 39, 28);
      c.fillStyle = "#c1c3ad";
      c.fillRect(px + 7, py + 18, 34, 22);
      c.fillStyle = "#65736d";
      c.fillRect(px + 18, py + 28, 13, 16);
      c.fillStyle = "#303d39";
      c.fillRect(px + 21, py + 31, 7, 13);
      for (const dx of [0, 32])
        for (const dy of [4, 28]) {
          c.fillStyle = "#b2b9a6";
          c.fillRect(px + dx + 1, py + dy, 14, 16);
          c.fillStyle = "#d2d2b9";
          c.fillRect(px + dx + 1, py + dy, 14, 3);
          c.fillStyle = COLORS[team];
          c.fillRect(px + dx, py + dy - 2, 16, 4);
          c.fillRect(px + dx + 2, py + dy - 5, 3, 4);
          c.fillRect(px + dx + 11, py + dy - 5, 3, 4);
          c.fillStyle = "#485955";
          c.fillRect(px + dx + 6, py + dy + 6, 3, 5);
        }
      c.fillStyle = "#e0d2a2";
      c.fillRect(px + 23, py - 9, 1, 14);
      c.fillStyle = COLORS[team];
      c.fillRect(px + 24, py - 9, 11, 7);
    }
    c.fillStyle = "#182c29";
    c.fillRect(px + 3, py + 48, 42, 3);
    c.fillStyle = COLORS[team];
    c.fillRect(px + 3, py + 48, (42 * hp) / (hp + 200), 3);
    c.fillStyle = "#e7d4a3";
    c.fillRect(px + 3, py + 52, (42 * fortification) / 2000, 2);
  }
  sprite(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    team: number,
    dir: string,
    rank: number,
    frame: number,
    king = false,
  ) {
    if (this.atlases) {
      const f = actorFrame(team, rank, dir, frame, king);
      c.drawImage(
        this.atlases.actors,
        f.x,
        f.y,
        64,
        64,
        Math.round(x) - 16,
        Math.round(y) - 20,
        32,
        32,
      );
      return;
    }
    // One shared pixel template, four directional poses and three silhouettes; palette is the only team difference.
    const scale = rank === 2 ? 1.5 : rank === 1 ? 1.18 : 1;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(scale, scale);
    c.fillStyle = "#182d3566";
    c.fillRect(-4, 5, 9, 3);
    const step = frame % 2 ? 1 : 0;
    const side = dir === "left" || dir === "right",
      sgn = dir === "left" ? -1 : 1;
    c.fillStyle = "#253b3e";
    c.fillRect(-3, 3 + step, 2, 4);
    c.fillRect(1, 4 - step, 2, 4);
    c.fillStyle = rank ? "#607578" : "#b69b70";
    c.fillRect(-3 - (rank ? 1 : 0), -3, 7 + (rank ? 2 : 0), 7);
    c.fillStyle = COLORS[team];
    c.fillRect(-3 - (rank ? 1 : 0), -2, 7 + (rank ? 2 : 0), 4);
    if (dir === "back") c.fillRect(-3, -3, 7, 8);
    c.fillStyle = "#e4bc90";
    c.fillRect(-2, -7, 5, 5);
    if (side) {
      c.fillRect(sgn === 1 ? 2 : -3, -6, 2, 3);
    }
    c.fillStyle = rank ? "#b8c4b8" : "#5b5546";
    c.fillRect(-3, -9, 7, 3);
    if (rank) {
      c.fillRect(-4, -7, 2, 4);
      c.fillRect(3, -7, 2, 4);
      c.fillStyle = COLORS[team];
      c.fillRect(-1, -11, 3, 3);
    }
    c.fillStyle = "#22373b";
    if (dir === "front") {
      c.fillRect(-1, -5, 1, 1);
      c.fillRect(2, -5, 1, 1);
    } else if (side) c.fillRect(sgn === 1 ? 2 : -2, -5, 1, 1);
    else {
      c.fillStyle = rank ? "#8a9c98" : "#5b5546";
      c.fillRect(-2, -7, 5, 5);
    }
    c.fillStyle = "#e4bc90";
    c.fillRect(-5, -1 + step, 2, 3);
    c.fillRect(4, -step, 2, 3);
    if (rank) {
      c.fillStyle = "#d3d9c9";
      c.fillRect(side ? sgn * 6 : 6, -6, 2, 10);
      c.fillStyle = "#b89c60";
      c.fillRect(side ? sgn * 6 - 1 : 5, 1, 4, 1);
      c.fillStyle = COLORS[team];
      c.fillRect(-6, -1, 3, 5);
    }
    if (rank === 2) {
      c.fillStyle = "#d8d7b9";
      c.fillRect(-6, -4, 4, 3);
      c.fillRect(3, -4, 4, 3);
      c.fillStyle = "#edcd7b";
      c.fillRect(-1, -2, 3, 2);
    }
    if (king) {
      c.fillStyle = "#f3d47d";
      c.fillRect(-3, -10, 7, 3);
      c.fillRect(-3, -12, 2, 3);
      c.fillRect(0, -13, 1, 3);
      c.fillRect(2, -12, 2, 3);
    }
    c.restore();
  }
  monsterSprite(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    heading: { x: number; y: number },
    hp: number,
    frame = 0,
  ) {
    if (this.atlases) {
      const f = monsterFrame(tier(hp), direction({ heading }), frame);
      c.drawImage(
        this.atlases.actors,
        f.x,
        f.y,
        64,
        64,
        Math.round(x) - 16,
        Math.round(y) - 20,
        32,
        32,
      );
      return;
    }
    const d = direction({ heading }),
      rank = tier(hp),
      scale = rank === 2 ? 1.55 : rank === 1 ? 1.2 : 1;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(scale, scale);
    c.fillStyle = "#28312b66";
    c.fillRect(-5, 5, 11, 3);
    c.fillStyle = "#45364e";
    c.fillRect(-5, -5, 11, 10);
    c.fillStyle = "#a28aaf";
    c.fillRect(-4, -4, 9, 8);
    c.fillStyle = "#cfb8ce";
    c.fillRect(-3, -6, 7, 3);
    c.fillStyle = "#e5d7ba";
    c.fillRect(-5, -9, 2, 5);
    c.fillRect(4, -9, 2, 5);
    c.fillStyle = "#5c475e";
    c.fillRect(-4, 4 + (frame % 2), 3, 4);
    c.fillRect(2, 5 - (frame % 2), 3, 4);
    c.fillStyle = "#8c7396";
    c.fillRect(-7, -1, 3, 6);
    c.fillRect(5, 0, 3, 5);
    if (d !== "back") {
      c.fillStyle = "#f6e294";
      if (d !== "right") c.fillRect(-2, -3, 2, 2);
      if (d !== "left") c.fillRect(2, -3, 2, 2);
      c.fillStyle = "#453441";
      c.fillRect(-1, 1, 4, 2);
      c.fillStyle = "#f4e4c9";
      c.fillRect(0, 1, 1, 2);
      c.fillRect(2, 1, 1, 2);
    } else {
      c.fillStyle = "#796181";
      c.fillRect(-2, -4, 5, 6);
    }
    if (rank) {
      c.fillStyle = "#d0b8d3";
      c.fillRect(-7, -4, 3, 3);
      c.fillRect(6, -4, 3, 3);
    }
    c.restore();
  }
  visible(p: { x: number; y: number }, padding = 48) {
    const x = this.ox + (p.x + 0.5) * CELL * this.zoom,
      y = this.oy + (p.y + 0.5) * CELL * this.zoom,
      m = padding * this.zoom;
    return x >= -m && y >= -m && x <= this.width + m && y <= this.height + m;
  }
  draw(
    s: State,
    selected: Set<number>,
    hover?: { x: number; y: number },
    drag?: { x: number; y: number; w: number; h: number },
    targetMode = "",
  ) {
    this.state = s;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = "#14282a";
    c.fillRect(0, 0, this.width, this.height);
    const key = `${s.level}-${s.seed}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}`;
    if (this.cached !== key) this.paintTerrain(s);
    c.save();
    c.translate(this.ox, this.oy);
    c.scale(this.zoom, this.zoom);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.terrain, 0, 0);
    this.paintInfluence(s);
    c.drawImage(this.influence, 0, 0);
    for (const b of s.structures) {
      if (b.construction) {
        const p = b.cells[0],
          x = p.x * CELL,
          y = p.y * CELL;
        if (this.atlases) {
          c.drawImage(
            this.atlases.buildings,
            (b.kind === "bridge" ? 1 : 2) * 128 + 44,
            3 * 128 + 46,
            40,
            40,
            x,
            y,
            CELL,
            CELL,
          );
        } else {
          c.fillStyle = "#c3a77e";
          c.fillRect(x + 1, y + 2, 2, 12);
          c.fillRect(x + 13, y + 2, 2, 12);
          c.fillRect(x + 1, y + 5, 14, 2);
          c.fillRect(x + 1, y + 11, 14, 2);
        }
        c.fillStyle = factionColor(b.team);
        c.fillRect(
          x + 1,
          y + 15,
          (14 * b.construction.paid) / b.construction.total,
          2,
        );
      }
      if (
        this.zoom < 0.65 &&
        !(hover && b.cells.some((p) => p.x === hover.x && p.y === hover.y))
      )
        continue;
      const mid = b.cells[Math.floor(b.cells.length / 2)],
        x = (mid.x + 0.5) * CELL,
        y = mid.y * CELL - 6;
      c.fillStyle = "#142b2b";
      c.fillRect(x - 12, y, 24, 3);
      c.fillStyle = factionColor(b.team);
      c.fillRect(x - 12, y, (24 * b.hp) / b.maxHp, 3);
      if (hover && b.cells.some((p) => p.x === hover.x && p.y === hover.y)) {
        c.font = "8px monospace";
        c.fillStyle = "#f3e4b4";
        c.textAlign = "center";
        c.fillText(
          b.construction
            ? `Chantier ${Math.floor((100 * b.construction.paid) / b.construction.total)} %`
            : `${Math.ceil(b.hp)} PV`,
          x,
          y - 3,
        );
      }
    }
    for (const cave of s.caves) {
      if (!this.visible(cave)) continue;
      const x = cave.x * CELL,
        y = cave.y * CELL;
      if (this.atlases) {
        c.drawImage(
          this.atlases.buildings,
          16,
          3 * 128 + 24,
          96,
          80,
          x,
          y + 1,
          CELL,
          14,
        );
      } else {
        c.fillStyle = "#30362f88";
        c.fillRect(x - 3, y + 7, 24, 12);
        c.fillStyle = "#72766a";
        c.beginPath();
        c.moveTo(x - 4, y + 15);
        c.lineTo(x - 1, y + 1);
        c.lineTo(x + 8, y - 5);
        c.lineTo(x + 18, y + 1);
        c.lineTo(x + 22, y + 15);
        c.fill();
        c.fillStyle = "#a0a18d";
        c.beginPath();
        c.moveTo(x - 1, y + 1);
        c.lineTo(x + 8, y - 5);
        c.lineTo(x + 6, y + 5);
        c.lineTo(x - 2, y + 10);
        c.fill();
        c.fillStyle = "#182523";
        c.fillRect(x + 3, y + 5, 12, 12);
        c.fillStyle = "#bea0cb";
        c.fillRect(x + 5, y + 10, 2, 2);
        c.fillRect(x + 11, y + 10, 2, 2);
      }
      c.fillStyle = "#1c302c";
      c.fillRect(x - 3, y + 19, 24, 3);
      c.fillStyle = "#c3a1db";
      c.fillRect(x - 3, y + 19, (24 * cave.hp) / cave.maxHp, 3);
    }
    for (const h of s.houses)
      if (this.visible(h)) this.house(c, h.x, h.y, h.team, h.damage);
    for (const ruin of s.ruins) {
      const key = `${s.seed}-${ruin.team}-${ruin.time}`;
      if (!this.collapseTimes.has(key))
        this.collapseTimes.set(
          key,
          performance.now() - (s.time - ruin.time > 3 ? 3000 : 0),
        );
      const elapsed = (performance.now() - this.collapseTimes.get(key)!) / 1000;
      const x = (ruin.x - 0.5) * CELL,
        y = (ruin.y + 0.5) * CELL;
      if (elapsed < 1.4) {
        c.save();
        c.translate((ruin.x + 0.5) * CELL, (ruin.y + 1.5) * CELL);
        c.scale(1, Math.max(0.08, 1 - elapsed / 1.4));
        c.translate(-(ruin.x + 0.5) * CELL, -(ruin.y + 1.5) * CELL);
        this.castle(c, ruin.x, ruin.y, ruin.team, 0);
        c.restore();
      }
      if (this.atlases) {
        c.drawImage(
          this.atlases.buildings,
          ruin.team * 128,
          4 * 128,
          128,
          128,
          (ruin.x - 1) * CELL,
          (ruin.y - 1) * CELL,
          48,
          48,
        );
      } else {
        c.fillStyle = "#9d9f8b";
        for (let i = 0; i < 11; i++)
          c.fillRect(
            x - 10 + ((i * 19) % 44),
            y + 4 + ((i * 7) % 18),
            5 + (i % 3),
            3,
          );
        c.fillStyle = COLORS[ruin.team];
        c.fillRect(x + 8, y + 9, 11, 3);
      }
      if (elapsed < 2) {
        c.fillStyle = `rgba(213,202,169,${Math.max(0, 0.5 - elapsed * 0.2)})`;
        for (let i = 0; i < 8; i++) {
          c.beginPath();
          c.arc(
            x - 10 + ((i * 13) % 50),
            y - elapsed * 15 + (i % 3) * 8,
            5 + elapsed * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
    }
    for (const k of s.kingdoms)
      if (k.alive)
        this.castle(c, k.castle.x, k.castle.y, k.id, k.hp, k.fortification);
    const units = s.units
      .filter((u) => this.visible(u))
      .sort((a, b) => a.y - b.y);
    for (const u of units) {
      const x = (u.x + 0.5) * CELL,
        y = (u.y + 0.5) * CELL;
      if (selected.has(u.id)) {
        c.strokeStyle = "#fff4bc";
        c.lineWidth = 1.5 / this.zoom;
        c.beginPath();
        c.ellipse(x, y + 5, 8 + tier(u.hp) * 2, 4, 0, 0, Math.PI * 2);
        c.stroke();
      }
      this.sprite(
        c,
        x,
        y,
        u.team,
        direction(u),
        tier(u.hp),
        Math.floor(u.age * 4),
        !!u.royal,
      );
      if (this.showUnitHP) {
        c.font = "bold 8px monospace";
        c.textAlign = "center";
        c.fillStyle = "#102629";
        const text =
          u.hp >= 10000
            ? `${(u.hp / 1000).toFixed(1)}k`
            : Math.ceil(u.hp).toString();
        const width = Math.max(24, c.measureText(text).width + 6);
        c.fillRect(x - width / 2, y - 23 - tier(u.hp) * 3, width, 9);
        c.fillStyle = "#fff0c1";
        c.fillText(text, x, y - 16 - tier(u.hp) * 3);
      }
    }
    for (const m of s.monsters) {
      if (!this.visible(m)) continue;
      const x = (m.x + 0.5) * CELL,
        y = (m.y + 0.5) * CELL;
      this.monsterSprite(
        c,
        x,
        y,
        m.heading,
        m.hp,
        Math.floor(s.time * 4 + m.id),
      );
      if (this.showUnitHP) {
        c.font = "bold 8px monospace";
        c.textAlign = "center";
        c.fillStyle = "#242d2b";
        const width = Math.max(
          32,
          c.measureText(`${Math.ceil(m.hp)}`).width + 6,
        );
        c.fillRect(x - width / 2, y - 25 - tier(m.hp) * 3, width, 9);
        c.fillStyle = "#f4c8e5";
        c.fillText(`${Math.ceil(m.hp)}`, x, y - 18 - tier(m.hp) * 3);
      }
    }
    if (hover && tile(s, hover.x, hover.y)) {
      const px = hover.x * CELL,
        py = hover.y * CELL;
      c.strokeStyle = targetMode ? "#ffe3a1" : "#ffffff70";
      c.lineWidth = 1 / this.zoom;
      c.strokeRect(px, py, CELL, CELL);
    }
    c.restore();
    if (drag) {
      c.fillStyle = "#edda9b22";
      c.strokeStyle = "#f5deb0";
      c.fillRect(drag.x, drag.y, drag.w, drag.h);
      c.strokeRect(drag.x, drag.y, drag.w, drag.h);
    }
    if (this.pointer && !drag) {
      const p = this.pointer;
      const candidates = [
        ...s.units.map((u) => ({
          ...u,
          name: `${u.royal ? "Roi " : ""}${TEAM_NAMES[u.team]}`,
        })),
        ...s.monsters.map((m) => ({ ...m, name: "Monstre", order: "auto" })),
      ];
      const hovered = candidates
        .filter((u) => u.hp > 0)
        .map((u) => {
          const q = this.screen(u.x, u.y);
          return { u, q, d: Math.hypot(p.x - q.x, p.y - q.y + 4 * this.zoom) };
        })
        .filter(
          ({ u, q }) =>
            Math.abs(p.x - q.x) <=
              Math.max(4, (8 + tier(u.hp) * 2) * this.zoom) &&
            p.y >= q.y - (15 + tier(u.hp) * 3) * this.zoom &&
            p.y <= q.y + 8 * this.zoom,
        )
        .sort((a, b) => a.d - b.d)[0]?.u;
      if (hovered) {
        const text = `${hovered.name} · ${Math.ceil(hovered.hp).toLocaleString("fr-FR")} PV`;
        c.font = "12px sans-serif";
        c.textAlign = "left";
        const width = c.measureText(text).width + 18,
          x = Math.max(4, Math.min(this.width - width - 4, p.x + 14)),
          y = Math.max(4, Math.min(this.height - 28, p.y - 34));
        c.fillStyle = "#102629f2";
        c.fillRect(x, y, width, 24);
        c.strokeStyle = "#ddc18a";
        c.strokeRect(x, y, width, 24);
        c.fillStyle = "#fff0c1";
        c.fillText(text, x + 9, y + 16);
      }
    }
  }
}
