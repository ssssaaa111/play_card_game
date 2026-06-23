import test from "node:test";
import assert from "node:assert/strict";

import { createDuelist } from "../src/deck.js";
import {
  buildEngineStateFromUiState,
  canDispatchTrapFromUiState,
  canDispatchSpellFromUiState,
  canDispatchSummonEffectFromUiState,
  explainActivateSpellFromUiState,
  explainDeclareAttackFromUiState,
  explainSetTrapFromUiState,
  explainSummonMonsterFromUiState,
  getLegalActionsFromUiState,
  applyUiGameEvents,
  dispatchActivateTrapFromUiState,
  dispatchActivateSpellFromUiState,
  dispatchCancelAutoEndFromUiState,
  dispatchCloseResponseWindowFromUiState,
  dispatchChangePhaseFromUiState,
  dispatchChangeMonsterModeFromUiState,
  dispatchCancelAttackFromUiState,
  dispatchCommitAutoEndFromUiState,
  dispatchDeclareAttackFromUiState,
  dispatchDrawCardsFromUiState,
  dispatchEndTurnFromUiState,
  dispatchMarkMonsterUsedFromUiState,
  dispatchOpenResponseWindowFromUiState,
  dispatchOpenActionWindowFromUiState,
  dispatchPassResponsePriorityFromUiState,
  dispatchQueueTrapResponseFromUiState,
  dispatchRequestAutoEndFromUiState,
  dispatchResolveBattleFromUiState,
  dispatchResolveChainFromUiState,
  dispatchResolveElementCombosFromUiState,
  dispatchResolveTurnDrawFromUiState,
  dispatchSkipRemainingAttacksFromUiState,
  dispatchStartTurnFromUiState,
  dispatchTrapResponseFromUiState,
  dispatchSetTrapFromUiState,
  dispatchSummonMonsterFromUiState
} from "../src/engine-adapter.js";
import { PHASES } from "../src/turn-state.js";
import { MAX_LP } from "../src/rules.js";

function uiTrap(uid, id = "mirror-snare") {
  return {
    uid,
    id,
    templateId: id,
    ownerId: "player",
    type: "trap",
    name: id,
    trigger: "attackDestroy"
  };
}

function uiSpell(uid, effect = "burn500", id = "burst-rune") {
  return {
    uid,
    id,
    ownerId: "player",
    type: "spell",
    name: id,
    effect
  };
}

function uiMonster(uid, id = "star-lancer") {
  return {
    uid,
    id,
    templateId: id,
    ownerId: "player",
    type: "monster",
    name: id,
    atk: 1500,
    def: 1000
  };
}

function appState(overrides = {}) {
  return {
    player: createDuelist("player"),
    ai: createDuelist("ai"),
    turn: "player",
    phase: PHASES.main,
    gameEvents: [],
    ...overrides
  };
}

function snapshotUiState(state) {
  return JSON.parse(JSON.stringify(state));
}

test("dispatches SET_TRAP and applies CARD_MOVED to a fixed UI trap slot", () => {
  const mirror = uiTrap("mirror-1");
  const existing = uiTrap("existing-1", "guard-sigil");
  const state = appState({
    phase: PHASES.battle
  });
  state.player.hand = [mirror];
  state.player.traps[0] = existing;

  const events = dispatchSetTrapFromUiState(state, "player", 0, 2);

  assert.deepEqual(state.player.hand, []);
  assert.equal(state.player.traps[0], existing);
  assert.equal(state.player.traps[2], mirror);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === mirror.uid &&
    event.to.zone === "spellTrapZone" &&
    event.to.index === 2
  ));
  assert.ok(events.some((event) => event.type === "TRAP_SET" && event.cardId === mirror.uid));
  assert.equal(state.gameEvents.length, events.length);
});

test("replays combo and character passive events into UI state", () => {
  const state = appState();
  const fire = uiMonster("fire-combo", "ember-drake");
  const wind = uiMonster("wind-combo", "gale-mage");
  const draw = uiMonster("combo-draw", "solar-knight");
  fire.element = "fire";
  wind.element = "wind";
  state.player.field[0] = fire;
  state.player.field[1] = wind;
  state.player.deck = [draw];
  state.player.comboPassive = {
    id: "starLink",
    name: "星脉连携",
    operations: [{ op: "drawCards", player: "self", count: 1 }]
  };

  const events = dispatchResolveElementCombosFromUiState(state, "player", "ai", "summon");

  assert.equal(state.player.comboFlags.fireWind, true);
  assert.equal(state.player.comboThisTurn, true);
  assert.equal(state.ai.lp, MAX_LP - 300);
  assert.equal(fire.tempAtk, 100);
  assert.equal(wind.tempAtk, 100);
  assert.deepEqual(state.player.hand, [draw]);
  assert.ok(events.some((event) => event.type === "COMBO_TRIGGERED"));
  assert.ok(events.some((event) => event.type === "CHARACTER_PASSIVE_TRIGGERED"));
});

test("replays engine-owned action windows into UI state", () => {
  const state = appState();

  const events = dispatchOpenActionWindowFromUiState(state, "player", "targetSelect", {
    reason: "target:spell-1",
    now: 2000,
    timeoutSeconds: 20
  });

  assert.equal(state.actionWindow, "targetSelect");
  assert.equal(state.actionWindowId, "targetSelect:2000");
  assert.equal(state.actionWindowReason, "target:spell-1");
  assert.equal(state.actionDeadline, 22000);
  assert.ok(events.some((event) => event.type === "ACTION_WINDOW_OPENED"));
});

test("does not mutate UI state when SET_TRAP is rejected by the engine", () => {
  const spell = uiSpell("spell-1");
  const state = appState();
  state.player.hand = [spell];

  assert.throws(
    () => dispatchSetTrapFromUiState(state, "player", 0, 0),
    /not a trap/
  );
  assert.deepEqual(state.player.hand, [spell]);
  assert.equal(state.player.traps.filter(Boolean).length, 0);
  assert.deepEqual(state.gameEvents, []);
});

test("preserves UI phase so SET_TRAP is rejected outside legal action phases", () => {
  const mirror = uiTrap("mirror-draw");
  const state = appState({ phase: PHASES.draw });
  state.player.hand = [mirror];

  assert.throws(
    () => dispatchSetTrapFromUiState(state, "player", 0, 0),
    /not legal during draw phase/
  );
  assert.deepEqual(state.player.hand, [mirror]);
  assert.equal(state.player.traps.filter(Boolean).length, 0);
  assert.deepEqual(state.gameEvents, []);
});

test("dispatches SUMMON_MONSTER and applies CARD_MOVED to a fixed UI monster slot", () => {
  const lancer = uiMonster("monster-1");
  const existing = uiMonster("existing-monster", "iron-guardian");
  const state = appState();
  state.player.hand = [lancer];
  state.player.field[1] = existing;

  const events = dispatchSummonMonsterFromUiState(state, "player", 0, 2);

  assert.deepEqual(state.player.hand, []);
  assert.equal(state.player.field[1], existing);
  assert.equal(state.player.field[2], lancer);
  assert.equal(lancer.mode, "attack");
  assert.equal(lancer.used, false);
  assert.equal(lancer.changedMode, false);
  assert.equal(state.player.normalSummonsUsed, 1);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === lancer.uid &&
    event.to.zone === "monsterZone" &&
    event.to.index === 2
  ));
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === lancer.uid));
  assert.equal(state.gameEvents.length, events.length);
});

test("dispatches turn draws and replays deck-out damage into UI state", () => {
  const first = uiMonster("ui-draw-first", "star-lancer");
  const second = uiMonster("ui-draw-second", "iron-guardian");
  const state = appState({ phase: PHASES.draw, turn: "player" });
  state.player.lp = 4000;
  state.player.shield = 200;
  state.player.deck = [first, second];

  const events = dispatchDrawCardsFromUiState(state, "player", 3, { reason: "turn" });

  assert.deepEqual(state.player.deck, []);
  assert.deepEqual(state.player.hand, [first, second]);
  assert.equal(state.player.shield, 0);
  assert.equal(state.player.lp, 3700);
  assert.ok(events.some((event) => event.type === "DRAW_FAILED" && event.missing === 1));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.blocked === 200 && event.amount === 300));
});

