import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets, library, scenarioSetups } from "../src/data.js";
import { createDuelist } from "../src/deck.js";
import { buildEngineStateFromUiState, canDispatchSpellFromUiState, canDispatchTrapFromUiState } from "../src/engine-adapter.js";
import { EffectDuration, GameEngine, Phase, ResponseWindow, Timing, assertValidGameState, getCardEffectDefinition } from "../src/game-engine.js";
import { buildScenarioState } from "../src/scenario-state.js";

const PLAYER = "player";
const AI = "ai";

function basePlayer(id, overrides = {}) {
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

function makeState({ cards = [], player = {}, ai = {}, turn = {}, machine = {} } = {}) {
  const phase = turn.phase || Phase.main;
  return {
    cards: Object.fromEntries(cards.map((entry) => [entry.id, entry])),
    players: {
      [PLAYER]: basePlayer(PLAYER, player),
      [AI]: basePlayer(AI, ai)
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

function uiStateFromScenario(scenarioKey) {
  const setup = buildScenarioState(scenarioSetups[scenarioKey], {
    playerPreset: "protagonistAceEvolution",
    aiPreset: "aceSuppressionRival"
  });
  return {
    player: { ...createDuelist("player"), ...setup.player },
    ai: { ...createDuelist("ai"), ...setup.ai },
    turn: "player",
    phase: "main",
    gameEvents: []
  };
}

test("ace evolution succeeds by sending materials to grave and special summoning the ace", () => {
  const state = makeState({
    cards: [
      card("evo-1", { templateId: "soulforge-ascent", effect: "aceEvolution" }),
      card("mat-fire", { templateId: "ember-soul-initiate", type: "monster", atk: 700, def: 1000 }),
      card("mat-light", { templateId: "lumen-gearlet", type: "monster", atk: 900, def: 900 }),
      card("ace-deck", { templateId: "astral-forge-dragon", type: "monster", atk: 2500, def: 2100 }),
      card("enemy-breaker", { ownerId: AI, templateId: "void-siege-breaker", type: "monster", atk: 2600, def: 1200 })
    ],
    player: {
      hand: ["evo-1"],
      deck: ["ace-deck"],
      monsterZone: ["mat-fire", "mat-light"]
    },
    ai: {
      monsterZone: ["enemy-breaker"]
    }
  });

  const engine = new GameEngine(state);
  const events = engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "evo-1" });
  const next = engine.getState();

  assert.deepEqual(next.players[PLAYER].hand, []);
  assert.deepEqual(next.players[PLAYER].deck, []);
  assert.deepEqual(next.players[PLAYER].monsterZone, ["ace-deck"]);
  assert.deepEqual(new Set(next.players[PLAYER].grave), new Set(["evo-1", "mat-fire", "mat-light"]));
  assert.equal(next.cards["ace-deck"].mode, "attack");
  assert.equal(next.cards["enemy-breaker"].tempAtk, -500);
  assert.equal(next.cards["enemy-breaker"].tempDef, -500);
  assert.equal(next.players[PLAYER].shield, 300);
  assert.ok(events.some((event) =>
    event.type === "MATERIALS_SENT" &&
    event.materialCardIds.includes("mat-fire") &&
    event.materialCardIds.includes("mat-light")
  ));
  assert.ok(events.some((event) =>
    event.type === "MONSTER_SUMMONED" &&
    event.cardId === "ace-deck" &&
    event.summonType === "special" &&
    event.sourceCardId === "evo-1"
  ));
  assertValidGameState(next);
});

test("ace evolution fails without required materials and does not mutate state", () => {
  const state = makeState({
    cards: [
      card("evo-1", { templateId: "soulforge-ascent", effect: "aceEvolution" }),
      card("mat-fire", { templateId: "ember-soul-initiate", type: "monster" }),
      card("ace-deck", { templateId: "astral-forge-dragon", type: "monster" })
    ],
    player: {
      hand: ["evo-1"],
      deck: ["ace-deck"],
      monsterZone: ["mat-fire"]
    }
  });
  const engine = new GameEngine(state);
  const before = engine.getState();

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "evo-1" }),
    /requires field materials/
  );
  assert.deepEqual(engine.getState(), before);
});

test("ace evolution fails without an available ace and rolls back material moves", () => {
  const state = makeState({
    cards: [
      card("evo-1", { templateId: "soulforge-ascent", effect: "aceEvolution" }),
      card("mat-fire", { templateId: "ember-soul-initiate", type: "monster" }),
      card("mat-light", { templateId: "lumen-gearlet", type: "monster" })
    ],
    player: {
      hand: ["evo-1"],
      monsterZone: ["mat-fire", "mat-light"]
    }
  });
  const engine = new GameEngine(state);
  const before = engine.getState();

  assert.throws(
    () => engine.dispatch({ type: "ACTIVATE_CARD", playerId: PLAYER, rivalId: AI, cardId: "evo-1" }),
    /No astral-forge-dragon is available/
  );
  assert.deepEqual(engine.getState(), before);
});

