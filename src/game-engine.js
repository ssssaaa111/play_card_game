import { FIELD_SIZE, MAX_LP } from "./rules.js";

export const Phase = Object.freeze({
  setup: "setup",
  draw: "draw",
  main: "main",
  battle: "battle",
  end: "end"
});

export const Timing = Object.freeze({
  setup: "setup",
  draw: "draw",
  mainOpen: "mainOpen",
  summon: "summon",
  battleOpen: "battleOpen",
  attackDeclaration: "attackDeclaration",
  damageStep: "damageStep",
  chainResolution: "chainResolution",
  end: "end"
});

export const ResponseWindow = Object.freeze({
  optional: "optional",
  mandatory: "mandatory"
});

export const EffectDuration = Object.freeze({
  oneShot: "oneShot",
  continuous: "continuous"
});

export const Ability = Object.freeze({
  directAttack: "directAttack",
  extraSummon: "extraSummon",
  attackReset: "attackReset",
  skipAttackLock: "skipAttackLock"
});

const ZONE_KEYS = Object.freeze(["deck", "hand", "monsterZone", "spellTrapZone", "grave", "banished"]);
const ZONE_LIMITS = Object.freeze({
  monsterZone: FIELD_SIZE,
  spellTrapZone: FIELD_SIZE
});

const PHASE_ORDER = Object.freeze([Phase.setup, Phase.draw, Phase.main, Phase.battle, Phase.end]);
const TIMINGS = new Set(Object.values(Timing));
const RESPONSE_WINDOWS = new Set(Object.values(ResponseWindow));
const ABILITIES = new Set(Object.values(Ability));

export class GameRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameRuleError";
  }
}

export class GameStateValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameStateValidationError";
  }
}

export const defaultCardEffects = Object.freeze({
  draw1: oneShot([{ op: "drawCards", player: "self", count: 1 }]),
  draw2: oneShot([{ op: "drawCards", player: "self", count: 2 }]),
  burn200: oneShot([{ op: "dealDamage", player: "rival", amount: 200 }]),
  burn500: oneShot([{ op: "dealDamage", player: "rival", amount: 500 }]),
  heal300: oneShot([{ op: "heal", player: "self", amount: 300 }]),
  heal700: oneShot([{ op: "heal", player: "self", amount: 700 }]),
  buff500: oneShot(
    [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 500 }],
    { target: { player: "self", zone: "monsterZone", rule: "strongestAtk" } }
  ),
  pierceLine: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: -400 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -400 },
    { op: "dealDamage", player: "rival", amount: 200 }
  ], { target: { player: "rival", zone: "monsterZone", rule: "strongestAtk" } }),
  attackNegate: oneShot([{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }])
});

export class EffectContext {
  #state;
  #emit;

  constructor(state, emit) {
    this.#state = state;
    this.#emit = emit;
  }

  drawCards(playerId, count, options = {}) {
    const player = requirePlayer(this.#state, playerId);
    const requested = Math.max(0, Number(count) || 0);
    const drawn = player.deck.slice(0, requested);

    for (const cardId of drawn) {
      requireCard(this.#state, cardId);
    }

    this.#emit("CARDS_DRAWN", {
      playerId,
      cardIds: drawn,
      count: drawn.length,
      requested,
      sourceCardId: options.sourceCardId || null
    });
    return drawn;
  }

