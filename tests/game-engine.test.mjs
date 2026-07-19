import test from "node:test";
import assert from "node:assert/strict";

import {
  ActionWindow,
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
  explainActionLegality,
  getCardEffectDefinition,
  getLegalActions,
  hasAbility,
  projectMachineStateFromEvents
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
    attacksSkipped: false,
    comboThisTurn: false,
    comboFlags: {},
    normalSummonsUsed: 0,
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

function makeState({ cards = [], player = {}, ai = {}, turn = {}, machine = {}, continuousEffects = [] } = {}) {
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
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null,
      ...machine
    },
    abilities: {
      [PLAYER]: [],
      [AI]: []
    },
    events: [],
    continuousEffects,
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

test("last-spark draw succeeds with enough deck and fails before consuming resources when short", () => {
  const successState = makeState({
    cards: [
      card("spark-1", { templateId: "last-spark", effect: "comebackDraw" }),
      card("deck-1", { type: "monster", templateId: "spark-runner" }),
      card("deck-2", { type: "trap", templateId: "backlash-mirror", trigger: "directRebound" })
    ],
    player: {
      hand: ["spark-1"],
      deck: ["deck-1", "deck-2"]
    }
  });
  const successEngine = new GameEngine(successState);
  const events = successEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "spark-1" });
  const successNext = successEngine.getState();

  assert.deepEqual(successNext.players[PLAYER].hand, ["deck-1", "deck-2"]);
  assert.deepEqual(successNext.players[PLAYER].deck, []);
  assert.deepEqual(successNext.players[PLAYER].grave, ["spark-1"]);
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.count === 2 && event.sourceCardId === "spark-1"));
  assertValidGameState(successNext);

  const failState = makeState({
    cards: [
      card("spark-short", { templateId: "last-spark", effect: "comebackDraw" }),
      card("only-deck", { type: "monster", templateId: "spark-runner" })
    ],
    player: {
      hand: ["spark-short"],
      deck: ["only-deck"]
    }
  });
  const failEngine = new GameEngine(failState);

  assert.throws(
    () => failEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "spark-short" }),
    /requires at least 2 cards in deck/
  );
  assert.deepEqual(failEngine.getState().players[PLAYER].hand, ["spark-short"]);
  assert.deepEqual(failEngine.getState().players[PLAYER].deck, ["only-deck"]);
  assert.deepEqual(failEngine.getState().players[PLAYER].grave, []);
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

test("target resistance blocks opponent targeting and recalculates strongest legal target", () => {
  const state = makeState({
    cards: [
      card("pierce-1", { templateId: "pierce-line", effect: "pierceLine" }),
      card("dragon-1", {
        ownerId: AI,
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        targetResistance: { type: "divineTarget" }
      }),
      card("colossus-1", { ownerId: AI, templateId: "starfall-colossus", type: "monster", atk: 3200, def: 2600 })
    ],
    player: {
      hand: ["pierce-1"]
    },
    ai: {
      monsterZone: ["dragon-1", "colossus-1"]
    }
  });

  const illegal = new GameEngine(state);
  assert.throws(
    () => illegal.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "pierce-1", targetCardId: "dragon-1" }),
    /protected by target resistance/
  );

  const legal = new GameEngine(state);
  const events = legal.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "pierce-1", targetCardId: "colossus-1" });
  const next = legal.getState();

  assert.equal(next.cards["dragon-1"].tempAtk || 0, 0);
  assert.equal(next.cards["dragon-1"].tempDef || 0, 0);
  assert.equal(next.cards["colossus-1"].tempAtk, -400);
  assert.equal(next.cards["colossus-1"].tempDef, -400);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === "colossus-1").length, 2);
});

test("target resistance does not block same-owner target effects", () => {
  const state = makeState({
    cards: [
      card("chant-1", { templateId: "war-chant", effect: "buff500" }),
      card("dragon-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        targetResistance: { type: "divineTarget" }
      })
    ],
    player: {
      hand: ["chant-1"],
      monsterZone: ["dragon-1"]
    }
  });
  const engine = new GameEngine(state);
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "chant-1", targetCardId: "dragon-1" });

  assert.equal(engine.getState().cards["dragon-1"].tempAtk, 500);
});

test("divine break source bypasses matching target resistance without weakening normal targeting rules", () => {
  const state = makeState({
    cards: [
      card("breaker-1", {
        templateId: "godbreaker-spear",
        effect: "pierceLine",
        targetResistanceBypass: "divineTarget"
      }),
      card("dragon-1", {
        ownerId: AI,
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        targetResistance: { type: "divineTarget" }
      }),
      card("colossus-1", {
        ownerId: AI,
        templateId: "starfall-colossus",
        type: "monster",
        atk: 3200,
        def: 2600
      })
    ],
    player: { hand: ["breaker-1"] },
    ai: { monsterZone: ["dragon-1", "colossus-1"] }
  });
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "breaker-1",
    targetCardId: "dragon-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["dragon-1"].tempAtk, -400);
  assert.equal(next.cards["dragon-1"].tempDef, -400);
  assert.equal(next.cards["colossus-1"].tempAtk || 0, 0);
  assert.equal(next.cards["colossus-1"].tempDef || 0, 0);
  assert.equal(next.players[AI].lp, MAX_LP - 200);
  assert.ok(events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "breaker-1"));
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
  const comebackDraw = getCardEffectDefinition("comebackDraw");
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
  const chainNegate = getCardEffectDefinition("chainNegate");
  const directStrike = getCardEffectDefinition("directStrike");
  const extraSummon = getCardEffectDefinition("extraSummon");
  const shield800 = getCardEffectDefinition("shield800");
  const graveReturn = getCardEffectDefinition("graveReturn");
  const graveRevive = getCardEffectDefinition("graveRevive");
  const dawnEdge = getCardEffectDefinition("dawnEdge");
  const lastStandSurge = getCardEffectDefinition("lastStandSurge");
  const rallyAttack = getCardEffectDefinition("rallyAttack");
  const battleTrance = getCardEffectDefinition("battleTrance");
  const lightShadowCombo = getCardEffectDefinition("lightShadowCombo");
  const elementEcho = getCardEffectDefinition("elementEcho");
  const fireWindCombo = getCardEffectDefinition("fireWindCombo");
  const grow200 = getCardEffectDefinition("grow200");
  const windDraw = getCardEffectDefinition("windDraw");
  const starSoulSurvey = getCardEffectDefinition("starSoulSurvey");
  const riftShelter = getCardEffectDefinition("riftShelter");
  const soulResonance = getCardEffectDefinition("soulResonance");
  const soulParry = getCardEffectDefinition("soulParry");

  assert.equal(draw2.duration, EffectDuration.oneShot);
  assert.deepEqual(draw1.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(draw2.operations, [{ op: "drawCards", player: "self", count: 2 }]);
  assert.deepEqual(comebackDraw.requirements, [
    { type: "minDeckCount", player: "self", count: 2 }
  ]);
  assert.deepEqual(comebackDraw.operations, [{ op: "drawCards", player: "self", count: 2 }]);
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
  assert.deepEqual(redirectAttack.operations, [{ op: "redirectAttackTarget", targetCardId: "$action.targetCardId" }]);
  assert.deepEqual(weakenAttack.operations, [
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempDef", amount: -500 }
  ]);
  assert.deepEqual(directShield.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(directRebound.operations, [{ op: "dealDamage", player: "rival", amount: 500 }]);
  assert.deepEqual(summonBurn.operations, [{ op: "dealDamage", player: "rival", amount: 400 }]);
  assert.deepEqual(chainNegate.operations, [{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }]);
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
  assert.deepEqual(graveRevive.target, { player: "self", zone: "grave", cardType: "monster" });
  assert.deepEqual(graveRevive.operations, [{
    op: "specialSummonFromGrave",
    player: "self",
    cardId: "$action.targetCardId"
  }]);
  assert.deepEqual(dawnEdge.operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 900 }
  ]);
  assert.deepEqual(lastStandSurge.requirements, [
    { type: "maxLp", player: "self", amount: 1500 }
  ]);
  assert.deepEqual(lastStandSurge.target, { player: "self", zone: "monsterZone", rule: "strongestAtk" });
  assert.deepEqual(lastStandSurge.operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 700 }
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
  assert.deepEqual(grow200.operations, [
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: 200 }
  ]);
  assert.deepEqual(windDraw.requirements, [
    { type: "minElementCount", player: "self", element: "wind", count: 1 }
  ]);
  assert.deepEqual(windDraw.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(starSoulSurvey.requirements, [
    { type: "minDistinctElements", player: "self", count: 2 }
  ]);
  assert.deepEqual(starSoulSurvey.operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(riftShelter.requirements, [
    { type: "minElementCount", player: "self", element: "shadow", count: 2 }
  ]);
  assert.deepEqual(riftShelter.operations, [{ op: "gainShield", player: "self", amount: 300 }]);
  assert.deepEqual(soulResonance.target, { player: "self", zone: "monsterZone", rule: "strongestAtk" });
  assert.deepEqual(soulResonance.operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: 200 }
  ]);
  assert.deepEqual(soulParry.operations, [
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -300 },
    { op: "gainShield", player: "self", amount: 300 }
  ]);
  assert.notEqual(typeof draw2, "function");
});

test("engine rejects free-code effects", () => {
  assert.throws(
    () => new GameEngine(makeState(), { cardEffects: { cheat: () => null } }),
    GameRuleError
  );
});

test("continuous equip spells stay in the spell trap zone and register effects", () => {
  const state = makeState({
    cards: [
      card("blade-1", { templateId: "blade-sigil", effect: "equipBlade" }),
      card("lancer-1", { type: "monster", templateId: "star-lancer", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["blade-1"],
      monsterZone: ["lancer-1"]
    }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      equipBlade: {
        duration: EffectDuration.continuous,
        target: { player: "self", zone: "monsterZone" },
        operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
      }
    }
  });

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "blade-1",
    targetCardId: "lancer-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].spellTrapZone, ["blade-1"]);
  assert.deepEqual(next.players[PLAYER].grave, []);
  assert.equal(next.cards["lancer-1"].tempAtk, 300);
  assert.deepEqual(next.continuousEffects, [
    {
      id: "continuous:blade-1",
      playerId: PLAYER,
      sourceCardId: "blade-1",
      effectId: "equipBlade",
      targetCardId: "lancer-1",
      operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
    }
  ]);
  assert.ok(events.some((event) => event.type === "CARD_MOVED" && event.to.zone === "spellTrapZone"));
  assert.ok(events.some((event) => event.type === "CONTINUOUS_EFFECT_REGISTERED" && event.sourceCardId === "blade-1"));
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "lancer-1" &&
    event.stat === "tempAtk" &&
    event.amount === 300 &&
    event.duration === EffectDuration.continuous
  ));
  assertValidGameState(next);
});

test("continuous equip spells support multiple stat modifiers", () => {
  const state = makeState({
    cards: [
      card("drive-1", { templateId: "prism-drive", effect: "equipPrism" }),
      card("guardian-1", { type: "monster", templateId: "iron-guardian", atk: 900, def: 2100 })
    ],
    player: {
      hand: ["drive-1"],
      monsterZone: ["guardian-1"]
    }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      equipPrism: {
        duration: EffectDuration.continuous,
        target: { player: "self", zone: "monsterZone" },
        operations: [
          { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
          { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: 200 }
        ]
      }
    }
  });

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "drive-1",
    targetCardId: "guardian-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["guardian-1"].tempAtk, 200);
  assert.equal(next.cards["guardian-1"].tempDef, 200);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.duration === EffectDuration.continuous).length, 2);
});

test("continuous equip spells release and revert stats when the source leaves play", () => {
  const state = makeState({
    cards: [
      card("blade-1", { templateId: "blade-sigil", effect: "equipBlade" }),
      card("shatter-1", { templateId: "shatter-sigil", effect: "destroySpellTrap" }),
      card("lancer-1", { type: "monster", templateId: "star-lancer", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["blade-1", "shatter-1"],
      monsterZone: ["lancer-1"]
    }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      equipBlade: {
        duration: EffectDuration.continuous,
        target: { player: "self", zone: "monsterZone" },
        operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
      },
      destroySpellTrap: {
        duration: EffectDuration.oneShot,
        target: { player: "self", zone: "spellTrapZone" },
        operations: [{ op: "destroyCard", cardId: "$action.targetCardId" }]
      }
    }
  });

  engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "blade-1",
    targetCardId: "lancer-1"
  });
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "shatter-1",
    targetCardId: "blade-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].spellTrapZone, []);
  assert.deepEqual(next.players[PLAYER].grave, ["shatter-1", "blade-1"]);
  assert.equal(next.cards["lancer-1"].tempAtk, 0);
  assert.deepEqual(next.continuousEffects, []);
  assert.ok(events.some((event) =>
    event.type === "CONTINUOUS_EFFECT_RELEASED" &&
    event.sourceCardId === "blade-1" &&
    event.targetCardId === "lancer-1" &&
    event.reason === "source-left-zone"
  ));
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "lancer-1" &&
    event.amount === -300 &&
    event.duration === EffectDuration.continuous
  ));
  assertValidGameState(next);
});

