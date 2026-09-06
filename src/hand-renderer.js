import { createCardElement } from "./card-renderer.js";

const HAND_DRAG_SETTLE_MS = 110;

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

export function handDetailEntryView(card = {}) {
  return {
    visible: true,
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
  directReorder = false,
  onMoveCard = () => {},
  onSwapCard = () => {},
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
    const detailEntry = handDetailEntryView(card);
    let suppressClick = false;
    cardEl.dataset.zone = "hand";
    cardEl.dataset.cardUid = card.uid || "";
    cardEl.dataset.displayIndex = String(index);
    cardEl.draggable = false;
    cardEl.classList.toggle("hand-direct-reorder", directReorder);
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

    if (directReorder) {
      cardEl.tabIndex = 0;
      cardEl.setAttribute("aria-description", "可直接拖动换位；按住 Alt 再按左右方向键可微调顺序");
      let pointerDrag = null;
      let dragGhost = null;
      const clearPointerTargets = () => {
        root.querySelectorAll(".is-drop-target").forEach((element) => {
          element.classList.remove("is-drop-target", "swap-preview-left", "swap-preview-right");
        });
      };
      const removeDragGhost = () => {
        dragGhost?.remove();
        dragGhost = null;
        root.classList.remove("is-reordering");
      };
      const positionDragGhost = (event) => {
        if (!dragGhost || !pointerDrag) return;
        dragGhost.style.left = `${event.clientX - pointerDrag.offsetX}px`;
        dragGhost.style.top = `${event.clientY - pointerDrag.offsetY}px`;
        const tilt = Math.max(-4, Math.min(4, (event.clientX - pointerDrag.lastX) * 0.12));
        dragGhost.style.setProperty("--hand-drag-tilt", `${tilt}deg`);
        pointerDrag.lastX = event.clientX;
      };
      const createDragGhost = (event) => {
        if (dragGhost || !pointerDrag) return;
        const ghost = cardEl.cloneNode(true);
        ghost.classList.remove("is-dragging", "is-drop-target", "swap-preview-left", "swap-preview-right");
        ghost.classList.add("hand-drag-ghost");
        ghost.removeAttribute("tabindex");
        ghost.setAttribute("aria-hidden", "true");
        ghost.querySelectorAll("button").forEach((button) => button.setAttribute("tabindex", "-1"));
        ghost.style.width = `${pointerDrag.sourceRect.width}px`;
        ghost.style.height = `${pointerDrag.sourceRect.height}px`;
        document.body.appendChild(ghost);
        dragGhost = ghost;
        root.classList.add("is-reordering");
        positionDragGhost(event);
      };
      const beginPointerDrag = (event) => {
        const sourceRect = cardEl.getBoundingClientRect();
        pointerDrag = {
          pointerId: event.pointerId ?? null,
          x: event.clientX,
          y: event.clientY,
          lastX: event.clientX,
          offsetX: event.clientX - sourceRect.left,
          offsetY: event.clientY - sourceRect.top,
          sourceRect,
          targetUid: "",
          active: false
        };
      };
      const updatePointerDrag = (event) => {
        if (!pointerDrag) return;
        if (!pointerDrag.active && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 6) return;
        if (!pointerDrag.active) {
          pointerDrag.active = true;
          createDragGhost(event);
        }
        suppressClick = true;
        cardEl.classList.add("is-dragging");
        cardEl.setAttribute("aria-grabbed", "true");
        positionDragGhost(event);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-zone="hand"]');
        const targetUid = target && target !== cardEl ? target.dataset.cardUid || "" : "";
        if (targetUid !== pointerDrag.targetUid) {
          clearPointerTargets();
          pointerDrag.targetUid = targetUid;
          if (targetUid) {
            const sourceIndex = Number(cardEl.dataset.displayIndex);
            const targetIndex = Number(target.dataset.displayIndex);
            target.classList.add("is-drop-target", sourceIndex < targetIndex ? "swap-preview-left" : "swap-preview-right");
          }
        }
        event.preventDefault();
      };
      cardEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        beginPointerDrag(event);
        try {
          cardEl.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic browser smoke events do not own a native pointer capture.
        }
      });
      cardEl.addEventListener("pointermove", (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        updatePointerDrag(event);
      });
      const finishPointerDrag = (event) => {
        if (!pointerDrag || (event.pointerId != null && pointerDrag.pointerId !== event.pointerId)) return;
        const activeDrag = pointerDrag.active;
        const targetUid = activeDrag && event.type !== "pointercancel" ? pointerDrag.targetUid : "";
        const target = targetUid
          ? root.querySelector(`[data-zone="hand"][data-card-uid="${targetUid}"]`)
          : null;
        const settleRect = target?.getBoundingClientRect() || pointerDrag.sourceRect;
        pointerDrag = null;
        cardEl.setAttribute("aria-grabbed", "false");
        const completeDrag = () => {
          cardEl.classList.remove("is-dragging");
          clearPointerTargets();
          removeDragGhost();
          if (targetUid) onSwapCard(card.uid, targetUid);
          suppressClick = false;
        };
        if (activeDrag && dragGhost) {
          dragGhost.getBoundingClientRect();
          dragGhost.classList.add("is-settling");
          dragGhost.style.left = `${settleRect.left}px`;
          dragGhost.style.top = `${settleRect.top}px`;
          dragGhost.style.setProperty("--hand-drag-tilt", "0deg");
          document.defaultView?.setTimeout(completeDrag, HAND_DRAG_SETTLE_MS);
        } else {
          completeDrag();
        }
      };
      cardEl.addEventListener("pointerup", finishPointerDrag);
      cardEl.addEventListener("pointercancel", finishPointerDrag);
      cardEl.addEventListener("keydown", (event) => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        onMoveCard(card, event.key === "ArrowLeft" ? -1 : 1);
      });
    }

    cardEl.addEventListener("click", () => {
      if (directReorder && suppressClick) {
        suppressClick = false;
        return;
      }
      onCardClick(card, index);
    });
    cardEl.addEventListener("dblclick", (event) => {
      event.preventDefault();
      onCardDoubleClick(card, index);
    });
    fragment.appendChild(cardEl);
  });
  root.replaceChildren(fragment);
}
