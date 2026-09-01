import test from "node:test";
import assert from "node:assert/strict";

import { trioBossCounterPlan, trioBossPhase, trioBossPhaseTransitions } from "../src/boss-tactics.js";

const cards = {
  "moon-runtime": { id: "trio-moon-warden", type: "monster", name: "月轮守望者" },
  "sun-runtime": { id: "trio-sun-judicator", type: "monster", name: "曜冕裁决者" },
  "tribute-runtime": { id: "nova-squire", type: "monster", name: "新星侍从" },
  "token-runtime": { id: "spark-fragment-token", type: "monster", name: "星火衍生体", token: true },
  "fusion-runtime": { id: "flare-gale-archon", type: "monster", name: "焰岚合星者", summonRoute: "fusion" },
  "trap-runtime": { id: "mirror-snare", type: "trap" }
};

const resolveCard = (cardId) => cards[cardId] || null;

test("trio boss reads the latest player attack on a god as a fortification signal", () => {
  const plan = trioBossCounterPlan({
    events: [
      { id: 1, type: "TURN_STARTED", playerId: "player" },
      { id: 2, type: "ATTACK_DECLARED", playerId: "player", targetCardId: "moon-runtime" }
    ],
    resolveCard
  });

  assert.equal(plan?.id, "fortify-gods");
  assert.equal(plan?.eventId, 2);
  assert.equal(plan?.turnGoal, "protectGods");
});

test("trio boss rebuilds after an ordinary monster is destroyed but ignores backrow", () => {
  const monsterPlan = trioBossCounterPlan({
    events: [
      { id: 4, type: "TURN_STARTED", playerId: "player" },
      { id: 5, type: "CARD_DESTROYED", playerId: "ai", cardId: "tribute-runtime" }
    ],
    resolveCard
  });
  const trapPlan = trioBossCounterPlan({
    events: [
      { id: 6, type: "TURN_STARTED", playerId: "player" },
      { id: 7, type: "CARD_DESTROYED", playerId: "ai", cardId: "trap-runtime" }
    ],
    resolveCard
  });

  assert.equal(monsterPlan?.id, "rebuild-tributes");
  assert.equal(monsterPlan?.turnGoal, "buildTributes");
  assert.equal(trapPlan, null);
});

test("trio boss discards stale signals when a new player turn begins", () => {
  const plan = trioBossCounterPlan({
    events: [
      { id: 8, type: "TURN_STARTED", playerId: "player" },
      { id: 9, type: "ATTACK_DECLARED", playerId: "player", targetCardId: "moon-runtime" },
      { id: 10, type: "TURN_STARTED", playerId: "ai" },
      { id: 11, type: "TURN_STARTED", playerId: "player" }
    ],
    resolveCard
  });

  assert.equal(plan, null);
});

test("trio boss derives its public phase from independent tribute-summoned gods", () => {
  assert.equal(trioBossPhase({
    events: [
      { id: 12, type: "MONSTER_SUMMONED", playerId: "ai", summonType: "tribute", cardId: "sun-runtime" },
      { id: 13, type: "MONSTER_SUMMONED", playerId: "ai", summonType: "tribute", cardId: "moon-runtime" }
    ],
    resolveCard
  }), 3);
  assert.equal(trioBossPhase({ events: [], resolveCard, phase: 2 }), 2);
});

test("trio boss publishes a phase transition with inspectable mixed tribute sources", () => {
  const transitions = trioBossPhaseTransitions({
    events: [
      { id: 21, type: "CARD_TRIBUTED", playerId: "ai", cardId: "tribute-runtime", cardTemplateId: "nova-squire", tributeKind: "normal", summonCardId: "sun-runtime" },
      { id: 22, type: "CARD_TRIBUTED", playerId: "ai", cardId: "token-runtime", cardTemplateId: "spark-fragment-token", tributeKind: "token", summonCardId: "sun-runtime" },
      { id: 23, type: "CARD_TRIBUTED", playerId: "ai", cardId: "fusion-runtime", cardTemplateId: "flare-gale-archon", tributeKind: "fusion", summonCardId: "sun-runtime" },
      { id: 24, type: "MONSTER_SUMMONED", playerId: "ai", summonType: "tribute", cardId: "sun-runtime", cardTemplateId: "trio-sun-judicator" }
    ],
    resolveCard
  });

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].label, "第一神已降临");
  assert.equal(transitions[0].next, "PHASE II · 第二次建设开始");
  assert.equal(transitions[0].sourceSummary, "普通怪兽 ×1 · 衍生物 ×1 · 融合怪兽 ×1");
  assert.deepEqual(transitions[0].relatedCardIds, [
    "nova-squire",
    "spark-fragment-token",
    "flare-gale-archon"
  ]);
  assert.match(transitions[0].text, /曜冕裁决者/);
  assert.match(transitions[0].text, /新星侍从.*星火衍生体.*焰岚合星者/);
});

test("trio boss reacts to a newly set slot without inspecting the hidden card", () => {
  const plan = trioBossCounterPlan({
    events: [
      { id: 14, type: "TURN_STARTED", playerId: "player" },
      { id: 15, type: "TRAP_SET", playerId: "player", cardId: "fresh-hidden-runtime" }
    ],
    resolveCard,
    phase: 1
  });

  assert.equal(plan?.id, "guard-backrow");
  assert.equal(plan?.targetCardId, "fresh-hidden-runtime");
  assert.match(plan?.counterHint || "", /断链/);
});

test("trio boss changes counter priority with each finale phase", () => {
  const events = [
    { id: 16, type: "TURN_STARTED", playerId: "player" },
    { id: 17, type: "CARD_DESTROYED", playerId: "ai", cardId: "tribute-runtime" },
    { id: 18, type: "ATTACK_DECLARED", playerId: "player", targetCardId: "moon-runtime" },
    { id: 19, type: "TRAP_SET", playerId: "player", cardId: "fresh-hidden-runtime" }
  ];

  assert.equal(trioBossCounterPlan({ events, resolveCard, phase: 1 })?.id, "guard-backrow");
  assert.equal(trioBossCounterPlan({ events, resolveCard, phase: 2 })?.id, "rebuild-tributes");
  assert.equal(trioBossCounterPlan({ events, resolveCard, phase: 3 })?.id, "fortify-gods");
});

test("phase three boss publishes finish pressure only inside the effective-life line", () => {
  const shared = {
    events: [{ id: 20, type: "TURN_STARTED", playerId: "player" }],
    resolveCard,
    phase: 3,
    ai: { field: [{ id: "trio-star-herald", type: "monster", mode: "attack" }] }
  };

  const rush = trioBossCounterPlan({ ...shared, player: { lp: 2400, shield: 300 } });
  const shielded = trioBossCounterPlan({ ...shared, player: { lp: 2400, shield: 500 } });

  assert.equal(rush?.id, "rush-finale");
  assert.equal(rush?.turnGoal, "finishPressure");
  assert.equal(shielded, null);
});
