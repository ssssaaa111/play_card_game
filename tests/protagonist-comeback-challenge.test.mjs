import test from "node:test";
import assert from "node:assert/strict";

import { library, scenarioSetups } from "../src/data.js";
import { createDuelist } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { GameEngine, Phase, Timing, assertValidGameState } from "../src/game-engine.js";
import { totalAtk } from "../src/rules.js";
import { buildScenarioState } from "../src/scenario-state.js";

const PLAYER = "player";
const AI = "ai";

function templateCard(templateId, runtimeId, ownerId = PLAYER, overrides = {}) {
  const template = library.find((entry) => entry.id === templateId);
  assert.ok(template, `missing card template ${templateId}`);
  return {
    ...template,
    id: runtimeId,
    uid: runtimeId,
    templateId,
    ownerId,
    tempAtk: 0,
    tempDef: 0,
    battleWear: 0,
    used: false,
    changedMode: false,
    mode: template.type === "monster" ? "attack" : undefined,
    ...overrides
  };
}

function basePlayer(id, overrides = {}) {
  return {
    id,
    lp: 4000,
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

function makeState({ player = {}, ai = {}, turn = {}, machine = {} } = {}) {
  const cards = [
    templateCard("dawn-edge", "hand-dawn"),
    templateCard("last-spark", "hand-last-spark"),
    templateCard("starwake-recall", "hand-recall"),
    templateCard("last-light-guard", "hand-last-light", PLAYER),
    templateCard("limit-break-oath", "hand-oath"),
    templateCard("battle-trance", "deck-battle-trance"),
    templateCard("backlash-mirror", "deck-backlash", PLAYER),
    templateCard("dispelling-ray", "deck-dispel"),
    templateCard("spark-runner", "field-spark", PLAYER),
    templateCard("spark-runner", "grave-spark", PLAYER),
    templateCard("astral-comet-ace", "grave-ace", PLAYER),
    templateCard("flare-titan", "ai-flare", AI),
    templateCard("mirror-snare", "ai-mirror", AI),
    templateCard("renewal", "ai-renewal", AI)
  ];
  const phase = turn.phase || Phase.main;
  return {
    cards: Object.fromEntries(cards.map((card) => [card.id, card])),
    players: {
      [PLAYER]: basePlayer(PLAYER, {
        lp: 900,
        hand: ["hand-dawn", "hand-last-spark", "hand-recall", "hand-last-light", "hand-oath"],
        deck: ["deck-battle-trance", "deck-backlash", "deck-dispel"],
        monsterZone: ["field-spark"],
        grave: ["grave-spark", "grave-ace"],
        ...player
      }),
      [AI]: basePlayer(AI, {
        lp: 3400,
        deck: ["ai-renewal"],
        monsterZone: ["ai-flare"],
        spellTrapZone: ["ai-mirror"],
        ...ai
      })
    },
    turn: {
      playerId: PLAYER,
      phase,
      ...turn
    },
    machine: {
      phase,
      timing: phase === Phase.battle ? Timing.battleOpen : Timing.mainOpen,
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
    continuousEffects: [],
    nextEventId: 1
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function engineWithTurn(state, playerId, phase) {
  const next = clone(state);
  next.turn = { playerId, phase };
  next.machine = {
    phase,
    timing: phase === Phase.battle ? Timing.battleOpen : phase === Phase.draw ? Timing.draw : Timing.mainOpen,
    responseWindow: null,
    chain: [],
    actionWindow: null,
    autoEnd: null,
    pendingAttack: null
  };
  return new GameEngine(next);
}

function resolveAttack(engine, { playerId, rivalId, attackerCardId, targetCardId = null }) {
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId,
    rivalId,
    attackerCardId,
    ...(targetCardId ? { targetCardId } : {})
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: rivalId, reason: "declined" });
  return engine.dispatch({
    type: "RESOLVE_BATTLE",
    playerId,
    rivalId,
    attackerCardId,
    ...(targetCardId ? { targetCardId } : {}),
    declarationEventId: declaration.id
  });
}

function prepareComeback(targetCardId) {
  const engine = new GameEngine(makeState());
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-last-spark" });
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-recall", targetCardId });
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-dawn", targetCardId });
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-oath", targetCardId });
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "deck-battle-trance", targetCardId });
  return engine.getState();
}

test("comeback challenge scenario starts as a valid low-resource puzzle state", () => {
  const setup = buildScenarioState(scenarioSetups.protagonistComebackChallenge, {
    playerPreset: "protagonistComeback",
    aiPreset: "suppressionRival"
  });
  const uiState = {
    player: { ...createDuelist("player"), ...setup.player },
    ai: { ...createDuelist("ai"), ...setup.ai },
    turn: "player",
    phase: "main",
    gameEvents: []
  };
  const engineState = buildEngineStateFromUiState(uiState);

  assert.equal(setup.player.lp, 900);
  assert.deepEqual(setup.player.grave.map((card) => card.id), ["spark-runner", "astral-comet-ace"]);
  assert.deepEqual(setup.ai.traps.filter(Boolean).map((card) => card.id), ["mirror-snare"]);
  assertValidGameState(engineState);
});

test("wrong comeback revive target cannot match the ace damage ceiling", () => {
  const wrong = prepareComeback("grave-spark");
  const correct = prepareComeback("grave-ace");

  assert.equal(wrong.players[PLAYER].monsterZone.includes("grave-ace"), false);
  assert.equal(totalAtk(wrong.cards["grave-spark"]), 2600);
  assert.equal(totalAtk(correct.cards["grave-ace"]), 4100);
  assert.ok(totalAtk(correct.cards["grave-ace"]) - totalAtk(wrong.cards["grave-spark"]) >= 1500);
});

test("comeback challenge key attack is lethal if the defense trap is not set", () => {
  const engine = engineWithTurn(makeState(), AI, Phase.battle);
  const events = resolveAttack(engine, {
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: "ai-flare",
    targetCardId: "field-spark"
  });
  const next = engine.getState();

  assert.equal(next.players[PLAYER].lp, 0);
  assert.equal(next.gameOver.winnerId, AI);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === PLAYER &&
    event.requested === 1400
  ));
  assertValidGameState(next);
});

