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
    if (!target || target.type !== "monster") {
      return { ok: false, reason: "请选择我方墓地中的怪兽作为目标。" };
    }
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
