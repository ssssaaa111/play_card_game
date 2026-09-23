// A deterministic strike in board coordinates; the impact callback owns the rule commit.
export const STRIKE_TIMING = Object.freeze({ windup: 140, impact: 245, hold: 70, duration: 660 });
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const lerp = (a, b, p) => a + (b - a) * p;
const out = (p) => 1 - (1 - clamp(p)) ** 3;
const noise = (n) => { const x = Math.sin(n * 127.1 + 9.3) * 43758.5; return x - Math.floor(x); };
const COLORS = { fire: "#ff9b51", wind: "#8aeed8", light: "#ffda85", shadow: "#c7a4ff" };
const isCounter = (result) => [result?.impactLabel, result?.damageText].some((label) => ["反击", "守备反击"].includes(label));

export function strikeFrame(time, { heavy = false, reducedMotion = false } = {}) {
  const impact = reducedMotion ? 70 : STRIKE_TIMING.impact;
  const hold = reducedMotion ? 0 : STRIKE_TIMING.hold + (heavy ? 20 : 0);
  const duration = reducedMotion ? 330 : STRIKE_TIMING.duration + (heavy ? 90 : 0);
  const t = clamp(time, 0, duration);
  const phase = t < (reducedMotion ? impact : STRIKE_TIMING.windup) ? "windup"
    : t < impact ? "dash" : t < impact + hold ? "impact" : "recover";
  const flight = reducedMotion ? Number(t >= impact)
    : clamp((t - STRIKE_TIMING.windup) / (impact - STRIKE_TIMING.windup));
  // Restore the original explosive spacing. The held impact trail, rather than
  // a slow projectile, gives the eye time to read the source and destination.
  const travel = flight ** 3;
  return { time: t, impact, hold, duration, phase, age: Math.max(0, t - impact - hold) / 1000,
    landed: t >= impact, progress: t / duration, flight, travel, reducedMotion, heavy };
}

export function strikeGeometry(fromRect, toRect) {
  const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
  const to = { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 };
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  return { from, to, distance, ux: (to.x - from.x) / distance, uy: (to.y - from.y) / distance };
}

function stroke(ctx, points, color, width, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= clamp(alpha); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.stroke(); ctx.restore();
}

function cut(ctx, from, to, color, width, alpha) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const nx = -dy / length * width / 2, ny = dx / length * width / 2;
  ctx.save(); ctx.globalAlpha *= clamp(alpha); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(mx + nx, my + ny);
  ctx.lineTo(...to); ctx.lineTo(mx - nx, my - ny); ctx.fill(); ctx.restore();
}

function arrowHead(ctx, x, y, ux, uy, scale, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= clamp(alpha);
  for (const [size, fill] of [[1, color], [.65, "#fff8df"]]) {
    const length = 38 * scale * size, wing = 16 * scale * size;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x - ux * length - uy * wing, y - uy * length + ux * wing);
    ctx.lineTo(x - ux * length * .64, y - uy * length * .64);
    ctx.lineTo(x - ux * length + uy * wing, y - uy * length - ux * wing);
    ctx.fill();
  }
  ctx.restore();
}

function sprite(ctx, actor, dx, dy, opacity = 1, rotation = 0) {
  const { image, rect } = actor || {};
  if (!image?.naturalWidth || !rect || opacity <= 0) return;
  const h = Math.min(rect.height, rect.width * image.naturalHeight / image.naturalWidth);
  const w = h * image.naturalWidth / image.naturalHeight;
  ctx.save(); ctx.globalAlpha *= clamp(opacity);
  ctx.translate(rect.left + rect.width / 2 + dx, rect.top + rect.height / 2 + dy);
  ctx.rotate(rotation); ctx.drawImage(image, -w / 2, -h / 2, w, h); ctx.restore();
}

