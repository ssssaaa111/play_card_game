import { BATTLE_CLIPS, renderBattleFrame } from "./battle-vfx.js";
import { battleDamageAmount } from "./effect-feedback.js";

const OUTCOME_LABELS = {
  direct: "直接攻击", attackWin: "击破", breakDefense: "破防",
  pierceDefense: "神格贯穿", countered: "反击", guardCounter: "守备反击",
  guardHold: "守住", clash: "相杀"
};

/** Presentation comes only from completed engine events, never the prediction. */
export function battlePresentation({ attacker, target, owner, rival, events = [] }) {
  const resolved = events.findLast((event) => event.type === "BATTLE_RESOLVED");
  if (!resolved || !attacker) return null;
  const outcome = resolved.outcome || {};
  const counter = ["countered", "guardCounter"].includes(outcome.kind);
  const source = counter ? target : attacker;
  const recipient = counter ? attacker : target;
  const recipientOwner = counter ? owner : rival;
  const amount = battleDamageAmount(events, { playerId: recipientOwner });
  const heavy = ["breakDefense", "pierceDefense"].includes(outcome.kind) || source?.stars >= 5;
  const clipId = heavy ? "rift-impact" : "solar-slash";
  const label = OUTCOME_LABELS[outcome.kind] || "命中";
  return {
    kind: "attack", clipId, source, target: recipient,
    sourceOwner: counter ? rival : owner, targetOwner: recipientOwner,
    damage: amount, damageText: amount > 0 ? "−" + amount.toLocaleString("en-US") : label,
    impactLabel: amount > 0 ? label : "战斗结算",
    duration: heavy ? 1300 : 1050,
    title: (source?.name || attacker.name) + " · " + label
  };
}

export function spellPresentation({ card, owner, events = [] }) {
  const hits = events.filter((event) => event.type === "DAMAGE_DEALT" && event.amount > 0);
  if (!hits.length) return null;
  const targetOwner = hits[0].playerId;
  const amount = hits.filter((event) => event.playerId === targetOwner)
    .reduce((sum, event) => sum + event.amount, 0);
  return {
    kind: "spell", clipId: "astral-burst", sourceOwner: owner, targetOwner,
    damage: amount, damageText: "−" + amount.toLocaleString("en-US"),
    impactLabel: card.name, duration: 1200, title: card.name + " · 效果命中"
  };
}