  dealDamage(playerId, amount, options = {}) {
    const player = requirePlayer(this.#state, playerId);
    const rawAmount = Math.max(0, Number(amount) || 0);
    const actual = Math.min(player.lp, rawAmount);

    this.#emit("DAMAGE_DEALT", {
      playerId,
      amount: actual,
      requested: rawAmount,
      sourceCardId: options.sourceCardId || null
    });
    return actual;
  }

  heal(playerId, amount, options = {}) {
    const player = requirePlayer(this.#state, playerId);
    const rawAmount = Math.max(0, Number(amount) || 0);
    const actual = Math.max(0, Math.min(MAX_LP - player.lp, rawAmount));

    this.#emit("LP_HEALED", {
      playerId,
      amount: actual,
      requested: rawAmount,
      sourceCardId: options.sourceCardId || null
    });
    return actual;
  }

  moveCard(cardId, from, to) {
    requireCard(this.#state, cardId);
    const currentLocations = findCardLocations(this.#state, cardId);

    if (from && !currentLocations.some((location) => sameLocation(location, from))) {
      throw new GameRuleError(`Card ${cardId} is not in ${from.playerId}.${from.zone}`);
    }
    if (!to?.playerId || !to?.zone) {
      throw new GameRuleError("moveCard requires a destination playerId and zone");
    }

    const destinationPlayer = requirePlayer(this.#state, to.playerId);
    const destinationZone = requireZone(destinationPlayer, to.zone);
    const limit = ZONE_LIMITS[to.zone];
    const destinationLengthAfterMove = destinationZone.filter((existingCardId) => existingCardId !== cardId).length;
    if (limit && destinationLengthAfterMove >= limit) {
      throw new GameRuleError(`${to.zone} is full`);
    }

    const source = from || currentLocations[0] || null;
    this.#emit("CARD_MOVED", {
      cardId,
      from: source,
      to: { playerId: to.playerId, zone: to.zone, index: to.index ?? null }
    });
  }

  destroyCard(cardId, options = {}) {
    const card = requireCard(this.#state, cardId);
    const location = findCardLocations(this.#state, cardId)[0] || null;
    const ownerId = location?.playerId || card.ownerId;

    this.moveCard(cardId, location, { playerId: ownerId, zone: "grave" });
    this.#emit("CARD_DESTROYED", {
      cardId,
      playerId: ownerId,
      reason: options.reason || null,
      sourceCardId: options.sourceCardId || null
    });
  }

  summonMonster(playerId, cardId, options = {}) {
    const card = requireCard(this.#state, cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${cardId} is not a monster`);
    }

    this.moveCard(cardId, { playerId, zone: "hand" }, { playerId, zone: "monsterZone", index: options.index });
    this.#emit("MONSTER_SUMMONED", {
      playerId,
      cardId,
      sourceCardId: options.sourceCardId || cardId,
      mode: options.mode || card.mode || "attack",
      used: false,
      changedMode: false
    });
  }

  modifyStat(cardId, stat, amount, options = {}) {
    const card = requireCard(this.#state, cardId);
    if (!["atk", "def", "tempAtk", "tempDef"].includes(stat)) {
      throw new GameRuleError(`Unsupported stat ${stat}`);
    }
    const before = Number(card[stat]) || 0;
    const delta = Number(amount) || 0;

    this.#emit("STAT_MODIFIED", {
      cardId,
      stat,
      before,
      after: before + delta,
      amount: delta,
      sourceCardId: options.sourceCardId || null
    });
  }

  negateEffect(targetEffectId, options = {}) {
    this.#emit("EFFECT_NEGATED", {
      targetEffectId: targetEffectId || null,
      sourceCardId: options.sourceCardId || null
    });
  }
}

export class GameEngine {
  #state;
  #effects;

