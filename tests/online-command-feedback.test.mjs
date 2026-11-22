import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineActionRunner } from '../src/online-action-runner.js';
import { onlinePendingCommandView, onlineSelectionResetView, selectOnlineCard, onlineSelectionModel } from '../src/online-duel-ui.js';
import { DuelRoom } from '../server/duel-room.js';
import { createOnlineDuelState } from '../server/online-duel-state.js';

test('pending feedback describes the submitted action and yields to authoritative changes', () => {
  const view = { revision: 12 };
  const pending = { action: { type: 'SUMMON_MONSTER', cardId: 'knight' }, revision: 12 };
  assert.deepEqual(onlinePendingCommandView(view, pending), { title: '正在提交召唤', signal: '提交中', hint: '等待服务器确认，请稍候。' });
  assert.equal(onlinePendingCommandView({ revision: 13 }, pending), null, 'a new server state must not retain an old waiting message');
  assert.equal(onlinePendingCommandView({ ...view, gameOver: { winnerId: 'p1' } }, pending), null);
  assert.equal(onlinePendingCommandView(view, null), null);
  assert.equal(onlinePendingCommandView(view, { ...pending, action: { type: 'PASS_CHAIN_RESPONSE' } }).title, '正在提交响应');
  assert.equal(onlinePendingCommandView(view, { ...pending, action: { type: 'CHANGE_PHASE' } }).title, '正在切换阶段');
});

test('one pending command retains its feedback context and clears it on success or failure', async () => {
  let current;
  let release;
  const run = createOnlineActionRunner((pending, context) => { current = pending ? context : null; });
  const first = { action: { type: 'SUMMON_MONSTER' }, revision: 12 };
  const blocked = { action: { type: 'END_TURN' }, revision: 12 };
  const command = run(() => new Promise(resolve => { release = resolve; }), first);
  assert.equal(current, first);
  assert.equal(await run(() => assert.fail('a duplicate command ran'), blocked), false);
  assert.equal(current, first, 'blocked input must not replace the action shown to the player');
  release();
  await command;
  assert.equal(current, null);
  await assert.rejects(run(() => { throw new Error('disconnected'); }, blocked), /disconnected/);
  assert.equal(current, null, 'an error must not leave a perpetual submitting state');
});

function startedRoom(options = {}) {
  const room = new DuelRoom({ code: 'RST234', createState: () => createOnlineDuelState({
    openingHands: { p1: ['solar-knight', 'twin-summon', 'gale-mage', 'iron-guardian', 'void-hound'], p2: ['iron-guardian', 'weakening-web', 'mirror-snare', 'blade-sigil', 'twin-summon'] }
  }), ...options });
  room.join({ name: '星野', connectionId: 'one' });
  room.join({ name: '月见', connectionId: 'two' });
  room.setReady('one', true); room.setReady('two', true);
  return room;
}

test('an expired turn explains discarded placement without consuming the selected card for either seat', () => {
  let now = 1000;
  const room = startedRoom({ now: () => now, turnTimeoutMs: 5000 });
  for (const seat of ['p1', 'p2']) {
    const view = room.viewFor(seat);
    const cardId = view.legalActions.actions.summon[0].cardId;
    const selection = selectOnlineCard(view, cardId);
    selection.index = 4;
    assert.ok(onlineSelectionModel(view, selection).action);
    assert.equal(onlineSelectionResetView(view, view, selection), null, 'local rerenders must preserve the choice');
    now += 5000;
    assert.equal(room.expireTurnTimeout(), true);
    const after = room.viewFor(seat);
    assert.equal(onlineSelectionModel(after, selection), null);
    assert.deepEqual(onlineSelectionResetView(after, view, selection), { kind: 'selection-reset', text: '回合时间已到，原选择已取消。' });
    assert.deepEqual(after.players[seat].hand.map(card => card.id), view.players[seat].hand.map(card => card.id));
    assert.ok(after.players[seat].monsterZone.every(card => card === null));
    assert.equal(onlineSelectionResetView(after, view, null), null, 'confirming or cancelling locally must not look like invalidation');
  }
});

test('selection reset reasons follow actual phase, response, and battle changes while recovery and results retain priority', () => {
  const room = startedRoom();
  room.submit('one', { revision: room.revision, commandId: 'pass-opener', action: { type: 'END_TURN' } });
  const before = room.viewFor('p2');
  const selection = selectOnlineCard(before, before.legalActions.actions.summon[0].cardId);
  room.submit('two', { revision: before.revision, commandId: 'phase-change', action: { type: 'CHANGE_PHASE', phase: 'battle' } });
  const battle = room.viewFor('p2');
  assert.match(onlineSelectionResetView(battle, before, selection).text, /已进入战斗阶段，原选择已取消，请重新选择/);
  assert.match(onlineSelectionResetView({ ...battle, turn: before.turn }, before, selection).text, /战况已更新/);
  assert.match(onlineSelectionResetView({ ...battle, machine: { ...battle.machine, responseWindow: { playerId: 'p2' } } }, before, selection).text, /已进入响应/);
  for (const override of [
    { gameOver: { winnerId: 'p1' } }, { roomCode: 'NEW234' }, { duelNumber: before.duelNumber + 1 },
    { seats: [{ seatId: 'p1', connected: false }] }, { viewerRole: 'spectator' }, { status: 'waiting' }
  ]) assert.equal(onlineSelectionResetView({ ...battle, ...override }, before, selection), null);
  assert.equal(onlineSelectionResetView(battle, null, selection), null);
});