test("continuous equip spells release and revert stats when the target leaves play", () => {
  const state = makeState({
    cards: [
      card("blade-1", { templateId: "blade-sigil", effect: "equipBlade" }),
      card("banish-1", { templateId: "banish-test", effect: "destroyOwnMonster" }),
      card("lancer-1", { type: "monster", templateId: "star-lancer", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["blade-1", "banish-1"],
      monsterZone: ["lancer-1"]
    }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      equipBlade: {
        duration: EffectDuration.continuous,
        target: { player: "self", zone: "monsterZone" },
        operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
      },
      destroyOwnMonster: {
        duration: EffectDuration.oneShot,
        target: { player: "self", zone: "monsterZone" },
        operations: [{ op: "destroyCard", cardId: "$action.targetCardId" }]
      }
    }
  });

  engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "blade-1",
    targetCardId: "lancer-1"
  });
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "banish-1",
    targetCardId: "lancer-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, []);
  assert.deepEqual(next.players[PLAYER].spellTrapZone, []);
  assert.deepEqual(next.players[PLAYER].grave, ["banish-1", "blade-1", "lancer-1"]);
  assert.equal(next.cards["lancer-1"].tempAtk, 0);
  assert.deepEqual(next.continuousEffects, []);
  assert.ok(events.some((event) =>
    event.type === "CONTINUOUS_EFFECT_RELEASED" &&
    event.reason === "target-left-zone"
  ));
  assert.ok(events.some((event) =>
    event.type === "CARD_DESTROYED" &&
    event.cardId === "blade-1" &&
    event.reason === "continuous-target-left-zone"
  ));
  assertValidGameState(next);
});

test("dispelling ray destroys rival spell/trap cards and releases equipment bonuses", () => {
  const state = makeState({
    cards: [
      card("ray-1", { templateId: "dispelling-ray", effect: "destroySpellTrap" }),
      card("blade-ai", { ownerId: AI, templateId: "blade-sigil", effect: "equipBlade" }),
      card("lancer-ai", {
        ownerId: AI,
        type: "monster",
        templateId: "star-lancer",
        atk: 1800,
        def: 1000,
        tempAtk: 300
      })
    ],
    player: {
      hand: ["ray-1"]
    },
    ai: {
      spellTrapZone: ["blade-ai"],
      monsterZone: ["lancer-ai"]
    },
    continuousEffects: [
      {
        id: "continuous:blade-ai",
        playerId: AI,
        sourceCardId: "blade-ai",
        effectId: "equipBlade",
        targetCardId: "lancer-ai",
        operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
      }
    ]
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "ray-1",
    targetCardId: "blade-ai"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].grave, ["ray-1"]);
  assert.deepEqual(next.players[AI].spellTrapZone, []);
  assert.deepEqual(next.players[AI].grave, ["blade-ai"]);
  assert.equal(next.cards["lancer-ai"].tempAtk, 0);
  assert.deepEqual(next.continuousEffects, []);
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "blade-ai"));
  assert.ok(events.some((event) => event.type === "CONTINUOUS_EFFECT_RELEASED" && event.sourceCardId === "blade-ai"));
  assertValidGameState(next);
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

test("lethal damage declares game over through the event log", () => {
  const state = makeState({
    cards: [
      card("burst-lethal", { templateId: "burst-rune", effect: "burn500" })
    ],
    player: {
      hand: ["burst-lethal"]
    },
    ai: {
      lp: 400
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "burst-lethal" });
  const next = engine.getState();

  assert.equal(next.players[AI].lp, 0);
  assert.equal(next.gameOver.winnerId, PLAYER);
  assert.deepEqual(next.gameOver.loserIds, [AI]);
  assert.ok(events.some((event) =>
    event.type === "GAME_OVER_DECLARED" &&
    event.winnerId === PLAYER &&
    event.loserIds.includes(AI) &&
    event.triggerEventId
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

test("soul-resonance targets the strongest monster and resolves paired stat boosts", () => {
  const state = makeState({
    cards: [
      card("resonance-1", { templateId: "soul-resonance", effect: "soulResonance" }),
      card("low-1", { templateId: "ember-drake", type: "monster", atk: 1200, def: 900 }),
      card("high-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["resonance-1"],
      monsterZone: ["low-1", "high-1"]
    }
  });
  const legal = getLegalActions(state, PLAYER);
  assert.deepEqual(legal.actions.activateCard, [{
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "resonance-1",
    targetCardId: "high-1"
  }]);

  const failingEngine = new GameEngine(makeState({
    cards: [
      card("resonance-1", { templateId: "soul-resonance", effect: "soulResonance" }),
      card("low-1", { templateId: "ember-drake", type: "monster", atk: 1200, def: 900 }),
      card("high-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["resonance-1"],
      monsterZone: ["low-1", "high-1"]
    }
  }));
  assert.throws(
    () => failingEngine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "resonance-1",
      targetCardId: "low-1"
    }),
    /not the strongest monster/
  );
  assert.deepEqual(failingEngine.getState().players[PLAYER].hand, ["resonance-1"]);

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "resonance-1",
    targetCardId: "high-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["high-1"].tempAtk, 200);
  assert.equal(next.cards["high-1"].tempDef, 200);
  assert.equal(next.cards["low-1"].tempAtk || 0, 0);
  assert.deepEqual(next.players[PLAYER].grave, ["resonance-1"]);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === "high-1").length, 2);
  assertValidGameState(next);
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

test("starwake recall revives only legal graveyard monster targets", () => {
  const state = makeState({
    cards: [
      card("recall-1", { templateId: "starwake-recall", effect: "graveRevive" }),
      card("fallen-ace", {
        templateId: "astral-comet-ace",
        type: "monster",
        atk: 2300,
        def: 1800,
        mode: "defense",
        used: true,
        changedMode: true,
        tempAtk: 700,
        tempDef: -200,
        battleWear: 150,
        destructionProtectionUsed: true
      }),
      card("spent-spell", { templateId: "last-spark", effect: "comebackDraw" })
    ],
    player: {
      hand: ["recall-1"],
      grave: ["spent-spell", "fallen-ace"]
    }
  });
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "recall-1",
      targetCardId: "spent-spell"
    }),
    /requires a monster target/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["recall-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, ["spent-spell", "fallen-ace"]);

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "recall-1",
    targetCardId: "fallen-ace"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, ["fallen-ace"]);
  assert.deepEqual(next.players[PLAYER].grave, ["spent-spell", "recall-1"]);
  assert.equal(next.cards["fallen-ace"].mode, "attack");
  assert.equal(next.cards["fallen-ace"].used, false);
  assert.equal(next.cards["fallen-ace"].changedMode, false);
  assert.equal(next.cards["fallen-ace"].tempAtk, 0);
  assert.equal(next.cards["fallen-ace"].tempDef, 0);
  assert.equal(next.cards["fallen-ace"].battleWear, 0);
  assert.equal(next.cards["fallen-ace"].destructionProtectionUsed, false);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === "fallen-ace" &&
    event.from.zone === "grave" &&
    event.to.zone === "monsterZone"
  ));
  assert.ok(events.some((event) =>
    event.type === "MONSTER_SUMMONED" &&
    event.cardId === "fallen-ace" &&
    event.summonType === "special" &&
    event.fromZone === "grave" &&
    event.mode === "attack"
  ));
  assertValidGameState(next);
});

test("normal summon clears stale field state carried through other zones", () => {
  const state = makeState({
    cards: [card("recycled-1", {
      templateId: "spark-runner",
      type: "monster",
      atk: 800,
      def: 1200,
      mode: "defense",
      used: true,
      changedMode: true,
      tempAtk: 500,
      tempDef: -300,
      battleWear: 200,
      destructionProtectionUsed: true
    })],
    player: { hand: ["recycled-1"] }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "recycled-1", index: 0 });
  const summoned = engine.getState().cards["recycled-1"];

  assert.equal(summoned.mode, "attack");
  assert.equal(summoned.used, false);
  assert.equal(summoned.changedMode, false);
  assert.equal(summoned.tempAtk, 0);
  assert.equal(summoned.tempDef, 0);
  assert.equal(summoned.battleWear, 0);
  assert.equal(summoned.destructionProtectionUsed, false);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_SUMMONED"
    && event.cardId === "recycled-1"
    && event.summonType === "normal"
  ));
});

test("dawn edge and last stand surge apply protagonist attack boosts through stat events", () => {
  const state = makeState({
    cards: [
      card("edge-1", { templateId: "dawn-edge", effect: "dawnEdge" }),
      card("oath-1", { templateId: "limit-break-oath", effect: "lastStandSurge" }),
      card("ace-1", { templateId: "astral-comet-ace", type: "monster", atk: 2300, def: 1800 }),
      card("runner-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 })
    ],
    player: {
      lp: 900,
      hand: ["edge-1", "oath-1"],
      monsterZone: ["runner-1", "ace-1"]
    }
  });
  const engine = new GameEngine(state);
  const edgeEvents = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "edge-1",
    targetCardId: "ace-1"
  });
  const oathEvents = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "oath-1",
    targetCardId: "ace-1"
  });
  const next = engine.getState();

  assert.equal(next.cards["ace-1"].tempAtk, 1600);
  assert.equal(next.cards["runner-1"].tempAtk || 0, 0);
  assert.deepEqual(next.players[PLAYER].grave, ["edge-1", "oath-1"]);
  assert.ok(edgeEvents.some((event) => event.type === "STAT_MODIFIED" && event.amount === 900));
  assert.ok(oathEvents.some((event) => event.type === "STAT_MODIFIED" && event.amount === 700));
  assertValidGameState(next);

  const highLpState = makeState({
    cards: [
      card("oath-high", { templateId: "limit-break-oath", effect: "lastStandSurge" }),
      card("ace-high", { templateId: "astral-comet-ace", type: "monster", atk: 2300, def: 1800 })
    ],
    player: {
      lp: 2400,
      hand: ["oath-high"],
      monsterZone: ["ace-high"]
    }
  });
  const highLpEngine = new GameEngine(highLpState);
  assert.throws(
    () => highLpEngine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "oath-high",
      targetCardId: "ace-high"
    }),
    /requires LP at most 1500/
  );
  assert.equal(highLpEngine.getState().cards["ace-high"].tempAtk || 0, 0);
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
    event.sourceCardId === "rally-2" &&
    event.targetCardId === "lancer-2"
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
    event.sourceCardId === "trance-1" &&
    event.targetCardId === "lancer-1"
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

test("tribute summon moves selected field monsters to grave before summoning", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("vanguard-1", { templateId: "solar-vanguard", type: "monster", atk: 2300, def: 1700, tributeCost: 1 })
    ],
    player: {
      monsterZone: ["material-1"],
      hand: ["vanguard-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "vanguard-1",
    index: 0,
    tributeCardIds: ["material-1"]
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["vanguard-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["material-1"]);
  assert.equal(next.players[PLAYER].normalSummonsUsed, 1);
  assert.ok(events.some((event) => event.type === "CARD_TRIBUTED" && event.cardId === "material-1" && event.summonCardId === "vanguard-1"));
  assert.ok(events.some((event) =>
    event.type === "MONSTER_SUMMONED"
    && event.cardId === "vanguard-1"
    && event.summonType === "tribute"
  ));
  assertValidGameState(next);
});

test("tribute summon supports exact two-material costs", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("material-2", { templateId: "lumen-gearlet", type: "monster", atk: 900, def: 900 }),
      card("colossus-1", { templateId: "starfall-colossus", type: "monster", stars: 8, atk: 3200, def: 2600, tributeCost: 2 })
    ],
    player: {
      monsterZone: ["material-1", "material-2"],
      hand: ["colossus-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "colossus-1",
    index: 0,
    tributeCardIds: ["material-1", "material-2"]
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, ["colossus-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["material-1", "material-2"]);
  assert.equal(events.filter((event) => event.type === "CARD_TRIBUTED").length, 2);
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === "colossus-1"));
  assertValidGameState(next);
});

test("tribute summon supports exact three-material divine costs", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("material-2", { templateId: "lumen-gearlet", type: "monster", atk: 900, def: 900 }),
      card("material-3", { templateId: "ember-soul-initiate", type: "monster", atk: 700, def: 1000 }),
      card("divine-1", { templateId: "celestial-origin-dragon", type: "monster", stars: 10, atk: 4000, def: 4000, tributeCost: 3 })
    ],
    player: {
      hand: ["divine-1"],
      monsterZone: ["material-1", "material-2", "material-3"]
    }
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    cardId: "divine-1",
    index: 0,
    tributeCardIds: ["material-1", "material-2", "material-3"]
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["divine-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["material-1", "material-2", "material-3"]);
  assert.equal(events.filter((event) => event.type === "CARD_TRIBUTED").length, 3);
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === "divine-1"));
  assertValidGameState(next);
});

test("three-material divine summon rejects partial tribute selection without changing state", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("material-2", { templateId: "lumen-gearlet", type: "monster", atk: 900, def: 900 }),
      card("material-3", { templateId: "ember-soul-initiate", type: "monster", atk: 700, def: 1000 }),
      card("divine-1", { templateId: "celestial-origin-dragon", type: "monster", stars: 10, atk: 4000, def: 4000, tributeCost: 3 })
    ],
    player: {
      hand: ["divine-1"],
      monsterZone: ["material-1", "material-2", "material-3"]
    }
  });
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "SUMMON_MONSTER",
      playerId: PLAYER,
      cardId: "divine-1",
      index: 0,
      tributeCardIds: ["material-1", "material-2"]
    }),
    /requires exactly 3 tribute cards/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["divine-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["material-1", "material-2", "material-3"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("divine guard prevents the first destruction while the monster stays on field", () => {
  const state = makeState({
    cards: [
      card("divine-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        destructionProtection: { type: "divineGuard", uses: 1, refresh: "controllerTurn" }
      }),
      card("mirror-1", { templateId: "mirror-snare", ownerId: AI, type: "trap", trigger: "attackDestroy" })
    ],
    player: { monsterZone: ["divine-1"] },
    ai: { spellTrapZone: ["mirror-1"] },
    turn: { phase: Phase.battle },
    machine: { phase: Phase.battle, timing: Timing.battleOpen }
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "mirror-1",
    attackerCardId: "divine-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, ["divine-1"]);
  assert.deepEqual(next.players[PLAYER].grave, []);
  assert.deepEqual(next.players[AI].grave, ["mirror-1"]);
  assert.equal(next.cards["divine-1"].destructionProtectionUsed, true);
  assert.ok(events.some((event) => event.type === "CARD_DESTRUCTION_PREVENTED" && event.cardId === "divine-1" && event.sourceCardId === "mirror-1"));
  assert.equal(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "divine-1"), false);
  assertValidGameState(next);
});

