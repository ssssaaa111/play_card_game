import test from "node:test";
import assert from "node:assert/strict";
import { battlePresentation, spellPresentation, createLiveBattleVfx } from "../src/live-battle-vfx.js";

const attacker = { id: "solar-knight", name: "太阳骑士", stars: 4 };
const target = { id: "iron-guardian", name: "铁壁守卫", stars: 4 };
const input = { attacker, target, owner: "player", rival: "ai" };
const resolved = (kind) => ({ type: "BATTLE_RESOLVED", outcome: { kind } });
const hit = (amount, playerId = "ai", id = 1) => ({ type: "DAMAGE_DEALT", playerId, amount, id });

test("declarations and cancelled attacks cannot create a hit animation", () => {
  for (const type of ["ATTACK_DECLARED", "ATTACK_CANCELED"]) {
    assert.equal(battlePresentation({ ...input, events: [{ type }] }), null);
  }
});

test("damage uses resolved LP loss and excludes the after-attack effect", () => {
  const result = battlePresentation({ ...input, events: [
    hit(650), hit(300, "ai", 2),
    { type: "AFTER_ATTACK_EFFECT_RESOLVED", resultEventIds: [2] }, resolved("attackWin")
  ] });
  assert.equal(result.damage, 650);
  assert.equal(result.damageText, "−650");
  assert.equal(result.clipId, "solar-slash");
});

test("zero-damage defense uses a result label instead of preview damage", () => {
  const result = battlePresentation({ ...input, events: [resolved("breakDefense")] });
  assert.equal(result.damage, 0);
  assert.equal(result.damageText, "破防");
  assert.equal(result.clipId, "rift-impact");
});

test("counter animation reverses actors and shows the attacker's LP loss", () => {
  const result = battlePresentation({ ...input, events: [hit(400, "player"), resolved("guardCounter")] });
  assert.equal(result.source, target);
  assert.equal(result.target, attacker);
  assert.equal(result.targetOwner, "player");
  assert.equal(result.damage, 400);
});

test("direct attack uses a duelist target and magic requires positive damage", () => {
  const direct = battlePresentation({ ...input, target: null, events: [hit(1900), resolved("direct")] });
  assert.equal(direct.target, null);
  assert.equal(direct.damageText, "−1,900");
  assert.equal(spellPresentation({ card: { name: "回复" }, owner: "player", events: [hit(0)] }), null);
  const spell = spellPresentation({ card: { name: "炎岚合击" }, owner: "player", events: [hit(400)] });
  assert.equal(spell.damage, 400);
  assert.equal(spell.clipId, "astral-burst");
});

function harness({ imageFailure = false, deferredImage = false, canvasFailure = false, gentle = false } = {}) {
  let now = 0, next = 1;
  const rafs = new Map(), timers = new Map(), images = [], renders = [], events = new Map();
  const root = { children: [], appendChild(node) { this.children.push(node); node.parent = this; } };
  const doc = {
    hidden: false,
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); },
    createElement(tag) {
      return {
        tag, dataset: {}, style: {}, children: [], setAttribute() {},
        append(...nodes) { this.children.push(...nodes); },
        getContext() { return canvasFailure ? null : {}; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
      };
    }
  };
  const win = {
    innerWidth: 1280, devicePixelRatio: 1,
    performance: { now: () => now },
    matchMedia: () => ({ matches: gentle }),
    requestAnimationFrame(fn) { const id = next++; rafs.set(id, fn); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    setTimeout(fn, ms) { const id = next++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Image: class {
      set src(value) {
        this.url = value; images.push(this);
        if (!deferredImage) queueMicrotask(() => imageFailure ? this.onerror?.() : this.onload?.());
      }
    }
  };
  const vfx = createLiveBattleVfx({
    document: doc, window: win, root, assetForCard: (card) => card.id + ".png",
    renderFrame: (...args) => renders.push(args)
  });
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  async function advance(ms) {
    now += ms;
    const callbacks = [...rafs.values()]; rafs.clear();
    callbacks.forEach((fn) => fn(now));
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.fn(); }
    }
    await flush();
  }
  return { vfx, root, images, renders, events, doc, flush, advance, rafs, timers };
}

test("live playback uses exact card art, resolves, and removes its layer", async () => {
  const h = harness();
  const done = h.vfx.playAttack({ ...input, events: [hit(650), resolved("attackWin")] });
  await h.flush();
  assert.equal(h.root.children.length, 1);
  assert.equal(h.root.children[0].dataset.damage, "650");
  assert.deepEqual(h.images.map((image) => image.url), ["solar-knight.png", "iron-guardian.png"]);
  await h.advance(1200);
  assert.deepEqual(await done, { played: true, cancelled: false });
  assert.equal(h.root.children.length, 0);
  assert.equal(h.rafs.size + h.timers.size, 0);
});

test("pause retains the current animation and resume finishes remaining time", async () => {
  const h = harness();
  const done = h.vfx.playSummon(attacker, "player");
  await h.flush();
  await h.advance(300);
  h.vfx.setPaused(true);
  const frames = h.renders.length;
  await h.advance(5000);
  assert.equal(h.renders.length, frames);
  assert.equal(h.root.children.length, 1);
  h.vfx.setPaused(false);
  await h.advance(1700);
  assert.equal((await done).played, true);
  assert.equal(h.root.children.length, 0);
});

test("reset invalidates pending images and cancels active playback", async () => {
  const pending = harness({ deferredImage: true });
  const load = pending.vfx.playSummon(attacker, "player");
  pending.vfx.reset();
  pending.images.forEach((image) => image.onload());
  await pending.flush();
  assert.equal((await load).cancelled, true);
  assert.equal(pending.root.children.length, 0);
  const h = harness();
  const done = h.vfx.playSummon(attacker, "player");
  await h.flush();
  h.vfx.reset();
  assert.equal((await done).cancelled, true);
  assert.equal(h.root.children.length, 0);
});

test("unavailable art and canvas fall back without trapping the game flow", async () => {
  for (const options of [{ imageFailure: true }, { canvasFailure: true }]) {
    const h = harness(options);
    const result = await h.vfx.playSummon(attacker, "player");
    assert.equal(result.played, false);
    assert.equal(h.root.children.length, 0);
  }
});

test("reduced motion holds the impact frame and finishes quickly", async () => {
  const h = harness({ gentle: true });
  const done = h.vfx.playSummon(attacker, "player");
  await h.flush();
  await h.advance(200);
  assert.equal(h.renders[0][3], h.renders.at(-1)[3]);
  assert.equal(h.renders[0][4].reducedMotion, true);
  assert.equal(h.renders[0][4].summonTitle, attacker.name);
  await h.advance(500);
  assert.equal((await done).played, true);
});

test("hiding the tab releases an active animation instead of blocking the turn", async () => {
  const h = harness();
  const done = h.vfx.playSummon(attacker, "player");
  await h.flush();
  h.doc.hidden = true;
  h.events.get("visibilitychange")();
  assert.equal((await done).cancelled, false);
  assert.equal(h.root.children.length, 0);
});
