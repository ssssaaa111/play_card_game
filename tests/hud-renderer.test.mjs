import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDuelistHudView,
  vitalStatusItems
} from "../src/hud-renderer.js";

function duelist(owner, overrides = {}) {
  return {
    owner,
    lp: 4000,
    extraSummon: 0,
    deck: [],
    grave: [],
    ...overrides
  };
}

test("player HUD view combines life resources turn state and pile counts", () => {
  const view = buildDuelistHudView({
    duelist: duelist("player", {
      lp: 2000,
      extraSummon: 1,
      deck: [{}, {}, {}],
      grave: [{}]
    }),
    profile: {
      name: "星辉使者",
      skill: "星辉",
      text: "首次组合技额外抽牌。"
    },
    activeTurn: "player"
  });

  assert.equal(view.name, "星辉使者（你）");
  assert.match(view.skillHtml, /<strong>星辉<\/strong>/);
  assert.equal(view.life.text, "2000");
  assert.equal(view.life.ariaLabel, "生命值 2000");
  assert.equal(view.life.tone, "warning");
  assert.equal(view.deckCount, 3);
  assert.equal(view.graveCount, 1);
  assert.equal(view.active, true);
  assert.deepEqual(view.vitalItems, [
    { label: "你的回合", tone: "turn" },
    { label: "额外召唤 1", tone: "resource" },
    { label: "生命警戒", tone: "warning" }
  ]);
});

test("paused critical AI HUD removes active turn and direct-target emphasis", () => {
  const view = buildDuelistHudView({
    duelist: duelist("ai", { lp: 800 }),
    profile: {
      name: "影刃 AI",
      skill: "压制",
      text: "优先攻击。"
    },
    activeTurn: "ai",
    paused: true
  });

  assert.equal(view.name, "影刃 AI");
  assert.equal(view.active, false);
  assert.equal(view.life.tone, "critical");
  assert.equal(view.vitalItems[0].label, "已暂停");
  assert.equal(view.vitalItems.at(-1).label, "生命危急");
  assert.equal(view.directTargetReady, false);
  assert.equal(view.panelAriaLabel, "AI 玩家状态");
  assert.equal(view.panelRole, "region");
  assert.equal(view.panelTabIndex, -1);
});

test("stable waiting HUD only exposes its idle turn chip", () => {
  assert.deepEqual(vitalStatusItems({
    duelist: duelist("ai"),
    lifeTone: "stable",
    activeTurn: "player"
  }), [
    { label: "待机", tone: "idle" }
  ]);
});

test("AI direct targets expose keyboard button semantics", () => {
  const view = buildDuelistHudView({
    duelist: duelist("ai"),
    directTargetReady: true
  });

  assert.equal(view.directTargetReady, true);
  assert.equal(view.panelAriaLabel, "直接攻击 AI 玩家");
  assert.equal(view.panelRole, "button");
  assert.equal(view.panelTabIndex, 0);
});
