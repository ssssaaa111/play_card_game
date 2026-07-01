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

function engineStateWithOpeningDraw(key) {
  const state = buildEngineStateFromUiState(scenarioUiState(key));
  const topCardId = state.players[PLAYER].deck.shift();
  assert.ok(topCardId, "scenario should have an opening draw card");
  state.players[PLAYER].hand.push(topCardId);
  return state;
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
  const challengeLine = scenarioSetups.protagonistTrioOmegaChallenge.recommendedLine.join("\n");
  assert.match(challengeLine, /先保住防御窗口/);
  assert.doesNotMatch(challengeLine, /连续攻击月曜和星曜/);

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

  const challenge = buildScenarioState(scenarioSetups.protagonistTrioOmegaChallenge, {
    playerPreset: "protagonistTrioOmega",
    aiPreset: "trioOmegaRival"
  });
  assert.deepEqual(challenge.player.hand.map((card) => card.id), [
    "trio-solar-snare",
    "trio-ember-recall",
    "trio-final-counter"
  ]);
  assert.equal(challenge.player.deck[0].id, "trio-chain-veil");
  assert.equal(challenge.player.deck[1].id, "trio-moonbreaker-ray");
  assert.deepEqual(challenge.player.grave.map((card) => card.id), ["flare-titan", "trio-ember-pawn"]);
});

test("trio ace pressure resolves and clearing moon pressure releases the continuous modifier", () => {
  const uiState = scenarioUiState("protagonistTrioOmega");
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

test("trio happy-clicker exposed route cannot win on the first turn", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  let state = engine.getState();

  assert.equal(state.players[PLAYER].hand.some((cardId) => state.cards[cardId].templateId === "trio-moonbreaker-ray"), false);

  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(state, PLAYER, "grave", "trio-ember-pawn");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  state = engine.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId }),
    /requires no trio-moon-dominion/
  );
  assert.equal(engine.getState().gameOver, null);
});

test("wrong trio revive target spends the only recall and cannot become the finale line", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  let state = engine.getState();
  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const flareGraveId = findCardId(state, PLAYER, "grave", "flare-titan");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: flareGraveId });

  state = engine.getState();
  assert.ok(state.players[PLAYER].monsterZone.includes(flareGraveId));
  assert.equal(state.players[PLAYER].hand.some((cardId) => state.cards[cardId].templateId === "trio-ember-recall"), false);
  assert.equal(state.players[PLAYER].grave.some((cardId) => state.cards[cardId].templateId === "trio-ember-pawn"), true);

  const withRay = clone(state);
  const rayId = findCardId(withRay, PLAYER, "deck", "trio-moonbreaker-ray");
  withRay.players[PLAYER].deck = withRay.players[PLAYER].deck.filter((cardId) => cardId !== rayId);
  withRay.players[PLAYER].hand.push(rayId);
  const rayEngine = new GameEngine(withRay);
  rayEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: rayId, targetCardId: findCardId(withRay, AI, "spellTrapZone", "trio-moon-dominion") });

  state = rayEngine.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  assert.throws(
    () => rayEngine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId }),
    /requires field materials trio-ember-pawn/
  );
});

test("trio final counter cannot convert into victory while moon pressure remains", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  let state = engine.getState();
  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(state, PLAYER, "grave", "trio-ember-pawn");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  state = engine.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId }),
    /requires no trio-moon-dominion/
  );
  assert.equal(engine.getState().gameOver, null);
});

test("wrong trio attack into the high-attack ace carries a real penalty", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(scenarioUiState("protagonistTrioOmegaChallenge")));
  let state = engine.getState();
  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(state, PLAYER, "grave", "trio-ember-pawn");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  const battleEngine = engineWithTurn(engine.getState(), PLAYER, Phase.battle);
  state = battleEngine.getState();
  const pawnId = findCardId(state, PLAYER, "monsterZone", "trio-ember-pawn");
  const sunId = findCardId(state, AI, "monsterZone", "trio-sun-judicator");
  const events = resolveAttack(battleEngine, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: sunId });
  const next = battleEngine.getState();

  assert.equal(next.players[PLAYER].lp, 0);
  assert.equal(next.gameOver.winnerId, AI);
  assert.ok(next.players[PLAYER].grave.includes(pawnId));
  assert.ok(events.some((event) =>
    event.type === "BATTLE_RESOLVED" &&
    event.outcome.kind === "countered" &&
    event.outcome.damagePlayerId === PLAYER
  ));
});

