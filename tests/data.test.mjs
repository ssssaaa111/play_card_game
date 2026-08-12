import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { aiProfiles, deckPresets, library, monsterAssets, roleProfiles, scenarioSetups } from "../src/data.js";
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

function assertLocalizedTextList(list = [], context) {
  const englishWord = /[A-Za-z]{3,}/;
  assert.ok(Array.isArray(list), `${context} should be an array`);
  assert.ok(list.length <= 5, `${context} should stay concise`);
  list.forEach((entry, index) => {
    assert.equal(typeof entry, "string", `${context}.${index} should be text`);
    assert.ok(entry.trim(), `${context}.${index} should not be empty`);
    assert.doesNotMatch(entry, englishWord, `${context}.${index} should be localized`);
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
      if (card.tributeCost !== undefined) {
        assert.equal(Number.isInteger(card.tributeCost), true, `${card.id} tributeCost should be an integer`);
        assert.ok(card.tributeCost > 0, `${card.id} tributeCost should be positive`);
      }
    }

    if (card.type === "spell") {
      assert.ok(card.effect, `${card.id} spell needs effect key`);
    }

    if (card.type === "trap") {
      assert.ok(card.trigger, `${card.id} trap needs trigger key`);
    }
  });
});

test("fusion cards declare known materials and result from unified card data", () => {
  const fusionSpell = cardsById.get("starforge-fusion");
  const fusionResult = cardsById.get("flare-gale-archon");
  const defensiveResult = cardsById.get("tempest-aegis-archon");

  assert.equal(fusionSpell.type, "spell");
  assert.equal(fusionSpell.effect, "fusionSummon");
  assert.equal(fusionSpell.fusion.result, "flare-gale-archon");
  assert.deepEqual(fusionSpell.fusion.materials, ["ember-drake", "gale-mage"]);
  assert.deepEqual(fusionSpell.fusion.options.map((option) => option.result), ["flare-gale-archon", "tempest-aegis-archon"]);
  assert.equal(fusionResult.type, "monster");
  assert.equal(defensiveResult.type, "monster");
  assert.equal(defensiveResult.onSummon, "shield400");
  fusionSpell.fusion.materials.forEach((id) => {
    assert.equal(cardsById.get(id)?.type, "monster", `fusion material should be a monster: ${id}`);
  });
});

test("split token cards declare generated token data from unified card definitions", () => {
  const splitSpell = cardsById.get("spark-split");
  const token = cardsById.get("spark-fragment-token");

  assert.equal(splitSpell.type, "spell");
  assert.equal(splitSpell.effect, "splitToken");
  assert.equal(token.type, "monster");
  assert.equal(token.token, true);
  assert.equal(token.atk, 500);
  assert.equal(token.def, 500);
  assert.deepEqual(scenarioSetups.splitToken.playerHand, ["spark-split", "war-chant"]);
  assert.deepEqual(scenarioSetups.splitToken.playerField, ["spark-runner"]);
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
    (scenario.objectives || []).forEach((entry, index) => {
      assert.doesNotMatch(entry, englishWord, `${key}.objectives.${index} should be localized`);
    });
    (scenario.hints || []).forEach((entry, index) => {
      assert.doesNotMatch(entry, englishWord, `${key}.hints.${index} should be localized`);
    });
    (scenario.recommendedLine || []).forEach((entry, index) => {
      assert.doesNotMatch(entry, englishWord, `${key}.recommendedLine.${index} should be localized`);
    });
  });
});

