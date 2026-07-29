import { battleValue, canDirectAttack, totalAtk, totalDef } from './rules.js';
import { scoreSpellForAi } from './spells.js';

const scriptedPressureMonsterPriority = {
  "trio-sun-judicator": 900,
  "trio-moon-warden": 760,
  "trio-star-herald": 700,
  "void-siege-breaker": 260
};

const trioPressureMonsterIds = new Set([
  "trio-sun-judicator",
  "trio-moon-warden",
  "trio-star-herald"
]);

const scriptedPressureTrapPriority = {
  "mirror-snare": 120,
  "chain-nullifier": 100,
  "void-lock": 70
};

const summonSensitiveSpellEffects = new Set([
  "dawnEdge",
  "lastStandSurge",
  "buff500",
  "soulResonance",
  "rallyAttack",
  "battleTrance",
  "equipBlade",
  "equipAegis",
  "equipPrism",
  "equipOverclock"
]);

const supportZoneInvestmentSpellEffects = new Set([
  "equipBlade",
  "equipAegis",
  "equipPrism",
  "equipOverclock"
]);

function templateId(card) {
  return card?.id || card?.templateId || "";
}

function isTrioPressureMonster(card) {
  return trioPressureMonsterIds.has(templateId(card));
}

function attackTargetEntry(target, targetIndex, attackerAtk) {
  if (!target) return null;
  const targetValue = battleValue(target);
  return {
    target,
    targetIndex,
    targetValue,
    diff: attackerAtk - targetValue
  };
}

function compareAttackTargets(a, b) {
  if (a.diff >= 0 && b.diff >= 0) {
    if (a.target.mode !== b.target.mode) return a.target.mode === "attack" ? -1 : 1;
    if (a.diff !== b.diff) return b.diff - a.diff;
  }
  if (a.targetValue !== b.targetValue) return a.targetValue - b.targetValue;
  return a.targetIndex - b.targetIndex;
}

function isUsefulAttackTarget(entry) {
  if (entry.diff > 0) return true;
  if (entry.diff === 0 && entry.target.mode !== "defense") return true;
  return false;
}

function comparePressureAttackMatchups(a, b) {
  if (a.targetCoverage !== b.targetCoverage) return a.targetCoverage - b.targetCoverage;
  if (a.target.mode !== b.target.mode) return a.target.mode === "attack" ? -1 : 1;
  if (a.targetValue !== b.targetValue) return b.targetValue - a.targetValue;
  if (a.attackerAtk !== b.attackerAtk) return a.attackerAtk - b.attackerAtk;
  if (a.diff !== b.diff) return a.diff - b.diff;
  if (a.attackerIndex !== b.attackerIndex) return a.attackerIndex - b.attackerIndex;
  return a.targetIndex - b.targetIndex;
}

function choosePressureAttackMatchup(attackers, targets) {
  const matchups = [];
  targets.forEach((target, targetIndex) => {
    if (!target) return;
    const targetMatchups = attackers
      .map(({ card, index: attackerIndex }) => {
        const attackerAtk = totalAtk(card);
        const targetEntry = attackTargetEntry(target, targetIndex, attackerAtk);
        if (!targetEntry || !isUsefulAttackTarget(targetEntry)) return null;
        return {
          card,
          attackerIndex,
          attackerAtk,
          ...targetEntry
        };
      })
      .filter(Boolean);
    targetMatchups.forEach((matchup) => {
      matchups.push({ ...matchup, targetCoverage: targetMatchups.length });
    });
  });
  return matchups.sort(comparePressureAttackMatchups)[0] || null;
}

function attackThreatScore({ owner = null, rival = null, context = {} } = {}) {
  const attacker = rival?.field?.[context.attackerIndex];
  if (!attacker) return 0;
  const attackerAtk = totalAtk(attacker);
  const target = context.targetIndex >= 0 ? owner?.field?.[context.targetIndex] : null;
  if (!target) return attackerAtk > 0 ? 120 + Math.min(80, Math.floor(attackerAtk / 100)) : 0;

  const targetValue = battleValue(target);
  if (attackerAtk > targetValue) {
    return 140 + Math.min(60, Math.floor((attackerAtk - targetValue) / 100));
  }
  if (attackerAtk === targetValue && target.mode !== "defense") return 120;
  return 0;
}

