import test from "node:test";
import assert from "node:assert/strict";
import { onlineDisplayCard, onlineCard, onlineCardActions, selectOnlineCard, onlineSelectionModel, onlineBoardState, onlineInteractionView, onlineIdentityView, onlineCardDetailView, onlineAttackIntent, onlineResponseBattleView, onlineGameResultView, onlineRematchView, onlineActionReceipt, latestOnlineActionReceipt, onlineEventSound, onlineActionCue, onlineEventTimeline, onlineConnectionView, onlineResponseTimerView } from "../src/online-duel-ui.js";
import { DuelRoom } from "../server/duel-room.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
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

test("online connection panels distinguish local recovery from an opponent pause", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野", connected: true }, { seatId: "p2", name: "月见", connected: false }];
  assert.deepEqual(onlineConnectionView(view), {
    kind: "opponent", kicker: "DUEL PAUSED", title: "等待月见重连",
    summary: "对手的席位和当前牌局都已保留；重连完成前，双方不能继续出牌。",
    status: "你可以查看场面、墓地和战斗记录", showActions: false
  });
  const self = onlineConnectionView(view, { transportState: "reconnecting", reconnectAttempt: 2 });
  assert.equal(self.kind, "self");
  assert.equal(self.title, "正在恢复连接");
  assert.equal(self.status, "第 2 次重连中…");
  view.seats[1].connected = true;
  assert.equal(onlineConnectionView(view), null);
});

test("online response timer explains automatic passing and frozen disconnect time", () => {
  const base = {
    viewerSeatId: "p2",
    machine: {
      responseWindow: { playerId: "p2" },
      pendingAttack: { declarationEventId: 42 }
    },
    responseTimer: { declarationEventId: 42, deadlineAt: 25_000, remainingMs: null, paused: false }
  };
  assert.deepEqual(onlineResponseTimerView(base, 18_400), {
    declarationEventId: 42,
    paused: false,
    seconds: 7,
    ownResponse: true,
    label: "剩余 7 秒 · 到时自动放弃响应"
  });
  const waiting = { ...base, viewerSeatId: "p1" };
  assert.equal(onlineResponseTimerView(waiting, 24_001).label, "等待对手响应 · 1 秒后自动结算");
  const paused = { ...base, responseTimer: { declarationEventId: 42, deadlineAt: null, remainingMs: 6_000, paused: true } };
  assert.deepEqual(onlineResponseTimerView(paused, 99_000), {
    declarationEventId: 42,
    paused: true,
    seconds: 6,
    ownResponse: true,
    label: "对局已暂停，响应倒计时冻结"
  });
  assert.equal(onlineResponseTimerView({ ...base, responseTimer: { ...base.responseTimer, declarationEventId: 41 } }, 18_400), null);
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

test("pending attack responses expose a compact public battle comparison", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "日冕骑士", atk: 1700, def: 1200, mode: "attack" };
  view.players.p2.monsterZone[0] = { ...monster("target:1"), name: "铁壁守卫", mode: "defense" };
  view.players.p2.lp = 4000;
  view.machine = { pendingAttack: { playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: "target:1", direct: false, declarationEventId: 23 } };

  assert.deepEqual(onlineResponseBattleView(view), {
    declarationEventId: 23,
    direct: false,
    tone: "guard",
    badge: "守备反击",
    attackerName: "日冕骑士",
    attackerStat: "ATK 1700",
    targetName: "铁壁守卫",
    targetStat: "DEF 2100",
    summary: "攻击方承受 400 点守备力差值伤害；双方怪兽保留，目标会产生战斗损耗。"
  });

  view.machine.pendingAttack = { playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: null, direct: true, declarationEventId: 24 };
  assert.deepEqual(onlineResponseBattleView(view), {
    declarationEventId: 24,
    direct: true,
    tone: "danger",
    badge: "直击",
    attackerName: "日冕骑士",
    attackerStat: "ATK 1700",
    targetName: "月见的生命值",
    targetStat: "LP 4000",
    summary: "预计造成 1700 点生命值伤害。"
  });
});

