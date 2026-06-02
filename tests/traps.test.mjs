import test from "node:test";
import assert from "node:assert/strict";

import {
  selectRedirectTarget,
  trapActivationText,
  trapCanResolve,
  trapConsumesAttack,
  trapMatchesEvent,
  trapSummaryText,
  trapTriggerText
} from "../src/traps.js";

function trap(trigger) {
  return {
    type: "trap",
    name: "测试陷阱",
    trigger,
    text: "测试效果。"
  };
}

test("matches trap triggers to battle events", () => {
  assert.equal(trapMatchesEvent(trap("attackDestroy"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("counterBoost"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("attackShift"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("attackNegate"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("redirectAttack"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("weakenAttack"), "attack"), true);
  assert.equal(trapMatchesEvent(trap("directShield"), "direct"), true);
  assert.equal(trapMatchesEvent(trap("directRebound"), "direct"), true);
  assert.equal(trapMatchesEvent(trap("summonBurn"), "summon"), true);
});

test("does not match trap triggers to unrelated events", () => {
  assert.equal(trapMatchesEvent(trap("attackDestroy"), "direct"), false);
  assert.equal(trapMatchesEvent(trap("attackShift"), "direct"), false);
  assert.equal(trapMatchesEvent(trap("directShield"), "attack"), false);
  assert.equal(trapMatchesEvent(trap("summonBurn"), "attack"), false);
  assert.equal(trapMatchesEvent(trap("missingTrigger"), "attack"), false);
  assert.equal(trapMatchesEvent(null, "attack"), false);
});

test("provides player-facing trap trigger text", () => {
  assert.equal(trapTriggerText("attackDestroy"), "对手攻击时");
  assert.equal(trapTriggerText("attackShift"), "对手攻击时");
  assert.equal(trapTriggerText("attackNegate"), "对手攻击时");
  assert.equal(trapTriggerText("redirectAttack"), "对手攻击时");
  assert.equal(trapTriggerText("directShield"), "受到直接攻击时");
  assert.equal(trapTriggerText("summonBurn"), "对手召唤时");
  assert.equal(trapTriggerText("missingTrigger"), "未知触发");
});

test("marks which cancelled traps consume the attack chance", () => {
  assert.equal(trapConsumesAttack("counterBoost"), true);
  assert.equal(trapConsumesAttack("attackShift"), true);
  assert.equal(trapConsumesAttack("attackNegate"), true);
  assert.equal(trapConsumesAttack("redirectAttack"), false);
  assert.equal(trapConsumesAttack("attackDestroy"), false);
  assert.equal(trapConsumesAttack("directShield"), false);
  assert.equal(trapConsumesAttack("missingTrigger"), false);
});

test("summarizes trap trigger timing and effect", () => {
  assert.equal(trapSummaryText("counterBoost"), "对手攻击时 / 取消攻击并强化防线 / 消耗攻击");
  assert.equal(trapSummaryText("attackShift"), "对手攻击时 / 取消攻击并获得护盾 / 消耗攻击");
  assert.equal(trapSummaryText("attackNegate"), "对手攻击时 / 无效本次攻击 / 消耗攻击");
  assert.equal(trapSummaryText("redirectAttack"), "对手攻击时 / 改为攻击另一只怪兽");
  assert.equal(trapSummaryText("attackDestroy"), "对手攻击时 / 破坏攻击怪兽");
  assert.equal(trapSummaryText("missingTrigger"), "未知触发");
});

test("selects redirect targets from other monsters only", () => {
  const field = [
    { name: "低防", def: 900 },
    { name: "高防", def: 1900 },
    { name: "中防", def: 1400, tempDef: 300 }
  ];
  assert.equal(selectRedirectTarget(field, 0), 1);
  assert.equal(selectRedirectTarget(field, 1), 2);
  assert.equal(selectRedirectTarget([field[0], null, null], 0), -1);
  assert.equal(selectRedirectTarget(field, -1), 1);
});

test("checks whether redirect traps can actually resolve", () => {
  const owner = { field: [{ name: "当前", def: 900 }, null, null] };
  assert.equal(trapCanResolve(trap("redirectAttack"), "attack", { owner, context: { targetIndex: 0 } }), false);
  owner.field[1] = { name: "守卫", def: 2100 };
  assert.equal(trapCanResolve(trap("redirectAttack"), "attack", { owner, context: { targetIndex: 0 } }), true);
  assert.equal(trapCanResolve(trap("redirectAttack"), "direct", { owner, context: { targetIndex: -1 } }), false);
  assert.equal(trapCanResolve(trap("attackShift"), "attack", { owner, context: { targetIndex: 0 } }), true);
});

test("describes attack targets before asking for trap activation", () => {
  const owner = {
    field: [
      { name: "高防守卫", atk: 900, def: 2200, tempAtk: 0, tempDef: 0 },
      { name: "低防术士", atk: 1400, def: 900, tempAtk: 0, tempDef: 0 },
      null
    ]
  };
  const rival = {
    field: [
      { name: "突击者", atk: 1800, def: 1000, tempAtk: 0, tempDef: 0 }
    ]
  };

  assert.equal(
    trapActivationText(trap("redirectAttack"), "attack", { owner, rival, context: { attackerIndex: 0, targetIndex: 0 } }),
    "对手的突击者（ATK 1800 / DEF 1000）正在攻击你的高防守卫（ATK 900 / DEF 2200）。发动后会把攻击改为你的低防术士（ATK 1400 / DEF 900）。 注意：换位目标 DEF 900 低于当前目标 DEF 2200。 是否连锁发动「测试陷阱」？测试效果。"
  );
});
