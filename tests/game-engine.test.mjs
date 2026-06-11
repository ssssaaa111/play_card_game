import test from "node:test";
import assert from "node:assert/strict";

import {
  Ability,
  EffectDuration,
  GameEngine,
  GameRuleError,
  GameStateValidationError,
  Phase,
  ResponseWindow,
  Timing,
  applyGameEvent,
  assertValidGameState,
  getCardEffectDefinition,
  hasAbility
} from "../src/game-engine.js";
import { FIELD_SIZE, MAX_LP } from "../src/rules.js";

const PLAYER = "player";
const AI = "ai";

function basePlayer(overrides = {}) {
  return {
    id: PLAYER,
    lp: MAX_LP,
    deck: [],
    hand: [],
    monsterZone: [],
    spellTrapZone: [],
    grave: [],
    banished: [],
    ...overrides
  };
}

function baseAi(overrides = {}) {
  return {
    ...basePlayer({ id: AI }),
    ...overrides
  };
}

function card(id, overrides = {}) {
  return {
    id,
    templateId: id,
    ownerId: PLAYER,
    type: "spell",
    name: id,
    ...overrides
  };
}

function makeState({ cards = [], player = {}, ai = {}, turn = {} } = {}) {
  return {
    cards: Object.fromEntries(cards.map((entry) => [entry.id, entry])),
    players: {
      [PLAYER]: basePlayer(player),
      [AI]: baseAi(ai)
    },
    turn: {
      playerId: PLAYER,
      phase: Phase.main,
      ...turn
    },
    machine: {
      phase: turn.phase || Phase.main,
      timing: Timing.mainOpen,
      responseWindow: null,
      chain: []
    },
    abilities: {
      [PLAYER]: [],
      [AI]: []
    },
    events: [],
    nextEventId: 1
  };
}

test("seer-call draws two cards only through dispatch and logs events", () => {
  const state = makeState({
    cards: [
      card("seer-1", { templateId: "seer-call", effect: "draw2" }),
      card("deck-1", { type: "monster", templateId: "ember-drake" }),
      card("deck-2", { type: "monster", templateId: "solar-knight" })
    ],
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, ["deck-1", "deck-2"]);
  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.deepEqual(next.players[PLAYER].grave, ["seer-1"]);
  assert.ok(events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "seer-1"));
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.count === 2));
  assertValidGameState(next);
});

test("spell activation is legal in battle phase action windows", () => {
  const state = makeState({
    cards: [
      card("seer-battle", { templateId: "seer-call", effect: "draw2" }),
      card("deck-battle-1", { type: "monster", templateId: "ember-drake" }),
      card("deck-battle-2", { type: "monster", templateId: "solar-knight" })
    ],
    player: {
      hand: ["seer-battle"],
      deck: ["deck-battle-1", "deck-battle-2"]
    },
    turn: {
      phase: Phase.battle
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-battle" });

  assert.deepEqual(engine.getState().players[PLAYER].hand, ["deck-battle-1", "deck-battle-2"]);
  assert.ok(events.some((event) => event.type === "CARD_ACTIVATED" && event.phase === Phase.battle));
});

test("dispatch records commands before derived events", () => {
  const state = makeState({
    cards: [
      card("seer-1", { templateId: "seer-call", effect: "draw2" }),
      card("deck-1", { type: "monster", templateId: "ember-drake" }),
      card("deck-2", { type: "monster", templateId: "solar-knight" })
    ],
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-1" });

  assert.equal(events[0].type, "COMMAND_DISPATCHED");
  assert.equal(events[0].commandType, "ACTIVATE_CARD");
  assert.equal(events[0].playerId, PLAYER);
  assert.ok(events.some((event) => event.type === "CARD_MOVED" && event.cardId === "seer-1"));
});

test("default card effects are declarative one-shot DSL definitions", () => {
  const draw2 = getCardEffectDefinition("draw2");
  const draw1 = getCardEffectDefinition("draw1");
  const burn200 = getCardEffectDefinition("burn200");
  const fireBuff = getCardEffectDefinition("fireBuff");
  const burn500 = getCardEffectDefinition("burn500");
  const heal300 = getCardEffectDefinition("heal300");
  const shield400 = getCardEffectDefinition("shield400");
  const shadowBurn = getCardEffectDefinition("shadowBurn");
  const heal700 = getCardEffectDefinition("heal700");
  const attackDestroy = getCardEffectDefinition("attackDestroy");
  const counterBoost = getCardEffectDefinition("counterBoost");
  const attackShift = getCardEffectDefinition("attackShift");
  const attackNegate = getCardEffectDefinition("attackNegate");
  const redirectAttack = getCardEffectDefinition("redirectAttack");
  const weakenAttack = getCardEffectDefinition("weakenAttack");
  const directShield = getCardEffectDefinition("directShield");
  const directRebound = getCardEffectDefinition("directRebound");
  const summonBurn = getCardEffectDefinition("summonBurn");
  const directStrike = getCardEffectDefinition("directStrike");
  const extraSummon = getCardEffectDefinition("extraSummon");
  const shield800 = getCardEffectDefinition("shield800");
  const graveReturn = getCardEffectDefinition("graveReturn");
  const rallyAttack = getCardEffectDefinition("rallyAttack");
  const battleTrance = getCardEffectDefinition("battleTrance");
  const lightShadowCombo = getCardEffectDefinition("lightShadowCombo");
  const elementEcho = getCardEffectDefinition("elementEcho");
  const fireWindCombo = getCardEffectDefinition("fireWindCombo");

  assert.equal(draw2.duration, EffectDuration.oneShot);
  assert.deepEqual(draw1.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(draw2.operations, [{ op: "drawCards", player: "self", count: 2 }]);
  assert.deepEqual(burn200.operations, [{ op: "dealDamage", player: "rival", amount: 200 }]);
  assert.deepEqual(fireBuff.operations, [
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "strongestAtk" }, stat: "tempAtk", amount: 300 }
  ]);
  assert.deepEqual(burn500.operations, [{ op: "dealDamage", player: "rival", amount: 500 }]);
  assert.deepEqual(heal300.operations, [{ op: "heal", player: "self", amount: 300 }]);
  assert.deepEqual(shield400.operations, [{ op: "gainShield", player: "self", amount: 400 }]);
  assert.deepEqual(shadowBurn.operations, [{ op: "dealDamage", player: "rival", amount: 300 }]);
  assert.deepEqual(heal700.operations, [{ op: "heal", player: "self", amount: 700 }]);
  assert.deepEqual(attackDestroy.operations, [{ op: "destroyCard", cardId: "$action.attackerCardId" }]);
  assert.deepEqual(counterBoost.operations, [
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" }, stat: "tempAtk", amount: 400 }
  ]);
  assert.deepEqual(attackShift.operations, [{ op: "gainShield", player: "self", amount: 400 }]);
  assert.deepEqual(attackNegate.operations, [{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }]);
  assert.deepEqual(redirectAttack.operations, []);
  assert.deepEqual(weakenAttack.operations, [
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempDef", amount: -500 }
  ]);
  assert.deepEqual(directShield.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(directRebound.operations, [{ op: "dealDamage", player: "rival", amount: 500 }]);
  assert.deepEqual(summonBurn.operations, [{ op: "dealDamage", player: "rival", amount: 400 }]);
  assert.deepEqual(directStrike.operations, [{ op: "grantAbility", player: "self", ability: Ability.directAttack, uses: 1, duration: "turn" }]);
  assert.deepEqual(extraSummon.operations, [{ op: "grantAbility", player: "self", ability: Ability.extraSummon, uses: 1, duration: "turn" }]);
  assert.deepEqual(shield800.operations, [{ op: "gainShield", player: "self", amount: 800 }]);
  assert.deepEqual(graveReturn.operations, [
    {
      op: "moveCard",
      cardId: "$action.targetCardId",
      from: { playerId: "$action.playerId", zone: "grave" },
      to: { playerId: "$action.playerId", zone: "deck", index: 0 }
    },
    { op: "drawCards", player: "self", count: 1 }
  ]);
  assert.deepEqual(rallyAttack.operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 },
    {
      op: "readyMonsterOrGrantAbility",
      player: "self",
      cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "firstUsed" },
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn"
    }
  ]);
  assert.deepEqual(battleTrance.operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
    {
      op: "readyMonsterOrGrantAbility",
      player: "self",
      cardId: "$action.targetCardId",
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn"
    }
  ]);
  assert.deepEqual(lightShadowCombo.operations, [
    { op: "gainShield", player: "self", amount: 600 },
    { op: "drawCards", player: "self", count: 1 }
  ]);
  assert.deepEqual(elementEcho.requirements, [
    { type: "minDistinctElements", player: "self", count: 2 }
  ]);
  assert.deepEqual(elementEcho.operations, [
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 200 },
    { op: "drawCards", player: "self", count: 1 }
  ]);
  assert.deepEqual(fireWindCombo.requirements, [
    { type: "requiredElements", player: "self", elements: ["fire", "wind"] }
  ]);
  assert.deepEqual(fireWindCombo.operations, [
    { op: "dealDamage", player: "rival", amount: 400 },
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 200 }
  ]);
  assert.notEqual(typeof draw2, "function");
});

