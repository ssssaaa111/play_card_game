export const STARTING_LP = 4000;
export const TRIO_COMEBACK_LP_THRESHOLD = 2200;
export const MONSTER_ZONE_SIZE = 5;
export const SPELL_TRAP_ZONE_SIZE = 5;
export const FIELD_SIZE = MONSTER_ZONE_SIZE;

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

export function battlePreviewText(attacker, target, owner = null, rival = null) {
  if (!attacker) return "还没有选择攻击怪兽。";
  if (!target) {
    return `${attacker.name} 直接攻击，预计造成 ${totalAtk(attacker)} 点伤害。`;
  }
  const attackerStat = `攻击 ${totalAtk(attacker)}`;
  const targetStat = target.mode === "defense" ? `守备 ${totalDef(target)}` : `攻击 ${totalAtk(target)}`;
  const diff = totalAtk(attacker) - battleValue(target);
  if (diff > 0) {
    if (target.mode === "defense" && hasPiercingDamage(attacker)) {
      return `${attacker.name} ${attackerStat} 对 ${target.name} ${targetStat}，可击破并贯穿造成 ${diff} 点伤害。`;
    }
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
    rows.push(
      { label: "目标", value: "对方玩家 / 直接伤害" },
      { label: "结算", value: `预计造成 ${attack} 点生命值伤害。` }
    );
    return {
      mode: "direct",
      badge: "直击",
      tone: "",
      rows,
      result: `${attacker.name} 将直接攻击玩家。`
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
    if (rawDamage > 0) rows.push({ label: "生命伤害", value: String(rawDamage) });
    return {
      badge: piercesDefense ? "贯穿" : target.mode === "defense" ? "破防" : "优势",
      mode: "target",
      compare,
      tone: target.mode === "defense" ? "guard" : "advantage",
      rows,
      result: piercesDefense
        ? `目标会被击破；神格贯穿会造成 ${rawDamage} 点差值伤害。`
        : target.mode === "defense"
        ? "目标会被击破；守备表示不造成生命值伤害。"
        : `目标会被击破；预计造成 ${rawDamage} 点生命值伤害。`
    };
  }
  if (diff < 0) {
    rows.push({ label: "生命伤害", value: String(Math.abs(diff)) });
    if (target.mode === "defense") {
      return {
        badge: "守备反击",
        mode: "target",
        compare,
        tone: "guard",
        rows,
        result: `攻击方承受 ${Math.abs(diff)} 点守备力差值伤害；双方怪兽保留，目标会产生战斗损耗。`
      };
    }
    return {
      badge: "受反击",
      mode: "target",
      compare,
      tone: "danger",
      rows,
      result: `攻击方会被破坏并承受 ${Math.abs(diff)} 点生命值伤害；目标会产生战斗损耗。`
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
