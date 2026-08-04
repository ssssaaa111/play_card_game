import test from "node:test";
import assert from "node:assert/strict";

import { library } from "../src/data.js";
import { MAX_COPIES_PER_CARD } from "../src/custom-decks.js";
import {
  buildDeckEditorView,
  buildDeckLibraryGroups,
  buildDraftEntries,
  validationSummary
} from "../src/deck-editor.js";

test("library groups split cards by type in stable order", () => {
  const groups = buildDeckLibraryGroups();
  assert.deepEqual(groups.map((group) => group.key), ["monsters", "spells", "traps"]);
  assert.equal(groups[0].cards.length, library.filter((card) => card.type === "monster").length);
  assert.ok(groups.every((group) => group.cards.every((card) => card.type === group.type)));
  assert.ok(groups.every((group) => group.cards.every((card) => card.count === 0 && !card.maxed)));
});

test("draft entries merge duplicates in first occurrence order", () => {
  const entries = buildDraftEntries(["ember-drake", "seer-call", "ember-drake"]);
  assert.deepEqual(entries.map((entry) => entry.id), ["ember-drake", "seer-call"]);
  assert.equal(entries[0].count, 2);
  assert.equal(entries[1].count, 1);
  assert.equal(buildDraftEntries(["missing-card"]).length, 0);
});

test("editor view summarizes validation and save readiness", () => {
  const tooFew = buildDeckEditorView({ draftIds: ["ember-drake"], draftName: "测试" });
  assert.equal(tooFew.canSave, false);
  assert.match(tooFew.validationText, /至少需要/);
  assert.equal(tooFew.draftSize, 1);

  const ids = Array.from({ length: 40 }, (_, index) => library[index].id);
  const ready = buildDeckEditorView({ draftIds: ids, draftName: "测试" });
  assert.equal(ready.canSave, true);
  assert.equal(ready.validationText, "卡组合法：40 张");
});

test("editor view lists saved decks with selection state", () => {
  const decks = [
    { id: "custom:a", name: "第一套", ids: ["ember-drake"] },
    { id: "custom:b", name: "第二套", ids: ["ember-drake", "seer-call"] }
  ];
  const view = buildDeckEditorView({ customDecks: decks, selectedId: "custom:b" });
  assert.deepEqual(view.decks.map((deck) => deck.selected), [false, true]);
  assert.equal(view.canDelete, true);
  assert.equal(view.selectedDeck.name, "第二套");
});

test("library cards report owned copies and maxed state", () => {
  const counts = { "ember-drake": MAX_COPIES_PER_CARD };
  const groups = buildDeckLibraryGroups(counts);
  const ember = groups[0].cards.find((card) => card.id === "ember-drake");
  assert.equal(ember.count, MAX_COPIES_PER_CARD);
  assert.equal(ember.maxed, true);
});

test("validation summary formats error messages", () => {
  const summary = validationSummary({
    ok: false,
    errors: [{ message: "第一处" }, { message: "第二处" }],
    total: 2
  });
  assert.equal(summary, "第一处；第二处");
  assert.equal(validationSummary({ ok: true, total: 42 }), "卡组合法：42 张");
});
