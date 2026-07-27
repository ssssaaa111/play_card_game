import { MAX_LP, MAX_SHIELD, MONSTER_ZONE_SIZE, SPELL_TRAP_ZONE_SIZE, canEffectTargetCard } from "./rules.js";
import { matchingElementCombos } from "./combos.js";
import { fusionOptionForResult, fusionOptionsForCard } from "./fusion.js";

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

export const ActionWindow = Object.freeze({
  setup: "setup",
  draw: "draw",
  main: "main",
  battle: "battle",
  targetSelect: "targetSelect",
  response: "response",
  resolution: "resolution",
  autoEnd: "autoEnd",
  ai: "ai",
  gameOver: "gameOver"
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
  monsterZone: MONSTER_ZONE_SIZE,
  spellTrapZone: SPELL_TRAP_ZONE_SIZE
});
const FIXED_ZONE_KEYS = Object.freeze(Object.keys(ZONE_LIMITS));

const PHASE_ORDER = Object.freeze([Phase.setup, Phase.draw, Phase.main, Phase.battle, Phase.end]);
const TIMINGS = new Set(Object.values(Timing));
const RESPONSE_WINDOWS = new Set(Object.values(ResponseWindow));
const ACTION_WINDOWS = new Set(Object.values(ActionWindow));
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
  comebackDraw: oneShot(
    [{ op: "drawCards", player: "self", count: 2 }],
    { requirements: [{ type: "minDeckCount", player: "self", count: 2 }] }
  ),
  burn200: oneShot([{ op: "dealDamage", player: "rival", amount: 200 }]),
  burn500: oneShot([{ op: "dealDamage", player: "rival", amount: 500 }]),
  heal300: oneShot([{ op: "heal", player: "self", amount: 300 }]),
  heal700: oneShot([{ op: "heal", player: "self", amount: 700 }]),
  shield400: oneShot([{ op: "gainShield", player: "self", amount: 400 }]),
  shield800: oneShot([{ op: "gainShield", player: "self", amount: 800 }]),
  starSoulSurvey: oneShot(
    [{ op: "drawCards", player: "self", count: 1 }],
    { requirements: [{ type: "minDistinctElements", player: "self", count: 2 }] }
  ),
  riftShelter: oneShot(
    [{ op: "gainShield", player: "self", amount: 300 }],
    { requirements: [{ type: "minElementCount", player: "self", element: "shadow", count: 2 }] }
  ),
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
  graveRevive: oneShot([{
    op: "specialSummonFromGrave",
    player: "self",
    cardId: "$action.targetCardId"
  }], { target: { player: "self", zone: "grave", cardType: "monster" } }),
  dawnEdge: oneShot(
    [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 900 }],
    { target: { player: "self", zone: "monsterZone" } }
  ),
  lastStandSurge: oneShot(
    [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 700 }],
    {
      requirements: [{ type: "maxLp", player: "self", amount: 1500 }],
      target: { player: "self", zone: "monsterZone", rule: "strongestAtk" }
    }
  ),
  soulResonance: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: 200 }
  ], { target: { player: "self", zone: "monsterZone", rule: "strongestAtk" } }),
  aceEvolution: oneShot([
    { op: "sendMaterialsToGrave", player: "self", materials: ["ember-soul-initiate", "lumen-gearlet"] },
    { op: "specialSummonFromDeckOrHand", player: "self", templateId: "astral-forge-dragon" },
    { op: "modifyStat", cardId: { playerId: "$action.rivalId", zone: "monsterZone" }, stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: { playerId: "$action.rivalId", zone: "monsterZone" }, stat: "tempDef", amount: -500 },
    { op: "gainShield", player: "self", amount: 300 }
  ], { requirements: [{ type: "requireFieldCards", player: "self", materials: ["ember-soul-initiate", "lumen-gearlet"] }] }),
  fusionSummon: oneShot([]),
  aceCrackdown: oneShot([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -500 }
  ], { target: { player: "rival", zone: "monsterZone", rule: "strongestAtk" } }),
  aceGuard: oneShot([
    { op: "negateEffect", targetEffectId: "$action.targetEffectId" },
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "strongestAtk" }, stat: "tempAtk", amount: 900 }
  ], { requirements: [{ type: "responseWindow", prompt: "attack" }] }),
  sunflareSunder: oneShot([
    { op: "destroyCard", cardId: { playerId: "$action.rivalId", zone: "spellTrapZone", rule: "first" } }
  ]),
  starDoomCharge: oneShot([
    { op: "dealDamage", player: "rival", amount: 300 },
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: 300 }
  ]),
  lunarDominion: continuous([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: -900 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -900 }
  ], {
    target: { player: "rival", zone: "monsterZone" },
    requirements: [{ type: "noSpellTrapTemplate", player: "self", templateId: "trio-moon-dominion" }]
  }),
  trioFinalCounter: oneShot([
    { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" }, stat: "tempAtk", amount: 2100 },
    {
      op: "readyMonsterOrGrantAbility",
      player: "self",
      cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "weakestAtk" },
      ability: Ability.attackReset,
      uses: 1,
      duration: "turn"
    }
  ], {
    requirements: [
      { type: "maxLp", player: "self", amount: 1600 },
      { type: "requireFieldCards", player: "self", materials: ["trio-ember-pawn"] },
      { type: "noActiveContinuousEffect", sourcePlayer: "rival", targetPlayer: "self" }
    ]
  }),
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
  splitToken: oneShot(
    [{ op: "createToken", player: "self", templateId: "spark-fragment-token", count: 2 }],
    {
      target: { player: "self", zone: "monsterZone", cardType: "monster" },
      requirements: [{ type: "minEmptyMonsterZone", player: "self", count: 2 }]
    }
  ),
  equipBlade: continuous([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }
  ], { target: { player: "self", zone: "monsterZone" } }),
  equipAegis: continuous([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: 500 }
  ], { target: { player: "self", zone: "monsterZone" } }),
  equipPrism: continuous([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 200 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: 200 }
  ], { target: { player: "self", zone: "monsterZone" } }),
  equipOverclock: continuous([
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 600 },
    { op: "modifyStat", cardId: "$action.targetCardId", stat: "tempDef", amount: -300 }
  ], { target: { player: "self", zone: "monsterZone" } }),
  destroySpellTrap: oneShot(
    [{ op: "destroyCard", cardId: "$action.targetCardId" }],
    { target: { player: "rival", zone: "spellTrapZone" } }
  ),
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
  redirectAttack: oneShot([{ op: "redirectAttackTarget", targetCardId: "$action.targetCardId" }]),
  weakenAttack: oneShot([
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -500 },
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempDef", amount: -500 }
  ]),
  soulParry: oneShot([
    { op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: -300 },
    { op: "gainShield", player: "self", amount: 300 }
  ]),
  directShield: oneShot([{ op: "drawCards", player: "self", count: 1 }]),
  directRebound: oneShot([{ op: "dealDamage", player: "rival", amount: 500 }]),
  summonBurn: oneShot([{ op: "dealDamage", player: "rival", amount: 400 }]),
  chainNegate: oneShot([{ op: "negateEffect", targetEffectId: "$action.targetEffectId" }]),
  grow200: oneShot([{ op: "modifyStat", cardId: "$action.attackerCardId", stat: "tempAtk", amount: 200 }]),
  windDraw: oneShot(
    [{ op: "drawCards", player: "self", count: 1 }],
    { requirements: [{ type: "minElementCount", player: "self", element: "wind", count: 1 }] }
  )
});

export class EffectContext {
  #state;
  #emit;

  constructor(state, emit) {
    this.#state = state;
    this.#emit = emit;
  }

