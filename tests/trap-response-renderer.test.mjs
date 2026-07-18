import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrapResponseView,
  trapResponsePromptText
} from "../src/trap-response-renderer.js";

const traps = [
  {
    id: "counter-array",
    uid: "counter:1",
    type: "trap",
    name: "反击阵列",
    text: "对手攻击时，取消这次攻击。"
  },
  {
    id: "chain-nullifier",
    uid: "nullifier:1",
    type: "trap",
    name: "断链裁决",
    text: "无效上一段连锁。"
  }
];

const activationText = (card, eventName) => `${eventName}：是否连锁发动「${card.name}」？${card.text}`;

test("unselected response lists every legal trap without enabling activation", () => {
  const choice = {
    eventName: "attack",
    details: {},
    trapIndexes: [0, 1],
    selectedIndex: -1
  };
  const view = buildTrapResponseView({ choice, traps, activationText });

  assert.equal(view.visible, true);
  assert.equal(view.choices.length, 2);
  assert.equal(view.actionDisabled, true);
  assert.equal(view.actionText, "发动陷阱");
  assert.equal(view.statusText, "可响应 2 张 · 本事件限发动 1 张");
  assert.match(view.detailsText, /反击阵列、断链裁决/);
});

test("selected first response labels its exact chain position", () => {
  const choice = {
    eventName: "attack",
    details: {},
    trapIndexes: [0],
    selectedIndex: 0
  };
  const view = buildTrapResponseView({ choice, traps, activationText });

  assert.equal(view.actionDisabled, false);
  assert.equal(view.actionText, "发动 反击阵列 · CL1");
  assert.equal(view.statusText, "已选择：反击阵列 · 将加入 CL1");
  assert.equal(view.stackEntries.length, 0);
});

test("selected counter response appears as the pending next chain link", () => {
  const choice = {
    eventName: "chain",
    details: {},
    trapIndexes: [1],
    selectedIndex: 1
  };
  const chain = [
    { linkId: 1, playerId: "player", cardId: "counter:1" },
    { linkId: 2, playerId: "ai", cardId: "nullifier:ai" }
  ];
  const runtimeCards = new Map([
    ["counter:1", { card: traps[0], owner: "player" }],
    ["nullifier:ai", { card: traps[1], owner: "ai" }]
  ]);
  const view = buildTrapResponseView({
    choice,
    traps,
    chain,
    activationText,
    findCard: (cardId) => runtimeCards.get(cardId)
  });

  assert.equal(view.actionText, "发动 断链裁决 · CL3");
  assert.equal(view.statusText, "已选择：断链裁决 · 将加入 CL3");
  assert.equal(view.stackEntries.length, 3);
  assert.equal(view.stackEntries[2].pending, true);
  assert.equal(view.resolutionOrder, "CL3 → CL2 → CL1");
});

test("prompt view has a safe empty state", () => {
  assert.equal(trapResponsePromptText(null, traps, activationText), "");
  assert.deepEqual(buildTrapResponseView(), {
    visible: false,
    detailsText: "",
    statusText: "",
    actionText: "发动陷阱",
    actionDisabled: false,
    choices: [],
    stackEntries: [],
    resolutionOrder: ""
  });
});
