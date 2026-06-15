import { FIELD_SIZE, MAX_LP, MAX_SHIELD } from "./rules.js";

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
const MONSTER_MODES = new Set(["attack", "defense"]);

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
  shield400: oneShot([{ op: "gainShield", player: "self", amount: 400 }]),
  shield800: oneShot([{ op: "gainShield", player: "self", amount: 800 }]),
  fireBuff: oneShot(
    [{ op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "strongestAtk" }, stat: "tempAtk", amount: 300 }],
    { requirements: [{ type: "minElementCount", player: "self", element: "fire", count: 2 }] }
  ),
  shadowBurn: oneShot(
    [{ op: "dealDamage", player: "rival", amount: 300 }],
    { requirements: [{ type: "minElementCount", player: "self", element: "shadow", count: 2 }] }
  ),
  buff500: oneShot(
    [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 500 }],
    { target: { player: "self", zone: "monsterZone", rule: "strongestAtk" } }
  ),
  pierceLine: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: -400 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -400 },
    { op: "dealDamage", player: "rival", amount: 200 }
  ], { target: { player: "rival", zone: "monsterZone", rule: "strongestAtk" } }),
  directStrike: oneShot([{ op: "grantAbility", player: "self", ability: Ability.directAttack, uses: 1, duration: "turn" }]),
  extraSummon: oneShot([{ op: "grantAbility", player: "self", ability: Ability.extraSummon, uses: 1, duration: "turn" }]),
  rallyAttack: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 },
    {
      op: "readyMonsterOrGrantAbility",
      player: "self",
      cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "firstUsed" },
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn"
    }
  ], { target: { player: "self", zone: "monsterZone", rule: "strongestAtk" } }),
  battleTrance: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
    {
      op: "readyMonsterOrGrantAbility",
      player: "self",
      cardId: "$action.targetCardId",
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn"
    }
  ], { target: { player: "self", zone: "monsterZone", rule: "strongestAtk" } }),
  elementEcho: oneShot([
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 200 },
    { op: "drawCards", player: "self", count: 1 }
  ], { requirements: [{ type: "minDistinctElements", player: "self", count: 2 }] }),
  fireWindCombo: oneShot([
    { op: "dealDamage", player: "rival", amount: 400 },
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 200 }
  ], { requirements: [{ type: "requiredElements", player: "self", elements: ["fire", "wind"] }] }),
  lightShadowCombo: oneShot([
    { op: "gainShield", player: "self", amount: 600 },
    { op: "drawCards", player: "self", count: 1 }
  ]),
  graveReturn: oneShot([
    {
      op: "moveCard",
      cardId: "$action.targetCardId",
      from: { playerId: "$action.playerId", zone: "grave" },
      to: { playerId: "$action.playerId", zone: "deck", index: 0 }
    },
    { op: "drawCards", player: "self", count: 1 }
  ], { target: { player: "self", zone: "grave", rule: "notSource" } }),
  attackDestroy: oneShot([{ op: "destroyCard", cardId: "$action.attackerCardId" }]),
  counterBoost: oneShot([
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" }, stat: "tempAtk", amount: 400 }
  ]),
  attackShift: oneShot([{ op: "gainShield", player: "self", amount: 400 }]),
  attackNegate: oneShot([{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }]),
  redirectAttack: oneShot([]),
  weakenAttack: oneShot([
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempDef", amount: -500 }
  ]),
  directShield: oneShot([{ op: "drawCards", player: "self", count: 1 }]),
  directRebound: oneShot([{ op: "dealDamage", player: "rival", amount: 500 }]),
  summonBurn: oneShot([{ op: "dealDamage", player: "rival", amount: 400 }]),
  chainNegate: oneShot([{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }])
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
    const shieldBefore = Math.max(0, Number(player.shield) || 0);
    const blocked = Math.min(shieldBefore, rawAmount);
    const damageAfterShield = Math.max(0, rawAmount - blocked);
    const actual = Math.min(player.lp, damageAfterShield);

    this.#emit("DAMAGE_DEALT", {
      playerId,
      amount: actual,
      requested: rawAmount,
      blocked,
      shieldBefore,
      shieldAfter: shieldBefore - blocked,
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

  gainShield(playerId, amount, options = {}) {
    const player = requirePlayer(this.#state, playerId);
    const rawAmount = Math.max(0, Number(amount) || 0);
    const before = Math.max(0, Number(player.shield) || 0);
    const actual = Math.max(0, Math.min(MAX_SHIELD - before, rawAmount));

    this.#emit("SHIELD_GAINED", {
      playerId,
      amount: actual,
      requested: rawAmount,
      before,
      after: before + actual,
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
    const cardIds = resolveCardIdInput(this.#state, cardId);
    if (!["atk", "def", "tempAtk", "tempDef"].includes(stat)) {
      throw new GameRuleError(`Unsupported stat ${stat}`);
    }
    const delta = Number(amount) || 0;

    return cardIds.map((targetCardId) => {
      const card = requireCard(this.#state, targetCardId);
      const before = Number(card[stat]) || 0;
      this.#emit("STAT_MODIFIED", {
        cardId: targetCardId,
        stat,
        before,
        after: before + delta,
        amount: delta,
        sourceCardId: options.sourceCardId || null
      });
      return targetCardId;
    });
  }

  negateEffect(targetEffectId, options = {}) {
    this.#emit("EFFECT_NEGATED", {
      targetEffectId: targetEffectId || null,
      sourceCardId: options.sourceCardId || null
    });
  }

  grantAbility(playerId, ability, options = {}) {
    requirePlayer(this.#state, playerId);
    requireAbility(ability);

    if (attackAbilityBlocked(this.#state, playerId, ability)) {
      this.#emit("ABILITY_GRANT_BLOCKED", {
        playerId,
        ability,
        reason: Ability.skipAttackLock,
        sourceCardId: options.sourceCardId || null
      });
      return false;
    }

    this.#emit("ABILITY_GRANTED", {
      playerId,
      ability,
      uses: Math.max(1, Number(options.uses) || 1),
      duration: options.duration || "turn",
      sourceCardId: options.sourceCardId || null
    });
    return true;
  }

  readyMonster(cardId, options = {}) {
    const card = requireCard(this.#state, cardId);
    const beforeUsed = Boolean(card.used);
    if (!beforeUsed) return false;

    this.#emit("MONSTER_READIED", {
      cardId,
      beforeUsed,
      afterUsed: false,
      sourceCardId: options.sourceCardId || null
    });
    return true;
  }

  readyMonsterOrGrantAbility(playerId, cardId, ability, options = {}) {
    if (attackAbilityBlocked(this.#state, playerId, ability)) {
      this.#emit("ABILITY_GRANT_BLOCKED", {
        playerId,
        ability,
        reason: Ability.skipAttackLock,
        sourceCardId: options.sourceCardId || null
      });
      return null;
    }
    const cardIds = resolveCardIdInput(this.#state, cardId);
    const usedCardId = cardIds.find((targetCardId) => Boolean(requireCard(this.#state, targetCardId).used));
    if (usedCardId && this.readyMonster(usedCardId, options)) {
      return usedCardId;
    }
    this.grantAbility(playerId, ability, options);
    return null;
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
      case "DECLARE_ATTACK":
        this.#declareAttack(workingState, emit, action);
        break;
      case "RESOLVE_BATTLE":
        this.#resolveBattle(workingState, ctx, emit, action);
        break;
      case "MARK_MONSTER_USED":
        this.#markMonsterUsed(workingState, emit, action);
        break;
      case "SKIP_REMAINING_ATTACKS":
        this.#skipRemainingAttacks(workingState, emit, action);
        break;
      case "CHANGE_MONSTER_MODE":
        this.#changeMonsterMode(workingState, emit, action);
        break;
      case "START_TURN":
        this.#startTurn(workingState, emit, action);
        break;
      case "DRAW_CARDS":
        this.#drawCards(workingState, ctx, emit, action);
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
      case "CLOSE_RESPONSE_WINDOW":
        this.#closeResponseWindow(workingState, emit, action);
        break;
      case "ADD_CHAIN_LINK":
        this.#addChainLink(workingState, emit, action);
        break;
      case "PASS_RESPONSE_PRIORITY":
        this.#passResponsePriority(workingState, emit, action);
        break;
      case "RESOLVE_CHAIN":
        this.#resolveChain(workingState, ctx, emit, action);
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
    validateEffectRequirements(this.#effects[card.effect], state, preparedAction, card);
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
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    const card = requireCardInZone(state, action.playerId, "spellTrapZone", action.cardId);
    if (card.type !== "trap") {
      throw new GameRuleError(`Card ${action.cardId} is not a trap`);
    }
    let chainLink = null;
    if (state.machine.responseWindow) {
      requireOpenResponseWindow(state, action.playerId);
      chainLink = state.machine.chain.at(-1);
      if (chainLink?.playerId !== action.playerId || chainLink?.cardId !== action.cardId) {
        throw new GameRuleError(`Trap ${action.cardId} must join the current chain before activation`);
      }
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    const effectId = card.trigger || card.effect;
    validateEffectRequirements(this.#effects[effectId], state, preparedAction, card);
    validateEffectTarget(this.#effects[effectId], state, preparedAction, card);
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    if (chainLink) {
      if (chainLink.effectId && chainLink.effectId !== effectId) {
        throw new GameRuleError(`Chain link effect ${chainLink.effectId} does not match trap effect ${effectId}`);
      }
      ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "spellTrapZone" }, { playerId: action.playerId, zone: "grave" });
      emit("CHAIN_LINK_COMMITTED", {
        playerId: action.playerId,
        linkId: chainLink.linkId,
        cardId: action.cardId,
        effectId,
        action: clone(preparedAction)
      });
      return;
    }

    runEffect(this.#effects, effectId, ctx, preparedAction, card);
    ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "spellTrapZone" }, { playerId: action.playerId, zone: "grave" });
  }

  #summonMonster(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main], action.type);
    const player = requirePlayer(state, action.playerId);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${action.cardId} is not a monster`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    if (player.normalSummonsUsed < 1) {
      emit("NORMAL_SUMMON_USED", {
        playerId: action.playerId,
        before: player.normalSummonsUsed,
        after: player.normalSummonsUsed + 1,
        cardId: action.cardId
      });
    } else if (hasAbility(state, action.playerId, Ability.extraSummon)) {
      emit("ABILITY_SPENT", {
        playerId: action.playerId,
        ability: Ability.extraSummon,
        cardId: action.cardId
      });
    } else {
      throw new GameRuleError(`${action.playerId} has no normal or extra summon remaining`);
    }
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    ctx.summonMonster(action.playerId, action.cardId, { index: action.index });
    if (card.onSummon) {
      const skipReason = effectRequirementFailure(this.#effects[card.onSummon], state, preparedAction, card);
      if (skipReason) {
        emit("EFFECT_SKIPPED", {
          playerId: action.playerId,
          cardId: action.cardId,
          effectId: card.onSummon,
          reason: skipReason
        });
        return;
      }
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

  #declareAttack(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const { target, direct } = validateBattleDeclaration(state, action.playerId, rivalId, action);

    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: Timing.attackDeclaration
    });
    const attackEvent = emit("ATTACK_DECLARED", {
      playerId: action.playerId,
      rivalId,
      attackerCardId: action.attackerCardId,
      targetCardId: target?.id || null,
      targetPlayerId: direct ? rivalId : null,
      direct,
      phase: state.turn.phase,
      timing: state.machine.timing
    });
    emit("RESPONSE_WINDOW_OPENED", {
      playerId: rivalId,
      timing: Timing.attackDeclaration,
      windowType: ResponseWindow.optional,
      triggerEventId: attackEvent.id,
      prompt: "attack",
      context: {
        attackerPlayerId: action.playerId,
        rivalId,
        attackerCardId: action.attackerCardId,
        targetCardId: target?.id || null,
        targetPlayerId: direct ? rivalId : null,
        direct
      }
    });
  }

  #resolveBattle(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const { attacker, target, direct } = validateBattleDeclaration(state, action.playerId, rivalId, action);

    let declarationEventId = action.declarationEventId || null;
    if (!declarationEventId) {
      emit("TIMING_CHANGED", {
        playerId: action.playerId,
        from: state.machine.timing,
        to: Timing.attackDeclaration
      });
      const attackEvent = emit("ATTACK_DECLARED", {
        playerId: action.playerId,
        rivalId,
        attackerCardId: action.attackerCardId,
        targetCardId: target?.id || null,
        targetPlayerId: direct ? rivalId : null,
        direct,
        phase: state.turn.phase,
        timing: state.machine.timing
      });
      declarationEventId = attackEvent.id;
    }
    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: Timing.damageStep
    });

    const outcome = describeEngineBattleOutcome(state, action.playerId, rivalId, attacker, target);
    emit("MONSTER_USED", {
      playerId: action.playerId,
      cardId: action.attackerCardId,
      beforeUsed: Boolean(attacker.used),
      afterUsed: true
    });

    if (direct && shouldSpendDirectAttackAbility(state, action.playerId, rivalId, attacker)) {
      emit("ABILITY_SPENT", {
        playerId: action.playerId,
        ability: Ability.directAttack
      });
    }

    if (outcome.rawDamage > 0) {
      const damagePlayerId = outcome.damagePlayerId || null;
      if (damagePlayerId) {
        ctx.dealDamage(damagePlayerId, outcome.rawDamage, { sourceCardId: action.attackerCardId });
      }
    }
    if (outcome.wear > 0 && target) {
      applyBattleWear(emit, target, outcome.wear, action.attackerCardId);
    }
    if (outcome.destroysTarget && target) {
      ctx.destroyCard(target.id, { reason: "battle", sourceCardId: action.attackerCardId });
    }
    if (outcome.destroysAttacker) {
      ctx.destroyCard(action.attackerCardId, { reason: "battle", sourceCardId: target?.id || null });
    }

    resolveAfterAttackEffect(state, ctx, action.playerId, action.attackerCardId);
    consumeAttackResetForMonster(state, emit, action.playerId, action.attackerCardId);

    emit("BATTLE_RESOLVED", {
      playerId: action.playerId,
      rivalId,
      attackerCardId: action.attackerCardId,
      targetCardId: target?.id || null,
      direct,
      declarationEventId,
      outcome
    });
    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: Timing.battleOpen
    });
  }

  #markMonsterUsed(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    const card = requireMonsterInZone(state, action.playerId, "monsterZone", action.cardId, "attacker");
    if (card.used) {
      throw new GameRuleError(`Monster ${action.cardId} has already attacked`);
    }

    emit("MONSTER_USED", {
      playerId: action.playerId,
      cardId: action.cardId,
      beforeUsed: false,
      afterUsed: true
    });
    consumeAttackResetForMonster(state, emit, action.playerId, action.cardId);
  }

  #skipRemainingAttacks(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot skip attacks while a response window is open");
    }
    const player = requirePlayer(state, action.playerId);
    if (player.attacksSkipped || hasAbility(state, action.playerId, Ability.skipAttackLock)) {
      throw new GameRuleError(`${action.playerId} already skipped attacks`);
    }
    const cardIds = player.monsterZone.filter((cardId) => {
      const card = requireCard(state, cardId);
      return card.type === "monster" && card.mode !== "defense" && !card.used;
    });
    if (cardIds.length === 0) {
      throw new GameRuleError(`${action.playerId} has no remaining attacks to skip`);
    }

    cardIds.forEach((cardId) => {
      emit("MONSTER_USED", {
        playerId: action.playerId,
        cardId,
        beforeUsed: false,
        afterUsed: true,
        reason: "skipRemainingAttacks"
      });
    });
    for (const ability of [Ability.attackReset, Ability.directAttack]) {
      while (hasAbility(state, action.playerId, ability)) {
        emit("ABILITY_SPENT", {
          playerId: action.playerId,
          ability,
          reason: "skipRemainingAttacks"
        });
      }
    }
    emit("ABILITY_GRANTED", {
      playerId: action.playerId,
      ability: Ability.skipAttackLock,
      uses: 1,
      duration: "turn",
      sourceCardId: null
    });
    emit("ATTACKS_SKIPPED", {
      playerId: action.playerId,
      cardIds,
      count: cardIds.length
    });
  }

  #changeMonsterMode(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main], action.type);
    const card = requireCardInZone(state, action.playerId, "monsterZone", action.cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${action.cardId} is not a monster`);
    }
    if (card.used) {
      throw new GameRuleError(`Monster ${action.cardId} cannot change mode after attacking`);
    }
    if (card.changedMode) {
      throw new GameRuleError(`Monster ${action.cardId} already changed mode this turn`);
    }

    const before = card.mode || "attack";
    const nextMode = action.mode || (before === "attack" ? "defense" : "attack");
    if (!MONSTER_MODES.has(nextMode)) {
      throw new GameRuleError(`Unknown monster mode ${nextMode}`);
    }
    if (nextMode === before) {
      throw new GameRuleError(`Monster ${action.cardId} is already in ${nextMode} mode`);
    }

    emit("MONSTER_MODE_CHANGED", {
      playerId: action.playerId,
      cardId: action.cardId,
      from: before,
      to: nextMode,
      beforeChangedMode: Boolean(card.changedMode),
      afterChangedMode: true
    });
  }

  #startTurn(state, emit, action) {
    requirePlayer(state, action.playerId);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot start a turn while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot start a turn while a chain is unresolved");
    }

    const previousPlayerId = state.turn.playerId;
    const player = requirePlayer(state, action.playerId);
    const monsterResets = player.monsterZone
      .map((cardId) => requireCard(state, cardId))
      .filter((card) => card.used || card.changedMode)
      .map((card) => ({
        cardId: card.id,
        beforeUsed: Boolean(card.used),
        beforeChangedMode: Boolean(card.changedMode)
      }));
    const expiredAbilities = (state.abilities[action.playerId] || [])
      .filter((entry) => entry.duration === "turn")
      .map((entry) => clone(entry));

    emit("TURN_STARTED", {
      playerId: action.playerId,
      previousPlayerId,
      phase: Phase.draw,
      timing: Timing.draw,
      resetTurnFlags: true
    });
    monsterResets.forEach((reset) => {
      emit("MONSTER_TURN_RESET", {
        playerId: action.playerId,
        ...reset,
        afterUsed: false,
        afterChangedMode: false
      });
    });
    if (expiredAbilities.length > 0) {
      emit("TURN_ABILITIES_EXPIRED", {
        playerId: action.playerId,
        abilities: expiredAbilities
      });
    }
  }

  #drawCards(state, ctx, emit, action) {
    requirePlayer(state, action.playerId);
    const count = Number(action.count);
    if (!Number.isInteger(count) || count <= 0 || count > 20) {
      throw new GameRuleError(`Invalid draw count ${action.count}`);
    }
    const reason = action.reason || "effect";
    if (!new Set(["opening", "turn", "effect"]).has(reason)) {
      throw new GameRuleError(`Unknown draw reason ${reason}`);
    }
    if (reason === "turn") {
      requireCurrentTurn(state, action.playerId);
      requirePhase(state, [Phase.draw], action.type);
    }
    if (reason === "opening") {
      requirePhase(state, [Phase.draw], action.type);
    }

    const drawn = ctx.drawCards(action.playerId, count, {
      sourceCardId: action.sourceCardId || null
    });
    const missing = count - drawn.length;
    if (missing <= 0) return;
    emit("DRAW_FAILED", {
      playerId: action.playerId,
      requested: count,
      drawn: drawn.length,
      missing,
      reason
    });
    ctx.dealDamage(action.playerId, missing * 500, {
      sourceCardId: action.sourceCardId || null
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
    if (action.resumeTiming) requireTiming(action.resumeTiming);
    if (state.machine.responseWindow) {
      throw new GameRuleError("A response window is already open");
    }

    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: action.timing
    });
    emit("RESPONSE_WINDOW_OPENED", {
      playerId: action.playerId,
      timing: action.timing,
      resumeTiming: action.resumeTiming || action.timing,
      windowType: action.windowType,
      triggerEventId: action.triggerEventId || null,
      prompt: action.prompt || null,
      context: clone(action.context || {})
    });
  }

  #addChainLink(state, emit, action) {
    const responseWindow = requireOpenResponseWindow(state, action.playerId);
    if (action.cardId) {
      const card = requireCardInZone(state, action.playerId, "spellTrapZone", action.cardId);
      if (card.type !== "trap") {
        throw new GameRuleError(`Card ${action.cardId} is not a trap`);
      }
    }

    emit("CHAIN_LINK_ADDED", {
      playerId: action.playerId,
      cardId: action.cardId || null,
      effectId: action.effectId || null,
      targetEffectId: action.targetEffectId || null,
      timing: state.machine.timing,
      triggerEventId: responseWindow.triggerEventId || null
    });
  }

  #closeResponseWindow(state, emit, action) {
    const responseWindow = requireOpenResponseWindow(state, action.playerId);
    const resumeTiming = responseWindow.resumeTiming || responseWindow.timing || timingForPhase(state.turn.phase);
    emit("RESPONSE_WINDOW_CLOSED", {
      playerId: action.playerId,
      timing: state.machine.timing,
      triggerEventId: responseWindow.triggerEventId || null,
      reason: action.reason || "passed"
    });
    if (state.machine.timing !== resumeTiming) {
      emit("TIMING_CHANGED", {
        playerId: action.playerId,
        from: state.machine.timing,
        to: resumeTiming
      });
    }
  }

  #passResponsePriority(state, emit, action) {
    requireOpenResponseWindow(state, action.playerId);
    requirePlayer(state, action.nextPlayerId);
    if (action.nextPlayerId === action.playerId) {
      throw new GameRuleError("Response priority must pass to another player");
    }
    emit("RESPONSE_PRIORITY_PASSED", {
      playerId: action.nextPlayerId,
      fromPlayerId: action.playerId,
      toPlayerId: action.nextPlayerId,
      timing: state.machine.timing,
      chainLength: state.machine.chain.length
    });
  }

  #resolveChain(state, ctx, emit, action) {
    const responseWindow = requireOpenResponseWindow(state, action.playerId);
    const resumeTiming = action.resumeTiming || responseWindow.resumeTiming || responseWindow.timing || timingForPhase(state.turn.phase);
    const resolutionOrder = state.machine.chain.slice().reverse();
    const resolutionEventStart = state.events.length;
    const uncommitted = resolutionOrder.find((link) => !link.committed);
    if (uncommitted) {
      throw new GameRuleError(`Chain link ${uncommitted.linkId} has not been committed`);
    }

    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: Timing.chainResolution
    });
    for (const link of resolutionOrder) {
      const card = requireCard(state, link.cardId);
      const effectId = link.effectId || card.trigger || card.effect;
      const preparedAction = clone(link.action || {});
      emit("CHAIN_LINK_RESOLVING", {
        playerId: link.playerId,
        linkId: link.linkId,
        cardId: link.cardId,
        effectId,
        targetEffectId: link.targetEffectId || null
      });
      const negatingEvent = state.events.slice(resolutionEventStart).find((event) =>
        event.type === "EFFECT_NEGATED" && event.targetEffectId === link.cardId
      );
      if (negatingEvent) {
        emit("EFFECT_SKIPPED", {
          playerId: link.playerId,
          cardId: link.cardId,
          effectId,
          reason: "negated",
          sourceCardId: negatingEvent.sourceCardId || null
        });
        emit("CHAIN_LINK_RESOLVED", {
          playerId: link.playerId,
          linkId: link.linkId,
          cardId: link.cardId,
          effectId,
          targetEffectId: link.targetEffectId || null,
          skipped: true
        });
        continue;
      }
      runEffect(this.#effects, effectId, ctx, preparedAction, card);
      emit("CHAIN_LINK_RESOLVED", {
        playerId: link.playerId,
        linkId: link.linkId,
        cardId: link.cardId,
        effectId,
        targetEffectId: link.targetEffectId || null
      });
    }
    emit("CHAIN_RESOLVED", {
      playerId: action.playerId,
      resolvedLinks: resolutionOrder.map((link) => ({ ...link }))
    });
    if (state.machine.responseWindow) {
      emit("RESPONSE_WINDOW_CLOSED", {
        playerId: action.playerId,
        timing: state.machine.timing
      });
    }
    emit("TIMING_CHANGED", {
      playerId: action.playerId,
      from: state.machine.timing,
      to: resumeTiming
    });
  }

  #grantAbility(state, emit, action) {
    requirePlayer(state, action.playerId);
    requireAbility(action.ability);

    if (attackAbilityBlocked(state, action.playerId, action.ability)) {
      emit("ABILITY_GRANT_BLOCKED", {
        playerId: action.playerId,
        ability: action.ability,
        reason: Ability.skipAttackLock,
        sourceCardId: action.sourceCardId || null
      });
      return;
    }

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
    if (player.shield !== undefined && !Number.isFinite(Number(player.shield))) {
      throw new GameStateValidationError(`Player ${player.id} shield must be a finite number`);
    }
    if (!Number.isInteger(player.normalSummonsUsed) || player.normalSummonsUsed < 0) {
      throw new GameStateValidationError(`Player ${player.id} normal summon count must be a non-negative integer`);
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
    case "SHIELD_GAINED":
      applyShieldGained(state, event);
      break;
    case "STAT_MODIFIED":
      applyStatModified(state, event);
      break;
    case "PHASE_CHANGED":
      applyPhaseChanged(state, event);
      break;
    case "TURN_STARTED":
      applyTurnStarted(state, event);
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
    case "RESPONSE_PRIORITY_PASSED":
      applyResponsePriorityPassed(state, event);
      break;
    case "CHAIN_LINK_ADDED":
      applyChainLinkAdded(state, event);
      break;
    case "CHAIN_LINK_COMMITTED":
      applyChainLinkCommitted(state, event);
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
    case "TURN_ABILITIES_EXPIRED":
      applyTurnAbilitiesExpired(state, event);
      break;
    case "NORMAL_SUMMON_USED":
      applyNormalSummonUsed(state, event);
      break;
    case "COMMAND_DISPATCHED":
    case "CARD_ACTIVATED":
    case "TRAP_SET":
    case "CARD_DESTROYED":
    case "EFFECT_NEGATED":
    case "EFFECT_SKIPPED":
    case "DRAW_FAILED":
    case "ATTACKS_SKIPPED":
    case "ABILITY_GRANT_BLOCKED":
    case "CHAIN_LINK_RESOLVING":
    case "CHAIN_LINK_RESOLVED":
      break;
    case "MONSTER_SUMMONED":
      applyMonsterSummoned(state, event);
      break;
    case "MONSTER_READIED":
      applyMonsterReadied(state, event);
      break;
    case "MONSTER_USED":
      applyMonsterUsed(state, event);
      break;
    case "MONSTER_MODE_CHANGED":
      applyMonsterModeChanged(state, event);
      break;
    case "MONSTER_TURN_RESET":
      applyMonsterTurnReset(state, event);
      break;
    case "BATTLE_WEAR_APPLIED":
      applyBattleWearApplied(state, event);
      break;
    case "ATTACK_DECLARED":
    case "BATTLE_RESOLVED":
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
  const blocked = Math.max(0, Number(event.blocked) || 0);
  if (blocked > 0 || player.shield !== undefined) {
    player.shield = Math.max(0, (Number(player.shield) || 0) - blocked);
  }
  player.lp = Math.max(0, player.lp - amount);
}

