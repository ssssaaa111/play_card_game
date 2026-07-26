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

function sourceName(sourceCardId, findCard, events = []) {
  const cardName = findCard(sourceCardId)?.name;
  if (cardName) return cardName;
  const source = String(sourceCardId || "");
  const separator = source.indexOf(":");
  const sourceType = separator >= 0 ? source.slice(0, separator) : "";
  const sourceId = separator >= 0 ? source.slice(separator + 1) : "";
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (sourceType === "combo" && event.type === "COMBO_TRIGGERED" && event.comboId === sourceId) {
      return event.title || sourceId || "组合技";
    }
    if (sourceType === "passive" && event.type === "CHARACTER_PASSIVE_TRIGGERED" && event.passiveId === sourceId) {
      return event.name || sourceId || "角色技能";
    }
  }
  return "未知来源";
}

function signedAmount(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? `+${amount}` : String(amount);
}

function statDeltaSummary(atkDelta = 0, defDelta = 0, { compact = false } = {}) {
  const atk = Number(atkDelta) || 0;
  const def = Number(defDelta) || 0;
  if (atk && def && atk === def) {
    return compact
      ? `攻守${signedAmount(atk)}`
      : `攻击力 / 防御力 ${signedAmount(atk)}`;
  }
  const parts = [];
  if (atk) parts.push(`${compact ? "攻" : "攻击力 "}${signedAmount(atk)}`);
  if (def) parts.push(`${compact ? "守" : "防御力 "}${signedAmount(def)}`);
  return parts.join(compact ? "/" : " / ");
}

function statDeltasFromOperations(operations = []) {
  return operations.reduce((deltas, operation) => {
    if (operation?.op !== "modifyStat") return deltas;
    if (operation.stat === "tempAtk") deltas.atk += Number(operation.amount) || 0;
    if (operation.stat === "tempDef") deltas.def += Number(operation.amount) || 0;
    return deltas;
  }, { atk: 0, def: 0 });
}

function shortSourceName(name = "未知来源") {
  return [...String(name)].slice(0, 2).join("") || "效果";
}

function sourcedStatModifiers(events = [], cardId) {
  let latestSummonIndex = -1;
  events.forEach((event, index) => {
    if (event.type === "MONSTER_SUMMONED" && event.cardId === cardId) {
      latestSummonIndex = index;
    }
  });
  const modifiers = new Map();
  events.slice(latestSummonIndex + 1).forEach((event) => {
    if (
      event.type !== "STAT_MODIFIED" ||
      event.cardId !== cardId ||
      event.duration === "continuous" ||
      !event.sourceCardId ||
      !["tempAtk", "tempDef"].includes(event.stat)
    ) {
      return;
    }
    const modifier = modifiers.get(event.sourceCardId) || {
      sourceCardId: event.sourceCardId,
      atk: 0,
      def: 0
    };
    if (event.stat === "tempAtk") modifier.atk += Number(event.amount) || 0;
    if (event.stat === "tempDef") modifier.def += Number(event.amount) || 0;
    modifiers.set(event.sourceCardId, modifier);
  });
  return [...modifiers.values()].filter((modifier) => modifier.atk || modifier.def);
}

function modifierTone({ atk = 0, def = 0 } = {}) {
  const values = [Number(atk) || 0, Number(def) || 0].filter(Boolean);
  if (values.length && values.every((value) => value > 0)) return "buff";
  if (values.length && values.every((value) => value < 0)) return "debuff";
  return "modifier";
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
      const source = sourceName(effect.sourceCardId, findCard, gameEvents);
      const deltas = statDeltasFromOperations(effect.operations);
      const compactStats = statDeltaSummary(deltas.atk, deltas.def, { compact: true });
      const detailStats = statDeltaSummary(deltas.atk, deltas.def);
      const markerName = effect.effectId === "lunarDominion" ? "月幕" : shortSourceName(source);
      markers.push({
        label: compactStats ? `${markerName} ${compactStats}` : `${markerName} 持续`,
        tone: "continuous",
        detail: detailStats
          ? `${source}持续生效：${detailStats}；来源离场后解除。`
          : `${source}持续生效；来源离场后解除。`,
        sourceCardId: effect.sourceCardId || null
      });
    });

  const attackResets = (duelist?.attackResetEntries || [])
    .filter((entry) => entry.targetCardId === cardId && Number(entry.uses) > 0);
  const resetUses = attackResets.reduce((total, entry) => total + Number(entry.uses), 0);
  if (resetUses > 0) {
    const sources = [...new Set(attackResets.map((entry) => sourceName(entry.sourceCardId, findCard, gameEvents)))];
    markers.push({
      label: `再攻 ×${resetUses}`,
      tone: "ability",
      detail: `追加攻击 ×${resetUses}：${sources.join("、")}`,
      sourceCardIds: attackResets.map((entry) => entry.sourceCardId).filter(Boolean)
    });
  }

  sourcedStatModifiers(gameEvents, cardId).forEach((modifier) => {
    const source = sourceName(modifier.sourceCardId, findCard, gameEvents);
    const compactStats = statDeltaSummary(modifier.atk, modifier.def, { compact: true });
    const detailStats = statDeltaSummary(modifier.atk, modifier.def);
    markers.push({
      label: `${shortSourceName(source)} ${compactStats}`,
      tone: modifierTone(modifier),
      detail: `${source}生效：${detailStats}。`,
      sourceCardId: modifier.sourceCardId
    });
  });

  return markers;
}
