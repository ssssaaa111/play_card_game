// Deterministic, seekable Canvas sequences shared by preview and live combat.
export const BATTLE_FRAME = Object.freeze({ width: 1600, height: 900 });
export const BATTLE_CLIPS = Object.freeze([
  { id: "solar-slash", title: "日冕斩击", subtitle: "SOLAR CRESCENT", type: "高速斩击", color: "#f5cd85", duration: 4, impact: 1.42, art: "knight", description: "压低重心、瞬身突进，金色弧光掠过后留下剑痕。", phases: ["蓄势", "突进", "命中", "收势"], beats: [0, 1.04, 1.42, 2.35] },
  { id: "rift-impact", title: "裂阵重击", subtitle: "RIFT BREAKER", type: "重击破防", color: "#ffa575", duration: 4.6, impact: 1.7, art: "titan", description: "熔岩巨像腾起重落，冲击波沿地面扩散，碎岩抛起。", phases: ["蓄力", "跃起", "破阵", "余震"], beats: [0, 0.95, 1.7, 2.65] },
  { id: "astral-burst", title: "星芒爆裂", subtitle: "ASTRAL NOVA", type: "魔法爆发", color: "#9ee9f5", duration: 4.6, impact: 1.85, art: "mage", description: "旋转星阵汇聚能量，光弹出膛，命中后展开星环。", phases: ["结阵", "发射", "爆裂", "星尘"], beats: [0, 1.3, 1.85, 2.7] },
  { id: "divine-arrival", title: "神格降临", subtitle: "CELESTIAL AWAKENING", type: "王牌登场", color: "#dac3ff", duration: 5.6, impact: 2.4, art: "dragon", description: "星门展开、光柱升起，苍穹巨龙从法阵中浮现。", phases: ["共鸣", "开门", "降临", "定格"], beats: [0, 1.15, 2.4, 3.7] }
]);

const ART_FILES = Object.freeze({ knight: "monster-solar-knight.png", titan: "monster-flare-titan.png", mage: "monster-gale-mage.png", dragon: "monster-celestial-origin-dragon.png", guardian: "monster-iron-guardian.png" });
const TAU = Math.PI * 2;
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const progress = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (n) => n * n * (3 - 2 * n);
const easeOut = (n) => 1 - (1 - n) ** 3;
const mix = (a, b, n) => a + (b - a) * n;
const noise = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const envelope = (t, a, b, c) => progress(t, a, b) * (1 - progress(t, b, c));

export function getBattleFrame(clipId, time) {
  const clip = BATTLE_CLIPS.find((entry) => entry.id === clipId);
  if (!clip) throw new RangeError(`Unknown battle animation: ${clipId}`);
  const t = clamp(Number.isFinite(time) ? time : 0, 0, clip.duration);
  const phase = clip.beats.reduce((index, beat, next) => t >= beat ? next : index, 0);
  return { clip, time: t, progress: t / clip.duration, phase, phaseLabel: clip.phases[phase], impactAge: t - clip.impact };
}

export async function loadBattleArt(createImage = () => new Image()) {
  return Object.fromEntries(await Promise.all(Object.entries(ART_FILES).map(([key, file]) => new Promise((resolve, reject) => {
    const img = createImage();
    img.onload = () => resolve([key, img]);
    img.onerror = () => reject(new Error(`无法加载动画立绘：${file}`));
    img.src = new URL(`../assets/${file}`, import.meta.url).href;
  }))));
}

function line(ctx, points, color, width = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.restore();
}

