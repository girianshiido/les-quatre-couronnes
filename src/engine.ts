import { CAMPAIGN_MAPS } from "./campaign-maps";
import {
  DEFAULT_PRIORITIES,
  validPriorities,
  type Priority,
  DOCTRINES,
  validDoctrine,
  type DoctrineId,
} from "./doctrine";
import { seedCaves, tickMonsters, attackMonster, attackCave } from "./monsters";
export type Terrain =
  "grass" | "tree" | "rock" | "water" | "bridge" | "dam" | "barricade";
export type Order =
  | "auto"
  | "move"
  | "attack"
  | "merge"
  | "house"
  | "build-many"
  | "clear-many"
  | "demolish-many"
  | "bridge"
  | "dam"
  | "barricade"
  | "hold"
  | "rest"
  | "shelter"
  | "defend"
  | "raid";
export const CONTINUOUS_ORDERS: readonly Order[] = [
  "build-many",
  "clear-many",
  "demolish-many",
];
export const isContinuousOrder = (order: Order) =>
  CONTINUOUS_ORDERS.includes(order);
export const CLEARING_COSTS = { tree: 30, rock: 15 } as const;
export interface Point {
  x: number;
  y: number;
}
export interface Tile {
  terrain: Terrain;
  variant: number;
  permanent?: boolean;
  owner?: number;
  house?: number;
  castle?: number;
  cave?: number;
}
export interface Unit extends Point {
  id: number;
  team: number;
  hp: number;
  age: number;
  wait: number;
  order: Order;
  target?: Point;
  heading: Point;
  royal?: boolean;
  reserve?: number;
  wounds?: number;
  defending?: number;
  formation?: boolean;
  occupying?: boolean;
  pursue?: number;
  pursueTeam?: number;
  mergeGroup?: number;
}
export interface House extends Point {
  id: number;
  team: number;
  timer: number;
  interval: number;
  founded: number;
  damage?: number;
}
export interface Kingdom {
  id: number;
  gold: number;
  tax: number;
  automatic: boolean;
  bridgeSaving: boolean;
  crossingPlan?: Point[];
  alive: boolean;
  hp: number;
  fortification: number;
  castle: Point;
  births: number;
  kills: number;
}
export interface Event {
  time: number;
  text: string;
  team: number;
}
export interface Structure {
  id: number;
  kind: "bridge" | "barricade";
  team: number;
  hp: number;
  maxHp: number;
  cells: Point[];
  construction?: { paid: number; total: number };
}
export interface Cave extends Point {
  id: number;
  hp: number;
  maxHp: number;
  timer: number;
  interval: number;
  spawnHp: number;
}
export interface Monster extends Point {
  id: number;
  hp: number;
  wait: number;
  heading: Point;
  cave: number;
}
export interface State {
  battleStarted?: boolean;
  alliance?: { partner: 1 | 2 | 3; broken: boolean };
  version: 2;
  campaignVersion: 2;
  priorities: Priority[];
  doctrine: DoctrineId;
  clearedTurf: Record<string, number>;
  turfRevision: number;
  size: number;
  level: number;
  seed: number;
  rng: number;
  time: number;
  nextId: number;
  tiles: Tile[];
  units: Unit[];
  houses: House[];
  caves: Cave[];
  monsters: Monster[];
  kingdoms: Kingdom[];
  events: Event[];
  structures: Structure[];
  bridgeSites: Point[][];
  ruins: { team: number; x: number; y: number; time: number }[];
  result: "playing" | "won" | "lost";
  stats: { cleared: number; bridges: number; dams: number; merged: number };
}
export function areAllied(
  s: State,
  a: number | undefined,
  b: number | undefined,
) {
  if (a === undefined || b === undefined) return false;
  if (a === b) return true;
  if (!s.alliance || s.alliance.broken || a > 3 || b > 3) return false;
  const partner = s.alliance.partner;
  return (a === 0 || a === partner) === (b === 0 || b === partner);
}
export function chooseAlliance(s: State, partner?: number) {
  if (s.battleStarted || s.time > 0 || s.result !== "playing") return false;
  if (
    partner !== undefined &&
    (![1, 2, 3].includes(partner) || !s.kingdoms[partner]?.alive)
  )
    return false;
  s.alliance =
    partner === undefined
      ? undefined
      : { partner: partner as 1 | 2 | 3, broken: false };
  invalidateWorld(s);
  return true;
}
function updateAlliance(s: State) {
  if (!s.alliance || s.alliance.broken) return;
  const alive = s.kingdoms.filter((k) => k.alive);
  if (
    alive.length > 2 ||
    alive.length < 2 ||
    !areAllied(s, alive[0].id, alive[1].id)
  )
    return;
  s.alliance.broken = true;
  // Diplomacy affects pathfinding, shelter and AI targets as well as combat.
  invalidateWorld(s);
  for (const k of s.kingdoms) delete k.crossingPlan;
  for (const u of s.units)
    if (["auto", "rest", "defend", "raid"].includes(u.order)) finishTravel(u);
  const cells = new Map<number, Unit[]>();
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const key = u.y * s.size + u.x;
    for (const other of cells.get(key) ?? []) {
      if (other.hp > 0 && u.hp > 0 && !areAllied(s, u.team, other.team))
        resolveEncounter(s, u, other);
    }
    const stack = cells.get(key) ?? [];
    stack.push(u);
    cells.set(key, stack);
  }
  s.units = s.units.filter((u) => u.hp > 0 && s.kingdoms[u.team].alive);
  refreshKings(s);
}
interface SpatialIndex {
  houses: Map<number, House>;
  houseCells: Map<number, House>;
  structures: Map<number, Structure>;
  plots: Uint8Array;
  danger: Uint8Array[];
  counts: number[];
}
const spatial = new WeakMap<State, SpatialIndex>();
const simulating = new WeakSet<State>();
const worldSignatures = new WeakMap<State, number>();
function spatialIndex(s: State) {
  if (!simulating.has(s)) return;
  let index = spatial.get(s);
  if (index) return index;
  index = {
    houses: new Map(),
    houseCells: new Map(),
    structures: new Map(),
    plots: new Uint8Array(s.tiles.length),
    danger: Array.from({ length: 4 }, () => new Uint8Array(s.tiles.length)),
    counts: [0, 0, 0, 0],
  };
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    index.plots[i] = Number(
      !t.permanent &&
        t.terrain === "grass" &&
        t.house === undefined &&
        t.castle === undefined &&
        t.cave === undefined,
    );
  }
  for (const h of s.houses) {
    index.houses.set(h.id, h);
    index.houseCells.set(idx(s, h.x, h.y), h);
    index.counts[h.team]++;
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5 + Math.abs(dy); dx <= 5 - Math.abs(dy); dx++)
        if (inside(s, h.x + dx, h.y + dy))
          index.danger[h.team][idx(s, h.x + dx, h.y + dy)] = 1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (inside(s, h.x + dx, h.y + dy))
          index.plots[idx(s, h.x + dx, h.y + dy)] = 0;
  }
  for (const b of s.structures)
    for (const p of b.cells) {
      index.structures.set(idx(s, p.x, p.y), b);
      index.plots[idx(s, p.x, p.y)] = 0;
    }
  spatial.set(s, index);
  return index;
}
function houseById(s: State, id: number | undefined) {
  return id === undefined
    ? undefined
    : (spatialIndex(s)?.houses.get(id) ?? s.houses.find((h) => h.id === id));
}
export function invalidateWorld(s: State) {
  spatial.delete(s);
  connectivity.delete(s);
  supplyFields.delete(s);
  flowCaches.delete(s);
  shelterPlans.delete(s);
  landLinks.delete(s);
}
const connectivity = new WeakMap<State, Int32Array>();
function sameLand(s: State, a: Point, b: Point) {
  let regions = connectivity.get(s);
  if (!regions) {
    regions = new Int32Array(s.tiles.length).fill(-1);
    const queue = new Int32Array(s.tiles.length);
    let region = 0;
    const pass = (i: number) =>
      !s.tiles[i].permanent &&
      !["water", "dam", "barricade"].includes(s.tiles[i].terrain);
    for (let i = 0; i < regions.length; i++) {
      if (regions[i] >= 0 || !pass(i)) continue;
      let head = 0,
        tail = 0;
      queue[tail++] = i;
      regions[i] = region;
      while (head < tail) {
        const at = queue[head++],
          x = at % s.size,
          y = Math.floor(at / s.size);
        for (const n of [
          x > 0 ? at - 1 : -1,
          x < s.size - 1 ? at + 1 : -1,
          y > 0 ? at - s.size : -1,
          y < s.size - 1 ? at + s.size : -1,
        ])
          if (n >= 0 && regions[n] < 0 && pass(n)) {
            regions[n] = region;
            queue[tail++] = n;
          }
      }
      region++;
    }
    if (simulating.has(s)) connectivity.set(s, regions);
  }
  const ai = idx(s, a.x, a.y),
    bi = idx(s, b.x, b.y);
  return regions[ai] >= 0 && regions[ai] === regions[bi];
}
const unitCells = new WeakMap<State, Map<number, Unit[]>>();
function unitsAt(s: State, p: Point) {
  if (!simulating.has(s))
    return s.units.filter((u) => u.hp > 0 && u.x === p.x && u.y === p.y);
  let cells = unitCells.get(s);
  if (!cells) {
    cells = new Map();
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      const i = idx(s, u.x, u.y);
      const bucket = cells.get(i) ?? [];
      bucket.push(u);
      cells.set(i, bucket);
    }
    unitCells.set(s, cells);
  }
  return (cells.get(idx(s, p.x, p.y)) ?? []).filter((u) => u.hp > 0);
}
function moveInIndex(s: State, u: Unit, p: Point) {
  const cells = unitCells.get(s);
  if (!cells) return;
  const old = idx(s, u.x, u.y),
    next = idx(s, p.x, p.y);
  cells.set(
    old,
    (cells.get(old) ?? []).filter((v) => v.id !== u.id),
  );
  const bucket = cells.get(next) ?? [];
  bucket.push(u);
  cells.set(next, bucket);
}
function worldSignature(s: State) {
  let hash = 2166136261;
  for (const t of s.tiles) {
    hash = Math.imul(
      hash ^
        (t.terrain.charCodeAt(0) +
          (t.terrain === "barricade" ? 256 : 0) +
          (t.owner ?? 9) * 512 +
          (t.castle ?? 9) * 8192 +
          (t.cave ?? 0) * 131072),
      16777619,
    );
  }
  for (const h of s.houses)
    hash = Math.imul(
      hash ^ (h.id + h.team * 65537 + h.x * 193 + h.y * 307),
      16777619,
    );
  for (const b of s.structures)
    hash = Math.imul(hash ^ (b.id + (b.construction ? 0 : 65537)), 16777619);
  return hash;
}
export const TEAM_NAMES = ["Émeraude", "Azur", "Ambre", "Carmin"];
export const COLORS = ["#73cc97", "#70baff", "#edc86b", "#ef8580"];
const BIOME_NAMES = [
  "Forêt & montagne",
  "Désert & palmeraies",
  "Terres enneigées",
  "Marais & cyprès",
  "Forêt cristalline",
];
const VALLEYS = [
  [
    "La vallée des premiers jours",
    "Le sentier des pins",
    "Les îlots du nord",
    "Les gorges boisées",
    "Le col des trois bannières",
  ],
  [
    "Les oasis du soleil",
    "Les dunes jumelles",
    "Les oasis éparpillées",
    "La gorge d’ambre",
    "Les portes de Sable",
  ],
  [
    "Les couronnes du givre",
    "La passe blanche",
    "Les rives gelées",
    "Le refuge des rois",
    "L’hiver des couronnes",
  ],
  [
    "Le bassin des brumes",
    "Les îlots oubliés",
    "Les routes de tourbe",
    "La forêt noyée",
    "Le grand delta",
  ],
  [
    "La vallée de cristal",
    "Les veines du prisme",
    "Le jardin des éclats",
    "Les failles d’azur",
    "Le trône de lumière",
  ],
];
export const LEVELS = VALLEYS.flatMap((names, biomeId) =>
  names.map((name, stage) => ({
    name,
    biome: BIOME_NAMES[biomeId],
    biomeId,
    stage,
    size: 48,
    scenario: ["valley", "ridge", "islands", "gorge", "arena"][stage],
    enemyHouses: biomeId === 0 ? 4 : biomeId < 2 ? 4 : biomeId < 4 ? 5 : 6,
    caves: stage === 3 || (stage === 4 && biomeId >= 2),
  })),
);
export function birthInterval(tax: number) {
  return 6 + 174 * (Math.max(0, Math.min(30, tax)) / 30) ** 2;
}
export function random(s: State) {
  s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export const idx = (s: State, x: number, y: number) => y * s.size + x;
export const inside = (s: State, x: number, y: number) =>
  x >= 0 && y >= 0 && x < s.size && y < s.size;
export const tile = (s: State, x: number, y: number) =>
  inside(s, x, y) ? s.tiles[idx(s, x, y)] : undefined;
export const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** A campaign map is literal data; only the simulation random stream uses the caller's seed. */
export function createGame(level = 0, seed = 14243): State {
  level = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(level)));
  if (LEVELS[level].size !== 48) return createGeneratedGame(level, seed);
  const map = CAMPAIGN_MAPS[level];
  const s = createGeneratedGame(level, 14243 + level * 7919);
  s.seed = seed;
  s.rng = seed >>> 0;
  s.houses = [];
  s.structures = [];
  s.bridgeSites = [];
  s.caves = [];
  s.monsters = [];
  s.events = [];
  s.stats = { cleared: 0, bridges: 0, dams: 0, merged: 0 };
  s.tiles = map.rows.flatMap((row, y) =>
    [...row].map((code, x): Tile => ({
      terrain:
        code === "#"
          ? "rock"
          : code === "r"
            ? "rock"
            : code === "T"
              ? "tree"
              : code === "~"
                ? "water"
                : "grass",
      variant: ((x * 37 + y * 19 + level * 7) ^ ((x + y) * 13)) & 7,
      ...(code === "#" || x === 0 || y === 0 || x === 47 || y === 47
        ? { permanent: true }
        : {}),
    })),
  );
  for (const k of s.kingdoms) {
    k.castle = { ...map.castles[k.id] };
    k.hp = 100;
    k.gold = 5000;
    k.tax = 12;
    k.automatic = true;
    k.alive = true;
    k.births = 0;
    k.kills = 0;
    const c = k.castle;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = tile(s, c.x + dx, c.y + dy)!;
        t.terrain = "grass";
        delete t.permanent;
        t.castle = k.id;
      }
    const offsets =
      level === 0 && k.id !== 0
        ? [
            [-4, -3],
            [4, 3],
          ]
        : [
            [-4, -3],
            [3, -4],
            [-3, 4],
            [4, 3],
            [0, 5],
            [0, -5],
          ].slice(
            0,
            k.id === 0 ? (level === 0 ? 5 : 4) : LEVELS[level].enemyHouses,
          );
    for (const [dx, dy] of offsets) {
      const t = tile(s, c.x + dx, c.y + dy)!;
      t.terrain = "grass";
      delete t.permanent;
      addHouse(s, k.id, c.x + dx, c.y + dy, false);
    }
    const king = s.units.find((u) => u.royal && u.team === k.id)!;
    king.x = c.x;
    king.y = c.y;
    king.hp = 100;
    king.reserve = 100;
  }
  for (const [x, y, team] of map.bridges) {
    tile(s, x, y)!.terrain = "bridge";
    tile(s, x, y)!.owner = team;
    s.structures.push({
      id: s.nextId++,
      team,
      kind: "bridge",
      hp: 1000,
      maxHp: 1000,
      cells: [{ x, y }],
    });
    s.bridgeSites.push([{ x, y }]);
    s.stats.bridges++;
  }
  seedCaves(s);
  invalidateWorld(s);

  return s;
}
function createGeneratedGame(level = 0, seed = 14243): State {
  level = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(level)));
  const size = LEVELS[level].size,
    biome = LEVELS[level].biomeId,
    stage = LEVELS[level].stage,
    phase = ((seed % 997) / 997) * Math.PI * 2;
  const s: State = {
    version: 2,
    campaignVersion: 2,
    priorities: [...DEFAULT_PRIORITIES],
    doctrine: "builder",
    clearedTurf: {},
    turfRevision: 0,
    size,
    level,
    seed,
    rng: seed >>> 0,
    time: 0,
    battleStarted: false,
    nextId: 1,
    tiles: [],
    units: [],
    houses: [],
    caves: [],
    monsters: [],
    kingdoms: [],
    events: [],
    structures: [],
    bridgeSites: [],
    ruins: [],
    result: "playing",
    stats: { cleared: 0, bridges: 0, dams: 0, merged: 0 },
  };
  // Seeded asymmetric terrain, variable starts, and distinct scenario layouts.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ax = x,
        ay = y,
        edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      let hashBits =
        (Math.imul(ax + 37, 73856093) ^ Math.imul(ay + seed, 19349663)) >>> 0;
      hashBits = Math.imul(hashBits ^ (hashBits >>> 16), 0x45d9f3b);
      hashBits = Math.imul(hashBits ^ (hashBits >>> 16), 0x45d9f3b);
      const hash = ((hashBits ^ (hashBits >>> 16)) >>> 0) / 4294967296;
      const forest =
        (Math.sin(ax * 0.31 + phase) +
          Math.cos(ay * 0.26 + phase * 0.7) +
          Math.sin((ax + ay) * 0.22)) /
        3;
      const density =
        [0.29, 0.16, 0.23, 0.4, 0.28][biome] +
        forest * [0.24, 0.1, 0.2, 0.16, 0.24][biome];
      const riverX = Math.floor(size * 0.45 + Math.sin(y * 0.14 + phase) * 3),
        riverY = Math.floor(size * 0.54 + Math.sin(x * 0.13 - phase) * 3);
      const width = biome === 0 && stage < 3 ? 0 : 1 + Math.floor(biome / 3);
      let river =
        Math.abs(x - riverX) <= width || Math.abs(y - riverY) <= width;
      if (stage === 1) river = Math.abs(x - riverX) <= width;
      if (stage === 2)
        river =
          Math.abs(x - Math.floor(size * 0.34 + Math.sin(y * 0.12 + phase))) <=
            1 ||
          Math.abs(x - Math.floor(size * 0.66 + Math.sin(y * 0.1 - phase))) <=
            1 ||
          Math.abs(y - riverY) <= 1;
      if (stage === 3) river = Math.abs(x - riverX) <= width;
      if (stage === 4)
        river =
          (x - size * 0.38) ** 2 + (y - size * 0.44) ** 2 < 16 ||
          (x - size * 0.7) ** 2 + (y - size * 0.61) ** 2 < 25;
      if (biome === 3 && stage !== 4)
        river = river || (x - size * 0.29) ** 2 + (y - size * 0.63) ** 2 < 20;
      // The introductory valley gives the northwest kingdom a larger basin.
      // Its rivers still meander and stay one cell wide.
      if (level === 0)
        river =
          x === tutorialRiverX(size, y, phase) ||
          y === tutorialRiverY(size, x, phase);
      const ridge =
        Math.sin(ax * 0.23 - ay * 0.14 + phase) +
        Math.cos(ay * 0.2 + phase * 0.5);
      const mountains =
        (edge < 4 && hash < 0.6) ||
        (ridge > (stage === 1 ? 0.9 : 1.25) && hash < 0.4);
      s.tiles.push({
        terrain: river
          ? "water"
          : mountains
            ? "rock"
            : hash < density
              ? "tree"
              : hash < density + 0.055 + level * 0.001
                ? "rock"
                : "grass",
        variant: Math.floor(hash * 8),
      });
    }
  const m = Math.round(size * 0.2);
  const bases = [
    { x: m, y: m },
    { x: size - 1 - m, y: m },
    { x: size - 1 - m, y: size - 1 - m },
    { x: m, y: size - 1 - m },
  ];
  if (level === 0) {
    for (let y = 4; y < size - 4; y++)
      for (let x = 4; x < size - 4; x++)
        if (
          x < tutorialRiverX(size, y, phase) &&
          y < tutorialRiverY(size, x, phase) &&
          tile(s, x, y)!.terrain === "rock"
        )
          tile(s, x, y)!.terrain = "tree";
  }
  for (let team = 0; team < 4; team++) {
    const jitter = () =>
      level === 0 && team === 0 ? 0 : Math.floor(random(s) * 7) - 3;
    const c = {
      x: Math.max(10, Math.min(size - 11, bases[team].x + jitter())),
      y: Math.max(10, Math.min(size - 11, bases[team].y + jitter())),
    };
    s.kingdoms.push({
      id: team,
      gold: 5000,
      tax: 12,
      automatic: true,
      bridgeSaving: false,
      alive: true,
      hp: 100,
      fortification: 2000,
      castle: c,
      births: 0,
      kills: 0,
    });
    const radius =
      level === 0 ? (team === 0 ? 9 : 6) : 5 + Math.floor(random(s) * 3);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius) {
          const t = tile(s, c.x + dx, c.y + dy)!;
          if (level !== 0 || t.terrain !== "water") t.terrain = "grass";
        }
    if (level >= 2 && (team === seed % 4 || random(s) < 0.3)) {
      const side = random(s) < 0.5 ? -1 : 1;
      for (let n = -6; n <= 6; n++)
        if (Math.abs(n) > 1) {
          const t = tile(s, c.x + side * 6, c.y + n);
          if (t) t.terrain = "rock";
        }
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        tile(s, c.x + dx, c.y + dy)!.castle = team;
    const allOffsets = [
      [-4, -3],
      [3, -4],
      [-3, 4],
      [4, 3],
      [0, 5],
      [0, -5],
    ];
    const houseOffsets =
      level === 0 && team !== 0
        ? [
            [-4, -3],
            [4, 3],
          ]
        : allOffsets.slice(
            0,
            team === 0 ? (level === 0 ? 5 : 4) : LEVELS[level].enemyHouses,
          );
    for (const [dx, dy] of houseOffsets)
      addHouse(s, team, c.x + dx, c.y + dy, false);
    s.units.push({
      id: s.nextId++,
      team,
      ...c,
      hp: 100,
      reserve: 100,
      royal: true,
      age: 0,
      wait: 0,
      order: "auto",
      heading: { x: 0, y: 1 },
    });
  }
  if (level === 0) connectTutorialOpponents(s, phase);
  seedCaves(s);

  return s;
}
function tutorialRiverX(size: number, y: number, phase: number) {
  return Math.floor(size * 0.58 + Math.sin(y * 0.11 + phase) * 1.5);
}
function tutorialRiverY(size: number, x: number, phase: number) {
  return Math.floor(size * 0.58 + Math.sin(x * 0.1 - phase) * 1.5);
}
function connectTutorialOpponents(s: State, phase: number) {
  const blue = s.kingdoms[1].castle,
    yellow = s.kingdoms[2].castle,
    red = s.kingdoms[3].castle;
  const rightX = Math.round((blue.x + yellow.x) / 2),
    bottomY = Math.round((yellow.y + red.y) / 2);
  const right = { x: rightX, y: tutorialRiverY(s.size, rightX, phase) },
    bottom = { x: tutorialRiverX(s.size, bottomY, phase), y: bottomY };
  const path = (from: Point, to: Point, horizontalFirst: boolean) => {
    let { x, y } = from;
    const clear = () => {
      const t = tile(s, x, y)!;
      if (t.terrain !== "water") t.terrain = "grass";
    };
    const across = () => {
      while (x !== to.x) {
        x += Math.sign(to.x - x);
        clear();
      }
    };
    const along = () => {
      while (y !== to.y) {
        y += Math.sign(to.y - y);
        clear();
      }
    };
    if (horizontalFirst) {
      across();
      along();
    } else {
      along();
      across();
    }
  };
  path(blue, { x: right.x, y: right.y - 1 }, true);
  path(yellow, { x: right.x, y: right.y + 1 }, true);
  path(red, { x: bottom.x - 1, y: bottom.y }, false);
  path(yellow, { x: bottom.x + 1, y: bottom.y }, false);
  for (const [p, team] of [
    [right, 1],
    [bottom, 3],
  ] as const) {
    const t = tile(s, p.x, p.y)!;
    t.terrain = "bridge";
    t.owner = team;
    s.structures.push({
      id: s.nextId++,
      kind: "bridge",
      team,
      hp: 1000,
      maxHp: 1000,
      cells: [{ ...p }],
    });
    s.bridgeSites.push([{ ...p }]);
    s.stats.bridges++;
  }
}
export function territoryAt(s: State, p: Point) {
  if (tile(s, p.x, p.y)?.terrain !== "grass") return;
  let best: House | undefined,
    bestDistance = 99,
    bestGrowth = 0;
  const index = spatialIndex(s);
  const nearby: House[] = [];
  if (index)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!inside(s, p.x + dx, p.y + dy)) continue;
        const h = index.houseCells.get(idx(s, p.x + dx, p.y + dy));
        if (h) nearby.push(h);
      }
  for (const h of index ? nearby : s.houses) {
    const dx = p.x - h.x,
      dy = p.y - h.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
    const growth = Math.max(0, Math.min(1, (s.time - h.founded - 3) / 5)),
      d = dx * dx + dy * dy;
    if (
      growth &&
      (d < bestDistance || (d === bestDistance && growth > bestGrowth))
    ) {
      best = h;
      bestDistance = d;
      bestGrowth = growth;
    }
  }
  if (best && s.clearedTurf[idx(s, p.x, p.y)] !== best.id)
    return { team: best.team, house: best.id, growth: bestGrowth };
}
export function destroyTurf(s: State, p: Point, team: number, hp = 0) {
  const turf = territoryAt(s, p);
  if (!turf || areAllied(s, turf.team, team)) return 0;
  s.clearedTurf[idx(s, p.x, p.y)] = turf.house;
  s.turfRevision++;
  return 2 + hp * 0.002;
}
export function houseDestructionCost(hp: number) {
  return 200 + hp * 0.05;
}
/** A weak attacker can damage a house, but cannot erase more resistance than its HP pays for. */
export function assaultHouse(s: State, house: House, attacker: Unit) {
  if (
    attacker.hp <= 0 ||
    areAllied(s, attacker.team, house.team) ||
    !s.houses.includes(house)
  )
    return false;
  const remaining = Math.max(0, 200 - (house.damage ?? 0));
  const effort = Math.min(remaining, attacker.hp * 0.95);
  const spent = effort + attacker.hp * 0.05;
  house.damage = (house.damage ?? 0) + effort;
  injure(attacker, spent);
  if (attacker.hp < 1e-8) attacker.hp = 0;
  if (house.damage >= 200 - 1e-8) {
    razeHouse(s, house);
    return true;
  }
  return false;
}
export function razeHouse(s: State, house: House) {
  s.houses = s.houses.filter((h) => h.id !== house.id);
  delete tile(s, house.x, house.y)!.house;
  invalidateWorld(s);
  if (!s.houses.some((h) => h.team === house.team))
    destroyKingdom(s, house.team, house.team);
  else refreshKings(s);
}
export function canHouse(s: State, x: number, y: number) {
  const index = spatialIndex(s);
  if (index) return inside(s, x, y) && !!index.plots[idx(s, x, y)];
  const t = tile(s, x, y);
  if (
    !t ||
    t.permanent ||
    t.terrain !== "grass" ||
    t.house !== undefined ||
    t.cave !== undefined ||
    t.castle !== undefined ||
    structureAt(s, { x, y }) !== undefined
  )
    return false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (tile(s, x + dx, y + dy)?.house !== undefined) return false;
  return true;
}
export function addHouse(
  s: State,
  team: number,
  x: number,
  y: number,
  pay = true,
) {
  const k = s.kingdoms[team];
  if (!k.alive || !canHouse(s, x, y) || (pay && k.gold < 150)) return false;
  if (pay) {
    k.gold -= 150;
  }
  const h = {
    id: s.nextId++,
    team,
    x,
    y,
    timer: pay ? 2 : random(s) * 6,
    interval: birthInterval(k.tax),
    founded: s.time,
  };
  s.houses.push(h);
  invalidateWorld(s);
  tile(s, x, y)!.house = h.id;
  return true;
}
export function spawn(s: State, h: House) {
  if (s.units.filter((u) => u.team === h.team).length >= 150) return;
  const candidates = [
    { x: h.x, y: h.y + 1 },
    { x: h.x + 1, y: h.y },
    { x: h.x, y: h.y - 1 },
    { x: h.x - 1, y: h.y },
  ].filter((p) => walkable(s, p.x, p.y, h.team));
  if (!candidates.length) return;
  const p = candidates[Math.floor(random(s) * candidates.length)];
  s.units.push({
    id: s.nextId++,
    team: h.team,
    ...p,
    hp: 100,
    age: 0,
    wait: random(s),
    order: "auto",
    heading: { x: 0, y: 0 },
  });
  s.kingdoms[h.team].births++;
  mergeStackedAllies(s);
}
export function walkable(s: State, x: number, y: number, team: number) {
  const t = tile(s, x, y);
  return (
    !!t &&
    !t.permanent &&
    t.terrain !== "water" &&
    t.terrain !== "dam" &&
    (t.terrain !== "barricade" || t.owner !== team)
  );
}
export function sheltered(s: State, u: Unit) {
  return !!u.royal && tile(s, u.x, u.y)?.castle === u.team;
}
export function totalHP(s: State, team: number) {
  return s.units
    .filter((u) => u.team === team && u.hp > 0)
    .reduce((v, u) => v + u.hp, 0);
}
export function resting(s: State, u: Unit) {
  const h = houseById(s, tile(s, u.x, u.y)?.house);
  return !!h && areAllied(s, h.team, u.team);
}
export function lifeDrain(s: State, u: Unit) {
  if (resting(s, u) || (u.royal && sheltered(s, u))) return 0;
  if (u.royal) return Math.max(4, u.hp * 0.05);
  const king = s.units.find((v) => v.team === u.team && v.royal && v.hp > 0),
    d = distance(u, king ?? s.kingdoms[u.team].castle);
  return (
    0.12 * Math.min(5, 1 + Math.max(0, d - 10) / 12) +
    Math.max(0, u.hp - 300) * 0.004
  );
}
// These fields describe physical supply routes, not territory colour. Water,
// mountains and closed barricades cannot supply an army across a sealed border.
const supplyFields = new WeakMap<State, Map<number, Int16Array>>();
export function supplyDistance(s: State, u: Unit) {
  let fields = supplyFields.get(s);
  if (!fields) supplyFields.set(s, (fields = new Map()));
  let field = fields.get(u.team);
  if (!field) {
    field = new Int16Array(s.tiles.length).fill(-1);
    const queue: number[] = [];
    for (const h of s.houses) {
      if (!areAllied(s, h.team, u.team)) continue;
      const i = idx(s, h.x, h.y);
      field[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head],
        x = i % s.size,
        y = Math.floor(i / s.size);
      if (field[i] >= 24) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (!inside(s, nx, ny)) continue;
        const n = idx(s, nx, ny),
          t = s.tiles[n];
        if (
          field[n] >= 0 ||
          t.permanent ||
          ["water", "dam", "rock", "tree", "barricade"].includes(t.terrain) ||
          t.cave !== undefined ||
          (t.castle !== undefined && !areAllied(s, t.castle, u.team))
        )
          continue;
        field[n] = field[i] + 1;
        queue.push(n);
      }
    }
    fields.set(u.team, field);
  }
  const d = field[idx(s, u.x, u.y)];
  return d < 0 ? 24 : d;
}
export function armyHP(s: State, team: number) {
  return s.units.reduce(
    (n, u) => n + (u.team === team && !u.royal && u.hp > 0 ? u.hp : 0),
    0,
  );
}
export function armyCapacity(s: State, team: number) {
  return (
    (spatialIndex(s)?.counts[team] ??
      s.houses.filter((h) => h.team === team).length) * 200
  );
}
export function kingCapacity(s: State, team: number) {
  return (
    (spatialIndex(s)?.counts[team] ??
      s.houses.filter((h) => h.team === team).length) * 100
  );
}
export function supportDrain(s: State, u: Unit, people = armyHP(s, u.team)) {
  if (u.royal) return 0;
  const excess =
    people > 0 ? Math.max(0, 1 - armyCapacity(s, u.team) / people) : 0;
  const remote = resting(s, u)
    ? 0
    : Math.min(20, Math.max(0, supplyDistance(s, u) - 4)) * 0.003;
  // Excess is calculated on the entire army: splitting a stack never creates
  // extra capacity. Houses stop normal ageing, but cannot support infinite PV.
  return u.hp * (excess * 0.04 + remote);
}
function injure(u: Unit, amount: number) {
  u.hp -= amount;
  if (u.royal) u.wounds = (u.wounds ?? 0) + amount;
}
export function refreshKings(s: State) {
  for (const k of s.kingdoms) {
    if (!k.alive) continue;
    const capacity = kingCapacity(s, k.id);
    if (!capacity) {
      destroyKingdom(s, k.id, k.id);
      continue;
    }
    const king = s.units.find((u) => u.team === k.id && u.royal);
    if (!king) {
      destroyKingdom(s, k.id, k.id);
      continue;
    }
    const people = s.units
      .filter((u) => u.team === k.id && !u.royal && u.hp > 0)
      .reduce((n, u) => n + u.hp, 0);
    const initialHomes =
      s.level === 0
        ? k.id === 0
          ? 5
          : 2
        : k.id === 0
          ? 4
          : LEVELS[s.level].enemyHouses;
    const settlementStrength = Math.max(0, capacity / 100 - initialHomes) * 50;
    king.hp =
      Math.min(
        capacity,
        (king.reserve ?? 100) + people * 0.25 + settlementStrength,
      ) - (king.wounds ?? 0);
    k.hp = Math.max(0, king.hp);
    if (king.hp <= 0) destroyKingdom(s, k.id, k.id);
  }
}
export function combatPower(s: State, u: Unit) {
  return sheltered(s, u) ? u.hp * 8 + s.kingdoms[u.team].fortification : u.hp;
}
function hasDestinationOrder(u: Unit) {
  return (
    isContinuousOrder(u.order) ||
    (!!u.target &&
      [
        "move",
        "attack",
        "merge",
        "shelter",
        "raid",
        "defend",
        "house",
        "bridge",
        "dam",
        "barricade",
      ].includes(u.order))
  );
}
function finishEncounter(s: State, a: Unit, b: Unit, winner: Unit | null) {
  for (const fallen of [a, b]) {
    if (!fallen.royal || fallen.hp > 0) continue;
    const captor =
      winner &&
      winner.hp > 0 &&
      winner.team !== fallen.team &&
      s.kingdoms[winner.team]?.alive
        ? winner.team
        : undefined;
    destroyKingdom(s, fallen.team, captor ?? fallen.team, captor !== undefined);
  }
  return winner;
}
export function resolveEncounter(s: State, a: Unit, b: Unit) {
  if (a.team !== b.team && areAllied(s, a.team, b.team)) return a;
  if (a.team === b.team) {
    const win = b.royal || (!a.royal && b.order === "hold") ? b : a,
      lose = win === a ? b : a;
    if (win.royal) win.reserve = (win.reserve ?? 100) + lose.hp * 1.25;
    // A moving troop keeps its mission when it joins an idle ally. An automatic
    // passer-by adopts the stationed troop's mission instead. Kings keep theirs.
    const mission = hasDestinationOrder(a)
      ? a
      : hasDestinationOrder(b)
        ? b
        : undefined;
    if (mission && !win.royal && mission !== win) {
      win.order = mission.order;
      win.target = mission.target && { ...mission.target };
      win.formation = mission.formation;
      win.pursue = mission.pursue;
      win.pursueTeam = mission.pursueTeam;
      win.occupying = mission.occupying;
      win.mergeGroup = mission.mergeGroup;
      delete win.defending;
    }
    win.hp += lose.hp;
    lose.hp = 0;
    if (
      win.order === "merge" &&
      (win.pursue === lose.id || win.pursue === win.id)
    ) {
      delete win.pursue;
      delete win.pursueTeam;
    }
    if (win.royal) refreshKings(s);
    s.stats.merged++;
    return win;
  }
  const ap = a.hp,
    bp = combatPower(s, b),
    protectedKing = sheltered(s, b),
    fort = protectedKing ? s.kingdoms[b.team] : undefined;
  if (ap === bp) {
    injure(a, a.hp);
    injure(b, b.hp);
    if (fort) fort.fortification = 0;
    return finishEncounter(s, a, b, null);
  }
  if (ap > bp) {
    injure(a, Math.min(a.hp - 1, bp * 0.7));
    injure(b, b.hp);
    if (fort) fort.fortification = 0;
    if (s.kingdoms[a.team]) s.kingdoms[a.team].kills++;
    return finishEncounter(s, a, b, a);
  }
  let damage = ap * 0.7;
  if (fort) {
    const absorbed = Math.min(fort.fortification, damage);
    fort.fortification -= absorbed;
    damage = (damage - absorbed) / 8;
  }
  injure(b, Math.min(b.hp - 1, damage));
  injure(a, a.hp);
  if (s.kingdoms[b.team]) s.kingdoms[b.team].kills++;
  return finishEncounter(s, a, b, b);
}
export function unitUpkeep(u: Unit) {
  return !u.royal && u.hp > 0 ? u.hp * 0.002 : 0;
}
export function suppliedUpkeep(s: State, u: Unit) {
  if (u.hp <= 500 && resting(s, u)) return 0;
  const base = unitUpkeep(u);
  return base
    ? base * (1 + Math.min(2, Math.max(0, supplyDistance(s, u) - 4) / 8))
    : 0;
}
export function maintenanceCost(s: State, team: number) {
  return s.units
    .filter((u) => u.team === team && u.hp > 0)
    .reduce((n, u) => n + suppliedUpkeep(s, u), 0);
}
export function goldIncome(s: State, team: number) {
  const k = s.kingdoms[team];
  if (!k.alive || k.tax === 0) return 0;
  return (
    s.houses.filter((h) => h.team === team).length * k.tax * 0.07 +
    s.tiles.filter((t) => t.terrain === "dam" && t.owner === team).length * 0.2
  );
}
const flowCaches = new WeakMap<
  State,
  {
    normal: { key: string; fields: Map<string, Int32Array> };
    peaceful: { key: string; fields: Map<string, Int32Array> };
  }
