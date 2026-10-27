import { makeBattlePreview, makeAttackIntentPreview } from "./rules.js";
import { createTrapResponse, selectTrapResponse } from "./response-state.js";
import { describeBattleOutcome } from "./battle.js";

export function onlineTrapResponseChoice(view, previous = null) {
  const response = view?.attackResponse;
  if (!response || !response.candidates.length || view.gameOver) return null;
  const state = onlineBoardState(view);
  const pending = view.machine.pendingAttack;
  const choice = {
    ...createTrapResponse({ eventName: response.eventName, candidates: response.candidates, details: {
      owner: state.player, rival: state.ai, context: {
        attackerIndex: state.ai.field.findIndex((card) => card?.uid === pending.attackerCardId),
        targetIndex: state.player.field.findIndex((card) => card?.uid === pending.targetCardId)
      }
    } }),
    declarationEventId: response.declarationEventId,
    roomCode: view.roomCode
  };
  return previous?.roomCode === choice.roomCode && previous?.declarationEventId === choice.declarationEventId
    ? selectTrapResponse(choice, previous.selectedIndex) || choice : choice;
}

export function onlineResponseTimerView(view, now = Date.now()) {
  const timer = view?.responseTimer;
  const responseWindow = view?.machine?.responseWindow;
  if (!timer || !responseWindow || timer.declarationEventId !== view.machine?.pendingAttack?.declarationEventId) return null;
  const paused = Boolean(timer.paused);
  const remainingMs = paused
    ? Math.max(0, Number(timer.remainingMs) || 0)
    : Math.max(0, Number(timer.deadlineAt) - Number(now));
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const ownResponse = responseWindow.playerId === view.viewerSeatId;
  return {
    declarationEventId: timer.declarationEventId,
    paused,
    seconds,
    ownResponse,
    label: paused
      ? "对局已暂停，响应倒计时冻结"
      : ownResponse
        ? `剩余 ${seconds} 秒 · 到时自动放弃响应`
        : `等待对手响应 · ${seconds} 秒后自动结算`
  };
}

// Translate the server's public snapshot into the cards used by the solo UI.
// Display IDs are templates; commands always retain server instance IDs.
export function onlineDisplayCard(card) {
  if (!card || card.hidden) return card;
  return { ...card, id: card.templateId || card.id, uid: card.id };
}

export function onlineCardDetailView(card) {
  if (!card || card.hidden) return null;
  const typeLabel = card.type === "monster" ? "怪兽" : card.type === "trap" ? "陷阱" : "魔法";
  const rows = card.type === "monster"
    ? [
        ["攻击力", String(Math.max(0, Number(card.atk || 0) + Number(card.tempAtk || 0)))],
        ["守备力", String(Math.max(0, Number(card.def || 0) + Number(card.tempDef || 0)))],
        ["属性", ({ fire: "火", light: "光", wind: "风", shadow: "暗" }[card.element] || card.element || "无")],
        ["星级", `${Math.max(0, Number(card.stars) || 0)} 星`]
      ]
    : [
        ["类型", typeLabel],
        ["稀有度", card.rarity || "N"],
        ["流派", card.archetype || "通用"]
      ];
  return {
    name: card.name,
    typeLabel,
    effectText: card.text || "这张卡没有额外的公开效果说明。",
    rows
  };
}

export function onlineIdentityView(view) {
  const seat = view?.seats?.find((entry) => entry.seatId === view.viewerSeatId);
  if (!seat) return null;
  const firstSeat = view.viewerSeatId === "p1";
  return {
    name: seat.name,
    seatId: seat.seatId,
    seatNumber: firstSeat ? "1P" : "2P",
    seatRole: firstSeat ? "房主" : "挑战者",
    opponentName: view.seats?.find((entry) => entry.seatId === view.opponentSeatId)?.name || "等待加入"
  };
}

