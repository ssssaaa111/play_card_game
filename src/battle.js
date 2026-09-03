import { battleValue, hasPiercingDamage, totalAtk, totalDef } from './rules.js';

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
    return {
      kind: "direct",
      attack,
      targetValue: 0,
      targetStat: "LP",
      diff: attack,
      rawDamage: attack,
      finalDamage: attack,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  const targetValue = battleValue(target);
  const diff = attack - targetValue;
  if (diff > 0) {
    const piercesDefense = target.mode === "defense" && hasPiercingDamage(attacker);
    const rawDamage = piercesDefense || target.mode !== "defense" ? diff : 0;
    return {
      kind: piercesDefense ? "pierceDefense" : target.mode === "defense" ? "breakDefense" : "attackWin",
      attack,
      targetValue,
      targetStat: battleStatLabel(target),
      diff,
      rawDamage,
      finalDamage: rawDamage,
      piercing: piercesDefense,
      destroysAttacker: false,
      destroysTarget: true,
      wear: 0
    };
  }

  if (diff < 0) {
    if (target.mode === "defense") {
      return {
        kind: "guardCounter",
        attack,
        targetValue,
        targetStat: battleStatLabel(target),
        diff,
        rawDamage: Math.abs(diff),
        finalDamage: Math.abs(diff),
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
      finalDamage: Math.abs(diff),
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
  if (outcome.kind === "pierceDefense") {
    return `${attacker.name} 攻击 ${outcome.attack} 击破 ${target.name} ${outcome.targetStat}，神格贯穿差值 ${outcome.diff}，造成 ${dealt} 点战斗伤害。`;
  }
  if (outcome.kind === "attackWin") {
    return `${attacker.name} 攻击 ${outcome.attack} 击破 ${target.name} ${outcome.targetStat}，差值 ${outcome.diff}，造成 ${dealt} 点战斗伤害。`;
  }
  if (outcome.kind === "guardCounter") {
    return `${attacker.name} 攻击 ${outcome.attack} 低于 ${target.name} ${outcome.targetStat}，守备反击差值 ${Math.abs(outcome.diff)}，攻击方承受 ${dealt} 点伤害，双方怪兽保留。`;
  }
  if (outcome.kind === "guardHold") {
    return `${attacker.name} 攻击 ${outcome.attack} 与 ${target.name} ${outcome.targetStat} 相同，守备怪兽挡下攻击，双方怪兽保留。`;
  }
  if (outcome.kind === "countered") {
    return `${attacker.name} 攻击 ${outcome.attack} 低于 ${target.name} ${outcome.targetStat}，差值 ${Math.abs(outcome.diff)}，被反击破坏并承受 ${dealt} 点伤害。`;
  }
  return `${attacker.name} 与 ${target.name} 数值相同，双方同归于尽。`;
}
