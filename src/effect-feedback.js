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

export function negatedActivatedTrapText(cardName = "陷阱卡") {
  return `${cardName}的效果被连锁无效；已发动陷阱仍送入墓地。`;
}

export function afterAttackBackrowDestroyedText(attackerName = "攻击怪兽", destroyedName = "魔陷卡") {
  return `${attackerName}的攻击后效果破坏了攻击宣言时锁定的魔陷「${destroyedName}」。`;
}

export function afterAttackDamageAndGrowthText(attackerName = "攻击怪兽", damage = 0, attackGain = 0) {
  return `${attackerName}的攻击后效果追加造成 ${Math.max(0, Number(damage) || 0)} 点伤害，并使自身攻击力提升 ${Math.max(0, Number(attackGain) || 0)}。`;
}

export function findAfterAttackDamageAndGrowthEvents(events = [], { attackerId = "", effectId = "" } = {}) {
  const growEventIndex = events.findIndex((event) =>
    event.type === "STAT_MODIFIED" &&
    event.sourceCardId === attackerId &&
    event.cardId === attackerId &&
    event.stat === "tempAtk" &&
    event.amount > 0
  );
  const growEvent = growEventIndex >= 0 ? events[growEventIndex] : null;
  if (!growEvent || effectId !== "starDoomCharge") {
    return { damageEvent: null, growEvent };
  }
  for (let index = growEventIndex - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "DAMAGE_DEALT" && event.sourceCardId === attackerId) {
      return { damageEvent: event, growEvent };
    }
  }
  return { damageEvent: null, growEvent };
}

export function rewindDamageForHud(duelist = {}, event = {}) {
  if (event?.type !== "DAMAGE_DEALT" || event.playerId !== duelist.owner) return duelist;
  const amount = Math.max(0, Number(event.amount) || 0);
  const blocked = Math.max(0, Number(event.blocked) || 0);
  const shieldPierced = Math.max(0, Number(event.shieldPierced) || 0);
  if (amount === 0 && blocked === 0 && shieldPierced === 0) return duelist;
  return {
    ...duelist,
    lp: Math.max(0, Number(duelist.lp) || 0) + amount,
    shield: Math.max(0, Number(duelist.shield) || 0) + blocked + shieldPierced
  };
}

export function afterAttackLockedTargetLostText(attackerName = "攻击怪兽", targetName = "魔陷卡") {
  return `${attackerName}锁定的魔陷「${targetName}」已提前离场，攻击后效果没有转移到其他魔陷。`;
}
