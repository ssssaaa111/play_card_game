import { GameEngine, GameRuleError } from "./game-engine.js";
import { trapDefinition, trapMatchesEvent, selectRedirectTarget } from "./traps.js";

// Targets and effects are derived from authoritative state, never client input.
export function onlineTrapAction(state, playerId, cardId) {
  const pending = state.machine?.pendingAttack;
  if (!pending || state.machine.responseWindow?.playerId !== playerId || pending.rivalId !== playerId) {
    throw new GameRuleError("No attack response belongs to this player");
  }
  const owner = state.players[playerId];
  const card = state.cards[cardId];
  if (!owner.spellTrapZone.includes(cardId) || card?.type !== "trap" ||
      !(trapMatchesEvent(card, "attack") || (pending.direct && trapMatchesEvent(card, "direct")))) {
    throw new GameRuleError("This trap cannot respond to this attack");
  }
  const action = {
    type: "ACTIVATE_TRAP", playerId, rivalId: pending.playerId, cardId,
    attackerCardId: pending.attackerCardId, targetEffectId: pending.attackerCardId
  };
  if (card.trigger === "redirectAttack") {
    const field = owner.monsterZone.map((id) => state.cards[id]);
    const index = selectRedirectTarget(field, owner.monsterZone.indexOf(pending.targetCardId));
    if (index < 0) throw new GameRuleError("No alternative attack target");
    action.targetCardId = field[index].id;
  }
  return action;
}

export function activateOnlineTrap(engine, action) {
  const card = engine.getState().cards[action.cardId];
  return [
    ...engine.dispatch({ type: "ADD_CHAIN_LINK", playerId: action.playerId, cardId: action.cardId, effectId: card.trigger || card.effect, targetEffectId: action.targetEffectId }),
    ...engine.dispatch(action),
    ...engine.dispatch({ type: "RESOLVE_CHAIN", playerId: action.playerId })
  ];
}

export function onlineAttackResponse(state, playerId) {
  const pending = state.machine?.pendingAttack;
  if (state.gameOver || !pending || state.machine.responseWindow?.playerId !== playerId || pending.rivalId !== playerId) return null;
  const slots = state.players[playerId].zoneSlots?.spellTrapZone || state.players[playerId].spellTrapZone;
  const candidates = [];
  slots.forEach((cardId, index) => {
    if (!cardId) return;
    try {
      const action = onlineTrapAction(state, playerId, cardId);
      // Check requirements with the real engine without mutating the live duel.
      activateOnlineTrap(new GameEngine(state), action);
      candidates.push({ index, cardId });
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error;
    }
  });
  return { declarationEventId: pending.declarationEventId, eventName: pending.direct ? "direct" : "attack", candidates };
}

export function settleOnlineAttack(engine, { canceledBy = null } = {}) {
  const state = engine.getState();
  const pending = state.machine.pendingAttack;
  if (state.gameOver || !pending) return [];
  const definition = trapDefinition(canceledBy);
  if (definition?.cancelsEvent) {
    return engine.dispatch({ type: "CANCEL_ATTACK", playerId: pending.playerId, declarationEventId: pending.declarationEventId, consumeAttack: definition.consumesAttack, reason: "online-trap" });
  }
  return engine.dispatch({ type: "RESOLVE_BATTLE", playerId: pending.playerId, rivalId: pending.rivalId, attackerCardId: pending.attackerCardId, ...(pending.targetCardId ? { targetCardId: pending.targetCardId } : {}), declarationEventId: pending.declarationEventId });
}