  constructor(initialState, options = {}) {
    this.#state = normalizeState(clone(initialState));
    this.#effects = normalizeEffectDefinitions({ ...defaultCardEffects, ...(options.cardEffects || {}) });
    assertValidGameState(this.#state);
  }

  getState() {
    return clone(this.#state);
  }

  dispatch(action) {
    if (!action?.type) {
      throw new GameRuleError("dispatch requires an action type");
    }

    const workingState = clone(this.#state);
    const startIndex = workingState.events.length;
    const emit = createEventEmitter(workingState);
    const ctx = new EffectContext(workingState, emit);
    emit("COMMAND_DISPATCHED", {
      playerId: action.playerId || workingState.turn.playerId,
      commandType: action.type,
      command: clone(action)
    });

    switch (action.type) {
      case "ACTIVATE_CARD":
        this.#activateSpell(workingState, ctx, emit, action);
        break;
      case "ACTIVATE_TRAP":
        this.#activateTrap(workingState, ctx, emit, action);
        break;
      case "SUMMON_MONSTER":
        this.#summonMonster(workingState, ctx, emit, action);
        break;
      case "SET_TRAP":
        this.#setTrap(workingState, ctx, emit, action);
        break;
      case "CHANGE_PHASE":
        this.#changePhase(workingState, emit, action);
        break;
      case "OPEN_RESPONSE_WINDOW":
        this.#openResponseWindow(workingState, emit, action);
        break;
      case "ADD_CHAIN_LINK":
        this.#addChainLink(workingState, emit, action);
        break;
      case "RESOLVE_CHAIN":
        this.#resolveChain(workingState, emit, action);
        break;
      case "GRANT_ABILITY":
        this.#grantAbility(workingState, emit, action);
        break;
      case "SPEND_ABILITY":
        this.#spendAbility(workingState, emit, action);
        break;
      default:
        throw new GameRuleError(`Unknown action type ${action.type}`);
    }

    assertValidGameState(workingState);
    this.#state = workingState;
    return clone(this.#state.events.slice(startIndex));
  }

  #activateSpell(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (card.type !== "spell") {
      throw new GameRuleError(`Card ${action.cardId} is not a spell`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    validateEffectTarget(this.#effects[card.effect], state, preparedAction, card);
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "hand" }, { playerId: action.playerId, zone: "grave" });
    runEffect(this.#effects, card.effect, ctx, preparedAction, card);
  }

  #activateTrap(state, ctx, emit, action) {
    requirePlayer(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    const card = requireCardInZone(state, action.playerId, "spellTrapZone", action.cardId);
    if (card.type !== "trap") {
      throw new GameRuleError(`Card ${action.cardId} is not a trap`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    validateEffectTarget(this.#effects[card.onSummon], state, preparedAction, card);
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    runEffect(this.#effects, card.trigger || card.effect, ctx, preparedAction, card);
    ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "spellTrapZone" }, { playerId: action.playerId, zone: "grave" });
  }

  #summonMonster(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main], action.type);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${action.cardId} is not a monster`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    ctx.summonMonster(action.playerId, action.cardId, { index: action.index });
    if (card.onSummon) {
      runEffect(this.#effects, card.onSummon, ctx, preparedAction, card);
    }
  }

  #setTrap(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (card.type !== "trap") {
      throw new GameRuleError(`Card ${action.cardId} is not a trap`);
    }

    ctx.moveCard(
      action.cardId,
      { playerId: action.playerId, zone: "hand" },
      { playerId: action.playerId, zone: "spellTrapZone", index: action.index }
    );
    emit("TRAP_SET", {
      playerId: action.playerId,
      cardId: action.cardId,
      index: action.index ?? null,
      phase: state.turn.phase
    });
  }

  #changePhase(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    if (!PHASE_ORDER.includes(action.phase)) {
      throw new GameRuleError(`Unknown phase ${action.phase}`);
    }

    const before = state.turn.phase;
    emit("PHASE_CHANGED", {
      playerId: action.playerId,
      from: before,
      to: action.phase
    });
  }

  #openResponseWindow(state, emit, action) {
    requirePlayer(state, action.playerId);
    requireTiming(action.timing);
    requireResponseWindow(action.windowType);

    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: action.timing
    });
    emit("RESPONSE_WINDOW_OPENED", {
      playerId: action.playerId,
      timing: action.timing,
      windowType: action.windowType,
      triggerEventId: action.triggerEventId || null,
      prompt: action.prompt || null
    });
  }

  #addChainLink(state, emit, action) {
    requirePlayer(state, action.playerId);
    if (!state.machine.responseWindow) {
      throw new GameRuleError("Cannot add a chain link without an open response window");
    }
    if (action.cardId) {
      requireCard(state, action.cardId);
    }

    emit("CHAIN_LINK_ADDED", {
      playerId: action.playerId,
      cardId: action.cardId || null,
      effectId: action.effectId || null,
      targetEffectId: action.targetEffectId || null,
      timing: state.machine.timing
    });
  }

  #resolveChain(state, emit, action) {
    requirePlayer(state, action.playerId);

    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: Timing.chainResolution
    });
    emit("CHAIN_RESOLVED", {
      playerId: action.playerId,
      resolvedLinks: state.machine.chain.map((link) => ({ ...link }))
    });
    if (state.machine.responseWindow) {
      emit("RESPONSE_WINDOW_CLOSED", {
        playerId: action.playerId,
        timing: state.machine.timing
      });
    }
  }

  #grantAbility(state, emit, action) {
    requirePlayer(state, action.playerId);
    requireAbility(action.ability);

    emit("ABILITY_GRANTED", {
      playerId: action.playerId,
      ability: action.ability,
      uses: Math.max(1, Number(action.uses) || 1),
      duration: action.duration || "turn",
      sourceCardId: action.sourceCardId || null
    });
  }

  #spendAbility(state, emit, action) {
    requirePlayer(state, action.playerId);
    requireAbility(action.ability);
    if (!hasAbility(state, action.playerId, action.ability)) {
      throw new GameRuleError(`${action.playerId} does not have ability ${action.ability}`);
    }

    emit("ABILITY_SPENT", {
      playerId: action.playerId,
      ability: action.ability
    });
  }
}

