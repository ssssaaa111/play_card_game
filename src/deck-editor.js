import { library } from "./data.js";
import { MAX_COPIES_PER_CARD, validateCustomDeck } from "./custom-decks.js";

const libraryIndex = new Map(library.map((card) => [card.id, card]));

export function deckCardById(id) {
  return libraryIndex.get(id) || null;
}

const GROUP_DEFINITIONS = [
  { type: "monster", key: "monsters", label: "怪兽" },
  { type: "spell", key: "spells", label: "魔法" },
  { type: "trap", key: "traps", label: "陷阱" }
];

function cardMetaLine(card) {
  if (card.type === "monster") {
    return `ATK ${card.attack} / DEF ${card.defense}`;
  }
  return card.summary || card.rule || card.text || "";
}

export function buildDeckLibraryGroups(counts = {}) {
  return GROUP_DEFINITIONS.map(({ type, key, label }) => ({
    key,
    label,
    type,
    cards: library
      .filter((card) => card.type === type)
      .map((card) => {
        const count = counts[card.id] || 0;
        return {
          id: card.id,
          name: card.name,
          type: card.type,
          count,
          maxed: count >= MAX_COPIES_PER_CARD,
          meta: cardMetaLine(card)
        };
      })
  }));
}

export function buildDraftEntries(draftIds = []) {
  const seen = new Set();
  const entries = [];
  draftIds.forEach((id) => {
    const card = deckCardById(id);
    if (!card || seen.has(id)) return;
    seen.add(id);
    entries.push({
      id,
      name: card.name,
      type: card.type,
      count: draftIds.filter((entry) => entry === id).length
    });
  });
  return entries;
}

export function validationSummary(validation = {}) {
  const messages = validation.errors?.map((entry) => entry.message) || [];
  if (validation.ok) {
    return `卡组合法：${validation.total} 张`;
  }
  return messages.length ? messages.join("；") : `卡组无效：${validation.total} 张`;
}

export function buildDeckEditorView({
  customDecks = [],
  draftIds = [],
  selectedId = null,
  draftName = ""
} = {}) {
  const validation = validateCustomDeck(draftIds);
  const selectedDeck = customDecks.find((deck) => deck.id === selectedId) || null;
  return {
    selectedId,
    selectedDeck,
    draftName,
    draftSize: validation.total,
    draftEntries: buildDraftEntries(draftIds),
    validation,
    validationText: validationSummary(validation),
    canSave: validation.ok,
    canDelete: Boolean(selectedDeck),
    decks: customDecks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      size: deck.ids.length,
      selected: deck.id === selectedId
    })),
    libraryGroups: buildDeckLibraryGroups(validation.counts)
  };
}
