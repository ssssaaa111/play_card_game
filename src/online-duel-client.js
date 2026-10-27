import { DuelClientMessage, DuelServerMessage, createClientMessage } from "./duel-command.js";

function defaultServerUrl() {
  if (typeof window === "undefined") return "ws://127.0.0.1:5178/duel";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const configured = new URLSearchParams(window.location.search).get("duelServer");
  return configured || `${protocol}//${window.location.hostname}:5178/duel`;
}
function requestId() {
  return globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class OnlineDuelClient {
  constructor({ url = defaultServerUrl(), WebSocketImpl = globalThis.WebSocket, requestTimeoutMs = 8_000 } = {}) {
    if (!WebSocketImpl) throw new Error("WebSocket is not available in this environment");
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket = null;
    this.connectionPromise = null;
    this.view = null;
    this.session = null;
    this.pending = new Map();
    this.listeners = new Map();
  }

  on(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  connect() {
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(this.url);
      this.socket = socket;
      const handleOpen = () => {
        cleanup();
        this.connectionPromise = null;
        resolve();
      };
      const handleError = () => {
        cleanup();
        if (this.socket === socket) this.socket = null;
        this.connectionPromise = null;
        reject(new Error(`Unable to connect to ${this.url}`));
      };
      const cleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
      };
      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleError);
      socket.addEventListener("message", (event) => this.#handleMessage(event.data));
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.connectionPromise = null;
        this.#rejectPending(new Error("Duel server connection closed"));
        this.#emit("connection", { connected: false });
      });
    });
    return this.connectionPromise;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }

  async createRoom(name) {
    const data = await this.request(DuelClientMessage.createRoom, { name });
    this.#acceptSession(data);
    return data;
  }

  async joinRoom(roomCode, name) {
    const data = await this.request(DuelClientMessage.joinRoom, { roomCode, name });
    this.#acceptSession(data);
    return data;
  }

  async resumeRoom(session = this.session) {
    if (!session?.roomCode || !session?.reconnectToken) throw new Error("No resumable duel session");
    const data = await this.request(DuelClientMessage.resumeRoom, session);
    this.#acceptSession(data);
    return data;
  }

  setReady(ready = true) {
    return this.request(DuelClientMessage.setReady, { ready });
  }

  leaveRoom() {
    return this.request(DuelClientMessage.leaveRoom, {});
  }

  forfeitRoom() {
    return this.request(DuelClientMessage.forfeitRoom, {});
  }

  sync() {
    return this.request(DuelClientMessage.syncRoom, {});
  }

  sendAction(action) {
    if (!this.view) throw new Error("No synchronized duel view");
    return this.request(DuelClientMessage.command, {
      revision: this.view.revision,
      commandId: requestId(),
      action
    });
  }

  request(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN) {
      return Promise.reject(new Error("Duel server is not connected"));
    }
    const id = requestId();
    const message = createClientMessage(type, payload, id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Duel request timed out: ${type}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(message));
    });
  }

  #acceptSession(data) {
    this.session = {
      roomCode: data.roomCode,
      seatId: data.seatId,
      reconnectToken: data.reconnectToken
    };
    if (data.view) this.#acceptView(data.view);
  }

  #handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : String(raw));
    } catch {
      this.#emit("error", new Error("Duel server sent invalid JSON"));
      return;
    }
    if (message.type === DuelServerMessage.roomState) {
      this.#acceptView(message.data);
      return;
    }
    const pending = message.requestId ? this.pending.get(message.requestId) : null;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      if (message.type === DuelServerMessage.error) {
        const error = new Error(message.error?.message || "Duel request failed");
        error.code = message.error?.code || "REQUEST_FAILED";
        pending.reject(error);
      } else {
        if (message.data?.view) this.#acceptView(message.data.view);
        pending.resolve(message.data || {});
      }
      return;
    }
    if (message.type === DuelServerMessage.connected) this.#emit("connection", { connected: true, ...message.data });
  }

  #acceptView(view) {
    this.view = view;
    this.#emit("view", view);
  }

  #emit(type, value) {
    for (const listener of this.listeners.get(type) || []) listener(value);
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
