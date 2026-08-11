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
  if (actionWindow === "targetSelect") return "选择效果目标";
  return turn === "player" ? "你的回合" : "AI 正在行动";
}

export function duelHintText({
  started,
  paused,
  pendingPrompt = "",
  selectionHint = "",
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
  if (selectionHint) return selectionHint;
  if (scenarioId !== "normal" && scenarioGoal) return `当前目标：${scenarioGoal}`;
  if (turn !== "player") return "等待 AI 行动";
  if (autoEnding) return "没有可操作项，回合即将结束";
  if (canAttack) return "选择怪兽发动攻击";
  if (canSpell) return "可以发动手牌里的魔法卡";
  if (canSummon) return "可以召唤手牌怪兽";
  if (canSetTrap) return "可以盖放陷阱卡";
  if (canChangeMode) return "可以切换怪兽表示";
  return "没有可操作项，回合即将结束";
}

export function compactScenarioGoal(goal = "", maxLength = 28) {
  const normalized = String(goal).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const [firstStep = normalized] = normalized.split(/[，。；;]/, 1);
  const compact = firstStep.trim() || normalized;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function duelHintView(options = {}) {
  const fullText = duelHintText(options);
  const kind = options.started && !options.paused && (options.pendingPrompt || options.selectionHint)
    ? "action"
    : options.started && !options.paused && options.scenarioId !== "normal" && options.scenarioGoal
      ? "objective"
      : "status";
  const text = kind === "objective"
    ? `当前目标：${compactScenarioGoal(options.scenarioGoal)}`
    : fullText;

  return {
    text,
    kind,
    title: kind === "objective" ? fullText : kind === "action" ? text : ""
  };
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
  monsterValidation = { ok: true },
  trapValidation = { ok: true },
  spellValidation = { ok: false, reason: "这张魔法卡当前不能发动。" },
  spellNeedsManualTarget = false,
  spellTargetPrompt = ""
}) {
  if (!started) return { ok: false, label: "待开局", reason: "点击开始决斗后才能操作。" };
  if (!canAct) return { ok: false, label: paused ? "暂停中" : "等待", reason: "当前不是你的可操作窗口。" };
  if (pendingTarget) {
    if (pendingTarget.handUid === card.uid) {
      if (!spellValidation.ok) {
        return {
          ok: false,
          label: "目标失效",
          reason: spellValidation.reason || "这张魔法卡已经没有合法目标。"
        };
      }
      return { ok: true, label: "选目标", reason: spellTargetPrompt || "选择这张魔法卡的合法目标。" };
    }
    const switchAction = describeHandAction(card, {
      started,
      canAct,
      paused,
      pendingTarget: null,
      selected: false,
      hasMonsterZone,
      hasTrapZone,
      summonedThisTurn,
      extraSummon,
      monsterValidation,
      trapValidation,
      spellValidation,
      spellNeedsManualTarget,
      spellTargetPrompt
    });
    if (!switchAction.ok) {
      return {
        ...switchAction,
        reason: `不能切换到这张卡：${switchAction.reason}`
      };
    }
    return { ok: true, label: "切换", reason: "点击会取消当前目标选择，并改选这张卡。" };
  }
  if (card.type === "monster") {
    if (summonedThisTurn && extraSummon <= 0) return { ok: false, label: "已召唤", reason: "本回合已经通常召唤过。" };
    if (!monsterValidation.ok) {
      const fieldFull = !hasMonsterZone && /召唤区已满|monster zone.*full/i.test(monsterValidation.reason || "");
      return {
        ok: false,
        label: fieldFull ? "场已满" : "不可召唤",
        reason: fieldFull ? "我方召唤区已满。" : monsterValidation.reason
      };
    }
    return { ok: true, label: "可召唤", reason: "选中后点击我方空召唤区。" };
  }
  if (card.type === "trap") {
    if (!hasTrapZone) return { ok: false, label: "陷阱满", reason: "我方陷阱区已满。" };
    if (!trapValidation.ok) return { ok: false, label: "不可盖放", reason: trapValidation.reason };
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
export function buildTributeSelectionDisplay({
  cardName = "这只怪兽",
  cost = 0,
  field = [],
  selectedIndexes = []
} = {}) {
  const required = Math.max(0, Number(cost) || 0);
  const validIndexes = Array.from(new Set(Array.isArray(selectedIndexes) ? selectedIndexes : []))
    .filter((index) => Number.isInteger(index) && Boolean(field[index]) && field[index]?.type !== "spell" && field[index]?.type !== "trap")
    .sort((left, right) => left - right)
    .slice(0, required);
  const selectedNames = validIndexes.map((index) => field[index]?.name || `怪兽区 ${index + 1}`);
  const selectedCount = selectedNames.length;
  const remainingCount = Math.max(0, required - selectedCount);
  const complete = required > 0 && remainingCount === 0;
  const requirementText = `召唤「${cardName}」需要解放 ${required} 只怪兽。`;
  const selectionText = `已选择 ${selectedCount} / ${required}：${selectedNames.length ? selectedNames.join("、") : "无"}`;
  const instructionText = complete
    ? "解放素材已齐，确认后完成祭品召唤。"
    : `还差 ${remainingCount} 只解放素材。请选择第 ${selectedCount + 1} 只解放素材。`;
  return {
    cardName,
    cost: required,
    selectedCount,
    selectedNames,
    remainingCount,
    complete,
    requirementText,
    selectionText,
    instructionText,
    text: [requirementText, selectionText, instructionText].join("\n")
  };
}

export function describeTributeTarget({ owner = "player", card = null, selected = false } = {}) {
  if (owner !== "player") {
    return { ok: false, label: "不可选", reason: "不能选择该目标：不是己方怪兽。" };
  }
  if (!card) {
    return { ok: false, label: "不可选", reason: "不能选择该目标：该格为空。" };
  }
  if (card.type && card.type !== "monster") {
    return { ok: false, label: "不可选", reason: "不能选择该目标：该卡不是怪兽。" };
  }
  return selected
    ? { ok: true, label: "已选解放素材", reason: `「${card.name}」已被选择，再次点击可取消。` }
    : { ok: true, label: "可选解放素材", reason: `可选择「${card.name}」作为解放素材。` };
}

export function tributeSummonFailureMessage(reason = "") {
  const detail = String(reason || "规则校验未通过。");
  const exactCost = detail.match(/requires exactly (\d+) tribute cards?/i);
  if (exactCost) return `祭品召唤失败：需要正好解放 ${exactCost[1]} 只己方怪兽。`;
  if (/monsterZone slot \d+ is occupied/i.test(detail)) {
    return "祭品召唤失败：目标怪兽区已被占用。";
  }
  if (/monsterZone is full/i.test(detail)) {
    return "祭品召唤失败：我方怪兽区已满。";
  }
  return detail.startsWith("祭品召唤失败：") ? detail : `祭品召唤失败：${detail}`;
}

function fusionRequirementLabel(entry) {
  const name = entry?.name || entry?.templateId || "未知素材";
  const count = Math.max(1, Number(entry?.count) || 1);
  return count > 1 ? `${name} ×${count}` : name;
}

function fusionMaterialTemplateId(card) {
  return card?.templateId || card?.id || "";
}

export function buildFusionSelectionDisplay({
  sourceName = "融合魔法",
  resultName = "",
  requirements = [],
  selectedMaterials = [],
  needsResult = false
} = {}) {
  if (needsResult || !resultName) {
    const titleText = `发动「${sourceName}」`;
    const requirementText = "请选择要融合召唤的怪兽。";
    return {
      sourceName,
      resultName: "",
      selectedCount: 0,
      requiredCount: 0,
      selectedNames: [],
      remaining: [],
      complete: false,
      titleText,
      requirementText,
      selectionText: "",
      remainingText: "",
      text: `${titleText}\n${requirementText}`
    };
  }

  const normalizedRequirements = (Array.isArray(requirements) ? requirements : []).map((entry) => ({
    templateId: entry?.templateId || entry?.id || "",
    name: entry?.name || entry?.templateId || entry?.id || "未知素材",
    count: Math.max(1, Number(entry?.count) || 1)
  })).filter((entry) => entry.templateId);
  const availableSelections = (Array.isArray(selectedMaterials) ? selectedMaterials : []).map((entry, index) => ({
    ...entry,
    templateId: entry?.templateId || fusionMaterialTemplateId(entry?.card),
    name: entry?.name || entry?.card?.name || entry?.templateId || "未知素材",
    selectionIndex: index
  }));
  const usedSelections = new Set();
  const selectedNames = [];
  const remaining = [];

  normalizedRequirements.forEach((requirement) => {
    let matched = 0;
    availableSelections.forEach((selection) => {
      if (matched >= requirement.count || usedSelections.has(selection.selectionIndex)) return;
      if (selection.templateId !== requirement.templateId) return;
      usedSelections.add(selection.selectionIndex);
      matched += 1;
      const zoneLabel = selection.zone === "hand" ? "手牌" : "场上";
      selectedNames.push(`${selection.name}（${zoneLabel}）`);
    });
    if (matched < requirement.count) {
      remaining.push({ ...requirement, count: requirement.count - matched });
    }
  });

  const selectedCount = selectedNames.length;
  const requiredCount = normalizedRequirements.reduce((total, entry) => total + entry.count, 0);
  const complete = selectedCount === requiredCount && remaining.length === 0 && usedSelections.size === availableSelections.length;
  const titleText = `融合召唤「${resultName}」`;
  const requirementText = `需要素材：${normalizedRequirements.map(fusionRequirementLabel).join("、")}。`;
  const selectionText = `已选择 ${selectedCount} / ${requiredCount}：${selectedNames.length ? selectedNames.join("、") : "无"}`;
  const remainingText = complete
    ? "素材齐备，确认后完成融合召唤。"
    : `还缺素材：${remaining.map(fusionRequirementLabel).join("、")}。`;
  return {
    sourceName,
    resultName,
    selectedCount,
    requiredCount,
    selectedNames,
    remaining,
    complete,
    titleText,
    requirementText,
    selectionText,
    remainingText,
    text: [titleText, requirementText, selectionText, remainingText].join("\n")
  };
}

export function describeFusionMaterialTarget({
  owner = "player",
  card = null,
  sourceUid = "",
  selected = false,
  requirements = [],
  remaining = requirements
} = {}) {
  if (owner !== "player") {
    return { ok: false, label: "不可选", reason: "不能选择该素材：不是己方怪兽。" };
  }
  if (!card) {
    return { ok: false, label: "不可选", reason: "不能选择该素材：该格为空。" };
  }
  if (sourceUid && card.uid === sourceUid) {
    return { ok: false, label: "不可选", reason: "不能选择该素材：融合魔法本身不能作为素材。" };
  }
  if (card.type !== "monster") {
    return { ok: false, label: "不可选", reason: "不能选择该素材：不是怪兽。" };
  }
  if (selected) {
    return { ok: true, label: "已选融合素材", reason: `「${card.name}」已被选择，再次点击可取消。` };
  }
  const templateId = fusionMaterialTemplateId(card);
  const required = (Array.isArray(requirements) ? requirements : []).some((entry) => entry?.templateId === templateId);
  if (!required) {
    return { ok: false, label: "不可选", reason: "不能选择该素材：不满足融合条件。" };
  }
  const stillNeeded = (Array.isArray(remaining) ? remaining : []).some((entry) => entry?.templateId === templateId && Math.max(0, Number(entry?.count) || 0) > 0);
  if (!stillNeeded) {
    return { ok: false, label: "不可选", reason: "不能选择该素材：该种素材数量已经满足。" };
  }
  return { ok: true, label: "可选融合素材", reason: `可选择「${card.name}」作为融合素材。` };
}

export function fusionSummonFailureMessage(reason = "") {
  const detail = String(reason || "规则校验未通过。");
  const exactCount = detail.match(/requires exactly (\d+) material cards?/i);
  if (exactCount) return `融合失败：需要正好选择 ${exactCount[1]} 只融合素材。`;
  if (/Fusion materials must be unique/i.test(detail)) return "融合失败：不能重复使用同一张素材。";
  if (/Fusion spell cannot be used as its own material/i.test(detail)) return "融合失败：融合魔法本身不能作为素材。";
  if (/does not match required materials|is missing materials/i.test(detail)) return "融合失败：所选素材不满足融合条件。";
  if (/Fusion result .* is not a monster/i.test(detail)) return "融合失败：融合结果必须是怪兽。";
  if (/Fusion material .* is not a monster/i.test(detail)) return "融合失败：融合素材必须是怪兽。";
  if (/Fusion material .* is not in .*hand or .*monsterZone/i.test(detail)) return "融合失败：所选素材已不在己方手牌或场上。";
  if (/No .* is available in hand or deck/i.test(detail)) return "融合失败：融合怪兽已不在手牌或卡组。";
  if (/monsterZone slot \d+ is occupied/i.test(detail)) return "融合失败：目标怪兽区已被占用。";
  if (/monsterZone is full/i.test(detail)) return "融合失败：我方怪兽区已满。";
  return detail.startsWith("融合失败：") ? detail : `融合失败：${detail}`;
}

export function buildSplitTokenDisplay({
  sourceName = "分裂效果",
  tokenName = "衍生物",
  count = 2,
  field = [],
  sourceMonster = null
} = {}) {
  const tokenCount = Math.max(1, Number(count) || 1);
  const slots = Array.isArray(field) ? field : [];
  const emptySlots = slots.filter((slot) => !slot).length;
  const hasEnoughSpace = emptySlots >= tokenCount;
  const missingSlots = Math.max(0, tokenCount - emptySlots);
  const titleText = `发动「${sourceName}」`;
  const sourceText = sourceMonster
    ? `分裂来源：「${sourceMonster.name || "己方怪兽"}」。`
    : "请选择分裂来源：己方场上的怪兽。";
  const generationText = `将生成 ${tokenCount} 只「${tokenName}」。`;
  const spaceText = `需要 ${tokenCount} 个空怪兽格。当前空位：${emptySlots}。${hasEnoughSpace ? "空位充足。" : `空位不足，还差 ${missingSlots} 个。`}`;
  const ruleText = "token 离场后会消失，不进入墓地、手牌或卡组。";
  return {
    sourceName,
    tokenName,
    count: tokenCount,
    emptySlots,
    hasEnoughSpace,
    titleText,
    sourceText,
    generationText,
    spaceText,
    ruleText,
    text: [titleText, sourceText, generationText, spaceText, ruleText].join("\n")
  };
}

export function describeSplitTokenTarget({ owner = "player", card = null } = {}) {
  if (owner !== "player") {
    return { ok: false, label: "不可选", reason: "不能选择该来源：不是己方怪兽。" };
  }
  if (!card) {
    return { ok: false, label: "不可选", reason: "不能选择该来源：该格为空。" };
  }
  if (card.type !== "monster") {
    return { ok: false, label: "不可选", reason: "不能选择该来源：不是怪兽。" };
  }
  return { ok: true, label: "可选分裂来源", reason: `可选择「${card.name}」作为分裂来源。` };
}

export function splitTokenFailureMessage(reason = "") {
  const detail = String(reason || "规则校验未通过。");
  const emptySlots = detail.match(/requires at least (\d+) empty monster zone slots/i);
  if (emptySlots) return `分裂失败：需要至少 ${emptySlots[1]} 个空怪兽格。`;
  if (/requires action\.targetCardId/i.test(detail)) {
    return "分裂失败：请选择己方场上的怪兽作为分裂来源。";
  }
  if (/Target .* is not in .*\.monsterZone/i.test(detail)) {
    return "分裂失败：所选来源不是己方场上的怪兽。";
  }
  if (/requires a monster target/i.test(detail)) return "分裂失败：分裂来源必须是怪兽。";
  if (/Token template .* is not available/i.test(detail)) return "分裂失败：衍生物定义不可用。";
  return detail.startsWith("分裂失败：") ? detail : `分裂失败：${detail}`;
}
