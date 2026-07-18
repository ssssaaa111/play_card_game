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
  assert.doesNotMatch(renderer, /(?:^|\s)state\./m);
});

test("app delegates trap response DOM work to the response renderer", () => {
  const app = source("../src/app.js");
  const renderer = source("../src/trap-response-renderer.js");

  assert.match(app, /renderTrapResponsePanel\(\{/);
  assert.match(app, /clearTrapResponsePanel\(els\)/);
  assert.doesNotMatch(app, /className = "trap-choice-card"/);
  assert.doesNotMatch(app, /className = "chain-stack-entry"/);
  assert.match(renderer, /className = "trap-choice-card"/);
  assert.match(renderer, /className = "chain-stack-entry"/);
  assert.doesNotMatch(renderer, /(?:^|\s)state\./m);
});

test("app delegates fusion selection DOM work to the fusion renderer", () => {
  const app = source("../src/app.js");
  const renderer = source("../src/fusion-selection-renderer.js");

  assert.match(app, /renderFusionSelectionPanel\(\{/);
  assert.match(app, /buildFusionSelectionView\(\{/);
  assert.doesNotMatch(app, /className = "fusion-result-option"/);
  assert.match(renderer, /className = "fusion-result-option"/);
  assert.match(renderer, /option\.subtitle/);
  assert.doesNotMatch(renderer, /(?:^|\s)state\./m);
});

test("app delegates transient selection transitions to the selection state module", () => {
  const app = source("../src/app.js");
  const selectionState = source("../src/selection-state.js");

  assert.match(app, /\.\.\.createSelectionState\(\)/);
  assert.match(app, /beginPendingSelection\(\s*state,\s*"target"/);
  assert.match(app, /beginPendingSelection\(\s*state,\s*"tribute"/);
  assert.match(app, /beginPendingSelection\(\s*state,\s*"fusion"/);
  assert.match(app, /clearTransientSelection\(state\)/);
  assert.doesNotMatch(app, /state\.pending(?:Target|Tribute|Fusion) = null/);
  assert.match(selectionState, /const PENDING_FIELD_BY_KIND/);
  assert.match(selectionState, /conflicted: pendingKinds\.length > 1/);
});

test("app delegates target selection rules to the target selection module", () => {
  const app = source("../src/app.js");
  const targetSelection = source("../src/target-selection.js");

  assert.match(app, /pendingTargetForCard\(card, handIndex, spellEffects\)/);
  assert.match(app, /validateTargetSelection\(/);
  assert.match(app, /collectLegalTargetSelections\(pending/);
  assert.doesNotMatch(app, /function validateSpellTarget/);
  assert.doesNotMatch(app, /pending\.mode === "enemySpellTrap"/);
  assert.match(targetSelection, /pending\.mode === "enemySpellTrap"/);
  assert.match(targetSelection, /pending\.mode === "ownGraveMonster"/);
  assert.match(targetSelection, /validateSpellTargetRule\(pending, duelist, target\)/);
});

test("background music stays independent from rules and effect audio", () => {
  const app = source("../src/app.js");
  const audio = source("../src/audio.js");
  const music = source("../src/music.js");

  assert.match(app, /from '\.\/music\.js'/);
  assert.match(app, /createMusicController\(\{/);
  assert.match(app, /onVoiceActivity: setMusicVoiceActive/);
  assert.match(audio, /onVoiceActivity/);
  assert.doesNotMatch(music, /from '\.\/audio\.js'/);
  assert.doesNotMatch(music, /engine-adapter|game-engine|rules\.js/);
  assert.doesNotMatch(music, /\bstate\./);
  assert.doesNotMatch(app, /function scheduleTone\(/);
});
