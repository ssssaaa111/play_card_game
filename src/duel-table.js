const COMPACT_WORKSPACE_QUERY = "(max-width: 1040px)";
const SPACIOUS_SETTINGS_QUERY = "(min-width: 1440px) and (min-height: 680px)";
const SPACIOUS_WORKSPACE_QUERY = "(min-width: 1600px) and (min-height: 900px)";
const GUTTER_WORKSPACE_QUERY = "(min-width: 2800px) and (min-height: 1400px)";
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
  const timelineCount = documentRef.querySelector("#timelineCount");
  const timelineBadge = documentRef.querySelector("#timelineDrawerBadge");
  const timelineFilters = [...documentRef.querySelectorAll("[data-timeline-filter]")];
  const chainHistoryToggle = documentRef.querySelector("#chainHistoryToggle");
  const field = documentRef.querySelector(".duel-table .field");
  const hand = documentRef.querySelector("#hand");
  const handPanel = documentRef.querySelector(".hand-panel");
  const handGuide = documentRef.querySelector("#handGuide");
  const handReadyCount = documentRef.querySelector("#handReadyCount");
  const handReadyLabel = documentRef.querySelector("#handReadyLabel");
  const handCommand = documentRef.querySelector("#handCommand");
  const handCommandTitle = documentRef.querySelector("#handCommandTitle");
  const handCommandHint = documentRef.querySelector("#handCommandHint");
  const handCommandSignal = documentRef.querySelector("#handCommandSignal");
  const choiceActions = documentRef.querySelector("#choiceActions");
  const fieldActionBar = documentRef.querySelector("#fieldActionBar");
  const phaseSteps = [...documentRef.querySelectorAll("[data-phase-step]")];
  const roleSelect = documentRef.querySelector("#roleSelect");
  const deckSelect = documentRef.querySelector("#deckSelect");
  const aiSelect = documentRef.querySelector("#aiSelect");
  const scenarioSelect = documentRef.querySelector("#scenarioSelect");
  const setupSelects = [roleSelect, deckSelect, aiSelect, scenarioSelect].filter(Boolean);
  const setupReadySummary = documentRef.querySelector("#setupReadySummary");
  const setupReadyMode = documentRef.querySelector("#setupReadyMode");
  const compactWorkspace = window.matchMedia(COMPACT_WORKSPACE_QUERY);
  const spaciousSettings = window.matchMedia(SPACIOUS_SETTINGS_QUERY);
  const spaciousWorkspace = window.matchMedia(SPACIOUS_WORKSPACE_QUERY);
  const gutterWorkspace = window.matchMedia(GUTTER_WORKSPACE_QUERY);
  const drawers = {
    detail: { root: detailDrawer, toggle: detailToggle },
    timeline: { root: timelineDrawer, toggle: timelineToggle }
  };
  let openDrawer = "";
  let lastDetailName = "";
  let chainHistoryVisible = Boolean(chainHistoryToggle && !chainHistoryToggle.hidden);

  function setUtilityMenu(open) {
    const expanded = spaciousSettings.matches || Boolean(open);
    if (utilityMenu) utilityMenu.hidden = !expanded;
    if (utilityToggle) utilityToggle.hidden = spaciousSettings.matches;
    setControlExpanded(utilityToggle, expanded);
  }

  function setDrawer(name, open) {
    if (spaciousWorkspace.matches) return false;
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
      next.toggle?.classList.remove("has-update");
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

  function syncResponsiveWorkspace() {
    const spacious = spaciousWorkspace.matches;
    const gutter = spacious && gutterWorkspace.matches;
    if (body) body.dataset.workspaceLayout = gutter ? "gutter" : spacious ? "expanded" : "drawer";
    for (const drawer of Object.values(drawers)) {
      drawer.root?.classList.toggle("is-docked", spacious);
      drawer.root?.classList.toggle("is-open", spacious);
      drawer.root?.setAttribute("aria-hidden", String(!spacious));
      if (drawer.toggle) {
        drawer.toggle.hidden = spacious;
        setControlExpanded(drawer.toggle, spacious);
      }
    }
    for (const close of [detailClose, timelineClose]) {
      if (close) close.hidden = spacious;
    }
    openDrawer = "";
    if (body) body.dataset.workspaceDrawer = spacious ? "docked" : "none";
    setUtilityMenu(false);
  }

  function syncTimelineBadge() {
    if (!timelineBadge || !timelineCount) return;
    timelineBadge.textContent = timelineCount.textContent?.trim() || "0";
  }

  function setTimelineFilter(filter = "all") {
    const valid = timelineFilters.some((button) => button.dataset.timelineFilter === filter);
    const nextFilter = valid ? filter : "all";
    if (timelineDrawer) timelineDrawer.dataset.timelineView = nextFilter;
    for (const button of timelineFilters) {
      button.setAttribute("aria-pressed", String(button.dataset.timelineFilter === nextFilter));
    }
  }

  function syncChainHistoryAttention() {
    const visible = Boolean(chainHistoryToggle && !chainHistoryToggle.hidden);
    if (visible && !chainHistoryVisible && openDrawer !== "timeline") {
      timelineToggle?.classList.add("has-update");
    }
    if (!visible) timelineToggle?.classList.remove("has-update");
    chainHistoryVisible = visible;
  }

  function syncCombatAttention() {
    const phase = body?.dataset.duelPhase || "setup";
    const canAct = body?.dataset.duelCanAct === "true";
    const selection = body?.dataset.duelSelection || "none";
    const readyCount = hand?.querySelectorAll(".card.action-ready:not(.action-blocked)").length || 0;
    const selectedCard = hand?.querySelector(".card.selected");
    const selectedName = selectedCard?.dataset.cardName || "";
    const choiceActive = Boolean(choiceActions && !choiceActions.hidden);
    const fieldActionActive = Boolean(fieldActionBar && !fieldActionBar.hidden);
    const commandActive = choiceActive || fieldActionActive;
    const locating = ["target", "fusion", "tribute"].includes(selection);

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
      handPanel.dataset.commandActive = String(commandActive);
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
    if (handCommand) {
      handCommand.dataset.active = String(commandActive);
      handCommand.dataset.signal = commandActive
        ? "active"
        : canAct && readyCount > 0
          ? "ready"
          : "waiting";
      handCommand.dataset.step = locating
        ? "locate"
        : commandActive || Boolean(selectedCard)
          ? "execute"
          : "select";
    }
    if (handCommandSignal) {
      handCommandSignal.textContent = commandActive
        ? "确认中"
        : canAct && readyCount > 0
          ? "可行动"
          : "等待";
    }
    if (handCommandTitle) {
      handCommandTitle.textContent = selectedName
        ? `准备执行「${selectedName}」`
        : readyCount > 0
          ? `${readyCount} 张卡牌等待指令`
          : phase === "setup"
            ? "等待决斗部署"
            : canAct
              ? "查看场上状态"
              : "等待行动窗口";
    }
    if (handCommandHint) {
      handCommandHint.textContent = selectedName
        ? "使用指令区确认当前行动，或继续选择场上的落点与目标。"
        : readyCount > 0
          ? "选择手牌后，召唤、发动和目标确认会集中显示在这里。"
          : canAct
            ? "当前没有可直接使用的手牌，可以查看场上怪兽或结束回合。"
            : "对手行动与连锁响应出现时，指令区会自动切换为可操作状态。";
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

  function syncDetailDrawer() {
    const name = detailName?.textContent?.trim() || EMPTY_DETAIL_TITLE;
    const hasDetail = name !== EMPTY_DETAIL_TITLE;
    if (detailDrawerTitle) {
      detailDrawerTitle.textContent = hasDetail ? name : "卡牌详情";
    }

    const selectedNewCard = hasDetail && name !== lastDetailName;
    if (detailToggle) {
      detailToggle.classList.toggle("has-detail", hasDetail);
      detailToggle.title = hasDetail ? `查看「${name}」详情` : "选择卡牌后查看详情";
      if (selectedNewCard && openDrawer !== "detail") detailToggle.classList.add("has-update");
      if (!hasDetail) detailToggle.classList.remove("has-update");
    }
    lastDetailName = name;
  }

  function closeCompactDrawer() {
    if (compactWorkspace.matches && openDrawer) setDrawer(openDrawer, false);
  }

  utilityToggle?.addEventListener("click", () => {
    setUtilityMenu(Boolean(utilityMenu?.hidden));
  });

  utilityMenu?.addEventListener("click", (event) => {
    if (!spaciousSettings.matches && event.target.closest("button")) setUtilityMenu(false);
  });

  detailToggle?.addEventListener("click", () => toggleDrawer("detail"));
  timelineToggle?.addEventListener("click", () => toggleDrawer("timeline"));
  detailClose?.addEventListener("click", () => setDrawer("detail", false));
  timelineClose?.addEventListener("click", () => setDrawer("timeline", false));
  const timelineFilterHandler = (event) => setTimelineFilter(event.currentTarget.dataset.timelineFilter);
  for (const button of timelineFilters) button.addEventListener("click", timelineFilterHandler);
  field?.addEventListener("click", closeCompactDrawer);
  hand?.addEventListener("click", closeCompactDrawer);

  documentRef.addEventListener("pointerdown", (event) => {
    if (spaciousSettings.matches || !utilityMenu || utilityMenu.hidden) return;
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
  for (const target of [detailName].filter(Boolean)) {
    detailObserver.observe(target, {
      attributes: true,
      attributeFilter: ["class", "hidden", "disabled"],
      childList: true,
      subtree: true
    });
  }

  const timelineObserver = new MutationObserver(syncTimelineBadge);
  if (timelineCount) timelineObserver.observe(timelineCount, { childList: true, subtree: true });

  const chainHistoryObserver = new MutationObserver(syncChainHistoryAttention);
  if (chainHistoryToggle) {
    chainHistoryObserver.observe(chainHistoryToggle, {
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  const attentionObserver = new MutationObserver(syncCombatAttention);
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
  if (choiceActions) {
    attentionObserver.observe(choiceActions, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
      childList: true,
      subtree: true
    });
  }
  if (fieldActionBar) {
    attentionObserver.observe(fieldActionBar, {
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  }

  const setupObserver = new MutationObserver(() => requestAnimationFrame(syncSetupSummary));
  const setupChangeHandler = () => syncSetupSummary();
  for (const select of setupSelects) {
    setupObserver.observe(select, { childList: true, subtree: true });
    select.addEventListener("change", setupChangeHandler);
  }

  const responsiveChangeHandler = () => syncResponsiveWorkspace();
  compactWorkspace.addEventListener("change", responsiveChangeHandler);
  spaciousSettings.addEventListener("change", responsiveChangeHandler);
  spaciousWorkspace.addEventListener("change", responsiveChangeHandler);
  gutterWorkspace.addEventListener("change", responsiveChangeHandler);

  setUtilityMenu(false);
  setDrawer("detail", false);
  setDrawer("timeline", false);
  syncResponsiveWorkspace();
  syncTimelineBadge();
  setTimelineFilter("all");
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
      chainHistoryObserver.disconnect();
      attentionObserver.disconnect();
      setupObserver.disconnect();
      compactWorkspace.removeEventListener("change", responsiveChangeHandler);
      spaciousSettings.removeEventListener("change", responsiveChangeHandler);
      spaciousWorkspace.removeEventListener("change", responsiveChangeHandler);
      gutterWorkspace.removeEventListener("change", responsiveChangeHandler);
      for (const select of setupSelects) select.removeEventListener("change", setupChangeHandler);
      for (const button of timelineFilters) button.removeEventListener("click", timelineFilterHandler);
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
