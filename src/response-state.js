function uniqueTrapIndexes(candidates = []) {
  return [...new Set(
    candidates
      .map((candidate) => candidate?.index)
      .filter((index) => Number.isInteger(index) && index >= 0)
  )];
}

export function createTrapResponse({
  owner = "player",
  eventName = "",
  details = {},
  candidates = []
} = {}) {
  const trapIndexes = uniqueTrapIndexes(candidates);
  return {
    owner,
    eventName,
    details,
    trapIndexes,
    selectedIndex: trapIndexes.length === 1 ? trapIndexes[0] : -1
  };
}

export function selectTrapResponse(response, index) {
  if (!response?.trapIndexes?.includes(index)) return null;
  return {
    ...response,
    selectedIndex: index
  };
}

export function canActivateTrapResponse(response, traps = []) {
  return Boolean(
    response?.trapIndexes?.includes(response.selectedIndex) &&
    traps[response.selectedIndex]
  );
}

export function resolveTrapResponse(response, answer, traps = []) {
  const selectedCard = traps[response?.selectedIndex];
  const skippedName = selectedCard?.name || "";
  if (!answer) {
    return {
      ok: true,
      trapIndex: -1,
      skippedName
    };
  }
  if (!response?.trapIndexes?.includes(response.selectedIndex)) {
    return {
      ok: false,
      reason: "missing-selection",
      trapIndex: -1,
      skippedName: ""
    };
  }
  if (!selectedCard) {
    return {
      ok: false,
      reason: "missing-trap",
      trapIndex: -1,
      skippedName: ""
    };
  }
  return {
    ok: true,
    trapIndex: response.selectedIndex,
    skippedName
  };
}
