import { BATTLE_CLIPS, BATTLE_FRAME, loadBattleArt, renderBattleFrame } from "../src/battle-vfx.js";

const $ = (id) => document.getElementById(id);
const canvas = $("battle-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { clip: BATTLE_CLIPS[0], time: 0, playing: !reducedMotion, speed: 1, art: null, last: 0, raf: 0, exporting: false, downloadUrl: null };
const posters = { knight: "solar-knight", titan: "flare-titan", mage: "gale-mage", dragon: "celestial-origin-dragon" };
$("gentle").checked = reducedMotion;

function paint() {
  if (!state.art) return;
  const frame = renderBattleFrame(ctx, state.art, state.clip.id, state.time, { reducedMotion: $("gentle").checked });
  $("seek").value = String(state.time);
  $("seek").setAttribute("aria-valuetext", `${state.time.toFixed(2)} 秒，${frame.phaseLabel}`);
  $("time").textContent = `${state.time.toFixed(2)} / ${state.clip.duration.toFixed(2)}s`;
  $("play").textContent = state.playing ? "暂停" : "播放";
  $("play").setAttribute("aria-label", state.playing ? "暂停动画" : "播放动画");
  $("beats").querySelectorAll("button").forEach((button, i) => {
    if (frame.phase === i) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function tick(now) {
  state.raf = 0;
  if (!state.playing || document.hidden || !state.art) return;
  if (state.last) state.time += Math.min((now - state.last) / 1000, 0.1) * state.speed;
  state.last = now;
  if (state.time >= state.clip.duration) {
    state.time = state.clip.duration;
    state.playing = false;
  }
  paint();
  if (state.playing) state.raf = requestAnimationFrame(tick);
}

function schedule() {
  cancelAnimationFrame(state.raf);
  state.last = 0;
  paint();
  if (state.playing && !document.hidden) state.raf = requestAnimationFrame(tick);
}

function selectClip(clip) {
  if (state.exporting) return;
  state.clip = clip;
  state.time = 0;
  state.playing = Boolean(state.art);
  document.documentElement.style.setProperty("--accent", clip.color);
  $("clip-title").textContent = clip.title;
  $("clip-subtitle").textContent = clip.subtitle;
  $("clip-type").textContent = clip.type;
  $("clip-index").textContent = `0${BATTLE_CLIPS.indexOf(clip) + 1} / 04`;
  canvas.setAttribute("aria-label", `${clip.title}战斗动画`);
  $("description").textContent = clip.description;
  $("seek").max = String(clip.duration);
  $("beats").replaceChildren(...clip.phases.map((phase, i) => {
    const button = document.createElement("button");
    button.className = "beat";
    const number = document.createElement("span");
    number.textContent = `0${i + 1}`;
    button.append(number, phase);
    button.title = `跳至${phase} · ${clip.beats[i].toFixed(2)}s`;
    button.addEventListener("click", () => {
      state.time = Math.min(clip.duration, clip.beats[i] + (i === 2 ? 0.16 : 0));
      state.playing = false;
      schedule();
    });
    return button;
  }));
  $("clips").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.clip === clip.id)));
  schedule();
}

for (const [i, clip] of BATTLE_CLIPS.entries()) {
  const button = document.createElement("button");
  button.className = "clip";
  button.dataset.clip = clip.id;
  button.style.setProperty("--clip-color", clip.color);
  button.setAttribute("aria-label", `播放${clip.title}`);
  const img = document.createElement("img");
  img.src = `../assets/monster-${posters[clip.art]}.png`;
  img.alt = "";
  const number = document.createElement("span");
  number.className = "number";
  number.textContent = `0${i + 1} / ${clip.duration.toFixed(1)}s`;
  const title = document.createElement("strong");
  title.textContent = clip.title;
  const type = document.createElement("small");
  type.textContent = clip.type;
  button.append(img, number, title, type);
  button.disabled = true;
  button.addEventListener("click", () => selectClip(clip));
  $("clips").append(button);
}

$("play").addEventListener("click", () => {
  if (state.time >= state.clip.duration) state.time = 0;
  state.playing = !state.playing;
  schedule();
});
$("replay").addEventListener("click", () => selectClip(state.clip));
$("seek").addEventListener("input", () => {
  state.playing = false;
  state.time = Number($("seek").value);
  schedule();
});
$("speed").addEventListener("change", () => { state.speed = Number($("speed").value); });
$("gentle").addEventListener("change", paint);
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target.closest("button, input, select, a") || !state.art || state.exporting) return;
  event.preventDefault();
  $("play").click();
});
document.addEventListener("visibilitychange", schedule);

new ResizeObserver(() => {
  const width = Math.max(640, Math.min(2560, Math.round(canvas.clientWidth * Math.min(devicePixelRatio || 1, 2))));
  if (canvas.width !== width) {
    canvas.width = width;
    canvas.height = Math.round(width * BATTLE_FRAME.height / BATTLE_FRAME.width);
    paint();
  }
}).observe(canvas);

const exportMime = typeof MediaRecorder !== "undefined" && ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((mime) => MediaRecorder.isTypeSupported(mime));
function updateControls() {
  document.querySelectorAll("button, input, select").forEach((element) => { element.disabled = !state.art || state.exporting; });
  $("export").disabled = !state.art || state.exporting || !exportMime || !canvas.captureStream;
  if (!exportMime || !canvas.captureStream) $("export").title = "当前浏览器不支持 WebM 导出，可直接观看预览";
}

$("export").addEventListener("click", async () => {
  state.playing = false;
  state.exporting = true;
  schedule();
  updateControls();
  $("download").hidden = true;
  const clip = state.clip;
  const output = document.createElement("canvas");
  output.width = BATTLE_FRAME.width;
  output.height = BATTLE_FRAME.height;
  const outputCtx = output.getContext("2d", { alpha: false });
  let stream;
  let recorder;
  try {
    renderBattleFrame(outputCtx, state.art, clip.id, 0, { reducedMotion: $("gentle").checked });
    stream = output.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: exportMime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error("录制失败，请重试"));
    });
    recorder.start();
    const start = performance.now();
    await new Promise((resolve) => {
      function capture(now) {
        const t = Math.min(clip.duration, (now - start) / 1000);
        renderBattleFrame(outputCtx, state.art, clip.id, t, { reducedMotion: $("gentle").checked });
        state.time = t;
        paint();
        $("notice").textContent = `正在导出 ${Math.round(t / clip.duration * 100)}% · 请保持本页可见`;
        if (t < clip.duration) requestAnimationFrame(capture);
        else resolve();
      }
      requestAnimationFrame(capture);
    });
    recorder.stop();
    await done;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    $("download").href = state.downloadUrl;
    $("download").download = `${clip.id}.webm`;
    $("download").textContent = `下载「${clip.title}」· WebM`;
    $("download").hidden = false;
    $("notice").textContent = "动画已生成 · 1600 × 900 / 30fps / 无声 / WebM";
  } catch (error) {
    $("notice").textContent = `导出未完成：${error.message}`;
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    state.exporting = false;
    updateControls();
  }
});

selectClip(BATTLE_CLIPS[0]);
try {
  state.art = await loadBattleArt();
  $("loading").hidden = true;
  updateControls();
  state.playing = !reducedMotion;
  if (reducedMotion) state.time = 1.58;
  schedule();
} catch (error) {
  $("loading").textContent = `${error.message}。请刷新重试。`;
  $("notice").textContent = "立绘未加载完成，动画暂不可用。";
}
