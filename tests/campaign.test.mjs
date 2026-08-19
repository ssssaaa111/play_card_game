import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_VERSION,
  MAX_CAMPAIGN_STARS_PER_CHAPTER,
  campaignChapterRatingMaxLp,
  campaignDefinitions,
  campaignChapterStates,
  campaignProgressSummary,
  cloneCampaignProgress,
  emptyCampaignProgress,
  maxCampaignStars,
  recordCampaignChapterResult,
  starsForCampaignResult,
  starsForCampaignWin,
  unlockedCampaignRewards
} from "../src/campaign.js";
import {
  CAMPAIGN_STORAGE_KEY,
  loadCampaignProgress,
  saveCampaignProgress
} from "../src/campaign-storage.js";
import {
  campaignGameOverModalView,
  campaignHubView,
  campaignMissionView,
  chapterStarsText
} from "../src/campaign-renderer.js";
import { scenarioSetups } from "../src/data.js";

const trialCampaign = campaignDefinitions.find((campaign) => campaign.id === "star-trial");

function chapterObjectiveResults(chapter, completedCount = chapter?.objectives?.length || 0) {
  return (chapter?.objectives || []).map((objective, index) => ({
    id: objective.id,
    label: objective.label,
    completed: index < completedCount
  }));
}

function fakeStorage(initial = null) {
  let data = initial;
  return {
    getItem(key) {
      if (key === CAMPAIGN_STORAGE_KEY) return data;
      return null;
    },
    setItem(key, value) {
      if (key === CAMPAIGN_STORAGE_KEY) data = value;
    }
  };
}

test("campaign definitions expose a playable star-trial campaign", () => {
  assert.ok(trialCampaign);
  assert.equal(trialCampaign.chapters.length, 6);
  assert.deepEqual(trialCampaign.chapters.slice(0, 5).map((chapter) => chapter.objectives.length), [2, 2, 2, 2, 2]);
  assert.equal(maxCampaignStars(trialCampaign), 18);
  assert.equal(campaignDefinitions.some((campaign) => campaign.id === "star-trial"), true);
});

test("campaign chapters derive attainable three-star baselines from their real scenarios", () => {
  const ratings = trialCampaign.chapters.map((chapter) => {
    const scenario = scenarioSetups[chapter.scenarioId];
    assert.ok(scenario, `missing scenario ${chapter.scenarioId}`);
    const ratingMaxLp = campaignChapterRatingMaxLp(chapter, scenarioSetups);
    return {
      chapterId: chapter.id,
      ratingMaxLp,
      stars: starsForCampaignWin(scenario.playerLp ?? 4000, ratingMaxLp)
    };
  });

  assert.deepEqual(ratings.map(({ ratingMaxLp }) => ratingMaxLp), [900, 900, 4000, 1300, 4000, 4000]);
  assert.deepEqual(ratings.map(({ stars }) => stars), [3, 3, 3, 3, 3, 3]);
});

test("star rating boundaries reflect remaining life ratios", () => {
  assert.equal(starsForCampaignWin(4000, 4000), 3);
  assert.equal(starsForCampaignWin(3200, 4000), 3);
  assert.equal(starsForCampaignWin(3199, 4000), 2);
  assert.equal(starsForCampaignWin(2000, 4000), 2);
  assert.equal(starsForCampaignWin(1999, 4000), 1);
  assert.equal(starsForCampaignWin(0, 4000), 1);
  assert.equal(starsForCampaignWin(Number.NaN, 4000), 1);
  assert.equal(starsForCampaignWin(-500, 4000), 1);
  assert.equal(starsForCampaignWin(5000, 4000), 3);
  assert.equal(chapterStarsText(0), "☆☆☆");
  assert.equal(chapterStarsText(1), "★☆☆");
  assert.equal(chapterStarsText(3), "★★★");
  assert.equal(chapterStarsText(9), "★★★");
});

