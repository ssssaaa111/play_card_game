import test from "node:test";
import assert from "node:assert/strict";

import {
  createSimulatorActionEntries,
  createBalanceStats,
  finalizeBalanceReport,
  recordBalanceActionRejected,
  recordBalanceEvents,
  recordBalanceGameResult,
  simulateChainTrapScenario,
  simulateRandomDuels
} from "../src/rule-simulator.js";
import { library } from "../src/data.js";
import { ActionWindow, GameEngine, Phase, Timing } from "../src/game-engine.js";
import { FIELD_SIZE, MAX_LP } from "../src/rules.js";

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

test("finale full-duel matchup completes without stalls or engine failures", () => {
  const result = simulateRandomDuels({
    games: 3,
    seed: "finale-matchup-regression",
    maxStepsPerGame: 400,
    playerPreset: "protagonistTrioOmegaFull",
    aiPreset: "trioOmegaRivalFull"
  });

  assert.equal(result.games, 3);
  assert.equal(result.completedGames, 3);
  assert.equal(result.failures.length, 0);
  assert.equal(result.maxStepsReached, 0);
  assert.equal(result.balanceReport.totals.maxStepTruncations, 0);
  assert.deepEqual(result.balanceReport.abnormalEndReasons, {});
  assert.ok(result.balanceReport.wins.player + result.balanceReport.wins.ai > 0);
  assert.ok(result.balanceReport.averages.turns > 0);
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
  assert.equal(report.diagnostics.effectSkipped.total, 0);
  assert.equal(report.diagnostics.actionRejected.total, 0);
  assert.equal(report.diagnostics.drawToUseDelay.samples, 0);
  assert.equal(report.diagnostics.longGames.total, 0);
  assert.deepEqual(report.diagnostics.longGames.samples, []);
});

test("diagnostics accumulate skipped rejected fizzled and per-card causes", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      bulwark: { id: "bulwark", templateId: "rift-bulwark", name: "裂隙壁卫", type: "monster" },
      parry: { id: "parry", templateId: "soul-parry", name: "星魂格挡", type: "trap", trigger: "soulParry" },
      resonance: { id: "resonance", templateId: "soul-resonance", name: "星魂共鸣", type: "spell" }
    }
  };

  recordBalanceEvents(stats, [
    {
      id: 1,
      type: "EFFECT_SKIPPED",
      cardId: "bulwark",
      effectId: "riftShelter",
      reason: "Effect riftShelter requires at least 2 shadow monsters"
    },
    {
      id: 2,
      type: "EFFECT_SKIPPED",
      cardId: "parry",
      effectId: "soulParry",
      reason: "negated"
    }
  ], { state });
  recordBalanceActionRejected(stats, { type: "ACTIVATE_CARD", cardId: "resonance" }, "no valid target", { state, category: "no-valid-target" });

  const report = finalizeBalanceReport(stats);
  assert.equal(report.diagnostics.effectSkipped.total, 2);
  assert.equal(report.diagnostics.effectSkipped.byCategory["condition-not-met"], 1);
  assert.equal(report.diagnostics.effectSkipped.byCategory.negated, 1);
  assert.equal(report.diagnostics.actionRejected.total, 1);
  assert.equal(report.diagnostics.actionRejected.byCategory["no-valid-target"], 1);
  assert.equal(report.diagnostics.fizzled.total, 2);
  assert.equal(report.diagnostics.cards["rift-bulwark"].conditionNotMet, 1);
  assert.equal(report.diagnostics.cards["soul-parry"].negated, 1);
  assert.equal(report.diagnostics.cards["soul-resonance"].noValidTarget, 1);
});

test("diagnostics classify redirected traps and target-change events", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      switch: { id: "switch", templateId: "phantom-switch", name: "幻影换位", type: "trap", trigger: "redirectAttack" },
      oldTarget: { id: "oldTarget", templateId: "dusk-alchemist", type: "monster" },
      newTarget: { id: "newTarget", templateId: "iron-guardian", type: "monster" }
    }
  };

  recordBalanceEvents(stats, [
    { id: 1, type: "CARD_ACTIVATED", cardId: "switch", cardType: "trap" },
    {
      id: 2,
      type: "ATTACK_TARGET_CHANGED",
      sourceCardId: "switch",
      fromTargetCardId: "oldTarget",
      toTargetCardId: "newTarget"
    },
    { id: 3, type: "CHAIN_LINK_RESOLVED", cardId: "switch", skipped: false }
  ], { state });

  const report = finalizeBalanceReport(stats);
  assert.equal(report.complexBattleEvents.ATTACK_TARGET_CHANGED, 1);
  assert.equal(report.diagnostics.trapClasses.redirectTarget.activated, 1);
  assert.equal(report.diagnostics.trapClasses.redirectTarget.resolved, 1);
});

