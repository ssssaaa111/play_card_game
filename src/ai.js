import { battleValue, canDirectAttack, shieldPreview, totalAtk, totalDef } from './rules.js';
import { describeBattleOutcome } from './battle.js';
import { findAiAttackSequence, findAiDirectLethalAttacker, findAiNextTurnLethalSetup, maximumRemainingAttackDamage, previewAiDirectDamage, scoreSpellForAi } from './spells.js';
import { trapCanResolve } from './traps.js';
import { selectRedirectTarget } from './traps.js';
import { getCardEffectDefinition } from './game-engine.js';

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

function attackOutcome({ owner = null, rival = null, context = {} } = {}, {
  attacker = rival?.field?.[context.attackerIndex],
  targetIndex = context.targetIndex,
  defender = owner
} = {}) {
  if (!attacker) return { outcome: null, target: null };
  const target = targetIndex >= 0 ? owner?.field?.[targetIndex] : null;
  return {
    target,
    outcome: describeBattleOutcome(attacker, target, rival, defender)
  };
}

function defenderOutcomeCost(outcome, target) {
  if (!outcome) return 0;
  const targetLoss = outcome.destroysTarget
    ? 10000 + Math.max(totalAtk(target), totalDef(target))
    : 0;
  const defenderDamage = ["direct", "attackWin", "pierceDefense"].includes(outcome.kind)
    ? outcome.finalDamage
    : 0;
  return targetLoss + defenderDamage;
}

function scriptedAttackThreatScore(details) {
  const { outcome, target } = attackOutcome(details);
  if (!outcome) return 0;
  if (!target) {
    return outcome.finalDamage > 0
      ? 120 + Math.min(80, Math.floor(outcome.finalDamage / 100))
      : 0;
  }
  if (!outcome.destroysTarget) return 0;
  const targetValue = Math.max(totalAtk(target), totalDef(target));
  return 140 +
    Math.min(60, Math.floor(targetValue / 100)) +
    Math.min(30, Math.floor(outcome.finalDamage / 100));
}

function adjustedAttacker(attacker, atkDelta) {
  return {
    ...attacker,
    tempAtk: (attacker?.tempAtk || 0) + atkDelta
  };
}

function scoreContinuingAttackTrap(details, { atkDelta = 0, shieldDelta = 0 } = {}) {
  const attacker = details.rival?.field?.[details.context?.attackerIndex];
  if (!attacker) return 0;
  const baseline = attackOutcome(details);
  const adjustedDefender = {
    ...details.owner,
    shield: (details.owner?.shield || 0) + shieldDelta
  };
  const adjusted = attackOutcome(details, {
    attacker: adjustedAttacker(attacker, atkDelta),
    defender: adjustedDefender
  });
  const beforeCost = defenderOutcomeCost(baseline.outcome, baseline.target);
  const afterCost = defenderOutcomeCost(adjusted.outcome, adjusted.target);
  if (beforeCost <= afterCost) return 0;

  const ownerLp = Math.max(0, Number(details.owner?.lp) || 0);
  const preventsLethal = baseline.outcome?.finalDamage >= ownerLp && adjusted.outcome?.finalDamage < ownerLp;
  const savesTarget = Boolean(baseline.outcome?.destroysTarget && !adjusted.outcome?.destroysTarget);
  if (!savesTarget && !preventsLethal && baseline.target) return 0;
  if (!baseline.target && !preventsLethal) {
    return 100 + Math.min(80, beforeCost - afterCost);
  }
  return 280 + Math.min(80, Math.floor((beforeCost - afterCost) / 100));
}

function scoreRedirectAttack(details) {
  const currentTargetIndex = details.context?.targetIndex ?? -1;
  const redirectTargetIndex = selectRedirectTarget(details.owner?.field || [], currentTargetIndex);
  if (redirectTargetIndex < 0) return 0;
  const baseline = attackOutcome(details);
  const redirected = attackOutcome(details, { targetIndex: redirectTargetIndex });
  const improvement = defenderOutcomeCost(baseline.outcome, baseline.target) -
    defenderOutcomeCost(redirected.outcome, redirected.target);
  return improvement > 0 ? 180 + Math.min(100, Math.floor(improvement / 100)) : 0;
}

const defenderDamageKinds = new Set(["direct", "attackWin", "pierceDefense"]);
const HARD_NEGATE_RESERVE_MARGIN = 1000;

