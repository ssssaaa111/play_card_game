import test from "node:test";
import assert from "node:assert/strict";

import { cardDetailText, cardDetailViewModel, cardRuleLine, cardZoomMeta } from "../src/card-detail.js";

test("describes monster details with current status", () => {
  const card = {
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
    text: "测试怪兽。"
  };

  assert.equal(cardRuleLine(card), "强化+300 / 损耗-200");
  assert.match(cardDetailText(card), /攻击 1800 \/ 守备 900/);
  assert.match(cardDetailText(card), /战斗损耗 200/);
  assert.match(cardZoomMeta(card), /当前状态：强化\+300 \/ 损耗-200/);
});

test("describes spell and trap rule lines", () => {
  const targetedSpell = { type: "spell", name: "战意高扬", effect: "buff500", text: "强化最高怪兽。" };
  const ordinarySpell = { type: "spell", name: "预见之召", effect: "draw2", text: "抽 2 张卡。" };
  const trap = { type: "trap", name: "守护刻印", trigger: "directShield", text: "挡直击。" };

  assert.equal(cardRuleLine(targetedSpell), "规则：目标：我方最高");
  assert.equal(cardRuleLine(ordinarySpell), "规则：无需指定目标");
  assert.equal(cardRuleLine(trap), "触发：受到直接攻击时 / 直击伤害归零 / 消耗攻击");
  assert.match(cardZoomMeta(trap), /触发键：directShield/);
});

test("describes tribute summon requirements in unified card details", () => {
  const card = {
    id: "starfall-colossus",
    type: "monster",
    name: "坠星巨卫",
    element: "light",
    stars: 8,
    atk: 3200,
    def: 2600,
    tributeCost: 2,
    text: "需要 2 只我方场上怪兽作为祭品才能通常召唤。"
  };
  const view = cardDetailViewModel(card);

  assert.match(cardRuleLine(card), /2/);
  assert.match(cardDetailText(card), /2/);
  assert.match(cardZoomMeta(card), /2/);
  assert.match(view.summonRequirement, /2/);
});

test("describes fusion requirements in unified card details", () => {
  const view = cardDetailViewModel("starforge-fusion");

  assert.equal(view.name, "星魂融合");
  assert.match(view.effectText, /焰岚合星者/);
  assert.match(view.summonRequirement, /2/);
  assert.match(view.rule, /融合召唤/);
});

test("describes generated token details from unified card definitions", () => {
  const view = cardDetailViewModel("spark-fragment-token");

  assert.equal(view.name, "星火衍生体");
  assert.equal(view.type, "怪兽");
  assert.equal(view.attack, 500);
  assert.equal(view.defense, 500);
  assert.match(view.effectText, /分裂效果生成/);
});
