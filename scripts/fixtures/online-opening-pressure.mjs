import { createHash } from "node:crypto";
import { createOnlineDuelState } from "../../server/online-duel-state.js";
import decks from "./online-opening-decks.json" with { type: "json" };

export function mixedRecoveryDecks() {
  const ids = [...decks.burn.ids];
  ids[ids.lastIndexOf("grave-return")] = "material-reclaim";
  ids[ids.lastIndexOf("renewal")] = "material-reclaim";
  return { ...decks, burn: { kind: "custom", name: "炎岚混合回收", ids } };
}

export function createSeededOpening(config, seed, lastSparkDrawOne = false) {
  let randomState = createHash("sha256").update(seed).digest().readUInt32LE();
  const previousRandom = Math.random;
  let state;
  try {
    Math.random = () => {
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      return randomState / 2 ** 32;
    };
    state = createOnlineDuelState(config);
  } finally {
    Math.random = previousRandom;
  }
  if (lastSparkDrawOne) {
    for (const card of Object.values(state.cards)) {
      if (card.templateId !== "last-spark") continue;
      card.effect = "draw1";
      card.text = "抽 1 张卡。";
    }
  }
  return state;
}

export function createOpeningDamageScenario(config, lastSparkDrawOne) {
  const decks = mixedRecoveryDecks();
  return createSeededOpening({
    ...config, deckChoices: { p1: decks.burn, p2: decks.rush }
  }, "opening-mixed-v1:burn:rush:46", lastSparkDrawOne);
}
