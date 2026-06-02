export const PHASES = {
  setup: "setup",
  ready: "ready",
  draw: "draw",
  main: "main",
  battle: "battle"
};

export const TIMINGS = {
  setup: "setup",
  draw: "draw",
  mainOpen: "mainOpen",
  battleOpen: "battleOpen",
  targetSelection: "targetSelection",
  responseWindow: "responseWindow",
  chainResolution: "chainResolution",
  autoEnd: "autoEnd",
  ai: "ai",
  gameOver: "gameOver"
};

export const TURNS = {
  player: "player",
  ai: "ai"
};

export const ACTION_WINDOWS = {
  setup: "setup",
  draw: "draw",
  main: "main",
  battle: "battle",
  targetSelect: "targetSelect",
  response: "response",
  autoEnd: "autoEnd",
  ai: "ai",
  gameOver: "gameOver"
};

const validActionWindows = new Set(Object.values(ACTION_WINDOWS));
const actionWindowTimings = {
  [ACTION_WINDOWS.setup]: TIMINGS.setup,
  [ACTION_WINDOWS.draw]: TIMINGS.draw,
  [ACTION_WINDOWS.main]: TIMINGS.mainOpen,
  [ACTION_WINDOWS.battle]: TIMINGS.battleOpen,
  [ACTION_WINDOWS.targetSelect]: TIMINGS.targetSelection,
  [ACTION_WINDOWS.response]: TIMINGS.responseWindow,
  [ACTION_WINDOWS.autoEnd]: TIMINGS.autoEnd,
  [ACTION_WINDOWS.ai]: TIMINGS.ai,
  [ACTION_WINDOWS.gameOver]: TIMINGS.gameOver
};

const actionWindowTimeouts = {
  [ACTION_WINDOWS.main]: 30,
  [ACTION_WINDOWS.battle]: 30,
  [ACTION_WINDOWS.targetSelect]: 20,
  [ACTION_WINDOWS.response]: 12,
  [ACTION_WINDOWS.autoEnd]: 2
};

export function normalizeActionWindow(windowName) {
  return validActionWindows.has(windowName) ? windowName : ACTION_WINDOWS.main;
}

export function actionWindowTiming(windowName) {
  return actionWindowTimings[normalizeActionWindow(windowName)] || TIMINGS.mainOpen;
}

export function actionWindowTimeoutSeconds(windowName) {
  return actionWindowTimeouts[normalizeActionWindow(windowName)] || 0;
}

export function openActionWindowPatch(windowName, { now = Date.now(), reason = "", timeoutSeconds = actionWindowTimeoutSeconds(windowName) } = {}) {
  const actionWindow = normalizeActionWindow(windowName);
  return {
    actionWindow,
    timing: actionWindowTiming(actionWindow),
    actionWindowId: `${actionWindow}:${now}`,
    actionWindowReason: reason,
    actionDeadline: timeoutSeconds > 0 ? now + timeoutSeconds * 1000 : 0
  };
}

export function closeActionWindowPatch() {
  return {
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  };
}

export function canPlayerActState({ started = false, paused = false, turn = "", gameOver = false } = {}) {
  return Boolean(started && !paused && turn === TURNS.player && !gameOver);
}

export function isPlayerMainState(state = {}) {
  return canPlayerActState(state) && state.phase === PHASES.main;
}

export function isPlayerBattleState(state = {}) {
  return canPlayerActState(state) && state.phase === PHASES.battle;
}

export function canUsePlayerTurnControls(state = {}) {
  return isPlayerMainState(state) || isPlayerBattleState(state);
}

export function shouldRunPlayerIdleCountdown({
  canAct = false,
  phase = "",
  autoEnding = false,
  actionWindow = ""
} = {}) {
  return Boolean(
    canAct &&
    [PHASES.main, PHASES.battle].includes(phase) &&
    !autoEnding &&
    [ACTION_WINDOWS.main, ACTION_WINDOWS.battle, ACTION_WINDOWS.targetSelect, ACTION_WINDOWS.response].includes(actionWindow)
  );
}

export function shouldRunPlayerIdleCountdownForState(state = {}) {
  return shouldRunPlayerIdleCountdown({
    canAct: canPlayerActState(state) || (
      state.started &&
      !state.paused &&
      !state.gameOver &&
      state.actionWindow === ACTION_WINDOWS.response
    ),
    phase: state.phase,
    autoEnding: state.autoEnding,
    actionWindow: state.actionWindow
  });
}

export function playerActionWindowDecision(state = {}, {
  hasAnyAction = false,
  hasMainAction = hasAnyAction,
  hasBattleAction = false
} = {}) {
  if (!canPlayerActState(state) || ![PHASES.main, PHASES.battle].includes(state.phase)) return { kind: "ignore" };
  if (state.pendingTarget) {
    return { kind: "targetSelect", actionWindow: ACTION_WINDOWS.targetSelect, resetIdle: true };
  }

  if (state.phase === PHASES.main && hasMainAction) {
    return { kind: "main", actionWindow: ACTION_WINDOWS.main, resetIdle: true };
  }
  if (state.phase === PHASES.main && hasBattleAction) {
    return { kind: "battle", actionWindow: ACTION_WINDOWS.battle, enterBattle: true, resetIdle: true };
  }
  if (state.phase === PHASES.battle && hasBattleAction) {
    return { kind: "battle", actionWindow: ACTION_WINDOWS.battle, resetIdle: true };
  }
  return { kind: "autoEnd", actionWindow: ACTION_WINDOWS.autoEnd, scheduleAutoEnd: true };
}

export function pauseResumeStep(state = {}) {
  if (!state.started || state.gameOver || state.paused) return "none";
  if (state.turn === TURNS.player && state.phase === PHASES.draw) return "playerDraw";
  if (state.turn === TURNS.player && state.phase === PHASES.main) return "playerMain";
  if (state.turn === TURNS.player && state.phase === PHASES.battle) return "playerBattle";
  if (state.turn === TURNS.ai && !state.aiRunning) return "aiTurn";
  return "none";
}

export function turnStartPatch(owner) {
  return {
    turn: owner,
    phase: PHASES.draw,
    timing: TIMINGS.draw,
    selected: null,
    pendingTarget: null,
    focusedCard: null,
    summonedThisTurn: false,
    autoEnding: false,
    actionWindow: ACTION_WINDOWS.draw,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: "",
    aiRunning: false
  };
}

export function drawToMainPatch() {
  return {
    phase: PHASES.main,
    timing: TIMINGS.mainOpen,
    actionWindow: ACTION_WINDOWS.main,
    pendingTarget: null,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  };
}

export function mainToBattlePatch() {
  return {
    phase: PHASES.battle,
    timing: TIMINGS.battleOpen,
    actionWindow: ACTION_WINDOWS.battle,
    pendingTarget: null,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  };
}

export function aiWindowPatch() {
  return {
    actionWindow: ACTION_WINDOWS.ai,
    timing: TIMINGS.ai,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  };
}