export function assertValidGameState(state) {
  if (!state || typeof state !== "object") {
    throw new GameStateValidationError("GameState must be an object");
  }
  if (!state.cards || typeof state.cards !== "object") {
    throw new GameStateValidationError("GameState.cards must exist");
  }
  if (!state.players || typeof state.players !== "object") {
    throw new GameStateValidationError("GameState.players must exist");
  }
  if (!state.turn || !state.players[state.turn.playerId]) {
    throw new GameStateValidationError("Current turn player must exist");
  }
  if (!state.machine || typeof state.machine !== "object") {
    throw new GameStateValidationError("GameState.machine must exist");
  }
  if (state.machine.phase !== state.turn.phase) {
    throw new GameStateValidationError("State machine phase must match current turn phase");
  }
  if (!TIMINGS.has(state.machine.timing)) {
    throw new GameStateValidationError(`Unknown timing ${state.machine.timing}`);
  }
  if (!Array.isArray(state.machine.chain)) {
    throw new GameStateValidationError("State machine chain must be an array");
  }
  if (state.machine.responseWindow && !RESPONSE_WINDOWS.has(state.machine.responseWindow.type)) {
    throw new GameStateValidationError(`Unknown response window ${state.machine.responseWindow.type}`);
  }

  const seenCards = new Map();
  for (const player of Object.values(state.players)) {
    if (!player?.id) {
      throw new GameStateValidationError("Every player must have an id");
    }
    if (!Number.isFinite(player.lp)) {
      throw new GameStateValidationError(`Player ${player.id} LP must be a finite number`);
    }

    for (const zone of ZONE_KEYS) {
      const cards = player[zone];
      if (!Array.isArray(cards)) {
        throw new GameStateValidationError(`${player.id}.${zone} must be an array`);
      }

      const limit = ZONE_LIMITS[zone];
      if (limit && cards.length > limit) {
        throw new GameStateValidationError(`${player.id}.${zone} exceeds its limit`);
      }

      for (const cardId of cards) {
        if (!state.cards[cardId]) {
          throw new GameStateValidationError(`${player.id}.${zone} contains missing card ${cardId}`);
        }
        if (seenCards.has(cardId)) {
          throw new GameStateValidationError(`Card ${cardId} exists in multiple zones`);
        }
        seenCards.set(cardId, { playerId: player.id, zone });
      }
    }

    const abilities = state.abilities?.[player.id];
    if (!Array.isArray(abilities)) {
      throw new GameStateValidationError(`${player.id} abilities must be an array`);
    }
    for (const abilityEntry of abilities) {
      if (!ABILITIES.has(abilityEntry.ability)) {
        throw new GameStateValidationError(`Unknown ability ${abilityEntry.ability}`);
      }
      if (!Number.isFinite(abilityEntry.uses) || abilityEntry.uses < 0) {
        throw new GameStateValidationError(`Invalid ability uses for ${abilityEntry.ability}`);
      }
    }
  }

  return true;
}

