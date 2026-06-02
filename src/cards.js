import { elementLabel } from './rules.js';
import { spellDefinition } from './spells.js';
import { trapSummaryText } from './traps.js';

export function inferRarity(card) {
  if (card.type === "monster" && card.stars >= 5) return "SR";
  if (["elementEcho", "rallyAttack", "pierceLine", "graveReturn", "battleTrance", "directStrike", "fireWindCombo", "lightShadowCombo"].includes(card.effect)) return "R";
  if (["counterBoost", "weakenAttack", "directRebound"].includes(card.trigger)) return "R";
  if (card.type === "trap") return "R";
  return "N";
}

export function inferArchetype(card) {
  if (card.element) return `${elementLabel(card.element)}属性`;
  if (["buff500", "rallyAttack", "elementEcho", "battleTrance", "fireWindCombo", "lightShadowCombo"].includes(card.effect)) return "连携";
  if (["draw2", "extraSummon", "graveReturn"].includes(card.effect)) return "资源";
  if (["pierceLine", "directStrike"].includes(card.effect) || ["weakenAttack", "directRebound"].includes(card.trigger)) return "破阵";
  if (["shield800", "heal700"].includes(card.effect) || card.trigger === "directShield") return "守护";
  if (card.type === "trap") return "反制";
  return "通用";
}

export function cardTagText(card) {
  const rarity = card.rarity || inferRarity(card);
  const archetype = card.archetype || inferArchetype(card);
  return `稀有度 ${rarity} / 流派 ${archetype}`;
}

export function elementBadgeText(card) {
  return card?.type === "monster" && card.element ? `${elementLabel(card.element)}属性` : "";
}

export function cardBadgeText(card) {
  if (card.type === "monster") return `★${card.stars}`;
  if (card.type === "trap") return "陷";
  return "魔";
}

export function cardTypeLabel(card) {
  if (card.type === "monster") return "MONSTER";
  if (card.type === "trap") return "TRAP";
  return "SPELL";
}

export function spellTargetSummary(effect) {
  const definition = spellDefinition(effect);
  if (!definition?.target) return "";
  const scope = definition.target === "enemyMonster" ? "敌方" : "我方";
  if (definition.targetRule === "strongest") return `${scope}最高`;
  return scope;
}

export function cardRuleText(card) {
  if (card.type === "trap") return trapSummaryText(card.trigger);
  if (card.type === "spell") {
    const target = spellTargetSummary(card.effect);
    return target ? `目标:${target}` : (card.rarity || inferRarity(card));
  }
  return card.rarity || inferRarity(card);
}
