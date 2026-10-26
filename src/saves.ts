import { loadGame, saveGame, type State } from "./engine";
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
}
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
    return this.change(["entries", "games"], (tx) => {
      tx.objectStore("entries").delete(id);
      tx.objectStore("games").delete(id);
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
      if (previous && kind === "auto" && previous.updatedAt > now)
        return previous;
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
  automatic(id: string, s: State) {
    if (!id.startsWith("auto-"))
      return Promise.reject(new Error("Identifiant automatique incorrect"));
    return this.write(id, `Automatique · Vallée ${s.level + 1}`, "auto", s);
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
  async migrateLegacy(raw: string | null) {
    if (!raw) return false;
    const s = loadGame(raw);
    if (!s) return false;
    const canonical = saveGame(s);
    let hash = 2166136261;
    for (let i = 0; i < canonical.length; i++)
      hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619);
    const id = `legacy-${hash >>> 0}`;
    await this.enqueue(async () => {
      const previous = await this.backend.read(id);
      if (previous === canonical) return;
      const actualId = previous ? newSaveId("manual") : id;
      const now = Date.now(),
        { data, ...summary } = this.snapshot(s);
      await this.backend.put(
        {
          id: actualId,
          name: "Ancienne sauvegarde",
          kind: "manual",
          createdAt: now,
          updatedAt: now,
          ...summary,
        },
        data,
      );
    });
    return true;
  }
  checkpoint(id: string, s: State) {
    return JSON.stringify({ id, savedAt: Date.now(), data: saveGame(s) });
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
      await this.enqueue(async () => {
        const previous = await this.backend.metadata(c.id);
        if (
          previous &&
          (previous.kind !== "auto" || previous.updatedAt >= c.savedAt)
        )
          return;
        const { data, ...summary } = this.snapshot(s);
        await this.backend.put(
          {
            id: c.id,
            name: previous?.name ?? `Automatique · Vallée ${s.level + 1}`,
            kind: "auto",
            createdAt: previous?.createdAt ?? c.savedAt,
            updatedAt: c.savedAt,
            ...summary,
          },
          data,
        );
      });
      return true;
    } catch {
      return false;
    }
  }
}
