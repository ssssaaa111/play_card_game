import test from "node:test";
import assert from "node:assert/strict";

import {
  currentLogEntries,
  logEntrySegments
} from "../src/log-renderer.js";

const cards = new Map([
  ["war-chant", { id: "war-chant", name: "战意高扬" }],
  ["star-lancer", { id: "star-lancer", name: "星轨枪兵" }]
]);

test("current battle log exposes setup fallback and caps recent entries", () => {
  assert.deepEqual(currentLogEntries([], false), ["准备决斗。"]);
  assert.deepEqual(currentLogEntries([], true), ["等待行动结算。"]);
  assert.deepEqual(currentLogEntries(["五", "四", "三"], true, 2), ["五", "四"]);
});

test("public log entries split known card names into inspectable segments", () => {
  const segments = logEntrySegments({
    public: true,
    cardId: "war-chant",
    relatedCardIds: ["star-lancer"],
    message: "你发动战意高扬，强化星轨枪兵。"
  }, {
    findCard: (id) => cards.get(id)
  });

  assert.deepEqual(segments, [
    { type: "text", text: "你发动" },
    { type: "card", cardId: "war-chant", name: "战意高扬" },
    { type: "text", text: "，强化" },
    { type: "card", cardId: "star-lancer", name: "星轨枪兵" },
    { type: "text", text: "。" }
  ]);
});

test("private and plain log entries remain text-only", () => {
  const privateEntry = {
    public: false,
    cardId: "war-chant",
    message: "对手盖放了战意高扬。"
  };

  assert.deepEqual(logEntrySegments(privateEntry, {
    findCard: (id) => cards.get(id)
  }), [
    { type: "text", text: privateEntry.message }
  ]);
  assert.deepEqual(logEntrySegments("普通提示。"), [
    { type: "text", text: "普通提示。" }
  ]);
});
