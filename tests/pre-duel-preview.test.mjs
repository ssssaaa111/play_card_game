import test from "node:test";
import assert from "node:assert/strict";

import { characterProfiles, deckPresets, scenarioSetups } from "../src/data.js";
import { cardDefinitionById, cardDetailViewModel } from "../src/card-detail.js";
import { buildPreDuelPreview, compactPreviewCards, previewDeckIdsForScenario } from "../src/pre-duel-preview.js";

const challengeId = "protagonistComebackChallenge";
const challenge = scenarioSetups[challengeId];

test("scenario data provides objectives hints and recommended line for pre-duel reading", () => {
  assert.ok(challenge, "challenge scenario should exist");
  assert.ok(challenge.objectives.length >= 3, "challenge should expose objectives");
  assert.ok(challenge.hints.length >= 2, "challenge should expose hints");
  assert.ok(challenge.recommendedLine.length >= 3, "challenge should expose a recommended line");
});

test("pre-duel preview reads own cards from scenario initialization data", () => {
  const preview = buildPreDuelPreview({
    scenarioId: challengeId,
    scenario: challenge,
    playerPreset: "protagonistComeback",
    playerProfile: characterProfiles.player
  });

  assert.deepEqual(
    preview.deckCards.filter((entry) => entry.zone === "hand").map((entry) => entry.id),
    challenge.playerHand,
    "preview should preserve scenario starting hand order"
  );
  assert.deepEqual(
    preview.deckCards.filter((entry) => entry.zone === "field").map((entry) => entry.id),
    challenge.playerField,
    "preview should include scenario starting field"
  );
  assert.deepEqual(
    preview.deckCards.filter((entry) => entry.zone === "grave").map((entry) => entry.id),
    challenge.playerGrave,
    "preview should include public own grave cards"
  );
  assert.deepEqual(
    preview.deckCards.filter((entry) => entry.zone === "deck").map((entry) => entry.id),
    challenge.playerDeck,
    "preview should preserve explicit scenario deck order"
  );
  assert.deepEqual(
    previewDeckIdsForScenario({ scenario: challenge, owner: "player", preset: "protagonistComeback" }),
    challenge.playerDeck,
    "deck id helper should read the explicit scenario deck"
  );
});

test("pre-duel card details come from the unified card definition", () => {
  const preview = buildPreDuelPreview({
    scenarioId: challengeId,
    scenario: challenge,
    playerPreset: "protagonistComeback"
  });
  const entry = preview.deckCards.find((card) => card.id === "dawn-edge");
  const definition = cardDefinitionById("dawn-edge");
  const detail = cardDetailViewModel(entry.id);

  assert.ok(entry, "preview should include dawn-edge");
  assert.equal(detail.card, definition, "detail view model should resolve the shared definition object");
  assert.equal(detail.name, definition.name);
  assert.equal(detail.effectText, definition.text);
  assert.equal(entry.summary, definition.summary || detail.rule || definition.text);
});

test("pre-duel preview exposes tribute requirements from unified card definitions", () => {
  const preview = buildPreDuelPreview({
    scenarioId: "tributeSummonDouble",
    scenario: scenarioSetups.tributeSummonDouble,
    playerPreset: "balanced"
  });
  const entry = preview.deckCards.find((card) => card.id === "starfall-colossus");
  const definition = cardDefinitionById("starfall-colossus");
  const detail = cardDetailViewModel("starfall-colossus");

  assert.ok(entry, "preview should include the two-tribute monster");
  assert.equal(detail.card, definition);
  assert.equal(entry.summonRequirement, detail.summonRequirement);
  assert.match(entry.summary, /2/);
});

test("pre-duel display cards merge duplicates without changing raw preview order", () => {
  const scenario = {
    ...challenge,
    playerHand: ["dawn-edge", "dawn-edge"],
    playerField: [],
    playerTraps: [],
    playerGrave: ["spark-runner"],
    playerDeck: ["battle-trance", "dawn-edge", "battle-trance"]
  };
  const preview = buildPreDuelPreview({
    scenarioId: "duplicatePreview",
    scenario,
    playerPreset: "protagonistComeback"
  });

  assert.deepEqual(
    preview.deckCards.map((entry) => entry.id),
    ["dawn-edge", "dawn-edge", "spark-runner", "battle-trance", "dawn-edge", "battle-trance"],
    "raw preview should keep the scenario initialization order"
  );
  assert.deepEqual(
    preview.displayDeckCards.map((entry) => [entry.id, entry.count]),
    [["dawn-edge", 3], ["spark-runner", 1], ["battle-trance", 2]],
    "display preview should merge duplicate card ids"
  );
  assert.equal(preview.displayDeckCards[0].zoneSummary, "起手 / 卡组");
  assert.deepEqual(compactPreviewCards(preview.deckCards).map((entry) => entry.id), preview.displayDeckCards.map((entry) => entry.id));
});

test("pre-duel preview does not change initial order or victory route data", () => {
  const before = {
    goal: challenge.goal,
    playerHand: [...challenge.playerHand],
    playerDeck: [...challenge.playerDeck],
    playerField: [...challenge.playerField],
    playerGrave: [...challenge.playerGrave],
    recommendedLine: [...challenge.recommendedLine]
  };

  const preview = buildPreDuelPreview({
    scenarioId: challengeId,
    scenario: challenge,
    playerPreset: "protagonistComeback"
  });

  assert.deepEqual(challenge.playerHand, before.playerHand);
  assert.deepEqual(challenge.playerDeck, before.playerDeck);
  assert.deepEqual(challenge.playerField, before.playerField);
  assert.deepEqual(challenge.playerGrave, before.playerGrave);
  assert.deepEqual(challenge.recommendedLine, before.recommendedLine);
  assert.equal(challenge.goal, before.goal);
  assert.deepEqual(preview.recommendedLine, before.recommendedLine);
});

test("pre-duel preview does not edit card effects", () => {
  const definition = cardDefinitionById("dawn-edge");
  const before = { effect: definition.effect, text: definition.text };

  buildPreDuelPreview({
    scenarioId: challengeId,
    scenario: challenge,
    playerPreset: "protagonistComeback"
  });

  assert.equal(cardDefinitionById("dawn-edge").effect, before.effect);
  assert.equal(cardDefinitionById("dawn-edge").text, before.text);
});

test("pre-duel preview resolves a custom deck when selected", () => {
  const customDecks = [
    { id: "custom:preview", name: "预览卡组", ids: ["ember-drake", "ember-drake", "seer-call"] }
  ];
  const preview = buildPreDuelPreview({
    scenarioId: "normal",
    scenario: {},
    playerPreset: "custom:preview",
    customDecks
  });
  const deckIds = preview.deckCards.filter((entry) => entry.zone === "deck").map((entry) => entry.id);
  assert.deepEqual(deckIds.sort(), ["ember-drake", "ember-drake", "seer-call"].sort());
  assert.deepEqual(
    previewDeckIdsForScenario({ scenario: {}, owner: "player", preset: "custom:preview", customDecks }).sort(),
    ["ember-drake", "ember-drake", "seer-call"].sort()
  );
});

test("pre-duel preview falls back to balanced for unknown custom ids", () => {
  const preview = buildPreDuelPreview({
    scenarioId: "normal",
    scenario: {},
    playerPreset: "custom:missing",
    customDecks: []
  });
  assert.equal(preview.deckCards.filter((entry) => entry.zone === "deck").length, deckPresets.balanced.ids.length);
});