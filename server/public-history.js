// An append-only, public text record, separate from private engine snapshots.
// Entries are frozen when an action commits: later reveals cannot rewrite old draws/sets.
const seats = new Set(["p1", "p2"]);
const phases = { draw: "抽卡阶段", main: "主要阶段", battle: "战斗阶段", end: "结束阶段" };
const number = (value) => Math.max(0, Number(value) || 0);
export function newPublicHistory(duelNumber, players, state, { partial = false } = {}) {
  const turn = partial ? 1 + (state.events || []).filter((event) => event.type === "TURN_STARTED").length : 1;
  return { duelNumber, players: ["p1", "p2"].map((seatId) => ({ seatId, name: players.find((seat) => seat.seatId === seatId)?.name || `玩家 ${seatId}` })), partial,
    processedEvents: partial ? state.events.length : 0, turn, finished: false,
    entries: [{ seq: 1, turn, type: "DUEL_STARTED", actor: null, text: partial
      ? "旧房间升级前未记录公开战报；以下从升级后开始记录。" : "本局开始 · 双方起始手牌和牌序不公开。" }] };
}

export function appendPublicHistory(history, state) {
  const events = (state.events || []).slice(history.processedEvents);
  const visible = new Set();
  for (const owner of Object.values(state.players)) {
    for (const zone of ["monsterZone", "grave", "banished"]) for (const id of owner[zone] || []) visible.add(id);
    for (const id of owner.spellTrapZone || []) if (state.cards[id]?.type === "spell") visible.add(id);
  }
  // These events explicitly announce the card. Never infer visibility from a hand,
  // an uncommitted chain link, a response candidate, or a future event.
  for (const link of state.machine?.chain || []) if (link.committed) visible.add(link.cardId);
  const name = (id) => history.players.find((seat) => seat.seatId === id)?.name || "玩家";
  const card = (id) => visible.has(id) && state.cards[id] ? `《${state.cards[id].name}》` : "卡牌";
  for (const event of events) {
    if (event.type === "CARD_MOVED" && (["monsterZone", "grave", "banished"].includes(event.from?.zone)
      || (event.from?.zone === "spellTrapZone" && state.cards[event.cardId]?.type === "spell"))) visible.add(event.cardId);
    if (["CARD_ACTIVATED", "MONSTER_SUMMONED", "FUSION_SUMMONED", "CHAIN_LINK_COMMITTED"].includes(event.type)) visible.add(event.cardId);
    const actor = seats.has(event.playerId) ? event.playerId : null;
    const who = name(actor);
    let text;
    switch (event.type) {
      case "TURN_STARTED": history.turn += 1; text = `${who}开始回合`; break;
      case "TURN_ENDED": text = `${who}结束回合${event.endedBy === "timeout" ? "（回合超时）" : ""}`; break;
      case "PHASE_CHANGED": text = `${who}进入${phases[event.to || event.phase] || "下一阶段"}`; break;
      case "CARDS_DRAWN": text = `${who}抽 ${number(event.count || event.cardIds?.length || 1)} 张卡（身份隐藏）`; break;
      case "TRAP_SET": text = `${who}盖放 1 张卡（身份未公开）`; break;
      case "MONSTER_SUMMONED": text = `${who}召唤${card(event.cardId)}`; break;
      case "FUSION_SUMMONED": text = `${who}融合召唤${card(event.cardId)}`; break;
      case "CARD_TRIBUTED": text = `${who}以${card(event.cardId)}作为祭品`; break;
      case "CARD_ACTIVATED":
        if (events.some((later) => ["MONSTER_SUMMONED", "FUSION_SUMMONED"].includes(later.type) && later.cardId === event.cardId)) continue;
        text = `${who}发动${card(event.cardId)}${state.cards[event.cardId]?.type === "monster" ? "的效果" : ""}`; break;
      case "MONSTER_MODE_CHANGED": text = `${who}将${card(event.cardId)}切换为${event.mode === "defense" ? "守备" : "攻击"}表示`; break;
      case "ATTACK_DECLARED": text = `${who}用${card(event.attackerCardId)}攻击${event.targetCardId ? card(event.targetCardId) : "对手玩家"}`; break;
      case "ATTACK_CANCELED": text = "本次攻击已取消"; break;
      case "ATTACK_TARGET_CHANGED": text = "攻击目标已改变"; break;
      case "DAMAGE_DEALT": text = `${who}受到 ${number(event.amount)} 点伤害`; break;
      case "LP_HEALED": text = `${who}回复 ${number(event.amount)} LP`; break;
      case "CARD_DESTROYED": text = `${card(event.cardId)}被破坏`; break;
      case "CARD_MOVED": {
        const zone = { grave: "墓地", banished: "除外区", hand: "手牌", deck: "牌库（牌序不公开）" }[event.to?.zone];
        if (!zone || !visible.has(event.cardId) || events.some((other) => ["CARD_DESTROYED", "CARD_TRIBUTED"].includes(other.type) && other.cardId === event.cardId)) continue;
        text = `${card(event.cardId)}移至${zone}`; break;
      }
      case "STAT_MODIFIED": {
        if (!visible.has(event.cardId) || !["atk", "def", "tempAtk", "tempDef"].includes(event.stat)) continue;
        const amount = Number(event.amount) || 0;
        text = `${card(event.cardId)}的${["atk", "tempAtk"].includes(event.stat) ? "ATK" : "DEF"}修正 ${amount >= 0 ? "+" : ""}${amount}`; break;
      }
      case "BATTLE_RESOLVED": text = `战斗结算 · ATK ${number(event.outcome?.attack ?? event.attackerAtk)} / 对方${event.outcome?.targetValue == null ? "数值" : "攻防"} ${number(event.outcome?.targetValue ?? event.targetValue)} · 伤害 ${number(event.outcome?.finalDamage)}`; break;
      case "CHAIN_LINK_COMMITTED": text = `CL${number(event.linkId)} · ${who}加入${card(event.cardId)}`; break;
      case "CHAIN_LINK_RESOLVED": text = `CL${number(event.linkId)} · ${card(event.cardId)}${event.skipped ? "未生效" : "结算"}`; break;
      case "CHAIN_RESOLVED": text = "连锁结算完成"; break;
      case "GAME_OVER_DECLARED": text = state.gameOver?.winnerId ? `${name(state.gameOver.winnerId)}获胜` : "本局平局"; break;
      default: continue;
    }
    history.entries.push({ seq: history.entries.length + 1, turn: history.turn, type: event.type, actor, text });
  }
  history.processedEvents = state.events.length;
  history.finished = Boolean(state.gameOver);
  history.lp = { p1: number(state.players.p1?.lp), p2: number(state.players.p2?.lp) };
}

