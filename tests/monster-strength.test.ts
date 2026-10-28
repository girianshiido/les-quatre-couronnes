import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, LEVELS, loadGame, saveGame } from "../src/engine";
import { monsterStrength, spawnMonster } from "../src/monsters";

test("first cave starts with a 2000 HP guardian and produces 500 HP reinforcements", () => {
  const first = LEVELS.findIndex((l) => l.caves),
    s = createGame(first),
    cave = s.caves[0];
  assert.ok(cave);
  assert.equal(s.monsters[0].hp, 2000);
  assert.equal(cave.spawnHp, 500);
  spawnMonster(s, cave);
  assert.equal(s.monsters.at(-1)!.hp, 500);
});
test("every cave guardian and birth follows increasing campaign difficulty, without adding caves", () => {
  let guardian = 0,
    birth = 0;
  for (let level = 0; level < LEVELS.length; level++) {
    const s = createGame(level);
    if (!LEVELS[level].caves) {
      assert.equal(s.monsters.length, 0);
      continue;
    }
    const profile = monsterStrength(level);
    assert.ok(profile.guardian >= guardian && profile.birth >= birth);
    assert.ok(s.caves.every((c) => c.spawnHp === profile.birth));
    assert.ok(s.monsters.every((m) => m.hp === profile.guardian));
    guardian = profile.guardian;
    birth = profile.birth;
  }
});
test("old cave births are upgraded while existing monster HP, cave progress and custom births remain intact", () => {
  const s = createGame(3),
    cave = s.caves[0];
  cave.spawnHp = 100;
  cave.timer = 17;
  s.monsters[0].hp = 4321;
  const loaded = loadGame(saveGame(s))!;
  assert.equal(loaded.caves[0].spawnHp, 500);
  assert.equal(loaded.caves[0].timer, 17);
  assert.equal(loaded.monsters[0].hp, 4321);
  spawnMonster(loaded, loaded.caves[0]);
  assert.equal(loaded.monsters.at(-1)!.hp, 500);
  loaded.caves[0].spawnHp = 777;
  assert.equal(loadGame(saveGame(loaded))!.caves[0].spawnHp, 777);
});