test("engine rejects free-code effects and keeps continuous effects separate", () => {
  assert.throws(
    () => new GameEngine(makeState(), { cardEffects: { cheat: () => null } }),
    GameRuleError
  );

  const state = makeState({
    cards: [card("aura-1", { templateId: "aura-test", effect: "continuousAura" })],
    player: { hand: ["aura-1"] }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      continuousAura: {
        duration: EffectDuration.continuous,
        operations: []
      }
    }
  });

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "aura-1" }),
    GameRuleError
  );
});

test("burst-rune deals damage and renewal heals with max LP cap", () => {
  const state = makeState({
    cards: [
      card("burst-1", { templateId: "burst-rune", effect: "burn500" }),
      card("renewal-1", { templateId: "renewal", effect: "heal700" })
    ],
    player: {
      lp: 3600,
      hand: ["burst-1", "renewal-1"]
    }
  });

  const engine = new GameEngine(state);
  const burnEvents = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "burst-1" });
  const healEvents = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "renewal-1" });
  const next = engine.getState();

  assert.equal(next.players[AI].lp, 3500);
  assert.equal(next.players[PLAYER].lp, MAX_LP);
  assert.deepEqual(next.players[PLAYER].grave, ["burst-1", "renewal-1"]);
  assert.ok(burnEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 500 && event.playerId === AI));
  assert.ok(healEvents.some((event) => event.type === "LP_HEALED" && event.amount === 400 && event.playerId === PLAYER));
});

test("damage events consume shield before LP", () => {
  const state = makeState({
    cards: [
      card("burst-shield", { templateId: "burst-rune", effect: "burn500" })
    ],
    player: {
      hand: ["burst-shield"]
    },
    ai: {
      shield: 300
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "burst-shield" });
  const next = engine.getState();

  assert.equal(next.players[AI].shield, 0);
  assert.equal(next.players[AI].lp, 3800);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === AI &&
    event.requested === 500 &&
    event.blocked === 300 &&
    event.amount === 200
  ));
});

