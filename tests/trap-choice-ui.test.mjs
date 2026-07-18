import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const trapResponseRenderer = readFileSync(fileURLToPath(new URL("../src/trap-response-renderer.js", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("trap response choices render unique artwork and explicit state", () => {
  assert.match(trapResponseRenderer, /applyCardArt\(art, card\.id\)/);
  assert.match(trapResponseRenderer, /button\.dataset\.choiceState = choice\.state/);
  assert.match(trapResponseRenderer, /button\.setAttribute\("aria-pressed", String\(choice\.state === "selected"\)\)/);
  assert.match(css, /\.trap-choice-art\s*\{[\s\S]*--card-art-hand-size/);
  assert.match(css, /\.trap-choice-state\.selected\s*\{[\s\S]*color: var\(--gold\)/);
});

test("trap response choices keep stable compact dimensions on mobile", () => {
  assert.match(css, /\.trap-choice-card\s*\{[\s\S]*grid-template-columns: 76px minmax\(0, 1fr\);[\s\S]*min-height: 68px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.trap-choice-art\s*\{[\s\S]*width: 64px;[\s\S]*height: 48px;/);
});
