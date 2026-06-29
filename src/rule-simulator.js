import {
  Ability,
  GameEngine,
  GameRuleError,
  Phase,
  Timing,
  assertValidGameState,
  getCardEffectDefinition,
  hasAbility
} from "./game-engine.js";
import { deckPresets, library } from "./data.js";
import { FIELD_SIZE, MAX_LP } from "./rules.js";

const PLAYER = "player";
const AI = "ai";
const PLAYER_IDS = Object.freeze([PLAYER, AI]);
const DEFAULT_PRESETS = Object.freeze(["balanced", "aggressive", "control"]);
const COMPLEX_EVENT_TYPES = Object.freeze([
  "ATTACK_DECLARED",
  "ATTACK_TARGET_CHANGED",
  "BATTLE_RESOLVED",
  "DAMAGE_DEALT",
  "CARD_DESTROYED",
  "TRAP_ACTIVATED",
  "CHAIN_RESOLVED"
]);
const EXPANSION_CARD_IDS = Object.freeze([
  "star-soul-apprentice",
  "rift-bulwark",
  "soul-resonance",
  "soul-parry"
]);
const EXPANSION_SUCCESS_EVENT_TYPES = Object.freeze({
  "star-soul-apprentice": new Set(["CARDS_DRAWN"]),
  "rift-bulwark": new Set(["SHIELD_GAINED"]),
  "soul-resonance": new Set(["STAT_MODIFIED"]),
  "soul-parry": new Set(["STAT_MODIFIED", "SHIELD_GAINED"])
});
const ATTACK_RESPONSE_TRIGGERS = new Set(["attackDestroy", "weakenAttack", "redirectAttack", "soulParry"]);

export function simulateRandomDuels({
  games = 10,
  seed = "rule-simulator",
  maxStepsPerGame = 240,
  openingHandSize = 5,
  playerPreset = null,
  aiPreset = null,
  presets = null
} = {}) {
  const rng = createSeededRandom(seed);
  const presetConfig = normalizePresetConfig({ playerPreset, aiPreset, presets });
  const balanceStats = createBalanceStats();
  const summary = {
    seed,
    games,
    presets: presetConfig.report,
    completedGames: 0,
    gameOvers: 0,
    maxStepsReached: 0,
    totalSteps: 0,
    totalEvents: 0,
    actions: {},
    eventTypes: {},
    failures: []
  };

  for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
    try {
      const game = simulateOneRandomDuel({
        gameIndex,
        rng,
        maxStepsPerGame,
        openingHandSize,
        presetConfig,
        balanceStats
      });
      summary.completedGames += 1;
      summary.totalSteps += game.steps;
      summary.totalEvents += game.events;
      if (game.endedBy === "gameOver") summary.gameOvers += 1;
      if (game.endedBy === "stepLimit") summary.maxStepsReached += 1;
      mergeCounts(summary.actions, game.actions);
      mergeCounts(summary.eventTypes, game.eventTypes);
      recordBalanceGameResult(balanceStats, game);
    } catch (error) {
      summary.failures.push(serializeSimulationError(error, gameIndex));
      recordBalanceFailure(balanceStats, error);
    }
  }

  summary.balanceReport = finalizeBalanceReport(balanceStats);
  return summary;
}

export function createBalanceStats() {
  return {
    totalGames: 0,
    completedGames: 0,
    playerWins: 0,
    aiWins: 0,
    noWinnerGames: 0,
    totalTurns: 0,
    totalSpellActivations: 0,
    totalTrapActivations: 0,
    totalAttackDeclarations: 0,
    totalBattleResolutions: 0,
    totalDamageDealt: 0,
    deckOuts: 0,
    deckOutCardsMissing: 0,
    maxStepTruncations: 0,
    gameOverReasons: {},
    abnormalEndReasons: {},
    complexEvents: createComplexEventCounters(),
    attackTargetMismatches: 0,
    expansionCards: createExpansionCardCounters(),
    _attackDeclarations: {}
  };
}

