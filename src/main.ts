import { loadAtlases } from "./atlas";
import "./style.css";
import { SaveLibrary, newSaveId, type SaveEntry } from "./saves";
import {
  DOCTRINES,
  type DoctrineId,
  PRIORITY_LABELS,
  type Priority,
} from "./doctrine";
import { setDoctrine, setPriorities } from "./engine";
import { setupPwa } from "./pwa";
import { destinationActions } from "./orders";
import { rectangleSelection, clickSelection } from "./selection";
import {
  createGame,
  step,
  command,
  isContinuousOrder,
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
  lifeDrain,
  birthInterval,
  suppliedUpkeep,
  supportDrain,
  armyHP,
  armyCapacity,
  kingCapacity,
  maintenanceCost,
  goldIncome,
  type State,
  type Order,
  type Point,
} from "./engine";
import { Renderer, CELL, tier } from "./render";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const KEY = "quatre-couronnes-save-v2",
  PROGRESS = "quatre-couronnes-campaign-v1",
  CHECKPOINT = "quatre-couronnes-checkpoint-v3";
const saves = new SaveLibrary();
let activeAutosaveId: string | undefined,
  savedEntries: SaveEntry[] = [],
  modalRevision = 0,
  modalCancel: (() => void) | undefined;
const storageReady = (async () => {
  const legacy = read(KEY);
  if (await saves.migrateLegacy(legacy)) {
    try {
      if (localStorage.getItem(KEY) === legacy) localStorage.removeItem(KEY);
    } catch {}
  }
  const checkpoint = read(CHECKPOINT);
  if (await saves.restoreCheckpoint(checkpoint)) {
    try {
      if (localStorage.getItem(CHECKPOINT) === checkpoint)
        localStorage.removeItem(CHECKPOINT);
    } catch {}
  }
})();
void storageReady.catch(() => {});
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
let shownDoctrine = "";
let state = createGame(),
  paused = false,
  planning = false,
  contextPoint: Point | undefined,
  speed = 1,
  inGame = false,
  targetOrder: Order | undefined,
  selection = new Set<number>(),
  hover: Point | undefined,
  saveTime = 0,
  uiTime = 0,
  last = 0,
  accumulator = 0,
  ended = false;
const app = $("app");
app.innerHTML = `<header><button id="brand-title" class="brand" aria-label="Revenir à l’écran titre"><span class="crown">♛</span><div><h1>Les Quatre Couronnes</h1><p class="eyebrow">Des royaumes qui prennent vie</p></div></button><div class="top-resources"><div class="resource"><i>◈</i><div><b id="gold">5 000</b><small>Or</small></div></div><div class="resource"><i>⚑</i><div><b id="population">100</b><small>PV totaux</small></div></div></div><div class="header-actions"><button data-pwa class="pwa-button" title="Installer le jeu" aria-label="Installer le jeu">⇩</button><button id="help" title="Règles et commandes">?</button><button id="save" title="Sauvegarder">↓<span class="wide-label"> Sauver</span></button><button id="restart-level" title="Recommencer le niveau" aria-label="Recommencer le niveau">↶</button><button id="menu" title="Écran titre">☰</button></div><button class="mobile-tab" id="sidebar-toggle">Conseil</button></header>
<main class="layout"><section class="battlefield" aria-label="Carte du jeu"><canvas id="map" tabindex="0" aria-label="Carte. Cliquez une unité verte ou tracez un rectangle pour sélectionner. Les ordres sont dans le conseil à droite."></canvas><div class="map-head"><span class="eyebrow" id="chapter">Chapitre I · Forêt & montagne</span><h2 id="level-name">La vallée des premiers jours</h2><p id="map-sub">48 × 48 · Quatre royaumes · Aucune frontière</p></div><span class="time" id="time">☀ 00:00</span><div class="map-help">Clic : sélectionner · Glisser : sélection multiple<br>Molette : zoom · Clic droit : annuler · Clic droit glissé : déplacer la carte</div><div class="map-controls"><button id="pause" title="Pause (Espace)">Ⅱ</button><label class="speed-control"><span class="speed-caption">Vitesse</span><input id="speed" type="range" min="0" max="5" step="0.25" value="1" aria-label="Vitesse du jeu de 0 à 5"><output id="speed-value" for="speed">×1</output></label><button id="zoom-out" title="Dézoomer">−</button><button id="zoom-in" title="Zoomer">+</button><button id="fit" title="Voir toute la carte">⊡</button></div><div id="selection-menu" class="selection-menu hidden" aria-label="Actions pour la destination"></div><div id="target-banner" class="status-banner hidden"></div><div id="paused-label" class="paused-label hidden">Ⅱ Partie en pause</div></section>
<aside class="sidebar" id="sidebar"><span class="eyebrow">Votre royaume</span><h2>La couronne Émeraude</h2><p class="subtitle">Laissez vivre. Choisissez quand agir.</p><div class="section"><div class="label-row"><h3>Les quatre couronnes</h3><span class="badge" id="alive">4 en lice</span></div><div id="kingdoms"></div></div><div class="section"><div class="label-row"><h3>Votre roi</h3><span class="badge" id="king-hp">100 PV</span></div><p class="selection-info" id="king-info">À l’abri du château</p><button id="select-king" class="small">♛ Voir le roi</button></div><div class="section"><div class="label-row"><h3>Impôts du royaume</h3><span class="tax-number" id="tax-value">12<span>%</span></span></div><input id="tax" type="range" min="0" max="30" value="12" aria-label="Taux des impôts de 0 à 30 pour cent"><div class="range-labels"><span>0 % · Plus de naissances</span><span>30 % · Plus d’or</span></div><label class="check"><input id="auto-tax" type="checkbox" checked> Ajustement automatique</label><label class="check"><input id="save-gold" type="checkbox"> Épargner 1 000 pièces pour un chantier</label><p class="tax-hint" id="tax-hint"></p></div><div class="section"><div class="label-row"><h3>Vos ordres</h3><span class="badge" id="selection-count">0 unité</span></div><p class="selection-info" id="selection-info">Sélectionnez vos habitants verts, puis cliquez une destination. Le jeu attend votre ordre.</p><p id="command-help" class="selection-info">Sélectionnez, puis cliquez une destination.</p><button id="cancel-selection" class="small hidden">Annuler la sélection</button><div id="inspect" class="inspect"></div></div><div class="section"><h3>Doctrine du royaume</h3><label class="sr-only" for="doctrine-profile">Doctrine du royaume</label><select id="doctrine-profile" class="doctrine-profile"></select><p id="doctrine-description" class="tax-hint"></p><ol id="doctrine" class="doctrine"></ol><p class="tax-hint">Sans travail : abri sur une maison. Les unités affaiblies cherchent un abri. Ponts et barricades restent sur ordre.</p></div><div class="section"><div class="label-row"><h3>Échos de la vallée</h3><span style="color:var(--gold)">✧</span></div><p id="monster-status" class="tax-hint hidden"></p><div id="events"></div></div><p class="save-status" id="save-status">Sauvegarde automatique toutes les 10 s</p></aside></main>
<div class="overlay" id="title"><div class="title-panel"><p class="eyebrow">Un jeu de stratégie vivant</p><div class="crest">♛</div><h1>Les Quatre<br>Couronnes</h1><div class="title-colors">${COLORS.map((c) => `<span style="background:${c}"></span>`).join("")}</div><p class="intro">Dans la vallée, chaque habitant suit son chemin.<br>Les royaumes grandissent, se croisent et s’affrontent.<br>Votre couronne. Leur histoire.</p><div class="title-buttons"><button class="primary" id="new-game">New game</button><button id="load-game" disabled>Load game</button></div><p class="load-note" id="load-note"></p><div class="title-detail"><span>4 royaumes</span><span>48 × 48 cases</span><span>25 vallées</span></div><div class="title-utilities"><button data-pwa class="pwa-button small">Installer le jeu</button><button class="small" id="title-help">Découvrir les règles</button></div><p class="title-foot">Observez la vie. Prenez le commandement.</p></div></div>
<div class="overlay hidden" id="modal"><div class="dialog" id="dialog" role="dialog" aria-modal="true" aria-label="Conseil des couronnes"></div></div><div class="toast hidden" id="toast" role="status"></div>`;
const renderer = new Renderer($<HTMLCanvasElement>("map"));
void loadAtlases()
  .then((atlases) => {
    renderer.atlases = atlases;
    renderer.cached = "";
  })
  .catch(() =>
    toast(
      "Les nouvelles illustrations n’ont pas pu être chargées. Réessayez après une mise à jour.",
    ),
  );
