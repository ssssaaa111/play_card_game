export function createAnimationController({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  els,
  monsterAssets = {},
  duelistName = (owner) => owner,
  totalAtk = () => 0,
  battleValue = () => 0,
  speak = () => {},
  playVoice = () => false,
  playSound = () => {}
} = {}) {
  function centerOf(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function fieldElement(owner, index) {
    const root = owner === "player" ? els.playerField : els.aiField;
    return root.querySelector(`[data-index="${index}"] .card`) || root.querySelector(`[data-index="${index}"]`);
  }

  function trapElement(owner, index) {
    const root = owner === "player" ? els.playerTraps : els.aiTraps;
    return root.querySelector(`[data-index="${index}"] .card`) || root.querySelector(`[data-index="${index}"]`);
  }

  function panelElement(owner) {
    return owner === "player" ? els.playerPanel : els.aiPanel;
  }

  function avatarElement(owner) {
    return owner === "player" ? els.playerAvatar : els.aiAvatar;
  }

  function figureElement(owner) {
    return owner === "player" ? els.playerFigure : els.aiFigure;
  }

  function animateAvatar(owner, mood) {
    const avatar = avatarElement(owner);
    const figure = figureElement(owner);
    [avatar, figure].filter(Boolean).forEach((target) => {
      target.classList.remove("attack", "hit", "cast");
      void target.offsetWidth;
      target.classList.add(mood);
      win.setTimeout(() => target.classList.remove(mood), 900);
    });
  }

  function playDuelistLine(owner, text, force = false, voiceKey = "") {
    const panel = panelElement(owner);
    if (!panel) return;
    const anchor = centerOf(panel);
    const el = doc.createElement("div");
    el.className = `duelist-line ${owner === "ai" ? "ai" : ""}`;
    el.dataset.speaker = duelistName(owner);
    el.textContent = text;
    const x = owner === "player"
      ? Math.max(14, Math.min(win.innerWidth - 330, anchor.x - 290))
      : Math.max(14, Math.min(win.innerWidth - 330, anchor.x + 18));
    const y = Math.max(72, Math.min(win.innerHeight - 130, anchor.y - 20));
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1850);
    if (voiceKey) {
      playVoice(owner, voiceKey, text, force);
    } else {
      speak(text, force, owner);
    }
  }

  function playDrawEffect(owner, card) {
    const source = panelElement(owner);
    const target = owner === "player" ? els.hand : panelElement(owner);
    if (!source || !target) return;
    const from = centerOf(source);
    const to = centerOf(target);
    const el = doc.createElement("div");
    el.className = "draw-card-effect";
    el.textContent = card?.type === "trap" ? "陷" : card?.type === "spell" ? "魔" : "怪";
    el.style.setProperty("--from-x", `${from.x - 36}px`);
    el.style.setProperty("--from-y", `${from.y - 48}px`);
    el.style.setProperty("--to-x", `${to.x - 36}px`);
    el.style.setProperty("--to-y", `${to.y - 48}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1180);
    playDrawFan(owner);
    playEpicAction("抽卡", "draw", 820);
  }

  function playDrawFan(owner) {
    const source = panelElement(owner);
    const target = owner === "player" ? els.hand : panelElement(owner);
    if (!source || !target) return;
    const from = centerOf(source);
    const to = centerOf(target);
    [-24, -8, 8, 24].forEach((rotation, index) => {
      const el = doc.createElement("div");
      el.className = "draw-fan-effect";
      el.style.setProperty("--from-x", `${from.x - 29}px`);
      el.style.setProperty("--from-y", `${from.y - 42}px`);
      el.style.setProperty("--to-x", `${to.x - 92 + index * 42}px`);
      el.style.setProperty("--to-y", `${to.y - 60 - Math.abs(rotation) * 0.8}px`);
      el.style.setProperty("--rot", `${rotation}deg`);
      el.style.setProperty("--end-rot", `${rotation * 0.55}deg`);
      els.effectLayer.appendChild(el);
      win.setTimeout(() => el.remove(), 820);
    });
  }

  function playArrow(fromEl, toEl, kind = "attack", label = "") {
    if (!fromEl || !toEl) return;
    const from = centerOf(fromEl);
    const to = centerOf(toEl);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(60, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const arrow = doc.createElement("div");
    arrow.className = `effect-arrow ${kind}`;
    arrow.style.setProperty("--x", `${from.x}px`);
    arrow.style.setProperty("--y", `${from.y}px`);
    arrow.style.setProperty("--angle", `${angle}deg`);
    arrow.style.setProperty("--distance", `${distance}px`);
    els.effectLayer.appendChild(arrow);

    if (label) {
      const tag = doc.createElement("div");
      tag.className = "effect-label";
      tag.textContent = label;
      tag.style.setProperty("--x", `${(from.x + to.x) / 2 - 34}px`);
      tag.style.setProperty("--y", `${(from.y + to.y) / 2 - 28}px`);
      els.effectLayer.appendChild(tag);
      win.setTimeout(() => tag.remove(), 1120);
    }

    win.setTimeout(() => arrow.remove(), 900);
  }

  function playEpicAction(text, kind = "attack", duration = 1100) {
    const el = doc.createElement("div");
    el.className = `epic-action ${kind}`;
    el.textContent = text;
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), duration);
  }

  function playLifeDelta(owner, amount) {
    if (!els.effectLayer || amount === 0) return;
    const target = panelElement(owner);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const el = doc.createElement("div");
    el.className = `life-delta ${amount < 0 ? "damage" : "heal"}`;
    el.textContent = amount < 0 ? `${amount}` : `+${amount}`;
    el.style.setProperty("--x", `${rect.left + rect.width * 0.58}px`);
    el.style.setProperty("--y", `${rect.top + rect.height * 0.18}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1180);
  }

  function playAttackCloseup(attacker, target, owner, rival) {
    const el = doc.createElement("div");
    el.className = "attack-closeup";
    el.innerHTML = `
      <div class="closeup-card attacker">
        <em>${duelistName(owner)} 攻击</em>
        <strong></strong>
        <span></span>
      </div>
      <div class="closeup-vs">VS</div>
      <div class="closeup-card defender">
        <em>${duelistName(rival)} 承受</em>
        <strong></strong>
        <span></span>
      </div>
    `;
    const cards = el.querySelectorAll(".closeup-card");
    cards[0].querySelector("strong").textContent = attacker.name;
    cards[0].querySelector("span").textContent = `攻击 ${totalAtk(attacker)}`;
    cards[1].querySelector("strong").textContent = target ? target.name : duelistName(rival);
    cards[1].querySelector("span").textContent = target ? `${target.mode === "defense" ? "守备" : "攻击"} ${battleValue(target)}` : "直接攻击";
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1340);
  }

  function playAceStrike(attacker, owner, target) {
    const el = doc.createElement("div");
    el.className = `ace-strike ${attacker.element || ""}`;
    const targetName = target ? target.name : duelistName(owner === "player" ? "ai" : "player");
    el.innerHTML = `
      <div class="ace-strike-panel">
        <em>${duelistName(owner)} 王牌攻势</em>
        <strong>${attacker.name}</strong>
        <span>${targetName} 已被锁定</span>
      </div>
    `;
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1500);
  }

  function playSlashBurst(fromEl, toEl) {
    if (!fromEl || !toEl) return;
    const from = centerOf(fromEl);
    const to = centerOf(toEl);
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    const el = doc.createElement("div");
    el.className = "slash-burst";
    el.style.setProperty("--angle", `${angle}deg`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 880);
  }

  function playGuardShield(targetEl) {
    if (!targetEl) return;
    const pos = centerOf(targetEl);
    const el = doc.createElement("div");
    el.className = "guard-shield";
    el.style.setProperty("--x", `${pos.x - 78}px`);
    el.style.setProperty("--y", `${pos.y - 78}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 940);
  }

  function shakeScreen() {
    const root = doc.querySelector("#app");
    if (!root) return;
    root.classList.remove("screen-shake");
    void root.offsetWidth;
    root.classList.add("screen-shake");
    win.setTimeout(() => root.classList.remove("screen-shake"), 380);
  }

  function playCenterCardEffect(card, caption = "") {
    const el = doc.createElement("div");
    el.className = "center-card-effect";
    el.innerHTML = `
      <strong>${card.name}</strong>
      <span>${card.icon || "星"}</span>
      <p>${caption || card.text || "效果发动"}</p>
    `;
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1550);
  }

  function playAttackCutIn(attacker, target, owner, rival) {
    const el = doc.createElement("div");
    el.className = "attack-cutin";

    const left = doc.createElement("div");
    left.className = "cutin-card";
    left.innerHTML = `<em>${duelistName(owner)} 攻击宣言</em><strong></strong><span></span>`;
    left.querySelector("strong").textContent = attacker.name;
    left.querySelector("span").textContent = `攻击 ${totalAtk(attacker)}`;

    const versus = doc.createElement("div");
    versus.className = "cutin-versus";
    versus.textContent = "VS";

    const right = doc.createElement("div");
    right.className = "cutin-card";
    right.innerHTML = `<em>${duelistName(rival)} 目标</em><strong></strong><span></span>`;
    right.querySelector("strong").textContent = target ? target.name : "直接攻击";
    right.querySelector("span").textContent = target ? `${target.mode === "defense" ? "守备" : "攻击"} ${battleValue(target)}` : "生命伤害";

    el.appendChild(left);
    el.appendChild(versus);
    el.appendChild(right);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1220);
  }

  function playMonsterMotion(owner, index, motion) {
    const el = fieldElement(owner, index);
    if (!el) return;
    const className = `monster-${motion}-motion`;
    el.classList.remove("monster-attack-motion", "monster-hit-motion", "monster-guard-motion", "monster-stand-motion");
    void el.offsetWidth;
    el.classList.add(className);
    win.setTimeout(() => el.classList.remove(className), 860);
  }

  function playMonsterPhantom(card, fromEl, toEl) {
    const asset = monsterAsset(card);
    if (!asset || !fromEl || !toEl) return;
    const from = centerOf(fromEl);
    const to = centerOf(toEl);
    const el = doc.createElement("div");
    el.className = "monster-phantom";
    el.innerHTML = `<img src="${asset}" alt="">`;
    el.style.setProperty("--from-x", `${from.x - 75}px`);
    el.style.setProperty("--from-y", `${from.y - 120}px`);
    el.style.setProperty("--mid-x", `${(from.x + to.x) / 2 - 75}px`);
    el.style.setProperty("--mid-y", `${(from.y + to.y) / 2 - 150}px`);
    el.style.setProperty("--to-x", `${to.x - 75}px`);
    el.style.setProperty("--to-y", `${to.y - 120}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1260);
  }

  function playMonsterCounterPhantom(card, fromEl, toEl) {
    const asset = monsterAsset(card);
    if (!asset || !fromEl || !toEl) return;
    const from = centerOf(fromEl);
    const to = centerOf(toEl);
    const el = doc.createElement("div");
    el.className = "monster-phantom counter";
    el.innerHTML = `<img src="${asset}" alt="">`;
    el.style.setProperty("--from-x", `${from.x - 75}px`);
    el.style.setProperty("--from-y", `${from.y - 120}px`);
    el.style.setProperty("--mid-x", `${(from.x * 0.62 + to.x * 0.38) - 75}px`);
    el.style.setProperty("--mid-y", `${(from.y * 0.62 + to.y * 0.38) - 150}px`);
    el.style.setProperty("--to-x", `${(from.x * 0.78 + to.x * 0.22) - 75}px`);
    el.style.setProperty("--to-y", `${(from.y * 0.78 + to.y * 0.22) - 120}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1080);
  }

  function playImpactExplosion(targetEl) {
    if (!targetEl) return;
    const pos = centerOf(targetEl);
    const el = doc.createElement("div");
    el.className = "impact-explosion";
    el.style.setProperty("--x", `${pos.x - Math.min(180, win.innerWidth * 0.36)}px`);
    el.style.setProperty("--y", `${pos.y - Math.min(180, win.innerWidth * 0.36)}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 1200);
  }

  function playDuelistImpact(owner, targetEl = null) {
    const anchor = centerOf(targetEl || panelElement(owner));
    const el = doc.createElement("div");
    el.className = "duelist-impact";
    el.style.setProperty("--x", `${anchor.x - 95}px`);
    el.style.setProperty("--y", `${anchor.y - 95}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 860);
  }

  function playMonsterBurst(targetEl) {
    if (!targetEl) return;
    const pos = centerOf(targetEl);
    const el = doc.createElement("div");
    el.className = "monster-burst";
    el.style.setProperty("--x", `${pos.x - 59}px`);
    el.style.setProperty("--y", `${pos.y - 59}px`);
    els.effectLayer.appendChild(el);
    win.setTimeout(() => el.remove(), 820);
  }

  function monsterAsset(card) {
    return monsterAssets[card.id] || "";
  }

  function playDrawSequence(owner, cards = []) {
    (cards || []).forEach((card, index) => {
      win.setTimeout(() => {
        playSound("draw");
        playDrawEffect(owner, card);
      }, index * 760);
    });
  }

  return {
    fieldElement,
    trapElement,
    panelElement,
    animateAvatar,
    playDuelistLine,
    playDrawSequence,
    playArrow,
    playEpicAction,
    playLifeDelta,
    playAttackCloseup,
    playAceStrike,
    playSlashBurst,
    playGuardShield,
    shakeScreen,
    playCenterCardEffect,
    playAttackCutIn,
    playMonsterMotion,
    playMonsterPhantom,
    playMonsterCounterPhantom,
    playImpactExplosion,
    playDuelistImpact,
    playMonsterBurst,
    monsterAsset
  };
}
