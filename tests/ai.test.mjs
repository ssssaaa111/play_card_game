import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseAiAttackAction,
  chooseAiAttackTarget,
  chooseAiSetTrapAction,
  chooseAiSpellAction,
  chooseAiSummonAction,
  shouldSwitchSummonedMonsterToDefense
} from "../src/ai.js";

function monster(overrides = {}) {
  return {
    type: "monster",
    name: "test monster",
    atk: 1000,
    def: 1000,
    tempAtk: 0,
    tempDef: 0,
    mode: "attack",
    ...overrides
  };
}

function spell(effect, overrides = {}) {
  return {
    type: "spell",
    name: effect,
    effect,
    ...overrides
  };
}

function trap(overrides = {}) {
  return {
    type: "trap",
    name: "trap",
    trigger: "attackNegate",
    ...overrides
  };
}

test("AI attacks a beatable guard instead of a stronger defense target", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [
      monster({ name: "beatable guard", mode: "defense", def: 1400 }),
      monster({ name: "wall", mode: "defense", def: 2100 })
    ],
    playerLp: 4000
  });

  assert.equal(target, 0);
});

test("AI skips attacks that would only cost LP into stronger defense", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [
      monster({ name: "wall", mode: "defense", def: 2100 })
    ],
    playerLp: 4000
  });

  assert.equal(target, null);
});

test("AI skips equal defense targets because they only consume attacks", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [
      monster({ name: "equal guard", mode: "defense", def: 1800 })
    ],
    playerLp: 4000
  });

  assert.equal(target, null);
});

test("AI still accepts equal attack targets as a trade", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [
      monster({ name: "equal attacker", mode: "attack", atk: 1800 })
    ],
    playerLp: 4000
  });

  assert.equal(target, 0);
});

test("AI uses direct attack permission when the board blocks normal attacks", () => {
  const target = chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [
      monster({ name: "wall", mode: "defense", def: 2100 })
    ],
    playerLp: 4000,
    canUseDirect: true
  });

  assert.equal(target, -1);
});

test("AI attacks directly when there are no defending monsters", () => {
  assert.equal(chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [],
    playerLp: 4000
  }), -1);
});

test("AI spell planner picks the highest legal scored spell", () => {
  const owner = {
    lp: 4000,
    shield: 0,
    field: [],
    hand: [
      spell("heal700"),
      spell("burn500"),
      spell("draw2")
    ],
    deck: [monster(), monster()]
  };
  const rival = { lp: 800, field: [], hand: [], deck: [] };

  const action = chooseAiSpellAction({ hand: owner.hand, owner, rival, aiStyle: "aggressive" });

  assert.equal(action.type, "spell");
  assert.equal(action.handIndex, 1);
  assert.equal(action.card.effect, "burn500");
});

test("AI trap planner returns the first hand trap and first empty trap zone", () => {
  const action = chooseAiSetTrapAction({
    hand: [monster(), trap({ id: "mirror" })],
    traps: [trap({ id: "filled" }), null, null]
  });

  assert.deepEqual({
    type: action.type,
    handIndex: action.handIndex,
    trapIndex: action.trapIndex,
    id: action.card.id
  }, {
    type: "setTrap",
    handIndex: 1,
    trapIndex: 1,
    id: "mirror"
  });
});

test("AI summon planner chooses the best monster for its style", () => {
  const action = chooseAiSummonAction({
    hand: [
      monster({ name: "small", atk: 1000, stars: 1 }),
      monster({ name: "ace", atk: 1900, stars: 4 })
    ],
    field: [null, null, null],
    aiStyle: "aggressive"
  });

  assert.equal(action.type, "summon");
  assert.equal(action.handIndex, 1);
  assert.equal(action.fieldIndex, 0);
});

test("AI defense switch policy is explicit", () => {
  assert.equal(shouldSwitchSummonedMonsterToDefense({
    monster: monster({ atk: 800, def: 1800 }),
    ownerLp: 2000,
    rivalLp: 4000
  }), true);
  assert.equal(shouldSwitchSummonedMonsterToDefense({
    monster: monster({ atk: 1800, def: 1000 }),
    ownerLp: 4000,
    rivalLp: 2000,
    aiStyle: "control"
  }), true);
});

test("AI attack planner emits command objects and skip decisions", () => {
  const attacker = monster({ uid: "attacker", atk: 1800 });
  const skip = chooseAiAttackAction({
    field: [attacker],
    rivalField: [monster({ mode: "defense", def: 2200 })],
    rivalLp: 4000
  });
  assert.equal(skip.type, "skipAttack");
  assert.equal(skip.cardUid, "attacker");

  const attack = chooseAiAttackAction({
    field: [attacker],
    rivalField: [monster({ mode: "attack", atk: 1200 })],
    rivalLp: 4000
  });
  assert.equal(attack.type, "attack");
  assert.equal(attack.attackerIndex, 0);
  assert.equal(attack.targetIndex, 0);
});
