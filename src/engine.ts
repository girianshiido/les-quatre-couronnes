export type Terrain =
  "grass" | "tree" | "rock" | "water" | "bridge" | "dam" | "barricade";
export type Order =
  | "auto"
  | "move"
  | "merge"
  | "house"
  | "bridge"
  | "dam"
  | "barricade"
  | "hold"
  | "rest";
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
}
export interface House extends Point {
  id: number;
  team: number;
  timer: number;
  founded: number;
}
export interface Kingdom {
  id: number;
  gold: number;
  wood: number;
  stone: number;
  tax: number;
  automatic: boolean;
  bridgeSaving: boolean;
  alive: boolean;
  hp: number;
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
export interface State {
  version: 2;
  size: number;
  level: number;
  seed: number;
  rng: number;
  time: number;
  nextId: number;
  tiles: Tile[];
  units: Unit[];
  houses: House[];
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
export const LEVELS = [
  { name: "La vallée des premiers jours", biome: "Forêt & montagne", size: 80 },
  { name: "Les oasis du soleil", biome: "Désert & palmeraies", size: 80 },
  { name: "Les couronnes du givre", biome: "Terres enneigées", size: 88 },
  { name: "Le bassin des brumes", biome: "Marais & cyprès", size: 88 },
  { name: "La vallée de cristal", biome: "Forêt cristalline", size: 96 },
];
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
  const size = LEVELS[level]?.size ?? 80;
  const s: State = {
    version: 2,
    size,
    level,
    seed,
    rng: seed >>> 0,
    time: 0,
    nextId: 1,
    tiles: [],
    units: [],
    houses: [],
    kingdoms: [],
    events: [],
    structures: [],
    bridgeSites: [],
    ruins: [],
    result: "playing",
    stats: { cleared: 0, bridges: 0, dams: 0, merged: 0 },
  };
  // Mirrored vegetation and equally cleared starting areas balance the four kingdoms.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ax = Math.min(x, size - 1 - x),
        ay = Math.min(y, size - 1 - y);
      let hashBits =
        (Math.imul(ax + 37, 73856093) ^ Math.imul(ay + seed, 19349663)) >>> 0;
      hashBits = Math.imul(hashBits ^ (hashBits >>> 16), 0x45d9f3b);
      hashBits = Math.imul(hashBits ^ (hashBits >>> 16), 0x45d9f3b);
      const hash = ((hashBits ^ (hashBits >>> 16)) >>> 0) / 4294967296;
      const forest =
        (Math.sin(ax * 0.31) +
          Math.cos(ay * 0.26) +
          Math.sin((ax + ay) * 0.22)) /
        3;
      const density =
        [0.29, 0.16, 0.23, 0.4, 0.28][level] +
        forest * [0.24, 0.1, 0.2, 0.16, 0.24][level];
      const riverX = size / 2 - 1 + Math.round(Math.sin(y * 0.16) * 2),
        riverY = size / 2 - 1 + Math.round(Math.sin(x * 0.16) * 2);
      const river =
        level === 0
          ? x === riverX || y === riverY
          : Math.abs(x - riverX) < 1.3 ||
            Math.abs(y - riverY) < 1.3 ||
            (level === 3 &&
              (x - size * 0.32) ** 2 + (y - size * 0.62) ** 2 < 20);
      const mountains =
        ((ax < 5 || ay < 5) && hash < 0.64) ||
        (Math.sin(ax * 0.32 - ay * 0.14) + Math.cos(ay * 0.29) > 1.25 &&
          hash < 0.36);
      s.tiles.push({
        terrain: river
          ? "water"
          : mountains
            ? "rock"
            : hash < density
              ? "tree"
              : hash < density + 0.055
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
    const c = bases[team];
    s.kingdoms.push({
      id: team,
      gold: 5000,
      wood: 32,
      stone: 18,
      tax: 12,
      automatic: true,
      bridgeSaving: false,
      alive: true,
      hp: 100,
      castle: c,
      births: 0,
      kills: 0,
    });
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -7; dx <= 7; dx++)
        tile(s, c.x + dx, c.y + dy)!.terrain = "grass";
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        tile(s, c.x + dx, c.y + dy)!.castle = team;
    const houseOffsets =
      level === 0
        ? team === 0
          ? [
              [-4, -3],
              [3, -4],
              [-3, 4],
              [4, 3],
              [0, 5],
            ]
          : [
              [-4, -3],
              [4, 3],
            ]
        : [
            [-4, -3],
            [3, -4],
            [-3, 4],
            [4, 3],
          ];
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
  log(s, "Quatre couronnes. Une seule vallée. L’histoire commence.");
  return s;
}
export function canHouse(s: State, x: number, y: number) {
  const t = tile(s, x, y);
  if (
    !t ||
    t.terrain !== "grass" ||
    t.house !== undefined ||
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
  if (!k.alive || !canHouse(s, x, y) || (pay && k.gold < 100)) return false;
  if (pay) {
    k.gold -= 100;
  }
  const h = {
    id: s.nextId++,
    team,
    x,
    y,
    timer: pay ? 2 : random(s) * 6,
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
  return (
    !!h &&
    h.team === u.team &&
    (u.order === "hold" ||
      (u.order === "rest" && !!u.target && distance(u, u.target) === 0) ||
      (u.order === "merge" && !!u.target && distance(u, u.target) === 0) ||
      (!!u.royal && u.order === "auto"))
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
  const af = 1,
    bf = sheltered(s, b) ? 4 : 1;
  if (a.hp * af === b.hp * bf) {
    injure(a, a.hp);
    injure(b, b.hp);
    return null;
  }
  const win = a.hp * af > b.hp * bf ? a : b,
    lose = win === a ? b : a,
    wf = win === a ? af : bf,
    lf = win === a ? bf : af;
  injure(win, Math.min(win.hp - 1, (lose.hp * lf * 0.7) / wf));
  injure(lose, lose.hp);
  s.kingdoms[win.team].kills++;
  return win;
}
// Shortest path on the hidden four-neighbour lattice. Clearing obstacles is allowed; water is not.
export function nextStep(
  s: State,
  start: Point,
  goal: Point,
  team: number,
  peaceful = false,
): Point | undefined {
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
      if (!walkable(s, nx, ny, team)) continue;
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
  for (const d of [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]) {
    const cells: Point[] = [p],
      banks: Point[] = [];
    for (const sign of [-1, 1]) {
      let n = 1;
      while (
        n <= 6 &&
        tile(s, p.x + d.x * n * sign, p.y + d.y * n * sign)?.terrain === "water"
      ) {
        cells.push({ x: p.x + d.x * n * sign, y: p.y + d.y * n * sign });
        n++;
      }
      const bank = { x: p.x + d.x * n * sign, y: p.y + d.y * n * sign };
      if (walkable(s, bank.x, bank.y, -1)) banks.push(bank);
    }
    if (banks.length === 2 && cells.length <= 6) return { cells, banks };
  }
  return;
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
    t.castle === undefined &&
    !s.units.some((u) => u.hp > 0 && u.x === p.x && u.y === p.y)
  );
}
export function buildBarricade(s: State, u: Unit, p: Point) {
  const k = s.kingdoms[u.team];
  if (
    u.royal ||
    distance(u, p) !== 1 ||
    !canBarricade(s, p) ||
    k.gold < 750 ||
    k.wood < 12
  )
    return false;
  k.gold -= 750;
  k.wood -= 12;
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
  const k = s.kingdoms[u.team];
  if (k.gold < 1) return false;
  k.gold -= 1;
  const proxy: Unit = {
    id: -b.id,
    team: b.team,
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
  if (t.terrain === "rock" || t.terrain === "barricade") return false;
  const building = structureAt(s, p);
  if (building && building.team !== u.team) return false;
  if (t.castle !== undefined && t.castle !== u.team) return false;
  if (
    t.house !== undefined &&
    s.houses.find((h) => h.id === t.house)?.team !== u.team
  )
    return false;
  return !s.units.some(
    (v) => v.hp > 0 && v.team !== u.team && v.x === p.x && v.y === p.y,
  );
}
export function buildCrossing(s: State, u: Unit, p: Point, dam = false) {
  const cr = crossing(s, p),
    k = s.kingdoms[u.team];
  if (
    !cr ||
    !cr.banks.some((b) => distance(u, b) <= 1) ||
    k.gold < (dam ? 32 : bridgeCost(s, p)) ||
    k.wood < cr.cells.length * 4 ||
    (dam && k.stone < 12)
  )
    return false;
  k.gold -= dam ? 32 : bridgeCost(s, p);
  k.wood -= cr.cells.length * 4;
  if (dam) k.stone -= 12;
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
  for (const u of us) {
    u.order = order;
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
    t.terrain === "barricade"
  )
    return false;
  if (t.castle !== undefined && t.castle !== team) return false;
  if (
    t.house !== undefined &&
    s.houses.find((h) => h.id === t.house)?.team !== team
  )
    return false;
  return t.terrain !== "bridge" || t.owner === team;
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
  const key = `${s.stats.cleared}-${s.stats.bridges}-${s.stats.dams}-${s.structures.map((b) => b.id).join(".")}-${s.ruins.length}-${s.houses.reduce((n, h) => n + h.id * (h.team + 1), 0)}`;
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
    ((work.trees && k.gold >= 2) ||
      (work.land && k.gold >= 100 + (k.bridgeSaving ? 1000 : 0)));
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
function act(s: State, u: Unit) {
  const k = s.kingdoms[u.team];
  if (!k.alive || u.hp <= 0) return;
  if (u.order === "hold" || (u.royal && u.order === "auto")) return;
  updateRest(s, u);
  let target = u.target;
  if (u.order === "rest" && target && distance(u, target) === 0) return;
  if (u.order === "barricade" && target && distance(u, target) <= 1) {
    if (!buildBarricade(s, u, target) && !canBarricade(s, target)) {
      u.order = "auto";
      delete u.target;
    }
    return;
  }
  if ((u.order === "bridge" || u.order === "dam") && target) {
    if (buildCrossing(s, u, target, u.order === "dam")) return;
    const cr = crossing(s, target);
    if (!cr) {
      u.order = "auto";
      u.target = undefined;
      return;
    }
    if (cr.banks.some((b) => distance(u, b) <= 1)) return;
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
  if (u.order === "move" && target && distance(u, target) === 0) {
    u.order = "hold";
    u.target = undefined;
    return;
  }
  if (
    !u.royal &&
    u.order === "auto" &&
    u.age > 1.2 &&
    u.hp >= 42 &&
    k.gold >=
      100 +
        (k.bridgeSaving ||
        (u.team !== 0 &&
          s.time > 45 &&
          !s.structures.some((b) => b.kind === "bridge" && b.team === u.team))
          ? 1000
          : 0) &&
    random(s) < 0.72 &&
    addHouse(s, u.team, u.x, u.y)
  ) {
    u.hp = 0;
    return;
  }
  // Independent wandering with a growing outward bias. Every inhabitant still makes local random choices.
  let dest = target
    ? nextStep(s, u, target, u.team, u.order === "rest")
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
              : Math.min(1.3, s.time / 180)
            : 0) -
          (tile(s, p.x, p.y)?.terrain === "barricade" ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.p;
    // Only opponents initiate infrastructure work without a direct order.
    if (u.team !== 0 && s.time > 65 && random(s) < 0.12) {
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
  const structure = structureAt(s, dest);
  if (structure && structure.team !== u.team) {
    attackStructure(s, u, structure);
    return;
  }
  if (t.terrain === "barricade") return;
  if (t.terrain === "tree" || t.terrain === "rock") {
    const cost = t.terrain === "tree" ? 2 : 3;
    if (k.gold < cost) return;
    k.gold -= cost;
    k[t.terrain === "tree" ? "wood" : "stone"] += t.terrain === "tree" ? 5 : 4;
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
      u.order === "rest" &&
      other.team === u.team &&
      !other.royal &&
      t.house !== undefined
    )
      continue;
    if (other.team !== u.team) {
      if (k.gold < 1) return;
      k.gold -= 1;
    }
    const winner = resolveEncounter(s, u, other);
    if (u.royal && u.hp <= 0) destroyKingdom(s, u.team, other.team);
    if (other.royal && other.hp <= 0) destroyKingdom(s, other.team, u.team);
    if (winner !== u || u.hp <= 0) return;
  }
  const house = s.houses.find((h) => h.id === t.house);
  if (house && house.team !== u.team) {
    if (u.royal) {
      s.houses = s.houses.filter((h) => h.id !== house.id);
      t.house = undefined;
      injure(u, 8);
      log(s, "Le roi rase une maison adverse.", u.team);
    } else {
      const defenders = s.units.some(
        (other) =>
          other.team === house.team &&
          other.hp > 0 &&
          distance(other, house) < 2,
      );
      if (!defenders) {
        house.team = u.team;
        house.timer = 0;
        house.founded = s.time;
        u.hp -= 12;
        log(s, "Une maison change de bannière.", u.team);
      }
    }
  }
  u.heading = { x: dest.x - u.x, y: dest.y - u.y };
  u.x = dest.x;
  u.y = dest.y;
  if (!u.royal) u.hp -= 0.32;
  if (u.order === "move" && u.target && distance(u, u.target) === 0) {
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
        k.gold < 300 ? 24 : k.gold > 1200 ? 4 : us < hs * 1.5 ? 8 : 14;
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
    h.timer += dt;
    const k = s.kingdoms[h.team];
    const interval = (10 + k.tax * 0.72) / (h.team ? 1 + s.level * 0.1 : 1);
    if (h.timer >= interval) {
      h.timer -= interval;
      spawn(s, h);
    }
  }
  for (const u of s.units) {
    u.age += dt;
    if (u.royal) {
      if (!sheltered(s, u) && !resting(s, u))
        injure(u, dt * Math.max(4, u.hp * 0.05));
    } else if (!resting(s, u)) u.hp -= dt * 0.12;
    u.wait -= dt;
    if (u.hp > 0 && u.wait <= 0) {
      u.wait = 0.42 + random(s) * 0.28;
      act(s, u);
    }
  }
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
    const num = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0;
    const int = (n: unknown) => num(n) && Number.isInteger(n);
    const team = (n: unknown) => int(n) && (n as number) < 4;
    const point = (p: Point) =>
      p && int(p.x) && int(p.y) && p.x < s.size && p.y < s.size;
    const orders = [
      "auto",
      "move",
      "merge",
      "house",
      "bridge",
      "dam",
      "barricade",
      "hold",
      "rest",
    ];
    if (
      s.version !== 2 ||
      !int(s.size) ||
      s.size < 32 ||
      s.size > 128 ||
      !int(s.level) ||
      s.level >= LEVELS.length ||
      s.size !== LEVELS[s.level].size ||
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
          (t.owner === undefined || team(t.owner)) &&
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
          num(k.wood) &&
          num(k.stone) &&
          num(k.tax) &&
          k.tax <= 30 &&
          typeof k.automatic === "boolean" &&
          typeof k.bridgeSaving === "boolean" &&
          typeof k.alive === "boolean" &&
          num(k.hp) &&
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
          team(e.team) &&
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
          team(b.team) &&
          num(b.hp) &&
          b.hp > 0 &&
          num(b.maxHp) &&
          b.maxHp > 0 &&
          b.hp <= b.maxHp &&
          Array.isArray(b.cells) &&
          b.cells.length > 0 &&
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
    return s;
  } catch {
    return;
  }
}
