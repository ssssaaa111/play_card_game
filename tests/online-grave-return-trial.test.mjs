import assert from "node:assert/strict";
import test from "node:test";
import { DuelRoom } from "../server/duel-room.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import decks from "../scripts/fixtures/online-opening-decks.json" with { type: "json" };
import {
  createGraveReturnTrialState, GraveReturnTrialRoom, graveReturnLimitReason
} from "../scripts/fixtures/online-grave-return-trial.mjs";

const endTurn = { type: "END_TURN" };
const blocked = { code: "ILLEGAL_COMMAND", message: graveReturnLimitReason };

function start(room, firstDeck) {
  for (const seatId of ["p1", "p2"]) room.join({ name: seatId, connectionId: seatId });
  if (firstDeck) room.setDeck("p1", firstDeck);
  room.setReady("p1");
  room.setReady("p2");
  return room;
}

function submit(room, seatId, action) {
  const payload = { revision: room.revision, commandId: `test-${room.revision}`, action };
  room.submit(seatId, payload);
  return payload;
}

function play(room, seatId, group, template, targetId) {
  const view = room.viewFor(seatId);
  const card = view.players[seatId].hand.find(entry => entry.templateId === template);
  assert.ok(card, `${template} must be in hand`);
  const action = view.legalActions.actions[group].find(entry => entry.cardId === card.id
    && (targetId == null || entry.targetCardId === targetId));
  assert.ok(action, `${template} must have a legal action`);
  return submit(room, seatId, action);
}

function makeRecoveryAction(room, seatId, targetTemplate) {
  const { hand, grave } = room.viewFor(seatId).players[seatId];
  const cardId = hand.find(card => card.templateId === "grave-return").id;
  const targetCardId = grave.find(card => card.templateId === targetTemplate).id;
  return { type: "ACTIVATE_CARD", cardId, targetCardId };
}

test("local trial shares a name limit across copies, persists it and restores access on the next own turn", () => {
  const room = start(new GraveReturnTrialRoom({ code: "QA2345", createState: createGraveReturnTrialState }));
  const first = makeRecoveryAction(room, "p1", "iron-guardian");
  assert.throws(() => submit(room, "p1", { ...first, targetCardId: "missing" }), { code: "ILLEGAL_COMMAND" });
  const accepted = submit(room, "p1", first);
  const second = makeRecoveryAction(room, "p1", "mirror-snare");
  const view = room.viewFor("p1");
  assert.equal(view.legalActions.unavailableHandActions[second.cardId].reason, graveReturnLimitReason);
  assert.ok(!view.legalActions.actions.activateCard.some(action => action.cardId === second.cardId));
  assert.ok(view.players.p1.hand.some(card => card.id === first.targetCardId));
  assert.throws(() => submit(room, "p1", second), blocked);
  assert.deepEqual(room.viewFor("p1"), view);
  assert.equal(room.submit("p1", accepted).duplicate, true);

  const saved = room.toSnapshot();
  const restored = new GraveReturnTrialRoom({ code: room.code }).restoreSnapshot(saved);
  for (const seatId of ["p1", "p2"]) {
    restored.join({ name: seatId, connectionId: seatId, reconnectToken: room.seatForConnection(seatId).reconnectToken });
  }
  assert.throws(() => submit(restored, "p1", second), blocked);
  submit(restored, "p1", endTurn);
  submit(restored, "p2", makeRecoveryAction(restored, "p2", "iron-guardian"));
  submit(restored, "p2", endTurn);
  submit(restored, "p1", second);
  assert.ok(restored.viewFor("p1").players.p1.hand.some(card => card.id === second.targetCardId));
});

function fixedDamageOpening(Room, extraDraws) {
  const opening = ["seer-call", "seer-call", "seer-call", "last-spark", "last-spark"];
  const draws = ["last-spark", "twin-summon", "ember-drake", "gale-mage",
    ...Array(3).fill("burst-rune"), ...Array(3).fill("flame-gale-burst"), "grave-return", ...extraDraws];
  const remaining = [...decks.burn.ids];
  for (const id of [...opening, ...draws]) {
    const index = remaining.indexOf(id);
    assert.ok(index >= 0, `The pinned deck must include ${id}`);
    remaining.splice(index, 1);
  }
  // Replay this specific shuffle of the legal, pinned deck.
  const createState = config => {
    const random = Math.random;
    try {
      Math.random = () => 0.999999;
      return createOnlineDuelState(config);
    } finally {
      Math.random = random;
    }
  };
  const room = start(new Room({ code: "QA2345", createState }), { ...decks.burn, ids: [...opening, ...draws, ...remaining] });
  const cast = (id, target) => play(room, "p1", "activateCard", id, target);
  for (const id of [...opening, "last-spark"]) cast(id);
  play(room, "p1", "summon", "ember-drake");
  cast("twin-summon");
  play(room, "p1", "summon", "gale-mage");
  if (extraDraws.includes("ember-drake")) {
    cast("twin-summon");
    play(room, "p1", "summon", "ember-drake");
  }
  const firstRune = cast("burst-rune").action.cardId;
  for (let round = 0; round < 2; round += 1) cast("burst-rune");
  for (let round = 0; round < 3; round += 1) cast("flame-gale-burst");
  cast("grave-return", firstRune);
  cast("burst-rune");
  return { room, cast, firstRune };
}

test("same fixed opener loses its lethal replay under the trial rule", () => {
  const extraDraws = ["grave-return", "grave-return"];
  const baseline = fixedDamageOpening(DuelRoom, extraDraws);
  for (let round = 0; round < 2; round += 1) {
    baseline.cast("grave-return", baseline.firstRune);
    baseline.cast("burst-rune");
  }
  assert.equal(baseline.room.viewFor("p1").gameOver.winnerId, "p1");
  assert.equal(baseline.room.viewFor("p1").players.p2.lp, 0);

  const trial = fixedDamageOpening(GraveReturnTrialRoom, extraDraws);
  assert.throws(() => submit(trial.room, "p1", makeRecoveryAction(trial.room, "p1", "burst-rune")), blocked);
  assert.equal(trial.room.viewFor("p1").players.p2.lp, 600);
  assert.equal(trial.room.viewFor("p1").gameOver, null);

  const adjusted = fixedDamageOpening(GraveReturnTrialRoom, ["twin-summon", "ember-drake"]);
  assert.equal(adjusted.room.viewFor("p1").players.p2.lp, 400);
  for (const { room } of [baseline, trial, adjusted]) {
    assert.ok(!room.engine.getState().events.some(event => ["TURN_ENDED", "ATTACK_DECLARED"].includes(event.type)));
  }
});
