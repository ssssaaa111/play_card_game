const PENDING_FIELD_BY_KIND = Object.freeze({
  target: "pendingTarget",
  tribute: "pendingTribute",
  fusion: "pendingFusion"
});

function pendingField(kind) {
  const field = PENDING_FIELD_BY_KIND[kind];
  if (!field) throw new Error(`Unknown selection kind: ${kind}`);
  return field;
}

function clearPendingFields(state) {
  Object.values(PENDING_FIELD_BY_KIND).forEach((field) => {
    state[field] = null;
  });
}

export function createSelectionState() {
  return {
    selected: null,
    pendingTarget: null,
    pendingTribute: null,
    pendingFusion: null
  };
}

export function selectionStateSnapshot(state = {}) {
  const pendingKinds = Object.entries(PENDING_FIELD_BY_KIND)
    .filter(([, field]) => Boolean(state[field]))
    .map(([kind]) => kind);
  const pendingKind = pendingKinds.length === 1
    ? pendingKinds[0]
    : pendingKinds.length > 1
      ? "conflict"
      : "";
  const pending = pendingKinds.length === 1
    ? state[PENDING_FIELD_BY_KIND[pendingKind]]
    : null;
  return {
    selected: state.selected || null,
    pendingKind,
    pending,
    pendingKinds,
    hasPending: pendingKinds.length > 0,
    conflicted: pendingKinds.length > 1
  };
}

export function beginPendingSelection(state, kind, pending, selected = null) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Selection state must be an object.");
  }
  if (!pending || typeof pending !== "object") {
    throw new TypeError("Pending selection must be an object.");
  }
  const field = pendingField(kind);
  clearPendingFields(state);
  state[field] = pending;
  state.selected = selected;
  return selectionStateSnapshot(state);
}

export function clearPendingSelection(state, kind) {
  state[pendingField(kind)] = null;
  return selectionStateSnapshot(state);
}

export function clearTransientSelection(state) {
  clearPendingFields(state);
  state.selected = null;
  return selectionStateSnapshot(state);
}