export function onlineConnectionView(view, { transportState = "connected", reconnectAttempt = 0, recoveryFailed = false } = {}) {
  if (!view || view.status === "finished") return null;
  if (transportState !== "connected") {
    return {
      kind: "self",
      kicker: recoveryFailed ? "RECOVERY FAILED" : "RECONNECTING",
      title: recoveryFailed ? "暂时无法恢复对局" : "正在恢复连接",
      summary: recoveryFailed
        ? "原房间可能已经失效。你可以立即重试，或返回大厅重新创建房间。"
        : "对局已安全暂停，正在使用本页保存的身份找回原座位。",
      status: recoveryFailed ? "等待你的选择" : reconnectAttempt > 0 ? `第 ${reconnectAttempt} 次重连中…` : "正在连接对战服务…",
      showActions: true
    };
  }
  const rival = view.seats?.find((seat) => seat.seatId === view.opponentSeatId);
  if (!rival || rival.connected !== false) return null;
  return {
    kind: "opponent",
    kicker: "DUEL PAUSED",
    title: `等待${rival.name || "对手"}重连`,
    summary: "对手的席位和当前牌局都已保留；重连完成前，双方不能继续出牌。",
    status: "你可以查看场面、墓地和战斗记录",
    showActions: false
  };
}

export function onlineCard(view, cardId) {
  for (const player of Object.values(view?.players || {})) {
    for (const zone of ["hand", "monsterZone", "spellTrapZone", "grave", "banished"]) {
      const card = (player[zone] || []).find((entry) => entry?.id === cardId);
      if (card && !card.hidden) return card;
    }
  }
  return null;
}

export function onlineResponseBattleView(view) {
  const pending = view?.machine?.pendingAttack;
  if (!pending?.attackerCardId) return null;
  const attacker = onlineCard(view, pending.attackerCardId);
  if (!attacker) return null;
  const target = pending.targetCardId ? onlineCard(view, pending.targetCardId) : null;
  const preview = makeBattlePreview(attacker, target);
  const attackerValue = Math.max(0, Number(attacker.atk || 0) + Number(attacker.tempAtk || 0));
  const targetMode = target?.mode === "defense" ? "defense" : "attack";
  const targetValue = target
    ? Math.max(0, Number(target[targetMode === "defense" ? "def" : "atk"] || 0) + Number(target[targetMode === "defense" ? "tempDef" : "tempAtk"] || 0))
    : Math.max(0, Number(view?.players?.[pending.rivalId]?.lp || 0));
  const targetSeat = view?.seats?.find((seat) => seat.seatId === pending.rivalId);
  const directSummary = preview?.rows?.find((row) => row.label === "结算")?.value;
  return {
    declarationEventId: pending.declarationEventId,
    direct: Boolean(pending.direct),
    tone: preview?.tone || (pending.direct ? "danger" : "neutral"),
    badge: preview?.badge || (pending.direct ? "直击" : "攻击"),
    attackerName: attacker.name || "攻击怪兽",
    attackerStat: `ATK ${attackerValue}`,
    targetName: target?.name || `${targetSeat?.name || "防守方"}的生命值`,
    targetStat: target ? `${targetMode === "defense" ? "DEF" : "ATK"} ${targetValue}` : `LP ${targetValue}`,
    summary: directSummary || preview?.result || "攻击已锁定，等待响应。"
  };
}

export function onlineGameResultView(view) {
  const gameOver = view?.gameOver;
  if (!gameOver) return null;
  const winnerId = gameOver.winnerId || null;
  const draw = !winnerId;
  const won = winnerId === view.viewerSeatId;
  const selfSeat = view.seats?.find((seat) => seat.seatId === view.viewerSeatId);
  const rivalSeat = view.seats?.find((seat) => seat.seatId === view.opponentSeatId);
  const self = view.players?.[view.viewerSeatId];
  const rival = view.players?.[view.opponentSeatId];
  const reason = gameOver.reason || "lp-zero";
  const winnerName = view.seats?.find((seat) => seat.seatId === winnerId)?.name || "胜者";
  const loserName = view.seats?.find((seat) => gameOver.loserIds?.includes(seat.seatId))?.name || "败方";
  const summary = draw
    ? "双方同时失去全部生命值，本局以平局结束。"
    : reason === "lp-zero"
      ? won ? `${rivalSeat?.name || "对手"}的生命值归零，你赢得了本局决斗。` : `你的生命值归零，${winnerName}赢得了本局决斗。`
      : reason === "concede"
        ? won ? `${loserName}选择认输，你赢得了本局决斗。` : `你选择认输，${winnerName}赢得了本局决斗。`
      : won ? "你完成了本局的胜利条件。" : `${winnerName}完成了本局的胜利条件。`;
  return {
    key: `${view.roomCode || "room"}:${gameOver.triggerEventId || gameOver.reason || "finished"}`,
    tone: draw ? "draw" : won ? "victory" : "defeat",
    kicker: draw ? "DUEL DRAW" : won ? "DUEL VICTORY" : "DUEL DEFEAT",
    title: draw ? "平局" : won ? "决斗胜利" : "决斗败北",
    summary,
    selfName: selfSeat?.name || "你",
    selfLp: Math.max(0, Number(self?.lp || 0)),
    rivalName: rivalSeat?.name || "对手",
    rivalLp: Math.max(0, Number(rival?.lp || 0))
  };
}

