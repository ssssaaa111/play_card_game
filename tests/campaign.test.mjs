import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_STORAGE_KEY,
  MAX_CAMPAIGN_STARS_PER_CHAPTER,
  campaignDefinitions,
  campaignChapterStates,
  campaignProgressSummary,
  cloneCampaignProgress,
  emptyCampaignProgress,
  loadCampaignProgress,
  maxCampaignStars,
  recordCampaignChapterResult,
  saveCampaignProgress,
  starsForCampaignWin,
  unlockedCampaignRewards
} from "../src/campaign.js";
import { campaignHubView, chapterStarsText } from "../src/campaign-renderer.js";

const trialCampaign = campaignDefinitions.find((campaign) => campaign.id === "star-trial");

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
  assert.equal(maxCampaignStars(trialCampaign), 18);
  assert.equal(campaignDefinitions.some((campaign) => campaign.id === "star-trial"), true);
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
    maxLp: 4000
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
    remainingLp: 2000
  });
  progress = low.progress;
  assert.equal(low.result.stars, 2);

  const worse = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 100
  });
  progress = worse.progress;
  assert.equal(worse.result.stars, 1);
  assert.equal(worse.result.improved, false);
  assert.equal(worse.result.attempts, 2);
  assert.equal(campaignChapterStates(trialCampaign, progress)[0].stars, 2);

  const best = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000
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
      maxLp: 4000
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
      remainingLp: 4000
    });
    progress = recorded.progress;
  });
  const rewards = unlockedCampaignRewards(trialCampaign, progress);
  assert.deepEqual(rewards.map((reward) => reward.title), ["试炼者"]);
});

test("campaign progress persists through save and load", () => {
  const storage = fakeStorage();
  let progress = emptyCampaignProgress();
  const recorded = recordCampaignChapterResult(progress, "star-trial", "comeback", {
    win: true,
    remainingLp: 4000
  });
  progress = recorded.progress;
  assert.equal(saveCampaignProgress(progress, storage), true);

  const loaded = loadCampaignProgress(storage);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.stars, 3);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.attempts, 1);
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
  assert.equal(loaded.version, 99);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.stars, MAX_CAMPAIGN_STARS_PER_CHAPTER);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.remainingLp, 0);
  assert.equal(loaded.campaigns["star-trial"].chapters.comeback.attempts, 0);
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
    remainingLp: 4000
  });
  progress = recorded.progress;
  const view = campaignHubView({ progress });
  assert.equal(view.hidden, false);
  const panel = view.panels[0];
  assert.equal(panel.chapters[0].startable, true);
  assert.equal(panel.chapters[0].cleared, true);
  assert.equal(panel.chapters[0].starsText, "★★★");
  assert.equal(panel.chapters[1].locked, false);
  assert.equal(panel.chapters[2].locked, true);
  assert.equal(panel.progressText, "进度 1/6 · 3/18 星");
  assert.equal(panel.completed, false);
  assert.equal(panel.rewards[0].unlocked, false);

  const hidden = campaignHubView({ progress, visible: false });
  assert.equal(hidden.hidden, true);
});
