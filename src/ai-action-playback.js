// Presentation only: the caller owns rule resolution and real response windows.
export const AI_ACTION_STAGES = Object.freeze([
  Object.freeze({ id: "source", label: "来源" }),
  Object.freeze({ id: "target", label: "目标" }),
  Object.freeze({ id: "resolve", label: "结算" }),
  Object.freeze({ id: "result", label: "结果" })
]);

export function aiActionStageAt(progress = 0) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  const index = value < 0.24 ? 0 : value < 0.48 ? 1 : value < 0.72 ? 2 : 3;
  return { ...AI_ACTION_STAGES[index], index, total: AI_ACTION_STAGES.length };
}

export function aiActionStageSummary(action = {}, stage = aiActionStageAt(1)) {
  if (stage.id === "source") return `${action.name || "公开卡牌"}成为本次行动来源`;
  if (stage.id === "target") {
    const targets = [...new Set((action.consequences || []).map((entry) => entry.targetLabel).filter(Boolean))];
    return targets.length ? `作用目标：${targets.slice(0, 3).join("、")}` : "确认本次行动的作用范围";
  }
  if (stage.id === "resolve") return "规则效果正在结算…";
  return action.summary || "行动已经结算";
}

export function aiAttackResolutionEvents(events = []) {
  const afterAttackResultIds = new Set(
    events
      .filter((event) => event.type === "AFTER_ATTACK_EFFECT_RESOLVED")
      .flatMap((event) => Array.isArray(event.resultEventIds) ? event.resultEventIds : [])
      .map((id) => String(id))
  );
  return events.filter((event) =>
    event.type !== "AFTER_ATTACK_EFFECT_RESOLVED"
    && !afterAttackResultIds.has(String(event.id))
  );
}

export function aiActionDuration(action) {
  if (action.revealKind === "trap" || action.revealKind === "monster-effect") return 2200;
  if (action.revealKind === "attack") return action.card?.stars >= 5 ? 1800 : 1500;
  if (action.card?.stars >= 5) return 2100;
  return 1600;
}

export function createAiActionPlayback({
  now = () => performance.now(),
  requestFrame = (fn) => requestAnimationFrame(fn),
  cancelFrame = (id) => cancelAnimationFrame(id),
  isPaused = () => false,
  durationFor = aiActionDuration,
  onChange = () => {},
  onProgress = () => {}
} = {}) {
  let queue = [];
  let active = null;
  let history = [];
  let frame = null;
  let lastTime = 0;
  let elapsed = 0;
  let sequence = 0;
  let generation = 0;
  let index = 0;
  let total = 0;

  function snapshot() {
    return { action: active?.action || null, history: [...history], index, total };
  }
  function publish() { onChange(snapshot()); }
  function schedule() {
    const run = generation;
    frame = requestFrame(() => {
      if (run !== generation) return;
      frame = null;
      if (!active) return;
      const time = now();
      const paused = isPaused();
      // A suspended tab must not consume a whole reveal on its first frame back.
      if (!paused) elapsed += Math.min(100, Math.max(0, time - lastTime));
      lastTime = time;
      onProgress(Math.min(1, elapsed / active.duration), paused, active.action);
      if (!paused && elapsed >= active.duration) finish();
      else schedule();
    });
  }
  function next() {
    if (active || !queue.length) return;
    active = queue.shift();
    index++;
    elapsed = 0;
    lastTime = now();
    history = [active.action, ...history].slice(0, 3);
    publish();
    onProgress(0, isPaused(), active.action);
    schedule();
  }
  function finish() {
    if (!active) return false;
    generation++;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    const completed = active;
    active = null;
    if (!queue.length) index = total = 0;
    publish();
    completed.resolve(true);
    next();
    return true;
  }
  return {
    enqueue(action) {
      return new Promise((resolve) => {
        const entry = { ...action, sequence: ++sequence };
        total++;
        queue.push({ action: entry, duration: durationFor(entry), resolve });
        if (active) publish();
        else next();
      });
    },
    skip() { return !isPaused() && finish(); },
    reset() {
      generation++;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      const cancelled = [...(active ? [active] : []), ...queue];
      active = null;
      queue = [];
      history = [];
      index = total = 0;
      publish();
      cancelled.forEach((entry) => entry.resolve(false));
    },
    snapshot
  };
}

