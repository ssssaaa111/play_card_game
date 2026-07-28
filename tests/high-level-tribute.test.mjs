import test from "node:test";
import assert from "node:assert/strict";

import { deckPresets, library, scenarioSetups } from "../src/data.js";
import { cardDetailViewModel } from "../src/card-detail.js";

const cardsById = new Map(library.map((card) => [card.id, card]));

test("normal-summon high-level monsters declare their tribute costs in unified card data", () => {
  const specialSummonOnly = new Set(["flare-gale-archon", "tempest-aegis-archon", "astral-forge-dragon"]);
  const expectedCosts = new Map([
    ["solar-vanguard", 1],
    ["flare-titan", 1],
    ["astral-comet-ace", 1],
    ["void-siege-breaker", 1],
    ["starfall-colossus", 2],
    ["celestial-origin-dragon", 3],
    ["trio-sun-judicator", 3],
    ["trio-moon-warden", 3],
    ["trio-star-herald", 3]
  ]);

  expectedCosts.forEach((cost, cardId) => {
    const card = cardsById.get(cardId);
    assert.equal(card?.tributeCost, cost, `${cardId} should require ${cost} tribute cards`);
    assert.equal(cardDetailViewModel(card).summonRequirement, `召唤需求：${cost} 只祭品`);
  });

  library
    .filter((card) => card.type === "monster" && card.stars >= 5 && !specialSummonOnly.has(card.id))
    .forEach((card) => {
      assert.ok(card.tributeCost > 0, `${card.id} is high-level and must declare a tribute cost`);
    });
});

test("fusion and effect-only special summon results do not gain tribute costs", () => {
  ["flare-gale-archon", "tempest-aegis-archon", "astral-forge-dragon"].forEach((cardId) => {
    assert.equal(cardsById.get(cardId)?.tributeCost, undefined, `${cardId} should keep its special summon route`);
  });
});

test("trio tribute fixture and full duel preserve the established campaign route", () => {
  const fixture = scenarioSetups.trioTributeSummon;
  assert.deepEqual(fixture.playerHand.slice(0, 1), ["trio-sun-judicator"]);
  assert.equal(fixture.playerField.length, 3);

  const full = scenarioSetups.protagonistTrioOmegaFull;
  assert.equal(full.aiField.length, 4);
  full.aiField.forEach((cardId) => {
    const card = cardsById.get(typeof cardId === "string" ? cardId : cardId.id);
    assert.equal(card?.type, "monster");
    assert.equal(card?.tributeCost, undefined);
  });
  assert.deepEqual(full.recommendedLine, [
    "用低星怪击破一只祭品候选并盖下防御，让对手无法在共降后保留额外前线。",
    "观察断链保护如何处理第一张攻击陷阱，保留后续反制资源。",
    "等对手三曜压力落地后，再选择清后场或保留墓地回收。",
    "反击窗口来自前面留下的低星资源和防御交换，而不是起手高攻碾压。"
  ]);
  assert.deepEqual(deckPresets.trioOmegaRivalFull.ids.slice(0, 5), [
    "trio-moon-dominion",
    "trio-sun-judicator",
    "trio-moon-warden",
    "trio-star-herald",
    "mirror-snare"
  ]);
});