export function applyGameEvent(state, event, options = {}) {
  if (!event?.type) {
    throw new GameRuleError("GameEvent requires a type");
  }

  switch (event.type) {
    case "CARD_MOVED":
      applyCardMoved(state, event);
      break;
    case "CARDS_DRAWN":
      applyCardsDrawn(state, event);
      break;
    case "DAMAGE_DEALT":
      applyDamageDealt(state, event);
      break;
    case "LP_HEALED":
      applyLpHealed(state, event);
      break;
    case "STAT_MODIFIED":
      applyStatModified(state, event);
      break;
    case "PHASE_CHANGED":
      applyPhaseChanged(state, event);
      break;
    case "TIMING_CHANGED":
      applyTimingChanged(state, event);
      break;
    case "RESPONSE_WINDOW_OPENED":
      applyResponseWindowOpened(state, event);
      break;
    case "RESPONSE_WINDOW_CLOSED":
      applyResponseWindowClosed(state, event);
      break;
    case "CHAIN_LINK_ADDED":
      applyChainLinkAdded(state, event);
      break;
    case "CHAIN_RESOLVED":
      applyChainResolved(state, event);
      break;
    case "ABILITY_GRANTED":
      applyAbilityGranted(state, event);
      break;
    case "ABILITY_SPENT":
      applyAbilitySpent(state, event);
      break;
    case "COMMAND_DISPATCHED":
    case "CARD_ACTIVATED":
    case "TRAP_SET":
    case "CARD_DESTROYED":
    case "EFFECT_NEGATED":
      break;
    case "MONSTER_SUMMONED":
      applyMonsterSummoned(state, event);
      break;
    default:
      throw new GameRuleError(`Unknown GameEvent type ${event.type}`);
  }

  if (options.record !== false) {
    state.events.push(clone(event));
  }
  const eventId = Number(event.id) || 0;
  state.nextEventId = Math.max(Number(state.nextEventId) || 1, eventId + 1);
  return state;
}

function applyCardMoved(state, event) {
  requireCard(state, event.cardId);
  const locations = findCardLocations(state, event.cardId);
  if (event.from && !locations.some((location) => sameLocation(location, event.from))) {
    throw new GameRuleError(`Card ${event.cardId} is not in ${event.from.playerId}.${event.from.zone}`);
  }
  if (!event.to?.playerId || !event.to?.zone) {
    throw new GameRuleError("CARD_MOVED requires a destination playerId and zone");
  }

  for (const location of locations) {
    removeFromZone(requirePlayer(state, location.playerId)[location.zone], event.cardId);
  }

  const destinationPlayer = requirePlayer(state, event.to.playerId);
  const destinationZone = requireZone(destinationPlayer, event.to.zone);
  const limit = ZONE_LIMITS[event.to.zone];
  if (limit && destinationZone.length >= limit) {
    throw new GameRuleError(`${event.to.zone} is full`);
  }

  if (Number.isInteger(event.to.index) && event.to.index >= 0 && event.to.index <= destinationZone.length) {
    destinationZone.splice(event.to.index, 0, event.cardId);
  } else {
    destinationZone.push(event.cardId);
  }
}

function applyCardsDrawn(state, event) {
  const player = requirePlayer(state, event.playerId);
  const drawnIds = Array.isArray(event.cardIds) ? event.cardIds : [];

  for (const cardId of drawnIds) {
    requireCard(state, cardId);
    const topCardId = player.deck.shift();
    if (topCardId !== cardId) {
      throw new GameRuleError(`Draw event expected ${cardId} but deck top was ${topCardId || "(empty)"}`);
    }
    player.hand.push(cardId);
  }
}

function applyDamageDealt(state, event) {
  const player = requirePlayer(state, event.playerId);
  const amount = Math.max(0, Number(event.amount) || 0);
  player.lp = Math.max(0, player.lp - amount);
}

