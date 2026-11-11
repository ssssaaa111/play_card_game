import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { createDuelSessionConfig, ControllerKind, DuelMode } from "../src/duel-session.js";
import { chooseOnlineCard, selectOnlineCard, onlineSelectionModel, onlineEffectDecisionView, onlineGraveChoiceView } from "../src/online-duel-ui.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";

function fixture(active = "p1") {
  const card = (template, uid) => ({ ...cardById(template), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
  const self = createDuelist(active);
  const rivalId = active === "p1" ? "p2" : "p1";
  const rival = createDuelist(rivalId);
  self.hand = [card("blade-sigil", "equip"), card("dispelling-ray", "dispel"), card("trio-ember-recall", "revive")];
  self.field = [card("solar-knight", "first"), null, null, card("solar-knight", "fourth"), null];
  self.grave = [card("gale-mage", "grave-mage"), card("war-chant", "grave-spell"), card("iron-guardian", "grave-guard")];
  rival.traps = [card("mirror-snare", "secret-mirror"), null, null, card("weakening-web", "secret-web"), null];
  [self, rival].forEach((duelist, index) => { duelist.deck = [card("iron-guardian", `deck:${index}`)]; });
  const room = new DuelRoom({ code: "EFX234", createState: () => buildEngineStateFromUiState({
    ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds: ["p1", "p2"], localPlayerId: active, controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
    cardDefinitionsComplete: true, [active]: self, [rivalId]: rival, turn: active, phase: "main", timing: "mainOpen", gameEvents: []
  }) });
  room.join({ name: "星野", connectionId: "one" });
  room.join({ name: "月见", connectionId: "two" });
  room.setReady("one", true); room.setReady("two", true);
  const connection = active === "p1" ? "one" : "two";
  const model = (view, id, target = null) => onlineSelectionModel(view, target
    ? chooseOnlineCard(view, selectOnlineCard(view, id), target) : selectOnlineCard(view, id));
  return { room, active, rivalId, connection, model };
}

test("effect choices distinguish same-name monsters by position and equip only the chosen target", () => {
  const { room, model } = fixture();
  const view = room.viewFor("p1");
  const before = structuredClone(view);
  const selecting = model(view, "equip");
  assert.equal(selecting.action, null);
  const choice = onlineEffectDecisionView(view, selecting);
  assert.equal(choice.target, null);
  assert.deepEqual(choice.candidates.map(card => card.location), ["我方怪兽区 · 第 1 格", "我方怪兽区 · 第 4 格"]);
  assert.ok(choice.candidates.every(card => card.name === "日冕骑士" && card.detail.includes("ATK 1700")));
  const selected = model(view, "equip", "fourth");
  assert.equal(onlineEffectDecisionView(view, selected).title, "锋刃刻印 → 日冕骑士");
  assert.equal(onlineEffectDecisionView(view, selected).target.location, "我方怪兽区 · 第 4 格");
  assert.deepEqual(view, before);
  room.submit("one", { revision: view.revision, commandId: "equip-fourth", action: selected.action });
  const after = room.viewFor("p1");
  assert.equal(after.players.p1.monsterZone[0].tempAtk, 0);
  assert.equal(after.players.p1.monsterZone[3].tempAtk, 300);
  const only = structuredClone(view);
  only.legalActions.actions.activateCard = only.legalActions.actions.activateCard.filter(action => action.cardId !== "equip" || action.targetCardId === "fourth");
  assert.equal(onlineEffectDecisionView(only, model(only, "equip")).target.id, "fourth");
});

test("revival choices contain only legal grave monsters and retain their grave positions", () => {
  const { room, model } = fixture();
  const view = room.viewFor("p1");
  const choice = onlineEffectDecisionView(view, model(view, "revive"));
  assert.deepEqual(choice.candidates.map(card => card.id), ["grave-mage", "grave-guard"]);
  assert.deepEqual(choice.candidates.map(card => card.location), ["我方墓地 · 第 1 张", "我方墓地 · 第 3 张"]);
  room.submit("one", { revision: view.revision, commandId: "revive-guard", action: model(view, "revive", "grave-guard").action });
  assert.ok(room.viewFor("p1").players.p1.monsterZone.some(card => card?.id === "grave-guard"));
  assert.equal(onlineEffectDecisionView(view, null), null);
  view.viewerRole = "spectator";
  assert.equal(onlineEffectDecisionView(view, model(view, "equip")), null);
});

for (const active of ["p1", "p2"]) test(`${active} targets concealed cards through public slot aliases without revealing their identity`, () => {
  const { room, rivalId, connection, model } = fixture(active);
  const view = room.viewFor(active);
  const selecting = model(view, "dispel");
  const aliases = selecting.targetIds;
  assert.deepEqual(aliases, ["hidden:spell-trap:0", "hidden:spell-trap:3"]);
  assert.ok(aliases.every(id => view.players[rivalId].spellTrapZone.some(card => card?.id === id && card.hidden)));
  const choice = onlineEffectDecisionView(view, selecting);
  assert.ok(choice.candidates.every(card => card.name === "盖放卡" && card.detail === "身份未公开"));
  assert.deepEqual(choice.candidates.map(card => card.location), ["对手魔陷区 · 第 1 格", "对手魔陷区 · 第 4 格"]);
  assert.doesNotMatch(JSON.stringify(view.legalActions), /secret-mirror|secret-web|镜光反制|弱化力场/);
  const action = model(view, "dispel", aliases[1]).action;
  const envelope = { revision: view.revision, commandId: "dispel-fourth", action };
  room.submit(connection, envelope);
  const after = room.viewFor(active);
  assert.equal(after.players[rivalId].spellTrapZone[3], null);
  assert.equal(after.players[rivalId].spellTrapZone[0].hidden, true);
  assert.equal(after.players[rivalId].grave[0].name, "弱化力场");
  assert.equal(room.submit(connection, envelope).duplicate, true);
  assert.deepEqual(room.viewFor(active), after);
  assert.throws(() => room.submit(connection, { ...envelope, commandId: "stale-slot" }), { code: "STALE_REVISION" });
});

test("empty or invalid concealed slots cannot change the room", () => {
  const { room } = fixture();
  const before = room.viewFor("p1");
  for (const targetCardId of ["hidden:spell-trap:1", "hidden:spell-trap:5", "hidden:hand:0"]) {
    assert.throws(() => room.submit("one", { revision: before.revision, commandId: targetCardId, action: { type: "ACTIVATE_CARD", cardId: "dispel", targetCardId } }), { code: "ILLEGAL_COMMAND" });
    assert.deepEqual(room.viewFor("p1"), before);
  }
});

for (const seat of ["p1", "p2"]) test(`${seat} grave choice retains legal selection while explaining ineligible cards`, () => {
  const { room, model } = fixture(seat);
  const view = room.viewFor(seat), before = structuredClone(view);
  const choice = onlineGraveChoiceView(view, model(view, "revive"));
  assert.equal(choice.count, 2);
  assert.equal(choice.canConfirm, false);
  assert.match(choice.cards.find(entry => entry.card.id === "grave-spell").reason, /只能选择墓地怪兽/);
  const selected = onlineGraveChoiceView(view, model(view, "revive", "grave-guard"));
  assert.equal(selected.selectedId, "grave-guard");
  assert.equal(selected.canConfirm, true);
  assert.equal(selected.cards.filter(entry => entry.selected).length, 1);
  assert.deepEqual(view, before);
  assert.equal(onlineGraveChoiceView(view, model(view, "equip")), null);
  view.turn.playerId = seat === "p1" ? "p2" : "p1";
  assert.equal(onlineGraveChoiceView(view, model(view, "revive")), null);
});

test("unique grave choice is preselected while stale or spectator choices stay unavailable", () => {
  const { room, model } = fixture();
  const view = room.viewFor("p1");
  view.legalActions.actions.activateCard = view.legalActions.actions.activateCard.filter(action => action.cardId !== "revive" || action.targetCardId === "grave-mage");
  assert.equal(onlineGraveChoiceView(view, model(view, "revive")).count, 1);
  assert.equal(onlineGraveChoiceView(view, model(view, "revive")).canConfirm, true);
  const selection = selectOnlineCard(view, "revive");
  view.revision++;
  assert.equal(onlineGraveChoiceView(view, onlineSelectionModel(view, selection)), null);
  view.viewerRole = "spectator";
  assert.equal(onlineGraveChoiceView(view, model(view, "revive")), null);
});

test("server-only grave opening draws distinct cards without changing deck size", () => {
  const state = createOnlineDuelState({ openingHands: { p1: ["solar-knight", "trio-ember-recall", "trio-ember-recall", "blade-sigil", "dispelling-ray"] }, openingGraves: { p1: ["gale-mage", "iron-guardian", "war-chant"] } });
  const self = state.players.p1;
  assert.equal(self.hand.length, 5);
  assert.equal(self.grave.length, 3);
  assert.equal(self.deck.length, 32);
  const cards = [...self.hand, ...self.grave, ...self.deck];
  assert.equal(new Set(cards).size, 40);
});
