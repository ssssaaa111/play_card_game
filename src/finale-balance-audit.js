import { deckPresets, library, scenarioSetups } from "./data.js";
import {
  GameEngine,
  Phase,
  Timing,
  assertValidGameState
} from "./game-engine.js";
import { STARTING_LP } from "./rules.js";

const PLAYER = "player";
const AI = "ai";
const FINALE_SCENARIO_ID = "protagonistTrioOmegaFull";
const FINALE_AI_PRESET_ID = "trioOmegaRivalFull";
const TRIO_GOD_IDS = Object.freeze([
  "trio-sun-judicator",
  "trio-moon-warden",
  "trio-star-herald"
]);
const TRIO_GOD_ID_SET = new Set(TRIO_GOD_IDS);
const PRESSURE_SUPPORT_IDS = new Set([
  "trio-moon-dominion",
  "mirror-snare",
  "chain-nullifier",
  "void-lock"
]);
const DEFAULT_DRAW_CHECKPOINTS = Object.freeze([5, 6, 8, 10, 12]);

export function summarizeFinalePressureSamples(samples = []) {
  const normalizedSamples = Array.isArray(samples) ? samples.filter(Boolean) : [];
  const totals = {
    deploymentProbes: normalizedSamples.length,
    fullTrioEstablished: 0,
    trackedGods: 0,
    destroyedGods: 0,
    ongoingAtAuditEnd: 0,
    observedTurns: 0,
    declaredAttacks: 0,
    resolvedAttacks: 0,
    effectiveAttacks: 0,
    trapResponses: 0,
    trapRemovals: 0,
    afterAttackEffectsResolved: 0,
    afterAttackDamageEvents: 0,
    afterAttackDamage: 0
  };

  for (const sample of normalizedSamples) {
    const cards = sample.cards || {};
    const events = Array.isArray(sample.events) ? sample.events.filter(Boolean) : [];
    const trackedCardIds = new Set(
      (sample.initialTrioCardIds || []).filter((cardId) => isTrioRuntimeCard(cards, cardId))
    );
    const startTurnByCardId = new Map([...trackedCardIds].map((cardId) => [cardId, 0]));
    const endedCardIds = new Set();
    const destroyedCardIds = new Set();
    let aiTurnsStarted = 0;

    for (const event of events) {
      if (event.type === "TURN_STARTED" && event.playerId === AI) {
        aiTurnsStarted += 1;
      }
      if (event.type === "MONSTER_SUMMONED" && isTrioRuntimeCard(cards, event.cardId, event.templateId)) {
        trackedCardIds.add(event.cardId);
        if (!startTurnByCardId.has(event.cardId)) startTurnByCardId.set(event.cardId, aiTurnsStarted);
      }
      if (trackedCardIds.has(event.cardId) && trioLeavesMonsterZone(event)) {
        if (!endedCardIds.has(event.cardId)) {
          totals.observedTurns += Math.max(0, aiTurnsStarted - (startTurnByCardId.get(event.cardId) || 0));
          endedCardIds.add(event.cardId);
        }
      }
      if (event.type === "CARD_DESTROYED" && trackedCardIds.has(event.cardId) && !destroyedCardIds.has(event.cardId)) {
        totals.destroyedGods += 1;
        destroyedCardIds.add(event.cardId);
      }
    }

    const distinctTemplates = new Set([...trackedCardIds]
      .map((cardId) => cards[cardId]?.templateId)
      .filter((templateId) => TRIO_GOD_ID_SET.has(templateId)));
    if (sample.fullTrioEstablished ?? (distinctTemplates.size === TRIO_GOD_IDS.length)) {
      totals.fullTrioEstablished += 1;
    }

    const finalTrioCardIds = Array.isArray(sample.finalTrioCardIds)
      ? new Set(sample.finalTrioCardIds)
      : null;
    totals.trackedGods += trackedCardIds.size;
    for (const cardId of trackedCardIds) {
      if (endedCardIds.has(cardId)) continue;
      totals.observedTurns += Math.max(0, aiTurnsStarted - (startTurnByCardId.get(cardId) || 0));
      if (!finalTrioCardIds || finalTrioCardIds.has(cardId)) totals.ongoingAtAuditEnd += 1;
    }

    const declarations = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) =>
        event.type === "ATTACK_DECLARED"
        && trackedCardIds.has(event.attackerCardId)
      );
    totals.declaredAttacks += declarations.length;

    declarations.forEach(({ event: declaration, index: startIndex }, declarationIndex) => {
      const nextDeclarationIndex = declarations[declarationIndex + 1]?.index ?? events.length;
      const resolutionIndex = events.findIndex((event, index) =>
        index >= startIndex
        && index < nextDeclarationIndex
        && event.type === "BATTLE_RESOLVED"
        && String(event.declarationEventId) === String(declaration.id)
      );
      const endIndex = resolutionIndex >= 0 ? resolutionIndex + 1 : nextDeclarationIndex;
      const attackEvents = events.slice(startIndex, endIndex);
      const trapCardIds = new Set(attackEvents
        .filter((event) =>
          event.type === "TRAP_ACTIVATED"
          || (event.type === "CARD_ACTIVATED" && event.cardType === "trap")
        )
        .map((event) => event.cardId)
        .filter(Boolean));

      if (resolutionIndex >= 0) {
        totals.resolvedAttacks += 1;
        if (attackHasPressureImpact(events[resolutionIndex], attackEvents, declaration.attackerCardId)) {
          totals.effectiveAttacks += 1;
        }
      }
      if (trapCardIds.size > 0) {
        totals.trapResponses += 1;
        if (attackEvents.some((event) =>
          event.type === "CARD_DESTROYED"
          && event.cardId === declaration.attackerCardId
          && (!event.sourceCardId || trapCardIds.has(event.sourceCardId))
        )) {
          totals.trapRemovals += 1;
        }
      }
    });

    const countedAfterAttackDamageIds = new Set();
    for (const event of events) {
      if (event.type !== "AFTER_ATTACK_EFFECT_RESOLVED" || !trackedCardIds.has(event.sourceCardId)) continue;
      totals.afterAttackEffectsResolved += 1;
      const resultEventIds = new Set((event.resultEventIds || []).map(String));
      for (const resultEvent of events) {
        if (
          resultEvent.type !== "DAMAGE_DEALT"
          || !resultEventIds.has(String(resultEvent.id))
          || countedAfterAttackDamageIds.has(String(resultEvent.id))
        ) continue;
        countedAfterAttackDamageIds.add(String(resultEvent.id));
        totals.afterAttackDamageEvents += 1;
        totals.afterAttackDamage += Math.max(0, Number(resultEvent.amount) || 0);
      }
    }
  }

  return {
    deployment: {
      probes: totals.deploymentProbes,
      fullTrioEstablished: totals.fullTrioEstablished,
      rate: ratio(totals.fullTrioEstablished, totals.deploymentProbes)
    },
    survival: {
      trackedGods: totals.trackedGods,
      destroyedGods: totals.destroyedGods,
      ongoingAtAuditEnd: totals.ongoingAtAuditEnd,
      observedTurns: totals.observedTurns,
      averageObservedTurns: ratio(totals.observedTurns, totals.trackedGods)
    },
    attacks: {
      declared: totals.declaredAttacks,
      resolved: totals.resolvedAttacks,
      effective: totals.effectiveAttacks,
      effectiveRate: ratio(totals.effectiveAttacks, totals.declaredAttacks)
    },
    trapExchanges: {
      responses: totals.trapResponses,
      trioGodsRemoved: totals.trapRemovals,
      rate: ratio(totals.trapRemovals, totals.trapResponses)
    },
    afterAttackEffects: {
      resolved: totals.afterAttackEffectsResolved,
      damageEvents: totals.afterAttackDamageEvents,
      damage: totals.afterAttackDamage
    }
  };
}

