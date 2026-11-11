import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuelRoom } from "../server/duel-room.js";
import { DuelRoomStore } from "../server/duel-room-store.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { ControllerKind, DuelMode, createDuelSessionConfig } from "../src/duel-session.js";
import { deckPresets } from "../src/data.js";

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "star-duel-rooms-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filePath = join(directory, "rooms.json");
  let now = 10_000;
  const settings = { filePath, now: () => now, createRoom: (config) => new DuelRoom({ ...config, now: () => now, ...options }) };
  const store = new DuelRoomStore(settings), room = store.create();
  const first = room.join({ name: "一", accountId: "account-one", connectionId: "one" });
  const second = room.join({ name: "二", accountId: "account-two", connectionId: "two" });
  const resume = (restored, seat = "both") => {
    if (seat !== "p2") restored.join({ name: "ignored", accountId: "account-one", connectionId: "one-new", reconnectToken: first.reconnectToken });
    if (seat !== "p1") restored.join({ name: "ignored", accountId: "account-two", connectionId: "two-new", reconnectToken: second.reconnectToken });
  };
  return { directory, filePath, settings, store, room, first, second, resume,
    setNow(value) { now = value; }, reload() { return new DuelRoomStore(settings).require(room.code); } };
}
function start(room) { room.setReady("one", true); room.setReady("two", true); }
function submit(room, connection, action, commandId = "saved-command") {
  return room.submit(connection, { revision: room.revision, commandId, action });
}

test("waiting rooms retain private custom decks and readiness without old connection handles", (t) => {
  const f = fixture(t);
  f.room.setDeck("one", { kind: "custom", name: "私有卡组", ids: deckPresets.balanced.ids });
  f.room.setReady("one", true);
  f.store.save();
  const saved = JSON.parse(readFileSync(f.filePath));
  assert.ok(!Object.hasOwn(saved.rooms[0].seats[0], "connectionId"));
  const restored = f.reload();
  assert.equal(restored.viewFor("p1").deckSelection.name, "私有卡组");
  assert.equal(restored.viewFor("p1").seats[0].ready, true);
  assert.ok(restored.viewFor("p1").seats.every((seat) => !seat.connected));
  assert.ok(!JSON.stringify(restored.viewFor("p2")).includes("私有卡组"));
  assert.ok(!JSON.stringify(restored.viewFor("p2")).includes(f.first.reconnectToken));
  assert.throws(() => restored.setReady("one", false), { code: "NOT_IN_ROOM" });
  assert.throws(() => restored.join({ name: "伪装", accountId: "account-two", connectionId: "evil", reconnectToken: f.first.reconnectToken }), { code: "ACCOUNT_MISMATCH" });
  f.resume(restored);
  restored.setReady("two-new", true);
  assert.equal(restored.status, "playing");
  assert.equal(restored.viewFor("p1").players.p1.deckCount, 51);
});

test("restart preserves card order events and receipts while excluding downtime from the turn clock", (t) => {
  const f = fixture(t, { createState: (options) => createOnlineDuelState({ ...options, openingHands: { p1: ["solar-knight", "iron-guardian", "void-hound", "gale-mage", "twin-summon"] } }) });
  start(f.room);
  const action = f.room.viewFor("p1").legalActions.actions.summon[0];
  const receipt = submit(f.room, "one", action);
  f.setNow(13_000);
  const expected = f.room.engine.getState();
  f.store.save();
  f.setNow(3_613_000);
  const restored = f.reload();
  assert.deepEqual(restored.engine.getState(), expected);
  assert.equal(restored.viewFor("p1").turnTimer.remainingMs, 87_000);
  assert.equal(restored.expireTurnTimeout(), false);
  assert.equal(restored.expireDisconnectTimeout(), false);
  assert.ok(restored.viewFor("p2").players.p1.hand.every((card) => card.hidden));
  assert.ok(restored.revision > receipt.revision);
  f.resume(restored, "p1");
  assert.equal(restored.viewFor("p1").turnTimer.paused, true);
  assert.throws(() => submit(restored, "one-new", { type: "END_TURN" }, "blocked"), { code: "OPPONENT_DISCONNECTED" });
  f.setNow(3_615_000); f.resume(restored, "p2");
  assert.equal(restored.viewFor("p1").turnTimer.deadlineAt, 3_702_000);
  const before = restored.engine.getState();
  assert.deepEqual(restored.submit("one-new", { revision: receipt.revision - 1, commandId: receipt.commandId, action }), { ...receipt, duplicate: true });
  assert.deepEqual(restored.engine.getState(), before);
  assert.throws(() => restored.submit("one-new", { revision: receipt.revision, commandId: "old-choice", action: { type: "END_TURN" } }), { code: "STALE_REVISION" });
});