test("dispatches turn draw resolution and advances surviving turns to main", () => {
  const drawCard = uiMonster("ui-turn-draw", "solar-knight");
  const state = appState({ phase: PHASES.draw, turn: "player" });
  state.player.deck = [drawCard];

  const events = dispatchResolveTurnDrawFromUiState(state, "player");

  assert.deepEqual(state.player.hand, [drawCard]);
  assert.deepEqual(state.player.deck, []);
  assert.equal(state.phase, PHASES.main);
  assert.equal(state.timing, "mainOpen");
  assert.ok(events.some((event) => event.type === "TURN_DRAW_RESOLVED" && event.phaseAdvanced === true));
  assert.ok(events.some((event) => event.type === "PHASE_CHANGED" && event.to === PHASES.main));

  const fatal = appState({ phase: PHASES.draw, turn: "player" });
  fatal.player.lp = 300;
  fatal.player.deck = [];
  const fatalEvents = dispatchResolveTurnDrawFromUiState(fatal, "player");

  assert.equal(fatal.player.lp, 0);
  assert.equal(fatal.gameOver, true);
  assert.equal(fatal.gameOverWinner, "ai");
  assert.equal(fatal.actionWindow, "gameOver");
  assert.equal(fatal.timing, "gameOver");
  assert.equal(fatal.phase, PHASES.draw);
  assert.ok(fatalEvents.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === "ai"));
  assert.ok(fatalEvents.some((event) => event.type === "TURN_DRAW_RESOLVED" && event.phaseAdvanced === false));
  assert.equal(fatalEvents.some((event) => event.type === "PHASE_CHANGED"), false);
});

test("dispatches basic on-summon effects through engine events", () => {
  const ember = uiMonster("ember-summon", "ember-drake");
  ember.onSummon = "burn200";
  const gale = uiMonster("gale-summon", "gale-mage");
  gale.onSummon = "draw1";
  const oracle = uiMonster("oracle-summon", "night-oracle");
  oracle.onSummon = "heal300";
  const deckCard = uiMonster("deck-summon", "solar-knight");
  const state = appState();
  state.player.lp = 3600;
  state.player.hand = [ember, gale, oracle];
  state.player.deck = [deckCard];
  state.player.extraSummon = 2;

  assert.equal(canDispatchSummonEffectFromUiState(ember), true);
  assert.equal(canDispatchSummonEffectFromUiState(gale), true);
  assert.equal(canDispatchSummonEffectFromUiState(oracle), true);

  const burnEvents = dispatchSummonMonsterFromUiState(state, "player", 0, 0);
  const drawEvents = dispatchSummonMonsterFromUiState(state, "player", 0, 1);
  const healEvents = dispatchSummonMonsterFromUiState(state, "player", 0, 2);

  assert.equal(state.ai.lp, 3800);
  assert.deepEqual(state.player.hand, [deckCard]);
  assert.deepEqual(state.player.deck, []);
  assert.equal(state.player.lp, 3900);
  assert.ok(burnEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 200 && event.sourceCardId === ember.uid));
  assert.ok(drawEvents.some((event) => event.type === "CARDS_DRAWN" && event.count === 1 && event.sourceCardId === gale.uid));
  assert.ok(healEvents.some((event) => event.type === "LP_HEALED" && event.amount === 300 && event.sourceCardId === oracle.uid));
});

test("dispatches conditional on-summon effects through engine events", () => {
  const ember = uiMonster("ember-ally", "ember-drake");
  ember.element = "fire";
  ember.atk = 1500;
  const captain = uiMonster("captain-summon", "flame-captain");
  captain.element = "fire";
  captain.atk = 1400;
  captain.onSummon = "fireBuff";
  const saint = uiMonster("saint-summon", "prism-saint");
  saint.onSummon = "shield400";
  const oracle = uiMonster("oracle-ally", "night-oracle");
  oracle.element = "shadow";
  const alchemist = uiMonster("alchemist-summon", "dusk-alchemist");
  alchemist.element = "shadow";
  alchemist.onSummon = "shadowBurn";
  const buffState = appState();
  buffState.player.field[0] = ember;
  buffState.player.hand = [captain];
  const shieldState = appState();
  shieldState.player.hand = [saint];
  const burnState = appState();
  burnState.player.field[0] = oracle;
  burnState.player.hand = [alchemist];

  assert.equal(canDispatchSummonEffectFromUiState(captain), true);
  assert.equal(canDispatchSummonEffectFromUiState(saint), true);
  assert.equal(canDispatchSummonEffectFromUiState(alchemist), true);

  const buffEvents = dispatchSummonMonsterFromUiState(buffState, "player", 0, 1);
  const shieldEvents = dispatchSummonMonsterFromUiState(shieldState, "player", 0, 0);
  const burnEvents = dispatchSummonMonsterFromUiState(burnState, "player", 0, 1);

  assert.equal(buffState.player.field[0].tempAtk, 300);
  assert.equal(shieldState.player.shield, 400);
  assert.equal(burnState.ai.lp, 3700);
  assert.ok(buffEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === ember.uid && event.sourceCardId === captain.uid));
  assert.ok(shieldEvents.some((event) => event.type === "SHIELD_GAINED" && event.amount === 400 && event.sourceCardId === saint.uid));
  assert.ok(burnEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 300 && event.sourceCardId === alchemist.uid));
});

test("conditional on-summon effect skip still applies the summon to UI state", () => {
  const captain = uiMonster("captain-alone", "flame-captain");
  captain.element = "fire";
  captain.onSummon = "fireBuff";
  const state = appState();
  state.player.hand = [captain];

  const events = dispatchSummonMonsterFromUiState(state, "player", 0, 0);

  assert.equal(state.player.field[0], captain);
  assert.equal(captain.tempAtk, undefined);
  assert.ok(events.some((event) => event.type === "EFFECT_SKIPPED" && event.effectId === "fireBuff"));
});

test("dispatches engine-backed attack traps and applies events to UI zones", () => {
  const mirror = uiTrap("mirror-live", "mirror-snare");
  mirror.trigger = "attackDestroy";
  const attacker = uiMonster("attacker-live", "star-lancer");
  attacker.ownerId = "ai";
  const state = appState({ phase: PHASES.battle, turn: "ai" });
  state.player.traps[0] = mirror;
  state.ai.field[0] = attacker;

  assert.equal(canDispatchTrapFromUiState(mirror), true);
  const events = dispatchActivateTrapFromUiState(state, "player", "ai", 0, { attackerIndex: 0, targetEffectId: "attack-1" });

  assert.equal(state.player.traps[0], null);
  assert.deepEqual(state.player.grave, [mirror]);
  assert.equal(state.ai.field[0], null);
  assert.deepEqual(state.ai.grave, [attacker]);
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === attacker.uid && event.sourceCardId === mirror.uid));
});

test("dispatches engine-backed resource traps through UI event replay", () => {
  const guard = uiTrap("guard-live", "guard-sigil");
  guard.trigger = "directShield";
  const drawCard = uiMonster("draw-live", "solar-knight");
  const shift = uiTrap("shift-live", "storm-shift");
  shift.trigger = "attackShift";
  const rebound = uiTrap("rebound-live", "reversal-flare");
  rebound.trigger = "directRebound";
  const flare = uiTrap("flare-live", "summon-flare");
  flare.trigger = "summonBurn";

  const drawState = appState({ phase: PHASES.battle, turn: "ai" });
  drawState.player.traps[0] = guard;
  drawState.player.deck = [drawCard];
  const drawEvents = dispatchActivateTrapFromUiState(drawState, "player", "ai", 0, {});
  assert.deepEqual(drawState.player.hand, [drawCard]);
  assert.deepEqual(drawState.player.grave, [guard]);
  assert.ok(drawEvents.some((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === guard.uid));

  const shieldState = appState({ phase: PHASES.battle, turn: "ai" });
  shieldState.player.traps[0] = shift;
  shieldState.player.shield = 2200;
  const shieldEvents = dispatchActivateTrapFromUiState(shieldState, "player", "ai", 0, {});
  assert.equal(shieldState.player.shield, 2400);
  assert.deepEqual(shieldState.player.grave, [shift]);
  assert.ok(shieldEvents.some((event) => event.type === "SHIELD_GAINED" && event.amount === 200 && event.sourceCardId === shift.uid));

  const reboundState = appState({ phase: PHASES.battle, turn: "ai" });
  reboundState.player.traps[0] = rebound;
  const reboundEvents = dispatchActivateTrapFromUiState(reboundState, "player", "ai", 0, {});
  assert.equal(reboundState.ai.lp, 3500);
  assert.ok(reboundEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 500 && event.sourceCardId === rebound.uid));

  const summonState = appState({ phase: PHASES.main, turn: "ai" });
  summonState.player.traps[0] = flare;
  const summonEvents = dispatchActivateTrapFromUiState(summonState, "player", "ai", 0, {});
  assert.equal(summonState.ai.lp, 3600);
  assert.ok(summonEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 400 && event.sourceCardId === flare.uid));
});

