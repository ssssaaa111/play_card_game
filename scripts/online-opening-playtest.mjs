import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DuelRoom } from "../server/duel-room.js";
import { isGraveReturn } from "../src/online-grave-return.js";
import { battleValue, totalAtk, totalDef } from "../src/rules.js";
import decks from "./fixtures/online-opening-decks.json" with { type: "json" };

const openingTurns = 4;
const connections = { p1: "first", p2: "second" };
const drawEffects = new Set(["draw2", "comebackDraw"]);
const damageEffects = new Set(["burn500", "fireWindCombo", "pierceLine"]);

function mixedRecoveryDecks() {
  const ids = [...decks.burn.ids];
  ids[ids.lastIndexOf("grave-return")] = "material-reclaim";
  ids[ids.lastIndexOf("renewal")] = "material-reclaim";
  return { ...decks, burn: { kind: "custom", name: "炎岚混合回收", ids } };
}

function startRoom(first, second, seed, graveReturnTurnLimit, deckLists) {
  const room = new DuelRoom({ code: "QA2345", graveReturnTurnLimit });
  for (const [seatId, name] of [["p1", first], ["p2", second]]) {
    room.join({ name, connectionId: connections[seatId] });
    room.setDeck(connections[seatId], deckLists[name]);
  }
  room.setReady(connections.p1);
  let randomState = createHash("sha256").update(seed).digest().readUInt32LE();
  const previousRandom = Math.random;
  try {
    // Starting the room creates both decks and shuffles synchronously.
    Math.random = () => {
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      return randomState / 2 ** 32;
    };
    room.setReady(connections.p2);
  } finally {
    Math.random = previousRandom;
  }
  return room;
}

function responseAction(view) {
  if (view.attackResponse) {
    const { candidates, declarationEventId } = view.attackResponse;
    return { type: "RESPOND_TRAP", cardId: candidates[0].cardId, declarationEventId };
  }
  if (view.summonResponse) {
    const { candidates, triggerEventId } = view.summonResponse;
    return { type: "RESPOND_SUMMON_TRAP", cardId: candidates[0].cardId, triggerEventId };
  }
  const { candidates, triggerEventId } = view.chainResponse;
  return { type: "RESPOND_CHAIN_TRAP", cardId: candidates[0].cardId, triggerEventId };
}

function playAction(view, canDrawTwo) {
  if (view.machine.responseWindow) return responseAction(view);
  const { hand, monsterZone, grave } = view.players[view.viewerSeatId];
  const opposingField = view.players[view.opponentSeatId].monsterZone;
  const actions = view.legalActions.actions;
  if (view.turn.phase === "battle") {
    const advantage = ({ attackerCardId, targetCardId }) => {
      const atk = totalAtk(monsterZone.find(card => card?.id === attackerCardId));
      const target = opposingField.find(card => card?.id === targetCardId);
      return target ? atk - battleValue(target) : atk;
    };
    const attacks = actions.declareAttack.filter(action => advantage(action) > 0);
    return attacks.sort((left, right) => advantage(right) - advantage(left))[0] || actions.endTurn[0];
  }

  const handCard = action => hand.find(card => card.id === action.cardId);
  const effect = action => handCard(action).effect;
  const recover = (effects) => actions.activateCard.find(action => (
    effect(action) === "graveReturn" && effects.has(grave.find(card => card.id === action.targetCardId)?.effect)
  ));
  const draw = canDrawTwo && (actions.activateCard.find(action => drawEffects.has(effect(action))) || recover(drawEffects));
  if (draw) return draw;

  const summonScore = card => (["gale-mage", "ember-drake"].includes(card.templateId) ? 3000 : 0)
    + Math.max(totalAtk(card), totalDef(card));
  const summons = [...actions.summon].sort((left, right) => summonScore(handCard(right)) - summonScore(handCard(left)));
  if (summons.length) return summons[0];

  if (monsterZone.includes(null) && hand.some(card => card.type === "monster" && card.stars <= 4)) {
    const extraSummon = actions.activateCard.find(action => effect(action) === "extraSummon");
    if (extraSummon) return extraSummon;
  }

  const damage = actions.activateCard.find(action => damageEffects.has(effect(action))) || recover(damageEffects);
  if (damage) return damage;
  const spell = actions.activateCard.find(action => !["extraSummon", "graveReturn", "attackReset"].includes(effect(action))
    && !drawEffects.has(effect(action))
    && (effect(action) !== "directStrike" || (!view.turn.openingBattleLocked && opposingField.some(Boolean))));
  if (spell) return spell;

  const defend = actions.changeMode.find(action => (
    action.mode === "defense" && monsterZone.some(card => card?.id === action.cardId && totalDef(card) > totalAtk(card))
  ));
  if (defend) return defend;
  if (actions.setTrap.length) return actions.setTrap[0];
  if (!view.turn.openingBattleLocked && monsterZone.some(card => card?.mode === "attack" && !card.attackLockReason)) {
    return { type: "CHANGE_PHASE", phase: "battle" };
  }
  return actions.endTurn[0];
}

