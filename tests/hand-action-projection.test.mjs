import test from "node:test";
import assert from "node:assert/strict";
import { conciseHandBlockLabel, projectHandAction } from "../src/hand-action-projection.js";

function monster(uid, name = uid) {
  return { uid, id: uid, name, type: "monster" };
}

function targetSpell(uid = "spell-1") {
  return { uid, id: uid, name: "余烁归轨", type: "spell" };
}

test("targeted hand actions expose the exact legal target count", () => {
  const card = targetSpell();
  const pawn = monster("pawn", "余烁小卫");
  const result = projectHandAction({
    card,
    handIndex: 3,
    ruleAction: { ok: true, label: "可发动", reason: "发动魔法。" },
    timing: { ok: true },
    targetSelection: {
      handUid: card.uid,
      handIndex: 3,
      cardName: card.name,
      mode: "ownGraveMonster"
    },
    duelists: {
      player: { grave: [pawn], field: [], traps: [] },
      ai: { grave: [], field: [], traps: [] }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.ruleOk, true);
  assert.equal(result.handIndex, 3);
  assert.equal(result.label, "可发动 · 1目标");
  assert.equal(result.target.count, 1);
  assert.equal(result.target.selectedTarget.card, pawn);
  assert.match(result.reason, /唯一合法目标：余烁小卫/);
});

test("a targeted spell with no legal target is blocked before selection starts", () => {
  const card = targetSpell();
  const result = projectHandAction({
    card,
    ruleAction: { ok: true, label: "可发动", reason: "发动魔法。" },
    timing: { ok: true },
    targetSelection: { handUid: card.uid, cardName: card.name, mode: "ownGraveMonster" },
    duelists: {
      player: { grave: [], field: [], traps: [] },
      ai: { grave: [], field: [], traps: [] }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.ruleOk, false);
  assert.equal(result.label, "墓地无怪兽");
  assert.match(result.reason, /我方墓地没有可回召的怪兽/);
});

test("timing blocks presentation while preserving rule readiness for window recovery", () => {
  const result = projectHandAction({
    card: { uid: "spell-2", type: "spell", name: "三曜终断" },
    handIndex: 1,
    ruleAction: { ok: true, label: "可发动", reason: "点击发动。" },
    timing: { ok: false, label: "等待", reason: "当前不是你的可操作窗口。" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.ruleOk, true);
  assert.equal(result.timingOk, false);
  assert.equal(result.reason, "当前不是你的可操作窗口。");
});

test("an active multi-target spell reports selection progress from the same projection", () => {
  const card = targetSpell("destroy-spell");
  card.name = "碎月解幕";
  const first = { uid: "trap-1", id: "trap-1", name: "月曜帷幕", type: "spell" };
  const second = { uid: "trap-2", id: "trap-2", name: "断链裁决", type: "trap" };
  const pendingTarget = {
    handUid: card.uid,
    cardName: card.name,
    mode: "enemySpellTrap",
    selectedTarget: { owner: "ai", zone: "traps", index: 1, cardUid: second.uid },
    selectedTargetSource: "player"
  };
  const result = projectHandAction({
    card,
    ruleAction: { ok: true, label: "选目标", reason: "请选择对方魔陷。" },
    timing: { ok: true },
    targetSelection: pendingTarget,
    pendingTarget,
    duelists: {
      player: { grave: [], field: [], traps: [] },
      ai: { grave: [], field: [], traps: [first, second] }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.label, "目标已选");
  assert.equal(result.target.count, 2);
  assert.equal(result.target.selectedTarget.card, second);
});

test("blocked hand actions use short actionable labels without losing the full reason", () => {
  assert.equal(
    conciseHandBlockLabel({ text: "LP≤2200 时发动" }, "生命值还没有进入终局反击条件。"),
    "需 LP≤2200"
  );
  assert.equal(conciseHandBlockLabel({}, "余烁小卫不在场，不能发动终局反击。"), "需余烁小卫");
  assert.equal(conciseHandBlockLabel({}, "月曜帷幕仍在压制，必须先清除。"), "先清月幕");
  assert.equal(conciseHandBlockLabel({}, "墓地没有可回召的怪兽。"), "墓地无怪兽");
  assert.equal(conciseHandBlockLabel({}, "对手魔陷区没有可破坏的卡，不能发动解印射线。"), "无敌方魔陷");
  assert.equal(conciseHandBlockLabel({}, "未知规则原因。", "条件不足"), "条件不足");

  const result = projectHandAction({
    card: { name: "三曜终断", text: "LP≤2200 时发动" },
    ruleAction: { ok: false, label: "条件不足", reason: "余烁小卫不在场，不能发动终局反击。" },
    timing: { ok: true }
  });
  assert.equal(result.label, "需余烁小卫");
  assert.equal(result.reason, "余烁小卫不在场，不能发动终局反击。");
});
