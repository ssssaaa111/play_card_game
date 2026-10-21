import { createDuelist, buildDeck } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { ControllerKind, DuelMode, createDuelSessionConfig } from "../src/duel-session.js";
import { PHASES, TIMINGS } from "../src/turn-state.js";

function onlineDeck(preset) {
  const cards = [];
  while (cards.length < 40) {
    cards.push(...buildDeck(preset).filter((card) => card.type !== "trap"));
  }
  return cards.slice(0, 40);
}
function prepareDuelist(seatId, deckPreset) {
  const duelist = createDuelist(seatId);
  duelist.deck = onlineDeck(deckPreset);
  duelist.hand = duelist.deck.splice(0, 5);
  return duelist;
}

export function createOnlineDuelState({
  seatIds = ["p1", "p2"],
  deckPreset = "basicExpansion"
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
    [firstSeatId]: prepareDuelist(firstSeatId, deckPreset),
    [secondSeatId]: prepareDuelist(secondSeatId, deckPreset),
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
