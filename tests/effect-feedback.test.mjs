import test from "node:test";
import assert from "node:assert/strict";

import {
  afterAttackBackrowDestroyedText,
  isContinuousReleaseStat,
  negatedActivatedTrapText,
  shouldLogGenericDestroyedEvent,
  statChangeText
} from "../src/effect-feedback.js";

test("describes ordinary stat changes and continuous-effect restoration", () => {
  assert.equal(statChangeText({ stat: "tempAtk", amount: 500 }), "攻击力提升 500");
  assert.equal(statChangeText({ stat: "tempDef", amount: -300 }), "防御力下降 300");
  assert.equal(
    statChangeText({ stat: "tempAtk", amount: 900 }, { continuousReleased: true }),
    "攻击力恢复 900"
  );
  assert.equal(
    statChangeText({ stat: "tempDef", amount: -200 }, { continuousReleased: true }),
    "防御力回落 200"
  );
});

test("matches stat rollback events to their continuous release", () => {
  const statEvent = {
    type: "STAT_MODIFIED",
    duration: "continuous",
    cardId: "target-1",
    sourceCardId: "moon-1",
    amount: 900
  };
  const events = [
    statEvent,
    {
      type: "CONTINUOUS_EFFECT_RELEASED",
      sourceCardId: "moon-1",
      targetCardId: "target-1"
    }
  ];

  assert.equal(isContinuousReleaseStat(events, statEvent), true);
  assert.equal(isContinuousReleaseStat([], statEvent), false);
});

test("logs attack-destroy results through the shared public effect feedback", () => {
  assert.equal(shouldLogGenericDestroyedEvent({ trigger: "attackDestroy" }), true);
  assert.equal(shouldLogGenericDestroyedEvent({ effect: "destroySpellTrap" }), true);
});

test("explains the two distinct graveyard moves around a negated attack trap", () => {
  assert.equal(
    negatedActivatedTrapText("星线护续"),
    "星线护续的效果被连锁无效；已发动陷阱仍送入墓地。"
  );
  assert.equal(
    afterAttackBackrowDestroyedText("曜冕裁决者", "日冕诱锁"),
    "曜冕裁决者的攻击后效果破坏了当前最靠前的魔陷「日冕诱锁」。"
  );
});
