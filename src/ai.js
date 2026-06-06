import { battleValue, totalAtk } from './rules.js';

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
