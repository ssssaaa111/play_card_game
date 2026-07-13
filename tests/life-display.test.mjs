import test from "node:test";
import assert from "node:assert/strict";

import { buildLifeDisplay } from "../src/life-display.js";

test("life display keeps the exact current and maximum values visible", () => {
  assert.deepEqual(buildLifeDisplay(3850, 4000), {
    current: 3850,
    max: 4000,
    text: "3850 / 4000",
    ariaLabel: "生命值 3850 / 4000",
    percent: 96.25
  });
});

test("life display clamps invalid or out-of-range values", () => {
  assert.equal(buildLifeDisplay(Number.NaN, 4000).text, "0 / 4000");
  assert.equal(buildLifeDisplay(-200, 4000).percent, 0);
  assert.equal(buildLifeDisplay(4200, 4000).percent, 100);
});
