import {
  type State,
  type Unit,
  type Point,
  type Cave,
  type Monster,
  LEVELS,
  tile,
  random,
  distance,
  resolveEncounter,
  log,
  destroyStructure,
  destroyTurf,
  houseDestructionCost,
  razeHouse,
} from "./engine";
const proxy = (m: Monster): Unit => ({
  id: m.id,
  team: 4,
  x: m.x,
  y: m.y,
  hp: m.hp,
  age: 0,
  wait: 0,
  order: "auto",
  heading: m.heading,
});
export function spawnMonster(s: State, c: Cave) {
  if (s.monsters.length >= 100) return;
  const p = [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ].filter((p) => monsterCanMove(s, p));
  if (!p.length) return;
  const at = p[Math.floor(random(s) * p.length)];
  s.monsters.push({
    id: s.nextId++,
    ...at,
    hp: c.spawnHp,
    wait: random(s),
    heading: { x: 0, y: 0 },
    cave: c.id,
  });
}
export function seedCaves(s: State) {
  if (!LEVELS[s.level].caves) return;
  const count = LEVELS[s.level].stage === 4 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const preferred = {
      x: Math.floor(s.size * (i ? 0.73 : 0.25)),
      y: s.size === 48 ? (i ? 24 : 23) : Math.floor(s.size * (i ? 0.47 : 0.52)),
    };
    // Compact maps still need enclosed monster areas, without erasing a kingdom's buildings.
    const extent = s.size <= 48 ? 5 : 6;
    const candidates: Point[] = [];
    for (let y = 6; y < s.size - 6; y++)
      for (let x = 6; x < s.size - 6; x++) candidates.push({ x, y });
    candidates.sort((a, b) => distance(a, preferred) - distance(b, preferred));
    const center = candidates.find((p) => {
      if (
        s.caves.some(
          (c) =>
            Math.abs(c.x - p.x) <= extent * 2 + 1 &&
            Math.abs(c.y - p.y) <= extent * 2 + 1,
        )
      )
        return false;
      for (let dy = -extent; dy <= extent; dy++)
        for (let dx = -extent; dx <= extent; dx++) {
          const t = tile(s, p.x + dx, p.y + dy);
          if (
            !t ||
            t.house !== undefined ||
            t.castle !== undefined ||
            t.cave !== undefined
          )
            return false;
        }
      return true;
    });
    if (!center) continue;
    const { x, y } = center;
    for (let dy = -extent; dy <= extent; dy++)
      for (let dx = -extent; dx <= extent; dx++) {
        const t = tile(s, x + dx, y + dy);
        if (!t) continue;
        t.terrain =
          Math.max(Math.abs(dx), Math.abs(dy)) === 5 ? "water" : "grass";
        delete t.owner;
      }
    for (const [dx, dy] of [
      [6, 0],
      [-6, 0],
      [0, 6],
      [0, -6],
    ]) {
      const t = tile(s, x + dx, y + dy);
      if (
        t &&
        t.house === undefined &&
        t.castle === undefined &&
        t.cave === undefined
      )
        t.terrain = "grass";
    }
    const c: Cave = {
      id: s.nextId++,
      x,
      y,
      hp: 1500,
      maxHp: 1500,
      timer: 0,
      interval: 35 - LEVELS[s.level].biomeId * 2.5,
      spawnHp: 100 + LEVELS[s.level].biomeId * 25,
    };
    s.caves.push(c);
    tile(s, x, y)!.cave = c.id;
    if ((s.level + i) % 2) {
      const p = { x: x + (i ? -5 : 5), y };
      const t = tile(s, p.x, p.y)!;
      t.terrain = "barricade";
      t.owner = 4;
      s.structures.push({
        id: s.nextId++,
        kind: "barricade",
        team: 4,
        hp: 1500,
        maxHp: 1500,
        cells: [p],
      });
    }
    spawnMonster(s, c);
  }
  log(
    s,
    "Des grottes abritent des monstres. Ouvrir leur enclos peut bouleverser la vallée.",
    4,
  );
}
export function monsterCanMove(s: State, p: Point) {
  const t = tile(s, p.x, p.y);
  return (
    !!t &&
    !["water", "dam", "rock"].includes(t.terrain) &&
    t.cave === undefined &&
    !(t.terrain === "barricade" && t.owner === 4)
  );
}
export function attackMonster(s: State, u: Unit, m: Monster) {
  const defender = proxy(m);
  resolveEncounter(s, u, defender);
  m.hp = defender.hp;
  if (m.hp <= 0) s.monsters = s.monsters.filter((v) => v.id !== m.id);
  return u.hp > 0 && m.hp <= 0;
}
export function attackCave(s: State, u: Unit, c: Cave) {
  const defender: Unit = {
    id: c.id,
    team: 4,
    x: c.x,
    y: c.y,
    hp: c.hp,
    age: 0,
    wait: 0,
    order: "hold",
    heading: { x: 0, y: 0 },
  };
  resolveEncounter(s, u, defender);
  c.hp = defender.hp;
  if (c.hp <= 0) {
    s.stats.cleared++;
    s.caves = s.caves.filter((v) => v.id !== c.id);
    delete tile(s, c.x, c.y)!.cave;
    log(s, "Une grotte est détruite. Plus aucun monstre n’en sortira.", u.team);
  }
  return u.hp > 0 && c.hp <= 0;
}
function contact(s: State, m: Monster, p: Point) {
  for (const other of s.monsters)
    if (
      other.id !== m.id &&
      other.hp > 0 &&
      other.x === p.x &&
      other.y === p.y
    ) {
      m.hp += other.hp;
      other.hp = 0;
      s.stats.merged++;
    }
  for (const u of s.units)
    if (u.hp > 0 && u.x === p.x && u.y === p.y) {
      const attacker = proxy(m);
      resolveEncounter(s, attacker, u);
      m.hp = attacker.hp;
      if (m.hp <= 0) return false;
    }
  return true;
}
export function tickMonsters(s: State, dt: number) {
  for (const c of s.caves) {
    c.timer += dt;
    if (c.timer >= c.interval) {
      c.timer -= c.interval;
      spawnMonster(s, c);
    }
  }
  for (const m of s.monsters) {
    if (m.hp <= 0) continue;
    m.wait -= dt;
    if (m.wait > 0) continue;
    m.wait = 0.6 + random(s) * 0.35;
    if (!contact(s, m, m)) continue;
    const options = [
      { x: m.x + 1, y: m.y },
      { x: m.x - 1, y: m.y },
      { x: m.x, y: m.y + 1 },
      { x: m.x, y: m.y - 1 },
    ].filter((p) => monsterCanMove(s, p));
    const dest = options
      .map((p) => ({
        p,
        score:
          random(s) * 3 +
          (p.x - m.x === m.heading.x && p.y - m.y === m.heading.y ? 1.2 : 0) -
          (tile(s, p.x, p.y)?.terrain === "barricade" ? 3 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0]?.p;
    if (!dest) continue;
    const t = tile(s, dest.x, dest.y)!;
    if (t.terrain === "barricade") {
      const b = s.structures.find((b) =>
        b.cells.some((p) => p.x === dest.x && p.y === dest.y),
      );
      if (!b) continue;
      const attacker = proxy(m),
        defender: Unit = {
          id: -b.id,
          team: b.team,
          hp: b.hp,
          x: dest.x,
          y: dest.y,
          age: 0,
          wait: 0,
          order: "hold",
          heading: { x: 0, y: 0 },
        };
      resolveEncounter(s, attacker, defender);
      m.hp = attacker.hp;
      b.hp = defender.hp;
      if (b.hp <= 0) destroyStructure(s, b);
      continue;
    }
    if (!contact(s, m, dest)) continue;
    m.hp -= destroyTurf(s, dest, 4, m.hp);
    if (m.hp <= 0) continue;
    if (t.house !== undefined) {
      const house = s.houses.find((h) => h.id === t.house);
      if (house) razeHouse(s, house);
      m.hp -= houseDestructionCost(m.hp);
      log(s, "Un monstre détruit une maison.", 4);
    }
    if (m.hp <= 0) continue;
    m.heading = { x: dest.x - m.x, y: dest.y - m.y };
    m.x = dest.x;
    m.y = dest.y;
  }
  s.monsters = s.monsters.filter((m) => m.hp > 0);
}
