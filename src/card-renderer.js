import { cardBadgeText, cardRuleText, cardTypeLabel, elementBadgeText, tributeRequirementText } from './cards.js';
import { totalAtk, totalDef } from './rules.js';

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function cardStatusText(card, { attacksLocked = false } = {}) {
  if (card.type !== "monster") return "";
  const parts = [];
  if (attacksLocked && !card.used && card.mode !== "defense") parts.push("攻击已跳过");
  if (card.tempAtk > 0) parts.push(`强化+${card.tempAtk}`);
  if (card.tempAtk < 0) parts.push(`弱化${card.tempAtk}`);
  if (card.tempDef > 0) parts.push(`守备+${card.tempDef}`);
  if (card.tempDef < 0) parts.push(`守备${card.tempDef}`);
  if (card.battleWear > 0) parts.push(`损耗-${card.battleWear}`);
  if (card.destructionProtection) parts.push(card.destructionProtectionUsed ? "神格守护已用" : "神格守护");
  if (card.used) parts.push("已行动");
  return parts.slice(0, 2).join(" / ");
}

export function cardRenderModel(card, { asset = "", attacksLocked = false } = {}) {
  const badge = cardBadgeText(card);
  const typeLabel = cardTypeLabel(card);
  const elementText = elementBadgeText(card);
  const ruleText = cardRuleText(card);
  const tributeText = tributeRequirementText(card, { compact: true });
  const statusText = cardStatusText(card, { attacksLocked });
  const monsterArt = card.type === "monster"
    ? `<span class="monster-element-chip ${escapeHtml(card.element || "neutral")}">${escapeHtml(elementText || "无属性")}</span><div class="monster-projection ${escapeHtml(card.element || "")} ${card.mode === "defense" ? "defense" : ""}">${asset ? `<img class="monster-sprite" src="${escapeHtml(asset)}" alt="">` : `<div class="monster-head"></div><div class="monster-body"></div><div class="monster-limb left"></div><div class="monster-limb right"></div>`}</div>`
    : `<span class="card-art-symbol">${escapeHtml(card.icon)}</span>`;
  const stats = card.type === "monster"
    ? [`ATK ${totalAtk(card)}`, `DEF ${totalDef(card)}${tributeText ? ` · ${tributeText}` : ""}`]
    : [typeLabel, ruleText];

  return {
    className: `card ${card.type} ${card.element || ""}`,
    name: card.name,
    badge,
    elementText,
    ruleText,
    statusText,
    artHtml: monsterArt,
    text: card.text,
    stats
  };
}

export function createCardElement(doc, card, options = {}) {
  const model = cardRenderModel(card, options);
  const el = doc.createElement("article");
  el.className = model.className;
  el.dataset.cardId = card.id || "";
  el.dataset.cardName = card.name || "";
  el.dataset.cardType = card.type || "";
  el.innerHTML = `
    <div class="card-head">
      <div class="card-name">${escapeHtml(model.name)}</div>
      <div class="card-badges">
        <div class="badge">${escapeHtml(model.badge)}</div>
        ${model.elementText ? `<div class="element-badge ${escapeHtml(card.element)}">${escapeHtml(model.elementText)}</div>` : ""}
      </div>
    </div>
    <div class="art">
      ${model.artHtml}
      ${model.statusText ? `<span class="card-status">${escapeHtml(model.statusText)}</span>` : ""}
    </div>
    <div class="card-text">${escapeHtml(model.text)}</div>
    <div class="stats">
      <div class="stat">${escapeHtml(model.stats[0])}</div>
      <div class="stat">${escapeHtml(model.stats[1])}</div>
    </div>
  `;
  return el;
}