test("correct trio line crosses the rival turn, clears pressure, revives the low attacker, and wins without raw high attack", () => {
  const engine = new GameEngine(engineStateWithOpeningDraw("protagonistTrioOmegaChallenge"));
  let state = engine.getState();
  const snareId = findCardId(state, PLAYER, "hand", "trio-solar-snare");
  engine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: snareId, index: 0 });

  engine.dispatch({ type: "END_TURN", playerId: PLAYER });
  engine.dispatch({ type: "START_TURN", playerId: AI });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: AI });
  engine.dispatch({ type: "CHANGE_PHASE", playerId: AI, phase: Phase.battle });
  state = engine.getState();
  const sunId = findCardId(state, AI, "monsterZone", "trio-sun-judicator");
  const decoyId = findCardId(state, PLAYER, "monsterZone", "trio-decoy-ward");
  const setSnareId = findCardId(state, PLAYER, "spellTrapZone", "trio-solar-snare");
  const declarationEvents = engine.dispatch({
    type: "DECLARE_ATTACK",
    playerId: AI,
    rivalId: PLAYER,
    attackerCardId: sunId,
    targetCardId: decoyId
  });
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  engine.dispatch({
    type: "ADD_CHAIN_LINK",
    playerId: PLAYER,
    cardId: setSnareId,
    effectId: "attackDestroy",
    targetEffectId: declaration.id,
    attackerCardId: sunId
  });
  engine.dispatch({
    type: "ACTIVATE_TRAP",
    playerId: PLAYER,
    rivalId: AI,
    cardId: setSnareId,
    targetEffectId: declaration.id,
    attackerCardId: sunId
  });
  const trapEvents = engine.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  state = engine.getState();

  assert.ok(state.players[AI].grave.includes(sunId));
  assert.ok(state.players[PLAYER].grave.includes(setSnareId));
  assert.ok(state.players[PLAYER].monsterZone.includes(decoyId));
  assert.ok(trapEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === sunId));

  engine.dispatch({ type: "END_TURN", playerId: AI });
  engine.dispatch({ type: "START_TURN", playerId: PLAYER });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER });
  state = engine.getState();
  assert.ok(state.events.some((event) => event.type === "TURN_STARTED" && event.playerId === AI));
  const rayId = findCardId(state, PLAYER, "hand", "trio-moonbreaker-ray");
  const moonDominionId = findCardId(state, AI, "spellTrapZone", "trio-moon-dominion");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: rayId, targetCardId: moonDominionId });

  state = engine.getState();
  const recallId = findCardId(state, PLAYER, "hand", "trio-ember-recall");
  const pawnGraveId = findCardId(state, PLAYER, "grave", "trio-ember-pawn");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: recallId, targetCardId: pawnGraveId });

  state = engine.getState();
  const finalCounterId = findCardId(state, PLAYER, "hand", "trio-final-counter");
  const finalEvents = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: finalCounterId });
  state = engine.getState();
  const pawnId = findCardId(state, PLAYER, "monsterZone", "trio-ember-pawn");

  assert.equal(state.cards[pawnId].atk, 600);
  assert.equal(state.cards[pawnId].tempAtk, 2100);
  assert.ok(finalEvents.some((event) => event.type === "ABILITY_GRANTED" && event.ability === "attackReset"));
  assert.ok(engine.getState().events.some((event) => event.type === "TURN_STARTED" && event.playerId === AI));

  engine.dispatch({ type: "CHANGE_PHASE", playerId: PLAYER, phase: Phase.battle });
  state = engine.getState();
  const moonId = findCardId(state, AI, "monsterZone", "trio-moon-warden");
  const starId = findCardId(state, AI, "monsterZone", "trio-star-herald");
  const firstBattle = resolveAttack(engine, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: moonId });
  assert.ok(firstBattle.some((event) => event.type === "MONSTER_READIED" && event.cardId === pawnId));
  const secondBattle = resolveAttack(engine, { playerId: PLAYER, rivalId: AI, attackerCardId: pawnId, targetCardId: starId });
  state = engine.getState();

  assert.equal(state.players[AI].lp, 0);
  assert.equal(state.gameOver.winnerId, PLAYER);
  assert.ok(state.players[AI].grave.includes(moonId));
  assert.ok(state.players[AI].grave.includes(starId));
  assert.ok(secondBattle.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === PLAYER));
  assert.equal(state.cards[pawnId].atk, 600, "the finisher remains the low-attack key monster");
  assertValidGameState(state);
});
