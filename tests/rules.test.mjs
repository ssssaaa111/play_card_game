import test from "node:test";
import assert from "node:assert/strict";

import {
  FIELD_SIZE,
  MAX_LP,
  MONSTER_ZONE_SIZE,
  SPELL_TRAP_ZONE_SIZE,
  battlePreviewText,
  battleValue,
  canEffectTargetCard,
  canDirectAttack,
  elementLabel,
  fieldCards,
  fieldElements,
  legalAttackTargets,
  makeAttackIntentPreview,
  makeBattlePreview,
  shieldPreview,
  spellTargetPrompt,
  strongestMonster,
  totalAtk,
  totalDef,
  validateAttackTarget,
  validateSpellTargetRule,
  weakestMonster
} from "../src/rules.js";

function monster(overrides = {}) {
  return {
    id: "test-monster",
    name: "测试怪兽",
    type: "monster",
    element: "fire",
    atk: 1000,
    def: 800,
    tempAtk: 0,
    tempDef: 0,
    mode: "attack",
    ...overrides
  };
}

function duelist(overrides = {}) {
  return {
    owner: "player",
    field: Array(FIELD_SIZE).fill(null),
    directAttacks: 0,
    ...overrides
  };
}

test("exports core rule constants", () => {
  assert.equal(MAX_LP, 4000);
  assert.equal(MONSTER_ZONE_SIZE, 5);
  assert.equal(SPELL_TRAP_ZONE_SIZE, 5);
  assert.equal(FIELD_SIZE, MONSTER_ZONE_SIZE);
});

test("calculates current battle values from card state", () => {
  const card = monster({ atk: 1200, def: 900, tempAtk: 500, tempDef: -200 });

  assert.equal(totalAtk(card), 1700);
  assert.equal(totalDef(card), 700);
  assert.equal(battleValue(card), 1700);

  card.mode = "defense";
  assert.equal(battleValue(card), 700);
});

test("reads field cards and elements without empty slots", () => {
  const owner = duelist({
    field: [
      monster({ name: "火怪", element: "fire" }),
      null,
      monster({ name: "光怪", element: "light" })
    ]
  });

  assert.deepEqual(fieldCards(owner).map((card) => card.name), ["火怪", "光怪"]);
  assert.deepEqual([...fieldElements(owner)].sort(), ["fire", "light"]);
  assert.equal(elementLabel("fire"), "火");
  assert.equal(elementLabel("shadow"), "暗");
});

test("finds strongest and weakest monsters by current attack", () => {
  const owner = duelist({
    field: [
      monster({ name: "A", atk: 900, tempAtk: 500 }),
      monster({ name: "B", atk: 1700 }),
      monster({ name: "C", atk: 600 })
    ]
  });

  assert.equal(strongestMonster(owner).name, "B");
  assert.equal(weakestMonster(owner).name, "C");
});

test("blocks direct attacks while rival monsters exist unless permission is granted", () => {
  const owner = duelist();
  const rival = duelist({
    owner: "ai",
    field: [monster({ name: "守门怪" }), null, null]
  });
  const attacker = monster({ name: "攻击怪" });

  assert.equal(canDirectAttack(owner, attacker), false);
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, -1), {
    ok: false,
    reason: "对手场上还有怪兽，必须先攻击怪兽；除非卡牌效果允许直接攻击。"
  });

  owner.directAttacks = 1;
  assert.equal(canDirectAttack(owner, attacker), true);
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, -1), { ok: true, direct: true });

  owner.directAttacks = 0;
  attacker.canDirectAttack = true;
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, -1), { ok: true, direct: true });
});

test("allows attacking rival monsters and direct attacks into empty boards", () => {
  const owner = duelist();
  const rival = duelist({
    owner: "ai",
    field: [monster({ name: "守门怪" }), null, null]
  });
  const attacker = monster({ name: "攻击怪" });

  assert.deepEqual(validateAttackTarget(owner, rival, attacker, 0), { ok: true, direct: false });
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, 1), {
    ok: false,
    reason: "这个召唤区没有怪兽，不能攻击空位。"
  });

  rival.field[0] = null;
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, 0), {
    ok: false,
    reason: "这个召唤区没有怪兽，不能攻击空位。"
  });
  assert.deepEqual(validateAttackTarget(owner, rival, attacker, -1), { ok: true, direct: true });
});

