import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets, library, scenarioSetups } from "../src/data.js";
import { cloneCardById, createDuelist } from "../src/deck.js";
import { buildEngineStateFromUiState, canDispatchSpellFromUiState, canDispatchTrapFromUiState } from "../src/engine-adapter.js";
import { EffectDuration, GameEngine, Phase, Timing, assertValidGameState, getCardEffectDefinition } from "../src/game-engine.js";
import { buildScenarioState } from "../src/scenario-state.js";

const PLAYER = "player";
const AI = "ai";

function cardByTemplate(id) {
  const card = library.find((entry) => entry.id === id);
  assert.ok(card, `missing card ${id}`);
  return card;
}

function scenarioUiState(key) {
  const setup = buildScenarioState(scenarioSetups[key], {
    playerPreset: "protagonistTrioOmega",
    aiPreset: "trioOmegaRival"
  });
  return {
    player: { ...createDuelist(PLAYER), ...setup.player },
    ai: { ...createDuelist(AI), ...setup.ai },
    turn: PLAYER,
    phase: Phase.main,
    gameEvents: setup.gameEvents || []
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
    timing: phase === Phase.battle ? Timing.battleOpen : Timing.mainOpen,
    responseWindow: null,
    chain: [],
    actionWindow: null,
    autoEnd: null,
    pendingAttack: null
  };
  return new GameEngine(next);
}

function findCardId(state, playerId, zone, templateId) {
  const cardId = state.players[playerId][zone].find((candidate) => state.cards[candidate]?.templateId === templateId);
  assert.ok(cardId, `missing ${playerId}.${zone} ${templateId}`);
  return cardId;
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

test("trio omega finale pack has rule-backed cards, decks, and scenarios", () => {
  const expectedIds = [
    "trio-sun-judicator",
    "trio-moon-warden",
    "trio-star-herald",
    "trio-decoy-ward",
    "trio-ember-pawn",
    "trio-moon-dominion",
    "trio-solar-snare",
    "trio-moonbreaker-ray",
    "trio-ember-recall",
    "trio-chain-veil",
    "trio-final-counter"
  ];
  expectedIds.forEach((id) => cardByTemplate(id));

  assert.equal(cardByTemplate("trio-sun-judicator").afterAttack, "sunflareSunder");
  assert.equal(cardByTemplate("trio-star-herald").afterAttack, "starDoomCharge");
  assert.equal(cardByTemplate("trio-moon-dominion").effect, "lunarDominion");
  assert.equal(cardByTemplate("trio-solar-snare").trigger, "attackDestroy");
  assert.equal(cardByTemplate("trio-moonbreaker-ray").effect, "destroySpellTrap");
  assert.equal(cardByTemplate("trio-ember-recall").effect, "graveRevive");
  assert.equal(cardByTemplate("trio-chain-veil").trigger, "attackNegate");
  assert.equal(cardByTemplate("trio-final-counter").effect, "trioFinalCounter");

  assert.equal(getCardEffectDefinition("lunarDominion").duration, EffectDuration.continuous);
  assert.deepEqual(getCardEffectDefinition("lunarDominion").operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: -900 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -900 }
  ]);
  assert.deepEqual(getCardEffectDefinition("trioFinalCounter").requirements, [
    { type: "maxLp", player: "self", amount: 1600 },
    { type: "requireFieldCards", player: "self", materials: ["trio-ember-pawn"] },
    { type: "noSpellTrapTemplate", player: "rival", templateId: "trio-moon-dominion" }
  ]);
  assert.deepEqual(getCardEffectDefinition("sunflareSunder").operations, [
    { op: "destroyCard", cardId: { playerId: "$action.rivalId", zone: "spellTrapZone", rule: "first" } }
  ]);

  assert.equal(canDispatchSpellFromUiState(cardByTemplate("trio-moon-dominion")), true);
  assert.equal(canDispatchSpellFromUiState(cardByTemplate("trio-moonbreaker-ray")), true);
  assert.equal(canDispatchSpellFromUiState(cardByTemplate("trio-ember-recall")), true);
  assert.equal(canDispatchSpellFromUiState(cardByTemplate("trio-final-counter")), true);
  assert.equal(canDispatchTrapFromUiState(cardByTemplate("trio-solar-snare")), true);
  assert.equal(canDispatchTrapFromUiState(cardByTemplate("trio-chain-veil")), true);

  assert.ok(deckPresets.protagonistTrioOmega.ids.includes("trio-final-counter"));
  assert.ok(deckPresets.trioOmegaRival.ids.includes("trio-sun-judicator"));
  assert.ok(deckPresets.trioOmegaRival.ids.includes("trio-moon-dominion"));
  assert.equal(scenarioSetups.protagonistTrioOmega.difficulty, "demo");
  assert.equal(scenarioSetups.protagonistTrioOmegaChallenge.difficulty, "challenge");
  assert.ok(scenarioSetups.protagonistTrioOmegaChallenge.recommendedLine.includes("三曜终断强化余烁小卫，连续攻击月曜和星曜"));

  for (const key of ["protagonistTrioOmega", "protagonistTrioOmegaChallenge"]) {
    const setup = buildScenarioState(scenarioSetups[key], {
      playerPreset: "protagonistTrioOmega",
      aiPreset: "trioOmegaRival"
    });
    assert.equal(setup.player.field[0].id, "trio-decoy-ward");
    assert.equal(setup.player.field[0].tempAtk, -900);
    assert.equal(setup.player.field[0].tempDef, -900);
    assert.ok(setup.gameEvents.some((event) => event.type === "CONTINUOUS_EFFECT_REGISTERED" && event.effectId === "lunarDominion"));
    assertValidGameState(buildEngineStateFromUiState(scenarioUiState(key)));
  }
});