test("online game results are viewer-relative and include the final life totals", () => {
  const view = snapshot();
  view.roomCode = "STAR42";
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.lp = 900;
  view.players.p2.lp = 0;
  view.gameOver = { winnerId: "p1", loserIds: ["p2"], reason: "lp-zero", triggerEventId: 88 };
  assert.deepEqual(onlineGameResultView(view), {
    key: "STAR42:88",
    tone: "victory",
    kicker: "DUEL VICTORY",
    title: "决斗胜利",
    summary: "月见的生命值归零，你赢得了本局决斗。",
    selfName: "星野",
    selfLp: 900,
    rivalName: "月见",
    rivalLp: 0
  });

  view.viewerSeatId = "p2";
  view.opponentSeatId = "p1";
  assert.deepEqual(onlineGameResultView(view), {
    key: "STAR42:88",
    tone: "defeat",
    kicker: "DUEL DEFEAT",
    title: "决斗败北",
    summary: "你的生命值归零，星野赢得了本局决斗。",
    selfName: "月见",
    selfLp: 0,
    rivalName: "星野",
    rivalLp: 900
  });
});

test("online surrender results explain who conceded without changing the final life totals", () => {
  const view = snapshot();
  view.roomCode = "STAR42";
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.lp = 4000;
  view.players.p2.lp = 4000;
  view.gameOver = { winnerId: "p1", loserIds: ["p2"], reason: "concede", triggerEventId: null };
  assert.equal(onlineGameResultView(view).summary, "月见选择认输，你赢得了本局决斗。");

  view.viewerSeatId = "p2";
  view.opponentSeatId = "p1";
  assert.equal(onlineGameResultView(view).summary, "你选择认输，星野赢得了本局决斗。");
});

test("online rematch copy reflects both players' confirmations and the next starter", () => {
  const view = snapshot();
  view.gameOver = { winnerId: "p1", loserIds: ["p2"], reason: "lp-zero" };
  view.duelNumber = 1;
  view.nextFirstPlayerId = "p2";
  view.seats = [
    { seatId: "p1", name: "星野", ready: false, connected: true },
    { seatId: "p2", name: "月见", ready: false, connected: true }
  ];
  assert.deepEqual(onlineRematchView(view), {
    selfReady: false,
    rivalReady: false,
    disabled: false,
    label: "再来一局",
    status: "双方确认后开始第 2 局，月见先手。"
  });

  view.seats[1].ready = true;
  assert.equal(onlineRematchView(view).label, "接受再战");
  assert.equal(onlineRematchView(view).status, "月见已发起再战，确认后立即开始第 2 局。");

  view.seats[0].ready = true;
  view.seats[1].ready = false;
  assert.equal(onlineRematchView(view).disabled, true);
  assert.equal(onlineRematchView(view).status, "你已接受再战，等待月见确认。");
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

test("online timeline turns public events into categorized inspectable entries", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "日冕骑士" };
  view.players.p2.grave = [{ ...monster("target:1"), name: "铁壁守卫" }];
  view.recentEvents = [
    { id: 40, type: "TURN_STARTED", playerId: "p1" },
    { id: 41, type: "ATTACK_DECLARED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: "target:1" },
    { id: 42, type: "BATTLE_RESOLVED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: "target:1", declarationEventId: 41, outcome: { kind: "attackWin", finalDamage: 800, damagePlayerId: "p2", destroysTarget: true } }
  ];
  const timeline = onlineEventTimeline(view);
  assert.deepEqual(timeline.map((entry) => [entry.id, entry.category, entry.actor]), [
    [42, "battle", "self"], [41, "battle", "self"], [40, "turn", "self"]
  ]);
  assert.match(timeline[0].text, /日冕骑士.*铁壁守卫.*800/);
  assert.deepEqual(timeline[0].cardIds, ["attacker:1", "target:1"]);
  assert.equal(timeline[2].text, "星野的回合开始");
});

test("online timeline never exposes a concealed card reference", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.recentEvents = [{ id: 9, type: "TRAP_SET", playerId: "p2", index: 2 }];
  assert.deepEqual(onlineEventTimeline(view)[0].cardIds, []);
  assert.equal(onlineEventTimeline(view)[0].text, "月见盖放了 1 张陷阱");
});

test("online timeline folds summon setup and battle internals into readable outcomes", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "日冕骑士" };
  view.players.p2.grave = [{ ...monster("target:1"), name: "铁壁守卫" }];
  view.recentEvents = [
    { id: 10, type: "CARD_ACTIVATED", playerId: "p2", cardId: "target:1" },
    { id: 12, type: "MONSTER_SUMMONED", playerId: "p2", cardId: "target:1" },
    { id: 20, type: "ATTACK_DECLARED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: "target:1" },
    { id: 25, type: "DAMAGE_DEALT", playerId: "p2", sourceCardId: "attacker:1", amount: 800 },
    { id: 26, type: "CARD_DESTROYED", playerId: "p2", sourceCardId: "attacker:1", cardId: "target:1" },
    { id: 27, type: "BATTLE_RESOLVED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", targetCardId: "target:1", declarationEventId: 20, outcome: { kind: "attackWin", finalDamage: 800, damagePlayerId: "p2", destroysTarget: true } }
  ];
  const timeline = onlineEventTimeline(view);
  assert.deepEqual(timeline.map((entry) => entry.type), ["BATTLE_RESOLVED", "ATTACK_DECLARED", "MONSTER_SUMMONED"]);
  assert.match(timeline[0].text, /800 伤害/);
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

test("battle receipts summarize damage and change tone for each viewer", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "日冕骑士", atk: 1700 };
  view.recentEvents = [
    { id: 20, type: "ATTACK_DECLARED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", direct: true },
    { id: 21, type: "DAMAGE_DEALT", playerId: "p2", amount: 1200, requested: 1700, sourceCardId: "attacker:1" },
    { id: 22, type: "BATTLE_RESOLVED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", direct: true, declarationEventId: 20, outcome: {
      kind: "direct", finalDamage: 1700, damagePlayerId: "p2", destroysAttacker: false, destroysTarget: false
    } }
  ];

  assert.deepEqual(latestOnlineActionReceipt(view, 19), {
    id: 22,
    type: "BATTLE_RESOLVED",
    actor: "self",
    kind: "battle-result",
    tone: "success",
    result: "direct",
    damage: 1200,
    damagePlayerId: "p2",
    destroyedSeatIds: [],
    text: "《日冕骑士》直接命中月见 · 1200 伤害"
  });

  view.viewerSeatId = "p2";
  assert.equal(latestOnlineActionReceipt(view, 19).tone, "danger");
  assert.equal(latestOnlineActionReceipt(view, 19).actor, "opponent");
});

