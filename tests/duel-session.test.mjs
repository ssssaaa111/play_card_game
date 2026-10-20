import test from "node:test";
import assert from "node:assert/strict";

import {
  ControllerKind,
  DuelMode,
  controllerForSeat,
  createDuelSessionConfig,
  isAutomatedSeat,
  isLocalSeat,
  normalizeSeatIds,
  otherSeatId,
  seatIdsForState
} from "../src/duel-session.js";

test("creates backward-compatible solo seat configuration", () => {
  const session = createDuelSessionConfig();

  assert.equal(session.mode, DuelMode.solo);
  assert.deepEqual(session.seatIds, ["player", "ai"]);
  assert.equal(session.localPlayerId, "player");
  assert.deepEqual(session.controllers, {
    player: ControllerKind.human,
    ai: ControllerKind.ai
  });
  assert.equal(isLocalSeat(session, "player"), true);
  assert.equal(isAutomatedSeat(session, "ai"), true);
});

test("models online seats independently from local and remote presentation roles", () => {
  const session = createDuelSessionConfig({
    mode: DuelMode.onlinePvp,
    seatIds: ["p1", "p2"],
    localPlayerId: "p2"
  });

  assert.deepEqual(session.controllers, {
    p1: ControllerKind.remote,
    p2: ControllerKind.human
  });
  assert.equal(otherSeatId(session, "p2"), "p1");
  assert.equal(controllerForSeat(session, "p1"), ControllerKind.remote);
  assert.equal(isLocalSeat(session, "p2"), true);
  assert.equal(isAutomatedSeat(session, "p1"), false);
});

test("discovers custom engine and UI seat ids without relying on player or ai names", () => {
  assert.deepEqual(seatIdsForState({ players: { alpha: {}, beta: {} } }), ["alpha", "beta"]);
  assert.deepEqual(seatIdsForState({
    north: { owner: "north", deck: [], hand: [] },
    south: { owner: "south", deck: [], hand: [] }
  }), ["north", "south"]);
});

test("rejects ambiguous duel seat configuration", () => {
  assert.throws(() => normalizeSeatIds(["p1"]), /exactly two unique seat ids/);
  assert.throws(() => normalizeSeatIds(["p1", "p1"]), /exactly two unique seat ids/);
  assert.throws(
    () => createDuelSessionConfig({ seatIds: ["p1", "p2"], localPlayerId: "spectator" }),
    /is not a duel seat/
  );
});
