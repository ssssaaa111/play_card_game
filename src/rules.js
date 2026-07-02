export const MAX_LP = 4000;
export const MONSTER_ZONE_SIZE = 5;
export const SPELL_TRAP_ZONE_SIZE = 5;
export const FIELD_SIZE = MONSTER_ZONE_SIZE;
export const MAX_SHIELD = 2400;

export function fieldCards(duelist) {
  return duelist.field.filter(Boolean);
}

export function fieldElements(duelist) {
  return new Set(fieldCards(duelist).map((card) => card.element).filter(Boolean));
}

export function elementLabel(element) {
  return {
    fire: "火",
    light: "光",
    wind: "风",
    shadow: "暗"
  }[element] || element;
}

export function totalAtk(card) {
  return Math.max(0, card.atk + (card.tempAtk || 0));
}

export function totalDef(card) {
  return Math.max(0, card.def + (card.tempDef || 0));
}

export function battleValue(card) {
  return card.mode === "defense" ? totalDef(card) : totalAtk(card);
}

export function battlePreviewText(attacker, target) {
  if (!attacker) return "还没有选择攻击怪兽。";
  if (!target) return `${attacker.name} 直接攻击，预计造成 ${totalAtk(attacker)} 点伤害。`;
  const attackerStat = `攻击 ${totalAtk(attacker)}`;
  const targetStat = target.mode === "defense" ? `守备 ${totalDef(target)}` : `攻击 ${totalAtk(target)}`;
  const diff = totalAtk(attacker) - battleValue(target);
  if (diff > 0) {
    return target.mode === "defense"
      ? `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，可击破但不造成战斗伤害。`
      : `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，预计造成 ${diff} 点伤害。`;
  }
  if (diff < 0) {
    return target.mode === "defense"
      ? `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方预计承受 ${Math.abs(diff)} 点伤害，双方怪兽保留。`
      : `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方预计承受 ${Math.abs(diff)} 点伤害。`;
  }
  return target.mode === "defense"
    ? `${attacker.name} 与 ${target.name} 数值相同，守备怪兽挡下攻击，双方怪兽保留。`
    : `${attacker.name} 与 ${target.name} 数值相同，预计同归于尽。`;
}

export function shieldPreview(amount, shield = 0) {
  if (amount <= 0) return { blocked: 0, finalDamage: 0, text: "不造成生命值伤害。" };
  const blocked = Math.min(shield || 0, amount);
  const finalDamage = amount - blocked;
  return {
    blocked,
    finalDamage,
    text: blocked > 0
      ? `护盾预计吸收 ${blocked} 点，最终生命值伤害 ${finalDamage}。`
      : `预计造成 ${finalDamage} 点生命值伤害。`
  };
}

export function makeBattlePreview(attacker, target, owner = null, rival = null) {
  if (!attacker) return null;
  const attack = totalAtk(attacker);
  const rows = [
    { label: "攻击方", value: `${attacker.name} / 攻击 ${attack}` }
  ];
  if (!target) {
    const shield = shieldPreview(attack, rival?.shield || 0);
    rows.push(
      { label: "目标", value: "对方玩家 / 直接伤害" },
      { label: "结算", value: shield.text }
    );
    return {
      badge: "直击",
      tone: "",
      rows,
      result: `${attacker.name} 将直接攻击玩家。${shield.blocked > 0 ? "护盾会先吸收伤害。" : ""}`
    };
  }
  const targetMode = target.mode === "defense" ? "守备" : "攻击";
  const targetValue = battleValue(target);
  const diff = attack - targetValue;
  rows.push(
    { label: "目标", value: `${target.name} / ${targetMode} ${targetValue}` },
    { label: "差值", value: diff > 0 ? `+${diff}` : `${diff}` }
  );
  if (diff > 0) {
    const shield = shieldPreview(target.mode === "defense" ? 0 : diff, rival?.shield || 0);
    if (shield.blocked > 0) {
      rows.push({ label: "护盾", value: `吸收 ${shield.blocked} / 实伤 ${shield.finalDamage}` });
    }
    return {
      badge: target.mode === "defense" ? "破防" : "优势",
      tone: target.mode === "defense" ? "guard" : "",
      rows,
      result: target.mode === "defense"
        ? "目标会被击破；守备表示不造成生命值伤害。"
        : `目标会被击破；${shield.text}`
    };
  }
  if (diff < 0) {
    const shield = shieldPreview(Math.abs(diff), owner?.shield || 0);
    if (shield.blocked > 0) {
      rows.push({ label: "护盾", value: `吸收 ${shield.blocked} / 实伤 ${shield.finalDamage}` });
    }
    if (target.mode === "defense") {
      return {
        badge: "守备反击",
        tone: "guard",
        rows,
        result: `攻击方承受守备力差值伤害；${shield.text}双方怪兽保留，目标会产生战斗损耗。`
      };
    }
    return {
      badge: "受反击",
      tone: "danger",
      rows,
      result: `攻击方会被破坏；${shield.text}目标会产生战斗损耗。`
    };
  }
  if (target.mode === "defense") {
    return {
      badge: "防御",
      tone: "guard",
      rows,
      result: "守备怪兽挡下攻击，双方怪兽保留。"
    };
  }
  return {
    badge: "相杀",
    tone: "danger",
    rows,
    result: "双方数值相同，预计同归于尽。"
  };
}

