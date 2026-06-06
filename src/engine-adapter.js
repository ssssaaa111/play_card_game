import { Ability, GameEngine, Phase } from './game-engine.js';
import { FIELD_SIZE, MAX_LP, MAX_SHIELD, totalAtk } from './rules.js';
import { PHASES } from './turn-state.js';

const ownerIds = ["player", "ai"];
const engineBackedSpellEffects = new Set(["draw2", "heal700", "buff500", "burn500", "pierceLine", "directStrike", "extraSummon", "shield800", "graveReturn", "rallyAttack", "battleTrance", "lightShadowCombo", "elementEcho", "fireWindCombo"]);
const engineBackedSummonEffects = new Set(["burn200", "draw1", "heal300", "fireBuff", "shield400", "shadowBurn"]);
const engineBackedTrapEffects = new Set(["attackDestroy", "counterBoost", "attackShift", "attackNegate", "redirectAttack", "weakenAttack", "directShield", "directRebound", "summonBurn"]);

const uiZones = {
  deck: "deck",
  hand: "hand",
  monsterZone: "field",
  spellTrapZone: "traps",
  grave: "grave"
};

function cardKey(card) {
  return card?.uid || card?.engineId || card?.id || null;
}

function compactCardIds(cards = []) {
  return cards.filter(Boolean).map(cardKey).filter(Boolean);
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
      ownerId: card.ownerId || ownerId
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
    banished: []
  };
}

function uiAbilityEntries(duelist) {
  return [
    [Ability.directAttack, duelist.directAttacks],
    [Ability.extraSummon, duelist.extraSummon],
    [Ability.attackReset, duelist.attackResets]
  ]
    .filter(([, uses]) => Math.max(0, Number(uses) || 0) > 0)
    .map(([ability, uses]) => ({
      ability,
      uses: Math.max(0, Number(uses) || 0),
      duration: "turn",
      sourceCardId: null
    }));
}

function enginePhaseFromUiPhase(phase) {
  if (phase === PHASES.ready) return Phase.setup;
  return phase || Phase.main;
}

export function buildEngineStateFromUiState(uiState) {
  const cards = {};
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
    players: {
      player: uiDuelistToEngine(uiState.player),
      ai: uiDuelistToEngine(uiState.ai)
    },
    turn: {
      playerId: uiState.turn || "player",
      phase
    },
    machine: {
      phase
    },
    abilities: {
      player: uiAbilityEntries(uiState.player),
      ai: uiAbilityEntries(uiState.ai)
    },
    events: [],
    nextEventId: 1
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

function placeInFixedZone(zone, card, index) {
  const targetIndex = Number.isInteger(index) && index >= 0 ? index : zone.findIndex((slot) => !slot);
  if (targetIndex < 0 || targetIndex >= FIELD_SIZE) {
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
    placeInFixedZone(zone, card, to.index);
    return;
  }

  if (Number.isInteger(to.index) && to.index >= 0 && to.index <= zone.length) {
    zone.splice(to.index, 0, card);
  } else {
    zone.push(card);
  }
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
  }
}

export function applyUiGameEvents(uiState, events = []) {
  events.forEach((event) => {
    if (event.type === "CARD_MOVED") {
      const card = removeCardFromUiState(uiState, event.cardId);
      insertCardIntoUiState(uiState, card, event.to);
      return;
    }
    if (event.type === "MONSTER_SUMMONED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.mode = event.mode || card.mode || "attack";
      card.used = Boolean(event.used);
      card.changedMode = Boolean(event.changedMode);
    }
    if (event.type === "MONSTER_READIED") {
      const card = findUiCard(uiState, event.cardId);
      if (!card) throw new Error(`Card ${event.cardId} was not found in UI state`);
      card.used = false;
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
      const blocked = Math.max(0, Number(event.blocked) || 0);
      duelist.shield = Math.max(0, (Number(duelist.shield) || 0) - blocked);
      duelist.lp = Math.max(0, duelist.lp - Math.max(0, Number(event.amount) || 0));
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
  });
  uiState.gameEvents = Array.isArray(uiState.gameEvents) ? uiState.gameEvents : [];
  uiState.gameEvents.push(...events.map((event) => ({ ...event })));
  return events;
}

export function canDispatchSpellFromUiState(card) {
  return card?.type === "spell" && engineBackedSpellEffects.has(card.effect);
}

export function canDispatchSummonEffectFromUiState(card) {
  return card?.type === "monster" && engineBackedSummonEffects.has(card.onSummon);
}

export function canDispatchTrapFromUiState(card) {
  return card?.type === "trap" && engineBackedTrapEffects.has(card.trigger || card.effect);
}

function strongestMonsterId(uiState, playerId) {
  const duelist = uiDuelist(uiState, playerId);
  const candidates = duelist.field.filter(Boolean);
  if (!candidates.length) return null;
  return cardKey(candidates.slice().sort((left, right) => totalAtk(right) - totalAtk(left))[0]);
}

function firstGraveCardIdExcept(uiState, playerId, excludedCardId) {
  const duelist = uiDuelist(uiState, playerId);
  const candidate = duelist.grave.find((card) => cardKey(card) !== excludedCardId);
  return cardKey(candidate);
}

function targetCardIdForSpell(uiState, playerId, rivalId, card, targetInfo) {
  const explicit = cardKey(targetInfo?.card);
  if (explicit) return explicit;
  const sourceCardId = cardKey(card);
  if (card.effect === "buff500") return strongestMonsterId(uiState, playerId);
  if (card.effect === "battleTrance") return strongestMonsterId(uiState, playerId);
  if (card.effect === "rallyAttack") return strongestMonsterId(uiState, playerId);
  if (card.effect === "pierceLine") return strongestMonsterId(uiState, rivalId);
  if (card.effect === "graveReturn") return firstGraveCardIdExcept(uiState, playerId, sourceCardId);
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
  if (context.targetEffectId) action.targetEffectId = context.targetEffectId;

  const engine = new GameEngine(buildEngineStateFromUiState(uiState));
  const events = engine.dispatch(action);
  return applyUiGameEvents(uiState, events);
}

export function dispatchSummonMonsterFromUiState(uiState, playerId, handIndex, fieldIndex) {
  const duelist = uiDuelist(uiState, playerId);
  const card = duelist.hand[handIndex];
  if (!card) throw new Error(`No hand card at index ${handIndex}`);

  const engineState = buildEngineStateFromUiState(uiState);
  const cardId = cardKey(card);
  if (engineState.cards[cardId] && !canDispatchSummonEffectFromUiState(card)) {
    engineState.cards[cardId] = { ...engineState.cards[cardId], onSummon: null };
  }

  const engine = new GameEngine(engineState);
  const events = engine.dispatch({
    type: "SUMMON_MONSTER",
    playerId,
    cardId,
    index: fieldIndex
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
