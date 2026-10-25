import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { createGame, step, LEVELS } from "../src/engine.ts";
import { Renderer } from "../src/render.ts";
const out = createCanvas(1200, 800),
  c = out.getContext("2d");
c.fillStyle = "#14282a";
c.fillRect(0, 0, 1200, 800);
c.fillStyle = "#e2c58c";
c.font = "30px Georgia";
c.fillText("Les Quatre Couronnes", 35, 130);
c.fillStyle = "#c2d0bc";
c.font = "17px sans-serif";
c.fillText("Cinq vallées à conquérir", 35, 176);
c.fillText("Forêt · désert · neige", 35, 216);
c.fillText("Marais · cristaux", 35, 247);
c.font = "13px sans-serif";
c.fillStyle = "#94a89d";
c.fillText("Chaque victoire ouvre le chapitre suivant.", 35, 304);
for (let level = 0; level < 5; level++) {
  const s = createGame(level, 5321);
  for (let i = 0; i < 100; i++) step(s);
  const terrain = createCanvas(s.size * 16, s.size * 16),
    influence = createCanvas(s.size * 16, s.size * 16);
  const r = {
    terrain,
    tctx: terrain.getContext("2d"),
    influence,
    influenceKey: "",
    cached: "",
    sprite: Renderer.prototype.sprite,
  } as unknown as Renderer;
  Renderer.prototype.paintTerrain.call(r, s);
  Renderer.prototype.paintInfluence.call(r, s);
  const g = terrain.getContext("2d");
  g.drawImage(influence, 0, 0);
  for (const h of s.houses)
    Renderer.prototype.house.call(
      r,
      g as unknown as CanvasRenderingContext2D,
      h.x,
      h.y,
      h.team,
    );
  for (const k of s.kingdoms)
    Renderer.prototype.castle.call(
      r,
      g as unknown as CanvasRenderingContext2D,
      k.castle.x,
      k.castle.y,
      k.id,
      k.hp,
    );
  for (const u of s.units)
    r.sprite(
      g as unknown as CanvasRenderingContext2D,
      (u.x + 0.5) * 16,
      (u.y + 0.5) * 16,
      u.team,
      "front",
      0,
      0,
      !!u.royal,
    );
  const panel = level + 1,
    x = (panel % 3) * 400,
    y = Math.floor(panel / 3) * 400;
  c.imageSmoothingEnabled = false;
  c.drawImage(terrain, x + 12, y + 42, 376, 346);
  c.fillStyle = "#ead7ac";
  c.font = "18px Georgia";
  c.fillText(`${level + 1}. ${LEVELS[level].name}`, x + 14, y + 27);
}
writeFileSync("public/biomes.png", out.toBuffer("image/png"));
console.log("Five rendered biome previews exported.");
