import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

test("card detail data does not depend on the DOM card renderer", () => {
  const detail = source("../src/card-detail.js");

  assert.match(detail, /from '\.\/card-state-display\.js'/);
  assert.doesNotMatch(detail, /from '\.\/card-renderer\.js'/);
});

test("app delegates selected-card DOM work to the inspector renderer", () => {
  const app = source("../src/app.js");
  const renderer = source("../src/card-inspector-renderer.js");

  assert.match(app, /bindCardInspector\(document\)/);
  assert.match(app, /renderCardInspector\(document, cardInspectorElements, view\)/);
  assert.doesNotMatch(app, /createElement\("dt"\)/);
  assert.match(renderer, /createElement\("dt"\)/);
  assert.doesNotMatch(renderer, /from '\.\/card-detail\.js'/);
});

test("app delegates battle preview DOM work without leaking state into the renderer", () => {
  const app = source("../src/app.js");
  const renderer = source("../src/battle-preview-renderer.js");

  assert.match(app, /renderBattlePreviewElement\(document, els\.battlePreview, preview\)/);
  assert.doesNotMatch(app, /className = "battle-preview-title"/);
  assert.match(renderer, /className = "battle-preview-title"/);
  assert.doesNotMatch(renderer, /from '\.\/rules\.js'/);
  assert.doesNotMatch(renderer, /\bstate\./);
});
