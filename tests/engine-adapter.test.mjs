import test from "node:test";
import assert from "node:assert/strict";

import { createDuelist } from "../src/deck.js";
import {
  canDispatchSpellFromUiState,
  canDispatchSummonEffectFromUiState,
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