test("canceled attacks become a clear blocked battle result", () => {
  const view = snapshot();
  view.seats = [{ seatId: "p1", name: "星野" }, { seatId: "p2", name: "月见" }];
  view.players.p1.monsterZone[0] = { ...monster("attacker:1"), name: "日冕骑士" };
  view.recentEvents = [
    { id: 30, type: "ATTACK_DECLARED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", direct: true },
    { id: 31, type: "ATTACK_CANCELED", playerId: "p1", rivalId: "p2", attackerCardId: "attacker:1", declarationEventId: 30, reason: "online-trap" }
  ];
  assert.deepEqual(latestOnlineActionReceipt(view, 29), {
    id: 31,
    type: "ATTACK_CANCELED",
    actor: "self",
    kind: "battle-result",
    tone: "blocked",
    result: "canceled",
    damagePlayerId: null,
    destroyedSeatIds: [],
    text: "《日冕骑士》的攻击被陷阱阻断"
  });
});

test("online event sounds distinguish summon, spell, attack and battle outcomes", () => {
  const view = snapshot();
  view.players.p1.monsterZone[0] = { ...monster("summoned:1"), stars: 4 };
  view.players.p1.grave.push({ id: "spell:1", templateId: "ember-bolt", type: "spell" });
  assert.equal(onlineEventSound(view, { type: "MONSTER_SUMMONED", cardId: "summoned:1" }), "summon");
  assert.equal(onlineEventSound(view, { type: "CARD_ACTIVATED", cardId: "spell:1" }), "spell");
  assert.equal(onlineEventSound(view, { type: "ATTACK_DECLARED" }), "attack-charge");
  assert.equal(onlineEventSound(view, { type: "BATTLE_RESOLVED", outcome: { kind: "direct" } }), "attack-direct");
  assert.equal(onlineEventSound(view, { type: "BATTLE_RESOLVED", outcome: { kind: "clash" } }), "attack-clash");
  assert.equal(onlineEventSound(view, { type: "ATTACK_CANCELED" }), "guard");
});

test("online action cues preserve attack direction and fold an immediate result into one visual beat", () => {
  const view = snapshot();
  view.players.p2.monsterZone[0] = { ...monster("attacker:2"), name: "暮影枪兵" };
  view.players.p1.monsterZone[1] = { ...monster("target:1"), name: "守望铁卫" };
  const events = [
    { id: 40, type: "ATTACK_DECLARED", playerId: "p2", rivalId: "p1", attackerCardId: "attacker:2", targetCardId: "target:1", direct: false },
    { id: 41, type: "DAMAGE_DEALT", playerId: "p1", amount: 250, sourceCardId: "attacker:2" },
    { id: 42, type: "BATTLE_RESOLVED", playerId: "p2", rivalId: "p1", attackerCardId: "attacker:2", targetCardId: "target:1", declarationEventId: 40, outcome: { kind: "attackWin", finalDamage: 300, damagePlayerId: "p1" } }
  ];
  assert.deepEqual(onlineActionCue(view, events), {
    id: 42,
    kind: "attack",
    actor: "ai",
    rival: "player",
    cardId: "attacker:2",
    targetCardId: "target:1",
    direct: false,
    label: "攻击宣言",
    resultType: "BATTLE_RESOLVED",
    outcome: { kind: "attackWin", finalDamage: 300, damagePlayerId: "p1" },
    damage: 250,
    damagePlayerId: "p1"
  });
});

