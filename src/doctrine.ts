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

export const DOCTRINES = {
  builder: {
    name: "Bâtisseur",
    reserve: 0,
    restBelow: 42,
    weights: { house: 9, raid: 1, clear: 4 },
    description:
      "Développe le royaume et économise pour les maisons. Les petites unités bâtissent ; les fortes restent disponibles pour défendre ou conquérir. Les combats inutiles sont évités.",
  },
  conqueror: {
    name: "Conquérant",
    reserve: 0,
    restBelow: 42,
    weights: { house: 3, raid: 10, clear: 2 },
    description:
      "Les forces importantes cherchent les maisons adverses dès qu’un passage existe. Une partie des habitants continue de bâtir et de dégager du terrain pour soutenir l’offensive.",
  },
  guardian: {
    name: "Gardien",
    reserve: 750,
    restBelow: 50,
    weights: { house: 6, raid: 1, clear: 3 },
    description:
      "Développe les terres proches et poste la plupart des unités fortes sur des maisons près des ponts ou de la frontière. Garde 750 or pour les chantiers. Les barricades restent à placer sur ordre.",
  },
  prudent: {
    name: "Prudent",
    reserve: 1000,
    restBelow: 70,
    weights: { house: 6, raid: 0.5, clear: 1 },
    description:
      "Garde une réserve de 1 000 or, abrite plus tôt les habitants affaiblis et développe le royaume à un rythme mesuré. Les ordres manuels peuvent utiliser la réserve.",
  },
} as const;
export type DoctrineId = keyof typeof DOCTRINES | "custom";
export function validDoctrine(value: unknown): value is DoctrineId {
  return (
    value === "custom" ||
    (typeof value === "string" && Object.hasOwn(DOCTRINES, value))
  );
}
