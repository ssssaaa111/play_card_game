import { Ability, GameEngine, Phase, explainActionLegality, getCardEffectDefinition, getLegalActions, projectMachineStateFromEvents, tributeCostForCard } from './game-engine.js';
import { library } from './data.js';
import { MAX_LP, MAX_SHIELD, MONSTER_ZONE_SIZE, SPELL_TRAP_ZONE_SIZE, canEffectTargetCard, totalAtk } from './rules.js';
import { spellDefinition } from './spells.js';
import { trapDefinition } from './traps.js';
import { ACTION_WINDOWS, PHASES, TIMINGS } from './turn-state.js';
import { fusionOptionForResult, fusionOptionsForCard } from './fusion.js';

const ownerIds = ["player", "ai"];
const ONE_SHOT_EFFECT = "oneShot";
const CONTINUOUS_EFFECT = "continuous";

const uiZones = {
  deck: "deck",
  hand: "hand",
  monsterZone: "field",
  spellTrapZone: "traps",
  grave: "grave"
};

const uiTimingByPhase = {
  [PHASES.setup]: TIMINGS.setup,
  [PHASES.draw]: TIMINGS.draw,
  [PHASES.main]: TIMINGS.mainOpen,
  [PHASES.battle]: TIMINGS.battleOpen,
  [PHASES.end]: TIMINGS.end
};

const uiTimingByActionWindow = {
  setup: TIMINGS.setup,
  draw: TIMINGS.draw,
  main: TIMINGS.mainOpen,
  battle: TIMINGS.battleOpen,
  targetSelect: TIMINGS.targetSelection,
  response: TIMINGS.responseWindow,
  resolution: TIMINGS.resolution,
  autoEnd: TIMINGS.autoEnd,
  ai: TIMINGS.ai,
  gameOver: TIMINGS.gameOver
};

const cardDefinitions = Object.fromEntries(library.map((card) => [card.id, { ...card }]));

function cardKey(card) {
  return card?.uid || card?.engineId || card?.id || null;
}

function compactCardIds(cards = []) {
  return cards.filter(Boolean).map(cardKey).filter(Boolean);
}

function normalizedTributeIndexes(duelist, card, options = {}) {
  if (Array.isArray(options.tributeIndexes)) {
    return options.tributeIndexes
      .filter((index) => Number.isInteger(index) && index >= 0 && index < duelist.field.length)
      .filter((index, offset, list) => list.indexOf(index) === offset);
  }
  const cost = tributeCostForCard(card);
  if (cost <= 0) return [];
  return duelist.field
    .map((slot, index) => (slot ? index : -1))
    .filter((index) => index >= 0)
    .slice(0, cost);
}

function tributeCardIdsFromUiState(duelist, card, options = {}) {
  if (Array.isArray(options.tributeCardIds)) {
    return options.tributeCardIds.filter(Boolean);
  }
  return normalizedTributeIndexes(duelist, card, options)
    .map((index) => cardKey(duelist.field[index]))
    .filter(Boolean);
}

function cardTemplateId(card) {
  return card?.templateId || card?.id || "";
}

function isFusionSpell(card) {
  return fusionOptionsForCard(card).length > 0;
}

function selectedFusionOption(card, options = {}) {
  const choices = fusionOptionsForCard(card);
  const requested = options.fusionResultTemplateId || options.resultTemplateId || "";
  return requested ? fusionOptionForResult(card, requested) : choices.length === 1 ? choices[0] : null;
}

function normalizedFusionIndexes(duelist, card, options = {}) {
  if (Array.isArray(options.materialIndexes)) {
    return options.materialIndexes
      .filter((index) => Number.isInteger(index) && index >= 0 && index < duelist.field.length)
      .filter((index, offset, list) => list.indexOf(index) === offset);
  }
  const fusion = selectedFusionOption(card, options);
  if (!fusion) return [];
  const available = duelist.field
    .map((slot, index) => ({ card: slot, index }))
    .filter((entry) => entry.card);
  const selected = [];
  for (const requirement of fusion.materials) {
    for (let count = 0; count < requirement.count; count += 1) {
      const foundIndex = available.findIndex((entry) => cardTemplateId(entry.card) === requirement.templateId);
      if (foundIndex < 0) return [];
      const [entry] = available.splice(foundIndex, 1);
      selected.push(entry.index);
    }
  }
  return selected;
}

function fusionMaterialCardIdsFromUiState(duelist, card, options = {}) {
  if (Array.isArray(options.materialCardIds)) {
    return options.materialCardIds.filter(Boolean);
  }
  if (!Array.isArray(options.materialIndexes)) {
    const fusion = selectedFusionOption(card, options);
    if (!fusion) return [];
    const available = [
      ...duelist.field.filter(Boolean),
      ...duelist.hand.filter((entry) => entry && cardKey(entry) !== cardKey(card))
    ];
    const selected = [];
    for (const requirement of fusion.materials) {
      for (let count = 0; count < requirement.count; count += 1) {
        const foundIndex = available.findIndex((entry) => cardTemplateId(entry) === requirement.templateId);
        if (foundIndex < 0) return [];
        const [entry] = available.splice(foundIndex, 1);
        selected.push(cardKey(entry));
      }
    }
    return selected;
  }
  return normalizedFusionIndexes(duelist, card, options)
    .map((index) => cardKey(duelist.field[index]))
    .filter(Boolean);
}

function fusionSummonSlotIndex(duelist, materialIndexes = [], fieldIndex = null) {
  if (Number.isInteger(fieldIndex)) return fieldIndex;
  if (materialIndexes.length > 0) return materialIndexes[0];
  const emptyIndex = duelist.field.findIndex((slot) => !slot);
  return emptyIndex >= 0 ? emptyIndex : -1;
}

function collectCards(cards, ownerId, target) {
  cards.filter(Boolean).forEach((card) => {
    const id = cardKey(card);
    if (!id) return;
    const templateId = card.id || card.templateId || id;
    target[id] = {
      ...card,
      id,
      templateId,
      ownerId
    };
  });
}