test("correct comeback challenge path blocks the attack and wins after clearing the counter trap", () => {
  const prep = new GameEngine(makeState());
  prep.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-last-spark" });
  prep.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-recall", targetCardId: "grave-ace" });
  prep.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-dawn", targetCardId: "grave-ace" });
  prep.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "hand-oath", targetCardId: "grave-ace" });
  prep.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: "hand-last-light", index: 0 });

  const defense = engineWithTurn(prep.getState(), AI, Phase.battle);
  const declarationEvents = defense.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: "ai-flare",
    targetCardId: "field-spark"
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  defense.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: "hand-last-light",
    effectId: "attackNegate",
    targetEffectId: declaration.id
  });
  defense.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: "hand-last-light",
    attackerCardId: "ai-flare",
    targetEffectId: declaration.id
  });
  const chainEvents = defense.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  const cancelEvents = defense.dispatch({
    type: "CANCEL_ATTACK",
    playerId: AI,
    declarationEventId: declaration.id,
    consumeAttack: true,
    reason: "attackNegate"
  });
  assert.ok(chainEvents.some((event) => event.type === "EFFECT_NEGATED" && event.targetEffectId === declaration.id));
  assert.ok(cancelEvents.some((event) => event.type === "ATTACK_CANCELED" && event.declarationEventId === declaration.id));
  assert.equal(defense.getState().players[PLAYER].lp, 900);

  const secondDraw = engineWithTurn(defense.getState(), PLAYER, Phase.draw);
  secondDraw.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER, count: 1 });
  secondDraw.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "deck-dispel", targetCardId: "ai-mirror" });
  secondDraw.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "deck-battle-trance", targetCardId: "grave-ace" });
  secondDraw.dispatch({ type: "CHANGE_PHASE", playerId: PLAYER, phase: Phase.battle });

  const firstAttackEvents = resolveAttack(secondDraw, {
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "grave-ace",
    targetCardId: "ai-flare"
  });
  assert.ok(firstAttackEvents.some((event) => event.type === "BATTLE_RESOLVED"));
  assert.equal(secondDraw.getState().players[AI].monsterZone.includes("ai-flare"), false);
  assert.equal(secondDraw.getState().cards["grave-ace"].used, false);

  const finalEvents = resolveAttack(secondDraw, {
    playerId: PLAYER,
    rivalId: AI,
    attackerCardId: "grave-ace"
  });
  const final = secondDraw.getState();

  assert.equal(final.gameOver.winnerId, PLAYER);
  assert.ok(final.players[AI].grave.includes("ai-mirror"));
  assert.ok(finalEvents.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === PLAYER));
  assertValidGameState(final);
});
