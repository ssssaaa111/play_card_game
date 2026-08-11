import test from "node:test";
import assert from "node:assert/strict";

import {
  projectTrioAscensionObjective,
  scenarioTacticalGoal
} from "../src/scenario-guidance.js";

function card(id) {
  return { id };
}

function trioState(overrides = {}) {
  return {
    started: true,
    scenarioId: "protagonistTrioOmegaChallenge",
    turn: "player",
    player: {
      hand: [],
      field: [],
      traps: [],
      grave: []
    },
    ai: {
      field: [],
      traps: []
    },
    gameEvents: [],
    ...overrides
  };
}

test("guides the trio route through defense and moon pressure", () => {
  const opening = trioState({
    player: {
      hand: [card("trio-solar-snare"), card("trio-moonbreaker-ray")],
      field: [],
      traps: [],
      grave: []
    },
    ai: {
      field: [card("trio-sun-judicator")],
      traps: [card("trio-moon-dominion")]
    }
  });
  assert.match(scenarioTacticalGoal(opening), /先布防.*日冕诱锁/);

  const defended = {
    ...opening,
    player: {
      ...opening.player,
      hand: [card("trio-moonbreaker-ray")],
      traps: [card("trio-solar-snare")]
    }
  };
  assert.match(scenarioTacticalGoal(defended), /防御准备完成/);
  assert.match(scenarioTacticalGoal({ ...defended, turn: "ai" }), /对手行动中.*日冕诱锁/);

  const counterattack = {
    ...defended,
    ai: {
      field: [card("trio-moon-warden")],
      traps: [card("trio-moon-dominion")]
    },
    gameEvents: [{
      type: "CONTINUOUS_EFFECT_REGISTERED",
      id: "continuous:moon",
      playerId: "ai",
      effectId: "lunarDominion"
    }]
  };
  assert.match(scenarioTacticalGoal(counterattack), /反击窗口.*碎月解幕/);
});

test("advances the gauntlet story objective after solar snare is set", () => {
  const opening = trioState({
    scenarioId: "protagonistTrioOmegaStory",
    player: {
      hand: [card("trio-solar-snare")],
      field: [card("trio-decoy-ward")],
      traps: [],
      grave: [card("trio-ember-pawn")]
    },
    ai: {
      field: [card("trio-sun-judicator"), card("trio-moon-warden"), card("trio-star-herald")],
      traps: [card("trio-moon-dominion")]
    }
  });
  const defended = {
    ...opening,
    player: {
      ...opening.player,
      hand: [],
      traps: [card("trio-solar-snare")]
    }
  };

  assert.match(scenarioTacticalGoal(opening), /先布防.*日冕诱锁/);
  assert.match(scenarioTacticalGoal(defended), /防御准备完成.*结束回合/);
});

test("does not describe an orphaned lunar dominion card as active pressure", () => {
  const registered = {
    type: "CONTINUOUS_EFFECT_REGISTERED",
    id: "continuous:moon",
    playerId: "ai",
    effectId: "lunarDominion"
  };
  const released = {
    ...registered,
    type: "CONTINUOUS_EFFECT_RELEASED",
    reason: "target-left-zone"
  };
  const state = trioState({
    player: {
      hand: [card("trio-ember-recall"), card("trio-final-counter")],
      field: [],
      traps: [],
      grave: [card("trio-ember-pawn")]
    },
    ai: {
      field: [card("trio-moon-warden")],
      traps: [card("trio-moon-dominion")]
    },
    gameEvents: [registered, released]
  });

  assert.match(scenarioTacticalGoal(state), /回召真正的终局资源/);
  assert.doesNotMatch(scenarioTacticalGoal(state), /月曜帷幕仍在生效/);
});

test("recognizes early defense setup before the full-duel sun god arrives", () => {
  const setup = trioState({
    scenarioId: "protagonistTrioOmegaFull",
    player: {
      hand: [],
      field: [card("spark-runner")],
      traps: [card("trio-solar-snare")],
      grave: []
    },
    ai: {
      field: [card("iron-guardian"), card("rift-bulwark"), card("void-hound")],
      traps: []
    }
  });

  assert.match(scenarioTacticalGoal(setup), /防御准备完成.*结束回合/);
});

