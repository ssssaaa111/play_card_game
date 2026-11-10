import { renderBattlePreviewElement } from "./battle-preview-renderer.js";

function text(doc, parent, tag, className, value) {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = value;
  parent.appendChild(node);
  return node;
}

export function renderOnlineAttackPreview(doc, root, decision) {
  root.replaceChildren();
  root.hidden = !decision;
  root.className = "online-attack-preview";
  if (!decision) return;
  root.dataset.tone = decision.tone;
  root.dataset.previewMode = decision.preview.mode;
  const route = text(doc, root, "div", "online-attack-route", "");
  for (const [index, participant] of [decision.source, decision.target].entries()) {
    if (index) text(doc, route, "span", "online-attack-route-arrow", "→");
    const side = text(doc, route, "div", "online-attack-participant", "");
    text(doc, side, "small", "", `${index ? "目标" : "攻击者"} · ${participant.slot}`);
    text(doc, side, "strong", "", participant.name);
    text(doc, side, "span", "", participant.stat);
  }
  const outcome = text(doc, root, "div", "online-attack-outcome", "");
  text(doc, outcome, "strong", "", decision.summary);
  text(doc, outcome, "span", "", decision.lp || decision.result);
  if (decision.preview.mode === "intent") return;
  const details = text(doc, root, "details", "online-attack-details", "");
  text(doc, details, "summary", "", `${decision.result} · 查看结算详情`);
  const full = text(doc, details, "div", "", "");
  renderBattlePreviewElement(doc, full, decision.preview);
  text(doc, root, "small", "online-attack-caveat", "按当前攻防预估，响应效果可能改变结果。");
}
