import { MAX_LP, battleValue, fieldCards, fieldElements, shieldPreview, totalAtk } from './rules.js';
import { describeBattleOutcome } from './battle.js';
import { fusionOptionsForCard } from './fusion.js';
import { getCardEffectDefinition } from './game-engine.js';
import { trapCanResolve } from './traps.js';

function guaranteedAfterAttackDamage(attacker) {
  const definition = getCardEffectDefinition(attacker?.afterAttack);
  if (!definition || (definition.requirements?.length || 0) > 0) return [];
  return (definition.operations || [])
    .filter((operation) => operation.op === "dealDamage" && operation.player === "rival")
    .map((operation) => Math.max(0, Number(operation.amount) || 0))
    .filter((amount) => amount > 0);
}

function previewDamageSequence(attacker, amounts, shield = 0) {
  let remainingShield = Math.max(0, Number(shield) || 0);
  let finalDamage = 0;
  for (const amount of amounts) {
    const preview = shieldPreview(amount, remainingShield, attacker);
    finalDamage += preview.finalDamage;
    remainingShield = preview.shieldAfter;
  }
  return { finalDamage, shieldAfter: remainingShield };
}

export function previewAiDirectDamage(attacker, shield = 0) {
  return previewDamageSequence(
    attacker,
    [totalAtk(attacker), ...guaranteedAfterAttackDamage(attacker)],
    shield
  ).finalDamage;
}

function previewTargetAttackDamage(attacker, target, shield) {
  const outcome = describeBattleOutcome(attacker, target);
  if (!outcome?.destroysTarget) return null;
  const amounts = [outcome.rawDamage];
  if (!outcome.destroysAttacker) amounts.push(...guaranteedAfterAttackDamage(attacker));
  return {
    ...previewDamageSequence(attacker, amounts, shield),
    destroysAttacker: Boolean(outcome.destroysAttacker)
  };
}

export function maximumRemainingAttackDamage(attackers, targets, shield, directAttacks) {
  const memo = new Map();
  const allAttackers = (1 << attackers.length) - 1;
  const allTargets = (1 << targets.length) - 1;

  function search(attackerMask, targetMask, remainingShield, remainingDirectAttacks) {
    if (attackerMask === 0) return 0;
    const key = `${attackerMask}:${targetMask}:${remainingShield}:${remainingDirectAttacks}`;
    if (memo.has(key)) return memo.get(key);
    let best = 0;

    for (let attackerIndex = 0; attackerIndex < attackers.length; attackerIndex += 1) {
      const attackerBit = 1 << attackerIndex;
      if ((attackerMask & attackerBit) === 0) continue;
      const attacker = attackers[attackerIndex];
      const nextAttackers = attackerMask & ~attackerBit;
      best = Math.max(best, search(nextAttackers, targetMask, remainingShield, remainingDirectAttacks));

      const naturalDirect = targetMask === 0 || Boolean(attacker?.canDirectAttack);
      if (naturalDirect || remainingDirectAttacks > 0) {
        const direct = previewDamageSequence(
          attacker,
          [totalAtk(attacker), ...guaranteedAfterAttackDamage(attacker)],
          remainingShield
        );
        const directCost = naturalDirect ? 0 : 1;
        best = Math.max(
          best,
          direct.finalDamage + search(
            nextAttackers,
            targetMask,
            direct.shieldAfter,
            remainingDirectAttacks - directCost
          )
        );
      }

      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        const targetBit = 1 << targetIndex;
        if ((targetMask & targetBit) === 0) continue;
        const attack = previewTargetAttackDamage(attacker, targets[targetIndex], remainingShield);
        if (!attack) continue;
        best = Math.max(
          best,
          attack.finalDamage + search(
            nextAttackers,
            targetMask & ~targetBit,
            attack.shieldAfter,
            remainingDirectAttacks
          )
        );
      }
    }

    memo.set(key, best);
    return best;
  }

  return search(
    allAttackers,
    allTargets,
    Math.max(0, Number(shield) || 0),
    Math.max(0, Number(directAttacks) || 0)
  );
}

