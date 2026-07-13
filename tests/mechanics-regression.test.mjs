import test from "node:test";
import assert from "node:assert/strict";

import {
  GameEngine,
  GameRuleError,
  GameStateValidationError,
  Phase,
  Timing,
  assertValidGameState
} from "../src/game-engine.js";
import {
  buildEngineStateFromUiState,
  dispatchFusionSummonFromUiState,
  dispatchSummonMonsterFromUiState
} from "../src/engine-adapter.js";
import { MONSTER_ZONE_SIZE, SPELL_TRAP_ZONE_SIZE } from "../src/rules.js";

const PLAYER = "player";
const AI = "ai";

function engineCard(id, overrides = {}) {
  return {
    id,
    templateId: id,
    ownerId: PLAYER,
    type: "monster",
    name: id,
    atk: 1000,
    def: 1000,
    ...overrides
  };
}

function enginePlayer(id, overrides = {}) {
  return {
    id,
    lp: 4000,
    shield: 0,
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

function engineState({ cards = [], player = {}, ai = {}, turnPlayerId = PLAYER, cardDefinitions = undefined } = {}) {
  return {
    cards: Object.fromEntries(cards.map((card) => [card.id, card])),
    ...(cardDefinitions ? { cardDefinitions } : {}),
    players: {
      [PLAYER]: enginePlayer(PLAYER, player),
      [AI]: enginePlayer(AI, ai)
    },
    turn: { playerId: turnPlayerId, phase: Phase.main },
    machine: {
      phase: Phase.main,
      timing: Timing.mainOpen,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null
    },
    abilities: { [PLAYER]: [], [AI]: [] },
    events: [],
    continuousEffects: [],
    nextEventId: 1
  };
}

function uiCard(uid, id, ownerId = PLAYER, overrides = {}) {
  return {
    uid,
    engineId: uid,
    id,
    templateId: id,
    ownerId,
    type: "monster",
    name: id,
    atk: 1000,
    def: 1000,
    ...overrides
  };
}

function uiDuelist(owner) {
  return {
    owner,
    lp: 4000,
    shield: 0,
    deck: [],
    hand: [],
    field: Array(MONSTER_ZONE_SIZE).fill(null),
    traps: Array(SPELL_TRAP_ZONE_SIZE).fill(null),
    grave: [],
    normalSummonsUsed: 0,
    comboFlags: {}
  };
}

function uiState(turn = PLAYER) {
  return {
    player: uiDuelist(PLAYER),
    ai: uiDuelist(AI),
    turn,
    phase: "main",
    timing: "mainOpen",
    actionWindow: "main",
    gameEvents: []
  };
}

function snapshot(value) {
  return structuredClone(value);
}

test("fixed occupied monster slots reject player and AI summons without partial UI updates", () => {
  for (const owner of [PLAYER, AI]) {
    const state = uiState(owner);
    const incoming = uiCard(`${owner}-incoming`, "spark-runner", owner);
    const occupant = uiCard(`${owner}-occupant`, "solar-knight", owner);
    state[owner].hand = [incoming];
    state[owner].field[4] = occupant;
    const before = snapshot(state);

    assert.throws(
      () => dispatchSummonMonsterFromUiState(state, owner, 0, 4),
      /occupied|already occupied/i
    );
    assert.deepEqual(state, before);
  }
});

test("summon commands reject a spell-trap destination instead of silently ignoring it", () => {
  const monster = engineCard("summon-me");
  const state = engineState({ cards: [monster], player: { hand: [monster.id] } });
  const engine = new GameEngine(state);
  const before = engine.getState();

  assert.throws(() => engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    cardId: monster.id,
    zone: "spellTrapZone",
    index: 0
  }), GameRuleError);
  assert.deepEqual(engine.getState(), before);
});

test("fusion destination conflicts are rejected before UI materials or spell cards move", () => {
  const state = uiState();
  const fusion = uiCard("fusion-spell", "starforge-fusion", PLAYER, {
    type: "spell",
    effect: "fusionSummon",
    fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
  });
  const ember = uiCard("fusion-ember", "ember-drake");
  const gale = uiCard("fusion-gale", "gale-mage");
  const occupant = uiCard("fusion-occupant", "solar-knight");
  const result = uiCard("fusion-result", "flare-gale-archon");
  state.player.hand = [fusion, gale];
  state.player.field[0] = ember;
  state.player.field[4] = occupant;
  state.player.deck = [result];
  const before = snapshot(state);

  assert.throws(() => dispatchFusionSummonFromUiState(state, PLAYER, AI, 0, {
    fusionResultTemplateId: "flare-gale-archon",
    materialCardIds: [ember.uid, gale.uid],
    fieldIndex: 4
  }), /occupied|already occupied/i);
  assert.deepEqual(state, before);
});