const HP_DISPLAY_KEY = "quatre-couronnes-show-unit-hp";
renderer.showUnitHP = read(HP_DISPLAY_KEY) === "yes";
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
  modalRevision++;
  modalCancel = undefined;
  $("dialog").innerHTML = html;
  $("modal").classList.remove("hidden");
  $("dialog").querySelector<HTMLButtonElement>("button")?.focus();
  return modalRevision;
}
function closeModal() {
  modalRevision++;
  modalCancel = undefined;
  $("modal").classList.add("hidden");
}
async function updateLoad() {
  try {
    await storageReady;
    savedEntries = await saves.list();
    $<HTMLButtonElement>("load-game").disabled = savedEntries.length === 0;
    $("load-note").textContent = savedEntries.length
      ? `${savedEntries.length} sauvegarde${savedEntries.length > 1 ? "s" : ""} disponible${savedEntries.length > 1 ? "s" : ""} · Choisissez votre partie`
      : "Vos sauvegardes seront conservées dans ce navigateur.";
  } catch {
    $("load-note").textContent =
      "Le stockage est indisponible. Vous pouvez toujours exporter vos parties depuis le menu.";
  }
}
async function persist(notify = false) {
  if (!inGame || !activeAutosaveId) return false;
  const operation = saves.automatic(activeAutosaveId, state);
  try {
    await operation;
    $("save-status").textContent =
      `Sauvegardé à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    if (notify) toast("La sauvegarde automatique est à jour.");
    return true;
  } catch {
    $("save-status").textContent =
      "Sauvegarde impossible — exportez votre partie.";
    if (notify)
      toast("Le stockage n’a pas pu enregistrer la partie. Utilisez Exporter.");
    return false;
  }
}
function checkpoint() {
  if (!inGame || !activeAutosaveId) return;
  try {
    localStorage.setItem(CHECKPOINT, saves.checkpoint(activeAutosaveId, state));
  } catch {}
}
function createNamedSave(fromMenu = false, after?: () => void) {
  if (!inGame) return;
  const wasPaused = paused;
  paused = true;
  updateUI();
  const cancel = () => {
    if (after) {
      after();
      return;
    }
    if (fromMenu) menu();
    else {
      closeModal();
      paused = wasPaused;
      updateUI();
    }
  };
  showModal(
    `<span class="eyebrow">Gardez une étape de votre règne</span><h2>Nouvelle sauvegarde</h2><label class="save-label" for="save-name">Nom de la sauvegarde</label><input id="save-name" class="save-input" maxlength="80" value="${escapeText(`Vallée ${state.level + 1} · ${clock(state.time)}`)}"><p>Cette copie restera intacte pendant que votre partie continue. Les sauvegardes automatiques sont séparées.</p><p id="save-error" class="save-error"></p><div class="close-row"><button id="cancel-named-save">Annuler</button><button id="confirm-named-save" class="primary">Enregistrer</button></div>`,
  );
  modalCancel = cancel;
  $("cancel-named-save").onclick = cancel;
  $("confirm-named-save").onclick = async () => {
    const button = $<HTMLButtonElement>("confirm-named-save");
    button.disabled = true;
    const revision = modalRevision;
    try {
      await saves.create(state, $<HTMLInputElement>("save-name").value);
      void updateLoad();
      if (modalRevision === revision) cancel();
      toast("Votre nouvelle sauvegarde est enregistrée.");
    } catch {
      if (modalRevision !== revision) return;
      $("save-error").textContent =
        "L’enregistrement a échoué. Le stockage peut être plein ; exportez la partie pour la conserver.";
      button.disabled = false;
    }
  };
  $("save-name").onkeydown = (e) => {
    if (e.key === "Enter") $("confirm-named-save").click();
  };
  $("save-name").focus();
}
async function showSavedGames(fromMenu = false) {
  const wasPaused = paused;
  paused = true;
  updateUI();
  const cancel = () => {
    if (fromMenu) menu();
    else {
      closeModal();
      paused = wasPaused;
      updateUI();
    }
  };
  const render = async () => {
    const revision = showModal(
      `<span class="eyebrow">Vos royaumes vous attendent</span><h2>Vos sauvegardes</h2><p>Chargement des sauvegardes…</p><div class="close-row"><span></span><button id="close-saves">Retour</button></div>`,
    );
    modalCancel = cancel;
    $("close-saves").onclick = cancel;
    try {
      await storageReady;
      if (inGame) await persist();
      const entries = await saves.list();
      if (modalRevision !== revision) return;
      savedEntries = entries;
      showModal(
        `<span class="eyebrow">Vos royaumes vous attendent</span><h2>Vos sauvegardes</h2><p>Chaque nouvelle partie possède sa sauvegarde automatique. Les copies nommées restent intactes. Aucune limite de nombre n’est imposée par le jeu.</p><label class="sr-only" for="save-search">Rechercher une sauvegarde</label><input id="save-search" class="save-input" placeholder="Rechercher une sauvegarde"><div id="saved-list" class="saved-list"></div><p id="library-error" class="save-error"></p><div class="close-row">${inGame ? '<button id="library-new">Nouvelle sauvegarde</button>' : "<span></span>"}<button id="close-saves" class="primary">Retour</button></div>`,
      );
      modalCancel = cancel;
      $("close-saves").onclick = cancel;
      if (inGame)
        $("library-new").onclick = () =>
          createNamedSave(false, () => void render());
      const paint = () => {
        const query = $<HTMLInputElement>("save-search")
          .value.trim()
          .toLocaleLowerCase("fr");
        const visible = entries.filter((e) =>
          `${e.name} ${LEVELS[e.level]?.name ?? ""}`
            .toLocaleLowerCase("fr")
            .includes(query),
        );
        $("saved-list").innerHTML = visible.length
          ? visible
              .map(
                (e) =>
                  `<article class="saved-card"><div><h3>${escapeText(e.name)}</h3><p>${e.kind === "auto" ? "Automatique" : "Copie nommée"} · Vallée ${e.level + 1} · ${clock(e.seconds)}<br>${new Date(e.updatedAt).toLocaleString("fr-FR")} · ${e.houses} maisons · ${e.units} unités</p></div><div class="saved-actions"><button data-load="${escapeText(e.id)}" class="primary small">Charger</button><button data-rename="${escapeText(e.id)}" class="small">Renommer</button><button data-delete="${escapeText(e.id)}" class="small" ${inGame && e.id === activeAutosaveId ? 'disabled title="Sauvegarde automatique de la partie en cours"' : ""}>Supprimer</button></div></article>`,
              )
              .join("")
          : "<p>Aucune sauvegarde correspondante.</p>";
        $("saved-list")
          .querySelectorAll<HTMLButtonElement>("[data-load]")
          .forEach(
            (button) =>
              (button.onclick = async () => {
                button.disabled = true;
                try {
                  const entry = entries.find(
                    (e) => e.id === button.dataset.load,
                  )!;
                  const loaded = await saves.load(entry.id);
                  if (!loaded) throw new Error("invalid");
                  if (inGame && !(await persist(true)))
                    throw new Error("backup");
                  start(
                    loaded,
                    true,
                    entry.kind === "auto" ? entry.id : undefined,
                  );
                } catch {
                  $("library-error").textContent =
                    "La partie n’a pas pu être chargée. Votre partie actuelle est conservée.";
                  button.disabled = false;
                }
              }),
          );
        $("saved-list")
          .querySelectorAll<HTMLButtonElement>("[data-rename]")
          .forEach(
            (button) =>
              (button.onclick = () => {
                const entry = entries.find(
                  (e) => e.id === button.dataset.rename,
                )!;
                showModal(
                  `<h2>Renommer la sauvegarde</h2><label class="save-label" for="rename-save">Nom de la sauvegarde</label><input class="save-input" id="rename-save" maxlength="80" value="${escapeText(entry.name)}"><p class="save-error" id="rename-error"></p><div class="close-row"><button id="cancel-rename">Annuler</button><button id="confirm-rename" class="primary">Enregistrer</button></div>`,
                );
                modalCancel = () => void render();
                $("cancel-rename").onclick = () => void render();
                $("confirm-rename").onclick = async () => {
                  try {
                    await saves.rename(
                      entry.id,
                      $<HTMLInputElement>("rename-save").value,
                    );
                    void updateLoad();
                    await render();
                  } catch {
                    $("rename-error").textContent =
                      "Le nouveau nom n’a pas pu être enregistré.";
                  }
                };
              }),
          );
        $("saved-list")
          .querySelectorAll<HTMLButtonElement>("[data-delete]")
          .forEach(
            (button) =>
              (button.onclick = () => {
                const entry = entries.find(
                  (e) => e.id === button.dataset.delete,
                )!;
                showModal(
                  `<h2>Supprimer cette sauvegarde ?</h2><p>La sauvegarde « ${escapeText(entry.name)} » sera supprimée. Les autres parties seront conservées.</p><p id="delete-error" class="save-error"></p><div class="close-row"><button id="cancel-delete">Annuler</button><button id="confirm-delete" class="primary">Supprimer</button></div>`,
                );
                modalCancel = () => void render();
                $("cancel-delete").onclick = () => void render();
                $("confirm-delete").onclick = async () => {
                  try {
                    await saves.remove(entry.id);
                    void updateLoad();
                    await render();
                  } catch {
                    $("delete-error").textContent =
                      "La sauvegarde n’a pas pu être supprimée.";
                  }
                };
              }),
          );
      };
      $("save-search").oninput = paint;
      paint();
    } catch {
      if (modalRevision !== revision) return;
      $("dialog").querySelector("p")!.textContent =
        "Le stockage des sauvegardes est indisponible. Vos fichiers exportés restent utilisables.";
    }
  };
  await render();
}
function start(s: State, loading = false, autosaveId?: string) {
  if (inGame) void persist();
  activeAutosaveId = autosaveId ?? newSaveId("auto");
  if (!loading) {
    s.priorities = [...state.priorities];
    s.doctrine = state.doctrine;
  }
  state = s;
  inGame = true;
  paused = loading;
  ended = false;
  speed = 1;
  selection.clear();
  planning = false;
  contextPoint = undefined;
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
      : state.level === 0
        ? "Votre vallée est protégée. Les autres royaumes sont déjà reliés : développez-vous avant d’ouvrir votre pont."
        : "Vos habitants vivent déjà leur aventure. Observez ou donnez vos premiers ordres.",
  );
}
function newGame() {
  const unlock = Math.min(
    LEVELS.length - 1,
    Math.max(0, Number(read(PROGRESS)) || 0),
  );
  showModal(
    `<span class="eyebrow">Une nouvelle histoire</span><h2>Choisissez votre vallée</h2><p>Vous incarnez la couronne <strong>Émeraude</strong>. Faites tomber les trois royaumes adverses tout en protégeant votre roi et votre peuple.</p><label class="check" for="level-select">Chapitre de la campagne</label><select id="level-select">${LEVELS.map((l, i) => `${i % 5 === 0 ? `<optgroup label="${l.biome}">` : ""}<option value="${i}" ${i > unlock ? "disabled" : ""}>${i + 1}. ${l.name}${i > unlock ? " · verrouillé" : ""}</option>${i % 5 === 4 ? "</optgroup>" : ""}`).join("")}</select><p>Dans la première vallée, votre territoire est plus vaste et isolé par les rivières. Deux ponts relient déjà les trois adversaires entre eux : développez votre royaume avant d’ouvrir votre propre passage.</p><p>Chaque camp commence avec 5 000 pièces. Chaque victoire ouvre la vallée suivante. Les adversaires se développent plus vite au fil des chapitres.</p><p>Vos parties précédentes restent dans la bibliothèque de sauvegardes.</p><div class="close-row"><button id="cancel-new">Retour</button><button class="primary" id="begin">Entrer dans la vallée</button></div>`,
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
    `<span class="eyebrow">Le livre des couronnes</span><h2>Le monde n’attend pas vos ordres.</h2><p>Chacun des quatre royaumes commence avec <strong>un château de neuf cases et un roi. Le premier chapitre donne cinq maisons au joueur et deux à chaque adversaire ; les suivants, quatre au joueur et quatre à six par adversaire selon la série</strong>. Dans la première vallée, le vert possède un bassin plus vaste, protégé par des rivières fermées. Les trois adversaires disposent de deux ponts et de chemins dégagés entre leurs territoires ; ils privilégient leurs ennemis déjà accessibles. Chaque camp reçoit 5 000 pièces. Les graphismes sont identiques ; seule la couleur change.</p><p>Les maisons produisent chacune des habitants de <strong>100 PV</strong>. Ils cherchent le terrain libre le plus proche, suivent votre doctrine et fondent rapidement de nouvelles maisons dès qu’une case libre respecte l’espacement. Se déplacer, travailler et combattre use leurs vies. Sur le sol, les habitants perdent au moins 0,12 PV par seconde. Au-delà de dix cases de leur roi, cette usure augmente progressivement, jusqu’à cinq fois le rythme de base. L’usure normale s’arrête sur une maison alliée. Un manque de soutien ou d’or peut toutefois continuer à faire perdre des PV. Tenir la position permet d’y rester. Le roi peut aussi s’abriter sur une maison, ou rester dans son château. Couper un arbre coûte 30 pièces, dégager un rocher 15 pièces. Les combats et destructions ne coûtent que des PV. Sans or, l’action attend. Fonder une maison coûte 150 pièces et jusqu’à 100 PV ; une unité plus forte conserve ses vies restantes et poursuit son activité.</p><p><strong>Rencontres :</strong> deux alliés fusionnent toujours en additionnant leurs PV, y compris sur une maison. Entre ennemis, le plus fort survit et perd 70 % des PV du vaincu. À égalité, les deux disparaissent. Le roi commence à 100 PV. Chaque maison au-delà des maisons de départ lui apporte 50 PV de force. Il gagne aussi 25 % des PV de ses autres unités, mais sa force reste plafonnée à 100 PV par maison restante. Les blessures sont conservées, même lorsque ce plafond est atteint. Les alliés qui le rejoignent fusionnent avec lui. Dans les neuf cases de son château, sa puissance défensive est multipliée par huit, avec 2 000 PV de remparts à user. Chaque maison soutient 200 PV d’armée. Au-delà de cette capacité totale, les unités perdent progressivement des PV, même sur une maison. Hors des maisons, les unités perdent davantage de vies lorsque le chemin vers une maison alliée dépasse quatre cases, jusqu’à 6 % de PV supplémentaires par seconde. Les routes de soutien ne traversent pas l’eau sans pont, les arbres, les rochers ou les barricades. Les unités de plus de 500 PV consomment 2 or par seconde pour 1 000 PV près des maisons ; ce coût augmente jusqu’à trois fois avec l’éloignement. Sans financement, elles perdent jusqu’à 3 % de leurs PV par seconde, même sur une maison. Hors d’une maison, les grandes unités ont aussi une usure proportionnelle à leur force. Dehors, le roi perd 5 % de ses PV par seconde (minimum 4 PV/s). Le retour au château arrête cette perte, sans effacer les dégâts. Sélectionnez le roi comme une unité pour le déplacer ; il peut raser les maisons adverses. Détruire du gazon ennemi coûte 2 PV plus 0,2 % des PV actuels par case ; raser une maison coûte 200 PV plus 5 % des PV actuels, sans dépense d’or. Ces coûts concernent aussi le roi et les monstres. Le terrain détruit redevient neutre, jusqu’à ce qu’une nouvelle maison y étende son gazon. Un royaume disparaît si son roi meurt, ou dès qu’il perd sa dernière maison, même si son roi et ses armées ont encore des PV. Le château s’effondre alors. Les adversaires peuvent s’éliminer entre eux.</p><p><strong>Économie :</strong> à 0 %, aucune rentrée d’or, y compris les barrages : seuls les fonds déjà accumulés financent les travaux et l’entretien. Pour chaque maison, le revenu par seconde vaut le taux d’impôt multiplié par 0,07 : 0,70 or à 10 %, 1,40 à 20 % et 2,10 à 30 %. Les revenus augmentent à tous les taux, sans seuil particulier. Les naissances passent progressivement de six secondes par maison à trois minutes. Le mode Bâtisseur fait aussi construire les unités fusionnées ; s’il manque de l’or, elles attendent près du chantier sur une maison et repartent dès qu’elles peuvent financer une fondation.</p><div class="sprite-sheet"><canvas id="sprites-preview" width="300" height="192" aria-label="Sprites quatre directions et trois gabarits"></canvas></div><p><strong>Trois gabarits :</strong> habitant sous 1 000 PV, guerrier de 1 000 à 10 000 PV inclus, colosse au-delà. Chaque gabarit existe de face, de dos, à gauche et à droite, dans les quatre couleurs.</p><ul><li><strong>Planification :</strong> sélectionner une ou plusieurs unités arrête toute la simulation. Cliquez ensuite la destination : seules les actions adaptées à cette case apparaissent. Le jeu reprend après l’ordre, sauf si vous aviez activé la pause manuelle. Échap annule la sélection.</li><li><strong>Affichage des PV :</strong> aucun chiffre au-dessus des unités par défaut, même pour les rois et les unités sélectionnées. Le survol affiche les PV exacts. Dans le menu, « Toujours afficher les PV des unités » active les nombres permanents ; ce choix est mémorisé dans ce navigateur.</li><li><strong>Sélection :</strong> clic ou rectangle sur les unités vertes. Maj ajoute à la sélection. Le roi est exclu des rectangles et de la touche A : il se sélectionne seul par un clic direct. Voir le roi recentre seulement la carte.</li><li><strong>Déplacer :</strong> choisissez une destination. Une case de château adverse vise son roi. À destination, les habitants reprennent leur doctrine ; le roi reste sur place.</li><li><strong>Capture royale :</strong> éliminer le roi d’un royaume transfère toutes ses maisons au vainqueur, avec leur production et leur territoire coloré. Cela vaut aussi entre adversaires. Son château s’effondre. Une mort sans vainqueur ne transfère aucune maison.</li><li><strong>Recommencer :</strong> le bouton ↶ en haut ou Recommencer la carte dans le menu remet le niveau à zéro après confirmation, sans perdre votre doctrine ni les niveaux débloqués.</li><li><strong>Fusionner :</strong> les unités sélectionnées convergent sur un point de rassemblement. Une fois les participants réunis, l’unité fusionnée reprend sa doctrine. Une unité morte ou réaffectée ne bloque pas l’attente.</li><li><strong>Maison :</strong> 150 or et jusqu’à 100 PV du bâtisseur. Une grosse unité conserve le reste de ses vies et peut continuer à bâtir. Aucune maison voisine, même en diagonale. La case doit être dégagée.</li><li><strong>Chantiers progressifs :</strong> un pont ou une barricade peut être ordonné sans disposer de tout son prix. À proximité du chantier, l’ouvrier investit l’or disponible puis les nouvelles rentrées. Le travail et l’or déjà investis restent enregistrés s’il meurt ou change d’ordre ; une autre unité peut terminer le reste. Le pont reste infranchissable et la barricade ne bloque pas la route tant que le chantier n’est pas achevé. L’ouvrier perd normalement des vies hors d’une maison, et doit toujours payer son entretien éventuel.</li><li><strong>Pont :</strong> 1 000 or au premier chantier, 500 pour reconstruire au même endroit. Le pont a 1 000 PV et peut être détruit ; les unités qui s’y trouvent tombent à l’eau. Tout camp peut traverser un pont ouvert ; l’ordre Attaquer permet de le détruire. Cliquez sur une rivière : l’unité rejoint la berge et construit exactement une case de pont. Une rivière plus large se traverse en posant chaque tronçon séparément.</li><li><strong>Barricade :</strong> 750 or, 1 500 PV. Elle bloque une case de terre. Les unités la contournent ; l’ordre Attaquer permet de la détruire.</li><li><strong>Barrage :</strong> 32 or. Il bloque le passage et rapporte 0,2 or par seconde et par case si les impôts sont supérieurs à 0 %. Il ne modifie pas le niveau d’eau.</li><li><strong>Grottes :</strong> présentes seulement dans certains niveaux, elles engendrent des monstres neutres sans économie. Ceux-ci ne perdent des PV qu’au combat ou en détruisant du territoire et fusionnent entre eux. Un pont ou une barricade détruite peut les libérer vers les autres camps. Détruire une grotte arrête les naissances. Ces zones sont facultatives pour la victoire.</li><li><strong>Impôts :</strong> de 0 à 30 %. Plus le taux est élevé, plus l’or rentre et plus les naissances ralentissent. L’automatisme ajuste le taux selon l’or et la population.</li><li><strong>Se déplacer :</strong> à l’arrivée, les habitants reprennent leur expansion et occupent les alentours. Le roi reste sur place. Les ordres par défaut sont réordonnables dans le conseil et la doctrine est sauvegardée.</li><li><strong>Travail en continu :</strong> construire des maisons, déblayer les arbres/rochers ou détruire les barricades les plus proches sur toute la carte accessible. Le bâtisseur peut combattre et raser les maisons adverses en avançant. Maisons : 150 or et jusqu’à 100 PV ; arbres : 30 or ; rochers : 15 or. Les destructions de barricades ne coûtent pas d’or. Quand l’or manque pour l’action suivante, ou qu’aucune tâche accessible ne reste, l’ordre prend fin et l’unité cherche une maison où s’abriter. Un nouvel ordre peut l’interrompre à tout moment.</li><li><strong>Tenir :</strong> arrête les déplacements. Sur une maison alliée, l’usure normale s’arrête ; les pénuries de soutien ou d’or restent dangereuses.</li><li><strong>Autonomie :</strong> annule les ordres et rend leurs choix aux habitants. Quand aucun travail accessible ne reste, ou quand l’or manque, les habitants attendent sur les maisons sans usure normale ; tous les alliés qui s’y rencontrent fusionnent. Ils repartent si un passage ou du travail s’ouvre. Votre doctrine donne la priorité aux maisons, à la destruction des maisons adverses ou à la coupe des arbres. Réordonnez-la dans le conseil. Une défense locale réagit aussi aux ennemis proches des maisons ou du château. Un ordre manuel reste prioritaire et le roi ne sort jamais seul. Les habitants évitent les rochers et ne construisent pas de ponts ou de barricades sans ordre. Toute autre action nécessite un ordre ; les adversaires gardent leur autonomie. L’épargne chantier réserve 1 000 pièces contre les fondations automatiques.</li></ul><p>Molette pour zoomer ; clic droit glissé ou Alt + glisser pour déplacer la carte. Sur écran tactile : glisser sélectionne, le bouton ↔ active le déplacement de carte. <kbd>Espace</kbd> pause, <kbd>Échap</kbd> annule un ordre, <kbd>F</kbd> fusion. La partie s’arrête quand cet onglet est masqué. Sauvegardes locales multiples : le bouton Sauver crée une copie nommée, Load game ouvre la bibliothèque et chaque nouvelle partie possède sa sauvegarde automatique. Les anciennes sauvegardes sont conservées. Export et import restent disponibles au menu. Limite : 150 unités par royaume.</p><div class="close-row"><span></span><button class="primary" id="close-help">J’ai compris</button></div>`,
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
    `<span class="eyebrow">La vallée vous attend</span><h2>Conseil du royaume</h2><p>Partie en pause. Sauvegarde locale dans ce navigateur ; exportez-la pour la conserver ou la transférer.</p><div class="orders"><button id="menu-save">Nouvelle sauvegarde</button><button id="menu-load">Charger une sauvegarde</button><button id="export">Exporter</button><button id="import">Importer</button><button id="back-title">Écran titre</button></div><label class="check"><input type="checkbox" id="show-unit-hp" ${renderer.showUnitHP ? "checked" : ""}> Toujours afficher les PV des unités</label><p class="tax-hint">Sinon, survolez une unité, un roi ou un monstre pour voir ses PV.</p><input type="file" accept=".json,application/json" id="import-file" class="hidden"><div class="close-row"><button id="restart">Recommencer la carte</button><button class="primary" id="resume">Reprendre</button></div>`,
  );
  $<HTMLInputElement>("show-unit-hp").onchange = (e) => {
    renderer.showUnitHP = (e.target as HTMLInputElement).checked;
    try {
      localStorage.setItem(HP_DISPLAY_KEY, renderer.showUnitHP ? "yes" : "no");
    } catch {
      /* The display preference remains available during this session. */
    }
  };
  $("menu-save").onclick = () => createNamedSave(true);
  $("menu-load").onclick = () => showSavedGames(true);
  $("resume").onclick = () => {
    closeModal();
    paused = false;
    updateUI();
  };
  $("back-title").onclick = async () => {
    if (!(await persist(true))) return;
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
  $("restart").onclick = () => requestRestart(true);
}
function requestRestart(fromMenu = false) {
  if (!inGame) return;
  const wasPaused = paused;
  paused = true;
  updateUI();
  showModal(
    `<span class="eyebrow">Une nouvelle tentative</span><h2>Recommencer ce niveau ?</h2><p>Vous retrouverez la même carte et les conditions de départ : 5 000 pièces par royaume, les maisons initiales et les rois à 100 PV. Votre doctrine et les niveaux débloqués sont conservés.</p><p>Une nouvelle partie sera créée ; la sauvegarde précédente restera disponible.</p><div class="close-row"><button id="no-restart">Annuler</button><button id="yes-restart" class="primary">Recommencer le niveau</button></div>`,
  );
  $("no-restart").onclick = () => {
    if (fromMenu) menu();
    else {
      closeModal();
      paused = wasPaused;
      updateUI();
    }
  };
  $("yes-restart").onclick = () => start(createGame(state.level, state.seed));
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
          Math.max(
            Number(read(PROGRESS)) || 0,
            Math.min(LEVELS.length - 1, state.level + 1),
          ),
        ),
      );
    } catch {}
  }
  const finishedState = state;
  window.setTimeout(() => {
    if (!inGame || state !== finishedState) return;
    showModal(
      `<span class="eyebrow">${state.result === "won" ? "La vallée est réunie" : "Votre roi est tombé"}</span><h2>${state.result === "won" ? "Une seule couronne." : "L’histoire ne s’arrête pas ici."}</h2><p>${state.result === "won" ? "Les trois royaumes adverses ont disparu. La vallée appartient à votre couronne." : "La couronne Émeraude a perdu son roi ou toute sa population et ses maisons. Rassemblez vos forces et protégez les chemins qui mènent au roi."}</p><p>${clock(state.time)} de règne · ${state.kingdoms[0].births} naissances · ${state.stats.merged} fusions dans la vallée</p><div class="close-row"><button id="end-title">Écran titre</button><button class="primary" id="end-next">${state.result === "won" && state.level < LEVELS.length - 1 ? "Vallée suivante" : "Rejouer"}</button></div>`,
    );
    $("end-title").onclick = async () => {
      if (!(await persist(true))) return;
      closeModal();
      inGame = false;
      $("title").classList.remove("hidden");
      updateLoad();
    };
    $("end-next").onclick = () =>
      start(
        createGame(
          state.result === "won" && state.level < LEVELS.length - 1
            ? state.level + 1
            : state.level,
          Date.now() >>> 0,
        ),
      );
  }, 1500);
}
function updateUI() {
  renderDoctrine();
  $<HTMLButtonElement>("restart-level").disabled = !inGame;
  const k = state.kingdoms[0],
    us = state.units.filter((u) => selection.has(u.id) && u.team === 0),
    upkeep = maintenanceCost(state, 0),
    income = goldIncome(state, 0),
    army = armyHP(state, 0),
    capacity = armyCapacity(state, 0);
  selection = new Set(us.map((u) => u.id));
  $("gold").textContent = Math.floor(k.gold).toLocaleString("fr-FR");
  $("population").textContent = Math.ceil(totalHP(state, 0)).toLocaleString(
    "fr-FR",
  );
  $("chapter").textContent =
    `${LEVELS[state.level].biome} · Vallée ${LEVELS[state.level].stage + 1}/5`;
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
  $("king-info").textContent =
    (king
      ? sheltered(state, king)
        ? `Dans le château · Défense ×8 · Remparts ${Math.ceil(k.fortification)} PV`
        : resting(state, king)
          ? "À l’abri sur une maison · Aucune usure"
          : `Hors du château · −${Math.max(4, king.hp * 0.05).toFixed(0)} PV/s`
      : "Votre couronne est tombée.") +
    (king ? ` · Plafond des maisons : ${kingCapacity(state, 0)} PV` : "");
  $<HTMLInputElement>("save-gold").checked = k.bridgeSaving;
  $("tax-value").textContent = `${Math.round(k.tax)} %`;
  $<HTMLInputElement>("tax").value = String(Math.round(k.tax));
  $<HTMLInputElement>("auto-tax").checked = k.automatic;
  $("tax-hint").textContent =
    `Une naissance par maison toutes les ${birthInterval(k.tax).toFixed(0)} s. Revenus : ${income.toFixed(2)} or/s. Entretien : ${upkeep.toFixed(2)} or/s. Armée : ${Math.ceil(army).toLocaleString("fr-FR")} / ${capacity.toLocaleString("fr-FR")} PV soutenus. ${army > capacity ? "Maisons insuffisantes : pertes de PV dans l’armée. " : ""}${k.gold + income < upkeep ? "Trésor insuffisant : pertes supplémentaires." : k.automatic ? "Le conseil ajuste vos impôts." : "Vous fixez vous-même le taux."}`;
  if (!us.length) {
    planning = false;
    contextPoint = undefined;
  }
  $("selection-count").textContent =
    `${us.length} unité${us.length > 1 ? "s" : ""}`;
  $("selection-info").textContent = us.length
    ? `${Math.ceil(us.reduce((n, u) => n + u.hp, 0)).toLocaleString("fr-FR")} PV au total${us.length === 1 ? ` · ${us[0].royal ? "Roi · " : ""}${["Habitant", "Guerrier", "Colosse"][tier(us[0].hp)]} · ${(lifeDrain(state, us[0]) + supportDrain(state, us[0])).toFixed(2)} PV/s · ${suppliedUpkeep(state, us[0]).toFixed(2)} or/s${isContinuousOrder(us[0].order) ? ` · ${{ "build-many": "Construction en continu", "clear-many": "Déblayage en continu", "demolish-many": "Destruction des barricades en continu" }[us[0].order as "build-many" | "clear-many" | "demolish-many"]}` : ""}` : ""}`
    : "Cliquez une unité verte ou tracez un rectangle. Le roi se sélectionne seul par clic.";
  $("command-help").textContent = planning
    ? contextPoint
      ? "Choisissez une action pour cette destination."
      : "La vallée est en pause. Cliquez une case de destination."
    : "Sélectionnez, puis cliquez une destination.";
  $("cancel-selection").classList.toggle("hidden", !planning);
  const actions =
    contextPoint && planning ? destinationActions(state, us, contextPoint) : [];
  $("selection-menu").classList.toggle("hidden", !contextPoint || !planning);
  $("selection-menu").innerHTML =
    contextPoint && planning
      ? `<span class="context-caption">Destination ${contextPoint.x}, ${contextPoint.y}</span>${actions.length ? actions.map((a) => `<button data-order="${a.order}" ${a.disabled ? "disabled" : ""}>${a.label}</button>`).join("") : '<span class="context-caption">Aucune action possible ici. Cliquez une autre case.</span>'}`
      : "";
  $("selection-menu")
    .querySelectorAll<HTMLButtonElement>("[data-order]")
    .forEach((b) => (b.onclick = () => chooseOrder(b.dataset.order as Order)));
  $("monster-status").classList.toggle(
    "hidden",
    !state.caves.length && !state.monsters.length,
  );
  $("monster-status").textContent =
    `☠ ${state.caves.length} grotte(s) · ${state.monsters.length} monstre(s) · ${Math.ceil(state.monsters.reduce((n, m) => n + m.hp, 0)).toLocaleString("fr-FR")} PV neutres`;
  $("events").innerHTML = state.events
    .slice(0, 4)
    .map(
      (e) =>
        `<div class="event"><time>${clock(e.time)}</time><span>${escapeText(e.text)}</span></div>`,
    )
    .join("");
  $("pause").textContent = paused || planning || speed === 0 ? "▶" : "Ⅱ";
  $("pause").title = planning
    ? "Annuler la sélection et reprendre"
    : speed === 0
      ? "Reprendre à vitesse normale (Espace)"
      : "Pause (Espace)";
  $<HTMLInputElement>("speed").value = String(speed);
  const speedText = `×${speed.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;
  $("speed-value").textContent = speedText;
  $("speed").setAttribute("aria-valuetext", speed === 0 ? "Pause" : speedText);
  $("paused-label").classList.toggle(
    "hidden",
    !(paused || planning || speed === 0) ||
      !inGame ||
      !$("modal").classList.contains("hidden"),
  );
  $("paused-label").textContent = planning
    ? "Choisissez une destination"
    : "Ⅱ Partie en pause";
  $("target-banner").classList.add("hidden");
}
function cancelPlanning() {
  selection.clear();
  planning = false;
  contextPoint = undefined;
  targetOrder = undefined;
  updateUI();
}
function chooseOrder(order: Order) {
  if (!contextPoint || !planning) return;
  const action = destinationActions(
    state,
    state.units.filter((u) => selection.has(u.id)),
    contextPoint,
  ).find((a) => a.order === order);
  if (!action || action.disabled) return;
  if (order === "auto" || order === "hold" || isContinuousOrder(order)) {
    command(state, [...selection], order);
    cancelPlanning();
    if (isContinuousOrder(order))
      toast(
        order === "demolish-many"
          ? "Destruction en continu : les barricades accessibles les plus proches, sans dépense d’or."
          : order === "build-many"
            ? "Construction en continu : 150 or par maison, avec les coûts habituels en PV."
            : "Déblayage en continu : 30 or par arbre, 15 par rocher. Les habitants cherchent les obstacles accessibles.",
      );
    return;
  }
  targetOrder = order;
  issue(contextPoint);
}

function issue(p: Point) {
  if (!targetOrder) return;
  const order = targetOrder;
  if (!tile(state, p.x, p.y)) return;
  if (order === "house" && !canHouse(state, p.x, p.y))
    return toast(
      "Une maison exige une case de terre libre, sans maison voisine, même en diagonale.",
    );
  if (order === "house" && state.kingdoms[0].gold < 150)
    return toast("Il faut 150 pièces pour une maison.");
  if (
    order === "bridge" ||
    (order === "dam" && tile(state, p.x, p.y)?.terrain !== "bridge")
  ) {
    const cr = crossing(state, p);
    if (!cr)
      return toast(
        "Choisissez une case d’eau adjacente à une terre ou à un pont accessible.",
      );
    const k = state.kingdoms[0];
    if (order === "dam" && k.gold < 32)
      return toast("Ressources insuffisantes pour cette construction.");
  }
  if (order === "barricade") {
    const site = structureAt(state, p);
    if (
      !canBarricade(state, p) &&
      !(site?.construction && site.team === 0 && site.kind === "barricade")
    )
      return toast(
        "Choisissez une case de terre libre, sans maison, château ni unité.",
      );
  }
  const construction = ["house", "bridge", "dam", "barricade"].includes(order);
  const ids = [...selection].filter(
    (id) => !construction || !state.units.find((u) => u.id === id)?.royal,
  );
  if (!ids.length)
    return toast(
      "Le roi commande et combat ; choisissez un habitant pour construire.",
    );
  if (order === "move" || order === "attack") {
    const t = tile(state, p.x, p.y);
    if (t?.castle !== undefined && t.castle !== 0) {
      const king = state.units.find((u) => u.team === t.castle && u.royal);
      if (king) p = { x: king.x, y: king.y };
    }
  }
  if (order === "bridge" || order === "barricade")
    state.kingdoms[0].bridgeSaving = true;
  command(state, ids, order, p);
  planning = false;
  contextPoint = undefined;
  selection.clear();
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
  $("confirm-title").onclick = async () => {
    if (!(await persist(true))) return;
    inGame = false;
    closeModal();
    $("title").classList.remove("hidden");
    updateLoad();
  };
};
$("new-game").onclick = newGame;
$("load-game").onclick = () => showSavedGames();
$("help").onclick = help;
$("title-help").onclick = help;
$("menu").onclick = () => (inGame ? menu() : undefined);
$("restart-level").onclick = () => requestRestart();
$("save").onclick = () => createNamedSave();
$("sidebar-toggle").onclick = () => $("sidebar").classList.toggle("open");
function togglePause() {
  if (planning) {
    cancelPlanning();
    paused = false;
    if (speed === 0) speed = 1;
  } else if (speed === 0) {
    speed = 1;
    paused = false;
  } else paused = !paused;
  updateUI();
}
$("pause").onclick = togglePause;
$<HTMLInputElement>("speed").oninput = (e) => {
  speed = Math.max(
    0,
    Math.min(5, Number((e.target as HTMLInputElement).value)),
  );
  if (speed === 0) accumulator = 0;
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
$("cancel-selection").onclick = cancelPlanning;
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
        right: boolean;
        moved: boolean;
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
    right: e.button === 2,
    moved: false,
    shift: e.shiftKey,
    id: e.pointerId,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
};
canvas.onpointermove = (e) => {
  const p = local(e);
  renderer.pointer = p;
  hover = renderer.point(p.x, p.y);
  const t = tile(state, hover.x, hover.y);
  $("inspect").textContent = t
    ? `${hover.x}, ${hover.y} · ${{ grass: "Terre", tree: "Forêt", rock: "Rochers", water: "Eau", bridge: "Pont", dam: "Barrage", barricade: "Barricade" }[t.terrain]}`
    : "";
  const construction = hover ? structureAt(state, hover) : undefined;
  if (construction)
    $("inspect").textContent +=
      ` · ${Math.ceil(construction.hp)} / ${construction.maxHp} PV${construction.construction ? ` · Chantier ${Math.floor((100 * construction.construction.paid) / construction.construction.total)} % · ${Math.ceil(construction.construction.total - construction.construction.paid)} or restants` : ""}`;
  else if (hover && t?.terrain === "water" && bridgeCost(state, hover) === 500)
    $("inspect").textContent += " · Reconstruction : 500 or";
  const cave = state.caves.find((c) => c.id === t?.cave);
  if (cave) $("inspect").textContent += ` · Grotte ${Math.ceil(cave.hp)} PV`;
  const monster = state.monsters.find(
    (m) => m.x === hover!.x && m.y === hover!.y,
  );
  if (monster)
    $("inspect").textContent += ` · Monstre ${Math.ceil(monster.hp)} PV`;
  if (!pointer) return;
  if ((p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2 > 25)
    pointer.moved = true;
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
canvas.onpointerleave = () => {
  renderer.pointer = undefined;
  hover = undefined;
  $("inspect").textContent = "";
};
canvas.onpointerup = (e) => {
  if (!pointer) return;
  const p = local(e);
  if (
    pointer.right &&
    !pointer.moved &&
    (p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2 <= 25
  ) {
    cancelPlanning();
  } else if (!pointer.pan) {
    if (!drag && !pointer.shift && planning && selection.size) {
      const dest = renderer.point(p.x, p.y);
      if (tile(state, dest.x, dest.y)) contextPoint = dest;
      updateUI();
    } else {
      contextPoint = undefined;
      targetOrder = undefined;
      if (drag)
        selection = rectangleSelection(
          state.units,
          selection,
          drag,
          (u) => renderer.screen(u.x, u.y),
          pointer.shift,
        );
      else {
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
      planning = selection.size > 0;
      accumulator = 0;
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
    cancelPlanning();
    if (!$("modal").classList.contains("hidden")) {
      const cancel = modalCancel;
      if (cancel) cancel();
      else closeModal();
    }
    updateUI();
  }
  if (!inGame || !$("modal").classList.contains("hidden")) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePause();
  }
  if (e.key.toLowerCase() === "f") chooseOrder("merge");
  if (e.key.toLowerCase() === "a") {
    selection = new Set(
      state.units.filter((u) => u.team === 0 && !u.royal).map((u) => u.id),
    );
    planning = selection.size > 0;
    contextPoint = undefined;
    accumulator = 0;
    updateUI();
  }
};
window.addEventListener("pagehide", () => {
  checkpoint();
  void persist();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    checkpoint();
    void persist();
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
    !planning &&
    speed > 0 &&
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
  renderer.draw(
    state,
    selection,
    contextPoint ?? hover,
    drag,
    contextPoint ? "destination" : targetOrder,
  );
  requestAnimationFrame(frame);
}
renderer.resize();
renderer.fit(state);
updateLoad();
updateUI();
requestAnimationFrame(frame);

setupPwa({
  notify: toast,
  beforeUpdate: () => {
    if (!inGame) return true;
    const wasPaused = paused;
    paused = true;
    updateUI();
    return new Promise<boolean>((resolve) => {
      showModal(
        `<span class="eyebrow">Une nouvelle version vous attend</span><h2>Sauvegarder avant la mise à jour ?</h2><p>Votre partie en cours sera sauvegardée avant le rechargement. Vous pourrez la reprendre avec Load game.</p><div class="close-row"><button id="cancel-update">Annuler</button><button id="confirm-update" class="primary">Sauvegarder et mettre à jour</button></div>`,
      );
      $("cancel-update").onclick = () => {
        closeModal();
        paused = wasPaused;
        updateUI();
        resolve(false);
      };
      modalCancel = () => $("cancel-update").click();
      $("confirm-update").onclick = async () => {
        if (!(await persist(true))) return;
        closeModal();
        resolve(true);
      };
    });
  },
  showInstallHelp: (message) => {
    const wasPaused = paused;
    paused = true;
    updateUI();
    showModal(
      `<span class="eyebrow">Emportez votre royaume</span><h2>Installer le jeu</h2><p>${message}</p><p>Après l’installation, le bouton ↻ permet de rechercher et d’appliquer les mises à jour. Votre partie reste sauvegardée dans ce navigateur.</p><div class="close-row"><span></span><button id="close-install" class="primary">Compris</button></div>`,
    );
    $("close-install").onclick = () => {
      closeModal();
      paused = wasPaused;
      updateUI();
    };
  },
});

function renderDoctrine() {
  const key = state.doctrine + state.priorities.join("/");
  if (key === shownDoctrine) return;
  shownDoctrine = key;
  $("doctrine-profile").innerHTML =
    Object.entries(DOCTRINES)
      .map(
        ([id, d]) =>
          `<option value="${id}" ${state.doctrine === id ? "selected" : ""}>${d.name}</option>`,
      )
      .join("") +
    `<option value="custom" ${state.doctrine === "custom" ? "selected" : ""}>Personnalisée</option>`;
  $("doctrine-description").textContent =
    state.doctrine === "custom"
      ? "Le premier travail réalisable à proximité prime. Réordonnez avec les flèches. Les ordres manuels passent devant."
      : DOCTRINES[state.doctrine].description +
        " Les ordres manuels restent prioritaires.";
  $("doctrine").classList.toggle("hidden", state.doctrine !== "custom");
  $("doctrine").innerHTML = state.priorities
    .map(
      (p, i) =>
        `<li><span>${PRIORITY_LABELS[p]}</span><button data-priority="${p}" data-shift="-1" ${i === 0 ? "disabled" : ""} aria-label="Monter : ${PRIORITY_LABELS[p]}">↑</button><button data-priority="${p}" data-shift="1" ${i === state.priorities.length - 1 ? "disabled" : ""} aria-label="Descendre : ${PRIORITY_LABELS[p]}">↓</button></li>`,
    )
    .join("");
}
$("doctrine").onclick = (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-priority]",
  );
  if (!button || button.disabled) return;
  const priorities = [...state.priorities];
  const i = priorities.indexOf(button.dataset.priority as Priority),
    j = i + Number(button.dataset.shift);
  if (i < 0 || j < 0 || j >= priorities.length) return;
  [priorities[i], priorities[j]] = [priorities[j], priorities[i]];
  setPriorities(state, priorities);
  renderDoctrine();
  persist();
  toast("Doctrine modifiée. Vos unités autonomes adaptent leurs priorités.");
};
renderDoctrine();

$("doctrine-profile").onchange = (event) => {
  setDoctrine(state, (event.target as HTMLSelectElement).value as DoctrineId);
  renderDoctrine();
  persist();
  toast("Doctrine adoptée. Vos habitants adaptent leurs décisions.");
};
