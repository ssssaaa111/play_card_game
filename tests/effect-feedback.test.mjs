import test from "node:test";
import assert from "node:assert/strict";

import {
  afterAttackBackrowDestroyedText,
  afterAttackDamageAndGrowthText,
  afterAttackLockedTargetLostText,
  findAfterAttackDamageAndGrowthEvents,
  isContinuousReleaseStat,
  negatedActivatedTrapText,
  rewindDamageForHud,
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
    "曜冕裁决者的攻击后效果破坏了攻击宣言时锁定的魔陷「日冕诱锁」。"
  );
  assert.equal(
    afterAttackLockedTargetLostText("曜冕裁决者", "星线护续"),
    "曜冕裁决者锁定的魔陷「星线护续」已提前离场，攻击后效果没有转移到其他魔陷。"
  );
});

test("explains after-attack damage and self growth with exact public values", () => {
  assert.equal(
    afterAttackDamageAndGrowthText("星坠宣告者", 300, 300),
    "星坠宣告者的攻击后效果追加造成 300 点伤害，并使自身攻击力提升 300。"
  );
});

test("pairs effect damage with growth only for the matching after-attack effect", () => {
  const events = [
    { type: "DAMAGE_DEALT", sourceCardId: "star-1", amount: 2400 },
    { type: "DAMAGE_DEALT", sourceCardId: "star-1", amount: 300 },
    { type: "GAME_OVER_DECLARED", sourceCardId: "star-1" },
    { type: "STAT_MODIFIED", sourceCardId: "star-1", cardId: "star-1", stat: "tempAtk", amount: 300 }
  ];
  const starResolution = findAfterAttackDamageAndGrowthEvents(events, {
    attackerId: "star-1",
    effectId: "starDoomCharge"
  });
  assert.equal(starResolution.damageEvent, events[1]);
  assert.equal(starResolution.growEvent, events[3]);

  const ordinaryGrowth = findAfterAttackDamageAndGrowthEvents(events, {
    attackerId: "star-1",
    effectId: "grow200"
  });
  assert.equal(ordinaryGrowth.damageEvent, null);
  assert.equal(ordinaryGrowth.growEvent, events[3]);
});

test("rewinds one resolved damage event for staged HUD feedback without mutating rules state", () => {
  const player = { owner: "player", lp: 0, shield: 0, deck: [], grave: [] };
  const staged = rewindDamageForHud(player, {
    type: "DAMAGE_DEALT",
    playerId: "player",
    amount: 200,
    blocked: 100,
    shieldPierced: 50
  });

  assert.deepEqual(staged, { ...player, lp: 200, shield: 150 });
  assert.deepEqual(player, { owner: "player", lp: 0, shield: 0, deck: [], grave: [] });
  assert.equal(rewindDamageForHud(player, null), player);
  assert.equal(rewindDamageForHud(player, { type: "DAMAGE_DEALT", playerId: "ai", amount: 300 }), player);
});