test("tokens disappear when destroyed instead of entering the graveyard", () => {
  const destroySpell = engineCard("destroy-spell", {
    type: "spell",
    effect: "destroyOwnToken"
  });
  const token = engineCard("token-1", {
    templateId: "spark-fragment-token",
    token: true,
    isToken: true,
    generated: true
  });
  const state = engineState({
    cards: [destroySpell, token],
    player: { hand: [destroySpell.id], monsterZone: [token.id] }
  });
  const engine = new GameEngine(state, {
    cardEffects: {
      destroyOwnToken: {
        duration: "oneShot",
        operations: [{ op: "destroyCard", cardId: "$action.targetCardId" }],
        target: { player: "self", zone: "monsterZone", cardType: "monster" }
      }
    }
  });

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: destroySpell.id,
    targetCardId: token.id
  });
  const next = engine.getState();

  assert.equal(next.players[PLAYER].grave.includes(token.id), false);
  assert.equal(next.players[PLAYER].monsterZone.includes(token.id), false);
  assert.equal(next.cards[token.id], undefined);
  assert.ok(events.some((event) => event.type === "TOKEN_REMOVED" && event.cardId === token.id));
});

test("assertValidGameState rejects wrong card types and token cards in persistent zones", () => {
  const spell = engineCard("wrong-zone-spell", { type: "spell" });
  const monster = engineCard("wrong-zone-monster");
  const token = engineCard("illegal-token", {
    templateId: "spark-fragment-token",
    token: true,
    isToken: true,
    generated: true
  });

  assert.throws(() => assertValidGameState(engineState({
    cards: [spell],
    player: { monsterZone: [spell.id] }
  })), GameStateValidationError);
  assert.throws(() => assertValidGameState(engineState({
    cards: [monster],
    player: { spellTrapZone: [monster.id] }
  })), GameStateValidationError);
  for (const zone of ["deck", "hand", "grave", "banished"]) {
    assert.throws(() => assertValidGameState(engineState({
      cards: [token],
      player: { [zone]: [token.id] }
    })), GameStateValidationError);
  }
});

test("engine projections preserve exact fixed-zone occupancy for rule checks", () => {
  const state = uiState();
  state.player.field[1] = uiCard("slot-one", "spark-runner");
  state.player.field[4] = uiCard("slot-four", "solar-knight");

  const projected = buildEngineStateFromUiState(state);

  assert.deepEqual(projected.players[PLAYER].zoneSlots.monsterZone, [null, "slot-one", null, null, "slot-four"]);
  assert.equal(projected.players[PLAYER].zoneSlots.monsterZone.length, MONSTER_ZONE_SIZE);
  assert.equal(projected.players[PLAYER].zoneSlots.spellTrapZone.length, SPELL_TRAP_ZONE_SIZE);
});

test("area uniqueness rejects the same physical card in hand/field or field/grave", () => {
  const physical = engineCard("physical-card");
  assert.throws(() => new GameEngine(engineState({
    cards: [physical],
    player: { hand: [physical.id], monsterZone: [physical.id] }
  })), GameStateValidationError);
  assert.throws(() => new GameEngine(engineState({
    cards: [physical],
    player: { monsterZone: [physical.id], grave: [physical.id] }
  })), GameStateValidationError);
});

test("normal summons accept legal empty slots and reject out-of-range slots atomically", () => {
  const state = uiState();
  const monster = uiCard("legal-slot-monster", "spark-runner");
  state.player.hand = [monster];
  const events = dispatchSummonMonsterFromUiState(state, PLAYER, 0, 3);
  assert.equal(state.player.field[3], monster);
  assert.equal(state.player.hand.length, 0);
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === monster.uid));

  const rejected = uiState();
  rejected.player.hand = [uiCard("out-of-range", "solar-knight")];
  const before = snapshot(rejected);
  assert.throws(() => dispatchSummonMonsterFromUiState(rejected, PLAYER, 0, MONSTER_ZONE_SIZE), GameRuleError);
  assert.deepEqual(rejected, before);
});

