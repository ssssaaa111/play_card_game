export function cardStatusText(card, { attacksLocked = false } = {}) {
  if (card.type !== "monster") return "";
  const parts = [];
  if (attacksLocked && !card.used && card.mode !== "defense") parts.push("攻击已跳过");
  if (card.tempAtk > 0) parts.push(`强化+${card.tempAtk}`);
  if (card.tempAtk < 0) parts.push(`弱化${card.tempAtk}`);
  if (card.tempDef > 0) parts.push(`守备+${card.tempDef}`);
  if (card.tempDef < 0) parts.push(`守备${card.tempDef}`);
  if (card.battleWear > 0) parts.push(`损耗-${card.battleWear}`);
  if (card.destructionProtection) parts.push(card.destructionProtectionUsed ? "神格守护已用" : "神格守护");
  if (card.used) parts.push("已行动");
  return parts.slice(0, 2).join(" / ");
}

export function cardStateChips(card, { attacksLocked = false, attackReady = false } = {}) {
  if (card.type !== "monster") return [];
  const chips = [];
  if (card.mode === "defense") chips.push({ label: "守备", tone: "defense" });
  else if (attacksLocked && !card.used) chips.push({ label: "攻击锁定", tone: "locked" });
  else if (card.used) chips.push({ label: "已行动", tone: "spent" });
  else if (attackReady) chips.push({ label: "可攻击", tone: "ready" });
  else chips.push({ label: "待命", tone: "idle" });

  if (card.tempAtk > 0) chips.push({ label: `攻 +${card.tempAtk}`, tone: "buff" });
  else if (card.tempDef > 0) chips.push({ label: `守 +${card.tempDef}`, tone: "buff" });

  if (card.tempAtk < 0) chips.push({ label: `攻 ${card.tempAtk}`, tone: "debuff" });
  else if (card.tempDef < 0) chips.push({ label: `守 ${card.tempDef}`, tone: "debuff" });
  else if (card.battleWear > 0) chips.push({ label: `损 -${card.battleWear}`, tone: "debuff" });

  if (card.destructionProtection) {
    chips.push({
      label: card.destructionProtectionUsed ? "守护已用" : "守护",
      tone: card.destructionProtectionUsed ? "spent" : "guard"
    });
  }
  return chips.slice(0, 3);
}