const ACTION_RECEIPT_TYPES = new Set([
  "MONSTER_SUMMONED", "CARD_ACTIVATED", "ATTACK_DECLARED", "MONSTER_MODE_CHANGED",
  "BATTLE_RESOLVED", "ATTACK_CANCELED", "ATTACK_TARGET_CHANGED", "TRAP_SET", "CARDS_DRAWN"
]);

function battleResultReceipt(view, event, events = []) {
  const outcome = event.outcome || {};
  const attacker = onlineCard(view, event.attackerCardId);
  const target = onlineCard(view, event.targetCardId);
  const attackerName = attacker?.name ? `《${attacker.name}》` : "攻击怪兽";
  const targetName = target?.name ? `《${target.name}》` : "目标怪兽";
  const actor = event.playerId === view?.viewerSeatId ? "self" : "opponent";
  if (event.type === "ATTACK_CANCELED") {
    return {
      id: Number(event.id) || 0,
      type: event.type,
      actor,
      kind: "battle-result",
      tone: "blocked",
      result: "canceled",
      damagePlayerId: null,
      destroyedSeatIds: [],
      text: `${attackerName}的攻击被陷阱阻断`
    };
  }
  if (event.type === "ATTACK_TARGET_CHANGED") {
    return {
      id: Number(event.id) || 0,
      type: event.type,
      actor,
      kind: "battle-result",
      tone: "redirect",
      result: "redirected",
      damagePlayerId: null,
      destroyedSeatIds: [],
      text: `${attackerName}的攻击目标转为${targetName}`
    };
  }

  const damageEvent = events.find((entry) =>
    entry.type === "DAMAGE_DEALT"
    && Number(entry.id) < Number(event.id)
    && Number(entry.id) > Number(event.declarationEventId || 0)
    && entry.playerId === outcome.damagePlayerId
    && (!entry.sourceCardId || entry.sourceCardId === event.attackerCardId || entry.sourceCardId === event.targetCardId)
  );
  const damage = Math.max(0, Number(damageEvent?.amount ?? outcome.finalDamage) || 0);
  const damagedName = outcome.damagePlayerId
    ? view?.seats?.find((seat) => seat.seatId === outcome.damagePlayerId)?.name || outcome.damagePlayerId
    : "";
  const destroyedSeatIds = [
    ...(outcome.destroysAttacker ? [event.playerId] : []),
    ...(outcome.destroysTarget ? [event.rivalId] : [])
  ].filter(Boolean);
  let text = `${attackerName}完成攻击`;
  if (outcome.kind === "direct") text = `${attackerName}直接命中${damagedName}${damage ? ` · ${damage} 伤害` : ""}`;
  else if (outcome.kind === "attackWin") text = `${attackerName}击破${targetName}${damage ? ` · ${damage} 伤害` : ""}`;
  else if (outcome.kind === "pierceDefense") text = `${attackerName}贯穿${targetName}${damage ? ` · ${damage} 伤害` : ""}`;
  else if (outcome.kind === "breakDefense") text = `${attackerName}击破${targetName} · 未造成 LP 伤害`;
  else if (outcome.kind === "guardCounter") text = `${targetName}挡下攻击 · ${damagedName}受到 ${damage} 伤害`;
  else if (outcome.kind === "guardHold") text = `${targetName}完全挡下攻击 · 双方保留`;
  else if (outcome.kind === "countered") text = `${attackerName}被${targetName}反击破坏${damage ? ` · ${damage} 伤害` : ""}`;
  else if (outcome.kind === "clash") text = `${attackerName}与${targetName}同归于尽`;
  const viewerLostCard = destroyedSeatIds.includes(view?.viewerSeatId);
  const viewerDamaged = outcome.damagePlayerId === view?.viewerSeatId && damage > 0;
  const tone = viewerLostCard || viewerDamaged ? "danger"
    : outcome.kind === "guardHold" ? "blocked"
      : outcome.kind === "clash" ? "neutral" : "success";
  return {
    id: Number(event.id) || 0,
    type: event.type,
    actor,
    kind: "battle-result",
    tone,
    result: outcome.kind || "resolved",
    damage,
    damagePlayerId: outcome.damagePlayerId || null,
    destroyedSeatIds,
    text
  };
}