function applyMonsterSummoned(state, event) {
  const card = requireCard(state, event.cardId);
  card.mode = event.mode || card.mode || "attack";
  card.used = Boolean(event.used);
  card.changedMode = Boolean(event.changedMode);
}

function applyMonsterReadied(state, event) {
  const card = requireCard(state, event.cardId);
  card.used = false;
}

function applyMonsterUsed(state, event) {
  const card = requireCard(state, event.cardId);
  card.used = event.afterUsed !== false;
}

function applyMonsterModeChanged(state, event) {
  const card = requireCard(state, event.cardId);
  if (!MONSTER_MODES.has(event.to)) {
    throw new GameRuleError(`Unknown monster mode ${event.to}`);
  }
  card.mode = event.to;
  card.changedMode = event.afterChangedMode !== false;
}

function applyMonsterTurnReset(state, event) {
  const card = requireCardInZone(state, event.playerId, "monsterZone", event.cardId);
  if (card.type !== "monster") {
    throw new GameRuleError(`Card ${event.cardId} is not a monster`);
  }
  card.used = Boolean(event.afterUsed);
  card.changedMode = Boolean(event.afterChangedMode);
}

function applyBattleWearApplied(state, event) {
  const card = requireCard(state, event.cardId);
  card.battleWear = Math.max(0, Number(event.after) || 0);
  card.tempAtk = Number(event.tempAtkAfter);
  card.tempDef = Number(event.tempDefAfter);
}

