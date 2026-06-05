import { GameEngine, Phase } from './game-engine.js';
import { FIELD_SIZE } from './rules.js';
import { PHASES } from './turn-state.js';

const ownerIds = ["player", "ai"];

const uiZones = {
  deck: "deck",
  hand: "hand",
  monsterZone: "field",
  spellTrapZone: "traps",
  grave: "grave"
};

function cardKey(card) {
  return card?.uid || card?.engineId || card?.id || null;
}

function compactCardIds(cards = []) {
  return cards.filter(Boolean).map(cardKey).filter(Boolean);
}

function collectCards(cards, ownerId, target) {
  cards.filter(Boolean).forEach((card) => {
    const id = cardKey(card);
    if (!id) return;
    const templateId = card.id || card.templateId || id;
    target[id] = {
      ...card,
      id,
      templateId,
      ownerId: card.ownerId || ownerId
    };
  });
}

function uiDuelistToEngine(duelist) {
  return {
    id: duelist.owner,
    lp: duelist.lp,
    deck: compactCardIds(duelist.deck),
    hand: compactCardIds(duelist.hand),
    monsterZone: compactCardIds(duelist.field),
    spellTrapZone: compactCardIds(duelist.traps),
    grave: compactCardIds(duelist.grave),
    banished: []
  };
}

function enginePhaseFromUiPhase(phase) {
  if (phase === PHASES.ready) return Phase.setup;
  return phase || Phase.main;
}

export function buildEngineStateFromUiState(uiState) {
  const cards = {};
  ownerIds.forEach((ownerId) => {
    const duelist = uiState[ownerId];
    if (!duelist) return;
    collectCards(duelist.deck, ownerId, cards);
    collectCards(duelist.hand, ownerId, cards);
    collectCards(duelist.field, ownerId, cards);
    collectCards(duelist.traps, ownerId, cards);
    collectCards(duelist.grave, ownerId, cards);
  });

  const phase = enginePhaseFromUiPhase(uiState.phase);
  return {
    cards,
    players: {
      player: uiDuelistToEngine(uiState.player),
      ai: uiDuelistToEngine(uiState.ai)
    },
    turn: {
      playerId: uiState.turn || "player",
      phase
    },
    machine: {
      phase
    },
    abilities: {
      player: [],
      ai: []
    },
    events: [],
    nextEventId: 1
  };
}

function uiDuelist(uiState, playerId) {
  const duelist = uiState[playerId];
  if (!duelist) throw new Error(`Unknown UI player ${playerId}`);
  return duelist;
}

function removeCardFromUiState(uiState, cardId) {
  for (const ownerId of ownerIds) {
    const duelist = uiState[ownerId];
    if (!duelist) continue;

    for (const zoneName of ["deck", "hand", "grave"]) {
      const zone = duelist[zoneName];
      const index = zone.findIndex((card) => cardKey(card) === cardId);
      if (index >= 0) {
        return zone.splice(index, 1)[0];
      }
    }

    for (const zoneName of ["field", "traps"]) {
      const zone = duelist[zoneName];
      const index = zone.findIndex((card) => cardKey(card) === cardId);
      if (index >= 0) {
        const card = zone[index];
        zone[index] = null;
        return card;
      }
    }
  }
  throw new Error(`Card ${cardId} was not found in UI state`);
}

function placeInFixedZone(zone, card, index) {
  const targetIndex = Number.isInteger(index) && index >= 0 ? index : zone.findIndex((slot) => !slot);
  if (targetIndex < 0 || targetIndex >= FIELD_SIZE) {
    throw new Error("No fixed UI zone slot is available");
  }
  if (zone[targetIndex]) {
    throw new Error(`UI zone slot ${targetIndex} is already occupied`);
  }
  zone[targetIndex] = card;
}

function insertCardIntoUiState(uiState, card, to) {
  const duelist = uiDuelist(uiState, to.playerId);
  const zoneName = uiZones[to.zone];
  if (!zoneName) throw new Error(`Unsupported UI destination zone ${to.zone}`);
  const zone = duelist[zoneName];

  if (to.zone === "monsterZone" || to.zone === "spellTrapZone") {
    placeInFixedZone(zone, card, to.index);
    return;
  }

  if (Number.isInteger(to.index) && to.index >= 0 && to.index <= zone.length) {
    zone.splice(to.index, 0, card);
  } else {
    zone.push(card);
  }
}

export function applyUiGameEvents(uiState, events = []) {
  events.forEach((event) => {
    if (event.type !== "CARD_MOVED") return;
    const card = removeCardFromUiState(uiState, event.cardId);
    insertCardIntoUiState(uiState, card, event.to);
  });
  uiState.gameEvents = Array.isArray(uiState.gameEvents) ? uiState.gameEvents : [];
  uiState.gameEvents.push(...events.map((event) => ({ ...event })));
  return events;
}

export function dispatchSetTrapFromUiState(uiState, playerId, handIndex, trapIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "SET_TRAP",
    playerId,
    cardId: cardKey(card),
    index: trapIndex
  });
  return applyUiGameEvents(uiState, events);
}
