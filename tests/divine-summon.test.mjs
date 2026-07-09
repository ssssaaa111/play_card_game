import test from "node:test";
import assert from "node:assert/strict";

import { library, scenarioSetups } from "../src/data.js";
import { cardDetailViewModel } from "../src/card-detail.js";

const cardsById = new Map(library.map((card) => [card.id, card]));

test("divine summon prototype is declared through unified card data", () => {
  const divine = cardsById.get("celestial-origin-dragon");

  assert.equal(divine.type, "monster");
  assert.equal(divine.name, "创星神龙");
  assert.equal(divine.tributeCost, 3);
  assert.equal(divine.atk, 4000);
  assert.equal(divine.def, 4000);
  assert.equal(divine.archetype, "神格");
  assert.match(cardDetailViewModel(divine).summonRequirement, /3/);
});

test("divine summon scenario uses scene initialization without changing old routes", () => {
  assert.deepEqual(scenarioSetups.divineSummon.playerHand, ["celestial-origin-dragon", "war-chant"]);
  assert.deepEqual(scenarioSetups.divineSummon.playerField, ["spark-runner", "lumen-gearlet", "ember-soul-initiate"]);
  assert.equal(scenarioSetups.protagonistTrioOmegaChallenge.playerHand[0], "trio-solar-snare");
  assert.deepEqual(scenarioSetups.splitToken.playerHand, ["spark-split", "war-chant"]);
});
