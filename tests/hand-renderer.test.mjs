import test from "node:test";
import assert from "node:assert/strict";

import { handCardView, handDetailEntryView } from "../src/hand-renderer.js";

function card(overrides = {}) {
  return {
    uid: "hand-1",
    id: "seer-call",
    type: "spell",
    name: "预见之召",
    ...overrides
  };
}

test("ready selected hand cards expose their action and selection state", () => {
  const view = handCardView({
    card: card(),
    action: {
      ok: true,
      label: "可发动",
      reason: "点击确认发动。"
    },
    selected: true,
    started: true,
    canAct: true
  });

  assert.equal(view.title, "预见之召：点击确认发动。");
  assert.equal(view.actionLabel, "可发动");
  assert.equal(view.actionReason, "点击确认发动。");
  assert.equal(view.showActionReason, true);
  assert.ok(view.cardClasses.includes("selected"));
  assert.ok(view.cardClasses.includes("action-ready"));
  assert.ok(!view.cardClasses.includes("action-blocked"));
  assert.ok(!view.cardClasses.includes("compact-action-state"));
});

test("blocked hand cards keep their failure reason visible only during legal action windows", () => {
  const active = handCardView({
    card: card(),
    action: {
      ok: false,
      label: "条件不足",
      reason: "卡组不足，无法抽 2 张。"
    },
    started: true,
    canAct: true
  });
  const paused = handCardView({
    card: card(),
    action: {
      ok: false,
      label: "条件不足",
      reason: "卡组不足，无法抽 2 张。"
    },
    started: true,
    canAct: false
  });

  assert.equal(active.showActionReason, true);
  assert.ok(active.cardClasses.includes("action-blocked"));
  assert.ok(!paused.cardClasses.includes("action-blocked"));
});

test("fusion material states override normal hand action copy", () => {
  const candidate = handCardView({
    card: card({ type: "monster", name: "星轨枪兵" }),
    action: { ok: true, label: "可召唤", reason: "确认召唤。" },
    fusionMaterialCandidate: true
  });
  const selected = handCardView({
    card: card({ type: "monster", name: "星轨枪兵" }),
    action: { ok: true, label: "可召唤", reason: "确认召唤。" },
    fusionMaterialCandidate: true,
    fusionMaterialSelected: true,
    drawHighlighted: true
  });

  assert.equal(candidate.actionLabel, "融合素材");
  assert.equal(candidate.actionReason, "点击选择为手牌融合素材。");
  assert.ok(candidate.cardClasses.includes("tribute-candidate"));
  assert.equal(selected.actionLabel, "融合素材 ✓");
  assert.match(selected.actionReason, /再次点击可取消/);
  assert.ok(selected.cardClasses.includes("tribute-selected"));
  assert.ok(selected.cardClasses.includes("draw-flash"));
});

test("invalid fusion hand materials keep their exact reason after renderer extraction", () => {
  const view = handCardView({
    card: card({ type: "spell", name: "战意高扬" }),
    action: { ok: true, label: "可发动", reason: "确认发动。" },
    fusionMaterialTarget: {
      ok: false,
      reason: "不能选择该素材：不是怪兽。"
    },
    started: true,
    canAct: true
  });

  assert.equal(view.title, "战意高扬：不能选择该素材：不是怪兽。");
  assert.equal(view.actionLabel, "不可选素材");
  assert.equal(view.actionReason, "不能选择该素材：不是怪兽。");
  assert.ok(view.cardClasses.includes("fusion-unavailable"));
  assert.ok(view.cardClasses.includes("action-blocked"));
  assert.ok(!view.cardClasses.includes("action-ready"));
});

test("hand detail entry stays independent from action and reorder semantics", () => {
  assert.deepEqual(handDetailEntryView(card(), { reorderMode: false }), {
    visible: true,
    label: "查看预见之召详情"
  });
  assert.deepEqual(handDetailEntryView(card(), { reorderMode: true }), {
    visible: false,
    label: "查看预见之召详情"
  });
});