test("divine guard does not prevent a second destruction before it resets", () => {
  const state = makeState({
    cards: [
      card("divine-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        destructionProtection: { type: "divineGuard", uses: 1, refresh: "controllerTurn" },
        destructionProtectionUsed: true
      }),
      card("mirror-1", { templateId: "mirror-snare", ownerId: AI, type: "trap", trigger: "attackDestroy" })
    ],
    player: { monsterZone: ["divine-1"] },
    ai: { spellTrapZone: ["mirror-1"] },
    turn: { phase: Phase.battle },
    machine: { phase: Phase.battle, timing: Timing.battleOpen }
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "mirror-1",
    attackerCardId: "divine-1"
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, []);
  assert.deepEqual(next.players[PLAYER].grave, ["divine-1"]);
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "divine-1" && event.sourceCardId === "mirror-1"));
  assert.equal(events.some((event) => event.type === "CARD_DESTRUCTION_PREVENTED"), false);
  assertValidGameState(next);
});

test("divine guard resets at the controller turn start through monster reset events", () => {
  const state = makeState({
    cards: [
      card("divine-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        destructionProtection: { type: "divineGuard", uses: 1, refresh: "controllerTurn" },
        destructionProtectionUsed: true
      })
    ],
    player: { monsterZone: ["divine-1"] },
    turn: { playerId: AI, phase: Phase.end },
    machine: { phase: Phase.end, timing: Timing.end }
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "START_TURN", playerId: PLAYER });
  const next = engine.getState();

  assert.equal(next.cards["divine-1"].destructionProtectionUsed, false);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_TURN_RESET" &&
    event.cardId === "divine-1" &&
    event.beforeDestructionProtectionUsed === true &&
    event.afterDestructionProtectionUsed === false
  ));
  assertValidGameState(next);
});

test("legal action projection includes tribute ids for high-cost summons", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("material-2", { templateId: "lumen-gearlet", type: "monster", atk: 900, def: 900 }),
      card("colossus-1", { templateId: "starfall-colossus", type: "monster", stars: 8, atk: 3200, def: 2600, tributeCost: 2 })
    ],
    player: {
      monsterZone: ["material-1", "material-2"],
      hand: ["colossus-1"]
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.actions.summon.length, 1);
  assert.deepEqual(legal.actions.summon[0].tributeCardIds, ["material-1", "material-2"]);
});

test("tribute summon rejects missing or illegal tribute cards without changing state", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("vanguard-1", { templateId: "solar-vanguard", type: "monster", atk: 2300, def: 1700, tributeCost: 1 })
    ],
    player: {
      monsterZone: ["material-1"],
      hand: ["vanguard-1"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "vanguard-1", index: 1 }),
    /requires exactly 1 tribute/
  );
  assert.throws(
    () => engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "vanguard-1", index: 1, tributeCardIds: ["vanguard-1"] }),
    /not in player\.monsterZone/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["vanguard-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["material-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
});

test("fusion summon sends selected field materials to grave and summons result from deck", () => {
  const state = makeState({
    cards: [
      card("fusion-1", {
        templateId: "starforge-fusion",
        effect: "fusionSummon",
        fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
      }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400 }),
      card("archon-1", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 })
    ],
    player: {
      hand: ["fusion-1"],
      monsterZone: ["ember-1", "gale-1"],
      deck: ["archon-1"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "fusion-1",
    materialCardIds: ["ember-1", "gale-1"],
    index: 0
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["archon-1"]);
  assert.deepEqual(next.players[PLAYER].grave, ["fusion-1", "ember-1", "gale-1"]);
  assert.ok(events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "fusion-1"));
  assert.ok(events.some((event) => event.type === "MATERIALS_SENT" && event.purpose === "fusion" && event.sourceCardId === "fusion-1"));
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === "archon-1" && event.summonType === "fusion"));
  assert.ok(events.some((event) => event.type === "FUSION_SUMMONED" && event.cardId === "archon-1"));
  assertValidGameState(next);
});

test("fusion summon accepts a deterministic mix of hand and field materials", () => {
  const state = makeState({
    cards: [
      card("fusion-1", {
        templateId: "starforge-fusion",
        effect: "fusionSummon",
        fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
      }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400 }),
      card("archon-1", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 })
    ],
    player: {
      hand: ["fusion-1", "gale-1"],
      monsterZone: ["ember-1"],
      deck: ["archon-1"]
    }
  });
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "fusion-1",
    materialCardIds: ["ember-1", "gale-1"],
    index: 0
  });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["archon-1"]);
  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.deepEqual(next.players[PLAYER].grave, ["fusion-1", "ember-1", "gale-1"]);
  assert.equal(next.players[PLAYER].normalSummonsUsed, 0);
  assert.ok(events.some((event) => event.type === "CARD_MOVED" && event.cardId === "gale-1" && event.from?.zone === "hand" && event.to?.zone === "grave"));
  assert.ok(events.some((event) => event.type === "FUSION_SUMMONED" && event.materialCardIds.includes("gale-1")));
  assertValidGameState(next);
});

test("multi-result fusion requires an explicit result and resolves the selected recipe", () => {
  const fusion = {
    options: [
      { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] },
      { result: "tempest-aegis-archon", materials: ["ember-drake", "gale-mage"] }
    ]
  };
  const state = makeState({
    cards: [
      card("fusion-1", { templateId: "starforge-fusion", effect: "fusionSummon", fusion }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400 }),
      card("attack-archon", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 }),
      card("guard-archon", { templateId: "tempest-aegis-archon", type: "monster", atk: 2000, def: 2600, onSummon: "shield400" })
    ],
    player: {
      hand: ["fusion-1", "gale-1"],
      monsterZone: ["ember-1"],
      deck: ["attack-archon", "guard-archon"]
    }
  });
  const engine = new GameEngine(state);
  const action = {
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "fusion-1",
    materialCardIds: ["ember-1", "gale-1"],
    index: 0
  };

  const legalResults = getLegalActions(state, PLAYER).actions.activateCard
    .filter((candidate) => candidate.cardId === "fusion-1")
    .map((candidate) => candidate.fusionResultTemplateId)
    .sort();
  assert.deepEqual(legalResults, ["flare-gale-archon", "tempest-aegis-archon"]);
  assert.throws(() => engine.dispatch(action), /explicit fusion result selection/);
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["fusion-1", "gale-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["ember-1"]);

  const events = engine.dispatch({ ...action, fusionResultTemplateId: "tempest-aegis-archon" });
  const next = engine.getState();
  assert.deepEqual(next.players[PLAYER].monsterZone, ["guard-archon"]);
  assert.deepEqual(next.players[PLAYER].deck, ["attack-archon"]);
  assert.equal(next.players[PLAYER].shield, 400);
  assert.ok(events.some((event) => event.type === "FUSION_SUMMONED" && event.resultTemplateId === "tempest-aegis-archon"));
  assert.ok(events.some((event) => event.type === "SHIELD_GAINED" && event.amount === 400));
  assertValidGameState(next);
});

test("fusion summon rejects wrong materials without changing state", () => {
  const state = makeState({
    cards: [
      card("fusion-1", {
        templateId: "starforge-fusion",
        effect: "fusionSummon",
        fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
      }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("wrong-1", { templateId: "solar-knight", type: "monster", atk: 1700, def: 1200 }),
      card("archon-1", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 })
    ],
    player: {
      hand: ["fusion-1"],
      monsterZone: ["ember-1", "wrong-1"],
      deck: ["archon-1"]
    }
  });
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "fusion-1",
      materialCardIds: ["ember-1", "wrong-1"],
      index: 0
    }),
    /does not match required materials/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["fusion-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["ember-1", "wrong-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].deck, ["archon-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, []);
  assert.deepEqual(engine.getState().events, []);
});

test("split token spell creates generated monster cards from card definitions", () => {
  const state = makeState({
    cards: [
      card("split-1", { templateId: "spark-split", effect: "splitToken" }),
      card("runner-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 })
    ],
    player: {
      hand: ["split-1"],
      monsterZone: ["runner-1"]
    }
  });
  state.cardDefinitions = {
    "spark-fragment-token": {
      id: "spark-fragment-token",
      type: "monster",
      name: "星火衍生体",
      element: "wind",
      stars: 1,
      atk: 500,
      def: 500,
      token: true
    }
  };

  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "split-1",
    targetCardId: "runner-1"
  });
  const next = engine.getState();
  const created = events.filter((event) => event.type === "CARD_CREATED");
  const tokenSummons = events.filter((event) => event.type === "MONSTER_SUMMONED" && event.summonType === "token");

  assert.equal(created.length, 2);
  assert.equal(tokenSummons.length, 2);
  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].grave, ["split-1"]);
  assert.equal(next.players[PLAYER].monsterZone.length, 3);
  created.forEach((event) => {
    const token = next.cards[event.cardId];
    assert.equal(token.templateId, "spark-fragment-token");
    assert.equal(token.ownerId, PLAYER);
    assert.equal(token.type, "monster");
    assert.equal(token.atk, 500);
    assert.equal(token.token, true);
  });
  assertValidGameState(next);
});

test("split token spell rejects missing token template or monster-zone space without changing state", () => {
  const fullState = makeState({
    cards: [
      card("split-1", { templateId: "spark-split", effect: "splitToken" }),
      card("runner-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("ally-1", { templateId: "solar-knight", type: "monster" }),
      card("ally-2", { templateId: "gale-mage", type: "monster" }),
      card("ally-3", { templateId: "ember-drake", type: "monster" })
    ],
    player: {
      hand: ["split-1"],
      monsterZone: ["runner-1", "ally-1", "ally-2", "ally-3"]
    }
  });
  fullState.cardDefinitions = {
    "spark-fragment-token": { id: "spark-fragment-token", type: "monster", atk: 500, def: 500 }
  };
  const fullEngine = new GameEngine(fullState);
  const fullBefore = fullEngine.getState();

  assert.throws(
    () => fullEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "split-1", targetCardId: "runner-1" }),
    /empty monster zone/
  );
  assert.deepEqual(fullEngine.getState(), fullBefore);

  const missingTemplateState = makeState({
    cards: [
      card("split-1", { templateId: "spark-split", effect: "splitToken" }),
      card("runner-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 })
    ],
    player: {
      hand: ["split-1"],
      monsterZone: ["runner-1"]
    }
  });
  const missingEngine = new GameEngine(missingTemplateState);

  assert.throws(
    () => missingEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "split-1", targetCardId: "runner-1" }),
    /Token template spark-fragment-token is not available/
  );
  assert.deepEqual(missingEngine.getState().players[PLAYER].hand, ["split-1"]);
  assert.deepEqual(missingEngine.getState().players[PLAYER].monsterZone, ["runner-1"]);
});

test("legal action projection includes fusion material ids", () => {
  const state = makeState({
    cards: [
      card("fusion-1", {
        templateId: "starforge-fusion",
        effect: "fusionSummon",
        fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
      }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400 }),
      card("archon-1", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 })
    ],
    player: {
      hand: ["fusion-1"],
      monsterZone: ["ember-1", "gale-1"],
      deck: ["archon-1"]
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.actions.activateCard.length, 1);
  assert.deepEqual(legal.actions.activateCard[0].materialCardIds, ["ember-1", "gale-1"]);
  assert.equal(legal.actions.activateCard[0].index, 0);
});

test("legal action projection discovers fusion materials across hand and field", () => {
  const state = makeState({
    cards: [
      card("fusion-1", {
        templateId: "starforge-fusion",
        effect: "fusionSummon",
        fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
      }),
      card("ember-1", { templateId: "ember-drake", type: "monster", atk: 1500, def: 900 }),
      card("gale-1", { templateId: "gale-mage", type: "monster", atk: 1200, def: 1400 }),
      card("archon-1", { templateId: "flare-gale-archon", type: "monster", atk: 2400, def: 1800 })
    ],
    player: {
      hand: ["fusion-1", "gale-1"],
      monsterZone: ["ember-1"],
      deck: ["archon-1"]
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.actions.activateCard.length, 1);
  assert.deepEqual(legal.actions.activateCard[0].materialCardIds, ["ember-1", "gale-1"]);
  assert.equal(legal.actions.activateCard[0].index, 0);
});

test("non-tribute monsters cannot consume field monsters as tribute", () => {
  const state = makeState({
    cards: [
      card("material-1", { templateId: "spark-runner", type: "monster", atk: 800, def: 1200 }),
      card("lancer-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      monsterZone: ["material-1"],
      hand: ["lancer-1"]
    }
  });

  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "SUMMON_MONSTER",
      playerId: PLAYER,
      cardId: "lancer-1",
      index: 1,
      tributeCardIds: ["material-1"]
    }),
    /does not require tribute/
  );
  engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "lancer-1", index: 1 });
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["material-1", "lancer-1"]);
});

