import { createAudioController, createAudioSettings } from './audio.js';
import { createAnimationController } from './animation.js';
import { createMusicController, createMusicSettings, musicModeForDuel } from './music.js';
import { monsterAssets, roleProfiles, aiProfiles, deckPresets, characterProfiles, scenarioSetups } from './data.js';
import {
  aiSetupOptions,
  deckSetupOptions,
  roleSetupOptions,
  scenarioSetupOptions
} from './setup-options.js';
import { actionsForPhase, shouldRunPlayerIdleCountdown, summarizePlayerActions } from './actions.js';
import {
  aiSupportZoneReserve,
  aiTrapSetLimit,
  collectAiAttackBlockers,
  chooseAiAttackAction,
  chooseAiTrapResponseAction,
  chooseAiSetTrapAction,
  chooseAiSpellAction,
  chooseAiSummonAction,
  chooseAiTurnGoal,
  shouldSwitchSummonedMonsterToDefense
} from './ai.js';
import { battleLogText, describeBattleOutcome } from './battle.js';
import { createBattleLogEntry, logEntryMessage } from './battle-log.js';
import { renderBattlePreviewElement } from './battle-preview-renderer.js';
import { createTestSnapshot, scheduleBrowserSmoke } from './browser-smoke.js';
import { cardDefinitionById, cardDetailViewModel, cardInspectorViewModel } from './card-detail.js';
import { bindCardInspector, renderCardInspector } from './card-inspector-renderer.js';
import { createCardElement as renderCardElement } from './card-renderer.js';
import { buildDuelControlsView, renderDuelControls } from './control-renderer.js';
import { createDirectActivationTracker } from './direct-activation.js';
import {
  hideCardDetailModal,
  renderAiRevealModal,
  renderCardDetailModal,
  renderGameOverDuelModal,
  renderSetupDuelModal,
  resetDuelModal,
  showDuelModal
} from './duel-modal-renderer.js';
import { renderMonsterZones, renderSupportZones } from './field-renderer.js';
import { renderHandCards } from './hand-renderer.js';
import { buildDeck, createDuelist } from './deck.js';
import { aceLine, duelistLabel, duelistName, lineFor } from './duelist-lines.js';
import {
  isContinuousReleaseStat,
  shouldLogGenericDestroyedEvent,
  statChangeText
} from './effect-feedback.js';
import { effectMarkersForCard } from './effect-markers.js';
import { buildAiCardReveal, withAiRevealQueuePosition } from './ai-card-reveal.js';
import { fusionOptionsForCard } from './fusion.js';
import { buildFusionSelectionView, renderFusionSelectionPanel } from './fusion-selection-renderer.js';
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
  dispatchFusionSummonFromUiState,
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
  explainChangeMonsterModeFromUiState,
  explainDeclareAttackFromUiState,
  explainFusionSummonFromUiState,
  explainMonsterAttackReadinessFromUiState,
  explainSetTrapFromUiState,
  explainSummonMonsterFromUiState,
  projectBattleFromUiState
} from './engine-adapter.js';
import { renderChainHistoryPanel, renderTimelinePanel } from './timeline-renderer.js';
import { spellDefinitions } from './spells.js';
import { nextTimelineState } from './timeline.js';
import { selectRedirectTarget, trapActivationText, trapCanResolve, trapConsumesAttack } from './traps.js';
import {
  canActivateTrapResponse,
  createTrapResponse,
  resolveTrapResponse,
  selectTrapResponse
} from './response-state.js';
import {
  beginPendingSelection,
  clearPendingSelection,
  clearTransientSelection,
  createSelectionState,
  selectionStateSnapshot
} from './selection-state.js';
import {
  buildTargetSelectionDisplay,
  collectLegalTargetSelections,
  isSelectedTargetSelection,
  isSupportTargetSelection,
  pendingTargetForCard,
  prepareDefaultTargetSelection,
  resolveSelectedTargetSelection,
  selectTargetSelection,
  spellNeedsManualTarget,
  targetSelectionForCard,
  targetSelectionTargetLabel,
  targetSelectionPrompt,
  validateTargetSelection
} from './target-selection.js';
import {
  prepareTributeSelection,
  selectedTributeIndexes as collectSelectedTributeIndexes,
  toggleTributeIndex,
  tributeCost,
  tributeSelectionAction,
  validateTributeSummonSelection
} from './tribute-selection.js';
import { buildScenarioState } from './scenario-state.js';
import { scenarioTacticalGoal } from './scenario-guidance.js';
import {
  definitionLabel,
  formatDuelStats,
  initializeSetupControlOptions,
  renderSetupPanel,
  syncSetupControlValues
} from './setup-renderer.js';
import { renderCombatHud } from './hud-renderer.js';
import { clearTrapResponsePanel, renderTrapResponsePanel } from './trap-response-renderer.js';
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
  turnStartAttackLockReleases,
  turnStartPatch
} from './turn-state.js';
import {
  buildFusionSelectionDisplay,
  buildSplitTokenDisplay,
  buildTributeSelectionDisplay,
  describeHandAction,
  describeFusionMaterialTarget,
  describeSplitTokenTarget,
  describeTributeTarget,
  duelHintText,
  phaseLabel,
  fusionSummonFailureMessage,
  splitTokenFailureMessage,
  tributeSummonFailureMessage,
  turnLabel
} from './view-model.js';
import {
  MAX_LP,
  MONSTER_ZONE_SIZE,
  battlePreviewText,
  battleValue,
  fieldCards,
  fieldElements,
  makeAttackIntentPreview,
  makeBattlePreview,
  strongestMonster,
  totalAtk,
  weakestMonster
} from './rules.js';

const BROWSER_PARAMS = new URLSearchParams(window.location.search);
const BROWSER_TEST_MODE = BROWSER_PARAMS.has("test");
const BROWSER_MANUAL_VALUE = BROWSER_TEST_MODE ? BROWSER_PARAMS.get("manual") || "" : "";
const BROWSER_MANUAL_MODE = BROWSER_TEST_MODE && BROWSER_PARAMS.has("manual");
const BROWSER_MANUAL_SCENARIO = scenarioIdFromParam(BROWSER_MANUAL_VALUE);
const BROWSER_SMOKE = BROWSER_TEST_MODE ? BROWSER_PARAMS.get("smoke") || "" : "";
const AUTO_END_DELAY_MS = 2800;
const ATTACK_TIMING_MS = Object.freeze({
  preview: 360,
  ace: 360,
  declaration: 520,
  impact: 620
});

function scenarioIdFromParam(value) {
  if (!value) return "";
  if (scenarioSetups[value]) return value;
  const camelValue = value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return scenarioSetups[camelValue] ? camelValue : "";
}

const state = {
  cardDefinitionsComplete: true,
  player: createDuelist("player"),
  ai: createDuelist("ai"),
  turn: "player",
  phase: PHASES.draw,
  timing: TIMINGS.draw,
  ...createSelectionState(),
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
  scenarioId: BROWSER_MANUAL_SCENARIO || "normal",
  stats: loadDuelStats(),
  statsRecorded: false,
  ...createAudioSettings({ testMode: BROWSER_TEST_MODE }),
  ...createMusicSettings({ testMode: BROWSER_TEST_MODE }),
  gameOver: false,
  gameOverWinner: null,
  gameOverLosers: [],
  gameOverReason: "",
  gameOverAnnounced: false,
  log: [],
  logSequence: 0,
  timeline: [],
  timelineStep: 0,
  gameEvents: [],
  battlePreview: null,
  ruleCheckIssue: null
};

let pendingTrapChoiceResolver = null;
let scenarioHintsVisible = false;
let pendingAiReveal = null;
let pendingAiRevealResolver = null;
let pendingAiRevealQueue = [];
let pendingAiRevealIndex = 0;
let pendingAiRevealTotal = 0;
let preDuelDeckExpanded = false;
let chainHistoryExpanded = false;
const directActivationTracker = createDirectActivationTracker();

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
  musicBtn: document.querySelector("#musicBtn"),
  musicVolume: document.querySelector("#musicVolume"),
  voiceBtn: document.querySelector("#voiceBtn"),
  restartBtn: document.querySelector("#restartBtn"),
  playerLp: document.querySelector("#playerLp"),
  aiLp: document.querySelector("#aiLp"),
  playerLifeBar: document.querySelector("#playerLifeBar"),
  aiLifeBar: document.querySelector("#aiLifeBar"),
  playerVitalStatus: document.querySelector("#playerVitalStatus"),
  aiVitalStatus: document.querySelector("#aiVitalStatus"),
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
  graveTargets: document.querySelector("#graveTargets"),
  timeline: document.querySelector("#timeline"),
  timelineCount: document.querySelector("#timelineCount"),
  timelineAudit: document.querySelector("#timelineAudit"),
  timelineLatestStep: document.querySelector("#timelineLatestStep"),
  timelineLatestKind: document.querySelector("#timelineLatestKind"),
  timelineActionCount: document.querySelector("#timelineActionCount"),
  chainHistoryToggle: document.querySelector("#chainHistoryToggle"),
  chainHistoryCount: document.querySelector("#chainHistoryCount"),
  chainHistoryList: document.querySelector("#chainHistoryList"),
  battlePreview: document.querySelector("#battlePreview"),
  handConfirmBtn: document.querySelector("#handConfirmBtn"),
  handCancelBtn: document.querySelector("#handCancelBtn"),
  modeBtn: document.querySelector("#modeBtn"),
  fieldModeBtn: document.querySelector("#fieldModeBtn"),
  fieldModeLabel: document.querySelector("#fieldModeLabel"),
  detailBtn: document.querySelector("#detailBtn"),
  duelHint: document.querySelector("#duelHint"),
  toast: document.querySelector("#toast"),
  effectLayer: document.querySelector("#effectLayer"),
  choiceActions: document.querySelector("#choiceActions"),
  choiceText: document.querySelector("#choiceText"),
  choiceConfirmBtn: document.querySelector("#choiceConfirmBtn"),
  choiceCancelBtn: document.querySelector("#choiceCancelBtn"),
  fusionPreview: document.querySelector("#fusionPreview"),
  fusionPreviewKicker: document.querySelector("#fusionPreviewKicker"),
  fusionPreviewName: document.querySelector("#fusionPreviewName"),
  fusionPreviewStats: document.querySelector("#fusionPreviewStats"),
  fusionResultChoices: document.querySelector("#fusionResultChoices"),
  fusionPreviewMaterials: document.querySelector("#fusionPreviewMaterials"),
  fusionPreviewDetail: document.querySelector("#fusionPreviewDetail"),
  aceOverlay: document.querySelector("#aceOverlay"),
  aceName: document.querySelector("#aceName"),
  aceIcon: document.querySelector("#aceIcon"),
  aceLine: document.querySelector("#aceLine"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalText: document.querySelector("#modalText"),
  modalRestart: document.querySelector("#modalRestart"),
  modalReviewLog: document.querySelector("#modalReviewLog"),
  setupPanel: document.querySelector("#setupPanel"),
  roleSelect: document.querySelector("#roleSelect"),
  deckSelect: document.querySelector("#deckSelect"),
  aiSelect: document.querySelector("#aiSelect"),
  scenarioSelect: document.querySelector("#scenarioSelect"),
  scenarioSelectLabel: document.querySelector("#scenarioSelectLabel"),
  setupStats: document.querySelector("#setupStats"),
  scenarioBrief: document.querySelector("#scenarioBrief"),
  scenarioBriefTitle: document.querySelector("#scenarioBriefTitle"),
  scenarioDifficulty: document.querySelector("#scenarioDifficulty"),
  scenarioObjectives: document.querySelector("#scenarioObjectives"),
  scenarioHintToggle: document.querySelector("#scenarioHintToggle"),
  scenarioHints: document.querySelector("#scenarioHints"),
  preDuelPreview: document.querySelector("#preDuelPreview"),
  preDuelLp: document.querySelector("#preDuelLp"),
  preDuelSkillName: document.querySelector("#preDuelSkillName"),
  preDuelSkillText: document.querySelector("#preDuelSkillText"),
  preDuelRecommended: document.querySelector("#preDuelRecommended"),
  preDuelRecommendedList: document.querySelector("#preDuelRecommendedList"),
  preDuelDeckCount: document.querySelector("#preDuelDeckCount"),
  preDuelDeckToggle: document.querySelector("#preDuelDeckToggle"),
  preDuelDeckList: document.querySelector("#preDuelDeckList"),
  guideModal: document.querySelector("#guideModal"),
  guideClose: document.querySelector("#guideClose"),
  aiRevealModal: document.querySelector("#aiRevealModal"),
  aiRevealTitle: document.querySelector("#aiRevealTitle"),
  aiRevealProgress: document.querySelector("#aiRevealProgress"),
  aiRevealType: document.querySelector("#aiRevealType"),
  aiRevealSummary: document.querySelector("#aiRevealSummary"),
  aiRevealDetail: document.querySelector("#aiRevealDetail"),
  aiRevealContinue: document.querySelector("#aiRevealContinue"),
  cardModal: document.querySelector("#cardModal"),
  zoomName: document.querySelector("#zoomName"),
  zoomCard: document.querySelector("#zoomCard"),
  zoomText: document.querySelector("#zoomText"),
  zoomMeta: document.querySelector("#zoomMeta"),
  zoomClose: document.querySelector("#zoomClose"),
  chainModal: document.querySelector("#chainModal"),
  chainText: document.querySelector("#chainText"),
  chainStack: document.querySelector("#chainStack"),
  chainChoices: document.querySelector("#chainChoices"),
  chainStatus: document.querySelector("#chainStatus"),
  chainYes: document.querySelector("#chainYes"),
  chainNo: document.querySelector("#chainNo")
};

const cardInspectorElements = bindCardInspector(document);

const musicController = createMusicController({
  getSettings: () => ({
    musicOn: state.musicOn,
    musicVolume: state.musicVolume
  }),
  setSettings: (musicSettings) => Object.assign(state, musicSettings)
});

const {
  pause: pauseMusic,
  play: playMusic,
  setMode: setMusicMode,
  setVoiceActive: setMusicVoiceActive,
  setVolume: setMusicVolume,
  status: musicStatus,
  stop: stopMusic,
  toggleMusic: toggleBackgroundMusic,
  unlock: unlockMusic
} = musicController;