function uiDuelistToEngine(duelist) {
  return {
    id: duelist.owner,
    lp: duelist.lp,
    shield: duelist.shield || 0,
    deck: compactCardIds(duelist.deck),
    hand: compactCardIds(duelist.hand),
    monsterZone: compactCardIds(duelist.field),
    spellTrapZone: compactCardIds(duelist.traps),
    grave: compactCardIds(duelist.grave),
    banished: [],
    zoneSlots: {
      monsterZone: Array.from({ length: MONSTER_ZONE_SIZE }, (_, index) => cardKey(duelist.field[index]) || null),
      spellTrapZone: Array.from({ length: SPELL_TRAP_ZONE_SIZE }, (_, index) => cardKey(duelist.traps[index]) || null)
    },
    attacksSkipped: Boolean(duelist.attacksSkipped),
    comboThisTurn: Boolean(duelist.comboThisTurn),
    comboFlags: { ...(duelist.comboFlags || {}) },
    comboPassive: duelist.comboPassive ? { ...duelist.comboPassive, operations: (duelist.comboPassive.operations || []).map((operation) => ({ ...operation })) } : null,
    normalSummonsUsed: Math.max(0, Number(duelist.normalSummonsUsed) || 0)
  };
}

function uiAbilityEntries(duelist) {
  const attackResetEntries = Array.isArray(duelist.attackResetEntries)
    ? duelist.attackResetEntries
      .filter((entry) => Math.max(0, Number(entry.uses) || 0) > 0)
      .map((entry) => ({
        ability: Ability.attackReset,
        uses: Math.max(0, Number(entry.uses) || 0),
        duration: entry.duration || "turn",
        sourceCardId: entry.sourceCardId || null,
        targetCardId: entry.targetCardId || null
      }))
    : [];
  const trackedAttackResetUses = attackResetEntries.reduce((total, entry) => total + entry.uses, 0);
  const legacyAttackResetUses = Math.max(0, (Number(duelist.attackResets) || 0) - trackedAttackResetUses);
  const genericEntries = [
    [Ability.directAttack, duelist.directAttacks],
    [Ability.extraSummon, duelist.extraSummon],
    [Ability.attackReset, legacyAttackResetUses],
    [Ability.skipAttackLock, duelist.attacksSkipped ? 1 : 0]
  ]
    .filter(([, uses]) => Math.max(0, Number(uses) || 0) > 0)
    .map(([ability, uses]) => ({
      ability,
      uses: Math.max(0, Number(uses) || 0),
      duration: "turn",
      sourceCardId: null
    }));
  return [...attackResetEntries, ...genericEntries];
}

function enginePhaseFromUiPhase(phase) {
  if (phase === PHASES.ready) return Phase.setup;
  return phase || Phase.main;
}

function projectContinuousEffectsFromEvents(events = []) {
  const active = new Map();
  events.forEach((event) => {
    if (event.type === "CONTINUOUS_EFFECT_REGISTERED") {
      active.set(event.id, {
        id: event.id,
        playerId: event.playerId,
        sourceCardId: event.sourceCardId,
        effectId: event.effectId,
        targetCardId: event.targetCardId || null,
        destroySourceWhenTargetLeaves: event.destroySourceWhenTargetLeaves !== false,
        operations: (event.operations || []).map((operation) => ({ ...operation }))
      });
    }
    if (event.type === "CONTINUOUS_EFFECT_RELEASED") {
      active.delete(event.id);
    }
  });
  return [...active.values()];
}

export function buildEngineStateFromUiState(uiState) {
  const cards = {};
  const events = Array.isArray(uiState.gameEvents) ? uiState.gameEvents.map((event) => ({ ...event })) : [];
  const nextEventId = events.reduce((largest, event) => Math.max(largest, Number(event.id) || 0), 0) + 1;
  ownerIds.forEach((ownerId) => {
    const duelist = uiState[ownerId];
    if (!duelist) return;
    collectCards(duelist.deck, ownerId, cards);
    collectCards(duelist.hand, ownerId, cards);
    collectCards(duelist.field, ownerId, cards);
    collectCards(duelist.traps, ownerId, cards);
    collectCards(duelist.grave, ownerId, cards);
  });

  const phase = enginePhaseFromUiPhase(uiState.phase);
  return {
    cards,
    cardDefinitions,
    cardDefinitionsComplete: Boolean(uiState.cardDefinitionsComplete),
    players: {
      player: uiDuelistToEngine(uiState.player),
      ai: uiDuelistToEngine(uiState.ai)
    },
    turn: {
      playerId: uiState.turn || "player",
      phase
    },
    machine: projectMachineStateFromEvents(events, phase),
    abilities: {
      player: uiAbilityEntries(uiState.player),
      ai: uiAbilityEntries(uiState.ai)
    },
    events,
    continuousEffects: projectContinuousEffectsFromEvents(events),
    nextEventId
  };
}

function uiDuelist(uiState, playerId) {
  const duelist = uiState[playerId];
  if (!duelist) throw new Error(`Unknown UI player ${playerId}`);
  return duelist;
}

function removeCardFromUiState(uiState, cardId) {
  for (const ownerId of ownerIds) {
    const duelist = uiState[ownerId];
    if (!duelist) continue;

    for (const zoneName of ["deck", "hand", "grave"]) {
      const zone = duelist[zoneName];
      const index = zone.findIndex((card) => cardKey(card) === cardId);
      if (index >= 0) {
        return zone.splice(index, 1)[0];
      }
    }

    for (const zoneName of ["field", "traps"]) {
      const zone = duelist[zoneName];
      const index = zone.findIndex((card) => cardKey(card) === cardId);
      if (index >= 0) {
        const card = zone[index];
        zone[index] = null;
        return card;
      }
    }
  }
  throw new Error(`Card ${cardId} was not found in UI state`);
}

function placeInFixedZone(zone, card, index, size) {
  const targetIndex = Number.isInteger(index) && index >= 0 ? index : zone.findIndex((slot) => !slot);
  if (targetIndex < 0 || targetIndex >= size) {
    throw new Error("No fixed UI zone slot is available");
  }
  if (zone[targetIndex]) {
    throw new Error(`UI zone slot ${targetIndex} is already occupied`);
  }
  zone[targetIndex] = card;
}

function insertCardIntoUiState(uiState, card, to) {
  const duelist = uiDuelist(uiState, to.playerId);
  const zoneName = uiZones[to.zone];
  if (!zoneName) throw new Error(`Unsupported UI destination zone ${to.zone}`);
  const zone = duelist[zoneName];

  if (to.zone === "monsterZone" || to.zone === "spellTrapZone") {
    const size = to.zone === "monsterZone" ? MONSTER_ZONE_SIZE : SPELL_TRAP_ZONE_SIZE;
    placeInFixedZone(zone, card, to.index, size);
    return;
  }

  if (Number.isInteger(to.index) && to.index >= 0 && to.index <= zone.length) {
    zone.splice(to.index, 0, card);
  } else {
    zone.push(card);
  }
}