test("featured scenario metadata describes difficulty objectives and hints", () => {
  const validDifficulties = new Set(["demo", "challenge"]);
  Object.entries(scenarioSetups).forEach(([key, scenario]) => {
    if (scenario.difficulty) {
      assert.ok(validDifficulties.has(scenario.difficulty), `${key} has invalid difficulty`);
    }
    if (scenario.objectives) assertLocalizedTextList(scenario.objectives, `${key}.objectives`);
    if (scenario.hints) assertLocalizedTextList(scenario.hints, `${key}.hints`);
    if (scenario.recommendedLine) assertLocalizedTextList(scenario.recommendedLine, `${key}.recommendedLine`);
  });

  ["protagonistComeback", "protagonistAceEvolution", "protagonistAceProtection", "expansionSummon", "expansionParry"].forEach((key) => {
    const scenario = scenarioSetups[key];
    assert.equal(scenario.difficulty, "demo", `${key} should be a demo scenario`);
    assertLocalizedTextList(scenario.objectives, `${key}.objectives`);
    assert.ok(scenario.objectives.length >= 2 && scenario.objectives.length <= 4, `${key} should have two to four objectives`);
  });

  const challenge = scenarioSetups.protagonistComebackChallenge;
  assert.equal(challenge.difficulty, "challenge");
  assertLocalizedTextList(challenge.objectives, "protagonistComebackChallenge.objectives");
  assertLocalizedTextList(challenge.hints, "protagonistComebackChallenge.hints");
  assertLocalizedTextList(challenge.recommendedLine, "protagonistComebackChallenge.recommendedLine");
  assert.ok(challenge.objectives.length >= 3 && challenge.objectives.length <= 4);
  assert.ok(challenge.hints.length >= 2);
});

