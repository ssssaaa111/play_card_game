const COMPACT_WORKSPACE_QUERY = "(max-width: 1040px)";
const EMPTY_DETAIL_TITLE = "选择一张卡";

function setControlExpanded(control, expanded) {
  if (!control) return;
  control.setAttribute("aria-expanded", String(expanded));
}

export function createDuelTableController(documentRef = document) {
  const body = documentRef.body;
  const utilityToggle = documentRef.querySelector("#utilityMenuToggle");
  const utilityMenu = documentRef.querySelector("#utilityMenu");
  const detailDrawer = documentRef.querySelector("#detailDrawer");
  const timelineDrawer = documentRef.querySelector("#timelineDrawer");
  const detailToggle = documentRef.querySelector("#detailDrawerToggle");
  const timelineToggle = documentRef.querySelector("#timelineDrawerToggle");
  const detailClose = documentRef.querySelector("#detailDrawerClose");
  const timelineClose = documentRef.querySelector("#timelineDrawerClose");
  const detailName = documentRef.querySelector("#detailName");
  const detailDrawerTitle = documentRef.querySelector("#detailDrawerTitle");
  const handConfirm = documentRef.querySelector("#handConfirmBtn");
  const battlePreview = documentRef.querySelector("#battlePreview");
  const timelineCount = documentRef.querySelector("#timelineCount");
  const timelineBadge = documentRef.querySelector("#timelineDrawerBadge");
  const field = documentRef.querySelector(".duel-table .field");
  const hand = documentRef.querySelector("#hand");
  const handPanel = documentRef.querySelector(".hand-panel");
  const handGuide = documentRef.querySelector("#handGuide");
  const handReadyCount = documentRef.querySelector("#handReadyCount");
  const handReadyLabel = documentRef.querySelector("#handReadyLabel");
  const phaseSteps = [...documentRef.querySelectorAll("[data-phase-step]")];
  const roleSelect = documentRef.querySelector("#roleSelect");
  const deckSelect = documentRef.querySelector("#deckSelect");
  const aiSelect = documentRef.querySelector("#aiSelect");
  const scenarioSelect = documentRef.querySelector("#scenarioSelect");
  const setupSelects = [roleSelect, deckSelect, aiSelect, scenarioSelect].filter(Boolean);
  const setupReadySummary = documentRef.querySelector("#setupReadySummary");
  const setupReadyMode = documentRef.querySelector("#setupReadyMode");
  const compactWorkspace = window.matchMedia(COMPACT_WORKSPACE_QUERY);
  const drawers = {
    detail: { root: detailDrawer, toggle: detailToggle },
    timeline: { root: timelineDrawer, toggle: timelineToggle }
  };
  let openDrawer = "";
  let lastDetailName = "";

  function setUtilityMenu(open) {
    const expanded = Boolean(open);
    if (utilityMenu) utilityMenu.hidden = !expanded;
    setControlExpanded(utilityToggle, expanded);
  }

  function setDrawer(name, open) {
    const next = drawers[name];
    if (!next?.root) return false;
    const expanded = Boolean(open);

    if (expanded) {
      for (const [otherName, drawer] of Object.entries(drawers)) {
        const active = otherName === name;
        drawer.root?.classList.toggle("is-open", active);
        drawer.root?.setAttribute("aria-hidden", String(!active));
        setControlExpanded(drawer.toggle, active);
      }
      openDrawer = name;
    } else {
      next.root.classList.remove("is-open");
      next.root.setAttribute("aria-hidden", "true");
      setControlExpanded(next.toggle, false);
      if (openDrawer === name) openDrawer = "";
    }

    if (body) body.dataset.workspaceDrawer = openDrawer || "none";
    return true;
  }

  function toggleDrawer(name) {
    setUtilityMenu(false);
    setDrawer(name, openDrawer !== name);
  }

  function syncTimelineBadge() {
    if (!timelineBadge || !timelineCount) return;
    timelineBadge.textContent = timelineCount.textContent?.trim() || "0";
  }

  function syncCombatAttention() {
    const phase = body?.dataset.duelPhase || "setup";
    const canAct = body?.dataset.duelCanAct === "true";
    const selection = body?.dataset.duelSelection || "none";
    const readyCount = hand?.querySelectorAll(".card.action-ready:not(.action-blocked)").length || 0;
    const selectedCard = hand?.querySelector(".card.selected");
    const selectedName = selectedCard?.dataset.cardName || "";

    for (const step of phaseSteps) {
      const current = step.dataset.phaseStep === phase;
      step.classList.toggle("is-current", current);
      if (current) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    }

    if (handPanel) {
      handPanel.dataset.readyCount = String(readyCount);
      handPanel.dataset.hasSelection = String(Boolean(selectedCard));
      handPanel.dataset.attention = selection;
    }
    if (handReadyCount) handReadyCount.textContent = String(readyCount);
    if (handReadyLabel) {
      handReadyLabel.textContent = phase === "setup"
        ? "待开局"
        : selection === "target"
          ? "选目标"
          : selection === "fusion"
            ? "选素材"
            : selection === "tribute"
              ? "选解放"
              : canAct
                ? "可操作"
                : "等待";
    }
    if (!handGuide) return;
    handGuide.textContent = selection === "target"
      ? "在场上选择高亮目标"
      : selection === "fusion"
        ? "选择符合条件的融合素材"
        : selection === "tribute"
          ? "选择场上的解放素材"
          : selectedName
            ? `已选择「${selectedName}」`
            : canAct && readyCount > 0
              ? `${readyCount} 张手牌现在可以行动`
              : phase === "setup"
                ? "开局后显示可用行动"
                : canAct
                  ? "查看场上怪兽或结束回合"
                  : "等待当前行动窗口";
  }

  function selectedOptionLabel(select, fallback) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }

  function syncSetupSummary() {
    if (!setupReadySummary || !setupReadyMode) return;
    const role = selectedOptionLabel(roleSelect, "角色待选择");
    const deck = selectedOptionLabel(deckSelect, "卡组待选择");
    const rival = selectedOptionLabel(aiSelect, "对手待选择");
    const scenario = selectedOptionLabel(scenarioSelect, "玩法待选择");
    setupReadySummary.textContent = `${role} · ${deck}`;
    setupReadyMode.textContent = `对手：${rival} · ${scenario}`;
  }

  function detailRequiresAttention() {
    const confirmVisible = Boolean(handConfirm && !handConfirm.hidden && !handConfirm.disabled);
    const hasBattlePreview = Boolean(battlePreview && !battlePreview.classList.contains("empty"));
    return confirmVisible || hasBattlePreview;
  }

  function syncDetailDrawer() {
    const name = detailName?.textContent?.trim() || EMPTY_DETAIL_TITLE;
    if (detailDrawerTitle) {
      detailDrawerTitle.textContent = name === EMPTY_DETAIL_TITLE ? "卡牌详情" : name;
    }

    const selectedNewCard = name !== EMPTY_DETAIL_TITLE && name !== lastDetailName;
    const shouldOpen = compactWorkspace.matches
      ? detailRequiresAttention()
      : selectedNewCard;
    lastDetailName = name;
    if (shouldOpen) setDrawer("detail", true);
  }

  function closeCompactDrawer() {
    if (compactWorkspace.matches && openDrawer) setDrawer(openDrawer, false);
  }

  utilityToggle?.addEventListener("click", () => {
    setUtilityMenu(Boolean(utilityMenu?.hidden));
  });

  utilityMenu?.addEventListener("click", (event) => {
    if (event.target.closest("button")) setUtilityMenu(false);
  });

  detailToggle?.addEventListener("click", () => toggleDrawer("detail"));
  timelineToggle?.addEventListener("click", () => toggleDrawer("timeline"));
  detailClose?.addEventListener("click", () => setDrawer("detail", false));
  timelineClose?.addEventListener("click", () => setDrawer("timeline", false));
  field?.addEventListener("click", closeCompactDrawer);
  hand?.addEventListener("click", closeCompactDrawer);

  documentRef.addEventListener("pointerdown", (event) => {
    if (!utilityMenu || utilityMenu.hidden) return;
    if (utilityMenu.contains(event.target) || utilityToggle?.contains(event.target)) return;
    setUtilityMenu(false);
  });

  documentRef.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (utilityMenu && !utilityMenu.hidden) {
      setUtilityMenu(false);
      utilityToggle?.focus();
      return;
    }
    if (openDrawer) {
      const closing = openDrawer;
      setDrawer(closing, false);
      drawers[closing]?.toggle?.focus();
    }
  });

  const detailObserver = new MutationObserver(() => requestAnimationFrame(syncDetailDrawer));
  for (const target of [detailName, handConfirm, battlePreview].filter(Boolean)) {
    detailObserver.observe(target, {
      attributes: true,
      attributeFilter: ["class", "hidden", "disabled"],
      childList: true,
      subtree: true
    });
  }

  const timelineObserver = new MutationObserver(syncTimelineBadge);
  if (timelineCount) timelineObserver.observe(timelineCount, { childList: true, subtree: true });

  const attentionObserver = new MutationObserver(() => requestAnimationFrame(syncCombatAttention));
  if (hand) {
    attentionObserver.observe(hand, {
      attributes: true,
      attributeFilter: ["class", "data-card-name"],
      childList: true,
      subtree: true
    });
  }
  if (body) {
    attentionObserver.observe(body, {
      attributes: true,
      attributeFilter: [
        "data-duel-phase",
        "data-duel-turn",
        "data-duel-action-window",
        "data-duel-selection",
        "data-duel-can-act"
      ]
    });
  }

  const setupObserver = new MutationObserver(() => requestAnimationFrame(syncSetupSummary));
  const setupChangeHandler = () => syncSetupSummary();
  for (const select of setupSelects) {
    setupObserver.observe(select, { childList: true, subtree: true });
    select.addEventListener("change", setupChangeHandler);
  }

  compactWorkspace.addEventListener("change", () => {
    if (openDrawer) setDrawer(openDrawer, false);
    setUtilityMenu(false);
  });

  setUtilityMenu(false);
  setDrawer("detail", false);
  setDrawer("timeline", false);
  syncTimelineBadge();
  syncDetailDrawer();
  syncCombatAttention();
  syncSetupSummary();

  return {
    closeAll() {
      setUtilityMenu(false);
      if (openDrawer) setDrawer(openDrawer, false);
    },
    destroy() {
      detailObserver.disconnect();
      timelineObserver.disconnect();
      attentionObserver.disconnect();
      setupObserver.disconnect();
      for (const select of setupSelects) select.removeEventListener("change", setupChangeHandler);
    },
    openDrawer(name) {
      return setDrawer(name, true);
    },
    toggleDrawer,
    update() {
      syncDetailDrawer();
      syncTimelineBadge();
      syncCombatAttention();
      syncSetupSummary();
    }
  };
}

if (typeof document !== "undefined") {
  createDuelTableController(document);
}
