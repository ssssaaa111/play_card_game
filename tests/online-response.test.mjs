import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../server/duel-room.js";
import { createOnlineDuelState } from "../server/online-duel-state.js";
import { createDuelist, cardById } from "../src/deck.js";
import { buildEngineStateFromUiState } from "../src/engine-adapter.js";
import { createDuelSessionConfig, ControllerKind, DuelMode } from "../src/duel-session.js";
import { sanitizeOnlineAction } from "../src/duel-command.js";
import { onlineTrapResponseChoice } from "../src/online-duel-ui.js";

function battle({ traps = ["mirror-snare", "weakening-web"], targets = [], lp = 4000, deckSize = 5, now, responseTimeoutMs } = {}) {
  const card = (id, uid) => ({ ...cardById(id), uid, mode: "attack", used: false, tempAtk: 0, tempDef: 0 });
  const p1 = createDuelist("p1"), p2 = createDuelist("p2");
  p1.field[0] = card("solar-knight", "attacker");
  traps.forEach((id, index) => { p2.traps[index] = card(id, `trap:${index}`); });
  targets.forEach((id, index) => { p2.field[index] = card(id, `target:${index}`); });
  p1.lp = lp;
  for (const [id, player] of [["p1", p1], ["p2", p2]]) player.deck = Array.from({ length: deckSize }, (_, index) => card("iron-guardian", `${id}:deck:${index}`));
  const createState = () => buildEngineStateFromUiState({
    ...createDuelSessionConfig({ mode: DuelMode.onlinePvp, seatIds: ["p1", "p2"], localPlayerId: "p1", controllers: { p1: ControllerKind.human, p2: ControllerKind.human } }),
    cardDefinitionsComplete: true, p1, p2, turn: "p1", phase: "battle", timing: "battleOpen", gameEvents: []
  });
  const room = new DuelRoom({ code: "ABC234", createState, ...(now ? { now } : {}), ...(responseTimeoutMs ? { responseTimeoutMs } : {}) });
  room.join({ name: "攻击方", connectionId: "one" });
  const defender = room.join({ name: "防守方", connectionId: "two" });
  room.setReady("one", true); room.setReady("two", true);
  let sequence = 0;
  const submit = (connection, action) => room.submit(connection, { revision: room.revision, commandId: `response:${sequence++}`, action });
  const declare = () => submit("one", { type: "DECLARE_ATTACK", attackerCardId: "attacker", ...(targets.length ? { targetCardId: "target:0" } : {}) });
  const respond = (type = "RESPOND_TRAP", cardId = "trap:0") => submit("two", { type, cardId, declarationEventId: room.viewFor("p2").attackResponse.declarationEventId });
  return { room, submit, declare, respond, defender };
}

test("response commands bind the authenticated seat and discard forged effects/targets", () => {
  assert.deepEqual(sanitizeOnlineAction({ type: "RESPOND_TRAP", playerId: "p1", cardId: "trap", declarationEventId: 12, attackerCardId: "forged", targetCardId: "forged", consumeAttack: false }, { seatId: "p2", rivalId: "p1" }), { type: "RESPOND_TRAP", playerId: "p2", cardId: "trap", declarationEventId: 12 });
  for (const declarationEventId of [null, -1, "12", 1.5]) assert.throws(() => sanitizeOnlineAction({ type: "PASS_ATTACK_RESPONSE", declarationEventId }, { seatId: "p2", rivalId: "p1" }), /declarationEventId/);
});

test("attack waits for defender; candidates stay private; illegal commands leave every event and revision unchanged", () => {
  const { room, submit, declare } = battle();
  declare();
  const state = room.engine.getState(), revision = room.revision;
  const attacker = room.viewFor("p1"), defender = room.viewFor("p2");
  assert.equal(attacker.players.p2.lp, 4000);
  assert.equal(attacker.attackResponse, null);
  assert.equal(attacker.legalActions.can.endTurn, false);
  assert.equal(defender.attackResponse.candidates.length, 2);
  assert.match(defender.players.p2.spellTrapZone[1].text, /盖放后可发动/);
  assert.ok(!defender.players.p2.spellTrapZone[1].text.includes("自动触发"));
  assert.ok(attacker.players.p2.spellTrapZone.filter(Boolean).every((card) => card.hidden && !card.templateId));
  assert.ok(!JSON.stringify(attacker).includes("mirror-snare"));
  for (const [connection, action] of [
    ["one", { type: "PASS_ATTACK_RESPONSE", declarationEventId: defender.attackResponse.declarationEventId }],
    ["one", { type: "END_TURN" }],
    ["two", { type: "RESPOND_TRAP", cardId: "attacker", declarationEventId: defender.attackResponse.declarationEventId }],
    ["two", { type: "RESPOND_TRAP", cardId: "trap:0", declarationEventId: defender.attackResponse.declarationEventId + 1 }]
  ]) {
    assert.throws(() => submit(connection, action), { code: "ILLEGAL_COMMAND" });
    assert.deepEqual(room.engine.getState(), state);
    assert.equal(room.revision, revision);
  }
});

