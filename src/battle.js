import { battleValue, shieldPreview, totalAtk, totalDef } from './rules.js';

export function battleStatLabel(card) {
  if (!card) return "直接攻击";
  return card.mode === "defense" ? `守备 ${totalDef(card)}` : `攻击 ${totalAtk(card)}`;
}

export function battleWearAmount(diff) {
  return Math.min(500, Math.max(150, Math.round(Math.abs(diff) * 0.25 / 50) * 50));
}

export function describeBattleOutcome(attacker, target, owner = null, rival = null) {
  if (!attacker) return null;
  const attack = totalAtk(attacker);
  if (!target) {
    const shield = shieldPreview(attack, rival?.shield || 0);
    return {
      kind: "direct",
      attack,
      targetValue: 0,
      targetStat: "LP",
      diff: attack,
      rawDamage: attack,
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  const targetValue = battleValue(target);
  const diff = attack - targetValue;
  if (diff > 0) {
    const rawDamage = target.mode === "defense" ? 0 : diff;
    const shield = shieldPreview(rawDamage, rival?.shield || 0);
    return {
      kind: target.mode === "defense" ? "breakDefense" : "attackWin",
      attack,
      targetValue,
      targetStat: battleStatLabel(target),
      diff,
      rawDamage,
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      destroysAttacker: false,
      destroysTarget: true,
      wear: 0
    };
  }

  if (diff < 0) {
    const shield = shieldPreview(Math.abs(diff), owner?.shield || 0);
    if (target.mode === "defense") {
      return {
        kind: "guardCounter",
        attack,
        targetValue,
        targetStat: battleStatLabel(target),
        diff,
        rawDamage: Math.abs(diff),
        finalDamage: shield.finalDamage,
        shieldBlocked: shield.blocked,
        destroysAttacker: false,
        destroysTarget: false,
        wear: battleWearAmount(diff)
      };
    }
    return {
      kind: "countered",
      attack,
      targetValue,
      targetStat: battleStatLabel(target),
      diff,
      rawDamage: Math.abs(diff),
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      destroysAttacker: true,
      destroysTarget: false,
      wear: battleWearAmount(diff)
    };
  }

  if (target.mode === "defense") {
    return {
      kind: "guardHold",
      attack,
      targetValue,
      targetStat: battleStatLabel(target),
      diff,
      rawDamage: 0,
      finalDamage: 0,
      shieldBlocked: 0,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  return {
    kind: "clash",
    attack,
    targetValue,
    targetStat: battleStatLabel(target),
    diff,
    rawDamage: 0,
    finalDamage: 0,
    shieldBlocked: 0,
    destroysAttacker: true,
    destroysTarget: true,
    wear: 0
  };
}

export function battleLogText(attacker, target, outcome, dealt = outcome?.finalDamage) {
  if (!outcome) return "";
  if (outcome.kind === "direct") {
    return `${attacker.name} 直接攻击，攻击 ${outcome.attack}，造成 ${dealt} 点生命值伤害。`;
  }
  if (outcome.kind === "breakDefense") {
    return `${attacker.name} 攻击 ${outcome.attack} 击破 ${target.name} ${outcome.targetStat}，守备怪兽不造成生命值伤害。`;
  }
  if (outcome.kind === "attackWin") {
    const shieldText = outcome.shieldBlocked > 0 ? `，护盾吸收 ${outcome.shieldBlocked}` : "";
    return `${attacker.name} 攻击 ${outcome.attack} 击破 ${target.name} ${outcome.targetStat}，差值 ${outcome.diff}${shieldText}，造成 ${dealt} 点战斗伤害。`;
  }
  if (outcome.kind === "guardCounter") {
    const shieldText = outcome.shieldBlocked > 0 ? `，护盾吸收 ${outcome.shieldBlocked}` : "";
    return `${attacker.name} 攻击 ${outcome.attack} 低于 ${target.name} ${outcome.targetStat}，守备反击差值 ${Math.abs(outcome.diff)}${shieldText}，攻击方承受 ${dealt} 点伤害，双方怪兽保留。`;
  }
  if (outcome.kind === "guardHold") {
    return `${attacker.name} 攻击 ${outcome.attack} 与 ${target.name} ${outcome.targetStat} 相同，守备怪兽挡下攻击，双方怪兽保留。`;
  }
  if (outcome.kind === "countered") {
    const shieldText = outcome.shieldBlocked > 0 ? `，护盾吸收 ${outcome.shieldBlocked}` : "";
    return `${attacker.name} 攻击 ${outcome.attack} 低于 ${target.name} ${outcome.targetStat}，差值 ${Math.abs(outcome.diff)}${shieldText}，被反击破坏并承受 ${dealt} 点伤害。`;
  }
  return `${attacker.name} 与 ${target.name} 数值相同，双方同归于尽。`;
}
