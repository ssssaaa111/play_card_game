import test from "node:test";
import assert from "node:assert/strict";

import { createPhaseStageController, phaseStageCue, phaseStageCuesFromEvents } from "../src/phase-stage.js";

test("phase stage copy gives each duel phase a distinct tactical role", () => {
  assert.deepEqual(phaseStageCue("draw", "player"), {
    key: "player:draw",
    phase: "draw",
    turn: "player",
    code: "DRAW PHASE",
    title: "抽卡阶段",
    actor: "你的回合",
    detail: "确认新抽卡，规划本回合突破口",
    duration: 980
  });

  const battle = phaseStageCue("battle", "ai");
  assert.equal(battle.code, "BATTLE PHASE");
  assert.equal(battle.actor, "对手回合");
  assert.match(battle.detail, /敌方攻势/);
  assert.equal(phaseStageCue("setup", "player"), null);
});

test("stage cues are derived from authoritative turn and phase events in order", () => {
  const cues = phaseStageCuesFromEvents([
    { type: "TURN_ENDED", playerId: "player", phase: "end" },
    { type: "TURN_STARTED", playerId: "ai", phase: "draw" },
    { type: "ACTION_WINDOW_OPENED", playerId: "ai", window: "draw" },
    { type: "PHASE_CHANGED", playerId: "ai", from: "draw", to: "main" },
    { type: "PHASE_CHANGED", playerId: "ai", from: "main", to: "battle" }
  ]);

  assert.deepEqual(cues.map((cue) => cue.key), [
    "player:end",
    "ai:draw",
    "ai:main",
    "ai:battle"
  ]);
});

test("phase stages wait for another presentation and report when their queue is idle", () => {
  const nodes = new Map([
    ["[data-phase-stage-code]", { textContent: "" }],
    ["[data-phase-stage-title]", { textContent: "" }],
    ["[data-phase-stage-actor]", { textContent: "" }],
    ["[data-phase-stage-detail]", { textContent: "" }]
  ]);
  const classes = new Set();
  const root = {
    hidden: true,
    dataset: {},
    offsetWidth: 0,
    querySelector: (selector) => nodes.get(selector) || null,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    },
    style: { setProperty() {} }
  };
  const timers = [];
  const win = {
    matchMedia: () => ({ matches: false }),
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    }
  };
  let blocked = true;
  let idleCount = 0;
  const controller = createPhaseStageController({
    root,
    window: win,
    canPlay: () => !blocked,
    onIdle: () => { idleCount += 1; }
  });

  controller.enqueue(phaseStageCue("main", "player"));
  assert.equal(root.hidden, true);
  assert.equal(controller.hasWork(), true);
  assert.equal(controller.isActive(), false);

  blocked = false;
  controller.resume();
  assert.equal(root.hidden, false);
  assert.equal(controller.isActive(), true);
  assert.equal(nodes.get("[data-phase-stage-title]").textContent, "主要阶段");
  assert.equal(timers[0].delay, 1080);

  timers.shift().callback();
  assert.equal(root.hidden, true);
  assert.equal(controller.hasWork(), false);
  assert.equal(idleCount, 1);

  controller.enqueue(phaseStageCue("main", "player"));
  controller.enqueue(phaseStageCue("battle", "player"));
  controller.resume();
  assert.equal(timers.length, 1, "adding a phase must retain the active timer");
  controller.reset();
  assert.equal(timers.length, 0, "reset must cancel the active phase timer");
  assert.equal(controller.hasWork(), false);
  assert.equal(root.hidden, true);
  controller.resume();
  assert.equal(root.hidden, true, "reset must also discard queued phases");
});
