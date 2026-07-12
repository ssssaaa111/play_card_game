import test from "node:test";
import assert from "node:assert/strict";

import { buildChainHistory } from "../src/chain-history.js";

const cards = {
  counter: { id: "counter-array", name: "反击阵列" },
  aiNullifier: { id: "chain-nullifier", name: "断链裁决" },
  playerNullifier: { id: "chain-nullifier", name: "断链裁决" }
};

const runtimeCards = new Map([
  ["counter:1", { card: cards.counter, owner: "player" }],
  ["nullifier:ai", { card: cards.aiNullifier, owner: "ai" }],
  ["nullifier:player", { card: cards.playerNullifier, owner: "player" }]
]);

const tripleChainEvents = [
  { id: 1, type: "CHAIN_LINK_ADDED", linkId: 1, cardId: "counter:1", playerId: "player" },
  { id: 2, type: "CHAIN_LINK_ADDED", linkId: 2, cardId: "nullifier:ai", playerId: "ai" },
  { id: 3, type: "CHAIN_LINK_ADDED", linkId: 3, cardId: "nullifier:player", playerId: "player" },
  { id: 4, type: "CHAIN_LINK_RESOLVED", linkId: 3, cardId: "nullifier:player" },
  { id: 5, type: "EFFECT_NEGATED", sourceCardId: "nullifier:player", targetEffectId: "nullifier:ai" },
  { id: 6, type: "EFFECT_SKIPPED", cardId: "nullifier:ai", reason: "negated" },
  { id: 7, type: "CHAIN_LINK_RESOLVED", linkId: 2, cardId: "nullifier:ai", skipped: true },
  { id: 8, type: "CHAIN_LINK_RESOLVED", linkId: 1, cardId: "counter:1" },
  {
    id: 9,
    type: "CHAIN_RESOLVED",
    resolvedLinks: [
      { linkId: 3, cardId: "nullifier:player", playerId: "player" },
      { linkId: 2, cardId: "nullifier:ai", playerId: "ai" },
      { linkId: 1, cardId: "counter:1", playerId: "player" }
    ]
  }
];

test("completed chain history preserves activation and reverse resolution order", () => {
  const [history] = buildChainHistory(tripleChainEvents, {
    findCard: (cardId) => runtimeCards.get(cardId)
  });

  assert.equal(history.activationOrder, "CL1 → CL2 → CL3");
  assert.equal(history.resolutionOrder, "CL3 → CL2 → CL1");
  assert.deepEqual(history.links.map((link) => link.status), ["resolved", "negated", "resolved"]);
  assert.equal(history.links[1].negatedByChainIndex, 3);
});

test("chain history card references resolve through the shared card lookup", () => {
  const [history] = buildChainHistory(tripleChainEvents, {
    findCard: (cardId) => runtimeCards.get(cardId)
  });

  assert.deepEqual(
    history.links.map(({ cardId, runtimeCardId, name, ownerLabel }) => ({ cardId, runtimeCardId, name, ownerLabel })),
    [
      { cardId: "counter-array", runtimeCardId: "counter:1", name: "反击阵列", ownerLabel: "你" },
      { cardId: "chain-nullifier", runtimeCardId: "nullifier:ai", name: "断链裁决", ownerLabel: "AI" },
      { cardId: "chain-nullifier", runtimeCardId: "nullifier:player", name: "断链裁决", ownerLabel: "你" }
    ]
  );
});

test("unfinished chains stay hidden and completed history is newest-first and capped", () => {
  const secondChain = tripleChainEvents.map((event) => ({ ...event, id: event.id + 20 }));
  const unfinished = { id: 50, type: "CHAIN_LINK_ADDED", linkId: 1, cardId: "hidden:1", playerId: "ai" };
  const history = buildChainHistory([...tripleChainEvents, ...secondChain, unfinished], {
    findCard: (cardId) => runtimeCards.get(cardId),
    limit: 1
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].eventId, 29);
  assert.equal(history[0].links.some((link) => link.runtimeCardId === "hidden:1"), false);
});