export function onlineActionReceipt(view, event, { events = [] } = {}) {
  if (!event || !ACTION_RECEIPT_TYPES.has(event.type)) return null;
  if (["BATTLE_RESOLVED", "ATTACK_CANCELED", "ATTACK_TARGET_CHANGED"].includes(event.type)) {
    return battleResultReceipt(view, event, events);
  }
  const actorName = view?.seats?.find((seat) => seat.seatId === event.playerId)?.name || event.playerId || "系统";
  const cardId = event.cardId || event.attackerCardId || event.sourceCardId;
  const card = cardId ? onlineCard(view, cardId) : null;
  const cardLabel = card?.name ? `《${card.name}》` : "一张卡";
  const actor = event.playerId === view?.viewerSeatId ? "self" : event.playerId ? "opponent" : "system";
  const text = event.type === "MONSTER_SUMMONED" ? `${actorName}召唤${cardLabel}`
    : event.type === "CARD_ACTIVATED" ? `${actorName}发动${cardLabel}`
      : event.type === "ATTACK_DECLARED" ? `${actorName}以${cardLabel}${event.direct ? "发起直接攻击" : "发起攻击"}`
        : event.type === "TRAP_SET" ? `${actorName}盖放了 1 张陷阱`
          : event.type === "CARDS_DRAWN" ? `${actorName}抽取了 ${Math.max(0, Number(event.count) || 0)} 张卡`
            : `${actorName}将${cardLabel}切换为${event.mode === "defense" || event.to === "defense" ? "守备" : "攻击"}表示`;
  return { id: Number(event.id) || 0, type: event.type, actor, text };
}

export function latestOnlineActionReceipt(view, afterEventId = 0) {
  const events = (view?.recentEvents || [])
    .filter((event) => Number(event.id) > Number(afterEventId || 0));
  return [...events]
    .reverse()
    .map((event) => onlineActionReceipt(view, event, { events }))
    .find(Boolean) || null;
}

const ONLINE_TIMELINE_TYPES = new Set([
  "MONSTER_SUMMONED", "CARD_ACTIVATED", "TRAP_SET", "MONSTER_MODE_CHANGED",
  "ATTACK_DECLARED", "BATTLE_RESOLVED", "ATTACK_CANCELED", "ATTACK_TARGET_CHANGED",
  "DAMAGE_DEALT", "LP_HEALED", "CARD_DESTROYED", "EFFECT_SKIPPED",
  "TURN_STARTED", "TURN_ENDED", "PHASE_CHANGED", "CARDS_DRAWN", "GAME_OVER_DECLARED"
]);

const ONLINE_TIMELINE_META = {
  MONSTER_SUMMONED: ["召唤", "summon"], CARD_ACTIVATED: ["发动", "effect"], TRAP_SET: ["盖放", "effect"],
  MONSTER_MODE_CHANGED: ["表示", "effect"], ATTACK_DECLARED: ["攻击", "battle"],
  BATTLE_RESOLVED: ["结算", "battle"], ATTACK_CANCELED: ["阻断", "battle"], ATTACK_TARGET_CHANGED: ["转移", "battle"],
  DAMAGE_DEALT: ["伤害", "damage"], LP_HEALED: ["恢复", "heal"], CARD_DESTROYED: ["破坏", "damage"],
  EFFECT_SKIPPED: ["未生效", "system"], TURN_STARTED: ["回合", "turn"], TURN_ENDED: ["结束", "turn"],
  PHASE_CHANGED: ["阶段", "turn"], CARDS_DRAWN: ["抽卡", "turn"], GAME_OVER_DECLARED: ["终局", "result"]
};

