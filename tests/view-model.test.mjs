import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFusionSelectionDisplay,
  buildSplitTokenDisplay,
  buildTributeSelectionDisplay,
  describeHandAction,
  describeFusionMaterialTarget,
  describeSplitTokenTarget,
  describeTributeTarget,
  compactScenarioGoal,
  duelHintView,
  duelHintText,
  phaseLabel,
  fusionSummonFailureMessage,
  splitTokenFailureMessage,
  tributeSummonFailureMessage,
  turnLabel
} from "../src/view-model.js";

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
  assert.equal(turnLabel({ started: true, actionWindow: "targetSelect" }), "选择效果目标");
  assert.equal(turnLabel({ started: true, turn: "ai" }), "AI 正在行动");
});

test("builds contextual duel hints", () => {
  assert.equal(duelHintText({ started: false }), "开始后自动抽卡");
  assert.equal(duelHintText({ started: true, paused: true }), "点击继续恢复决斗");
  assert.equal(duelHintText({ started: true, pendingPrompt: "选择我方怪兽" }), "选择我方怪兽");
  assert.equal(duelHintText({
    started: true,
    selectionHint: "已选择「赤焰幼龙」：点击红色高亮目标发动攻击。",
    scenarioId: "target",
    scenarioGoal: "验证目标选择"
  }), "已选择「赤焰幼龙」：点击红色高亮目标发动攻击。");
  assert.equal(duelHintText({ started: true, scenarioId: "target", scenarioGoal: "验证目标选择" }), "当前目标：验证目标选择");
  assert.equal(duelHintText({ started: true, turn: "ai" }), "等待 AI 行动");
  assert.equal(duelHintText({ started: true, canSpell: true }), "可以发动手牌里的魔法卡");
  assert.equal(duelHintText({ started: true, canSummon: true }), "可以召唤手牌怪兽");
  assert.equal(duelHintText({ started: true, canSetTrap: true }), "可以盖放陷阱卡");
  assert.equal(duelHintText({ started: true, canChangeMode: true }), "可以切换怪兽表示");
});

test("classifies persistent scenario goals separately from immediate duel actions", () => {
  const objective = duelHintView({
    started: true,
    scenarioId: "target",
    scenarioGoal: "clear the board before attacking"
  });
  const action = duelHintView({
    started: true,
    pendingPrompt: "choose a target",
    scenarioId: "target",
    scenarioGoal: "clear the board before attacking"
  });

  assert.equal(objective.kind, "objective");
  assert.equal(objective.title, "当前目标：clear the board before attacking");
  assert.equal(action.kind, "action");
  assert.equal(action.title, action.text);
});

test("keeps battlefield objectives to one actionable step while preserving the full route", () => {
  const fullGoal = "先布置防御挡下太阳神的第一击，再清掉月曜帷幕，复活低星王牌，用终局反击击碎三曜。";
  const objective = duelHintView({
    started: true,
    scenarioId: "protagonistTrioOmegaStory",
    scenarioGoal: fullGoal
  });

  assert.equal(compactScenarioGoal(fullGoal), "先布置防御挡下太阳神的第一击");
  assert.equal(objective.text, "当前目标：先布置防御挡下太阳神的第一击");
  assert.equal(objective.title, `当前目标：${fullGoal}`);
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
    spellValidation: { ok: true },
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
    pendingTarget: { handUid: "s1" },
    hasTrapZone: true,
    trapValidation: { ok: true }
  }), {
    ok: true,
    label: "切换",
    reason: "点击会取消当前目标选择，并改选这张卡。"
  });
});