export function renderFieldStrike(ctx, scene, time) {
  const f = strikeFrame(time, scene);
  const { from, to, ux, uy, distance } = scene.geometry;
  const color = COLORS[scene.element] || COLORS.light;
  const scale = clamp((scene.targetRect.width || 100) / 100, .72, 1.8);
  const arrowScale = clamp((scene.sourceRect?.width || scene.targetRect.width || 100) / 110, .85, 1.25) * (scene.heavy ? 1.12 : 1);
  ctx.save();
  ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (!f.reducedMotion && !f.landed) {
    if (f.phase === "windup") {
      const p = f.time / STRIKE_TIMING.windup;
      // Three short strokes converge on the actual attacking card.
      for (let i = -1; i <= 1; i++) {
        const offset = i * 12 * scale;
        const length = lerp(40, 15, p) * scale;
        stroke(ctx, [[from.x - ux * length - uy * offset, from.y - uy * length + ux * offset],
          [from.x - ux * 9 - uy * offset * .3, from.y - uy * 9 + ux * offset * .3]], color, 2, p * .8);
      }
    } else {
      const p = f.flight;
      const travel = f.travel;
      const x = lerp(from.x, to.x, travel), y = lerp(from.y, to.y, travel);
      const tail = Math.min(distance * travel + 12 * arrowScale, Math.min(distance * .8, 280 * arrowScale) * (.3 + p * .7));
      for (const [width, alpha] of [[36,.14],[18,.5],[8,1]]) {
        stroke(ctx, [[x - ux * tail, y - uy * tail],[x,y]], color, width * arrowScale, alpha);
      }
      stroke(ctx, [[x - ux * tail * .9, y - uy * tail * .9],[x,y]], "#fff5d8", 3.2 * arrowScale);
      arrowHead(ctx, x, y, ux, uy, arrowScale, color);
    }
  }
  if (f.landed && scene.result) {
    const counter = isCounter(scene.result);
    const hit = counter ? from : to;
    const polarity = counter ? -1 : 1;
    const age = f.age;
    const power = scene.heavy ? 1.35 : 1;
    const fade = 1 - clamp(age / .3);
    const guard = ["守住", "守备反击"].includes(scene.result.damageText) || counter;
    if (!f.reducedMotion) {
      const trailFade = 1 - clamp(age / .16);
      for (const [width, alpha] of [[30,.14],[14,.5],[6,1]]) {
        stroke(ctx, [[from.x + ux * 20,from.y + uy * 20],[to.x,to.y]],
          color, width * arrowScale, trailFade * alpha);
      }
      stroke(ctx, [[from.x + ux * 20,from.y + uy * 20],[to.x,to.y]], "#fff5d8", 2.5 * arrowScale, trailFade);
      // Keep the arrow silhouette through contact; it used to vanish exactly
      // when the fast projectile became easiest to see.
      arrowHead(ctx, to.x, to.y, ux, uy, arrowScale, color, 1 - clamp(age / .09));
      const reach = (guard ? 42 : 78) * scale * power;
      const burst = 1 - clamp(age / .12);
      // Hold two crisp crossing cuts at the instant of contact.
      for (const [thickness, alpha] of [[22,.16],[9,.8],[3.5,1]]) {
        cut(ctx, [hit.x - reach,hit.y + reach * .6],[hit.x + reach,hit.y - reach * .6],
          "#fff5d9", thickness * scale, burst * alpha);
        cut(ctx, [hit.x - reach * .48,hit.y - reach * .7],[hit.x + reach * .48,hit.y + reach * .7],
          color, thickness * .7 * scale, burst * alpha);
      }
      ctx.save(); ctx.globalAlpha = burst;
      ctx.fillStyle = "#fff7e1"; ctx.beginPath(); ctx.arc(hit.x, hit.y, (5 + burst * 10) * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      for (let i = 0; i < (scene.heavy ? 32 : 20); i++) {
        const angle = noise(i) * Math.PI * 2;
        const speed = (150 + noise(i + 80) * 320) * scale * power;
        const radius = 22 * scale + speed * age;
        const x = hit.x + Math.cos(angle) * radius + ux * age * 35 * polarity;
        const y = hit.y + Math.sin(angle) * radius + age * age * 140;
        const tail = (7 + noise(i+3) * 13) * scale * fade;
        stroke(ctx, [[x - Math.cos(angle) * tail, y - Math.sin(angle) * tail],[x,y]],
          i % 3 ? color : "#fff5d9", (i % 4 ? 1.8 : 3.3) * scale, fade);
      }
      const destroyed = scene.destroyed || {};
      for (const [actor, broken, direction] of [[scene.sourceActor,destroyed.source,-1],[scene.targetActor,destroyed.target,1]]) {
        if (broken) {
          // The rule commit removes a defeated card immediately. Its captured
          // sprite must already be displaced on contact, not ease away later.
          const recoil = (22 + out(age / .1) * 22) * scale * direction;
          const remnant = 1 - clamp(age / .18);
          sprite(ctx, actor, ux * recoil, uy * recoil, remnant * .9, direction * (.07 + age * .2));
        }
      }
    }
    // Damage is local to the impact; LP HUD changes in the same callback.
    const label = scene.result.damageText;
    const x = clamp(hit.x, 58, scene.width - 58);
    const y = clamp(hit.y - 56 * scale - out(age / .09) * 8, 118, scene.height - 35);
    ctx.save(); ctx.globalAlpha = 1 - clamp((age - .2) / .16);
    ctx.textAlign = "center"; ctx.font = "900 " + Math.round(clamp(30 * scale, 24, 54)) + "px system-ui, sans-serif";
    ctx.lineWidth = 6; ctx.strokeStyle = "#080b12"; ctx.strokeText(label, x, y);
    ctx.fillStyle = scene.result.damage > 0 ? "#fff0b8" : "#a9f3e5"; ctx.fillText(label, x, y);
    ctx.restore();
  }
  ctx.restore();
  return f;
}

export function createFieldStrikeController({
  document: doc = globalThis.document, window: win = globalThis.window,
  root, onBusyChange = () => {}, renderFrame = renderFieldStrike
} = {}) {
  let active = null, paused = false, blocked = false;
  const supported = Boolean(root && win.requestAnimationFrame);
  const blocker = () => Boolean(doc.querySelector?.(".modal.show"));
  const observer = win.MutationObserver ? new win.MutationObserver(() => updateBlocker()) : null;

  function captureStyle(el) {
    const record = { el, translate: el.style.translate, rotate: el.style.rotate,
      filter: el.style.filter, transition: el.style.transition };
    // Card hover transitions must not ease away a one-frame impact flash.
    el.style.transition = "none";
    return record;
  }
  function restore(entry) {
    for (const record of entry.styles) {
      record.el.style.translate = record.translate;
      record.el.style.rotate = record.rotate;
      record.el.style.filter = record.filter;
      record.el.style.transition = record.transition;
    }
  }
  function stop(cancelled = false) {
    if (!active) return;
    const entry = active; active = null;
    win.cancelAnimationFrame(entry.raf); win.clearTimeout(entry.timer);
    restore(entry); entry.layer.remove(); onBusyChange(false);
    entry.resolve({ cancelled, landed: entry.landed, result: entry.scene.result });
  }
  function impact(entry) {
    if (entry.landed) return true;
    entry.landed = true;
    try {
      entry.scene.result = entry.onImpact();
      if (!entry.scene.result) { stop(true); return false; }
      entry.scene.destroyed = entry.scene.result.destroyed;
      for (const key of ["source", "target"]) {
        const next = entry[key === "source" ? "resolveSource" : "resolveTarget"]?.();
        if (next && next !== entry[key]) {
          entry.styles.push(captureStyle(next));
          entry[key] = next;
        }
      }
      entry.layer.dataset.damage = String(entry.scene.result.damage || 0);
      entry.layer.dataset.impact = "true";
      return true;
    } catch (error) {
      entry.reject(error);
      stop(true);
      return false;
    }
  }
  function frame(entry, now) {
    if (entry !== active || paused || blocked) return;
    const t = Math.min(entry.elapsed + now - entry.started, entry.duration);
    const f = strikeFrame(t, entry.scene);
    if (f.landed && !impact(entry)) return;
    entry.layer.dataset.phase = f.phase;
    const { ux, uy } = entry.scene.geometry;
    if (!entry.scene.reducedMotion) {
      const pull = f.phase === "windup" ? -14 * out(f.time / STRIKE_TIMING.windup)
        : f.phase === "dash" ? lerp(-14, 34, f.travel)
        : 34 * (1 - out(f.age / .1));
      entry.source.style.translate = (ux * pull) + "px " + (uy * pull) + "px";
      entry.source.style.rotate = (f.phase === "windup" ? -4 : 5 * (1 - out(f.age / .1))) + "deg";
      const counter = isCounter(entry.scene.result);
      const struck = counter ? entry.source : entry.target;
      if (f.landed && struck?.isConnected) {
        const kick = (entry.scene.heavy ? 30 : 22) * (counter ? -1 : 1);
        // Snap away, hold, then make one small settling movement. No slow drift.
        const recoil = f.phase === "impact" ? kick : kick * Math.exp(-f.age * 28) * Math.cos(f.age * 42);
        struck.style.translate = (ux * recoil) + "px " + (uy * recoil) + "px";
        struck.style.filter = f.phase === "impact" ? "brightness(2.2) contrast(1.2)" : "";
      }
    }
    try { renderFrame(entry.ctx, entry.scene, t); } catch {
      // Rendering errors must still commit a legal attack exactly once.
      impact(entry); stop(); return;
    }
    if (t >= entry.duration) stop();
    else entry.raf = win.requestAnimationFrame((time) => frame(entry,time));
  }
  function schedule(entry) {
    entry.started = win.performance.now();
    frame(entry,entry.started);
    if (entry !== active) return;
    entry.timer = win.setTimeout(() => {
      if (entry !== active || paused || blocked) return;
      frame(entry, entry.started + entry.duration - entry.elapsed);
    }, entry.duration - entry.elapsed + 100);
  }
  function freeze() {
    if (!active) return;
    active.elapsed += win.performance.now() - active.started;
    win.cancelAnimationFrame(active.raf); win.clearTimeout(active.timer);
  }
  function updateBlocker() {
    const next = blocker();
    if (next === blocked) return;
    if (!paused && !blocked) freeze();
    blocked = next;
    if (active) {
      active.layer.hidden = blocked;
      if (!paused && !blocked) schedule(active);
    }
  }
  observer?.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  return {
    supported,
    reset() { stop(true); paused = false; },
    setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      if (!paused && !blocked) freeze();
      paused = next;
      if (active && !paused && !blocked) schedule(active);
    },
    play({ source, target, attacker, defender, onImpact, resolveSource, resolveTarget }) {
      if (!supported || !source || !target) {
        return Promise.resolve({ cancelled: false, landed: true, result: onImpact() });
      }
      stop(true);
      const sourceRect = source.getBoundingClientRect(), targetRect = target.getBoundingClientRect();
      const actor = (el) => { const image = el.querySelector?.(".monster-sprite"); return image ? { image, rect: image.getBoundingClientRect() } : null; };
      const layer = doc.createElement("div");
      layer.className = "field-strike"; layer.setAttribute("aria-hidden","true");
      layer.dataset.cardId = attacker.id; layer.dataset.targetId = defender?.id || "direct";
      layer.dataset.phase = "windup"; layer.dataset.impact = "false";
      const canvas = doc.createElement("canvas");
      const dpr = Math.min(win.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(win.innerWidth * dpr); canvas.height = Math.round(win.innerHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve({ cancelled: false, landed: true, result: onImpact() });
      layer.append(canvas); root.appendChild(layer);
      const scene = {
        geometry: strikeGeometry(sourceRect,targetRect), sourceRect,targetRect,
        sourceActor: actor(source), targetActor: actor(target),
        width: win.innerWidth, height: win.innerHeight, dpr,
        element: attacker.element, heavy: attacker.stars >= 5,
        reducedMotion: Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
        result: null
      };
      return new Promise((resolve,reject) => {
        active = { scene,layer,ctx,source,target,onImpact,resolveSource,resolveTarget,resolve,reject,landed:false,
          elapsed:0, started:win.performance.now(), timer:0, raf:0,
          duration:strikeFrame(0,scene).duration,
          styles:[source,target].map(captureStyle)
        };
        onBusyChange(true); blocked = blocker(); layer.hidden = blocked;
        if (!paused && !blocked) schedule(active);
      });
    },
    dispose() { stop(true); observer?.disconnect(); }
  };
}