test("finds legal attack targets for quick attack shortcuts", () => {
  const owner = duelist();
  const attacker = monster({ name: "攻击怪" });

  assert.deepEqual(
    legalAttackTargets(owner, duelist({ owner: "ai", field: [monster({ name: "守门怪" }), null, null] }), attacker).map((target) => target.targetIndex),
    [0]
  );
  assert.deepEqual(
    legalAttackTargets(owner, duelist({ owner: "ai", field: [null, null, null] }), attacker).map((target) => target.targetIndex),
    [-1]
  );
  owner.directAttacks = 1;
  assert.deepEqual(
    legalAttackTargets(owner, duelist({ owner: "ai", field: [monster({ name: "守门怪" }), null, null] }), attacker).map((target) => target.targetIndex),
    [0, -1]
  );
  assert.deepEqual(legalAttackTargets(owner, duelist({ owner: "ai", field: [monster({ name: "守门怪" }), null, null] }), monster({ used: true })), []);
  assert.deepEqual(legalAttackTargets(owner, duelist({ owner: "ai", field: [monster({ name: "守门怪" }), null, null] }), monster({ mode: "defense" })), []);
});

test("describes battle preview outcomes", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const weakTarget = monster({ name: "铁壁守卫", atk: 900 });
  const strongTarget = monster({ name: "熔核巨像", atk: 2200 });
  const defenseTarget = monster({ name: "守备者", mode: "defense", def: 1200 });
  const strongDefenseTarget = monster({ name: "铁壁守卫", mode: "defense", def: 2100 });
  const equalDefenseTarget = monster({ name: "同防守卫", mode: "defense", def: 1800 });

  assert.match(battlePreviewText(attacker, null), /直接攻击.*1800/);
  assert.match(battlePreviewText(attacker, weakTarget), /预计造成 900/);
  assert.match(battlePreviewText(attacker, strongTarget), /攻击方预计承受 400/);
  assert.match(battlePreviewText(attacker, defenseTarget), /可击破但不造成战斗伤害/);
  assert.match(battlePreviewText(attacker, strongDefenseTarget), /双方怪兽保留/);
  assert.match(battlePreviewText(attacker, equalDefenseTarget), /守备怪兽挡下攻击/);
});

test("builds structured battle previews with shield math", () => {
  const attacker = monster({ name: "星轨枪兵", atk: 1800 });
  const target = monster({ name: "铁壁守卫", atk: 900 });

  assert.deepEqual(shieldPreview(900, 400), {
    shieldPierced: 0,
    blocked: 400,
    shieldAfter: 0,
    finalDamage: 500,
    text: "护盾预计吸收 400 点，最终生命值伤害 500。"
  });

  assert.deepEqual(shieldPreview(900, 800, { shieldPierce: { type: "divinePressure", amount: 500 } }), {
    shieldPierced: 500,
    blocked: 300,
    shieldAfter: 0,
    finalDamage: 600,
    text: "神格威压先消解 500 点护盾，护盾预计吸收 300 点，最终生命值伤害 600。"
  });

  const preview = makeBattlePreview(attacker, target, duelist(), duelist({ shield: 400 }));
  assert.equal(preview.badge, "优势");
  assert.equal(preview.mode, "target");
  assert.equal(preview.tone, "advantage");
  assert.deepEqual(preview.compare, {
    attackerLabel: "我方 ATK",
    attackerValue: 1800,
    targetLabel: "目标 攻击",
    targetValue: 900,
    diff: 900
  });
  assert.equal(preview.rows.at(-1).value, "吸收 400 / 实伤 500");
  assert.match(preview.result, /最终生命值伤害 500/);

  const directPreview = makeBattlePreview(attacker, null, duelist(), duelist({ shield: 2000 }));
  assert.equal(directPreview.badge, "直击");
  assert.equal(directPreview.mode, "direct");
  assert.match(directPreview.rows.at(-1).value, /最终生命值伤害 0/);

  const divinePreview = makeBattlePreview(
    monster({ name: "创星神龙", atk: 4000, shieldPierce: { type: "divinePressure", amount: 500 } }),
    null,
    duelist(),
    duelist({ shield: 800 })
  );
  assert.equal(divinePreview.rows.at(-1).value, "神格威压先消解 500 点护盾，护盾预计吸收 300 点，最终生命值伤害 3700。");

  const guardPreview = makeBattlePreview(
    attacker,
    monster({ name: "铁壁守卫", mode: "defense", def: 2100 }),
    duelist({ shield: 100 }),
    duelist()
  );
  assert.equal(guardPreview.badge, "守备反击");
  assert.equal(guardPreview.tone, "guard");
  assert.match(guardPreview.result, /双方怪兽保留/);

  const guardHoldPreview = makeBattlePreview(attacker, monster({ name: "同防守卫", mode: "defense", def: 1800 }), duelist(), duelist());
  assert.equal(guardHoldPreview.badge, "防御");
  assert.match(guardHoldPreview.result, /挡下攻击/);
});

