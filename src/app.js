import { monsterAssets, roleProfiles, aiProfiles, deckPresets, characterProfiles, scenarioSetups } from './data.js';
import { actionsForPhase, canDuelistAttack, shouldRunPlayerIdleCountdown, skipAvailableAttacks, summarizePlayerActions } from './actions.js';
import { battleLogText, battleWearAmount, describeBattleOutcome } from './battle.js';
import { createTestSnapshot, scheduleBrowserSmoke } from './browser-smoke.js';
import { cardDetailText, cardZoomMeta } from './card-detail.js';
import { createCardElement as renderCardElement } from './card-renderer.js';
import { availableElementCombos, markElementComboResolved } from './combos.js';
import { buildDeck, createDuelist } from './deck.js';
import {
  canDispatchSpellFromUiState,
  dispatchActivateSpellFromUiState,
  dispatchSetTrapFromUiState,
  dispatchSummonMonsterFromUiState
} from './engine-adapter.js';
import { auditLogEntries } from './log-audit.js';
import { scoreSpellForAi, spellDefinitions, validateSpellCondition } from './spells.js';
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
  aiWindowPatch,
  drawToMainPatch,
  mainToBattlePatch,
  normalizeActionWindow,
  openActionWindowPatch,
  pauseResumeStep,
  playerActionWindowDecision,
  shouldRunPlayerIdleCountdownForState,
  turnStartPatch
} from './turn-state.js';
import { describeHandAction, duelHintText, phaseLabel, turnLabel } from './view-model.js';
import {
  MAX_LP,
  battlePreviewText,
  battleValue,
  canDirectAttack,
  fieldCards,
  fieldElements,
  legalAttackTargets,
  makeBattlePreview,
  spellTargetPrompt,
  strongestMonster,
  totalAtk,
  totalDef,
  validateAttackTarget,
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
  summonedThisTurn: false,
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
  soundOn: !BROWSER_TEST_MODE,
  voiceOn: !BROWSER_TEST_MODE,
  voiceReady: BROWSER_TEST_MODE,
  gameOver: false,
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

const audio = {
  ctx: null,
  master: null,
  voiceMaster: null
};

const voiceFiles = {
  player: {
    start: "assets/voice/player-start.wav",
    turn: "assets/voice/player-turn.wav",
    draw: "assets/voice/player-draw.wav",
    summon: "assets/voice/player-summon.wav",
    ace: "assets/voice/player-ace.wav",
    spell: "assets/voice/player-spell.wav",
    trap: "assets/voice/player-trap.wav",
    attack: "assets/voice/player-attack.wav",
    direct: "assets/voice/player-direct.wav",
    hit: "assets/voice/player-hit.wav",
    break: "assets/voice/player-break.wav",
    combo: "assets/voice/player-combo.wav",
    shield: "assets/voice/player-shield.wav",
    win: "assets/voice/player-win.wav",
    lose: "assets/voice/player-lose.wav"
  },
  ai: {
    turn: "assets/voice/ai-turn.wav",
    draw: "assets/voice/ai-draw.wav",
    summon: "assets/voice/ai-summon.wav",
    ace: "assets/voice/ai-ace.wav",
    spell: "assets/voice/ai-spell.wav",
    trap: "assets/voice/ai-trap.wav",
    attack: "assets/voice/ai-attack.wav",
    direct: "assets/voice/ai-direct.wav",
    hit: "assets/voice/ai-hit.wav",
    break: "assets/voice/ai-break.wav",
    combo: "assets/voice/ai-combo.wav",
    shield: "assets/voice/ai-shield.wav",
    win: "assets/voice/ai-win.wav",
    lose: "assets/voice/ai-lose.wav"
  },
  common: {
    clash: "assets/voice/common-clash.wav",
    damage: "assets/voice/common-damage.wav",
    heal: "assets/voice/common-heal.wav"
  }
};

let cachedVoices = [];
let activeVoiceAudio = [];
let voiceQueue = [];
let voicePlaying = false;
let finishActiveVoice = null;
let voiceToken = 0;
let activeVoicePriority = 0;
let activeVoiceKey = "";
const voiceBufferCache = new Map();

if ("speechSynthesis" in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

function ensureAudio(force = false) {
  if (!state.soundOn && !force) return null;
  if (!audio.ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audio.ctx = new AudioContext();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.22;
    audio.master.connect(audio.ctx.destination);
    audio.voiceMaster = audio.ctx.createGain();
    audio.voiceMaster.gain.value = 0.92;
    audio.voiceMaster.connect(audio.ctx.destination);
  } else if (!audio.voiceMaster) {
    audio.voiceMaster = audio.ctx.createGain();
    audio.voiceMaster.gain.value = 0.92;
    audio.voiceMaster.connect(audio.ctx.destination);
  }
  if (audio.ctx.state === "suspended") {
    audio.ctx.resume();
  }
  return audio.ctx;
}

function tone(freq, start, duration, type = "sine", gain = 0.18, endGain = 0.001) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  vol.gain.setValueAtTime(0.001, ctx.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.018);
  vol.gain.exponentialRampToValueAtTime(endGain, ctx.currentTime + start + duration);
  osc.connect(vol);
  vol.connect(audio.master);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.04);
}

function sweep(fromFreq, toFreq, start, duration, type = "sawtooth", gain = 0.12) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, ctx.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), ctx.currentTime + start + duration);
  vol.gain.setValueAtTime(0.001, ctx.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.018);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(vol);
  vol.connect(audio.master);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

function chord(freqs, start, duration, type = "triangle", gain = 0.07) {
  freqs.forEach((freq, index) => tone(freq, start + index * 0.018, duration, type, gain));
}

function noise(start, duration, gain = 0.14, filterFreq = 1200) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const vol = ctx.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.9;
  vol.gain.setValueAtTime(gain, ctx.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  source.connect(filter);
  filter.connect(vol);
  vol.connect(audio.master);
  source.start(ctx.currentTime + start);
}

function noiseSweep(start, duration, fromFreq, toFreq, gain = 0.12, type = "bandpass") {
  const ctx = ensureAudio();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const vol = ctx.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.frequency.setValueAtTime(fromFreq, ctx.currentTime + start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), ctx.currentTime + start + duration);
  filter.Q.value = 1.25;
  vol.gain.setValueAtTime(gain, ctx.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  source.connect(filter);
  filter.connect(vol);
  vol.connect(audio.master);
  source.start(ctx.currentTime + start);
}