function uiCardFromCreatedEvent(event) {
  const templateId = event.templateId || event.card?.templateId || event.cardId;
  return {
    ...(event.card || {}),
    id: templateId,
    templateId,
    uid: event.cardId,
    engineId: event.cardId,
    ownerId: event.playerId,
    token: Boolean(event.token ?? event.card?.token),
    isToken: Boolean(event.card?.isToken ?? event.token ?? event.card?.token),
    generated: Boolean(event.card?.generated ?? true),
    used: Boolean(event.card?.used),
    changedMode: Boolean(event.card?.changedMode),
    mode: event.card?.mode || "attack",
    tempAtk: Number(event.card?.tempAtk) || 0,
    tempDef: Number(event.card?.tempDef) || 0,
    battleWear: Math.max(0, Number(event.card?.battleWear) || 0)
  };
}

function applyUiAbilityEvent(uiState, event, direction) {
  const duelist = uiDuelist(uiState, event.playerId);
  const uses = Math.max(1, Number(event.uses) || 1) * direction;
  if (event.ability === Ability.directAttack) {
    duelist.directAttacks = Math.max(0, (Number(duelist.directAttacks) || 0) + uses);
  }
  if (event.ability === Ability.extraSummon) {
    duelist.extraSummon = Math.max(0, (Number(duelist.extraSummon) || 0) + uses);
  }
  if (event.ability === Ability.attackReset) {
    duelist.attackResets = Math.max(0, (Number(duelist.attackResets) || 0) + uses);
    duelist.attackResetEntries = Array.isArray(duelist.attackResetEntries) ? duelist.attackResetEntries : [];
    if (direction > 0) {
      duelist.attackResetEntries.push({
        uses: Math.max(1, Number(event.uses) || 1),
        duration: event.duration || "turn",
        sourceCardId: event.sourceCardId || null,
        targetCardId: event.targetCardId || null
      });
    } else {
      const index = duelist.attackResetEntries.findIndex((entry) =>
        entry.uses > 0
        && (!event.sourceCardId || entry.sourceCardId === event.sourceCardId)
        && (!event.targetCardId || entry.targetCardId === event.targetCardId)
      );
      if (index >= 0) {
        duelist.attackResetEntries[index].uses -= Math.max(1, Number(event.uses) || 1);
        if (duelist.attackResetEntries[index].uses <= 0) {
          duelist.attackResetEntries.splice(index, 1);
        }
      }
    }
  }
  if (event.ability === Ability.skipAttackLock) {
    duelist.attacksSkipped = direction > 0;
  }
}

