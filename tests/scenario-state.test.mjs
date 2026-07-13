import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets, scenarioSetups } from "../src/data.js";
import { createDuelist } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { assertValidGameState } from "../src/game-engine.js";
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
  assert.deepEqual(ids(setup.ai.field).filter(Boolean), ["star-lancer", "sky-raider", "gale-mage"]);
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

test("protagonist comeback scenarios can preload lp graveyard and valid engine state", () => {
  const setup = buildScenarioState(scenarioSetups.protagonistComeback, {
    playerPreset: "protagonistComeback",
    aiPreset: "suppressionRival"
  });

  assert.equal(setup.player.lp, 900);
  assert.equal(setup.ai.lp, 3000);
  assert.deepEqual(ids(setup.player.hand), ["last-spark", "starwake-recall", "dawn-edge", "last-light-guard", "limit-break-oath"]);
  assert.deepEqual(ids(setup.player.grave), ["astral-comet-ace"]);
  assert.deepEqual(ids(setup.player.deck), ["spark-runner", "backlash-mirror", "star-shield"]);
  assert.deepEqual(ids(setup.ai.field).slice(0, 1), ["flare-titan"]);

  const uiState = {
    player: { ...createDuelist("player"), ...setup.player },
    ai: { ...createDuelist("ai"), ...setup.ai },
    turn: "player",
    phase: "main",
    gameEvents: []
  };
  assertValidGameState(buildEngineStateFromUiState(uiState));

  const challenge = buildScenarioState(scenarioSetups.protagonistComebackChallenge, {
    playerPreset: "protagonistComeback",
    aiPreset: "suppressionRival"
  });
  assert.equal(challenge.player.lp, 900);
  assert.equal(challenge.ai.lp, 3400);
  assert.deepEqual(ids(challenge.player.hand), ["dawn-edge", "last-spark", "starwake-recall", "last-light-guard", "limit-break-oath"]);
  assert.deepEqual(ids(challenge.player.grave), ["spark-runner", "astral-comet-ace"]);
  assert.deepEqual(ids(challenge.player.deck), ["battle-trance", "backlash-mirror", "dispelling-ray"]);
  assert.deepEqual(ids(challenge.ai.traps).slice(0, 1), ["mirror-snare"]);

  const challengeUiState = {
    player: { ...createDuelist("player"), ...challenge.player },
    ai: { ...createDuelist("ai"), ...challenge.ai },
    turn: "player",
    phase: "main",
    gameEvents: []
  };
  assertValidGameState(buildEngineStateFromUiState(challengeUiState));
});

test("scenario graveyard entries preserve configured historical monster state", () => {
  const setup = buildScenarioState(scenarioSetups.protagonistTrioOmega, {
    playerPreset: "protagonistTrioOmega",
    aiPreset: "trioOmegaRival"
  });
  const pawn = setup.player.grave.find((card) => card?.id === "trio-ember-pawn");

  assert.ok(pawn);
  assert.equal(pawn.mode, "defense");
  assert.equal(pawn.used, true);
  assert.equal(pawn.changedMode, true);
  assert.equal(pawn.tempAtk, 700);
  assert.equal(pawn.tempDef, -300);
  assert.equal(pawn.battleWear, 200);
});

test("protagonist ace evolution scenarios expose material and protection fixtures", () => {
  const evolution = buildScenarioState(scenarioSetups.protagonistAceEvolution, {
    playerPreset: "protagonistAceEvolution",
    aiPreset: "aceSuppressionRival"
  });
  assert.deepEqual(ids(evolution.player.field).slice(0, 2), ["ember-soul-initiate", "lumen-gearlet"]);
  assert.deepEqual(ids(evolution.player.hand), ["soulforge-ascent", "starwell-runner", "material-reclaim"]);
  assert.deepEqual(ids(evolution.player.deck), ["astral-forge-dragon", "ace-vow-guard", "battle-trance"]);
  assert.deepEqual(ids(evolution.ai.field).slice(0, 1), ["void-siege-breaker"]);

  const protection = buildScenarioState(scenarioSetups.protagonistAceProtection, {
    playerPreset: "protagonistAceEvolution",
    aiPreset: "aceSuppressionRival"
  });
  assert.deepEqual(ids(protection.player.field).slice(0, 1), ["astral-forge-dragon"]);
  assert.deepEqual(ids(protection.player.hand), ["ace-vow-guard", "battle-trance"]);
  assert.deepEqual(ids(protection.player.traps).slice(0, 1), ["last-light-guard"]);
  assert.deepEqual(ids(protection.ai.field).slice(0, 1), ["void-siege-breaker"]);
  assert.deepEqual(ids(protection.ai.hand), ["corebreak-edict"]);

  for (const setup of [evolution, protection]) {
    const uiState = {
      player: { ...createDuelist("player"), ...setup.player },
      ai: { ...createDuelist("ai"), ...setup.ai },
      turn: "player",
      phase: "main",
      gameEvents: []
    };
    assertValidGameState(buildEngineStateFromUiState(uiState));
  }
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
