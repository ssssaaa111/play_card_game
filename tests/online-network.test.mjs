import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OnlineDuelClient } from "../src/online-duel-client.js";
import { OnlineAuthClient } from "../src/online-auth-client.js";
import { installOnlineLifecycle } from "../src/online-lifecycle.js";
import { startSocketHeartbeat } from "../server/socket-heartbeat.js";
import { handDragThreshold, bindHandVisibilityCancel, primaryHandPointer } from "../src/hand-renderer.js";

class Clock {
  next = 0; jobs = new Map();
  setTimeout(fn) { const id = ++this.next; this.jobs.set(id, fn); return id; }
  clearTimeout(id) { this.jobs.delete(id); }
  setInterval(fn) { return this.setTimeout(fn); }
  clearInterval(id) { this.clearTimeout(id); }
  fire() { const jobs = [...this.jobs]; this.jobs.clear(); for (const [, fn] of jobs) fn(); }
}
class Target {
  listeners = new Map();
  addEventListener(type, fn) { const list = this.listeners.get(type) || new Set(); list.add(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, data = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn(data); }
}
function harness() {
  const sockets = [], clock = new Clock();
  class Socket extends Target {
    static OPEN = 1;
    readyState = 0; sent = [];
    constructor() { super(); sockets.push(this); }
    open() { this.readyState = 1; this.emit("open"); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.emit("close"); }
    message(message) { this.emit("message", { data: JSON.stringify(message) }); }
  }
  const client = new OnlineDuelClient({ WebSocketImpl: Socket, timers: clock });
  return { client, sockets, clock };
}
const view = (revision) => ({ roomCode: "ABC234", revision, duelNumber: 1, viewerSeatId: "p1" });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test("a silent handshake times out, releases the connect lock, and permits retry", async () => {
  const { client, sockets, clock } = harness();
  const first = client.connect(); assert.equal(client.connect(), first);
  const rejected = assert.rejects(first, { code: "CONNECT_TIMEOUT" }); clock.fire(); await rejected;
  assert.equal(client.socket, null); assert.equal(client.connectionPromise, null);
  const second = client.connect(); sockets[1].open(); await second;
  assert.equal(clock.jobs.size, 0); client.disconnect();
});

test("closing or explicitly disconnecting before open rejects the handshake immediately", async () => {
  for (const manual of [false, true]) {
    const { client, sockets, clock } = harness(); const connecting = client.connect();
    const rejected = assert.rejects(connecting, { code: manual ? "DISCONNECTED" : "CONNECTION_LOST" });
    if (manual) client.disconnect(); else sockets[0].close();
    await rejected; assert.equal(clock.jobs.size, 0); assert.equal(client.connectionPromise, null);
  }
});

test("late old-socket state ack error and close cannot overwrite or interrupt a new socket", async () => {
  const { client, sockets } = harness();
  let connecting = client.connect(); sockets[0].open(); await connecting; client.disconnect();
  connecting = client.connect(); sockets[1].open(); await connecting;
  sockets[1].message({ type: "room/state", data: view(9) });
  const synced = client.sync(), request = sockets[1].sent.at(-1);
  sockets[0].message({ type: "room/state", data: view(99) });
  sockets[0].message({ type: "request/ack", requestId: request.requestId, data: { view: view(100) } });
  sockets[0].emit("error"); sockets[0].emit("close");
  assert.equal(client.view.revision, 9); assert.equal(client.pending.size, 1);
  sockets[1].message({ type: "request/ack", requestId: request.requestId, data: { view: view(10) } });
  await synced; assert.equal(client.view.revision, 10); client.disconnect();
});

test("request timeout drops ambiguous connection releases every waiter and never resends a command", async () => {
  const { client, sockets, clock } = harness();
  const connecting = client.connect(); sockets[0].open(); await connecting;
  sockets[0].message({ type: "room/state", data: view(3) });
  const action = client.sendAction({ type: "END_TURN" }), sync = client.sync();
  const a = assert.rejects(action, { code: "RESPONSE_TIMEOUT" }), b = assert.rejects(sync, { code: "RESPONSE_TIMEOUT" });
  clock.fire(); await Promise.all([a, b]);
  assert.equal(client.pending.size, 0); assert.equal(client.socket, null);
  const reconnect = client.connect(); sockets[1].open(); await reconnect;
  assert.equal(sockets[0].sent.filter((message) => message.type === "duel/command").length, 1);
  assert.equal(sockets[1].sent.length, 0); client.disconnect();
});

test("send failures and intentional disconnect release the pending command immediately", async () => {
  for (const sendFailure of [true, false]) {
    const { client, sockets, clock } = harness(); const connecting = client.connect(); sockets[0].open(); await connecting;
    if (sendFailure) sockets[0].send = () => { throw new Error("broken pipe"); };
    const pending = client.sync(); const rejected = assert.rejects(pending, { code: sendFailure ? "SEND_FAILED" : "DISCONNECTED" });
    if (!sendFailure) client.disconnect();
    await rejected; assert.equal(clock.jobs.size, 0);
  }
});

test("an older view on the active socket never rolls a current room back", async () => {
  const { client, sockets } = harness(); const connecting = client.connect(); sockets[0].open(); await connecting;
  for (const revision of [5, 3, 5, 6]) sockets[0].message({ type: "room/state", data: view(revision) });
  assert.equal(client.view.revision, 6);
  const sync = client.sync(); const request = sockets[0].sent.at(-1);
  sockets[0].message({ type: "request/ack", requestId: request.requestId, data: { view: view(4) } });
  assert.equal((await sync).view.revision, 6); client.disconnect();
});

test("auth request timeout aborts a stalled login and never accepts its late result", async () => {
  const clock = new Clock(); let signal, resolve;
  const client = new OnlineAuthClient({ timers: clock, fetchImpl: (_url, options) => { signal = options.signal; return new Promise((yes) => { resolve = yes; }); } });
  const login = client.login({ handle: "qa", password: "synthetic" });
  const rejected = assert.rejects(login, { code: "AUTH_TIMEOUT" }); clock.fire(); await rejected;
  assert.equal(signal.aborted, true);
  resolve(new Response(JSON.stringify({ account: { id: "late" } }))); await flush();
  assert.equal(client.account, null);
});

test("auth timeout also covers a stalled response body", async () => {
  const clock = new Clock(); const client = new OnlineAuthClient({ timers: clock, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  const session = client.session(); await flush(); const rejected = assert.rejects(session, { code: "AUTH_TIMEOUT" }); clock.fire(); await rejected;
});

function lifecycle() {
  const document = new Target(), window = new Target(), clock = new Clock();
  document.visibilityState = "visible"; window.navigator = { onLine: true };
  window.setInterval = clock.setInterval.bind(clock); window.clearInterval = clock.clearInterval.bind(clock);
  const calls = [], client = { session: { roomCode: "ABC234" }, socket: { readyState: 1 },
    resetConnection: (error) => calls.push(error.code), request: async (type) => calls.push(type) };
  return { document, window, clock, client, calls };
}

test("backgrounding alone never disconnects a seat; foreground syncs once despite duplicate events", async () => {
  const h = lifecycle(); let release, resumes = 0, suspends = 0;
  const installed = installOnlineLifecycle({ ...h, onSuspend: () => suspends++, onResume: () => { resumes++; return new Promise((resolve) => { release = resolve; }); } });
  h.document.visibilityState = "hidden"; h.document.emit("visibilitychange"); h.clock.fire();
  assert.equal(suspends, 1); assert.deepEqual(h.calls, []);
  h.document.visibilityState = "visible"; h.document.emit("visibilitychange"); h.window.emit("focus"); h.window.emit("pageshow", { persisted: true });
  assert.equal(resumes, 1); release(); await flush(); installed.dispose();
});

test("offline fails pending work and online restores only when visible; disposal removes hooks", async () => {
  const h = lifecycle(); let resumes = 0;
  const installed = installOnlineLifecycle({ ...h, onResume: async () => { resumes++; } });
  h.window.navigator.onLine = false; h.window.emit("offline");
  assert.deepEqual(h.calls, ["NETWORK_OFFLINE"]);
  h.document.visibilityState = "hidden"; h.window.navigator.onLine = true; h.window.emit("online"); assert.equal(resumes, 0);
  h.document.visibilityState = "visible"; h.document.emit("visibilitychange"); await flush(); assert.equal(resumes, 1);
  installed.dispose(); h.window.emit("online"); h.document.emit("visibilitychange"); assert.equal(resumes, 1);
});

test("visible heartbeat probes transport without issuing or repeating gameplay actions", async () => {
  const h = lifecycle(); const installed = installOnlineLifecycle(h); h.clock.fire(); await flush();
  assert.deepEqual(h.calls, ["transport/ping"]); installed.dispose();
});

test("browser freeze and resume reconcile current state without disconnecting just for freezing", async () => {
  const h = lifecycle(); let suspends = 0, resumes = 0;
  const installed = installOnlineLifecycle({ ...h, onSuspend: () => suspends++, onResume: async () => { resumes++; } });
  h.document.emit("freeze"); assert.equal(suspends, 1); assert.deepEqual(h.calls, []);
  h.document.emit("resume"); await flush(); assert.equal(resumes, 1);
  installed.dispose(); h.document.emit("freeze"); h.document.emit("resume"); assert.equal(resumes, 1); assert.equal(suspends, 1);
});

test("server heartbeat tolerates healthy pongs but terminates a silent open socket", () => {
  const server = new EventEmitter(), socket = new EventEmitter(); let tick, stopped = false, pings = 0, terminated = 0;
  socket.readyState = 1; socket.ping = () => pings++; socket.terminate = () => terminated++;
  server.clients = new Set([socket]);
  startSocketHeartbeat(server, { timers: { setInterval(fn) { tick = fn; return 1; }, clearInterval() { stopped = true; } } });
  server.emit("connection", socket); tick(); socket.emit("pong"); tick(); assert.equal(pings, 2); assert.equal(terminated, 0);
  tick(); assert.equal(terminated, 1); server.emit("close"); assert.equal(stopped, true);
});

test("touch movement has a jitter guard and hiding the page cancels an active gesture", () => {
  assert.equal(primaryHandPointer({ pointerType: "touch", isPrimary: false }), false);
  assert.equal(primaryHandPointer({ pointerType: "touch", isPrimary: true }), true);
  assert.equal(primaryHandPointer({ pointerType: "mouse", isPrimary: false }), true);
  assert.equal(primaryHandPointer({}), true);
  assert.equal(handDragThreshold("touch"), 12); assert.equal(handDragThreshold("mouse"), 6);
  const document = new Target(); let canceled = 0;
  const dispose = bindHandVisibilityCancel(document, () => canceled++);
  document.hidden = false; document.emit("visibilitychange"); assert.equal(canceled, 0);
  document.emit("freeze"); assert.equal(canceled, 1);
  document.hidden = true; document.emit("visibilitychange"); assert.equal(canceled, 2);
  dispose(); document.emit("visibilitychange"); document.emit("freeze"); assert.equal(canceled, 2);
});