test("existing high-star monsters remain summonable unless a tribute cost is defined", () => {
  const state = makeState({
    cards: [
      card("titan-1", { templateId: "flare-titan", type: "monster", stars: 5, atk: 2200, def: 1500 })
    ],
    player: {
      hand: ["titan-1"]
    }
  });

  const engine = new GameEngine(state);
  engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "titan-1", index: 0 });

  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["titan-1"]);
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
  state.abilities[PLAYER] = [
    { ability: Ability.extraSummon, uses: 1, duration: "turn", sourceCardId: "basic-summon-test" }
  ];

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
  state.abilities[PLAYER] = [
    { ability: Ability.extraSummon, uses: 1, duration: "turn", sourceCardId: "conditional-summon-test" }
  ];

  const engine = new GameEngine(state);
  const buffEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "captain-1", index: 0 });
  const burnEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: "alchemist-1", index: 1 });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].monsterZone, ["captain-1", "alchemist-1"]);
  assert.equal(next.cards["captain-1"].tempAtk, 0);
  assert.equal(next.players[AI].lp, 4000);
  assert.ok(buffEvents.some((event) => event.type === "EFFECT_SKIPPED" && event.effectId === "fireBuff"));
  assert.ok(burnEvents.some((event) => event.type === "EFFECT_SKIPPED" && event.effectId === "shadowBurn"));
  assertValidGameState(next);
});

test("basic expansion summon effects resolve or skip from declarative requirements", () => {
  const surveyState = makeState({
    cards: [
      card("wind-ally", { templateId: "gale-mage", type: "monster", element: "wind", atk: 1200, def: 1400 }),
      card("apprentice-1", {
        templateId: "star-soul-apprentice",
        type: "monster",
        element: "light",
        atk: 1100,
        def: 1300,
        onSummon: "starSoulSurvey"
      }),
      card("deck-1", { templateId: "solar-knight", type: "monster", element: "light", atk: 1700, def: 1200 })
    ],
    player: {
      monsterZone: ["wind-ally"],
      hand: ["apprentice-1"],
      deck: ["deck-1"]
    }
  });
  const surveyEngine = new GameEngine(surveyState);
  const surveyEvents = surveyEngine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "apprentice-1",
    index: 1
  });

  assert.deepEqual(surveyEngine.getState().players[PLAYER].hand, ["deck-1"]);
  assert.ok(surveyEvents.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.sourceCardId === "apprentice-1" &&
    event.cardIds.includes("deck-1")
  ));

  const shelterState = makeState({
    cards: [
      card("shadow-ally", { templateId: "night-oracle", type: "monster", element: "shadow", atk: 1100, def: 1600 }),
      card("bulwark-1", {
        templateId: "rift-bulwark",
        type: "monster",
        element: "shadow",
        atk: 1300,
        def: 1900,
        onSummon: "riftShelter"
      })
    ],
    player: {
      monsterZone: ["shadow-ally"],
      hand: ["bulwark-1"]
    }
  });
  const shelterEngine = new GameEngine(shelterState);
  const shelterEvents = shelterEngine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "bulwark-1",
    index: 1
  });

  assert.equal(shelterEngine.getState().players[PLAYER].shield, 300);
  assert.ok(shelterEvents.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.amount === 300 &&
    event.sourceCardId === "bulwark-1"
  ));

  const skippedState = makeState({
    cards: [
      card("apprentice-skip", {
        templateId: "star-soul-apprentice",
        type: "monster",
        element: "light",
        atk: 1100,
        def: 1300,
        onSummon: "starSoulSurvey"
      }),
      card("deck-skip", { templateId: "solar-knight", type: "monster", element: "light", atk: 1700, def: 1200 })
    ],
    player: {
      hand: ["apprentice-skip"],
      deck: ["deck-skip"]
    }
  });
  const skippedEngine = new GameEngine(skippedState);
  const skippedEvents = skippedEngine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "apprentice-skip",
    index: 0
  });

  assert.deepEqual(skippedEngine.getState().players[PLAYER].monsterZone, ["apprentice-skip"]);
  assert.deepEqual(skippedEngine.getState().players[PLAYER].deck, ["deck-skip"]);
  assert.ok(skippedEvents.some((event) =>
    event.type === "EFFECT_SKIPPED" &&
    event.effectId === "starSoulSurvey" &&
    /distinct elements/.test(event.reason)
  ));
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
    cards: [
      card("switch-1", { templateId: "phantom-switch", type: "trap", trigger: "redirectAttack" }),
      card("attacker-redirect", { templateId: "sky-raider", ownerId: AI, type: "monster", atk: 2050, def: 900 }),
      card("old-target", { templateId: "dusk-alchemist", type: "monster", atk: 1500, def: 1500 }),
      card("new-target", { templateId: "iron-guardian", type: "monster", atk: 900, def: 2200, mode: "defense" })
    ],
    player: {
      spellTrapZone: ["switch-1"],
      monsterZone: ["old-target", "new-target"]
    },
    ai: { monsterZone: ["attacker-redirect"] },
    turn: { playerId: AI, phase: Phase.battle },
    machine: {
      pendingAttack: {
        playerId: AI,
        rivalId: PLAYER,
        attackerCardId: "attacker-redirect",
        targetCardId: "old-target",
        targetPlayerId: null,
        direct: false,
        declarationEventId: 42,
        timing: Timing.attackDeclaration
      }
    }
  });
  redirectState.machine.phase = Phase.battle;
  redirectState.machine.timing = Timing.attackDeclaration;
  const redirectEngine = new GameEngine(redirectState);
  const redirectEvents = redirectEngine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "switch-1",
    attackerCardId: "attacker-redirect",
    targetCardId: "new-target"
  });

  assert.deepEqual(redirectEngine.getState().players[PLAYER].spellTrapZone, []);
  assert.deepEqual(redirectEngine.getState().players[PLAYER].grave, ["switch-1"]);
  assert.ok(redirectEvents.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "switch-1"));
  assert.ok(redirectEvents.some((event) =>
    event.type === "ATTACK_TARGET_CHANGED" &&
    event.fromTargetCardId === "old-target" &&
    event.toTargetCardId === "new-target"
  ));
  assert.equal(redirectEngine.getState().machine.pendingAttack.targetCardId, "new-target");
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

test("soul-parry weakens attackers, gains shield, and requires attacker context", () => {
  const state = makeState({
    cards: [
      card("parry-1", { templateId: "soul-parry", type: "trap", trigger: "soulParry" }),
      card("attacker-1", { templateId: "star-lancer", ownerId: AI, type: "monster", atk: 1800, def: 1000 })
    ],
    player: {
      spellTrapZone: ["parry-1"]
    },
    ai: {
      monsterZone: ["attacker-1"]
    },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const events = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "parry-1",
    attackerCardId: "attacker-1"
  });

  assert.equal(engine.getState().cards["attacker-1"].tempAtk, -300);
  assert.equal(engine.getState().players[PLAYER].shield, 300);
  assert.deepEqual(engine.getState().players[PLAYER].grave, ["parry-1"]);
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === "attacker-1" &&
    event.amount === -300 &&
    event.sourceCardId === "parry-1"
  ));
  assert.ok(events.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.amount === 300 &&
    event.sourceCardId === "parry-1"
  ));

  const failingState = makeState({
    cards: [card("parry-fail", { templateId: "soul-parry", type: "trap", trigger: "soulParry" })],
    player: {
      spellTrapZone: ["parry-fail"]
    },
    turn: { phase: Phase.battle }
  });
  failingState.machine.phase = Phase.battle;
  failingState.machine.timing = Timing.battleOpen;
  const failingEngine = new GameEngine(failingState);

  assert.throws(
    () => failingEngine.dispatch({
      type: "ACTIVATE_TRAP",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "parry-fail"
    }),
    /requires action.attackerCardId/
  );
  assert.deepEqual(failingEngine.getState().players[PLAYER].spellTrapZone, ["parry-fail"]);
  assert.deepEqual(failingEngine.getState().players[PLAYER].grave, []);
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

test("battle resolution applies piercing damage only for configured defense breakers", () => {
  const normalState = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 2500, def: 1000 }),
      card("guard-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: { monsterZone: ["attacker-1"] },
    ai: { monsterZone: ["guard-1"] },
    turn: { phase: Phase.battle }
  });
  normalState.machine.phase = Phase.battle;
  normalState.machine.timing = Timing.battleOpen;
  const normalEngine = new GameEngine(normalState);
  const normalEvents = normalEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "guard-1"
  });

  assert.equal(normalEngine.getState().players[AI].lp, 4000);
  assert.equal(normalEvents.some((event) => event.type === "DAMAGE_DEALT"), false);
  assert.ok(normalEvents.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "breakDefense"));

  const pierceState = makeState({
    cards: [
      card("divine-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        piercingDamage: { type: "divinePierce" }
      }),
      card("guard-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" })
    ],
    player: { monsterZone: ["divine-1"] },
    ai: { monsterZone: ["guard-1"], shield: 400 },
    turn: { phase: Phase.battle }
  });
  pierceState.machine.phase = Phase.battle;
  pierceState.machine.timing = Timing.battleOpen;
  const pierceEngine = new GameEngine(pierceState);
  const pierceEvents = pierceEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "divine-1",
    targetCardId: "guard-1"
  });
  const next = pierceEngine.getState();

  assert.equal(next.players[AI].shield, 0);
  assert.equal(next.players[AI].lp, 2500);
  assert.deepEqual(next.players[AI].grave, ["guard-1"]);
  assert.ok(pierceEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.requested === 1900 && event.blocked === 400 && event.amount === 1500));
  assert.ok(pierceEvents.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "pierceDefense" && event.outcome?.piercing === true));
  assertValidGameState(next);
});

test("battle resolution applies divine pressure only from configured damage sources", () => {
  const normalState = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 })
    ],
    player: { monsterZone: ["attacker-1"] },
    ai: { monsterZone: [], shield: 800 },
    turn: { phase: Phase.battle }
  });
  normalState.machine.phase = Phase.battle;
  normalState.machine.timing = Timing.battleOpen;
  const normalEngine = new GameEngine(normalState);
  const normalEvents = normalEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1"
  });

  assert.equal(normalEngine.getState().players[AI].shield, 0);
  assert.equal(normalEngine.getState().players[AI].lp, 3000);
  assert.ok(normalEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.shieldPierced === 0 && event.blocked === 800 && event.amount === 1000));

  const divineState = makeState({
    cards: [
      card("divine-1", {
        templateId: "celestial-origin-dragon",
        type: "monster",
        atk: 4000,
        def: 4000,
        shieldPierce: { type: "divinePressure", amount: 500 }
      })
    ],
    player: { monsterZone: ["divine-1"] },
    ai: { monsterZone: [], shield: 800 },
    turn: { phase: Phase.battle }
  });
  divineState.machine.phase = Phase.battle;
  divineState.machine.timing = Timing.battleOpen;
  const divineEngine = new GameEngine(divineState);
  const divineEvents = divineEngine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "divine-1"
  });
  const next = divineEngine.getState();

  assert.equal(next.players[AI].shield, 0);
  assert.equal(next.players[AI].lp, 300);
  assert.ok(divineEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === AI && event.requested === 4000 && event.shieldPierced === 500 && event.blocked === 300 && event.amount === 3700));
  assert.ok(divineEvents.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "direct" && event.outcome?.shieldPierced === 500));
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
  assert.equal(next.machine.pendingAttack.playerId, PLAYER);
  assert.equal(next.machine.pendingAttack.rivalId, AI);
  assert.equal(next.machine.pendingAttack.attackerCardId, "attacker-1");
  assert.equal(next.machine.pendingAttack.targetCardId, "target-1");
  assert.equal(next.machine.pendingAttack.declarationEventId, declared.id);
  assert.equal(next.machine.responseWindow.playerId, AI);
  assert.equal(next.machine.responseWindow.type, ResponseWindow.optional);
  assert.equal(next.machine.responseWindow.timing, Timing.attackDeclaration);
  assert.equal(next.machine.actionWindow.window, ActionWindow.response);
  assert.equal(declared.targetCardId, "target-1");
  assert.equal(windowOpened.triggerEventId, declared.id);
  assert.equal(windowOpened.context.attackerCardId, "attacker-1");
  assert.equal(windowOpened.context.targetCardId, "target-1");
  assert.ok(events.some((event) => event.type === "TIMING_CHANGED" && event.to === Timing.attackDeclaration));
  assert.ok(!events.some((event) => event.type === "DAMAGE_DEALT"));
  assert.ok(!events.some((event) => event.type === "MONSTER_USED"));
  assertValidGameState(next);
});