function scoreAiTrapResponse(card, details = {}) {
  if (!card) return 0;
  if (details.eventName === "attack" && card.trigger === "attackDestroy") {
    return attackThreatScore(details);
  }
  return 60;
}

export function chooseAiTrapResponseAction({
  candidates = [],
  owner = null,
  rival = null,
  eventName = "",
  context = {}
} = {}) {
  const pick = candidates
    .map(({ card, index }) => ({
      type: "activateTrap",
      card,
      trapIndex: index,
      score: scoreAiTrapResponse(card, { owner, rival, eventName, context })
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.trapIndex - b.trapIndex)[0];
  return pick || null;
}

export function chooseAiAttackTarget({
  attacker,
  targets = [],
  playerLp = 0,
  aiStyle = "balanced",
  canUseDirect = false
} = {}) {
  if (!attacker) return null;
  const attackerAtk = totalAtk(attacker);
  const targetEntries = targets
    .map((target, targetIndex) => attackTargetEntry(target, targetIndex, attackerAtk))
    .filter(Boolean)
    .sort(compareAttackTargets);

  if (targetEntries.length === 0) return -1;

  const usefulTargets = targetEntries.filter(isUsefulAttackTarget);
  const blockedByBoard = usefulTargets.length === 0;
  const shouldDirect = canUseDirect && (
    attackerAtk >= playerLp ||
    blockedByBoard ||
    (aiStyle === "aggressive" && targetEntries.length > 0)
  );

  if (shouldDirect) return -1;
  if (usefulTargets.length > 0) return usefulTargets[0].targetIndex;
  return null;
}

export function chooseAiSpellAction({
  hand = [],
  owner = null,
  rival = null,
  aiStyle = "balanced",
  turnGoal = "pressure",
  timing = "beforeSummon",
  minScore = 40,
  canActivateSpell = null
} = {}) {
  const shouldDeferMonsterInvestment = aiStyle === "scriptedPressure" &&
    turnGoal === "deployTrio" &&
    timing === "beforeSummon";
  const shouldResumeMonsterInvestment = aiStyle === "scriptedPressure" &&
    turnGoal === "deployTrio" &&
    timing === "afterSummon";
  const candidates = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) =>
      card?.type === "spell" &&
      typeof canActivateSpell === "function" &&
      canActivateSpell(card, index)
    )
    .filter(({ card }) =>
      !shouldDeferMonsterInvestment || !summonSensitiveSpellEffects.has(card.effect)
    )
    .filter(({ card }) =>
      !shouldResumeMonsterInvestment || summonSensitiveSpellEffects.has(card.effect)
    )
    .map(({ card, index }) => ({
      type: "spell",
      card,
      handIndex: index,
      score: scoreSpellForAi(card.effect, { owner, rival, aiStyle }),
      reason: aiStyle === "scriptedPressure" &&
        turnGoal === "deployTrio" &&
        timing === "afterSummon" &&
        summonSensitiveSpellEffects.has(card.effect)
        ? "trioDeploymentFirst"
        : ""
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.handIndex - b.handIndex);

  return candidates[0] || null;
}

export function chooseAiSetTrapAction({
  hand = [],
  traps = [],
  aiStyle = "balanced",
  canSetTrap = null
} = {}) {
  const trapIndex = traps.findIndex((slot) => !slot);
  if (trapIndex < 0) return null;
  const trapCandidates = hand
    .map((card, index) => ({
      card,
      index,
      score: aiStyle === "scriptedPressure" ? (scriptedPressureTrapPriority[templateId(card)] || 0) : 0
    }))
    .filter((entry) => entry.card?.type === "trap")
    .filter((entry) =>
      typeof canSetTrap === "function" &&
      canSetTrap(entry.card, entry.index, trapIndex)
    )
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const pick = trapCandidates[0];
  if (!pick) return null;
  return {
    type: "setTrap",
    card: pick.card,
    handIndex: pick.index,
    trapIndex
  };
}

export function aiTrapSetLimit({
  traps = [],
  aiStyle = "balanced",
  reservedZones = 0
} = {}) {
  const emptyZones = traps.filter((slot) => !slot).length;
  if (emptyZones <= 0) return 0;
  return aiStyle === "scriptedPressure"
    ? Math.max(0, emptyZones - Math.max(0, Number(reservedZones) || 0))
    : 1;
}

export function scoreAiMonster(card, aiStyle = "balanced") {
  if (!card) return 0;
  const stars = Number(card.stars) || 0;
  if (aiStyle === "control") return Math.max(totalDef(card), totalAtk(card) - 150) + (card.onSummon ? 120 : 0);
  if (aiStyle === "aggressive") return totalAtk(card) + (card.afterAttack ? 180 : 0) + stars * 35;
  if (aiStyle === "scriptedPressure") {
    return totalAtk(card) +
      stars * 25 +
      (card.afterAttack ? 140 : 0) +
      (scriptedPressureMonsterPriority[templateId(card)] || 0);
  }
  return totalAtk(card) + stars * 20;
}

export function chooseAiSummonAction({
  hand = [],
  field = [],
  aiStyle = "balanced",
  canSummon = null
} = {}) {
  const emptyFieldIndex = field.findIndex((slot) => !slot);
  const occupiedIndexes = field
    .map((slot, index) => (slot ? index : -1))
    .filter((index) => index >= 0);
  const candidates = hand
    .map((card, index) => {
      const tributeCost = Math.max(0, Number(card?.tributeCost) || 0);
      const tributeCandidates = occupiedIndexes
        .map((fieldIndex) => ({
          fieldIndex,
          card: field[fieldIndex],
          protected: aiStyle === "scriptedPressure" && isTrioPressureMonster(field[fieldIndex]),
          score: scoreAiMonster(field[fieldIndex], aiStyle)
        }))
        .sort((a, b) => Number(a.protected) - Number(b.protected) || a.score - b.score || a.fieldIndex - b.fieldIndex);
      const selectedTributes = tributeCandidates.slice(0, tributeCost);
      const wouldSpendTrio = selectedTributes.some((entry) => entry.protected);
      const tributeIndexes = selectedTributes.map((entry) => entry.fieldIndex);
      const fieldIndex = emptyFieldIndex >= 0 ? emptyFieldIndex : tributeCost > 0 ? tributeIndexes[0] ?? -1 : -1;
      return { card, index, tributeCost, tributeIndexes, wouldSpendTrio, fieldIndex, score: scoreAiMonster(card, aiStyle) };
    })
    .filter((entry) => entry.card?.type === "monster")
    .filter((entry) => entry.tributeCost <= occupiedIndexes.length)
    .filter((entry) => !entry.wouldSpendTrio)
    .filter((entry) => entry.fieldIndex >= 0)
    .filter((entry) =>
      typeof canSummon === "function" &&
      canSummon(entry.card, entry.index, {
        fieldIndex: entry.fieldIndex,
        tributeIndexes: entry.tributeIndexes
      })
    )
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const pick = candidates[0];
  if (!pick) return null;
  return {
    type: "summon",
    card: pick.card,
    handIndex: pick.index,
    fieldIndex: pick.fieldIndex,
    tributeCost: pick.tributeCost,
    tributeIndexes: pick.tributeIndexes,
    score: pick.score
  };
}

export function shouldSwitchSummonedMonsterToDefense({
  monster,
  ownerLp = 0,
  rivalLp = 0,
  aiStyle = "balanced"
} = {}) {
  if (!monster) return false;
  if (aiStyle === "control") return true;
  return totalDef(monster) > totalAtk(monster) + 400 && ownerLp < rivalLp;
}

export function chooseAiAttackAction({
  owner = null,
  field = [],
  rivalField = [],
  rivalLp = 0,
  aiStyle = "balanced",
  skippedAttackers = new Set(),
  canAttackMonster = null
} = {}) {
  const skipped = skippedAttackers instanceof Set ? skippedAttackers : new Set(skippedAttackers || []);
  const attackers = field
    .map((card, index) => ({ card, index }))
    .filter((entry) =>
      entry.card &&
      !entry.card.used &&
      entry.card.mode !== "defense" &&
      !skipped.has(entry.card.uid) &&
      typeof canAttackMonster === "function" &&
      canAttackMonster(entry.card, entry.index)
    )
    .sort((a, b) => totalAtk(b.card) - totalAtk(a.card) || a.index - b.index);

  const pick = attackers[0];
  if (!pick) return { type: "none" };
  const targetIndex = chooseAiAttackTarget({
    attacker: pick.card,
    targets: rivalField,
    playerLp: rivalLp,
    aiStyle,
    canUseDirect: owner ? canDirectAttack(owner, pick.card) : false
  });

  if (aiStyle === "scriptedPressure" && targetIndex !== -1) {
    const matchup = choosePressureAttackMatchup(attackers, rivalField);
    if (matchup) {
      return {
        type: "attack",
        card: matchup.card,
        cardUid: matchup.card.uid,
        attackerIndex: matchup.attackerIndex,
        targetIndex: matchup.targetIndex,
        target: matchup.target
      };
    }
  }

  if (targetIndex === null) {
    return {
      type: "skipAttack",
      card: pick.card,
      attackerIndex: pick.index,
      cardUid: pick.card.uid
    };
  }

  return {
    type: "attack",
    card: pick.card,
    cardUid: pick.card.uid,
    attackerIndex: pick.index,
    targetIndex,
    target: targetIndex >= 0 ? rivalField[targetIndex] : null
  };
}

export function chooseAiTurnGoal({
  hand = [],
  field = [],
  aiStyle = "balanced",
  canSummon = null
} = {}) {
  if (aiStyle !== "scriptedPressure") return "pressure";
  const summon = chooseAiSummonAction({ hand, field, aiStyle, canSummon });
  return summon?.tributeCost === 3 && isTrioPressureMonster(summon.card)
    ? "deployTrio"
    : "pressure";
}

export function aiSupportZoneReserve({
  hand = [],
  owner = null,
  rival = null,
  aiStyle = "balanced",
  turnGoal = "pressure",
  minScore = 40,
  canActivateSpell = null
} = {}) {
  if (aiStyle !== "scriptedPressure" || turnGoal !== "deployTrio") return 0;
  const hasDeferredSupport = hand.some((card, handIndex) =>
    card?.type === "spell" &&
    supportZoneInvestmentSpellEffects.has(card.effect) &&
    scoreSpellForAi(card.effect, { owner, rival, aiStyle }) >= minScore &&
    typeof canActivateSpell === "function" &&
    canActivateSpell(card, handIndex)
  );
  return hasDeferredSupport ? 1 : 0;
}

export function collectAiAttackBlockers({
  field = [],
  skippedAttackers = new Set(),
  explainReadiness = null
} = {}) {
  const skipped = skippedAttackers instanceof Set ? skippedAttackers : new Set(skippedAttackers || []);
  return field
    .map((card, fieldIndex) => ({
      card,
      fieldIndex,
      readiness: typeof explainReadiness === "function"
        ? explainReadiness(card, fieldIndex)
        : { ok: false, reason: "", engineReason: "" }
    }))
    .filter(({ card }) =>
      card &&
      card.mode !== "defense" &&
      !skipped.has(card.uid) &&
      (Boolean(card.attackLockReason) || (!card.used))
    )
    .filter(({ card, readiness }) => Boolean(card.attackLockReason) || readiness.ok === false);
}
