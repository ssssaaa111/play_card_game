import test from "node:test";
import assert from "node:assert/strict";
import { onlineDisplayCard, onlineCard, onlineCardActions, selectOnlineCard, onlineSelectionModel, onlineBoardState, onlineInteractionView, onlineIdentityView, onlineCardDetailView, onlineAttackIntent, onlineActionReceipt, latestOnlineActionReceipt } from "../src/online-duel-ui.js";
import { DuelRoom } from "../server/duel-room.js";
import { chooseOnlineCard, onlineBattlePreview } from "../src/online-duel-ui.js";

const monster = (id) => ({ id, templateId: "iron-guardian", name: id, type: "monster", atk: 900, def: 2100 });
function snapshot() {
  const player = () => ({ hand: [], monsterZone: Array(5).fill(null), spellTrapZone: Array(5).fill(null), grave: [], banished: [] });
  return { status: "playing", revision: 3, viewerSeatId: "p1", opponentSeatId: "p2", turn: { playerId: "p1", phase: "main" }, players: { p1: player(), p2: player() }, legalActions: { actions: {} } };
}

test("viewer identity keeps two tabs visually tied to their own reserved seats", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  assert.deepEqual(onlineIdentityView(view), {
    name: "星野", seatId: "p1", seatNumber: "1P", seatRole: "房主", opponentName: "月见"
  });
  view.viewerSeatId = "p2";
  view.opponentSeatId = "p1";
  assert.deepEqual(onlineIdentityView(view), {
    name: "月见", seatId: "p2", seatNumber: "2P", seatRole: "挑战者", opponentName: "星野"
  });
});

test("online card details expose effect copy and current public values", () => {
  assert.deepEqual(onlineCardDetailView({
    name: "星轨枪兵", type: "monster", text: "风属性前线怪兽。", atk: 1800, tempAtk: 200, def: 1000, element: "wind", stars: 4
  }), {
    name: "星轨枪兵", typeLabel: "怪兽", effectText: "风属性前线怪兽。",
    rows: [["攻击力", "2000"], ["守备力", "1000"], ["属性", "风"], ["星级", "4 星"]]
  });
  assert.deepEqual(onlineCardDetailView({ name: "星魂共鸣", type: "spell", text: "最高怪兽强化。", rarity: "R", archetype: "连携" }).rows,
    [["类型", "魔法"], ["稀有度", "R"], ["流派", "连携"]]);
});

test("public duel actions become concise viewer-relative receipts", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p2.grave = [{ id: "spell:1", name: "晨昏星界", type: "spell" }];
  view.recentEvents = [
    { id: 7, type: "PHASE_CHANGED", playerId: "p2" },
    { id: 8, type: "CARD_ACTIVATED", playerId: "p2", cardId: "spell:1" }
  ];
  assert.deepEqual(latestOnlineActionReceipt(view, 7), {
    id: 8, type: "CARD_ACTIVATED", actor: "opponent", text: "月见发动《晨昏星界》"
  });
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "天岚突袭者" };
  view.recentEvents.push({ id: 9, type: "ATTACK_DECLARED", playerId: "p1", attackerCardId: "attacker:1", direct: true });
  assert.deepEqual(latestOnlineActionReceipt(view, 8), {
    id: 9, type: "ATTACK_DECLARED", actor: "self", text: "星野以《天岚突袭者》发起直接攻击"
  });
  assert.equal(latestOnlineActionReceipt(view, 9), null);
});

test("a summon receipt wins over the activation event from the same action batch", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p2.monsterZone[0] = { ...monster("summoned:1"), name: "余烁小卫" };
  view.recentEvents = [
    { id: 10, type: "CARD_ACTIVATED", playerId: "p2", cardId: "summoned:1" },
    { id: 11, type: "MONSTER_SUMMONED", playerId: "p2", cardId: "summoned:1", summonType: "normal" }
  ];

  assert.deepEqual(latestOnlineActionReceipt(view, 9), {
    id: 11, type: "MONSTER_SUMMONED", actor: "opponent", text: "月见召唤《余烁小卫》"
  });
});

