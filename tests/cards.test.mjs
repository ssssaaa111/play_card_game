import test from "node:test";
import assert from "node:assert/strict";

import {
  cardBadgeText,
  cardRuleText,
  cardTagText,
  cardTypeLabel,
  elementBadgeText,
  fusionRequirementText,
  inferArchetype,
  inferRarity,
  spellTargetSummary,
  tributeCostForDisplay,
  tributeRequirementText
} from "../src/cards.js";

test("infers rarity and archetype for major card categories", () => {
  assert.equal(inferRarity({ type: "monster", stars: 5, element: "fire" }), "SR");
  assert.equal(inferRarity({ type: "spell", effect: "battleTrance" }), "R");
  assert.equal(inferRarity({ type: "trap", trigger: "directShield" }), "R");

  assert.equal(inferArchetype({ type: "monster", element: "wind" }), "风属性");
  assert.equal(inferArchetype({ type: "spell", effect: "draw2" }), "资源");
  assert.equal(inferArchetype({ type: "trap", trigger: "directRebound" }), "破阵");
});

test("builds compact card badges and type labels", () => {
  assert.equal(cardBadgeText({ type: "monster", stars: 4 }), "★4");
  assert.equal(cardBadgeText({ type: "spell" }), "魔");
  assert.equal(cardBadgeText({ type: "trap" }), "陷");

  assert.equal(cardTypeLabel({ type: "monster" }), "怪兽");
  assert.equal(cardTypeLabel({ type: "spell" }), "魔法");
  assert.equal(cardTypeLabel({ type: "trap" }), "陷阱");
});

test("builds card display tags and rule summaries", () => {
  const monster = { type: "monster", stars: 4, element: "light" };
  const targetedSpell = { type: "spell", effect: "buff500" };
  const ordinarySpell = { type: "spell", effect: "draw2" };
  const trap = { type: "trap", trigger: "directShield" };

  assert.equal(elementBadgeText(monster), "光属性");
  assert.equal(cardTagText(monster), "稀有度 N / 流派 光属性");
  assert.equal(spellTargetSummary("buff500"), "我方最高");
  assert.equal(spellTargetSummary("pierceLine"), "敌方最高");
  assert.equal(spellTargetSummary("graveReturn"), "我方墓地");
  assert.equal(spellTargetSummary("draw2"), "");
  assert.equal(cardRuleText(targetedSpell), "目标:我方最高");
  assert.equal(cardRuleText(ordinarySpell), "N");
  assert.equal(cardRuleText(trap), "受到直接攻击时 / 直击伤害归零 / 消耗攻击");
});

test("builds tribute requirement display text from card definitions", () => {
  const tributeMonster = { type: "monster", stars: 8, tributeCost: 2 };

  assert.equal(tributeCostForDisplay(tributeMonster), 2);
  assert.match(tributeRequirementText(tributeMonster), /2/);
  assert.match(tributeRequirementText(tributeMonster, { compact: true }), /2/);
  assert.match(cardRuleText(tributeMonster), /2/);
  assert.equal(tributeRequirementText({ type: "monster", stars: 4 }), "");
});

test("builds fusion requirement display text from card definitions", () => {
  const fusionSpell = {
    type: "spell",
    effect: "fusionSummon",
    fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }
  };

  assert.match(fusionRequirementText(fusionSpell), /2/);
  assert.match(fusionRequirementText(fusionSpell, { compact: true }), /2/);
  assert.match(cardRuleText(fusionSpell), /2/);
  assert.equal(fusionRequirementText({ type: "spell", effect: "draw2" }), "");
});