test("war-chant modifies only the declared target through dispatch events", () => {
  const state = makeState({
    cards: [
      card("chant-1", { templateId: "war-chant", effect: "buff500" }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("drake-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 })
    ],
    player: {
      hand: ["chant-1"],
      monsterZone: ["lancer-1", "drake-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "chant-1",
    targetCardId: "lancer-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["lancer-1"].tempAtk, 500);
  assert.equal(next.cards["drake-1"].tempAtk || 0, 0);
  assert.deepEqual(next.players[PLAYER].grave, ["chant-1"]);
  assert.ok(events.some((event) => event.type === "STAT_MODIFIED" && event.cardId === "lancer-1" && event.amount === 500));
});

test("pierce-line weakens the declared target and deals damage through events", () => {
  const state = makeState({
    cards: [
      card("pierce-1", { templateId: "pierce-line", effect: "pierceLine" }),
      card("guardian-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100 })
    ],
    player: {
      hand: ["pierce-1"]
    },
    ai: {
      monsterZone: ["guardian-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "pierce-1",
    targetCardId: "guardian-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["guardian-1"].tempAtk, -400);
  assert.equal(next.cards["guardian-1"].tempDef, -400);
  assert.equal(next.players[AI].lp, 3800);
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.amount === 200));
});

test("direct-strike grants direct attack through ability events", () => {
  const state = makeState({
    cards: [
      card("breach-1", { templateId: "star-breach", effect: "directStrike" })
    ],
    player: {
      hand: ["breach-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "breach-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].grave, ["breach-1"]);
  assert.equal(hasAbility(next, PLAYER, Ability.directAttack), true);
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === PLAYER &&
    event.ability === Ability.directAttack &&
    event.uses === 1 &&
    event.sourceCardId === "breach-1"
  ));
});

test("extra-summon grants extra summon through ability events", () => {
  const state = makeState({
    cards: [
      card("twin-1", { templateId: "twin-summon", effect: "extraSummon" })
    ],
    player: {
      hand: ["twin-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "twin-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].grave, ["twin-1"]);
  assert.equal(hasAbility(next, PLAYER, Ability.extraSummon), true);
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === PLAYER &&
    event.ability === Ability.extraSummon &&
    event.uses === 1 &&
    event.sourceCardId === "twin-1"
  ));
});

test("shield spells grant shield through capped shield events", () => {
  const state = makeState({
    cards: [
      card("shield-1", { templateId: "star-shield", effect: "shield800" })
    ],
    player: {
      hand: ["shield-1"],
      shield: 2000
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "shield-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].grave, ["shield-1"]);
  assert.equal(next.players[PLAYER].shield, 2400);
  assert.ok(events.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.playerId === PLAYER &&
    event.requested === 800 &&
    event.amount === 400 &&
    event.before === 2000 &&
    event.after === 2400 &&
    event.sourceCardId === "shield-1"
  ));
});

test("grave-return recovers a grave card through movement and draw events", () => {
  const state = makeState({
    cards: [
      card("return-1", { templateId: "grave-return", effect: "graveReturn" }),
      card("fallen-1", { templateId: "ember-drake", type: "monster" }),
      card("deck-1", { templateId: "solar-knight", type: "monster" })
    ],
    player: {
      hand: ["return-1"],
      deck: ["deck-1"],
      grave: ["fallen-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "return-1",
    targetCardId: "fallen-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, ["fallen-1"]);
  assert.deepEqual(next.players[PLAYER].deck, ["deck-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["return-1"]);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === "fallen-1" &&
    event.from.zone === "grave" &&
    event.to.zone === "deck" &&
    event.to.index === 0
  ));
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === PLAYER &&
    event.count === 1 &&
    event.cardIds.includes("fallen-1") &&
    event.sourceCardId === "return-1"
  ));
  assertValidGameState(next);
});

test("rally-attack buffs the strongest monster and readies an already used monster through events", () => {
  const state = makeState({
    cards: [
      card("rally-1", { templateId: "rally-strike", effect: "rallyAttack" }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000, used: false }),
      card("drake-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, used: true })
    ],
    player: {
      hand: ["rally-1"],
      monsterZone: ["lancer-1", "drake-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "rally-1",
    targetCardId: "lancer-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["lancer-1"].tempAtk, 300);
  assert.equal(next.cards["drake-1"].used, false);
  assert.equal(hasAbility(next, PLAYER, Ability.attackReset), false);
  assert.deepEqual(next.players[PLAYER].grave, ["rally-1"]);
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "lancer-1" &&
    event.amount === 300
  ));
  assert.ok(events.some((event) =>
    event.type === "MONSTER_READIED" &&
    event.cardId === "drake-1" &&
    event.beforeUsed === true &&
    event.afterUsed === false &&
    event.sourceCardId === "rally-1"
  ));
  assertValidGameState(next);
});

test("rally-attack stores an attack reset ability when no monster has attacked", () => {
  const state = makeState({
    cards: [
      card("rally-2", { templateId: "rally-strike", effect: "rallyAttack" }),
      card("lancer-2", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000, used: false }),
      card("drake-2", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, used: false })
    ],
    player: {
      hand: ["rally-2"],
      monsterZone: ["lancer-2", "drake-2"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "rally-2",
    targetCardId: "lancer-2"
  });
  const next = engine.getState();

  assert.equal(next.cards["lancer-2"].tempAtk, 300);
  assert.equal(hasAbility(next, PLAYER, Ability.attackReset), true);
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === PLAYER &&
    event.ability === Ability.attackReset &&
    event.uses === 1 &&
    event.sourceCardId === "rally-2"
  ));
  assert.ok(!events.some((event) => event.type === "MONSTER_READIED"));
  assertValidGameState(next);
});

test("battle-trance buffs the strongest monster and grants attack reset through events", () => {
  const state = makeState({
    cards: [
      card("trance-1", { templateId: "battle-trance", effect: "battleTrance" }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("drake-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 })
    ],
    player: {
      hand: ["trance-1"],
      monsterZone: ["lancer-1", "drake-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "trance-1",
    targetCardId: "lancer-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["lancer-1"].tempAtk, 200);
  assert.equal(next.cards["drake-1"].tempAtk || 0, 0);
  assert.deepEqual(next.players[PLAYER].grave, ["trance-1"]);
  assert.equal(hasAbility(next, PLAYER, Ability.attackReset), true);
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "lancer-1" &&
    event.stat === "tempAtk" &&
    event.amount === 200
  ));
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === PLAYER &&
    event.ability === Ability.attackReset &&
    event.uses === 1 &&
    event.sourceCardId === "trance-1"
  ));
  assertValidGameState(next);
});

test("battle-trance immediately readies its target when that monster already attacked", () => {
  const state = makeState({
    cards: [
      card("trance-used", { templateId: "battle-trance", effect: "battleTrance" }),
      card("lancer-used", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000, used: true }),
      card("drake-used", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, used: false })
    ],
    player: {
      hand: ["trance-used"],
      monsterZone: ["lancer-used", "drake-used"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "trance-used",
    targetCardId: "lancer-used"
  });
  const next = engine.getState();

  assert.equal(next.cards["lancer-used"].tempAtk, 200);
  assert.equal(next.cards["lancer-used"].used, false);
  assert.equal(hasAbility(next, PLAYER, Ability.attackReset), false);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_READIED" &&
    event.cardId === "lancer-used" &&
    event.beforeUsed === true &&
    event.afterUsed === false &&
    event.sourceCardId === "trance-used"
  ));
  assert.ok(!events.some((event) => event.type === "ABILITY_GRANTED" && event.ability === Ability.attackReset));
  assertValidGameState(next);
});

test("light-shadow combo gains shield and draws through events", () => {
  const state = makeState({
    cards: [
      card("eclipse-1", { templateId: "eclipse-barrier", effect: "lightShadowCombo" }),
      card("deck-1", { templateId: "solar-knight", type: "monster" })
    ],
    player: {
      hand: ["eclipse-1"],
      deck: ["deck-1"],
      shield: 2100
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "eclipse-1"
  });
  const next = engine.getState();

  assert.equal(next.players[PLAYER].shield, 2400);
  assert.deepEqual(next.players[PLAYER].hand, ["deck-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["eclipse-1"]);
  assert.ok(events.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.playerId === PLAYER &&
    event.requested === 600 &&
    event.amount === 300 &&
    event.before === 2100 &&
    event.after === 2400 &&
    event.sourceCardId === "eclipse-1"
  ));
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === PLAYER &&
    event.count === 1 &&
    event.cardIds.includes("deck-1") &&
    event.sourceCardId === "eclipse-1"
  ));
  assertValidGameState(next);
});

test("element-echo buffs all own monsters and draws through events", () => {
  const state = makeState({
    cards: [
      card("echo-1", { templateId: "element-echo", effect: "elementEcho" }),
      card("fire-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, element: "fire" }),
      card("light-1", { templateId: "solar-knight", type: "monster", atk: 1700, def: 1200, element: "light" }),
      card("deck-1", { templateId: "star-lancer", type: "monster" })
    ],
    player: {
      hand: ["echo-1"],
      deck: ["deck-1"],
      monsterZone: ["fire-1", "light-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "echo-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["fire-1"].tempAtk, 200);
  assert.equal(next.cards["light-1"].tempAtk, 200);
  assert.deepEqual(next.players[PLAYER].hand, ["deck-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["echo-1"]);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.amount === 200).length, 2);
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === PLAYER &&
    event.cardIds.includes("deck-1") &&
    event.sourceCardId === "echo-1"
  ));
  assertValidGameState(next);
});

test("element-echo rejects fields with fewer than two distinct elements", () => {
  const state = makeState({
    cards: [
      card("echo-bad", { templateId: "element-echo", effect: "elementEcho" }),
      card("fire-only", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, element: "fire" }),
      card("deck-bad", { templateId: "star-lancer", type: "monster" })
    ],
    player: {
      hand: ["echo-bad"],
      deck: ["deck-bad"],
      monsterZone: ["fire-only"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "echo-bad"
    }),
    /requires at least 2 distinct elements/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["echo-bad"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("fire-wind combo damages the rival and buffs all own monsters through events", () => {
  const state = makeState({
    cards: [
      card("firewind-1", { templateId: "flame-gale-burst", effect: "fireWindCombo" }),
      card("fire-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, element: "fire" }),
      card("wind-1", { templateId: "gale-rogue", type: "monster", atk: 1300, def: 1100, element: "wind" })
    ],
    player: {
      hand: ["firewind-1"],
      monsterZone: ["fire-1", "wind-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "firewind-1"
  });
  const next = engine.getState();

  assert.equal(next.players[AI].lp, MAX_LP - 400);
  assert.equal(next.cards["fire-1"].tempAtk, 200);
  assert.equal(next.cards["wind-1"].tempAtk, 200);
  assert.deepEqual(next.players[PLAYER].grave, ["firewind-1"]);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === AI &&
    event.requested === 400 &&
    event.amount === 400 &&
    event.sourceCardId === "firewind-1"
  ));
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.amount === 200).length, 2);
  assertValidGameState(next);
});

test("fire-wind combo rejects fields missing either required element", () => {
  const state = makeState({
    cards: [
      card("firewind-bad", { templateId: "flame-gale-burst", effect: "fireWindCombo" }),
      card("fire-only", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900, element: "fire" })
    ],
    player: {
      hand: ["firewind-bad"],
      monsterZone: ["fire-only"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "firewind-bad"
    }),
    /requires elements fire, wind/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["firewind-bad"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("targeted spell activation rejects missing targets without consuming the card", () => {
  const state = makeState({
    cards: [
      card("chant-1", { templateId: "war-chant", effect: "buff500" }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["chant-1"],
      monsterZone: ["lancer-1"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "chant-1" }),
    GameRuleError
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["chant-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("targeted spell activation enforces owner and strongest-target rules", () => {
  const state = makeState({
    cards: [
      card("chant-1", { templateId: "war-chant", effect: "buff500" }),
      card("pierce-1", { templateId: "pierce-line", effect: "pierceLine" }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("drake-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("guardian-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100 }),
      card("raider-1", { templateId: "sky-raider", ownerId: AI, type: "monster", atk: 1550, def: 900 })
    ],
    player: {
      hand: ["chant-1", "pierce-1"],
      monsterZone: ["lancer-1", "drake-1"]
    },
    ai: {
      monsterZone: ["guardian-1", "raider-1"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "chant-1", targetCardId: "drake-1" }),
    GameRuleError
  );
  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "chant-1", targetCardId: "guardian-1" }),
    GameRuleError
  );
  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "pierce-1", targetCardId: "lancer-1" }),
    GameRuleError
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["chant-1", "pierce-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("ember-drake summon moves the card through EffectContext and resolves on-summon burn", () => {
  const state = makeState({
    cards: [
      card("ember-1", {
        templateId: "ember-drake",
        type: "monster",
        atk: 1500,
        def: 900,
        onSummon: "burn200"
      })
    ],
    player: {
      hand: ["ember-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "ember-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["ember-1"]);
  assert.equal(next.players[AI].lp, 3800);
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === "ember-1"));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 200));
});

test("basic draw and heal on-summon effects resolve through events", () => {
  const state = makeState({
    cards: [
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400, onSummon: "draw1" }),
      card("oracle-1", { templateId: "night-oracle", type: "monster", atk: 1100, def: 1600, onSummon: "heal300" }),
      card("deck-1", { templateId: "solar-knight", type: "monster", atk: 1700, def: 1200 })
    ],
    player: {
      lp: 3600,
      hand: ["gale-1", "oracle-1"],
      deck: ["deck-1"]
    }
  });

  const engine = new GameEngine(state);
  const drawEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "gale-1", index: 0 });
  const healEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "oracle-1", index: 1 });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, ["deck-1"]);
  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.equal(next.players[PLAYER].lp, 3900);
  assert.ok(drawEvents.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.count === 1 &&
    event.cardIds.includes("deck-1") &&
    event.sourceCardId === "gale-1"
  ));
  assert.ok(healEvents.some((event) =>
    event.type === "LP_HEALED" &&
    event.amount === 300 &&
    event.sourceCardId === "oracle-1"
  ));
  assertValidGameState(next);
});

test("conditional stat shield and burn on-summon effects resolve through events", () => {
  const buffState = makeState({
    cards: [
      card("ember-ally", { templateId: "ember-drake", type: "monster", element: "fire", atk: 1500, def: 900 }),
      card("captain-1", { templateId: "flame-captain", type: "monster", element: "fire", atk: 1400, def: 1300, onSummon: "fireBuff" })
    ],
    player: {
      monsterZone: ["ember-ally"],
      hand: ["captain-1"]
    }
  });
  const shieldState = makeState({
    cards: [
      card("saint-1", { templateId: "prism-saint", type: "monster", element: "light", atk: 1000, def: 1800, onSummon: "shield400" })
    ],
    player: {
      hand: ["saint-1"]
    }
  });
  const burnState = makeState({
    cards: [
      card("shadow-ally", { templateId: "night-oracle", type: "monster", element: "shadow", atk: 1100, def: 1600 }),
      card("alchemist-1", { templateId: "dusk-alchemist", type: "monster", element: "shadow", atk: 1450, def: 1500, onSummon: "shadowBurn" })
    ],
    player: {
      monsterZone: ["shadow-ally"],
      hand: ["alchemist-1"]
    }
  });

  const buffEngine = new GameEngine(buffState);
  const shieldEngine = new GameEngine(shieldState);
  const burnEngine = new GameEngine(burnState);
  const buffEvents = buffEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "captain-1", index: 1 });
  const shieldEvents = shieldEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "saint-1", index: 0 });
  const burnEvents = burnEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "alchemist-1", index: 1 });

  assert.equal(buffEngine.getState().cards["ember-ally"].tempAtk, 300);
  assert.equal(shieldEngine.getState().players[PLAYER].shield, 400);
  assert.equal(burnEngine.getState().players[AI].lp, 3700);
  assert.ok(buffEvents.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "ember-ally" &&
    event.stat === "tempAtk" &&
    event.amount === 300 &&
    event.sourceCardId === "captain-1"
  ));
  assert.ok(shieldEvents.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.amount === 400 &&
    event.sourceCardId === "saint-1"
  ));
  assert.ok(burnEvents.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.amount === 300 &&
    event.sourceCardId === "alchemist-1"
  ));
  assertValidGameState(buffEngine.getState());
  assertValidGameState(shieldEngine.getState());
  assertValidGameState(burnEngine.getState());
});

test("conditional on-summon effects can be skipped without rejecting the summon", () => {
  const state = makeState({
    cards: [
      card("captain-1", { templateId: "flame-captain", type: "monster", element: "fire", atk: 1400, def: 1300, onSummon: "fireBuff" }),
      card("alchemist-1", { templateId: "dusk-alchemist", type: "monster", element: "shadow", atk: 1450, def: 1500, onSummon: "shadowBurn" })
    ],
    player: {
      hand: ["captain-1", "alchemist-1"]
    }
  });

  const engine = new GameEngine(state);
  const buffEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "captain-1", index: 0 });
  const burnEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "alchemist-1", index: 1 });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, ["captain-1", "alchemist-1"]);
  assert.equal(next.cards["captain-1"].tempAtk, undefined);
  assert.equal(next.players[AI].lp, 4000);
  assert.ok(buffEvents.some((event) => event.type === "EFFECT_SKIPPED" && event.effectId === "fireBuff"));
  assert.ok(burnEvents.some((event) => event.type === "EFFECT_SKIPPED" && event.effectId === "shadowBurn"));
  assertValidGameState(next);
});

test("void-lock can only trigger in battle phase and logs negation", () => {
  const state = makeState({
    cards: [
      card("void-1", {
        templateId: "void-lock",
        type: "trap",
        trigger: "attackNegate"
      })
    ],
    player: {
      spellTrapZone: ["void-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "void-1",
    targetEffectId: "attack-42"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].spellTrapZone, []);
  assert.deepEqual(next.players[PLAYER].grave, ["void-1"]);
  assert.ok(events.some((event) => event.type === "EFFECT_NEGATED" && event.targetEffectId === "attack-42"));
});

test("attack traps resolve destruction boost shield weaken and empty redirect through events", () => {
  const destroyState = makeState({
    cards: [
      card("mirror-1", { templateId: "mirror-snare", type: "trap", trigger: "attackDestroy" }),
      card("attacker-1", { templateId: "star-lancer", ownerId: AI, type: "monster", atk: 1800, def: 1200 })
    ],
    player: { spellTrapZone: ["mirror-1"] },
    ai: { monsterZone: ["attacker-1"] },
    turn: { phase: Phase.battle }
  });
  destroyState.machine.phase = Phase.battle;
  destroyState.machine.timing = Timing.battleOpen;
  const destroyEngine = new GameEngine(destroyState);
  const destroyEvents = destroyEngine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "mirror-1",
    attackerCardId: "attacker-1"
  });

  assert.deepEqual(destroyEngine.getState().players[PLAYER].grave, ["mirror-1"]);
  assert.deepEqual(destroyEngine.getState().players[AI].grave, ["attacker-1"]);
  assert.ok(destroyEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "attacker-1" && event.sourceCardId === "mirror-1"));

  const boostState = makeState({
    cards: [
      card("counter-1", { templateId: "counter-array", type: "trap", trigger: "counterBoost" }),
      card("weak-1", { templateId: "ember-drake", type: "monster", atk: 1200, def: 900 }),
      card("strong-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1200 })
    ],
    player: {
      spellTrapZone: ["counter-1"],
      monsterZone: ["strong-1", "weak-1"]
    },
    turn: { phase: Phase.battle }
  });
  boostState.machine.phase = Phase.battle;
  boostState.machine.timing = Timing.battleOpen;
  const boostEngine = new GameEngine(boostState);
  const boostEvents = boostEngine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "counter-1",
    attackerCardId: "attacker-irrelevant"
  });

  assert.equal(boostEngine.getState().cards["weak-1"].tempAtk, 400);
  assert.equal(boostEngine.getState().cards["strong-1"].tempAtk, undefined);
  assert.ok(boostEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === "weak-1" && event.sourceCardId === "counter-1"));

  const shiftState = makeState({
    cards: [card("shift-1", { templateId: "storm-shift", type: "trap", trigger: "attackShift" })],
    player: { spellTrapZone: ["shift-1"], shield: 2200 },
    turn: { phase: Phase.battle }
  });
  shiftState.machine.phase = Phase.battle;
  shiftState.machine.timing = Timing.battleOpen;
  const shiftEngine = new GameEngine(shiftState);
  const shiftEvents = shiftEngine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "shift-1" });

  assert.equal(shiftEngine.getState().players[PLAYER].shield, 2400);
  assert.ok(shiftEvents.some((event) => event.type === "SHIELD_GAINED" && event.amount === 200 && event.requested === 400));

  const weakenState = makeState({
    cards: [
      card("web-1", { templateId: "weakening-web", type: "trap", trigger: "weakenAttack" }),
      card("attacker-1", { templateId: "star-lancer", ownerId: AI, type: "monster", atk: 1800, def: 1200 })
    ],
    player: { spellTrapZone: ["web-1"] },
    ai: { monsterZone: ["attacker-1"] },
    turn: { phase: Phase.battle }
  });
  weakenState.machine.phase = Phase.battle;
  weakenState.machine.timing = Timing.battleOpen;
  const weakenEngine = new GameEngine(weakenState);
  const weakenEvents = weakenEngine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "web-1",
    attackerCardId: "attacker-1"
  });

  assert.equal(weakenEngine.getState().cards["attacker-1"].tempAtk, -500);
  assert.equal(weakenEngine.getState().cards["attacker-1"].tempDef, -500);
  assert.equal(weakenEvents.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === "attacker-1").length, 2);

  const redirectState = makeState({
    cards: [card("switch-1", { templateId: "phantom-switch", type: "trap", trigger: "redirectAttack" })],
    player: { spellTrapZone: ["switch-1"] },
    turn: { phase: Phase.battle }
  });
  redirectState.machine.phase = Phase.battle;
  redirectState.machine.timing = Timing.battleOpen;
  const redirectEngine = new GameEngine(redirectState);
  const redirectEvents = redirectEngine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "switch-1" });

  assert.deepEqual(redirectEngine.getState().players[PLAYER].spellTrapZone, []);
  assert.deepEqual(redirectEngine.getState().players[PLAYER].grave, ["switch-1"]);
  assert.ok(redirectEvents.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "switch-1"));
});

