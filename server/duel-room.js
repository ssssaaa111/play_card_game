import { randomBytes } from "node:crypto";

import { GameEngine, GameRuleError } from "../src/game-engine.js";
import { DuelProtocolError, normalizeCommandEnvelope, normalizeDisplayName, sanitizeOnlineAction } from "../src/duel-command.js";
import { buildDuelView } from "../src/duel-view.js";
import { createOnlineDuelState } from "./online-duel-state.js";
import { onlineAttackResponse, onlineTrapAction, activateOnlineTrap, settleOnlineAttack } from "../src/online-response.js";

const ROOM_SEAT_IDS = Object.freeze(["p1", "p2"]);
const MAX_REMEMBERED_COMMANDS = 100;

function token() {
  return randomBytes(24).toString("base64url");
}
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class DuelRoomError extends Error {
  constructor(message, code = "ROOM_ERROR") {
    super(message);
    this.name = "DuelRoomError";
    this.code = code;
  }
}

function publicSeat(seat) {
  return {
    seatId: seat.seatId,
    name: seat.name,
    ready: seat.ready,
    connected: seat.connected
  };
}

export class DuelRoom {
  constructor({ code, createState = createOnlineDuelState, now = () => Date.now() } = {}) {
    if (!code) throw new DuelRoomError("Room code is required");
    this.code = code;
    this.createState = createState;
    this.now = now;
    this.revision = 0;
    this.status = "waiting";
    this.engine = null;
    this.createdAt = now();
    this.updatedAt = this.createdAt;
    this.seats = new Map();
    this.commandReceipts = new Map();
  }

  seatList() {
    return ROOM_SEAT_IDS.map((seatId) => this.seats.get(seatId)).filter(Boolean);
  }

  seatForConnection(connectionId) {
    return this.seatList().find((seat) => seat.connectionId === connectionId) || null;
  }

  seatForToken(reconnectToken) {
    return this.seatList().find((seat) => seat.reconnectToken === reconnectToken) || null;
  }

  join({ name, connectionId, reconnectToken = "" } = {}) {
    if (!connectionId) throw new DuelRoomError("Connection id is required", "INVALID_CONNECTION");
    const resumed = reconnectToken ? this.seatForToken(reconnectToken) : null;
    if (resumed) {
      resumed.connectionId = connectionId;
      resumed.connected = true;
      resumed.lastSeenAt = this.now();
      this.#touch();
      this.#startIfReady();
      return this.#joinResult(resumed, true);
    }
    if (this.status !== "waiting") throw new DuelRoomError("The duel has already started", "ROOM_STARTED");
    if (this.seatForConnection(connectionId)) throw new DuelRoomError("Connection already joined this room", "ALREADY_JOINED");
    const seatId = ROOM_SEAT_IDS.find((candidate) => !this.seats.has(candidate));
    if (!seatId) throw new DuelRoomError("The room is full", "ROOM_FULL");
    const seat = {
      seatId,
      name: normalizeDisplayName(name),
      connectionId,
      reconnectToken: token(),
      ready: false,
      connected: true,
      joinedAt: this.now(),
      lastSeenAt: this.now()
    };
    this.seats.set(seatId, seat);
    this.#touch();
    return this.#joinResult(seat, false);
  }

  setReady(connectionId, ready = true) {
    const seat = this.#requireConnectionSeat(connectionId);
    if (this.status !== "waiting") throw new DuelRoomError("Ready state cannot change after the duel starts", "ROOM_STARTED");
    seat.ready = Boolean(ready);
    seat.lastSeenAt = this.now();
    this.#touch();
    this.#startIfReady();
    return this.viewFor(seat.seatId);
  }

  disconnect(connectionId) {
    const seat = this.seatForConnection(connectionId);
    if (!seat) return false;
    seat.connected = false;
    seat.connectionId = null;
    seat.lastSeenAt = this.now();
    this.#touch();
    return true;
  }

  leave(connectionId) {
    const seat = this.seatForConnection(connectionId);
    if (!seat) return false;
    if (this.status === "playing") {
      return this.disconnect(connectionId);
    }
    this.seats.delete(seat.seatId);
    this.#touch();
    return true;
  }

