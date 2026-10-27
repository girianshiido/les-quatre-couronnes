export const ACTOR_CELL = 64;
export const BUILDING_CELL = 128;
export const TILE_CELL = 32;
export const TERRAIN_FRAMES = [
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
  "massif-0",
  "massif-1",
  "massif-2",
  "massif-3",
  "massif-4",
  "massif-5",
  "massif-6",
  "massif-7",
  "massif-8",
  "massif-9",
  "massif-10",
  "massif-11",
  "massif-12",
  "massif-13",
  "massif-14",
  "massif-15",
] as const;
export type TerrainFrame = (typeof TERRAIN_FRAMES)[number];
export interface Atlases {
  actors: CanvasImageSource;
  world: CanvasImageSource;
  buildings: CanvasImageSource;
}
export function actorFrame(
  team: number,
  rank: number,
  dir: string,
  pose: number,
  royal = false,
) {
  const d = Math.max(0, ["front", "back", "left", "right"].indexOf(dir));
  return {
    x: (d * 2 + (pose % 2)) * ACTOR_CELL,
    y: ((royal ? 12 : 0) + team * 3 + rank) * ACTOR_CELL,
  };
}
export function monsterFrame(rank: number, dir: string, pose: number) {
  const d = Math.max(0, ["front", "back", "left", "right"].indexOf(dir));
  return { x: (d * 2 + (pose % 2)) * ACTOR_CELL, y: (24 + rank) * ACTOR_CELL };
}
export function terrainFrame(
  biome: number,
  kind: TerrainFrame,
  variant: number,
) {
  return {
    x: (variant % 8) * TILE_CELL,
    y:
      (biome * TERRAIN_FRAMES.length + TERRAIN_FRAMES.indexOf(kind)) *
      TILE_CELL,
  };
}
export async function loadAtlases(): Promise<Atlases> {
  const image = (file: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error(`Illustration indisponible : ${file}`));
      img.src = new URL(`art/${file}.png`, document.baseURI).href;
    });
  const [actors, world, buildings] = await Promise.all([
    image("actors"),
    image("world"),
    image("buildings"),
  ]);
  return { actors, world, buildings };
}
