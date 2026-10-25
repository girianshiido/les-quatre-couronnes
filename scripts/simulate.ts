import { createGame, step } from "../src/engine.ts";
for (const seed of [14243, 98914, 5321]) {
  const s = createGame(0, seed);
  for (let i = 0; i < 9000 && s.result === "playing"; i++) step(s);
  console.log(
    JSON.stringify({
      seed,
      time: Math.round(s.time),
      result: s.result,
      stats: s.stats,
      kingdoms: s.kingdoms.map((k) => ({
        id: k.id,
        hp: Math.round(k.hp),
        births: k.births,
        kills: k.kills,
        houses: s.houses.filter((h) => h.team === k.id).length,
        units: s.units.filter((u) => u.team === k.id).length,
      })),
    }),
  );
}