function onlineTimelineFallback(view, event) {
  const playerName = event.playerId
    ? view?.seats?.find((seat) => seat.seatId === event.playerId)?.name || event.playerId
    : "系统";
  const cardId = event.cardId || event.attackerCardId || event.sourceCardId;
  const card = cardId ? onlineCard(view, cardId) : null;
  const cardLabel = card?.name ? `《${card.name}》` : "卡牌";
  const phaseName = { main: "主要阶段", battle: "战斗阶段", end: "结束阶段" }[event.to || event.phase] || "下一阶段";
  if (event.type === "DAMAGE_DEALT") return `${playerName}受到 ${Math.max(0, Number(event.amount || event.damage) || 0)} 点伤害`;
  if (event.type === "LP_HEALED") return `${playerName}恢复 ${Math.max(0, Number(event.amount) || 0)} LP`;
  if (event.type === "CARD_DESTROYED") return `${cardLabel}被破坏并送入墓地`;
  if (event.type === "EFFECT_SKIPPED") return `${cardLabel}的效果条件不足，未能生效`;
  if (event.type === "TURN_STARTED") return `${playerName}的回合开始`;
  if (event.type === "TURN_ENDED") return `${playerName}结束回合`;
  if (event.type === "PHASE_CHANGED") return `${playerName}进入${phaseName}`;
  if (event.type === "GAME_OVER_DECLARED") {
    const winner = view?.seats?.find((seat) => seat.seatId === event.winnerId)?.name;
    return winner ? `${winner}赢得本局决斗` : "本局决斗结束";
  }
  return ONLINE_TIMELINE_META[event.type]?.[0] || "对局事件";
}

export function onlineEventTimeline(view, { limit = 24 } = {}) {
  const publicEvents = view?.recentEvents || [];
  const foldedIntoLaterEvent = (event) => {
    if (event.type === "CARD_ACTIVATED") {
      return publicEvents.some((candidate) => candidate.type === "MONSTER_SUMMONED"
        && candidate.playerId === event.playerId
        && candidate.cardId === event.cardId
        && Number(candidate.id) > Number(event.id)
        && Number(candidate.id) - Number(event.id) <= 3);
    }
    if (!["DAMAGE_DEALT", "CARD_DESTROYED"].includes(event.type)) return false;
    return publicEvents.some((candidate) => {
      if (candidate.type !== "BATTLE_RESOLVED") return false;
      const declarationId = Number(candidate.declarationEventId || 0);
      if (Number(event.id) <= declarationId || Number(event.id) >= Number(candidate.id)) return false;
      if (event.type === "DAMAGE_DEALT") return event.playerId === candidate.outcome?.damagePlayerId;
      return [candidate.attackerCardId, candidate.targetCardId].includes(event.cardId);
    });
  };
  const events = publicEvents.filter((event) => ONLINE_TIMELINE_TYPES.has(event.type) && !foldedIntoLaterEvent(event));
  return events.slice(-Math.max(1, Number(limit) || 24)).reverse().map((event) => {
    const receipt = onlineActionReceipt(view, event, { events: publicEvents });
    const [label, category] = ONLINE_TIMELINE_META[event.type] || ["事件", "system"];
    const actor = event.playerId === view?.viewerSeatId ? "self" : event.playerId ? "opponent" : "system";
    const cardIds = [...new Set([
      event.cardId, event.attackerCardId, event.targetCardId, event.sourceCardId
    ].filter((cardId) => cardId && onlineCard(view, cardId)))];
    return {
      id: Number(event.id) || 0,
      type: event.type,
      label,
      category,
      actor,
      tone: receipt?.tone || (category === "damage" ? "danger" : category),
      text: receipt?.text || onlineTimelineFallback(view, event),
      cardIds
    };
  });
}

export function onlineEventSound(view, event) {
  if (!event) return "";
  if (event.type === "MONSTER_SUMMONED") {
    const card = onlineCard(view, event.cardId);
    return Number(card?.stars || 0) >= 7 ? "ace" : "summon";
  }
  if (event.type === "CARD_ACTIVATED") {
    const card = onlineCard(view, event.cardId);
    return card?.type === "trap" ? "trap" : "spell";
  }
  if (event.type === "TRAP_SET") return "click";
  if (event.type === "CARDS_DRAWN" && event.sourceCardId) return "draw";
  if (event.type === "ATTACK_DECLARED") return "attack-charge";
  if (event.type === "ATTACK_CANCELED") return "guard";
  if (event.type === "BATTLE_RESOLVED") {
    const kind = event.outcome?.kind;
    if (kind === "direct") return "attack-direct";
    if (["attackWin", "breakDefense", "pierceDefense", "countered"].includes(kind)) return "attack-break";
    if (kind === "clash") return "attack-clash";
    if (["guardHold", "guardCounter"].includes(kind)) return "guard";
    return "attack-impact";
  }
  if (event.type === "TURN_STARTED" && event.playerId === view?.viewerSeatId) return "turn";
  return "";
}

