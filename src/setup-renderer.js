import {
  buildPreDuelPreview,
  scenarioHintList,
  scenarioObjectiveList
} from "./pre-duel-preview.js";

export function definitionLabel(definitions, key) {
  return definitions?.[key]?.label || key;
}

export function formatDuelStats(stats = {}) {
  return `战绩 ${stats.wins || 0}胜/${stats.losses || 0}负 / 总局数 ${stats.duels || 0} / 当前连胜 ${stats.streak || 0} / 最高连胜 ${stats.bestStreak || 0}`;
}

export function scenarioDifficultyText(difficulty) {
  if (difficulty === "demo") return "演示版";
  if (difficulty === "challenge") return "挑战版";
  return "";
}

export function buildScenarioBriefView(scenario = {}, { hintsVisible = false } = {}) {
  const objectives = scenarioObjectiveList(scenario).filter(Boolean);
  const hints = scenarioHintList(scenario).filter(Boolean);
  const difficultyText = scenarioDifficultyText(scenario.difficulty);
  const hasBrief = Boolean(scenario.label || difficultyText || objectives.length || hints.length);
  const showHints = Boolean(hints.length && hintsVisible);

  return {
    hidden: !hasBrief,
    title: scenario.label || "正常决斗",
    difficultyText: difficultyText || "场景",
    challenge: scenario.difficulty === "challenge",
    objectives,
    hints,
    hintsVisible: showHints,
    hintToggleDisabled: hints.length === 0,
    hintToggleText: hints.length ? (showHints ? "隐藏提示" : "显示提示") : "无提示"
  };
}

function renderTextList(doc, root, entries) {
  if (!root) return;
  const fragment = doc.createDocumentFragment();
  entries.forEach((entry) => {
    const item = doc.createElement("li");
    item.textContent = entry;
    fragment.appendChild(item);
  });
  root.textContent = "";
  root.appendChild(fragment);
}

export function renderScenarioBrief(doc, elements, scenario, { hintsVisible = false } = {}) {
  const view = buildScenarioBriefView(scenario, { hintsVisible });
  if (!elements.scenarioBrief) return view;

  elements.scenarioBrief.hidden = view.hidden;
  if (view.hidden) return view;

  if (elements.scenarioBriefTitle) elements.scenarioBriefTitle.textContent = view.title;
  if (elements.scenarioDifficulty) {
    elements.scenarioDifficulty.textContent = view.difficultyText;
    elements.scenarioDifficulty.classList.toggle("challenge", view.challenge);
  }
  renderTextList(doc, elements.scenarioObjectives, view.objectives);
  if (elements.scenarioHintToggle) {
    elements.scenarioHintToggle.disabled = view.hintToggleDisabled;
    elements.scenarioHintToggle.textContent = view.hintToggleText;
  }
  if (elements.scenarioHints) {
    renderTextList(doc, elements.scenarioHints, view.hints);
    elements.scenarioHints.hidden = !view.hintsVisible;
  }
  return view;
}

function appendTextNode(doc, root, className, text) {
  const node = doc.createElement("span");
  node.className = className;
  node.textContent = text;
  root.appendChild(node);
  return node;
}

export function renderPreDuelDeckCard(doc, entry, { onOpenCardDetail } = {}) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "pre-duel-card";
  button.dataset.cardId = entry.id;
  button.dataset.zone = entry.zone;
  button.dataset.count = String(entry.count || 1);
  button.title = `查看 ${entry.name} 详情`;

  const title = doc.createElement("span");
  title.className = "pre-duel-card-title";
  appendTextNode(doc, title, "pre-duel-zone", entry.zoneSummary || entry.zoneLabel);
  appendTextNode(doc, title, "pre-duel-card-name", entry.name);
  if ((entry.count || 1) > 1) appendTextNode(doc, title, "pre-duel-count", `x${entry.count}`);
  button.appendChild(title);

  const meta = doc.createElement("span");
  meta.className = "pre-duel-card-meta";
  const stats = Number.isFinite(entry.attack) && Number.isFinite(entry.defense)
    ? ` · ATK ${entry.attack} / DEF ${entry.defense}`
    : "";
  meta.textContent = `${entry.type}${stats}`;
  button.appendChild(meta);

  if (entry.summary) appendTextNode(doc, button, "pre-duel-card-summary", entry.summary);
  if (onOpenCardDetail) {
    button.addEventListener("click", () => onOpenCardDetail(entry.id));
  }
  return button;
}

export function preDuelDeckCountText(preview = {}) {
  const displayCount = preview.displayDeckCards?.length || preview.deckCards?.length || 0;
  const deckCount = preview.deckCards?.length || 0;
  return displayCount === deckCount
    ? `${deckCount} 张`
    : `${displayCount} 种 / ${deckCount} 张`;
}

