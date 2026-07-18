import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = readFileSync(fileURLToPath(new URL("../src/app.js", import.meta.url)), "utf8");
const timelineRenderer = readFileSync(fileURLToPath(new URL("../src/timeline-renderer.js", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("current chain stack exposes artwork, owner, and structured resolution order", () => {
  assert.match(app, /heading\.className = "chain-stack-head"/);
  assert.match(app, /applyCardArt\(art, entry\.cardId\)/);
  assert.match(app, /row\.dataset\.owner = entry\.owner/);
  assert.match(app, /chain-resolution-step/);
  assert.match(css, /\.chain-stack-entry\s*\{[\s\S]*grid-template-columns: 38px 48px minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.chain-stack-art\s*\{[\s\S]*--card-art-hand-size/);
  assert.match(css, /\.chain-stack-entry\[data-owner="ai"\][\s\S]*239, 71, 111/);
});

test("chain history distinguishes activation and resolution order with compact art", () => {
  assert.match(timelineRenderer, /activationOrder\.textContent = `发动 \$\{history\.activationOrder\}`/);
  assert.match(timelineRenderer, /resolutionOrder\.textContent = `结算 \$\{history\.resolutionOrder\}`/);
  assert.match(timelineRenderer, /applyCardArt\(art, link\.cardId\)/);
  assert.match(css, /\.chain-history-link\s*\{[\s\S]*grid-template-columns: 38px minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.chain-history-art\s*\{[\s\S]*width: 38px;[\s\S]*height: 28px;/);
});