export function analyzeFinaleBalance({
  samples = 1000,
  seed = "finale-balance-audit",
  openingHandSize = 5,
  drawCheckpoints = DEFAULT_DRAW_CHECKPOINTS
} = {}) {
  const sampleCount = positiveInteger(samples, 1000);
  const handSize = positiveInteger(openingHandSize, 5);
  const checkpoints = normalizeCheckpoints(drawCheckpoints, handSize);
  const authoredDeck = finaleDeckIds();
  const authoredTributeBodies = (scenarioSetups[FINALE_SCENARIO_ID]?.aiField || []).length;
  const rng = createSeededRandom(seed);
  const shuffledStats = createOpeningStats(checkpoints);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const shuffledDeck = shuffle(authoredDeck, rng);
    recordOpeningSample(shuffledStats, shuffledDeck, checkpoints);
  }

  const authoredDeployment = simulateFinaleDeployment({
    deckOrder: authoredDeck,
    openingHandSize: handSize,
    tributeBodies: authoredTributeBodies,
    sampleId: "authored"
  });
  const oneTributeLost = simulateFinaleDeployment({
    deckOrder: authoredDeck,
    openingHandSize: handSize,
    tributeBodies: Math.max(0, authoredTributeBodies - 1),
    sampleId: "one-tribute-lost"
  });
  const twoTributesLost = simulateFinaleDeployment({
    deckOrder: authoredDeck,
    openingHandSize: handSize,
    tributeBodies: Math.max(0, authoredTributeBodies - 2),
    sampleId: "two-tributes-lost"
  });
  const attackDestroyTrap = simulateFinaleDeployment({
    deckOrder: authoredDeck,
    openingHandSize: handSize,
    tributeBodies: authoredTributeBodies,
    includeAttackDestroyTrap: true,
    sampleId: "attack-destroy"
  });
  const pressure = simulateFinalePressureAudit();

  return {
    scenarioId: FINALE_SCENARIO_ID,
    aiPresetId: FINALE_AI_PRESET_ID,
    seed,
    samples: sampleCount,
    openingHandSize: handSize,
    drawCheckpoints: checkpoints,
    deck: summarizeFinaleDeck(authoredDeck),
    authored: {
      opening: summarizeOpeningWindow(authoredDeck.slice(0, handSize)),
      deployment: authoredDeployment
    },
    shuffled: finalizeOpeningStats(shuffledStats, sampleCount),
    disruption: {
      oneTributeLost,
      twoTributesLost,
      attackDestroyTrap
    },
    pressure,
    protection: trioProtectionProfiles()
  };
}

