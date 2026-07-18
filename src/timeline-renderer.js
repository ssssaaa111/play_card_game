import { applyCardArt } from "./card-art.js";
import { buildChainHistory } from "./chain-history.js";
import { auditLogEntries } from "./log-audit.js";

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
    item.innerHTML = `
      <span class="timeline-step">${entry.step}</span>
      <span class="timeline-text"></span>
    `;
    item.querySelector(".timeline-text").textContent = entry.text;
    fragment.appendChild(item);
  });
  root.appendChild(fragment);
}