export function recordBalanceEvents(stats, events, { state = null } = {}) {
  if (!stats || !Array.isArray(events)) return stats;
  const cards = state?.cards || {};
  const successfulExpansionCardIds = new Set();

  for (const event of events) {
    if (!event?.type) continue;
    if (Object.hasOwn(stats.complexEvents, event.type)) {
      stats.complexEvents[event.type] += 1;
    }

    if (event.type === "TURN_DRAW_RESOLVED") {
      stats.totalTurns += 1;
    }

    if (event.type === "CARD_ACTIVATED") {
      const templateId = templateIdForCard(cards, event.cardId);
      if (event.cardType === "spell") {
        stats.totalSpellActivations += 1;
        if (stats.expansionCards[templateId]) {
          stats.expansionCards[templateId].activated += 1;
        }
      }
      if (event.cardType === "trap") {
        stats.totalTrapActivations += 1;
        stats.complexEvents.TRAP_ACTIVATED += 1;
        if (stats.expansionCards[templateId]) {
          stats.expansionCards[templateId].activated += 1;
        }
      }
    }

    if (event.type === "MONSTER_SUMMONED") {
      const templateId = templateIdForCard(cards, event.cardId);
      if (stats.expansionCards[templateId]) {
        stats.expansionCards[templateId].summoned += 1;
      }
    }

    if (event.type === "CARDS_DRAWN") {
      for (const cardId of event.cardIds || []) {
        const templateId = templateIdForCard(cards, cardId);
        if (stats.expansionCards[templateId]) {
          stats.expansionCards[templateId].appeared += 1;
        }
      }
    }

    if (event.type === "ATTACK_DECLARED") {
      stats.totalAttackDeclarations += 1;
      stats._attackDeclarations[String(event.id)] = event.targetCardId || null;
    }

    if (event.type === "BATTLE_RESOLVED") {
      stats.totalBattleResolutions += 1;
      const declarationId = event.declarationEventId == null ? null : String(event.declarationEventId);
      if (declarationId && Object.hasOwn(stats._attackDeclarations, declarationId)) {
        const declaredTargetCardId = stats._attackDeclarations[declarationId] || null;
        const finalTargetCardId = event.targetCardId || null;
        if (declaredTargetCardId !== finalTargetCardId) {
          stats.attackTargetMismatches += 1;
        }
        delete stats._attackDeclarations[declarationId];
      }
    }

    if (event.type === "DAMAGE_DEALT") {
      stats.totalDamageDealt += Math.max(0, Number(event.amount) || 0);
    }

    if (event.type === "DRAW_FAILED") {
      stats.deckOuts += 1;
      stats.deckOutCardsMissing += Math.max(0, Number(event.missing) || 0);
    }

    if (event.type === "CHAIN_LINK_RESOLVED" && !event.skipped) {
      const templateId = templateIdForCard(cards, event.cardId);
      if (templateId === "soul-parry") {
        successfulExpansionCardIds.add(event.cardId);
      }
    }

    if (event.sourceCardId) {
      const templateId = templateIdForCard(cards, event.sourceCardId);
      if (EXPANSION_SUCCESS_EVENT_TYPES[templateId]?.has(event.type)) {
        successfulExpansionCardIds.add(event.sourceCardId);
      }
    }
  }

  for (const cardId of successfulExpansionCardIds) {
    const templateId = templateIdForCard(cards, cardId);
    if (stats.expansionCards[templateId]) {
      stats.expansionCards[templateId].resolved += 1;
    }
  }

  return stats;
}

export function recordBalanceGameResult(stats, game = {}) {
  if (!stats) return stats;
  stats.totalGames += 1;
  stats.completedGames += 1;

  if (game.endedBy === "gameOver") {
    const winnerId = game.winnerId || null;
    if (winnerId === PLAYER) stats.playerWins += 1;
    else if (winnerId === AI) stats.aiWins += 1;
    else stats.noWinnerGames += 1;
    incrementCount(stats.gameOverReasons, game.gameOverReason || "unknown");
    return stats;
  }

  stats.noWinnerGames += 1;
  if (game.endedBy === "stepLimit") {
    stats.maxStepTruncations += 1;
    incrementCount(stats.abnormalEndReasons, "stepLimit");
  } else {
    incrementCount(stats.abnormalEndReasons, game.endedBy || "unknown");
  }
  return stats;
}

export function finalizeBalanceReport(stats = createBalanceStats()) {
  const totalGames = Math.max(0, Number(stats.totalGames) || 0);
  const averageDenominator = totalGames || 0;
  const reportExpansionCards = {};
  for (const cardId of EXPANSION_CARD_IDS) {
    const entry = stats.expansionCards?.[cardId] || createExpansionCardCounter(cardId);
    reportExpansionCards[cardId] = {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      appeared: entry.appeared,
      summoned: entry.summoned,
      activated: entry.activated,
      resolved: entry.resolved
    };
  }

  return {
    totalGames,
    completedGames: Math.max(0, Number(stats.completedGames) || 0),
    wins: {
      player: Math.max(0, Number(stats.playerWins) || 0),
      ai: Math.max(0, Number(stats.aiWins) || 0),
      none: Math.max(0, Number(stats.noWinnerGames) || 0)
    },
    winRates: {
      player: ratio(stats.playerWins, totalGames),
      ai: ratio(stats.aiWins, totalGames)
    },
    averages: {
      turns: average(stats.totalTurns, averageDenominator),
      spellsActivated: average(stats.totalSpellActivations, averageDenominator),
      trapsActivated: average(stats.totalTrapActivations, averageDenominator),
      attackDeclarations: average(stats.totalAttackDeclarations, averageDenominator),
      battleResolutions: average(stats.totalBattleResolutions, averageDenominator),
      damageDealt: average(stats.totalDamageDealt, averageDenominator)
    },
    totals: {
      turns: Math.max(0, Number(stats.totalTurns) || 0),
      spellsActivated: Math.max(0, Number(stats.totalSpellActivations) || 0),
      trapsActivated: Math.max(0, Number(stats.totalTrapActivations) || 0),
      attackDeclarations: Math.max(0, Number(stats.totalAttackDeclarations) || 0),
      battleResolutions: Math.max(0, Number(stats.totalBattleResolutions) || 0),
      damageDealt: Math.max(0, Number(stats.totalDamageDealt) || 0),
      deckOuts: Math.max(0, Number(stats.deckOuts) || 0),
      deckOutCardsMissing: Math.max(0, Number(stats.deckOutCardsMissing) || 0),
      maxStepTruncations: Math.max(0, Number(stats.maxStepTruncations) || 0)
    },
    deckOuts: Math.max(0, Number(stats.deckOuts) || 0),
    maxStepTruncations: Math.max(0, Number(stats.maxStepTruncations) || 0),
    gameOverReasons: sortCounts(stats.gameOverReasons),
    abnormalEndReasons: sortCounts(stats.abnormalEndReasons),
    expansion01: reportExpansionCards,
    complexBattleEvents: {
      ...createComplexEventCounters(stats.complexEvents),
      attackDeclaredTargetFinalDefenderMismatches: Math.max(0, Number(stats.attackTargetMismatches) || 0)
    }
  };
}