  resolveCardIds(cardId) {
    return resolveCardIdInput(this.#state, cardId);
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
    const sourceCard = options.sourceCardId ? this.#state.cards?.[options.sourceCardId] || null : null;
    const shieldPierced = Math.min(shieldBefore, cardShieldPierceAmount(sourceCard));
    const shieldAfterPierce = Math.max(0, shieldBefore - shieldPierced);
    const blocked = Math.min(shieldAfterPierce, rawAmount);
    const damageAfterShield = Math.max(0, rawAmount - blocked);
    const actual = Math.min(player.lp, damageAfterShield);

    const damageEvent = this.#emit("DAMAGE_DEALT", {
      playerId,
      amount: actual,
      requested: rawAmount,
      shieldPierced,
      blocked,
      shieldBefore,
      shieldAfter: shieldAfterPierce - blocked,
      sourceCardId: options.sourceCardId || null
    });
    emitGameOverIfNeeded(this.#state, this.#emit, {
      reason: options.reason || "lp-zero",
      sourceCardId: options.sourceCardId || null,
      triggerEventId: damageEvent.id
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
    const source = from || currentLocations[0] || null;
    this.#expireTargetAbilitiesForMove(cardId, source, to);
    if (isTokenCard(requireCard(this.#state, cardId)) && source?.zone === "monsterZone" && to.zone !== "monsterZone") {
      this.#releaseContinuousEffectsForMove(cardId, source, { playerId: to.playerId, zone: "removed", index: null });
      this.#emit("TOKEN_REMOVED", {
        cardId,
        playerId: source.playerId,
        from: source,
        reason: "move",
        sourceCardId: null
      });
      return;
    }
    const limit = ZONE_LIMITS[to.zone];
    assertZoneIndexWithinLimit(to.zone, to.index);
    const destinationIndex = limit
      ? resolveFixedDestinationIndex(this.#state, to.playerId, to.zone, to.index, cardId)
      : to.index ?? null;
    const destinationLengthAfterMove = destinationZone.filter((existingCardId) => existingCardId !== cardId).length;
    if (limit && destinationLengthAfterMove >= limit && !destinationZone.includes(cardId)) {
      throw new GameRuleError(`${to.zone} is full`);
    }

    const destination = { playerId: to.playerId, zone: to.zone, index: destinationIndex };
    this.#releaseContinuousEffectsForMove(cardId, source, destination);
    this.#emit("CARD_MOVED", {
      cardId,
      from: source,
      to: destination
    });
  }

  #expireTargetAbilitiesForMove(cardId, from, to) {
    if (
      !from ||
      !to ||
      from.zone !== "monsterZone" ||
      (to.zone === "monsterZone" && to.playerId === from.playerId)
    ) {
      return;
    }

    for (const [playerId, abilities] of Object.entries(this.#state.abilities || {})) {
      abilities
        .filter((entry) => entry.targetCardId === cardId)
        .forEach((entry) => {
          this.#emit("ABILITY_EXPIRED", {
            playerId,
            ability: entry.ability,
            uses: entry.uses,
            duration: entry.duration || "turn",
            sourceCardId: entry.sourceCardId || null,
            targetCardId: cardId,
            reason: "target-left-zone"
          });
        });
    }
  }

  sendCardToGrave(cardId, from, options = {}) {
    const card = requireCard(this.#state, cardId);
    if (!isTokenCard(card)) {
      this.moveCard(cardId, from, { playerId: options.playerId || card.ownerId || from?.playerId, zone: "grave" });
      return "grave";
    }

    const locations = findCardLocations(this.#state, cardId);
    if (from && !locations.some((location) => sameLocation(location, from))) {
      throw new GameRuleError(`Card ${cardId} is not in ${from.playerId}.${from.zone}`);
    }
    const source = from || locations[0] || null;
    if (!source) {
      throw new GameRuleError(`Token ${cardId} is not in a game zone`);
    }
    this.#releaseContinuousEffectsForMove(cardId, source, { playerId: source.playerId, zone: "removed", index: null });
    this.#emit("TOKEN_REMOVED", {
      cardId,
      playerId: source.playerId,
      from: source,
      reason: options.reason || "leave-field",
      sourceCardId: options.sourceCardId || null
    });
    return "removed";
  }

  sendMaterialsToGrave(playerId, materials = [], options = {}) {
    requirePlayer(this.#state, playerId);
    const materialCardIds = selectMaterialCardIds(this.#state, playerId, materials);
    const tokenCardIds = materialCardIds.filter((cardId) => isTokenCard(requireCard(this.#state, cardId)));
    for (const materialCardId of materialCardIds) {
      this.sendCardToGrave(materialCardId, { playerId, zone: "monsterZone" }, {
        playerId,
        sourceCardId: options.sourceCardId || null,
        reason: options.purpose || "material"
      });
    }
    this.#emit("MATERIALS_SENT", {
      playerId,
      materialCardIds,
      tokenCardIds,
      materials: normalizeMaterialRequirements(materials),
      destination: "grave",
      sourceCardId: options.sourceCardId || null,
      purpose: options.purpose || null
    });
    return materialCardIds;
  }

  specialSummonFromDeckOrHand(playerId, templateId, options = {}) {
    requirePlayer(this.#state, playerId);
    if (!templateId) {
      throw new GameRuleError("specialSummonFromDeckOrHand requires a templateId");
    }
    const found = findCardByTemplateInZones(this.#state, playerId, templateId, ["hand", "deck"]);
    if (!found) {
      throw new GameRuleError(`No ${templateId} is available in hand or deck`);
    }
    if (found.card.type !== "monster") {
      throw new GameRuleError(`Card ${found.cardId} is not a monster`);
    }

    this.moveCard(found.cardId, { playerId, zone: found.zone }, { playerId, zone: "monsterZone", index: options.index });
    this.#emit("MONSTER_SUMMONED", {
      playerId,
      cardId: found.cardId,
      sourceCardId: options.sourceCardId || found.cardId,
      mode: options.mode || "attack",
      used: false,
      changedMode: false,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      destructionProtectionUsed: false,
      summonType: options.summonType || "special",
      fromZone: found.zone
    });
    return found.cardId;
  }

  specialSummonFromHand(playerId, cardId, options = {}) {
    const card = requireCardInZone(this.#state, playerId, "hand", cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${cardId} is not a monster`);
    }

    this.moveCard(cardId, { playerId, zone: "hand" }, { playerId, zone: "monsterZone", index: options.index });
    this.#emit("MONSTER_SUMMONED", {
      playerId,
      cardId,
      sourceCardId: options.sourceCardId || cardId,
      mode: options.mode || "attack",
      used: Boolean(options.used),
      attackLockReason: options.attackLockReason || null,
      changedMode: false,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      destructionProtectionUsed: false,
      summonType: options.summonType || "special",
      fromZone: "hand"
    });
    return cardId;
  }

  specialSummonFromGrave(playerId, cardId, options = {}) {
    const card = requireCardInZone(this.#state, playerId, "grave", cardId);
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${cardId} is not a monster`);
    }

    this.moveCard(cardId, { playerId, zone: "grave" }, { playerId, zone: "monsterZone", index: options.index });
    this.#emit("MONSTER_SUMMONED", {
      playerId,
      cardId,
      sourceCardId: options.sourceCardId || cardId,
      mode: options.mode || "attack",
      used: false,
      changedMode: false,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      destructionProtectionUsed: false,
      summonType: options.summonType || "special",
      fromZone: "grave"
    });
    return cardId;
  }

  createTokens(playerId, templateId, options = {}) {
    const player = requirePlayer(this.#state, playerId);
    const count = Math.max(1, Number(options.count) || 1);
    const emptySlots = Math.max(0, MONSTER_ZONE_SIZE - player.monsterZone.length);
    if (emptySlots < count) {
      throw new GameRuleError(`${playerId}.monsterZone requires at least ${count} empty monster zone slots`);
    }
    return Array.from({ length: count }, () => this.createToken(playerId, templateId, options));
  }

  createToken(playerId, templateId, options = {}) {
    requirePlayer(this.#state, playerId);
    if (!templateId) {
      throw new GameRuleError("createToken requires a templateId");
    }
    const template = tokenTemplateForState(this.#state, templateId);
    if (!template) {
      throw new GameRuleError(`Token template ${templateId} is not available`);
    }
    if (template.type !== "monster") {
      throw new GameRuleError(`Token template ${templateId} is not a monster`);
    }

    const cardId = nextGeneratedCardId(this.#state, templateId);
    const index = resolveFixedDestinationIndex(this.#state, playerId, "monsterZone", options.index, null);
    const card = {
      ...clone(template),
      id: cardId,
      templateId,
      ownerId: playerId,
      token: true,
      isToken: true,
      generated: true,
      used: false,
      changedMode: false,
      mode: options.mode || template.mode || "attack",
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0
    };

    this.#emit("CARD_CREATED", {
      playerId,
      cardId,
      templateId,
      card,
      token: true,
      originCardId: options.originCardId || null,
      sourceCardId: options.sourceCardId || null,
      to: { playerId, zone: "monsterZone", index }
    });
    this.#emit("MONSTER_SUMMONED", {
      playerId,
      cardId,
      sourceCardId: options.sourceCardId || cardId,
      originCardId: options.originCardId || null,
      mode: card.mode,
      used: false,
      changedMode: false,
      summonType: "token",
      fromZone: "created"
    });
    return cardId;
  }

  #releaseContinuousEffectsForMove(cardId, from, to) {
    const releases = continuousEffectsForMove(this.#state, cardId, from, to);
    for (const release of releases) {
      const effect = this.#state.continuousEffects.find((entry) => entry.id === release.effect.id);
      if (!effect) continue;

      this.#emit("CONTINUOUS_EFFECT_RELEASED", {
        id: effect.id,
        playerId: effect.playerId,
        sourceCardId: effect.sourceCardId,
        effectId: effect.effectId,
        targetCardId: effect.targetCardId || null,
        reason: release.reason,
        operations: clone(effect.operations || [])
      });

      for (const operation of effect.operations || []) {
        if (operation.op !== "modifyStat") {
          throw new GameRuleError(`Continuous effect ${effect.effectId} cannot release ${operation.op}`);
        }
        const action = {
          type: "RELEASE_CONTINUOUS_EFFECT",
          playerId: effect.playerId,
          cardId: effect.sourceCardId,
          targetCardId: effect.targetCardId || null
        };
        const resolvedCardId = resolveValue(operation.cardId, action, { id: effect.sourceCardId });
        this.modifyStat(resolvedCardId, operation.stat, -Number(operation.amount || 0), {
          sourceCardId: effect.sourceCardId,
          duration: EffectDuration.continuous
        });
      }

      if (release.reason === "target-left-zone" && effect.destroySourceWhenTargetLeaves !== false) {
        const sourceLocation = findCardLocations(this.#state, effect.sourceCardId)
          .find((location) => location.zone === "spellTrapZone");
        if (sourceLocation) {
          this.destroyCard(effect.sourceCardId, {
            reason: "continuous-target-left-zone",
            sourceCardId: effect.sourceCardId
          });
        }
      }
    }
  }

  destroyCard(cardId, options = {}) {
    return resolveCardIdInput(this.#state, cardId).flatMap((targetCardId) => {
      const card = requireCard(this.#state, targetCardId);
      const location = findCardLocations(this.#state, targetCardId)[0] || null;
      const ownerId = location?.playerId || card.ownerId;

      if (shouldPreventDestruction(card, location, options)) {
        this.#emit("CARD_DESTRUCTION_PREVENTED", {
          cardId: targetCardId,
          playerId: ownerId,
          reason: options.reason || null,
          sourceCardId: options.sourceCardId || null,
          protection: destructionProtectionType(card),
          beforeProtectionUsed: Boolean(card.destructionProtectionUsed),
          afterProtectionUsed: true
        });
        return [];
      }

      this.sendCardToGrave(targetCardId, location, {
        playerId: ownerId,
        reason: options.reason || "destroyed",
        sourceCardId: options.sourceCardId || null
      });
      this.#emit("CARD_DESTROYED", {
        cardId: targetCardId,
        playerId: ownerId,
        reason: options.reason || null,
        sourceCardId: options.sourceCardId || null
      });
      return [targetCardId];
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
      summonType: options.summonType || "special",
      mode: options.mode || "attack",
      used: false,
      changedMode: false,
      tempAtk: 0,
      tempDef: 0,
      battleWear: 0,
      destructionProtectionUsed: false
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
        sourceCardId: options.sourceCardId || null,
        ...(options.duration ? { duration: options.duration } : {})
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

  redirectAttackTarget(targetCardId, options = {}) {
    const pending = requirePendingAttack(this.#state);
    const target = requireCardInZone(this.#state, pending.rivalId, "monsterZone", targetCardId);
    if (target.type !== "monster") {
      throw new GameRuleError(`Redirect target ${targetCardId} is not a monster`);
    }
    if (targetCardId === pending.targetCardId) return false;
    this.#emit("ATTACK_TARGET_CHANGED", {
      playerId: pending.playerId,
      rivalId: pending.rivalId,
      attackerCardId: pending.attackerCardId,
      fromTargetCardId: pending.targetCardId || null,
      toTargetCardId: targetCardId,
      targetCardId,
      targetPlayerId: null,
      direct: false,
      declarationEventId: pending.declarationEventId,
      sourceCardId: options.sourceCardId || null
    });
    return true;
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
    if (ability === Ability.attackReset && options.targetCardId) {
      const target = requireCardInZone(this.#state, playerId, "monsterZone", options.targetCardId);
      if (target.attackLockReason) {
        this.#emit("ABILITY_GRANT_BLOCKED", {
          playerId,
          ability,
          reason: target.attackLockReason,
          sourceCardId: options.sourceCardId || null,
          targetCardId: options.targetCardId
        });
        return false;
      }
    }

    this.#emit("ABILITY_GRANTED", {
      playerId,
      ability,
      uses: Math.max(1, Number(options.uses) || 1),
      duration: options.duration || "turn",
      sourceCardId: options.sourceCardId || null,
      targetCardId: options.targetCardId || null
    });
    return true;
  }

  readyMonster(cardId, options = {}) {
    const card = requireCard(this.#state, cardId);
    if (card.attackLockReason) return false;
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
    const targetCardId = cardIds[0] || options.targetCardId || null;
    if (targetCardId) {
      const target = requireCardInZone(this.#state, playerId, "monsterZone", targetCardId);
      if (target.attackLockReason) {
        this.#emit("ABILITY_GRANT_BLOCKED", {
          playerId,
          ability,
          reason: target.attackLockReason,
          sourceCardId: options.sourceCardId || null,
          targetCardId
        });
        return null;
      }
    }
    const usedCardId = cardIds.find((targetCardId) => Boolean(requireCard(this.#state, targetCardId).used));
    if (usedCardId && this.readyMonster(usedCardId, options)) {
      return usedCardId;
    }
    this.grantAbility(playerId, ability, { ...options, targetCardId });
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

    if (this.#state.gameOver) {
      throw new GameRuleError(`Cannot dispatch ${action.type} after game over`);
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
      case "CANCEL_ATTACK":
        this.#cancelAttack(workingState, emit, action);
        break;
      case "SKIP_REMAINING_ATTACKS":
        this.#skipRemainingAttacks(workingState, emit, action);
        break;
      case "RESOLVE_ELEMENT_COMBOS":
        this.#resolveElementCombos(workingState, ctx, emit, action);
        break;
      case "CHANGE_MONSTER_MODE":
        this.#changeMonsterMode(workingState, emit, action);
        break;
      case "START_TURN":
        this.#startTurn(workingState, emit, action);
        break;
      case "END_TURN":
        this.#endTurn(workingState, emit, action);
        break;
      case "REQUEST_AUTO_END":
        this.#requestAutoEnd(workingState, emit, action);
        break;
      case "CANCEL_AUTO_END":
        this.#cancelAutoEnd(workingState, emit, action);
        break;
      case "COMMIT_AUTO_END":
        this.#commitAutoEnd(workingState, emit, action);
        break;
      case "DRAW_CARDS":
        this.#drawCards(workingState, ctx, emit, action);
        break;
      case "RESOLVE_TURN_DRAW":
        this.#resolveTurnDraw(workingState, ctx, emit, action);
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
      case "OPEN_ACTION_WINDOW":
        this.#openActionWindow(workingState, emit, action);
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
    requireOrdinaryActionReady(state, action.type);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (card.type !== "spell") {
      throw new GameRuleError(`Card ${action.cardId} is not a spell`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    const definition = this.#effects[card.effect];
    if (isFusionSummonSpell(card)) {
      this.#activateFusionSpell(state, ctx, emit, preparedAction, card);
      return;
    }
    validateEffectRequirements(definition, state, preparedAction, card);
    validateEffectTarget(definition, state, preparedAction, card);
    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    if (definition?.duration === EffectDuration.continuous) {
      ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "hand" }, { playerId: action.playerId, zone: "spellTrapZone", index: action.index });
      emit("CONTINUOUS_EFFECT_REGISTERED", {
        id: `continuous:${action.cardId}`,
        playerId: action.playerId,
        sourceCardId: action.cardId,
        effectId: card.effect,
        targetCardId: action.targetCardId || null,
        destroySourceWhenTargetLeaves: definition.destroySourceWhenTargetLeaves !== false,
        operations: clone(definition.operations || [])
      });
      runContinuousEffectDefinition(definition, ctx, preparedAction, card);
      return;
    }
    ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "hand" }, { playerId: action.playerId, zone: "grave" });
    runEffect(this.#effects, card.effect, ctx, preparedAction, card);
  }

  #activateFusionSpell(state, ctx, emit, action, card) {
    if (action.zone && action.zone !== "monsterZone") {
      throw new GameRuleError("Fusion monsters can only be summoned to monsterZone");
    }
    const fusion = fusionDefinitionForAction(card, action);
    const materialCardIds = validateFusionMaterialCardIds(state, action.playerId, fusion, action);
    const summonIndex = fusionSummonIndexForAction(state, action.playerId, materialCardIds, action.index);
    validateFusionDestination(state, action.playerId, materialCardIds, summonIndex);
    const found = findCardByTemplateInZones(state, action.playerId, fusion.resultTemplateId, ["hand", "deck"]);
    if (!found) {
      throw new GameRuleError(`No ${fusion.resultTemplateId} is available in hand or deck`);
    }
    if (found.card.type !== "monster") {
      throw new GameRuleError(`Fusion result ${fusion.resultTemplateId} is not a monster`);
    }

    emit("CARD_ACTIVATED", {
      playerId: action.playerId,
      cardId: action.cardId,
      cardType: card.type,
      phase: state.turn.phase
    });
    ctx.moveCard(action.cardId, { playerId: action.playerId, zone: "hand" }, { playerId: action.playerId, zone: "grave" });
    materialCardIds.forEach((materialCardId) => {
      const materialZone = fusionMaterialZone(state, action.playerId, materialCardId);
      ctx.sendCardToGrave(materialCardId, { playerId: action.playerId, zone: materialZone }, {
        playerId: action.playerId,
        sourceCardId: action.cardId,
        reason: "fusion-material"
      });
    });
    emit("MATERIALS_SENT", {
      playerId: action.playerId,
      materialCardIds,
      tokenCardIds: materialCardIds.filter((materialCardId) => !state.cards[materialCardId]),
      materials: fusion.materials,
      destination: "grave",
      sourceCardId: action.cardId,
      purpose: "fusion"
    });
    const fusionCardId = ctx.specialSummonFromDeckOrHand(action.playerId, fusion.resultTemplateId, {
      sourceCardId: action.cardId,
      index: summonIndex,
      summonType: "fusion"
    });
    emit("FUSION_SUMMONED", {
      playerId: action.playerId,
      cardId: fusionCardId,
      sourceCardId: action.cardId,
      materialCardIds,
      resultTemplateId: fusion.resultTemplateId
    });
    if (found.card.onSummon) {
      const summonAction = { ...action, cardId: fusionCardId, sourceCardId: action.cardId };
      const skipReason = effectRequirementFailure(this.#effects[found.card.onSummon], state, summonAction, found.card);
      if (skipReason) {
        emit("EFFECT_SKIPPED", {
          playerId: action.playerId,
          cardId: fusionCardId,
          effectId: found.card.onSummon,
          reason: skipReason
        });
      } else {
        runEffect(this.#effects, found.card.onSummon, ctx, summonAction, found.card);
      }
    }
  }

  #resolveElementCombos(state, ctx, emit, action) {
    requirePlayer(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    const player = requirePlayer(state, action.playerId);
    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const combos = matchingElementCombos({
      elements: monsterElementSet(state, action.playerId),
      flags: player.comboFlags,
      source: action.source || ""
    });

    for (const combo of combos) {
      emit("COMBO_TRIGGERED", {
        playerId: action.playerId,
        rivalId,
        comboId: combo.flag,
        title: combo.title,
        text: combo.text,
        source: action.source || ""
      });

      if (!player.comboThisTurn && player.comboPassive) {
        const passive = player.comboPassive;
        const definition = {
          duration: EffectDuration.oneShot,
          operations: passive.operations || []
        };
        normalizeEffectDefinitions({ [passive.id || "characterPassive"]: definition });
        emit("CHARACTER_PASSIVE_TRIGGERED", {
          playerId: action.playerId,
          rivalId,
          passiveId: passive.id || "characterPassive",
          name: passive.name || passive.id || "角色被动",
          comboId: combo.flag
        });
        runEffectDefinition(definition, ctx, {
          ...action,
          rivalId,
          cardId: `passive:${passive.id || "characterPassive"}`
        }, { id: passive.id || "characterPassive" });
      }

      runEffectDefinition({
        duration: EffectDuration.oneShot,
        operations: combo.operations || []
      }, ctx, {
        ...action,
        rivalId,
        cardId: `combo:${combo.flag}`
      }, { id: combo.flag });
    }
  }

  #activateTrap(state, ctx, emit, action) {
    requirePlayer(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    if (!state.machine.responseWindow && (state.machine.chain || []).length > 0) {
      throw new GameRuleError(`Cannot ${action.type} while a chain is unresolved`);
    }
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
    requireOrdinaryActionReady(state, action.type);
    const player = requirePlayer(state, action.playerId);
    const card = requireCardInZone(state, action.playerId, "hand", action.cardId);
    if (action.zone && action.zone !== "monsterZone") {
      throw new GameRuleError("Monsters can only be summoned to monsterZone");
    }
    if (card.type !== "monster") {
      throw new GameRuleError(`Card ${action.cardId} is not a monster`);
    }

    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const preparedAction = { ...action, rivalId };
    const tributeCost = tributeCostForCard(card);
    const tributeCardIds = validateTributeSummonCost(state, action.playerId, card, action);
    validateMonsterSummonDestination(state, action.playerId, action.index, tributeCardIds);
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
    tributeCardIds.forEach((tributeCardId) => {
      const token = isTokenCard(requireCard(state, tributeCardId));
      ctx.sendCardToGrave(tributeCardId, { playerId: action.playerId, zone: "monsterZone" }, {
        playerId: action.playerId,
        sourceCardId: action.cardId,
        reason: "tribute"
      });
      emit("CARD_TRIBUTED", {
        playerId: action.playerId,
        cardId: tributeCardId,
        summonCardId: action.cardId,
        tributeCost,
        destination: token ? "removed" : "grave"
      });
    });
    ctx.summonMonster(action.playerId, action.cardId, {
      index: action.index,
      summonType: tributeCardIds.length ? "tribute" : "normal"
    });
    this.#resolveTrioConvergence(state, ctx, emit, action, card, tributeCardIds);
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

  #resolveTrioConvergence(state, ctx, emit, action, card, tributeCardIds) {
    const group = card.trioConvergence;
    if (!group || tributeCardIds.length !== tributeCostForCard(card) || tributeCardIds.length !== 3) return;

    const player = requirePlayer(state, action.playerId);
    const seenTemplates = new Set([card.templateId || card.id]);
    const candidates = player.hand.filter((cardId) => {
      const candidate = requireCard(state, cardId);
      const templateId = candidate.templateId || candidate.id;
      if (candidate.type !== "monster" || candidate.trioConvergence !== group || seenTemplates.has(templateId)) return false;
      seenTemplates.add(templateId);
      return true;
    });
    if (!candidates.length) return;

    const summonedCardIds = candidates.map((cardId) => ctx.specialSummonFromHand(action.playerId, cardId, {
      sourceCardId: action.cardId,
      summonType: "trioConvergence",
      used: true,
      attackLockReason: "trioConvergence"
    }));
    emit("TRIO_CONVERGENCE_RESOLVED", {
      playerId: action.playerId,
      sourceCardId: action.cardId,
      summonedCardIds,
      group
    });
  }

  #setTrap(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    requireOrdinaryActionReady(state, action.type);
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
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot declare attack while another attack is pending");
    }
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot declare attack while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot declare attack while a chain is unresolved");
    }
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
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot resolve battle while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot resolve battle while a chain is unresolved");
    }
    assertBattleResolutionMatchesPendingAttack(state, action);
    const rivalId = action.rivalId || otherPlayerId(state, action.playerId);
    const { attacker, target, direct } = validateBattleDeclaration(state, action.playerId, rivalId, action);

    let declarationEventId = action.declarationEventId || state.machine.pendingAttack?.declarationEventId || null;
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
        ctx.dealDamage(damagePlayerId, outcome.rawDamage, { sourceCardId: outcome.damageSourceCardId || action.attackerCardId });
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

    resolveAfterAttackEffect(this.#effects, state, ctx, action.playerId, rivalId, action.attackerCardId);
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
    completeBattleFlow(state, emit, action.playerId, "battle-resolved");
  }

  #markMonsterUsed(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot mark monster used while an attack is pending; cancel the attack instead");
    }
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

  #cancelAttack(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot cancel attack while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot cancel attack while a chain is unresolved");
    }
    const pending = requirePendingAttack(state, action.playerId);
    if (action.declarationEventId && String(action.declarationEventId) !== String(pending.declarationEventId)) {
      throw new GameRuleError(`Pending attack declaration ${pending.declarationEventId} does not match ${action.declarationEventId}`);
    }
    if (action.consumeAttack) {
      const attacker = requireMonsterInZone(state, pending.playerId, "monsterZone", pending.attackerCardId, "attacker");
      if (!attacker.used) {
        emit("MONSTER_USED", {
          playerId: pending.playerId,
          cardId: pending.attackerCardId,
          beforeUsed: Boolean(attacker.used),
          afterUsed: true,
          reason: "attackCanceled"
        });
        consumeAttackResetForMonster(state, emit, pending.playerId, pending.attackerCardId);
      }
    }
    emit("ATTACK_CANCELED", {
      playerId: pending.playerId,
      rivalId: pending.rivalId,
      attackerCardId: pending.attackerCardId,
      targetCardId: pending.targetCardId || null,
      targetPlayerId: pending.targetPlayerId || null,
      direct: Boolean(pending.direct),
      declarationEventId: pending.declarationEventId,
      reason: action.reason || "canceled",
      consumeAttack: Boolean(action.consumeAttack)
    });
    completeBattleFlow(state, emit, pending.playerId, "attack-canceled");
  }

  #skipRemainingAttacks(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.battle], action.type);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot skip attacks while a response window is open");
    }
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot skip attacks while an attack is pending");
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
    requireOrdinaryActionReady(state, action.type);
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
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot start a turn while an attack is pending");
    }
    if (state.turn.phase !== Phase.end) {
      throw new GameRuleError("Cannot start a turn before the previous turn reaches end phase");
    }

    const previousPlayerId = state.turn.playerId;
    const expectedPlayerId = otherPlayerId(state, previousPlayerId);
    if (action.playerId !== expectedPlayerId) {
      throw new GameRuleError(`Next turn must belong to opponent ${expectedPlayerId}`);
    }

    const player = requirePlayer(state, action.playerId);
    const monsterResets = player.monsterZone
      .map((cardId) => requireCard(state, cardId))
      .filter((card) => card.used || card.changedMode || card.destructionProtectionUsed || card.attackLockReason)
      .map((card) => {
        const reset = {
          cardId: card.id,
          beforeUsed: Boolean(card.used),
          beforeChangedMode: Boolean(card.changedMode),
          beforeAttackLockReason: card.attackLockReason || null
        };
        if (card.destructionProtectionUsed) {
          reset.beforeDestructionProtectionUsed = true;
        }
        return reset;
      });
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
      const resetEvent = {
        playerId: action.playerId,
        ...reset,
        afterUsed: false,
        afterChangedMode: false,
        afterAttackLockReason: null
      };
      if (reset.beforeDestructionProtectionUsed) {
        resetEvent.afterDestructionProtectionUsed = false;
      }
      emit("MONSTER_TURN_RESET", resetEvent);
    });
    if (expiredAbilities.length > 0) {
      emit("TURN_ABILITIES_EXPIRED", {
        playerId: action.playerId,
        abilities: expiredAbilities
      });
    }
  }

  #endTurn(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot end a turn while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot end a turn while a chain is unresolved");
    }
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot end a turn while an attack is pending");
    }

    const expectedPlayerId = otherPlayerId(state, action.playerId);
    const nextPlayerId = action.nextPlayerId || expectedPlayerId;
    requirePlayer(state, nextPlayerId);
    if (nextPlayerId !== expectedPlayerId) {
      throw new GameRuleError(`Turn must pass to opponent ${expectedPlayerId}`);
    }
    emit("TURN_ENDED", {
      playerId: action.playerId,
      nextPlayerId,
      fromPhase: state.turn.phase,
      phase: Phase.end,
      timing: Timing.end,
      reason: action.reason || "",
      endedBy: action.endedBy || "manual",
      endedAt: Number.isFinite(Number(action.endedAt)) ? Number(action.endedAt) : null
    });
  }

  #requestAutoEnd(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.main, Phase.battle], action.type);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot request auto-end while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot request auto-end while a chain is unresolved");
    }
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot request auto-end while an attack is pending");
    }

    const requestedAt = Number(action.requestedAt);
    const timeoutSeconds = Math.max(0, Number(action.timeoutSeconds) || 0);
    if (!Number.isFinite(requestedAt)) {
      throw new GameRuleError("Auto-end requestedAt must be finite");
    }
    const deadline = timeoutSeconds > 0 ? requestedAt + timeoutSeconds * 1000 : 0;
    const reason = action.reason || "";
    emit("AUTO_END_REQUESTED", {
      playerId: action.playerId,
      reason,
      requestedAt,
      deadline
    });
    emit("ACTION_WINDOW_OPENED", {
      playerId: action.playerId,
      window: ActionWindow.autoEnd,
      windowId: action.windowId || `${ActionWindow.autoEnd}:${requestedAt}`,
      reason,
      openedAt: requestedAt,
      deadline
    });
  }

  #cancelAutoEnd(state, emit, action) {
    requirePlayer(state, action.playerId);
    const pending = state.machine.autoEnd;
    if (!pending) return;
    if (pending.playerId !== action.playerId) {
      throw new GameRuleError(`Auto-end belongs to ${pending.playerId}`);
    }

    emit("AUTO_END_CANCELED", {
      playerId: action.playerId,
      reason: action.reason || "",
      canceledAt: Number.isFinite(Number(action.canceledAt)) ? Number(action.canceledAt) : null
    });
  }

  #commitAutoEnd(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot commit auto-end while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot commit auto-end while a chain is unresolved");
    }
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot commit auto-end while an attack is pending");
    }
    const pending = state.machine.autoEnd;
    if (!pending || pending.playerId !== action.playerId) {
      throw new GameRuleError("Cannot commit auto-end without a pending auto-end request");
    }

    const committedAt = Number.isFinite(Number(action.committedAt)) ? Number(action.committedAt) : null;
    emit("AUTO_END_COMMITTED", {
      playerId: action.playerId,
      reason: pending.reason || action.reason || "",
      requestedAt: pending.requestedAt,
      committedAt
    });
    this.#endTurn(state, emit, {
      type: "END_TURN",
      playerId: action.playerId,
      reason: pending.reason || action.reason || "",
      endedBy: "auto",
      endedAt: committedAt
    });
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

  #resolveTurnDraw(state, ctx, emit, action) {
    requireCurrentTurn(state, action.playerId);
    requirePhase(state, [Phase.draw], action.type);
    this.#drawCards(state, ctx, emit, {
      type: "DRAW_CARDS",
      playerId: action.playerId,
      count: Math.max(1, Number(action.count) || 1),
      reason: "turn",
      sourceCardId: action.sourceCardId || null
    });

    const player = requirePlayer(state, action.playerId);
    const phaseAdvanced = !state.gameOver && player.lp > 0;
    emit("TURN_DRAW_RESOLVED", {
      playerId: action.playerId,
      phaseAdvanced,
      nextPhase: phaseAdvanced ? Phase.main : Phase.draw
    });
    if (phaseAdvanced) {
      this.#changePhase(state, emit, {
        type: "CHANGE_PHASE",
        playerId: action.playerId,
        phase: Phase.main
      });
    }
  }

  #changePhase(state, emit, action) {
    requireCurrentTurn(state, action.playerId);
    if (!PHASE_ORDER.includes(action.phase)) {
      throw new GameRuleError(`Unknown phase ${action.phase}`);
    }
    if (state.machine.responseWindow) {
      throw new GameRuleError("Cannot change phase while a response window is open");
    }
    if (state.machine.chain.length > 0) {
      throw new GameRuleError("Cannot change phase while a chain is unresolved");
    }
    if (state.machine.pendingAttack) {
      throw new GameRuleError("Cannot change phase while an attack is pending");
    }

    const before = state.turn.phase;
    const nextPhase = {
      [Phase.draw]: Phase.main,
      [Phase.main]: Phase.battle
    }[before];
    if (action.phase !== nextPhase) {
      throw new GameRuleError(`Cannot change phase from ${before} to ${action.phase}`);
    }
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

  #openActionWindow(state, emit, action) {
    requirePlayer(state, action.playerId);
    if (!ACTION_WINDOWS.has(action.window)) {
      throw new GameRuleError(`Unknown action window ${action.window}`);
    }
    if (state.machine.responseWindow || state.machine.chain.length > 0 || state.machine.pendingAttack) {
      const allowedDuringResolution = [ActionWindow.response, ActionWindow.resolution].includes(action.window);
      if (!allowedDuringResolution) {
        throw new GameRuleError(`Cannot open ${action.window} action window while attack or chain resolution is pending`);
      }
    }
    const openedAt = Number(action.openedAt);
    const timeoutSeconds = Math.max(0, Number(action.timeoutSeconds) || 0);
    if (!Number.isFinite(openedAt)) {
      throw new GameRuleError("Action window openedAt must be finite");
    }

    emit("ACTION_WINDOW_OPENED", {
      playerId: action.playerId,
      window: action.window,
      windowId: action.windowId || `${action.window}:${openedAt}`,
      reason: action.reason || "",
      openedAt,
      deadline: timeoutSeconds > 0 ? openedAt + timeoutSeconds * 1000 : 0
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
    const attackCanceled = cancelPendingAttackIfContextLost(state, emit);
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
    if (attackCanceled) {
      completeBattleFlow(state, emit, state.turn.playerId, "chain-canceled-attack");
    }
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
    if (action.ability === Ability.attackReset && action.targetCardId) {
      const target = requireCardInZone(state, action.playerId, "monsterZone", action.targetCardId);
      if (target.attackLockReason) {
        emit("ABILITY_GRANT_BLOCKED", {
          playerId: action.playerId,
          ability: action.ability,
          reason: target.attackLockReason,
          sourceCardId: action.sourceCardId || null,
          targetCardId: action.targetCardId
        });
        return;
      }
    }

    emit("ABILITY_GRANTED", {
      playerId: action.playerId,
      ability: action.ability,
      uses: Math.max(1, Number(action.uses) || 1),
      duration: action.duration || "turn",
      sourceCardId: action.sourceCardId || null,
      targetCardId: action.targetCardId || null
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

export function explainActionLegality(initialState, action, options = {}) {
  try {
    new GameEngine(initialState, options).dispatch(action);
    return { ok: true, reason: "" };
  } catch (error) {
    if (error instanceof GameRuleError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

export function getLegalActions(initialState, playerId = initialState?.turn?.playerId, options = {}) {
  const state = new GameEngine(initialState, options).getState();
  const player = requirePlayer(state, playerId);
  const rivalId = otherPlayerId(state, playerId);
  const effects = normalizeEffectDefinitions({ ...defaultCardEffects, ...(options.cardEffects || {}) });
  const actions = {
    summon: [],
    setTrap: [],
    activateCard: [],
    declareAttack: [],
    changeMode: [],
    endTurn: []
  };

  if (normalActionsBlocked(state)) {
    return summarizeLegalActions(state, playerId, rivalId, actions);
  }

  const consider = (bucket, action) => {
    const result = explainActionLegality(state, action, options);
    if (result.ok) actions[bucket].push(clone(action));
  };

  player.hand.forEach((cardId) => {
    const card = requireCard(state, cardId);
    if (card.type === "monster") {
      const tributeCardIds = defaultTributeCardIdsForAction(state, playerId, card);
      const summonIndex = Math.min(player.monsterZone.length, MONSTER_ZONE_SIZE - 1);
      consider("summon", {
        type: "SUMMON_MONSTER",
        playerId,
        rivalId,
        cardId,
        index: summonIndex,
        ...(tributeCardIds.length ? { tributeCardIds } : {})
      });
    }
    if (card.type === "trap") {
      consider("setTrap", {
        type: "SET_TRAP",
        playerId,
        cardId,
        index: player.spellTrapZone.length
      });
    }
    if (card.type === "spell") {
      activationCandidates(state, effects, playerId, rivalId, card).forEach((action) => {
        consider("activateCard", action);
      });
    }
  });

  player.monsterZone.forEach((attackerCardId) => {
    const attackBase = {
      type: "DECLARE_ATTACK",
      playerId,
      rivalId,
      attackerCardId
    };
    const rival = requirePlayer(state, rivalId);
    rival.monsterZone.forEach((targetCardId) => {
      consider("declareAttack", { ...attackBase, targetCardId });
    });
    consider("declareAttack", attackBase);

    const card = requireCard(state, attackerCardId);
    const before = card.mode || "attack";
    const nextMode = before === "attack" ? "defense" : "attack";
    consider("changeMode", {
      type: "CHANGE_MONSTER_MODE",
      playerId,
      cardId: attackerCardId,
      mode: nextMode
    });
  });

  consider("endTurn", {
    type: "END_TURN",
    playerId,
    reason: "legal-actions",
    endedBy: "legal-actions"
  });

  return summarizeLegalActions(state, playerId, rivalId, actions);
}

function activationCandidates(state, effects, playerId, rivalId, card) {
  const definition = effects[card.effect];
  const base = {
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: card.id
  };
  if (isFusionSummonSpell(card)) {
    return fusionOptionsForCard(card)
      .map((fusion) => fusionActivationCandidate(state, playerId, rivalId, card, fusion));
  }
  if (definition?.duration === EffectDuration.continuous) {
    base.index = requirePlayer(state, playerId).spellTrapZone.length;
  }

  if (!definition?.target) return [base];
  const targetIds = candidateTargetCardIds(state, definition, base);
  if (targetIds.length === 0) return [base];
  return targetIds.map((targetCardId) => ({ ...base, targetCardId }));
}

function candidateTargetCardIds(state, definition, action) {
  try {
    const targetPlayerId = resolvePlayerRef(definition.target.player, action);
    const player = requirePlayer(state, targetPlayerId);
    return requireZone(player, definition.target.zone)
      .filter((cardId) => cardMatchesTargetDefinition(state, cardId, definition.target))
      .slice();
  } catch (error) {
    if (error instanceof GameRuleError) return [];
    throw error;
  }
}

function normalActionsBlocked(state) {
  if (state.gameOver) return true;
  if (state.machine.responseWindow) return true;
  if ((state.machine.chain || []).length > 0) return true;
  if (state.machine.pendingAttack) return true;
  const windowName = state.machine.actionWindow?.window;
  return [
    ActionWindow.targetSelect,
    ActionWindow.response,
    ActionWindow.resolution,
    ActionWindow.autoEnd,
    ActionWindow.ai,
    ActionWindow.gameOver
  ].includes(windowName);
}

function summarizeLegalActions(state, playerId, rivalId, actions) {
  const can = {
    summon: actions.summon.length > 0,
    setTrap: actions.setTrap.length > 0,
    activateCard: actions.activateCard.length > 0,
    declareAttack: actions.declareAttack.length > 0,
    changeMode: actions.changeMode.length > 0,
    endTurn: actions.endTurn.length > 0
  };
  return {
    playerId,
    rivalId,
    phase: state.turn.phase,
    timing: state.machine.timing,
    can,
    hasAny: can.summon || can.setTrap || can.activateCard || can.declareAttack || can.changeMode,
    actions
  };
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
  if (state.machine.actionWindow) {
    if (!ACTION_WINDOWS.has(state.machine.actionWindow.window)) {
      throw new GameStateValidationError(`Unknown action window ${state.machine.actionWindow.window}`);
    }
    if (!state.players[state.machine.actionWindow.playerId]) {
      throw new GameStateValidationError("Action window player must exist");
    }
    if (!Number.isFinite(state.machine.actionWindow.openedAt) || !Number.isFinite(state.machine.actionWindow.deadline)) {
      throw new GameStateValidationError("Action window timing must be finite");
    }
  }
  if (state.machine.autoEnd) {
    if (!state.players[state.machine.autoEnd.playerId]) {
      throw new GameStateValidationError("Auto-end player must exist");
    }
    if (!Number.isFinite(state.machine.autoEnd.requestedAt) || !Number.isFinite(state.machine.autoEnd.deadline)) {
      throw new GameStateValidationError("Auto-end timing must be finite");
    }
  }
  if (state.machine.responseWindow && !RESPONSE_WINDOWS.has(state.machine.responseWindow.type)) {
    throw new GameStateValidationError(`Unknown response window ${state.machine.responseWindow.type}`);
  }
  if (state.machine.responseWindow && !state.players[state.machine.responseWindow.playerId]) {
    throw new GameStateValidationError("Response window player must exist");
  }
  if (state.machine.responseWindow && state.machine.autoEnd) {
    throw new GameStateValidationError("Response window cannot coexist with auto-end");
  }
  if (state.machine.responseWindow && state.machine.actionWindow && state.machine.actionWindow.window !== ActionWindow.response) {
    throw new GameStateValidationError("Response window requires a response action window");
  }
  if (state.machine.chain.length > 0) {
    const chainWindow = state.machine.actionWindow?.window;
    if (!state.machine.responseWindow && ![ActionWindow.response, ActionWindow.resolution].includes(chainWindow)) {
      throw new GameStateValidationError("Unresolved chain requires response window or response/resolution action window");
    }
  }
  if (state.machine.pendingAttack) {
    const pending = state.machine.pendingAttack;
    if (state.turn.phase !== Phase.battle || state.machine.phase !== Phase.battle) {
      throw new GameStateValidationError("Pending attack requires battle phase");
    }
    if (state.machine.autoEnd || state.machine.actionWindow?.window === ActionWindow.autoEnd) {
      throw new GameStateValidationError("Pending attack cannot coexist with auto-end");
    }
    if (pending.playerId !== state.turn.playerId) {
      throw new GameStateValidationError("Pending attack player must remain the current turn player");
    }
    if (!state.players[pending.playerId] || !state.players[pending.rivalId]) {
      throw new GameStateValidationError("Pending attack players must exist");
    }
    if (!pending.declarationEventId) {
      throw new GameStateValidationError("Pending attack requires declaration event id");
    }
    if (pending.playerId === pending.rivalId) {
      throw new GameStateValidationError("Pending attack players must be opponents");
    }
    if (pending.direct) {
      if (pending.targetCardId) {
        throw new GameStateValidationError("Direct pending attack cannot have a target card");
      }
      if (pending.targetPlayerId !== pending.rivalId) {
        throw new GameStateValidationError("Direct pending attack must target the rival player");
      }
    } else if (!pending.targetCardId) {
      throw new GameStateValidationError("Monster pending attack requires a target card");
    } else if (pending.targetPlayerId) {
      throw new GameStateValidationError("Monster pending attack cannot target a player");
    }
    const attacker = requireCardInZone(state, pending.playerId, "monsterZone", pending.attackerCardId);
    if (attacker.type !== "monster") {
      throw new GameStateValidationError("Pending attack attacker must be a monster");
    }
    if (pending.targetCardId) {
      const target = requireCardInZone(state, pending.rivalId, "monsterZone", pending.targetCardId);
      if (target.type !== "monster") {
        throw new GameStateValidationError("Pending attack target must be a monster");
      }
    }
  }
  if (state.gameOver) {
    if (typeof state.gameOver !== "object") {
      throw new GameStateValidationError("GameState.gameOver must be an object when set");
    }
    if (state.gameOver.winnerId !== null && state.gameOver.winnerId !== undefined && !state.players[state.gameOver.winnerId]) {
      throw new GameStateValidationError("Game-over winner must exist");
    }
    if (!Array.isArray(state.gameOver.loserIds) || state.gameOver.loserIds.some((playerId) => !state.players[playerId])) {
      throw new GameStateValidationError("Game-over losers must exist");
    }
  }
  const continuousEffects = state.continuousEffects || [];
  if (!Array.isArray(continuousEffects)) {
    throw new GameStateValidationError("GameState.continuousEffects must be an array");
  }
  for (const effect of continuousEffects) {
    if (!effect.id || !effect.playerId || !effect.sourceCardId || !effect.effectId) {
      throw new GameStateValidationError("Continuous effect is missing required fields");
    }
    if (!state.players[effect.playerId]) {
      throw new GameStateValidationError("Continuous effect player must exist");
    }
    if (!state.cards[effect.sourceCardId]) {
      throw new GameStateValidationError("Continuous effect source card must exist");
    }
    if (!findCardLocations(state, effect.sourceCardId).some((location) => location.zone === "spellTrapZone")) {
      throw new GameStateValidationError("Continuous effect source must stay in a spell/trap zone");
    }
    if (effect.targetCardId && !state.cards[effect.targetCardId]) {
      throw new GameStateValidationError("Continuous effect target card must exist");
    }
    if (effect.targetCardId && !findCardLocations(state, effect.targetCardId).some((location) => location.zone === "monsterZone")) {
      throw new GameStateValidationError("Continuous effect target must stay in a monster zone");
    }
    if (!Array.isArray(effect.operations)) {
      throw new GameStateValidationError("Continuous effect operations must be an array");
    }
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
    if (player.comboPassive) {
      if (!player.comboPassive.id || !Array.isArray(player.comboPassive.operations)) {
        throw new GameStateValidationError(`Player ${player.id} combo passive must be declarative`);
      }
      if (player.comboPassive.operations.some((operation) => !operation || typeof operation.op !== "string")) {
        throw new GameStateValidationError(`Player ${player.id} combo passive has an invalid operation`);
      }
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
        if (typeof cardId !== "string" || !cardId) {
          throw new GameStateValidationError(`${player.id}.${zone} contains an invalid card id`);
        }
        const card = state.cards[cardId];
        if (!card || typeof card !== "object") {
          throw new GameStateValidationError(`${player.id}.${zone} contains missing card ${cardId}`);
        }
        if (seenCards.has(cardId)) {
          throw new GameStateValidationError(`Card ${cardId} exists in multiple zones`);
        }
        if (card.ownerId && card.ownerId !== player.id) {
          throw new GameStateValidationError(`Card ${cardId} is in ${player.id}.${zone} but belongs to ${card.ownerId}`);
        }
        if (zone === "monsterZone" && card.type !== "monster") {
          throw new GameStateValidationError(`${player.id}.monsterZone contains non-monster card ${cardId}`);
        }
        if (zone === "spellTrapZone" && !["spell", "trap"].includes(card.type)) {
          throw new GameStateValidationError(`${player.id}.spellTrapZone contains invalid card ${cardId}`);
        }
        if (isTokenCard(card) && zone !== "monsterZone") {
          throw new GameStateValidationError(`Token ${cardId} cannot exist in ${player.id}.${zone}`);
        }
        if (state.cardDefinitionsComplete === true) {
          const templateId = card.templateId || card.id;
          const definition = state.cardDefinitions?.[templateId];
          if (!definition) {
            throw new GameStateValidationError(`Card ${cardId} references missing definition ${templateId}`);
          }
          if (definition.token === true && !isTokenCard(card)) {
            throw new GameStateValidationError(`Token ${cardId} requires an explicit token marker`);
          }
        }
        seenCards.set(cardId, { playerId: player.id, zone });
      }
    }

    if (player.zoneSlots !== undefined) {
      if (!player.zoneSlots || typeof player.zoneSlots !== "object") {
        throw new GameStateValidationError(`${player.id}.zoneSlots must be an object`);
      }
      for (const zone of FIXED_ZONE_KEYS) {
        const slots = player.zoneSlots[zone];
        const limit = ZONE_LIMITS[zone];
        if (!Array.isArray(slots) || slots.length !== limit) {
          throw new GameStateValidationError(`${player.id}.zoneSlots.${zone} must contain exactly ${limit} slots`);
        }
        if (slots.some((cardId) => cardId !== null && (typeof cardId !== "string" || !cardId))) {
          throw new GameStateValidationError(`${player.id}.zoneSlots.${zone} contains an invalid slot value`);
        }
        const occupied = slots.filter(Boolean);
        if (new Set(occupied).size !== occupied.length) {
          throw new GameStateValidationError(`${player.id}.zoneSlots.${zone} contains a duplicate card`);
        }
        const compact = player[zone];
        if (occupied.length !== compact.length || occupied.some((cardId) => !compact.includes(cardId))) {
          throw new GameStateValidationError(`${player.id}.zoneSlots.${zone} does not match ${player.id}.${zone}`);
        }
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
      if (abilityEntry.targetCardId) {
        if (!state.cards[abilityEntry.targetCardId]) {
          throw new GameStateValidationError(`Ability target ${abilityEntry.targetCardId} must exist`);
        }
        if (!player.monsterZone.includes(abilityEntry.targetCardId)) {
          throw new GameStateValidationError(`Ability target ${abilityEntry.targetCardId} must stay in ${player.id}.monsterZone`);
        }
      }
    }
  }

  return true;
}

export function applyGameEvent(state, event, options = {}) {
  if (!event?.type) {
    throw new GameRuleError("GameEvent requires a type");
  }
  for (const player of Object.values(state.players || {})) {
    ensurePlayerZoneSlots(player);
  }

  switch (event.type) {
    case "CARD_MOVED":
      applyCardMoved(state, event);
      break;
    case "TOKEN_REMOVED":
      applyTokenRemoved(state, event);
      break;
    case "CARD_DESTRUCTION_PREVENTED":
      applyCardDestructionPrevented(state, event);
      break;
    case "CARD_CREATED":
      applyCardCreated(state, event);
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
    case "CONTINUOUS_EFFECT_REGISTERED":
      applyContinuousEffectRegistered(state, event);
      break;
    case "CONTINUOUS_EFFECT_RELEASED":
      applyContinuousEffectReleased(state, event);
      break;
    case "PHASE_CHANGED":
      applyPhaseChanged(state, event);
      break;
    case "TURN_STARTED":
      applyTurnStarted(state, event);
      break;
    case "TURN_ENDED":
      applyTurnEnded(state, event);
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
    case "ACTION_WINDOW_OPENED":
      applyActionWindowOpened(state, event);
      break;
    case "AUTO_END_REQUESTED":
      applyAutoEndRequested(state, event);
      break;
    case "AUTO_END_CANCELED":
      applyAutoEndCanceled(state, event);
      break;
    case "AUTO_END_COMMITTED":
      applyAutoEndCommitted(state, event);
      break;
    case "GAME_OVER_DECLARED":
      applyGameOverDeclared(state, event);
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
    case "ABILITY_EXPIRED":
      applyAbilityExpired(state, event);
      break;
    case "TURN_ABILITIES_EXPIRED":
      applyTurnAbilitiesExpired(state, event);
      break;
    case "COMBO_TRIGGERED":
      applyComboTriggered(state, event);
      break;
    case "CHARACTER_PASSIVE_TRIGGERED":
      applyCharacterPassiveTriggered(state, event);
      break;
    case "NORMAL_SUMMON_USED":
      applyNormalSummonUsed(state, event);
      break;
    case "COMMAND_DISPATCHED":
    case "TURN_DRAW_RESOLVED":
    case "CARD_ACTIVATED":
    case "TRAP_SET":
    case "CARD_DESTROYED":
    case "CARD_TRIBUTED":
    case "MATERIALS_SENT":
    case "FUSION_SUMMONED":
    case "TRIO_CONVERGENCE_RESOLVED":
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
      applyAttackDeclared(state, event);
      break;
    case "ATTACK_TARGET_CHANGED":
      applyAttackTargetChanged(state, event);
      break;
    case "BATTLE_RESOLVED":
      applyBattleResolved(state, event);
      break;
    case "ATTACK_CANCELED":
      applyAttackCanceled(state, event);
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
  const card = requireCard(state, event.cardId);
  const locations = findCardLocations(state, event.cardId);
  if (event.from && !locations.some((location) => sameLocation(location, event.from))) {
    throw new GameRuleError(`Card ${event.cardId} is not in ${event.from.playerId}.${event.from.zone}`);
  }
  if (!event.to?.playerId || !event.to?.zone) {
    throw new GameRuleError("CARD_MOVED requires a destination playerId and zone");
  }
  if (isTokenCard(card) && event.to.zone !== "monsterZone") {
    throw new GameRuleError(`Token ${event.cardId} must leave play through TOKEN_REMOVED`);
  }

  const destinationPlayer = requirePlayer(state, event.to.playerId);
  const destinationZone = requireZone(destinationPlayer, event.to.zone);
  const limit = ZONE_LIMITS[event.to.zone];
  assertZoneIndexWithinLimit(event.to.zone, event.to.index);
  const destinationIndex = limit
    ? resolveFixedDestinationIndex(state, event.to.playerId, event.to.zone, event.to.index, event.cardId)
    : event.to.index ?? null;
  if (limit && destinationZone.length >= limit && !destinationZone.includes(event.cardId)) {
    throw new GameRuleError(`${event.to.zone} is full`);
  }

  for (const location of locations) {
    const sourcePlayer = requirePlayer(state, location.playerId);
    removeFromZone(sourcePlayer[location.zone], event.cardId);
    removeFromFixedZoneSlots(sourcePlayer, location.zone, event.cardId);
  }

  if (limit) {
    placeInFixedZoneSlots(destinationPlayer, event.to.zone, event.cardId, destinationIndex);
    syncCompactFixedZone(destinationPlayer, event.to.zone);
  } else if (Number.isInteger(destinationIndex) && destinationIndex >= 0 && destinationIndex <= destinationZone.length) {
    destinationZone.splice(destinationIndex, 0, event.cardId);
  } else {
    destinationZone.push(event.cardId);
  }
}

function applyTokenRemoved(state, event) {
  const card = requireCard(state, event.cardId);
  if (!isTokenCard(card)) {
    throw new GameRuleError(`Card ${event.cardId} is not a token`);
  }
  const locations = findCardLocations(state, event.cardId);
  if (event.from && !locations.some((location) => sameLocation(location, event.from))) {
    throw new GameRuleError(`Card ${event.cardId} is not in ${event.from.playerId}.${event.from.zone}`);
  }
  for (const location of locations) {
    const player = requirePlayer(state, location.playerId);
    removeFromZone(player[location.zone], event.cardId);
    removeFromFixedZoneSlots(player, location.zone, event.cardId);
  }
  delete state.cards[event.cardId];
}

function applyCardDestructionPrevented(state, event) {
  const card = requireCardInZone(state, event.playerId, "monsterZone", event.cardId);
  if (!cardHasDestructionProtection(card)) {
    throw new GameRuleError(`Card ${event.cardId} cannot prevent destruction`);
  }
  card.destructionProtectionUsed = event.afterProtectionUsed !== false;
}

function applyCardCreated(state, event) {
  requirePlayer(state, event.playerId);
  if (state.cards[event.cardId]) {
    throw new GameRuleError(`Card ${event.cardId} already exists`);
  }
  if (!event.to?.playerId || !event.to?.zone) {
    throw new GameRuleError("CARD_CREATED requires a destination playerId and zone");
  }

  const destinationPlayer = requirePlayer(state, event.to.playerId);
  const destinationZone = requireZone(destinationPlayer, event.to.zone);
  const limit = ZONE_LIMITS[event.to.zone];
  assertZoneIndexWithinLimit(event.to.zone, event.to.index);
  const destinationIndex = limit
    ? resolveFixedDestinationIndex(state, event.to.playerId, event.to.zone, event.to.index, null)
    : event.to.index ?? null;
  if (limit && destinationZone.length >= limit) {
    throw new GameRuleError(`${event.to.zone} is full`);
  }

  state.cards[event.cardId] = {
    ...(event.card || {}),
    id: event.cardId,
    templateId: event.templateId || event.card?.templateId || event.cardId,
    ownerId: event.playerId
  };

  if (limit) {
    placeInFixedZoneSlots(destinationPlayer, event.to.zone, event.cardId, destinationIndex);
    syncCompactFixedZone(destinationPlayer, event.to.zone);
  } else if (Number.isInteger(destinationIndex) && destinationIndex >= 0 && destinationIndex <= destinationZone.length) {
    destinationZone.splice(destinationIndex, 0, event.cardId);
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
  const pierced = Math.max(0, Number(event.shieldPierced) || 0);
  const blocked = Math.max(0, Number(event.blocked) || 0);
  if (pierced > 0 || blocked > 0 || player.shield !== undefined) {
    player.shield = Math.max(0, (Number(player.shield) || 0) - pierced - blocked);
  }
  player.lp = Math.max(0, player.lp - amount);
}

function applyGameOverDeclared(state, event) {
  const loserIds = Array.isArray(event.loserIds)
    ? event.loserIds.slice()
    : [event.loserId].filter(Boolean);
  loserIds.forEach((playerId) => requirePlayer(state, playerId));
  const winnerId = event.winnerId || null;
  if (winnerId) requirePlayer(state, winnerId);
  const windowPlayerId = winnerId || loserIds[0] || state.turn.playerId;
  requirePlayer(state, windowPlayerId);
  const openedAt = Number(event.declaredAt) || Number(event.id) || 0;

  state.gameOver = {
    winnerId,
    loserIds,
    reason: event.reason || "lp-zero",
    sourceCardId: event.sourceCardId || null,
    triggerEventId: event.triggerEventId || null
  };
  state.machine.responseWindow = null;
  state.machine.chain = [];
  state.machine.autoEnd = null;
  state.machine.pendingAttack = null;
  state.machine.actionWindow = {
    playerId: windowPlayerId,
    window: ActionWindow.gameOver,
    windowId: event.windowId || `game-over-${event.id || openedAt}`,
    reason: event.reason || "game-over",
    openedAt,
    deadline: openedAt
  };
}

function applyMonsterSummoned(state, event) {
  const card = requireCard(state, event.cardId);
  card.mode = event.mode || "attack";
  card.used = Boolean(event.used);
  card.attackLockReason = event.attackLockReason || null;
  card.changedMode = Boolean(event.changedMode);
  card.tempAtk = Number(event.tempAtk) || 0;
  card.tempDef = Number(event.tempDef) || 0;
  card.battleWear = Math.max(0, Number(event.battleWear) || 0);
  card.destructionProtectionUsed = Boolean(event.destructionProtectionUsed);
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
  card.attackLockReason = event.afterAttackLockReason || null;
  if ("afterDestructionProtectionUsed" in event) {
    card.destructionProtectionUsed = Boolean(event.afterDestructionProtectionUsed);
  }
}

function applyBattleWearApplied(state, event) {
  const card = requireCard(state, event.cardId);
  card.battleWear = Math.max(0, Number(event.after) || 0);
  card.tempAtk = Number(event.tempAtkAfter);
  card.tempDef = Number(event.tempDefAfter);
}

function applyAttackDeclared(state, event) {
  requirePlayer(state, event.playerId);
  requirePlayer(state, event.rivalId);
  requireCardInZone(state, event.playerId, "monsterZone", event.attackerCardId);
  if (event.targetCardId) {
    requireCardInZone(state, event.rivalId, "monsterZone", event.targetCardId);
  }
  state.machine.pendingAttack = {
    playerId: event.playerId,
    rivalId: event.rivalId,
    attackerCardId: event.attackerCardId,
    targetCardId: event.targetCardId || null,
    targetPlayerId: event.targetPlayerId || null,
    direct: Boolean(event.direct),
    declarationEventId: event.id,
    timing: event.timing || Timing.attackDeclaration
  };
}

function applyAttackTargetChanged(state, event) {
  const pending = requirePendingAttack(state, event.playerId);
  const targetCardId = event.toTargetCardId || event.targetCardId || null;
  if (!targetCardId) {
    throw new GameRuleError("ATTACK_TARGET_CHANGED requires a target card");
  }
  if (event.declarationEventId && String(event.declarationEventId) !== String(pending.declarationEventId)) {
    throw new GameRuleError(`Redirected attack ${event.declarationEventId} does not match pending attack ${pending.declarationEventId}`);
  }
  if (event.attackerCardId && event.attackerCardId !== pending.attackerCardId) {
    throw new GameRuleError(`Redirected attack attacker ${event.attackerCardId} does not match ${pending.attackerCardId}`);
  }
  const target = requireCardInZone(state, pending.rivalId, "monsterZone", targetCardId);
  if (target.type !== "monster") {
    throw new GameRuleError(`Redirected attack target ${targetCardId} is not a monster`);
  }
  pending.targetCardId = targetCardId;
  pending.targetPlayerId = null;
  pending.direct = false;
}

function applyBattleResolved(state, event) {
  if (state.machine.pendingAttack) {
    const pending = state.machine.pendingAttack;
    if (event.declarationEventId && String(event.declarationEventId) !== String(pending.declarationEventId)) {
      throw new GameRuleError(`Battle resolution ${event.declarationEventId} does not match pending attack ${pending.declarationEventId}`);
    }
  }
  state.machine.pendingAttack = null;
}

function applyAttackCanceled(state, event) {
  if (!state.machine.pendingAttack) {
    throw new GameRuleError("ATTACK_CANCELED requires a pending attack");
  }
  const pending = state.machine.pendingAttack;
  if (String(event.declarationEventId) !== String(pending.declarationEventId)) {
    throw new GameRuleError(`Canceled attack ${event.declarationEventId} does not match pending attack ${pending.declarationEventId}`);
  }
  state.machine.pendingAttack = null;
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

function applyContinuousEffectRegistered(state, event) {
  requirePlayer(state, event.playerId);
  requireCard(state, event.sourceCardId);
  if (event.targetCardId) requireCard(state, event.targetCardId);
  state.continuousEffects = Array.isArray(state.continuousEffects) ? state.continuousEffects : [];
  if (state.continuousEffects.some((entry) => entry.id === event.id)) {
    throw new GameRuleError(`Continuous effect ${event.id} is already registered`);
  }
  state.continuousEffects.push({
    id: event.id,
    playerId: event.playerId,
    sourceCardId: event.sourceCardId,
    effectId: event.effectId,
    targetCardId: event.targetCardId || null,
    destroySourceWhenTargetLeaves: event.destroySourceWhenTargetLeaves !== false,
    operations: clone(event.operations || [])
  });
}

function applyContinuousEffectReleased(state, event) {
  requirePlayer(state, event.playerId);
  requireCard(state, event.sourceCardId);
  if (event.targetCardId) requireCard(state, event.targetCardId);
  state.continuousEffects = Array.isArray(state.continuousEffects) ? state.continuousEffects : [];
  const index = state.continuousEffects.findIndex((entry) => entry.id === event.id);
  if (index < 0) {
    throw new GameRuleError(`Continuous effect ${event.id} is not active`);
  }
  state.continuousEffects.splice(index, 1);
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
  state.machine.actionWindow = null;
  state.machine.autoEnd = null;
  state.machine.pendingAttack = null;
}

function applyTurnStarted(state, event) {
  const player = requirePlayer(state, event.playerId);
  state.turn.playerId = event.playerId;
  state.turn.phase = Phase.draw;
  state.machine.phase = Phase.draw;
  state.machine.timing = Timing.draw;
  state.machine.responseWindow = null;
  state.machine.chain = [];
  state.machine.actionWindow = null;
  state.machine.autoEnd = null;
  state.machine.pendingAttack = null;
  player.attacksSkipped = false;
  player.comboThisTurn = false;
  player.comboFlags = {};
  player.normalSummonsUsed = 0;
}

function applyTurnEnded(state, event) {
  requirePlayer(state, event.playerId);
  requirePlayer(state, event.nextPlayerId);
  if (event.phase !== Phase.end || event.timing !== Timing.end) {
    throw new GameRuleError("TURN_ENDED must move the turn to end timing");
  }
  state.turn.playerId = event.playerId;
  state.turn.phase = Phase.end;
  state.machine.phase = Phase.end;
  state.machine.timing = Timing.end;
  state.machine.responseWindow = null;
  state.machine.chain = [];
  state.machine.actionWindow = null;
  state.machine.autoEnd = null;
  state.machine.pendingAttack = null;
}

function applyComboTriggered(state, event) {
  const player = requirePlayer(state, event.playerId);
  if (!event.comboId) throw new GameRuleError("COMBO_TRIGGERED requires comboId");
  player.comboFlags[event.comboId] = true;
}

function applyCharacterPassiveTriggered(state, event) {
  const player = requirePlayer(state, event.playerId);
  player.comboThisTurn = true;
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
  const openedAt = Number(event.openedAt) || Number(event.id) || 0;
  state.machine.responseWindow = {
    playerId: event.playerId,
    type: event.windowType,
    timing: event.timing,
    resumeTiming: event.resumeTiming || event.timing,
    triggerEventId: event.triggerEventId || null,
    prompt: event.prompt || null,
    context: clone(event.context || {})
  };
  state.machine.actionWindow = {
    playerId: event.playerId,
    window: ActionWindow.response,
    windowId: event.windowId || `${ActionWindow.response}:${openedAt}`,
    reason: event.prompt || "response-window",
    openedAt,
    deadline: Number(event.deadline) || openedAt
  };
}

function applyResponseWindowClosed(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.responseWindow = null;
  if (state.machine.actionWindow?.window === ActionWindow.response) {
    state.machine.actionWindow = null;
  }
}

function applyActionWindowOpened(state, event) {
  requirePlayer(state, event.playerId);
  if (!ACTION_WINDOWS.has(event.window)) {
    throw new GameRuleError(`Unknown action window ${event.window}`);
  }
  if (!event.windowId || !Number.isFinite(Number(event.openedAt)) || !Number.isFinite(Number(event.deadline))) {
    throw new GameRuleError("ACTION_WINDOW_OPENED requires valid timing data");
  }
  state.machine.actionWindow = {
    playerId: event.playerId,
    window: event.window,
    windowId: event.windowId,
    reason: event.reason || "",
    openedAt: Number(event.openedAt),
    deadline: Number(event.deadline)
  };
}

function applyAutoEndRequested(state, event) {
  requirePlayer(state, event.playerId);
  if (!Number.isFinite(Number(event.requestedAt)) || !Number.isFinite(Number(event.deadline))) {
    throw new GameRuleError("AUTO_END_REQUESTED requires valid timing data");
  }
  state.machine.autoEnd = {
    playerId: event.playerId,
    reason: event.reason || "",
    requestedAt: Number(event.requestedAt),
    deadline: Number(event.deadline)
  };
}

function applyAutoEndCanceled(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.autoEnd = null;
  if (state.machine.actionWindow?.window === ActionWindow.autoEnd) {
    state.machine.actionWindow = null;
  }
}

function applyAutoEndCommitted(state, event) {
  requirePlayer(state, event.playerId);
  state.machine.autoEnd = null;
  if (state.machine.actionWindow?.window === ActionWindow.autoEnd) {
    state.machine.actionWindow = null;
  }
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
    sourceCardId: event.sourceCardId || null,
    targetCardId: event.targetCardId || null
  });
}

function applyAbilitySpent(state, event) {
  requirePlayer(state, event.playerId);
  requireAbility(event.ability);
  const abilities = state.abilities[event.playerId];
  const index = abilities.findIndex((entry) =>
    entry.ability === event.ability
    && entry.uses > 0
    && (!event.sourceCardId || entry.sourceCardId === event.sourceCardId)
    && (!event.targetCardId || entry.targetCardId === event.targetCardId)
  );
  if (index === -1) {
    throw new GameRuleError(`${event.playerId} does not have ability ${event.ability}`);
  }

  abilities[index].uses -= 1;
  if (abilities[index].uses <= 0) {
    abilities.splice(index, 1);
  }
}

function applyAbilityExpired(state, event) {
  requirePlayer(state, event.playerId);
  requireAbility(event.ability);
  const abilities = state.abilities[event.playerId];
  const index = abilities.findIndex((entry) =>
    entry.ability === event.ability
    && entry.targetCardId === event.targetCardId
    && (!event.sourceCardId || entry.sourceCardId === event.sourceCardId)
  );
  if (index === -1) {
    throw new GameRuleError(`${event.playerId} does not have expiring ability ${event.ability}`);
  }
  abilities.splice(index, 1);
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
    if (requirement.type === "minDeckCount") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const count = Math.max(0, Number(requirement.count) || 0);
      const actual = requirePlayer(state, playerId).deck.length;
      if (actual < count) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires at least ${count} cards in deck`);
      }
      continue;
    }
    if (requirement.type === "minEmptyMonsterZone") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const count = Math.max(0, Number(requirement.count) || 0);
      const actual = Math.max(0, MONSTER_ZONE_SIZE - requirePlayer(state, playerId).monsterZone.length);
      if (actual < count) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires at least ${count} empty monster zone slots`);
      }
      continue;
    }
    if (requirement.type === "maxLp") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const amount = Math.max(0, Number(requirement.amount) || 0);
      const actual = requirePlayer(state, playerId).lp;
      if (actual > amount) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires LP at most ${amount}`);
      }
      continue;
    }
    if (requirement.type === "requireFieldCards") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const missing = missingMaterialRequirements(state, playerId, requirement.materials || requirement.cards || requirement.templates || []);
      if (missing.length > 0) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires field materials ${missing.join(", ")}`);
      }
      continue;
    }
    if (requirement.type === "noSpellTrapTemplate") {
      const playerId = resolvePlayerRef(requirement.player, action);
      const templateId = requirement.templateId || requirement.id;
      const player = requirePlayer(state, playerId);
      const blocked = player.spellTrapZone.some((cardId) => cardMatchesTemplate(requireCard(state, cardId), templateId));
      if (blocked) {
        throw new GameRuleError(`Effect ${card.effect || card.id} requires no ${templateId} in ${playerId}.spellTrapZone`);
      }
      continue;
    }
    if (requirement.type === "noActiveContinuousEffect") {
      const sourcePlayerId = requirement.sourcePlayer
        ? resolvePlayerRef(requirement.sourcePlayer, action)
        : null;
      const targetPlayerId = requirement.targetPlayer
        ? resolvePlayerRef(requirement.targetPlayer, action)
        : null;
      const targetMonsterZone = targetPlayerId
        ? requirePlayer(state, targetPlayerId).monsterZone
        : null;
      const blocked = (state.continuousEffects || []).some((effect) => {
        if (sourcePlayerId && effect.playerId !== sourcePlayerId) return false;
        if (requirement.effectId && effect.effectId !== requirement.effectId) return false;
        if (targetMonsterZone && !targetMonsterZone.includes(effect.targetCardId)) return false;
        return true;
      });
      if (blocked) {
        const sourceText = sourcePlayerId ? ` from ${sourcePlayerId}` : "";
        const targetText = targetPlayerId ? ` on ${targetPlayerId} monsters` : "";
        throw new GameRuleError(`Effect ${card.effect || card.id} requires no active continuous effect${sourceText}${targetText}`);
      }
      continue;
    }
    if (requirement.type === "responseWindow") {
      const responseWindow = state.machine.responseWindow;
      if (!responseWindow) {
        throw new GameRuleError(`Effect ${card.trigger || card.effect || card.id} requires a response window`);
      }
      if (requirement.prompt && responseWindow.prompt !== requirement.prompt) {
        throw new GameRuleError(`Effect ${card.trigger || card.effect || card.id} requires ${requirement.prompt} response window`);
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

function normalizeMaterialRequirements(materials = []) {
  return (Array.isArray(materials) ? materials : [materials])
    .map((entry) => typeof entry === "string"
      ? { templateId: entry, count: 1 }
      : { templateId: entry?.templateId || entry?.id, count: Math.max(1, Number(entry?.count) || 1) })
    .filter((entry) => entry.templateId);
}

function cardMatchesTemplate(card, templateId) {
  return Boolean(card && templateId && (card.templateId === templateId || card.id === templateId));
}

function destructionProtectionType(card) {
  const protection = card?.destructionProtection;
  if (protection === true || card?.divineGuard) return "divineGuard";
  if (typeof protection === "string") return protection;
  return protection?.type || "";
}

function cardHasDestructionProtection(card) {
  return Boolean(destructionProtectionType(card));
}

function shouldPreventDestruction(card, location, options = {}) {
  if (options.ignoreProtection) return false;
  if (location?.zone !== "monsterZone") return false;
  if (!cardHasDestructionProtection(card)) return false;
  return !card.destructionProtectionUsed;
}

function selectMaterialCardIds(state, playerId, materials = []) {
  const player = requirePlayer(state, playerId);
  const available = player.monsterZone.slice();
  const selected = [];
  for (const requirement of normalizeMaterialRequirements(materials)) {
    for (let index = 0; index < requirement.count; index += 1) {
      const foundIndex = available.findIndex((cardId) => cardMatchesTemplate(requireCard(state, cardId), requirement.templateId));
      if (foundIndex < 0) {
        throw new GameRuleError(`Missing field material ${requirement.templateId}`);
      }
      const [cardId] = available.splice(foundIndex, 1);
      selected.push(cardId);
    }
  }
  return selected;
}

function missingMaterialRequirements(state, playerId, materials = []) {
  try {
    selectMaterialCardIds(state, playerId, materials);
    return [];
  } catch (error) {
    if (error instanceof GameRuleError) {
      return normalizeMaterialRequirements(materials).map((entry) => entry.templateId);
    }
    throw error;
  }
}

function findCardByTemplateInZones(state, playerId, templateId, zones = []) {
  const player = requirePlayer(state, playerId);
  for (const zone of zones) {
    const cardIds = requireZone(player, zone);
    const cardId = cardIds.find((candidateId) => cardMatchesTemplate(requireCard(state, candidateId), templateId));
    if (cardId) return { cardId, card: requireCard(state, cardId), zone };
  }
  return null;
}

function tokenTemplateForState(state, templateId) {
  const definitions = state.cardDefinitions || state.cardTemplates || {};
  return definitions[templateId] || null;
}

function nextGeneratedCardId(state, templateId) {
  let suffix = Math.max(1, Number(state.nextEventId) || 1);
  let cardId = `${templateId}:token:${suffix}`;
  while (state.cards[cardId]) {
    suffix += 1;
    cardId = `${templateId}:token:${suffix}`;
  }
  return cardId;
}

function cardMatchesTargetDefinition(state, cardId, targetDefinition = {}) {
  if (!targetDefinition.cardType) return true;
  return requireCard(state, cardId).type === targetDefinition.cardType;
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
  if (!cardMatchesTargetDefinition(state, action.targetCardId, definition.target)) {
    throw new GameRuleError(`Target ${action.targetCardId} requires a ${definition.target.cardType} target`);
  }
  if (!canEffectTargetCard(card, target, {
    sourceOwner: card.ownerId || action.playerId,
    targetOwner: target.ownerId || playerId
  })) {
    throw new GameRuleError(`Target ${action.targetCardId} is protected by target resistance`);
  }
  if (definition.target.rule === "strongestAtk") {
    const candidates = cards
      .filter((cardId) => cardMatchesTargetDefinition(state, cardId, definition.target))
      .filter((cardId) => canEffectTargetCard(card, requireCard(state, cardId), {
        sourceOwner: card.ownerId || action.playerId,
        targetOwner: requireCard(state, cardId).ownerId || playerId
      }))
      .map((cardId) => requireCard(state, cardId));
    if (!candidates.length) {
      throw new GameRuleError(`Effect ${card.effect || card.onSummon || card.trigger || card.id} has no legal target`);
    }
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
  const resolvedOperations = resolveOneShotOperationSelectors(definition.operations, ctx, action, card);
  for (const operation of resolvedOperations) {
    runEffectOperation(operation, ctx, action, card);
  }
}

function resolveOneShotOperationSelectors(operations, ctx, action, card) {
  const selectorTargets = new Map();
  return operations.map((operation) => {
    const selector = resolveValue(operation.cardId, action, card);
    if (!selector || typeof selector !== "object" || Array.isArray(selector) || !selector.rule) {
      return operation;
    }
    const selectorKey = JSON.stringify(selector);
    if (!selectorTargets.has(selectorKey)) {
      selectorTargets.set(selectorKey, ctx.resolveCardIds(selector));
    }
    const resolvedCardIds = selectorTargets.get(selectorKey);
    return {
      ...operation,
      cardId: resolvedCardIds.length === 1 ? resolvedCardIds[0] : resolvedCardIds
    };
  });
}

function runContinuousEffectDefinition(definition, ctx, action, card) {
  if (definition.duration !== EffectDuration.continuous) {
    throw new GameRuleError(`Effect ${action.cardId} is not a continuous effect`);
  }
  for (const operation of definition.operations) {
    if (operation.op !== "modifyStat") {
      throw new GameRuleError(`Continuous effect ${action.cardId} cannot use ${operation.op}`);
    }
    runEffectOperation(operation, ctx, action, card, { duration: EffectDuration.continuous });
  }
}

function runEffectOperation(operation, ctx, action, card, options = {}) {
  const source = {
    sourceCardId: action.cardId || card.id,
    ...(options.duration ? { duration: options.duration } : {})
  };
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
    case "specialSummonFromGrave":
      return ctx.specialSummonFromGrave(
        resolvePlayerRef(operation.player, action),
        resolveValue(operation.cardId, action, card),
        { ...source, index: operation.index, mode: operation.mode }
      );
    case "sendMaterialsToGrave":
      return ctx.sendMaterialsToGrave(resolvePlayerRef(operation.player, action), resolveValue(operation.materials || [], action, card), source);
    case "specialSummonFromDeckOrHand":
      return ctx.specialSummonFromDeckOrHand(resolvePlayerRef(operation.player, action), resolveValue(operation.templateId, action, card), {
        ...source,
        index: operation.index,
        mode: operation.mode
      });
    case "createToken":
      return ctx.createTokens(resolvePlayerRef(operation.player, action), resolveValue(operation.templateId, action, card), {
        ...source,
        count: operation.count,
        index: operation.index,
        mode: operation.mode,
        originCardId: action.targetCardId || null
      });
    case "destroyCard":
      return ctx.destroyCard(resolveValue(operation.cardId, action, card), source);
    case "summonMonster":
      return ctx.summonMonster(resolvePlayerRef(operation.player, action), resolveValue(operation.cardId, action, card), { ...source, index: operation.index });
    case "modifyStat":
      return ctx.modifyStat(resolveValue(operation.cardId, action, card), operation.stat, operation.amount, source);
    case "negateEffect":
      return ctx.negateEffect(resolveValue(operation.targetEffectId, action, card), source);
    case "redirectAttackTarget":
      return ctx.redirectAttackTarget(resolveValue(operation.targetCardId, action, card), source);
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
        duration: operation.duration,
        targetCardId: action.targetCardId || null
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
    if (cardId.rule === "first") {
      return cardIds.length > 0 ? [cardIds[0]] : [];
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

function continuousEffectsForMove(state, cardId, from, to) {
  if (!from || !to || sameLocation(from, to)) return [];
  const effects = Array.isArray(state.continuousEffects) ? state.continuousEffects : [];
  return effects
    .map((effect) => {
      if (effect.sourceCardId === cardId && from.zone === "spellTrapZone" && to.zone !== "spellTrapZone") {
        return { effect, reason: "source-left-zone" };
      }
      if (effect.targetCardId === cardId && from.zone === "monsterZone" && to.zone !== "monsterZone") {
        return { effect, reason: "target-left-zone" };
      }
      return null;
    })
    .filter(Boolean);
}

function validateBattleDeclaration(state, playerId, rivalId, action) {
  const player = requirePlayer(state, playerId);
  if (player.attacksSkipped || hasAbility(state, playerId, Ability.skipAttackLock)) {
    throw new GameRuleError(`${playerId} skipped attacks for this turn`);
  }
  const attacker = requireMonsterInZone(state, playerId, "monsterZone", action.attackerCardId, "attacker");
  if (attacker.attackLockReason) {
    throw new GameRuleError(`Monster ${action.attackerCardId} cannot attack this turn (${attacker.attackLockReason})`);
  }
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

function cardIsInZone(state, playerId, zone, cardId) {
  return Boolean(state.players[playerId]?.[zone]?.includes(cardId));
}

function pendingAttackContextLossReason(state) {
  const pending = state.machine.pendingAttack;
  if (!pending) return "";
  if (!cardIsInZone(state, pending.playerId, "monsterZone", pending.attackerCardId)) {
    return "attacker-left-field";
  }
  if (pending.targetCardId && !cardIsInZone(state, pending.rivalId, "monsterZone", pending.targetCardId)) {
    return "target-left-field";
  }
  return "";
}

function battleActionWindowForPlayer(playerId) {
  return playerId === "ai" ? ActionWindow.ai : ActionWindow.battle;
}

function completeBattleFlow(state, emit, playerId, reason) {
  if (
    state.gameOver ||
    state.turn.playerId !== playerId ||
    state.turn.phase !== Phase.battle ||
    state.machine.phase !== Phase.battle ||
    state.machine.pendingAttack ||
    state.machine.responseWindow ||
    (state.machine.chain || []).length > 0
  ) {
    return null;
  }
  if (state.machine.timing !== Timing.battleOpen) {
    emit("TIMING_CHANGED", {
      playerId,
      from: state.machine.timing,
      to: Timing.battleOpen
    });
  }
  const window = battleActionWindowForPlayer(playerId);
  const openedAt = Number(state.nextEventId) || state.events.length + 1;
  return emit("ACTION_WINDOW_OPENED", {
    playerId,
    window,
    windowId: `${window}:battle-flow:${openedAt}`,
    reason,
    openedAt,
    deadline: 0
  });
}

function cancelPendingAttackIfContextLost(state, emit) {
  const pending = state.machine.pendingAttack;
  const reason = pendingAttackContextLossReason(state);
  if (!pending || !reason) return false;
  emit("ATTACK_CANCELED", {
    playerId: pending.playerId,
    rivalId: pending.rivalId,
    attackerCardId: pending.attackerCardId,
    targetCardId: pending.targetCardId || null,
    targetPlayerId: pending.targetPlayerId || null,
    direct: Boolean(pending.direct),
    declarationEventId: pending.declarationEventId,
    reason,
    consumeAttack: false
  });
  return true;
}

function requirePendingAttack(state, playerId = null) {
  const pending = state.machine.pendingAttack;
  if (!pending) {
    throw new GameRuleError("No attack is pending");
  }
  if (playerId && pending.playerId !== playerId) {
    throw new GameRuleError(`Pending attack belongs to ${pending.playerId}`);
  }
  return pending;
}

function assertBattleResolutionMatchesPendingAttack(state, action) {
  const pending = state.machine.pendingAttack;
  if (!pending) return;
  if (pending.playerId !== action.playerId) {
    throw new GameRuleError(`Pending attack belongs to ${pending.playerId}`);
  }
  if (pending.attackerCardId !== action.attackerCardId) {
    throw new GameRuleError(`Pending attack attacker ${pending.attackerCardId} does not match ${action.attackerCardId}`);
  }
  const targetCardId = action.targetCardId || null;
  if ((pending.targetCardId || null) !== targetCardId) {
    throw new GameRuleError(`Pending attack target ${pending.targetCardId || "(direct)"} does not match ${targetCardId || "(direct)"}`);
  }
  if (action.declarationEventId && String(action.declarationEventId) !== String(pending.declarationEventId)) {
    throw new GameRuleError(`Pending attack declaration ${pending.declarationEventId} does not match ${action.declarationEventId}`);
  }
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
  if (!card.used || card.attackLockReason) return false;
  const reset = (state.abilities[playerId] || []).find((entry) =>
    entry.ability === Ability.attackReset
    && entry.uses > 0
    && (!entry.targetCardId || entry.targetCardId === cardId)
  );
  if (!reset) return false;

  emit("ABILITY_SPENT", {
    playerId,
    ability: Ability.attackReset,
    cardId,
    sourceCardId: reset.sourceCardId || null,
    targetCardId: reset.targetCardId || null
  });
  emit("MONSTER_READIED", {
    playerId,
    cardId,
    beforeUsed: true,
    afterUsed: false,
    sourceCardId: reset.sourceCardId || null
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
    const shield = engineShieldPreview(attack, requirePlayer(state, rivalId).shield, attacker);
    return {
      kind: "direct",
      attack,
      targetValue: 0,
      diff: attack,
      rawDamage: attack,
      finalDamage: shield.finalDamage,
      shieldPierced: shield.shieldPierced,
      shieldBlocked: shield.blocked,
      damagePlayerId: rivalId,
      damageSourceCardId: attacker.id,
      destroysAttacker: false,
      destroysTarget: false,
      wear: 0
    };
  }

  const targetValue = engineBattleValue(target);
  const diff = attack - targetValue;
  if (diff > 0) {
    const piercesDefense = target.mode === "defense" && cardHasPiercingDamage(attacker);
    const rawDamage = piercesDefense || target.mode !== "defense" ? diff : 0;
    const shield = engineShieldPreview(rawDamage, requirePlayer(state, rivalId).shield, attacker);
    return {
      kind: piercesDefense ? "pierceDefense" : target.mode === "defense" ? "breakDefense" : "attackWin",
      attack,
      targetValue,
      diff,
      rawDamage,
      finalDamage: shield.finalDamage,
      shieldPierced: shield.shieldPierced,
      shieldBlocked: shield.blocked,
      piercing: piercesDefense,
      damagePlayerId: rawDamage > 0 ? rivalId : null,
      damageSourceCardId: rawDamage > 0 ? attacker.id : null,
      destroysAttacker: false,
      destroysTarget: true,
      wear: 0
    };
  }

  if (diff < 0) {
    const rawDamage = Math.abs(diff);
    const shield = engineShieldPreview(rawDamage, requirePlayer(state, playerId).shield, target);
    return {
      kind: target.mode === "defense" ? "guardCounter" : "countered",
      attack,
      targetValue,
      diff,
      rawDamage,
      finalDamage: shield.finalDamage,
      shieldPierced: shield.shieldPierced,
      shieldBlocked: shield.blocked,
      damagePlayerId: playerId,
      damageSourceCardId: target.id,
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
      shieldPierced: 0,
      shieldBlocked: 0,
      damagePlayerId: null,
      damageSourceCardId: null,
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
    shieldPierced: 0,
    shieldBlocked: 0,
    damagePlayerId: null,
    damageSourceCardId: null,
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

function cardHasPiercingDamage(card) {
  return Boolean(card?.piercingDamage || card?.divinePierce);
}

function cardShieldPierceAmount(card) {
  const config = card?.shieldPierce || card?.divinePressure;
  if (config === true) return 500;
  if (typeof config === "number") return Math.max(0, config);
  if (config && typeof config === "object") return Math.max(0, Number(config.amount) || 0);
  return 0;
}

function resolveAfterAttackEffect(effects, state, ctx, playerId, rivalId, attackerCardId) {
  const stillOnField = findCardLocations(state, attackerCardId).some((location) =>
    location.playerId === playerId && location.zone === "monsterZone"
  );
  if (!stillOnField) return;

  const attacker = requireCard(state, attackerCardId);
  if (!attacker.afterAttack) return;
  const effectAction = {
    type: "AFTER_ATTACK_EFFECT",
    playerId,
    rivalId,
    cardId: attackerCardId,
    attackerCardId
  };
  const skipReason = effectRequirementFailure(effects[attacker.afterAttack], state, effectAction, attacker);
  if (skipReason) return;
  runEffect(effects, attacker.afterAttack, ctx, effectAction, attacker);
}

function engineShieldPreview(amount, shield = 0, sourceCard = null) {
  const rawAmount = Math.max(0, Number(amount) || 0);
  const shieldBefore = Math.max(0, Number(shield) || 0);
  const shieldPierced = Math.min(shieldBefore, cardShieldPierceAmount(sourceCard));
  const shieldAfterPierce = Math.max(0, shieldBefore - shieldPierced);
  const blocked = Math.min(shieldAfterPierce, rawAmount);
  return {
    shieldPierced,
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

export function tributeCostForCard(card) {
  return Math.max(0, Number(card?.tributeCost) || 0);
}

function defaultTributeCardIdsForAction(state, playerId, card) {
  const cost = tributeCostForCard(card);
  if (cost <= 0) return [];
  const player = requirePlayer(state, playerId);
  if (player.monsterZone.length < cost) return [];
  return player.monsterZone.slice(0, cost);
}

function validateTributeSummonCost(state, playerId, card, action) {
  const cost = tributeCostForCard(card);
  const tributeCardIds = Array.isArray(action.tributeCardIds)
    ? action.tributeCardIds.filter(Boolean)
    : [];

  if (cost <= 0) {
    if (tributeCardIds.length > 0) {
      throw new GameRuleError(`Card ${card.id} does not require tribute cards`);
    }
    return [];
  }

  if (tributeCardIds.length !== cost) {
    throw new GameRuleError(`Card ${card.id} requires exactly ${cost} tribute card${cost === 1 ? "" : "s"}`);
  }

  if (new Set(tributeCardIds).size !== tributeCardIds.length) {
    throw new GameRuleError("Tribute cards must be unique");
  }

  tributeCardIds.forEach((tributeCardId) => {
    const tribute = requireCardInZone(state, playerId, "monsterZone", tributeCardId);
    if (tribute.type !== "monster") {
      throw new GameRuleError(`Tribute card ${tributeCardId} is not a monster`);
    }
  });

  return tributeCardIds;
}

function validateMonsterSummonDestination(state, playerId, index = null, leavingCardIds = []) {
  assertZoneIndexWithinLimit("monsterZone", index);
  const player = requirePlayer(state, playerId);
  const slots = fixedZoneSlots(player, "monsterZone");
  const leaving = new Set(leavingCardIds);
  if (Number.isInteger(index)) {
    const occupant = slots[index];
    if (occupant && !leaving.has(occupant)) {
      throw new GameRuleError(`${playerId}.monsterZone slot ${index} is occupied`);
    }
    return index;
  }
  const availableIndex = slots.findIndex((cardId) => !cardId || leaving.has(cardId));
  if (availableIndex < 0) {
    throw new GameRuleError("monsterZone is full");
  }
  return availableIndex;
}

function isFusionSummonSpell(card) {
  return card?.type === "spell" && card.effect === "fusionSummon" && Boolean(card.fusion);
}

function fusionDefinitionForCard(card) {
  const options = fusionOptionsForCard(card);
  if (options.length === 0) {
    throw new GameRuleError(`Fusion spell ${card?.id || "(unknown)"} requires at least one complete result recipe`);
  }
  return options[0];
}

function fusionDefinitionForAction(card, action = {}) {
  const options = fusionOptionsForCard(card);
  if (options.length === 0) return fusionDefinitionForCard(card);
  const requestedResult = action.fusionResultTemplateId || action.resultTemplateId || "";
  if (!requestedResult && options.length > 1) {
    throw new GameRuleError(`Fusion spell ${card?.id || "(unknown)"} requires an explicit fusion result selection`);
  }
  const fusion = requestedResult ? fusionOptionForResult(card, requestedResult) : options[0];
  if (!fusion) {
    throw new GameRuleError(`Fusion result ${requestedResult} is not available for spell ${card?.id || "(unknown)"}`);
  }
  return fusion;
}

function fusionMaterialCount(materials = []) {
  return normalizeMaterialRequirements(materials)
    .reduce((total, entry) => total + Math.max(1, Number(entry.count) || 1), 0);
}

function defaultFusionMaterialCardIdsForAction(state, playerId, fusion, sourceCardId = "") {
  const player = requirePlayer(state, playerId);
  const available = [
    ...player.monsterZone,
    ...player.hand.filter((cardId) => cardId !== sourceCardId)
  ];
  const selected = [];
  for (const requirement of fusion.materials) {
    for (let index = 0; index < requirement.count; index += 1) {
      const foundIndex = available.findIndex((cardId) => cardMatchesTemplate(requireCard(state, cardId), requirement.templateId));
      if (foundIndex < 0) return [];
      const [cardId] = available.splice(foundIndex, 1);
      selected.push(cardId);
    }
  }
  return selected;
}

function validateFusionMaterialCardIds(state, playerId, fusion, action) {
  const expectedCount = fusionMaterialCount(fusion.materials);
  const materialCardIds = Array.isArray(action.materialCardIds)
    ? action.materialCardIds.filter(Boolean)
    : defaultFusionMaterialCardIdsForAction(state, playerId, fusion, action.cardId);

  if (materialCardIds.length !== expectedCount) {
    throw new GameRuleError(`Fusion spell ${action.cardId} requires exactly ${expectedCount} material card${expectedCount === 1 ? "" : "s"}`);
  }
  if (new Set(materialCardIds).size !== materialCardIds.length) {
    throw new GameRuleError("Fusion materials must be unique");
  }

  const remaining = fusion.materials.map((entry) => ({ ...entry }));
  materialCardIds.forEach((materialCardId) => {
    if (materialCardId === action.cardId) {
      throw new GameRuleError("Fusion spell cannot be used as its own material");
    }
    const materialZone = fusionMaterialZone(state, playerId, materialCardId);
    const material = requireCardInZone(state, playerId, materialZone, materialCardId);
    if (material.type !== "monster") {
      throw new GameRuleError(`Fusion material ${materialCardId} is not a monster`);
    }
    const matched = remaining.find((entry) => entry.count > 0 && cardMatchesTemplate(material, entry.templateId));
    if (!matched) {
      throw new GameRuleError(`Fusion material ${materialCardId} does not match required materials`);
    }
    matched.count -= 1;
  });

  const missing = remaining.filter((entry) => entry.count > 0).map((entry) => entry.templateId);
  if (missing.length > 0) {
    throw new GameRuleError(`Fusion spell ${action.cardId} is missing materials ${missing.join(", ")}`);
  }
  return materialCardIds;
}

function fusionMaterialZone(state, playerId, cardId) {
  const player = requirePlayer(state, playerId);
  if (player.monsterZone.includes(cardId)) return "monsterZone";
  if (player.hand.includes(cardId)) return "hand";
  throw new GameRuleError(`Fusion material ${cardId} is not in ${playerId}.hand or ${playerId}.monsterZone`);
}

function fusionSummonIndexForAction(state, playerId, materialCardIds = [], index = null) {
  if (Number.isInteger(index)) return index;
  const player = requirePlayer(state, playerId);
  const slots = fixedZoneSlots(player, "monsterZone");
  const materialIndex = slots.findIndex((cardId) => materialCardIds.includes(cardId));
  if (materialIndex >= 0) return materialIndex;
  const emptyIndex = slots.findIndex((cardId) => !cardId);
  if (emptyIndex >= 0) return emptyIndex;
  return MONSTER_ZONE_SIZE - 1;
}

function validateFusionDestination(state, playerId, materialCardIds = [], index = null) {
  validateMonsterSummonDestination(state, playerId, index, materialCardIds);
  const player = requirePlayer(state, playerId);
  const remaining = player.monsterZone.filter((cardId) => !materialCardIds.includes(cardId));
  if (remaining.length >= MONSTER_ZONE_SIZE) {
    throw new GameRuleError("monsterZone is full");
  }
}

function fusionActivationCandidate(state, playerId, rivalId, card, fusion = fusionDefinitionForCard(card)) {
  const materialCardIds = defaultFusionMaterialCardIdsForAction(state, playerId, fusion, card.id);
  return {
    type: "ACTIVATE_CARD",
    playerId,
    rivalId,
    cardId: card.id,
    fusionResultTemplateId: fusion.resultTemplateId,
    ...(materialCardIds.length ? {
      materialCardIds,
      index: fusionSummonIndexForAction(state, playerId, materialCardIds)
    } : {})
  };
}

function oneShot(operations, meta = {}) {
  return {
    ...meta,
    duration: EffectDuration.oneShot,
    operations: operations.map((operation) => ({ ...operation }))
  };
}

function continuous(operations, meta = {}) {
  return {
    ...meta,
    duration: EffectDuration.continuous,
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
  state.gameOver = state.gameOver && typeof state.gameOver === "object" ? state.gameOver : null;
  state.continuousEffects = Array.isArray(state.continuousEffects) ? state.continuousEffects : [];
  state.machine = {
    phase: state.turn.phase,
    timing: timingForPhase(state.turn.phase),
    responseWindow: null,
    chain: [],
    actionWindow: null,
    autoEnd: null,
    pendingAttack: null,
    ...(state.machine || {}),
    phase: state.turn.phase
  };
  state.abilities = state.abilities && typeof state.abilities === "object" ? state.abilities : {};
  for (const card of Object.values(state.cards || {})) {
    if (isTokenCard(card)) {
      card.token = true;
      card.isToken = true;
    }
  }
  for (const playerId of Object.keys(state.players || {})) {
    state.abilities[playerId] = Array.isArray(state.abilities[playerId]) ? state.abilities[playerId] : [];
    state.players[playerId].attacksSkipped = Boolean(state.players[playerId].attacksSkipped);
    state.players[playerId].comboThisTurn = Boolean(state.players[playerId].comboThisTurn);
    state.players[playerId].comboFlags = state.players[playerId].comboFlags && typeof state.players[playerId].comboFlags === "object"
      ? state.players[playerId].comboFlags
      : {};
    if (state.players[playerId].comboPassive !== undefined) {
      state.players[playerId].comboPassive = state.players[playerId].comboPassive && typeof state.players[playerId].comboPassive === "object"
        ? state.players[playerId].comboPassive
        : null;
    }
    state.players[playerId].normalSummonsUsed = Math.max(0, Number(state.players[playerId].normalSummonsUsed) || 0);
    ensurePlayerZoneSlots(state.players[playerId]);
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

function emitGameOverIfNeeded(state, emit, {
  reason = "lp-zero",
  sourceCardId = null,
  triggerEventId = null
} = {}) {
  if (state.gameOver) return null;
  const players = Object.values(state.players || {});
  const loserIds = players.filter((player) => Number(player.lp) <= 0).map((player) => player.id);
  if (loserIds.length === 0) return null;
  const winners = players.filter((player) => Number(player.lp) > 0);
  const winnerId = winners.length === 1 ? winners[0].id : null;
  return emit("GAME_OVER_DECLARED", {
    playerId: winnerId || loserIds[0],
    winnerId,
    loserIds,
    reason,
    sourceCardId,
    triggerEventId
  });
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

function requireOrdinaryActionReady(state, actionType) {
  if (state.machine.responseWindow) {
    throw new GameRuleError(`Cannot ${actionType} while a response window is open`);
  }
  if ((state.machine.chain || []).length > 0) {
    throw new GameRuleError(`Cannot ${actionType} while a chain is unresolved`);
  }
  if (state.machine.pendingAttack) {
    throw new GameRuleError(`Cannot ${actionType} while an attack is pending`);
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

function isTokenCard(card) {
  return Boolean(card?.isToken === true || card?.token === true);
}

function ensurePlayerZoneSlots(player) {
  player.zoneSlots = player.zoneSlots && typeof player.zoneSlots === "object"
    ? player.zoneSlots
    : {};
  for (const zone of FIXED_ZONE_KEYS) {
    const limit = ZONE_LIMITS[zone];
    const existing = player.zoneSlots[zone];
    if (Array.isArray(existing)) {
      if (existing.length === limit) {
        for (let index = 0; index < existing.length; index += 1) {
          if (existing[index] === undefined) existing[index] = null;
        }
      } else {
        player.zoneSlots[zone] = Array.from({ length: limit }, (_, index) => existing[index] ?? null);
      }
      continue;
    }
    player.zoneSlots[zone] = Array.from({ length: limit }, (_, index) => player[zone]?.[index] ?? null);
  }
  return player.zoneSlots;
}

function fixedZoneSlots(player, zone) {
  if (!ZONE_LIMITS[zone]) return null;
  return ensurePlayerZoneSlots(player)[zone];
}

function resolveFixedDestinationIndex(state, playerId, zone, requestedIndex = null, movingCardId = null) {
  const player = requirePlayer(state, playerId);
  const slots = fixedZoneSlots(player, zone);
  if (!slots) return requestedIndex ?? null;
  assertZoneIndexWithinLimit(zone, requestedIndex);

  if (Number.isInteger(requestedIndex)) {
    const occupant = slots[requestedIndex];
    if (occupant && occupant !== movingCardId) {
      throw new GameRuleError(`${playerId}.${zone} slot ${requestedIndex} is occupied`);
    }
    return requestedIndex;
  }

  if (movingCardId) {
    const currentIndex = slots.indexOf(movingCardId);
    if (currentIndex >= 0) return currentIndex;
  }
  const emptyIndex = slots.findIndex((cardId) => !cardId);
  if (emptyIndex < 0) {
    throw new GameRuleError(`${zone} is full`);
  }
  return emptyIndex;
}

function removeFromFixedZoneSlots(player, zone, cardId) {
  const slots = ZONE_LIMITS[zone] ? fixedZoneSlots(player, zone) : null;
  if (!slots) return;
  for (let index = 0; index < slots.length; index += 1) {
    if (slots[index] === cardId) slots[index] = null;
  }
}

function placeInFixedZoneSlots(player, zone, cardId, index) {
  const slots = fixedZoneSlots(player, zone);
  if (!slots || !Number.isInteger(index)) {
    throw new GameRuleError(`${zone} requires a fixed destination index`);
  }
  if (slots[index] && slots[index] !== cardId) {
    throw new GameRuleError(`${player.id}.${zone} slot ${index} is occupied`);
  }
  removeFromFixedZoneSlots(player, zone, cardId);
  slots[index] = cardId;
}

function syncCompactFixedZone(player, zone) {
  const cards = requireZone(player, zone);
  const slots = fixedZoneSlots(player, zone);
  cards.splice(0, cards.length, ...slots.filter(Boolean));
}

function assertZoneIndexWithinLimit(zone, index) {
  const limit = ZONE_LIMITS[zone];
  if (!limit || index === undefined || index === null) return;
  if (!Number.isInteger(index)) {
    throw new GameRuleError(`${zone} index must be an integer`);
  }
  if (index < 0 || index >= limit) {
    throw new GameRuleError(`${zone} index is outside its limit`);
  }
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
    chain: [],
    actionWindow: null,
    autoEnd: null,
    pendingAttack: null
  };

  for (const event of events) {
    if (event.type === "TURN_STARTED") {
      machine.phase = Phase.draw;
      machine.timing = Timing.draw;
      machine.responseWindow = null;
      machine.chain = [];
      machine.actionWindow = null;
      machine.autoEnd = null;
      machine.pendingAttack = null;
    }
    if (event.type === "TURN_ENDED") {
      machine.phase = Phase.end;
      machine.timing = Timing.end;
      machine.responseWindow = null;
      machine.chain = [];
      machine.actionWindow = null;
      machine.autoEnd = null;
      machine.pendingAttack = null;
    }
    if (event.type === "PHASE_CHANGED") {
      machine.phase = event.to;
      machine.timing = timingForPhase(event.to);
      machine.responseWindow = null;
      machine.chain = [];
      machine.actionWindow = null;
      machine.autoEnd = null;
      machine.pendingAttack = null;
    }
    if (event.type === "TIMING_CHANGED" && TIMINGS.has(event.to)) {
      machine.timing = event.to;
    }
    if (event.type === "RESPONSE_WINDOW_OPENED") {
      const openedAt = Number(event.openedAt) || Number(event.id) || 0;
      machine.responseWindow = {
        playerId: event.playerId,
        type: event.windowType,
        timing: event.timing,
        resumeTiming: event.resumeTiming || event.timing,
        triggerEventId: event.triggerEventId || null,
        prompt: event.prompt || null,
        context: clone(event.context || {})
      };
      machine.actionWindow = {
        playerId: event.playerId,
        window: ActionWindow.response,
        windowId: event.windowId || `${ActionWindow.response}:${openedAt}`,
        reason: event.prompt || "response-window",
        openedAt,
        deadline: Number(event.deadline) || openedAt
      };
    }
    if (event.type === "RESPONSE_WINDOW_CLOSED") {
      machine.responseWindow = null;
      if (machine.actionWindow?.window === ActionWindow.response) {
        machine.actionWindow = null;
      }
    }
    if (event.type === "ATTACK_DECLARED") {
      machine.pendingAttack = {
        playerId: event.playerId,
        rivalId: event.rivalId,
        attackerCardId: event.attackerCardId,
        targetCardId: event.targetCardId || null,
        targetPlayerId: event.targetPlayerId || null,
        direct: Boolean(event.direct),
        declarationEventId: event.id,
        timing: event.timing || Timing.attackDeclaration
      };
    }
    if (event.type === "ATTACK_TARGET_CHANGED" && machine.pendingAttack) {
      if (!event.declarationEventId || String(event.declarationEventId) === String(machine.pendingAttack.declarationEventId)) {
        machine.pendingAttack.targetCardId = event.toTargetCardId || event.targetCardId || null;
        machine.pendingAttack.targetPlayerId = null;
        machine.pendingAttack.direct = false;
      }
    }
    if (event.type === "BATTLE_RESOLVED" || event.type === "ATTACK_CANCELED") {
      machine.pendingAttack = null;
    }
    if (event.type === "ACTION_WINDOW_OPENED") {
      machine.actionWindow = {
        playerId: event.playerId,
        window: event.window,
        windowId: event.windowId,
        reason: event.reason || "",
        openedAt: Number(event.openedAt),
        deadline: Number(event.deadline)
      };
    }
    if (event.type === "AUTO_END_REQUESTED") {
      machine.autoEnd = {
        playerId: event.playerId,
        reason: event.reason || "",
        requestedAt: Number(event.requestedAt),
        deadline: Number(event.deadline)
      };
    }
    if (event.type === "AUTO_END_CANCELED" || event.type === "AUTO_END_COMMITTED") {
      machine.autoEnd = null;
      if (machine.actionWindow?.window === ActionWindow.autoEnd) {
        machine.actionWindow = null;
      }
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
      chain: [],
      actionWindow: null,
      autoEnd: null,
      pendingAttack: null
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
