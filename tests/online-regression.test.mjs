import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { createDuelSessionConfig, ControllerKind, DuelMode } from "../src/duel-session.js";
import { chooseOnlineCard, selectOnlineCard, onlineSelectionModel, onlineBattlePreview, onlineAttackDecisionView, onlineTributeDecisionView } from "../src/online-duel-ui.js";

// Stable cards and IDs: this regression needs neither a server nor a browser.
function fixedState() {
  const card = (id, uid) => ({ ...cardById(id), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
  const p1 = createDuelist("p1");
  const p2 = createDuelist("p2");
  p1.hand = [card("solar-knight", "knight"), card("soul-resonance", "buff")];
  p2.hand = [card("iron-guardian", "guardian"), card("twin-summon", "extra"), card("gale-mage", "mage")];
  for (const [id, player] of [["p1", p1], ["p2", p2]]) {
    player.deck = Array.from({ length: 8 }, (_, index) => card("iron-guardian", `${id}:deck:${index}`));
  }
  return buildEngineStateFromUiState({
    ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds: ["p1", "p2"], localPlayerId: "p1", controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
    cardDefinitionsComplete: true, p1, p2, turn: "p1", phase: "main", timing: "mainOpen", gameEvents: []
  });
}

for (const active of ["p1", "p2"]) {
  test(`${active} tribute decisions identify the actual sacrifices and commit only the chosen pair`, () => {
    const card = (id, uid) => ({ ...cardById(id), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
    const self = createDuelist(active);
    const rivalId = active === "p1" ? "p2" : "p1";
    const rival = createDuelist(rivalId);
    self.hand = [card("starfall-colossus", "boss")];
    self.field = [card("solar-knight", "first"), null, card("solar-knight", "third"), null, card("iron-guardian", "fifth")];
    self.field[2].tempAtk = 300;
    [self, rival].forEach((player, index) => { player.deck = [card("iron-guardian", `deck:${index}`)]; });
    const room = new DuelRoom({ code: "TRB234", createState: () => buildEngineStateFromUiState({
      ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds: ["p1", "p2"], localPlayerId: active, controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
      cardDefinitionsComplete: true, [active]: self, [rivalId]: rival, turn: active, phase: "main", timing: "mainOpen", gameEvents: []
    }) });
    room.join({ name: "星野", connectionId: "one" });
    room.join({ name: "月见", connectionId: "two" });
    room.setReady("one", true); room.setReady("two", true);
    const view = room.viewFor(active);
    const before = structuredClone(view);
    let selection = selectOnlineCard(view, "boss");
    const project = () => onlineTributeDecisionView(view, onlineSelectionModel(view, selection));
    assert.equal(project().progress, "已选 0/2 只祭品");
    assert.deepEqual(project().candidates.map(card => card.location), ["我方怪兽区 · 第 1 格", "我方怪兽区 · 第 3 格", "我方怪兽区 · 第 5 格"]);
    assert.match(project().candidates[2].detail, /ATK 900 · DEF 2100/);
    selection = chooseOnlineCard(view, selection, "third");
    assert.equal(onlineSelectionModel(view, selection).action, null);
    assert.equal(project().progress, "已选 1/2 只祭品");
    assert.match(project().candidates[1].detail, /ATK 2000/);
    selection = chooseOnlineCard(view, selection, "third");
    assert.equal(project().progress, "已选 0/2 只祭品");
    selection = chooseOnlineCard(view, selection, "third");
    selection = chooseOnlineCard(view, selection, "fifth");
    selection.index = 2;
    const model = onlineSelectionModel(view, selection);
    assert.equal(project().progress, "已选 2/2 只祭品");
    assert.equal(project().summary, "日冕骑士、铁壁守卫");
    assert.match(project().hint, /召唤至第 3 格/);
    assert.deepEqual(project().candidates.filter(card => card.selected).map(card => card.id), ["third", "fifth"]);
    assert.deepEqual(room.viewFor(active), before, "selecting, deselecting and cancelling do not consume any card");
    assert.equal(onlineTributeDecisionView({ ...view, viewerRole: "spectator" }, model), null);
    assert.equal(onlineTributeDecisionView(view, onlineSelectionModel(view, { ...selection, revision: -1 })), null);
    const request = { revision: view.revision, commandId: "tribute-confirm", action: model.action };
    const connection = active === "p1" ? "one" : "two";
    room.submit(connection, request);
    const after = room.viewFor(active);
    assert.equal(after.players[active].monsterZone[2].id, "boss");
    assert.equal(after.players[active].monsterZone[0].id, "first");
    assert.deepEqual(new Set(after.players[active].grave.map(card => card.id)), new Set(["third", "fifth"]));
    assert.equal(after.players[active].hand.length, 0);
    room.submit(connection, request);
    assert.deepEqual(room.viewFor(active), after, "duplicate confirmation cannot sacrifice again");
  });
}

test("fixed online duel: cancel, place, buff, defend, choose targets, battle, duplicate and stale commands", () => {
  const room = new DuelRoom({ code: "ABC234", createState: fixedState });
  room.join({ name: "星野", connectionId: "one" });
  room.join({ name: "月见", connectionId: "two" });
  room.setReady("one", true); room.setReady("two", true);
  let sequence = 0;
  const submit = (seat, action) => room.submit(seat === "p1" ? "one" : "two", { revision: room.revision, commandId: `fixed:${sequence++}`, action });
  const choose = (seat, id, changes = {}) => {
    const view = room.viewFor(seat);
    const selection = { ...selectOnlineCard(view, id), ...changes };
    return onlineSelectionModel(view, selection).action;
  };
  const before = room.viewFor("p1");
  const selected = chooseOnlineCard(before, null, "knight");
  assert.equal(chooseOnlineCard(before, selected, "knight"), null);
  assert.deepEqual(room.viewFor("p1"), before, "cancel only affects local selection");
  submit("p1", choose("p1", "knight", { index: 3 }));
  assert.equal(room.viewFor("p2").players.p1.monsterZone[3].id, "knight");
  submit("p1", choose("p1", "buff"));
  assert.equal(room.viewFor("p2").players.p1.monsterZone[3].tempAtk, 200);
  submit("p1", { type: "END_TURN" });
  submit("p2", choose("p2", "guardian", { index: 4 }));
  submit("p2", room.viewFor("p2").legalActions.actions.changeMode.find((action) => action.cardId === "guardian"));
  submit("p2", choose("p2", "extra"));
  submit("p2", choose("p2", "mage", { index: 0 }));
  submit("p2", { type: "END_TURN" });
  submit("p1", { type: "CHANGE_PHASE", phase: "battle" });
  const battle = room.viewFor("p1");
  const attack = selectOnlineCard(battle, "knight", "DECLARE_ATTACK");
  assert.equal(onlineSelectionModel(battle, attack).action, null, "two targets require an explicit choice");
  assert.equal(onlineBattlePreview(battle, onlineSelectionModel(battle, attack)).mode, "intent");
  const picking = onlineAttackDecisionView(battle, onlineSelectionModel(battle, attack));
  assert.equal(picking.source.stat, "ATK 1900", "the route includes the active buff");
  assert.equal(picking.source.slot, "我方第 4 格");
  assert.equal(picking.target.name, "选择目标");
  assert.equal(picking.lp, "", "no predicted damage before choosing among multiple targets");
  assert.deepEqual(picking.candidates.find(card => card.id === "guardian"), { id: "guardian", name: "铁壁守卫", slot: "第 5 格", stat: "DEF 2100" });
  const guard = chooseOnlineCard(battle, attack, "guardian");
  const guardPreview = onlineBattlePreview(battle, onlineSelectionModel(battle, guard));
  assert.equal(guardPreview.badge, "守备反击");
  assert.deepEqual(guardPreview.rows.find((row) => row.label === "我方 LP"), { label: "我方 LP", value: "4000 → 3800" });
  const guardDecision = onlineAttackDecisionView(battle, onlineSelectionModel(battle, guard));
  assert.equal(guardDecision.tone, "danger");
  assert.equal(guardDecision.summary, "预计我方损失 200 LP");
  assert.equal(guardDecision.lp, "我方 LP 4000 → 3800");
  assert.equal(guardDecision.target.stat, "DEF 2100");
  assert.equal(guardDecision.result, "双方保留");
  const final = chooseOnlineCard(battle, guard, "mage");
  const model = onlineSelectionModel(battle, final);
  const preview = onlineBattlePreview(battle, model);
  assert.equal(preview.compare.diff, 700);
  const finalDecision = onlineAttackDecisionView(battle, model);
  assert.equal(finalDecision.target.name, "疾风术士");
  assert.equal(finalDecision.summary, "预计造成 700 伤害");
  assert.equal(finalDecision.lp, "对手 LP 4000 → 3300");
  assert.equal(finalDecision.result, "击破目标");
  const envelope = { revision: battle.revision, commandId: "fixed:attack", action: model.action };
  room.submit("one", envelope);
  const after = room.viewFor("p1");
  assert.equal(after.players.p1.lp, 4000);
  assert.equal(after.players.p2.lp, 3300);
  assert.equal(after.players.p2.monsterZone[0], null);
  assert.equal(after.players.p2.monsterZone[4].id, "guardian");
  assert.equal(after.players.p1.monsterZone[3].used, true);
  assert.equal(onlineSelectionModel(after, final), null);
  assert.deepEqual(room.viewFor("p2").players.p1.monsterZone, after.players.p1.monsterZone);
  assert.equal(room.submit("one", envelope).duplicate, true);
  assert.deepEqual(room.viewFor("p1"), after, "a duplicate must not deal damage twice");
  assert.throws(() => room.submit("one", { ...envelope, commandId: "fixed:stale" }), { code: "STALE_REVISION" });
  assert.ok(after.players.p2.hand.every((card) => card.hidden && !card.templateId));
});
