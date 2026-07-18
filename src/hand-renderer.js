import { createCardElement } from "./card-renderer.js";

function enabledClassEntries(entries = {}) {
  return Object.entries(entries)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([className]) => className);
}

export function handCardView({
  card = {},
  action = {},
  selected = false,
  fusionMaterialCandidate = false,
  fusionMaterialSelected = false,
  started = false,
  canAct = false,
  drawHighlighted = false
} = {}) {
  const actionReady = Boolean(action.ok);
  const actionBlocked = !actionReady && started && canAct;
  const showActionReason = Boolean(
    fusionMaterialSelected
    || fusionMaterialCandidate
    || selected
    || !actionReady
  );

  return {
    title: `${card.name || "卡牌"}：${action.reason || ""}`,
    actionLabel: fusionMaterialSelected
      ? "融合素材 ✓"
      : fusionMaterialCandidate
        ? "融合素材"
        : action.label || "",
    actionReason: fusionMaterialSelected
      ? "已选择为手牌融合素材，再次点击可取消。"
      : fusionMaterialCandidate
        ? "点击选择为手牌融合素材。"
        : action.reason || "",
    showActionReason,
    cardClasses: enabledClassEntries({
      selected,
      "tribute-candidate": fusionMaterialCandidate,
      "tribute-selected": fusionMaterialSelected,
      "action-ready": actionReady,
      "action-blocked": actionBlocked,
      "compact-action-state": !showActionReason,
      "draw-flash": drawHighlighted
    })
  };
}

export function renderHandCards({
  document,
  root,
  cards = [],
  animationKey = "",
  assetForCard = () => "",
  actionForCard = () => ({}),
  selectedZone = "",
  selectedUid = "",
  started = false,
  canAct = false,
  fusionCandidateForCard = () => false,
  fusionSelectedUids = [],
  onCardClick = () => {}
} = {}) {
  const fragment = document.createDocumentFragment();
  cards.forEach((card, index) => {
    const action = actionForCard(card, index);
    const view = handCardView({
      card,
      action,
      selected: selectedZone === "hand" && selectedUid === card.uid,
      fusionMaterialCandidate: fusionCandidateForCard(card, index),
      fusionMaterialSelected: fusionSelectedUids.includes(card.uid),
      started,
      canAct,
      drawHighlighted: animationKey === "draw-player" && index === cards.length - 1
    });
    const cardEl = createCardElement(document, card, { asset: assetForCard(card), handSummary: true });
    cardEl.dataset.zone = "hand";
    view.cardClasses.forEach((className) => cardEl.classList.add(className));
    cardEl.title = view.title;

    const actionTag = document.createElement("span");
    actionTag.className = "action-tag";
    actionTag.textContent = view.actionLabel;
    cardEl.appendChild(actionTag);

    const actionReason = document.createElement("span");
    actionReason.className = "action-reason";
    actionReason.textContent = view.actionReason;
    actionReason.hidden = !view.showActionReason;
    cardEl.appendChild(actionReason);

    cardEl.addEventListener("click", () => onCardClick(card, index));
    fragment.appendChild(cardEl);
  });
  root.replaceChildren(fragment);
}
