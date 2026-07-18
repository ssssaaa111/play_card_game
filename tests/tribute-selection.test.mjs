import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultTributeSelection,
  pendingTributeHandInfo,
  prepareTributeSelection,
  selectedTributeIndexes,
  toggleTributeIndex,
  tributeCost,
  tributeSelectionAction,
  validateTributeSummonSelection
} from "../src/tribute-selection.js";

function monster(uid, name = uid, tributeCostValue = 0) {
  return {
    id: uid,
    uid,
    type: "monster",
    name,
    ...(tributeCostValue > 0 ? { tributeCost: tributeCostValue } : {})
  };
}

test("normalizes tribute costs and prepares only high-level monsters", () => {
  const boss = monster("boss-1", "曜锋先锋", 1);
  const field = [monster("material-1"), null, null];

  assert.equal(tributeCost(boss), 1);
  assert.equal(tributeCost({ tributeCost: -3 }), 0);
  assert.equal(prepareTributeSelection(monster("normal-1"), 0, field).handled, false);
  assert.equal(
    prepareTributeSelection({ ...boss, type: "spell" }, 0, field).handled,
    false
  );
});

test("rejects insufficient material before creating pending selection", () => {
  const prepared = prepareTributeSelection(
    monster("boss-2", "坠星巨卫", 2),
    1,
    [monster("material-1"), null, null]
  );

  assert.deepEqual(prepared, {
    handled: true,
    ok: false,
    reason: "坠星巨卫 需要 2 只场上怪兽作为祭品。"
  });
});

test("auto-selects tributes only when every occupied monster is required", () => {
  const field = [monster("one"), null, monster("two"), null, monster("three")];

  assert.deepEqual(defaultTributeSelection(field, 3), [0, 2, 4]);
  assert.deepEqual(defaultTributeSelection(field, 2), []);
  assert.deepEqual(defaultTributeSelection(field, 0), []);

  const prepared = prepareTributeSelection(monster("god", "创星神龙", 3), 2, field);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.pending, {
    handUid: "god",
    handIndex: 2,
    cardName: "创星神龙",
    cost: 3,
    selectedIndexes: [0, 2, 4]
  });
  assert.match(prepared.prompt, /已全部选为 创星神龙 的祭品/);
});

test("resolves a pending hand card by uid after hand indexes change", () => {
  const boss = monster("boss", "曜锋先锋", 1);
  const pending = {
    handUid: boss.uid,
    handIndex: 3,
    cardName: boss.name,
    cost: 1,
    selectedIndexes: []
  };
  const info = pendingTributeHandInfo(pending, [monster("other"), boss]);

  assert.equal(info.index, 1);
  assert.equal(info.card, boss);
  assert.equal(pendingTributeHandInfo(pending, []), null);
});

test("filters stale and duplicate selections and replaces the oldest full selection", () => {
  const boss = monster("boss", "坠星巨卫", 2);
  const hand = [boss];
  const field = [monster("one"), null, monster("two"), monster("three")];
  const pending = {
    handUid: boss.uid,
    cost: 2,
    selectedIndexes: [0, 0, 1, 2, 99]
  };

  assert.deepEqual(selectedTributeIndexes(pending, field), [0, 2]);
  assert.deepEqual(
    toggleTributeIndex(pending, hand, field, 3).selectedIndexes,
    [2, 3]
  );
  assert.deepEqual(
    toggleTributeIndex({ ...pending, selectedIndexes: [0, 2] }, hand, field, 2).selectedIndexes,
    [0]
  );
  assert.match(toggleTributeIndex(pending, hand, field, 1).reason, /我方场上的怪兽/);
});

test("validates exact tribute count and a legal destination slot", () => {
  const boss = monster("boss", "坠星巨卫", 2);
  const hand = [boss];
  const field = [monster("one"), monster("blocker"), monster("two"), null, null];
  const pending = {
    handUid: boss.uid,
    cost: 2,
    selectedIndexes: [0, 2]
  };

  assert.deepEqual(
    validateTributeSummonSelection(pending, { hand, field }),
    {
      ok: true,
      expired: false,
      card: boss,
      handIndex: 0,
      pending,
      tributeIndexes: [0, 2],
      summonIndex: 0
    }
  );
  assert.equal(
    validateTributeSummonSelection(pending, { hand, field }, 3).summonIndex,
    3
  );
  assert.match(
    validateTributeSummonSelection(pending, { hand, field }, 1).reason,
    /空召唤区/
  );
  assert.equal(
    validateTributeSummonSelection({ ...pending, selectedIndexes: [0] }, { hand, field }).reason,
    "还需要选择 1 只祭品。"
  );
});

test("expires safely when the pending hand card disappears", () => {
  const pending = { handUid: "missing", cost: 1, selectedIndexes: [0] };
  const field = [monster("one")];

  assert.deepEqual(
    toggleTributeIndex(pending, [], field, 0),
    { ok: false, expired: true, reason: "祭品召唤已失效。" }
  );
  assert.deepEqual(
    validateTributeSummonSelection(pending, { hand: [], field }),
    { ok: false, expired: true, reason: "祭品召唤已失效。" }
  );
});

test("builds hand action feedback from current material availability", () => {
  const boss = monster("boss", "坠星巨卫", 2);
  const field = [monster("one"), null, monster("two")];
  const pending = { handUid: boss.uid, cost: 2, selectedIndexes: [0] };

  assert.deepEqual(
    tributeSelectionAction(boss, null, [monster("one")], { ok: true }),
    {
      ok: false,
      label: "祭品不足",
      reason: "需要 2 只场上怪兽作为祭品。"
    }
  );
  assert.deepEqual(tributeSelectionAction(boss, pending, field, { ok: true }), {
    ok: true,
    label: "祭品 1/2",
    reason: "选择 2 只我方场上怪兽后确认祭品召唤。"
  });
  assert.equal(
    tributeSelectionAction(
      boss,
      pending,
      field,
      { ok: false, label: "已召唤", reason: "本回合已经通常召唤过。" }
    ).ok,
    false
  );
  assert.equal(tributeSelectionAction(monster("normal"), null, field), null);
});
