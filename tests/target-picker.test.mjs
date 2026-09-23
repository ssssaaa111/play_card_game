import test from "node:test";
import assert from "node:assert/strict";
import { targetOptionOutcome, targetOptionView } from "../src/target-picker-renderer.js";
import { collectLegalTargetSelections, buildTargetSelectionDisplay, prepareDefaultTargetSelection } from "../src/target-selection.js";

test("revival candidates exclude spells and retain their original grave indexes", () => {
  const monster = { id: "pawn", type: "monster", name: "余烁小卫", atk: 600, def: 400 };
  const spell = { id: "spent-spell", type: "spell", name: "用过的魔法" };
  const state = { player: { grave: [spell, monster], field: [], traps: [] } };
  const pending = { mode: "ownGraveMonster", cardName: "余烁归轨" };
  const targets = collectLegalTargetSelections(pending, state);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].index, 1);
  assert.equal(targets[0].card, monster);
  const display = buildTargetSelectionDisplay(prepareDefaultTargetSelection(pending, state), state);
  assert.match(display.text, /我方墓地怪兽 · 1 个可选/);
  assert.match(display.text, /仅此 1 个目标/);
  assert.doesNotMatch(display.text, /其他候选|其他高亮/);
  assert.equal(collectLegalTargetSelections({ mode: "ownGraveCard" }, state).length, 2);
});

test("support candidates exclude empty and friendly slots and keep hidden identities private", () => {
  const hidden = { id: "secret-trap", type: "trap", name: "秘密陷阱", text: "隐藏效果" };
  const state = {
    player: { traps: [{ type: "spell", name: "我方魔法" }] },
    ai: { traps: [null, hidden, null, { id: "moon", type: "spell", name: "月曜帷幕" }] }
  };
  const options = collectLegalTargetSelections({ mode: "enemySpellTrap" }, state).map(target => targetOptionView(target));
  assert.equal(options.length, 2);
  assert.equal(options[0].name, "盖放卡牌");
  assert.match(options[0].detail, /敌方魔陷区 2/);
  assert.doesNotMatch(JSON.stringify(options), /secret-trap|秘密陷阱|隐藏效果|我方魔法/);
  assert.equal(options[1].name, "月曜帷幕");
});

test("grave choices show base stats without stale buffs, defense or spent markers", () => {
  const card = { id: "pawn", name: "余烁小卫", type: "monster", stars: 2, atk: 600, def: 400, tempAtk: 700, tempDef: -300, battleWear: 200, used: true, mode: "defense" };
  const view = targetOptionView({ ok: true, owner: "player", zone: "grave", index: 0, card });
  assert.equal(view.detail, "2 星 · 基础 ATK 600 / DEF 400");
  assert.doesNotMatch(JSON.stringify(view), /used|tempAtk|defense|已行动|守备/);
  assert.equal(card.tempAtk, 700);
});

test("target choices preview the result of selecting them", () => {
  const graveTarget = { owner: "player", zone: "grave", card: { name: "余烁小卫" } };
  const supportTarget = { owner: "ai", zone: "traps", card: { name: "月曜帷幕" } };

  assert.match(targetOptionOutcome(graveTarget, { effect: "graveRevive" }), /特殊召唤.*状态重置/);
  assert.equal(targetOptionOutcome(supportTarget, { effect: "destroySpellTrap" }), "发动后破坏此魔陷");
  assert.equal(targetOptionOutcome(supportTarget, { purpose: "afterAttackTarget" }), "攻击结算后破坏此卡");
});