>();
function formationStep(
  s: State,
  start: Point,
  goal: Point,
  team: number,
  peaceful: boolean,
  clearObstacles: boolean,
  civilian = false,
) {
  if (start.x === goal.x && start.y === goal.y) return;
  let caches = flowCaches.get(s);
  if (!caches) {
    caches = {
      normal: { key: "", fields: new Map() },
      peaceful: { key: "", fields: new Map() },
    };
    flowCaches.set(s, caches);
  }
  const cache = peaceful ? caches.peaceful : caches.normal;
  const key = `${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}${peaceful ? `-${s.stats.cleared}-${s.turfRevision}-${Math.floor(s.time * 2)}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}` : ""}`;
  if (cache.key !== key) {
    cache.key = key;
    cache.fields.clear();
  }
  const target = idx(s, goal.x, goal.y),
    fieldKey = `${target}-${team}-${clearObstacles}-${civilian}`;
  let field = cache.fields.get(fieldKey);
  const pass = (x: number, y: number) =>
    inside(s, x, y) &&
    (clearObstacles || !["tree", "rock"].includes(tile(s, x, y)!.terrain)) &&
    (!civilian ||
      (!["rock", "barricade"].includes(tile(s, x, y)!.terrain) &&
        tile(s, x, y)!.cave === undefined &&
        (tile(s, x, y)!.castle === undefined ||
          areAllied(s, tile(s, x, y)!.castle, team)))) &&
    ((walkable(s, x, y, team) && tile(s, x, y)?.terrain !== "barricade") ||
      (x === goal.x &&
        y === goal.y &&
        tile(s, x, y)?.terrain === "barricade")) &&
    (!peaceful || peacefulTile(s, x, y, team));
  if (!field) {
    field = new Int32Array(s.tiles.length).fill(-1);
    if (!pass(goal.x, goal.y)) return;
    const queue = new Int32Array(s.tiles.length);
    let head = 0,
      tail = 0;
    queue[tail++] = target;
    field[target] = 0;
    while (head < tail) {
      const n = queue[head++],
        x = n % s.size,
        y = Math.floor(n / s.size);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (!pass(nx, ny)) continue;
        const ni = idx(s, nx, ny);
        if (field[ni] >= 0) continue;
        field[ni] = field[n] + 1;
        queue[tail++] = ni;
      }
    }
    if (cache.fields.size >= 128)
      cache.fields.delete(cache.fields.keys().next().value!);
    cache.fields.set(fieldKey, field);
  }
  const current = field[idx(s, start.x, start.y)];
  if (current <= 0) return;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const x = start.x + dx,
      y = start.y + dy;
    if (pass(x, y) && field[idx(s, x, y)] === current - 1) return { x, y };
  }
}
// Shortest path on the hidden four-neighbour lattice. Clearing obstacles is allowed; water is not.
export function nextStep(
  s: State,
  start: Point,
  goal: Point,
  team: number,
  peaceful = false,
  civilian = false,
): Point | undefined {
  if (
    !isContinuousOrder((start as Unit).order) &&
    (start as Unit).order !== "raid" &&
    (!!(start as Unit).formation || distance(start, goal) > 6)
  )
    return (
      formationStep(s, start, goal, team, peaceful, false, civilian) ??
      formationStep(s, start, goal, team, peaceful, true, civilian)
    );
  return (
    findStep(s, start, goal, team, peaceful, false, civilian) ??
    findStep(s, start, goal, team, peaceful, true, civilian)
  );
}
const searchBuffers = new WeakMap<
  State,
  { prev: Int32Array; queue: Int32Array; seen: Uint32Array; stamp: number }