test("builds attack intent previews before a target is chosen", () => {
  const preview = makeAttackIntentPreview(monster({ name: "星轨枪兵", atk: 1800 }), {
    targetCount: 2,
    canDirectAttack: true
  });

  assert.equal(preview.mode, "intent");
  assert.equal(preview.badge, "攻击就绪");
  assert.equal(preview.tone, "intent");
  assert.equal(preview.rows[0].value, "星轨枪兵 / 攻击 1800");
  assert.equal(preview.rows[1].value, "2 个怪兽 / 对方玩家");
  assert.match(preview.result, /准确结算/);
});

test("builds spell target prompts from target mode and rule", () => {
  assert.equal(
    spellTargetPrompt("ownMonster", "战意高扬", "strongest"),
    "请选择我方攻击力最高的怪兽作为「战意高扬」的目标。"
  );
  assert.equal(
    spellTargetPrompt("enemyMonster", "破阵星芒"),
    "请选择敌方怪兽作为「破阵星芒」的目标。"
  );
  assert.equal(
    spellTargetPrompt("ownGraveMonster", "醒星回召"),
    "请选择我方墓地中的怪兽作为「醒星回召」的目标。"
  );
});

test("validates strongest-only spell target rules", () => {
  const owner = duelist({
    field: [
      monster({ name: "低攻怪", atk: 1000 }),
      monster({ name: "最高怪A", atk: 1800 }),
      monster({ name: "最高怪B", atk: 1500, tempAtk: 300 })
    ]
  });
  const pending = {
    cardName: "战意高扬",
    mode: "ownMonster",
    targetRule: "strongest"
  };

  assert.deepEqual(validateSpellTargetRule(pending, owner, owner.field[1]), { ok: true });
  assert.deepEqual(validateSpellTargetRule(pending, owner, owner.field[2]), { ok: true });
  assert.equal(validateSpellTargetRule(pending, owner, owner.field[0]).ok, false);
  assert.match(validateSpellTargetRule(pending, owner, owner.field[0]).reason, /最高怪A、最高怪B/);
});

test("target resistance excludes opponent cards from strongest target rules", () => {
  const source = { id: "pierce-line", type: "spell", name: "破阵星芒" };
  const divine = monster({ name: "创星神龙", atk: 4000, targetResistance: { type: "divineTarget" } });
  const colossus = monster({ name: "坠星巨卫", atk: 3200 });
  const rival = duelist({
    owner: "ai",
    field: [divine, colossus, null, null, null]
  });
  const pending = {
    cardName: "破阵星芒",
    mode: "enemyMonster",
    targetRule: "strongest",
    sourceCard: source,
    sourceOwner: "player"
  };

  assert.equal(canEffectTargetCard(source, divine, { sourceOwner: "player", targetOwner: "ai" }), false);
  assert.deepEqual(validateSpellTargetRule(pending, rival, colossus), { ok: true });
  assert.equal(validateSpellTargetRule(pending, rival, divine).ok, false);
  assert.match(validateSpellTargetRule(pending, rival, divine).reason, /神格目标抗性/);
});

test("target resistance allows same-owner effects and explicit bypass", () => {
  const source = { id: "war-chant", type: "spell", name: "战意高扬" };
  const bypass = { id: "divine-break", type: "spell", name: "破神术", targetResistanceBypass: "divineTarget" };
  const divine = monster({ name: "创星神龙", atk: 4000, targetResistance: { type: "divineTarget" } });

  assert.equal(canEffectTargetCard(source, divine, { sourceOwner: "player", targetOwner: "player" }), true);
  assert.equal(canEffectTargetCard(bypass, divine, { sourceOwner: "player", targetOwner: "ai" }), true);
});
