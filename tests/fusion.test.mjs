import test from "node:test";
import assert from "node:assert/strict";

import { fusionOptionForResult, fusionOptionsForCard } from "../src/fusion.js";

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