test("diagnostics accumulate damage source distribution", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      attacker: { id: "attacker", templateId: "star-lancer", type: "monster" },
      spell: { id: "spell", templateId: "burst-rune", type: "spell" }
    }
  };

  recordBalanceEvents(stats, [
    { id: 1, type: "DAMAGE_DEALT", sourceCardId: "attacker", requested: 900, blocked: 200, amount: 700 }
  ], { state, action: { type: "RESOLVE_BATTLE", attackerCardId: "attacker" } });
  recordBalanceEvents(stats, [
    { id: 2, type: "DAMAGE_DEALT", sourceCardId: "spell", requested: 500, blocked: 0, amount: 500 }
  ], { state, action: { type: "ACTIVATE_CARD", cardId: "spell" } });
  recordBalanceEvents(stats, [
    { id: 3, type: "DAMAGE_DEALT", requested: 500, blocked: 100, amount: 400 }
  ], { state, action: { type: "RESOLVE_TURN_DRAW" } });

  const damage = finalizeBalanceReport(stats).diagnostics.damageSources;
  assert.deepEqual(damage.battle, { events: 1, requested: 900, shieldBlocked: 200, dealt: 700 });
  assert.deepEqual(damage.effect, { events: 1, requested: 500, shieldBlocked: 0, dealt: 500 });
  assert.deepEqual(damage.deckOut, { events: 1, requested: 500, shieldBlocked: 100, dealt: 400 });
});

test("diagnostics track draw-to-use delay in event distance", () => {
  const stats = createBalanceStats();
  const state = {
    cards: {
      resonance: { id: "resonance", templateId: "soul-resonance", name: "星魂共鸣", type: "spell" }
    }
  };

  recordBalanceEvents(stats, [
    { id: 2, type: "CARDS_DRAWN", cardIds: ["resonance"] },
    { id: 7, type: "CARD_ACTIVATED", cardId: "resonance", cardType: "spell" }
  ], { state });

  const delay = finalizeBalanceReport(stats).diagnostics.drawToUseDelay;
  assert.equal(delay.samples, 1);
  assert.equal(delay.averageEvents, 5);
  assert.equal(delay.byCard["soul-resonance"].averageEvents, 5);
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
  assert.equal(result.balanceReport.diagnostics.longGames.total, 1);
  const sample = result.balanceReport.diagnostics.longGames.samples[0];
  assert.equal(sample.steps, 1);
  assert.ok(sample.finalTurn.playerId);
  assert.ok(sample.finalBoardState.player);
  assert.ok(Array.isArray(sample.lastEvents));
  assert.equal(typeof sample.zeroDamageBattleCount, "number");
  assert.equal(typeof sample.turnsWithoutDamage, "number");
  assert.equal(typeof sample.fullMonsterZoneTurns.any, "number");
  assert.equal(typeof sample.fullSpellTrapZoneTurns.any, "number");
});

test("random duel simulator is deterministic for the same seed", () => {
  const first = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });
  const second = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });

  assert.deepEqual(second, first);
});

test("simulator strategy entries remain legal dispatch candidates", () => {
  const state = simulatorTestState({
    playerCards: [
      runtimeCard("shadow-field", "void-hound", "player"),
      runtimeCard("bulwark", "rift-bulwark", "player"),
      runtimeCard("resonance", "soul-resonance", "player"),
      runtimeCard("parry", "soul-parry", "player")
    ],
    hand: ["bulwark", "resonance", "parry"],
    monsterZone: ["shadow-field"]
  });

  const entries = createSimulatorActionEntries(state, "player");
  assert.ok(entries.length > 0);
  for (const { action } of entries) {
    assert.doesNotThrow(() => new GameEngine(cloneState(state)).dispatch(action));
  }
});

test("simulator battle projection keeps an engine-owned main window compatible", () => {
  const state = simulatorTestState({
    playerCards: [runtimeCard("attacker", "star-lancer", "player")],
    monsterZone: ["attacker"]
  });
  state.machine.actionWindow = {
    playerId: "player",
    window: ActionWindow.main,
    windowId: "main:simulator-test",
    reason: "phase-entered:main",
    openedAt: 1,
    deadline: 0
  };

  const entries = createSimulatorActionEntries(state, "player");

  assert.ok(entries.some((entry) =>
    entry.action.type === "CHANGE_PHASE" && entry.action.phase === Phase.battle
  ));
});

test("simulator avoids normal summon projection noise after summon is spent", () => {
  const stats = createBalanceStats();
  const state = simulatorTestState({
    playerCards: [runtimeCard("bulwark", "rift-bulwark", "player")],
    hand: ["bulwark"],
    normalSummonsUsed: 1
  });

  const entries = createSimulatorActionEntries(state, "player", stats);
  assert.equal(entries.some((entry) => entry.action.type === "SUMMON_MONSTER"), false);
  const report = finalizeBalanceReport(stats);
  assert.equal(report.diagnostics.actionRejected.byReason["normal summon already used"] || 0, 0);
});

