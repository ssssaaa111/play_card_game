import { createCardElement } from "./card-renderer.js";
import { handInsertionPoint, handInsertionPreview } from "./hand-order.js";

const handDragSessions = new WeakMap();

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
  onInsertCard = () => {},
  onCardDetail = () => {},
  onCardClick = () => {},
  onCardDoubleClick = () => {}
} = {}) {
  const session = handDragSessions.get(root);
  if (session) {
    if (started && directReorder && cards.some((card) => card.uid === session.uid)) {
      // AI actions redraw the board while the pointer is held. Keep its source
      // node alive and retain only the latest hand update until the gesture ends.
      const options = arguments[0];
      session.pendingRender = () => renderHandCards(options);
      return;
    }
    session.cancel(false);
  }
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
    cardEl.dataset.actionState = action.ok ? "ready" : action.ruleOk ? "timing-blocked" : "blocked";
    cardEl.dataset.actionLabel = view.actionLabel;
    cardEl.dataset.actionReason = view.actionReason;
    cardEl.dataset.targetCount = String(action.target?.count || 0);
    cardEl.dataset.targetScope = action.target?.scope || "";
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
      cardEl.setAttribute("aria-description", "双方回合均可拖动插入；按住 Alt 再按左右方向键可微调顺序");
      let pointerDrag = null;
      let dragGhost = null;
      let placeholder = null;

      const positionDragGhost = (event) => {
        if (!dragGhost) return;
        dragGhost.style.left = `${event.clientX - pointerDrag.offsetX}px`;
        dragGhost.style.top = `${event.clientY - pointerDrag.offsetY}px`;
      };
      const updatePointerDrag = (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        if (!pointerDrag.active && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 6) return;
        if (!pointerDrag.active) {
          pointerDrag.active = true;
          pointerDrag.bounds = root.getBoundingClientRect();
          pointerDrag.scrollLeft = root.scrollLeft;
          pointerDrag.scrollTop = root.scrollTop;
          // Measure once, before the preview moves any cards. Moving hit targets
          // would otherwise make a stationary pointer flip between two slots.
          pointerDrag.layout = Array.from(root.querySelectorAll('[data-zone="hand"]')).map((element) => ({
            uid: element.dataset.cardUid, element, rect: element.getBoundingClientRect()
          }));
          root.classList.add("is-reordering");
          cardEl.classList.add("is-dragging");
          cardEl.setAttribute("aria-grabbed", "true");
          dragGhost = cardEl.cloneNode(true);
          dragGhost.classList.remove("is-dragging");
          dragGhost.classList.add("hand-drag-ghost");
          dragGhost.removeAttribute("tabindex");
          dragGhost.setAttribute("aria-hidden", "true");
          dragGhost.querySelectorAll("button").forEach((button) => button.setAttribute("tabindex", "-1"));
          dragGhost.style.width = `${pointerDrag.rect.width}px`;
          dragGhost.style.height = `${pointerDrag.rect.height}px`;
          document.body.appendChild(dragGhost);
          placeholder = document.createElement("span");
          placeholder.className = "hand-insertion-placeholder";
          placeholder.setAttribute("aria-hidden", "true");
          document.body.appendChild(placeholder);
        }
        suppressClick = true;
        positionDragGhost(event);
        const bounds = root.getBoundingClientRect();
        const dx = bounds.left - pointerDrag.bounds.left - (root.scrollLeft - pointerDrag.scrollLeft);
        const dy = bounds.top - pointerDrag.bounds.top - (root.scrollTop - pointerDrag.scrollTop);
        const layout = pointerDrag.layout.map(({ uid, rect }) => ({
          uid, rect: { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy,
            bottom: rect.bottom + dy, width: rect.width, height: rect.height }
        }));
        const inside = event.clientX >= bounds.left - 12 && event.clientX <= bounds.right + 12
          && event.clientY >= bounds.top - 12 && event.clientY <= bounds.bottom + 12;
        pointerDrag.insertion = inside ? handInsertionPoint(layout, card.uid, event.clientX, event.clientY) : null;
        placeholder.hidden = !pointerDrag.insertion;
        if (pointerDrag.insertion) {
          const preview = handInsertionPreview(layout, card.uid, pointerDrag.insertion.beforeUid);
          for (const shift of preview.shifts) {
            const element = pointerDrag.layout.find((entry) => entry.uid === shift.uid).element;
            element.style.translate = `${shift.x}px ${shift.y}px`;
          }
          const slot = preview.slot;
          placeholder.style.left = `${slot.left}px`;
          placeholder.style.top = `${slot.top}px`;
          placeholder.style.width = `${slot.width}px`;
          placeholder.style.height = `${slot.height}px`;
          placeholder.style.clipPath = `inset(${Math.max(0, bounds.top - slot.top)}px ${Math.max(0, slot.right - bounds.right)}px ${Math.max(0, slot.bottom - bounds.bottom)}px ${Math.max(0, bounds.left - slot.left)}px)`;
        } else {
          pointerDrag.layout.forEach(({ element }) => { element.style.translate = ""; });
        }
        event.preventDefault();
      };
      const cancelPointerDrag = () => finishPointerDrag({ type: "pointercancel" });
      const escapePointerDrag = (event) => {
        if (event.key === "Escape") cancelPointerDrag();
      };
      const finishPointerDrag = (event, flush = true) => {
        if (!pointerDrag || (event.pointerId != null && pointerDrag.pointerId !== event.pointerId)) return;
        if (event.type === "pointerup" && pointerDrag.active) updatePointerDrag(event);
        const finished = pointerDrag;
        const pendingRender = handDragSessions.get(root)?.pendingRender;
        pointerDrag = null;
        handDragSessions.delete(root);
        document.removeEventListener("pointermove", updatePointerDrag);
        document.removeEventListener("pointerup", finishPointerDrag);
        document.removeEventListener("pointercancel", cancelPointerDrag);
        document.removeEventListener("keydown", escapePointerDrag);
        document.defaultView?.removeEventListener("blur", cancelPointerDrag);
        cardEl.removeEventListener("lostpointercapture", cancelPointerDrag);
        try { cardEl.releasePointerCapture?.(finished.pointerId); } catch {}
        cardEl.classList.remove("is-dragging");
        cardEl.setAttribute("aria-grabbed", "false");
        finished.layout?.forEach(({ element }) => { element.style.translate = ""; });
        root.classList.remove("is-reordering");
        dragGhost?.remove();
        placeholder?.remove();
        dragGhost = placeholder = null;
        if (finished.active && finished.insertion && event.type === "pointerup") {
          onInsertCard(card.uid, finished.insertion.beforeUid);
        } else if (flush) {
          pendingRender?.();
        }
        // Keep the native click following pointerup from also playing this card.
        document.defaultView?.setTimeout(() => { suppressClick = false; }, 0);
      };
      cardEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button") || handDragSessions.has(root)) return;
        const rect = cardEl.getBoundingClientRect();
        pointerDrag = {
          pointerId: event.pointerId,
          x: event.clientX, y: event.clientY,
          offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
          rect, active: false, insertion: null
        };
        handDragSessions.set(root, {
          uid: card.uid,
          cancel: (flush) => finishPointerDrag({ type: "pointercancel" }, flush)
        });
        document.addEventListener("pointermove", updatePointerDrag, { passive: false });
        document.addEventListener("pointerup", finishPointerDrag);
        document.addEventListener("pointercancel", cancelPointerDrag);
        document.addEventListener("keydown", escapePointerDrag);
        document.defaultView?.addEventListener("blur", cancelPointerDrag);
        cardEl.addEventListener("lostpointercapture", cancelPointerDrag);
        try { cardEl.setPointerCapture?.(event.pointerId); } catch {}
      });
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
      if (suppressClick) return;
      onCardDoubleClick(card, index);
    });
    fragment.appendChild(cardEl);
  });
  root.replaceChildren(fragment);
}
