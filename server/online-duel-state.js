import { createDuelist, buildDeck, buildDeckFromDefinition } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { ControllerKind, DuelMode, createDuelSessionConfig } from "../src/duel-session.js";
import { PHASES, TIMINGS } from "../src/turn-state.js";
import { trapDefinition } from "../src/traps.js";
import { normalizeOnlineDeckChoice, onlineCardSupported } from "../src/online-decks.js";

function onlineDeck(preset) {
  const cards = [];
  const supported = buildDeck(preset).filter(onlineCardSupported);
  while (cards.length < 40) {
    cards.push(...buildDeck(preset).filter(onlineCardSupported));
  }
  const deck = cards.slice(0, 40);
  // Every supported response class must remain reachable after the randomized
  // preset is truncated to the online 40-card limit.
  ["attack", "direct", "summon", "chain"]
    .map((event) => supported.find((card) => card.type === "trap" && trapDefinition(card.trigger)?.event === event))
    .filter(Boolean)
    .forEach((card, index) => { deck[deck.length - 1 - index] = card; });
  return deck;
}
function prepareDuelist(seatId, deckPreset, openingHand = null, deckChoice = null) {
  const duelist = createDuelist(seatId);
  const selectedDeck = normalizeOnlineDeckChoice(deckChoice);
  duelist.deck = selectedDeck ? buildDeckFromDefinition(selectedDeck) : onlineDeck(deckPreset);
  // Server-only deterministic openings for repeatable browser QA, never a client option.
  duelist.hand = openingHand ? openingHand.map((id) => {
    let index = duelist.deck.findIndex((card) => card.id === id);
    if (index < 0) {
      if (selectedDeck) throw new Error(`QA opening card ${id} is absent from the selected deck`);
      const replacement = buildDeck(deckPreset).find((card) => card.id === id && onlineCardSupported(card));
      if (!replacement) throw new Error(`Opening card ${id} is not supported by the online deck`);
      duelist.deck.push(replacement);
      index = duelist.deck.length - 1;
    }
    return duelist.deck.splice(index, 1)[0];
  }) : duelist.deck.splice(0, 5);
  if (!selectedDeck) duelist.deck = duelist.deck.slice(0, 35);
  return duelist;
}

export function createOnlineDuelState({
  seatIds = ["p1", "p2"],
  deckPreset = "basicExpansion",
  deckChoices = {},
  openingHands = {}
} = {}) {
  const [firstSeatId, secondSeatId] = seatIds;
  const session = createDuelSessionConfig({
    mode: DuelMode.onlinePvp,
    seatIds,
    localPlayerId: firstSeatId,
    controllers: {
      [firstSeatId]: ControllerKind.human,
      [secondSeatId]: ControllerKind.human
    }
  });
  const uiState = {
    cardDefinitionsComplete: true,
    ...session,
    [firstSeatId]: prepareDuelist(firstSeatId, deckPreset, openingHands[firstSeatId], deckChoices[firstSeatId]),
    [secondSeatId]: prepareDuelist(secondSeatId, deckPreset, openingHands[secondSeatId], deckChoices[secondSeatId]),
    turn: firstSeatId,
    phase: PHASES.main,
    timing: TIMINGS.mainOpen,
    actionWindow: null,
    gameEvents: [],
    gameOver: false,
    gameOverWinner: null,
    gameOverLosers: [],
    gameOverReason: ""
  };
  return buildEngineStateFromUiState(uiState);
}
