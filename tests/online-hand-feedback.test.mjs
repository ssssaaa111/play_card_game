import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine, getLegalActions } from "../src/game-engine.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { buildDuelView, buildSpectatorView } from "../src/duel-view.js";
import { onlineHandActionView } from "../src/online-duel-ui.js";
import { library } from "../src/data.js";

const opening = ["solar-knight", "gale-mage", "iron-guardian", "twin-summon", "void-hound"];
function makeState(hand = opening) {
  const state = createOnlineDuelState({ openingHands: { p1: opening, p2: opening } });
  for (const [index, templateId] of hand.entries()) {
    const id = state.players.p1.hand[index];
    const definition = library.find((card) => card.id === templateId);
    assert.ok(definition, `Unknown fixture card ${templateId}`);
    state.cards[id] = { ...definition, id, templateId, ownerId: "p1" };
  }
  return state;
}
const handId = (state, template, seat = "p1") => state.players[seat].hand.find((id) => state.cards[id].templateId === template);
function place(state, id, zone, index, seat = "p1") {
  const player = state.players[seat];
  for (const source of ["hand", "deck"]) player[source] = player[source].filter((cardId) => cardId !== id);
  player[zone].push(id);
  player.zoneSlots[zone][index] = id;
}

test("legal summons use a free fixed slot when the compact count points at an occupied one", () => {
  const state = makeState();
  place(state, handId(state, "solar-knight"), "monsterZone", 1);
  place(state, handId(state, "gale-mage"), "monsterZone", 2);
  const before = structuredClone(state);
  const view = buildDuelView(state, "p1");
  const knight = handId(state, "iron-guardian");
  const action = view.legalActions.actions.summon.find((entry) => entry.cardId === knight);
  assert.equal(action.index, 0);
  assert.equal(onlineHandActionView(view, knight).ok, true);
  const engine = new GameEngine(state);
  engine.dispatch(action);
  assert.equal(engine.getState().players.p1.zoneSlots.monsterZone[0], knight);
  assert.deepEqual(state, before);
});

test("trap and equipment actions use vacant support slots instead of the compact count", () => {
  const state = makeState(["solar-knight", "mirror-snare", "weakening-web", "storm-shift", "blade-sigil"]);
  place(state, handId(state, "solar-knight"), "monsterZone", 4);
  place(state, handId(state, "mirror-snare"), "spellTrapZone", 1);
  place(state, handId(state, "weakening-web"), "spellTrapZone", 2);
  const legal = getLegalActions(state, "p1");
  const trap = legal.actions.setTrap.find((action) => action.cardId === handId(state, "storm-shift"));
  const equip = legal.actions.activateCard.find((action) => action.cardId === handId(state, "blade-sigil"));
  assert.equal(trap.index, 0);
  assert.equal(equip.index, 0);
  for (const action of [trap, equip]) {
    const engine = new GameEngine(state);
    engine.dispatch(action);
    assert.equal(engine.getState().players.p1.zoneSlots.spellTrapZone[0], action.cardId);
  }
});

test("summon exhaustion explains the actual rule and clears as soon as extra summon becomes legal", () => {
  const engine = new GameEngine(makeState());
  let state = engine.getState();
  engine.dispatch({ type: "SUMMON_MONSTER", playerId: "p1", cardId: handId(state, "solar-knight"), index: 4 });
  state = engine.getState();
  const mage = handId(state, "gale-mage");
  let view = buildDuelView(state, "p1");
  assert.equal(view.legalActions.unavailableHandActions[mage].code, "SUMMON_LIMIT");
  assert.equal(onlineHandActionView(view, mage).label, "次数用完");
  assert.match(onlineHandActionView(view, mage).reason, /额外召唤次数/);
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: "p1", cardId: handId(state, "twin-summon") });
  view = buildDuelView(engine.getState(), "p1");
  assert.equal(onlineHandActionView(view, mage).ok, true);
  assert.equal(view.legalActions.unavailableHandActions[mage], undefined);
});

test("target blockers distinguish own monsters, enemy supports and grave monsters, including battle phase", () => {
  const state = makeState(["war-chant", "trio-ember-recall", "dispelling-ray", "iron-guardian", "twin-summon"]);
  const view = buildDuelView(state, "p1");
  for (const [template, expected] of [["war-chant", /我方场上.*怪兽/], ["trio-ember-recall", /我方墓地.*怪兽/], ["dispelling-ray", /对手场上.*魔陷卡/]]) {
    const feedback = onlineHandActionView(view, handId(state, template));
    assert.equal(feedback.label, "无合法目标");
    assert.match(feedback.reason, expected);
  }
  state.turn.phase = "battle";
  state.machine.timing = "battleOpen";
  state.machine.actionWindow = null;
  const battle = onlineHandActionView(buildDuelView(state, "p1"), handId(state, "war-chant"));
  assert.equal(battle.label, "无合法目标");
  assert.doesNotMatch(battle.reason, /主要阶段/);
});

test("tribute and full support zone blockers provide actionable counts and capacity feedback", () => {
  const state = makeState(["starfall-colossus", "mirror-snare", "solar-knight", "blade-sigil", "weakening-web"]);
  const giant = handId(state, "starfall-colossus");
  assert.match(onlineHandActionView(buildDuelView(state, "p1"), giant).reason, /需要 2 只.*当前场上有 0 只/);
  for (let index = 0; index < 5; index++) {
    const trap = state.players.p1.deck.find((id) => state.cards[id].type === "trap");
    assert.ok(trap);
    place(state, trap, "spellTrapZone", index);
  }
  const view = buildDuelView(state, "p1");
  assert.equal(onlineHandActionView(view, handId(state, "mirror-snare")).label, "魔陷区已满");
});

test("a rejected weaker target does not mark a spell unavailable when a stronger legal target exists", () => {
  const state = makeState(["gale-mage", "solar-knight", "war-chant", "iron-guardian", "twin-summon"]);
  const spell = handId(state, "war-chant");
  place(state, handId(state, "gale-mage"), "monsterZone", 1);
  const stronger = handId(state, "solar-knight");
  place(state, stronger, "monsterZone", 2);
  const view = buildDuelView(state, "p1");
  assert.equal(view.legalActions.unavailableHandActions[spell], undefined);
  assert.equal(onlineHandActionView(view, spell).ok, true);
  assert.deepEqual(view.legalActions.actions.activateCard.filter((action) => action.cardId === spell).map((action) => action.targetCardId), [stronger]);
});

test("blocker projections stay private, sanitized and do not alter rule state", () => {
  const state = makeState(["war-chant", "solar-knight", "gale-mage", "twin-summon", "iron-guardian"]);
  const id = handId(state, "war-chant");
  state.cards[id].effect = "private-unknown-effect";
  const before = structuredClone(state);
  const own = buildDuelView(state, "p1");
  assert.equal(own.legalActions.unavailableHandActions[id].code, "UNSUPPORTED_EFFECT");
  assert.doesNotMatch(JSON.stringify(own.legalActions.unavailableHandActions[id]), /private-unknown-effect/);
  const other = buildDuelView(state, "p2");
  assert.equal(other.legalActions.unavailableHandActions[id], undefined);
  assert.equal(buildSpectatorView(state).legalActions, undefined);
  assert.deepEqual(state, before);
});
