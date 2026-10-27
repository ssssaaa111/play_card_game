import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

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

const hostArgument = process.argv.find((argument) => argument.startsWith("--host="));
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const host = hostArgument?.slice("--host=".length) || process.env.DUEL_HOST || "127.0.0.1";
const requestedPort = Number.parseInt(portArgument?.slice("--port=".length) || process.env.DUEL_PORT || "5178", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 5178;
const responseDemo = process.argv.includes("--scenario=trap-response");
if (responseDemo && !["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("QA scenarios require a loopback host");
const roomStore = new DuelRoomStore(responseDemo ? { createRoom: (options) => new DuelRoom({
  ...options,
  createState: (config) => createOnlineDuelState({ ...config, openingHands: {
    p1: ["solar-knight", "twin-summon", "gale-mage", "iron-guardian", "void-hound"],
    p2: ["mirror-snare", "weakening-web", "storm-shift", "guard-sigil", "iron-guardian"]
  } })
}) } : {});
const connections = new Map();
const responseTimers = new Map();

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
  for (const [socket, connection] of connections) {
    if (connection.roomCode !== room.code || !connection.seatId) continue;
    const activeSeat = room.seatForConnection(connection.id);
    if (!activeSeat || activeSeat.seatId !== connection.seatId) continue;
    send(socket, { type: DuelServerMessage.roomState, data: room.viewFor(connection.seatId) });
  }
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
      const name = normalizeDisplayName(message.payload.name);
      const room = roomStore.create();
      const result = room.join({ name, connectionId: connection.id });
      bindConnection(socket, room, result);
      ack(socket, requestId, result);
      broadcastRoom(room);
      return;
    }

    if (message.type === DuelClientMessage.joinRoom || message.type === DuelClientMessage.resumeRoom) {
      if (connection.roomCode) throw new DuelRoomError("Connection already belongs to a room", "ALREADY_JOINED");
      const roomCode = normalizeRoomCode(message.payload.roomCode);
      const room = roomStore.require(roomCode);
      const result = room.join({
        name: message.payload.name || "重连玩家",
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

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true, rooms: roomStore.rooms.size, now: Date.now() }));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});
const webSocketServer = new WebSocketServer({ server: httpServer, path: "/duel", maxPayload: 32_768 });
webSocketServer.on("connection", (socket) => {
  const connection = { id: randomUUID(), roomCode: null, seatId: null };
  connections.set(socket, connection);
  send(socket, { type: DuelServerMessage.connected, data: { connectionId: connection.id, protocolVersion: 1 } });
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
