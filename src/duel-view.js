import { getLegalActions } from "./game-engine.js";
import { otherSeatId, seatIdsForState } from "./duel-session.js";

const PUBLIC_EVENT_FIELDS = new Set([
  "id", "type", "playerId", "rivalId", "winnerId", "loserId", "loserIds",
  "phase", "fromPhase", "nextPhase", "timing", "amount", "requested", "count",
  "mode", "from", "to", "reason", "endedBy", "summonType", "ability", "uses",
  "comboId", "window", "windowType", "prompt", "damage", "destroyed",
  "attackerAtk", "targetValue", "targetMode", "direct", "result"
]);

const CARD_EVENT_FIELDS = new Set([
  "cardId", "sourceCardId", "targetCardId", "attackerCardId", "declarationEventId"
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function publicCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    templateId: card.templateId || card.id,
    ownerId: card.ownerId,
    name: card.name || card.templateId || "未知卡牌",
    type: card.type || "unknown",
    icon: card.icon || "",
    stars: Math.max(0, Number(card.stars) || 0),
    rarity: card.rarity || "",
    archetype: card.archetype || "",
    element: card.element || "",
    atk: Number(card.atk) || 0,
    def: Number(card.def) || 0,
    mode: card.mode || "attack",
    used: Boolean(card.used),
    changedMode: Boolean(card.changedMode),
    tempAtk: Number(card.tempAtk) || 0,
    tempDef: Number(card.tempDef) || 0,
    battleWear: Math.max(0, Number(card.battleWear) || 0),
    effect: card.effect || "",
    trigger: card.trigger || "",
    text: card.text || ""
  };
}

function hiddenCard(id) {
  return { id, hidden: true, name: "隐藏卡牌", type: "hidden" };
}

function zoneCards(state, cardIds = []) {
  return cardIds.map((cardId) => publicCard(state.cards?.[cardId])).filter(Boolean);
}

function fixedZoneCards(state, player, zoneName, { hidden = false, hiddenPrefix = "hidden" } = {}) {
  const slots = Array.isArray(player.zoneSlots?.[zoneName])
    ? player.zoneSlots[zoneName]
    : player[zoneName] || [];
  return slots.map((cardId, index) => {
    if (!cardId) return null;
    const card = state.cards?.[cardId];
    const concealed = typeof hidden === "function" ? hidden(card) : hidden;
    return concealed ? hiddenCard(`${hiddenPrefix}:${index}`) : publicCard(card);
  });
}

function visibleCardIds(state, viewerSeatId) {
  const visible = new Set();
  for (const [seatId, player] of Object.entries(state.players || {})) {
    const zones = seatId === viewerSeatId
      ? ["hand", "monsterZone", "spellTrapZone", "grave", "banished"]
      : ["monsterZone", "grave", "banished"];
    zones.forEach((zoneName) => (player[zoneName] || []).forEach((cardId) => visible.add(cardId)));
  }
  return visible;
}

function publicEvent(event, visibleIds) {
  if (!event || event.type === "COMMAND_DISPATCHED") return null;
  const result = {};
  for (const [key, value] of Object.entries(event)) {
    if (PUBLIC_EVENT_FIELDS.has(key)) {
      result[key] = clone(value);
      continue;
    }
    if (CARD_EVENT_FIELDS.has(key) && typeof value === "string" && visibleIds.has(value)) {
      result[key] = value;
      continue;
    }
    if (key === "cardIds" && Array.isArray(value)) {
      const cardIds = value.filter((cardId) => visibleIds.has(cardId));
      if (cardIds.length) result.cardIds = cardIds;
    }
  }
  return result;
}

