import {
  MAX_CAMPAIGN_STARS_PER_CHAPTER,
  campaignDefinitions,
  campaignChapterStates,
  campaignProgressSummary,
  campaignRewardUnlocked
} from "./campaign.js";

export function chapterStarsText(stars) {
  const count = Math.max(0, Math.min(MAX_CAMPAIGN_STARS_PER_CHAPTER, Math.trunc(Number(stars) || 0)));
  return "★".repeat(count) + "☆".repeat(MAX_CAMPAIGN_STARS_PER_CHAPTER - count);
}

export function campaignHubView({
  campaigns = campaignDefinitions,
  progress = { version: 1, campaigns: {} },
  visible = true
} = {}) {
  const panels = campaigns.map((campaign) => {
    const states = campaignChapterStates(campaign, progress);
    const summary = campaignProgressSummary(campaign, progress);
    const rewards = (campaign.rewards || []).map((reward) => ({
      ...reward,
      unlocked: campaignRewardUnlocked(reward, summary)
    }));
    const progressText = summary.completed
      ? `已通关 · ${summary.stars}/${summary.maxStars} 星`
      : `进度 ${summary.clearedCount}/${summary.totalChapters} · ${summary.stars}/${summary.maxStars} 星`;
    return {
      id: campaign.id,
      label: campaign.label || campaign.id,
      kicker: campaign.kicker || "",
      description: campaign.description || "",
      progressText,
      completed: summary.completed,
      hidden: summary.totalChapters === 0,
      chapters: states.map((state) => ({
        ...state,
        starsText: chapterStarsText(state.stars),
        objectiveText: state.objectives.length
          ? `目标 ${state.objectiveIds.length}/${state.objectives.length}`
          : "生命评级",
        objectiveTitle: state.objectives.map((objective) => objective.label).join("\n")
      })),
      rewards
    };
  });
  return {
    hidden: !visible || panels.every((panel) => panel.hidden),
    panels
  };
}

export function renderCampaignHub(doc, elements, view) {
  if (!elements.campaignList) return false;
  const list = elements.campaignList;
  list.textContent = "";
  if (elements.campaignPanel) elements.campaignPanel.hidden = Boolean(view.hidden);
  list.hidden = Boolean(view.hidden);
  if (view.hidden) return true;

  view.panels.forEach((panel) => {
    const section = doc.createElement("section");
    section.className = "campaign-panel";
    section.dataset.campaignId = panel.id;

    const head = doc.createElement("div");
    head.className = "campaign-head";
    const titleWrap = doc.createElement("div");
    titleWrap.className = "campaign-title-wrap";
    if (panel.kicker) {
      const kicker = doc.createElement("small");
      kicker.className = "campaign-kicker";
      kicker.textContent = panel.kicker;
      titleWrap.appendChild(kicker);
    }
    const title = doc.createElement("strong");
    title.className = "campaign-title";
    title.textContent = panel.label;
    titleWrap.appendChild(title);
    if (panel.description) {
      const description = doc.createElement("p");
      description.className = "campaign-description";
      description.textContent = panel.description;
      titleWrap.appendChild(description);
    }
    const progress = doc.createElement("span");
    progress.className = panel.completed ? "campaign-progress completed" : "campaign-progress";
    progress.textContent = panel.progressText;
    head.append(titleWrap, progress);
    section.appendChild(head);

    const rows = doc.createElement("div");
    rows.className = "campaign-chapters";
    panel.chapters.forEach((chapter) => {
      const row = doc.createElement("button");
      row.type = "button";
      row.className = "campaign-chapter";
      row.dataset.campaignId = panel.id;
      row.dataset.campaignChapter = chapter.chapterId;
      row.disabled = !chapter.startable;
      row.classList.toggle("locked", chapter.locked);
      row.classList.toggle("cleared", chapter.cleared);

      const order = doc.createElement("span");
      order.className = "campaign-chapter-order";
      order.textContent = String(chapter.index + 1).padStart(2, "0");

      const main = doc.createElement("span");
      main.className = "campaign-chapter-main";
      const name = doc.createElement("strong");
      name.textContent = chapter.label;
      const meta = doc.createElement("small");
      meta.textContent = chapter.locked
        ? "未解锁"
        : `${chapter.phase || "战斗"} · ${chapter.objectiveText}`;
      if (chapter.objectiveTitle) row.title = chapter.objectiveTitle;
      main.append(name, meta);

      const stars = doc.createElement("span");
      stars.className = "campaign-chapter-stars";
      stars.textContent = chapter.starsText;

      row.append(order, main, stars);
      rows.appendChild(row);
    });
    section.appendChild(rows);

    if (panel.rewards.length) {
      const rewards = doc.createElement("div");
      rewards.className = "campaign-rewards";
      panel.rewards.forEach((reward) => {
        const playable = reward.kind === "scenario" && reward.scenarioId;
        const item = doc.createElement(playable ? "button" : "span");
        item.className = reward.unlocked ? "campaign-reward unlocked" : "campaign-reward";
        if (playable) {
          item.type = "button";
          item.classList.add("campaign-reward-action");
          item.disabled = !reward.unlocked;
          item.dataset.campaignId = panel.id;
          item.dataset.campaignReward = reward.id;
        }
        const marker = reward.unlocked ? (playable ? "▶" : "✔") : "☆";
        item.textContent = `${marker} ${reward.title}`;
        item.title = reward.text || "";
        rewards.appendChild(item);
      });
      section.appendChild(rewards);
    }

    list.appendChild(section);
  });
  return true;
}

