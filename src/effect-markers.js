function runtimeCardId(card) {
  return card?.uid || card?.engineId || card?.id || null;
}

function activeContinuousEffects(events = []) {
  const active = new Map();
  events.forEach((event) => {
    if (event.type === "CONTINUOUS_EFFECT_REGISTERED") {
      active.set(event.id, event);
    }
    if (event.type === "CONTINUOUS_EFFECT_RELEASED") {
      active.delete(event.id);
    }
  });
  return [...active.values()];
}

function sourceName(sourceCardId, findCard) {
  return findCard(sourceCardId)?.name || "未知来源";
}

export function effectMarkersForCard({
  card,
  duelist,
  gameEvents = [],
  findCard = () => null
} = {}) {
  const cardId = runtimeCardId(card);
  if (!cardId || card?.type !== "monster") return [];
  const markers = [];

  activeContinuousEffects(gameEvents)
    .filter((effect) => effect.targetCardId === cardId)
    .forEach((effect) => {
      const source = sourceName(effect.sourceCardId, findCard);
      const atkDelta = (effect.operations || [])
        .find((operation) => operation.op === "modifyStat" && operation.stat === "tempAtk")?.amount;
      const defDelta = (effect.operations || [])
        .find((operation) => operation.op === "modifyStat" && operation.stat === "tempDef")?.amount;
      const amount = Number(atkDelta ?? defDelta) || 0;
      markers.push({
        label: effect.effectId === "lunarDominion" ? `月幕 ${amount}` : "持续效果",
        tone: "continuous",
        detail: `${source}持续生效：攻击力 / 防御力 ${amount}；来源离场后解除。`,
        sourceCardId: effect.sourceCardId || null
      });
    });

  const attackResets = (duelist?.attackResetEntries || [])
    .filter((entry) => entry.targetCardId === cardId && Number(entry.uses) > 0);
  const resetUses = attackResets.reduce((total, entry) => total + Number(entry.uses), 0);
  if (resetUses > 0) {
    const sources = [...new Set(attackResets.map((entry) => sourceName(entry.sourceCardId, findCard)))];
    markers.push({
      label: `再攻 ×${resetUses}`,
      tone: "ability",
      detail: `追加攻击 ×${resetUses}：${sources.join("、")}`,
      sourceCardIds: attackResets.map((entry) => entry.sourceCardId).filter(Boolean)
    });
  }

  return markers;
}