test("objective chapters award one star for victory and one per completed goal", () => {
  const chapter = trialCampaign.chapters[0];
  assert.equal(starsForCampaignResult(chapter, { win: false, objectiveResults: chapterObjectiveResults(chapter, 2) }), 0);
  assert.equal(starsForCampaignResult(chapter, { win: true, objectiveResults: chapterObjectiveResults(chapter, 0) }), 1);
  assert.equal(starsForCampaignResult(chapter, { win: true, objectiveResults: chapterObjectiveResults(chapter, 1) }), 2);
  assert.equal(starsForCampaignResult(chapter, { win: true, objectiveResults: chapterObjectiveResults(chapter, 2) }), 3);
  assert.equal(starsForCampaignResult(trialCampaign.chapters[5], {
    win: true,
    remainingLp: 800,
    maxLp: 1000
  }), 3);
});

test("fresh progress locks every chapter except the first", () => {
  const states = campaignChapterStates(trialCampaign, emptyCampaignProgress());
  assert.equal(states.length, 6);
  assert.equal(states[0].startable, true);
  assert.equal(states[1].locked, true);
  assert.equal(states[5].locked, true);
  const summary = campaignProgressSummary(trialCampaign, emptyCampaignProgress());
  assert.deepEqual(summary, {
    clearedCount: 0,
    totalChapters: 6,
    stars: 0,
    maxStars: 18,
    completed: false,
    nextChapterId: "comeback"
  });
});

test("winning a chapter records stars and unlocks the next chapter", () => {
  let progress = emptyCampaignProgress();
  const first = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000,
    maxLp: 4000,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0])
  });
  progress = first.progress;
  assert.equal(first.result.stars, 3);
  assert.equal(first.result.improved, true);
  assert.equal(first.result.attempts, 1);
  assert.deepEqual(first.result.unlockedChapterIds, ["comeback-challenge"]);

  const states = campaignChapterStates(trialCampaign, progress);
  assert.equal(states[0].stars, 3);
  assert.equal(states[1].startable, true);
  assert.equal(states[2].locked, true);
  assert.equal(campaignProgressSummary(trialCampaign, progress).stars, 3);
});

test("locked chapters reject result recording", () => {
  const recorded = recordCampaignChapterResult(emptyCampaignProgress(), "star-trial", "trio-full", {
    win: true,
    remainingLp: 4000
  });
  assert.equal(recorded.result, null);
});

test("losses count attempts without clearing the chapter", () => {
  let progress = emptyCampaignProgress();
  const loss = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: false,
    remainingLp: 700
  });
  progress = loss.progress;
  assert.equal(loss.result.stars, 0);
  assert.equal(loss.result.improved, false);
  assert.equal(loss.result.attempts, 1);
  assert.equal(campaignChapterStates(trialCampaign, progress)[0].cleared, false);
  assert.equal(campaignChapterStates(trialCampaign, progress)[0].attempts, 1);
});

test("re-clears keep the best star rating and increment attempts", () => {
  let progress = emptyCampaignProgress();
  const low = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 2000,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0], 1)
  });
  progress = low.progress;
  assert.equal(low.result.stars, 2);

  const worse = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 100,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0], 0)
  });
  progress = worse.progress;
  assert.equal(worse.result.stars, 1);
  assert.equal(worse.result.improved, false);
  assert.equal(worse.result.attempts, 2);
  assert.equal(campaignChapterStates(trialCampaign, progress)[0].stars, 2);

  const best = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0], 2)
  });
  progress = best.progress;
  assert.equal(best.result.improved, true);
  assert.equal(best.result.attempts, 3);
  assert.equal(campaignChapterStates(trialCampaign, progress)[0].stars, 3);
});

test("clearing all chapters completes the campaign and unlocks every reward", () => {
  let progress = emptyCampaignProgress();
  trialCampaign.chapters.forEach((chapter, index) => {
    const recorded = recordCampaignChapterResult(progress, "star-trial", chapter.id, {
      win: true,
      remainingLp: 4000,
      maxLp: 4000,
      objectiveResults: chapterObjectiveResults(chapter)
    });
    progress = recorded.progress;
    assert.ok(recorded.result);
    if (index < trialCampaign.chapters.length - 1) {
      assert.equal(recorded.result.unlockedChapterIds[0], trialCampaign.chapters[index + 1].id);
    }
  });
  const summary = campaignProgressSummary(trialCampaign, progress);
  assert.equal(summary.completed, true);
  assert.equal(summary.stars, 18);
  assert.equal(summary.nextChapterId, null);
  assert.equal(unlockedCampaignRewards(trialCampaign, progress).length, 3);
});

