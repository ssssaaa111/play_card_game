import { elementLabel } from './rules.js';
import { spellDefinition } from './spells.js';
import { trapSummaryText } from './traps.js';

export function tributeCostForDisplay(card) {
  return Math.max(0, Number(card?.tributeCost) || 0);
}

export function tributeRequirementText(card, { compact = false } = {}) {
  const cost = tributeCostForDisplay(card);
  if (cost <= 0) return "";
  return compact ? `祭品 ${cost}` : `召唤需求：${cost} 只祭品`;
}

export function fusionDefinitionForDisplay(card) {
  if (card?.type !== "spell" || card.effect !== "fusionSummon") return null;
  const result = card.fusion?.resultTemplateId || card.fusion?.result || card.fusion?.cardId || "";
  const materials = (Array.isArray(card.fusion?.materials) ? card.fusion.materials : [])
    .map((entry) => typeof entry === "string"
      ? { templateId: entry, count: 1 }
      : { templateId: entry?.templateId || entry?.id, count: Math.max(1, Number(entry?.count) || 1) })
    .filter((entry) => entry.templateId);
  if (!result || materials.length === 0) return null;
  return { result, materials };
}

export function fusionRequirementText(card, { compact = false } = {}) {
  const fusion = fusionDefinitionForDisplay(card);
  if (!fusion) return "";
  const total = fusion.materials.reduce((sum, entry) => sum + entry.count, 0);
  return compact ? `融合 ${total}` : `融合需求：${total} 只指定素材`;
}

export function inferRarity(card) {
  if (card.type === "monster" && card.stars >= 5) return "SR";
  if (["elementEcho", "rallyAttack", "pierceLine", "graveReturn", "battleTrance", "directStrike", "fireWindCombo", "lightShadowCombo", "equipBlade", "equipAegis", "equipPrism", "equipOverclock", "destroySpellTrap", "aceEvolution", "fusionSummon", "aceCrackdown"].includes(card.effect)) return "R";
  if (["counterBoost", "weakenAttack", "directRebound", "aceGuard"].includes(card.trigger)) return "R";
  if (card.type === "trap") return "R";
  return "N";
}

export function inferArchetype(card) {
  if (card.element) return `${elementLabel(card.element)}属性`;
  if (["buff500", "soulResonance", "rallyAttack", "elementEcho", "battleTrance", "fireWindCombo", "lightShadowCombo", "aceEvolution", "fusionSummon"].includes(card.effect)) return "连携";
  if (["equipBlade", "equipAegis", "equipPrism", "equipOverclock"].includes(card.effect)) return "装备";
  if (["draw2", "extraSummon", "graveReturn"].includes(card.effect)) return "资源";
  if (["pierceLine", "directStrike", "destroySpellTrap", "aceCrackdown"].includes(card.effect) || ["weakenAttack", "directRebound"].includes(card.trigger)) return "破阵";
  if (["shield800", "heal700"].includes(card.effect) || ["directShield", "aceGuard"].includes(card.trigger)) return "守护";
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
  if (card.type === "monster") return "怪兽";
  if (card.type === "trap") return "陷阱";
  return "魔法";
}

export function spellTargetSummary(effect) {
  const definition = spellDefinition(effect);
  if (!definition?.target) return "";
  if (definition.target === "enemySpellTrap") return "敌方魔陷";
  const scope = definition.target === "enemyMonster" ? "敌方" : "我方";
  if (definition.targetRule === "strongest") return `${scope}最高`;
  return scope;
}

export function cardRuleText(card) {
  if (card.type === "trap") return trapSummaryText(card.trigger);
  if (card.type === "spell") {
    const fusion = fusionRequirementText(card, { compact: true });
    if (fusion) return fusion;
    const target = spellTargetSummary(card.effect);
    return target ? `目标:${target}` : (card.rarity || inferRarity(card));
  }
  if (card.type === "monster") return tributeRequirementText(card, { compact: true }) || (card.rarity || inferRarity(card));
  return card.rarity || inferRarity(card);
}