function guaranteedAfterAttackDamage(attacker) {
  const definition = getCardEffectDefinition(attacker?.afterAttack);
  if (!definition || (definition.requirements?.length || 0) > 0) return [];
  return (definition.operations || [])
    .filter((operation) => operation.op === "dealDamage" && operation.player === "rival")
    .map((operation) => Math.max(0, Number(operation.amount) || 0))
    .filter((amount) => amount > 0);
}

function publicAttackThreat(attacker, target, attackerOwner, defender) {
  const outcome = describeBattleOutcome(attacker, target, attackerOwner, defender);
  if (!outcome) return { value: 0, damage: 0, shieldAfter: defender?.shield || 0, lethal: false, outcome: null };

  let remainingShield = Math.max(0, Number(defender?.shield) || 0);
  let damage = 0;
  if (defenderDamageKinds.has(outcome.kind)) {
    damage += Math.max(0, Number(outcome.finalDamage) || 0);
    remainingShield = Math.max(
      0,
      remainingShield - (Number(outcome.shieldPierced) || 0) - (Number(outcome.shieldBlocked) || 0)
    );
  }
  if (!outcome.destroysAttacker) {
    for (const amount of guaranteedAfterAttackDamage(attacker)) {
      const preview = shieldPreview(amount, remainingShield, attacker);
      damage += preview.finalDamage;
      remainingShield = preview.shieldAfter;
    }
  }

  const defenderLp = Math.max(0, Number(defender?.lp) || 0);
  const lethal = defenderLp > 0 && damage >= defenderLp;
  const targetLoss = outcome.destroysTarget
    ? 10000 + Math.max(totalAtk(target), totalDef(target))
    : 0;
  return {
    value: targetLoss + damage + (lethal ? 20000 : 0),
    damage,
    shieldAfter: remainingShield,
    lethal,
    outcome
  };
}

function largestFuturePublicAttackThreat(details, current) {
  const currentTargetIndex = details.context?.targetIndex ?? -1;
  const remainingTargets = (details.owner?.field || [])
    .map((target, index) => current.outcome?.destroysTarget && index === currentTargetIndex ? null : target)
    .filter(Boolean);
  const defender = {
    ...details.owner,
    field: remainingTargets,
    lp: Math.max(0, (Number(details.owner?.lp) || 0) - current.damage),
    shield: current.shieldAfter
  };
  const futureAttackers = (details.rival?.field || [])
    .filter((attacker, index) =>
      index !== details.context?.attackerIndex &&
      attacker?.type === "monster" &&
      !attacker.used &&
      attacker.mode !== "defense" &&
      !attacker.attackLockReason
    );

  let largest = 0;
  for (const attacker of futureAttackers) {
    for (const target of remainingTargets) {
      largest = Math.max(largest, publicAttackThreat(attacker, target, details.rival, defender).value);
    }
    if (remainingTargets.length === 0 || attacker.canDirectAttack || (details.rival?.directAttacks || 0) > 0) {
      largest = Math.max(largest, publicAttackThreat(attacker, null, details.rival, defender).value);
    }
  }
  return largest;
}

function shouldReserveOnlyHardNegate(card, details) {
  if (card.trigger !== "attackNegate") return false;
  const negateCandidates = (details.candidates || []).filter((candidate) => candidate.card?.trigger === "attackNegate");
  if (negateCandidates.length !== 1) return false;

  const attacker = details.rival?.field?.[details.context?.attackerIndex];
  if (!attacker) return false;
  const targetIndex = details.context?.targetIndex ?? -1;
  const target = targetIndex >= 0 ? details.owner?.field?.[targetIndex] : null;
  const current = publicAttackThreat(attacker, target, details.rival, details.owner);
  if (current.lethal) return false;
  return largestFuturePublicAttackThreat(details, current) >= current.value + HARD_NEGATE_RESERVE_MARGIN;
}

