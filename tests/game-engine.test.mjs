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
  const burn500 = getCardEffectDefinition("burn500");
  const heal700 = getCardEffectDefinition("heal700");
  const directStrike = getCardEffectDefinition("directStrike");
  const extraSummon = getCardEffectDefinition("extraSummon");
  const shield800 = getCardEffectDefinition("shield800");

  assert.equal(draw2.duration, EffectDuration.oneShot);
  assert.deepEqual(draw2.operations, [{ op: "drawCards", player: "self", count: 2 }]);
  assert.deepEqual(burn500.operations, [{ op: "dealDamage", player: "rival", amount: 500 }]);
  assert.deepEqual(heal700.operations, [{ op: "heal", player: "self", amount: 700 }]);
  assert.deepEqual(directStrike.operations, [{ op: "grantAbility", player: "self", ability: Ability.directAttack, uses: 1, duration: "turn" }]);
  assert.deepEqual(extraSummon.operations, [{ op: "grantAbility", player: "self", ability: Ability.extraSummon, uses: 1, duration: "turn" }]);
  assert.deepEqual(shield800.operations, [{ op: "gainShield", player: "self", amount: 800 }]);
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
