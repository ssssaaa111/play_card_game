import assert from "node:assert/strict";
import test from "node:test";

import { effectMarkersForCard } from "../src/effect-markers.js";

const cards = new Map([
  ["moon-source", { name: "月曜帷幕" }],
  ["counter-source", { name: "三曜终断" }],
  ["trance-source", { name: "战斗狂热" }]
]);

test("projects active continuous effects onto their target until the source releases", () => {
  const registered = {
    id: 7,
    type: "CONTINUOUS_EFFECT_REGISTERED",
    effectId: "lunarDominion",
    sourceCardId: "moon-source",
    targetCardId: "target-monster",
    operations: [
      { op: "modifyStat", stat: "tempAtk", amount: -900 },
      { op: "modifyStat", stat: "tempDef", amount: -900 }
    ]
  };
  const input = {
    card: { uid: "target-monster", type: "monster" },
    duelist: { attackResetEntries: [] },
    findCard: (id) => cards.get(id) || null
  };

  assert.deepEqual(effectMarkersForCard({ ...input, gameEvents: [registered] }), [{
    label: "月幕 -900",
    tone: "continuous",
    detail: "月曜帷幕持续生效：攻击力 / 防御力 -900；来源离场后解除。",
    sourceCardId: "moon-source"
  }]);
  assert.deepEqual(effectMarkersForCard({
    ...input,
    gameEvents: [registered, { id: 7, type: "CONTINUOUS_EFFECT_RELEASED" }]
  }), []);
});

test("aggregates target-bound attack resets while retaining every public source", () => {
  const markers = effectMarkersForCard({
    card: { uid: "target-monster", type: "monster" },
    duelist: {
      attackResetEntries: [
        { uses: 1, sourceCardId: "counter-source", targetCardId: "target-monster" },
        { uses: 1, sourceCardId: "trance-source", targetCardId: "target-monster" },
        { uses: 1, sourceCardId: "counter-source", targetCardId: "other-monster" }
      ]
    },
    findCard: (id) => cards.get(id) || null
  });

  assert.deepEqual(markers, [{
    label: "再攻 ×2",
    tone: "ability",
    detail: "追加攻击 ×2：三曜终断、战斗狂热",
    sourceCardIds: ["counter-source", "trance-source"]
  }]);
});
