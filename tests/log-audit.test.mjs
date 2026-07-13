import test from "node:test";
import assert from "node:assert/strict";

import { auditLogEntries, normalizeLogEntries } from "../src/log-audit.js";

test("normalizes newest-first logs and stepped timeline entries", () => {
  assert.deepEqual(
    normalizeLogEntries(["新", "旧"]).map((entry) => entry.text),
    ["旧", "新"]
  );
  assert.deepEqual(
    normalizeLogEntries([{ step: 3, text: "三" }, { step: 2, text: "二" }]).map((entry) => entry.text),
    ["二", "三"]
  );
});

test("flags duplicate logs and missing spell resolution", () => {
  const audit = auditLogEntries([
    { step: 1, text: "你 发动魔法卡 预见之召。" },
    { step: 2, text: "等待行动结算。" },
    { step: 3, text: "等待行动结算。" }
  ]);

  assert.equal(audit.ok, false);
  assert.deepEqual(
    audit.issues.map((issue) => issue.code).sort(),
    ["duplicate-log", "missing-spell-resolution"]
  );
});

test("allows repeatable gameplay actions with identical logs", () => {
  const audit = auditLogEntries([
    { step: 1, text: "AI 召唤了 星轨枪兵。" },
    { step: 2, text: "AI 召唤了 星轨枪兵。" },
    { step: 3, text: "AI 抽了 1 张卡。" },
    { step: 4, text: "AI 抽了 1 张卡。" },
    { step: 5, text: "星火衍生体 因 星火分裂 作为衍生物生成。" },
    { step: 6, text: "星火衍生体 因 星火分裂 作为衍生物生成。" }
  ]);

  assert.equal(audit.ok, true);
});

test("accepts spell logs with matching resolution", () => {
  const audit = auditLogEntries([
    { step: 1, text: "你 发动魔法卡 预见之召。" },
    { step: 2, text: "你 抽了 2 张卡。" },
    { step: 3, text: "AI 发动魔法卡 星隙穿透。" },
    { step: 4, text: "AI获得 1 次直接攻击许可。" }
  ]);

  assert.equal(audit.ok, true);
});

test("flags direct attacks that happen right after direct attack was blocked", () => {
  const audit = auditLogEntries([
    { step: 1, text: "攻击无效：对手场上还有怪兽，必须先攻击怪兽；除非卡牌效果允许直接攻击。" },
    { step: 2, text: "星轨枪兵 直接攻击，造成 1800 点伤害。" }
  ]);

  assert.equal(audit.ok, false);
  assert.equal(audit.issues[0].code, "direct-after-block");
  assert.equal(audit.issues[0].severity, "error");
});

test("does not flag direct attacks after permission or clear-board logs", () => {
  assert.equal(auditLogEntries([
    { step: 1, text: "攻击无效：对手场上还有怪兽，必须先攻击怪兽；除非卡牌效果允许直接攻击。" },
    { step: 2, text: "你获得 1 次直接攻击许可。" },
    { step: 3, text: "星轨枪兵 直接攻击，造成 1800 点伤害。" }
  ]).ok, true);

  assert.equal(auditLogEntries([
    { step: 1, text: "攻击无效：对手场上还有怪兽，必须先攻击怪兽；除非卡牌效果允许直接攻击。" },
    { step: 2, text: "星轨枪兵 击破了 铁壁守卫。" },
    { step: 3, text: "赤焰幼龙 直接攻击，造成 1500 点伤害。" }
  ]).ok, true);
});

test("flags attack previews that are followed by another action without resolution", () => {
  const audit = auditLogEntries([
    { step: 1, text: "攻击预判：星轨枪兵 攻击 1800 对 铁壁守卫 守备 2100，攻击方预计承受 300 点伤害。" },
    { step: 2, text: "你 发动魔法卡 战意高扬。" }
  ]);

  assert.equal(audit.ok, false);
  assert.equal(audit.issues[0].code, "missing-attack-resolution");
  assert.equal(audit.issues[0].severity, "error");
});

test("accepts attack previews followed by battle or trap resolution", () => {
  assert.equal(auditLogEntries([
    { step: 1, text: "AI 攻击预判：星轨枪兵 直接攻击，预计造成 1800 点伤害。" },
    { step: 2, text: "风暴转移 转移了攻击，获得 400 护盾。攻击机会已消耗。" }
  ]).ok, true);

  assert.equal(auditLogEntries([
    { step: 1, text: "攻击预判：星轨枪兵 攻击 1800 对 铁壁守卫 守备 2100，攻击方预计承受 300 点伤害。" },
    { step: 2, text: "星轨枪兵 攻击 1800 低于 铁壁守卫 守备 2100，攻击方受到 300 点生命值伤害。" }
  ]).ok, true);

  assert.equal(auditLogEntries([
    { step: 1, text: "攻击预判：星轨枪兵 攻击 1800 对 铁壁守卫 攻击 900，预计造成 900 点伤害。" },
    { step: 2, text: "星轨枪兵 攻击 1800 击破 铁壁守卫 攻击 900，差值 900，造成 900 点战斗伤害。" },
    { step: 3, text: "你盖放了陷阱卡 镜光反制。" }
  ]).ok, true);
});

test("flags rule-check failures when an attack changes nothing", () => {
  const audit = auditLogEntries([
    { step: 1, text: "攻击预判：星轨枪兵 直接攻击，预计造成 1800 点伤害。" },
    { step: 2, text: "规则校验：星轨枪兵 的攻击没有产生任何状态影响，已中断后续流程。" }
  ]);

  assert.equal(audit.ok, false);
  assert.equal(audit.issues[0].code, "attack-no-impact");
  assert.equal(audit.issues[0].severity, "error");
});
