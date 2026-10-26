export const DEFAULT_PRIORITIES = ["house", "raid", "clear"] as const;
export type Priority = (typeof DEFAULT_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  house: "Construire sur un terrain libre",
  raid: "Détruire les maisons adverses",
  clear: "Couper les arbres",
};
export function validPriorities(value: unknown): value is Priority[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_PRIORITIES.length &&
    new Set(value).size === DEFAULT_PRIORITIES.length &&
    value.every((p) => DEFAULT_PRIORITIES.includes(p))
  );
}