test("monster mode changes use the engine event name and public card name", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("guardian:1"), name: "守望铁卫" };

  assert.deepEqual(onlineActionReceipt(view, {
    id: 12, type: "MONSTER_MODE_CHANGED", playerId: "p1", cardId: "guardian:1", from: "attack", to: "defense"
  }), {
    id: 12, type: "MONSTER_MODE_CHANGED", actor: "self", text: "星野将《守望铁卫》切换为守备表示"
  });
});

test("action receipts do not expose names for cards absent from the public view", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];

  assert.deepEqual(onlineActionReceipt(view, {
    id: 13, type: "CARD_ACTIVATED", playerId: "p2", cardId: "hidden:trap:1"
  }), {
    id: 13, type: "CARD_ACTIVATED", actor: "opponent", text: "月见发动一张卡"
  });
});

test("a selected attack-position monster can carry its intent from main into battle", () => {
  const view = snapshot();
  view.players.p1.monsterZone[0] = monster("attacker:1");
  view.legalActions.can = { endTurn: true };
  const model = onlineSelectionModel(view, selectOnlineCard(view, "attacker:1"));
  assert.deepEqual(onlineAttackIntent(view, model), {
    available: true, requiresBattlePhase: true, attackCount: 0, label: "进入战斗并攻击"
  });
  view.turn.phase = "battle";
  view.legalActions.actions.declareAttack = [{ type: "DECLARE_ATTACK", attackerCardId: "attacker:1" }];
  const battleModel = onlineSelectionModel(view, selectOnlineCard(view, "attacker:1"));
  assert.deepEqual(onlineAttackIntent(view, battleModel), {
    available: true, requiresBattlePhase: false, attackCount: 1, label: "攻击"
  });
});

test("shared cards use template art while retaining instance identity without changing the snapshot", () => {
  const card = monster("p1:card-4");
  assert.deepEqual(onlineDisplayCard(card), { ...card, id: "iron-guardian", uid: "p1:card-4" });
  assert.equal(card.id, "p1:card-4");
  const hidden = { id: "hidden:0", hidden: true };
  assert.equal(onlineDisplayCard(hidden), hidden);
  const view = snapshot();
  view.players.p2.hand = [hidden];
  assert.equal(onlineCard(view, hidden.id), null);
  assert.deepEqual(onlineBoardState(view, null).ai.hand, [hidden]);
  assert.equal(onlineBoardState(view, null).selected, null, "empty slots must not become phantom selections");
});

test("card selection toggles cancel, switches targets and ignores unavailable cards without mutating snapshots", () => {
  const view = snapshot();
  view.players.p1.hand = [{ id: "buff", type: "spell" }];
  view.players.p1.monsterZone[0] = monster("one");
  view.players.p1.monsterZone[1] = monster("two");
  view.legalActions.actions.activateCard = ["one", "two"].map((targetCardId) => ({ type: "ACTIVATE_CARD", cardId: "buff", targetCardId }));
  const before = structuredClone(view);
  const selected = chooseOnlineCard(view, null, "buff");
  const target1 = chooseOnlineCard(view, selected, "one");
  const target2 = chooseOnlineCard(view, target1, "two");
  assert.equal(selected.targetCardId, null);
  assert.equal(target1.targetCardId, "one");
  assert.equal(target2.targetCardId, "two");
  assert.equal(chooseOnlineCard(view, target2, "not-playable"), target2);
  assert.equal(chooseOnlineCard(view, target2, "buff"), null);
  assert.deepEqual(view, before);
});

