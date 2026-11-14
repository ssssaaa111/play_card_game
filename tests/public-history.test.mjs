import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { newPublicHistory, appendPublicHistory, historyPage, restorePublicHistories } from "../server/public-history.js";
import { reportText } from "../src/public-report.js";

function room() {
  const value = new DuelRoom({ code: "ABC234", now: () => 10000 });
  const first = value.join({ name: "甲", accountId: "secret-account-a", connectionId: "one" });
  const second = value.join({ name: "乙", accountId: "secret-account-b", connectionId: "two" });
  value.setSpectatorConsent("one", true); value.setSpectatorConsent("two", true);
  value.setReady("one", true); value.setReady("two", true);
  return { value, first, second };
}
function end(value, id, commandId) { value.submit(id, { revision: value.revision, commandId, action: { type: "END_TURN" } }); }

test("long public history reaches the opening after 100 turns and is not broadcast with live views", () => {
  const { value } = room();
  // Refill private decks through a deterministic fixture, not via an online command.
  // Repeating the real end-turn path over many fresh games is covered separately;
  // use turn events here to isolate history length from natural deck-out.
  const state = value.engine.getState();
  const history = newPublicHistory(1, value.seatList(), state);
  for (let i = 0; i < 100; i++) state.events.push({ id: 10000 + i, type: "TURN_STARTED", playerId: i % 2 ? "p2" : "p1" });
  appendPublicHistory(history, state);
  assert.equal(historyPage(history).entries[0].type, "DUEL_STARTED");
  assert.equal(historyPage(history, { turn: 101 }).entries.length, 1);
  assert.equal(historyPage(history).pageSize, 50);
  assert.equal(historyPage(history, { page: 2 }).entries.at(-1).turn, 101);
  assert.equal("publicHistories" in value.viewFor("p1"), false);
  assert.equal("publicHistories" in value.spectatorView(), false);
});

test("historical draw and set records stay anonymous after a card later becomes public", () => {
  const state = { cards: { secret: { name: "秘密陷阱", type: "trap" }, drawn: { name: "秘密手牌", type: "monster" } },
    players: { p1: { hand: ["drawn"], deck: ["secret"], monsterZone: [], grave: [], banished: [], spellTrapZone: ["secret"] }, p2: { monsterZone: [], spellTrapZone: [], grave: [], banished: [] } },
    machine: { chain: [] }, events: [] };
  const history = newPublicHistory(1, [{ seatId: "p1", name: "甲" }, { seatId: "p2", name: "乙" }], state);
  state.events.push({ id: 1, type: "CARDS_DRAWN", playerId: "p1", cardIds: ["drawn"], context: { private: "secret" } },
    { id: 2, type: "TRAP_SET", playerId: "p1", cardId: "secret", name: "秘密陷阱" });
  appendPublicHistory(history, state);
  const before = JSON.stringify(history.entries);
  assert.ok(!before.includes("秘密陷阱") && !before.includes("秘密手牌"));
  state.players.p1.spellTrapZone = []; state.players.p1.grave.push("secret");
  state.events.push({ id: 3, type: "CARD_ACTIVATED", playerId: "p1", cardId: "secret" });
  appendPublicHistory(history, state);
  assert.equal(JSON.stringify(history.entries.slice(0, -1)), before);
  assert.match(history.entries.at(-1).text, /秘密陷阱/);
  assert.ok(history.entries.every((entry) => !Object.hasOwn(entry, "cardId") && !Object.hasOwn(entry, "context")));
});

test("reading pages is authorized read-only and spectators receive exactly the same public text", () => {
  const { value } = room(); value.watch("watcher");
  const before = value.toSnapshot();
  assert.deepEqual(value.publicHistoryFor("one"), value.publicHistoryFor("watcher"));
  assert.deepEqual(value.toSnapshot(), before);
  assert.throws(() => value.publicHistoryFor("stranger"), { code: "NOT_IN_ROOM" });
  for (const query of [{ page: -1 }, { turn: "1" }, { through: 1.5 }, { duelNumber: 999 }, { page: NaN }]) assert.throws(() => value.publicHistoryFor("one", query));
  const text = JSON.stringify(value.publicHistoryFor("one"));
  for (const secret of ["secret-account-a", value.seats.get("p1").reconnectToken, ...value.engine.getState().players.p1.hand]) assert.ok(!text.includes(secret));
});

