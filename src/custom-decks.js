import { library } from "./data.js";

export const CUSTOM_DECK_PREFIX = "custom:";
export const CUSTOM_DECK_STORAGE_KEY = "starDuelCustomDecks";
export const DECK_SIZE_MIN = 40;
export const DECK_SIZE_MAX = 60;
export const MAX_COPIES_PER_CARD = 3;
export const DECK_NAME_MAX_LENGTH = 24;

const FALLBACK_DECK_NAME = "我的卡组";

function browserStorage() {
  return typeof globalThis !== "undefined" &&
    globalThis.localStorage &&
    typeof globalThis.localStorage.getItem === "function"
    ? globalThis.localStorage
    : null;
}

export function isCustomDeckId(id) {
  return typeof id === "string" && id.startsWith(CUSTOM_DECK_PREFIX);
}

export function normalizeDeckName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return (trimmed || FALLBACK_DECK_NAME).slice(0, DECK_NAME_MAX_LENGTH);
}

export function newCustomDeckId() {
  const randomId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(16).slice(2);
  return `${CUSTOM_DECK_PREFIX}${randomId}`;
}

export function sanitizeCustomDeck(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.name !== "string" || !Array.isArray(entry.ids)) return null;
  const id = typeof entry.id === "string" && entry.id.length
    ? (isCustomDeckId(entry.id) ? entry.id : `${CUSTOM_DECK_PREFIX}${entry.id}`)
    : newCustomDeckId();
  return {
    id,
    name: normalizeDeckName(entry.name),
    ids: entry.ids.filter((cardId) => typeof cardId === "string")
  };
}

export function readCustomDecks(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(CUSTOM_DECK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeCustomDeck)
      .filter((deck) => deck && deck.ids.length > 0);
  } catch (error) {
    return [];
  }
}

export function writeCustomDecks(decks = [], storage = browserStorage()) {
  try {
    storage?.setItem(CUSTOM_DECK_STORAGE_KEY, JSON.stringify(decks));
    return true;
  } catch (error) {
    return false;
  }
}

export function createCustomDeck(name, ids = []) {
  return {
    id: newCustomDeckId(),
    name: normalizeDeckName(name),
    ids: [...ids]
  };
}

export function upsertCustomDeck(deck, storage = browserStorage()) {
  const decks = readCustomDecks(storage);
  const clean = sanitizeCustomDeck(deck);
  if (!clean) return null;
  const index = decks.findIndex((entry) => entry.id === clean.id);
  if (index >= 0) {
    decks[index] = clean;
  } else {
    decks.push(clean);
  }
  return writeCustomDecks(decks, storage) ? decks : null;
}

export function removeCustomDeck(id, storage = browserStorage()) {
  const decks = readCustomDecks(storage);
  const next = decks.filter((deck) => deck.id !== id);
  if (next.length === decks.length) return decks;
  return writeCustomDecks(next, storage) ? next : null;
}

export function validateCustomDeck(ids = []) {
  const knownIds = new Set(library.map((card) => card.id));
  const counts = new Map();
  let total = 0;
  let unknown = 0;
  ids.forEach((id) => {
    if (!knownIds.has(id)) {
      unknown += 1;
      return;
    }
    counts.set(id, (counts.get(id) || 0) + 1);
    total += 1;
  });

  const errors = [];
  if (total < DECK_SIZE_MIN) {
    errors.push({
      code: "too-few",
      message: `卡组至少需要 ${DECK_SIZE_MIN} 张卡（当前 ${total} 张）`
    });
  }
  if (total > DECK_SIZE_MAX) {
    errors.push({
      code: "too-many",
      message: `卡组最多 ${DECK_SIZE_MAX} 张卡（当前 ${total} 张）`
    });
  }
  const overCopy = [...counts.entries()]
    .filter(([, count]) => count > MAX_COPIES_PER_CARD)
    .map(([id, count]) => `${id} x${count}`);
  if (overCopy.length) {
    errors.push({
      code: "copy-limit",
      message: `同名卡最多 ${MAX_COPIES_PER_CARD} 张：${overCopy.join("、")}`
    });
  }
  if (unknown > 0) {
    errors.push({
      code: "unknown-cards",
      message: `${unknown} 张卡不在卡牌库中`
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    total,
    unknown,
    counts: Object.fromEntries(counts)
  };
}

export function deckDefinitionMap(deckPresets = {}, customDecks = []) {
  const definitions = { ...deckPresets };
  customDecks.forEach((deck) => {
    definitions[deck.id] = {
      label: deck.name,
      ids: deck.ids,
      custom: true
    };
  });
  return definitions;
}

export function resolveDeckDefinition(presetId, customDecks = [], definitions = null) {
  if (isCustomDeckId(presetId)) {
    const deck = customDecks.find((entry) => entry.id === presetId);
    if (deck) {
      return {
        label: deck.name,
        ids: deck.ids,
        custom: true
      };
    }
    return null;
  }
  return definitions?.[presetId] || null;
}
