export const DuelMode = Object.freeze({
  solo: "solo",
  localPvp: "local-pvp",
  onlinePvp: "online-pvp"
});

export const ControllerKind = Object.freeze({
  human: "human",
  ai: "ai",
  remote: "remote"
});

export const DEFAULT_SEAT_IDS = Object.freeze(["player", "ai"]);

const duelModes = new Set(Object.values(DuelMode));
const controllerKinds = new Set(Object.values(ControllerKind));

function normalizedId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSeatIds(seatIds = DEFAULT_SEAT_IDS) {
  const ids = Array.from(seatIds || [], normalizedId).filter(Boolean);
  if (ids.length !== 2 || new Set(ids).size !== 2) {
    throw new Error("A duel session requires exactly two unique seat ids");
  }
  return ids;
}

export function normalizeControllers(seatIds, controllers = {}) {
  const ids = normalizeSeatIds(seatIds);
  return Object.fromEntries(ids.map((seatId) => {
    const requested = controllers?.[seatId];
    const fallback = seatId === "ai" ? ControllerKind.ai : ControllerKind.human;
    const controller = requested || fallback;
    if (!controllerKinds.has(controller)) {
      throw new Error(`Unknown controller ${controller} for seat ${seatId}`);
    }
    return [seatId, controller];
  }));
}

export function createDuelSessionConfig({
  mode = DuelMode.solo,
  seatIds = DEFAULT_SEAT_IDS,
  localPlayerId = null,
  controllers = null
} = {}) {
  if (!duelModes.has(mode)) throw new Error(`Unknown duel mode ${mode}`);
  const ids = normalizeSeatIds(seatIds);
  const localId = normalizedId(localPlayerId) || ids[0];
  if (!ids.includes(localId)) throw new Error(`Local player ${localId} is not a duel seat`);

  const defaultControllers = mode === DuelMode.solo
    ? { [ids[0]]: ControllerKind.human, [ids[1]]: ControllerKind.ai }
    : mode === DuelMode.onlinePvp
      ? Object.fromEntries(ids.map((id) => [id, id === localId ? ControllerKind.human : ControllerKind.remote]))
      : Object.fromEntries(ids.map((id) => [id, ControllerKind.human]));

  return {
    mode,
    seatIds: ids,
    localPlayerId: localId,
    controllers: normalizeControllers(ids, controllers || defaultControllers)
  };
}

function looksLikeUiDuelist(value, key) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.owner === key &&
    Array.isArray(value.deck) &&
    Array.isArray(value.hand)
  );
}

export function seatIdsForState(state = {}) {
  if (Array.isArray(state.seatIds)) return normalizeSeatIds(state.seatIds);

  const engineIds = Object.keys(state.players || {});
  if (engineIds.length === 2) return normalizeSeatIds(engineIds);

  const uiIds = Object.entries(state)
    .filter(([key, value]) => looksLikeUiDuelist(value, key))
    .map(([key]) => key);
  if (uiIds.length === 2) return normalizeSeatIds(uiIds);

  return [...DEFAULT_SEAT_IDS];
}

export function otherSeatId(state, seatId) {
  const ids = seatIdsForState(state);
  if (!ids.includes(seatId)) throw new Error(`Unknown duel seat ${seatId}`);
  return ids.find((id) => id !== seatId);
}

export function controllerForSeat(state, seatId) {
  const ids = seatIdsForState(state);
  return normalizeControllers(ids, state.controllers)[seatId];
}

export function isLocalSeat(state, seatId) {
  const ids = seatIdsForState(state);
  const localPlayerId = normalizedId(state.localPlayerId) || ids[0];
  return seatId === localPlayerId;
}

export function isAutomatedSeat(state, seatId) {
  return controllerForSeat(state, seatId) === ControllerKind.ai;
}
