import test from "node:test";
import assert from "node:assert/strict";

import {
  createBattleLogEntry,
  logEntryHasPublicCardDetails,
  logEntryMessage,
  publicLogCardIds
} from "../src/battle-log.js";
import { cardDefinitionById, cardDetailViewModel } from "../src/card-detail.js";
import { getCardEffectDefinition } from "../src/game-engine.js";

test("public battle log events can carry one inspectable card id", () => {
  const entry = createBattleLogEntry("AI 发动魔法卡 月曜帷幕。", {
    id: 1,
    turn: "ai",
    actor: "ai",
    type: "spell",
    cardId: "trio-moon-dominion",
    public: true
  });

  assert.equal(entry.cardId, "trio-moon-dominion");
  assert.deepEqual(publicLogCardIds(entry), ["trio-moon-dominion"]);
  assert.equal(entry.includes("月曜帷幕"), true);
  assert.equal(logEntryMessage(entry), "AI 发动魔法卡 月曜帷幕。");
});

test("public battle log events can carry multiple related card ids", () => {
  const entry = createBattleLogEntry("三曜终断使余烁小卫攻击力提升 2100。", {
    id: 2,
    turn: "player",
    actor: "player",
    type: "effect",
    cardId: "trio-final-counter",
    relatedCardIds: ["trio-ember-pawn"],
    public: true
  });

  assert.deepEqual(publicLogCardIds(entry), ["trio-final-counter", "trio-ember-pawn"]);
  assert.equal(logEntryHasPublicCardDetails(entry), true);
});

test("private battle log events do not expose inspectable card details", () => {
  const entry = createBattleLogEntry("AI 盖放了 1 张陷阱卡。", {
    id: 3,
    turn: "ai",
    actor: "ai",
    type: "set-trap",
    cardId: "trio-chain-veil",
    public: false
  });

  assert.deepEqual(publicLogCardIds(entry), []);
  assert.equal(logEntryHasPublicCardDetails(entry), false);
});

test("log card details come from the unified card definition", () => {
  const definition = cardDefinitionById("trio-moon-dominion");
  const view = cardDetailViewModel("trio-moon-dominion");

  assert.ok(definition);
  assert.equal(view.name, definition.name);
  assert.equal(view.effectText, definition.text);
  assert.equal(view.card, definition);
  assert.match(view.meta, /类型：魔法/);
});

test("campaign key card definitions and victory route effects remain rule-backed", () => {
  assert.equal(cardDefinitionById("trio-final-counter").effect, "trioFinalCounter");
  assert.equal(cardDefinitionById("trio-ember-pawn").atk, 600);
  assert.deepEqual(getCardEffectDefinition("trioFinalCounter").requirements, [
    { type: "maxLp", player: "self", amount: 1600 },
    { type: "requireFieldCards", player: "self", materials: ["trio-ember-pawn"] },
    { type: "noActiveContinuousEffect", sourcePlayer: "rival", targetPlayer: "self" }
  ]);
  assert.deepEqual(getCardEffectDefinition("trioFinalCounter").operations, [
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" }, stat: "tempAtk", amount: 2100 },
    { op: "readyMonsterOrGrantAbility", player: "self", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" }, ability: "attackReset", uses: 1, duration: "turn" }
  ]);
});