test("dispatches engine-backed stat traps through UI event replay", () => {
  const counter = uiTrap("counter-live", "counter-array");
  counter.trigger = "counterBoost";
  const weak = uiMonster("weak-live", "ember-drake");
  weak.atk = 1200;
  const strong = uiMonster("strong-live", "star-lancer");
  strong.atk = 1800;
  const web = uiTrap("web-live", "weakening-web");
  web.trigger = "weakenAttack";
  const attacker = uiMonster("web-attacker-live", "star-lancer");
  attacker.ownerId = "ai";

  const boostState = appState({ phase: PHASES.battle, turn: "ai" });
  boostState.player.traps[0] = counter;
  boostState.player.field[0] = strong;
  boostState.player.field[1] = weak;
  const boostEvents = dispatchActivateTrapFromUiState(boostState, "player", "ai", 0, {});
  assert.equal(weak.tempAtk, 400);
  assert.equal(strong.tempAtk || 0, 0);
  assert.ok(boostEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === weak.uid && event.sourceCardId === counter.uid));

  const weakenState = appState({ phase: PHASES.battle, turn: "ai" });
  weakenState.player.traps[0] = web;
  weakenState.ai.field[0] = attacker;
  const weakenEvents = dispatchActivateTrapFromUiState(weakenState, "player", "ai", 0, { attackerIndex: 0 });
  assert.equal(attacker.tempAtk, -500);
  assert.equal(attacker.tempDef, -500);
  assert.equal(weakenEvents.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === attacker.uid).length, 2);
});

test("rejects missing trap engine effects without mutating UI state", () => {
  const trap = uiTrap("trap-missing", "guard-sigil");
  trap.trigger = "missingTrapEffect";
  const attacker = uiMonster("attacker-before", "star-lancer");
  const guard = uiMonster("guard-before", "iron-guardian");
  attacker.ownerId = "ai";
  const state = appState({ phase: PHASES.battle });
  state.player.traps[0] = trap;
  state.player.field[0] = guard;
  state.ai.field[0] = attacker;
  state.ai.lp = 3100;
  const before = snapshotUiState(state);

  assert.equal(canDispatchTrapFromUiState(trap), false);
  assert.throws(
    () => dispatchActivateTrapFromUiState(state, "player", "ai", 0, {
      attacker,
      attackerIndex: 0,
      targetIndex: 0,
      targetEffectId: "attack-before"
    }),
    /not engine-backed/
  );
  assert.deepEqual(snapshotUiState(state), before);
});

test("rejects traps that have engine DSL but no trap metadata without mutating UI state", () => {
  const trap = uiTrap("trap-wrong-kind", "guard-sigil");
  trap.trigger = "burn500";
  const attacker = uiMonster("attacker-wrong-kind", "star-lancer");
  const guard = uiMonster("guard-wrong-kind", "iron-guardian");
  attacker.ownerId = "ai";
  const state = appState({ phase: PHASES.battle });
  state.player.traps[0] = trap;
  state.player.field[0] = guard;
  state.player.lp = 2600;
  state.ai.field[0] = attacker;
  state.ai.lp = 3100;
  const before = snapshotUiState(state);

  assert.equal(canDispatchTrapFromUiState(trap), false);
  assert.throws(
    () => dispatchActivateTrapFromUiState(state, "player", "ai", 0, {
      attacker,
      attackerIndex: 0,
      targetIndex: 0,
      targetEffectId: "attack-wrong-kind"
    }),
    /not engine-backed/
  );
  assert.deepEqual(snapshotUiState(state), before);
});

test("dispatches battle resolution and applies direct damage to UI state", () => {
  const attacker = uiMonster("attacker-direct", "star-lancer");
  attacker.atk = 1500;
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = attacker;
  state.ai.shield = 500;

  const events = dispatchResolveBattleFromUiState(state, "player", "ai", 0, -1);

  assert.equal(attacker.used, true);
  assert.equal(state.ai.shield, 0);
  assert.equal(state.ai.lp, 3000);
  assert.ok(events.some((event) => event.type === "ATTACK_DECLARED" && event.direct === true));
  assert.ok(events.some((event) => event.type === "MONSTER_USED" && event.cardId === attacker.uid));
  assert.ok(events.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === "ai" && event.amount === 1000));
});

test("dispatches attack declaration as a response-window event without resolving battle", () => {
  const attacker = uiMonster("attacker-declare", "star-lancer");
  attacker.atk = 1800;
  const target = uiMonster("target-declare", "iron-guardian");
  target.ownerId = "ai";
  target.def = 2100;
  target.mode = "defense";
  const state = appState({ phase: PHASES.battle });
  state.gameEvents = [{ id: 41, type: "COMMAND_DISPATCHED", playerId: "player", commandType: "TEST_SETUP", command: {} }];
  state.player.field[0] = attacker;
  state.ai.field[1] = target;

  const events = dispatchDeclareAttackFromUiState(state, "player", "ai", 0, 1);
  const declared = events.find((event) => event.type === "ATTACK_DECLARED");
  const windowOpened = events.find((event) => event.type === "RESPONSE_WINDOW_OPENED");

  assert.equal(attacker.used, undefined);
  assert.equal(state.player.lp, 4000);
  assert.equal(state.ai.field[1], target);
  assert.equal(declared.id, 44);
  assert.equal(declared.targetCardId, target.uid);
  assert.equal(windowOpened.playerId, "ai");
  assert.equal(windowOpened.triggerEventId, declared.id);
  assert.equal(windowOpened.context.attackerCardId, attacker.uid);
  assert.equal(state.actionWindow, "response");
  assert.equal(state.actionWindowReason, "attack");
  assert.equal(buildEngineStateFromUiState(state).machine.pendingAttack.declarationEventId, declared.id);
  assert.ok(!events.some((event) => event.type === "DAMAGE_DEALT"));
  assert.equal(state.gameEvents.at(-1).type, "RESPONSE_WINDOW_OPENED");
});

test("pending attack blocks UI auto-end until response is declined and attack is canceled", () => {
  const attacker = uiMonster("attacker-pending", "star-lancer");
  const target = uiMonster("target-pending", "iron-guardian");
  target.ownerId = "ai";
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = attacker;
  state.ai.field[0] = target;

  const declarationEvents = dispatchDeclareAttackFromUiState(state, "player", "ai", 0, 0);
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  assert.equal(state.actionWindow, "response");

  dispatchCloseResponseWindowFromUiState(state, "ai", "declined");
  assert.equal(buildEngineStateFromUiState(state).machine.pendingAttack.declarationEventId, declaration.id);
  assert.throws(
    () => dispatchRequestAutoEndFromUiState(state, "player", {
      reason: "should wait",
      now: 2000,
      timeoutSeconds: 2
    }),
    /attack is pending/
  );
  assert.equal(state.autoEnding, false);
  assert.equal(state.phase, PHASES.battle);
  assert.equal(state.turn, "player");

  const cancelEvents = dispatchCancelAttackFromUiState(state, "player", {
    declarationEventId: declaration.id,
    consumeAttack: true,
    reason: "test-cancel"
  });
  assert.equal(buildEngineStateFromUiState(state).machine.pendingAttack, null);
  assert.equal(attacker.used, true);
  assert.ok(cancelEvents.some((event) => event.type === "ATTACK_CANCELED"));
});