test("equipment receipts restore their engine effect IDs without applying the bonus twice", (t) => {
  const f = fixture(t, { createState: options => createOnlineDuelState({ ...options, openingHands: {
    p1: ["solar-knight", "blade-sigil", "iron-guardian", "gale-mage", "twin-summon"]
  } }) });
  start(f.room);
  const summon = f.room.viewFor("p1").legalActions.actions.summon.find(action => action.index === 0);
  submit(f.room, "one", summon, "summon-before-equipment");
  const action = f.room.viewFor("p1").legalActions.actions.activateCard.find(action => action.targetCardId === summon.cardId);
  const receipt = submit(f.room, "one", action, "saved-equipment");
  assert.ok(receipt.eventIds.some(id => typeof id === "string" && id.startsWith("continuous:")));
  f.store.save();
  const restored = f.reload();
  f.resume(restored);
  const before = restored.engine.getState();
  assert.equal(restored.viewFor("p1").players.p1.monsterZone[0].tempAtk, 300);
  assert.deepEqual(restored.submit("one-new", { revision: receipt.revision - 1, commandId: receipt.commandId, action }), { ...receipt, duplicate: true });
  assert.deepEqual(restored.engine.getState(), before);
  const invalid = restored.toSnapshot();
  invalid.commandReceipts.find(([, entry]) => entry.commandId === receipt.commandId)[1].eventIds.push("continuous:unknown-card");
  assert.throws(() => new DuelRoom({ code: restored.code }).restoreSnapshot(invalid), { code: "INVALID_ROOM_SNAPSHOT" });
});

