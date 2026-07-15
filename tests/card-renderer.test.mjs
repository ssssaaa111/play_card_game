import test from "node:test";
import assert from "node:assert/strict";

import { cardRenderModel } from "../src/card-renderer.js";
import { cardHandSummary } from "../src/cards.js";
import { library } from "../src/data.js";

test("builds monster card render models with live battle stats", () => {
  const model = cardRenderModel({
    id: "ember-drake",
    type: "monster",
    name: "赤焰幼龙",
    element: "fire",
    stars: 4,
    atk: 1500,
    def: 900,
    tempAtk: 300,
    battleWear: 200,
    used: true,
    mode: "attack",
    icon: "炎",
    text: "测试文本"
  }, { asset: "assets/monster-fire-dragon.png" });

  assert.equal(model.badge, "★4");
  assert.equal(model.elementText, "火属性");
  assert.equal(model.statusText, "强化+300 / 损耗-200");
  assert.deepEqual(model.stats, ["ATK 1800", "DEF 900"]);
  assert.match(model.artHtml, /monster-fire-dragon\.png/);
  assert.match(model.artHtml, /monster-element-chip fire">火属性/);
  assert.doesNotMatch(model.artHtml, />炎</);
});

test("builds spell and trap render models with rule summaries", () => {
  const spell = cardRenderModel({ type: "spell", name: "战意高扬", icon: "战", text: "强化最高怪兽。", effect: "buff500" });
  const trap = cardRenderModel({ type: "trap", name: "守护刻印", icon: "印", text: "挡住直击。", trigger: "directShield" });
  const locked = cardRenderModel({ type: "monster", name: "星轨枪兵", element: "wind", stars: 4, atk: 1800, def: 1000, icon: "星", text: "测试。", mode: "attack" }, { attacksLocked: true });

  assert.deepEqual(spell.stats, ["魔法", "目标:我方最高"]);
  assert.deepEqual(trap.stats, ["陷阱", "受到直接攻击时 / 直击伤害归零 / 消耗攻击"]);
  assert.match(spell.artHtml, /card-art-symbol/);
  assert.match(trap.artHtml, /card-art-symbol/);
  assert.equal(locked.statusText, "攻击已跳过");
});

test("builds concise tactical summaries for hand cards", () => {
  const seer = { type: "spell", name: "预见之召", icon: "抽", text: "抽 2 张卡。", effect: "draw2" };
  const guard = { type: "trap", name: "守护刻印", icon: "护", text: "直击伤害归零并抽牌。", trigger: "directShield" };

  assert.equal(cardHandSummary(seer), "抽牌 ×2");
  assert.equal(cardHandSummary(guard), "直击伤害归零 · 抽牌 ×1");
  assert.equal(cardRenderModel(seer, { handSummary: true }).text, "抽牌 ×2");
  assert.equal(cardRenderModel(seer, { handSummary: true }).textMode, "hand-summary");
  assert.equal(cardRenderModel(seer).text, "抽 2 张卡。");
  assert.equal(cardRenderModel(seer).textMode, "full");

  const supportCards = library.filter((card) => card.type === "spell" || card.type === "trap");
  assert.ok(supportCards.length > 0);
  supportCards.forEach((card) => {
    assert.ok(cardHandSummary(card), `${card.name} should expose a hand summary`);
  });
});

test("renders tribute requirements on high-level monster cards", () => {
  const model = cardRenderModel({
    type: "monster",
    name: "坠星巨卫",
    element: "light",
    stars: 8,
    atk: 3200,
    def: 2600,
    tributeCost: 2,
    icon: "坠",
    text: "需要 2 只祭品。"
  });

  assert.match(model.ruleText, /2/);
  assert.match(model.stats[1], /2/);
});