test("simulator avoids monster-zone-full summon projection noise", () => {
  const stats = createBalanceStats();
  const field = Array.from({ length: FIELD_SIZE }, (_, index) => `field-${index}`);
  const state = simulatorTestState({
    playerCards: [
      ...field.map((id) => runtimeCard(id, "solar-knight", "player")),
      runtimeCard("bulwark", "rift-bulwark", "player")
    ],
    hand: ["bulwark"],
    monsterZone: field
  });

  const entries = createSimulatorActionEntries(state, "player", stats);
  assert.equal(entries.some((entry) => entry.action.type === "SUMMON_MONSTER"), false);
  const report = finalizeBalanceReport(stats);
  assert.equal(report.diagnostics.actionRejected.byReason["monster zone is full"] || 0, 0);
});

test("simulator creates legal tribute summon candidates with material ids", () => {
  const state = simulatorTestState({
    playerCards: [
      runtimeCard("material-1", "spark-runner", "player"),
      runtimeCard("material-2", "lumen-gearlet", "player"),
      runtimeCard("colossus", "starfall-colossus", "player")
    ],
    hand: ["colossus"],
    monsterZone: ["material-1", "material-2"]
  });

  const entries = createSimulatorActionEntries(state, "player");
  const summon = entries.find((entry) => entry.action.type === "SUMMON_MONSTER" && entry.action.cardId === "colossus");

  assert.ok(summon, "simulator should offer a two-tribute summon candidate");
  assert.deepEqual(summon.action.tributeCardIds, ["material-1", "material-2"]);
  assert.doesNotThrow(() => new GameEngine(cloneState(state)).dispatch(summon.action));
});

test("simulator can tribute summon from a full monster zone", () => {
  const field = Array.from({ length: FIELD_SIZE }, (_, index) => `field-${index}`);
  const state = simulatorTestState({
    playerCards: [
      ...field.map((id) => runtimeCard(id, "solar-knight", "player")),
      runtimeCard("colossus", "starfall-colossus", "player")
    ],
    hand: ["colossus"],
    monsterZone: field
  });

  const entries = createSimulatorActionEntries(state, "player");
  const summon = entries.find((entry) => entry.action.type === "SUMMON_MONSTER" && entry.action.cardId === "colossus");

  assert.ok(summon, "full zones should still allow tribute summons that free material slots");
  assert.deepEqual(summon.action.tributeCardIds, ["field-0", "field-1"]);
  assert.doesNotThrow(() => new GameEngine(cloneState(state)).dispatch(summon.action));
});

test("simulator prioritizes field-condition summon when requirements are met", () => {
  const state = simulatorTestState({
    playerCards: [
      runtimeCard("shadow-field", "void-hound", "player"),
      runtimeCard("bulwark", "rift-bulwark", "player"),
      runtimeCard("plain", "solar-knight", "player")
    ],
    hand: ["bulwark", "plain"],
    monsterZone: ["shadow-field"]
  });

  const entries = createSimulatorActionEntries(state, "player");
  const summonWeights = Object.fromEntries(entries
    .filter((entry) => entry.action.type === "SUMMON_MONSTER")
    .map((entry) => [entry.action.cardId, entry.weight]));
  assert.ok(summonWeights.bulwark > summonWeights.plain);
});

test("simulator action entry generation handles empty states", () => {
  assert.deepEqual(createSimulatorActionEntries(null), []);

  const state = simulatorTestState();
  const entries = createSimulatorActionEntries(state, "player");
  assert.ok(entries.some((entry) => entry.action.type === "END_TURN"));
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

function simulatorTestState({
  playerCards = [],
  aiCards = [],
  hand = [],
  monsterZone = [],
  spellTrapZone = [],
  normalSummonsUsed = 0,
  phase = Phase.main
} = {}) {
  const cards = Object.fromEntries([...playerCards, ...aiCards].map((card) => [card.id, card]));
  return {
    cards,
    players: {
      player: testPlayer("player", { hand, monsterZone, spellTrapZone, normalSummonsUsed }),
      ai: testPlayer("ai")
    },
    turn: {
      playerId: "player",
      phase
    },
    machine: {
      phase,
      timing: phase === Phase.battle ? Timing.battleOpen : Timing.mainOpen,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null
    },
    abilities: {
      player: [],
      ai: []
    },
    continuousEffects: [],
    events: [],
    nextEventId: 1,
    gameOver: null
  };
}

function testPlayer(id, overrides = {}) {
  return {
    id,
    lp: MAX_LP,
    shield: 0,
    deck: [],
    hand: [],
    monsterZone: [],
    spellTrapZone: [],
    grave: [],
    banished: [],
    attacksSkipped: false,
    comboThisTurn: false,
    comboFlags: {},
    normalSummonsUsed: 0,
    ...overrides
  };
}

function runtimeCard(id, templateId, ownerId, overrides = {}) {
  const template = library.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Unknown card template ${templateId}`);
  return {
    ...template,
    id,
    uid: id,
    templateId,
    ownerId,
    tempAtk: 0,
    tempDef: 0,
    battleWear: 0,
    mode: template.type === "monster" ? "attack" : undefined,
    used: false,
    changedMode: false,
    ...overrides
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
