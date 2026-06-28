import test from "node:test";
import assert from "node:assert/strict";

import { FIELD_SIZE, MAX_LP } from "../src/rules.js";
import { scoreSpellForAi, validateSpellCondition } from "../src/spells.js";

function monster(overrides = {}) {
  return {
    id: "test-monster",
    name: "测试怪兽",
    type: "monster",
    element: "fire",
    atk: 1000,
    def: 800,
    mode: "attack",
    used: false,
    ...overrides
  };
}

function spell(overrides = {}) {
  return {
    id: "test-spell",
    type: "spell",
    name: "测试魔法",
    ...overrides
  };
}

function duelist(overrides = {}) {
  return {
    owner: "player",
    lp: MAX_LP,
    deck: [],
    hand: [],
    field: Array(FIELD_SIZE).fill(null),
    traps: Array(FIELD_SIZE).fill(null),
    grave: [],
    shield: 0,
    directAttacks: 0,
    ...overrides
  };
}

test("validates basic spell resource requirements", () => {
  assert.deepEqual(validateSpellCondition("heal700", { owner: duelist() }), {
    ok: false,
    reason: "生命值已满，不能发动回血魔法。"
  });
  assert.deepEqual(validateSpellCondition("heal700", { owner: duelist({ lp: 3200 }) }), { ok: true });

  assert.deepEqual(validateSpellCondition("draw2", { owner: duelist({ deck: [monster()] }) }), {
    ok: false,
    reason: "卡组不足 2 张，不能发动抽卡魔法。"
  });
  assert.deepEqual(validateSpellCondition("draw2", { owner: duelist({ deck: [monster(), monster()] }) }), { ok: true });

  assert.deepEqual(validateSpellCondition("graveReturn", { owner: duelist() }), {
    ok: false,
    reason: "墓地没有可回收的卡，不能发动星尘回收。"
  });
  assert.deepEqual(validateSpellCondition("graveReturn", { owner: duelist({ grave: [monster()] }) }), { ok: true });
});

test("validates field and hand dependent spell requirements", () => {
  assert.deepEqual(validateSpellCondition("buff500", { owner: duelist() }), {
    ok: false,
    reason: "场上没有怪兽，不能发动强化魔法。"
  });
  assert.deepEqual(validateSpellCondition("buff500", { owner: duelist({ field: [monster(), null, null] }) }), { ok: true });
  assert.deepEqual(validateSpellCondition("soulResonance", { owner: duelist() }), {
    ok: false,
    reason: "场上没有怪兽，不能发动星魂共鸣。"
  });
  assert.deepEqual(validateSpellCondition("soulResonance", { owner: duelist({ field: [monster(), null, null] }) }), { ok: true });

  assert.deepEqual(
    validateSpellCondition("extraSummon", {
      owner: duelist({ field: [monster(), monster(), monster()], hand: [spell({ effect: "extraSummon" }), monster()] }),
      handIndex: 0
    }),
    { ok: false, reason: "召唤区已满，不能发动双重召唤。" }
  );
  assert.deepEqual(
    validateSpellCondition("extraSummon", {
      owner: duelist({ hand: [spell({ effect: "extraSummon" })] }),
      handIndex: 0
    }),
    { ok: false, reason: "手牌没有可额外召唤的怪兽，不能发动双重召唤。" }
  );
  assert.deepEqual(
    validateSpellCondition("extraSummon", {
      owner: duelist({ hand: [spell({ effect: "extraSummon" }), monster()] }),
      handIndex: 0
    }),
    { ok: true }
  );
});

test("validates direct attack spell requirements", () => {
  assert.deepEqual(validateSpellCondition("directStrike", { owner: duelist(), rival: duelist({ owner: "ai", field: [monster(), null, null] }) }), {
    ok: false,
    reason: "没有可攻击怪兽，不能发动星隙穿透。"
  });

  assert.deepEqual(
    validateSpellCondition("directStrike", {
      owner: duelist({ field: [monster(), null, null] }),
      rival: duelist({ owner: "ai" })
    }),
    { ok: false, reason: "对手场上没有怪兽，不需要直击许可。" }
  );

  assert.deepEqual(
    validateSpellCondition("directStrike", {
      owner: duelist({ field: [monster(), null, null], directAttacks: 1 }),
      rival: duelist({ owner: "ai", field: [monster(), null, null] })
    }),
    { ok: false, reason: "本回合已经有直接攻击许可。" }
  );

  assert.deepEqual(
    validateSpellCondition("directStrike", {
      owner: duelist({ field: [monster(), null, null], attacksSkipped: true }),
      rival: duelist({ owner: "ai", field: [monster(), null, null] })
    }),
    { ok: false, reason: "本回合已经跳过攻击，不能再获得直接攻击许可。" }
  );

  assert.deepEqual(
    validateSpellCondition("directStrike", {
      owner: duelist({ field: [monster(), null, null] }),
      rival: duelist({ owner: "ai", field: [monster(), null, null] })
    }),
    { ok: true }
  );
});

test("validates element combo spell requirements", () => {
  assert.deepEqual(validateSpellCondition("fireWindCombo", { owner: duelist({ field: [monster({ element: "fire" }), null, null] }) }), {
    ok: false,
    reason: "需要场上同时有火属性和风属性怪兽，才能发动炎岚合击。"
  });
  assert.deepEqual(validateSpellCondition("fireWindCombo", { owner: duelist({ field: [monster({ element: "fire" }), monster({ element: "wind" }), null] }) }), { ok: true });

  assert.deepEqual(validateSpellCondition("lightShadowCombo", { owner: duelist({ field: [monster({ element: "light" }), monster({ element: "shadow" }), null] }) }), { ok: true });
});