function chainState() {
  const card = (id, uid) => ({ ...cardById(id), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
  const p1 = createDuelist("p1"), p2 = createDuelist("p2");
  p1.field[0] = card("solar-knight", "attacker");
  p1.traps[0] = card("chain-nullifier", "counter");
  p2.traps[0] = card("mirror-snare", "mirror");
  for (const [id, player] of [["p1", p1], ["p2", p2]]) player.deck = Array.from({ length: 5 }, (_, i) => card("iron-guardian", `${id}:deck:${i}`));
  return buildEngineStateFromUiState({ ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds: ["p1", "p2"], localPlayerId: "p1", controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
    cardDefinitionsComplete: true, p1, p2, turn: "p1", phase: "battle", timing: "battleOpen", gameEvents: [] });
}

test("an unresolved chain survives restart with private priority and only its remaining response time", (t) => {
  const f = fixture(t, { createState: chainState, responseTimeoutMs: 15_000 });
  start(f.room);
  submit(f.room, "one", { type: "DECLARE_ATTACK", attackerCardId: "attacker" }, "declare");
  submit(f.room, "two", { type: "RESPOND_TRAP", cardId: "mirror", declarationEventId: f.room.viewFor("p2").attackResponse.declarationEventId }, "mirror-response");
  f.setNow(22_000); f.store.save();
  const state = f.room.engine.getState();
  f.setNow(1_000_000);
  const restored = f.reload();
  assert.deepEqual(restored.engine.getState(), state);
  assert.equal(restored.responseTimeoutView().remainingMs, 3_000);
  assert.equal(restored.expireAttackResponse(), false);
  assert.equal(restored.viewFor("p1").chainResponse.candidates[0].cardId, "counter");
  assert.equal(restored.viewFor("p2").chainResponse, null);
  f.resume(restored);
  assert.equal(restored.responseTimeoutView().deadlineAt, 1_003_000);
  const view = restored.viewFor("p1");
  submit(restored, "one-new", { type: "RESPOND_CHAIN_TRAP", cardId: "counter", triggerEventId: view.chainResponse.triggerEventId }, "counter-response");
  assert.equal(restored.viewFor("p1").players.p2.lp, 2300);
  assert.equal(restored.viewFor("p1").players.p1.monsterZone[0].id, "attacker");
  assert.equal(restored.responseTimeoutView(), null);
});

test("restored players receive a fresh finite reconnect grace rather than a downtime loss", (t) => {
  const f = fixture(t, { disconnectGraceMs: 5_000 }); start(f.room); f.store.save();
  f.setNow(1_000_000); const restored = f.reload();
  assert.equal(restored.disconnectTimeoutDelay(), 5_000);
  f.resume(restored, "p1"); f.setNow(1_005_000);
  assert.equal(restored.expireDisconnectTimeout(), true);
  assert.equal(restored.viewFor("p1").gameOver.winnerId, "p1");
  assert.equal(restored.expireDisconnectTimeout(), false);
  assert.equal(restored.series.completed, 1);
});

test("finished results and one accepted rematch survive a second service instance", (t) => {
  const f = fixture(t);
  f.room.setDeck("one", { kind: "preset", id: "balanced" });
  start(f.room); f.room.forfeit("one"); f.room.requestRematch("one"); f.store.save();
  const restored = f.reload(); f.resume(restored);
  assert.deepEqual(restored.series, { completed: 1, draws: 0, wins: { p1: 0, p2: 1 } });
  assert.equal(restored.seats.get("p1").ready, true);
  restored.requestRematch("two-new");
  assert.equal(restored.duelNumber, 2);
  assert.equal(restored.viewFor("p1").turn.playerId, "p2");
  assert.equal(restored.viewFor("p1").players.p1.deckCount, 51);
  restored.forfeit("two-new");
  assert.equal(restored.series.completed, 2);
});

test("store expiry uses saved activity time and ignores incomplete temporary writes", (t) => {
  const f = fixture(t); f.store.save();
  writeFileSync(`${f.filePath}.tmp`, "interrupted write");
  assert.equal(f.reload().code, f.room.code);
  f.setNow(10_000 + 6 * 60 * 60 * 1000 + 1);
  assert.equal(new DuelRoomStore(f.settings).rooms.size, 0);
});

test("corrupt incompatible or inconsistent snapshots fail closed without overwriting the file", (t) => {
  const f = fixture(t); start(f.room); f.store.save();
  const original = JSON.parse(readFileSync(f.filePath));
  const cases = ["not json", JSON.stringify({ version: 99, rooms: [] }), ...[
    (s) => { s.seats[1].accountId = s.seats[0].accountId; },
    (s) => { s.seats[1].reconnectToken = s.seats[0].reconnectToken; },
    (s) => { s.state.turn.playerId = "missing"; },
    (s) => { s.turnTimer.remainingMs = -1; },
    (s) => { s.turnTimer.playerId = "p2"; },
    (s) => { s.series.completed = 999; },
    (s) => { s.seats[0].deck = { kind: "custom", ids: ["missing"] }; }
  ].map((mutate) => { const data = structuredClone(original); mutate(data.rooms[0]); return JSON.stringify(data); })];
  for (const content of cases) {
    writeFileSync(f.filePath, content);
    assert.throws(() => new DuelRoomStore(f.settings), { code: "ROOM_STORAGE_FAILED" });
    assert.equal(readFileSync(f.filePath, "utf8"), content);
  }
});

test("write failures are explicit and memory-only stores remain supported for deterministic tests", (t) => {
  const f = fixture(t); mkdirSync(f.filePath);
  assert.throws(() => f.store.save(), { code: "ROOM_STORAGE_FAILED" });
  const memory = new DuelRoomStore(); memory.create();
  assert.equal(memory.save(), false);
});

test("snapshot objects do not share mutable card or deck references with the live room", (t) => {
  const f = fixture(t); start(f.room);
  const snapshot = f.room.toSnapshot();
  snapshot.state.players.p1.lp = 1; snapshot.seats[0].name = "changed";
  assert.equal(f.room.viewFor("p1").players.p1.lp, 4000);
  assert.equal(f.room.seats.get("p1").name, "一");
});
