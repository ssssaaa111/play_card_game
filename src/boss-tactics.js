const TRIO_GOD_IDS = new Set([
  "trio-sun-judicator",
  "trio-moon-warden",
  "trio-star-herald"
]);

const PHASE_PRIORITIES = {
  1: ["guard-backrow", "fortify-gods", "rebuild-tributes"],
  2: ["rebuild-tributes", "fortify-gods", "guard-backrow"],
  3: ["rush-finale", "fortify-gods", "guard-backrow", "rebuild-tributes"]
};

const FINALE_RUSH_LIFE = 2800;

function latestPlayerTurnEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const turnStartIndex = list.findLastIndex((event) =>
    event?.type === "TURN_STARTED" && event.playerId === "player"
  );
  return turnStartIndex >= 0 ? list.slice(turnStartIndex + 1) : list;
}

function resolvedCard(resolveCard, cardId) {
  if (!cardId || typeof resolveCard !== "function") return null;
  return resolveCard(cardId) || null;
}

function trioCardId(resolveCard, cardId) {
  const card = resolvedCard(resolveCard, cardId);
  return TRIO_GOD_IDS.has(card?.id) ? card.id : "";
}

export function trioBossPhase({ events = [], resolveCard = null, phase = null } = {}) {
  const explicitPhase = Number(phase);
  if (phase != null && Number.isInteger(explicitPhase)) {
    return Math.min(3, Math.max(1, explicitPhase));
  }
  const summonedGods = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "MONSTER_SUMMONED" || event.playerId !== "ai" || event.summonType !== "tribute") {
      continue;
    }
    const godId = trioCardId(resolveCard, event.cardId);
    if (godId) summonedGods.add(godId);
  }
  return Math.min(3, summonedGods.size + 1);
}

function planPriority(plan, phase) {
  const index = (PHASE_PRIORITIES[phase] || PHASE_PRIORITIES[1]).indexOf(plan.id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function rushFinalePlan({ phase, player, ai }) {
  if (phase !== 3 || !player || !ai) return null;
  const playerLp = Math.max(0, Number(player.lp) || 0);
  const effectiveLife = playerLp + Math.max(0, Number(player.shield) || 0);
  const hasAttacker = (ai.field || []).some((card) =>
    card?.type === "monster" && card.mode !== "defense"
  );
  if (playerLp <= 0 || effectiveLife > FINALE_RUSH_LIFE || !hasAttacker) return null;
  return {
    id: "rush-finale",
    eventId: "phase-3-low-life",
    turnGoal: "finishPressure",
    label: "抢攻终结",
    text: "你的有效生命已进入终战压力线；对手将优先投入强化、贯穿与再攻。",
    counterHint: "先抬高护盾或封住可攻击神格，再考虑继续展开。"
  };
}

export function trioBossCounterPlan({
  events = [],
  resolveCard = null,
  phase = null,
  player = null,
  ai = null
} = {}) {
  const bossPhase = trioBossPhase({ events, resolveCard, phase });
  const playerTurnEvents = latestPlayerTurnEvents(events);
  const candidates = [];
  for (let index = playerTurnEvents.length - 1; index >= 0; index -= 1) {
    const event = playerTurnEvents[index];
    if (event?.type === "TRAP_SET" && event.playerId === "player" &&
        !candidates.some((plan) => plan.id === "guard-backrow")) {
      candidates.push({
        id: "guard-backrow",
        eventId: event.id,
        targetCardId: event.cardId,
        turnGoal: "guardBackrow",
        label: "后场戒备",
        text: "你刚建立新的反制卡位；对手将优先布置断链保护，并锁定这张最新盖牌。",
        counterHint: "先用低价值陷阱逼出断链，再投入真正的关键反制。"
      });
    }
    if (event?.type === "ATTACK_DECLARED" && event.playerId === "player" &&
        !candidates.some((plan) => plan.id === "fortify-gods")) {
      const target = resolvedCard(resolveCard, event.targetCardId);
      if (TRIO_GOD_IDS.has(target?.id)) {
        candidates.push({
          id: "fortify-gods",
          eventId: event.id,
          turnGoal: "protectGods",
          label: "神体守护",
          text: "你直接挑战三曜神体；对手将优先转守高防神格。",
          counterHint: "转去切断普通祭品，或先用效果逼神格离开守备。"
        });
      }
    }
    if (event?.type === "CARD_DESTROYED" && event.playerId === "ai" &&
        !candidates.some((plan) => plan.id === "rebuild-tributes")) {
      const destroyed = resolvedCard(resolveCard, event.cardId);
      if (destroyed?.type === "monster" && !TRIO_GOD_IDS.has(destroyed.id)) {
        candidates.push({
          id: "rebuild-tributes",
          eventId: event.id,
          turnGoal: "buildTributes",
          label: "祭品重建",
          text: "你切断了祭品；对手将优先补充公开祭品候选。",
          counterHint: "继续清理衍生物和普通怪兽，别让公开祭品重新凑到三只。"
        });
      }
    }
  }
  const rushPlan = rushFinalePlan({ phase: bossPhase, player, ai });
  if (rushPlan) candidates.push(rushPlan);
  const selected = candidates.sort((left, right) =>
    planPriority(left, bossPhase) - planPriority(right, bossPhase)
  )[0];
  return selected ? { ...selected, phase: bossPhase } : null;
}
