import { logEntryMessage, publicLogCardIds } from "./battle-log.js";

export function currentLogEntries(log = [], started = false, limit = 5) {
  if (log.length > 0) return log.slice(0, Math.max(0, limit));
  return [started ? "等待行动结算。" : "准备决斗。"];
}

export function logEntrySegments(entry, { findCard = () => null } = {}) {
  const message = logEntryMessage(entry);
  const refs = publicLogCardIds(entry)
    .map((cardId) => findCard(cardId))
    .filter((card) => card?.id && card?.name && message.includes(card.name))
    .filter((card, index, list) => list.findIndex((item) => item.id === card.id) === index);
  if (refs.length === 0) return [{ type: "text", text: message }];

  const segments = [];
  let offset = 0;
  while (offset < message.length) {
    let next = null;
    refs.forEach((card) => {
      const index = message.indexOf(card.name, offset);
      if (index < 0) return;
      if (!next || index < next.index || (index === next.index && card.name.length > next.card.name.length)) {
        next = { index, card };
      }
    });
    if (!next) {
      segments.push({ type: "text", text: message.slice(offset) });
      break;
    }
    if (next.index > offset) {
      segments.push({ type: "text", text: message.slice(offset, next.index) });
    }
    segments.push({
      type: "card",
      cardId: next.card.id,
      name: next.card.name
    });
    offset = next.index + next.card.name.length;
  }
  return segments;
}

export function appendLogEntryContent({
  document,
  root,
  entry,
  findCard = () => null,
  onCardClick = () => {},
  buttonClassName = "log-card-link"
} = {}) {
  logEntrySegments(entry, { findCard }).forEach((segment) => {
    if (segment.type === "text") {
      root.appendChild(document.createTextNode(segment.text));
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonClassName;
    button.dataset.cardId = segment.cardId;
    button.textContent = segment.name;
    button.title = `查看 ${segment.name} 详情`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onCardClick(segment.cardId);
    });
    root.appendChild(button);
  });
}

export function renderCurrentLog({
  document,
  root,
  log = [],
  started = false,
  findCard = () => null,
  onCardClick = () => {}
} = {}) {
  if (!root) return;
  const fragment = document.createDocumentFragment();
  const head = document.createElement("div");
  head.className = "log-head";
  head.innerHTML = `<span>当前战况</span><span class="log-badge">最近</span>`;
  fragment.appendChild(head);

  currentLogEntries(log, started).forEach((entry, index) => {
    const line = document.createElement("div");
    line.className = index === 0 ? "log-line" : "log-line secondary";
    appendLogEntryContent({
      document,
      root: line,
      entry,
      findCard,
      onCardClick
    });
    fragment.appendChild(line);
  });
  root.replaceChildren(fragment);
}