test("attack previews cover direct damage, counterattack, defense, ties and live modifiers using public cards", () => {
  const view = snapshot();
  view.turn.phase = "battle";
  const attacker = { ...monster("attacker"), atk: 1800, tempAtk: -150, battleWear: 150 };
  const target = { ...monster("target"), atk: 1200, def: 1900, mode: "attack" };
  view.players.p1.monsterZone[0] = attacker;
  view.players.p2.monsterZone[0] = target;
  view.players.p1.lp = 4000;
  view.players.p2.lp = 3000;
  view.legalActions.actions.declareAttack = [{ type: "DECLARE_ATTACK", attackerCardId: "attacker", targetCardId: "target" }];
  const preview = () => onlineBattlePreview(view, onlineSelectionModel(view, selectOnlineCard(view, "attacker", "DECLARE_ATTACK")));
  assert.equal(preview().compare.attackerValue, 1650, "battle wear is already included in tempAtk");
  assert.equal(preview().compare.diff, 450);
  target.mode = "defense";
  assert.equal(preview().badge, "守备反击");
  assert.deepEqual(preview().rows.find((row) => row.label === "我方 LP"), { label: "我方 LP", value: "4000 → 3750" });
  target.def = 1000;
  assert.equal(preview().badge, "破防");
  assert.deepEqual(preview().rows.find((row) => row.label === "对手 LP"), { label: "对手 LP", value: "3000 → 3000" });
  target.mode = "attack";
  target.atk = 1650;
  assert.equal(preview().badge, "相杀");
  target.atk = 2000;
  assert.equal(preview().badge, "受反击");
  view.legalActions.actions.declareAttack[0] = { type: "DECLARE_ATTACK", attackerCardId: "attacker" };
  view.players.p2.lp = 500;
  assert.equal(preview().mode, "direct");
  assert.deepEqual(preview().rows.find((row) => row.label === "对手 LP"), { label: "对手 LP", value: "500 → 0" });
  assert.equal(onlineBattlePreview(view, null), null);
});

test("selecting a card does not issue a command; confirmation retains its server instance ID and chosen slot", () => {
  const view = snapshot();
  view.players.p1.hand = [monster("p1:card-4")];
  view.players.p1.monsterZone[0] = monster("p1:card-1");
  view.legalActions.actions.summon = [{ type: "SUMMON_MONSTER", playerId: "p1", cardId: "p1:card-4", index: 1 }];
  const selection = selectOnlineCard(view, "p1:card-4");
  selection.index = 4;
  const before = structuredClone(view);
  const model = onlineSelectionModel(view, selection);
  assert.equal(model.stage, "placement");
  assert.deepEqual(model.slots, [1, 2, 3, 4]);
  assert.equal(model.action.cardId, "p1:card-4");
  assert.equal(model.action.index, 4);
  assert.deepEqual(view, before);
  selection.index = 0;
  assert.equal(onlineSelectionModel(view, selection).index, 1, "occupied slots cannot become summon destinations");
});

test("multi-target effects require a chosen legal target; a unique target is preselected", () => {
  const view = snapshot();
  view.players.p1.hand = [{ id: "spell:1", type: "spell", name: "强化" }];
  view.players.p1.monsterZone = [monster("own:1"), monster("own:2"), null, null, null];
  view.legalActions.actions.activateCard = ["own:1", "own:2"].map((targetCardId) => ({ type: "ACTIVATE_CARD", cardId: "spell:1", targetCardId }));
  const selection = selectOnlineCard(view, "spell:1");
  assert.equal(onlineSelectionModel(view, selection).action, null);
  selection.targetCardId = "enemy:illegal";
  assert.equal(onlineSelectionModel(view, selection).action, null);
  selection.targetCardId = "own:2";
  assert.equal(onlineSelectionModel(view, selection).action.targetCardId, "own:2");
  view.legalActions.actions.activateCard.pop();
  const unique = onlineSelectionModel(view, selection);
  assert.equal(unique.targetCardId, "own:1");
  assert.deepEqual(onlineInteractionView(unique, { inHand: true }).choice, {
    target: true,
    targetSingle: true,
    targetList: false,
    single: false,
    multiple: false,
    placement: false,
    material: false,
    selectionMode: "single",
    targetStep: "single"
  });
});

