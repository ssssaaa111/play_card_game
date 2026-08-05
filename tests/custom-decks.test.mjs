import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets } from "../src/data.js";
import {
  CUSTOM_DECK_PREFIX,
  DECK_SIZE_MAX,
  DECK_SIZE_MIN,
  MAX_COPIES_PER_CARD,
  createCustomDeck,
  deckDefinitionMap,
  isCustomDeckId,
  readCustomDecks,
  removeCustomDeck,
  resolveDeckDefinition,
  sanitizeCustomDeck,
  upsertCustomDeck,
  validateCustomDeck,
  writeCustomDecks
} from "../src/custom-decks.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    }
  };
}

test("custom deck ids use a dedicated prefix", () => {
  assert.equal(isCustomDeckId("custom:abc"), true);
  assert.equal(isCustomDeckId("balanced"), false);
  assert.equal(isCustomDeckId(""), false);
  assert.match(createCustomDeck("测试", []).id, new RegExp(`^${CUSTOM_DECK_PREFIX}`));
});

test("deck name normalization trims and caps length", () => {
  assert.equal(createCustomDeck("  我的卡组  ", []).name, "我的卡组");
  assert.equal(createCustomDeck("", []).name, "我的卡组");
  assert.equal(createCustomDeck("a".repeat(40), []).name.length, 24);
});

test("validation enforces size and copy limits", () => {
  const ids = deckPresets.balanced.ids;
  const valid = validateCustomDeck(ids);
  assert.equal(valid.ok, true);
  assert.equal(valid.total, ids.length);
  assert.ok(ids.length >= DECK_SIZE_MIN && ids.length <= DECK_SIZE_MAX);

  const tooFew = validateCustomDeck(["ember-drake", "solar-knight"]);
  assert.equal(tooFew.ok, false);
  assert.ok(tooFew.errors.some((entry) => entry.code === "too-few"));

  const tooMany = validateCustomDeck(Array(DECK_SIZE_MAX + 1).fill("ember-drake"));
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.some((entry) => entry.code === "too-many"));
  assert.ok(tooMany.errors.some((entry) => entry.code === "copy-limit"));

  const overCopy = validateCustomDeck(Array(MAX_COPIES_PER_CARD + 1).fill("seer-call"));
  assert.equal(overCopy.ok, false);
  assert.ok(overCopy.errors.some((entry) => entry.code === "copy-limit"));

  const unknown = validateCustomDeck([...Array(40).fill("ember-drake"), "missing-card"]);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((entry) => entry.code === "unknown-cards"));
  assert.equal(unknown.total, 40);
  assert.equal(unknown.unknown, 1);
});

test("storage round trip keeps valid decks and drops corrupt entries", () => {
  const storage = memoryStorage();
  const deck = createCustomDeck("星火特化", ["ember-drake", "ember-drake", "seer-call"]);
  assert.equal(upsertCustomDeck(deck, storage).length, 1);
  assert.equal(readCustomDecks(storage).length, 1);
  assert.deepEqual(readCustomDecks(storage)[0].ids, deck.ids);
  assert.equal(readCustomDecks(storage)[0].name, "星火特化");

  storage.setItem("starDuelCustomDecks", JSON.stringify([
    { id: "custom:broken", name: "坏卡组", ids: ["ember-drake"] },
    { id: "not-prefixed", name: "旧格式", ids: ["ember-drake"] },
    { name: "缺少 id", ids: [] },
    "junk"
  ]));
  const loaded = readCustomDecks(storage);
  assert.equal(loaded.length, 2);
  assert.ok(loaded.every((deck) => isCustomDeckId(deck.id)));
});

test("upsert replaces an existing deck and remove deletes it", () => {
  const storage = memoryStorage();
  const deck = createCustomDeck("第一套", ["ember-drake"]);
  upsertCustomDeck(deck, storage);
  const updated = { ...deck, name: "改名", ids: ["ember-drake", "seer-call"] };
  upsertCustomDeck(updated, storage);
  assert.equal(readCustomDecks(storage).length, 1);
  assert.equal(readCustomDecks(storage)[0].name, "改名");

  const next = removeCustomDeck(deck.id, storage);
  assert.equal(next.length, 0);
  assert.deepEqual(readCustomDecks(storage), []);
});

test("sanitize repairs missing prefixes and empty ids", () => {
  const clean = sanitizeCustomDeck({ id: "plain", name: "  ", ids: ["ember-drake", 42] });
  assert.ok(isCustomDeckId(clean.id));
  assert.equal(clean.name, "我的卡组");
  assert.deepEqual(clean.ids, ["ember-drake"]);
});

test("definition map merges presets and custom decks for labels and previews", () => {
  const custom = [createCustomDeck("我的速攻", ["ember-drake"])];
  const map = deckDefinitionMap(deckPresets, custom);
  assert.equal(map.balanced.label, "均衡星魂");
  assert.equal(map[custom[0].id].label, "我的速攻");
  assert.equal(map[custom[0].id].custom, true);
});

test("resolve deck definition prefers custom decks and falls back to presets", () => {
  const custom = [createCustomDeck("我的卡组", ["ember-drake"])];
  const resolved = resolveDeckDefinition(custom[0].id, custom, deckPresets);
  assert.equal(resolved.label, "我的卡组");
  assert.equal(resolved.custom, true);
  assert.equal(resolveDeckDefinition("balanced", custom, deckPresets).label, "均衡星魂");
  assert.equal(resolveDeckDefinition(`${CUSTOM_DECK_PREFIX}missing`, custom, deckPresets), null);
  assert.equal(resolveDeckDefinition("missing-preset", custom, deckPresets), null);
});

test("write failures return false and corrupt storage loads empty", () => {
  const failing = {
    setItem() {
      throw new Error("quota");
    }
  };
  assert.equal(writeCustomDecks([], failing), false);
  assert.deepEqual(readCustomDecks({ getItem() { throw new Error("boom"); } }), []);
});
