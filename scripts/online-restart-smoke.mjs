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

// Own isolated process and files: never restart an existing developer/user service.
const directory = await mkdtemp(join(tmpdir(), "star-duel-restart-"));
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server = null, serverOutput = "";
const clients = [];

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
      if (message.type === "room/state") this.view = message.data;
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
  await first.request("room/deck", { deck: { kind: "custom", name: "restart-private", ids: deckPresets.balanced.ids } });
  await second.request("room/deck", { deck: { kind: "preset", id: "control" } });
  await first.request("room/ready", { ready: true });
  const resume = async () => {
    first = await new Client(cookie1).connect(); second = await new Client(cookie2).connect();
    await first.request("room/resume", p1); await second.request("room/resume", p2);
    await first.sync(); await second.sync();
  };
  await crashServer(); await startServer();
  const impostor = await new Client(cookie2).connect();
  await assert.rejects(impostor.request("room/resume", p1), { code: "ACCOUNT_MISMATCH" }); impostor.socket.close();
  await resume();
  assert.equal(first.view.seats.find((seat) => seat.seatId === "p1").ready, true);
  assert.equal(first.view.deckSelection.name, "restart-private");
  assert.ok(!JSON.stringify(second.view).includes("restart-private"));
  await second.request("room/ready", { ready: true }); await first.sync();
  assert.equal(first.view.players.p1.deckCount, 51);
  const knight = first.view.players.p1.hand.find((card) => card.templateId === "solar-knight");
  const counter = first.view.players.p1.hand.find((card) => card.templateId === "chain-nullifier");
  await first.command({ type: "SET_TRAP", cardId: counter.id, index: 0 }); await first.sync();
  await first.command({ type: "SUMMON_MONSTER", cardId: knight.id, index: 0 }); await first.sync();
  await first.command({ type: "END_TURN" }); await second.sync();
  const mirror = second.view.players.p2.hand.find((card) => card.templateId === "mirror-snare");
  await second.command({ type: "SET_TRAP", cardId: mirror.id, index: 0 }); await second.sync();
  await second.command({ type: "END_TURN" }); await first.sync();
  await first.command({ type: "CHANGE_PHASE", phase: "battle" }); await first.sync();
  await first.command({ type: "DECLARE_ATTACK", attackerCardId: knight.id }); await second.sync();
  await second.command({ type: "RESPOND_TRAP", cardId: mirror.id, declarationEventId: second.view.attackResponse.declarationEventId });
  await first.sync(); const chainId = first.view.chainResponse.triggerEventId;
  const handIds = first.view.players.p1.hand.map((card) => card.id);
  await crashServer(); await startServer(); await resume();
  assert.equal(first.view.chainResponse.triggerEventId, chainId);
  assert.deepEqual(first.view.players.p1.hand.map((card) => card.id), handIds);
  assert.equal(first.view.players.p2.lp, 4000);
  assert.equal(second.view.chainResponse, null);
  const envelope = { revision: first.view.revision, commandId: "restart-settlement", action: { type: "RESPOND_CHAIN_TRAP", cardId: counter.id, triggerEventId: chainId } };
  await first.request("duel/command", envelope); await first.sync();
  assert.equal(first.view.players.p2.lp, 2300);
  await crashServer(); await startServer(); await resume();
  assert.equal((await first.request("duel/command", envelope)).duplicate, true);
  await first.sync(); assert.equal(first.view.players.p2.lp, 2300);
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
  assert.equal((await fetch(`${base}/online-rooms-${port}.json`)).status, 404);
  console.log("online-restart-smoke passed (4 hard restarts: waiting deck, active chain, duplicate receipt, rematch + identity + privacy)");
} finally {
  for (const client of clients) client.socket?.terminate();
  await crashServer();
  await rm(directory, { recursive: true, force: true });
}
