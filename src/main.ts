import "./style.css";
import { rectangleSelection, clickSelection } from "./selection";
import {
  createGame,
  step,
  command,
  canHouse,
  crossing,
  bridgeCost,
  structureAt,
  canBarricade,
  loadGame,
  saveGame,
  tile,
  LEVELS,
  COLORS,
  TEAM_NAMES,
  totalHP,
  sheltered,
  resting,
  type State,
  type Order,
  type Point,
} from "./engine";
import { Renderer, CELL, tier } from "./render";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const KEY = "quatre-couronnes-save-v2",
  PROGRESS = "quatre-couronnes-campaign-v1";
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
let state = createGame(),
  paused = false,
  speed = 1,
  inGame = false,
  targetOrder: Order | undefined,
  selection = new Set<number>(),
  hover: Point | undefined,
  saveTime = 0,
  uiTime = 0,
  last = 0,
  accumulator = 0,
  ended = false,
  lastStored: State | undefined;
const saved = read(KEY);
lastStored = saved ? loadGame(saved) : undefined;
const app = $("app");
app.innerHTML = `<header><button id="brand-title" class="brand" aria-label="Revenir à l’écran titre"><span class="crown">♛</span><div><h1>Les Quatre Couronnes</h1><p class="eyebrow">Des royaumes qui prennent vie</p></div></button><div class="top-resources"><div class="resource"><i>◈</i><div><b id="gold">5 000</b><small>Or</small></div></div><div class="resource"><i>♠</i><div><b id="wood">32</b><small>Bois</small></div></div><div class="resource"><i>⬟</i><div><b id="stone">18</b><small>Pierre</small></div></div><div class="resource"><i>⚑</i><div><b id="population">100</b><small>PV totaux</small></div></div></div><div class="header-actions"><button id="help" title="Règles et commandes">?</button><button id="save" title="Sauvegarder">↓<span class="wide-label"> Sauver</span></button><button id="menu" title="Écran titre">☰</button></div><button class="mobile-tab" id="sidebar-toggle">Conseil</button></header>
<main class="layout"><section class="battlefield" aria-label="Carte du jeu"><canvas id="map" tabindex="0" aria-label="Carte. Cliquez une unité verte ou tracez un rectangle pour sélectionner. Les ordres sont dans le conseil à droite."></canvas><div class="map-head"><span class="eyebrow" id="chapter">Chapitre I · Forêt & montagne</span><h2 id="level-name">La vallée des premiers jours</h2><p id="map-sub">80 × 80 · Quatre royaumes · Aucune frontière</p></div><span class="time" id="time">☀ 00:00</span><div class="map-help">Clic : sélectionner · Glisser : sélection multiple<br>Molette : zoom · Clic droit glissé : déplacer la carte</div><div class="map-controls"><button id="pause" title="Pause (Espace)">Ⅱ</button><button id="speed" title="Vitesse : ×1, ×2, ×4, ×8, ×16">×1</button><button id="zoom-out" title="Dézoomer">−</button><button id="zoom-in" title="Zoomer">+</button><button id="fit" title="Voir toute la carte">⊡</button></div><div id="selection-menu" class="selection-menu hidden" aria-label="Ordres de la sélection"><button data-order="move">⚑ Déplacer</button><button data-order="merge">✦ Fusionner</button><button data-order="house">⌂ Maison</button><button data-order="bridge">≋ Pont</button><button data-order="dam">▤ Barrage</button><button data-order="barricade">╳ Barricade</button><button data-order="auto">↝ Autonomie</button><button data-order="hold">⏸ Tenir</button></div><div id="target-banner" class="status-banner hidden"></div><div id="paused-label" class="paused-label hidden">Ⅱ Partie en pause</div></section>
<aside class="sidebar" id="sidebar"><span class="eyebrow">Votre royaume</span><h2>La couronne Émeraude</h2><p class="subtitle">Laissez vivre. Choisissez quand agir.</p><div class="section"><div class="label-row"><h3>Les quatre couronnes</h3><span class="badge" id="alive">4 en lice</span></div><div id="kingdoms"></div></div><div class="section"><div class="label-row"><h3>Votre roi</h3><span class="badge" id="king-hp">100 PV</span></div><p class="selection-info" id="king-info">À l’abri du château</p><div class="orders"><button id="select-king">♛ Voir le roi</button><button id="return-king">⌂ Rentrer</button></div></div><div class="section"><div class="label-row"><h3>Impôts du royaume</h3><span class="tax-number" id="tax-value">12<span>%</span></span></div><input id="tax" type="range" min="0" max="30" value="12" aria-label="Taux des impôts de 0 à 30 pour cent"><div class="range-labels"><span>0 % · Plus de naissances</span><span>30 % · Plus d’or</span></div><label class="check"><input id="auto-tax" type="checkbox" checked> Ajustement automatique</label><label class="check"><input id="save-gold" type="checkbox"> Épargner 1 000 pièces pour un chantier</label><p class="tax-hint" id="tax-hint"></p></div><div class="section"><div class="label-row"><h3>Vos ordres</h3><span class="badge" id="selection-count">0 unité</span></div><p class="selection-info" id="selection-info">Sélectionnez vos habitants verts sur la carte, par clic ou par rectangle.</p><div class="orders"><button data-order="move">⚑ Déplacer</button><button data-order="merge">✦ Fusionner</button><button data-order="house">⌂ Maison</button><button data-order="bridge">≋ Pont</button><button data-order="dam">▤ Barrage</button><button data-order="barricade">╳ Barricade</button><button data-order="auto">↝ Autonomie</button><button data-order="hold">⏸ Tenir</button></div><div id="inspect" class="inspect"></div></div><div class="section"><div class="label-row"><h3>Échos de la vallée</h3><span style="color:var(--gold)">✧</span></div><div id="events"></div></div><p class="save-status" id="save-status">Sauvegarde automatique toutes les 10 s</p></aside></main>
<div class="overlay" id="title"><div class="title-panel"><p class="eyebrow">Un jeu de stratégie vivant</p><div class="crest">♛</div><h1>Les Quatre<br>Couronnes</h1><div class="title-colors">${COLORS.map((c) => `<span style="background:${c}"></span>`).join("")}</div><p class="intro">Dans la vallée, chaque habitant suit son chemin.<br>Les royaumes grandissent, se croisent et s’affrontent.<br>Votre couronne. Leur histoire.</p><div class="title-buttons"><button class="primary" id="new-game">New game</button><button id="load-game" ${lastStored ? "" : "disabled"}>Load game</button></div><p class="load-note" id="load-note"></p><div class="title-detail"><span>4 royaumes</span><span>80 × 80 cases</span><span>Un monde autonome</span></div><button class="small" id="title-help">Découvrir les règles</button><p class="title-foot">Observez la vie. Prenez le commandement.</p></div></div>
<div class="overlay hidden" id="modal"><div class="dialog" id="dialog" role="dialog" aria-modal="true" aria-label="Conseil des couronnes"></div></div><div class="toast hidden" id="toast" role="status"></div>`;
const renderer = new Renderer($<HTMLCanvasElement>("map"));
const canvas = renderer.canvas;
function escapeText(value: string) {
  return value.replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c] ?? c,
  );
}
function clock(t: number) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.add("hidden"),
    4200,
  );
}
let toastTimer = 0;
function showModal(html: string) {
  $("dialog").innerHTML = html;
  $("modal").classList.remove("hidden");
  $("dialog").querySelector<HTMLButtonElement>("button")?.focus();
}
function closeModal() {
  $("modal").classList.add("hidden");
}
function updateLoad() {
  const raw = read(KEY);
  lastStored = raw ? loadGame(raw) : undefined;
  $<HTMLButtonElement>("load-game").disabled = !lastStored;
  $("load-note").textContent = lastStored
    ? `Sauvegarde · Chapitre ${lastStored.level + 1} · ${clock(lastStored.time)} · ${lastStored.units.filter((u) => u.team === 0).length} unité${lastStored.units.filter((u) => u.team === 0).length > 1 ? "s" : ""}`
    : "Votre aventure sera sauvegardée dans ce navigateur.";
}
function persist(manual = false) {
  if (!inGame) return false;
  try {
    localStorage.setItem(KEY, saveGame(state));
    $("save-status").textContent =
      `Sauvegardé à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    if (manual) toast("La vallée et tous vos ordres ont été sauvegardés.");
    return true;
  } catch {
    $("save-status").textContent =
      "Stockage indisponible — exportez votre sauvegarde.";
    if (manual) toast("Stockage indisponible. Utilisez Exporter dans le menu.");
    return false;
  }
}
function start(s: State, loading = false) {
  state = s;
  inGame = true;
  paused = loading;
  ended = false;
  speed = 1;
  selection.clear();
  targetOrder = undefined;
  accumulator = 0;
  saveTime = 0;
  $("title").classList.add("hidden");
  closeModal();
  renderer.cached = "";
  renderer.fit(state);
  updateUI();
  persist();
  if (state.result !== "playing") finish();
  toast(
    loading
      ? "Partie chargée et en pause. Appuyez sur ▶ pour reprendre."
      : "Vos habitants vivent déjà leur aventure. Observez ou donnez vos premiers ordres.",
  );
}
function newGame() {
  const unlock = Math.min(4, Math.max(0, Number(read(PROGRESS)) || 0));
  showModal(
    `<span class="eyebrow">Une nouvelle histoire</span><h2>Choisissez votre vallée</h2><p>Vous incarnez la couronne <strong>Émeraude</strong>. Faites tomber les trois royaumes adverses tout en protégeant votre roi et votre peuple.</p><label class="check" for="level-select">Chapitre de la campagne</label><select id="level-select">${LEVELS.map((l, i) => `<option value="${i}" ${i > unlock ? "disabled" : ""}>${i + 1}. ${l.name}${i > unlock ? " · verrouillé" : ""}</option>`).join("")}</select><p>Chaque camp commence avec 5 000 pièces. Chaque victoire ouvre la vallée suivante. Les adversaires se développent plus vite au fil des chapitres.</p>${read(KEY) ? '<p class="confirm">Commencer remplacera la sauvegarde actuelle. Vous pouvez l’exporter depuis le menu en cours de partie.</p>' : ""}<div class="close-row"><button id="cancel-new">Retour</button><button class="primary" id="begin">Entrer dans la vallée</button></div>`,
  );
  $("cancel-new").onclick = closeModal;
  $("begin").onclick = () =>
    start(
      createGame(
        Number($<HTMLSelectElement>("level-select").value),
        Date.now() >>> 0,
      ),
    );
}
function help() {
  showModal(
    `<span class="eyebrow">Le livre des couronnes</span><h2>Le monde n’attend pas vos ordres.</h2><p>Chacun des quatre royaumes commence avec <strong>un château de neuf cases et un roi. Le premier chapitre donne cinq maisons au joueur et deux à chaque adversaire ; les suivants, quatre à chaque camp</strong>. Chaque camp reçoit 5 000 pièces. Les graphismes sont identiques ; seule la couleur change.</p><p>Les maisons produisent chacune des habitants de <strong>100 PV</strong>. Ils errent, défrichent les arbres et rochers pour récupérer des ressources et fondent rapidement de nouvelles maisons dès qu’une case libre respecte l’espacement. Se déplacer, travailler et combattre use leurs vies. Sur le sol, les habitants perdent aussi 0,12 PV par seconde. L’ordre Tenir la position permet de rester immobile sur une maison alliée et d’arrêter cette usure. Le roi peut aussi s’abriter sur une maison, ou rester dans son château. Couper un arbre coûte 2 pièces, dégager un rocher 3 pièces et engager un combat 1 pièce. Sans or, l’action attend. Fonder une maison transforme l’habitant en bâtiment.</p><p><strong>Rencontres :</strong> deux alliés fusionnent en additionnant leurs PV. Entre ennemis, le plus fort survit et perd 70 % des PV du vaincu. À égalité, les deux disparaissent. Le roi commence à 100 PV. Sa force gagne 25 % des PV de ses autres unités. Les alliés qui le rejoignent fusionnent avec lui. Dans les neuf cases de son château, sa puissance défensive est multipliée par quatre. Dehors, il perd 5 % de ses PV par seconde (minimum 4 PV/s). Le retour au château arrête cette perte, sans effacer les dégâts. Sélectionnez le roi comme une unité pour le déplacer ; il peut raser les maisons adverses. Un royaume disparaît si son roi meurt, ou s’il n’a plus aucune maison ni unité ordinaire, même si son roi vit encore. Le château s’effondre alors. Les adversaires peuvent s’éliminer entre eux.</p><div class="sprite-sheet"><canvas id="sprites-preview" width="300" height="192" aria-label="Sprites quatre directions et trois gabarits"></canvas></div><p><strong>Trois gabarits :</strong> habitant sous 1 000 PV, guerrier de 1 000 à 10 000 PV inclus, colosse au-delà. Chaque gabarit existe de face, de dos, à gauche et à droite, dans les quatre couleurs.</p><ul><li><strong>Sélection :</strong> clic ou rectangle sur les unités vertes. Maj ajoute à la sélection. Le roi est exclu des rectangles et de la touche A : il se sélectionne seul par un clic direct. Voir le roi recentre seulement la carte.</li><li><strong>Déplacer :</strong> choisissez une destination. Une case de château adverse vise son roi. À destination, l’unité tient sa position.</li><li><strong>Fusionner :</strong> les unités sélectionnées convergent sur un point de rassemblement.</li><li><strong>Maison :</strong> 100 or. Aucune maison voisine, même en diagonale. La case doit être dégagée.</li><li><strong>Pont :</strong> 1 000 or au premier chantier, 500 pour reconstruire au même endroit, plus 4 bois par case. Le pont a 1 000 PV et peut être détruit ; les unités qui s’y trouvent tombent à l’eau. Cliquez sur une rivière : l’unité rejoint la berge et construit un passage complet (6 cases maximum).</li><li><strong>Barricade :</strong> 750 or + 12 bois, 1 500 PV. Elle bloque une case de terre. Les unités la contournent ; un ordre Déplacer sur la barricade ennemie permet de l’attaquer.</li><li><strong>Barrage :</strong> 32 or + 12 pierres + 4 bois par case. Il bloque le passage et rapporte 0,2 or par seconde et par case. Il ne modifie pas le niveau d’eau.</li><li><strong>Impôts :</strong> de 0 à 30 %. Plus le taux est élevé, plus l’or rentre et plus les naissances ralentissent. L’automatisme ajuste le taux selon l’or et la population.</li><li><strong>Tenir :</strong> arrête les déplacements. Sur une maison alliée, l’unité ne perd plus de vies avec le temps.</li><li><strong>Autonomie :</strong> annule les ordres et rend leurs choix aux habitants. Quand aucun travail accessible ne reste, ou quand l’or manque, les habitants attendent sur les maisons sans usure et sans fusion forcée. Ils repartent si un passage ou du travail s’ouvre. Pour votre camp, seules les maisons et les coupes d’arbres sont spontanées, avec une défense locale si un ennemi menace les maisons ou le château. Un ordre manuel reste prioritaire et le roi ne sort jamais seul. Les habitants évitent les rochers et les ennemis hors de leur territoire. Toute autre action nécessite un ordre ; les adversaires gardent leur autonomie. L’épargne chantier réserve 1 000 pièces contre les fondations automatiques.</li></ul><p>Molette pour zoomer ; clic droit glissé ou Alt + glisser pour déplacer la carte. Sur écran tactile : glisser sélectionne, le bouton ↔ active le déplacement de carte. <kbd>Espace</kbd> pause, <kbd>Échap</kbd> annule un ordre, <kbd>F</kbd> fusion. La partie s’arrête quand cet onglet est masqué. Sauvegarde locale automatique et export disponible au menu. Limite : 150 unités par royaume.</p><div class="close-row"><span></span><button class="primary" id="close-help">J’ai compris</button></div>`,
  );
  $("close-help").onclick = closeModal;
  const c = $<HTMLCanvasElement>("sprites-preview").getContext("2d")!;
  c.scale(2, 2);
  for (let r = 0; r < 3; r++)
    for (let d = 0; d < 4; d++)
      renderer.sprite(
        c,
        20 + d * 36,
        23 + r * 29,
        d,
        ["front", "back", "left", "right"][d],
        r,
        0,
      );
}
function menu() {
  paused = true;
  updateUI();
  showModal(
    `<span class="eyebrow">La vallée vous attend</span><h2>Conseil du royaume</h2><p>Partie en pause. Sauvegarde locale dans ce navigateur ; exportez-la pour la conserver ou la transférer.</p><div class="orders"><button id="menu-save">Sauvegarder</button><button id="export">Exporter</button><button id="import">Importer</button><button id="back-title">Écran titre</button></div><input type="file" accept=".json,application/json" id="import-file" class="hidden"><div class="close-row"><button id="restart">Recommencer la carte</button><button class="primary" id="resume">Reprendre</button></div>`,
  );
  $("menu-save").onclick = () => persist(true);
  $("resume").onclick = () => {
    closeModal();
    paused = false;
    updateUI();
  };
  $("back-title").onclick = () => {
    persist();
    closeModal();
    inGame = false;
    $("title").classList.remove("hidden");
    updateLoad();
  };
  $("export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([saveGame(state)], { type: "application/json" }),
    );
    a.download = "les-quatre-couronnes.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Sauvegarde exportée.");
  };
  $("import").onclick = () => $("import-file").click();
  $<HTMLInputElement>("import-file").onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const loaded = loadGame(await file.text());
    if (loaded) start(loaded, true);
    else toast("Ce fichier n’est pas une sauvegarde valide.");
  };
  $("restart").onclick = () => {
    showModal(
      `<h2>Recommencer cette vallée ?</h2><p>La carte recommence avec la même géographie. La sauvegarde actuelle sera remplacée.</p><div class="close-row"><button id="no-restart">Retour</button><button id="yes-restart" class="primary">Recommencer</button></div>`,
    );
    $("no-restart").onclick = menu;
    $("yes-restart").onclick = () => start(createGame(state.level, state.seed));
  };
}
function finish() {
  if (ended) return;
  ended = true;
  persist();
  if (state.result === "won") {
    try {
      localStorage.setItem(
        PROGRESS,
        String(
          Math.max(Number(read(PROGRESS)) || 0, Math.min(4, state.level + 1)),
        ),
      );
    } catch {}
  }
  window.setTimeout(() => {
    if (!inGame) return;
    showModal(
      `<span class="eyebrow">${state.result === "won" ? "La vallée est réunie" : "Votre roi est tombé"}</span><h2>${state.result === "won" ? "Une seule couronne." : "L’histoire ne s’arrête pas ici."}</h2><p>${state.result === "won" ? "Les trois royaumes adverses ont disparu. La vallée appartient à votre couronne." : "La couronne Émeraude a perdu son roi ou toute sa population et ses maisons. Rassemblez vos forces et protégez les chemins qui mènent au roi."}</p><p>${clock(state.time)} de règne · ${state.kingdoms[0].births} naissances · ${state.stats.merged} fusions dans la vallée</p><div class="close-row"><button id="end-title">Écran titre</button><button class="primary" id="end-next">${state.result === "won" && state.level < 4 ? "Vallée suivante" : "Rejouer"}</button></div>`,
    );
    $("end-title").onclick = () => {
      closeModal();
      inGame = false;
      $("title").classList.remove("hidden");
      updateLoad();
    };
    $("end-next").onclick = () =>
      start(
        createGame(
          state.result === "won" && state.level < 4
            ? state.level + 1
            : state.level,
          Date.now() >>> 0,
        ),
      );
  }, 1500);
}
function updateUI() {
  const k = state.kingdoms[0],
    us = state.units.filter((u) => selection.has(u.id) && u.team === 0);
  selection = new Set(us.map((u) => u.id));
  $("gold").textContent = Math.floor(k.gold).toLocaleString("fr-FR");
  $("wood").textContent = Math.floor(k.wood).toString();
  $("stone").textContent = Math.floor(k.stone).toString();
  $("population").textContent = Math.ceil(totalHP(state, 0)).toLocaleString(
    "fr-FR",
  );
  $("chapter").textContent =
    `Chapitre ${state.level + 1} · ${LEVELS[state.level].biome}`;
  $("level-name").textContent = LEVELS[state.level].name;
  $("map-sub").textContent =
    `${state.size} × ${state.size} · Quatre royaumes · Aucune frontière`;
  $("time").textContent = `☀ ${clock(state.time)}`;
  $("alive").textContent =
    `${state.kingdoms.filter((v) => v.alive).length} en lice`;
  $("kingdoms").innerHTML = state.kingdoms
    .map((v) => {
      const count = state.units.filter(
          (u) => u.team === v.id && !u.royal,
        ).length,
        homes = state.houses.filter((h) => h.team === v.id).length;
      return `<div class="kingdom-row"><i class="dot" style="color:${COLORS[v.id]};background:${COLORS[v.id]}"></i><span class="kingdom-name">${TEAM_NAMES[v.id]}${v.id === 0 ? " <small>vous</small>" : ""}</span><b>${v.alive ? count : "—"}</b><small>${v.alive ? `${homes} ⌂ · ♛ ${Math.ceil(v.hp)}` : "vaincu"}</small></div><div class="health-line"><span style="width:${Math.min(100, (100 * v.hp) / (v.hp + 200))}%;background:${COLORS[v.id]}"></span></div>`;
    })
    .join("");
  const king = state.units.find((u) => u.team === 0 && u.royal);
  $("king-hp").textContent = king
    ? `${Math.ceil(king.hp).toLocaleString("fr-FR")} PV`
    : "Roi tombé";
  $("king-info").textContent = king
    ? sheltered(state, king)
      ? "Dans le château · Défense ×4"
      : resting(state, king)
        ? "À l’abri sur une maison · Aucune usure"
        : `Hors du château · −${Math.max(4, king.hp * 0.05).toFixed(0)} PV/s`
    : "Votre couronne est tombée.";
  $<HTMLInputElement>("save-gold").checked = k.bridgeSaving;
  $("tax-value").textContent = `${Math.round(k.tax)} %`;
  $<HTMLInputElement>("tax").value = String(Math.round(k.tax));
  $<HTMLInputElement>("auto-tax").checked = k.automatic;
  $("tax-hint").textContent =
    `Une naissance par maison toutes les ${(10 + k.tax * 0.72).toFixed(0)} s. ${k.automatic ? "Le conseil ajuste vos impôts." : "Vous fixez vous-même le taux."}`;
  $("selection-menu").classList.toggle("hidden", !us.length || !!targetOrder);
  $("selection-count").textContent =
    `${us.length} unité${us.length > 1 ? "s" : ""}`;
  $("selection-info").textContent = us.length
    ? `${Math.ceil(us.reduce((n, u) => n + u.hp, 0)).toLocaleString("fr-FR")} PV au total · ${us.length === 1 ? (us[0].royal ? "Roi · " : "") + ["Habitant", "Guerrier", "Colosse"][tier(us[0].hp)] : "Choisissez un ordre puis une destination."}`
    : "Sélectionnez vos habitants verts sur la carte, par clic ou par rectangle.";
  document.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((b) => {
    b.disabled =
      !us.length ||
      (us.every((u) => u.royal) &&
        ["house", "bridge", "dam", "barricade"].includes(
          b.dataset.order ?? "",
        ));
    b.classList.toggle("active", b.dataset.order === targetOrder);
  });
  $("events").innerHTML = state.events
    .slice(0, 4)
    .map(
      (e) =>
        `<div class="event"><time>${clock(e.time)}</time><span>${escapeText(e.text)}</span></div>`,
    )
    .join("");
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("speed").textContent = `×${speed}`;
  $("paused-label").classList.toggle(
    "hidden",
    !paused || !inGame || !$("modal").classList.contains("hidden"),
  );
  $("target-banner").classList.toggle("hidden", !targetOrder);
  $("target-banner").textContent = targetOrder
    ? {
        move: "Choisissez une destination ou un château adverse.",
        merge: "Choisissez un point de rassemblement pour fusionner.",
        house: "Choisissez une case libre sans maison voisine. 100 or.",
        bridge:
          "Cliquez une rivière. Pont : 1 000 or ; reconstruction : 500. + 4 bois / case.",
        dam: "Cliquez une rivière. 32 or + 12 pierres + 4 bois / case.",
        barricade: "Choisissez une terre libre. 750 or + 12 bois · 1 500 PV.",
        auto: "",
        hold: "",
        rest: "",
        defend: "",
      }[targetOrder] + " · Échap pour annuler"
    : "";
}
function chooseOrder(order: Order) {
  if (!selection.size) return toast("Sélectionnez d’abord des unités vertes.");
  if (order === "auto" || order === "hold") {
    command(state, [...selection], order);
    targetOrder = undefined;
    toast(
      order === "hold"
        ? "Les unités tiennent leur position. Une maison alliée les abrite."
        : "Les habitants reprennent leur autonomie.",
    );
  } else {
    targetOrder = order;
    toast("Choisissez la destination sur la carte.");
    $("sidebar").classList.remove("open");
  }
  updateUI();
}
function issue(p: Point) {
  if (!targetOrder) return;
  const order = targetOrder;
  if (!tile(state, p.x, p.y)) return;
  if (order === "house" && !canHouse(state, p.x, p.y))
    return toast(
      "Une maison exige une case de terre libre, sans maison voisine, même en diagonale.",
    );
  if (order === "house" && state.kingdoms[0].gold < 100)
    return toast("Il faut 100 pièces pour une maison.");
  if (order === "bridge" || order === "dam") {
    const cr = crossing(state, p);
    if (!cr)
      return toast(
        "Choisissez une rivière avec deux berges, large de 6 cases au maximum.",
      );
    const k = state.kingdoms[0];
    if (
      k.gold < (order === "dam" ? 32 : bridgeCost(state, p)) ||
      k.wood < cr.cells.length * 4 ||
      (order === "dam" && k.stone < 12)
    )
      return toast("Ressources insuffisantes pour cette construction.");
  }
  if (order === "barricade") {
    if (!canBarricade(state, p))
      return toast(
        "Choisissez une case de terre libre, sans maison, château ni unité.",
      );
    if (state.kingdoms[0].gold < 750 || state.kingdoms[0].wood < 12)
      return toast("Il faut 750 pièces et 12 bois pour une barricade.");
  }
  const construction = ["house", "bridge", "dam", "barricade"].includes(order);
  const ids = [...selection].filter(
    (id) => !construction || !state.units.find((u) => u.id === id)?.royal,
  );
  if (!ids.length)
    return toast(
      "Le roi commande et combat ; choisissez un habitant pour construire.",
    );
  if (order === "move") {
    const t = tile(state, p.x, p.y);
    if (t?.castle !== undefined && t.castle !== 0) {
      const king = state.units.find((u) => u.team === t.castle && u.royal);
      if (king) p = { x: king.x, y: king.y };
    }
  }
  command(state, construction ? ids.slice(0, 1) : ids, order, p);
  targetOrder = undefined;
  toast("Ordre transmis. Les habitants rejoignent la destination.");
  updateUI();
}
$("select-king").onclick = () => {
  const king = state.units.find((u) => u.team === 0 && u.royal);
  if (king) {
    renderer.zoom = Math.max(renderer.zoom, 0.95);
    renderer.ox = renderer.width / 2 - (king.x + 0.5) * CELL * renderer.zoom;
    renderer.oy = renderer.height / 2 - (king.y + 0.5) * CELL * renderer.zoom;
    targetOrder = undefined;
    updateUI();
  }
};
$("return-king").onclick = () => {
  const king = state.units.find((u) => u.team === 0 && u.royal);
  if (king) {
    command(state, [king.id], "move", state.kingdoms[0].castle);
    toast("Le roi rejoint son château.");
    updateUI();
  }
};
$("brand-title").onclick = () => {
  if (!inGame) return;
  const wasPaused = paused;
  paused = true;
  showModal(
    `<span class="eyebrow">Quitter la vallée</span><h2>Revenir à l’écran titre ?</h2><p>Votre partie sera sauvegardée dans ce navigateur. Vous pourrez la reprendre avec Load game.</p><div class="close-row"><button id="cancel-title">Rester dans la vallée</button><button id="confirm-title" class="primary">Sauvegarder et revenir</button></div>`,
  );
  updateUI();
  $("cancel-title").onclick = () => {
    closeModal();
    paused = wasPaused;
    updateUI();
  };
  $("confirm-title").onclick = () => {
    persist();
    inGame = false;
    closeModal();
    $("title").classList.remove("hidden");
    updateLoad();
  };
};
$("new-game").onclick = newGame;
$("load-game").onclick = () => {
  const raw = read(KEY),
    s = raw ? loadGame(raw) : undefined;
  if (s) start(s, true);
  else toast("Aucune sauvegarde valide.");
};
$("help").onclick = help;
$("title-help").onclick = help;
$("menu").onclick = () => (inGame ? menu() : undefined);
$("save").onclick = () => persist(true);
$("sidebar-toggle").onclick = () => $("sidebar").classList.toggle("open");
$("pause").onclick = () => {
  paused = !paused;
  updateUI();
};
$("speed").onclick = () => {
  speed =
    ({ 1: 2, 2: 4, 4: 8, 8: 16, 16: 1 } as Record<number, number>)[speed] ?? 1;
  updateUI();
};
$("zoom-in").onclick = () => renderer.zoomAt(1.3);
$("zoom-out").onclick = () => renderer.zoomAt(1 / 1.3);
$("fit").onclick = () => renderer.fit(state);
$<HTMLInputElement>("tax").oninput = (e) => {
  state.kingdoms[0].tax = Number((e.target as HTMLInputElement).value);
  state.kingdoms[0].automatic = false;
  updateUI();
};
$<HTMLInputElement>("auto-tax").onchange = (e) => {
  state.kingdoms[0].automatic = (e.target as HTMLInputElement).checked;
  updateUI();
};
$<HTMLInputElement>("save-gold").onchange = (e) => {
  state.kingdoms[0].bridgeSaving = (e.target as HTMLInputElement).checked;
  updateUI();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-order]")
  .forEach((b) => (b.onclick = () => chooseOrder(b.dataset.order as Order)));
// Mouse and touch share the same pointer path. Panning is explicit on touch.
let panTouch = false;
const panButton = document.createElement("button");
panButton.textContent = "↔";
panButton.title = "Déplacer la carte (tactile)";
document.querySelector(".map-controls")!.appendChild(panButton);
panButton.onclick = () => {
  panTouch = !panTouch;
  panButton.style.borderColor = panTouch ? "#ddc18a" : "";
};
let pointer:
    | {
        x: number;
        y: number;
        cx: number;
        cy: number;
        pan: boolean;
        shift: boolean;
        id: number;
      }
    | undefined,
  drag: { x: number; y: number; w: number; h: number } | undefined;
function local(e: PointerEvent | WheelEvent) {
  const b = canvas.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onpointerdown = (e) => {
  if (!inGame) return;
  const p = local(e);
  pointer = {
    ...p,
    cx: renderer.ox,
    cy: renderer.oy,
    pan: e.button === 2 || e.altKey || panTouch,
    shift: e.shiftKey,
    id: e.pointerId,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
};
canvas.onpointermove = (e) => {
  const p = local(e);
  hover = renderer.point(p.x, p.y);
  const t = tile(state, hover.x, hover.y);
  $("inspect").textContent = t
    ? `${hover.x}, ${hover.y} · ${{ grass: "Terre", tree: "Forêt", rock: "Rochers", water: "Eau", bridge: "Pont", dam: "Barrage", barricade: "Barricade" }[t.terrain]}`
    : "";
  const construction = hover ? structureAt(state, hover) : undefined;
  if (construction)
    $("inspect").textContent +=
      ` · ${Math.ceil(construction.hp)} / ${construction.maxHp} PV`;
  else if (hover && t?.terrain === "water" && bridgeCost(state, hover) === 500)
    $("inspect").textContent += " · Reconstruction : 500 or";
  if (!pointer) return;
  if (pointer.pan) {
    renderer.ox = pointer.cx + p.x - pointer.x;
    renderer.oy = pointer.cy + p.y - pointer.y;
  } else if (Math.hypot(p.x - pointer.x, p.y - pointer.y) > 5)
    drag = {
      x: Math.min(p.x, pointer.x),
      y: Math.min(p.y, pointer.y),
      w: Math.abs(p.x - pointer.x),
      h: Math.abs(p.y - pointer.y),
    };
};
canvas.onpointerup = (e) => {
  if (!pointer) return;
  const p = local(e);
  if (!pointer.pan) {
    if (targetOrder && !drag) issue(renderer.point(p.x, p.y));
    else {
      if (drag) {
        targetOrder = undefined;
        selection = rectangleSelection(
          state.units,
          selection,
          drag,
          (u) => renderer.screen(u.x, u.y),
          pointer.shift,
        );
      } else {
        const nearest = state.units
          .filter((u) => u.team === 0)
          .map((u) => ({
            u,
            d: Math.hypot(
              renderer.screen(u.x, u.y).x - p.x,
              renderer.screen(u.x, u.y).y - p.y,
            ),
          }))
          .sort((a, b) => a.d - b.d)[0];
        selection = clickSelection(
          state.units,
          selection,
          nearest && nearest.d < Math.max(10, CELL * renderer.zoom)
            ? nearest.u
            : undefined,
          pointer.shift,
        );
      }
      updateUI();
    }
  }
  pointer = undefined;
  drag = undefined;
};
canvas.onpointercancel = () => {
  pointer = undefined;
  drag = undefined;
};
canvas.onwheel = (e) => {
  e.preventDefault();
  const p = local(e);
  renderer.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
};
document.onkeydown = (e) => {
  if ((e.target as HTMLElement).matches("input,select")) return;
  if (e.code === "Escape") {
    targetOrder = undefined;
    selection.clear();
    if (!$("modal").classList.contains("hidden")) closeModal();
    updateUI();
  }
  if (!inGame || !$("modal").classList.contains("hidden")) return;
  if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
    updateUI();
  }
  if (e.key.toLowerCase() === "f") chooseOrder("merge");
  if (e.key.toLowerCase() === "a") {
    selection = new Set(
      state.units.filter((u) => u.team === 0 && !u.royal).map((u) => u.id),
    );
    updateUI();
  }
};
window.addEventListener("pagehide", () => persist());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    persist();
    accumulator = 0;
  }
  last = 0;
});
const ro = new ResizeObserver(() => {
  renderer.resize();
  renderer.fit(state);
});
ro.observe(canvas);
function frame(now: number) {
  const elapsed = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (
    inGame &&
    !paused &&
    $("modal").classList.contains("hidden") &&
    !document.hidden &&
    state.result === "playing"
  ) {
    accumulator += elapsed * speed;
    while (accumulator >= 0.2) {
      step(state);
      accumulator -= 0.2;
    }
    saveTime += elapsed;
    uiTime += elapsed;
    if (saveTime > 10) {
      persist();
      saveTime = 0;
    }
    if (uiTime > 0.35) {
      updateUI();
      uiTime = 0;
    }
    if (state.result !== "playing") finish();
  }
  renderer.draw(state, selection, hover, drag, targetOrder);
  requestAnimationFrame(frame);
}
renderer.resize();
renderer.fit(state);
updateLoad();
updateUI();
requestAnimationFrame(frame);
