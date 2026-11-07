import { totalAtk, totalDef } from "./rules.js";

const phases = { draw: "抽卡阶段", main: "主要阶段", battle: "战斗阶段", end: "结束阶段" };
export const spectatorName = (view, id) => view?.seats?.find((seat) => seat.seatId === id)?.name || id || "玩家";

export function spectatorClock(timer, now = Date.now()) {
  if (!timer) return "";
  const remaining = timer.paused ? timer.remainingMs : timer.deadlineAt - now;
  const seconds = Math.max(0, Math.ceil((Number(remaining) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${timer.paused ? "（暂停）" : ""}`;
}

export function spectatorStatus(view, now = Date.now()) {
  if (!view || view.status === "waiting") return "等待双方准备";
  if (view.gameOver) return view.gameOver.winnerId ? `${spectatorName(view, view.gameOver.winnerId)}获胜` : "本局平局";
  if (view.seats.some((seat) => !seat.connected)) return "对局暂停 · 等待玩家重连";
  if (view.machine?.responseWindow) return `${spectatorName(view, view.machine.responseWindow.playerId)}响应中 · ${spectatorClock(view.responseTimer, now)}`;
  return `${spectatorName(view, view.turn.playerId)}的回合 · ${phases[view.turn.phase] || "对局中"} · ${spectatorClock(view.turnTimer, now)}`;
}

export function spectatorCard(card) {
  if (!card || card.hidden) return null;
  return { ...card, atkText: totalAtk(card), defText: totalDef(card), modeText: card.type === "monster" ? card.mode === "defense" ? "守备" : "攻击" : card.type === "trap" ? "陷阱" : "魔法" };
}

export function spectatorTimeline(view) {
  const cards = new Map();
  for (const player of Object.values(view?.players || {})) {
    for (const zone of ["monsterZone", "spellTrapZone", "grave", "banished"]) {
      for (const card of player[zone] || []) if (card && !card.hidden) cards.set(card.id, card.name);
    }
  }
  for (const link of view?.machine?.chain || []) if (link.card && !link.card.hidden) cards.set(link.card.id, link.card.name);
  const label = (id) => cards.has(id) ? `《${cards.get(id)}》` : "卡牌";
  return (view?.recentEvents || []).map((event) => {
    const name = spectatorName(view, event.playerId);
    let text;
    switch (event.type) {
      case "MONSTER_SUMMONED": text = `${name}召唤${label(event.cardId)}`; break;
      case "TRAP_SET": text = `${name}盖放 1 张卡牌`; break;
      case "CARD_ACTIVATED": text = `${name}发动${label(event.cardId)}`; break;
      case "CARDS_DRAWN": text = `${name}抽 ${event.count || 1} 张卡`; break;
      case "DAMAGE_DEALT": text = `${name}受到 ${event.amount || 0} 点伤害`; break;
      case "LP_HEALED": text = `${name}回复 ${event.amount || 0} LP`; break;
      case "MONSTER_MODE_CHANGED": text = `${name}切换${label(event.cardId)}为${event.mode === "defense" ? "守备" : "攻击"}表示`; break;
      case "ATTACK_DECLARED": text = `${name}发起攻击`; break;
      case "ATTACK_CANCELED": text = "攻击已取消"; break;
      case "CHAIN_LINK_RESOLVED": text = `CL${event.linkId} ${label(event.cardId)}${event.skipped ? "未生效" : "结算"}`; break;
      case "CHAIN_RESOLVED": text = "连锁结算完成"; break;
      case "TURN_STARTED": text = `${name}开始回合`; break;
      case "PHASE_CHANGED": text = `${name}进入${phases[event.to || event.phase] || "下一阶段"}`; break;
      case "GAME_OVER": text = event.winnerId ? `${spectatorName(view, event.winnerId)}获胜` : "本局结束"; break;
      default: return null;
    }
    return { id: event.id, text };
  }).filter(Boolean).reverse();
}