test("trio ace pressure resolves and clearing moon pressure releases the continuous modifier", () => {
  const uiState = scenarioUiState("protagonistTrioOmegaChallenge");
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  let state = engine.getState();
  const decoyId = findCardId(state, PLAYER, "monsterZone", "trio-decoy-ward");
  const rayId = findCardId(state, PLAYER, "hand", "trio-moonbreaker-ray");
  const moonDominionId = findCardId(state, AI, "spellTrapZone", "trio-moon-dominion");

  assert.equal(state.cards[decoyId].tempAtk, -900);
  assert.equal(state.cards[decoyId].tempDef, -900);
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId: PLAYER,
    rivalId: AI,
    cardId: rayId,
    targetCardId: moonDominionId
  });
  state = engine.getState();

  assert.equal(state.cards[decoyId].tempAtk, 0);
  assert.equal(state.cards[decoyId].tempDef, 0);
  assert.deepEqual(state.players[AI].spellTrapZone, []);
  assert.ok(events.some((event) => event.type === "CONTINUOUS_EFFECT_RELEASED" && event.effectId === "lunarDominion"));
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === moonDominionId));
  assertValidGameState(state);
});

test("sun and star trio ace pressure effects resolve through battle", () => {
  const uiState = scenarioUiState("protagonistTrioOmegaChallenge");
  uiState.player.lp = 4000;
  uiState.player.traps[0] = cloneCardById("trio-chain-veil");
  const engine = engineWithTurn(buildEngineStateFromUiState(uiState), AI, Phase.battle);
  let state = engine.getState();
  const sunId = findCardId(state, AI, "monsterZone", "trio-sun-judicator");
  const decoyId = findCardId(state, PLAYER, "monsterZone", "trio-decoy-ward");
  const veilId = findCardId(state, PLAYER, "spellTrapZone", "trio-chain-veil");

  const sunEvents = resolveAttack(engine, { playerId: AI, rivalId: PLAYER, attackerCardId: sunId, targetCardId: decoyId });
  state = engine.getState();

  assert.ok(state.players[PLAYER].grave.includes(veilId), "sun ace should sunder the first backrow after battle");
  assert.ok(sunEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === veilId && event.sourceCardId === sunId));
  assert.ok(state.players[PLAYER].grave.includes(decoyId), "sun ace should break the weakened decoy if not baited");

  const starId = findCardId(state, AI, "monsterZone", "trio-star-herald");
  const starEvents = resolveAttack(engine, { playerId: AI, rivalId: PLAYER, attackerCardId: starId });
  state = engine.getState();

  assert.equal(state.cards[starId].tempAtk, 300);
  assert.equal(state.players[PLAYER].lp, 1300);
  assert.ok(starEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 300 && event.sourceCardId === starId));
  assertValidGameState(state);
});

