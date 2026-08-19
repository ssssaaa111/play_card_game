import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);

function readProjectFile(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function checkModuleSyntax(path) {
  const source = readProjectFile(path);
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--input-type=module", "--check"], {
      input: source,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
  }, `${path} should parse as an ES module`);
}

test("main modules parse as browser ES modules", () => {
  checkModuleSyntax("src/actions.js");
  checkModuleSyntax("src/animation.js");
  checkModuleSyntax("src/ai-card-reveal.js");
  checkModuleSyntax("src/app.js");
  checkModuleSyntax("src/audio.js");
  checkModuleSyntax("src/battle.js");
  checkModuleSyntax("src/battle-preview-renderer.js");
  checkModuleSyntax("src/browser-smoke.js");
  checkModuleSyntax("src/campaign.js");
  checkModuleSyntax("src/campaign-storage.js");
  checkModuleSyntax("src/campaign-renderer.js");
  checkModuleSyntax("src/scenario-triggers.js");
  checkModuleSyntax("src/card-detail.js");
  checkModuleSyntax("src/card-inspector-renderer.js");
  checkModuleSyntax("src/card-renderer.js");
  checkModuleSyntax("src/card-state-display.js");
  checkModuleSyntax("src/control-renderer.js");
  checkModuleSyntax("src/deck-browser.js");
  checkModuleSyntax("src/duel-modal-renderer.js");
  checkModuleSyntax("src/field-renderer.js");
  checkModuleSyntax("src/fusion-selection-renderer.js");
  checkModuleSyntax("src/hand-renderer.js");
  checkModuleSyntax("src/hand-order.js");
  checkModuleSyntax("src/hud-renderer.js");
  checkModuleSyntax("src/log-renderer.js");
  checkModuleSyntax("src/timeline-renderer.js");
  checkModuleSyntax("src/trap-response-renderer.js");
  checkModuleSyntax("src/cards.js");
  checkModuleSyntax("src/combos.js");
  checkModuleSyntax("src/data.js");
  checkModuleSyntax("src/deck.js");
  checkModuleSyntax("src/engine-adapter.js");
  checkModuleSyntax("src/log-audit.js");
  checkModuleSyntax("src/music.js");
  checkModuleSyntax("src/pre-duel-preview.js");
  checkModuleSyntax("src/response-state.js");
  checkModuleSyntax("src/selection-state.js");
  checkModuleSyntax("src/target-selection.js");
  checkModuleSyntax("src/tribute-selection.js");
  checkModuleSyntax("src/rules.js");
  checkModuleSyntax("src/scenario-state.js");
  checkModuleSyntax("src/setup-renderer.js");
  checkModuleSyntax("src/spells.js");
  checkModuleSyntax("src/timeline.js");
  checkModuleSyntax("src/traps.js");
  checkModuleSyntax("src/turn-state.js");
  checkModuleSyntax("src/view-model.js");
});

test("index keeps critical app mount points wired", () => {
  const html = readProjectFile("index.html");

  assert.match(html, /<link rel="stylesheet" href="styles\.css(?:\?v=[^"]+)?"/);
  assert.match(html, /<script type="module" src="src\/app\.js(?:\?v=[^"]+)?"><\/script>/);
  assert.match(html, /id="battlePreview"/);
  assert.match(html, /id="aiField"/);
  assert.match(html, /id="playerField"/);
  assert.match(html, /id="hand"/);
  assert.match(html, /id="timeline"/);
  assert.match(html, /id="timelineAudit"/);
  assert.match(html, /id="handConfirmBtn"/);
  assert.match(html, /id="handCancelBtn"/);
  assert.match(html, /id="handConfirmBtn"[^>]*hidden/);
  assert.match(html, /id="handCancelBtn"[^>]*hidden/);
  assert.match(html, /id="choiceActions"/);
  assert.match(html, /id="choiceConfirmBtn"/);
  assert.match(html, /id="timerProgressFill"/);
  assert.match(html, /id="skipAttackBtn"/);
  assert.match(html, /id="endTurnBtn"/);
  assert.match(html, /id="preDuelPreview"/);
  assert.match(html, /id="preDuelDeckToggle"/);
  assert.match(html, /id="deckBrowserModal"/);
  assert.match(html, /id="deckBrowserStage"/);
  assert.match(html, /id="deckBrowserPrev"/);
  assert.match(html, /id="deckBrowserNext"/);
  assert.match(html, /id="handReorderToggle"/);
  assert.match(html, /id="handSortType"/);
  assert.match(html, /id="handResetOrder"/);
  assert.match(html, /id="aiRevealModal"/);
  assert.match(html, /id="aiRevealProgress"/);
  assert.match(html, /id="aiRevealContinue"/);
  assert.match(html, /id="modalReviewLog"/);
});

test("app uses the extracted rules module", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/rules\.js'/);
  assert.doesNotMatch(app, /const MAX_LP =/);
  assert.doesNotMatch(app, /const FIELD_SIZE =/);
});

