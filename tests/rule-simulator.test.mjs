import test from "node:test";
import assert from "node:assert/strict";

import {
  createBalanceStats,
  finalizeBalanceReport,
  recordBalanceEvents,
  recordBalanceGameResult,
  simulateChainTrapScenario,
  simulateRandomDuels
} from "../src/rule-simulator.js";

test("random duel simulator exercises core rules through dispatch", () => {
  const result = simulateRandomDuels({
    games: 20,
    seed: "rule-sim-baseline",
    maxStepsPerGame: 260
  });

  assert.equal(result.games, 20);
  assert.equal(result.failures.length, 0);
  assert.equal(result.maxStepsReached, 0);
  assert.ok(result.totalSteps > 0);
  assert.ok(result.actions.RESOLVE_TURN_DRAW > 0);
  assert.ok(result.actions.SUMMON_MONSTER > 0);
  assert.ok(result.actions.ACTIVATE_CARD > 0);
  assert.ok(result.actions.SET_TRAP > 0);
  assert.ok(result.actions.DECLARE_ATTACK > 0);
  assert.ok(result.actions.RESOLVE_BATTLE > 0);
  assert.ok(result.eventTypes.RESPONSE_WINDOW_OPENED > 0);
  assert.ok(result.eventTypes.RESPONSE_WINDOW_CLOSED > 0);
  assert.ok(result.eventTypes.BATTLE_RESOLVED > 0);
  assert.equal(result.balanceReport.totalGames, 20);
  assert.ok(result.balanceReport.averages.turns > 0);
  assert.ok(result.balanceReport.averages.attackDeclarations > 0);
});

test("balance stats accumulate base events and redirected defender mismatches", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      "spell-1": { id: "spell-1", templateId: "soul-resonance", type: "spell" },
      "trap-1": { id: "trap-1", templateId: "soul-parry", type: "trap" },
      "old-target": { id: "old-target", templateId: "dusk-alchemist", type: "monster" },
      "new-target": { id: "new-target", templateId: "iron-guardian", type: "monster" }
    }
  };

  recordBalanceEvents(stats, [
    { id: 1, type: "TURN_DRAW_RESOLVED" },
    { id: 2, type: "CARD_ACTIVATED", cardId: "spell-1", cardType: "spell" },
    { id: 3, type: "CARD_ACTIVATED", cardId: "trap-1", cardType: "trap" },
    { id: 4, type: "ATTACK_DECLARED", attackerCardId: "attacker-1", targetCardId: "old-target" },
    {
      id: 5,
      type: "ATTACK_TARGET_CHANGED",
      attackerCardId: "attacker-1",
      fromTargetCardId: "old-target",
      toTargetCardId: "new-target",
      sourceCardId: "trap-1",
      declarationEventId: 4
    },
    { id: 6, type: "DAMAGE_DEALT", amount: 500, sourceCardId: "spell-1" },
    { id: 7, type: "CARD_DESTROYED", cardId: "old-target", sourceCardId: "attacker-1" },
    { id: 8, type: "CHAIN_RESOLVED" },
    { id: 9, type: "BATTLE_RESOLVED", declarationEventId: 4, targetCardId: "new-target" },
    { id: 10, type: "DRAW_FAILED", missing: 1 }
  ], { state });
  recordBalanceGameResult(stats, { endedBy: "gameOver", winnerId: "player", gameOverReason: "lp-zero" });

  const report = finalizeBalanceReport(stats);
  assert.equal(report.wins.player, 1);
  assert.equal(report.totals.turns, 1);
  assert.equal(report.totals.spellsActivated, 1);
  assert.equal(report.totals.trapsActivated, 1);
  assert.equal(report.totals.attackDeclarations, 1);
  assert.equal(report.totals.battleResolutions, 1);
  assert.equal(report.totals.damageDealt, 500);
  assert.equal(report.deckOuts, 1);
  assert.equal(report.complexBattleEvents.ATTACK_TARGET_CHANGED, 1);
  assert.equal(report.complexBattleEvents.TRAP_ACTIVATED, 1);
  assert.equal(report.complexBattleEvents.attackDeclaredTargetFinalDefenderMismatches, 1);
});