test("wrong trio routes fail before the finale condition is assembled", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  const recallId = findCardId(engine.getState(), PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(engine.getState(), PLAYER, "grave", "trio-ember-pawn");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  let state = engine.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId }),
    /requires no trio-moon-dominion/
  );

  state = engine.getState();
  const battleEngine = engineWithTurn(state, PLAYER, Phase.battle);
  const pawnId = findCardId(battleEngine.getState(), PLAYER, "monsterZone", "trio-ember-pawn");
  const sunId = findCardId(battleEngine.getState(), AI, "monsterZone", "trio-sun-judicator");
  const events = resolveAttack(battleEngine, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: sunId });
  const next = battleEngine.getState();

  assert.equal(next.players[PLAYER].lp, 0);
  assert.equal(next.gameOver.winnerId, AI);
  assert.ok(events.some((event) =>
    event.type === "BATTLE_RESOLVED" &&
    event.outcome.kind === "countered" &&
    event.outcome.damagePlayerId === PLAYER
  ));
});

test("correct trio line uses bait, clears pressure, revives the low attacker, and wins without raw high attack", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  let state = engine.getState();
  const snareId = findCardId(state, PLAYER, "hand", "trio-solar-snare");
  engine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: snareId, index: 0 });

  const aiBattle = engineWithTurn(engine.getState(), AI, Phase.battle);
  state = aiBattle.getState();
  const sunId = findCardId(state, AI, "monsterZone", "trio-sun-judicator");
  const decoyId = findCardId(state, PLAYER, "monsterZone", "trio-decoy-ward");
  const setSnareId = findCardId(state, PLAYER, "spellTrapZone", "trio-solar-snare");
  const declarationEvents = aiBattle.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: sunId,
    targetCardId: decoyId
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  aiBattle.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: setSnareId,
    effectId: "attackDestroy",
    targetEffectId: declaration.id,
    attackerCardId: sunId
  });
  aiBattle.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: setSnareId,
    targetEffectId: declaration.id,
    attackerCardId: sunId
  });
  const trapEvents = aiBattle.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  state = aiBattle.getState();

  assert.ok(state.players[AI].grave.includes(sunId));
  assert.ok(state.players[PLAYER].grave.includes(setSnareId));
  assert.ok(state.players[PLAYER].monsterZone.includes(decoyId));
  assert.ok(trapEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === sunId));

  const playerMain = engineWithTurn(state, PLAYER, Phase.main);
  state = playerMain.getState();
  const rayId = findCardId(state, PLAYER, "hand", "trio-moonbreaker-ray");
  const moonDominionId = findCardId(state, AI, "spellTrapZone", "trio-moon-dominion");
  playerMain.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: rayId, targetCardId: moonDominionId });

  state = playerMain.getState();
  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(state, PLAYER, "grave", "trio-ember-pawn");
  playerMain.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  state = playerMain.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  const finalEvents = playerMain.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId });
  state = playerMain.getState();
  const pawnId = findCardId(state, PLAYER, "monsterZone", "trio-ember-pawn");

  assert.equal(state.cards[pawnId].atk, 600);
  assert.equal(state.cards[pawnId].tempAtk, 2100);
  assert.ok(finalEvents.some((event) => event.type === "ABILITY_GRANTED" && event.ability === "attackReset"));

  const playerBattle = engineWithTurn(state, PLAYER, Phase.battle);
  state = playerBattle.getState();
  const moonId = findCardId(state, AI, "monsterZone", "trio-moon-warden");
  const starId = findCardId(state, AI, "monsterZone", "trio-star-herald");
  const firstBattle = resolveAttack(playerBattle, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: moonId });
  assert.ok(firstBattle.some((event) => event.type === "MONSTER_READIED" && event.cardId === pawnId));
  const secondBattle = resolveAttack(playerBattle, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: starId });
  state = playerBattle.getState();

  assert.equal(state.players[AI].lp, 0);
  assert.equal(state.gameOver.winnerId, PLAYER);
  assert.ok(state.players[AI].grave.includes(moonId));
  assert.ok(state.players[AI].grave.includes(starId));
  assert.ok(secondBattle.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === PLAYER));
  assert.equal(state.cards[pawnId].atk, 600, "the finisher remains the low-attack key monster");
  assertValidGameState(state);
});