export function simulateChainTrapScenario() {
  const state = createChainTrapScenarioState();
  const engine = new GameEngine(state);
  const trace = [];
  const actionCounts = {};
  const eventCounts = {};
  const context = { pendingBattle: null };
  let totalEvents = 0;

  try {
    const scriptedActions = [
      {
        type: "DECLARE_ATTACK",
        playerId: AI,
        rivalId: PLAYER,
        attackerCardId: "scenario-ai-lancer",
        targetCardId: "scenario-player-guardian"
      },
      {
        type: "ADD_CHAIN_LINK",
        playerId: PLAYER,
        cardId: "scenario-player-weaken",
        effectId: "weakenAttack"
      },
      {
        type: "ACTIVATE_TRAP",
        playerId: PLAYER,
        rivalId: AI,
        cardId: "scenario-player-weaken",
        attackerCardId: "scenario-ai-lancer"
      },
      {
        type: "PASS_RESPONSE_PRIORITY",
        playerId: PLAYER,
        nextPlayerId: AI
      },
      {
        type: "ADD_CHAIN_LINK",
        playerId: AI,
        cardId: "scenario-ai-nullifier",
        effectId: "chainNegate",
        targetEffectId: "scenario-player-weaken"
      },
      {
        type: "ACTIVATE_TRAP",
        playerId: AI,
        rivalId: PLAYER,
        cardId: "scenario-ai-nullifier",
        targetEffectId: "scenario-player-weaken"
      },
      {
        type: "RESOLVE_CHAIN",
        playerId: AI
      }
    ];

    for (const action of scriptedActions) {
      totalEvents += dispatchSimulatedAction(engine, action, { trace, actionCounts, eventCounts, context }).length;
    }

    const battleAction = resolvePendingBattleAction(engine.getState(), context);
    if (!battleAction) throw simulationError("Chain scenario could not resume battle after chain resolution", { trace, state: snapshotState(engine.getState()) });
    totalEvents += dispatchSimulatedAction(engine, battleAction, { trace, actionCounts, eventCounts, context }).length;

    return {
      scenario: "chain-trap",
      totalEvents,
      actions: actionCounts,
      eventTypes: eventCounts,
      finalState: snapshotState(engine.getState()),
      failures: []
    };
  } catch (error) {
    return {
      scenario: "chain-trap",
      totalEvents,
      actions: actionCounts,
      eventTypes: eventCounts,
      finalState: snapshotState(engine.getState()),
      failures: [serializeSimulationError(error, 0)]
    };
  }
}

function simulateOneRandomDuel({ gameIndex, rng, maxStepsPerGame, openingHandSize, presetConfig, balanceStats }) {
  const state = createRandomDuelState({ gameIndex, rng, presetConfig });
  const engine = new GameEngine(state);
  const trace = [];
  const actionCounts = {};
  const eventCounts = {};
  const context = { pendingBattle: null };
  let steps = 0;
  let eventCount = 0;

  for (const playerId of PLAYER_IDS) {
    const events = dispatchSimulatedAction(engine, {
      type: "DRAW_CARDS",
      playerId,
      count: openingHandSize,
      reason: "opening"
    }, { trace, actionCounts, eventCounts, context, balanceStats });
    eventCount += events.length;
  }

  while (steps < maxStepsPerGame) {
    const current = engine.getState();
    assertValidGameState(current);
    if (current.gameOver) {
      return {
        endedBy: "gameOver",
        winnerId: current.gameOver.winnerId || null,
        gameOverReason: current.gameOver.reason || null,
        steps,
        events: eventCount,
        actions: actionCounts,
        eventTypes: eventCounts,
        presets: state.presets || null
      };
    }

    const action = chooseNextAction(current, rng, context);
    if (!action) {
      throw simulationError("No legal simulator action was available", {
        state: snapshotState(current),
        trace
      });
    }

    const events = dispatchSimulatedAction(engine, action, { trace, actionCounts, eventCounts, context, balanceStats });
    eventCount += events.length;
    steps += 1;
  }

  const finalState = engine.getState();
  return {
    endedBy: finalState.gameOver ? "gameOver" : "stepLimit",
    winnerId: finalState.gameOver?.winnerId || null,
    gameOverReason: finalState.gameOver?.reason || null,
    steps,
    events: eventCount,
    actions: actionCounts,
    eventTypes: eventCounts,
    presets: state.presets || null
  };
}

