import { library } from './data.js';
import { cardRuleText, cardTagText, cardTypeLabel, elementBadgeText } from './cards.js';
import { cardStatusText } from './card-renderer.js';
import { totalAtk, totalDef } from './rules.js';

export function cardDefinitionById(cardId) {
  if (!cardId) return null;
  return library.find((card) => card.id === cardId) || null;
}

export function resolveCardDetailSource(cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === "string") return cardDefinitionById(cardOrId);
  if (cardOrId.id) return cardDefinitionById(cardOrId.id) || cardOrId;
  return cardOrId;
}

export function cardRuleLine(card) {
  if (card.type === "monster") {
    return cardStatusText(card) || (card.mode === "defense" ? "守备表示" : "攻击表示");
  }
  if (card.type === "trap") return `触发：${cardRuleText(card)}`;
  const rule = cardRuleText(card);
  return rule.startsWith("目标:") ? `规则：${rule.replace("目标:", "目标：")}` : "规则：无需指定目标";
}

export function cardDetailText(card) {
  if (card.type === "monster") {
    return `${card.text} 攻击 ${totalAtk(card)} / 守备 ${totalDef(card)} / 星级 ${card.stars} / ${cardTagText(card)} / ${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗 ${card.battleWear}` : ""}`;
  }
  return `${card.text} ${cardTagText(card)} / ${cardRuleLine(card)}`;
}

export function cardZoomMeta(card) {
  if (card.type === "monster") {
    const attribute = elementBadgeText(card);
    return `类型：怪兽 / ${cardTagText(card)}${attribute ? ` / 属性：${attribute}` : ""} / 星级：${card.stars} / 攻击：${totalAtk(card)} / 守备：${totalDef(card)} / 当前状态：${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗：${card.battleWear}` : ""}`;
  }
  const typeLabel = card.type === "spell" ? "魔法" : "陷阱";
  const key = card.effect ? `效果：${card.effect}` : `触发键：${card.trigger || "无"}`;
  return `类型：${typeLabel} / ${cardTagText(card)} / ${cardRuleLine(card)} / ${key}`;
}

export function cardDetailViewModel(cardOrId) {
  const card = resolveCardDetailSource(cardOrId);
  if (!card) return null;
  const isMonster = card.type === "monster";
  return {
    id: card.id || "",
    name: card.name || "",
    type: cardTypeLabel(card),
    effectText: card.text || "没有效果文本。",
    summary: card.summary || "",
    tags: cardTagText(card),
    attribute: elementBadgeText(card),
    attack: isMonster ? totalAtk(card) : null,
    defense: isMonster ? totalDef(card) : null,
    rule: cardRuleLine(card),
    meta: cardZoomMeta(card),
    card
  };
}