function playSound(name) {
  if (!state.soundOn) return;
  if (name === "draw") {
    noiseSweep(0, 0.18, 2800, 720, 0.09, "bandpass");
    sweep(360, 1200, 0.02, 0.16, "triangle", 0.07);
    chord([740, 932, 1175], 0.13, 0.22, "sine", 0.045);
    noise(0.22, 0.09, 0.035, 3200);
  }
  if (name === "summon") {
    tone(180, 0, 0.18, "sawtooth", 0.11);
    tone(360, 0.08, 0.18, "triangle", 0.12);
    tone(720, 0.16, 0.22, "sine", 0.1);
  }
  if (name === "ace") {
    noise(0, 0.18, 0.12, 1800);
    tone(196, 0, 0.18, "sawtooth", 0.1);
    tone(392, 0.1, 0.22, "triangle", 0.1);
    tone(784, 0.22, 0.28, "sine", 0.09);
    tone(1175, 0.34, 0.34, "triangle", 0.07);
  }
  if (name === "spell") {
    tone(520, 0, 0.12, "sine", 0.1);
    tone(780, 0.05, 0.14, "triangle", 0.11);
    tone(1040, 0.11, 0.18, "sine", 0.08);
  }
  if (name === "spell-burn500") {
    noise(0, 0.16, 0.13, 520);
    tone(180, 0, 0.16, "sawtooth", 0.1);
    tone(92, 0.08, 0.18, "square", 0.08);
  }
  if (name === "spell-heal700") {
    tone(523, 0, 0.13, "sine", 0.08);
    tone(659, 0.08, 0.16, "triangle", 0.09);
    tone(880, 0.18, 0.22, "sine", 0.07);
  }
  if (name === "spell-buff500") {
    tone(247, 0, 0.1, "square", 0.08);
    tone(494, 0.07, 0.14, "sawtooth", 0.08);
    tone(988, 0.14, 0.2, "triangle", 0.06);
  }
  if (name === "spell-draw2") {
    noise(0, 0.07, 0.07, 2100);
    tone(740, 0.03, 0.08, "triangle", 0.07);
    noise(0.1, 0.07, 0.06, 2500);
    tone(930, 0.13, 0.1, "triangle", 0.07);
  }
  if (name === "spell-elementEcho") {
    chord([392, 523, 659, 784], 0, 0.24, "triangle", 0.06);
    sweep(520, 1320, 0.08, 0.24, "sine", 0.055);
    noiseSweep(0.02, 0.18, 2600, 900, 0.045, "bandpass");
  }
  if (name === "spell-extraSummon") {
    chord([330, 494, 660], 0, 0.2, "square", 0.05);
    sweep(260, 880, 0.04, 0.2, "triangle", 0.055);
  }
  if (name === "spell-rallyAttack") {
    noiseSweep(0, 0.18, 1200, 2400, 0.08, "bandpass");
    chord([247, 494, 988], 0.04, 0.22, "sawtooth", 0.045);
  }
  if (name === "spell-pierceLine") {
    noiseSweep(0, 0.22, 3600, 420, 0.12, "bandpass");
    sweep(1200, 180, 0.02, 0.2, "sawtooth", 0.08);
    tone(220, 0.1, 0.18, "square", 0.07);
  }
  if (name === "spell-graveReturn") {
    chord([392, 494, 587], 0, 0.2, "triangle", 0.055);
    noiseSweep(0.05, 0.2, 680, 2200, 0.055, "bandpass");
    sweep(330, 880, 0.1, 0.22, "sine", 0.05);
  }
  if (name === "spell-battleTrance") {
    noiseSweep(0, 0.25, 220, 2600, 0.1, "bandpass");
    chord([196, 392, 784], 0.03, 0.26, "sawtooth", 0.05);
    tone(98, 0.18, 0.24, "square", 0.08);
  }
  if (name === "spell-directStrike") {
    noiseSweep(0, 0.24, 3200, 620, 0.12, "bandpass");
    sweep(420, 1480, 0.02, 0.24, "triangle", 0.075);
    chord([330, 660, 990], 0.08, 0.26, "sawtooth", 0.052);
    tone(82, 0.22, 0.22, "sine", 0.08);
  }
  if (name === "spell-fireWindCombo") {
    noiseSweep(0, 0.26, 420, 3600, 0.12, "bandpass");
    chord([220, 440, 660, 880], 0.04, 0.26, "sawtooth", 0.052);
    sweep(1320, 180, 0.14, 0.28, "triangle", 0.07);
  }
  if (name === "spell-lightShadowCombo") {
    chord([294, 392, 587, 784], 0, 0.28, "triangle", 0.055);
    noiseSweep(0.04, 0.28, 2400, 560, 0.08, "bandpass");
    sweep(220, 1100, 0.12, 0.28, "sine", 0.06);
  }
  if (name === "spell-shield800") {
    playSound("guard");
  }
  if (name === "attack") {
    noiseSweep(0, 0.2, 180, 2400, 0.1, "bandpass");
    sweep(96, 520, 0, 0.18, "sawtooth", 0.09);
    sweep(1200, 320, 0.1, 0.2, "triangle", 0.06);
    tone(64, 0.15, 0.18, "sine", 0.08);
  }
  if (name === "attack-charge") {
    noiseSweep(0, 0.42, 140, 3600, 0.12, "bandpass");
    sweep(72, 740, 0.02, 0.48, "sawtooth", 0.11);
    chord([196, 294, 392], 0.12, 0.36, "triangle", 0.055);
    tone(48, 0.36, 0.2, "sine", 0.12);
  }
  if (name === "attack-impact") {
    noiseSweep(0, 0.42, 5200, 120, 0.22, "bandpass");
    noiseSweep(0.03, 0.5, 160, 60, 0.2, "lowpass");
    tone(42, 0, 0.48, "sine", 0.17);
    tone(84, 0.06, 0.3, "square", 0.09);
    chord([220, 165, 110], 0.16, 0.26, "sawtooth", 0.06);
  }
  if (name === "attack-direct") {
    noiseSweep(0, 0.34, 4200, 420, 0.18, "bandpass");
    sweep(880, 64, 0.02, 0.36, "sawtooth", 0.15);
    tone(46, 0.04, 0.4, "sine", 0.15);
    tone(156, 0.12, 0.22, "square", 0.08);
  }
  if (name === "attack-break") {
    noiseSweep(0, 0.44, 3600, 160, 0.22, "bandpass");
    noiseSweep(0.08, 0.45, 220, 72, 0.18, "lowpass");
    tone(44, 0, 0.48, "sine", 0.16);
    tone(110, 0.03, 0.26, "square", 0.1);
    chord([330, 247, 196], 0.16, 0.24, "sawtooth", 0.06);
  }
  if (name === "attack-clash") {
    noiseSweep(0, 0.48, 2400, 260, 0.22, "bandpass");
    tone(70, 0, 0.3, "sawtooth", 0.13);
    tone(140, 0.08, 0.22, "square", 0.1);
    tone(70, 0.18, 0.28, "sawtooth", 0.11);
    chord([392, 277, 196], 0.2, 0.24, "sawtooth", 0.052);
  }
  if (name === "damage") {
    noiseSweep(0, 0.2, 520, 140, 0.13, "lowpass");
    tone(130, 0, 0.18, "sawtooth", 0.1);
    sweep(300, 80, 0.05, 0.2, "square", 0.06);
  }
  if (name === "guard") {
    noiseSweep(0, 0.16, 4200, 1200, 0.08, "bandpass");
    chord([523, 659, 784, 1046], 0.02, 0.22, "triangle", 0.055);
    sweep(1800, 620, 0.04, 0.22, "sine", 0.06);
    tone(92, 0.08, 0.18, "sine", 0.06);
  }
  if (name === "turn") {
    tone(330, 0, 0.08, "triangle", 0.08);
    tone(495, 0.08, 0.1, "triangle", 0.08);
  }
  if (name === "win") {
    [392, 523, 659, 784].forEach((freq, index) => tone(freq, index * 0.09, 0.22, "triangle", 0.09));
  }
  if (name === "lose") {
    [330, 247, 196, 147].forEach((freq, index) => tone(freq, index * 0.1, 0.24, "sawtooth", 0.08));
  }
  if (name === "click") {
    tone(440, 0, 0.045, "triangle", 0.05);
  }
  if (name === "trap") {
    noise(0, 0.12, 0.12, 1500);
    tone(920, 0.03, 0.11, "square", 0.07);
    tone(460, 0.11, 0.18, "sawtooth", 0.08);
  }
  if (name === "trap-attackDestroy") {
    tone(1040, 0, 0.08, "square", 0.08);
    noise(0.05, 0.18, 0.16, 980);
    tone(130, 0.13, 0.18, "sawtooth", 0.09);
  }
  if (name === "trap-directShield") {
    tone(392, 0, 0.11, "triangle", 0.08);
    tone(523, 0.09, 0.18, "sine", 0.09);
    noise(0.04, 0.2, 0.05, 2300);
  }
  if (name === "trap-attackShift") {
    playSound("guard");
    noiseSweep(0.02, 0.2, 2600, 760, 0.08, "bandpass");
    sweep(420, 1120, 0.04, 0.22, "triangle", 0.055);
  }
  if (name === "trap-attackNegate") {
    tone(880, 0, 0.09, "square", 0.075);
    tone(440, 0.07, 0.14, "triangle", 0.065);
    noiseSweep(0.04, 0.22, 3200, 260, 0.1, "bandpass");
    chord([330, 494, 659], 0.14, 0.2, "sine", 0.045);
  }
  if (name === "trap-redirectAttack") {
    tone(740, 0, 0.08, "triangle", 0.07);
    sweep(1280, 360, 0.04, 0.24, "sine", 0.06);
    noiseSweep(0.08, 0.22, 2100, 540, 0.08, "bandpass");
    tone(220, 0.18, 0.16, "square", 0.055);
  }
  if (name === "trap-summonBurn") {
    noise(0, 0.16, 0.15, 620);
    tone(156, 0.04, 0.18, "sawtooth", 0.09);
    tone(312, 0.13, 0.14, "square", 0.06);
  }
  if (name === "trap-weakenAttack") {
    noiseSweep(0, 0.22, 3000, 240, 0.12, "bandpass");
    tone(156, 0.04, 0.18, "square", 0.08);
    sweep(620, 180, 0.09, 0.2, "sawtooth", 0.06);
  }
  if (name === "trap-directRebound") {
    playSound("guard");
    noiseSweep(0.08, 0.24, 180, 3600, 0.1, "bandpass");
    chord([330, 660, 990], 0.14, 0.22, "square", 0.045);
  }
}

