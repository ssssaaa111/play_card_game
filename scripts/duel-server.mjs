import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { WebSocket, WebSocketServer } from "ws";

import {
  DuelClientMessage,
  DuelProtocolError,
  DuelServerMessage,
  normalizeDisplayName,
  normalizeRoomCode,
  parseClientMessage
} from "../src/duel-command.js";
import { DuelRoom, DuelRoomError } from "../server/duel-room.js";
import { DuelRoomStore } from "../server/duel-room-store.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import {
  ONLINE_AUTH_COOKIE,
  OnlineAuthAttemptLimiter,
  OnlineAuthError,
  OnlineAuthStore,
  authCookie,
  clearAuthCookie,
  parseCookieHeader
} from "../server/online-auth.js";
import { isLoopbackHost, onlineOriginAllowed } from "../server/online-origin.js";

const hostArgument = process.argv.find((argument) => argument.startsWith("--host="));
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const host = hostArgument?.slice("--host=".length) || process.env.DUEL_HOST || "127.0.0.1";
const requestedPort = Number.parseInt(portArgument?.slice("--port=".length) || process.env.DUEL_PORT || "5178", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 5178;
const authStorePath = process.env.DUEL_AUTH_STORE || fileURLToPath(new URL("../.data/online-auth.json", import.meta.url));
const authStore = new OnlineAuthStore({ filePath: authStorePath });
const configuredOrigins = new Set(String(process.env.DUEL_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const trustProxy = process.env.DUEL_TRUST_PROXY === "1";
const configuredAuthAttemptLimit = Number.parseInt(process.env.DUEL_AUTH_ATTEMPT_LIMIT || "8", 10);
const configuredAuthWindowMs = Number.parseInt(process.env.DUEL_AUTH_WINDOW_MS || "600000", 10);
const authAttemptLimiter = new OnlineAuthAttemptLimiter({
  limit: Number.isFinite(configuredAuthAttemptLimit) ? configuredAuthAttemptLimit : 8,
  windowMs: Number.isFinite(configuredAuthWindowMs) ? configuredAuthWindowMs : 600_000
});
const configuredDisconnectGraceMs = Number.parseInt(process.env.DUEL_DISCONNECT_GRACE_MS || "60000", 10);
const disconnectGraceMs = Number.isFinite(configuredDisconnectGraceMs) ? Math.max(1_000, configuredDisconnectGraceMs) : 60_000;
const responseDemo = process.argv.includes("--scenario=trap-response");
if (responseDemo && !["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("QA scenarios require a loopback host");
const roomStore = new DuelRoomStore({ createRoom: (options) => new DuelRoom({
  ...options,
  disconnectGraceMs,
  ...(responseDemo ? { createState: (config) => createOnlineDuelState({ ...config, openingHands: {
    p1: ["solar-knight", "twin-summon", "gale-mage", "iron-guardian", "void-hound"],
    p2: ["mirror-snare", "weakening-web", "storm-shift", "guard-sigil", "iron-guardian"]
  } }) } : {})
}) });
const connections = new Map();
const responseTimers = new Map();
const disconnectTimers = new Map();

function requestIsSecure(request) {
  return request.socket?.encrypted === true || (
    trustProxy && String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
  );
}

function originAllowed(origin = "") {
  return onlineOriginAllowed(origin, { allowedOrigins: configuredOrigins, allowLoopback: isLoopbackHost(host) });
}

function requestAddress(request) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return String(request.socket?.remoteAddress || "unknown");
}

function loginAttemptKey(request, handle = "") {
  const normalizedHandle = String(handle || "").trim().toLowerCase().slice(0, 64);
  return `login:${requestAddress(request)}:${normalizedHandle || "unknown"}`;
}

function corsHeaders(request) {
  const origin = String(request.headers.origin || "");
  if (!originAllowed(origin)) return {};
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  } : {};
}

function sendJson(request, response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(request),
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_192) throw new OnlineAuthError("请求内容过大", "REQUEST_TOO_LARGE", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new OnlineAuthError("请求内容不是有效 JSON", "INVALID_JSON");
  }
}

function requestToken(request) {
  return parseCookieHeader(request.headers.cookie || "")[ONLINE_AUTH_COOKIE] || "";
}

function requireConnectionAccount(connection) {
  if (!connection?.account) throw new DuelRoomError("Please sign in before joining an online duel", "AUTH_REQUIRED");
  return connection.account;
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function ack(socket, requestId, data = {}) {
  send(socket, { type: DuelServerMessage.ack, requestId, data });
}

function reject(socket, requestId, error) {
  const code = error?.code || "SERVER_ERROR";
  const message = error?.message || "Unexpected duel server error";
  send(socket, { type: DuelServerMessage.error, requestId, error: { code, message } });
}

function bindConnection(socket, room, joinResult) {
  const connection = connections.get(socket);
  connection.roomCode = room.code;
  connection.seatId = joinResult.seatId;
  return connection;
}

function activeRoomFor(socket) {
  const connection = connections.get(socket);
  if (!connection?.roomCode) throw new DuelRoomError("Connection has not joined a room", "NOT_IN_ROOM");
  return roomStore.require(connection.roomCode);
}

function broadcastRoom(room) {
  scheduleResponseTimeout(room);
  scheduleDisconnectTimeout(room);
  for (const [socket, connection] of connections) {
    if (connection.roomCode !== room.code || !connection.seatId) continue;
    const activeSeat = room.seatForConnection(connection.id);
    if (!activeSeat || activeSeat.seatId !== connection.seatId) continue;
    send(socket, { type: DuelServerMessage.roomState, data: room.viewFor(connection.seatId) });
  }
}

function scheduleDisconnectTimeout(room) {
  const existing = disconnectTimers.get(room.code);
  if (existing) clearTimeout(existing);
  disconnectTimers.delete(room.code);
  const delay = room.disconnectTimeoutDelay();
  if (delay == null) return;
  const timer = setTimeout(() => {
    disconnectTimers.delete(room.code);
    if (room.expireDisconnectTimeout()) broadcastRoom(room);
    else scheduleDisconnectTimeout(room);
  }, delay + 5);
  timer.unref();
  disconnectTimers.set(room.code, timer);
}

function scheduleResponseTimeout(room) {
  const existing = responseTimers.get(room.code);
  if (existing) clearTimeout(existing);
  responseTimers.delete(room.code);
  const delay = room.responseTimeoutDelay();
  if (delay == null) return;
  const timer = setTimeout(() => {
    responseTimers.delete(room.code);
    if (room.expireAttackResponse()) broadcastRoom(room);
    else scheduleResponseTimeout(room);
  }, delay + 5);
  timer.unref();
  responseTimers.set(room.code, timer);
}

async function handleMessage(socket, rawMessage) {
  let requestId = "unknown";
  try {
    const message = parseClientMessage(rawMessage.toString("utf8"));
    requestId = message.requestId;
    const connection = connections.get(socket);

    if (message.type === DuelClientMessage.ping) {
      send(socket, { type: DuelServerMessage.pong, requestId, data: { now: Date.now() } });
      return;
    }

    if (message.type === DuelClientMessage.createRoom) {
      if (connection.roomCode) throw new DuelRoomError("Connection already belongs to a room", "ALREADY_JOINED");
      const account = requireConnectionAccount(connection);
      const name = normalizeDisplayName(account.displayName);
      const room = roomStore.create();
      const result = room.join({ name, accountId: account.id, connectionId: connection.id });
      bindConnection(socket, room, result);
      ack(socket, requestId, result);
      broadcastRoom(room);
      return;
    }

    if (message.type === DuelClientMessage.joinRoom || message.type === DuelClientMessage.resumeRoom) {
      if (connection.roomCode) throw new DuelRoomError("Connection already belongs to a room", "ALREADY_JOINED");
      const account = requireConnectionAccount(connection);
      const roomCode = normalizeRoomCode(message.payload.roomCode);
      const room = roomStore.require(roomCode);
      const result = room.join({
        name: account.displayName,
        accountId: account.id,
        connectionId: connection.id,
        reconnectToken: message.type === DuelClientMessage.resumeRoom ? message.payload.reconnectToken : ""
      });
      bindConnection(socket, room, result);
      ack(socket, requestId, result);
      broadcastRoom(room);
      return;
    }

    const room = activeRoomFor(socket);
    if (message.type === DuelClientMessage.setReady) {
      const view = room.setReady(connection.id, message.payload.ready !== false);
      ack(socket, requestId, { revision: room.revision, status: room.status, view });
      broadcastRoom(room);
      return;
    }
    if (message.type === DuelClientMessage.syncRoom) {
      ack(socket, requestId, { view: room.viewFor(connection.seatId) });
      return;
    }
    if (message.type === DuelClientMessage.requestRematch) {
      const view = room.requestRematch(connection.id);
      ack(socket, requestId, { revision: room.revision, status: room.status, view });
      broadcastRoom(room);
      return;
    }
    if (message.type === DuelClientMessage.forfeitRoom) {
      const view = room.forfeit(connection.id);
      ack(socket, requestId, { revision: room.revision, status: room.status, view });
      broadcastRoom(room);
      return;
    }
    if (message.type === DuelClientMessage.command) {
      const receipt = room.submit(connection.id, message.payload);
      ack(socket, requestId, receipt);
      broadcastRoom(room);
      return;
    }
    if (message.type === DuelClientMessage.leaveRoom) {
      room.leave(connection.id);
      connection.roomCode = null;
      connection.seatId = null;
      ack(socket, requestId, { left: true });
      broadcastRoom(room);
      return;
    }
    throw new DuelProtocolError(`Unhandled message type ${message.type}`);
  } catch (error) {
    if (!(error instanceof DuelProtocolError) && !(error instanceof DuelRoomError)) {
      console.error(error);
    }
    reject(socket, requestId, error);
  }
}

const httpServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/auth/")) {
    if (!originAllowed(String(request.headers.origin || ""))) {
      sendJson(request, response, 403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } });
      return;
    }
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }
  try {
    if (!originAllowed(String(request.headers.origin || ""))) {
      sendJson(request, response, 403, { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } });
      return;
    }
    if (requestUrl.pathname === "/health" && request.method === "GET") {
      sendJson(request, response, 200, { ok: true, rooms: roomStore.rooms.size, now: Date.now() });
      return;
    }
    if (requestUrl.pathname === "/auth/session" && request.method === "GET") {
      const account = authStore.accountForToken(requestToken(request));
      sendJson(request, response, 200, { authenticated: Boolean(account), account });
      return;
    }
    if (requestUrl.pathname === "/auth/register" && request.method === "POST") {
      authAttemptLimiter.attempt(`register:${requestAddress(request)}`);
      const result = authStore.register(await readJsonBody(request));
      sendJson(request, response, 201, { authenticated: true, account: result.account }, {
        "Set-Cookie": authCookie(result.token, { secure: requestIsSecure(request) })
      });
      return;
    }
    if (requestUrl.pathname === "/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const attemptKey = loginAttemptKey(request, body.handle);
      authAttemptLimiter.attempt(attemptKey);
      const result = authStore.login(body);
      authAttemptLimiter.reset(attemptKey);
      sendJson(request, response, 200, { authenticated: true, account: result.account }, {
        "Set-Cookie": authCookie(result.token, { secure: requestIsSecure(request) })
      });
      return;
    }
    if (requestUrl.pathname === "/auth/logout" && request.method === "POST") {
      authStore.logout(requestToken(request));
      sendJson(request, response, 200, { authenticated: false, account: null }, {
        "Set-Cookie": clearAuthCookie({ secure: requestIsSecure(request) })
      });
      return;
    }
    sendJson(request, response, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
  } catch (error) {
    const status = error instanceof OnlineAuthError ? error.status : 500;
    if (!(error instanceof OnlineAuthError)) console.error(error);
    const retryAfterSeconds = error instanceof OnlineAuthError ? error.retryAfterSeconds : null;
    sendJson(request, response, status, {
      error: {
        code: error.code || "SERVER_ERROR",
        message: error.message || "Unexpected server error",
        ...(retryAfterSeconds ? { retryAfterSeconds } : {})
      }
    }, retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {});
  }
});
const webSocketServer = new WebSocketServer({
  server: httpServer,
  path: "/duel",
  maxPayload: 32_768,
  verifyClient: ({ origin }, done) => {
    if (!originAllowed(String(origin || ""))) {
      done(false, 403, "Origin not allowed");
      return;
    }
    done(true);
  }
});
webSocketServer.on("connection", (socket, request) => {
  const account = authStore.accountForCookieHeader(request.headers.cookie || "");
  const connection = { id: randomUUID(), roomCode: null, seatId: null, account };
  connections.set(socket, connection);
  send(socket, { type: DuelServerMessage.connected, data: { connectionId: connection.id, protocolVersion: 1, authenticated: Boolean(account), account } });
  socket.on("message", (message) => { void handleMessage(socket, message); });
  socket.on("close", () => {
    const current = connections.get(socket);
    connections.delete(socket);
    if (!current?.roomCode) return;
    const room = roomStore.get(current.roomCode);
    if (room?.disconnect(current.id)) broadcastRoom(room);
  });
  socket.on("error", (error) => console.error(`WebSocket error: ${error.message}`));
});

const cleanupTimer = setInterval(() => roomStore.deleteExpired(), 15 * 60 * 1000);
cleanupTimer.unref();

httpServer.listen(port, host, () => {
  console.log(`Card duel online server running at ws://${host}:${port}/duel`);
  console.log(`Health check: http://${host}:${port}/health`);
});