test("rebuilds the open response window and resolves a selected trap as one event chain", () => {
  const trap = uiTrap("negate-response", "void-lock");
  trap.trigger = "attackNegate";
  const attacker = uiMonster("ai-attacker-response", "star-lancer");
  attacker.ownerId = "ai";
  const target = uiMonster("player-target-response", "iron-guardian");
  const state = appState({ phase: PHASES.battle, turn: "ai" });
  state.player.traps[1] = trap;
  state.player.field[0] = target;
  state.ai.field[0] = attacker;

  const declarationEvents = dispatchDeclareAttackFromUiState(state, "ai", "player", 0, 0);
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow.playerId, "player");
  const responseEvents = dispatchTrapResponseFromUiState(state, "player", "ai", 1, {
    attackerIndex: 0,
    targetEffectId: declaration.id
  });

  assert.equal(state.player.traps[1], null);
  assert.deepEqual(state.player.grave, [trap]);
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_LINK_ADDED" && event.cardId === trap.uid));
  assert.ok(responseEvents.some((event) => event.type === "EFFECT_NEGATED" && event.targetEffectId === declaration.id));
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_RESOLVED"));
  assert.ok(responseEvents.some((event) => event.type === "RESPONSE_WINDOW_CLOSED"));
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow, null);
  assert.deepEqual(buildEngineStateFromUiState(state).machine.chain, []);
});

test("queues opposing trap responses before resolving the shared chain in reverse order", () => {
  const playerTrap = uiTrap("player-chain-flare", "summon-flare");
  playerTrap.trigger = "summonBurn";
  const aiTrap = uiTrap("ai-chain-rebound", "reversal-flare");
  aiTrap.ownerId = "ai";
  aiTrap.trigger = "directRebound";
  const state = appState({ phase: PHASES.battle, turn: "ai" });
  state.player.lp = 4000;
  state.ai.lp = 4000;
  state.player.traps[0] = playerTrap;
  state.ai.traps[0] = aiTrap;

  dispatchOpenResponseWindowFromUiState(state, "player", {
    timing: "attackDeclaration",
    resumeTiming: "battleOpen",
    prompt: "attack",
    triggerEventId: "attack-chain-1"
  });
  const playerEvents = dispatchQueueTrapResponseFromUiState(state, "player", "ai", 0, {
    targetEffectId: "attack-chain-1"
  });

  assert.equal(state.ai.lp, 4000);
  assert.ok(playerEvents.some((event) => event.type === "CHAIN_LINK_COMMITTED" && event.cardId === playerTrap.uid));
  assert.equal(buildEngineStateFromUiState(state).machine.chain.length, 1);

  dispatchPassResponsePriorityFromUiState(state, "player", "ai");
  dispatchQueueTrapResponseFromUiState(state, "ai", "player", 0, {
    targetEffectId: playerTrap.uid
  });
  const resolutionEvents = dispatchResolveChainFromUiState(state, "ai");

  assert.equal(state.player.lp, 3500);
  assert.equal(state.ai.lp, 3600);
  assert.deepEqual(
    resolutionEvents
      .filter((event) => event.type === "CHAIN_LINK_RESOLVED")
      .map((event) => event.cardId),
    [aiTrap.uid, playerTrap.uid]
  );
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow, null);
  assert.deepEqual(buildEngineStateFromUiState(state).machine.chain, []);
});

test("declining an attack response closes the restored engine response window", () => {
  const attacker = uiMonster("ai-attacker-pass", "star-lancer");
  attacker.ownerId = "ai";
  const target = uiMonster("player-target-pass", "iron-guardian");
  const state = appState({ phase: PHASES.battle, turn: "ai" });
  state.player.field[0] = target;
  state.ai.field[0] = attacker;

  dispatchDeclareAttackFromUiState(state, "ai", "player", 0, 0);
  const events = dispatchCloseResponseWindowFromUiState(state, "player", "declined");

  assert.ok(events.some((event) => event.type === "RESPONSE_WINDOW_CLOSED" && event.reason === "declined"));
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow, null);
});

test("resolves a direct-attack trap through a dedicated damage-step response window", () => {
  const guard = uiTrap("direct-window-guard", "guard-sigil");
  guard.trigger = "directShield";
  const draw = uiMonster("direct-window-draw", "solar-knight");
  const attacker = uiMonster("direct-window-attacker", "star-lancer");
  attacker.ownerId = "ai";
  const state = appState({ phase: PHASES.battle, turn: "ai" });
  state.player.traps[0] = guard;
  state.player.deck = [draw];
  state.ai.field[0] = attacker;

  const declarationEvents = dispatchDeclareAttackFromUiState(state, "ai", "player", 0, -1);
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");
  dispatchCloseResponseWindowFromUiState(state, "player", "no-legal-trap");
  const openEvents = dispatchOpenResponseWindowFromUiState(state, "player", {
    timing: "damageStep",
    prompt: "direct",
    triggerEventId: declaration.id,
    context: { attackerCardId: attacker.uid, targetPlayerId: "player" }
  });
  const responseEvents = dispatchTrapResponseFromUiState(state, "player", "ai", 0, {
    attackerIndex: 0,
    targetEffectId: declaration.id
  });

  assert.ok(openEvents.some((event) => event.type === "RESPONSE_WINDOW_OPENED" && event.prompt === "direct"));
  assert.deepEqual(state.player.hand, [draw]);
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_LINK_ADDED" && event.cardId === guard.uid));
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_RESOLVED"));
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow, null);
  assert.equal(buildEngineStateFromUiState(state).machine.timing, "damageStep");
});

test("resolves a summon trap through a summon timing response window", () => {
  const flare = uiTrap("summon-window-flare", "summon-flare");
  flare.trigger = "summonBurn";
  const summoned = uiMonster("summon-window-monster", "ember-drake");
  summoned.ownerId = "ai";
  const state = appState({ phase: PHASES.main, turn: "ai" });
  state.player.traps[0] = flare;
  state.ai.hand = [summoned];

  const summonEvents = dispatchSummonMonsterFromUiState(state, "ai", 0, 0);
  const summonedEvent = summonEvents.find((event) => event.type === "MONSTER_SUMMONED");
  dispatchOpenResponseWindowFromUiState(state, "player", {
    timing: "summon",
    resumeTiming: "mainOpen",
    prompt: "summon",
    triggerEventId: summonedEvent.id,
    context: { summonedPlayerId: "ai", summonedCardId: summoned.uid }
  });
  const responseEvents = dispatchTrapResponseFromUiState(state, "player", "ai", 0, {
    targetEffectId: summonedEvent.id
  });

  assert.equal(state.ai.lp, 3600);
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_LINK_ADDED" && event.cardId === flare.uid));
  assert.ok(responseEvents.some((event) => event.type === "DAMAGE_DEALT" && event.playerId === "ai" && event.amount === 400));
  assert.ok(responseEvents.some((event) => event.type === "RESPONSE_WINDOW_CLOSED"));
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow, null);
  assert.equal(buildEngineStateFromUiState(state).machine.timing, "mainOpen");
});

test("dispatches battle resolution and applies target destruction to fixed UI zones", () => {
  const attacker = uiMonster("attacker-battle", "star-lancer");
  attacker.atk = 1800;
  const target = uiMonster("target-battle", "ember-drake");
  target.ownerId = "ai";
  target.atk = 1200;
  const state = appState({ phase: PHASES.battle });
  state.player.field[1] = attacker;
  state.ai.field[2] = target;

  const events = dispatchResolveBattleFromUiState(state, "player", "ai", 1, 2);

  assert.equal(attacker.used, true);
  assert.equal(state.ai.field[2], null);
  assert.deepEqual(state.ai.grave, [target]);
  assert.equal(state.ai.lp, 3400);
  assert.ok(events.some((event) => event.type === "CARD_DESTROYED" && event.cardId === target.uid && event.reason === "battle"));
});

test("dispatches battle resolution and applies guard counter wear to UI state", () => {
  const attacker = uiMonster("attacker-guard", "star-lancer");
  attacker.atk = 1800;
  const guard = uiMonster("guard-battle", "iron-guardian");
  guard.ownerId = "ai";
  guard.atk = 900;
  guard.def = 2100;
  guard.mode = "defense";
  guard.battleWear = 0;
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = attacker;
  state.player.shield = 100;
  state.ai.field[0] = guard;

  const events = dispatchResolveBattleFromUiState(state, "player", "ai", 0, 0);

  assert.equal(attacker.used, true);
  assert.equal(state.player.shield, 0);
  assert.equal(state.player.lp, 3800);
  assert.equal(state.player.field[0], attacker);
  assert.equal(state.ai.field[0], guard);
  assert.equal(guard.battleWear, 150);
  assert.equal(guard.tempAtk, -150);
  assert.equal(guard.tempDef, -150);
  assert.ok(events.some((event) => event.type === "BATTLE_WEAR_APPLIED" && event.cardId === guard.uid && event.amount === 150));
});

