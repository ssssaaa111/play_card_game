import test from "node:test";
import assert from "node:assert/strict";

import { lifeDeltaAnchor } from "../src/animation.js";

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test("life delta anchors to the portrait column instead of the LP title", () => {
  const anchor = lifeDeltaAnchor({ left: 1001, top: 142, width: 255, height: 205 });
  const delta = { left: anchor.x, right: anchor.x + 100, top: anchor.y, bottom: anchor.y + 45 };
  const lp = { left: 1176, right: 1240, top: 157, bottom: 183 };

  assert.deepEqual(anchor, { x: 1013, y: 178.9 });
  assert.equal(rectanglesOverlap(delta, lp), false);
});

test("life delta stays inside a compact player panel", () => {
  const panel = { left: 18, top: 120, width: 354, height: 190 };
  const anchor = lifeDeltaAnchor(panel);

  assert.ok(anchor.x >= panel.left);
  assert.ok(anchor.x + 100 <= panel.left + panel.width);
  assert.ok(anchor.y >= panel.top);
  assert.ok(anchor.y + 45 <= panel.top + panel.height);
});