test("rematches preserve previous reports and restart resumes without duplicate records", () => {
  const { value, first, second } = room(); end(value, "one", "first-turn"); value.forfeit("two");
  const before = value.publicHistoryFor("one");
  value.requestRematch("one"); value.requestRematch("two");
  assert.equal(value.publicHistoryFor("one").duelNumber, 2);
  assert.deepEqual(value.publicHistoryFor("one", { duelNumber: 1 }).entries, before.entries);
  const restored = new DuelRoom({ code: value.code, now: () => 10000 }).restoreSnapshot(value.toSnapshot());
  restored.join({ name: "甲", accountId: "secret-account-a", connectionId: "again-one", reconnectToken: first.reconnectToken });
  restored.join({ name: "乙", accountId: "secret-account-b", connectionId: "again-two", reconnectToken: second.reconnectToken });
  assert.deepEqual(restored.publicHistoryFor("again-one", { duelNumber: 1 }).entries, before.entries);
  const snapshot = restored.toSnapshot();
  const twice = new DuelRoom({ code: value.code, now: () => 10000 }).restoreSnapshot(snapshot);
  assert.deepEqual(twice.publicHistories, restored.publicHistories);
});

test("legacy snapshots are explicitly partial and never backfill names from current cards", () => {
  const { value } = room(); end(value, "one", "legacy");
  const snapshot = value.toSnapshot(); delete snapshot.publicHistories;
  const restored = new DuelRoom({ code: value.code, now: () => 10000 }).restoreSnapshot(snapshot);
  assert.equal(restored.publicHistories[0].partial, true);
  assert.equal(restored.publicHistories[0].entries.length, 1);
});

test("pagination export is stable while later actions append and files contain only public text", () => {
  const state = { players: {}, cards: {}, machine: {}, events: [] };
  const history = newPublicHistory(1, [{ seatId: "p1", name: "甲" }, { seatId: "p2", name: "乙" }], state);
  for (let i = 0; i < 150; i++) state.events.push({ type: "TURN_STARTED", playerId: "p1" });
  appendPublicHistory(history, state);
  const first = historyPage(history);
  state.events.push({ type: "TRAP_SET", playerId: "p2", cardId: "must-not-export" }); appendPublicHistory(history, state);
  const entries = [...first.entries];
  for (let page = 1; page < first.pages; page++) entries.push(...historyPage(history, { page, through: first.total }).entries);
  assert.equal(entries.length, first.total);
  assert.equal(new Set(entries.map((entry) => entry.seq)).size, first.total);
  const text = reportText({ ...first, roomCode: "ABC234" }, entries);
  assert.match(text, /#1 · 第 1 回合/); assert.ok(!text.includes("must-not-export"));
});

test("restore validates record schema and strips unknown private metadata", () => {
  const { value } = room(); const saved = value.publicHistories;
  const extra = structuredClone(saved); extra[0].private = "never"; extra[0].entries[0].cardIds = ["never"];
  assert.ok(!JSON.stringify(restorePublicHistories(extra, 1)).includes("never"));
  const malformed = structuredClone(saved); malformed[0].entries[0].seq = 99;
  assert.throws(() => restorePublicHistories(malformed, 1));
});

test("summoning does not create a misleading duplicate monster activation line", () => {
  const state = { players: { p1: { lp: 4000, monsterZone: ["m"] }, p2: { lp: 4000 } }, cards: { m: { name: "骑士", type: "monster" } }, events: [
    { type: "CARD_ACTIVATED", playerId: "p1", cardId: "m" }, { type: "MONSTER_SUMMONED", playerId: "p1", cardId: "m" }
  ] };
  const history = newPublicHistory(1, [], state); appendPublicHistory(history, state);
  assert.equal(history.entries.length, 2); assert.match(history.entries[1].text, /召唤《骑士》/);
});

test("a later public summon in the same command cannot identify an earlier private draw", () => {
  const state = { players: { p1: { lp: 4000, monsterZone: ["drawn"] }, p2: { lp: 4000 } }, cards: { drawn: { name: "后来公开的怪兽", type: "monster" } }, events: [
    { type: "CARDS_DRAWN", playerId: "p1", cardIds: ["drawn"] },
    { type: "CARD_MOVED", cardId: "drawn", from: { playerId: "p1", zone: "deck" }, to: { playerId: "p1", zone: "hand" } },
    { type: "MONSTER_SUMMONED", playerId: "p1", cardId: "drawn" }
  ] };
  const history = newPublicHistory(1, [], state); appendPublicHistory(history, state);
  assert.ok(!history.entries.some((entry) => entry.type === "CARD_MOVED"));
  assert.ok(!history.entries.find((entry) => entry.type === "CARDS_DRAWN").text.includes("后来公开"));
  assert.match(history.entries.at(-1).text, /召唤《后来公开的怪兽》/);
});
