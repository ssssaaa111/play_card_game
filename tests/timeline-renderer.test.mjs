import test from "node:test";
import assert from "node:assert/strict";

import {
  auditIssueLabel,
  captureTimelineViewport,
  chainHistoryPanelView,
  restoreTimelineViewport,
  timelineAuditView,
  timelineKindGroup,
  timelineKindLabel,
  timelineOverviewView
} from "../src/timeline-renderer.js";

function timelineItem(step, offsetTop, offsetHeight = 40) {
  return { dataset: { timelineStep: String(step) }, offsetTop, offsetHeight };
}

test("timeline audit view exposes healthy status and localized issue labels", () => {
  const view = timelineAuditView([
    { step: 1, text: "决斗开始。" }
  ]);

  assert.equal(view.audit.ok, true);
  assert.equal(view.text, "审计 OK");
  assert.equal(view.className, "timeline-audit ok");
  assert.equal(view.detail, "");
  assert.equal(view.title, "日志审计未发现异常。");
  assert.equal(auditIssueLabel({ code: "duplicate-log" }), "重复日志");
  assert.equal(auditIssueLabel({ code: "custom-check" }), "custom-check");
});

test("timeline audit view prioritizes error severity and detailed diagnostics", () => {
  const view = timelineAuditView([
    { step: 1, text: "攻击无效：对手场上还有怪兽，必须先攻击怪兽。" },
    { step: 2, text: "星轨枪兵 直接攻击，造成 1800 点伤害。" }
  ]);

  assert.equal(view.audit.ok, false);
  assert.equal(view.className, "timeline-audit error");
  assert.match(view.text, /直击规则矛盾/);
  assert.match(view.detail, /直击规则矛盾/);
  assert.match(view.title, /ERROR direct-after-block/);
});

test("timeline overview summarizes the latest node and key actions", () => {
  const view = timelineOverviewView([
    { step: 7, kind: "attack", text: "星轨枪兵发动攻击。" },
    { step: 6, kind: "turn", text: "你的回合开始。" },
    { step: 5, kind: "summon", text: "召唤星轨枪兵。" }
  ]);

  assert.deepEqual(view, {
    latestStep: "#7",
    latestKind: "攻击",
    actionCount: 2
  });
  assert.equal(timelineKindLabel("trap"), "陷阱");
  assert.equal(timelineKindLabel("phase"), "转场");
  assert.equal(timelineKindLabel("unknown"), "记录");
  assert.equal(timelineKindGroup("damage"), "battle");
  assert.equal(timelineKindGroup("draw"), "cards");
  assert.equal(timelineKindGroup("turn"), "system");
  assert.equal(timelineKindGroup("phase"), "system");
});

test("chain history panel stays hidden until a completed chain is expanded", () => {
  const empty = chainHistoryPanelView({ expanded: true });
  const events = [
    { id: 1, type: "CHAIN_LINK_ADDED", linkId: 1, cardId: "trap:1", playerId: "player" },
    { id: 2, type: "CHAIN_LINK_RESOLVED", linkId: 1, cardId: "trap:1" },
    {
      id: 3,
      type: "CHAIN_RESOLVED",
      resolvedLinks: [{ linkId: 1, cardId: "trap:1", playerId: "player" }]
    }
  ];
  const collapsed = chainHistoryPanelView({
    events,
    findCard: () => ({ id: "counter-array", name: "反击阵列" }),
    expanded: false
  });
  const expanded = chainHistoryPanelView({
    events,
    findCard: () => ({ id: "counter-array", name: "反击阵列" }),
    expanded: true
  });

  assert.equal(empty.hasHistory, false);
  assert.equal(empty.expanded, false);
  assert.equal(collapsed.count, 1);
  assert.equal(collapsed.expanded, false);
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.histories[0].links[0].name, "反击阵列");
});

test("timeline viewport follows the latest only when the player was already at the top", () => {
  const browsingRoot = {
    scrollTop: 122,
    scrollLeft: 7,
    scrollHeight: 500,
    children: [timelineItem(12, 0), timelineItem(11, 40), timelineItem(10, 100, 60)]
  };
  const browsing = captureTimelineViewport(browsingRoot);

  assert.equal(browsing.wasAtLatest, false);
  assert.equal(browsing.anchorStep, "10");
  assert.equal(browsing.anchorOffset, 22);

  const rerenderedRoot = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 560,
    children: [timelineItem(13, 0), timelineItem(12, 40), timelineItem(11, 80), timelineItem(10, 140, 60)]
  };
  restoreTimelineViewport(rerenderedRoot, browsing);
  assert.equal(rerenderedRoot.scrollTop, 162, "the same event should stay under the pointer after new entries prepend");
  assert.equal(rerenderedRoot.scrollLeft, 7);

  const following = captureTimelineViewport({
    scrollTop: 8,
    scrollLeft: 0,
    scrollHeight: 400,
    children: [timelineItem(12, 0)]
  });
  rerenderedRoot.scrollTop = 80;
  restoreTimelineViewport(rerenderedRoot, following);
  assert.equal(rerenderedRoot.scrollTop, 0);
});