export function findAiAttackSequence({
  attackers = [],
  targets = [],
  shield = 0,
  directAttacks = 0,
  attackUses = [],
  damageGoal = null
} = {}) {
  const activeAttackers = attackers.filter(Boolean);
  const activeTargets = targets.filter(Boolean);
  if (!activeAttackers.length) return { moves: [], damage: 0 };
  const memo = new Map();
  const allTargets = (1 << activeTargets.length) - 1;
  const initialDamageGoal = damageGoal !== null && damageGoal !== undefined && Number.isFinite(Number(damageGoal))
    ? Math.max(0, Number(damageGoal))
    : null;
  const initialUses = activeAttackers.map((card, index) => {
    const requested = Number(attackUses[index]);
    return Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 1;
  });

  function preferCandidate(candidate, best, remainingDamageGoal) {
    if (remainingDamageGoal !== null) {
      const candidateCompletes = candidate.damage >= remainingDamageGoal;
      const bestCompletes = best.damage >= remainingDamageGoal;
      if (candidateCompletes !== bestCompletes) return candidateCompletes;
      if (candidateCompletes) {
        const candidateExcess = candidate.damage - remainingDamageGoal;
        const bestExcess = best.damage - remainingDamageGoal;
        if (candidateExcess !== bestExcess) return candidateExcess < bestExcess;
        if (candidate.moves.length !== best.moves.length) return candidate.moves.length < best.moves.length;
      }
    }
    return candidate.damage > best.damage;
  }

  function search(remainingUses, targetMask, remainingShield, remainingDirectAttacks, remainingDamageGoal) {
    if (remainingDamageGoal === 0 || !remainingUses.some((uses) => uses > 0)) {
      return { damage: 0, moves: [] };
    }
    const key = `${remainingUses.join(",")}:${targetMask}:${remainingShield}:${remainingDirectAttacks}:${remainingDamageGoal ?? "max"}`;
    if (memo.has(key)) return memo.get(key);
    let best = { damage: 0, moves: [] };

    for (let attackerIndex = 0; attackerIndex < activeAttackers.length; attackerIndex += 1) {
      if (remainingUses[attackerIndex] <= 0) continue;
      const attacker = activeAttackers[attackerIndex];
      const skippedUses = [...remainingUses];
      skippedUses[attackerIndex] = 0;
      const skip = search(skippedUses, targetMask, remainingShield, remainingDirectAttacks, remainingDamageGoal);
      if (preferCandidate(skip, best, remainingDamageGoal)) best = skip;

      const nextUses = [...remainingUses];
      nextUses[attackerIndex] -= 1;

      const naturalDirect = targetMask === 0 || Boolean(attacker?.canDirectAttack);
      if (naturalDirect || remainingDirectAttacks > 0) {
        const direct = previewDamageSequence(
          attacker,
          [totalAtk(attacker), ...guaranteedAfterAttackDamage(attacker)],
          remainingShield
        );
        const directCost = naturalDirect ? 0 : 1;
        const follow = search(
          nextUses,
          targetMask,
          direct.shieldAfter,
          remainingDirectAttacks - directCost,
          remainingDamageGoal === null ? null : Math.max(0, remainingDamageGoal - direct.finalDamage)
        );
        const candidate = {
          damage: direct.finalDamage + follow.damage,
          moves: [{ attackerIndex, targetIndex: -1 }, ...follow.moves]
        };
        if (preferCandidate(candidate, best, remainingDamageGoal)) best = candidate;
      }

      for (let targetIndex = 0; targetIndex < activeTargets.length; targetIndex += 1) {
        const targetBit = 1 << targetIndex;
        if ((targetMask & targetBit) === 0) continue;
        const attack = previewTargetAttackDamage(attacker, activeTargets[targetIndex], remainingShield);
        if (!attack) continue;
        const followUses = [...nextUses];
        if (attack.destroysAttacker) followUses[attackerIndex] = 0;
        const follow = search(
          followUses,
          targetMask & ~targetBit,
          attack.shieldAfter,
          remainingDirectAttacks,
          remainingDamageGoal === null ? null : Math.max(0, remainingDamageGoal - attack.finalDamage)
        );
        const candidate = {
          damage: attack.finalDamage + follow.damage,
          moves: [{ attackerIndex, targetIndex }, ...follow.moves]
        };
        if (preferCandidate(candidate, best, remainingDamageGoal)) best = candidate;
      }
    }

    memo.set(key, best);
    return best;
  }

  const result = search(
    initialUses,
    allTargets,
    Math.max(0, Number(shield) || 0),
    Math.max(0, Number(directAttacks) || 0),
    initialDamageGoal
  );
  return { moves: result.moves, damage: result.damage };
}

