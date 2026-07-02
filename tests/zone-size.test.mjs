import test from "node:test";
import assert from "node:assert/strict";

import { createDuelist } from "../src/deck.js";
import {
  Ability,
  GameEngine,
  GameRuleError,
  GameStateValidationError,
  Phase,
  Timing,
  assertValidGameState,
  getLegalActions
} from "../src/game-engine.js";
import {
  dispatchSetTrapFromUiState,
  dispatchSummonMonsterFromUiState,
  projectBattleFromUiState
} from "../src/engine-adapter.js";
import {
  MAX_LP,
  MONSTER_ZONE_SIZE,
  SPELL_TRAP_ZONE_SIZE,
  legalAttackTargets
} from "../src/rules.js";
import { ACTION_WINDOWS, PHASES } from "../src/turn-state.js";

const PLAYER = "player";
const AI = "ai";

function engineMonster(id, ownerId = PLAYER, overrides = {}) {
  return {
    id,
    templateId: id,
    ownerId,
    type: "monster",
    name: id,
    atk: 1000,
    def: 1000,
    mode: "attack",
    used: false,
    changedMode: false,
    ...overrides
  };
}

function engineTrap(id, ownerId = PLAYER, overrides = {}) {
  return {
    id,
    templateId: id,
    ownerId,
    type: "trap",
    name: id,
    trigger: "attackNegate",
    ...overrides
  };
}