>();
function findStep(
  s: State,
  start: Point,
  goal: Point,
  team: number,
  peaceful: boolean,
  clearObstacles: boolean,
  civilian: boolean,
): Point | undefined {
  const raidBlocked =
    (start as Unit).order === "raid"
      ? raidBlockers(s, start as Unit)
      : undefined;
  const total = s.size * s.size;
  let buffers = searchBuffers.get(s);
  if (!buffers || buffers.prev.length !== total) {
    buffers = {
      prev: new Int32Array(total),
      queue: new Int32Array(total),
      seen: new Uint32Array(total),
      stamp: 0,
    };
    searchBuffers.set(s, buffers);
  }
  buffers.stamp = (buffers.stamp + 1) >>> 0;
  if (!buffers.stamp) {
    buffers.seen.fill(0);
    buffers.stamp = 1;
  }
  const { prev, queue, seen, stamp } = buffers;
  let head = 0,
    tail = 0;
  const st = idx(s, start.x, start.y),
    end = idx(s, goal.x, goal.y);
  if (st === end) return undefined;
  queue[tail++] = st;
  prev[st] = st;
  seen[st] = stamp;
  while (head < tail) {
    const p = queue[head++],
      x = p % s.size,
      y = Math.floor(p / s.size);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (
        !walkable(s, nx, ny, team) &&
        !(
          nx === goal.x &&
          ny === goal.y &&
          tile(s, nx, ny)?.terrain === "barricade"
        )
      )
        continue;
      if (
        isContinuousOrder((start as Unit).order) &&
        ["tree", "rock", "barricade"].includes(tile(s, nx, ny)!.terrain) &&
        (nx !== goal.x || ny !== goal.y)
      )
        continue;
      if (
        isContinuousOrder((start as Unit).order) &&
        (tile(s, nx, ny)!.cave !== undefined ||
          (tile(s, nx, ny)!.castle !== undefined &&
            !areAllied(s, tile(s, nx, ny)!.castle, team)))
      )
        continue;
      if (
        !clearObstacles &&
        ["tree", "rock"].includes(tile(s, nx, ny)!.terrain)
      )
        continue;
      if (
        civilian &&
        (["rock", "barricade"].includes(tile(s, nx, ny)!.terrain) ||
          tile(s, nx, ny)!.cave !== undefined ||
          (tile(s, nx, ny)!.castle !== undefined &&
            !areAllied(s, tile(s, nx, ny)!.castle, team)))
      )
        continue;
      if (
        raidBlocked &&
        (raidBlocked.has(idx(s, nx, ny)) ||
          (tile(s, nx, ny)?.terrain === "tree" && s.kingdoms[team].gold < 30))
      )
        continue;
      if (peaceful && !peacefulTile(s, nx, ny, team)) continue;
      if (
        tile(s, nx, ny)?.terrain === "barricade" &&
        (nx !== goal.x || ny !== goal.y)
      )
        continue;
      const ni = idx(s, nx, ny);
      if (seen[ni] === stamp) continue;
      seen[ni] = stamp;
      prev[ni] = p;
      if (ni === end) {
        let cur = ni;
        while (prev[cur] !== st) cur = prev[cur];
        return { x: cur % s.size, y: Math.floor(cur / s.size) };
      }
      queue[tail++] = ni;
    }
  }
  return undefined;
}
export function crossing(
  s: State,
  p: Point,
): { cells: Point[]; banks: Point[] } | undefined {
  if (tile(s, p.x, p.y)?.terrain !== "water" || tile(s, p.x, p.y)?.permanent)
    return;
  const banks = [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter((b) => {
    const t = tile(s, b.x, b.y);
    return (
      !!t && !t.permanent && !["water", "dam", "barricade"].includes(t.terrain)
    );
  });
  return banks.length ? { cells: [{ ...p }], banks } : undefined;
}
export function structureAt(s: State, p: Point) {
  const index = spatialIndex(s);
  if (index) return index.structures.get(idx(s, p.x, p.y));
  return s.structures.find((b) =>
    b.cells.some((c) => c.x === p.x && c.y === p.y),
  );
}
export function bridgeCost(s: State, p: Point) {
  return s.bridgeSites.some((site) =>
    site.some((c) => c.x === p.x && c.y === p.y),
  )
    ? 500
    : 1000;
}
export function canBarricade(s: State, p: Point) {
  const t = tile(s, p.x, p.y);
  return (
    !!t &&
    !t.permanent &&
    t.terrain === "grass" &&
    t.house === undefined &&
    t.cave === undefined &&
    t.castle === undefined &&
    !structureAt(s, p) &&
    !s.units.some((u) => u.hp > 0 && u.x === p.x && u.y === p.y)
  );
}
function finishConstructionOrders(
  s: State,
  team: number,
  p: Point,
  kind: "bridge" | "barricade",
) {
  for (const worker of s.units)
    if (
      worker.team === team &&
      worker.order === kind &&
      worker.target?.x === p.x &&
      worker.target?.y === p.y
    )
      finishTravel(worker);
}
export function fundConstruction(
  s: State,
  u: Unit,
  p: Point,
  kind: "bridge" | "barricade",
) {
  if (u.royal || u.hp <= 0 || distance(u, p) !== 1) return false;
  const k = s.kingdoms[u.team];
  if (!k.alive) return false;
  let b = structureAt(s, p);
  if (b && (b.team !== u.team || b.kind !== kind || !b.construction))
    return false;
  if (!b && !(kind === "bridge" ? crossing(s, p) : canBarricade(s, p)))
    return false;
  if (
    kind === "barricade" &&
    s.units.some((v) => v.hp > 0 && v.x === p.x && v.y === p.y)
  )
    return true;
  if (kind === "bridge" && !crossing(s, p)) return false;
  // Zero gold keeps the worker waiting. A saved structure is created as soon
  // as the first funds are actually invested, without tying it to that worker.
  if (!b && k.gold <= 0) return true;
  if (!b) {
    b = {
      id: s.nextId++,
      kind,
      team: u.team,
      hp: 0,
      maxHp: kind === "bridge" ? 1000 : 1500,
      cells: [{ ...p }],
      construction: {
        paid: 0,
        total: kind === "bridge" ? bridgeCost(s, p) : 750,
      },
    };
    s.structures.push(b);
    invalidateWorld(s);
  }
  const progress = b.construction!;
  const amount = Math.min(k.gold, progress.total - progress.paid);
  k.gold -= amount;
  progress.paid += amount;
  b.hp = Math.min(
    b.maxHp,
    Math.max(1, b.hp + (b.maxHp * amount) / progress.total),
  );
  injure(u, ((kind === "bridge" ? 8 : 5) * amount) / progress.total);
  if (progress.paid < progress.total - 1e-8) return true;
  delete b.construction;
  const t = tile(s, p.x, p.y)!;
  t.terrain = kind;
  t.owner = u.team;
  invalidateWorld(s);
  if (kind === "bridge") {
    s.stats.bridges++;
    if (
      !s.bridgeSites.some((site) =>
        site.some((v) => v.x === p.x && v.y === p.y),
      )
    )
      s.bridgeSites.push([{ ...p }]);
  }
  k.bridgeSaving = false;
  finishConstructionOrders(s, u.team, p, kind);
  finishTravel(u);

  return true;
}
export function buildBarricade(s: State, u: Unit, p: Point) {
  const k = s.kingdoms[u.team];
  if (u.royal || distance(u, p) !== 1 || !canBarricade(s, p) || k.gold < 750)
    return false;
  k.gold -= 750;
  k.bridgeSaving = false;
  const t = tile(s, p.x, p.y)!;
  t.terrain = "barricade";
  invalidateWorld(s);
  t.owner = u.team;
  s.structures.push({
    id: s.nextId++,
    kind: "barricade",
    team: u.team,
    hp: 1500,
    maxHp: 1500,
    cells: [{ ...p }],
  });
  finishConstructionOrders(s, u.team, p, "barricade");
  u.order = "auto";
  delete u.target;
  u.hp -= 5;

  return true;
}
export function destroyStructure(s: State, b: Structure) {
  if (!s.structures.includes(b)) return;
  s.structures = s.structures.filter((v) => v.id !== b.id);
  invalidateWorld(s);
  for (const p of b.cells) {
    const t = tile(s, p.x, p.y)!;
    t.terrain = b.kind === "bridge" ? "water" : "grass";
    delete t.owner;
    if (b.kind === "bridge")
      for (const u of s.units)
        if (u.x === p.x && u.y === p.y && u.hp > 0) injure(u, u.hp);
  }
}
export function attackStructure(s: State, u: Unit, b: Structure) {
  if (b.team !== u.team && areAllied(s, b.team, u.team)) return false;
  const proxy: Unit = {
    id: -b.id,
    team: b.team === u.team ? 4 : b.team,
    hp: b.hp,
    x: b.cells[0].x,
    y: b.cells[0].y,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 0, y: 0 },
  };
  resolveEncounter(s, u, proxy);
  b.hp = proxy.hp;
  if (b.hp <= 0) destroyStructure(s, b);
  return true;
}
function autonomousDestination(s: State, u: Unit, p: Point) {
  if (!walkable(s, p.x, p.y, u.team)) return false;
  if (u.team !== 0) {
    const castle = tile(s, p.x, p.y)?.castle;
    const king =
      castle !== undefined &&
      !areAllied(s, castle, u.team) &&
      s.units.find((v) => v.royal && v.team === castle && v.hp > 0);
    return !king || u.hp > combatPower(s, king) * 1.25;
  }
  const t = tile(s, p.x, p.y)!;
  if (t.terrain === "rock" || t.terrain === "barricade" || t.cave !== undefined)
    return false;
  const turf = territoryAt(s, p);
  if (turf && !areAllied(s, turf.team, u.team)) return false;
  const building = structureAt(s, p);
  if (
    building?.kind === "barricade" &&
    !building.construction &&
    !areAllied(s, building.team, u.team)
  )
    return false;
  if (t.castle !== undefined && !areAllied(s, t.castle, u.team)) return false;
  if (
    t.house !== undefined &&
    !areAllied(s, houseById(s, t.house)?.team, u.team)
  )
    return false;
  if (s.monsters.some((m) => m.hp > 0 && m.x === p.x && m.y === p.y))
    return false;
  return !s.units.some(
    (v) =>
      v.hp > 0 && !areAllied(s, v.team, u.team) && v.x === p.x && v.y === p.y,
  );
}
export function buildCrossing(s: State, u: Unit, p: Point, dam = false) {
  const existing = structureAt(s, p);
  if (existing?.construction) return false;
  const conversion =
    dam &&
    existing?.kind === "bridge" &&
    existing.team === u.team &&
    !s.units.some((v) => v.hp > 0 && v.x === p.x && v.y === p.y);
  const cr = conversion
      ? {
          cells: [p],
          banks: [
            { x: p.x - 1, y: p.y },
            { x: p.x + 1, y: p.y },
            { x: p.x, y: p.y - 1 },
            { x: p.x, y: p.y + 1 },
          ].filter((b) => walkable(s, b.x, b.y, u.team)),
        }
      : crossing(s, p),
    k = s.kingdoms[u.team];
  if (
    !cr ||
    !cr.banks.some((b) => distance(u, b) === 0) ||
    k.gold < (dam ? 32 : bridgeCost(s, p))
  )
    return false;
  k.gold -= dam ? 32 : bridgeCost(s, p);
  invalidateWorld(s);
  if (conversion)
    s.structures = s.structures.filter((b) => b.id !== existing!.id);
  for (const c of cr.cells) {
    const t = tile(s, c.x, c.y)!;
    t.terrain = dam ? "dam" : "bridge";
    t.owner = u.team;
  }
  if (!dam) {
    s.structures.push({
      id: s.nextId++,
      kind: "bridge",
      team: u.team,
      hp: 1000,
      maxHp: 1000,
      cells: cr.cells.map((c) => ({ ...c })),
    });
    if (
      !s.bridgeSites.some((site) =>
        site.some((c) => cr.cells.some((p) => p.x === c.x && p.y === c.y)),
      )
    )
      s.bridgeSites.push(cr.cells.map((c) => ({ ...c })));
    k.bridgeSaving = false;
  }
  if (!dam) finishConstructionOrders(s, u.team, p, "bridge");
  s.stats[dam ? "dams" : "bridges"]++;
  u.hp -= 8;
  u.order = "auto";
  u.target = undefined;

  return true;
}
export function command(s: State, ids: number[], order: Order, target?: Point) {
  if (target && tile(s, target.x, target.y)?.permanent) return;
  const us = s.units.filter(
    (u) =>
      ids.includes(u.id) &&
      u.team === 0 &&
      u.hp > 0 &&
      (!u.royal ||
        (!isContinuousOrder(order) &&
          !["house", "bridge", "dam", "barricade"].includes(order))),
  );
  if (!us.length) return;
  const mergeGroup = order === "merge" ? s.nextId++ : undefined;
  const rally = target ?? { x: us[0].x, y: us[0].y };
  const entity =
    target && ["attack", "merge"].includes(order)
      ? (s.units.find(
          (u) =>
            u.hp > 0 &&
            u.x === target.x &&
            u.y === target.y &&
            !ids.includes(u.id) &&
            (order === "merge" ? u.team === 0 : !areAllied(s, u.team, 0)),
        ) ??
        (order === "attack"
          ? s.monsters.find(
              (m) => m.hp > 0 && m.x === target.x && m.y === target.y,
            )
          : undefined))
      : undefined;
  for (const u of us) {
    u.order = order;
    if (mergeGroup === undefined) delete u.mergeGroup;
    else u.mergeGroup = mergeGroup;
    u.wait = 0;
    u.occupying =
      !u.royal &&
      !!target &&
      ["move", "attack"].includes(order) &&
      (!!territoryAt(s, target)?.team ||
        s.houses.some(
          (h) => !areAllied(s, h.team, u.team) && distance(h, target) <= 10,
        ) ||
        s.kingdoms.some(
          (k) =>
            k.alive &&
            !areAllied(s, k.id, u.team) &&
            distance(k.castle, target) <= 10,
        ));
    u.formation =
      us.length >= 8 &&
      [
        "move",
        "attack",
        "merge",
        "shelter",
        "house",
        "bridge",
        "dam",
        "barricade",
      ].includes(order);
    delete u.defending;
    delete u.pursue;
    delete u.pursueTeam;
    if (entity) {
      u.pursue = entity.id;
      u.pursueTeam = "team" in entity ? entity.team : 4;
    }
    u.target =
      order === "auto" || order === "hold" || isContinuousOrder(order)
        ? undefined
        : rally;
  }
}
function destroyKingdom(
  s: State,
  team: number,
  attacker: number,
  captureHouses = false,
) {
  const k = s.kingdoms[team];
  if (!k.alive) return;
  k.alive = false;
  k.hp = 0;
  s.ruins.push({ team, ...k.castle, time: s.time });
  for (const t of s.tiles) if (t.castle === team) t.castle = undefined;
  const inherited = s.houses.filter((h) => h.team === team);
  invalidateWorld(s);
  if (captureHouses && attacker !== team && s.kingdoms[attacker]?.alive) {
    for (const h of inherited) h.team = attacker;
    s.turfRevision++;
  } else {
    for (const h of inherited) delete tile(s, h.x, h.y)!.house;
    s.houses = s.houses.filter((h) => h.team !== team);
  }
  s.units.forEach((u) => {
    if (u.team === team) u.hp = 0;
  });
}
function peacefulTile(s: State, x: number, y: number, team: number) {
  const t = tile(s, x, y);
  if (
    !t ||
    !walkable(s, x, y, team) ||
    t.terrain === "rock" ||
    t.terrain === "barricade" ||
    t.cave !== undefined
  )
    return false;
  const turf = territoryAt(s, { x, y });
  if (turf && !areAllied(s, turf.team, team)) return false;
  if (t.castle !== undefined && !areAllied(s, t.castle, team)) return false;
  if (t.house !== undefined && !areAllied(s, houseById(s, t.house)?.team, team))
    return false;
  return true;
}
const shelterPlans = new WeakMap<
  State,
  {
    key: string;
    regions: Int32Array;
    work: Map<number, { trees: boolean; land: boolean }>;
    homes: Map<number, House[]>;
  }