function applyLpHealed(state, event) {
  const player = requirePlayer(state, event.playerId);
  const amount = Math.max(0, Number(event.amount) || 0);
  player.lp = Math.min(MAX_LP, player.lp + amount);
}

function applyShieldGained(state, event) {
  const player = requirePlayer(state, event.playerId);
  const amount = Math.max(0, Number(event.amount) || 0);
  player.shield = Math.min(MAX_SHIELD, (Number(player.shield) || 0) + amount);
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

function applyTurnStarted(state, event) {
  const player = requirePlayer(state, event.playerId);
  state.turn.playerId = event.playerId;
  state.turn.phase = Phase.draw;
  state.machine.phase = Phase.draw;
  state.machine.timing = Timing.draw;
  state.machine.responseWindow = null;
  state.machine.chain = [];
  player.attacksSkipped = false;
  player.comboThisTurn = false;
  player.comboFlags = {};
  player.normalSummonsUsed = 0;
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
    resumeTiming: event.resumeTiming || event.timing,
    triggerEventId: event.triggerEventId || null,
    prompt: event.prompt || null,
    context: clone(event.context || {})
  };
}

function applyResponseWindowClosed(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.responseWindow = null;
}

function applyResponsePriorityPassed(state, event) {
  requirePlayer(state, event.fromPlayerId);
  requirePlayer(state, event.toPlayerId);
  if (!state.machine.responseWindow) {
    throw new GameRuleError("Cannot pass priority without an open response window");
  }
  if (state.machine.responseWindow.playerId !== event.fromPlayerId) {
    throw new GameRuleError(`Current response window belongs to ${state.machine.responseWindow.playerId}`);
  }
  state.machine.responseWindow.playerId = event.toPlayerId;
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
    timing: event.timing || state.machine.timing,
    committed: false,
    action: null
  });
}

