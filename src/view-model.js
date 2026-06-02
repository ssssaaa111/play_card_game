export function phaseLabel({ started, paused, gameOver, actionWindow, phase }) {
  if (!started) return "准备决斗";
  if (paused) return "已暂停";
  if (gameOver) return "决斗结束";
  if (actionWindow === "targetSelect") return "选择目标";
  if (phase === "draw") return "抽卡阶段";
  if (phase === "battle") return "战斗阶段";
  return "主要阶段";
}

export function turnLabel({ started, paused, actionWindow, turn }) {
  if (!started) return "点击开始";
  if (paused) return "暂停中";
  if (actionWindow === "targetSelect") return "选择魔法目标";
  return turn === "player" ? "你的回合" : "AI 正在行动";
}

export function duelHintText({
  started,
  paused,
  pendingPrompt = "",
  scenarioId = "normal",
  scenarioGoal = "",
  turn = "player",
  autoEnding = false,
  canAttack = false,
  canSpell = false,
  canSummon = false,
  canSetTrap = false,
  canChangeMode = false
}) {
  if (!started) return "开始后自动抽卡";
  if (paused) return "点击继续恢复决斗";
  if (pendingPrompt) return pendingPrompt;
  if (scenarioId !== "normal" && scenarioGoal) return `测试目标：${scenarioGoal}`;
  if (turn !== "player") return "等待 AI 行动";
  if (autoEnding) return "没有可操作项，回合即将结束";
  if (canAttack) return "选择怪兽发动攻击";
  if (canSpell) return "可以发动手牌里的魔法卡";
  if (canSummon) return "可以召唤手牌怪兽";
  if (canSetTrap) return "可以盖放陷阱卡";
  if (canChangeMode) return "可以切换怪兽表示";
  return "没有可操作项，回合即将结束";
}

export function describeHandAction(card, {
  started,
  canAct,
  paused,
  pendingTarget = null,
  selected = false,
  hasMonsterZone = false,
  hasTrapZone = false,
  summonedThisTurn = false,
  extraSummon = 0,
  spellValidation = { ok: false, reason: "这张魔法卡当前不能发动。" },
  spellNeedsManualTarget = false,
  spellTargetPrompt = ""
}) {
  if (!started) return { ok: false, label: "待开局", reason: "点击开始决斗后才能操作。" };
  if (!canAct) return { ok: false, label: paused ? "暂停中" : "等待", reason: "当前不是你的可操作窗口。" };
  if (pendingTarget) {
    if (pendingTarget.handUid === card.uid) {
      return { ok: true, label: "选目标", reason: spellTargetPrompt || "选择这张魔法卡的合法目标。" };
    }
    if (card.type === "spell" && !spellValidation.ok) {
      return { ok: false, label: "条件不足", reason: `点击会取消当前目标选择；${spellValidation.reason}` };
    }
    return { ok: true, label: "切换", reason: "点击会取消当前目标选择，并改选这张卡。" };
  }
  if (card.type === "monster") {
    if (!hasMonsterZone) return { ok: false, label: "场已满", reason: "我方召唤区已满。" };
    if (summonedThisTurn && extraSummon <= 0) return { ok: false, label: "已召唤", reason: "本回合已经通常召唤过。" };
    return { ok: true, label: "可召唤", reason: "选中后点击我方空召唤区。" };
  }
  if (card.type === "trap") {
    if (!hasTrapZone) return { ok: false, label: "陷阱满", reason: "我方陷阱区已满。" };
    return { ok: true, label: "可盖放", reason: "选中后点击我方空陷阱区。" };
  }
  if (card.type === "spell") {
    if (!spellValidation.ok) return { ok: false, label: "条件不足", reason: spellValidation.reason };
    if (spellNeedsManualTarget) {
      return {
        ok: true,
        label: selected ? "待确认" : "可发动",
        reason: selected ? spellTargetPrompt : "点击查看，确认后进入目标选择。"
      };
    }
    return {
      ok: true,
      label: selected ? "待确认" : "可发动",
      reason: selected ? "点击确认发动，或取消选择。" : "点击查看，确认后发动。"
    };
  }
  return { ok: false, label: "不可用", reason: "这张卡当前不能操作。" };
}
