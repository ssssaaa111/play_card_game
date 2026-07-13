import test from "node:test";
import assert from "node:assert/strict";

import { buildTrapChoiceDisplay } from "../src/trap-choice-display.js";

test("builds ready and selected response card labels", () => {
  const card = {
    type: "trap",
    name: "镜光反制",
    text: "对手攻击时，破坏攻击怪兽。"
  };

  assert.deepEqual(buildTrapChoiceDisplay(card), {
    name: "镜光反制",
    effectText: "对手攻击时，破坏攻击怪兽。",
    state: "ready",
    stateLabel: "可发动",
    typeLabel: "陷阱",
    ariaLabel: "镜光反制，可发动。对手攻击时，破坏攻击怪兽。"
  });
  assert.equal(buildTrapChoiceDisplay(card, { selected: true }).stateLabel, "已选择");
});

test("provides safe fallback copy for incomplete response cards", () => {
  const display = buildTrapChoiceDisplay(null);
  assert.equal(display.name, "未知陷阱");
  assert.equal(display.effectText, "满足当前事件，可以发动。");
  assert.equal(display.typeLabel, "陷阱");
});
