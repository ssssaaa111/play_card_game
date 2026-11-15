import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { deckPresets } from "../src/data.js";
import { OnlineDuelClient } from "../src/online-duel-client.js";

// Own isolated process and files: never restart an existing developer/user service.
const directory = await mkdtemp(join(tmpdir(), "star-duel-restart-"));
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server = null, serverOutput = "";
const clients = [];
const spectatorScenario = process.argv.includes("--spectator");
const networkScenario = process.argv.includes("--network");
let networkClient = null;

async function startServer() {
  serverOutput = "";
  server = spawn(process.execPath, [fileURLToPath(new URL("./duel-server.mjs", import.meta.url)), `--port=${port}`, "--scenario=attack-chain-response"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
      DUEL_AUTH_STORE: join(directory, "auth.json"), DUEL_ROOM_STORE: join(directory, "rooms.json"), DUEL_TURN_TIMEOUT_MS: "120000" }
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  server.on("error", (error) => { serverOutput += error.message; });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Test server exited: ${serverOutput}`);
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error(`Test server did not start: ${serverOutput}`);
}
async function crashServer() {
  if (!server || server.exitCode != null) return;
  const exited = once(server, "exit");
  server.kill("SIGKILL"); await exited; server = null;
}
class Client {
  constructor(cookie) { this.cookie = cookie; this.pending = new Map(); this.view = null; clients.push(this); }
  async connect() {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/duel`, { headers: { Cookie: this.cookie } });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "room/state") { this.view = message.data; this.watchEnded = false; }
      if (message.type === "room/watch-ended") { this.view = null; this.watchEnded = true; }
      const request = this.pending.get(message.requestId);
      if (!request) return;
      this.pending.delete(message.requestId); clearTimeout(request.timer);
      if (message.type === "request/error") request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else request.resolve(message.data);
    });
    await once(this.socket, "open"); return this;
  }
  request(type, payload = {}) {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Timed out: ${type}`)); }, 8_000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type, requestId, payload }));
    });
  }
  async sync() { this.view = (await this.request("room/sync")).view; return this.view; }
  command(action, commandId = randomUUID()) { return this.request("duel/command", { revision: this.view.revision, commandId, action }); }
}
async function register(displayName) {
  const response = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: `restart_${randomUUID().replaceAll("-", "").slice(0, 12)}`, password: "local-restart-smoke", displayName }) });
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
}

try {
  await startServer();
  const cookie1 = await register("重启一"), cookie2 = await register("重启二");
  let first = await new Client(cookie1).connect(), second = await new Client(cookie2).connect();
  const p1 = await first.request("room/create"), p2 = await second.request("room/join", { roomCode: p1.roomCode });
  let observer = null;
  if (spectatorScenario) {
    observer = await new Client(cookie1).connect();
    await assert.rejects(observer.request("room/watch", { roomCode: p1.roomCode }), { code: "SPECTATING_CLOSED" });
    await first.request("room/spectator-consent", { allowed: true });
    await assert.rejects(observer.request("room/watch", { roomCode: p1.roomCode }), { code: "SPECTATING_CLOSED" });
    await second.request("room/spectator-consent", { allowed: true });
    await observer.request("room/watch", { roomCode: p1.roomCode }); await observer.sync();
    const anonymous = await new Client("").connect();
    await assert.rejects(anonymous.request("room/watch", { roomCode: p1.roomCode }), { code: "AUTH_REQUIRED" }); anonymous.socket.close();
    await first.sync(); const revision = first.view.revision;
    for (const [type, payload] of [
      ["room/ready", { ready: true }], ["room/deck", { deck: null }], ["room/spectator-consent", { allowed: false }],
      ["room/rematch", {}], ["duel/forfeit", {}], ["duel/command", { revision, commandId: "forged", action: { type: "END_TURN", playerId: "p1" }, reconnectToken: p1.reconnectToken }]
    ]) await assert.rejects(observer.request(type, payload), { code: "SPECTATOR_READ_ONLY" });
    await first.sync(); assert.equal(first.view.revision, revision);
    await first.request("room/spectator-consent", { allowed: false });
    const deadline = Date.now() + 8_000;
    while (!observer.watchEnded && Date.now() < deadline) await delay(25);
    assert.equal(observer.watchEnded, true); assert.equal(observer.view, null);
    await first.request("room/spectator-consent", { allowed: true });
    await observer.request("room/watch", { roomCode: p1.roomCode });
  }
  await first.request("room/deck", { deck: { kind: "custom", name: "restart-private", ids: deckPresets.balanced.ids } });
  await second.request("room/deck", { deck: { kind: "preset", id: "control" } });
  await first.request("room/ready", { ready: true });
  const resume = async () => {
    first = await new Client(cookie1).connect(); second = await new Client(cookie2).connect();
    await first.request("room/resume", p1); await second.request("room/resume", p2);
    await first.sync(); await second.sync();
    if (spectatorScenario) {
      observer = await new Client(cookie1).connect();
      await observer.request("room/watch", { roomCode: p1.roomCode }); await observer.sync();
      assert.equal(observer.view.viewerRole, "spectator");
      assert.equal(observer.view.spectators.count, 1);
    }
  };
  await crashServer(); await startServer();
  const impostor = await new Client(cookie2).connect();
  await assert.rejects(impostor.request("room/resume", p1), { code: "ACCOUNT_MISMATCH" }); impostor.socket.close();
  await resume();
  assert.equal(first.view.seats.find((seat) => seat.seatId === "p1").ready, true);
  assert.equal(first.view.deckSelection.name, "restart-private");
  assert.ok(!JSON.stringify(second.view).includes("restart-private"));
  await second.request("room/ready", { ready: true }); await first.sync();
  if (spectatorScenario) {
    await second.sync(); await observer.sync();
    const serialized = JSON.stringify(observer.view);
    for (const card of [...first.view.players.p1.hand, ...second.view.players.p2.hand]) assert.ok(!serialized.includes(card.id));
    assert.ok(!serialized.includes("restart-private"));
    for (const key of ["legalActions", "deckSelection", "attackResponse", "chainResponse"]) assert.equal(key in observer.view, false);
  }
  assert.equal(first.view.players.p1.deckCount, 51);
  const knight = first.view.players.p1.hand.find((card) => card.templateId === "solar-knight");
  const counter = first.view.players.p1.hand.find((card) => card.templateId === "chain-nullifier");
  await first.command({ type: "SET_TRAP", cardId: counter.id, index: 0 }); await first.sync();
  await first.command({ type: "SUMMON_MONSTER", cardId: knight.id, index: 0 }); await first.sync();
  await first.command({ type: "END_TURN" }); await second.sync();
  const mirror = second.view.players.p2.hand.find((card) => card.templateId === "mirror-snare");
  await second.command({ type: "SET_TRAP", cardId: mirror.id, index: 0 }); await second.sync();
  if (spectatorScenario) { await observer.sync(); assert.ok(!JSON.stringify(observer.view).includes(mirror.id)); }
  await second.command({ type: "END_TURN" }); await first.sync();
  await first.command({ type: "CHANGE_PHASE", phase: "battle" }); await first.sync();
  await first.command({ type: "DECLARE_ATTACK", attackerCardId: knight.id }); await second.sync();
  await second.command({ type: "RESPOND_TRAP", cardId: mirror.id, declarationEventId: second.view.attackResponse.declarationEventId });
  await first.sync(); const chainId = first.view.chainResponse.triggerEventId;
  if (spectatorScenario) {
    await observer.sync(); assert.equal(observer.view.machine.chain[0].card.name, "镜光反制");
    assert.ok(!JSON.stringify(observer.view).includes(counter.id));
  }
  const handIds = first.view.players.p1.hand.map((card) => card.id);
  const publicBeforeRestart = await first.request("room/public-history");
  assert.equal(publicBeforeRestart.entries[0].type, "DUEL_STARTED");
  assert.ok(!JSON.stringify(publicBeforeRestart).includes(counter.id));
  assert.ok(!JSON.stringify(publicBeforeRestart).includes("restart-private"));
  if (spectatorScenario) assert.deepEqual(await observer.request("room/public-history"), publicBeforeRestart);
  await crashServer(); await startServer(); await resume();
  assert.deepEqual((await first.request("room/public-history")).entries, publicBeforeRestart.entries);
  assert.equal(first.view.chainResponse.triggerEventId, chainId);
  assert.deepEqual(first.view.players.p1.hand.map((card) => card.id), handIds);
  assert.equal(first.view.players.p2.lp, 4000);
  if (spectatorScenario) assert.equal(observer.view.machine.chain[0].card.name, "镜光反制");
  assert.equal(second.view.chainResponse, null);
  const envelope = { revision: first.view.revision, commandId: "restart-settlement", action: { type: "RESPOND_CHAIN_TRAP", cardId: counter.id, triggerEventId: chainId } };
  await first.request("duel/command", envelope); await first.sync();
  assert.equal(first.view.players.p2.lp, 2300);
  const settledReport = await first.request("room/public-history");
  await crashServer(); await startServer(); await resume();
  assert.equal((await first.request("duel/command", envelope)).duplicate, true);
  await first.sync(); assert.equal(first.view.players.p2.lp, 2300);
  assert.deepEqual((await first.request("room/public-history")).entries, settledReport.entries);
  await second.request("duel/forfeit"); await first.request("room/rematch");
  await crashServer(); await startServer(); await resume();
  assert.equal(first.view.series.wins.p1, 1);
  assert.equal(first.view.series.completed, 1);
  assert.equal(first.view.seats.find((seat) => seat.seatId === "p1").ready, true);
  await second.request("room/rematch"); await first.sync(); await second.sync();
  assert.equal(first.view.duelNumber, 2);
  assert.equal(first.view.turn.playerId, "p2");
  assert.equal(first.view.players.p1.deckCount, 51);
  assert.equal(second.view.players.p2.deckCount, 45);
  const previousReport = await first.request("room/public-history", { duelNumber: 1 });
  assert.equal(previousReport.finished, true);
  assert.match(previousReport.entries.map((entry) => entry.text).join("\n"), /获胜/);
  assert.deepEqual(previousReport.duels, [1, 2]);
  if (spectatorScenario) {
    await observer.sync(); assert.equal(observer.view.turn.playerId, "p2"); assert.equal(observer.view.series.completed, 1);
    const beforeLeave = first.view.revision;
    await observer.request("room/leave"); await first.sync();
    await assert.rejects(observer.request("room/public-history"), { code: "NOT_IN_ROOM" });
    assert.equal(first.view.revision, beforeLeave);
    assert.equal(first.view.turnTimer.paused, false);
    assert.ok(first.view.seats.every((seat) => seat.connected));
  }
  assert.equal((await fetch(`${base}/online-rooms-${port}.json`)).status, 404);
  if (networkScenario) {
    class DroppedReplySocket extends WebSocket {
      constructor(url) { super(url, { headers: { Cookie: cookie2 } }); }
      emit(type, ...args) {
        if (this.dropReplies && type === "message") return false;
        return super.emit(type, ...args);
      }
    }
    networkClient = new OnlineDuelClient({ url: `ws://127.0.0.1:${port}/duel`, WebSocketImpl: DroppedReplySocket, requestTimeoutMs: 400 });
    await networkClient.connect(); await networkClient.resumeRoom(p2);
    assert.equal(networkClient.view.turn.playerId, "p2");
    const before = (await networkClient.publicHistory()).total;
    networkClient.socket.dropReplies = true;
    await assert.rejects(networkClient.sendAction({ type: "END_TURN" }), { code: "RESPONSE_TIMEOUT" });
    assert.equal(networkClient.socket, null);
    await networkClient.connect(); await networkClient.resumeRoom();
    assert.equal(networkClient.view.turn.playerId, "p1", "lost acknowledgement must recover the committed turn, not resend it");
    assert.ok((await networkClient.publicHistory()).total > before);
    assert.equal(networkClient.pending.size, 0);
  }
  console.log(`online-restart-smoke passed (4 hard restarts: waiting deck, active chain, duplicate receipt, rematch + identity + privacy${spectatorScenario ? ", spectator consent + read-only + hidden data + revoke + restore" : ""}${networkScenario ? ", lost acknowledgement + timeout + no resend" : ""})`);
} finally {
  networkClient?.disconnect();
  for (const client of clients) client.socket?.terminate();
  await crashServer();
  await rm(directory, { recursive: true, force: true });
}
