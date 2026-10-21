import test from "node:test";
import assert from "node:assert/strict";

import { DuelRoom, DuelRoomError } from "../server/duel-room.js";

function startedRoom() {
  const room = new DuelRoom({ code: "ABC234" });
  const p1 = room.join({ name: "星野", connectionId: "connection-1" });
  const p2 = room.join({ name: "月见", connectionId: "connection-2" });
  room.setReady("connection-1", true);
  room.setReady("connection-2", true);
  return { room, p1, p2 };
}

test("room starts only after two authenticated seats are ready", () => {
  const room = new DuelRoom({ code: "ABC234" });
  const first = room.join({ name: "星野", connectionId: "connection-1" });
  room.setReady("connection-1", true);
  assert.equal(room.status, "waiting");
  const second = room.join({ name: "月见", connectionId: "connection-2" });
  room.setReady("connection-2", true);

  assert.equal(first.seatId, "p1");
  assert.equal(second.seatId, "p2");
  assert.equal(room.status, "playing");
  assert.equal(room.viewFor("p1").turn.playerId, "p1");
});
test("room dispatches legal commands once and rejects stale revisions", () => {
  const { room } = startedRoom();
  const view = room.viewFor("p1");
  const summon = view.legalActions.actions.summon[0];
  assert.ok(summon);
  const receipt = room.submit("connection-1", {
    revision: view.revision,
    commandId: "command-summon-1",
    action: { ...summon, playerId: "p2" }
  });

  assert.equal(receipt.duplicate, false);
  assert.equal(room.viewFor("p1").players.p1.monsterZone.filter(Boolean).length, 1);
  const duplicate = room.submit("connection-1", {
    revision: view.revision,
    commandId: "command-summon-1",
    action: summon
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, receipt.revision);
  assert.throws(
    () => room.submit("connection-1", {
      revision: view.revision,
      commandId: "command-stale",
      action: { type: "END_TURN" }
    }),
    (error) => error instanceof DuelRoomError && error.code === "STALE_REVISION"
  );
});

test("ending a turn automatically starts and draws for the opponent", () => {
  const { room } = startedRoom();
  const before = room.viewFor("p2");
  const handBefore = before.players.p2.handCount;
  room.submit("connection-1", {
    revision: room.revision,
    commandId: "command-end-1",
    action: { type: "END_TURN" }
  });
  const after = room.viewFor("p2");

  assert.equal(after.turn.playerId, "p2");
  assert.equal(after.turn.phase, "main");
  assert.equal(after.players.p2.handCount, handBefore + 1);
});

test("declaring an attack resolves the MVP response window on the server", () => {
  const { room } = startedRoom();
  const opening = room.viewFor("p1");
  const summon = opening.legalActions.actions.summon[0];
  assert.ok(summon);
  room.submit("connection-1", {
    revision: opening.revision,
    commandId: "command-summon-for-attack",
    action: summon
  });

  room.submit("connection-1", {
    revision: room.revision,
    commandId: "command-enter-battle",
    action: { type: "CHANGE_PHASE", phase: "battle" }
  });
  const battleView = room.viewFor("p1");
  const attack = battleView.legalActions.actions.declareAttack[0];
  assert.ok(attack);
  const opponentLp = battleView.players.p2.lp;

  room.submit("connection-1", {
    revision: battleView.revision,
    commandId: "command-direct-attack",
    action: attack
  });
  const resolved = room.viewFor("p1");

  assert.equal(resolved.machine.pendingAttack, null);
  assert.equal(resolved.machine.responseWindow, null);
  assert.ok(resolved.players.p2.lp < opponentLp);
});

test("a reconnect token restores the same reserved seat", () => {
  const { room, p2 } = startedRoom();
  room.disconnect("connection-2");
  const disconnected = room.viewFor("p1").seats.find((seat) => seat.seatId === "p2");
  assert.equal(disconnected.connected, false);

  const resumed = room.join({
    name: "ignored",
    connectionId: "connection-2b",
    reconnectToken: p2.reconnectToken
  });
  assert.equal(resumed.seatId, "p2");
  assert.equal(resumed.resumed, true);
  assert.equal(room.viewFor("p1").seats.find((seat) => seat.seatId === "p2").connected, true);
});
