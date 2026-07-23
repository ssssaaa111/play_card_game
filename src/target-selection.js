import { spellTargetPrompt, validateSpellTargetRule } from "./rules.js";

export function targetSelectionForCard(card, effectDefinitions = {}, { sourceOwner = "player" } = {}) {
  const definition = effectDefinitions[card?.effect];
  const mode = definition?.target || "";
  if (!card || !mode) return null;
  return {
    effect: card.effect,
    mode,
    targetRule: definition?.targetRule || "",
    cardName: card.name,
    sourceCard: card,
    sourceOwner
  };
}

export function pendingTargetForCard(card, handIndex, effectDefinitions = {}, options = {}) {
  const selection = targetSelectionForCard(card, effectDefinitions, options);
  if (!selection) return null;
  return {
    handUid: card.uid,
    handIndex,
    ...selection
  };
}

export function spellNeedsManualTarget(owner, card, effectDefinitions = {}) {
  return owner?.owner === "player" &&
    card?.type === "spell" &&
    Boolean(targetSelectionForCard(card, effectDefinitions));
}

export function targetSelectionPrompt(selection) {
  return spellTargetPrompt(
    selection?.mode || "",
    selection?.cardName || "这张卡",
    selection?.targetRule || ""
  );
}

function targetSuccess(target, owner, index, zone) {
  return {
    ok: true,
    target,
    targetOwner: owner,
    targetIndex: index,
    targetZone: zone,
    owner,
    index,
    zone,
    card: target
  };
}

export function validateTargetSelection(
  pending,
  { player = null, ai = null } = {},
  ownerName,
  index,
  zone = "field"
) {
  if (!pending) return { ok: false, reason: "当前没有需要选择目标的效果。" };
  const duelist = ownerName === "player" ? player : ownerName === "ai" ? ai : null;
  if (!duelist) return { ok: false, reason: "请选择有效的目标区域。" };

  if (pending.mode === "enemySpellTrap") {
    if (zone !== "traps" || ownerName !== "ai") {
      return { ok: false, reason: "这个效果需要选择敌方魔陷区的卡。" };
    }
    const target = duelist.traps?.[index];
    if (!target) return { ok: false, reason: "请选择敌方魔陷区的卡作为目标。" };
    return targetSuccess(target, ownerName, index, zone);
  }

  if (pending.mode === "ownGraveMonster") {
    if (zone !== "grave" || ownerName !== "player") {
      return { ok: false, reason: "这个效果需要选择我方墓地中的怪兽。" };
    }
    const target = duelist.grave?.[index];
    if (!target) return { ok: false, reason: "不能选择该卡：目标不在墓地。" };
    if (target.type !== "monster") return { ok: false, reason: "不能选择该卡：不是怪兽。" };
    return targetSuccess(target, ownerName, index, zone);
  }

  if (pending.mode === "ownGraveCard") {
    if (zone !== "grave" || ownerName !== "player") {
      return { ok: false, reason: "这个效果需要选择我方墓地中的卡牌。" };
    }
    const target = duelist.grave?.[index];
    if (!target) return { ok: false, reason: "请选择我方墓地中的卡牌作为目标。" };
    const rule = validateSpellTargetRule(pending, duelist, target);
    if (!rule.ok) return rule;
    return targetSuccess(target, ownerName, index, zone);
  }

  if (zone !== "field") return { ok: false, reason: "这个效果需要选择场上的怪兽。" };
  const target = duelist.field?.[index];
  if (!target) return { ok: false, reason: "请选择场上的怪兽作为目标。" };
  if (pending.mode === "ownMonster" && ownerName !== "player") {
    return { ok: false, reason: "这个效果需要选择我方怪兽。" };
  }
  if (pending.mode === "enemyMonster" && ownerName !== "ai") {
    return { ok: false, reason: "这个效果需要选择敌方怪兽。" };
  }
  const rule = validateSpellTargetRule(pending, duelist, target);
  if (!rule.ok) return rule;
  return targetSuccess(target, ownerName, index, zone);
}

