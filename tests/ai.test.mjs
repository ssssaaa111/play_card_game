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

  const action = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival,
    aiStyle: "aggressive",
    canActivateSpell: () => true
  });

  assert.equal(action.type, "spell");
  assert.equal(action.handIndex, 1);
  assert.equal(action.card.effect, "burn500");
});

test("AI spell planner uses the caller's engine legality instead of duplicate spell conditions", () => {
  const owner = {
    lp: 4000,
    shield: 0,
    field: [],
    hand: [spell("burn500"), spell("draw2")],
    deck: [monster(), monster()]
  };
  const rival = { lp: 800, field: [], hand: [], deck: [] };
  const checked = [];

  const action = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival,
    aiStyle: "aggressive",
    minScore: 0,
    canActivateSpell: (card, handIndex) => {
      checked.push([card.effect, handIndex]);
      return handIndex === 1;
    }
  });

  assert.deepEqual(checked, [["burn500", 0], ["draw2", 1]]);
  assert.equal(action.handIndex, 1);
  assert.equal(action.card.effect, "draw2");
});

test("AI spell planner fails closed when engine legality is not provided", () => {
  const owner = {
    lp: 4000,
    shield: 0,
    field: [],
    hand: [spell("burn500")],
    deck: []
  };
  const rival = { lp: 800, field: [], hand: [], deck: [] };

  assert.equal(chooseAiSpellAction({ hand: owner.hand, owner, rival, minScore: 0 }), null);
});

