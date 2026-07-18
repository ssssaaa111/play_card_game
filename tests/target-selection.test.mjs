import test from "node:test";
import assert from "node:assert/strict";

import {
  collectLegalTargetSelections,
  pendingTargetForCard,
  spellNeedsManualTarget,
  targetSelectionForCard,
  targetSelectionPrompt,
  validateTargetSelection
} from "../src/target-selection.js";

const effects = {
  buff500: { target: "ownMonster", targetRule: "strongest" },
  pierceLine: { target: "enemyMonster", targetRule: "strongest" },
  destroySpellTrap: { target: "enemySpellTrap" },
  graveRevive: { target: "ownGraveMonster" },
  draw2: {}
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

  assert.equal(validateTargetSelection(pending, state, "player", 0, "grave").ok, true);
  assert.match(validateTargetSelection(pending, state, "player", 1, "grave").reason, /墓地中的怪兽/);
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
