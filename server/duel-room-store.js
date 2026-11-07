import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DuelRoom, DuelRoomError } from "./duel-room.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomPersistenceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "RoomPersistenceError";
    this.code = "ROOM_STORAGE_FAILED";
  }
}

function randomRoomCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}
export class DuelRoomStore {
  constructor({ createRoom = (options) => new DuelRoom(options), roomTtlMs = 6 * 60 * 60 * 1000, filePath = null, now = () => Date.now() } = {}) {
    this.createRoomInstance = createRoom;
    this.roomTtlMs = roomTtlMs;
    this.rooms = new Map();
    this.filePath = filePath;
    this.now = now;
    this.#load();
  }

  create() {
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    const room = this.createRoomInstance({ code });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code) || null;
  }

  require(code) {
    const room = this.get(code);
    if (!room) throw new DuelRoomError("Room not found", "ROOM_NOT_FOUND");
    return room;
  }

  save() {
    if (!this.filePath) return false;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const data = { version: 1, rooms: [...this.rooms.values()].map((room) => room.toSnapshot()) };
      // Rename only after the whole new document is written. A killed process leaves the previous file intact.
      const temporaryPath = `${this.filePath}.tmp`;
      const descriptor = openSync(temporaryPath, "w", 0o600);
      try {
        writeFileSync(descriptor, JSON.stringify(data));
        fsyncSync(descriptor);
      } finally { closeSync(descriptor); }
      renameSync(temporaryPath, this.filePath);
      return true;
    } catch (cause) {
      throw new RoomPersistenceError("房间存档写入失败，服务已停止确认新行动，请检查存储后重启。", cause);
    }
  }

  #load() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (data?.version !== 1 || !Array.isArray(data.rooms)) throw new Error("Unsupported room store format");
      const rooms = new Map();
      for (const snapshot of data.rooms) {
        const room = this.createRoomInstance({ code: snapshot?.code });
        room.restoreSnapshot(snapshot);
        if (rooms.has(room.code)) throw new Error("Duplicate room code");
        if (this.now() - snapshot.updatedAt <= this.roomTtlMs) rooms.set(room.code, room);
      }
      this.rooms = rooms;
    } catch (cause) {
      throw new RoomPersistenceError("房间存档读取失败，未覆盖原文件。请检查文件与服务版本。", cause);
    }
  }

  deleteExpired(now = this.now()) {
    let deleted = 0;
    for (const [code, room] of this.rooms) {
      if (now - room.updatedAt > this.roomTtlMs) {
        this.rooms.delete(code);
        deleted += 1;
      }
    }
    return deleted;
  }
}