test("redirect trap updates pending attack and battle resolves against the new defender", () => {
  const state = makeState({
    cards: [
      card("sky-1", { templateId: "sky-raider", ownerId: AI, type: "monster", atk: 1550, def: 900, tempAtk: 500 }),
      card("dusk-1", { templateId: "dusk-alchemist", type: "monster", atk: 1450, def: 1500, tempAtk: 50 }),
      card("guard-1", { templateId: "iron-guardian", type: "monster", atk: 900, def: 2100, tempDef: 100, mode: "defense" }),
      card("switch-1", { templateId: "phantom-switch", type: "trap", trigger: "redirectAttack" })
    ],
    player: {
      monsterZone: ["dusk-1", "guard-1"],
      spellTrapZone: ["switch-1"],
      shield: 550
    },
    ai: {
      monsterZone: ["sky-1"]
    },
    turn: {
      playerId: AI,
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: "sky-1",
    targetCardId: "dusk-1"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  assert.equal(engine.getState().machine.pendingAttack.targetCardId, "dusk-1");

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "switch-1",
    effectId: "redirectAttack",
    targetEffectId: declaration.id
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "switch-1",
    attackerCardId: "sky-1",
    targetCardId: "guard-1",
    targetEffectId: declaration.id
  });
  const chainEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  const redirectEvent = chainEvents.find((event) => event.type === "ATTACK_TARGET_CHANGED");
  assert.equal(redirectEvent.fromTargetCardId, "dusk-1");
  assert.equal(redirectEvent.toTargetCardId, "guard-1");
  assert.equal(engine.getState().machine.pendingAttack.targetCardId, "guard-1");
  assert.equal(projectMachineStateFromEvents(engine.getState().events, Phase.battle).pendingAttack.targetCardId, "guard-1");

  const battleEvents = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: "sky-1",
    targetCardId: "guard-1",
    declarationEventId: declaration.id
  });
  const battleResolved = battleEvents.find((event) => event.type === "BATTLE_RESOLVED");
  assert.equal(battleResolved.targetCardId, "guard-1");
  assert.equal(battleResolved.outcome.kind, "guardCounter");
  assert.equal(battleResolved.outcome.diff, -150);
  assert.ok(!battleEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === PLAYER && event.requested === 550));
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["dusk-1", "guard-1"]);
  assert.deepEqual(engine.getState().players[PLAYER].grave, ["switch-1"]);
  assert.equal(engine.getState().players[PLAYER].shield, 550);
  assert.equal(engine.getState().players[AI].lp, MAX_LP - 150);
});

test("pending attack blocks auto-end and turn handoff until battle resolves or is canceled", () => {
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
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");

  engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: AI, reason: "declined" });
  let next = engine.getState();
  assert.equal(next.turn.phase, Phase.battle);
  assert.equal(next.machine.phase, Phase.battle);
  assert.equal(next.machine.responseWindow, null);
  assert.equal(next.machine.pendingAttack.declarationEventId, declaration.id);

  assert.throws(
    () => engine.dispatch({
      type: "DECLARE_ATTACK",
      playerId: PLAYER,
      rivalId: AI,
      attackerCardId: "attacker-1",
      targetCardId: "target-1"
    }),
    /another attack is pending/
  );
  assert.throws(
    () => engine.dispatch({
      type: "REQUEST_AUTO_END",
      playerId: PLAYER,
      requestedAt: 2000,
      timeoutSeconds: 2
    }),
    /attack is pending/
  );
  assert.throws(
    () => engine.dispatch({ type: "END_TURN", playerId: PLAYER }),
    /attack is pending/
  );
  assert.throws(
    () => engine.dispatch({ type: "COMMIT_AUTO_END", playerId: PLAYER, committedAt: 2200 }),
    /attack is pending/
  );
  assert.throws(
    () => engine.dispatch({ type: "CHANGE_PHASE", playerId: PLAYER, phase: Phase.end }),
    /attack is pending/
  );
  assert.throws(
    () => engine.dispatch({ type: "START_TURN", playerId: AI }),
    /attack is pending/
  );

  const legal = getLegalActions(engine.getState(), PLAYER);
  assert.equal(legal.hasAny, false);
  assert.equal(legal.can.endTurn, false);

  engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1",
    declarationEventId: declaration.id
  });
  next = engine.getState();
  assert.equal(next.machine.pendingAttack, null);
  assert.equal(next.turn.phase, Phase.battle);
  assert.equal(next.cards["attacker-1"].used, true);
});

test("canceling a responded attack clears pending attack and optionally consumes the attacker", () => {
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
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: AI, reason: "trap-resolved" });
  const cancelEvents = engine.dispatch({
    type: "CANCEL_ATTACK",
    playerId: PLAYER,
    declarationEventId: declaration.id,
    consumeAttack: true,
    reason: "attackNegate"
  });
  const next = engine.getState();

  assert.equal(next.machine.pendingAttack, null);
  assert.equal(next.turn.phase, Phase.battle);
  assert.equal(next.cards["attacker-1"].used, true);
  assert.ok(cancelEvents.some((event) => event.type === "MONSTER_USED" && event.reason === "attackCanceled"));
  assert.ok(cancelEvents.some((event) => event.type === "ATTACK_CANCELED" && event.declarationEventId === declaration.id));
  assertValidGameState(next);
});

test("chain resolution cancels pending attack when the attacker leaves the monster zone", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("target-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" }),
      card("mirror-1", { templateId: "mirror-snare", ownerId: AI, type: "trap", trigger: "attackDestroy" })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["target-1"],
      spellTrapZone: ["mirror-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: AI,
    cardId: "mirror-1",
    effectId: "attackDestroy",
    targetEffectId: declaration.id
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "mirror-1",
    attackerCardId: "attacker-1",
    targetEffectId: declaration.id
  });
  const chainEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: AI });
  const next = engine.getState();

  assert.equal(next.machine.pendingAttack, null);
  assert.equal(next.machine.responseWindow, null);
  assert.deepEqual(next.players[PLAYER].grave, ["attacker-1"]);
  assert.deepEqual(next.players[AI].grave, ["mirror-1"]);
  assert.ok(chainEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "attacker-1"));
  assert.ok(chainEvents.some((event) =>
    event.type === "ATTACK_CANCELED" &&
    event.declarationEventId === declaration.id &&
    event.reason === "attacker-left-field" &&
    event.consumeAttack === false
  ));
  assertValidGameState(next);
});

test("chain resolution cancels pending attack when the declared target leaves the monster zone", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { templateId: "star-lancer", type: "monster", atk: 1800, def: 1000 }),
      card("target-1", { templateId: "iron-guardian", ownerId: AI, type: "monster", atk: 900, def: 2100, mode: "defense" }),
      card("target-break-1", { templateId: "target-break-test", ownerId: AI, type: "trap", trigger: "destroyDeclaredTarget" })
    ],
    player: {
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["target-1"],
      spellTrapZone: ["target-break-1"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state, {
    cardEffects: {
      destroyDeclaredTarget: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "destroyCard", cardId: "$action.targetCardId" }]
      }
    }
  });
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "target-1"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: AI,
    cardId: "target-break-1",
    effectId: "destroyDeclaredTarget",
    targetEffectId: declaration.id
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "target-break-1",
    attackerCardId: "attacker-1",
    targetCardId: "target-1",
    targetEffectId: declaration.id
  });
  const chainEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: AI });
  const next = engine.getState();

  assert.equal(next.machine.pendingAttack, null);
  assert.equal(next.machine.responseWindow, null);
  assert.deepEqual(next.players[AI].grave, ["target-break-1", "target-1"]);
  assert.equal(next.cards["attacker-1"].used, undefined);
  assert.ok(chainEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === "target-1"));
  assert.ok(chainEvents.some((event) =>
    event.type === "ATTACK_CANCELED" &&
    event.declarationEventId === declaration.id &&
    event.reason === "target-left-field" &&
    event.consumeAttack === false
  ));
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

test("after-attack monster effects use the configured effect DSL registry", () => {
  const state = makeState({
    cards: [
      card("custom-1", { templateId: "custom-after", type: "monster", atk: 1200, def: 900, afterAttack: "customAfterAttack" }),
      card("draw-custom", { templateId: "ember-drake", type: "monster" })
    ],
    player: {
      monsterZone: ["custom-1"],
      deck: ["draw-custom"]
    },
    turn: {
      phase: Phase.battle
    }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state, {
    cardEffects: {
      customAfterAttack: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "drawCards", player: "self", count: 1 }]
      }
    }
  });

  const events = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "custom-1"
  });

  assert.deepEqual(engine.getState().players[PLAYER].hand, ["draw-custom"]);
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === "custom-1"));
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

test("skipping remaining attacks is an event-sourced turn lock", () => {
  const state = makeState({
    cards: [
      card("ready-1", { type: "monster", mode: "attack", used: false }),
      card("used-1", { type: "monster", mode: "attack", used: true }),
      card("guard-1", { type: "monster", mode: "defense", used: false })
    ],
    player: { monsterZone: ["ready-1", "used-1", "guard-1"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.attackReset, uses: 2, duration: "turn", sourceCardId: "reset-source" },
    { ability: Ability.directAttack, uses: 1, duration: "turn", sourceCardId: "direct-source" },
    { ability: Ability.extraSummon, uses: 1, duration: "turn", sourceCardId: "summon-source" }
  ];
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "SKIP_REMAINING_ATTACKS", playerId: PLAYER });
  const next = engine.getState();

  assert.equal(next.cards["ready-1"].used, true);
  assert.equal(next.cards["used-1"].used, true);
  assert.equal(next.cards["guard-1"].used, false);
  assert.equal(hasAbility(next, PLAYER, Ability.skipAttackLock), true);
  assert.equal(hasAbility(next, PLAYER, Ability.attackReset), false);
  assert.equal(hasAbility(next, PLAYER, Ability.directAttack), false);
  assert.equal(hasAbility(next, PLAYER, Ability.extraSummon), true);
  assert.equal(events.filter((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.attackReset).length, 2);
  assert.ok(events.some((event) => event.type === "ATTACKS_SKIPPED" && event.cardIds.includes("ready-1")));
  assert.throws(
    () => engine.dispatch({ type: "DECLARE_ATTACK", playerId: PLAYER, rivalId: AI, attackerCardId: "guard-1" }),
    /skipped attacks/
  );
});

test("attack reset is spent and readies a surviving attacker through battle events", () => {
  const state = makeState({
    cards: [card("reset-attacker", { type: "monster", atk: 1500, def: 1000, mode: "attack", used: false })],
    player: { monsterZone: ["reset-attacker"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.attackReset, uses: 1, duration: "turn", sourceCardId: "reset-source" }
  ];
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "reset-attacker"
  });

  assert.equal(engine.getState().cards["reset-attacker"].used, false);
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.attackReset), false);
  assert.ok(events.some((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.attackReset));
  assert.ok(events.some((event) => event.type === "MONSTER_READIED" && event.cardId === "reset-attacker"));
});

test("attack reset stays bound to its target and preserves the granting source", () => {
  const state = makeState({
    cards: [
      card("bound-attacker", { type: "monster", atk: 1500, def: 1000, mode: "attack", used: false }),
      card("other-attacker", { type: "monster", atk: 1200, def: 800, mode: "attack", used: false })
    ],
    player: { monsterZone: ["bound-attacker", "other-attacker"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    {
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn",
      sourceCardId: "reset-source",
      targetCardId: "bound-attacker"
    }
  ];
  const engine = new GameEngine(state);

  const otherEvents = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "other-attacker"
  });
  assert.equal(engine.getState().cards["other-attacker"].used, true);
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.attackReset), true);
  assert.ok(!otherEvents.some((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.attackReset));

  const boundEvents = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "bound-attacker"
  });
  const spent = boundEvents.find((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.attackReset);
  assert.equal(engine.getState().cards["bound-attacker"].used, false);
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.attackReset), false);
  assert.equal(spent?.sourceCardId, "reset-source");
  assert.equal(spent?.targetCardId, "bound-attacker");
});

test("stacked attack resets keep both sources and give only their target two extra attacks", () => {
  const state = makeState({
    cards: [
      card("triple-attacker", { type: "monster", atk: 600, def: 600, mode: "attack", used: false }),
      card("bystander", { type: "monster", atk: 800, def: 800, mode: "attack", used: false })
    ],
    player: { monsterZone: ["triple-attacker", "bystander"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.attackReset, uses: 1, duration: "turn", sourceCardId: "final-counter", targetCardId: "triple-attacker" },
    { ability: Ability.attackReset, uses: 1, duration: "turn", sourceCardId: "battle-trance", targetCardId: "triple-attacker" }
  ];
  const engine = new GameEngine(state);

  const first = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "triple-attacker"
  });
  const second = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "triple-attacker"
  });
  const third = engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "triple-attacker"
  });

  assert.deepEqual(
    [first, second]
      .map((events) => events.find((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.attackReset)?.sourceCardId),
    ["final-counter", "battle-trance"]
  );
  assert.ok(first.some((event) => event.type === "MONSTER_READIED" && event.cardId === "triple-attacker"));
  assert.ok(second.some((event) => event.type === "MONSTER_READIED" && event.cardId === "triple-attacker"));
  assert.ok(!third.some((event) => event.type === "MONSTER_READIED"));
  assert.equal(engine.getState().cards["triple-attacker"].used, true);
  assert.equal(engine.getState().cards["bystander"].used, false);
});

test("cancelled attacks consume queued attack reset through mark-used events", () => {
  const state = makeState({
    cards: [card("cancelled-attacker", { type: "monster", mode: "attack", used: false })],
    player: { monsterZone: ["cancelled-attacker"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.attackReset, uses: 1, duration: "turn", sourceCardId: "reset-source" }
  ];
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "MARK_MONSTER_USED", playerId: PLAYER, cardId: "cancelled-attacker" });

  assert.equal(engine.getState().cards["cancelled-attacker"].used, false);
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.attackReset), false);
  assert.ok(events.some((event) => event.type === "MONSTER_USED" && event.cardId === "cancelled-attacker"));
  assert.ok(events.some((event) => event.type === "MONSTER_READIED" && event.cardId === "cancelled-attacker"));
});

test("turn start clears a monster's temporary attack lock through its reset event", () => {
  const state = makeState({
    cards: [
      card("converged-monster", {
        type: "monster",
        mode: "attack",
        used: true,
        attackLockReason: "trioConvergence"
      })
    ],
    player: { monsterZone: ["converged-monster"] },
    turn: { playerId: AI, phase: Phase.end }
  });
  state.machine.phase = Phase.end;
  state.machine.timing = Timing.end;
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "START_TURN", playerId: PLAYER });
  const reset = events.find((event) => event.type === "MONSTER_TURN_RESET" && event.cardId === "converged-monster");

  assert.equal(reset?.beforeAttackLockReason, "trioConvergence");
  assert.equal(reset?.afterAttackLockReason, null);
  assert.equal(engine.getState().cards["converged-monster"].attackLockReason, null);
  assert.equal(engine.getState().cards["converged-monster"].used, false);
});