test("rewards unlock at star thresholds", () => {
  let progress = emptyCampaignProgress();
  trialCampaign.chapters.slice(0, 2).forEach((chapter) => {
    const recorded = recordCampaignChapterResult(progress, "star-trial", chapter.id, {
      win: true,
      remainingLp: 4000,
      objectiveResults: chapterObjectiveResults(chapter)
    });
    progress = recorded.progress;
  });
  const rewards = unlockedCampaignRewards(trialCampaign, progress);
  assert.deepEqual(rewards.map((reward) => reward.title), ["试炼者"]);
});

test("completion reward follows chapter completion instead of requiring a perfect score", () => {
  let progress = emptyCampaignProgress();
  trialCampaign.chapters.forEach((chapter) => {
    progress = recordCampaignChapterResult(progress, "star-trial", chapter.id, {
      win: true,
      remainingLp: 1,
      maxLp: 4000
    }).progress;
  });

  assert.equal(campaignProgressSummary(trialCampaign, progress).completed, true);
  assert.deepEqual(
    unlockedCampaignRewards(trialCampaign, progress).map((reward) => reward.title),
    ["试炼者", "三神征服者"]
  );
});

test("campaign progress persists through save and load", () => {
  const storage = fakeStorage();
  let progress = emptyCampaignProgress();
  const recorded = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0])
  });
  progress = recorded.progress;
  assert.equal(saveCampaignProgress(progress, storage), true);

  const loaded = loadCampaignProgress(storage);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.stars, 3);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.attempts, 1);
  assert.deepEqual(loaded.campaigns["star-trial"].chapters.comeback.objectiveIds, [
    "revive-ace",
    "ace-counterattack"
  ]);
  assert.equal(loaded.version, 1);
});

test("corrupt or invalid stored progress falls back to empty defaults", () => {
  assert.deepEqual(loadCampaignProgress(fakeStorage("not json")), emptyCampaignProgress());
  assert.deepEqual(loadCampaignProgress(fakeStorage("null")), emptyCampaignProgress());
  assert.deepEqual(loadCampaignProgress(fakeStorage("42")), emptyCampaignProgress());
  assert.deepEqual(loadCampaignProgress(fakeStorage("{}")), emptyCampaignProgress());
  assert.deepEqual(loadCampaignProgress(null), emptyCampaignProgress());
});

test("loaded progress clamps stars and attempts into valid ranges", () => {
  const storage = fakeStorage(JSON.stringify({
    version: 99,
    campaigns: {
      "star-trial": {
        chapters: {
          comeback: { stars: 99, remainingLp: -10, attempts: -4, clearedAt: "2026-08-13T00:00:00.000Z" }
        }
      }
    }
  }));
  const loaded = loadCampaignProgress(storage);
  assert.equal(loaded.version, CAMPAIGN_VERSION);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.stars, MAX_CAMPAIGN_STARS_PER_CHAPTER);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.remainingLp, 0);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.attempts, 0);
});

test("blocked browser storage falls back without escaping an exception", () => {
  const existing = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("storage blocked");
    }
  });
  try {
    assert.deepEqual(loadCampaignProgress(), emptyCampaignProgress());
    assert.equal(saveCampaignProgress(emptyCampaignProgress()), false);
  } finally {
    if (existing) Object.defineProperty(globalThis, "localStorage", existing);
    else delete globalThis.localStorage;
  }
});

test("cloned progress is a deep copy", () => {
  const source = emptyCampaignProgress();
  source.campaigns.test = { chapters: { a: { stars: 2 } } };
  const clone = cloneCampaignProgress(source);
  clone.campaigns.test.chapters.a.stars = 1;
  assert.equal(source.campaigns.test.chapters.a.stars, 2);
});