test("interaction projection keeps hand placement, multi-target picking and direct attacks distinct", () => {
  const placement = onlineInteractionView({ stage: "placement", targetIds: [], action: { type: "SUMMON_MONSTER" } }, { inHand: true });
  assert.equal(placement.focus, "placement");
  assert.equal(placement.selection, "hand");
  assert.equal(placement.targeting, "placement");
  assert.equal(placement.choice.placement, true);

  const targets = onlineInteractionView({ stage: "target", targetIds: ["one", "two"], action: null }, { inHand: true });
  assert.equal(targets.selection, "target");
  assert.equal(targets.choice.targetList, true);
  assert.equal(targets.choice.targetStep, "select");

  const attack = onlineInteractionView({ stage: "command", targetIds: [], action: { type: "DECLARE_ATTACK" } }, { isAttack: true });
  assert.equal(attack.focus, "attack");
  assert.equal(attack.selection, "playerField");
  assert.equal(attack.targeting, "attack");
});

test("tribute selection requires the full cost and allows the released slot as a destination", () => {
  const view = snapshot();
  view.players.p1.hand = [monster("boss:1")];
  view.players.p1.monsterZone = [monster("own:1"), monster("own:2"), monster("own:3"), null, null];
  view.legalActions.actions.summon = [{ type: "SUMMON_MONSTER", cardId: "boss:1", tributeCardIds: ["own:1", "own:2"] }];
  const selection = selectOnlineCard(view, "boss:1");
  assert.equal(onlineSelectionModel(view, selection).stage, "material");
  assert.equal(onlineSelectionModel(view, selection).action, null);
  selection.tributeCardIds = ["own:2", "wrong:1"];
  assert.equal(onlineSelectionModel(view, selection).action, null);
  selection.tributeCardIds = ["own:2", "own:3"];
  selection.index = 2;
  const model = onlineSelectionModel(view, selection);
  assert.equal(model.stage, "placement");
  assert.deepEqual(model.slots, [1, 2, 3, 4]);
  assert.deepEqual(model.action.tributeCardIds, ["own:2", "own:3"]);
  assert.equal(model.action.index, 2);
});

test("field selection separates mode change, attack intent and target confirmation", () => {
  const view = snapshot();
  view.turn.phase = "battle";
  view.players.p1.monsterZone[2] = monster("attacker:1");
  view.players.p2.monsterZone[0] = monster("enemy:1");
  view.legalActions.actions.declareAttack = [{ type: "DECLARE_ATTACK", attackerCardId: "attacker:1", targetCardId: "enemy:1" }];
  const inspect = selectOnlineCard(view, "attacker:1");
  assert.equal(onlineSelectionModel(view, inspect).action, null);
  assert.deepEqual(onlineBoardState(view, inspect).selected, { zone: "playerField", index: 2 });
  const attack = selectOnlineCard(view, "attacker:1", "DECLARE_ATTACK");
  assert.equal(onlineSelectionModel(view, attack).action.attackerCardId, "attacker:1");
  assert.equal(onlineSelectionModel(view, attack).action.targetCardId, "enemy:1");
  view.revision++;
  assert.equal(onlineSelectionModel(view, attack), null, "a new server revision cancels stale target choices");
  view.turn.playerId = "p2";
  assert.deepEqual(onlineCardActions(view, "attacker:1"), []);
});

test("a shared UI summon at a non-default slot is accepted and mirrored to the other player", () => {
  const room = new DuelRoom({ code: "ABC234" });
  room.join({ name: "星野", connectionId: "one" });
  room.join({ name: "月见", connectionId: "two" });
  room.setReady("one", true); room.setReady("two", true);
  const view = room.viewFor("p1");
  const legal = view.legalActions.actions.summon[0];
  assert.ok(legal);
  const selection = selectOnlineCard(view, legal.cardId);
  selection.index = 3;
  const action = onlineSelectionModel(view, selection).action;
  room.submit("one", { revision: view.revision, commandId: "ui-summon", action });
  assert.equal(room.viewFor("p1").players.p1.monsterZone[3]?.id, legal.cardId);
  assert.equal(room.viewFor("p2").players.p1.monsterZone[3]?.id, legal.cardId);
});