export function simulateFinaleDeployment(options = {}) {
  return runFinaleDeployment(options).report;
}

function runFinaleDeployment({
  deckOrder = finaleDeckIds(),
  openingHandSize = 5,
  tributeBodies = (scenarioSetups[FINALE_SCENARIO_ID]?.aiField || []).length,
  includeAttackDestroyTrap = false,
  playerLp = STARTING_LP,
  playerMonsterTemplates = ["trio-decoy-ward"],
  sampleId = "deployment"
} = {}) {
  const initialState = createDeploymentState({
    deckOrder,
    tributeBodies,
    includeAttackDestroyTrap,
    playerLp,
    playerMonsterTemplates,
    sampleId
  });
  const engine = new GameEngine(initialState);
  const openingEvents = engine.dispatch({
    type: "DRAW_CARDS",
    playerId: AI,
    count: positiveInteger(openingHandSize, 5),
    reason: "opening"
  });
  openingEvents.push(...engine.dispatch({
    type: "CHANGE_PHASE",
    playerId: AI,
    phase: Phase.main
  }));
  let state = engine.getState();
  const opening = state.players[AI].hand.map((cardId) => state.cards[cardId]?.templateId);
  const summonCardId = preferredTrioGodCardId(state);
  const tributeCardIds = state.players[AI].monsterZone.slice(0, 3);

  if (!summonCardId) {
    return {
      report: deploymentResult({
        state,
        opening,
        openingEvents,
        legal: false,
        reason: "no-trio-god-in-opening"
      }),
      engine,
      events: openingEvents.slice(),
      establishedTrioCardIds: [],
      trapEvents: []
    };
  }
  if (tributeCardIds.length < 3) {
    return {
      report: deploymentResult({
        state,
        opening,
        openingEvents,
        legal: false,
        reason: "insufficient-tributes",
        summonCardId
      }),
      engine,
      events: openingEvents.slice(),
      establishedTrioCardIds: [],
      trapEvents: []
    };
  }

  const summonEvents = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: AI,
    rivalId: PLAYER,
    cardId: summonCardId,
    tributeCardIds,
    index: 0
  });
  state = engine.getState();
  const establishedTrioCardIds = state.players[AI].monsterZone.filter((cardId) =>
    TRIO_GOD_ID_SET.has(state.cards[cardId]?.templateId)
  );

  let trapResult = null;
  let trapEvents = [];
  if (includeAttackDestroyTrap) {
    const trapResolution = resolveAttackDestroyTrap(engine, summonCardId);
    trapResult = trapResolution.summary;
    trapEvents = trapResolution.events;
    state = engine.getState();
  }

  assertValidGameState(state);
  return {
    report: deploymentResult({
      state,
      opening,
      openingEvents,
      summonEvents,
      legal: true,
      reason: null,
      summonCardId,
      trapResult
    }),
    engine,
    events: [...openingEvents, ...summonEvents, ...trapEvents],
    establishedTrioCardIds,
    trapEvents
  };
}