test("pending target switching keeps each alternative card's real legality", () => {
  const pendingTarget = { handUid: "active-spell" };
  const base = {
    started: true,
    canAct: true,
    pendingTarget,
    hasMonsterZone: true,
    hasTrapZone: true
  };

  assert.deepEqual(describeHandAction({ type: "monster", uid: "late-monster" }, {
    ...base,
    summonedThisTurn: true
  }), {
    ok: false,
    label: "已召唤",
    reason: "不能切换到这张卡：本回合已经通常召唤过。"
  });
  assert.deepEqual(describeHandAction({ type: "trap", uid: "full-trap" }, {
    ...base,
    hasTrapZone: false
  }), {
    ok: false,
    label: "陷阱满",
    reason: "不能切换到这张卡：我方陷阱区已满。"
  });
  assert.deepEqual(describeHandAction({ type: "spell", uid: "blocked-spell" }, {
    ...base,
    spellValidation: { ok: false, reason: "这张卡没有可指定的合法目标。" }
  }), {
    ok: false,
    label: "条件不足",
    reason: "不能切换到这张卡：这张卡没有可指定的合法目标。"
  });
});

test("an active target spell stops advertising readiness after every target becomes illegal", () => {
  assert.deepEqual(describeHandAction({ type: "spell", uid: "active-spell" }, {
    started: true,
    canAct: true,
    pendingTarget: { handUid: "active-spell" },
    spellValidation: { ok: false, reason: "这张卡没有可指定的合法目标。" },
    spellTargetPrompt: "原目标已经离场。"
  }), {
    ok: false,
    label: "目标失效",
    reason: "这张卡没有可指定的合法目标。"
  });
});

