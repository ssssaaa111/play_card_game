import test from "node:test";
import assert from "node:assert/strict";

import { phaseStageCue, phaseStageCuesFromEvents } from "../src/phase-stage.js";

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
