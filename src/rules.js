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

export function hasPiercingDamage(card) {
  return Boolean(card?.piercingDamage || card?.divinePierce);
}

export function shieldPierceAmount(card) {
  const config = card?.shieldPierce || card?.divinePressure;
  if (config === true) return 500;
  if (typeof config === "number") return Math.max(0, config);
  if (config && typeof config === "object") return Math.max(0, Number(config.amount) || 0);
  return 0;
}

export function hasShieldPierce(card) {
  return shieldPierceAmount(card) > 0;
}

export function targetResistanceType(card) {
  const config = card?.targetResistance || card?.divineTargetResistance || card?.targetImmunity;
  if (config === true) return "targetResistance";
  if (typeof config === "string") return config;
  if (config && typeof config === "object") return config.type || "targetResistance";
  return "";
}

export function hasTargetResistance(card) {
  return Boolean(targetResistanceType(card));
}

export function bypassesTargetResistance(sourceCard, targetCard) {
  if (!hasTargetResistance(targetCard)) return true;
  const resistance = targetResistanceType(targetCard);
  const bypass = sourceCard?.targetResistanceBypass || sourceCard?.divineBreak || sourceCard?.targetBypass;
  if (bypass === true) return true;
  if (typeof bypass === "string") return bypass === resistance;
  if (Array.isArray(bypass)) return bypass.includes(resistance);
  return false;
}

export function canEffectTargetCard(sourceCard, targetCard, { sourceOwner = "", targetOwner = "" } = {}) {
  if (!targetCard) return false;
  if (!hasTargetResistance(targetCard)) return true;
  if (sourceOwner && targetOwner && sourceOwner === targetOwner) return true;
  return bypassesTargetResistance(sourceCard, targetCard);
}

function shieldAdjustedPreviewText(amount, duelist, sourceCard) {
  const shield = shieldPreview(amount, duelist?.shield || 0, sourceCard);
  return shield.blocked > 0 || shield.shieldPierced > 0 ? shield.text : "";
}

export function battlePreviewText(attacker, target, owner = null, rival = null) {
  if (!attacker) return "还没有选择攻击怪兽。";
  if (!target) {
    const shieldText = shieldAdjustedPreviewText(totalAtk(attacker), rival, attacker);
    if (shieldText) return `${attacker.name} 直接攻击，${shieldText}`;
    const pressure = hasShieldPierce(attacker) ? `神格威压会先消解至多 ${shieldPierceAmount(attacker)} 点护盾。` : "";
    return `${attacker.name} 直接攻击，预计造成 ${totalAtk(attacker)} 点伤害。${pressure}`;
  }
  const attackerStat = `攻击 ${totalAtk(attacker)}`;
  const targetStat = target.mode === "defense" ? `守备 ${totalDef(target)}` : `攻击 ${totalAtk(target)}`;
  const diff = totalAtk(attacker) - battleValue(target);
  if (diff > 0) {
    if (target.mode === "defense" && hasPiercingDamage(attacker)) {
      const shieldText = shieldAdjustedPreviewText(diff, rival, attacker);
      if (shieldText) {
        return `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，可击破并贯穿；${shieldText}`;
      }
      const pressure = hasShieldPierce(attacker) ? `神格威压会先消解至多 ${shieldPierceAmount(attacker)} 点护盾。` : "";
      return `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，可击破并贯穿造成 ${diff} 点伤害。${pressure}`;
    }
    const shieldText = shieldAdjustedPreviewText(diff, rival, attacker);
    return target.mode === "defense"
      ? `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，可击破但不造成战斗伤害。`
      : `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，${shieldText || `预计造成 ${diff} 点伤害。`}`;
  }
  if (diff < 0) {
    const shieldText = shieldAdjustedPreviewText(Math.abs(diff), owner, target);
    if (shieldText) {
      return target.mode === "defense"
        ? `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方${shieldText}双方怪兽保留。`
        : `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方${shieldText}`;
    }
    return target.mode === "defense"
      ? `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方预计承受 ${Math.abs(diff)} 点伤害，双方怪兽保留。`
      : `${attacker.name} ${attackerStat} 低于 ${target.name} ${targetStat}，攻击方预计承受 ${Math.abs(diff)} 点伤害。`;
  }
  return target.mode === "defense"
    ? `${attacker.name} 与 ${target.name} 数值相同，守备怪兽挡下攻击，双方怪兽保留。`
    : `${attacker.name} 与 ${target.name} 数值相同，预计同归于尽。`;
}

