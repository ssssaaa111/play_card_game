import { createDuelist, buildDeck } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { ControllerKind, DuelMode, createDuelSessionConfig } from "../src/duel-session.js";
import { PHASES, TIMINGS } from "../src/turn-state.js";
import { trapDefinition } from "../src/traps.js";

function onlineDeck(preset) {
  const cards = [];
  while (cards.length < 40) {
    cards.push(...buildDeck(preset).filter((card) => card.type !== "trap" || ["attack", "direct"].includes(trapDefinition(card.trigger)?.event)));
  }
  return cards.slice(0, 40);
}
function prepareDuelist(seatId, deckPreset, openingHand = null) {
  const duelist = createDuelist(seatId);
  duelist.deck = onlineDeck(deckPreset);
  // Server-only deterministic openings for repeatable browser QA, never a client option.
  duelist.hand = openingHand ? openingHand.map((id) => {
    const index = duelist.deck.findIndex((card) => card.id === id);
    if (index < 0) throw new Error(`Opening card ${id} is not in the online deck`);
    return duelist.deck.splice(index, 1)[0];
  }) : duelist.deck.splice(0, 5);
  return duelist;
}

export function createOnlineDuelState({
  seatIds = ["p1", "p2"],
  deckPreset = "basicExpansion",
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
    [firstSeatId]: prepareDuelist(firstSeatId, deckPreset, openingHands[firstSeatId]),
    [secondSeatId]: prepareDuelist(secondSeatId, deckPreset, openingHands[secondSeatId]),
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
