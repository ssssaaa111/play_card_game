import test from "node:test";
import assert from "node:assert/strict";

import {
  DuelClientMessage,
  DuelProtocolError,
  createClientMessage,
  normalizeCommandEnvelope,
  normalizeRoomCode,
  parseClientMessage,
  sanitizeOnlineAction
} from "../src/duel-command.js";

test("duel protocol parses bounded request envelopes", () => {
  const message = createClientMessage(DuelClientMessage.joinRoom, { roomCode: "abc234", name: "星野" }, "request-1");
  assert.deepEqual(parseClientMessage(JSON.stringify(message)), message);
  assert.equal(normalizeRoomCode(" abc234 "), "ABC234");
  assert.throws(() => parseClientMessage("not-json"), DuelProtocolError);
  assert.throws(() => parseClientMessage(JSON.stringify({ type: "unknown", requestId: "r", payload: {} })), /Unknown message type/);
  assert.deepEqual(parseClientMessage(JSON.stringify(createClientMessage(DuelClientMessage.forfeitRoom, {}, "forfeit-1"))), {
    type: "duel/forfeit", requestId: "forfeit-1", payload: {}
  });
});
test("online action sanitizer binds commands to the authenticated seat", () => {
  const action = sanitizeOnlineAction({
    type: "SUMMON_MONSTER",
    playerId: "p2",
    rivalId: "p1",
    cardId: "monster-1",
    index: 2,
    tributeCardIds: ["tribute-1"]
  }, { seatId: "p1", rivalId: "p2" });

  assert.equal(action.playerId, "p1");
  assert.equal(action.rivalId, "p2");
  assert.equal(action.cardId, "monster-1");
  assert.deepEqual(action.tributeCardIds, ["tribute-1"]);
});

test("online protocol rejects server-only commands and malformed revisions", () => {
  assert.throws(
    () => sanitizeOnlineAction({ type: "RESOLVE_BATTLE" }, { seatId: "p1", rivalId: "p2" }),
    /not available online/
  );
  assert.throws(
    () => normalizeCommandEnvelope({ revision: -1, commandId: "bad", action: { type: "END_TURN" } }),
    /revision/
  );
  assert.throws(
    () => sanitizeOnlineAction({ type: "DECLARE_GAME_OVER" }, { seatId: "p1", rivalId: "p2" }),
    /not available online/
  );
});
