export const graveReturnRuleText = "「星尘回收」与「星屑返轨」每个己方回合合计只能发动 1 次。";
export const graveReturnLimit = Object.freeze({
  code: "GRAVE_RETURN_LIMIT",
  label: "次数用完",
  reason: "星尘回收与星屑返轨共用次数，本回合已用完，下个己方回合恢复。"
});

export function isGraveReturn(card) {
  return card?.effect === "graveReturn";
}

export function graveReturnUsed(state, seatId) {
  if (state.turn.playerId !== seatId) return false;
  // Saved games already have the full activation history, including the current turn.
  return state.events.findLast(event => event.type === "TURN_ENDED"
    || (event.type === "CARD_ACTIVATED" && event.playerId === seatId && isGraveReturn(state.cards[event.cardId])))
    ?.type === "CARD_ACTIVATED";
}
