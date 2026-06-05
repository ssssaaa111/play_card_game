import test from "node:test";
import assert from "node:assert/strict";

import { createDuelist } from "../src/deck.js";
import {
  canDispatchSpellFromUiState,
  dispatchActivateSpellFromUiState,
  dispatchSetTrapFromUiState,
  dispatchSummonMonsterFromUiState
} from "../src/engine-adapter.js";
import { PHASES } from "../src/turn-state.js";

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
  assert.ok(events.some((event) =>
    event.type === "CARD_MOVED" &&
    event.cardId === lancer.uid &&
    event.to.zone === "monsterZone" &&
    event.to.index === 2
  ));
  assert.ok(events.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === lancer.uid));
  assert.equal(state.gameEvents.length, events.length);
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
