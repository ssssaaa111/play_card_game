import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets } from "../src/data.js";
import {
  buildDeck,
  buildScenarioDeck,
  cardById,
  cloneCard,
  cloneCardById,
  createDuelist,
  loadCardList,
  shuffle
} from "../src/deck.js";
import { FIELD_SIZE, MAX_LP } from "../src/rules.js";

test("creates fresh duelists with empty zones and resources", () => {
  const duelist = createDuelist("player");

  assert.equal(duelist.owner, "player");
  assert.equal(duelist.lp, MAX_LP);
  assert.equal(duelist.field.length, FIELD_SIZE);
  assert.equal(duelist.traps.length, FIELD_SIZE);
  assert.deepEqual(duelist.field, Array(FIELD_SIZE).fill(null));
  assert.deepEqual(duelist.traps, Array(FIELD_SIZE).fill(null));
  assert.equal(duelist.extraSummon, 0);
  assert.equal(duelist.attackResets, 0);
  assert.equal(duelist.directAttacks, 0);
  assert.equal(duelist.attacksSkipped, false);
});

test("creates duelists with cloned declarative character passives", () => {
  const passive = {
    id: "starLink",
    name: "星脉连携",
    operations: [{ op: "drawCards", player: "self", count: 1 }]
  };
  const duelist = createDuelist("player", passive);

  assert.deepEqual(duelist.comboPassive, passive);
  assert.notEqual(duelist.comboPassive, passive);
  assert.notEqual(duelist.comboPassive.operations, passive.operations);
});

test("clones cards with runtime battle state and display metadata", () => {
  const template = cardById("ember-drake");
  const clone = cloneCard(template);

  assert.notEqual(clone, template);
  assert.match(clone.uid, /^ember-drake-/);
  assert.equal(clone.mode, "attack");
  assert.equal(clone.used, false);
  assert.equal(clone.changedMode, false);
  assert.equal(clone.tempAtk, 0);
  assert.equal(clone.battleWear, 0);
  assert.ok(clone.rarity);
  assert.ok(clone.archetype);
});

test("builds preset decks as cloned card instances", () => {
  const deck = buildDeck("balanced");

  assert.equal(deck.length, deckPresets.balanced.ids.length);
  assert.ok(deck.every((card) => card.uid && card.mode === "attack"));
});

test("builds the basic expansion preset with cloned expansion cards", () => {
  const deck = buildDeck("basicExpansion");
  const ids = deck.map((card) => card.id);

  assert.equal(deck.length, deckPresets.basicExpansion.ids.length);
  assert.ok(ids.includes("star-soul-apprentice"));
  assert.ok(ids.includes("rift-bulwark"));
  assert.ok(ids.includes("soul-resonance"));
  assert.ok(ids.includes("soul-parry"));
  assert.ok(deck.every((card) => card.uid && card.mode === "attack"));
});

test("builds scenario decks without reserved cards", () => {
  const reserved = ["ember-drake", "ember-drake", "seer-call"];
  const deck = buildScenarioDeck("balanced", reserved);
  const ids = deck.map((card) => card.id);

  assert.equal(deck.length, deckPresets.balanced.ids.length - reserved.length);
  reserved.forEach((id) => {
    const remaining = ids.filter((cardId) => cardId === id).length;
    const original = deckPresets.balanced.ids.filter((cardId) => cardId === id).length;
    assert.equal(remaining, Math.max(0, original - reserved.filter((cardId) => cardId === id).length));
  });
});

test("loads card lists and ignores unknown ids", () => {
  const cards = loadCardList(["ember-drake", "missing-card", "seer-call"]);

  assert.deepEqual(cards.map((card) => card.id), ["ember-drake", "seer-call"]);
  assert.notEqual(cloneCardById("ember-drake")?.uid, cloneCardById("ember-drake")?.uid);
  assert.equal(cloneCardById("missing-card"), null);
});

test("shuffle returns a copy without mutating the input", () => {
  const input = [1, 2, 3, 4];
  const output = shuffle(input);

  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.notEqual(output, input);
  assert.deepEqual([...output].sort((a, b) => a - b), [1, 2, 3, 4]);
});
