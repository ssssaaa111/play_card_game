import test from "node:test";
import assert from "node:assert/strict";
import { createAiActionPlayback, aiActionConsequences, aiActionDuration, aiActionSummary } from "../src/ai-action-playback.js";

function harness() {
  let time = 0;
  let serial = 0;
  let paused = false;
  const frames = new Map();
  const snapshots = [];
  const playback = createAiActionPlayback({
    now: () => time,
    requestFrame: (fn) => { frames.set(++serial, fn); return serial; },
    cancelFrame: (id) => frames.delete(id),
    isPaused: () => paused,
    durationFor: () => 300,
    onChange: (snapshot) => snapshots.push(snapshot)
  });
  return {
    playback, snapshots, frames,
    pause(value) { paused = value; },
    tick(ms = 100) {
      time += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
    }
  };
}

test("public actions automatically finish in order and retain the last three", async () => {
  const h = harness();
  const promises = [1, 2, 3, 4].map((id) => h.playback.enqueue({ cardId: String(id) }));
  assert.equal(h.playback.snapshot().action.cardId, "1");
  assert.equal(h.playback.snapshot().total, 4);
  for (let i = 0; i < 12; i++) h.tick();
  assert.deepEqual(await Promise.all(promises), [true, true, true, true]);
  assert.equal(h.playback.snapshot().action, null);
  assert.deepEqual(h.playback.snapshot().history.map((a) => a.cardId), ["4", "3", "2"]);
  assert.equal(h.frames.size, 0);
});

test("inspecting a card or pausing holds the current action and queued actions", async () => {
  const h = harness();
  const first = h.playback.enqueue({ cardId: "first" });
  const second = h.playback.enqueue({ cardId: "second" });
  h.tick();
  h.pause(true);
  for (let i = 0; i < 40; i++) h.tick();
  assert.equal(h.playback.snapshot().action.cardId, "first");
  assert.equal(h.playback.skip(), false);
  h.pause(false);
  h.tick(); h.tick();
  assert.equal(await first, true);
  assert.equal(h.playback.snapshot().action.cardId, "second");
  h.playback.skip();
  assert.equal(await second, true);
});

test("returning from a suspended tab cannot skip a whole action", () => {
  const h = harness();
  h.playback.enqueue({ cardId: "readable" });
  h.tick(90000);
  assert.equal(h.playback.snapshot().action.cardId, "readable");
  h.playback.reset();
});

test("reset resolves every old waiter as cancelled and stale frames cannot finish a new action", async () => {
  const h = harness();
  const old = h.playback.enqueue({ cardId: "old" });
  const queued = h.playback.enqueue({ cardId: "queued" });
  const staleFrame = [...h.frames.values()][0];
  h.playback.reset();
  assert.deepEqual(await Promise.all([old, queued]), [false, false]);
  assert.deepEqual(h.playback.snapshot().history, []);
  const fresh = h.playback.enqueue({ cardId: "new" });
  staleFrame();
  assert.equal(h.playback.snapshot().action.cardId, "new");
  assert.equal(h.frames.size, 1);
  h.tick(); h.tick(); h.tick();
  assert.equal(await fresh, true);
});

test("fast forward cancels its old frame and only completes one step", async () => {
  const h = harness();
  const first = h.playback.enqueue({ cardId: "first" });
  const second = h.playback.enqueue({ cardId: "second" });
  const staleFrame = [...h.frames.values()][0];
  h.playback.skip();
  staleFrame();
  assert.equal(await first, true);
  assert.equal(h.playback.snapshot().action.cardId, "second");
  assert.equal(h.frames.size, 1);
  h.playback.reset();
  assert.equal(await second, false);
});

test("result summaries show actual deltas and never reveal drawn or set cards", () => {
  const lookups = [];
  const entries = aiActionConsequences([
    { type: "CARDS_DRAWN", playerId: "ai", count: 2, cardIds: ["secret1", "secret2"] },
    { type: "TRAP_SET", playerId: "ai", cardId: "secret3" },
    { type: "STAT_MODIFIED", cardId: "public", stat: "tempDef", amount: -300 },
    { type: "DAMAGE_DEALT", playerId: "player", amount: 700 },
    { type: "LP_HEALED", playerId: "ai", amount: 500 }
  ], { findCard: (id) => { lookups.push(id); return { card: { name: "星盾卫" } }; } });
  assert.deepEqual(lookups, ["public"]);
  assert.deepEqual(entries.map((entry) => entry.text), ["对手抽 2 张卡", "星盾卫 DEF −300", "你 LP −700", "对手 LP +500"]);
});

test("destroyed targets keep their original zone for field cues", () => {
  const from = { playerId: "player", zone: "spellTrapZone", index: 3 };
  const entries = aiActionConsequences([
    { type: "CARD_MOVED", cardId: "revealed", from, to: { zone: "grave" } },
    { type: "CARD_DESTROYED", cardId: "revealed", playerId: "player" }
  ]);
  assert.equal(entries[0].from, from);
  assert.equal(entries[0].badge, "被破坏");
});

test("important effects have a longer reading beat than routine cards", () => {
  assert.ok(aiActionDuration({ revealKind: "trap" }) > aiActionDuration({ revealKind: "spell" }));
  assert.ok(aiActionDuration({ revealKind: "summon", card: { stars: 7 } }) > aiActionDuration({ revealKind: "summon", card: { stars: 2 } }));
});

test("identical tokens keep both field cues and a counted summary", () => {
  const entries = aiActionConsequences([
    { type: "MONSTER_SUMMONED", cardId: "token1", summonType: "token" },
    { type: "MONSTER_SUMMONED", cardId: "token2", summonType: "token" }
  ], { findCard: () => ({ card: { name: "星火衍生体" } }) });
  assert.equal(entries.length, 2);
  assert.equal(aiActionSummary(entries), "星火衍生体 特殊召唤 ×2");
});
