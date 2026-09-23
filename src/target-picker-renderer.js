import { targetSelectionTargetLabel } from "./target-selection.js";

export function targetOptionOutcome(target, selection = {}) {
  if (selection?.purpose === "afterAttackTarget") return "攻击结算后破坏此卡";
  const outcomes = {
    graveRevive: "特殊召唤到我方怪兽区 · 状态重置",
    graveReturn: "从墓地回收到手牌",
    destroySpellTrap: "发动后破坏此魔陷",
    splitToken: "以此怪兽为来源生成 2 只衍生物",
    equipBlade: "装备给此怪兽",
    dawnEdge: "强化此怪兽",
    lastStandSurge: "强化此怪兽",
    aceCrackdown: "将效果施加给此怪兽"
  };
  if (outcomes[selection?.effect]) return outcomes[selection.effect];
  if (target?.zone === "grave") return "将此墓地卡作为效果目标";
  if (target?.zone === "traps") return "将此魔陷作为效果目标";
  return "将此怪兽作为效果目标";
}

// Only public identity is used here: an opponent's set trap stays a card back.
export function targetOptionView(target, { selected = false, definition = null, selection = null } = {}) {
  const card = target.card;
  const concealed = target.zone === "traps" && target.owner === "ai" && card.type !== "spell";
  const grave = target.zone === "grave";
  const base = definition || card;
  return {
    name: concealed ? "盖放卡牌" : card.name,
    cardId: concealed ? "hidden" : card.id,
    label: targetSelectionTargetLabel(target),
    detail: grave
      ? card.type === "monster"
        ? `${base.stars || 0} 星 · 基础 ATK ${base.atk || 0} / DEF ${base.def || 0}`
        : card.type === "spell" ? "墓地 · 魔法卡" : "墓地 · 陷阱卡"
      : `${target.owner === "player" ? "我方" : "敌方"}${target.zone === "traps" ? "魔陷" : "怪兽"}区 ${target.index + 1}`,
    outcome: targetOptionOutcome(target, selection),
    selected,
    concealed,
    grave
  };
}

export function renderTargetOptions({ document, root, targets, selection, selectedAt, definitionForCard, assetForCard, onSelect, onDetail }) {
  const scrollTop = root.scrollTop;
  const scrollLeft = root.scrollLeft;
  const focused = root.contains(document.activeElement) ? document.activeElement?.dataset.targetKey : null;
  root.replaceChildren();
  targets.forEach((target) => {
    const view = targetOptionView(target, {
      selected: selectedAt(target),
      definition: definitionForCard?.(target.card),
      selection
    });
    const row = document.createElement("div");
    row.className = "target-option-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `target-option card targetable${view.grave ? " grave-target-card" : ""}${view.selected ? " target-selected" : ""}`;
    button.dataset.cardId = view.cardId;
    button.dataset.cardName = view.name;
    button.dataset.zone = `${target.owner}-${target.zone}`;
    button.dataset.targetState = "legal";
    button.dataset.targetKey = `${target.owner}:${target.zone}:${target.index}`;
    button.setAttribute("aria-pressed", String(view.selected));
    button.setAttribute("aria-label", `${view.label}，${view.selected ? "已选中" : "点击选择"}，${view.detail}，${view.outcome}`);
    if (view.grave && target.card.type === "monster") {
      const asset = assetForCard?.(target.card);
      if (asset) {
        const image = document.createElement("img");
        image.src = asset;
        image.alt = "";
        button.appendChild(image);
      }
    }
    const copy = document.createElement("span");
    copy.className = "target-option-copy";
    const name = document.createElement("strong");
    name.textContent = view.name;
    const detail = document.createElement("small");
    detail.textContent = view.detail;
    const outcome = document.createElement("span");
    outcome.className = "target-option-outcome";
    outcome.textContent = view.outcome;
    copy.append(name, detail, outcome);
    const check = document.createElement("span");
    check.className = "target-option-check";
    check.textContent = view.selected ? "已选 ✓" : "选此目标";
    check.setAttribute("aria-hidden", "true");
    button.append(copy, check);
    button.addEventListener("click", (event) => onSelect(target, event.detail >= 2));
    row.appendChild(button);
    if (view.grave && onDetail) {
      const details = document.createElement("button");
      details.type = "button";
      details.className = "target-option-detail";
      details.textContent = "详情";
      details.setAttribute("aria-label", `查看${view.name}详情`);
      details.dataset.targetKey = `detail:${button.dataset.targetKey}`;
      details.addEventListener("click", () => onDetail(target.card));
      row.appendChild(details);
    }
    root.appendChild(row);
  });
  root.scrollTop = scrollTop;
  root.scrollLeft = scrollLeft;
  if (focused) {
    Array.from(root.querySelectorAll("[data-target-key]"))
      .find((entry) => entry.dataset.targetKey === focused)?.focus({ preventScroll: true });
  }
}