function applyChainLinkCommitted(state, event) {
  requirePlayer(state, event.playerId);
  const link = state.machine.chain.find((entry) => entry.linkId === event.linkId);
  if (!link) {
    throw new GameRuleError(`Chain link ${event.linkId} does not exist`);
  }
  if (link.playerId !== event.playerId || link.cardId !== event.cardId) {
    throw new GameRuleError(`Chain link ${event.linkId} does not match committed trap ${event.cardId}`);
  }
  link.effectId = event.effectId || link.effectId;
  link.committed = true;
  link.action = clone(event.action || {});
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

function applyTurnAbilitiesExpired(state, event) {
  requirePlayer(state, event.playerId);
  state.abilities[event.playerId] = (state.abilities[event.playerId] || [])
    .filter((entry) => entry.duration !== "turn");
}

function applyNormalSummonUsed(state, event) {
  const player = requirePlayer(state, event.playerId);
  const before = Math.max(0, Number(event.before) || 0);
  if (player.normalSummonsUsed !== before) {
    throw new GameRuleError(`Normal summon count changed before event replay for ${event.playerId}`);
  }
  player.normalSummonsUsed = Math.max(0, Number(event.after) || 0);
}

function runEffect(effects, effectId, ctx, action, card) {
  const definition = effects[effectId];
  if (!definition) {
    throw new GameRuleError(`Effect ${effectId || "(none)"} is not implemented for ${card.id}`);
  }
  runEffectDefinition(definition, ctx, action, card);
}

function validateEffectRequirements(definition, state, action, card) {
  const requirements = Array.isArray(definition?.requirements) ? definition.requirements : [];
  for (const requirement of requirements) {
    if (requirement.type === "minDistinctElements") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const elements = monsterElementSet(state, playerId);
      const count = Math.max(0, Number(requirement.count) || 0);
      if (elements.size < count) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires at least ${count} distinct elements`);
      }
      continue;
    }
    if (requirement.type === "requiredElements") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const elements = monsterElementSet(state, playerId);
      const requiredElements = Array.isArray(requirement.elements) ? requirement.elements : [];
      const missing = requiredElements.filter((element) => !elements.has(element));
      if (missing.length > 0) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires elements ${requiredElements.join(", ")}`);
      }
      continue;
    }
    if (requirement.type === "minElementCount") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const element = requirement.element;
      const count = Math.max(0, Number(requirement.count) || 0);
      const actual = monsterElementCount(state, playerId, element);
      if (actual < count) {
        throw new GameRuleError(`Effect ${card.effect || card.onSummon || card.id} requires at least ${count} ${element} monsters`);
      }
      continue;
    }
    throw new GameRuleError(`Unsupported effect requirement ${requirement.type}`);
  }
}