test("dispatches after-attack monster effects through battle event replay", () => {
  const hound = uiMonster("hound-battle", "void-hound");
  hound.atk = 1600;
  hound.afterAttack = "grow200";
  const raider = uiMonster("raider-battle", "sky-raider");
  raider.element = "wind";
  raider.atk = 1550;
  raider.afterAttack = "windDraw";
  const draw = uiMonster("draw-after-battle", "ember-drake");

  const growState = appState({ phase: PHASES.battle });
  growState.player.field[0] = hound;
  const growEvents = dispatchResolveBattleFromUiState(growState, "player", "ai", 0, -1);
  assert.equal(hound.tempAtk, 200);
  assert.ok(growEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === hound.uid && event.amount === 200));

  const drawState = appState({ phase: PHASES.battle });
  drawState.player.field[0] = raider;
  drawState.player.deck = [draw];
  const drawEvents = dispatchResolveBattleFromUiState(drawState, "player", "ai", 0, -1);
  assert.deepEqual(drawState.player.hand, [draw]);
  assert.deepEqual(drawState.player.deck, []);
  assert.ok(drawEvents.some((event) => event.type === "CARDS_DRAWN" && event.sourceCardId === raider.uid && event.cardIds.includes(draw.uid)));
});

test("dispatches marked used attackers through UI event replay", () => {
  const attacker = uiMonster("attacker-consumed", "star-lancer");
  const state = appState({ phase: PHASES.battle });
  state.player.field[2] = attacker;

  const events = dispatchMarkMonsterUsedFromUiState(state, "player", 2);

  assert.equal(attacker.used, true);
  assert.ok(events.some((event) => event.type === "MONSTER_USED" && event.cardId === attacker.uid));
});

test("dispatches skip attack lock and clears only attack resources in UI state", () => {
  const ready = uiMonster("skip-ready", "star-lancer");
  const guard = uiMonster("skip-guard", "iron-guardian");
  guard.mode = "defense";
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = ready;
  state.player.field[1] = guard;
  state.player.attackResets = 2;
  state.player.directAttacks = 1;
  state.player.extraSummon = 1;

  const events = dispatchSkipRemainingAttacksFromUiState(state, "player");

  assert.equal(ready.used, true);
  assert.equal(guard.used, undefined);
  assert.equal(state.player.attacksSkipped, true);
  assert.equal(state.player.attackResets, 0);
  assert.equal(state.player.directAttacks, 0);
  assert.equal(state.player.extraSummon, 1);
  assert.ok(events.some((event) => event.type === "ATTACKS_SKIPPED"));
});

test("battle replay automatically spends attack reset and readies the attacker", () => {
  const attacker = uiMonster("reset-ui-attacker", "star-lancer");
  attacker.atk = 1500;
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = attacker;
  state.player.attackResets = 1;

  const events = dispatchResolveBattleFromUiState(state, "player", "ai", 0, -1);

  assert.equal(attacker.used, false);
  assert.equal(state.player.attackResets, 0);
  assert.ok(events.some((event) => event.type === "ABILITY_SPENT" && event.ability === "attackReset"));
  assert.ok(events.some((event) => event.type === "MONSTER_READIED" && event.cardId === attacker.uid));
});

test("dispatches monster mode changes and replays them into UI state", () => {
  const monster = uiMonster("mode-ui", "iron-guardian");
  monster.mode = "attack";
  monster.used = false;
  monster.changedMode = false;
  const state = appState();
  state.player.field[1] = monster;

  const events = dispatchChangeMonsterModeFromUiState(state, "player", 1, "defense");

  assert.equal(monster.mode, "defense");
  assert.equal(monster.changedMode, true);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_MODE_CHANGED" &&
    event.cardId === monster.uid &&
    event.from === "attack" &&
    event.to === "defense"
  ));
  assert.equal(state.gameEvents.length, events.length);
});

test("dispatches turn start and replays rule resets into UI state", () => {
  const first = uiMonster("turn-first", "star-lancer");
  first.used = true;
  first.changedMode = true;
  first.mode = "defense";
  const second = uiMonster("turn-second", "iron-guardian");
  second.used = false;
  second.changedMode = true;
  const state = appState({ turn: "ai", phase: PHASES.battle });
  state.player.field[0] = first;
  state.player.field[1] = second;
  state.player.extraSummon = 2;
  state.player.attackResets = 1;
  state.player.directAttacks = 1;
  state.player.attacksSkipped = true;
  state.player.comboThisTurn = true;
  state.player.comboFlags = { fireWind: true };
  state.player.normalSummonsUsed = 1;

  const events = dispatchStartTurnFromUiState(state, "player");

  assert.equal(state.turn, "player");
  assert.equal(state.phase, PHASES.draw);
  assert.equal(state.timing, "draw");
  assert.equal(state.player.normalSummonsUsed, 0);
  assert.equal(first.used, false);
  assert.equal(first.changedMode, false);
  assert.equal(second.changedMode, false);
  assert.equal(state.player.extraSummon, 0);
  assert.equal(state.player.attackResets, 0);
  assert.equal(state.player.directAttacks, 0);
  assert.equal(state.player.attacksSkipped, false);
  assert.equal(state.player.comboThisTurn, false);
  assert.deepEqual(state.player.comboFlags, {});
  assert.ok(events.some((event) => event.type === "TURN_STARTED" && event.playerId === "player"));
  assert.equal(events.filter((event) => event.type === "MONSTER_TURN_RESET").length, 2);
  assert.ok(events.some((event) => event.type === "TURN_ABILITIES_EXPIRED"));
});

test("auto-end and turn-end events project into UI state", () => {
  const state = appState({ turn: "player", phase: PHASES.main });

  const requestEvents = dispatchRequestAutoEndFromUiState(state, "player", {
    reason: "no actions",
    now: 1000,
    timeoutSeconds: 2
  });

  assert.equal(state.autoEnding, true);
  assert.equal(state.actionWindow, "autoEnd");
  assert.equal(state.actionDeadline, 3000);
  assert.equal(state.timing, "autoEnd");
  assert.ok(requestEvents.some((event) => event.type === "AUTO_END_REQUESTED"));

  const cancelEvents = dispatchCancelAutoEndFromUiState(state, "player", {
    reason: "player intent"
  });

  assert.equal(state.autoEnding, false);
  assert.ok(cancelEvents.some((event) => event.type === "AUTO_END_CANCELED"));

  dispatchRequestAutoEndFromUiState(state, "player", {
    reason: "still no actions",
    now: 5000,
    timeoutSeconds: 2
  });
  const commitEvents = dispatchCommitAutoEndFromUiState(state, "player", {
    now: 7000
  });

  assert.equal(state.autoEnding, false);
  assert.equal(state.phase, "end");
  assert.equal(state.timing, "end");
  assert.ok(commitEvents.some((event) => event.type === "AUTO_END_COMMITTED"));
  assert.ok(commitEvents.some((event) => event.type === "TURN_ENDED" && event.nextPlayerId === "ai"));

  const manualState = appState({ turn: "player", phase: PHASES.battle });
  const manualEvents = dispatchEndTurnFromUiState(manualState, "player", {
    reason: "manual"
  });
  assert.equal(manualState.phase, "end");
  assert.ok(manualEvents.some((event) => event.type === "TURN_ENDED" && event.reason === "manual"));
});

test("phase events preserve attack response windows after a started turn", () => {
  const attacker = uiMonster("ai-phase-attacker", "star-lancer");
  attacker.ownerId = "ai";
  const target = uiMonster("player-phase-target", "gale-mage");
  const trap = uiTrap("player-phase-trap", "counter-array");
  trap.trigger = "counterBoost";
  const state = appState({ phase: PHASES.main, turn: "player" });
  state.player.field[0] = target;
  state.player.traps[0] = trap;
  state.ai.field[0] = attacker;

  dispatchStartTurnFromUiState(state, "ai");
  dispatchChangePhaseFromUiState(state, "ai", PHASES.main);
  dispatchChangePhaseFromUiState(state, "ai", PHASES.battle);
  const declarationEvents = dispatchDeclareAttackFromUiState(state, "ai", "player", 0, 0);
  const declaration = declarationEvents.find((event) => event.type === "ATTACK_DECLARED");

  assert.equal(state.phase, PHASES.battle);
  assert.equal(buildEngineStateFromUiState(state).machine.responseWindow?.playerId, "player");

  const responseEvents = dispatchQueueTrapResponseFromUiState(state, "player", "ai", 0, {
    attackerIndex: 0,
    targetEffectId: declaration.id
  });

  assert.equal(state.player.traps[0], null);
  assert.deepEqual(state.player.grave, [trap]);
  assert.ok(responseEvents.some((event) => event.type === "CHAIN_LINK_COMMITTED" && event.cardId === trap.uid));
  assert.equal(state.gameEvents.filter((event) => event.type === "PHASE_CHANGED").length, 2);
});

