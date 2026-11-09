import { getCardEffectDefinition } from "./game-engine.js";

// Only publish authored copy and safe counts, never raw validator messages or IDs.
export function onlineHandBlocker(state, playerId, card, engineReason = "") {
  const player = state.players[playerId];
  const blocked = (code, label, reason) => ({ code, label, reason });
  const phase = state.turn.phase;
  if (phase !== "main" && (card.type === "monster" || phase !== "battle")) {
    return blocked("PHASE", "等待阶段", `${card.type === "monster" ? "通常召唤" : "出牌"}需要在主要阶段进行。`);
  }
  if (/can only be fusion summoned/.test(engineReason)) {
    return blocked("FUSION_ONLY", "需融合召唤", "这只怪兽只能通过融合召唤登场，不能直接通常召唤。");
  }
  if (/is not implemented|Unknown effect/.test(engineReason)) {
    return blocked("UNSUPPORTED_EFFECT", "暂不支持", "当前联机规则尚未实现这张卡的效果，请先使用其他卡牌。");
  }
  const tribute = engineReason.match(/requires exactly (\d+) tribute card/);
  if (tribute) {
    return blocked("TRIBUTE", "祭品不足", `需要 ${tribute[1]} 只怪兽作祭品，当前场上有 ${player.monsterZone.length} 只。`);
  }
  if (/has no normal or extra summon/.test(engineReason)) {
    return blocked("SUMMON_LIMIT", "次数用完", "本回合召唤次数已用完，需等下回合或获得额外召唤次数。");
  }
  if (card.type === "monster" && player.monsterZone.length >= 5) {
    return blocked("MONSTER_ZONE_FULL", "怪兽区已满", "怪兽区已满，需要先腾出一个位置。");
  }
  if ((card.type === "trap" || getCardEffectDefinition(card.effect)?.duration === "continuous") && player.spellTrapZone.length >= 5) {
    return blocked("SUPPORT_ZONE_FULL", "魔陷区已满", "魔陷区已满，需要先腾出一个位置。");
  }
  if (/protected by target resistance/.test(engineReason)) {
    return blocked("TARGET_RESISTANCE", "目标受保护", "场上候选拥有目标抗性，不能被这张卡指定。");
  }
  if (/requires action\.targetCardId|has no legal target/.test(engineReason)) {
    const target = getCardEffectDefinition(card.effect)?.target;
    const side = target?.player === "rival" ? "对手" : "我方";
    const location = target?.zone === "grave" ? `${side}墓地` : `${side}场上`;
    const type = target?.cardType === "monster" || target?.zone === "monsterZone" ? "怪兽" : target?.zone === "spellTrapZone" ? "魔陷卡" : "卡牌";
    return blocked("NO_TARGET", "无合法目标", `${location}没有这张卡能指定的${type}。`);
  }
  const deck = engineReason.match(/requires at least (\d+) cards in deck/);
  if (deck) return blocked("DECK_COUNT", "卡组不足", `卡组至少需要 ${deck[1]} 张卡，当前剩余 ${player.deck.length} 张。`);
  const empty = engineReason.match(/requires at least (\d+) empty monster zone/);
  if (empty) return blocked("MONSTER_SPACE", "空位不足", `需要 ${empty[1]} 个怪兽区空位，当前只有 ${Math.max(0, 5 - player.monsterZone.length)} 个。`);
  if (/requires LP at most/.test(engineReason)) {
    return blocked("LP_REQUIREMENT", "LP未满足", "当前生命值尚未达到这张卡的发动条件。");
  }
  if (/requires at least \d+ (?:distinct elements|(?:fire|wind|light|shadow) monsters)|requires elements/.test(engineReason)) {
    return blocked("ELEMENT_REQUIREMENT", "属性不足", "场上怪兽的属性或数量尚未达到这张卡的发动条件。");
  }
  return blocked("REQUIREMENT", "条件未满足", "当前未满足这张卡的使用条件，可查看详情确认所需目标与资源。");
}
