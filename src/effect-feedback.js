export function statLabel(stat) {
  if (stat === "def" || stat === "tempDef") return "防御力";
  return "攻击力";
}

export function isContinuousReleaseStat(events = [], event = {}) {
  if (event.type !== "STAT_MODIFIED" || event.duration !== "continuous") return false;
  return events.some((candidate) =>
    candidate.type === "CONTINUOUS_EFFECT_RELEASED"
    && candidate.sourceCardId === event.sourceCardId
    && candidate.targetCardId === event.cardId
  );
}

export function statChangeText(event = {}, { continuousReleased = false } = {}) {
  const amount = Number(event.amount) || 0;
  const direction = continuousReleased
    ? amount >= 0 ? "恢复" : "回落"
    : amount >= 0 ? "提升" : "下降";
  return `${statLabel(event.stat)}${direction} ${Math.abs(amount)}`;
}

export function shouldLogGenericDestroyedEvent(card = {}) {
  return Boolean(card);
}
