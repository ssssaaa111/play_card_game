import { buildScenarioDeck, cloneCardById, loadCardList } from './deck.js';
import { FIELD_SIZE } from './rules.js';

function scenarioEntryId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
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

function scenarioZone(entries = []) {
  const zone = Array(FIELD_SIZE).fill(null);
  entries.slice(0, FIELD_SIZE).forEach((entry, index) => {
    const card = cloneCardById(scenarioEntryId(entry));
    if (!card) return;
    card.used = false;
    card.changedMode = false;
    if (entry && typeof entry === "object") {
      if (entry.mode === "attack" || entry.mode === "defense") card.mode = entry.mode;
      if (typeof entry.used === "boolean") card.used = entry.used;
      if (typeof entry.changedMode === "boolean") card.changedMode = entry.changedMode;
    }
    zone[index] = card;
  });
  return zone;
}

function scenarioDeck(scenario, owner, preset) {
  const explicitDeck = scenario[`${owner}Deck`];
  return Array.isArray(explicitDeck)
    ? loadCardList(explicitDeck)
    : buildScenarioDeck(preset, scenarioReservedIds(scenario, owner));
}

function scenarioDuelistState(scenario, owner, preset) {
  const prefix = owner === "ai" ? "ai" : "player";
  const state = {
    hand: loadCardList(scenario[`${owner}Hand`]),
    deck: scenarioDeck(scenario, owner, preset),
    field: scenarioZone(scenario[`${owner}Field`]),
    traps: scenarioZone(scenario[`${owner}Traps`]),
    grave: loadCardList(scenario[`${owner}Grave`])
  };
  const lp = Number(scenario[`${prefix}Lp`]);
  if (Number.isFinite(lp)) state.lp = Math.max(0, lp);
  const shield = Number(scenario[`${prefix}Shield`]);
  if (Number.isFinite(shield)) state.shield = Math.max(0, shield);
  return state;
}

export function buildScenarioState(scenario = {}, {
  playerPreset = "balanced",
  aiPreset = "balanced"
} = {}) {
  return {
    player: scenarioDuelistState(scenario, "player", playerPreset),
    ai: scenarioDuelistState(scenario, "ai", aiPreset)
  };
}
