import test from "node:test";
import assert from "node:assert/strict";

import { trioBossCounterPlan } from "../src/boss-tactics.js";

const cards = {
  "moon-runtime": { id: "trio-moon-warden", type: "monster" },
  "tribute-runtime": { id: "nova-squire", type: "monster" },
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