test("direct and summon traps resolve draw and damage through events", () => {
  const directShieldState = makeState({
    cards: [
      card("guard-1", { templateId: "guard-sigil", type: "trap", trigger: "directShield" }),
      card("draw-1", { templateId: "solar-knight", type: "monster" })
    ],
    player: {
      spellTrapZone: ["guard-1"],
      deck: ["draw-1"]
    },
    turn: { phase: Phase.battle }
  });
  directShieldState.machine.phase = Phase.battle;
  directShieldState.machine.timing = Timing.battleOpen;
  const directShieldEngine = new GameEngine(directShieldState);
  const directShieldEvents = directShieldEngine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "guard-1" });

  assert.deepEqual(directShieldEngine.getState().players[PLAYER].hand, ["draw-1"]);
  assert.deepEqual(directShieldEngine.getState().players[PLAYER].grave, ["guard-1"]);
  assert.ok(directShieldEvents.some((event) => event.type === "CARDS_DRAWN" && event.cardIds.includes("draw-1") && event.sourceCardId === "guard-1"));

  const reboundState = makeState({
    cards: [card("rebound-1", { templateId: "reversal-flare", type: "trap", trigger: "directRebound" })],
    player: { spellTrapZone: ["rebound-1"] },
    turn: { phase: Phase.battle }
  });
  reboundState.machine.phase = Phase.battle;
  reboundState.machine.timing = Timing.battleOpen;
  const reboundEngine = new GameEngine(reboundState);
  const reboundEvents = reboundEngine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "rebound-1" });

  assert.equal(reboundEngine.getState().players[AI].lp, 3500);
  assert.ok(reboundEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.amount === 500 && event.sourceCardId === "rebound-1"));

  const summonBurnState = makeState({
    cards: [card("flare-1", { templateId: "summon-flare", type: "trap", trigger: "summonBurn" })],
    player: { spellTrapZone: ["flare-1"] },
    turn: { phase: Phase.main }
  });
  summonBurnState.machine.phase = Phase.main;
  summonBurnState.machine.timing = Timing.summon;
  const summonBurnEngine = new GameEngine(summonBurnState);
  const summonBurnEvents = summonBurnEngine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "flare-1" });

  assert.equal(summonBurnEngine.getState().players[AI].lp, 3600);
  assert.ok(summonBurnEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.amount === 400 && event.sourceCardId === "flare-1"));
});

