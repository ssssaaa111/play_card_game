import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { createDuelSessionConfig, ControllerKind, DuelMode } from "../src/duel-session.js";
import { chooseOnlineCard, selectOnlineCard, onlineSelectionModel, onlineBattlePreview } from "../src/online-duel-ui.js";

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
  const guard = chooseOnlineCard(battle, attack, "guardian");
  const guardPreview = onlineBattlePreview(battle, onlineSelectionModel(battle, guard));
  assert.equal(guardPreview.badge, "守备反击");
  assert.deepEqual(guardPreview.rows.find((row) => row.label === "我方 LP"), { label: "我方 LP", value: "4000 → 3800" });
  const final = chooseOnlineCard(battle, guard, "mage");
  const model = onlineSelectionModel(battle, final);
  const preview = onlineBattlePreview(battle, model);
  assert.equal(preview.compare.diff, 700);
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
