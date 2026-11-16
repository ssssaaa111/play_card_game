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

test("a new double-click can start immediately after the previous command completes", async () => {
  let time = 1000;
  const run = createOnlineActionRunner(() => {}, () => time);
  await run(async () => {});
  time += 30;
  assert.equal(run.blocksRepeatedClick(2), true, "the previous gesture's trailing click remains blocked");
  assert.equal(run.blocksRepeatedClick(1), false, "a fresh gesture starts with its own first click");
  time += 40;
  assert.equal(run.blocksRepeatedClick(2), false, "the new gesture does not need to wait 400ms");
});

test("clicks during a pending command and keyboard input do not release trailing-click protection", async () => {
  const run = createOnlineActionRunner(() => {}, () => 1000);
  let release;
  const pending = run(() => new Promise(resolve => { release = resolve; }));
  assert.equal(run.blocksRepeatedClick(1), false);
  assert.equal(run.blocksRepeatedClick(2), true);
  release();
  await pending;
  assert.equal(run.blocksRepeatedClick(0), false);
  assert.equal(run.blocksRepeatedClick(2), true, "keyboard input is not the first click of a new pointer gesture");
  assert.equal(run.blocksRepeatedClick(3), true, "extra clicks in the old gesture are also blocked");
});
