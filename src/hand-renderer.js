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

export function handDetailEntryView(card = {}, { reorderMode = false } = {}) {
  return {
    visible: !reorderMode,
    label: `查看${card.name || "卡牌"}详情`
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
  onCardDetail = () => {},
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
    const detailEntry = handDetailEntryView(card, { reorderMode });
    let suppressClick = false;
    cardEl.dataset.zone = "hand";
    cardEl.dataset.cardUid = card.uid || "";
    cardEl.dataset.displayIndex = String(index);
    cardEl.draggable = false;
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

    if (detailEntry.visible) {
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "card-detail-entry";
      detailButton.textContent = "详情";
      detailButton.setAttribute("aria-label", detailEntry.label);
      detailButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onCardDetail(card);
      });
      cardEl.appendChild(detailButton);
    }

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

      let pointerDrag = null;
      const clearPointerTargets = () => {
        root.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
      };
      const beginPointerDrag = (event) => {
        pointerDrag = {
          pointerId: event.pointerId ?? null,
          x: event.clientX,
          y: event.clientY,
          targetUid: "",
          active: false
        };
      };
      const updatePointerDrag = (event) => {
        if (!pointerDrag) return;
        if (!pointerDrag.active && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 6) return;
        pointerDrag.active = true;
        suppressClick = true;
        cardEl.classList.add("is-dragging");
        cardEl.setAttribute("aria-grabbed", "true");
        clearPointerTargets();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-zone="hand"]');
        pointerDrag.targetUid = target && target !== cardEl ? target.dataset.cardUid || "" : "";
        target?.classList.toggle("is-drop-target", Boolean(pointerDrag.targetUid));
        event.preventDefault();
      };
      cardEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        beginPointerDrag(event);
        cardEl.setPointerCapture?.(event.pointerId);
      });
      cardEl.addEventListener("pointermove", (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        updatePointerDrag(event);
      });
      const finishPointerDrag = (event) => {
        if (!pointerDrag || (event.pointerId != null && pointerDrag.pointerId !== event.pointerId)) return;
        const targetUid = pointerDrag.active ? pointerDrag.targetUid : "";
        pointerDrag = null;
        cardEl.classList.remove("is-dragging");
        cardEl.setAttribute("aria-grabbed", "false");
        clearPointerTargets();
        if (targetUid) onPlaceCard(card.uid, targetUid);
      };
      cardEl.addEventListener("pointerup", finishPointerDrag);
      cardEl.addEventListener("pointercancel", finishPointerDrag);
      const mouseMoveHandler = (event) => updatePointerDrag(event);
      const mouseUpHandler = (event) => {
        finishPointerDrag(event);
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
      };
      cardEl.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        if (!pointerDrag) beginPointerDrag(event);
        document.addEventListener("mousemove", mouseMoveHandler);
        document.addEventListener("mouseup", mouseUpHandler, { once: true });
      });
      cardEl.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        onTapCard(card);
      });
    }

    cardEl.addEventListener("click", () => {
      if (reorderMode && suppressClick) {
        suppressClick = false;
        return;
      }
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