function dispatchSimulatedAction(engine, action, { trace, actionCounts, eventCounts, context, balanceStats = null }) {
  try {
    const events = engine.dispatch(action);
    const state = engine.getState();
    assertValidGameState(state);
    assertEventLogShape(events, action);
    assertBattleEventsHaveResolutionImpact(events, action);
    actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
    for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    }
    recordBalanceEvents(balanceStats, events, { state });
    updateSimulationContext(context, events, action);
    trace.push({
      action: clone(action),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        playerId: event.playerId || null,
        cardId: event.cardId || event.attackerCardId || null
      })),
      state: snapshotState(state)
    });
    if (trace.length > 24) trace.shift();
    return events;
  } catch (error) {
    throw simulationError(`Dispatch failed for ${action.type}: ${error.message}`, {
      cause: error,
      action,
      trace,
      state: snapshotState(engine.getState())
    });
  }
}

function chooseNextAction(state, rng, context) {
  const playerId = state.turn.playerId;
  if (state.machine.responseWindow) {
    return responseWindowAction(state, rng, context);
  }
  if (context?.pendingBattle) {
    const pendingAction = resolvePendingBattleAction(state, context);
    if (pendingAction) return pendingAction;
    context.pendingBattle = null;
    return chooseNextAction(state, rng, context);
  }
  if (state.turn.phase === Phase.draw) {
    return { type: "RESOLVE_TURN_DRAW", playerId, count: 1 };
  }
  if (state.turn.phase === Phase.end) {
    return { type: "START_TURN", playerId: otherPlayerId(playerId) };
  }
  if (state.turn.phase === Phase.main) {
    return chooseWeightedAction(mainPhaseActions(state, playerId), rng);
  }
  if (state.turn.phase === Phase.battle) {
    return chooseWeightedAction(battlePhaseActions(state, playerId), rng);
  }
  return { type: "CHANGE_PHASE", playerId, phase: Phase.draw };
}

function mainPhaseActions(state, playerId) {
  const actions = [
    ...summonActions(state, playerId).map((action) => ({ weight: 32, action })),
    ...spellActions(state, playerId).map((action) => ({ weight: 24, action })),
    ...setTrapActions(state, playerId).map((action) => ({ weight: 14, action })),
    ...modeActions(state, playerId).map((action) => ({ weight: 4, action }))
  ];
  if (battleActionsAvailable(state, playerId)) {
    actions.push({ weight: 24, action: { type: "CHANGE_PHASE", playerId, phase: Phase.battle } });
  }
  actions.push({ weight: actions.length > 0 ? 3 : 50, action: { type: "END_TURN", playerId, nextPlayerId: otherPlayerId(playerId), reason: "sim-main" } });
  return actions;
}

function battlePhaseActions(state, playerId) {
  const attackActions = declareAttackActions(state, playerId);
  const actions = [
    ...attackActions.map((action) => ({ weight: 45, action })),
    ...spellActions(state, playerId).map((action) => ({ weight: 12, action })),
    ...setTrapActions(state, playerId).map((action) => ({ weight: 8, action }))
  ];
  const skip = skipAttackAction(state, playerId);
  if (skip) actions.push({ weight: 7, action: skip });
  actions.push({ weight: attackActions.length > 0 ? 3 : 45, action: { type: "END_TURN", playerId, nextPlayerId: otherPlayerId(playerId), reason: "sim-battle" } });
  return actions;
}

function summonActions(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.monsterZone.length >= FIELD_SIZE) return [];
  if (player.normalSummonsUsed >= 1 && !hasAbility(state, playerId, Ability.extraSummon)) return [];
  return player.hand
    .filter((cardId) => state.cards[cardId]?.type === "monster")
    .map((cardId) => ({ type: "SUMMON_MONSTER", playerId, cardId, index: player.monsterZone.length }))
    .filter((action) => canDispatch(state, action));
}

function spellActions(state, playerId) {
  const player = state.players[playerId];
  if (!player) return [];
  const rivalId = otherPlayerId(playerId);
  const actions = [];
  for (const cardId of player.hand) {
    const card = state.cards[cardId];
    if (card?.type !== "spell") continue;
    const definition = getCardEffectDefinition(card.effect);
    if (!definition) continue;
    const targets = spellTargetCandidates(state, playerId, rivalId, card, definition);
    for (const targetCardId of targets) {
      const action = {
        type: "ACTIVATE_CARD",
        playerId,
        rivalId,
        cardId
      };
      if (targetCardId) action.targetCardId = targetCardId;
      if (definition.duration === "continuous") action.index = player.spellTrapZone.length;
      if (canDispatch(state, action)) actions.push(action);
    }
  }
  return actions;
}