test("skip attack lock blocks attack reset and direct attack grants", () => {
  const state = makeState({
    cards: [
      card("locked-monster", { type: "monster", atk: 1500, mode: "attack", used: true }),
      card("locked-trance", { type: "spell", effect: "battleTrance" }),
      card("locked-direct", { type: "spell", effect: "directStrike" })
    ],
    player: {
      hand: ["locked-trance", "locked-direct"],
      monsterZone: ["locked-monster"]
    },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.skipAttackLock, uses: 1, duration: "turn", sourceCardId: null }
  ];
  const engine = new GameEngine(state);

  const resetEvents = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "locked-trance",
    targetCardId: "locked-monster"
  });
  const directEvents = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "locked-direct"
  });

  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.attackReset), false);
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.directAttack), false);
  assert.equal(engine.getState().cards["locked-monster"].used, true);
  assert.equal(engine.getState().cards["locked-monster"].tempAtk, 200);
  assert.ok(resetEvents.some((event) => event.type === "ABILITY_GRANT_BLOCKED" && event.ability === Ability.attackReset));
  assert.ok(directEvents.some((event) => event.type === "ABILITY_GRANT_BLOCKED" && event.ability === Ability.directAttack));
});

test("monster mode changes are validated and applied through dispatch events", () => {
  const state = makeState({
    cards: [card("mode-1", { type: "monster", mode: "attack", used: false, changedMode: false })],
    player: { monsterZone: ["mode-1"] }
  });
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "CHANGE_MONSTER_MODE",
    playerId: PLAYER,
    cardId: "mode-1",
    mode: "defense"
  });

  assert.equal(engine.getState().cards["mode-1"].mode, "defense");
  assert.equal(engine.getState().cards["mode-1"].changedMode, true);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_MODE_CHANGED" &&
    event.cardId === "mode-1" &&
    event.from === "attack" &&
    event.to === "defense"
  ));
  assert.throws(
    () => engine.dispatch({ type: "CHANGE_MONSTER_MODE", playerId: PLAYER, cardId: "mode-1", mode: "attack" }),
    /already changed mode/
  );
});

test("monster mode changes reject illegal phases and used monsters", () => {
  const battleState = makeState({
    cards: [card("battle-mode", { type: "monster", mode: "attack", used: false, changedMode: false })],
    player: { monsterZone: ["battle-mode"] },
    turn: { phase: Phase.battle }
  });
  battleState.machine.phase = Phase.battle;
  battleState.machine.timing = Timing.battleOpen;
  const battleEngine = new GameEngine(battleState);

  assert.throws(
    () => battleEngine.dispatch({ type: "CHANGE_MONSTER_MODE", playerId: PLAYER, cardId: "battle-mode", mode: "defense" }),
    /not legal during battle phase/
  );

  const usedState = makeState({
    cards: [card("used-mode", { type: "monster", mode: "attack", used: true, changedMode: false })],
    player: { monsterZone: ["used-mode"] }
  });
  const usedEngine = new GameEngine(usedState);
  assert.throws(
    () => usedEngine.dispatch({ type: "CHANGE_MONSTER_MODE", playerId: PLAYER, cardId: "used-mode", mode: "defense" }),
    /after attacking/
  );
});

test("start turn switches ownership and resets turn-scoped state through events", () => {
  const state = makeState({
    cards: [
      card("ready-1", { type: "monster", used: true, changedMode: true, mode: "defense" }),
      card("ready-2", { type: "monster", used: false, changedMode: true, mode: "attack" })
    ],
    player: {
      monsterZone: ["ready-1", "ready-2"],
      attacksSkipped: true,
      comboThisTurn: true,
      comboFlags: { fireWind: true }
    },
    turn: { playerId: AI, phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  state.abilities[PLAYER] = [
    { ability: Ability.directAttack, uses: 1, duration: "turn", sourceCardId: "breach-1" },
    { ability: Ability.extraSummon, uses: 2, duration: "turn", sourceCardId: "twin-1" },
    { ability: Ability.attackReset, uses: 1, duration: "duel", sourceCardId: "permanent-1" }
  ];
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "START_TURN", playerId: PLAYER });
  const next = engine.getState();

  assert.equal(next.turn.playerId, PLAYER);
  assert.equal(next.turn.phase, Phase.draw);
  assert.equal(next.machine.phase, Phase.draw);
  assert.equal(next.machine.timing, Timing.draw);
  assert.equal(next.cards["ready-1"].used, false);
  assert.equal(next.cards["ready-1"].changedMode, false);
  assert.equal(next.cards["ready-2"].changedMode, false);
  assert.equal(next.players[PLAYER].attacksSkipped, false);
  assert.equal(next.players[PLAYER].comboThisTurn, false);
  assert.deepEqual(next.players[PLAYER].comboFlags, {});
  assert.deepEqual(next.abilities[PLAYER], [
    { ability: Ability.attackReset, uses: 1, duration: "duel", sourceCardId: "permanent-1" }
  ]);
  assert.ok(events.some((event) => event.type === "TURN_STARTED" && event.playerId === PLAYER && event.previousPlayerId === AI));
  assert.equal(events.filter((event) => event.type === "MONSTER_TURN_RESET").length, 2);
  assert.ok(events.some((event) =>
    event.type === "TURN_ABILITIES_EXPIRED" &&
    event.playerId === PLAYER &&
    event.abilities.length === 2
  ));
});

test("start turn rejects unresolved response windows", () => {
  const state = makeState({ turn: { playerId: AI, phase: Phase.battle } });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    resumeTiming: Timing.battleOpen,
    triggerEventId: "attack-open"
  };
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({ type: "START_TURN", playerId: PLAYER }),
    /response window is open/
  );
});

test("response windows and unresolved chains block auto-end and turn end", () => {
  const responseState = makeState({
    turn: { phase: Phase.battle },
    machine: {
      phase: Phase.battle,
      timing: Timing.attackDeclaration,
      responseWindow: {
        playerId: AI,
        type: ResponseWindow.optional,
        timing: Timing.attackDeclaration,
        resumeTiming: Timing.battleOpen,
        triggerEventId: "attack-open"
      },
      actionWindow: {
        playerId: AI,
        window: ActionWindow.response,
        windowId: "response:1",
        reason: "attack",
        openedAt: 1,
        deadline: 1
      }
    }
  });
  const responseEngine = new GameEngine(responseState);
  assert.throws(
    () => responseEngine.dispatch({
      type: "REQUEST_AUTO_END",
      playerId: PLAYER,
      requestedAt: 1000,
      timeoutSeconds: 2
    }),
    /response window is open/
  );
  assert.throws(
    () => responseEngine.dispatch({ type: "END_TURN", playerId: PLAYER }),
    /response window is open/
  );

  const chainState = makeState({
    cards: [card("trap-1", { type: "trap", trigger: "attackNegate" })],
    player: { spellTrapZone: ["trap-1"] },
    turn: { phase: Phase.battle },
    machine: {
      phase: Phase.battle,
      timing: Timing.chainResolution,
      chain: [{ linkId: 1, playerId: PLAYER, cardId: "trap-1", effectId: "attackNegate", committed: true }],
      actionWindow: {
        playerId: PLAYER,
        window: ActionWindow.resolution,
        windowId: "resolution:1",
        reason: "chain",
        openedAt: 1,
        deadline: 1
      }
    }
  });
  const chainEngine = new GameEngine(chainState);
  assert.throws(
    () => chainEngine.dispatch({
      type: "REQUEST_AUTO_END",
      playerId: PLAYER,
      requestedAt: 1000,
      timeoutSeconds: 2
    }),
    /chain is unresolved/
  );
  assert.throws(
    () => chainEngine.dispatch({ type: "END_TURN", playerId: PLAYER }),
    /chain is unresolved/
  );
});

test("auto-end and turn end resolve through explicit events", () => {
  const state = makeState({ turn: { playerId: PLAYER, phase: Phase.main } });
  const engine = new GameEngine(state);

  const requestEvents = engine.dispatch({
    type: "REQUEST_AUTO_END",
    playerId: PLAYER,
    reason: "no actions",
    requestedAt: 1000,
    timeoutSeconds: 2
  });
  let next = engine.getState();

  assert.ok(requestEvents.some((event) => event.type === "AUTO_END_REQUESTED" && event.reason === "no actions"));
  assert.ok(requestEvents.some((event) =>
    event.type === "ACTION_WINDOW_OPENED" &&
    event.window === ActionWindow.autoEnd &&
    event.deadline === 3000
  ));
  assert.equal(next.machine.actionWindow.window, ActionWindow.autoEnd);
  assert.equal(next.machine.autoEnd.playerId, PLAYER);

  const commitEvents = engine.dispatch({
    type: "COMMIT_AUTO_END",
    playerId: PLAYER,
    committedAt: 3000
  });
  next = engine.getState();

  assert.ok(commitEvents.some((event) => event.type === "AUTO_END_COMMITTED" && event.playerId === PLAYER));
  assert.ok(commitEvents.some((event) =>
    event.type === "TURN_ENDED" &&
    event.playerId === PLAYER &&
    event.nextPlayerId === AI &&
    event.phase === Phase.end &&
    event.timing === Timing.end
  ));
  assert.equal(next.turn.playerId, PLAYER);
  assert.equal(next.turn.phase, Phase.end);
  assert.equal(next.machine.phase, Phase.end);
  assert.equal(next.machine.timing, Timing.end);
  assert.equal(next.machine.autoEnd, null);
  assert.equal(next.machine.actionWindow, null);
});

test("element combos resolve through events and character passive triggers once per turn", () => {
  const state = makeState({
    cards: [
      card("fire-1", { type: "monster", element: "fire", atk: 1500, def: 900 }),
      card("wind-1", { type: "monster", element: "wind", atk: 1200, def: 1400 }),
      card("draw-1", { type: "monster", element: "light", atk: 1000, def: 1000 })
    ],
    player: {
      monsterZone: ["fire-1", "wind-1"],
      deck: ["draw-1"],
      comboPassive: {
        id: "starLink",
        name: "星脉连携",
        operations: [{ op: "drawCards", player: "self", count: 1 }]
      }
    }
  });
  const engine = new GameEngine(state);

  const firstEvents = engine.dispatch({
    type: "RESOLVE_ELEMENT_COMBOS",
    playerId: PLAYER,
    rivalId: AI,
    source: "summon"
  });
  const afterFirst = engine.getState();

  assert.equal(afterFirst.players[PLAYER].comboFlags.fireWind, true);
  assert.equal(afterFirst.players[PLAYER].comboThisTurn, true);
  assert.equal(afterFirst.players[AI].lp, MAX_LP - 300);
  assert.equal(afterFirst.cards["fire-1"].tempAtk, 100);
  assert.equal(afterFirst.cards["wind-1"].tempAtk, 100);
  assert.deepEqual(afterFirst.players[PLAYER].hand, ["draw-1"]);
  assert.ok(firstEvents.some((event) => event.type === "COMBO_TRIGGERED" && event.comboId === "fireWind"));
  assert.ok(firstEvents.some((event) => event.type === "CHARACTER_PASSIVE_TRIGGERED" && event.passiveId === "starLink"));
  assert.ok(firstEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 300));
  assert.equal(firstEvents.filter((event) => event.type === "CARDS_DRAWN").length, 1);

  const secondEvents = engine.dispatch({
    type: "RESOLVE_ELEMENT_COMBOS",
    playerId: PLAYER,
    rivalId: AI,
    source: "spell"
  });
  assert.equal(secondEvents.some((event) => event.type === "COMBO_TRIGGERED"), false);
  assert.equal(secondEvents.some((event) => event.type === "CHARACTER_PASSIVE_TRIGGERED"), false);
});

test("light-shadow, triad and trap-only combos use declarative event effects", () => {
  const state = makeState({
    cards: [
      card("light-1", { type: "monster", element: "light", atk: 1400, def: 1400 }),
      card("shadow-1", { type: "monster", element: "shadow", atk: 1300, def: 1500 }),
      card("fire-1", { type: "monster", element: "fire", atk: 1200, def: 1000 }),
      card("draw-1", { type: "monster", element: "wind", atk: 1000, def: 1000 })
    ],
    player: {
      monsterZone: ["light-1", "shadow-1", "fire-1"],
      deck: ["draw-1"]
    }
  });
  const engine = new GameEngine(state);

  const summonEvents = engine.dispatch({
    type: "RESOLVE_ELEMENT_COMBOS",
    playerId: PLAYER,
    rivalId: AI,
    source: "summon"
  });
  const afterSummon = engine.getState();

  assert.deepEqual(
    summonEvents.filter((event) => event.type === "COMBO_TRIGGERED").map((event) => event.comboId),
    ["lightShadow", "triad"]
  );
  assert.equal(afterSummon.players[PLAYER].shield, 600);
  assert.deepEqual(afterSummon.players[PLAYER].hand, ["draw-1"]);
  assert.equal(afterSummon.cards["light-1"].tempAtk, 200);
  assert.equal(afterSummon.cards["shadow-1"].tempAtk, 200);
  assert.equal(afterSummon.cards["fire-1"].tempAtk, 200);

  const trapEvents = engine.dispatch({
    type: "RESOLVE_ELEMENT_COMBOS",
    playerId: PLAYER,
    rivalId: AI,
    source: "trap"
  });
  assert.ok(trapEvents.some((event) => event.type === "COMBO_TRIGGERED" && event.comboId === "shadowAmbush"));
  assert.equal(engine.getState().players[PLAYER].shield, 900);
});

