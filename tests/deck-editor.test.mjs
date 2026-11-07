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

test("monster library summaries show the card definition's base attack and defense", () => {
  const monsters = buildDeckLibraryGroups()[0].cards;
  const definitions = library.filter((card) => card.type === "monster");
  assert.deepEqual(
    monsters.map((card) => card.meta),
    definitions.map((card) => `ATK ${card.atk} / DEF ${card.def}`)
  );
  assert.equal(monsters.find((card) => card.id === "solar-vanguard").meta, "ATK 2300 / DEF 1700");
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

const visibleIds = (view) => view.libraryGroups.flatMap((group) => group.cards.map((card) => card.id));

test("library search combines partial names and card type without changing definition order", () => {
  const view = buildDeckEditorView({ libraryQuery: "  日冕  ", libraryType: "monster" });
  assert.deepEqual(visibleIds(view), ["solar-knight"]);
  assert.equal(view.libraryMatchCount, 1);
  assert.equal(view.libraryGroups[0].label, "怪兽");
  assert.equal(view.libraryStatus, `显示 1 / ${library.length} 种卡牌`);
  assert.equal(view.libraryFiltered, true);
});

test("effect search includes concise player-facing rule wording", () => {
  const view = buildDeckEditorView({ libraryQuery: "抽牌" });
  assert.ok(visibleIds(view).includes("seer-call"));
  assert.ok(visibleIds(view).includes("guard-sigil"));
  const spells = buildDeckEditorView({ libraryQuery: "抽牌", libraryType: "spell" });
  assert.ok(visibleIds(spells).includes("seer-call"));
  assert.ok(!visibleIds(spells).includes("guard-sigil"));
  assert.ok(spells.libraryGroups.every((group) => group.type === "spell"));
});

test("search normalizes full-width case and accepts multiple literal keywords", () => {
  assert.deepEqual(visibleIds(buildDeckEditorView({ libraryQuery: "ＳＯＬＡＲ-ＫＮＩＧＨＴ" })), ["solar-knight"]);
  assert.deepEqual(visibleIds(buildDeckEditorView({ libraryQuery: "日冕 1700" })), ["solar-knight"]);
  for (const query of ["[", ".*", "<script>", "不存在的卡牌"]) {
    assert.equal(buildDeckEditorView({ libraryQuery: query }).libraryMatchCount, 0);
  }
});

test("type-only filtering and clearing restore the complete library", () => {
  for (const type of ["monster", "spell", "trap"]) {
    const view = buildDeckEditorView({ libraryType: type });
    assert.deepEqual(visibleIds(view), library.filter((card) => card.type === type).map((card) => card.id));
  }
  for (const options of [{}, { libraryQuery: "  " }, { libraryType: "invalid" }, { libraryQuery: null }]) {
    const view = buildDeckEditorView(options);
    assert.equal(view.libraryMatchCount, library.length);
    assert.equal(view.libraryFiltered, false);
  }
});

test("zero search results leave the selected deck composition and save readiness intact", () => {
  const ids = library.slice(0, 40).map((card) => card.id);
  const options = { draftIds: ids, selectedId: "custom:one", draftName: "原卡组", customDecks: [{ id: "custom:one", name: "原卡组", ids }] };
  const before = structuredClone(options);
  const normal = buildDeckEditorView(options);
  const filtered = buildDeckEditorView({ ...options, libraryQuery: "没有这张卡" });
  assert.deepEqual(options, before);
  assert.equal(filtered.libraryMatchCount, 0);
  assert.deepEqual(filtered.libraryGroups, []);
  for (const key of ["draftSize", "draftEntries", "selectedId", "selectedDeck", "draftName", "validation", "canSave", "canDelete", "decks"]) {
    assert.deepEqual(filtered[key], normal[key]);
  }
});

test("filtered results preserve copy counts and the three-copy limit", () => {
  const draftIds = Array(3).fill("solar-knight");
  const view = buildDeckEditorView({ draftIds, libraryQuery: "日冕", libraryType: "monster" });
  assert.equal(view.libraryGroups[0].cards[0].count, 3);
  assert.equal(view.libraryGroups[0].cards[0].maxed, true);
  const cleared = buildDeckEditorView({ draftIds });
  assert.equal(cleared.libraryGroups[0].cards.find((card) => card.id === "solar-knight").maxed, true);
});
