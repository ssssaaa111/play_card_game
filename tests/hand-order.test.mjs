import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileHandOrder,
  shiftHandCard,
  sortHandCardsByType,
  swapHandCards
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

test("hand display order supports accessible one-step moves and two-way drag swaps", () => {
  const order = ["a", "b", "c", "d"];

  assert.deepEqual(shiftHandCard(order, "c", -1), ["a", "c", "b", "d"]);
  assert.deepEqual(shiftHandCard(order, "a", -1), order, "left edge should clamp");
  assert.deepEqual(shiftHandCard(order, "d", 1), order, "right edge should clamp");
  assert.deepEqual(swapHandCards(order, "a", "d"), ["d", "b", "c", "a"], "left-to-right drag swaps both slots");
  assert.deepEqual(swapHandCards(order, "d", "a"), ["d", "b", "c", "a"], "right-to-left drag uses the same swap rule");
  assert.deepEqual(swapHandCards(order, "b", "c"), ["a", "c", "b", "d"], "adjacent cards can swap");
  assert.deepEqual(order, ["a", "b", "c", "d"], "reordering helpers must be immutable");
});

test("type sorting groups the displayed hand while preserving relative order and rule state", () => {
  const ruleHand = [
    { ...card("spell"), type: "spell" },
    { ...card("monster-a"), type: "monster", stars: 4 },
    { ...card("trap"), type: "trap" },
    { ...card("monster-b"), type: "monster", stars: 8 }
  ];
  const before = [...ruleHand];
  const sorted = sortHandCardsByType(ruleHand, ["trap", "monster-a", "spell", "monster-b"]);

  assert.deepEqual(sorted.map((entry) => entry.uid), ["monster-b", "monster-a", "spell", "trap"]);
  assert.deepEqual(ruleHand, before, "type sorting must not mutate the engine hand array");
});

test("type sorting places a newly drawn card into its group without disturbing prior group order", () => {
  const initial = [
    { ...card("monster"), type: "monster", stars: 4 },
    { ...card("spell-a"), type: "spell" },
    { ...card("trap"), type: "trap" }
  ];
  const preferredOrder = sortHandCardsByType(initial).map((entry) => entry.uid);
  const afterDraw = [...initial, { ...card("spell-b"), type: "spell" }];

  assert.deepEqual(
    sortHandCardsByType(afterDraw, preferredOrder).map((entry) => entry.uid),
    ["monster", "spell-a", "spell-b", "trap"]
  );
});
