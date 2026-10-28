export interface RecordResult {
  currentMs: number;
  bestMs: number;
  previousMs?: number;
  improved: boolean;
  first: boolean;
  persisted: boolean;
}
type RecordStorage = Pick<Storage, "getItem" | "setItem">;
type RecordLock = <T>(name: string, task: () => T) => Promise<T>;

export function recordTime(ms: number) {
  const tenths = Math.round(ms / 100),
    minutes = Math.floor(tenths / 600);
  return `${minutes}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")},${tenths % 10}`;
}

/** One independent key per map. Legacy map sizes do not replace records on the
 * current 48×48 campaign. Web Locks serialize simultaneous wins across tabs. */
export class BestTimes {
  private memory = new Map<string, number>();
  constructor(
    private storage: RecordStorage | undefined = (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
    private lock: RecordLock | undefined = globalThis.navigator?.locks
      ? (name, task) => globalThis.navigator.locks.request(name, task)
      : undefined,
  ) {}
  private key(level: number, size: number) {
    if (
      !Number.isInteger(level) ||
      level < 0 ||
      level >= 25 ||
      !Number.isInteger(size) ||
      size < 32 ||
      size > 128
    )
      throw new Error("Carte incorrecte");
    return `quatre-couronnes-best-v1-campaign2-${size}-${level}`;
  }
  best(level: number, size = 48): number | undefined {
    const key = this.key(level, size);
    let stored: number | undefined;
    try {
      const raw = this.storage?.getItem(key);
      if (raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)))
        stored = Number(raw);
    } catch {}
    const cached = this.memory.get(key);
    if (cached !== undefined)
      stored = stored === undefined ? cached : Math.min(cached, stored);
    if (stored !== undefined) this.memory.set(key, stored);
    return stored;
  }
  async record(
    level: number,
    seconds: number,
    size = 48,
  ): Promise<RecordResult> {
    const key = this.key(level, size),
      currentMs = Math.round(seconds * 1000);
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      !Number.isSafeInteger(currentMs)
    )
      throw new Error("Temps incorrect");
    const save = () => {
      const previousMs = this.best(level, size),
        bestMs = Math.min(previousMs ?? currentMs, currentMs);
      const improved = previousMs === undefined || currentMs < previousMs;
      this.memory.set(key, bestMs);
      let persisted = false;
      try {
        this.storage?.setItem(key, String(bestMs));
        persisted = !!this.storage;
      } catch {}
      return {
        currentMs,
        bestMs,
        previousMs,
        improved,
        first: previousMs === undefined,
        persisted,
      };
    };
    if (this.lock) {
      try {
        return await this.lock(key, save);
      } catch {}
    }
    return save();
  }
}
