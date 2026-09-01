import test from "node:test";
import assert from "node:assert/strict";

import {
  aiMaxDamageThisTurn,
  aiRivalLethalThreat,
  aiSupportZoneReserve,
  aiTrapSetLimit,
  collectAiAttackBlockers,
  chooseAiAfterAttackSupportTarget,
  chooseAiAttackAction,
  chooseAiAttackTarget,
  chooseAiFusionAction,
  chooseAiGodDefenseAction,
  chooseAiTrapResponseAction,
  chooseAiSetTrapAction,
  chooseAiSpellAction,
  chooseAiSummonAction,
  chooseAiTurnGoal,
  shouldSwitchSummonedMonsterToDefense
} from "../src/ai.js";
import { findAiAttackSequence, findAiNextTurnLethalSetup } from "../src/spells.js";

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

test("AI chooses sunflare support targets from public information only", () => {
  const sun = monster({ id: "trio-sun-judicator", afterAttack: "sunflareSunder" });
  const concealedTargets = [
    trap({ id: "mirror-snare", name: "hidden high-value trap" }),
    trap({ id: "guard-sigil", name: "hidden low-value trap" })
  ];

  assert.equal(chooseAiAfterAttackSupportTarget({ attacker: sun, traps: concealedTargets }), 0);
  assert.equal(chooseAiAfterAttackSupportTarget({
    attacker: sun,
    traps: [concealedTargets[0], spell("lunarDominion", { id: "trio-moon-dominion" })]
  }), 1);
  assert.equal(chooseAiAfterAttackSupportTarget({
    attacker: sun,
    traps: [trap({ id: "guard-sigil", uid: "fresh-slot" }), spell("lunarDominion", { id: "trio-moon-dominion" })],
    preferredCardUid: "fresh-slot"
  }), 0, "the latest public slot can be targeted without revealing its trap identity");
  assert.equal(chooseAiAfterAttackSupportTarget({ attacker: monster(), traps: concealedTargets }), -1);
});

test("lookahead computes the AI's maximum damage this turn", () => {
  assert.equal(aiMaxDamageThisTurn({
    attackers: [monster({ name: "lancer", atk: 1800 }), monster({ name: "raider", atk: 1600 })],
    targets: [],
    shield: 0
  }), 3400);
  assert.equal(aiMaxDamageThisTurn({
    attackers: [monster({ name: "god", atk: 3000 })],
    targets: [],
    shield: 800
  }), 2200);
});

test("lookahead estimates the rival lethal threat through a wall", () => {
  const threat = aiRivalLethalThreat({
    rivalField: [monster({ name: "breaker", atk: 3000 }), monster({ name: "raider", atk: 2000 })],
    ownerField: [monster({ name: "wall", mode: "defense", def: 2600 })],
    ownerShield: 0
  });
  assert.equal(threat, 2000);
});

test("rival lethal lookahead includes monsters that ready at the start of their next turn", () => {
  const threat = aiRivalLethalThreat({
    rivalField: [
      monster({ name: "spent breaker", atk: 3000, used: true }),
      monster({ name: "spent raider", atk: 2000, used: true })
    ],
    ownerField: [monster({ name: "wall", mode: "defense", def: 2600 })],
    ownerShield: 0
  });

  assert.equal(threat, 2000);
});

test("attack sequence planner finds a through-monster lethal line", () => {
  const breaker = { atk: 3000, def: 1000, tempAtk: 0, tempDef: 0, mode: "attack" };
  const raider = { atk: 2000, def: 1000, tempAtk: 0, tempDef: 0, mode: "attack" };
  const wall = { atk: 0, def: 2600, tempAtk: 0, tempDef: 0, mode: "defense" };

  const plan = findAiAttackSequence({
    attackers: [breaker, raider],
    targets: [wall],
    shield: 0,
    directAttacks: 0
  });

  assert.equal(plan.damage, 2000);
  assert.equal(plan.moves.length, 2);
  assert.deepEqual(plan.moves[0], { attackerIndex: 0, targetIndex: 0 });
  assert.deepEqual(plan.moves[1], { attackerIndex: 1, targetIndex: -1 });
});

test("attack sequence planner prefers the least-overkill route once the damage goal is reachable", () => {
  const star = monster({
    uid: "star",
    id: "trio-star-herald",
    atk: 2400,
    afterAttack: "starDoomCharge"
  });
  const plan = findAiAttackSequence({
    attackers: [star],
    targets: [
      monster({ uid: "saint", atk: 1000 }),
      monster({ uid: "mage", atk: 1200 })
    ],
    shield: 0,
    directAttacks: 0,
    damageGoal: 1500
  });

  assert.equal(plan.damage, 1500);
  assert.deepEqual(plan.moves, [{ attackerIndex: 0, targetIndex: 1 }]);
});