function spellTargetCandidates(state, playerId, rivalId, card, definition) {
  if (!definition.target) return [null];
  const targetPlayerId = definition.target.player === "rival" ? rivalId : playerId;
  const zone = definition.target.zone;
  const targetPlayer = state.players[targetPlayerId];
  const zoneIds = Array.isArray(targetPlayer?.[zone]) ? targetPlayer[zone] : [];
  let candidates = zoneIds.filter((cardId) => Boolean(state.cards[cardId]));
  if (definition.target.rule === "notSource") {
    candidates = candidates.filter((cardId) => cardId !== card.id);
  }
  if (definition.target.rule === "strongestAtk") {
    const maxAtk = Math.max(...candidates.map((cardId) => totalAtk(state.cards[cardId])));
    candidates = candidates.filter((cardId) => totalAtk(state.cards[cardId]) === maxAtk);
  }
  return candidates.length > 0 ? candidates : [];
}

function setTrapActions(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.spellTrapZone.length >= FIELD_SIZE) return [];
  return player.hand
    .filter((cardId) => state.cards[cardId]?.type === "trap")
    .map((cardId) => ({ type: "SET_TRAP", playerId, cardId, index: player.spellTrapZone.length }))
    .filter((action) => canDispatch(state, action));
}

function modeActions(state, playerId) {
  const player = state.players[playerId];
  if (!player) return [];
  return player.monsterZone
    .map((cardId) => state.cards[cardId])
    .filter((card) => card?.type === "monster" && !card.used && !card.changedMode)
    .map((card) => ({
      type: "CHANGE_MONSTER_MODE",
      playerId,
      cardId: card.id,
      mode: card.mode === "defense" ? "attack" : "defense"
    }))
    .filter((action) => canDispatch(state, action));
}

function declareAttackActions(state, playerId) {
  const player = state.players[playerId];
  const rivalId = otherPlayerId(playerId);
  const rival = state.players[rivalId];
  if (!player || !rival || player.attacksSkipped || hasAbility(state, playerId, Ability.skipAttackLock)) return [];
  const actions = [];
  for (const attackerId of player.monsterZone) {
    const attacker = state.cards[attackerId];
    if (!attacker || attacker.type !== "monster" || attacker.used || attacker.mode === "defense") continue;
    if (rival.monsterZone.length > 0) {
      for (const targetCardId of rival.monsterZone) {
        actions.push({ type: "DECLARE_ATTACK", playerId, rivalId, attackerCardId: attackerId, targetCardId });
      }
      if (attacker.canDirectAttack || hasAbility(state, playerId, Ability.directAttack)) {
        actions.push({ type: "DECLARE_ATTACK", playerId, rivalId, attackerCardId: attackerId });
      }
    } else {
      actions.push({ type: "DECLARE_ATTACK", playerId, rivalId, attackerCardId: attackerId });
    }
  }
  return actions.filter((action) => canDispatch(state, action));
}

function resolvePendingBattleAction(state, context) {
  const pending = context.pendingBattle;
  if (!pending || state.turn.phase !== Phase.battle || state.turn.playerId !== pending.playerId) return null;
  const player = state.players[pending.playerId];
  const rival = state.players[pending.rivalId];
  if (!player?.monsterZone.includes(pending.attackerCardId)) return null;
  const attacker = state.cards[pending.attackerCardId];
  if (!attacker || attacker.used || attacker.mode === "defense") return null;
  const action = {
    type: "RESOLVE_BATTLE",
    playerId: pending.playerId,
    rivalId: pending.rivalId,
    attackerCardId: pending.attackerCardId,
    declarationEventId: pending.declarationEventId || null
  };
  if (pending.targetCardId && rival?.monsterZone.includes(pending.targetCardId)) {
    action.targetCardId = pending.targetCardId;
  }
  return canDispatch(state, action) ? action : null;
}

function responseWindowAction(state, rng, context) {
  const window = state.machine.responseWindow;
  const playerId = window.playerId;
  const chain = state.machine.chain || [];
  const lastLink = chain.at(-1);
  if (lastLink && !lastLink.committed) {
    return activateQueuedTrapAction(state, lastLink, context);
  }

  if (chain.length > 0) {
    const firstLink = chain[0];
    const chainNegate = chain.length === 1 ? chainNegateTrap(state, playerId, firstLink.cardId) : null;
    if (chainNegate && !chain.some((link) => link.cardId === chainNegate.id)) {
      return {
        type: "ADD_CHAIN_LINK",
        playerId,
        cardId: chainNegate.id,
        effectId: chainNegate.trigger,
        targetEffectId: firstLink.cardId
      };
    }
    const nextPlayerId = otherPlayerId(playerId);
    const nextCanNegate = chain.length === 1 && chainNegateTrap(state, nextPlayerId, firstLink.cardId);
    if (nextCanNegate && rng() < 0.65) {
      return { type: "PASS_RESPONSE_PRIORITY", playerId, nextPlayerId };
    }
    return { type: "RESOLVE_CHAIN", playerId };
  }

  const trapAction = chooseWeightedAction(attackResponseTrapActions(state, playerId, window.context || {})
    .map((action) => ({ weight: 1, action })), rng);
  if (trapAction && rng() < 0.8) {
    return trapAction;
  }
  return { type: "CLOSE_RESPONSE_WINDOW", playerId, reason: "sim-pass" };
}

