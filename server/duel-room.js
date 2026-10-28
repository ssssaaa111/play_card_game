import { randomBytes } from "node:crypto";

import { GameEngine, GameRuleError } from "../src/game-engine.js";
import { DuelProtocolError, normalizeCommandEnvelope, normalizeDisplayName, sanitizeOnlineAction } from "../src/duel-command.js";
import { buildDuelView } from "../src/duel-view.js";
import { createOnlineDuelState } from "./online-duel-state.js";
import { onlineAttackResponse, onlineTrapAction, activateOnlineTrap, settleOnlineAttack } from "../src/online-response.js";

const ROOM_SEAT_IDS = Object.freeze(["p1", "p2"]);
const MAX_REMEMBERED_COMMANDS = 100;
const DEFAULT_RESPONSE_TIMEOUT_MS = 15_000;
const DEFAULT_DISCONNECT_GRACE_MS = 60_000;

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
    connected: seat.connected,
    reconnectDeadlineAt: seat.connected ? null : seat.reconnectDeadlineAt || null
  };
}

export class DuelRoom {
  constructor({
    code,
    createState = createOnlineDuelState,
    now = () => Date.now(),
    responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
    disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS
  } = {}) {
    if (!code) throw new DuelRoomError("Room code is required");
    this.code = code;
    this.createState = createState;
    this.now = now;
    this.revision = 0;
    this.status = "waiting";
    this.engine = null;
    this.duelNumber = 0;
    this.recordedDuelNumber = 0;
    this.series = { completed: 0, draws: 0, wins: { p1: 0, p2: 0 } };
    this.createdAt = now();
    this.updatedAt = this.createdAt;
    this.responseTimeoutMs = Math.max(1_000, Number(responseTimeoutMs) || DEFAULT_RESPONSE_TIMEOUT_MS);
    this.disconnectGraceMs = Math.max(1_000, Number(disconnectGraceMs) || DEFAULT_DISCONNECT_GRACE_MS);
    this.responseDeclarationEventId = null;
    this.responseDeadlineAt = null;
    this.responseRemainingMs = null;
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

  join({ name, accountId = "", connectionId, reconnectToken = "" } = {}) {
    if (!connectionId) throw new DuelRoomError("Connection id is required", "INVALID_CONNECTION");
    const resumed = reconnectToken ? this.seatForToken(reconnectToken) : null;
    if (resumed) {
      if (resumed.accountId && resumed.accountId !== accountId) {
        throw new DuelRoomError("This room seat belongs to another account", "ACCOUNT_MISMATCH");
      }
      if (this.status === "playing" && resumed.reconnectDeadlineAt != null && this.now() >= resumed.reconnectDeadlineAt) {
        this.expireDisconnectTimeout();
      }
      resumed.connectionId = connectionId;
      resumed.connected = true;
      resumed.reconnectDeadlineAt = null;
      resumed.lastSeenAt = this.now();
      this.#resumeResponseTimer();
      this.#touch();
      this.#startIfReady();
      return this.#joinResult(resumed, true);
    }
    if (this.status !== "waiting") throw new DuelRoomError("The duel has already started", "ROOM_STARTED");
    if (this.seatForConnection(connectionId)) throw new DuelRoomError("Connection already joined this room", "ALREADY_JOINED");
    if (accountId && this.seatList().some((seat) => seat.accountId === accountId)) {
      throw new DuelRoomError("This account already owns a seat in the room", "ACCOUNT_ALREADY_SEATED");
    }
    const seatId = ROOM_SEAT_IDS.find((candidate) => !this.seats.has(candidate));
    if (!seatId) throw new DuelRoomError("The room is full", "ROOM_FULL");
    const seat = {
      seatId,
      name: normalizeDisplayName(name),
      accountId,
      connectionId,
      reconnectToken: token(),
      ready: false,
      connected: true,
      reconnectDeadlineAt: null,
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

  requestRematch(connectionId) {
    if (this.status !== "finished" || !this.engine?.getState()?.gameOver) {
      throw new DuelRoomError("A rematch is only available after the duel ends", "REMATCH_NOT_AVAILABLE");
    }
    const seat = this.#requireConnectionSeat(connectionId);
    if (!seat.ready) {
      seat.ready = true;
      seat.lastSeenAt = this.now();
      this.#touch();
    }
    this.#startIfReady();
    return this.viewFor(seat.seatId);
  }

  disconnect(connectionId) {
    const seat = this.seatForConnection(connectionId);
    if (!seat) return false;
    this.#pauseResponseTimer();
    seat.connected = false;
    seat.connectionId = null;
    seat.lastSeenAt = this.now();
    seat.reconnectDeadlineAt = this.status === "playing" ? seat.lastSeenAt + this.disconnectGraceMs : null;
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

  forfeit(connectionId) {
    if (this.status !== "playing" || !this.engine) throw new DuelRoomError("The duel is not running", "DUEL_NOT_RUNNING");
    const seat = this.#requireConnectionSeat(connectionId);
    const winnerId = ROOM_SEAT_IDS.find((seatId) => seatId !== seat.seatId);
    const engine = new GameEngine(this.engine.getState());
    engine.dispatch({
      type: "DECLARE_GAME_OVER",
      playerId: seat.seatId,
      winnerId,
      loserIds: [seat.seatId],
      reason: "concede",
      declaredAt: this.now()
    });
    this.engine = engine;
    this.status = "finished";
    this.#recordDuelResult();
    this.#clearResponseTimer();
    this.#clearDisconnectDeadlines();
    this.#touch();
    return this.viewFor(seat.seatId);
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

    if (this.engine.getState().gameOver) {
      this.status = "finished";
      this.#recordDuelResult();
    }
    this.#touch();
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
        duelNumber: this.duelNumber,
        nextFirstPlayerId: this.#nextFirstPlayerId(),
        series: clone(this.series),
        viewerSeatId: seatId,
        opponentSeatId: ROOM_SEAT_IDS.find((candidate) => candidate !== seatId),
        seats
      };
    }
    const view = buildDuelView(this.engine.getState(), seatId, {
      roomCode: this.code,
      revision: this.revision,
      status: this.status,
      duelNumber: this.duelNumber,
      nextFirstPlayerId: this.#nextFirstPlayerId(),
      series: clone(this.series),
      seats
    });
    view.responseTimer = this.responseTimeoutView();
    return view;
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
    this.#syncResponseTimer();
    return events;
  }

  responseTimeoutView() {
    if (!this.responseDeclarationEventId) return null;
    return {
      declarationEventId: this.responseDeclarationEventId,
      deadlineAt: this.responseDeadlineAt,
      remainingMs: this.responseRemainingMs,
      paused: this.responseDeadlineAt == null
    };
  }

  responseTimeoutDelay() {
    if (this.responseDeadlineAt == null) return null;
    return Math.max(0, this.responseDeadlineAt - this.now());
  }

  disconnectTimeoutDelay() {
    if (this.status !== "playing") return null;
    const deadlines = this.seatList()
      .filter((seat) => !seat.connected && seat.reconnectDeadlineAt != null)
      .map((seat) => seat.reconnectDeadlineAt);
    if (!deadlines.length) return null;
    return Math.max(0, Math.min(...deadlines) - this.now());
  }

  expireDisconnectTimeout() {
    if (this.status !== "playing" || !this.engine) return false;
    const expired = this.seatList().filter((seat) => (
      !seat.connected && seat.reconnectDeadlineAt != null && this.now() >= seat.reconnectDeadlineAt
    ));
    if (!expired.length) return false;
    const connected = this.seatList().filter((seat) => seat.connected);
    const winnerId = connected.length === 1 ? connected[0].seatId : null;
    const loserIds = winnerId ? ROOM_SEAT_IDS.filter((seatId) => seatId !== winnerId) : ROOM_SEAT_IDS;
    const engine = new GameEngine(this.engine.getState());
    engine.dispatch({
      type: "DECLARE_GAME_OVER",
      playerId: expired[0].seatId,
      winnerId,
      loserIds,
      reason: "disconnect-timeout",
      declaredAt: this.now()
    });
    this.engine = engine;
    this.status = "finished";
    this.#recordDuelResult();
    this.#clearResponseTimer();
    this.#clearDisconnectDeadlines();
    this.#touch();
    return true;
  }

  expireAttackResponse() {
    if (!this.engine || this.responseDeadlineAt == null || this.now() < this.responseDeadlineAt) return false;
    const state = this.engine.getState();
    const pending = state.machine?.pendingAttack;
    const response = pending ? onlineAttackResponse(state, pending.rivalId) : null;
    if (!pending || !response || response.declarationEventId !== this.responseDeclarationEventId) {
      this.#clearResponseTimer();
      return false;
    }
    const engine = new GameEngine(state);
    engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: pending.rivalId, reason: "online-response-timeout" });
    settleOnlineAttack(engine);
    this.engine = engine;
    this.#clearResponseTimer();
    if (this.engine.getState().gameOver) {
      this.status = "finished";
      this.#recordDuelResult();
    }
    this.#touch();
    return true;
  }

