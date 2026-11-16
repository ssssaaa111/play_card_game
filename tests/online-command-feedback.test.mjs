import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineActionRunner } from '../src/online-action-runner.js';
import { onlinePendingCommandView } from '../src/online-duel-ui.js';

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
