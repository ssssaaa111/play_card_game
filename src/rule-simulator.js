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

export function simulateRandomDuels({
  games = 10,
  seed = "rule-simulator",
  maxStepsPerGame = 240,
  openingHandSize = 5
} = {}) {
  const rng = createSeededRandom(seed);
  const summary = {
    seed,
    games,
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
        openingHandSize
      });
      summary.completedGames += 1;
      summary.totalSteps += game.steps;
      summary.totalEvents += game.events;
      if (game.endedBy === "gameOver") summary.gameOvers += 1;
      if (game.endedBy === "stepLimit") summary.maxStepsReached += 1;
      mergeCounts(summary.actions, game.actions);
      mergeCounts(summary.eventTypes, game.eventTypes);
    } catch (error) {
      summary.failures.push(serializeSimulationError(error, gameIndex));
    }
  }

  return summary;
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

function simulateOneRandomDuel({ gameIndex, rng, maxStepsPerGame, openingHandSize }) {
  const state = createRandomDuelState({ gameIndex, rng });
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
    }, { trace, actionCounts, eventCounts, context });
    eventCount += events.length;
  }

  while (steps < maxStepsPerGame) {
    const current = engine.getState();
    assertValidGameState(current);
    if (current.gameOver) {
      return {
        endedBy: "gameOver",
        steps,
        events: eventCount,
        actions: actionCounts,
        eventTypes: eventCounts
      };
    }

    const action = chooseNextAction(current, rng, context);
    if (!action) {
      throw simulationError("No legal simulator action was available", {
        state: snapshotState(current),
        trace
      });
    }

    const events = dispatchSimulatedAction(engine, action, { trace, actionCounts, eventCounts, context });
    eventCount += events.length;
    steps += 1;
  }

  return {
    endedBy: engine.getState().gameOver ? "gameOver" : "stepLimit",
    steps,
    events: eventCount,
    actions: actionCounts,
    eventTypes: eventCounts
  };
}

function dispatchSimulatedAction(engine, action, { trace, actionCounts, eventCounts, context }) {
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

  const trap = attackResponseTrap(state, playerId, window.context || {});
  if (trap && rng() < 0.8) {
    return {
      type: "ADD_CHAIN_LINK",
      playerId,
      cardId: trap.id,
      effectId: trap.trigger
    };
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
  if (card?.trigger === "chainNegate") {
    action.targetEffectId = link.targetEffectId;
  }
  return action;
}

function attackResponseTrap(state, playerId, responseContext) {
  if (responseContext.direct) return null;
  const player = state.players[playerId];
  const trapId = player?.spellTrapZone.find((cardId) => state.cards[cardId]?.trigger === "weakenAttack");
  if (!trapId) return null;
  const action = {
    type: "ADD_CHAIN_LINK",
    playerId,
    cardId: trapId,
    effectId: state.cards[trapId].trigger
  };
  return canDispatch(state, action) ? state.cards[trapId] : null;
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
  if (events.some((event) => event.type === "BATTLE_RESOLVED" || event.type === "TURN_ENDED" || event.type === "TURN_STARTED")) {
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

function createRandomDuelState({ gameIndex, rng }) {
  const playerPreset = DEFAULT_PRESETS[gameIndex % DEFAULT_PRESETS.length];
  const aiPreset = DEFAULT_PRESETS[(gameIndex + 1) % DEFAULT_PRESETS.length];
  const cards = {};
  const playerDeck = createDeckCards({ ownerId: PLAYER, presetId: playerPreset, prefix: `g${gameIndex}-p`, rng, cards });
  const aiDeck = createDeckCards({ ownerId: AI, presetId: aiPreset, prefix: `g${gameIndex}-a`, rng, cards });
  return {
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

function simulationError(message, details = {}) {
  const error = new Error(message);
  error.name = "RuleSimulationError";
  error.details = details;
  if (details.cause) error.cause = details.cause;
  return error;
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
