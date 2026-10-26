import {
  createGame,
  step,
  LEVELS,
  spawn,
  maintenanceCost,
} from "../src/engine.ts";
import { performance } from "node:perf_hooks";
for (const size of [80, 64]) {
  const previous = LEVELS[0].size;
  LEVELS[0].size = size;
  const s = createGame(0, 14243);
  LEVELS[0].size = previous;
  let total = 0,
    max = 0,
    peak = 0;
  for (let i = 0; i < 1200 && s.result === "playing"; i++) {
    const before = performance.now();
    step(s);
    const ms = performance.now() - before;
    total += ms;
    max = Math.max(max, ms);
    peak = Math.max(peak, s.units.length);
  }
  console.log(
    JSON.stringify({
      size,
      time: Math.round(s.time),
      meanStepMs: Number((total / (s.time / 0.2)).toFixed(2)),
      maxStepMs: Number(max.toFixed(2)),
      peakUnits: peak,
      kingdoms: s.kingdoms.map((k) => ({
        team: k.id,
        houses: s.houses.filter((h) => h.team === k.id).length,
        births: k.births,
        gold: Math.round(k.gold),
        bridges: s.structures.filter(
          (b) => b.team === k.id && b.kind === "bridge",
        ).length,
      })),
    }),
  );
}
const pathState = createGame(0, 14243);
const goal = { x: 12, y: 47 };
for (const t of pathState.tiles) t.terrain = "grass";
const { nextStep } = await import("../src/engine.ts");
for (const formation of [false, true]) {
  const starts = Array.from({ length: 100 }, (_, i) => ({
    id: 10000 + i,
    team: 0,
    x: 5 + (i % 8),
    y: 5 + Math.floor(i / 8),
    hp: 100,
    age: 0,
    wait: 0,
    order: "move" as const,
    heading: { x: 0, y: 0 },
    formation,
  }));
  const start = performance.now();
  for (let round = 0; round < 10; round++)
    for (const u of starts) nextStep(pathState, u, goal, 0);
  console.log(
    JSON.stringify({
      pathQueries: 1000,
      sharedPath: formation,
      elapsedMs: Number((performance.now() - start).toFixed(2)),
    }),
  );
}
