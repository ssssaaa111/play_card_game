import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("duel table shell keeps existing gameplay anchors inside a focused workspace", () => {
  const html = read("index.html");

  assert.match(html, /href="styles\.css\?v=20260828-interaction-ux"/);
  assert.match(html, /href="duel-table\.css\?v=20260828-interaction-ux"/);
  assert.match(html, /src="src\/app\.js\?v=20260828-interaction-ux"/);
  assert.match(html, /class="arena duel-table"/);
  assert.match(html, /id="detailDrawer"[\s\S]*id="detailName"/);
  assert.match(html, /id="timelineDrawer"[\s\S]*id="timeline"/);
  assert.match(html, /id="detailDrawerToggle"[\s\S]*aria-controls="detailDrawer"/);
  assert.match(html, /id="timelineDrawerToggle"[\s\S]*aria-controls="timelineDrawer"/);
  assert.match(html, /id="fieldActionBar"[\s\S]*id="fieldAttackBtn"[\s\S]*id="fieldModeBtn"[\s\S]*id="fieldDetailBtn"[\s\S]*id="fieldCancelBtn"/);
  assert.match(html, /class="detail-actions"[\s\S]*id="detailAttackBtn"[\s\S]*id="modeBtn"[\s\S]*id="detailBtn"[\s\S]*id="detailSelectionCancelBtn"/);
  assert.match(html, /class="hand-panel" aria-label="玩家手牌"/);
  assert.match(html, /src="src\/duel-table\.js\?v=20260828-interaction-ux"/);
});