test("tribute summons enforce exact own unique monsters and keep every failure atomic", () => {
  const low = engineCard("low-monster");
  const lowEngine = new GameEngine(engineState({ cards: [low], player: { hand: [low.id] } }));
  lowEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: low.id, index: 0 });
  assert.deepEqual(lowEngine.getState().players[PLAYER].monsterZone, [low.id]);

  const high = engineCard("high-monster", { tributeCost: 2 });
  const own = engineCard("own-tribute");
  const rival = engineCard("rival-tribute", { ownerId: AI });
  for (const tributeCardIds of [[], [own.id], [own.id, own.id], [own.id, rival.id], [own.id, null]]) {
    const state = engineState({
      cards: [high, own, rival],
      player: { hand: [high.id], monsterZone: [own.id] },
      ai: { monsterZone: [rival.id] }
    });
    const engine = new GameEngine(state);
    const before = engine.getState();
    assert.throws(() => engine.dispatch({
      type: "SUMMON_MONSTER",
      playerId: PLAYER,
      cardId: high.id,
      tributeCardIds,
      index: 0
    }), GameRuleError);
    assert.deepEqual(engine.getState(), before);
  }

  const second = engineCard("second-tribute");
  const success = new GameEngine(engineState({
    cards: [high, own, second],
    player: { hand: [high.id], monsterZone: [own.id, second.id] }
  }));
  const events = success.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    cardId: high.id,
    tributeCardIds: [own.id, second.id],
    index: 1
  });
  const next = success.getState();
  assert.deepEqual(next.players[PLAYER].monsterZone, [high.id]);
  assert.deepEqual(next.players[PLAYER].grave, [own.id, second.id]);
  assert.deepEqual(events.filter((event) => event.type === "CARD_TRIBUTED").map((event) => event.cardId), [own.id, second.id]);
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === high.id));
});

test("tokens can be tributed but disappear instead of entering hand, deck, or grave", () => {
  const high = engineCard("token-tribute-summon", { tributeCost: 1 });
  const token = engineCard("tribute-token", {
    templateId: "spark-fragment-token",
    token: true,
    isToken: true,
    generated: true
  });
  const engine = new GameEngine(engineState({
    cards: [high, token],
    player: { hand: [high.id], monsterZone: [token.id] }
  }));

  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: PLAYER,
    cardId: high.id,
    tributeCardIds: [token.id],
    index: 0
  });
  const next = engine.getState();
  assert.deepEqual(next.players[PLAYER].monsterZone, [high.id]);
  assert.equal(next.players[PLAYER].grave.includes(token.id), false);
  assert.equal(next.cards[token.id], undefined);
  assert.ok(events.some((event) => event.type === "TOKEN_REMOVED" && event.reason === "tribute"));
  assert.equal(events.find((event) => event.type === "CARD_TRIBUTED")?.destination, "removed");
});

test("split token creation is all-or-nothing and never sources tokens from deck or hand", () => {
  const split = engineCard("split-spell", { type: "spell", effect: "splitToken" });
  const source = engineCard("split-source");
  const blockers = Array.from({ length: 3 }, (_, index) => engineCard(`split-blocker-${index}`));
  const tokenDefinition = engineCard("spark-fragment-token", { token: true, isToken: true });
  const definitions = { "spark-fragment-token": tokenDefinition };
  const fullState = engineState({
    cards: [split, source, ...blockers],
    player: {
      hand: [split.id],
      monsterZone: [source.id, ...blockers.map((card) => card.id)]
    },
    cardDefinitions: definitions
  });
  const rejected = new GameEngine(fullState);
  const before = rejected.getState();
  assert.throws(() => rejected.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: split.id,
    targetCardId: source.id
  }), GameRuleError);
  assert.deepEqual(rejected.getState(), before);

  const success = new GameEngine(engineState({
    cards: [split, source],
    player: { hand: [split.id], monsterZone: [source.id] },
    cardDefinitions: definitions
  }));
  const events = success.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: split.id,
    targetCardId: source.id
  });
  const next = success.getState();
  const tokenIds = next.players[PLAYER].monsterZone.filter((cardId) => next.cards[cardId]?.isToken);
  assert.equal(tokenIds.length, 2);
  assert.equal(next.players[PLAYER].hand.some((cardId) => tokenIds.includes(cardId)), false);
  assert.equal(next.players[PLAYER].deck.some((cardId) => tokenIds.includes(cardId)), false);
  assert.equal(events.filter((event) => event.type === "CARD_CREATED").length, 2);
  assert.ok(events.filter((event) => event.type === "CARD_CREATED").every((event) => event.originCardId === source.id));
});

