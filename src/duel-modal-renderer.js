import { createCardElement } from "./card-renderer.js";

export function setupDuelModalView() {
  return {
    title: "战前准备",
    text: "先熟悉己方卡组、技能和场景目标，再开始决斗。",
    actionText: "开始决斗",
    reviewLog: false
  };
}

export function gameOverDuelModalView({ win = false, statsText = "", title = "", text = "", actionText = "" } = {}) {
  return {
    title: title || (win ? "你赢了" : "决斗败北"),
    text: text || (win
      ? `星魂回应了你的召唤。${statsText}。`
      : `AI 抢到了节奏。调整卡组顺序或更早展开怪兽试试看。${statsText}。`),
    actionText: actionText || "回到准备",
    reviewLog: true
  };
}

function renderDuelModalContent(elements, view) {
  elements.modalTitle.textContent = view.title;
  elements.modalText.textContent = view.text;
  elements.modalRestart.textContent = view.actionText;
  if (elements.modalReviewLog) elements.modalReviewLog.hidden = !view.reviewLog;
}

export function resetDuelModal(elements) {
  elements.modal.classList.remove("show", "setup-modal");
  elements.modalRestart.textContent = "再来一局";
  if (elements.modalReviewLog) elements.modalReviewLog.hidden = true;
}

export function renderSetupDuelModal(elements) {
  renderDuelModalContent(elements, setupDuelModalView());
  elements.modal.classList.add("show", "setup-modal");
}

export function renderGameOverDuelModal(elements, options) {
  renderDuelModalContent(elements, gameOverDuelModalView(options));
  elements.modal.classList.remove("setup-modal");
}

export function showDuelModal(elements) {
  elements.modal.classList.add("show");
}

export function renderAiRevealModal(elements, reveal) {
  if (!elements.aiRevealModal) return false;
  elements.aiRevealModal.classList.toggle("show", Boolean(reveal));
  if (!reveal) {
    if (elements.aiRevealProgress) {
      elements.aiRevealProgress.textContent = "";
      elements.aiRevealProgress.hidden = true;
    }
    return true;
  }
  elements.aiRevealModal.dataset.cardId = reveal.cardId;
  if (elements.aiRevealTitle) elements.aiRevealTitle.textContent = reveal.title;
  if (elements.aiRevealProgress) {
    elements.aiRevealProgress.textContent = reveal.progressText || "";
    elements.aiRevealProgress.hidden = !reveal.progressText;
  }
  if (elements.aiRevealType) elements.aiRevealType.textContent = reveal.type;
  if (elements.aiRevealSummary) elements.aiRevealSummary.textContent = reveal.summary;
  return true;
}

export function renderCardDetailModal(doc, elements, view, { asset = "" } = {}) {
  if (!view?.card) return false;
  elements.zoomName.textContent = view.name;
  elements.zoomCard.textContent = "";
  const preview = createCardElement(doc, view.card, { asset });
  preview.classList.remove("selected", "used", "defense");
  elements.zoomCard.appendChild(preview);
  elements.zoomText.textContent = view.effectText;
  elements.zoomMeta.textContent = view.meta;
  elements.cardModal.classList.add("show");
  return true;
}

export function hideCardDetailModal(elements) {
  elements.cardModal.classList.remove("show");
}
