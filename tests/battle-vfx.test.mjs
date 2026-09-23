import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_CLIPS, BATTLE_FRAME, getBattleFrame, loadBattleArt, renderBattleFrame } from "../src/battle-vfx.js";

test("battle sequences have unique ids and ordered, reachable beats", () => {
  assert.equal(new Set(BATTLE_CLIPS.map((clip) => clip.id)).size, 4);
  for (const clip of BATTLE_CLIPS) {
    assert.equal(clip.beats.length, clip.phases.length);
    assert.equal(clip.beats[0], 0);
    assert.ok(clip.impact > 0 && clip.impact < clip.duration);
    clip.beats.forEach((beat, i) => {
      assert.ok(beat < clip.duration);
      if (i) assert.ok(beat > clip.beats[i - 1]);
      assert.equal(getBattleFrame(clip.id, beat).phaseLabel, clip.phases[i]);
    });
    assert.equal(getBattleFrame(clip.id, clip.impact).impactAge, 0);
  }
});

test("battle timeline clamps seeks and rejects unknown animations", () => {
  const clip = BATTLE_CLIPS[0];
  assert.equal(getBattleFrame(clip.id, -5).time, 0);
  assert.equal(getBattleFrame(clip.id, NaN).time, 0);
  assert.equal(getBattleFrame(clip.id, Infinity).time, 0);
  assert.equal(getBattleFrame(clip.id, 500).time, clip.duration);
  assert.equal(getBattleFrame(clip.id, 500).progress, 1);
  assert.throws(() => getBattleFrame("unknown", 0), RangeError);
});

function recordingContext(width = BATTLE_FRAME.width) {
  const commands = [];
  const stack = [];
  const ctx = { canvas: { width, height: width * 9 / 16 }, globalAlpha: 1 };
  const record = (name, args) => {
    for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${name} must receive finite numbers`);
    commands.push([name, ...args]);
  };
  for (const method of ["setTransform", "translate", "rotate", "scale", "fillRect", "beginPath", "closePath", "moveTo", "lineTo", "stroke", "fill", "fillText", "strokeText", "drawImage", "ellipse"]) {
    ctx[method] = (...args) => record(method, args);
  }
  ctx.arc = (...args) => { assert.ok(args[2] >= 0); record("arc", args); };
  ctx.save = () => { stack.push(ctx.globalAlpha); record("save", []); };
  ctx.restore = () => { assert.ok(stack.length); ctx.globalAlpha = stack.pop(); record("restore", []); };
  for (const method of ["createRadialGradient", "createLinearGradient"]) {
    ctx[method] = (...args) => { record(method, args); return { addColorStop: (...stops) => record("addColorStop", stops) }; };
  }
  return { ctx, commands, stack };
}

const art = Object.fromEntries(["knight", "titan", "mage", "dragon", "guardian"].map((name) => [name, { name, naturalWidth: 500, naturalHeight: 750 }]));

for (const clip of BATTLE_CLIPS) {
  test(`${clip.id}: all frames are finite and canvas state is restored`, () => {
    for (let t = 0; t <= clip.duration + 0.05; t += 0.05) {
      const { ctx, stack } = recordingContext();
      renderBattleFrame(ctx, art, clip.id, t);
      assert.equal(stack.length, 0);
      assert.equal(ctx.globalAlpha, 1);
    }
  });
  test(`${clip.id}: a seek renders the exact same deterministic frame`, () => {
    const first = recordingContext();
    const second = recordingContext();
    renderBattleFrame(first.ctx, art, clip.id, clip.impact + 0.16);
    renderBattleFrame(second.ctx, art, clip.id, clip.impact + 0.16);
    assert.deepEqual(first.commands, second.commands);
    const { ctx, commands } = recordingContext(2560);
    renderBattleFrame(ctx, art, clip.id, clip.impact + 0.1, { reducedMotion: true });
    assert.deepEqual(commands[1], ["setTransform", 1.6, 0, 0, 1.6, 0, 0]);
    assert.ok(commands[2].slice(1).every((n) => n === 0), "reduced motion disables camera shake");
  });
}

test("battle art loads five existing local illustrations", async () => {
  const paths = [];
  const result = await loadBattleArt(() => ({
    set src(value) { paths.push(value); queueMicrotask(() => this.onload()); }
  }));
  assert.equal(Object.keys(result).length, 5);
  assert.ok(paths.every((path) => path.includes("/assets/monster-") && path.endsWith(".png")));
});

test("a failed illustration produces a readable loading error", async () => {
  await assert.rejects(loadBattleArt(() => ({
    set src(value) { queueMicrotask(() => this.onerror()); }
  })), /无法加载动画立绘/);
});

test("live scenes replace preview damage and summon names at render time", () => {
  for (const clip of BATTLE_CLIPS) {
    const { ctx, commands } = recordingContext();
    renderBattleFrame(ctx, art, clip.id, clip.id === "divine-arrival" ? 4 : clip.impact + 0.2, {
      damageText: "−650", impactLabel: "实际命中", summonTitle: "熔核巨像"
    });
    const text = commands.filter(([command]) => ["fillText", "strokeText"].includes(command)).map((entry) => entry[1]);
    assert.ok(!text.includes("−1,800") && !text.includes("−2,400") && !text.includes("苍穹始源龙"));
    assert.ok(text.includes(clip.id === "divine-arrival" ? "熔核巨像" : "−650"));
  }
});
