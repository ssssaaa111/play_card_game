import test from "node:test";
import assert from "node:assert/strict";

import { cardDetailText, cardDetailViewModel, cardInspectorViewModel, cardRuleLine, cardZoomMeta } from "../src/card-detail.js";

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

test("keeps complete effect text in details when hand cards use summaries", () => {
  const view = cardDetailViewModel("seer-call");

  assert.equal(view.name, "预见之召");
  assert.equal(view.effectText, "抽 2 张卡。");
  assert.match(cardDetailText(view.card), /抽 2 张卡/);
});

test("builds a tactical inspector without replacing complete support-card text", () => {
  const view = cardInspectorViewModel("seer-call");

  assert.equal(view.tacticalSummary, "抽牌 ×2");
  assert.equal(view.effectText, "抽 2 张卡。");
  assert.deepEqual(view.rows.map((row) => row.label), ["类型", "规则", "分类"]);
  assert.equal(view.rows[0].value, "魔法");
  assert.equal(view.rows[1].value, "无需指定目标");
  assert.match(view.rows[2].value, /稀有度 N · 流派 资源/);
});

test("uses live monster values and status in the selected-card inspector", () => {
  const definition = cardDetailViewModel("ember-drake").card;
  const view = cardInspectorViewModel({ ...definition, tempAtk: 300, used: true, mode: "attack" });

  assert.match(view.rows.find((row) => row.label === "战力").value, /ATK 1800 \/ DEF 900/);
  assert.match(view.rows.find((row) => row.label === "状态").value, /强化\+300/);
});

test("keeps concealed cards redacted in inspector and zoom details", () => {
  const card = { type: "trap", name: "盖放的陷阱", text: "这张卡还没有被公开。", concealed: true };
  const view = cardInspectorViewModel(card);

  assert.equal(view.tacticalSummary, "未知效果");
  assert.deepEqual(view.rows, [
    { label: "类型", value: "盖放卡" },
    { label: "状态", value: "未公开" }
  ]);
  assert.equal(cardDetailViewModel(card).card, card);
  assert.equal(cardZoomMeta(card), "类型：盖放卡 / 状态：未公开");
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

test("describes divine three-tribute card details from unified card definitions", () => {
  const view = cardDetailViewModel("celestial-origin-dragon");

  assert.equal(view.name, "创星神龙");
  assert.equal(view.type, "怪兽");
  assert.equal(view.attack, 4000);
  assert.equal(view.defense, 4000);
  assert.match(view.effectText, /需要 3 只/);
  assert.match(view.effectText, /神格守护/);
  assert.match(view.effectText, /神格贯穿/);
  assert.match(view.effectText, /神格威压/);
  assert.equal(view.summonRequirement, "召唤需求：3 只祭品");
  assert.match(view.tags, /神格/);
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
