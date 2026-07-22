import test from "node:test";
import assert from "node:assert/strict";

import { scenarioTacticalGoal } from "../src/scenario-guidance.js";

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