test("AI picks the first move of a lethal attack sequence", () => {
  const breaker = monster({ name: "breaker", atk: 3000, uid: "b1" });
  const raider = monster({ name: "raider", atk: 2000, uid: "r1" });
  const wall = monster({ name: "wall", mode: "defense", def: 2600, uid: "w1" });

  const action = chooseAiAttackAction({
    owner: { directAttacks: 0, lp: 4000, shield: 0 },
    field: [breaker, raider],
    rivalField: [wall],
    rivalLp: 2000,
    rivalShield: 0,
    aiStyle: "balanced",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.card.uid, "b1");
  assert.equal(action.targetIndex, 0);
});

test("non-scripted AI baits a live attack trap with its weakest monster", () => {
  const strong = monster({ name: "god", atk: 3000, uid: "g1" });
  const weak = monster({ name: "pawn", atk: 600, uid: "p1" });
  const wall = monster({ name: "wall", mode: "defense", def: 400, uid: "w1" });
  const snare = { type: "trap", name: "snare", trigger: "attackDestroy", uid: "s1" };

  const action = chooseAiAttackAction({
    owner: { directAttacks: 0, lp: 4000, shield: 0, traps: [] },
    field: [strong, weak],
    rivalField: [wall],
    rivalTraps: [snare],
    rivalLp: 4000,
    rivalShield: 0,
    aiStyle: "balanced",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.card.uid, "p1");
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

test("scripted pressure AI does not mistake shielded direct damage for lethal", () => {
  const action = chooseAiAttackAction({
    owner: { directAttacks: 1 },
    field: [monster({ uid: "attacker", atk: 3000 })],
    rivalField: [monster({ uid: "target", atk: 1000 })],
    rivalLp: 2000,
    rivalShield: 2000,
    aiStyle: "scriptedPressure",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.targetIndex, 0);
  assert.equal(action.target?.uid, "target");
});

test("scripted pressure AI includes guaranteed after-attack damage in direct lethal planning", () => {
  const action = chooseAiAttackAction({
    owner: { directAttacks: 1 },
    field: [monster({
      uid: "star",
      id: "trio-star-herald",
      atk: 2400,
      afterAttack: "starDoomCharge"
    })],
    rivalField: [monster({ uid: "target", atk: 1000 })],
    rivalLp: 2700,
    rivalShield: 0,
    aiStyle: "scriptedPressure",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.cardUid, "star");
  assert.equal(action.targetIndex, -1);
});

test("scripted pressure AI spends direct permission when follow-up attacks complete lethal", () => {
  const action = chooseAiAttackAction({
    owner: { directAttacks: 1 },
    field: [
      monster({ uid: "sun", id: "trio-sun-judicator", atk: 3000 }),
      monster({
        uid: "star",
        id: "trio-star-herald",
        atk: 2400,
        afterAttack: "starDoomCharge"
      })
    ],
    rivalField: [
      monster({ uid: "target-a", atk: 1000 }),
      monster({ uid: "target-b", atk: 1000 })
    ],
    rivalLp: 4500,
    rivalShield: 0,
    aiStyle: "scriptedPressure",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.cardUid, "sun");
  assert.equal(action.targetIndex, -1);
});

test("scripted pressure AI preserves full after-attack damage when either target completes lethal", () => {
  const action = chooseAiAttackAction({
    owner: { directAttacks: 0 },
    field: [monster({
      uid: "star",
      id: "trio-star-herald",
      atk: 2400,
      afterAttack: "starDoomCharge"
    })],
    rivalField: [
      monster({ uid: "saint", atk: 1000 }),
      monster({ uid: "mage", atk: 1200 })
    ],
    rivalLp: 1500,
    rivalShield: 0,
    aiStyle: "scriptedPressure",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.cardUid, "star");
  assert.equal(action.targetIndex, 1);
  assert.equal(action.target?.uid, "mage");
});

test("AI attacks directly when there are no defending monsters", () => {
  assert.equal(chooseAiAttackTarget({
    attacker: monster({ name: "lancer", atk: 1800 }),
    targets: [],
    playerLp: 4000
  }), -1);
});

test("AI preserves mirror snare when the attacking monster already loses the battle", () => {
  const mirror = trap({ id: "mirror-snare", trigger: "attackDestroy" });
  const defender = monster({ uid: "defender", atk: 2400 });
  const attacker = monster({ uid: "attacker", atk: 900 });

  const action = chooseAiTrapResponseAction({
    candidates: [{ card: mirror, index: 2 }],
    eventName: "attack",
    owner: { field: [defender], lp: 4000 },
    rival: { field: [attacker], lp: 4000 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action, null);
});

test("AI uses mirror snare when it prevents its monster from being destroyed", () => {
  const mirror = trap({ id: "mirror-snare", trigger: "attackDestroy" });
  const defender = monster({ uid: "defender", atk: 1200 });
  const attacker = monster({ uid: "attacker", atk: 2200 });

  const action = chooseAiTrapResponseAction({
    candidates: [{ card: mirror, index: 3 }],
    eventName: "attack",
    owner: { field: [defender], lp: 4000 },
    rival: { field: [attacker], lp: 4000 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action?.type, "activateTrap");
  assert.equal(action?.trapIndex, 3);
  assert.equal(action?.card, mirror);
});

test("AI uses mirror snare against a direct attack", () => {
  const mirror = trap({ id: "mirror-snare", trigger: "attackDestroy" });
  const attacker = monster({ uid: "attacker", atk: 1800 });

  const action = chooseAiTrapResponseAction({
    candidates: [{ card: mirror, index: 1 }],
    eventName: "attack",
    owner: { field: [], lp: 1200 },
    rival: { field: [attacker], lp: 4000 },
    context: { attackerIndex: 0, targetIndex: -1 }
  });

  assert.equal(action?.trapIndex, 1);
  assert.ok(action?.score > 0);
});

test("scripted pressure AI preserves weakening web when the incoming attacker already loses", () => {
  const weakeningWeb = trap({ id: "weakening-web", trigger: "weakenAttack" });
  const defender = monster({ uid: "defender", atk: 2400 });
  const attacker = monster({ uid: "attacker", atk: 900 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: weakeningWeb, index: 0 }],
    eventName: "attack",
    owner: { field: [defender], lp: 4000, shield: 0 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI negates an attack when weakening would not save its target", () => {
  const weakeningWeb = trap({ id: "weakening-web", trigger: "weakenAttack" });
  const voidLock = trap({ id: "void-lock", trigger: "attackNegate" });
  const defender = monster({ uid: "defender", atk: 1200 });
  const attacker = monster({ uid: "attacker", atk: 2200 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [
      { card: weakeningWeb, index: 0 },
      { card: voidLock, index: 1 }
    ],
    eventName: "attack",
    owner: { field: [defender], lp: 4000, shield: 0 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action?.card, voidLock);
  assert.equal(action?.trapIndex, 1);
});

test("scripted pressure AI preserves its only hard negate for a larger ready attacker", () => {
  const voidLock = trap({ id: "void-lock", trigger: "attackNegate" });
  const expendable = monster({ uid: "expendable", atk: 1000 });
  const protectedAce = monster({ uid: "protected-ace", atk: 2600 });
  const currentAttacker = monster({ uid: "current-attacker", atk: 1500 });
  const futureAttacker = monster({ uid: "future-attacker", atk: 3000 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: voidLock, index: 0 }],
    eventName: "attack",
    owner: { field: [expendable, protectedAce], lp: 4000, shield: 0 },
    rival: { field: [currentAttacker, futureAttacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI preserves its only hard negate for a future after-attack lethal", () => {
  const voidLock = trap({ id: "void-lock", trigger: "attackNegate" });
  const firstTarget = monster({ uid: "first-target", atk: 1000 });
  const secondTarget = monster({ uid: "second-target", atk: 1000 });
  const currentAttacker = monster({ uid: "current-attacker", atk: 1500 });
  const futureAttacker = monster({
    uid: "future-attacker",
    id: "trio-star-herald",
    atk: 1500,
    afterAttack: "starDoomCharge"
  });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: voidLock, index: 0 }],
    eventName: "attack",
    owner: { field: [firstTarget, secondTarget], lp: 800, shield: 0 },
    rival: { field: [currentAttacker, futureAttacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI spends its hard negate on a current lethal attack", () => {
  const voidLock = trap({ id: "void-lock", trigger: "attackNegate" });
  const currentTarget = monster({ uid: "current-target", atk: 1000 });
  const futureTarget = monster({ uid: "future-target", atk: 2600 });
  const currentAttacker = monster({ uid: "current-attacker", atk: 1500 });
  const futureAttacker = monster({ uid: "future-attacker", atk: 3000 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: voidLock, index: 0 }],
    eventName: "attack",
    owner: { field: [currentTarget, futureTarget], lp: 500, shield: 0 },
    rival: { field: [currentAttacker, futureAttacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action?.card, voidLock);
  assert.equal(action?.trapIndex, 0);
});

test("scripted pressure AI preserves a negate when its shield already absorbs direct damage", () => {
  const voidLock = trap({ id: "void-lock", trigger: "attackNegate" });
  const attacker = monster({ uid: "attacker", atk: 1800 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: voidLock, index: 1 }],
    eventName: "attack",
    owner: { field: [], lp: 4000, shield: 2000 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: -1 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI preserves direct traps when its shield already absorbs the hit", () => {
  const guard = trap({ id: "guard-sigil", trigger: "directShield" });
  const attacker = monster({ uid: "attacker", atk: 1800 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: guard, index: 0 }],
    eventName: "direct",
    owner: { field: [], lp: 4000, shield: 2000, deck: [monster()] },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: -1 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI uses a direct trap when after-attack damage pierces the remaining shield", () => {
  const guard = trap({ id: "guard-sigil", trigger: "directShield" });
  const attacker = monster({
    uid: "attacker",
    id: "trio-star-herald",
    atk: 2400,
    afterAttack: "starDoomCharge"
  });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: guard, index: 0 }],
    eventName: "direct",
    owner: { field: [], lp: 4000, shield: 2500, deck: [monster()] },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: -1 }
  });

  assert.equal(action?.card, guard);
  assert.equal(action?.trapIndex, 0);
});

test("scripted pressure AI prefers lethal direct rebound over drawing from guard sigil", () => {
  const guard = trap({ id: "guard-sigil", trigger: "directShield" });
  const rebound = trap({ id: "reversal-flare", trigger: "directRebound" });
  const attacker = monster({ uid: "attacker", atk: 1800 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [
      { card: guard, index: 0 },
      { card: rebound, index: 1 }
    ],
    eventName: "direct",
    owner: { field: [], lp: 1200, shield: 0, deck: [monster()] },
    rival: { field: [attacker], lp: 500, shield: 0 },
    context: { attackerIndex: 0, targetIndex: -1 }
  });

  assert.equal(action?.card, rebound);
  assert.equal(action?.trapIndex, 1);
});

test("scripted pressure AI uses weakening web when it reverses the battle outcome", () => {
  const weakeningWeb = trap({ id: "weakening-web", trigger: "weakenAttack" });
  const defender = monster({ uid: "defender", atk: 1600 });
  const attacker = monster({ uid: "attacker", atk: 1900 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: weakeningWeb, index: 2 }],
    eventName: "attack",
    owner: { field: [defender], lp: 4000, shield: 0 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action?.card, weakeningWeb);
  assert.equal(action?.trapIndex, 2);
  assert.ok(action?.score > 0);
});

test("scripted pressure AI rejects a redirect that turns a winning defense into a lost monster", () => {
  const phantomSwitch = trap({ id: "phantom-switch", trigger: "redirectAttack" });
  const currentTarget = monster({ uid: "current", atk: 2400, def: 1000 });
  const redirectTarget = monster({ uid: "redirect", atk: 800, def: 1400, mode: "defense" });
  const attacker = monster({ uid: "attacker", atk: 1900 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: phantomSwitch, index: 0 }],
    eventName: "attack",
    owner: { field: [currentTarget, redirectTarget], lp: 4000, shield: 0 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action, null);
});

test("scripted pressure AI redirects a lethal matchup into a surviving guard", () => {
  const phantomSwitch = trap({ id: "phantom-switch", trigger: "redirectAttack" });
  const currentTarget = monster({ uid: "current", atk: 1200, def: 1000 });
  const redirectTarget = monster({ uid: "redirect", atk: 800, def: 2500, mode: "defense" });
  const attacker = monster({ uid: "attacker", atk: 2200 });

  const action = chooseAiTrapResponseAction({
    aiStyle: "scriptedPressure",
    candidates: [{ card: phantomSwitch, index: 3 }],
    eventName: "attack",
    owner: { field: [currentTarget, redirectTarget], lp: 4000, shield: 0 },
    rival: { field: [attacker], lp: 4000, shield: 0 },
    context: { attackerIndex: 0, targetIndex: 0 }
  });

  assert.equal(action?.card, phantomSwitch);
  assert.equal(action?.trapIndex, 3);
  assert.ok(action?.score > 0);
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

test("scripted pressure AI defers monster investment until after planned trio deployment", () => {
  const chant = spell("buff500", { id: "war-chant" });
  const owner = {
    lp: 4000,
    shield: 0,
    field: [
      monster({ id: "tribute-a", atk: 1800 }),
      monster({ id: "tribute-b", atk: 1400 }),
      monster({ id: "tribute-c", atk: 1000 }),
      null,
      null
    ],
    hand: [chant],
    deck: [],
    traps: [null, null, null, null, null]
  };
  const rival = { lp: 4000, field: [], hand: [], deck: [], traps: [] };

  const beforeSummon = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival,
    aiStyle: "scriptedPressure",
    turnGoal: "deployGod",
    timing: "beforeSummon",
    canActivateSpell: () => true
  });
  const afterSummon = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival,
    aiStyle: "scriptedPressure",
    turnGoal: "protectGods",
    timing: "afterSummon",
    canActivateSpell: () => true
  });

  assert.equal(beforeSummon, null);
  assert.equal(afterSummon?.card, chant);
  assert.equal(afterSummon?.reason, "trioDeploymentFirst");
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

test("next-turn lethal setup breaks the blocking wall before the attack target", () => {
  const breaker = monster({ name: "breaker", atk: 2500, uid: "b1" });
  const chump = monster({ name: "chump", atk: 800, uid: "c1" });
  const wall = monster({ name: "wall", mode: "defense", def: 2400, uid: "w1" });
  const guard = monster({ name: "guard", atk: 1000, uid: "g1" });

  const setup = findAiNextTurnLethalSetup({
    attackers: [breaker, chump],
    targets: [wall, guard],
    shield: 0,
    directAttacks: 0,
    rivalLp: 2300
  });

  assert.ok(setup, "a two-turn lethal line should be recognized");
  assert.equal(setup.targetIndex, 0, "the blocking wall should be broken first");
  assert.ok(setup.total >= 2300);
});

test("next-turn lethal setup stays silent when two turns cannot kill", () => {
  const breaker = monster({ name: "breaker", atk: 2500, uid: "b1" });
  const wall = monster({ name: "wall", mode: "defense", def: 4000, uid: "w1" });

  const setup = findAiNextTurnLethalSetup({
    attackers: [breaker],
    targets: [wall],
    shield: 0,
    directAttacks: 0,
    rivalLp: 2600
  });

  assert.equal(setup, null);
});

test("next-turn lethal setup does not reuse an attacker destroyed in an equal clash", () => {
  const ace = monster({ name: "ace", atk: 2000, uid: "ace" });
  const helper = monster({ name: "helper", atk: 1000, uid: "helper" });
  const equalThreat = monster({ name: "equal threat", atk: 2000, uid: "equal" });
  const weakTarget = monster({ name: "weak target", atk: 500, uid: "weak" });

  const setup = findAiNextTurnLethalSetup({
    attackers: [ace, helper],
    targets: [equalThreat, weakTarget],
    shield: 0,
    directAttacks: 0,
    rivalLp: 2500
  });
  const action = chooseAiAttackAction({
    owner: { directAttacks: 0, lp: 4000, shield: 0, traps: [] },
    field: [ace, helper],
    rivalField: [equalThreat, weakTarget],
    rivalLp: 2500,
    rivalShield: 0,
    aiStyle: "balanced",
    canAttackMonster: () => true
  });

  assert.notEqual(setup?.targetIndex, 0, "the equal clash cannot preserve the ace for next turn");
  assert.equal(action.type, "attack");
  assert.equal(action.card.uid, "ace");
  assert.equal(action.targetIndex, 1, "without a false lethal line the ace should remove the weak target");
});

test("AI prefers the next-turn lethal setup move over a greedy target trade", () => {
  const breaker = monster({ name: "breaker", atk: 2500, uid: "b1" });
  const chump = monster({ name: "chump", atk: 800, uid: "c1" });
  const wall = monster({ name: "wall", mode: "defense", def: 2400, uid: "w1" });
  const guard = monster({ name: "guard", atk: 1000, uid: "g1" });

  const action = chooseAiAttackAction({
    owner: { directAttacks: 0, lp: 4000, shield: 0 },
    field: [breaker, chump],
    rivalField: [wall, guard],
    rivalLp: 2300,
    rivalShield: 0,
    aiStyle: "balanced",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.card.uid, "b1");
  assert.equal(action.targetIndex, 0, "break the wall to open a two-turn lethal instead of trading the guard");
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

test("backrow counter plan prioritizes chain protection over the generic scripted trap order", () => {
  const action = chooseAiSetTrapAction({
    hand: [
      trap({ id: "mirror-snare" }),
      trap({ id: "chain-nullifier" })
    ],
    traps: [null],
    aiStyle: "scriptedPressure",
    counterPlan: { id: "guard-backrow", turnGoal: "guardBackrow" },
    canSetTrap: () => true
  });

  assert.equal(action?.card.id, "chain-nullifier");
  assert.equal(action?.reason, "counterChainProtection");
});

test("scripted pressure AI can fill its available backrow while other styles set once", () => {
  const traps = [null, trap({ id: "set-card" }), null, null, null];

  assert.equal(aiTrapSetLimit({ traps, aiStyle: "scriptedPressure" }), 4);
  assert.equal(aiTrapSetLimit({ traps, aiStyle: "scriptedPressure", reservedZones: 1 }), 3);
  assert.equal(aiTrapSetLimit({ traps, aiStyle: "balanced" }), 1);
  assert.equal(aiTrapSetLimit({ traps: traps.map(() => trap()), aiStyle: "scriptedPressure" }), 0);
});

test("scripted pressure AI reserves a support zone for a deferred trio equipment", () => {
  const owner = {
    lp: 4000,
    field: [monster({ id: "tribute-a" }), monster({ id: "tribute-b" }), monster({ id: "tribute-c" })],
    hand: [spell("equipPrism", { id: "prism-drive" })],
    traps: [null, null, null, null, null]
  };

  assert.equal(aiSupportZoneReserve({
    hand: owner.hand,
    owner,
    rival: { field: [], traps: [] },
    aiStyle: "scriptedPressure",
    turnGoal: "deployGod",
    canActivateSpell: () => true
  }), 1);
  assert.equal(aiSupportZoneReserve({
    hand: owner.hand,
    owner,
    rival: { field: [], traps: [] },
    aiStyle: "scriptedPressure",
    turnGoal: "pressure",
    canActivateSpell: () => true
  }), 0);
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

test("scripted pressure AI distinguishes legal trio deployment from tribute development", () => {
  const field = [
    monster({ id: "material-1" }),
    monster({ id: "material-2" }),
    monster({ id: "material-3" }),
    null,
    null
  ];
  const hand = [
    monster({ id: "trio-sun-judicator", atk: 3000, stars: 7, tributeCost: 3 })
  ];

  assert.equal(chooseAiTurnGoal({
    hand,
    field,
    aiStyle: "scriptedPressure",
    canSummon: () => true
  }), "deployGod");
  assert.equal(chooseAiTurnGoal({
    hand,
    field,
    aiStyle: "balanced",
    canSummon: () => true
  }), "pressure");
  assert.equal(chooseAiTurnGoal({
    hand,
    field: [field[0], field[1], null, null, null],
    aiStyle: "scriptedPressure",
    canSummon: () => false
  }), "buildTributes");
});

test("scripted pressure AI replans lethal, survival, and god protection goals from live state", () => {
  const sun = monster({
    id: "trio-sun-judicator",
    atk: 3000,
    def: 2500,
    stars: 7,
    tributeCost: 3,
    archetype: "三曜神格"
  });
  const quietRival = {
    lp: 4000,
    shield: 0,
    field: [null, null, null, null, null]
  };

  assert.equal(chooseAiTurnGoal({
    owner: { lp: 4000, shield: 0, directAttacks: 0, hand: [], field: [sun, null, null, null, null] },
    rival: { ...quietRival, lp: 2500 },
    aiStyle: "scriptedPressure",
    canSummon: () => false
  }), "lethal");

  assert.equal(chooseAiTurnGoal({
    owner: { lp: 4000, shield: 0, directAttacks: 0, hand: [], field: [sun, null, null, null, null] },
    rival: quietRival,
    aiStyle: "scriptedPressure",
    canSummon: () => false
  }), "protectGods");

  assert.equal(chooseAiTurnGoal({
    owner: { lp: 800, shield: 0, directAttacks: 0, hand: [], field: [sun, null, null, null, null] },
    rival: {
      lp: 4000,
      shield: 0,
      field: [monster({ id: "rival-finisher", atk: 4000 }), null, null, null, null]
    },
    aiStyle: "scriptedPressure",
    canSummon: () => false
  }), "survive");
});

test("scripted boss protects a challenged high-defense god without overriding urgent goals", () => {
  const moon = monster({
    id: "trio-moon-warden",
    name: "moon",
    atk: 2100,
    def: 2500,
    archetype: "三曜神格"
  });
  const rivalThreat = monster({ id: "solar-vanguard", atk: 2300 });
  const counterPlan = { id: "fortify-gods", turnGoal: "protectGods" };

  const action = chooseAiGodDefenseAction({
    field: [moon, null, null, null, null],
    rivalField: [rivalThreat, null, null, null, null],
    aiStyle: "scriptedPressure",
    turnGoal: "protectGods",
    counterPlan,
    canChangeMode: () => true
  });

  assert.equal(action?.card, moon);
  assert.equal(action?.mode, "defense");
  assert.equal(action?.reason, "adaptiveGodGuard");
  assert.equal(chooseAiGodDefenseAction({
    field: [moon],
    rivalField: [rivalThreat],
    aiStyle: "scriptedPressure",
    turnGoal: "lethal",
    counterPlan,
    canChangeMode: () => true
  }), null);
});

test("tribute counter plan can prepare bodies before the next god reaches hand", () => {
  const counterPlan = { id: "rebuild-tributes", turnGoal: "buildTributes" };
  assert.equal(chooseAiTurnGoal({
    owner: {
      lp: 4000,
      shield: 0,
      directAttacks: 0,
      hand: [],
      field: [monster({ id: "nova-squire" }), null, null, null, null]
    },
    rival: { lp: 9000, shield: 0, field: [], traps: [] },
    aiStyle: "scriptedPressure",
    counterPlan,
    canSummon: () => false
  }), "buildTributes");
});

test("phase-three counter plan accelerates offensive spells before defensive support", () => {
  const star = monster({
    id: "trio-star-herald",
    atk: 2400,
    def: 1400,
    archetype: "三曜神格",
    afterAttack: "starDoomCharge"
  });
  const owner = {
    lp: 4000,
    shield: 0,
    directAttacks: 0,
    hand: [spell("shield800", { id: "star-shield" }), spell("battleTrance", { id: "battle-trance" })],
    deck: [],
    field: [star, null, null, null, null],
    traps: [null, null, null, null, null]
  };
  const rival = {
    lp: 2600,
    shield: 0,
    hand: [],
    deck: [],
    field: [monster({ mode: "defense", def: 1900 }), null, null, null, null],
    traps: []
  };
  const counterPlan = { id: "rush-finale", turnGoal: "finishPressure" };
  const turnGoal = chooseAiTurnGoal({
    owner,
    rival,
    aiStyle: "scriptedPressure",
    counterPlan,
    canSummon: () => false
  });
  const action = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival,
    aiStyle: "scriptedPressure",
    turnGoal,
    timing: "beforeSummon",
    canActivateSpell: () => true
  });

  assert.equal(turnGoal, "finishPressure");
  assert.equal(action?.card.id, "battle-trance");
  assert.equal(action?.reason, "finaleAcceleration");
});

test("scripted pressure AI uses split tokens to build tribute bodies for a staged trio summon", () => {
  const sun = monster({ id: "trio-sun-judicator", atk: 3000, stars: 7, tributeCost: 3 });
  const fodder = monster({ id: "nova-squire", atk: 1250, stars: 3 });
  const moon = monster({ id: "trio-moon-warden", atk: 2100, stars: 6, tributeCost: 3 });
  const split = { id: "spark-split", type: "spell", effect: "splitToken", name: "星火分裂" };
  const owner = {
    lp: 4000,
    hand: [moon, split],
    field: [sun, fodder, null, null, null],
    traps: []
  };

  const turnGoal = chooseAiTurnGoal({
    hand: owner.hand,
    field: owner.field,
    aiStyle: "scriptedPressure",
    canSummon: () => false
  });
  const action = chooseAiSpellAction({
    hand: owner.hand,
    owner,
    rival: { lp: 4000, field: [], traps: [] },
    aiStyle: "scriptedPressure",
    turnGoal,
    timing: "beforeSummon",
    canActivateSpell: (card) => card.effect === "splitToken"
  });

  assert.equal(turnGoal, "buildTributes");
  assert.equal(action?.card, split);
  assert.equal(action?.reason, "tributeDevelopment");
});

test("AI selects a complete defensive fusion action when its life is under pressure", () => {
  const fusion = spell("fusionSummon", { id: "starforge-fusion", name: "星魂融合" });
  const ember = monster({ id: "ember-drake", uid: "ember-1", atk: 1400 });
  const gale = monster({ id: "gale-mage", uid: "gale-1", atk: 1200 });
  const attackResult = monster({ id: "flare-gale-archon", uid: "attack-result", atk: 2400, def: 1800 });
  const guardResult = monster({ id: "tempest-aegis-archon", uid: "guard-result", atk: 2000, def: 2600, onSummon: "shield400" });
  const shared = {
    type: "fusion",
    card: fusion,
    cardUid: "fusion-1",
    handIndex: 0,
    materialCardIds: [ember.uid, gale.uid],
    materialZones: ["field", "hand"],
    fieldIndex: 0
  };
  const candidates = [
    { ...shared, fusionResultTemplateId: attackResult.id, resultCard: attackResult },
    { ...shared, fusionResultTemplateId: guardResult.id, resultCard: guardResult }
  ];

  const action = chooseAiFusionAction({
    candidates,
    owner: { lp: 1200, shield: 0, field: [ember, null, null, null, null] },
    rival: { lp: 4000, field: [monster({ atk: 2600 }), null, null, null, null] },
    aiStyle: "scriptedPressure",
    turnGoal: "pressure"
  });

  assert.equal(action?.fusionResultTemplateId, "tempest-aegis-archon");
  assert.deepEqual(action?.materialCardIds, ["ember-1", "gale-1"]);
  assert.equal(action?.fieldIndex, 0);
  assert.equal(action?.reason, "fusionDefense");

  const pressureAction = chooseAiFusionAction({
    candidates,
    owner: { lp: 4000, shield: 0, field: [ember, null, null, null, null] },
    rival: { lp: 4000, field: [monster({ atk: 800 }), null, null, null, null] },
    aiStyle: "scriptedPressure",
    turnGoal: "pressure"
  });
  assert.equal(pressureAction?.fusionResultTemplateId, "flare-gale-archon");
  assert.equal(pressureAction?.reason, "fusionPressure");
});

test("AI only uses fusion for tribute development when it preserves or adds field bodies", () => {
  const fusion = spell("fusionSummon", { id: "starforge-fusion", name: "星魂融合" });
  const resultCard = monster({ id: "flare-gale-archon", uid: "result-1", atk: 2400, def: 1800 });
  const base = {
    type: "fusion",
    card: fusion,
    cardUid: "fusion-1",
    handIndex: 0,
    fusionResultTemplateId: resultCard.id,
    resultCard,
    materialCardIds: ["ember-1", "gale-1"],
    fieldIndex: 0
  };
  const action = chooseAiFusionAction({
    candidates: [
      { ...base, materialZones: ["field", "field"] },
      { ...base, materialZones: ["field", "hand"] }
    ],
    owner: { lp: 4000, shield: 0, field: [monster(), null, null, null, null] },
    rival: { lp: 4000, field: [] },
    aiStyle: "scriptedPressure",
    turnGoal: "buildTributes"
  });

  assert.deepEqual(action?.materialZones, ["field", "hand"]);
  assert.equal(action?.reason, "fusionTributeDevelopment");

  const pressureAction = chooseAiFusionAction({
    candidates: [
      { ...base, materialZones: ["field", "field"] },
      { ...base, materialZones: ["field", "hand"] }
    ],
    owner: { lp: 4000, shield: 0, field: [monster(), monster(), null, null, null] },
    rival: { lp: 4000, field: [] },
    aiStyle: "scriptedPressure",
    turnGoal: "pressure"
  });
  assert.deepEqual(pressureAction?.materialZones, ["field", "hand"]);
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

test("AI attack planner preserves lower attackers by assigning the exclusive high threat first", () => {
  const action = chooseAiAttackAction({
    field: [
      monster({ uid: "sun", id: "trio-sun-judicator", atk: 3000 }),
      monster({ uid: "star", id: "trio-star-herald", atk: 2400 }),
      monster({ uid: "moon", id: "trio-moon-warden", atk: 2100 })
    ],
    rivalField: [
      monster({ uid: "weak", atk: 1000 }),
      monster({ uid: "high-threat", atk: 2800 })
    ],
    rivalLp: 9000,
    aiStyle: "scriptedPressure",
    canAttackMonster: () => true
  });

  assert.equal(action.type, "attack");
  assert.equal(action.cardUid, "sun");
  assert.equal(action.target?.uid, "high-threat");
  assert.equal(action.targetIndex, 1);
});

test("scripted pressure AI uses every unlocked trio attacker in pressure order", () => {
  const field = [
    monster({ uid: "sun", id: "trio-sun-judicator", atk: 3000 }),
    monster({ uid: "moon", id: "trio-moon-warden", atk: 2100 }),
    monster({ uid: "star", id: "trio-star-herald", atk: 2400 })
  ];
  const attackerOrder = [];

  for (let step = 0; step < field.length; step += 1) {
    const action = chooseAiAttackAction({
      field,
      rivalField: [],
      rivalLp: 9000,
      aiStyle: "scriptedPressure",
      canAttackMonster: (card) => !card.used && !card.attackLockReason
    });
    assert.equal(action.type, "attack");
    attackerOrder.push(action.cardUid);
    action.card.used = true;
  }

  assert.deepEqual(attackerOrder, ["sun", "star", "moon"]);
  assert.equal(chooseAiAttackAction({
    field,
    rivalField: [],
    rivalLp: 9000,
    aiStyle: "scriptedPressure",
    canAttackMonster: (card) => !card.used && !card.attackLockReason
  }).type, "none");
});

test("AI attack blockers keep convergence locks visible even when summons are marked used", () => {
  const blockers = collectAiAttackBlockers({
    field: [
      monster({ uid: "sun", id: "trio-sun-judicator", used: true }),
      monster({ uid: "moon", id: "trio-moon-warden", used: true, attackLockReason: "trioConvergence" }),
      monster({ uid: "star", id: "trio-star-herald", used: true, attackLockReason: "trioConvergence" }),
      monster({ uid: "held", used: false })
    ],
    skippedAttackers: new Set(["held"]),
    explainReadiness: (card) => card.used
      ? { ok: false, reason: "already used", engineReason: "Monster already attacked" }
      : { ok: true, reason: "", engineReason: "" }
  });

  assert.deepEqual(blockers.map(({ card }) => card.uid), ["moon", "star"]);
});

test("AI non-spell planners fail closed without engine legality", () => {
  assert.equal(chooseAiSetTrapAction({ hand: [trap()], traps: [null] }), null);
  assert.equal(chooseAiSummonAction({ hand: [monster()], field: [null] }), null);
  assert.equal(chooseAiAttackAction({ field: [monster()], rivalField: [], rivalLp: 4000 }).type, "none");
});