function activateQueuedTrapAction(state, link, context) {
  const card = state.cards[link.cardId];
  const action = {
    type: "ACTIVATE_TRAP",
    playerId: link.playerId,
    rivalId: otherPlayerId(link.playerId),
    cardId: link.cardId
  };
  if (card?.trigger === "weakenAttack") {
    action.attackerCardId = context?.pendingBattle?.attackerCardId ||
      state.machine.responseWindow?.context?.attackerCardId;
  }
  if (card?.trigger === "soulParry" || card?.trigger === "attackDestroy" || card?.trigger === "redirectAttack") {
    action.attackerCardId = context?.pendingBattle?.attackerCardId ||
      state.machine.responseWindow?.context?.attackerCardId;
  }
  if (card?.trigger === "redirectAttack") {
    const targetCardId = redirectAttackTargetCandidate(state, link.playerId, context?.pendingBattle || state.machine.responseWindow?.context || {});
    if (targetCardId) action.targetCardId = targetCardId;
  }
  if (card?.trigger === "chainNegate") {
    action.targetEffectId = link.targetEffectId;
  }
  if (link.targetEffectId && !action.targetEffectId) {
    action.targetEffectId = link.targetEffectId;
  }
  return action;
}

function attackResponseTrapActions(state, playerId, responseContext) {
  if (responseContext.direct) return [];
  const player = state.players[playerId];
  if (!player) return [];
  return player.spellTrapZone
    .map((cardId) => state.cards[cardId])
    .filter((card) => card?.type === "trap" && ATTACK_RESPONSE_TRIGGERS.has(card.trigger))
    .filter((card) => card.trigger !== "redirectAttack" || redirectAttackTargetCandidate(state, playerId, responseContext))
    .map((card) => ({
      type: "ADD_CHAIN_LINK",
      playerId,
      cardId: card.id,
      effectId: card.trigger,
      targetEffectId: state.machine.responseWindow?.triggerEventId || null
    }))
    .filter((action) => canDispatch(state, action));
}

function chainNegateTrap(state, playerId, targetEffectId) {
  if (!targetEffectId) return null;
  const player = state.players[playerId];
  const trapId = player?.spellTrapZone.find((cardId) => state.cards[cardId]?.trigger === "chainNegate");
  if (!trapId) return null;
  const action = {
    type: "ADD_CHAIN_LINK",
    playerId,
    cardId: trapId,
    effectId: state.cards[trapId].trigger,
    targetEffectId
  };
  return canDispatch(state, action) ? state.cards[trapId] : null;
}

function skipAttackAction(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.attacksSkipped || hasAbility(state, playerId, Ability.skipAttackLock)) return null;
  const hasRemainingAttack = player.monsterZone.some((cardId) => {
    const card = state.cards[cardId];
    return card?.type === "monster" && card.mode !== "defense" && !card.used;
  });
  const action = { type: "SKIP_REMAINING_ATTACKS", playerId };
  return hasRemainingAttack && canDispatch(state, action) ? action : null;
}

function battleActionsAvailable(state, playerId) {
  const battleState = {
    ...state,
    turn: { ...state.turn, phase: Phase.battle },
    machine: { ...state.machine, phase: Phase.battle }
  };
  return declareAttackActions(battleState, playerId).length > 0 ||
    spellActions(battleState, playerId).length > 0 ||
    setTrapActions(battleState, playerId).length > 0;
}

function updateSimulationContext(context, events, action) {
  if (!context) return;
  const declared = events.find((event) => event.type === "ATTACK_DECLARED");
  if (declared) {
    context.pendingBattle = {
      playerId: declared.playerId,
      rivalId: declared.rivalId,
      attackerCardId: declared.attackerCardId,
      targetCardId: declared.targetCardId || null,
      direct: Boolean(declared.direct),
      declarationEventId: declared.id
    };
  }
  const redirected = events.find((event) => event.type === "ATTACK_TARGET_CHANGED");
  if (redirected && context.pendingBattle) {
    if (!redirected.declarationEventId || String(redirected.declarationEventId) === String(context.pendingBattle.declarationEventId)) {
      context.pendingBattle.targetCardId = redirected.toTargetCardId || redirected.targetCardId || null;
      context.pendingBattle.direct = false;
    }
  }
  if (events.some((event) => event.type === "BATTLE_RESOLVED" || event.type === "ATTACK_CANCELED" || event.type === "TURN_ENDED" || event.type === "TURN_STARTED")) {
    context.pendingBattle = null;
  }
  if (action.type === "SKIP_REMAINING_ATTACKS") {
    context.pendingBattle = null;
  }
}

function canDispatch(state, action) {
  try {
    new GameEngine(state).dispatch(action);
    return true;
  } catch (error) {
    if (error instanceof GameRuleError) return false;
    throw error;
  }
}

function chooseWeightedAction(entries, rng) {
  const candidates = entries.filter((entry) => entry?.action && entry.weight > 0);
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = rng() * total;
  for (const entry of candidates) {
    pick -= entry.weight;
    if (pick <= 0) return entry.action;
  }
  return candidates.at(-1).action;
}

