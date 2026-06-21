import test from "node:test";
import assert from "node:assert/strict";
import { aceLine, duelistLabel, duelistName, lineFor } from "../src/duelist-lines.js";

test("builds localized duelist names and labels", () => {
  assert.equal(duelistLabel({ owner: "player" }), "你");
  assert.equal(duelistLabel({ owner: "ai" }), "AI");
  assert.equal(duelistName("player"), "你");
  assert.equal(duelistName("ai"), "AI");
});

test("builds localized duel lines for player and ai actions", () => {
  const card = { name: "星轨枪兵" };

  assert.equal(lineFor("player", "attack", card), "星轨枪兵，全力攻击！");
  assert.equal(lineFor("ai", "attack", card), "星轨枪兵，粉碎目标。");
  assert.equal(lineFor("player", "direct", card), "直接攻击，贯穿生命值！");
  assert.equal(lineFor("ai", "direct", card), "直接攻击，生命值下降。");
  assert.equal(lineFor("ai", "unknown", card), "星轨枪兵");
  assert.equal(lineFor("ai", "unknown", null), "效果发动。");
});

test("prefers explicit detail lines and maps ace element copy", () => {
  assert.equal(lineFor("ai", "attack", { name: "星轨枪兵" }, "自定义台词。"), "自定义台词。");
  assert.equal(aceLine({ element: "fire" }), "熔炎升腾，王牌降临");
  assert.equal(aceLine({ element: "wind" }), "疾风开路，王牌降临");
  assert.equal(aceLine({ element: "shadow" }), "暗影蔓延，王牌降临");
  assert.equal(aceLine({ element: "light" }), "星辉照耀，王牌降临");
  assert.equal(aceLine({ element: "water" }), "星魂觉醒，王牌降临");
});
