import test from "node:test";
import assert from "node:assert/strict";

import { availableElementCombos } from "../src/combos.js";

function monster(element) {
  return {
    type: "monster",
    name: `${element} monster`,
    element,
    atk: 1000,
    def: 1000
  };
}

function duelist(field, comboFlags = {}) {
  return {
    field,
    comboFlags
  };
}

test("finds element combos from the current field", () => {
  const owner = duelist([monster("fire"), monster("wind"), null]);
  assert.deepEqual(availableElementCombos(owner).map((combo) => combo.flag), ["fireWind"]);

  const triad = duelist([monster("fire"), monster("wind"), monster("light")]);
  assert.deepEqual(availableElementCombos(triad).map((combo) => combo.flag), ["fireWind", "triad"]);
  assert.equal(availableElementCombos(triad).find((combo) => combo.flag === "triad").text, "场上集齐 3 种属性，全体怪兽攻击力提升 200。");
});

test("respects resolved combo flags and trap-only combo sources", () => {
  const owner = duelist([monster("shadow"), monster("light"), null], { lightShadow: true });
  assert.deepEqual(availableElementCombos(owner).map((combo) => combo.flag), []);
  assert.deepEqual(availableElementCombos(owner, "trap").map((combo) => combo.flag), ["shadowAmbush"]);
});

test("combo matching is pure and exposes declarative operations", () => {
  const owner = duelist([monster("fire"), monster("wind"), null]);
  const [combo] = availableElementCombos(owner);
  assert.deepEqual(owner.comboFlags, {});
  assert.deepEqual(combo.operations, [
    { op: "dealDamage", player: "rival", amount: 300 },
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 100 }
  ]);
});
