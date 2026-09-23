import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileHandOrder,
  shiftHandCard,
  sortHandCardsByType,
  insertHandCard,
  handInsertionPoint,
  handInsertionPreview
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

test("hand display order supports accessible one-step moves and inserts without exchanging slots", () => {
  const order = ["a", "b", "c", "d"];

  assert.deepEqual(shiftHandCard(order, "c", -1), ["a", "c", "b", "d"]);
  assert.deepEqual(shiftHandCard(order, "a", -1), order, "left edge should clamp");
  assert.deepEqual(shiftHandCard(order, "d", 1), order, "right edge should clamp");
  assert.deepEqual(insertHandCard(order, "a", "d"), ["b", "c", "a", "d"], "moving right shifts the intervening cards");
  assert.deepEqual(insertHandCard(order, "d", "b"), ["a", "d", "b", "c"], "moving left inserts at a middle gap");
  assert.deepEqual(insertHandCard(order, "d", "a"), ["d", "a", "b", "c"], "insert at front");
  assert.deepEqual(insertHandCard(order, "b"), ["a", "c", "d", "b"], "drop beyond last card appends");
  assert.deepEqual(insertHandCard(order, "b", "c"), order, "dropping in the current gap is a no-op");
  assert.deepEqual(insertHandCard(order, "b", "b"), order);
  assert.deepEqual(insertHandCard(order, "missing", "b"), order);
  assert.deepEqual(insertHandCard(order, "b", "missing"), order);
  assert.deepEqual(order, ["a", "b", "c", "d"], "reordering helpers must be immutable");
});

test("drop position resolves gaps and either half of nearby cards in horizontal and vertical hands", () => {
  for (const vertical of [false, true]) {
    const cards = ["a", "b", "c", "d"].map((uid, index) => {
      const left = vertical ? 20 : 20 + index * 120;
      const top = vertical ? 20 + index * 180 : 20;
      return { uid, rect: { left, top, right: left + 100, bottom: top + 160, width: 100, height: 160 } };
    });
    const drop = (coordinate) => handInsertionPoint(cards, "d", vertical ? 70 : coordinate, vertical ? coordinate : 100);
    const gap = vertical ? 190 : 130;
    assert.equal(drop(gap).beforeUid, "b", "the gap between a and b inserts before b");
    assert.equal(drop(gap + 15).beforeUid, "b", "near the leading edge of b still inserts before b");
    assert.equal(drop(vertical ? 350 : 230).beforeUid, "c", "near the trailing edge of b inserts after b");
    assert.equal(drop(10).beforeUid, "a");
    assert.equal(drop(1000).beforeUid, null);
    assert.equal(drop(gap).vertical, vertical);
    assert.equal(vertical ? drop(gap).height : drop(gap).width, 3, "the marker follows the insertion axis");
  }
  assert.equal(handInsertionPoint([{ uid: "a", rect: {} }], "a", 0, 0), null);
});

test("inserting after a live hand change preserves new cards and the rule hand", () => {
  const ruleHand = [card("a"), card("b"), card("c"), card("drawn")];
  const order = reconcileHandOrder(ruleHand, ["c", "a", "b"]).map((entry) => entry.uid);
  assert.deepEqual(insertHandCard(order, "c", "b"), ["a", "c", "b", "drawn"]);
  assert.deepEqual(ruleHand.map((entry) => entry.uid), ["a", "b", "c", "drawn"]);
});

test("insertion preview closes the original gap and reserves one full card slot in either axis", () => {
  for (const vertical of [false, true]) {
    const cards = ["a", "b", "c", "d"].map((uid, index) => ({
      uid, rect: { left: vertical ? 0 : index * 120, top: vertical ? index * 180 : 0, width: 100, height: 160 }
    }));
    const before = structuredClone(cards);
    const preview = handInsertionPreview(cards, "d", "b");
    assert.deepEqual(preview.slot, cards[1].rect, "placeholder occupies the final position of the dragged card");
    assert.deepEqual(preview.shifts, [
      { uid: "a", x: 0, y: 0 },
      { uid: "b", x: vertical ? 0 : 120, y: vertical ? 180 : 0 },
      { uid: "c", x: vertical ? 0 : 120, y: vertical ? 180 : 0 }
    ]);
    const reverse = handInsertionPreview(cards, "a", "d");
    assert.deepEqual(reverse.slot, cards[2].rect);
    assert.equal(vertical ? reverse.shifts[0].y : reverse.shifts[0].x, vertical ? -180 : -120);
    assert.deepEqual(cards, before, "preview must leave hit-test geometry fixed while neighbors animate");
  }
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
