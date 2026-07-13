import test from "node:test";
import assert from "node:assert/strict";

import { buildSupportCardDisplay } from "../src/support-card-display.js";

test("distinguishes armed traps from active equipment spells", () => {
  assert.deepEqual(buildSupportCardDisplay({ type: "trap" }), {
    key: "armed",
    label: "已盖放",
    description: "陷阱已盖放",
    type: "trap",
    typeLabel: "陷阱"
  });
  assert.deepEqual(buildSupportCardDisplay({ type: "spell" }), {
    key: "active",
    label: "生效中",
    description: "持续魔法生效中",
    type: "spell",
    typeLabel: "魔法"
  });
});

test("prioritizes selection, targeting, and response states", () => {
  const trap = { type: "trap" };
  assert.equal(buildSupportCardDisplay(trap, { responseReady: true }).key, "response");
  assert.equal(buildSupportCardDisplay(trap, { responseReady: true, targetable: true }).key, "targeting");
  assert.equal(buildSupportCardDisplay(trap, {
    responseReady: true,
    targetable: true,
    responseSelected: true
  }).key, "selected");
});