test("keeps a legal tribute summon ready on a full field", () => {
  const action = describeHandAction({ type: "monster", uid: "divine-1" }, {
    started: true,
    canAct: true,
    hasMonsterZone: false,
    hasTrapZone: true,
    monsterValidation: { ok: true }
  });

  assert.equal(action.ok, true);
  assert.equal(action.label, "可召唤");

  const blocked = describeHandAction({ type: "monster", uid: "normal-1" }, {
    started: true,
    canAct: true,
    hasMonsterZone: false,
    hasTrapZone: true,
    monsterValidation: { ok: false, reason: "monster zone is full" }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.label, "场已满");
});
test("describes tribute progress with the summon card, selected names, and remaining count", () => {
  const field = [
    { uid: "spark", name: "星火信使" },
    null,
    { uid: "gearlet", name: "微光机巧卫" },
    null,
    null
  ];

  assert.deepEqual(buildTributeSelectionDisplay({
    cardName: "坠星巨卫",
    cost: 2,
    field,
    selectedIndexes: [0]
  }), {
    cardName: "坠星巨卫",
    cost: 2,
    selectedCount: 1,
    selectedNames: ["星火信使"],
    remainingCount: 1,
    complete: false,
    requirementText: "召唤「坠星巨卫」需要解放 2 只怪兽。",
    selectionText: "已选择 1 / 2：星火信使",
    instructionText: "还差 1 只解放素材。请选择第 2 只解放素材。",
    text: "召唤「坠星巨卫」需要解放 2 只怪兽。\n已选择 1 / 2：星火信使\n还差 1 只解放素材。请选择第 2 只解放素材。"
  });

  const complete = buildTributeSelectionDisplay({
    cardName: "坠星巨卫",
    cost: 2,
    field,
    selectedIndexes: [2, 0]
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.remainingCount, 0);
  assert.equal(complete.selectionText, "已选择 2 / 2：星火信使、微光机巧卫");
  assert.equal(complete.instructionText, "解放素材已齐，确认后完成祭品召唤。");
});

test("explains which tribute targets are selectable and why others are blocked", () => {
  const monster = { uid: "spark", name: "星火信使", type: "monster" };

  assert.deepEqual(describeTributeTarget({ owner: "player", card: monster, selected: false }), {
    ok: true,
    label: "可选解放素材",
    reason: "可选择「星火信使」作为解放素材。"
  });
  assert.deepEqual(describeTributeTarget({ owner: "player", card: monster, selected: true }), {
    ok: true,
    label: "已选解放素材",
    reason: "「星火信使」已被选择，再次点击可取消。"
  });
  assert.deepEqual(describeTributeTarget({ owner: "player", card: null }), {
    ok: false,
    label: "不可选",
    reason: "不能选择该目标：该格为空。"
  });
  assert.deepEqual(describeTributeTarget({ owner: "ai", card: monster }), {
    ok: false,
    label: "不可选",
    reason: "不能选择该目标：不是己方怪兽。"
  });
});

test("prefixes tribute dispatch failures without hiding the engine reason", () => {
  assert.equal(
    tributeSummonFailureMessage("player.monsterZone slot 1 is occupied"),
    "祭品召唤失败：目标怪兽区已被占用。"
  );
  assert.equal(
    tributeSummonFailureMessage("Card colossus requires exactly 2 tribute cards"),
    "祭品召唤失败：需要正好解放 2 只己方怪兽。"
  );
  assert.equal(
    tributeSummonFailureMessage("unexpected rule failure"),
    "祭品召唤失败：unexpected rule failure"
  );
});

test("describes fusion target, selected materials, and the missing recipe entry", () => {
  const requirements = [
    { templateId: "ember-drake", name: "赤焰幼龙", count: 1 },
    { templateId: "gale-mage", name: "疾风术士", count: 1 }
  ];
  const display = buildFusionSelectionDisplay({
    sourceName: "星魂融合",
    resultName: "焰岚合星者",
    requirements,
    selectedMaterials: [
      { templateId: "ember-drake", name: "赤焰幼龙", zone: "field" }
    ]
  });

  assert.deepEqual(display, {
    sourceName: "星魂融合",
    resultName: "焰岚合星者",
    selectedCount: 1,
    requiredCount: 2,
    selectedNames: ["赤焰幼龙（场上）"],
    remaining: [{ templateId: "gale-mage", name: "疾风术士", count: 1 }],
    complete: false,
    titleText: "融合召唤「焰岚合星者」",
    requirementText: "需要素材：赤焰幼龙、疾风术士。",
    selectionText: "已选择 1 / 2：赤焰幼龙（场上）",
    remainingText: "还缺素材：疾风术士。",
    text: "融合召唤「焰岚合星者」\n需要素材：赤焰幼龙、疾风术士。\n已选择 1 / 2：赤焰幼龙（场上）\n还缺素材：疾风术士。"
  });

  const complete = buildFusionSelectionDisplay({
    sourceName: "星魂融合",
    resultName: "焰岚合星者",
    requirements,
    selectedMaterials: [
      { templateId: "gale-mage", name: "疾风术士", zone: "hand" },
      { templateId: "ember-drake", name: "赤焰幼龙", zone: "field" }
    ]
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.selectionText, "已选择 2 / 2：赤焰幼龙（场上）、疾风术士（手牌）");
  assert.equal(complete.remainingText, "素材齐备，确认后完成融合召唤。");
});

test("prompts for a fusion result before showing a material recipe", () => {
  const display = buildFusionSelectionDisplay({ sourceName: "星魂融合", needsResult: true });
  assert.equal(display.titleText, "发动「星魂融合」");
  assert.equal(display.requirementText, "请选择要融合召唤的怪兽。");
  assert.equal(display.text, "发动「星魂融合」\n请选择要融合召唤的怪兽。");
  assert.equal(display.complete, false);
});

test("explains valid and invalid fusion material targets", () => {
  const requirements = [
    { templateId: "ember-drake", count: 1 },
    { templateId: "gale-mage", count: 1 }
  ];
  const ember = { uid: "ember-1", id: "ember-drake", name: "赤焰幼龙", type: "monster" };

  assert.deepEqual(describeFusionMaterialTarget({
    owner: "player",
    card: ember,
    requirements,
    remaining: requirements
  }), {
    ok: true,
    label: "可选融合素材",
    reason: "可选择「赤焰幼龙」作为融合素材。"
  });
  assert.deepEqual(describeFusionMaterialTarget({
    owner: "player",
    card: ember,
    selected: true,
    requirements,
    remaining: [{ templateId: "gale-mage", count: 1 }]
  }), {
    ok: true,
    label: "已选融合素材",
    reason: "「赤焰幼龙」已被选择，再次点击可取消。"
  });
  assert.equal(describeFusionMaterialTarget({ owner: "player", card: null, requirements }).reason, "不能选择该素材：该格为空。");
  assert.equal(describeFusionMaterialTarget({ owner: "ai", card: ember, requirements }).reason, "不能选择该素材：不是己方怪兽。");
  assert.equal(describeFusionMaterialTarget({
    owner: "player",
    card: { uid: "spell-1", id: "war-chant", name: "战意高扬", type: "spell" },
    requirements
  }).reason, "不能选择该素材：不是怪兽。");
  assert.equal(describeFusionMaterialTarget({
    owner: "player",
    card: { uid: "knight-1", id: "solar-knight", name: "日冕骑士", type: "monster" },
    requirements,
    remaining: requirements
  }).reason, "不能选择该素材：不满足融合条件。");
});

test("prefixes fusion dispatch failures with localized reasons", () => {
  assert.equal(
    fusionSummonFailureMessage("Fusion spell fusion-1 requires exactly 2 material cards"),
    "融合失败：需要正好选择 2 只融合素材。"
  );
  assert.equal(
    fusionSummonFailureMessage("Fusion material knight-1 does not match required materials"),
    "融合失败：所选素材不满足融合条件。"
  );
  assert.equal(
    fusionSummonFailureMessage("unexpected fusion failure"),
    "融合失败：unexpected fusion failure"
  );
});

test("describes split source, token count, empty slots, and token lifecycle", () => {
  const field = [
    { uid: "spark-1", name: "星火信使", type: "monster" },
    null,
    null,
    null,
    null
  ];
  const display = buildSplitTokenDisplay({
    sourceName: "星火分裂",
    tokenName: "星火衍生体",
    count: 2,
    field
  });

  assert.deepEqual(display, {
    sourceName: "星火分裂",
    tokenName: "星火衍生体",
    count: 2,
    emptySlots: 4,
    hasEnoughSpace: true,
    titleText: "发动「星火分裂」",
    sourceText: "请选择分裂来源：己方场上的怪兽。",
    generationText: "将生成 2 只「星火衍生体」。",
    spaceText: "需要 2 个空怪兽格。当前空位：4。空位充足。",
    ruleText: "token 离场后会消失，不进入墓地、手牌或卡组。",
    text: "发动「星火分裂」\n请选择分裂来源：己方场上的怪兽。\n将生成 2 只「星火衍生体」。\n需要 2 个空怪兽格。当前空位：4。空位充足。\ntoken 离场后会消失，不进入墓地、手牌或卡组。"
  });

  const selected = buildSplitTokenDisplay({
    sourceName: "星火分裂",
    tokenName: "星火衍生体",
    count: 2,
    field,
    sourceMonster: field[0]
  });
  assert.equal(selected.sourceText, "分裂来源：「星火信使」。");

  const blocked = buildSplitTokenDisplay({
    count: 2,
    field: [field[0], field[0], field[0], field[0], null]
  });
  assert.equal(blocked.hasEnoughSpace, false);
  assert.equal(blocked.spaceText, "需要 2 个空怪兽格。当前空位：1。空位不足，还差 1 个。");
});

test("explains valid and invalid split token sources", () => {
  const monster = { uid: "spark-1", name: "星火信使", type: "monster" };

  assert.deepEqual(describeSplitTokenTarget({ owner: "player", card: monster }), {
    ok: true,
    label: "可选分裂来源",
    reason: "可选择「星火信使」作为分裂来源。"
  });
  assert.equal(describeSplitTokenTarget({ owner: "player", card: null }).reason, "不能选择该来源：该格为空。");
  assert.equal(describeSplitTokenTarget({ owner: "ai", card: monster }).reason, "不能选择该来源：不是己方怪兽。");
  assert.equal(describeSplitTokenTarget({
    owner: "player",
    card: { uid: "spell-1", name: "星火分裂", type: "spell" }
  }).reason, "不能选择该来源：不是怪兽。");
});

test("prefixes split token failures with localized reasons", () => {
  assert.equal(
    splitTokenFailureMessage("Effect splitToken requires at least 2 empty monster zone slots"),
    "分裂失败：需要至少 2 个空怪兽格。"
  );
  assert.equal(
    splitTokenFailureMessage("Effect splitToken requires action.targetCardId"),
    "分裂失败：请选择己方场上的怪兽作为分裂来源。"
  );
  assert.equal(
    splitTokenFailureMessage("unexpected token failure"),
    "分裂失败：unexpected token failure"
  );
});
