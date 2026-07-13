const SUPPORT_STATES = {
  armed: { key: "armed", label: "已盖放", description: "陷阱已盖放" },
  active: { key: "active", label: "生效中", description: "持续魔法生效中" },
  response: { key: "response", label: "可发动", description: "陷阱可以发动" },
  selected: { key: "selected", label: "已选择", description: "陷阱已选择，等待发动" },
  targeting: { key: "targeting", label: "选目标", description: "选择这张魔陷卡作为目标" }
};

export function buildSupportCardDisplay(card, {
  responseReady = false,
  responseSelected = false,
  targetable = false
} = {}) {
  const type = card?.type === "spell" ? "spell" : "trap";
  let state = type === "spell" ? SUPPORT_STATES.active : SUPPORT_STATES.armed;

  if (responseReady) state = SUPPORT_STATES.response;
  if (targetable) state = SUPPORT_STATES.targeting;
  if (responseSelected) state = SUPPORT_STATES.selected;

  return {
    ...state,
    type,
    typeLabel: type === "spell" ? "魔法" : "陷阱"
  };
}
