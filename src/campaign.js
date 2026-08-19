// Campaign domain logic: chapter gating, star ratings, unlocks and rewards.
// Browser persistence and wall-clock time are supplied by the caller.

export const CAMPAIGN_VERSION = 1;
export const MAX_CAMPAIGN_STARS_PER_CHAPTER = 3;

export const campaignDefinitions = [
  {
    id: "star-trial",
    label: "星魂试炼",
    kicker: "CAMPAIGN I",
    description: "从逆袭觉醒到终局三神，一路完成星魂的试炼。胜利可得基础星，完成章节目标可追求满星，累计星级解锁称号。",
    chapters: [
      {
        id: "comeback",
        scenarioId: "protagonistComeback",
        label: "逆袭觉醒",
        phase: "序章",
        objectives: [
          {
            id: "revive-ace",
            label: "用醒星回召让天穹逆星者从墓地归来",
            hint: "先补充手牌，再用醒星回召指定墓地里的王牌。",
            when: { eventType: "MONSTER_SUMMONED", playerId: "player", cardId: "astral-comet-ace", fromZone: "grave" }
          },
          {
            id: "ace-counterattack",
            label: "用天穹逆星者宣告反击",
            hint: "强化返场王牌，进入战斗阶段向对手宣告攻击。",
            when: { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "astral-comet-ace" }
          }
        ]
      },
      {
        id: "comeback-challenge",
        scenarioId: "protagonistComebackChallenge",
        label: "逆袭·挑战",
        phase: "初试",
        objectives: [
          {
            id: "guard-last-light",
            label: "发动残光护幕挡下关键攻击",
            hint: "先补牌、回召并强化王牌；结束回合前盖下残光护幕，受击时发动。",
            when: { eventType: "CARD_ACTIVATED", cardId: "last-light-guard" }
          },
          {
            id: "break-snare-before-counterattack",
            label: "先破坏镜光反制，再用天穹逆星者攻击",
            hint: "用解印射线清掉镜光反制，再把战斗狂热交给王牌，连续攻击收尾。",
            progressHints: {
              1: "镜光反制已破；发动战斗狂热强化王牌，连续攻击收尾。"
            },
            sequence: [
              { eventType: "CARD_DESTROYED", cardId: "mirror-snare" },
              { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "astral-comet-ace" }
            ]
          }
        ]
      },
      {
        id: "ace-evolution",
        scenarioId: "protagonistAceEvolution",
        label: "王牌进化",
        phase: "进阶",
        winHint: "下回合发动战斗狂热并召唤星井巡游者；王牌两击破守护、压低生命，再由巡游者终结。",
        objectives: [
          {
            id: "forge-ace",
            label: "发动星魂铸升并召唤天炉星铠王",
            hint: "趁两只素材都在场，立即发动星魂铸升，完成王牌特殊召唤。",
            liveHints: [
              {
                text: "素材被击破：用星屑返轨回收它，重新召唤后再发动星魂铸升。",
                when: { eventType: "CARD_DESTROYED", cardId: "ember-soul-initiate" }
              },
              {
                text: "素材被击破：用星屑返轨回收它，重新召唤后再发动星魂铸升。",
                when: { eventType: "CARD_DESTROYED", cardId: "lumen-gearlet" }
              },
              {
                text: "两只进化素材均已被击破，本次铸升路线已中断；从设置中重新开始本章可重试满星路线。",
                sequence: [
                  { eventType: "CARD_DESTROYED", cardId: "ember-soul-initiate" },
                  { eventType: "CARD_DESTROYED", cardId: "lumen-gearlet" }
                ]
              },
              {
                text: "两只进化素材均已被击破，本次铸升路线已中断；从设置中重新开始本章可重试满星路线。",
                sequence: [
                  { eventType: "CARD_DESTROYED", cardId: "lumen-gearlet" },
                  { eventType: "CARD_DESTROYED", cardId: "ember-soul-initiate" }
                ]
              }
            ],
            sequence: [
              { eventType: "CARD_ACTIVATED", cardId: "soulforge-ascent" },
              { eventType: "MONSTER_SUMMONED", playerId: "player", cardId: "astral-forge-dragon", summonType: "special" }
            ]
          },
          {
            id: "forge-counterattack",
            label: "用天炉星铠王宣告反击",
            hint: "利用登场压制打开战斗阶段，再由进化王牌发动攻击。",
            when: { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "astral-forge-dragon" }
          }
        ]
      },
      {
        id: "trio-challenge",
        scenarioId: "protagonistTrioOmegaChallenge",
        label: "三神·挑战",
        phase: "挑战",
        winHint: "结算余烁小卫对星曜的第二击，完成终局逆转。",
        objectives: [
          {
            id: "snare-sun-judicator",
            label: "发动日冕诱锁破解曜冕裁决者",
            hint: "第一回合只盖下日冕诱锁并结束回合；日曜攻击时发动它。",
            liveHints: [
              {
                text: "你过早发起了攻击；保留日冕诱锁并跨过对手回合才是本章开局。",
                when: { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "trio-decoy-ward" }
              }
            ],
            when: { eventType: "CARD_ACTIVATED", cardId: "trio-solar-snare" }
          },
          {
            id: "ember-pawn-finale",
            label: "清除月曜帷幕后，让余烁小卫完成两次终局攻击",
            hint: "抽到碎月解幕后先清除月曜帷幕，再回召墓地里的低星余烁小卫。",
            progressHints: {
              1: "月曜帷幕已破；用余烁归轨回召墓地里的余烁小卫，别选高攻诱饵。",
              2: "余烁小卫已回场；发动三曜终断，把终局力量交给它。",
              3: "先让余烁小卫攻击月曜守望者，保留追加攻击破解星曜。",
              4: "月曜已破；用余烁小卫的追加攻击击破星曜先知。"
            },
            liveHints: [
              {
                text: "唯一回召已用于高攻诱饵，本次低星终局路线已中断；重新挑战可补完满星。",
                when: { eventType: "MONSTER_SUMMONED", playerId: "player", cardId: "flare-titan", fromZone: "grave" }
              }
            ],
            sequence: [
              { eventType: "CARD_DESTROYED", cardId: "trio-moon-dominion" },
              { eventType: "MONSTER_SUMMONED", playerId: "player", cardId: "trio-ember-pawn", fromZone: "grave" },
              { eventType: "CARD_ACTIVATED", cardId: "trio-final-counter" },
              { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "trio-ember-pawn" },
              { eventType: "ATTACK_DECLARED", playerId: "player", cardId: "trio-ember-pawn" }
            ]
          }
        ]
      },
      {
        id: "trio-full",
        scenarioId: "protagonistTrioOmegaFull",
        label: "三神·完整对局",
        phase: "高难",
        winHint: "三曜已全部落位；清除月曜帷幕，保留低星墓地资源，逐一击破三神并赢得完整对局。",
        objectives: [
          {
            id: "break-tribute-and-arm-snare",
            label: "首回合击破祭品候选，并盖下日冕诱锁",
            hint: "先用先知召见补牌，再召唤星火信使并用战斗狂热强化；击破钢壁守卫后盖下日冕诱锁。",
            progressHints: {
              1: "祭品候选已击破；结束回合前盖下日冕诱锁，准备试探对手的断链保护。"
            },
            sequence: [
              { eventType: "CARD_DESTROYED", cardId: "iron-guardian" },
              { eventType: "TRAP_SET", playerId: "player", cardId: "trio-solar-snare" }
            ]
          },
          {
            id: "survive-first-convergence",
            label: "见证三曜共降，发动诱锁并撑过第一波神攻",
            hint: "对手仍有三只祭品；进入其回合后观察完整的三祭品召唤与三曜共降。",
            progressHints: {
              1: "三曜已经共降；日曜攻击时发动盖好的日冕诱锁，逼出断链裁决。",
              2: "断链保护已暴露；撑过这次攻击并回到自己的主要阶段。"
            },
            sequence: [
              { eventType: "TRIO_CONVERGENCE_RESOLVED", playerId: "ai" },
              { eventType: "CARD_ACTIVATED", playerId: "player", cardId: "trio-solar-snare" },
              { eventType: "TURN_STARTED", playerId: "player" }
            ]
          }
        ]
      },
      { id: "trio-ascension", scenarioId: "protagonistTrioOmegaAscension", label: "三神·逐神降临", phase: "终局" }
    ],
    rewards: [
      { id: "trialist", atStars: 6, kind: "title", title: "试炼者", text: "累积 6 星" },
      { id: "star-summoner", atStars: 12, kind: "title", title: "星魂唤者", text: "累积 12 星" },
      { id: "trio-conqueror", requiresCompletion: true, kind: "title", title: "三神征服者", text: "通关全部章节" }
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

function normalizeChapterProgress(entry = {}) {
  return {
    stars: clampStars(entry?.stars),
    remainingLp: Math.max(0, Math.trunc(Number(entry?.remainingLp) || 0)),
    attempts: clampAttempts(entry?.attempts),
    clearedAt: typeof entry?.clearedAt === "string" ? entry.clearedAt : "",
    objectiveIds: [...new Set(
      (Array.isArray(entry?.objectiveIds) ? entry.objectiveIds : [])
        .filter((id) => typeof id === "string" && id)
    )]
  };
}

export function cloneCampaignProgress(progress = {}) {
  const source = progress && typeof progress === "object" ? progress : {};
  const campaigns = {};
  const sourceCampaigns = source.campaigns && typeof source.campaigns === "object" && !Array.isArray(source.campaigns)
    ? source.campaigns
    : {};
  for (const [campaignId, campaign] of Object.entries(sourceCampaigns)) {
    if (!campaign || typeof campaign !== "object") continue;
    const chapters = {};
    const sourceChapters = campaign.chapters && typeof campaign.chapters === "object" && !Array.isArray(campaign.chapters)
      ? campaign.chapters
      : {};
    for (const [chapterId, entry] of Object.entries(sourceChapters)) {
      if (!entry || typeof entry !== "object") continue;
      chapters[chapterId] = normalizeChapterProgress(entry);
    }
    campaigns[campaignId] = { chapters };
  }
  return { version: CAMPAIGN_VERSION, campaigns };
}

export function campaignDefinitionById(campaignId, campaigns = campaignDefinitions) {
  return (campaigns || []).find((campaign) => campaign.id === campaignId) || null;
}

export function campaignChapterDefinition(campaign, chapterId) {
  return campaign?.chapters?.find((chapter) => chapter.id === chapterId) || null;
}

export function campaignChapterRatingMaxLp(chapter, scenarios = {}, fallbackMaxLp = 4000) {
  const explicitMax = Number(chapter?.ratingMaxLp);
  if (Number.isFinite(explicitMax) && explicitMax > 0) return explicitMax;
  const scenarioMax = Number(scenarios?.[chapter?.scenarioId]?.playerLp);
  if (Number.isFinite(scenarioMax) && scenarioMax > 0) return scenarioMax;
  const fallback = Number(fallbackMaxLp);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 4000;
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

function normalizedObjectiveResults(chapter, objectiveResults = []) {
  const resultsById = new Map(
    (Array.isArray(objectiveResults) ? objectiveResults : [])
      .filter((result) => result && typeof result.id === "string")
      .map((result) => [result.id, result])
  );
  return (Array.isArray(chapter?.objectives) ? chapter.objectives : [])
    .slice(0, MAX_CAMPAIGN_STARS_PER_CHAPTER - 1)
    .map((objective) => ({
      id: objective.id,
      label: objective.label || objective.id,
      completed: Boolean(resultsById.get(objective.id)?.completed)
    }));
}

export function starsForCampaignResult(chapter, {
  win = false,
  remainingLp = 0,
  maxLp = 4000,
  objectiveResults = []
} = {}) {
  if (!win) return 0;
  const normalized = normalizedObjectiveResults(chapter, objectiveResults);
  if (normalized.length === 0) return starsForCampaignWin(remainingLp, maxLp);
  return clampStars(1 + normalized.filter((objective) => objective.completed).length);
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
      remainingLp: Math.max(0, Math.trunc(Number(entry?.remainingLp) || 0)),
      objectives: (Array.isArray(chapter.objectives) ? chapter.objectives : []).map((objective) => ({
        id: objective.id,
        label: objective.label || objective.id
      })),
      objectiveIds: [...new Set(
        (Array.isArray(entry?.objectiveIds) ? entry.objectiveIds : [])
          .filter((id) => typeof id === "string" && id)
      )]
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
    .filter((reward) => campaignRewardUnlocked(reward, summary))
    .map((reward) => ({ ...reward }));
}

export function campaignRewardUnlocked(reward, summary = {}) {
  if (reward?.requiresCompletion) return Boolean(summary.completed);
  const atStars = Number(reward?.atStars);
  return Number.isFinite(atStars) && atStars > 0 && Number(summary.stars) >= atStars;
}

function campaignRewardIdentity(reward, index) {
  return reward?.id || `${reward?.kind || "reward"}:${reward?.title || index}`;
}

export function recordCampaignChapterResult(
  progress = emptyCampaignProgress(),
  campaignId = "",
  chapterId = "",
  { win = false, remainingLp = 0, maxLp = 4000, recordedAt = "", objectiveResults = [] } = {}
) {
  const campaign = campaignDefinitionById(campaignId);
  const chapter = campaignChapterDefinition(campaign, chapterId);
  if (!campaign || !chapter) return { progress, result: null };

  const before = campaignChapterStates(campaign, progress);
  const current = before.find((state) => state.chapterId === chapterId);
  if (!current || current.locked) return { progress, result: null };

  const next = cloneCampaignProgress(progress);
  const campaignNode = next.campaigns[campaignId] || { chapters: {} };
  campaignNode.chapters ||= {};
  const chapterNode = campaignNode.chapters[chapterId] || {
    stars: 0,
    attempts: 0,
    remainingLp: 0,
    clearedAt: "",
    objectiveIds: []
  };
  chapterNode.attempts = clampAttempts(chapterNode.attempts) + 1;

  const normalizedObjectives = normalizedObjectiveResults(chapter, objectiveResults);
  const stars = starsForCampaignResult(chapter, { win, remainingLp, maxLp, objectiveResults });
  const improved = win && stars > clampStars(chapterNode.stars);
  if (improved) {
    chapterNode.stars = stars;
    chapterNode.remainingLp = Math.max(0, Math.trunc(Number(remainingLp) || 0));
    chapterNode.clearedAt = typeof recordedAt === "string" ? recordedAt : "";
    chapterNode.objectiveIds = normalizedObjectives
      .filter((objective) => objective.completed)
      .map((objective) => objective.id);
  }
  campaignNode.chapters[chapterId] = chapterNode;
  next.campaigns[campaignId] = campaignNode;

  const beforeUnlocked = new Set(before.filter((state) => state.startable).map((state) => state.chapterId));
  const afterUnlocked = new Set(
    campaignChapterStates(campaign, next).filter((state) => state.startable).map((state) => state.chapterId)
  );
  const unlockedChapterIds = [...afterUnlocked].filter((id) => !beforeUnlocked.has(id));

  const summary = campaignProgressSummary(campaign, next);
  const rewardIdsBefore = new Set(
    unlockedCampaignRewards(campaign, progress).map((reward, index) => campaignRewardIdentity(reward, index))
  );
  const unlockedRewards = unlockedCampaignRewards(campaign, next).filter(
    (reward, index) => !rewardIdsBefore.has(campaignRewardIdentity(reward, index))
  );

  const result = {
    win,
    stars,
    improved,
    attempts: chapterNode.attempts,
    remainingLp: Math.max(0, Math.trunc(Number(remainingLp) || 0)),
    ratingMaxLp: Math.max(1, Number(maxLp) || 1),
    objectiveResults: normalizedObjectives,
    totalStars: summary.stars,
    maxStars: summary.maxStars,
    completed: summary.completed,
    unlockedChapterIds,
    unlockedRewards
  };
  return { progress: next, result };
}
