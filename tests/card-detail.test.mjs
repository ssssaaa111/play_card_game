import test from "node:test";
import assert from "node:assert/strict";

import { cardDetailText, cardRuleLine, cardZoomMeta } from "../src/card-detail.js";

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
  assert.match(cardDetailText(card), /ATK 1800 \/ DEF 900/);
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
