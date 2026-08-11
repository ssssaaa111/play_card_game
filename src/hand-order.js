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
