import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScenarioBriefView,
  definitionLabel,
  formatDuelStats,
  preDuelDeckCountText,
  scenarioDifficultyText
} from "../src/setup-renderer.js";

test("setup summaries keep duel stats and definition labels stable", () => {
  assert.equal(formatDuelStats({
    wins: 4,
    losses: 2,
    duels: 6,
    streak: 2,
    bestStreak: 3
  }), "战绩 4胜/2负 / 总局数 6 / 当前连胜 2 / 最高连胜 3");
  assert.equal(definitionLabel({ balanced: { label: "均衡卡组" } }, "balanced"), "均衡卡组");
  assert.equal(definitionLabel({}, "custom"), "custom");
});

test("challenge scenario brief exposes objectives hints and toggle state", () => {
  const view = buildScenarioBriefView({
    label: "逆境挑战",
    difficulty: "challenge",
    objectives: ["完成召唤", "赢得决斗"],
    hints: ["保留反击牌"]
  }, {
    hintsVisible: true
  });

  assert.equal(view.hidden, false);
  assert.equal(view.title, "逆境挑战");
  assert.equal(view.difficultyText, "挑战版");
  assert.equal(view.challenge, true);
  assert.deepEqual(view.objectives, ["完成召唤", "赢得决斗"]);
  assert.deepEqual(view.hints, ["保留反击牌"]);
  assert.equal(view.hintsVisible, true);
  assert.equal(view.hintToggleText, "隐藏提示");
});

test("scenarios without hints normalize the hint panel to hidden", () => {
  const view = buildScenarioBriefView({
    goal: "完成一次攻击"
  }, {
    hintsVisible: true
  });

  assert.deepEqual(view.objectives, ["完成一次攻击"]);
  assert.equal(view.hintsVisible, false);
  assert.equal(view.hintToggleDisabled, true);
  assert.equal(view.hintToggleText, "无提示");
  assert.equal(scenarioDifficultyText("demo"), "演示版");
  assert.equal(scenarioDifficultyText("normal"), "");
});

test("pre-duel deck count distinguishes total cards from compact card types", () => {
  assert.equal(preDuelDeckCountText({
    deckCards: [{}, {}, {}],
    displayDeckCards: [{}, {}]
  }), "2 种 / 3 张");
  assert.equal(preDuelDeckCountText({
    deckCards: [{}, {}],
    displayDeckCards: [{}, {}]
  }), "2 张");
});
