import { MAX_LP, battleValue, fieldCards, fieldElements, totalAtk } from './rules.js';

export const spellDefinitions = {
  burn500: {
    caption: "爆裂伤害"
  },
  heal700: {
    caption: "生命回复"
  },
  draw2: {
    caption: "预见未来，抽两张卡"
  },
  buff500: {
    caption: "攻击力提升",
    target: "ownMonster",
    targetRule: "strongest"
  },
  soulResonance: {
    caption: "星魂共鸣强化",
    target: "ownMonster",
    targetRule: "strongest"
  },
  shield800: {
    caption: "展开护盾"
  },
  extraSummon: {
    caption: "额外召唤机会"
  },
  elementEcho: {
    caption: "元素共鸣，全场强化"
  },
  rallyAttack: {
    caption: "重置攻势",
    target: "ownMonster",
    targetRule: "strongest"
  },
  pierceLine: {
    caption: "破阵削弱",
    target: "enemyMonster",
    targetRule: "strongest"
  },
  graveReturn: {
    caption: "墓地回收，抽一张卡"
  },
  battleTrance: {
    caption: "战斗狂热，获得再攻",
    target: "ownMonster",
    targetRule: "strongest"
  },
  directStrike: {
    caption: "打开直击路径"
  },
  fireWindCombo: {
    caption: "火与风的组合技"
  },
  lightShadowCombo: {
    caption: "光暗交错，展开星界"
  },
  equipBlade: {
    caption: "装备：攻击提升",
    target: "ownMonster"
  },
  equipAegis: {
    caption: "装备：守备强化",
    target: "ownMonster"
  },
  equipPrism: {
    caption: "装备：攻守共鸣",
    target: "ownMonster"
  },
  equipOverclock: {
    caption: "装备：超载攻击",
    target: "ownMonster"
  },
  destroySpellTrap: {
    caption: "破坏对手魔陷",
    target: "enemySpellTrap"
  }
};

export function spellDefinition(effect) {
  return spellDefinitions[effect] || null;
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
    case "buff500":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动强化魔法。" };
    case "soulResonance":
      return fieldCards(owner).length > 0
        ? { ok: true }
        : { ok: false, reason: "场上没有怪兽，不能发动星魂共鸣。" };
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
  switch (effect) {
    case "burn500":
      return rival.lp <= (aiStyle === "aggressive" ? 1800 : 900) ? 95 : 22;
    case "heal700":
      return owner.lp <= (aiStyle === "control" ? 3200 : 2600) ? 72 : 0;
    case "draw2":
      return owner.hand.length <= (aiStyle === "control" ? 5 : 4) ? 58 : 18;
    case "buff500":
      return fieldCards(owner).length > 0 ? (aiStyle === "aggressive" ? 76 : 50) : 0;
    case "soulResonance":
      return fieldCards(owner).length > 0 ? (aiStyle === "control" ? 58 : 54) : 0;
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
      const attackers = owner.field.filter((card) => card && !card.used && card.mode !== "defense");
      if (!attackers.length || fieldCards(rival).length === 0 || owner.directAttacks > 0) return 0;
      const bestAtk = Math.max(...attackers.map(totalAtk));
      const targets = fieldCards(rival);
      const blocked = targets.length > 0 && attackers.every((attacker) => targets.every((target) => totalAtk(attacker) < battleValue(target)));
      if (bestAtk >= rival.lp) return 94;
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
      return targets.some((card) => ["equipBlade", "equipAegis", "equipPrism", "equipOverclock"].includes(card.effect)) ? 78 : 52;
    }
    default:
      return 0;
  }
}