export function findAiNextTurnLethalSetup({
  attackers = [],
  targets = [],
  shield = 0,
  directAttacks = 0,
  rivalLp = 0
} = {}) {
  const activeAttackers = attackers.filter(Boolean).map((card, index) => ({ card, index }));
  const activeTargets = targets.filter(Boolean).map((card, index) => ({ card, index }));
  if (!activeAttackers.length || rivalLp <= 0) return null;
  const initialShield = Math.max(0, Number(shield) || 0);
  const initialDirects = Math.max(0, Number(directAttacks) || 0);

  let best = null;
  for (const { card: attacker, index: attackerIndex } of activeAttackers) {
    const remainingAttackers = activeAttackers
      .filter((entry) => entry.index !== attackerIndex)
      .map((entry) => entry.card);
    const remainingTargets = activeTargets.map((entry) => entry.card);

    const naturalDirect = remainingTargets.length === 0 || Boolean(attacker?.canDirectAttack);
    const canDirectFirst = (naturalDirect || initialDirects > 0) && initialShield <= 0;
    if (canDirectFirst) {
      const direct = previewDamageSequence(
        attacker,
        [totalAtk(attacker), ...guaranteedAfterAttackDamage(attacker)],
        initialShield
      );
      const nextTurnMax = maximumRemainingAttackDamage(
        [...remainingAttackers, attacker],
        remainingTargets,
        direct.shieldAfter,
        0
      );
      const total = direct.finalDamage + nextTurnMax;
      if (total >= rivalLp && (!best || total > best.total)) {
        best = {
          attackerIndex,
          targetIndex: -1,
          target: null,
          total,
          firstDamage: direct.finalDamage
        };
      }
    }

    for (let targetPosition = 0; targetPosition < activeTargets.length; targetPosition += 1) {
      const { card: target, index: targetIndex } = activeTargets[targetPosition];
      const attack = previewTargetAttackDamage(attacker, target, initialShield);
      if (!attack) continue;
      const restTargets = activeTargets
        .filter((entry) => entry.index !== targetIndex)
        .map((entry) => entry.card);
      const nextTurnAttackers = attack.destroysAttacker
        ? remainingAttackers
        : [...remainingAttackers, attacker];
      const nextTurnMax = maximumRemainingAttackDamage(
        nextTurnAttackers,
        restTargets,
        attack.shieldAfter,
        0
      );
      const total = attack.finalDamage + nextTurnMax;
      if (total >= rivalLp && (!best || total > best.total)) {
        best = {
          attackerIndex,
          targetIndex,
          target,
          total,
          firstDamage: attack.finalDamage
        };
      }
    }
  }
  return best;
}

export function findAiDirectLethalAttacker({
  attackers = [],
  targets = [],
  rivalLp = 0,
  shield = 0,
  directAttacks = 0
} = {}) {
  const activeAttackers = attackers.filter(Boolean);
  const activeTargets = targets.filter(Boolean);
  if (!activeAttackers.length || !activeTargets.length || rivalLp <= 0) return null;

  for (let attackerIndex = 0; attackerIndex < activeAttackers.length; attackerIndex += 1) {
    const attacker = activeAttackers[attackerIndex];
    const usesPermission = !attacker.canDirectAttack;
    if (usesPermission && directAttacks <= 0) continue;
    const direct = previewDamageSequence(
      attacker,
      [totalAtk(attacker), ...guaranteedAfterAttackDamage(attacker)],
      shield
    );
    const remainingAttackers = activeAttackers.filter((_card, index) => index !== attackerIndex);
    const followUpDamage = maximumRemainingAttackDamage(
      remainingAttackers,
      activeTargets,
      direct.shieldAfter,
      Math.max(0, Number(directAttacks) || 0) - Number(usesPermission)
    );
    if (direct.finalDamage + followUpDamage >= rivalLp) {
      return { attacker, attackerIndex, damage: direct.finalDamage + followUpDamage };
    }
  }
  return null;
}