test("battle resolution deals direct damage and marks the attacker through events", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1500, def: 1000 })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      shield: 500
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["attacker-1"].used, true);
  assert.equal(next.players[AI].shield, 0);
  assert.equal(next.players[AI].lp, 3000);
  assert.ok(events.some((event) => event.type === "ATTACK_DECLARED" && event.direct === true));
  assert.ok(events.some((event) => event.type === "MONSTER_USED" && event.cardId === "attacker-1"));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.requested === 1500 && event.blocked === 500 && event.amount === 1000));
  assert.ok(events.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "direct"));
  assertValidGameState(next);
});

test("battle resolution destroys attack-position targets and applies battle damage through events", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("target-1", { templateId: "ember-drake", ownerId: AI, type: "monster", atk: 1200, def: 900 })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["target-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["attacker-1"].used, true);
  assert.deepEqual(next.players[AI].monsterZone, []);
  assert.deepEqual(next.players[AI].grave, ["target-1"]);
  assert.equal(next.players[AI].lp, 3400);
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "target-1" && event.reason === "battle"));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.amount === 600));
  assert.ok(events.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "attackWin"));
  assertValidGameState(next);
});

test("battle resolution against stronger defense keeps monsters and applies guarded counter wear", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("guard-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense", battleWear: 0 })
    ],
    player: {
      monsterZone: ["attacker-1"],
      shield: 100
    },
    ai: {
      monsterZone: ["guard-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "guard-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["attacker-1"].used, true);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["attacker-1"]);
  assert.deepEqual(next.players[AI].monsterZone, ["guard-1"]);
  assert.deepEqual(next.players[AI].grave, []);
  assert.equal(next.players[PLAYER].shield, 0);
  assert.equal(next.players[PLAYER].lp, 3800);
  assert.equal(next.cards["guard-1"].battleWear, 150);
  assert.equal(next.cards["guard-1"].tempAtk, -150);
  assert.equal(next.cards["guard-1"].tempDef, -150);
  assert.ok(events.some((event) => event.type === "BATTLE_WEAR_APPLIED" && event.cardId === "guard-1" && event.amount === 150));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === PLAYER && event.requested === 300 && event.blocked === 100 && event.amount === 200));
  assert.ok(events.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "guardCounter"));
  assertValidGameState(next);
});