test("fusion validates own unique materials and keeps failed resolutions atomic", () => {
  const fusion = engineCard("fusion-spell", {
    type: "spell",
    effect: "fusionSummon",
    fusion: { result: "fusion-result", materials: ["fusion-a", "fusion-b"] }
  });
  const first = engineCard("first-material", { templateId: "fusion-a" });
  const second = engineCard("second-material", { templateId: "fusion-b" });
  const rivalSecond = engineCard("rival-material", { templateId: "fusion-b", ownerId: AI });
  const result = engineCard("result-runtime", { templateId: "fusion-result" });

  for (const materialCardIds of [[first.id], [first.id, first.id], [first.id, rivalSecond.id]]) {
    const state = engineState({
      cards: [fusion, first, second, rivalSecond, result],
      player: { hand: [fusion.id], monsterZone: [first.id, second.id], deck: [result.id] },
      ai: { monsterZone: [rivalSecond.id] }
    });
    const engine = new GameEngine(state);
    const before = engine.getState();
    assert.throws(() => engine.dispatch({
      type: "ACTIVATE_CARD",
      playerId: PLAYER,
      rivalId: AI,
      cardId: fusion.id,
      materialCardIds,
      index: 0
    }), GameRuleError);
    assert.deepEqual(engine.getState(), before);
  }

  const success = new GameEngine(engineState({
    cards: [fusion, first, second, result],
    player: { hand: [fusion.id, second.id], monsterZone: [first.id], deck: [result.id] }
  }));
  const events = success.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: fusion.id,
    materialCardIds: [first.id, second.id],
    index: 0
  });
  const next = success.getState();
  assert.deepEqual(next.players[PLAYER].monsterZone, [result.id]);
  assert.deepEqual(next.players[PLAYER].grave, [fusion.id, first.id, second.id]);
  assert.deepEqual(events.find((event) => event.type === "MATERIALS_SENT")?.materialCardIds, [first.id, second.id]);
  assert.ok(events.some((event) => event.type === "FUSION_SUMMONED" && event.cardId === result.id));
});

test("tokens can satisfy an explicit fusion recipe and disappear as materials", () => {
  const fusion = engineCard("token-fusion-spell", {
    type: "spell",
    effect: "fusionSummon",
    fusion: { result: "token-fusion-result", materials: ["spark-fragment-token"] }
  });
  const token = engineCard("fusion-token", {
    templateId: "spark-fragment-token",
    token: true,
    isToken: true,
    generated: true
  });
  const result = engineCard("token-fusion-result-runtime", { templateId: "token-fusion-result" });
  const engine = new GameEngine(engineState({
    cards: [fusion, token, result],
    player: { hand: [fusion.id], monsterZone: [token.id], deck: [result.id] }
  }));

  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: fusion.id,
    materialCardIds: [token.id],
    index: 0
  });
  const next = engine.getState();
  assert.deepEqual(next.players[PLAYER].monsterZone, [result.id]);
  assert.equal(next.players[PLAYER].grave.includes(token.id), false);
  assert.equal(next.cards[token.id], undefined);
  assert.ok(events.some((event) => event.type === "TOKEN_REMOVED" && event.reason === "fusion-material"));
  assert.deepEqual(events.find((event) => event.type === "MATERIALS_SENT")?.tokenCardIds, [token.id]);
});