function playOpening(first, second, seed, {
  graveReturnTurnLimit = true, deckLists = decks, trackPressure = false, drawTwoOnce = false
} = {}) {
  const room = startRoom(first, second, seed, graveReturnTurnLimit, deckLists);
  const turnLimit = trackPressure ? 2 : openingTurns;
  const pressure = trackPressure ? {
    turns: Array.from({ length: turnLimit }, () => ({ drawTwo: 0, damage: { p1: 0, p2: 0 } })),
    followerResponse: false, followerOptions: null, followerAttacked: false, followerFinished: null
  } : null;
  let turn = 1, eventCount = 0, firstDamageTurn = null, followerDamageBeforeTurn = 0, actionsThisTurn = 0;
  let state = room.engine.getState();
  const passed = [];
  const recoveries = [];
  for (let step = 1; turn <= turnLimit && !state.gameOver; step += 1) {
    assert.ok(step <= 100, `Command limit reached (${seed})`);
    const seatId = state.machine.responseWindow?.playerId || state.turn.playerId;
    const view = room.viewFor(seatId);
    if (pressure && seatId === "p2") {
      if (turn === 1 && view.machine.responseWindow) pressure.followerResponse = true;
      if (turn === 2 && !pressure.followerOptions && view.turn.phase === "main" && !view.machine.responseWindow) {
        const { can, hasAny } = view.legalActions;
        pressure.followerOptions = { canAct: hasAny, summon: can.summon, setTrap: can.setTrap };
      }
    }
    const action = playAction(view, !drawTwoOnce || pressure.turns[turn - 1].drawTwo === 0);
    assert.ok(action, `No legal action (${seed}, turn ${turn}, ${seatId})`);
    if (seatId === state.turn.playerId && !["CHANGE_PHASE", "END_TURN"].includes(action.type)) actionsThisTurn += 1;
    room.submit(connections[seatId], { revision: view.revision, commandId: `playtest-${step}`, action });
    state = room.engine.getState();
    for (const event of state.events.slice(eventCount)) {
      if (event.type === "TURN_ENDED") {
        if (pressure && turn === 2) {
          const follower = state.players.p2;
          pressure.followerFinished = {
            monster: follower.monsterZone.some(Boolean),
            trap: follower.spellTrapZone.some(id => state.cards[id]?.type === "trap")
          };
        }
        passed.push(actionsThisTurn === 0);
        actionsThisTurn = 0;
        turn += 1;
      }
      if (event.type === "DAMAGE_DEALT" && event.amount > 0 && turn <= turnLimit) {
        firstDamageTurn ??= turn;
        if (turn === 1 && event.playerId === "p2") followerDamageBeforeTurn += event.amount;
        if (pressure) pressure.turns[turn - 1].damage[event.playerId] += event.amount;
      }
      if (turn <= turnLimit && event.type === "CARD_ACTIVATED") {
        const card = state.cards[event.cardId];
        if (isGraveReturn(card)) recoveries.push({ turn, targetEffect: state.cards[event.targetCardId]?.effect });
        if (pressure && drawEffects.has(card?.effect)) pressure.turns[turn - 1].drawTwo += 1;
      }
      if (pressure && turn === 2 && event.type === "ATTACK_DECLARED" && event.playerId === "p2") pressure.followerAttacked = true;
    }
    eventCount = state.events.length;
  }
  return { firstDamageTurn, followerDamageBeforeTurn, passed, firstTurnWin: turn === 1 && state.gameOver?.winnerId === "p1", recoveries, pressure };
}

function summarize(games) {
  const firstDamageByTurn = [1, 2, 3, 4, null].map(turn => games.filter(game => game.firstDamageTurn === turn).length);
  const passRate = index => ({
    passed: games.filter(game => game.passed[index] === true).length,
    completed: games.filter(game => game.passed.length > index).length
  });
  return {
    firstDamageByTurn,
    followerDamageBeforeTurn: {
      gamesWithDamage: games.filter(game => game.followerDamageBeforeTurn > 0).length,
      average: games.reduce((sum, game) => sum + game.followerDamageBeforeTurn, 0) / games.length,
      max: Math.max(...games.map(game => game.followerDamageBeforeTurn))
    },
    firstTurnWins: games.filter(game => game.firstTurnWin).length,
    openingPass: { first: passRate(0), second: passRate(1) }
  };
}