test("battle resolution rejects illegal battle declarations without consuming attackers", () => {
  const directBlockedState = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("guard-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["guard-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  directBlockedState.machine.phase = Phase.battle;
  directBlockedState.machine.timing = Timing.battleOpen;
  const directBlockedEngine = new GameEngine(directBlockedState);

  assert.throws(
    () => directBlockedEngine.dispatch({
      type: "RESOLVE_BATTLE",
      playerId: PLAYER,
      rivalId: AI,
      attackerCardId: "attacker-1"
    }),
    /must attack a monster before attacking directly/
  );
  assert.equal(directBlockedEngine.getState().cards["attacker-1"].used, undefined);

  const defenseAttackerState = makeState({
    cards: [
      card("defender-1", { templateId: "iron-guardian", type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: {
      monsterZone: ["defender-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  defenseAttackerState.machine.phase = Phase.battle;
  defenseAttackerState.machine.timing = Timing.battleOpen;
  const defenseAttackerEngine = new GameEngine(defenseAttackerState);

  assert.throws(
    () => defenseAttackerEngine.dispatch({
      type: "RESOLVE_BATTLE",
      playerId: PLAYER,
      rivalId: AI,
      attackerCardId: "defender-1"
    }),
    /Defense position monsters cannot attack/
  );
  assert.equal(defenseAttackerEngine.getState().cards["defender-1"].used, undefined);
});

test("attack declaration opens an engine-owned response window without resolving battle", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("target-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["target-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const next = engine.getState();
  const declared = events.find((event) => event.type === "ATTACK_DECLARED");
  const windowOpened = events.find((event) => event.type === "RESPONSE_WINDOW_OPENED");

  assert.equal(next.cards["attacker-1"].used, undefined);
  assert.deepEqual(next.players[AI].monsterZone, ["target-1"]);
  assert.equal(next.players[PLAYER].lp, MAX_LP);
  assert.equal(next.machine.timing, Timing.attackDeclaration);
  assert.equal(next.machine.responseWindow.playerId, AI);
  assert.equal(next.machine.responseWindow.type, ResponseWindow.optional);
  assert.equal(next.machine.responseWindow.timing, Timing.attackDeclaration);
  assert.equal(declared.targetCardId, "target-1");
  assert.equal(windowOpened.triggerEventId, declared.id);
  assert.equal(windowOpened.context.attackerCardId, "attacker-1");
  assert.equal(windowOpened.context.targetCardId, "target-1");
  assert.ok(events.some((event) => event.type === "TIMING_CHANGED" && event.to === Timing.attackDeclaration));
  assert.ok(!events.some((event) => event.type === "DAMAGE_DEALT"));
  assert.ok(!events.some((event) => event.type === "MONSTER_USED"));
  assertValidGameState(next);
});

test("attack declaration rejects illegal targets before response timing opens", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("guard-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["guard-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "DECLARE_ATTACK",
      playerId: PLAYER,
      rivalId: AI,
      attackerCardId: "attacker-1"
    }),
    /must attack a monster before attacking directly/
  );
  assert.equal(engine.getState().machine.responseWindow, null);
  assert.equal(engine.getState().machine.timing, Timing.battleOpen);
  assert.equal(engine.getState().cards["attacker-1"].used, undefined);
});

test("after-attack monster effects resolve through battle events", () => {
  const growState = makeState({
    cards: [
      card("hound-1", { templateId: "void-hound", type: "monster", atk: 1600, def: 800, afterAttack: "grow200" })
    ],
    player: {
      monsterZone: ["hound-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  growState.machine.phase = Phase.battle;
  growState.machine.timing = Timing.battleOpen;
  const growEngine = new GameEngine(growState);
  const growEvents = growEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "hound-1"
  });

  assert.equal(growEngine.getState().cards["hound-1"].tempAtk, 200);
  assert.ok(growEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === "hound-1" && event.stat === "tempAtk" && event.amount === 200));

  const drawState = makeState({
    cards: [
      card("raider-1", { templateId: "sky-raider", type: "monster", element: "wind", atk: 1550, def: 900, afterAttack: "windDraw" }),
      card("draw-1", { templateId: "ember-drake", type: "monster" })
    ],
    player: {
      monsterZone: ["raider-1"],
      deck: ["draw-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  drawState.machine.phase = Phase.battle;
  drawState.machine.timing = Timing.battleOpen;
  const drawEngine = new GameEngine(drawState);
  const drawEvents = drawEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "raider-1"
  });

  assert.deepEqual(drawEngine.getState().players[PLAYER].hand, ["draw-1"]);
  assert.ok(drawEvents.some((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === "raider-1" && event.cardIds.includes("draw-1")));
});

test("mark monster used consumes an attack chance through events only", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "MARK_MONSTER_USED",
    playerId: PLAYER,
    cardId: "attacker-1"
  });

  assert.equal(engine.getState().cards["attacker-1"].used, true);
  assert.ok(events.some((event) => event.type === "MONSTER_USED" && event.cardId === "attacker-1"));
  assertValidGameState(engine.getState());
});

test("set trap moves trap cards through dispatch events in main and battle phases", () => {
  const mainState = makeState({
    cards: [card("mirror-1", { templateId: "mirror-snare", type: "trap", trigger: "attackDestroy" })],
    player: {
      hand: ["mirror-1"]
    }
  });

  const mainEngine = new GameEngine(mainState);
  const mainEvents = mainEngine.dispatch({
    type: "SET_TRAP",
    playerId: PLAYER,
    cardId: "mirror-1",
    index: 2
  });
  const mainNext = mainEngine.getState();

  assert.deepEqual(mainNext.players[PLAYER].hand, []);
  assert.deepEqual(mainNext.players[PLAYER].spellTrapZone, ["mirror-1"]);
  assert.ok(mainEvents.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === "mirror-1" &&
    event.to.zone === "spellTrapZone" &&
    event.to.index === 2
  ));
  assert.ok(mainEvents.some((event) => event.type === "TRAP_SET" && event.cardId === "mirror-1"));

  const battleState = makeState({
    cards: [card("guard-1", { templateId: "guard-sigil", type: "trap", trigger: "directShield" })],
    player: {
      hand: ["guard-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  battleState.machine.phase = Phase.battle;
  battleState.machine.timing = Timing.battleOpen;

  const battleEngine = new GameEngine(battleState);
  battleEngine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: "guard-1", index: 0 });

  assert.deepEqual(battleEngine.getState().players[PLAYER].spellTrapZone, ["guard-1"]);
});

test("set trap rejects non-traps and full spell trap zones without consuming the card", () => {
  const monsterState = makeState({
    cards: [card("lancer-1", { templateId: "star-lancer", type: "monster" })],
    player: {
      hand: ["lancer-1"]
    }
  });
  const monsterEngine = new GameEngine(monsterState);

  assert.throws(
    () => monsterEngine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: "lancer-1" }),
    GameRuleError
  );
  assert.deepEqual(monsterEngine.getState().players[PLAYER].hand, ["lancer-1"]);

  const trapCards = Array.from({ length: FIELD_SIZE }, (_, index) =>
    card(`set-${index}`, { templateId: "mirror-snare", type: "trap" })
  );
  const fullState = makeState({
    cards: [
      ...trapCards,
      card("mirror-1", { templateId: "mirror-snare", type: "trap" })
    ],
    player: {
      hand: ["mirror-1"],
      spellTrapZone: trapCards.map((entry) => entry.id)
    }
  });
  const fullEngine = new GameEngine(fullState);

  assert.throws(
    () => fullEngine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: "mirror-1" }),
    GameRuleError
  );
  assert.deepEqual(fullEngine.getState().players[PLAYER].hand, ["mirror-1"]);
  assert.equal(fullEngine.getState().players[PLAYER].spellTrapZone.length, FIELD_SIZE);
});

test("applyGameEvent is the only state mutator for card movement and LP changes", () => {
  const state = makeState({
    cards: [card("burst-1", { templateId: "burst-rune", effect: "burn500" })],
    player: { hand: ["burst-1"] }
  });

  applyGameEvent(state, {
    id: 1,
    type: "CARD_MOVED",
    cardId: "burst-1",
    from: { playerId: PLAYER, zone: "hand" },
    to: { playerId: PLAYER, zone: "grave", index: null }
  });
  applyGameEvent(state, {
    id: 2,
    type: "DAMAGE_DEALT",
    playerId: AI,
    amount: 500,
    requested: 500,
    sourceCardId: "burst-1"
  });

  assert.deepEqual(state.players[PLAYER].hand, []);
  assert.deepEqual(state.players[PLAYER].grave, ["burst-1"]);
  assert.equal(state.players[AI].lp, 3500);
  assert.deepEqual(state.events.map((event) => event.type), ["CARD_MOVED", "DAMAGE_DEALT"]);
  assertValidGameState(state);
});

test("dispatch event log can replay the same rules state", () => {
  const initialState = makeState({
    cards: [
      card("seer-1", { templateId: "seer-call", effect: "draw2" }),
      card("deck-1", { type: "monster", templateId: "ember-drake" }),
      card("deck-2", { type: "monster", templateId: "solar-knight" })
    ],
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    }
  });

  const engine = new GameEngine(initialState);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-1" });
  const replayed = makeState({
    cards: Object.values(initialState.cards).map((entry) => ({ ...entry })),
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    }
  });

  for (const event of events) {
    applyGameEvent(replayed, event);
  }

  const resolved = engine.getState();
  assert.deepEqual(replayed.players, resolved.players);
  assert.deepEqual(replayed.cards, resolved.cards);
  assert.deepEqual(replayed.turn, resolved.turn);
  assert.deepEqual(replayed.machine, resolved.machine);
  assert.deepEqual(replayed.events, events);
});

test("timing, response windows, and chain links are explicit state machine events", () => {
  const state = makeState({
    cards: [card("void-1", { templateId: "void-lock", type: "trap", trigger: "attackNegate" })],
    player: { spellTrapZone: ["void-1"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;

  const engine = new GameEngine(state);
  engine.dispatch({
    type: "OPEN_RESPONSE_WINDOW",
    playerId: PLAYER,
    timing: Timing.attackDeclaration,
    windowType: ResponseWindow.optional,
    triggerEventId: "attack-42"
  });
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "void-1",
    effectId: "attackNegate",
    targetEffectId: "attack-42"
  });

  let next = engine.getState();
  assert.equal(next.machine.timing, Timing.attackDeclaration);
  assert.equal(next.machine.responseWindow.type, ResponseWindow.optional);
  assert.equal(next.machine.chain.length, 1);
  assert.equal(next.machine.chain[0].effectId, "attackNegate");

  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  next = engine.getState();

  assert.deepEqual(next.machine.chain, []);
  assert.equal(next.machine.responseWindow, null);
  assert.ok(resolveEvents.some((event) => event.type === "CHAIN_RESOLVED"));
});

test("only the designated responder can add a trap chain link", () => {
  const state = makeState({
    cards: [card("void-1", { templateId: "void-lock", type: "trap", trigger: "attackNegate" })],
    player: { spellTrapZone: ["void-1"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    triggerEventId: "attack-42"
  };

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ADD_CHAIN_LINK",
      playerId: AI,
      cardId: "void-1",
      effectId: "attackNegate",
      targetEffectId: "attack-42"
    }),
    /response window belongs to player/
  );
});

test("trap chain links must reference a trap in the responder spell trap zone", () => {
  const state = makeState({
    cards: [card("void-1", { templateId: "void-lock", type: "trap", trigger: "attackNegate" })],
    player: { hand: ["void-1"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    triggerEventId: "attack-42"
  };

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ADD_CHAIN_LINK",
      playerId: PLAYER,
      cardId: "void-1",
      effectId: "attackNegate",
      targetEffectId: "attack-42"
    }),
    /not in player\.spellTrapZone/
  );
});

test("declining a response closes the window through an explicit event", () => {
  const state = makeState({ turn: { phase: Phase.battle } });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    triggerEventId: "attack-42"
  };

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "CLOSE_RESPONSE_WINDOW",
    playerId: PLAYER,
    reason: "declined"
  });

  assert.equal(engine.getState().machine.responseWindow, null);
  assert.ok(events.some((event) => event.type === "RESPONSE_WINDOW_CLOSED" && event.reason === "declined"));
});

