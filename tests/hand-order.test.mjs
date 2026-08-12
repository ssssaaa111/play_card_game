import test from "node:test";
import assert from "node:assert/strict";

import {
  placeHandCard,
  reconcileHandOrder,
  shiftHandCard
} from "../src/hand-order.js";

function card(uid) {
  return { uid, id: uid, name: uid };
}

test("hand display order ignores stale ids and appends newly drawn cards without mutating rule state", () => {
  const ruleHand = [card("a"), card("b"), card("c"), card("drawn")];
  const before = [...ruleHand];
  const ordered = reconcileHandOrder(ruleHand, ["c", "missing", "a", "b"]);

  assert.deepEqual(ordered.map((entry) => entry.uid), ["c", "a", "b", "drawn"]);
  assert.deepEqual(ruleHand, before, "UI ordering must never mutate the engine hand array");
  assert.notEqual(ordered, ruleHand);
});

test("hand display order supports accessible one-step moves and drag placement", () => {
  const order = ["a", "b", "c", "d"];

  assert.deepEqual(shiftHandCard(order, "c", -1), ["a", "c", "b", "d"]);
  assert.deepEqual(shiftHandCard(order, "a", -1), order, "left edge should clamp");
  assert.deepEqual(shiftHandCard(order, "d", 1), order, "right edge should clamp");
  assert.deepEqual(placeHandCard(order, "a", "d"), ["b", "c", "a", "d"]);
  assert.deepEqual(order, ["a", "b", "c", "d"], "reordering helpers must be immutable");
});
