import { createAudioController, createAudioSettings } from './audio.js';
import { monsterAssets, roleProfiles, aiProfiles, deckPresets, characterProfiles, scenarioSetups } from './data.js';
import { actionsForPhase, shouldRunPlayerIdleCountdown, summarizePlayerActions } from './actions.js';
import {
  chooseAiAttackAction,
  chooseAiSetTrapAction,
  chooseAiSpellAction,
  chooseAiSummonAction,
  shouldSwitchSummonedMonsterToDefense
} from './ai.js';
import { battleLogText, describeBattleOutcome } from './battle.js';
import { createTestSnapshot, scheduleBrowserSmoke } from './browser-smoke.js';
import { cardDetailText, cardZoomMeta } from './card-detail.js';
import { createCardElement as renderCardElement } from './card-renderer.js';
import { buildDeck, createDuelist } from './deck.js';
import { aceLine, duelistLabel, duelistName, lineFor } from './duelist-lines.js';
import {
  buildEngineStateFromUiState,
  canDispatchSummonEffectFromUiState,
  canDispatchSpellFromUiState,
  canDispatchTrapFromUiState,
  dispatchActivateTrapFromUiState,
  dispatchActivateSpellFromUiState,
  dispatchCancelAttackFromUiState,
  dispatchCancelAutoEndFromUiState,
  dispatchChangePhaseFromUiState,
  dispatchChangeMonsterModeFromUiState,
  dispatchCloseResponseWindowFromUiState,
  dispatchCommitAutoEndFromUiState,
  dispatchDeclareAttackFromUiState,
  dispatchDrawCardsFromUiState,
  dispatchEndTurnFromUiState,
  dispatchOpenResponseWindowFromUiState,
  dispatchOpenActionWindowFromUiState,
  dispatchPassResponsePriorityFromUiState,
  dispatchQueueTrapResponseFromUiState,
  dispatchRequestAutoEndFromUiState,
  dispatchResolveBattleFromUiState,
  dispatchResolveChainFromUiState,
  dispatchResolveElementCombosFromUiState,
  dispatchResolveTurnDrawFromUiState,
  dispatchSkipRemainingAttacksFromUiState,
  dispatchSetTrapFromUiState,
  dispatchStartTurnFromUiState,
  dispatchSummonMonsterFromUiState,
  dispatchTrapResponseFromUiState,
  explainActivateSpellFromUiState,
  explainDeclareAttackFromUiState,
  explainSetTrapFromUiState,
  explainSummonMonsterFromUiState,
  projectBattleFromUiState
} from './engine-adapter.js';
import { auditLogEntries } from './log-audit.js';
import { spellDefinitions, validateSpellCondition } from './spells.js';
import { nextTimelineState } from './timeline.js';
import { selectRedirectTarget, trapActivationText, trapCanResolve, trapConsumesAttack } from './traps.js';
import {
  canActivateTrapResponse,
  createTrapResponse,
  resolveTrapResponse,
  selectTrapResponse
} from './response-state.js';
import { buildScenarioState } from './scenario-state.js';
import {
  ACTION_WINDOWS,
  PHASES,
  TIMINGS,
  actionWindowTimeoutSeconds,
  canPlayerActState,
  canUsePlayerTurnControls,
  drawToMainPatch,
  mainToBattlePatch,
  pauseResumeStep,
  playerActionWindowDecision,
  shouldRunPlayerIdleCountdownForState,
  turnStartPatch
} from './turn-state.js';
import { describeHandAction, duelHintText, phaseLabel, turnLabel } from './view-model.js';
import {
  MAX_LP,
  FIELD_SIZE,
  battlePreviewText,
  battleValue,
  fieldCards,
  fieldElements,
  makeBattlePreview,
  spellTargetPrompt,
  strongestMonster,
  totalAtk,
  validateSpellTargetRule,
  weakestMonster
} from './rules.js';

const BROWSER_TEST_MODE = new URLSearchParams(window.location.search).has("test");
const BROWSER_SMOKE = BROWSER_TEST_MODE ? new URLSearchParams(window.location.search).get("smoke") || "" : "";
const AUTO_END_DELAY_MS = 2800;

const state = {
  player: createDuelist("player"),
  ai: createDuelist("ai"),
  turn: "player",
  phase: PHASES.draw,
  timing: TIMINGS.draw,
  selected: null,
  pendingTarget: null,
  focusedCard: null,
  autoEnding: false,
  autoEndTimer: null,
  actionWindow: ACTION_WINDOWS.setup,
  pendingOpeningDraw: false,
  pendingTrapChoice: null,
  resumeResolvers: [],
  idleTimer: null,
  countdownTimer: null,
  actionDeadline: 0,
  actionWindowId: null,
  actionWindowReason: "",
  started: false,
  paused: false,
  aiRunning: false,
  roleId: "star",
  deckPreset: "balanced",
  aiStyle: "balanced",
  scenarioId: "normal",
  stats: loadDuelStats(),
  statsRecorded: false,
  ...createAudioSettings({ testMode: BROWSER_TEST_MODE }),
  gameOver: false,
  gameOverWinner: null,
  gameOverLosers: [],
  gameOverReason: "",
  gameOverAnnounced: false,
  log: [],
  timeline: [],
  timelineStep: 0,
  gameEvents: [],
  battlePreview: null,
  ruleCheckIssue: null
};

let pendingTrapChoiceResolver = null;