function effectRequirementFailure(definition, state, action, card) {
  try {
    validateEffectRequirements(definition, state, action, card);
    return null;
  } catch (error) {
    if (error instanceof GameRuleError) return error.message;
    throw error;
  }
}

function monsterElementSet(state, playerId) {
  const player = requirePlayer(state, playerId);
  return new Set(
    player.monsterZone
      .map((cardId) => requireCard(state, cardId).element)
      .filter(Boolean)
  );
}

function monsterElementCount(state, playerId, element) {
  const player = requirePlayer(state, playerId);
  return player.monsterZone
    .map((cardId) => requireCard(state, cardId).element)
    .filter((entry) => entry === element)
    .length;
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
  if (definition.target.rule === "notSource" && action.targetCardId === card.id) {
    throw new GameRuleError(`Target ${action.targetCardId} cannot be the source card for this effect`);
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
    case "gainShield":
      return ctx.gainShield(resolvePlayerRef(operation.player, action), operation.amount, source);
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
    case "grantAbility":
      return ctx.grantAbility(resolvePlayerRef(operation.player, action), operation.ability, {
        ...source,
        uses: operation.uses,
        duration: operation.duration
      });
    case "readyMonsterOrGrantAbility":
      return ctx.readyMonsterOrGrantAbility(resolvePlayerRef(operation.player, action), resolveValue(operation.cardId, action, card), operation.ability, {
        ...source,
        uses: operation.uses,
        duration: operation.duration
      });
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
  if (value === "$action.playerId") return action.playerId;
  if (value === "$action.rivalId") return action.rivalId;
  if (value === "$action.attackerCardId") {
    if (!action.attackerCardId) {
      throw new GameRuleError("Effect operation requires action.attackerCardId");
    }
    return action.attackerCardId;
  }
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

function resolveCardIdInput(state, cardId) {
  if (Array.isArray(cardId)) {
    return cardId.flatMap((entry) => resolveCardIdInput(state, entry));
  }
  if (cardId && typeof cardId === "object") {
    if (!cardId.playerId || !cardId.zone) {
      throw new GameRuleError("Card selector requires playerId and zone");
    }
    const player = requirePlayer(state, cardId.playerId);
    const cardIds = requireZone(player, cardId.zone).slice();
    if (cardId.rule === "firstUsed") {
      const found = cardIds.find((targetCardId) => Boolean(requireCard(state, targetCardId).used));
      return found ? [found] : [];
    }
    if (cardId.rule === "strongestAtk") {
      if (cardIds.length === 0) return [];
      const strongest = cardIds
        .slice()
        .sort((left, right) => engineTotalAtk(requireCard(state, right)) - engineTotalAtk(requireCard(state, left)))[0];
      return strongest ? [strongest] : [];
    }
    if (cardId.rule === "weakestAtk") {
      if (cardIds.length === 0) return [];
      const weakest = cardIds
        .slice()
        .sort((left, right) => engineTotalAtk(requireCard(state, left)) - engineTotalAtk(requireCard(state, right)))[0];
      return weakest ? [weakest] : [];
    }
    if (cardId.rule) {
      throw new GameRuleError(`Unsupported card selector rule ${cardId.rule}`);
    }
    return cardIds;
  }
  return [cardId];
}

function validateBattleDeclaration(state, playerId, rivalId, action) {
  const player = requirePlayer(state, playerId);
  if (player.attacksSkipped || hasAbility(state, playerId, Ability.skipAttackLock)) {
    throw new GameRuleError(`${playerId} skipped attacks for this turn`);
  }
  const attacker = requireMonsterInZone(state, playerId, "monsterZone", action.attackerCardId, "attacker");
  if (attacker.used) {
    throw new GameRuleError(`Monster ${action.attackerCardId} has already attacked`);
  }
  if (attacker.mode === "defense") {
    throw new GameRuleError("Defense position monsters cannot attack");
  }

  let target = null;
  if (action.targetCardId) {
    target = requireMonsterInZone(state, rivalId, "monsterZone", action.targetCardId, "target");
  }
  const direct = !target;
  const rival = requirePlayer(state, rivalId);
  if (direct && rival.monsterZone.length > 0 && !attacker.canDirectAttack && !hasAbility(state, playerId, Ability.directAttack)) {
    throw new GameRuleError("A player must attack a monster before attacking directly");
  }

  return { attacker, target, direct };
}

function attackAbilityBlocked(state, playerId, ability) {
  return [Ability.attackReset, Ability.directAttack].includes(ability) &&
    hasAbility(state, playerId, Ability.skipAttackLock);
}

function consumeAttackResetForMonster(state, emit, playerId, cardId) {
  if (!hasAbility(state, playerId, Ability.attackReset) || hasAbility(state, playerId, Ability.skipAttackLock)) {
    return false;
  }
  const player = requirePlayer(state, playerId);
  if (!player.monsterZone.includes(cardId)) return false;
  const card = requireCard(state, cardId);
  if (!card.used) return false;

  emit("ABILITY_SPENT", {
    playerId,
    ability: Ability.attackReset,
    cardId
  });
  emit("MONSTER_READIED", {
    playerId,
    cardId,
    beforeUsed: true,
    afterUsed: false,
    sourceCardId: null
  });
  return true;
}

function requireMonsterInZone(state, playerId, zone, cardId, label) {
  if (!cardId) {
    throw new GameRuleError(`Battle ${label} cardId is required`);
  }
  const card = requireCardInZone(state, playerId, zone, cardId);
  if (card.type !== "monster") {
    throw new GameRuleError(`Battle ${label} ${cardId} is not a monster`);
  }
  return card;
}

function shouldSpendDirectAttackAbility(state, playerId, rivalId, attacker) {
  const rival = requirePlayer(state, rivalId);
  return rival.monsterZone.length > 0 && !attacker.canDirectAttack && hasAbility(state, playerId, Ability.directAttack);
}

function describeEngineBattleOutcome(state, playerId, rivalId, attacker, target) {
  const attack = engineTotalAtk(attacker);
  if (!target) {
    const shield = engineShieldPreview(attack, requirePlayer(state, rivalId).shield);
    return {
      kind: "direct",
      attack,
      targetValue: 0,
      diff: attack,
      rawDamage: attack,
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      damagePlayerId: rivalId,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  const targetValue = engineBattleValue(target);
  const diff = attack - targetValue;
  if (diff > 0) {
    const rawDamage = target.mode === "defense" ? 0 : diff;
    const shield = engineShieldPreview(rawDamage, requirePlayer(state, rivalId).shield);
    return {
      kind: target.mode === "defense" ? "breakDefense" : "attackWin",
      attack,
      targetValue,
      diff,
      rawDamage,
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      damagePlayerId: rawDamage > 0 ? rivalId : null,
      destroysAttacker: false,
      destroysTarget: true,
      wear: 0
    };
  }

  if (diff < 0) {
    const rawDamage = Math.abs(diff);
    const shield = engineShieldPreview(rawDamage, requirePlayer(state, playerId).shield);
    return {
      kind: target.mode === "defense" ? "guardCounter" : "countered",
      attack,
      targetValue,
      diff,
      rawDamage,
      finalDamage: shield.finalDamage,
      shieldBlocked: shield.blocked,
      damagePlayerId: playerId,
      destroysAttacker: target.mode !== "defense",
      destroysTarget: false,
      wear: engineBattleWearAmount(diff)
    };
  }

  if (target.mode === "defense") {
    return {
      kind: "guardHold",
      attack,
      targetValue,
      diff,
      rawDamage: 0,
      finalDamage: 0,
      shieldBlocked: 0,
      damagePlayerId: null,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  return {
    kind: "clash",
    attack,
    targetValue,
    diff,
    rawDamage: 0,
    finalDamage: 0,
    shieldBlocked: 0,
    damagePlayerId: null,
    destroysAttacker: true,
    destroysTarget: true,
    wear: 0
  };
}

function applyBattleWear(emit, card, amount, sourceCardId) {
  const before = Math.max(0, Number(card.battleWear) || 0);
  const tempAtkBefore = Number(card.tempAtk) || 0;
  const tempDefBefore = Number(card.tempDef) || 0;
  emit("BATTLE_WEAR_APPLIED", {
    cardId: card.id,
    amount,
    before,
    after: before + amount,
    tempAtkBefore,
    tempAtkAfter: tempAtkBefore - amount,
    tempDefBefore,
    tempDefAfter: tempDefBefore - amount,
    reason: "battle",
    sourceCardId
  });
}

function resolveAfterAttackEffect(state, ctx, playerId, attackerCardId) {
  const stillOnField = findCardLocations(state, attackerCardId).some((location) =>
    location.playerId === playerId && location.zone === "monsterZone"
  );
  if (!stillOnField) return;

  const attacker = requireCard(state, attackerCardId);
  if (attacker.afterAttack === "grow200") {
    ctx.modifyStat(attackerCardId, "tempAtk", 200, { sourceCardId: attackerCardId });
  }
  if (attacker.afterAttack === "windDraw" && monsterElementSet(state, playerId).has("wind")) {
    ctx.drawCards(playerId, 1, { sourceCardId: attackerCardId });
  }
}

function engineShieldPreview(amount, shield = 0) {
  const rawAmount = Math.max(0, Number(amount) || 0);
  const blocked = Math.min(Math.max(0, Number(shield) || 0), rawAmount);
  return {
    blocked,
    finalDamage: rawAmount - blocked
  };
}

function engineBattleWearAmount(diff) {
  return Math.min(500, Math.max(150, Math.round(Math.abs(diff) * 0.25 / 50) * 50));
}

function engineBattleValue(card) {
  return card?.mode === "defense" ? engineTotalDef(card) : engineTotalAtk(card);
}

function engineTotalAtk(card) {
  return Math.max(0, (Number(card?.atk) || 0) + (Number(card?.tempAtk) || 0));
}

function engineTotalDef(card) {
  return Math.max(0, (Number(card?.def) || 0) + (Number(card?.tempDef) || 0));
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
    state.players[playerId].attacksSkipped = Boolean(state.players[playerId].attacksSkipped);
    state.players[playerId].comboThisTurn = Boolean(state.players[playerId].comboThisTurn);
    state.players[playerId].comboFlags = state.players[playerId].comboFlags && typeof state.players[playerId].comboFlags === "object"
      ? state.players[playerId].comboFlags
      : {};
    state.players[playerId].normalSummonsUsed = Math.max(0, Number(state.players[playerId].normalSummonsUsed) || 0);
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

function requireOpenResponseWindow(state, playerId) {
  requirePlayer(state, playerId);
  const responseWindow = state.machine.responseWindow;
  if (!responseWindow) {
    throw new GameRuleError("Cannot respond without an open response window");
  }
  if (responseWindow.playerId !== playerId) {
    throw new GameRuleError(`Current response window belongs to ${responseWindow.playerId}`);
  }
  return responseWindow;
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

export function projectMachineStateFromEvents(events = [], phase = Phase.setup) {
  const machine = {
    phase,
    timing: timingForPhase(phase),
    responseWindow: null,
    chain: []
  };

  for (const event of events) {
    if (event.type === "TURN_STARTED") {
      machine.phase = Phase.draw;
      machine.timing = Timing.draw;
      machine.responseWindow = null;
      machine.chain = [];
    }
    if (event.type === "PHASE_CHANGED") {
      machine.phase = event.to;
      machine.timing = timingForPhase(event.to);
      machine.responseWindow = null;
      machine.chain = [];
    }
    if (event.type === "TIMING_CHANGED" && TIMINGS.has(event.to)) {
      machine.timing = event.to;
    }
    if (event.type === "RESPONSE_WINDOW_OPENED") {
      machine.responseWindow = {
        playerId: event.playerId,
        type: event.windowType,
        timing: event.timing,
        resumeTiming: event.resumeTiming || event.timing,
        triggerEventId: event.triggerEventId || null,
        prompt: event.prompt || null,
        context: clone(event.context || {})
      };
    }
    if (event.type === "RESPONSE_WINDOW_CLOSED") {
      machine.responseWindow = null;
    }
    if (event.type === "RESPONSE_PRIORITY_PASSED" && machine.responseWindow) {
      machine.responseWindow.playerId = event.toPlayerId;
    }
    if (event.type === "CHAIN_LINK_ADDED") {
      machine.chain.push({
        linkId: machine.chain.length + 1,
        playerId: event.playerId,
        cardId: event.cardId || null,
        effectId: event.effectId || null,
        targetEffectId: event.targetEffectId || null,
        timing: event.timing || machine.timing,
        committed: false,
        action: null
      });
    }
    if (event.type === "CHAIN_LINK_COMMITTED") {
      const link = machine.chain.find((entry) => entry.linkId === event.linkId);
      if (link) {
        link.effectId = event.effectId || link.effectId;
        link.committed = true;
        link.action = clone(event.action || {});
      }
    }
    if (event.type === "CHAIN_RESOLVED") {
      machine.chain = [];
    }
  }

  if (machine.phase !== phase) {
    return {
      phase,
      timing: timingForPhase(phase),
      responseWindow: null,
      chain: []
    };
  }
  return machine;
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
