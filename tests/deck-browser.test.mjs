import test from "node:test";
import assert from "node:assert/strict";

import { cardDefinitionById } from "../src/card-detail.js";
import {
  deckBrowserSwipeOffset,
  deckBrowserView,
  moveDeckBrowserIndex
} from "../src/deck-browser.js";

const preview = {
  displayDeckCards: [
    { id: "ember-drake", name: "赤焰幼龙", count: 2, zoneSummary: "起手 / 卡组" },
    { id: "seer-call", name: "预见之召", count: 1, zoneSummary: "卡组" },
    { id: "mirror-snare", name: "镜光反制", count: 1, zoneSummary: "卡组" }
  ]
};

test("deck browser projects every compact deck entry through the unified card definition", () => {
  const first = deckBrowserView(preview, 0);
  const last = deckBrowserView(preview, 99);

  assert.equal(first.total, 3);
  assert.equal(first.index, 0);
  assert.equal(first.positionText, "1 / 3");
  assert.equal(first.copyText, "2 张");
  assert.equal(first.detail.card, cardDefinitionById("ember-drake"));
  assert.equal(first.canPrevious, false);
  assert.equal(first.canNext, true);
  assert.equal(last.index, 2, "out-of-range indices should clamp to the last public entry");
  assert.equal(last.detail.card, cardDefinitionById("mirror-snare"));
});

test("deck browser navigation clamps at both ends and treats horizontal swipes as navigation", () => {
  assert.equal(moveDeckBrowserIndex(0, 3, -1), 0);
  assert.equal(moveDeckBrowserIndex(0, 3, 1), 1);
  assert.equal(moveDeckBrowserIndex(2, 3, 1), 2);
  assert.equal(deckBrowserSwipeOffset(220, 120), 1, "swiping left should show the next card");
  assert.equal(deckBrowserSwipeOffset(120, 220), -1, "swiping right should show the previous card");
  assert.equal(deckBrowserSwipeOffset(120, 150), 0, "short movement should remain a tap");
});
