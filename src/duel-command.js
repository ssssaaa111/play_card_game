export const DuelClientMessage = Object.freeze({
  createRoom: "room/create",
  joinRoom: "room/join",
  resumeRoom: "room/resume",
  setReady: "room/ready",
  syncRoom: "room/sync",
  leaveRoom: "room/leave",
  requestRematch: "room/rematch",
  forfeitRoom: "duel/forfeit",
  command: "duel/command",
  ping: "transport/ping"
});

export const DuelServerMessage = Object.freeze({
  connected: "transport/connected",
  ack: "request/ack",
  error: "request/error",
  roomState: "room/state",
  pong: "transport/pong"
});

export const OnlineCommandType = Object.freeze({
  summonMonster: "SUMMON_MONSTER",
  setTrap: "SET_TRAP",
  activateCard: "ACTIVATE_CARD",
  changeMonsterMode: "CHANGE_MONSTER_MODE",
  changePhase: "CHANGE_PHASE",
  declareAttack: "DECLARE_ATTACK",
  respondTrap: "RESPOND_TRAP",
  passAttackResponse: "PASS_ATTACK_RESPONSE",
  skipRemainingAttacks: "SKIP_REMAINING_ATTACKS",
  endTurn: "END_TURN"
});

const clientMessageTypes = new Set(Object.values(DuelClientMessage));
const onlineCommandTypes = new Set(Object.values(OnlineCommandType));
const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;

export class DuelProtocolError extends Error {
  constructor(message, code = "INVALID_MESSAGE") {
    super(message);
    this.name = "DuelProtocolError";
    this.code = code;
  }
}
function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredString(value, label, { maxLength = 160, pattern = null } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength || (pattern && !pattern.test(normalized))) {
    throw new DuelProtocolError(`${label} is invalid`);
  }
  return normalized;
}

function optionalIdentifier(value, label) {
  if (value == null || value === "") return null;
  return requiredString(value, label, { pattern: IDENTIFIER_PATTERN });
}

function optionalIndex(value, label) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new DuelProtocolError(`${label} must be a non-negative slot index`);
  }
  return value;
}

function identifierList(value, label, maxLength = 5) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new DuelProtocolError(`${label} is invalid`);
  }
  const ids = value.map((entry, index) => requiredString(entry, `${label}[${index}]`, { pattern: IDENTIFIER_PATTERN }));
  if (new Set(ids).size !== ids.length) throw new DuelProtocolError(`${label} contains duplicate ids`);
  return ids;
}

export function normalizeRoomCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ROOM_CODE_PATTERN.test(code)) throw new DuelProtocolError("Room code must contain 6 letters or digits");
  return code;
}

export function normalizeDisplayName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 24) throw new DuelProtocolError("Display name must contain 1 to 24 characters");
  return name;
}

export function parseClientMessage(input) {
  let message = input;
  if (typeof input === "string") {
    if (input.length > 32_768) throw new DuelProtocolError("Message is too large", "MESSAGE_TOO_LARGE");
    try {
      message = JSON.parse(input);
    } catch {
      throw new DuelProtocolError("Message must be valid JSON");
    }
  }
  if (!plainObject(message)) throw new DuelProtocolError("Message must be an object");
  if (!clientMessageTypes.has(message.type)) throw new DuelProtocolError(`Unknown message type ${message.type || "(missing)"}`);
  const requestId = requiredString(message.requestId, "requestId", { maxLength: 80, pattern: IDENTIFIER_PATTERN });
  const payload = message.payload == null ? {} : message.payload;
  if (!plainObject(payload)) throw new DuelProtocolError("payload must be an object");
  return { type: message.type, requestId, payload };
}

export function createClientMessage(type, payload = {}, requestId = "") {
  if (!clientMessageTypes.has(type)) throw new DuelProtocolError(`Unknown message type ${type}`);
  if (!plainObject(payload)) throw new DuelProtocolError("payload must be an object");
  return {
    type,
    requestId: requestId || globalThis.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload
  };
}

