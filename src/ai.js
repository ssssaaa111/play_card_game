import { battleValue, canDirectAttack, totalAtk, totalDef } from './rules.js';
import { scoreSpellForAi, validateSpellCondition } from './spells.js';

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
  minScore = 40
} = {}) {
  const candidates = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) =>
      card?.type === "spell" &&
      validateSpellCondition(card.effect, { owner, rival, card, handIndex: index }).ok
    )
    .map(({ card, index }) => ({
      type: "spell",
      card,
      handIndex: index,
      score: scoreSpellForAi(card.effect, { owner, rival, aiStyle })
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.handIndex - b.handIndex);

  return candidates[0] || null;
}

export function chooseAiSetTrapAction({ hand = [], traps = [] } = {}) {
  const trapIndex = traps.findIndex((slot) => !slot);
  if (trapIndex < 0) return null;
  const handIndex = hand.findIndex((card) => card?.type === "trap");
  if (handIndex < 0) return null;
  return {
    type: "setTrap",
    card: hand[handIndex],
    handIndex,
    trapIndex
  };
}

export function scoreAiMonster(card, aiStyle = "balanced") {
  if (!card) return 0;
  const stars = Number(card.stars) || 0;
  if (aiStyle === "control") return Math.max(totalDef(card), totalAtk(card) - 150) + (card.onSummon ? 120 : 0);
  if (aiStyle === "aggressive") return totalAtk(card) + (card.afterAttack ? 180 : 0) + stars * 35;
  return totalAtk(card) + stars * 20;
}

export function chooseAiSummonAction({ hand = [], field = [], aiStyle = "balanced" } = {}) {
  const fieldIndex = field.findIndex((slot) => !slot);
  if (fieldIndex < 0) return null;
  const candidates = hand
    .map((card, index) => ({ card, index, score: scoreAiMonster(card, aiStyle) }))
    .filter((entry) => entry.card?.type === "monster")
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const pick = candidates[0];
  if (!pick) return null;
  return {
    type: "summon",
    card: pick.card,
    handIndex: pick.index,
    fieldIndex,
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
  skippedAttackers = new Set()
} = {}) {
  const skipped = skippedAttackers instanceof Set ? skippedAttackers : new Set(skippedAttackers || []);
  const attackers = field
    .map((card, index) => ({ card, index }))
    .filter((entry) =>
      entry.card &&
      !entry.card.used &&
      entry.card.mode !== "defense" &&
      !skipped.has(entry.card.uid)
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
    attackerIndex: pick.index,
    targetIndex,
    target: targetIndex >= 0 ? rivalField[targetIndex] : null
  };
}