export function renderPreDuelPreview(doc, elements, preview, {
  started = false,
  gameOver = false,
  deckExpanded = false,
  onOpenCardDetail
} = {}) {
  if (!elements.preDuelPreview || !preview) return false;

  elements.preDuelPreview.hidden = started || gameOver;
  if (elements.preDuelLp) {
    elements.preDuelLp.textContent = `己方 ${preview.playerLp} / 对方 ${preview.aiLp}`;
  }
  if (elements.preDuelSkillName) {
    elements.preDuelSkillName.textContent = preview.skill.name || "无技能";
  }
  if (elements.preDuelSkillText) {
    elements.preDuelSkillText.textContent = preview.skill.text || "";
  }
  if (elements.preDuelRecommended) {
    elements.preDuelRecommended.hidden = !preview.recommendedLine.length;
  }
  renderTextList(doc, elements.preDuelRecommendedList, preview.recommendedLine);

  if (elements.preDuelDeckCount) {
    elements.preDuelDeckCount.textContent = preDuelDeckCountText(preview);
  }
  if (elements.preDuelDeckToggle) {
    elements.preDuelDeckToggle.textContent = deckExpanded ? "收起牌组" : "查看牌组";
    elements.preDuelDeckToggle.setAttribute("aria-expanded", String(deckExpanded));
  }
  if (elements.preDuelDeckList) {
    const fragment = doc.createDocumentFragment();
    (preview.displayDeckCards || preview.deckCards).forEach((entry) => {
      fragment.appendChild(renderPreDuelDeckCard(doc, entry, { onOpenCardDetail }));
    });
    elements.preDuelDeckList.textContent = "";
    elements.preDuelDeckList.appendChild(fragment);
    elements.preDuelDeckList.hidden = !deckExpanded;
  }
  return true;
}

function replaceSelectOptions(doc, select, entries = []) {
  if (!select) return;
  const fragment = doc.createDocumentFragment();
  entries.forEach((entry) => {
    const option = doc.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label;
    fragment.appendChild(option);
  });
  select.textContent = "";
  select.appendChild(fragment);
}

export function syncSetupControlValues(elements, values = {}) {
  if (elements.roleSelect) elements.roleSelect.value = values.roleId;
  if (elements.deckSelect) elements.deckSelect.value = values.deckPreset;
  if (elements.aiSelect) elements.aiSelect.value = values.aiStyle;
  if (elements.scenarioSelect) elements.scenarioSelect.value = values.scenarioId;
}

export function initializeSetupControlOptions(doc, elements, {
  roleOptions = [],
  deckOptions = [],
  aiOptions = [],
  scenarioOptions = [],
  testMode = false,
  values = {}
} = {}) {
  replaceSelectOptions(doc, elements.roleSelect, roleOptions);
  replaceSelectOptions(doc, elements.deckSelect, deckOptions);
  replaceSelectOptions(doc, elements.aiSelect, aiOptions);
  replaceSelectOptions(doc, elements.scenarioSelect, scenarioOptions);
  if (elements.scenarioSelectLabel) {
    elements.scenarioSelectLabel.textContent = testMode ? "规则测试" : "玩法模式";
  }
  syncSetupControlValues(elements, values);
}

export function renderSetupPanel(doc, elements, {
  state = {},
  scenario = {},
  playerProfile = {},
  aiLabel = "",
  deckDefinitions = {},
  statsText = "",
  hintsVisible = false,
  deckExpanded = false,
  onOpenCardDetail
} = {}) {
  if (elements.setupPanel) elements.setupPanel.hidden = state.started || state.gameOver;

  const brief = renderScenarioBrief(doc, elements, scenario, { hintsVisible });
  const preview = buildPreDuelPreview({
    scenarioId: state.scenarioId,
    scenario,
    playerPreset: state.deckPreset,
    playerProfile
  });
  renderPreDuelPreview(doc, elements, preview, {
    started: state.started,
    gameOver: state.gameOver,
    deckExpanded,
    onOpenCardDetail
  });

  const deckLabel = definitionLabel(deckDefinitions, state.deckPreset);
  const scenarioLabel = scenario.label || "正常决斗";
  if (elements.setupStats) {
    elements.setupStats.textContent = `${statsText} / 当前配置：${playerProfile.name}、${deckLabel}、${aiLabel} / ${scenarioLabel}${scenario.goal ? ` / 目标：${scenario.goal}` : ""}`;
  }
  if (elements.profileStats) {
    elements.profileStats.textContent = `${deckLabel} / ${scenarioLabel} / ${statsText}`;
  }

  return {
    hintsVisible: brief.hintsVisible,
    preview
  };
}
