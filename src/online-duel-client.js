import { DuelClientMessage, DuelServerMessage, createClientMessage } from "./duel-command.js?v=20261114-public-history-1";

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
  constructor({ url = defaultServerUrl(), WebSocketImpl = globalThis.WebSocket, requestTimeoutMs = 8_000, connectTimeoutMs = 8_000, timers = globalThis } = {}) {
    if (!WebSocketImpl) throw new Error("WebSocket is not available in this environment");
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.timers = timers;
    this.connectAttempt = null;
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
    let socket;
    try { socket = new this.WebSocketImpl(this.url); }
    catch { return Promise.reject(Object.assign(new Error("无法连接对战服务，请检查网络或服务地址。"), { code: "CONNECT_FAILED" })); }
    this.socket = socket;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    this.connectionPromise = promise;
    const cleanup = () => {
      this.timers.clearTimeout(timer);
      socket.removeEventListener("open", handleOpen);
      this.connectAttempt = null;
      this.connectionPromise = null;
    };
    const fail = (error) => { cleanup(); reject(error); };
    const handleOpen = () => {
      if (this.socket !== socket) return;
      cleanup(); resolve();
    };
    const timer = this.timers.setTimeout(() => {
      if (this.socket === socket) this.resetConnection(Object.assign(new Error("连接对战服务超时，可检查网络后重试。"), { code: "CONNECT_TIMEOUT" }));
    }, this.connectTimeoutMs);
    this.connectAttempt = { fail };
    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", (event) => { if (this.socket === socket) this.#handleMessage(event.data); });
    socket.addEventListener("error", () => {
      if (this.socket === socket) this.resetConnection(Object.assign(new Error("对战连接发生错误，正在重新同步。"), { code: "CONNECTION_LOST" }));
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.resetConnection(Object.assign(new Error("对战连接已中断，已发送操作不会自动重发。"), { code: "CONNECTION_LOST" }));
    });
    return promise;
  }

  disconnect() {
    this.resetConnection(Object.assign(new Error("连接已关闭。"), { code: "DISCONNECTED" }), { notify: false });
  }

  resetConnection(error = Object.assign(new Error("网络已中断，正在恢复最新战况。"), { code: "CONNECTION_LOST" }), { notify = true } = {}) {
    const socket = this.socket;
    this.socket = null;
    this.connectAttempt?.fail(error);
    this.#rejectPending(error);
    try { socket?.close(); } catch {}
    if (socket && notify) this.#emit("connection", { connected: false, reason: error.message, code: error.code });
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

  setDeck(deck) {
    return this.request(DuelClientMessage.setDeck, { deck });
  }

  setSpectatorConsent(allowed) {
    return this.request(DuelClientMessage.setSpectatorConsent, { allowed });
  }

  async watchRoom(roomCode) {
    const result = await this.request(DuelClientMessage.watchRoom, { roomCode });
    this.session = { roomCode: result.roomCode, role: "spectator" };
    return result;
  }

  leaveRoom() {
    return this.request(DuelClientMessage.leaveRoom, {});
  }

  requestRematch() {
    return this.request(DuelClientMessage.requestRematch, {});
  }

  forfeitRoom() {
    return this.request(DuelClientMessage.forfeitRoom, {});
  }

  sync() {
    return this.request(DuelClientMessage.syncRoom, {});
  }

  publicHistory(query = {}) {
    return this.request(DuelClientMessage.publicHistory, query);
  }

  sendAction(action) {
    if (this.view?.viewerRole === "spectator") throw new Error("观战连接不能操作对局");
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
      const timer = this.timers.setTimeout(() => {
        if (this.pending.has(id)) this.resetConnection(Object.assign(new Error("服务响应超时，正在核对最新战况；已发送操作不会自动重发。"), { code: "RESPONSE_TIMEOUT" }));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify(message)); }
      catch { this.resetConnection(Object.assign(new Error("发送未能确认，正在重新同步；请勿重复操作。"), { code: "SEND_FAILED" })); }
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
    if (message.type === DuelServerMessage.watchEnded) {
      this.view = null;
      this.session = null;
      this.#emit("watch-ended", message.data);
      return;
    }
    const pending = message.requestId ? this.pending.get(message.requestId) : null;
    if (pending) {
      this.timers.clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      if (message.type === DuelServerMessage.error) {
        const error = new Error(message.error?.message || "Duel request failed");
        error.code = message.error?.code || "REQUEST_FAILED";
        pending.reject(error);
      } else {
        if (message.data?.view) this.#acceptView(message.data.view);
        pending.resolve(message.data?.view ? { ...message.data, view: this.view } : message.data || {});
      }
      return;
    }
    if (message.type === DuelServerMessage.connected) this.#emit("connection", { connected: true, ...message.data });
  }

  #acceptView(view) {
    if (this.view?.roomCode === view.roomCode && Number(view.revision) < Number(this.view.revision)) return;
    this.view = view;
    this.#emit("view", view);
  }

  #emit(type, value) {
    for (const listener of this.listeners.get(type) || []) listener(value);
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) {
      this.timers.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