  #start() {
    const firstPlayerId = this.#nextFirstPlayerId();
    const seatIds = [firstPlayerId, ...ROOM_SEAT_IDS.filter((seatId) => seatId !== firstPlayerId)];
    const initialState = this.createState({ seatIds });
    this.engine = new GameEngine(initialState);
    this.duelNumber += 1;
    this.status = "playing";
    this.commandReceipts.clear();
    this.#clearResponseTimer();
    this.seatList().forEach((seat) => {
      seat.ready = false;
      seat.reconnectDeadlineAt = null;
    });
    this.#touch();
  }

  #startIfReady() {
    if (!["waiting", "finished"].includes(this.status) || this.seats.size !== ROOM_SEAT_IDS.length) return false;
    if (!this.seatList().every((entry) => entry.ready && entry.connected)) return false;
    this.#start();
    return true;
  }

  #nextFirstPlayerId() {
    return ROOM_SEAT_IDS[this.duelNumber % ROOM_SEAT_IDS.length];
  }

  #recordDuelResult() {
    if (!this.engine || this.recordedDuelNumber === this.duelNumber) return false;
    const gameOver = this.engine.getState().gameOver;
    if (!gameOver) return false;
    const winnerId = gameOver.winnerId;
    if (winnerId && Object.hasOwn(this.series.wins, winnerId)) this.series.wins[winnerId] += 1;
    else this.series.draws += 1;
    this.series.completed += 1;
    this.recordedDuelNumber = this.duelNumber;
    return true;
  }

  #syncResponseTimer() {
    const pending = this.engine?.getState()?.machine?.pendingAttack;
    const responseWindow = this.engine?.getState()?.machine?.responseWindow;
    const declarationEventId = pending?.declarationEventId || null;
    if (!pending || !responseWindow || !declarationEventId) {
      this.#clearResponseTimer();
      return;
    }
    if (this.responseDeclarationEventId === declarationEventId) return;
    this.responseDeclarationEventId = declarationEventId;
    this.responseDeadlineAt = this.now() + this.responseTimeoutMs;
    this.responseRemainingMs = null;
  }

  #pauseResponseTimer() {
    if (this.responseDeadlineAt == null) return;
    this.responseRemainingMs = Math.max(0, this.responseDeadlineAt - this.now());
    this.responseDeadlineAt = null;
  }

  #resumeResponseTimer() {
    if (this.status !== "playing" || this.responseDeclarationEventId == null || this.responseRemainingMs == null) return;
    if (!this.seatList().every((entry) => entry.connected)) return;
    this.responseDeadlineAt = this.now() + this.responseRemainingMs;
    this.responseRemainingMs = null;
  }

  #clearResponseTimer() {
    this.responseDeclarationEventId = null;
    this.responseDeadlineAt = null;
    this.responseRemainingMs = null;
  }

  #clearDisconnectDeadlines() {
    this.seatList().forEach((seat) => { seat.reconnectDeadlineAt = null; });
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
