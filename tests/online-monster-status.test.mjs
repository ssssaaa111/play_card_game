import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/game-engine.js";
import { buildDuelView, buildSpectatorView } from "../src/duel-view.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { onlineAttackIntent, onlineMonsterStatus, onlineSelectionModel, selectOnlineCard, onlineCardDetailView } from "../src/online-duel-ui.js";
import { cardStateChips } from "../src/card-state-display.js";

function opening() {
  return createOnlineDuelState({ openingHands: {
    p1: ["solar-knight", "war-chant", "twin-summon", "gale-mage", "blade-sigil"],
    p2: ["iron-guardian", "mirror-snare", "weakening-web", "storm-shift", "war-chant"]
  } });
}
const idFor = (state, template, seat = "p1") => state.players[seat].hand.find((id) => state.cards[id].templateId === template);
function summon() {
  const state = opening();
  const id = idFor(state, "solar-knight");
  const engine = new GameEngine(state);
  engine.dispatch({ type: "SUMMON_MONSTER", playerId: "p1", cardId: id, index: 0 });
  return { engine, id };
}
const intent = (view, id) => onlineAttackIntent(view, onlineSelectionModel(view, selectOnlineCard(view, id)));
function nextTurn(engine) {
  const current = engine.getState().turn.playerId;
  const next = current === "p1" ? "p2" : "p1";
  engine.dispatch({ type: "END_TURN", playerId: current });
  engine.dispatch({ type: "START_TURN", playerId: next });
  engine.dispatch({ type: "RESOLVE_TURN_DRAW", playerId: next });
}

test("public attack locks prevent the main-phase shortcut and reset on the next own turn", () => {
  const { engine, id } = summon();
  const state = engine.getState();
  state.cards[id].attackLockReason = "trioConvergence";
  const locked = new GameEngine(state);
  for (const seat of ["p1", "p2"]) {
    const view = buildDuelView(state, seat);
    assert.equal(view.players.p1.monsterZone[0].attackLockReason, "trioConvergence");
    assert.equal(onlineMonsterStatus(view, id).key, "locked");
  }
  assert.equal(intent(buildDuelView(state, "p1"), id).available, false);
  assert.match(onlineMonsterStatus(buildDuelView(state, "p1"), id).detail, /三曜共降/);
  assert.equal(buildSpectatorView(state).players.p1.monsterZone[0].attackLockReason, "trioConvergence");
  nextTurn(locked);
  nextTurn(locked);
  const restored = buildDuelView(locked.getState(), "p1");
  assert.equal(onlineMonsterStatus(restored, id).key, "ready");
  assert.equal(intent(restored, id).available, true);
});

test("defense has an exact explanation and available mode change without claiming attack readiness", () => {
  const { engine, id } = summon();
  engine.dispatch({ type: "CHANGE_MONSTER_MODE", playerId: "p1", cardId: id, mode: "defense" });
  const view = buildDuelView(engine.getState(), "p1");
  const before = structuredClone(view);
  assert.equal(onlineMonsterStatus(view, id).label, "守备");
  assert.match(onlineMonsterStatus(view, id).detail, /守备表示不能攻击.*本回合已切换/);
  assert.equal(intent(view, id).available, false);
  assert.deepEqual(view, before);
});

test("spent attacks stay spent through the rival turn and become ready on the next own turn", () => {
  const { engine, id } = summon();
  engine.dispatch({ type: "CHANGE_PHASE", playerId: "p1", phase: "battle" });
  engine.dispatch({ type: "DECLARE_ATTACK", playerId: "p1", attackerCardId: id });
  engine.dispatch({ type: "CLOSE_RESPONSE_WINDOW", playerId: "p2", reason: "declined" });
  engine.dispatch({ type: "RESOLVE_BATTLE", playerId: "p1", attackerCardId: id });
  let view = buildDuelView(engine.getState(), "p1");
  assert.equal(onlineMonsterStatus(view, id).label, "已攻击");
  assert.equal(intent(view, id).available, false);
  nextTurn(engine);
  view = buildDuelView(engine.getState(), "p1");
  assert.match(onlineMonsterStatus(view, id).detail, /对手回合/);
  nextTurn(engine);
  assert.equal(onlineMonsterStatus(buildDuelView(engine.getState(), "p1"), id).key, "ready");
});

test("response, disconnect, turn ownership and skipped attacks all block the shortcut", () => {
  const { engine, id } = summon();
  const base = buildDuelView(engine.getState(), "p1");
  for (const [change, key] of [
    [view => { view.machine.responseWindow = { playerId: "p2", prompt: "attack" }; }, "resolving"],
    [view => { view.seats = [{ seatId: "p2", connected: false }]; }, "paused"],
    [view => { view.turn.playerId = "p2"; }, "waiting"],
    [view => { view.players.p1.attacksSkipped = true; }, "locked"]
  ]) {
    const view = structuredClone(base);
    change(view);
    assert.equal(intent(view, id).available, false);
    assert.equal(onlineMonsterStatus(view, id).key, key);
  }
  const rivalView = buildDuelView(engine.getState(), "p2");
  assert.equal(intent(rivalView, id).available, false, "A rival monster cannot be used as one's own attacker");
});

test("sourced stat effects survive recent-event truncation and identify their actual lifetime", () => {
  const { engine, id } = summon();
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: "p1", cardId: idFor(engine.getState(), "war-chant"), targetCardId: id });
  const state = engine.getState();
  for (let index = 0; index < 45; index++) state.events.push({ id: 9000 + index, type: "ACTION_WINDOW_OPENED", playerId: "p1" });
  const view = buildDuelView(state, "p1");
  const card = view.players.p1.monsterZone[0];
  assert.equal(view.recentEvents.some(event => event.type === "STAT_MODIFIED"), false);
  assert.match(card.effectMarkers[0].detail, /战意高扬.*攻击力 \+500.*离场重置/);
  assert.ok(onlineCardDetailView(card).rows.some(([label, text]) => label === "生效效果" && text.includes("战意高扬")));
  const chips = cardStateChips(card, { primaryState: onlineMonsterStatus(view, id), effectMarkers: card.effectMarkers });
  assert.equal(chips[0].label, "可攻击");
  assert.equal(chips.filter(chip => chip.label.includes("500")).length, 1, "Source and generic stat chips must not duplicate one modifier");
  nextTurn(engine);
  nextTurn(engine);
  assert.equal(buildDuelView(engine.getState(), "p1").players.p1.monsterZone[0].tempAtk, 500);
});

test("continuous equipment explains source departure while hidden sources never leak through markers", () => {
  const { engine, id } = summon();
  engine.dispatch({ type: "ACTIVATE_CARD", playerId: "p1", cardId: idFor(engine.getState(), "blade-sigil"), targetCardId: id });
  const state = engine.getState();
  const hidden = state.players.p2.hand[0];
  state.events.push({ id: 9900, type: "STAT_MODIFIED", cardId: id, sourceCardId: hidden, stat: "tempAtk", amount: 100 });
  for (const view of [buildDuelView(state, "p1"), buildDuelView(state, "p2"), buildSpectatorView(state)]) {
    const markers = view.players.p1.monsterZone[0].effectMarkers;
    assert.ok(markers.some(marker => marker.tone === "continuous" && /锋刃刻印.*来源离场后解除/.test(marker.detail)));
    assert.equal(JSON.stringify(markers).includes(hidden), false);
    assert.equal(JSON.stringify(markers).includes(state.cards[hidden].name), false);
  }
});
