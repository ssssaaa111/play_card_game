import assert from "node:assert/strict";
import test from "node:test";
import { DuelRoom } from "../server/duel-room.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { graveReturnLimit, graveReturnRuleText } from "../src/online-grave-return.js";
import { onlineCardDetailView, onlineHandActionView } from "../src/online-duel-ui.js";
import decks from "../scripts/fixtures/online-opening-decks.json" with { type: "json" };
import { createGraveReturnTrialState } from "../scripts/fixtures/online-grave-return-trial.mjs";

const endTurn = { type: "END_TURN" };
const blocked = { code: "ILLEGAL_COMMAND", message: graveReturnLimit.reason };

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

function makeRecoveryAction(room, seatId, targetTemplate, spellTemplate = "grave-return") {
  const { hand, grave } = room.viewFor(seatId).players[seatId];
  const cardId = hand.find(card => card.templateId === spellTemplate).id;
  const targetCardId = grave.find(card => card.templateId === targetTemplate).id;
  return { type: "ACTIVATE_CARD", cardId, targetCardId };
}

test("the two recovery spells share their limit in both orders and reset on the next turn and rematch", () => {
  const room = start(new DuelRoom({ code: "QA2345", createState: createGraveReturnTrialState }));
  for (const card of room.viewFor("p1").players.p1.hand.filter(card => card.effect === "graveReturn")) {
    assert.ok(onlineCardDetailView(card).effectText.endsWith(graveReturnRuleText));
    assert.match(card.handSummary, /每回合共用 1 次/);
  }
  const first = makeRecoveryAction(room, "p1", "iron-guardian");
  assert.throws(() => submit(room, "p1", { ...first, targetCardId: "missing" }), { code: "ILLEGAL_COMMAND" });
  const accepted = submit(room, "p1", first);
  const second = makeRecoveryAction(room, "p1", "mirror-snare", "material-reclaim");
  const view = room.viewFor("p1");
  assert.equal(onlineHandActionView(view, second.cardId).reason, graveReturnLimit.reason);
  assert.ok(!view.legalActions.actions.activateCard.some(action => action.cardId === second.cardId));
  assert.ok(view.players.p1.hand.some(card => card.id === first.targetCardId));
  assert.throws(() => submit(room, "p1", second), blocked);
  assert.deepEqual(room.viewFor("p1"), view);
  assert.equal(room.submit("p1", accepted).duplicate, true);

  const reviveTarget = view.players.p1.grave.find(card => card.templateId === "gale-mage").id;
  play(room, "p1", "activateCard", "starwake-recall", reviveTarget);
  assert.ok(room.viewFor("p1").players.p1.monsterZone.some(card => card?.id === reviveTarget));

  const saved = room.toSnapshot();
  const restored = new DuelRoom({ code: room.code, createState: createGraveReturnTrialState }).restoreSnapshot(saved);
  for (const seatId of ["p1", "p2"]) {
    restored.join({ name: seatId, connectionId: seatId, reconnectToken: room.seatForConnection(seatId).reconnectToken });
  }
  assert.throws(() => submit(restored, "p1", second), blocked);
  submit(restored, "p1", endTurn);
  submit(restored, "p2", makeRecoveryAction(restored, "p2", "iron-guardian", "material-reclaim"));
  const reverse = makeRecoveryAction(restored, "p2", "material-reclaim");
  assert.deepEqual(restored.viewFor("p2").legalActions.unavailableHandActions[reverse.cardId], graveReturnLimit);
  assert.throws(() => submit(restored, "p2", reverse), blocked);
  submit(restored, "p2", endTurn);
  submit(restored, "p1", second);
  assert.ok(restored.viewFor("p1").players.p1.hand.some(card => card.id === second.targetCardId));

  restored.forfeit("p1");
  restored.requestRematch("p1");
  restored.requestRematch("p2");
  assert.equal(restored.duelNumber, 2);
  assert.equal(restored.viewFor("p2").turn.playerId, "p2");
  submit(restored, "p2", makeRecoveryAction(restored, "p2", "iron-guardian", "material-reclaim"));
});

