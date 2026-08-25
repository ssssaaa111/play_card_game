const PHASE_STAGE_COPY = Object.freeze({
  draw: Object.freeze({
    code: "DRAW PHASE",
    title: "抽卡阶段",
    playerDetail: "确认新抽卡，规划本回合突破口",
    aiDetail: "对手补充手牌，观察下一步意图",
    duration: 980
  }),
  main: Object.freeze({
    code: "MAIN PHASE",
    title: "主要阶段",
    playerDetail: "部署怪兽 · 发动支援 · 构筑战线",
    aiDetail: "对手正在部署战线",
    duration: 1080
  }),
  battle: Object.freeze({
    code: "BATTLE PHASE",
    title: "战斗阶段",
    playerDetail: "选择攻击者，锁定目标",
    aiDetail: "敌方攻势即将展开",
    duration: 1160
  }),
  end: Object.freeze({
    code: "END PHASE",
    title: "结束阶段",
    playerDetail: "主动权移交给对手",
    aiDetail: "敌方攻势收束，准备接管回合",
    duration: 780
  })
});

export function phaseStageCue(phase, turn = "player") {
  const copy = PHASE_STAGE_COPY[phase];
  if (!copy) return null;
  const owner = turn === "ai" ? "ai" : "player";
  return {
    key: `${owner}:${phase}`,
    phase,
    turn: owner,
    code: copy.code,
    title: copy.title,
    actor: owner === "ai" ? "对手回合" : "你的回合",
    detail: owner === "ai" ? copy.aiDetail : copy.playerDetail,
    duration: copy.duration
  };
}

export function phaseStageCuesFromEvents(events = []) {
  return events
    .map((event) => {
      if (event?.type === "TURN_STARTED") {
        return phaseStageCue(event.phase || "draw", event.playerId);
      }
      if (event?.type === "PHASE_CHANGED") {
        return phaseStageCue(event.to, event.playerId);
      }
      if (event?.type === "TURN_ENDED") {
        return phaseStageCue(event.phase || "end", event.playerId);
      }
      return null;
    })
    .filter(Boolean);
}

export function createPhaseStageController({ root, window: win = globalThis.window } = {}) {
  const code = root?.querySelector?.("[data-phase-stage-code]") || null;
  const title = root?.querySelector?.("[data-phase-stage-title]") || null;
  const actor = root?.querySelector?.("[data-phase-stage-actor]") || null;
  const detail = root?.querySelector?.("[data-phase-stage-detail]") || null;
  const queue = [];
  let active = null;
  let timer = null;
  let sequence = 0;

  function finish() {
    if (!root) return;
    root.classList.remove("is-active");
    root.hidden = true;
    root.dataset.active = "false";
    active = null;
    timer = null;
    if (queue.length > 0) {
      timer = win.setTimeout(pump, 40);
    }
  }

  function pump() {
    if (!root || active || queue.length === 0) return;
    const cue = queue.shift();
    active = cue;
    sequence += 1;
    const reducedMotion = Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const duration = reducedMotion ? Math.min(360, cue.duration) : cue.duration;
    root.hidden = false;
    root.dataset.active = "true";
    root.dataset.phase = cue.phase;
    root.dataset.turn = cue.turn;
    root.dataset.sequence = String(sequence);
    root.style.setProperty("--phase-stage-duration", `${duration}ms`);
    if (code) code.textContent = cue.code;
    if (title) title.textContent = cue.title;
    if (actor) actor.textContent = cue.actor;
    if (detail) detail.textContent = cue.detail;
    root.classList.remove("is-active");
    void root.offsetWidth;
    root.classList.add("is-active");
    timer = win.setTimeout(finish, duration);
  }

  function enqueue(input) {
    const cues = (Array.isArray(input) ? input : [input]).filter(Boolean);
    cues.forEach((cue) => {
      const previous = queue.at(-1) || active;
      if (previous?.key === cue.key) return;
      queue.push(cue);
    });
    pump();
  }

  function reset() {
    if (timer) win.clearTimeout(timer);
    timer = null;
    active = null;
    queue.splice(0);
    if (!root) return;
    root.classList.remove("is-active");
    root.hidden = true;
    root.dataset.active = "false";
  }

  return { enqueue, reset };
}
