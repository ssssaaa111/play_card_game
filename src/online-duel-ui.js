// Translate the server's public snapshot into the cards used by the solo UI.
// Display IDs are templates; commands always retain server instance IDs.
export function onlineDisplayCard(card) {
  if (!card || card.hidden) return card;
  return { ...card, id: card.templateId || card.id, uid: card.id };
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

export function onlineCardActions(view, cardId) {
  if (view?.gameOver || view?.turn?.playerId !== view?.viewerSeatId) return [];
  return Object.values(view?.legalActions?.actions || {}).flat()
    .filter((action) => (action.cardId || action.attackerCardId) === cardId);
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
