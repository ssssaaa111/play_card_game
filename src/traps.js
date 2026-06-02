import { totalAtk, totalDef } from './rules.js';

export const trapDefinitions = {
  attackDestroy: {
    event: "attack",
    caption: "破坏攻击怪兽",
    triggerText: "对手攻击时",
    cancelsEvent: true,
    consumesAttack: false
  },
  counterBoost: {
    event: "attack",
    caption: "取消攻击并强化防线",
    triggerText: "对手攻击时",
    cancelsEvent: true,
    consumesAttack: true
  },
  attackShift: {
    events: ["attack", "direct"],
    caption: "取消攻击并获得护盾",
    triggerText: "对手攻击时",
    cancelsEvent: true,
    consumesAttack: true
  },
  attackNegate: {
    event: "attack",
    caption: "无效本次攻击",
    triggerText: "对手攻击时",
    cancelsEvent: true,
    consumesAttack: true
  },
  redirectAttack: {
    event: "attack",
    caption: "改为攻击另一只怪兽",
    triggerText: "对手攻击时",
    cancelsEvent: false,
    consumesAttack: false
  },
  weakenAttack: {
    event: "attack",
    caption: "削弱攻击怪兽",
    triggerText: "对手攻击时",
    cancelsEvent: false,
    consumesAttack: false
  },
  directShield: {
    event: "direct",
    caption: "直击伤害归零",
    triggerText: "受到直接攻击时",
    cancelsEvent: true,
    consumesAttack: false
  },
  directRebound: {
    event: "direct",
    caption: "直击反弹",
    triggerText: "受到直接攻击时",
    cancelsEvent: true,
    consumesAttack: false
  },
  summonBurn: {
    event: "summon",
    caption: "召唤惩罚",
    triggerText: "对手召唤时",
    cancelsEvent: false,
    consumesAttack: false
  }
};

export function trapDefinition(trigger) {
  return trapDefinitions[trigger] || null;
}

export function trapMatchesEvent(card, eventName) {
  const definition = trapDefinition(card?.trigger);
  const events = definition?.events || [definition?.event];
  return Boolean(definition && events.includes(eventName));
}

export function selectRedirectTarget(field = [], currentTargetIndex = -1) {
  return field
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => card && index !== currentTargetIndex)
    .sort((a, b) => totalDef(b.card) - totalDef(a.card))[0]?.index ?? -1;
}

export function trapCanResolve(card, eventName, { owner = null, context = {} } = {}) {
  if (!trapMatchesEvent(card, eventName)) return false;
  if (card?.trigger === "redirectAttack") {
    return selectRedirectTarget(owner?.field || [], context.targetIndex ?? -1) >= 0;
  }
  return true;
}

export function trapTriggerText(trigger) {
  return trapDefinition(trigger)?.triggerText || "未知触发";
}

export function trapConsumesAttack(trigger) {
  return Boolean(trapDefinition(trigger)?.consumesAttack);
}

export function trapSummaryText(trigger) {
  const definition = trapDefinition(trigger);
  if (!definition) return "未知触发";
  const attackCost = definition.consumesAttack ? " / 消耗攻击" : "";
  return `${definition.triggerText} / ${definition.caption}${attackCost}`;
}

function monsterText(card) {
  if (!card) return "未知目标";
  return `${card.name}（ATK ${totalAtk(card)} / DEF ${totalDef(card)}）`;
}

function attackEventText({ owner = null, rival = null, context = {} } = {}) {
  const attacker = rival?.field?.[context.attackerIndex];
  const target = context.targetIndex >= 0 ? owner?.field?.[context.targetIndex] : null;
  const targetText = target ? `你的${monsterText(target)}` : "你本人";
  return `对手的${monsterText(attacker)}正在攻击${targetText}`;
}

function redirectPreviewText(trap, { owner = null, context = {} } = {}) {
  if (trap?.trigger !== "redirectAttack") return "";
  const currentTarget = context.targetIndex >= 0 ? owner?.field?.[context.targetIndex] : null;
  const redirectIndex = selectRedirectTarget(owner?.field || [], context.targetIndex ?? -1);
  const redirectTarget = owner?.field?.[redirectIndex];
  if (!redirectTarget) return "当前没有可换位的其他怪兽。";
  const warning = currentTarget && totalDef(redirectTarget) < totalDef(currentTarget)
    ? ` 注意：换位目标 DEF ${totalDef(redirectTarget)} 低于当前目标 DEF ${totalDef(currentTarget)}。`
    : "";
  return `发动后会把攻击改为你的${monsterText(redirectTarget)}。${warning}`;
}

export function trapActivationText(trap, eventName, { owner = null, rival = null, context = {} } = {}) {
  const eventText = eventName === "attack"
    ? attackEventText({ owner, rival, context })
    : eventName === "direct"
      ? attackEventText({ owner, rival, context })
      : `对手召唤了 ${monsterText(context.summoned)}`;
  const preview = redirectPreviewText(trap, { owner, context });
  return `${eventText}。${preview ? `${preview} ` : ""}是否连锁发动「${trap.name}」？${trap.text}`;
}
