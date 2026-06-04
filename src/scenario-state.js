import { buildScenarioDeck, loadCardList } from './deck.js';
import { FIELD_SIZE } from './rules.js';

export function scenarioReservedIds(scenario = {}, owner = "player") {
  const prefix = owner === "ai" ? "ai" : "player";
  return [
    ...(scenario[`${prefix}Hand`] || []),
    ...(scenario[`${prefix}Field`] || []),
    ...(scenario[`${prefix}Traps`] || [])
  ];
}

function scenarioZone(ids = []) {
  const zone = Array(FIELD_SIZE).fill(null);
  loadCardList(ids).slice(0, FIELD_SIZE).forEach((card, index) => {
    card.used = false;
    card.changedMode = false;
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
  return {
    hand: loadCardList(scenario[`${owner}Hand`]),
    deck: scenarioDeck(scenario, owner, preset),
    field: scenarioZone(scenario[`${owner}Field`]),
    traps: scenarioZone(scenario[`${owner}Traps`])
  };
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
