import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets, scenarioSetups } from "../src/data.js";
import { FIELD_SIZE } from "../src/rules.js";
import { buildScenarioState, scenarioReservedIds } from "../src/scenario-state.js";

function ids(cards = []) {
  return cards.map((card) => card?.id || null);
}

test("collects reserved scenario cards by owner", () => {
  assert.deepEqual(scenarioReservedIds(scenarioSetups.combo, "player"), [
    "flame-gale-burst",
    "eclipse-barrier",
    "war-chant",
    "battle-trance",
    "seer-call",
    "ember-drake",
    "gale-mage"
  ]);
  assert.deepEqual(scenarioReservedIds(scenarioSetups.combo, "ai"), [
    "mirror-snare",
    "solar-knight",
    "iron-guardian"
  ]);
});

test("collects reserved ids from configured scenario zone entries", () => {
  assert.deepEqual(scenarioReservedIds({
    playerHand: ["phantom-switch"],
    playerField: [
      { id: "gale-mage", mode: "defense" },
      { id: "iron-guardian", mode: "defense" }
    ],
    playerTraps: [{ id: "mirror-snare" }]
  }, "player"), [
    "phantom-switch",
    "gale-mage",
    "iron-guardian",
    "mirror-snare"
  ]);
});

test("builds fixed-size cloned zones and explicit scenario decks", () => {
  const setup = buildScenarioState(scenarioSetups.directTrap, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(setup.player.hand), ["storm-shift"]);
  assert.deepEqual(ids(setup.ai.deck), ["guard-sigil"]);
  assert.deepEqual(ids(setup.ai.field), ["star-lancer", "sky-raider", "gale-mage"]);
  assert.equal(setup.player.field.length, FIELD_SIZE);
  assert.equal(setup.ai.field.length, FIELD_SIZE);
  assert.equal(setup.player.traps.length, FIELD_SIZE);
  assert.equal(setup.ai.traps.length, FIELD_SIZE);
  assert.ok(setup.ai.field.every((card) => !card || (!card.used && card.changedMode === false)));
});

test("redirect trap scenario places guard targets in defense mode", () => {
  const setup = buildScenarioState(scenarioSetups.redirect, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(setup.player.field).slice(0, 2), ["gale-mage", "iron-guardian"]);
  assert.equal(setup.player.field[0].mode, "defense");
  assert.equal(setup.player.field[1].mode, "defense");
  assert.equal(setup.player.field[1].def, 2100);
  assert.equal(setup.ai.field[0].mode, "attack");
});

test("guard skip scenario starts with a locked defense wall", () => {
  const setup = buildScenarioState(scenarioSetups.guardSkip, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(setup.player.field).slice(0, 1), ["iron-guardian"]);
  assert.equal(setup.player.field[0].mode, "defense");
  assert.equal(setup.player.field[0].changedMode, true);
  assert.deepEqual(ids(setup.ai.field).slice(0, 1), ["star-lancer"]);
  assert.deepEqual(ids(setup.ai.deck), ["guard-sigil"]);
});

test("counter chain scenario starts with opposing response traps", () => {
  const setup = buildScenarioState(scenarioSetups.counterChain, {
    playerPreset: "balanced",
    aiPreset: "control"
  });

  assert.deepEqual(ids(setup.player.field).slice(0, 1), ["gale-mage"]);
  assert.deepEqual(ids(setup.player.traps).slice(0, 1), ["counter-array"]);
  assert.deepEqual(ids(setup.ai.field).slice(0, 1), ["star-lancer"]);
  assert.deepEqual(ids(setup.ai.traps).slice(0, 1), ["chain-nullifier"]);
});

test("summon effects scenario exposes basic engine-backed summon triggers", () => {
  const setup = buildScenarioState(scenarioSetups.summonEffects, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(setup.player.hand), ["ember-drake", "gale-mage", "night-oracle"]);
  assert.equal(setup.player.hand[0].onSummon, "burn200");
  assert.equal(setup.player.hand[1].onSummon, "draw1");
  assert.equal(setup.player.hand[2].onSummon, "heal300");
  assert.deepEqual(ids(setup.player.deck), ["solar-knight", "prism-saint"]);
});

