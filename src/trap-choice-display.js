export function buildTrapChoiceDisplay(card, { selected = false } = {}) {
  const name = card?.name || "未知陷阱";
  const effectText = card?.text || "满足当前事件，可以发动。";
  const state = selected ? "selected" : "ready";
  const stateLabel = selected ? "已选择" : "可发动";

  return {
    name,
    effectText,
    state,
    stateLabel,
    typeLabel: card?.type === "spell" ? "魔法" : "陷阱",
    ariaLabel: `${name}，${stateLabel}。${effectText}`
  };
}
