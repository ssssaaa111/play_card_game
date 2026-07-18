import test from "node:test";
import assert from "node:assert/strict";

import { buildFusionSelectionView } from "../src/fusion-selection-renderer.js";

const cards = new Map([
  ["flare-gale-archon", { id: "flare-gale-archon", type: "monster", name: "焰岚合星者", atk: 2400, def: 1800 }],
  ["tempest-aegis-archon", { id: "tempest-aegis-archon", type: "monster", name: "岚盾合星者", atk: 2000, def: 2600 }],
  ["ember-drake", { id: "ember-drake", type: "monster", name: "赤焰幼龙" }],
  ["gale-mage", { id: "gale-mage", type: "monster", name: "疾风术士" }]
]);

const findCard = (id) => cards.get(id);
const formatMaterials = (materials = []) => materials
  .map((entry) => `${findCard(entry.templateId)?.name || entry.templateId}${entry.count > 1 ? ` ×${entry.count}` : ""}`)
  .join("、");
const options = [
  {
    resultId: "flare-gale-archon",
    materials: [
      { templateId: "ember-drake", count: 1 },
      { templateId: "gale-mage", count: 1 }
    ]
  },
  {
    resultId: "tempest-aegis-archon",
    materials: [
      { templateId: "ember-drake", count: 1 },
      { templateId: "gale-mage", count: 1 }
    ]
  }
];

test("multi-result fusion lists stats and recipes before choosing a form", () => {
  const view = buildFusionSelectionView({
    pendingFusion: {
      resultId: "",
      resultOptions: options,
      materials: []
    },
    findCard,
    formatMaterials
  });

  assert.equal(view.visible, true);
  assert.equal(view.materialState, "needs-result");
  assert.equal(view.resultName, "请选择融合结果");
  assert.equal(view.showOptions, true);
  assert.equal(view.options.length, 2);
  assert.match(view.options[0].subtitle, /ATK 2400.*赤焰幼龙、疾风术士/);
  assert.match(view.options[1].ariaLabel, /岚盾合星者.*ATK 2000.*可选择/);
});

test("selected fusion form describes material zones and remaining recipe", () => {
  const view = buildFusionSelectionView({
    pendingFusion: {
      resultId: "tempest-aegis-archon",
      resultOptions: options,
      materials: options[1].materials
    },
    status: {
      complete: false,
      selectedCount: 1,
      requiredCount: 2,
      remaining: [{ templateId: "gale-mage", count: 1 }]
    },
    selectedMaterials: [{ zone: "field", card: findCard("ember-drake") }],
    findCard,
    formatMaterials
  });

  assert.equal(view.resultName, "岚盾合星者");
  assert.equal(view.kicker, "融合预览 · 素材 1/2");
  assert.equal(view.materialState, "selecting");
  assert.match(view.materialsText, /赤焰幼龙（场上）/);
  assert.match(view.materialsText, /还需：疾风术士/);
  assert.equal(view.options[1].selected, true);
});

test("completed fusion selection exposes a ready visual state", () => {
  const view = buildFusionSelectionView({
    pendingFusion: {
      resultId: "flare-gale-archon",
      resultOptions: options.slice(0, 1),
      materials: options[0].materials
    },
    status: {
      complete: true,
      selectedCount: 2,
      requiredCount: 2,
      remaining: options[0].materials.map((entry) => ({ ...entry, count: 0 }))
    },
    selectedMaterials: [
      { zone: "field", card: findCard("ember-drake") },
      { zone: "hand", card: findCard("gale-mage") }
    ],
    findCard,
    formatMaterials
  });

  assert.equal(view.kicker, "融合预览 · 素材齐备");
  assert.equal(view.materialState, "complete");
  assert.match(view.materialsText, /疾风术士（手牌）/);
  assert.match(view.materialsText, /素材齐备/);
  assert.equal(view.showOptions, false);
  assert.equal(view.detailDisabled, false);
});

test("missing fusion selection clears the panel view", () => {
  assert.deepEqual(buildFusionSelectionView(), {
    visible: false,
    resultId: "",
    resultName: "",
    stats: "",
    kicker: "融合预览",
    materialState: "idle",
    materialsText: "",
    detailDisabled: true,
    options: [],
    showOptions: false
  });
});