test("does not mutate UI state when SUMMON_MONSTER is rejected by the engine", () => {
  const spell = uiSpell("spell-summon-1");
  const state = appState();
  state.player.hand = [spell];

  assert.throws(
    () => dispatchSummonMonsterFromUiState(state, "player", 0, 0),
    /not a monster/
  );
  assert.deepEqual(state.player.hand, [spell]);
  assert.equal(state.player.field.filter(Boolean).length, 0);
  assert.deepEqual(state.gameEvents, []);
});

test("preserves UI phase so SUMMON_MONSTER is rejected outside legal action phases", () => {
  const lancer = uiMonster("monster-draw");
  const state = appState({ phase: PHASES.draw });
  state.player.hand = [lancer];

  assert.throws(
    () => dispatchSummonMonsterFromUiState(state, "player", 0, 0),
    /not legal during draw phase/
  );
  assert.deepEqual(state.player.hand, [lancer]);
  assert.equal(state.player.field.filter(Boolean).length, 0);
  assert.deepEqual(state.gameEvents, []);
});

test("dispatches engine-backed draw spells and applies card movement events to UI zones", () => {
  const seer = uiSpell("spell-draw", "draw2", "seer-call");
  const deckOne = uiMonster("deck-1", "ember-drake");
  const deckTwo = uiMonster("deck-2", "solar-knight");
  const state = appState();
  state.player.hand = [seer];
  state.player.deck = [deckOne, deckTwo];

  assert.equal(canDispatchSpellFromUiState(seer), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, [deckOne, deckTwo]);
  assert.deepEqual(state.player.deck, []);
  assert.deepEqual(state.player.grave, [seer]);
  assert.ok(events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === seer.uid));
  assert.ok(events.some((event) => event.type === "CARDS_DRAWN" && event.count === 2));
  assert.equal(state.gameEvents.length, events.length);
});

test("dispatches engine-backed healing and stat spells without direct UI mutation", () => {
  const renewal = uiSpell("spell-heal", "heal700", "renewal");
  const chant = uiSpell("spell-buff", "buff500", "war-chant");
  const strongest = uiMonster("strongest-1", "star-lancer");
  const weaker = uiMonster("weaker-1", "ember-drake");
  strongest.atk = 1800;
  weaker.atk = 1500;
  const state = appState();
  state.player.lp = 3500;
  state.player.hand = [renewal, chant];
  state.player.field[0] = strongest;
  state.player.field[1] = weaker;

  const healEvents = dispatchActivateSpellFromUiState(state, "player", "ai", 0);
  const buffEvents = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: strongest });

  assert.equal(state.player.lp, 4000);
  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [renewal, chant]);
  assert.equal(strongest.tempAtk, 500);
  assert.equal(weaker.tempAtk || 0, 0);
  assert.ok(healEvents.some((event) => event.type === "LP_HEALED" && event.amount === 500));
  assert.ok(buffEvents.some((event) => event.type === "STAT_MODIFIED" && event.cardId === strongest.uid));
});

test("dispatches engine-backed equipment spells into UI spell trap zones", () => {
  const blade = uiSpell("equip-blade", "equipBlade", "blade-sigil");
  const lancer = uiMonster("lancer-1", "star-lancer");
  lancer.atk = 1800;
  const state = appState();
  state.player.hand = [blade];
  state.player.field[0] = lancer;

  assert.equal(canDispatchSpellFromUiState(blade), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: lancer });

  assert.deepEqual(state.player.hand, []);
  assert.equal(state.player.traps[0], blade);
  assert.deepEqual(state.player.grave, []);
  assert.equal(lancer.tempAtk, 300);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === blade.uid &&
    event.to.zone === "spellTrapZone"
  ));
  assert.ok(events.some((event) =>
    event.type === "CONTINUOUS_EFFECT_REGISTERED" &&
    event.sourceCardId === blade.uid &&
    event.targetCardId === lancer.uid
  ));
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === lancer.uid &&
    event.duration === "continuous"
  ));
});

test("replays continuous effect release events into UI and engine projections", () => {
  const blade = uiSpell("equip-blade", "equipBlade", "blade-sigil");
  const lancer = uiMonster("lancer-1", "star-lancer");
  lancer.atk = 1800;
  const state = appState();
  state.player.hand = [blade];
  state.player.field[0] = lancer;

  dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: lancer });
  applyUiGameEvents(state, [
    {
      id: "continuous:equip-blade",
      type: "CONTINUOUS_EFFECT_RELEASED",
      playerId: "player",
      sourceCardId: blade.uid,
      effectId: "equipBlade",
      targetCardId: lancer.uid,
      reason: "source-left-zone",
      operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
    },
    {
      id: 50,
      type: "STAT_MODIFIED",
      cardId: lancer.uid,
      stat: "tempAtk",
      before: 300,
      after: 0,
      amount: -300,
      sourceCardId: blade.uid,
      duration: "continuous"
    },
    {
      id: 51,
      type: "CARD_MOVED",
      cardId: blade.uid,
      from: { playerId: "player", zone: "spellTrapZone" },
      to: { playerId: "player", zone: "grave", index: null }
    }
  ]);

  assert.equal(lancer.tempAtk, 0);
  assert.equal(state.player.traps[0], null);
  assert.deepEqual(state.player.grave, [blade]);
  assert.deepEqual(buildEngineStateFromUiState(state).continuousEffects, []);
});

test("dispatches spell/trap removal spells against explicit rival trap targets", () => {
  const ray = uiSpell("ray-1", "destroySpellTrap", "dispelling-ray");
  const enemyTrap = uiSpell("enemy-trap-1", "equipBlade", "blade-sigil");
  enemyTrap.ownerId = "ai";
  const state = appState();
  state.player.hand = [ray];
  state.ai.traps[1] = enemyTrap;

  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: enemyTrap });

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [ray]);
  assert.equal(state.ai.traps[1], null);
  assert.deepEqual(state.ai.grave, [enemyTrap]);
  assert.ok(events.some((event) =>
    event.type === "CARD_DESTROYED" &&
    event.cardId === enemyTrap.uid
  ));
});

test("dispatches engine-backed damage spells with shield absorption", () => {
  const burst = uiSpell("spell-burn", "burn500", "burst-rune");
  const state = appState();
  state.player.hand = [burst];
  state.ai.lp = 4000;
  state.ai.shield = 300;

  assert.equal(canDispatchSpellFromUiState(burst), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.equal(state.ai.shield, 0);
  assert.equal(state.ai.lp, 3800);
  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [burst]);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === "ai" &&
    event.requested === 500 &&
    event.blocked === 300 &&
    event.amount === 200
  ));
});

test("replays lethal spell damage as a game-over UI event", () => {
  const burst = uiSpell("spell-lethal", "burn500", "burst-rune");
  const state = appState();
  state.player.hand = [burst];
  state.ai.lp = 400;

  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.equal(state.ai.lp, 0);
  assert.equal(state.gameOver, true);
  assert.equal(state.gameOverWinner, "player");
  assert.equal(state.actionWindow, "gameOver");
  assert.equal(state.timing, "gameOver");
  assert.ok(events.some((event) => event.type === "GAME_OVER_DECLARED" && event.winnerId === "player"));
});

test("dispatches engine-backed pierce-line with target stat loss and shielded damage", () => {
  const pierce = uiSpell("spell-pierce", "pierceLine", "pierce-line");
  const strongest = uiMonster("enemy-strongest", "star-lancer");
  const weaker = uiMonster("enemy-weaker", "ember-drake");
  strongest.ownerId = "ai";
  weaker.ownerId = "ai";
  strongest.atk = 1800;
  weaker.atk = 1500;
  const state = appState();
  state.player.hand = [pierce];
  state.ai.field[0] = weaker;
  state.ai.field[1] = strongest;
  state.ai.shield = 50;

  assert.equal(canDispatchSpellFromUiState(pierce), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: strongest, owner: "ai" });

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [pierce]);
  assert.equal(strongest.tempAtk, -400);
  assert.equal(strongest.tempDef, -400);
  assert.equal(weaker.tempAtk || 0, 0);
  assert.equal(weaker.tempDef || 0, 0);
  assert.equal(state.ai.shield, 0);
  assert.equal(state.ai.lp, 3850);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.cardId === strongest.uid).length, 2);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === "ai" &&
    event.requested === 200 &&
    event.blocked === 50 &&
    event.amount === 150
  ));
});

