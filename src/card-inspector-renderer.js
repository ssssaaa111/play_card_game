export function bindCardInspector(doc) {
  const root = doc.querySelector(".detail-card");
  if (!root) return null;
  return {
    root,
    name: root.querySelector("#detailName"),
    emptyText: root.querySelector("#detailText"),
    inspector: root.querySelector("#detailInspector"),
    summary: root.querySelector("#detailSummary"),
    effect: root.querySelector("#detailEffect"),
    meta: root.querySelector("#detailMeta")
  };
}

function createMetaRow(doc, row) {
  const group = doc.createElement("div");
  group.className = "detail-meta-row";
  const label = doc.createElement("dt");
  label.textContent = row.label;
  const value = doc.createElement("dd");
  value.textContent = row.value;
  group.appendChild(label);
  group.appendChild(value);
  return group;
}

export function renderCardInspector(doc, elements, view) {
  if (!elements || !view) return false;
  elements.root.dataset.cardType = view.cardType;
  elements.name.textContent = view.name;
  elements.emptyText.hidden = true;
  elements.inspector.hidden = false;
  elements.summary.textContent = view.tacticalSummary;
  elements.effect.textContent = view.effectText;

  const fragment = doc.createDocumentFragment();
  for (const row of view.rows) fragment.appendChild(createMetaRow(doc, row));
  elements.meta.textContent = "";
  elements.meta.appendChild(fragment);
  return true;
}
