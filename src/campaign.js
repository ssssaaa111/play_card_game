// Persistent campaign mode: chapter gating, star ratings, unlocks and rewards.
// Pure logic only. Storage is injected so tests can run without a browser.

export const CAMPAIGN_STORAGE_KEY = "starDuelCampaignProgress";
export const CAMPAIGN_VERSION = 1;
export const MAX_CAMPAIGN_STARS_PER_CHAPTER = 3;

export const campaignDefinitions = [
  {
    id: "star-trial",
    label: "星魂试炼",
    kicker: "CAMPAIGN I",
    description: "从逆袭觉醒到终局三神，一路完成星魂的试炼。胜利时剩余生命越多星级越高，累计星级可解锁称号。",
    chapters: [
      { id: "comeback", scenarioId: "protagonistComeback", label: "逆袭觉醒", phase: "序章" },
      { id: "comeback-challenge", scenarioId: "protagonistComebackChallenge", label: "逆袭·挑战", phase: "初试" },
      { id: "ace-evolution", scenarioId: "protagonistAceEvolution", label: "王牌进化", phase: "进阶" },
      { id: "trio-challenge", scenarioId: "protagonistTrioOmegaChallenge", label: "三神·挑战", phase: "挑战" },
      { id: "trio-full", scenarioId: "protagonistTrioOmegaFull", label: "三神·完整对局", phase: "高难" },
      { id: "trio-ascension", scenarioId: "protagonistTrioOmegaAscension", label: "三神·逐神降临", phase: "终局" }
    ],
    rewards: [
      { atStars: 6, kind: "title", title: "试炼者", text: "累积 6 星" },
      { atStars: 12, kind: "title", title: "星魂唤者", text: "累积 12 星" },
      { atStars: 18, kind: "title", title: "三神征服者", text: "通关全部章节" }
    ]
  }
];

function clampStars(value) {
  return Math.max(0, Math.min(MAX_CAMPAIGN_STARS_PER_CHAPTER, Math.trunc(Number(value) || 0)));
}

