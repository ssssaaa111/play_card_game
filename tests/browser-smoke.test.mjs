import test from "node:test";
import assert from "node:assert/strict";

import { assertSmokeOpeningDeck, createTestSnapshot } from "../src/browser-smoke.js";
import { deckPresets } from "../src/data.js";
import { buildDeckFromDefinition } from "../src/deck.js";

function editedDeckIds() {
  const ids = [...deckPresets.balanced.ids];
  ids.splice(ids.indexOf("ember-drake"), 1);
  ids.push("solar-vanguard");
  return ids;
}

test("custom deck smoke accepts the added card being randomly drawn into the opening hand", (t) => {
  let seed = 1;
  t.mock.method(Math, "random", () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const expectedIds = Object.freeze(editedDeckIds());
  const deck = buildDeckFromDefinition({ ids: expectedIds });
  const hand = Object.freeze(deck.splice(0, 6));
  Object.freeze(deck);
  assert.ok(hand.some((card) => card.id === "solar-vanguard"));
  assert.ok(!deck.some((card) => card.id === "solar-vanguard"));
  assert.doesNotThrow(() => assertSmokeOpeningDeck({ deck, hand }, expectedIds));
});

test("custom deck smoke accepts the added card remaining in the shuffled deck", () => {
  const expectedIds = editedDeckIds();
  const cards = expectedIds.map((id) => ({ id }));
  const hand = cards.splice(0, 6);
  assert.ok(cards.some((card) => card.id === "solar-vanguard"));
  assert.doesNotThrow(() => assertSmokeOpeningDeck({ deck: cards, hand }, expectedIds));
});

test("custom deck smoke rejects a fallback preset or incorrect duplicate count", () => {
  const expectedIds = editedDeckIds();
  for (const ids of [deckPresets.balanced.ids, expectedIds.map((id) => id === "night-oracle" ? "ember-drake" : id)]) {
    const cards = ids.map((id) => ({ id }));
    const hand = cards.splice(0, 6);
    assert.throws(() => assertSmokeOpeningDeck({ deck: cards, hand }, expectedIds), /match the saved custom deck/);
  }
});

test("custom deck smoke rejects missing cards and an incomplete opening draw", () => {
  const expectedIds = editedDeckIds();
  const cards = expectedIds.map((id) => ({ id }));
  const hand = cards.splice(0, 6);
  assert.throws(() => assertSmokeOpeningDeck({ deck: cards.slice(1), hand }, expectedIds), /opening deck should keep/);
  assert.throws(() => assertSmokeOpeningDeck({ deck: cards, hand: hand.slice(1) }, expectedIds), /opening hand should contain 6/);
});

test("builds read-only browser smoke snapshots from live state", () => {
  const state = {
    started: true,
    paused: false,
    turn: "player",
    phase: "main",
    timing: "mainOpen",
    actionWindow: "main",
    scenarioId: "direct",
    soundOn: false,
    voiceOn: false,
    selected: { zone: "playerField", index: 0 },
    gameEvents: [
      { id: 1, type: "CARD_MOVED", playerId: "player", cardId: "star-lancer" },
      { id: 2, type: "TRAP_SET", playerId: "player", cardId: "mirror-snare" }
    ],
    log: ["攻击无效：必须先攻击怪兽。"],
    pendingTarget: {
      handUid: "war-chant-ui",
      mode: "ownMonster",
      cardName: "战意高扬",
      effect: "buff500",
      selectedTarget: { owner: "player", zone: "field", index: 0, cardUid: "star-lancer-ui" },
      selectedTargetSource: "default"
    },
    player: {
      lp: 4000,
      attacksSkipped: false,
      directAttacks: 1,
      hand: [{ id: "star-breach" }],
      field: [{ id: "star-lancer", uid: "star-lancer-ui", type: "monster", used: false, mode: "attack" }],
      traps: [null]
    },
    ai: {
      lp: 2200,
      hand: [{ id: "solar-knight" }],
      field: [{ id: "iron-guardian" }],
      traps: [null]
    }
  };
  const els = {
    chainModal: { classList: { contains: () => true } },
    chainText: { textContent: "是否发动陷阱" }
  };
  const snapshot = createTestSnapshot({
    testMode: true,
    state,
    els,
    currentPlayerActions: () => ({ attack: true, spell: false })
  })();

  assert.equal(snapshot.mode, "test");
  assert.equal(snapshot.currentPlayer, "player");
  assert.equal(snapshot.gameEventCount, 2);
  assert.deepEqual(snapshot.latestGameEvents, ["CARD_MOVED", "TRAP_SET"]);
  assert.equal(snapshot.latestGameEventDetails.at(-1).cardId, "mirror-snare");
  assert.equal(snapshot.latestLog, "攻击无效：必须先攻击怪兽。");
  assert.equal(snapshot.machine.phase, "main");
  assert.equal(snapshot.machine.chainLength, 0);
  assert.equal(snapshot.selectedCard.id, "star-lancer");
  assert.equal(snapshot.selection.pendingKind, "target");
  assert.equal(snapshot.selection.conflicted, false);
  assert.deepEqual(snapshot.pendingTarget.selectedTarget, {
    owner: "player",
    zone: "field",
    index: 0,
    cardUid: "star-lancer-ui"
  });
  assert.equal(snapshot.pendingTarget.selectedTargetSource, "default");
  assert.equal(snapshot.activePlayerMonsters[0].canAttack, true);
  assert.equal(snapshot.controls.skipAttackButtonDisabled, false);
  assert.equal(snapshot.player.directAttacks, 1);
  assert.deepEqual(snapshot.player.hand, ["star-breach"]);
  assert.deepEqual(snapshot.ai.field, ["iron-guardian"]);
  assert.equal(snapshot.chain.open, true);
  assert.deepEqual(snapshot.actions, { attack: true, spell: false });
  assert.equal(snapshot.audit.ok, true);
});
