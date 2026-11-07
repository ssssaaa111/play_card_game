import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { buildSpectatorView } from "../src/duel-view.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { createDuelSessionConfig, ControllerKind, DuelMode } from "../src/duel-session.js";
import { deckPresets } from "../src/data.js";
import { spectatorCard, spectatorClock, spectatorStatus, spectatorTimeline } from "../src/spectator-ui.js";

function fixedState({ seatIds = ["p1", "p2"] } = {}) {
  const card = (id, uid) => ({ ...cardById(id), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
  const p1 = createDuelist("p1"), p2 = createDuelist("p2");
  p1.hand = [card("seer-call", "secret-one-hand")];
  p2.hand = [card("ember-drake", "secret-two-hand")];
  p1.field[0] = card("solar-knight", "attacker");
  p1.traps[0] = card("chain-nullifier", "secret-counter");
  p2.traps[0] = card("mirror-snare", "secret-mirror");
  for (const [id, player] of [["p1", p1], ["p2", p2]]) player.deck = Array.from({ length: 5 }, (_, i) => card("iron-guardian", `secret-${id}-deck-${i}`));
  return buildEngineStateFromUiState({ ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds, localPlayerId: "p1", controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
    cardDefinitionsComplete: true, p1, p2, turn: seatIds[0], phase: "battle", timing: "battleOpen", gameEvents: [] });
}
function roomWithPlayers(options = {}) {
  const room = new DuelRoom({ code: "ABC234", createState: fixedState, now: () => 10_000, ...options });
  room.join({ name: "星野", accountId: "private-account-one", connectionId: "one" });
  room.join({ name: "月见", accountId: "private-account-two", connectionId: "two" });
  return room;
}
function allow(room) { room.setSpectatorConsent("one", true); room.setSpectatorConsent("two", true); }
function start(room) { allow(room); room.setReady("one", true); room.setReady("two", true); }
function command(room, connectionId, action, commandId = "test") { return room.submit(connectionId, { revision: room.revision, commandId, action }); }

test("spectating is private by default and requires both players' explicit consent before ready", () => {
  const room = roomWithPlayers();
  assert.throws(() => room.watch("observer"), { code: "SPECTATING_CLOSED" });
  room.setSpectatorConsent("one", true);
  assert.throws(() => room.watch("observer"), { code: "SPECTATING_CLOSED" });
  room.setSpectatorConsent("two", true);
  const watched = room.watch("observer");
  assert.equal(watched.view.viewerRole, "spectator");
  assert.equal(watched.view.status, "waiting");
  assert.equal(watched.view.spectators.count, 1);
  room.setReady("one", true);
  assert.throws(() => room.setSpectatorConsent("one", false), { code: "CONSENT_LOCKED" });
  room.setReady("one", false); room.setSpectatorConsent("one", false);
  assert.equal(room.spectators.size, 0);
  assert.throws(() => room.spectatorView(), { code: "SPECTATING_CLOSED" });
  assert.throws(() => room.setSpectatorConsent("observer", true), { code: "NOT_IN_ROOM" });
  assert.throws(() => room.setSpectatorConsent("one", "true"), { code: "INVALID_CONSENT" });
});

test("spectator snapshots never include either hand deck order private deck choice or account credentials", () => {
  const room = roomWithPlayers();
  room.setDeck("one", { kind: "custom", name: "private-deck-name", ids: deckPresets.balanced.ids });
  start(room); room.watch("observer");
  const view = room.spectatorView(), serialized = JSON.stringify(view);
  for (const privateValue of ["secret-one-hand", "secret-two-hand", "secret-p1-deck", "secret-p2-deck", "secret-counter", "secret-mirror", "private-deck-name", "private-account-one", room.seats.get("p1").reconnectToken]) assert.ok(!serialized.includes(privateValue), privateValue);
  assert.equal(view.viewerSeatId, null);
  assert.equal(view.players.p1.monsterZone[0].name, "日冕骑士");
  for (const id of ["p1", "p2"]) {
    assert.ok(view.players[id].hand.every((card) => card.hidden && !card.templateId));
    assert.ok(view.players[id].spellTrapZone[0].hidden);
    assert.equal(view.players[id].deckCount, 5);
    assert.equal("deck" in view.players[id], false);
  }
  for (const key of ["legalActions", "attackResponse", "chainResponse", "summonResponse", "deckSelection", "cards"]) assert.equal(key in view, false, key);
});

test("forged viewer options and uncommitted chain metadata cannot reveal concealed cards", () => {
  const state = fixedState();
  state.machine.chain = [{ linkId: 1, playerId: "p1", cardId: "secret-one-hand", targetEffectId: "secret-p1-deck-0", committed: false, action: { secret: "private-action" } }];
  state.events.push({ id: 777, type: "CARDS_DRAWN", playerId: "p1", count: 1, cardIds: ["secret-one-hand"], action: { secret: "private-action" }, context: { cardId: "secret-one-hand" } });
  const view = buildSpectatorView(state, { viewerSeatId: "p1" });
  assert.equal(view.viewerSeatId, null);
  for (const value of ["secret-one-hand", "secret-p1-deck-0", "private-action"]) assert.ok(!JSON.stringify(view).includes(value));
  assert.deepEqual(view.recentEvents.at(-1), { id: 777, type: "CARDS_DRAWN", playerId: "p1", count: 1 });
});

test("public result and series metadata do not copy arbitrary engine or storage fields", () => {
  const state = fixedState();
  state.gameOver = { winnerId: "p1", loserIds: ["p2"], reason: "concede", internalNote: "private-result" };
  const view = buildSpectatorView(state, { series: { completed: 1, draws: 0, wins: { p1: 1, p2: 0, private: "private-score" }, internalNote: "private-series" } });
  for (const secret of ["private-result", "private-score", "private-series"]) assert.ok(!JSON.stringify(view).includes(secret));
  assert.deepEqual(view.gameOver, { winnerId: "p1", loserIds: ["p2"], reason: "concede" });
  assert.deepEqual(view.series, { completed: 1, draws: 0, wins: { p1: 1, p2: 0 } });
});

test("a trap becomes public only after it is committed and response candidates remain private", () => {
  const room = roomWithPlayers(); start(room); room.watch("observer");
  command(room, "one", { type: "DECLARE_ATTACK", attackerCardId: "attacker" }, "attack");
  assert.ok(!JSON.stringify(room.spectatorView()).includes("secret-mirror"));
  assert.equal(room.spectatorView().machine.responseWindow.playerId, "p2");
  command(room, "two", { type: "RESPOND_TRAP", cardId: "secret-mirror", declarationEventId: room.viewFor("p2").attackResponse.declarationEventId }, "mirror");
  let view = room.spectatorView();
  assert.equal(view.machine.chain[0].card.name, "镜光反制");
  assert.ok(!JSON.stringify(view).includes("secret-counter"));
  command(room, "one", { type: "RESPOND_CHAIN_TRAP", cardId: "secret-counter", triggerEventId: room.viewFor("p1").chainResponse.triggerEventId }, "counter");
  view = room.spectatorView();
  assert.equal(view.players.p2.lp, 2300);
  assert.equal(view.players.p1.monsterZone[0].used, true);
  assert.equal(view.machine.chainLength, 0);
  assert.ok(view.recentEvents.some((event) => event.type === "CHAIN_RESOLVED"));
});

test("spectator membership never consumes a seat changes revisions or pauses player clocks", () => {
  let now = 10_000;
  const room = roomWithPlayers({ now: () => now }); start(room);
  const revision = room.revision, state = room.engine.getState(), deadline = room.turnDeadlineAt;
  now = 11_000; room.watch("observer");
  assert.equal(room.seats.size, 2);
  assert.equal(room.revision, revision);
  assert.equal(room.turnDeadlineAt, deadline);
  assert.equal(room.disconnect("observer"), true);
  assert.equal(room.turnDeadlineAt, deadline);
  assert.ok(room.seatList().every((seat) => seat.connected));
  assert.deepEqual(room.engine.getState(), state);
  room.watch("observer");
  command(room, "one", { type: "DECLARE_ATTACK", attackerCardId: "attacker" });
  const responseDeadline = room.responseDeadlineAt;
  room.disconnect("observer");
  assert.equal(room.responseDeadlineAt, responseDeadline);
});

test("spectator commands cannot mutate cards ready state decks consent forfeits or rematches", () => {
  const room = roomWithPlayers(); start(room); room.watch("observer");
  const snapshot = room.toSnapshot();
  for (const mutate of [
    () => command(room, "observer", { type: "END_TURN", playerId: "p1" }),
    () => room.setDeck("observer", null), () => room.forfeit("observer"),
    () => room.setSpectatorConsent("observer", false), () => room.setReady("observer", true),
    () => room.requestRematch("observer")
  ]) assert.throws(mutate);
  assert.deepEqual(room.toSnapshot(), snapshot);
  assert.throws(() => room.watch("one"), { code: "ALREADY_JOINED" });
});

test("spectator capacity is bounded and duplicate joins do not inflate counts", () => {
  const room = roomWithPlayers(); allow(room);
  for (let i = 0; i < 20; i++) room.watch(`observer:${i}`);
  room.watch("observer:0");
  assert.equal(room.spectators.size, 20);
  assert.throws(() => room.watch("overflow"), { code: "SPECTATORS_FULL" });
  room.leave("observer:0"); room.watch("overflow");
  assert.equal(room.spectators.size, 20);
});

test("consent survives restart but live spectator connections are never persisted", () => {
  const room = roomWithPlayers(); start(room); room.watch("observer-private-connection");
  const snapshot = room.toSnapshot();
  assert.ok(!JSON.stringify(snapshot).includes("observer-private-connection"));
  const restored = new DuelRoom({ code: room.code }).restoreSnapshot(snapshot);
  assert.equal(restored.spectatingAllowed(), true);
  assert.equal(restored.spectators.size, 0);
  assert.equal(restored.spectatorView().turnTimer.paused, true);
  const legacy = structuredClone(snapshot); legacy.seats.forEach((seat) => { delete seat.spectatorConsent; });
  assert.equal(new DuelRoom({ code: room.code }).restoreSnapshot(legacy).spectatingAllowed(), false);
});

test("same-room rematches retain consent and public series without spectator intervention", () => {
  const room = roomWithPlayers(); start(room); room.watch("observer");
  room.forfeit("one");
  assert.equal(room.spectatorView().gameOver.winnerId, "p2");
  room.requestRematch("one"); room.requestRematch("two");
  const view = room.spectatorView();
  assert.equal(view.duelNumber, 2);
  assert.equal(view.turn.playerId, "p2");
  assert.equal(view.spectators.count, 1);
  assert.equal(view.series.wins.p2, 1);
  assert.throws(() => room.setSpectatorConsent("one", false), { code: "CONSENT_LOCKED" });
});

test("leaving a non-playing room revokes access instead of leaving viewers attached", () => {
  const room = roomWithPlayers(); allow(room); room.watch("observer");
  room.leave("one");
  assert.equal(room.spectators.size, 0);
  assert.equal(room.spectatingAllowed(), false);
});

test("spectator UI keeps player names neutral clocks paused and hidden cards detail-free", () => {
  assert.equal(spectatorCard({ hidden: true, name: "private" }), null);
  assert.equal(spectatorClock({ paused: true, remainingMs: 42_000 }, 999_999), "0:42（暂停）");
  assert.equal(spectatorClock({ paused: false, deadlineAt: 10_501 }, 10_000), "0:01");
  const room = roomWithPlayers(); start(room); room.watch("observer");
  const view = room.spectatorView();
  assert.match(spectatorStatus(view), /星野的回合/);
  room.disconnect("two");
  assert.match(spectatorStatus(room.spectatorView()), /暂停/);
  room.forfeit("one");
  assert.equal(spectatorStatus(room.spectatorView()), "月见获胜");
  const timeline = spectatorTimeline({ ...view, recentEvents: [{ id: 1, type: "TRAP_SET", playerId: "p2", cardId: "secret-mirror" }] });
  assert.deepEqual(timeline, [{ id: 1, text: "月见盖放 1 张卡牌" }]);
});
