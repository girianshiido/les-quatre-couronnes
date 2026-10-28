import { loadGame, saveGame, type State } from "./engine";
export const AUTO_SAVE_ID = "auto-current";
const AUTO_SAVE_NAME = "Reprise automatique";
export interface SaveEntry {
  id: string;
  name: string;
  kind: "auto" | "manual";
  createdAt: number;
  updatedAt: number;
  level: number;
  seconds: number;
  units: number;
  houses: number;
}
export interface SaveBackend {
  list(): Promise<SaveEntry[]>;
  metadata(id: string): Promise<SaveEntry | undefined>;
  read(id: string): Promise<string | undefined>;
  put(entry: SaveEntry, data: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  updateAutomatic(
    candidate?: SaveRecord,
    mode?: AutomaticMode,
  ): Promise<SaveEntry | undefined>;
}
export interface SaveRecord {
  entry: SaveEntry;
  data: string;
}
export type AutomaticMode = "replace" | "newer" | "fallback";
export function newSaveId(kind: "auto" | "manual") {
  return `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
export class IndexedSaveBackend implements SaveBackend {
  private opening?: Promise<IDBDatabase>;
  constructor(private factory = globalThis.indexedDB) {}
  private db() {
    return (this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) return reject(new Error("Stockage indisponible"));
      const req = this.factory.open("quatre-couronnes-saves", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("entries", { keyPath: "id" });
        req.result.createObjectStore("games", { keyPath: "id" });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(
          new Error(
            "Fermez les autres onglets du jeu pour ouvrir les sauvegardes.",
          ),
        );
    }));
  }
  private async request<T>(store: string, key?: string): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly"),
        req =
          key === undefined
            ? tx.objectStore(store).getAll()
            : tx.objectStore(store).get(key);
      let value: T;
      req.onsuccess = () => {
        value = req.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(tx.error ?? req.error ?? new Error("Lecture interrompue"));
    });
  }
  list() {
    return this.request<SaveEntry[]>("entries");
  }
  metadata(id: string) {
    return this.request<SaveEntry | undefined>("entries", id);
  }
  async read(id: string) {
    return (
      await this.request<{ id: string; data: string } | undefined>("games", id)
    )?.data;
  }
  private async change(stores: string[], body: (tx: IDBTransaction) => void) {
    const db = await this.db();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Écriture interrompue"));
      try {
        body(tx);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  put(entry: SaveEntry, data: string) {
    return this.change(["entries", "games"], (tx) => {
      tx.objectStore("entries").put(entry);
      tx.objectStore("games").put({ id: entry.id, data });
    });
  }
  /** Select, replace and prune in one transaction. Other tabs cannot interleave
   * an older checkpoint or a new legacy autosave between these operations. */
  async updateAutomatic(
    candidate?: SaveRecord,
    mode: AutomaticMode = "replace",
  ) {
    const db = await this.db();
    return new Promise<SaveEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(["entries", "games"], "readwrite"),
        entries = tx.objectStore("entries"),
        games = tx.objectStore("games");
      let result: SaveEntry | undefined, failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Reprise interrompue"));
      const request = entries.getAll();
      request.onsuccess = () => {
        const all = request.result as SaveEntry[];
        const current = all.find((e) => e.id === AUTO_SAVE_ID);
        if (current && current.kind !== "auto") {
          failure = new Error(
            "Cet emplacement contient une copie à conserver.",
          );
          tx.abort();
          return;
        }
        const automatic = all.filter((e) => e.kind === "auto");
        const ranked = automatic.map((entry) => ({ entry, incoming: false }));
        if (candidate) ranked.push({ entry: candidate.entry, incoming: true });
        ranked.sort(
          (a, b) =>
            (mode === "fallback"
              ? Number(a.incoming) - Number(b.incoming)
              : 0) ||
            b.entry.updatedAt - a.entry.updatedAt ||
            (a.incoming !== b.incoming
              ? a.incoming === (mode === "replace")
                ? -1
                : 1
              : a.entry.id.localeCompare(b.entry.id)),
        );
        let next = 0;
        const keep = (chosen: SaveRecord) => {
          result = {
            ...chosen.entry,
            id: AUTO_SAVE_ID,
            kind: "auto",
            name: AUTO_SAVE_NAME,
            createdAt: current?.createdAt ?? chosen.entry.createdAt,
          };
          entries.put(result);
          games.put({ id: AUTO_SAVE_ID, data: chosen.data });
          for (const old of automatic)
            if (old.id !== AUTO_SAVE_ID) {
              entries.delete(old.id);
              games.delete(old.id);
            }
        };
        const findValid = () => {
          const choice = ranked[next++];
          // If every existing automatic file is unreadable, leave it intact.
          if (!choice) return;
          if (choice.incoming) {
            keep(candidate!);
            return;
          }
          const read = games.get(choice.entry.id);
          read.onsuccess = () => {
            const data = read.result?.data;
            if (typeof data === "string" && loadGame(data))
              keep({ entry: choice.entry, data });
            else findValid();
          };
        };
        findValid();
      };
    });
  }
  rename(id: string, name: string) {
    return this.change(["entries"], (tx) => {
      const store = tx.objectStore("entries"),
        req = store.get(id);
      req.onsuccess = () => {
        if (req.result) store.put({ ...req.result, name });
      };
    });
  }
  remove(id: string) {
    return this.removeMany([id]);
  }
  removeMany(ids: string[]) {
    return this.change(["entries", "games"], (tx) => {
      for (const id of new Set(ids)) {
        tx.objectStore("entries").delete(id);
        tx.objectStore("games").delete(id);
      }
    });
  }
}
export class SaveLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private backend: SaveBackend = new IndexedSaveBackend()) {}
  private enqueue<T>(fn: () => Promise<T>) {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  private snapshot(s: State) {
    return {
      data: saveGame(s),
      level: s.level,
      seconds: s.time,
      units: s.units.filter((u) => u.team === 0 && !u.royal && u.hp > 0).length,
      houses: s.houses.filter((h) => h.team === 0).length,
    };
  }
  private write(
    id: string,
    name: string,
    kind: SaveEntry["kind"],
    s: State,
    now = Date.now(),
  ) {
    const { data, ...summary } = this.snapshot(s);
    return this.enqueue(async () => {
      const previous = await this.backend.metadata(id);
      if (previous && previous.kind !== kind)
        throw new Error("Cette sauvegarde doit être conservée.");
      const entry: SaveEntry = {
        id,
        name: previous?.name ?? name,
        kind,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        ...summary,
      };
      await this.backend.put(entry, data);
      return entry;
    });
  }
  private automaticSnapshot(s: State, now = Date.now()): SaveRecord {
    const { data, ...summary } = this.snapshot(s);
    return {
      data,
      entry: {
        id: AUTO_SAVE_ID,
        name: AUTO_SAVE_NAME,
        kind: "auto",
        createdAt: now,
        updatedAt: now,
        ...summary,
      },
    };
  }
  automatic(s: State) {
    const candidate = this.automaticSnapshot(s);
    return this.enqueue(() => this.backend.updateAutomatic(candidate));
  }
  consolidateAutomatic() {
    return this.enqueue(() => this.backend.updateAutomatic());
  }
  create(s: State, name: string) {
    return this.write(
      newSaveId("manual"),
      name.trim().slice(0, 80) || `Vallée ${s.level + 1}`,
      "manual",
      s,
    );
  }
  async list() {
    await this.queue;
    return (await this.backend.list()).sort(
      (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
    );
  }
  async load(id: string) {
    await this.queue;
    const raw = await this.backend.read(id);
    return raw ? loadGame(raw) : undefined;
  }
  rename(id: string, name: string) {
    const value = name.trim().slice(0, 80);
    if (!value)
      return Promise.reject(new Error("Donnez un nom à la sauvegarde."));
    return this.enqueue(() => this.backend.rename(id, value));
  }
  remove(id: string) {
    return this.enqueue(() => this.backend.remove(id));
  }
  removeMany(ids: string[], protectedId?: string) {
    const unique = [...new Set(ids)];
    if (protectedId && unique.includes(protectedId))
      return Promise.reject(
        new Error("La sauvegarde de la partie en cours est protégée."),
      );
    return this.enqueue(() => this.backend.removeMany(unique));
  }
  async migrateLegacy(raw: string | null) {
    if (!raw) return false;
    const s = loadGame(raw);
    if (!s) return false;
    await this.enqueue(async () => {
      // The old single slot has no reliable timestamp. Use it only as a
      // fallback; a modern autosave or recovered closing checkpoint wins.
      await this.backend.updateAutomatic(this.automaticSnapshot(s), "fallback");
    });
    return true;
  }
  checkpoint(s: State) {
    return JSON.stringify({
      id: AUTO_SAVE_ID,
      savedAt: Date.now(),
      data: saveGame(s),
    });
  }
  async restoreCheckpoint(raw: string | null) {
    if (!raw) return false;
    try {
      const c = JSON.parse(raw);
      if (
        typeof c.id !== "string" ||
        !c.id.startsWith("auto-") ||
        typeof c.savedAt !== "number" ||
        !Number.isFinite(c.savedAt) ||
        c.savedAt < 0 ||
        typeof c.data !== "string"
      )
        return false;
      const s = loadGame(c.data);
      if (!s) return false;
      const candidate = this.automaticSnapshot(s, c.savedAt);
      await this.enqueue(() =>
        this.backend.updateAutomatic(candidate, "newer"),
      );
      return true;
    } catch {
      return false;
    }
  }
}