export function campaignMissionView({
  campaign = null,
  chapter = null,
  objectiveResults = [],
  visible = true,
  win = false
} = {}) {
  if (!visible || !campaign || !chapter) return { hidden: true, items: [] };
  const chapterObjectives = Array.isArray(chapter.objectives) ? chapter.objectives : [];
  if (chapterObjectives.length === 0) return { hidden: true, items: [] };
  const resultsById = new Map(
    (Array.isArray(objectiveResults) ? objectiveResults : [])
      .filter((result) => result?.id)
      .map((result) => [result.id, result])
  );
  const challengeItems = chapterObjectives
    .slice(0, MAX_CAMPAIGN_STARS_PER_CHAPTER - 1)
    .map((objective) => {
      const result = resultsById.get(objective.id);
      const progress = Array.isArray(result?.eventIds) ? result.eventIds.length : 0;
      return {
        id: objective.id,
        label: objective.label || objective.id || "章节挑战",
        hint: result?.hint || objective.progressHints?.[progress] || objective.hint || "完成这项挑战以取得额外章节星。",
        kind: "challenge",
        completed: Boolean(result?.completed)
      };
    });
  const items = [
    ...challengeItems,
    {
      id: "chapter-win",
      label: "赢得本章（基础星）",
      hint: chapter.winHint || "完成反击路线并击败对手，取得本章基础星。",
      kind: "victory",
      completed: Boolean(win)
    }
  ];
  const completedCount = items.filter((item) => item.completed).length;
  const bossPhases = Array.isArray(chapter.bossPhases) ? chapter.bossPhases : [];
  const furthestCompletedChallenge = challengeItems.reduce(
    (furthest, item, index) => item.completed ? Math.max(furthest, index + 1) : furthest,
    0
  );
  const bossPhaseIndex = Math.min(furthestCompletedChallenge, Math.max(0, bossPhases.length - 1));
  const bossPhaseDefinition = bossPhases[bossPhaseIndex] || null;
  const focusIndex = items.findIndex((item) => !item.completed);
  items.forEach((item, index) => {
    item.step = index + 1;
    item.focused = index === (focusIndex >= 0 ? focusIndex : items.length - 1);
    item.locked = !item.completed && index > (focusIndex >= 0 ? focusIndex : items.length - 1);
  });
  const focusedItem = items.find((item) => item.focused) || items.at(-1);
  return {
    hidden: false,
    kicker: campaign.kicker || "CAMPAIGN",
    title: chapter.label || chapter.id || "章节目标",
    progressText: `${completedCount} / ${items.length}`,
    hintText: focusedItem?.completed
      ? "章节路线已经全部完成。"
      : `步骤 ${focusedItem?.step || 1}/${items.length} · ${focusedItem?.hint || "继续推进章节路线。"}`,
    completedCount,
    totalCount: items.length,
    bossPhase: bossPhaseDefinition
      ? {
          ...bossPhaseDefinition,
          index: bossPhaseIndex,
          step: bossPhaseIndex + 1,
          total: bossPhases.length
        }
      : null,
    items
  };
}