export const spellDefinitions = {
  burn500: {
    handSummary: "对方 LP -500",
    caption: "爆裂伤害"
  },
  heal700: {
    handSummary: "回复 700 LP",
    caption: "生命回复"
  },
  draw2: {
    handSummary: "抽牌 ×2",
    caption: "预见未来，抽两张卡"
  },
  comebackDraw: {
    handSummary: "抽牌 ×2 · 卡组需 2 张",
    caption: "余烬续抽，补足反击资源"
  },
  graveRevive: {
    handSummary: "墓地怪兽特殊召唤",
    caption: "醒星回召，墓地怪兽回场",
    target: "ownGraveMonster"
  },
  dawnEdge: {
    handSummary: "我方怪兽 ATK +900",
    caption: "破晓锋印，攻击爆发",
    target: "ownMonster"
  },
  lastStandSurge: {
    handSummary: "LP≤1500 · ATK +700",
    caption: "临界誓辉，低生命强化",
    target: "ownMonster",
    targetRule: "strongest"
  },
  buff500: {
    handSummary: "最高 ATK 怪兽 +500",
    caption: "攻击力提升",
    target: "ownMonster",
    targetRule: "strongest"
  },
  soulResonance: {
    handSummary: "最高怪兽 ATK/DEF +200",
    caption: "星魂共鸣强化",
    target: "ownMonster",
    targetRule: "strongest"
  },
  aceEvolution: {
    handSummary: "送墓 2 素材 · 特殊召唤王牌",
    caption: "素材升阶，王牌登场"
  },
  fusionSummon: {
    handSummary: "2 指定素材 · 选择融合形态",
    caption: "融合召唤：选择指定素材登场"
  },
  splitToken: {
    handSummary: "生成衍生物 ×2",
    caption: "星火分裂，生成衍生物",
    target: "ownMonster"
  },
  aceCrackdown: {
    handSummary: "最高敌怪 ATK/DEF -500",
    caption: "压制王牌核心",
    target: "enemyMonster",
    targetRule: "strongest"
  },
  lunarDominion: {
    handSummary: "持续 -900 · 目标离场时送墓",
    caption: "月曜帷幕，持续压低指定目标",
    target: "enemyMonster"
  },
  trioFinalCounter: {
    handSummary: "LP≤1600 · 强化最低攻并重置攻击",
    caption: "终局三曜反击"
  },
  trioFinalCounterVow: {
    handSummary: "LP≤1600 · 最低攻 +2100 持续 · 重置攻击",
    caption: "终局誓约反击"
  },
  shield800: {
    handSummary: "护盾 +800",
    caption: "展开护盾"
  },
  extraSummon: {
    handSummary: "通常召唤次数 +1",
    caption: "额外召唤机会"
  },
  elementEcho: {
    handSummary: "全体 ATK +200 · 抽牌 ×1",
    caption: "元素共鸣，全场强化"
  },
  rallyAttack: {
    handSummary: "最高 ATK +300 · 攻击重置 ×1",
    caption: "重置攻势",
    target: "ownMonster",
    targetRule: "strongest"
  },
  pierceLine: {
    handSummary: "最高敌怪 ATK/DEF -400 · LP -200",
    caption: "破阵削弱",
    target: "enemyMonster",
    targetRule: "strongest"
  },
  graveReturn: {
    handSummary: "墓地回卡组顶 · 抽牌 ×1",
    caption: "墓地回收，抽一张卡",
    target: "ownGraveCard",
    targetRule: "notSource"
  },
  battleTrance: {
    handSummary: "最高 ATK +200 · 攻击重置 ×1",
    caption: "战斗狂热，获得再攻",
    target: "ownMonster",
    targetRule: "strongest"
  },
  directStrike: {
    handSummary: "直接攻击许可 ×1",
    caption: "打开直击路径"
  },
  fireWindCombo: {
    handSummary: "LP -400 · 全体 ATK +200",
    caption: "火与风的组合技"
  },
  lightShadowCombo: {
    handSummary: "护盾 +600 · 抽牌 ×1",
    caption: "光暗交错，展开星界"
  },
  equipBlade: {
    handSummary: "装备 · ATK +300",
    caption: "装备：攻击提升",
    target: "ownMonster"
  },
  equipAegis: {
    handSummary: "装备 · DEF +500",
    caption: "装备：守备强化",
    target: "ownMonster"
  },
  equipPrism: {
    handSummary: "装备 · ATK/DEF +200",
    caption: "装备：攻守共鸣",
    target: "ownMonster"
  },
  equipOverclock: {
    handSummary: "装备 · ATK +600 / DEF -300",
    caption: "装备：超载攻击",
    target: "ownMonster"
  },
  destroySpellTrap: {
    handSummary: "破坏敌方魔陷 ×1",
    caption: "破坏对手魔陷",
    target: "enemySpellTrap"
  }
};

export function spellDefinition(effect) {
  return spellDefinitions[effect] || null;
}

