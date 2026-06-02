import test from "node:test";
import assert from "node:assert/strict";

import { cardRenderModel, cardStatusText } from "../src/card-renderer.js";

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
  assert.deepEqual(model.stats, ["ATK 1800", "火属性 / 攻击 DEF 900"]);
  assert.match(model.artHtml, /monster-fire-dragon\.png/);
});

test("builds spell and trap render models with rule summaries", () => {
  const spell = cardRenderModel({ type: "spell", name: "战意高扬", icon: "战", text: "强化最高怪兽。", effect: "buff500" });
  const trap = cardRenderModel({ type: "trap", name: "守护刻印", icon: "印", text: "挡住直击。", trigger: "directShield" });
  const locked = cardRenderModel({ type: "monster", name: "星轨枪兵", element: "wind", stars: 4, atk: 1800, def: 1000, icon: "星", text: "测试。", mode: "attack" }, { attacksLocked: true });

  assert.deepEqual(spell.stats, ["SPELL", "目标:我方最高"]);
  assert.deepEqual(trap.stats, ["TRAP", "受到直接攻击时 / 直击伤害归零"]);
  assert.equal(locked.statusText, "攻击已跳过");
});

test("summarizes monster status chips", () => {
  assert.equal(cardStatusText({ type: "spell" }), "");
  assert.equal(cardStatusText({ type: "monster", tempAtk: -400, battleWear: 0, used: false }), "弱化-400");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 0, battleWear: 300, used: true }), "损耗-300 / 已行动");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 0, battleWear: 0, used: false, mode: "attack" }, { attacksLocked: true }), "攻击已跳过");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 300, battleWear: 0, used: false, mode: "attack" }, { attacksLocked: true }), "攻击已跳过 / 强化+300");
});
