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

function scenarioDeck(scenario, owner, preset, customDecks = []) {
  const explicitDeck = scenario[`${owner}Deck`];
  return Array.isArray(explicitDeck)
    ? loadCardList(explicitDeck)
    : buildScenarioDeck(preset, scenarioReservedIds(scenario, owner), customDecks);
}

function scenarioDuelistState(scenario, owner, preset, customDecks = []) {
  const prefix = owner === "ai" ? "ai" : "player";
  const state = {
    hand: scenarioList(scenario[`${owner}Hand`]),
    deck: scenarioDeck(scenario, owner, preset, customDecks),
    field: scenarioZone(scenario[`${owner}Field`], MONSTER_ZONE_SIZE),
    traps: scenarioZone(scenario[`${owner}Traps`], SPELL_TRAP_ZONE_SIZE),
    grave: scenarioList(scenario[`${owner}Grave`])
  };
  const lp = Number(scenario[`${prefix}Lp`]);
  if (Number.isFinite(lp)) state.lp = Math.max(0, lp);
  const shield = Number(scenario[`${prefix}Shield`]);
  if (Number.isFinite(shield)) state.shield = Math.max(0, shield);
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
  aiCustomDecks = []
} = {}) {
  const setup = {
    player: scenarioDuelistState(scenario, "player", playerPreset, playerCustomDecks),
    ai: scenarioDuelistState(scenario, "ai", aiPreset, aiCustomDecks)
  };
  const gameEvents = setupContinuousEvents(scenario, setup);
  return gameEvents.length ? { ...setup, gameEvents } : setup;
}
