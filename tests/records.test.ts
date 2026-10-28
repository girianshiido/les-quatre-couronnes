import { test } from "node:test";
import assert from "node:assert/strict";
import { BestTimes, recordTime } from "../src/records";

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

test("first victory sets a persistent best; only a strictly faster run replaces it", async () => {
  const disk = storage(),
    book = new BestTimes(disk);
  assert.equal(book.best(0), undefined);
  const first = await book.record(0, 120);
  assert.deepEqual(first, {
    currentMs: 120000,
    bestMs: 120000,
    previousMs: undefined,
    first: true,
    improved: true,
    persisted: true,
  });
  const slower = await book.record(0, 150);
  assert.equal(slower.improved, false);
  assert.equal(slower.first, false);
  assert.equal(slower.bestMs, 120000);
  assert.equal(new BestTimes(disk).best(0), 120000);
  const equal = await book.record(0, 120);
  assert.equal(equal.improved, false);
  const faster = await book.record(0, 100);
  assert.equal(faster.previousMs, 120000);
  assert.equal(faster.bestMs, 100000);
  assert.equal(faster.improved, true);
  assert.equal(faster.first, false);
  assert.equal(new BestTimes(disk).best(0), 100000);
});

test("records are independent for all 25 cards and old map sizes", async () => {
  const disk = storage(),
    book = new BestTimes(disk);
  for (let level = 0; level < 25; level++) await book.record(level, 10 + level);
  await book.record(0, 1, 64);
  const reloaded = new BestTimes(disk);
  for (let level = 0; level < 25; level++)
    assert.equal(reloaded.best(level), (10 + level) * 1000);
  assert.equal(reloaded.best(0, 64), 1000);
  assert.equal(reloaded.best(0, 80), undefined);
});

test("simulation floating-point drift does not invent new records on an equal run", async () => {
  const book = new BestTimes(storage());
  await book.record(0, 120.00000000001);
  assert.equal((await book.record(0, 119.99999999999)).improved, false);
  assert.equal((await book.record(0, 119.998)).improved, true);
  assert.equal(book.best(0), 119998);
});

test("invalid stored times are ignored without erasing other maps", async () => {
  const disk = storage(),
    book = new BestTimes(disk);
  await book.record(1, 100);
  const key = [...disk.data.keys()][0];
  for (const value of [
    "-1",
    "NaN",
    "Infinity",
    "12x",
    "1e3",
    "1.5",
    "9007199254740992",
    "{}",
    "",
  ]) {
    disk.data.set(key, value);
    const fresh = new BestTimes(disk);
    assert.equal(fresh.best(1), undefined, value);
  }
  const result = await new BestTimes(disk).record(1, 12);
  assert.equal(result.first, true);
  assert.equal(result.bestMs, 12000);
});

test("blocked persistence retains this session's best and reports it truthfully", async () => {
  let blocked = true;
  const disk = storage();
  const book = new BestTimes({
    getItem: disk.getItem,
    setItem: (k, v) => {
      if (blocked) throw new Error("quota");
      disk.setItem(k, v);
    },
  });
  assert.equal((await book.record(0, 100)).persisted, false);
  assert.equal((await book.record(0, 120)).bestMs, 100000);
  blocked = false;
  assert.equal((await book.record(0, 130)).persisted, true);
  assert.equal(new BestTimes(disk).best(0), 100000);
  const unavailable = new BestTimes({
    getItem: () => {
      throw new Error("disabled");
    },
    setItem: () => {
      throw new Error("disabled");
    },
  });
  await unavailable.record(0, 60);
  assert.equal((await unavailable.record(0, 90)).bestMs, 60000);
});

test("separate instances observe the durable better time and cannot replace it with a slower one", async () => {
  const disk = storage(),
    a = new BestTimes(disk),
    b = new BestTimes(disk);
  await a.record(0, 120);
  await b.record(0, 100);
  await a.record(0, 150);
  assert.equal(new BestTimes(disk).best(0), 100000);
});

test("simultaneous wins use the supplied cross-tab lock and keep the quickest time", async () => {
  const disk = storage();
  const queues = new Map<string, Promise<unknown>>();
  let calls = 0;
  const lock = <T>(key: string, task: () => T): Promise<T> => {
    calls++;
    const result = (queues.get(key) ?? Promise.resolve()).then(task);
    queues.set(key, result);
    return result;
  };
  const a = new BestTimes(disk, lock),
    b = new BestTimes(disk, lock);
  const [first, second] = await Promise.all([
    a.record(0, 100),
    b.record(0, 120),
  ]);
  assert.equal(first.first, true);
  assert.equal(second.first, false);
  assert.equal(second.improved, false);
  assert.equal(calls, 2);
  assert.equal(new BestTimes(disk).best(0), 100000);
});

test("unavailable lock falls back to ordinary local saving", async () => {
  const disk = storage();
  const book = new BestTimes(disk, async () => {
    throw new Error("lock blocked");
  });
  assert.equal((await book.record(0, 90)).persisted, true);
  assert.equal(new BestTimes(disk).best(0), 90000);
});

test("invalid map or time cannot pollute the record book", async () => {
  const disk = storage(),
    book = new BestTimes(disk);
  for (const level of [-1, 25, 1.5, NaN])
    await assert.rejects(book.record(level, 10));
  for (const time of [-1, NaN, Infinity, Number.MAX_VALUE])
    await assert.rejects(book.record(0, time));
  await assert.rejects(book.record(0, 10, 2));
  assert.equal(disk.data.size, 0);
});

test("time formatting carries seconds and minutes without displaying sixty seconds", () => {
  assert.equal(recordTime(0), "0:00,0");
  assert.equal(recordTime(59950), "1:00,0");
  assert.equal(recordTime(123400), "2:03,4");
  assert.equal(recordTime(3600000), "60:00,0");
});
