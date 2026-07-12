import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("set player traps use a restrained armed treatment", () => {
  assert.match(css, /\.trap-slot \.card\.player-trap\s*\{[\s\S]*border-color: rgba\(183, 148, 244, 0\.46\);/);
  assert.match(css, /\.trap-slot \.card\.player-trap\s*\{[\s\S]*max-height: 86px;[\s\S]*aspect-ratio: auto;/);
  assert.match(css, /\.trap-slot:has\(\.card\.player-trap\)\s*\{[\s\S]*radial-gradient/);
  assert.match(css, /\.trap-slot \.card\.player-trap \.art\s*\{[\s\S]*brightness\(0\.78\);/);
  assert.match(css, /body\[data-duel-turn="player"\] #playerTraps \.trap-slot:has\(\.card\.player-trap\)\s*\{[\s\S]*0\.44/);
});

test("trap response and selected states progressively increase emphasis", () => {
  assert.match(css, /\.trap-slot\.trap-response \.card\.player-trap\s*\{[\s\S]*border-color: rgba\(183, 148, 244, 0\.98\);/);
  assert.match(css, /\.trap-slot\.trap-response \.card\.player-trap \.art\s*\{[\s\S]*brightness\(1\.04\);/);
  assert.match(css, /\.trap-slot\.trap-response-selected \.card\.player-trap\s*\{[\s\S]*border-color: rgba\(246, 189, 96, 0\.98\);/);
});
