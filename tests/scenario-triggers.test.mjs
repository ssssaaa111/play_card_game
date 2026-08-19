import test from "node:test";
import assert from "node:assert/strict";

import { campaignDefinitions } from "../src/campaign.js";
import { scenarioSetups } from "../src/data.js";
import {
  evaluateScenarioObjectives,
  scenarioEventMatches,
  scenarioTriggerProgress
} from "../src/scenario-triggers.js";

const trial = campaignDefinitions.find((campaign) => campaign.id === "star-trial");
const templateIds = new Map([
  ["ace-runtime", "astral-comet-ace"],
  ["guard-runtime", "last-light-guard"],
  ["snare-runtime", "mirror-snare"],
  ["ember-material-runtime", "ember-soul-initiate"],
  ["lumen-material-runtime", "lumen-gearlet"],
  ["forge-spell-runtime", "soulforge-ascent"],
  ["forge-runtime", "astral-forge-dragon"],
  ["solar-snare-runtime", "trio-solar-snare"],
  ["dominion-runtime", "trio-moon-dominion"],
  ["pawn-runtime", "trio-ember-pawn"],
  ["counter-runtime", "trio-final-counter"],
  ["flare-runtime", "flare-titan"],
  ["decoy-runtime", "trio-decoy-ward"]
]);
const resolveCardId = (runtimeId) => templateIds.get(runtimeId) || runtimeId;

test("declarative event matching handles runtime cards and nested zones", () => {
  const event = {
    id: 1,
    type: "MONSTER_SUMMONED",
    playerId: "player",
    cardId: "ace-runtime",
    from: { zone: "grave" }
  };
  assert.equal(scenarioEventMatches(event, {
    eventType: "MONSTER_SUMMONED",
    playerId: "player",
    cardId: "astral-comet-ace",
    fromZone: "grave"
  }, { resolveCardId }), true);
  assert.equal(scenarioEventMatches(event, { eventType: "CARD_DESTROYED" }, { resolveCardId }), false);
  assert.equal(scenarioEventMatches(event, { fromZone: "hand" }, { resolveCardId }), false);
});

test("card matching distinguishes a destroyed card from the effect source", () => {
  const event = {
    id: 2,
    type: "CARD_DESTROYED",
    cardId: "decoy-runtime",
    sourceCardId: "solar-snare-runtime"
  };
  assert.equal(scenarioEventMatches(event, {
    eventType: "CARD_DESTROYED",
    cardId: "trio-decoy-ward"
  }, { resolveCardId }), true);
  assert.equal(scenarioEventMatches(event, {
    eventType: "CARD_DESTROYED",
    cardId: "trio-solar-snare"
  }, { resolveCardId }), false);
});

test("sequence triggers require matching events in order", () => {
  const trigger = {
    sequence: [
      { eventType: "CARD_DESTROYED", cardId: "mirror-snare" },
      { eventType: "ATTACK_DECLARED", cardId: "astral-comet-ace" }
    ]
  };
  const wrongOrder = [
    { id: 1, type: "ATTACK_DECLARED", attackerCardId: "ace-runtime" },
    { id: 2, type: "CARD_DESTROYED", cardId: "snare-runtime" }
  ];
  assert.deepEqual(scenarioTriggerProgress(trigger, { events: wrongOrder, resolveCardId }), {
    completed: false,
    eventIds: [2]
  });

  const rightOrder = [
    ...wrongOrder,
    { id: 3, type: "ATTACK_DECLARED", attackerCardId: "ace-runtime" }
  ];
  assert.deepEqual(scenarioTriggerProgress(trigger, { events: rightOrder, resolveCardId }), {
    completed: true,
    eventIds: [2, 3]
  });
  assert.equal(scenarioTriggerProgress(trigger, {
    events: rightOrder,
    afterEventId: 2,
    resolveCardId
  }).completed, false);
});

test("objective evaluation exposes partial sequence matches for live guidance", () => {
  const challenge = trial.chapters.find((chapter) => chapter.id === "comeback-challenge");
  const results = evaluateScenarioObjectives(challenge.objectives, {
    resolveCardId,
    events: [
      { id: 1, type: "CARD_ACTIVATED", cardId: "guard-runtime" },
      { id: 2, type: "CARD_DESTROYED", cardId: "snare-runtime" }
    ]
  });

  assert.deepEqual(results.map(({ id, completed, eventIds }) => ({ id, completed, eventIds })), [
    { id: "guard-last-light", completed: true, eventIds: [1] },
    { id: "break-snare-before-counterattack", completed: false, eventIds: [2] }
  ]);
});

test("objective evaluation selects a live recovery hint from matched events", () => {
  const evolution = trial.chapters.find((chapter) => chapter.id === "ace-evolution");
  const [result] = evaluateScenarioObjectives(evolution.objectives, {
    resolveCardId,
    events: [
      { id: 7, type: "CARD_DESTROYED", cardId: "ember-material-runtime" }
    ]
  });

  assert.equal(result.completed, false);
  assert.equal(result.hint, "素材被击破：用星屑返轨回收它，重新召唤后再发动星魂铸升。");
  assert.deepEqual(result.hintEventIds, [7]);

  const [brokenResult] = evaluateScenarioObjectives(evolution.objectives, {
    resolveCardId,
    events: [
      { id: 7, type: "CARD_DESTROYED", cardId: "ember-material-runtime" },
      { id: 9, type: "CARD_DESTROYED", cardId: "lumen-material-runtime" }
    ]
  });
  assert.equal(
    brokenResult.hint,
    "两只进化素材均已被击破，本次铸升路线已中断；从设置中重新开始本章可重试满星路线。"
  );
  assert.deepEqual(brokenResult.hintEventIds, [7, 9]);
});

