function cardUid(card) {
  return card?.uid || "";
}

export function reconcileHandOrder(cards = [], preferredOrder = []) {
  const byUid = new Map(cards.map((card) => [cardUid(card), card]).filter(([uid]) => uid));
  const ordered = [];
  const seen = new Set();

  preferredOrder.forEach((uid) => {
    const card = byUid.get(uid);
    if (!card || seen.has(uid)) return;
    seen.add(uid);
    ordered.push(card);
  });
  cards.forEach((card) => {
    const uid = cardUid(card);
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    ordered.push(card);
  });
  return ordered;
}

export function shiftHandCard(order = [], uid, direction = 0) {
  const next = [...order];
  const fromIndex = next.indexOf(uid);
  if (fromIndex < 0) return next;
  const toIndex = Math.max(0, Math.min(next.length - 1, fromIndex + Math.sign(direction)));
  if (toIndex === fromIndex) return next;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, uid);
  return next;
}

export function insertHandCard(order = [], sourceUid, beforeUid = null) {
  const next = [...order];
  if (!sourceUid || sourceUid === beforeUid) return next;
  const sourceIndex = next.indexOf(sourceUid);
  if (sourceIndex < 0 || (beforeUid !== null && !next.includes(beforeUid))) return next;
  next.splice(sourceIndex, 1);
  next.splice(beforeUid === null ? next.length : next.indexOf(beforeUid), 0, sourceUid);
  return next;
}

export function handInsertionPoint(cards, sourceUid, x, y) {
  const remaining = cards.filter((entry) => entry.uid !== sourceUid);
  if (!remaining.length) return null;
  const vertical = cards.length > 1 && Math.abs(cards[0].rect.top - cards[1].rect.top) > cards[0].rect.height / 2;
  const coordinate = vertical ? y : x;
  const next = remaining.find(({ rect }) => coordinate < (vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2));
  const anchor = (next || remaining.at(-1)).rect;
  return {
    beforeUid: next?.uid || null,
    vertical,
    left: vertical ? anchor.left : next ? anchor.left - 5 : anchor.right + 5,
    top: vertical ? next ? anchor.top - 5 : anchor.bottom + 5 : anchor.top,
    width: vertical ? anchor.width : 3,
    height: vertical ? 3 : anchor.height
  };
}

export function handInsertionPreview(cards, sourceUid, beforeUid) {
  const order = insertHandCard(cards.map((card) => card.uid), sourceUid, beforeUid);
  const slot = cards[order.indexOf(sourceUid)]?.rect;
  return {
    slot,
    shifts: cards.filter((card) => card.uid !== sourceUid).map((card) => {
      const target = cards[order.indexOf(card.uid)].rect;
      return { uid: card.uid, x: target.left - card.rect.left, y: target.top - card.rect.top };
    })
  };
}

const HAND_TYPE_ORDER = new Map([
  ["monster", 0],
  ["spell", 1],
  ["trap", 2]
]);

export function sortHandCardsByType(cards = [], preferredOrder = []) {
  return reconcileHandOrder(cards, preferredOrder)
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const typeDifference = (HAND_TYPE_ORDER.get(left.card?.type) ?? 3) - (HAND_TYPE_ORDER.get(right.card?.type) ?? 3);
      if (typeDifference) return typeDifference;
      if (left.card?.type === "monster") {
        const starDifference = (Number(right.card?.stars) || 0) - (Number(left.card?.stars) || 0);
        if (starDifference) return starDifference;
      }
      return left.index - right.index;
    })
    .map(({ card }) => card);
}
