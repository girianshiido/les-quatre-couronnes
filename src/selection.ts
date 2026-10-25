import type { Unit, Point } from "./engine";
export function rectangleSelection(
  units: Unit[],
  previous: ReadonlySet<number>,
  box: { x: number; y: number; w: number; h: number },
  project: (u: Unit) => Point,
  additive = false,
) {
  const next = new Set(
    additive
      ? [...previous].filter((id) =>
          units.some((u) => u.id === id && u.team === 0 && !u.royal),
        )
      : [],
  );
  for (const u of units) {
    if (u.team !== 0 || u.royal) continue;
    const p = project(u);
    if (
      p.x >= box.x &&
      p.x <= box.x + box.w &&
      p.y >= box.y &&
      p.y <= box.y + box.h
    )
      next.add(u.id);
  }
  return next;
}
export function clickSelection(
  units: Unit[],
  previous: ReadonlySet<number>,
  chosen: Unit | undefined,
  additive = false,
) {
  if (!chosen) return new Set(additive ? previous : []);
  if (chosen.royal) return new Set([chosen.id]);
  const next = new Set(
    additive
      ? [...previous].filter((id) =>
          units.some((u) => u.id === id && !u.royal && u.team === 0),
        )
      : [],
  );
  next.add(chosen.id);
  return next;
}