function clampAttempts(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function emptyCampaignProgress() {
  return { version: CAMPAIGN_VERSION, campaigns: {} };
}

export function cloneCampaignProgress(progress = {}) {
  const source = progress || {};
  const campaigns = {};
  for (const [campaignId, campaign] of Object.entries(source.campaigns || {})) {
    if (!campaign || typeof campaign !== "object") continue;
    const chapters = {};
    for (const [chapterId, entry] of Object.entries(campaign.chapters || {})) {
      if (!entry || typeof entry !== "object") continue;
      chapters[chapterId] = {
        stars: clampStars(entry.stars),
        remainingLp: Math.max(0, Math.trunc(Number(entry.remainingLp) || 0)),
        attempts: clampAttempts(entry.attempts),
        clearedAt: typeof entry.clearedAt === "string" ? entry.clearedAt : ""
      };
    }
    campaigns[campaignId] = { chapters };
  }
  return { version: CAMPAIGN_VERSION, campaigns };
}

export function loadCampaignProgress(storage = defaultStorage()) {
  let parsed = null;
  try {
    const raw = storage?.getItem?.(CAMPAIGN_STORAGE_KEY);
    parsed = typeof raw === "string" && raw ? JSON.parse(raw) : null;
  } catch (error) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return emptyCampaignProgress();
  const progress = emptyCampaignProgress();
  const version = Number(parsed.version);
  if (Number.isFinite(version) && version > 0) progress.version = Math.trunc(version);
  if (parsed.campaigns && typeof parsed.campaigns === "object") {
    for (const [campaignId, campaign] of Object.entries(parsed.campaigns)) {
      if (!campaign || typeof campaign !== "object") continue;
      const chapters = {};
      if (campaign.chapters && typeof campaign.chapters === "object") {
        for (const [chapterId, entry] of Object.entries(campaign.chapters)) {
          if (!entry || typeof entry !== "object") continue;
          chapters[chapterId] = {
            stars: clampStars(entry.stars),
            remainingLp: Math.max(0, Math.trunc(Number(entry.remainingLp) || 0)),
            attempts: clampAttempts(entry.attempts),
            clearedAt: typeof entry.clearedAt === "string" ? entry.clearedAt : ""
          };
        }
      }
      progress.campaigns[campaignId] = { chapters };
    }
  }
  return progress;
}

export function saveCampaignProgress(progress = emptyCampaignProgress(), storage = defaultStorage()) {
  try {
    storage?.setItem?.(CAMPAIGN_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    return false;
  }
}

function defaultStorage() {
  return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
}

export function maxCampaignStars(campaign) {
  return (campaign?.chapters?.length || 0) * MAX_CAMPAIGN_STARS_PER_CHAPTER;
}

export function starsForCampaignWin(remainingLp, maxLp = 4000) {
  const max = Math.max(1, Number(maxLp) || 1);
  const remaining = Math.max(0, Number(remainingLp) || 0);
  const ratio = Math.min(1, remaining / max);
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

export function campaignChapterStates(campaign, progress = emptyCampaignProgress()) {
  const entries = [];
  const chapters = Array.isArray(campaign?.chapters) ? campaign.chapters : [];
  chapters.forEach((chapter, index) => {
    const entry = progress?.campaigns?.[campaign?.id]?.chapters?.[chapter.id];
    const previous = entries[index - 1];
    const cleared = Boolean(entry && entry.stars > 0);
    const locked = index > 0 && !previous?.cleared;
    entries.push({
      index,
      chapterId: chapter.id,
      scenarioId: chapter.scenarioId,
      label: chapter.label || chapter.id,
      phase: chapter.phase || "",
      locked,
      startable: !locked,
      cleared,
      stars: clampStars(entry?.stars),
      attempts: clampAttempts(entry?.attempts),
      remainingLp: Math.max(0, Math.trunc(Number(entry?.remainingLp) || 0))
    });
  });
  return entries;
}

export function campaignProgressSummary(campaign, progress = emptyCampaignProgress()) {
  const states = campaignChapterStates(campaign, progress);
  const clearedCount = states.filter((state) => state.cleared).length;
  const stars = states.reduce((sum, state) => sum + state.stars, 0);
  const maxStars = maxCampaignStars(campaign);
  const completed = states.length > 0 && clearedCount === states.length;
  const nextChapterId = states.find((state) => !state.cleared)?.chapterId || null;
  return {
    clearedCount,
    totalChapters: states.length,
    stars,
    maxStars,
    completed,
    nextChapterId
  };
}

export function unlockedCampaignRewards(campaign, progress = emptyCampaignProgress()) {
  const summary = campaignProgressSummary(campaign, progress);
  return (campaign?.rewards || [])
    .filter((reward) => summary.stars >= (Number(reward.atStars) || 0))
    .map((reward) => ({ ...reward }));
}

export function recordCampaignChapterResult(
  progress = emptyCampaignProgress(),
  campaignId = "",
  chapterId = "",
  { win = false, remainingLp = 0, maxLp = 4000 } = {}
) {
  const campaign = (campaignDefinitions || []).find((candidate) => candidate.id === campaignId);
  const chapter = campaign?.chapters.find((candidate) => candidate.id === chapterId);
  if (!campaign || !chapter) return { progress, result: null };

  const before = campaignChapterStates(campaign, progress);
  const current = before.find((state) => state.chapterId === chapterId);
  if (!current || current.locked) return { progress, result: null };

  const next = cloneCampaignProgress(progress);
  const campaignNode = next.campaigns[campaignId] || { chapters: {} };
  campaignNode.chapters ||= {};
  const chapterNode = campaignNode.chapters[chapterId] || { stars: 0, attempts: 0, remainingLp: 0, clearedAt: "" };
  chapterNode.attempts = clampAttempts(chapterNode.attempts) + 1;

  const stars = win ? starsForCampaignWin(remainingLp, maxLp) : 0;
  const improved = win && stars > clampStars(chapterNode.stars);
  if (improved) {
    chapterNode.stars = stars;
    chapterNode.remainingLp = Math.max(0, Math.trunc(Number(remainingLp) || 0));
    chapterNode.clearedAt = new Date().toISOString();
  }
  campaignNode.chapters[chapterId] = chapterNode;
  next.campaigns[campaignId] = campaignNode;

  const beforeUnlocked = new Set(before.filter((state) => state.startable).map((state) => state.chapterId));
  const afterUnlocked = new Set(
    campaignChapterStates(campaign, next).filter((state) => state.startable).map((state) => state.chapterId)
  );
  const unlockedChapterIds = [...afterUnlocked].filter((id) => !beforeUnlocked.has(id));

  const summary = campaignProgressSummary(campaign, next);
  const rewardCountBefore = unlockedCampaignRewards(campaign, progress).length;
  const unlockedRewards = unlockedCampaignRewards(campaign, next).slice(rewardCountBefore);

  const result = {
    win,
    stars,
    improved,
    attempts: chapterNode.attempts,
    remainingLp: Math.max(0, Math.trunc(Number(remainingLp) || 0)),
    totalStars: summary.stars,
    maxStars: summary.maxStars,
    completed: summary.completed,
    unlockedChapterIds,
    unlockedRewards
  };
  return { progress: next, result };
}