function glow(ctx, x, y, radius, color, alpha = 1) {
  if (radius <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha *= clamp(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function ring(ctx, x, y, r, color, alpha = 1, squash = 1, rotation = 0, runes = false) {
  if (r <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  ctx.rotate(rotation);
  ctx.globalAlpha *= clamp(alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  if (runes) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.89, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 24);
      line(ctx, [[0, -r * 0.93], [0, -r * 0.98]], color, i % 3 === 0 ? 3 : 1);
      ctx.restore();
    }
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const b = a + TAU / 3;
      line(ctx, [[Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78], [Math.cos(b) * r * 0.78, Math.sin(b) * r * 0.78]], color, 1, 0.45);
    }
  }
  ctx.restore();
}

function star(ctx, x, y, size, color, alpha = 1) {
  line(ctx, [[x - size, y], [x + size, y]], color, 1.5, alpha);
  line(ctx, [[x, y - size], [x, y + size]], color, 1.5, alpha);
  glow(ctx, x, y, size * 2, color, alpha * 0.4);
}

function arena(ctx, t, color) {
  const bg = ctx.createLinearGradient(0, 0, 0, 900);
  bg.addColorStop(0, "#080c16");
  bg.addColorStop(0.6, "#142130");
  bg.addColorStop(1, "#080c12");
  ctx.fillStyle = bg;
  ctx.fillRect(-40, -40, 1680, 980);
  glow(ctx, 800, 520, 600, "#254458", 0.24);
  glow(ctx, 800, 740, 520, color, 0.08);
  ring(ctx, 800, 330, 241, "#a0b9c8", 0.07);
  ring(ctx, 800, 330, 254, "#a0b9c8", 0.035);
  for (let i = 0; i < 90; i++) {
    const x = noise(i + 1) * 1600;
    const y = noise(i + 130) * 670;
    const a = (0.15 + noise(i + 430) * 0.5) * (0.8 + Math.sin(t * 0.6 + i) * 0.2);
    ctx.fillStyle = `rgba(184,210,228,${a})`;
    ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }
  // Broken monolith silhouettes frame the action without competing with it.
  for (const [x, y, w, h] of [[60, 385, 40, 290], [170, 430, 24, 200], [1435, 340, 50, 320], [1360, 458, 24, 190]]) {
    ctx.fillStyle = "#0a111b";
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + 6, y + 12);
    ctx.lineTo(x + w - 8, y);
    ctx.lineTo(x + w, y + h);
    ctx.fill();
    line(ctx, [[x + w - 8, y], [x + w, y + h]], "#5d7887", 1, 0.16);
  }
  for (let i = -6; i <= 6; i++) line(ctx, [[800 + i * 35, 625], [800 + i * 225, 920]], "#89a1af", 1, 0.055);
  for (const y of [652, 706, 802, 895]) line(ctx, [[0, y], [1600, y]], "#89a1af", 1, 0.05);
  ring(ctx, 800, 741, 610, "#718b9e", 0.16, 0.19);
  ring(ctx, 800, 741, 565, "#718b9e", 0.08, 0.19);
  const fog = ctx.createLinearGradient(0, 605, 0, 900);
  fog.addColorStop(0, "transparent");
  fog.addColorStop(1, "#080c12");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 605, 1600, 295);
}

function actor(ctx, art, x, foot, height, { opacity = 1, angle = 0, squash = 1, aura, auraPower = 0 } = {}) {
  if (!art || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(opacity);
  ctx.fillStyle = "#02050a";
  ctx.beginPath();
  ctx.ellipse(x, 754, height * 0.26, 19, 0, 0, TAU);
  ctx.fill();
  if (aura) glow(ctx, x, foot - height * 0.47, height * 0.58, aura, auraPower);
  ctx.translate(x, foot);
  ctx.rotate(angle);
  ctx.scale(1, squash);
  const width = height * art.naturalWidth / art.naturalHeight;
  ctx.drawImage(art, -width / 2, -height, width, height);
  ctx.restore();
}

function sparks(ctx, x, y, age, color, count = 55, power = 1, gravity = 150) {
  if (age < 0 || age > 2.1) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i++) {
    const life = 0.45 + noise(i + 95) * 1.45;
    if (age > life) continue;
    const a = noise(i + 14) * TAU;
    const v = (70 + noise(i + 82) * 390) * power;
    const px = x + Math.cos(a) * v * age;
    const py = y + Math.sin(a) * v * age + gravity * age * age;
    const tail = Math.min(age, 0.035 + noise(i + 20) * 0.025);
    line(ctx, [[px - Math.cos(a) * v * tail, py - (Math.sin(a) * v + gravity * age * 2) * tail], [px, py]], i % 4 === 0 ? "#fff4df" : color, 1 + noise(i + 90) * 2, (1 - age / life) ** 0.7);
  }
  ctx.restore();
}

function shock(ctx, x, y, age, color, power = 1, squash = 1) {
  if (age < 0 || age > 1.25) return;
  const p = easeOut(clamp(age / 1.25));
  ring(ctx, x, y, 15 + p * 310 * power, color, (1 - p) * 0.95, squash);
  ring(ctx, x, y, 10 + p * 250 * power, color, (1 - p) * 0.45, squash);
  glow(ctx, x, y, 50 + p * 210, color, (1 - p) * 0.9);
}

