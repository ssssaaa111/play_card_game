import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { WebSocket } from "ws";

import { DuelClientMessage, DuelServerMessage } from "../src/duel-command.js";

const serverUrl = process.env.DUEL_SERVER_URL || "ws://127.0.0.1:5178/duel";

class SmokeClient {
  constructor(name) {
    this.name = name;
    this.socket = null;
    this.pending = new Map();
    this.view = null;
    this.viewWaiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(serverUrl);
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
const first = new SmokeClient("first");
const second = new SmokeClient("second");
const resumed = new SmokeClient("resumed");

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
  assert.ok(summon, "first player should have a summon action");
  await first.request(DuelClientMessage.command, {
    revision: firstStart.revision,
    commandId: "smoke-summon-1",
    action: summon
  });
  const secondAfterSummon = await second.waitForView((view) =>
    view.revision > secondStart.revision && view.players.p1.monsterZone.some(Boolean)
  );
  assert.ok(secondAfterSummon.players.p1.monsterZone.find(Boolean)?.name);

  const firstAfterSummon = await first.waitForView((view) => view.revision === secondAfterSummon.revision);
  await first.request(DuelClientMessage.command, {
    revision: firstAfterSummon.revision,
    commandId: "smoke-end-1",
    action: { type: "END_TURN" }
  });
  const secondTurn = await second.waitForView((view) => view.turn.playerId === "p2" && view.turn.phase === "main");
  assert.equal(secondTurn.players.p2.handCount, 6);

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

  console.log(`online-duel-smoke passed (${created.roomCode})`);
} finally {
  first.close();
  second.close();
  resumed.close();
}
