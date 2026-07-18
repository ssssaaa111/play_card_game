import test from "node:test";
import assert from "node:assert/strict";

import {
  gameOverDuelModalView,
  setupDuelModalView
} from "../src/duel-modal-renderer.js";

test("setup modal keeps the pre-duel action and guidance copy", () => {
  assert.deepEqual(setupDuelModalView(), {
    title: "战前准备",
    text: "先熟悉己方卡组、技能和场景目标，再开始决斗。",
    actionText: "开始决斗",
    reviewLog: false
  });
});

test("win and loss modals keep distinct result copy and expose log review", () => {
  const win = gameOverDuelModalView({
    win: true,
    statsText: "战绩 3胜/1负"
  });
  const loss = gameOverDuelModalView({
    win: false,
    statsText: "战绩 3胜/2负"
  });

  assert.equal(win.title, "你赢了");
  assert.equal(win.text, "星魂回应了你的召唤。战绩 3胜/1负。");
  assert.equal(win.actionText, "回到准备");
  assert.equal(win.reviewLog, true);

  assert.equal(loss.title, "决斗败北");
  assert.match(loss.text, /调整卡组顺序或更早展开怪兽/);
  assert.match(loss.text, /战绩 3胜\/2负/);
  assert.equal(loss.reviewLog, true);
});
