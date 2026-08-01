import { buildLifeDisplay } from "./life-display.js";

export function vitalStatusItems({
  duelist = {},
  lifeTone = "stable",
  activeTurn = "idle",
  paused = false
} = {}) {
  const ownsTurn = activeTurn === duelist.owner;
  const turnStatus = paused
    ? { label: "已暂停", tone: "idle" }
    : ownsTurn
      ? {
        label: duelist.owner === "player" ? "你的回合" : "对手行动",
        tone: "turn"
      }
      : { label: "待机", tone: "idle" };
  return [
    turnStatus,
    duelist.shield > 0 ? { label: `护盾 ${duelist.shield}`, tone: "shield" } : null,
    duelist.extraSummon > 0
      ? { label: `额外召唤 ${duelist.extraSummon}`, tone: "resource" }
      : null,
    lifeTone === "critical"
      ? { label: "生命危急", tone: "critical" }
      : lifeTone === "warning"
        ? { label: "生命警戒", tone: "warning" }
        : null
  ].filter(Boolean);
}

export function buildDuelistHudView({
  duelist = {},
  profile = {},
  activeTurn = "idle",
  paused = false,
  maxLife = 4000,
  directTargetReady = false
} = {}) {
  const baseLife = buildLifeDisplay(duelist.lp, maxLife);
  const shield = Math.max(0, Math.round(Number(duelist.shield) || 0));
  const life = shield > 0
    ? {
      ...baseLife,
      ariaLabel: `${baseLife.ariaLabel}，护盾 ${shield}`
    }
    : baseLife;
  const isAi = duelist.owner === "ai";
  const targetReady = isAi && Boolean(directTargetReady);
  return {
    owner: duelist.owner || "player",
    name: duelist.owner === "player" ? `${profile.name || ""}（你）` : profile.name || "",
    skillHtml: `<strong>${profile.skill || ""}</strong>：${profile.text || ""}`,
    life,
    shield,
    vitalItems: vitalStatusItems({
      duelist,
      lifeTone: life.tone,
      activeTurn,
      paused
    }),
    deckCount: Array.isArray(duelist.deck) ? duelist.deck.length : 0,
    graveCount: Array.isArray(duelist.grave) ? duelist.grave.length : 0,
    active: !paused && activeTurn === duelist.owner,
    directTargetReady: targetReady,
    panelAriaLabel: targetReady ? "直接攻击 AI 玩家" : "AI 玩家状态",
    panelRole: targetReady ? "button" : "region",
    panelTabIndex: targetReady ? 0 : -1
  };
}

function renderVitalItems(document, root, items) {
  if (!root) return;
  root.replaceChildren(...items.map((item) => {
    const chip = document.createElement("span");
    chip.className = `vital-chip ${item.tone}`;
    chip.textContent = item.label;
    return chip;
  }));
}

function applyDuelistHud(document, elements, view) {
  const {
    panel,
    lp,
    lifeFill,
    lifeBar,
    vitalStatus,
    deckCount,
    graveCount,
    name,
    skill
  } = elements;
  if (lp) {
    lp.textContent = view.life.text;
    lp.setAttribute("aria-label", view.life.ariaLabel);
  }
  if (lifeFill) lifeFill.style.width = `${view.life.percent}%`;
  if (lifeBar) {
    lifeBar.dataset.tone = view.life.tone;
    lifeBar.dataset.shield = view.shield > 0 ? "true" : "false";
  }
  if (panel) {
    panel.dataset.lifeTone = view.life.tone;
    panel.classList.toggle("active-turn", view.active);
  }
  renderVitalItems(document, vitalStatus, view.vitalItems);
  if (deckCount) deckCount.textContent = String(view.deckCount);
  if (graveCount) graveCount.textContent = String(view.graveCount);
  if (name) name.textContent = view.name;
  if (skill) skill.innerHTML = view.skillHtml;

  if (view.owner === "ai" && panel) {
    panel.classList.toggle("direct-target", view.directTargetReady);
    panel.setAttribute("aria-label", view.panelAriaLabel);
    panel.setAttribute("role", view.panelRole);
    panel.tabIndex = view.panelTabIndex;
  }
}

export function renderCombatHud({
  document,
  body,
  elements = {},
  player = {},
  ai = {},
  playerProfile = {},
  aiProfile = {},
  activeTurn = "idle",
  paused = false,
  maxLife = 4000,
  directTargetReady = false
} = {}) {
  const playerView = buildDuelistHudView({
    duelist: player,
    profile: playerProfile,
    activeTurn,
    paused,
    maxLife
  });
  const aiView = buildDuelistHudView({
    duelist: ai,
    profile: aiProfile,
    activeTurn,
    paused,
    maxLife,
    directTargetReady
  });

  if (body) body.dataset.duelTurn = paused ? "paused" : activeTurn;
  applyDuelistHud(document, {
    panel: elements.playerPanel,
    lp: elements.playerLp,
    lifeFill: elements.playerLife,
    lifeBar: elements.playerLifeBar,
    vitalStatus: elements.playerVitalStatus,
    deckCount: elements.playerDeckCount,
    graveCount: elements.playerGraveCount,
    name: elements.playerName,
    skill: elements.playerSkill
  }, playerView);
  applyDuelistHud(document, {
    panel: elements.aiPanel,
    lp: elements.aiLp,
    lifeFill: elements.aiLife,
    lifeBar: elements.aiLifeBar,
    vitalStatus: elements.aiVitalStatus,
    deckCount: elements.aiDeckCount,
    graveCount: elements.aiGraveCount,
    name: elements.aiName,
    skill: elements.aiSkill
  }, aiView);

  return { player: playerView, ai: aiView };
}
