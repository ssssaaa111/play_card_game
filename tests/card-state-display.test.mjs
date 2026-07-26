import test from "node:test";
import assert from "node:assert/strict";

import { cardStateChips, cardStatusText } from "../src/card-state-display.js";

test("summarizes monster status text", () => {
  assert.equal(cardStatusText({ type: "spell" }), "");
  assert.equal(cardStatusText({ type: "monster", tempAtk: -400, battleWear: 0, used: false }), "弱化-400");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 0, battleWear: 300, used: true }), "损耗-300 / 已行动");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 0, battleWear: 0, used: false, mode: "attack" }, { attacksLocked: true }), "攻击已跳过");
  assert.equal(cardStatusText({ type: "monster", tempAtk: 300, battleWear: 0, used: false, mode: "attack" }, { attacksLocked: true }), "攻击已跳过 / 强化+300");
});

test("builds compact field state chips in a stable priority order", () => {
  assert.deepEqual(
    cardStateChips({ type: "monster", mode: "attack", used: false, tempAtk: 300, battleWear: 200 }, { attackReady: true }),
    [
      { label: "可攻击", tone: "ready" },
      { label: "攻 +300", tone: "buff" },
      { label: "损 -200", tone: "debuff" }
    ]
  );
  assert.deepEqual(
    cardStateChips({ type: "monster", mode: "defense", used: false, destructionProtection: true }),
    [
      { label: "守备", tone: "defense" },
      { label: "守护", tone: "guard" }
    ]
  );
});

test("explains convergence attack locks and sourced effect markers before generic used state", () => {
  assert.equal(
    cardStatusText({
      type: "monster",
      mode: "attack",
      used: true,
      attackLockReason: "trioConvergence"
    }),
    "三曜共降：本回合不能攻击"
  );
  assert.deepEqual(
    cardStateChips({
      type: "monster",
      mode: "attack",
      used: true,
      attackLockReason: "trioConvergence",
      tempAtk: 2100
    }, {
      effectMarkers: [
        { label: "再攻 ×2", tone: "ability", detail: "三曜终断、战斗狂热" }
      ]
    }),
    [
      { label: "本回合禁攻", tone: "locked", detail: "三曜共降：本回合不能攻击" },
      { label: "再攻 ×2", tone: "ability", detail: "三曜终断、战斗狂热" },
      { label: "攻 +2100", tone: "buff" }
    ]
  );
});

test("keeps the newest sourced modifier visible and summarizes hidden effects", () => {
  assert.deepEqual(
    cardStateChips({
      type: "monster",
      mode: "attack",
      used: false,
      tempAtk: 800
    }, {
      attackReady: true,
      effectMarkers: [
        { label: "再攻 ×1", tone: "ability", detail: "追加攻击 ×1：战斗狂热" },
        { label: "战斗 攻+200", tone: "buff", detail: "战斗狂热生效：攻击力 +200。" },
        { label: "炎岚 攻+100", tone: "buff", detail: "炎岚追击生效：攻击力 +100。" },
        { label: "战意 攻+500", tone: "buff", detail: "战意高扬生效：攻击力 +500。" }
      ]
    }),
    [
      { label: "可攻击", tone: "ready" },
      { label: "再攻 ×1", tone: "ability", detail: "追加攻击 ×1：战斗狂热" },
      { label: "战斗 攻+200", tone: "buff", detail: "战斗狂热生效：攻击力 +200。" },
      {
        label: "更多效果 +2",
        tone: "overflow",
        detail: "另有 2 项效果：炎岚 攻+100、战意 攻+500"
      }
    ]
  );
});