test("dispatches engine-backed direct-strike as an ability grant", () => {
  const breach = uiSpell("spell-direct", "directStrike", "star-breach");
  const attacker = uiMonster("player-attacker", "star-lancer");
  const guard = uiMonster("enemy-guard", "iron-guardian");
  guard.ownerId = "ai";
  const state = appState();
  state.player.hand = [breach];
  state.player.field[0] = attacker;
  state.ai.field[0] = guard;

  assert.equal(canDispatchSpellFromUiState(breach), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [breach]);
  assert.equal(state.player.directAttacks, 1);
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === "player" &&
    event.ability === "directAttack" &&
    event.uses === 1 &&
    event.sourceCardId === breach.uid
  ));
});

test("dispatches engine-backed extra-summon as an ability grant", () => {
  const twin = uiSpell("spell-extra", "extraSummon", "twin-summon");
  const monster = uiMonster("summon-followup", "star-lancer");
  const state = appState();
  state.player.hand = [twin, monster];

  assert.equal(canDispatchSpellFromUiState(twin), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, [monster]);
  assert.deepEqual(state.player.grave, [twin]);
  assert.equal(state.player.extraSummon, 1);
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === "player" &&
    event.ability === "extraSummon" &&
    event.uses === 1 &&
    event.sourceCardId === twin.uid
  ));
});

test("dispatches engine-backed shield spells with capped shield gain", () => {
  const shield = uiSpell("spell-shield", "shield800", "star-shield");
  const state = appState();
  state.player.hand = [shield];
  state.player.shield = 2000;

  assert.equal(canDispatchSpellFromUiState(shield), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [shield]);
  assert.equal(state.player.shield, 2400);
  assert.ok(events.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.playerId === "player" &&
    event.requested === 800 &&
    event.amount === 400 &&
    event.before === 2000 &&
    event.after === 2400 &&
    event.sourceCardId === shield.uid
  ));
});

test("dispatches engine-backed grave-return by moving a grave card to deck top before drawing", () => {
  const reclaim = uiSpell("spell-return", "graveReturn", "grave-return");
  const fallen = uiMonster("fallen-monster", "ember-drake");
  const deckCard = uiMonster("deck-after-return", "solar-knight");
  const state = appState();
  state.player.hand = [reclaim];
  state.player.deck = [deckCard];
  state.player.grave = [fallen];

  assert.equal(canDispatchSpellFromUiState(reclaim), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, [fallen]);
  assert.deepEqual(state.player.deck, [deckCard]);
  assert.deepEqual(state.player.grave, [reclaim]);
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === fallen.uid &&
    event.from.zone === "grave" &&
    event.to.zone === "deck" &&
    event.to.index === 0
  ));
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === "player" &&
    event.cardIds.includes(fallen.uid) &&
    event.sourceCardId === reclaim.uid
  ));
});

test("dispatches engine-backed battle-trance as a stat buff plus attack reset ability", () => {
  const trance = uiSpell("spell-trance", "battleTrance", "battle-trance");
  const strongest = uiMonster("strongest-trance", "star-lancer");
  const weaker = uiMonster("weaker-trance", "ember-drake");
  strongest.atk = 1800;
  weaker.atk = 1500;
  const state = appState();
  state.player.hand = [trance];
  state.player.field[0] = weaker;
  state.player.field[1] = strongest;

  assert.equal(canDispatchSpellFromUiState(trance), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: strongest });

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [trance]);
  assert.equal(strongest.tempAtk, 200);
  assert.equal(weaker.tempAtk || 0, 0);
  assert.equal(state.player.attackResets, 1);
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === strongest.uid &&
    event.amount === 200
  ));
  assert.ok(events.some((event) =>
    event.type === "ABILITY_GRANTED" &&
    event.playerId === "player" &&
    event.ability === "attackReset" &&
    event.uses === 1 &&
    event.sourceCardId === trance.uid
  ));
});

test("dispatches battle-trance as an immediate ready when the strongest monster already attacked", () => {
  const trance = uiSpell("spell-trance-used", "battleTrance", "battle-trance");
  const strongest = uiMonster("strongest-trance-used", "star-lancer");
  const weaker = uiMonster("weaker-trance-used", "ember-drake");
  strongest.atk = 1800;
  strongest.used = true;
  weaker.atk = 1500;
  const state = appState();
  state.player.hand = [trance];
  state.player.field[0] = weaker;
  state.player.field[1] = strongest;

  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: strongest });

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [trance]);
  assert.equal(strongest.tempAtk, 200);
  assert.equal(strongest.used, false);
  assert.equal(state.player.attackResets, 0);
  assert.ok(events.some((event) =>
    event.type === "MONSTER_READIED" &&
    event.cardId === strongest.uid &&
    event.sourceCardId === trance.uid
  ));
  assert.ok(!events.some((event) => event.type === "ABILITY_GRANTED" && event.ability === "attackReset"));
});

test("dispatches engine-backed rally-attack as stat buff plus immediate monster ready", () => {
  const rally = uiSpell("spell-rally", "rallyAttack", "rally-strike");
  const strongest = uiMonster("strongest-rally", "star-lancer");
  const usedMonster = uiMonster("used-rally", "ember-drake");
  strongest.atk = 1800;
  usedMonster.atk = 1500;
  usedMonster.used = true;
  const state = appState();
  state.player.hand = [rally];
  state.player.field[0] = usedMonster;
  state.player.field[1] = strongest;

  assert.equal(canDispatchSpellFromUiState(rally), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0, { card: strongest });

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [rally]);
  assert.equal(strongest.tempAtk, 300);
  assert.equal(usedMonster.used, false);
  assert.equal(state.player.attackResets, 0);
  assert.ok(events.some((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === strongest.uid &&
    event.amount === 300
  ));
  assert.ok(events.some((event) =>
    event.type === "MONSTER_READIED" &&
    event.cardId === usedMonster.uid &&
    event.sourceCardId === rally.uid
  ));
});

test("dispatches engine-backed light-shadow combo as shield gain plus draw", () => {
  const eclipse = uiSpell("spell-eclipse", "lightShadowCombo", "eclipse-barrier");
  const deckCard = uiMonster("eclipse-draw", "solar-knight");
  const state = appState();
  state.player.hand = [eclipse];
  state.player.deck = [deckCard];
  state.player.shield = 2100;

  assert.equal(canDispatchSpellFromUiState(eclipse), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, [deckCard]);
  assert.deepEqual(state.player.deck, []);
  assert.deepEqual(state.player.grave, [eclipse]);
  assert.equal(state.player.shield, 2400);
  assert.ok(events.some((event) =>
    event.type === "SHIELD_GAINED" &&
    event.playerId === "player" &&
    event.requested === 600 &&
    event.amount === 300 &&
    event.before === 2100 &&
    event.after === 2400 &&
    event.sourceCardId === eclipse.uid
  ));
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === "player" &&
    event.cardIds.includes(deckCard.uid) &&
    event.sourceCardId === eclipse.uid
  ));
});

test("dispatches engine-backed element-echo as all-field stat buffs plus draw", () => {
  const echo = uiSpell("spell-echo", "elementEcho", "element-echo");
  const fire = uiMonster("echo-fire", "ember-drake");
  const light = uiMonster("echo-light", "solar-knight");
  const deckCard = uiMonster("echo-draw", "star-lancer");
  fire.element = "fire";
  light.element = "light";
  const state = appState();
  state.player.hand = [echo];
  state.player.deck = [deckCard];
  state.player.field[0] = fire;
  state.player.field[1] = light;

  assert.equal(canDispatchSpellFromUiState(echo), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, [deckCard]);
  assert.deepEqual(state.player.grave, [echo]);
  assert.equal(fire.tempAtk, 200);
  assert.equal(light.tempAtk, 200);
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.amount === 200).length, 2);
  assert.ok(events.some((event) =>
    event.type === "CARDS_DRAWN" &&
    event.playerId === "player" &&
    event.cardIds.includes(deckCard.uid) &&
    event.sourceCardId === echo.uid
  ));
});