test("app delegates audio and voice playback to the audio module", () => {
  const app = readProjectFile("src/app.js");
  const audio = readProjectFile("src/audio.js");

  assert.match(app, /from '\.\/audio\.js'/);
  assert.match(app, /createAudioSettings\(\{ testMode: BROWSER_TEST_MODE \}\)/);
  assert.match(app, /createAudioController\(\{/);
  assert.match(app, /toggleSound: toggleAudioSound/);
  assert.match(app, /toggleVoice: toggleAudioVoice/);
  assert.match(app, /unlock: unlockAudio/);
  assert.doesNotMatch(app, /function playSound\(name\)/);
  assert.doesNotMatch(app, /function speak\(text/);
  assert.doesNotMatch(app, /\baudio\.ctx\b/);
  assert.doesNotMatch(app, /\bAudioContext\b/);
  assert.doesNotMatch(app, /\bspeechSynthesis\b/);
  assert.doesNotMatch(app, /state\.soundOn = !state\.soundOn/);
  assert.doesNotMatch(app, /state\.voiceOn = !state\.voiceOn/);
  assert.doesNotMatch(app, /state\.voiceReady = true/);
  assert.doesNotMatch(app, /stopVoiceAudio\(\)/);
  assert.doesNotMatch(audio, /\bgetState\b/);
  assert.doesNotMatch(audio, /dispatch[A-Z]/);
  assert.doesNotMatch(audio, /engine-adapter|game-engine/);
});

test("app delegates adaptive background music to the music module", () => {
  const app = readProjectFile("src/app.js");
  const music = readProjectFile("src/music.js");
  const html = readProjectFile("index.html");

  assert.match(app, /from '\.\/music\.js'/);
  assert.match(app, /createMusicSettings\(\{ testMode: BROWSER_TEST_MODE \}\)/);
  assert.match(app, /createMusicController\(\{/);
  assert.match(app, /musicStatus/);
  assert.match(music, /export function createMusicController/);
  assert.match(music, /mode === "critical"/);
  assert.match(html, /id="musicBtn"/);
  assert.match(html, /id="musicVolume"/);
  assert.doesNotMatch(music, /\bstate\./);
});

test("app delegates DOM animation effects to the animation module", () => {
  const app = readProjectFile("src/app.js");
  const animation = readProjectFile("src/animation.js");
  const movedAnimationFunctions = [
    "animateAvatar",
    "playDuelistLine",
    "playArrow",
    "playEpicAction",
    "playLifeDelta",
    "playAttackCloseup",
    "playAceStrike",
    "playSlashBurst",
    "playGuardShield",
    "shakeScreen",
    "playCenterCardEffect",
    "playAttackCutIn",
    "playMonsterMotion",
    "playMonsterPhantom",
    "playMonsterCounterPhantom",
    "playImpactExplosion",
    "playDuelistImpact",
    "playMonsterBurst"
  ];

  assert.match(app, /from '\.\/animation\.js'/);
  assert.match(app, /createAnimationController\(\{/);
  assert.match(app, /playDrawSequence\(duelist\.owner, drawn\)/);
  assert.match(animation, /export function createAnimationController/);
  assert.match(animation, /function playDrawSequence\(owner, cards = \[\]\)/);
  assert.match(animation, /win\.setTimeout\(\(\) => \{/);
  for (const name of movedAnimationFunctions) {
    assert.doesNotMatch(app, new RegExp(`function ${name}\\(`));
    assert.match(animation, new RegExp(`function ${name}\\(`));
  }
  assert.doesNotMatch(animation, /dispatch[A-Z]/);
  assert.doesNotMatch(animation, /\bstate\./);
  assert.doesNotMatch(animation, /engine-adapter|game-engine/);
});

test("rule docs describe event-sourced turn draw and after-attack effects", () => {
  const flow = readProjectFile("GAME_FLOW.md");
  const guardrails = readProjectFile("RULE_ENGINE.md");

  assert.match(flow, /RESOLVE_TURN_DRAW/);
  assert.match(flow, /TURN_DRAW_RESOLVED/);
  assert.match(flow, /GAME_OVER_DECLARED/);
  assert.match(flow, /afterAttack/);
  assert.match(guardrails, /RESOLVE_TURN_DRAW/);
  assert.match(guardrails, /GAME_OVER_DECLARED/);
  assert.match(guardrails, /afterAttack/);
});

test("app uses extracted player action summary", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/actions\.js'/);
  assert.match(app, /projectBattleFromUiState\(state, "player"\)\.canAttack/);
  assert.match(app, /dispatchSkipRemainingAttacksFromUiState\(state, "player"\)/);
  assert.doesNotMatch(app, /skipAvailableAttacks\(state\.player\.field\)/);
  assert.doesNotMatch(app, /state\.player\.attacksSkipped\s*=/);
  assert.doesNotMatch(app, /state\.player\.attackResets\s*=/);
  assert.doesNotMatch(app, /state\.player\.directAttacks\s*=/);
  assert.match(app, /summarizePlayerActions\(\{/);
  assert.match(app, /const actions = currentPlayerActions\(\)/);
  assert.doesNotMatch(app, /function canSummonFromHand/);
  assert.doesNotMatch(app, /function canSetTrapFromHand/);
});

test("app uses extracted turn state machine", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/turn-state\.js'/);
  assert.match(app, /canPlayerActState\(state\)/);
  assert.match(app, /dispatchOpenActionWindowFromUiState\(/);
  assert.match(app, /dispatchRequestAutoEndFromUiState\(/);
  assert.match(app, /dispatchCancelAutoEndFromUiState\(/);
  assert.match(app, /dispatchCommitAutoEndFromUiState\(/);
  assert.match(app, /dispatchEndTurnFromUiState\(/);
  assert.match(app, /async function runAiTurn\(\)[\s\S]*dispatchEndTurnFromUiState\(state, "ai", \{[\s\S]*beginTurn\("player"\)/);
  assert.match(app, /dispatchResolveTurnDrawFromUiState\(/);
  assert.match(app, /function autoPlayerDraw\(\)[\s\S]*dispatchResolveTurnDrawFromUiState\(state, "player"\)/);
  assert.match(app, /playerActionWindowDecision\(state, \{[\s\S]*hasMainAction: actions\.hasMain[\s\S]*hasBattleAction: actions\.hasBattle[\s\S]*\}\)/);
  assert.match(app, /shouldRunPlayerIdleCountdownForState\(state\)/);
  assert.match(app, /pauseResumeStep\(state\)/);
  assert.match(app, /canUsePlayerTurnControls\(state\)/);
  assert.match(app, /Object\.assign\(state, turnStartPatch\(owner\)\)/);
  assert.match(app, /Object\.assign\(state, drawToMainPatch\(\)\)/);
  assert.match(app, /Object\.assign\(state, mainToBattlePatch\(\)\)/);
  assert.doesNotMatch(app, /Object\.assign\(state, turnStartPatch\(owner\)\);\s*setActionWindow/);
  assert.doesNotMatch(app, /Object\.assign\(state, drawToMainPatch\(\)\);\s*setActionWindow/);
  assert.doesNotMatch(app, /Object\.assign\(state, mainToBattlePatch\(\)\);\s*setActionWindow/);
  assert.doesNotMatch(app, /^\s*state\.actionWindow\s*=(?!=)/m);
  assert.doesNotMatch(app, /^\s*state\.actionWindowId\s*=(?!=)/m);
  assert.doesNotMatch(app, /^\s*state\.actionDeadline\s*=(?!=)/m);
  assert.doesNotMatch(app, /^\s*state\.autoEnding\s*=\s*true/m);
});

test("app exposes manual turn control buttons", () => {
  const app = readProjectFile("src/app.js");
  const controls = readProjectFile("src/control-renderer.js");

  assert.match(app, /handConfirmBtn: document\.querySelector\("#handConfirmBtn"\)/);
  assert.match(app, /handCancelBtn: document\.querySelector\("#handCancelBtn"\)/);
  assert.match(app, /choiceConfirmBtn: document\.querySelector\("#choiceConfirmBtn"\)/);
  assert.match(app, /choiceCancelBtn: document\.querySelector\("#choiceCancelBtn"\)/);
  assert.match(app, /skipAttackBtn: document\.querySelector\("#skipAttackBtn"\)/);
  assert.match(app, /endTurnBtn: document\.querySelector\("#endTurnBtn"\)/);
  assert.match(app, /els\.handConfirmBtn\.addEventListener\("click"/);
  assert.match(app, /els\.handCancelBtn\.addEventListener\("click", cancelSelectedHandAction\)/);
  assert.match(app, /els\.choiceConfirmBtn\.addEventListener\("click"/);
  assert.match(app, /els\.choiceCancelBtn\.addEventListener\("click", cancelSelectedHandAction\)/);
  assert.match(app, /from '\.\/control-renderer\.js'/);
  assert.match(app, /renderDuelControls\(els, buildDuelControlsView\(\{/);
  assert.match(controls, /disabled: !canUseTurnControls \|\| selectionBlocksTurn \|\| !actions\.attack/);
  assert.match(controls, /disabled: !canUseTurnControls \|\| selectionBlocksTurn/);
  assert.match(app, /els\.skipAttackBtn\.addEventListener\("click", skipPlayerAttack\)/);
  assert.match(app, /els\.endTurnBtn\.addEventListener\("click", manualEndPlayerTurn\)/);
});

test("app gates hand and battle actions by explicit phase", () => {
  const app = readProjectFile("src/app.js");
  const controls = readProjectFile("src/control-renderer.js");

  assert.match(app, /function canUseHandSpells\(\)/);
  assert.match(app, /function canUseHandCards\(card = null\)/);
  assert.match(app, /card\?\.type === "spell"/);
  assert.match(app, /state\.phase === PHASES\.main/);
  assert.match(app, /state\.phase === PHASES\.battle/);
  assert.match(app, /function enterPlayerBattlePhase\(/);
  assert.match(app, /actions\.hasMain/);
  assert.match(app, /actions\.hasBattle/);
  assert.match(controls, /text: "结束回合"/);
  assert.match(app, /enterPlayerBattlePhase\("你发动攻击", \{ preserveSelection: true, quiet: true \}\)/);
});

test("selected hand cards use explicit confirm and cancel actions", () => {
  const app = readProjectFile("src/app.js");
  const controls = readProjectFile("src/control-renderer.js");
  const fieldRenderer = readProjectFile("src/field-renderer.js");
  const viewModel = readProjectFile("src/view-model.js");

  assert.match(app, /function selectedHandInfo\(\)/);
  assert.match(app, /function isAttackTargetSlot\(ownerName, index\)/);
  assert.match(app, /async function queuePendingAttack\(targetIndex, options = \{\}\)/);
  assert.match(app, /function confirmSelectedHandAction\(\)/);
  assert.match(app, /function cancelSelectedHandAction\(\)/);
  assert.match(controls, /targetSelectionStatus\?\.confirmLabel \|\| "确认发动"/);
  assert.match(controls, /confirmDisabled: hasTarget \? !targetSelectionStatus\?\.complete : !selectedHandReady/);
  assert.match(app, /function resolvePendingSpellDefault\(\{ directActivate = false \} = \{\}\)/);
  assert.match(app, /prepareDefaultTargetSelection\(initialTarget/);
  assert.match(app, /resolveSelectedTargetSelection\(state\.pendingTarget/);
  assert.match(app, /function selectPendingSpellTarget\(ownerName, index, zone = "field"\)/);
  assert.match(app, /beginSpellTargetSelection\(handIndex, card\)/);
  assert.match(app, /已取消 \$\{previousCardName\} 的目标选择，改选 \$\{card\.name\}/);
  assert.match(app, /playSpell\(state\.player, state\.ai, selected\.index\)/);
  assert.match(app, /const selectedHandReady = Boolean\(/);
  assert.match(app, /selectedHandAction\?\.ok/);
  assert.match(app, /canUseHandCards\(selectedHand\.card\)/);
  assert.match(app, /!state\.pendingTribute \|\| selectedTributeIndexes\(\)\.length === state\.pendingTribute\.cost/);
  assert.match(controls, /const showChoiceActions = canAct && \(hasPendingSelection \|\| selectedHandReady\)/);
  assert.equal((fieldRenderer.match(/"attack-target": attackTargetable/g) || []).length, 2);
  assert.match(
    fieldRenderer,
    /const disabled = owner === "ai"\s*&& !card\s*&& !targetable\s*&& !attackTargetable\s*&& !interactionTarget/
  );
  assert.match(fieldRenderer, /slot\.disabled = view\.disabled/);
  assert.doesNotMatch(app, /state\.pendingAttack/);
  assert.doesNotMatch(app, /card\.type === "spell" && state\.selected\?\.uid === card\.uid[\s\S]{0,180}playSpell\(state\.player, state\.ai/);
  assert.match(viewModel, /label: selected \? "待确认" : "可发动"/);
  assert.match(viewModel, /点击确认发动，或取消选择。/);
});

test("new player intent clears stale transient feedback", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /function clearAnnouncement\(\)\s*\{[\s\S]*els\.toast\.classList\.remove\("show"\);[\s\S]*els\.toast\.textContent = "";/);
  assert.match(app, /function notePlayerIntent\(\)\s*\{[\s\S]*clearAnnouncement\(\);[\s\S]*cancelAutoEnd\(\)/);
});

test("passive selections restart the player idle countdown", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /function resumePlayerIdleCountdownAfterPassiveIntent\(\)/);
  assert.match(app, /showDetail\(card\);\s*render\(\);\s*resumePlayerIdleCountdownAfterPassiveIntent\(\);/);
  assert.match(app, /els\.timerProgress\?\.classList\.add\("active"\)/);
  assert.match(app, /els\.timerProgressFill\.style\.width = `\$\{Math\.max\(0, Math\.min\(100, \(leftMs \/ totalMs\) \* 100\)\)\}%`/);
});

test("target selection uses standardized timed action windows", () => {
  const app = readProjectFile("src/app.js");
  const turnState = readProjectFile("src/turn-state.js");

  assert.match(turnState, /targetSelection: "targetSelection"/);
  assert.match(turnState, /responseWindow: "responseWindow"/);
  assert.match(turnState, /\[ACTION_WINDOWS\.targetSelect\]: TIMINGS\.targetSelection/);
  assert.match(turnState, /\[ACTION_WINDOWS\.response\]: TIMINGS\.responseWindow/);
  assert.match(turnState, /\[ACTION_WINDOWS\.targetSelect\]: 20/);
  assert.match(turnState, /\[ACTION_WINDOWS\.response\]: 20/);
  assert.match(app, /dispatchOpenActionWindowFromUiState[\s\S]*timeoutSeconds/);
  assert.match(app, /setActionWindow\(ACTION_WINDOWS\.targetSelect, \{ reason: `target:\$\{card\.uid\}` \}\)/);
  assert.match(app, /function handleTargetSelectionTimeout\(\)/);
  assert.match(app, /resolvePendingSpellTarget\(targets\[0\]\.owner, targets\[0\]\.index, targets\[0\]\.zone\)/);
  assert.match(app, /handleActionWindowTimeout\(windowId\)/);
  assert.match(app, /setActionWindow\(ACTION_WINDOWS\.response, \{ reason: `trap-choice:\$\{eventName\}` \}\)/);
  assert.match(app, /pendingTrapChoice/);
  assert.match(app, /chainChoices/);
});

test("trap response state is extracted and serializable", () => {
  const app = readProjectFile("src/app.js");
  const responseState = readProjectFile("src/response-state.js");

  assert.match(app, /from '\.\/response-state\.js'/);
  assert.match(app, /createTrapResponse\(\{/);
  assert.match(app, /selectTrapResponse\(choice, index\)/);
  assert.match(app, /resolveTrapResponse\(choice, answer, state\.player\.traps\)/);
  assert.doesNotMatch(app, /chainResolve/);
  assert.match(responseState, /export function createTrapResponse/);
  assert.match(responseState, /export function resolveTrapResponse/);
});

test("app uses extracted battle outcome helpers", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/battle\.js'/);
  assert.match(app, /describeBattleOutcome\(attacker, target, owner, rival\)/);
  assert.match(app, /battleLogText\(attacker, target, outcome/);
  assert.doesNotMatch(app, /Math\.round\(Math\.abs\(diff\) \* 0\.25/);
});

test("app dispatches battle state changes through the engine adapter", () => {
  const app = readProjectFile("src/app.js");
  const attackStart = app.indexOf("async function attack");
  const attackEnd = app.indexOf("function cardImpactSignature", attackStart);
  const attackSource = app.slice(attackStart, attackEnd);

  assert.match(app, /dispatchResolveBattleFromUiState/);
  assert.match(app, /dispatchDeclareAttackFromUiState/);
  assert.match(app, /dispatchCancelAttackFromUiState/);
  assert.match(app, /function isAttackFlowPending\(\)/);
  assert.match(app, /if \(isAttackFlowPending\(\)\) return/);
  assert.match(attackSource, /declareAttackWithEngine\(\s*owner,\s*rival,\s*attackerIndex,\s*targetIndex,\s*attackOptions\s*\)/);
  assert.match(attackSource, /targetEffectId = attackEvent\.id/);
  assert.match(attackSource, /declarationEventId: attackContext\.targetEffectId/);
  assert.match(attackSource, /consumeAttack: trapResult\.consumesAttack/);
  assert.match(attackSource, /consumeAttack: shield\.consumesAttack/);
  assert.match(attackSource, /resolveBattleWithEngine\(owner, rival, attackerIndex, resolvedTargetIndex, \{/);
  assert.doesNotMatch(attackSource, /const dealt = damage\(/);
  assert.doesNotMatch(attackSource, /rival\.field\[resolvedTargetIndex\]\s*=/);
  assert.doesNotMatch(attackSource, /owner\.field\[attackerIndex\]\s*=/);
  assert.doesNotMatch(attackSource, /rival\.grave\.push\(target\)/);
  assert.doesNotMatch(attackSource, /owner\.grave\.push\(attacker\)/);
  assert.doesNotMatch(attackSource, /attacker\.tempAtk\s*\+=/);
  assert.doesNotMatch(attackSource, /drawCards\(owner/);
});

test("app resolves element combos through engine commands", () => {
  const app = readProjectFile("src/app.js");
  const adapter = readProjectFile("src/engine-adapter.js");

  assert.match(app, /dispatchResolveElementCombosFromUiState\(state, owner\.owner, rival\.owner, source\)/);
  assert.match(adapter, /type: "RESOLVE_ELEMENT_COMBOS"/);
  assert.doesNotMatch(app, /markElementComboResolved/);
  assert.doesNotMatch(app, /owner\.comboFlags\[/);
  assert.doesNotMatch(app, /owner\.comboThisTurn\s*=/);
  assert.doesNotMatch(app, /elements\.has\("fire"\) && elements\.has\("wind"\)/);
});

test("serve script defaults to the project port and accepts an isolated worktree port", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  const server = readProjectFile("scripts/dev-server.mjs");
  const browserSmoke = readProjectFile("scripts/browser-smoke.mjs");

  assert.equal(pkg.scripts.serve, "node scripts/dev-server.mjs");
  assert.equal(pkg.scripts.dev, "npm run serve");
  assert.equal(pkg.scripts["smoke:browser"], "node scripts/browser-smoke.mjs");
  assert.match(server, /argument\.startsWith\("--port="\)/);
  assert.match(server, /\|\| "5177"/);
  assert.match(server, /requestedPort > 0 && requestedPort <= 65535/);
  assert.match(server, /: 5177/);
  assert.match(server, /const host = "127\.0\.0\.1"/);
  assert.match(server, /Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"/);
  assert.match(server, /charset=utf-8/);
  assert.match(browserSmoke, /DEFAULT_BASE_URL = "http:\/\/127\.0\.0\.1:5177"/);
  assert.match(browserSmoke, /data-smoke-status="([^"]+)"/);
  assert.match(browserSmoke, /--user-data-dir=\$\{profileDir\}/);
  assert.match(browserSmoke, /function browserProfileRoots\(\)/);
  assert.match(browserSmoke, /path\.join\(tmpdir\(\), "star-card-duel-browser-smoke"\)/);
  assert.match(browserSmoke, /Unable to create browser smoke profile directory/);
  assert.match(browserSmoke, /BROWSER_BIN/);
  assert.match(browserSmoke, /equipment-spell/);
  assert.match(browserSmoke, /effect-marker-stacking-basic/);
  assert.match(browserSmoke, /support-target-readability-basic/);
  assert.match(browserSmoke, /basic-expansion/);
});

test("project documents the current phase and event flow", () => {
  const readme = readProjectFile("README.md");
  const flow = readProjectFile("GAME_FLOW.md");
  const engineRules = readProjectFile("RULE_ENGINE.md");

  assert.match(readme, /\[游戏流程与状态机\]\(GAME_FLOW\.md\)/);
  assert.match(flow, /```mermaid/);
  assert.match(flow, /setup[\s\S]*draw[\s\S]*main[\s\S]*battle[\s\S]*end/);
  assert.match(flow, /DECLARE_ATTACK/);
  assert.match(flow, /RESOLVE_CHAIN/);
  assert.match(flow, /SKIP_REMAINING_ATTACKS/);
  assert.match(flow, /OPEN_ACTION_WINDOW/);
  assert.match(flow, /ACTION_WINDOW_OPENED/);
  assert.match(flow, /REQUEST_AUTO_END/);
  assert.match(flow, /AUTO_END_REQUESTED/);
  assert.match(flow, /COMMIT_AUTO_END/);
  assert.match(flow, /TURN_ENDED/);
  assert.match(flow, /getLegalActions/);
  assert.match(flow, /GAME_OVER_DECLARED/);
  assert.match(flow, /AI Command Planning/);
  assert.match(flow, /chooseAiSpellAction/);
  assert.match(flow, /Browser Smoke Baseline/);
  assert.match(flow, /data-smoke-status/);
  assert.match(engineRules, /\[GAME_FLOW\.md\]\(GAME_FLOW\.md\)/);
  assert.match(engineRules, /Turn handoff and auto-end/);
  assert.match(engineRules, /REQUEST_AUTO_END/);
  assert.match(engineRules, /END_TURN/);
  assert.match(engineRules, /AI decision functions/);
  assert.match(engineRules, /npm run smoke:browser/);
});

test("app uses extracted card display metadata", () => {
  const renderer = readProjectFile("src/card-renderer.js");
  const detail = readProjectFile("src/card-detail.js");

  assert.match(renderer, /from '\.\/cards\.js'/);
  assert.match(detail, /from '\.\/cards\.js'/);
  assert.match(renderer, /cardRuleText\(card\)/);
  assert.doesNotMatch(renderer, /function inferRarity/);
  assert.doesNotMatch(detail, /function inferArchetype/);
});

test("app uses extracted card renderer", () => {
  const app = readProjectFile("src/app.js");
  const fieldRenderer = readProjectFile("src/field-renderer.js");
  const handRenderer = readProjectFile("src/hand-renderer.js");
  const renderer = readProjectFile("src/card-renderer.js");

  assert.match(app, /from '\.\/card-renderer\.js'/);
  assert.match(app, /from '\.\/field-renderer\.js'/);
  assert.match(app, /from '\.\/hand-renderer\.js'/);
  assert.match(fieldRenderer, /from "\.\/card-renderer\.js"/);
  assert.match(handRenderer, /from "\.\/card-renderer\.js"/);
  assert.match(app, /renderCardElement\(document, card/);
  assert.match(fieldRenderer, /slot\.dataset\.testid = `\$\{owner\}-field-\$\{index\}`/);
  assert.match(app, /renderMonsterZones\(\{/);
  assert.match(app, /renderSupportZones\(\{/);
  assert.match(app, /renderHandCards\(\{/);
  assert.match(handRenderer, /cardEl\.dataset\.zone = "hand"/);
  assert.match(renderer, /el\.dataset\.cardId = card\.id/);
  assert.doesNotMatch(app, /function createCardElement/);
  assert.doesNotMatch(app, /cardBadgeText\(card\)/);
});

test("browser test mode disables sound and guide blocking", () => {
  const app = readProjectFile("src/app.js");
  const audio = readProjectFile("src/audio.js");
  const smoke = readProjectFile("src/browser-smoke.js");

  assert.match(app, /const BROWSER_PARAMS = new URLSearchParams\(window\.location\.search\)/);
  assert.match(app, /const BROWSER_TEST_MODE = BROWSER_PARAMS\.has\("test"\)/);
  assert.match(app, /const BROWSER_MANUAL_VALUE = BROWSER_TEST_MODE \? BROWSER_PARAMS\.get\("manual"\)/);
  assert.match(app, /const BROWSER_MANUAL_MODE = BROWSER_TEST_MODE && BROWSER_PARAMS\.has\("manual"\)/);
  assert.match(app, /const BROWSER_MANUAL_SCENARIO = scenarioIdFromParam\(BROWSER_MANUAL_VALUE\)/);
  assert.match(app, /function scenarioIdFromParam\(value\)/);
  assert.match(app, /scenarioId: BROWSER_MANUAL_SCENARIO \|\| "normal"/);
  assert.match(app, /if \(BROWSER_MANUAL_SCENARIO && state\.scenarioId === BROWSER_MANUAL_SCENARIO\) \{\s*syncSetupControls\(\);/);
  assert.match(app, /const BROWSER_SMOKE = BROWSER_TEST_MODE \? BROWSER_PARAMS\.get\("smoke"\)/);
  assert.match(app, /createAudioSettings\(\{ testMode: BROWSER_TEST_MODE \}\)/);
  assert.match(audio, /export function createAudioSettings/);
  assert.match(audio, /soundOn: !testMode/);
  assert.match(audio, /voiceOn: !testMode/);
  assert.match(audio, /voiceReady: testMode/);
  assert.match(audio, /if \(!settings\.soundOn && !force\) return null;/);
  assert.match(audio, /if \(!settings\.soundOn\) return false;/);
  assert.match(audio, /if \(!settings\.voiceOn\) return false;/);
  assert.match(audio, /if \(!settings\.voiceReady && !force\) return false;/);
  assert.match(app, /toggleAudioSound\(\{ previewSound: "turn" \}\)/);
  assert.match(app, /toggleAudioVoice\(\{ owner: "player", key: "start", text: "语音提示已开启。", force: true \}\)/);
  assert.match(app, /if \(BROWSER_TEST_MODE\) return true;/);
  assert.match(app, /window\.__starDuelTest = Object\.freeze\(\{/);
  assert.match(app, /snapshot: createTestSnapshot\(\{/);
  assert.match(smoke, /export function createTestSnapshot/);
  assert.match(smoke, /latestLog: logEntryMessage\(state\.log\[0\]\)/);
  assert.match(smoke, /timing: state\.timing/);
  assert.match(smoke, /actionDeadline: state\.actionDeadline/);
  assert.match(smoke, /audit: auditLogEntries\(state\.timeline\)/);
});

test("app uses extracted log audit module", () => {
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");
  const audit = readProjectFile("src/log-audit.js");
  const timelineRenderer = readProjectFile("src/timeline-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /from '\.\/timeline-renderer\.js'/);
  assert.match(timelineRenderer, /from "\.\/log-audit\.js"/);
  assert.match(app, /timelineAudit: document\.querySelector\("#timelineAudit"\)/);
  assert.match(timelineRenderer, /auditLogEntries\(timeline\)/);
  assert.match(timelineRenderer, /export function auditIssueLabel\(issue\)/);
  assert.match(timelineRenderer, /const firstIssueText = firstIssue/);
  assert.match(timelineRenderer, /text: audit\.ok \? "审计 OK" : `疑点 \$\{audit\.issueCount\}：\$\{firstIssueText\}`/);
  assert.match(timelineRenderer, /elements\.timelineAudit\.dataset\.auditDetail = auditView\.detail/);
  assert.match(smoke, /from '\.\/log-audit\.js'/);
  assert.match(audit, /export function auditLogEntries/);
  assert.match(audit, /missing-spell-resolution/);
  assert.match(audit, /direct-after-block/);
  assert.match(audit, /missing-attack-resolution/);
  assert.match(css, /\.timeline-audit\.warn/);
  assert.match(css, /\.timeline-audit\.error/);
  assert.match(app, /if \(event\.type === "LP_HEALED" && event\.amount > 0\)/);
  assert.match(app, /if \(event\.type === "DAMAGE_DEALT"\)/);
  assert.match(app, /playLifeDelta\(owner\.owner, event\.amount\)/);
  assert.match(app, /playLifeDelta\(target\.owner, -dealt\)/);
});

test("after-attack feedback stages base damage before revealing effect damage", () => {
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");
  const feedbackStart = app.indexOf("async function resolveAfterAttackBattleFeedback(owner, attacker, events)");
  const feedbackEnd = app.indexOf("function declareAttackWithEngine", feedbackStart);
  const feedbackSource = app.slice(feedbackStart, feedbackEnd);

  assert.ok(feedbackStart >= 0 && feedbackEnd > feedbackStart);
  assert.match(
    feedbackSource,
    /combatHudDamageStage\.begin\(afterAttackDamageEvent\);[\s\S]*await waitForAiReveal/
  );
  assert.match(feedbackSource, /finally \{[\s\S]*combatHudDamageStage\.end\(afterAttackDamageEvent\);[\s\S]*renderCurrentCombatHud\(\)/);
  assert.match(feedbackSource, /event\.type === "AFTER_ATTACK_EFFECT_RESOLVED"/);
  assert.doesNotMatch(feedbackSource, /attacker\.afterAttack && events\.some\(\(event\) => event\.sourceCardId === attackerId\)/);
  assert.match(
    smoke,
    /aiRevealVisible\(ctx\.els, "trio-star-herald"\)[\s\S]*ctx\.els\.playerLp\?\.textContent\.trim\(\) !== "300 \/ 4000"/
  );
  assert.match(smoke, /sun must not reveal an after-attack effect without a declaration target/);
});

test("browser smoke runner covers key click regressions", () => {
  const html = readProjectFile("index.html");
  const data = readProjectFile("src/data.js");
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");
  const deckBrowser = readProjectFile("src/deck-browser.js");
  const setupOptions = readProjectFile("src/setup-options.js");
  const setupRenderer = readProjectFile("src/setup-renderer.js");
  const controls = readProjectFile("src/control-renderer.js");
  const trapResponseRenderer = readProjectFile("src/trap-response-renderer.js");
  const targetSelection = readProjectFile("src/target-selection.js");

  assert.match(html, /<select id="deckSelect"><\/select>/);
  assert.match(html, /<select id="scenarioSelect"><\/select>/);
  assert.match(html, /id="scenarioSelectLabel">玩法模式</);
  assert.match(app, /from ['"]\.\/setup-options\.js['"]/);
  assert.match(app, /function initializeSetupControls\(\)/);
  assert.match(app, /initializeSetupControls\(\);/);
  assert.match(setupOptions, /setupVisibility !== "internal"/);
  assert.match(setupOptions, /setupVisibility === "player"/);
  assert.match(data, /setupVisibility: "internal"/);
  assert.match(data, /setupVisibility: "player"/);
  assert.match(data, /protagonistAceEvolution: \{/);
  assert.match(data, /aceSuppressionRival: \{/);
  assert.match(data, /protagonistTrioOmega: \{/);
  assert.match(data, /protagonistTrioOmegaFull: \{/);
  assert.match(data, /trioOmegaRival: \{/);
  assert.match(data, /trioOmegaRivalFull: \{/);
  assert.match(smoke, /"protagonist-ace-evolution-demo": runProtagonistAceEvolutionDemoSmoke/);
  assert.match(smoke, /"protagonist-ace-protection-demo": runProtagonistAceProtectionDemoSmoke/);
  assert.match(smoke, /"tribute-readability-basic": runTributeReadabilityBasicSmoke/);
  assert.match(smoke, /"fusion-readability-basic": runFusionReadabilityBasicSmoke/);
  assert.match(smoke, /"token-readability-basic": runTokenReadabilityBasicSmoke/);
  assert.match(smoke, /"trio-omega-demo": runTrioOmegaDemoSmoke/);
  assert.match(smoke, /"trio-omega-challenge": runTrioOmegaChallengeSmoke/);
  assert.match(smoke, /"trio-omega-autopilot-fails": runTrioOmegaAutopilotFailsSmoke/);
  assert.match(smoke, /"trio-omega-happy-clicker-fails": runTrioOmegaHappyClickerFailsSmoke/);
  assert.match(smoke, /"trio-omega-full-duel": runTrioOmegaFullDuelSmoke/);
  assert.match(smoke, /"trio-chain-lifecycle-basic": runTrioChainLifecycleBasicSmoke/);
  assert.match(smoke, /setSmokeStatus\("passed", "protagonist-ace-evolution-demo"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "protagonist-ace-protection-demo"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "tribute-readability-basic"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "fusion-readability-basic"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "token-readability-basic"\)/);
  assert.match(smoke, /const smokeName = "grave-target-readability-basic";[\s\S]*非怪兽[\s\S]*invalid grave target changed rules state[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-omega-demo"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-omega-challenge"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-omega-autopilot-fails"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-omega-happy-clicker-fails"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-omega-full-duel"\)/);
  assert.match(smoke, /const smokeName = "trio-chain-lifecycle-basic";[\s\S]*committed solar snare remains visible[\s\S]*"850 \/ 4000"[\s\S]*setSmokeStatus\("passed", smokeName\)/);

  assert.match(html, /id="graveTargets"/);
  assert.match(html, /id="scenarioBrief"/);
  assert.match(html, /id="scenarioDifficulty"/);
  assert.match(html, /id="scenarioObjectives"/);
  assert.match(html, /id="scenarioHintToggle"/);
  assert.match(html, /id="scenarioHints"/);
  assert.match(html, /id="fusionPreview"/);
  assert.match(html, /id="fusionPreviewKicker"/);
  assert.match(html, /id="fusionPreviewName"/);
  assert.match(html, /id="fusionPreviewStats"/);
  assert.match(html, /id="fusionResultChoices"/);
  assert.match(html, /id="fusionPreviewMaterials"/);
  assert.match(html, /id="fusionPreviewDetail"/);
  assert.match(html, /id="chainStack"/);
  assert.match(data, /skipLock: \{/);
  assert.match(data, /directTrap: \{/);
  assert.match(data, /trapChoice: \{/);
  assert.match(data, /guardSkip: \{/);
  assert.match(data, /summonEffects: \{/);
  assert.match(data, /summonFireBuff: \{/);
  assert.match(data, /summonShield: \{/);
  assert.match(data, /summonShadowBurn: \{/);
  assert.match(data, /equipment: \{/);
  assert.match(data, /basicExpansion: \{/);
  assert.match(data, /protagonistComeback: \{/);
  assert.match(data, /protagonistComebackChallenge: \{/);
  assert.match(data, /difficulty: "challenge"/);
  assert.match(data, /objectives: \[/);
  assert.match(data, /hints: \[/);
  assert.match(data, /recommendedLine: \[/);
  assert.match(data, /playerGrave: \["spark-runner", "astral-comet-ace"\]/);
  assert.match(data, /suppressionRival: \{/);
  assert.match(data, /expansionSummon: \{/);
  assert.match(data, /expansionParry: \{/);
  assert.match(data, /protagonistFinalCounter: \{/);
  assert.match(data, /protagonistTrioOmegaChallenge: \{/);
  assert.match(data, /openingDrawCount: 5/);
  assert.match(data, /aiStyle: "scriptedPressure"/);
  assert.match(data, /playerHand: \["trio-solar-snare", "trio-ember-recall", "trio-final-counter"\]/);
  assert.match(data, /playerDeck: \["trio-chain-veil", "trio-moonbreaker-ray", "last-spark"\]/);
  assert.match(data, /playerGrave: \["flare-titan", "trio-ember-pawn"\]/);
  assert.match(data, /setupContinuousEffects: \[/);
  assert.match(data, /phantomRedirect: \{/);
  assert.match(app, /from '\.\/browser-smoke\.js'/);
  assert.match(app, /scheduleBrowserSmoke\(\{/);
  assert.match(app, /graveTargets: document\.querySelector\("#graveTargets"\)/);
  assert.match(app, /scenarioBrief: document\.querySelector\("#scenarioBrief"\)/);
  assert.match(app, /preDuelDeckToggle: document\.querySelector\("#preDuelDeckToggle"\)/);
  assert.match(app, /deckBrowserModal: document\.querySelector\("#deckBrowserModal"\)/);
  assert.match(app, /els\.preDuelDeckToggle\.addEventListener\("click", openDeckBrowser\)/);
  assert.match(app, /handReorderToggle: document\.querySelector\("#handReorderToggle"\)/);
  assert.match(app, /handSortType: document\.querySelector\("#handSortType"\)/);
  assert.match(app, /handResetOrder: document\.querySelector\("#handResetOrder"\)/);
  assert.match(app, /reconcileHandOrder\(state\.player\.hand, handDisplayOrder\)/);
  assert.match(app, /aiRevealModal: document\.querySelector\("#aiRevealModal"\)/);
  assert.match(app, /aiRevealProgress: document\.querySelector\("#aiRevealProgress"\)/);
  assert.match(app, /fusionPreview: document\.querySelector\("#fusionPreview"\)/);
  assert.match(app, /fusionResultChoices: document\.querySelector\("#fusionResultChoices"\)/);
  assert.match(app, /fusionPreviewDetail: document\.querySelector\("#fusionPreviewDetail"\)/);
  assert.match(app, /chainStack: document\.querySelector\("#chainStack"\)/);
  assert.match(app, /from '\.\/trap-response-renderer\.js'/);
  assert.match(trapResponseRenderer, /from "\.\/chain-view\.js"/);
  assert.match(app, /from '\.\/setup-renderer\.js'/);
  assert.match(app, /renderSetupPanel\(document, els, \{/);
  assert.match(setupRenderer, /export function renderScenarioBrief/);
  assert.match(setupRenderer, /export function renderPreDuelPreview/);
  assert.match(app, /function currentFusionSelectionView/);
  assert.match(app, /renderFusionSelectionPanel\(\{/);
  assert.match(controls, /classList\.toggle\("fusion-choice", view\.choice\.fusion\)/);
  assert.match(controls, /classList\.toggle\("material-choice", view\.choice\.material\)/);
  assert.match(controls, /classList\.toggle\("target-choice", view\.choice\.target\)/);
  assert.match(app, /els\.fusionPreviewDetail\.addEventListener\("click"/);
  assert.match(app, /pendingAiRevealQueue = \[\]/);
  assert.match(app, /withAiRevealQueuePosition\(/);
  assert.match(app, /function waitForAiReveal/);
  assert.match(app, /\["ai-card-reveal-confirm", "ai-card-reveal-queue"\]\.includes\(BROWSER_SMOKE\)/);
  assert.match(app, /buildAiCardReveal\(/);
  assert.match(setupRenderer, /buildPreDuelPreview\(\{/);
  assert.match(deckBrowser, /cardInspectorViewModel\(entry\.id\)/);
  assert.match(deckBrowser, /onSelect\(entryIndex\)/);
  assert.match(app, /scenarioHintsVisible = !scenarioHintsVisible/);
  assert.match(targetSelection, /pending\.mode === "ownGraveMonster"/);
  assert.match(targetSelection, /pending\.mode === "ownGraveCard"/);
  assert.match(app, /collectLegalTargetSelections\(pending/);
  assert.match(app, /canDispatchSummonEffectFromUiState/);
  assert.doesNotMatch(app, /card\.onSummon === "(burn200|draw1|heal300|fireBuff|shield400|shadowBurn)"/);
  assert.match(smoke, /"skip-lock": runSkipLockSmoke/);
  assert.match(smoke, /"direct-guard": runDirectGuardSmoke/);
  assert.match(smoke, /"direct-shield-consume": runDirectShieldConsumeSmoke/);
  assert.match(smoke, /"guard-counter": runGuardCounterSmoke/);
  assert.match(smoke, /"ai-guard-skip": runAiGuardSkipSmoke/);
  assert.match(smoke, /"ai-mirror-restraint-basic": runAiMirrorRestraintBasicSmoke/);
  assert.match(smoke, /"ai-multi-attack-reentry-basic": runAiMultiAttackReentryBasicSmoke/);
  assert.match(smoke, /"trio-attack-planning-basic": runTrioAttackPlanningBasicSmoke/);
  assert.match(smoke, /"trio-turn-planning-basic": runTrioTurnPlanningBasicSmoke/);
  assert.match(smoke, /"summon-effects": runSummonEffectsSmoke/);
  assert.match(smoke, /"summon-fire-buff": runSummonFireBuffSmoke/);
  assert.match(smoke, /"summon-shield": runSummonShieldSmoke/);
  assert.match(smoke, /"summon-shadow-burn": runSummonShadowBurnSmoke/);
  assert.match(smoke, /"summon-trap-response": runSummonTrapResponseSmoke/);
  assert.match(smoke, /"summon-position-basic": runSummonPositionBasicSmoke/);
  assert.match(smoke, /"tribute-summon": runTributeSummonSmoke/);
  assert.match(smoke, /"tribute-summon-basic": runTributeSummonBasicSmoke/);
  assert.match(smoke, /"tribute-summon-double": runTributeSummonDoubleSmoke/);
  assert.match(smoke, /"divine-summon": runDivineSummonSmoke/);
  assert.match(smoke, /"trio-tribute-summon": runTrioTributeSummonSmoke/);
  assert.match(smoke, /"divine-guard": runDivineGuardSmoke/);
  assert.match(smoke, /"divine-pierce": runDivinePierceSmoke/);
  assert.match(smoke, /"divine-pressure": runDivinePressureSmoke/);
  assert.match(smoke, /"divine-resistance": runDivineResistanceSmoke/);
  assert.match(smoke, /"divine-break": runDivineBreakSmoke/);
  assert.match(smoke, /"fusion-summon": runFusionSummonSmoke/);
  assert.match(smoke, /"fusion-summon-basic": runFusionSummonBasicSmoke/);
  assert.match(smoke, /"fusion-mixed-materials": runFusionMixedMaterialsSmoke/);
  assert.match(smoke, /"fusion-result-choice": runFusionResultChoiceSmoke/);
  assert.match(smoke, /"player-counter-chain": runPlayerCounterChainSmoke/);
  assert.match(smoke, /"mirror-destroy-no-damage-basic": runMirrorDestroyNoDamageBasicSmoke/);
  assert.match(smoke, /"battle-flow-regression-basic": runBattleFlowRegressionBasicSmoke/);
  assert.match(smoke, /"response-window-resume-basic": runResponseWindowResumeBasicSmoke/);
  assert.match(smoke, /"triple-counter-chain": runTripleCounterChainSmoke/);
  assert.match(smoke, /"chain-resolution-review": runChainResolutionReviewSmoke/);
  assert.match(smoke, /chainStatus\?\.textContent\.includes\("将加入 CL3"\)/);
  assert.match(smoke, /"split-token": runSplitTokenSmoke/);
  assert.match(smoke, /"token-split-basic": runTokenSplitBasicSmoke/);
  assert.match(smoke, /"graveyard-summon-basic": runGraveyardSummonBasicSmoke/);
  assert.match(smoke, /"grave-target-readability-basic": runGraveTargetReadabilityBasicSmoke/);
  assert.match(smoke, /"mechanics-regression-basic": runMechanicsRegressionBasicSmoke/);
  assert.match(smoke, /fusionPreviewName/);
  assert.match(smoke, /fusionPreviewKicker/);
  assert.match(smoke, /fusionPreviewStats/);
  assert.match(smoke, /fusionPreviewMaterials/);
  assert.match(smoke, /fusionPreviewDetail/);
  assert.match(smoke, /every result option should expose stats and recipe/);
  assert.match(smoke, /fusion-choice/);
  assert.match(smoke, /material-choice/);
  assert.match(smoke, /"five-zone-layout": runFiveZoneLayoutSmoke/);
  assert.match(smoke, /"basic-expansion": runBasicExpansionSmoke/);
  assert.match(smoke, /"protagonist-comeback-demo": runProtagonistComebackDemoSmoke/);
  assert.match(smoke, /"protagonist-comeback-challenge": runProtagonistComebackChallengeSmoke/);
  assert.match(smoke, /"protagonist-comeback-autopilot-fails": runProtagonistComebackAutopilotFailsSmoke/);
  assert.match(smoke, /"trio-omega-demo": runTrioOmegaDemoSmoke/);
  assert.match(smoke, /"trio-omega-challenge": runTrioOmegaChallengeSmoke/);
  assert.match(smoke, /"trio-omega-autopilot-fails": runTrioOmegaAutopilotFailsSmoke/);
  assert.match(smoke, /"trio-omega-happy-clicker-fails": runTrioOmegaHappyClickerFailsSmoke/);
  assert.match(smoke, /"redirect-prompt": runRedirectPromptSmoke/);
  assert.match(smoke, /"phantom-switch-redirect": runPhantomSwitchRedirectSmoke/);
  assert.match(smoke, /"spell-target-default-basic": runSpellTargetDefaultBasicSmoke/);
  assert.match(smoke, /"spell-multi-target-choice-basic": runSpellMultiTargetChoiceBasicSmoke/);
  assert.match(smoke, /"spell-target-legality-audit-basic": runSpellTargetLegalityAuditBasicSmoke/);
  assert.match(smoke, /"grave-card-target-choice-basic": runGraveCardTargetChoiceBasicSmoke/);
  assert.match(smoke, /"support-target-readability-basic": runSupportTargetReadabilityBasicSmoke/);
  assert.match(smoke, /"field-target-readability-basic": runFieldTargetReadabilityBasicSmoke/);
  assert.match(smoke, /"target-window": runTargetWindowSmoke/);
  assert.match(smoke, /"battle-spell": runBattleSpellSmoke/);
  assert.match(smoke, /"battle-trap": runBattleTrapSmoke/);
  assert.match(smoke, /"combo-spell": runComboSpellSmoke/);
  assert.match(smoke, /"ace-attack": runAceAttackSmoke/);
  assert.match(smoke, /"double-attack": runDoubleAttackSmoke/);
  assert.match(smoke, /"battle-trance-ready": runBattleTranceReadySmoke/);
  assert.match(smoke, /"effect-marker-lifecycle-basic": runEffectMarkerLifecycleBasicSmoke/);
  assert.match(smoke, /"effect-marker-turn-expiry-basic": runEffectMarkerTurnExpiryBasicSmoke/);
  assert.match(smoke, /"effect-marker-stacking-basic": runEffectMarkerStackingBasicSmoke/);
  assert.match(smoke, /"ai-direct-trap": runAiDirectTrapSmoke/);
  assert.match(smoke, /"trap-choice": runTrapChoiceSmoke/);
  assert.match(smoke, /"trap-choice-double": runTrapChoiceDoubleSmoke/);
  assert.match(smoke, /"response-restart": runResponseRestartSmoke/);
  assert.match(smoke, /"chain-trap-choice": runChainTrapChoiceSmoke/);
  assert.match(smoke, /"chain-attack-reentry": runChainAttackReentrySmoke/);
  assert.match(smoke, /"chain-weaken-resolution": runChainWeakenResolutionSmoke/);
  assert.match(smoke, /"ai-counter-chain": runAiCounterChainSmoke/);
  assert.match(smoke, /"turn-handoff-basic": runTurnHandoffBasicSmoke/);
  assert.match(smoke, /"phase-progression-basic": runPhaseProgressionBasicSmoke/);
  assert.match(smoke, /"phase-window-ownership-basic": runPhaseWindowOwnershipBasicSmoke/);
  assert.match(smoke, /"mode-auto-end": runModeAutoEndSmoke/);
  assert.match(smoke, /"ai-mode-event": runAiModeEventSmoke/);
  assert.match(smoke, /"invalid-spell-auto-end": runInvalidSpellAutoEndSmoke/);
  assert.match(smoke, /"pause-detail": runPauseDetailSmoke/);
  assert.match(smoke, /"ai-card-reveal-confirm": runAiCardRevealConfirmSmoke/);
  assert.match(smoke, /"ai-card-reveal-queue": runAiCardRevealQueueSmoke/);
  assert.match(smoke, /"pre-duel-deck-preview": runPreDuelDeckPreviewSmoke/);
  assert.match(smoke, /"campaign-hub-basic": runCampaignHubBasicSmoke/);
  assert.match(smoke, /"campaign-objective-tracker-basic": runCampaignObjectiveTrackerBasicSmoke/);
  assert.match(smoke, /"pre-duel-deck-scroll-preview": runPreDuelDeckScrollPreviewSmoke/);
  assert.match(smoke, /"hand-reorder-basic": runHandReorderBasicSmoke/);
  assert.match(smoke, /"equipment-spell": runEquipmentSpellSmoke/);
  assert.match(smoke, /"hand-action-highlight-recovery-basic": runHandActionHighlightRecoveryBasicSmoke/);
  assert.match(smoke, /"game-over-event": runGameOverEventSmoke/);
  assert.match(smoke, /"post-duel-log-review": runPostDuelLogReviewSmoke/);
  assert.match(smoke, /data-card-id="\$\{cardId\}"/);
  assert.match(smoke, /function trapCard/);
  assert.match(smoke, /function graveTargetCard/);
  assert.match(smoke, /function clickSmokeElementCenter/);
  assert.match(smoke, /document\.elementFromPoint\(x, y\)/);
  assert.match(smoke, /function aiRevealVisible/);
  assert.match(smoke, /scenarioBrief: \{/);
  assert.match(smoke, /preDuelPreview: \{/);
  assert.match(smoke, /aiReveal: \{/);
  assert.match(smoke, /function assertScenarioBrief/);
  assert.match(smoke, /async function clickSmokeElementTwiceAcrossRender/);
  assert.doesNotMatch(smoke, /new MouseEvent\("dblclick"/);
  assert.match(smoke, /"lunar-dominion-target-loss-basic": runLunarDominionTargetLossSmoke/);
  assert.match(smoke, /"lunar-dominion-persistence-basic": runLunarDominionTargetLossSmoke/);
  assert.match(smoke, /目标离场后必须释放月曜帷幕的有效压制状态/);
  assert.match(smoke, /时间线必须说明月曜帷幕因失去目标送墓/);
  assert.match(smoke, /月曜帷幕详情必须写明失去目标后的送墓规则/);
  assert.match(smoke, /三曜终断详情必须写明攻击力增量和攻击重置结果/);
  assert.match(smoke, /ctx\.els\.modal\?\.classList\.contains\("show"\) \? ctx\.els\.modalRestart : ctx\.els\.startBtn/);
  assert.match(smoke, /ctx\.els\.choiceConfirmBtn/);
  assert.match(smoke, /守护刻印挡住直击后消耗攻击机会/);
  assert.match(smoke, /弱化力场不取消攻击，削弱后继续结算并反杀攻击怪兽/);
  assert.match(smoke, /ctx\.currentPlayerActions\(\)\.attack/);
  assert.match(smoke, /classList\.contains\("attack-target"\)/);
  assert.match(smoke, /敌方空召唤区不应作为攻击候选/);
  assert.match(smoke, /切换到破阵星芒/);
  assert.match(smoke, /点其它手牌会取消当前目标选择并切换/);
  assert.match(smoke, /攻击目标点击后不应再等待二次确认/);
  assert.match(smoke, /守备反击保留双方怪兽/);
  assert.match(smoke, /AI 面对高守备保留攻击后回到玩家回合/);
  assert.match(smoke, /战斗阶段陷阱确认可用/);
  assert.match(smoke, /第 \$\{promptIndex\} 次直击风暴转移连锁弹窗/);
  assert.match(smoke, /所有可发动陷阱都应该高亮/);
  assert.match(smoke, /连锁场景应该在弹窗内显示三张可选陷阱/);
  assert.match(smoke, /暂停时手牌详情切换/);
  assert.match(smoke, /Blade Sigil continuous effect registered/);
  assert.match(smoke, /连续点击解印射线确认唯一默认目标/);
  assert.match(smoke, /one opening body should be destroyed while three tributes remain/);
  assert.match(smoke, /chain protection should preserve sun while the player survives the first god attack/);
  assert.match(smoke, /the public log should explain why solar snare failed/);
  assert.match(smoke, /the public log should explain why only sun attacks this turn/);
  assert.match(smoke, /trio should assign sun to the exclusive high threat/);
  assert.match(smoke, /normal summon should not be described as self-triggered special summon/);
  assert.match(smoke, /星魂格挡削弱攻击怪兽并获得护盾/);
  assert.match(smoke, /targetChangedEvents/);
  assert.match(smoke, /幻影换位重定向后仍未按新目标结算/);
  assert.match(smoke, /醒星回召把墓地王牌移回怪兽区/);
  assert.match(smoke, /被无效的攻击不应继续复用旧战斗结算/);
  assert.doesNotMatch(app, /AI attacks with|AI prepares a direct attack|switches to defense mode/);
  assert.match(smoke, /setSmokeStatus\("passed", "skip-lock"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "direct-guard"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "direct-shield-consume"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "guard-counter"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-guard-skip"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "summon-effects"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "summon-fire-buff"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "summon-shield"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "summon-shadow-burn"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "summon-trap-response"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "tribute-summon"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "tribute-summon-double"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-summon"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trio-tribute-summon"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-guard"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-pierce"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-pressure"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-resistance"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "divine-break"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "fusion-summon"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "fusion-mixed-materials"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "fusion-result-choice"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "split-token"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "basic-expansion"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "protagonist-comeback-demo"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "protagonist-comeback-challenge"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "protagonist-comeback-autopilot-fails"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "redirect-prompt"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "phantom-switch-redirect"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "spell-target-default-basic"\)/);
  assert.match(smoke, /const smokeName = "spell-multi-target-choice-basic";[\s\S]*!ctx\.state\.pendingTarget\?\.selectedTarget[\s\S]*ctx\.els\.choiceConfirmBtn\.disabled[\s\S]*explicit target receives the equipment effect[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "spell-target-legality-audit-basic";[\s\S]*zero-target spell readiness[\s\S]*unique target auto-selection[\s\S]*multiple targets require explicit choice[\s\S]*blocked switch preserves target selection[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "grave-card-target-choice-basic";[\s\S]*ownGraveCard[\s\S]*without a default[\s\S]*explicit grave card selected[\s\S]*chosen grave card resolves through dispatch[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "field-target-readability-basic";[\s\S]*不可选：非最高攻击[\s\S]*invalid field target changed rules state[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "target-window"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-spell"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-trap"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "combo-spell"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ace-attack"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "double-attack"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-trance-ready"\)/);
  assert.match(smoke, /const smokeName = "effect-marker-lifecycle-basic";[\s\S]*再攻 ×1[\s\S]*战斗 攻\+200[\s\S]*assertCardEffectMarkerMissing[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "effect-marker-turn-expiry-basic";[\s\S]*duration: "duel"[\s\S]*duration: "turn"[\s\S]*再攻 ×2[\s\S]*再攻 ×1[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "effect-marker-stacking-basic";[\s\S]*更多效果 \+2[\s\S]*生效中[\s\S]*炎岚追击生效[\s\S]*更多效果 \+1[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-direct-trap"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trap-choice"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trap-choice-double"\)/);
  assert.match(smoke, /const smokeName = "trap-choice-field-double";[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "response-restart"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-trap-choice"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-attack-reentry"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "game-over-event"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-weaken-resolution"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-counter-chain"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "player-counter-chain"\)/);
  assert.match(smoke, /async function runResponseWindowResumeBasicSmoke\(ctx\)[\s\S]*?setSmokeStatus\("passed", smokeName\);\r?\n}/);
  assert.match(smoke, /setSmokeStatus\("passed", "triple-counter-chain"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-resolution-review"\)/);
  assert.match(smoke, /const smokeName = "turn-handoff-basic";[\s\S]*"TURN_ENDED:ai"[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "phase-progression-basic";[\s\S]*event\.from === "main"[\s\S]*event\.to === "battle"[\s\S]*event\.type === "TURN_ENDED"[\s\S]*event\.fromPhase === "battle"[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "phase-window-ownership-basic";[\s\S]*event\.reason === "phase-entered:main"[\s\S]*event\.reason === "phase-entered:battle"[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "mode-auto-end"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-mode-event"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "invalid-spell-auto-end"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "pause-detail"\)/);
  assert.match(smoke, /const detailEntry = handCard[\s\S]*hand detail entry must not select, activate, or move the card[\s\S]*setSmokeStatus\("passed", "card-detail-viewer"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-log-card-detail"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-card-reveal-confirm"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-card-reveal-queue"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "pre-duel-deck-preview"\)/);
  assert.match(smoke, /const smokeName = "campaign-hub-basic";[\s\S]*fresh progress must only unlock the first chapter[\s\S]*first campaign chapter starts[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "pre-duel-deck-scroll-preview"\)/);
  assert.match(smoke, /const smokeName = "hand-reorder-basic";[\s\S]*type sort must not mutate the rule hand array[\s\S]*tap placement moves the display card[\s\S]*UI reorder must not mutate the rule hand array[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "post-duel-log-review"\)/);
  assert.match(smoke, /const lockedBefore = lockedRulesSnapshot\(\);[\s\S]*finished duel should expose no player actions[\s\S]*inspecting a hand card after game over changed rules state/);
  assert.match(smoke, /await startSmokeDuel\(ctx, "counterChain"\)/);
  assert.match(smoke, /logCardLink\(ctx\.els, "chain-nullifier"\)/);
  assert.doesNotMatch(smoke, /cardDetailTrigger/);
  assert.match(smoke, /setSmokeStatus\("passed", "equipment-spell"\)/);
  assert.match(smoke, /const smokeName = "support-target-readability-basic";[\s\S]*不能选择该目标：不是敌方魔陷区的卡。[\s\S]*不能选择该目标：该格为空。[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "hand-action-highlight-recovery-basic";[\s\S]*setSmokeStatus\("passed", smokeName\)/);
  assert.match(smoke, /const smokeName = "spell-legality-highlight-basic";[\s\S]*assertHandCardReady\(ctx\.els, "trio-final-counter"/);
  assert.match(smoke, /const smokeName = "ai-engine-legality-basic";[\s\S]*event\.attackerCardId === ready\.uid/);
  assert.match(smoke, /"ai-engine-legality-basic": runAiEngineLegalityBasicSmoke/);
  assert.match(smoke, /const smokeName = "ai-extra-summon-basic";[\s\S]*event\.ability === "extraSummon"/);
  assert.match(smoke, /"ai-extra-summon-basic": runAiExtraSummonBasicSmoke/);
  assert.match(smoke, /const smokeName = "response-action-lock-basic";[\s\S]*querySelector\("#detailName"\)\?\.textContent === blockedCard\?\.name[\s\S]*event\.type === "CHAIN_RESOLVED"/);
  assert.match(smoke, /"response-action-lock-basic": runResponseActionLockBasicSmoke/);
});

test("grave summon selection keeps illegal public cards visible with exact feedback", () => {
  const app = readProjectFile("src/app.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /const active = \["ownGraveMonster", "ownGraveCard"\]\.includes\(targetMode\)/);
  assert.match(app, /const legalAction = targetMode === "ownGraveMonster" \? "可召唤" : "可选择"/);
  assert.match(app, /dataset\.summary = `\$\{legalAction\} \$\{legalCount\} \/ 墓地 \$\{candidates\.length\}`/);
  assert.match(app, /classList\.toggle\("grave-target-unavailable", !targetInfo\.ok\)/);
  assert.match(app, /cardEl\.title = targetInfo\.ok \? `选择墓地目标：\$\{card\.name\}` : targetInfo\.reason/);
  assert.doesNotMatch(app, /const targetInfo = validateCurrentTarget\("player", index, "grave"\);\s*if \(!targetInfo\.ok\) return/);
  assert.match(app, /function selectPendingSpellTarget[\s\S]*const targetInfo = validateCurrentTarget[\s\S]*if \(!targetInfo\.ok\) \{\s*cue\(targetInfo\.reason\);\s*return true;\s*\}\s*notePlayerIntent\(\)/);
  assert.match(app, /async function resolvePendingSpellTarget[\s\S]*const targetInfo = validateCurrentTarget[\s\S]*if \(!targetInfo\.ok\) \{\s*cue\(targetInfo\.reason\);\s*return true;\s*\}\s*notePlayerIntent\(\)/);
  assert.match(css, /\.grave-targets \.card\.grave-target-unavailable/);
  assert.match(css, /\.grave-target-reason/);
});

test("field spell targets expose unavailable reasons without changing rule state", () => {
  const app = readProjectFile("src/app.js");
  const renderer = readProjectFile("src/field-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /spellTargetAt: \(index\) => fieldSpellTargetActive[\s\S]*validateCurrentTarget\(owner, index, "field"\)/);
  assert.match(app, /async function resolvePendingSpellTarget[\s\S]*const targetInfo = validateCurrentTarget[\s\S]*if \(!targetInfo\.ok\) \{\s*cue\(targetInfo\.reason\);\s*return true;\s*\}\s*notePlayerIntent\(\)/);
  assert.match(app, /function selectPendingSpellTarget[\s\S]*const targetInfo = validateCurrentTarget[\s\S]*if \(!targetInfo\.ok\) \{\s*cue\(targetInfo\.reason\);\s*return true;\s*\}\s*notePlayerIntent\(\)/);
  assert.match(renderer, /effectTargetState = spellTarget \? \(spellTarget\.ok \? "legal" : "unavailable"\)/);
  assert.match(renderer, /"effect-target-unavailable": effectTargetUnavailable/);
  assert.match(renderer, /slot\.dataset\.effectTargetReason = view\.effectTargetReason/);
  assert.match(css, /\.slot\.effect-target-unavailable::after/);
});

test("skipped attack lock is visible on field cards", () => {
  const fieldRenderer = readProjectFile("src/field-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(fieldRenderer, /const attacksLocked = Boolean\(/);
  assert.match(fieldRenderer, /state\[owner\]\?\.attacksSkipped \|\| card\.attackLockReason/);
  assert.match(fieldRenderer, /const attackReady = attackReadiness/);
  assert.match(fieldRenderer, /effectMarkers: effectMarkersAt\(index\)/);
  assert.match(fieldRenderer, /showStateRail: card\.type === "monster"/);
  assert.match(fieldRenderer, /showTributeRequirement: false/);
  assert.match(fieldRenderer, /"attack-ready": attackReady/);
  assert.match(fieldRenderer, /"attack-locked": attacksLocked/);
  assert.match(css, /\.card\.attack-locked/);
  assert.match(css, /\.card-state-chip\.continuous/);
  assert.match(css, /\.card-state-chip\.ability/);
  assert.match(css, /\.card-state-chip\.modifier/);
  assert.match(css, /\.slot\.attack-target/);
  assert.match(css, /\.slot\.empty:disabled/);
  assert.doesNotMatch(css, /pending-attack/);
});

test("player action window recovery refreshes action-ready projections after dispatch", () => {
  const app = readProjectFile("src/app.js");
  const recoveryStart = app.indexOf("function resolvePlayerActionWindow");
  const recoveryEnd = app.indexOf("function hasAvailablePlayerAttack", recoveryStart);
  const recovery = app.slice(recoveryStart, recoveryEnd);
  const autoEndStart = app.indexOf("function scheduleAutoEnd");
  const autoEndEnd = app.indexOf("function beginTurn", autoEndStart);
  const autoEnd = app.slice(autoEndStart, autoEndEnd);

  assert.match(recovery, /function resolvePlayerActionWindow\(reason = "操作完成", animationKey = ""\)/);
  assert.match(recovery, /decision\.kind === "targetSelect"[\s\S]*setActionWindow\([\s\S]*render\(animationKey\)/);
  assert.match(recovery, /decision\.kind === "main"[\s\S]*setActionWindow\([\s\S]*render\(animationKey\)/);
  assert.match(recovery, /decision\.kind === "battle"[\s\S]*setActionWindow\([\s\S]*render\(animationKey\)/);
  assert.match(autoEnd, /if \(!force && actions\.hasAny\)[\s\S]*setActionWindow\([\s\S]*render\(\)/);
});

test("field attack highlights use engine adapter legality instead of renderer phase guesses", () => {
  const app = readProjectFile("src/app.js");
  const adapter = readProjectFile("src/engine-adapter.js");
  const fieldRenderer = readProjectFile("src/field-renderer.js");

  assert.match(adapter, /export function explainMonsterAttackReadinessFromUiState/);
  assert.match(app, /attackReadinessAt: \(index\) => explainMonsterAttackReadinessFromUiState\(state, owner, index\)/);
  assert.match(fieldRenderer, /attackReady = attackReadiness/);
  assert.match(fieldRenderer, /dataset\.attackReason = view\.attackReason/);
});

test("attack-destroy trap outcome is logged once by shared engine feedback", () => {
  const app = readProjectFile("src/app.js");
  const branchStart = app.indexOf('if (trap.trigger === "attackDestroy")');
  const branchEnd = app.indexOf('if (trap.trigger === "counterBoost")', branchStart);
  const attackDestroyBranch = app.slice(branchStart, branchEnd);

  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.match(app, /event\.type === "CARD_DESTROYED"/);
  assert.doesNotMatch(attackDestroyBranch, /addLog\(`\$\{trap\.name\} 破坏了/);
});

test("public rival support details cannot be intercepted by player trap choices", () => {
  const app = readProjectFile("src/app.js");
  const fieldRenderer = readProjectFile("src/field-renderer.js");

  assert.match(app, /owner === "player" && state\.pendingTrapChoice/);
  assert.match(app, /return interactWithPendingTrapChoice\(index/);
  assert.match(fieldRenderer, /if \(view\.revealed\)/);
  assert.match(fieldRenderer, /else onCardClick\(card, index\)/);
});

test("duel UI exposes turn ownership and side-specific field feedback", () => {
  const hudRenderer = readProjectFile("src/hud-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(hudRenderer, /body\.dataset\.duelTurn = paused \? "paused" : activeTurn/);
  assert.match(hudRenderer, /panel\.classList\.toggle\("active-turn", view\.active\)/);
  assert.match(hudRenderer, /panel\.classList\.toggle\("direct-target", view\.directTargetReady\)/);
  assert.match(css, /body\[data-duel-turn="player"\] \.phase/);
  assert.match(css, /body\[data-duel-turn="ai"\] #aiField \.slot/);
  assert.match(css, /#playerField,[\s\S]*--zone-accent: 84, 210, 210/);
  assert.match(css, /#aiField,[\s\S]*--zone-accent: 239, 71, 111/);
  assert.match(css, /\.slot:has\(\.card\.selected\)/);
  assert.match(css, /\.slot:focus-visible/);
});

test("browser test attacks preserve production timing and field portraits stay visible", () => {
  const app = readProjectFile("src/app.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /const ATTACK_TIMING_MS = Object\.freeze\(\{/);
  assert.match(app, /await sleep\(ATTACK_TIMING_MS\.preview\)/);
  assert.match(app, /await sleep\(ATTACK_TIMING_MS\.declaration\)/);
  assert.match(app, /await sleep\(ATTACK_TIMING_MS\.impact\)/);
  assert.match(app, /window\.setTimeout\(resolve, ms\)/);
  assert.doesNotMatch(app, /BROWSER_TEST_SLEEP_CAP_MS/);
  assert.doesNotMatch(app, /!BROWSER_TEST_MODE\) await sleep/);
  assert.match(css, /\.field-monster-card\s*\{[\s\S]*height: min\(100%, clamp\(190px, 20dvh, 320px\)\);[\s\S]*overflow: hidden;[\s\S]*aspect-ratio: 0\.68;[\s\S]*grid-template-rows: 18px minmax\(32px, 1fr\) 15px 18px;/);
  assert.match(css, /\.field-monster-card \.art\s*\{[\s\S]*overflow: hidden;[\s\S]*isolation: isolate;/);
  assert.match(css, /\.field-monster-card \.monster-projection\s*\{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
  assert.match(css, /\.field-monster-card \.card-text\s*\{[\s\S]*display: none;/);
  assert.match(css, /\.field-monster-card \.card-head,[\s\S]*z-index: 4;/);
});

test("card faces prioritize full monster art and illustrated spell trap identities", () => {
  const renderer = readProjectFile("src/card-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(renderer, /monster-element-chip/);
  assert.match(renderer, /`ATK \$\{totalAtk\(card\)\}`/);
  assert.match(renderer, /`DEF \$\{totalDef\(card\)\}/);
  assert.match(css, /\.field-monster-card\s*\{[\s\S]*transform: none;/);
  assert.match(css, /\.field-monster-card \.monster-projection\s*\{[\s\S]*animation: none;/);
  assert.match(css, /\.card\.spell \.art[\s\S]*card-art-spell-trap-atlas\.png/);
  assert.match(css, /\.card\.trap \.art[\s\S]*card-art-spell-trap-atlas\.png/);
  assert.match(css, /background-size: 100% 100%, var\(--card-art-size, 200% auto\);/);
  assert.match(css, /\.hand \.card\.spell \.art,[\s\S]*--card-art-hand-size/);
  assert.match(css, /--card-art-hand-position/);
  assert.match(css, /\.card-art-symbol/);
});

test("app uses extracted card details", () => {
  const app = readProjectFile("src/app.js");
  const logRenderer = readProjectFile("src/log-renderer.js");
  const timelineRenderer = readProjectFile("src/timeline-renderer.js");
  const html = readProjectFile("index.html");

  assert.match(app, /from '\.\/card-detail\.js'/);
  assert.match(app, /cardInspectorViewModel\(card, \{ effectMarkers: focusedCardEffectMarkers\(card\) \}\)/);
  assert.match(app, /cardInspectorViewModel\(cardOrId, \{ effectMarkers: focusedCardEffectMarkers/);
  assert.doesNotMatch(app, /renderCurrentLog\(\{/);
  assert.doesNotMatch(html, /id="log"/);
  assert.match(timelineRenderer, /appendLogEntryContent\(\{/);
  assert.match(timelineRenderer, /buttonClassName: "log-card-link timeline-card-link"/);
  assert.match(logRenderer, /log\.slice\(0, Math\.max\(0, limit\)\)/);
  assert.match(logRenderer, /appendLogEntryContent\(\{/);
  assert.doesNotMatch(app, /cardTagText\(card\)/);
  assert.doesNotMatch(app, /attachCardDetailTrigger/);
});

test("app uses extracted duelist line text", () => {
  const app = readProjectFile("src/app.js");
  const lines = readProjectFile("src/duelist-lines.js");
  const readme = readProjectFile("README.md");

  assert.match(app, /from '\.\/duelist-lines\.js'/);
  assert.match(app, /lineFor\(owner\.owner, "summon", card\)/);
  assert.match(app, /aceLine\(card\)/);
  assert.match(lines, /export function lineFor/);
  assert.match(lines, /export function aceLine/);
  assert.match(readme, /src\/duelist-lines\.js/);
  assert.doesNotMatch(app, /function lineFor\(/);
  assert.doesNotMatch(app, /function aceLine\(/);
  assert.doesNotMatch(app, /function duelistName\(/);
  assert.doesNotMatch(app, /function duelistLabel\(/);
});

test("app delegates scenario setup to extracted state builder", () => {
  const app = readProjectFile("src/app.js");
  const scenarioState = readProjectFile("src/scenario-state.js");

  assert.match(app, /from '\.\/deck\.js'/);
  assert.match(app, /from '\.\/scenario-state\.js'/);
  assert.match(app, /buildScenarioState\(scenario, \{/);
  assert.doesNotMatch(app, /buildScenarioDeck\(/);
  assert.doesNotMatch(app, /loadCardList\(/);
  assert.doesNotMatch(app, /function createDuelist/);
  assert.doesNotMatch(app, /function buildDeck/);
  assert.doesNotMatch(app, /function cloneCard/);

  assert.match(scenarioState, /buildScenarioDeck\(preset, scenarioReservedIds\(scenario, owner\), customDecks\)/);
  assert.match(scenarioState, /scenarioList\(scenario\[`[^\n]+Hand`\]\)/);
  assert.match(scenarioState, /scenarioList\(scenario\[`[^\n]+Grave`\]\)/);
  assert.match(scenarioState, /function scenarioCard\(entry\)/);
  assert.match(scenarioState, /scenarioZone\(scenario\[`[^\n]+Field`\], MONSTER_ZONE_SIZE\)/);
  assert.match(scenarioState, /scenarioZone\(scenario\[`[^\n]+Traps`\], SPELL_TRAP_ZONE_SIZE\)/);
});

test("app uses extracted view model text", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/view-model\.js'/);
  assert.match(app, /duelHintView\(\{/);
  assert.match(app, /describeHandAction\(card, \{/);
});

test("app uses extracted timeline classification", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/timeline\.js'/);
  assert.match(app, /nextTimelineState\(state\.timeline, entry, state\.timelineStep\)/);
  assert.doesNotMatch(app, /function timelineKind/);
});

test("app uses extracted spell metadata", () => {
  const app = readProjectFile("src/app.js");
  const ai = readProjectFile("src/ai.js");
  const spellStart = app.indexOf("const spellEffects");
  const spellEnd = app.indexOf("function playSpell", spellStart);
  const spellEffectsSource = app.slice(spellStart, spellEnd);

  assert.match(app, /from '\.\/spells\.js'/);
  assert.match(app, /const spellEffects = spellDefinitions/);
  assert.match(app, /explainActivateSpellFromUiState\(state,/);
  assert.match(app, /explainSummonMonsterFromUiState\(state,/);
  assert.match(app, /explainSetTrapFromUiState\(state,/);
  assert.match(app, /explainDeclareAttackFromUiState\(state,/);
  assert.match(app, /projectBattleFromUiState\(state, "player"\)/);
  assert.match(app, /chooseAiSpellAction\(\{/);
  assert.match(app, /canActivateSpell: \(card, handIndex\) => validateSpell\(state\.ai, state\.player, card, handIndex\)\.ok/);
  assert.match(app, /canSummon: \(_card, handIndex, options\) => explainSummonMonsterFromUiState\(/);
  assert.match(app, /canSetTrap: \(_card, handIndex, trapIndex\) =>/);
  assert.match(app, /canAttackMonster: \(_card, fieldIndex\) =>/);
  assert.match(app, /dispatchChangePhaseFromUiState\(state, "ai", PHASES\.battle\);\s+await aiAttack\(\{ getTurnGoal: chooseLiveAiTurnGoal \}\);/);
  assert.doesNotMatch(app, /setActionWindow\(ACTION_WINDOWS\.ai, \{ playerId: "ai", reason: "ai battle" \}\)/);
  assert.match(ai, /scoreSpellForAi\(card\.effect/);
  assert.doesNotMatch(app, /validateSpellCondition/);
  assert.doesNotMatch(ai, /validateSpellCondition/);
  assert.doesNotMatch(spellEffectsSource, /apply:/);
  assert.doesNotMatch(app, /function damage\(/);
  assert.doesNotMatch(app, /function heal\(/);
  assert.doesNotMatch(app, /function gainShield\(/);
  assert.doesNotMatch(app, /function buffCard\(/);
  assert.doesNotMatch(app, /function wearMonster\(/);
  assert.doesNotMatch(app, /function buffAllMonsters\(/);
  assert.doesNotMatch(app, /caption: "攻击力提升"/);
  assert.doesNotMatch(app, /can: \(/);
  assert.doesNotMatch(app, /aiScore:/);
});

test("app uses extracted trap metadata", () => {
  const app = readProjectFile("src/app.js");
  const trapResponseRenderer = readProjectFile("src/trap-response-renderer.js");
  const trapStart = app.indexOf("function resolveTrapCard");
  const trapEnd = app.indexOf("async function attack", trapStart);
  const resolveTrapCardSource = app.slice(trapStart, trapEnd);

  assert.match(app, /from '\.\/traps\.js'/);
  assert.match(app, /dispatchActivateTrapFromUiState/);
  assert.match(app, /canDispatchTrapFromUiState/);
  assert.match(app, /activationText: trapActivationText/);
  assert.match(trapResponseRenderer, /activationText\(selectedCard, choice\.eventName, choice\.details\)/);
  assert.match(app, /trapCanResolve\(card, eventName, \{ owner, context \}\)/);
  assert.match(app, /\.filter\(\(\{ card \}\) => trapCanResolve\(card, eventName, \{ owner, context \}\)\)/);
  assert.match(app, /selectRedirectTarget\(owner\.field, context\.targetIndex\)/);
  assert.match(app, /trapResult\.consumesAttack/);
  assert.doesNotMatch(app, /function trapMatchesEvent/);
  assert.doesNotMatch(resolveTrapCardSource, /owner\.traps\[trapIndex\]\s*=/);
  assert.doesNotMatch(resolveTrapCardSource, /rival\.field\[context\.attackerIndex\]\s*=/);
  assert.doesNotMatch(resolveTrapCardSource, /rival\.grave\.push\(attacker\)/);
  assert.doesNotMatch(resolveTrapCardSource, /damage\(rival/);
  assert.doesNotMatch(resolveTrapCardSource, /drawCards\(owner/);
  assert.doesNotMatch(resolveTrapCardSource, /gainShield\(owner/);
  assert.doesNotMatch(resolveTrapCardSource, /buffCard\(target/);
  assert.doesNotMatch(resolveTrapCardSource, /wearMonster\(attacker/);
});

test("app reports missing engine effects instead of silent fallbacks", () => {
  const app = readProjectFile("src/app.js");
  const adapter = readProjectFile("src/engine-adapter.js");

  assert.match(app, /function reportMissingEngineEffect\(card, kind\)/);
  assert.match(app, /reportMissingEngineEffect\(card, "summon"\)/);
  assert.match(app, /reportMissingEngineEffect\(card, "spell"\)/);
  assert.match(app, /reportMissingEngineEffect\(trap, "trap"\)/);
  assert.match(adapter, /import \{ spellDefinition \} from '\.\/spells\.js'/);
  assert.match(adapter, /import \{ trapDefinition \} from '\.\/traps\.js'/);
  assert.match(adapter, /Boolean\(spellDefinition\(card\.effect\)\)/);
  assert.match(adapter, /Boolean\(trapDefinition\(effectId\)\)/);

  const playSpellStart = app.indexOf("function playSpell");
  const playSpellEnd = app.indexOf("function runtimeCardId", playSpellStart);
  assert.ok(playSpellStart >= 0, "playSpell should exist");
  assert.ok(playSpellEnd > playSpellStart, "playSpell should end before runtimeCardId");
  const playSpellSource = app.slice(playSpellStart, playSpellEnd);
  const missingSpellCheck = playSpellSource.indexOf("if (!canDispatchSpellFromUiState(card))");
  const validationCheck = playSpellSource.indexOf("const validation = validateSpell");
  assert.ok(missingSpellCheck >= 0, "playSpell should reject missing engine-backed spells");
  assert.ok(validationCheck > missingSpellCheck, "playSpell should report missing engine-backed spells before generic validation");
  assert.doesNotMatch(playSpellSource, /owner\.hand\.splice/);
  assert.doesNotMatch(playSpellSource, /owner\.grave\.push/);
  assert.doesNotMatch(playSpellSource, /owner\.(field|traps)\[[^\]]+\]\s*=/);
  assert.doesNotMatch(playSpellSource, /rival\.(field|traps)\[[^\]]+\]\s*=/);
  assert.doesNotMatch(playSpellSource, /effect\?\.apply/);
  assert.doesNotMatch(playSpellSource, /\.lp\s*[+\-]?=/);

  const trapStart = app.indexOf("function resolveTrapCard");
  const trapEnd = app.indexOf("function playBattleDamageFeedback", trapStart);
  assert.ok(trapStart >= 0, "resolveTrapCard should exist");
  assert.ok(trapEnd > trapStart, "resolveTrapCard should end before battle feedback");
  const trapSource = app.slice(trapStart, trapEnd);
  assert.doesNotMatch(trapSource, /owner\.traps\[trapIndex\]\s*=/);
  assert.doesNotMatch(trapSource, /owner\.grave\.push/);
  assert.doesNotMatch(trapSource, /rival\.grave\.push/);
  assert.doesNotMatch(trapSource, /rival\.lp\s*[+\-]?=/);
  assert.doesNotMatch(trapSource, /owner\.lp\s*[+\-]?=/);

  const spellDispatchStart = adapter.indexOf("export function dispatchActivateSpellFromUiState");
  const spellDispatchEnd = adapter.length;
  assert.ok(spellDispatchStart >= 0, "spell dispatch adapter should exist");
  const spellDispatchSource = adapter.slice(spellDispatchStart, spellDispatchEnd);
  assert.match(spellDispatchSource, /new GameEngine\(buildEngineStateFromUiState\(uiState\)\)/);
  assert.match(spellDispatchSource, /engine\.dispatch\(action\)/);
  assert.match(spellDispatchSource, /applyUiGameEvents\(uiState, events\)/);
  assert.doesNotMatch(spellDispatchSource, /\.hand\.splice/);
  assert.doesNotMatch(spellDispatchSource, /\.grave\.push/);
  assert.doesNotMatch(spellDispatchSource, /\.lp\s*[+\-]?=/);

  const trapDispatchStart = adapter.indexOf("export function dispatchActivateTrapFromUiState");
  const trapDispatchEnd = adapter.indexOf("export function dispatchPassResponsePriorityFromUiState", trapDispatchStart);
  assert.ok(trapDispatchStart >= 0, "trap dispatch adapter should exist");
  assert.ok(trapDispatchEnd > trapDispatchStart, "trap dispatch adapter should end before response priority adapter");
  const trapDispatchSource = adapter.slice(trapDispatchStart, trapDispatchEnd);
  assert.match(trapDispatchSource, /new GameEngine\(buildEngineStateFromUiState\(uiState\)\)/);
  assert.match(trapDispatchSource, /engine\.dispatch\(action\)/);
  assert.match(trapDispatchSource, /applyUiGameEvents\(uiState, events\)/);
  assert.doesNotMatch(trapDispatchSource, /\.traps\[[^\]]+\]\s*=/);
  assert.doesNotMatch(trapDispatchSource, /\.grave\.push/);
  assert.doesNotMatch(trapDispatchSource, /\.lp\s*[+\-]?=/);

  assert.doesNotMatch(app, /function resolveSummonEffect/);
  assert.doesNotMatch(app, /旧式直接结算/);
  assert.doesNotMatch(app, /尚未接入规则引擎，已跳过/);
});

test("render code avoids unsupported DOM append shortcut", () => {
  const app = readProjectFile("src/app.js");

  assert.doesNotMatch(app, /\.append\(/, "use appendChild so older embedded browser engines keep rendering effects");
});

test("mode changes re-evaluate the player action window", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /resolvePlayerActionWindow\("切换表示完成"\)/);
});

test("setup modal keeps the start action reachable", () => {
  const app = readProjectFile("src/app.js");
  const controls = readProjectFile("src/control-renderer.js");
  const modalRenderer = readProjectFile("src/duel-modal-renderer.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /const setupModalOpen = els\.modal\?\.classList\.contains\("show"\) && !state\.started && !state\.gameOver/);
  assert.match(controls, /disabled: setupModalOpen \|\| \(started && !gameOver\)/);
  assert.match(modalRenderer, /elements\.modal\.classList\.add\("show", "setup-modal"\)/);
  assert.match(css, /\.modal \{[\s\S]*z-index: 20;[\s\S]*overflow: auto;/);
  assert.match(css, /#cardModal\.show \{[\s\S]*z-index: 22;/);
  assert.match(css, /\.modal-box \{[\s\S]*max-height: calc\([\s\S]*100dvh[\s\S]*var\(--safe-area-top\)[\s\S]*var\(--safe-area-bottom\)[\s\S]*\);[\s\S]*overflow: auto;/);
  assert.match(css, /\.modal-actions \{[\s\S]*position: sticky;[\s\S]*width: 100%;/);
  assert.match(css, /#modalRestart \{[\s\S]*width: 100%;[\s\S]*min-height: 44px;/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(128px, 1fr\)\)/);
});

test("game-over modal can reveal the battle log without resetting duel state", () => {
  const app = readProjectFile("src/app.js");
  const modalRenderer = readProjectFile("src/duel-modal-renderer.js");
  const html = readProjectFile("index.html");
  const reviewStart = app.indexOf('els.modalReviewLog.addEventListener("click"');
  const reviewEnd = app.indexOf("[els.roleSelect", reviewStart);

  assert.match(html, /id="modalReviewLog"[^>]*hidden/);
  assert.match(app, /modalReviewLog: document\.querySelector\("#modalReviewLog"\)/);
  assert.match(app, /renderGameOverDuelModal\(els, \{/);
  assert.match(modalRenderer, /elements\.modalReviewLog\.hidden = !view\.reviewLog/);
  assert.ok(reviewStart >= 0, "modal review log click handler should exist");
  assert.ok(reviewEnd > reviewStart, "modal review log click handler should be bounded");

  const reviewSource = app.slice(reviewStart, reviewEnd);
  assert.match(reviewSource, /els\.modal\.classList\.remove\("show"\)/);
  assert.match(reviewSource, /resetPlayerIdleCountdown\(\)/);
  assert.doesNotMatch(reviewSource, /prepareGame\(/);
  assert.doesNotMatch(reviewSource, /startGame\(/);
  assert.doesNotMatch(reviewSource, /state\.gameOver\s*=/);
});

test("hand action prompts have visible layout room", () => {
  const css = readProjectFile("styles.css");

  assert.match(css, /overflow-y: auto;/);
  assert.match(css, /\.hand \.card\s*\{[\s\S]*grid-template-rows: auto minmax\(54px, 0\.8fr\) minmax\(28px, auto\) 24px 20px;/);
  assert.match(css, /\.card\.monster:not\(\.field-monster-card\) \.monster-projection\s*\{[\s\S]*display: block;[\s\S]*height: calc\(100% \+ 12px\);/);
  assert.match(css, /\.action-reason\s*\{[\s\S]*-webkit-line-clamp: 1;/);
  assert.match(css, /\.detail-actions\s*\{[\s\S]*position: relative;[\s\S]*z-index: 9;/);
  assert.doesNotMatch(css, /\.card-detail-trigger/);
});

test("narrow fusion prompts stay clear of clickable hand materials", () => {
  const css = readProjectFile("styles.css");
  const smoke = readProjectFile("src/browser-smoke.js");

  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.choice-actions\.fusion-choice \{[\s\S]*?top: 12px;[\s\S]*?bottom: auto;[\s\S]*?max-height: calc\(48vh - 12px\);[\s\S]*?overflow-y: auto;/);
  assert.match(smoke, /window\.innerWidth <= 720/);
  assert.match(smoke, /fusion prompt should not cover the hand material on narrow screens/);
});

test("required static files exist at documented paths", () => {
  ["index.html", "styles.css", "assets/card-art-spell-trap-atlas.png", "assets/card-art-spells-01.png", "assets/card-art-spells-02.png", "assets/card-art-spells-03.png", "assets/card-art-traps-01.png", "scripts/browser-smoke.mjs", "scripts/finale-sim.mjs", "src/actions.js", "src/animation.js", "src/ai-card-reveal.js", "src/app.js", "src/audio.js", "src/battle.js", "src/battle-log.js", "src/browser-smoke.js", "src/card-art.js", "src/card-detail.js", "src/card-renderer.js", "src/cards.js", "src/chain-view.js", "src/combos.js", "src/control-renderer.js", "src/data.js", "src/deck.js", "src/deck-browser.js", "src/duel-modal-renderer.js", "src/engine-adapter.js", "src/field-renderer.js", "src/fusion-selection-renderer.js", "src/hand-order.js", "src/hand-renderer.js", "src/hud-renderer.js", "src/log-audit.js", "src/log-renderer.js", "src/music.js", "src/pre-duel-preview.js", "src/response-state.js", "src/rules.js", "src/scenario-state.js", "src/selection-state.js", "src/setup-options.js", "src/setup-renderer.js", "src/spells.js", "src/target-selection.js", "src/timeline.js", "src/timeline-renderer.js", "src/trap-response-renderer.js", "src/traps.js", "src/tribute-selection.js", "src/turn-state.js", "src/view-model.js"].forEach((path) => {
    assert.ok(readFileSync(join(rootPath, path)), `${path} should exist`);
  });
});
