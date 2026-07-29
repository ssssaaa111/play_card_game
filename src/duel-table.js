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

  compactWorkspace.addEventListener("change", () => {
    if (openDrawer) setDrawer(openDrawer, false);
    setUtilityMenu(false);
  });

  setUtilityMenu(false);
  setDrawer("detail", false);
  setDrawer("timeline", false);
  syncTimelineBadge();
  syncDetailDrawer();

  return {
    closeAll() {
      setUtilityMenu(false);
      if (openDrawer) setDrawer(openDrawer, false);
    },
    destroy() {
      detailObserver.disconnect();
      timelineObserver.disconnect();
    },
    openDrawer(name) {
      return setDrawer(name, true);
    },
    toggleDrawer,
    update() {
      syncDetailDrawer();
      syncTimelineBadge();
    }
  };
}

if (typeof document !== "undefined") {
  createDuelTableController(document);
}
