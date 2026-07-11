import test from "node:test";
import assert from "node:assert/strict";
import { buildChainStackEntries } from "../src/chain-view.js";

test("builds a public chain stack in engine link order", () => {
  const cards = new Map([
    ["mirror-runtime", { id: "mirror-snare", name: "镜光反制" }],
    ["nullifier-runtime", { id: "chain-nullifier", name: "断链裁决" }]
  ]);
  const chain = [
    { linkId: 1, playerId: "ai", cardId: "mirror-runtime" },
    { linkId: 2, playerId: "player", cardId: "nullifier-runtime" }
  ];

  const entries = buildChainStackEntries({ chain, findCard: (id) => cards.get(id) });

  assert.deepEqual(entries.map((entry) => [entry.chainIndex, entry.ownerLabel, entry.cardId, entry.pending]), [
    [1, "AI", "mirror-snare", false],
    [2, "你", "chain-nullifier", false]
  ]);
  assert.deepEqual(chain[0], { linkId: 1, playerId: "ai", cardId: "mirror-runtime" });
});

test("appends the selected response as a pending chain link", () => {
  const entries = buildChainStackEntries({
    chain: [{ linkId: 1, playerId: "ai", cardId: "mirror-runtime" }],
    findCard: () => ({ card: { id: "mirror-snare", name: "镜光反制" }, owner: "ai" }),
    pendingCard: { id: "chain-nullifier", uid: "nullifier-runtime", name: "断链裁决" },
    pendingOwner: "player"
  });

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[1], {
    chainIndex: 2,
    owner: "player",
    ownerLabel: "你",
    cardId: "chain-nullifier",
    runtimeCardId: "nullifier-runtime",
    name: "断链裁决",
    pending: true
  });
});