export function normalizeCommandEnvelope(payload = {}) {
  if (!plainObject(payload)) throw new DuelProtocolError("Command payload must be an object");
  const revision = Number(payload.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new DuelProtocolError("Command revision must be a non-negative integer", "INVALID_REVISION");
  }
  const commandId = requiredString(payload.commandId, "commandId", { maxLength: 80, pattern: IDENTIFIER_PATTERN });
  if (!plainObject(payload.action)) throw new DuelProtocolError("Command action must be an object");
  return { revision, commandId, action: payload.action };
}

export function sanitizeOnlineAction(action, { seatId, rivalId } = {}) {
  if (!plainObject(action)) throw new DuelProtocolError("Action must be an object");
  if (!onlineCommandTypes.has(action.type)) {
    throw new DuelProtocolError(`Action ${action.type || "(missing)"} is not available online`, "UNSUPPORTED_COMMAND");
  }
  const playerId = requiredString(seatId, "seatId", { pattern: IDENTIFIER_PATTERN });
  const opponentId = requiredString(rivalId, "rivalId", { pattern: IDENTIFIER_PATTERN });
  const cardId = () => requiredString(action.cardId, "cardId", { pattern: IDENTIFIER_PATTERN });
  let sanitized;

  switch (action.type) {
    case OnlineCommandType.summonMonster: {
      sanitized = {
        type: action.type,
        playerId,
        rivalId: opponentId,
        cardId: cardId()
      };
      const index = optionalIndex(action.index, "index");
      if (index != null) sanitized.index = index;
      const tributeCardIds = identifierList(action.tributeCardIds, "tributeCardIds");
      if (tributeCardIds.length) sanitized.tributeCardIds = tributeCardIds;
      break;
    }
    case OnlineCommandType.setTrap: {
      sanitized = { type: action.type, playerId, cardId: cardId() };
      const index = optionalIndex(action.index, "index");
      if (index != null) sanitized.index = index;
      break;
    }
    case OnlineCommandType.activateCard: {
      sanitized = {
        type: action.type,
        playerId,
        rivalId: opponentId,
        cardId: cardId()
      };
      for (const key of ["targetCardId", "fusionResultTemplateId"]) {
        const value = optionalIdentifier(action[key], key);
        if (value) sanitized[key] = value;
      }
      const materialCardIds = identifierList(action.materialCardIds, "materialCardIds", 8);
      if (materialCardIds.length) sanitized.materialCardIds = materialCardIds;
      const index = optionalIndex(action.index, "index");
      if (index != null) sanitized.index = index;
      break;
    }
    case OnlineCommandType.changeMonsterMode: {
      if (!new Set(["attack", "defense"]).has(action.mode)) {
        throw new DuelProtocolError("Monster mode must be attack or defense");
      }
      sanitized = { type: action.type, playerId, cardId: cardId(), mode: action.mode };
      break;
    }
    case OnlineCommandType.changePhase: {
      if (action.phase !== "battle") throw new DuelProtocolError("Online players may only advance to battle phase");
      sanitized = { type: action.type, playerId, phase: action.phase };
      break;
    }
    case OnlineCommandType.declareAttack: {
      sanitized = {
        type: action.type,
        playerId,
        rivalId: opponentId,
        attackerCardId: requiredString(action.attackerCardId, "attackerCardId", { pattern: IDENTIFIER_PATTERN })
      };
      const targetCardId = optionalIdentifier(action.targetCardId, "targetCardId");
      if (targetCardId) sanitized.targetCardId = targetCardId;
      break;
    }
    case OnlineCommandType.skipRemainingAttacks:
      sanitized = { type: action.type, playerId };
      break;
    case OnlineCommandType.respondTrap:
    case OnlineCommandType.passAttackResponse: {
      if (!Number.isSafeInteger(action.declarationEventId) || action.declarationEventId <= 0) {
        throw new DuelProtocolError("declarationEventId must be a positive integer");
      }
      sanitized = { type: action.type, playerId, declarationEventId: action.declarationEventId };
      if (action.type === OnlineCommandType.respondTrap) sanitized.cardId = cardId();
      break;
    }
    case OnlineCommandType.endTurn:
      sanitized = { type: action.type, playerId, reason: "online-player", endedBy: "online-player" };
      break;
    default:
      throw new DuelProtocolError("Unsupported online action", "UNSUPPORTED_COMMAND");
  }

  return sanitized;
}