test("campaign hub view tracks progress and reward state", () => {
  let progress = emptyCampaignProgress();
  const recorded = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000,
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0])
  });
  progress = recorded.progress;
  const view = campaignHubView({ progress });
  assert.equal(view.hidden, false);
  const panel = view.panels[0];
  assert.equal(panel.chapters[0].startable, true);
  assert.equal(panel.chapters[0].cleared, true);
  assert.equal(panel.chapters[0].starsText, "★★★");
  assert.equal(panel.chapters[0].objectiveText, "目标 2/2");
  assert.equal(panel.chapters[1].locked, false);
  assert.equal(panel.chapters[2].locked, true);
  assert.equal(panel.progressText, "进度 1/6 · 3/18 星");
  assert.equal(panel.completed, false);
  assert.equal(panel.rewards[0].unlocked, false);

  const hidden = campaignHubView({ progress, visible: false });
  assert.equal(hidden.hidden, true);
});

test("campaign game-over modal copy stays outside app orchestration", () => {
  assert.deepEqual(campaignGameOverModalView(null), {});
  const win = campaignGameOverModalView({
    win: true,
    chapterLabel: "逆袭觉醒",
    stars: 3,
    remainingLp: 900,
    totalStars: 3,
    maxStars: 18,
    unlockedChapterIds: ["comeback-challenge"],
    unlockedRewards: [],
    completed: false,
    nextChapter: {
      id: "comeback-challenge",
      label: "逆袭·挑战",
      phase: "初试",
      unlocked: true
    },
    objectiveResults: chapterObjectiveResults(trialCampaign.chapters[0])
  });
  assert.equal(win.title, "战役 · 章节胜利");
  assert.match(win.text, /获得 3 星/);
  assert.match(win.text, /章节目标 2\/2/);
  assert.match(win.text, /已完成：用醒星回召让天穹逆星者从墓地归来/);
  assert.match(win.text, /下一章预告：初试 · 「逆袭·挑战」已解锁/);
  assert.equal(win.actionText, "查看下一章");
  assert.equal(campaignGameOverModalView({ win: false, chapterLabel: "逆袭觉醒" }).actionText, "再次挑战");
});

test("live campaign mission view keeps victory and challenge stars explicit", () => {
  const chapter = trialCampaign.chapters[0];
  assert.deepEqual(campaignMissionView({ campaign: trialCampaign, chapter, visible: false }), {
    hidden: true,
    items: []
  });
  assert.deepEqual(campaignMissionView({ campaign: trialCampaign, chapter: trialCampaign.chapters[5] }), {
    hidden: true,
    items: []
  });

  const opening = campaignMissionView({ campaign: trialCampaign, chapter });
  assert.equal(opening.hidden, false);
  assert.equal(opening.title, "逆袭觉醒");
  assert.equal(opening.progressText, "0 / 3");
  assert.equal(opening.hintText, "步骤 1/3 · 先补充手牌，再用醒星回召指定墓地里的王牌。");
  assert.deepEqual(opening.items.map((item) => [item.id, item.completed, item.focused, item.locked]), [
    ["revive-ace", false, true, false],
    ["ace-counterattack", false, false, true],
    ["chapter-win", false, false, true]
  ]);

  const revived = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: chapterObjectiveResults(chapter, 1)
  });
  assert.equal(revived.progressText, "1 / 3");
  assert.equal(revived.items[0].completed, true);
  assert.equal(revived.items[1].focused, true);
  assert.match(revived.hintText, /步骤 2\/3/);

  const victory = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: chapterObjectiveResults(chapter),
    win: true
  });
  assert.equal(victory.progressText, "3 / 3");
  assert.equal(victory.items.every((item) => item.completed), true);
  assert.equal(victory.hintText, "章节路线已经全部完成。");
});

test("challenge mission guidance advances within a multi-event objective", () => {
  const chapter = trialCampaign.chapters.find((entry) => entry.id === "comeback-challenge");
  const opening = campaignMissionView({ campaign: trialCampaign, chapter });
  assert.equal(
    opening.hintText,
    "步骤 1/3 · 先补牌、回召并强化王牌；结束回合前盖下残光护幕，受击时发动。"
  );

  const guarded = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      { id: "guard-last-light", completed: true, eventIds: [11] },
      { id: "break-snare-before-counterattack", completed: false, eventIds: [] }
    ]
  });
  assert.equal(
    guarded.hintText,
    "步骤 2/3 · 用解印射线清掉镜光反制，再把战斗狂热交给王牌，连续攻击收尾。"
  );

  const snareBroken = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      { id: "guard-last-light", completed: true, eventIds: [11] },
      { id: "break-snare-before-counterattack", completed: false, eventIds: [27] }
    ]
  });
  assert.equal(
    snareBroken.hintText,
    "步骤 2/3 · 镜光反制已破；发动战斗狂热强化王牌，连续攻击收尾。"
  );
});

