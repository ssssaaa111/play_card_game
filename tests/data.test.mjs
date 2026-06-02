import test from "node:test";
import assert from "node:assert/strict";

import { aiProfiles, deckPresets, library, roleProfiles, scenarioSetups } from "../src/data.js";
import { getCardEffectDefinition } from "../src/game-engine.js";
import { spellDefinitions } from "../src/spells.js";
import { trapDefinitions } from "../src/traps.js";

const cardsById = new Map(library.map((card) => [card.id, card]));
const validTypes = new Set(["monster", "spell", "trap"]);
const validElements = new Set(["fire", "light", "wind", "shadow"]);

function assertKnownCardIds(ids = [], context) {
  ids.forEach((id) => {
    assert.ok(cardsById.has(id), `${context} references missing card id: ${id}`);
  });
}

test("card library has unique ids and required fields", () => {
  assert.equal(cardsById.size, library.length, "card ids should be unique");

  library.forEach((card) => {
    assert.ok(card.id, "card needs id");
    assert.ok(card.name, `${card.id} needs name`);
    assert.ok(validTypes.has(card.type), `${card.id} has invalid type`);
    assert.ok(card.text, `${card.id} needs visible text`);

    if (card.type === "monster") {
      assert.ok(validElements.has(card.element), `${card.id} has invalid element`);
      assert.equal(typeof card.atk, "number", `${card.id} needs numeric atk`);
      assert.equal(typeof card.def, "number", `${card.id} needs numeric def`);
      assert.equal(typeof card.stars, "number", `${card.id} needs numeric stars`);
    }

    if (card.type === "spell") {
      assert.ok(card.effect, `${card.id} spell needs effect key`);
    }

    if (card.type === "trap") {
      assert.ok(card.trigger, `${card.id} trap needs trigger key`);
    }
  });
});

test("spell cards are backed by spell metadata", () => {
  const spellCards = library.filter((card) => card.type === "spell");
  const effectsFromCards = new Set(spellCards.map((card) => card.effect));
  const validTargets = new Set(["ownMonster", "enemyMonster"]);
  const validTargetRules = new Set(["strongest"]);

  spellCards.forEach((card) => {
    const definition = spellDefinitions[card.effect];
    assert.ok(definition, `${card.id} references missing spell definition: ${card.effect}`);
    assert.ok(definition.caption, `${card.effect} needs a caption`);
    if (definition.target) {
      assert.ok(validTargets.has(definition.target), `${card.effect} has invalid target mode`);
    }
    if (definition.targetRule) {
      assert.ok(definition.target, `${card.effect} cannot declare targetRule without target`);
      assert.ok(validTargetRules.has(definition.targetRule), `${card.effect} has invalid target rule`);
    }
  });

  Object.keys(spellDefinitions).forEach((effect) => {
    assert.ok(effectsFromCards.has(effect), `spell definition has no card using it: ${effect}`);
  });
});

test("engine-backed targeted spells keep UI and rules targets aligned", () => {
  const expectedEngineTargets = {
    buff500: { player: "self", zone: "monsterZone", rule: "strongestAtk" },
    pierceLine: { player: "rival", zone: "monsterZone", rule: "strongestAtk" }
  };

  Object.entries(expectedEngineTargets).forEach(([effect, expected]) => {
    const uiDefinition = spellDefinitions[effect];
    const engineDefinition = getCardEffectDefinition(effect);

    assert.ok(uiDefinition, `${effect} needs UI spell metadata`);
    assert.ok(engineDefinition, `${effect} needs engine DSL metadata`);
    assert.equal(uiDefinition.targetRule, "strongest", `${effect} UI target rule should stay strongest`);
    assert.deepEqual(engineDefinition.target, expected, `${effect} engine target rule drifted from UI metadata`);
  });
});

test("trap cards are backed by trap metadata", () => {
  const trapCards = library.filter((card) => card.type === "trap");
  const triggersFromCards = new Set(trapCards.map((card) => card.trigger));
  const validEvents = new Set(["attack", "direct", "summon"]);

  trapCards.forEach((card) => {
    const definition = trapDefinitions[card.trigger];
    assert.ok(definition, `${card.id} references missing trap definition: ${card.trigger}`);
    const events = definition.events || [definition.event];
    assert.ok(events.every((event) => validEvents.has(event)), `${card.trigger} has invalid trap event`);
    assert.ok(definition.caption, `${card.trigger} needs caption`);
    assert.ok(definition.triggerText, `${card.trigger} needs trigger text`);
    assert.equal(typeof definition.cancelsEvent, "boolean", `${card.trigger} needs cancelsEvent flag`);
    assert.equal(typeof definition.consumesAttack, "boolean", `${card.trigger} needs consumesAttack flag`);
  });

  Object.keys(trapDefinitions).forEach((trigger) => {
    assert.ok(triggersFromCards.has(trigger), `trap definition has no card using it: ${trigger}`);
  });
});

test("deck presets reference only known cards and have enough cards", () => {
  Object.entries(deckPresets).forEach(([key, preset]) => {
    assert.ok(preset.label, `${key} needs label`);
    assert.ok(Array.isArray(preset.ids), `${key} needs card ids`);
    assert.ok(preset.ids.length >= 40, `${key} should have at least 40 cards`);
    assertKnownCardIds(preset.ids, `deckPresets.${key}.ids`);
  });
});

test("scenario setups reference only known cards", () => {
  const cardListKeys = ["playerHand", "aiHand", "playerField", "aiField", "playerTraps", "aiTraps"];

  Object.entries(scenarioSetups).forEach(([key, scenario]) => {
    assert.ok(scenario.label, `${key} needs label`);
    assert.ok(scenario.text, `${key} needs text`);

    cardListKeys.forEach((listKey) => {
      assertKnownCardIds(scenario[listKey], `scenarioSetups.${key}.${listKey}`);
    });
  });
});

test("role and AI profile presets are complete", () => {
  Object.entries(roleProfiles).forEach(([key, profile]) => {
    assert.ok(profile.name, `${key} role needs name`);
    assert.ok(profile.skill, `${key} role needs skill`);
    assert.ok(profile.text, `${key} role needs text`);
    assert.ok(["draw", "buff", "burn", "shield"].includes(profile.kind), `${key} role has invalid kind`);
  });

  Object.entries(aiProfiles).forEach(([key, profile]) => {
    assert.ok(profile.label, `${key} AI needs label`);
    assert.ok(deckPresets[profile.deckPreset], `${key} AI references missing deck preset`);
    assert.ok(profile.profile?.name, `${key} AI needs character profile`);
  });
});
