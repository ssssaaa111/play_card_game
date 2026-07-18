import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const renderer = readFileSync(fileURLToPath(new URL("../src/fusion-selection-renderer.js", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("fusion result options keep stats and recipes directly readable", () => {
  assert.match(renderer, /summary\.textContent = option\.subtitle/);
  assert.match(renderer, /button\.title = option\.subtitle/);
  assert.match(css, /\.fusion-result-option\s*\{[\s\S]*min-height: 68px;/);
  assert.match(css, /\.fusion-result-option span\s*\{[\s\S]*white-space: normal;[\s\S]*-webkit-line-clamp: 2;/);
});

test("completed fusion materials receive a dedicated ready state", () => {
  assert.match(renderer, /dataset\.materialState = view\.materialState/);
  assert.match(css, /\.fusion-preview\[data-material-state="complete"\]/);
  assert.match(css, /\.fusion-preview\[data-material-state="complete"\] \.fusion-preview-kicker/);
});
