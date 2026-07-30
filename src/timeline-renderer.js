import { applyCardArt } from "./card-art.js";
import { buildChainHistory } from "./chain-history.js";
import { auditLogEntries } from "./log-audit.js";
import { appendLogEntryContent } from "./log-renderer.js";

export function auditIssueLabel(issue) {
  const labels = {
    "duplicate-log": "重复日志",
    "missing-spell-resolution": "缺少魔法结算",
    "direct-after-block": "直击规则矛盾",
    "missing-attack-resolution": "缺少攻击结算",
    "attack-no-impact": "攻击无影响"
  };
  return labels[issue?.code] || issue?.code || "未知疑点";
}

export function timelineAuditView(timeline = []) {
  const audit = auditLogEntries(timeline);
  const hasError = audit.issues.some((issue) => issue.severity === "error");
  const firstIssue = audit.issues[0];
  const firstIssueText = firstIssue
    ? `${auditIssueLabel(firstIssue)} - ${firstIssue.message}`
    : "";
  return {
    audit,
    text: audit.ok ? "审计 OK" : `疑点 ${audit.issueCount}：${firstIssueText}`,
    className: `timeline-audit ${audit.ok ? "ok" : hasError ? "error" : "warn"}`,
    detail: audit.ok
      ? ""
      : audit.issues.map((issue) => `${auditIssueLabel(issue)}：${issue.message}`).join(" | "),
    title: audit.ok
      ? "日志审计未发现异常。"
      : audit.issues
        .map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`)
        .join("\n")
  };
}

export function timelineKindLabel(kind = "") {
  const labels = {
    attack: "攻击",
    damage: "伤害",
    summon: "召唤",
    spell: "魔法",
    trap: "陷阱",
    draw: "抽卡",
    guard: "防御",
    turn: "回合",
    warning: "提示"
  };
  return labels[kind] || "记录";
}

export function timelineKindGroup(kind = "") {
  if (["attack", "damage", "trap", "guard"].includes(kind)) return "battle";
  if (["summon", "spell", "draw"].includes(kind)) return "cards";
  return "system";
}

export function timelineOverviewView(timeline = []) {
  const latest = timeline[0];
  const actionKinds = new Set(["attack", "damage", "summon", "spell", "trap", "draw", "guard"]);
  return {
    latestStep: latest?.step ? `#${latest.step}` : "—",
    latestKind: latest ? timelineKindLabel(latest.kind) : "等待开局",
    actionCount: timeline.filter((entry) => actionKinds.has(entry.kind)).length
  };
}

export function chainHistoryPanelView({
  events = [],
  findCard = () => null,
  expanded = false
} = {}) {
  const histories = buildChainHistory(events, { findCard });
  const hasHistory = histories.length > 0;
  return {
    histories,
    hasHistory,
    expanded: hasHistory && expanded,
    count: histories.length
  };
}