export function strongestMonster(duelist) {
  return fieldCards(duelist).sort((a, b) => totalAtk(b) - totalAtk(a))[0] || null;
}

export function weakestMonster(duelist) {
  return fieldCards(duelist).sort((a, b) => totalAtk(a) - totalAtk(b))[0] || null;
}

export function canDirectAttack(owner, attacker) {
  return Boolean(attacker?.canDirectAttack || owner.directAttacks > 0);
}

export function validateAttackTarget(owner, rival, attacker, targetIndex) {
  const target = targetIndex >= 0 ? rival.field[targetIndex] : null;
  if (target) return { ok: true, direct: false };
  if (targetIndex >= 0) {
    return { ok: false, reason: "这个召唤区没有怪兽，不能攻击空位。" };
  }
  if (fieldCards(rival).length > 0 && !canDirectAttack(owner, attacker)) {
    return { ok: false, reason: "对手场上还有怪兽，必须先攻击怪兽；除非卡牌效果允许直接攻击。" };
  }
  return { ok: true, direct: true };
}

export function legalAttackTargets(owner, rival, attacker) {
  if (!attacker || attacker.used || attacker.mode === "defense" || owner?.attacksSkipped) return [];
  const targets = [];
  (rival?.field || []).forEach((card, index) => {
    if (card && validateAttackTarget(owner, rival, attacker, index).ok) {
      targets.push({ type: "monster", targetIndex: index, card });
    }
  });
  if (validateAttackTarget(owner, rival, attacker, -1).ok) {
    targets.push({ type: "player", targetIndex: -1, card: null });
  }
  return targets;
}

export function spellTargetPrompt(mode, cardName = "这张卡", targetRule = "") {
  if (mode === "ownMonster" && targetRule === "strongest") return `请选择我方攻击力最高的怪兽作为「${cardName}」的目标。`;
  if (mode === "enemyMonster" && targetRule === "strongest") return `请选择敌方攻击力最高的怪兽作为「${cardName}」的目标。`;
  if (mode === "ownGraveMonster") return `请选择我方墓地中的怪兽作为「${cardName}」的目标。`;
  if (mode === "ownMonster") return `请选择我方怪兽作为「${cardName}」的目标。`;
  if (mode === "enemyMonster") return `请选择敌方怪兽作为「${cardName}」的目标。`;
  if (mode === "enemySpellTrap") return `请选择敌方魔陷区的卡作为「${cardName}」的目标。`;
  return `请选择「${cardName}」的目标。`;
}

export function validateSpellTargetRule(pending, duelist, target) {
  if (pending?.targetRule === "strongest") {
    const monsters = fieldCards(duelist);
    const maxAtk = Math.max(...monsters.map(totalAtk));
    if (totalAtk(target) !== maxAtk) {
      const scope = pending.mode === "enemyMonster" ? "敌方" : "我方";
      const bestNames = monsters.filter((card) => totalAtk(card) === maxAtk).map((card) => card.name).join("、");
      return { ok: false, reason: `${pending.cardName}只能选择${scope}攻击力最高的怪兽：${bestNames}。` };
    }
  }
  return { ok: true };
}
