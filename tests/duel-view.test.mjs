import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/game-engine.js";
import { buildDuelView } from "../src/duel-view.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";

test("duel views reveal only the viewer hand and never reveal either deck order", () => {
  const state = createOnlineDuelState();
  const p1View = buildDuelView(state, "p1", { roomCode: "ABC234", revision: 4 });
  const p2View = buildDuelView(state, "p2", { roomCode: "ABC234", revision: 4 });

  assert.equal(p1View.players.p1.hand.length, 5);
  assert.ok(p1View.players.p1.hand.every((card) => !card.hidden && card.name));
  assert.ok(p1View.players.p2.hand.every((card) => card.hidden && !card.templateId));
  assert.ok(p2View.players.p1.hand.every((card) => card.hidden));
  assert.ok(p2View.players.p2.hand.every((card) => !card.hidden));
  assert.equal(p1View.players.p1.deckCount, 35);
  assert.equal("deck" in p1View.players.p1, false);
  assert.equal("cards" in p1View, false);
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