/** Owns one transient layer. No rules, audio, saved state or gameplay timers. */
export function createLiveBattleVfx({
  document: doc = globalThis.document, window: win = globalThis.window,
  root, assetForCard = () => "", renderFrame = renderBattleFrame
} = {}) {
  const cache = new Map();
  let active = null;
  let serial = 0;
  let paused = false;
  let userPaused = false;
  let blocked = false;
  const reduced = () => Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const supported = Boolean(root && win.requestAnimationFrame && win.Image);

  function finish(cancelled = false) {
    if (!active) return;
    const entry = active;
    active = null;
    win.cancelAnimationFrame(entry.raf);
    win.clearTimeout(entry.timer);
    entry.layer.remove();
    entry.resolve({ played: true, cancelled });
  }

  function reset() {
    serial++;
    finish(true);
    paused = false;
  }

  function load(src) {
    if (!src) return Promise.resolve(null);
    if (!cache.has(src)) {
      cache.set(src, new Promise((resolve) => {
        const img = new win.Image();
        let timer;
        const settle = (value) => {
          win.clearTimeout(timer);
          img.onload = img.onerror = null;
          if (!value) cache.delete(src);
          resolve(value);
        };
        img.onload = () => settle(img);
        img.onerror = () => settle(null);
        timer = win.setTimeout(() => settle(null), 700);
        img.src = src;
      }));
    }
    return cache.get(src);
  }

  const portrait = (owner) => "assets/duelist-" + (owner === "ai" ? "ai" : "player") + ".png";

  function paint(entry, now) {
    if (entry !== active || paused) return;
    const elapsed = entry.elapsed + now - entry.started;
    const progress = Math.min(1, elapsed / entry.duration);
    const time = entry.gentle ? entry.clip.impact + 0.18 : entry.clip.duration * progress;
    entry.layer.style.opacity = String(Math.min(1, progress * 12 + 0.1, (1 - progress) * 8));
    try {
      renderFrame(entry.ctx, entry.art, entry.clip.id, time, {
        reducedMotion: entry.gentle, damageText: entry.presentation.damageText,
        impactLabel: entry.presentation.impactLabel,
        summonTitle: entry.presentation.source?.name
      });
    } catch {
      finish();
      return;
    }
    if (progress >= 1) finish();
    else entry.raf = win.requestAnimationFrame((time) => paint(entry, time));
  }

  function schedule(entry) {
    entry.started = win.performance.now();
    paint(entry, entry.started);
    if (entry === active) {
      entry.timer = win.setTimeout(() => finish(), Math.max(0, entry.duration - entry.elapsed) + 80);
    }
  }

  function setPaused(value) {
    if (paused === Boolean(value)) return;
    paused = Boolean(value);
    if (!active) return;
    if (paused) {
      active.elapsed += win.performance.now() - active.started;
      win.cancelAnimationFrame(active.raf);
      win.clearTimeout(active.timer);
    } else schedule(active);
  }

  function syncBlocker() {
    blocked = Boolean(doc.querySelector?.(".modal.show, .field-strike"));
    if (active) active.layer.hidden = blocked;
    setPaused(userPaused || blocked);
  }
  const blockerObserver = win.MutationObserver ? new win.MutationObserver(syncBlocker) : null;
  blockerObserver?.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

  async function play(presentation) {
    if (!presentation || !supported) return { played: false, cancelled: false };
    const token = ++serial;
    finish(true);
    const sourceUrl = presentation.source ? assetForCard(presentation.source) : portrait(presentation.sourceOwner);
    const targetUrl = presentation.target ? assetForCard(presentation.target) : portrait(presentation.targetOwner);
    const [source, target] = await Promise.all([
      load(sourceUrl), presentation.kind === "summon" ? Promise.resolve(null) : load(targetUrl)
    ]);
    if (token !== serial) return { played: false, cancelled: true };
    if (!source || (presentation.kind !== "summon" && !target)) return { played: false, cancelled: false };
    const layer = doc.createElement("div");
    layer.className = "live-battle-vfx " + presentation.kind;
    layer.setAttribute("aria-hidden", "true");
    layer.dataset.kind = presentation.kind;
    layer.dataset.clip = presentation.clipId;
    layer.dataset.cardId = presentation.source?.id || "";
    layer.dataset.targetId = presentation.target?.id || presentation.targetOwner || "";
    layer.dataset.damage = String(presentation.damage || 0);
    const canvas = doc.createElement("canvas");
    canvas.width = Math.min(1600, Math.max(640, Math.round(win.innerWidth * Math.min(win.devicePixelRatio || 1, 1.5))));
    canvas.height = Math.round(canvas.width * 9 / 16);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return { played: false, cancelled: false };
    const caption = doc.createElement("div");
    caption.className = "live-battle-vfx-caption";
    caption.textContent = presentation.title;
    layer.append(canvas, caption);
    root.appendChild(layer);
    const clip = BATTLE_CLIPS.find((clip) => clip.id === presentation.clipId);
    const gentle = reduced();
    return new Promise((resolve) => {
      active = {
        layer, ctx, clip, presentation, gentle, resolve,
        art: { [clip.art]: source, guardian: target },
        duration: gentle ? (presentation.kind === "summon" ? 650 : 450) : presentation.duration,
        elapsed: 0, started: win.performance.now(), raf: 0, timer: 0
      };
      blocked = Boolean(doc.querySelector?.(".modal.show, .field-strike"));
      paused = userPaused || blocked;
      layer.hidden = blocked;
      if (!paused) schedule(active);
      else {
        renderFrame(ctx, active.art, clip.id, clip.impact + 0.18, {
          reducedMotion: true, damageText: presentation.damageText,
          impactLabel: presentation.impactLabel, summonTitle: presentation.source?.name
        });
      }
    });
  }

  const onVisibility = () => { if (doc.hidden) { serial++; finish(); } };
  doc.addEventListener("visibilitychange", onVisibility);
  return {
    supported,
    reset() { reset(); userPaused = false; },
    setPaused(value) { userPaused = Boolean(value); syncBlocker(); },
    playAttack: (input) => play(battlePresentation(input)),
    playSpell: (input) => play(spellPresentation(input)),
    playSummon: (card, owner) => play({
      kind: "summon", clipId: "divine-arrival", source: card, sourceOwner: owner,
      duration: 1900, title: card.name + " · 王牌降临"
    }),
    dispose() { reset(); blockerObserver?.disconnect(); doc.removeEventListener("visibilitychange", onVisibility); }
  };
}