function damage(ctx, text, x, y, age, color, label = "命 中") {
  if (age < 0 || age > 1.65) return;
  const opacity = progress(age, 0, 0.12) * (1 - progress(age, 1.05, 1.65));
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.translate(x, y - easeOut(clamp(age / 1.65)) * 45);
  const scale = 1 + (1 - progress(age, 0, 0.16)) * 0.22;
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(label, 0, -45);
  ctx.font = "700 54px system-ui, sans-serif";
  ctx.strokeStyle = "#10151e";
  ctx.lineWidth = 7;
  ctx.strokeText(text, 0, 12);
  ctx.fillStyle = "#fff4dd";
  ctx.fillText(text, 0, 12);
  ctx.restore();
}

function slash(ctx, age, color) {
  if (age < 0 || age > 1.15) return;
  const p = easeOut(progress(age, 0, 0.32));
  const fade = 1 - progress(age, 0.3, 1.15);
  ctx.save();
  ctx.translate(1030, 465);
  ctx.rotate(-0.56);
  ctx.scale(0.66, 1);
  ctx.globalAlpha *= fade;
  for (const [width, alpha, stroke] of [[55, 0.08, color], [27, 0.22, color], [10, 0.9, color], [3, 1, "#fff9e7"]]) {
    ctx.beginPath();
    ctx.arc(0, 0, 282, -2.1, -2.1 + p * 4.8);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.globalAlpha = fade * alpha;
    ctx.stroke();
  }
  ctx.restore();
}

function solar(ctx, art, frame) {
  const t = frame.time;
  const age = frame.impactAge;
  const c = frame.clip.color;
  const dash = easeOut(progress(t, 1.04, 1.42));
  const retreat = smooth(progress(t, 2.4, 3.4));
  const x = mix(475 - smooth(progress(t, 0.2, 1.02)) * 45, 905, dash) - retreat * 430;
  const recoil = age >= 0 ? Math.sin(clamp(age / 0.75) * Math.PI) * 65 : 0;
  actor(ctx, art.guardian, 1120 + recoil, 746, 442, { angle: recoil * 0.001, aura: c, auraPower: age >= 0 ? Math.max(0, 0.45 - age) : 0 });
  if (t > 1.04 && t < 1.7) {
    const fade = 1 - progress(t, 1.42, 1.7);
    for (let i = 4; i > 0; i--) actor(ctx, art.knight, x - i * 76, 746, 460, { opacity: (0.13 - i * 0.02) * fade, angle: 0.14 });
    for (let i = 0; i < 14; i++) line(ctx, [[x - 400 - noise(i) * 200, 360 + i * 25], [x - 120, 360 + i * 25]], c, i % 4 === 0 ? 2 : 1, 0.18 * fade);
  }
  actor(ctx, art.knight, x, 746, 460, { angle: dash * (1 - retreat) * 0.12, squash: 1 - envelope(t, 0.2, 1, 1.25) * 0.04, aura: c, auraPower: envelope(t, 0.15, 1.1, 1.5) * 0.2 });
  glow(ctx, x - 90, 580, 130, c, envelope(t, 0.3, 1, 1.4) * 0.8);
  slash(ctx, age, c);
  shock(ctx, 1090, 455, age, c, 0.65);
  sparks(ctx, 1070, 475, age, c, 75, 1.25);
  damage(ctx, frame.damageText ?? "−1,800", 1130, 272, age, c, frame.impactLabel);
}

