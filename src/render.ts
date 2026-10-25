import { type State, type Unit, COLORS, tile } from "./engine";
export const CELL = 16;
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
  collapseTimes = new Map<string, number>();
  zoom = 1;
  ox = 0;
  oy = 0;
  width = 0;
  height = 0;
  dpr = 1;
  state!: State;
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
  paintTerrain(s: State) {
    this.terrain.width = s.size * CELL;
    this.terrain.height = s.size * CELL;
    const c = this.tctx;
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
        ][s.level];
        c.fillStyle =
          t.terrain === "water" || t.terrain === "dam"
            ? ["#407d86", "#4a9796", "#61889f", "#355e68", "#626eab"][s.level]
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
        if (t.terrain === "tree" && s.level === 1) {
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
        } else if (t.terrain === "tree" && s.level === 3) {
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
        } else if (t.terrain === "tree" && s.level === 4) {
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
          if (s.level === 2) {
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
          c.fillStyle = COLORS[t.owner ?? 0];
          c.fillRect(px, py + 6, 16, 2);
        }
        if (t.terrain === "bridge" || t.terrain === "dam") {
          c.fillStyle = t.terrain === "dam" ? "#aaa58b" : "#94714b";
          c.fillRect(px, py + 1, 16, 14);
          c.fillStyle = t.terrain === "dam" ? "#d1c8a8" : "#c7a573";
          for (let j = 2; j < 15; j += 4) c.fillRect(px, py + j, 16, 2);
          c.fillStyle = COLORS[t.owner ?? 0];
          c.fillRect(px, py + 1, 2, 14);
        }
      }
    this.cached = `${s.level}-${s.seed}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}`;
  }
  paintInfluence(s: State) {
    const key = `${s.level}-${s.seed}-${Math.floor(s.time * 2)}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}-${s.stats.cleared}`;
    if (key === this.influenceKey) return;
    this.influenceKey = key;
    this.influence.width = s.size * CELL;
    this.influence.height = s.size * CELL;
    const c = this.influence.getContext("2d")!,
      owners = new Int8Array(s.tiles.length).fill(-1),
      strength = new Float32Array(s.tiles.length),
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
            strength[i] = growth;
          }
        }
    }
    for (let i = 0; i < owners.length; i++)
      if (owners[i] >= 0) {
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
    c.globalAlpha = 1;
  }
  house(c: CanvasRenderingContext2D, x: number, y: number, team: number) {
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
  ) {
    const px = (x - 1) * CELL,
      py = (y - 1) * CELL;
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
    c.fillStyle = "#182c29";
    c.fillRect(px + 3, py + 48, 42, 3);
    c.fillStyle = COLORS[team];
    c.fillRect(px + 3, py + 48, (42 * hp) / (hp + 200), 3);
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
    const key = `${s.level}-${s.seed}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}`;
    if (this.cached !== key) this.paintTerrain(s);
    c.save();
    c.translate(this.ox, this.oy);
    c.scale(this.zoom, this.zoom);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.terrain, 0, 0);
    this.paintInfluence(s);
    c.drawImage(this.influence, 0, 0);
    for (const b of s.structures) {
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
      c.fillStyle = COLORS[b.team];
      c.fillRect(x - 12, y, (24 * b.hp) / b.maxHp, 3);
      if (hover && b.cells.some((p) => p.x === hover.x && p.y === hover.y)) {
        c.font = "8px monospace";
        c.fillStyle = "#f3e4b4";
        c.textAlign = "center";
        c.fillText(`${Math.ceil(b.hp)} PV`, x, y - 3);
      }
    }
    for (const h of s.houses) this.house(c, h.x, h.y, h.team);
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
      if (k.alive) this.castle(c, k.castle.x, k.castle.y, k.id, k.hp);
    const units = [...s.units].sort((a, b) => a.y - b.y);
    for (const u of units) {
      const x =
          (u.x + 0.5) * CELL + (u.order === "rest" ? ((u.id % 3) - 1) * 3 : 0),
        y =
          (u.y + 0.5) * CELL +
          (u.order === "rest" ? ((Math.floor(u.id / 3) % 3) - 1) * 2 : 0);
      if (selected.has(u.id)) {
        c.strokeStyle = "#fff4bc";
        c.lineWidth = 1.5 / this.zoom;
        c.beginPath();
        c.ellipse(x, y + 5, 8 + tier(u.hp) * 2, 4, 0, 0, Math.PI * 2);
        c.stroke();
        if (u.target) {
          c.strokeStyle = "#f4dc8b80";
          c.setLineDash([4, 5]);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo((u.target.x + 0.5) * CELL, (u.target.y + 0.5) * CELL);
          c.stroke();
          c.setLineDash([]);
        }
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
      if (u.royal || u.hp >= 1000 || selected.has(u.id)) {
        c.font = "bold 8px monospace";
        c.textAlign = "center";
        c.fillStyle = "#102629";
        const text =
          u.hp >= 10000
            ? `${(u.hp / 1000).toFixed(1)}k`
            : Math.ceil(u.hp).toString();
        c.fillRect(x - 12, y - 23 - tier(u.hp) * 3, 24, 9);
        c.fillStyle = "#fff0c1";
        c.fillText(text, x, y - 16 - tier(u.hp) * 3);
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
  }
}
