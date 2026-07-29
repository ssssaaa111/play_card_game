import { deckPresets, library, scenarioSetups } from "./data.js";
import {
  GameEngine,
  Phase,
  Timing,
  assertValidGameState
} from "./game-engine.js";
import { MAX_LP } from "./rules.js";

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
    protection: trioProtectionProfiles()
  };
}

export function simulateFinaleDeployment({
  deckOrder = finaleDeckIds(),
  openingHandSize = 5,
  tributeBodies = (scenarioSetups[FINALE_SCENARIO_ID]?.aiField || []).length,
  includeAttackDestroyTrap = false,
  sampleId = "deployment"
} = {}) {
  const initialState = createDeploymentState({
    deckOrder,
    tributeBodies,
    includeAttackDestroyTrap,
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
    return deploymentResult({
      state,
      opening,
      openingEvents,
      legal: false,
      reason: "no-trio-god-in-opening"
    });
  }
  if (tributeCardIds.length < 3) {
    return deploymentResult({
      state,
      opening,
      openingEvents,
      legal: false,
      reason: "insufficient-tributes",
      summonCardId
    });
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

  let trapResult = null;
  if (includeAttackDestroyTrap) {
    trapResult = resolveAttackDestroyTrap(engine, summonCardId);
    state = engine.getState();
  }

  assertValidGameState(state);
  return deploymentResult({
    state,
    opening,
    openingEvents,
    summonEvents,
    legal: true,
    reason: null,
    summonCardId,
    trapResult
  });
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
  sampleId
}) {
  const cards = {};
  const aiDeck = createRuntimeCards(deckOrder, AI, `${sampleId}-ai-deck`, cards);
  const initialBodies = (scenarioSetups[FINALE_SCENARIO_ID]?.aiField || []).slice(0, tributeBodies);
  const aiMonsterZone = createRuntimeCards(initialBodies, AI, `${sampleId}-ai-field`, cards);
  const playerMonsterZone = createRuntimeCards(["trio-decoy-ward"], PLAYER, `${sampleId}-player-field`, cards);
  const playerSpellTrapZone = includeAttackDestroyTrap
    ? createRuntimeCards(["trio-solar-snare"], PLAYER, `${sampleId}-player-trap`, cards)
    : [];

  return {
    cards,
    players: {
      [PLAYER]: basePlayer(PLAYER, {
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
  engine.dispatch({ type: "CHANGE_PHASE", playerId: AI, phase: Phase.battle });
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId,
    targetCardId
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: trapCardId,
    effectId: "attackDestroy",
    targetEffectId: declaration.id,
    attackerCardId
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: trapCardId,
    targetEffectId: declaration.id,
    attackerCardId
  });
  const resolutionEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  state = engine.getState();
  return {
    trapTemplateId: state.cards[trapCardId]?.templateId || "trio-solar-snare",
    sourceGodDestroyed: state.players[AI].grave.includes(attackerCardId),
    sourceGodTemplateId: state.cards[attackerCardId]?.templateId || null,
    remainingTrioGods: state.players[AI].monsterZone
      .map((cardId) => state.cards[cardId]?.templateId)
      .filter((templateId) => TRIO_GOD_ID_SET.has(templateId)),
    destroyEvents: resolutionEvents.filter((event) => event.type === "CARD_DESTROYED").length
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
      piercingDamage: Boolean(card.piercingDamage || card.divinePierce),
      shieldPierce: Boolean(card.shieldPierce || card.divinePressure)
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
