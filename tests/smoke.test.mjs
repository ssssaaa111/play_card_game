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
  checkModuleSyntax("src/app.js");
  checkModuleSyntax("src/battle.js");
  checkModuleSyntax("src/browser-smoke.js");
  checkModuleSyntax("src/card-detail.js");
  checkModuleSyntax("src/card-renderer.js");
  checkModuleSyntax("src/cards.js");
  checkModuleSyntax("src/combos.js");
  checkModuleSyntax("src/data.js");
  checkModuleSyntax("src/deck.js");
  checkModuleSyntax("src/engine-adapter.js");
  checkModuleSyntax("src/log-audit.js");
  checkModuleSyntax("src/response-state.js");
  checkModuleSyntax("src/rules.js");
  checkModuleSyntax("src/scenario-state.js");
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
});

test("app uses the extracted rules module", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/rules\.js'/);
  assert.doesNotMatch(app, /const MAX_LP =/);
  assert.doesNotMatch(app, /const FIELD_SIZE =/);
});

test("app uses extracted player action summary", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/actions\.js'/);
  assert.match(app, /canDuelistAttack\(state\.player\)/);
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
  assert.match(app, /normalizeActionWindow\(windowName\)/);
  assert.match(app, /playerActionWindowDecision\(state, \{[\s\S]*hasMainAction: actions\.hasMain[\s\S]*hasBattleAction: actions\.hasBattle[\s\S]*\}\)/);
  assert.match(app, /shouldRunPlayerIdleCountdownForState\(state\)/);
  assert.match(app, /pauseResumeStep\(state\)/);
  assert.match(app, /canUsePlayerTurnControls\(state\)/);
  assert.match(app, /Object\.assign\(state, turnStartPatch\(owner\)\)/);
  assert.match(app, /Object\.assign\(state, drawToMainPatch\(\)\)/);
  assert.match(app, /Object\.assign\(state, mainToBattlePatch\(\)\)/);
  assert.match(app, /Object\.assign\(state, aiWindowPatch\(\)\)/);
});

test("app exposes manual turn control buttons", () => {
  const app = readProjectFile("src/app.js");

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
  assert.match(app, /els\.skipAttackBtn\.disabled = !canUseTurnControls \|\| Boolean\(state\.pendingTarget\) \|\| !actions\.attack/);
  assert.match(app, /els\.endTurnBtn\.disabled = !canUseTurnControls/);
  assert.match(app, /els\.skipAttackBtn\.addEventListener\("click", skipPlayerAttack\)/);
  assert.match(app, /els\.endTurnBtn\.addEventListener\("click", manualEndPlayerTurn\)/);
});

test("app gates hand and battle actions by explicit phase", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /function canUseHandSpells\(\)/);
  assert.match(app, /function canUseHandCards\(card = null\)/);
  assert.match(app, /card\?\.type === "spell"/);
  assert.match(app, /state\.phase === PHASES\.main/);
  assert.match(app, /state\.phase === PHASES\.battle/);
  assert.match(app, /function enterPlayerBattlePhase\(/);
  assert.match(app, /actions\.hasMain/);
  assert.match(app, /actions\.hasBattle/);
  assert.match(app, /els\.endTurnBtn\.textContent = "结束回合"/);
  assert.match(app, /enterPlayerBattlePhase\("你发动攻击", \{ preserveSelection: true, quiet: true \}\)/);
});

