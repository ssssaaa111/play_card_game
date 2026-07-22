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

function scenarioUiState(key, {
  playerPreset = "protagonistTrioOmega",
  aiPreset = "trioOmegaRival"
} = {}) {
  const setup = buildScenarioState(scenarioSetups[key], {
    playerPreset,
    aiPreset
  });
  return {
    player: { ...createDuelist(PLAYER), ...setup.player },
    ai: { ...createDuelist(AI), ...setup.ai },
    turn: PLAYER,
    phase: Phase.main,
    gameEvents: setup.gameEvents || []
  };
}

function drawOpeningHands(uiState, count = 5) {
  for (const duelist of [uiState.player, uiState.ai]) {
    const drawn = duelist.deck.splice(0, count);
    duelist.hand.push(...drawn);
  }
  return uiState;
}

function fullScenarioUiState({ opening = false } = {}) {
  const uiState = scenarioUiState("protagonistTrioOmegaFull", {
    playerPreset: "protagonistTrioOmegaFull",
    aiPreset: "trioOmegaRivalFull"
  });
  return opening ? drawOpeningHands(uiState) : uiState;
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
  assert.ok([
    "trio-sun-judicator",
    "trio-moon-warden",
    "trio-star-herald"
  ].every((id) => cardByTemplate(id).trioConvergence === "trioOmega"));
  assert.equal(cardByTemplate("trio-moon-dominion").effect, "lunarDominion");
  assert.equal(cardByTemplate("trio-solar-snare").trigger, "attackDestroy");
  assert.equal(cardByTemplate("trio-moonbreaker-ray").effect, "destroySpellTrap");
  assert.equal(cardByTemplate("trio-ember-recall").effect, "graveRevive");
  assert.equal(cardByTemplate("trio-chain-veil").trigger, "attackNegate");
  assert.equal(cardByTemplate("trio-final-counter").effect, "trioFinalCounter");

  assert.equal(getCardEffectDefinition("lunarDominion").duration, EffectDuration.continuous);
  assert.deepEqual(getCardEffectDefinition("lunarDominion").requirements, [
    { type: "noSpellTrapTemplate", player: "self", templateId: "trio-moon-dominion" }
  ]);
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
    assert.ok(setup.gameEvents.some((event) =>
      event.type === "CONTINUOUS_EFFECT_REGISTERED" &&
      event.effectId === "lunarDominion" &&
      event.destroySourceWhenTargetLeaves === false
    ));
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

test("trio omega full duel starts from full decks and does not reveal the puzzle answer", () => {
  assert.equal(deckPresets.protagonistTrioOmegaFull.ids.length, 40);
  assert.equal(deckPresets.trioOmegaRivalFull.ids.length, 40);
  assert.equal(scenarioSetups.protagonistTrioOmegaFull.difficulty, "challenge");
  assert.equal(scenarioSetups.protagonistTrioOmegaFull.aiStyle, "scriptedPressure");
  assert.equal(scenarioSetups.protagonistTrioOmegaFull.openingDrawCount, 5);

  const setup = buildScenarioState(scenarioSetups.protagonistTrioOmegaFull, {
    playerPreset: "protagonistTrioOmegaFull",
    aiPreset: "trioOmegaRivalFull"
  });
  assert.equal(setup.player.lp, 4000);
  assert.equal(setup.ai.lp, 4000);
  assert.equal(setup.player.hand.length, 0);
  assert.equal(setup.ai.hand.length, 0);
  assert.equal(setup.player.deck.length, 40);
  assert.equal(setup.ai.deck.length, 40);
  assertValidGameState(buildEngineStateFromUiState(fullScenarioUiState()));

  const opened = fullScenarioUiState({ opening: true });
  const playerOpening = opened.player.hand.map((card) => card.id);
  const aiOpening = opened.ai.hand.map((card) => card.id);

  assert.deepEqual(playerOpening, [
    "spark-runner",
    "trio-solar-snare",
    "seer-call",
    "star-shield",
    "trio-ember-recall"
  ]);
  assert.equal(playerOpening.includes("trio-moonbreaker-ray"), false);
  assert.equal(playerOpening.includes("trio-final-counter"), false);
  assert.equal(playerOpening.includes("trio-ember-pawn"), false);
  assert.equal(opened.player.deck.length, 35);
  assert.equal(opened.ai.deck.length, 35);
  assert.ok(aiOpening.includes("trio-moon-dominion"));
  assert.ok(aiOpening.includes("trio-sun-judicator"));
  assert.ok(aiOpening.includes("trio-moon-warden"));
  assert.ok(aiOpening.includes("trio-star-herald"));
  assertValidGameState(buildEngineStateFromUiState(opened));
});

test("trio omega full duel does not deck-out in the first two AI draw steps", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(fullScenarioUiState({ opening: true })));
  engine.dispatch({ type: "END_TURN", playerId: PLAYER });
  engine.dispatch({ type: "START_TURN", playerId: AI });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: AI });
  engine.dispatch({ type: "END_TURN", playerId: AI });
  engine.dispatch({ type: "START_TURN", playerId: PLAYER });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: PLAYER });
  engine.dispatch({ type: "END_TURN", playerId: PLAYER });
  engine.dispatch({ type: "START_TURN", playerId: AI });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: AI });

  const state = engine.getState();
  assert.equal(state.players[AI].lp, 4000);
  assert.equal(state.players[AI].deck.length, 33);
  assert.equal(state.events.some((event) => event.type === "DRAW_FAILED" && event.playerId === AI), false);
  assertValidGameState(state);
});