export function applyUiGameEvents(uiState, events = []) {
  events.forEach((event) => {
    if (event.type === "TURN_STARTED") {
      const duelist = uiDuelist(uiState, event.playerId);
      uiState.turn = event.playerId;
      uiState.phase = PHASES.draw;
      uiState.timing = "draw";
      uiState.autoEnding = false;
      duelist.attacksSkipped = false;
      duelist.comboThisTurn = false;
      duelist.comboFlags = {};
      duelist.normalSummonsUsed = 0;
    }
    if (event.type === "TURN_ENDED") {
      uiState.turn = event.playerId;
      uiState.phase = PHASES.end;
      uiState.timing = TIMINGS.end;
      uiState.autoEnding = false;
      uiState.actionWindow = null;
      uiState.actionWindowId = null;
      uiState.actionWindowReason = "";
      uiState.actionDeadline = 0;
    }
    if (event.type === "COMBO_TRIGGERED") {
      const duelist = uiDuelist(uiState, event.playerId);
      duelist.comboFlags = duelist.comboFlags || {};
      duelist.comboFlags[event.comboId] = true;
    }
    if (event.type === "CHARACTER_PASSIVE_TRIGGERED") {
      uiDuelist(uiState, event.playerId).comboThisTurn = true;
    }
    if (event.type === "PHASE_CHANGED") {
      uiState.phase = event.to;
      uiState.timing = uiTimingByPhase[event.to] || uiState.timing;
    }
    if (event.type === "ACTION_WINDOW_OPENED") {
      uiState.actionWindow = event.window;
      uiState.actionWindowId = event.windowId;
      uiState.actionWindowReason = event.reason || "";
      uiState.actionDeadline = Math.max(0, Number(event.deadline) || 0);
      uiState.timing = uiTimingByActionWindow[event.window] || uiState.timing;
    }
    if (event.type === "RESPONSE_WINDOW_OPENED") {
      const openedAt = Math.max(0, Number(event.openedAt) || Number(event.id) || 0);
      uiState.actionWindow = ACTION_WINDOWS.response;
      uiState.actionWindowId = event.windowId || `${ACTION_WINDOWS.response}:${openedAt}`;
      uiState.actionWindowReason = event.prompt || "response-window";
      uiState.actionDeadline = Math.max(0, Number(event.deadline) || openedAt);
      uiState.timing = TIMINGS.responseWindow;
      uiState.autoEnding = false;
    }
    if (event.type === "RESPONSE_WINDOW_CLOSED") {
      if (uiState.actionWindow === ACTION_WINDOWS.response) {
        uiState.actionWindow = null;
        uiState.actionWindowId = null;
        uiState.actionWindowReason = "";
        uiState.actionDeadline = 0;
      }
      uiState.timing = event.resumeTiming || uiTimingByPhase[uiState.phase] || uiState.timing;
    }
    if (event.type === "AUTO_END_REQUESTED") {
      uiState.autoEnding = true;
    }
    if (event.type === "AUTO_END_CANCELED" || event.type === "AUTO_END_COMMITTED") {
      uiState.autoEnding = false;
      if (uiState.actionWindow === "autoEnd") {
        uiState.actionWindow = null;
        uiState.actionWindowId = null;
        uiState.actionWindowReason = "";
        uiState.actionDeadline = 0;
      }
    }
    if (event.type === "CARD_CREATED") {
      insertCardIntoUiState(uiState, uiCardFromCreatedEvent(event), event.to || { playerId: event.playerId, zone: "monsterZone" });
      return;
    }
    if (event.type === "TOKEN_REMOVED") {
      removeCardFromUiState(uiState, event.cardId);
      return;
    }
    if (event.type === "CARD_MOVED") {
      const card = removeCardFromUiState(uiState, event.cardId);
      insertCardIntoUiState(uiState, card, event.to);
      return;
    }
    if (event.type === "CARD_DESTRUCTION_PREVENTED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.destructionProtectionUsed = event.afterProtectionUsed !== false;
    }
    if (event.type === "MONSTER_SUMMONED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.mode = event.mode || "attack";
      card.used = Boolean(event.used);
      card.attackLockReason = event.attackLockReason || null;
      card.changedMode = Boolean(event.changedMode);
      card.tempAtk = Number(event.tempAtk) || 0;
      card.tempDef = Number(event.tempDef) || 0;
      card.battleWear = Math.max(0, Number(event.battleWear) || 0);
      card.destructionProtectionUsed = Boolean(event.destructionProtectionUsed);
    }
    if (event.type === "NORMAL_SUMMON_USED") {
      const duelist = uiDuelist(uiState, event.playerId);
      duelist.normalSummonsUsed = Math.max(0, Number(event.after) || 0);
    }
    if (event.type === "MONSTER_READIED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.used = false;
    }
    if (event.type === "MONSTER_USED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.used = event.afterUsed !== false;
    }
    if (event.type === "MONSTER_MODE_CHANGED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.mode = event.to;
      card.changedMode = event.afterChangedMode !== false;
    }
    if (event.type === "MONSTER_TURN_RESET") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.used = Boolean(event.afterUsed);
      card.changedMode = Boolean(event.afterChangedMode);
      card.attackLockReason = event.afterAttackLockReason || null;
      if ("afterDestructionProtectionUsed" in event) {
        card.destructionProtectionUsed = Boolean(event.afterDestructionProtectionUsed);
      }
    }
    if (event.type === "BATTLE_WEAR_APPLIED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.battleWear = Math.max(0, Number(event.after) || 0);
      card.tempAtk = Number(event.tempAtkAfter);
      card.tempDef = Number(event.tempDefAfter);
    }
    if (event.type === "CARDS_DRAWN") {
      const duelist = uiDuelist(uiState, event.playerId);
      (event.cardIds || []).forEach((cardId) => {
        const card = removeCardFromUiState(uiState, cardId);
        duelist.hand.push(card);
      });
    }
    if (event.type === "LP_HEALED") {
      const duelist = uiDuelist(uiState, event.playerId);
      duelist.lp = Math.min(MAX_LP, duelist.lp + Math.max(0, Number(event.amount) || 0));
    }
    if (event.type === "DAMAGE_DEALT") {
      const duelist = uiDuelist(uiState, event.playerId);
      const pierced = Math.max(0, Number(event.shieldPierced) || 0);
      const blocked = Math.max(0, Number(event.blocked) || 0);
      duelist.shield = Math.max(0, (Number(duelist.shield) || 0) - pierced - blocked);
      duelist.lp = Math.max(0, duelist.lp - Math.max(0, Number(event.amount) || 0));
    }
    if (event.type === "GAME_OVER_DECLARED") {
      uiState.gameOver = true;
      uiState.gameOverWinner = event.winnerId || null;
      uiState.gameOverLosers = Array.isArray(event.loserIds) ? event.loserIds.slice() : [];
      uiState.gameOverReason = event.reason || "lp-zero";
      uiState.autoEnding = false;
      uiState.actionWindow = "gameOver";
      uiState.actionWindowId = event.windowId || `game-over-${event.id}`;
      uiState.actionWindowReason = event.reason || "game-over";
      uiState.actionDeadline = 0;
      uiState.timing = uiTimingByActionWindow.gameOver;
    }
    if (event.type === "SHIELD_GAINED") {
      const duelist = uiDuelist(uiState, event.playerId);
      duelist.shield = Math.min(MAX_SHIELD, (Number(duelist.shield) || 0) + Math.max(0, Number(event.amount) || 0));
    }
    if (event.type === "STAT_MODIFIED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card[event.stat] = Number(event.after);
    }
    if (event.type === "ABILITY_GRANTED") {
      applyUiAbilityEvent(uiState, event, 1);
    }
    if (event.type === "ABILITY_SPENT") {
      applyUiAbilityEvent(uiState, event, -1);
    }
    if (event.type === "TURN_ABILITIES_EXPIRED") {
      const duelist = uiDuelist(uiState, event.playerId);
      duelist.directAttacks = 0;
      duelist.extraSummon = 0;
      duelist.attackResets = 0;
      duelist.attackResetEntries = [];
      if ((event.abilities || []).some((entry) => entry.ability === Ability.skipAttackLock)) {
        duelist.attacksSkipped = false;
      }
    }
  });
  uiState.gameEvents = Array.isArray(uiState.gameEvents) ? uiState.gameEvents : [];
  uiState.gameEvents.push(...events.map((event) => ({ ...event })));
  return events;
}

export function canDispatchSpellFromUiState(card) {
  const duration = getCardEffectDefinition(card?.effect)?.duration;
  return card?.type === "spell" && Boolean(spellDefinition(card.effect)) && (duration === ONE_SHOT_EFFECT || duration === CONTINUOUS_EFFECT);
}

export function canDispatchSummonEffectFromUiState(card) {
  return card?.type === "monster" && getCardEffectDefinition(card.onSummon)?.duration === ONE_SHOT_EFFECT;
}

export function canDispatchTrapFromUiState(card) {
  const effectId = card?.trigger || card?.effect;
  return card?.type === "trap" && Boolean(trapDefinition(effectId)) && getCardEffectDefinition(effectId)?.duration === ONE_SHOT_EFFECT;
}

export function explainActivateSpellFromUiState(uiState, playerId, rivalId, handIndex, targetInfo = null) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) return { ok: false, reason: "没有选中手牌。", engineReason: "No hand card at index" };
  if (card.type !== "spell") return { ok: false, reason: "这张卡不是魔法卡。", engineReason: "Selected card is not a spell" };
  if (!canDispatchSpellFromUiState(card)) {
    return {
      ok: false,
      reason: "这张魔法卡还没有接入规则引擎。",
      engineReason: `Spell effect ${card.effect || "(none)"} is not engine-backed`
    };
  }

  const action = {
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: cardKey(card)
  };
  const targetCardId = targetCardIdForSpell(uiState, playerId, rivalId, card, targetInfo);
  if (targetCardId) action.targetCardId = targetCardId;
  const duration = getCardEffectDefinition(card.effect)?.duration;
  if (duration === CONTINUOUS_EFFECT) {
    action.index = duelist.traps.findIndex((slot) => !slot);
  }

  return explainUiAction(buildEngineStateFromUiState(uiState), action, "发动这张卡");
}

