import { deckPresets, library } from './data.js';
import { inferArchetype, inferRarity } from './cards.js';
import { FIELD_SIZE, MAX_LP } from './rules.js';

export function createDuelist(owner) {
  return {
    owner,
    lp: MAX_LP,
    deck: [],
    hand: [],
    field: Array(FIELD_SIZE).fill(null),
    traps: Array(FIELD_SIZE).fill(null),
    grave: [],
    shield: 0,
    extraSummon: 0,
    attackResets: 0,
    directAttacks: 0,
    attacksSkipped: false,
    comboThisTurn: false,
    comboFlags: {},
    normalSummonsUsed: 0
  };
}

export function cloneCard(template) {
  const randomId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(16).slice(2);

  return {
    ...template,
    uid: `${template.id}-${randomId}`,
    rarity: template.rarity || inferRarity(template),
    archetype: template.archetype || inferArchetype(template),
    used: false,
    changedMode: false,
    mode: "attack",
    tempAtk: 0,
    tempDef: 0,
    battleWear: 0
  };
}

export function cardById(id) {
  return library.find((card) => card.id === id) || null;
}

export function cloneCardById(id) {
  const template = cardById(id);
  return template ? cloneCard(template) : null;
}

export function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildDeck(preset = "balanced") {
  const ids = deckPresets[preset]?.ids || deckPresets.balanced.ids;
  return shuffle(ids
    .map((id) => cardById(id))
    .filter(Boolean)
    .map((card) => cloneCard(card)));
}

export function buildScenarioDeck(preset, reservedIds = []) {
  const reserved = new Map();
  reservedIds.forEach((id) => reserved.set(id, (reserved.get(id) || 0) + 1));
  const ids = deckPresets[preset]?.ids || deckPresets.balanced.ids;
  const deckIds = ids.filter((id) => {
    const count = reserved.get(id) || 0;
    if (count <= 0) return true;
    reserved.set(id, count - 1);
    return false;
  });
  return shuffle(deckIds
    .map((id) => cardById(id))
    .filter(Boolean)
    .map((card) => cloneCard(card)));
}

export function loadCardList(ids = []) {
  return ids.map((id) => cloneCardById(id)).filter(Boolean);
}
