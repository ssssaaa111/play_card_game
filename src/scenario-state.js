import { buildScenarioDeck, cloneCardById, loadCardList } from './deck.js';
import { getCardEffectDefinition } from './game-engine.js';
import { MONSTER_ZONE_SIZE, SPELL_TRAP_ZONE_SIZE } from './rules.js';

function scenarioEntryId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
}

function scenarioCard(entry) {
  const card = cloneCardById(scenarioEntryId(entry));
  if (!card) return null;
  card.used = false;
  card.changedMode = false;
  if (entry && typeof entry === "object") {
    if (entry.mode === "attack" || entry.mode === "defense") card.mode = entry.mode;
    if (typeof entry.used === "boolean") card.used = entry.used;
    if (typeof entry.changedMode === "boolean") card.changedMode = entry.changedMode;
    if (Number.isFinite(Number(entry.tempAtk))) card.tempAtk = Number(entry.tempAtk);
    if (Number.isFinite(Number(entry.tempDef))) card.tempDef = Number(entry.tempDef);
    if (Number.isFinite(Number(entry.battleWear))) card.battleWear = Math.max(0, Number(entry.battleWear));
  }
  return card;
}

function scenarioList(entries = []) {
  return entries.map(scenarioCard).filter(Boolean);
}

export function scenarioReservedIds(scenario = {}, owner = "player") {
  const prefix = owner === "ai" ? "ai" : "player";
  return [
    ...(scenario[`${prefix}Hand`] || []),
    ...(scenario[`${prefix}Field`] || []),
    ...(scenario[`${prefix}Traps`] || []),
    ...(scenario[`${prefix}Grave`] || [])
  ].map(scenarioEntryId).filter(Boolean);
}

function scenarioZone(entries = [], size) {
  const zone = Array(size).fill(null);
  entries.slice(0, size).forEach((entry, index) => {
    const card = scenarioCard(entry);
    if (!card) return;
    zone[index] = card;
  });
  return zone;
}

function scenarioDeck(scenario, owner, preset, customDecks = [], shuffleSeed = null) {
  const explicitDeck = scenario[`${owner}Deck`];
  const deck = Array.isArray(explicitDeck)
    ? loadCardList(explicitDeck)
    : buildScenarioDeck(preset, scenarioReservedIds(scenario, owner), customDecks);
  const range = scenario[`${owner}DeckShuffleRange`];
  const hasRange = Array.isArray(range) && range.length === 2 &&
    Number.isInteger(range[0]) && Number.isInteger(range[1]) &&
    range[0] >= 0 && range[1] > range[0];
  const shuffleOwners = Array.isArray(scenario.deckShuffleOwners) ? scenario.deckShuffleOwners : null;
  const seedShufflesThisOwner = shuffleOwners
    ? shuffleOwners.includes(owner)
    : shuffleSeed != null;
  if (!seedShufflesThisOwner && !hasRange) return deck;
  const seed = shuffleSeed ?? Math.floor(Math.random() * 2147483647);
  if (!hasRange) return shuffleWithSeed(deck, seed);
  const start = Math.min(range[0], deck.length);
  const end = Math.min(range[1], deck.length);
  const shuffledMiddle = shuffleWithSeed(deck.slice(start, end), seed);
  return [...deck.slice(0, start), ...shuffledMiddle, ...deck.slice(end)];
}

function scenarioDuelistState(scenario, owner, preset, customDecks = [], shuffleSeed = null) {
  const prefix = owner === "ai" ? "ai" : "player";
  const state = {
    hand: scenarioList(scenario[`${owner}Hand`]),
    deck: scenarioDeck(scenario, owner, preset, customDecks, shuffleSeed),
    field: scenarioZone(scenario[`${owner}Field`], MONSTER_ZONE_SIZE),
    traps: scenarioZone(scenario[`${owner}Traps`], SPELL_TRAP_ZONE_SIZE),
    grave: scenarioList(scenario[`${owner}Grave`])
  };
  const lp = Number(scenario[`${prefix}Lp`]);
  if (Number.isFinite(lp)) state.lp = Math.max(0, lp);
  return state;
}