function preferredVoice(owner = "player") {
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
  const zhVoices = voices.filter((voice) => /zh|Chinese|Mandarin|普通话|中文/i.test(`${voice.lang} ${voice.name}`));
  const preferred = owner === "ai"
    ? [/Yunxi|Kangkang|male|男|Microsoft.*Chinese/i, /zh-CN/i]
    : [/Xiaoxiao|Huihui|female|女|Microsoft.*Chinese/i, /zh-CN/i];
  return preferred
    .map((pattern) => zhVoices.find((voice) => pattern.test(`${voice.name} ${voice.lang}`)))
    .find(Boolean) || zhVoices[0] || voices[0] || null;
}

function stopVoiceAudio() {
  voiceToken += 1;
  voiceQueue = [];
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  activeVoiceAudio.forEach((item) => {
    try {
      item.stop?.();
    } catch (error) {
      // Already stopped.
    }
  });
  activeVoiceAudio = [];
  voicePlaying = false;
  activeVoicePriority = 0;
  activeVoiceKey = "";
  if (finishActiveVoice) {
    finishActiveVoice();
    finishActiveVoice = null;
  }
}

function playVoice(owner, key, fallback = "", force = false) {
  return speak(fallback, force, owner);
}

function voicePriority(key) {
  return {
    win: 10,
    lose: 10,
    ace: 9,
    combo: 8,
    direct: 8,
    break: 7,
    attack: 6,
    trap: 6,
    spell: 5,
    summon: 5,
    turn: 4,
    shield: 4,
    hit: 3,
    draw: 2,
    start: 2
  }[key] || 1;
}

function enqueueVoice(job) {
  if (job.priority <= 2 && (voicePlaying || voiceQueue.length > 0)) {
    return false;
  }
  if (voicePlaying) {
    const shouldInterrupt = job.force || job.priority >= 8 || (job.priority >= 6 && activeVoicePriority <= 6);
    if (shouldInterrupt) {
      stopVoiceAudio();
    } else if (job.priority <= 4 || activeVoicePriority >= job.priority) {
      return false;
    }
  }
  voiceQueue = voiceQueue.filter((item) => item.priority >= 5);
  voiceQueue.push(job);
  if (voiceQueue.length > 2) {
    voiceQueue.sort((a, b) => b.priority - a.priority);
    voiceQueue = voiceQueue.slice(0, 2);
  }
  processVoiceQueue();
  return true;
}

async function processVoiceQueue() {
  if (voicePlaying || voiceQueue.length === 0) return;
  const job = voiceQueue.shift();
  voicePlaying = true;
  activeVoicePriority = job.priority;
  activeVoiceKey = job.key;
  const runToken = voiceToken;
  try {
    await playProcessedVoice(job);
  } catch (error) {
    await sleep(120);
  } finally {
    if (runToken === voiceToken) {
      voicePlaying = false;
      activeVoicePriority = 0;
      activeVoiceKey = "";
      finishActiveVoice = null;
      window.setTimeout(processVoiceQueue, 60);
    }
  }
}

async function loadVoiceBuffer(src) {
  const ctx = ensureAudio(true);
  if (!ctx) throw new Error("AudioContext unavailable");
  if (voiceBufferCache.has(src)) return voiceBufferCache.get(src);
  const response = await fetch(src);
  if (!response.ok) throw new Error("Voice file missing");
  const data = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(data.slice(0));
  voiceBufferCache.set(src, buffer);
  return buffer;
}

async function playProcessedVoice(job) {
  const ctx = ensureAudio(true);
  const buffer = await loadVoiceBuffer(job.src);
  const token = voiceToken;
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      activeVoiceAudio = [];
      resolve();
    };
    const source = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const presence = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();
    const shaper = ctx.createWaveShaper();
    const dry = ctx.createGain();
    const delay = ctx.createDelay(0.6);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    const lowBoom = ctx.createOscillator();
    const boomGain = ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = job.owner === "ai" ? 1.04 : job.owner === "common" ? 1.08 : 1.12;
    source.detune.value = job.owner === "ai" ? -320 : job.owner === "common" ? -60 : 45;

    highpass.type = "highpass";
    highpass.frequency.value = 78;
    presence.type = "peaking";
    presence.frequency.value = job.owner === "ai" ? 1750 : 2300;
    presence.Q.value = 0.9;
    presence.gain.value = job.owner === "ai" ? 3.4 : 2.4;
    compressor.threshold.value = -28;
    compressor.knee.value = 18;
    compressor.ratio.value = 5.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    shaper.curve = distortionCurve(job.owner === "ai" ? 42 : 24);
    shaper.oversample = "4x";
    dry.gain.value = job.owner === "ai" ? 0.9 : 0.82;
    delay.delayTime.value = job.owner === "ai" ? 0.16 : 0.12;
    feedback.gain.value = job.priority >= 8 ? 0.28 : 0.18;
    wet.gain.value = job.priority >= 8 ? 0.2 : 0.12;

    source.connect(highpass);
    highpass.connect(presence);
    presence.connect(compressor);
    compressor.connect(shaper);
    shaper.connect(dry);
    dry.connect(audio.voiceMaster);
    shaper.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(audio.voiceMaster);

    if (job.priority >= 6) {
      lowBoom.type = "sine";
      lowBoom.frequency.value = job.owner === "ai" ? 48 : 64;
      boomGain.gain.setValueAtTime(0.001, ctx.currentTime);
      boomGain.gain.exponentialRampToValueAtTime(job.priority >= 8 ? 0.11 : 0.07, ctx.currentTime + 0.025);
      boomGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      lowBoom.connect(boomGain);
      boomGain.connect(audio.voiceMaster);
      lowBoom.start();
      lowBoom.stop(ctx.currentTime + 0.46);
    }

    activeVoiceAudio = [{ stop: () => source.stop() }, { stop: () => lowBoom.stop() }];
    finishActiveVoice = finish;
    source.onended = () => {
      window.setTimeout(finish, job.priority >= 8 ? 220 : 120);
    };
    source.start();
    const maxMs = job.priority >= 8 ? 2100 : job.priority >= 5 ? 1700 : 1150;
    window.setTimeout(() => {
      if (!finished && token === voiceToken) {
        try {
          source.stop();
        } catch (error) {
          finish();
        }
      }
    }, maxMs);
    window.setTimeout(() => {
      if (token === voiceToken) finish();
    }, Math.min(maxMs + 260, Math.max(900, (buffer.duration / source.playbackRate.value) * 1000 + 220)));
  });
}

