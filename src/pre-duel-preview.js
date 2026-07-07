import { characterProfiles, deckPresets, scenarioSetups } from "./data.js";
import { cardDefinitionById, cardDetailViewModel } from "./card-detail.js";
import { MAX_LP } from "./rules.js";
import { scenarioReservedIds } from "./scenario-state.js";

const zoneLabels = {
  hand: "起手",
  field: "场上",
  trap: "盖放",
  grave: "墓地",
  deck: "卡组",
};

function entryId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
}

function scenarioList(scenario, key) {
  return Array.isArray(scenario?.[key]) ? scenario[key] : [];
}

function finiteLp(value) {
  return Number.isFinite(value) ? Math.max(0, value) : MAX_LP;
}

function removeReservedDeckIds(ids, scenario, owner) {
  const reserved = scenarioReservedIds(scenario, owner).reduce((counts, id) => {
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map());
  return ids.filter((id) => {
    const count = reserved.get(id) || 0;
    if (count <= 0) {
      return true;
    }
    reserved.set(id, count - 1);
    return false;
  });
}

function presetDeckIds(presetId) {
  return [...(deckPresets[presetId]?.ids || deckPresets.balanced.ids)];
}

export function scenarioObjectiveList(scenario = {}) {
  if (Array.isArray(scenario.objectives) && scenario.objectives.length) {
    return [...scenario.objectives];
  }
  return scenario.goal ? [scenario.goal] : [];
}

export function scenarioHintList(scenario = {}) {
  return Array.isArray(scenario.hints) ? [...scenario.hints] : [];
}

export function scenarioRecommendedLineList(scenario = {}) {
  return Array.isArray(scenario.recommendedLine)
    ? [...scenario.recommendedLine]
    : [];
}

export function previewDeckIdsForScenario({
  scenario = {},
  owner = "player",
  preset = "balanced",
} = {}) {
  const deckKey = owner === "ai" ? "aiDeck" : "playerDeck";
  const explicitDeck = scenarioList(scenario, deckKey).map(entryId).filter(Boolean);
  if (explicitDeck.length) {
    return explicitDeck;
  }
  return removeReservedDeckIds(presetDeckIds(preset), scenario, owner);
}

function previewCard(id, zone, index) {
  const card = cardDefinitionById(id);
  if (!card) {
    return null;
  }
  const detail = cardDetailViewModel(id);
  return {
    id,
    zone,
    zoneLabel: zoneLabels[zone] || "卡组",
    index,
    name: detail.name,
    type: detail.type,
    attack: detail.attack,
    defense: detail.defense,
    summary: card.summary || detail.rule || card.text || "",
  };
}

function scenarioZoneCards(scenario, zone, key) {
  return scenarioList(scenario, key)
    .map(entryId)
    .filter(Boolean)
    .map((id, index) => previewCard(id, zone, index))
    .filter(Boolean);
}

export function compactPreviewCards(cards = []) {
  const byId = new Map();
  cards.forEach((card) => {
    if (!card?.id) return;
    const existing = byId.get(card.id);
    if (!existing) {
      byId.set(card.id, {
        ...card,
        count: 1,
        zones: [card.zone],
        zoneLabels: [card.zoneLabel],
        zoneSummary: card.zoneLabel
      });
      return;
    }
    existing.count += 1;
    if (!existing.zones.includes(card.zone)) existing.zones.push(card.zone);
    if (!existing.zoneLabels.includes(card.zoneLabel)) existing.zoneLabels.push(card.zoneLabel);
    existing.zoneSummary = existing.zoneLabels.join(" / ");
  });
  return [...byId.values()];
}

export function buildPreDuelPreview({
  scenarioId = "normal",
  scenario = scenarioSetups[scenarioId] || {},
  playerPreset = "balanced",
  playerProfile = characterProfiles.player,
} = {}) {
  const deckIds = previewDeckIdsForScenario({
    scenario,
    owner: "player",
    preset: playerPreset,
  });
  const deckCards = [
    ...scenarioZoneCards(scenario, "hand", "playerHand"),
    ...scenarioZoneCards(scenario, "field", "playerField"),
    ...scenarioZoneCards(scenario, "trap", "playerTraps"),
    ...scenarioZoneCards(scenario, "grave", "playerGrave"),
    ...deckIds.map((id, index) => previewCard(id, "deck", index)).filter(Boolean),
  ];

  return {
    scenarioId,
    scenarioName: scenario.label || "正常决斗",
    difficulty: scenario.difficulty || "normal",
    objectives: scenarioObjectiveList(scenario),
    hints: scenarioHintList(scenario),
    recommendedLine: scenarioRecommendedLineList(scenario),
    playerLp: finiteLp(scenario.playerLp),
    aiLp: finiteLp(scenario.aiLp),
    skill: {
      name: playerProfile?.skill || "",
      text: playerProfile?.text || "",
    },
    deckCards,
    displayDeckCards: compactPreviewCards(deckCards),
  };
}