export function onlineActionCue(view, events = []) {
  const fresh = (events || []).filter(Boolean);
  if (!fresh.length) return null;
  const latest = (type) => [...fresh].reverse().find((event) => event.type === type);
  const ownerFor = (seatId) => seatId === view?.viewerSeatId ? "player" : "ai";
  const rivalSeatFor = (event) => event.rivalId || (event.playerId === view?.viewerSeatId ? view?.opponentSeatId : view?.viewerSeatId);
  const attack = latest("ATTACK_DECLARED");
  if (attack) {
    const result = [...fresh].reverse().find((event) =>
      ["BATTLE_RESOLVED", "ATTACK_CANCELED", "ATTACK_TARGET_CHANGED"].includes(event.type)
      && Number(event.id || 0) >= Number(attack.id || 0)
    );
    const damageEvent = [...fresh].reverse().find((event) =>
      event.type === "DAMAGE_DEALT"
      && Number(event.id || 0) >= Number(attack.id || 0)
      && (!result || Number(event.id || 0) <= Number(result.id || 0))
    );
    return {
      id: Number(result?.id || attack.id) || 0,
      kind: "attack",
      actor: ownerFor(attack.playerId),
      rival: ownerFor(rivalSeatFor(attack)),
      cardId: attack.attackerCardId,
      targetCardId: attack.targetCardId || result?.targetCardId || null,
      direct: Boolean(attack.direct),
      label: attack.direct ? "直接攻击" : "攻击宣言",
      resultType: result?.type || null,
      outcome: result?.outcome || null,
      damage: Math.max(0, Number(damageEvent?.amount ?? result?.outcome?.finalDamage) || 0),
      damagePlayerId: damageEvent?.playerId || result?.outcome?.damagePlayerId || null
    };
  }

  const summon = latest("MONSTER_SUMMONED");
  if (summon) {
    const card = onlineCard(view, summon.cardId);
    return {
      id: Number(summon.id) || 0,
      kind: "summon",
      actor: ownerFor(summon.playerId),
      cardId: summon.cardId,
      label: Number(card?.stars || 0) >= 7 ? "王牌降临" : "怪兽召唤"
    };
  }

  const activated = latest("CARD_ACTIVATED");
  if (activated) {
    const card = onlineCard(view, activated.cardId);
    return {
      id: Number(activated.id) || 0,
      kind: card?.type === "trap" ? "trap" : card?.type === "spell" ? "spell" : "effect",
      actor: ownerFor(activated.playerId),
      cardId: activated.cardId,
      label: card?.type === "trap" ? "陷阱发动" : card?.type === "spell" ? "魔法发动" : "卡牌发动"
    };
  }

  const setTrap = latest("TRAP_SET");
  if (setTrap) {
    return {
      id: Number(setTrap.id) || 0,
      kind: "set",
      actor: ownerFor(setTrap.playerId),
      cardId: setTrap.cardId || null,
      slotIndex: Number.isInteger(setTrap.index) ? setTrap.index : null,
      label: "后场盖放"
    };
  }

  const modeChange = latest("MONSTER_MODE_CHANGED");
  if (modeChange) {
    const mode = modeChange.to || modeChange.mode || "attack";
    return {
      id: Number(modeChange.id) || 0,
      kind: "mode",
      actor: ownerFor(modeChange.playerId),
      cardId: modeChange.cardId,
      mode,
      label: mode === "defense" ? "转为守备" : "转为攻击"
    };
  }

  const drawn = latest("CARDS_DRAWN");
  if (drawn?.sourceCardId) {
    return {
      id: Number(drawn.id) || 0,
      kind: "draw",
      actor: ownerFor(drawn.playerId),
      count: Math.max(0, Number(drawn.count) || 0),
      label: drawn.playerId === view?.viewerSeatId ? "效果抽卡" : "对手抽卡"
    };
  }

  const result = latest("ATTACK_CANCELED") || latest("ATTACK_TARGET_CHANGED") || latest("BATTLE_RESOLVED");
  if (!result) return null;
  return {
    id: Number(result.id) || 0,
    kind: result.type === "ATTACK_CANCELED" ? "guard" : "impact",
    actor: ownerFor(result.playerId),
    rival: ownerFor(rivalSeatFor(result)),
    cardId: result.attackerCardId,
    targetCardId: result.targetCardId || null,
    label: result.type === "ATTACK_CANCELED" ? "攻击被阻断" : result.type === "ATTACK_TARGET_CHANGED" ? "攻击目标改变" : "战斗结算",
    resultType: result.type,
    outcome: result.outcome || null
  };
}