function summarizeRecoveries(games) {
  const cases = games.flatMap(game => game.recoveries);
  return {
    gamesWithRecovery: games.filter(game => game.recoveries.length > 0).length,
    byTurn: [1, 2, 3, 4].map(turn => cases.filter(entry => entry.turn === turn).length),
    drawSpell: cases.filter(entry => drawEffects.has(entry.targetEffect)).length,
    damageSpell: cases.filter(entry => damageEffects.has(entry.targetEffect)).length
  };
}

function damageSummary(amounts) {
  return {
    withDamage: amounts.filter(amount => amount > 0).length,
    atLeast1000: amounts.filter(amount => amount >= 1000).length,
    average: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
    max: Math.max(...amounts)
  };
}

function summarizePressure(games) {
  const count = predicate => games.filter(game => predicate(game.pressure)).length;
  return {
    turns: [0, 1].map(index => ({
      repeatedDrawTwo: count(pressure => pressure.turns[index].drawTwo >= 2),
      firstSeatDamageTaken: damageSummary(games.map(game => game.pressure.turns[index].damage.p1)),
      secondSeatDamageTaken: damageSummary(games.map(game => game.pressure.turns[index].damage.p2))
    })),
    firstTurnWins: games.filter(game => game.firstTurnWin).length,
    follower: {
      responseBeforeTurn: count(pressure => pressure.followerResponse),
      reachedTurn: count(pressure => pressure.followerOptions),
      canActAtStart: count(pressure => pressure.followerOptions?.canAct),
      canSummonAtStart: count(pressure => pressure.followerOptions?.summon),
      canSetTrapAtStart: count(pressure => pressure.followerOptions?.setTrap),
      attacked: count(pressure => pressure.followerAttacked),
      finishedTurn: count(pressure => pressure.followerFinished),
      finishedWithMonster: count(pressure => pressure.followerFinished?.monster),
      finishedWithTrap: count(pressure => pressure.followerFinished?.trap)
    }
  };
}

const gamesPerOrder = Number(process.argv.find(arg => arg.startsWith("--games="))?.slice(8) ?? "100");
const seed = process.argv.find(arg => arg.startsWith("--seed="))?.slice(7) ?? "opening-playtest-v1";
const runGraveReturnTrial = process.argv.includes("--grave-return-trial");
const runMixedRecovery = process.argv.includes("--mixed-recovery");
assert.ok(Number.isSafeInteger(gamesPerOrder) && gamesPerOrder > 0 && gamesPerOrder <= 1000, "Use --games=1 through --games=1000 per seat order");
assert.ok(!(runGraveReturnTrial && runMixedRecovery), "Choose one playtest comparison");
const deckLists = runMixedRecovery ? mixedRecoveryDecks() : decks;
const matchups = [];
for (const first of Object.keys(deckLists)) {
  for (const second of Object.keys(deckLists)) {
    if (first === second) continue;
    if (runMixedRecovery && first !== "burn" && second !== "burn") continue;
    const seeds = Array.from({ length: gamesPerOrder }, (_, index) => `${seed}:${first}:${second}:${index}`);
    const options = { deckLists, graveReturnTurnLimit: !runGraveReturnTrial, trackPressure: runMixedRecovery };
    const games = seeds.map(gameSeed => playOpening(first, second, gameSeed, options));
    if (runMixedRecovery) {
      const candidate = seeds.map(gameSeed => playOpening(first, second, gameSeed, { ...options, drawTwoOnce: true }));
      assert.ok(candidate.every(game => game.pressure.turns.every(turn => turn.drawTwo <= 1)));
      matchups.push({ first, second, current: summarizePressure(games), drawTwoOnce: summarizePressure(candidate) });
      continue;
    }
    const matchup = { first, second, ...summarize(games) };
    if (runGraveReturnTrial) {
      const candidate = seeds.map(gameSeed => playOpening(first, second, gameSeed));
      const damageChanges = games.map((game, index) => candidate[index].followerDamageBeforeTurn - game.followerDamageBeforeTurn);
      matchup.graveReturnTrial = {
        baselineRecoveries: summarizeRecoveries(games),
        recoveries: summarizeRecoveries(candidate),
        followerDamageChanges: {
          decreased: damageChanges.filter(change => change < 0).length,
          same: damageChanges.filter(change => change === 0).length,
          increased: damageChanges.filter(change => change > 0).length
        },
        ...summarize(candidate)
      };
    }
    matchups.push(matchup);
  }
}
console.log(JSON.stringify({
  seed, gamesPerOrder, openingTurns: runMixedRecovery ? 2 : openingTurns,
  decks: deckLists,
  ...(!runMixedRecovery ? { firstDamageBuckets: [1, 2, 3, 4, "none"] } : {}),
  matchups
}, null, 2));