const ACE_EVOLUTION_MATERIALS = Object.freeze(["ember-soul-initiate", "lumen-gearlet"]);
const ACE_EVOLUTION_ACE = "astral-forge-dragon";

function cardTemplateId(card) {
  return card?.templateId || card?.id || "";
}

function hasMaterialCards(owner, materialIds = ACE_EVOLUTION_MATERIALS) {
  const available = fieldCards(owner).map(cardTemplateId);
  return materialIds.every((id) => {
    const index = available.indexOf(id);
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}

function hasCardInHandOrDeck(owner, templateId) {
  return [...(owner?.hand || []), ...(owner?.deck || [])].some((card) => cardTemplateId(card) === templateId);
}

function hasFusionMaterialCards(owner, materials = [], sourceCard = null) {
  const available = [
    ...fieldCards(owner),
    ...(owner?.hand || []).filter((card) => card !== sourceCard && (!sourceCard?.uid || card?.uid !== sourceCard.uid))
  ].map(cardTemplateId);
  return materials.every((requirement) => {
    for (let index = 0; index < requirement.count; index += 1) {
      const found = available.indexOf(requirement.templateId);
      if (found < 0) return false;
      available.splice(found, 1);
    }
    return true;
  });
}

export function validateSpellCondition(effect, { owner, rival, handIndex = -1 } = {}) {
  if (!spellDefinition(effect)) {
    return { ok: false, reason: "这个魔法效果还没有实现。" };
  }

  switch (effect) {
    case "heal700":
      return owner.lp < MAX_LP
        ? { ok: true }
        : { ok: false, reason: "生命值已满，不能发动回血魔法。" };
    case "draw2":
      return owner.deck.length >= 2
        ? { ok: true }
        : { ok: false, reason: "卡组不足 2 张，不能发动抽卡魔法。" };
    case "comebackDraw":
      return owner.deck.length >= 2
        ? { ok: true }
        : { ok: false, reason: "卡组不足 2 张，不能发动余烬星愿。" };
    case "graveRevive": {
      if (!owner.grave.some((card) => card?.type === "monster")) {
        return { ok: false, reason: "墓地没有可回召的怪兽。" };
      }
      if (!owner.field.some((slot) => !slot)) {
        return { ok: false, reason: "怪兽区已满，不能回召墓地怪兽。" };
      }
      return { ok: true };
    }
    case "dawnEdge":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动破晓锋印。" };
    case "lastStandSurge":
      if (owner.lp > 1500) return { ok: false, reason: "生命值高于 1500，不能发动临界誓辉。" };
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动临界誓辉。" };
    case "buff500":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动强化魔法。" };
    case "soulResonance":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动星魂共鸣。" };
    case "aceEvolution":
      if (!hasMaterialCards(owner)) {
        return { ok: false, reason: "需要星火引魂童和微光机巧卫在场，才能发动王牌进化。" };
      }
      return hasCardInHandOrDeck(owner, ACE_EVOLUTION_ACE)
        ? { ok: true }
        : { ok: false, reason: "手牌或卡组里没有可进化登场的王牌。" };
    case "fusionSummon": {
      const card = owner.hand?.[handIndex];
      const fusionOptions = fusionOptionsForCard(card);
      if (fusionOptions.length === 0) {
        return { ok: false, reason: "这张融合魔法没有完整的素材或结果配置。" };
      }
      const readyOption = fusionOptions.find((fusion) =>
        hasFusionMaterialCards(owner, fusion.materials, card) &&
        hasCardInHandOrDeck(owner, fusion.resultTemplateId)
      );
      if (readyOption) return { ok: true };
      if (!fusionOptions.some((fusion) => hasFusionMaterialCards(owner, fusion.materials, card))) {
        return { ok: false, reason: "手牌或场上缺少指定融合素材。" };
      }
      return { ok: false, reason: "手牌或卡组里没有可融合登场的怪兽。" };
    }
    case "splitToken": {
      if (fieldCards(owner).length === 0) return { ok: false, reason: "场上没有怪兽，不能发动星火分裂。" };
      const emptySlots = (owner.field || []).filter((slot) => !slot).length;
      return emptySlots >= 2
        ? { ok: true }
        : { ok: false, reason: "需要至少 2 个空怪兽区，才能生成星火衍生体。" };
    }
    case "aceCrackdown":
      return fieldCards(rival).length > 0
        ? { ok: true }
        : { ok: false, reason: "对手场上没有怪兽，不能发动裂核裁令。" };
    case "lunarDominion":
      if (fieldCards(rival).length === 0) return { ok: false, reason: "对手场上没有怪兽，不能展开月曜帷幕。" };
      if ((owner.traps || []).every(Boolean)) return { ok: false, reason: "魔陷区已满，不能展开月曜帷幕。" };
      if ((owner.traps || []).some((card) => cardTemplateId(card) === "trio-moon-dominion")) {
        return { ok: false, reason: "月曜帷幕已经在场，不能重复展开。" };
      }
      return { ok: true };
    case "trioFinalCounter":
      if (owner.lp > 1600) return { ok: false, reason: "生命值还没有进入终局反击条件。" };
      if (!fieldCards(owner).some((card) => cardTemplateId(card) === "trio-ember-pawn")) {
        return { ok: false, reason: "余烁小卫不在场，不能发动终局反击。" };
      }
      if ((rival?.traps || []).some((card) => cardTemplateId(card) === "trio-moon-dominion")) {
        return { ok: false, reason: "月曜帷幕仍在压制，必须先清除。" };
      }
      return { ok: true };
    case "trioFinalCounterVow":
      if (owner.lp > 1600) return { ok: false, reason: "生命值还没有进入终局誓约的条件。" };
      if (!fieldCards(owner).some((card) => cardTemplateId(card) === "trio-ember-pawn")) {
        return { ok: false, reason: "余烁小卫不在场，不能立下终局誓约。" };
      }
      if ((rival?.traps || []).some((card) => cardTemplateId(card) === "trio-moon-dominion")) {
        return { ok: false, reason: "月曜帷幕仍在压制，必须先清除。" };
      }
      return { ok: true };
    case "shield800":
      return owner.shield <= 1600
        ? { ok: true }
        : { ok: false, reason: "护盾空间不足，不能完整发动星盾展开。" };
    case "extraSummon": {
      const hasEmptyZone = owner.field.some((slot) => !slot);
      const hasMonsterInHand = owner.hand.some((item, index) => index !== handIndex && item.type === "monster");
      if (!hasEmptyZone) return { ok: false, reason: "召唤区已满，不能发动双重召唤。" };
      if (!hasMonsterInHand) return { ok: false, reason: "手牌没有可额外召唤的怪兽，不能发动双重召唤。" };
      return { ok: true };
    }
    case "elementEcho":
      return fieldElements(owner).size >= 2
        ? { ok: true }
        : { ok: false, reason: "需要场上至少 2 种属性怪兽，才能发动元素共鸣。" };
    case "rallyAttack":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动连携突击。" };
    case "pierceLine":
      return fieldCards(rival).length > 0
        ? { ok: true }
        : { ok: false, reason: "对手场上没有怪兽，不能发动破阵星芒。" };
    case "graveReturn":
      return owner.grave.length > 0
        ? { ok: true }
        : { ok: false, reason: "墓地没有可回收的卡，不能发动星尘回收。" };
    case "battleTrance":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动战斗狂热。" };
    case "directStrike": {
      if (owner.attacksSkipped) return { ok: false, reason: "本回合已经跳过攻击，不能再获得直接攻击许可。" };
      const attacker = owner.field.find((card) => card && !card.used && card.mode !== "defense");
      if (!attacker) return { ok: false, reason: "没有可攻击怪兽，不能发动星隙穿透。" };
      if (fieldCards(rival).length === 0) return { ok: false, reason: "对手场上没有怪兽，不需要直击许可。" };
      if (owner.directAttacks > 0) return { ok: false, reason: "本回合已经有直接攻击许可。" };
      return { ok: true };
    }
    case "fireWindCombo": {
      const elements = fieldElements(owner);
      return elements.has("fire") && elements.has("wind")
        ? { ok: true }
        : { ok: false, reason: "需要场上同时有火属性和风属性怪兽，才能发动炎岚合击。" };
    }
    case "lightShadowCombo": {
      const elements = fieldElements(owner);
      return elements.has("light") && elements.has("shadow")
        ? { ok: true }
        : { ok: false, reason: "需要场上同时有光属性和暗属性怪兽，才能发动晨昏星界。" };
    }
    case "equipBlade":
    case "equipAegis":
    case "equipPrism":
    case "equipOverclock": {
      if (fieldCards(owner).length === 0) return { ok: false, reason: "场上没有怪兽，不能发动装备魔法。" };
      if ((owner.traps || []).every(Boolean)) return { ok: false, reason: "魔陷区已满，不能发动装备魔法。" };
      return { ok: true };
    }
    case "destroySpellTrap":
      return (rival?.traps || []).some(Boolean)
        ? { ok: true }
        : { ok: false, reason: "对手魔陷区没有可破坏的卡，不能发动解印射线。" };
    default:
      return { ok: true };
  }
}

export function scoreSpellForAi(effect, { owner, rival, aiStyle = "balanced" } = {}) {
  const buffMeta = aiStyle !== "scriptedPressure" ? buffSpellMeta[effect] : null;
  if (buffMeta && fieldCards(owner).length > 0 && buffLeadsToLethal({ owner, rival, ...buffMeta })) {
    return 95;
  }
  switch (effect) {
    case "burn500":
      return rival.lp <= (aiStyle === "aggressive" ? 1800 : 900) ? 95 : 22;
    case "heal700":
      return owner.lp <= (aiStyle === "control" ? 3200 : 2600) ? 72 : 0;
    case "draw2":
      return owner.hand.length <= (aiStyle === "control" ? 5 : 4) ? 58 : 18;
    case "comebackDraw":
      return owner.deck.length >= 2 && owner.hand.length <= 5 ? (owner.lp <= 1800 ? 82 : 56) : 0;
    case "graveRevive":
      return owner.grave.some((card) => card?.type === "monster") && owner.field.some((slot) => !slot) ? 78 : 0;
    case "dawnEdge":
      return fieldCards(owner).length > 0 ? (aiStyle === "aggressive" ? 84 : 62) : 0;
    case "lastStandSurge":
      return owner.lp <= 1500 && fieldCards(owner).length > 0 ? 88 : 0;
    case "buff500":
      return fieldCards(owner).length > 0 ? (aiStyle === "aggressive" ? 76 : 50) : 0;
    case "soulResonance":
      return fieldCards(owner).length > 0 ? (aiStyle === "control" ? 58 : 54) : 0;
    case "aceEvolution":
      return hasMaterialCards(owner) && hasCardInHandOrDeck(owner, ACE_EVOLUTION_ACE) ? 92 : 0;
    case "splitToken":
      return 0;
    case "aceCrackdown":
      return fieldCards(rival).length > 0 ? 86 : 0;
    case "lunarDominion":
      return fieldCards(rival).length > 0 && (owner.traps || []).some((slot) => !slot) ? 88 : 0;
    case "trioFinalCounter":
      return owner.lp <= 1600 &&
        fieldCards(owner).some((card) => cardTemplateId(card) === "trio-ember-pawn") &&
        !(rival?.traps || []).some((card) => cardTemplateId(card) === "trio-moon-dominion")
        ? 92
        : 0;
    case "shield800":
      return (owner.lp <= (aiStyle === "control" ? 3400 : 2800) || owner.shield <= (aiStyle === "control" ? 500 : 0)) ? 64 : 10;
    case "extraSummon":
      return (owner.field.some((slot) => !slot) && owner.hand.some((card) => card.type === "monster")) ? 62 : 0;
    case "elementEcho":
      return fieldElements(owner).size >= 2 ? 68 : 0;
    case "rallyAttack":
      return fieldCards(owner).length > 0 ? (owner.field.some((card) => card?.used) ? 82 : 44) : 0;
    case "pierceLine":
      return fieldCards(rival).length > 0 ? 70 : 0;
    case "graveReturn":
      return owner.grave.length > 0 && owner.deck.length > 0 ? 55 : 0;
    case "battleTrance":
      return fieldCards(owner).length > 0 ? (aiStyle === "aggressive" ? 78 : 48) : 0;
    case "directStrike": {
      if (owner.attacksSkipped) return 0;
      const attackers = owner.field.filter((card) =>
        card && !card.used && !card.attackLockReason && card.mode !== "defense"
      );
      if (!attackers.length || fieldCards(rival).length === 0 || owner.directAttacks > 0) return 0;
      const bestAtk = Math.max(...attackers.map(totalAtk));
      const targets = fieldCards(rival);
      const blocked = targets.length > 0 && attackers.every((attacker) => targets.every((target) => totalAtk(attacker) < battleValue(target)));
      const hasLethalDirectRoute = aiStyle === "scriptedPressure"
        ? Boolean(findAiDirectLethalAttacker({
            attackers,
            targets,
            rivalLp: rival.lp,
            shield: rival.shield,
            directAttacks: 1
          }))
        : bestAtk >= rival.lp;
      if (hasLethalDirectRoute) return 94;
      if (blocked) return 76;
      return aiStyle === "aggressive" ? 58 : 0;
    }
    case "fireWindCombo": {
      const elements = fieldElements(owner);
      if (!elements.has("fire") || !elements.has("wind")) return 0;
      return rival.lp <= 1200 ? 88 : 72;
    }
    case "lightShadowCombo": {
      const elements = fieldElements(owner);
      if (!elements.has("light") || !elements.has("shadow")) return 0;
      return aiStyle === "control" || owner.lp <= 3000 ? 82 : 60;
    }
    case "equipBlade":
      return fieldCards(owner).length > 0 && (owner.traps || []).some((slot) => !slot)
        ? (aiStyle === "aggressive" ? 66 : 46)
        : 0;
    case "equipAegis":
      return fieldCards(owner).length > 0 && (owner.traps || []).some((slot) => !slot)
        ? (aiStyle === "control" ? 64 : 36)
        : 0;
    case "equipPrism":
      return fieldCards(owner).length > 0 && (owner.traps || []).some((slot) => !slot) ? 58 : 0;
    case "equipOverclock":
      return fieldCards(owner).length > 0 && (owner.traps || []).some((slot) => !slot)
        ? (aiStyle === "aggressive" ? 74 : 42)
        : 0;
    case "destroySpellTrap": {
      const targets = (rival?.traps || []).filter(Boolean);
      if (!targets.length) return 0;
      if (aiStyle !== "scriptedPressure" &&
          targets.some((card) => trapCanResolve(card, "attack", { owner: rival }))) {
        return 96;
      }
      return targets.some((card) => ["equipBlade", "equipAegis", "equipPrism", "equipOverclock"].includes(card.effect)) ? 78 : 52;
    }
    default:
      return 0;
  }
}

const buffSpellMeta = {
  dawnEdge: { buff: 900, rule: "strongest" },
  lastStandSurge: { buff: 700, rule: "strongest" },
  buff500: { buff: 500, rule: "strongest" },
  soulResonance: { buff: 200, rule: "strongest" },
  battleTrance: { buff: 200, rule: "strongest", resets: 1, resetRule: "target" },
  rallyAttack: { buff: 300, rule: "strongest", resets: 1, resetRule: "firstUsed" }
};

function buffedAttackPlan(owner, buff, rule, resets, resetRule) {
  const monsters = fieldCards(owner);
  if (!monsters.length) return { attackers: [], attackUses: [] };
  let targetIndex = 0;
  for (let index = 1; index < monsters.length; index += 1) {
    const better = rule === "weakest"
      ? totalAtk(monsters[index]) < totalAtk(monsters[targetIndex])
      : totalAtk(monsters[index]) > totalAtk(monsters[targetIndex]);
    if (better) targetIndex = index;
  }
  const target = monsters[targetIndex];
  const resetTarget = resetRule === "firstUsed"
    ? monsters.find((card) => card.used) || target
    : target;
  const attackers = [];
  const attackUses = [];
  monsters.forEach((card) => {
    const canReadyTarget = card === resetTarget && resets > 0 && card.used && !card.attackLockReason;
    const grantsExtraAttack = card === resetTarget && resets > 0 && !card.used && !card.attackLockReason;
    if (card.mode === "defense" || card.attackLockReason || (card.used && !canReadyTarget)) return;
    attackers.push(card === target
      ? { ...card, tempAtk: (card.tempAtk || 0) + buff, used: false }
      : card);
    attackUses.push(1 + (grantsExtraAttack ? resets : 0));
  });
  return { attackers, attackUses };
}

function buffLeadsToLethal({ owner, rival, buff = 0, rule = "strongest", resets = 0, resetRule = "target" } = {}) {
  if (owner?.attacksSkipped) return false;
  const plan = buffedAttackPlan(owner, buff, rule, resets, resetRule);
  if (!plan.attackers.length) return false;
  const targets = (rival?.field || []).filter(Boolean);
  const damage = findAiAttackSequence({
    attackers: plan.attackers,
    targets,
    shield: Number(rival?.shield) || 0,
    directAttacks: Number(owner?.directAttacks) || 0,
    attackUses: plan.attackUses
  }).damage;
  return damage >= Number(rival?.lp) || 0;
}
