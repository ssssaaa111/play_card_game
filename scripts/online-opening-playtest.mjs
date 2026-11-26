import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { cardActivatedThisTurn } from "../src/game-engine.js";
import { isGraveReturn } from "../src/online-grave-return.js";
import { battleValue, totalAtk, totalDef } from "../src/rules.js";
import decks from "./fixtures/online-opening-decks.json" with { type: "json" };
import { createSeededOpening, mixedRecoveryDecks } from "./fixtures/online-opening-pressure.mjs";

const openingTurns = 4;
const connections = { p1: "first", p2: "second" };
const drawEffects = new Set(["draw2", "comebackDraw"]);
const damageEffects = new Set(["burn400", "burn400OncePerTurn", "burn500", "fireWindCombo", "pierceLine"]);

function startRoom(first, second, seed, graveReturnTurnLimit, deckLists, adjustments) {
  const room = new DuelRoom({
    code: "QA2345", graveReturnTurnLimit, createState: config => createSeededOpening(config, seed, adjustments)
  });
  for (const [seatId, name] of [["p1", first], ["p2", second]]) {
    room.join({ name, connectionId: connections[seatId] });
    room.setDeck(connections[seatId], deckLists[name]);
  }
  room.setReady(connections.p1);
  room.setReady(connections.p2);
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

function playAction(view, canDrawTwo, state) {
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
  const isDrawSpell = card => drawEffects.has(card?.effect) || card?.templateId === "last-spark";
  const recover = (matches) => actions.activateCard.find(action => (
    effect(action) === "graveReturn" && matches(grave.find(card => card.id === action.targetCardId))
  ));
  const draw = canDrawTwo && (actions.activateCard.find(action => isDrawSpell(handCard(action))) || recover(isDrawSpell));
  if (draw) return draw;

  const summonScore = card => (["gale-mage", "ember-drake"].includes(card.templateId) ? 3000 : 0)
    + Math.max(totalAtk(card), totalDef(card));
  const summons = [...actions.summon].sort((left, right) => summonScore(handCard(right)) - summonScore(handCard(left)));
  if (summons.length) return summons[0];

  if (monsterZone.includes(null) && hand.some(card => card.type === "monster" && card.stars <= 4)) {
    const extraSummon = actions.activateCard.find(action => effect(action) === "extraSummon");
    if (extraSummon) return extraSummon;
  }

  const delayedRune = card => card?.effect === "burn400OncePerTurn" && cardActivatedThisTurn(state, card.id);
  const damage = actions.activateCard.find(action => damageEffects.has(effect(action)))
    || recover(card => damageEffects.has(card?.effect) && !delayedRune(card));
  if (damage) return damage;
  const spell = actions.activateCard.find(action => !["extraSummon", "graveReturn", "attackReset"].includes(effect(action))
    && !isDrawSpell(handCard(action))
    && (effect(action) !== "directStrike" || (!view.turn.openingBattleLocked && opposingField.some(Boolean))));
  if (spell) return spell;
  const prepareRune = recover(delayedRune);
  if (prepareRune) return prepareRune;

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

function followerBoard(state) {
  const follower = state.players.p2;
  return {
    monster: follower.monsterZone.some(Boolean),
    trap: follower.spellTrapZone.some(id => state.cards[id]?.type === "trap")
  };
}

function playOpening(first, second, seed, {
  graveReturnTurnLimit = true, deckLists = decks, trackPressure = false, drawTwoOnce = false, trace = false,
  lastSparkDrawOne = false, burstRune400 = false, burstRuneOncePerTurn = false, fourTurns = false
} = {}) {
  const room = startRoom(first, second, seed, graveReturnTurnLimit, deckLists, { lastSparkDrawOne, burstRune400, burstRuneOncePerTurn });
  const turnLimit = trackPressure && !fourTurns ? 2 : openingTurns;
  const pressure = trackPressure ? {
    turns: Array.from({ length: turnLimit }, () => ({ drawTwo: 0, damage: { p1: 0, p2: 0 } })),
    followerResponse: false, followerOptions: null, followerAttacked: false, followerFinished: null
  } : null;
  const followUp = fourTurns ? { thirdTurnRecoveredRuneDamage: 0, fourthTurnStart: null, fourthTurnAttacked: false, fourthTurnEnd: null } : null;
  const openingRunesCast = new Set();
  const openingRunesRecovered = new Set();
  let turn = 1, eventCount = 0, firstDamageTurn = null, followerDamageBeforeTurn = 0, actionsThisTurn = 0;
  let state = room.engine.getState();
  const cardName = id => state.cards[id]?.templateId || id;
  const replay = trace ? {
    seed,
    hands: Object.fromEntries(Object.entries(state.players).map(([seat, player]) => [seat, player.hand.map(cardName)])),
    decks: Object.fromEntries(Object.entries(state.players).map(([seat, player]) => [seat, player.deck.map(cardName)])),
    steps: []
  } : null;
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
    if (followUp && turn === 4 && seatId === "p2" && !followUp.fourthTurnStart && view.turn.phase === "main" && !view.machine.responseWindow) {
      followUp.fourthTurnStart = { ...followerBoard(state), canAct: view.legalActions.hasAny };
    }
    const action = playAction(view, !drawTwoOnce || pressure.turns[turn - 1].drawTwo === 0, state);
    assert.ok(action, `No legal action (${seed}, turn ${turn}, ${seatId})`);
    if (seatId === state.turn.playerId && !["CHANGE_PHASE", "END_TURN"].includes(action.type)) actionsThisTurn += 1;
    room.submit(connections[seatId], { revision: view.revision, commandId: `playtest-${step}`, action });
    state = room.engine.getState();
    const events = state.events.slice(eventCount);
    if (replay) {
      replay.steps.push({
        turn, seatId, action: action.type,
        card: cardName(action.cardId || action.attackerCardId), target: cardName(action.targetCardId),
        draws: events.filter(event => event.type === "CARDS_DRAWN")
          .map(event => ({ seat: event.playerId, cards: event.cardIds.map(cardName) })),
        damage: events.filter(event => event.type === "DAMAGE_DEALT" && event.amount > 0)
          .map(event => ({ seat: event.playerId, amount: event.amount, requested: event.requested, source: cardName(event.sourceCardId) })),
        lp: Object.fromEntries(Object.entries(state.players).map(([seat, player]) => [seat, player.lp]))
      });
    }
    for (const event of events) {
      if (event.type === "TURN_ENDED") {
        if (pressure && turn === 2) pressure.followerFinished = followerBoard(state);
        if (followUp && turn === 4) followUp.fourthTurnEnd = followerBoard(state);
        passed.push(actionsThisTurn === 0);
        actionsThisTurn = 0;
        turn += 1;
      }
      if (event.type === "DAMAGE_DEALT" && event.amount > 0 && turn <= turnLimit) {
        firstDamageTurn ??= turn;
        if (turn === 1 && event.playerId === "p2") followerDamageBeforeTurn += event.amount;
        if (pressure) pressure.turns[turn - 1].damage[event.playerId] += event.amount;
        if (followUp && turn === 3 && event.playerId === "p2" && openingRunesRecovered.has(event.sourceCardId)) {
          followUp.thirdTurnRecoveredRuneDamage += event.amount;
        }
      }
      if (turn <= turnLimit && event.type === "CARD_ACTIVATED") {
        const card = state.cards[event.cardId];
        if (isGraveReturn(card)) recoveries.push({ turn, targetEffect: state.cards[event.targetCardId]?.effect });
        if (pressure && drawEffects.has(card?.effect)) pressure.turns[turn - 1].drawTwo += 1;
        if (followUp && turn === 1) {
          if (card?.templateId === "burst-rune") openingRunesCast.add(event.cardId);
          if (isGraveReturn(card) && openingRunesCast.has(event.targetCardId)) openingRunesRecovered.add(event.targetCardId);
        }
      }
      if (pressure && turn === 2 && event.type === "ATTACK_DECLARED" && event.playerId === "p2") pressure.followerAttacked = true;
      if (followUp && turn === 4 && event.type === "ATTACK_DECLARED" && event.playerId === "p2") followUp.fourthTurnAttacked = true;
    }
    eventCount = state.events.length;
  }
  if (replay) replay.winnerId = state.gameOver?.winnerId ?? null;
  return {
    firstDamageTurn, followerDamageBeforeTurn, passed,
    firstTurnWin: turn === 1 && state.gameOver?.winnerId === "p1",
    followerFirstTurnWin: turn === 2 && state.gameOver?.winnerId === "p2",
    recoveries, pressure, replay,
    ...(followUp ? { followUp: { ...followUp, winnerId: state.gameOver?.winnerId ?? null } } : {})
  };
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

function summarizePressure(games, includeFollowerWins = false) {
  const count = predicate => games.filter(game => predicate(game.pressure)).length;
  return {
    turns: games[0].pressure.turns.map((_, index) => ({
      repeatedDrawTwo: count(pressure => pressure.turns[index].drawTwo >= 2),
      firstSeatDamageTaken: damageSummary(games.map(game => game.pressure.turns[index].damage.p1)),
      secondSeatDamageTaken: damageSummary(games.map(game => game.pressure.turns[index].damage.p2))
    })),
    firstTurnWins: games.filter(game => game.firstTurnWin).length,
    ...(includeFollowerWins ? { followerFirstTurnWins: games.filter(game => game.followerFirstTurnWin).length } : {}),
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

function summarizeFollowUp(games) {
  const count = predicate => games.filter(game => predicate(game.followUp)).length;
  return {
    reusedRecoveredRuneOnTurnThree: count(followUp => followUp.thirdTurnRecoveredRuneDamage > 0),
    fourthTurnReached: count(followUp => followUp.fourthTurnStart),
    fourthTurnCanAct: count(followUp => followUp.fourthTurnStart?.canAct),
    fourthTurnStartedWithMonster: count(followUp => followUp.fourthTurnStart?.monster),
    fourthTurnAttacked: count(followUp => followUp.fourthTurnAttacked),
    fourthTurnFinished: count(followUp => followUp.fourthTurnEnd),
    fourthTurnFinishedWithMonster: count(followUp => followUp.fourthTurnEnd?.monster),
    firstSeatWinsThroughTurnFour: count(followUp => followUp.winnerId === "p1"),
    secondSeatWinsThroughTurnFour: count(followUp => followUp.winnerId === "p2")
  };
}

function compareReducedOpenings(games, candidates, seeds) {
  return games.flatMap((game, index) => {
    const candidate = candidates[index];
    if (game.followerDamageBeforeTurn <= candidate.followerDamageBeforeTurn) return [];
    return [{
      seed: seeds[index],
      firstTurnDamage: [game.followerDamageBeforeTurn, candidate.followerDamageBeforeTurn],
      thirdTurnDamage: [game.pressure.turns[2].damage.p2, candidate.pressure.turns[2].damage.p2],
      candidateThirdTurnRecoveredRuneDamage: candidate.followUp.thirdTurnRecoveredRuneDamage
    }];
  });
}

const gamesPerOrder = Number(process.argv.find(arg => arg.startsWith("--games="))?.slice(8) ?? "100");
const seed = process.argv.find(arg => arg.startsWith("--seed="))?.slice(7) ?? "opening-playtest-v1";
const runGraveReturnTrial = process.argv.includes("--grave-return-trial");
const runMixedRecovery = process.argv.includes("--mixed-recovery");
const cardTrials = [
  ["--burst-rune-400-trial", "burstRune400"],
  ["--last-spark-draw-one-trial", "lastSparkDrawOne"],
  ["--burst-rune-once-per-turn-trial", "burstRuneOncePerTurn"]
].filter(([flag]) => process.argv.includes(flag));
const cardTrial = cardTrials[0]?.[1];
const compareCardVariants = Boolean(cardTrial);
const use400InBothVariants = compareCardVariants && cardTrial !== "burstRune400";
const traceOpenings = process.argv.includes("--trace-openings");
const fourTurns = process.argv.includes("--four-turns");
const openingCase = process.argv.find(arg => arg.startsWith("--opening-case="))?.slice("--opening-case=".length);
assert.ok(Number.isSafeInteger(gamesPerOrder) && gamesPerOrder > 0 && gamesPerOrder <= 1000, "Use --games=1 through --games=1000 per seat order");
assert.ok(!(runGraveReturnTrial && runMixedRecovery), "Choose one playtest comparison");
assert.ok(!traceOpenings || runMixedRecovery, "Opening traces require --mixed-recovery");
assert.ok(cardTrials.length <= 1, "Choose one card comparison");
assert.ok(!compareCardVariants || runMixedRecovery, "Card comparisons require --mixed-recovery");
assert.ok(cardTrial !== "burstRune400" || !openingCase, "The 500 vs 400 comparison requires a batch");
assert.ok(!fourTurns || cardTrial === "burstRuneOncePerTurn", "--four-turns requires --burst-rune-once-per-turn-trial");
const deckLists = runMixedRecovery ? mixedRecoveryDecks() : decks;
function replayOpeningCase() {
  assert.ok(runMixedRecovery, "A fixed opening case requires --mixed-recovery");
  const [first, second] = openingCase.split(":");
  assert.match(openingCase, /^(basic:burn|rush:burn|burn:basic|burn:rush):\d+$/);
  const play = (variant = {}) => playOpening(first, second, `${seed}:${openingCase}`, {
    deckLists, trackPressure: true, trace: true, fourTurns, ...variant
  });
  if (use400InBothVariants) {
    return {
      openingCase,
      current: play({ burstRune400: true }),
      [cardTrial]: play({ burstRune400: true, [cardTrial]: true })
    };
  }
  return {
    openingCase,
    current: play(),
    drawTwoOnce: play({ drawTwoOnce: true }),
    lastSparkDrawOne: play({ lastSparkDrawOne: true }),
    burstRune400: play({ burstRune400: true })
  };
}
if (openingCase) console.log(JSON.stringify(replayOpeningCase(), null, 2));
else printBatchReport();

function printBatchReport() {
  const matchups = [];
  for (const first of Object.keys(deckLists)) {
    for (const second of Object.keys(deckLists)) {
      if (first === second) continue;
      if (runMixedRecovery && first !== "burn" && second !== "burn") continue;
      const seeds = Array.from({ length: gamesPerOrder }, (_, index) => `${seed}:${first}:${second}:${index}`);
      const options = {
        deckLists, graveReturnTurnLimit: !runGraveReturnTrial, trackPressure: runMixedRecovery, trace: traceOpenings, fourTurns,
        burstRune400: use400InBothVariants,
        burstRuneOncePerTurn: !runMixedRecovery && !runGraveReturnTrial
      };
      const games = seeds.map(gameSeed => playOpening(first, second, gameSeed, options));
      if (runMixedRecovery) {
        const candidateKey = cardTrial ?? "drawTwoOnce";
        const candidate = seeds.map(gameSeed => playOpening(first, second, gameSeed, { ...options, [candidateKey]: true }));
        if (!compareCardVariants) assert.ok(candidate.every(game => game.pressure.turns.every(turn => turn.drawTwo <= 1)));
        const matchup = {
          first, second, current: summarizePressure(games, compareCardVariants),
          [candidateKey]: summarizePressure(candidate, compareCardVariants)
        };
        if (fourTurns) matchup.followUp = {
          current: summarizeFollowUp(games),
          [candidateKey]: summarizeFollowUp(candidate),
          reducedOpenings: compareReducedOpenings(games, candidate, seeds)
        };
        if (compareCardVariants) {
          const gained = [], lost = [];
          for (const [index, game] of games.entries()) {
            if (game.followerFirstTurnWin === candidate[index].followerFirstTurnWin) continue;
            (candidate[index].followerFirstTurnWin ? gained : lost).push(seeds[index]);
          }
          matchup.followerFirstTurnWinChanges = { gained, lost };
        }
        if (use400InBothVariants) {
          const handoffDamageChanges = games.map((game, index) => candidate[index].followerDamageBeforeTurn - game.followerDamageBeforeTurn);
          matchup.followerDamageBeforeTurnChanges = {
            decreased: handoffDamageChanges.filter(change => change < 0).length,
            same: handoffDamageChanges.filter(change => change === 0).length,
            increased: handoffDamageChanges.filter(change => change > 0).length
          };
        }
        if (traceOpenings) {
          const damage = game => first === "burn" ? game.followerDamageBeforeTurn : game.pressure.turns[1].damage.p1;
          const selected = [games, candidate].map(samples =>
            samples.reduce((peak, game, index) => damage(game) > damage(samples[peak]) ? index : peak, 0));
          if (use400InBothVariants) {
            const differences = games.map((game, index) => Math.abs(damage(game) - damage(candidate[index])));
            selected.push(differences.indexOf(Math.max(...differences)));
          }
          matchup.traces = [...new Set(selected)].map(index => ({
            current: games[index].replay, [candidateKey]: candidate[index].replay
          }));
        }
        matchups.push(matchup);
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
    seed, gamesPerOrder, openingTurns: runMixedRecovery && !fourTurns ? 2 : openingTurns,
    decks: deckLists,
    ...(!runMixedRecovery ? { firstDamageBuckets: [1, 2, 3, 4, "none"] } : {}),
    matchups
  }, null, 2));
}
