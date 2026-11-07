import test from "node:test";
import assert from "node:assert/strict";
import { deckPresets } from "../src/data.js";
import { normalizeOnlineDeckChoice, onlineDeckOptions } from "../src/online-decks.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { DuelRoom } from "../server/duel-room.js";

const custom = () => ({ kind: "custom", name: "我的均衡", ids: [...deckPresets.balanced.ids] });
const preset = (id) => ({ kind: "preset", id });
function waitingRoom() {
  const room = new DuelRoom({ code: "ABC234" });
  const p1 = room.join({ name: "一", connectionId: "c1" });
  room.join({ name: "二", connectionId: "c2" });
  return { room, p1 };
}
function allDeckIds(state, seatId) {
  const player = state.players[seatId];
  return [...player.deck, ...player.hand].map((id) => state.cards[id].templateId).sort();
}

test("online choices validate the full custom deck and copy only trusted definition ids", () => {
  const choice = custom();
  const result = normalizeOnlineDeckChoice({ ...choice, atk: 999999, playerId: "p2" });
  assert.deepEqual(result, choice);
  choice.ids[0] = "missing";
  assert.notEqual(result.ids[0], "missing");
  assert.equal(normalizeOnlineDeckChoice(null), null);
});

test("online deck validation rejects malformed sizes unknown ids duplicate copies and tokens", () => {
  for (const choice of [
    "balanced", [], {}, { kind: "custom", ids: null },
    { ...custom(), ids: Array(61).fill("ember-drake") },
    { ...custom(), ids: ["ember-drake"] },
    { ...custom(), ids: [...deckPresets.balanced.ids, "missing"] },
    { ...custom(), ids: [...deckPresets.balanced.ids, ...Array(4).fill("solar-knight")] },
    { ...custom(), ids: [...deckPresets.balanced.ids, "spark-fragment-token"] },
    preset("trioOmegaRivalFull"), preset("missing"), preset("__proto__")
  ]) {
    assert.throws(() => normalizeOnlineDeckChoice(choice), (error) => error.code === "INVALID_DECK");
  }
});

test("preset card definitions are resolved on the server rather than trusted from the client", () => {
  const result = normalizeOnlineDeckChoice({ ...preset("balanced"), ids: ["missing"], name: "forged" });
  assert.deepEqual(result.ids, deckPresets.balanced.ids);
  assert.equal(result.name, deckPresets.balanced.label);
});

test("online deck choices include local saved decks and player presets without internal presets", () => {
  const options = onlineDeckOptions([{ id: "custom:test", name: "本地牌组", ids: deckPresets.balanced.ids }]);
  assert.equal(options[0].value, "default");
  assert.ok(options.some((option) => option.value === "preset:aggressive"));
  assert.ok(!options.some((option) => option.value === "preset:trioOmegaRivalFull"));
  assert.deepEqual(options.at(-1).choice, { ...custom(), name: "本地牌组" });
});

test("two players use their complete chosen decks with no truncation filtering or inserted cards", () => {
  const state = createOnlineDuelState({ deckChoices: { p1: custom(), p2: preset("aggressive") } });
  assert.deepEqual(allDeckIds(state, "p1"), [...deckPresets.balanced.ids].sort());
  assert.deepEqual(allDeckIds(state, "p2"), [...deckPresets.aggressive.ids].sort());
  assert.equal(state.players.p1.deck.length, 51);
  assert.equal(state.players.p2.deck.length, 45);
  assert.equal(state.players.p1.hand.length, 5);
  assert.equal(state.players.p2.hand.length, 5);
});

test("40 and 60 card custom decks retain every copy at both size boundaries", () => {
  const small = { kind: "custom", name: "最小卡组", ids: deckPresets.basicExpansion.ids.slice(0, 40) };
  const large = { kind: "custom", name: "最大卡组", ids: [...deckPresets.balanced.ids,
    "solar-vanguard", "solar-vanguard", "starfall-colossus", "starfall-colossus"] };
  const state = createOnlineDuelState({ deckChoices: { p1: small, p2: large } });
  assert.deepEqual(allDeckIds(state, "p1"), [...small.ids].sort());
  assert.deepEqual(allDeckIds(state, "p2"), [...large.ids].sort());
  assert.equal(state.players.p1.deck.length, 35);
  assert.equal(state.players.p2.deck.length, 55);
});

test("a deterministic QA opening cannot inject cards into an explicit player deck", () => {
  assert.throws(() => createOnlineDuelState({
    deckChoices: { p1: custom() }, openingHands: { p1: ["solar-vanguard"] }
  }), /absent from the selected deck/);
});

test("only the owning seat receives its selected deck and invalid submissions leave the room unchanged", () => {
  const { room } = waitingRoom();
  room.setDeck("c1", custom());
  const own = room.viewFor("p1");
  assert.equal(own.deckSelection.name, "我的均衡");
  assert.equal(own.deckSelection.count, 56);
  assert.equal(own.deckSelection.locked, false);
  const rival = room.viewFor("p2");
  assert.ok(!JSON.stringify(rival).includes("我的均衡"));
  assert.ok(!JSON.stringify(rival).includes("solar-knight"));
  assert.deepEqual(rival.deckSelection.choice, null);
  assert.throws(() => room.setDeck("c1", { ...custom(), ids: ["missing"] }));
  assert.deepEqual(room.viewFor("p1"), own);
  assert.throws(() => room.setDeck("outsider", custom()), (error) => error.code === "NOT_IN_ROOM");
});

test("ready locks a deck until readiness is cancelled and play rejects further changes", () => {
  const { room } = waitingRoom();
  room.setDeck("c1", custom());
  room.setReady("c1", true);
  const ready = room.viewFor("p1");
  assert.equal(ready.deckSelection.locked, true);
  assert.throws(() => room.setDeck("c1", preset("aggressive")), (error) => error.code === "DECK_LOCKED");
  assert.deepEqual(room.viewFor("p1"), ready);
  room.setReady("c1", false);
  room.setDeck("c1", preset("aggressive"));
  room.setDeck("c2", custom());
  room.setReady("c1", true);
  room.setReady("c2", true);
  assert.equal(room.status, "playing");
  assert.equal(room.viewFor("p1").players.p1.deckCount, 45);
  assert.equal(room.viewFor("p2").players.p2.deckCount, 51);
  assert.throws(() => room.setDeck("c2", null), (error) => error.code === "DECK_LOCKED");
});

test("reconnect and rematch preserve each seat's private deck despite the first-player swap", () => {
  const { room, p1 } = waitingRoom();
  room.setDeck("c1", custom());
  room.setDeck("c2", preset("aggressive"));
  room.setReady("c1", true);
  room.setReady("c2", true);
  room.disconnect("c1");
  room.join({ name: "ignored", connectionId: "c1b", reconnectToken: p1.reconnectToken });
  assert.equal(room.viewFor("p1").deckSelection.count, 56);
  room.forfeit("c1b");
  room.requestRematch("c1b");
  room.requestRematch("c2");
  assert.equal(room.viewFor("p1").turn.playerId, "p2");
  assert.equal(room.viewFor("p1").players.p1.deckCount, 51);
  assert.equal(room.viewFor("p2").players.p2.deckCount, 45);
  assert.equal(room.viewFor("p1").deckSelection.name, "我的均衡");
});