function simulateFinalePressureAudit() {
  const attackProbe = runFinaleDeployment({
    playerLp: 9000,
    sampleId: "pressure-next-turn"
  });
  const attackEvents = advanceToNextAiTurn(attackProbe.engine);
  attackEvents.push(...attackProbe.engine.dispatch({
    type: "CHANGE_PHASE",
    playerId: AI,
    phase: Phase.battle
  }));

  let state = attackProbe.engine.getState();
  const sunCardId = trioCardIdByTemplate(state, "trio-sun-judicator");
  const moonCardId = trioCardIdByTemplate(state, "trio-moon-warden");
  const starCardId = trioCardIdByTemplate(state, "trio-star-herald");
  const targetCardId = state.players[PLAYER].monsterZone[0];
  attackEvents.push(...resolveAuditedAttack(attackProbe.engine, sunCardId, targetCardId));
  attackEvents.push(...resolveAuditedAttack(attackProbe.engine, moonCardId));
  attackEvents.push(...resolveAuditedAttack(attackProbe.engine, starCardId));
  state = attackProbe.engine.getState();
  assertValidGameState(state);

  const trapProbe = runFinaleDeployment({
    includeAttackDestroyTrap: true,
    playerLp: 9000,
    sampleId: "pressure-trap-exchange"
  });
  const trapEvents = trapProbe.trapEvents.slice();
  trapEvents.push(...advanceToNextAiTurn(trapProbe.engine));
  const trapState = trapProbe.engine.getState();
  assertValidGameState(trapState);

  return {
    auditWindow: {
      probes: ["next-turn-attacks", "attack-destroy-trap"],
      aiTurnsObservedPerProbe: 1,
      survivalValuesAreLowerBounds: true
    },
    ...summarizeFinalePressureSamples([
      pressureSample({
        id: "next-turn-attacks",
        state,
        events: attackEvents,
        initialTrioCardIds: attackProbe.establishedTrioCardIds,
        fullTrioEstablished: attackProbe.establishedTrioCardIds.length === TRIO_GOD_IDS.length
      }),
      pressureSample({
        id: "attack-destroy-trap",
        state: trapState,
        events: trapEvents,
        initialTrioCardIds: trapProbe.establishedTrioCardIds,
        fullTrioEstablished: trapProbe.establishedTrioCardIds.length === TRIO_GOD_IDS.length
      })
    ])
  };
}

function pressureSample({ id, state, events, initialTrioCardIds, fullTrioEstablished }) {
  return {
    id,
    cards: state.cards,
    events,
    initialTrioCardIds,
    finalTrioCardIds: state.players[AI].monsterZone.filter((cardId) =>
      TRIO_GOD_ID_SET.has(state.cards[cardId]?.templateId)
    ),
    fullTrioEstablished
  };
}

function advanceToNextAiTurn(engine) {
  const events = [];
  events.push(...engine.dispatch({ type: "END_TURN", playerId: AI }));
  events.push(...engine.dispatch({ type: "START_TURN", playerId: PLAYER }));
  events.push(...engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER }));
  events.push(...engine.dispatch({ type: "END_TURN", playerId: PLAYER }));
  events.push(...engine.dispatch({ type: "START_TURN", playerId: AI }));
  events.push(...engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: AI }));
  return events;
}

function resolveAuditedAttack(engine, attackerCardId, targetCardId = null) {
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId,
    ...(targetCardId ? { targetCardId } : {})
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  const responseEvents = engine.dispatch({
    type: "CLOSE_RESPONSE_WINDOW",
    playerId: PLAYER,
    reason: "audit-declined"
  });
  const battleEvents = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId,
    ...(targetCardId ? { targetCardId } : {}),
    declarationEventId: declaration.id
  });
  return [...declarationEvents, ...responseEvents, ...battleEvents];
}