export function renderChainHistoryPanel({
  document,
  elements = {},
  events = [],
  findCard = () => null,
  expanded = false,
  onCardClick = () => {}
} = {}) {
  const toggle = elements.chainHistoryToggle;
  const list = elements.chainHistoryList;
  if (!toggle || !list) return;
  const view = chainHistoryPanelView({ events, findCard, expanded });
  toggle.hidden = !view.hasHistory;
  toggle.setAttribute("aria-expanded", String(view.expanded));
  if (elements.chainHistoryCount) {
    elements.chainHistoryCount.textContent = String(view.count);
  }
  list.hidden = !view.expanded;
  list.replaceChildren();
  if (!view.expanded) return;

  const fragment = document.createDocumentFragment();
  view.histories.forEach((history) => {
    const entry = document.createElement("section");
    entry.className = "chain-history-entry";

    const heading = document.createElement("div");
    heading.className = "chain-history-heading";
    const title = document.createElement("strong");
    title.textContent = `${history.linkCount} 段连锁`;
    const orders = document.createElement("span");
    orders.className = "chain-history-orders";
    const activationOrder = document.createElement("span");
    activationOrder.textContent = `发动 ${history.activationOrder}`;
    const resolutionOrder = document.createElement("span");
    resolutionOrder.textContent = `结算 ${history.resolutionOrder}`;
    orders.appendChild(activationOrder);
    orders.appendChild(resolutionOrder);
    heading.appendChild(title);
    heading.appendChild(orders);
    entry.appendChild(heading);

    history.links.forEach((link) => {
      const row = document.createElement("div");
      row.className = "chain-history-link";
      row.dataset.chainIndex = String(link.chainIndex);
      row.dataset.owner = link.owner || "unknown";

      const art = document.createElement("span");
      art.className = "chain-history-art";
      art.setAttribute("aria-hidden", "true");
      if (!link.cardId || !applyCardArt(art, link.cardId)) {
        art.textContent = link.name.slice(0, 1);
      }

      const index = document.createElement("span");
      index.className = "chain-history-index";
      index.textContent = `CL${link.chainIndex}`;
      art.appendChild(index);

      const main = document.createElement("span");
      main.className = "chain-history-main";
      const owner = document.createElement("span");
      owner.className = "chain-history-owner";
      owner.textContent = link.ownerLabel;
      const card = document.createElement(link.cardId ? "button" : "span");
      card.className = "chain-history-card";
      card.textContent = link.name;
      if (link.cardId) {
        card.type = "button";
        card.dataset.cardId = link.cardId;
        card.title = `查看 ${link.name} 详情`;
        card.addEventListener("click", () => onCardClick(link.cardId));
      }
      const status = document.createElement("span");
      status.className = `chain-history-status ${link.status}`;
      status.textContent = link.negatedByChainIndex
        ? `${link.statusLabel} · CL${link.negatedByChainIndex}`
        : link.statusLabel;
      main.appendChild(owner);
      main.appendChild(card);
      row.appendChild(art);
      row.appendChild(main);
      row.appendChild(status);
      entry.appendChild(row);
    });
    fragment.appendChild(entry);
  });
  list.appendChild(fragment);
}

export function renderTimelinePanel({
  document,
  elements = {},
  timeline = [],
  gameEvents = [],
  chainHistoryExpanded = false,
  findCard = () => null,
  findTimelineCard = findCard,
  onCardClick = () => {}
} = {}) {
  const root = elements.timeline;
  if (!root) return;
  root.replaceChildren();
  if (elements.timelineCount) {
    elements.timelineCount.textContent = String(timeline.length);
  }
  if (elements.timelineAudit) {
    const auditView = timelineAuditView(timeline);
    elements.timelineAudit.textContent = auditView.text;
    elements.timelineAudit.className = auditView.className;
    elements.timelineAudit.dataset.auditDetail = auditView.detail;
    elements.timelineAudit.title = auditView.title;
  }
  const overview = timelineOverviewView(timeline);
  if (elements.timelineLatestStep) {
    elements.timelineLatestStep.textContent = overview.latestStep;
  }
  if (elements.timelineLatestKind) {
    elements.timelineLatestKind.textContent = overview.latestKind;
  }
  if (elements.timelineActionCount) {
    elements.timelineActionCount.textContent = String(overview.actionCount);
  }
  renderChainHistoryPanel({
    document,
    elements,
    events: gameEvents,
    findCard,
    expanded: chainHistoryExpanded,
    onCardClick
  });

  const fragment = document.createDocumentFragment();
  timeline.forEach((entry) => {
    const item = document.createElement("div");
    item.className = `timeline-item ${entry.kind}`;
    item.dataset.timelineGroup = timelineKindGroup(entry.kind);
    item.dataset.timelineKind = entry.kind || "default";

    const node = document.createElement("span");
    node.className = "timeline-node";
    const step = document.createElement("span");
    step.className = "timeline-step";
    step.textContent = String(entry.step);
    node.appendChild(step);

    const event = document.createElement("span");
    event.className = "timeline-event";
    const kind = document.createElement("span");
    kind.className = "timeline-kind";
    kind.textContent = timelineKindLabel(entry.kind);
    const text = document.createElement("span");
    text.className = "timeline-text";
    event.appendChild(kind);
    event.appendChild(text);
    item.appendChild(node);
    item.appendChild(event);

    appendLogEntryContent({
      document,
      root: text,
      entry,
      findCard: findTimelineCard,
      onCardClick,
      buttonClassName: "log-card-link timeline-card-link"
    });
    fragment.appendChild(item);
  });
  root.appendChild(fragment);
}