const els = {
  phaseText: document.querySelector("#phaseText"),
  turnText: document.querySelector("#turnText"),
  timerText: document.querySelector("#timerText"),
  timerProgress: document.querySelector("#timerProgress"),
  timerProgressFill: document.querySelector("#timerProgressFill"),
  guideBtn: document.querySelector("#guideBtn"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  skipAttackBtn: document.querySelector("#skipAttackBtn"),
  endTurnBtn: document.querySelector("#endTurnBtn"),
  soundBtn: document.querySelector("#soundBtn"),
  voiceBtn: document.querySelector("#voiceBtn"),
  restartBtn: document.querySelector("#restartBtn"),
  playerLp: document.querySelector("#playerLp"),
  aiLp: document.querySelector("#aiLp"),
  playerName: document.querySelector("#playerName"),
  aiName: document.querySelector("#aiName"),
  playerSkill: document.querySelector("#playerSkill"),
  aiSkill: document.querySelector("#aiSkill"),
  profileStats: document.querySelector("#profileStats"),
  playerPanel: document.querySelector("#playerPanel"),
  aiPanel: document.querySelector("#aiPanel"),
  playerAvatar: document.querySelector("#playerAvatar"),
  aiAvatar: document.querySelector("#aiAvatar"),
  playerFigure: document.querySelector("#playerFigure"),
  aiFigure: document.querySelector("#aiFigure"),
  playerLife: document.querySelector("#playerLife"),
  aiLife: document.querySelector("#aiLife"),
  playerDeckCount: document.querySelector("#playerDeckCount"),
  aiDeckCount: document.querySelector("#aiDeckCount"),
  playerGraveCount: document.querySelector("#playerGraveCount"),
  aiGraveCount: document.querySelector("#aiGraveCount"),
  playerField: document.querySelector("#playerField"),
  aiField: document.querySelector("#aiField"),
  playerTraps: document.querySelector("#playerTraps"),
  aiTraps: document.querySelector("#aiTraps"),
  hand: document.querySelector("#hand"),
  log: document.querySelector("#log"),
  timeline: document.querySelector("#timeline"),
  timelineCount: document.querySelector("#timelineCount"),
  timelineAudit: document.querySelector("#timelineAudit"),
  detailName: document.querySelector("#detailName"),
  detailText: document.querySelector("#detailText"),
  battlePreview: document.querySelector("#battlePreview"),
  handConfirmBtn: document.querySelector("#handConfirmBtn"),
  handCancelBtn: document.querySelector("#handCancelBtn"),
  modeBtn: document.querySelector("#modeBtn"),
  detailBtn: document.querySelector("#detailBtn"),
  duelHint: document.querySelector("#duelHint"),
  toast: document.querySelector("#toast"),
  effectLayer: document.querySelector("#effectLayer"),
  choiceActions: document.querySelector("#choiceActions"),
  choiceText: document.querySelector("#choiceText"),
  choiceConfirmBtn: document.querySelector("#choiceConfirmBtn"),
  choiceCancelBtn: document.querySelector("#choiceCancelBtn"),
  aceOverlay: document.querySelector("#aceOverlay"),
  aceName: document.querySelector("#aceName"),
  aceIcon: document.querySelector("#aceIcon"),
  aceLine: document.querySelector("#aceLine"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalText: document.querySelector("#modalText"),
  modalRestart: document.querySelector("#modalRestart"),
  setupPanel: document.querySelector("#setupPanel"),
  roleSelect: document.querySelector("#roleSelect"),
  deckSelect: document.querySelector("#deckSelect"),
  aiSelect: document.querySelector("#aiSelect"),
  scenarioSelect: document.querySelector("#scenarioSelect"),
  setupStats: document.querySelector("#setupStats"),
  guideModal: document.querySelector("#guideModal"),
  guideClose: document.querySelector("#guideClose"),
  cardModal: document.querySelector("#cardModal"),
  zoomName: document.querySelector("#zoomName"),
  zoomCard: document.querySelector("#zoomCard"),
  zoomText: document.querySelector("#zoomText"),
  zoomMeta: document.querySelector("#zoomMeta"),
  zoomClose: document.querySelector("#zoomClose"),
  chainModal: document.querySelector("#chainModal"),
  chainText: document.querySelector("#chainText"),
  chainChoices: document.querySelector("#chainChoices"),
  chainStatus: document.querySelector("#chainStatus"),
  chainYes: document.querySelector("#chainYes"),
  chainNo: document.querySelector("#chainNo")
};

const audioController = createAudioController({
  getSettings: () => ({
    soundOn: state.soundOn,
    voiceOn: state.voiceOn,
    voiceReady: state.voiceReady
  }),
  setSettings: (audioSettings) => Object.assign(state, audioSettings),
  announce
});

const {
  isVoiceReady,
  playSound,
  playVoice,
  stopAll,
  speak,
  cue,
  toggleSound: toggleAudioSound,
  toggleVoice: toggleAudioVoice,
  unlock: unlockAudio
} = audioController;
function showBattlePreview(attacker, target, owner = null, rival = null) {
  state.battlePreview = makeBattlePreview(attacker, target, owner, rival);
}

function clearBattlePreview() {
  state.battlePreview = null;
}

function loadDuelStats() {
  try {
    const raw = window.localStorage?.getItem("starDuelStats");
    return raw ? { duels: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, ...JSON.parse(raw) } : {
      duels: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0
    };
  } catch (error) {
    return { duels: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0 };
  }
}

function saveDuelStats() {
  try {
    window.localStorage?.setItem("starDuelStats", JSON.stringify(state.stats));
  } catch (error) {
    // Local storage is optional.
  }
}

function setupLabel(map, key) {
  return map[key]?.label || key;
}

function statsLine() {
  const stats = state.stats;
  return `战绩 ${stats.wins}胜/${stats.losses}负 / 总局数 ${stats.duels} / 当前连胜 ${stats.streak} / 最高连胜 ${stats.bestStreak}`;
}

function recordGameResult(win) {
  if (state.statsRecorded) return;
  state.statsRecorded = true;
  state.stats.duels += 1;
  if (win) {
    state.stats.wins += 1;
    state.stats.streak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
  } else {
    state.stats.losses += 1;
    state.stats.streak = 0;
  }
  saveDuelStats();
}

function applySetupChoices() {
  state.roleId = els.roleSelect?.value || state.roleId;
  state.deckPreset = els.deckSelect?.value || state.deckPreset;
  state.aiStyle = els.aiSelect?.value || state.aiStyle;
  state.scenarioId = els.scenarioSelect?.value || state.scenarioId;
  Object.assign(characterProfiles.player, roleProfiles[state.roleId] || roleProfiles.star);
  Object.assign(characterProfiles.ai, aiProfiles[state.aiStyle]?.profile || aiProfiles.balanced.profile);
}

function syncSetupControls() {
  if (els.roleSelect) els.roleSelect.value = state.roleId;
  if (els.deckSelect) els.deckSelect.value = state.deckPreset;
  if (els.aiSelect) els.aiSelect.value = state.aiStyle;
  if (els.scenarioSelect) els.scenarioSelect.value = state.scenarioId;
}

function applyScenarioSetup() {
  const scenario = scenarioSetups[state.scenarioId];
  if (!scenario || state.scenarioId === "normal") return;
  const setup = buildScenarioState(scenario, {
    playerPreset: state.deckPreset,
    aiPreset: aiProfiles[state.aiStyle]?.deckPreset || "balanced"
  });
  Object.assign(state.player, setup.player);
  Object.assign(state.ai, setup.ai);
  addLog(`规则测试场景：${scenario.label}。${scenario.text}`);
  if (scenario.goal) {
    addLog(`测试目标：${scenario.goal}`);
  }
}

function startGame() {
  stopAll();
  closeTrapChoicePrompt();
  applySetupChoices();
  Object.assign(state.player, createDuelist("player", characterProfiles.player.passive));
  Object.assign(state.ai, createDuelist("ai", characterProfiles.ai.passive));
  state.player.deck = buildDeck(state.deckPreset);
  state.ai.deck = buildDeck(aiProfiles[state.aiStyle]?.deckPreset || "balanced");
  state.turn = "player";
  state.phase = "draw";
  state.selected = null;
  state.pendingTarget = null;
  state.focusedCard = null;
  clearBattlePreview();
  state.autoEnding = false;
  cancelAutoEnd();
  setActionWindow("draw");
  state.pendingOpeningDraw = false;
  state.started = true;
  state.paused = false;
  state.aiRunning = false;
  state.resumeResolvers = [];
  clearPlayerIdleTimers();
  state.gameOver = false;
  state.gameOverWinner = null;
  state.gameOverLosers = [];
  state.gameOverReason = "";
  state.gameOverAnnounced = false;
  state.statsRecorded = false;
  state.log = [];
  state.timeline = [];
  state.timelineStep = 0;
  state.gameEvents = [];
  els.modal.classList.remove("show");
  els.modalRestart.textContent = "再来一局";
  if (state.scenarioId === "normal") {
    drawCards(state.player, 5, { announce: false, reason: "opening" });
    drawCards(state.ai, 5, { announce: false, reason: "opening" });
  } else {
    applyScenarioSetup();
  }
  addLog("决斗开始。你先攻，抽卡后展开第一波攻势。");
  addLog(`基础扩展已启用：${characterProfiles.player.skill} / ${setupLabel(deckPresets, state.deckPreset)} / ${characterProfiles.ai.name}。`);
  addLog("教学目标：召唤怪兽、发动魔法或盖陷阱，然后完成一次攻击。");
  playVoice("player", "start", "决斗开始。轮到你，先抽卡。", true);
  render();
  if (!hasSeenGuide()) {
    window.setTimeout(showGuide, 250);
  } else {
    scheduleOpeningDraw();
  }
}

function prepareGame() {
  stopAll();
  closeTrapChoicePrompt();
  applySetupChoices();
  syncSetupControls();
  Object.assign(state.player, createDuelist("player", characterProfiles.player.passive));
  Object.assign(state.ai, createDuelist("ai", characterProfiles.ai.passive));
  state.turn = "player";
  state.phase = "ready";
  state.selected = null;
  state.pendingTarget = null;
  state.focusedCard = null;
  clearBattlePreview();
  state.autoEnding = false;
  cancelAutoEnd();
  setActionWindow("setup");
  state.pendingOpeningDraw = false;
  state.started = false;
  state.paused = false;
  state.aiRunning = false;
  state.resumeResolvers = [];
  state.gameOver = false;
  state.gameOverWinner = null;
  state.gameOverLosers = [];
  state.gameOverReason = "";
  state.gameOverAnnounced = false;
  state.statsRecorded = false;
  state.log = ["点击“开始决斗”后再抽卡开局。"];
  state.timeline = [];
  state.timelineStep = 0;
  state.gameEvents = [];
  clearPlayerIdleTimers();
  els.modalTitle.textContent = "准备决斗";
  els.modalText.textContent = "确认准备好后再开始。开局后也可以随时暂停。";
  els.modalRestart.textContent = "开始决斗";
  els.modal.classList.add("show");
  render();
}

function drawCard(duelist, announce = true, reason = "effect") {
  return drawCards(duelist, 1, { announce, reason })[0] || null;
}

function applyDrawEventFeedback(duelist, events, announce = true) {
  const drawEvent = events.find((event) => event.type === "CARDS_DRAWN");
  const drawn = (drawEvent?.cardIds || [])
    .map((cardId) => findRuntimeCard(cardId)?.card)
    .filter(Boolean);
  if (announce && drawn.length > 0) {
    drawn.forEach((card, index) => {
      window.setTimeout(() => {
        playSound("draw");
        playDrawEffect(duelist.owner, card);
      }, index * 760);
    });
    addLog(`${duelist.owner === "player" ? "你" : "AI"} 抽了 ${drawn.length} 张卡。`);
    playVoice(duelist.owner, "draw", duelist.owner === "player" ? `抽 ${drawn.length} 张卡。` : `对手抽 ${drawn.length} 张卡。`);
  }

  const failed = events.find((event) => event.type === "DRAW_FAILED");
  const damageEvent = events.find((event) => event.type === "DAMAGE_DEALT");
  if (failed) {
    const blocked = Math.max(0, Number(damageEvent?.blocked) || 0);
    const dealt = Math.max(0, Number(damageEvent?.amount) || 0);
    if (blocked > 0) {
      playSound("guard");
      playGuardShield(panelElement(duelist.owner));
    }
    if (dealt > 0) {
      playSound("damage");
      playLifeDelta(duelist.owner, -dealt);
      animateAvatar(duelist.owner, "hit");
    }
    addLog(`${duelist.owner === "player" ? "你" : "AI"} 少抽 ${failed.missing} 张卡，受到 ${dealt} 点伤害${blocked > 0 ? `，护盾吸收 ${blocked}` : ""}。`);
    speak(`${duelist.owner === "player" ? "你" : "对手"}无卡可抽，受到伤害。`);
    checkGameOver();
  }
  return drawn;
}

function drawCards(duelist, count, { announce = true, reason = "effect", sourceCardId = null } = {}) {
  let events = [];
  try {
    events = dispatchDrawCardsFromUiState(state, duelist.owner, count, { reason, sourceCardId });
  } catch (error) {
    cue(error.message || "抽卡失败。");
    console.error(error);
    return [];
  }

  return applyDrawEventFeedback(duelist, events, announce);
}

function resolveElementCombos(owner, rival, source = "") {
  let events = [];
  try {
    events = dispatchResolveElementCombosFromUiState(state, owner.owner, rival.owner, source);
  } catch (error) {
    addLog(`组合技结算被规则引擎拒绝：${error.message || "未知错误"}`);
    console.error(error);
    return [];
  }

  const comboEvents = events.filter((event) => event.type === "COMBO_TRIGGERED");
  comboEvents.forEach((event) => {
    playCenterCardEffect({ type: "spell", name: event.title, icon: "连", text: event.text }, event.text);
    playSound("spell-elementEcho");
    playEpicAction("连携", "draw");
    const voiced = playVoice(owner.owner, "combo", `${duelistLabel(owner)}触发组合技，${event.title}。`);
    addLog(`${duelistLabel(owner)}触发组合技：${event.title}。${event.text}`);
    if (!voiced) speak(`${duelistLabel(owner)}触发组合技，${event.title}。`, false, owner.owner);
  });

  events.filter((event) => event.type === "CHARACTER_PASSIVE_TRIGGERED").forEach((event) => {
    playEpicAction("角色技能", "draw");
    addLog(`${event.name}发动：本回合首次组合技触发角色被动。`);
    speak(`角色技能发动，${event.name}。`, false, owner.owner);
  });

  if (comboEvents.length > 0) {
    const effectName = comboEvents.map((event) => event.title).join(" / ");
    resolveEngineSpellFeedback(owner, rival, { name: effectName, effect: "elementCombo" }, events);
    if (events.some((event) => event.type === "DAMAGE_DEALT" && event.amount > 0)) shakeScreen();
  }
  return events;
}

function activeDuelist() {
  return state.turn === "player" ? state.player : state.ai;
}

function opponentDuelist() {
  return state.turn === "player" ? state.ai : state.player;
}

function canPlayerAct() {
  return canPlayerActState(state);
}

function canUseHandSpells() {
  return canPlayerAct() && (
    (state.phase === PHASES.main && state.actionWindow === ACTION_WINDOWS.main) ||
    (state.phase === PHASES.battle && state.actionWindow === ACTION_WINDOWS.battle)
  );
}

function canSetHandTraps() {
  return canPlayerAct() && (
    (state.phase === PHASES.main && state.actionWindow === ACTION_WINDOWS.main) ||
    (state.phase === PHASES.battle && state.actionWindow === ACTION_WINDOWS.battle)
  );
}

function handTimingBlockReason(card) {
  if (card?.type === "spell") return "当前时点不能发动这张魔法卡。";
  if (card?.type === "trap") return "当前时点不能盖放这张陷阱卡。";
  return "这张卡只能在主要阶段使用。";
}

function canUseHandCards(card = null) {
  if (card?.type === "spell") return canUseHandSpells();
  if (card?.type === "trap") return canSetHandTraps();
  return canPlayerAct() && state.phase === PHASES.main && state.actionWindow === ACTION_WINDOWS.main;
}

function canUseBattleActions() {
  return canPlayerAct() && projectBattleFromUiState(state, "player").inBattleWindow;
}

function currentEngineMachine() {
  try {
    return buildEngineStateFromUiState(state).machine;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function isAttackFlowPending() {
  const machine = currentEngineMachine();
  return Boolean(
    state.pendingTrapChoice ||
    pendingTrapChoiceResolver ||
    machine?.pendingAttack ||
    machine?.responseWindow ||
    (machine?.chain || []).length > 0
  );
}

function setActionWindow(windowName, options = {}) {
  try {
    return dispatchOpenActionWindowFromUiState(
      state,
      options.playerId || state.turn || "player",
      windowName,
      {
        now: options.now ?? Date.now(),
        reason: options.reason || "",
        timeoutSeconds: options.timeoutSeconds ?? actionWindowTimeoutSeconds(windowName)
      }
    );
  } catch (error) {
    console.error(error);
    return [];
  }
}

function cancelAutoEnd() {
  if (state.autoEndTimer) {
    window.clearTimeout(state.autoEndTimer);
    state.autoEndTimer = null;
  }
  if (state.autoEnding) {
    const wasAutoEndWindow = state.actionWindow === ACTION_WINDOWS.autoEnd;
    try {
      dispatchCancelAutoEndFromUiState(state, state.turn || "player", {
        reason: "cancel auto end"
      });
    } catch (error) {
      console.error(error);
      state.autoEnding = false;
    }
    if (wasAutoEndWindow && canPlayerAct()) {
      setActionWindow(state.phase === PHASES.battle ? ACTION_WINDOWS.battle : ACTION_WINDOWS.main, {
        reason: "cancel auto end"
      });
    }
  }
}

function notePlayerIntent() {
  if (!canPlayerAct()) return;
  cancelAutoEnd();
  clearPlayerIdleTimers();
}

function resumePlayerIdleCountdownAfterPassiveIntent() {
  if (shouldRunPlayerIdleCountdownForState(state)) {
    resetPlayerIdleCountdown();
  }
}

function hasValidSpellInHand(duelist, rival) {
  return duelist.hand.some((card, index) => card.type === "spell" && validateSpell(duelist, rival, card, index).ok);
}

function currentPlayerActions() {
  const summary = summarizePlayerActions({
    player: state.player,
    pendingTarget: state.pendingTarget,
    summonedThisTurn: state.player.normalSummonsUsed > 0,
    canSpell: (card, index) => card.type === "spell" && validateSpell(state.player, state.ai, card, index).ok
  });
  try {
    const projection = projectBattleFromUiState(state, "player");
    const legal = projection.legal;
    const battleLegal = projection.battleLegal;
    summary.attack = legal.can.declareAttack || battleLegal.can.declareAttack;
    summary.summon = legal.can.summon;
    summary.trap = legal.can.setTrap;
    summary.mode = legal.can.changeMode;
    summary.modeBlocksMain = summary.mode && summary.modeBlocksMain;
    summary.spell = summary.spell && legal.can.activateCard;
    summary.hasAny = summary.targetSelect || summary.attack || summary.spell || summary.summon || summary.trap || summary.mode;
  } catch (error) {
    console.error("Failed to project legal player actions", error);
  }
  const actions = actionsForPhase(summary, state.phase);
  if (canPlayerAct()) return actions;
  return {
    targetSelect: false,
    attack: false,
    spell: false,
    summon: false,
    trap: false,
    mode: false,
    hasMain: false,
    hasBattle: false,
    hasAny: false
  };
}

function spellTargetMode(card) {
  return spellEffects[card?.effect]?.target || "";
}

function spellNeedsManualTarget(owner, card) {
  return owner.owner === "player" && Boolean(spellTargetMode(card));
}

function targetPromptFor(mode, cardName = "这张卡", effectName = "") {
  return spellTargetPrompt(mode, cardName, spellEffects[effectName]?.targetRule || "");
}

function clearPendingTarget() {
  state.pendingTarget = null;
  if (state.actionWindow === ACTION_WINDOWS.targetSelect) {
    setActionWindow(state.phase === PHASES.battle ? ACTION_WINDOWS.battle : ACTION_WINDOWS.main, { reason: "target cleared" });
  }
}

function beginSpellTargetSelection(handIndex, card) {
  const mode = spellTargetMode(card);
  if (!mode) return false;
  state.pendingTarget = {
    handUid: card.uid,
    handIndex,
    effect: card.effect,
    mode,
    targetRule: spellEffects[card.effect]?.targetRule || "",
    cardName: card.name
  };
  state.selected = { zone: "hand", uid: card.uid };
  setActionWindow(ACTION_WINDOWS.targetSelect, { reason: `target:${card.uid}` });
  if (!legalPendingTargets().length) {
    clearPendingTarget();
    state.selected = null;
    cue(`${card.name} 没有合法目标，不能发动。`);
    render();
    resolvePlayerActionWindow("没有合法目标");
    return false;
  }
  const prompt = targetPromptFor(mode, card.name, card.effect);
  cue(prompt);
  addLog(`等待选择 ${card.name} 的目标。`);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function validateSpellTarget(pending, ownerName, index, zone = "field") {
  if (!pending) return { ok: false, reason: "当前没有需要选择目标的效果。" };
  const duelist = ownerName === "player" ? state.player : state.ai;

  if (pending.mode === "enemySpellTrap") {
    if (zone !== "traps" || ownerName !== "ai") {
      return { ok: false, reason: "这个效果需要选择敌方魔陷区的卡。" };
    }
    const target = duelist.traps[index];
    if (!target) return { ok: false, reason: "请选择敌方魔陷区的卡作为目标。" };
    return { ok: true, target, targetOwner: ownerName, targetIndex: index, targetZone: zone };
  }

  if (zone !== "field") return { ok: false, reason: "这个效果需要选择场上的怪兽。" };
  const target = duelist.field[index];
  if (!target) return { ok: false, reason: "请选择场上的怪兽作为目标。" };
  if (pending.mode === "ownMonster" && ownerName !== "player") {
    return { ok: false, reason: "这个效果需要选择我方怪兽。" };
  }
  if (pending.mode === "enemyMonster" && ownerName !== "ai") {
    return { ok: false, reason: "这个效果需要选择敌方怪兽。" };
  }
  const rule = validateSpellTargetRule(pending, duelist, target);
  if (!rule.ok) return rule;
  return { ok: true, target, targetOwner: ownerName, targetIndex: index };
}

function isPendingTargetSlot(ownerName, index) {
  if (!state.pendingTarget) return false;
  return validateSpellTarget(state.pendingTarget, ownerName, index).ok;
}

function isPendingTrapTargetSlot(ownerName, index) {
  if (!state.pendingTarget) return false;
  return validateSpellTarget(state.pendingTarget, ownerName, index, "traps").ok;
}

function targetInfoFromPending(ownerName, index, zone = "field") {
  const validation = validateSpellTarget(state.pendingTarget, ownerName, index, zone);
  if (!validation.ok) return validation;
  return {
    ok: true,
    owner: ownerName,
    index,
    zone,
    card: validation.target
  };
}

function resolvePendingSpellTarget(ownerName, index, zone = "field") {
  if (!state.pendingTarget) return false;
  notePlayerIntent();
  const targetInfo = targetInfoFromPending(ownerName, index, zone);
  if (!targetInfo.ok) {
    cue(targetInfo.reason);
    resetPlayerIdleCountdown();
    return true;
  }
  const handIndex = state.player.hand.findIndex((card) => card.uid === state.pendingTarget.handUid);
  if (handIndex < 0) {
    clearPendingTarget();
    state.selected = null;
    cue("这张魔法卡已经不在手牌里。");
    render();
    resumePlayerIdleCountdownAfterPassiveIntent();
    return true;
  }
  playSpell(state.player, state.ai, handIndex, targetInfo);
  return true;
}

function resolvePendingSpellDefault() {
  if (!state.pendingTarget) return false;
  const cardName = state.pendingTarget.cardName;
  const targets = legalPendingTargets();
  if (!targets.length) {
    clearPendingTarget();
    state.selected = null;
    clearBattlePreview();
    cue(`${cardName} 没有合法目标，已取消发动。`);
    addLog(`${cardName} 没有合法目标，未发动。`);
    render();
    resolvePlayerActionWindow("目标无效");
    return true;
  }
  cue(`默认选择 ${targets[0].card.name}。`);
  return resolvePendingSpellTarget(targets[0].owner, targets[0].index, targets[0].zone);
}

function canChangeAnyPlayerMode() {
  return currentPlayerActions().mode;
}

function hasPlayerMainAction() {
  return currentPlayerActions().hasAny;
}

function resolvePlayerActionWindow(reason = "操作完成") {
  if (isAttackFlowPending()) return;
  const actions = currentPlayerActions();
  const decision = playerActionWindowDecision(state, {
    hasMainAction: actions.hasMain,
    hasBattleAction: actions.hasBattle
  });
  if (decision.kind === "ignore") return;
  if (decision.kind === "targetSelect") {
    setActionWindow(decision.actionWindow, { reason });
    resetPlayerIdleCountdown();
    return;
  }
  cancelAutoEnd();
  if (decision.kind === "main") {
    setActionWindow(decision.actionWindow, { reason });
    resetPlayerIdleCountdown();
    if (!actions.attack && actions.spell) {
      cue(`${reason}，还有可发动的卡牌。`);
    }
  } else if (decision.kind === "battle") {
    if (decision.enterBattle) {
      enterPlayerBattlePhase(reason);
      return;
    }
    setActionWindow(decision.actionWindow, { reason });
    resetPlayerIdleCountdown();
  } else if (decision.kind === "autoEnd") {
    scheduleAutoEnd(reason);
  }
}

function hasAvailablePlayerAttack() {
  return projectBattleFromUiState(state, "player").canAttack;
}

function selectHandCard(uid) {
  const card = state.player.hand.find((item) => item.uid === uid);
  if (!card) return;
  if (!canPlayerAct()) {
    showDetail(card);
    render();
    return;
  }
  if (state.pendingTrapChoice) {
    showDetail(card);
    cue("先选择高亮陷阱，或点击不发动。");
    render();
    resetPlayerIdleCountdown();
    return;
  }
  if (state.pendingTarget) {
    notePlayerIntent();
    const sameCard = state.pendingTarget.handUid === uid;
    if (sameCard) {
      resolvePendingSpellDefault();
      return;
    } else {
      const previousCardName = state.pendingTarget.cardName;
      clearPendingTarget();
      state.selected = null;
      clearBattlePreview();
      addLog(`已取消 ${previousCardName} 的目标选择，改选 ${card.name}。`);
    }
  }
  const handIndex = state.player.hand.findIndex((item) => item.uid === uid);
  const wasSelected = state.selected?.zone === "hand" && state.selected.uid === uid;
  const canUseNow = canUseHandCards(card);
  const action = handActionInfo(card, handIndex);
  if (!canUseNow || !action.ok) {
    cue(canUseNow ? action.reason : handTimingBlockReason(card));
    playSound("click");
    state.selected = { zone: "hand", uid };
    clearBattlePreview();
    showDetail(card);
    render();
    resolvePlayerActionWindow("查看不可用手牌");
    return;
  }
  notePlayerIntent();
  if (wasSelected) {
    confirmSelectedHandAction();
    return;
  }
  playSound("click");
  state.selected = { zone: "hand", uid };
  clearBattlePreview();
  showDetail(card);
  if (card.type === "spell" && spellNeedsManualTarget(state.player, card)) {
    beginSpellTargetSelection(handIndex, card);
    return;
  }
  render();
  resumePlayerIdleCountdownAfterPassiveIntent();
}

function selectedHandInfo() {
  if (state.selected?.zone !== "hand") return null;
  const index = state.player.hand.findIndex((card) => card.uid === state.selected.uid);
  if (index < 0) return null;
  return { card: state.player.hand[index], index };
}

async function queuePendingAttack(targetIndex) {
  const attackerIndex = state.selected?.zone === "playerField" ? state.selected.index : -1;
  const attacker = state.player.field[attackerIndex];
  if (!attacker) return false;
  if (targetIndex >= 0 && !state.ai.field[targetIndex]) {
    cue("不能攻击空的召唤区。直接攻击请点击对手角色。");
    resetPlayerIdleCountdown();
    return false;
  }
  clearBattlePreview();
  const validation = explainDeclareAttackFromUiState(state, "player", "ai", attackerIndex, targetIndex);
  if (!validation.ok) {
    cue(validation.reason);
    addLog(`攻击无效：${validation.reason}`);
    render();
    resetPlayerIdleCountdown();
    return false;
  }
  const target = state.ai.field[targetIndex];
  const preview = battlePreviewText(attacker, target);
  cancelAutoEnd();
  clearPlayerIdleTimers();
  setActionWindow(ACTION_WINDOWS.resolution, { reason: "attack-resolution" });
  showBattlePreview(attacker, target, state.player, state.ai);
  addLog(`攻击预判：${preview}`);
  cue(preview);
  render();
  let resolved = false;
  try {
    await sleep(360);
    resolved = await attack(state.player, state.ai, attackerIndex, targetIndex);
  } finally {
    if (!state.gameOver && state.actionWindow === ACTION_WINDOWS.resolution) {
      setActionWindow(ACTION_WINDOWS.battle, { reason: "attack-resolved" });
    }
  }
  state.selected = null;
  clearBattlePreview();
  render(targetIndex >= 0 ? "hit-ai-" + targetIndex : "hit-ai-direct");
  if (!state.gameOver && resolved) {
    resolvePlayerActionWindow("攻击完成");
  } else if (!state.gameOver) {
    resetPlayerIdleCountdown();
  }
  return Boolean(resolved);
}

function canUseAttackIntentWindow() {
  return canPlayerAct() && projectBattleFromUiState(state, "player").inAttackIntentWindow;
}

async function quickAttackOnlyTarget(attackerIndex) {
  if (!canPlayerAct()) return false;
  if (state.pendingTarget) {
    cue(targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect));
    resetPlayerIdleCountdown();
    return false;
  }
  if (!canUseAttackIntentWindow()) {
    cue("当前时点不能攻击。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  const attacker = state.player.field[attackerIndex];
  if (!attacker) return false;
  state.selected = { zone: "playerField", index: attackerIndex };
  clearBattlePreview();
  showDetail(attacker);
  const targets = projectBattleFromUiState(state, "player", { attackerIndex }).attackActions;
  if (targets.length !== 1) {
    render();
    cue(targets.length > 1 ? "有多个可攻击目标，请点选具体目标。" : "这只怪兽当前没有合法攻击目标。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  notePlayerIntent();
  if (!canUseBattleActions()) {
    if (state.phase === PHASES.main) {
      if (!enterPlayerBattlePhase("双击发起攻击", { preserveSelection: true, quiet: true })) return false;
    } else {
      cue("当前时点不能攻击。");
      resumePlayerIdleCountdownAfterPassiveIntent();
      return false;
    }
  }
  return queuePendingAttack(targets[0].targetIndex);
}

function handConfirmLabel(card) {
  if (!card) return "确认";
  if (card.type === "spell") {
    return spellNeedsManualTarget(state.player, card) ? "确认选目标" : "确认发动";
  }
  if (card.type === "monster") return "确认召唤";
  if (card.type === "trap") return "确认盖放";
  return "确认";
}

async function confirmSelectedHandAction() {
  if (state.pendingTarget) {
    resolvePendingSpellDefault();
    return;
  }
  const selected = selectedHandInfo();
  if (!selected) {
    cue("请先选择一张手牌。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!canUseHandCards(selected.card)) {
    cue(handTimingBlockReason(selected.card));
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  const action = handActionInfo(selected.card, selected.index);
  if (!action.ok) {
    cue(action.reason);
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (selected.card.type === "spell") {
    playSpell(state.player, state.ai, selected.index);
    return;
  }
  if (selected.card.type === "monster") {
    const empty = state.player.field.findIndex((slot) => !slot);
    if (empty < 0) {
      cue("召唤区已满。");
      resumePlayerIdleCountdownAfterPassiveIntent();
      return;
    }
    await handlePlayerSlot(empty);
    return;
  }
  if (selected.card.type === "trap") {
    const empty = state.player.traps.findIndex((slot) => !slot);
    if (empty < 0) {
      cue("陷阱区已满。");
      resumePlayerIdleCountdownAfterPassiveIntent();
      return;
    }
    handlePlayerTrapSlot(empty);
  }
}

function cancelSelectedHandAction() {
  const hadPendingTarget = Boolean(state.pendingTarget);
  const selected = selectedHandInfo();
  if (!hadPendingTarget && !selected) {
    cue("当前没有选中的手牌。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  clearPendingTarget();
  state.selected = null;
  clearBattlePreview();
  playSound("click");
  cue(hadPendingTarget ? "已取消目标选择。" : "已取消选择。");
  render();
  resolvePlayerActionWindow(hadPendingTarget ? "取消目标选择" : "取消选择");
}

function selectPlayerMonster(index) {
  const card = state.player.field[index];
  if (!card) return;
  if (!canPlayerAct()) {
    showDetail(card);
    render();
    return;
  }
  const wasSelected = state.selected?.zone === "playerField" && state.selected.index === index;
  if (wasSelected && !state.pendingTarget && canUseAttackIntentWindow()) {
    quickAttackOnlyTarget(index);
    return;
  }
  if (state.pendingTarget) {
    resolvePendingSpellTarget("player", index);
    return;
  }
  notePlayerIntent();
  playSound("click");
  state.selected = { zone: "playerField", index };
  clearBattlePreview();
  showDetail(card);
  render();
  resumePlayerIdleCountdownAfterPassiveIntent();
}

async function handlePlayerSlot(index) {
  if (state.pendingTarget) {
    resolvePendingSpellTarget("player", index);
    return;
  }
  if (!canPlayerAct() || !state.selected) return;
  notePlayerIntent();
  if (state.selected.zone !== "hand") {
    selectPlayerMonster(index);
    return;
  }
  const handIndex = state.player.hand.findIndex((card) => card.uid === state.selected.uid);
  const card = state.player.hand[handIndex];
  if (!card) {
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!canUseHandCards(card)) {
    cue(handTimingBlockReason(card));
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (card.type === "spell") {
    playSpell(state.player, state.ai, handIndex);
    return;
  }
  if (card.type === "trap") {
    cue("陷阱卡需要盖放到陷阱区。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (state.player.normalSummonsUsed > 0 && state.player.extraSummon <= 0) {
    announce("本回合已经召唤过怪兽");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (state.player.field[index]) {
    announce("这个召唤区已经有怪兽");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  const summoned = await summonMonster(state.player, state.ai, handIndex, index);
  if (!summoned) {
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  state.selected = null;
  render("summon-player-" + index);
  resolvePlayerActionWindow("召唤完成");
}

function selectPendingTrapChoice(index) {
  const choice = state.pendingTrapChoice;
  if (!choice) return false;
  const nextChoice = selectTrapResponse(choice, index);
  if (!nextChoice) {
    const card = state.player.traps[index];
    if (card) showDetail(card);
    cue("请选择高亮的可发动陷阱，或点击不发动。");
    resetPlayerIdleCountdown();
    return true;
  }
  const card = state.player.traps[index];
  if (!card) return true;
  state.pendingTrapChoice = nextChoice;
  state.selected = null;
  clearBattlePreview();
  showDetail(card);
  updateTrapChoicePrompt();
  playSound("click");
  render();
  resetPlayerIdleCountdown();
  return true;
}

function activatePendingTrapChoice(index) {
  const choice = state.pendingTrapChoice;
  const nextChoice = selectTrapResponse(choice, index);
  if (!nextChoice || !pendingTrapChoiceResolver || !canActivateTrapResponse(nextChoice, state.player.traps)) return false;
  state.pendingTrapChoice = nextChoice;
  answerChain(true);
  return true;
}

function handlePlayerTrapSlot(index) {
  if (selectPendingTrapChoice(index)) return;
  const existing = state.player.traps[index];
  if (state.pendingTarget) {
    if (isPendingTrapTargetSlot("player", index)) {
      resolvePendingSpellTarget("player", index, "traps");
      return;
    }
    cue(targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect));
    return;
  }
  if (existing && (!canPlayerAct() || !state.selected || state.selected.zone !== "hand")) {
    state.selected = null;
    clearBattlePreview();
    showDetail(existing);
    render();
    if (canPlayerAct()) resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!canPlayerAct()) return;
  if (!state.selected || state.selected.zone !== "hand") {
    state.selected = null;
    clearBattlePreview();
    cue("请选择一张陷阱卡。");
    render();
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  notePlayerIntent();
  const handIndex = state.player.hand.findIndex((card) => card.uid === state.selected.uid);
  const card = state.player.hand[handIndex];
  if (!card || card.type !== "trap") {
    cue("请选择一张陷阱卡。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!canUseHandCards(card)) {
    cue("只能在主要阶段或战斗阶段盖放陷阱卡。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (existing) {
    cue("这个陷阱区已经有盖卡。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!setTrap(state.player, handIndex, index)) {
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  state.selected = null;
  render();
  resolvePlayerActionWindow("陷阱盖放完成");
}

function handleAiTrapSlot(index) {
  const card = state.ai.traps[index];
  if (state.pendingTarget) {
    resolvePendingSpellTarget("ai", index, "traps");
    return;
  }
  if (card) {
    state.selected = null;
    clearBattlePreview();
    showDetail({ ...card, name: "盖放的陷阱", text: "这张卡还没有被触发。" });
    render();
  }
}

async function handleAiSlot(index) {
  if (!canPlayerAct()) return;
  if (!state.ai.field[index]) return;
  notePlayerIntent();
  if (state.pendingTarget) {
    resolvePendingSpellTarget("ai", index);
    return;
  }
  if (!canUseBattleActions()) {
    if (state.phase === PHASES.main) {
      if (!enterPlayerBattlePhase("你发动攻击", { preserveSelection: true, quiet: true })) return;
    } else {
      cue("当前时点不能攻击。");
      resumePlayerIdleCountdownAfterPassiveIntent();
      return;
    }
  }
  if (!state.selected || state.selected.zone !== "playerField") {
    announce("先选择你场上的怪兽");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  await queuePendingAttack(index);
}

async function handleAiPanelAttack() {
  if (!canPlayerAct()) return;
  notePlayerIntent();
  if (state.pendingTarget) {
    cue(targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect));
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (!canUseBattleActions()) {
    if (state.phase === PHASES.main) {
      if (!enterPlayerBattlePhase("你发动攻击", { preserveSelection: true, quiet: true })) return;
    } else {
      cue("当前时点不能攻击。");
      resumePlayerIdleCountdownAfterPassiveIntent();
      return;
    }
  }
  if (!state.selected || state.selected.zone !== "playerField") {
    cue("先选择你场上的怪兽。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  await queuePendingAttack(-1);
}

async function summonMonster(owner, rival, handIndex, fieldIndex) {
  const card = owner.hand[handIndex];
  if (!card) return false;
  let summonEvents = [];
  try {
    summonEvents = dispatchSummonMonsterFromUiState(state, owner.owner, handIndex, fieldIndex);
  } catch (error) {
    cue(error.message || "怪兽召唤失败。");
    console.error(error);
    return false;
  }
  playSound("summon");
  animateAvatar(owner.owner, "cast");
  addLog(`${owner.owner === "player" ? "你" : "AI"} 召唤了 ${card.name}。`);
  speak(`${owner.owner === "player" ? "你召唤" : "对手召唤"}，${card.name}。`);
  if (card.stars >= 5) {
    showAce(card, owner.owner);
  } else {
    playDuelistLine(owner.owner, lineFor(owner.owner, "summon", card), false, "summon");
  }
  const summonedEvent = summonEvents.find((event) => event.type === "MONSTER_SUMMONED" && event.cardId === runtimeCardId(card));
  if (summonEvents.some((event) => event.type === "ABILITY_SPENT" && event.ability === "extraSummon")) {
    addLog(`${owner.owner === "player" ? "你" : "AI"} 使用了额外召唤机会。`);
  }
  if (!summonedEvent) {
    cue("召唤事件缺失，已中断后续响应结算。");
    return true;
  }
  if (!openTrapResponseWindow(rival.owner, {
    timing: "summon",
    resumeTiming: "mainOpen",
    prompt: "summon",
    triggerEventId: summonedEvent.id,
    context: {
      summonedPlayerId: owner.owner,
      summonedCardId: runtimeCardId(card)
    }
  })) return true;
  await triggerTrap(rival, owner, "summon", {
    summoned: card,
    targetEffectId: summonedEvent.id,
    engineResponse: true
  });
  if (state.gameOver) return true;
  if (card.onSummon) {
    if (canDispatchSummonEffectFromUiState(card)) {
      resolveEngineSpellFeedback(owner, rival, card, summonEvents);
    } else {
      reportMissingEngineEffect(card, "summon");
    }
  }
  resolveElementCombos(owner, rival, "summon");
  checkGameOver();
  return true;
}

function setTrap(owner, handIndex, trapIndex) {
  const card = owner.hand[handIndex];
  if (!card) return false;
  try {
    dispatchSetTrapFromUiState(state, owner.owner, handIndex, trapIndex);
  } catch (error) {
    cue(error.message || "陷阱卡盖放失败。");
    console.error(error);
    return false;
  }
  playSound("trap");
  addLog(owner.owner === "player"
    ? `你盖放了陷阱卡 ${card.name}。`
    : "AI 盖放了 1 张陷阱卡。");
  speak(owner.owner === "player" ? "陷阱卡盖放。" : "对手盖放了一张陷阱卡。");
  resolveElementCombos(owner, owner.owner === "player" ? state.ai : state.player, "trap");
  return true;
}

function reportMissingEngineEffect(card, kind) {
  const message = `${card?.name || "Unknown card"} ${kind} effect is not registered in GameEngine.`;
  state.ruleCheckIssue = message;
  addLog(message);
  cue("Rule setup error: card effect is missing from GameEngine.");
  console.error(message);
}

const spellEffects = spellDefinitions;

function playSpell(owner, rival, handIndex, targetInfo = null) {
  const selectedCard = owner.hand[handIndex];
  if (!selectedCard) {
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  if (owner.owner === "player" && ![PHASES.main, PHASES.battle].includes(state.phase)) {
    cue("当前阶段不能发动魔法卡。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  if (owner.owner === "player" && !targetInfo && !canUseHandCards(selectedCard)) {
    cue("当前时点不能发动手牌。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  const card = selectedCard;
  if (!canDispatchSpellFromUiState(card)) {
    reportMissingEngineEffect(card, "spell");
    if (owner.owner === "player") {
      cue("Rule setup error: spell effect is missing from GameEngine.");
      resumePlayerIdleCountdownAfterPassiveIntent();
    }
    return false;
  }
  const validation = validateSpell(owner, rival, card, handIndex);
  if (!validation.ok) {
    if (owner.owner === "player") cue(validation.reason);
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  if (spellNeedsManualTarget(owner, selectedCard) && !targetInfo) {
    beginSpellTargetSelection(handIndex, selectedCard);
    return false;
  }
  let engineEvents = [];
  let result = {};
  try {
    engineEvents = dispatchActivateSpellFromUiState(state, owner.owner, rival.owner, handIndex, targetInfo);
  } catch (error) {
    if (owner.owner === "player") cue(error.message || "\u9b54\u6cd5\u5361\u53d1\u52a8\u5931\u8d25\u3002");
    console.error(error);
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  playSound(`spell-${card.effect}`);
  animateAvatar(owner.owner, "cast");
  playCenterCardEffect(card, spellCaption(card));
  playEpicAction("\u9b54\u6cd5", "draw");
  addLog(`${owner.owner === "player" ? "\u4f60" : "AI"} \u53d1\u52a8\u9b54\u6cd5\u5361 ${card.name}\u3002`);
  speak(`${owner.owner === "player" ? "\u4f60\u53d1\u52a8" : "\u5bf9\u624b\u53d1\u52a8"}\u9b54\u6cd5\u5361\uff0c${card.name}\u3002`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "spell", card), false, "spell");
  result = resolveEngineSpellFeedback(owner, rival, card, engineEvents, targetInfo);
  playSpellEffect(owner, rival, card, result.effectTarget || null, result.targetOwner || targetInfo?.owner || owner.owner);
  resolveElementCombos(owner, rival, "spell");
  clearPendingTarget();
  state.selected = null;
  checkGameOver();
  render();
  if (owner.owner === "player" && !state.gameOver) {
    resolvePlayerActionWindow("魔法结算完成");
  }
  return true;
}

function runtimeCardId(card) {
  return card?.uid || card?.engineId || card?.id || null;
}

function findRuntimeCard(cardId) {
  for (const duelist of [state.player, state.ai]) {
    for (const zoneName of ["hand", "deck", "field", "traps", "grave"]) {
      const card = duelist[zoneName].find((item) => runtimeCardId(item) === cardId);
      if (card) return { card, owner: duelist.owner };
    }
  }
  return null;
}

function statLabel(stat) {
  if (stat === "def" || stat === "tempDef") return "防御力";
  return "攻击力";
}

function statChangeText(event) {
  const amount = Number(event.amount) || 0;
  const direction = amount >= 0 ? "提升" : "下降";
  return `${statLabel(event.stat)}${direction} ${Math.abs(amount)}`;
}

function resolveEngineSpellFeedback(owner, rival, card, events, targetInfo = null) {
  const result = {
    effectTarget: targetInfo?.card || null,
    targetOwner: targetInfo?.owner || owner.owner
  };
  let totalDamageDealt = 0;
  let statModifiedCount = 0;
  events.forEach((event) => {
    if (event.type === "CARD_MOVED" && event.from?.zone === "grave" && event.to?.zone === "deck") {
      const found = findRuntimeCard(event.cardId);
      const movedName = found?.card?.name || "墓地卡";
      addLog(`${movedName} 因 ${card.name} 回到卡组顶。`);
    }
    if (event.type === "CARDS_DRAWN" && event.count > 0) {
      const drawn = (event.cardIds || []).map((cardId) => findRuntimeCard(cardId)?.card).filter(Boolean);
      drawn.forEach((drawnCard, index) => {
        window.setTimeout(() => {
          playSound("draw");
          playDrawEffect(owner.owner, drawnCard);
        }, index * 760);
      });
      addLog(`${owner.owner === "player" ? "你" : "AI"} 抽了 ${event.count} 张卡。`);
      playVoice(owner.owner, "draw", owner.owner === "player" ? `抽 ${event.count} 张卡。` : `对手抽 ${event.count} 张卡。`);
    }
    if (event.type === "LP_HEALED" && event.amount > 0) {
      playSound("spell-heal700");
      playLifeDelta(owner.owner, event.amount);
      addLog(`${card.name} 为 ${duelistLabel(owner)}回复 ${event.amount} 点生命值。`);
    }
    if (event.type === "SHIELD_GAINED" && event.amount > 0) {
      const target = event.playerId === owner.owner ? owner : rival;
      result.targetOwner = target.owner;
      playSound("guard");
      playEpicAction("护盾", "guard");
      playGuardShield(panelElement(target.owner));
      playVoice(target.owner, "shield", "护盾展开。");
      addLog(`${target.owner === "player" ? "你" : "AI"} 获得 ${event.amount} 点护盾（${card.name}）。`);
    }
    if (event.type === "DAMAGE_DEALT") {
      const target = event.playerId === owner.owner ? owner : rival;
      const blocked = Math.max(0, Number(event.blocked) || 0);
      const dealt = Math.max(0, Number(event.amount) || 0);
      result.targetOwner = target.owner;
      if (blocked > 0) {
        playSound("guard");
        playGuardShield(panelElement(target.owner));
        addLog(`${target.owner === "player" ? "你的" : "AI 的"}护盾吸收了 ${blocked} 点伤害。`);
      }
      if (dealt > 0) {
        totalDamageDealt += dealt;
        playSound("damage");
        playLifeDelta(target.owner, -dealt);
        animateAvatar(target.owner, "hit");
        addLog(`${card.name} 对 ${duelistLabel(target)}造成 ${dealt} 点伤害。`);
      } else if (blocked > 0) {
        addLog(`${card.name} 的伤害被护盾完全抵消。`);
      }
    }
    if (event.type === "STAT_MODIFIED") {
      const found = findRuntimeCard(event.cardId);
      if (!found) return;
      result.effectTarget = found.card;
      result.targetOwner = found.owner;
      statModifiedCount += 1;
      addLog(`${found.card.name} 因 ${card.name} ${statChangeText(event)}。`);
    }
    if (event.type === "CONTINUOUS_EFFECT_REGISTERED") {
      const found = findRuntimeCard(event.targetCardId);
      if (found) {
        result.effectTarget = found.card;
        result.targetOwner = found.owner;
        addLog(`${card.name} 装备给 ${found.card.name}，持续效果已登记。`);
        playEpicAction("装备", "guard");
      }
    }
    if (event.type === "CONTINUOUS_EFFECT_RELEASED") {
      const source = findRuntimeCard(event.sourceCardId);
      const target = findRuntimeCard(event.targetCardId);
      const sourceName = source?.card?.name || "装备卡";
      const targetText = target?.card?.name ? `，${target.card.name} 失去持续加成` : "";
      if (target?.card) {
        result.effectTarget = target.card;
        result.targetOwner = target.owner;
      }
      addLog(`${sourceName} 的装备持续效果失效${targetText}。`);
      playEpicAction("装备失效", "draw");
    }
    if (event.type === "CARD_DESTROYED" && event.cardId !== runtimeCardId(card)) {
      const destroyed = findRuntimeCard(event.cardId);
      const destroyedName = destroyed?.card?.name || "目标卡";
      result.effectTarget = destroyed?.card || result.effectTarget;
      result.targetOwner = destroyed?.owner || result.targetOwner;
      addLog(`${card.name} 破坏了 ${destroyedName}。`);
    }
    if (event.type === "MONSTER_READIED") {
      const found = findRuntimeCard(event.cardId);
      if (!found) return;
      result.effectTarget = found.card;
      result.targetOwner = found.owner;
      addLog(`${found.card.name} 重新进入可攻击状态。`);
      playEpicAction("再攻", "attack");
    }
    if (event.type === "ABILITY_GRANTED" && event.ability === "directAttack") {
      const target = owner.field.find((item) => item && !item.used && item.mode !== "defense") || strongestMonster(owner);
      result.effectTarget = target;
      result.targetOwner = owner.owner;
      addLog(`${duelistLabel(owner)}获得 ${event.uses || 1} 次直接攻击许可。`);
      playEpicAction("直击许可", "attack");
    }
    if (event.type === "ABILITY_GRANTED" && event.ability === "extraSummon") {
      result.targetOwner = owner.owner;
      addLog(`${duelistLabel(owner)}本回合获得 ${event.uses || 1} 次额外通常召唤。`);
      playEpicAction("额外召唤", "draw");
    }
    if (event.type === "ABILITY_GRANTED" && event.ability === "attackReset") {
      result.targetOwner = owner.owner;
      addLog(`${duelistLabel(owner)}获得 ${event.uses || 1} 次攻击重置。`);
      playEpicAction("攻击重置", "attack");
    }
  });
  if (card.effect === "fireWindCombo" && statModifiedCount > 0) {
    playEpicAction("炎岚", "attack");
    addLog(`${card.name} 造成 ${totalDamageDealt} 点伤害，并强化我方全体怪兽。`);
  }
  return result;
}

function validateSpell(owner, rival, card, handIndex) {
  if (!card || card.type !== "spell") return { ok: false, reason: "请选择魔法卡。" };
  const effect = spellEffects[card.effect];
  if (!effect) return { ok: false, reason: "这个魔法效果还没有实现。" };
  const condition = validateSpellCondition(card.effect, { owner, rival, card, handIndex });
  if (!condition.ok) return condition;
  const engineLegality = explainActivateSpellFromUiState(state, owner.owner, rival.owner, handIndex);
  if (!engineLegality.ok) return { ok: false, reason: engineLegality.reason };
  return condition;
}

function spellCaption(card) {
  if (spellEffects[card.effect]?.caption) return spellEffects[card.effect].caption;
  return card.text || "魔法发动";
}

function trapCandidates(owner, eventName, context) {
  return owner.traps
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => trapCanResolve(card, eventName, { owner, context }));
}

async function chooseTrapIndex(owner, rival, eventName, context) {
  const candidates = trapCandidates(owner, eventName, context);
  if (candidates.length === 0) return { trapIndex: -1, candidates, declined: false };
  if (owner.owner !== "player") {
    return { trapIndex: candidates[0].index, candidates, declined: false };
  }
  const choice = await promptTrapChoice(candidates, eventName, { owner, rival, context });
  return { ...choice, candidates, declined: choice.trapIndex < 0 };
}

function announceTrapActivation(owner, trap, chainIndex) {
  const chainLabel = chainIndex > 1 ? `连锁 ${chainIndex}` : "陷阱";
  playSound(`trap-${trap.trigger}`);
  animateAvatar(owner.owner, "cast");
  playCenterCardEffect(trap, chainIndex > 1 ? `陷阱连锁 ${chainIndex}` : "陷阱连锁发动");
  playEpicAction(chainLabel, "guard");
  addLog(`${chainLabel}：${owner.owner === "player" ? "你的" : "AI 的"}陷阱卡 ${trap.name} 触发。`);
  speak(`陷阱发动，${trap.name}。`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "trap", trap), false, "trap");
}

function queueTrapChainLink(owner, rival, eventName, context, trapIndex, chainIndex) {
  const trap = owner.traps[trapIndex];
  if (!trap) return null;
  const trapSource = trapElement(owner.owner, trapIndex) || panelElement(owner.owner);
  try {
    const events = dispatchQueueTrapResponseFromUiState(state, owner.owner, rival.owner, trapIndex, {
      ...context,
      targetEffectId: context.targetEffectId || `${trap.uid || trap.id}:${eventName}`
    });
    announceTrapActivation(owner, trap, chainIndex);
    return { owner, rival, eventName, context: { ...context }, trap, trapIndex, trapSource, chainIndex, events };
  } catch (error) {
    cue(error.message || "陷阱卡加入连锁失败。");
    console.error(error);
    return null;
  }
}

function eventsForTrap(events, trap) {
  const cardId = runtimeCardId(trap);
  return events.filter((event) =>
    event.sourceCardId === cardId ||
    event.cardId === cardId ||
    (event.type === "EFFECT_NEGATED" && event.sourceCardId === cardId)
  );
}

async function resolveEngineTrapChain(owner, rival, eventName, context, trapIndex) {
  const links = [];
  const firstLink = queueTrapChainLink(owner, rival, eventName, context, trapIndex, 1);
  if (!firstLink) return { cancelled: false, shielded: false, consumesAttack: false, activated: 0 };
  links.push(firstLink);

  let priorityHolder = owner;
  let responder = rival;
  let sourceTrap = firstLink.trap;
  let resolutionPlayerId = owner.owner;

  for (let chainIndex = 2; chainIndex <= 8; chainIndex += 1) {
    try {
      dispatchPassResponsePriorityFromUiState(state, priorityHolder.owner, responder.owner);
    } catch (error) {
      cue(error.message || "连锁响应权转移失败。");
      console.error(error);
      break;
    }
    resolutionPlayerId = responder.owner;
    const chainContext = {
      ...context,
      engineResponse: true,
      sourceTrap,
      targetEffectId: runtimeCardId(sourceTrap)
    };
    const choice = await chooseTrapIndex(responder, priorityHolder, "chain", chainContext);
    if (choice.trapIndex < 0) {
      if (choice.declined) {
        addLog(choice.skippedName ? `你没有发动 ${choice.skippedName}。` : "你没有追加陷阱连锁。");
      }
      break;
    }
    if (responder.owner === "ai") {
      addLog(`AI 检测到 ${sourceTrap.name}，准备追加陷阱连锁。`);
      await sleep(620);
    }
    const nextLink = queueTrapChainLink(responder, priorityHolder, "chain", chainContext, choice.trapIndex, chainIndex);
    if (!nextLink) break;
    links.push(nextLink);
    sourceTrap = nextLink.trap;
    const previousHolder = priorityHolder;
    priorityHolder = responder;
    responder = previousHolder;
    resolutionPlayerId = priorityHolder.owner;
  }

  let resolutionEvents = [];
  try {
    resolutionEvents = dispatchResolveChainFromUiState(state, resolutionPlayerId);
  } catch (error) {
    cue(error.message || "陷阱连锁结算失败。");
    console.error(error);
    return { cancelled: false, shielded: false, consumesAttack: false, activated: links.length };
  }

  let originalOutcome = { cancelled: false, shielded: false, consumesAttack: false };
  for (const link of links.slice().reverse()) {
    await sleep(320);
    const outcome = resolveTrapCard(
      link.owner,
      link.rival,
      link.eventName,
      link.context,
      link.trapIndex,
      link.chainIndex,
      {
        trap: link.trap,
        trapSource: link.trapSource,
        events: eventsForTrap(resolutionEvents, link.trap),
        announced: true
      }
    );
    if (link === firstLink) originalOutcome = outcome;
  }

  return { ...originalOutcome, activated: links.length };
}

async function triggerTrap(owner, rival, eventName, context) {
  const result = { cancelled: false, shielded: false, consumesAttack: false, activated: 0 };
  if (state.gameOver) return result;
  const engineResponse = Boolean(context?.engineResponse);
  const choice = await chooseTrapIndex(owner, rival, eventName, context);
  if (choice.trapIndex < 0) {
    if (choice.declined) {
      addLog(choice.skippedName ? `你没有发动 ${choice.skippedName}。` : "你没有发动陷阱。");
    }
    if (engineResponse && !closeTrapResponseWindow(owner.owner, choice.declined ? "declined" : "no-legal-trap")) {
      result.cancelled = true;
    }
    return result;
  }

  const outcome = engineResponse
    ? await resolveEngineTrapChain(owner, rival, eventName, context, choice.trapIndex)
    : resolveTrapCard(owner, rival, eventName, context, choice.trapIndex, 1);
  result.activated = outcome.activated || 1;
  result.cancelled = Boolean(outcome.cancelled);
  result.shielded = Boolean(outcome.shielded);
  result.consumesAttack = Boolean(outcome.consumesAttack);
  checkGameOver();
  return result;
}

function openTrapResponseWindow(playerId, options) {
  try {
    dispatchOpenResponseWindowFromUiState(state, playerId, options);
    return true;
  } catch (error) {
    cue(error.message || "陷阱响应窗口打开失败。");
    console.error(error);
    return false;
  }
}

function closeTrapResponseWindow(playerId, reason) {
  try {
    dispatchCloseResponseWindowFromUiState(state, playerId, reason);
    return true;
  } catch (error) {
    cue(error.message || "攻击响应窗口关闭失败。");
    console.error(error);
    return false;
  }
}

function pendingTrapChoiceDetailsText(choice = state.pendingTrapChoice) {
  if (!choice) return "";
  const selectedCard = state.player.traps[choice.selectedIndex];
  if (selectedCard) {
    return trapActivationText(selectedCard, choice.eventName, choice.details);
  }
  const firstCard = state.player.traps[choice.trapIndexes[0]];
  const eventText = firstCard
    ? trapActivationText(firstCard, choice.eventName, choice.details).split("是否连锁发动")[0]
    : "";
  const names = choice.trapIndexes
    .map((index) => state.player.traps[index]?.name)
    .filter(Boolean)
    .join("、");
  return `${eventText}可发动陷阱：${names}。单击响应卡选择，双击可直接发动；本事件只能发动一张。`;
}

function renderTrapChoiceOptions(choice = state.pendingTrapChoice) {
  if (!els.chainChoices) return;
  els.chainChoices.replaceChildren();
  if (!choice?.trapIndexes?.length) {
    els.chainChoices.hidden = true;
    return;
  }
  els.chainChoices.hidden = false;
  choice.trapIndexes.forEach((trapIndex) => {
    const card = state.player.traps[trapIndex];
    if (!card) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trap-choice-card";
    button.dataset.trapChoiceIndex = String(trapIndex);
    button.dataset.cardId = card.id;
    button.classList.toggle("selected", choice.selectedIndex === trapIndex);

    const icon = document.createElement("span");
    icon.className = "trap-choice-icon";
    icon.textContent = card.icon || "陷";

    const body = document.createElement("span");
    body.className = "trap-choice-body";

    const name = document.createElement("strong");
    name.textContent = card.name;

    const text = document.createElement("span");
    text.textContent = card.text || "满足当前事件，可以发动。";

    body.appendChild(name);
    body.appendChild(text);
    button.appendChild(icon);
    button.appendChild(body);
    button.addEventListener("click", () => selectPendingTrapChoice(trapIndex));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      activatePendingTrapChoice(trapIndex);
    });
    els.chainChoices.appendChild(button);
  });
}

function clearTrapChoiceOptions() {
  if (!els.chainChoices) return;
  els.chainChoices.replaceChildren();
  els.chainChoices.hidden = true;
}

function updateTrapChoicePrompt() {
  if (!state.pendingTrapChoice) return;
  els.chainText.textContent = pendingTrapChoiceDetailsText();
  renderTrapChoiceOptions();
  const selectedCard = state.player.traps[state.pendingTrapChoice.selectedIndex];
  if (els.chainStatus) {
    els.chainStatus.textContent = selectedCard
      ? `已选择：${selectedCard.name}`
      : `可响应 ${state.pendingTrapChoice.trapIndexes.length} 张 · 本事件限发动 1 张`;
  }
  els.chainYes.textContent = selectedCard ? `发动 ${selectedCard.name}` : "发动陷阱";
  els.chainYes.disabled = !canActivateTrapResponse(state.pendingTrapChoice, state.player.traps);
}

function closeTrapChoicePrompt() {
  els.chainModal.classList.remove("show");
  state.pendingTrapChoice = null;
  pendingTrapChoiceResolver = null;
  clearTrapChoiceOptions();
  if (els.chainStatus) els.chainStatus.textContent = "";
  els.chainYes.disabled = false;
  els.chainYes.textContent = "发动陷阱";
}

function resolveTrapCard(owner, rival, eventName, context, trapIndex, chainIndex = 1, options = {}) {
  const trap = options.trap || owner.traps[trapIndex];
  if (!trap) return { cancelled: false, shielded: false };
  const trapSource = options.trapSource || trapElement(owner.owner, trapIndex) || panelElement(owner.owner);
  let trapEvents = Array.isArray(options.events) ? options.events : [];
  if (!Array.isArray(options.events) && canDispatchTrapFromUiState(trap)) {
    try {
      const dispatchTrap = context.engineResponse
        ? dispatchTrapResponseFromUiState
        : dispatchActivateTrapFromUiState;
      trapEvents = dispatchTrap(state, owner.owner, rival.owner, trapIndex, {
        ...context,
        targetEffectId: context.targetEffectId || `${trap.uid || trap.id}:${eventName}`
      });
    } catch (error) {
      cue(error.message || "陷阱卡发动失败。");
      console.error(error);
      return { cancelled: false, shielded: false };
    }
  } else {
    if (!Array.isArray(options.events)) {
      reportMissingEngineEffect(trap, "trap");
      return { cancelled: false, shielded: false };
    }
  }
  if (!options.announced) announceTrapActivation(owner, trap, chainIndex);
  const skippedEvent = trapEvents.find((event) =>
    event.type === "EFFECT_SKIPPED" && event.cardId === runtimeCardId(trap) && event.reason === "negated"
  );
  if (skippedEvent) {
    playSound("guard");
    playEpicAction("连锁无效", "guard");
    addLog(`${trap.name} 的效果被连锁无效。`);
    speak(`${trap.name}，效果无效。`);
    return { cancelled: false, shielded: false, negated: true };
  }
  resolveEngineSpellFeedback(owner, rival, trap, trapEvents);

  if (trap.trigger === "chainNegate") {
    const sourceTrap = context.sourceTrap;
    playArrow(trapSource, panelElement(rival.owner), "trap", trap.name);
    playEpicAction("断链", "guard");
    addLog(`${trap.name} 无效了${sourceTrap?.name ? ` ${sourceTrap.name}` : "上一张陷阱"}的效果。`);
    speak(`${trap.name}，连锁无效。`);
    return { cancelled: false, shielded: false };
  }

  if (trap.trigger === "attackDestroy") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    const destroyedEvent = trapEvents.find((event) => event.type === "CARD_DESTROYED");
    const attacker = destroyedEvent ? findRuntimeCard(destroyedEvent.cardId)?.card : context.attacker;
    if (attacker) {
      playMonsterBurst(attackerEl);
      shakeScreen();
      playEpicAction("反制", "guard");
      addLog(`${trap.name} 破坏了 ${attacker.name}。`);
    }
    return { cancelled: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "counterBoost") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const statEvent = trapEvents.find((event) => event.type === "STAT_MODIFIED");
    const target = statEvent ? findRuntimeCard(statEvent.cardId)?.card : weakestMonster(owner);
    const targetIndex = owner.field.indexOf(target);
    const targetEl = fieldElement(owner.owner, targetIndex) || panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (target) {
      playGuardShield(targetEl);
    }
    playEpicAction("反击阵", "guard");
    addLog(`${trap.name} 取消了攻击，并强化了防线。攻击机会已消耗。`);
    speak(`${trap.name} 取消攻击，强化怪兽。`);
    return { cancelled: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "attackShift") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const shieldTarget = context.targetIndex >= 0
      ? fieldElement(owner.owner, context.targetIndex) || panelElement(owner.owner)
      : panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playGuardShield(shieldTarget);
    playEpicAction("转移", "guard");
    addLog(`${trap.name} 转移了攻击，获得 400 护盾。攻击机会已消耗。`);
    speak(`${trap.name} 转移攻击，护盾展开。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "attackNegate") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const targetEl = context.targetIndex >= 0
      ? fieldElement(owner.owner, context.targetIndex) || panelElement(owner.owner)
      : panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playGuardShield(targetEl);
    playEpicAction("无效", "guard");
    addLog(`${trap.name} 无效了本次攻击。攻击机会已消耗。`);
    speak(`${trap.name} 无效攻击。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "redirectAttack") {
    const redirectIndex = selectRedirectTarget(owner.field, context.targetIndex);
    const redirectTarget = owner.field[redirectIndex];
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const redirectEl = fieldElement(owner.owner, redirectIndex) || panelElement(owner.owner);
    const originalEl = context.targetIndex >= 0
      ? fieldElement(owner.owner, context.targetIndex) || panelElement(owner.owner)
      : panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playArrow(originalEl, redirectEl, "trap", "改目标");
    if (redirectTarget) {
      context.targetIndex = redirectIndex;
      playGuardShield(redirectEl);
      playMonsterMotion(owner.owner, redirectIndex, "stand");
      playEpicAction("换位", "guard");
      addLog(`${trap.name} 将攻击目标改为 ${redirectTarget.name}。`);
      speak(`${trap.name} 改变攻击目标。`);
    }
    return { cancelled: false, redirected: Boolean(redirectTarget), targetIndex: context.targetIndex };
  }

  if (trap.trigger === "weakenAttack") {
    const statEvent = trapEvents.find((event) => event.type === "STAT_MODIFIED");
    const attacker = statEvent ? findRuntimeCard(statEvent.cardId)?.card : rival.field[context.attackerIndex];
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (attacker) {
      playGuardShield(attackerEl);
      playEpicAction("弱化", "guard");
      addLog(`${trap.name} 削弱了 ${attacker.name}，攻击继续结算。`);
      speak(`${trap.name} 削弱攻击怪兽，攻击继续。`);
    }
    return { cancelled: false };
  }

  if (trap.trigger === "directShield") {
    const shieldTarget = panelElement(owner.owner);
    playArrow(trapSource, shieldTarget, "trap", trap.name);
    playSound("guard");
    playGuardShield(shieldTarget);
    playEpicAction("防御", "guard");
    addLog(`${trap.name} 让直接攻击伤害变为 0。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "directRebound") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const shieldTarget = panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playSound("guard");
    playGuardShield(shieldTarget);
    animateAvatar(rival.owner, "hit");
    shakeScreen();
    playEpicAction("反弹", "guard");
    addLog(`${trap.name} 让直接攻击伤害变为 0，并反弹 500 点伤害。`);
    speak(`${trap.name} 反弹了直接攻击。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "summonBurn") {
    playArrow(trapSource, panelElement(rival.owner), "trap", trap.name);
    animateAvatar(rival.owner, "hit");
    shakeScreen();
    playEpicAction("灼烧", "attack");
    addLog(`${trap.name} 对召唤者造成 400 点伤害。`);
  }

  return { cancelled: false };
}

function playBattleDamageFeedback(events, duelist) {
  let total = 0;
  events
    .filter((event) => event.type === "DAMAGE_DEALT" && event.playerId === duelist.owner)
    .forEach((event) => {
      const blocked = Math.max(0, Number(event.blocked) || 0);
      const dealt = Math.max(0, Number(event.amount) || 0);
      if (blocked > 0) {
        playSound("guard");
        playGuardShield(panelElement(duelist.owner));
        addLog(`${duelist.owner === "player" ? "你的" : "AI 的"}护盾吸收了 ${blocked} 点伤害。`);
      }
      if (dealt > 0) {
        total += dealt;
        playSound("damage");
        playLifeDelta(duelist.owner, -dealt);
      }
    });
  return total;
}

function resolveAfterAttackBattleFeedback(owner, attacker, events) {
  const attackerId = runtimeCardId(attacker);
  if (!attackerId) return;
  if (events.some((event) =>
    event.type === "ABILITY_SPENT" &&
    event.playerId === owner.owner &&
    event.ability === "directAttack"
  )) {
    addLog(`${duelistLabel(owner)}消耗 1 次直接攻击许可。`);
  }
  const growEvent = events.find((event) =>
    event.type === "STAT_MODIFIED" &&
    event.sourceCardId === attackerId &&
    event.cardId === attackerId &&
    event.stat === "tempAtk" &&
    event.amount > 0
  );
  if (growEvent) {
    addLog(`${attacker.name} 吞噬影子，攻击力提升 ${growEvent.amount}。`);
  }
  const wearEvent = events.find((event) => event.type === "BATTLE_WEAR_APPLIED");
  if (wearEvent) {
    const found = findRuntimeCard(wearEvent.cardId);
    if (found?.card) {
      playEpicAction("损耗", "guard", 900);
      addLog(`${found.card.name} 承受冲击产生 ${wearEvent.amount} 点战斗损耗，攻击力和守备力下降。`);
      speak(`${found.card.name} 承受冲击，战斗力下降。`);
    }
  }
  const drawEvent = events.find((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === attackerId);
  if (drawEvent?.count > 0) {
    const drawn = (drawEvent.cardIds || []).map((cardId) => findRuntimeCard(cardId)?.card).filter(Boolean);
    drawn.forEach((drawnCard, index) => {
      window.setTimeout(() => {
        playSound("draw");
        playDrawEffect(owner.owner, drawnCard);
      }, index * 760);
    });
    playEpicAction("追风", "draw");
    addLog(`${attacker.name} 追风突袭，攻击后抽 ${drawEvent.count} 张卡。`);
    speak(`${attacker.name} 的追风效果发动，抽一张卡。`);
  }
}

function declareAttackWithEngine(owner, rival, attackerIndex, targetIndex) {
  try {
    return dispatchDeclareAttackFromUiState(state, owner.owner, rival.owner, attackerIndex, targetIndex);
  } catch (error) {
    cue(error.message || "攻击宣言失败。");
    console.error(error);
    return null;
  }
}

function resolveBattleWithEngine(owner, rival, attackerIndex, targetIndex, options = {}) {
  try {
    return dispatchResolveBattleFromUiState(state, owner.owner, rival.owner, attackerIndex, targetIndex, options);
  } catch (error) {
    cue(error.message || "战斗结算失败。");
    console.error(error);
    return null;
  }
}

function consumeCancelledAttackWithEngine(owner, attacker, options = {}) {
  try {
    if (!currentEngineMachine()?.pendingAttack) {
      return true;
    }
    const events = dispatchCancelAttackFromUiState(state, owner.owner, {
      declarationEventId: options.declarationEventId,
      consumeAttack: Boolean(options.consumeAttack),
      reason: options.reason || "trap-canceled"
    });
    playAttackResetFeedback(owner, attacker, events);
    return true;
  } catch (error) {
    cue(error.message || "攻击取消结算失败。");
    console.error(error);
    return false;
  }
}

function playAttackResetFeedback(owner, attacker, events = []) {
  if (!events.some((event) => event.type === "MONSTER_READIED" && event.cardId === runtimeCardId(attacker))) {
    return false;
  }
  playEpicAction("再攻", "attack");
  addLog(`${attacker.name} 消耗攻击重置，再次进入可攻击状态。`);
  speak(`${attacker.name} 攻击重置，可以再次攻击。`, false, owner.owner);
  return true;
}

async function attack(owner, rival, attackerIndex, targetIndex) {
  state.ruleCheckIssue = null;
  const attacker = owner.field[attackerIndex];
  if (!attacker || attacker.used) return;
  const engineLegality = explainDeclareAttackFromUiState(state, owner.owner, rival.owner, attackerIndex, targetIndex);
  if (!engineLegality.ok) {
    if (owner.owner === "player") {
      cue(engineLegality.reason);
    }
    addLog(`${duelistLabel(owner)}的攻击被引擎拦截：${engineLegality.reason}`);
    return false;
  }
  const impactBefore = attackImpactSnapshot(owner, rival);
  const attackContext = { attackerIndex, targetIndex, engineResponse: true };
  const declarationEvents = declareAttackWithEngine(owner, rival, attackerIndex, targetIndex);
  if (!declarationEvents) return false;
  const attackEvent = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  if (attackEvent) {
    attackContext.targetEffectId = attackEvent.id;
    attackContext.attackerCardId = attackEvent.attackerCardId;
  }
  const trapResult = await triggerTrap(rival, owner, "attack", attackContext);
  if (trapResult.cancelled) {
    if (!consumeCancelledAttackWithEngine(owner, attacker, {
      declarationEventId: attackContext.targetEffectId,
      consumeAttack: trapResult.consumesAttack,
      reason: "attack-trap"
    })) return false;
    checkGameOver();
    return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的攻击`);
  }
  const resolvedTargetIndex = attackContext.targetIndex;
  const target = rival.field[resolvedTargetIndex];
  const fromEl = fieldElement(owner.owner, attackerIndex);
  const toEl = fieldElement(rival.owner, resolvedTargetIndex) || panelElement(rival.owner);
  if (attacker.stars >= 5) {
    playSound("ace");
    playAceStrike(attacker, owner.owner, target);
    playEpicAction("王牌攻势", "attack", 1300);
    await sleep(360);
  }
  playSound("attack-charge");
  playAttackCloseup(attacker, target, owner.owner, rival.owner);
  playEpicAction("攻击宣言", "attack", 1260);
  playDuelistLine(owner.owner, lineFor(owner.owner, "attack", attacker), false, "attack");
  await sleep(520);
  playSound("attack");
  animateAvatar(owner.owner, "attack");
  playMonsterMotion(owner.owner, attackerIndex, "attack");
  playMonsterPhantom(attacker, fromEl, toEl);
  if (target) {
    playMonsterMotion(rival.owner, resolvedTargetIndex, target.mode === "defense" ? "guard" : "stand");
    playMonsterCounterPhantom(target, toEl, fromEl);
  }
  playSlashBurst(fromEl, toEl);
  playEpicAction("冲击", "attack", 900);
  playAttackCutIn(attacker, target, owner.owner, rival.owner);
  await sleep(620);

  const outcome = target ? describeBattleOutcome(attacker, target, owner, rival) : null;
  let battleEvents = [];

  if (!target) {
    if (!openTrapResponseWindow(rival.owner, {
      timing: "damageStep",
      resumeTiming: "damageStep",
      prompt: "direct",
      triggerEventId: attackContext.targetEffectId,
      context: {
        attackerPlayerId: owner.owner,
        attackerCardId: runtimeCardId(attacker),
        targetPlayerId: rival.owner,
        direct: true
      }
    })) return false;
    const shield = await triggerTrap(rival, owner, "direct", {
      attackerIndex,
      targetIndex: resolvedTargetIndex,
      targetEffectId: attackContext.targetEffectId,
      engineResponse: true
    });
    if (shield.cancelled) {
      if (!consumeCancelledAttackWithEngine(owner, attacker, {
        declarationEventId: attackContext.targetEffectId,
        consumeAttack: shield.consumesAttack,
        reason: "direct-trap"
      })) return false;
      checkGameOver();
      return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的直接攻击`);
    }
    battleEvents = resolveBattleWithEngine(owner, rival, attackerIndex, resolvedTargetIndex, {
      declarationEventId: attackContext.targetEffectId
    });
    if (!battleEvents) return false;
    playSound("attack-impact");
    playImpactExplosion(toEl);
    const dealt = playBattleDamageFeedback(battleEvents, rival);
    playSound("attack-direct");
    animateAvatar(rival.owner, "hit");
    playDuelistImpact(rival.owner, toEl);
    shakeScreen();
    playEpicAction("直击", "attack");
    playArrow(fromEl, toEl, "attack", "直接攻击");
    addLog(`${attacker.name} 直接攻击，造成 ${dealt} 点伤害。`);
    playDuelistLine(owner.owner, lineFor(owner.owner, "direct", attacker), false, "direct");
    playDuelistLine(rival.owner, lineFor(rival.owner, "hit"), false, "hit");
  } else {
    battleEvents = resolveBattleWithEngine(owner, rival, attackerIndex, resolvedTargetIndex, {
      declarationEventId: attackContext.targetEffectId
    });
    if (!battleEvents) return false;
    playSound("attack-impact");
    playImpactExplosion(toEl);
    if (outcome.diff > 0) {
      let dealt = 0;
      if (target.mode !== "defense") {
        dealt = playBattleDamageFeedback(battleEvents, rival);
        animateAvatar(rival.owner, "hit");
        playMonsterMotion(rival.owner, resolvedTargetIndex, "hit");
      } else {
        playSound("guard");
        playMonsterMotion(rival.owner, resolvedTargetIndex, "guard");
        playMonsterCounterPhantom(target, toEl, fromEl);
        playGuardShield(toEl);
        playEpicAction("防御", "guard");
      }
      playMonsterBurst(toEl);
      playSound("attack-break");
      shakeScreen();
      playEpicAction(target.mode === "defense" ? "破防" : "击破", "attack");
      playArrow(fromEl, toEl, "attack", "攻击");
      addLog(battleLogText(attacker, target, outcome, dealt));
      speak(`${attacker.name} 击破目标。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "break"), false, "break");
    } else if (outcome.diff < 0) {
      const dealt = playBattleDamageFeedback(battleEvents, owner);
      playSound("damage");
      animateAvatar(owner.owner, "hit");
      playMonsterMotion(owner.owner, attackerIndex, "hit");
      shakeScreen();
      if (outcome.destroysAttacker) {
        playMonsterBurst(fromEl);
        playEpicAction("反击", "attack");
      } else {
        playSound("guard");
        playMonsterMotion(rival.owner, resolvedTargetIndex, "guard");
        playGuardShield(toEl);
        playEpicAction("守备反击", "guard");
      }
      playArrow(toEl, fromEl, "attack", "反击");
      addLog(battleLogText(attacker, target, outcome, dealt));
      speak(outcome.destroysAttacker
        ? `${attacker.name} 攻击失败，被反击破坏。`
        : `${attacker.name} 攻击受阻，承受反击伤害。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "hit"), false, "hit");
    } else if (outcome.kind === "guardHold") {
      playSound("guard");
      playMonsterMotion(rival.owner, resolvedTargetIndex, "guard");
      playMonsterCounterPhantom(target, toEl, fromEl);
      playGuardShield(toEl);
      playEpicAction("防御", "guard");
      playArrow(fromEl, toEl, "attack", "防御");
      addLog(battleLogText(attacker, target, outcome));
      speak(`${target.name} 挡下了攻击。`);
    } else {
      playMonsterBurst(fromEl);
      playMonsterBurst(toEl);
      playSound("attack-clash");
      shakeScreen();
      playEpicAction("相杀", "attack");
      animateAvatar(owner.owner, "hit");
      animateAvatar(rival.owner, "hit");
      playMonsterMotion(owner.owner, attackerIndex, "hit");
      playMonsterMotion(rival.owner, resolvedTargetIndex, "hit");
      playArrow(fromEl, toEl, "attack", "相杀");
      addLog(battleLogText(attacker, target, outcome));
      speak(`${attacker.name} 与 ${target.name} 同归于尽。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "clash"), false, "clash");
    }
  }

  playAttackResetFeedback(owner, attacker, battleEvents);
  resolveAfterAttackBattleFeedback(owner, attacker, battleEvents);
  checkGameOver();
  return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的攻击`);
}

function cardImpactSignature(card) {
  if (!card) return null;
  return {
    uid: card.uid,
    id: card.id,
    used: Boolean(card.used),
    changedMode: Boolean(card.changedMode),
    mode: card.mode || "attack",
    tempAtk: card.tempAtk || 0,
    tempDef: card.tempDef || 0,
    battleWear: card.battleWear || 0
  };
}

function duelistImpactSignature(duelist) {
  return {
    lp: duelist.lp,
    shield: duelist.shield || 0,
    directAttacks: duelist.directAttacks || 0,
    attackResets: duelist.attackResets || 0,
    hand: duelist.hand.map((card) => card.uid),
    deck: duelist.deck.map((card) => card.uid),
    field: duelist.field.map(cardImpactSignature),
    traps: duelist.traps.map(cardImpactSignature),
    grave: duelist.grave.map((card) => card.uid)
  };
}

function attackImpactSnapshot(owner, rival) {
  return JSON.stringify({
    owner: duelistImpactSignature(owner),
    rival: duelistImpactSignature(rival)
  });
}

function assertAttackImpact(owner, rival, before, label) {
  const after = attackImpactSnapshot(owner, rival);
  if (before !== after || state.gameOver) return true;
  const message = `规则校验：${label}没有产生任何状态影响，已中断后续流程。`;
  state.ruleCheckIssue = message;
  addLog(message);
  cue("规则校验发现攻击没有结算影响，请查看疑点日志。");
  playSound("damage");
  console.error(message);
  return false;
}

function promptTrapChoice(candidates, eventName, details = {}) {
  const previousWindow = {
    actionWindow: state.actionWindow,
    actionWindowReason: state.actionWindowReason
  };
  clearPlayerIdleTimers();
  setActionWindow(ACTION_WINDOWS.response, { reason: `trap-choice:${eventName}` });
  state.pendingTrapChoice = createTrapResponse({
    eventName,
    details,
    candidates
  });
  updateTrapChoicePrompt();
  els.chainModal.classList.add("show");
  playSound("trap");
  speak(state.pendingTrapChoice.trapIndexes.length > 1 ? "请选择要发动的陷阱。" : `是否发动陷阱，${candidates[0].card.name}。`);
  render();
  resetPlayerIdleCountdown();
  return new Promise((resolve) => {
    pendingTrapChoiceResolver = (answer) => {
      const choice = state.pendingTrapChoice;
      const resolution = resolveTrapResponse(choice, answer, state.player.traps);
      if (!resolution.ok && resolution.reason === "missing-selection") {
        cue("先选择一张高亮的陷阱卡。");
        resetPlayerIdleCountdown();
        return;
      }
      if (!resolution.ok) {
        cue("选中的陷阱已不在场上，本次响应已取消。");
        addLog("陷阱响应失效：选中的陷阱已离开原槽位。");
      }
      clearPlayerIdleTimers();
      setActionWindow(previousWindow.actionWindow, {
        reason: previousWindow.actionWindowReason || "trap response resolved"
      });
      closeTrapChoicePrompt();
      render();
      resolve(resolution.ok ? resolution : { trapIndex: -1, skippedName: "" });
    };
  });
}

function answerChain(answer) {
  if (pendingTrapChoiceResolver) {
    pendingTrapChoiceResolver(answer);
  }
}

function handOffToAiTurn() {
  state.selected = null;
  state.pendingTarget = null;
  clearBattlePreview();
  clearPlayerIdleTimers();
  beginTurn("ai");
  render();
  window.setTimeout(runAiTurn, 950);
}

function endPlayerTurn(reason = "manual") {
  if (!canPlayerAct()) return;
  cancelAutoEnd();
  state.selected = null;
  state.pendingTarget = null;
  clearBattlePreview();
  clearPlayerIdleTimers();
  try {
    dispatchEndTurnFromUiState(state, "player", {
      reason,
      endedBy: reason === "manual" ? "manual" : "system"
    });
  } catch (error) {
    cue(error.message || "回合结束失败。");
    console.error(error);
    resetPlayerIdleCountdown();
    return;
  }
  handOffToAiTurn();
}

function enterPlayerBattlePhase(reason = "战斗时点", { preserveSelection = false, quiet = false } = {}) {
  if (!canPlayerAct()) return false;
  if (state.phase === PHASES.battle && state.actionWindow === ACTION_WINDOWS.battle) return true;
  if (state.pendingTarget) {
    cue("先完成或取消当前目标选择。");
    resetPlayerIdleCountdown();
    return false;
  }
  if (!currentPlayerActions().hasBattle) {
    scheduleAutoEnd(reason, true);
    return false;
  }
  cancelAutoEnd();
  clearPlayerIdleTimers();
  if (!preserveSelection) state.selected = null;
  clearBattlePreview();
  try {
    dispatchChangePhaseFromUiState(state, "player", PHASES.battle);
  } catch (error) {
    cue(error.message || "无法进入战斗阶段。");
    console.error(error);
    return false;
  }
  Object.assign(state, mainToBattlePatch());
  setActionWindow(ACTION_WINDOWS.battle, { reason });
  if (!quiet) {
    playSound("click");
    addLog(`${reason}，进入战斗时点。`);
    cue("可以攻击，也可以发动可用魔法卡。");
  }
  render();
  resetPlayerIdleCountdown();
  return true;
}

function skipPlayerAttack() {
  if (!canUsePlayerTurnControls(state)) {
    cue("现在还不能跳过攻击。");
    return;
  }
  if (state.phase !== PHASES.battle) {
    if (!enterPlayerBattlePhase("你跳过攻击", { preserveSelection: true, quiet: true })) return;
  }
  if (state.pendingTarget) {
    cue("先完成或取消当前目标选择。");
    return;
  }
  notePlayerIntent();
  let skipEvents;
  try {
    skipEvents = dispatchSkipRemainingAttacksFromUiState(state, "player");
  } catch (error) {
    cue(error.message || "本回合没有可跳过的攻击。");
    console.error(error);
    resetPlayerIdleCountdown();
    return;
  }
  const skipped = skipEvents.find((event) => event.type === "ATTACKS_SKIPPED")?.count || 0;
  state.selected = null;
  clearBattlePreview();
  playSound("click");
  addLog(`你跳过了本回合剩余 ${skipped} 次攻击机会。`);
  cue("已跳过本回合攻击。");
  render();
  resolvePlayerActionWindow("跳过攻击完成");
}

function manualEndPlayerTurn() {
  if (!canUsePlayerTurnControls(state)) {
    cue("抽卡完成后才能主动结束回合。");
    return;
  }
  if (state.pendingTarget) {
    cue("先完成或取消当前目标选择。");
    resetPlayerIdleCountdown();
    return;
  }
  if (state.phase === PHASES.main) {
    notePlayerIntent();
  }
  cancelAutoEnd();
  clearPlayerIdleTimers();
  state.selected = null;
  state.pendingTarget = null;
  clearBattlePreview();
  playSound("click");
  addLog("你主动结束回合，放弃后续操作。");
  cue("回合结束。");
  endPlayerTurn();
}

function togglePause() {
  if (!state.started || state.gameOver) {
    cue("决斗还没有开始。");
    return;
  }
  state.paused = !state.paused;
  if (state.paused) {
    clearPlayerIdleTimers();
    stopAll();
    addLog("决斗已暂停。");
  } else {
    addLog("决斗继续。");
    resumeWaiters();
    const resumeStep = pauseResumeStep(state);
    if (resumeStep === "playerDraw") {
      window.setTimeout(autoPlayerDraw, 350);
    } else if (resumeStep === "playerMain" || resumeStep === "playerBattle") {
      resetPlayerIdleCountdown();
    } else if (resumeStep === "aiTurn") {
      window.setTimeout(runAiTurn, 350);
    }
  }
  render();
}

function scheduleAutoEnd(reason = "操作完成", force = false) {
  if (!canPlayerAct() || state.autoEnding) return;
  if (state.pendingTarget) return;
  if (isAttackFlowPending()) return;
  const actions = currentPlayerActions();
  if (!force && actions.hasAny) {
    setActionWindow(state.phase === PHASES.battle ? ACTION_WINDOWS.battle : ACTION_WINDOWS.main, { reason });
    resetPlayerIdleCountdown();
    return;
  }
  try {
    dispatchRequestAutoEndFromUiState(state, "player", {
      reason,
      now: Date.now(),
      timeoutSeconds: actionWindowTimeoutSeconds(ACTION_WINDOWS.autoEnd)
    });
  } catch (error) {
    cue(error.message || "无法进入自动结束。");
    console.error(error);
    return;
  }
  state.selected = null;
  state.pendingTarget = null;
  clearPlayerIdleTimers();
  cue(`${reason}，回合即将结束。`);
  render();
  state.autoEndTimer = window.setTimeout(() => {
    state.autoEndTimer = null;
    if (state.turn === "player" && state.autoEnding && state.actionWindow === "autoEnd" && !state.gameOver) {
      try {
        dispatchCommitAutoEndFromUiState(state, "player", {
          reason,
          now: Date.now()
        });
      } catch (error) {
        cue(error.message || "自动结束失败。");
        console.error(error);
        resetPlayerIdleCountdown();
        render();
        return;
      }
      handOffToAiTurn();
    }
  }, AUTO_END_DELAY_MS);
}

function beginTurn(owner) {
  try {
    dispatchStartTurnFromUiState(state, owner);
  } catch (error) {
    cue(error.message || "回合开始失败。");
    console.error(error);
    return false;
  }
  Object.assign(state, turnStartPatch(owner));
  setActionWindow(owner === "player" ? ACTION_WINDOWS.draw : ACTION_WINDOWS.ai, {
    playerId: owner,
    reason: "turn started"
  });
  clearBattlePreview();
  cancelAutoEnd();
  clearPlayerIdleTimers();
  playSound("turn");
  addLog(`${owner === "player" ? "你的" : "AI 的"}回合开始。`);
  playVoice(owner, "turn", owner === "player" ? "轮到你了。抽卡。" : "对手回合。");
  if (owner === "player") {
    window.setTimeout(() => {
      if (!state.paused) autoPlayerDraw();
    }, 700);
  }
  return true;
}

function toggleSelectedMode() {
  if (!canPlayerAct() || !state.selected || state.selected.zone !== "playerField") {
    cue("请选择你场上的怪兽。");
    return;
  }
  if (state.phase !== PHASES.main || state.actionWindow !== ACTION_WINDOWS.main) {
    cue("只能在主要阶段切换表示。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  const card = state.player.field[state.selected.index];
  if (!card) {
    state.selected = null;
    render();
    cue("请选择你场上的怪兽。");
    return;
  }
  try {
    dispatchChangeMonsterModeFromUiState(state, "player", state.selected.index);
  } catch (error) {
    cue(error.message || "这只怪兽本回合不能切换表示。");
    console.error(error);
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  playSound("click");
  addLog(`${card.name} 切换为${card.mode === "attack" ? "攻击" : "守备"}表示。`);
  speak(`${card.name}，${card.mode === "attack" ? "攻击" : "守备"}表示。`);
  render();
  resolvePlayerActionWindow("切换表示完成");
}

function autoPlayerDraw() {
  if (!canPlayerAct()) return;
  if (state.phase !== PHASES.draw) return;
  state.pendingOpeningDraw = false;
  let events = [];
  try {
    events = dispatchResolveTurnDrawFromUiState(state, "player");
  } catch (error) {
    cue(error.message || "自动抽卡失败。");
    console.error(error);
    return;
  }
  applyDrawEventFeedback(state.player, events, true);
  if (state.gameOver) {
    render();
    return;
  }
  if (state.phase !== PHASES.main) {
    render();
    return;
  }
  Object.assign(state, drawToMainPatch());
  setActionWindow(ACTION_WINDOWS.main, { reason: "draw completed" });
  render("draw-player");
  resetPlayerIdleCountdown();
}

function scheduleOpeningDraw(delay = 700) {
  if (!canPlayerAct() || state.phase !== PHASES.draw) return;
  if (isVoiceReady()) {
    window.setTimeout(autoPlayerDraw, delay);
  } else {
    state.pendingOpeningDraw = true;
    els.timerText.textContent = "点击任意位置开始决斗";
  }
}

async function runAiTurn() {
  if (state.gameOver || state.paused || !state.started || state.aiRunning) return;
  state.aiRunning = true;
  cue("对手开始行动。");
  try {
    setActionWindow("ai");
    await sleep(950);
    const drawEvents = dispatchResolveTurnDrawFromUiState(state, "ai");
    applyDrawEventFeedback(state.ai, drawEvents, true);
    if (state.gameOver) return;
    if (state.phase !== PHASES.main) return;
    render();
    await sleep(1500);
    await aiPlaySpells();
    if (state.gameOver) return;
    await sleep(850);
    if (aiSetTraps()) {
      render();
      await sleep(1300);
    }
    if (state.gameOver) return;
    if (await aiSummon()) {
      render();
      await sleep(1700);
    }
    while (!state.gameOver && state.ai.extraSummon > 0) {
      cue("对手还有额外召唤机会。");
      playEpicAction("额外召唤", "draw", 900);
      playVoice("ai", "summon", "对手准备额外召唤。");
      await sleep(950);
      const summoned = await aiSummon();
      if (!summoned) break;
      render();
      await sleep(1850);
    }
    if (state.gameOver) return;
    dispatchChangePhaseFromUiState(state, "ai", PHASES.battle);
    await aiAttack();
    if (!state.gameOver) {
      await sleep(1150);
      beginTurn("player");
      render();
    }
  } finally {
    state.aiRunning = false;
  }
}

async function aiPlaySpells() {
  let action = chooseAiSpellAction({
    hand: state.ai.hand,
    owner: state.ai,
    rival: state.player,
    aiStyle: state.aiStyle
  });
  while (action && !state.gameOver) {
    const acted = playSpell(state.ai, state.player, action.handIndex);
    if (!acted) return;
    await sleep(1650);
    action = chooseAiSpellAction({
      hand: state.ai.hand,
      owner: state.ai,
      rival: state.player,
      aiStyle: state.aiStyle
    });
  }
}

async function aiSummon() {
  const action = chooseAiSummonAction({
    hand: state.ai.hand,
    field: state.ai.field,
    aiStyle: state.aiStyle
  });
  if (!action) return false;
  const didSummon = await summonMonster(state.ai, state.player, action.handIndex, action.fieldIndex);
  if (!didSummon) return false;
  const summoned = state.ai.field[action.fieldIndex];
  if (shouldSwitchSummonedMonsterToDefense({
    monster: summoned,
    ownerLp: state.ai.lp,
    rivalLp: state.player.lp,
    aiStyle: state.aiStyle
  })) {
    try {
      dispatchChangeMonsterModeFromUiState(state, "ai", action.fieldIndex, "defense");
      addLog(`对手将 ${summoned.name} 切换为守备表示。`);
      speak(`对手将 ${summoned.name} 切换为守备表示。`, false, "ai");
    } catch (error) {
      addLog(`${summoned.name} 无法切换表示：${error.message}`);
      console.error(error);
    }
  }
  return true;
}

function aiSetTraps() {
  const action = chooseAiSetTrapAction({
    hand: state.ai.hand,
    traps: state.ai.traps
  });
  return action ? setTrap(state.ai, action.handIndex, action.trapIndex) : false;
}

async function aiAttack() {
  const skippedAttackers = new Set();
  const maxAttackSteps = FIELD_SIZE * 3;
  for (let step = 0; step < maxAttackSteps; step += 1) {
    const action = chooseAiAttackAction({
      owner: state.ai,
      field: state.ai.field,
      rivalField: state.player.field,
      rivalLp: state.player.lp,
      aiStyle: state.aiStyle,
      skippedAttackers
    });
    if (action.type === "none") return;
    const { card, attackerIndex, targetIndex, target } = action;
    if (state.gameOver || !state.ai.field[attackerIndex]) return;
    if (action.type === "skipAttack") {
      skippedAttackers.add(action.cardUid);
      addLog(`对手保留 ${card.name} 的攻击机会，避免不利战斗。`);
      continue;
    }
    cue(`对手用 ${card.name} 发起攻击。`);
    await sleep(900);
    if (targetIndex < 0) {
      cue(`对手准备让 ${card.name} 直接攻击。`);
      playEpicAction("Direct", "attack", 980);
      playVoice("ai", "direct", "对手准备直接攻击。");
      await sleep(900);
    }
    showBattlePreview(card, target, state.ai, state.player);
      addLog(`对手攻击预判：${battlePreviewText(card, target)}`);
    render();
    await sleep(1080);
    const resolved = await attack(state.ai, state.player, attackerIndex, targetIndex);
    render();
    if (resolved === false && state.ruleCheckIssue) break;
    await sleep(2200);
  }
  addLog("AI attack loop reached the safety cap.");
}

function checkGameOver() {
  if (state.gameOverAnnounced) return;
  if (state.gameOver || state.player.lp <= 0 || state.ai.lp <= 0) {
    state.gameOver = true;
    state.gameOverAnnounced = true;
    const win = state.gameOverWinner ? state.gameOverWinner === "player" : state.ai.lp <= 0 && state.player.lp > 0;
    recordGameResult(win);
    playSound(win ? "win" : "lose");
    playVoice(win ? "player" : "ai", "win", win ? "你赢了。" : "决斗败北。", true);
    els.modalTitle.textContent = win ? "你赢了" : "决斗败北";
    els.modalText.textContent = win
      ? `星魂回应了你的召唤。${statsLine()}。`
      : `AI 抢到了节奏。调整卡组顺序或更早展开怪兽试试看。${statsLine()}。`;
    els.modalRestart.textContent = "回到准备";
    window.setTimeout(() => els.modal.classList.add("show"), 260);
  }
}

function showDetail(card) {
  state.focusedCard = card;
  els.detailName.textContent = card.name;
  els.detailText.textContent = cardDetailText(card);
}

function openFocusedCardDetail() {
  const card = state.focusedCard;
  if (!card) {
    cue("先选择一张卡。");
    return;
  }
  resetPlayerIdleCountdown();
  els.zoomName.textContent = card.name;
  els.zoomCard.innerHTML = "";
  const preview = renderCardElement(document, card, { asset: monsterAsset(card) });
  preview.classList.remove("selected", "used", "defense");
  els.zoomCard.appendChild(preview);
  els.zoomText.textContent = card.text || "没有效果文本。";
  els.zoomMeta.textContent = cardZoomMeta(card);
  els.cardModal.classList.add("show");
}

function closeCardDetail() {
  els.cardModal.classList.remove("show");
  resetPlayerIdleCountdown();
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 12);
  addTimeline(text);
}

function addTimeline(text) {
  const next = nextTimelineState(state.timeline, text, state.timelineStep);
  state.timelineStep = next.step;
  state.timeline = next.timeline;
}

function announce(text) {
  els.toast.textContent = text;
  els.toast.classList.remove("show");
  void els.toast.offsetWidth;
  els.toast.classList.add("show");
}

function centerOf(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function fieldElement(owner, index) {
  const root = owner === "player" ? els.playerField : els.aiField;
  return root.querySelector(`[data-index="${index}"] .card`) || root.querySelector(`[data-index="${index}"]`);
}

function trapElement(owner, index) {
  const root = owner === "player" ? els.playerTraps : els.aiTraps;
  return root.querySelector(`[data-index="${index}"] .card`) || root.querySelector(`[data-index="${index}"]`);
}

function panelElement(owner) {
  return owner === "player" ? els.playerPanel : els.aiPanel;
}

function avatarElement(owner) {
  return owner === "player" ? els.playerAvatar : els.aiAvatar;
}

function figureElement(owner) {
  return owner === "player" ? els.playerFigure : els.aiFigure;
}

function animateAvatar(owner, mood) {
  const avatar = avatarElement(owner);
  const figure = figureElement(owner);
  [avatar, figure].filter(Boolean).forEach((target) => {
    target.classList.remove("attack", "hit", "cast");
    void target.offsetWidth;
    target.classList.add(mood);
    window.setTimeout(() => target.classList.remove(mood), 900);
  });
}

function playDuelistLine(owner, text, force = false, voiceKey = "") {
  const panel = panelElement(owner);
  if (!panel) return;
  const anchor = centerOf(panel);
  const el = document.createElement("div");
  el.className = `duelist-line ${owner === "ai" ? "ai" : ""}`;
  el.dataset.speaker = duelistName(owner);
  el.textContent = text;
  const x = owner === "player"
    ? Math.max(14, Math.min(window.innerWidth - 330, anchor.x - 290))
    : Math.max(14, Math.min(window.innerWidth - 330, anchor.x + 18));
  const y = Math.max(72, Math.min(window.innerHeight - 130, anchor.y - 20));
  el.style.setProperty("--x", `${x}px`);
  el.style.setProperty("--y", `${y}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1850);
  if (voiceKey) {
    playVoice(owner, voiceKey, text, force);
  } else {
    speak(text, force, owner);
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms)).then(waitWhilePaused);
}

function waitWhilePaused() {
  if (!state.paused || state.gameOver) return Promise.resolve();
  return new Promise((resolve) => {
    state.resumeResolvers.push(resolve);
  });
}

function resumeWaiters() {
  const resolvers = state.resumeResolvers.splice(0);
  resolvers.forEach((resolve) => resolve());
}

function clearPlayerIdleTimers() {
  window.clearTimeout(state.idleTimer);
  window.clearInterval(state.countdownTimer);
  state.idleTimer = null;
  state.countdownTimer = null;
  if (els.timerText) {
    els.timerText.textContent = "";
  }
  if (els.timerProgress) {
    els.timerProgress.classList.remove("active");
  }
  if (els.timerProgressFill) {
    els.timerProgressFill.style.width = "0%";
  }
}

function timerTextForActionWindow(left) {
  if (state.actionWindow === ACTION_WINDOWS.targetSelect) {
    return left > 0 ? `选目标 ${left}s 后自动处理` : "";
  }
  if (state.actionWindow === ACTION_WINDOWS.response) {
    return left > 0 ? `响应 ${left}s 后默认跳过` : "";
  }
  return left > 0 ? `无操作 ${left}s 后自动交回合` : "";
}

function resetPlayerIdleCountdown() {
  clearPlayerIdleTimers();
  if (!shouldRunPlayerIdleCountdownForState(state)) return;
  const seconds = actionWindowTimeoutSeconds(state.actionWindow);
  if (seconds <= 0) return;
  setActionWindow(state.actionWindow, {
    reason: state.actionWindowReason || "countdown reset",
    timeoutSeconds: seconds
  });
  const startedAt = Date.now();
  const totalMs = seconds * 1000;
  const windowId = state.actionWindowId;
  els.timerProgress?.classList.add("active");
  const tick = () => {
    if (!shouldRunPlayerIdleCountdownForState(state)) {
      clearPlayerIdleTimers();
      return;
    }
    const leftMs = Math.max(0, state.actionDeadline - Date.now());
    const left = Math.max(0, Math.ceil(leftMs / 1000));
    els.timerText.textContent = timerTextForActionWindow(left);
    if (els.timerProgressFill) {
      els.timerProgressFill.style.width = `${Math.max(0, Math.min(100, (leftMs / totalMs) * 100))}%`;
    }
  };
  tick();
  state.countdownTimer = window.setInterval(tick, 250);
  state.idleTimer = window.setTimeout(() => {
    handleActionWindowTimeout(windowId);
  }, seconds * 1000);
}

function legalPendingTargets(pending = state.pendingTarget) {
  if (!pending) return [];
  const targets = [];
  ["player", "ai"].forEach((ownerName) => {
    const duelist = ownerName === "player" ? state.player : state.ai;
    duelist.field.forEach((card, index) => {
      if (!card) return;
      const targetInfo = targetInfoFromPending(ownerName, index);
      if (targetInfo.ok) {
        targets.push(targetInfo);
      }
    });
    duelist.traps.forEach((card, index) => {
      if (!card) return;
      const targetInfo = targetInfoFromPending(ownerName, index, "traps");
      if (targetInfo.ok) {
        targets.push(targetInfo);
      }
    });
  });
  return targets;
}

function handleTargetSelectionTimeout() {
  if (!state.pendingTarget) {
    resolvePlayerActionWindow("目标选择超时");
    return;
  }

  const cardName = state.pendingTarget.cardName;
  const targets = legalPendingTargets();
  if (targets.length === 1) {
    addLog(`${cardName} 目标选择超时，自动选择唯一合法目标 ${targets[0].card.name}。`);
    cue(`已自动选择 ${targets[0].card.name}`);
    resolvePendingSpellTarget(targets[0].owner, targets[0].index, targets[0].zone);
    return;
  }

  clearPendingTarget();
  state.selected = null;
  cue(`目标选择超时，已取消 ${cardName}`);
  addLog(`${cardName} 目标选择超时，未发动。`);
  render();
  resolvePlayerActionWindow("目标选择超时");
}

function handleActionWindowTimeout(windowId) {
  if (windowId && state.actionWindowId !== windowId) return;
  if (state.paused || state.gameOver || !state.started || state.autoEnding) return;
  if (state.actionWindow === ACTION_WINDOWS.targetSelect) {
    handleTargetSelectionTimeout();
    return;
  }
  if (state.actionWindow === ACTION_WINDOWS.response && pendingTrapChoiceResolver) {
    cue("响应超时，默认不发动。");
    answerChain(false);
    return;
  }
  if (isAttackFlowPending()) return;
  if (canPlayerAct() && state.phase === PHASES.main && state.actionWindow === ACTION_WINDOWS.main) {
    scheduleAutoEnd("暂时没有操作", true);
  }
  if (canPlayerAct() && state.phase === PHASES.battle && state.actionWindow === ACTION_WINDOWS.battle) {
    scheduleAutoEnd("暂时没有操作", true);
  }
}

function playDrawEffect(owner, card) {
  const source = panelElement(owner);
  const target = owner === "player" ? els.hand : panelElement(owner);
  if (!source || !target) return;
  const from = centerOf(source);
  const to = centerOf(target);
  const el = document.createElement("div");
  el.className = "draw-card-effect";
  el.textContent = card?.type === "trap" ? "陷" : card?.type === "spell" ? "魔" : "怪";
  el.style.setProperty("--from-x", `${from.x - 36}px`);
  el.style.setProperty("--from-y", `${from.y - 48}px`);
  el.style.setProperty("--to-x", `${to.x - 36}px`);
  el.style.setProperty("--to-y", `${to.y - 48}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1180);
  playDrawFan(owner);
  playEpicAction("抽卡", "draw", 820);
}

function playDrawFan(owner) {
  const source = panelElement(owner);
  const target = owner === "player" ? els.hand : panelElement(owner);
  if (!source || !target) return;
  const from = centerOf(source);
  const to = centerOf(target);
  [-24, -8, 8, 24].forEach((rotation, index) => {
    const el = document.createElement("div");
    el.className = "draw-fan-effect";
    el.style.setProperty("--from-x", `${from.x - 29}px`);
    el.style.setProperty("--from-y", `${from.y - 42}px`);
    el.style.setProperty("--to-x", `${to.x - 92 + index * 42}px`);
    el.style.setProperty("--to-y", `${to.y - 60 - Math.abs(rotation) * 0.8}px`);
    el.style.setProperty("--rot", `${rotation}deg`);
    el.style.setProperty("--end-rot", `${rotation * 0.55}deg`);
    els.effectLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 820);
  });
}

function playArrow(fromEl, toEl, kind = "attack", label = "") {
  if (!fromEl || !toEl) return;
  const from = centerOf(fromEl);
  const to = centerOf(toEl);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(60, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const arrow = document.createElement("div");
  arrow.className = `effect-arrow ${kind}`;
  arrow.style.setProperty("--x", `${from.x}px`);
  arrow.style.setProperty("--y", `${from.y}px`);
  arrow.style.setProperty("--angle", `${angle}deg`);
  arrow.style.setProperty("--distance", `${distance}px`);
  els.effectLayer.appendChild(arrow);

  if (label) {
    const tag = document.createElement("div");
    tag.className = "effect-label";
    tag.textContent = label;
    tag.style.setProperty("--x", `${(from.x + to.x) / 2 - 34}px`);
    tag.style.setProperty("--y", `${(from.y + to.y) / 2 - 28}px`);
    els.effectLayer.appendChild(tag);
    window.setTimeout(() => tag.remove(), 1120);
  }

  window.setTimeout(() => arrow.remove(), 900);
}

function playEpicAction(text, kind = "attack", duration = 1100) {
  const el = document.createElement("div");
  el.className = `epic-action ${kind}`;
  el.textContent = text;
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), duration);
}

function playLifeDelta(owner, amount) {
  if (!els.effectLayer || amount === 0) return;
  const target = panelElement(owner);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = `life-delta ${amount < 0 ? "damage" : "heal"}`;
  el.textContent = amount < 0 ? `${amount}` : `+${amount}`;
  el.style.setProperty("--x", `${rect.left + rect.width * 0.58}px`);
  el.style.setProperty("--y", `${rect.top + rect.height * 0.18}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1180);
}

function playAttackCloseup(attacker, target, owner, rival) {
  const el = document.createElement("div");
  el.className = "attack-closeup";
  el.innerHTML = `
    <div class="closeup-card attacker">
      <em>${duelistName(owner)} 攻击</em>
      <strong></strong>
      <span></span>
    </div>
    <div class="closeup-vs">VS</div>
    <div class="closeup-card defender">
      <em>${duelistName(rival)} 承受</em>
      <strong></strong>
      <span></span>
    </div>
  `;
  const cards = el.querySelectorAll(".closeup-card");
  cards[0].querySelector("strong").textContent = attacker.name;
  cards[0].querySelector("span").textContent = `攻击 ${totalAtk(attacker)}`;
  cards[1].querySelector("strong").textContent = target ? target.name : duelistName(rival);
  cards[1].querySelector("span").textContent = target ? `${target.mode === "defense" ? "守备" : "攻击"} ${battleValue(target)}` : "直接攻击";
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1340);
}

function playAceStrike(attacker, owner, target) {
  const el = document.createElement("div");
  el.className = `ace-strike ${attacker.element || ""}`;
  const targetName = target ? target.name : duelistName(owner === "player" ? "ai" : "player");
  el.innerHTML = `
    <div class="ace-strike-panel">
      <em>${duelistName(owner)} 王牌攻势</em>
      <strong>${attacker.name}</strong>
      <span>${targetName} 已被锁定</span>
    </div>
  `;
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1500);
}

function playSlashBurst(fromEl, toEl) {
  if (!fromEl || !toEl) return;
  const from = centerOf(fromEl);
  const to = centerOf(toEl);
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  const el = document.createElement("div");
  el.className = "slash-burst";
  el.style.setProperty("--angle", `${angle}deg`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 880);
}

function playGuardShield(targetEl) {
  if (!targetEl) return;
  const pos = centerOf(targetEl);
  const el = document.createElement("div");
  el.className = "guard-shield";
  el.style.setProperty("--x", `${pos.x - 78}px`);
  el.style.setProperty("--y", `${pos.y - 78}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 940);
}

function shakeScreen() {
  const root = document.querySelector("#app");
  if (!root) return;
  root.classList.remove("screen-shake");
  void root.offsetWidth;
  root.classList.add("screen-shake");
  window.setTimeout(() => root.classList.remove("screen-shake"), 380);
}

function playCenterCardEffect(card, caption = "") {
  const el = document.createElement("div");
  el.className = "center-card-effect";
  el.innerHTML = `
    <strong>${card.name}</strong>
    <span>${card.icon || "星"}</span>
    <p>${caption || card.text || "效果发动"}</p>
  `;
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1550);
}

function playAttackCutIn(attacker, target, owner, rival) {
  const el = document.createElement("div");
  el.className = "attack-cutin";

  const left = document.createElement("div");
  left.className = "cutin-card";
  left.innerHTML = `<em>${duelistName(owner)} 攻击宣言</em><strong></strong><span></span>`;
  left.querySelector("strong").textContent = attacker.name;
  left.querySelector("span").textContent = `攻击 ${totalAtk(attacker)}`;

  const versus = document.createElement("div");
  versus.className = "cutin-versus";
  versus.textContent = "VS";

  const right = document.createElement("div");
  right.className = "cutin-card";
  right.innerHTML = `<em>${duelistName(rival)} 目标</em><strong></strong><span></span>`;
  right.querySelector("strong").textContent = target ? target.name : "直接攻击";
  right.querySelector("span").textContent = target ? `${target.mode === "defense" ? "守备" : "攻击"} ${battleValue(target)}` : "生命伤害";

  el.appendChild(left);
  el.appendChild(versus);
  el.appendChild(right);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1220);
}

function playMonsterMotion(owner, index, motion) {
  const el = fieldElement(owner, index);
  if (!el) return;
  const className = `monster-${motion}-motion`;
  el.classList.remove("monster-attack-motion", "monster-hit-motion", "monster-guard-motion", "monster-stand-motion");
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), 860);
}

function playMonsterPhantom(card, fromEl, toEl) {
  const asset = monsterAsset(card);
  if (!asset || !fromEl || !toEl) return;
  const from = centerOf(fromEl);
  const to = centerOf(toEl);
  const el = document.createElement("div");
  el.className = "monster-phantom";
  el.innerHTML = `<img src="${asset}" alt="">`;
  el.style.setProperty("--from-x", `${from.x - 75}px`);
  el.style.setProperty("--from-y", `${from.y - 120}px`);
  el.style.setProperty("--mid-x", `${(from.x + to.x) / 2 - 75}px`);
  el.style.setProperty("--mid-y", `${(from.y + to.y) / 2 - 150}px`);
  el.style.setProperty("--to-x", `${to.x - 75}px`);
  el.style.setProperty("--to-y", `${to.y - 120}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1260);
}

function playMonsterCounterPhantom(card, fromEl, toEl) {
  const asset = monsterAsset(card);
  if (!asset || !fromEl || !toEl) return;
  const from = centerOf(fromEl);
  const to = centerOf(toEl);
  const el = document.createElement("div");
  el.className = "monster-phantom counter";
  el.innerHTML = `<img src="${asset}" alt="">`;
  el.style.setProperty("--from-x", `${from.x - 75}px`);
  el.style.setProperty("--from-y", `${from.y - 120}px`);
  el.style.setProperty("--mid-x", `${(from.x * 0.62 + to.x * 0.38) - 75}px`);
  el.style.setProperty("--mid-y", `${(from.y * 0.62 + to.y * 0.38) - 150}px`);
  el.style.setProperty("--to-x", `${(from.x * 0.78 + to.x * 0.22) - 75}px`);
  el.style.setProperty("--to-y", `${(from.y * 0.78 + to.y * 0.22) - 120}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1080);
}

function playImpactExplosion(targetEl) {
  if (!targetEl) return;
  const pos = centerOf(targetEl);
  const el = document.createElement("div");
  el.className = "impact-explosion";
  el.style.setProperty("--x", `${pos.x - Math.min(180, window.innerWidth * 0.36)}px`);
  el.style.setProperty("--y", `${pos.y - Math.min(180, window.innerWidth * 0.36)}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1200);
}

function playDuelistImpact(owner, targetEl = null) {
  const anchor = centerOf(targetEl || panelElement(owner));
  const el = document.createElement("div");
  el.className = "duelist-impact";
  el.style.setProperty("--x", `${anchor.x - 95}px`);
  el.style.setProperty("--y", `${anchor.y - 95}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 860);
}

function playMonsterBurst(targetEl) {
  if (!targetEl) return;
  const pos = centerOf(targetEl);
  const el = document.createElement("div");
  el.className = "monster-burst";
  el.style.setProperty("--x", `${pos.x - 59}px`);
  el.style.setProperty("--y", `${pos.y - 59}px`);
  els.effectLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 820);
}

function monsterAsset(card) {
  return monsterAssets[card.id] || "";
}

function playSpellEffect(owner, rival, card, targetCard = null, targetOwner = owner.owner) {
  const source = panelElement(owner.owner);
  let target = panelElement(rival.owner);
  if (["heal700", "draw2", "shield800", "extraSummon", "elementEcho", "graveReturn", "battleTrance", "directStrike", "lightShadowCombo"].includes(card.effect)) {
    target = panelElement(owner.owner);
  }
  if (targetCard) {
    const targetDuelist = targetOwner === rival.owner ? rival : owner;
    const index = targetDuelist.field.indexOf(targetCard);
    target = fieldElement(targetDuelist.owner, index) || target;
  }
  playArrow(source, target, "spell", card.name);
}

function renderCharacterPanel(duelist, profile, nameEl, skillEl) {
  if (nameEl) {
    nameEl.textContent = duelist.owner === "player" ? `${profile.name}（你）` : profile.name;
  }
  if (skillEl) {
    const status = [
      duelist.shield > 0 ? `护盾 ${duelist.shield}` : "",
      duelist.extraSummon > 0 ? `额外召唤 ${duelist.extraSummon}` : ""
    ].filter(Boolean).join(" / ");
    skillEl.innerHTML = `<strong>${profile.skill}</strong>：${profile.text}${status ? ` ${status}` : ""}`;
  }
}

function render(animationKey = "") {
  const scenario = scenarioSetups[state.scenarioId] || scenarioSetups.normal;
  const targetPrompt = state.pendingTarget ? targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect) : "";
  const actions = currentPlayerActions();
  els.phaseText.textContent = phaseLabel(state);
  els.turnText.textContent = turnLabel(state);
  els.duelHint.textContent = duelHintText({
    started: state.started,
    paused: state.paused,
    pendingPrompt: targetPrompt,
    scenarioId: state.scenarioId,
    scenarioGoal: scenario.goal,
    turn: state.turn,
    autoEnding: state.autoEnding,
    canAttack: actions.attack,
    canSpell: actions.spell,
    canSummon: actions.summon,
    canSetTrap: actions.trap,
    canChangeMode: actions.mode
  });
  const setupModalOpen = els.modal?.classList.contains("show") && !state.started && !state.gameOver;
  els.startBtn.disabled = setupModalOpen || (state.started && !state.gameOver);
  els.startBtn.title = setupModalOpen ? "请点击准备面板里的开始决斗" : "开始决斗";
  els.pauseBtn.disabled = !state.started || state.gameOver;
  els.pauseBtn.textContent = state.paused ? "继续" : "暂停";
  const canUseTurnControls = canUsePlayerTurnControls(state);
  els.skipAttackBtn.disabled = !canUseTurnControls || Boolean(state.pendingTarget) || !actions.attack;
  els.skipAttackBtn.title = "放弃本回合剩余攻击机会";
  els.endTurnBtn.textContent = "结束回合";
  els.endTurnBtn.title = "结束你的回合";
  els.endTurnBtn.disabled = !canUseTurnControls || Boolean(state.pendingTarget);
  els.soundBtn.textContent = state.soundOn ? "音效 开" : "音效 关";
  els.soundBtn.classList.toggle("sound-off", !state.soundOn);
  els.voiceBtn.textContent = state.voiceOn ? "语音 开" : "语音 关";
  els.voiceBtn.classList.toggle("sound-off", !state.voiceOn);
  const selectedHand = selectedHandInfo();
  const selectedHandAction = selectedHand ? handActionInfo(selectedHand.card, selectedHand.index) : null;
  const selectedHandReady = Boolean(selectedHand && selectedHandAction?.ok && canUseHandCards(selectedHand.card));
  els.handConfirmBtn.textContent = state.pendingTarget ? "确认默认目标" : handConfirmLabel(selectedHand?.card);
  els.handConfirmBtn.disabled = state.pendingTarget ? false : !selectedHandReady;
  els.handCancelBtn.textContent = state.pendingTarget ? "取消目标" : "取消选择";
  els.handCancelBtn.disabled = !canPlayerAct() || (!state.pendingTarget && !selectedHandReady);
  if (els.choiceActions) {
    const showChoiceActions = canPlayerAct() && (Boolean(state.pendingTarget) || selectedHandReady);
    els.choiceActions.hidden = !showChoiceActions;
    if (showChoiceActions) {
      const confirmLabel = state.pendingTarget ? "确认默认目标" : handConfirmLabel(selectedHand?.card);
      const cancelLabel = state.pendingTarget ? "取消目标" : "取消选择";
      const text = state.pendingTarget
        ? `${targetPrompt} 再点这张手牌或确认，将默认选择合法目标。`
        : `${selectedHand.card.name}：${selectedHandAction?.reason || "确认后发动。"}`;
      els.choiceText.textContent = text;
      els.choiceConfirmBtn.textContent = confirmLabel;
      els.choiceConfirmBtn.disabled = state.pendingTarget ? false : !selectedHandReady;
      els.choiceCancelBtn.textContent = cancelLabel;
      els.choiceCancelBtn.disabled = !canPlayerAct();
    }
  }
  const selectedPlayerMonster = state.selected?.zone === "playerField" && Boolean(state.player.field[state.selected.index]);
  els.modeBtn.disabled = Boolean(state.pendingTarget) || !canPlayerAct() || state.phase !== PHASES.main || !selectedPlayerMonster;
  els.detailBtn.disabled = !state.focusedCard;
  if (els.setupPanel) {
    els.setupPanel.hidden = state.started || state.gameOver;
  }
  if (els.setupStats) {
    const aiLabel = aiProfiles[state.aiStyle]?.label || characterProfiles.ai.name;
    els.setupStats.textContent = `${statsLine()} / 当前配置：${characterProfiles.player.name}、${setupLabel(deckPresets, state.deckPreset)}、${aiLabel} / ${scenario.label}${scenario.goal ? ` / 目标：${scenario.goal}` : ""}`;
  }

  els.playerLp.textContent = state.player.lp;
  els.aiLp.textContent = state.ai.lp;
  els.playerLife.style.width = `${(state.player.lp / MAX_LP) * 100}%`;
  els.aiLife.style.width = `${(state.ai.lp / MAX_LP) * 100}%`;
  els.playerDeckCount.textContent = state.player.deck.length;
  els.aiDeckCount.textContent = state.ai.deck.length;
  els.playerGraveCount.textContent = state.player.grave.length;
  els.aiGraveCount.textContent = state.ai.grave.length;
  renderCharacterPanel(state.player, characterProfiles.player, els.playerName, els.playerSkill);
  renderCharacterPanel(state.ai, characterProfiles.ai, els.aiName, els.aiSkill);
  if (els.profileStats) {
    els.profileStats.textContent = `${setupLabel(deckPresets, state.deckPreset)} / ${scenario.label} / ${statsLine()}`;
  }
  const directTargetReady = canPlayerTargetAiPanel();
  els.aiPanel.classList.toggle("direct-target", directTargetReady);
  els.aiPanel.setAttribute("aria-label", directTargetReady ? "直接攻击 AI 玩家" : "AI 玩家状态");

  renderField(els.playerField, state.player, "player", animationKey);
  renderField(els.aiField, state.ai, "ai", animationKey);
  renderTraps(els.playerTraps, state.player, "player");
  renderTraps(els.aiTraps, state.ai, "ai");
  renderHand(animationKey);
  renderLog();
  renderTimeline();
  renderBattlePreview();
}

function renderBattlePreview() {
  const root = els.battlePreview;
  if (!root) return;
  const preview = state.battlePreview;
  root.innerHTML = "";
  root.className = `battle-preview${preview ? "" : " empty"}${preview?.tone ? ` ${preview.tone}` : ""}`;
  if (!preview) return;

  const title = document.createElement("div");
  title.className = "battle-preview-title";
  const titleText = document.createElement("span");
  titleText.textContent = "攻击结算预览";
  const badge = document.createElement("strong");
  badge.textContent = preview.badge;
  title.appendChild(titleText);
  title.appendChild(badge);

  const grid = document.createElement("div");
  grid.className = "battle-preview-grid";
  preview.rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "battle-preview-row";
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value;
    item.appendChild(label);
    item.appendChild(value);
    grid.appendChild(item);
  });

  const result = document.createElement("div");
  result.className = "battle-preview-result";
  result.textContent = preview.result;
  root.appendChild(title);
  root.appendChild(grid);
  root.appendChild(result);
}

function isAttackTargetSlot(ownerName, index) {
  if (ownerName !== "ai" || state.pendingTarget) return false;
  if (!canPlayerAct() || state.selected?.zone !== "playerField") return false;
  const projection = projectBattleFromUiState(state, "player", { attackerIndex: state.selected.index });
  return projection.inAttackIntentWindow && projection.targetIndexes.includes(index);
}

function canPlayerTargetAiPanel() {
  if (state.pendingTarget || !canPlayerAct() || state.selected?.zone !== "playerField") return false;
  const projection = projectBattleFromUiState(state, "player", { attackerIndex: state.selected.index });
  return projection.inAttackIntentWindow && projection.canDirectAttack;
}

function renderField(root, duelist, owner, animationKey) {
  root.innerHTML = "";
  duelist.field.forEach((card, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `slot ${card ? "" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = index;
    slot.dataset.testid = `${owner}-field-${index}`;
    const targetable = isPendingTargetSlot(owner, index);
    const attackTargetable = isAttackTargetSlot(owner, index);
    const disabledEnemyEmpty = owner === "ai" && !card && !targetable && !attackTargetable;
    slot.classList.toggle("targetable", targetable);
    slot.classList.toggle("attack-target", attackTargetable);
    slot.disabled = disabledEnemyEmpty;
    slot.setAttribute("aria-disabled", disabledEnemyEmpty ? "true" : "false");
    slot.setAttribute("aria-label", `${owner === "player" ? "我方" : "敌方"}召唤区 ${index + 1}`);
    if (owner === "player") {
      slot.addEventListener("click", () => handlePlayerSlot(index));
    } else {
      slot.addEventListener("click", () => handleAiSlot(index));
    }
    if (card) {
      const attacksLocked = owner === "player" && state.player.attacksSkipped && card.type === "monster" && !card.used && card.mode !== "defense";
      const cardEl = renderCardElement(document, card, { asset: monsterAsset(card), attacksLocked });
      cardEl.dataset.zone = `${owner}-field`;
      if (card.type === "monster") cardEl.classList.add("field-monster-card");
      cardEl.classList.toggle("selected", state.selected?.zone === "playerField" && state.selected.index === index && owner === "player");
      cardEl.classList.toggle("used", card.used);
      cardEl.classList.toggle("attack-locked", attacksLocked);
      cardEl.classList.toggle("defense", card.mode === "defense");
      cardEl.classList.toggle("targetable", targetable);
      cardEl.classList.toggle("attack-target", attackTargetable);
      if (animationKey === `summon-${owner}-${index}`) cardEl.classList.add("summon-flash");
      if (animationKey === `hit-${owner}-${index}`) cardEl.classList.add("hit-flash");
      if (owner === "player") {
        cardEl.addEventListener("click", (event) => {
          event.stopPropagation();
          selectPlayerMonster(index);
        });
      } else {
        cardEl.addEventListener("click", (event) => {
          event.stopPropagation();
          handleAiSlot(index);
          showDetail(card);
        });
      }
      slot.appendChild(cardEl);
    }
    root.appendChild(slot);
  });
}

function renderTraps(root, duelist, owner) {
  root.innerHTML = "";
  duelist.traps.forEach((card, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `trap-slot ${card ? "" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = index;
    slot.dataset.testid = `${owner}-trap-${index}`;
    const trapChoiceReady = owner === "player" && Boolean(state.pendingTrapChoice?.trapIndexes?.includes(index));
    const trapChoiceSelected = trapChoiceReady && state.pendingTrapChoice?.selectedIndex === index;
    const targetable = isPendingTrapTargetSlot(owner, index);
    slot.classList.toggle("trap-response", trapChoiceReady);
    slot.classList.toggle("trap-response-selected", trapChoiceSelected);
    slot.classList.toggle("targetable", targetable);
    slot.setAttribute("aria-label", `${owner === "player" ? "我方" : "敌方"}陷阱区 ${index + 1}`);
    if (owner === "player") {
      slot.addEventListener("click", () => handlePlayerTrapSlot(index));
    } else {
      slot.addEventListener("click", () => handleAiTrapSlot(index));
    }
    if (card) {
      const cardEl = owner === "player" ? renderCardElement(document, card, { asset: monsterAsset(card) }) : document.createElement("article");
      cardEl.className = owner === "player" ? `${cardEl.className} player-trap` : "card back";
      cardEl.dataset.zone = `${owner}-trap`;
      if (card) {
        cardEl.dataset.cardId = owner === "player" ? card.id || "" : "hidden";
        cardEl.dataset.cardName = owner === "player" ? card.name || "" : "盖放的陷阱";
        cardEl.dataset.cardType = "trap";
      }
      cardEl.classList.toggle("trap-response", trapChoiceReady);
      cardEl.classList.toggle("trap-response-selected", trapChoiceSelected);
      cardEl.classList.toggle("targetable", targetable);
      if (owner === "player") {
        cardEl.addEventListener("click", (event) => {
          event.stopPropagation();
          if (selectPendingTrapChoice(index)) return;
          state.selected = null;
          clearBattlePreview();
          showDetail(card);
          render();
          if (canPlayerAct()) resumePlayerIdleCountdownAfterPassiveIntent();
        });
      }
      slot.appendChild(cardEl);
    }
    root.appendChild(slot);
  });
}

function handActionInfo(card, handIndex) {
  const selected = state.selected?.zone === "hand" && state.selected.uid === card.uid;
  const needsTarget = card.type === "spell" && spellNeedsManualTarget(state.player, card);
  return describeHandAction(card, {
    started: state.started,
    canAct: canUseHandCards(card) || Boolean(state.pendingTarget),
    paused: state.paused,
    pendingTarget: state.pendingTarget,
    selected,
    hasMonsterZone: state.player.field.some((slot) => !slot),
    hasTrapZone: state.player.traps.some((slot) => !slot),
    summonedThisTurn: state.player.normalSummonsUsed > 0,
    extraSummon: state.player.extraSummon,
    monsterValidation: card.type === "monster" ? explainSummonMonsterFromUiState(state, "player", handIndex) : { ok: true },
    trapValidation: card.type === "trap" ? explainSetTrapFromUiState(state, "player", handIndex) : { ok: true },
    spellValidation: card.type === "spell" ? validateSpell(state.player, state.ai, card, handIndex) : { ok: true },
    spellNeedsManualTarget: needsTarget,
    spellTargetPrompt: needsTarget
      ? targetPromptFor(spellTargetMode(card), card.name, card.effect)
      : state.pendingTarget
        ? targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect)
        : ""
  });
}

function renderHand(animationKey) {
  els.hand.innerHTML = "";
  state.player.hand.forEach((card, index) => {
    const cardEl = renderCardElement(document, card, { asset: monsterAsset(card) });
    cardEl.dataset.zone = "hand";
    const action = handActionInfo(card, index);
    cardEl.classList.toggle("selected", state.selected?.zone === "hand" && state.selected.uid === card.uid);
    cardEl.classList.toggle("action-ready", action.ok);
    cardEl.classList.toggle("action-blocked", !action.ok && state.started && canPlayerAct());
    cardEl.title = `${card.name}：${action.reason}`;
    const actionTag = document.createElement("span");
    actionTag.className = "action-tag";
    actionTag.textContent = action.label;
    cardEl.appendChild(actionTag);
    const actionReason = document.createElement("span");
    actionReason.className = "action-reason";
    actionReason.textContent = action.reason;
    cardEl.appendChild(actionReason);
    if (animationKey === "draw-player" && card === state.player.hand[state.player.hand.length - 1]) {
      cardEl.classList.add("draw-flash");
    }
    cardEl.addEventListener("click", () => {
      selectHandCard(card.uid);
    });
    els.hand.appendChild(cardEl);
  });
}

function renderLog() {
  els.log.innerHTML = "";
  const head = document.createElement("div");
  head.className = "log-head";
  head.innerHTML = `<span>当前战况</span><span class="log-badge">最近</span>`;
  els.log.appendChild(head);
  const latest = state.log[0] || (state.started ? "等待行动结算。" : "准备决斗。");
  const current = document.createElement("div");
  current.className = "log-line";
  current.textContent = latest;
  els.log.appendChild(current);
  if (state.log[1]) {
    const previous = document.createElement("div");
    previous.className = "log-line secondary";
    previous.textContent = state.log[1];
    els.log.appendChild(previous);
  }
}

function auditIssueLabel(issue) {
  const labels = {
    "duplicate-log": "重复日志",
    "missing-spell-resolution": "缺少魔法结算",
    "direct-after-block": "直击规则矛盾",
    "missing-attack-resolution": "缺少攻击结算",
    "attack-no-impact": "攻击无影响"
  };
  return labels[issue?.code] || issue?.code || "未知疑点";
}

function renderTimeline() {
  if (!els.timeline) return;
  els.timeline.innerHTML = "";
  if (els.timelineCount) {
    els.timelineCount.textContent = `${state.timeline.length}`;
  }
  if (els.timelineAudit) {
    const audit = auditLogEntries(state.timeline);
    const hasError = audit.issues.some((issue) => issue.severity === "error");
    const firstIssue = audit.issues[0];
    const firstIssueText = firstIssue ? `${auditIssueLabel(firstIssue)} - ${firstIssue.message}` : "";
    els.timelineAudit.textContent = audit.ok ? "审计 OK" : `疑点 ${audit.issueCount}：${firstIssueText}`;
    els.timelineAudit.className = `timeline-audit ${audit.ok ? "ok" : hasError ? "error" : "warn"}`;
    els.timelineAudit.dataset.auditDetail = audit.ok
      ? ""
      : audit.issues.map((issue) => `${auditIssueLabel(issue)}：${issue.message}`).join(" | ");
    els.timelineAudit.title = audit.ok
      ? "日志审计未发现异常。"
      : audit.issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`).join("\n");
  }
  state.timeline.forEach((entry) => {
    const item = document.createElement("div");
    item.className = `timeline-item ${entry.kind}`;
    item.innerHTML = `
      <span class="timeline-step">${entry.step}</span>
      <span class="timeline-text"></span>
    `;
    item.querySelector(".timeline-text").textContent = entry.text;
    els.timeline.appendChild(item);
  });
}

function toggleSound() {
  toggleAudioSound({ previewSound: "turn" });
  render();
}

function toggleVoice() {
  toggleAudioVoice({ owner: "player", key: "start", text: "语音提示已开启。", force: true });
  render();
}

function showAce(card, owner = "player") {
  els.aceName.textContent = `${card.name} 登场`;
  els.aceIcon.textContent = card.icon;
  els.aceLine.textContent = aceLine(card);
  els.aceOverlay.classList.remove("show");
  els.aceOverlay.classList.remove("fire", "wind", "shadow", "light");
  if (card.element) {
    els.aceOverlay.classList.add(card.element);
  }
  void els.aceOverlay.offsetWidth;
  els.aceOverlay.classList.add("show");
  playSound("ace");
  window.setTimeout(() => els.aceOverlay.classList.remove("show"), 2300);
  playDuelistLine(owner, lineFor(owner, "ace", card), true, "ace");
}

function showGuide() {
  clearPlayerIdleTimers();
  els.guideModal.classList.add("show");
}

function closeGuide() {
  markGuideSeen();
  els.guideModal.classList.remove("show");
  if (state.started && !state.paused && state.turn === "player" && state.phase === PHASES.draw && !state.gameOver) {
    scheduleOpeningDraw(450);
  } else {
    resetPlayerIdleCountdown();
  }
}

function hasSeenGuide() {
  if (BROWSER_TEST_MODE) return true;
  try {
    return window.localStorage?.getItem("starDuelGuideSeen") === "1";
  } catch (error) {
    return true;
  }
}

function markGuideSeen() {
  try {
    window.localStorage?.setItem("starDuelGuideSeen", "1");
  } catch (error) {
    // Storage is optional; the guide button remains available.
  }
}

document.addEventListener("pointerdown", () => {
  unlockAudio();
  if (state.started && !state.paused && state.pendingOpeningDraw && state.turn === "player" && state.phase === PHASES.draw && !state.gameOver) {
    window.setTimeout(autoPlayerDraw, 250);
  }
}, { capture: true });

els.guideBtn.addEventListener("click", showGuide);
els.guideClose.addEventListener("click", closeGuide);
els.startBtn.addEventListener("click", startGame);
els.pauseBtn.addEventListener("click", togglePause);
els.skipAttackBtn.addEventListener("click", skipPlayerAttack);
els.endTurnBtn.addEventListener("click", manualEndPlayerTurn);
els.soundBtn.addEventListener("click", toggleSound);
els.voiceBtn.addEventListener("click", toggleVoice);
els.handConfirmBtn.addEventListener("click", () => {
  confirmSelectedHandAction();
});
els.handCancelBtn.addEventListener("click", cancelSelectedHandAction);
els.choiceConfirmBtn.addEventListener("click", () => {
  confirmSelectedHandAction();
});
els.choiceCancelBtn.addEventListener("click", cancelSelectedHandAction);
els.modeBtn.addEventListener("click", toggleSelectedMode);
els.detailBtn.addEventListener("click", openFocusedCardDetail);
els.aiPanel.addEventListener("click", handleAiPanelAttack);
els.zoomClose.addEventListener("click", closeCardDetail);
els.chainYes.addEventListener("click", () => answerChain(true));
els.chainNo.addEventListener("click", () => answerChain(false));
els.restartBtn.addEventListener("click", prepareGame);
els.modalRestart.addEventListener("click", () => {
  if (state.gameOver) {
    prepareGame();
  } else {
    startGame();
  }
});
[els.roleSelect, els.deckSelect, els.aiSelect, els.scenarioSelect].filter(Boolean).forEach((select) => {
  select.addEventListener("change", () => {
    applySetupChoices();
    render();
  });
});

if (BROWSER_TEST_MODE) {
  window.__starDuelTest = Object.freeze({
    snapshot: createTestSnapshot({
      testMode: BROWSER_TEST_MODE,
      state,
      els,
      currentPlayerActions
    })
  });
}

prepareGame();
scheduleBrowserSmoke({
  smoke: BROWSER_SMOKE,
  state,
  els,
  currentPlayerActions,
  render
});