test("selected hand cards use explicit confirm and cancel actions", () => {
  const app = readProjectFile("src/app.js");
  const viewModel = readProjectFile("src/view-model.js");

  assert.match(app, /function selectedHandInfo\(\)/);
  assert.match(app, /function isAttackTargetSlot\(ownerName, index\)/);
  assert.match(app, /async function queuePendingAttack\(targetIndex\)/);
  assert.match(app, /function confirmSelectedHandAction\(\)/);
  assert.match(app, /function cancelSelectedHandAction\(\)/);
  assert.match(app, /els\.handConfirmBtn\.textContent = state\.pendingTarget \? "确认默认目标" : handConfirmLabel\(selectedHand\?\.card\)/);
  assert.match(app, /function resolvePendingSpellDefault\(\)/);
  assert.match(app, /beginSpellTargetSelection\(handIndex, card\)/);
  assert.match(app, /已取消 \$\{previousCardName\} 的目标选择，改选 \$\{card\.name\}/);
  assert.match(app, /playSpell\(state\.player, state\.ai, selected\.index\)/);
  assert.match(app, /const selectedHandReady = Boolean\(selectedHand && selectedHandAction\?\.ok && canUseHandCards\(selectedHand\.card\)\)/);
  assert.match(app, /Boolean\(state\.pendingTarget\) \|\| selectedHandReady/);
  assert.match(app, /slot\.classList\.toggle\("attack-target", attackTargetable\)/);
  assert.match(app, /cardEl\.classList\.toggle\("attack-target", attackTargetable\)/);
  assert.match(app, /const disabledEnemyEmpty = owner === "ai" && !card && !targetable && !attackTargetable/);
  assert.match(app, /slot\.disabled = disabledEnemyEmpty/);
  assert.doesNotMatch(app, /state\.pendingAttack/);
  assert.doesNotMatch(app, /card\.type === "spell" && state\.selected\?\.uid === card\.uid[\s\S]{0,180}playSpell\(state\.player, state\.ai/);
  assert.match(viewModel, /label: selected \? "待确认" : "可发动"/);
  assert.match(viewModel, /点击确认发动，或取消选择。/);
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
  assert.match(app, /openActionWindowPatch\(normalizeActionWindow\(windowName\)/);
  assert.match(app, /setActionWindow\(ACTION_WINDOWS\.targetSelect, \{ reason: `target:\$\{card\.uid\}` \}\)/);
  assert.match(app, /function handleTargetSelectionTimeout\(\)/);
  assert.match(app, /resolvePendingSpellTarget\(targets\[0\]\.owner, targets\[0\]\.index\)/);
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
  assert.match(attackSource, /declareAttackWithEngine\(owner, rival, attackerIndex, targetIndex\)/);
  assert.match(attackSource, /targetEffectId = attackEvent\.id/);
  assert.match(attackSource, /declarationEventId: attackContext\.targetEffectId/);
  assert.match(attackSource, /resolveBattleWithEngine\(owner, rival, attackerIndex, resolvedTargetIndex, \{/);
  assert.doesNotMatch(attackSource, /const dealt = damage\(/);
  assert.doesNotMatch(attackSource, /rival\.field\[resolvedTargetIndex\]\s*=/);
  assert.doesNotMatch(attackSource, /owner\.field\[attackerIndex\]\s*=/);
  assert.doesNotMatch(attackSource, /rival\.grave\.push\(target\)/);
  assert.doesNotMatch(attackSource, /owner\.grave\.push\(attacker\)/);
  assert.doesNotMatch(attackSource, /attacker\.tempAtk\s*\+=/);
  assert.doesNotMatch(attackSource, /drawCards\(owner/);
});

test("app uses extracted combo matching helpers", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/combos\.js'/);
  assert.match(app, /availableElementCombos\(owner, source\)/);
  assert.match(app, /markElementComboResolved\(owner, combo\)/);
  assert.doesNotMatch(app, /elements\.has\("fire"\) && elements\.has\("wind"\)/);
});

test("serve script uses the fixed local port", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  const server = readProjectFile("scripts/dev-server.mjs");

  assert.equal(pkg.scripts.serve, "node scripts/dev-server.mjs");
  assert.equal(pkg.scripts.dev, "npm run serve");
  assert.match(server, /const port = 5177/);
  assert.match(server, /const host = "127\.0\.0\.1"/);
  assert.match(server, /Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"/);
  assert.match(server, /charset=utf-8/);
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
  assert.match(engineRules, /\[GAME_FLOW\.md\]\(GAME_FLOW\.md\)/);
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
  const renderer = readProjectFile("src/card-renderer.js");

  assert.match(app, /from '\.\/card-renderer\.js'/);
  assert.match(app, /renderCardElement\(document, card/);
  assert.match(app, /slot\.dataset\.testid = `\$\{owner\}-field-\$\{index\}`/);
  assert.match(app, /cardEl\.dataset\.zone = "hand"/);
  assert.match(renderer, /el\.dataset\.cardId = card\.id/);
  assert.doesNotMatch(app, /function createCardElement/);
  assert.doesNotMatch(app, /cardBadgeText\(card\)/);
});

test("browser test mode disables sound and guide blocking", () => {
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");

  assert.match(app, /const BROWSER_TEST_MODE = new URLSearchParams\(window\.location\.search\)\.has\("test"\)/);
  assert.match(app, /const BROWSER_SMOKE = BROWSER_TEST_MODE \? new URLSearchParams\(window\.location\.search\)\.get\("smoke"\)/);
  assert.match(app, /soundOn: !BROWSER_TEST_MODE/);
  assert.match(app, /voiceReady: BROWSER_TEST_MODE/);
  assert.match(app, /if \(!state\.soundOn\) return false;/);
  assert.match(app, /if \(!state\.voiceOn\) return false;/);
  assert.match(app, /if \(!state\.voiceReady && !force\) return false;/);
  assert.match(app, /else \{\s*stopVoiceAudio\(\);\s*\}/);
  assert.match(app, /if \(BROWSER_TEST_MODE\) return true;/);
  assert.match(app, /window\.__starDuelTest = Object\.freeze\(\{/);
  assert.match(app, /snapshot: createTestSnapshot\(\{/);
  assert.match(smoke, /export function createTestSnapshot/);
  assert.match(smoke, /latestLog: state\.log\[0\] \|\| ""/);
  assert.match(smoke, /timing: state\.timing/);
  assert.match(smoke, /actionDeadline: state\.actionDeadline/);
  assert.match(smoke, /audit: auditLogEntries\(state\.timeline\)/);
});

test("app uses extracted log audit module", () => {
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");
  const audit = readProjectFile("src/log-audit.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /from '\.\/log-audit\.js'/);
  assert.match(app, /timelineAudit: document\.querySelector\("#timelineAudit"\)/);
  assert.match(app, /auditLogEntries\(state\.timeline\)/);
  assert.match(app, /function auditIssueLabel\(issue\)/);
  assert.match(app, /const firstIssueText = firstIssue \? `\$\{auditIssueLabel\(firstIssue\)\} - \$\{firstIssue\.message\}` : ""/);
  assert.match(app, /els\.timelineAudit\.textContent = audit\.ok \? "审计 OK" : `疑点 \$\{audit\.issueCount\}：\$\{firstIssueText\}`/);
  assert.match(app, /els\.timelineAudit\.dataset\.auditDetail = audit\.ok/);
  assert.match(smoke, /from '\.\/log-audit\.js'/);
  assert.match(audit, /export function auditLogEntries/);
  assert.match(audit, /missing-spell-resolution/);
  assert.match(audit, /direct-after-block/);
  assert.match(audit, /missing-attack-resolution/);
  assert.match(css, /\.timeline-audit\.warn/);
  assert.match(css, /\.timeline-audit\.error/);
  assert.match(app, /addLog\(`\$\{card\.name\} 对\$\{duelistLabel\(rival\)\}造成 \$\{dealt\} 点伤害。`\)/);
  assert.match(app, /addLog\(`\$\{card\.name\} 为\$\{duelistLabel\(owner\)\}回复 \$\{owner\.lp - before\} 点生命值。`\)/);
});

test("browser smoke runner covers key click regressions", () => {
  const html = readProjectFile("index.html");
  const data = readProjectFile("src/data.js");
  const app = readProjectFile("src/app.js");
  const smoke = readProjectFile("src/browser-smoke.js");

  assert.match(html, /<option value="skipLock">跳攻锁定<\/option>/);
  assert.match(html, /<option value="directTrap">直击陷阱<\/option>/);
  assert.match(html, /<option value="trapChoice">陷阱选择<\/option>/);
  assert.match(html, /<option value="guardSkip">守备停攻<\/option>/);
  assert.match(html, /<option value="summonEffects">召唤效果<\/option>/);
  assert.match(html, /<option value="summonFireBuff">召唤火强化<\/option>/);
  assert.match(html, /<option value="summonShield">召唤护盾<\/option>/);
  assert.match(html, /<option value="summonShadowBurn">召唤暗伤<\/option>/);
  assert.match(data, /skipLock: \{/);
  assert.match(data, /directTrap: \{/);
  assert.match(data, /trapChoice: \{/);
  assert.match(data, /guardSkip: \{/);
  assert.match(data, /summonEffects: \{/);
  assert.match(data, /summonFireBuff: \{/);
  assert.match(data, /summonShield: \{/);
  assert.match(data, /summonShadowBurn: \{/);
  assert.match(app, /from '\.\/browser-smoke\.js'/);
  assert.match(app, /scheduleBrowserSmoke\(\{/);
  assert.match(app, /canDispatchSummonEffectFromUiState/);
  assert.doesNotMatch(app, /card\.onSummon === "(burn200|draw1|heal300|fireBuff|shield400|shadowBurn)"/);
  assert.match(smoke, /"skip-lock": runSkipLockSmoke/);
  assert.match(smoke, /"direct-guard": runDirectGuardSmoke/);
  assert.match(smoke, /"direct-shield-consume": runDirectShieldConsumeSmoke/);
  assert.match(smoke, /"guard-counter": runGuardCounterSmoke/);
  assert.match(smoke, /"ai-guard-skip": runAiGuardSkipSmoke/);
  assert.match(smoke, /"summon-effects": runSummonEffectsSmoke/);
  assert.match(smoke, /"summon-fire-buff": runSummonFireBuffSmoke/);
  assert.match(smoke, /"summon-shield": runSummonShieldSmoke/);
  assert.match(smoke, /"summon-shadow-burn": runSummonShadowBurnSmoke/);
  assert.match(smoke, /"summon-trap-response": runSummonTrapResponseSmoke/);
  assert.match(smoke, /"redirect-prompt": runRedirectPromptSmoke/);
  assert.match(smoke, /"target-window": runTargetWindowSmoke/);
  assert.match(smoke, /"battle-spell": runBattleSpellSmoke/);
  assert.match(smoke, /"battle-trap": runBattleTrapSmoke/);
  assert.match(smoke, /"combo-spell": runComboSpellSmoke/);
  assert.match(smoke, /"ace-attack": runAceAttackSmoke/);
  assert.match(smoke, /"double-attack": runDoubleAttackSmoke/);
  assert.match(smoke, /"battle-trance-ready": runBattleTranceReadySmoke/);
  assert.match(smoke, /"ai-direct-trap": runAiDirectTrapSmoke/);
  assert.match(smoke, /"trap-choice": runTrapChoiceSmoke/);
  assert.match(smoke, /"trap-choice-double": runTrapChoiceDoubleSmoke/);
  assert.match(smoke, /"response-restart": runResponseRestartSmoke/);
  assert.match(smoke, /"chain-trap-choice": runChainTrapChoiceSmoke/);
  assert.match(smoke, /"chain-weaken-resolution": runChainWeakenResolutionSmoke/);
  assert.match(smoke, /"ai-counter-chain": runAiCounterChainSmoke/);
  assert.match(smoke, /"mode-auto-end": runModeAutoEndSmoke/);
  assert.match(smoke, /"ai-mode-event": runAiModeEventSmoke/);
  assert.match(smoke, /"invalid-spell-auto-end": runInvalidSpellAutoEndSmoke/);
  assert.match(smoke, /"pause-detail": runPauseDetailSmoke/);
  assert.match(smoke, /data-card-id="\$\{cardId\}"/);
  assert.match(smoke, /function trapCard/);
  assert.match(smoke, /function doubleClickSmokeElement/);
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
  assert.match(smoke, /setSmokeStatus\("passed", "redirect-prompt"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "target-window"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-spell"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-trap"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "combo-spell"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ace-attack"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "double-attack"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "battle-trance-ready"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-direct-trap"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trap-choice"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "trap-choice-double"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "response-restart"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-trap-choice"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "chain-weaken-resolution"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-counter-chain"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "mode-auto-end"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "ai-mode-event"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "invalid-spell-auto-end"\)/);
  assert.match(smoke, /setSmokeStatus\("passed", "pause-detail"\)/);
});

test("skipped attack lock is visible on field cards", () => {
  const app = readProjectFile("src/app.js");
  const css = readProjectFile("styles.css");

  assert.match(app, /const attacksLocked = owner === "player" && state\.player\.attacksSkipped/);
  assert.match(app, /renderCardElement\(document, card, \{ asset: monsterAsset\(card\), attacksLocked \}\)/);
  assert.match(app, /cardEl\.classList\.toggle\("attack-locked", attacksLocked\)/);
  assert.match(css, /\.card\.attack-locked/);
  assert.match(css, /\.slot\.attack-target/);
  assert.match(css, /\.slot\.empty:disabled/);
  assert.doesNotMatch(css, /pending-attack/);
});

test("app uses extracted card details", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/card-detail\.js'/);
  assert.match(app, /cardDetailText\(card\)/);
  assert.match(app, /cardZoomMeta\(card\)/);
  assert.doesNotMatch(app, /cardTagText\(card\)/);
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

  assert.match(scenarioState, /buildScenarioDeck\(preset, scenarioReservedIds\(scenario, owner\)\)/);
  assert.match(scenarioState, /loadCardList\(scenario\[`[^\n]+Hand`\]\)/);
  assert.match(scenarioState, /Array\(FIELD_SIZE\)\.fill\(null\)/);
});

test("app uses extracted view model text", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/view-model\.js'/);
  assert.match(app, /duelHintText\(\{/);
  assert.match(app, /describeHandAction\(card, \{/);
});

test("app uses extracted timeline classification", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/timeline\.js'/);
  assert.match(app, /nextTimelineState\(state\.timeline, text, state\.timelineStep\)/);
  assert.doesNotMatch(app, /function timelineKind/);
});

test("app uses extracted spell metadata", () => {
  const app = readProjectFile("src/app.js");

  assert.match(app, /from '\.\/spells\.js'/);
  assert.match(app, /\.\.\.spellDefinitions\.buff500/);
  assert.match(app, /validateSpellCondition\(card\.effect/);
  assert.match(app, /scoreSpellForAi\(card\.effect/);
  assert.doesNotMatch(app, /caption: "攻击力提升"/);
  assert.doesNotMatch(app, /can: \(/);
  assert.doesNotMatch(app, /aiScore:/);
});

test("app uses extracted trap metadata", () => {
  const app = readProjectFile("src/app.js");
  const trapStart = app.indexOf("function resolveTrapCard");
  const trapEnd = app.indexOf("async function attack", trapStart);
  const resolveTrapCardSource = app.slice(trapStart, trapEnd);

  assert.match(app, /from '\.\/traps\.js'/);
  assert.match(app, /dispatchActivateTrapFromUiState/);
  assert.match(app, /canDispatchTrapFromUiState/);
  assert.match(app, /trapActivationText\(selectedCard, choice\.eventName, choice\.details\)/);
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
  const css = readProjectFile("styles.css");

  assert.match(app, /const setupModalOpen = els\.modal\?\.classList\.contains\("show"\) && !state\.started && !state\.gameOver/);
  assert.match(app, /els\.startBtn\.disabled = setupModalOpen \|\| \(state\.started && !state\.gameOver\)/);
  assert.match(css, /\.modal \{[\s\S]*overflow: auto;/);
  assert.match(css, /\.modal-box \{[\s\S]*max-height: calc\(100vh - 36px\);[\s\S]*overflow: auto;/);
  assert.match(css, /#modalRestart \{[\s\S]*position: sticky;[\s\S]*width: 100%;/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(128px, 1fr\)\)/);
});

test("hand action prompts have visible layout room", () => {
  const css = readProjectFile("styles.css");

  assert.match(css, /overflow-y: auto;/);
  assert.match(css, /\.hand \.card\s*\{[\s\S]*grid-template-rows: auto minmax\(42px, 0\.7fr\) minmax\(32px, auto\) auto auto;/);
  assert.match(css, /\.action-reason\s*\{[\s\S]*-webkit-line-clamp: 1;/);
});

test("required static files exist at documented paths", () => {
  ["index.html", "styles.css", "src/actions.js", "src/app.js", "src/battle.js", "src/browser-smoke.js", "src/card-detail.js", "src/card-renderer.js", "src/cards.js", "src/combos.js", "src/data.js", "src/deck.js", "src/engine-adapter.js", "src/log-audit.js", "src/response-state.js", "src/rules.js", "src/scenario-state.js", "src/spells.js", "src/timeline.js", "src/traps.js", "src/turn-state.js", "src/view-model.js"].forEach((path) => {
    assert.ok(readFileSync(join(rootPath, path)), `${path} should exist`);
  });
});
