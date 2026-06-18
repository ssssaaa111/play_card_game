import test from "node:test";
import assert from "node:assert/strict";

import { nextTimelineState, timelineKind } from "../src/timeline.js";

test("classifies timeline entries by gameplay meaning", () => {
  assert.equal(timelineKind("你的陷阱卡 镜光反制 触发。"), "trap");
  assert.equal(timelineKind("攻击无效：必须先攻击怪兽。"), "warning");
  assert.equal(timelineKind("你 召唤了 赤焰幼龙。"), "summon");
  assert.equal(timelineKind("赤焰幼龙 直接攻击，造成 1500 点伤害。"), "attack");
  assert.equal(timelineKind("你 发动魔法卡 战意高扬。"), "spell");
  assert.equal(timelineKind("你 抽了 1 张卡。"), "draw");
  assert.equal(timelineKind("你的护盾吸收了 500 点伤害。"), "guard");
  assert.equal(timelineKind("你的回合开始。"), "turn");
  assert.equal(timelineKind("赤焰幼龙 承受冲击产生 300 点战斗损耗。"), "damage");
  assert.equal(timelineKind("锋刃刻印 的装备持续效果失效。"), "spell");
  assert.equal(timelineKind("解印射线 破坏了 锋刃刻印。"), "spell");
});

test("builds capped timeline state without mutating input", () => {
  const timeline = [{ step: 1, kind: "turn", text: "决斗开始。" }];
  const first = nextTimelineState(timeline, "你 抽了 1 张卡。", 1, 2);
  const second = nextTimelineState(first.timeline, "你 召唤了 赤焰幼龙。", first.step, 2);

  assert.equal(first.step, 2);
  assert.equal(second.step, 3);
  assert.equal(second.timeline.length, 2);
  assert.deepEqual(timeline, [{ step: 1, kind: "turn", text: "决斗开始。" }]);
  assert.deepEqual(second.timeline.map((entry) => entry.kind), ["summon", "draw"]);
});