function scoreScriptedPressureAttackTrap(card, details) {
  const threat = scriptedAttackThreatScore(details);
  if (card.trigger === "attackDestroy") {
    const attacker = details.rival?.field?.[details.context?.attackerIndex];
    return threat > 0
      ? 320 + Math.min(80, Math.floor(totalAtk(attacker) / 100))
      : 0;
  }
  if (["counterBoost", "attackShift", "attackNegate", "aceGuard"].includes(card.trigger)) {
    if (threat <= 0) return 0;
    if (shouldReserveOnlyHardNegate(card, details)) return 0;
    const bonus = {
      attackNegate: 0,
      attackShift: 20,
      counterBoost: 30,
      aceGuard: 60
    }[card.trigger] || 0;
    return 220 + Math.min(40, Math.floor(threat / 5)) + bonus;
  }
  if (card.trigger === "weakenAttack") {
    return scoreContinuingAttackTrap(details, { atkDelta: -500 });
  }
  if (card.trigger === "soulParry") {
    return scoreContinuingAttackTrap(details, { atkDelta: -300, shieldDelta: 300 });
  }
  if (card.trigger === "redirectAttack") {
    return scoreRedirectAttack(details);
  }
  return 0;
}

function directTrapEffectValue(card, details) {
  const definition = getCardEffectDefinition(card?.trigger);
  const operations = Array.isArray(definition?.operations) ? definition.operations : [];
  const reboundDamage = operations
    .filter((operation) => operation.op === "dealDamage" && operation.player === "rival")
    .reduce((total, operation) => total + Math.max(0, Number(operation.amount) || 0), 0);
  const drawCount = operations
    .filter((operation) => operation.op === "drawCards" && operation.player === "self")
    .reduce((total, operation) => total + Math.max(0, Number(operation.count) || 0), 0);
  const rivalLp = Math.max(0, Number(details.rival?.lp) || 0);
  const availableDraws = Math.min(drawCount, details.owner?.deck?.length || 0);
  return {
    reboundDamage,
    reboundLethal: rivalLp > 0 && reboundDamage >= rivalLp,
    availableDraws
  };
}

function scoreScriptedPressureDirectTrap(card, details) {
  const { outcome } = attackOutcome(details);
  const attacker = details.rival?.field?.[details.context?.attackerIndex];
  const incomingDamage = previewAiDirectDamage(attacker, details.owner?.shield);
  if (outcome?.kind !== "direct" || incomingDamage <= 0) return 0;

  const ownerLp = Math.max(0, Number(details.owner?.lp) || 0);
  const preventsLethal = ownerLp > 0 && incomingDamage >= ownerLp;
  const effectValue = directTrapEffectValue(card, details);
  let score = 180 + Math.min(80, Math.floor(incomingDamage / 100));
  if (preventsLethal) score += 180;
  if (effectValue.reboundLethal) score += 400;
  else {
    score += Math.min(60, Math.floor(effectValue.reboundDamage / 10));
    score += effectValue.availableDraws * 40;
  }
  return score;
}

function scoreAiTrapResponse(card, details = {}) {
  if (!card) return 0;
  if (details.aiStyle === "scriptedPressure") {
    if (details.eventName === "attack") return scoreScriptedPressureAttackTrap(card, details);
    if (details.eventName === "direct") return scoreScriptedPressureDirectTrap(card, details);
  }
  if (details.eventName === "attack" && card.trigger === "attackDestroy") {
    return attackThreatScore(details);
  }
  if (details.eventName === "chain") {
    const sourceTrigger = details.context?.sourceTrap?.trigger || "";
    const blocksKeyPlay = ["attackDestroy", "attackNegate", "counterBoost", "attackShift", "aceGuard"].includes(sourceTrigger);
    return blocksKeyPlay ? 90 : 0;
  }
  return 60;
}