export function shieldPreview(amount, shield = 0, sourceCard = null) {
  if (amount <= 0) return { blocked: 0, finalDamage: 0, text: "不造成生命值伤害。" };
  const shieldBefore = Math.max(0, Number(shield) || 0);
  const shieldPierced = Math.min(shieldBefore, shieldPierceAmount(sourceCard));
  const shieldAfterPierce = Math.max(0, shieldBefore - shieldPierced);
  const blocked = Math.min(shieldAfterPierce, amount);
  const finalDamage = amount - blocked;
  const pressureText = shieldPierced > 0 ? `神格威压先消解 ${shieldPierced} 点护盾，` : "";
  return {
    shieldPierced,
    blocked,
    shieldAfter: shieldAfterPierce - blocked,
    finalDamage,
    text: blocked > 0
      ? `${pressureText}护盾预计吸收 ${blocked} 点，最终生命值伤害 ${finalDamage}。`
      : `${pressureText}预计造成 ${finalDamage} 点生命值伤害。`
  };
}

export function makeAttackIntentPreview(attacker, { targetCount = 0, canDirectAttack = false } = {}) {
  if (!attacker) return null;
  const targetSummary = [
    targetCount > 0 ? `${targetCount} 个怪兽` : "",
    canDirectAttack ? "对方玩家" : ""
  ].filter(Boolean).join(" / ") || "暂无合法目标";
  return {
    mode: "intent",
    badge: "攻击就绪",
    tone: "intent",
    rows: [
      { label: "攻击方", value: `${attacker.name} / 攻击 ${totalAtk(attacker)}` },
      { label: "合法目标", value: targetSummary }
    ],
    result: targetCount > 0
      ? "锁定高亮目标后显示准确结算。"
      : canDirectAttack
        ? "对方场上没有可阻挡的怪兽，可以直接攻击玩家。"
        : "当前没有可执行的攻击目标。"
  };
}

