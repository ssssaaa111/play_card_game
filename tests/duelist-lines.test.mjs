import test from "node:test";
import assert from "node:assert/strict";
import { aceLine, duelistLabel, duelistName, lineFor, summonVoiceKey } from "../src/duelist-lines.js";

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
  assert.equal(lineFor("player", "direct", card), "直接攻击，一决胜负！");
  assert.equal(lineFor("ai", "direct", card), "直接攻击，结束吧！");
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

test("three-tribute gods get distinct entrance lines without rule narration", () => {
  const gods = ["trio-sun-judicator", "trio-moon-warden", "trio-star-herald", "celestial-origin-dragon"];
  const lines = gods.map((id) => {
    const card = { id, tributeCost: 3, stars: 7 };
    assert.equal(summonVoiceKey(card), "divine");
    const line = lineFor("ai", "ace", card);
    assert.doesNotMatch(line, /祭品|足够|生命值/);
    assert.ok(line.length <= 20);
    return line;
  });
  assert.equal(new Set(lines).size, gods.length);
  assert.equal(summonVoiceKey({ stars: 5 }), "ace");
  assert.equal(summonVoiceKey({ stars: 4 }), "summon");
});