test("AI trap planner returns the first hand trap and first empty trap zone", () => {
  const action = chooseAiSetTrapAction({
    hand: [monster(), trap({ id: "mirror" })],
    traps: [trap({ id: "filled" }), null, null],
    canSetTrap: () => true
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

test("AI trap planner filters candidates through engine legality", () => {
  const checked = [];
  const action = chooseAiSetTrapAction({
    hand: [trap({ id: "mirror-snare" }), trap({ id: "chain-nullifier" })],
    traps: [null, null, null],
    aiStyle: "scriptedPressure",
    canSetTrap: (card, handIndex, trapIndex) => {
      checked.push([card.id, handIndex, trapIndex]);
      return card.id === "chain-nullifier";
    }
  });

  assert.deepEqual(checked, [
    ["mirror-snare", 0, 0],
    ["chain-nullifier", 1, 0]
  ]);
  assert.equal(action.card.id, "chain-nullifier");
  assert.equal(action.handIndex, 1);
});

test("scripted pressure AI protects trio pressure before generic traps", () => {
  const action = chooseAiSetTrapAction({
    hand: [
      trap({ id: "guard-sigil" }),
      trap({ id: "mirror-snare" }),
      trap({ id: "chain-nullifier" })
    ],
    traps: [null, null, null],
    aiStyle: "scriptedPressure",
    canSetTrap: () => true
  });

  assert.equal(action.type, "setTrap");
  assert.equal(action.handIndex, 1);
  assert.equal(action.card.id, "mirror-snare");
});

test("AI summon planner chooses the best monster for its style", () => {
  const action = chooseAiSummonAction({
    hand: [
      monster({ name: "small", atk: 1000, stars: 1 }),
      monster({ name: "ace", atk: 1900, stars: 4 })
    ],
    field: [null, null, null],
    aiStyle: "aggressive",
    canSummon: () => true
  });

  assert.equal(action.type, "summon");
  assert.equal(action.handIndex, 1);
  assert.equal(action.fieldIndex, 0);
});

test("AI summon planner skips a higher-scored candidate rejected by engine legality", () => {
  const checked = [];
  const action = chooseAiSummonAction({
    hand: [
      monster({ id: "small", name: "small", atk: 1000, stars: 1 }),
      monster({ id: "ace", name: "ace", atk: 1900, stars: 4 })
    ],
    field: [null, null, null],
    aiStyle: "aggressive",
    canSummon: (card, handIndex, options) => {
      checked.push([card.id, handIndex, options.fieldIndex, options.tributeIndexes]);
      return card.id === "small";
    }
  });

  assert.deepEqual(checked, [
    ["small", 0, 0, []],
    ["ace", 1, 0, []]
  ]);
  assert.equal(action.card.id, "small");
  assert.equal(action.handIndex, 0);
});

test("scripted pressure AI prioritizes trio pressure bodies over raw generic attack", () => {
  const action = chooseAiSummonAction({
    hand: [
      monster({ id: "flare-titan", name: "generic", atk: 2200, def: 1400, stars: 5 }),
      monster({ id: "trio-moon-warden", name: "moon", atk: 2100, def: 2600, stars: 6 })
    ],
    field: [null, null, null],
    aiStyle: "scriptedPressure",
    canSummon: () => true
  });

  assert.equal(action.type, "summon");
  assert.equal(action.handIndex, 1);
  assert.equal(action.card.id, "trio-moon-warden");
});

test("AI summon planner skips high-level monsters when tribute material is insufficient", () => {
  const action = chooseAiSummonAction({
    hand: [
      monster({ id: "trio-sun-judicator", name: "sun", atk: 3000, stars: 7, tributeCost: 3 }),
      monster({ id: "star-lancer", name: "lancer", atk: 1800, stars: 4 })
    ],
    field: [monster({ id: "material-1" }), null, null, null, null],
    aiStyle: "scriptedPressure",
    canSummon: () => true
  });

  assert.equal(action.card.id, "star-lancer");
  assert.equal(action.tributeCost, 0);
  assert.equal(action.fieldIndex, 1);
});

test("AI summon planner can choose a three-tribute god and reuse a full tribute slot", () => {
  const action = chooseAiSummonAction({
    hand: [monster({ id: "trio-sun-judicator", name: "sun", atk: 3000, stars: 7, tributeCost: 3 })],
    field: [
      monster({ id: "material-1" }),
      monster({ id: "material-2" }),
      monster({ id: "material-3" }),
      monster({ id: "material-4" }),
      monster({ id: "material-5" })
    ],
    aiStyle: "scriptedPressure",
    canSummon: () => true
  });

  assert.equal(action.card.id, "trio-sun-judicator");
  assert.equal(action.tributeCost, 3);
  assert.equal(action.fieldIndex, 0);
  assert.deepEqual(action.tributeIndexes, [0, 1, 2]);
});

test("scripted pressure AI never tributes an established trio god for a generic monster", () => {
  const action = chooseAiSummonAction({
    hand: [monster({ id: "void-siege-breaker", name: "breaker", atk: 2600, stars: 5, tributeCost: 1 })],
    field: [
      monster({ id: "trio-sun-judicator", name: "sun", atk: 3000, stars: 7, archetype: "三曜神格" }),
      null,
      null,
      null,
      null
    ],
    aiStyle: "scriptedPressure",
    canSummon: () => true
  });

  assert.equal(action, null);
});

test("scripted pressure AI selects ordinary bodies before trio gods as tribute", () => {
  const action = chooseAiSummonAction({
    hand: [monster({ id: "void-siege-breaker", name: "breaker", atk: 2600, stars: 5, tributeCost: 1 })],
    field: [
      monster({ id: "trio-moon-warden", name: "moon", atk: 2100, stars: 6, archetype: "三曜神格" }),
      monster({ id: "material-1", name: "material", atk: 1000, stars: 3 }),
      null,
      null,
      null
    ],
    aiStyle: "scriptedPressure",
    canSummon: () => true
  });

  assert.deepEqual(action.tributeIndexes, [1]);
  assert.equal(action.fieldIndex, 2);
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
    rivalLp: 4000,
    canAttackMonster: () => true
  });
  assert.equal(skip.type, "skipAttack");
  assert.equal(skip.cardUid, "attacker");

  const attack = chooseAiAttackAction({
    field: [attacker],
    rivalField: [monster({ mode: "attack", atk: 1200 })],
    rivalLp: 4000,
    canAttackMonster: () => true
  });
  assert.equal(attack.type, "attack");
  assert.equal(attack.attackerIndex, 0);
  assert.equal(attack.targetIndex, 0);
});

test("AI attack planner ignores a stronger attacker rejected by engine legality", () => {
  const locked = monster({ uid: "locked", name: "locked", atk: 3000, attackLockReason: "trioConvergence" });
  const ready = monster({ uid: "ready", name: "ready", atk: 1200 });
  const checked = [];

  const action = chooseAiAttackAction({
    field: [locked, ready],
    rivalField: [],
    rivalLp: 4000,
    canAttackMonster: (card, fieldIndex) => {
      checked.push([card.uid, fieldIndex]);
      return !card.attackLockReason;
    }
  });

  assert.deepEqual(checked, [["locked", 0], ["ready", 1]]);
  assert.equal(action.type, "attack");
  assert.equal(action.cardUid, "ready");
  assert.equal(action.attackerIndex, 1);
  assert.equal(action.targetIndex, -1);
});

test("AI non-spell planners fail closed without engine legality", () => {
  assert.equal(chooseAiSetTrapAction({ hand: [trap()], traps: [null] }), null);
  assert.equal(chooseAiSummonAction({ hand: [monster()], field: [null] }), null);
  assert.equal(chooseAiAttackAction({ field: [monster()], rivalField: [], rivalLp: 4000 }).type, "none");
});
