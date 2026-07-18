import test from "node:test";
import assert from "node:assert/strict";

import {
  beginPendingSelection,
  clearPendingSelection,
  clearTransientSelection,
  createSelectionState,
  selectionStateSnapshot
} from "../src/selection-state.js";

test("creates an empty transient selection state", () => {
  const state = createSelectionState();

  assert.deepEqual(state, {
    selected: null,
    pendingTarget: null,
    pendingTribute: null,
    pendingFusion: null
  });
  assert.deepEqual(selectionStateSnapshot(state), {
    selected: null,
    pendingKind: "",
    pending: null,
    pendingKinds: [],
    hasPending: false,
    conflicted: false
  });
});

test("beginning a pending selection makes modes mutually exclusive", () => {
  const state = {
    ...createSelectionState(),
    pendingTribute: { handUid: "tribute-1" },
    pendingFusion: { handUid: "fusion-1" }
  };
  const pendingTarget = { handUid: "spell-1", effect: "buff500" };
  const snapshot = beginPendingSelection(
    state,
    "target",
    pendingTarget,
    { zone: "hand", uid: "spell-1" }
  );

  assert.equal(state.pendingTarget, pendingTarget);
  assert.equal(state.pendingTribute, null);
  assert.equal(state.pendingFusion, null);
  assert.equal(snapshot.pendingKind, "target");
  assert.equal(snapshot.pending, pendingTarget);
  assert.deepEqual(snapshot.selected, { zone: "hand", uid: "spell-1" });
  assert.equal(snapshot.conflicted, false);
});

test("switching to fusion replaces target and tribute state atomically", () => {
  const state = createSelectionState();
  beginPendingSelection(state, "target", { handUid: "spell-1" }, { zone: "hand", uid: "spell-1" });

  const snapshot = beginPendingSelection(
    state,
    "fusion",
    { handUid: "fusion-1", selectedIndexes: [] },
    { zone: "hand", uid: "fusion-1" }
  );

  assert.equal(state.pendingTarget, null);
  assert.equal(state.pendingTribute, null);
  assert.equal(snapshot.pendingKind, "fusion");
  assert.deepEqual(snapshot.pendingKinds, ["fusion"]);
  assert.deepEqual(state.selected, { zone: "hand", uid: "fusion-1" });
});

test("clearing one pending mode preserves the selected card", () => {
  const state = createSelectionState();
  beginPendingSelection(state, "tribute", { handUid: "boss-1" }, { zone: "hand", uid: "boss-1" });

  const snapshot = clearPendingSelection(state, "tribute");

  assert.equal(snapshot.hasPending, false);
  assert.deepEqual(state.selected, { zone: "hand", uid: "boss-1" });
});

test("clearing transient selection removes every pending mode and selected card", () => {
  const state = {
    selected: { zone: "playerField", index: 2 },
    pendingTarget: { handUid: "spell-1" },
    pendingTribute: { handUid: "boss-1" },
    pendingFusion: { handUid: "fusion-1" }
  };

  const snapshot = clearTransientSelection(state);

  assert.equal(snapshot.hasPending, false);
  assert.equal(snapshot.selected, null);
  assert.equal(state.pendingTarget, null);
  assert.equal(state.pendingTribute, null);
  assert.equal(state.pendingFusion, null);
});

test("snapshot exposes legacy conflicts without choosing an arbitrary mode", () => {
  const snapshot = selectionStateSnapshot({
    selected: { zone: "hand", uid: "card-1" },
    pendingTarget: { handUid: "card-1" },
    pendingTribute: null,
    pendingFusion: { handUid: "card-2" }
  });

  assert.equal(snapshot.pendingKind, "conflict");
  assert.equal(snapshot.pending, null);
  assert.deepEqual(snapshot.pendingKinds, ["target", "fusion"]);
  assert.equal(snapshot.conflicted, true);
});

test("unknown selection modes fail early", () => {
  assert.throws(
    () => beginPendingSelection(createSelectionState(), "attack", { index: 0 }),
    /Unknown selection kind/
  );
});
