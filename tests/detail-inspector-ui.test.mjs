import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../src/app.js", import.meta.url)), "utf8");
const renderer = readFileSync(fileURLToPath(new URL("../src/card-inspector-renderer.js", import.meta.url)), "utf8");
const modalRenderer = readFileSync(fileURLToPath(new URL("../src/duel-modal-renderer.js", import.meta.url)), "utf8");
const handRenderer = readFileSync(fileURLToPath(new URL("../src/hand-renderer.js", import.meta.url)), "utf8");

test("selected-card details expose summary, complete effect, and metadata regions", () => {
  assert.match(html, /id="detailInspector" hidden/);
  assert.match(html, /id="detailSummary"/);
  assert.match(html, /id="detailEffect"/);
  assert.match(html, /id="detailMeta"/);
  assert.match(app, /cardInspectorViewModel\(card, \{ effectMarkers: focusedCardEffectMarkers\(card\) \}\)/);
  assert.match(app, /function focusedCardEffectMarkers\(card\)/);
  assert.match(app, /renderCardInspector\(document, cardInspectorElements, view\)/);
});

test("detail inspector uses card-type accents and bounded complete text", () => {
  assert.match(css, /\.detail-card\[data-card-type="spell"\][\s\S]*--detail-accent: 84, 210, 210;/);
  assert.match(css, /\.detail-card\[data-card-type="trap"\][\s\S]*--detail-accent: 183, 148, 244;/);
  assert.match(css, /\.detail-card \.detail-effect\s*\{[\s\S]*max-height: 76px;[\s\S]*overflow-y: auto;/);
  assert.match(css, /\.detail-meta-row\s*\{[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\);/);
  assert.match(renderer, /classList\.toggle\("scrollable", Boolean\(row\.scrollable\)\)/);
  assert.match(renderer, /value\.tabIndex = 0;[\s\S]*value\.setAttribute\("aria-label"/);
  assert.match(css, /\.detail-meta-row\.scrollable dd\s*\{[\s\S]*max-height: 76px;[\s\S]*overflow-y: auto;/);
});

test("short desktop and mobile layouts preserve readable detail boundaries", () => {
  assert.match(css, /@media \(min-width: 1041px\) and \(max-height: 980px\)[\s\S]*\.detail-card \.detail-effect\s*\{[\s\S]*max-height: 50px;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.detail-card \.detail-effect\s*\{[\s\S]*max-height: 124px;/);
  assert.doesNotMatch(css, /\.detail-card:has\(\.battle-preview:not\(\.empty\)\) > \.detail-inspector\s*\{\s*display: none;/);
  assert.match(css, /\.detail-card:has\(\.battle-preview:not\(\.empty\)\) \.detail-summary\s*\{[\s\S]*-webkit-line-clamp: 1;/);
  assert.match(css, /\.detail-card:has\(\.battle-preview:not\(\.empty\)\) \.detail-effect-block,[\s\S]*\.detail-meta\s*\{\s*display: none;/);
  assert.match(css, /\.detail-card:has\(\.battle-preview:not\(\.empty\)\) \.detail-meta:has\(\.detail-meta-row\.scrollable\)\s*\{\s*display: grid;/);
  assert.match(css, /\.detail-meta:has\(\.detail-meta-row\.scrollable\) \.detail-meta-row:not\(\.scrollable\)\s*\{\s*display: none;/);
});

test("full detail modal and hand entry use the unified inspector projection", () => {
  assert.match(html, /id="zoomSummary"/);
  assert.match(html, /id="zoomEffect"/);
  assert.match(html, /id="zoomMeta"/);
  assert.match(app, /cardInspectorViewModel\(cardOrId, \{ effectMarkers: focusedCardEffectMarkers/);
  assert.match(modalRenderer, /for \(const row of rows/);
  assert.match(handRenderer, /className = "card-detail-entry"/);
  assert.match(handRenderer, /onCardDetail\(card\)/);
  assert.match(app, /onCardDetail: openCardDetail/);
});