export function historyPage(history, { page = 0, turn = 0, through = null } = {}) {
  for (const value of [page, turn, through ?? 0]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_HISTORY_QUERY");
  const total = through == null ? history.entries.length : Math.min(through, history.entries.length);
  const all = history.entries.slice(0, total);
  const turns = [...new Set(all.map((entry) => entry.turn))];
  const filtered = turn ? all.filter((entry) => entry.turn === turn) : all;
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages - 1);
  return structuredClone({ version: 1, duelNumber: history.duelNumber, players: history.players,
    partial: history.partial, finished: history.finished, lp: history.lp, total, turns, filteredTotal: filtered.length,
    page: current, pages, pageSize: 50, entries: filtered.slice(current * 50, (current + 1) * 50) });
}

export function restorePublicHistories(saved, currentDuelNumber) {
  if (!Array.isArray(saved)) throw new Error("INVALID_PUBLIC_HISTORY");
  const seen = new Set();
  return saved.map((game) => {
    if (!Number.isSafeInteger(game.duelNumber) || game.duelNumber < 1 || game.duelNumber > currentDuelNumber || seen.has(game.duelNumber)
      || !Number.isSafeInteger(game.processedEvents) || game.processedEvents < 0 || !Number.isSafeInteger(game.turn) || game.turn < 1
      || typeof game.partial !== "boolean" || typeof game.finished !== "boolean" || !Array.isArray(game.entries) || !game.entries.length
      || !Array.isArray(game.players) || game.players.length !== 2 || game.players.map((seat) => seat.seatId).sort().join() !== "p1,p2") throw new Error("INVALID_PUBLIC_HISTORY");
    seen.add(game.duelNumber);
    return { duelNumber: game.duelNumber, processedEvents: game.processedEvents, turn: game.turn, partial: game.partial, finished: game.finished,
      lp: { p1: number(game.lp?.p1), p2: number(game.lp?.p2) },
      players: game.players.map(({ seatId, name }) => {
        if (typeof name !== "string" || !name.length || name.length > 24) throw new Error("INVALID_PUBLIC_HISTORY");
        return { seatId, name };
      }), entries: game.entries.map((entry, index) => {
        if (entry.seq !== index + 1 || !Number.isSafeInteger(entry.turn) || entry.turn < 1 || entry.turn > game.turn
          || !(entry.actor === null || seats.has(entry.actor)) || typeof entry.type !== "string" || !/^[A-Z_]{1,50}$/.test(entry.type)
          || typeof entry.text !== "string" || entry.text.length > 1000) throw new Error("INVALID_PUBLIC_HISTORY");
        return { seq: entry.seq, turn: entry.turn, actor: entry.actor, type: entry.type, text: entry.text };
      }) };
  });
}
