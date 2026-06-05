import test from "node:test";
import assert from "node:assert/strict";

import { createDuelist } from "../src/deck.js";
import { dispatchSetTrapFromUiState, dispatchSummonMonsterFromUiState } from "../src/engine-adapter.js";
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

function uiSpell(uid) {
  return {
    uid,
    id: "burst-rune",
    ownerId: "player",
    type: "spell",
    name: "burst-rune",
    effect: "burn500"
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
