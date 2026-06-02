import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_WINDOWS,
  PHASES,
  TIMINGS,
  TURNS,
  actionWindowTimeoutSeconds,
  actionWindowTiming,
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
} from "../src/turn-state.js";

function state(overrides = {}) {
  return {
    started: true,
    paused: false,
    gameOver: false,
    turn: TURNS.player,
    phase: PHASES.main,
    timing: TIMINGS.mainOpen,
    actionWindow: ACTION_WINDOWS.main,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: "",
    autoEnding: false,
    pendingTarget: null,
    aiRunning: false,
    ...overrides
  };
}

test("normalizes action windows and detects player control", () => {
  assert.equal(normalizeActionWindow("missing"), ACTION_WINDOWS.main);
  assert.equal(normalizeActionWindow(ACTION_WINDOWS.targetSelect), ACTION_WINDOWS.targetSelect);

  assert.equal(canPlayerActState(state()), true);
  assert.equal(canPlayerActState(state({ paused: true })), false);
  assert.equal(canPlayerActState(state({ turn: TURNS.ai })), false);
  assert.equal(canUsePlayerTurnControls(state()), true);
  assert.equal(canUsePlayerTurnControls(state({ phase: PHASES.draw })), false);
});

test("maps action windows to explicit timings and timeout budgets", () => {
  assert.equal(actionWindowTiming(ACTION_WINDOWS.main), TIMINGS.mainOpen);
  assert.equal(actionWindowTiming(ACTION_WINDOWS.battle), TIMINGS.battleOpen);
  assert.equal(actionWindowTiming(ACTION_WINDOWS.targetSelect), TIMINGS.targetSelection);
  assert.equal(actionWindowTiming(ACTION_WINDOWS.response), TIMINGS.responseWindow);
  assert.equal(actionWindowTiming(ACTION_WINDOWS.autoEnd), TIMINGS.autoEnd);
  assert.equal(actionWindowTimeoutSeconds(ACTION_WINDOWS.main), 30);
  assert.equal(actionWindowTimeoutSeconds(ACTION_WINDOWS.battle), 30);
  assert.equal(actionWindowTimeoutSeconds(ACTION_WINDOWS.targetSelect), 20);
  assert.equal(actionWindowTimeoutSeconds(ACTION_WINDOWS.response), 12);
});

test("decides the player action window from phase and available actions", () => {
  assert.deepEqual(playerActionWindowDecision(state({ phase: PHASES.draw }), { hasMainAction: true }), { kind: "ignore" });
  assert.deepEqual(playerActionWindowDecision(state({ pendingTarget: { handUid: "s1" } }), { hasMainAction: true }), {
    kind: "targetSelect",
    actionWindow: ACTION_WINDOWS.targetSelect,
    resetIdle: true
  });
  assert.deepEqual(playerActionWindowDecision(state(), { hasMainAction: true, hasBattleAction: true }), {
    kind: "main",
    actionWindow: ACTION_WINDOWS.main,
    resetIdle: true
  });
  assert.deepEqual(playerActionWindowDecision(state(), { hasMainAction: false, hasBattleAction: true }), {
    kind: "battle",
    actionWindow: ACTION_WINDOWS.battle,
    enterBattle: true,
    resetIdle: true
  });
  assert.deepEqual(playerActionWindowDecision(state({ phase: PHASES.battle, actionWindow: ACTION_WINDOWS.battle }), { hasBattleAction: true }), {
    kind: "battle",
    actionWindow: ACTION_WINDOWS.battle,
    resetIdle: true
  });
  assert.deepEqual(playerActionWindowDecision(state(), { hasMainAction: false, hasBattleAction: false }), {
    kind: "autoEnd",
    actionWindow: ACTION_WINDOWS.autoEnd,
    scheduleAutoEnd: true
  });
});

test("detects idle countdown and pause resume steps", () => {
  assert.equal(shouldRunPlayerIdleCountdownForState(state()), true);
  assert.equal(shouldRunPlayerIdleCountdownForState(state({ actionWindow: ACTION_WINDOWS.targetSelect, pendingTarget: { handUid: "s1" } })), true);
  assert.equal(shouldRunPlayerIdleCountdownForState(state({ phase: PHASES.battle, actionWindow: ACTION_WINDOWS.battle })), true);
  assert.equal(shouldRunPlayerIdleCountdownForState(state({ turn: TURNS.ai, actionWindow: ACTION_WINDOWS.response })), true);
  assert.equal(shouldRunPlayerIdleCountdownForState(state({ autoEnding: true })), false);

  assert.equal(pauseResumeStep(state({ phase: PHASES.draw })), "playerDraw");
  assert.equal(pauseResumeStep(state()), "playerMain");
  assert.equal(pauseResumeStep(state({ phase: PHASES.battle, actionWindow: ACTION_WINDOWS.battle })), "playerBattle");
  assert.equal(pauseResumeStep(state({ turn: TURNS.ai })), "aiTurn");
  assert.equal(pauseResumeStep(state({ paused: true })), "none");
});

test("builds standardized action-window patches with deadlines", () => {
  assert.deepEqual(openActionWindowPatch(ACTION_WINDOWS.targetSelect, { now: 1000, reason: "select target" }), {
    actionWindow: ACTION_WINDOWS.targetSelect,
    timing: TIMINGS.targetSelection,
    actionWindowId: "targetSelect:1000",
    actionWindowReason: "select target",
    actionDeadline: 21000
  });
  assert.deepEqual(openActionWindowPatch(ACTION_WINDOWS.ai, { now: 1000 }), {
    actionWindow: ACTION_WINDOWS.ai,
    timing: TIMINGS.ai,
    actionWindowId: "ai:1000",
    actionWindowReason: "",
    actionDeadline: 0
  });
});

test("builds transition patches for turn flow", () => {
  assert.deepEqual(turnStartPatch(TURNS.player), {
    turn: TURNS.player,
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
  });

  assert.deepEqual(drawToMainPatch(), {
    phase: PHASES.main,
    timing: TIMINGS.mainOpen,
    actionWindow: ACTION_WINDOWS.main,
    pendingTarget: null,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  });

  assert.deepEqual(mainToBattlePatch(), {
    phase: PHASES.battle,
    timing: TIMINGS.battleOpen,
    actionWindow: ACTION_WINDOWS.battle,
    pendingTarget: null,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  });

  assert.deepEqual(aiWindowPatch(), {
    actionWindow: ACTION_WINDOWS.ai,
    timing: TIMINGS.ai,
    actionDeadline: 0,
    actionWindowId: null,
    actionWindowReason: ""
  });
});
