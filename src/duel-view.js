import { getLegalActions } from "./game-engine.js";
import { otherSeatId, seatIdsForState } from "./duel-session.js";
import { onlineAttackResponse, onlineChainResponse, onlineSummonResponse } from "./online-response.js";
import { onlineHandBlocker } from "./online-hand-feedback.js";
import { effectMarkersForCard } from "./effect-markers.js";

const PUBLIC_EVENT_FIELDS = new Set([
  "id", "type", "playerId", "rivalId", "winnerId", "loserId", "loserIds",
  "phase", "fromPhase", "nextPhase", "timing", "amount", "requested", "count",
  "mode", "from", "to", "index", "reason", "endedBy", "summonType", "ability", "uses",
  "comboId", "window", "windowType", "prompt", "damage", "destroyed",
  "attackerAtk", "targetValue", "targetMode", "direct", "result", "linkId", "skipped"
]);

const CARD_EVENT_FIELDS = new Set([
  "cardId", "sourceCardId", "targetCardId", "targetEffectId", "attackerCardId", "declarationEventId"
]);

const PUBLIC_BATTLE_OUTCOME_FIELDS = new Set([
  "kind", "attack", "targetValue", "diff", "finalDamage", "damagePlayerId",
  "destroysAttacker", "destroysTarget", "wear", "piercing"
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
    attackLockReason: card.attackLockReason || null,
    destructionProtection: Boolean(card.destructionProtection),
    destructionProtectionUsed: Boolean(card.destructionProtectionUsed),
    tempAtk: Number(card.tempAtk) || 0,
    tempDef: Number(card.tempDef) || 0,
    battleWear: Math.max(0, Number(card.battleWear) || 0),
    effect: card.effect || "",
    trigger: card.trigger || "",
    text: card.type === "trap" ? (card.text || "").replace("盖放后自动触发：", "盖放后可发动：") : card.text || ""
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
    if (concealed) return hiddenCard(`${hiddenPrefix}:${index}`);
    const projected = publicCard(card);
    if (projected?.type === "monster" && zoneName === "monsterZone") {
      const publiclyVisible = (id) => Object.values(state.players).some((owner) =>
        ["monsterZone", "grave", "banished"].some((zone) => owner[zone]?.includes(id))
        || (owner.spellTrapZone?.includes(id) && state.cards[id]?.type === "spell"));
      projected.effectMarkers = effectMarkersForCard({
        card, duelist: player, gameEvents: state.events,
        findCard: (id) => publiclyVisible(id) ? state.cards[id] : null
      }).map(({ label, tone, detail }) => ({
        label, tone,
        detail: ["buff", "debuff", "modifier"].includes(tone)
          ? `${detail} 数值修正随怪兽离场重置。` : detail
      }));
    }
    return projected;
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
    if (key === "outcome" && value && typeof value === "object") {
      result.outcome = Object.fromEntries(
        Object.entries(value)
          .filter(([field]) => PUBLIC_BATTLE_OUTCOME_FIELDS.has(field))
          .map(([field, entry]) => [field, clone(entry)])
      );
      continue;
    }
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

function latestCompletedChainEvents(events = []) {
  const completedIndex = events.findLastIndex((event) => event?.type === "CHAIN_RESOLVED");
  if (completedIndex < 0) return [];
  const previousCompletedIndex = events.slice(0, completedIndex).findLastIndex((event) => event?.type === "CHAIN_RESOLVED");
  const chainTypes = new Set(["CHAIN_LINK_RESOLVED", "EFFECT_SKIPPED", "CHAIN_RESOLVED"]);
  const chain = events
    .slice(previousCompletedIndex + 1, completedIndex + 1)
    .filter((event) => chainTypes.has(event?.type));
  const aftermathTypes = new Set(["DAMAGE_DEALT", "BATTLE_RESOLVED", "ATTACK_CANCELED", "ATTACK_TARGET_CHANGED"]);
  const aftermath = events
    .slice(completedIndex + 1, completedIndex + 7)
    .filter((event) => aftermathTypes.has(event?.type));
  return [...chain, ...aftermath];
}

function projectedPlayer(state, seatId, viewerSeatId, revealedTraps = new Set()) {
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
      hidden: own ? false : (card) => card?.type === "trap" && !revealedTraps.has(card.id),
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

function publicMachineState(machine = {}, state = {}) {
  const responseWindow = machine.responseWindow ? {
    playerId: machine.responseWindow.playerId,
    type: machine.responseWindow.type,
    timing: machine.responseWindow.timing,
    resumeTiming: machine.responseWindow.resumeTiming,
    deadline: machine.responseWindow.deadline || null,
    triggerEventId: machine.responseWindow.triggerEventId || null,
    prompt: machine.responseWindow.prompt || null
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
  const chain = (machine.chain || []).map((link) => ({
    linkId: link.linkId,
    playerId: link.playerId,
    cardId: link.cardId || null,
    targetEffectId: link.targetEffectId || null,
    committed: Boolean(link.committed),
    card: link.cardId ? publicCard(state.cards?.[link.cardId]) : null
  }));
  return {
    responseWindow,
    actionWindow,
    pendingAttack,
    chain,
    chainLength: chain.length
  };
}

export function buildDuelView(state, viewerSeatId, {
  roomCode = "",
  revision = 0,
  status = "playing",
  duelNumber = 1,
  nextFirstPlayerId = null,
  series = null,
  seats = []
} = {}) {
  const seatIds = seatIdsForState(state);
  if (!seatIds.includes(viewerSeatId)) throw new Error(`Unknown viewer seat ${viewerSeatId}`);
  const opponentSeatId = otherSeatId(state, viewerSeatId);
  const visibleIds = visibleCardIds(state, viewerSeatId);
  const canRequestLegalActions = status === "playing" && !state.gameOver;
  const rejectedHandActions = new Map();
  const legalActions = canRequestLegalActions
    ? getLegalActions(state, viewerSeatId, { onRejectedAction: (action, reason) => {
      if (state.players[viewerSeatId].hand.includes(action.cardId) && !rejectedHandActions.has(action.cardId)) {
        rejectedHandActions.set(action.cardId, reason);
      }
    } })
    : emptyLegalActions(state, viewerSeatId);
  const playableCards = new Set(Object.values(legalActions.actions).flat().map((action) => action.cardId));
  legalActions.unavailableHandActions = Object.fromEntries([...rejectedHandActions]
    .filter(([cardId]) => !playableCards.has(cardId))
    .map(([cardId, reason]) => [cardId, onlineHandBlocker(state, viewerSeatId, state.cards[cardId], reason)]));

  return {
    protocolVersion: 1,
    roomCode,
    revision,
    status,
    duelNumber,
    nextFirstPlayerId,
    series: clone(series || { completed: 0, draws: 0, wins: {} }),
    viewerSeatId,
    opponentSeatId,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      ready: Boolean(seat.ready),
      connected: Boolean(seat.connected),
      spectatorConsent: Boolean(seat.spectatorConsent),
      reconnectDeadlineAt: seat.connected ? null : Number(seat.reconnectDeadlineAt) || null
    })),
    turn: {
      playerId: state.turn.playerId,
      phase: state.turn.phase,
      timing: state.machine?.timing || state.turn.phase
    },
    machine: publicMachineState(state.machine, state),
    attackResponse: canRequestLegalActions ? onlineAttackResponse(state, viewerSeatId) : null,
    summonResponse: canRequestLegalActions ? onlineSummonResponse(state, viewerSeatId) : null,
    chainResponse: canRequestLegalActions ? onlineChainResponse(state, viewerSeatId) : null,
    players: Object.fromEntries(seatIds.map((seatId) => [
      seatId,
      projectedPlayer(state, seatId, viewerSeatId)
    ])),
    gameOver: clone(state.gameOver || null),
    legalActions,
    recentEvents: (state.events || [])
      .slice(-40)
      .map((event) => publicEvent(event, visibleIds))
      .filter(Boolean),
    lastChainEvents: latestCompletedChainEvents(state.events || [])
      .map((event) => publicEvent(event, visibleIds))
      .filter(Boolean)
  };
}

export function buildSpectatorView(state, {
  roomCode = "", revision = 0, status = "playing", duelNumber = 1, series = null, seats = []
} = {}) {
  const seatIds = seatIdsForState(state);
  const visibleIds = new Set();
  const revealedTraps = new Set((state.machine?.chain || []).filter((link) => link.committed).map((link) => link.cardId));
  revealedTraps.forEach((id) => visibleIds.add(id));
  for (const player of Object.values(state.players)) {
    for (const zone of ["monsterZone", "grave", "banished"]) {
      (player[zone] || []).forEach((id) => visibleIds.add(id));
    }
    (player.spellTrapZone || []).forEach((id) => {
      if (state.cards[id]?.type !== "trap") visibleIds.add(id);
    });
  }
  const machine = publicMachineState(state.machine, state);
  machine.chain = machine.chain.map((link) => link.committed && visibleIds.has(link.cardId)
    ? { ...link, targetEffectId: visibleIds.has(link.targetEffectId) ? link.targetEffectId : null }
    : { linkId: link.linkId, playerId: link.playerId, committed: link.committed });
  return {
    protocolVersion: 1, viewerRole: "spectator", viewerSeatId: null,
    roomCode, revision, status, duelNumber,
    series: { completed: series?.completed || 0, draws: series?.draws || 0, wins: { p1: series?.wins?.p1 || 0, p2: series?.wins?.p2 || 0 } },
    seats: seats.map(({ seatId, name, ready, connected, spectatorConsent, reconnectDeadlineAt }) => ({
      seatId, name, ready: Boolean(ready), connected: Boolean(connected), spectatorConsent: Boolean(spectatorConsent),
      reconnectDeadlineAt: connected ? null : reconnectDeadlineAt || null
    })),
    turn: { playerId: state.turn.playerId, phase: state.turn.phase, timing: state.machine?.timing || state.turn.phase },
    machine,
    players: Object.fromEntries(seatIds.map((seatId) => [seatId, projectedPlayer(state, seatId, null, revealedTraps)])),
    gameOver: state.gameOver ? { winnerId: state.gameOver.winnerId || null, loserIds: [...(state.gameOver.loserIds || [])], reason: state.gameOver.reason || "" } : null,
    recentEvents: (state.events || []).slice(-40).map((event) => publicEvent(event, visibleIds)).filter(Boolean),
    lastChainEvents: latestCompletedChainEvents(state.events || []).map((event) => publicEvent(event, visibleIds)).filter(Boolean)
  };
}
