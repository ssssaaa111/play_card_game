export function tributeCost(card) {
  return Math.max(0, Number(card?.tributeCost) || 0);
}

export function selectedTributeIndexes(pending, field = []) {
  const seen = new Set();
  return (pending?.selectedIndexes || []).filter((index) => {
    if (!Number.isInteger(index) || seen.has(index) || !field[index]) return false;
    seen.add(index);
    return true;
  });
}

export function defaultTributeSelection(field = [], cost = 0) {
  const required = Math.max(0, Number(cost) || 0);
  if (required <= 0) return [];
  const occupiedIndexes = field
    .map((card, index) => (card ? index : -1))
    .filter((index) => index >= 0);
  return occupiedIndexes.length === required ? occupiedIndexes : [];
}

export function prepareTributeSelection(card, handIndex, field = []) {
  const cost = tributeCost(card);
  if (card?.type !== "monster" || cost <= 0) {
    return { handled: false, ok: false, reason: "" };
  }
  const available = field.filter(Boolean).length;
  if (available < cost) {
    return {
      handled: true,
      ok: false,
      reason: `${card.name} 需要 ${cost} 只场上怪兽作为祭品。`
    };
  }
  const selectedIndexes = defaultTributeSelection(field, cost);
  return {
    handled: true,
    ok: true,
    pending: {
      handUid: card.uid,
      handIndex,
      cardName: card.name,
      cost,
      selectedIndexes
    },
    prompt: selectedIndexes.length === cost
      ? `场上正好有 ${cost} 只怪兽，已全部选为 ${card.name} 的祭品；确认后召唤。`
      : `选择 ${cost} 只我方场上怪兽作为 ${card.name} 的祭品。`
  };
}

export function pendingTributeHandInfo(pending, hand = []) {
  if (!pending) return null;
  const index = hand.findIndex((card) => card?.uid === pending.handUid);
  if (index < 0) return null;
  return { card: hand[index], index, pending };
}

export function toggleTributeIndex(pending, hand = [], field = [], index) {
  const info = pendingTributeHandInfo(pending, hand);
  if (!info) {
    return { ok: false, expired: true, reason: "祭品召唤已失效。" };
  }
  const card = field[index];
  if (!card) {
    return {
      ok: false,
      expired: false,
      reason: `请选择我方场上的怪兽作为 ${info.card.name} 的祭品。`
    };
  }
  const selectedIndexes = selectedTributeIndexes(pending, field);
  const existing = selectedIndexes.indexOf(index);
  if (existing >= 0) {
    selectedIndexes.splice(existing, 1);
  } else if (selectedIndexes.length < pending.cost) {
    selectedIndexes.push(index);
  } else {
    selectedIndexes.shift();
    selectedIndexes.push(index);
  }
  return {
    ok: true,
    card,
    handCard: info.card,
    selectedIndexes,
    complete: selectedIndexes.length === pending.cost,
    prompt: `${info.card.name} 祭品：${selectedIndexes.length}/${pending.cost}`
  };
}

export function validateTributeSummonSelection(
  pending,
  { hand = [], field = [] } = {},
  fieldIndex = null
) {
  const info = pendingTributeHandInfo(pending, hand);
  if (!info) {
    return { ok: false, expired: true, reason: "祭品召唤已失效。" };
  }
  const tributeIndexes = selectedTributeIndexes(pending, field);
  if (tributeIndexes.length !== pending.cost) {
    return {
      ok: false,
      expired: false,
      reason: `还需要选择 ${pending.cost - tributeIndexes.length} 只祭品。`
    };
  }
  const summonIndex = Number.isInteger(fieldIndex) ? fieldIndex : tributeIndexes[0];
  if (field[summonIndex] && !tributeIndexes.includes(summonIndex)) {
    return {
      ok: false,
      expired: false,
      reason: "祭品召唤只能放到空召唤区，或放到即将作为祭品离场的格子。"
    };
  }
  return {
    ok: true,
    expired: false,
    card: info.card,
    handIndex: info.index,
    pending,
    tributeIndexes,
    summonIndex
  };
}

export function tributeSelectionAction(card, pending, field = [], baseAction = {}) {
  const cost = tributeCost(card);
  if (card?.type !== "monster" || cost <= 0) return null;
  const available = field.filter(Boolean).length;
  if (available < cost) {
    return {
      ...baseAction,
      ok: false,
      label: "祭品不足",
      reason: `需要 ${cost} 只场上怪兽作为祭品。`
    };
  }
  const isPending = pending?.handUid === card.uid;
  const selectedCount = isPending ? selectedTributeIndexes(pending, field).length : 0;
  return {
    ...baseAction,
    label: isPending ? `祭品 ${selectedCount}/${cost}` : "祭品召唤",
    reason: isPending
      ? `选择 ${cost} 只我方场上怪兽后确认祭品召唤。`
      : `确认后选择 ${cost} 只我方场上怪兽作为祭品。`
  };
}