function trioCardIdByTemplate(state, templateId) {
  const cardId = state.players[AI].monsterZone.find((candidate) =>
    state.cards[candidate]?.templateId === templateId
  );
  if (!cardId) throw new Error(`Finale pressure audit missing ${templateId}`);
  return cardId;
}

function finaleDeckIds() {
  return (deckPresets[FINALE_AI_PRESET_ID]?.ids || []).slice();
}

function createOpeningStats(checkpoints) {
  return {
    checkpoints: Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint, {
      anyGod: 0,
      twoDistinctGods: 0,
      allThreeGods: 0,
      moonDominion: 0,
      protectionSupport: 0,
      fullPressurePackage: 0
    }])),
    earliest: {
      anyGod: [],
      allThreeGods: [],
      fullPressurePackage: []
    }
  };
}

function recordOpeningSample(stats, deck, checkpoints) {
  checkpoints.forEach((checkpoint) => {
    const summary = summarizeOpeningWindow(deck.slice(0, checkpoint));
    const entry = stats.checkpoints[checkpoint];
    if (summary.trioGodCopies > 0) entry.anyGod += 1;
    if (summary.distinctTrioGods >= 2) entry.twoDistinctGods += 1;
    if (summary.fullTrioReady) entry.allThreeGods += 1;
    if (summary.hasMoonDominion) entry.moonDominion += 1;
    if (summary.hasProtectionSupport) entry.protectionSupport += 1;
    if (summary.fullPressurePackage) entry.fullPressurePackage += 1;
  });

  stats.earliest.anyGod.push(firstDrawIndex(deck, (seen) => seen.some((id) => TRIO_GOD_ID_SET.has(id))));
  stats.earliest.allThreeGods.push(firstDrawIndex(deck, (seen) => distinctTrioGodCount(seen) === TRIO_GOD_IDS.length));
  stats.earliest.fullPressurePackage.push(firstDrawIndex(deck, (seen) =>
    distinctTrioGodCount(seen) === TRIO_GOD_IDS.length
    && seen.includes("trio-moon-dominion")
    && seen.some((id) => PRESSURE_SUPPORT_IDS.has(id) && id !== "trio-moon-dominion")
  ));
}

function finalizeOpeningStats(stats, samples) {
  return {
    checkpoints: Object.fromEntries(Object.entries(stats.checkpoints).map(([checkpoint, entry]) => [checkpoint, {
      anyGodRate: ratio(entry.anyGod, samples),
      twoDistinctGodsRate: ratio(entry.twoDistinctGods, samples),
      allThreeGodsRate: ratio(entry.allThreeGods, samples),
      moonDominionRate: ratio(entry.moonDominion, samples),
      protectionSupportRate: ratio(entry.protectionSupport, samples),
      fullPressurePackageRate: ratio(entry.fullPressurePackage, samples)
    }])),
    earliestDraw: {
      anyGod: summarizeDrawDistribution(stats.earliest.anyGod),
      allThreeGods: summarizeDrawDistribution(stats.earliest.allThreeGods),
      fullPressurePackage: summarizeDrawDistribution(stats.earliest.fullPressurePackage)
    }
  };
}

function summarizeOpeningWindow(cardIds) {
  const ids = cardIds.filter(Boolean);
  const distinctTrioGods = distinctTrioGodCount(ids);
  const hasMoonDominion = ids.includes("trio-moon-dominion");
  const hasProtectionSupport = ids.some((id) =>
    PRESSURE_SUPPORT_IDS.has(id) && id !== "trio-moon-dominion"
  );
  return {
    cards: ids.slice(),
    trioGodCopies: ids.filter((id) => TRIO_GOD_ID_SET.has(id)).length,
    distinctTrioGods,
    fullTrioReady: distinctTrioGods === TRIO_GOD_IDS.length,
    hasMoonDominion,
    hasProtectionSupport,
    fullPressurePackage: distinctTrioGods === TRIO_GOD_IDS.length
      && hasMoonDominion
      && hasProtectionSupport
  };
}

