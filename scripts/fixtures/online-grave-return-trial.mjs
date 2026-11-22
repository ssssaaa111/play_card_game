import { createOnlineDuelState } from "../../server/online-duel-state.js";

export function createGraveReturnTrialState(config) {
  return createOnlineDuelState({
    ...config,
    openingHands: {
      p1: ["grave-return", "grave-return", "solar-knight", "war-chant", "guard-sigil"],
      p2: ["grave-return", "solar-knight", "gale-mage", "war-chant", "guard-sigil"]
    },
    openingGraves: { p1: ["iron-guardian", "mirror-snare"], p2: ["iron-guardian"] }
  });
}
