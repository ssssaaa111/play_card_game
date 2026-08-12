import { cardInspectorViewModel } from "./card-detail.js";
import { createCardElement } from "./card-renderer.js";

function deckBrowserEntries(preview = {}) {
  const compact = Array.isArray(preview.displayDeckCards) ? preview.displayDeckCards : [];
  return compact.length ? compact : (Array.isArray(preview.deckCards) ? preview.deckCards : []);
}

function clampIndex(index, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, Number.isFinite(index) ? Math.trunc(index) : 0));
}

export function deckBrowserView(preview = {}, requestedIndex = 0) {
  const entries = deckBrowserEntries(preview);
  if (!entries.length) return null;
  const index = clampIndex(requestedIndex, entries.length);
  const entry = entries[index];
  const detail = cardInspectorViewModel(entry.id);
  if (!detail) return null;
  return {
    index,
    total: entries.length,
    entries,
    entry,
    detail,
    positionText: `${index + 1} / ${entries.length}`,
    copyText: `${entry.count || 1} 张`,
    canPrevious: index > 0,
    canNext: index < entries.length - 1
  };
}

export function moveDeckBrowserIndex(index, total, offset) {
  return clampIndex(Number(index) + Math.sign(offset), total);
}

export function deckBrowserSwipeOffset(startX, endX, threshold = 48) {
  const distance = Number(startX) - Number(endX);
  if (!Number.isFinite(distance) || Math.abs(distance) < threshold) return 0;
  return distance > 0 ? 1 : -1;
}

export function renderDeckBrowser(doc, elements, preview, index, {
  assetForCard = () => "",
  onSelect = () => {}
} = {}) {
  const view = deckBrowserView(preview, index);
  if (!view || !elements.deckBrowserModal) return null;

  elements.deckBrowserModal.classList.add("show");
  elements.deckBrowserModal.dataset.index = String(view.index);
  if (elements.deckBrowserName) elements.deckBrowserName.textContent = view.detail.name;
  if (elements.deckBrowserPosition) elements.deckBrowserPosition.textContent = view.positionText;
  if (elements.deckBrowserZone) elements.deckBrowserZone.textContent = view.entry.zoneSummary || view.entry.zoneLabel || "卡组";
  if (elements.deckBrowserCopy) elements.deckBrowserCopy.textContent = view.copyText;
  if (elements.deckBrowserText) elements.deckBrowserText.textContent = view.detail.effectText;
  if (elements.deckBrowserMeta) elements.deckBrowserMeta.textContent = view.detail.meta;
  if (elements.deckBrowserPrev) elements.deckBrowserPrev.disabled = !view.canPrevious;
  if (elements.deckBrowserNext) elements.deckBrowserNext.disabled = !view.canNext;

  if (elements.deckBrowserCard) {
    const card = createCardElement(doc, view.detail.card, { asset: assetForCard(view.detail.card) });
    card.classList.remove("selected", "used", "defense");
    elements.deckBrowserCard.replaceChildren(card);
  }

  if (elements.deckBrowserRail) {
    const fragment = doc.createDocumentFragment();
    view.entries.forEach((entry, entryIndex) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "deck-browser-rail-card";
      button.dataset.cardId = entry.id;
      button.dataset.index = String(entryIndex);
      button.dataset.count = String(entry.count || 1);
      button.setAttribute("aria-current", String(entryIndex === view.index));
      button.textContent = `${entryIndex + 1}. ${entry.name}${(entry.count || 1) > 1 ? ` ×${entry.count}` : ""}`;
      button.addEventListener("click", () => onSelect(entryIndex));
      fragment.appendChild(button);
    });
    elements.deckBrowserRail.replaceChildren(fragment);
    elements.deckBrowserRail.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  return view;
}

export function hideDeckBrowser(elements) {
  elements.deckBrowserModal?.classList.remove("show");
}