function rubble(ctx, age, color) {
  if (age < 0 || age > 2.5) return;
  const fade = 1 - progress(age, 1.4, 2.5);
  for (let i = 0; i < 28; i++) {
    const vx = (noise(i + 85) - 0.5) * 720;
    const vy = -180 - noise(i + 50) * 460;
    const x = 960 + vx * age;
    const y = 744 + vy * age + 350 * age * age;
    if (y > 770) continue;
    const r = 3 + noise(i + 55) * 11;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(age * (i % 2 ? 3 : -4));
    ctx.globalAlpha *= fade;
    ctx.fillStyle = "#302827";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.5);
    ctx.lineTo(r * 0.4, -r);
    ctx.lineTo(r, r * 0.5);
    ctx.lineTo(-r * 0.6, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function rift(ctx, art, frame) {
  const t = frame.time;
  const age = frame.impactAge;
  const c = frame.clip.color;
  const jump = progress(t, 0.95, 1.7);
  const retreat = smooth(progress(t, 3, 4.1));
  const x = mix(480, 880, smooth(jump)) - retreat * 400;
  const y = 756 - Math.sin(jump * Math.PI) * 165;
  const recoil = age >= 0 ? Math.sin(clamp(age / 1.05) * Math.PI) : 0;
  const charge = envelope(t, 0.1, 0.9, 1.6);
  glow(ctx, x, 720, 260, c, charge * 0.35);
  ring(ctx, x, 750, 160 + charge * 70, c, charge * 0.5, 0.22, t, true);
  if (age > 0) {
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9;
      const r = easeOut(progress(age, 0, 0.4)) * (190 + noise(i) * 290);
      line(ctx, [[960, 750], [960 + Math.cos(a + 0.15) * r * 0.4, 750 + Math.sin(a + 0.15) * r * 0.14], [960 + Math.cos(a) * r, 750 + Math.sin(a) * r * 0.32]], c, 2, (1 - progress(age, 0.5, 2.4)) * 0.65);
    }
  }
  actor(ctx, art.guardian, 1130 + recoil * 100, 750 - recoil * 40, 440, { angle: recoil * 0.17 });
  actor(ctx, art.titan, x, y, 492, { squash: 1 - charge * 0.065 - (age >= 0 ? (1 - progress(age, 0, 0.23)) * 0.07 : 0), aura: c, auraPower: charge * 0.3 });
  shock(ctx, 970, 745, age, c, 1.7, 0.26);
  shock(ctx, 970, 745, age - 0.13, c, 1.2, 0.34);
  glow(ctx, 970, 715, 250, c, age >= 0 ? (1 - progress(age, 0, 0.6)) * 0.65 : 0);
  sparks(ctx, 970, 719, age, c, 80, 1.05, 260);
  rubble(ctx, age, c);
  damage(ctx, frame.damageText ?? "破防", 1165, 260, age, c, frame.impactLabel);
}

function astral(ctx, art, frame) {
  const t = frame.time;
  const age = frame.impactAge;
  const c = frame.clip.color;
  const charge = smooth(progress(t, 0.1, 1.3));
  const fade = 1 - progress(t, 1.3, 1.75);
  const recoil = age >= 0 ? Math.sin(clamp(age / 0.9) * Math.PI) : 0;
  actor(ctx, art.guardian, 1130 + recoil * 55, 750, 443, { angle: recoil * 0.08 });
  ring(ctx, 476, 750, 195, c, charge * (1 - progress(t, 2.5, 3.8)) * 0.5, 0.23, t * 0.15, true);
  actor(ctx, art.mage, 470, 739 - Math.sin(progress(t, 0, 4.6) * Math.PI) * 18, 454, { aura: c, auraPower: charge * fade * 0.25 });
  ring(ctx, 676, 433, 108 * charge, c, fade * 0.9, 1, t * 0.6, true);
  ring(ctx, 676, 433, 126 * charge, "#ccbcff", fade * 0.45, 1, -t * 0.4, true);
  glow(ctx, 676, 433, 140 * charge, c, fade * 0.8);
  for (let i = 0; i < 28; i++) {
    const a = i * TAU / 28 + t * 0.8;
    const r = 30 + ((noise(i) * 160 - t * 100) % 160 + 160) % 160;
    star(ctx, 676 + Math.cos(a) * r, 433 + Math.sin(a) * r, 2, c, charge * fade * 0.6);
  }
  if (t >= 1.3 && age < 0.1) {
    const p = progress(t, 1.3, 1.85);
    const x = mix(676, 1110, p * p);
    const opacity = 1 - progress(age, 0, 0.1);
    for (let i = 0; i < 14; i++) glow(ctx, x - i * 14, 433 + Math.sin(i * 0.5 + t * 8) * 5, 50 - i * 2.4, c, (1 - i / 14) * opacity * 0.5);
    glow(ctx, x, 433, 60, "#d4faff", opacity);
    star(ctx, x, 433, 35, "#efffff", opacity);
  }
  shock(ctx, 1110, 433, age, c, 1.15);
  shock(ctx, 1110, 433, age - 0.14, "#ba9dff", 0.9);
  sparks(ctx, 1110, 433, age, c, 90, 1.3, 35);
  if (age >= 0 && age < 1.3) {
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + 0.2;
      const r = 90 + easeOut(progress(age, 0, 0.65)) * 180;
      star(ctx, 1110 + Math.cos(a) * r, 433 + Math.sin(a) * r, 13 * (1 - progress(age, 0.1, 1.3)), c, 1 - progress(age, 0.3, 1.3));
    }
  }
  damage(ctx, frame.damageText ?? "−2,400", 1150, 270, age, c, frame.impactLabel);
}

