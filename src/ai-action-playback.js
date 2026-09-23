// Presentation only: the caller owns rule resolution and real response windows.
export function aiActionDuration(action) {
  if (action.revealKind === "trap" || action.revealKind === "monster-effect") return 2200;
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
      onProgress(Math.min(1, elapsed / active.duration), paused);
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
    onProgress(0, isPaused());
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
  for (const event of events) {
    let text = "";
    let badge = "";
    if (event.type === "CARDS_DRAWN" && event.count > 0) {
      text = `${side(event.playerId)}抽 ${event.count} 张卡`; badge = `抽卡 +${event.count}`;
    } else if (event.type === "DAMAGE_DEALT" && event.amount > 0) {
      text = `${side(event.playerId)} LP −${event.amount}`; badge = `−${event.amount} LP`;
    } else if (event.type === "LP_HEALED" && event.amount > 0) {
      text = `${side(event.playerId)} LP +${event.amount}`; badge = `+${event.amount} LP`;
    } else if (event.type === "STAT_MODIFIED" && event.amount) {
      badge = `${["def", "tempDef"].includes(event.stat) ? "DEF" : "ATK"} ${event.amount > 0 ? "+" : "−"}${Math.abs(event.amount)}`;
      text = `${label(event.cardId)} ${badge}`;
    } else if (event.type === "CARD_DESTROYED") {
      text = `${label(event.cardId)} 被破坏`; badge = "被破坏";
    } else if (event.type === "MONSTER_SUMMONED") {
      text = `${label(event.cardId)} ${["normal", "tribute"].includes(event.summonType) ? "登场" : "特殊召唤"}`; badge = "登场";
    } else if (event.type === "CARD_MOVED" && event.from?.zone === "grave") {
      if (event.to?.zone === "monsterZone") { text = `${label(event.cardId)} 从墓地回场`; badge = "回场"; }
      if (event.to?.zone === "deck") { text = `${label(event.cardId)} 回到卡组顶`; badge = "回收"; }
    } else if (event.type === "EFFECT_NEGATED" || event.type === "CHAIN_LINK_NEGATED") {
      text = "连锁中的效果被无效"; badge = "无效";
    } else if (event.type === "ABILITY_GRANTED") {
      const ability = { directAttack: "直接攻击", extraSummon: "额外召唤", attackReset: "追加攻击" }[event.ability];
      if (ability) { text = `${side(event.playerId)}获得 ${event.uses || 1} 次${ability}`; badge = ability; }
    }
    if (text && !entries.some((entry) => entry.text === text && entry.cardId === (event.cardId || event.targetCardId || null))) {
      const movement = events.find((candidate) => candidate.type === "CARD_MOVED" && candidate.cardId === event.cardId);
      entries.push({ text, badge, cardId: event.cardId || event.targetCardId || null, playerId: event.playerId || null, from: event.from || movement?.from || null });
    }
  }
  return entries;
}

export function aiActionSummary(entries = []) {
  const grouped = new Map();
  for (const entry of entries) grouped.set(entry.text, (grouped.get(entry.text) || 0) + 1);
  return [...grouped].map(([text, count]) => count > 1 ? `${text} ×${count}` : text).join("；");
}
