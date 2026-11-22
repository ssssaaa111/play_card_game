export const graveReturnRuleText = "「星尘回收」每个己方回合只能发动 1 次。";
export const graveReturnLimit = Object.freeze({
  code: "GRAVE_RETURN_LIMIT",
  label: "次数用完",
  reason: "本回合已发动过星尘回收，下个己方回合可以再次发动。"
});

export function isGraveReturn(card) {
  return (card?.templateId || card?.id) === "grave-return";
}

export function graveReturnUsed(state, seatId) {
  if (state.turn.playerId !== seatId) return false;
  // Saved games already have the full activation history, including the current turn.
  return state.events.findLast(event => event.type === "TURN_ENDED"
    || (event.type === "CARD_ACTIVATED" && event.playerId === seatId && isGraveReturn(state.cards[event.cardId])))
    ?.type === "CARD_ACTIVATED";
}
