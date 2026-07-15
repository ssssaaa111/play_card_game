import { cardBadgeText, cardHandSummary, cardRuleText, cardTypeLabel, elementBadgeText, tributeRequirementText } from './cards.js';
import { applyCardArt } from './card-art.js';
import { cardStateChips, cardStatusText } from './card-state-display.js';
import { totalAtk, totalDef } from './rules.js';

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function cardRenderModel(card, { asset = "", attacksLocked = false, attackReady = false, handSummary = false } = {}) {
  const badge = cardBadgeText(card);
  const typeLabel = cardTypeLabel(card);
  const elementText = elementBadgeText(card);
  const ruleText = cardRuleText(card);
  const tributeText = tributeRequirementText(card, { compact: true });
  const statusText = cardStatusText(card, { attacksLocked });
  const stateChips = cardStateChips(card, { attacksLocked, attackReady });
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
    stateChips,
    artHtml: monsterArt,
    text: handSummary ? cardHandSummary(card) : card.text,
    textMode: handSummary ? "hand-summary" : "full",
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
  el.dataset.textMode = model.textMode;
  if (card.type === "spell" || card.type === "trap") applyCardArt(el, card.id);
  const showStateRail = Boolean(options.showStateRail && model.stateChips.length);
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
      ${!showStateRail && model.statusText ? `<span class="card-status">${escapeHtml(model.statusText)}</span>` : ""}
    </div>
    ${showStateRail ? `<div class="card-state-rail">${model.stateChips.map((chip) => `<span class="card-state-chip ${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>`).join("")}</div>` : ""}
    <div class="card-text ${escapeHtml(model.textMode)}">${escapeHtml(model.text)}</div>
    <div class="stats">
      <div class="stat">${escapeHtml(model.stats[0])}</div>
      <div class="stat">${escapeHtml(model.stats[1])}</div>
    </div>
  `;
  return el;
}
