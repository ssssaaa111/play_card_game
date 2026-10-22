import test from "node:test";
import assert from "node:assert/strict";
import { createOnlineActionRunner } from "../src/online-action-runner.js";

test("repeated confirmation and phase-jump clicks share one in-flight lock", async () => {
  const pendingStates = [];
  const run = createOnlineActionRunner((value) => pendingStates.push(value));
  let release;
  let submitted = 0;
  const first = run(async () => {
    submitted++;
    await new Promise((resolve) => { release = resolve; });
  });
  assert.equal(await run(() => { submitted++; }), false);
  assert.equal(submitted, 1);
  assert.deepEqual(pendingStates, [true]);
  release();
  assert.equal(await first, true);
  assert.deepEqual(pendingStates, [true, false]);
  assert.equal(await run(() => { submitted++; }), true);
  assert.equal(submitted, 2);
});

test("failed requests release the lock and allow a later retry", async () => {
  const states = [];
  const run = createOnlineActionRunner((value) => states.push(value));
  await assert.rejects(run(() => { throw new Error("connection lost"); }), /connection lost/);
  assert.equal(await run(async () => {}), true);
  assert.deepEqual(states, [true, false, true, false]);
});

test("the trailing click of a confirmation double-click cannot select the hand underneath", async () => {
  let time = 1000;
  const run = createOnlineActionRunner(() => {}, () => time);
  assert.equal(run.blocksRepeatedClick(2), false);
  await run(async () => { assert.equal(run.blocksRepeatedClick(2), true); });
  assert.equal(run.blocksRepeatedClick(2), true);
  assert.equal(run.blocksRepeatedClick(1), false, "a new deliberate click is not delayed");
  assert.equal(run.blocksRepeatedClick(0), false, "keyboard activation is not delayed");
  time += 401;
  assert.equal(run.blocksRepeatedClick(2), false);
});
