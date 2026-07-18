import test from "node:test";
import assert from "node:assert/strict";

import {
  isContinuousReleaseStat,
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

test("leaves attack-destroy trap logging to its dedicated feedback", () => {
  assert.equal(shouldLogGenericDestroyedEvent({ trigger: "attackDestroy" }), false);
  assert.equal(shouldLogGenericDestroyedEvent({ effect: "destroySpellTrap" }), true);
});