test("conditional summon scenarios expose engine-backed summon triggers", () => {
  const fire = buildScenarioState(scenarioSetups.summonFireBuff, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });
  const shield = buildScenarioState(scenarioSetups.summonShield, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });
  const shadow = buildScenarioState(scenarioSetups.summonShadowBurn, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(fire.player.field).slice(0, 1), ["ember-drake"]);
  assert.deepEqual(ids(fire.player.hand), ["flame-captain"]);
  assert.equal(fire.player.hand[0].onSummon, "fireBuff");
  assert.deepEqual(ids(shield.player.hand), ["prism-saint"]);
  assert.equal(shield.player.hand[0].onSummon, "shield400");
  assert.deepEqual(ids(shadow.player.field).slice(0, 1), ["night-oracle"]);
  assert.deepEqual(ids(shadow.player.hand), ["dusk-alchemist"]);
  assert.equal(shadow.player.hand[0].onSummon, "shadowBurn");
});

test("basic expansion scenarios expose new summon spell and trap cards", () => {
  const summon = buildScenarioState(scenarioSetups.expansionSummon, {
    playerPreset: "basicExpansion",
    aiPreset: "balanced"
  });
  const parry = buildScenarioState(scenarioSetups.expansionParry, {
    playerPreset: "basicExpansion",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(summon.player.field).slice(0, 1), ["gale-mage"]);
  assert.deepEqual(ids(summon.player.hand), ["star-soul-apprentice", "soul-resonance"]);
  assert.equal(summon.player.hand[0].onSummon, "starSoulSurvey");
  assert.equal(summon.player.hand[1].effect, "soulResonance");
  assert.deepEqual(ids(summon.player.deck), ["solar-knight"]);

  assert.deepEqual(ids(parry.player.field).slice(0, 1), ["night-oracle"]);
  assert.deepEqual(ids(parry.player.hand), ["rift-bulwark", "soul-resonance", "soul-parry"]);
  assert.equal(parry.player.hand[0].onSummon, "riftShelter");
  assert.equal(parry.player.hand[1].effect, "soulResonance");
  assert.equal(parry.player.hand[2].trigger, "soulParry");
  assert.deepEqual(ids(parry.ai.field).slice(0, 1), ["star-lancer"]);
});

test("phantom redirect scenario exposes the redirected attack fixture", () => {
  const setup = buildScenarioState(scenarioSetups.phantomRedirect, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });

  assert.deepEqual(ids(setup.player.hand), ["phantom-switch"]);
  assert.deepEqual(ids(setup.player.field).slice(0, 2), ["dusk-alchemist", "iron-guardian"]);
  assert.equal(setup.player.field[0].mode, "attack");
  assert.equal(setup.player.field[1].mode, "defense");
  assert.deepEqual(ids(setup.ai.field).slice(0, 1), ["sky-raider"]);
  assert.deepEqual(ids(setup.ai.hand), ["war-chant"]);
});

test("builds preset scenario decks without cards reserved in visible zones", () => {
  const setup = buildScenarioState(scenarioSetups.combo, {
    playerPreset: "balanced",
    aiPreset: "balanced"
  });
  const reserved = scenarioReservedIds(scenarioSetups.combo, "player");

  assert.equal(setup.player.deck.length, deckPresets.balanced.ids.length - reserved.length);
  reserved.forEach((id) => {
    const originalCount = deckPresets.balanced.ids.filter((cardId) => cardId === id).length;
    const reservedCount = reserved.filter((cardId) => cardId === id).length;
    const remainingCount = setup.player.deck.filter((card) => card.id === id).length;
    assert.equal(remainingCount, Math.max(0, originalCount - reservedCount));
  });
});
