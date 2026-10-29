import test from "node:test";
import assert from "node:assert/strict";

import { DuelRoom, DuelRoomError } from "../server/duel-room.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";

function startedRoom(roomOptions = {}) {
  const createState = roomOptions.createState || ((options) => createOnlineDuelState({ ...options, openingHands: {
    p1: ["solar-knight", "twin-summon", "gale-mage", "iron-guardian", "void-hound"]
  } }));
  const room = new DuelRoom({ code: "ABC234", ...roomOptions, createState });
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
  const summonedMonster = room.viewFor("p1").players.p1.monsterZone.find(Boolean);
  assert.ok(summonedMonster);
  assert.equal(typeof summonedMonster.icon, "string");
  assert.equal(typeof summonedMonster.stars, "number");
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

test("the authoritative turn clock survives actions and auto-ends exactly at its deadline", () => {
  let now = 10_000;
  const { room } = startedRoom({ now: () => now, turnTimeoutMs: 5_000 });
  assert.deepEqual(room.viewFor("p1").turnTimer, {
    playerId: "p1",
    deadlineAt: 15_000,
    remainingMs: null,
    durationMs: 5_000,
    paused: false
  });

  now = 12_000;
  const view = room.viewFor("p1");
  room.submit("connection-1", {
    revision: view.revision,
    commandId: "clock-action",
    action: view.legalActions.actions.summon[0]
  });
  assert.equal(room.viewFor("p1").turnTimer.deadlineAt, 15_000, "ordinary actions must not reset the whole-turn clock");
  now = 14_999;
  assert.equal(room.expireTurnTimeout(), false);
  now = 15_000;
  assert.equal(room.expireTurnTimeout(), true);

  const after = room.viewFor("p1");
  assert.equal(after.turn.playerId, "p2");
  assert.equal(after.turnTimer.playerId, "p2");
  assert.equal(after.turnTimer.deadlineAt, 20_000);
  assert.ok(after.recentEvents.some((event) => event.type === "TURN_ENDED" && event.reason === "online-turn-timeout" && event.endedBy === "timeout"));
});

test("disconnect pauses the whole-turn clock and reconnect resumes only its remainder", () => {
  let now = 20_000;
  const { room, p2 } = startedRoom({ now: () => now, turnTimeoutMs: 10_000 });
  now = 24_000;
  room.disconnect("connection-2");
  assert.deepEqual(room.viewFor("p1").turnTimer, {
    playerId: "p1",
    deadlineAt: null,
    remainingMs: 6_000,
    durationMs: 10_000,
    paused: true
  });
  now = 50_000;
  assert.equal(room.expireTurnTimeout(), false);
  room.join({ name: "ignored", connectionId: "connection-2b", reconnectToken: p2.reconnectToken });
  assert.equal(room.viewFor("p1").turnTimer.deadlineAt, 56_000);
  now = 55_999;
  assert.equal(room.expireTurnTimeout(), false);
  now = 56_000;
  assert.equal(room.expireTurnTimeout(), true);
  assert.equal(room.viewFor("p1").turn.playerId, "p2");
});

test("declaring an attack auto-resolves when no legal trap is set", () => {
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

test("room seats stay bound to the authenticated account", () => {
  const room = new DuelRoom({ code: "ABC234" });
  const first = room.join({ name: "星野", accountId: "account-one", connectionId: "connection-1" });

  assert.throws(
    () => room.join({ name: "星野分身", accountId: "account-one", connectionId: "connection-2" }),
    (error) => error instanceof DuelRoomError && error.code === "ACCOUNT_ALREADY_SEATED"
  );

  room.disconnect("connection-1");
  assert.throws(
    () => room.join({ name: "冒用者", accountId: "account-two", connectionId: "connection-3", reconnectToken: first.reconnectToken }),
    (error) => error instanceof DuelRoomError && error.code === "ACCOUNT_MISMATCH"
  );
  const resumed = room.join({ name: "星野", accountId: "account-one", connectionId: "connection-4", reconnectToken: first.reconnectToken });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.seatId, "p1");
});

test("a disconnected opponent pauses commands until the reserved seat reconnects", () => {
  const { room, p2 } = startedRoom();
  const before = room.viewFor("p1");
  room.disconnect("connection-2");
  assert.throws(() => room.submit("connection-1", {
    revision: room.revision,
    commandId: "paused-command",
    action: before.legalActions.actions.summon[0]
  }), (error) => error instanceof DuelRoomError && error.code === "OPPONENT_DISCONNECTED");

  room.join({ name: "ignored", connectionId: "connection-2b", reconnectToken: p2.reconnectToken });
  const resumed = room.viewFor("p1");
  const receipt = room.submit("connection-1", {
    revision: resumed.revision,
    commandId: "resumed-command",
    action: resumed.legalActions.actions.summon[0]
  });
  assert.equal(receipt.duplicate, false);
});

test("a disconnected seat has a finite reconnect deadline and loses after it expires", () => {
  let now = 10_000;
  const { room } = startedRoom({ now: () => now, disconnectGraceMs: 5_000 });
  room.disconnect("connection-2");

  const disconnected = room.viewFor("p1").seats.find((seat) => seat.seatId === "p2");
  assert.equal(disconnected.reconnectDeadlineAt, 15_000);
  assert.equal(room.disconnectTimeoutDelay(), 5_000);
  now = 14_999;
  assert.equal(room.expireDisconnectTimeout(), false);
  now = 15_000;
  assert.equal(room.expireDisconnectTimeout(), true);

  const finished = room.viewFor("p1");
  assert.equal(finished.status, "finished");
  assert.deepEqual(finished.gameOver, {
    winnerId: "p1",
    loserIds: ["p2"],
    reason: "disconnect-timeout",
    sourceCardId: null,
    triggerEventId: null
  });
  assert.deepEqual(finished.series, { completed: 1, draws: 0, wins: { p1: 1, p2: 0 } });
  assert.equal(room.disconnectTimeoutDelay(), null);
});

test("reconnecting inside the grace period cancels disconnect forfeiture", () => {
  let now = 20_000;
  const { room, p2 } = startedRoom({ now: () => now, disconnectGraceMs: 5_000 });
  room.disconnect("connection-2");
  now = 24_500;
  room.join({ name: "ignored", connectionId: "connection-2b", reconnectToken: p2.reconnectToken });
  now = 30_000;

  assert.equal(room.expireDisconnectTimeout(), false);
  assert.equal(room.status, "playing");
  assert.equal(room.viewFor("p1").seats.find((seat) => seat.seatId === "p2").reconnectDeadlineAt, null);
});

test("a ready waiting room starts only after the disconnected seat resumes", () => {
  const room = new DuelRoom({ code: "ABC234" });
  room.join({ name: "星野", connectionId: "connection-1" });
  const p2 = room.join({ name: "月见", connectionId: "connection-2" });
  room.setReady("connection-2", true);
  room.disconnect("connection-2");
  room.setReady("connection-1", true);
  assert.equal(room.status, "waiting");
  room.join({ name: "ignored", connectionId: "connection-2b", reconnectToken: p2.reconnectToken });
  assert.equal(room.status, "playing");
});

test("forfeiting finishes the room and publishes the same winner to both seats", () => {
  const { room } = startedRoom();
  const before = room.viewFor("p2");
  const result = room.forfeit("connection-2");

  assert.equal(room.status, "finished");
  assert.equal(result.revision, before.revision + 1);
  assert.deepEqual(result.gameOver, {
    winnerId: "p1",
    loserIds: ["p2"],
    reason: "concede",
    sourceCardId: null,
    triggerEventId: null
  });
  assert.deepEqual(room.viewFor("p1").gameOver, result.gameOver);
  assert.equal(result.legalActions.actions.summon.length, 0);
  assert.throws(
    () => room.submit("connection-1", { revision: room.revision, commandId: "after-forfeit", action: { type: "END_TURN" } }),
    (error) => error instanceof DuelRoomError && error.code === "DUEL_NOT_RUNNING"
  );
});

test("a connected player may forfeit while the opponent seat is reconnecting", () => {
  const { room } = startedRoom();
  room.disconnect("connection-2");
  room.forfeit("connection-1");
  assert.equal(room.status, "finished");
  assert.deepEqual(room.viewFor("p1").gameOver, {
    winnerId: "p2",
    loserIds: ["p1"],
    reason: "concede",
    sourceCardId: null,
    triggerEventId: null
  });
});

test("both players can accept a rematch in the same room and alternate the first turn", () => {
  const { room } = startedRoom();
  assert.equal(room.duelNumber, 1);
  assert.equal(room.viewFor("p1").turn.playerId, "p1");
  room.forfeit("connection-2");
  assert.deepEqual(room.viewFor("p1").series, { completed: 1, draws: 0, wins: { p1: 1, p2: 0 } });

  const waiting = room.requestRematch("connection-1");
  assert.equal(room.status, "finished");
  assert.equal(waiting.seats.find((seat) => seat.seatId === "p1").ready, true);
  assert.equal(waiting.seats.find((seat) => seat.seatId === "p2").ready, false);
  assert.equal(waiting.nextFirstPlayerId, "p2");

  const restarted = room.requestRematch("connection-2");
  assert.equal(room.status, "playing");
  assert.equal(room.duelNumber, 2);
  assert.equal(restarted.gameOver, null);
  assert.equal(restarted.turn.playerId, "p2");
  assert.equal(restarted.nextFirstPlayerId, "p1");
  assert.ok(restarted.seats.every((seat) => seat.ready === false));

  room.forfeit("connection-1");
  assert.deepEqual(room.viewFor("p2").series, { completed: 2, draws: 0, wins: { p1: 1, p2: 1 } });
});

test("a rematch waits for a disconnected player and starts after their seat resumes", () => {
  const { room, p2 } = startedRoom();
  room.forfeit("connection-1");
  room.requestRematch("connection-2");
  room.disconnect("connection-2");
  room.requestRematch("connection-1");
  assert.equal(room.status, "finished");

  room.join({ name: "ignored", connectionId: "connection-2b", reconnectToken: p2.reconnectToken });
  assert.equal(room.status, "playing");
  assert.equal(room.viewFor("p2").turn.playerId, "p2");
});

test("rematch requests are rejected before a duel finishes", () => {
  const { room } = startedRoom();
  assert.throws(
    () => room.requestRematch("connection-1"),
    (error) => error instanceof DuelRoomError && error.code === "REMATCH_NOT_AVAILABLE"
  );
});
