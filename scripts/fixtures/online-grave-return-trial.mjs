import { createOnlineDuelState } from "../../server/online-duel-state.js";

export function createGraveReturnTrialState(config) {
  return createOnlineDuelState({
    ...config,
    openingHands: {
      p1: ["grave-return", "material-reclaim", "solar-knight", "starwake-recall", "guard-sigil"],
      p2: ["material-reclaim", "grave-return", "gale-mage", "war-chant", "guard-sigil"]
    },
    openingGraves: { p1: ["iron-guardian", "mirror-snare", "gale-mage"], p2: ["iron-guardian"] }
  });
}