test("dispatches engine-backed fire-wind combo as damage plus all-field stat buffs", () => {
  const combo = uiSpell("spell-firewind", "fireWindCombo", "flame-gale-burst");
  const fire = uiMonster("combo-fire", "ember-drake");
  const wind = uiMonster("combo-wind", "gale-rogue");
  fire.element = "fire";
  wind.element = "wind";
  const state = appState();
  state.player.hand = [combo];
  state.player.field[0] = fire;
  state.player.field[1] = wind;
  state.ai.shield = 100;

  assert.equal(canDispatchSpellFromUiState(combo), true);
  const events = dispatchActivateSpellFromUiState(state, "player", "ai", 0);

  assert.deepEqual(state.player.hand, []);
  assert.deepEqual(state.player.grave, [combo]);
  assert.equal(state.ai.shield, 0);
  assert.equal(state.ai.lp, 3700);
  assert.equal(fire.tempAtk, 200);
  assert.equal(wind.tempAtk, 200);
  assert.ok(events.some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === "ai" &&
    event.requested === 400 &&
    event.blocked === 100 &&
    event.amount === 300 &&
    event.sourceCardId === combo.uid
  ));
  assert.equal(events.filter((event) => event.type === "STAT_MODIFIED" && event.amount === 200).length, 2);
});

test("rejects engine-backed spells in illegal phases without consuming the card", () => {
  const seer = uiSpell("spell-draw-phase", "draw2", "seer-call");
  const state = appState({ phase: PHASES.draw });
  state.player.hand = [seer];
  state.player.deck = [uiMonster("deck-phase-1"), uiMonster("deck-phase-2")];

  assert.throws(
    () => dispatchActivateSpellFromUiState(state, "player", "ai", 0),
    /not legal during draw phase/
  );
  assert.deepEqual(state.player.hand, [seer]);
  assert.equal(state.player.grave.length, 0);
  assert.deepEqual(state.gameEvents, []);
});

test("rejects missing spell engine effects without mutating UI state", () => {
  const mystery = uiSpell("spell-missing", "missingSpellEffect", "mystery-spell");
  const graveCard = uiMonster("grave-before", "ember-drake");
  const fieldCard = uiMonster("field-before", "star-lancer");
  const enemyCard = uiMonster("enemy-before", "iron-guardian");
  enemyCard.ownerId = "ai";
  const state = appState();
  state.player.hand = [mystery];
  state.player.grave = [graveCard];
  state.player.field[0] = fieldCard;
  state.ai.field[0] = enemyCard;
  state.ai.lp = 3200;
  const before = snapshotUiState(state);

  assert.equal(canDispatchSpellFromUiState(mystery), false);
  assert.throws(
    () => dispatchActivateSpellFromUiState(state, "player", "ai", 0),
    /not engine-backed/
  );
  assert.deepEqual(snapshotUiState(state), before);
});

test("rejects spells that have engine DSL but no spell metadata without mutating UI state", () => {
  const mystery = uiSpell("spell-wrong-kind", "burn200", "mystery-spell");
  const graveCard = uiMonster("grave-wrong-kind", "ember-drake");
  const fieldCard = uiMonster("field-wrong-kind", "star-lancer");
  const enemyCard = uiMonster("enemy-wrong-kind", "iron-guardian");
  enemyCard.ownerId = "ai";
  const state = appState();
  state.player.hand = [mystery];
  state.player.grave = [graveCard];
  state.player.field[0] = fieldCard;
  state.player.traps[0] = uiTrap("trap-before-wrong-kind", "mirror-snare");
  state.player.lp = 2800;
  state.ai.field[0] = enemyCard;
  state.ai.lp = 3200;
  const before = snapshotUiState(state);

  assert.equal(canDispatchSpellFromUiState(mystery), false);
  assert.throws(
    () => dispatchActivateSpellFromUiState(state, "player", "ai", 0),
    /not engine-backed/
  );
  assert.deepEqual(snapshotUiState(state), before);
});

test("explains spell activation legality from UI state without consuming cards", () => {
  const seer = uiSpell("spell-draw-phase", "draw2", "seer-call");
  const state = appState({ phase: PHASES.draw });
  state.player.hand = [seer];
  state.player.deck = [uiMonster("deck-phase-1"), uiMonster("deck-phase-2")];

  const result = explainActivateSpellFromUiState(state, "player", "ai", 0);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /not legal during draw phase/);
  assert.match(result.reason, /阶段|当前/);
  assert.deepEqual(state.player.hand, [seer]);
  assert.deepEqual(state.player.grave, []);
  assert.deepEqual(state.gameEvents, []);
});

test("explains missing spell targets through the engine adapter", () => {
  const blade = uiSpell("blade-no-target", "equipBlade", "blade-sigil");
  const state = appState();
  state.player.hand = [blade];

  const result = explainActivateSpellFromUiState(state, "player", "ai", 0);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /requires action\.targetCardId/);
  assert.match(result.reason, /目标/);
  assert.deepEqual(state.player.hand, [blade]);
});

test("explains monster summon legality from UI state without consuming cards", () => {
  const monster = uiMonster("summon-locked");
  const state = appState();
  state.player.hand = [monster];
  state.player.normalSummonsUsed = 1;

  const result = explainSummonMonsterFromUiState(state, "player", 0, 0);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /no normal or extra summon/);
  assert.deepEqual(state.player.hand, [monster]);
  assert.deepEqual(state.player.field.filter(Boolean), []);
  assert.deepEqual(state.gameEvents, []);
});

test("explains occupied summon slots before compacting UI monster zones", () => {
  const monster = uiMonster("summon-slot");
  const existing = uiMonster("summon-existing");
  const state = appState();
  state.player.hand = [monster];
  state.player.field[0] = existing;

  const result = explainSummonMonsterFromUiState(state, "player", 0, 0);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /Monster zone slot is occupied/);
  assert.deepEqual(state.player.hand, [monster]);
  assert.equal(state.player.field[0], existing);
  assert.deepEqual(state.gameEvents, []);
});

test("explains trap setting legality from UI state without consuming cards", () => {
  const trap = uiTrap("trap-draw-phase");
  const state = appState({ phase: PHASES.draw });
  state.player.hand = [trap];

  const result = explainSetTrapFromUiState(state, "player", 0, 0);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /not legal during draw phase/);
  assert.deepEqual(state.player.hand, [trap]);
  assert.deepEqual(state.player.traps.filter(Boolean), []);
  assert.deepEqual(state.gameEvents, []);
});

test("explains attack target legality from UI state without opening response windows", () => {
  const attacker = uiMonster("attack-direct");
  const guard = uiMonster("attack-guard");
  const state = appState({ phase: PHASES.battle });
  state.player.field[0] = attacker;
  state.ai.field[0] = guard;

  const result = explainDeclareAttackFromUiState(state, "player", "ai", 0, -1);

  assert.equal(result.ok, false);
  assert.match(result.engineReason, /must attack a monster/);
  assert.equal(attacker.used, undefined);
  assert.deepEqual(state.gameEvents, []);
});

test("projects legal actions from UI state through the engine", () => {
  const monster = uiMonster("legal-summon");
  const trap = uiTrap("legal-trap");
  const spell = uiSpell("legal-burn", "burn500", "burst-rune");
  const attacker = uiMonster("legal-attacker");
  const guard = uiMonster("legal-guard");
  guard.ownerId = "ai";
  const state = appState({ phase: PHASES.battle });
  state.player.hand = [monster, trap, spell];
  state.player.field[0] = attacker;
  state.ai.field[0] = guard;

  const legal = getLegalActionsFromUiState(state, "player");

  assert.equal(legal.can.summon, false);
  assert.equal(legal.can.setTrap, true);
  assert.equal(legal.can.activateCard, true);
  assert.equal(legal.can.declareAttack, true);
  assert.deepEqual(legal.actions.setTrap.map((action) => action.cardId), [trap.uid]);
  assert.deepEqual(legal.actions.activateCard.map((action) => action.cardId), [spell.uid]);
  assert.deepEqual(legal.actions.declareAttack.map((action) => action.targetCardId), [guard.uid]);
  assert.deepEqual(state.gameEvents, []);
});