function distortionCurve(amount = 20) {
  const samples = 256;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function speak(text, force = false, owner = "player") {
  if (!text) return false;
  if (!state.voiceOn && !force) return false;
  if (!state.voiceReady && !force) return false;
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.voice = preferredVoice(owner);
  utterance.rate = owner === "ai" ? 0.96 : 1.02;
  utterance.pitch = owner === "ai" ? 0.88 : 1.05;
  utterance.volume = 0.96;
  window.speechSynthesis.speak(utterance);
  return true;
}

function cue(text) {
  announce(text);
  speak(text);
}

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
  stopVoiceAudio();
  closeTrapChoicePrompt();
  applySetupChoices();
  Object.assign(state.player, createDuelist("player"));
  Object.assign(state.ai, createDuelist("ai"));
  state.player.deck = buildDeck(state.deckPreset);
  state.ai.deck = buildDeck(aiProfiles[state.aiStyle]?.deckPreset || "balanced");
  state.turn = "player";
  state.phase = "draw";
  state.selected = null;
  state.pendingTarget = null;
  state.focusedCard = null;
  clearBattlePreview();
  state.summonedThisTurn = false;
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
  state.statsRecorded = false;
  state.log = [];
  state.timeline = [];
  state.timelineStep = 0;
  state.gameEvents = [];
  els.modal.classList.remove("show");
  els.modalRestart.textContent = "再来一局";
  if (state.scenarioId === "normal") {
    for (let i = 0; i < 5; i += 1) {
      drawCard(state.player, false);
      drawCard(state.ai, false);
    }
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
  stopVoiceAudio();
  closeTrapChoicePrompt();
  applySetupChoices();
  syncSetupControls();
  Object.assign(state.player, createDuelist("player"));
  Object.assign(state.ai, createDuelist("ai"));
  state.turn = "player";
  state.phase = "ready";
  state.selected = null;
  state.pendingTarget = null;
  state.focusedCard = null;
  clearBattlePreview();
  state.summonedThisTurn = false;
  state.autoEnding = false;
  cancelAutoEnd();
  setActionWindow("setup");
  state.pendingOpeningDraw = false;
  state.started = false;
  state.paused = false;
  state.aiRunning = false;
  state.resumeResolvers = [];
  state.gameOver = false;
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

function drawCard(duelist, announce = true) {
  if (duelist.deck.length === 0) {
    damage(duelist, 500);
    playSound("damage");
    addLog(`${duelist.owner === "player" ? "你" : "AI"} 无卡可抽，受到 500 点伤害。`);
    speak(`${duelist.owner === "player" ? "你" : "对手"}无卡可抽，受到伤害。`);
    checkGameOver();
    return null;
  }
  const card = duelist.deck.shift();
  duelist.hand.push(card);
  if (announce) {
    playSound("draw");
    playDrawEffect(duelist.owner, card);
    addLog(`${duelist.owner === "player" ? "你" : "AI"} 抽了 1 张卡。`);
    playVoice(duelist.owner, "draw", duelist.owner === "player" ? "抽卡。" : "对手抽卡。");
  }
  return card;
}

function drawCards(duelist, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    const card = drawCard(duelist, false);
    if (card) {
      drawn.push(card);
      window.setTimeout(() => {
        playSound("draw");
        playDrawEffect(duelist.owner, card);
      }, i * 760);
    }
  }
  if (drawn.length > 0) {
    addLog(`${duelist.owner === "player" ? "你" : "AI"} 抽了 ${drawn.length} 张卡。`);
    playVoice(duelist.owner, "draw", duelist.owner === "player" ? `抽 ${drawn.length} 张卡。` : `对手抽 ${drawn.length} 张卡。`);
  }
  return drawn;
}

function gainShield(duelist, amount, reason = "护盾") {
  duelist.shield = Math.min(2400, (duelist.shield || 0) + amount);
  playSound("guard");
  playEpicAction("护盾", "guard");
  playGuardShield(panelElement(duelist.owner));
  playVoice(duelist.owner, "shield", "护盾展开。");
  addLog(`${duelist.owner === "player" ? "你" : "AI"} 获得 ${amount} 点护盾（${reason}）。`);
}

function buffCard(card, amount, reason = "强化") {
  if (!card) return;
  card.tempAtk = (card.tempAtk || 0) + amount;
  addLog(`${card.name} 因 ${reason} 攻击力提升 ${amount}。`);
}

function wearMonster(card, amount, reason = "承受攻击") {
  if (!card || amount <= 0) return;
  card.battleWear = (card.battleWear || 0) + amount;
  card.tempAtk = (card.tempAtk || 0) - amount;
  card.tempDef = (card.tempDef || 0) - amount;
  playEpicAction("损耗", "guard", 900);
  addLog(`${card.name} 承受冲击产生 ${amount} 点战斗损耗，ATK/DEF 下降。`);
  speak(`${card.name} 承受冲击，战斗力下降。`);
}

function buffAllMonsters(duelist, amount, reason = "组合技") {
  fieldCards(duelist).forEach((card) => buffCard(card, amount, reason));
}

function duelistLabel(duelist) {
  return duelist.owner === "player" ? "你" : "AI";
}

function resolveCharacterCombo(owner, rival) {
  if (owner.comboThisTurn) return;
  owner.comboThisTurn = true;
  const profile = characterProfiles[owner.owner];
  if (profile.kind === "draw") {
    const count = profile.count || 1;
    drawCards(owner, count);
    addLog(`${profile.skill}发动：首次组合技让${duelistLabel(owner)}额外抽 ${count} 张卡。`);
    speak(`角色技能发动，${profile.skill}，额外抽卡。`, false, owner.owner);
  } else if (profile.kind === "buff") {
    const target = strongestMonster(owner);
    const amount = profile.amount || 300;
    if (target) {
      buffCard(target, amount, profile.skill);
      playSound("spell-buff500");
      playEpicAction("号令", "attack");
      addLog(`${profile.skill}发动：${target.name} 攻击力提升 ${amount}。`);
      speak(`角色技能发动，${profile.skill}，攻击力提升。`, false, owner.owner);
    }
  } else if (profile.kind === "shield") {
    const amount = profile.amount || 450;
    gainShield(owner, amount, profile.skill);
    addLog(`${profile.skill}发动：${duelistLabel(owner)}获得 ${amount} 护盾。`);
    speak(`角色技能发动，${profile.skill}，护盾展开。`, false, owner.owner);
  } else {
    const amount = profile.amount || 150;
    damage(rival, amount);
    animateAvatar(rival.owner, "hit");
    playEpicAction("压迫", "attack");
    addLog(`${profile.skill}发动：首次组合技造成 ${amount} 点伤害。`);
    speak(`角色技能发动，${profile.skill}。`, false, owner.owner);
  }
}

function triggerCombo(owner, rival, title, text) {
  playCenterCardEffect({ type: "spell", name: title, icon: "连", text }, text);
  playSound("spell-elementEcho");
  playEpicAction("连携", "draw");
  const voiced = playVoice(owner.owner, "combo", `${duelistLabel(owner)}触发组合技，${title}。`);
  addLog(`${duelistLabel(owner)}触发组合技：${title}。${text}`);
  if (!voiced) speak(`${duelistLabel(owner)}触发组合技，${title}。`, false, owner.owner);
  resolveCharacterCombo(owner, rival);
}

function resolveElementCombos(owner, rival, source = "") {
  availableElementCombos(owner, source).forEach((combo) => {
    markElementComboResolved(owner, combo);
    triggerCombo(owner, rival, combo.title, combo.text);
    if (combo.flag === "fireWind") {
      damage(rival, 300);
      buffAllMonsters(owner, 100, combo.title);
      animateAvatar(rival.owner, "hit");
      shakeScreen();
    }
    if (combo.flag === "lightShadow") {
      gainShield(owner, 600, combo.title);
      drawCards(owner, 1);
    }
    if (combo.flag === "triad") {
      buffAllMonsters(owner, 200, combo.title);
    }
    if (combo.flag === "shadowAmbush") {
      gainShield(owner, 300, combo.title);
    }
  });
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
  return canPlayerAct() && state.phase === PHASES.battle && state.actionWindow === ACTION_WINDOWS.battle;
}

function setActionWindow(windowName, options = {}) {
  Object.assign(state, openActionWindowPatch(normalizeActionWindow(windowName), {
    now: options.now ?? Date.now(),
    reason: options.reason || ""
  }));
}

function cancelAutoEnd() {
  if (state.autoEndTimer) {
    window.clearTimeout(state.autoEndTimer);
    state.autoEndTimer = null;
  }
  if (state.autoEnding) {
    state.autoEnding = false;
    if (state.actionWindow === "autoEnd") {
      setActionWindow("main", { reason: "cancel auto end" });
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
    summonedThisTurn: state.summonedThisTurn,
    canSpell: (card, index) => card.type === "spell" && validateSpell(state.player, state.ai, card, index).ok
  });
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

function validateSpellTarget(pending, ownerName, index) {
  if (!pending) return { ok: false, reason: "当前没有需要选择目标的效果。" };
  const duelist = ownerName === "player" ? state.player : state.ai;
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

function targetInfoFromPending(ownerName, index) {
  const validation = validateSpellTarget(state.pendingTarget, ownerName, index);
  if (!validation.ok) return validation;
  return {
    ok: true,
    owner: ownerName,
    index,
    card: validation.target
  };
}

function resolvePendingSpellTarget(ownerName, index) {
  if (!state.pendingTarget) return false;
  notePlayerIntent();
  const targetInfo = targetInfoFromPending(ownerName, index);
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
  return resolvePendingSpellTarget(targets[0].owner, targets[0].index);
}

function canChangeAnyPlayerMode() {
  return currentPlayerActions().mode;
}

function hasPlayerMainAction() {
  return currentPlayerActions().hasAny;
}

function resolvePlayerActionWindow(reason = "操作完成") {
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
  return canDuelistAttack(state.player);
}

function grantAttackReset(duelist, target = null, amount = 1) {
  if (duelist.attacksSkipped) {
    addLog(`${duelistLabel(duelist)}已经跳过本回合攻击，不能获得攻击重置。`);
    return false;
  }
  if (target && target.used) {
    target.used = false;
    addLog(`${target.name} 重新进入可攻击状态。`);
    return true;
  }
  duelist.attackResets = (duelist.attackResets || 0) + amount;
  addLog(`${duelistLabel(duelist)}获得 ${amount} 次攻击重置，下一次攻击后可再次行动。`);
  return true;
}

function consumeQueuedAttackReset(duelist, attacker, attackerIndex) {
  if (!attacker || !duelist.field[attackerIndex] || (duelist.attackResets || 0) <= 0) return false;
  duelist.attackResets -= 1;
  attacker.used = false;
  playEpicAction("再攻", "attack");
  addLog(`${attacker.name} 消耗攻击重置，再次进入可攻击状态。`);
  speak(`${attacker.name} 攻击重置，可以再次攻击。`, false, duelist.owner);
  return true;
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
  const validation = validateAttackTarget(state.player, state.ai, attacker, targetIndex);
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
  return canPlayerAct() &&
    [PHASES.main, PHASES.battle].includes(state.phase) &&
    [ACTION_WINDOWS.main, ACTION_WINDOWS.battle].includes(state.actionWindow);
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
  const targets = legalAttackTargets(state.player, state.ai, attacker);
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
  const usingExtraSummon = state.summonedThisTurn && state.player.extraSummon > 0;
  if (state.summonedThisTurn && !usingExtraSummon) {
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
  if (usingExtraSummon) {
    state.player.extraSummon -= 1;
    addLog("额外召唤机会已使用。");
  } else {
    state.summonedThisTurn = true;
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
  if (existing && (!canPlayerAct() || !state.selected || state.selected.zone !== "hand")) {
    state.selected = null;
    clearBattlePreview();
    showDetail(existing);
    render();
    if (canPlayerAct()) resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (state.pendingTarget) {
    cue(targetPromptFor(state.pendingTarget.mode, state.pendingTarget.cardName, state.pendingTarget.effect));
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
  const attacker = state.player.field[state.selected.index];
  if (!attacker || attacker.used) {
    announce("这只怪兽本回合不能再攻击");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (state.player.attacksSkipped) {
    cue("你已经跳过本回合攻击。");
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
  const attacker = state.player.field[state.selected.index];
  if (!attacker || attacker.used) {
    announce("这只怪兽本回合不能再攻击。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (state.player.attacksSkipped) {
    cue("你已经跳过本回合攻击。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  if (attacker.mode === "defense") {
    cue("守备表示的怪兽不能攻击。");
    resumePlayerIdleCountdownAfterPassiveIntent();
    return;
  }
  await queuePendingAttack(-1);
}

async function summonMonster(owner, rival, handIndex, fieldIndex) {
  const card = owner.hand[handIndex];
  if (!card) return false;
  try {
    dispatchSummonMonsterFromUiState(state, owner.owner, handIndex, fieldIndex);
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
  await triggerTrap(rival, owner, "summon", { summoned: card });
  if (state.gameOver) return true;
  resolveSummonEffect(card, owner, rival);
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

function resolveSummonEffect(card, owner, rival) {
  if (card.onSummon === "burn200") {
    damage(rival, 200);
    playSound("spell-burn500");
    playArrow(fieldElement(owner.owner, owner.field.indexOf(card)) || panelElement(owner.owner), panelElement(rival.owner), "spell", "灼烧");
    addLog(`${card.name} 的火焰灼烧造成 200 点伤害。`);
    speak(`${card.name} 的效果发动，造成二百点伤害。`);
  }
  if (card.onSummon === "draw1") {
    drawCards(owner, 1);
    addLog(`${card.name} 让${owner.owner === "player" ? "你" : "AI"}额外抽卡。`);
    speak(`${card.name} 的效果发动，额外抽一张卡。`);
  }
  if (card.onSummon === "heal300") {
    heal(owner, 300);
    playSound("spell-heal700");
    addLog(`${card.name} 回复 300 点生命值。`);
    speak(`${card.name} 的效果发动，回复三百点生命值。`);
  }
  if (card.onSummon === "fireBuff") {
    const fireCount = fieldCards(owner).filter((item) => item.element === "fire").length;
    if (fireCount >= 2) {
      buffCard(strongestMonster(owner), 300, card.name);
      playEpicAction("指挥", "attack");
      playSound("spell-buff500");
      speak(`${card.name} 指挥火焰阵线，攻击力提升。`);
    }
  }
  if (card.onSummon === "shield400") {
    gainShield(owner, 400, card.name);
    speak(`${card.name} 展开护盾。`);
  }
  if (card.onSummon === "shadowBurn") {
    const shadowCount = fieldCards(owner).filter((item) => item.element === "shadow").length;
    if (shadowCount >= 2) {
      damage(rival, 300);
      playSound("spell-burn500");
      playEpicAction("暗蚀", "attack");
      animateAvatar(rival.owner, "hit");
      addLog(`${card.name} 引动暗影连锁，对手受到 300 点伤害。`);
      speak(`${card.name} 的暗影效果发动，造成三百点伤害。`);
    }
  }
  resolveElementCombos(owner, rival, "summon");
}

const spellEffects = {
  burn500: {
    ...spellDefinitions.burn500,
    apply: ({ rival, card }) => {
      const dealt = damage(rival, 500);
      animateAvatar(rival.owner, "hit");
      addLog(`${card.name} 对${duelistLabel(rival)}造成 ${dealt} 点伤害。`);
    }
  },
  heal700: {
    ...spellDefinitions.heal700,
    apply: ({ owner, card }) => {
      const before = owner.lp;
      heal(owner, 700);
      addLog(`${card.name} 为${duelistLabel(owner)}回复 ${owner.lp - before} 点生命值。`);
    }
  },
  draw2: {
    ...spellDefinitions.draw2,
    apply: ({ owner }) => drawCards(owner, 2)
  },
  buff500: {
    ...spellDefinitions.buff500,
    apply: ({ owner, card, targetInfo }) => {
      const target = targetInfo?.card || strongestMonster(owner);
      if (!target) return {};
      buffCard(target, 500, card.name);
      return { effectTarget: target };
    }
  },
  shield800: {
    ...spellDefinitions.shield800,
    apply: ({ owner, card }) => gainShield(owner, 800, card.name)
  },
  extraSummon: {
    ...spellDefinitions.extraSummon,
    apply: ({ owner }) => {
      owner.extraSummon += 1;
      addLog(`${duelistLabel(owner)}本回合获得 1 次额外通常召唤。`);
    }
  },
  elementEcho: {
    ...spellDefinitions.elementEcho,
    apply: ({ owner, card }) => {
      buffAllMonsters(owner, 200, card.name);
      drawCards(owner, 1);
      addLog(`${card.name} 让多属性阵线产生共鸣。`);
    }
  },
  rallyAttack: {
    ...spellDefinitions.rallyAttack,
    apply: ({ owner, card, targetInfo }) => {
      const target = targetInfo?.card || strongestMonster(owner);
      if (!target) return {};
      buffCard(target, 300, card.name);
      const used = owner.field.find((item) => item && item.used);
      grantAttackReset(owner, used || null, 1);
      return { effectTarget: target };
    }
  },
  pierceLine: {
    ...spellDefinitions.pierceLine,
    apply: ({ rival, card, targetInfo }) => {
      const target = targetInfo?.card || strongestMonster(rival);
      if (!target) return {};
      wearMonster(target, 400, card.name);
      damage(rival, 200);
      animateAvatar(rival.owner, "hit");
      addLog(`${card.name} 削弱了 ${target.name}，并造成 200 点伤害。`);
      return { effectTarget: target, targetOwner: rival.owner };
    }
  },
  graveReturn: {
    ...spellDefinitions.graveReturn,
    apply: ({ owner, card }) => {
      const index = owner.grave.findIndex((item) => item.uid !== card.uid);
      if (index < 0) {
        addLog("但墓地没有其他卡可以回收。");
        return {};
      }
      const recovered = owner.grave.splice(index, 1)[0];
      owner.deck.unshift(recovered);
      addLog(`${recovered.name} 回到卡组顶。`);
      drawCards(owner, 1);
      return {};
    }
  },
  battleTrance: {
    ...spellDefinitions.battleTrance,
    apply: ({ owner, card, targetInfo }) => {
      const target = targetInfo?.card || strongestMonster(owner);
      if (!target) return {};
      buffCard(target, 200, card.name);
      grantAttackReset(owner, null, 1);
      return { effectTarget: target };
    }
  },
  directStrike: {
    ...spellDefinitions.directStrike,
    apply: ({ owner, card }) => {
      owner.directAttacks += 1;
      const target = owner.field.find((item) => item && !item.used && item.mode !== "defense") || strongestMonster(owner);
      addLog(`${duelistLabel(owner)}获得 1 次直接攻击许可。`);
      playEpicAction("直击许可", "attack");
      return { effectTarget: target };
    }
  },
  fireWindCombo: {
    ...spellDefinitions.fireWindCombo,
    apply: ({ owner, rival, card }) => {
      const dealt = damage(rival, 400);
      buffAllMonsters(owner, 200, card.name);
      animateAvatar(rival.owner, "hit");
      playEpicAction("炎岚", "attack");
      addLog(`${card.name} 造成 ${dealt} 点伤害，并强化我方全体怪兽。`);
      return { targetOwner: rival.owner };
    }
  },
  lightShadowCombo: {
    ...spellDefinitions.lightShadowCombo,
    apply: ({ owner, card }) => {
      gainShield(owner, 600, card.name);
      drawCards(owner, 1);
      playEpicAction("星界", "guard");
      addLog(`${card.name} 展开光暗星界，获得护盾并抽 1 张卡。`);
    }
  }
};

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
  const validation = validateSpell(owner, rival, selectedCard, handIndex);
  if (!validation.ok) {
    if (owner.owner === "player") cue(validation.reason);
    if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
    return false;
  }
  if (spellNeedsManualTarget(owner, selectedCard) && !targetInfo) {
    beginSpellTargetSelection(handIndex, selectedCard);
    return false;
  }
  const card = selectedCard;
  let engineEvents = null;
  let result = {};
  if (canDispatchSpellFromUiState(card)) {
    try {
      engineEvents = dispatchActivateSpellFromUiState(state, owner.owner, rival.owner, handIndex, targetInfo);
    } catch (error) {
      if (owner.owner === "player") cue(error.message || "魔法卡发动失败。");
      console.error(error);
      if (owner.owner === "player") resumePlayerIdleCountdownAfterPassiveIntent();
      return false;
    }
  } else {
    owner.hand.splice(handIndex, 1);
    owner.grave.push(card);
  }
  playSound(`spell-${card.effect}`);
  animateAvatar(owner.owner, "cast");
  playCenterCardEffect(card, spellCaption(card));
  playEpicAction("魔法", "draw");
  addLog(`${owner.owner === "player" ? "你" : "AI"} 发动魔法卡 ${card.name}。`);
  speak(`${owner.owner === "player" ? "你发动" : "对手发动"}魔法卡，${card.name}。`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "spell", card), false, "spell");
  if (engineEvents) {
    result = resolveEngineSpellFeedback(owner, rival, card, engineEvents, targetInfo);
  } else {
    const effect = spellEffects[card.effect];
    result = effect?.apply?.({ owner, rival, card, handIndex, targetInfo }) || {};
  }
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
  events.forEach((event) => {
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
      addLog(`${found.card.name} 因 ${card.name} ${statChangeText(event)}。`);
    }
  });
  return result;
}

function validateSpell(owner, rival, card, handIndex) {
  if (!card || card.type !== "spell") return { ok: false, reason: "请选择魔法卡。" };
  const effect = spellEffects[card.effect];
  if (!effect) return { ok: false, reason: "这个魔法效果还没有实现。" };
  return validateSpellCondition(card.effect, { owner, rival, card, handIndex });
}

function spellCaption(card) {
  if (spellEffects[card.effect]?.caption) return spellEffects[card.effect].caption;
  return card.text || "魔法发动";
}

async function triggerTrap(owner, rival, eventName, context) {
  const result = { cancelled: false, shielded: false, consumesAttack: false, activated: 0 };
  if (state.gameOver) return result;
  const candidates = owner.traps
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => trapCanResolve(card, eventName, { owner, context }));
  if (candidates.length === 0) return result;
  let trapIndex = candidates[0].index;
  if (owner.owner === "player") {
    const choice = await promptTrapChoice(candidates, eventName, { owner, rival, context });
    if (choice.trapIndex < 0) {
      addLog(choice.skippedName ? `你没有发动 ${choice.skippedName}。` : "你没有发动陷阱。");
      return result;
    }
    trapIndex = choice.trapIndex;
  }
  const outcome = resolveTrapCard(owner, rival, eventName, context, trapIndex, 1);
  result.activated = 1;
  result.cancelled = Boolean(outcome.cancelled);
  result.shielded = Boolean(outcome.shielded);
  result.consumesAttack = Boolean(outcome.consumesAttack);
  checkGameOver();
  return result;
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

function resolveTrapCard(owner, rival, eventName, context, trapIndex, chainIndex = 1) {
  const trap = owner.traps[trapIndex];
  if (!trap) return { cancelled: false, shielded: false };
  owner.traps[trapIndex] = null;
  owner.grave.push(trap);
  const chainLabel = chainIndex > 1 ? `连锁 ${chainIndex}` : "陷阱";
  playSound(`trap-${trap.trigger}`);
  animateAvatar(owner.owner, "cast");
  playCenterCardEffect(trap, chainIndex > 1 ? `陷阱连锁 ${chainIndex}` : "陷阱连锁发动");
  playEpicAction(chainLabel, "guard");
  addLog(`${chainLabel}：${owner.owner === "player" ? "你的" : "AI 的"}陷阱卡 ${trap.name} 触发。`);
  speak(`陷阱发动，${trap.name}。`);
  playDuelistLine(owner.owner, lineFor(owner.owner, "trap", trap), false, "trap");
  const trapSource = trapElement(owner.owner, trapIndex) || panelElement(owner.owner);

  if (trap.trigger === "attackDestroy") {
    const attacker = rival.field[context.attackerIndex];
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (attacker) {
      playMonsterBurst(attackerEl);
      shakeScreen();
      playEpicAction("反制", "guard");
      rival.field[context.attackerIndex] = null;
      rival.grave.push(attacker);
      addLog(`${trap.name} 破坏了 ${attacker.name}。`);
    }
    return { cancelled: true, consumesAttack: trapConsumesAttack(trap.trigger) };
  }

  if (trap.trigger === "counterBoost") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const target = weakestMonster(owner);
    const targetIndex = owner.field.indexOf(target);
    const targetEl = fieldElement(owner.owner, targetIndex) || panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (target) {
      buffCard(target, 400, trap.name);
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
    gainShield(owner, 400, trap.name);
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
    const attacker = rival.field[context.attackerIndex];
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    if (attacker) {
      wearMonster(attacker, 500, trap.name);
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
    drawCards(owner, 1);
    addLog(`${trap.name} 让直接攻击伤害变为 0。`);
    return { cancelled: true, shielded: true };
  }

  if (trap.trigger === "directRebound") {
    const attackerEl = fieldElement(rival.owner, context.attackerIndex) || panelElement(rival.owner);
    const shieldTarget = panelElement(owner.owner);
    playArrow(trapSource, attackerEl, "trap", trap.name);
    playSound("guard");
    playGuardShield(shieldTarget);
    damage(rival, 500);
    animateAvatar(rival.owner, "hit");
    shakeScreen();
    playEpicAction("反弹", "guard");
    addLog(`${trap.name} 让直接攻击伤害变为 0，并反弹 500 点伤害。`);
    speak(`${trap.name} 反弹了直接攻击。`);
    return { cancelled: true, shielded: true };
  }

  if (trap.trigger === "summonBurn") {
    playArrow(trapSource, panelElement(rival.owner), "trap", trap.name);
    damage(rival, 400);
    animateAvatar(rival.owner, "hit");
    shakeScreen();
    playEpicAction("灼烧", "attack");
    addLog(`${trap.name} 对召唤者造成 400 点伤害。`);
  }

  return { cancelled: false };
}

async function attack(owner, rival, attackerIndex, targetIndex) {
  state.ruleCheckIssue = null;
  const attacker = owner.field[attackerIndex];
  if (!attacker || attacker.used) return;
  if (owner.attacksSkipped) {
    const reason = `${duelistLabel(owner)}已经跳过本回合攻击。`;
    if (owner.owner === "player") cue("你已经跳过本回合攻击。");
    addLog(reason);
    return false;
  }
  if (attacker.mode === "defense") {
    cue("守备表示的怪兽不能攻击。");
    return;
  }
  const targetValidation = validateAttackTarget(owner, rival, attacker, targetIndex);
  if (!targetValidation.ok) {
    if (owner.owner === "player") {
      cue(targetValidation.reason);
    }
    addLog(`${duelistLabel(owner)}的攻击被规则拦截：${targetValidation.reason}`);
    return false;
  }
  const impactBefore = attackImpactSnapshot(owner, rival);
  const attackContext = { attackerIndex, targetIndex };
  const trapResult = await triggerTrap(rival, owner, "attack", attackContext);
  if (trapResult.cancelled) {
    if (trapResult.consumesAttack && owner.field[attackerIndex] === attacker) {
      attacker.used = true;
    }
    checkGameOver();
    return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的攻击`);
  }
  const resolvedTargetIndex = attackContext.targetIndex;
  const target = rival.field[resolvedTargetIndex];
  attacker.used = true;
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

  if (!target) {
    const shield = await triggerTrap(rival, owner, "direct", { attackerIndex, targetIndex: resolvedTargetIndex });
    if (shield.cancelled) {
      consumeQueuedAttackReset(owner, attacker, attackerIndex);
      checkGameOver();
      return assertAttackImpact(owner, rival, impactBefore, `${attacker.name} 的直接攻击`);
    }
    if (owner.directAttacks > 0 && !attacker.canDirectAttack) {
      owner.directAttacks -= 1;
      addLog(`${duelistLabel(owner)}消耗 1 次直接攻击许可。`);
    }
    playSound("attack-impact");
    playImpactExplosion(toEl);
    const dealt = damage(rival, totalAtk(attacker));
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
    playSound("attack-impact");
    playImpactExplosion(toEl);
    const outcome = describeBattleOutcome(attacker, target, owner, rival);
    if (outcome.diff > 0) {
      let dealt = 0;
      if (target.mode !== "defense") {
        dealt = damage(rival, outcome.rawDamage);
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
      rival.field[resolvedTargetIndex] = null;
      rival.grave.push(target);
      playSound("attack-break");
      shakeScreen();
      playEpicAction(target.mode === "defense" ? "破防" : "击破", "attack");
      playArrow(fromEl, toEl, "attack", "攻击");
      addLog(battleLogText(attacker, target, outcome, dealt));
      speak(`${attacker.name} 击破目标。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "break"), false, "break");
    } else if (outcome.diff < 0) {
      const dealt = damage(owner, outcome.rawDamage);
      const wear = battleWearAmount(outcome.diff);
      wearMonster(target, wear, "抵挡攻击");
      playSound("damage");
      animateAvatar(owner.owner, "hit");
      playMonsterMotion(owner.owner, attackerIndex, "hit");
      playMonsterBurst(fromEl);
      shakeScreen();
      playEpicAction("反击", "attack");
      owner.field[attackerIndex] = null;
      owner.grave.push(attacker);
      playArrow(toEl, fromEl, "attack", "反击");
      addLog(battleLogText(attacker, target, outcome, dealt));
      speak(`${attacker.name} 攻击失败，被反击破坏。`);
      playDuelistLine(owner.owner, lineFor(owner.owner, "hit"), false, "hit");
    } else {
      playMonsterBurst(fromEl);
      playMonsterBurst(toEl);
      owner.field[attackerIndex] = null;
      rival.field[resolvedTargetIndex] = null;
      owner.grave.push(attacker);
      rival.grave.push(target);
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

  consumeQueuedAttackReset(owner, attacker, attackerIndex);

  if (owner.field[attackerIndex] && attacker.afterAttack === "grow200") {
    attacker.tempAtk += 200;
    addLog(`${attacker.name} 吞噬影子，攻击力提升 200。`);
  }
  if (owner.field[attackerIndex] && attacker.afterAttack === "windDraw" && fieldElements(owner).has("wind")) {
    drawCards(owner, 1);
    playEpicAction("追风", "draw");
    addLog(`${attacker.name} 追风突袭，攻击后抽 1 张卡。`);
    speak(`${attacker.name} 的追风效果发动，抽一张卡。`);
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

function damage(duelist, amount) {
  if (duelist.shield > 0 && amount > 0) {
    const blocked = Math.min(duelist.shield, amount);
    duelist.shield -= blocked;
    amount -= blocked;
    playSound("guard");
    playGuardShield(panelElement(duelist.owner));
    addLog(`${duelist.owner === "player" ? "你的" : "AI 的"}护盾吸收了 ${blocked} 点伤害。`);
  }
  const dealt = Math.max(0, amount);
  if (dealt > 0) {
    duelist.lp = Math.max(0, duelist.lp - dealt);
    playSound("damage");
    playLifeDelta(duelist.owner, -dealt);
  }
  return dealt;
}

function heal(duelist, amount) {
  const before = duelist.lp;
  duelist.lp = Math.min(MAX_LP, duelist.lp + amount);
  const healed = duelist.lp - before;
  if (healed > 0) {
    playSound("spell-heal700");
    playLifeDelta(duelist.owner, healed);
  }
  return healed;
}

function promptTrapChoice(candidates, eventName, details = {}) {
  const previousWindow = {
    actionWindow: state.actionWindow,
    timing: state.timing,
    actionWindowId: state.actionWindowId,
    actionWindowReason: state.actionWindowReason,
    actionDeadline: state.actionDeadline
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
      Object.assign(state, previousWindow);
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

function endPlayerTurn() {
  if (!canPlayerAct()) return;
  cancelAutoEnd();
  state.selected = null;
  state.pendingTarget = null;
  clearBattlePreview();
  Object.assign(state, aiWindowPatch());
  clearPlayerIdleTimers();
  beginTurn("ai");
  render();
  window.setTimeout(runAiTurn, 950);
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
  const skipped = skipAvailableAttacks(state.player.field);
  if (skipped <= 0) {
    cue("本回合没有可跳过的攻击。");
    resetPlayerIdleCountdown();
    return;
  }
  state.player.attackResets = 0;
  state.player.directAttacks = 0;
  state.player.attacksSkipped = true;
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
  state.player.attackResets = 0;
  state.player.directAttacks = 0;
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
    stopVoiceAudio();
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
  const actions = currentPlayerActions();
  if (!force && actions.hasAny) {
    setActionWindow(state.phase === PHASES.battle ? ACTION_WINDOWS.battle : ACTION_WINDOWS.main, { reason });
    resetPlayerIdleCountdown();
    return;
  }
  state.autoEnding = true;
  setActionWindow(ACTION_WINDOWS.autoEnd, { reason });
  state.selected = null;
  state.pendingTarget = null;
  clearPlayerIdleTimers();
  cue(`${reason}，回合即将结束。`);
  render();
  state.autoEndTimer = window.setTimeout(() => {
    state.autoEndTimer = null;
    if (state.turn === "player" && state.autoEnding && state.actionWindow === "autoEnd" && !state.gameOver) {
      endPlayerTurn();
    }
  }, AUTO_END_DELAY_MS);
}

function beginTurn(owner) {
  Object.assign(state, turnStartPatch(owner));
  clearBattlePreview();
  cancelAutoEnd();
  clearPlayerIdleTimers();
  const duelist = activeDuelist();
  duelist.field.forEach((card) => {
    if (card) {
      card.used = false;
      card.changedMode = false;
    }
  });
  duelist.comboThisTurn = false;
  duelist.comboFlags = {};
  duelist.extraSummon = 0;
  duelist.attackResets = 0;
  duelist.directAttacks = 0;
  duelist.attacksSkipped = false;
  playSound("turn");
  addLog(`${owner === "player" ? "你的" : "AI 的"}回合开始。`);
  playVoice(owner, "turn", owner === "player" ? "轮到你了。抽卡。" : "对手回合。");
  if (owner === "player") {
    window.setTimeout(() => {
      if (!state.paused) autoPlayerDraw();
    }, 700);
  }
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
  if (card.used || card.changedMode) {
    cue("这只怪兽本回合不能切换表示。");
    return;
  }
  card.mode = card.mode === "attack" ? "defense" : "attack";
  card.changedMode = true;
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
  drawCard(state.player);
  Object.assign(state, drawToMainPatch());
  render("draw-player");
  resetPlayerIdleCountdown();
}

function scheduleOpeningDraw(delay = 700) {
  if (!canPlayerAct() || state.phase !== PHASES.draw) return;
  if (audio.ctx || state.voiceReady) {
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
    drawCard(state.ai);
    state.phase = PHASES.main;
    state.timing = TIMINGS.mainOpen;
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
      state.ai.extraSummon -= 1;
      addLog("AI 使用了额外召唤机会。");
      render();
      await sleep(1850);
    }
    if (state.gameOver) return;
    state.phase = PHASES.battle;
    state.timing = TIMINGS.battleOpen;
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
  let acted = true;
  while (acted && !state.gameOver) {
    acted = false;
    const candidates = state.ai.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card, index }) => card.type === "spell" && validateSpell(state.ai, state.player, card, index).ok)
      .map(({ card, index }) => ({
        card,
        index,
        score: scoreSpellForAi(card.effect, { owner: state.ai, rival: state.player, aiStyle: state.aiStyle })
      }))
      .filter((entry) => entry.score >= 40)
      .sort((a, b) => b.score - a.score);
    const pick = candidates[0];
    if (pick) {
      acted = playSpell(state.ai, state.player, pick.index);
      if (acted) {
        await sleep(1650);
      }
    }
  }
}

function aiMonsterScore(card) {
  if (state.aiStyle === "control") return Math.max(totalDef(card), totalAtk(card) - 150) + (card.onSummon ? 120 : 0);
  if (state.aiStyle === "aggressive") return totalAtk(card) + (card.afterAttack ? 180 : 0) + card.stars * 35;
  return totalAtk(card) + card.stars * 20;
}

async function aiSummon() {
  const empty = state.ai.field.findIndex((slot) => !slot);
  if (empty < 0) return false;
  const monsters = state.ai.hand
    .map((card, index) => ({ card, index }))
    .filter((entry) => entry.card.type === "monster")
    .sort((a, b) => aiMonsterScore(b.card) - aiMonsterScore(a.card));
  if (monsters.length === 0) return false;
  const didSummon = await summonMonster(state.ai, state.player, monsters[0].index, empty);
  if (!didSummon) return false;
  const summoned = state.ai.field[empty];
  if (summoned && (state.aiStyle === "control" || (summoned.def > totalAtk(summoned) + 400 && state.ai.lp < state.player.lp))) {
    summoned.mode = "defense";
    addLog(`${summoned.name} 转为守备表示。`);
    speak(`${summoned.name} 转为守备表示。`);
  }
  return true;
}

function aiSetTraps() {
  const empty = state.ai.traps.findIndex((slot) => !slot);
  if (empty < 0) return false;
  const trapIndex = state.ai.hand.findIndex((card) => card.type === "trap");
  if (trapIndex >= 0) {
    return setTrap(state.ai, trapIndex, empty);
  }
  return false;
}

async function aiAttack() {
  const attackers = state.ai.field
    .map((card, index) => ({ card, index }))
    .filter((entry) => entry.card && !entry.card.used && entry.card.mode !== "defense")
    .sort((a, b) => totalAtk(b.card) - totalAtk(a.card));
  for (const { card, index } of attackers) {
    if (state.gameOver || !state.ai.field[index]) return;
    cue(`对手使用 ${card.name} 发动攻击。`);
    await sleep(900);
    const targets = state.player.field
      .map((target, targetIndex) => ({ target, targetIndex }))
      .filter((entry) => entry.target)
      .sort((a, b) => totalAtk(a.target) - totalAtk(b.target));
    const beatable = targets.find((entry) => totalAtk(card) >= battleValue(entry.target));
    const canUseDirect = canDirectAttack(state.ai, card);
    const blockedByBoard = targets.length > 0 && !targets.some((entry) => totalAtk(card) >= battleValue(entry.target));
    const shouldDirect = canUseDirect && (
      totalAtk(card) >= state.player.lp ||
      blockedByBoard ||
      (state.aiStyle === "aggressive" && targets.length > 0)
    );
    if (state.aiStyle === "control" && targets.length > 0 && !beatable && !shouldDirect) {
      addLog(`AI 保留 ${card.name}，避免无意义攻击。`);
      continue;
    }
    const targetIndex = targets.length === 0 ? -1 : (shouldDirect ? -1 : (beatable ? beatable.targetIndex : targets[0].targetIndex));
    const target = state.player.field[targetIndex];
    if (targetIndex < 0) {
      cue(`对手的 ${card.name} 准备直接攻击你。`);
      playEpicAction("直击预警", "attack", 980);
      playVoice("ai", "direct", "对手准备直接攻击。");
      await sleep(900);
    }
    showBattlePreview(card, target, state.ai, state.player);
    addLog(`AI 攻击预判：${battlePreviewText(card, target)}`);
    render();
    await sleep(1080);
    const resolved = await attack(state.ai, state.player, index, targetIndex);
    render();
    if (resolved === false && state.ruleCheckIssue) break;
    await sleep(2200);
  }
}

function checkGameOver() {
  if (state.gameOver) return;
  if (state.player.lp <= 0 || state.ai.lp <= 0) {
    state.gameOver = true;
    const win = state.ai.lp <= 0 && state.player.lp > 0;
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

function lineFor(owner, action, card, detail = "") {
  const player = owner === "player";
  const name = card?.name || "";
  const lines = {
    summon: player ? `回应我的呼唤，${name}，降临战场！` : `现身吧，${name}，压碎他的防线。`,
    ace: player ? `王牌登场，${name}！撕开战局吧！` : `这就是终结战局的王牌，${name}。`,
    spell: player ? `魔法发动，${name}！星光听我号令！` : `发动魔法卡，${name}。局势已经改变了。`,
    trap: player ? `连锁发动，${name}！就是现在！` : `陷阱已经等你很久了，${name}。`,
    attack: player ? `${name}，全力攻击！` : `${name}，粉碎目标。`,
    hit: player ? "这点冲击还挡不住我。" : "哼，还差得远。",
    break: player ? "击破目标，继续压制！" : "目标破坏，攻势继续。",
    direct: player ? "直接攻击，贯穿生命值！" : "直接攻击，生命值下降。",
    clash: "双方怪兽同归于尽。"
  };
  return detail || lines[action] || name || "效果发动。";
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
  state.actionDeadline = 0;
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
  const startedAt = Date.now();
  const totalMs = seconds * 1000;
  if (!state.actionWindowId) {
    state.actionWindowId = `${state.actionWindow}:${startedAt}`;
  }
  const windowId = state.actionWindowId;
  state.actionDeadline = startedAt + totalMs;
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
    resolvePendingSpellTarget(targets[0].owner, targets[0].index);
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
  cards[0].querySelector("span").textContent = `ATK ${totalAtk(attacker)}`;
  cards[1].querySelector("strong").textContent = target ? target.name : duelistName(rival);
  cards[1].querySelector("span").textContent = target ? `${target.mode === "defense" ? "DEF" : "ATK"} ${battleValue(target)}` : "DIRECT HIT";
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
  left.querySelector("span").textContent = `ATK ${totalAtk(attacker)}`;

  const versus = document.createElement("div");
  versus.className = "cutin-versus";
  versus.textContent = "VS";

  const right = document.createElement("div");
  right.className = "cutin-card";
  right.innerHTML = `<em>${duelistName(rival)} 目标</em><strong></strong><span></span>`;
  right.querySelector("strong").textContent = target ? target.name : "直接攻击";
  right.querySelector("span").textContent = target ? `${target.mode === "defense" ? "DEF" : "ATK"} ${battleValue(target)}` : "LP DAMAGE";

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

function duelistName(owner) {
  return owner === "player" ? "你" : "AI";
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
  els.soundBtn.textContent = state.soundOn ? "音效 ON" : "音效 OFF";
  els.soundBtn.classList.toggle("sound-off", !state.soundOn);
  els.voiceBtn.textContent = state.voiceOn ? "语音 ON" : "语音 OFF";
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
  const canChooseAttack = canPlayerAct() &&
    [PHASES.main, PHASES.battle].includes(state.phase) &&
    [ACTION_WINDOWS.main, ACTION_WINDOWS.battle].includes(state.actionWindow);
  if (!canChooseAttack || state.selected?.zone !== "playerField") return false;
  if (state.player.attacksSkipped) return false;
  const attacker = state.player.field[state.selected.index];
  if (!attacker || attacker.used || attacker.mode === "defense") return false;
  return validateAttackTarget(state.player, state.ai, attacker, index).ok;
}

function canPlayerTargetAiPanel() {
  const canChooseAttack = canPlayerAct() &&
    [PHASES.main, PHASES.battle].includes(state.phase) &&
    [ACTION_WINDOWS.main, ACTION_WINDOWS.battle].includes(state.actionWindow);
  if (state.pendingTarget || !canChooseAttack || state.selected?.zone !== "playerField") return false;
  if (state.player.attacksSkipped) return false;
  const attacker = state.player.field[state.selected.index];
  if (!attacker || attacker.used || attacker.mode === "defense") return false;
  return validateAttackTarget(state.player, state.ai, attacker, -1).ok;
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
    slot.classList.toggle("trap-response", trapChoiceReady);
    slot.classList.toggle("trap-response-selected", trapChoiceSelected);
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
    summonedThisTurn: state.summonedThisTurn,
    extraSummon: state.player.extraSummon,
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
  state.soundOn = !state.soundOn;
  if (state.soundOn) {
    ensureAudio();
    playSound("turn");
  }
  render();
}

function toggleVoice() {
  state.voiceReady = true;
  state.voiceOn = !state.voiceOn;
  if (state.voiceOn) {
    playVoice("player", "start", "语音提示已开启。", true);
  } else {
    stopVoiceAudio();
  }
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

function aceLine(card) {
  if (card.element === "fire") return "熔炎升腾，王牌降临";
  if (card.element === "wind") return "疾风开路，王牌降临";
  if (card.element === "shadow") return "暗影蔓延，王牌降临";
  if (card.element === "light") return "星辉照耀，王牌降临";
  return "星魂觉醒，王牌降临";
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
  state.voiceReady = true;
  ensureAudio();
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
  currentPlayerActions
});