test("an old save counts prior Material Reclaim activations toward the shared limit", () => {
  const createState = config => createOnlineDuelState({
    ...config,
    openingHands: { p1: ["material-reclaim", "material-reclaim", "grave-return", "solar-knight", "war-chant"] },
    openingGraves: { p1: ["iron-guardian", "mirror-snare", "gale-mage"] }
  });
  const old = start(new DuelRoom({ code: "QA2345", createState, graveReturnTurnLimit: false }));
  submit(old, "p1", makeRecoveryAction(old, "p1", "iron-guardian", "material-reclaim"));
  submit(old, "p1", makeRecoveryAction(old, "p1", "mirror-snare", "material-reclaim"));
  const snapshot = old.toSnapshot();
  const restored = new DuelRoom({ code: old.code }).restoreSnapshot(snapshot);
  for (const seatId of ["p1", "p2"]) {
    restored.join({ name: seatId, connectionId: seatId, reconnectToken: old.seatForConnection(seatId).reconnectToken });
  }
  assert.deepEqual(restored.engine.getState(), snapshot.state);
  const last = makeRecoveryAction(restored, "p1", "gale-mage");
  const view = restored.viewFor("p1");
  assert.deepEqual(view.legalActions.unavailableHandActions[last.cardId], graveReturnLimit);
  assert.throws(() => submit(restored, "p1", last), blocked);
  submit(restored, "p1", endTurn);
  submit(restored, "p2", endTurn);
  submit(restored, "p1", last);
});

function fixedDamageOpening(extraDraws, graveReturnTurnLimit = true) {
  const opening = ["seer-call", "seer-call", "seer-call", "last-spark", "last-spark"];
  const draws = ["last-spark", "twin-summon", "ember-drake", "gale-mage",
    ...Array(3).fill("burst-rune"), ...Array(3).fill("flame-gale-burst"), "grave-return", ...extraDraws];
  const remaining = [...decks.burn.ids];
  for (const id of extraDraws) {
    if (id === "material-reclaim") remaining[remaining.indexOf("grave-return")] = id;
  }
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
      return createOnlineDuelState({ ...config, legacyBurstRuneDamage: true });
    } finally {
      Math.random = random;
    }
  };
  const room = start(new DuelRoom({ code: "QA2345", createState, graveReturnTurnLimit }),
    { ...decks.burn, ids: [...opening, ...draws, ...remaining] });
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

test("the online recovery limit blocks the known three-Star-Dust-Recovery opener", () => {
  const extraDraws = ["grave-return", "grave-return"];
  const baseline = fixedDamageOpening(extraDraws, false);
  for (let round = 0; round < 2; round += 1) {
    baseline.cast("grave-return", baseline.firstRune);
    baseline.cast("burst-rune");
  }
  assert.equal(baseline.room.viewFor("p1").gameOver.winnerId, "p1");
  assert.equal(baseline.room.viewFor("p1").players.p2.lp, 0);

  const trial = fixedDamageOpening(extraDraws);
  assert.throws(() => submit(trial.room, "p1", makeRecoveryAction(trial.room, "p1", "burst-rune")), blocked);
  assert.equal(trial.room.viewFor("p1").players.p2.lp, 600);
  assert.equal(trial.room.viewFor("p1").gameOver, null);

  const adjusted = fixedDamageOpening(["twin-summon", "ember-drake"]);
  assert.equal(adjusted.room.viewFor("p1").players.p2.lp, 400);
  for (const { room } of [baseline, trial, adjusted]) {
    assert.ok(!room.engine.getState().events.some(event => ["TURN_ENDED", "ATTACK_DECLARED"].includes(event.type)));
  }
});

test("the shared limit blocks the fixed opener that mixes both spells", () => {
  const extraDraws = ["material-reclaim", "material-reclaim"];
  const baseline = fixedDamageOpening(extraDraws, false);
  for (let round = 0; round < 2; round += 1) {
    baseline.cast("material-reclaim", baseline.firstRune);
    baseline.cast("burst-rune");
  }
  assert.equal(baseline.room.viewFor("p1").players.p2.lp, 0);
  assert.equal(baseline.room.viewFor("p1").gameOver.winnerId, "p1");

  const { room } = fixedDamageOpening(extraDraws);
  const second = makeRecoveryAction(room, "p1", "burst-rune", "material-reclaim");
  const view = room.viewFor("p1");
  assert.throws(() => submit(room, "p1", second), blocked);
  assert.deepEqual(room.viewFor("p1"), view);
  assert.equal(view.players.p2.lp, 600);
  assert.equal(view.gameOver, null);
  assert.ok(!room.engine.getState().events.some(event => ["TURN_ENDED", "ATTACK_DECLARED"].includes(event.type)));
  submit(room, "p1", endTurn);
  assert.equal(room.viewFor("p2").turn.playerId, "p2");
  assert.equal(room.viewFor("p2").players.p2.lp, 600);
});