test("spell cards are backed by spell metadata", () => {
  const spellCards = library.filter((card) => card.type === "spell");
  const effectsFromCards = new Set(spellCards.map((card) => card.effect));
  const validTargets = new Set(["ownMonster", "ownGraveMonster", "ownGraveCard", "enemyMonster", "enemySpellTrap"]);
  const validTargetRules = new Set(["strongest", "notSource"]);

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

test("every engine-targeted library spell exposes the matching UI target mode", () => {
  const expectedUiTarget = (target = {}) => {
    if (target.player === "self" && target.zone === "monsterZone") return "ownMonster";
    if (target.player === "rival" && target.zone === "monsterZone") return "enemyMonster";
    if (target.player === "self" && target.zone === "grave") {
      return target.cardType === "monster" ? "ownGraveMonster" : "ownGraveCard";
    }
    if (target.player === "rival" && target.zone === "spellTrapZone") return "enemySpellTrap";
    return "";
  };
  const expectedUiRule = (target = {}) => target.rule === "strongestAtk"
    ? "strongest"
    : target.rule === "notSource"
      ? "notSource"
      : "";
  const targetedEffects = new Set(
    library
      .filter((card) => card.type === "spell" && getCardEffectDefinition(card.effect)?.target)
      .map((card) => card.effect)
  );

  targetedEffects.forEach((effect) => {
    const engineTarget = getCardEffectDefinition(effect).target;
    const uiDefinition = spellDefinitions[effect];
    assert.equal(uiDefinition?.target, expectedUiTarget(engineTarget), `${effect} target mode drifted`);
    assert.equal(uiDefinition?.targetRule || "", expectedUiRule(engineTarget), `${effect} target rule drifted`);
  });
});

test("grave-return exposes its engine target instead of silently choosing the first grave card", () => {
  const uiDefinition = spellDefinitions.graveReturn;
  const engineDefinition = getCardEffectDefinition("graveReturn");

  assert.equal(uiDefinition.target, "ownGraveCard");
  assert.equal(uiDefinition.targetRule, "notSource");
  assert.deepEqual(engineDefinition.target, { player: "self", zone: "grave", rule: "notSource" });
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

test("celestial origin dragon exposes divine target resistance in unified card data", () => {
  const card = cardsById.get("celestial-origin-dragon");

  assert.equal(card.type, "monster");
  assert.deepEqual(card.targetResistance, { type: "divineTarget" });
  assert.match(card.text, /神格抗性/);
  assert.match(card.summary, /免疫对手普通指定效果/);
});

test("divine resistance scenario keeps player setup deterministic", () => {
  const scenario = scenarioSetups.divineResistance;

  assert.equal(scenario.difficulty, "demo");
  assert.deepEqual(scenario.playerHand, ["pierce-line", "war-chant"]);
  assert.deepEqual(scenario.playerField, ["star-lancer"]);
  assert.deepEqual(scenario.playerDeck, ["solar-knight"]);
  assert.deepEqual(scenario.aiField, ["celestial-origin-dragon", "starfall-colossus"]);
  assert.deepEqual(scenario.aiHand, []);
  assert.deepEqual(scenario.aiDeck, []);
  assert.ok(scenario.objectives.some((entry) => entry.includes("创星神龙")));
  assert.ok(scenario.hints.some((entry) => entry.includes("指定目标")));
});

test("divine break card and scenario expose a narrow resistance bypass", () => {
  const card = cardsById.get("godbreaker-spear");
  const scenario = scenarioSetups.divineBreak;

  assert.equal(card.effect, "pierceLine");
  assert.equal(card.targetResistanceBypass, "divineTarget");
  assert.match(card.text, /无视神格目标抗性/);
  assert.match(card.summary, /越过神格目标抗性/);
  assert.equal(scenario.difficulty, "demo");
  assert.deepEqual(scenario.playerHand, ["godbreaker-spear", "pierce-line"]);
  assert.deepEqual(scenario.playerField, ["star-lancer"]);
  assert.deepEqual(scenario.aiField, ["celestial-origin-dragon", "starfall-colossus"]);
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

test("monster cards have existing art assets", () => {
  library
    .filter((card) => card.type === "monster")
    .forEach((card) => {
      const asset = monsterAssets[card.id];
      assert.ok(asset, `${card.id} needs a monster art asset`);
      assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), `${card.id} asset path should exist: ${asset}`);
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

test("protagonist comeback pack has rule-backed cards decks and scenarios", () => {
  const expectedIds = [
    "spark-runner",
    "astral-comet-ace",
    "last-spark",
    "starwake-recall",
    "dawn-edge",
    "limit-break-oath",
    "last-light-guard",
    "backlash-mirror"
  ];
  expectedIds.forEach((id) => assert.ok(cardsById.has(id), `missing protagonist comeback card ${id}`));

  assert.equal(cardsById.get("spark-runner").onSummon, "draw1");
  assert.equal(cardsById.get("astral-comet-ace").afterAttack, "grow200");
  assert.equal(cardsById.get("last-spark").effect, "comebackDraw");
  assert.equal(cardsById.get("starwake-recall").effect, "graveRevive");
  assert.equal(cardsById.get("dawn-edge").effect, "dawnEdge");
  assert.equal(cardsById.get("limit-break-oath").effect, "lastStandSurge");
  assert.equal(cardsById.get("last-light-guard").trigger, "attackNegate");
  assert.equal(cardsById.get("backlash-mirror").trigger, "directRebound");

  assert.deepEqual(getCardEffectDefinition("comebackDraw").requirements, [
    { type: "minDeckCount", player: "self", count: 2 }
  ]);
  assert.deepEqual(getCardEffectDefinition("graveRevive").target, { player: "self", zone: "grave", cardType: "monster" });
  assert.deepEqual(getCardEffectDefinition("dawnEdge").operations, [
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 900 }
  ]);
  assert.deepEqual(getCardEffectDefinition("lastStandSurge").requirements, [
    { type: "maxLp", player: "self", amount: 1500 }
  ]);

  assert.ok(deckPresets.protagonistComeback.ids.includes("last-spark"));
  assert.ok(deckPresets.protagonistComeback.ids.includes("starwake-recall"));
  assert.ok(deckPresets.suppressionRival.ids.includes("flare-titan"));
  assert.ok(deckPresets.suppressionRival.ids.includes("summon-flare"));
  assert.deepEqual(scenarioSetups.protagonistComeback.playerGrave, ["astral-comet-ace"]);
  assert.equal(scenarioSetups.protagonistComeback.playerLp, 900);
  assert.deepEqual(scenarioSetups.protagonistComebackChallenge.playerGrave, ["spark-runner", "astral-comet-ace"]);
  assert.deepEqual(scenarioSetups.protagonistComebackChallenge.aiTraps, ["mirror-snare"]);
  assert.equal(scenarioSetups.protagonistComebackChallenge.playerDeck[2], "dispelling-ray");
});

test("protagonist ace evolution pack has rule-backed cards decks and scenarios", () => {
  const expectedIds = [
    "ember-soul-initiate",
    "lumen-gearlet",
    "starwell-runner",
    "astral-forge-dragon",
    "void-siege-breaker",
    "soulforge-ascent",
    "material-reclaim",
    "corebreak-edict",
    "ace-vow-guard"
  ];
  expectedIds.forEach((id) => assert.ok(cardsById.has(id), `missing protagonist ace evolution card ${id}`));

  assert.equal(cardsById.get("starwell-runner").onSummon, "draw1");
  assert.equal(cardsById.get("astral-forge-dragon").afterAttack, "grow200");
  assert.equal(cardsById.get("soulforge-ascent").effect, "aceEvolution");
  assert.equal(cardsById.get("material-reclaim").effect, "graveReturn");
  assert.equal(cardsById.get("corebreak-edict").effect, "aceCrackdown");
  assert.equal(cardsById.get("ace-vow-guard").trigger, "aceGuard");

  assert.deepEqual(getCardEffectDefinition("aceEvolution").requirements, [
    { type: "requireFieldCards", player: "self", materials: ["ember-soul-initiate", "lumen-gearlet"] }
  ]);
  assert.deepEqual(getCardEffectDefinition("aceEvolution").operations, [
    { op: "sendMaterialsToGrave", player: "self", materials: ["ember-soul-initiate", "lumen-gearlet"] },
    { op: "specialSummonFromDeckOrHand", player: "self", templateId: "astral-forge-dragon" },
    { op: "modifyStat", cardId: { playerId: "$action.rivalId", zone: "monsterZone" }, stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: { playerId: "$action.rivalId", zone: "monsterZone" }, stat: "tempDef", amount: -500 },
    { op: "gainShield", player: "self", amount: 300 }
  ]);
  assert.deepEqual(getCardEffectDefinition("aceCrackdown").target, { player: "rival", zone: "monsterZone", rule: "strongestAtk" });
  assert.deepEqual(getCardEffectDefinition("aceGuard").operations, [
    { op: "negateEffect", targetEffectId: "$action.targetEffectId" },
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "strongestAtk" }, stat: "tempAtk", amount: 900 }
  ]);

  assert.ok(deckPresets.protagonistAceEvolution.ids.includes("soulforge-ascent"));
  assert.ok(deckPresets.protagonistAceEvolution.ids.includes("astral-forge-dragon"));
  assert.ok(deckPresets.protagonistAceEvolution.ids.includes("ace-vow-guard"));
  assert.ok(deckPresets.aceSuppressionRival.ids.includes("void-siege-breaker"));
  assert.ok(deckPresets.aceSuppressionRival.ids.includes("corebreak-edict"));
  assert.deepEqual(scenarioSetups.protagonistAceEvolution.playerField, ["ember-soul-initiate", "lumen-gearlet"]);
  assert.equal(scenarioSetups.protagonistAceEvolution.playerHand[0], "soulforge-ascent");
  assert.equal(scenarioSetups.protagonistAceEvolution.playerDeck[0], "astral-forge-dragon");
  assert.deepEqual(scenarioSetups.protagonistAceProtection.playerField, ["astral-forge-dragon"]);
  assert.ok(scenarioSetups.protagonistAceProtection.playerHand.includes("ace-vow-guard"));
  assert.ok(scenarioSetups.protagonistAceProtection.aiHand.includes("corebreak-edict"));
});

test("fusion summon scenario keeps materials on field and result in deck", () => {
  assert.deepEqual(scenarioSetups.fusionSummon.playerField, ["ember-drake", "gale-mage"]);
  assert.equal(scenarioSetups.fusionSummon.playerHand[0], "starforge-fusion");
  assert.equal(scenarioSetups.fusionSummon.playerDeck[1], "flare-gale-archon");
  assert.equal(cardsById.get("starforge-fusion").text.includes(cardsById.get("flare-gale-archon").name), true);
});

test("mixed fusion scenario keeps one material in hand without changing the recipe", () => {
  const scenario = scenarioSetups.fusionMixedMaterials;
  const fusion = cardsById.get("starforge-fusion");

  assert.deepEqual(fusion.fusion.materials, ["ember-drake", "gale-mage"]);
  assert.match(fusion.text, /手牌或场上/);
  assert.deepEqual(scenario.playerHand, ["starforge-fusion", "gale-mage", "war-chant"]);
  assert.deepEqual(scenario.playerField, ["ember-drake"]);
  assert.equal(scenario.playerDeck[1], "flare-gale-archon");
  assert.ok(scenario.hints.some((entry) => entry.includes("手牌或我方场上")));
});

test("fusion result choice scenario preserves the opening order and exposes both results", () => {
  const scenario = scenarioSetups.fusionResultChoice;

  assert.deepEqual(scenario.playerHand, ["starforge-fusion", "gale-mage", "war-chant"]);
  assert.deepEqual(scenario.playerField, ["ember-drake"]);
  assert.deepEqual(scenario.playerDeck, ["solar-knight", "flare-gale-archon", "tempest-aegis-archon"]);
  assert.ok(scenario.objectives.some((entry) => entry.includes("岚耀守星者")));
  assert.ok(scenario.recommendedLine.some((entry) => entry.includes("岚耀守星者")));
});

test("AI fusion planning scenario exposes mixed materials and both legal results", () => {
  const scenario = scenarioSetups.aiFusionPlanning;

  assert.equal(scenario.aiLp, 1200);
  assert.deepEqual(scenario.aiHand, ["starforge-fusion", "gale-mage"]);
  assert.deepEqual(scenario.aiField, ["ember-drake"]);
  assert.deepEqual(scenario.aiDeck.slice(1), ["flare-gale-archon", "tempest-aegis-archon"]);
});

test("player counter chain scenario exposes a deterministic two-link response", () => {
  const scenario = scenarioSetups.playerCounterChain;

  assert.deepEqual(scenario.playerField, ["star-lancer"]);
  assert.deepEqual(scenario.playerTraps, ["chain-nullifier"]);
  assert.deepEqual(scenario.aiField, ["gale-mage"]);
  assert.deepEqual(scenario.aiTraps, ["mirror-snare"]);
  assert.ok(scenario.objectives.some((entry) => entry.includes("CL1")));
  assert.ok(scenario.hints.some((entry) => entry.includes("后进先出")));
});

test("triple counter chain scenario exposes three deterministic links", () => {
  const scenario = scenarioSetups.tripleCounterChain;

  assert.deepEqual(scenario.playerField, ["gale-mage"]);
  assert.deepEqual(scenario.playerTraps, ["counter-array", "chain-nullifier"]);
  assert.deepEqual(scenario.aiField, ["star-lancer"]);
  assert.deepEqual(scenario.aiTraps, ["chain-nullifier"]);
  assert.ok(scenario.objectives.some((entry) => entry.includes("CL3")));
  assert.ok(scenario.hints.some((entry) => entry.includes("CL3 → CL2 → CL1")));
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
  const cardListKeys = ["playerDeck", "playerHand", "playerGrave", "aiDeck", "aiHand", "aiGrave", "playerField", "aiField", "playerTraps", "aiTraps"];

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
