import test from "node:test";
import assert from "node:assert/strict";

import {
  actionsForPhase,
  canChangeAttackToDefense,
  canDuelistAttack,
  canChangeMode,
  canSetTrapFromHand,
  canSummonFromHand,
  hasAvailableAttack,
  shouldRunPlayerIdleCountdown,
  skipAvailableAttacks,
  summarizePlayerActions
} from "../src/actions.js";

function monster(overrides = {}) {
  return { type: "monster", mode: "attack", used: false, changedMode: false, ...overrides };
}

function duelist(overrides = {}) {
  return {
    field: [null, null, null],
    traps: [null, null, null],
    hand: [],
    extraSummon: 0,
    ...overrides
  };
}

test("detects attack and mode-change availability from field state", () => {
  assert.equal(hasAvailableAttack([monster()]), true);
  assert.equal(hasAvailableAttack([monster({ mode: "defense" })]), false);
  assert.equal(hasAvailableAttack([monster({ used: true })]), false);

  assert.equal(canChangeMode([monster()]), true);
  assert.equal(canChangeMode([monster({ changedMode: true })]), false);
  assert.equal(canChangeMode([monster({ used: true })]), false);
  assert.equal(canChangeAttackToDefense([monster()]), true);
  assert.equal(canChangeAttackToDefense([monster({ mode: "defense" })]), false);
  assert.equal(canChangeAttackToDefense([monster({ used: true })]), false);
});

test("blocks attacks after the player has skipped battle for the turn", () => {
  assert.equal(canDuelistAttack(duelist({ field: [monster(), null, null] })), true);
  assert.equal(canDuelistAttack(duelist({ field: [monster(), null, null], attacksSkipped: true })), false);

  const summary = summarizePlayerActions({
    player: duelist({ field: [monster(), null, null], attacksSkipped: true })
  });
  assert.equal(summary.attack, false);
  assert.equal(summary.hasAny, true, "other non-attack actions can still keep the action window open");
});

test("skipped battle prevents newly summoned monsters from opening attacks", () => {
  const player = duelist({ attacksSkipped: true, field: [monster({ used: true }), monster(), null] });
  assert.equal(skipAvailableAttacks(player.field), 1);
  player.field[2] = monster();
  assert.equal(canDuelistAttack(player), false);
});

test("marks all available attacks as skipped without touching guards", () => {
  const ready = monster();
  const alreadyUsed = monster({ used: true });
  const defender = monster({ mode: "defense" });
  const field = [ready, alreadyUsed, defender];

  assert.equal(skipAvailableAttacks(field), 1);
  assert.equal(ready.used, true);
  assert.equal(alreadyUsed.used, true);
  assert.equal(defender.used, false);
  assert.equal(hasAvailableAttack(field), false);
});

test("detects when the player idle countdown should run", () => {
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: true, phase: "main", actionWindow: "main" }), true);
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: true, phase: "draw", actionWindow: "draw" }), false);
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: true, phase: "main", autoEnding: true, actionWindow: "autoEnd" }), false);
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: true, phase: "main", actionWindow: "targetSelect" }), true);
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: true, phase: "main", actionWindow: "response" }), true);
  assert.equal(shouldRunPlayerIdleCountdown({ canAct: false, phase: "main", actionWindow: "main" }), false);
});

test("detects summon and trap availability from hand and zones", () => {
  assert.equal(canSummonFromHand(duelist({ hand: [monster()] }), false), true);
  assert.equal(canSummonFromHand(duelist({ hand: [monster()], field: [monster(), monster(), monster()] }), false), false);
  assert.equal(canSummonFromHand(duelist({ hand: [monster()] }), true), false);
  assert.equal(canSummonFromHand(duelist({ hand: [monster()], extraSummon: 1 }), true), true);

  assert.equal(canSetTrapFromHand(duelist({ hand: [{ type: "trap" }] })), true);
  assert.equal(canSetTrapFromHand(duelist({ hand: [{ type: "trap" }], traps: [{ type: "trap" }, { type: "trap" }, { type: "trap" }] })), false);
});

test("summarizes player action windows in one place", () => {
  const summary = summarizePlayerActions({
    player: duelist({
      field: [monster({ mode: "defense", changedMode: true }), null, null],
      hand: [{ type: "spell", effect: "draw2" }, { type: "trap" }]
    }),
    summonedThisTurn: true,
    canSpell: (card) => card.type === "spell"
  });

  assert.equal(summary.attack, false);
  assert.equal(summary.spell, true);
  assert.equal(summary.summon, false);
  assert.equal(summary.trap, true);
  assert.equal(summary.mode, false);
  assert.equal(summary.modeBlocksMain, false);
  assert.equal(summary.hasAny, true);
});

test("defense-only mode switches do not block automatic turn flow", () => {
  const defenseOnly = summarizePlayerActions({
    player: duelist({
      field: [monster({ mode: "defense" }), monster({ mode: "defense" }), null]
    })
  });
  assert.equal(defenseOnly.mode, true, "the UI can still show that battle position is selectable");
  assert.equal(defenseOnly.modeBlocksMain, false, "switching guards back to attack should not keep the turn open by itself");

  const defenseOnlyActions = actionsForPhase(defenseOnly, "main");
  assert.equal(defenseOnlyActions.hasMain, false);
  assert.equal(defenseOnlyActions.hasAny, false);

  const attackReady = summarizePlayerActions({
    player: duelist({
      field: [monster(), monster({ mode: "defense" }), null]
    })
  });
  assert.equal(attackReady.mode, true);
  assert.equal(attackReady.modeBlocksMain, true);
  assert.equal(actionsForPhase(attackReady, "main").hasMain, true);
});

test("battle phase keeps trap setting as a valid action and auto-ends when empty", () => {
  const fullSummary = summarizePlayerActions({
    player: duelist({
      field: [monster({ used: true }), null, null],
      hand: [{ type: "trap" }]
    }),
    canSpell: () => false
  });

  const battleActions = actionsForPhase(fullSummary, "battle");
  assert.equal(battleActions.attack, false);
  assert.equal(battleActions.spell, false);
  assert.equal(battleActions.trap, true);
  assert.equal(battleActions.summon, false);
  assert.equal(battleActions.mode, false);
  assert.equal(battleActions.hasBattle, true);
  assert.equal(battleActions.hasAny, true);

  const emptyBattleActions = actionsForPhase({
    targetSelect: false,
    attack: false,
    spell: false,
    summon: false,
    trap: false,
    mode: false
  }, "battle");
  assert.equal(emptyBattleActions.hasBattle, false);
  assert.equal(emptyBattleActions.hasAny, false);
});

test("pending target selection keeps the action window open", () => {
  const summary = summarizePlayerActions({
    player: duelist(),
    pendingTarget: { handUid: "spell-1" }
  });

  assert.equal(summary.targetSelect, true);
  assert.equal(summary.hasAny, true);
});