test("validates equipment spell requirements", () => {
  assert.deepEqual(validateSpellCondition("equipBlade", { owner: duelist() }), {
    ok: false,
    reason: "场上没有怪兽，不能发动装备魔法。"
  });
  assert.deepEqual(
    validateSpellCondition("equipBlade", {
      owner: duelist({
        field: [monster(), null, null],
        traps: [spell({ effect: "shield800" }), spell({ effect: "draw2" }), spell({ effect: "burn500" })]
      })
    }),
    { ok: false, reason: "魔陷区已满，不能发动装备魔法。" }
  );
  assert.deepEqual(validateSpellCondition("equipBlade", { owner: duelist({ field: [monster(), null, null] }) }), { ok: true });
  assert.deepEqual(validateSpellCondition("equipPrism", { owner: duelist({ field: [monster(), null, null] }) }), { ok: true });
});

test("validates spell/trap removal spell requirements", () => {
  assert.deepEqual(validateSpellCondition("destroySpellTrap", {
    owner: duelist(),
    rival: duelist({ owner: "ai" })
  }), {
    ok: false,
    reason: "对手魔陷区没有可破坏的卡，不能发动解印射线。"
  });
  assert.deepEqual(validateSpellCondition("destroySpellTrap", {
    owner: duelist(),
    rival: duelist({ owner: "ai", traps: [spell({ effect: "equipBlade" }), null, null] })
  }), { ok: true });
});

test("rejects missing spell definitions", () => {
  assert.deepEqual(validateSpellCondition("missingEffect", { owner: duelist(), rival: duelist({ owner: "ai" }) }), {
    ok: false,
    reason: "这个魔法效果还没有实现。"
  });
});

test("scores AI spell priorities by style and board state", () => {
  assert.equal(scoreSpellForAi("burn500", { owner: duelist(), rival: duelist({ owner: "player", lp: 1700 }), aiStyle: "aggressive" }), 95);
  assert.equal(scoreSpellForAi("burn500", { owner: duelist(), rival: duelist({ owner: "player", lp: 1700 }), aiStyle: "balanced" }), 22);

  assert.equal(scoreSpellForAi("heal700", { owner: duelist({ lp: 3100 }), rival: duelist({ owner: "player" }), aiStyle: "control" }), 72);
  assert.equal(scoreSpellForAi("heal700", { owner: duelist({ lp: 3100 }), rival: duelist({ owner: "player" }), aiStyle: "balanced" }), 0);

  assert.equal(scoreSpellForAi("buff500", { owner: duelist(), rival: duelist({ owner: "player" }), aiStyle: "aggressive" }), 0);
  assert.equal(scoreSpellForAi("buff500", { owner: duelist({ field: [monster(), null, null] }), rival: duelist({ owner: "player" }), aiStyle: "aggressive" }), 76);
  assert.equal(scoreSpellForAi("soulResonance", { owner: duelist(), rival: duelist({ owner: "player" }), aiStyle: "balanced" }), 0);
  assert.equal(scoreSpellForAi("soulResonance", { owner: duelist({ field: [monster(), null, null] }), rival: duelist({ owner: "player" }), aiStyle: "balanced" }), 54);
});

test("scores AI direct strike and combo spells", () => {
  assert.equal(
    scoreSpellForAi("directStrike", {
      owner: duelist({ field: [monster({ atk: 1600 }), null, null] }),
      rival: duelist({ owner: "player", lp: 4000, field: [monster({ atk: 2200 }), null, null] }),
      aiStyle: "balanced"
    }),
    76
  );
  assert.equal(
    scoreSpellForAi("directStrike", {
      owner: duelist({ field: [monster({ atk: 2000 }), null, null] }),
      rival: duelist({ owner: "player", lp: 1800, field: [monster({ atk: 2200 }), null, null] }),
      aiStyle: "balanced"
    }),
    94
  );
  assert.equal(
    scoreSpellForAi("fireWindCombo", {
      owner: duelist({ field: [monster({ element: "fire" }), monster({ element: "wind" }), null] }),
      rival: duelist({ owner: "player", lp: 1000 }),
      aiStyle: "balanced"
    }),
    88
  );
  assert.equal(
    scoreSpellForAi("lightShadowCombo", {
      owner: duelist({ lp: 3600, field: [monster({ element: "light" }), monster({ element: "shadow" }), null] }),
      rival: duelist({ owner: "player" }),
      aiStyle: "control"
    }),
    82
  );
});

test("scores AI equipment spells by board state", () => {
  assert.equal(scoreSpellForAi("equipBlade", {
    owner: duelist(),
    rival: duelist({ owner: "player" }),
    aiStyle: "aggressive"
  }), 0);
  assert.equal(scoreSpellForAi("equipBlade", {
    owner: duelist({ field: [monster({ atk: 1800 }), null, null] }),
    rival: duelist({ owner: "player" }),
    aiStyle: "aggressive"
  }), 66);
  assert.equal(scoreSpellForAi("equipAegis", {
    owner: duelist({ field: [monster({ def: 1800 }), null, null] }),
    rival: duelist({ owner: "player" }),
    aiStyle: "control"
  }), 64);
});

test("scores AI spell/trap removal higher against equipment", () => {
  assert.equal(scoreSpellForAi("destroySpellTrap", {
    owner: duelist(),
    rival: duelist({ owner: "player" })
  }), 0);
  assert.equal(scoreSpellForAi("destroySpellTrap", {
    owner: duelist(),
    rival: duelist({ owner: "player", traps: [spell({ effect: "draw2" }), null, null] })
  }), 52);
  assert.equal(scoreSpellForAi("destroySpellTrap", {
    owner: duelist(),
    rival: duelist({ owner: "player", traps: [spell({ effect: "equipBlade" }), null, null] })
  }), 78);
});
