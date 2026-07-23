import test from "node:test";
import assert from "node:assert/strict";

import { library } from "../src/data.js";
import { spellDefinitions } from "../src/spells.js";

import {
  buildTargetSelectionDisplay,
  collectLegalTargetSelections,
  isSelectedTargetSelection,
  pendingTargetForCard,
  prepareDefaultTargetSelection,
  resolveSelectedTargetSelection,
  selectTargetSelection,
  spellNeedsManualTarget,
  targetSelectionForCard,
  targetSelectionPrompt,
  validateTargetSelection
} from "../src/target-selection.js";

const effects = {
  dawnEdge: { target: "ownMonster" },
  buff500: { target: "ownMonster", targetRule: "strongest" },
  pierceLine: { target: "enemyMonster", targetRule: "strongest" },
  destroySpellTrap: { target: "enemySpellTrap" },
  graveRevive: { target: "ownGraveMonster" },
  graveReturn: { target: "ownGraveCard", targetRule: "notSource" },
  draw2: {}
};

const expectedTargetedSpellEffects = {
  aceCrackdown: "enemyMonster",
  battleTrance: "ownMonster",
  buff500: "ownMonster",
  dawnEdge: "ownMonster",
  destroySpellTrap: "enemySpellTrap",
  equipAegis: "ownMonster",
  equipBlade: "ownMonster",
  equipOverclock: "ownMonster",
  equipPrism: "ownMonster",
  graveRevive: "ownGraveMonster",
  graveReturn: "ownGraveCard",
  lastStandSurge: "ownMonster",
  lunarDominion: "enemyMonster",
  pierceLine: "enemyMonster",
  rallyAttack: "ownMonster",
  soulResonance: "ownMonster",
  splitToken: "ownMonster"
};

function monster(name, atk, extra = {}) {
  return { id: name, uid: `${name}-uid`, type: "monster", name, atk, tempAtk: 0, ...extra };
}

function duelists() {
  return {
    player: {
      owner: "player",
      field: [monster("低攻怪", 1000), monster("最高怪", 1800), null],
      traps: [{ id: "own-trap", type: "trap", name: "己方陷阱" }],
      grave: [monster("墓地怪兽", 1200), { id: "grave-spell", type: "spell", name: "墓地魔法" }]
    },
    ai: {
      owner: "ai",
      field: [monster("敌方低攻", 1400), monster("敌方最高", 2200), null],
      traps: [{ id: "enemy-equip", type: "spell", name: "敌方装备" }, null],
      grave: []
    }
  };
}

test("builds target definitions and pending hand identity from spell metadata", () => {
  const card = { id: "war-chant", uid: "war-chant-1", type: "spell", name: "战意高扬", effect: "buff500" };

  assert.deepEqual(targetSelectionForCard(card, effects), {
    effect: "buff500",
    mode: "ownMonster",
    targetRule: "strongest",
    cardName: "战意高扬",
    sourceCard: card,
    sourceOwner: "player"
  });
  assert.deepEqual(pendingTargetForCard(card, 2, effects), {
    handUid: "war-chant-1",
    handIndex: 2,
    effect: "buff500",
    mode: "ownMonster",
    targetRule: "strongest",
    cardName: "战意高扬",
    sourceCard: card,
    sourceOwner: "player"
  });
  assert.equal(spellNeedsManualTarget({ owner: "player" }, card, effects), true);
  assert.equal(spellNeedsManualTarget({ owner: "ai" }, card, effects), false);
  assert.equal(spellNeedsManualTarget({ owner: "player" }, { ...card, type: "monster" }, effects), false);
  assert.equal(targetSelectionForCard({ ...card, effect: "draw2" }, effects), null);
});

test("builds prompts directly from normalized target selection data", () => {
  assert.equal(
    targetSelectionPrompt({ mode: "ownMonster", cardName: "战意高扬", targetRule: "strongest" }),
    "请选择我方攻击力最高的怪兽作为「战意高扬」的目标。"
  );
  assert.equal(
    targetSelectionPrompt({ mode: "enemySpellTrap", cardName: "碎月解幕" }),
    "请选择敌方魔陷区的卡作为「碎月解幕」的目标。"
  );
  assert.equal(
    targetSelectionPrompt({ mode: "ownGraveCard", cardName: "星尘回收", targetRule: "notSource" }),
    "请选择我方墓地中的 1 张非本卡卡牌作为「星尘回收」的目标。"
  );
});

