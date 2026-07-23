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
    targetSelected: true,
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
  assert.equal(ready.ariaLabel, "我方召唤区 3，已选择为魔法目标");
  assert.ok(ready.slotClasses.includes("attack-target"));
  assert.ok(ready.slotClasses.includes("target-selected"));
  assert.ok(ready.cardClasses.includes("selected"));
  assert.ok(ready.cardClasses.includes("target-selected"));
  assert.match(ready.ariaLabel, /已选择为魔法目标/);
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

test("monster field view exposes convergence locks on either side", () => {
  const converged = monsterFieldSlotView({
    card: monster({ used: true, attackLockReason: "trioConvergence" }),
    owner: "ai",
    state: {
      started: true,
      turn: "ai",
      phase: "battle",
      ai: { attacksSkipped: false }
    }
  });

  assert.equal(converged.attacksLocked, true);
  assert.equal(converged.attackReady, false);
  assert.ok(converged.cardClasses.includes("attack-locked"));
});

test("mechanics targets expose candidate and failure reasons through field views", () => {
  const fusion = monsterFieldSlotView({
    card: monster({ name: "赤焰幼龙" }),
    owner: "player",
    materialKind: "fusion",
    materialTarget: {
      ok: true,
      reason: "可选择「赤焰幼龙」作为融合素材。"
    }
  });
  assert.ok(fusion.slotClasses.includes("fusion-candidate"));
  assert.equal(fusion.materialState, "candidate");
  assert.match(fusion.ariaLabel, /可选择「赤焰幼龙」/);

  const enemySplit = monsterFieldSlotView({
    card: null,
    owner: "ai",
    index: 1,
    splitTarget: {
      ok: false,
      reason: "不能选择该来源：不是己方怪兽。"
    }
  });
  assert.equal(enemySplit.disabled, false);
  assert.ok(enemySplit.slotClasses.includes("split-unavailable"));
  assert.equal(enemySplit.targetState, "unavailable");
  assert.equal(enemySplit.targetReason, "不能选择该来源：不是己方怪兽。");
});

test("spell targets expose legal and unavailable field choices with exact reasons", () => {
  const legal = monsterFieldSlotView({
    card: monster({ name: "星轨枪兵" }),
    owner: "player",
    index: 0,
    targetable: true,
    spellTarget: { ok: true }
  });
  const unavailable = monsterFieldSlotView({
    card: monster({ name: "赤焰幼龙" }),
    owner: "player",
    index: 1,
    spellTarget: {
      ok: false,
      reason: "战意高扬只能选择我方攻击力最高的怪兽：星轨枪兵。"
    }
  });

  assert.equal(legal.effectTargetState, "legal");
  assert.equal(legal.effectTargetLabel, "");
  assert.ok(legal.slotClasses.includes("targetable"));
  assert.doesNotMatch(legal.ariaLabel, /undefined/);
  assert.equal(unavailable.effectTargetState, "unavailable");
  assert.equal(unavailable.effectTargetReason, "战意高扬只能选择我方攻击力最高的怪兽：星轨枪兵。");
  assert.equal(unavailable.title, unavailable.effectTargetReason);
  assert.ok(unavailable.slotClasses.includes("effect-target-unavailable"));
  assert.ok(unavailable.cardClasses.includes("effect-target-unavailable"));
  assert.match(unavailable.ariaLabel, /战意高扬只能选择我方攻击力最高的怪兽/);
});

test("support field view reveals active spells while keeping rival traps concealed", () => {
  const trap = {
    id: "mirror-snare",
    type: "trap",
    name: "镜光反制",
    text: "破坏攻击怪兽。",
    trigger: "destroyAttacker"
  };
  const player = supportFieldSlotView({
    card: trap,
    owner: "player",
    index: 1,
    trapChoiceReady: true,
    trapChoiceSelected: true
  });
  const rivalTrap = supportFieldSlotView({
    card: trap,
    owner: "ai",
    index: 1
  });
  const rivalSpell = supportFieldSlotView({
    card: {
      id: "trio-moon-dominion",
      type: "spell",
      name: "月曜帷幕",
      text: "持续降低目标攻击力和守备力。",
      effect: "lunarDominion"
    },
    owner: "ai",
    index: 2
  });
  const selectedRivalSpell = supportFieldSlotView({
    card: rivalSpell.supportDisplay ? {
      id: "trio-moon-dominion",
      type: "spell",
      name: "月曜帷幕",
      text: "持续降低目标攻击力和守备力。",
      effect: "lunarDominion"
    } : null,
    owner: "ai",
    index: 2,
    targetable: true,
    targetSelected: true
  });

  assert.equal(player.supportDisplay.key, "selected");
  assert.equal(player.revealed, true);
  assert.match(player.ariaLabel, /镜光反制/);
  assert.ok(player.slotClasses.includes("trap-response-selected"));
  assert.ok(player.cardClasses.includes("support-selected"));
  assert.equal(rivalTrap.revealed, false);
  assert.equal(rivalTrap.supportDisplay, null);
  assert.equal(rivalTrap.ariaLabel, "敌方魔陷区 2，盖放卡牌");
  assert.equal(rivalSpell.revealed, true);
  assert.equal(rivalSpell.supportDisplay.key, "active");
  assert.match(rivalSpell.ariaLabel, /月曜帷幕/);
  assert.match(rivalSpell.ariaLabel, /持续魔法生效中/);
  assert.ok(selectedRivalSpell.slotClasses.includes("target-selected"));
  assert.ok(selectedRivalSpell.cardClasses.includes("target-selected"));
  assert.match(selectedRivalSpell.ariaLabel, /已选择为魔法目标/);
});

test("monster field view follows projected attack legality instead of guessing from phase", () => {
  const mainReady = monsterFieldSlotView({
    card: monster(),
    owner: "player",
    state: {
      started: true,
      paused: false,
      gameOver: null,
      turn: "player",
      phase: "main",
      actionWindow: "main",
      player: { attacksSkipped: false }
    },
    attackReadiness: { ok: true, reason: "" }
  });
  const resolving = monsterFieldSlotView({
    card: monster(),
    owner: "player",
    state: {
      started: true,
      paused: false,
      gameOver: null,
      turn: "player",
      phase: "battle",
      actionWindow: "resolution",
      player: { attacksSkipped: false }
    },
    attackReadiness: { ok: false, reason: "当前正在结算，暂时不能攻击。" }
  });

  assert.equal(mainReady.attackReady, true);
  assert.ok(mainReady.cardClasses.includes("attack-ready"));
  assert.equal(resolving.attackReady, false);
  assert.ok(!resolving.cardClasses.includes("attack-ready"));
  assert.equal(resolving.attackReason, "当前正在结算，暂时不能攻击。");
});
