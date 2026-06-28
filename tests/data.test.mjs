import test from "node:test";
import assert from "node:assert/strict";

import { aiProfiles, deckPresets, library, roleProfiles, scenarioSetups } from "../src/data.js";
import { canDispatchSpellFromUiState, canDispatchSummonEffectFromUiState, canDispatchTrapFromUiState } from "../src/engine-adapter.js";
import { getCardEffectDefinition } from "../src/game-engine.js";
import { spellDefinitions } from "../src/spells.js";
import { trapDefinitions } from "../src/traps.js";

const cardsById = new Map(library.map((card) => [card.id, card]));
const validTypes = new Set(["monster", "spell", "trap"]);
const validElements = new Set(["fire", "light", "wind", "shadow"]);

function assertKnownCardIds(ids = [], context) {
  ids.forEach((entry) => {
    const id = typeof entry === "string" ? entry : entry?.id;
    assert.ok(cardsById.has(id), `${context} references missing card id: ${id}`);
    if (entry && typeof entry === "object" && entry.mode !== undefined) {
      assert.ok(["attack", "defense"].includes(entry.mode), `${context}.${id} has invalid mode: ${entry.mode}`);
    }
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

test("player-facing card and scenario copy is localized", () => {
  const englishWord = /[A-Za-z]{3,}/;

  library.forEach((card) => {
    assert.doesNotMatch(card.name, englishWord, `${card.id} name should be localized`);
    assert.doesNotMatch(card.text, englishWord, `${card.id} text should be localized`);
  });

  Object.entries(scenarioSetups).forEach(([key, scenario]) => {
    assert.doesNotMatch(scenario.label, englishWord, `${key} label should be localized`);
    assert.doesNotMatch(scenario.text || "", englishWord, `${key} text should be localized`);
    assert.doesNotMatch(scenario.goal || "", englishWord, `${key} goal should be localized`);
  });
});

test("spell cards are backed by spell metadata", () => {
  const spellCards = library.filter((card) => card.type === "spell");
  const effectsFromCards = new Set(spellCards.map((card) => card.effect));
  const validTargets = new Set(["ownMonster", "enemyMonster", "enemySpellTrap"]);
  const validTargetRules = new Set(["strongest"]);

  spellCards.forEach((card) => {
    const definition = spellDefinitions[card.effect];
    assert.ok(definition, `${card.id} references missing spell definition: ${card.effect}`);
    assert.ok(getCardEffectDefinition(card.effect), `${card.id} spell effect must have engine DSL metadata: ${card.effect}`);
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
    pierceLine: { player: "rival", zone: "monsterZone", rule: "strongestAtk" },
    soulResonance: { player: "self", zone: "monsterZone", rule: "strongestAtk" }
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

test("spell/trap removal card is backed by engine and UI metadata", () => {
  const card = cardsById.get("dispelling-ray");
  const uiDefinition = spellDefinitions.destroySpellTrap;
  const engineDefinition = getCardEffectDefinition("destroySpellTrap");

  assert.ok(card, "missing dispelling-ray card");
  assert.equal(card.type, "spell");
  assert.equal(card.effect, "destroySpellTrap");
  assert.equal(uiDefinition.target, "enemySpellTrap");
  assert.deepEqual(engineDefinition.target, { player: "rival", zone: "spellTrapZone" });
  assert.deepEqual(engineDefinition.operations, [{ op: "destroyCard", cardId: "$action.targetCardId" }]);
});

test("trap cards are backed by trap metadata", () => {
  const trapCards = library.filter((card) => card.type === "trap");
  const triggersFromCards = new Set(trapCards.map((card) => card.trigger));
  const validEvents = new Set(["attack", "direct", "summon", "chain"]);

  trapCards.forEach((card) => {
    const definition = trapDefinitions[card.trigger];
    assert.ok(definition, `${card.id} references missing trap definition: ${card.trigger}`);
    const events = definition.events || [definition.event];
    assert.ok(events.every((event) => validEvents.has(event)), `${card.trigger} has invalid trap event`);
    assert.ok(definition.caption, `${card.trigger} needs caption`);
    assert.ok(definition.triggerText, `${card.trigger} needs trigger text`);
    assert.equal(typeof definition.cancelsEvent, "boolean", `${card.trigger} needs cancelsEvent flag`);
    assert.equal(typeof definition.consumesAttack, "boolean", `${card.trigger} needs consumesAttack flag`);
    assert.ok(getCardEffectDefinition(card.trigger), `${card.id} trap trigger must have engine DSL metadata: ${card.trigger}`);
  });

  Object.keys(trapDefinitions).forEach((trigger) => {
    assert.ok(triggersFromCards.has(trigger), `trap definition has no card using it: ${trigger}`);
  });
});

test("monster triggered effects are backed by engine DSL metadata", () => {
  library
    .filter((card) => card.type === "monster")
    .forEach((card) => {
      if (card.onSummon) {
        assert.ok(getCardEffectDefinition(card.onSummon), `${card.id} onSummon must have engine DSL metadata: ${card.onSummon}`);
      }
      if (card.afterAttack) {
        assert.ok(getCardEffectDefinition(card.afterAttack), `${card.id} afterAttack must have engine DSL metadata: ${card.afterAttack}`);
      }
    });
});

test("current card library effects are dispatchable through the engine adapter", () => {
  library.forEach((card) => {
    if (card.type === "spell") {
      assert.equal(canDispatchSpellFromUiState(card), true, `${card.id} spell should dispatch through engine`);
    }
    if (card.type === "trap") {
      assert.equal(canDispatchTrapFromUiState(card), true, `${card.id} trap should dispatch through engine`);
    }
    if (card.type === "monster" && card.onSummon) {
      assert.equal(canDispatchSummonEffectFromUiState(card), true, `${card.id} onSummon should dispatch through engine`);
    }
  });
});

test("equipment starter pack has rule-backed cards", () => {
  const expectedIds = [
    "nova-squire",
    "aegis-mender",
    "blade-sigil",
    "aegis-plate",
    "prism-drive",
    "overclock-core"
  ];
  const cardsById = new Map(library.map((card) => [card.id, card]));
  expectedIds.forEach((id) => assert.ok(cardsById.has(id), `missing new card ${id}`));

  assert.equal(cardsById.get("aegis-mender").onSummon, "shield400");
  [
    ["blade-sigil", "equipBlade", "tempAtk", 300],
    ["aegis-plate", "equipAegis", "tempDef", 500],
    ["prism-drive", "equipPrism", "tempAtk", 200],
    ["overclock-core", "equipOverclock", "tempAtk", 600]
  ].forEach(([cardId, effectId, stat, amount]) => {
    const card = cardsById.get(cardId);
    const effect = getCardEffectDefinition(effectId);
    assert.equal(card.type, "spell", `${cardId} should be a spell`);
    assert.equal(card.effect, effectId, `${cardId} should reference ${effectId}`);
    assert.equal(effect.duration, "continuous", `${effectId} should be continuous`);
    assert.deepEqual(effect.target, { player: "self", zone: "monsterZone" }, `${effectId} should target own monsters`);
    assert.ok(effect.operations.some((operation) =>
      operation.op === "modifyStat" &&
      operation.stat === stat &&
      operation.amount === amount
    ), `${effectId} should modify ${stat} by ${amount}`);
  });
});

test("basic star soul expansion pack has rule-backed cards and a preset deck", () => {
  const expectedIds = [
    "star-soul-apprentice",
    "rift-bulwark",
    "soul-resonance",
    "soul-parry"
  ];
  expectedIds.forEach((id) => assert.ok(cardsById.has(id), `missing basic expansion card ${id}`));

  assert.equal(cardsById.get("star-soul-apprentice").onSummon, "starSoulSurvey");
  assert.equal(cardsById.get("rift-bulwark").onSummon, "riftShelter");
  assert.equal(cardsById.get("soul-resonance").effect, "soulResonance");
  assert.equal(cardsById.get("soul-parry").trigger, "soulParry");

  assert.deepEqual(getCardEffectDefinition("starSoulSurvey").operations, [{ op: "drawCards", player: "self", count: 1 }]);
  assert.deepEqual(getCardEffectDefinition("riftShelter").operations, [{ op: "gainShield", player: "self", amount: 300 }]);
  assert.deepEqual(getCardEffectDefinition("soulResonance").target, { player: "self", zone: "monsterZone", rule: "strongestAtk" });
  assert.deepEqual(getCardEffectDefinition("soulParry").operations, [
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -300 },
    { op: "gainShield", player: "self", amount: 300 }
  ]);

  assert.ok(deckPresets.basicExpansion, "basic expansion preset should exist");
  assert.ok(deckPresets.basicExpansion.ids.includes("star-soul-apprentice"));
  assert.ok(deckPresets.basicExpansion.ids.includes("soul-resonance"));
  assert.ok(deckPresets.basicExpansion.ids.includes("soul-parry"));
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
  const cardListKeys = ["playerDeck", "playerHand", "aiDeck", "aiHand", "playerField", "aiField", "playerTraps", "aiTraps"];

  Object.entries(scenarioSetups).forEach(([key, scenario]) => {
    assert.ok(scenario.label, `${key} needs label`);
    assert.ok(scenario.text, `${key} needs text`);

    cardListKeys.forEach((listKey) => {
      assertKnownCardIds(scenario[listKey], `scenarioSetups.${key}.${listKey}`);
    });
  });
});

test("direct trap scenario uses a deterministic non-damage AI draw", () => {
  assert.deepEqual(scenarioSetups.directTrap.aiDeck, ["guard-sigil"]);
  assert.deepEqual(scenarioSetups.directTrap.aiField, ["star-lancer", "sky-raider", "gale-mage"]);
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
