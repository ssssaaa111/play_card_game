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

export function placeHandCard(order = [], sourceUid, targetUid) {
  const next = [...order];
  if (!sourceUid || !targetUid || sourceUid === targetUid) return next;
  const sourceIndex = next.indexOf(sourceUid);
  if (sourceIndex < 0 || !next.includes(targetUid)) return next;
  next.splice(sourceIndex, 1);
  const targetIndex = next.indexOf(targetUid);
  next.splice(targetIndex, 0, sourceUid);
  return next;
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

export function handPlacementTap(selectedUid = "", tappedUid = "") {
  if (!tappedUid) return { selectedUid, placement: null };
  if (!selectedUid) return { selectedUid: tappedUid, placement: null };
  if (selectedUid === tappedUid) return { selectedUid: "", placement: null };
  return {
    selectedUid: "",
    placement: { sourceUid: selectedUid, targetUid: tappedUid }
  };
}