function applyMonsterSummoned(state, event) {
  const card = requireCard(state, event.cardId);
  card.mode = event.mode || card.mode || "attack";
  card.used = Boolean(event.used);
  card.changedMode = Boolean(event.changedMode);
}

function applyLpHealed(state, event) {
  const player = requirePlayer(state, event.playerId);
  const amount = Math.max(0, Number(event.amount) || 0);
  player.lp = Math.min(MAX_LP, player.lp + amount);
}

function applyStatModified(state, event) {
  const card = requireCard(state, event.cardId);
  if (!["atk", "def", "tempAtk", "tempDef"].includes(event.stat)) {
    throw new GameRuleError(`Unsupported stat ${event.stat}`);
  }
  card[event.stat] = Number(event.after);
}

function applyPhaseChanged(state, event) {
  requirePlayer(state, event.playerId);
  if (!PHASE_ORDER.includes(event.to)) {
    throw new GameRuleError(`Unknown phase ${event.to}`);
  }
  state.turn.phase = event.to;
  state.machine.phase = event.to;
  state.machine.timing = timingForPhase(event.to);
  state.machine.responseWindow = null;
  state.machine.chain = [];
}

function applyTimingChanged(state, event) {
  requirePlayer(state, event.playerId);
  requireTiming(event.to);
  state.machine.timing = event.to;
}

function applyResponseWindowOpened(state, event) {
  requirePlayer(state, event.playerId);
  requireTiming(event.timing);
  requireResponseWindow(event.windowType);
  state.machine.responseWindow = {
    playerId: event.playerId,
    type: event.windowType,
    timing: event.timing,
    triggerEventId: event.triggerEventId || null,
    prompt: event.prompt || null
  };
}

function applyResponseWindowClosed(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.responseWindow = null;
}

function applyChainLinkAdded(state, event) {
  requirePlayer(state, event.playerId);
  if (event.cardId) {
    requireCard(state, event.cardId);
  }
  state.machine.chain.push({
    linkId: state.machine.chain.length + 1,
    playerId: event.playerId,
    cardId: event.cardId || null,
    effectId: event.effectId || null,
    targetEffectId: event.targetEffectId || null,
    timing: event.timing || state.machine.timing
  });
}

function applyChainResolved(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.chain = [];
}

function applyAbilityGranted(state, event) {
  requirePlayer(state, event.playerId);
  requireAbility(event.ability);
  const abilities = state.abilities[event.playerId];
  abilities.push({
    ability: event.ability,
    uses: Math.max(1, Number(event.uses) || 1),
    duration: event.duration || "turn",
    sourceCardId: event.sourceCardId || null
  });
}

function applyAbilitySpent(state, event) {
  requirePlayer(state, event.playerId);
  requireAbility(event.ability);
  const abilities = state.abilities[event.playerId];
  const index = abilities.findIndex((entry) => entry.ability === event.ability && entry.uses > 0);
  if (index === -1) {
    throw new GameRuleError(`${event.playerId} does not have ability ${event.ability}`);
  }

  abilities[index].uses -= 1;
  if (abilities[index].uses <= 0) {
    abilities.splice(index, 1);
  }
}

function runEffect(effects, effectId, ctx, action, card) {
  const definition = effects[effectId];
  if (!definition) {
    throw new GameRuleError(`Effect ${effectId || "(none)"} is not implemented for ${card.id}`);
  }
  runEffectDefinition(definition, ctx, action, card);
}

function validateEffectTarget(definition, state, action, card) {
  if (!definition?.target) return;
  if (!action.targetCardId) {
    throw new GameRuleError(`Effect ${card.effect || card.onSummon || card.trigger || card.id} requires action.targetCardId`);
  }

  const playerId = resolvePlayerRef(definition.target.player, action);
  const zone = definition.target.zone;
  const player = requirePlayer(state, playerId);
  const cards = requireZone(player, zone);
  if (!cards.includes(action.targetCardId)) {
    throw new GameRuleError(`Target ${action.targetCardId} is not in ${playerId}.${zone}`);
  }

  const target = requireCard(state, action.targetCardId);
  if (definition.target.rule === "strongestAtk") {
    const candidates = cards.map((cardId) => requireCard(state, cardId));
    const maxAtk = Math.max(...candidates.map(engineTotalAtk));
    if (engineTotalAtk(target) !== maxAtk) {
      throw new GameRuleError(`Target ${action.targetCardId} is not the strongest monster for this effect`);
    }
  }
}

