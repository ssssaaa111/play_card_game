import test from "node:test";
import assert from "node:assert/strict";

import { buildLifeDisplay } from "../src/life-display.js";

test("life display keeps the exact current and maximum values visible", () => {
  assert.deepEqual(buildLifeDisplay(3850, 4000), {
    current: 3850,
    max: 4000,
    text: "3850 / 4000",
    ariaLabel: "生命值 3850 / 4000",
    percent: 96.25,
    tone: "stable"
  });
});

test("life display preserves numeric LP values received through UI projection", () => {
  const display = buildLifeDisplay("850", "4000");

  assert.equal(display.current, 850);
  assert.equal(display.max, 4000);
  assert.equal(display.text, "850 / 4000");
  assert.equal(display.percent, 21.25);
  assert.equal(display.tone, "critical");
});

test("life display clamps invalid or out-of-range values", () => {
  assert.equal(buildLifeDisplay(Number.NaN, 4000).text, "0 / 4000");
  assert.equal(buildLifeDisplay(-200, 4000).percent, 0);
  assert.equal(buildLifeDisplay(4200, 4000).percent, 100);
});

test("life display exposes stable warning and critical HUD tones", () => {
  assert.equal(buildLifeDisplay(3000, 4000).tone, "stable");
  assert.equal(buildLifeDisplay(2000, 4000).tone, "warning");
  assert.equal(buildLifeDisplay(1000, 4000).tone, "critical");
});
