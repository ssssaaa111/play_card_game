import assert from "node:assert/strict";
import test from "node:test";

import { effectMarkersForCard } from "../src/effect-markers.js";

const cards = new Map([
  ["moon-source", { name: "月曜帷幕" }],
  ["blade-source", { name: "锋刃刻印" }],
  ["aegis-source", { name: "庇护甲片" }],
  ["overclock-source", { name: "超频核心" }],
  ["chant-source", { name: "战意高扬" }],
  ["resonance-source", { name: "星魂共鸣" }],
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
    label: "月幕 攻守-900",
    tone: "continuous",
    detail: "月曜帷幕持续生效：攻击力 / 防御力 -900；来源离场后解除。",
    sourceCardId: "moon-source"
  }]);
  assert.deepEqual(effectMarkersForCard({
    ...input,
    gameEvents: [registered, { id: 7, type: "CONTINUOUS_EFFECT_RELEASED" }]
  }), []);
});

test("continuous markers describe the exact stats changed by each source", () => {
  const marker = (id, effectId, sourceCardId, operations) => ({
    id,
    type: "CONTINUOUS_EFFECT_REGISTERED",
    effectId,
    sourceCardId,
    targetCardId: "target-monster",
    operations
  });
  const markers = effectMarkersForCard({
    card: { uid: "target-monster", type: "monster" },
    duelist: { attackResetEntries: [] },
    gameEvents: [
      marker(1, "equipBlade", "blade-source", [
        { op: "modifyStat", stat: "tempAtk", amount: 300 }
      ]),
      marker(2, "equipAegis", "aegis-source", [
        { op: "modifyStat", stat: "tempDef", amount: 500 }
      ]),
      marker(3, "equipOverclock", "overclock-source", [
        { op: "modifyStat", stat: "tempAtk", amount: 600 },
        { op: "modifyStat", stat: "tempDef", amount: -300 }
      ])
    ],
    findCard: (id) => cards.get(id) || null
  });

  assert.deepEqual(markers, [
    {
      label: "锋刃 攻+300",
      tone: "continuous",
      detail: "锋刃刻印持续生效：攻击力 +300；来源离场后解除。",
      sourceCardId: "blade-source"
    },
    {
      label: "庇护 守+500",
      tone: "continuous",
      detail: "庇护甲片持续生效：防御力 +500；来源离场后解除。",
      sourceCardId: "aegis-source"
    },
    {
      label: "超频 攻+600/守-300",
      tone: "continuous",
      detail: "超频核心持续生效：攻击力 +600 / 防御力 -300；来源离场后解除。",
      sourceCardId: "overclock-source"
    }
  ]);
});

test("one-shot stat markers retain public sources only for the monster's current field life", () => {
  const beforeResummon = [
    { id: 1, type: "MONSTER_SUMMONED", cardId: "target-monster" },
    {
      id: 2,
      type: "STAT_MODIFIED",
      cardId: "target-monster",
      stat: "tempAtk",
      amount: 500,
      sourceCardId: "chant-source"
    },
    {
      id: 3,
      type: "STAT_MODIFIED",
      cardId: "target-monster",
      stat: "tempAtk",
      amount: 200,
      sourceCardId: "resonance-source"
    },
    {
      id: 4,
      type: "STAT_MODIFIED",
      cardId: "target-monster",
      stat: "tempDef",
      amount: 200,
      sourceCardId: "resonance-source"
    },
    {
      id: 5,
      type: "STAT_MODIFIED",
      cardId: "target-monster",
      stat: "tempAtk",
      amount: 300,
      duration: "continuous",
      sourceCardId: "blade-source"
    }
  ];
  const input = {
    card: { uid: "target-monster", type: "monster" },
    duelist: { attackResetEntries: [] },
    findCard: (id) => cards.get(id) || null
  };

  assert.deepEqual(effectMarkersForCard({ ...input, gameEvents: beforeResummon }), [
    {
      label: "星魂 攻守+200",
      tone: "buff",
      detail: "星魂共鸣生效：攻击力 / 防御力 +200。",
      sourceCardId: "resonance-source"
    },
    {
      label: "战意 攻+500",
      tone: "buff",
      detail: "战意高扬生效：攻击力 +500。",
      sourceCardId: "chant-source"
    }
  ]);
  assert.deepEqual(effectMarkersForCard({
    ...input,
    gameEvents: [...beforeResummon, { id: 6, type: "MONSTER_SUMMONED", cardId: "target-monster" }]
  }), []);
});

test("one-shot stat markers resolve public combo names instead of showing unknown sources", () => {
  const markers = effectMarkersForCard({
    card: { uid: "target-monster", type: "monster" },
    duelist: { attackResetEntries: [] },
    gameEvents: [
      { id: 1, type: "MONSTER_SUMMONED", cardId: "target-monster" },
      {
        id: 2,
        type: "COMBO_TRIGGERED",
        comboId: "fireWindFirst",
        title: "炎岚追击"
      },
      {
        id: 3,
        type: "STAT_MODIFIED",
        cardId: "target-monster",
        stat: "tempAtk",
        amount: 100,
        sourceCardId: "combo:fireWindFirst"
      }
    ],
    findCard: () => null
  });

  assert.deepEqual(markers, [{
    label: "炎岚 攻+100",
    tone: "buff",
    detail: "炎岚追击生效：攻击力 +100。",
    sourceCardId: "combo:fireWindFirst"
  }]);
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

test("keeps lifecycle markers stable while showing newest one-shot sources first", () => {
  const markers = effectMarkersForCard({
    card: { uid: "target-monster", type: "monster" },
    duelist: {
      attackResetEntries: [
        { uses: 1, sourceCardId: "trance-source", targetCardId: "target-monster" }
      ]
    },
    gameEvents: [
      { id: 1, type: "MONSTER_SUMMONED", cardId: "target-monster" },
      {
        id: 2,
        type: "STAT_MODIFIED",
        cardId: "target-monster",
        stat: "tempAtk",
        amount: 500,
        sourceCardId: "chant-source"
      },
      {
        id: 3,
        type: "STAT_MODIFIED",
        cardId: "target-monster",
        stat: "tempAtk",
        amount: 200,
        sourceCardId: "trance-source"
      },
      {
        id: 4,
        type: "COMBO_TRIGGERED",
        comboId: "fireWindFirst",
        title: "炎岚追击"
      },
      {
        id: 5,
        type: "STAT_MODIFIED",
        cardId: "target-monster",
        stat: "tempAtk",
        amount: 100,
        sourceCardId: "combo:fireWindFirst"
      }
    ],
    findCard: (id) => cards.get(id) || null
  });

  assert.deepEqual(markers.map((marker) => marker.label), [
    "再攻 ×1",
    "战斗 攻+200",
    "炎岚 攻+100",
    "战意 攻+500"
  ]);
});