function baseEnginePlayer(id, overrides = {}) {
  return {
    id,
    lp: MAX_LP,
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

function engineState({ cards = [], player = {}, ai = {}, turnPlayer = PLAYER, phase = Phase.main, abilities = {} } = {}) {
  return {
    cards: Object.fromEntries(cards.map((card) => [card.id, card])),
    players: {
      [PLAYER]: baseEnginePlayer(PLAYER, player),
      [AI]: baseEnginePlayer(AI, ai)
    },
    turn: {
      playerId: turnPlayer,
      phase
    },
    machine: {
      phase,
      timing: phase === Phase.battle ? Timing.battleOpen : Timing.mainOpen,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null
    },
    abilities: {
      [PLAYER]: abilities[PLAYER] || [],
      [AI]: abilities[AI] || []
    },
    events: [],
    continuousEffects: [],
    nextEventId: 1
  };
}

function extraSummonAbility() {
  return {
    ability: Ability.extraSummon,
    uses: 1,
    duration: "turn",
    sourceCardId: null
  };
}

function uiMonster(uid, ownerId = PLAYER, overrides = {}) {
  return {
    uid,
    id: overrides.id || "star-lancer",
    templateId: overrides.id || "star-lancer",
    ownerId,
    type: "monster",
    name: uid,
    atk: 1500,
    def: 1000,
    mode: "attack",
    used: false,
    changedMode: false,
    ...overrides
  };
}

function uiTrap(uid, ownerId = PLAYER, overrides = {}) {
  return {
    uid,
    id: overrides.id || "mirror-snare",
    templateId: overrides.id || "mirror-snare",
    ownerId,
    type: "trap",
    name: uid,
    trigger: "attackNegate",
    ...overrides
  };
}

function uiState(overrides = {}) {
  return {
    player: createDuelist(PLAYER),
    ai: createDuelist(AI),
    turn: PLAYER,
    phase: PHASES.main,
    actionWindow: ACTION_WINDOWS.main,
    gameEvents: [],
    ...overrides
  };
}

test("initial duelists expose five monster slots and five spell trap slots", () => {
  const player = createDuelist(PLAYER);
  const ai = createDuelist(AI);

  assert.equal(player.field.length, MONSTER_ZONE_SIZE);
  assert.equal(ai.field.length, MONSTER_ZONE_SIZE);
  assert.equal(player.traps.length, SPELL_TRAP_ZONE_SIZE);
  assert.equal(ai.traps.length, SPELL_TRAP_ZONE_SIZE);
  assert.deepEqual(player.field, Array(MONSTER_ZONE_SIZE).fill(null));
  assert.deepEqual(ai.traps, Array(SPELL_TRAP_ZONE_SIZE).fill(null));
});

test("player dispatch can summon and set cards into the fourth and fifth fixed UI slots", () => {
  const fourthMonster = uiMonster("player-fourth-monster");
  const fifthMonster = uiMonster("player-fifth-monster", PLAYER, { id: "solar-knight" });
  const fourthTrap = uiTrap("player-fourth-trap");
  const fifthTrap = uiTrap("player-fifth-trap", PLAYER, { id: "guard-sigil", trigger: "directShield" });
  const state = uiState();
  state.player.hand = [fourthMonster, fifthMonster, fourthTrap, fifthTrap];
  state.player.extraSummon = 1;

  const fourthSummonEvents = dispatchSummonMonsterFromUiState(state, PLAYER, 0, 3);
  const fifthSummonEvents = dispatchSummonMonsterFromUiState(state, PLAYER, 0, 4);
  const fourthTrapEvents = dispatchSetTrapFromUiState(state, PLAYER, 0, 3);
  const fifthTrapEvents = dispatchSetTrapFromUiState(state, PLAYER, 0, 4);

  assert.equal(state.player.field[3], fourthMonster);
  assert.equal(state.player.field[4], fifthMonster);
  assert.equal(state.player.traps[3], fourthTrap);
  assert.equal(state.player.traps[4], fifthTrap);
  assert.ok(fourthSummonEvents.some((event) => event.type === "CARD_MOVED" && event.to.index === 3));
  assert.ok(fifthSummonEvents.some((event) => event.type === "CARD_MOVED" && event.to.index === 4));
  assert.ok(fourthTrapEvents.some((event) => event.type === "TRAP_SET" && event.index === 3));
  assert.ok(fifthTrapEvents.some((event) => event.type === "TRAP_SET" && event.index === 4));
});

test("AI dispatch can summon and set cards into the fourth and fifth fixed UI slots", () => {
  const fourthMonster = uiMonster("ai-fourth-monster", AI);
  const fifthMonster = uiMonster("ai-fifth-monster", AI, { id: "solar-knight" });
  const fourthTrap = uiTrap("ai-fourth-trap", AI);
  const fifthTrap = uiTrap("ai-fifth-trap", AI, { id: "guard-sigil", trigger: "directShield" });
  const state = uiState({ turn: AI });
  state.ai.hand = [fourthMonster, fifthMonster, fourthTrap, fifthTrap];
  state.ai.extraSummon = 1;

  dispatchSummonMonsterFromUiState(state, AI, 0, 3);
  dispatchSummonMonsterFromUiState(state, AI, 0, 4);
  dispatchSetTrapFromUiState(state, AI, 0, 3);
  dispatchSetTrapFromUiState(state, AI, 0, 4);

  assert.equal(state.ai.field[3], fourthMonster);
  assert.equal(state.ai.field[4], fifthMonster);
  assert.equal(state.ai.traps[3], fourthTrap);
  assert.equal(state.ai.traps[4], fifthTrap);
});

test("rules reject summoning or setting beyond five fixed zone slots", () => {
  const monsterCards = Array.from({ length: MONSTER_ZONE_SIZE + 1 }, (_, index) => engineMonster(`monster-${index}`));
  const trapCards = Array.from({ length: SPELL_TRAP_ZONE_SIZE + 1 }, (_, index) => engineTrap(`trap-${index}`));
  const summonState = engineState({
    cards: monsterCards,
    player: {
      hand: [monsterCards.at(-1).id],
      monsterZone: monsterCards.slice(0, MONSTER_ZONE_SIZE).map((card) => card.id)
    }
  });
  const trapState = engineState({
    cards: trapCards,
    player: {
      hand: [trapCards.at(-1).id],
      spellTrapZone: trapCards.slice(0, SPELL_TRAP_ZONE_SIZE).map((card) => card.id)
    }
  });

  assert.throws(
    () => new GameEngine(summonState).dispatch({
      type: "SUMMON_MONSTER",
      playerId: PLAYER,
      cardId: monsterCards.at(-1).id,
      index: MONSTER_ZONE_SIZE
    }),
    GameRuleError
  );
  assert.throws(
    () => new GameEngine(trapState).dispatch({
      type: "SET_TRAP",
      playerId: PLAYER,
      cardId: trapCards.at(-1).id,
      index: SPELL_TRAP_ZONE_SIZE
    }),
    GameRuleError
  );
});

test("assertValidGameState accepts five-slot zones and rejects zone overflow", () => {
  const monsters = Array.from({ length: MONSTER_ZONE_SIZE }, (_, index) => engineMonster(`valid-monster-${index}`));
  const traps = Array.from({ length: SPELL_TRAP_ZONE_SIZE }, (_, index) => engineTrap(`valid-trap-${index}`));
  const valid = engineState({
    cards: [...monsters, ...traps],
    player: {
      monsterZone: monsters.map((card) => card.id),
      spellTrapZone: traps.map((card) => card.id)
    }
  });

  assert.doesNotThrow(() => assertValidGameState(valid));

  const overflowMonsters = [...monsters, engineMonster("overflow-monster")];
  const overflow = engineState({
    cards: overflowMonsters,
    player: {
      monsterZone: overflowMonsters.map((card) => card.id)
    }
  });

  assert.throws(() => assertValidGameState(overflow), GameStateValidationError);
});

test("battle target selection and projection include five monster targets", () => {
  const attacker = uiMonster("player-attacker", PLAYER);
  const targets = Array.from({ length: MONSTER_ZONE_SIZE }, (_, index) =>
    uiMonster(`ai-target-${index}`, AI, { id: `target-${index}`, atk: 900 + index })
  );
  const ui = uiState({ phase: PHASES.battle, actionWindow: ACTION_WINDOWS.battle });
  ui.player.field[0] = attacker;
  targets.forEach((target, index) => {
    ui.ai.field[index] = target;
  });

  assert.deepEqual(
    legalAttackTargets(ui.player, ui.ai, attacker).map((target) => target.targetIndex),
    [0, 1, 2, 3, 4]
  );

  const projection = projectBattleFromUiState(ui, PLAYER, { attackerIndex: 0 });
  assert.deepEqual(projection.targetIndexes, [0, 1, 2, 3, 4]);

  const cards = [
    engineMonster(attacker.uid, PLAYER),
    ...targets.map((target) => engineMonster(target.uid, AI))
  ];
  const legal = getLegalActions(engineState({
    cards,
    player: { monsterZone: [attacker.uid] },
    ai: { monsterZone: targets.map((target) => target.uid) },
    phase: Phase.battle
  }), PLAYER);

  assert.deepEqual(
    legal.actions.declareAttack.map((action) => action.targetCardId),
    targets.map((target) => target.uid)
  );
});

test("engine dispatch can append fourth and fifth compact zone cards for either player", () => {
  const playerMonsters = Array.from({ length: MONSTER_ZONE_SIZE }, (_, index) => engineMonster(`player-engine-monster-${index}`));
  const aiTraps = Array.from({ length: SPELL_TRAP_ZONE_SIZE }, (_, index) => engineTrap(`ai-engine-trap-${index}`, AI));
  const state = engineState({
    cards: [...playerMonsters, ...aiTraps],
    player: {
      hand: playerMonsters.slice(MONSTER_ZONE_SIZE - 2).map((card) => card.id),
      monsterZone: playerMonsters.slice(0, MONSTER_ZONE_SIZE - 2).map((card) => card.id)
    },
    ai: {
      hand: aiTraps.slice(SPELL_TRAP_ZONE_SIZE - 2).map((card) => card.id),
      spellTrapZone: aiTraps.slice(0, SPELL_TRAP_ZONE_SIZE - 2).map((card) => card.id)
    },
    abilities: {
      [PLAYER]: [extraSummonAbility()],
      [AI]: []
    }
  });

  const playerEngine = new GameEngine(state);
  playerEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: playerMonsters[3].id, index: 3 });
  playerEngine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, cardId: playerMonsters[4].id, index: 4 });

  assert.deepEqual(playerEngine.getState().players[PLAYER].monsterZone, playerMonsters.map((card) => card.id));

  const aiState = {
    ...playerEngine.getState(),
    turn: { playerId: AI, phase: Phase.main },
    machine: {
      phase: Phase.main,
      timing: Timing.mainOpen,
      responseWindow: null,
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null
    }
  };
  const aiEngine = new GameEngine(aiState);
  aiEngine.dispatch({ type: "SET_TRAP", playerId: AI, cardId: aiTraps[3].id, index: 3 });
  aiEngine.dispatch({ type: "SET_TRAP", playerId: AI, cardId: aiTraps[4].id, index: 4 });

  assert.deepEqual(aiEngine.getState().players[AI].spellTrapZone, aiTraps.map((card) => card.id));
});
