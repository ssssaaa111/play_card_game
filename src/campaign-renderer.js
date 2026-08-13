import {
  MAX_CAMPAIGN_STARS_PER_CHAPTER,
  campaignDefinitions,
  campaignChapterStates,
  campaignProgressSummary,
  unlockedCampaignRewards
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
      unlocked: summary.stars >= (Number(reward.atStars) || 0)
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
        starsText: chapterStarsText(state.stars)
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
      meta.textContent = chapter.locked ? "未解锁" : `${chapter.phase || "战斗"} · ${chapter.starsText}`;
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
        const item = doc.createElement("span");
        item.className = reward.unlocked ? "campaign-reward unlocked" : "campaign-reward";
        item.textContent = `${reward.unlocked ? "✔" : "☆"} ${reward.title}`;
        item.title = reward.text || "";
        rewards.appendChild(item);
      });
      section.appendChild(rewards);
    }

    list.appendChild(section);
  });
  return true;
}