test("campaign chapters expose a live mission rail without stealing field clicks", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(html, /id="campaignMission"[\s\S]*id="campaignMissionProgress"[\s\S]*id="campaignMissionList"[\s\S]*id="campaignMissionHint"/);
  assert.match(app, /function currentCampaignMission\(\)/);
  assert.match(app, /syncCampaignObjectiveFeedback\(campaignMission\)/);
  assert.match(app, /nextChapterState[\s\S]*unlocked: Boolean\(nextChapterState\?\.startable\)/);
  assert.match(css, /#app \.duel-table \.campaign-mission\s*\{[\s\S]*pointer-events: none;/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.campaign-mission-item\.focused\s*\{[\s\S]*display: grid;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.campaign-mission-list\s*\{[\s\S]*display: none;/);
  assert.match(css, /\.campaign-mission-next\s*\{[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(css, /\.campaign-boss-phase\s*\{[\s\S]*data-boss-phase/);
  assert.match(app, /function startCampaignReward\(campaignId, rewardId\)/);
  assert.match(css, /\.hand-command > \.choice-actions\.target-choice\s*\{[\s\S]*top: calc\(max\(8px, var\(--safe-area-top\)\) \+ 116px\);/);
});

test("new duels clear the previous result before opening an action window", () => {
  const app = read("src/app.js");
  const startGame = app.slice(app.indexOf("function startGame()"), app.indexOf("function prepareGame()"));
  const prepareGame = app.slice(app.indexOf("function prepareGame()"), app.indexOf("function drawCard("));

  assert.match(app, /function resetDuelResultState\(\)\s*\{[\s\S]*state\.gameOver = false;[\s\S]*state\.statsRecorded = false;[\s\S]*state\.gameEvents = \[\];/);
  assert.ok(startGame.indexOf("resetDuelResultState();") < startGame.indexOf('setActionWindow("draw")'));
  assert.ok(prepareGame.indexOf("resetDuelResultState();") < prepareGame.indexOf('setActionWindow("setup")'));
});

test("selected field monsters expose a unified contextual action dock", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(html, /class="field-action-bar"[\s\S]*id="fieldActionName"[\s\S]*id="fieldBattlePreview"[\s\S]*id="fieldAttackLabel">攻击/);
  assert.match(html, /class="hand-command"[\s\S]*class="field-action-bar"/);
  assert.match(html, /class="field-action-btn field-mode-tab"[\s\S]*id="fieldModeLabel">转守备/);
  assert.match(css, /\.field-action-bar\s*\{[\s\S]*position: static;[\s\S]*grid-row: 2;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*body\[data-duel-selection="playerField"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 54px minmax\(0, 1fr\)/);
  assert.match(css, /\.field-mode-tab\.is-defense\s*\{[\s\S]*color: #ffe9a8/);
  assert.match(css, /\.field-battle-preview\s*\{[\s\S]*grid-column: 1 \/ -1;[\s\S]*max-height: 64px/);
  assert.match(css, /\.field-action-context:has\(\+ \.field-battle-preview:not\(\.empty\)\)\s*\{[\s\S]*display: none/);
  assert.match(css, /\.field-battle-preview\[data-preview-mode="intent"\][\s\S]*grid-template-columns: max-content minmax\(0, 1fr\)/);
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
  assert.match(css, /\.field-state-chip\s*\{/);
  assert.match(css, /\.field-state-chip\.selected\s*\{[\s\S]*rgba\(246, 189, 96/);
  assert.match(css, /body\[data-duel-targeting="attack"\][\s\S]*\.slot:has\(\.card\):not\(\.attack-target\)/);
  assert.match(renderer, /stateChip\.textContent = view\.fieldStateLabel/);
});

test("settings stay compact on small screens and become direct controls when space allows", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(html, /id="utilityMenuToggle"[\s\S]*aria-controls="utilityMenu"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="guideBtn"[\s\S]*id="pauseBtn"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="soundBtn"[\s\S]*id="musicBtn"[\s\S]*id="voiceBtn"/);
  assert.match(html, /class="actions" aria-label="回合操作"[\s\S]*id="skipAttackBtn"[\s\S]*id="endTurnBtn"/);
  assert.match(css, /@media \(min-width: 1440px\) and \(min-height: 680px\)[\s\S]*\.utility-toggle\s*\{[\s\S]*display: none;[\s\S]*\.utility-menu:not\(\[hidden\]\)\s*\{[\s\S]*display: flex;/);
  assert.match(controller, /const SPACIOUS_SETTINGS_QUERY = "\(min-width: 1440px\) and \(min-height: 680px\)"/);
  assert.match(controller, /const expanded = spaciousSettings\.matches \|\| Boolean\(open\)/);
});

test("spacious screens keep context in side rails while scaled 4K uses edge gutters", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");
  const renderer = read("src/control-renderer.js");

  assert.match(html, /id="workspaceDeck"[\s\S]*id="detailDrawer"[\s\S]*id="timelineDrawer"/);
  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*--workspace-height/);
  assert.match(css, /@media \(min-width: 1600px\) and \(max-width: 2399px\) and \(min-height: 900px\)[\s\S]*--workspace-track: 34px;[\s\S]*--detail-rail-width: clamp\(220px, 12vw, 250px\);[\s\S]*--timeline-rail-width: clamp\(260px, 15vw, 300px\);/);
  assert.match(css, /@media \(min-width: 1600px\) and \(max-width: 2399px\) and \(min-height: 900px\)[\s\S]*\.workspace-deck\s*\{[\s\S]*display: contents;[\s\S]*\.detail-drawer\.is-docked\s*\{[\s\S]*left: calc\(var\(--table-hud-width\) \+ 24px\);[\s\S]*\.timeline-drawer\.is-docked\s*\{[\s\S]*inset: 10px 10px 10px auto;/);
  assert.match(css, /\.workspace-deck \.workspace-drawer\.is-docked[\s\S]*visibility: visible;[\s\S]*pointer-events: auto;/);
  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*\.detail-drawer \.detail-actions\s*\{[\s\S]*display: none;[\s\S]*\.detail-drawer #battlePreview\s*\{[\s\S]*grid-row: 3;/);
  assert.match(renderer, /elements\.detailAttackBtn\.hidden = view\.fieldAction\.hidden/);
  assert.match(css, /@media \(min-width: 2200px\) and \(min-height: 1200px\)[\s\S]*width: min\(calc\(100% - 48px\), 3200px\)/);
  assert.match(css, /@media \(min-width: 2200px\) and \(min-height: 1200px\)[\s\S]*\.field-state-chip\s*\{[\s\S]*font-size: 11px/);
  assert.match(css, /\.utility-menu \.btn,[\s\S]*flex: 0 0 76px;[\s\S]*width: 76px;[\s\S]*min-height: 38px;/);
  assert.match(controller, /const SPACIOUS_WORKSPACE_QUERY = "\(min-width: 1600px\) and \(min-height: 900px\)"/);
  assert.match(controller, /const GUTTER_WORKSPACE_QUERY = "\(min-width: 2400px\) and \(min-height: 1200px\)"/);
  assert.match(controller, /function syncResponsiveWorkspace\(\)[\s\S]*const gutter = spacious && gutterWorkspace\.matches;[\s\S]*body\.dataset\.workspaceLayout = gutter \? "gutter" : spacious \? "expanded" : "drawer"/);
  assert.match(controller, /drawer\.root\?\.classList\.toggle\("is-docked", spacious\)/);
  assert.match(css, /@media \(min-width: 2400px\) and \(min-height: 1200px\)[\s\S]*--workspace-track: 38px;[\s\S]*width: min\(calc\(100% - 640px\), 3200px\);[\s\S]*\.workspace-deck\s*\{[\s\S]*display: contents;/);
  assert.match(css, /@media \(min-width: 2400px\) and \(min-height: 1200px\)[\s\S]*top: calc\(\(100dvh - clamp\(280px, 16dvh, 340px\) \+ 78px\) \/ 2\);[\s\S]*\.workspace-deck \.detail-drawer\.is-docked\s*\{[\s\S]*right: min\(calc\(100% - 320px\), calc\(\(100% \+ 3200px\) \/ 2\)\);[\s\S]*\.workspace-deck \.timeline-drawer\.is-docked\s*\{[\s\S]*left: min\(calc\(100% - 320px\), calc\(\(100% \+ 3200px\) \/ 2\)\);/);
});

test("spacious card density keeps field hand and support scales related", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*--workspace-height: clamp\(160px, 18dvh, 240px\);[\s\S]*clamp\(224px, 22dvh, 260px\)/);
  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*--support-track-size: clamp\(48px, 5dvh, 56px\);[\s\S]*\.hand \.card\s*\{[\s\S]*clamp\(154px, 9\.5vw, 170px\)/);
  assert.match(css, /@media \(min-width: 2200px\) and \(min-height: 1200px\)[\s\S]*clamp\(280px, 16dvh, 340px\);[\s\S]*--support-track-size: clamp\(60px, 4dvh, 82px\)/);
  assert.match(css, /@media \(min-width: 2200px\) and \(min-height: 1200px\)[\s\S]*\.hand \.card\s*\{[\s\S]*clamp\(172px, 5vw, 188px\)[\s\S]*\.field-support-card\s*\{[\s\S]*clamp\(100px, 6dvh, 124px\)/);
});

test("desktop duel table promotes the field and overlays compact HUD rails", () => {
  const css = read("duel-table.css");

  assert.match(css, /#app \.arena\.duel-table\s*\{[\s\S]*position: relative;[\s\S]*overflow: hidden;/);
  assert.match(css, /#app \.duel-table \.field\s*\{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*calc\(var\(--table-hud-width\) \+ 18px\)/);
  assert.match(css, /#app \.duel-table \.side\.duel-hud\s*\{[\s\S]*position: absolute;[\s\S]*top: auto;[\s\S]*bottom: 10px;[\s\S]*left: 10px;[\s\S]*right: auto;[\s\S]*width: var\(--table-hud-width\);/);
  assert.match(css, /#app \.duel-table \.side\.enemy\.duel-hud\s*\{[\s\S]*top: 10px;[\s\S]*bottom: auto;[\s\S]*left: 10px;/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#app \.duel-table \.side\.duel-hud\s*\{[\s\S]*left: auto;[\s\S]*right: 6px;[\s\S]*#app \.duel-table \.side\.enemy\.duel-hud\s*\{[\s\S]*left: 6px;[\s\S]*right: auto;/);
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
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*\.hand-command > \.choice-actions\.fusion-choice,[\s\S]*\.choice-actions\.material-choice,[\s\S]*\.choice-actions\.split-choice\s*\{[\s\S]*top: calc\(max\(8px, var\(--safe-area-top\)\) \+ 116px\);[\s\S]*max-height: calc\(100dvh - clamp\(226px, 34dvh, 278px\) - max\(8px, var\(--safe-area-top\)\) - 132px\);[\s\S]*overflow-y: auto;/);
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

test("phase changes use a queued stage cue without blocking the duel table", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const app = read("src/app.js");

  assert.match(html, /id="phaseStage"[\s\S]*data-phase-stage-code[\s\S]*data-phase-stage-title[\s\S]*data-phase-stage-detail/);
  assert.match(css, /\.phase-stage\s*\{[\s\S]*position: fixed;[\s\S]*pointer-events: none;/);
  assert.match(css, /\.phase-stage\[data-phase="battle"\][\s\S]*--phase-stage-accent: #ef476f/);
  assert.match(css, /body:has\(\.phase-stage\.is-active\) \.toast\.show\s*\{[\s\S]*animation: none/);
  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*\.phase-stage\s*\{[\s\S]*width: min\(480px[\s\S]*\.phase-stage-frame\s*\{[\s\S]*min-height: 64px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*phaseStagePresenceReduced/);
  assert.match(app, /queuePhaseStageEvents\(turnEvents\)/);
  assert.match(app, /queuePhaseStageEvents\(phaseEvents\)/);
  assert.match(app, /queuePhaseStageEvents\(endEvents\)/);
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
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#duelHint\[data-kind="objective"\][\s\S]*-webkit-line-clamp: 1/);
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

test("spacious field commands form one row directly above the hand", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*\.hand-panel\[data-command-active="false"\]\s*\{[\s\S]*grid-template-columns: 90px minmax\(0, 1fr\);/);
  assert.match(css, /@media \(min-width: 1600px\) and \(min-height: 900px\)[\s\S]*\.hand-command\[data-active="false"\]\s*\{[\s\S]*display: none;/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-panel,[\s\S]*body\[data-duel-selection="hand"\] \.hand-panel,[\s\S]*body\[data-duel-selection="target"\] \.hand-panel\s*\{[\s\S]*grid-template-rows: 52px minmax\(0, 1fr\);/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-command\[data-active="true"\] \.field-action-bar\s*\{[\s\S]*grid-template-columns: minmax\(220px, 1fr\) repeat\(4, minmax\(88px, 132px\)\) minmax\(220px, 1fr\);[\s\S]*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-command\[data-active="true"\] \.field-action-bar::after\s*\{[\s\S]*grid-column: 6;/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-stack,[\s\S]*body\[data-duel-selection="hand"\] \.hand-stack,[\s\S]*body\[data-duel-selection="target"\] \.hand-stack\s*\{[\s\S]*grid-row: 2;/);
  assert.match(css, /body\[data-duel-selection="playerField"\] \.hand-toolbar,[\s\S]*body\[data-duel-selection="hand"\] \.hand-toolbar,[\s\S]*body\[data-duel-selection="target"\] \.hand-toolbar\s*\{[\s\S]*display: none;/);
  assert.match(css, /body\[data-duel-selection="hand"\] \.hand-command > \.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\),[\s\S]*body\[data-duel-selection="target"\] \.hand-command > \.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\)\s*\{[\s\S]*grid-template-columns: minmax\(220px, 1fr\) repeat\(2, minmax\(100px, 132px\)\) minmax\(220px, 1fr\);/);
  assert.match(css, /body\[data-duel-selection="hand"\] \.hand-command > \.choice-actions:not\(\.fusion-choice\):not\(\.material-choice\):not\(\.split-choice\),[\s\S]*inset: auto;[\s\S]*width: 100%;[\s\S]*transform: none;/);
  assert.match(css, /\.hand-stack:has\(> \.hand-toolbar:not\(\[hidden\]\) \.hand-reorder-toggle\[aria-pressed="false"\]\)\s*\{[\s\S]*grid-template-rows: minmax\(0, 1fr\) 0 0;/);
  assert.match(css, /\.hand-toolbar:not\(\[hidden\]\):has\(\.hand-reorder-toggle\[aria-pressed="false"\]\)\s*\{[\s\S]*position: absolute;[\s\S]*bottom: 10px;[\s\S]*left: 10px;/);
  assert.match(css, /body\[data-duel-selection="hand"\][\s\S]*#choiceConfirmBtn\s*\{[\s\S]*grid-column: 2;/);
  assert.match(css, /body\[data-duel-selection="target"\][\s\S]*#choiceCancelBtn\s*\{[\s\S]*grid-column: 3;/);
  assert.match(css, /body\[data-duel-selection="playerField"\][\s\S]*\.field-attack-btn:not\(:disabled\)[\s\S]*background: linear-gradient\(180deg, #ffe19b, #f6bd60\);/);
  assert.match(css, /body\[data-duel-selection="playerField"\][\s\S]*\.field-action-btn:not\(\.field-attack-btn\)[\s\S]*border-color: rgba\(246, 189, 96, 0\.75\);/);
});

test("battle chronicle uses full-height summaries filters and structured event nodes", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");
  const renderer = read("src/timeline-renderer.js");

  assert.match(html, /BATTLE CHRONICLE[\s\S]*id="timelineLatestStep"[\s\S]*id="timelineLatestKind"[\s\S]*id="timelineActionCount"/);
  assert.match(html, /data-timeline-filter="all"[\s\S]*data-timeline-filter="battle"[\s\S]*data-timeline-filter="cards"[\s\S]*data-timeline-filter="system"/);
  assert.match(html, /id="timelineZoomOut"[\s\S]*id="timelineZoomValue"[\s\S]*id="timelineZoomIn"/);
  assert.match(css, /\.timeline-drawer\s*\{[\s\S]*width: min\(390px,[\s\S]*max-height: none;[\s\S]*grid-template-rows:/);
  assert.match(css, /\.timeline-drawer \.chain-history-list\s*\{[\s\S]*position: static;/);
  assert.match(css, /\.timeline-drawer \.timeline-list\s*\{[\s\S]*grid-auto-rows: max-content;/);
  assert.match(css, /\.timeline-drawer \.timeline-item\s*\{[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*height: max-content;/);
  assert.match(css, /\.timeline-drawer \.timeline-item\.phase\s*\{[\s\S]*border-left: 3px solid rgba\(246, 189, 96, 0\.64\);/);
  assert.match(html, /id="fieldDetailBtn"[\s\S]*<span>详情<\/span>/);
  assert.match(css, /\.timeline-node::after\s*\{[\s\S]*linear-gradient/);
  assert.match(controller, /function setTimelineFilter\(filter = "all"\)/);
  assert.match(controller, /const timelineScales = \[85, 100, 115, 130\]/);
  assert.match(controller, /function changeTimelineScale\(direction\)/);
  assert.match(controller, /timeline\.scrollTop = timelineDrag\.scrollTop - dy/);
  assert.match(css, /\.timeline-drawer\[data-timeline-scale="85"\]/);
  assert.match(css, /\.timeline-drawer \.timeline-list\.is-dragging\s*\{[\s\S]*cursor: grabbing/);
  assert.match(controller, /timelineDrawer\.dataset\.timelineView = nextFilter/);
  assert.match(controller, /function syncChainHistoryAttention\(\)[\s\S]*timelineToggle\?\.classList\.add\("has-update"\)/);
  assert.doesNotMatch(controller, /syncChainHistoryAttention\(\)[\s\S]{0,300}setDrawer\("timeline", true\)/);
  assert.match(controller, /chainHistoryObserver\.observe\(chainHistoryToggle/);
  assert.match(renderer, /item\.dataset\.timelineGroup = timelineKindGroup\(entry\.kind\)/);
  assert.match(renderer, /kind\.textContent = timelineKindLabel\(entry\.kind\)/);
  assert.doesNotMatch(read("src/app.js"), /cue\(`\$\{latest\.label\} · \$\{latest\.next\}`\)/);
});

test("hand organization exposes type sorting before entering drag mode", () => {
  const html = read("index.html");
  const app = read("src/app.js");
  const css = read("duel-table.css");
  const renderer = read("src/hand-renderer.js");

  assert.match(html, /id="handSortType"[^>]*>按类型<\/button>/);
  assert.match(html, /id="handReorderToggle"[^>]*>拖动排序<\/button>/);
  assert.match(app, /els\.handSortType\.hidden = !showToolbar/);
  assert.match(app, /els\.handReorderToggle\.textContent = handReorderMode \? "完成排序" : "拖动排序"/);
  assert.match(css, /both one-click type sorting and manual drag sorting stay visible/);
  assert.match(renderer, /cardEl\.addEventListener\("pointerdown"/);
  assert.match(renderer, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(renderer, /onPlaceCard\(card\.uid, targetUid\)/);
});

test("spell-trap destruction reveals the selected set card on the field", () => {
  const app = read("src/app.js");
  const animation = read("src/animation.js");
  const css = read("styles.css");

  assert.match(app, /card\.effect === "destroySpellTrap"[\s\S]*trapElement\(targetInfo\.owner \|\| targetOwner, targetInfo\.index\)[\s\S]*playSupportReveal/);
  assert.match(animation, /function playSupportReveal\(targetEl, card/);
  assert.match(animation, /el\.dataset\.cardId = card\.id/);
  assert.match(css, /\.support-reveal-card\s*\{[\s\S]*supportRevealFlip/);
});
