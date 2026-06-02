import { cardRuleText, cardTagText } from './cards.js';
import { cardStatusText } from './card-renderer.js';
import { totalAtk, totalDef } from './rules.js';

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
    return `${card.text} ATK ${totalAtk(card)} / DEF ${totalDef(card)} / 星级 ${card.stars} / ${cardTagText(card)} / ${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗 ${card.battleWear}` : ""}`;
  }
  return `${card.text} ${cardTagText(card)} / ${cardRuleLine(card)}`;
}

export function cardZoomMeta(card) {
  if (card.type === "monster") {
    return `类型：怪兽 / ${cardTagText(card)} / 星级：${card.stars} / ATK：${totalAtk(card)} / DEF：${totalDef(card)} / 当前状态：${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗：${card.battleWear}` : ""}`;
  }
  const typeLabel = card.type === "spell" ? "魔法" : "陷阱";
  const key = card.effect ? `效果：${card.effect}` : `触发键：${card.trigger || "无"}`;
  return `类型：${typeLabel} / ${cardTagText(card)} / ${cardRuleLine(card)} / ${key}`;
}
