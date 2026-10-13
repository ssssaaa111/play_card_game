import test from "node:test";
import assert from "node:assert/strict";

import {
  forcedFusionMaterialSelection,
  fusionOptionForResult,
  fusionOptionsForCard
} from "../src/fusion.js";

test("normalizes legacy single-result fusion definitions", () => {
  const card = {
    type: "spell",
    effect: "fusionSummon",
    fusion: { result: "flare-gale-archon", materials: ["ember-drake", { id: "gale-mage", count: 1 }] }
  };

  assert.deepEqual(fusionOptionsForCard(card), [{
    resultTemplateId: "flare-gale-archon",
    materials: [
      { templateId: "ember-drake", count: 1 },
      { templateId: "gale-mage", count: 1 }
    ]
  }]);
  assert.equal(fusionOptionForResult(card)?.resultTemplateId, "flare-gale-archon");
});

test("normalizes multiple fusion results without choosing one implicitly", () => {
  const card = {
    type: "spell",
    effect: "fusionSummon",
    fusion: {
      options: [
        { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] },
        { result: "tempest-aegis-archon", materials: ["ember-drake", "gale-mage"] }
      ]
    }
  };

  assert.equal(fusionOptionsForCard(card).length, 2);
  assert.equal(fusionOptionForResult(card), null);
  assert.equal(fusionOptionForResult(card, "tempest-aegis-archon")?.materials.length, 2);
});
test("preselects only fusion materials that have no competing candidate", () => {
  const materials = [
    { templateId: "ember-drake", count: 1 },
    { templateId: "gale-mage", count: 1 }
  ];
  const forced = forcedFusionMaterialSelection(materials, [
    { zone: "field", index: 0, card: { id: "ember-drake" } },
    { zone: "hand", uid: "gale-1", card: { id: "gale-mage" } }
  ]);
  assert.equal(forced.unique, true);
  assert.deepEqual(forced.selected.map((entry) => [entry.zone, entry.index ?? entry.uid]), [
    ["field", 0],
    ["hand", "gale-1"]
  ]);

  const ambiguous = forcedFusionMaterialSelection(materials, [
    { zone: "field", index: 0, card: { id: "ember-drake" } },
    { zone: "hand", uid: "ember-2", card: { id: "ember-drake" } },
    { zone: "hand", uid: "gale-1", card: { id: "gale-mage" } }
  ]);
  assert.equal(ambiguous.unique, false);
  assert.deepEqual(ambiguous.selected.map((entry) => entry.uid), ["gale-1"]);
  assert.deepEqual(ambiguous.ambiguous, [
    { templateId: "ember-drake", count: 1, candidateCount: 2 }
  ]);
});
