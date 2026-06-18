import test from "node:test";
import assert from "node:assert/strict";

import { simulateChainTrapScenario, simulateRandomDuels } from "../src/rule-simulator.js";

test("random duel simulator exercises core rules through dispatch", () => {
  const result = simulateRandomDuels({
    games: 20,
    seed: "rule-sim-baseline",
    maxStepsPerGame: 260
  });

  assert.equal(result.games, 20);
  assert.equal(result.failures.length, 0);
  assert.equal(result.maxStepsReached, 0);
  assert.ok(result.totalSteps > 0);
  assert.ok(result.actions.RESOLVE_TURN_DRAW > 0);
  assert.ok(result.actions.SUMMON_MONSTER > 0);
  assert.ok(result.actions.ACTIVATE_CARD > 0);
  assert.ok(result.actions.SET_TRAP > 0);
  assert.ok(result.actions.DECLARE_ATTACK > 0);
  assert.ok(result.actions.RESOLVE_BATTLE > 0);
  assert.ok(result.eventTypes.RESPONSE_WINDOW_OPENED > 0);
  assert.ok(result.eventTypes.RESPONSE_WINDOW_CLOSED > 0);
  assert.ok(result.eventTypes.BATTLE_RESOLVED > 0);
});

test("random duel simulator is deterministic for the same seed", () => {
  const first = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });
  const second = simulateRandomDuels({ games: 5, seed: "repeatable", maxStepsPerGame: 160 });

  assert.deepEqual(second, first);
});

test("chain trap scenario resolves through response window and chain events", () => {
  const result = simulateChainTrapScenario();

  assert.equal(result.failures.length, 0);
  assert.equal(result.actions.DECLARE_ATTACK, 1);
  assert.equal(result.actions.RESOLVE_CHAIN, 1);
  assert.equal(result.actions.RESOLVE_BATTLE, 1);
  assert.ok(result.eventTypes.CHAIN_LINK_ADDED >= 2);
  assert.ok(result.eventTypes.CHAIN_LINK_COMMITTED >= 2);
  assert.ok(result.eventTypes.EFFECT_NEGATED >= 1);
  assert.ok(result.eventTypes.CHAIN_RESOLVED >= 1);
  assert.ok(result.eventTypes.BATTLE_RESOLVED >= 1);
});