test("turn draw moves cards and applies deck-out damage through events", () => {
  const state = makeState({
    cards: [
      card("draw-a", { type: "monster" }),
      card("draw-b", { type: "trap" })
    ],
    player: {
      lp: 4000,
      shield: 100,
      deck: ["draw-a", "draw-b"]
    },
    turn: { playerId: PLAYER, phase: Phase.draw }
  });
  state.machine.phase = Phase.draw;
  state.machine.timing = Timing.draw;
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "DRAW_CARDS", playerId: PLAYER, count: 3, reason: "turn" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.deepEqual(next.players[PLAYER].hand, ["draw-a", "draw-b"]);
  assert.equal(next.players[PLAYER].shield, 0);
  assert.equal(next.players[PLAYER].lp, 3600);
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.count === 2 && event.requested === 3));
  assert.ok(events.some((event) => event.type === "DRAW_FAILED" && event.missing === 1 && event.reason === "turn"));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.requested === 500 && event.blocked === 100 && event.amount === 400));
});

test("resolve turn draw advances to main only when the player survives", () => {
  const state = makeState({
    cards: [card("turn-draw-1", { type: "monster" })],
    player: { deck: ["turn-draw-1"] },
    turn: { playerId: PLAYER, phase: Phase.draw }
  });
  state.machine.phase = Phase.draw;
  state.machine.timing = Timing.draw;
  const engine = new GameEngine(state);

  const events = engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, ["turn-draw-1"]);
  assert.equal(next.turn.phase, Phase.main);
  assert.equal(next.machine.timing, Timing.mainOpen);
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.count === 1));
  assert.ok(events.some((event) => event.type === "TURN_DRAW_RESOLVED" && event.phaseAdvanced === true));
  assert.ok(events.some((event) => event.type === "PHASE_CHANGED" && event.from === Phase.draw && event.to === Phase.main));

  const survivedDeckOut = makeState({
    player: { lp: 700, shield: 300, deck: [] },
    turn: { playerId: PLAYER, phase: Phase.draw }
  });
  survivedDeckOut.machine.phase = Phase.draw;
  survivedDeckOut.machine.timing = Timing.draw;
  const survivedEngine = new GameEngine(survivedDeckOut);
  const survivedEvents = survivedEngine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER });
  const survivedNext = survivedEngine.getState();

  assert.equal(survivedNext.players[PLAYER].lp, 500);
  assert.equal(survivedNext.players[PLAYER].shield, 0);
  assert.equal(survivedNext.turn.phase, Phase.main);
  assert.ok(survivedEvents.some((event) => event.type === "TURN_DRAW_RESOLVED" && event.phaseAdvanced === true));

  const fatalDeckOut = makeState({
    player: { lp: 300, shield: 0, deck: [] },
    turn: { playerId: PLAYER, phase: Phase.draw }
  });
  fatalDeckOut.machine.phase = Phase.draw;
  fatalDeckOut.machine.timing = Timing.draw;
  const fatalEngine = new GameEngine(fatalDeckOut);
  const fatalEvents = fatalEngine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER });
  const fatalNext = fatalEngine.getState();

  assert.equal(fatalNext.players[PLAYER].lp, 0);
  assert.equal(fatalNext.gameOver.winnerId, AI);
  assert.deepEqual(fatalNext.gameOver.loserIds, [PLAYER]);
  assert.equal(fatalNext.turn.phase, Phase.draw);
  assert.ok(fatalEvents.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === AI && event.reason === "lp-zero"));
  assert.ok(fatalEvents.some((event) => event.type === "TURN_DRAW_RESOLVED" && event.phaseAdvanced === false));
  assert.equal(fatalEvents.some((event) => event.type === "PHASE_CHANGED"), false);
});

test("turn draw rejects the wrong player and illegal phase", () => {
  const wrongPlayer = makeState({ turn: { playerId: AI, phase: Phase.draw } });
  wrongPlayer.machine.phase = Phase.draw;
  wrongPlayer.machine.timing = Timing.draw;
  assert.throws(
    () => new GameEngine(wrongPlayer).dispatch({ type: "DRAW_CARDS", playerId: PLAYER, count: 1, reason: "turn" }),
    /not player's turn/
  );

  const wrongPhase = makeState({ turn: { playerId: PLAYER, phase: Phase.main } });
  assert.throws(
    () => new GameEngine(wrongPhase).dispatch({ type: "DRAW_CARDS", playerId: PLAYER, count: 1, reason: "turn" }),
    /not legal during main phase/
  );
});

test("summon limit consumes the normal summon before extra summon abilities", () => {
  const state = makeState({
    cards: [
      card("summon-one", { type: "monster" }),
      card("summon-two", { type: "monster" }),
      card("summon-three", { type: "monster" })
    ],
    player: { hand: ["summon-one", "summon-two", "summon-three"] }
  });
  state.abilities[PLAYER] = [
    { ability: Ability.extraSummon, uses: 1, duration: "turn", sourceCardId: "extra-source" }
  ];
  const engine = new GameEngine(state);

  const firstEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "summon-one", index: 0 });
  const secondEvents = engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "summon-two", index: 1 });

  assert.equal(engine.getState().players[PLAYER].normalSummonsUsed, 1);
  assert.deepEqual(engine.getState().players[PLAYER].monsterZone, ["summon-one", "summon-two"]);
  assert.ok(firstEvents.some((event) => event.type === "NORMAL_SUMMON_USED" && event.after === 1));
  assert.ok(secondEvents.some((event) => event.type === "ABILITY_SPENT" && event.ability === Ability.extraSummon));
  assert.equal(hasAbility(engine.getState(), PLAYER, Ability.extraSummon), false);

  assert.throws(
    () => engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: "summon-three", index: 2 }),
    /no normal or extra summon remaining/
  );
  assert.deepEqual(engine.getState().players[PLAYER].hand, ["summon-three"]);
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
  const activationEvents = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "void-1",
    targetEffectId: "attack-42"
  });

  let next = engine.getState();
  assert.equal(next.machine.timing, Timing.attackDeclaration);
  assert.equal(next.machine.responseWindow.type, ResponseWindow.optional);
  assert.equal(next.machine.chain.length, 1);
  assert.equal(next.machine.chain[0].effectId, "attackNegate");
  assert.equal(next.machine.chain[0].committed, true);
  assert.ok(!activationEvents.some((event) => event.type === "EFFECT_NEGATED"));

  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  next = engine.getState();

  assert.deepEqual(next.machine.chain, []);
  assert.equal(next.machine.responseWindow, null);
  assert.ok(resolveEvents.some((event) => event.type === "EFFECT_NEGATED" && event.targetEffectId === "attack-42"));
  assert.ok(resolveEvents.some((event) => event.type === "CHAIN_RESOLVED"));
});

test("action windows open through dispatch events and replay with deterministic deadlines", () => {
  const state = makeState();
  const engine = new GameEngine(state);

  const events = engine.dispatch({
    type: "OPEN_ACTION_WINDOW",
    playerId: PLAYER,
    window: ActionWindow.targetSelect,
    reason: "select:war-chant",
    openedAt: 1000,
    timeoutSeconds: 20
  });
  const next = engine.getState();
  const opened = events.find((event) => event.type === "ACTION_WINDOW_OPENED");

  assert.deepEqual(opened, {
    id: opened.id,
    type: "ACTION_WINDOW_OPENED",
    playerId: PLAYER,
    window: ActionWindow.targetSelect,
    windowId: "targetSelect:1000",
    reason: "select:war-chant",
    openedAt: 1000,
    deadline: 21000
  });
  assert.deepEqual(next.machine.actionWindow, {
    playerId: PLAYER,
    window: ActionWindow.targetSelect,
    windowId: "targetSelect:1000",
    reason: "select:war-chant",
    openedAt: 1000,
    deadline: 21000
  });

  const projected = projectMachineStateFromEvents(events, Phase.main);
  assert.deepEqual(projected.actionWindow, next.machine.actionWindow);
});

test("action window commands reject unknown windows and invalid timeout data", () => {
  const engine = new GameEngine(makeState());

  assert.throws(
    () => engine.dispatch({ type: "OPEN_ACTION_WINDOW", playerId: PLAYER, window: "missing", openedAt: 1000 }),
    /Unknown action window/
  );
  assert.throws(
    () => engine.dispatch({ type: "OPEN_ACTION_WINDOW", playerId: PLAYER, window: ActionWindow.main, openedAt: Number.NaN }),
    /openedAt must be finite/
  );
});

test("trap chain effects wait for resolution and resolve in last-in-first-out order", () => {
  const state = makeState({
    cards: [
      card("chain-heal", { type: "trap", trigger: "chainHeal" }),
      card("chain-burn", { type: "trap", trigger: "chainSelfBurn" })
    ],
    player: {
      lp: 3500,
      spellTrapZone: ["chain-heal", "chain-burn"]
    },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    resumeTiming: Timing.battleOpen,
    triggerEventId: "attack-42"
  };
  const engine = new GameEngine(state, {
    cardEffects: {
      chainHeal: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "heal", player: "self", amount: 700 }]
      },
      chainSelfBurn: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "dealDamage", player: "self", amount: 500 }]
      }
    }
  });

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "chain-heal",
    effectId: "chainHeal",
    targetEffectId: "attack-42"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "chain-heal"
  });
  assert.equal(engine.getState().players[PLAYER].lp, 3500);

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "chain-burn",
    effectId: "chainSelfBurn",
    targetEffectId: "chain-heal"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "chain-burn"
  });
  assert.equal(engine.getState().players[PLAYER].lp, 3500);

  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  const effectEvents = resolveEvents.filter((event) => ["DAMAGE_DEALT", "LP_HEALED"].includes(event.type));

  assert.equal(engine.getState().players[PLAYER].lp, 3700);
  assert.deepEqual(effectEvents.map((event) => [event.type, event.sourceCardId]), [
    ["DAMAGE_DEALT", "chain-burn"],
    ["LP_HEALED", "chain-heal"]
  ]);
  assert.deepEqual(engine.getState().machine.chain, []);
});

test("response priority can pass to the rival before they add another chain link", () => {
  const state = makeState({
    cards: [
      card("player-chain-heal", { type: "trap", trigger: "chainHeal" }),
      card("ai-chain-burn", { ownerId: AI, type: "trap", trigger: "chainBurn" })
    ],
    player: {
      lp: 3500,
      spellTrapZone: ["player-chain-heal"]
    },
    ai: {
      spellTrapZone: ["ai-chain-burn"]
    },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    resumeTiming: Timing.battleOpen,
    triggerEventId: "attack-88"
  };
  const engine = new GameEngine(state, {
    cardEffects: {
      chainHeal: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "heal", player: "self", amount: 700 }]
      },
      chainBurn: {
        duration: EffectDuration.oneShot,
        operations: [{ op: "dealDamage", player: "rival", amount: 500 }]
      }
    }
  });

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "player-chain-heal",
    effectId: "chainHeal"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "player-chain-heal"
  });
  const passEvents = engine.dispatch({
    type: "PASS_RESPONSE_PRIORITY",
    playerId: PLAYER,
    nextPlayerId: AI
  });

  assert.equal(engine.getState().machine.responseWindow.playerId, AI);
  assert.ok(passEvents.some((event) =>
    event.type === "RESPONSE_PRIORITY_PASSED" && event.fromPlayerId === PLAYER && event.toPlayerId === AI
  ));

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: AI,
    cardId: "ai-chain-burn",
    effectId: "chainBurn"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "ai-chain-burn"
  });

  assert.equal(engine.getState().players[PLAYER].lp, 3500);
  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: AI });
  assert.equal(engine.getState().players[PLAYER].lp, 3700);
  assert.deepEqual(
    resolveEvents
      .filter((event) => event.type === "CHAIN_LINK_RESOLVED")
      .map((event) => event.cardId),
    ["ai-chain-burn", "player-chain-heal"]
  );
});

test("a chain negate trap skips the targeted earlier link during reverse resolution", () => {
  const state = makeState({
    cards: [
      card("player-flare", { type: "trap", trigger: "summonBurn" }),
      card("ai-nullifier", { ownerId: AI, type: "trap", trigger: "chainNegate" })
    ],
    player: { spellTrapZone: ["player-flare"] },
    ai: { spellTrapZone: ["ai-nullifier"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    resumeTiming: Timing.battleOpen,
    triggerEventId: "attack-99"
  };
  const engine = new GameEngine(state);

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "player-flare",
    effectId: "summonBurn",
    targetEffectId: "attack-99"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "player-flare",
    targetEffectId: "attack-99"
  });
  engine.dispatch({
    type: "PASS_RESPONSE_PRIORITY",
    playerId: PLAYER,
    nextPlayerId: AI
  });
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: AI,
    cardId: "ai-nullifier",
    effectId: "chainNegate",
    targetEffectId: "player-flare"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "ai-nullifier",
    targetEffectId: "player-flare"
  });

  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: AI });

  assert.equal(engine.getState().players[AI].lp, 4000);
  assert.ok(resolveEvents.some((event) =>
    event.type === "EFFECT_NEGATED" && event.targetEffectId === "player-flare" && event.sourceCardId === "ai-nullifier"
  ));
  assert.ok(resolveEvents.some((event) =>
    event.type === "EFFECT_SKIPPED" && event.cardId === "player-flare" && event.reason === "negated"
  ));
  assert.ok(!resolveEvents.some((event) => event.type === "DAMAGE_DEALT"));
});

