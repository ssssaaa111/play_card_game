import { library } from './data.js';
import { cardHandSummary, cardRuleText, cardTagText, cardTypeLabel, elementBadgeText, fusionRequirementText, tributeRequirementText } from './cards.js';
import { cardStatusText } from './card-state-display.js';
import { totalAtk, totalDef } from './rules.js';

export function cardDefinitionById(cardId) {
  if (!cardId) return null;
  return library.find((card) => card.id === cardId) || null;
}

export function resolveCardDetailSource(cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === "string") return cardDefinitionById(cardOrId);
  if (cardOrId.concealed) return cardOrId;
  if (cardOrId.id) return cardDefinitionById(cardOrId.id) || cardOrId;
  return cardOrId;
}

export function cardRuleLine(card) {
  if (card.concealed) return "状态：未公开";
  if (card.type === "monster") {
    const status = cardStatusText(card) || (card.mode === "defense" ? "守备表示" : "攻击表示");
    const requirement = tributeRequirementText(card);
    return requirement ? `${requirement} / ${status}` : status;
  }
  if (card.type === "trap") return `触发：${cardRuleText(card)}`;
  const rule = cardRuleText(card);
  const fusionRequirement = fusionRequirementText(card);
  if (fusionRequirement) return `${fusionRequirement} / 规则：融合召唤`;
  return rule.startsWith("目标:") ? `规则：${rule.replace("目标:", "目标：")}` : "规则：无需指定目标";
}

export function cardDetailText(card) {
  if (card.type === "monster") {
    return `${card.text} 攻击 ${totalAtk(card)} / 守备 ${totalDef(card)} / 星级 ${card.stars} / ${cardTagText(card)} / ${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗 ${card.battleWear}` : ""}`;
  }
  return `${card.text} ${cardTagText(card)} / ${cardRuleLine(card)}`;
}

export function cardZoomMeta(card) {
  if (card.concealed) return "类型：盖放卡 / 状态：未公开";
  if (card.type === "monster") {
    const attribute = elementBadgeText(card);
    return `类型：怪兽 / ${cardTagText(card)}${attribute ? ` / 属性：${attribute}` : ""} / 星级：${card.stars} / 攻击：${totalAtk(card)} / 守备：${totalDef(card)} / 当前状态：${cardRuleLine(card)}${card.battleWear ? ` / 战斗损耗：${card.battleWear}` : ""}`;
  }
  const typeLabel = card.type === "spell" ? "魔法" : "陷阱";
  const key = card.effect ? `效果：${card.effect}` : `触发键：${card.trigger || "无"}`;
  return `类型：${typeLabel} / ${cardTagText(card)} / ${cardRuleLine(card)} / ${key}`;
}

function buildCardDetailViewModel(card) {
  if (!card) return null;
  const isMonster = card.type === "monster";
  return {
    id: card.id || "",
    name: card.name || "",
    cardType: card.type || "unknown",
    type: cardTypeLabel(card),
    effectText: card.text || "没有效果文本。",
    summary: card.summary || "",
    summonRequirement: tributeRequirementText(card) || fusionRequirementText(card),
    tags: cardTagText(card),
    attribute: elementBadgeText(card),
    attack: isMonster ? totalAtk(card) : null,
    defense: isMonster ? totalDef(card) : null,
    rule: cardRuleLine(card),
    meta: cardZoomMeta(card),
    card
  };
}

export function cardDetailViewModel(cardOrId) {
  return buildCardDetailViewModel(resolveCardDetailSource(cardOrId));
}

function supportRuleValue(card, rule) {
  const prefix = card.type === "trap" ? "触发：" : "规则：";
  return rule.startsWith(prefix) ? rule.slice(prefix.length) : rule;
}

export function cardInspectorViewModel(cardOrId, { effectMarkers = [] } = {}) {
  const card = typeof cardOrId === "string" ? resolveCardDetailSource(cardOrId) : cardOrId;
  const view = buildCardDetailViewModel(card);
  if (!view) return null;

  if (card.concealed) {
    return {
      ...view,
      tacticalSummary: "未知效果",
      rows: [
        { label: "类型", value: "盖放卡" },
        { label: "状态", value: "未公开" }
      ]
    };
  }

  if (card.type === "monster") {
    const activeEffects = effectMarkers
      .map((marker) => marker?.detail || marker?.label || "")
      .filter(Boolean);
    return {
      ...view,
      tacticalSummary: card.summary || `${view.attribute || "怪兽"} · ATK ${view.attack} / DEF ${view.defense}`,
      rows: [
        { label: "属性", value: view.attribute || "无属性" },
        { label: "战力", value: `ATK ${view.attack} / DEF ${view.defense}` },
        { label: "状态", value: view.rule },
        ...(activeEffects.length > 0
          ? [{ label: "生效中", value: activeEffects.join("；"), scrollable: true }]
          : [])
      ]
    };
  }

  return {
    ...view,
    tacticalSummary: cardHandSummary(card),
    rows: [
      { label: "类型", value: view.type },
      { label: card.type === "trap" ? "触发" : "规则", value: supportRuleValue(card, view.rule) },
      { label: "分类", value: view.tags.replace(" / ", " · ") }
    ]
  };
}