function createRandomDuelState({ gameIndex, rng, presetConfig = normalizePresetConfig() }) {
  const playerPreset = presetForGame(presetConfig, "player", gameIndex);
  const aiPreset = presetForGame(presetConfig, "ai", gameIndex);
  const cards = {};
  const playerDeck = createDeckCards({ ownerId: PLAYER, presetId: playerPreset, prefix: `g${gameIndex}-p`, rng, cards });
  const aiDeck = createDeckCards({ ownerId: AI, presetId: aiPreset, prefix: `g${gameIndex}-a`, rng, cards });
  return {
    presets: {
      player: playerPreset,
      ai: aiPreset
    },
    cards,
    players: {
      [PLAYER]: basePlayer(PLAYER, playerDeck),
      [AI]: basePlayer(AI, aiDeck)
    },
    turn: {
      playerId: PLAYER,
      phase: Phase.draw
    },
    machine: {
      phase: Phase.draw,
      timing: "draw",
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null
    },
    abilities: {
      [PLAYER]: [],
      [AI]: []
    },
    continuousEffects: [],
    events: [],
    nextEventId: 1,
    gameOver: null
  };
}

function createChainTrapScenarioState() {
  const cards = Object.fromEntries([
    scenarioCard("scenario-player-guardian", "iron-guardian", PLAYER, { mode: "attack" }),
    scenarioCard("scenario-player-weaken", "weakening-web", PLAYER),
    scenarioCard("scenario-ai-lancer", "star-lancer", AI, { mode: "attack" }),
    scenarioCard("scenario-ai-nullifier", "chain-nullifier", AI)
  ].map((card) => [card.id, card]));
  return {
    cards,
    players: {
      [PLAYER]: {
        ...basePlayer(PLAYER, []),
        monsterZone: ["scenario-player-guardian"],
        spellTrapZone: ["scenario-player-weaken"]
      },
      [AI]: {
        ...basePlayer(AI, []),
        monsterZone: ["scenario-ai-lancer"],
        spellTrapZone: ["scenario-ai-nullifier"]
      }
    },
    turn: {
      playerId: AI,
      phase: Phase.battle
    },
    machine: {
      phase: Phase.battle,
      timing: Timing.battleOpen,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null
    },
    abilities: {
      [PLAYER]: [],
      [AI]: []
    },
    continuousEffects: [],
    events: [],
    nextEventId: 1,
    gameOver: null
  };
}

function scenarioCard(id, templateId, ownerId, overrides = {}) {
  const template = cardTemplate(templateId);
  return {
    ...clone(template),
    id,
    uid: id,
    templateId,
    ownerId,
    tempAtk: 0,
    tempDef: 0,
    battleWear: 0,
    used: false,
    changedMode: false,
    ...overrides
  };
}

function basePlayer(id, deck) {
  return {
    id,
    lp: MAX_LP,
    shield: 0,
    deck,
    hand: [],
    monsterZone: [],
    spellTrapZone: [],
    grave: [],
    banished: [],
    attacksSkipped: false,
    comboThisTurn: false,
    comboFlags: {},
    normalSummonsUsed: 0
  };
}

function createDeckCards({ ownerId, presetId, prefix, rng, cards }) {
  const ids = deckPresets[presetId]?.ids || deckPresets.balanced.ids;
  const deck = ids.map((templateId, index) => {
    const template = cardTemplate(templateId);
    const id = `${prefix}-${index}-${templateId}`;
    cards[id] = {
      ...clone(template),
      id,
      uid: id,
      templateId,
      ownerId,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      mode: template.type === "monster" ? "attack" : undefined,
      used: false,
      changedMode: false
    };
    return id;
  });
  return shuffle(deck, rng);
}

function cardTemplate(templateId) {
  const found = library.find((entry) => entry.id === templateId);
  if (!found) throw new Error(`Unknown card template ${templateId}`);
  return found;
}

function assertEventLogShape(events, action) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`${action.type} produced no events`);
  }
  if (!events.some((event) => event.type === "COMMAND_DISPATCHED" && event.commandType === action.type)) {
    throw new Error(`${action.type} did not emit COMMAND_DISPATCHED`);
  }
  for (let index = 1; index < events.length; index += 1) {
    if (Number(events[index].id) <= Number(events[index - 1].id)) {
      throw new Error(`${action.type} emitted non-increasing event ids`);
    }
  }
}

function assertBattleEventsHaveResolutionImpact(events, action) {
  for (const event of events) {
    if (event.type !== "BATTLE_RESOLVED") continue;
    const used = events.some((candidate) =>
      candidate.type === "MONSTER_USED" &&
      candidate.cardId === event.attackerCardId
    );
    if (!used) {
      throw new Error(`${action.type} resolved battle without consuming attacker ${event.attackerCardId}`);
    }
    const outcome = event.outcome || {};
    const hasResolution = (
      Number(outcome.rawDamage) > 0 ||
      Number(outcome.wear) > 0 ||
      outcome.destroysAttacker ||
      outcome.destroysTarget ||
      outcome.kind === "guardHold"
    );
    if (!hasResolution) {
      throw new Error(`${action.type} battle had no explicit impact: ${JSON.stringify(outcome)}`);
    }
  }
}