test("first legal trio tribute summon establishes all three gods through summon events", () => {
  const engine = engineWithTurn(buildEngineStateFromUiState(fullScenarioUiState({ opening: true })), AI, Phase.main);
  const before = engine.getState();
  const sunId = findCardId(before, AI, "hand", "trio-sun-judicator");
  const tributeCardIds = before.players[AI].monsterZone.filter(Boolean);

  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId: AI,
    rivalId: PLAYER,
    cardId: sunId,
    tributeCardIds,
    index: 0
  });
  const state = engine.getState();
  const fieldTemplates = state.players[AI].monsterZone
    .filter(Boolean)
    .map((cardId) => state.cards[cardId].templateId);
  const trioPressureCards = state.players[AI].monsterZone
    .filter(Boolean)
    .map((cardId) => state.cards[cardId])
    .filter((card) => card.trioConvergence === "trioOmega");
  const summonEvents = events.filter((event) => event.type === "MONSTER_SUMMONED");

  assert.deepEqual(new Set(fieldTemplates), new Set([
    "trio-sun-judicator",
    "trio-moon-warden",
    "trio-star-herald"
  ]));
  assert.equal(state.players[AI].hand.some((cardId) => state.cards[cardId].templateId === "trio-moon-warden"), false);
  assert.equal(state.players[AI].hand.some((cardId) => state.cards[cardId].templateId === "trio-star-herald"), false);
  assert.equal(summonEvents.length, 3);
  assert.equal(summonEvents.filter((event) => event.summonType === "trioConvergence").length, 2);
  assert.ok(summonEvents.filter((event) => event.summonType === "trioConvergence").every((event) => event.sourceCardId === sunId));
  assert.ok(summonEvents.filter((event) => event.summonType === "trioConvergence").every((event) => event.used === true));
  assert.ok(summonEvents.filter((event) => event.summonType === "trioConvergence").every((event) => event.attackLockReason === "trioConvergence"));
  assert.equal(trioPressureCards.length, 3);
  assert.equal(trioPressureCards.filter((card) => card.used).length, 2);
  assert.equal(trioPressureCards.filter((card) => card.attackLockReason === "trioConvergence").length, 2);
  assert.equal(trioPressureCards.reduce((total, card) => total + card.atk, 0), 7500);
  assert.equal(events.filter((event) => event.type === "CARD_TRIBUTED").length, 3);
  const convergedCardId = summonEvents.find((event) => event.summonType === "trioConvergence").cardId;
  engine.dispatch({ type: "CHANGE_PHASE", playerId: AI, phase: Phase.battle });
  assert.throws(
    () => engine.dispatch({
      type: "DECLARE_ATTACK",
      playerId: AI,
      rivalId: PLAYER,
      attackerCardId: convergedCardId
    }),
    /cannot attack this turn.*trioConvergence/
  );
  const blockedResetEvents = engine.dispatch({
    type: "GRANT_ABILITY",
    playerId: AI,
    ability: "attackReset",
    uses: 1,
    sourceCardId: "test-reset-source",
    targetCardId: convergedCardId
  });
  assert.ok(blockedResetEvents.some((event) =>
    event.type === "ABILITY_GRANT_BLOCKED"
    && event.reason === "trioConvergence"
    && event.targetCardId === convergedCardId
  ));
  assert.equal(engine.getState().abilities[AI].some((entry) => entry.targetCardId === convergedCardId), false);
  assertValidGameState(state);
});