export function getCardEffectDefinition(effectId, effects = defaultCardEffects) {
  const definition = effects[effectId];
  return definition ? clone(definition) : null;
}

function runEffectDefinition(definition, ctx, action, card) {
  if (definition.duration !== EffectDuration.oneShot) {
    throw new GameRuleError(`Effect ${action.cardId} is not a one-shot effect`);
  }
  for (const operation of definition.operations) {
    runEffectOperation(operation, ctx, action, card);
  }
}

function runEffectOperation(operation, ctx, action, card) {
  const source = { sourceCardId: action.cardId || card.id };
  switch (operation.op) {
    case "drawCards":
      return ctx.drawCards(resolvePlayerRef(operation.player, action), operation.count, source);
    case "dealDamage":
      return ctx.dealDamage(resolvePlayerRef(operation.player, action), operation.amount, source);
    case "heal":
      return ctx.heal(resolvePlayerRef(operation.player, action), operation.amount, source);
    case "moveCard":
      return ctx.moveCard(resolveValue(operation.cardId, action, card), resolveValue(operation.from, action, card), resolveValue(operation.to, action, card));
    case "destroyCard":
      return ctx.destroyCard(resolveValue(operation.cardId, action, card), source);
    case "summonMonster":
      return ctx.summonMonster(resolvePlayerRef(operation.player, action), resolveValue(operation.cardId, action, card), { ...source, index: operation.index });
    case "modifyStat":
      return ctx.modifyStat(resolveValue(operation.cardId, action, card), operation.stat, operation.amount, source);
    case "negateEffect":
      return ctx.negateEffect(resolveValue(operation.targetEffectId, action, card), source);
    default:
      throw new GameRuleError(`Unsupported effect operation ${operation.op}`);
  }
}

function resolvePlayerRef(ref, action) {
  if (ref === "self") return action.playerId;
  if (ref === "rival") return action.rivalId;
  return ref;
}

function resolveValue(value, action, card) {
  if (value === "$action.cardId") return action.cardId;
  if (value === "$action.targetCardId") {
    if (!action.targetCardId) {
      throw new GameRuleError("Effect operation requires action.targetCardId");
    }
    return action.targetCardId;
  }
  if (value === "$action.targetEffectId") return action.targetEffectId;
  if (value === "$card.id") return card.id;
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, action, card));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveValue(entry, action, card)]));
  }
  return value;
}

function engineTotalAtk(card) {
  return Math.max(0, (Number(card?.atk) || 0) + (Number(card?.tempAtk) || 0));
}

function oneShot(operations, meta = {}) {
  return {
    ...meta,
    duration: EffectDuration.oneShot,
    operations: operations.map((operation) => ({ ...operation }))
  };
}

function normalizeEffectDefinitions(effects) {
  for (const [effectId, definition] of Object.entries(effects)) {
    if (typeof definition === "function") {
      throw new GameRuleError(`Effect ${effectId} must be declared as DSL, not free code`);
    }
    if (!Object.values(EffectDuration).includes(definition?.duration)) {
      throw new GameRuleError(`Effect ${effectId} has an invalid duration`);
    }
    if (!Array.isArray(definition.operations)) {
      throw new GameRuleError(`Effect ${effectId} must declare operations`);
    }
  }
  return effects;
}

function normalizeState(state) {
  state.events = Array.isArray(state.events) ? state.events : [];
  const largestEventId = state.events.reduce((largest, event) => Math.max(largest, Number(event.id) || 0), 0);
  state.nextEventId = Number.isInteger(state.nextEventId) ? state.nextEventId : largestEventId + 1;
  state.machine = {
    phase: state.turn.phase,
    timing: timingForPhase(state.turn.phase),
    responseWindow: null,
    chain: [],
    ...(state.machine || {}),
    phase: state.turn.phase
  };
  state.abilities = state.abilities && typeof state.abilities === "object" ? state.abilities : {};
  for (const playerId of Object.keys(state.players || {})) {
    state.abilities[playerId] = Array.isArray(state.abilities[playerId]) ? state.abilities[playerId] : [];
  }
  return state;
}