test("ace evolution mission exposes recovery and authored victory routes", () => {
  const chapter = trialCampaign.chapters.find((entry) => entry.id === "ace-evolution");
  const recovery = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      {
        id: "forge-ace",
        completed: false,
        eventIds: [],
        hint: "素材被击破：用星屑返轨回收它，重新召唤后再发动星魂铸升。"
      }
    ]
  });
  assert.equal(
    recovery.hintText,
    "步骤 1/3 · 素材被击破：用星屑返轨回收它，重新召唤后再发动星魂铸升。"
  );

  const finale = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: chapterObjectiveResults(chapter)
  });
  assert.equal(finale.progressText, "2 / 3");
  assert.equal(
    finale.hintText,
    "步骤 3/3 · 下回合发动战斗狂热并召唤星井巡游者；王牌两击破守护、压低生命，再由巡游者终结。"
  );
});

test("trio challenge mission guides each classic finale decision", () => {
  const chapter = trialCampaign.chapters.find((entry) => entry.id === "trio-challenge");
  const firstComplete = { id: "snare-sun-judicator", completed: true, eventIds: [1] };
  const finaleProgress = (eventIds, hint = "") => ({
    id: "ember-pawn-finale",
    completed: false,
    eventIds,
    hint
  });

  const opening = campaignMissionView({ campaign: trialCampaign, chapter });
  assert.equal(opening.progressText, "0 / 3");
  assert.match(opening.hintText, /步骤 1\/3.*日冕诱锁/);

  const dominionBroken = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [firstComplete, finaleProgress([2])]
  });
  assert.match(dominionBroken.hintText, /余烁归轨/);

  const pawnRecalled = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [firstComplete, finaleProgress([2, 3])]
  });
  assert.match(pawnRecalled.hintText, /三曜终断/);

  const counterReady = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [firstComplete, finaleProgress([2, 3, 4])]
  });
  assert.match(counterReady.hintText, /攻击月曜/);

  const secondAttack = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [firstComplete, finaleProgress([2, 3, 4, 5])]
  });
  assert.match(secondAttack.hintText, /追加攻击/);

  const wrongRecall = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      firstComplete,
      finaleProgress([2], "唯一回召已用于高攻诱饵，本次低星终局路线已中断；重新挑战可补完满星。")
    ]
  });
  assert.match(wrongRecall.hintText, /路线已中断/);

  const winReady = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: chapterObjectiveResults(chapter)
  });
  assert.equal(winReady.progressText, "2 / 3");
  assert.match(winReady.hintText, /余烁小卫对星曜的第二击/);
});

test("full duel mission tracks the opening disruption and first god wave", () => {
  const chapter = trialCampaign.chapters.find((entry) => entry.id === "trio-full");
  const opening = campaignMissionView({ campaign: trialCampaign, chapter });
  assert.equal(opening.progressText, "0 / 3");
  assert.match(opening.hintText, /步骤 1\/3.*星火信使/);

  const tributeBroken = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      { id: "break-tribute-and-arm-snare", completed: false, eventIds: [10] },
      { id: "survive-first-convergence", completed: false, eventIds: [] }
    ]
  });
  assert.match(tributeBroken.hintText, /盖下日冕诱锁/);

  const openingComplete = { id: "break-tribute-and-arm-snare", completed: true, eventIds: [10, 11] };
  const convergence = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      openingComplete,
      { id: "survive-first-convergence", completed: false, eventIds: [20] }
    ]
  });
  assert.match(convergence.hintText, /逼出断链裁决/);

  const snareCommitted = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: [
      openingComplete,
      { id: "survive-first-convergence", completed: false, eventIds: [20, 21] }
    ]
  });
  assert.match(snareCommitted.hintText, /回到自己的主要阶段/);

  const counterattack = campaignMissionView({
    campaign: trialCampaign,
    chapter,
    objectiveResults: chapterObjectiveResults(chapter)
  });
  assert.equal(counterattack.progressText, "2 / 3");
  assert.match(counterattack.hintText, /逐一击破三神/);
});
