import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDirectActivationTracker } from "../src/direct-activation.js";

const [app, handRenderer, fieldRenderer] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/hand-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../src/field-renderer.js", import.meta.url), "utf8")
]);

test("hand spells expose a double-click activation callback", () => {
  assert.match(handRenderer, /onCardDoubleClick/);
  assert.match(app, /onCardDoubleClick:\s*\(card\)\s*=>/);
});

test("rapid repeat activation survives a renderer replacing the clicked card node", () => {
  let time = 1000;
  const tracker = createDirectActivationTracker({ now: () => time });

  assert.equal(tracker.register("hand:spell-1"), false);
  time += 180;
  assert.equal(tracker.register("hand:spell-1"), true);
  time += 100;
  assert.equal(tracker.register("ai:traps:0"), false);
  time += 180;
  assert.equal(tracker.register("ai:traps:0"), true);
});

test("monster, support, and grave targets expose direct double-click resolution", () => {
  assert.match(fieldRenderer, /slot\.addEventListener\("dblclick"/);
  assert.match(fieldRenderer, /onCardDoubleClick\(card, index\)/);
  assert.match(app, /interactWithPendingSpellTarget\("player", index, "grave"/);
});

test("trap response choices preserve rapid double activation across rerenders", () => {
  assert.match(app, /function interactWithPendingTrapChoice\(index, \{ directActivate = false \} = \{\}\)/);
  assert.match(app, /directActivationTracker\.register\(`trap-response:\$\{index\}`\)/);
  assert.match(app, /onActivate: \(index\) => interactWithPendingTrapChoice\(index, \{ directActivate: true \}\)/);
});
