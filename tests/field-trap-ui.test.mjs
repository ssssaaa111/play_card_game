import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("set player traps use a restrained armed treatment", () => {
  assert.match(css, /\.trap-slot \.card\.field-support-card\s*\{[\s\S]*max-height: 100%;[\s\S]*min-height: 0;[\s\S]*aspect-ratio: auto;/);
  assert.match(css, /\.trap-slot:has\(\.card\.field-support-card\)\s*\{[\s\S]*radial-gradient/);
  assert.match(css, /\.trap-slot \.card\.player-trap \.art\s*\{[\s\S]*brightness\(0\.78\);/);
  assert.match(css, /body\[data-duel-turn="player"\] #playerTraps \.trap-slot:has\(\.card\.field-support-card\)\s*\{[\s\S]*0\.44/);
});

test("trap response and selected states progressively increase emphasis", () => {
  assert.match(css, /\.trap-slot\.trap-response \.card\.field-support-card\s*\{[\s\S]*border-color: rgba\(183, 148, 244, 0\.98\);/);
  assert.match(css, /\.trap-slot\.trap-response \.card\.field-support-card \.art\s*\{[\s\S]*brightness\(1\.04\);/);
  assert.match(css, /\.trap-slot\.trap-response-selected \.card\.field-support-card\s*\{[\s\S]*border-color: rgba\(246, 189, 96, 0\.98\);/);
});

test("field support cards expose compact spell and trap state chips", () => {
  assert.match(css, /\.trap-slot \.card\.player-spell\s*\{[\s\S]*#172c32/);
  assert.match(css, /\.support-state-chip\s*\{[\s\S]*height: 17px;[\s\S]*letter-spacing: 0;/);
  assert.match(css, /\.support-state-chip\.active\s*\{[\s\S]*#baf7f1/);
});