test("validates strongest own and enemy monster targets", () => {
  const state = duelists();
  const ownPending = targetSelectionForCard(
    { id: "war-chant", type: "spell", name: "战意高扬", effect: "buff500" },
    effects
  );
  const enemyPending = targetSelectionForCard(
    { id: "pierce-line", type: "spell", name: "破阵星芒", effect: "pierceLine" },
    effects
  );

  assert.equal(validateTargetSelection(ownPending, state, "player", 1).ok, true);
  assert.match(validateTargetSelection(ownPending, state, "player", 0).reason, /最高怪/);
  assert.match(validateTargetSelection(ownPending, state, "ai", 1).reason, /我方怪兽/);
  assert.equal(validateTargetSelection(enemyPending, state, "ai", 1).ok, true);
  assert.match(validateTargetSelection(enemyPending, state, "ai", 0).reason, /敌方最高/);
});

test("enemy spell trap selection accepts only an occupied rival support slot", () => {
  const state = duelists();
  const pending = targetSelectionForCard(
    { id: "dispelling-ray", type: "spell", name: "解印射线", effect: "destroySpellTrap" },
    effects
  );
  const valid = validateTargetSelection(pending, state, "ai", 0, "traps");

  assert.equal(valid.ok, true);
  assert.equal(valid.owner, "ai");
  assert.equal(valid.zone, "traps");
  assert.equal(valid.card.name, "敌方装备");
  assert.match(validateTargetSelection(pending, state, "player", 0, "traps").reason, /敌方魔陷区/);
  assert.match(validateTargetSelection(pending, state, "ai", 1, "traps").reason, /请选择敌方魔陷区/);
});

test("grave target selection accepts only own graveyard monsters", () => {
  const state = duelists();
  const pending = targetSelectionForCard(
    { id: "grave-return", type: "spell", name: "醒星回召", effect: "graveRevive" },
    effects
  );
  const beforeInvalidSelection = structuredClone(state);

  assert.equal(validateTargetSelection(pending, state, "player", 0, "grave").ok, true);
  assert.equal(
    validateTargetSelection(pending, state, "player", 1, "grave").reason,
    "不能选择该卡：不是怪兽。"
  );
  assert.equal(
    validateTargetSelection(pending, state, "player", 9, "grave").reason,
    "不能选择该卡：目标不在墓地。"
  );
  assert.match(validateTargetSelection(pending, state, "ai", 0, "grave").reason, /我方墓地/);
  assert.deepEqual(state, beforeInvalidSelection);
});

test("grave card selection accepts every own graveyard card but never another zone", () => {
  const state = duelists();
  const pending = targetSelectionForCard(
    { id: "grave-return", uid: "grave-return-1", type: "spell", name: "星尘回收", effect: "graveReturn" },
    effects
  );
  const prepared = prepareDefaultTargetSelection(pending, state);

  assert.deepEqual(
    collectLegalTargetSelections(prepared, state).map((target) => target.card.name),
    ["墓地怪兽", "墓地魔法"]
  );
  assert.equal(resolveSelectedTargetSelection(prepared, state), null);
  assert.equal(validateTargetSelection(pending, state, "player", 0, "grave").ok, true);
  assert.equal(validateTargetSelection(pending, state, "player", 1, "grave").ok, true);
  assert.match(validateTargetSelection(pending, state, "player", 0, "field").reason, /我方墓地/);
  assert.match(validateTargetSelection(pending, state, "ai", 0, "grave").reason, /我方墓地/);
});