export function makeBattlePreview(attacker, target, owner = null, rival = null) {
  if (!attacker) return null;
  const attack = totalAtk(attacker);
  const rows = [
    { label: "攻击方", value: `${attacker.name} / 攻击 ${attack}` }
  ];
  if (!target) {
    const shield = shieldPreview(attack, rival?.shield || 0, attacker);
    rows.push(
      { label: "目标", value: "对方玩家 / 直接伤害" },
      { label: "结算", value: shield.text }
    );
    return {
      mode: "direct",
      badge: "直击",
      tone: "",
      rows,
      result: `${attacker.name} 将直接攻击玩家。${shield.blocked > 0 ? "护盾会先吸收伤害。" : ""}`
    };
  }
  const targetMode = target.mode === "defense" ? "守备" : "攻击";
  const targetValue = battleValue(target);
  const diff = attack - targetValue;
  const compare = {
    attackerLabel: "我方 ATK",
    attackerValue: attack,
    targetLabel: `目标 ${targetMode}`,
    targetValue,
    diff
  };
  rows.push(
    { label: "目标", value: `${target.name} / ${targetMode} ${targetValue}` },
    { label: "差值", value: diff > 0 ? `+${diff}` : `${diff}` }
  );
  if (diff > 0) {
    const piercesDefense = target.mode === "defense" && hasPiercingDamage(attacker);
    const rawDamage = piercesDefense || target.mode !== "defense" ? diff : 0;
    const shield = shieldPreview(rawDamage, rival?.shield || 0, attacker);
    if (shield.blocked > 0) {
      rows.push({ label: "护盾", value: `吸收 ${shield.blocked} / 实伤 ${shield.finalDamage}` });
    }
    if (shield.shieldPierced > 0) {
      rows.push({ label: "威压", value: `消解护盾 ${shield.shieldPierced}` });
    }
    return {
      badge: piercesDefense ? "贯穿" : target.mode === "defense" ? "破防" : "优势",
      mode: "target",
      compare,
      tone: target.mode === "defense" ? "guard" : "advantage",
      rows,
      result: piercesDefense
        ? `目标会被击破；神格贯穿会造成差值伤害。${shield.text}`
        : target.mode === "defense"
        ? "目标会被击破；守备表示不造成生命值伤害。"
        : `目标会被击破；${shield.text}`
    };
  }
  if (diff < 0) {
    const shield = shieldPreview(Math.abs(diff), owner?.shield || 0, target);
    if (shield.blocked > 0) {
      rows.push({ label: "护盾", value: `吸收 ${shield.blocked} / 实伤 ${shield.finalDamage}` });
    }
    if (shield.shieldPierced > 0) {
      rows.push({ label: "威压", value: `消解护盾 ${shield.shieldPierced}` });
    }
    if (target.mode === "defense") {
      return {
        badge: "守备反击",
        mode: "target",
        compare,
        tone: "guard",
        rows,
        result: `攻击方承受守备力差值伤害；${shield.text}双方怪兽保留，目标会产生战斗损耗。`
      };
    }
    return {
      badge: "受反击",
      mode: "target",
      compare,
      tone: "danger",
      rows,
      result: `攻击方会被破坏；${shield.text}目标会产生战斗损耗。`
    };
  }
  if (target.mode === "defense") {
    return {
      badge: "防御",
      mode: "target",
      compare,
      tone: "guard",
      rows,
      result: "守备怪兽挡下攻击，双方怪兽保留。"
    };
  }
  return {
    badge: "相杀",
    mode: "target",
    compare,
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
  if (mode === "ownGraveCard") return `请选择我方墓地中的 1 张非本卡卡牌作为「${cardName}」的目标。`;
  if (mode === "ownMonster") return `请选择我方怪兽作为「${cardName}」的目标。`;
  if (mode === "enemyMonster") return `请选择敌方怪兽作为「${cardName}」的目标。`;
  if (mode === "enemySpellTrap") return `请选择敌方魔陷区的卡作为「${cardName}」的目标。`;
  return `请选择「${cardName}」的目标。`;
}

export function validateSpellTargetRule(pending, duelist, target) {
  if (!canEffectTargetCard(pending?.sourceCard, target, {
    sourceOwner: pending?.sourceOwner || "player",
    targetOwner: duelist?.owner || ""
  })) {
    return { ok: false, reason: `${target.name} 拥有神格目标抗性，不能成为对手效果的指定目标。` };
  }
  if (pending?.targetRule === "strongest") {
    const monsters = fieldCards(duelist).filter((card) => canEffectTargetCard(pending?.sourceCard, card, {
      sourceOwner: pending?.sourceOwner || "player",
      targetOwner: duelist?.owner || ""
    }));
    if (!monsters.length) {
      return { ok: false, reason: `${pending.cardName} 没有可指定的合法目标。` };
    }
    const maxAtk = Math.max(...monsters.map(totalAtk));
    if (totalAtk(target) !== maxAtk) {
      const scope = pending.mode === "enemyMonster" ? "敌方" : "我方";
      const bestNames = monsters.filter((card) => totalAtk(card) === maxAtk).map((card) => card.name).join("、");
      return { ok: false, reason: `${pending.cardName}只能选择${scope}攻击力最高的怪兽：${bestNames}。` };
    }
  }
  if (pending?.targetRule === "notSource") {
    const sourceUid = pending?.sourceCard?.uid || pending?.sourceCard?.engineId || pending?.sourceCard?.id || "";
    const targetUid = target?.uid || target?.engineId || target?.id || "";
    if (sourceUid && sourceUid === targetUid) {
      return { ok: false, reason: `${pending.cardName} 不能选择自身作为目标。` };
    }
  }
  return { ok: true };
}