// Only describe public consequences. Draws deliberately expose counts, never IDs.
export function aiActionConsequences(events = [], { findCard = () => null } = {}) {
  const entries = [];
  const label = (id) => findCard(id)?.card?.name || "目标卡牌";
  const side = (id) => id === "player" ? "你" : "对手";
  const battleLabels = {
    direct: "直接命中", attackWin: "击破", breakDefense: "破防",
    pierceDefense: "贯穿", countered: "遭到反击", guardCounter: "守备反击",
    guardHold: "攻击被挡下", clash: "同归于尽"
  };
  for (const event of events) {
    let text = "";
    let badge = "";
    let targetLabel = "";
    if (event.type === "CARDS_DRAWN" && event.count > 0) {
      targetLabel = side(event.playerId);
      text = `${targetLabel}抽 ${event.count} 张卡`; badge = `抽卡 +${event.count}`;
    } else if (event.type === "DAMAGE_DEALT" && event.amount > 0) {
      targetLabel = side(event.playerId);
      text = `${targetLabel} LP −${event.amount}`; badge = `−${event.amount} LP`;
    } else if (event.type === "LP_HEALED" && event.amount > 0) {
      targetLabel = side(event.playerId);
      text = `${targetLabel} LP +${event.amount}`; badge = `+${event.amount} LP`;
    } else if (event.type === "STAT_MODIFIED" && event.amount) {
      targetLabel = label(event.cardId);
      badge = `${["def", "tempDef"].includes(event.stat) ? "DEF" : "ATK"} ${event.amount > 0 ? "+" : "−"}${Math.abs(event.amount)}`;
      text = `${targetLabel} ${badge}`;
    } else if (event.type === "CARD_DESTROYED") {
      targetLabel = label(event.cardId);
      text = `${targetLabel} 被破坏`; badge = "被破坏";
    } else if (event.type === "MONSTER_SUMMONED") {
      targetLabel = label(event.cardId);
      text = `${targetLabel} ${["normal", "tribute"].includes(event.summonType) ? "登场" : "特殊召唤"}`; badge = "登场";
    } else if (event.type === "CARD_MOVED" && event.from?.zone === "grave") {
      targetLabel = label(event.cardId);
      if (event.to?.zone === "monsterZone") { text = `${targetLabel} 从墓地回场`; badge = "回场"; }
      if (event.to?.zone === "deck") { text = `${targetLabel} 回到卡组顶`; badge = "回收"; }
    } else if (event.type === "EFFECT_NEGATED" || event.type === "CHAIN_LINK_NEGATED") {
      text = "连锁中的效果被无效"; badge = "无效";
    } else if (event.type === "ABILITY_GRANTED") {
      const ability = { directAttack: "直接攻击", extraSummon: "额外召唤", attackReset: "追加攻击" }[event.ability];
      targetLabel = side(event.playerId);
      if (ability) { text = `${targetLabel}获得 ${event.uses || 1} 次${ability}`; badge = ability; }
    } else if (event.type === "BATTLE_RESOLVED") {
      targetLabel = event.targetCardId ? label(event.targetCardId) : side(event.rivalId);
      badge = battleLabels[event.outcome?.kind] || "战斗结算";
      text = event.direct ? `直接攻击：${badge}` : `${targetLabel}：${badge}`;
    }
    if (text && !entries.some((entry) => entry.text === text && entry.cardId === (event.cardId || event.targetCardId || null))) {
      const movement = events.find((candidate) => candidate.type === "CARD_MOVED" && candidate.cardId === event.cardId);
      entries.push({ text, badge, targetLabel, cardId: event.cardId || event.targetCardId || null, playerId: event.playerId || event.rivalId || null, from: event.from || movement?.from || null });
    }
  }
  return entries;
}

export function aiActionSummary(entries = []) {
  const grouped = new Map();
  for (const entry of entries) grouped.set(entry.text, (grouped.get(entry.text) || 0) + 1);
  return [...grouped].map(([text, count]) => count > 1 ? `${text} ×${count}` : text).join("；");
}
