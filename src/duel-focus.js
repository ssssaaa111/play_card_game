const AI_ACTION_STAGES = new Set(["source", "target", "resolve", "result"]);

export function duelFocusView({
  aiActionActive = false,
  aiStage = "source",
  responseActive = false,
  targetActive = false,
  materialActive = false,
  placementActive = false,
  attackActive = false,
  selectionActive = false
} = {}) {
  if (aiActionActive) {
    return {
      mode: "resolution",
      stage: AI_ACTION_STAGES.has(aiStage) ? aiStage : "source",
      actor: "ai"
    };
  }
  if (responseActive) return { mode: "response", stage: "target", actor: "mixed" };
  if (targetActive) return { mode: "target", stage: "target", actor: "player" };
  if (materialActive) return { mode: "material", stage: "target", actor: "player" };
  if (placementActive) return { mode: "placement", stage: "target", actor: "player" };
  if (attackActive) return { mode: "attack", stage: "target", actor: "player" };
  if (selectionActive) return { mode: "command", stage: "source", actor: "player" };
  return { mode: "idle", stage: "none", actor: "none" };
}