test("ace crackdown only accepts the legal strongest enemy monster target", () => {
  const state = makeState({
    cards: [
      card("crack-1", { ownerId: AI, templateId: "corebreak-edict", effect: "aceCrackdown" }),
      card("ace-1", { templateId: "astral-forge-dragon", type: "monster", atk: 2500, def: 2100 }),
      card("small-1", { templateId: "ember-soul-initiate", type: "monster", atk: 700, def: 1000 })
    ],
    player: {
      monsterZone: ["ace-1", "small-1"]
    },
    ai: {
      hand: ["crack-1"]
    },
    turn: {
      playerId: AI
    }
  });
  const illegal = new GameEngine(state);
  const before = illegal.getState();

  assert.throws(
    () => illegal.dispatch({ type: "ACTIVATE_CARD", playerId: AI, rivalId: PLAYER, cardId: "crack-1", targetCardId: "small-1" }),
    /not the strongest monster/
  );
  assert.deepEqual(illegal.getState(), before);

  const legal = new GameEngine(state);
  const events = legal.dispatch({ type: "ACTIVATE_CARD", playerId: AI, rivalId: PLAYER, cardId: "crack-1", targetCardId: "ace-1" });
  const next = legal.getState();
  assert.equal(next.cards["ace-1"].tempAtk, -500);
  assert.equal(next.cards["ace-1"].tempDef, -500);
  assert.deepEqual(next.players[AI].grave, ["crack-1"]);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === "ace-1").length, 2);
});

test("ace guard can only resolve in an attack response window", () => {
  const sharedCards = [
    card("guard-1", { templateId: "ace-vow-guard", type: "trap", trigger: "aceGuard" }),
    card("ace-1", { templateId: "astral-forge-dragon", type: "monster", atk: 2500, def: 2100 }),
    card("attacker-1", { ownerId: AI, templateId: "void-siege-breaker", type: "monster", atk: 2600, def: 1200 })
  ];
  const state = makeState({
    cards: sharedCards,
    player: {
      spellTrapZone: ["guard-1"],
      monsterZone: ["ace-1"]
    },
    ai: {
      monsterZone: ["attacker-1"]
    },
    turn: {
      playerId: AI,
      phase: Phase.battle
    }
  });
  const illegal = new GameEngine(state);
  assert.throws(
    () => illegal.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "guard-1", targetEffectId: "attack-1" }),
    /requires a response window/
  );

  const legalState = makeState({
    cards: sharedCards,
    player: {
      spellTrapZone: ["guard-1"],
      monsterZone: ["ace-1"]
    },
    ai: {
      monsterZone: ["attacker-1"]
    },
    turn: {
      playerId: AI,
      phase: Phase.battle
    },
    machine: {
      phase: Phase.battle,
      timing: Timing.attackDeclaration,
      responseWindow: {
        playerId: PLAYER,
        type: ResponseWindow.optional,
        timing: Timing.attackDeclaration,
        resumeTiming: Timing.battleOpen,
        triggerEventId: "attack-1",
        prompt: "attack",
        context: { attackerCardId: "attacker-1", targetCardId: "ace-1" }
      }
    }
  });
  const legal = new GameEngine(legalState);
  legal.dispatch({ type: "ADD_CHAIN_LINK", playerId: PLAYER, cardId: "guard-1", effectId: "aceGuard", targetEffectId: "attack-1" });
  legal.dispatch({ type: "ACTIVATE_TRAP", playerId: PLAYER, rivalId: AI, cardId: "guard-1", targetEffectId: "attack-1" });
  const events = legal.dispatch({ type: "RESOLVE_CHAIN", playerId: PLAYER });
  const next = legal.getState();

  assert.equal(next.cards["ace-1"].tempAtk, 900);
  assert.deepEqual(next.players[PLAYER].grave, ["guard-1"]);
  assert.ok(events.some((event) => event.type === "EFFECT_NEGATED" && event.targetEffectId === "attack-1"));
  assert.ok(events.some((event) => event.type === "STAT_MODIFIED" && event.cardId === "ace-1" && event.amount === 900));
  assertValidGameState(next);
});

test("ace evolution pack cards and scenarios are engine-backed", () => {
  const cardsById = new Map(library.map((entry) => [entry.id, entry]));
  [
    "ember-soul-initiate",
    "lumen-gearlet",
    "starwell-runner",
    "astral-forge-dragon",
    "void-siege-breaker",
    "soulforge-ascent",
    "material-reclaim",
    "corebreak-edict",
    "ace-vow-guard"
  ].forEach((id) => assert.ok(cardsById.has(id), `missing ace evolution card ${id}`));

  assert.equal(canDispatchSpellFromUiState(cardsById.get("soulforge-ascent")), true);
  assert.equal(canDispatchSpellFromUiState(cardsById.get("material-reclaim")), true);
  assert.equal(canDispatchSpellFromUiState(cardsById.get("corebreak-edict")), true);
  assert.equal(canDispatchTrapFromUiState(cardsById.get("ace-vow-guard")), true);
  assert.equal(getCardEffectDefinition("aceEvolution").duration, EffectDuration.oneShot);
  assert.deepEqual(getCardEffectDefinition("aceEvolution").requirements, [
    { type: "requireFieldCards", player: "self", materials: ["ember-soul-initiate", "lumen-gearlet"] }
  ]);
  assert.deepEqual(getCardEffectDefinition("aceCrackdown").target, { player: "rival", zone: "monsterZone", rule: "strongestAtk" });
  assert.deepEqual(getCardEffectDefinition("aceGuard").requirements, [
    { type: "responseWindow", prompt: "attack" }
  ]);
  assert.ok(deckPresets.protagonistAceEvolution.ids.includes("soulforge-ascent"));
  assert.ok(deckPresets.protagonistAceEvolution.ids.includes("ace-vow-guard"));
  assert.ok(deckPresets.aceSuppressionRival.ids.includes("corebreak-edict"));

  for (const scenarioKey of ["protagonistAceEvolution", "protagonistAceProtection"]) {
    const engineState = buildEngineStateFromUiState(uiStateFromScenario(scenarioKey));
    assertValidGameState(engineState);
  }
});