export function onlineCardActions(view, cardId) {
  if (view?.gameOver || view?.turn?.playerId !== view?.viewerSeatId) return [];
  return Object.values(view?.legalActions?.actions || {}).flat()
    .filter((action) => (action.cardId || action.attackerCardId) === cardId);
}

export function onlineAttackIntent(view, model) {
  const attacks = model?.actions?.filter((action) => action.type === "DECLARE_ATTACK") || [];
  const ownTurn = view?.turn?.playerId === view?.viewerSeatId;
  const self = view?.players?.[view?.viewerSeatId];
  const canEnterBattle = Boolean(
    model?.card?.type === "monster"
    && ownTurn
    && view?.turn?.phase === "main"
    && view?.legalActions?.can?.endTurn
    && model.card.mode !== "defense"
    && !model.card.used
    && !self?.attacksSkipped
  );
  return {
    available: attacks.length > 0 || canEnterBattle,
    requiresBattlePhase: attacks.length === 0 && canEnterBattle,
    attackCount: attacks.length,
    label: attacks.length > 0 ? "攻击" : canEnterBattle ? "进入战斗并攻击" : "当前不能攻击"
  };
}

export function selectOnlineCard(view, cardId, actionType = null) {
  const card = onlineCard(view, cardId);
  if (!card) return null;
  const inHand = view.players[view.viewerSeatId].hand.some((entry) => entry.id === cardId);
  const actions = onlineCardActions(view, cardId);
  return {
    cardId,
    revision: view.revision,
    actionType: actionType || (inHand ? actions[0]?.type : null),
    targetCardId: null,
    index: null,
    tributeCardIds: []
  };
}

export function onlineSelectionModel(view, selection) {
  if (!selection || selection.revision !== view.revision) return null;
  const card = onlineCard(view, selection.cardId);
  if (!card) return null;
  const actions = onlineCardActions(view, selection.cardId);
  const choices = actions.filter((action) => action.type === selection.actionType);
  const base = choices[0];
  const self = view.players[view.viewerSeatId];
  const tributeCount = base?.tributeCardIds?.length || 0;
  const tributeCardIds = selection.tributeCardIds.filter((id) => self.monsterZone.some((entry) => entry?.id === id));
  const needsMaterial = tributeCount > 0 && tributeCardIds.length !== tributeCount;
  const needsPlacement = ["SUMMON_MONSTER", "SET_TRAP"].includes(base?.type);
  const targetIds = [...new Set(choices.map((action) => action.targetCardId).filter(Boolean))];
  const targetCardId = targetIds.includes(selection.targetCardId)
    ? selection.targetCardId : targetIds.length === 1 ? targetIds[0] : null;
  const zone = base?.type === "SET_TRAP" ? self.spellTrapZone : self.monsterZone;
  const slots = needsPlacement ? zone.flatMap((entry, index) =>
    !entry || tributeCardIds.includes(entry.id) ? [index] : []) : [];
  const index = slots.includes(selection.index) ? selection.index : slots[0] ?? null;
  const stage = needsMaterial ? "material" : needsPlacement ? "placement" : targetIds.length ? "target" : "command";
  let action = !needsMaterial && (!needsPlacement || index != null)
    ? choices.find((entry) => !targetIds.length || entry.targetCardId === targetCardId) || null : null;
  if (action) action = {
    ...action,
    ...(needsPlacement ? { index } : {}),
    ...(tributeCount ? { tributeCardIds } : {})
  };
  return { card, actions, choices, action, stage, targetIds, targetCardId, slots, index, tributeCount, tributeCardIds };
}

