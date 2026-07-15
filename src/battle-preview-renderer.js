function appendTextElement(doc, parent, tagName, className, text) {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderComparison(doc, root, compare) {
  const versus = doc.createElement("div");
  versus.className = "battle-preview-versus";

  const attacker = doc.createElement("div");
  attacker.className = "battle-preview-side attacker";
  appendTextElement(doc, attacker, "span", "", compare.attackerLabel);
  appendTextElement(doc, attacker, "strong", "", compare.attackerValue);

  const tone = compare.diff > 0 ? "positive" : compare.diff < 0 ? "negative" : "even";
  const diffText = compare.diff > 0 ? `+${compare.diff}` : `${compare.diff}`;
  const diff = appendTextElement(doc, versus, "div", `battle-preview-diff ${tone}`, diffText);

  const target = doc.createElement("div");
  target.className = "battle-preview-side target";
  appendTextElement(doc, target, "span", "", compare.targetLabel);
  appendTextElement(doc, target, "strong", "", compare.targetValue);

  versus.insertBefore(attacker, diff);
  versus.appendChild(target);
  root.appendChild(versus);
}

function renderRows(doc, root, preview) {
  const grid = doc.createElement("div");
  grid.className = "battle-preview-grid";
  const comparedLabels = new Set(["攻击方", "目标", "差值"]);
  const rows = preview.rows.filter((row) => !preview.compare || !comparedLabels.has(row.label));
  for (const row of rows) {
    const item = doc.createElement("div");
    item.className = "battle-preview-row";
    appendTextElement(doc, item, "span", "", row.label);
    appendTextElement(doc, item, "strong", "", row.value);
    grid.appendChild(item);
  }
  if (rows.length) root.appendChild(grid);
}

export function renderBattlePreviewElement(doc, root, preview) {
  if (!root) return false;
  root.textContent = "";
  root.className = `battle-preview${preview ? "" : " empty"}${preview?.tone ? ` ${preview.tone}` : ""}`;
  root.dataset.previewMode = preview?.mode || "empty";
  if (!preview) return true;

  const title = doc.createElement("div");
  title.className = "battle-preview-title";
  appendTextElement(doc, title, "span", "", preview.mode === "intent" ? "攻击目标预览" : "攻击结算预览");
  appendTextElement(doc, title, "strong", "", preview.badge);
  root.appendChild(title);

  if (preview.compare) renderComparison(doc, root, preview.compare);
  renderRows(doc, root, preview);
  appendTextElement(doc, root, "div", "battle-preview-result", preview.result);
  return true;
}