export function explainFusionSummonFromUiState(uiState, playerId, rivalId, handIndex, options = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) return { ok: false, reason: "No hand card at index", engineReason: "No hand card at index" };
  if (!isFusionSpell(card)) {
    return { ok: false, reason: "Selected card is not a fusion spell", engineReason: "Selected card is not a fusion spell" };
  }
  const fusion = selectedFusionOption(card, options);
  if (!fusion) {
    return { ok: false, reason: "Select a fusion result", engineReason: "Fusion spell requires an explicit fusion result selection" };
  }

  const materialIndexes = normalizedFusionIndexes(duelist, card, options);
  const materialCardIds = fusionMaterialCardIdsFromUiState(duelist, card, options);
  const selectedFieldIndexes = duelist.field
    .map((entry, index) => materialCardIds.includes(cardKey(entry)) ? index : -1)
    .filter((index) => index >= 0);
  const index = fusionSummonSlotIndex(duelist, selectedFieldIndexes.length ? selectedFieldIndexes : materialIndexes, options.fieldIndex);
  if (index < 0) return { ok: false, reason: "No monster zone slot is available", engineReason: "No monster zone slot is available" };

  return explainUiAction(buildEngineStateFromUiState(uiState), {
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: cardKey(card),
    fusionResultTemplateId: fusion.resultTemplateId,
    materialCardIds,
    index
  }, "Fusion summon");
}

export function explainSummonMonsterFromUiState(uiState, playerId, handIndex, fieldIndex = null, options = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) return { ok: false, reason: "没有选中手牌。", engineReason: "No hand card at index" };
  if (card.type !== "monster") return { ok: false, reason: "这张卡不是怪兽卡。", engineReason: "Selected card is not a monster" };

  const tributeIndexes = normalizedTributeIndexes(duelist, card, options);
  const emptyIndex = duelist.field.findIndex((slot) => !slot);
  const index = Number.isInteger(fieldIndex)
    ? fieldIndex
    : emptyIndex >= 0
      ? emptyIndex
      : tributeIndexes[0] ?? -1;
  if (index >= 0 && duelist.field[index] && tributeIndexes.includes(index)) {
    const engineState = buildEngineStateFromUiState(uiState);
    const cardId = cardKey(card);
    if (engineState.cards[cardId] && !canDispatchSummonEffectFromUiState(card)) {
      engineState.cards[cardId] = { ...engineState.cards[cardId], onSummon: null };
    }
    const tributeCardIds = tributeCardIdsFromUiState(duelist, card, options);
    return explainUiAction(engineState, {
      type: "SUMMON_MONSTER",
      playerId,
      cardId,
      index,
      ...(tributeCardIds.length ? { tributeCardIds } : {})
    }, "召唤这只怪兽");
  }
  if (index < 0) return { ok: false, reason: "召唤区已满。", engineReason: "No monster zone slot is available" };
  if (duelist.field[index]) return { ok: false, reason: "这个召唤区已有怪兽。", engineReason: "Monster zone slot is occupied" };

  const engineState = buildEngineStateFromUiState(uiState);
  const cardId = cardKey(card);
  if (engineState.cards[cardId] && !canDispatchSummonEffectFromUiState(card)) {
    engineState.cards[cardId] = { ...engineState.cards[cardId], onSummon: null };
  }

  const tributeCardIds = tributeCardIdsFromUiState(duelist, card, options);

  return explainUiAction(engineState, {
    type: "SUMMON_MONSTER",
    playerId,
    cardId,
    index,
    ...(tributeCardIds.length ? { tributeCardIds } : {})
  }, "召唤这只怪兽");
}

export function explainChangeMonsterModeFromUiState(uiState, playerId, fieldIndex, mode = null) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.field[fieldIndex];
  if (!card) return { ok: false, reason: "请选择你场上的怪兽。", engineReason: "No monster at index" };
  const action = {
    type: "CHANGE_MONSTER_MODE",
    playerId,
    cardId: cardKey(card)
  };
  if (mode) action.mode = mode;
  return explainUiAction(buildEngineStateFromUiState(uiState), action, "切换表示");
}

export function explainSetTrapFromUiState(uiState, playerId, handIndex, trapIndex = null) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) return { ok: false, reason: "没有选中手牌。", engineReason: "No hand card at index" };
  if (card.type !== "trap") return { ok: false, reason: "这张卡不是陷阱卡。", engineReason: "Selected card is not a trap" };

  const index = Number.isInteger(trapIndex) ? trapIndex : duelist.traps.findIndex((slot) => !slot);
  if (index < 0) return { ok: false, reason: "魔陷区已满。", engineReason: "No spell trap zone slot is available" };
  if (duelist.traps[index]) return { ok: false, reason: "这个魔陷区已有卡牌。", engineReason: "Spell trap zone slot is occupied" };

  return explainUiAction(buildEngineStateFromUiState(uiState), {
    type: "SET_TRAP",
    playerId,
    cardId: cardKey(card),
    index
  }, "盖放这张陷阱");
}

export function explainDeclareAttackFromUiState(uiState, playerId, rivalId, attackerIndex, targetIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const rival = uiDuelist(uiState, rivalId);
  const attacker = duelist.field[attackerIndex];
  if (!attacker) return { ok: false, reason: "没有选中攻击怪兽。", engineReason: "No attacker at index" };
  const target = targetIndex >= 0 ? rival.field[targetIndex] : null;
  if (targetIndex >= 0 && !target) {
    return { ok: false, reason: "不能攻击空的怪兽区。", engineReason: `No battle target at index ${targetIndex}` };
  }

  const action = {
    type: "DECLARE_ATTACK",
    playerId,
    rivalId,
    attackerCardId: cardKey(attacker)
  };
  if (target) action.targetCardId = cardKey(target);

  return explainUiAction(buildEngineStateFromUiState(uiState), action, "攻击");
}