test("online action cues prioritize a completed summon over its supporting activation", () => {
  const view = snapshot();
  view.players.p1.monsterZone[0] = { ...monster("ace:1"), name: "终局星神", stars: 8 };
  view.players.p1.grave.push({ id: "spell:1", type: "spell", name: "星界召集" });
  assert.deepEqual(onlineActionCue(view, [
    { id: 50, type: "CARD_ACTIVATED", playerId: "p1", cardId: "spell:1" },
    { id: 51, type: "MONSTER_SUMMONED", playerId: "p1", cardId: "ace:1" }
  ]), {
    id: 51, kind: "summon", actor: "player", cardId: "ace:1", label: "王牌降临"
  });
});

test("online action cues identify public spell and trap activations without exposing hidden cards", () => {
  const view = snapshot();
  view.players.p2.grave.push({ id: "trap:2", type: "trap", name: "反射镜阵" });
  assert.equal(onlineActionCue(view, [{ id: 60, type: "CARD_ACTIVATED", playerId: "p2", cardId: "trap:2" }]).kind, "trap");
  assert.deepEqual(onlineActionCue(view, [{ id: 61, type: "CARD_ACTIVATED", playerId: "p2", cardId: "hidden:1" }]), {
    id: 61, kind: "effect", actor: "ai", cardId: "hidden:1", label: "卡牌发动"
  });
});

test("online action cues show set positions and mode changes without requiring a public card name", () => {
  const view = snapshot();
  assert.deepEqual(onlineActionCue(view, [{ id: 70, type: "TRAP_SET", playerId: "p2", index: 3 }]), {
    id: 70, kind: "set", actor: "ai", cardId: null, slotIndex: 3, label: "后场盖放"
  });
  view.players.p1.monsterZone[0] = { ...monster("guardian:1"), mode: "defense" };
  assert.deepEqual(onlineActionCue(view, [{ id: 71, type: "MONSTER_MODE_CHANGED", playerId: "p1", cardId: "guardian:1", to: "defense" }]), {
    id: 71, kind: "mode", actor: "player", cardId: "guardian:1", mode: "defense", label: "转为守备"
  });
});

test("effect draws become compact cues while ordinary turn draws stay with the turn banner", () => {
  const view = snapshot();
  assert.equal(onlineActionCue(view, [{ id: 80, type: "CARDS_DRAWN", playerId: "p1", count: 1 }]), null);
  assert.deepEqual(onlineActionCue(view, [{ id: 81, type: "CARDS_DRAWN", playerId: "p2", count: 2, sourceCardId: "seer:2" }]), {
    id: 81, kind: "draw", actor: "ai", count: 2, label: "对手抽卡"
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
  const room = new DuelRoom({
    code: "ABC234",
    createState: (config) => createOnlineDuelState({ ...config, openingHands: {
      p1: ["solar-knight", "twin-summon", "gale-mage", "iron-guardian", "void-hound"],
      p2: ["mirror-snare", "weakening-web", "storm-shift", "guard-sigil", "iron-guardian"]
    } })
  });
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

  const afterFirstSummon = room.viewFor("p1");
  room.submit("one", { revision: afterFirstSummon.revision, commandId: "ui-end-p1", action: { type: "END_TURN" } });
  const secondView = room.viewFor("p2");
  assert.equal(secondView.turn.playerId, "p2");
  const secondLegal = secondView.legalActions.actions.summon[0];
  assert.ok(secondLegal, "2P receives a summon action on their own turn");
  const secondSelection = selectOnlineCard(secondView, secondLegal.cardId);
  secondSelection.index = 4;
  const secondAction = onlineSelectionModel(secondView, secondSelection).action;
  room.submit("two", { revision: secondView.revision, commandId: "ui-summon-p2", action: secondAction });
  assert.equal(room.viewFor("p2").players.p2.monsterZone[4]?.id, secondLegal.cardId);
  assert.equal(room.viewFor("p1").players.p2.monsterZone[4]?.id, secondLegal.cardId);
});
