import test from "node:test";
import assert from "node:assert/strict";

import { chooseAiAttackTarget } from "../src/ai.js";

function monster(overrides = {}) {
  return {
    type: "monster",
    name: "测试怪兽",
    atk: 1000,
    def: 1000,
    tempAtk: 0,
    tempDef: 0,
    mode: "attack",
    ...overrides
  };
}

test("AI attacks a beatable guard instead of a stronger defense target", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "星轨枪兵", atk: 1800 }),
    targets: [
      monster({ name: "疾风术士", mode: "defense", def: 1400 }),
      monster({ name: "铁壁守卫", mode: "defense", def: 2100 })
    ],
    playerLp: 4000
  });

  assert.equal(target, 0);
});

test("AI skips attacks that would only destroy its own monster", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "星轨枪兵", atk: 1800 }),
    targets: [
      monster({ name: "铁壁守卫", mode: "defense", def: 2100 })
    ],
    playerLp: 4000
  });

  assert.equal(target, null);
});

test("AI uses direct attack permission when the board blocks normal attacks", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "星轨枪兵", atk: 1800 }),
    targets: [
      monster({ name: "铁壁守卫", mode: "defense", def: 2100 })
    ],
    playerLp: 4000,
    canUseDirect: true
  });

  assert.equal(target, -1);
});

test("AI attacks directly when there are no defending monsters", () => {
  assert.equal(chooseAiAttackTarget({
    attacker: monster({ name: "星轨枪兵", atk: 1800 }),
    targets: [],
    playerLp: 4000
  }), -1);
});
