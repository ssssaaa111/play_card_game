function resultStats(card) {
  if (!card) return "未知卡牌";
  if (card.type === "monster") return `怪兽 / ATK ${card.atk} / DEF ${card.def}`;
  if (card.type === "trap") return "陷阱";
  return "魔法";
}

function fusionResultOptionView(option, {
  selectedResultId = "",
  findCard = () => null,
  formatMaterials = () => ""
} = {}) {
  const result = findCard(option.resultId);
  const name = result?.name || option.resultId;
  const stats = resultStats(result);
  const recipe = formatMaterials(option.materials);
  const selected = option.resultId === selectedResultId;
  return {
    resultId: option.resultId,
    name,
    stats,
    recipe,
    subtitle: `${stats} · 素材：${recipe}`,
    selected,
    ariaLabel: `${name}，${stats}，素材：${recipe}，${selected ? "已选择" : "可选择"}`
  };
}

export function buildFusionSelectionView({
  pendingFusion = null,
  status = null,
  selectedMaterials = [],
  findCard = () => null,
  formatMaterials = () => ""
} = {}) {
  if (!pendingFusion) {
    return {
      visible: false,
      resultId: "",
      resultName: "",
      stats: "",
      kicker: "融合预览",
      materialState: "idle",
      materialsText: "",
      detailDisabled: true,
      options: [],
      showOptions: false
    };
  }

  const resultOptions = pendingFusion.resultOptions || [];
  const options = resultOptions.map((option) => fusionResultOptionView(option, {
    selectedResultId: pendingFusion.resultId,
    findCard,
    formatMaterials
  }));
  if (!pendingFusion.resultId) {
    return {
      visible: true,
      resultId: "",
      resultName: "请选择融合结果",
      stats: `可选 ${resultOptions.length} 种融合形态`,
      kicker: "选择融合形态",
      materialState: "needs-result",
      materialsText: "先选择一种融合形态；每个选项已列出对应素材配方。",
      detailDisabled: true,
      options,
      showOptions: options.length > 1
    };
  }

  const result = findCard(pendingFusion.resultId);
  const remaining = (status?.remaining || []).filter((entry) => entry.count > 0);
  const selectedNames = selectedMaterials
    .map(({ zone, card }) => `${card.name}（${zone === "hand" ? "手牌" : "场上"}）`);
  const selectedText = selectedNames.length ? ` / 已选：${selectedNames.join("、")}` : "";
  const remainingText = formatMaterials(remaining);
  const progress = `${status?.selectedCount || 0}/${status?.requiredCount || 0}`;
  const readyText = remainingText ? ` / 还需：${remainingText}` : " / 素材齐备";
  const complete = Boolean(status?.complete);

  return {
    visible: true,
    resultId: pendingFusion.resultId,
    resultName: result?.name || pendingFusion.resultId,
    stats: resultStats(result),
    kicker: complete ? "融合预览 · 素材齐备" : `融合预览 · 素材 ${progress}`,
    materialState: complete ? "complete" : "selecting",
    materialsText: `素材：${formatMaterials(pendingFusion.materials)} / 进度 ${progress}${selectedText}${readyText}`,
    detailDisabled: false,
    options,
    showOptions: options.length > 1
  };
}

export function clearFusionSelectionPanel(elements = {}) {
  if (elements.fusionPreview) {
    elements.fusionPreview.hidden = true;
    elements.fusionPreview.dataset.cardId = "";
    elements.fusionPreview.dataset.materialState = "idle";
  }
  if (elements.fusionPreviewDetail) {
    elements.fusionPreviewDetail.disabled = true;
    elements.fusionPreviewDetail.dataset.cardId = "";
  }
  if (elements.fusionResultChoices) {
    elements.fusionResultChoices.replaceChildren();
    elements.fusionResultChoices.hidden = true;
  }
}

export function renderFusionSelectionPanel({
  document,
  elements = {},
  view = null,
  onSelectResult = () => {}
} = {}) {
  if (!view?.visible) {
    clearFusionSelectionPanel(elements);
    return false;
  }

  if (elements.fusionPreview) {
    elements.fusionPreview.hidden = false;
    elements.fusionPreview.dataset.cardId = view.resultId;
    elements.fusionPreview.dataset.materialState = view.materialState;
  }
  if (elements.fusionPreviewKicker) elements.fusionPreviewKicker.textContent = view.kicker;
  if (elements.fusionPreviewName) elements.fusionPreviewName.textContent = view.resultName;
  if (elements.fusionPreviewStats) elements.fusionPreviewStats.textContent = view.stats;
  if (elements.fusionPreviewMaterials) elements.fusionPreviewMaterials.textContent = view.materialsText;
  if (elements.fusionPreviewDetail) {
    elements.fusionPreviewDetail.disabled = view.detailDisabled;
    elements.fusionPreviewDetail.dataset.cardId = view.resultId;
  }
  if (elements.fusionResultChoices) {
    const buttons = view.options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fusion-result-option";
      button.dataset.cardId = option.resultId;
      button.dataset.optionState = option.selected ? "selected" : "ready";
      button.classList.toggle("selected", option.selected);
      button.setAttribute("aria-pressed", String(option.selected));
      button.setAttribute("aria-label", option.ariaLabel);
      button.title = option.subtitle;

      const name = document.createElement("strong");
      name.textContent = option.name;
      const summary = document.createElement("span");
      summary.textContent = option.subtitle;
      button.appendChild(name);
      button.appendChild(summary);
      button.addEventListener("click", () => onSelectResult(option.resultId));
      return button;
    });
    elements.fusionResultChoices.replaceChildren(...buttons);
    elements.fusionResultChoices.hidden = !view.showOptions;
  }
  return true;
}