const setupZoneNames = {
  field: "field",
  monsterZone: "field",
  traps: "traps",
  spellTrapZone: "traps",
  grave: "grave",
  hand: "hand",
  deck: "deck"
};

function setupCardAt(setup, ref = {}) {
  const owner = ref.owner === "ai" ? "ai" : "player";
  const zoneName = setupZoneNames[ref.zone] || ref.zone;
  const zone = setup[owner]?.[zoneName];
  if (!Array.isArray(zone)) return null;
  if (Number.isInteger(ref.index)) return zone[ref.index] || null;
  if (ref.id) return zone.find((card) => card && (card.id === ref.id || card.templateId === ref.id)) || null;
  return null;
}

function applySetupContinuousOperation(operation, targetCard, sourceCard) {
  if (!targetCard || operation?.op !== "modifyStat") return null;
  if (operation.cardId !== "$action.targetCardId") return null;
  if (!["atk", "def", "tempAtk", "tempDef"].includes(operation.stat)) return null;
  const before = Number(targetCard[operation.stat]) || 0;
  const amount = Number(operation.amount) || 0;
  targetCard[operation.stat] = before + amount;
  return {
    type: "STAT_MODIFIED",
    cardId: targetCard.uid || targetCard.id,
    stat: operation.stat,
    before,
    after: targetCard[operation.stat],
    amount,
    sourceCardId: sourceCard?.uid || sourceCard?.id || null,
    duration: "continuous"
  };
}

function setupContinuousEvents(scenario, setup) {
  const entries = Array.isArray(scenario.setupContinuousEffects) ? scenario.setupContinuousEffects : [];
  const events = [];
  entries.forEach((entry, index) => {
    const sourceCard = setupCardAt(setup, entry.source);
    const targetCard = setupCardAt(setup, entry.target);
    if (!sourceCard || !targetCard || !entry.effectId) return;
    const definition = getCardEffectDefinition(entry.effectId);
    const operations = (entry.operations || definition?.operations || []).map((operation) => ({ ...operation }));
    const sourceCardId = sourceCard.uid || sourceCard.id;
    const targetCardId = targetCard.uid || targetCard.id;
    events.push({
      id: events.length + 1,
      type: "CONTINUOUS_EFFECT_REGISTERED",
      playerId: entry.playerId || entry.source?.owner || sourceCard.owner || "ai",
      sourceCardId,
      effectId: entry.effectId,
      targetCardId,
      destroySourceWhenTargetLeaves: definition?.destroySourceWhenTargetLeaves !== false,
      operations
    });
    operations.forEach((operation) => {
      const statEvent = applySetupContinuousOperation(operation, targetCard, sourceCard);
      if (statEvent) {
        events.push({
          id: events.length + 1,
          ...statEvent
        });
      }
    });
  });
  return events;
}

export function buildScenarioState(scenario = {}, {
  playerPreset = "balanced",
  aiPreset = "balanced",
  playerCustomDecks = [],
  aiCustomDecks = [],
  shuffleSeed = null
} = {}) {
  const setup = {
    player: scenarioDuelistState(scenario, "player", playerPreset, playerCustomDecks, shuffleSeed),
    ai: scenarioDuelistState(scenario, "ai", aiPreset, aiCustomDecks, shuffleSeed)
  };
  const gameEvents = setupContinuousEvents(scenario, setup);
  return gameEvents.length ? { ...setup, gameEvents } : setup;
}

function shuffleWithSeed(cards, seed) {
  const random = seededRandom(seed);
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const j = Math.floor(random() * (index + 1));
    [copy[index], copy[j]] = [copy[j], copy[index]];
  }
  return copy;
}

function seededRandom(seed) {
  let value = Number(seed) >>> 0 || 1;
  return function next() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
