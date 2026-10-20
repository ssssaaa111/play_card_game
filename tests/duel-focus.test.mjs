import test from "node:test";
import assert from "node:assert/strict";

import { duelFocusView } from "../src/duel-focus.js";

test("duel focus prioritizes public resolution over player selection state", () => {
  assert.deepEqual(duelFocusView({
    aiActionActive: true,
    aiStage: "result",
    targetActive: true,
    selectionActive: true
  }), { mode: "resolution", stage: "result", actor: "ai" });
});

test("duel focus maps player interaction states to one visual hierarchy", () => {
  assert.equal(duelFocusView({ responseActive: true, targetActive: true }).mode, "response");
  assert.equal(duelFocusView({ targetActive: true, materialActive: true }).mode, "target");
  assert.equal(duelFocusView({ materialActive: true, placementActive: true }).mode, "material");
  assert.equal(duelFocusView({ placementActive: true, attackActive: true }).mode, "placement");
  assert.equal(duelFocusView({ attackActive: true, selectionActive: true }).mode, "attack");
  assert.equal(duelFocusView({ selectionActive: true }).mode, "command");
  assert.equal(duelFocusView().mode, "idle");
});

test("duel focus rejects stale public action stages", () => {
  assert.deepEqual(duelFocusView({ aiActionActive: true, aiStage: "stale" }), {
    mode: "resolution",
    stage: "source",
    actor: "ai"
  });
});
