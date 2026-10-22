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

export function onlineCard(view, cardId) {
  for (const player of Object.values(view?.players || {})) {
    for (const zone of ["hand", "monsterZone", "spellTrapZone", "grave", "banished"]) {
      const card = (player[zone] || []).find((entry) => entry?.id === cardId);
      if (card && !card.hidden) return card;
    }
  }
  return null;
}

const ACTION_RECEIPT_TYPES = new Set(["MONSTER_SUMMONED", "CARD_ACTIVATED", "ATTACK_DECLARED", "MONSTER_MODE_CHANGED"]);

export function onlineActionReceipt(view, event) {
  if (!event || !ACTION_RECEIPT_TYPES.has(event.type)) return null;
  const actorName = view?.seats?.find((seat) => seat.seatId === event.playerId)?.name || event.playerId || "系统";
  const cardId = event.cardId || event.attackerCardId || event.sourceCardId;
  const card = cardId ? onlineCard(view, cardId) : null;
  const cardLabel = card?.name ? `《${card.name}》` : "一张卡";
  const actor = event.playerId === view?.viewerSeatId ? "self" : event.playerId ? "opponent" : "system";
  const text = event.type === "MONSTER_SUMMONED" ? `${actorName}召唤${cardLabel}`
    : event.type === "CARD_ACTIVATED" ? `${actorName}发动${cardLabel}`
      : event.type === "ATTACK_DECLARED" ? `${actorName}以${cardLabel}${event.direct ? "发起直接攻击" : "发起攻击"}`
        : `${actorName}将${cardLabel}切换为${event.mode === "defense" || event.to === "defense" ? "守备" : "攻击"}表示`;
  return { id: Number(event.id) || 0, type: event.type, actor, text };
}

export function latestOnlineActionReceipt(view, afterEventId = 0) {
  return [...(view?.recentEvents || [])]
    .reverse()
    .filter((event) => Number(event.id) > Number(afterEventId || 0))
    .map((event) => onlineActionReceipt(view, event))
    .find(Boolean) || null;
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