function snapshotState(state) {
  return {
    turn: clone(state.turn),
    phase: state.turn?.phase,
    gameOver: state.gameOver ? clone(state.gameOver) : null,
    players: Object.fromEntries(PLAYER_IDS.map((playerId) => {
      const player = state.players[playerId];
      return [playerId, {
        lp: player.lp,
        shield: player.shield || 0,
        deck: player.deck.length,
        hand: player.hand.length,
        monsterZone: player.monsterZone.slice(),
        spellTrapZone: player.spellTrapZone.slice(),
        grave: player.grave.length,
        banished: player.banished.length,
        normalSummonsUsed: player.normalSummonsUsed,
        attacksSkipped: player.attacksSkipped
      }];
    }))
  };
}

function serializeSimulationError(error, gameIndex) {
  return {
    gameIndex,
    message: error.message,
    action: error.details?.action || null,
    state: error.details?.state || null,
    trace: error.details?.trace || []
  };
}

function recordBalanceFailure(stats, error) {
  if (!stats) return stats;
  stats.totalGames += 1;
  incrementCount(stats.abnormalEndReasons, `failure:${error.name || "Error"}`);
  return stats;
}

function simulationError(message, details = {}) {
  const error = new Error(message);
  error.name = "RuleSimulationError";
  error.details = details;
  if (details.cause) error.cause = details.cause;
  return error;
}

function normalizePresetConfig({ playerPreset = null, aiPreset = null, presets = null } = {}) {
  const rotation = normalizePresetList(presets);
  const fixedPlayerPreset = normalizePresetId(playerPreset);
  const fixedAiPreset = normalizePresetId(aiPreset);
  return {
    playerPreset: fixedPlayerPreset,
    aiPreset: fixedAiPreset,
    rotation,
    report: {
      player: fixedPlayerPreset || "rotation",
      ai: fixedAiPreset || "rotation",
      rotation
    }
  };
}

function normalizePresetList(presets) {
  const rawList = Array.isArray(presets)
    ? presets
    : typeof presets === "string"
      ? presets.split(",")
      : DEFAULT_PRESETS;
  const normalized = rawList.map(normalizePresetId).filter(Boolean);
  return normalized.length > 0 ? normalized : DEFAULT_PRESETS.slice();
}

function normalizePresetId(presetId) {
  const text = String(presetId || "").trim();
  return deckPresets[text] ? text : null;
}

function presetForGame(config, playerId, gameIndex) {
  if (playerId === PLAYER && config?.playerPreset) return config.playerPreset;
  if (playerId === AI && config?.aiPreset) return config.aiPreset;
  const rotation = config?.rotation?.length ? config.rotation : DEFAULT_PRESETS;
  const offset = playerId === AI ? 1 : 0;
  return rotation[(gameIndex + offset) % rotation.length] || DEFAULT_PRESETS[0];
}

function createComplexEventCounters(source = {}) {
  return Object.fromEntries(COMPLEX_EVENT_TYPES.map((type) => [type, Math.max(0, Number(source[type]) || 0)]));
}

function createExpansionCardCounters() {
  return Object.fromEntries(EXPANSION_CARD_IDS.map((cardId) => [cardId, createExpansionCardCounter(cardId)]));
}

function createExpansionCardCounter(cardId) {
  const template = library.find((entry) => entry.id === cardId) || { id: cardId, type: "unknown", name: cardId };
  return {
    id: cardId,
    name: template.name || cardId,
    type: template.type || "unknown",
    appeared: 0,
    summoned: 0,
    activated: 0,
    resolved: 0
  };
}

function templateIdForCard(cards, cardId) {
  if (!cardId) return null;
  const card = cards?.[cardId];
  return card?.templateId || card?.template || card?.id || cardId;
}

function redirectAttackTargetCandidate(state, playerId, responseContext = {}) {
  const player = state.players[playerId];
  const currentTargetCardId = responseContext.targetCardId || responseContext.toTargetCardId || null;
  if (!player) return null;
  const candidates = player.monsterZone
    .filter((cardId) => cardId !== currentTargetCardId)
    .map((cardId, index) => ({ cardId, index, card: state.cards[cardId] }))
    .filter((entry) => entry.card?.type === "monster")
    .sort((a, b) => totalDef(b.card) - totalDef(a.card) || totalAtk(b.card) - totalAtk(a.card) || a.index - b.index);
  return candidates[0]?.cardId || null;
}

function incrementCount(target, key, amount = 1) {
  const normalizedKey = key || "unknown";
  target[normalizedKey] = (target[normalizedKey] || 0) + amount;
}

function sortCounts(counts = {}) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, value]) => Number(value) > 0)
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => Number(rightValue) - Number(leftValue) || leftKey.localeCompare(rightKey))
  );
}

function average(value, denominator) {
  if (!denominator) return 0;
  return round2((Number(value) || 0) / denominator);
}

function ratio(value, denominator) {
  if (!denominator) return 0;
  return round2((Number(value) || 0) / denominator);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function otherPlayerId(playerId) {
  return playerId === PLAYER ? AI : PLAYER;
}

function totalAtk(card) {
  return Math.max(0, (Number(card?.atk) || 0) + (Number(card?.tempAtk) || 0));
}

function totalDef(card) {
  return Math.max(0, (Number(card?.def) || 0) + (Number(card?.tempDef) || 0));
}

function shuffle(items, rng) {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function createSeededRandom(seed) {
  let state = 2166136261;
  const text = String(seed);
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