test("balance stats expose and accumulate basic expansion card fields", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      apprentice: { id: "apprentice", templateId: "star-soul-apprentice", type: "monster" },
      bulwark: { id: "bulwark", templateId: "rift-bulwark", type: "monster" },
      resonance: { id: "resonance", templateId: "soul-resonance", type: "spell" },
      parry: { id: "parry", templateId: "soul-parry", type: "trap" },
      draw: { id: "draw", templateId: "solar-knight", type: "monster" },
      target: { id: "target", templateId: "star-lancer", type: "monster" }
    }
  };

  recordBalanceEvents(stats, [
    { id: 1, type: "CARDS_DRAWN", cardIds: ["apprentice", "bulwark", "resonance", "parry"] },
    { id: 2, type: "MONSTER_SUMMONED", cardId: "apprentice" },
    { id: 3, type: "CARDS_DRAWN", cardIds: ["draw"], sourceCardId: "apprentice" },
    { id: 4, type: "MONSTER_SUMMONED", cardId: "bulwark" },
    { id: 5, type: "SHIELD_GAINED", amount: 300, sourceCardId: "bulwark" },
    { id: 6, type: "CARD_ACTIVATED", cardId: "resonance", cardType: "spell" },
    { id: 7, type: "STAT_MODIFIED", cardId: "target", sourceCardId: "resonance" },
    { id: 8, type: "CARD_ACTIVATED", cardId: "parry", cardType: "trap" },
    { id: 9, type: "CHAIN_LINK_RESOLVED", cardId: "parry", skipped: false }
  ], { state });

  const report = finalizeBalanceReport(stats);
  assert.equal(report.expansion01["star-soul-apprentice"].appeared, 1);
  assert.equal(report.expansion01["star-soul-apprentice"].summoned, 1);
  assert.equal(report.expansion01["star-soul-apprentice"].resolved, 1);
  assert.equal(report.expansion01["rift-bulwark"].appeared, 1);
  assert.equal(report.expansion01["rift-bulwark"].summoned, 1);
  assert.equal(report.expansion01["rift-bulwark"].resolved, 1);
  assert.equal(report.expansion01["soul-resonance"].appeared, 1);
  assert.equal(report.expansion01["soul-resonance"].activated, 1);
  assert.equal(report.expansion01["soul-resonance"].resolved, 1);
  assert.equal(report.expansion01["soul-parry"].appeared, 1);
  assert.equal(report.expansion01["soul-parry"].activated, 1);
  assert.equal(report.expansion01["soul-parry"].resolved, 1);
});

test("balance report handles empty samples", () => {
  const report = finalizeBalanceReport(createBalanceStats());

  assert.equal(report.totalGames, 0);
  assert.equal(report.winRates.player, 0);
  assert.equal(report.winRates.ai, 0);
  assert.equal(report.averages.turns, 0);
  assert.equal(report.expansion01["star-soul-apprentice"].appeared, 0);
});

test("balance report records max step truncation", () => {
  const result = simulateRandomDuels({
    games: 1,
    seed: "step-limit",
    maxStepsPerGame: 1
  });

  assert.equal(result.failures.length, 0);
  assert.equal(result.maxStepsReached, 1);
  assert.equal(result.balanceReport.maxStepTruncations, 1);
  assert.equal(result.balanceReport.abnormalEndReasons.stepLimit, 1);
});

test("random duel simulator is deterministic for the same seed", () => {
  const first = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });
  const second = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });

  assert.deepEqual(second, first);
});

test("chain trap scenario resolves through response window and chain events", () => {
  const result = simulateChainTrapScenario();

  assert.equal(result.failures.length, 0);
  assert.equal(result.actions.DECLARE_ATTACK, 1);
  assert.equal(result.actions.RESOLVE_CHAIN, 1);
  assert.equal(result.actions.RESOLVE_BATTLE, 1);
  assert.ok(result.eventTypes.CHAIN_LINK_ADDED >= 2);
  assert.ok(result.eventTypes.CHAIN_LINK_COMMITTED >= 2);
  assert.ok(result.eventTypes.EFFECT_NEGATED >= 1);
  assert.ok(result.eventTypes.CHAIN_RESOLVED >= 1);
  assert.ok(result.eventTypes.BATTLE_RESOLVED >= 1);
});