test("trio challenge objectives track the authored two-turn finale", () => {
  const chapter = trial.chapters.find((entry) => entry.id === "trio-challenge");
  const results = evaluateScenarioObjectives(chapter.objectives, {
    resolveCardId,
    events: [
      { id: 1, type: "CARD_ACTIVATED", cardId: "solar-snare-runtime" },
      { id: 2, type: "CARD_DESTROYED", cardId: "dominion-runtime" },
      {
        id: 3,
        type: "MONSTER_SUMMONED",
        playerId: "player",
        cardId: "pawn-runtime",
        from: { zone: "grave" }
      },
      { id: 4, type: "CARD_ACTIVATED", cardId: "counter-runtime" },
      { id: 5, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "pawn-runtime" },
      { id: 6, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "pawn-runtime" }
    ]
  });

  assert.deepEqual(results.map(({ completed, eventIds }) => ({ completed, eventIds })), [
    { completed: true, eventIds: [1] },
    { completed: true, eventIds: [2, 3, 4, 5, 6] }
  ]);
});

test("trio challenge reports early-attack and wrong-recall recovery guidance", () => {
  const chapter = trial.chapters.find((entry) => entry.id === "trio-challenge");
  const earlyAttack = evaluateScenarioObjectives(chapter.objectives, {
    resolveCardId,
    events: [
      { id: 7, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "decoy-runtime" }
    ]
  });
  assert.equal(
    earlyAttack[0].hint,
    "你过早发起了攻击；保留日冕诱锁并跨过对手回合才是本章开局。"
  );
  assert.deepEqual(earlyAttack[0].hintEventIds, [7]);

  const wrongRecall = evaluateScenarioObjectives(chapter.objectives, {
    resolveCardId,
    events: [
      { id: 11, type: "CARD_ACTIVATED", cardId: "solar-snare-runtime" },
      { id: 12, type: "CARD_DESTROYED", cardId: "dominion-runtime" },
      {
        id: 13,
        type: "MONSTER_SUMMONED",
        playerId: "player",
        cardId: "flare-runtime",
        fromZone: "grave"
      }
    ]
  });
  assert.equal(wrongRecall[1].completed, false);
  assert.equal(
    wrongRecall[1].hint,
    "唯一回召已用于高攻诱饵，本次低星终局路线已中断；重新挑战可补完满星。"
  );
  assert.deepEqual(wrongRecall[1].hintEventIds, [13]);
});

test("the authored campaign chapters expose two attainable event objectives", () => {
  const [comeback, challenge, evolution, trioChallenge] = trial.chapters;
  assert.deepEqual(
    [comeback, challenge, evolution, trioChallenge].map((chapter) => chapter.objectives.length),
    [2, 2, 2, 2]
  );

  const comebackResults = evaluateScenarioObjectives(comeback.objectives, {
    resolveCardId,
    events: [
      { id: 1, type: "MONSTER_SUMMONED", playerId: "player", cardId: "ace-runtime", fromZone: "grave" },
      { id: 2, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "ace-runtime" }
    ]
  });
  assert.deepEqual(comebackResults.map((result) => result.completed), [true, true]);

  const challengeResults = evaluateScenarioObjectives(challenge.objectives, {
    resolveCardId,
    events: [
      { id: 1, type: "CARD_ACTIVATED", cardId: "guard-runtime" },
      { id: 2, type: "CARD_DESTROYED", cardId: "snare-runtime" },
      { id: 3, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "ace-runtime" }
    ]
  });
  assert.deepEqual(challengeResults.map((result) => result.completed), [true, true]);

  const evolutionResults = evaluateScenarioObjectives(evolution.objectives, {
    resolveCardId,
    events: [
      { id: 1, type: "CARD_ACTIVATED", cardId: "forge-spell-runtime" },
      { id: 2, type: "MONSTER_SUMMONED", playerId: "player", cardId: "forge-runtime", summonType: "special" },
      { id: 3, type: "ATTACK_DECLARED", playerId: "player", attackerCardId: "forge-runtime" }
    ]
  });
  assert.deepEqual(evolutionResults.map((result) => result.completed), [true, true]);
});

test("the reworked campaign chapters provide story beats backed by the shared trigger schema", () => {
  for (const chapter of trial.chapters.slice(0, 4)) {
    const beats = scenarioSetups[chapter.scenarioId].storyBeats;
    assert.equal(beats.length, 3);
    assert.equal(new Set(beats.map((beat) => beat.id)).size, beats.length);
    for (const beat of beats) {
      assert.ok(beat.when?.eventType);
      assert.ok(beat.line);
    }
  }
});