test("a third chain link can negate the counter and restore the first effect", () => {
  const state = makeState({
    cards: [
      card("player-flare", { type: "trap", trigger: "summonBurn" }),
      card("ai-nullifier", { ownerId: AI, type: "trap", trigger: "chainNegate" }),
      card("player-nullifier", { type: "trap", trigger: "chainNegate" })
    ],
    player: { spellTrapZone: ["player-flare", "player-nullifier"] },
    ai: { spellTrapZone: ["ai-nullifier"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.attackDeclaration;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.attackDeclaration,
    resumeTiming: Timing.battleOpen,
    triggerEventId: "attack-100"
  };
  const engine = new GameEngine(state);

  engine.dispatch({ type: "ADD_CHAIN_LINK", playerId: PLAYER, cardId: "player-flare", effectId: "summonBurn" });
  engine.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "player-flare" });
  engine.dispatch({ type: "PASS_RESPONSE_PRIORITY", playerId: PLAYER, nextPlayerId: AI });
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: AI,
    cardId: "ai-nullifier",
    effectId: "chainNegate",
    targetEffectId: "player-flare"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: AI,
    rivalId: PLAYER,
    cardId: "ai-nullifier",
    targetEffectId: "player-flare"
  });
  engine.dispatch({ type: "PASS_RESPONSE_PRIORITY", playerId: AI, nextPlayerId: PLAYER });
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "player-nullifier",
    effectId: "chainNegate",
    targetEffectId: "ai-nullifier"
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "player-nullifier",
    targetEffectId: "ai-nullifier"
  });
  engine.dispatch({ type: "PASS_RESPONSE_PRIORITY", playerId: PLAYER, nextPlayerId: AI });

  const resolveEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: AI });

  assert.equal(engine.getState().players[AI].lp, 3600);
  assert.ok(resolveEvents.some((event) =>
    event.type === "EFFECT_NEGATED" && event.targetEffectId === "ai-nullifier" && event.sourceCardId === "player-nullifier"
  ));
  assert.ok(resolveEvents.some((event) =>
    event.type === "EFFECT_SKIPPED" && event.cardId === "ai-nullifier" && event.reason === "negated"
  ));
  assert.ok(!resolveEvents.some((event) => event.type === "EFFECT_SKIPPED" && event.cardId === "player-flare"));
  assert.deepEqual(
    resolveEvents.filter((event) => event.type === "CHAIN_LINK_RESOLVED").map((event) => event.cardId),
    ["player-nullifier", "ai-nullifier", "player-flare"]
  );
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

test("response windows preserve trigger context and cannot be nested", () => {
  const state = makeState({ turn: { phase: Phase.battle } });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.battleOpen;
  const engine = new GameEngine(state);

  engine.dispatch({
    type: "OPEN_RESPONSE_WINDOW",
    playerId: PLAYER,
    timing: Timing.damageStep,
    windowType: ResponseWindow.optional,
    triggerEventId: "attack-42",
    prompt: "direct",
    context: { attackerCardId: "attacker-1", targetPlayerId: PLAYER }
  });

  assert.deepEqual(engine.getState().machine.responseWindow.context, {
    attackerCardId: "attacker-1",
    targetPlayerId: PLAYER
  });
  assert.throws(
    () => engine.dispatch({
      type: "OPEN_RESPONSE_WINDOW",
      playerId: PLAYER,
      timing: Timing.damageStep,
      windowType: ResponseWindow.optional
    }),
    /response window is already open/
  );
});

test("an open response window requires traps to join the chain before activation", () => {
  const state = makeState({
    cards: [card("guard-1", { templateId: "guard-sigil", type: "trap", trigger: "directShield" })],
    player: { spellTrapZone: ["guard-1"] },
    turn: { phase: Phase.battle }
  });
  state.machine.phase = Phase.battle;
  state.machine.timing = Timing.damageStep;
  state.machine.responseWindow = {
    playerId: PLAYER,
    type: ResponseWindow.optional,
    timing: Timing.damageStep,
    triggerEventId: "attack-42"
  };
  const engine = new GameEngine(state);

  assert.throws(
    () => engine.dispatch({
      type: "ACTIVATE_TRAP",
      playerId: PLAYER,
      rivalId: AI,
      cardId: "guard-1"
    }),
    /must join the current chain/
  );

  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "guard-1",
    effectId: "directShield",
    targetEffectId: "attack-42"
  });
  const activationEvents = engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "guard-1"
  });
  assert.ok(activationEvents.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === "guard-1"));
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

test("explains action legality without mutating the source state", () => {
  const state = makeState({
    cards: [
      card("seer-1", { templateId: "seer-call", effect: "draw2" }),
      card("deck-1", { type: "monster" }),
      card("deck-2", { type: "monster" })
    ],
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    }
  });

  const result = explainActionLegality(state, {
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "seer-1"
  });

  assert.deepEqual(result, { ok: true, reason: "" });
  assert.deepEqual(state.players[PLAYER].hand, ["seer-1"]);
  assert.deepEqual(state.players[PLAYER].grave, []);
  assert.equal(state.events.length, 0);
});

test("explains illegal phases and missing targets as rule reasons", () => {
  const drawPhase = makeState({
    cards: [
      card("seer-1", { templateId: "seer-call", effect: "draw2" }),
      card("deck-1", { type: "monster" }),
      card("deck-2", { type: "monster" })
    ],
    player: {
      hand: ["seer-1"],
      deck: ["deck-1", "deck-2"]
    },
    turn: { phase: Phase.draw }
  });

  assert.deepEqual(
    explainActionLegality(drawPhase, { type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "seer-1" }),
    {
      ok: false,
      reason: "ACTIVATE_CARD is not legal during draw phase"
    }
  );

  const missingTarget = makeState({
    cards: [card("blade-1", { templateId: "blade-sigil", effect: "equipBlade" })],
    player: { hand: ["blade-1"] }
  });

  assert.deepEqual(
    explainActionLegality(missingTarget, { type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "blade-1" }),
    {
      ok: false,
      reason: "Effect equipBlade requires action.targetCardId"
    }
  );
});

test("lists main-phase legal actions without mutating the source state", () => {
  const state = makeState({
    cards: [
      card("summon-1", { type: "monster", templateId: "ember-drake", atk: 1200, def: 900 }),
      card("trap-1", { type: "trap", trigger: "attackNegate" }),
      card("burn-1", { templateId: "burst-rune", effect: "burn500" }),
      card("field-1", { type: "monster", templateId: "star-lancer", atk: 1500, def: 1000 })
    ],
    player: {
      hand: ["summon-1", "trap-1", "burn-1"],
      monsterZone: ["field-1"]
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.phase, Phase.main);
  assert.equal(legal.can.summon, true);
  assert.equal(legal.can.setTrap, true);
  assert.equal(legal.can.activateCard, true);
  assert.equal(legal.can.changeMode, true);
  assert.equal(legal.can.declareAttack, false);
  assert.equal(legal.can.endTurn, true);
  assert.deepEqual(legal.actions.summon.map((action) => action.cardId), ["summon-1"]);
  assert.deepEqual(legal.actions.setTrap.map((action) => action.cardId), ["trap-1"]);
  assert.deepEqual(legal.actions.activateCard.map((action) => action.cardId), ["burn-1"]);
  assert.deepEqual(legal.actions.changeMode.map((action) => action.cardId), ["field-1"]);
  assert.deepEqual(state.players[PLAYER].hand, ["summon-1", "trap-1", "burn-1"]);
  assert.deepEqual(state.events, []);
});

test("lists battle-phase attacks and excludes illegal direct attacks while monsters remain", () => {
  const state = makeState({
    cards: [
      card("attacker-1", { type: "monster", templateId: "star-lancer", atk: 1500, def: 1000 }),
      card("trap-1", { type: "trap", trigger: "attackNegate" }),
      card("burn-1", { templateId: "burst-rune", effect: "burn500" }),
      card("guard-1", { ownerId: AI, type: "monster", templateId: "iron-guardian", atk: 900, def: 2100 })
    ],
    player: {
      hand: ["trap-1", "burn-1"],
      monsterZone: ["attacker-1"]
    },
    ai: {
      monsterZone: ["guard-1"]
    },
    turn: { phase: Phase.battle }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.can.declareAttack, true);
  assert.equal(legal.can.summon, false);
  assert.equal(legal.can.setTrap, true);
  assert.equal(legal.can.activateCard, true);
  assert.equal(legal.can.changeMode, false);
  assert.equal(legal.can.endTurn, true);
  assert.deepEqual(legal.actions.declareAttack, [{
    type: "DECLARE_ATTACK",
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "attacker-1",
    targetCardId: "guard-1"
  }]);
});

test("lists only legal targets for targeted card effects", () => {
  const state = makeState({
    cards: [
      card("buff-1", { templateId: "battle-banner", effect: "buff500" }),
      card("low-1", { type: "monster", templateId: "ember-drake", atk: 1000, def: 900 }),
      card("high-1", { type: "monster", templateId: "star-lancer", atk: 1800, def: 1000 })
    ],
    player: {
      hand: ["buff-1"],
      monsterZone: ["low-1", "high-1"]
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.deepEqual(legal.actions.activateCard, [{
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "buff-1",
    targetCardId: "high-1"
  }]);
});

test("does not list normal actions while a response window is open", () => {
  const state = makeState({
    cards: [
      card("summon-1", { type: "monster", templateId: "ember-drake", atk: 1200, def: 900 }),
      card("field-1", { type: "monster", templateId: "star-lancer", atk: 1500, def: 1000 })
    ],
    player: {
      hand: ["summon-1"],
      monsterZone: ["field-1"]
    },
    machine: {
      responseWindow: {
        playerId: PLAYER,
        timing: Timing.attackDeclaration,
        type: ResponseWindow.optional,
        triggerEventId: 99,
        prompt: "attack",
        context: {}
      }
    }
  });

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.can.summon, false);
  assert.equal(legal.can.activateCard, false);
  assert.equal(legal.can.declareAttack, false);
  assert.equal(legal.can.changeMode, false);
  assert.equal(legal.can.endTurn, false);
  assert.equal(legal.hasAny, false);
});

test("does not count manual end turn as a playable board action", () => {
  const state = makeState();

  const legal = getLegalActions(state, PLAYER);

  assert.equal(legal.can.endTurn, true);
  assert.equal(legal.hasAny, false);
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

test("assertValidGameState catches unresolved attack and chain state machine drift", () => {
  assert.throws(
    () => assertValidGameState(makeState({
      turn: { phase: Phase.battle },
      machine: {
        phase: Phase.battle,
        timing: Timing.attackDeclaration,
        chain: [{ linkId: 1, playerId: PLAYER, cardId: "trap-1", effectId: "attackNegate" }],
        actionWindow: null
      }
    })),
    /Unresolved chain requires response window or response\/resolution action window/
  );

  const pendingBase = {
    cards: [
      card("attacker-1", { type: "monster" }),
      card("target-1", { ownerId: AI, type: "monster" })
    ],
    player: { monsterZone: ["attacker-1"] },
    ai: { monsterZone: ["target-1"] },
    turn: { phase: Phase.battle },
    machine: {
      phase: Phase.battle,
      timing: Timing.attackDeclaration,
      pendingAttack: {
        playerId: PLAYER,
        rivalId: AI,
        attackerCardId: "attacker-1",
        targetCardId: "target-1",
        declarationEventId: 7
      }
    }
  };

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      machine: {
        ...pendingBase.machine,
        autoEnd: { playerId: PLAYER, requestedAt: 1000, deadline: 3000 },
        actionWindow: {
          playerId: PLAYER,
          window: ActionWindow.autoEnd,
          windowId: "autoEnd:1000",
          reason: "bad",
          openedAt: 1000,
          deadline: 3000
        }
      }
    })),
    /Pending attack cannot coexist with auto-end/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      turn: { playerId: AI, phase: Phase.battle },
      machine: {
        ...pendingBase.machine,
        phase: Phase.battle
      }
    })),
    /Pending attack player must remain the current turn player/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      machine: {
        ...pendingBase.machine,
        pendingAttack: {
          ...pendingBase.machine.pendingAttack,
          declarationEventId: null
        }
      }
    })),
    /Pending attack requires declaration event id/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      machine: {
        ...pendingBase.machine,
        pendingAttack: {
          ...pendingBase.machine.pendingAttack,
          direct: true,
          targetPlayerId: AI
        }
      }
    })),
    /Direct pending attack cannot have a target card/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      machine: {
        ...pendingBase.machine,
        pendingAttack: {
          ...pendingBase.machine.pendingAttack,
          targetPlayerId: AI
        }
      }
    })),
    /Monster pending attack cannot target a player/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      player: { monsterZone: [] }
    })),
    /Card attacker-1 is not in player\.monsterZone/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      cards: [
        card("attacker-1", { type: "spell" }),
        card("target-1", { ownerId: AI, type: "monster" })
      ]
    })),
    /Pending attack attacker must be a monster/
  );

  assert.throws(
    () => assertValidGameState(makeState({
      ...pendingBase,
      cards: [
        card("attacker-1", { type: "monster" }),
        card("target-1", { ownerId: AI, type: "spell" })
      ]
    })),
    /Pending attack target must be a monster/
  );
});

test("assertValidGameState rejects non-declarative character passives", () => {
  const invalid = makeState({
    player: {
      comboPassive: { id: "badPassive", operations: [() => {}] }
    }
  });

  assert.throws(
    () => assertValidGameState(invalid),
    /combo passive has an invalid operation/
  );
});