  submit(connectionId, payload) {
    if (this.status !== "playing" || !this.engine) throw new DuelRoomError("The duel is not running", "DUEL_NOT_RUNNING");
    const seat = this.#requireConnectionSeat(connectionId);
    const envelope = normalizeCommandEnvelope(payload);
    const receiptKey = `${seat.seatId}:${envelope.commandId}`;
    if (this.commandReceipts.has(receiptKey)) {
      return { ...clone(this.commandReceipts.get(receiptKey)), duplicate: true };
    }
    if (this.seatList().some((entry) => entry.seatId !== seat.seatId && !entry.connected)) {
      throw new DuelRoomError("对手正在重连，对局已暂停", "OPPONENT_DISCONNECTED");
    }
    if (envelope.revision !== this.revision) {
      throw new DuelRoomError(
        `Command revision ${envelope.revision} does not match room revision ${this.revision}`,
        "STALE_REVISION"
      );
    }

    const rivalSeatId = ROOM_SEAT_IDS.find((seatId) => seatId !== seat.seatId);
    const action = sanitizeOnlineAction(envelope.action, { seatId: seat.seatId, rivalId: rivalSeatId });
    let events;
    try {
      events = this.#dispatchAction(action);
    } catch (error) {
      if (error instanceof GameRuleError || error instanceof DuelProtocolError) {
        throw new DuelRoomError(error.message, "ILLEGAL_COMMAND");
      }
      throw error;
    }

    this.#touch();
    if (this.engine.getState().gameOver) this.status = "finished";
    const receipt = {
      commandId: envelope.commandId,
      revision: this.revision,
      eventIds: events.map((event) => event.id),
      duplicate: false
    };
    this.commandReceipts.set(receiptKey, receipt);
    while (this.commandReceipts.size > MAX_REMEMBERED_COMMANDS) {
      this.commandReceipts.delete(this.commandReceipts.keys().next().value);
    }
    return clone(receipt);
  }

  viewFor(seatId) {
    const seat = this.seats.get(seatId);
    if (!seat) throw new DuelRoomError(`Unknown room seat ${seatId}`, "UNKNOWN_SEAT");
    const seats = this.seatList().map(publicSeat);
    if (!this.engine) {
      return {
        protocolVersion: 1,
        roomCode: this.code,
        revision: this.revision,
        status: this.status,
        viewerSeatId: seatId,
        opponentSeatId: ROOM_SEAT_IDS.find((candidate) => candidate !== seatId),
        seats
      };
    }
    return buildDuelView(this.engine.getState(), seatId, {
      roomCode: this.code,
      revision: this.revision,
      status: this.status,
      seats
    });
  }

  #dispatchAction(action) {
    // A network command may dispatch several engine actions. Commit all or none.
    const engine = new GameEngine(this.engine.getState());
    const events = [];
    if (["RESPOND_TRAP", "PASS_ATTACK_RESPONSE"].includes(action.type)) {
      const state = engine.getState();
      const response = onlineAttackResponse(state, action.playerId);
      if (!response || response.declarationEventId !== action.declarationEventId) throw new GameRuleError("Attack response is no longer available");
      let canceledBy = null;
      if (action.type === "RESPOND_TRAP") {
        if (!response.candidates.some((candidate) => candidate.cardId === action.cardId)) throw new GameRuleError("Trap is not a legal response");
        const trapAction = onlineTrapAction(state, action.playerId, action.cardId);
        canceledBy = state.cards[action.cardId].trigger;
        events.push(...activateOnlineTrap(engine, trapAction));
      } else {
        events.push(...engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: action.playerId, reason: "online-player-pass" }));
      }
      events.push(...settleOnlineAttack(engine, { canceledBy }));
    } else {
      events.push(...engine.dispatch(action));
    }
    if (action.type === "DECLARE_ATTACK" && !engine.getState().gameOver) {
      const pending = engine.getState().machine.pendingAttack;
      if (!onlineAttackResponse(engine.getState(), pending.rivalId)?.candidates.length) {
        events.push(...engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: pending.rivalId, reason: "online-no-response" }));
        events.push(...settleOnlineAttack(engine));
      }
    }
    if (action.type === "END_TURN" && !engine.getState().gameOver) {
      const nextPlayerId = action.rivalId || ROOM_SEAT_IDS.find((seatId) => seatId !== action.playerId);
      events.push(...engine.dispatch({ type: "START_TURN", playerId: nextPlayerId }));
      events.push(...engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: nextPlayerId }));
    }
    this.engine = engine;
    return events;
  }

  #start() {
    const initialState = this.createState({ seatIds: ROOM_SEAT_IDS });
    this.engine = new GameEngine(initialState);
    this.status = "playing";
    this.#touch();
  }

  #startIfReady() {
    if (this.status !== "waiting" || this.seats.size !== ROOM_SEAT_IDS.length) return false;
    if (!this.seatList().every((entry) => entry.ready && entry.connected)) return false;
    this.#start();
    return true;
  }

  #touch() {
    this.revision += 1;
    this.updatedAt = this.now();
  }

  #requireConnectionSeat(connectionId) {
    const seat = this.seatForConnection(connectionId);
    if (!seat) throw new DuelRoomError("Connection has not joined this room", "NOT_IN_ROOM");
    return seat;
  }

  #joinResult(seat, resumed) {
    return {
      roomCode: this.code,
      seatId: seat.seatId,
      reconnectToken: seat.reconnectToken,
      resumed,
      view: this.viewFor(seat.seatId)
    };
  }
}
