import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("duel table shell keeps existing gameplay anchors inside a focused workspace", () => {
  const html = read("index.html");

  assert.match(html, /href="duel-table\.css\?v=20260805-fusion-occlusion"/);
  assert.match(html, /src="src\/app\.js\?v=20260803-action-readability"/);
  assert.match(html, /class="arena duel-table"/);
  assert.match(html, /id="detailDrawer"[\s\S]*id="detailName"/);
  assert.match(html, /id="timelineDrawer"[\s\S]*id="timeline"/);
  assert.match(html, /id="detailDrawerToggle"[\s\S]*aria-controls="detailDrawer"/);
  assert.match(html, /id="timelineDrawerToggle"[\s\S]*aria-controls="timelineDrawer"/);
  assert.match(html, /id="fieldActionBar"[\s\S]*id="fieldAttackBtn"[\s\S]*id="fieldModeBtn"[\s\S]*id="fieldDetailBtn"[\s\S]*id="fieldCancelBtn"/);
  assert.match(html, /class="hand-panel" aria-label="玩家手牌"/);
  assert.match(html, /src="src\/duel-table\.js\?v=20260802-passive-log-attention"/);
});

test("selected field monsters expose a unified contextual action dock", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(html, /class="field-action-bar"[\s\S]*id="fieldActionName"[\s\S]*id="fieldAttackLabel">攻击/);
  assert.match(html, /class="hand-command"[\s\S]*class="field-action-bar"/);
  assert.match(html, /class="field-action-btn field-mode-tab"[\s\S]*id="fieldModeLabel">转守备/);
  assert.match(css, /\.field-action-bar\s*\{[\s\S]*position: static;[\s\S]*grid-row: 2;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*body\[data-duel-selection="playerField"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 54px minmax\(0, 1fr\)/);
  assert.match(css, /\.field-mode-tab\.is-defense\s*\{[\s\S]*color: #ffe9a8/);
  assert.match(app, /fieldAttackBtn: document\.querySelector\("#fieldAttackBtn"\)/);
  assert.match(app, /fieldModeBtn: document\.querySelector\("#fieldModeBtn"\)/);
  assert.match(app, /els\.fieldAttackBtn\?\.addEventListener\("click", prepareSelectedMonsterAttack\)/);
  assert.match(app, /els\.fieldModeBtn\?\.addEventListener\("click", toggleSelectedMode\)/);
  assert.match(app, /els\.fieldDetailBtn\?\.addEventListener\("click", openSelectedMonsterDetail\)/);
  assert.match(app, /els\.fieldCancelBtn\?\.addEventListener\("click", cancelSelectedMonsterAction\)/);
});

test("field selection exposes persistent target feedback and blank-area cancellation", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const app = read("src/app.js");
  const renderer = read("src/field-renderer.js");

  assert.match(html, /class="field" id="duelField"/);
  assert.match(app, /const selectionHint = currentMonsterSelectionHint\(\)/);
  assert.match(app, /duelHintView\([\s\S]*selectionHint,/);
  assert.match(app, /document\.body\.dataset\.duelTargeting/);
  assert.match(app, /els\.duelField\?\.addEventListener\("click", handleDuelFieldBackgroundClick\)/);
  assert.match(css, /body\[data-duel-selection="playerField"\][\s\S]*#duelHint/);
  assert.match(css, /\.field-selection-chip\s*\{/);
  assert.match(css, /body\[data-duel-targeting="attack"\][\s\S]*\.slot:has\(\.card\):not\(\.attack-target\)/);
  assert.match(renderer, /selectionChip\.textContent = "当前操作"/);
});

test("low-frequency media and session controls live behind one utility menu", () => {
  const html = read("index.html");

  assert.match(html, /id="utilityMenuToggle"[\s\S]*aria-controls="utilityMenu"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="guideBtn"[\s\S]*id="pauseBtn"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="soundBtn"[\s\S]*id="musicBtn"[\s\S]*id="voiceBtn"/);
  assert.match(html, /class="actions" aria-label="回合操作"[\s\S]*id="skipAttackBtn"[\s\S]*id="endTurnBtn"/);
});

test("desktop duel table promotes the field and overlays compact HUD rails", () => {
  const css = read("duel-table.css");

  assert.match(css, /#app \.arena\.duel-table\s*\{[\s\S]*position: relative;[\s\S]*overflow: hidden;/);
  assert.match(css, /#app \.duel-table \.field\s*\{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*calc\(var\(--table-hud-width\) \+ 18px\)/);
  assert.match(css, /#app \.duel-table \.side\.duel-hud\s*\{[\s\S]*position: absolute;[\s\S]*width: var\(--table-hud-width\);/);
  assert.match(css, /\.workspace-drawer\s*\{[\s\S]*position: absolute;[\s\S]*visibility: hidden;/);
  assert.match(css, /\.workspace-drawer\.is-open\s*\{[\s\S]*visibility: visible;[\s\S]*pointer-events: auto;/);
});

test("compact workspaces keep field and hand in fixed viewport rows", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#app\s*\{[\s\S]*height: 100dvh;[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) clamp\(226px, 34dvh, 278px\);[\s\S]*overflow: hidden;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#app\s*\{[\s\S]*--mobile-hand-height: clamp\(242px, 36dvh, 296px\);[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) var\(--mobile-hand-height\);/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-drawer\s*\{[\s\S]*transform: translateY/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 1040px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) clamp\(226px, 31vw, 300px\);/);
});

test("compact utility controls and effects yield the battlefield to gameplay", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.attack-closeup,[\s\S]*\.attack-cutin,[\s\S]*\.ace-strike\s*\{[\s\S]*display: none;/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.slot\.tribute-candidate::after\s*\{[\s\S]*content: "可解放";/);
  assert.match(css, /\.slot\.empty\.tribute-unavailable::after,[\s\S]*\.slot\.empty\.effect-target-unavailable::after,[\s\S]*content: none;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-tabs\s*\{[\s\S]*position: fixed;[\s\S]*var\(--mobile-hand-height\) - 44px/);
  assert.match(css, /body:not\(\[data-duel-selection="none"\]\) \.workspace-tabs\s*\{[\s\S]*visibility: hidden;[\s\S]*pointer-events: none;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.hand-panel\s*\{[\s\S]*grid-template-rows: 44px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 1040px\)[\s\S]*\.workspace-tabs\s*\{[\s\S]*top: calc\(max\(8px, var\(--safe-area-top\)\) \+ 62px\);[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("portrait phones place monster actions in the hand title row instead of over the field", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*--mobile-hand-height: clamp\(242px, 36dvh, 296px\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.field-action-bar\s*\{[\s\S]*position: fixed;[\s\S]*var\(--mobile-hand-height\) - 44px/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 44px minmax\(0, 1fr\)/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-title\s*\{[\s\S]*visibility: hidden/);
  assert.doesNotMatch(css, /@media \(max-width: 360px\)[\s\S]*\.field-action-bar[\s\S]*bottom: 57px/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*body\[data-duel-selection="playerField"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 86px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.field-action-bar\s*\{[\s\S]*position: fixed;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("phone confirmations occupy the hand command row without covering the battlefield", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*body\[data-duel-selection="hand"\] \.hand-panel,[\s\S]*body\[data-duel-selection="target"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 96px minmax\(0, 1fr\)/);
  assert.match(css, /body\[data-duel-selection="hand"\] \.hand-title,[\s\S]*body\[data-duel-selection="target"\] \.hand-title\s*\{[\s\S]*visibility: hidden/);
  assert.match(css, /\.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\)\s*\{[\s\S]*position: fixed;[\s\S]*var\(--mobile-hand-height\) - 96px/);
  assert.match(css, /\.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\) #choiceText\s*\{[\s\S]*grid-column: 1 \/ -1/);
  assert.match(css, /\.choice-actions\.fusion-choice,[\s\S]*\.choice-actions\.material-choice,[\s\S]*\.choice-actions\.split-choice\s*\{[\s\S]*top: 12px;[\s\S]*max-height: calc\(48vh - 12px\);[\s\S]*overflow-y: auto/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*body\[data-duel-selection="hand"\] \.hand-panel,[\s\S]*body\[data-duel-selection="target"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 104px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\)\s*\{[\s\S]*top: calc\(max\(8px, var\(--safe-area-top\)\) \+ 62px\);[\s\S]*width: calc\(clamp\(226px, 31vw, 300px\) - 16px\);[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("fusion chooser stays clear of selectable materials at every breakpoint", () => {
  const css = read("duel-table.css");
  const smoke = read("src/browser-smoke.js");

  assert.match(css, /\.hand-command > \.choice-actions\.fusion-choice,[\s\S]*\.choice-actions\.material-choice,[\s\S]*\.choice-actions\.split-choice\s*\{[\s\S]*align-content: start;[\s\S]*max-height: 100%;[\s\S]*overflow-y: auto;/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.hand-command > \.choice-actions\.fusion-choice,[\s\S]*\.choice-actions\.material-choice,[\s\S]*\.choice-actions\.split-choice\s*\{[\s\S]*top: calc\(var\(--safe-area-top\) \+ 12px\);[\s\S]*max-height: calc\(100dvh - clamp\(226px, 34dvh, 278px\) - 40px\);[\s\S]*overflow-y: auto;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 1040px\)[\s\S]*\.hand-command > \.choice-actions\.fusion-choice,[\s\S]*\.choice-actions\.material-choice,[\s\S]*\.choice-actions\.split-choice\s*\{[\s\S]*top: calc\(max\(8px, var\(--safe-area-top\)\) \+ 62px\);[\s\S]*max-height: calc\(100dvh - max\(8px, var\(--safe-area-top\)\) - 62px - clamp\(120px, 30dvh, 180px\)\);[\s\S]*overflow-y: auto;/);
  assert.match(smoke, /fusion-occlusion: panel covers materials/);
  assert.match(smoke, /"fusion-occlusion-desktop": runFusionOcclusionSmoke/);
  assert.match(smoke, /"fusion-occlusion-tablet": runFusionOcclusionSmoke/);
  assert.match(smoke, /"fusion-occlusion-landscape": runFusionOcclusionSmoke/);
  assert.match(smoke, /"fusion-occlusion-mobile": runFusionOcclusionSmoke/);
});

test("phone hand choices keep the selected card content in view", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*body\[data-duel-selection="hand"\] \.hand \.card,[\s\S]*body\[data-duel-selection="target"\] \.hand \.card\s*\{[\s\S]*grid-template-rows: auto minmax\(25px, 1fr\) 28px 20px 18px;[\s\S]*gap: 3px;[\s\S]*padding: 6px;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*body\[data-duel-selection="hand"\] \.hand \.card \.art,[\s\S]*body\[data-duel-selection="target"\] \.hand \.card \.art\s*\{[\s\S]*min-height: 25px;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*body\[data-duel-selection="hand"\] \.hand \.card \.action-reason,[\s\S]*body\[data-duel-selection="target"\] \.hand \.card \.action-reason\s*\{[\s\S]*height: 18px;[\s\S]*min-height: 18px;/);
});

test("short landscape hand choices keep card content inside the command column", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.hand \.card\s*\{[\s\S]*flex: 0 0 150px;[\s\S]*grid-template-rows: auto minmax\(25px, 1fr\) 28px 20px 18px;[\s\S]*gap: 3px;[\s\S]*padding: 6px;/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.hand \.card\.compact-action-state\s*\{[\s\S]*grid-template-rows: auto minmax\(43px, 1fr\) 28px 20px;/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.hand \.card \.art\s*\{[\s\S]*min-height: 25px;/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*\.hand \.card \.action-reason\s*\{[\s\S]*height: 18px;[\s\S]*min-height: 18px;/);
});

test("compact target feedback avoids duplicate prompts and card-covering labels", () => {
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(app, /const display = currentTargetSelectionDisplay\(pendingTarget\);\s*speak\(display\.text\);/);
  assert.doesNotMatch(app, /cue\(currentTargetSelectionDisplay\(\)\.text\)/);
  assert.match(css, /body\[data-duel-selection="target"\] \.toast\s*\{[\s\S]*max-height: calc\(2\.6em \+ 14px\);[\s\S]*overflow: hidden/);
  assert.match(css, /\.trap-slot\.target-selected::after\s*\{[\s\S]*top: 50%;[\s\S]*transform: translate\(-50%, -50%\)/);
  assert.match(css, /\.slot\.effect-target-unavailable:not\(\.empty\)::after,[\s\S]*content: "不可"/);
  assert.match(css, /\.slot\.targetable::after,[\s\S]*content: "可选"/);
  assert.match(css, /\.slot\.target-selected::after,[\s\S]*content: "已选"/);
  assert.match(css, /\.slot\.empty\.effect-target-unavailable::after,[\s\S]*content: none/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*body\[data-duel-selection="target"\] \.toast\s*\{[\s\S]*left: calc\(\(100vw - clamp\(226px, 31vw, 300px\)\) \/ 2\)/);
});

test("workspace controller synchronizes drawers, timeline badges, and settings", () => {
  const controller = read("src/duel-table.js");

  assert.match(controller, /export function createDuelTableController/);
  assert.match(controller, /function setDrawer\(name, open\)/);
  assert.match(controller, /drawer\.root\?\.classList\.toggle\("is-open", active\)/);
  assert.match(controller, /timelineBadge\.textContent = timelineCount\.textContent/);
  assert.match(controller, /detailToggle\.classList\.add\("has-update"\)/);
  assert.match(controller, /timelineToggle\?\.classList\.add\("has-update"\)/);
  assert.doesNotMatch(controller, /setDrawer\("detail", true\)/);
  assert.match(controller, /compactWorkspace\.addEventListener\("change"/);
});

test("combat attention system exposes phase progress and hand readiness", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");
  const app = read("src/app.js");

  assert.match(html, /id="phaseRail"[\s\S]*data-phase-step="draw"[\s\S]*data-phase-step="main"[\s\S]*data-phase-step="battle"/);
  assert.match(html, /id="handGuide"[\s\S]*id="handReadyCount"[\s\S]*id="handReadyLabel"/);
  assert.match(css, /\.phase-step\.is-current[\s\S]*\.hand-panel:not\(\[data-ready-count="0"\]\)/);
  assert.match(css, /body\[data-duel-action-window="targetSelect"\][\s\S]*#duelHint/);
  assert.match(controller, /function syncCombatAttention\(\)/);
  assert.match(controller, /querySelectorAll\("\.card\.action-ready:not\(\.action-blocked\)"\)/);
  assert.match(controller, /handPanel\.dataset\.attention = selection/);
  assert.match(app, /document\.body\.dataset\.duelPhase/);
  assert.match(app, /document\.body\.dataset\.duelSelection/);
  assert.match(app, /document\.body\.dataset\.duelCanAct/);
});

test("pre-duel setup uses a responsive loadout and tactical intelligence cockpit", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(html, /class="modal-header"[\s\S]*id="setupReadySummary"[\s\S]*id="setupReadyMode"/);
  assert.match(html, /class="setup-cockpit"[\s\S]*class="setup-loadout"[\s\S]*class="setup-intel"/);
  assert.match(html, /data-setup-kind="role"[\s\S]*data-setup-kind="deck"[\s\S]*data-setup-kind="ai"[\s\S]*data-setup-kind="scenario"/);
  assert.match(css, /\.modal\.setup-modal \.modal-box\s*\{[\s\S]*width: min\(1040px, 100%\)/);
  assert.match(css, /\.setup-cockpit\s*\{[\s\S]*grid-template-columns: minmax\(330px, 0\.88fr\) minmax\(0, 1\.12fr\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.setup-modal \.setup-grid,[\s\S]*\.setup-modal \.pre-duel-summary\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(controller, /function syncSetupSummary\(\)/);
  assert.match(controller, /setupReadySummary\.textContent = `\$\{role\} · \$\{deck\}`/);
  assert.match(controller, /select\.addEventListener\("change", setupChangeHandler\)/);
});

test("desktop hand actions use a tactical command dock without covering the field", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(html, /class="hand-command"[\s\S]*id="handCommandTitle"[\s\S]*id="choiceActions"/);
  assert.match(html, /class="hand-command-flow"[\s\S]*01[\s\S]*02[\s\S]*03/);
  assert.match(css, /\.hand-panel\s*\{[\s\S]*grid-template-columns: 102px minmax\(0, 1fr\) clamp\(276px, 25vw, 332px\)/);
  assert.match(css, /\.hand-command > \.choice-actions\s*\{[\s\S]*position: static;[\s\S]*transform: none/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.hand-command\s*\{[\s\S]*display: contents;[\s\S]*\.hand-command > \.choice-actions\s*\{[\s\S]*position: fixed/);
  assert.match(controller, /handCommand\.dataset\.active = String\(commandActive\)/);
  assert.match(controller, /handCommand\.dataset\.step = locating/);
  assert.match(controller, /attentionObserver\.observe\(choiceActions/);
});

test("battlefield objectives and action hints use a readable presentation", () => {
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(app, /const duelHint = duelHintView\(/);
  assert.match(app, /els\.duelHint\.dataset\.kind = duelHint\.kind/);
  assert.match(css, /#duelHint\[data-kind="objective"\][\s\S]*max-width: min\(760px, calc\(100vw - 48px\)\)/);
  assert.match(css, /#duelHint\[data-kind="action"\][\s\S]*max-width: min\(760px, calc\(100vw - 48px\)\)/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#duelHint\[data-kind="objective"\][\s\S]*-webkit-line-clamp: 2/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#duelHint\[data-kind="action"\][\s\S]*-webkit-line-clamp: 2/);
});

test("desktop shell compacts passive chrome until a command needs attention", () => {
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.topbar\s*\{[\s\S]*grid-template-columns: minmax\(190px, 240px\) minmax\(320px, 1fr\) auto auto;/);
  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.phase\s*\{[\s\S]*grid-template-areas:[\s\S]*"phase turn timer"[\s\S]*"rail rail rail"/);
  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.hand-panel\[data-command-active="false"\]\s*\{[\s\S]*grid-template-columns: 90px minmax\(0, 1fr\) 112px;/);
  assert.match(css, /\.hand-command\[data-active="false"\] \.hand-command-idle > span,[\s\S]*\.hand-command\[data-active="false"\] \.hand-command-flow\s*\{[\s\S]*display: none;/);
  assert.match(controller, /handPanel\.dataset\.commandActive = String\(commandActive\)/);
});

test("desktop field actions expand the tactical command dock", () => {
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.hand-command\[data-active="true"\] \.field-action-bar\s*\{[\s\S]*grid-template-rows: minmax\(26px, auto\) repeat\(2, minmax\(38px, 1fr\)\);[\s\S]*gap: 4px;/);
  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.hand-command\[data-active="true"\] \.field-action-context small\s*\{[\s\S]*display: none;/);
  assert.match(css, /@media \(min-width: 1041px\)[\s\S]*\.hand-command\[data-active="true"\] \.field-action-btn\s*\{[\s\S]*min-height: 38px;/);
  assert.match(controller, /const fieldActionBar = documentRef\.querySelector\("#fieldActionBar"\)/);
  assert.match(controller, /const fieldActionActive = Boolean\(fieldActionBar && !fieldActionBar\.hidden\)/);
  assert.match(controller, /const commandActive = choiceActive \|\| fieldActionActive/);
  assert.match(controller, /const attentionObserver = new MutationObserver\(syncCombatAttention\)/);
  assert.match(controller, /attentionObserver\.observe\(fieldActionBar,[\s\S]*attributeFilter: \["class", "hidden"\]/);
});

test("battle chronicle uses full-height summaries filters and structured event nodes", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");
  const renderer = read("src/timeline-renderer.js");

  assert.match(html, /BATTLE CHRONICLE[\s\S]*id="timelineLatestStep"[\s\S]*id="timelineLatestKind"[\s\S]*id="timelineActionCount"/);
  assert.match(html, /data-timeline-filter="all"[\s\S]*data-timeline-filter="battle"[\s\S]*data-timeline-filter="cards"[\s\S]*data-timeline-filter="system"/);
  assert.match(css, /\.timeline-drawer\s*\{[\s\S]*width: min\(390px,[\s\S]*max-height: none;[\s\S]*grid-template-rows:/);
  assert.match(css, /\.timeline-drawer \.chain-history-list\s*\{[\s\S]*position: static;/);
  assert.match(css, /\.timeline-node::after\s*\{[\s\S]*linear-gradient/);
  assert.match(controller, /function setTimelineFilter\(filter = "all"\)/);
  assert.match(controller, /timelineDrawer\.dataset\.timelineView = nextFilter/);
  assert.match(controller, /function syncChainHistoryAttention\(\)[\s\S]*timelineToggle\?\.classList\.add\("has-update"\)/);
  assert.doesNotMatch(controller, /syncChainHistoryAttention\(\)[\s\S]{0,300}setDrawer\("timeline", true\)/);
  assert.match(controller, /chainHistoryObserver\.observe\(chainHistoryToggle/);
  assert.match(renderer, /item\.dataset\.timelineGroup = timelineKindGroup\(entry\.kind\)/);
  assert.match(renderer, /kind\.textContent = timelineKindLabel\(entry\.kind\)/);
});