export function chooseOnlineCard(view, selection, cardId) {
  const model = onlineSelectionModel(view, selection);
  if (model?.targetIds.includes(cardId)) return { ...selection, targetCardId: cardId };
  const self = view.players[view.viewerSeatId];
  if (model?.tributeCount && self.monsterZone.some((card) => card?.id === cardId)) {
    const tributeCardIds = selection.tributeCardIds.includes(cardId)
      ? selection.tributeCardIds.filter((id) => id !== cardId)
      : [...selection.tributeCardIds, cardId].slice(-model.tributeCount);
    return { ...selection, tributeCardIds, index: null };
  }
  const ownMonster = view.turn.playerId === view.viewerSeatId && !view.gameOver
    && self.monsterZone.some((card) => card?.id === cardId);
  if (!ownMonster && !onlineCardActions(view, cardId).length) return selection;
  return selection?.cardId === cardId ? null : selectOnlineCard(view, cardId);
}

export function onlineBattlePreview(view, model) {
  if (!model || !model.choices.some((action) => action.type === "DECLARE_ATTACK")) return null;
  const self = view.players[view.viewerSeatId];
  const rival = view.players[view.opponentSeatId];
  const attacker = self.monsterZone.find((card) => card?.id === model.card.id);
  if (!attacker || attacker.hidden) return null;
  const action = model.action;
  if (!action) return makeAttackIntentPreview(attacker, {
    targetCount: model.targetIds.length,
    canDirectAttack: model.choices.some((entry) => !entry.targetCardId)
  });
  const target = action.targetCardId ? rival.monsterZone.find((card) => card?.id === action.targetCardId) : null;
  if (action.targetCardId && (!target || target.hidden)) return null;
  const preview = makeBattlePreview(attacker, target);
  const outcome = describeBattleOutcome(attacker, target);
  const suffersDamage = outcome.diff < 0 ? self : rival;
  const lpAfter = Math.max(0, suffersDamage.lp - outcome.finalDamage);
  return {
    ...preview,
    rows: [...preview.rows, {
      label: outcome.diff < 0 ? "我方 LP" : "对手 LP",
      value: `${suffersDamage.lp} → ${lpAfter}`
    }, { label: "提示", value: "按当前攻防预估，卡牌效果可能改变结果" }]
  };
}

export function onlineBoardState(view, selection) {
  const project = (seatId) => {
    const player = view.players[seatId];
    return {
      ...player,
      hand: player.hand.map(onlineDisplayCard),
      field: player.monsterZone.map(onlineDisplayCard),
      traps: player.spellTrapZone.map(onlineDisplayCard)
    };
  };
  const self = project(view.viewerSeatId);
  const index = selection?.cardId ? self.field.findIndex((card) => card?.uid === selection.cardId) : -1;
  return {
    started: view.status === "playing",
    gameOver: Boolean(view.gameOver),
    turn: view.turn.playerId === view.viewerSeatId ? "player" : "ai",
    phase: view.turn.phase,
    selected: index >= 0 ? { zone: "playerField", index } : null,
    player: self,
    ai: project(view.opponentSeatId)
  };
}

export function onlineInteractionView(model, { inHand = false, isAttack = false } = {}) {
  if (!model) {
    return {
      focus: "idle",
      selection: "none",
      targeting: "none",
      choice: {
        target: false,
        targetSingle: false,
        targetList: false,
        single: false,
        multiple: false,
        placement: false,
        material: false,
        selectionMode: "none",
        targetStep: "none"
      }
    };
  }

  const stage = model.stage || "command";
  const targetCount = model.targetIds?.length || 0;
  const target = stage === "target";
  const targetSingle = target && targetCount === 1;
  return {
    focus: isAttack ? "attack" : stage,
    selection: target ? "target" : stage === "material" ? "tribute" : inHand ? "hand" : "playerField",
    targeting: isAttack ? "attack" : target ? "effect" : stage === "material" ? "material" : stage === "placement" ? "placement" : "none",
    choice: {
      target,
      targetSingle,
      targetList: target && targetCount > 1,
      single: !target && stage === "command" && Boolean(model.action),
      multiple: target && targetCount > 1,
      placement: stage === "placement",
      material: stage === "material",
      selectionMode: target ? targetSingle ? "single" : "multiple" : "none",
      targetStep: target ? targetSingle ? "single" : model.action ? "confirm" : "select" : "none"
    }
  };
}
