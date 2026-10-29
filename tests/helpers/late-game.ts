import { createGame, addHouse, tile, step, type Unit } from "../../src/engine";
export function lateGame() {
  const s = createGame();
  const kings = s.units
    .filter((u) => u.royal && u.team < 2)
    .map((u) => ({ ...u }));
  s.units = kings;
  s.houses = [];
  s.structures = [];
  s.caves = [];
  s.monsters = [];
  s.ruins = [];
  s.bridgeSites = [];
  for (const t of s.tiles) {
    t.terrain = "water";
    delete t.permanent;
    delete t.house;
    delete t.castle;
    delete t.cave;
  }
  s.kingdoms.forEach((k, i) => {
    k.alive = i < 2;
    k.automatic = false;
    k.tax = 30;
    k.gold = 0;
  });
  s.kingdoms[0].castle = { x: 5, y: 20 };
  s.kingdoms[1].castle = { x: 35, y: 20 };
  for (const u of kings) {
    const c = s.kingdoms[u.team].castle;
    u.x = c.x;
    u.y = c.y;
    u.order = "hold";
    for (let y = c.y - 1; y <= c.y + 1; y++)
      for (let x = c.x - 1; x <= c.x + 1; x++) {
        const t = tile(s, x, y)!;
        t.terrain = "grass";
        t.castle = u.team;
      }
  }
  for (let x = 7; x <= 31; x++) tile(s, x, 20)!.terrain = "grass";
  for (let x = 8; x <= 28; x += 2)
    if (!addHouse(s, 0, x, 20, false)) throw Error("own house");
  if (!addHouse(s, 1, 30, 20, false)) throw Error("enemy house");
  for (const h of s.houses) h.timer = 0;
  s.doctrine = "conqueror";
  const weak: Unit = {
    id: s.nextId++,
    team: 0,
    x: 8,
    y: 20,
    hp: 100,
    age: 10,
    wait: 0.6,
    order: "auto",
    target: { x: 30, y: 20 },
    heading: { x: 1, y: 0 },
  };
  const strong: Unit = {
    id: s.nextId++,
    team: 0,
    x: 28,
    y: 20,
    hp: 5000,
    age: 10,
    wait: 0,
    order: "auto",
    heading: { x: 1, y: 0 },
  };
  s.units.push(weak, strong);
  return { s, claimant: weak, army: strong, house: s.houses.at(-1)! };
}

export function advance(s: ReturnType<typeof createGame>, seconds: number) {
  for (let i = 0; i < seconds * 5 && s.result === "playing"; i++) step(s);
}