const audioController = createAudioController({
  getSettings: () => ({
    soundOn: state.soundOn,
    voiceOn: state.voiceOn,
    voiceReady: state.voiceReady
  }),
  setSettings: (audioSettings) => Object.assign(state, audioSettings),
  announce,
  onVoiceActivity: setMusicVoiceActive
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

const {
  fieldElement,
  trapElement,
  panelElement,
  animateAvatar,
  playDuelistLine,
  playDrawSequence,
  playArrow,
  playEpicAction,
  playLifeDelta,
  playAttackCloseup,
  playAceStrike,
  playSlashBurst,
  playGuardShield,
  shakeScreen,
  playCenterCardEffect,
  playAttackCutIn,
  playMonsterMotion,
  playMonsterPhantom,
  playMonsterCounterPhantom,
  playImpactExplosion,
  playDuelistImpact,
  playMonsterBurst,
  monsterAsset
} = createAnimationController({
  document,
  window,
  els,
  monsterAssets,
  duelistName,
  totalAtk,
  battleValue,
  speak,
  playVoice,
  playSound
});

function showBattlePreview(attacker, target, owner = null, rival = null) {
  state.battlePreview = makeBattlePreview(attacker, target, owner, rival);
}

function clearBattlePreview() {
  state.battlePreview = null;
}

function selectedAttackPreview() {
  if (!canPlayerAct() || state.selected?.zone !== "playerField") return null;
  const attackerIndex = state.selected.index;
  const attacker = state.player.field[attackerIndex];
  if (!attacker) return null;
  const projection = projectBattleFromUiState(state, "player", { attackerIndex });
  if (!projection.inAttackIntentWindow || !projection.attackActions.length) return null;
  if (projection.attackActions.length === 1) {
    const targetIndex = projection.attackActions[0].targetIndex;
    return makeBattlePreview(attacker, targetIndex >= 0 ? state.ai.field[targetIndex] : null, state.player, state.ai);
  }
  return makeAttackIntentPreview(attacker, {
    targetCount: projection.targetIndexes.length,
    canDirectAttack: projection.canDirectAttack
  });
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

function initializeSetupControls() {
  initializeSetupControlOptions(document, els, {
    roleOptions: roleSetupOptions(roleProfiles),
    deckOptions: deckSetupOptions(deckPresets, { testMode: BROWSER_TEST_MODE }),
    aiOptions: aiSetupOptions(aiProfiles),
    scenarioOptions: scenarioSetupOptions(scenarioSetups, { testMode: BROWSER_TEST_MODE }),
    testMode: BROWSER_TEST_MODE,
    values: state
  });
}

function renderAiReveal() {
  renderAiRevealModal(els, pendingAiReveal);
}

function renderNextAiReveal() {
  if (pendingAiReveal || !pendingAiRevealQueue.length) return;
  const next = pendingAiRevealQueue.shift();
  pendingAiRevealIndex += 1;
  pendingAiReveal = withAiRevealQueuePosition(next.reveal, {
    index: pendingAiRevealIndex,
    total: pendingAiRevealTotal
  });
  pendingAiRevealResolver = next.resolve;
  renderAiReveal();
  if (shouldAutoContinueAiReveal()) {
    window.setTimeout(confirmAiRevealContinue, 70);
  }
}

function refreshAiRevealQueueProgress() {
  if (!pendingAiReveal) return;
  pendingAiReveal = withAiRevealQueuePosition(pendingAiReveal, {
    index: pendingAiRevealIndex,
    total: pendingAiRevealTotal
  });
  renderAiReveal();
}

function clearAiReveal(resolveValue = false) {
  pendingAiReveal = null;
  renderAiReveal();
  const resolver = pendingAiRevealResolver;
  pendingAiRevealResolver = null;
  if (resolver) resolver(resolveValue);
  if (!resolveValue) {
    pendingAiRevealQueue.splice(0).forEach((entry) => entry.resolve(false));
    pendingAiRevealIndex = 0;
    pendingAiRevealTotal = 0;
    return;
  }
  if (pendingAiRevealQueue.length) {
    renderNextAiReveal();
    return;
  }
  pendingAiRevealIndex = 0;
  pendingAiRevealTotal = 0;
}

function confirmAiRevealContinue() {
  clearAiReveal(true);
}

function shouldAutoContinueAiReveal() {
  const revealNeedsManualClick = ["ai-card-reveal-confirm", "ai-card-reveal-queue"].includes(BROWSER_SMOKE) ||
    BROWSER_SMOKE === "trio-combined-lethal-planning-basic";
  return Boolean(BROWSER_SMOKE) && !revealNeedsManualClick;
}

function waitForAiReveal(input) {
  const reveal = buildAiCardReveal(input);
  if (!reveal || state.gameOver) return Promise.resolve(false);
  return new Promise((resolve) => {
    if (!pendingAiReveal && pendingAiRevealQueue.length === 0) {
      pendingAiRevealIndex = 0;
      pendingAiRevealTotal = 1;
    } else {
      pendingAiRevealTotal += 1;
      refreshAiRevealQueueProgress();
    }
    pendingAiRevealQueue.push({ reveal, resolve });
    renderNextAiReveal();
  });
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
  syncSetupControlValues(els, state);
}

function applyScenarioSetup() {
  const scenario = scenarioSetups[state.scenarioId];
  if (!scenario || state.scenarioId === "normal") return;
  const scenarioAiStyle = scenario.aiStyle || state.aiStyle;
  if (scenario.aiStyle) state.aiStyle = scenario.aiStyle;
  const setup = buildScenarioState(scenario, {
    playerPreset: state.deckPreset,
    aiPreset: aiProfiles[scenarioAiStyle]?.deckPreset || "balanced"
  });
  Object.assign(state.player, setup.player);
  Object.assign(state.ai, setup.ai);
  state.gameEvents = Array.isArray(setup.gameEvents) ? setup.gameEvents.map((event) => ({ ...event })) : [];
  const scenarioKind = !BROWSER_TEST_MODE && scenario.setupVisibility === "player" ? "玩法场景" : "规则测试场景";
  addLog(`${scenarioKind}：${scenario.label}。${scenario.text}`);
  if (scenario.goal) {
    addLog(`${scenarioKind === "玩法场景" ? "场景目标" : "测试目标"}：${scenario.goal}`);
  }
  return scenario;
}

function currentMusicMode() {
  return musicModeForDuel({
    started: state.started,
    paused: state.paused,
    gameOver: state.gameOver,
    playerLp: state.player.lp,
    aiLp: state.ai.lp
  });
}

function startGame() {
  stopAll();
  stopMusic({ fadeMs: 80 });
  closeTrapChoicePrompt();
  clearAiReveal(false);
  applySetupChoices();
  Object.assign(state.player, createDuelist("player", characterProfiles.player.passive));
  Object.assign(state.ai, createDuelist("ai", characterProfiles.ai.passive));
  state.player.deck = buildDeck(state.deckPreset);
  state.ai.deck = buildDeck(aiProfiles[state.aiStyle]?.deckPreset || "balanced");
  state.turn = "player";
  state.phase = "draw";
  clearTransientSelection(state);
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
  state.logSequence = 0;
  state.timeline = [];
  state.timelineStep = 0;
  state.gameEvents = [];
  chainHistoryExpanded = false;
  resetDuelModal(els);
  if (state.scenarioId === "normal") {
    drawCards(state.player, 5, { announce: false, reason: "opening" });
    drawCards(state.ai, 5, { announce: false, reason: "opening" });
  } else {
    const scenario = applyScenarioSetup();
    const openingDrawCount = Math.max(0, Math.min(10, Number(scenario?.openingDrawCount) || 0));
    if (openingDrawCount > 0) {
      drawCards(state.player, openingDrawCount, { announce: false, reason: "opening" });
      drawCards(state.ai, openingDrawCount, { announce: false, reason: "opening" });
    }
  }
  addLog("决斗开始。你先攻，抽卡后展开第一波攻势。");
  addLog(`基础扩展已启用：${characterProfiles.player.skill} / ${definitionLabel(deckPresets, state.deckPreset)} / ${characterProfiles.ai.name}。`);
  addLog("教学目标：召唤怪兽、发动魔法或盖陷阱，然后完成一次攻击。");
  playMusic(currentMusicMode());
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
  stopMusic({ fadeMs: 220 });
  closeTrapChoicePrompt();
  clearAiReveal(false);
  scenarioHintsVisible = true;
  preDuelDeckExpanded = false;
  chainHistoryExpanded = false;
  if (BROWSER_MANUAL_SCENARIO && state.scenarioId === BROWSER_MANUAL_SCENARIO) {
    syncSetupControls();
  }
  applySetupChoices();
  syncSetupControls();
  Object.assign(state.player, createDuelist("player", characterProfiles.player.passive));
  Object.assign(state.ai, createDuelist("ai", characterProfiles.ai.passive));
  state.turn = "player";
  state.phase = "ready";
  clearTransientSelection(state);
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
  state.log = ["先查看场景目标、提示和己方卡组，再点击“开始决斗”。"];
  state.logSequence = 0;
  state.timeline = [];
  state.timelineStep = 0;
  state.gameEvents = [];
  clearPlayerIdleTimers();
  renderSetupDuelModal(els);
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
    playDrawSequence(duelist.owner, drawn);
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
    const responsePlayerId = windowName === ACTION_WINDOWS.response
      ? currentEngineMachine()?.responseWindow?.playerId
      : null;
    return dispatchOpenActionWindowFromUiState(
      state,
      options.playerId || responsePlayerId || state.turn || "player",
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

function currentSplitTokenDisplay(sourceMonster = null) {
  const token = cardDefinitionById("spark-fragment-token");
  return buildSplitTokenDisplay({
    sourceName: state.pendingTarget?.cardName || "星火分裂",
    tokenName: token?.name || "星火衍生体",
    count: 2,
    field: state.player.field,
    sourceMonster
  });
}

function currentTargetSelectionDisplay(pending = state.pendingTarget) {
  const display = buildTargetSelectionDisplay(pending, {
    player: state.player,
    ai: state.ai
  });
  if (pending?.effect !== "splitToken") return display;
  const split = currentSplitTokenDisplay(display.selectedTarget?.card || null);
  const selectionText = display.complete
    ? `${display.selectedByDefault ? "已默认选择" : "已选择"}：${display.selectedName}。`
    : "尚未选择分裂来源。";
  return {
    ...display,
    text: [
      split.text,
      selectionText,
      display.complete ? "点击其他高亮目标可以更换，确认后发动。" : "请点击一个高亮目标。"
    ].join("\n")
  };
}

function clearPendingTarget() {
  clearPendingSelection(state, "target");
  if (state.actionWindow === ACTION_WINDOWS.targetSelect) {
    setActionWindow(state.phase === PHASES.battle ? ACTION_WINDOWS.battle : ACTION_WINDOWS.main, { reason: "target cleared" });
  }
}

function beginSpellTargetSelection(handIndex, card) {
  const initialTarget = pendingTargetForCard(card, handIndex, spellEffects);
  const pendingTarget = prepareDefaultTargetSelection(initialTarget, {
    player: state.player,
    ai: state.ai
  });
  if (!pendingTarget) return false;
  const targets = collectLegalTargetSelections(pendingTarget, {
    player: state.player,
    ai: state.ai
  });
  if (!targets.length) {
    state.selected = null;
    cue(`${card.name} 没有合法目标，不能发动。`);
    render();
    resolvePlayerActionWindow("没有合法目标");
    return false;
  }
  beginPendingSelection(
    state,
    "target",
    pendingTarget,
    { zone: "hand", uid: card.uid }
  );
  setActionWindow(ACTION_WINDOWS.targetSelect, { reason: `target:${card.uid}` });
  const display = currentTargetSelectionDisplay(pendingTarget);
  cue(display.text);
  addLog(display.selectedByDefault
    ? `等待确认 ${card.name} 的目标，唯一合法目标已自动选择：${display.selectedName}。`
    : `等待选择 ${card.name} 的目标，共有 ${display.legalCount} 个合法目标。`);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function validateCurrentTarget(ownerName, index, zone = "field") {
  if (state.pendingTarget?.effect === "splitToken") {
    const duelist = ownerName === "player" ? state.player : state.ai;
    const splitTarget = describeSplitTokenTarget({
      owner: ownerName,
      card: zone === "field" ? duelist?.field?.[index] : null
    });
    if (!splitTarget.ok) return splitTarget;
  }
  return validateTargetSelection(
    state.pendingTarget,
    { player: state.player, ai: state.ai },
    ownerName,
    index,
    zone
  );
}

function isPendingTargetSlot(ownerName, index) {
  if (!state.pendingTarget) return false;
  return validateCurrentTarget(ownerName, index).ok;
}

function isPendingTrapTargetSlot(ownerName, index) {
  if (!state.pendingTarget) return false;
  return validateCurrentTarget(ownerName, index, "traps").ok;
}

async function resolvePendingSpellTarget(ownerName, index, zone = "field") {
  if (!state.pendingTarget) return false;
  const targetInfo = validateCurrentTarget(ownerName, index, zone);
  if (!targetInfo.ok) {
    cue(targetInfo.reason);
    return true;
  }
  notePlayerIntent();
  const handIndex = state.player.hand.findIndex((card) => card.uid === state.pendingTarget.handUid);
  if (handIndex < 0) {
    clearPendingTarget();
    state.selected = null;
    cue("这张魔法卡已经不在手牌里。");
    render();
    resumePlayerIdleCountdownAfterPassiveIntent();
    return true;
  }
  await playSpell(state.player, state.ai, handIndex, targetInfo);
  return true;
}

function selectPendingSpellTarget(ownerName, index, zone = "field") {
  if (!state.pendingTarget) return false;
  const targetInfo = validateCurrentTarget(ownerName, index, zone);
  if (!targetInfo.ok) {
    cue(targetInfo.reason);
    return true;
  }
  notePlayerIntent();
  state.pendingTarget = selectTargetSelection(state.pendingTarget, targetInfo, { source: "player" });
  const display = currentTargetSelectionDisplay();
  playSound("click");
  cue(`${targetSelectionTargetLabel(targetInfo)}已选为目标，请确认发动。`);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function interactWithPendingSpellTarget(ownerName, index, zone = "field", { directActivate = false } = {}) {
  return directActivate
    ? resolvePendingSpellTarget(ownerName, index, zone)
    : selectPendingSpellTarget(ownerName, index, zone);
}

async function resolvePendingSpellDefault({ directActivate = false } = {}) {
  if (!state.pendingTarget) return false;
  const cardName = state.pendingTarget.cardName;
  const duelists = { player: state.player, ai: state.ai };
  const legalTargets = collectLegalTargetSelections(state.pendingTarget, duelists);
  if (directActivate && legalTargets.length > 1) {
    cue(`${cardName} 有 ${legalTargets.length} 个合法目标，请先点击目标，再使用确认按钮发动。`);
    render();
    resetPlayerIdleCountdown();
    return true;
  }
  let target = resolveSelectedTargetSelection(state.pendingTarget, {
    player: state.player,
    ai: state.ai
  });
  if (!target) {
    const refreshed = prepareDefaultTargetSelection(state.pendingTarget, {
      player: state.player,
      ai: state.ai
    });
    target = resolveSelectedTargetSelection(refreshed, {
      player: state.player,
      ai: state.ai
    });
    if (target) {
      state.pendingTarget = refreshed;
      cue(`原目标已失效，已重新选择 ${targetSelectionTargetLabel(target)}，请再次确认。`);
      render();
      resetPlayerIdleCountdown();
      return true;
    }
    const refreshedTargets = collectLegalTargetSelections(refreshed, duelists);
    if (refreshedTargets.length > 0) {
      state.pendingTarget = refreshed;
      cue(`${cardName} 有 ${refreshedTargets.length} 个合法目标，请先点击一个目标。`);
      render();
      resetPlayerIdleCountdown();
      return true;
    }
    clearPendingTarget();
    state.selected = null;
    clearBattlePreview();
    cue(`${cardName} 没有合法目标，已取消发动。`);
    addLog(`${cardName} 没有合法目标，未发动。`);
    render();
    resolvePlayerActionWindow("目标无效");
    return true;
  }
  cue(`确认目标：${targetSelectionTargetLabel(target)}。`);
  return await resolvePendingSpellTarget(target.owner, target.index, target.zone);
}

function canChangeAnyPlayerMode() {
  return currentPlayerActions().mode;
}

function hasPlayerMainAction() {
  return currentPlayerActions().hasAny;
}

function resolvePlayerActionWindow(reason = "操作完成", animationKey = "") {
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
    render(animationKey);
    return;
  }
  cancelAutoEnd();
  if (decision.kind === "main") {
    setActionWindow(decision.actionWindow, { reason });
    resetPlayerIdleCountdown();
    if (!actions.attack && actions.spell) {
      cue(`${reason}，还有可发动的卡牌。`);
    }
    render(animationKey);
  } else if (decision.kind === "battle") {
    if (decision.enterBattle) {
      enterPlayerBattlePhase(reason);
      return;
    }
    setActionWindow(decision.actionWindow, { reason });
    resetPlayerIdleCountdown();
    render(animationKey);
  } else if (decision.kind === "autoEnd") {
    scheduleAutoEnd(reason);
  }
}

function hasAvailablePlayerAttack() {
  return projectBattleFromUiState(state, "player").canAttack;
}

async function selectHandCard(uid, { directActivate = false } = {}) {
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
      if (directActivate) {
        await resolvePendingSpellDefault({ directActivate: true });
        return;
      }
      showDetail(card);
      cue(currentTargetSelectionDisplay().text);
      playSound("click");
      render();
      resetPlayerIdleCountdown();
      return;
    } else {
      const switchHandIndex = state.player.hand.findIndex((item) => item.uid === uid);
      const switchAction = handActionInfo(card, switchHandIndex);
      if (!switchAction.ok) {
        cue(switchAction.reason);
        playSound("click");
        showDetail(card);
        render();
        resetPlayerIdleCountdown();
        return;
      }
      const previousCardName = state.pendingTarget.cardName;
      clearPendingTarget();
      state.selected = null;
      clearBattlePreview();
      addLog(`已取消 ${previousCardName} 的目标选择，改选 ${card.name}。`);
    }
  }
  if (state.pendingTribute && state.pendingTribute.handUid !== uid) {
    clearPendingSelection(state, "tribute");
    clearBattlePreview();
  }
  if (state.pendingFusion && state.pendingFusion.handUid !== uid) {
    notePlayerIntent();
    toggleFusionHandSelection(uid);
    return;
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
  if (card.type === "spell" && spellNeedsManualTarget(state.player, card, spellEffects)) {
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

function beginTributeSelection(handIndex, card) {
  const prepared = prepareTributeSelection(card, handIndex, state.player.field);
  if (!prepared.handled) return false;
  if (!prepared.ok) {
    cue(prepared.reason);
    resumePlayerIdleCountdownAfterPassiveIntent();
    return true;
  }
  notePlayerIntent();
  clearBattlePreview();
  beginPendingSelection(
    state,
    "tribute",
    prepared.pending,
    { zone: "hand", uid: card.uid }
  );
  cue(buildTributeSelectionDisplay({
    cardName: card.name,
    cost: prepared.pending.cost,
    field: state.player.field,
    selectedIndexes: prepared.pending.selectedIndexes
  }).text);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function selectedTributeIndexes() {
  return collectSelectedTributeIndexes(state.pendingTribute, state.player.field);
}

function currentTributeSelectionDisplay() {
  if (!state.pendingTribute) return null;
  return buildTributeSelectionDisplay({
    cardName: state.pendingTribute.cardName,
    cost: state.pendingTribute.cost,
    field: state.player.field,
    selectedIndexes: selectedTributeIndexes()
  });
}

function toggleTributeSelection(index) {
  const selected = selectedTributeIndexes();
  const target = describeTributeTarget({
    owner: "player",
    card: state.player.field[index],
    selected: selected.includes(index)
  });
  if (!target.ok) {
    cue(target.reason);
    resetPlayerIdleCountdown();
    return true;
  }
  const selection = toggleTributeIndex(
    state.pendingTribute,
    state.player.hand,
    state.player.field,
    index
  );
  if (!selection.ok) {
    if (selection.expired) {
      clearPendingSelection(state, "tribute");
      render();
      return false;
    }
    cue(selection.reason);
    resetPlayerIdleCountdown();
    return true;
  }
  state.pendingTribute.selectedIndexes = selection.selectedIndexes;
  state.selected = { zone: "hand", uid: selection.handCard.uid };
  showDetail(selection.card);
  const display = currentTributeSelectionDisplay();
  cue(`${display.selectionText} ${display.instructionText}`);
  render();
  resetPlayerIdleCountdown();
  return true;
}

async function confirmTributeSummon(fieldIndex = null) {
  const selection = validateTributeSummonSelection(
    state.pendingTribute,
    { hand: state.player.hand, field: state.player.field },
    fieldIndex
  );
  if (!selection.ok) {
    if (selection.expired) {
      clearPendingSelection(state, "tribute");
      cue(selection.reason);
      render();
      resumePlayerIdleCountdownAfterPassiveIntent();
      return false;
    }
    cue(currentTributeSelectionDisplay()?.instructionText || selection.reason);
    resetPlayerIdleCountdown();
    return false;
  }
  const summoned = await summonMonster(
    state.player,
    state.ai,
    selection.handIndex,
    selection.summonIndex,
    { tributeIndexes: selection.tributeIndexes }
  );
  if (!summoned) {
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  clearTransientSelection(state);
  render("summon-player-" + selection.summonIndex);
  resolvePlayerActionWindow("祭品召唤完成", "summon-player-" + selection.summonIndex);
  return true;
}

function templateIdForCard(card) {
  return card?.templateId || card?.id || "";
}

function fusionDefinitions(card) {
  return fusionOptionsForCard(card)
    .map((option) => ({ resultId: option.resultTemplateId, materials: option.materials }));
}

function fusionDefinition(card, resultId = "") {
  const options = fusionDefinitions(card);
  if (options.length === 0) return null;
  return options.find((option) => option.resultId === resultId) || options[0];
}

function fusionMaterialCount(materials = []) {
  return materials.reduce((total, entry) => total + Math.max(1, Number(entry.count) || 1), 0);
}

function fusionMaterialNames(materials = []) {
  return materials
    .map((entry) => {
      const definition = cardDefinitionById(entry.templateId);
      const name = definition?.name || entry.templateId;
      return entry.count > 1 ? `${name} ×${entry.count}` : name;
    })
    .join("、");
}

function fusionOptionReady(card, fusion) {
  const available = [
    ...state.player.field.filter(Boolean),
    ...state.player.hand.filter((entry) => entry.uid !== card.uid)
  ].map(templateIdForCard);
  const hasMaterials = fusion.materials.every((requirement) => {
    for (let index = 0; index < requirement.count; index += 1) {
      const found = available.indexOf(requirement.templateId);
      if (found < 0) return false;
      available.splice(found, 1);
    }
    return true;
  });
  return hasMaterials && [...state.player.hand, ...state.player.deck]
    .some((entry) => templateIdForCard(entry) === fusion.resultId);
}

function fusionSummonReady(card) {
  return fusionDefinitions(card).some((fusion) => fusionOptionReady(card, fusion));
}

function beginFusionSelection(handIndex, card) {
  const options = fusionDefinitions(card).filter((fusion) => fusionOptionReady(card, fusion));
  const fusion = options[0];
  if (!fusion) return false;
  if (!fusionSummonReady(card)) {
    cue(`${card.name} 需要手牌或场上的 ${fusionMaterialNames(fusion.materials)}，并且手牌或卡组里要有可登场的融合怪兽。`);
    resumePlayerIdleCountdownAfterPassiveIntent();
    return true;
  }
  notePlayerIntent();
  clearBattlePreview();
  beginPendingSelection(
    state,
    "fusion",
    {
      handUid: card.uid,
      handIndex,
      cardName: card.name,
      resultOptions: options,
      resultId: options.length === 1 ? fusion.resultId : "",
      materials: options.length === 1 ? fusion.materials : [],
      selectedIndexes: [],
      selectedHandUids: []
    },
    { zone: "hand", uid: card.uid }
  );
  cue(currentFusionSelectionDisplay().text);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function pendingFusionHandInfo() {
  const pending = state.pendingFusion;
  if (!pending) return null;
  const index = state.player.hand.findIndex((card) => card.uid === pending.handUid);
  if (index < 0) return null;
  return { card: state.player.hand[index], index, pending };
}

function selectedFusionIndexes() {
  return (state.pendingFusion?.selectedIndexes || []).filter((index) => Boolean(state.player.field[index]));
}

function selectedFusionHandUids() {
  const sourceUid = state.pendingFusion?.handUid;
  return (state.pendingFusion?.selectedHandUids || [])
    .filter((uid) => uid !== sourceUid && state.player.hand.some((card) => card.uid === uid));
}

function selectedFusionMaterials() {
  return [
    ...selectedFusionIndexes().map((index) => ({ zone: "field", index, card: state.player.field[index] })),
    ...selectedFusionHandUids().map((uid) => ({
      zone: "hand",
      uid,
      card: state.player.hand.find((entry) => entry.uid === uid)
    }))
  ].filter((entry) => entry.card);
}

function fusionSelectionStatus(materials = selectedFusionMaterials()) {
  const info = pendingFusionHandInfo();
  if (!info) return { complete: false, invalid: true, selectedCount: 0, requiredCount: 0, remaining: [] };
  if (!info.pending.resultId) {
    return { complete: false, invalid: false, needsResult: true, selectedCount: 0, requiredCount: 0, remaining: [] };
  }
  const remaining = info.pending.materials.map((entry) => ({ ...entry }));
  let invalid = false;
  materials.forEach(({ card }) => {
    const match = card && remaining.find((entry) => entry.count > 0 && templateIdForCard(card) === entry.templateId);
    if (!match) {
      invalid = true;
      return;
    }
    match.count -= 1;
  });
  const requiredCount = fusionMaterialCount(info.pending.materials);
  return {
    complete: !invalid && materials.length === requiredCount && remaining.every((entry) => entry.count === 0),
    invalid,
    selectedCount: materials.length,
    requiredCount,
    remaining
  };
}

function namedFusionRequirements(materials = state.pendingFusion?.materials || []) {
  return materials.map((entry) => ({
    ...entry,
    name: cardDefinitionById(entry.templateId)?.name || entry.templateId
  }));
}

function currentFusionSelectionDisplay() {
  const info = pendingFusionHandInfo();
  if (!info) return null;
  const result = info.pending.resultId ? cardDefinitionById(info.pending.resultId) : null;
  return buildFusionSelectionDisplay({
    sourceName: info.card.name,
    resultName: result?.name || info.pending.resultId || "",
    requirements: namedFusionRequirements(info.pending.materials),
    selectedMaterials: selectedFusionMaterials().map(({ zone, card }) => ({
      templateId: templateIdForCard(card),
      name: card.name,
      zone
    })),
    needsResult: !info.pending.resultId
  });
}

function currentFusionMaterialTarget(owner, card, selected = false) {
  const info = pendingFusionHandInfo();
  if (!info || !info.pending.resultId) return null;
  const status = fusionSelectionStatus();
  return describeFusionMaterialTarget({
    owner,
    card,
    sourceUid: info.pending.handUid,
    selected,
    requirements: info.pending.materials,
    remaining: status.remaining
  });
}

function selectFusionResult(resultId) {
  const info = pendingFusionHandInfo();
  const option = info?.pending.resultOptions?.find((entry) => entry.resultId === resultId);
  if (!info || !option) return false;
  info.pending.resultId = option.resultId;
  info.pending.materials = option.materials.map((entry) => ({ ...entry }));
  info.pending.selectedIndexes = [];
  info.pending.selectedHandUids = [];
  state.selected = { zone: "hand", uid: info.card.uid };
  cue(currentFusionSelectionDisplay().text);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function currentFusionSelectionView() {
  const info = pendingFusionHandInfo();
  return buildFusionSelectionView({
    pendingFusion: info?.pending || null,
    status: info ? fusionSelectionStatus() : null,
    selectedMaterials: info ? selectedFusionMaterials() : [],
    findCard: cardDefinitionById,
    formatMaterials: fusionMaterialNames
  });
}

function isFusionMaterialCandidate(index) {
  const info = pendingFusionHandInfo();
  if (!info) return false;
  const card = state.player.field[index];
  if (!card) return false;
  return Boolean(currentFusionMaterialTarget("player", card, selectedFusionIndexes().includes(index))?.ok);
}

function isFusionHandMaterialCandidate(uid) {
  const info = pendingFusionHandInfo();
  if (!info || uid === info.card.uid) return false;
  const card = state.player.hand.find((entry) => entry.uid === uid);
  if (!card || card.type !== "monster") return false;
  return Boolean(currentFusionMaterialTarget("player", card, selectedFusionHandUids().includes(uid))?.ok);
}

function toggleFusionSelection(index) {
  const info = pendingFusionHandInfo();
  if (!info) {
    clearPendingSelection(state, "fusion");
    render();
    return false;
  }
  const card = state.player.field[index];
  if (!info.pending.resultId) {
    cue(currentFusionSelectionDisplay().requirementText);
    resetPlayerIdleCountdown();
    return true;
  }
  if (!card) {
    cue(describeFusionMaterialTarget({ owner: "player", card }).reason);
    resetPlayerIdleCountdown();
    return true;
  }
  const selected = selectedFusionIndexes();
  const existing = selected.indexOf(index);
  if (existing >= 0) {
    selected.splice(existing, 1);
  } else if (isFusionMaterialCandidate(index)) {
    selected.push(index);
  } else {
    cue(currentFusionMaterialTarget("player", card, false).reason);
    resetPlayerIdleCountdown();
    return true;
  }
  info.pending.selectedIndexes = selected;
  state.selected = { zone: "hand", uid: info.card.uid };
  showDetail(card);
  cue(currentFusionSelectionDisplay().text);
  render();
  resetPlayerIdleCountdown();
  return true;
}

function toggleFusionHandSelection(uid) {
  const info = pendingFusionHandInfo();
  if (!info) {
    clearPendingSelection(state, "fusion");
    render();
    return false;
  }
  const card = state.player.hand.find((entry) => entry.uid === uid);
  if (!card || uid === info.card.uid) return false;
  if (!info.pending.resultId) {
    cue(currentFusionSelectionDisplay().requirementText);
    resetPlayerIdleCountdown();
    return true;
  }
  const selected = selectedFusionHandUids();
  const existing = selected.indexOf(uid);
  if (existing >= 0) {
    selected.splice(existing, 1);
  } else if (isFusionHandMaterialCandidate(uid)) {
    selected.push(uid);
  } else {
    cue(currentFusionMaterialTarget("player", card, false).reason);
    resetPlayerIdleCountdown();
    return true;
  }
  info.pending.selectedHandUids = selected;
  state.selected = { zone: "hand", uid: info.card.uid };
  showDetail(card);
  cue(currentFusionSelectionDisplay().text);
  render();
  resetPlayerIdleCountdown();
  return true;
}

async function confirmFusionSummon(fieldIndex = null) {
  const info = pendingFusionHandInfo();
  if (!info) {
    clearPendingSelection(state, "fusion");
    cue("融合召唤已失效。");
    render();
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  const materialIndexes = selectedFusionIndexes();
  const materialHandUids = selectedFusionHandUids();
  const materials = selectedFusionMaterials();
  const status = fusionSelectionStatus(materials);
  if (!info.pending.resultId) {
    cue("请先选择要融合召唤的怪兽。");
    resetPlayerIdleCountdown();
    return false;
  }
  if (!status.complete) {
    cue(currentFusionSelectionDisplay().remainingText);
    resetPlayerIdleCountdown();
    return false;
  }
  const summonIndex = Number.isInteger(fieldIndex)
    ? fieldIndex
    : materialIndexes[0] ?? state.player.field.findIndex((slot) => !slot);
  const materialCards = materials.map((entry) => entry.card);
  const materialCardIds = [
    ...materialIndexes.map((index) => state.player.field[index]?.uid).filter(Boolean),
    ...materialHandUids
  ];
  let fusionEvents = [];
  try {
    fusionEvents = dispatchFusionSummonFromUiState(state, "player", "ai", info.index, {
      fusionResultTemplateId: info.pending.resultId,
      materialIndexes,
      materialCardIds,
      fieldIndex: summonIndex
    });
  } catch (error) {
    cue(fusionSummonFailureMessage(error.message));
    console.error(error);
    resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  const resultEvent = fusionEvents.find((event) => event.type === "MONSTER_SUMMONED" && event.summonType === "fusion");
  const resultCard = findRuntimeCard(resultEvent?.cardId)?.card || cardDefinitionById(info.pending.resultId);
  playSound(`spell-${info.card.effect}`);
  animateAvatar("player", "cast");
  playCenterCardEffect(info.card, spellCaption(info.card));
  addLog(`你发动魔法卡 ${info.card.name}。`, cardLogMeta(info.card, { actor: "player", type: "spell" }));
  addLog(`你将 ${materialCards.map((material) => `「${material.name}」`).join("、")} 作为融合素材，融合召唤了「${resultCard?.name || info.pending.resultId}」。`, cardLogMeta(info.card, {
    actor: "player",
    type: "fusion-summon",
    relatedCardIds: relatedCardIds(resultCard, ...materialCards)
  }));
  resolveEngineSpellFeedback(state.player, state.ai, info.card, fusionEvents);
  resolveElementCombos(state.player, state.ai, "spell");
  clearTransientSelection(state);
  checkGameOver();
  render("summon-player-" + summonIndex);
  if (!state.gameOver) resolvePlayerActionWindow("融合召唤完成", "summon-player-" + summonIndex);
  return true;
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
    await sleep(ATTACK_TIMING_MS.preview);
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
    resolvePlayerActionWindow("攻击完成", targetIndex >= 0 ? "hit-ai-" + targetIndex : "hit-ai-direct");
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
    cue(currentTargetSelectionDisplay().text);
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
  if (state.pendingFusion) return "确认融合召唤";
  if (state.pendingTribute) return "确认祭品召唤";
  if (!card) return "确认";
  if (card.type === "spell") {
    if (fusionDefinition(card)) return "确认融合";
    return spellNeedsManualTarget(state.player, card, spellEffects) ? "确认选目标" : "确认发动";
  }
  if (card.type === "monster") return "确认召唤";
  if (card.type === "trap") return "确认盖放";
  return "确认";
}

async function confirmSelectedHandAction() {
  if (state.pendingTarget) {
    await resolvePendingSpellDefault();
    return;
  }
  if (state.pendingFusion) {
    await confirmFusionSummon();
    return;
  }
  if (state.pendingTribute) {
    await confirmTributeSummon();
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
    if (fusionDefinition(selected.card)) {
      beginFusionSelection(selected.index, selected.card);
      return;
    }
    await playSpell(state.player, state.ai, selected.index);
    return;
  }
  if (selected.card.type === "monster") {
    if (tributeCost(selected.card) > 0) {
      beginTributeSelection(selected.index, selected.card);
      return;
    }
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
    await handlePlayerTrapSlot(empty);
  }
}

function cancelSelectedHandAction() {
  const selectionSnapshot = selectionStateSnapshot(state);
  const hadPendingTarget = selectionSnapshot.pendingKinds.includes("target");
  const hadPendingTribute = selectionSnapshot.pendingKinds.includes("tribute");
  const hadPendingFusion = selectionSnapshot.pendingKinds.includes("fusion");
  const selected = selectedHandInfo();
  if (!hadPendingTarget && !hadPendingTribute && !hadPendingFusion && !selected) {
    cue("当前没有选中的手牌。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  clearPendingTarget();
  clearTransientSelection(state);
  clearBattlePreview();
  playSound("click");
  cue(hadPendingTarget ? "已取消目标选择。" : "已取消选择。");
  render();
  resolvePlayerActionWindow(hadPendingTarget ? "取消目标选择" : "取消选择");
}

async function selectPlayerMonster(index, interaction = {}) {
  const card = state.player.field[index];
  if (!card) return;
  if (!canPlayerAct()) {
    showDetail(card);
    render();
    return;
  }
  if (state.pendingTribute) {
    notePlayerIntent();
    toggleTributeSelection(index);
    return;
  }
  if (state.pendingFusion) {
    notePlayerIntent();
    toggleFusionSelection(index);
    return;
  }
  const wasSelected = state.selected?.zone === "playerField" && state.selected.index === index;
  if (wasSelected && !state.pendingTarget && canUseAttackIntentWindow()) {
    quickAttackOnlyTarget(index);
    return;
  }
  if (state.pendingTarget) {
    interactWithPendingSpellTarget("player", index, "field", interaction);
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

async function handlePlayerSlot(index, interaction = {}) {
  if (state.pendingTarget) {
    interactWithPendingSpellTarget("player", index, "field", interaction);
    return;
  }
  if (state.pendingTribute) {
    notePlayerIntent();
    toggleTributeSelection(index);
    return;
  }
  if (state.pendingFusion) {
    notePlayerIntent();
    toggleFusionSelection(index);
    return;
  }
  if (!canPlayerAct() || !state.selected) return;
  notePlayerIntent();
  if (state.selected.zone !== "hand") {
    await selectPlayerMonster(index);
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
    if (fusionDefinition(card)) {
      beginFusionSelection(handIndex, card);
      return;
    }
    await playSpell(state.player, state.ai, handIndex);
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
  if (tributeCost(card) > 0) {
    beginTributeSelection(handIndex, card);
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
  resolvePlayerActionWindow("召唤完成", "summon-player-" + index);
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

function interactWithPendingTrapChoice(index, { directActivate = false } = {}) {
  return directActivate
    ? activatePendingTrapChoice(index)
    : selectPendingTrapChoice(index);
}

function activatePendingTrapChoice(index) {
  const choice = state.pendingTrapChoice;
  const nextChoice = selectTrapResponse(choice, index);
  if (!nextChoice || !pendingTrapChoiceResolver || !canActivateTrapResponse(nextChoice, state.player.traps)) return false;
  state.pendingTrapChoice = nextChoice;
  answerChain(true);
  return true;
}

async function handlePlayerTrapSlot(index, interaction = {}) {
  if (state.pendingTrapChoice) {
    interactWithPendingTrapChoice(index, interaction);
    return;
  }
  const existing = state.player.traps[index];
  if (state.pendingTarget) {
    interactWithPendingSpellTarget("player", index, "traps", interaction);
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

async function handleAiTrapSlot(index, interaction = {}) {
  const card = state.ai.traps[index];
  if (state.pendingTarget) {
    interactWithPendingSpellTarget("ai", index, "traps", interaction);
    return;
  }
  if (card) {
    state.selected = null;
    clearBattlePreview();
    showDetail({ type: "trap", name: "盖放的陷阱", icon: "?", text: "这张卡还没有被公开。", concealed: true });
    render();
  }
}

async function handleAiSlot(index, interaction = {}) {
  const card = state.ai.field[index];
  if (state.pendingTribute && canPlayerAct()) {
    notePlayerIntent();
    cue(describeTributeTarget({ owner: "ai", card }).reason);
    resetPlayerIdleCountdown();
    return;
  }
  if (state.pendingFusion && canPlayerAct()) {
    notePlayerIntent();
    const target = currentFusionMaterialTarget("ai", card, false);
    cue(target?.reason || currentFusionSelectionDisplay().requirementText);
    resetPlayerIdleCountdown();
    return;
  }
  if (state.pendingTarget?.effect === "splitToken" && canPlayerAct()) {
    interactWithPendingSpellTarget("ai", index, "field", interaction);
    return;
  }
  if (state.pendingTarget && canPlayerAct()) {
    if (card) showDetail(card);
    interactWithPendingSpellTarget("ai", index, "field", interaction);
    return;
  }
  if (!card) return;
  if (!canPlayerAct()) {
    showDetail(card);
    return;
  }
  notePlayerIntent();
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
    showDetail(card);
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
    cue(currentTargetSelectionDisplay().text);
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

async function summonMonster(owner, rival, handIndex, fieldIndex, options = {}) {
  const card = owner.hand[handIndex];
  if (!card) return false;
  const tributeCards = Array.isArray(options.tributeIndexes)
    ? options.tributeIndexes.map((index) => owner.field[index]).filter(Boolean)
    : [];
  let summonEvents = [];
  try {
    summonEvents = dispatchSummonMonsterFromUiState(state, owner.owner, handIndex, fieldIndex, options);
  } catch (error) {
    cue(tributeCost(card) > 0
      ? tributeSummonFailureMessage(error.message)
      : error.message || "怪兽召唤失败。");
    console.error(error);
    return false;
  }
  playSound("summon");
  animateAvatar(owner.owner, "cast");
  const summonLog = addLog(`${owner.owner === "player" ? "你" : "AI"} 召唤了 ${card.name}。`, cardLogMeta(card, { actor: owner.owner, type: "summon" }));
  speak(`${owner.owner === "player" ? "你召唤" : "对手召唤"}，${card.name}。`);
  if (tributeCards.length) {
    addLog(`${owner.owner === "player" ? "你" : "AI"} 将 ${tributeCards.map((tribute) => `「${tribute.name}」`).join("、")} 作为祭品召唤了「${card.name}」。`, cardLogMeta(card, {
      actor: owner.owner,
      type: "tribute-summon",
      relatedCardIds: relatedCardIds(card, ...tributeCards)
    }));
  }
  const convergenceCards = summonEvents
    .filter((event) => event.type === "MONSTER_SUMMONED" && event.summonType === "trioConvergence")
    .map((event) => findRuntimeCard(event.cardId)?.card)
    .filter(Boolean);
  if (convergenceCards.length) {
    addLog(`「${card.name}」引发三曜共降：${convergenceCards.map((entry) => `「${entry.name}」`).join("、")}从手牌特殊召唤。`, cardLogMeta(card, {
      actor: owner.owner,
      type: "trio-convergence",
      relatedCardIds: relatedCardIds(card, ...convergenceCards)
    }));
    playEpicAction("三曜共降", "summon");
  }
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
  const summonContext = {
    summonedPlayerId: owner.owner,
    summonedCardId: runtimeCardId(card)
  };
  const hasRivalSummonResponse = trapCandidates(rival, "summon", {
    summoned: card,
    targetEffectId: summonedEvent.id,
    engineResponse: true,
    ...summonContext
  }).length > 0;
  if (owner.owner === "ai" && !hasRivalSummonResponse) {
    await waitForAiReveal({ ...summonLog, revealKind: "summon" });
  }
  if (!openTrapResponseWindow(rival.owner, {
    timing: "summon",
    resumeTiming: "mainOpen",
    prompt: "summon",
    triggerEventId: summonedEvent.id,
    context: summonContext
  })) return true;
  await triggerTrap(rival, owner, "summon", {
    summoned: card,
    targetEffectId: summonedEvent.id,
    engineResponse: true
  });
  if (state.gameOver) return true;
  if (owner.owner === "ai" && hasRivalSummonResponse) {
    await waitForAiReveal({ ...summonLog, revealKind: "summon" });
  }
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
  if (owner.owner === "player") {
    addLog(`你盖放了陷阱卡 ${card.name}。`, cardLogMeta(card, { actor: owner.owner, type: "set-trap" }));
  } else {
    addLog("AI 盖放了 1 张陷阱卡。");
  }
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

async function playSpell(owner, rival, handIndex, targetInfo = null) {
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
    if (owner.owner === "player") cue(card.effect === "splitToken" ? splitTokenFailureMessage(validation.reason) : validation.reason);
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  if (spellNeedsManualTarget(owner, selectedCard, spellEffects) && !targetInfo) {
    beginSpellTargetSelection(handIndex, selectedCard);
    return false;
  }
  let engineEvents = [];
  let result = {};
  try {
    engineEvents = dispatchActivateSpellFromUiState(state, owner.owner, rival.owner, handIndex, targetInfo);
  } catch (error) {
    if (owner.owner === "player") {
      cue(card.effect === "splitToken" ? splitTokenFailureMessage(error.message) : (error.message || "\u9b54\u6cd5\u5361\u53d1\u52a8\u5931\u8d25\u3002"));
    }
    console.error(error);
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  playSound(`spell-${card.effect}`);
  animateAvatar(owner.owner, "cast");
  playCenterCardEffect(card, spellCaption(card));
  playEpicAction("\u9b54\u6cd5", "draw");
  const spellLog = addLog(`${owner.owner === "player" ? "\u4f60" : "AI"} \u53d1\u52a8\u9b54\u6cd5\u5361 ${card.name}\u3002`, cardLogMeta(card, { actor: owner.owner, type: "spell" }));
  speak(`${owner.owner === "player" ? "\u4f60\u53d1\u52a8" : "\u5bf9\u624b\u53d1\u52a8"}\u9b54\u6cd5\u5361\uff0c${card.name}\u3002`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "spell", card), false, "spell");
  if (owner.owner === "ai") {
    await waitForAiReveal({ ...spellLog, revealKind: "spell" });
  }
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

function resolveEngineSpellFeedback(owner, rival, card, events, targetInfo = null) {
  const result = {
    effectTarget: targetInfo?.card || null,
    targetOwner: targetInfo?.owner || owner.owner
  };
  let totalDamageDealt = 0;
  let statModifiedCount = 0;
  const tokenSummonEvents = events.filter((event) =>
    event.type === "MONSTER_SUMMONED" &&
    event.summonType === "token" &&
    event.sourceCardId === runtimeCardId(card)
  );
  events.forEach((event) => {
    if (event.type === "CARD_MOVED" && event.from?.zone === "grave" && event.to?.zone === "monsterZone") {
      const found = findRuntimeCard(event.cardId);
      if (found?.card) {
        result.effectTarget = found.card;
        result.targetOwner = found.owner;
        addLog(`${found.card.name} 因 ${card.name} 从墓地回到场上。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(found.card) }));
        playEpicAction("回召", "draw");
      }
    }
    if (event.type === "CARD_MOVED" && event.from?.zone === "grave" && event.to?.zone === "deck") {
      const found = findRuntimeCard(event.cardId);
      const movedName = found?.card?.name || "墓地卡";
      addLog(`${movedName} 因 ${card.name} 回到卡组顶。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(found?.card) }));
    }
    if (event.type === "MATERIALS_SENT") {
      const names = (event.materialCardIds || [])
        .map((cardId) => findRuntimeCard(cardId)?.card?.name)
        .filter(Boolean)
        .join("、");
      const isFusion = event.purpose === "fusion";
      addLog(`${card.name} 将${names || "素材"}送入墓地，${isFusion ? "融合条件达成" : "进化条件达成"}。`, cardLogMeta(card, {
        actor: owner.owner,
        type: "effect",
        relatedCardIds: (event.materialCardIds || [])
          .map((cardId) => findRuntimeCard(cardId)?.card?.id)
          .filter(Boolean)
      }));
      playEpicAction(isFusion ? "融合素材" : "进化素材", "draw");
    }
    if (
      event.type === "MONSTER_SUMMONED"
      && event.sourceCardId === runtimeCardId(card)
      && !["normal", "tribute"].includes(event.summonType)
    ) {
      const found = findRuntimeCard(event.cardId);
      if (found?.card) {
        const origin = event.originCardId ? findRuntimeCard(event.originCardId) : null;
        result.effectTarget = found.card;
        result.targetOwner = found.owner;
        const isFusion = event.summonType === "fusion";
        const isToken = event.summonType === "token";
        if (isToken) {
          if (event !== tokenSummonEvents[0]) return;
          const tokenCards = tokenSummonEvents
            .map((tokenEvent) => findRuntimeCard(tokenEvent.cardId)?.card)
            .filter(Boolean);
          const sourceMonster = origin?.card || targetInfo?.card || null;
          const tokenName = tokenCards[0]?.name || "衍生物";
          const tokenCount = tokenCards.length || tokenSummonEvents.length;
          addLog(`「${sourceMonster?.name || "己方怪兽"}」通过「${card.name}」生成了 ${tokenCount} 只「${tokenName}」。`, cardLogMeta(card, {
            actor: owner.owner,
            type: "effect",
            relatedCardIds: relatedCardIds(sourceMonster, ...tokenCards)
          }));
          cue(`${currentSplitTokenDisplay(sourceMonster).sourceText} 已生成 ${tokenCount} 只「${tokenName}」。token 离场后会消失。`);
          playEpicAction("衍生物", "summon");
          return;
        }
        addLog(`${found.card.name} 因 ${card.name} ${isFusion ? "融合登场" : isToken ? "作为衍生物生成" : "特殊登场"}。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(found.card, origin?.card) }));
        playEpicAction(isFusion ? "融合召唤" : isToken ? "衍生物" : "王牌进化", "summon");
        if (found.card.stars >= 5) showAce(found.card, found.owner);
      }
    }
    if (event.type === "CARDS_DRAWN" && event.count > 0) {
      const drawn = (event.cardIds || []).map((cardId) => findRuntimeCard(cardId)?.card).filter(Boolean);
      playDrawSequence(owner.owner, drawn);
      addLog(`${owner.owner === "player" ? "你" : "AI"} 抽了 ${event.count} 张卡。`);
      playVoice(owner.owner, "draw", owner.owner === "player" ? `抽 ${event.count} 张卡。` : `对手抽 ${event.count} 张卡。`);
    }
    if (event.type === "LP_HEALED" && event.amount > 0) {
      playSound("spell-heal700");
      playLifeDelta(owner.owner, event.amount);
      addLog(`${card.name} 为 ${duelistLabel(owner)}回复 ${event.amount} 点生命值。`, cardLogMeta(card, { actor: owner.owner, type: "effect" }));
    }
    if (event.type === "SHIELD_GAINED" && event.amount > 0) {
      const target = event.playerId === owner.owner ? owner : rival;
      result.targetOwner = target.owner;
      playSound("guard");
      playEpicAction("护盾", "guard");
      playGuardShield(panelElement(target.owner));
      playVoice(target.owner, "shield", "护盾展开。");
      addLog(`${target.owner === "player" ? "你" : "AI"} 获得 ${event.amount} 点护盾（${card.name}）。`, cardLogMeta(card, { actor: owner.owner, type: "effect" }));
    }
    if (event.type === "DAMAGE_DEALT") {
      const target = event.playerId === owner.owner ? owner : rival;
      const pierced = Math.max(0, Number(event.shieldPierced) || 0);
      const blocked = Math.max(0, Number(event.blocked) || 0);
      const dealt = Math.max(0, Number(event.amount) || 0);
      result.targetOwner = target.owner;
      if (pierced > 0) {
        playSound("guard");
        playGuardShield(panelElement(target.owner));
        addLog(`${target.owner === "player" ? "你的" : "AI 的"}护盾被神格威压消解了 ${pierced} 点。`);
      }
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
        addLog(`${card.name} 对 ${duelistLabel(target)}造成 ${dealt} 点伤害。`, cardLogMeta(card, { actor: owner.owner, type: "effect" }));
      } else if (blocked > 0) {
        addLog(`${card.name} 的伤害被护盾完全抵消。`, cardLogMeta(card, { actor: owner.owner, type: "effect" }));
      }
    }
    if (event.type === "STAT_MODIFIED") {
      const found = findRuntimeCard(event.cardId);
      if (!found) return;
      result.effectTarget = found.card;
      result.targetOwner = found.owner;
      statModifiedCount += 1;
      addLog(`${found.card.name} 因 ${card.name} ${statChangeText(event, {
        continuousReleased: isContinuousReleaseStat(events, event)
      })}。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(found.card) }));
    }
    if (event.type === "CONTINUOUS_EFFECT_REGISTERED") {
      const found = findRuntimeCard(event.targetCardId);
      if (found) {
        result.effectTarget = found.card;
        result.targetOwner = found.owner;
        addLog(`${card.name} 对 ${found.card.name} 的持续效果开始生效。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(found.card) }));
        playEpicAction("持续生效", "guard");
      }
    }
    if (event.type === "CONTINUOUS_EFFECT_RELEASED") {
      const source = findRuntimeCard(event.sourceCardId);
      const target = findRuntimeCard(event.targetCardId);
      const sourceName = source?.card?.name || "持续卡";
      const targetText = target?.card?.name ? `，${target.card.name} 的持续修正已解除` : "";
      const lostTargetAndSentToGrave = event.reason === "target-left-zone" && events.some((candidate) =>
        candidate.type === "CARD_DESTROYED" &&
        candidate.cardId === event.sourceCardId &&
        candidate.reason === "continuous-target-left-zone"
      );
      if (target?.card) {
        result.effectTarget = target.card;
        result.targetOwner = target.owner;
      }
      const message = lostTargetAndSentToGrave
        ? `${sourceName} 因 ${target?.card?.name || "目标"} 离开怪兽区而失去目标，持续效果解除并送入墓地。`
        : `${sourceName} 的持续效果失效${targetText}。`;
      addLog(message, {
        actor: owner.owner,
        type: "effect",
        public: true,
        cardId: source?.card?.id || card.id,
        relatedCardIds: relatedCardIds(target?.card)
      });
      playEpicAction("持续失效", "draw");
    }
    if (
      event.type === "CARD_DESTROYED"
      && event.cardId !== runtimeCardId(card)
      && event.reason !== "continuous-target-left-zone"
      && shouldLogGenericDestroyedEvent(card)
    ) {
      const destroyed = findRuntimeCard(event.cardId);
      const destroyedName = destroyed?.card?.name || "目标卡";
      result.effectTarget = destroyed?.card || result.effectTarget;
      result.targetOwner = destroyed?.owner || result.targetOwner;
      addLog(`${card.name} 破坏了 ${destroyedName}。`, cardLogMeta(card, { actor: owner.owner, type: "effect", relatedCardIds: relatedCardIds(destroyed?.card) }));
    }
    if (event.type === "CARD_DESTRUCTION_PREVENTED") {
      const protectedCard = findRuntimeCard(event.cardId);
      const protectedName = protectedCard?.card?.name || "目标卡";
      result.effectTarget = protectedCard?.card || result.effectTarget;
      result.targetOwner = protectedCard?.owner || result.targetOwner;
      addLog(`${protectedName} 的神格守护抵消了 ${card.name} 的破坏。`, {
        actor: owner.owner,
        type: "effect",
        public: true,
        cardId: protectedCard?.card?.id || card.id,
        relatedCardIds: relatedCardIds(card)
      });
      playEpicAction("神格守护", "guard");
      if (protectedCard?.card) {
        const ownerPanel = panelElement(protectedCard.owner);
        const protectedIndex = state[protectedCard.owner]?.field?.indexOf(protectedCard.card) ?? -1;
        playGuardShield(fieldElement(protectedCard.owner, protectedIndex) || ownerPanel);
      }
    }
    if (event.type === "MONSTER_READIED") {
      const found = findRuntimeCard(event.cardId);
      if (!found) return;
      result.effectTarget = found.card;
      result.targetOwner = found.owner;
      addLog(`${found.card.name} 因「${card.name}」重新进入可攻击状态。`, {
        actor: owner.owner,
        type: "effect",
        public: true,
        cardId: found.card.id,
        relatedCardIds: relatedCardIds(card)
      });
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
      const target = findRuntimeCard(event.targetCardId);
      const totalUses = (owner.attackResetEntries || [])
        .filter((entry) => entry.targetCardId === event.targetCardId)
        .reduce((total, entry) => total + Number(entry.uses || 0), 0);
      result.effectTarget = target?.card || result.effectTarget;
      result.targetOwner = target?.owner || owner.owner;
      addLog(`${target?.card?.name || duelistLabel(owner)}因「${card.name}」获得 ${event.uses || 1} 次追加攻击机会（当前 ${totalUses || event.uses || 1} 次）。`, cardLogMeta(card, {
        actor: owner.owner,
        type: "effect",
        relatedCardIds: relatedCardIds(target?.card)
      }));
      playEpicAction("攻击重置", "attack");
    }
  });
  if (card.effect === "fireWindCombo" && statModifiedCount > 0) {
    playEpicAction("炎岚", "attack");
    addLog(`${card.name} 造成 ${totalDamageDealt} 点伤害，并强化我方全体怪兽。`, cardLogMeta(card, { actor: owner.owner, type: "effect" }));
  }
  return result;
}

function validateSpell(owner, rival, card, handIndex) {
  if (!card || card.type !== "spell") return { ok: false, reason: "请选择魔法卡。" };
  const effect = spellEffects[card.effect];
  if (!effect) return { ok: false, reason: "这个魔法效果还没有实现。" };
  const fusionOptions = fusionDefinitions(card);
  if (fusionOptions.length > 0) {
    const checks = fusionOptions.map((option) => explainFusionSummonFromUiState(
      state,
      owner.owner,
      rival.owner,
      handIndex,
      { fusionResultTemplateId: option.resultId }
    ));
    const legalOption = checks.find((entry) => entry.ok);
    return legalOption || { ok: false, reason: checks[0]?.reason || "当前不能进行融合召唤。" };
  }
  const engineLegality = explainActivateSpellFromUiState(state, owner.owner, rival.owner, handIndex);
  return engineLegality;
}

function spellCaption(card) {
  if (spellEffects[card.effect]?.caption) return spellEffects[card.effect].caption;
  return card.text || "魔法发动";
}

function trapCandidates(owner, eventName, context) {
  const committedTrapIds = new Set((currentEngineMachine()?.chain || []).map((link) => link.cardId).filter(Boolean));
  return owner.traps
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && !committedTrapIds.has(runtimeCardId(card)))
    .filter(({ card }) => trapCanResolve(card, eventName, { owner, context }));
}

async function chooseTrapIndex(owner, rival, eventName, context) {
  const candidates = trapCandidates(owner, eventName, context);
  if (candidates.length === 0) return { trapIndex: -1, candidates, declined: false };
  if (owner.owner !== "player") {
    const action = chooseAiTrapResponseAction({ candidates, owner, rival, aiStyle: state.aiStyle, eventName, context });
    return { trapIndex: action?.trapIndex ?? -1, candidates, declined: false };
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
  const trapLog = addLog(`${chainLabel}：${owner.owner === "player" ? "你的" : "AI 的"}陷阱卡 ${trap.name} 触发。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
  speak(`陷阱发动，${trap.name}。`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "trap", trap), false, "trap");
  return trapLog;
}

function redirectTrapContext(owner, trap, context = {}) {
  if (trap?.trigger !== "redirectAttack") return { ...context };
  const redirectTargetIndex = Number.isInteger(context.redirectTargetIndex)
    ? context.redirectTargetIndex
    : selectRedirectTarget(owner.field, context.targetIndex);
  const redirectTarget = owner.field[redirectTargetIndex];
  if (!redirectTarget) return { ...context };
  return {
    ...context,
    redirectTargetIndex,
    targetCardId: runtimeCardId(redirectTarget)
  };
}

function queueTrapChainLink(owner, rival, eventName, context, trapIndex, chainIndex) {
  const trap = owner.traps[trapIndex];
  if (!trap) return null;
  const trapSource = trapElement(owner.owner, trapIndex) || panelElement(owner.owner);
  const trapContext = redirectTrapContext(owner, trap, context);
  try {
    const events = dispatchQueueTrapResponseFromUiState(state, owner.owner, rival.owner, trapIndex, {
      ...trapContext,
      targetEffectId: trapContext.targetEffectId || `${trap.uid || trap.id}:${eventName}`
    });
    const revealEntry = announceTrapActivation(owner, trap, chainIndex);
    return { owner, rival, eventName, context: { ...trapContext }, trap, trapIndex, trapSource, chainIndex, events, revealEntry };
  } catch (error) {
    cue(error.message || "陷阱卡加入连锁失败。");
    state.ruleCheckIssue = error.message || "Trap chain queue failed.";
    addLog(`规则引擎拒绝陷阱连锁：${state.ruleCheckIssue}`);
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

function attackContextCard(rival, context = {}, event = null) {
  return findRuntimeCard(event?.cardId)?.card ||
    findRuntimeCard(context.attackerCardId)?.card ||
    rival.field?.[context.attackerIndex] ||
    context.attacker ||
    null;
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
      addLog(`AI 检测到 ${sourceTrap.name}，准备追加陷阱连锁。`, cardLogMeta(sourceTrap, { actor: "ai", type: "chain-check" }));
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
    if (link.owner.owner === "ai") {
      await waitForAiReveal({ ...link.revealEntry, revealKind: "trap" });
    }
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
  if (!choice) {
    state.ruleCheckIssue = "Trap response choice did not resolve.";
    addLog(`规则引擎拒绝陷阱响应：${state.ruleCheckIssue}`);
    return result;
  }
  if (choice.trapIndex < 0) {
    if (choice.declined) {
      addLog(choice.skippedName ? `你没有发动 ${choice.skippedName}。` : "你没有发动陷阱。");
    }
    if (engineResponse && !closeTrapResponseWindow(owner.owner, choice.declined ? "declined" : "no-legal-trap")) {
      result.cancelled = true;
    }
    return result;
  }

  let outcome = { cancelled: false, shielded: false, consumesAttack: false };
  try {
    outcome = engineResponse
      ? await resolveEngineTrapChain(owner, rival, eventName, context, choice.trapIndex)
      : resolveTrapCard(owner, rival, eventName, context, choice.trapIndex, 1);
  } catch (error) {
    state.ruleCheckIssue = error.message || "Trap response failed.";
    addLog(`规则引擎拒绝陷阱响应：${state.ruleCheckIssue}`);
    cue(state.ruleCheckIssue);
    console.error(error);
    return result;
  }
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

function updateTrapChoicePrompt() {
  if (!state.pendingTrapChoice) return;
  renderTrapResponsePanel({
    document,
    elements: els,
    choice: state.pendingTrapChoice,
    traps: state.player.traps,
    chain: currentEngineMachine()?.chain || [],
    findCard: findRuntimeCard,
    activationText: trapActivationText,
    onSelect: (index) => interactWithPendingTrapChoice(index, {
      directActivate: directActivationTracker.register(`trap-response:${index}`)
    }),
    onActivate: (index) => interactWithPendingTrapChoice(index, { directActivate: true }),
    onCardClick: openCardDetail
  });
}

function closeTrapChoicePrompt() {
  els.chainModal.classList.remove("show");
  state.pendingTrapChoice = null;
  pendingTrapChoiceResolver = null;
  clearTrapResponsePanel(els);
}

function resolveTrapCard(owner, rival, eventName, context, trapIndex, chainIndex = 1, options = {}) {
  const trap = options.trap || owner.traps[trapIndex];
  if (!trap) return { cancelled: false, shielded: false };
  const trapSource = options.trapSource || trapElement(owner.owner, trapIndex) || panelElement(owner.owner);
  const trapContext = redirectTrapContext(owner, trap, context);
  let trapEvents = Array.isArray(options.events) ? options.events : [];
  if (!Array.isArray(options.events) && canDispatchTrapFromUiState(trap)) {
    try {
      const dispatchTrap = context.engineResponse
        ? dispatchTrapResponseFromUiState
        : dispatchActivateTrapFromUiState;
      trapEvents = dispatchTrap(state, owner.owner, rival.owner, trapIndex, {
        ...trapContext,
        targetEffectId: trapContext.targetEffectId || `${trap.uid || trap.id}:${eventName}`
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
    addLog(`${trap.name} 的效果被连锁无效。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
    speak(`${trap.name}，效果无效。`);
    return { cancelled: false, shielded: false, negated: true };
  }
  resolveEngineSpellFeedback(owner, rival, trap, trapEvents);

  if (trap.trigger === "chainNegate") {
    const sourceTrap = context.sourceTrap;
    playArrow(trapSource, panelElement(rival.owner), "trap", trap.name);
    playEpicAction("断链", "guard");
    addLog(`${trap.name} 无效了${sourceTrap?.name ? ` ${sourceTrap.name}` : "上一张陷阱"}的效果。`, cardLogMeta(trap, { actor: owner.owner, type: "trap", relatedCardIds: relatedCardIds(sourceTrap) }));
    speak(`${trap.name}，连锁无效。`);
    return { cancelled: false, shielded: false };
  }

  if (trap.trigger === "attackDestroy") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    const destroyedEvent = trapEvents.find((event) => event.type === "CARD_DESTROYED");
    const preventedEvent = trapEvents.find((event) => event.type === "CARD_DESTRUCTION_PREVENTED");
    const attacker = destroyedEvent ? findRuntimeCard(destroyedEvent.cardId)?.card : context.attacker;
    if (destroyedEvent && attacker) {
      playMonsterBurst(attackerEl);
      shakeScreen();
      playEpicAction("反制", "guard");
    }
    return { cancelled: Boolean(destroyedEvent && !preventedEvent), consumesAttack: trapConsumesAttack(trap.trigger) };
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
    addLog(`${trap.name} 取消了攻击，并强化了防线。攻击机会已消耗。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
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
    addLog(`${trap.name} 转移了攻击，获得 400 护盾。攻击机会已消耗。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
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
    addLog(`${trap.name} 无效了本次攻击。攻击机会已消耗。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
    speak(`${trap.name} 无效攻击。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "aceGuard") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const statEvent = trapEvents.find((event) => event.type === "STAT_MODIFIED" && event.amount > 0);
    const ace = statEvent ? findRuntimeCard(statEvent.cardId)?.card : strongestMonster(owner);
    const aceIndex = owner.field.indexOf(ace);
    const aceEl = aceIndex >= 0 ? fieldElement(owner.owner, aceIndex) || panelElement(owner.owner) : panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playGuardShield(aceEl);
    if (aceIndex >= 0) {
      playMonsterMotion(owner.owner, aceIndex, "stand");
    }
    playEpicAction("王牌守护", "guard");
    addLog(`${trap.name} 无效了本次攻击，并让 ${ace?.name || "王牌"} 攻击力提升 900。攻击机会已消耗。`, cardLogMeta(trap, { actor: owner.owner, type: "trap", relatedCardIds: relatedCardIds(ace) }));
    speak(`${trap.name}，守住王牌。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "redirectAttack") {
    const redirectIndex = Number.isInteger(trapContext.redirectTargetIndex)
      ? trapContext.redirectTargetIndex
      : selectRedirectTarget(owner.field, context.targetIndex);
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
      trapContext.targetIndex = redirectIndex;
      playGuardShield(redirectEl);
      playMonsterMotion(owner.owner, redirectIndex, "stand");
      playEpicAction("换位", "guard");
      addLog(`${trap.name} 将攻击目标改为 ${redirectTarget.name}。`, cardLogMeta(trap, { actor: owner.owner, type: "trap", relatedCardIds: relatedCardIds(redirectTarget) }));
      speak(`${trap.name} 改变攻击目标。`);
    }
    return { cancelled: false, redirected: Boolean(redirectTarget), targetIndex: context.targetIndex };
  }

  if (trap.trigger === "weakenAttack") {
    const statEvent = trapEvents.find((event) => event.type === "STAT_MODIFIED");
    const attacker = attackContextCard(rival, context, statEvent);
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (attacker) {
      playGuardShield(attackerEl);
      playEpicAction("弱化", "guard");
      addLog(`${trap.name} 削弱了 ${attacker.name}，攻击继续结算。`, cardLogMeta(trap, { actor: owner.owner, type: "trap", relatedCardIds: relatedCardIds(attacker) }));
      speak(`${trap.name} 削弱攻击怪兽，攻击继续。`);
    }
    return { cancelled: false };
  }

  if (trap.trigger === "soulParry") {
    const statEvent = trapEvents.find((event) => event.type === "STAT_MODIFIED");
    const attacker = attackContextCard(rival, context, statEvent);
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playGuardShield(panelElement(owner.owner));
    if (attacker) {
      playEpicAction("格挡", "guard");
      addLog(`${trap.name} 削弱了 ${attacker.name}，并展开护盾。攻击继续结算。`, cardLogMeta(trap, { actor: owner.owner, type: "trap", relatedCardIds: relatedCardIds(attacker) }));
      speak(`${trap.name} 格挡攻击，护盾展开。`);
    }
    return { cancelled: false };
  }

  if (trap.trigger === "directShield") {
    const shieldTarget = panelElement(owner.owner);
    playArrow(trapSource, shieldTarget, "trap", trap.name);
    playSound("guard");
    playGuardShield(shieldTarget);
    playEpicAction("防御", "guard");
    addLog(`${trap.name} 让直接攻击伤害变为 0。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
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
    addLog(`${trap.name} 让直接攻击伤害变为 0，并反弹 500 点伤害。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
    speak(`${trap.name} 反弹了直接攻击。`);
    return { cancelled: true, shielded: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "summonBurn") {
    playArrow(trapSource, panelElement(rival.owner), "trap", trap.name);
    animateAvatar(rival.owner, "hit");
    shakeScreen();
    playEpicAction("灼烧", "attack");
    addLog(`${trap.name} 对召唤者造成 400 点伤害。`, cardLogMeta(trap, { actor: owner.owner, type: "trap" }));
  }

  return { cancelled: false };
}

function playBattleDamageFeedback(events, duelist) {
  let total = 0;
  events
    .filter((event) => event.type === "DAMAGE_DEALT" && event.playerId === duelist.owner)
    .forEach((event) => {
      const pierced = Math.max(0, Number(event.shieldPierced) || 0);
      const blocked = Math.max(0, Number(event.blocked) || 0);
      const dealt = Math.max(0, Number(event.amount) || 0);
      if (pierced > 0) {
        playSound("guard");
        playGuardShield(panelElement(duelist.owner));
        addLog(`${duelist.owner === "player" ? "你的" : "AI 的"}护盾被神格威压消解了 ${pierced} 点。`);
      }
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

async function resolveAfterAttackBattleFeedback(owner, attacker, events) {
  const attackerId = runtimeCardId(attacker);
  if (!attackerId) return;
  const hasPublicEffect = attacker.afterAttack && events.some((event) => event.sourceCardId === attackerId);
  if (owner.owner === "ai" && hasPublicEffect) {
    await waitForAiReveal({
      actor: "ai",
      public: true,
      cardId: attacker.id,
      type: "effect",
      revealKind: "monster-effect",
      message: `${attacker.name} 的效果触发。`
    });
  }
  if (events.some((event) =>
    event.type === "ABILITY_SPENT" &&
    event.playerId === owner.owner &&
    event.ability === "directAttack"
  )) {
    addLog(`${duelistLabel(owner)}消耗 1 次直接攻击许可。`);
  }
  events
    .filter((event) =>
      event.type === "CONTINUOUS_EFFECT_RELEASED" &&
      event.reason === "target-left-zone" &&
      events.some((candidate) =>
        candidate.type === "CARD_DESTROYED" &&
        candidate.cardId === event.sourceCardId &&
        candidate.reason === "continuous-target-left-zone"
      )
    )
    .forEach((event) => {
      const source = findRuntimeCard(event.sourceCardId);
      const target = findRuntimeCard(event.targetCardId);
      addLog(`${source?.card?.name || "持续卡"} 因 ${target?.card?.name || "目标"} 离开怪兽区而失去目标，送入墓地。`, {
        actor: source?.owner || owner.owner,
        type: "effect",
        public: true,
        cardId: source?.card?.id || null,
        relatedCardIds: relatedCardIds(target?.card)
      });
    });
  const growEvent = events.find((event) =>
    event.type === "STAT_MODIFIED" &&
    event.sourceCardId === attackerId &&
    event.cardId === attackerId &&
    event.stat === "tempAtk" &&
    event.amount > 0
  );
  if (growEvent) {
    addLog(`${attacker.name} 吞噬影子，攻击力提升 ${growEvent.amount}。`, cardLogMeta(attacker, { actor: owner.owner, type: "effect" }));
  }
  const wearEvent = events.find((event) => event.type === "BATTLE_WEAR_APPLIED");
  if (wearEvent) {
    const found = findRuntimeCard(wearEvent.cardId);
    if (found?.card) {
      playEpicAction("损耗", "guard", 900);
      addLog(`${found.card.name} 承受冲击产生 ${wearEvent.amount} 点战斗损耗，攻击力和守备力下降。`, { actor: found.owner, type: "battle", public: true, cardId: found.card.id });
      speak(`${found.card.name} 承受冲击，战斗力下降。`);
    }
  }
  const drawEvent = events.find((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === attackerId);
  if (drawEvent?.count > 0) {
    const drawn = (drawEvent.cardIds || []).map((cardId) => findRuntimeCard(cardId)?.card).filter(Boolean);
    playDrawSequence(owner.owner, drawn);
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

function pendingAttackTargetIndex(rival, fallbackIndex) {
  const pending = currentEngineMachine()?.pendingAttack;
  if (!pending || pending.direct) return fallbackIndex;
  if (pending.rivalId !== rival.owner || !pending.targetCardId) return fallbackIndex;
  const targetIndex = rival.field.findIndex((card) => runtimeCardId(card) === pending.targetCardId);
  return targetIndex >= 0 ? targetIndex : fallbackIndex;
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
  const spent = events.find((event) =>
    event.type === "ABILITY_SPENT"
    && event.ability === "attackReset"
    && (event.targetCardId || event.cardId) === runtimeCardId(attacker)
  );
  if (!spent || !events.some((event) => event.type === "MONSTER_READIED" && event.cardId === runtimeCardId(attacker))) {
    return false;
  }
  const source = findRuntimeCard(spent.sourceCardId)?.card;
  const remaining = (owner.attackResetEntries || [])
    .filter((entry) => entry.targetCardId === runtimeCardId(attacker))
    .reduce((total, entry) => total + Number(entry.uses || 0), 0);
  const sourceText = source?.name ? `来自「${source.name}」的` : "";
  playEpicAction("再攻", "attack");
  addLog(`${attacker.name} 消耗${sourceText}追加攻击机会，再次进入可攻击状态${remaining > 0 ? `（还剩 ${remaining} 次）` : ""}。`, {
    actor: owner.owner,
    type: "effect",
    public: true,
    cardId: attacker.id,
    relatedCardIds: relatedCardIds(source)
  });
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
  const hasAttackTrapResponse = trapCandidates(rival, "attack", attackContext).length > 0;
  let trapResult = { cancelled: false, shielded: false, consumesAttack: false, activated: 0 };
  if (hasAttackTrapResponse) {
    trapResult = await triggerTrap(rival, owner, "attack", attackContext);
  } else if (!closeTrapResponseWindow(rival.owner, "no-legal-trap")) {
    trapResult.cancelled = true;
  }
  if (trapResult.cancelled) {
    if (!consumeCancelledAttackWithEngine(owner, attacker, {
      declarationEventId: attackContext.targetEffectId,
      consumeAttack: trapResult.consumesAttack,
      reason: "attack-trap"
    })) return false;
    checkGameOver();
    return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的攻击`);
  }
  const resolvedTargetIndex = pendingAttackTargetIndex(rival, attackContext.targetIndex);
  attackContext.targetIndex = resolvedTargetIndex;
  const target = rival.field[resolvedTargetIndex];
  const fromEl = fieldElement(owner.owner, attackerIndex);
  const toEl = fieldElement(rival.owner, resolvedTargetIndex) || panelElement(rival.owner);
  if (attacker.stars >= 5) {
    playSound("ace");
    playAceStrike(attacker, owner.owner, target);
    playEpicAction("王牌攻势", "attack", 1300);
    await sleep(ATTACK_TIMING_MS.ace);
  }
  playSound("attack-charge");
  playAttackCloseup(attacker, target, owner.owner, rival.owner);
  playEpicAction("攻击宣言", "attack", 1260);
  playDuelistLine(owner.owner, lineFor(owner.owner, "attack", attacker), false, "attack");
  await sleep(ATTACK_TIMING_MS.declaration);
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
  await sleep(ATTACK_TIMING_MS.impact);

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
    addLog(`${attacker.name} 直接攻击，造成 ${dealt} 点伤害。`, cardLogMeta(attacker, { actor: owner.owner, type: "battle" }));
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
      if (target.mode !== "defense" || outcome.rawDamage > 0) {
        dealt = playBattleDamageFeedback(battleEvents, rival);
        animateAvatar(rival.owner, "hit");
        playMonsterMotion(rival.owner, resolvedTargetIndex, "hit");
      }
      if (target.mode === "defense") {
        playSound("guard");
        playMonsterMotion(rival.owner, resolvedTargetIndex, "guard");
        playMonsterCounterPhantom(target, toEl, fromEl);
        playGuardShield(toEl);
        playEpicAction("防御", "guard");
      }
      playMonsterBurst(toEl);
      playSound("attack-break");
      shakeScreen();
      playEpicAction(outcome.kind === "pierceDefense" ? "神格贯穿" : target.mode === "defense" ? "破防" : "击破", "attack");
      playArrow(fromEl, toEl, "attack", "攻击");
      addLog(battleLogText(attacker, target, outcome, dealt), cardLogMeta(attacker, { actor: owner.owner, type: "battle", relatedCardIds: relatedCardIds(target) }));
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
      addLog(battleLogText(attacker, target, outcome, dealt), cardLogMeta(attacker, { actor: owner.owner, type: "battle", relatedCardIds: relatedCardIds(target) }));
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
      addLog(battleLogText(attacker, target, outcome), cardLogMeta(attacker, { actor: owner.owner, type: "battle", relatedCardIds: relatedCardIds(target) }));
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
      addLog(battleLogText(attacker, target, outcome), cardLogMeta(attacker, { actor: owner.owner, type: "battle", relatedCardIds: relatedCardIds(target) }));
      speak(`${attacker.name} 与 ${target.name} 同归于尽。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "clash"), false, "clash");
    }
  }

  playAttackResetFeedback(owner, attacker, battleEvents);
  const afterAttackFeedback = resolveAfterAttackBattleFeedback(owner, attacker, battleEvents);
  if (owner.owner === "ai") {
    await afterAttackFeedback;
  }
  checkGameOver();
  return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的攻击`);
}

function cardImpactSignature(card) {
  if (!card) return null;
  return {
    uid: card.uid,
    id: card.id,
    used: Boolean(card.used),
    attackLockReason: card.attackLockReason || null,
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
    attackResetEntries: (duelist.attackResetEntries || []).map((entry) => ({ ...entry })),
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
      const resolvedChoice = resolution.ok ? resolution : { trapIndex: -1, skippedName: "" };
      resolve(resolvedChoice);
      try {
        closeTrapChoicePrompt();
        render();
      } catch (error) {
        state.ruleCheckIssue = error.message || "Trap response render failed.";
        addLog(`陷阱响应界面刷新失败：${state.ruleCheckIssue}`);
        console.error(error);
      }
    };
  });
}

function answerChain(answer) {
  if (pendingTrapChoiceResolver) {
    pendingTrapChoiceResolver(answer);
  }
}

function confirmTrapChoice() {
  if (state.pendingTrapChoice) {
    const selectedIndex = state.pendingTrapChoice.selectedIndex;
    if (activatePendingTrapChoice(selectedIndex)) return;
  }
  answerChain(true);
}

function handOffToAiTurn() {
  clearTransientSelection(state);
  clearBattlePreview();
  clearPlayerIdleTimers();
  beginTurn("ai");
  render();
  window.setTimeout(runAiTurn, 950);
}

function endPlayerTurn(reason = "manual") {
  if (!canPlayerAct()) return;
  cancelAutoEnd();
  clearTransientSelection(state);
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
  clearTransientSelection(state);
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
    pauseMusic({ fadeMs: 180 });
    addLog("决斗已暂停。");
  } else {
    addLog("决斗继续。");
    playMusic(currentMusicMode());
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
    render();
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
  clearTransientSelection(state);
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
  let turnEvents = [];
  try {
    turnEvents = dispatchStartTurnFromUiState(state, owner);
  } catch (error) {
    cue(error.message || "回合开始失败。");
    console.error(error);
    return false;
  }
  Object.assign(state, turnStartPatch(owner));
  clearBattlePreview();
  cancelAutoEnd();
  clearPlayerIdleTimers();
  playSound("turn");
  addLog(`${owner === "player" ? "你的" : "AI 的"}回合开始。`);
  const releasedCards = turnStartAttackLockReleases(turnEvents)
    .map((release) => ({ ...release, card: findRuntimeCard(release.cardId)?.card || null }))
    .filter((release) => release.card);
  if (releasedCards.length > 0) {
    const cards = releasedCards.map((release) => release.card);
    const convergenceReleased = releasedCards.every((release) => release.reason === "trioConvergence");
    addLog(
      `${cards.map((card) => `「${card.name}」`).join("、")}的${convergenceReleased ? "三曜共降" : "临时"}攻击限制已解除，本回合可以攻击。`,
      cardLogMeta(cards[0], {
        actor: owner,
        type: "status",
        relatedCardIds: relatedCardIds(...cards.slice(1))
      })
    );
  }
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
    await sleep(950);
    const drawEvents = dispatchResolveTurnDrawFromUiState(state, "ai");
    applyDrawEventFeedback(state.ai, drawEvents, true);
    if (state.gameOver) return;
    if (state.phase !== PHASES.main) return;
    render();
    await sleep(1500);
    const turnGoal = chooseAiTurnGoal({
      hand: state.ai.hand,
      field: state.ai.field,
      aiStyle: state.aiStyle,
      canSummon: (_card, handIndex, options) => explainSummonMonsterFromUiState(
        state,
        "ai",
        handIndex,
        options.fieldIndex,
        { tributeIndexes: options.tributeIndexes }
      ).ok
    });
    await aiPlaySpells({ turnGoal, timing: "beforeSummon" });
    if (state.gameOver) return;
    await sleep(850);
    if (aiSetTraps({ turnGoal }) > 0) {
      render();
      await sleep(1300);
    }
    if (state.gameOver) return;
    let summonedThisTurn = await aiSummon();
    if (summonedThisTurn) {
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
      summonedThisTurn = true;
      render();
      await sleep(1850);
    }
    if (state.gameOver) return;
    if (turnGoal === "deployTrio" && summonedThisTurn) {
      await aiPlaySpells({ turnGoal, timing: "afterSummon" });
    }
    if (state.gameOver) return;
    dispatchChangePhaseFromUiState(state, "ai", PHASES.battle);
    await aiAttack();
    if (!state.gameOver) {
      await sleep(1150);
      try {
        dispatchEndTurnFromUiState(state, "ai", {
          reason: "ai-complete",
          endedBy: "system"
        });
      } catch (error) {
        cue(error.message || "AI 回合结束失败。");
        console.error(error);
        return;
      }
      beginTurn("player");
      render();
    }
  } finally {
    state.aiRunning = false;
  }
}

async function aiPlaySpells({ turnGoal = "pressure", timing = "beforeSummon" } = {}) {
  let action = chooseAiSpellAction({
    hand: state.ai.hand,
    owner: state.ai,
    rival: state.player,
    aiStyle: state.aiStyle,
    turnGoal,
    timing,
    canActivateSpell: (card, handIndex) => validateSpell(state.ai, state.player, card, handIndex).ok
  });
  while (action && !state.gameOver) {
    const playedCard = action.card;
    const acted = await playSpell(state.ai, state.player, action.handIndex);
    if (!acted) return;
    if (action.reason === "trioDeploymentFirst") {
      addLog(
        `对手在三曜部署完成后才发动「${playedCard.name}」，避免把强化浪费在祭品上。`,
        cardLogMeta(playedCard, { actor: "ai", type: "decision" })
      );
    }
    await sleep(1650);
    action = chooseAiSpellAction({
      hand: state.ai.hand,
      owner: state.ai,
      rival: state.player,
      aiStyle: state.aiStyle,
      turnGoal,
      timing,
      canActivateSpell: (card, handIndex) => validateSpell(state.ai, state.player, card, handIndex).ok
    });
  }
}

async function aiSummon() {
  const action = chooseAiSummonAction({
    hand: state.ai.hand,
    field: state.ai.field,
    aiStyle: state.aiStyle,
    canSummon: (_card, handIndex, options) => explainSummonMonsterFromUiState(
      state,
      "ai",
      handIndex,
      options.fieldIndex,
      { tributeIndexes: options.tributeIndexes }
    ).ok
  });
  if (!action) return false;
  const didSummon = await summonMonster(state.ai, state.player, action.handIndex, action.fieldIndex, {
    tributeIndexes: action.tributeIndexes
  });
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

function aiSetTraps({ turnGoal = "pressure" } = {}) {
  const reservedZones = aiSupportZoneReserve({
    hand: state.ai.hand,
    owner: state.ai,
    rival: state.player,
    aiStyle: state.aiStyle,
    turnGoal,
    canActivateSpell: (card, handIndex) => validateSpell(state.ai, state.player, card, handIndex).ok
  });
  const limit = aiTrapSetLimit({
    traps: state.ai.traps,
    aiStyle: state.aiStyle,
    reservedZones
  });
  let setCount = 0;
  while (setCount < limit) {
    const action = chooseAiSetTrapAction({
      hand: state.ai.hand,
      traps: state.ai.traps,
      aiStyle: state.aiStyle,
      canSetTrap: (_card, handIndex, trapIndex) =>
        explainSetTrapFromUiState(state, "ai", handIndex, trapIndex).ok
    });
    if (!action || !setTrap(state.ai, action.handIndex, action.trapIndex)) break;
    setCount += 1;
  }
  return setCount;
}

async function aiAttack() {
  const skippedAttackers = new Set();
  const maxAttackSteps = MONSTER_ZONE_SIZE * 3;
  for (let step = 0; step < maxAttackSteps; step += 1) {
    const action = chooseAiAttackAction({
      owner: state.ai,
      field: state.ai.field,
      rivalField: state.player.field,
      rivalLp: state.player.lp,
      rivalShield: state.player.shield,
      aiStyle: state.aiStyle,
      skippedAttackers,
      canAttackMonster: (_card, fieldIndex) =>
        explainMonsterAttackReadinessFromUiState(state, "ai", fieldIndex).ok
    });
    if (action.type === "none") {
      const blocked = collectAiAttackBlockers({
        field: state.ai.field,
        skippedAttackers,
        explainReadiness: (_card, fieldIndex) => explainMonsterAttackReadinessFromUiState(state, "ai", fieldIndex)
      });
      if (blocked.length > 0) {
        const convergenceLocked = blocked.filter(({ card, readiness }) =>
          card.attackLockReason === "trioConvergence" || readiness.engineReason === "trioConvergence"
        );
        if (convergenceLocked.length > 0) {
          const cards = convergenceLocked.map(({ card }) => card);
          addLog(
            `${cards.map((card) => `「${card.name}」`).join("、")}受三曜共降限制，本回合不能攻击；会在 AI 的下一个回合开始时解除。`,
            cardLogMeta(cards[0], {
              actor: "ai",
              type: "status",
              relatedCardIds: relatedCardIds(...cards.slice(1))
            })
          );
        } else {
          const cards = blocked.map(({ card }) => card);
          addLog(
            `对手没有可执行的攻击：${blocked.map(({ card, readiness }) => `${card.name}（${readiness.reason}）`).join("、")}。`,
            cardLogMeta(cards[0], {
              actor: "ai",
              type: "status",
              relatedCardIds: relatedCardIds(...cards.slice(1))
            })
          );
        }
      }
      return;
    }
    const { card, attackerIndex, targetIndex, target } = action;
    if (state.gameOver || !state.ai.field[attackerIndex]) return;
    if (action.type === "skipAttack") {
      skippedAttackers.add(action.cardUid);
      addLog(`对手保留 ${card.name} 的攻击机会，避免不利战斗。`, cardLogMeta(card, { actor: "ai", type: "battle" }));
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
    stopMusic({ fadeMs: 900 });
    const win = state.gameOverWinner ? state.gameOverWinner === "player" : state.ai.lp <= 0 && state.player.lp > 0;
    recordGameResult(win);
    playSound(win ? "win" : "lose");
    playVoice(win ? "player" : "ai", "win", win ? "你赢了。" : "决斗败北。", true);
    renderGameOverDuelModal(els, {
      win,
      statsText: formatDuelStats(state.stats)
    });
    window.setTimeout(() => showDuelModal(els), 260);
  }
}

function fieldEffectMarkers(card, duelist) {
  return effectMarkersForCard({
    card,
    duelist,
    gameEvents: state.gameEvents,
    findCard: (cardId) => findRuntimeCard(cardId)?.card || cardDefinitionById(cardId)
  });
}

function focusedCardEffectMarkers(card) {
  const cardId = runtimeCardId(card);
  if (!cardId) return [];
  for (const duelist of [state.player, state.ai]) {
    const fieldCard = duelist.field.find((candidate) =>
      candidate && (candidate === card || runtimeCardId(candidate) === cardId)
    );
    if (fieldCard) return fieldEffectMarkers(fieldCard, duelist);
  }
  return [];
}

function showDetail(card) {
  const view = cardInspectorViewModel(card, { effectMarkers: focusedCardEffectMarkers(card) });
  if (!view) return;
  state.focusedCard = card;
  renderCardInspector(document, cardInspectorElements, view);
}

function openCardDetail(cardOrId) {
  const view = cardDetailViewModel(cardOrId);
  const card = view?.card;
  if (!card) {
    cue("找不到这张卡的详情。");
    return;
  }
  state.focusedCard = card;
  resetPlayerIdleCountdown();
  renderCardDetailModal(document, els, view, { asset: monsterAsset(card) });
}

function openFocusedCardDetail() {
  if (!state.focusedCard) {
    cue("先选择一张卡。");
    return;
  }
  openCardDetail(state.focusedCard);
}

function closeCardDetail() {
  hideCardDetailModal(els);
  resetPlayerIdleCountdown();
}

function cardLogMeta(card, metadata = {}) {
  return {
    ...metadata,
    cardId: card?.id || metadata.cardId || null,
    public: metadata.public ?? true
  };
}

function relatedCardIds(...cards) {
  return cards
    .map((card) => card?.id || null)
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index);
}

function addLog(input, metadata = {}) {
  const hasMetadata = (input && typeof input === "object" && !Array.isArray(input)) || Object.keys(metadata).length > 0;
  const entry = hasMetadata
    ? createBattleLogEntry(input, {
      id: ++state.logSequence,
      turn: state.turn,
      actor: metadata.actor || state.turn,
      ...metadata
    })
    : logEntryMessage(input);
  state.log.unshift(entry);
  addTimeline(entry);
  renderTimeline();
  return entry;
}

function addTimeline(entry) {
  const next = nextTimelineState(state.timeline, entry, state.timelineStep);
  state.timelineStep = next.step;
  state.timeline = next.timeline;
}

function announce(text) {
  els.toast.textContent = text;
  els.toast.classList.remove("show");
  void els.toast.offsetWidth;
  els.toast.classList.add("show");
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
  if (BROWSER_MANUAL_MODE) return;
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
  return collectLegalTargetSelections(pending, {
    player: state.player,
    ai: state.ai
  });
}

function handleTargetSelectionTimeout() {
  if (!state.pendingTarget) {
    resolvePlayerActionWindow("目标选择超时");
    return;
  }

  const cardName = state.pendingTarget.cardName;
  const targets = legalPendingTargets();
  if (targets.length === 1) {
    const targetLabel = targetSelectionTargetLabel(targets[0]);
    addLog(`${cardName} 目标选择超时，自动确认唯一合法目标 ${targetLabel}。`);
    cue(`已自动确认 ${targetLabel}`);
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

function render(animationKey = "") {
  const scenario = scenarioSetups[state.scenarioId] || scenarioSetups.normal;
  const targetSelectionDisplay = currentTargetSelectionDisplay();
  const targetPrompt = targetSelectionDisplay.text;
  const actions = currentPlayerActions();
  const activeTurn = state.started && !state.gameOver ? state.turn : "idle";
  const musicMode = currentMusicMode();
  setMusicMode(musicMode);
  document.body.dataset.musicMode = musicMode;
  els.phaseText.textContent = phaseLabel(state);
  els.turnText.textContent = turnLabel(state);
  els.duelHint.textContent = duelHintText({
    started: state.started,
    paused: state.paused,
    pendingPrompt: targetPrompt,
    scenarioId: state.scenarioId,
    scenarioGoal: scenarioTacticalGoal(state) || scenario.goal,
    turn: state.turn,
    autoEnding: state.autoEnding,
    canAttack: actions.attack,
    canSpell: actions.spell,
    canSummon: actions.summon,
    canSetTrap: actions.trap,
    canChangeMode: actions.mode
  });
  const setupModalOpen = els.modal?.classList.contains("show") && !state.started && !state.gameOver;
  const canUseTurnControls = canUsePlayerTurnControls(state);
  const canAct = canPlayerAct();
  document.body.dataset.duelPhase = !state.started
    ? "setup"
    : state.gameOver
      ? "end"
      : state.paused
        ? "paused"
        : state.phase || "main";
  document.body.dataset.duelActionWindow = state.actionWindow || "none";
  document.body.dataset.duelSelection = state.pendingTarget
    ? "target"
    : state.pendingFusion
      ? "fusion"
      : state.pendingTribute
        ? "tribute"
        : state.selected?.zone || "none";
  document.body.dataset.duelCanAct = String(canAct);
  const selectedHand = selectedHandInfo();
  const selectedHandAction = selectedHand ? handActionInfo(selectedHand.card, selectedHand.index) : null;
  const fusionStatus = state.pendingFusion ? fusionSelectionStatus() : null;
  const selectedHandReady = Boolean(
    selectedHand &&
    selectedHandAction?.ok &&
    canUseHandCards(selectedHand.card) &&
    (!state.pendingTribute || selectedTributeIndexes().length === state.pendingTribute.cost) &&
    (!state.pendingFusion || fusionStatus?.complete)
  );
  const selectedPlayerMonster = state.selected?.zone === "playerField" && Boolean(state.player.field[state.selected.index]);
  const selectedPlayerMonsterModeValidation = selectedPlayerMonster
    ? explainChangeMonsterModeFromUiState(state, "player", state.selected.index)
    : { ok: false, reason: "请选择你场上的怪兽。" };
  renderDuelControls(els, buildDuelControlsView({
    started: state.started,
    gameOver: state.gameOver,
    paused: state.paused,
    setupModalOpen,
    actions,
    canUseTurnControls,
    canAct,
    pendingTarget: state.pendingTarget,
    pendingFusion: state.pendingFusion,
    pendingTribute: state.pendingTribute,
    selectedHandReady,
    selectedHandName: selectedHand?.card.name || "",
    selectedHandReason: selectedHandAction?.reason || "",
    targetPrompt,
    targetSelectionStatus: targetSelectionDisplay,
    fusionStatus,
    selectionPrompt: state.pendingTribute
      ? currentTributeSelectionDisplay()?.text || ""
      : state.pendingFusion
        ? currentFusionSelectionDisplay()?.text || ""
        : "",
    confirmLabel: handConfirmLabel(selectedHand?.card),
    phase: state.phase,
    selectedPlayerMonster,
    selectedPlayerMonsterMode: selectedPlayerMonster
      ? state.player.field[state.selected.index]?.mode || "attack"
      : "attack",
    selectedPlayerMonsterCanChangeMode: selectedPlayerMonsterModeValidation.ok,
    selectedPlayerMonsterModeReason: selectedPlayerMonsterModeValidation.reason,
    focusedCard: state.focusedCard,
    soundOn: state.soundOn,
    musicOn: state.musicOn,
    musicMode,
    musicPlaying: musicStatus().playing,
    musicVolume: state.musicVolume,
    voiceOn: state.voiceOn
  }));
  renderFusionSelectionPanel({
    document,
    elements: els,
    view: currentFusionSelectionView(),
    onSelectResult: selectFusionResult
  });
  const setupView = renderSetupPanel(document, els, {
    state,
    scenario,
    playerProfile: characterProfiles.player,
    aiLabel: aiProfiles[state.aiStyle]?.label || characterProfiles.ai.name,
    deckDefinitions: deckPresets,
    statsText: formatDuelStats(state.stats),
    hintsVisible: scenarioHintsVisible,
    deckExpanded: preDuelDeckExpanded,
    onOpenCardDetail: openCardDetail
  });
  scenarioHintsVisible = setupView.hintsVisible;
  const directTargetReady = canPlayerTargetAiPanel();
  renderCombatHud({
    document,
    body: document.body,
    elements: els,
    player: state.player,
    ai: state.ai,
    playerProfile: characterProfiles.player,
    aiProfile: characterProfiles.ai,
    activeTurn,
    paused: state.paused,
    maxLife: MAX_LP,
    directTargetReady
  });

  renderField(els.playerField, state.player, "player", animationKey);
  renderField(els.aiField, state.ai, "ai", animationKey);
  renderTraps(els.playerTraps, state.player, "player");
  renderTraps(els.aiTraps, state.ai, "ai");
  renderHand(animationKey);
  renderGraveTargets();
  renderTimeline();
  renderBattlePreview();
  renderAiReveal();
}

function renderBattlePreview() {
  const preview = state.battlePreview || selectedAttackPreview();
  renderBattlePreviewElement(document, els.battlePreview, preview);
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

function showSelectedAttackTargetPreview(targetIndex) {
  if (state.selected?.zone !== "playerField" || !canPlayerAct()) return;
  const attackerIndex = state.selected.index;
  const attacker = state.player.field[attackerIndex];
  const projection = projectBattleFromUiState(state, "player", { attackerIndex });
  if (!attacker || !projection.attackActions.some((action) => action.targetIndex === targetIndex)) return;
  const target = targetIndex >= 0 ? state.ai.field[targetIndex] : null;
  showBattlePreview(attacker, target, state.player, state.ai);
  renderBattlePreview();
}

function restoreSelectedAttackPreview() {
  if (!canUseAttackIntentWindow()) return;
  clearBattlePreview();
  renderBattlePreview();
}

function renderField(root, duelist, owner, animationKey) {
  const fieldSpellTargetActive = ["ownMonster", "enemyMonster"].includes(state.pendingTarget?.mode)
    && state.pendingTarget?.effect !== "splitToken";
  renderMonsterZones({
    document,
    root,
    duelist,
    owner,
    state,
    animationKey,
    assetForCard: monsterAsset,
    targetableAt: (index) => isPendingTargetSlot(owner, index),
    targetSelectedAt: (index) => isSelectedTargetSelection(state.pendingTarget, owner, index),
    attackTargetableAt: (index) => isAttackTargetSlot(owner, index),
    attackReadinessAt: (index) => explainMonsterAttackReadinessFromUiState(state, owner, index),
    selectedTributeIndexes: owner === "player" ? selectedTributeIndexes() : [],
    selectedFusionIndexes: owner === "player" ? selectedFusionIndexes() : [],
    materialTargetAt: (index) => {
      const card = duelist.field[index];
      const tributeSelected = owner === "player" && selectedTributeIndexes().includes(index);
      if (state.pendingTribute) return describeTributeTarget({ owner, card, selected: tributeSelected });
      const fusionSelected = owner === "player" && selectedFusionIndexes().includes(index);
      if (state.pendingFusion?.resultId) return currentFusionMaterialTarget(owner, card, fusionSelected);
      return null;
    },
    splitTargetAt: (index) => state.pendingTarget?.effect === "splitToken"
      ? describeSplitTokenTarget({ owner, card: duelist.field[index] })
      : null,
    spellTargetAt: (index) => fieldSpellTargetActive
      ? validateCurrentTarget(owner, index, "field")
      : null,
    effectMarkersAt: (index) => fieldEffectMarkers(duelist.field[index], duelist),
    onSlotClick: (index) => {
      const interaction = { directActivate: directActivationTracker.register(`${owner}:field:${index}`) };
      return owner === "player" ? handlePlayerSlot(index, interaction) : handleAiSlot(index, interaction);
    },
    onSlotDoubleClick: (index) => owner === "player"
      ? handlePlayerSlot(index, { directActivate: true })
      : handleAiSlot(index, { directActivate: true }),
    onCardClick: (index) => {
      const interaction = { directActivate: directActivationTracker.register(`${owner}:field:${index}`) };
      return owner === "player" ? selectPlayerMonster(index, interaction) : handleAiSlot(index, interaction);
    },
    onAttackPreview: showSelectedAttackTargetPreview,
    onAttackPreviewRestore: restoreSelectedAttackPreview
  });
}

function renderTraps(root, duelist, owner) {
  renderSupportZones({
    document,
    root,
    duelist,
    owner,
    state,
    assetForCard: monsterAsset,
    targetableAt: (index) => isPendingTrapTargetSlot(owner, index),
    targetSelectedAt: (index) => isSelectedTargetSelection(state.pendingTarget, owner, index, "traps"),
    spellTargetAt: (index) => isSupportTargetSelection(state.pendingTarget)
      ? validateCurrentTarget(owner, index, "traps")
      : null,
    onSlotClick: (index) => {
      const interactionKey = owner === "player" && state.pendingTrapChoice
        ? `trap-response:${index}`
        : `${owner}:traps:${index}`;
      const interaction = { directActivate: directActivationTracker.register(interactionKey) };
      return owner === "player" ? handlePlayerTrapSlot(index, interaction) : handleAiTrapSlot(index, interaction);
    },
    onSlotDoubleClick: (index) => owner === "player"
      ? handlePlayerTrapSlot(index, { directActivate: true })
      : handleAiTrapSlot(index, { directActivate: true }),
    onCardClick: (card, index) => {
      if (owner === "player" && state.pendingTrapChoice) {
        return interactWithPendingTrapChoice(index, {
          directActivate: directActivationTracker.register(`trap-response:${index}`)
        });
      }
      state.selected = null;
      clearBattlePreview();
      showDetail(card);
      render();
      if (canPlayerAct()) resumePlayerIdleCountdownAfterPassiveIntent();
    },
    onCardDoubleClick: (_card, index) => {
      if (owner === "player" && state.pendingTrapChoice) {
        return interactWithPendingTrapChoice(index, { directActivate: true });
      }
      if (state.pendingTarget) {
        return owner === "player"
          ? handlePlayerTrapSlot(index, { directActivate: true })
          : handleAiTrapSlot(index, { directActivate: true });
      }
      if (owner === "player") return activatePendingTrapChoice(index);
      return false;
    }
  });
}

function handActionInfo(card, handIndex) {
  const selected = state.selected?.zone === "hand" && state.selected.uid === card.uid;
  const targetSelection = card.type === "spell" ? targetSelectionForCard(card, spellEffects) : null;
  const needsTarget = spellNeedsManualTarget(state.player, card, spellEffects);
  const activeTargetSelection = state.pendingTarget?.handUid === card.uid;
  const action = describeHandAction(card, {
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
    spellTargetPrompt: activeTargetSelection
      ? currentTargetSelectionDisplay().text
      : needsTarget
      ? targetSelection?.effect === "splitToken"
        ? currentSplitTokenDisplay().text
        : targetSelectionPrompt(targetSelection)
      : state.pendingTarget
        ? currentTargetSelectionDisplay().text
        : ""
  });
  if (card.type === "spell" && fusionDefinition(card)) {
    const fusion = fusionDefinition(card);
    if (!fusionSummonReady(card)) {
      return {
        ok: false,
        label: "素材不足",
        reason: `需要手牌或场上的 ${fusionMaterialNames(fusion.materials)}，并且手牌或卡组里要有融合怪兽。`
      };
    }
    const status = state.pendingFusion?.handUid === card.uid ? fusionSelectionStatus() : null;
    const display = status ? currentFusionSelectionDisplay() : null;
    return {
      ...action,
      label: status?.needsResult ? "选择融合结果" : status ? `融合 ${status.selectedCount}/${status.requiredCount}` : "融合召唤",
      reason: display
        ? display.text
        : `确认后选择 ${fusionMaterialNames(fusion.materials)} 作为融合素材。`
    };
  }
  const tributeAction = tributeSelectionAction(card, state.pendingTribute, state.player.field, action);
  if (tributeAction) {
    return {
      ...tributeAction,
      reason: state.pendingTribute?.handUid === card.uid
        ? currentTributeSelectionDisplay().text
        : tributeAction.reason
    };
  }
  return action;
}

function renderHand(animationKey) {
  renderHandCards({
    document,
    root: els.hand,
    cards: state.player.hand,
    animationKey,
    assetForCard: monsterAsset,
    actionForCard: handActionInfo,
    selectedZone: state.selected?.zone,
    selectedUid: state.selected?.uid,
    started: state.started,
    canAct: canPlayerAct(),
    fusionTargetForCard: (card) => {
      const selected = Boolean(state.pendingFusion) && selectedFusionHandUids().includes(card.uid);
      return state.pendingFusion?.resultId && card.uid !== state.pendingFusion.handUid
        ? currentFusionMaterialTarget("player", card, selected)
        : null;
    },
    fusionSelectedUids: state.pendingFusion ? selectedFusionHandUids() : [],
    onCardClick: (card) => selectHandCard(card.uid, {
      directActivate: directActivationTracker.register(`hand:${card.uid}`)
    }),
    onCardDoubleClick: (card) => selectHandCard(card.uid, { directActivate: true })
  });
}

function renderGraveTargets() {
  const root = els.graveTargets;
  if (!root) return;
  root.innerHTML = "";
  delete root.dataset.summary;
  root.removeAttribute("aria-label");
  const targetMode = state.pendingTarget?.mode || "";
  const active = ["ownGraveMonster", "ownGraveCard"].includes(targetMode);
  root.hidden = !active;
  if (!active) return;
  const candidates = state.player.grave
    .map((card, index) => card ? {
      card,
      index,
      targetInfo: validateCurrentTarget("player", index, "grave")
    } : null)
    .filter(Boolean);
  const legalCount = candidates.filter((candidate) => candidate.targetInfo.ok).length;
  const legalAction = targetMode === "ownGraveMonster" ? "可召唤" : "可选择";
  root.dataset.summary = `${legalAction} ${legalCount} / 墓地 ${candidates.length}`;
  root.setAttribute("aria-label", `墓地目标：${legalCount} 张${legalAction}，墓地共 ${candidates.length} 张卡。`);
  candidates.forEach(({ card, index, targetInfo }) => {
    const cardEl = renderCardElement(document, card, { asset: monsterAsset(card) });
    cardEl.dataset.zone = "player-grave";
    cardEl.dataset.targetState = targetInfo.ok ? "legal" : "unavailable";
    cardEl.classList.add("grave-target-card");
    cardEl.classList.toggle("targetable", targetInfo.ok);
    cardEl.classList.toggle("grave-target-unavailable", !targetInfo.ok);
    const selected = isSelectedTargetSelection(state.pendingTarget, "player", index, "grave");
    cardEl.classList.toggle("target-selected", targetInfo.ok && selected);
    cardEl.setAttribute("aria-pressed", String(targetInfo.ok && selected));
    cardEl.setAttribute("aria-disabled", String(!targetInfo.ok));
    cardEl.title = targetInfo.ok ? `选择墓地目标：${card.name}` : targetInfo.reason;
    if (!targetInfo.ok) {
      const reason = document.createElement("span");
      reason.className = "grave-target-reason";
      reason.textContent = /不是怪兽/.test(targetInfo.reason) ? "非怪兽" : "不满足条件";
      reason.title = targetInfo.reason;
      cardEl.appendChild(reason);
    }
    cardEl.addEventListener("click", () => {
      interactWithPendingSpellTarget("player", index, "grave", {
        directActivate: directActivationTracker.register(`player:grave:${index}`)
      });
    });
    cardEl.addEventListener("dblclick", (event) => {
      event.preventDefault();
      interactWithPendingSpellTarget("player", index, "grave", { directActivate: true });
    });
    root.appendChild(cardEl);
  });
}

function renderChainHistory() {
  renderChainHistoryPanel({
    document,
    elements: els,
    events: state.gameEvents,
    findCard: findRuntimeCard,
    expanded: chainHistoryExpanded,
    onCardClick: openCardDetail
  });
}

function renderTimeline() {
  renderTimelinePanel({
    document,
    elements: els,
    timeline: state.timeline,
    gameEvents: state.gameEvents,
    chainHistoryExpanded,
    findCard: findRuntimeCard,
    findTimelineCard: cardDefinitionById,
    onCardClick: openCardDetail
  });
}

function toggleSound() {
  toggleAudioSound({ previewSound: "turn" });
  render();
}

function toggleMusic() {
  const enabled = toggleBackgroundMusic();
  if (enabled && state.started && !state.paused && !state.gameOver) {
    playMusic(currentMusicMode());
  }
  render();
}

function changeMusicVolume(event) {
  setMusicVolume(Number(event.currentTarget.value) / 100);
  event.currentTarget.style.setProperty("--music-volume", `${event.currentTarget.value}%`);
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
  unlockMusic();
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
els.musicBtn.addEventListener("click", toggleMusic);
els.musicVolume.addEventListener("input", changeMusicVolume);
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
els.fieldModeBtn?.addEventListener("click", toggleSelectedMode);
els.detailBtn.addEventListener("click", openFocusedCardDetail);
if (els.fusionPreviewDetail) {
  els.fusionPreviewDetail.addEventListener("click", () => {
    const resultId = state.pendingFusion?.resultId || els.fusionPreviewDetail.dataset.cardId;
    if (resultId) openCardDetail(resultId);
  });
}
els.aiPanel.addEventListener("click", handleAiPanelAttack);
els.aiPanel.addEventListener("pointerenter", () => showSelectedAttackTargetPreview(-1));
els.aiPanel.addEventListener("pointerleave", restoreSelectedAttackPreview);
els.aiPanel.addEventListener("focus", () => showSelectedAttackTargetPreview(-1));
els.aiPanel.addEventListener("blur", restoreSelectedAttackPreview);
els.aiPanel.addEventListener("keydown", (event) => {
  if (!canPlayerTargetAiPanel() || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  handleAiPanelAttack();
});
els.zoomClose.addEventListener("click", closeCardDetail);
els.aiRevealDetail.addEventListener("click", () => {
  if (pendingAiReveal?.cardId) openCardDetail(pendingAiReveal.cardId);
});
els.aiRevealContinue.addEventListener("click", confirmAiRevealContinue);
els.chainYes.addEventListener("click", confirmTrapChoice);
els.chainNo.addEventListener("click", () => answerChain(false));
els.restartBtn.addEventListener("click", prepareGame);
if (els.chainHistoryToggle) {
  els.chainHistoryToggle.addEventListener("click", () => {
    chainHistoryExpanded = !chainHistoryExpanded;
    renderChainHistory();
    resetPlayerIdleCountdown();
  });
}
if (els.scenarioHintToggle) {
  els.scenarioHintToggle.addEventListener("click", () => {
    scenarioHintsVisible = !scenarioHintsVisible;
    render();
  });
}
if (els.preDuelDeckToggle) {
  els.preDuelDeckToggle.addEventListener("click", () => {
    preDuelDeckExpanded = !preDuelDeckExpanded;
    render();
  });
}
els.modalRestart.addEventListener("click", () => {
  if (state.gameOver) {
    prepareGame();
  } else {
    startGame();
  }
});
if (els.modalReviewLog) {
  els.modalReviewLog.addEventListener("click", () => {
    els.modal.classList.remove("show");
    resetPlayerIdleCountdown();
  });
}
[els.roleSelect, els.deckSelect, els.aiSelect, els.scenarioSelect].filter(Boolean).forEach((select) => {
  select.addEventListener("change", () => {
    if (select === els.scenarioSelect) {
      scenarioHintsVisible = true;
      preDuelDeckExpanded = false;
    }
    applySetupChoices();
    render();
  });
});

if (BROWSER_TEST_MODE) {
  window.__starDuelTest = Object.freeze({
    musicStatus,
    snapshot: createTestSnapshot({
      testMode: BROWSER_TEST_MODE,
      state,
      els,
      currentPlayerActions
    })
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseMusic({ fadeMs: 120 });
  } else if (state.started && !state.paused && !state.gameOver && state.musicOn) {
    playMusic(currentMusicMode());
  }
});

initializeSetupControls();
prepareGame();
scheduleBrowserSmoke({
  smoke: BROWSER_SMOKE,
  state,
  els,
  currentPlayerActions,
  render,
  showAiRevealForSmoke: waitForAiReveal
});