test("passing resolves damage once, leaves traps hidden, and allows normal play again", () => {
  const { room, declare } = battle(); declare();
  const envelope = { revision: room.revision, commandId: "pass:once", action: { type: "PASS_ATTACK_RESPONSE", declarationEventId: room.viewFor("p2").attackResponse.declarationEventId } };
  room.submit("two", envelope);
  const after = room.viewFor("p1");
  assert.equal(after.players.p2.lp, 2300);
  assert.equal(after.machine.pendingAttack, null);
  assert.equal(after.machine.responseWindow, null);
  assert.equal(after.players.p1.monsterZone[0].used, true);
  assert.ok(after.players.p2.spellTrapZone[0].hidden);
  assert.ok(after.legalActions.can.endTurn);
  assert.equal(room.submit("two", envelope).duplicate, true);
  assert.deepEqual(room.viewFor("p1"), after);
});

test("an unanswered attack auto-resolves at the authoritative room deadline", () => {
  let currentTime = 10_000;
  const { room, declare } = battle({ now: () => currentTime, responseTimeoutMs: 15_000 });
  declare();
  assert.deepEqual(room.viewFor("p2").responseTimer, {
    declarationEventId: room.viewFor("p2").attackResponse.declarationEventId,
    deadlineAt: 25_000,
    remainingMs: null,
    paused: false
  });
  currentTime = 24_999;
  assert.equal(room.expireAttackResponse(), false);
  currentTime = 25_000;
  assert.equal(room.expireAttackResponse(), true);
  const after = room.viewFor("p2");
  assert.equal(after.responseTimer, null);
  assert.equal(after.machine.responseWindow, null);
  assert.equal(after.machine.pendingAttack, null);
  assert.equal(after.players.p2.lp, 2300);
  assert.ok(after.recentEvents.some((event) => event.type === "RESPONSE_WINDOW_CLOSED" && event.reason === "online-response-timeout"));
  assert.equal(room.expireAttackResponse(), false);
});

test("disconnect pauses an attack response deadline and reconnect resumes the remainder", () => {
  let currentTime = 1_000;
  const { room, declare, defender } = battle({ now: () => currentTime, responseTimeoutMs: 15_000 });
  declare();
  currentTime = 6_000;
  room.disconnect("two");
  assert.deepEqual(room.viewFor("p2").responseTimer, {
    declarationEventId: room.viewFor("p2").attackResponse.declarationEventId,
    deadlineAt: null,
    remainingMs: 10_000,
    paused: true
  });
  currentTime = 60_000;
  assert.equal(room.expireAttackResponse(), false);
  room.join({ connectionId: "two-again", reconnectToken: defender.reconnectToken });
  assert.equal(room.viewFor("p2").responseTimer.deadlineAt, 70_000);
  currentTime = 69_999;
  assert.equal(room.expireAttackResponse(), false);
  currentTime = 70_000;
  assert.equal(room.expireAttackResponse(), true);
});

for (const [trap, p1Lp, p2Lp, destroyed] of [
  ["mirror-snare", 4000, 4000, true], ["weakening-web", 4000, 2800, false],
  ["storm-shift", 4000, 4400, false], ["guard-sigil", 4000, 4000, false],
  ["void-lock", 4000, 4000, false], ["reversal-flare", 3500, 4000, false],
  ["soul-parry", 4000, 2900, false]
]) test(`${trap} resolves with authoritative targets and identical public results`, () => {
  const { room, declare, respond } = battle({ traps: [trap] }); declare(); respond();
  const a = room.viewFor("p1"), b = room.viewFor("p2");
  assert.equal(a.players.p1.lp, p1Lp); assert.equal(a.players.p2.lp, p2Lp);
  assert.equal(a.players.p1.monsterZone[0] === null, destroyed);
  if (!destroyed) assert.equal(a.players.p1.monsterZone[0].used, true);
  assert.equal(a.players.p2.spellTrapZone[0], null);
  assert.equal(a.players.p2.grave[0].templateId, trap);
  assert.equal(a.machine.pendingAttack, null); assert.equal(a.machine.responseWindow, null);
  assert.deepEqual(a.players.p1.monsterZone, b.players.p1.monsterZone);
  assert.equal(a.players.p2.lp, b.players.p2.lp);
  if (trap === "guard-sigil") assert.equal(b.players.p2.handCount, 1);
});