export function renderCampaignMission(doc, elements, view) {
  if (!elements.campaignMission || !elements.campaignMissionList) return false;
  elements.campaignMission.hidden = Boolean(view.hidden);
  if (view.hidden) {
    elements.campaignMissionList.textContent = "";
    return true;
  }
  if (elements.campaignMissionKicker) elements.campaignMissionKicker.textContent = view.kicker;
  if (elements.campaignMissionTitle) elements.campaignMissionTitle.textContent = view.title;
  if (elements.campaignMissionProgress) elements.campaignMissionProgress.textContent = view.progressText;
  if (elements.campaignMissionHint) elements.campaignMissionHint.textContent = view.hintText;

  let bossPhase = elements.campaignMission.querySelector(".campaign-boss-phase");
  if (!view.bossPhase) {
    bossPhase?.remove();
  } else {
    if (!bossPhase) {
      bossPhase = doc.createElement("section");
      bossPhase.className = "campaign-boss-phase";
      bossPhase.setAttribute("aria-label", "Boss 阶段");
      elements.campaignMission.insertBefore(bossPhase, elements.campaignMissionList);
    }
    bossPhase.dataset.bossPhase = String(view.bossPhase.step);
    bossPhase.textContent = "";
    const label = doc.createElement("strong");
    label.textContent = view.bossPhase.label;
    const progress = doc.createElement("span");
    progress.textContent = `${view.bossPhase.step}/${view.bossPhase.total}`;
    const text = doc.createElement("small");
    text.textContent = view.bossPhase.text || "";
    bossPhase.append(label, progress, text);
  }

  const list = elements.campaignMissionList;
  list.textContent = "";
  list.title = view.items.map((item) => `${item.completed ? "已达成" : "未达成"}：${item.label}`).join("\n");
  view.items.forEach((item) => {
    const row = doc.createElement("li");
    row.className = "campaign-mission-item";
    row.classList.toggle("completed", item.completed);
    row.classList.toggle("focused", item.focused);
    row.classList.toggle("locked", item.locked);
    row.dataset.campaignObjective = item.id;

    const marker = doc.createElement("span");
    marker.className = "campaign-mission-marker";
    marker.textContent = item.completed ? "✓" : String(item.step);
    marker.setAttribute("aria-hidden", "true");
    const label = doc.createElement("span");
    label.className = "campaign-mission-label";
    label.textContent = item.label;
    const status = doc.createElement("small");
    status.textContent = item.completed ? "完成" : item.focused ? "当前" : "待解锁";
    row.append(marker, label, status);
    list.appendChild(row);
  });
  return true;
}

export function campaignGameOverModalView(result) {
  if (!result) return {};
  const objectives = Array.isArray(result.objectiveResults) ? result.objectiveResults : [];
  const completedObjectives = objectives.filter((objective) => objective.completed);
  const incompleteObjectives = objectives.filter((objective) => !objective.completed);
  const objectiveProgressText = objectives.length
    ? `章节目标 ${completedObjectives.length}/${objectives.length}`
    : `剩余生命 ${result.remainingLp}`;
  const objectiveRecap = [
    completedObjectives.length
      ? `已完成：${completedObjectives.map((objective) => objective.label || objective.id).join("、")}`
      : "",
    incompleteObjectives.length
      ? `待补完：${incompleteObjectives.map((objective) => objective.label || objective.id).join("、")}`
      : ""
  ].filter(Boolean).join("；");
  const objectiveRecapText = objectiveRecap ? `${objectiveRecap}。` : "";
  if (!result.win) {
    return {
      title: "战役 · 败北",
      text: `「${result.chapterLabel}」挑战失败（${objectiveProgressText}）。${objectiveRecapText}调整路线再次挑战：胜利获得基础星，章节目标各提供一星。`,
      actionText: "再次挑战"
    };
  }

  const titleRewards = (result.unlockedRewards || []).filter((reward) => reward.kind === "title");
  const playableRewards = (result.unlockedRewards || []).filter((reward) => reward.kind === "scenario");
  const rewardText = [
    titleRewards.length ? `解锁称号「${titleRewards.map((reward) => reward.title).join("、")}」！` : "",
    playableRewards.length ? `解锁玩法「${playableRewards.map((reward) => reward.title).join("、")}」！` : ""
  ].filter(Boolean).join("");
  const unlockText = result.unlockedChapterIds?.length && !result.nextChapter ? " 新章节已解锁。" : "";
  const completionText = result.completed ? " 战役已通关——你征服了星魂试炼！" : "";
  const nextChapterText = result.nextChapter
    ? ` 下一章预告：${result.nextChapter.phase ? `${result.nextChapter.phase} · ` : ""}「${result.nextChapter.label}」${result.nextChapter.unlocked ? "已解锁" : "等待解锁"}。`
    : "";
  return {
    title: "战役 · 章节胜利",
    text: `「${result.chapterLabel}」通关，获得 ${result.stars} 星（${objectiveProgressText}）！${objectiveRecapText}总进度 ${result.totalStars}/${result.maxStars} 星。${rewardText}${unlockText}${nextChapterText}${completionText}`,
    actionText: result.nextChapter ? "查看下一章" : "返回战役"
  };
}
