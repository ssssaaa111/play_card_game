import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { WebSocket } from "ws";

import { DuelClientMessage, DuelServerMessage } from "../src/duel-command.js";

const serverUrl = process.env.DUEL_SERVER_URL || "ws://127.0.0.1:5178/duel";
const responseScenario = process.argv.includes("--scenario=trap-response");
const authBaseUrl = (() => {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
})();

async function registerSmokeAccount(name) {
  const handle = `smoke_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const response = await fetch(`${authBaseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password: "smoke-pass-1", displayName: name })
  });
  const body = await response.json();
  assert.equal(response.status, 201, body.error?.message || "smoke account registration failed");
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  assert.match(cookie, /^star_duel_session=/);
  return cookie;
}

class SmokeClient {
  constructor(name, cookie) {
    this.name = name;
    this.cookie = cookie;
    this.socket = null;
    this.pending = new Map();
    this.view = null;
    this.viewWaiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(serverUrl, { headers: { Cookie: this.cookie } });
      this.socket = socket;
      socket.once("open", resolve);
      socket.once("error", reject);
      socket.on("message", (raw) => this.onMessage(JSON.parse(raw.toString("utf8"))));
    });
  }

  onMessage(message) {
    if (message.type === DuelServerMessage.roomState) {
      this.view = message.data;
      const ready = this.viewWaiters.filter((waiter) => waiter.predicate(this.view));
      this.viewWaiters = this.viewWaiters.filter((waiter) => !ready.includes(waiter));
      ready.forEach((waiter) => {
        clearTimeout(waiter.timer);
        waiter.resolve(this.view);
      });
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.type === DuelServerMessage.error) {
      const error = new Error(message.error?.message || "Request failed");
      error.code = message.error?.code;
      pending.reject(error);
    } else {
      pending.resolve(message.data);
    }
  }

  request(type, payload = {}) {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${this.name} request timed out: ${type}`));
      }, 8_000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type, requestId, payload }));
    });
  }

  waitForView(predicate) {
    if (this.view && predicate(this.view)) return Promise.resolve(this.view);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.viewWaiters = this.viewWaiters.filter((entry) => entry !== waiter);
        reject(new Error(`${this.name} state update timed out`));
      }, 8_000);
      this.viewWaiters.push(waiter);
    });
  }

  close() {
    this.socket?.close();
  }
}
const firstCookie = await registerSmokeAccount("星野");
const secondCookie = await registerSmokeAccount("月见");
const first = new SmokeClient("first", firstCookie);
const second = new SmokeClient("second", secondCookie);
const resumed = new SmokeClient("resumed", secondCookie);

try {
  await Promise.all([first.connect(), second.connect()]);
  const created = await first.request(DuelClientMessage.createRoom, { name: "星野" });
  const joined = await second.request(DuelClientMessage.joinRoom, { roomCode: created.roomCode, name: "月见" });
  assert.equal(created.seatId, "p1");
  assert.equal(joined.seatId, "p2");

  await first.request(DuelClientMessage.setReady, { ready: true });
  await second.request(DuelClientMessage.setReady, { ready: true });
  const firstStart = await first.waitForView((view) => view.status === "playing");
  const secondStart = await second.waitForView((view) => view.status === "playing");
  assert.ok(firstStart.players.p1.hand.every((card) => !card.hidden));
  assert.ok(secondStart.players.p1.hand.every((card) => card.hidden));

  const summon = firstStart.legalActions.actions.summon[0];
  if (responseScenario) assert.ok(summon, "the fixed scenario must provide a summon action");
  let firstAfterSummon = firstStart;
  // Random legal openings need not contain a summonable monster.
  if (summon) {
    await first.request(DuelClientMessage.command, { revision: firstStart.revision, commandId: "smoke-summon-1", action: summon });
    const secondAfterSummon = await second.waitForView((view) => view.revision > secondStart.revision && view.players.p1.monsterZone.some(Boolean));
    assert.ok(secondAfterSummon.players.p1.monsterZone.find(Boolean)?.name);
    firstAfterSummon = await first.waitForView((view) => view.revision === secondAfterSummon.revision);
  }
  await first.request(DuelClientMessage.command, {
    revision: firstAfterSummon.revision,
    commandId: "smoke-end-1",
    action: { type: "END_TURN" }
  });
  const secondTurn = await second.waitForView((view) => view.turn.playerId === "p2" && view.turn.phase === "main");
  assert.equal(secondTurn.players.p2.handCount, 6);

  let commandSequence = 0;
  const command = async (client, action) => {
    const receipt = await client.request(DuelClientMessage.command, { revision: client.view.revision, commandId: `smoke-response:${commandSequence++}`, action });
    await Promise.all([first.waitForView((view) => view.revision >= receipt.revision), client.waitForView((view) => view.revision >= receipt.revision)]);
    return receipt;
  };
  let pendingAttack = null;
  const secondSummon = secondTurn.legalActions.actions.summon[0];
  assert.ok(secondSummon, "2P must receive a summon action on their own turn");
  await command(second, { ...secondSummon, index: 4 });
  assert.equal(second.view.players.p2.monsterZone[4]?.id, secondSummon.cardId);
  assert.equal(first.view.players.p2.monsterZone[4]?.id, secondSummon.cardId);
  if (responseScenario) {
    const mirror = secondTurn.players.p2.hand.find((card) => card.templateId === "mirror-snare");
    assert.ok(mirror, "fixed scenario must include mirror-snare");
    await command(second, { type: "SET_TRAP", cardId: mirror.id, index: 2 });
    assert.equal(first.view.players.p2.spellTrapZone[2].hidden, true);
    await command(second, { type: "END_TURN" });
    await command(first, { type: "CHANGE_PHASE", phase: "battle" });
    await command(first, first.view.legalActions.actions.declareAttack[0]);
    await second.waitForView((view) => Boolean(view.attackResponse));
    pendingAttack = second.view.machine.pendingAttack;
    assert.equal(first.view.players.p2.lp, 4000, "declaration alone must not deal damage");
    assert.equal(first.view.attackResponse, null, "attacker must not receive hidden candidates");
  }

  second.close();
  await first.waitForView((view) => view.seats.find((seat) => seat.seatId === "p2")?.connected === false);
  await resumed.connect();
  const resumeResult = await resumed.request(DuelClientMessage.resumeRoom, {
    roomCode: created.roomCode,
    reconnectToken: joined.reconnectToken
  });
  assert.equal(resumeResult.seatId, "p2");
  assert.equal(resumeResult.resumed, true);
  await resumed.waitForView((view) => view.viewerSeatId === "p2" && view.status === "playing");

  if (responseScenario) {
    assert.equal(resumed.view.attackResponse.declarationEventId, pendingAttack.declarationEventId);
    const cardId = resumed.view.attackResponse.candidates[0].cardId;
    await command(resumed, { type: "RESPOND_TRAP", cardId, declarationEventId: pendingAttack.declarationEventId });
    assert.equal(first.view.machine.pendingAttack, null);
    assert.equal(first.view.players.p2.lp, 4000);
    assert.ok(!first.view.players.p1.monsterZone.some(Boolean));
    assert.equal(first.view.players.p2.grave.at(-1).templateId, "mirror-snare");
    assert.equal(resumed.view.machine.responseWindow, null);
  }

  await first.request(DuelClientMessage.forfeitRoom);
  const [firstFinished, secondFinished] = await Promise.all([
    first.waitForView((view) => view.status === "finished" && view.gameOver?.reason === "concede"),
    resumed.waitForView((view) => view.status === "finished" && view.gameOver?.reason === "concede")
  ]);
  assert.deepEqual(firstFinished.series, { completed: 1, draws: 0, wins: { p1: 0, p2: 1 } });
  assert.deepEqual(secondFinished.series, firstFinished.series);
  await first.request(DuelClientMessage.requestRematch);
  await resumed.waitForView((view) => view.status === "finished" && view.seats.find((seat) => seat.seatId === "p1")?.ready);
  await resumed.request(DuelClientMessage.requestRematch);
  const [firstRematch, secondRematch] = await Promise.all([
    first.waitForView((view) => view.status === "playing" && view.duelNumber === 2),
    resumed.waitForView((view) => view.status === "playing" && view.duelNumber === 2)
  ]);
  assert.equal(firstRematch.turn.playerId, "p2");
  assert.equal(secondRematch.turn.playerId, "p2");
  assert.equal(firstRematch.roomCode, created.roomCode);
  assert.deepEqual(firstRematch.series, firstFinished.series);

  console.log(`online-duel-smoke passed (${created.roomCode}${responseScenario ? ", trap-response + resume" : ""}, rematch)`);
} finally {
  first.close();
  second.close();
  resumed.close();
}
