import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("hand action states use distinct card-type accents", () => {
  assert.match(css, /\.hand \.card\.spell\.action-ready\s*\{[\s\S]*--hand-action-accent: 84, 210, 210;/);
  assert.match(css, /\.hand \.card\.trap\.action-ready\s*\{[\s\S]*--hand-action-accent: 183, 148, 244;/);
  assert.match(css, /\.hand \.card\.monster\.action-ready\s*\{[\s\S]*--hand-action-accent: 246, 189, 96;/);
});

test("selected hand cards override ready and blocked treatments", () => {
  assert.match(css, /\.hand \.card\.action-blocked\.selected:hover\s*\{[\s\S]*border-color: rgba\(246, 189, 96, 0\.98\);/);
  assert.match(css, /\.hand \.card\.selected \.action-tag,[\s\S]*color: #fff0b8;/);
  assert.match(css, /\.hand \.card\.action-blocked\.selected:hover[\s\S]*filter: none;/);
});

test("blocked hand cards dim artwork without hiding the failure reason", () => {
  assert.match(css, /\.hand \.card\.action-blocked \.art\s*\{[\s\S]*filter: saturate\(0\.5\) brightness\(0\.62\);/);
  assert.match(css, /\.hand \.card\.action-blocked \.action-reason\s*\{[\s\S]*color: rgba\(226, 232, 240, 0\.72\);/);
  assert.match(css, /\.hand \.card\.action-blocked\.selected \.art\s*\{[\s\S]*filter: none;/);
});
