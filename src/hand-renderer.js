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
  fusionMaterialTarget = null,
  started = false,
  canAct = false,
  drawHighlighted = false
} = {}) {
  const materialCandidate = fusionMaterialTarget
    ? Boolean(fusionMaterialTarget.ok)
    : Boolean(fusionMaterialCandidate);
  const materialUnavailable = Boolean(fusionMaterialTarget && !fusionMaterialTarget.ok);
  const actionReady = Boolean(action.ok) && !materialUnavailable;
  const actionBlocked = !actionReady && started && canAct;
  const showActionReason = Boolean(
    fusionMaterialSelected
    || materialCandidate
    || materialUnavailable
    || selected
    || !actionReady
  );

  return {
    title: `${card.name || "卡牌"}：${fusionMaterialTarget?.reason || action.reason || ""}`,
    actionLabel: fusionMaterialSelected
      ? "融合素材 ✓"
      : materialCandidate
        ? "融合素材"
        : materialUnavailable
          ? "不可选素材"
          : action.label || "",
    actionReason: fusionMaterialSelected
      ? "已选择为手牌融合素材，再次点击可取消。"
      : materialCandidate
        ? "点击选择为手牌融合素材。"
        : materialUnavailable
          ? fusionMaterialTarget.reason
          : action.reason || "",
    showActionReason,
    cardClasses: enabledClassEntries({
      selected,
      "tribute-candidate": materialCandidate,
      "tribute-selected": fusionMaterialSelected,
      "fusion-candidate": materialCandidate,
      "fusion-selected": fusionMaterialSelected,
      "fusion-unavailable": materialUnavailable,
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
  fusionTargetForCard = () => null,
  fusionSelectedUids = [],
  reorderMode = false,
  reorderSelectedUid = "",
  onMoveCard = () => {},
  onPlaceCard = () => {},
  onTapCard = () => {},
  onCardClick = () => {},
  onCardDoubleClick = () => {}
} = {}) {
  const fragment = document.createDocumentFragment();
  cards.forEach((card, index) => {
    const action = actionForCard(card, index);
    const fusionMaterialTarget = fusionTargetForCard(card, index);
    const view = handCardView({
      card,
      action,
      selected: selectedZone === "hand" && selectedUid === card.uid,
      fusionMaterialCandidate: fusionCandidateForCard(card, index),
      fusionMaterialSelected: fusionSelectedUids.includes(card.uid),
      fusionMaterialTarget,
      started,
      canAct,
      drawHighlighted: animationKey === "draw-player" && index === cards.length - 1
    });
    const cardEl = createCardElement(document, card, { asset: assetForCard(card), handSummary: true });
    cardEl.dataset.zone = "hand";
    cardEl.dataset.displayIndex = String(index);
    cardEl.draggable = reorderMode;
    cardEl.classList.toggle("hand-reorder-card", reorderMode);
    cardEl.classList.toggle("hand-reorder-selected", reorderMode && reorderSelectedUid === card.uid);
    cardEl.setAttribute("aria-grabbed", "false");
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

    if (reorderMode) {
      cardEl.setAttribute("role", "button");
      cardEl.tabIndex = 0;
      cardEl.setAttribute("aria-pressed", String(reorderSelectedUid === card.uid));
      const controls = document.createElement("span");
      controls.className = "hand-reorder-controls";
      const left = document.createElement("button");
      left.type = "button";
      left.className = "hand-reorder-step";
      left.textContent = "←";
      left.disabled = index === 0;
      left.setAttribute("aria-label", `将${card.name}左移`);
      left.addEventListener("click", (event) => {
        event.stopPropagation();
        onMoveCard(card, -1);
      });
      const right = document.createElement("button");
      right.type = "button";
      right.className = "hand-reorder-step";
      right.textContent = "→";
      right.disabled = index === cards.length - 1;
      right.setAttribute("aria-label", `将${card.name}右移`);
      right.addEventListener("click", (event) => {
        event.stopPropagation();
        onMoveCard(card, 1);
      });
      controls.append(left, right);
      cardEl.appendChild(controls);

      cardEl.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", card.uid);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        cardEl.classList.add("is-dragging");
        cardEl.setAttribute("aria-grabbed", "true");
      });
      cardEl.addEventListener("dragend", () => {
        cardEl.classList.remove("is-dragging");
        cardEl.setAttribute("aria-grabbed", "false");
        root.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
      });
      cardEl.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        cardEl.classList.add("is-drop-target");
      });
      cardEl.addEventListener("dragleave", () => cardEl.classList.remove("is-drop-target"));
      cardEl.addEventListener("drop", (event) => {
        event.preventDefault();
        cardEl.classList.remove("is-drop-target");
        const sourceUid = event.dataTransfer?.getData("text/plain") || "";
        onPlaceCard(sourceUid, card.uid);
      });
      cardEl.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        onTapCard(card);
      });
    }

    cardEl.addEventListener("click", () => {
      if (reorderMode) onTapCard(card);
      else onCardClick(card, index);
    });
    cardEl.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (!reorderMode) onCardDoubleClick(card, index);
    });
    fragment.appendChild(cardEl);
  });
  root.replaceChildren(fragment);
}
