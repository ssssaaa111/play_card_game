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

export function onlineSummonTrapAction(state, playerId, cardId) {
  const responseWindow = state.machine?.responseWindow;
  const context = responseWindow?.context || {};
  if (state.gameOver || responseWindow?.playerId !== playerId || responseWindow?.prompt !== "summon" ||
      !context.summonedPlayerId || !context.summonedCardId || context.summonedPlayerId === playerId) {
    throw new GameRuleError("No summon response belongs to this player");
  }
  const owner = state.players[playerId];
  const card = state.cards[cardId];
  if (!owner.spellTrapZone.includes(cardId) || card?.type !== "trap" || !trapMatchesEvent(card, "summon")) {
    throw new GameRuleError("This trap cannot respond to this summon");
  }
  return {
    type: "ACTIVATE_TRAP",
    playerId,
    rivalId: context.summonedPlayerId,
    cardId
  };
}

export function onlineChainTrapAction(state, playerId, cardId) {
  const responseWindow = state.machine?.responseWindow;
  const chain = state.machine?.chain || [];
  const targetLink = chain.at(-1);
  if (state.gameOver || responseWindow?.playerId !== playerId || !["attack", "summon"].includes(responseWindow?.prompt) ||
      chain.length !== 1 || !targetLink?.committed || targetLink.playerId === playerId || !targetLink.cardId) {
    throw new GameRuleError("No chain response belongs to this player");
  }
  const owner = state.players[playerId];
  const card = state.cards[cardId];
  if (!owner.spellTrapZone.includes(cardId) || card?.type !== "trap" || !trapMatchesEvent(card, "chain")) {
    throw new GameRuleError("This trap cannot respond to the current chain");
  }
  return {
    type: "ACTIVATE_TRAP",
    playerId,
    rivalId: targetLink.playerId,
    cardId,
    targetEffectId: targetLink.cardId
  };
}

export function commitOnlineTrap(engine, action) {
  const card = engine.getState().cards[action.cardId];
  return [
    ...engine.dispatch({ type: "ADD_CHAIN_LINK", playerId: action.playerId, cardId: action.cardId, effectId: card.trigger || card.effect, targetEffectId: action.targetEffectId }),
    ...engine.dispatch(action)
  ];
}

export function resolveOnlineTrapChain(engine, playerId) {
  return engine.dispatch({ type: "RESOLVE_CHAIN", playerId });
}

export function activateOnlineTrap(engine, action) {
  return [
    ...commitOnlineTrap(engine, action),
    ...resolveOnlineTrapChain(engine, action.playerId)
  ];
}

export function onlineAttackResponse(state, playerId) {
  const pending = state.machine?.pendingAttack;
  if (state.gameOver || state.machine?.chain?.length || !pending || state.machine.responseWindow?.playerId !== playerId || pending.rivalId !== playerId) return null;
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

export function onlineSummonResponse(state, playerId) {
  const responseWindow = state.machine?.responseWindow;
  const context = responseWindow?.context || {};
  if (state.gameOver || state.machine?.chain?.length || responseWindow?.playerId !== playerId || responseWindow?.prompt !== "summon" ||
      !context.summonedCardId || !responseWindow.triggerEventId) return null;
  const slots = state.players[playerId].zoneSlots?.spellTrapZone || state.players[playerId].spellTrapZone;
  const candidates = [];
  slots.forEach((cardId, index) => {
    if (!cardId) return;
    try {
      const action = onlineSummonTrapAction(state, playerId, cardId);
      activateOnlineTrap(new GameEngine(state), action);
      candidates.push({ index, cardId });
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error;
    }
  });
  return {
    triggerEventId: responseWindow.triggerEventId,
    eventName: "summon",
    summonedCardId: context.summonedCardId,
    summonedPlayerId: context.summonedPlayerId,
    candidates
  };
}

export function onlineChainResponse(state, playerId) {
  const responseWindow = state.machine?.responseWindow;
  const chain = state.machine?.chain || [];
  const targetLink = chain.at(-1);
  if (state.gameOver || responseWindow?.playerId !== playerId || !["attack", "summon"].includes(responseWindow?.prompt) ||
      chain.length !== 1 || !targetLink?.committed || targetLink.playerId === playerId || !responseWindow.triggerEventId) return null;
  const slots = state.players[playerId].zoneSlots?.spellTrapZone || state.players[playerId].spellTrapZone;
  const candidates = [];
  slots.forEach((cardId, index) => {
    if (!cardId) return;
    try {
      const action = onlineChainTrapAction(state, playerId, cardId);
      commitOnlineTrap(new GameEngine(state), action);
      candidates.push({ index, cardId });
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error;
    }
  });
  return {
    triggerEventId: responseWindow.triggerEventId,
    eventName: "chain",
    targetCardId: targetLink.cardId,
    targetPlayerId: targetLink.playerId,
    sourcePrompt: responseWindow.prompt,
    chainLength: chain.length,
    candidates
  };
}

export function resolveOnlineAttackTrapChain(engine, playerId) {
  const state = engine.getState();
  const firstLink = state.machine?.chain?.[0];
  if (!state.machine?.pendingAttack || state.machine?.responseWindow?.prompt !== "attack" || !firstLink?.cardId) {
    throw new GameRuleError("No attack trap chain is ready to resolve");
  }
  const canceledBy = state.cards[firstLink.cardId]?.trigger || null;
  const events = resolveOnlineTrapChain(engine, playerId);
  const skipped = events.some((event) =>
    event.type === "CHAIN_LINK_RESOLVED" && event.linkId === firstLink.linkId && event.skipped
  );
  return [
    ...events,
    ...settleOnlineAttack(engine, { canceledBy: skipped ? null : canceledBy })
  ];
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
