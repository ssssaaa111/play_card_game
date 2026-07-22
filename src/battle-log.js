export function logEntryMessage(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return entry;
  return String(entry.message ?? entry.text ?? "");
}

function normalizedCardIds(cardId, relatedCardIds = []) {
  return [cardId, ...relatedCardIds]
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index);
}

export function publicLogCardIds(entry) {
  if (!entry || typeof entry === "string" || !entry.public) return [];
  return normalizedCardIds(entry.cardId, entry.relatedCardIds);
}

export function createBattleLogEntry(input, metadata = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : { message: input };
  const message = logEntryMessage(source);
  const entry = {
    id: source.id ?? metadata.id ?? null,
    turn: source.turn ?? metadata.turn ?? null,
    actor: source.actor ?? metadata.actor ?? null,
    type: source.type ?? metadata.type ?? "info",
    message,
    cardId: source.cardId ?? metadata.cardId ?? null,
    relatedCardIds: Array.isArray(source.relatedCardIds)
      ? [...source.relatedCardIds]
      : Array.isArray(metadata.relatedCardIds)
        ? [...metadata.relatedCardIds]
        : [],
    public: Boolean(source.public ?? metadata.public ?? false)
  };
  entry.includes = (...args) => entry.message.includes(...args);
  entry.toString = () => entry.message;
  entry.valueOf = () => entry.message;
  return entry;
}

export function logEntryHasPublicCardDetails(entry) {
  return publicLogCardIds(entry).length > 0;
}