function summarizeFinaleDeck(deck) {
  return {
    size: deck.length,
    trioGodCopies: Object.fromEntries(TRIO_GOD_IDS.map((cardId) => [
      cardId,
      deck.filter((id) => id === cardId).length
    ])),
    moonDominionCopies: deck.filter((id) => id === "trio-moon-dominion").length,
    protectionSupportCopies: Object.fromEntries(
      [...PRESSURE_SUPPORT_IDS]
        .filter((id) => id !== "trio-moon-dominion")
        .map((cardId) => [cardId, deck.filter((id) => id === cardId).length])
    )
  };
}

function summarizeDrawDistribution(values) {
  const sorted = values.filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    maximum: sorted.at(-1) || 0
  };
}

function deploymentResult({
  state,
  opening,
  openingEvents = [],
  summonEvents = [],
  legal,
  reason,
  summonCardId = null,
  trapResult = null
}) {
  const trioCards = state.players[AI].monsterZone
    .map((cardId) => state.cards[cardId])
    .filter((card) => TRIO_GOD_ID_SET.has(card?.templateId));
  const convergenceEvents = summonEvents.filter((event) =>
    event.type === "MONSTER_SUMMONED" && event.summonType === "trioConvergence"
  );
  return {
    legal,
    reason,
    opening: summarizeOpeningWindow(opening),
    sourceGod: summonCardId ? state.cards[summonCardId]?.templateId || null : null,
    tributeCount: summonEvents.filter((event) => event.type === "CARD_TRIBUTED").length,
    convergenceCount: convergenceEvents.length,
    convergenceResolved: summonEvents.some((event) => event.type === "TRIO_CONVERGENCE_RESOLVED"),
    trioOnField: trioCards.map((card) => card.templateId),
    fullTrioEstablished: distinctTrioGodCount(trioCards.map((card) => card.templateId)) === TRIO_GOD_IDS.length,
    lockedByConvergence: trioCards.filter((card) => card.attackLockReason === "trioConvergence").length,
    immediatelyAttackable: trioCards.filter((card) => !card.used && !card.attackLockReason && card.mode !== "defense").length,
    totalPrintedAtkOnField: trioCards.reduce((total, card) => total + (Number(card.atk) || 0), 0),
    eventCount: openingEvents.length + summonEvents.length,
    trapResult
  };
}

function createDeploymentState({
  deckOrder,
  tributeBodies,
  includeAttackDestroyTrap,
  playerLp,
  playerMonsterTemplates,
  sampleId
}) {
  const cards = {};
  const aiDeck = createRuntimeCards(deckOrder, AI, `${sampleId}-ai-deck`, cards);
  const initialBodies = (scenarioSetups[FINALE_SCENARIO_ID]?.aiField || []).slice(0, tributeBodies);
  const aiMonsterZone = createRuntimeCards(initialBodies, AI, `${sampleId}-ai-field`, cards);
  const playerDeck = createRuntimeCards(["guard-sigil", "mirror-snare"], PLAYER, `${sampleId}-player-deck`, cards);
  const playerMonsterZone = createRuntimeCards(playerMonsterTemplates, PLAYER, `${sampleId}-player-field`, cards);
  const playerSpellTrapZone = includeAttackDestroyTrap
    ? createRuntimeCards(["trio-solar-snare"], PLAYER, `${sampleId}-player-trap`, cards)
    : [];

  return {
    cards,
    players: {
      [PLAYER]: basePlayer(PLAYER, {
        lp: playerLp,
        deck: playerDeck,
        monsterZone: playerMonsterZone,
        spellTrapZone: playerSpellTrapZone
      }),
      [AI]: basePlayer(AI, {
        deck: aiDeck,
        monsterZone: aiMonsterZone
      })
    },
    turn: {
      playerId: AI,
      phase: Phase.draw
    },
    machine: {
      phase: Phase.draw,
      timing: Timing.draw,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null
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

function createRuntimeCards(templateIds, ownerId, prefix, cards) {
  return templateIds.map((templateId, index) => {
    const template = cardTemplate(templateId);
    const cardId = `${prefix}-${index}-${templateId}`;
    cards[cardId] = {
      ...clone(template),
      id: cardId,
      uid: cardId,
      templateId,
      ownerId,
      mode: template.type === "monster" ? "attack" : undefined,
      used: false,
      attackLockReason: null,
      changedMode: false,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      destructionProtectionUsed: false
    };
    return cardId;
  });
}

function basePlayer(id, overrides = {}) {
  return {
    id,
    lp: STARTING_LP,
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

function preferredTrioGodCardId(state) {
  for (const templateId of TRIO_GOD_IDS) {
    const cardId = state.players[AI].hand.find((candidate) =>
      state.cards[candidate]?.templateId === templateId
    );
    if (cardId) return cardId;
  }
  return null;
}

function resolveAttackDestroyTrap(engine, attackerCardId) {
  let state = engine.getState();
  const targetCardId = state.players[PLAYER].monsterZone[0];
  const trapCardId = state.players[PLAYER].spellTrapZone[0];
  const events = engine.dispatch({ type: "CHANGE_PHASE", playerId: AI, phase: Phase.battle });
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId,
    targetCardId
  });
  events.push(...declarationEvents);
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  events.push(...engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: trapCardId,
    effectId: "attackDestroy",
    targetEffectId: declaration.id,
    attackerCardId
  }));
  events.push(...engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: trapCardId,
    targetEffectId: declaration.id,
    attackerCardId
  }));
  const resolutionEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  events.push(...resolutionEvents);
  state = engine.getState();
  return {
    summary: {
      trapTemplateId: state.cards[trapCardId]?.templateId || "trio-solar-snare",
      sourceGodDestroyed: state.players[AI].grave.includes(attackerCardId),
      sourceGodTemplateId: state.cards[attackerCardId]?.templateId || null,
      remainingTrioGods: state.players[AI].monsterZone
        .map((cardId) => state.cards[cardId]?.templateId)
        .filter((templateId) => TRIO_GOD_ID_SET.has(templateId)),
      destroyEvents: resolutionEvents.filter((event) => event.type === "CARD_DESTROYED").length
    },
    events
  };
}