>();
function shelterPlan(s: State) {
  const key = `${s.turfRevision}-${Math.floor(s.time / 5)}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}-${s.ruins.length}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}`;
  const previous = shelterPlans.get(s);
  if (previous?.key === key) return previous;
  const regions = new Int32Array(s.tiles.length).fill(-1),
    work = new Map<number, { trees: boolean; land: boolean }>(),
    homes = new Map<number, House[]>();
  let region = 0;
  for (let i = 0; i < s.tiles.length; i++) {
    if (
      regions[i] !== -1 ||
      !peacefulTile(s, i % s.size, Math.floor(i / s.size), 0)
    )
      continue;
    const queue = [i];
    regions[i] = region;
    const w = { trees: false, land: false };
    const hs: House[] = [];
    for (let n = 0; n < queue.length; n++) {
      const index = queue[n],
        x = index % s.size,
        y = Math.floor(index / s.size),
        t = s.tiles[index];
      if (t.terrain === "tree") w.trees = true;
      else if (canHouse(s, x, y)) w.land = true;
      const house = t.house === undefined ? undefined : houseById(s, t.house);
      if (house?.team === 0) hs.push(house);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          ni = idx(s, nx, ny);
        if (
          inside(s, nx, ny) &&
          regions[ni] === -1 &&
          peacefulTile(s, nx, ny, 0)
        ) {
          regions[ni] = region;
          queue.push(ni);
        }
      }
    }
    work.set(region, w);
    homes.set(region, hs);
    region++;
  }
  const plan = { key, regions, work, homes };
  shelterPlans.set(s, plan);
  return plan;
}
function updateRest(s: State, u: Unit, noAvailableJob = false) {
  if (u.occupying && u.hp >= 42 && !noAvailableJob) return;
  if (u.team !== 0 || u.royal || !["auto", "rest"].includes(u.order)) return;
  const plan = shelterPlan(s),
    region = plan.regions[idx(s, u.x, u.y)],
    work = plan.work.get(region),
    k = s.kingdoms[0];
  const canWork =
    !noAvailableJob &&
    u.hp >= 42 &&
    !!work &&
    ((work.trees && k.gold >= 30) ||
      (work.land && k.gold >= 150 + (k.bridgeSaving ? 1000 : 0)));
  if (canWork) {
    if (u.order === "rest") {
      u.order = "auto";
      delete u.target;
    }
    return;
  }
  if (resting(s, u)) {
    u.order = "rest";
    u.target = { x: u.x, y: u.y };
    return;
  }
  if (
    u.order === "rest" &&
    u.target &&
    s.houses.some(
      (h) => h.team === 0 && h.x === u.target!.x && h.y === u.target!.y,
    )
  )
    return;
  const homes = plan.homes.get(region) ?? [];
  const chosen = homes
    .map((h) => ({
      h,
      score:
        distance(u, h) +
        s.units.filter(
          (v) =>
            v.team === 0 &&
            v.id !== u.id &&
            ((v.target?.x === h.x && v.target?.y === h.y) ||
              (v.x === h.x && v.y === h.y)),
        ).length *
          0.15,
    }))
    .sort((a, b) => a.score - b.score)[0]?.h;
  if (chosen) {
    u.order = "rest";
    u.target = { x: chosen.x, y: chosen.y };
  }
}
// The doctrine chooses the first feasible task within successive eight-cell
// neighbourhoods. A distant job does not prevent nearby development.
export function setPriorities(s: State, priorities: Priority[]) {
  if (!validPriorities(priorities)) return false;
  s.priorities = [...priorities];
  s.doctrine = "custom";
  for (const u of s.units) {
    if (u.team === 0 && !u.royal && ["auto", "rest"].includes(u.order)) {
      u.order = "auto";
      delete u.target;
      u.wait = 0;
    }
  }
  return true;
}
export function setDoctrine(s: State, doctrine: DoctrineId) {
  if (!validDoctrine(doctrine)) return false;
  const priorities = [...s.priorities];
  setPriorities(s, priorities);
  s.doctrine = doctrine;
  return true;
}
function guardPost(s: State, u: Unit) {
  const bridges = s.structures
    .filter((b) => b.kind === "bridge" && !b.construction)
    .flatMap((b) => b.cells);
  const enemies = s.kingdoms
    .filter((k) => !areAllied(s, k.id, 0) && k.alive)
    .map((k) => k.castle);
  const approaches = bridges.length ? bridges : enemies;
  return s.houses
    .filter((h) => h.team === 0)
    .map((h) => ({
      h,
      score:
        Math.min(...approaches.map((p) => distance(h, p))) +
        distance(u, h) * 0.15 +
        s.units.filter(
          (v) =>
            v.id !== u.id &&
            v.team === 0 &&
            v.hp >= 500 &&
            v.target?.x === h.x &&
            v.target?.y === h.y,
        ).length *
          4,
    }))
    .sort((a, b) => a.score - b.score)
    .find(({ h }) => distance(u, h) === 0 || nextStep(s, u, h, 0, true))?.h;
}
function savingForHouse(s: State, u: Unit) {
  if (
    u.team !== 0 ||
    !["auto", "rest"].includes(u.order) ||
    s.doctrine === "conqueror" ||
    (s.doctrine === "custom" &&
      s.priorities.indexOf("house") > s.priorities.indexOf("clear")) ||
    s.kingdoms[0].gold >= 150 + buildingReserve(s, 0)
  )
    return false;
  const plan = shelterPlan(s);
  return (
    canHouse(s, u.x, u.y) ||
    !!plan.work.get(plan.regions[idx(s, u.x, u.y)])?.land
  );
}
function playerExpansionTarget(s: State, u: Unit) {
  if (u.team !== 0 || u.royal || !["auto", "rest"].includes(u.order)) return;
  const profile = s.doctrine === "custom" ? undefined : DOCTRINES[s.doctrine];
  if (u.hp < (profile?.restBelow ?? 42)) {
    updateRest(s, u, true);
    return;
  }
  const k = s.kingdoms[0];
  if (s.doctrine === "guardian" && u.hp >= 500 && u.id % 3 !== 0) {
    const post = guardPost(s, u);
    if (post) {
      u.order = "rest";
      u.target = { x: post.x, y: post.y };
      return;
    }
  }
  const canFound = k.gold >= 150 + buildingReserve(s, 0);
  const canClear = k.gold >= 30 && !savingForHouse(s, u);
  const prioritisesBuilding =
    s.doctrine === "custom"
      ? s.priorities[0] === "house"
      : s.doctrine !== "conqueror";
  // A builder short of construction money waits nearby instead of treating a
  // distant enemy house as the only affordable job and exhausting itself there.
  if (
    (prioritisesBuilding && savingForHouse(s, u)) ||
    (profile &&
      s.doctrine !== "conqueror" &&
      !canFound &&
      !canClear &&
      u.hp < 1000)
  ) {
    updateRest(s, u, true);
    return;
  }
  const canRaid = s.priorities.includes("raid");
  const houseTeams = new Map(s.houses.map((h) => [h.id, h.team]));
  const reserved = new Set(
    s.units
      .filter(
        (v) =>
          v.hp > 0 &&
          v.team === 0 &&
          v.id !== u.id &&
          v.target &&
          ["auto", "house"].includes(v.order),
      )
      .map((v) => idx(s, v.target!.x, v.target!.y)),
  );
  const permitted = (p: Point) =>
    canRaid || u.occupying
      ? walkable(s, p.x, p.y, 0) &&
        !["rock", "barricade"].includes(tile(s, p.x, p.y)!.terrain) &&
        tile(s, p.x, p.y)!.cave === undefined &&
        (tile(s, p.x, p.y)!.castle === undefined ||
          areAllied(s, tile(s, p.x, p.y)!.castle, 0))
      : peacefulTile(s, p.x, p.y, 0) && autonomousDestination(s, u, p);
  const available = (p: Point) =>
    !reserved.has(idx(s, p.x, p.y)) && permitted(p);
  const task = (p: Point): Priority | undefined => {
    if (!available(p)) return;
    const house = tile(s, p.x, p.y)?.house;
    if (house !== undefined && !areAllied(s, houseTeams.get(house), 0))
      return "raid";
    if (canFound && canHouse(s, p.x, p.y)) return "house";
    if (canClear && tile(s, p.x, p.y)?.terrain === "tree") return "clear";
  };
  // Keep a real task until completion; reordering the doctrine explicitly cancels it.
  if (u.order === "auto" && u.target && task(u.target)) return;
  if (!canFound && !canClear && !canRaid) {
    updateRest(s, u, true);
    return;
  }
  const queue: Point[] = [{ x: u.x, y: u.y }];
  const seen = new Uint8Array(s.tiles.length);
  seen[idx(s, u.x, u.y)] = 1;
  const candidates = new Map<Priority, Point>();
  let head = 0,
    depth = 0;
  const choose = () => {
    let priority: Priority | undefined;
    if (profile) {
      const options = [...candidates.keys()].map((p) => ({
        p,
        weight:
          profile.weights[p] *
          (p === "house"
            ? u.hp >= 1000 && s.doctrine !== "builder"
              ? 0.15
              : 1.4
            : p === "raid"
              ? u.hp >= 1000 && s.doctrine !== "builder"
                ? 3
                : u.hp < 250
                  ? 0.3
                  : 1
              : 1),
      }));
      let roll = random(s) * options.reduce((sum, o) => sum + o.weight, 0);
      priority =
        options.find((o) => (roll -= o.weight) < 0)?.p ?? options.at(-1)?.p;
    } else priority = s.priorities.find((p) => candidates.has(p));
    if (!priority) return false;
    u.order = "auto";
    u.target = candidates.get(priority);
    return true;
  };
  while (head < queue.length) {
    const end = queue.length;
    for (let i = head; i < end; i++) {
      const p = queue[i],
        kind = task(p);
      if (kind && !candidates.has(kind)) candidates.set(kind, p);
    }
    if (s.doctrine === "custom" && candidates.has(s.priorities[0])) {
      choose();
      return;
    }
    if (depth % 8 === 7 && choose()) return;
    while (head < end) {
      const p = queue[head++];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = p.x + dx,
          y = p.y + dy;
        if (!inside(s, x, y)) continue;
        const n = idx(s, x, y);
        if (
          seen[n] ||
          !permitted({ x, y }) ||
          (!canClear && tile(s, x, y)?.terrain === "tree")
        )
          continue;
        seen[n] = 1;
        queue.push({ x, y });
      }
    }
    depth++;
  }
  if (!choose()) updateRest(s, u, true);
}
const landLinks = new WeakMap<
  State,
  { key: string; links: Map<number, boolean> }