export function collectLegalTargetSelections(pending, duelists = {}) {
  if (!pending) return [];
  const targets = [];
  for (const ownerName of ["player", "ai"]) {
    const duelist = duelists[ownerName];
    if (!duelist) continue;
    for (const [zone, cards] of [
      ["field", duelist.field || []],
      ["traps", duelist.traps || []],
      ["grave", duelist.grave || []]
    ]) {
      cards.forEach((card, index) => {
        if (!card) return;
        const target = validateTargetSelection(pending, duelists, ownerName, index, zone);
        if (target.ok) targets.push(target);
      });
    }
  }
  return targets;
}

function targetCardUid(card) {
  return card?.uid || card?.engineId || card?.id || "";
}

function targetReference(target) {
  if (!target?.ok) return null;
  return {
    owner: target.owner,
    index: target.index,
    zone: target.zone,
    cardUid: targetCardUid(target.card)
  };
}

export function selectTargetSelection(pending, target, { source = "player" } = {}) {
  const selectedTarget = targetReference(target);
  if (!pending || !selectedTarget) return pending || null;
  return {
    ...pending,
    selectedTarget,
    selectedTargetSource: source
  };
}

export function resolveSelectedTargetSelection(pending, duelists = {}) {
  const selected = pending?.selectedTarget;
  if (!selected) return null;
  const target = validateTargetSelection(
    pending,
    duelists,
    selected.owner,
    selected.index,
    selected.zone || "field"
  );
  if (!target.ok) return null;
  if (selected.cardUid && targetCardUid(target.card) !== selected.cardUid) return null;
  return target;
}

export function prepareDefaultTargetSelection(pending, duelists = {}) {
  if (!pending) return null;
  const selected = resolveSelectedTargetSelection(pending, duelists);
  if (selected && pending.selectedTargetSource !== "default") return pending;
  const legalTargets = collectLegalTargetSelections(pending, duelists);
  if (legalTargets.length === 1) {
    return selectTargetSelection(pending, legalTargets[0], { source: "default" });
  }
  if (!pending.selectedTarget && !pending.selectedTargetSource) return pending;
  const { selectedTarget, selectedTargetSource, ...unselected } = pending;
  return unselected;
}

export function isSelectedTargetSelection(pending, owner, index, zone = "field") {
  const selected = pending?.selectedTarget;
  return Boolean(
    selected
    && selected.owner === owner
    && selected.index === index
    && (selected.zone || "field") === zone
  );
}

function targetOwnerLabel(owner) {
  return owner === "player" ? "我方" : "敌方";
}

export function targetSelectionTargetLabel(target) {
  if (!target?.ok) return "未选择";
  const owner = targetOwnerLabel(target.owner);
  const position = Math.max(0, Number(target.index) || 0) + 1;
  if (target.zone === "traps") {
    const publicName = target.owner === "ai" && target.card?.type !== "spell"
      ? "盖放卡牌"
      : target.card?.name || "魔陷卡";
    return `${publicName}（${owner}魔陷区 ${position}）`;
  }
  if (target.zone === "grave") {
    return `${target.card?.name || "墓地卡牌"}（${owner}墓地）`;
  }
  return `${target.card?.name || "怪兽"}（${owner}怪兽区 ${position}）`;
}

export function buildTargetSelectionDisplay(pending, duelists = {}) {
  if (!pending) {
    return {
      complete: false,
      legalCount: 0,
      selectedTarget: null,
      selectedName: "",
      selectedByDefault: false,
      prompt: "",
      text: "",
      confirmLabel: "请选择目标"
    };
  }
  const legalTargets = collectLegalTargetSelections(pending, duelists);
  const selectedTarget = resolveSelectedTargetSelection(pending, duelists);
  const selectedName = selectedTarget ? targetSelectionTargetLabel(selectedTarget) : "";
  const selectedByDefault = Boolean(selectedTarget && pending.selectedTargetSource === "default");
  const prompt = targetSelectionPrompt(pending);
  const selectionText = selectedTarget
    ? `${selectedByDefault ? "已默认选择" : "已选择"}：${selectedName}。`
    : "尚未选择目标。";
  const guidance = selectedTarget
    ? "点击其他高亮目标可以更换，确认后发动。"
    : "请点击一个高亮目标。";
  return {
    complete: Boolean(selectedTarget),
    legalCount: legalTargets.length,
    selectedTarget,
    selectedName,
    selectedByDefault,
    prompt,
    text: [prompt, selectionText, guidance].filter(Boolean).join("\n"),
    confirmLabel: selectedTarget ? "确认发动" : "请选择目标"
  };
}