function trioProtectionProfiles() {
  return TRIO_GOD_IDS.map((templateId) => {
    const card = cardTemplate(templateId);
    return {
      templateId,
      name: card.name,
      tributeCost: Number(card.tributeCost) || 0,
      destructionProtection: Boolean(card.destructionProtection || card.divineGuard),
      targetResistance: Boolean(card.targetResistance),
      piercingDamage: Boolean(card.piercingDamage || card.divinePierce)
    };
  });
}

function distinctTrioGodCount(cardIds) {
  return new Set(cardIds.filter((id) => TRIO_GOD_ID_SET.has(id))).size;
}

function firstDrawIndex(deck, predicate) {
  const seen = [];
  for (let index = 0; index < deck.length; index += 1) {
    seen.push(deck[index]);
    if (predicate(seen)) return index + 1;
  }
  return 0;
}

function isTrioRuntimeCard(cards, cardId, fallbackTemplateId = null) {
  const templateId = cards?.[cardId]?.templateId || fallbackTemplateId;
  return Boolean(cardId && TRIO_GOD_ID_SET.has(templateId));
}

function trioLeavesMonsterZone(event) {
  if (event.type === "CARD_DESTROYED" || event.type === "CARD_TRIBUTED") return true;
  return event.type === "CARD_MOVED"
    && event.from?.zone === "monsterZone"
    && event.to?.zone !== "monsterZone";
}

function attackHasPressureImpact(resolution, attackEvents, attackerCardId) {
  const outcome = resolution?.outcome || {};
  if (Number(outcome.wear) > 0 || outcome.destroysTarget) return true;
  return attackEvents.some((event) =>
    event.sourceCardId === attackerCardId
    && (
      (event.type === "DAMAGE_DEALT" && Number(event.amount) > 0)
      || (event.type === "CARD_DESTROYED" && event.cardId !== attackerCardId)
    )
  );
}

function normalizeCheckpoints(values, openingHandSize) {
  const raw = Array.isArray(values) ? values : DEFAULT_DRAW_CHECKPOINTS;
  const normalized = raw
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= openingHandSize)
    .sort((a, b) => a - b);
  return [...new Set(normalized.length ? normalized : DEFAULT_DRAW_CHECKPOINTS)];
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return 0;
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[Math.min(index, sortedValues.length - 1)];
}

function ratio(value, denominator) {
  if (!denominator) return 0;
  return Math.round((Number(value) / Number(denominator)) * 10000) / 10000;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cardTemplate(templateId) {
  const card = library.find((entry) => entry.id === templateId);
  if (!card) throw new Error(`Unknown card template ${templateId}`);
  return card;
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
