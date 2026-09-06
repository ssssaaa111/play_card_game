import test from "node:test";
import assert from "node:assert/strict";

import { battleLogText, battleStatLabel, battleWearAmount, describeBattleOutcome } from "../src/battle.js";

function monster(overrides = {}) {
  return {
    type: "monster",
    name: "测试怪兽",
    atk: 1000,
    def: 800,
    tempAtk: 0,
    tempDef: 0,
    mode: "attack",
    ...overrides
  };
}

test("labels battle stats by monster mode", () => {
  assert.equal(battleStatLabel(monster({ atk: 1500 })), "攻击 1500");
  assert.equal(battleStatLabel(monster({ mode: "defense", def: 1800 })), "守备 1800");
});

test("describes direct attacks as direct LP damage", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const outcome = describeBattleOutcome(attacker, null);

  assert.equal(outcome.kind, "direct");
  assert.equal(outcome.rawDamage, 1800);
  assert.equal(outcome.finalDamage, 1800);
  assert.match(battleLogText(attacker, null, outcome, outcome.finalDamage), /攻击 1800，造成 1800/);
});

test("describes attack wins, guard breaks, counters, and clashes", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const weak = monster({ name: "铁壁守卫", atk: 900 });
  const guard = monster({ name: "守备者", mode: "defense", def: 1200 });
  const highGuard = monster({ name: "高防守卫", mode: "defense", def: 2100 });
  const equalGuard = monster({ name: "同防守卫", mode: "defense", def: 1800 });
  const strong = monster({ name: "熔核巨像", atk: 2200 });
  const equal = monster({ name: "同攻怪", atk: 1800 });

  assert.equal(describeBattleOutcome(attacker, weak).kind, "attackWin");
  assert.equal(describeBattleOutcome(attacker, guard).kind, "breakDefense");
  assert.equal(describeBattleOutcome(attacker, highGuard).kind, "guardCounter");
  assert.equal(describeBattleOutcome(attacker, equalGuard).kind, "guardHold");
  assert.equal(describeBattleOutcome(attacker, strong).kind, "countered");
  assert.equal(describeBattleOutcome(attacker, equal).kind, "clash");
  assert.match(battleLogText(attacker, guard, describeBattleOutcome(attacker, guard)), /守备怪兽不造成生命值伤害/);
});

test("describes divine piercing damage against defense monsters", () => {
  const attacker = monster({ name: "创星神龙", atk: 4000, piercingDamage: { type: "divinePierce" } });
  const guard = monster({ name: "铁壁守卫", mode: "defense", def: 2100 });
  const outcome = describeBattleOutcome(attacker, guard);

  assert.equal(outcome.kind, "pierceDefense");
  assert.equal(outcome.rawDamage, 1900);
  assert.equal(outcome.finalDamage, 1900);
  assert.equal(outcome.destroysTarget, true);
  assert.match(battleLogText(attacker, guard, outcome, outcome.finalDamage), /神格贯穿差值 1900，造成 1900/);
});

test("legacy shield fields no longer alter direct damage", () => {
  const attacker = monster({ name: "创星神龙", atk: 4000 });
  const outcome = describeBattleOutcome(attacker, null, { shield: 800 }, { shield: 800 });

  assert.equal(outcome.kind, "direct");
  assert.equal(outcome.rawDamage, 4000);
  assert.equal(outcome.finalDamage, 4000);
  assert.match(battleLogText(attacker, null, outcome, outcome.finalDamage), /造成 4000/);
});

test("keeps attackers alive when they fail to break defense mode monsters", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const highGuard = monster({ name: "铁壁守卫", mode: "defense", def: 2100 });
  const outcome = describeBattleOutcome(attacker, highGuard);

  assert.equal(outcome.kind, "guardCounter");
  assert.equal(outcome.rawDamage, 300);
  assert.equal(outcome.finalDamage, 300);
  assert.equal(outcome.destroysAttacker, false);
  assert.equal(outcome.destroysTarget, false);
  assert.equal(outcome.wear, 150);
  assert.match(battleLogText(attacker, highGuard, outcome, outcome.finalDamage), /守备反击/);
});

test("holds defense mode monsters on equal battle values", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const equalGuard = monster({ name: "同防守卫", mode: "defense", def: 1800 });
  const outcome = describeBattleOutcome(attacker, equalGuard);

  assert.equal(outcome.kind, "guardHold");
  assert.equal(outcome.rawDamage, 0);
  assert.equal(outcome.destroysAttacker, false);
  assert.equal(outcome.destroysTarget, false);
  assert.match(battleLogText(attacker, equalGuard, outcome), /挡下攻击/);
});

test("calculates capped battle wear for surviving defenders", () => {
  assert.equal(battleWearAmount(-400), 150);
  assert.equal(battleWearAmount(-1600), 400);
  assert.equal(battleWearAmount(-3000), 500);
});
