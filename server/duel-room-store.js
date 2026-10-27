import { randomBytes } from "node:crypto";

import { DuelRoom, DuelRoomError } from "./duel-room.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}
export class DuelRoomStore {
  constructor({ createRoom = (options) => new DuelRoom(options), roomTtlMs = 6 * 60 * 60 * 1000 } = {}) {
    this.createRoomInstance = createRoom;
    this.roomTtlMs = roomTtlMs;
    this.rooms = new Map();
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

  deleteExpired(now = Date.now()) {
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