test("guides the trio route from low-star recovery into the finale", () => {
  const recovery = trioState({
    player: {
      hand: [card("trio-ember-recall"), card("trio-final-counter")],
      field: [],
      traps: [],
      grave: [card("trio-ember-pawn")]
    }
  });
  assert.match(scenarioTacticalGoal(recovery), /回召真正的终局资源.*余烁小卫/);

  const finale = {
    ...recovery,
    player: {
      ...recovery.player,
      hand: [card("trio-final-counter")],
      field: [card("trio-ember-pawn")],
      grave: []
    }
  };
  assert.match(scenarioTacticalGoal(finale), /终局窗口.*三曜终断/);
});

test("only adds tactical goals to active trio scenarios", () => {
  assert.equal(scenarioTacticalGoal({ started: false, scenarioId: "protagonistTrioOmega" }), "");
  assert.equal(scenarioTacticalGoal({ started: true, scenarioId: "normal" }), "");
});

test("projects ascension progress from public summon events without reading AI hand", () => {
  const hiddenAi = {
    field: [card("iron-guardian"), card("rift-bulwark"), card("void-hound"), card("nova-squire")],
    traps: [],
    get hand() {
      throw new Error("ascension objective must not inspect hidden AI hand");
    }
  };
  const opening = trioState({
    scenarioId: "protagonistTrioOmegaAscension",
    ai: hiddenAi
  });

  assert.deepEqual(projectTrioAscensionObjective(opening), {
    stage: "firstGod",
    completedGodSummons: 0,
    tributeCandidates: 4,
    tributeProgress: 3,
    goal: "第一神降临准备：对手已有 3/3 只公开祭品候选，现在是切断祭品链的最后窗口。"
  });
  assert.equal(scenarioTacticalGoal(opening), projectTrioAscensionObjective(opening).goal);

  const afterFirstGod = {
    ...opening,
    ai: {
      field: [
        { id: "trio-sun-judicator", archetype: "三曜神格" },
        card("nova-squire"),
        null,
        null,
        null
      ],
      traps: []
    },
    gameEvents: [
      { type: "CARD_TRIBUTED", playerId: "ai", cardId: "tribute-1", summonCardId: "sun-1", tributeCost: 3 },
      { type: "CARD_TRIBUTED", playerId: "ai", cardId: "tribute-2", summonCardId: "sun-1", tributeCost: 3 },
      { type: "CARD_TRIBUTED", playerId: "ai", cardId: "tribute-3", summonCardId: "sun-1", tributeCost: 3 },
      { type: "MONSTER_SUMMONED", playerId: "ai", cardId: "sun-1", summonType: "tribute" },
      { type: "MONSTER_SUMMONED", playerId: "ai", cardId: "moon-1", summonType: "trioConvergence" }
    ]
  };

  assert.deepEqual(projectTrioAscensionObjective(afterFirstGod), {
    stage: "rebuildSecond",
    completedGodSummons: 1,
    tributeCandidates: 1,
    tributeProgress: 1,
    goal: "第一神已降临 · 下一次降神重建 1/3：清理公开祭品可以真实推迟第二次降神。"
  });
});

test("ascension objective advances only after independent three-tribute summons", () => {
  const events = [];
  for (const [summonCardId, prefix] of [["sun-1", "a"], ["moon-1", "b"]]) {
    for (let index = 1; index <= 3; index += 1) {
      events.push({
        type: "CARD_TRIBUTED",
        playerId: "ai",
        cardId: `${prefix}-${index}`,
        summonCardId,
        tributeCost: 3
      });
    }
    events.push({ type: "MONSTER_SUMMONED", playerId: "ai", cardId: summonCardId, summonType: "tribute" });
  }
  const state = trioState({
    scenarioId: "protagonistTrioOmegaAscension",
    ai: {
      field: [
        { id: "trio-sun-judicator", archetype: "三曜神格" },
        { id: "trio-moon-warden", archetype: "三曜神格" },
        card("spark-fragment-token"),
        card("flare-gale-archon"),
        null
      ],
      traps: []
    },
    gameEvents: events
  });

  assert.deepEqual(projectTrioAscensionObjective(state), {
    stage: "rebuildFinal",
    completedGodSummons: 2,
    tributeCandidates: 2,
    tributeProgress: 2,
    goal: "两次独立降神已完成 · 最终降神准备 2/3：再清掉一只公开祭品就能延后第三神。"
  });
});