function divine(ctx, art, frame) {
  const t = frame.time;
  const c = frame.clip.color;
  const opening = easeOut(progress(t, 0.25, 2));
  const arrival = smooth(progress(t, 1.7, 3));
  const pulse = envelope(t, 1.2, 2.4, 3.6);
  glow(ctx, 800, 435, 480 * opening, "#7971cb", 0.38 + pulse * 0.2);
  ring(ctx, 800, 431, 290 * opening, c, opening * 0.65, 1, t * 0.12, true);
  ring(ctx, 800, 431, 324 * opening, "#f5cd85", opening * 0.4, 1, -t * 0.08, true);
  ring(ctx, 800, 431, 337 * opening, c, opening * 0.2);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 - t * 0.06;
    const inner = 338 * opening;
    line(ctx, [[800 + Math.cos(a) * inner, 431 + Math.sin(a) * inner], [800 + Math.cos(a) * (inner + 18), 431 + Math.sin(a) * (inner + 18)]], "#f5cd85", 2, opening * 0.6);
  }
  if (pulse > 0) {
    const beam = ctx.createLinearGradient(0, 60, 0, 770);
    beam.addColorStop(0, "transparent");
    beam.addColorStop(0.65, "#aca2ee");
    beam.addColorStop(1, "#cfeeff");
    ctx.save();
    ctx.globalAlpha = pulse * 0.16;
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(580 - pulse * 65, 50);
    ctx.lineTo(1020 + pulse * 65, 50);
    ctx.lineTo(945, 751);
    ctx.lineTo(655, 751);
    ctx.fill();
    ctx.restore();
  }
  ring(ctx, 800, 756, 365 * opening, c, opening * 0.7, 0.22, t * 0.25, true);
  ring(ctx, 800, 756, 405 * opening, "#f5cd85", opening * 0.35, 0.22, -t * 0.12, true);
  actor(ctx, art.dragon, 800, 780 - arrival * 70 + Math.sin(t * 1.6) * arrival * 5, 560 * (0.75 + arrival * 0.25), { opacity: arrival, aura: "#92baf6", auraPower: 0.16 });
  shock(ctx, 800, 670, frame.impactAge, c, 1.4, 0.38);
  for (let i = 0; i < 62; i++) {
    const speed = 35 + noise(i + 2) * 95;
    const x = 440 + noise(i + 35) * 720;
    const y = 770 - ((noise(i + 75) * 680 + t * speed) % 680);
    const alpha = opening * Math.sin((770 - y) / 680 * Math.PI) * 0.75;
    if (i % 6 === 0) star(ctx, x, y, 5, c, alpha);
    else line(ctx, [[x, y], [x, y + 4 + noise(i) * 7]], i % 3 ? c : "#f5cd85", 1.5, alpha);
  }
  const titleAlpha = smooth(progress(t, 3, 3.8));
  ctx.save();
  ctx.globalAlpha = titleAlpha;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ebdcba";
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillText("✧   传 说 · 王牌召唤   ✧", 800, 802);
  ctx.font = "500 32px system-ui, sans-serif";
  ctx.fillStyle = "#f2eee6";
  ctx.fillText(frame.summonTitle ?? "苍穹始源龙", 800, 845);
  ctx.restore();
}

const SCENES = { "solar-slash": solar, "rift-impact": rift, "astral-burst": astral, "divine-arrival": divine };

/** Render any frame, in seconds. No timers, audio, or random mutable particles. */
export function renderBattleFrame(ctx, art, clipId, time, { reducedMotion = false, damageText, impactLabel, summonTitle } = {}) {
  const frame = { ...getBattleFrame(clipId, time), damageText, impactLabel, summonTitle };
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(width / BATTLE_FRAME.width, 0, 0, height / BATTLE_FRAME.height, 0, 0);
  const age = frame.impactAge;
  const shake = !reducedMotion && age >= 0 && age < 0.38 ? (1 - age / 0.38) ** 2 * (clipId === "rift-impact" ? 10 : 5) : 0;
  ctx.translate(Math.sin(age * 91) * shake, Math.cos(age * 73) * shake * 0.55);
  arena(ctx, frame.time, frame.clip.color);
  SCENES[clipId](ctx, art, frame);
  ctx.restore();
  return frame;
}
