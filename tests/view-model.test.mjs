import test from "node:test";
import assert from "node:assert/strict";

import { describeHandAction, duelHintText, phaseLabel, turnLabel } from "../src/view-model.js";

test("builds phase and turn labels from state", () => {
  assert.equal(phaseLabel({ started: false }), "准备决斗");
  assert.equal(phaseLabel({ started: true, paused: true }), "已暂停");
  assert.equal(phaseLabel({ started: true, gameOver: true }), "决斗结束");
  assert.equal(phaseLabel({ started: true, actionWindow: "targetSelect" }), "选择目标");
  assert.equal(phaseLabel({ started: true, phase: "draw" }), "抽卡阶段");
  assert.equal(phaseLabel({ started: true, phase: "main" }), "主要阶段");
  assert.equal(phaseLabel({ started: true, phase: "battle" }), "战斗阶段");

  assert.equal(turnLabel({ started: false }), "点击开始");
  assert.equal(turnLabel({ started: true, paused: true }), "暂停中");
  assert.equal(turnLabel({ started: true, actionWindow: "targetSelect" }), "选择魔法目标");
  assert.equal(turnLabel({ started: true, turn: "ai" }), "AI 正在行动");
});

test("builds contextual duel hints", () => {
  assert.equal(duelHintText({ started: false }), "开始后自动抽卡");
  assert.equal(duelHintText({ started: true, paused: true }), "点击继续恢复决斗");
  assert.equal(duelHintText({ started: true, pendingPrompt: "选择我方怪兽" }), "选择我方怪兽");
  assert.equal(duelHintText({ started: true, scenarioId: "target", scenarioGoal: "验证目标选择" }), "测试目标：验证目标选择");
  assert.equal(duelHintText({ started: true, turn: "ai" }), "等待 AI 行动");
  assert.equal(duelHintText({ started: true, canSpell: true }), "可以发动手牌里的魔法卡");
  assert.equal(duelHintText({ started: true, canSummon: true }), "可以召唤手牌怪兽");
  assert.equal(duelHintText({ started: true, canSetTrap: true }), "可以盖放陷阱卡");
  assert.equal(duelHintText({ started: true, canChangeMode: true }), "可以切换怪兽表示");
});

test("describes hand actions for common cards", () => {
  const monster = { type: "monster", uid: "m1" };
  const spell = { type: "spell", uid: "s1" };
  const trap = { type: "trap", uid: "t1" };
  const base = { started: true, canAct: true, hasMonsterZone: true, hasTrapZone: true };

  assert.deepEqual(describeHandAction(monster, base), {
    ok: true,
    label: "可召唤",
    reason: "选中后点击我方空召唤区。"
  });
  assert.equal(describeHandAction(monster, { ...base, summonedThisTurn: true }).label, "已召唤");
  assert.equal(describeHandAction(trap, { ...base, hasTrapZone: false }).label, "陷阱满");
  assert.equal(describeHandAction(spell, { ...base, spellValidation: { ok: false, reason: "生命值已满。" } }).reason, "生命值已满。");
  assert.equal(describeHandAction(spell, { ...base, selected: true, spellValidation: { ok: true } }).label, "待确认");
  assert.deepEqual(describeHandAction(monster, {
    ...base,
    monsterValidation: { ok: false, reason: "当前阶段不能召唤这只怪兽。" }
  }), {
    ok: false,
    label: "不可召唤",
    reason: "当前阶段不能召唤这只怪兽。"
  });
  assert.deepEqual(describeHandAction(trap, {
    ...base,
    trapValidation: { ok: false, reason: "当前阶段不能盖放这张陷阱。" }
  }), {
    ok: false,
    label: "不可盖放",
    reason: "当前阶段不能盖放这张陷阱。"
  });
});

test("describes pending target selection", () => {
  const card = { type: "spell", uid: "s1" };
  const action = describeHandAction(card, {
    started: true,
    canAct: true,
    pendingTarget: { handUid: "s1" },
    spellTargetPrompt: "请选择我方攻击力最高怪兽。"
  });

  assert.deepEqual(action, {
    ok: true,
    label: "选目标",
    reason: "请选择我方攻击力最高怪兽。"
  });

  assert.deepEqual(describeHandAction({ type: "trap", uid: "t1" }, {
    started: true,
    canAct: true,
    pendingTarget: { handUid: "s1" }
  }), {
    ok: true,
    label: "切换",
    reason: "点击会取消当前目标选择，并改选这张卡。"
  });
});