function createEventEmitter(state) {
  return (type, payload = {}) => {
    const event = {
      id: state.nextEventId,
      type,
      ...payload
    };
    applyGameEvent(state, event);
    return event;
  };
}

function requireCurrentTurn(state, playerId) {
  requirePlayer(state, playerId);
  if (state.turn.playerId !== playerId) {
    throw new GameRuleError(`It is not ${playerId}'s turn`);
  }
}

function requirePhase(state, allowedPhases, actionType) {
  if (!allowedPhases.includes(state.turn.phase)) {
    throw new GameRuleError(`${actionType} is not legal during ${state.turn.phase} phase`);
  }
}

function requireTiming(timing) {
  if (!TIMINGS.has(timing)) {
    throw new GameRuleError(`Unknown timing ${timing}`);
  }
}

function requireResponseWindow(windowType) {
  if (!RESPONSE_WINDOWS.has(windowType)) {
    throw new GameRuleError(`Unknown response window ${windowType}`);
  }
}

function requireAbility(ability) {
  if (!ABILITIES.has(ability)) {
    throw new GameRuleError(`Unknown ability ${ability}`);
  }
}

function requirePlayer(state, playerId) {
  const player = state.players[playerId];
  if (!player) {
    throw new GameRuleError(`Unknown player ${playerId}`);
  }
  return player;
}

function requireCard(state, cardId) {
  const card = state.cards[cardId];
  if (!card) {
    throw new GameRuleError(`Unknown card ${cardId}`);
  }
  return card;
}

function requireZone(player, zone) {
  if (!ZONE_KEYS.includes(zone) || !Array.isArray(player[zone])) {
    throw new GameRuleError(`Unknown zone ${zone}`);
  }
  return player[zone];
}

function requireCardInZone(state, playerId, zone, cardId) {
  const player = requirePlayer(state, playerId);
  const cards = requireZone(player, zone);
  if (!cards.includes(cardId)) {
    throw new GameRuleError(`Card ${cardId} is not in ${playerId}.${zone}`);
  }
  const card = requireCard(state, cardId);
  if (card.ownerId && card.ownerId !== playerId) {
    throw new GameRuleError(`Card ${cardId} does not belong to ${playerId}`);
  }
  return card;
}

function findCardLocations(state, cardId) {
  const locations = [];
  for (const player of Object.values(state.players)) {
    for (const zone of ZONE_KEYS) {
      if (player[zone].includes(cardId)) {
        locations.push({ playerId: player.id, zone });
      }
    }
  }
  return locations;
}

function removeFromZone(zoneCards, cardId) {
  let index = zoneCards.indexOf(cardId);
  while (index !== -1) {
    zoneCards.splice(index, 1);
    index = zoneCards.indexOf(cardId);
  }
}

function sameLocation(left, right) {
  return left?.playerId === right?.playerId && left?.zone === right?.zone;
}

function otherPlayerId(state, playerId) {
  const rivalId = Object.keys(state.players).find((id) => id !== playerId);
  if (!rivalId) {
    throw new GameRuleError(`No rival found for ${playerId}`);
  }
  return rivalId;
}

export function hasAbility(state, playerId, ability) {
  requirePlayer(state, playerId);
  requireAbility(ability);
  return (state.abilities?.[playerId] || []).some((entry) => entry.ability === ability && entry.uses > 0);
}

function timingForPhase(phase) {
  return {
    [Phase.setup]: Timing.setup,
    [Phase.draw]: Timing.draw,
    [Phase.main]: Timing.mainOpen,
    [Phase.battle]: Timing.battleOpen,
    [Phase.end]: Timing.end
  }[phase] || Timing.setup;
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
