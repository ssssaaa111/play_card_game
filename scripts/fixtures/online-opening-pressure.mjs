import { createHash } from "node:crypto";
import { createOnlineDuelState } from "../../server/online-duel-state.js";
import decks from "./online-opening-decks.json" with { type: "json" };

export function mixedRecoveryDecks() {
  const ids = [...decks.burn.ids];
  ids[ids.lastIndexOf("grave-return")] = "material-reclaim";
  ids[ids.lastIndexOf("renewal")] = "material-reclaim";
  return { ...decks, burn: { kind: "custom", name: "炎岚混合回收", ids } };
}

export function createSeededOpening(config, seed, {
  lastSparkDrawOne = false, burstRune400 = false, burstRuneOncePerTurn = false
} = {}) {
  let randomState = createHash("sha256").update(seed).digest().readUInt32LE();
  const previousRandom = Math.random;
  let state;
  try {
    Math.random = () => {
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      return randomState / 2 ** 32;
    };
    state = createOnlineDuelState({ ...config, legacyBurstRuneDamage: !(burstRune400 || burstRuneOncePerTurn) });
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
  if (burstRuneOncePerTurn) {
    const limitedRune = { effect: "burn400OncePerTurn", text: "对对手造成 400 点伤害。同一张卡每回合只能发动 1 次。" };
    state.cardDefinitions["burst-rune"] = { ...state.cardDefinitions["burst-rune"], ...limitedRune };
    for (const card of Object.values(state.cards)) {
      if (card.templateId === "burst-rune") Object.assign(card, limitedRune);
    }
  }
  return state;
}

export function createOpeningDamageScenario(adjustments, openingCase = adjustments.burstRune400 ? "burn:basic:34" : "burn:rush:46") {
  if (!/^(basic:burn|rush:burn|burn:basic|burn:rush):\d+$/.test(openingCase)) {
    throw new Error("Expected --opening-case=burn:rush:46 or another mixed recovery case");
  }
  const [first, second] = openingCase.split(":");
  const decks = mixedRecoveryDecks();
  return config => createSeededOpening({
    ...config, deckChoices: { p1: decks[first], p2: decks[second] }
  }, `opening-mixed-v1:${openingCase}`, adjustments);
}