test("trio omega full duel has multiple setup routes and no opening high-attack solution", () => {
  const opened = fullScenarioUiState({ opening: true });
  const playerOpening = opened.player.hand.map((card) => card.id);
  const nextSeven = opened.player.deck.slice(0, 7).map((card) => card.id);
  const openingMonsters = opened.player.hand.filter((card) => card.type === "monster");
  const highestOpeningAtk = Math.max(...openingMonsters.map((card) => card.atk));

  assert.ok(playerOpening.includes("trio-solar-snare"), "defensive trap route is available");
  assert.ok(playerOpening.includes("star-shield"), "shield route is available");
  assert.ok(playerOpening.includes("seer-call"), "draw/filter route is available");
  assert.ok(nextSeven.includes("trio-moonbreaker-ray"), "clear-pressure route is drawn into, not opened with");
  assert.ok(nextSeven.includes("trio-ember-pawn"), "low-star resource route is drawn into, not opened with");
  assert.ok(nextSeven.includes("battle-trance") || nextSeven.includes("trio-chain-veil"));
  assert.ok(highestOpeningAtk < cardByTemplate("trio-sun-judicator").atk);
  assert.equal(opened.player.lp, 4000);
  assert.deepEqual(getCardEffectDefinition("trioFinalCounter").requirements.slice(0, 2), [
    { type: "maxLp", player: "self", amount: 1600 },
    { type: "requireFieldCards", player: "self", materials: ["trio-ember-pawn"] }
  ]);
});

test("trio omega full duel first turn can build resources but cannot convert into a high-attack win", () => {
  const engine = new GameEngine(buildEngineStateFromUiState(fullScenarioUiState({ opening: true })));
  let state = engine.getState();
  const sparkId = findCardId(state, PLAYER, "hand", "spark-runner");
  engine.dispatch({ type: "SUMMON_MONSTER", playerId: PLAYER, rivalId: AI, cardId: sparkId, index: 0 });

  state = engine.getState();
  assert.ok(state.players[PLAYER].hand.some((cardId) => state.cards[cardId].templateId === "trio-moonbreaker-ray"));
  const shieldId = findCardId(state, PLAYER, "hand", "star-shield");
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: shieldId });
  const snareId = findCardId(engine.getState(), PLAYER, "hand", "trio-solar-snare");
  engine.dispatch({ type: "SET_TRAP", playerId: PLAYER, cardId: snareId, index: 0 });

  state = engine.getState();
  const playerAttackers = state.players[PLAYER].monsterZone
    .map((cardId) => state.cards[cardId])
    .filter(Boolean);
  assert.equal(state.gameOver, null);
  assert.equal(state.players[AI].lp, 4000);
  assert.ok(Math.max(...playerAttackers.map((card) => card.atk + card.tempAtk)) < cardByTemplate("trio-sun-judicator").atk);
  assert.equal(state.players[PLAYER].hand.some((cardId) => state.cards[cardId].templateId === "trio-final-counter"), false);
  assertValidGameState(state);
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
  assert.equal(
    finalEvents.find((event) => event.type === "ABILITY_GRANTED" && event.ability === "attackReset")?.targetCardId,
    pawnId
  );
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
