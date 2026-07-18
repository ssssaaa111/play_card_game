import test from "node:test";
import assert from "node:assert/strict";

import {
  monsterFieldSlotView,
  supportFieldSlotView
} from "../src/field-renderer.js";

function monster(overrides = {}) {
  return {
    id: "star-lancer",
    type: "monster",
    name: "星轨枪兵",
    mode: "attack",
    used: false,
    tempAtk: 0,
    tempDef: 0,
    battleWear: 0,
    ...overrides
  };
}

test("monster field view centralizes attack and selection states", () => {
  const ready = monsterFieldSlotView({
    card: monster({ tempAtk: 300 }),
    owner: "player",
    index: 2,
    state: {
      started: true,
      paused: false,
      gameOver: null,
      turn: "player",
      phase: "battle",
      player: { attacksSkipped: false },
      selected: { zone: "playerField", index: 2 }
    },
    targetable: true,
    attackTargetable: true,
    fusionCandidate: true,
    fusionSelected: true,
    animationKey: "summon-player-2"
  });

  assert.equal(ready.attackReady, true);
  assert.equal(ready.attacksLocked, false);
  assert.equal(ready.materialCandidate, true);
  assert.equal(ready.materialSelected, true);
  assert.equal(ready.animationClass, "summon-flash");
  assert.equal(ready.ariaLabel, "我方召唤区 3");
  assert.ok(ready.slotClasses.includes("attack-target"));
  assert.ok(ready.cardClasses.includes("selected"));
  assert.ok(ready.cardClasses.includes("enhanced"));
  assert.ok(ready.cardClasses.includes("tribute-selected"));
});

test("monster field view locks skipped attacks and disables empty rival slots", () => {
  const locked = monsterFieldSlotView({
    card: monster(),
    owner: "player",
    state: {
      started: true,
      turn: "player",
      phase: "battle",
      player: { attacksSkipped: true }
    }
  });
  const emptyRival = monsterFieldSlotView({
    owner: "ai",
    index: 4,
    state: {}
  });

  assert.equal(locked.attackReady, false);
  assert.equal(locked.attacksLocked, true);
  assert.ok(locked.cardClasses.includes("attack-locked"));
  assert.equal(emptyRival.disabled, true);
  assert.equal(emptyRival.ariaLabel, "敌方召唤区 5");
});

test("support field view exposes player state while keeping rival cards concealed", () => {
  const card = {
    id: "mirror-snare",
    type: "trap",
    name: "镜光反制",
    text: "破坏攻击怪兽。",
    trigger: "destroyAttacker"
  };
  const player = supportFieldSlotView({
    card,
    owner: "player",
    index: 1,
    trapChoiceReady: true,
    trapChoiceSelected: true
  });
  const rival = supportFieldSlotView({
    card,
    owner: "ai",
    index: 1
  });

  assert.equal(player.supportDisplay.key, "selected");
  assert.match(player.ariaLabel, /镜光反制/);
  assert.ok(player.slotClasses.includes("trap-response-selected"));
  assert.ok(player.cardClasses.includes("support-selected"));
  assert.equal(rival.supportDisplay, null);
  assert.equal(rival.ariaLabel, "敌方魔陷区 2，盖放卡牌");
});
