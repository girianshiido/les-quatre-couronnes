import { seedCaves, tickMonsters, attackMonster, attackCave } from "./monsters";
export type Terrain =
  "grass" | "tree" | "rock" | "water" | "bridge" | "dam" | "barricade";
export type Order =
  | "auto"
  | "move"
  | "attack"
  | "merge"
  | "house"
  | "bridge"
  | "dam"
  | "barricade"
  | "hold"
  | "rest"
  | "shelter"
  | "defend";
export interface Point {
  x: number;
  y: number;
}
export interface Tile {
  terrain: Terrain;
  variant: number;
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
  defending?: number;
  formation?: boolean;
  pursue?: number;
  pursueTeam?: number;
}
export interface House extends Point {
  id: number;
  team: number;
  timer: number;
  interval: number;
  founded: number;
}
export interface Kingdom {
  id: number;
  gold: number;
  tax: number;
  automatic: boolean;
  bridgeSaving: boolean;
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
  version: 2;
  campaignVersion: 2;
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
    size: 64 + biomeId * 2 + Math.floor(stage / 2) * 4,
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
export function log(s: State, text: string, team = 0) {
  s.events.unshift({ time: s.time, text, team });
  s.events.length = Math.min(30, s.events.length);
}
export function createGame(level = 0, seed = 14243): State {
  level = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(level)));
  const size = LEVELS[level].size,
    biome = LEVELS[level].biomeId,
    stage = LEVELS[level].stage,
    phase = ((seed % 997) / 997) * Math.PI * 2;
  const s: State = {
    version: 2,
    campaignVersion: 2,
    clearedTurf: {},
    turfRevision: 0,
    size,
    level,
    seed,
    rng: seed >>> 0,
    time: 0,
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
  const m = 13;
  const bases = [
    { x: m, y: m },
    { x: size - 1 - m, y: m },
    { x: size - 1 - m, y: size - 1 - m },
    { x: m, y: size - 1 - m },
  ];
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
      level === 0 ? (team === 0 ? 8 : 6) : 5 + Math.floor(random(s) * 3);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius)
          tile(s, c.x + dx, c.y + dy)!.terrain = "grass";
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
  seedCaves(s);
  log(s, "Quatre couronnes. Une seule vallée. L’histoire commence.");
  return s;
}
export function territoryAt(s: State, p: Point) {
  if (tile(s, p.x, p.y)?.terrain !== "grass") return;
  let best: House | undefined,
    bestDistance = 99,
    bestGrowth = 0;
  for (const h of s.houses) {
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
export function destroyTurf(s: State, p: Point, team: number) {
  const turf = territoryAt(s, p);
  if (!turf || turf.team === team) return 0;
  s.clearedTurf[idx(s, p.x, p.y)] = turf.house;
  s.turfRevision++;
  return 2;
}
export function canHouse(s: State, x: number, y: number) {
  const t = tile(s, x, y);
  if (
    !t ||
    t.terrain !== "grass" ||
    t.house !== undefined ||
    t.cave !== undefined ||
    t.castle !== undefined
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
}
export function walkable(s: State, x: number, y: number, team: number) {
  const t = tile(s, x, y);
  return (
    !!t &&
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
  const h = s.houses.find((h) => h.id === tile(s, u.x, u.y)?.house);
  return !!h && h.team === u.team;
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
function injure(u: Unit, amount: number) {
  u.hp -= amount;
  if (u.royal) u.reserve = (u.reserve ?? 100) - amount;
}
export function refreshKings(s: State) {
  for (const k of s.kingdoms) {
    if (!k.alive) continue;
    const king = s.units.find((u) => u.team === k.id && u.royal);
    if (!king) {
      destroyKingdom(s, k.id, k.id);
      continue;
    }
    const people = s.units
      .filter((u) => u.team === k.id && !u.royal && u.hp > 0)
      .reduce((n, u) => n + u.hp, 0);
    king.hp = (king.reserve ?? 100) + people * 0.25;
    k.hp = Math.max(0, king.hp);
    if (king.hp <= 0) destroyKingdom(s, k.id, k.id);
  }
}
export function combatPower(s: State, u: Unit) {
  return sheltered(s, u) ? u.hp * 8 + s.kingdoms[u.team].fortification : u.hp;
}
export function resolveEncounter(s: State, a: Unit, b: Unit) {
  if (a.team === b.team) {
    const win = b.royal || (!a.royal && b.order === "hold") ? b : a,
      lose = win === a ? b : a;
    if (win.royal) win.reserve = (win.reserve ?? 100) + lose.hp * 1.25;
    win.hp += lose.hp;
    lose.hp = 0;
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
    return null;
  }
  if (ap > bp) {
    injure(a, Math.min(a.hp - 1, bp * 0.7));
    injure(b, b.hp);
    if (fort) fort.fortification = 0;
    if (s.kingdoms[a.team]) s.kingdoms[a.team].kills++;
    return a;
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
  return b;
}
export function unitUpkeep(u: Unit) {
  return !u.royal && u.hp > 500 ? u.hp * 0.0004 : 0;
}
export function maintenanceCost(s: State, team: number) {
  return s.units
    .filter((u) => u.team === team && u.hp > 0)
    .reduce((n, u) => n + unitUpkeep(u), 0);
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
) {
  let caches = flowCaches.get(s);
  if (!caches) {
    caches = {
      normal: { key: "", fields: new Map() },
      peaceful: { key: "", fields: new Map() },
    };
    flowCaches.set(s, caches);
  }
  const cache = peaceful ? caches.peaceful : caches.normal;
  const key = `${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}${peaceful ? `-${s.stats.cleared}-${s.turfRevision}-${Math.floor(s.time * 2)}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}` : ""}`;
  if (cache.key !== key) {
    cache.key = key;
    cache.fields.clear();
  }
  const target = idx(s, goal.x, goal.y),
    fieldKey = `${target}-${team}`;
  let field = cache.fields.get(fieldKey);
  const pass = (x: number, y: number) =>
    inside(s, x, y) &&
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
    if (cache.fields.size >= 32)
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
): Point | undefined {
  if (
    (start as Unit).formation &&
    ["move", "attack", "merge", "shelter"].includes((start as Unit).order)
  )
    return formationStep(s, start, goal, team, peaceful);
  const total = s.size * s.size,
    prev = new Int32Array(total).fill(-1),
    queue = new Int32Array(total);
  let head = 0,
    tail = 0;
  const st = idx(s, start.x, start.y),
    end = idx(s, goal.x, goal.y);
  if (st === end) return undefined;
  queue[tail++] = st;
  prev[st] = st;
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
      if (peaceful && !peacefulTile(s, nx, ny, team)) continue;
      if (
        tile(s, nx, ny)?.terrain === "barricade" &&
        (nx !== goal.x || ny !== goal.y)
      )
        continue;
      const ni = idx(s, nx, ny);
      if (prev[ni] !== -1) continue;
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
  if (tile(s, p.x, p.y)?.terrain !== "water") return;
  const banks = [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter((b) => {
    const t = tile(s, b.x, b.y);
    return !!t && !["water", "dam", "barricade"].includes(t.terrain);
  });
  return banks.length ? { cells: [{ ...p }], banks } : undefined;
}
export function structureAt(s: State, p: Point) {
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
    t.terrain === "grass" &&
    t.house === undefined &&
    t.cave === undefined &&
    t.castle === undefined &&
    !s.units.some((u) => u.hp > 0 && u.x === p.x && u.y === p.y)
  );
}
export function buildBarricade(s: State, u: Unit, p: Point) {
  const k = s.kingdoms[u.team];
  if (u.royal || distance(u, p) !== 1 || !canBarricade(s, p) || k.gold < 750)
    return false;
  k.gold -= 750;
  k.bridgeSaving = false;
  const t = tile(s, p.x, p.y)!;
  t.terrain = "barricade";
  t.owner = u.team;
  s.structures.push({
    id: s.nextId++,
    kind: "barricade",
    team: u.team,
    hp: 1500,
    maxHp: 1500,
    cells: [{ ...p }],
  });
  u.order = "auto";
  delete u.target;
  u.hp -= 5;
  log(s, "Une barricade ferme le passage.", u.team);
  return true;
}
export function destroyStructure(s: State, b: Structure) {
  if (!s.structures.includes(b)) return;
  s.structures = s.structures.filter((v) => v.id !== b.id);
  for (const p of b.cells) {
    const t = tile(s, p.x, p.y)!;
    t.terrain = b.kind === "bridge" ? "water" : "grass";
    delete t.owner;
    if (b.kind === "bridge")
      for (const u of s.units)
        if (u.x === p.x && u.y === p.y && u.hp > 0) injure(u, u.hp);
  }
  log(
    s,
    b.kind === "bridge"
      ? "Un pont s’écroule. Il pourra être reconstruit pour 500 pièces."
      : "Une barricade est détruite.",
    b.team,
  );
}
export function attackStructure(s: State, u: Unit, b: Structure) {
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
  if (u.team !== 0) return true;
  const t = tile(s, p.x, p.y)!;
  if (t.terrain === "rock" || t.terrain === "barricade" || t.cave !== undefined)
    return false;
  const turf = territoryAt(s, p);
  if (turf && turf.team !== u.team) return false;
  const building = structureAt(s, p);
  if (building?.kind === "barricade" && building.team !== u.team) return false;
  if (t.castle !== undefined && t.castle !== u.team) return false;
  if (
    t.house !== undefined &&
    s.houses.find((h) => h.id === t.house)?.team !== u.team
  )
    return false;
  if (s.monsters.some((m) => m.hp > 0 && m.x === p.x && m.y === p.y))
    return false;
  return !s.units.some(
    (v) => v.hp > 0 && v.team !== u.team && v.x === p.x && v.y === p.y,
  );
}
export function buildCrossing(s: State, u: Unit, p: Point, dam = false) {
  const existing = structureAt(s, p);
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
  s.stats[dam ? "dams" : "bridges"]++;
  u.hp -= 8;
  u.order = "auto";
  u.target = undefined;
  log(
    s,
    dam
      ? "Un barrage fournit de nouveaux revenus."
      : "Un pont ouvre un passage entre les royaumes.",
    u.team,
  );
  return true;
}
export function command(s: State, ids: number[], order: Order, target?: Point) {
  const us = s.units.filter(
    (u) =>
      ids.includes(u.id) &&
      u.team === 0 &&
      u.hp > 0 &&
      (!u.royal || !["house", "bridge", "dam", "barricade"].includes(order)),
  );
  if (!us.length) return;
  const rally = target ?? { x: us[0].x, y: us[0].y };
  const entity =
    target && ["attack", "merge"].includes(order)
      ? (s.units.find(
          (u) =>
            u.hp > 0 &&
            u.x === target.x &&
            u.y === target.y &&
            !ids.includes(u.id) &&
            (order === "merge" ? u.team === 0 : u.team !== 0),
        ) ??
        (order === "attack"
          ? s.monsters.find(
              (m) => m.hp > 0 && m.x === target.x && m.y === target.y,
            )
          : undefined))
      : undefined;
  for (const u of us) {
    u.order = order;
    u.formation =
      us.length >= 8 && ["move", "attack", "merge", "shelter"].includes(order);
    delete u.defending;
    delete u.pursue;
    delete u.pursueTeam;
    if (entity) {
      u.pursue = entity.id;
      u.pursueTeam = "team" in entity ? entity.team : 4;
    }
    u.target = order === "auto" || order === "hold" ? undefined : rally;
  }
}
function destroyKingdom(s: State, team: number, attacker: number) {
  const k = s.kingdoms[team];
  if (!k.alive) return;
  k.alive = false;
  k.hp = 0;
  s.ruins.push({ team, ...k.castle, time: s.time });
  for (const t of s.tiles) if (t.castle === team) t.castle = undefined;
  for (const h of s.houses.filter((h) => h.team === team))
    tile(s, h.x, h.y)!.house = undefined;
  s.houses = s.houses.filter((h) => h.team !== team);
  s.units.forEach((u) => {
    if (u.team === team) u.hp = 0;
  });
  log(
    s,
    `La couronne ${TEAM_NAMES[team]} est tombée. Son château s’effondre.`,
    attacker,
  );
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
  if (turf && turf.team !== team) return false;
  if (t.castle !== undefined && t.castle !== team) return false;
  if (
    t.house !== undefined &&
    s.houses.find((h) => h.id === t.house)?.team !== team
  )
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
  const key = `${s.turfRevision}-${Math.floor(s.time / 5)}-${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}-${s.ruins.length}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}`;
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
      const house =
        t.house === undefined
          ? undefined
          : s.houses.find((h) => h.id === t.house);
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
function updateRest(s: State, u: Unit) {
  if (u.team !== 0 || u.royal || !["auto", "rest"].includes(u.order)) return;
  const plan = shelterPlan(s),
    region = plan.regions[idx(s, u.x, u.y)],
    work = plan.work.get(region),
    k = s.kingdoms[0];
  const canWork =
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
          25,
    }))
    .sort((a, b) => a.score - b.score)[0]?.h;
  if (chosen) {
    u.order = "rest";
    u.target = { x: chosen.x, y: chosen.y };
  }
}
const landLinks = new WeakMap<
  State,
  { key: string; links: Map<number, boolean> }
>();
function landConnected(s: State, team: number) {
  const key = `${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}-${s.ruins.length}`;
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
      t.castle !== team &&
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
  if (team === 0) return s.kingdoms[0].bridgeSaving ? 1000 : 0;
  return s.time > 60 &&
    s.houses.filter((h) => h.team === team).length >= 6 &&
    !landConnected(s, team)
    ? 1000
    : 0;
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
        (v) => v.hp > 0 && v.team !== u.team && v.x === p.x && v.y === p.y,
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
function updateDefence(s: State, u: Unit) {
  if (u.team !== 0 || u.royal || !["auto", "rest", "defend"].includes(u.order))
    return;
  const houses = s.houses.filter((h) => h.team === u.team);
  const threats = [...s.units, ...s.monsters.map((m) => ({ ...m, team: 4 }))]
    .filter(
      (v) =>
        v.team !== u.team &&
        v.hp > 0 &&
        distance(u, v) <= 10 &&
        (distance(v, s.kingdoms[u.team].castle) <= 5 ||
          houses.some((h) => distance(v, h) <= 5)),
    )
    .sort((a, b) => distance(u, a) - distance(u, b));
  const current = threats.find((v) => v.id === u.defending);
  const candidates = current
    ? [current, ...threats.filter((v) => v.id !== current.id)]
    : threats;
  const target = candidates.find(
    (v) => distance(u, v) > 0 && nextStep(s, u, v, u.team),
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
function act(s: State, u: Unit) {
  const k = s.kingdoms[u.team];
  if (!k.alive || u.hp <= 0) return;
  if (u.order === "hold" || (u.royal && u.order === "auto")) return;
  if (u.pursue !== undefined && ["attack", "merge"].includes(u.order)) {
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
    else {
      u.order = "hold";
      delete u.target;
      delete u.pursue;
      delete u.pursueTeam;
    }
  }
  aiSettlementTarget(s, u);
  updateDefence(s, u);
  updateRest(s, u);
  let target = u.target;
  if (
    (u.order === "rest" || u.order === "shelter") &&
    target &&
    distance(u, target) === 0
  )
    return;
  if (u.order === "barricade" && target && distance(u, target) <= 1) {
    if (!buildBarricade(s, u, target) && !canBarricade(s, target)) {
      u.order = "auto";
      delete u.target;
    }
    return;
  }
  if ((u.order === "bridge" || u.order === "dam") && target) {
    if (buildCrossing(s, u, target, u.order === "dam")) return;
    const existing = structureAt(s, target);
    const cr =
      u.order === "dam" && existing?.kind === "bridge"
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
    if (cr.banks.some((b) => distance(u, b) === 0)) return;
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
  if (u.order === "house" && target && distance(u, target) === 0) {
    if (addHouse(s, u.team, u.x, u.y)) {
      u.hp = 0;
      log(s, "Une nouvelle maison rejoint le royaume.", u.team);
    } else {
      u.order = "auto";
      u.target = undefined;
    }
    return;
  }
  if (u.order === "merge" && target && distance(u, target) === 0) return;
  if (
    (u.order === "move" || u.order === "attack") &&
    target &&
    distance(u, target) === 0
  ) {
    u.order = "hold";
    u.target = undefined;
    return;
  }
  if (
    !u.royal &&
    u.order === "auto" &&
    u.age > 1.2 &&
    u.hp >= 42 &&
    k.gold >= 150 + buildingReserve(s, u.team) &&
    (u.team !== 0 || random(s) < 0.72) &&
    addHouse(s, u.team, u.x, u.y)
  ) {
    u.hp = 0;
    return;
  }
  // Independent wandering with a growing outward bias. Every inhabitant still makes local random choices.
  let dest = target
    ? nextStep(
        s,
        u,
        target,
        u.team,
        u.order === "rest" || u.order === "shelter",
      )
    : undefined;
  if (!target) {
    const enemies = s.kingdoms
      .filter((v) => v.alive && v.id !== u.team)
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
    // Only opponents initiate infrastructure work without a direct order.
    if (
      u.team !== 0 &&
      s.time > 65 - Math.min(20, s.level) &&
      random(s) < 0.12
    ) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (buildCrossing(s, u, { x: u.x + dx, y: u.y + dy })) return;
    }
  }
  if (!dest) {
    if (target && u.order !== "merge" && u.order !== "rest") {
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
    (u.order === "attack" ||
      (structure.kind === "barricade" && structure.team !== u.team))
  ) {
    attackStructure(s, u, structure);
    if (u.order === "attack" && structure.hp <= 0) {
      u.order = "hold";
      delete u.target;
    }
    return;
  }
  if (t.terrain === "barricade") return;
  if (t.terrain === "tree" || t.terrain === "rock") {
    const cost = t.terrain === "tree" ? 30 : 3;
    if (
      k.gold <
      cost +
        (u.team !== 0 && u.order === "auto" ? buildingReserve(s, u.team) : 0)
    )
      return;
    k.gold -= cost;
    t.terrain = "grass";
    injure(u, 3);
    s.stats.cleared++;
    return;
  }
  const occupants = s.units.filter(
    (v) => v.id !== u.id && v.hp > 0 && v.x === dest!.x && v.y === dest!.y,
  );
  for (const other of occupants) {
    if (other.hp <= 0) continue;
    if (u.order === "rest" && other.team !== u.team) return;
    if (
      other.team === u.team &&
      !u.royal &&
      !other.royal &&
      t.house !== undefined &&
      u.order !== "merge"
    )
      continue;
    const winner = resolveEncounter(s, u, other);
    if (u.royal && u.hp <= 0) destroyKingdom(s, u.team, other.team);
    if (other.royal && other.hp <= 0) destroyKingdom(s, other.team, u.team);
    if (winner !== u || u.hp <= 0) return;
  }
  injure(u, destroyTurf(s, dest, u.team));
  if (u.hp <= 0) return;
  const house = s.houses.find((h) => h.id === t.house);
  if (house && house.team !== u.team) {
    s.houses = s.houses.filter((h) => h.id !== house.id);
    delete t.house;
    injure(u, u.royal ? 8 : 12);
    log(
      s,
      u.royal
        ? "Le roi rase une maison adverse."
        : "Une maison adverse est détruite.",
      u.team,
    );
    if (u.hp <= 0) return;
  }
  u.heading = { x: dest.x - u.x, y: dest.y - u.y };
  u.x = dest.x;
  u.y = dest.y;
  if (!u.royal && !resting(s, u)) u.hp -= 0.32;
  if (
    (u.order === "move" || u.order === "attack") &&
    u.target &&
    distance(u, u.target) === 0
  ) {
    u.order = "hold";
    delete u.target;
  }
}
export function step(s: State, dt = 0.2) {
  if (s.result !== "playing") return;
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
    k.gold +=
      dt *
      (0.13 +
        hs * k.tax * 0.012 +
        s.tiles.filter((t) => t.terrain === "dam" && t.owner === k.id).length *
          0.2);
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
  const coverage = new Map<number, number>();
  for (const k of s.kingdoms) {
    if (!k.alive) continue;
    const needed = maintenanceCost(s, k.id) * dt,
      paid = Math.min(k.gold, needed);
    k.gold -= paid;
    coverage.set(k.id, needed ? paid / needed : 1);
  }
  for (const u of s.units) {
    if (u.hp <= 0 || !s.kingdoms[u.team].alive) continue;
    u.age += dt;
    if (unitUpkeep(u) > 0) {
      u.hp -= u.hp * 0.03 * (1 - (coverage.get(u.team) ?? 1)) * dt;
      if (u.hp <= 0) continue;
    }
    const upkeep = lifeDrain(s, u);
    if (u.royal) injure(u, dt * upkeep);
    else u.hp -= dt * upkeep;
    u.wait -= dt;
    if (u.hp > 0 && u.wait <= 0) {
      u.wait = 0.42 + random(s) * 0.28;
      act(s, u);
    }
  }
  tickMonsters(s, dt);
  for (const k of s.kingdoms) {
    const king = s.units.find((u) => u.team === k.id && u.royal);
    if (k.alive && (!king || king.hp <= 0)) destroyKingdom(s, k.id, k.id);
  }
  s.units = s.units.filter((u) => u.hp > 0 && s.kingdoms[u.team].alive);
  refreshKings(s);
  for (const k of s.kingdoms)
    if (
      k.alive &&
      !s.houses.some((h) => h.team === k.id) &&
      !s.units.some((u) => u.team === k.id && !u.royal && u.hp > 0)
    )
      destroyKingdom(s, k.id, k.id);
  s.units = s.units.filter((u) => u.hp > 0 && s.kingdoms[u.team].alive);
  if (!s.kingdoms[0].alive) s.result = "lost";
  else if (s.kingdoms.slice(1).every((k) => !k.alive)) s.result = "won";
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
      "bridge",
      "dam",
      "barricade",
      "hold",
      "rest",
      "shelter",
      "defend",
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
          (u.pursue === undefined || int(u.pursue)) &&
          (u.pursueTeam === undefined || faction(u.pursueTeam)) &&
          (!u.royal ||
            (typeof u.reserve === "number" && Number.isFinite(u.reserve))) &&
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
          Array.isArray(b.cells) &&
          b.cells.length === 1 &&
          b.cells.every(
            (p) => point(p) && tile(s, p.x, p.y)?.terrain === b.kind,
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
    return s;
  } catch {
    return;
  }
}
