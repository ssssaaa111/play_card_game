import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/game-engine.js";
import { buildDuelView } from "../src/duel-view.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";

test("duel views reveal only the viewer hand and never reveal either deck order", () => {
  const state = createOnlineDuelState();
  const p1View = buildDuelView(state, "p1", { roomCode: "ABC234", revision: 4, duelNumber: 3, series: { completed: 2, draws: 0, wins: { p1: 2, p2: 0 } } });
  const p2View = buildDuelView(state, "p2", { roomCode: "ABC234", revision: 4 });

  assert.equal(p1View.players.p1.hand.length, 5);
  assert.ok(p1View.players.p1.hand.every((card) => !card.hidden && card.name));
  assert.ok(p1View.players.p2.hand.every((card) => card.hidden && !card.templateId));
  assert.ok(p2View.players.p1.hand.every((card) => card.hidden));
  assert.ok(p2View.players.p2.hand.every((card) => !card.hidden));
  assert.equal(p1View.players.p1.deckCount, 35);
  assert.equal("deck" in p1View.players.p1, false);
  assert.equal("cards" in p1View, false);
  assert.equal(p1View.duelNumber, 3);
  assert.deepEqual(p1View.series, { completed: 2, draws: 0, wins: { p1: 2, p2: 0 } });
});
test("opponent draw events keep drawn card ids private", () => {
  const engine = new GameEngine(createOnlineDuelState());
  engine.dispatch({ type: "END_TURN", playerId: "p1" });
  engine.dispatch({ type: "START_TURN", playerId: "p2" });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: "p2" });

  const p1View = buildDuelView(engine.getState(), "p1");
  const p2Draw = p1View.recentEvents.find((event) => event.type === "CARDS_DRAWN" && event.playerId === "p2");
  assert.equal(p2Draw.count, 1);
  assert.equal("cardIds" in p2Draw, false);
});

test("opponent set events expose only the public slot and never the concealed card id", () => {
  const state = createOnlineDuelState();
  let trapId = state.players.p1.hand.find((cardId) => state.cards[cardId].type === "trap");
  if (!trapId) {
    const deckIndex = state.players.p1.deck.findIndex((cardId) => state.cards[cardId].type === "trap");
    assert.notEqual(deckIndex, -1);
    trapId = state.players.p1.deck.splice(deckIndex, 1)[0];
    state.players.p1.hand.push(trapId);
  }
  const engine = new GameEngine(state);
  engine.dispatch({ type: "SET_TRAP", playerId: "p1", cardId: trapId, index: 3 });
  const event = buildDuelView(engine.getState(), "p2").recentEvents.find((entry) => entry.type === "TRAP_SET");
  assert.equal(event.index, 3);
  assert.equal("cardId" in event, false);
});

test("battle result events expose only the public outcome summary", () => {
  const state = createOnlineDuelState();
  state.events.push({
    id: 999,
    type: "BATTLE_RESOLVED",
    playerId: "p1",
    rivalId: "p2",
    direct: true,
    outcome: {
      kind: "direct",
      attack: 1700,
      targetValue: 0,
      diff: 1700,
      finalDamage: 1700,
      damagePlayerId: "p2",
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0,
      secretEngineNote: "must-not-leak"
    }
  });

  const event = buildDuelView(state, "p1").recentEvents.find((entry) => entry.id === 999);
  assert.deepEqual(event.outcome, {
    kind: "direct",
    attack: 1700,
    targetValue: 0,
    diff: 1700,
    finalDamage: 1700,
    damagePlayerId: "p2",
    destroysAttacker: false,
    destroysTarget: false,
    wear: 0
  });
});