test("abilities are event-sourced resources for complex restrictions", () => {
  const engine = new GameEngine(makeState());

  const grantEvents = engine.dispatch({
    type: "GRANT_ABILITY",
    playerId: PLAYER,
    ability: Ability.directAttack,
    uses: 1,
    duration: "turn",
    sourceCardId: "star-breach"
  });

  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.directAttack), true);
  assert.ok(grantEvents.some((event) => event.type === "ABILITY_GRANTED" && event.ability === Ability.directAttack));

  engine.dispatch({ type: "SPEND_ABILITY", playerId: PLAYER, ability: Ability.directAttack });

  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.directAttack), false);
});

test("phase state machine rejects illegal card activation", () => {
  const state = makeState({
    cards: [card("seer-1", { templateId: "seer-call", effect: "draw2" })],
    player: {
      hand: ["seer-1"],
      deck: [card("deck-1").id, card("deck-2").id]
    },
    turn: {
      phase: Phase.draw
    }
  });
  state.cards["deck-1"] = card("deck-1", { type: "monster" });
  state.cards["deck-2"] = card("deck-2", { type: "monster" });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-1" }),
    GameRuleError
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["seer-1"]);
});

test("getState returns a defensive copy so UI code cannot mutate live engine state", () => {
  const engine = new GameEngine(makeState());
  const snapshot = engine.getState();

  snapshot.players[PLAYER].lp = 1;
  snapshot.turn.playerId = "missing";

  assert.equal(engine.getState().players[PLAYER].lp, MAX_LP);
  assert.equal(engine.getState().turn.playerId, PLAYER);
});

test("assertValidGameState catches invalid zones, LP, and turn owner", () => {
  assert.throws(
    () => assertValidGameState(makeState({ player: { hand: ["same-card"], grave: ["same-card"] }, cards: [card("same-card")] })),
    GameStateValidationError
  );

  assert.throws(
    () => assertValidGameState(makeState({ player: { hand: ["missing-card"] } })),
    GameStateValidationError
  );

  const overflowCards = Array.from({ length: FIELD_SIZE + 1 }, (_, index) => card(`monster-${index}`, { type: "monster" }));
  assert.throws(
    () => assertValidGameState(makeState({ cards: overflowCards, player: { monsterZone: overflowCards.map((entry) => entry.id) } })),
    GameStateValidationError
  );

  assert.throws(
    () => assertValidGameState(makeState({ player: { lp: Number.NaN } })),
    GameStateValidationError
  );

  assert.throws(
    () => assertValidGameState(makeState({ turn: { playerId: "missing-player" } })),
    GameStateValidationError
  );
});