export function getLegalActionsFromUiState(uiState, playerId = uiState.turn || "player") {
  const engineState = buildEngineStateFromUiState(uiState);
  stripNonEngineSummonEffects(engineState);
  return getLegalActions(engineState, playerId);
}

export function getBattleLegalActionsFromUiState(uiState, playerId = uiState.turn || "player") {
  if (![PHASES.main, PHASES.battle].includes(uiState.phase) ||
      ![ACTION_WINDOWS.main, ACTION_WINDOWS.battle].includes(uiState.actionWindow)) {
    return getLegalActionsFromUiState(uiState, playerId);
  }
  return getLegalActionsFromUiState({
    ...uiState,
    phase: PHASES.battle,
    timing: TIMINGS.battleOpen,
    actionWindow: ACTION_WINDOWS.battle,
    actionWindowId: null,
    actionWindowReason: "battle projection",
    actionDeadline: 0,
    autoEnding: false
  }, playerId);
}

function otherUiPlayerId(playerId) {
  return ownerIds.find((ownerId) => ownerId !== playerId) || "ai";
}

function actionTargetIndex(uiState, rivalId, action) {
  if (!action.targetCardId) return -1;
  return uiDuelist(uiState, rivalId).field.findIndex((card) => cardKey(card) === action.targetCardId);
}

export function projectBattleFromUiState(uiState, playerId = uiState.turn || "player", options = {}) {
  const rivalId = options.rivalId || otherUiPlayerId(playerId);
  const legal = getLegalActionsFromUiState(uiState, playerId);
  const battleLegal = getBattleLegalActionsFromUiState(uiState, playerId);
  const attackerIndex = Number.isInteger(options.attackerIndex) ? options.attackerIndex : -1;
  const attacker = attackerIndex >= 0 ? uiDuelist(uiState, playerId).field[attackerIndex] : null;
  const attackerCardId = cardKey(attacker);
  const attackActions = (battleLegal.actions?.declareAttack || [])
    .filter((action) => !attackerCardId || action.attackerCardId === attackerCardId)
    .map((action) => ({
      ...action,
      targetIndex: actionTargetIndex(uiState, rivalId, action),
      direct: !action.targetCardId
    }))
    .filter((action) => action.direct || action.targetIndex >= 0);
  const targetIndexes = attackActions
    .filter((action) => !action.direct)
    .map((action) => action.targetIndex);
  const inBattleWindow = uiState.phase === PHASES.battle && uiState.actionWindow === ACTION_WINDOWS.battle;
  const inAttackIntentWindow = [PHASES.main, PHASES.battle].includes(uiState.phase) &&
    [ACTION_WINDOWS.main, ACTION_WINDOWS.battle].includes(uiState.actionWindow);
  const hasBattleAction = Boolean(
    battleLegal.can.declareAttack ||
    battleLegal.can.activateCard ||
    battleLegal.can.setTrap
  );

  return {
    playerId,
    rivalId,
    legal,
    battleLegal,
    inBattleWindow,
    inAttackIntentWindow,
    canEnterBattle: uiState.phase === PHASES.main && uiState.actionWindow === ACTION_WINDOWS.main && hasBattleAction,
    hasBattleAction,
    canAttack: Boolean(battleLegal.can.declareAttack),
    attackerCanAttack: Boolean(attackerCardId && attackActions.length),
    targetIndexes,
    canDirectAttack: attackActions.some((action) => action.direct),
    attackActions
  };
}

function stripNonEngineSummonEffects(engineState) {
  Object.values(engineState.cards || {}).forEach((card) => {
    if (card?.type === "monster" && card.onSummon && getCardEffectDefinition(card.onSummon)?.duration !== ONE_SHOT_EFFECT) {
      card.onSummon = null;
    }
  });
}

function explainUiAction(engineState, action, actionLabel) {
  const result = explainActionLegality(engineState, action);
  return result.ok
    ? { ok: true, reason: "", engineReason: "" }
    : { ok: false, reason: localizeEngineRuleReason(result.reason, actionLabel), engineReason: result.reason };
}

function localizeEngineRuleReason(message = "", actionLabel = "操作") {
  if (/not legal during/.test(message)) return `当前阶段不能${actionLabel}。`;
  if (/requires action\.targetCardId/.test(message)) return "需要先选择一个合法目标。";
  if (/not in .*monsterZone/.test(message)) return "目标不在合法怪兽区。";
  if (/not in .*spellTrapZone/.test(message)) return "目标不在合法魔陷区。";
  if (/not in .*grave/.test(message)) return "目标不在墓地。";
  if (/requires a monster target/.test(message)) return "目标必须是墓地中的怪兽。";
  if (/requires at least .* empty monster zone/.test(message)) return "召唤区空位不足。";
  if (/requires at least .* cards in deck/.test(message)) return "卡组剩余数量不足。";
  if (/requires LP at most/.test(message)) return "生命值还没有降到发动条件。";
  if (/is not a monster/.test(message)) return "这张卡不是怪兽卡。";
  if (/is not a trap/.test(message)) return "这张卡不是陷阱卡。";
  if (/has no normal or extra summon/.test(message)) return "本回合没有可用的通常召唤或额外召唤次数。";
  if (/monsterZone is full/.test(message)) return "召唤区已满。";
  if (/spellTrapZone is full/.test(message)) return "魔陷区已满。";
  if (/already attacked/.test(message)) return "这只怪兽已经攻击过。";
  if (/already changed mode/.test(message)) return "这只怪兽本回合已经切换过表示。";
  if (/cannot change mode after attacking/.test(message)) return "这只怪兽攻击后不能再切换表示。";
  if (/Defense position monsters cannot attack/.test(message)) return "守备表示怪兽不能攻击。";
  if (/must attack a monster/.test(message)) return "对方场上还有怪兽，不能直接攻击玩家。";
  if (/skipped attacks/.test(message)) return "本回合已经跳过攻击，不能再攻击。";
  if (/not the strongest monster/.test(message)) return "这张卡只能选择规则指定的最高攻击力目标。";
  if (/protected by target resistance/.test(message)) return "目标拥有神格目标抗性，不能成为对手效果的指定目标。";
  if (/has no legal target/.test(message)) return "这张卡没有可指定的合法目标。";
  if (/requires at least|requires elements/.test(message)) return "场上属性或数量条件不足。";
  if (/requires no .*spellTrapZone/.test(message)) return "必须先清除指定压制卡。";
  if (/cannot be the source card/.test(message)) return "不能选择这张卡自己作为目标。";
  return `规则引擎判定不能${actionLabel}：${message}`;
}