test("redirect changes only the trusted alternative target; an unusable trap never blocks battle", () => {
  const { room, declare, respond } = battle({ traps: ["phantom-switch"], targets: ["iron-guardian", "gale-mage"] });
  declare(); respond();
  const after = room.viewFor("p1");
  assert.equal(after.players.p2.monsterZone[0].id, "target:0");
  assert.equal(after.players.p2.monsterZone[1], null);
  const unavailable = battle({ traps: ["phantom-switch"], targets: ["iron-guardian"] });
  unavailable.declare();
  assert.equal(unavailable.room.viewFor("p2").attackResponse, null);
  assert.equal(unavailable.room.viewFor("p1").machine.pendingAttack, null);
});

test("direct-only trap is unavailable against a monster and chain/summon traps are excluded", () => {
  for (const traps of [["guard-sigil"], ["summon-flare"], ["chain-nullifier"]]) {
    const { room, declare } = battle({ traps, targets: ["iron-guardian"] }); declare();
    assert.equal(room.viewFor("p2").attackResponse, null);
  }
});

test("boosting traps use existing requirements and consume the canceled attack", () => {
  for (const [trap, amount] of [["counter-array", 400], ["ace-vow-guard", 900]]) {
    const { room, declare, respond } = battle({ traps: [trap], targets: ["iron-guardian"] }); declare(); respond();
    const view = room.viewFor("p2");
    assert.equal(view.players.p2.monsterZone[0].tempAtk, amount);
    assert.equal(view.players.p1.monsterZone[0].used, true);
    assert.equal(view.players.p2.lp, 4000);
  }
});

test("duplicate trap response cannot resolve twice or replay a consumed response", () => {
  const { room, declare } = battle({ traps: ["guard-sigil"] }); declare();
  const action = { type: "RESPOND_TRAP", cardId: "trap:0", declarationEventId: room.viewFor("p2").attackResponse.declarationEventId };
  const envelope = { revision: room.revision, commandId: "trap:once", action };
  room.submit("two", envelope);
  const state = room.engine.getState();
  assert.equal(room.submit("two", envelope).duplicate, true);
  assert.throws(() => room.submit("two", { revision: room.revision, commandId: "trap:again", action }), { code: "ILLEGAL_COMMAND" });
  assert.deepEqual(room.engine.getState(), state);
});

test("a lethal trap ends the duel without applying the original attack", () => {
  const { room, declare, respond } = battle({ traps: ["reversal-flare"], lp: 500 }); declare(); respond();
  assert.equal(room.status, "finished");
  assert.equal(room.viewFor("p2").players.p2.lp, 4000);
  assert.equal(room.viewFor("p2").gameOver.winnerId, "p2");
  assert.equal(room.viewFor("p2").attackResponse, null);
});

test("refresh restores a pending response and selected UI state is scoped to the attack and room", () => {
  const { room, declare, respond, defender } = battle(); declare();
  const initial = room.viewFor("p2");
  const choice = onlineTrapResponseChoice(initial);
  assert.equal(choice.selectedIndex, -1);
  assert.equal(choice.details.context.attackerIndex, 0);
  assert.equal(onlineTrapResponseChoice(initial, { ...choice, selectedIndex: 1 }).selectedIndex, 1);
  assert.equal(onlineTrapResponseChoice(initial, { ...choice, roomCode: "XYZ234", selectedIndex: 1 }).selectedIndex, -1);
  assert.equal(onlineTrapResponseChoice(initial, { ...choice, declarationEventId: choice.declarationEventId + 1, selectedIndex: 1 }).selectedIndex, -1);
  room.disconnect("two");
  const resumed = room.join({ connectionId: "two", reconnectToken: defender.reconnectToken });
  assert.equal(resumed.view.attackResponse.declarationEventId, initial.attackResponse.declarationEventId);
  assert.equal(room.viewFor("p1").players.p2.lp, 4000);
  respond();
  assert.equal(onlineTrapResponseChoice(room.viewFor("p2"), choice), null);
});

test("normal online deck includes supported traps, QA openings are explicit and conserve the deck", () => {
  const state = createOnlineDuelState({ openingHands: { p2: ["mirror-snare", "weakening-web", "storm-shift", "guard-sigil", "iron-guardian"] } });
  for (const player of Object.values(state.players)) {
    const cards = [...player.hand, ...player.deck].map((id) => state.cards[id]);
    assert.equal(cards.length, 40);
    assert.ok(cards.some((card) => card.type === "trap"));
    assert.ok(!cards.some((card) => ["summonBurn", "chainNegate"].includes(card.trigger)));
  }
  assert.equal(state.cards[state.players.p2.hand[0]].templateId, "mirror-snare");
});