function projectedPlayer(state, seatId, viewerSeatId) {
  const player = state.players[seatId];
  const own = seatId === viewerSeatId;
  return {
    id: seatId,
    lp: player.lp,
    deckCount: player.deck.length,
    handCount: player.hand.length,
    hand: own
      ? zoneCards(state, player.hand)
      : player.hand.map((_cardId, index) => hiddenCard(`hidden:hand:${index}`)),
    monsterZone: fixedZoneCards(state, player, "monsterZone"),
    spellTrapZone: fixedZoneCards(state, player, "spellTrapZone", {
      hidden: own ? false : (card) => card?.type === "trap",
      hiddenPrefix: "hidden:spell-trap"
    }),
    grave: zoneCards(state, player.grave),
    banished: zoneCards(state, player.banished),
    attacksSkipped: Boolean(player.attacksSkipped),
    normalSummonsUsed: Math.max(0, Number(player.normalSummonsUsed) || 0)
  };
}

function emptyLegalActions(state, viewerSeatId) {
  return {
    playerId: viewerSeatId,
    rivalId: otherSeatId(state, viewerSeatId),
    phase: state.turn?.phase || "setup",
    timing: state.machine?.timing || "setup",
    can: {
      summon: false,
      setTrap: false,
      activateCard: false,
      declareAttack: false,
      changeMode: false,
      endTurn: false
    },
    hasAny: false,
    actions: {
      summon: [],
      setTrap: [],
      activateCard: [],
      declareAttack: [],
      changeMode: [],
      endTurn: []
    }
  };
}

function publicMachineState(machine = {}) {
  const responseWindow = machine.responseWindow ? {
    playerId: machine.responseWindow.playerId,
    type: machine.responseWindow.type,
    timing: machine.responseWindow.timing,
    resumeTiming: machine.responseWindow.resumeTiming,
    deadline: machine.responseWindow.deadline || null
  } : null;
  const actionWindow = machine.actionWindow ? {
    playerId: machine.actionWindow.playerId,
    window: machine.actionWindow.window,
    reason: machine.actionWindow.reason || "",
    deadline: machine.actionWindow.deadline || null
  } : null;
  const pendingAttack = machine.pendingAttack ? {
    playerId: machine.pendingAttack.playerId,
    rivalId: machine.pendingAttack.rivalId,
    attackerCardId: machine.pendingAttack.attackerCardId,
    targetCardId: machine.pendingAttack.targetCardId || null,
    direct: Boolean(machine.pendingAttack.direct),
    declarationEventId: machine.pendingAttack.declarationEventId
  } : null;
  return {
    responseWindow,
    actionWindow,
    pendingAttack,
    chainLength: machine.chain?.length || 0
  };
}

export function buildDuelView(state, viewerSeatId, {
  roomCode = "",
  revision = 0,
  status = "playing",
  seats = []
} = {}) {
  const seatIds = seatIdsForState(state);
  if (!seatIds.includes(viewerSeatId)) throw new Error(`Unknown viewer seat ${viewerSeatId}`);
  const opponentSeatId = otherSeatId(state, viewerSeatId);
  const visibleIds = visibleCardIds(state, viewerSeatId);
  const canRequestLegalActions = status === "playing" && !state.gameOver;
  const legalActions = canRequestLegalActions
    ? getLegalActions(state, viewerSeatId)
    : emptyLegalActions(state, viewerSeatId);

  return {
    protocolVersion: 1,
    roomCode,
    revision,
    status,
    viewerSeatId,
    opponentSeatId,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      ready: Boolean(seat.ready),
      connected: Boolean(seat.connected)
    })),
    turn: {
      playerId: state.turn.playerId,
      phase: state.turn.phase,
      timing: state.machine?.timing || state.turn.phase
    },
    machine: publicMachineState(state.machine),
    players: Object.fromEntries(seatIds.map((seatId) => [
      seatId,
      projectedPlayer(state, seatId, viewerSeatId)
    ])),
    gameOver: clone(state.gameOver || null),
    legalActions,
    recentEvents: (state.events || [])
      .slice(-40)
      .map((event) => publicEvent(event, visibleIds))
      .filter(Boolean)
  };
}
