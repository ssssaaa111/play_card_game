const TRIO_GOD_IDS = new Set([
  "trio-sun-judicator",
  "trio-moon-warden",
  "trio-star-herald"
]);

function latestPlayerTurnEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const turnStartIndex = list.findLastIndex((event) =>
    event?.type === "TURN_STARTED" && event.playerId === "player"
  );
  return turnStartIndex >= 0 ? list.slice(turnStartIndex + 1) : list;
}

function resolvedCard(resolveCard, cardId) {
  if (!cardId || typeof resolveCard !== "function") return null;
  return resolveCard(cardId) || null;
}

export function trioBossCounterPlan({ events = [], resolveCard = null } = {}) {
  const playerTurnEvents = latestPlayerTurnEvents(events);
  for (let index = playerTurnEvents.length - 1; index >= 0; index -= 1) {
    const event = playerTurnEvents[index];
    if (event?.type === "ATTACK_DECLARED" && event.playerId === "player") {
      const target = resolvedCard(resolveCard, event.targetCardId);
      if (TRIO_GOD_IDS.has(target?.id)) {
        return {
          id: "fortify-gods",
          eventId: event.id,
          turnGoal: "protectGods",
          label: "神体守护",
          text: "你直接挑战三曜神体；对手将优先转守高防神格。"
        };
      }
    }
    if (event?.type === "CARD_DESTROYED" && event.playerId === "ai") {
      const destroyed = resolvedCard(resolveCard, event.cardId);
      if (destroyed?.type === "monster" && !TRIO_GOD_IDS.has(destroyed.id)) {
        return {
          id: "rebuild-tributes",
          eventId: event.id,
          turnGoal: "buildTributes",
          label: "祭品重建",
          text: "你切断了祭品；对手将优先补充公开祭品候选。"
        };
      }
    }
  }
  return null;
}