function strongestMonsterId(uiState, playerId, { sourceCard = null, sourceOwner = "" } = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const candidates = duelist.field.filter((card) => canEffectTargetCard(sourceCard, card, {
    sourceOwner,
    targetOwner: playerId
  }));
  if (!candidates.length) return null;
  return cardKey(candidates.slice().sort((left, right) => totalAtk(right) - totalAtk(left))[0]);
}

function firstGraveCardIdExcept(uiState, playerId, excludedCardId) {
  const duelist = uiDuelist(uiState, playerId);
  const candidate = duelist.grave.find((card) => cardKey(card) !== excludedCardId);
  return cardKey(candidate);
}

function firstGraveMonsterCardId(uiState, playerId) {
  const duelist = uiDuelist(uiState, playerId);
  const candidate = duelist.grave.find((card) => card?.type === "monster");
  return cardKey(candidate);
}

function firstSpellTrapCardId(uiState, playerId) {
  const duelist = uiDuelist(uiState, playerId);
  const candidate = duelist.traps.find(Boolean);
  return cardKey(candidate);
}

function targetCardIdForSpell(uiState, playerId, rivalId, card, targetInfo) {
  const explicit = cardKey(targetInfo?.card);
  if (explicit) return explicit;
  const sourceCardId = cardKey(card);
  const definition = spellDefinition(card.effect);
  const source = { sourceCard: card, sourceOwner: playerId };
  if (card.effect === "buff500") return strongestMonsterId(uiState, playerId, source);
  if (card.effect === "battleTrance") return strongestMonsterId(uiState, playerId, source);
  if (card.effect === "rallyAttack") return strongestMonsterId(uiState, playerId, source);
  if (card.effect === "pierceLine") return strongestMonsterId(uiState, rivalId, source);
  if (card.effect === "graveReturn") return firstGraveCardIdExcept(uiState, playerId, sourceCardId);
  if (card.effect === "graveRevive") return firstGraveMonsterCardId(uiState, playerId);
  if (definition?.target === "ownMonster") return strongestMonsterId(uiState, playerId, source);
  if (definition?.target === "enemyMonster") return strongestMonsterId(uiState, rivalId, source);
  if (definition?.target === "enemySpellTrap") return firstSpellTrapCardId(uiState, rivalId);
  return null;
}

function findUiCard(uiState, cardId) {
  for (const ownerId of ownerIds) {
    const duelist = uiState[ownerId];
    if (!duelist) continue;
    for (const zoneName of ["deck", "hand", "grave", "field", "traps"]) {
      const card = duelist[zoneName].find((entry) => cardKey(entry) === cardId);
      if (card) return card;
    }
  }
  return null;
}