export function chooseAiTrapResponseAction({
  candidates = [],
  owner = null,
  rival = null,
  aiStyle = "balanced",
  eventName = "",
  context = {}
} = {}) {
  const pick = candidates
    .map(({ card, index }) => ({
      type: "activateTrap",
      card,
      trapIndex: index,
      score: scoreAiTrapResponse(card, { owner, rival, aiStyle, eventName, context, candidates })
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.trapIndex - b.trapIndex)[0];
  return pick || null;
}

export function chooseAiAttackTarget({
  attacker,
  targets = [],
  playerLp = 0,
  playerShield = 0,
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
  const directDamage = aiStyle === "scriptedPressure"
    ? previewAiDirectDamage(attacker, playerShield)
    : attackerAtk;
  const shouldDirect = canUseDirect && (
    directDamage >= playerLp ||
    blockedByBoard ||
    (aiStyle === "aggressive" && targetEntries.length > 0)
  );

  if (shouldDirect) return -1;
  if (usefulTargets.length > 0) return usefulTargets[0].targetIndex;
  return null;
}

export function chooseAiAfterAttackSupportTarget({ attacker = null, traps = [] } = {}) {
  const definition = getCardEffectDefinition(attacker?.afterAttack);
  if (definition?.attackDeclarationTarget?.zone !== "spellTrapZone") return -1;
  const occupied = traps
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => Boolean(card));
  if (occupied.length === 0) return -1;
  const publicSpell = occupied.find(({ card }) => card.type === "spell");
  return (publicSpell || occupied[0]).index;
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
  const tributeBodies = (owner?.field || [])
    .filter((card) => card && !isTrioPressureMonster(card))
    .length;
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
    .map(({ card, index }) => {
      const developsTributes = aiStyle === "scriptedPressure" &&
        turnGoal === "buildTributes" &&
        timing === "beforeSummon" &&
        card.effect === "splitToken" &&
        tributeBodies < 3;
      return {
        type: "spell",
        card,
        handIndex: index,
        score: developsTributes ? 94 : scoreSpellForAi(card.effect, { owner, rival, aiStyle }),
        reason: developsTributes
          ? "tributeDevelopment"
          : aiStyle === "scriptedPressure" &&
            turnGoal === "deployTrio" &&
            timing === "afterSummon" &&
            summonSensitiveSpellEffects.has(card.effect)
            ? "trioDeploymentFirst"
            : ""
      };
    })
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

function aiAttackersList(field, { includeUsed = false } = {}) {
  return (field || [])
    .map((card, index) => ({ card, index }))
    .filter((entry) =>
      entry.card &&
      entry.card.mode !== "defense" &&
      (includeUsed || !entry.card.used)
    );
}

export function aiMaxDamageThisTurn({ attackers = [], targets = [], shield = 0, directAttacks = 0 } = {}) {
  const activeAttackers = attackers.filter(Boolean);
  const activeTargets = targets.filter(Boolean);
  if (!activeAttackers.length) return 0;
  return maximumRemainingAttackDamage(
    activeAttackers,
    activeTargets,
    Math.max(0, Number(shield) || 0),
    Math.max(0, Number(directAttacks) || 0)
  );
}

export function aiRivalLethalThreat({ rivalField = [], ownerField = [], ownerShield = 0 } = {}) {
  return aiMaxDamageThisTurn({
    attackers: aiAttackersList(rivalField, { includeUsed: true }).map((entry) => entry.card),
    targets: ownerField.filter(Boolean),
    shield: ownerShield
  });
}

function chooseThreatTarget(attacker, targets) {
  const attackerAtk = totalAtk(attacker);
  const entries = (targets || [])
    .map((target, index) => target ? { target, index, atk: totalAtk(target) } : null)
    .filter(Boolean)
    .filter((entry) => entry.target.mode === "attack")
    .sort((a, b) => b.atk - a.atk || a.index - b.index);
  for (const entry of entries) {
    if (attackerAtk > entry.atk) return entry.index;
  }
  return null;
}

function aiLiveAttackTraps(rivalTraps = [], rivalField = []) {
  return (rivalTraps || [])
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && trapCanResolve(card, "attack", {
      owner: { traps: rivalTraps, field: rivalField }
    }));
}

export function chooseAiAttackAction({
  owner = null,
  field = [],
  rivalField = [],
  rivalTraps = [],
  rivalLp = 0,
  rivalShield = 0,
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
  if (aiStyle !== "scriptedPressure") {
    const liveTraps = aiLiveAttackTraps(rivalTraps, rivalField);
    const canCounter = (owner?.traps || []).some((card) => card?.trigger === "chainNegate");
    if (liveTraps.length > 0 && !canCounter && attackers.length > 1) {
      const sorted = [...attackers].sort((a, b) => totalAtk(a.card) - totalAtk(b.card));
      const bait = sorted[0];
      const strongest = sorted[sorted.length - 1];
      if (totalAtk(strongest.card) > totalAtk(bait.card) + 200) {
        const baitTarget = chooseAiAttackTarget({
          attacker: bait.card,
          targets: rivalField,
          playerLp: rivalLp,
          playerShield: rivalShield,
          aiStyle,
          canUseDirect: owner ? canDirectAttack(owner, bait.card) : false
        });
        if (baitTarget !== null) {
          return {
            type: "attack",
            card: bait.card,
            cardUid: bait.card.uid,
            attackerIndex: bait.index,
            targetIndex: baitTarget,
            target: baitTarget >= 0 ? rivalField[baitTarget] : null
          };
        }
      }
    }
  }
  const lethalDamage = aiMaxDamageThisTurn({
    attackers: attackers.map((entry) => entry.card),
    targets: rivalField,
    shield: rivalShield,
    directAttacks: owner?.directAttacks || 0
  });
  const canKillNow = lethalDamage >= rivalLp;
  const rivalThreat = aiRivalLethalThreat({
    rivalField,
    ownerField: field,
    ownerShield: owner?.shield || 0
  });
  const underLethalThreat = !canKillNow && rivalThreat >= (owner?.lp || 0);
  const threatTarget = underLethalThreat ? chooseThreatTarget(pick.card, rivalField) : null;
  const targetEntries = rivalField
    .map((card, index) => card ? { card, index } : null)
    .filter(Boolean);
  const sequencePlan = findAiAttackSequence({
    attackers: attackers.map((entry) => entry.card),
    targets: targetEntries.map((entry) => entry.card),
    shield: rivalShield,
    directAttacks: owner?.directAttacks || 0,
    damageGoal: rivalLp
  });
  if (sequencePlan.damage >= rivalLp && sequencePlan.moves.length > 0) {
    const first = sequencePlan.moves[0];
    const fieldAttacker = attackers[first.attackerIndex];
    const targetFieldIndex = first.targetIndex >= 0 ? targetEntries[first.targetIndex].index : -1;
    return {
      type: "attack",
      card: fieldAttacker.card,
      cardUid: fieldAttacker.card.uid,
      attackerIndex: fieldAttacker.index,
      targetIndex: targetFieldIndex,
      target: targetFieldIndex >= 0 ? rivalField[targetFieldIndex] : null
    };
  }
  const nextTurnSetup = findAiNextTurnLethalSetup({
    attackers: attackers.map((entry) => entry.card),
    targets: targetEntries.map((entry) => entry.card),
    shield: rivalShield,
    directAttacks: owner?.directAttacks || 0,
    rivalLp
  });
  if (nextTurnSetup) {
    const setupAttacker = attackers[nextTurnSetup.attackerIndex];
    const targetFieldIndex = nextTurnSetup.targetIndex >= 0
      ? targetEntries[nextTurnSetup.targetIndex].index
      : -1;
    return {
      type: "attack",
      card: setupAttacker.card,
      cardUid: setupAttacker.card.uid,
      attackerIndex: setupAttacker.index,
      targetIndex: targetFieldIndex,
      target: targetFieldIndex >= 0 ? rivalField[targetFieldIndex] : null
    };
  }
  if (aiStyle === "scriptedPressure" && rivalField.some(Boolean)) {
    const lethalDirect = findAiDirectLethalAttacker({
      attackers: attackers.map((entry) => entry.card),
      targets: rivalField,
      rivalLp,
      shield: rivalShield,
      directAttacks: owner?.directAttacks || 0
    });
    if (lethalDirect) {
      const directPick = attackers[lethalDirect.attackerIndex];
      return {
        type: "attack",
        card: directPick.card,
        cardUid: directPick.card.uid,
        attackerIndex: directPick.index,
        targetIndex: -1,
        target: null
      };
    }
  }
  if (threatTarget !== null) {
    return {
      type: "attack",
      card: pick.card,
      cardUid: pick.card.uid,
      attackerIndex: pick.index,
      targetIndex: threatTarget,
      target: rivalField[threatTarget]
    };
  }
  const targetIndex = chooseAiAttackTarget({
    attacker: pick.card,
    targets: rivalField,
    playerLp: rivalLp,
    playerShield: rivalShield,
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
  if (summon?.tributeCost === 3 && isTrioPressureMonster(summon.card)) return "deployTrio";
  const trioWaiting = hand.some((card) => isTrioPressureMonster(card));
  const tributeBodies = field.filter((card) => card && !isTrioPressureMonster(card)).length;
  return trioWaiting && tributeBodies < 3 ? "buildTributes" : "pressure";
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
