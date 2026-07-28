import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeFinaleBalance,
  simulateFinaleDeployment
} from "../src/finale-balance-audit.js";

test("authored finale opening guarantees a legal three-tribute full trio deployment", () => {
  const report = analyzeFinaleBalance({
    samples: 40,
    seed: "finale-authored-opening"
  });

  assert.deepEqual(report.authored.opening.cards, [
    "trio-moon-dominion",
    "trio-sun-judicator",
    "trio-moon-warden",
    "trio-star-herald",
    "mirror-snare"
  ]);
  assert.equal(report.authored.opening.fullTrioReady, true);
  assert.equal(report.authored.opening.fullPressurePackage, true);
  assert.equal(report.authored.deployment.legal, true);
  assert.equal(report.authored.deployment.tributeCount, 3);
  assert.equal(report.authored.deployment.convergenceCount, 2);
  assert.equal(report.authored.deployment.fullTrioEstablished, true);
  assert.equal(report.authored.deployment.lockedByConvergence, 2);
  assert.equal(report.authored.deployment.immediatelyAttackable, 1);
  assert.equal(report.authored.deployment.totalPrintedAtkOnField, 7500);
});

test("losing one of four opening tribute bodies still permits the authored trio deployment", () => {
  const report = simulateFinaleDeployment({
    tributeBodies: 3,
    sampleId: "tribute-disruption"
  });

  assert.equal(report.legal, true);
  assert.equal(report.reason, null);
  assert.equal(report.tributeCount, 3);
  assert.equal(report.convergenceCount, 2);
  assert.equal(report.fullTrioEstablished, true);
});

test("losing two opening tribute bodies blocks the authored trio deployment without a partial summon", () => {
  const report = simulateFinaleDeployment({
    tributeBodies: 2,
    sampleId: "double-tribute-disruption"
  });

  assert.equal(report.legal, false);
  assert.equal(report.reason, "insufficient-tributes");
  assert.equal(report.tributeCount, 0);
  assert.equal(report.convergenceCount, 0);
  assert.equal(report.fullTrioEstablished, false);
  assert.deepEqual(report.trioOnField, []);
});

test("existing attack-destroy response can remove the tribute-summoned trio source", () => {
  const report = simulateFinaleDeployment({
    tributeBodies: 3,
    includeAttackDestroyTrap: true,
    sampleId: "trap-vulnerability"
  });

  assert.equal(report.legal, true);
  assert.equal(report.trapResult.trapTemplateId, "trio-solar-snare");
  assert.equal(report.trapResult.sourceGodTemplateId, "trio-sun-judicator");
  assert.equal(report.trapResult.sourceGodDestroyed, true);
  assert.equal(report.trapResult.destroyEvents, 1);
  assert.deepEqual(new Set(report.trapResult.remainingTrioGods), new Set([
    "trio-moon-warden",
    "trio-star-herald"
  ]));
});

test("shuffled finale opening audit is deterministic and checkpoint rates are monotonic", () => {
  const options = {
    samples: 200,
    seed: "finale-shuffle-determinism",
    drawCheckpoints: [5, 6, 8, 10, 12]
  };
  const first = analyzeFinaleBalance(options);
  const second = analyzeFinaleBalance(options);

  assert.deepEqual(first, second);
  assert.equal(first.deck.size, 40);
  assert.deepEqual(first.deck.trioGodCopies, {
    "trio-sun-judicator": 4,
    "trio-moon-warden": 4,
    "trio-star-herald": 4
  });
  let previousAllThreeRate = 0;
  for (const checkpoint of first.drawCheckpoints) {
    const entry = first.shuffled.checkpoints[checkpoint];
    assert.ok(entry.anyGodRate >= entry.twoDistinctGodsRate);
    assert.ok(entry.twoDistinctGodsRate >= entry.allThreeGodsRate);
    assert.ok(entry.allThreeGodsRate >= previousAllThreeRate);
    previousAllThreeRate = entry.allThreeGodsRate;
  }
  assert.ok(first.shuffled.earliestDraw.anyGod.median > 0);
  assert.ok(first.shuffled.earliestDraw.allThreeGods.median >= first.shuffled.earliestDraw.anyGod.median);
});

test("trio protection audit confirms high tribute cost without inherited divine immunity", () => {
  const report = analyzeFinaleBalance({
    samples: 20,
    seed: "finale-protection-profile"
  });

  assert.equal(report.protection.length, 3);
  for (const card of report.protection) {
    assert.equal(card.tributeCost, 3);
    assert.equal(card.destructionProtection, false);
    assert.equal(card.targetResistance, false);
    assert.equal(card.piercingDamage, false);
    assert.equal(card.shieldPierce, false);
  }
});