export function dispatchSetTrapFromUiState(uiState, playerId, handIndex, trapIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "SET_TRAP",
    playerId,
    cardId: cardKey(card),
    index: trapIndex
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchActivateTrapFromUiState(uiState, playerId, rivalId, trapIndex, context = {}) {
  const { action } = trapResponseAction(uiState, playerId, rivalId, trapIndex, context);
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

function trapResponseAction(uiState, playerId, rivalId, trapIndex, context = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const rival = uiDuelist(uiState, rivalId);
  const card = duelist.traps[trapIndex];
  if (!card) throw new Error(`No trap card at index ${trapIndex}`);
  if (!canDispatchTrapFromUiState(card)) {
    throw new Error(`Trap effect ${card.trigger || card.effect || "(none)"} is not engine-backed`);
  }

  const action = {
    type: "ACTIVATE_TRAP",
    playerId,
    rivalId,
    cardId: cardKey(card)
  };
  const attackerCardId = cardKey(context.attacker) || cardKey(rival.field?.[context.attackerIndex]);
  if (attackerCardId) action.attackerCardId = attackerCardId;
  const targetCardId = typeof context.targetCardId === "string"
    ? context.targetCardId
    : cardKey(context.targetCardId);
  if (targetCardId) action.targetCardId = targetCardId;
  if (context.targetEffectId) action.targetEffectId = context.targetEffectId;
  return { card, action };
}

export function dispatchTrapResponseFromUiState(uiState, playerId, rivalId, trapIndex, context = {}) {
  const queuedEvents = dispatchQueueTrapResponseFromUiState(uiState, playerId, rivalId, trapIndex, context);
  const resolutionEvents = dispatchResolveChainFromUiState(uiState, playerId);
  return [...queuedEvents, ...resolutionEvents];
}

export function dispatchQueueTrapResponseFromUiState(uiState, playerId, rivalId, trapIndex, context = {}) {
  const { card, action } = trapResponseAction(uiState, playerId, rivalId, trapIndex, context);
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = [
    ...engine.dispatch({
      type: "ADD_CHAIN_LINK",
      playerId,
      cardId: cardKey(card),
      effectId: card.trigger || card.effect || null,
      targetEffectId: context.targetEffectId || null
    }),
    ...engine.dispatch(action)
  ];
  return applyUiGameEvents(uiState, events);
}

export function dispatchPassResponsePriorityFromUiState(uiState, playerId, nextPlayerId) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "PASS_RESPONSE_PRIORITY",
    playerId,
    nextPlayerId
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchResolveChainFromUiState(uiState, playerId) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({ type: "RESOLVE_CHAIN", playerId });
  return applyUiGameEvents(uiState, events);
}

export function dispatchCloseResponseWindowFromUiState(uiState, playerId, reason = "passed") {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "CLOSE_RESPONSE_WINDOW",
    playerId,
    reason
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchOpenResponseWindowFromUiState(uiState, playerId, {
  timing,
  resumeTiming = timing,
  windowType = "optional",
  triggerEventId = null,
  prompt = null,
  context = {}
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "OPEN_RESPONSE_WINDOW",
    playerId,
    timing,
    resumeTiming,
    windowType,
    triggerEventId,
    prompt,
    context
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchOpenActionWindowFromUiState(uiState, playerId, window, {
  reason = "",
  now = Date.now(),
  timeoutSeconds = 0
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "OPEN_ACTION_WINDOW",
    playerId,
    window,
    reason,
    openedAt: now,
    timeoutSeconds
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchRequestAutoEndFromUiState(uiState, playerId, {
  reason = "",
  now = Date.now(),
  timeoutSeconds = 0
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "REQUEST_AUTO_END",
    playerId,
    reason,
    requestedAt: now,
    timeoutSeconds
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchCancelAutoEndFromUiState(uiState, playerId, {
  reason = "",
  now = Date.now()
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "CANCEL_AUTO_END",
    playerId,
    reason,
    canceledAt: now
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchCommitAutoEndFromUiState(uiState, playerId, {
  reason = "",
  now = Date.now()
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "COMMIT_AUTO_END",
    playerId,
    reason,
    committedAt: now
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchEndTurnFromUiState(uiState, playerId, {
  reason = "",
  endedBy = "manual",
  now = Date.now()
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "END_TURN",
    playerId,
    reason,
    endedBy,
    endedAt: now
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchDeclareAttackFromUiState(uiState, playerId, rivalId, attackerIndex, targetIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const rival = uiDuelist(uiState, rivalId);
  const attacker = duelist.field[attackerIndex];
  if (!attacker) throw new Error(`No attacker at index ${attackerIndex}`);
  const target = targetIndex >= 0 ? rival.field[targetIndex] : null;
  if (targetIndex >= 0 && !target) throw new Error(`No battle target at index ${targetIndex}`);

  const action = {
    type: "DECLARE_ATTACK",
    playerId,
    rivalId,
    attackerCardId: cardKey(attacker)
  };
  if (target) action.targetCardId = cardKey(target);

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchResolveBattleFromUiState(uiState, playerId, rivalId, attackerIndex, targetIndex, options = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const rival = uiDuelist(uiState, rivalId);
  const attacker = duelist.field[attackerIndex];
  if (!attacker) throw new Error(`No attacker at index ${attackerIndex}`);
  const target = targetIndex >= 0 ? rival.field[targetIndex] : null;
  if (targetIndex >= 0 && !target) throw new Error(`No battle target at index ${targetIndex}`);

  const action = {
    type: "RESOLVE_BATTLE",
    playerId,
    rivalId,
    attackerCardId: cardKey(attacker)
  };
  if (target) action.targetCardId = cardKey(target);
  if (options.declarationEventId) action.declarationEventId = options.declarationEventId;

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchMarkMonsterUsedFromUiState(uiState, playerId, fieldIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.field[fieldIndex];
  if (!card) throw new Error(`No monster at index ${fieldIndex}`);

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "MARK_MONSTER_USED",
    playerId,
    cardId: cardKey(card)
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchCancelAttackFromUiState(uiState, playerId, {
  declarationEventId = null,
  consumeAttack = false,
  reason = "canceled"
} = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const action = {
    type: "CANCEL_ATTACK",
    playerId,
    reason,
    consumeAttack
  };
  if (declarationEventId) action.declarationEventId = declarationEventId;
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchSkipRemainingAttacksFromUiState(uiState, playerId) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "SKIP_REMAINING_ATTACKS",
    playerId
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchResolveElementCombosFromUiState(uiState, playerId, rivalId, source = "") {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "RESOLVE_ELEMENT_COMBOS",
    playerId,
    rivalId,
    source
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchChangeMonsterModeFromUiState(uiState, playerId, fieldIndex, mode = null) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.field[fieldIndex];
  if (!card) throw new Error(`No monster at index ${fieldIndex}`);

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const action = {
    type: "CHANGE_MONSTER_MODE",
    playerId,
    cardId: cardKey(card)
  };
  if (mode) action.mode = mode;
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchStartTurnFromUiState(uiState, playerId) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "START_TURN",
    playerId
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchChangePhaseFromUiState(uiState, playerId, phase) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "CHANGE_PHASE",
    playerId,
    phase
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchDrawCardsFromUiState(uiState, playerId, count = 1, options = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "DRAW_CARDS",
    playerId,
    count,
    reason: options.reason || "effect",
    sourceCardId: options.sourceCardId || null
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchResolveTurnDrawFromUiState(uiState, playerId, options = {}) {
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "RESOLVE_TURN_DRAW",
    playerId,
    count: options.count || 1,
    sourceCardId: options.sourceCardId || null
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchSummonMonsterFromUiState(uiState, playerId, handIndex, fieldIndex, options = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);

  const engineState = buildEngineStateFromUiState(uiState);
  const cardId = cardKey(card);
  if (engineState.cards[cardId] && !canDispatchSummonEffectFromUiState(card)) {
    engineState.cards[cardId] = { ...engineState.cards[cardId], onSummon: null };
  }

  const engine = new GameEngine(engineState);
  const tributeCardIds = tributeCardIdsFromUiState(duelist, card, options);
  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId,
    cardId,
    index: fieldIndex,
    ...(tributeCardIds.length ? { tributeCardIds } : {})
  });
  return applyUiGameEvents(uiState, events);
}

export function dispatchActivateSpellFromUiState(uiState, playerId, rivalId, handIndex, targetInfo = null) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);
  if (!canDispatchSpellFromUiState(card)) {
    throw new Error(`Spell effect ${card.effect || "(none)"} is not engine-backed`);
  }

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const action = {
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: cardKey(card)
  };
  const targetCardId = targetCardIdForSpell(uiState, playerId, rivalId, card, targetInfo);
  if (targetCardId) action.targetCardId = targetCardId;
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchFusionSummonFromUiState(uiState, playerId, rivalId, handIndex, options = {}) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);
  if (!isFusionSpell(card)) {
    throw new Error(`Spell ${card.effect || "(none)"} is not a fusion spell`);
  }
  const fusion = selectedFusionOption(card, options);
  if (!fusion) throw new Error("Fusion spell requires an explicit fusion result selection");

  const materialIndexes = normalizedFusionIndexes(duelist, card, options);
  const materialCardIds = fusionMaterialCardIdsFromUiState(duelist, card, options);
  const selectedFieldIndexes = duelist.field
    .map((entry, index) => materialCardIds.includes(cardKey(entry)) ? index : -1)
    .filter((index) => index >= 0);
  const index = fusionSummonSlotIndex(duelist, selectedFieldIndexes.length ? selectedFieldIndexes : materialIndexes, options.fieldIndex);
  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch({
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: cardKey(card),
    fusionResultTemplateId: fusion.resultTemplateId,
    materialCardIds,
    index
  });
  return applyUiGameEvents(uiState, events);
}
