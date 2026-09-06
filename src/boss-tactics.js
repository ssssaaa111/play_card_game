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

const TRIO_PHASE_TRANSITIONS = {
  "trio-sun-judicator": {
    phase: 1,
    id: "sun-descended",
    label: "第一神已降临",
    next: "PHASE II · 第二次建设开始",
    epic: "PHASE II"
  },
  "trio-moon-warden": {
    phase: 2,
    id: "moon-descended",
    label: "第二神已降临",
    next: "PHASE III · 最终神窗口开启",
    epic: "PHASE III"
  },
  "trio-star-herald": {
    phase: 3,
    id: "star-descended",
    label: "最终神已降临",
    next: "三次独立降神完成，终战开始",
    epic: "终战开始"
  }
};

const TRIBUTE_KIND_LABELS = {
  normal: "普通怪兽",
  token: "衍生物",
  fusion: "融合怪兽"
};

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

function publicEventCard(events, resolveCard, event = {}) {
  const direct = resolvedCard(resolveCard, event.cardId) ||
    resolvedCard(resolveCard, event.cardTemplateId);
  if (direct) return direct;
  const created = [...events].reverse().find((candidate) =>
    candidate?.type === "CARD_CREATED" && candidate.cardId === event.cardId
  );
  return created?.card || resolvedCard(resolveCard, created?.templateId) || null;
}

function publicTemplateId(card, event = {}) {
  return event.cardTemplateId || card?.templateId || card?.id || "";
}

function tributeKind(card, event = {}) {
  if (TRIBUTE_KIND_LABELS[event.tributeKind]) return event.tributeKind;
  if (card?.token || card?.isToken) return "token";
  if (card?.summonRoute === "fusion") return "fusion";
  return "normal";
}

function tributeSourceNames(sources) {
  const grouped = new Map();
  sources.forEach((source) => {
    const key = source.cardId || source.name;
    const current = grouped.get(key) || { ...source, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  });
  return [...grouped.values()]
    .map((source) => `「${source.name}」${source.count > 1 ? ` ×${source.count}` : ""}`)
    .join("、");
}

function tributeKindSummary(sources) {
  const counts = Object.fromEntries(Object.keys(TRIBUTE_KIND_LABELS).map((kind) => [kind, 0]));
  sources.forEach((source) => { counts[source.kind] += 1; });
  return Object.entries(TRIBUTE_KIND_LABELS)
    .filter(([kind]) => counts[kind] > 0)
    .map(([kind, label]) => `${label} ×${counts[kind]}`)
    .join(" · ");
}

export function trioBossPhaseTransitions({ events = [], resolveCard = null } = {}) {
  const list = Array.isArray(events) ? events : [];
  const transitions = [];
  const seenGods = new Set();
  for (const [eventIndex, event] of list.entries()) {
    if (event?.type !== "MONSTER_SUMMONED" || event.playerId !== "ai" || event.summonType !== "tribute") {
      continue;
    }
    const god = publicEventCard(list, resolveCard, event);
    const godId = publicTemplateId(god, event);
    const transition = TRIO_PHASE_TRANSITIONS[godId];
    if (!transition || seenGods.has(godId)) continue;
    const tributes = list.slice(0, eventIndex)
      .filter((candidate) =>
        candidate?.type === "CARD_TRIBUTED" &&
        candidate.playerId === "ai" &&
        candidate.summonCardId === event.cardId
      )
      .slice(-3)
      .map((tributeEvent) => {
        const card = publicEventCard(list, resolveCard, tributeEvent);
        return {
          cardId: publicTemplateId(card, tributeEvent),
          name: card?.name || "公开祭品",
          kind: tributeKind(card, tributeEvent)
        };
      });
    if (tributes.length !== 3) continue;
    seenGods.add(godId);
    const sourceNames = tributeSourceNames(tributes);
    const sourceSummary = tributeKindSummary(tributes);
    transitions.push({
      ...transition,
      eventId: event.id,
      cardId: godId,
      relatedCardIds: [...new Set(tributes.map((source) => source.cardId).filter(Boolean))],
      sourceNames,
      sourceSummary,
      text: `终章转场：${transition.label}——「${god?.name || godId}」以三只祭品独立降临。祭品来源：${sourceNames}（${sourceSummary}）。${transition.next}。`
    });
  }
  return transitions;
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
  const hasAttacker = (ai.field || []).some((card) =>
    card?.type === "monster" && card.mode !== "defense"
  );
  if (playerLp <= 0 || playerLp > FINALE_RUSH_LIFE || !hasAttacker) return null;
  return {
    id: "rush-finale",
    eventId: "phase-3-low-life",
    turnGoal: "finishPressure",
    label: "抢攻终结",
    text: "你的当前生命已进入终战压力线；对手将优先投入强化、贯穿与再攻。",
    counterHint: "先回复生命值或封住可攻击神格，再考虑继续展开。"
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
