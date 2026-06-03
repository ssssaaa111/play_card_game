import { PHASES } from './turn-state.js';

export { shouldRunPlayerIdleCountdown } from './turn-state.js';

export function hasAvailableAttack(field = []) {
  return field.some((card) => card && !card.used && card.mode !== "defense");
}

export function canDuelistAttack(duelist) {
  return !duelist?.attacksSkipped && hasAvailableAttack(duelist?.field || []);
}

export function skipAvailableAttacks(field = []) {
  let skipped = 0;
  field.forEach((card) => {
    if (card && !card.used && card.mode !== "defense") {
      card.used = true;
      skipped += 1;
    }
  });
  return skipped;
}

export function canChangeMode(field = []) {
  return field.some((card) => card && !card.used && !card.changedMode);
}

export function canChangeAttackToDefense(field = []) {
  return field.some((card) => card && !card.used && !card.changedMode && card.mode !== "defense");
}

export function canSummonFromHand(duelist, summonedThisTurn = false) {
  const hasEmptyZone = duelist.field.some((slot) => !slot);
  const hasMonster = duelist.hand.some((card) => card.type === "monster");
  return hasEmptyZone && hasMonster && (!summonedThisTurn || duelist.extraSummon > 0);
}

export function canSetTrapFromHand(duelist) {
  return duelist.traps.some((slot) => !slot) && duelist.hand.some((card) => card.type === "trap");
}

export function summarizePlayerActions({
  player,
  pendingTarget = null,
  summonedThisTurn = false,
  canSpell = () => false
}) {
  const summary = {
    targetSelect: Boolean(pendingTarget),
    attack: canDuelistAttack(player),
    spell: player.hand.some((card, index) => canSpell(card, index)),
    summon: canSummonFromHand(player, summonedThisTurn),
    trap: canSetTrapFromHand(player),
    mode: canChangeMode(player.field),
    modeBlocksMain: canChangeAttackToDefense(player.field)
  };
  return {
    ...summary,
    hasAny: summary.targetSelect || summary.attack || summary.spell || summary.summon || summary.trap || summary.mode
  };
}

export function actionsForPhase(summary = {}, phase = PHASES.main) {
  const actions = {
    targetSelect: Boolean(summary.targetSelect),
    attack: Boolean(summary.attack),
    spell: Boolean(summary.spell),
    summon: Boolean(summary.summon),
    trap: Boolean(summary.trap),
    mode: Boolean(summary.mode)
  };
  const modeBlocksMain = summary.modeBlocksMain ?? actions.mode;
  const hasMain = Boolean(actions.targetSelect || actions.spell || actions.summon || actions.trap || modeBlocksMain);
  const hasBattle = Boolean(actions.attack || actions.spell || actions.trap);

  if (actions.targetSelect) {
    return { ...actions, attack: false, hasMain, hasBattle, hasAny: true };
  }
  if (phase === PHASES.main) {
    return { ...actions, hasMain, hasBattle, hasAny: hasMain || actions.attack };
  }
  if (phase === PHASES.battle) {
    return {
      ...actions,
      summon: false,
      mode: false,
      hasMain,
      hasBattle,
      hasAny: hasBattle
    };
  }
  return {
    targetSelect: false,
    attack: false,
    spell: false,
    summon: false,
    trap: false,
    mode: false,
    hasMain,
    hasBattle,
    hasAny: false
  };
}