test("graveyard summons require an own monster target, remove it from grave, and reset summon state", () => {
  const revive = engineCard("revive-spell", { type: "spell", effect: "graveRevive" });
  const target = engineCard("revive-target", {
    used: true,
    changedMode: true,
    mode: "defense",
    tempAtk: 700,
    tempDef: -200,
    battleWear: 300,
    destructionProtectionUsed: true
  });
  const engine = new GameEngine(engineState({
    cards: [revive, target],
    player: { hand: [revive.id], grave: [target.id] }
  }));
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: revive.id,
    targetCardId: target.id
  });
  const next = engine.getState();
  assert.equal(next.players[PLAYER].grave.includes(target.id), false);
  assert.deepEqual(next.players[PLAYER].monsterZone, [target.id]);
  assert.deepEqual(
    { used: next.cards[target.id].used, changedMode: next.cards[target.id].changedMode, mode: next.cards[target.id].mode, tempAtk: next.cards[target.id].tempAtk, tempDef: next.cards[target.id].tempDef, battleWear: next.cards[target.id].battleWear, protection: next.cards[target.id].destructionProtectionUsed },
    { used: false, changedMode: false, mode: "attack", tempAtk: 0, tempDef: 0, battleWear: 0, protection: false }
  );
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.fromZone === "grave" && event.cardId === target.id));

  const rivalTarget = engineCard("rival-grave-target", { ownerId: AI });
  const rejectedState = engineState({
    cards: [revive, rivalTarget],
    player: { hand: [revive.id] },
    ai: { grave: [rivalTarget.id] }
  });
  const rejected = new GameEngine(rejectedState);
  const before = rejected.getState();
  assert.throws(() => rejected.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: revive.id,
    targetCardId: rivalTarget.id
  }), GameRuleError);
  assert.deepEqual(rejected.getState(), before);
});

test("graveyard summon destination conflicts and missing targets leave all state unchanged", () => {
  const revive = engineCard("fixed-revive", { type: "spell", effect: "fixedRevive" });
  const target = engineCard("fixed-revive-target");
  const occupant = engineCard("fixed-revive-occupant");
  const effects = {
    fixedRevive: {
      duration: "oneShot",
      target: { player: "self", zone: "grave", cardType: "monster" },
      operations: [{ op: "specialSummonFromGrave", player: "self", cardId: "$action.targetCardId", index: 4 }]
    }
  };
  const state = engineState({
    cards: [revive, target, occupant],
    player: {
      hand: [revive.id],
      grave: [target.id],
      monsterZone: [occupant.id],
      zoneSlots: {
        monsterZone: [null, null, null, null, occupant.id],
        spellTrapZone: Array(SPELL_TRAP_ZONE_SIZE).fill(null)
      }
    }
  });
  const engine = new GameEngine(state, { cardEffects: effects });
  const before = engine.getState();
  assert.throws(() => engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: revive.id,
    targetCardId: target.id
  }), GameRuleError);
  assert.deepEqual(engine.getState(), before);

  assert.throws(() => engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: revive.id,
    targetCardId: "missing-target"
  }), GameRuleError);
  assert.deepEqual(engine.getState(), before);
});

test("assertValidGameState validates slot shape, definitions, token markers, and machine contradictions", () => {
  const monster = engineCard("definition-runtime", { templateId: "known-monster" });
  const missingDefinition = engineState({ cards: [monster], player: { monsterZone: [monster.id] } });
  missingDefinition.cardDefinitions = {};
  missingDefinition.cardDefinitionsComplete = true;
  assert.throws(() => assertValidGameState(missingDefinition), GameStateValidationError);

  const tokenDefinition = engineCard("marked-token", { token: true });
  const unmarkedToken = engineCard("unmarked-token", { templateId: "marked-token" });
  const tokenState = engineState({ cards: [unmarkedToken], player: { monsterZone: [unmarkedToken.id] } });
  tokenState.cardDefinitions = { "marked-token": tokenDefinition };
  tokenState.cardDefinitionsComplete = true;
  assert.throws(() => assertValidGameState(tokenState), GameStateValidationError);

  const badSlots = engineState({ cards: [monster], player: { monsterZone: [monster.id] } });
  badSlots.players[PLAYER].zoneSlots = {
    monsterZone: [monster.id, null],
    spellTrapZone: Array(SPELL_TRAP_ZONE_SIZE).fill(null)
  };
  assert.throws(() => assertValidGameState(badSlots), GameStateValidationError);

  const badMachine = engineState();
  badMachine.machine.responseWindow = { type: "optional", playerId: PLAYER };
  badMachine.machine.autoEnd = { playerId: PLAYER, requestedAt: 1, deadline: 2 };
  assert.throws(() => assertValidGameState(badMachine), GameStateValidationError);
});