>();
function landConnected(s: State, team: number) {
  const key = `${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => `${b.id}${b.construction ? "p" : "b"}`).join(".")}-${s.ruins.length}`;
  let cache = landLinks.get(s);
  if (cache?.key !== key) {
    cache = { key, links: new Map() };
    landLinks.set(s, cache);
  }
  if (cache.links.has(team)) return cache.links.get(team)!;
  const start = s.kingdoms[team].castle,
    seen = new Uint8Array(s.tiles.length),
    q = [idx(s, start.x, start.y)];
  seen[q[0]] = 1;
  let connected = false;
  for (let i = 0; i < q.length && !connected; i++) {
    const index = q[i],
      x = index % s.size,
      y = Math.floor(index / s.size),
      t = s.tiles[index];
    if (
      t.castle !== undefined &&
      !areAllied(s, t.castle, team) &&
      s.kingdoms[t.castle].alive
    ) {
      connected = true;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (!inside(s, nx, ny)) continue;
      const ni = idx(s, nx, ny),
        nt = s.tiles[ni];
      if (
        seen[ni] ||
        !walkable(s, nx, ny, team) ||
        nt.terrain === "barricade" ||
        nt.cave !== undefined
      )
        continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  cache.links.set(team, connected);
  return connected;
}
function buildingReserve(s: State, team: number) {
  if (team === 0)
    return Math.max(
      s.kingdoms[0].bridgeSaving ? 1000 : 0,
      s.doctrine === "custom" ? 0 : DOCTRINES[s.doctrine].reserve,
    );
  return s.time > 60 &&
    s.houses.filter((h) => h.team === team).length >= 6 &&
    !landConnected(s, team)
    ? 1000
    : 0;
}
const bridgeSearchTimes = new WeakMap<State, Map<number, number>>();
/** Choose a whole shore-to-shore crossing; every paid structure still occupies one cell. */
export function planAiCrossing(s: State, team: number): Point[] | undefined {
  const start = s.kingdoms[team].castle,
    seen = new Uint8Array(s.tiles.length),
    queue = [idx(s, start.x, start.y)];
  seen[queue[0]] = 1;
  const land = (x: number, y: number) => {
    const t = tile(s, x, y);
    return (
      !!t &&
      !t.permanent &&
      !["water", "dam", "barricade"].includes(t.terrain) &&
      t.cave === undefined
    );
  };
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head],
      x = i % s.size,
      y = Math.floor(i / s.size);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (inside(s, nx, ny) && !seen[idx(s, nx, ny)] && land(nx, ny)) {
        seen[idx(s, nx, ny)] = 1;
        queue.push(idx(s, nx, ny));
      }
    }
  }
  let best: Point[] | undefined,
    bestScore = Infinity;
  for (const i of queue) {
    const x = i % s.size,
      y = Math.floor(i / s.size);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const cells: Point[] = [];
      let nx = x + dx,
        ny = y + dy;
      while (
        cells.length < 8 &&
        tile(s, nx, ny)?.terrain === "water" &&
        !tile(s, nx, ny)?.permanent
      ) {
        cells.push({ x: nx, y: ny });
        nx += dx;
        ny += dy;
      }
      if (
        !cells.length ||
        !inside(s, nx, ny) ||
        !land(nx, ny) ||
        seen[idx(s, nx, ny)]
      )
        continue;
      const foe = Math.min(
        ...s.kingdoms
          .filter((k) => !areAllied(s, k.id, team) && k.alive)
          .map((k) => distance(k.castle, { x: nx, y: ny })),
      );
      const score = cells.length * 100 + distance(start, { x, y }) + foe * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = cells;
      }
    }
  }
  return best;
}
function updateAiCrossing(s: State, u: Unit) {
  if (
    u.team === 0 ||
    u.royal ||
    u.hp < 42 ||
    !["auto", "raid", "rest"].includes(u.order)
  )
    return;
  const k = s.kingdoms[u.team];
  if (k.crossingPlan?.every((p) => tile(s, p.x, p.y)?.terrain === "bridge"))
    delete k.crossingPlan;
  if (!k.crossingPlan) {
    if (
      s.time < 65 - Math.min(20, s.level) ||
      k.gold < 1000 ||
      landConnected(s, u.team)
    )
      return;
    let times = bridgeSearchTimes.get(s);
    if (!times) bridgeSearchTimes.set(s, (times = new Map()));
    if (s.time - (times.get(u.team) ?? -99) < 5) return;
    times.set(u.team, s.time);
    k.crossingPlan = planAiCrossing(s, u.team);
  }
  const target = k.crossingPlan?.find(
    (p) => tile(s, p.x, p.y)?.terrain !== "bridge",
  );
  if (!target) return;
  if (
    tile(s, target.x, target.y)?.permanent ||
    tile(s, target.x, target.y)?.terrain !== "water"
  ) {
    delete k.crossingPlan;
    return;
  }
  // One shared assignment prevents workers from opening parallel expensive projects.
  if (
    s.units.some((v) => v.team === u.team && v.hp > 0 && v.order === "bridge")
  )
    return;
  const banks = crossing(s, target)?.banks ?? [];
  const workers = s.units.filter(
    (v) =>
      v.team === u.team &&
      !v.royal &&
      v.hp >= 42 &&
      ["auto", "raid", "rest"].includes(v.order),
  );
  workers.sort(
    (a, b) =>
      Math.min(...banks.map((p) => distance(a, p))) -
        Math.min(...banks.map((p) => distance(b, p))) || a.id - b.id,
  );
  const worker = workers.find((v) =>
    banks.some((p) => distance(v, p) === 0 || !!nextStep(s, v, p, v.team)),
  );
  if (worker?.id !== u.id) return;
  u.order = "bridge";
  u.target = { ...target };
  delete u.pursue;
  delete u.defending;
}
function aiSettlementTarget(s: State, u: Unit) {
  if (u.team === 0 || u.royal || u.order !== "auto") return;
  if (u.target && !canHouse(s, u.target.x, u.target.y)) delete u.target;
  if (
    u.target ||
    u.age < 1.2 ||
    u.hp >= 1000 ||
    s.kingdoms[u.team].gold < 150 + buildingReserve(s, u.team) ||
    canHouse(s, u.x, u.y)
  )
    return;
  const homes = s.houses.filter((h) => h.team === u.team).length;
  if (homes >= 8 && u.id % 3 === 0) return;
  const q = [{ x: u.x, y: u.y }],
    seen = new Set<number>([idx(s, u.x, u.y)]);
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    if (
      canHouse(s, p.x, p.y) &&
      !s.units.some(
        (v) =>
          v.hp > 0 &&
          !areAllied(s, v.team, u.team) &&
          v.x === p.x &&
          v.y === p.y,
      ) &&
      !s.monsters.some((m) => m.hp > 0 && m.x === p.x && m.y === p.y)
    ) {
      u.target = p;
      return;
    }
    if (distance(u, p) >= 8) continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = p.x + dx,
        ny = p.y + dy;
      if (
        !inside(s, nx, ny) ||
        !walkable(s, nx, ny, u.team) ||
        tile(s, nx, ny)?.terrain === "barricade" ||
        tile(s, nx, ny)?.cave !== undefined
      )
        continue;
      const index = idx(s, nx, ny);
      if (seen.has(index)) continue;
      seen.add(index);
      q.push({ x: nx, y: ny });
    }
  }
}
function raidBlockers(s: State, u: Unit) {
  return new Set(
    [
      ...s.units.filter(
        (v) =>
          v.hp > 0 &&
          v.id !== u.id &&
          (v.team === u.team
            ? !!v.royal
            : !areAllied(s, v.team, u.team) && (v.royal || v.hp >= u.hp)),
      ),
      ...s.monsters.filter((m) => m.hp >= u.hp),
    ].map((v) => idx(s, v.x, v.y)),
  );
}
function aiRaidTarget(s: State, u: Unit) {
  if (u.team === 0 || u.royal || !["auto", "raid"].includes(u.order)) return;
  const homes = s.houses.filter((h) => h.team === u.team).length;
  if (
    u.hp < 42 ||
    (u.order !== "raid" && u.hp < 1000 && (homes < 8 || u.id % 3 !== 0))
  )
    return;
  const canFound = s.kingdoms[u.team].gold >= 150 + buildingReserve(s, u.team);
  const exposedKing = s.units.find((v) => {
    if (
      !v.royal ||
      areAllied(s, v.team, u.team) ||
      v.hp <= 0 ||
      distance(u, v) > 2 ||
      u.hp <= combatPower(s, v) * 1.5
    )
      return false;
    const first = nextStep(s, u, v, u.team);
    return (
      first &&
      distance(first, v) < distance(u, v) &&
      !["tree", "rock"].includes(tile(s, first.x, first.y)!.terrain) &&
      !s.units.some(
        (other) =>
          other.id !== v.id &&
          other.hp > 0 &&
          other.x === first.x &&
          other.y === first.y &&
          !areAllied(s, other.team, u.team) &&
          (other.royal || u.hp - other.hp * 0.7 <= combatPower(s, v) * 1.5),
      )
    );
  });
  if (exposedKing) {
    u.order = "attack";
    u.target = { x: exposedKing.x, y: exposedKing.y };
    u.pursue = exposedKing.id;
    u.pursueTeam = exposedKing.team;
    return;
  }
  const previous =
    u.target &&
    (s.houses.some(
      (h) =>
        h.x === u.target!.x &&
        h.y === u.target!.y &&
        !areAllied(s, h.team, u.team),
    ) ||
      (canFound && canHouse(s, u.target.x, u.target.y)));
  if (u.order === "raid" && (previous || u.pursue !== undefined)) return;
  delete u.target;
  delete u.pursue;
  delete u.pursueTeam;
  u.order = "auto";
  const blocked = raidBlockers(s, u);
  const enemyHomes = new Map(
    s.houses
      .filter((h) => !areAllied(s, h.team, u.team) && s.kingdoms[h.team].alive)
      .map((h) => [idx(s, h.x, h.y), h]),
  );
  const targets = new Map(
    s.units
      .filter(
        (v) =>
          v.hp > 0 && !v.royal && !areAllied(s, v.team, u.team) && v.hp < u.hp,
      )
      .map((v) => [idx(s, v.x, v.y), v]),
  );
  const reserved = new Set(
    s.units
      .filter(
        (v) =>
          v.id !== u.id && v.team === u.team && v.order === "raid" && v.target,
      )
      .map((v) => idx(s, v.target!.x, v.target!.y)),
  );
  const seen = new Uint8Array(s.tiles.length),
    queue: Point[] = [{ x: u.x, y: u.y }];
  seen[idx(s, u.x, u.y)] = 1;
  let shared: Point | undefined,
    prey: Unit | undefined,
    plot: Point | undefined,
    house: Point | undefined;
  const choose = (p: Point, enemy?: Unit) => {
    u.order = "raid";
    u.target = { x: p.x, y: p.y };
    if (enemy) {
      u.pursue = enemy.id;
      u.pursueTeam = enemy.team;
    }
  };
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head],
      i = idx(s, p.x, p.y);
    if (canFound && !reserved.has(i) && canHouse(s, p.x, p.y)) {
      plot ??= p;
      if (distance(u, p) === 0) {
        choose(p);
        return;
      }
    }
    if (enemyHomes.has(i)) {
      if (!reserved.has(i)) house ??= p;
      else shared ??= p;
    }
    // Finish surveying the local neighbourhood before marching farther away.
    if (distance(u, p) >= 8 && (plot || house)) {
      choose(plot ?? house!);
      return;
    }
    if (!canFound && house) {
      choose(house);
      return;
    }
    prey ??= targets.get(i);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy;
      if (!inside(s, x, y)) continue;
      const n = idx(s, x, y),
        t = tile(s, x, y)!;
      if (
        seen[n] ||
        blocked.has(n) ||
        !walkable(s, x, y, u.team) ||
        ["rock", "barricade"].includes(t.terrain) ||
        t.cave !== undefined ||
        (t.castle !== undefined && !areAllied(s, t.castle, u.team)) ||
        (t.terrain === "tree" && s.kingdoms[u.team].gold < 30)
      )
        continue;
      seen[n] = 1;
      queue.push({ x, y });
    }
  }
  if (plot || house || shared) choose((plot ?? house ?? shared)!);
  else if (prey) choose(prey, prey);
}
function updateDefence(s: State, u: Unit) {
  if (u.royal || !["auto", "rest", "defend", "raid"].includes(u.order)) return;
  const houses = s.houses.filter((h) => areAllied(s, h.team, u.team));
  const danger = spatialIndex(s)?.danger;
  const threats = [...s.units, ...s.monsters.map((m) => ({ ...m, team: 4 }))]
    .filter(
      (v) =>
        !areAllied(s, v.team, u.team) &&
        v.hp > 0 &&
        sameLand(s, u, v) &&
        !("royal" in v && v.royal && sheltered(s, v as Unit)) &&
        (distance(u, v) <= 10 ||
          (u.hp >= 1000 && distance(v, s.kingdoms[u.team].castle) <= 8)) &&
        u.hp > ("royal" in v && v.royal ? combatPower(s, v as Unit) : v.hp) &&
        (distance(v, s.kingdoms[u.team].castle) <= 8 ||
          (danger
            ? s.kingdoms.some(
                (k) =>
                  areAllied(s, k.id, u.team) && danger[k.id][idx(s, v.x, v.y)],
              )
            : houses.some((h) => distance(v, h) <= 5))),
    )
    .sort((a, b) => {
      const castle = s.kingdoms[u.team].castle;
      return (
        Number(distance(a, castle) > 8) - Number(distance(b, castle) > 8) ||
        distance(a, castle) * 0.5 +
          distance(u, a) * 0.5 -
          distance(b, castle) * 0.5 -
          distance(u, b) * 0.5
      );
    });
  const current = threats.find((v) => v.id === u.defending);
  const candidates =
    current && distance(current, s.kingdoms[u.team].castle) <= 8
      ? [current, ...threats.filter((v) => v.id !== current.id)]
      : threats;
  const covered = (enemy: Unit | (Monster & { team: number })) => {
    const power = "royal" in enemy ? combatPower(s, enemy as Unit) : enemy.hp;
    const needed = power * 1.25;
    let committed = 0;
    for (const ally of s.units) {
      if (
        ally.id === u.id ||
        !areAllied(s, ally.team, u.team) ||
        ally.hp <= power ||
        ally.royal ||
        distance(ally, enemy) > 10
      )
        continue;
      if (!(
        (ally.order === "defend" && ally.defending === enemy.id) ||
        (ally.order === "attack" && ally.pursue === enemy.id)
      ))
        continue;
      if (!sameLand(s, ally, enemy)) continue;
      committed += ally.hp;
      if (committed >= needed) return true;
    }
    return false;
  };
  const target = candidates.find(
    (v) =>
      distance(u, v) > 0 &&
      (distance(u, v) <= 1 || !covered(v)) &&
      nextStep(s, u, v, u.team),
  );
  if (target) {
    u.order = "defend";
    u.defending = target.id;
    u.target = { x: target.x, y: target.y };
  } else if (u.order === "defend") {
    u.order = "auto";
    delete u.target;
    delete u.defending;
  }
}
// Persistent manual work searches the whole reachable map in shortest-path order.
// An obstacle is an endpoint, never a passage to work on the other side of it.
function continuousJob(s: State, u: Unit, p: Point) {
  const t = tile(s, p.x, p.y);
  if (
    !t ||
    t.permanent ||
    t.cave !== undefined ||
    (t.castle !== undefined && !areAllied(s, t.castle, u.team))
  )
    return false;
  if (u.order === "build-many") {
    const house = t.house === undefined ? undefined : houseById(s, t.house);
    return (
      canHouse(s, p.x, p.y) || (!!house && !areAllied(s, house.team, u.team))
    );
  }
  if (u.order === "clear-many")
    return (
      (t.terrain === "tree" && s.kingdoms[u.team].gold >= 30) ||
      (t.terrain === "rock" && s.kingdoms[u.team].gold >= CLEARING_COSTS.rock)
    );
  const structure = structureAt(s, p);
  return (
    u.order === "demolish-many" &&
    structure?.kind === "barricade" &&
    (structure.team === u.team || !areAllied(s, structure.team, u.team))
  );
}
function nearestWork(s: State, u: Unit, shelter = false): Point | undefined {
  const houses = new Set(
    s.houses.filter((h) => h.team === u.team).map((h) => idx(s, h.x, h.y)),
  );
  const seen = new Uint8Array(s.tiles.length),
    queue = new Int32Array(s.tiles.length);
  let head = 0,
    tail = 1;
  queue[0] = idx(s, u.x, u.y);
  seen[queue[0]] = 1;
  while (head < tail) {
    const n = queue[head++],
      p = { x: n % s.size, y: Math.floor(n / s.size) },
      t = tile(s, p.x, p.y)!;
    if (shelter ? houses.has(n) : continuousJob(s, u, p)) return p;
    if (n !== queue[0] && ["tree", "rock", "barricade"].includes(t.terrain))
      continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy;
      if (!inside(s, x, y)) continue;
      const i = idx(s, x, y),
        v = tile(s, x, y)!;
      if (
        seen[i] ||
        v.cave !== undefined ||
        (v.castle !== undefined && !areAllied(s, v.castle, u.team))
      )
        continue;
      const job = !shelter && continuousJob(s, u, { x, y });
      if (!walkable(s, x, y, u.team) && !job) continue;
      if (["tree", "rock", "barricade"].includes(v.terrain) && !job) continue;
      seen[i] = 1;
      queue[tail++] = i;
    }
  }
}
function stopContinuousWork(s: State, u: Unit) {
  const home = nearestWork(s, u, true);
  finishTravel(u);
  u.order = home ? "shelter" : "hold";
  u.target = home;
}
function updateContinuousWork(s: State, u: Unit) {
  if (!isContinuousOrder(u.order)) return;
  const gold = s.kingdoms[u.team].gold;
  if (
    (u.order === "build-many" && gold < 150) ||
    (u.order === "clear-many" && gold < CLEARING_COSTS.rock)
  ) {
    stopContinuousWork(s, u);
    return;
  }
  if (u.target && continuousJob(s, u, u.target)) return;
  u.target = nearestWork(s, u);
  if (!u.target) stopContinuousWork(s, u);
}
function finishTravel(u: Unit) {
  u.order = u.royal ? "hold" : "auto";
  delete u.target;
  delete u.pursue;
  delete u.pursueTeam;
  delete u.mergeGroup;
  u.formation = false;
}
function act(s: State, u: Unit) {
  const k = s.kingdoms[u.team];
  if (!k.alive || u.hp <= 0) return;
  if (u.order === "hold" || (u.royal && u.order === "auto")) return;
  if (u.pursue !== undefined && ["attack", "merge", "raid"].includes(u.order)) {
    let entity =
      s.units.find((v) => v.id === u.pursue && v.hp > 0) ??
      s.monsters.find((m) => m.id === u.pursue && m.hp > 0);
    if (!entity && u.target) {
      const old = u.target;
      entity =
        u.pursueTeam === 4
          ? s.monsters.find((m) => m.hp > 0 && distance(m, old) <= 1)
          : s.units.find(
              (v) =>
                v.id !== u.id &&
                v.hp > 0 &&
                v.team === u.pursueTeam &&
                distance(v, old) <= 1,
            );
      if (entity) u.pursue = entity.id;
    }
    if (entity) u.target = { x: entity.x, y: entity.y };
    else if (u.order === "attack") {
      // The target may die before the rest of the selected group arrives.
      // Keep their last destination rather than abandoning the march.
      delete u.pursue;
      delete u.pursueTeam;
    } else {
      finishTravel(u);
    }
  }
  aiSettlementTarget(s, u);
  updateDefence(s, u);
  updateAiCrossing(s, u);
  aiRaidTarget(s, u);
  playerExpansionTarget(s, u);
  updateContinuousWork(s, u);
  if (["hold"].includes(u.order)) return;
  let target = u.target;
  if (
    (u.order === "rest" || u.order === "shelter") &&
    target &&
    distance(u, target) === 0
  )
    return;
  if ((u.order === "bridge" || u.order === "barricade") && target) {
    const kind = u.order;
    const existing = structureAt(s, target);
    const finished =
      existing &&
      !existing.construction &&
      existing.team === u.team &&
      existing.kind === kind;
    if (
      finished ||
      (existing && (existing.team !== u.team || existing.kind !== kind))
    ) {
      finishTravel(u);
      return;
    }
    const valid =
      finished ||
      existing?.construction ||
      (kind === "bridge" ? crossing(s, target) : canBarricade(s, target));
    if (!valid) {
      finishTravel(u);
      return;
    }
    if (distance(u, target) <= 1) {
      if (finished) finishTravel(u);
      else fundConstruction(s, u, target, kind);
      return;
    }
    const banks =
      kind === "bridge" && !finished
        ? crossing(s, target)!.banks
        : [
            { x: target.x - 1, y: target.y },
            { x: target.x + 1, y: target.y },
            { x: target.x, y: target.y - 1 },
            { x: target.x, y: target.y + 1 },
          ].filter((p) => walkable(s, p.x, p.y, u.team));
    target = banks
      .map((p) => ({ p, step: nextStep(s, u, p, u.team) }))
      .filter((v) => v.step || distance(u, v.p) === 0)
      .sort((a, b) => distance(u, a.p) - distance(u, b.p))[0]?.p;
    if (!target) return; // Keep a blocked manual order for a future opening.
  }
  if ((u.order === "attack" || u.order === "demolish-many") && target) {
    const project = structureAt(s, target);
    if (project?.construction) {
      if (distance(u, target) === 1) {
        attackStructure(s, u, project);
        if (project.hp <= 0) {
          if (u.order === "demolish-many") delete u.target;
          else finishTravel(u);
        }
        return;
      }
      const banks = [
        { x: target.x - 1, y: target.y },
        { x: target.x + 1, y: target.y },
        { x: target.x, y: target.y - 1 },
        { x: target.x, y: target.y + 1 },
      ].filter((p) => walkable(s, p.x, p.y, u.team));
      target = banks
        .map((p) => ({ p, step: nextStep(s, u, p, u.team) }))
        .filter((v) => v.step)
        .sort((a, b) => distance(u, a.p) - distance(u, b.p))[0]?.p;
      if (!target) return;
    }
  }
  if (u.order === "dam" && target) {
    if (buildCrossing(s, u, target, u.order === "dam")) return;
    const existing = structureAt(s, target);
    const completed = tile(s, target.x, target.y)?.terrain === "dam";
    const cr =
      u.order === "dam" && (existing?.kind === "bridge" || completed)
        ? {
            cells: [target],
            banks: [
              { x: target.x - 1, y: target.y },
              { x: target.x + 1, y: target.y },
              { x: target.x, y: target.y - 1 },
              { x: target.x, y: target.y + 1 },
            ].filter((p) => walkable(s, p.x, p.y, u.team)),
          }
        : crossing(s, target);
    if (!cr) {
      u.order = "auto";
      u.target = undefined;
      return;
    }
    if (cr.banks.some((b) => distance(u, b) === 0)) {
      if (completed) finishTravel(u);
      return;
    }
    const reachable = cr.banks
      .map((b) => ({ b, step: nextStep(s, u, b, u.team) }))
      .filter((v) => v.step || distance(u, v.b) === 0)
      .sort((a, b) => distance(u, a.b) - distance(u, b.b));
    target = reachable[0]?.b;
    if (!target) {
      u.order = "auto";
      u.target = undefined;
      return;
    }
  }
  if (
    (u.order === "house" ||
      (u.order === "build-many" && canHouse(s, u.x, u.y)) ||
      (["raid", "auto"].includes(u.order) &&
        canHouse(s, u.x, u.y) &&
        k.gold >= 150 + buildingReserve(s, u.team))) &&
    target &&
    distance(u, target) === 0
  ) {
    if (addHouse(s, u.team, u.x, u.y)) {
      injure(u, Math.min(100, u.hp));
      if (u.order !== "build-many") u.order = "auto";
      delete u.target;
    } else {
      if (u.order !== "build-many") u.order = "auto";
      u.target = undefined;
    }
    return;
  }
  if (u.order === "merge" && target && distance(u, target) === 0) {
    // Residents can already share a house when the order is issued. They must
    // actually fuse here rather than all waiting for one another to move.
    for (const other of s.units.filter(
      (v) =>
        v.id !== u.id &&
        v.team === u.team &&
        v.hp > 0 &&
        v.x === u.x &&
        v.y === u.y,
    )) {
      if (resolveEncounter(s, u, other) !== u) return;
    }
    const pending = s.units.some(
      (v) =>
        v.id !== u.id &&
        v.team === u.team &&
        v.hp > 0 &&
        v.order === "merge" &&
        (u.mergeGroup !== undefined
          ? v.mergeGroup === u.mergeGroup
          : v.target?.x === target.x && v.target?.y === target.y),
    );
    if (!pending) finishTravel(u);
    return;
  }
  if (
    (u.order === "move" || u.order === "attack") &&
    target &&
    distance(u, target) === 0
  ) {
    finishTravel(u);
    return;
  }
  if (
    !u.royal &&
    u.order === "auto" &&
    (!u.target || distance(u, u.target) === 0) &&
    u.age > 1.2 &&
    u.hp >= 42 &&
    (u.team === 0 || u.hp < 1000) &&
    k.gold >= 150 + buildingReserve(s, u.team) &&
    (u.team !== 0 || random(s) < 0.72) &&
    addHouse(s, u.team, u.x, u.y)
  ) {
    injure(u, Math.min(100, u.hp));
    delete u.target;
    return;
  }
  // Independent wandering with a growing outward bias. Every inhabitant still makes local random choices.
  let dest = target
    ? nextStep(
        s,
        u,
        target,
        u.team,
        u.order === "rest" ||
          u.order === "shelter" ||
          (u.team === 0 &&
            u.order === "auto" &&
            !u.occupying &&
            !s.priorities.includes("raid")),
        (u.team === 0 && u.order === "auto") || u.order === "raid",
      )
    : undefined;
  if (!target) {
    if (u.team === 0 && u.order === "auto") return;
    const enemies = s.kingdoms
      .filter((v) => v.alive && !areAllied(s, v.id, u.team))
      .sort((a, b) => distance(u, a.castle) - distance(u, b.castle));
    const enemy = enemies[0]?.castle;
    const nearCastle = enemy && distance(u, enemy) < 12;
    const candidates = [
      { x: u.x + 1, y: u.y },
      { x: u.x - 1, y: u.y },
      { x: u.x, y: u.y + 1 },
      { x: u.x, y: u.y - 1 },
    ].filter((p) => autonomousDestination(s, u, p));
    dest = candidates
      .map((p) => ({
        p,
        score:
          random(s) * 3 +
          (distance(p, k.castle) > distance(u, k.castle) ? 0.42 : 0) +
          (p.x - u.x === u.heading.x && p.y - u.y === u.heading.y ? 0.8 : 0) +
          (u.team !== 0 && enemy && distance(p, enemy) < distance(u, enemy)
            ? nearCastle
              ? 2
              : Math.min(1.3 + s.level * 0.02, s.time / 180)
            : 0) -
          (tile(s, p.x, p.y)?.terrain === "barricade" ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.p;
  }
  if (!dest) {
    if (isContinuousOrder(u.order)) {
      delete u.target;
      return;
    }
    if (u.order === "raid") {
      u.order = "auto";
      delete u.target;
      delete u.pursue;
      delete u.pursueTeam;
      return;
    }
    if (target && !hasDestinationOrder(u) && u.order !== "rest") {
      u.target = undefined;
      u.order = "auto";
    }
    return;
  }
  const t = tile(s, dest.x, dest.y)!;
  const cave = s.caves.find((c) => c.id === t.cave);
  if (cave && !attackCave(s, u, cave)) return;
  for (const monster of s.monsters.filter(
    (m) => m.hp > 0 && m.x === dest!.x && m.y === dest!.y,
  ))
    if (!attackMonster(s, u, monster)) return;
  const structure = structureAt(s, dest);
  if (
    structure &&
    (((u.order === "attack" || u.order === "demolish-many") &&
      (structure.kind === "barricade" ||
        (target?.x === dest.x && target?.y === dest.y))) ||
      (structure.kind === "barricade" &&
        !structure.construction &&
        !areAllied(s, structure.team, u.team)))
  ) {
    attackStructure(s, u, structure);
    if (
      (u.order === "attack" || u.order === "demolish-many") &&
      structure.hp <= 0 &&
      target?.x === dest.x &&
      target?.y === dest.y
    ) {
      if (u.order === "demolish-many") delete u.target;
      else finishTravel(u);
    }
    return;
  }
  if (t.terrain === "barricade") return;
  if (t.terrain === "tree" || t.terrain === "rock") {
    const cost = CLEARING_COSTS[t.terrain];
    // A lower-priority clearing task must not repeatedly consume the savings
    // needed for an already available foundation.
    if (t.permanent || (t.terrain === "tree" && savingForHouse(s, u))) return;
    if (
      k.gold <
      cost +
        (u.team !== 0 && u.order === "auto" ? buildingReserve(s, u.team) : 0)
    )
      return;
    k.gold -= cost;
    t.terrain = "grass";
    invalidateWorld(s);
    injure(u, 3);
    s.stats.cleared++;
    return;
  }
  const occupants = unitsAt(s, dest).filter((v) => v.id !== u.id);
  for (const other of occupants) {
    if (
      other.hp <= 0 ||
      (other.team !== u.team && areAllied(s, other.team, u.team))
    )
      continue;
    if (u.order === "rest" && !areAllied(s, other.team, u.team)) return;
    const winner = resolveEncounter(s, u, other);
    if (winner !== u || u.hp <= 0) return;
  }
  injure(u, destroyTurf(s, dest, u.team, u.hp));
  if (u.hp <= 0) return;
  const house = houseById(s, t.house);
  if (house && !areAllied(s, house.team, u.team)) {
    const destroyed = assaultHouse(s, house, u);
    if (!destroyed || u.hp <= 0) return;
  }
  u.heading = { x: dest.x - u.x, y: dest.y - u.y };
  moveInIndex(s, u, dest);
  u.x = dest.x;
  u.y = dest.y;
  if (!u.royal && !resting(s, u)) u.hp -= 0.32;
  if (
    (u.order === "move" || u.order === "attack") &&
    u.target &&
    distance(u, u.target) === 0
  ) {
    finishTravel(u);
  }
}
function mergeStackedAllies(s: State) {
  const occupied = new Map<number, Unit>();
  let merged = false;
  for (const u of s.units) {
    if (u.hp <= 0 || !s.kingdoms[u.team].alive) continue;
    const key = u.team * s.tiles.length + idx(s, u.x, u.y),
      other = occupied.get(key);
    if (other && other.hp > 0) {
      occupied.set(key, resolveEncounter(s, u, other)!);
      merged = true;
    } else occupied.set(key, u);
  }
  if (merged) s.units = s.units.filter((u) => u.hp > 0);
}
export function step(s: State, dt = 0.2) {
  if (s.result !== "playing") return;
  if (dt > 0) s.battleStarted = true;
  const signature = worldSignature(s);
  if (worldSignatures.get(s) !== signature) invalidateWorld(s);
  spatial.delete(s);
  unitCells.delete(s);
  simulating.add(s);
  mergeStackedAllies(s);
  s.time += dt;
  refreshKings(s);
  for (const k of s.kingdoms) {
    if (!k.alive) continue;
    const hs = s.houses.filter((h) => h.team === k.id).length,
      us = s.units.filter((u) => u.team === k.id).length;
    if (k.automatic) {
      const desired =
        (k.id !== 0 && buildingReserve(s, k.id) > 0) || k.gold < 300
          ? 24
          : k.gold > 1200
            ? 4
            : us < hs * 1.5
              ? 8
              : 14;
      k.tax += (desired - k.tax) * Math.min(1, dt * 0.25);
    }
    k.gold += dt * goldIncome(s, k.id);
  }
  for (const h of s.houses) {
    const interval = birthInterval(s.kingdoms[h.team].tax);
    if (h.interval && h.interval !== interval)
      h.timer = (h.timer * interval) / h.interval;
    h.interval = interval;
    h.timer += dt;
    if (h.timer >= interval) {
      h.timer -= interval;
      spawn(s, h);
    }
  }
  const armies = s.kingdoms.map((k) => armyHP(s, k.id));
  const maintenance = s.kingdoms.map((k) =>
    k.alive ? maintenanceCost(s, k.id) * dt : 0,
  );
  for (const u of s.units) {
    if (u.hp <= 0 || !s.kingdoms[u.team].alive) continue;
    u.age += dt;
    const upkeep = lifeDrain(s, u) + supportDrain(s, u, armies[u.team]);
    if (u.royal) injure(u, dt * upkeep);
    else u.hp -= dt * upkeep;
    u.wait -= dt;
    if (u.hp > 0 && u.wait <= 0) {
      u.wait = 0.42 + random(s) * 0.28;
      act(s, u);
    }
  }
  // The requested work uses the available treasury before the step's maintenance bill.
  // This preserves exact construction/clearing prices without making armies free.
  const coverage = s.kingdoms.map((k, i) => {
    const needed = maintenance[i],
      paid = Math.min(k.gold, needed);
    k.gold -= paid;
    return needed ? paid / needed : 1;
  });
  for (const u of s.units)
    if (u.hp > 0 && suppliedUpkeep(s, u) > 0)
      u.hp -= u.hp * 0.08 * (1 - coverage[u.team]) * dt;
  tickMonsters(s, dt);
  for (const k of s.kingdoms) {
    const king = s.units.find((u) => u.team === k.id && u.royal);
    if (k.alive && (!king || king.hp <= 0)) destroyKingdom(s, k.id, k.id);
  }
  s.units = s.units.filter((u) => u.hp > 0 && s.kingdoms[u.team].alive);
  refreshKings(s);
  for (const k of s.kingdoms)
    if (k.alive && !s.houses.some((h) => h.team === k.id))
      destroyKingdom(s, k.id, k.id);
  s.units = s.units.filter((u) => u.hp > 0 && s.kingdoms[u.team].alive);
  updateAlliance(s);
  if (!s.kingdoms[0].alive) s.result = "lost";
  else if (s.kingdoms.slice(1).every((k) => !k.alive)) s.result = "won";
  simulating.delete(s);
  worldSignatures.set(s, worldSignature(s));
}
export function saveGame(s: State) {
  return JSON.stringify(s);
}
export function loadGame(data: string): State | undefined {
  try {
    if (data.length > 5_000_000) return;
    const s = JSON.parse(data) as State;
    if (
      s.version === 2 &&
      s.campaignVersion === undefined &&
      Number.isInteger(s.level) &&
      s.level >= 0 &&
      s.level < 5
    ) {
      s.level *= 5;
      s.campaignVersion = 2;
    }
    if (
      s.version === 2 &&
      Array.isArray(s.tiles) &&
      Array.isArray(s.kingdoms) &&
      !s.structures
    ) {
      s.structures = [];
      s.bridgeSites = [];
      const visited = new Set<number>();
      for (let i = 0; i < s.tiles.length; i++) {
        if (visited.has(i) || s.tiles[i]?.terrain !== "bridge") continue;
        const cells: Point[] = [];
        const pending = [i];
        while (pending.length) {
          const a = pending.pop()!;
          if (visited.has(a)) continue;
          visited.add(a);
          const t = s.tiles[a];
          if (t?.terrain !== "bridge" || t.owner !== s.tiles[i].owner) continue;
          const x = a % s.size,
            y = Math.floor(a / s.size);
          cells.push({ x, y });
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (inside(s, x + dx, y + dy)) pending.push(idx(s, x + dx, y + dy));
        }
        s.structures.push({
          id: s.nextId++,
          kind: "bridge",
          team: s.tiles[i].owner ?? 0,
          hp: 1000,
          maxHp: 1000,
          cells,
        });
        s.bridgeSites.push(cells.map((p) => ({ ...p })));
      }
    }
    if (s.version === 2 && Array.isArray(s.kingdoms))
      for (const k of s.kingdoms)
        if (k && k.bridgeSaving === undefined) k.bridgeSaving = false;
    if (s.version === 2 && Array.isArray(s.houses))
      for (const h of s.houses) if (h && h.founded === undefined) h.founded = 0;
    if (Array.isArray(s.kingdoms))
      for (const k of s.kingdoms) {
        const old = k as Kingdom & { wood?: number; stone?: number };
        if (old) {
          delete old.wood;
          delete old.stone;
        }
      }
    if (Array.isArray(s.structures))
      s.structures = s.structures.flatMap((b) =>
        b && b.kind === "bridge" && Array.isArray(b.cells) && b.cells.length > 1
          ? b.cells.map((p, i) => ({
              ...b,
              id: i ? s.nextId++ : b.id,
              cells: [p],
            }))
          : [b],
      );
    if (Array.isArray(s.bridgeSites))
      s.bridgeSites = s.bridgeSites.flatMap((site) =>
        Array.isArray(site) ? site.map((p) => [p]) : [site],
      );
    if (Array.isArray(s.kingdoms))
      for (const k of s.kingdoms)
        if (k && k.fortification === undefined) k.fortification = 2000;
    if (s.clearedTurf === undefined) s.clearedTurf = {};
    if (s.turfRevision === undefined) s.turfRevision = 0;
    if (s.caves === undefined) s.caves = [];
    if (s.monsters === undefined) s.monsters = [];
    if (s.priorities === undefined) s.priorities = [...DEFAULT_PRIORITIES];
    if (!validPriorities(s.priorities)) return;
    if (s.doctrine === undefined)
      s.doctrine =
        s.priorities.join() === DEFAULT_PRIORITIES.join()
          ? "builder"
          : "custom";
    if (!validDoctrine(s.doctrine)) return;
    if (Array.isArray(s.houses))
      for (const h of s.houses)
        if (h && h.interval === undefined)
          h.interval = birthInterval(s.kingdoms?.[h.team]?.tax ?? 12);
    const num = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0;
    const int = (n: unknown) => num(n) && Number.isInteger(n);
    const faction = (n: unknown) => int(n) && (n as number) < 5;
    const team = (n: unknown) => int(n) && (n as number) < 4;
    const point = (p: Point) =>
      p && int(p.x) && int(p.y) && p.x < s.size && p.y < s.size;
    const orders = [
      "auto",
      "move",
      "attack",
      "merge",
      "house",
      "build-many",
      "clear-many",
      "demolish-many",
      "bridge",
      "dam",
      "barricade",
      "hold",
      "rest",
      "shelter",
      "defend",
      "raid",
    ];
    if (
      s.version !== 2 ||
      s.campaignVersion !== 2 ||
      !int(s.size) ||
      s.size < 32 ||
      s.size > 128 ||
      !int(s.level) ||
      s.level >= LEVELS.length ||
      !num(s.seed) ||
      !num(s.rng) ||
      !num(s.time) ||
      !int(s.nextId) ||
      !["playing", "won", "lost"].includes(s.result)
    )
      return;
    if (
      !Array.isArray(s.tiles) ||
      s.tiles.length !== s.size * s.size ||
      !s.tiles.every(
        (t) =>
          t &&
          [
            "grass",
            "tree",
            "rock",
            "water",
            "bridge",
            "dam",
            "barricade",
          ].includes(t.terrain) &&
          (t.permanent === undefined || typeof t.permanent === "boolean") &&
          int(t.variant) &&
          t.variant < 8 &&
          (t.owner === undefined || faction(t.owner)) &&
          (t.cave === undefined || int(t.cave)) &&
          (t.castle === undefined || team(t.castle)) &&
          (t.house === undefined || int(t.house)),
      )
    )
      return;
    if (
      !Array.isArray(s.kingdoms) ||
      s.kingdoms.length !== 4 ||
      !s.kingdoms.every(
        (k, i) =>
          k &&
          k.id === i &&
          point(k.castle) &&
          num(k.gold) &&
          num(k.tax) &&
          k.tax <= 30 &&
          typeof k.automatic === "boolean" &&
          typeof k.bridgeSaving === "boolean" &&
          (k.crossingPlan === undefined ||
            (Array.isArray(k.crossingPlan) &&
              k.crossingPlan.length <= 8 &&
              k.crossingPlan.every(point))) &&
          typeof k.alive === "boolean" &&
          num(k.hp) &&
          num(k.fortification) &&
          k.fortification <= 2000 &&
          int(k.births) &&
          int(k.kills),
      )
    )
      return;
    if (
      !Array.isArray(s.units) ||
      s.units.length > 600 ||
      !s.units.every(
        (u) =>
          u &&
          point(u) &&
          team(u.team) &&
          int(u.id) &&
          num(u.hp) &&
          u.hp > 0 &&
          num(u.age) &&
          typeof u.wait === "number" &&
          Number.isFinite(u.wait) &&
          (u.defending === undefined || int(u.defending)) &&
          (u.formation === undefined || typeof u.formation === "boolean") &&
          (u.occupying === undefined || typeof u.occupying === "boolean") &&
          (u.pursue === undefined || int(u.pursue)) &&
          (u.pursueTeam === undefined || faction(u.pursueTeam)) &&
          (u.mergeGroup === undefined || int(u.mergeGroup)) &&
          (!u.royal ||
            (typeof u.reserve === "number" && Number.isFinite(u.reserve))) &&
          (u.wounds === undefined || num(u.wounds)) &&
          orders.includes(u.order) &&
          (!u.target || point(u.target)) &&
          u.heading &&
          [-1, 0, 1].includes(u.heading.x) &&
          [-1, 0, 1].includes(u.heading.y),
      )
    )
      return;
    if (
      !Array.isArray(s.houses) ||
      s.houses.length > s.size * s.size ||
      !s.houses.every(
        (h) =>
          h &&
          point(h) &&
          team(h.team) &&
          int(h.id) &&
          num(h.timer) &&
          num(h.interval) &&
          h.interval > 0 &&
          num(h.founded) &&
          (h.damage === undefined || (num(h.damage) && h.damage < 200)) &&
          tile(s, h.x, h.y)?.house === h.id,
      )
    )
      return;
    if (
      !Array.isArray(s.events) ||
      s.events.length > 30 ||
      !s.events.every(
        (e) =>
          e &&
          num(e.time) &&
          faction(e.team) &&
          typeof e.text === "string" &&
          e.text.length < 500,
      )
    )
      return;
    if (
      !Array.isArray(s.ruins) ||
      s.ruins.length > 4 ||
      !s.ruins.every((r) => r && point(r) && team(r.team) && num(r.time))
    )
      return;
    if (
      s.kingdoms.some(
        (k) =>
          k.alive &&
          s.units.filter((u) => u.team === k.id && u.royal).length !== 1,
      )
    )
      return;
    if (
      !Array.isArray(s.structures) ||
      s.structures.length > s.size * s.size ||
      !s.structures.every(
        (b) =>
          b &&
          int(b.id) &&
          ["bridge", "barricade"].includes(b.kind) &&
          faction(b.team) &&
          num(b.hp) &&
          b.hp > 0 &&
          num(b.maxHp) &&
          b.maxHp > 0 &&
          b.hp <= b.maxHp &&
          (b.construction === undefined ||
            (b.construction &&
              num(b.construction.paid) &&
              num(b.construction.total) &&
              b.construction.paid < b.construction.total &&
              (b.kind === "bridge"
                ? [500, 1000].includes(b.construction.total)
                : b.construction.total === 750))) &&
          Array.isArray(b.cells) &&
          b.cells.length === 1 &&
          b.cells.every(
            (p) =>
              point(p) &&
              tile(s, p.x, p.y)?.terrain ===
                (b.construction
                  ? b.kind === "bridge"
                    ? "water"
                    : "grass"
                  : b.kind),
          ),
      )
    )
      return;
    if (
      !Array.isArray(s.bridgeSites) ||
      s.bridgeSites.length > s.size * s.size ||
      !s.bridgeSites.every(
        (site) =>
          Array.isArray(site) &&
          site.length > 0 &&
          site.length <= s.size * s.size &&
          site.every(point),
      )
    )
      return;
    if (
      !s.stats ||
      !["cleared", "bridges", "dams", "merged"].every((k) =>
        int(s.stats[k as keyof typeof s.stats]),
      )
    )
      return;
    if (
      !Array.isArray(s.caves) ||
      s.caves.length > 8 ||
      !s.caves.every(
        (c) =>
          c &&
          point(c) &&
          int(c.id) &&
          num(c.hp) &&
          c.hp > 0 &&
          num(c.maxHp) &&
          c.hp <= c.maxHp &&
          num(c.timer) &&
          num(c.interval) &&
          c.interval > 0 &&
          num(c.spawnHp) &&
          c.spawnHp > 0 &&
          tile(s, c.x, c.y)?.cave === c.id,
      )
    )
      return;
    if (
      !Array.isArray(s.monsters) ||
      s.monsters.length > 100 ||
      !s.monsters.every(
        (m) =>
          m &&
          point(m) &&
          int(m.id) &&
          num(m.hp) &&
          m.hp > 0 &&
          int(m.cave) &&
          Number.isFinite(m.wait) &&
          m.heading &&
          [-1, 0, 1].includes(m.heading.x) &&
          [-1, 0, 1].includes(m.heading.y),
      )
    )
      return;
    if (
      !s.clearedTurf ||
      typeof s.clearedTurf !== "object" ||
      Array.isArray(s.clearedTurf) ||
      !int(s.turfRevision) ||
      Object.keys(s.clearedTurf).length > s.size * s.size ||
      !Object.entries(s.clearedTurf).every(
        ([key, value]) =>
          int(Number(key)) && Number(key) < s.size * s.size && int(value),
      )
    )
      return;
    if (s.battleStarted !== undefined && typeof s.battleStarted !== "boolean")
      return;
    if (
      s.alliance !== undefined &&
      (!s.alliance ||
        typeof s.alliance !== "object" ||
        ![1, 2, 3].includes(s.alliance.partner) ||
        typeof s.alliance.broken !== "boolean")
    )
      return;
    s.battleStarted = s.battleStarted === true || s.time > 0;
    updateAlliance(s);
    s.events = [];
    mergeStackedAllies(s);
    return s;
  } catch {
    return;
  }
}