test("legal target collection is deterministic and respects target resistance", () => {
  const state = duelists();
  state.ai.field = [
    monster("创星神龙", 4000, { targetResistance: { type: "divineTarget" } }),
    monster("坠星巨卫", 3200)
  ];
  const source = { id: "pierce-line", type: "spell", name: "破阵星芒", effect: "pierceLine" };
  const pending = targetSelectionForCard(source, effects);

  assert.deepEqual(
    collectLegalTargetSelections(pending, state).map((target) => target.card.name),
    ["坠星巨卫"]
  );

  const bypassPending = targetSelectionForCard(
    { ...source, targetResistanceBypass: "divineTarget" },
    effects
  );
  assert.deepEqual(
    collectLegalTargetSelections(bypassPending, state).map((target) => target.card.name),
    ["创星神龙"]
  );
});

test("missing selections and invalid owners fail without reading a zone", () => {
  assert.deepEqual(
    validateTargetSelection(null, duelists(), "player", 0),
    { ok: false, reason: "当前没有需要选择目标的效果。" }
  );
  assert.match(
    validateTargetSelection({ mode: "ownMonster" }, duelists(), "spectator", 0).reason,
    /有效的目标区域/
  );
});

test("every targeted spell definition uses a supported zone and defaults only unique legal targets", () => {
  const actualModes = Object.fromEntries(
    Object.entries(spellDefinitions)
      .filter(([, definition]) => Boolean(definition.target))
      .map(([effect, definition]) => [effect, definition.target])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  assert.deepEqual(actualModes, expectedTargetedSpellEffects);

  const state = duelists();
  const cards = library.filter((card) => card.type === "spell" && expectedTargetedSpellEffects[card.effect]);
  assert.ok(cards.length >= Object.keys(expectedTargetedSpellEffects).length);
  cards.forEach((card, handIndex) => {
    const pending = prepareDefaultTargetSelection(pendingTargetForCard(
      { ...card, uid: `${card.id}-audit-${handIndex}` },
      handIndex,
      spellDefinitions
    ), state);
    const selected = resolveSelectedTargetSelection(pending, state);
    const legalTargets = collectLegalTargetSelections(pending, state);
    assert.equal(pending.mode, expectedTargetedSpellEffects[card.effect]);
    if (legalTargets.length === 1) {
      assert.ok(selected, `${card.name} should select its only legal target`);
      assert.equal(pending.selectedTargetSource, "default");
    } else {
      assert.ok(legalTargets.length > 1, `${card.name} should expose multiple legal targets`);
      assert.equal(selected, null);
      assert.equal(pending.selectedTargetSource, undefined);
    }
  });
});

test("target windows default to the only legal target and expose that selection", () => {
  const state = duelists();
  const pending = targetSelectionForCard(
    { id: "war-chant", uid: "war-chant-1", type: "spell", name: "战意高扬", effect: "buff500" },
    effects
  );
  const prepared = prepareDefaultTargetSelection(pending, state);
  const selected = resolveSelectedTargetSelection(prepared, state);
  const display = buildTargetSelectionDisplay(prepared, state);

  assert.equal(selected.card.name, "最高怪");
  assert.equal(prepared.selectedTargetSource, "default");
  assert.equal(isSelectedTargetSelection(prepared, "player", 1), true);
  assert.equal(display.complete, true);
  assert.equal(display.selectedByDefault, true);
  assert.match(display.text, /已默认选择：最高怪（我方怪兽区 2）/);
  assert.equal(display.confirmLabel, "确认发动");
});

test("target windows stay unselected when more than one legal target exists", () => {
  const state = duelists();
  const pending = targetSelectionForCard(
    { id: "dawn-edge", uid: "dawn-edge-multi", type: "spell", name: "破晓锋印", effect: "dawnEdge" },
    effects
  );
  const prepared = prepareDefaultTargetSelection(pending, state);
  const display = buildTargetSelectionDisplay(prepared, state);

  assert.equal(collectLegalTargetSelections(prepared, state).length, 2);
  assert.equal(resolveSelectedTargetSelection(prepared, state), null);
  assert.equal(prepared.selectedTarget, undefined);
  assert.equal(prepared.selectedTargetSource, undefined);
  assert.equal(display.complete, false);
  assert.equal(display.legalCount, 2);
  assert.equal(display.confirmLabel, "请选择目标");
  assert.match(display.text, /尚未选择目标/);
});

test("unique target preparation covers every supported target zone", () => {
  const cases = [
    {
      card: { id: "dawn-edge", uid: "dawn-edge-zone", type: "spell", name: "破晓锋印", effect: "dawnEdge" },
      expected: { owner: "player", zone: "field", index: 0, name: "低攻怪" }
    },
    {
      card: { id: "pierce-line", uid: "pierce-zone", type: "spell", name: "破阵星芒", effect: "pierceLine" },
      expected: { owner: "ai", zone: "field", index: 1, name: "敌方最高" }
    },
    {
      card: { id: "dispelling-ray", uid: "ray-zone", type: "spell", name: "解印射线", effect: "destroySpellTrap" },
      expected: { owner: "ai", zone: "traps", index: 0, name: "敌方装备" }
    },
    {
      card: { id: "grave-return", uid: "revive-zone", type: "spell", name: "醒星回召", effect: "graveRevive" },
      expected: { owner: "player", zone: "grave", index: 0, name: "墓地怪兽" }
    },
    {
      card: { id: "material-reclaim", uid: "return-zone", type: "spell", name: "星屑返轨", effect: "graveReturn" },
      expected: { owner: "player", zone: "grave", index: 0, name: "墓地怪兽" },
      uniqueGraveCard: true
    }
  ];

  cases.forEach(({ card, expected, uniqueGraveCard = false }) => {
    const caseState = duelists();
    if (card.effect === "dawnEdge") caseState.player.field[1] = null;
    if (uniqueGraveCard) caseState.player.grave.splice(1);
    const prepared = prepareDefaultTargetSelection(targetSelectionForCard(card, effects), caseState);
    const selected = resolveSelectedTargetSelection(prepared, caseState);
    assert.deepEqual(
      { owner: selected.owner, zone: selected.zone, index: selected.index, name: selected.card.name },
      expected
    );
    assert.equal(prepared.selectedTargetSource, "default");
  });
});

test("clicking another legal target changes selection without resolving the spell", () => {
  const state = duelists();
  const pending = prepareDefaultTargetSelection(targetSelectionForCard(
    { id: "dawn-edge", uid: "dawn-edge-1", type: "spell", name: "破晓锋印", effect: "dawnEdge" },
    effects
  ), state);
  const otherTarget = validateTargetSelection(pending, state, "player", 1);
  const changed = selectTargetSelection(pending, otherTarget, { source: "player" });
  const display = buildTargetSelectionDisplay(changed, state);

  assert.equal(resolveSelectedTargetSelection(pending, state), null);
  assert.equal(resolveSelectedTargetSelection(changed, state).card.name, "最高怪");
  assert.equal(changed.selectedTargetSource, "player");
  assert.match(display.text, /已选择：最高怪（我方怪兽区 2）/);
  assert.doesNotMatch(display.text, /已默认选择/);
});

test("stale selected targets are rejected instead of silently targeting a replacement", () => {
  const state = duelists();
  const pending = prepareDefaultTargetSelection(targetSelectionForCard(
    { id: "war-chant", uid: "war-chant-stale", type: "spell", name: "战意高扬", effect: "buff500" },
    effects
  ), state);
  state.player.field[1] = monster("替补怪兽", 900);

  assert.equal(resolveSelectedTargetSelection(pending, state), null);
  const refreshed = prepareDefaultTargetSelection(pending, state);
  assert.equal(resolveSelectedTargetSelection(refreshed, state).card.name, "低攻怪");
  assert.equal(refreshed.selectedTargetSource, "default");
});

test("selected concealed enemy support targets never expose their card name", () => {
  const state = duelists();
  state.ai.traps[0] = { id: "mirror-snare", uid: "hidden-trap-1", type: "trap", name: "镜光反制" };
  const pending = prepareDefaultTargetSelection(targetSelectionForCard(
    { id: "dispelling-ray", uid: "ray-1", type: "spell", name: "解印射线", effect: "destroySpellTrap" },
    effects
  ), state);
  const display = buildTargetSelectionDisplay(pending, state);

  assert.match(display.text, /盖放卡牌（敌方魔陷区 1）/);
  assert.doesNotMatch(display.text, /镜光反制/);
});
