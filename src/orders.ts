import {
  type State,
  type Unit,
  type Point,
  type Order,
  tile,
  crossing,
  nextStep,
  canHouse,
  canBarricade,
  bridgeCost,
  structureAt,
  territoryAt,
  combatPower,
  distance,
  CLEARING_COSTS,
} from "./engine";
export interface DestinationAction {
  order: Order;
  label: string;
  disabled: boolean;
  workerId?: number;
}
export function destinationActions(
  s: State,
  units: Unit[],
  p: Point,
): DestinationAction[] {
  const t = tile(s, p.x, p.y);
  if (!t || t.permanent || !units.length) return [];
  const gold = s.kingdoms[0].gold,
    workers = units.filter((u) => !u.royal).sort((a, b) => a.hp - b.hp);
  const reachable = (u: Unit, q: Point) =>
    distance(u, q) === 0 || !!nextStep(s, u, q, 0);
  const someReach = units.some((u) => reachable(u, p));
  const action = (
    order: Order,
    label: string,
    cost = 0,
    workerId?: number,
  ): DestinationAction => ({ order, label, disabled: gold < cost, workerId });
  const site = structureAt(s, p);
  if (site?.construction) {
    if (site.team !== 0)
      return [
        action("attack", "Détruire le chantier"),
        ...(site.kind === "barricade" && workers.length
          ? [action("demolish-many", "Détruire les barricades en continu")]
          : []),
      ];
    const banks =
      site.kind === "bridge"
        ? (crossing(s, p)?.banks ?? [])
        : [
            { x: p.x - 1, y: p.y },
            { x: p.x + 1, y: p.y },
            { x: p.x, y: p.y - 1 },
            { x: p.x, y: p.y + 1 },
          ].filter(
            (q) =>
              tile(s, q.x, q.y) &&
              !["water", "dam", "barricade"].includes(
                tile(s, q.x, q.y)!.terrain,
              ),
          );
    const worker = workers.find((u) => banks.some((q) => reachable(u, q)));
    return [
      ...(worker
        ? [
            action(
              site.kind,
              `Terminer ${site.kind === "bridge" ? "le pont" : "la barricade"} · ${Math.ceil(site.construction.total - site.construction.paid)} or restants`,
              0,
              worker.id,
            ),
          ]
        : []),
      action("attack", "Détruire le chantier"),
      ...(site.kind === "barricade" && workers.length
        ? [action("demolish-many", "Détruire les barricades en continu")]
        : []),
    ];
  }
  if (t.terrain === "water") {
    const c = crossing(s, p),
      worker = c && workers.find((u) => c.banks.some((b) => reachable(u, b)));
    return worker
      ? [
          action(
            "bridge",
            `Construire un pont · ${bridgeCost(s, p)} or · progressif`,
            0,
            worker.id,
          ),
        ]
      : [];
  }
  const structure = structureAt(s, p);
  if (structure) {
    if (structure.kind === "barricade")
      return [
        action(
          "attack",
          `Détruire la barricade · ${Math.ceil(structure.hp)} PV`,
        ),
        ...(workers.length
          ? [action("demolish-many", "Détruire les barricades en continu")]
          : []),
      ];
    const list = [
      action("move", "Traverser le pont"),
      action("attack", `Détruire le pont · ${Math.ceil(structure.hp)} PV`),
    ];
    if (
      structure.team === 0 &&
      !s.units.some((u) => u.x === p.x && u.y === p.y) &&
      workers.length
    )
      list.push(action("dam", "Créer un barrage · 32 or", 32, workers[0].id));
    return list;
  }
  if (t.cave !== undefined) return [action("attack", "Attaquer la grotte", 0)];
  if (t.terrain === "dam") return [];
  if (t.terrain === "tree" || t.terrain === "rock")
    return someReach
      ? [
          action(
            "move",
            t.terrain === "tree"
              ? "Couper cet arbre · 30 or"
              : `Dégager ce rocher · ${CLEARING_COSTS.rock} or`,
            CLEARING_COSTS[t.terrain],
          ),
          ...(workers.length
            ? [
                action(
                  "clear-many",
                  "Déblayer les obstacles en continu",
                  CLEARING_COSTS.rock,
                ),
              ]
            : []),
        ]
      : [];
  if (t.castle !== undefined && t.castle !== 0) {
    const king = s.units.find((u) => u.royal && u.team === t.castle);
    return [
      action(
        "attack",
        `Assiéger · ${king ? Math.ceil(combatPower(s, king)) : 0} PV de défense`,
      ),
    ];
  }
  const enemy =
    s.units.some(
      (u) => u.team !== 0 && u.hp > 0 && u.x === p.x && u.y === p.y,
    ) || s.monsters.some((m) => m.hp > 0 && m.x === p.x && m.y === p.y);
  if (enemy) return [action("attack", "Attaquer la cible", 0)];
  const house = s.houses.find((h) => h.id === t.house);
  if (house?.team !== undefined && house.team !== 0)
    return [action("attack", "Raser la maison · 200 PV + 5 % des PV")];
  if (t.castle !== undefined && t.castle !== 0)
    return [action("attack", "Attaquer le roi adverse", 0)];
  const ally = s.units.find(
    (u) =>
      u.team === 0 &&
      !units.some((v) => v.id === u.id) &&
      u.x === p.x &&
      u.y === p.y,
  );
  if (ally?.royal) return [action("merge", "Fusionner avec le roi")];
  if (house) {
    const a = [
      action("shelter", "S’abriter sur cette maison"),
      ...(workers.length
        ? [
            action("build-many", "Construire des maisons en continu", 150),
            action(
              "clear-many",
              "Déblayer les obstacles en continu",
              CLEARING_COSTS.rock,
            ),
          ]
        : []),
    ];
    if (units.length > 1 || ally) a.push(action("merge", "Fusionner ici"));
    if (units.every((u) => u.x === p.x && u.y === p.y))
      a.push(action("auto", "Reprendre l’autonomie"));
    return a;
  }
  if (!someReach) return [];
  const list = [
    action(
      "move",
      units[0].royal && t.castle === 0
        ? "Rentrer au château"
        : "Se déplacer ici",
    ),
  ];
  const worker = workers.find((u) => reachable(u, p));
  if (worker && canHouse(s, p.x, p.y))
    list.push(
      action(
        "house",
        "Construire une maison · 150 or · 100 PV max.",
        150,
        worker.id,
      ),
    );
  if (worker && t.terrain === "grass")
    list.push(
      action("build-many", "Construire des maisons en continu", 150),
      action(
        "clear-many",
        "Déblayer les obstacles en continu",
        CLEARING_COSTS.rock,
      ),
      action("demolish-many", "Détruire les barricades en continu"),
    );
  if (worker && canBarricade(s, p))
    list.push(
      action(
        "barricade",
        "Construire une barricade · 750 or · progressif",
        0,
        worker.id,
      ),
    );
  if (units.length > 1 || ally) list.push(action("merge", "Fusionner ici"));
  if (units.every((u) => u.x === p.x && u.y === p.y)) {
    list.push(action("hold", "Tenir la position"));
    list.push(action("auto", "Reprendre l’autonomie"));
  }
  return list;
}
