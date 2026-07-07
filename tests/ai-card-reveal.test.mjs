import test from "node:test";
import assert from "node:assert/strict";

import { createBattleLogEntry } from "../src/battle-log.js";
import { aiRevealProgressText, buildAiCardReveal, withAiRevealQueuePosition } from "../src/ai-card-reveal.js";
import { cardDefinitionById, cardDetailViewModel } from "../src/card-detail.js";
import { scenarioSetups } from "../src/data.js";
import { getCardEffectDefinition } from "../src/game-engine.js";

test("AI public events build inspectable reveal data", () => {
  const entry = createBattleLogEntry("AI 发动魔法卡 破晓锋印。", {
    actor: "ai",
    type: "spell",
    public: true,
    cardId: "dawn-edge"
  });
  const reveal = buildAiCardReveal({ ...entry, revealKind: "spell" });

  assert.equal(reveal.cardId, "dawn-edge");
  assert.equal(reveal.name, cardDefinitionById("dawn-edge").name);
  assert.equal(reveal.type, "魔法");
  assert.equal(reveal.summary, cardDefinitionById("dawn-edge").text);
});

test("hidden or non-AI cards do not build reveal data", () => {
  assert.equal(buildAiCardReveal({
    actor: "ai",
    type: "spell",
    public: false,
    cardId: "dawn-edge"
  }), null);
  assert.equal(buildAiCardReveal({
    actor: "player",
    type: "spell",
    public: true,
    cardId: "dawn-edge"
  }), null);
  assert.equal(buildAiCardReveal({
    actor: "ai",
    type: "set-trap",
    public: true,
    cardId: "mirror-snare"
  }), null);
});

test("AI reveal card details resolve from the unified card definition", () => {
  const reveal = buildAiCardReveal({
    actor: "ai",
    public: true,
    cardId: "chain-nullifier",
    revealKind: "trap"
  });
  const definition = cardDefinitionById("chain-nullifier");
  const detail = cardDetailViewModel(reveal.cardId);

  assert.equal(reveal.card, definition);
  assert.equal(detail.card, definition);
  assert.equal(detail.effectText, definition.text);
});

test("AI reveal queue progress only appears for multiple public cards", () => {
  const reveal = buildAiCardReveal({
    actor: "ai",
    public: true,
    cardId: "chain-nullifier",
    revealKind: "trap"
  });

  assert.equal(aiRevealProgressText({ index: 1, total: 1 }), "");
  assert.equal(aiRevealProgressText({ index: 2, total: 3 }), "第 2 / 3 张公开卡");

  const positioned = withAiRevealQueuePosition(reveal, { index: 1, total: 2 });
  assert.equal(positioned.cardId, "chain-nullifier");
  assert.equal(positioned.queueIndex, 1);
  assert.equal(positioned.queueTotal, 2);
  assert.equal(positioned.progressText, "第 1 / 2 张公开卡");
  assert.equal(positioned.card, cardDefinitionById("chain-nullifier"));
});

test("AI reveal does not alter card effects or existing victory route text", () => {
  const route = [...scenarioSetups.protagonistComebackChallenge.recommendedLine];
  const goal = scenarioSetups.protagonistComebackChallenge.goal;
  const effectBefore = getCardEffectDefinition("chainNegate");

  buildAiCardReveal({
    actor: "ai",
    public: true,
    cardId: "chain-nullifier",
    revealKind: "trap"
  });

  assert.deepEqual(scenarioSetups.protagonistComebackChallenge.recommendedLine, route);
  assert.equal(scenarioSetups.protagonistComebackChallenge.goal, goal);
  assert.deepEqual(getCardEffectDefinition("chainNegate"), effectBefore);
});
