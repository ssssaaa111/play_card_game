import { auditLogEntries } from './log-audit.js';
import { logEntryMessage } from './battle-log.js';
import { cloneCardById } from './deck.js';
import { projectMachineStateFromEvents } from './game-engine.js';
import { selectionStateSnapshot } from './selection-state.js';
import { deckPresets } from './data.js';

function cardIds(list = []) {
  return list.map((card) => card?.id || null);
}

function assertUniqueRuntimeCards(state, label) {
  const seen = new Map();
  for (const owner of ["player", "ai"]) {
    const duelist = state[owner];
    for (const zone of ["deck", "hand", "field", "traps", "grave"]) {
      for (const card of duelist?.[zone] || []) {
        if (!card) continue;
        const cardId = card.uid || card.engineId;
        if (!cardId) throw new Error(`${label}: ${owner}.${zone} contains a card without a runtime id`);
        if (seen.has(cardId)) {
          throw new Error(`${label}: ${cardId} exists in both ${seen.get(cardId)} and ${owner}.${zone}`);
        }
        seen.set(cardId, `${owner}.${zone}`);
      }
    }
  }
}

function listText(root) {
  return Array.from(root?.querySelectorAll("li") || []).map((item) => item.textContent || "");
}

function selectedCardSnapshot(state) {
  const selected = state.selected || null;
  if (!selected) return null;
  if (selected.zone === "hand") {
    const card = state.player.hand.find((entry) => entry?.uid === selected.uid);
    return card ? { zone: "hand", id: card.id, uid: card.uid || null, type: card.type } : { ...selected };
  }
  if (selected.zone === "playerField") {
    const card = state.player.field[selected.index];
    return card ? { zone: "playerField", index: selected.index, id: card.id, uid: card.uid || null, used: Boolean(card.used), mode: card.mode || "attack" } : { ...selected };
  }
  return { ...selected };
}

function activeMonsterSnapshots(state) {
  const current = state[state.turn] || state.player;
  return (current.field || []).map((card, index) => {
    if (!card) return null;
    const canAttack = card.type === "monster" &&
      !current.attacksSkipped &&
      !card.used &&
      (card.mode || "attack") !== "defense";
    return {
      index,
      id: card.id,
      uid: card.uid || null,
      used: Boolean(card.used),
      hasAttacked: Boolean(card.used),
      mode: card.mode || "attack",
      canAttack
    };
  });
}

function assertPendingSelection(ctx, expectedKind, label) {
  const selection = selectionStateSnapshot(ctx.state);
  if (selection.conflicted || selection.pendingKind !== expectedKind) {
    throw new Error(`${label}: expected ${expectedKind || "no"} pending selection, got ${selection.pendingKinds.join(", ") || "none"}`);
  }
}

export function createTestSnapshot({ testMode = false, state, els, currentPlayerActions }) {
  return function testSnapshot() {
    const actions = currentPlayerActions();
    const machine = projectMachineStateFromEvents(state.gameEvents || [], state.phase);
    return {
      mode: testMode ? "test" : "normal",
      started: state.started,
      paused: state.paused,
      turn: state.turn,
      currentPlayer: state.turn,
      phase: state.phase,
      timing: state.timing,
      actionWindow: state.actionWindow,
      actionDeadline: state.actionDeadline,
      scenarioId: state.scenarioId,
      soundOn: state.soundOn,
      musicOn: state.musicOn,
      musicVolume: state.musicVolume,
      voiceOn: state.voiceOn,
      latestLog: logEntryMessage(state.log[0]),
      gameEventCount: state.gameEvents?.length || 0,
      latestGameEvents: (state.gameEvents || []).slice(-5).map((event) => event.type),
      latestGameEventDetails: (state.gameEvents || []).slice(-5).map((event) => ({
        id: event.id || null,
        type: event.type,
        playerId: event.playerId || null,
        cardId: event.cardId || event.attackerCardId || event.sourceCardId || null,
        targetCardId: event.targetCardId || null,
        reason: event.reason || null,
        shieldPierced: event.shieldPierced || 0
      })),
      machine: {
        phase: machine.phase,
        timing: machine.timing,
        actionWindow: machine.actionWindow ? {
          playerId: machine.actionWindow.playerId,
          window: machine.actionWindow.window,
          reason: machine.actionWindow.reason || ""
        } : null,
        pendingAttack: machine.pendingAttack ? { ...machine.pendingAttack } : null,
        responseWindow: machine.responseWindow ? {
          playerId: machine.responseWindow.playerId,
          timing: machine.responseWindow.timing,
          prompt: machine.responseWindow.prompt || null
        } : null,
        chainLength: machine.chain?.length || 0
      },
      selectedCard: selectedCardSnapshot(state),
      selection: selectionStateSnapshot(state),
      pendingFusion: state.pendingFusion ? {
        cardName: state.pendingFusion.cardName || "",
        resultId: state.pendingFusion.resultId || "",
        selectedIndexes: (state.pendingFusion.selectedIndexes || []).slice()
      } : null,
      activePlayerMonsters: activeMonsterSnapshots(state),
      controls: {
        skipAttackButtonDisabled: Boolean(els.skipAttackBtn?.disabled),
        endTurnButtonDisabled: Boolean(els.endTurnBtn?.disabled),
        handConfirmButtonDisabled: Boolean(els.handConfirmBtn?.disabled),
        aiPanelDirectTarget: Boolean(els.aiPanel?.classList.contains("direct-target"))
      },
      scenarioBrief: {
        title: els.scenarioBriefTitle?.textContent || "",
        difficulty: els.scenarioDifficulty?.textContent || "",
        objectives: listText(els.scenarioObjectives),
        hints: listText(els.scenarioHints),
        hintsHidden: Boolean(els.scenarioHints?.hidden),
        hintToggleText: els.scenarioHintToggle?.textContent || ""
      },
      preDuelPreview: {
        visible: Boolean(els.preDuelPreview && !els.preDuelPreview.hidden),
        lp: els.preDuelLp?.textContent || "",
        skill: els.preDuelSkillName?.textContent || "",
        deckCount: els.preDuelDeckCount?.textContent || "",
        deckExpanded: Boolean(els.preDuelDeckList && !els.preDuelDeckList.hidden),
        deckCards: Array.from(els.preDuelDeckList?.querySelectorAll(".pre-duel-card") || []).map((item) => ({
          id: item.dataset.cardId || "",
          zone: item.dataset.zone || "",
          count: item.dataset.count || "",
          text: item.textContent || ""
        }))
      },
      aiReveal: {
        visible: Boolean(els.aiRevealModal?.classList.contains("show")),
        cardId: els.aiRevealModal?.dataset.cardId || "",
        title: els.aiRevealTitle?.textContent || "",
        progress: els.aiRevealProgress?.textContent || "",
        type: els.aiRevealType?.textContent || "",
        summary: els.aiRevealSummary?.textContent || ""
      },
      pendingTarget: state.pendingTarget ? {
        mode: state.pendingTarget.mode,
        cardName: state.pendingTarget.cardName,
        effect: state.pendingTarget.effect,
        selectedTarget: state.pendingTarget.selectedTarget ? { ...state.pendingTarget.selectedTarget } : null,
        selectedTargetSource: state.pendingTarget.selectedTargetSource || ""
      } : null,
      pendingTribute: state.pendingTribute ? {
        cardName: state.pendingTribute.cardName,
        cost: state.pendingTribute.cost,
        selectedIndexes: state.pendingTribute.selectedIndexes.slice()
      } : null,
      player: {
        lp: state.player.lp,
        shield: state.player.shield,
        attacksSkipped: state.player.attacksSkipped,
        directAttacks: state.player.directAttacks,
        hand: cardIds(state.player.hand),
        field: cardIds(state.player.field),
        traps: cardIds(state.player.traps)
      },
      ai: {
        lp: state.ai.lp,
        shield: state.ai.shield,
        handCount: state.ai.hand.length,
        field: cardIds(state.ai.field),
        traps: cardIds(state.ai.traps)
      },
      actions,
      chain: {
        open: els.chainModal.classList.contains("show"),
        text: els.chainText.textContent
      },
      audit: auditLogEntries(state.timeline)
    };
  };
}

function smokeDebug(ctx) {
  const machine = projectMachineStateFromEvents(ctx.state.gameEvents || [], ctx.state.phase);
  return JSON.stringify({
    turn: ctx.state.turn,
    phase: ctx.state.phase,
    paused: Boolean(ctx.state.paused),
    aiRunning: Boolean(ctx.state.aiRunning),
    actionWindow: ctx.state.actionWindow,
    ruleCheckIssue: ctx.state.ruleCheckIssue || null,
    pendingTrapChoice: ctx.state.pendingTrapChoice ? {
      eventName: ctx.state.pendingTrapChoice.eventName,
      trapIndexes: ctx.state.pendingTrapChoice.trapIndexes,
      selectedIndex: ctx.state.pendingTrapChoice.selectedIndex
    } : null,
    selected: ctx.state.selected || null,
    pendingAttack: machine.pendingAttack,
    responseWindow: machine.responseWindow,
    chainLength: machine.chain?.length || 0,
    playerMonsters: activeMonsterSnapshots({ ...ctx.state, turn: "player" }),
    aiMonsters: activeMonsterSnapshots({ ...ctx.state, turn: "ai" }),
    attacksSkipped: {
      player: Boolean(ctx.state.player.attacksSkipped),
      ai: Boolean(ctx.state.ai.attacksSkipped)
    },
    actions: ctx.currentPlayerActions(),
    skipAttackButtonDisabled: Boolean(ctx.els.skipAttackBtn?.disabled),
    chainOpen: Boolean(ctx.els.chainModal?.classList.contains("show")),
    chainYesDisabled: Boolean(ctx.els.chainYes?.disabled),
    chainText: ctx.els.chainText?.textContent || "",
    log: (ctx.state.log || []).slice(0, 6).map(logEntryMessage),
    latestGameEvents: (ctx.state.gameEvents || []).slice(-8).map((event) => ({
      id: event.id,
      type: event.type,
      playerId: event.playerId || null,
      cardId: event.cardId || event.attackerCardId || event.sourceCardId || null,
      targetCardId: event.targetCardId || null,
      reason: event.reason || null
    }))
  });
}

function setSmokeStatus(status, detail = "") {
  document.body.dataset.smokeStatus = status;
  document.body.dataset.smokeDetail = detail;
}

function waitForSmoke(predicate, label, timeout = 8000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeout) {
        reject(new Error(`等待超时：${label}`));
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

function clickSmokeElement(element, label) {
  if (!element) throw new Error(`找不到测试目标：${label}`);
  element.click();
}

function clickSmokeElementCenter(element, label) {
  if (!element) throw new Error(`找不到测试目标：${label}`);
  element.scrollIntoView({ block: "start", inline: "center" });
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== element && !element.contains(hit))) {
    const target = hit ? `${hit.tagName}.${hit.className || ""}` : "none";
    throw new Error(`${label} center is covered by ${target}`);
  }
  hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
}

async function selectSpellTarget(ctx, element, label, { center = false } = {}) {
  const pendingUid = ctx.state.pendingTarget?.handUid;
  if (!pendingUid) throw new Error(`${label}: spell target window is not open`);
  if (center) clickSmokeElementCenter(element, label);
  else clickSmokeElement(element, label);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.handUid === pendingUid &&
      ctx.state.pendingTarget?.selectedTargetSource === "player" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget) &&
      !ctx.els.choiceConfirmBtn.disabled,
    `${label}: target selected`
  );
}

function confirmSpellTarget(ctx, label) {
  clickSmokeElement(ctx.els.choiceConfirmBtn, label);
}

async function selectAndConfirmSpellTarget(ctx, element, label, options) {
  await selectSpellTarget(ctx, element, label, options);
  confirmSpellTarget(ctx, `${label}: confirm activation`);
}

async function clickSmokeElementTwiceAcrossRender(resolveElement, label, afterFirstClick = () => true) {
  clickSmokeElement(resolveElement(), `${label}：第一次点击`);
  await waitForSmoke(
    () => afterFirstClick() && Boolean(resolveElement()),
    `${label}：第一次点击后仍可继续操作`
  );
  clickSmokeElement(resolveElement(), `${label}：第二次点击`);
}

function selectScenario(els, scenarioId) {
  els.scenarioSelect.value = scenarioId;
  els.scenarioSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

async function startSmokeDuel(ctx, scenarioId) {
  selectScenario(ctx.els, scenarioId);
  clickSmokeElement(ctx.els.modal?.classList.contains("show") ? ctx.els.modalRestart : ctx.els.startBtn, "开始按钮");
  await waitForSmoke(() => ctx.state.started && ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.pendingOpeningDraw, "玩家主阶段");
}

function assertScenarioBrief(els, { difficulty, objectives = [], hints = [] }) {
  const objectiveText = Array.from(els.scenarioObjectives?.querySelectorAll("li") || [])
    .map((item) => item.textContent || "")
    .join("\n");
  const hintText = Array.from(els.scenarioHints?.querySelectorAll("li") || [])
    .map((item) => item.textContent || "")
    .join("\n");
  if (difficulty && els.scenarioDifficulty?.textContent !== difficulty) {
    throw new Error(`场景难度标签不正确：${els.scenarioDifficulty?.textContent || ""}`);
  }
  objectives.forEach((entry) => {
    if (!objectiveText.includes(entry)) {
      throw new Error(`场景目标未渲染：${entry}`);
    }
  });
  hints.forEach((entry) => {
    if (!hintText.includes(entry)) {
      throw new Error(`场景提示未渲染：${entry}`);
    }
  });
}

async function finishPlayerTurn(ctx) {
  clickSmokeElement(ctx.els.endTurnBtn, "结束回合按钮");
}

function fieldCard(els, owner, cardId) {
  const field = owner === "player" ? els.playerField : els.aiField;
  return field.querySelector(`[data-zone="${owner}-field"][data-card-id="${cardId}"]`);
}

function fieldSlot(els, owner, index) {
  const field = owner === "player" ? els.playerField : els.aiField;
  return field.querySelector(`[data-testid="${owner}-field-${index}"]`);
}

function handCard(els, cardId) {
  return els.hand.querySelector(`[data-zone="hand"][data-card-id="${cardId}"]`);
}

function assertHandCardReady(els, cardId, label) {
  const card = handCard(els, cardId);
  if (!card) throw new Error(`${label}: hand card ${cardId} is missing`);
  if (!card.classList.contains("action-ready") || card.classList.contains("action-blocked")) {
    throw new Error(`${label}: ${cardId} should be visibly highlighted as action-ready`);
  }
  return card;
}

function assertHandCardBlocked(els, cardId, label, reason = "") {
  const card = handCard(els, cardId);
  if (!card) throw new Error(`${label}: hand card ${cardId} is missing`);
  if (card.classList.contains("action-ready") || !card.classList.contains("action-blocked")) {
    throw new Error(`${label}: ${cardId} should be visibly blocked`);
  }
  if (reason && !card.textContent.includes(reason) && !card.title.includes(reason)) {
    throw new Error(`${label}: ${cardId} should explain ${reason}`);
  }
  return card;
}

function assertCardEffectMarker(card, markerLabel, detail = "") {
  if (!card) throw new Error(`${markerLabel}: field card is missing`);
  const marker = [...card.querySelectorAll(".card-state-chip")]
    .find((entry) => entry.textContent.trim() === markerLabel);
  if (!marker) throw new Error(`${markerLabel}: effect marker is missing from ${card.textContent}`);
  if (detail && marker.title !== detail) {
    throw new Error(`${markerLabel}: expected detail ${detail}, received ${marker.title || "(empty)"}`);
  }
  return marker;
}

function assertCardEffectMarkerMissing(card, markerLabel) {
  if (!card) throw new Error(`${markerLabel}: field card is missing`);
  const marker = [...card.querySelectorAll(".card-state-chip")]
    .find((entry) => entry.textContent.trim() === markerLabel);
  if (marker) throw new Error(`${markerLabel}: expired effect marker is still visible`);
}

function preDuelDeckCard(els, cardId) {
  return els.preDuelDeckList?.querySelector(`.pre-duel-card[data-card-id="${cardId}"]`);
}

function graveTargetCard(els, cardId) {
  return els.graveTargets?.querySelector(`[data-zone="player-grave"][data-card-id="${cardId}"]`);
}

function trapCard(els, owner, cardId) {
  const root = owner === "player" ? els.playerTraps : els.aiTraps;
  return root.querySelector(`[data-zone="${owner}-trap"][data-card-id="${cardId}"]`);
}

function trapSlot(els, owner, index) {
  const root = owner === "player" ? els.playerTraps : els.aiTraps;
  return root.querySelector(`[data-testid="${owner}-trap-${index}"]`);
}

function chainChoiceButton(els, cardId) {
  return els.chainChoices?.querySelector(`[data-card-id="${cardId}"]`);
}

function logCardLink(els, cardId) {
  return els.timeline?.querySelector(`.timeline-card-link[data-card-id="${cardId}"]`);
}

function aiRevealVisible(els, cardId) {
  return els.aiRevealModal?.classList.contains("show") &&
    (!cardId || els.aiRevealModal.dataset.cardId === cardId);
}

async function assertCardDetailModal(ctx, card, label) {
  await waitForSmoke(
    () => ctx.els.cardModal?.classList.contains("show") &&
      ctx.els.zoomName?.textContent === card.name &&
      (ctx.els.zoomText?.textContent || "").includes(card.text || ""),
    `${label} detail modal`,
    6000
  );
  if (!ctx.els.zoomMeta.textContent.includes("类型：")) {
    throw new Error(`${label} detail modal missing type metadata`);
  }
}

function countGameEvents(state, type) {
  return (state.gameEvents || []).filter((event) => event.type === type).length;
}

function cardSnapshot(card) {
  return card ? {
    id: card.id,
    name: card.name,
    uid: card.uid || null,
    mode: card.mode || null,
    atk: card.atk,
    def: card.def,
    tempAtk: card.tempAtk || 0,
    tempDef: card.tempDef || 0,
    used: Boolean(card.used)
  } : null;
}

function eventSnapshot(event) {
  if (!event) return null;
  return {
    id: event.id,
    type: event.type,
    playerId: event.playerId || null,
    rivalId: event.rivalId || null,
    attackerCardId: event.attackerCardId || null,
    targetCardId: event.targetCardId || null,
    targetPlayerId: event.targetPlayerId || null,
    cardId: event.cardId || null,
    sourceCardId: event.sourceCardId || null,
    declarationEventId: event.declarationEventId || null,
    requested: event.requested ?? null,
    amount: event.amount ?? null,
    blocked: event.blocked ?? null,
    shieldBefore: event.shieldBefore ?? null,
    shieldAfter: event.shieldAfter ?? null,
    outcome: event.outcome ? {
      kind: event.outcome.kind,
      attack: event.outcome.attack,
      targetValue: event.outcome.targetValue,
      diff: event.outcome.diff,
      rawDamage: event.outcome.rawDamage,
      finalDamage: event.outcome.finalDamage,
      shieldBlocked: event.outcome.shieldBlocked,
      damagePlayerId: event.outcome.damagePlayerId || null
    } : null
  };
}

function phantomRedirectDiagnostics(ctx, markers = {}) {
  const events = ctx.state.gameEvents || [];
  const attackDeclared = markers.attackDeclared ||
    events.find((event) => event.type === "ATTACK_DECLARED" && event.attackerCardId === markers.attackerCardId) ||
    events.find((event) => event.type === "ATTACK_DECLARED");
  const battleResolved = events.find((event) =>
    event.type === "BATTLE_RESOLVED" &&
    (!attackDeclared?.id || String(event.declarationEventId) === String(attackDeclared.id))
  ) || events.find((event) => event.type === "BATTLE_RESOLVED");
  const damageEvents = events.filter((event) => event.type === "DAMAGE_DEALT").map(eventSnapshot);
  return JSON.stringify({
    attackDeclared: eventSnapshot(attackDeclared),
    pendingBeforeTrap: markers.pendingBeforeTrap || null,
    pendingAfterRedirect: markers.pendingAfterRedirect || null,
    targetChangedEvents: events.filter((event) => /TARGET.*CHANGED|ATTACK.*REDIRECT/i.test(event.type)).map(eventSnapshot),
    trapResolvedEvents: events.filter((event) =>
      ["CHAIN_LINK_RESOLVED", "CHAIN_RESOLVED", "CARD_ACTIVATED"].includes(event.type) &&
      (!markers.trapCardId || event.cardId === markers.trapCardId)
    ).map(eventSnapshot),
    damageEvents,
    battleResolved: eventSnapshot(battleResolved),
    player: {
      lp: ctx.state.player.lp,
      shield: ctx.state.player.shield,
      field: ctx.state.player.field.map(cardSnapshot),
      grave: ctx.state.player.grave.map(cardSnapshot),
      traps: ctx.state.player.traps.map(cardSnapshot)
    },
    ai: {
      lp: ctx.state.ai.lp,
      shield: ctx.state.ai.shield,
      field: ctx.state.ai.field.map(cardSnapshot),
      grave: ctx.state.ai.grave.map(cardSnapshot)
    },
    logs: (ctx.state.log || []).slice(0, 10).map(logEntryMessage),
    promptText: markers.promptText || ""
  });
}

async function runSkipLockSmoke(ctx) {
  setSmokeStatus("running", "skip-lock");
  await startSmokeDuel(ctx, "skipLock");
  ctx.state.player.attackResets = 2;
  ctx.state.player.directAttacks = 1;
  ctx.state.player.extraSummon = 1;
  clickSmokeElement(ctx.els.skipAttackBtn, "跳过攻击按钮");
  await waitForSmoke(() => ctx.state.player.attacksSkipped, "跳过攻击标记");
  if (ctx.currentPlayerActions().attack) {
    throw new Error("跳过攻击后仍然存在可攻击行动");
  }
  if (ctx.state.player.attackResets || ctx.state.player.directAttacks || ctx.state.player.extraSummon !== 1) {
    throw new Error("跳过攻击应只清理攻击重置和直击许可");
  }
  if (!ctx.state.gameEvents.some((event) => event.type === "ATTACKS_SKIPPED") ||
      !ctx.state.gameEvents.some((event) => event.type === "ABILITY_GRANTED" && event.ability === "skipAttackLock")) {
    throw new Error("跳过攻击必须通过规则事件建立本回合锁定");
  }
  setSmokeStatus("passed", "skip-lock");
}

async function runDirectGuardSmoke(ctx) {
  setSmokeStatus("running", "direct-guard");
  await startSmokeDuel(ctx, "direct");
  const aiLpBefore = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "星轨枪兵");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "敌方怪兽攻击高亮");
  const emptyEnemySlot = fieldSlot(ctx.els, "ai", 1);
  if (!emptyEnemySlot?.disabled || emptyEnemySlot.classList.contains("attack-target")) {
    throw new Error("敌方空召唤区不应作为攻击候选");
  }
  clickSmokeElement(ctx.els.aiPanel, "AI 玩家面板");
  await waitForSmoke(() => ctx.state.phase === "battle" && (ctx.state.log[0] || "").includes("攻击无效"), "裸直击被规则拦截");
  if (ctx.state.ai.lp !== aiLpBefore) throw new Error("裸直击不应造成伤害");
  if (ctx.state.player.field[0]?.used) throw new Error("非法直击不应消耗攻击机会");

  clickSmokeElement(handCard(ctx.els, "star-breach"), "星隙穿透手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "星隙穿透中央确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动星隙穿透");
  await waitForSmoke(() => ctx.state.player.directAttacks > 0, "获得直接攻击许可");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "星轨枪兵");
  clickSmokeElement(ctx.els.aiPanel, "AI 玩家面板");
  await waitForSmoke(() => ctx.state.ai.lp < aiLpBefore, "许可直击造成伤害", 9000);
  if (!ctx.els.choiceActions.hidden) throw new Error("攻击目标点击后不应再等待二次确认");
  if (!ctx.state.player.field[0]?.used) throw new Error("成功直击应该消耗攻击机会");
  setSmokeStatus("passed", "direct-guard");
}

async function runDirectShieldConsumeSmoke(ctx) {
  setSmokeStatus("running", "direct-shield-consume");
  await startSmokeDuel(ctx, "direct");
  const guard = cloneCardById("guard-sigil");
  if (!guard) throw new Error("守护刻印测试卡不存在");
  ctx.state.ai.traps[0] = guard;
  const aiLpBefore = ctx.state.ai.lp;
  const usedEventsBefore = countGameEvents(ctx.state, "MONSTER_USED");

  clickSmokeElement(handCard(ctx.els, "star-breach"), "星隙穿透手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "星隙穿透确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动星隙穿透");
  await waitForSmoke(() => ctx.state.player.directAttacks > 0, "获得直接攻击许可");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "选择星轨枪兵");
  clickSmokeElement(ctx.els.aiPanel, "直击 AI 玩家触发守护刻印");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.used &&
      !ctx.state.ai.traps.some((card) => card?.id === "guard-sigil") &&
      countGameEvents(ctx.state, "MONSTER_USED") > usedEventsBefore,
    "守护刻印挡住直击后消耗攻击机会",
    12000
  );
  if (ctx.state.ai.lp !== aiLpBefore) {
    throw new Error("守护刻印应让直接攻击伤害归零");
  }
  if (ctx.currentPlayerActions().attack) {
    throw new Error("守护刻印挡住直击后同一只怪兽不应还能继续攻击");
  }
  if (!(ctx.state.gameEvents || []).some((event) => event.type === "RESPONSE_WINDOW_OPENED" && event.prompt === "direct") ||
      countGameEvents(ctx.state, "CHAIN_LINK_ADDED") < 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") < 1) {
    throw new Error("守护刻印必须通过直击响应窗口和连锁事件结算");
  }
  setSmokeStatus("passed", "direct-shield-consume");
}

async function runGuardCounterSmoke(ctx) {
  setSmokeStatus("running", "guard-counter");
  await startSmokeDuel(ctx, "direct");
  const guardian = ctx.state.ai.field.find((card) => card?.id === "iron-guardian");
  if (!guardian) throw new Error("守备反击场景缺少铁壁守卫");
  guardian.mode = "defense";
  guardian.battleWear = 0;
  const playerLpBefore = ctx.state.player.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "星轨枪兵");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "铁壁守卫攻击高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "攻击守备铁壁");
  await waitForSmoke(
    () => ctx.state.log.some((entry) => entry.includes("守备反击")) &&
      ctx.state.player.field.some((card) => card?.id === "star-lancer") &&
      ctx.state.ai.field.some((card) => card?.id === "iron-guardian"),
    "守备反击保留双方怪兽",
    12000
  );
  if (ctx.state.player.lp !== playerLpBefore - 300) {
    throw new Error("守备反击应只让攻击方承受 DEF 差值伤害");
  }
  if ((guardian.battleWear || 0) <= 0) {
    throw new Error("守备反击后守备怪兽应产生战斗损耗");
  }
  setSmokeStatus("passed", "guard-counter");
}

async function runAiGuardSkipSmoke(ctx) {
  setSmokeStatus("running", "ai-guard-skip");
  await startSmokeDuel(ctx, "guardSkip");
  const playerLpBefore = ctx.state.player.lp;
  const guardian = ctx.state.player.field.find((card) => card?.id === "iron-guardian");
  const turnEventsBefore = countGameEvents(ctx.state, "TURN_STARTED");
  const drawEventsBefore = countGameEvents(ctx.state, "CARDS_DRAWN");
  const resetEventsBefore = countGameEvents(ctx.state, "MONSTER_TURN_RESET");
  const expiredEventsBefore = countGameEvents(ctx.state, "TURN_ABILITIES_EXPIRED");
  guardian.used = true;
  guardian.changedMode = true;
  ctx.state.player.extraSummon = 1;
  ctx.state.player.attackResets = 1;
  ctx.state.player.directAttacks = 1;
  ctx.state.player.attacksSkipped = true;
  ctx.state.player.comboThisTurn = true;
  ctx.state.player.comboFlags = { smoke: true };
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.aiRunning,
    "AI 面对高守备保留攻击后回到玩家回合",
    22000
  );
  if (ctx.state.player.lp !== playerLpBefore) {
    throw new Error("AI 跳过无意义守备攻击时不应造成生命值变化");
  }
  if (!ctx.state.player.field.some((card) => card?.id === "iron-guardian")) {
    throw new Error("AI 跳过守备攻击后铁壁守卫应仍在场");
  }
  if (!ctx.state.ai.field.some((card) => card?.id === "star-lancer")) {
    throw new Error("AI 跳过守备攻击后星轨枪兵应仍在场");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("对手保留 星轨枪兵"))) {
    throw new Error("AI 应记录保留攻击，避免玩家以为流程卡住");
  }
  if (guardian.used || guardian.changedMode) {
    throw new Error("玩家新回合应通过怪兽重置事件恢复攻击和表示变更资格");
  }
  if (ctx.state.player.extraSummon || ctx.state.player.attackResets || ctx.state.player.directAttacks) {
    throw new Error("玩家新回合应通过能力过期事件清空回合资源");
  }
  if (ctx.state.player.attacksSkipped || ctx.state.player.comboThisTurn || Object.keys(ctx.state.player.comboFlags || {}).length) {
    throw new Error("玩家新回合应通过开始回合事件清空回合标记");
  }
  if (countGameEvents(ctx.state, "TURN_STARTED") < turnEventsBefore + 2 ||
      countGameEvents(ctx.state, "CARDS_DRAWN") < drawEventsBefore + 2 ||
      countGameEvents(ctx.state, "MONSTER_TURN_RESET") < resetEventsBefore + 1 ||
      countGameEvents(ctx.state, "TURN_ABILITIES_EXPIRED") < expiredEventsBefore + 1) {
    throw new Error("完整回合循环缺少开始回合、怪兽重置或能力过期事件");
  }
  setSmokeStatus("passed", "ai-guard-skip");
}

async function runAiMirrorRestraintBasicSmoke(ctx) {
  const smokeName = "ai-mirror-restraint-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistComebackChallenge");
  const mirror = ctx.state.ai.traps.find((card) => card?.id === "mirror-snare");
  const attacker = ctx.state.player.field.find((card) => card?.id === "spark-runner");
  if (!mirror || !attacker || !ctx.state.ai.field.some((card) => card?.id === "flare-titan")) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }
  const activatedBefore = (ctx.state.gameEvents || []).filter((event) =>
    event.type === "CARD_ACTIVATED" && event.cardId === mirror.uid
  ).length;

  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), `${smokeName}: select low-attack monster`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "flare-titan")?.classList.contains("attack-target"),
    `${smokeName}: stronger target becomes attackable`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "flare-titan"), `${smokeName}: attack stronger monster`);
  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.uid === attacker.uid) &&
      (ctx.state.gameEvents || []).some((event) => event.type === "BATTLE_RESOLVED" && event.attackerCardId === attacker.uid),
    `${smokeName}: unfavorable battle resolves without trap waste`,
    14000
  );

  const activatedAfter = (ctx.state.gameEvents || []).filter((event) =>
    event.type === "CARD_ACTIVATED" && event.cardId === mirror.uid
  ).length;
  if (activatedAfter !== activatedBefore || !ctx.state.ai.traps.some((card) => card?.uid === mirror.uid)) {
    throw new Error(`${smokeName}: AI should preserve mirror snare when battle already favors it. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.ai.grave.some((card) => card?.uid === mirror.uid)) {
    throw new Error(`${smokeName}: preserved mirror snare must not enter the graveyard.`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runAiMultiAttackReentryBasicSmoke(ctx) {
  const smokeName = "ai-multi-attack-reentry-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmega");
  const attackEventsBefore = countGameEvents(ctx.state, "ATTACK_DECLARED");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => countGameEvents(ctx.state, "ATTACK_DECLARED") >= attackEventsBefore + 2 ||
      (ctx.state.turn === "player" && !ctx.state.aiRunning),
    `${smokeName}: AI battle phase completes or reaches a second attack`,
    30000
  );

  const attacks = (ctx.state.gameEvents || [])
    .filter((event) => event.type === "ATTACK_DECLARED" && event.playerId === "ai")
    .slice(attackEventsBefore);
  const attackerIds = new Set(attacks.map((event) => event.attackerCardId));
  if (attackerIds.size < 2) {
    throw new Error(`${smokeName}: battle window did not reopen for a second AI attacker. ${smokeDebug(ctx)}`);
  }
  if (!attacks.some((event) => eventReferencesTemplate(event, "trio-sun-judicator"))) {
    throw new Error(`${smokeName}: expected the sun god to make the first pressure attack.`);
  }
  const newEvents = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const firstAttackIndex = newEvents.findIndex((event) =>
    event.type === "ATTACK_DECLARED" && event.playerId === "ai"
  );
  const secondAttackIndex = newEvents.findIndex((event, index) =>
    index > firstAttackIndex && event.type === "ATTACK_DECLARED" && event.playerId === "ai"
  );
  const firstResolutionIndex = newEvents.findIndex((event, index) =>
    index > firstAttackIndex && index < secondAttackIndex && event.type === "BATTLE_RESOLVED"
  );
  const reentryEvents = newEvents.slice(firstResolutionIndex + 1, secondAttackIndex);
  if (firstAttackIndex < 0 || firstResolutionIndex < 0 || secondAttackIndex < 0 ||
      !reentryEvents.some((event) =>
        event.type === "ACTION_WINDOW_OPENED" &&
        event.playerId === "ai" &&
        event.window === "ai" &&
        event.reason === "battle-resolved"
      )) {
    throw new Error(`${smokeName}: engine did not reopen the AI battle window between attacks. ${smokeDebug(ctx)}`);
  }
  if (reentryEvents.some((event) =>
    event.type === "COMMAND_DISPATCHED" && event.commandType === "OPEN_ACTION_WINDOW"
  )) {
    throw new Error(`${smokeName}: UI must not dispatch a second action-window command after battle resolution.`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioAttackPlanningBasicSmoke(ctx) {
  const smokeName = "trio-attack-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioAttackPlanning");
  const attackEventsBefore = countGameEvents(ctx.state, "ATTACK_DECLARED");

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "player" && !ctx.state.aiRunning,
    `${smokeName}: AI completes the planned three-attack turn. ${smokeDebug(ctx)}`,
    42000
  );

  const attacks = (ctx.state.gameEvents || [])
    .filter((event) => event.type === "ATTACK_DECLARED" && event.playerId === "ai")
    .slice(attackEventsBefore);
  const referencesTemplate = (cardId, templateId) => eventReferencesTemplate({ cardId }, templateId);
  const [firstAttack, secondAttack, thirdAttack] = attacks;
  if (attacks.length !== 3 ||
      !referencesTemplate(firstAttack?.attackerCardId, "trio-sun-judicator") ||
      !referencesTemplate(firstAttack?.targetCardId, "void-siege-breaker") ||
      !referencesTemplate(secondAttack?.attackerCardId, "trio-moon-warden") ||
      !referencesTemplate(secondAttack?.targetCardId, "prism-saint") ||
      !referencesTemplate(thirdAttack?.attackerCardId, "trio-star-herald") ||
      thirdAttack?.targetCardId) {
    throw new Error(`${smokeName}: trio should assign sun to the exclusive high threat, moon to the weak target, then let star attack directly. ${smokeDebug(ctx)}`);
  }
  if (!ctx.state.player.grave.some((card) => card?.id === "void-siege-breaker") ||
      !ctx.state.player.grave.some((card) => card?.id === "prism-saint") ||
      ctx.state.gameOver) {
    throw new Error(`${smokeName}: planned attacks should clear both targets and leave the duel running. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioTurnPlanningBasicSmoke(ctx) {
  const smokeName = "trio-turn-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioTurnPlanning");
  const chant = ctx.state.ai.hand.find((card) => card?.id === "war-chant");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!chant) {
    throw new Error(`${smokeName}: scripted opening is missing war chant. ${smokeDebug(ctx)}`);
  }

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "player" && !ctx.state.aiRunning,
    `${smokeName}: AI completes its planned deployment turn. ${smokeDebug(ctx)}`,
    42000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const trioSummonIndex = events.findIndex((event) =>
    event.type === "MONSTER_SUMMONED" &&
    event.playerId === "ai" &&
    eventReferencesTemplate(event, "trio-sun-judicator")
  );
  const chantIndex = events.findIndex((event) =>
    event.type === "CARD_ACTIVATED" && event.cardId === chant.uid
  );
  const sun = ctx.state.ai.field.find((card) => card?.id === "trio-sun-judicator");
  const decisionLog = (ctx.state.log || []).find((entry) =>
    logEntryMessage(entry).includes("三曜部署完成后才发动「战意高扬」")
  );

  if (trioSummonIndex < 0 || chantIndex <= trioSummonIndex) {
    throw new Error(`${smokeName}: war chant must resolve after the trio tribute summon. ${smokeDebug(ctx)}`);
  }
  if (!sun || sun.tempAtk !== 500 || !ctx.state.ai.grave.some((card) => card?.uid === chant.uid)) {
    throw new Error(`${smokeName}: the delayed investment must strengthen sun and then enter the grave. ${smokeDebug(ctx)}`);
  }
  if (!decisionLog || decisionLog.cardId !== "war-chant") {
    throw new Error(`${smokeName}: the public decision log must explain the delayed visible spell. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioTrapPlanningBasicSmoke(ctx) {
  const smokeName = "trio-trap-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioTrapPlanning");
  const weakeningWeb = ctx.state.ai.traps.find((card) => card?.id === "weakening-web");
  const voidLock = ctx.state.ai.traps.find((card) => card?.id === "void-lock");
  const attacker = ctx.state.player.field.find((card) => card?.id === "solar-vanguard");
  const defender = ctx.state.ai.field.find((card) => card?.id === "gale-mage");
  if (!weakeningWeb || !voidLock || !attacker || !defender) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "solar-vanguard"), `${smokeName}: select attacker`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "gale-mage")?.classList.contains("attack-target"),
    `${smokeName}: defender becomes attackable`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "gale-mage"), `${smokeName}: declare threatening attack`);
  await waitForSmoke(
    () => ctx.els.aiRevealModal?.classList.contains("show") &&
      ctx.els.aiRevealTitle?.textContent.includes("星界封锁"),
    `${smokeName}: AI reveals the full negate instead of weakening`,
    12000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue trap reveal`);
  await waitForSmoke(
    () => ctx.state.ai.grave.some((card) => card?.uid === voidLock.uid) &&
      ctx.state.ai.traps.some((card) => card?.uid === weakeningWeb.uid) &&
      ctx.state.player.field.some((card) => card?.uid === attacker.uid) &&
      ctx.state.ai.field.some((card) => card?.uid === defender.uid) &&
      !ctx.els.aiRevealModal?.classList.contains("show") &&
      !ctx.els.chainModal?.classList.contains("show"),
    `${smokeName}: negate resolves while weakening remains set`,
    14000
  );
  const attackEvents = (ctx.state.gameEvents || []).filter((event) =>
    event.type === "ATTACK_DECLARED" && event.attackerCardId === attacker.uid
  );
  const activatedWeakening = (ctx.state.gameEvents || []).some((event) =>
    event.type === "CARD_ACTIVATED" && event.cardId === weakeningWeb.uid
  );
  if (attackEvents.length !== 1 || activatedWeakening ||
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "BATTLE_RESOLVED" && event.attackerCardId === attacker.uid
      )) {
    throw new Error(`${smokeName}: only void lock should answer and the canceled attack must not deal battle damage. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioTrapReservePlanningBasicSmoke(ctx) {
  const smokeName = "trio-trap-reserve-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioTrapReservePlanning");
  const firstAttacker = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  const secondAttacker = ctx.state.player.field.find((card) => card?.id === "trio-sun-judicator");
  const firstDefender = ctx.state.ai.field.find((card) => card?.id === "gale-mage");
  const secondDefender = ctx.state.ai.field.find((card) => card?.id === "void-siege-breaker");
  const voidLock = ctx.state.ai.traps.find((card) => card?.id === "void-lock");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!firstAttacker || !secondAttacker || !firstDefender || !secondDefender || !voidLock) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), `${smokeName}: select first attacker`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "gale-mage")?.classList.contains("attack-target"),
    `${smokeName}: expendable defender becomes attackable`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "gale-mage"), `${smokeName}: attack expendable defender`);
  await waitForSmoke(
    () => ctx.state.ai.grave.some((card) => card?.uid === firstDefender.uid) &&
      ctx.state.ai.traps.some((card) => card?.uid === voidLock.uid) &&
      firstAttacker.used &&
      ctx.state.actionWindow === "battle" &&
      !ctx.els.aiRevealModal?.classList.contains("show") &&
      !ctx.els.chainModal?.classList.contains("show"),
    `${smokeName}: AI accepts the first loss and preserves its negate. ${smokeDebug(ctx)}`,
    14000
  );
  if ((ctx.state.gameEvents || []).some((event) =>
    Number(event.id) > eventIdBefore &&
    event.type === "CARD_ACTIVATED" &&
    event.cardId === voidLock.uid
  )) {
    throw new Error(`${smokeName}: the only hard negate must not answer the first attack. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-sun-judicator"), `${smokeName}: select high-threat attacker`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "void-siege-breaker")?.classList.contains("attack-target"),
    `${smokeName}: protected ace becomes attackable`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "void-siege-breaker"), `${smokeName}: declare high-threat attack`);
  await waitForSmoke(
    () => ctx.els.aiRevealModal?.classList.contains("show") &&
      ctx.els.aiRevealTitle?.textContent.includes("星界封锁"),
    `${smokeName}: AI reveals the reserved hard negate`,
    12000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue reserved trap reveal`);
  await waitForSmoke(
    () => ctx.state.ai.grave.some((card) => card?.uid === voidLock.uid) &&
      ctx.state.ai.field.some((card) => card?.uid === secondDefender.uid) &&
      secondAttacker.used &&
      !ctx.els.aiRevealModal?.classList.contains("show") &&
      !ctx.els.chainModal?.classList.contains("show"),
    `${smokeName}: reserved negate cancels the high-threat attack. ${smokeDebug(ctx)}`,
    14000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const firstBattle = events.find((event) =>
    event.type === "BATTLE_RESOLVED" && event.attackerCardId === firstAttacker.uid
  );
  const secondDeclaration = events.find((event) =>
    event.type === "ATTACK_DECLARED" && event.attackerCardId === secondAttacker.uid
  );
  if (!firstBattle || !secondDeclaration ||
      !events.some((event) =>
        event.type === "ATTACK_CANCELED" &&
        event.attackerCardId === secondAttacker.uid &&
        String(event.declarationEventId) === String(secondDeclaration.id)
      ) ||
      events.some((event) => event.type === "BATTLE_RESOLVED" && event.attackerCardId === secondAttacker.uid) ||
      ctx.state.ai.lp !== 3400) {
    throw new Error(`${smokeName}: only the first attack should resolve before the reserved negate. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioDirectTrapPlanningBasicSmoke(ctx) {
  const smokeName = "trio-direct-trap-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioDirectTrapPlanning");
  const attacker = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  const guard = ctx.state.ai.traps.find((card) => card?.id === "guard-sigil");
  const rebound = ctx.state.ai.traps.find((card) => card?.id === "reversal-flare");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!attacker || !guard || !rebound || ctx.state.player.lp !== 500 || ctx.state.ai.lp !== 2400) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(handCard(ctx.els, "star-breach"), `${smokeName}: select direct strike spell`);
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: direct strike confirmation enabled`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: activate direct strike`);
  await waitForSmoke(
    () => ctx.state.player.directAttacks > 0,
    `${smokeName}: direct attack permission granted`
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), `${smokeName}: select attacker`);
  await waitForSmoke(
    () => ctx.els.aiPanel.classList.contains("direct-target"),
    `${smokeName}: direct target highlighted`,
    6000
  );
  clickSmokeElement(ctx.els.aiPanel, `${smokeName}: declare direct attack`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "ai" && !ctx.state.aiRunning,
    `${smokeName}: rebound ends the duel. ${smokeDebug(ctx)}`,
    12000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const reboundDamage = events.find((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === "player" &&
    event.sourceCardId === rebound.uid
  );
  const reboundLog = (ctx.state.timeline || []).find((entry) =>
    logEntryMessage(entry).includes("逆焰护壁")
  );
  if (!events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === rebound.uid) ||
      events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === guard.uid) ||
      reboundDamage?.amount !== 500 || reboundLog?.cardId !== "reversal-flare") {
    throw new Error(`${smokeName}: only reversal flare should activate and reflect 500 damage. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.player.lp !== 0 || ctx.state.ai.lp !== 2400 ||
      !ctx.state.ai.grave.some((card) => card?.uid === rebound.uid) ||
      !ctx.state.ai.traps.some((card) => card?.uid === guard.uid)) {
    throw new Error(`${smokeName}: rebound must win while guard sigil remains set. ${smokeDebug(ctx)}`);
  }
  const machine = projectMachineStateFromEvents(ctx.state.gameEvents || [], ctx.state.phase);
  if (machine.responseWindow || machine.pendingAttack ||
      machine.actionWindow?.window !== "gameOver" ||
      ctx.state.actionWindow !== "gameOver" ||
      ctx.els.toast?.textContent?.includes("Cannot cancel attack while a response window is open")) {
    throw new Error(`${smokeName}: lethal rebound must clear attack response state without a stale cancel error. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioChainLifecycleBasicSmoke(ctx) {
  const smokeName = "trio-chain-lifecycle-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioChainLifecycle");
  const sun = ctx.state.ai.field.find((card) => card?.id === "trio-sun-judicator");
  const solarSnare = ctx.state.player.traps.find((card) => card?.id === "trio-solar-snare");
  const nullifier = ctx.state.ai.traps.find((card) => card?.id === "chain-nullifier");
  if (!sun || !solarSnare || !nullifier || ctx.state.player.lp !== 3050) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }
  const lpDisplaySamples = [ctx.els.playerLp.textContent.trim()];
  const lpDisplayObserver = new MutationObserver(() => {
    lpDisplaySamples.push(ctx.els.playerLp.textContent.trim());
  });
  lpDisplayObserver.observe(ctx.els.playerLp, { childList: true, characterData: true, subtree: true });

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show"),
    `${smokeName}: solar snare response prompt opens. ${smokeDebug(ctx)}`,
    16000
  );
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: activate solar snare`);
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).some((event) =>
      event.type === "CHAIN_LINK_COMMITTED" && event.cardId === solarSnare.uid
    ) &&
      ctx.state.player.traps.some((card) => card?.uid === solarSnare.uid) &&
      !ctx.state.player.grave.some((card) => card?.uid === solarSnare.uid),
    `${smokeName}: committed solar snare remains visible before chain resolution. ${smokeDebug(ctx)}`,
    4000
  );
  // The AI chain response and battle animation use production timers; let those complete before virtual polling resumes.
  await new Promise((resolve) => window.setTimeout(resolve, 7000));
  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      !ctx.state.aiRunning &&
      ctx.state.player.lp === 850,
    `${smokeName}: protected sun attack resolves to the expected surviving LP. ${smokeDebug(ctx)}`,
    30000
  );

  if (!ctx.state.player.grave.some((card) => card?.uid === solarSnare.uid) ||
      !ctx.state.ai.grave.some((card) => card?.uid === nullifier.uid) ||
      ctx.els.playerLp.textContent.trim() !== "850 / 4000" ||
      lpDisplaySamples.some((text) => text.startsWith("0 /"))) {
    throw new Error(`${smokeName}: resolved chain or LP HUD is inconsistent. ${smokeDebug(ctx)}`);
  }
  lpDisplayObserver.disconnect();
  setSmokeStatus("passed", smokeName);
}

async function runTrioShieldLethalPlanningBasicSmoke(ctx) {
  const smokeName = "trio-shield-lethal-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioShieldLethalPlanning");
  const breach = ctx.state.ai.hand.find((card) => card?.id === "star-breach");
  const sun = ctx.state.ai.field.find((card) => card?.id === "trio-sun-judicator");
  const saint = ctx.state.player.field.find((card) => card?.id === "prism-saint");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!breach || !sun || !saint || ctx.state.player.lp !== 2000 || ctx.state.player.shield !== 2000) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      ctx.state.actionWindow === "main" &&
      !ctx.state.aiRunning,
    `${smokeName}: AI completes the shield-aware attack turn. ${smokeDebug(ctx)}`,
    30000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const attack = events.find((event) =>
    event.type === "ATTACK_DECLARED" && event.attackerCardId === sun.uid
  );
  const breachActivated = events.some((event) =>
    event.type === "CARD_ACTIVATED" && event.cardId === breach.uid
  );
  if (!attack || attack.targetCardId !== saint.uid || breachActivated) {
    throw new Error(`${smokeName}: shielded false lethal must not spend direct strike or bypass the monster. ${smokeDebug(ctx)}`);
  }
  if (!ctx.state.player.grave.some((card) => card?.uid === saint.uid) ||
      !ctx.state.ai.hand.some((card) => card?.uid === breach.uid) ||
      ctx.state.player.lp !== 2000 || ctx.state.player.shield !== 0 || ctx.state.gameOver) {
    throw new Error(`${smokeName}: sun should clear the monster into shield without dealing LP damage. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioAfterAttackLethalPlanningBasicSmoke(ctx) {
  const smokeName = "trio-after-attack-lethal-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioAfterAttackLethalPlanning");
  const breach = ctx.state.ai.hand.find((card) => card?.id === "star-breach");
  const star = ctx.state.ai.field.find((card) => card?.id === "trio-star-herald");
  const saint = ctx.state.player.field.find((card) => card?.id === "prism-saint");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!breach || !star || !saint || ctx.state.player.lp !== 2700) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "star-breach"),
    `${smokeName}: AI reveals direct strike for the exact lethal route`,
    12000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue direct strike reveal`);
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "trio-star-herald"),
    `${smokeName}: AI reveals star after-attack effect`,
    12000
  );
  if (ctx.state.player.lp !== 0 || ctx.els.playerLp?.textContent.trim() !== "300 / 4000") {
    throw new Error(`${smokeName}: the HUD must stage base attack damage before revealing the lethal star effect. ${smokeDebug(ctx)}`);
  }
  const soundWasOn = ctx.state.soundOn;
  clickSmokeElement(ctx.els.soundBtn, `${smokeName}: toggle sound during staged effect reveal`);
  await waitForSmoke(
    () => ctx.state.soundOn !== soundWasOn,
    `${smokeName}: sound preference should update during the reveal`
  );
  if (ctx.els.playerLp?.textContent.trim() !== "300 / 4000") {
    throw new Error(`${smokeName}: unrelated settings renders must preserve the staged LP display. ${smokeDebug(ctx)}`);
  }
  const starEffectSummary = ctx.els.aiRevealSummary?.textContent || "";
  if (!starEffectSummary.includes("追加造成 300 点伤害") ||
      !starEffectSummary.includes("攻击力提升 300")) {
    throw new Error(`${smokeName}: star reveal must explain the exact damage and growth. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue star effect reveal`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "ai" && !ctx.state.aiRunning,
    `${smokeName}: direct attack plus after-attack damage ends the duel. ${smokeDebug(ctx)}`,
    24000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const attack = events.find((event) =>
    event.type === "ATTACK_DECLARED" && event.attackerCardId === star.uid
  );
  const damage = events
    .filter((event) => event.type === "DAMAGE_DEALT" && event.sourceCardId === star.uid)
    .map((event) => event.amount);
  const baseDamageEvent = events.find((event) =>
    event.type === "DAMAGE_DEALT" && event.sourceCardId === star.uid && event.amount === 2400
  );
  const effectDamageEvent = events.find((event) =>
    event.type === "DAMAGE_DEALT" && event.sourceCardId === star.uid && event.amount === 300
  );
  const growthEvent = events.find((event) =>
    event.type === "STAT_MODIFIED" && event.sourceCardId === star.uid
    && event.cardId === star.uid && event.stat === "tempAtk" && event.amount === 300
  );
  const resolutionEvent = events.find((event) =>
    event.type === "AFTER_ATTACK_EFFECT_RESOLVED"
    && event.cardId === star.uid && event.effectId === "starDoomCharge"
  );
  if (!events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === breach.uid) ||
      !attack || attack.targetCardId || !events.some((event) =>
        event.type === "ABILITY_SPENT" && event.ability === "directAttack"
      )) {
    throw new Error(`${smokeName}: AI must spend direct strike and bypass the monster. ${smokeDebug(ctx)}`);
  }
  if (damage.length !== 2 || damage[0] !== 2400 || damage[1] !== 300 ||
      !ctx.state.player.field.some((card) => card?.uid === saint.uid) ||
      ctx.state.player.lp !== 0 || ctx.els.playerLp?.textContent.trim() !== "0 / 4000" ||
      star.tempAtk !== 300) {
    throw new Error(`${smokeName}: star must deal 2400 plus 300 while leaving the bypassed monster in play. ${smokeDebug(ctx)}`);
  }
  if (!baseDamageEvent || !effectDamageEvent || !growthEvent ||
      !resolutionEvent?.resultEventIds?.includes(effectDamageEvent.id) ||
      !resolutionEvent.resultEventIds.includes(growthEvent.id) ||
      resolutionEvent.resultEventIds.includes(baseDamageEvent.id)) {
    throw new Error(`${smokeName}: star feedback must associate only its explicit after-attack result events. ${smokeDebug(ctx)}`);
  }
  const starEffectLog = (ctx.state.log || []).find((entry) => {
    const message = logEntryMessage(entry);
    return message.includes("追加造成 300 点伤害") && message.includes("攻击力提升 300");
  });
  if (!starEffectLog || starEffectLog.cardId !== "trio-star-herald") {
    throw new Error(`${smokeName}: public log must preserve the exact star damage and growth. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioCombinedLethalPlanningBasicSmoke(ctx) {
  const smokeName = "trio-combined-lethal-planning-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trioCombinedLethalPlanning");
  const breach = ctx.state.ai.hand.find((card) => card?.id === "star-breach");
  const sun = ctx.state.ai.field.find((card) => card?.id === "trio-sun-judicator");
  const star = ctx.state.ai.field.find((card) => card?.id === "trio-star-herald");
  const saint = ctx.state.player.field.find((card) => card?.id === "prism-saint");
  const mage = ctx.state.player.field.find((card) => card?.id === "gale-mage");
  const eventIdBefore = Number(ctx.state.gameEvents?.at(-1)?.id) || 0;
  if (!breach || !sun || !star || !saint || !mage || ctx.state.player.lp !== 4500) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "star-breach"),
    `${smokeName}: AI reveals direct strike for the combined lethal route`,
    12000
  );
  clickSmokeElementCenter(ctx.els.aiRevealContinue, `${smokeName}: continue direct strike reveal`);
  try {
    await waitForSmoke(
      () => aiRevealVisible(ctx.els),
      `${smokeName}: AI reaches the next real public effect`,
      30000
    );
  } catch (error) {
    throw new Error(`${error.message}. ${smokeDebug(ctx)}`);
  }
  if (aiRevealVisible(ctx.els, "trio-sun-judicator")) {
    throw new Error(`${smokeName}: sun must not reveal an after-attack effect without a declaration target. ${smokeDebug(ctx)}`);
  }
  if (!aiRevealVisible(ctx.els, "trio-star-herald")) {
    throw new Error(`${smokeName}: star should be the next real public after-attack effect. ${smokeDebug(ctx)}`);
  }
  clickSmokeElementCenter(ctx.els.aiRevealContinue, `${smokeName}: continue star effect reveal`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "ai" && !ctx.state.aiRunning,
    `${smokeName}: direct and follow-up attacks end the duel. ${smokeDebug(ctx)}`,
    30000
  );

  const events = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > eventIdBefore);
  const attacks = events.filter((event) => event.type === "ATTACK_DECLARED" && event.playerId === "ai");
  const damage = events
    .filter((event) => event.type === "DAMAGE_DEALT" && event.playerId === "player")
    .map((event) => event.amount);
  if (!events.some((event) => event.type === "CARD_ACTIVATED" && event.cardId === breach.uid) ||
      attacks.length !== 2 || attacks[0].attackerCardId !== sun.uid || attacks[0].targetCardId ||
      attacks[1].attackerCardId !== star.uid || attacks[1].targetCardId !== mage.uid) {
    throw new Error(`${smokeName}: AI must direct with sun before star attacks the higher weak target. ${smokeDebug(ctx)}`);
  }
  if (damage.length !== 3 || damage[0] !== 3000 || damage[1] !== 1200 || damage[2] !== 300 ||
      !ctx.state.player.field.some((card) => card?.uid === saint.uid) ||
      !ctx.state.player.grave.some((card) => card?.uid === mage.uid) ||
      ctx.state.player.lp !== 0 || star.tempAtk !== 300) {
    throw new Error(`${smokeName}: combined lethal must deal 3000, 1200, and 300 while bypassing saint. ${smokeDebug(ctx)}`);
  }
  const messages = (ctx.state.log || []).map(logEntryMessage);
  if (!messages.some((message) => message.includes("差值 1200") && message.includes("造成 1200 点战斗伤害")) ||
      messages.some((message) => message.includes("造成 1500 点战斗伤害")) ||
      !messages.some((message) => message.includes("追加造成 300 点伤害"))) {
    throw new Error(`${smokeName}: base battle damage and the 300-point after-attack effect must have separate log entries. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runAiEngineLegalityBasicSmoke(ctx) {
  const smokeName = "ai-engine-legality-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "guardSkip");
  const attackEventsBefore = countGameEvents(ctx.state, "ATTACK_DECLARED");

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "ai" && ctx.state.actionWindow === "ai" && ctx.state.aiRunning,
    `${smokeName}：AI 行动窗口`
  );

  const locked = cloneCardById("trio-sun-judicator");
  const ready = cloneCardById("star-lancer");
  if (!locked || !ready) throw new Error(`${smokeName}：测试怪兽定义缺失`);
  locked.attackLockReason = "trioConvergence";
  locked.mode = "attack";
  locked.used = false;
  ready.mode = "attack";
  ready.used = false;
  ctx.state.ai.field = [locked, ready, null, null, null];
  ctx.state.ai.hand = [];
  ctx.state.ai.deck = [];
  ctx.state.ai.traps = [null, null, null, null, null];
  ctx.state.player.field = [null, null, null, null, null];
  ctx.state.player.traps = [null, null, null, null, null];
  ctx.render?.();

  await waitForSmoke(
    () => (ctx.state.gameEvents || []).some((event) =>
      event.type === "ATTACK_DECLARED" && event.attackerCardId === ready.uid
    ),
    `${smokeName}：AI 改用合法怪兽攻击`,
    22000
  );
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.aiRunning,
    `${smokeName}：完整回合返回玩家`,
    26000
  );

  const newAttackEvents = (ctx.state.gameEvents || [])
    .filter((event) => event.type === "ATTACK_DECLARED")
    .slice(attackEventsBefore);
  if (newAttackEvents.some((event) => event.attackerCardId === locked.uid)) {
    throw new Error(`${smokeName}：受攻击限制的怪兽不应宣言攻击`);
  }
  if (!newAttackEvents.some((event) => event.attackerCardId === ready.uid)) {
    throw new Error(`${smokeName}：AI 应跳过非法候选并使用合法怪兽`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runAiExtraSummonBasicSmoke(ctx) {
  const smokeName = "ai-extra-summon-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "chain");
  const summonEventsBefore = (ctx.state.gameEvents || []).filter((event) =>
    event.type === "MONSTER_SUMMONED" && event.playerId === "ai"
  ).length;

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "ai" && ctx.state.actionWindow === "ai" && ctx.state.aiRunning,
    `${smokeName}：AI 行动窗口`
  );
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).some((event) =>
      event.type === "ABILITY_GRANTED" && event.playerId === "ai" && event.ability === "extraSummon"
    ),
    `${smokeName}：AI 获得额外召唤机会`,
    16000
  );
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).filter((event) =>
      event.type === "MONSTER_SUMMONED" && event.playerId === "ai"
    ).length >= summonEventsBefore + 2,
    `${smokeName}：AI 完成普通召唤和额外召唤`,
    24000
  );

  if (!(ctx.state.gameEvents || []).some((event) =>
    event.type === "ABILITY_SPENT" && event.playerId === "ai" && event.ability === "extraSummon"
  )) {
    throw new Error(`${smokeName}：第二次召唤必须消费引擎授予的额外召唤机会`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runResponseActionLockBasicSmoke(ctx) {
  const smokeName = "response-action-lock-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "chain");
  clickSmokeElement(handCard(ctx.els, "iron-guardian"), `${smokeName}：选择铁壁守卫`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), `${smokeName}：召唤铁壁守卫`);
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "iron-guardian",
    `${smokeName}：怪兽召唤完成`
  );
  clickSmokeElement(handCard(ctx.els, "void-lock"), `${smokeName}：选择虚空封锁`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}：盖放虚空封锁`);
  await waitForSmoke(
    () => ctx.state.player.traps.some((card) => card?.id === "void-lock"),
    `${smokeName}：陷阱盖放完成`
  );

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") && ctx.state.pendingTrapChoice,
    `${smokeName}：等待陷阱响应窗口`,
    24000
  );
  const before = JSON.stringify({
    hand: ctx.state.player.hand.map((card) => card.uid),
    field: ctx.state.player.field.map((card) => card?.uid || null),
    traps: ctx.state.player.traps.map((card) => card?.uid || null),
    eventCount: (ctx.state.gameEvents || []).length,
    responseEvent: ctx.state.pendingTrapChoice.eventName
  });
  const blockedCard = ctx.state.player.hand.find((card) => card?.id === "gale-mage");
  clickSmokeElement(handCard(ctx.els, "gale-mage"), `${smokeName}：响应期间尝试选择普通手牌`);
  await waitForSmoke(
    () => document.querySelector("#detailName")?.textContent === blockedCard?.name &&
      ctx.els.chainModal.classList.contains("show") &&
      ctx.state.pendingTrapChoice,
    `${smokeName}：普通行动被拦截但详情仍可查看`
  );
  const after = JSON.stringify({
    hand: ctx.state.player.hand.map((card) => card.uid),
    field: ctx.state.player.field.map((card) => card?.uid || null),
    traps: ctx.state.player.traps.map((card) => card?.uid || null),
    eventCount: (ctx.state.gameEvents || []).length,
    responseEvent: ctx.state.pendingTrapChoice.eventName
  });
  if (after !== before) {
    throw new Error(`${smokeName}：被拦截的普通行动改变了决斗状态`);
  }

  clickSmokeElement(ctx.els.chainYes, `${smokeName}：发动虚空封锁`);
  await waitForSmoke(
    () => !ctx.state.pendingTrapChoice &&
      !ctx.state.player.traps.some((card) => card?.id === "void-lock") &&
      (ctx.state.gameEvents || []).some((event) => event.type === "CHAIN_RESOLVED"),
    `${smokeName}：合法陷阱响应继续完成`,
    9000
  );
  setSmokeStatus("passed", smokeName);
}

async function runSummonEffectsSmoke(ctx) {
  setSmokeStatus("running", "summon-effects");
  await startSmokeDuel(ctx, "summonEffects");
  ctx.state.player.lp = 3600;
  ctx.state.player.extraSummon = 2;
  const aiLpBefore = ctx.state.ai.lp;
  clickSmokeElement(handCard(ctx.els, "ember-drake"), "summon ember drake");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "ember drake slot");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "ember-drake" &&
      ctx.state.ai.lp === aiLpBefore - 200 &&
      countGameEvents(ctx.state, "DAMAGE_DEALT") >= 1,
    "ember on-summon burn through event",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "gale-mage"), "summon gale mage");
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "gale mage slot");
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "gale-mage" &&
      ctx.state.player.hand.some((card) => card?.id === "prism-saint") &&
      countGameEvents(ctx.state, "CARDS_DRAWN") >= 1,
    "gale on-summon draw through event",
    9000
  );

  ctx.state.player.lp = 3000;
  const lpBeforeHeal = ctx.state.player.lp;
  clickSmokeElement(handCard(ctx.els, "night-oracle"), "summon night oracle");
  clickSmokeElement(fieldSlot(ctx.els, "player", 2), "night oracle slot");
  await waitForSmoke(
    () => ctx.state.player.field[2]?.id === "night-oracle" &&
      ctx.state.player.lp === lpBeforeHeal + 300 &&
      countGameEvents(ctx.state, "LP_HEALED") >= 1,
    "night oracle on-summon heal through event",
    9000
  );

  if (ctx.state.player.normalSummonsUsed !== 1 || ctx.state.player.extraSummon !== 0) {
    throw new Error("连续三次召唤后应保留一次普通召唤记录并耗尽两次额外召唤");
  }
  if (countGameEvents(ctx.state, "NORMAL_SUMMON_USED") !== 1 ||
      (ctx.state.gameEvents || []).filter((event) => event.type === "ABILITY_SPENT" && event.ability === "extraSummon").length !== 2) {
    throw new Error("连续召唤缺少普通召唤或额外召唤消耗事件");
  }

  setSmokeStatus("passed", "summon-effects");
}

async function runTributeSummonSmoke(ctx) {
  setSmokeStatus("running", "tribute-summon");
  await startSmokeDuel(ctx, "tributeSummon");
  if (ctx.state.player.field[0]?.id !== "spark-runner") {
    throw new Error("tribute-summon: material monster should start on player field");
  }
  clickSmokeElement(handCard(ctx.els, "solar-vanguard"), "tribute-summon: select high-level monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cardName &&
      ctx.state.pendingTribute.cost === 1 &&
      ctx.state.pendingTribute.selectedIndexes?.length === 1 &&
      !ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon: only available tribute is selected by default"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-summon: manually unselect default tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 0 && ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon: default tribute can still be edited"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-summon: reselect field tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 && !ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon: tribute card reselected"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon: confirm tribute summon");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "solar-vanguard" &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      !ctx.state.pendingTribute,
    "tribute-summon: vanguard summoned and material sent to grave",
    9000
  );
  if (!countGameEvents(ctx.state, "CARD_TRIBUTED")) {
    throw new Error("tribute-summon: CARD_TRIBUTED event missing");
  }
  if (!countGameEvents(ctx.state, "MONSTER_SUMMONED")) {
    throw new Error("tribute-summon: MONSTER_SUMMONED event missing");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("曜锋先锋"))) {
    throw new Error("tribute-summon: public log should mention the tribute summoned monster");
  }
  setSmokeStatus("passed", "tribute-summon");
}

async function runSummonPositionBasicSmoke(ctx) {
  setSmokeStatus("running", "summon-position-basic");
  await startSmokeDuel(ctx, "summonEffects");
  const card = handCard(ctx.els, "ember-drake");
  if (!card) throw new Error("summon-position-basic: summon card should be in hand");
  clickSmokeElement(card, "summon-position-basic: select monster");
  clickSmokeElement(fieldSlot(ctx.els, "player", 3), "summon-position-basic: choose fourth monster slot");
  await waitForSmoke(
    () => ctx.state.player.field[3]?.id === "ember-drake" &&
      ctx.state.gameEvents.some((event) => event.type === "CARD_MOVED" && event.cardId === ctx.state.player.field[3]?.uid && event.to?.index === 3),
    "summon-position-basic: monster reaches the selected fixed slot",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "summon-position-basic");
  setSmokeStatus("passed", "summon-position-basic");
}

async function runTributeSummonBasicSmoke(ctx) {
  setSmokeStatus("running", "tribute-summon-basic");
  await startSmokeDuel(ctx, "tributeSummon");
  clickSmokeElement(handCard(ctx.els, "solar-vanguard"), "tribute-summon-basic: select monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon-basic: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 && !ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon-basic: one material selected"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon-basic: confirm summon");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "solar-vanguard" &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      ctx.state.gameEvents.some((event) => event.type === "CARD_TRIBUTED"),
    "tribute-summon-basic: material leaves and summoned monster enters",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "tribute-summon-basic");
  setSmokeStatus("passed", "tribute-summon-basic");
}

async function runTributeReadabilityBasicSmoke(ctx) {
  setSmokeStatus("running", "tribute-readability-basic");
  await startSmokeDuel(ctx, "tributeSummonDouble");
  clickSmokeElement(handCard(ctx.els, "starfall-colossus"), "tribute-readability-basic: select monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-readability-basic: enter tribute selection");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("需要解放 2 只怪兽") &&
      ctx.els.choiceText.textContent.includes("已选择 2 / 2") &&
      ctx.els.choiceText.textContent.includes("星火信使") &&
      ctx.els.choiceText.textContent.includes("微光机巧卫"),
    "tribute-readability-basic: requirement and auto-selected materials are visible"
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-readability-basic: unselect first material");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("已选择 1 / 2：微光机巧卫") &&
      ctx.els.choiceText.textContent.includes("还差 1 只解放素材") &&
      ctx.els.choiceText.textContent.includes("请选择第 2 只解放素材"),
    "tribute-readability-basic: selected name and remaining material are visible"
  );

  const selectedBeforeInvalidClicks = ctx.state.pendingTribute.selectedIndexes.slice();
  clickSmokeElement(fieldSlot(ctx.els, "player", 2), "tribute-readability-basic: click empty own slot");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：该格为空。",
    "tribute-readability-basic: empty slot explains why it is invalid"
  );
  if (ctx.state.pendingTribute.selectedIndexes.join(",") !== selectedBeforeInvalidClicks.join(",")) {
    throw new Error("tribute-readability-basic: empty slot changed tribute selection");
  }

  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "tribute-readability-basic: click enemy monster");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：不是己方怪兽。",
    "tribute-readability-basic: enemy monster explains why it is invalid"
  );
  if (ctx.state.pendingTribute.selectedIndexes.join(",") !== selectedBeforeInvalidClicks.join(",")) {
    throw new Error("tribute-readability-basic: enemy monster changed tribute selection");
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-readability-basic: restore first material");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("已选择 2 / 2：星火信使、微光机巧卫") &&
      ctx.els.choiceText.textContent.includes("解放素材已齐"),
    "tribute-readability-basic: completed selection is explicit"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-readability-basic: confirm summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "starfall-colossus") &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.grave.some((card) => card?.id === "lumen-gearlet") &&
      !ctx.state.pendingTribute,
    "tribute-readability-basic: legal tribute summon completes",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "tribute-readability-basic");

  const summoned = ctx.state.player.field.find((card) => card?.id === "starfall-colossus");
  await waitForSmoke(() => logCardLink(ctx.els, "starfall-colossus"), "tribute-readability-basic: public log card link");
  clickSmokeElement(logCardLink(ctx.els, "starfall-colossus"), "tribute-readability-basic: open log card detail");
  await assertCardDetailModal(ctx, summoned, "tribute-readability-basic");
  setSmokeStatus("passed", "tribute-readability-basic");
}

async function runFusionSummonBasicSmoke(ctx) {
  setSmokeStatus("running", "fusion-summon-basic");
  await startSmokeDuel(ctx, "fusionSummon");
  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-summon-basic: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-summon-basic: enter material selection");
  await waitForSmoke(() => Boolean(ctx.state.pendingFusion), "fusion-summon-basic: fusion selection opens");
  clickSmokeElementCenter(fieldCard(ctx.els, "player", "ember-drake"), "fusion-summon-basic: select ember material");
  clickSmokeElementCenter(fieldCard(ctx.els, "player", "gale-mage"), "fusion-summon-basic: select gale material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 2 && !ctx.els.choiceConfirmBtn.disabled,
    "fusion-summon-basic: exact materials selected"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-summon-basic: confirm fusion");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-gale-archon") &&
      ctx.state.player.grave.some((card) => card?.id === "ember-drake") &&
      ctx.state.player.grave.some((card) => card?.id === "gale-mage") &&
      ctx.state.gameEvents.some((event) => event.type === "FUSION_SUMMONED"),
    "fusion-summon-basic: materials leave and result enters",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "fusion-summon-basic");
  setSmokeStatus("passed", "fusion-summon-basic");
}

async function runFusionReadabilityBasicSmoke(ctx) {
  setSmokeStatus("running", "fusion-readability-basic");
  await startSmokeDuel(ctx, "fusionMixedMaterials");
  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-readability-basic: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-readability-basic: enter material selection");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("融合召唤「焰岚合星者」") &&
      ctx.els.choiceText.textContent.includes("需要素材：赤焰幼龙、疾风术士") &&
      ctx.els.choiceText.textContent.includes("已选择 0 / 2：无") &&
      ctx.els.choiceText.textContent.includes("还缺素材：赤焰幼龙、疾风术士"),
    "fusion-readability-basic: result and full recipe are visible"
  );
  if (window.innerWidth <= 720) {
    const choiceRect = ctx.els.choiceActions.getBoundingClientRect();
    const handMaterialRect = handCard(ctx.els, "gale-mage").getBoundingClientRect();
    const coversHandMaterial = choiceRect.left < handMaterialRect.right &&
      choiceRect.right > handMaterialRect.left &&
      choiceRect.top < handMaterialRect.bottom &&
      choiceRect.bottom > handMaterialRect.top;
    if (coversHandMaterial) {
      throw new Error("fusion-readability-basic: fusion prompt should not cover the hand material on narrow screens");
    }
  }
  const emberSlot = fieldSlot(ctx.els, "player", 0);
  if (!emberSlot?.classList.contains("fusion-candidate") || emberSlot.dataset.materialReason !== "可选择「赤焰幼龙」作为融合素材。") {
    throw new Error("fusion-readability-basic: field material should expose a fusion-specific candidate reason");
  }

  clickSmokeElementCenter(fieldCard(ctx.els, "player", "ember-drake"), "fusion-readability-basic: select field material");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("已选择 1 / 2：赤焰幼龙（场上）") &&
      ctx.els.choiceText.textContent.includes("还缺素材：疾风术士") &&
      ctx.els.choiceConfirmBtn.disabled,
    "fusion-readability-basic: selected field material and missing hand material are visible"
  );

  const selectionBeforeInvalidClicks = {
    indexes: ctx.state.pendingFusion.selectedIndexes.slice(),
    handUids: ctx.state.pendingFusion.selectedHandUids.slice()
  };
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "fusion-readability-basic: click empty own slot");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该素材：该格为空。",
    "fusion-readability-basic: empty slot explains why it is invalid"
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "fusion-readability-basic: click enemy monster");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该素材：不是己方怪兽。",
    "fusion-readability-basic: enemy monster explains why it is invalid"
  );
  clickSmokeElement(handCard(ctx.els, "war-chant"), "fusion-readability-basic: click non-monster hand card");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该素材：不是怪兽。",
    "fusion-readability-basic: non-monster hand card explains why it is invalid"
  );
  if (ctx.state.pendingFusion.selectedIndexes.join(",") !== selectionBeforeInvalidClicks.indexes.join(",") ||
      ctx.state.pendingFusion.selectedHandUids.join(",") !== selectionBeforeInvalidClicks.handUids.join(",")) {
    throw new Error("fusion-readability-basic: invalid clicks changed the selected materials");
  }

  clickSmokeElement(handCard(ctx.els, "gale-mage"), "fusion-readability-basic: select legal hand material");
  await waitForSmoke(
    () => ctx.els.choiceText?.textContent.includes("已选择 2 / 2：赤焰幼龙（场上）、疾风术士（手牌）") &&
      ctx.els.choiceText.textContent.includes("素材齐备，确认后完成融合召唤") &&
      !ctx.els.choiceConfirmBtn.disabled,
    "fusion-readability-basic: completed mixed selection is explicit"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-readability-basic: confirm fusion summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-gale-archon") &&
      ctx.state.player.grave.some((card) => card?.id === "ember-drake") &&
      ctx.state.player.grave.some((card) => card?.id === "gale-mage") &&
      !ctx.state.pendingFusion,
    "fusion-readability-basic: legal fusion completes",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "fusion-readability-basic");

  const result = ctx.state.player.field.find((card) => card?.id === "flare-gale-archon");
  await waitForSmoke(() => logCardLink(ctx.els, "flare-gale-archon"), "fusion-readability-basic: public result log link");
  clickSmokeElement(logCardLink(ctx.els, "flare-gale-archon"), "fusion-readability-basic: open result detail from log");
  await assertCardDetailModal(ctx, result, "fusion-readability-basic");
  setSmokeStatus("passed", "fusion-readability-basic");
}

async function runFusionOcclusionSmoke(ctx) {
  setSmokeStatus("running", "fusion-occlusion");
  await startSmokeDuel(ctx, "fusionMixedMaterials");
  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-occlusion: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-occlusion: enter material selection");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.resultId === "flare-gale-archon" &&
      ctx.els.choiceActions?.classList.contains("fusion-choice") &&
      !ctx.els.fusionPreview?.hidden,
    "fusion-occlusion: fusion selection opens"
  );
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)];
  };
  const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const assertClear = (stage) => {
    const panelRect = rectOf(ctx.els.choiceActions);
    const fieldRect = rectOf(fieldCard(ctx.els, "player", "ember-drake"));
    const handRect = rectOf(handCard(ctx.els, "gale-mage"));
    const fieldCovered = overlaps(panelRect, fieldRect);
    const handCovered = overlaps(panelRect, handRect);
    if (fieldCovered || handCovered) {
      throw new Error(
        `fusion-occlusion: panel covers materials (${stage}) viewport=${window.innerWidth}x${window.innerHeight} panel=[${panelRect.join(",")}] field=[${fieldRect.join(",")}] hand=[${handRect.join(",")}]`
      );
    }
  };
  assertClear("initial");
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), "fusion-occlusion: select field material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 1,
    "fusion-occlusion: field material selected"
  );
  assertClear("after-field-material");
  clickSmokeElement(handCard(ctx.els, "gale-mage"), "fusion-occlusion: select hand material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedHandUids?.length === 1,
    "fusion-occlusion: hand material selected"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-occlusion: confirm fusion summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-gale-archon") &&
      !ctx.state.pendingFusion,
    "fusion-occlusion: fusion completes",
    9000
  );
  setSmokeStatus("passed", `fusion-occlusion viewport=${window.innerWidth}x${window.innerHeight}`);
}

async function runTokenSplitBasicSmoke(ctx) {
  setSmokeStatus("running", "token-split-basic");
  await startSmokeDuel(ctx, "splitToken");
  clickSmokeElement(handCard(ctx.els, "spark-split"), "token-split-basic: select split spell");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "splitToken", "token-split-basic: source selection opens");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "spark-runner"), "token-split-basic: select source monster");
  await waitForSmoke(
    () => ctx.state.player.field.filter((card) => card?.id === "spark-fragment-token").length === 2 &&
      ctx.state.gameEvents.filter((event) => event.type === "CARD_CREATED" && event.originCardId).length === 2 &&
      auditLogEntries(ctx.state.timeline).ok,
    "token-split-basic: exactly two linked tokens are created",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "token-split-basic");
  setSmokeStatus("passed", "token-split-basic");
}

async function runTokenReadabilityBasicSmoke(ctx) {
  setSmokeStatus("running", "token-readability-basic");
  await startSmokeDuel(ctx, "splitToken");
  clickSmokeElement(handCard(ctx.els, "spark-split"), "token-readability-basic: select split spell");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "splitToken" &&
      ctx.state.pendingTarget?.selectedTargetSource === "default" &&
      ctx.els.choiceText?.textContent.includes("发动「星火分裂」") &&
      ctx.els.choiceText.textContent.includes("分裂来源：「星火信使」") &&
      ctx.els.choiceText.textContent.includes("将生成 2 只「星火衍生体」") &&
      ctx.els.choiceText.textContent.includes("需要 2 个空怪兽格。当前空位：4。空位充足") &&
      ctx.els.choiceText.textContent.includes("token 离场后会消失，不进入墓地、手牌或卡组") &&
      ctx.els.choiceText.textContent.includes("已默认选择") &&
      fieldCard(ctx.els, "player", "spark-runner")?.classList.contains("target-selected"),
    "token-readability-basic: source, count, space, and lifecycle are visible"
  );

  const sourceSlot = fieldSlot(ctx.els, "player", 0);
  if (!sourceSlot?.classList.contains("split-candidate") ||
      sourceSlot.dataset.targetReason !== "可选择「星火信使」作为分裂来源。") {
    throw new Error("token-readability-basic: source monster should expose a split-specific candidate reason");
  }
  const beforeInvalid = {
    pendingUid: ctx.state.pendingTarget.handUid,
    tokenCount: ctx.state.player.field.filter((card) => card?.id === "spark-fragment-token").length,
    handCount: ctx.state.player.hand.length
  };
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "token-readability-basic: click empty own slot");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该来源：该格为空。",
    "token-readability-basic: empty slot explains why it is invalid"
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "token-readability-basic: click enemy monster");
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该来源：不是己方怪兽。",
    "token-readability-basic: enemy monster explains why it is invalid"
  );
  if (ctx.state.pendingTarget?.handUid !== beforeInvalid.pendingUid ||
      ctx.state.player.field.filter((card) => card?.id === "spark-fragment-token").length !== beforeInvalid.tokenCount ||
      ctx.state.player.hand.length !== beforeInvalid.handCount) {
    throw new Error("token-readability-basic: invalid source clicks changed duel state");
  }

  await selectSpellTarget(
    ctx,
    fieldCard(ctx.els, "player", "spark-runner"),
    "token-readability-basic: choose legal split source",
    { center: true }
  );
  if (!ctx.els.choiceText?.textContent.includes("已选择")) {
    throw new Error("token-readability-basic: selected split source should remain visible before confirmation");
  }
  confirmSpellTarget(ctx, "token-readability-basic: confirm split source");
  await waitForSmoke(
    () => ctx.state.player.field.filter((card) => card?.id === "spark-fragment-token").length === 2 &&
      !ctx.state.pendingTarget &&
      ctx.state.log.some((entry) =>
        logEntryMessage(entry).includes("「星火信使」通过「星火分裂」生成了 2 只「星火衍生体」") &&
        entry.relatedCardIds?.includes("spark-runner") &&
        entry.relatedCardIds?.includes("spark-fragment-token")
      ),
    "token-readability-basic: legal split completes with a linked aggregate log",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "token-readability-basic");

  const token = ctx.state.player.field.find((card) => card?.id === "spark-fragment-token");
  await waitForSmoke(() => logCardLink(ctx.els, "spark-fragment-token"), "token-readability-basic: public token log link");
  clickSmokeElement(logCardLink(ctx.els, "spark-fragment-token"), "token-readability-basic: open token detail from log");
  await assertCardDetailModal(ctx, token, "token-readability-basic");
  setSmokeStatus("passed", "token-readability-basic");
}

async function runGraveyardSummonBasicSmoke(ctx) {
  setSmokeStatus("running", "graveyard-summon-basic");
  await startSmokeDuel(ctx, "protagonistComeback");
  const graveCard = ctx.state.player.grave.find((card) => card?.id === "astral-comet-ace");
  if (!graveCard) throw new Error("graveyard-summon-basic: grave target should exist");
  clickSmokeElement(handCard(ctx.els, "starwake-recall"), "graveyard-summon-basic: select revive spell");
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    "graveyard-summon-basic: revive confirmation is available"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "graveyard-summon-basic: confirm revive");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.uid === graveCard.uid) &&
      !ctx.state.player.grave.some((card) => card?.uid === graveCard.uid) &&
      ctx.state.gameEvents.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === graveCard.uid && event.fromZone === "grave"),
    "graveyard-summon-basic: exact grave card moves to the field",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "graveyard-summon-basic");
  setSmokeStatus("passed", "graveyard-summon-basic");
}

async function runGraveTargetReadabilityBasicSmoke(ctx) {
  const smokeName = "grave-target-readability-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistComeback");

  clickSmokeElement(handCard(ctx.els, "last-spark"), `${smokeName}: select draw spell`);
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: draw spell confirmation is available`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: send public spell to grave`);
  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.id === "last-spark") &&
      ctx.state.player.hand.some((card) => card?.id === "starwake-recall"),
    `${smokeName}: invalid non-monster grave candidate is prepared`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "starwake-recall"), `${smokeName}: open grave revive selection`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive" &&
      graveTargetCard(ctx.els, "astral-comet-ace") &&
      graveTargetCard(ctx.els, "last-spark"),
    `${smokeName}: legal and illegal grave cards remain visible`,
    9000
  );
  const legalTarget = graveTargetCard(ctx.els, "astral-comet-ace");
  const illegalTarget = graveTargetCard(ctx.els, "last-spark");
  if (!legalTarget?.classList.contains("targetable") ||
      legalTarget.dataset.targetState !== "legal" ||
      !illegalTarget?.classList.contains("grave-target-unavailable") ||
      illegalTarget.dataset.targetState !== "unavailable" ||
      illegalTarget.getAttribute("aria-disabled") !== "true" ||
      !illegalTarget.textContent.includes("非怪兽") ||
      !ctx.els.graveTargets?.dataset.summary?.includes("可召唤 1 / 墓地 2")) {
    throw new Error(`${smokeName}: grave target availability is not understandable. ${smokeDebug(ctx)}`);
  }

  const rulesSnapshot = () => JSON.stringify({
    hand: ctx.state.player.hand.map((card) => card?.uid || card?.id || null),
    field: ctx.state.player.field.map((card) => card?.uid || card?.id || null),
    traps: ctx.state.player.traps.map((card) => card?.uid || card?.id || null),
    grave: ctx.state.player.grave.map((card) => card?.uid || card?.id || null),
    pendingTarget: ctx.state.pendingTarget,
    gameEvents: ctx.state.gameEvents
  });
  const beforeInvalidClick = rulesSnapshot();
  clickSmokeElement(illegalTarget, `${smokeName}: click visible non-monster grave card`);
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该卡：不是怪兽。",
    `${smokeName}: invalid grave card explains the exact reason`
  );
  if (rulesSnapshot() !== beforeInvalidClick) {
    throw new Error(`${smokeName}: invalid grave target changed rules state. ${smokeDebug(ctx)}`);
  }

  await selectAndConfirmSpellTarget(ctx, legalTarget, `${smokeName}: revive legal monster`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace") &&
      !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace") &&
      ctx.state.player.grave.some((card) => card?.id === "last-spark") &&
      !ctx.state.pendingTarget,
    `${smokeName}: legal grave summon still completes after invalid click`,
    9000
  );
  assertUniqueRuntimeCards(ctx.state, smokeName);
  setSmokeStatus("passed", smokeName);
}

async function runMechanicsRegressionBasicSmoke(ctx) {
  setSmokeStatus("running", "mechanics-regression-basic");
  await startSmokeDuel(ctx, "splitToken");
  if (ctx.state.player.field[0]?.id !== "spark-runner") {
    throw new Error("mechanics-regression-basic: occupied fixture slot should contain spark-runner");
  }
  const summonEventsBefore = countGameEvents(ctx.state, "MONSTER_SUMMONED");
  clickSmokeElement(handCard(ctx.els, "solar-knight"), "mechanics-regression-basic: select monster");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "mechanics-regression-basic: reject occupied slot");
  if (!ctx.state.player.hand.some((card) => card?.id === "solar-knight") ||
      ctx.state.player.field[0]?.id !== "spark-runner" ||
      ctx.state.player.normalSummonsUsed !== 0 ||
      countGameEvents(ctx.state, "MONSTER_SUMMONED") !== summonEventsBefore) {
    throw new Error("mechanics-regression-basic: occupied slot caused a partial update");
  }
  clickSmokeElement(fieldSlot(ctx.els, "player", 2), "mechanics-regression-basic: choose legal slot");
  await waitForSmoke(
    () => ctx.state.player.field[2]?.id === "solar-knight" && !ctx.state.player.hand.some((card) => card?.id === "solar-knight"),
    "mechanics-regression-basic: legal retry succeeds",
    9000
  );
  assertUniqueRuntimeCards(ctx.state, "mechanics-regression-basic");
  const detail = cloneCardById("solar-knight");
  await waitForSmoke(() => logCardLink(ctx.els, "solar-knight"), "mechanics-regression-basic: public log link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "solar-knight"), "mechanics-regression-basic: open log detail");
  await assertCardDetailModal(ctx, detail, "mechanics-regression-basic-log");
  clickSmokeElement(ctx.els.zoomClose, "mechanics-regression-basic: close log detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "mechanics-regression-basic: detail closes");
  setSmokeStatus("passed", "mechanics-regression-basic");
}

async function runTributeSummonDoubleSmoke(ctx) {
  setSmokeStatus("running", "tribute-summon-double");
  await startSmokeDuel(ctx, "tributeSummonDouble");
  if (ctx.state.player.field[0]?.id !== "spark-runner" || ctx.state.player.field[1]?.id !== "lumen-gearlet") {
    throw new Error("tribute-summon-double: two material monsters should start on player field");
  }
  clickSmokeElement(handCard(ctx.els, "starfall-colossus"), "tribute-summon-double: select two-tribute monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon-double: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cardName &&
      ctx.state.pendingTribute.cost === 2 &&
      ctx.state.pendingTribute.selectedIndexes?.length === 2 &&
      !ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon-double: both required tributes selected by default"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon-double: confirm tribute summon");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "starfall-colossus" &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.grave.some((card) => card?.id === "lumen-gearlet") &&
      !ctx.state.pendingTribute,
    "tribute-summon-double: colossus summoned and both materials sent to grave",
    9000
  );
  const tributeEvents = countGameEvents(ctx.state, "CARD_TRIBUTED");
  if (tributeEvents < 2) {
    throw new Error(`tribute-summon-double: expected two CARD_TRIBUTED events, got ${tributeEvents}`);
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("坠星巨卫"))) {
    throw new Error("tribute-summon-double: public log should mention the tribute summoned monster");
  }
  setSmokeStatus("passed", "tribute-summon-double");
}

async function runDivineSummonSmoke(ctx) {
  setSmokeStatus("running", "divine-summon");
  await startSmokeDuel(ctx, "divineSummon");
  if (ctx.state.player.field[0]?.id !== "spark-runner" ||
    ctx.state.player.field[1]?.id !== "lumen-gearlet" ||
    ctx.state.player.field[2]?.id !== "ember-soul-initiate") {
    throw new Error("divine-summon: three tribute materials should start on player field");
  }
  const divineCard = cloneCardById("celestial-origin-dragon");
  if (!divineCard) throw new Error("divine-summon: divine monster definition should exist");
  clickSmokeElement(handCard(ctx.els, "celestial-origin-dragon"), "divine-summon: select divine monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "divine-summon: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cardName &&
      ctx.state.pendingTribute.cost === 3 &&
      ctx.state.pendingTribute.selectedIndexes?.length === 3 &&
      !ctx.els.choiceConfirmBtn.disabled,
    "divine-summon: all three required tributes selected by default"
  );
  if (!ctx.els.choiceActions?.classList.contains("material-choice")) {
    throw new Error("divine-summon: tribute chooser should avoid covering the field");
  }
  clickSmokeElement(ctx.els.choiceConfirmBtn, "divine-summon: confirm divine summon");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "celestial-origin-dragon" &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.grave.some((card) => card?.id === "lumen-gearlet") &&
      ctx.state.player.grave.some((card) => card?.id === "ember-soul-initiate") &&
      !ctx.state.pendingTribute,
    "divine-summon: divine monster summoned and all materials sent to grave",
    9000
  );
  const tributeEvents = countGameEvents(ctx.state, "CARD_TRIBUTED");
  if (tributeEvents < 3) {
    throw new Error(`divine-summon: expected three CARD_TRIBUTED events, got ${tributeEvents}`);
  }
  if (!ctx.state.gameEvents.some((event) => event.type === "MONSTER_SUMMONED" && event.cardId === ctx.state.player.field[0]?.uid)) {
    throw new Error("divine-summon: MONSTER_SUMMONED event missing");
  }
  const resultLink = logCardLink(ctx.els, "celestial-origin-dragon");
  if (!resultLink) throw new Error("divine-summon: public log should expose divine monster detail link");
  clickSmokeElement(resultLink, "divine-summon: open divine monster detail from log");
  await assertCardDetailModal(ctx, divineCard, "divine-summon");
  if (!ctx.els.cardModal.textContent.includes("召唤需求：3 只祭品") || !ctx.els.cardModal.textContent.includes("攻击：4000")) {
    throw new Error("divine-summon: detail should include three-tribute requirement and full stats");
  }
  clickSmokeElement(ctx.els.zoomClose, "divine-summon: close divine detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-summon: detail closes");
  setSmokeStatus("passed", "divine-summon");
}

async function runTrioTributeSummonSmoke(ctx) {
  setSmokeStatus("running", "trio-tribute-summon");
  await startSmokeDuel(ctx, "trioTributeSummon");
  const trioCard = cloneCardById("trio-sun-judicator");
  if (!trioCard || trioCard.tributeCost !== 3) {
    throw new Error("trio-tribute-summon: trio god should declare a three-tribute cost");
  }
  const materialIds = ["spark-runner", "lumen-gearlet", "ember-soul-initiate"];
  if (materialIds.some((cardId) => !fieldCard(ctx.els, "player", cardId))) {
    throw new Error("trio-tribute-summon: three tribute materials should start on the player field");
  }

  clickSmokeElement(handCard(ctx.els, "trio-sun-judicator"), "trio-tribute-summon: select trio god");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "trio-tribute-summon: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cost === 3 &&
      ctx.state.pendingTribute.selectedIndexes?.length === 3 &&
      !ctx.els.choiceConfirmBtn.disabled &&
      materialIds.every((cardId) => fieldCard(ctx.els, "player", cardId)?.classList.contains("tribute-selected")),
    "trio-tribute-summon: exact three tributes selected by default"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "trio-tribute-summon: confirm summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-sun-judicator") &&
      materialIds.every((cardId) => ctx.state.player.grave.some((card) => card?.id === cardId)) &&
      !ctx.state.pendingTribute,
    `trio-tribute-summon: trio god summoned through three tributes. ${smokeDebug(ctx)}`,
    10000
  );
  if (countGameEvents(ctx.state, "CARD_TRIBUTED") !== 3) {
    throw new Error("trio-tribute-summon: exactly three CARD_TRIBUTED events should be emitted");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "trio-sun-judicator"), "trio-tribute-summon: public summon log link");
  const timelineToggle = document.querySelector("#timelineDrawerToggle");
  const timelineDrawer = document.querySelector("#timelineDrawer");
  clickSmokeElement(timelineToggle, "trio-tribute-summon: open timeline drawer");
  await waitForSmoke(() => timelineDrawer?.classList.contains("is-open"), "trio-tribute-summon: timeline drawer opens");
  clickSmokeElementCenter(logCardLink(ctx.els, "trio-sun-judicator"), "trio-tribute-summon: inspect summoned god");
  await assertCardDetailModal(ctx, trioCard, "trio-tribute-summon");
  if (!ctx.els.cardModal.textContent.includes("召唤需求：3 只祭品")) {
    throw new Error("trio-tribute-summon: unified detail should show the three-tribute requirement");
  }
  clickSmokeElement(ctx.els.zoomClose, "trio-tribute-summon: close detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "trio-tribute-summon: detail closes");
  setSmokeStatus("passed", "trio-tribute-summon");
}

async function runDivineGuardSmoke(ctx) {
  setSmokeStatus("running", "divine-guard");
  await startSmokeDuel(ctx, "divineGuard");
  const divineCard = cloneCardById("celestial-origin-dragon");
  if (!divineCard) throw new Error("divine-guard: divine monster definition should exist");
  const dragon = ctx.state.player.field[0];
  if (dragon?.id !== "celestial-origin-dragon") {
    throw new Error("divine-guard: celestial origin dragon should start on player field");
  }
  if (!ctx.state.ai.traps.some((card) => card?.id === "mirror-snare")) {
    throw new Error("divine-guard: AI should start with mirror snare set");
  }
  const dragonUid = dragon.uid;
  clickSmokeElement(fieldCard(ctx.els, "player", "celestial-origin-dragon"), "divine-guard: select dragon");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "divine-guard: targetable guardian");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "divine-guard: attack guardian through mirror snare");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.uid === dragonUid) &&
      ctx.state.player.field.some((card) => card?.id === "celestial-origin-dragon" && card.destructionProtectionUsed) &&
      ctx.state.ai.grave.some((card) => card?.id === "mirror-snare") &&
      countGameEvents(ctx.state, "CARD_DESTRUCTION_PREVENTED") >= 1,
    `divine-guard: divine guard should prevent mirror snare destruction. ${smokeDebug(ctx)}`,
    14000
  );
  if (ctx.state.gameEvents.some((event) => event.type === "CARD_DESTROYED" && event.cardId === dragonUid)) {
    throw new Error("divine-guard: dragon should not be destroyed by the first destruction attempt");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("神格守护"))) {
    throw new Error("divine-guard: battle log should explain divine guard prevention");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "celestial-origin-dragon"), "divine-guard: log should expose divine monster detail link", 6000);
  const resultLink = logCardLink(ctx.els, "celestial-origin-dragon");
  clickSmokeElement(resultLink, "divine-guard: open divine detail from log");
  await assertCardDetailModal(ctx, divineCard, "divine-guard");
  if (!ctx.els.cardModal.textContent.includes("神格守护")) {
    throw new Error("divine-guard: detail should include divine guard effect text");
  }
  clickSmokeElement(ctx.els.zoomClose, "divine-guard: close divine detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-guard: detail closes");
  await waitForSmoke(
    () => ctx.currentPlayerActions().endTurn || ctx.currentPlayerActions().attack ||
      ctx.currentPlayerActions().spell || ctx.currentPlayerActions().trap,
    "divine-guard: duel should continue after guard resolves",
    8000
  );
  setSmokeStatus("passed", "divine-guard");
}

async function runDivinePierceSmoke(ctx) {
  setSmokeStatus("running", "divine-pierce");
  await startSmokeDuel(ctx, "divinePierce");
  const divineCard = cloneCardById("celestial-origin-dragon");
  if (!divineCard) throw new Error("divine-pierce: divine monster definition should exist");
  const dragon = ctx.state.player.field[0];
  const guard = ctx.state.ai.field[0];
  if (dragon?.id !== "celestial-origin-dragon" || !dragon.piercingDamage) {
    throw new Error("divine-pierce: celestial origin dragon should start with piercing damage");
  }
  if (guard?.id !== "iron-guardian" || guard.mode !== "defense") {
    throw new Error("divine-pierce: iron guardian should start in defense mode");
  }
  const aiLpBefore = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "celestial-origin-dragon"), "divine-pierce: select dragon");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "divine-pierce: targetable defense guardian");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "divine-pierce: attack defense guardian");
  await waitForSmoke(
    () => ctx.state.ai.lp === aiLpBefore - 1900 &&
      ctx.state.ai.grave.some((card) => card?.id === "iron-guardian") &&
      ctx.state.gameEvents.some((event) => event.type === "DAMAGE_DEALT" && event.amount === 1900) &&
      ctx.state.gameEvents.some((event) => event.type === "BATTLE_RESOLVED" && event.outcome?.kind === "pierceDefense"),
    `divine-pierce: divine piercing battle should deal defense difference. ${smokeDebug(ctx)}`,
    12000
  );
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("神格贯穿"))) {
    throw new Error("divine-pierce: battle log should explain piercing damage");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "celestial-origin-dragon"), "divine-pierce: log should expose divine monster detail link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "celestial-origin-dragon"), "divine-pierce: open divine detail from log");
  await assertCardDetailModal(ctx, divineCard, "divine-pierce");
  if (!ctx.els.cardModal.textContent.includes("神格贯穿")) {
    throw new Error("divine-pierce: detail should include divine pierce effect text");
  }
  clickSmokeElement(ctx.els.zoomClose, "divine-pierce: close divine detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-pierce: detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error("divine-pierce: duel should continue after piercing battle resolves");
  }
  setSmokeStatus("passed", "divine-pierce");
}

async function runDivinePressureSmoke(ctx) {
  setSmokeStatus("running", "divine-pressure");
  await startSmokeDuel(ctx, "divinePressure");
  const divineCard = cloneCardById("celestial-origin-dragon");
  if (!divineCard) throw new Error("divine-pressure: divine monster definition should exist");
  const dragon = ctx.state.player.field[0];
  if (dragon?.id !== "celestial-origin-dragon" || !dragon.shieldPierce) {
    throw new Error("divine-pressure: celestial origin dragon should start with shield pierce");
  }
  if (ctx.state.ai.shield !== 800 || ctx.state.ai.field.some(Boolean)) {
    throw new Error("divine-pressure: AI should start with 800 shield and no monsters");
  }
  const aiLpBefore = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "celestial-origin-dragon"), "divine-pressure: select dragon");
  await waitForSmoke(() => ctx.els.aiPanel.classList.contains("direct-target"), "divine-pressure: AI panel direct target");
  clickSmokeElement(ctx.els.aiPanel, "divine-pressure: direct attack AI");
  await waitForSmoke(
    () => ctx.state.ai.lp === aiLpBefore - 3700 &&
      ctx.state.ai.shield === 0 &&
      ctx.state.gameEvents.some((event) =>
        event.type === "DAMAGE_DEALT" &&
        event.playerId === "ai" &&
        event.requested === 4000 &&
        event.shieldPierced === 500 &&
        event.blocked === 300 &&
        event.amount === 3700
      ) &&
      ctx.state.gameEvents.some((event) =>
        event.type === "BATTLE_RESOLVED" &&
        event.outcome?.kind === "direct" &&
        event.outcome?.shieldPierced === 500
      ),
    `divine-pressure: direct attack should pierce shield before damage. ${smokeDebug(ctx)}`,
    12000
  );
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("神格威压"))) {
    throw new Error("divine-pressure: battle log should explain divine pressure");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "celestial-origin-dragon"), "divine-pressure: log should expose divine monster detail link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "celestial-origin-dragon"), "divine-pressure: open divine detail from log");
  await assertCardDetailModal(ctx, divineCard, "divine-pressure");
  if (!ctx.els.cardModal.textContent.includes("神格威压")) {
    throw new Error("divine-pressure: detail should include divine pressure effect text");
  }
  clickSmokeElement(ctx.els.zoomClose, "divine-pressure: close divine detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-pressure: detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error("divine-pressure: duel should continue after direct attack resolves");
  }
  setSmokeStatus("passed", "divine-pressure");
}

async function runDivineResistanceSmoke(ctx) {
  setSmokeStatus("running", "divine-resistance");
  await startSmokeDuel(ctx, "divineResistance");
  const dragon = ctx.state.ai.field.find((card) => card?.id === "celestial-origin-dragon");
  const colossus = ctx.state.ai.field.find((card) => card?.id === "starfall-colossus");
  const colossusDefinition = cloneCardById("starfall-colossus");
  if (!dragon?.targetResistance) {
    throw new Error("divine-resistance: celestial origin dragon should expose target resistance");
  }
  if (!colossus || !colossusDefinition) {
    throw new Error("divine-resistance: colossus target should exist");
  }
  clickSmokeElement(handCard(ctx.els, "pierce-line"), "divine-resistance: select pierce-line");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "pierceLine" &&
      fieldCard(ctx.els, "ai", "starfall-colossus")?.classList.contains("targetable"),
    "divine-resistance: pierce-line should target next legal strongest monster",
    6000
  );
  if (fieldCard(ctx.els, "ai", "celestial-origin-dragon")?.classList.contains("targetable")) {
    throw new Error("divine-resistance: divine target resistance should prevent target highlight");
  }
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "ai", "starfall-colossus"), "divine-resistance: click colossus target");
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "starfall-colossus" && card.tempAtk === -400 && card.tempDef === -400) &&
      ctx.state.ai.field.some((card) => card?.id === "celestial-origin-dragon" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0),
    `divine-resistance: pierce-line should weaken colossus but not divine dragon. ${smokeDebug(ctx)}`,
    8000
  );
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("坠星巨卫") && logEntryMessage(entry).includes("破阵星芒"))) {
    throw new Error("divine-resistance: battle log should name the legal target");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "starfall-colossus"), "divine-resistance: target log card link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "starfall-colossus"), "divine-resistance: open target detail from log");
  await assertCardDetailModal(ctx, colossusDefinition, "divine-resistance");
  clickSmokeElement(ctx.els.zoomClose, "divine-resistance: close target detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-resistance: detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error(`divine-resistance: duel should continue after target resistance resolves. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "divine-resistance");
}

async function runDivineBreakSmoke(ctx) {
  setSmokeStatus("running", "divine-break");
  await startSmokeDuel(ctx, "divineBreak");
  const breaker = ctx.state.player.hand.find((card) => card?.id === "godbreaker-spear");
  const breakerDefinition = cloneCardById("godbreaker-spear");
  const dragon = ctx.state.ai.field.find((card) => card?.id === "celestial-origin-dragon");
  if (breaker?.targetResistanceBypass !== "divineTarget" || !breakerDefinition) {
    throw new Error("divine-break: godbreaker spear should expose matching resistance bypass");
  }
  if (!dragon?.targetResistance) {
    throw new Error("divine-break: celestial origin dragon should expose target resistance");
  }
  clickSmokeElement(handCard(ctx.els, "godbreaker-spear"), "divine-break: select godbreaker spear");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "pierceLine" &&
      fieldCard(ctx.els, "ai", "celestial-origin-dragon")?.classList.contains("targetable"),
    "divine-break: divine dragon should become a legal target",
    6000
  );
  if (fieldCard(ctx.els, "ai", "starfall-colossus")?.classList.contains("targetable")) {
    throw new Error("divine-break: lower attack monster should not replace the legal strongest target");
  }
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "ai", "celestial-origin-dragon"), "divine-break: target divine dragon");
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "celestial-origin-dragon" && card.tempAtk === -400 && card.tempDef === -400) &&
      ctx.state.ai.field.some((card) => card?.id === "starfall-colossus" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0) &&
      ctx.state.ai.lp === 3800,
    `divine-break: bypass should weaken divine dragon and preserve other targets. ${smokeDebug(ctx)}`,
    8000
  );
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("创星神龙") && logEntryMessage(entry).includes("破神星矛"))) {
    throw new Error("divine-break: public log should name the source and divine target");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "godbreaker-spear"), "divine-break: source log card link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "godbreaker-spear"), "divine-break: open source detail from log");
  await assertCardDetailModal(ctx, breakerDefinition, "divine-break");
  if (!ctx.els.cardModal.textContent.includes("无视神格目标抗性")) {
    throw new Error("divine-break: unified detail should explain the resistance bypass");
  }
  clickSmokeElement(ctx.els.zoomClose, "divine-break: close source detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "divine-break: detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error(`divine-break: duel should continue after bypass resolves. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "divine-break");
}

async function runFusionSummonSmoke(ctx) {
  setSmokeStatus("running", "fusion-summon");
  await startSmokeDuel(ctx, "fusionSummon");
  if (ctx.state.player.field[0]?.id !== "ember-drake" || ctx.state.player.field[1]?.id !== "gale-mage") {
    throw new Error("fusion-summon: fusion materials should start on player field");
  }
  if (!ctx.state.player.deck.some((card) => card?.id === "flare-gale-archon")) {
    throw new Error("fusion-summon: fusion result should start in player deck");
  }
  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-summon: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-summon: enter material selection");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.resultId === "flare-gale-archon" && ctx.els.choiceConfirmBtn.disabled,
    "fusion-summon: pending fusion material selection"
  );
  if (!ctx.els.choiceActions?.classList.contains("fusion-choice")) {
    throw new Error("fusion-summon: fusion material chooser should avoid covering the field");
  }
  const detailCard = cloneCardById("flare-gale-archon");
  if (ctx.els.fusionPreview?.hidden) {
    throw new Error("fusion-summon: fusion preview should be visible during material selection");
  }
  if (ctx.els.fusionPreview?.dataset.cardId !== "flare-gale-archon") {
    throw new Error("fusion-summon: fusion preview should reference the fusion result");
  }
  if (!ctx.els.fusionPreviewName?.textContent.includes(detailCard.name)) {
    throw new Error("fusion-summon: fusion preview should show result name");
  }
  if (!ctx.els.fusionPreviewStats?.textContent.includes("ATK 2400") || !ctx.els.fusionPreviewStats?.textContent.includes("DEF 1800")) {
    throw new Error("fusion-summon: fusion preview should show result ATK and DEF");
  }
  const previewMaterials = ctx.els.fusionPreviewMaterials?.textContent || "";
  if (!previewMaterials.includes(cloneCardById("ember-drake").name) || !previewMaterials.includes(cloneCardById("gale-mage").name)) {
    throw new Error("fusion-summon: fusion preview should show required materials");
  }
  clickSmokeElement(ctx.els.fusionPreviewDetail, "fusion-summon: open fusion result detail from preview");
  await assertCardDetailModal(ctx, detailCard, "fusion-summon-preview");
  clickSmokeElement(ctx.els.zoomClose, "fusion-summon: close fusion preview detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "fusion-summon: preview detail closes");
  clickSmokeElementCenter(fieldCard(ctx.els, "player", "ember-drake"), "fusion-summon: select first material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 1 &&
      ctx.els.choiceConfirmBtn.disabled &&
      fieldCard(ctx.els, "player", "ember-drake")?.classList.contains("tribute-selected"),
    "fusion-summon: first material selected"
  );
  clickSmokeElementCenter(fieldCard(ctx.els, "player", "gale-mage"), "fusion-summon: select second material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 2 && !ctx.els.choiceConfirmBtn.disabled,
    "fusion-summon: two materials selected"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-summon: confirm fusion summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-gale-archon") &&
      ctx.state.player.grave.some((card) => card?.id === "ember-drake") &&
      ctx.state.player.grave.some((card) => card?.id === "gale-mage") &&
      ctx.state.player.grave.some((card) => card?.id === "starforge-fusion") &&
      !ctx.state.pendingFusion,
    "fusion-summon: fusion result summoned and materials sent to grave",
    9000
  );
  if (!ctx.state.gameEvents.some((event) => event.type === "MATERIALS_SENT" && event.purpose === "fusion")) {
    throw new Error("fusion-summon: fusion MATERIALS_SENT event missing");
  }
  if (!ctx.state.gameEvents.some((event) => event.type === "MONSTER_SUMMONED" && event.summonType === "fusion")) {
    throw new Error("fusion-summon: fusion MONSTER_SUMMONED event missing");
  }
  if (!ctx.state.gameEvents.some((event) => event.type === "FUSION_SUMMONED")) {
    throw new Error("fusion-summon: FUSION_SUMMONED event missing");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("焰岚合星者"))) {
    throw new Error("fusion-summon: public log should mention the fusion result");
  }
  const resultLink = logCardLink(ctx.els, "flare-gale-archon");
  if (!resultLink) throw new Error("fusion-summon: fusion result log link should be clickable");
  clickSmokeElement(resultLink, "fusion-summon: open fusion result detail from log");
  await assertCardDetailModal(ctx, detailCard, "fusion-summon");
  clickSmokeElement(ctx.els.zoomClose, "fusion-summon: close fusion detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "fusion-summon: detail closes");
  setSmokeStatus("passed", "fusion-summon");
}

async function runFusionMixedMaterialsSmoke(ctx) {
  setSmokeStatus("running", "fusion-mixed-materials");
  await startSmokeDuel(ctx, "fusionMixedMaterials");
  const resultDefinition = cloneCardById("flare-gale-archon");
  if (ctx.state.player.field[0]?.id !== "ember-drake") {
    throw new Error("fusion-mixed-materials: ember material should start on field");
  }
  if (!ctx.state.player.hand.some((card) => card?.id === "gale-mage")) {
    throw new Error("fusion-mixed-materials: gale material should start in hand");
  }
  if (!ctx.state.player.deck.some((card) => card?.id === "flare-gale-archon")) {
    throw new Error("fusion-mixed-materials: fusion result should start in deck");
  }
  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-mixed-materials: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-mixed-materials: enter material selection");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.resultId === "flare-gale-archon" &&
      handCard(ctx.els, "gale-mage")?.classList.contains("tribute-candidate"),
    "fusion-mixed-materials: hand material should be selectable",
    6000
  );
  clickSmokeElementCenter(fieldCard(ctx.els, "player", "ember-drake"), "fusion-mixed-materials: select field material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 1 &&
      ctx.state.pendingFusion?.selectedHandUids?.length === 0,
    "fusion-mixed-materials: field material selected"
  );
  clickSmokeElement(handCard(ctx.els, "gale-mage"), "fusion-mixed-materials: select hand material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 1 &&
      ctx.state.pendingFusion?.selectedHandUids?.length === 1 &&
      handCard(ctx.els, "gale-mage")?.classList.contains("tribute-selected") &&
      !ctx.els.choiceConfirmBtn.disabled,
    "fusion-mixed-materials: mixed materials selected"
  );
  const previewText = ctx.els.fusionPreviewMaterials?.textContent || "";
  if (!previewText.includes("赤焰幼龙（场上）") || !previewText.includes("疾风术士（手牌）")) {
    throw new Error("fusion-mixed-materials: preview should identify material zones");
  }
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-mixed-materials: confirm fusion summon");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-gale-archon") &&
      ctx.state.player.grave.some((card) => card?.id === "ember-drake") &&
      ctx.state.player.grave.some((card) => card?.id === "gale-mage") &&
      ctx.state.player.grave.some((card) => card?.id === "starforge-fusion") &&
      !ctx.state.pendingFusion,
    `fusion-mixed-materials: mixed fusion should resolve. ${smokeDebug(ctx)}`,
    9000
  );
  if (!ctx.state.gameEvents.some((event) => event.type === "CARD_MOVED" && event.cardId?.includes("gale-mage") && event.from?.zone === "hand" && event.to?.zone === "grave")) {
    throw new Error("fusion-mixed-materials: hand material movement event missing");
  }
  if (ctx.state.player.normalSummonsUsed !== 0) {
    throw new Error("fusion-mixed-materials: fusion should not consume the normal summon");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "flare-gale-archon"), "fusion-mixed-materials: result log link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "flare-gale-archon"), "fusion-mixed-materials: open result detail from log");
  await assertCardDetailModal(ctx, resultDefinition, "fusion-mixed-materials");
  clickSmokeElement(ctx.els.zoomClose, "fusion-mixed-materials: close result detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "fusion-mixed-materials: detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error(`fusion-mixed-materials: duel should continue after fusion. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "fusion-mixed-materials");
}

async function runFusionResultChoiceSmoke(ctx) {
  setSmokeStatus("running", "fusion-result-choice");
  await startSmokeDuel(ctx, "fusionResultChoice");
  const resultDefinition = cloneCardById("tempest-aegis-archon");
  if (!resultDefinition) throw new Error("fusion-result-choice: defensive result definition should exist");
  if (!ctx.state.player.deck.some((card) => card?.id === "flare-gale-archon") ||
      !ctx.state.player.deck.some((card) => card?.id === "tempest-aegis-archon")) {
    throw new Error("fusion-result-choice: both fusion results should start in deck");
  }

  clickSmokeElement(handCard(ctx.els, "starforge-fusion"), "fusion-result-choice: select fusion spell");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-result-choice: enter result selection");
  await waitForSmoke(
    () => ctx.state.pendingFusion && !ctx.state.pendingFusion.resultId &&
      ctx.els.fusionResultChoices?.querySelectorAll(".fusion-result-option").length === 2,
    "fusion-result-choice: two explicit result options",
    6000
  );
  assertPendingSelection(ctx, "fusion", "fusion-result-choice: result selection");
  if (!ctx.els.choiceConfirmBtn.disabled) {
    throw new Error("fusion-result-choice: summon confirmation must stay disabled before choosing a result");
  }
  const resultChoicesText = ctx.els.fusionResultChoices?.textContent || "";
  if (!resultChoicesText.includes("ATK 2400") ||
      !resultChoicesText.includes("ATK 2000") ||
      !resultChoicesText.includes("赤焰幼龙") ||
      !resultChoicesText.includes("疾风术士")) {
    throw new Error(`fusion-result-choice: every result option should expose stats and recipe. ${resultChoicesText}`);
  }

  const defensiveChoice = ctx.els.fusionResultChoices.querySelector('[data-card-id="tempest-aegis-archon"]');
  clickSmokeElement(defensiveChoice, "fusion-result-choice: choose defensive result");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.resultId === "tempest-aegis-archon" &&
      ctx.els.fusionResultChoices?.querySelector('[data-card-id="tempest-aegis-archon"]')?.classList.contains("selected") &&
      handCard(ctx.els, "gale-mage")?.classList.contains("tribute-candidate"),
    "fusion-result-choice: defensive result selected",
    6000
  );
  assertPendingSelection(ctx, "fusion", "fusion-result-choice: material selection");
  if (!ctx.els.fusionPreviewName?.textContent.includes(resultDefinition.name) ||
      !ctx.els.fusionPreviewStats?.textContent.includes("ATK 2000") ||
      !ctx.els.fusionPreviewStats?.textContent.includes("DEF 2600")) {
    throw new Error("fusion-result-choice: preview should show selected result name and stats");
  }
  if (!ctx.els.fusionPreviewKicker?.textContent.includes("素材 0/2") ||
      ctx.els.fusionPreview?.dataset.materialState !== "selecting") {
    throw new Error("fusion-result-choice: selected result should expose material progress");
  }
  clickSmokeElement(ctx.els.fusionPreviewDetail, "fusion-result-choice: open selected result detail");
  await assertCardDetailModal(ctx, resultDefinition, "fusion-result-choice-preview");
  clickSmokeElement(ctx.els.zoomClose, "fusion-result-choice: close selected result detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "fusion-result-choice: preview detail closes");

  clickSmokeElementCenter(fieldCard(ctx.els, "player", "ember-drake"), "fusion-result-choice: select field material");
  clickSmokeElement(handCard(ctx.els, "gale-mage"), "fusion-result-choice: select hand material");
  await waitForSmoke(
    () => ctx.state.pendingFusion?.selectedIndexes?.length === 1 &&
      ctx.state.pendingFusion?.selectedHandUids?.length === 1 &&
      ctx.els.fusionPreview?.dataset.materialState === "complete" &&
      ctx.els.fusionPreviewKicker?.textContent.includes("素材齐备") &&
      !ctx.els.choiceConfirmBtn.disabled,
    "fusion-result-choice: mixed materials selected",
    6000
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "fusion-result-choice: confirm defensive fusion");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "tempest-aegis-archon") &&
      ctx.state.player.deck.some((card) => card?.id === "flare-gale-archon") &&
      !ctx.state.player.deck.some((card) => card?.id === "tempest-aegis-archon") &&
      ctx.state.player.shield === 400 &&
      !ctx.state.pendingFusion,
    `fusion-result-choice: selected result should resolve with its summon effect. ${smokeDebug(ctx)}`,
    9000
  );
  assertPendingSelection(ctx, "", "fusion-result-choice: resolved selection");
  if (!ctx.state.gameEvents.some((event) => event.type === "FUSION_SUMMONED" && event.resultTemplateId === "tempest-aegis-archon")) {
    throw new Error("fusion-result-choice: selected FUSION_SUMMONED event missing");
  }
  await waitForSmoke(() => logCardLink(ctx.els, "tempest-aegis-archon"), "fusion-result-choice: result log link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "tempest-aegis-archon"), "fusion-result-choice: open selected result from log");
  await assertCardDetailModal(ctx, resultDefinition, "fusion-result-choice-log");
  clickSmokeElement(ctx.els.zoomClose, "fusion-result-choice: close log detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "fusion-result-choice: log detail closes");
  if (!ctx.currentPlayerActions().endTurn && !ctx.currentPlayerActions().attack && !ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap) {
    throw new Error(`fusion-result-choice: duel should continue after result selection. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "fusion-result-choice");
}

async function runSplitTokenSmoke(ctx) {
  setSmokeStatus("running", "split-token");
  await startSmokeDuel(ctx, "splitToken");
  const tokenDetail = cloneCardById("spark-fragment-token");
  if (!tokenDetail) throw new Error("split-token: token definition should exist");
  if (ctx.state.player.field[0]?.id !== "spark-runner") {
    throw new Error("split-token: source monster should start on player field");
  }
  clickSmokeElement(handCard(ctx.els, "spark-split"), "split-token: select split spell");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "splitToken" && ctx.state.pendingTarget?.mode === "ownMonster",
    "split-token: target selection opens"
  );
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "spark-runner"), "split-token: choose source monster");
  await waitForSmoke(
    () => ctx.state.player.field.filter((card) => card?.id === "spark-fragment-token").length === 2 &&
      ctx.state.player.grave.some((card) => card?.id === "spark-split") &&
      !ctx.state.pendingTarget,
    "split-token: two token monsters created",
    9000
  );
  if (countGameEvents(ctx.state, "CARD_CREATED") < 2) {
    throw new Error("split-token: CARD_CREATED events missing");
  }
  if ((ctx.state.gameEvents || []).filter((event) => event.type === "MONSTER_SUMMONED" && event.summonType === "token").length < 2) {
    throw new Error("split-token: token MONSTER_SUMMONED events missing");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("星火衍生体"))) {
    throw new Error("split-token: public log should mention created token");
  }
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-fragment-token"), "split-token: select generated token");
  await waitForSmoke(() => !ctx.els.detailBtn.disabled, "split-token: detail action enabled for token");
  clickSmokeElement(ctx.els.detailBtn, "split-token: open generated token detail");
  await assertCardDetailModal(ctx, tokenDetail, "split-token-field");
  clickSmokeElement(ctx.els.zoomClose, "split-token: close generated token detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "split-token: token detail closes");
  const tokenLogLink = logCardLink(ctx.els, "spark-fragment-token");
  if (!tokenLogLink) throw new Error("split-token: token log link should be clickable");
  clickSmokeElement(tokenLogLink, "split-token: open token detail from log");
  await assertCardDetailModal(ctx, tokenDetail, "split-token-log");
  clickSmokeElement(ctx.els.zoomClose, "split-token: close log token detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "split-token: log detail closes");
  if (!ctx.state.started || ctx.state.gameOver) {
    throw new Error(`split-token: duel should continue after token detail. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "split-token");
}

async function runSummonFireBuffSmoke(ctx) {
  setSmokeStatus("running", "summon-fire-buff");
  await startSmokeDuel(ctx, "summonFireBuff");
  clickSmokeElement(handCard(ctx.els, "flame-captain"), "summon flame captain");
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "flame captain slot");
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "flame-captain" &&
      ctx.state.player.field[0]?.tempAtk === 300 &&
      countGameEvents(ctx.state, "STAT_MODIFIED") >= 1,
    "flame captain on-summon stat buff through event",
    9000
  );
  setSmokeStatus("passed", "summon-fire-buff");
}

async function runSummonShieldSmoke(ctx) {
  setSmokeStatus("running", "summon-shield");
  await startSmokeDuel(ctx, "summonShield");
  clickSmokeElement(handCard(ctx.els, "prism-saint"), "summon prism saint");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "prism saint slot");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "prism-saint" &&
      ctx.state.player.shield === 400 &&
      countGameEvents(ctx.state, "SHIELD_GAINED") >= 1,
    "prism saint on-summon shield through event",
    9000
  );
  setSmokeStatus("passed", "summon-shield");
}

async function runSummonShadowBurnSmoke(ctx) {
  setSmokeStatus("running", "summon-shadow-burn");
  await startSmokeDuel(ctx, "summonShadowBurn");
  const aiLpBefore = ctx.state.ai.lp;
  clickSmokeElement(handCard(ctx.els, "dusk-alchemist"), "summon dusk alchemist");
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "dusk alchemist slot");
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "dusk-alchemist" &&
      ctx.state.ai.lp === aiLpBefore - 300 &&
      countGameEvents(ctx.state, "DAMAGE_DEALT") >= 1,
    "dusk alchemist on-summon burn through event",
    9000
  );
  setSmokeStatus("passed", "summon-shadow-burn");
}

async function runSummonTrapResponseSmoke(ctx) {
  setSmokeStatus("running", "summon-trap-response");
  await startSmokeDuel(ctx, "summonTrap");
  clickSmokeElement(handCard(ctx.els, "summon-flare"), "选择召雷陷阵");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放召雷陷阵");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "summon-flare"), "召雷陷阵盖放成功");
  const aiLpBefore = ctx.state.ai.lp;
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "AI 召唤后的陷阱响应窗口", 16000);
  if (!ctx.els.chainText.textContent.includes("召雷陷阵") || !ctx.els.chainText.textContent.includes("召唤")) {
    throw new Error("召唤陷阱响应提示缺少触发卡或召唤信息");
  }
  clickSmokeElement(ctx.els.chainYes, "发动召雷陷阵");
  await waitForSmoke(
    () => ctx.state.ai.lp === aiLpBefore - 400 &&
      !ctx.state.player.traps.some((card) => card?.id === "summon-flare"),
    "召雷陷阵通过连锁造成 400 点伤害",
    9000
  );
  const summonWindow = (ctx.state.gameEvents || []).find((event) =>
    event.type === "RESPONSE_WINDOW_OPENED" && event.prompt === "summon"
  );
  if (!summonWindow || countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 1 || countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1) {
    throw new Error("召唤陷阱必须记录召唤响应窗口和完整连锁事件");
  }
  setSmokeStatus("passed", "summon-trap-response");
}

async function runDuelLayoutDensityBasicSmoke(ctx) {
  setSmokeStatus("running", "duel-layout-density-basic");
  await startSmokeDuel(ctx, "trioDirectTrapPlanning");

  const topbar = document.querySelector(".topbar");
  const brand = document.querySelector(".brand");
  const arena = document.querySelector(".arena.duel-table");
  const handPanel = document.querySelector(".hand-panel");
  const handCommand = document.querySelector("#handCommand");
  if (!topbar || !brand || !arena || !handPanel || !handCommand) {
    throw new Error("duel-layout-density-basic: required desktop regions are missing");
  }
  if (window.innerWidth <= 1040) {
    throw new Error(`duel-layout-density-basic: expected desktop viewport, received ${window.innerWidth}x${window.innerHeight}`);
  }

  await waitForSmoke(
    () => handPanel.dataset.commandActive === "false",
    "duel-layout-density-basic: passive command state"
  );

  if (ctx.els.duelHint.dataset.kind !== "objective") {
    throw new Error(`duel-layout-density-basic: scenario goal is not classified as an objective (${ctx.els.duelHint.dataset.kind || "unset"})`);
  }
  if (ctx.els.duelHint.scrollWidth > Math.ceil(ctx.els.duelHint.clientWidth) + 1) {
    throw new Error(`duel-layout-density-basic: scenario objective is clipped (${ctx.els.duelHint.clientWidth}/${ctx.els.duelHint.scrollWidth})`);
  }

  const topbarRect = topbar.getBoundingClientRect();
  const brandRect = brand.getBoundingClientRect();
  const arenaRect = arena.getBoundingClientRect();
  const handPanelRect = handPanel.getBoundingClientRect();
  const passiveCommandRect = handCommand.getBoundingClientRect();
  if (topbarRect.height > window.innerHeight * 0.12) {
    throw new Error(`duel-layout-density-basic: topbar is too tall (${topbarRect.height}/${window.innerHeight})`);
  }
  if (brandRect.width > topbarRect.width * 0.22) {
    throw new Error(`duel-layout-density-basic: brand column is too wide (${brandRect.width}/${topbarRect.width})`);
  }
  if (arenaRect.height < window.innerHeight * 0.55) {
    throw new Error(`duel-layout-density-basic: battlefield is too short (${arenaRect.height}/${window.innerHeight})`);
  }
  if (passiveCommandRect.width > handPanelRect.width * 0.12) {
    throw new Error(`duel-layout-density-basic: passive command dock is too wide (${passiveCommandRect.width}/${handPanelRect.width})`);
  }

  clickSmokeElement(handCard(ctx.els, "star-breach"), "duel-layout-density-basic: select direct-attack spell");
  try {
    await waitForSmoke(
      () => handPanel.dataset.commandActive === "true" &&
        !ctx.els.choiceActions.hidden,
      "duel-layout-density-basic: hand command becomes active"
    );
  } catch (error) {
    throw new Error(`${error.message}; commandActive=${handPanel.dataset.commandActive}; choiceHidden=${ctx.els.choiceActions.hidden}; selected=${ctx.state.selected?.id || "none"}`);
  }
  await waitForSmoke(
    () => handCommand.getBoundingClientRect().width >= handPanelRect.width * 0.2,
    "duel-layout-density-basic: active command dock expands"
  );

  const activeCommandRect = handCommand.getBoundingClientRect();
  if (activeCommandRect.right > window.innerWidth || activeCommandRect.bottom > window.innerHeight) {
    throw new Error("duel-layout-density-basic: active command dock leaves the viewport");
  }

  clickSmokeElement(ctx.els.choiceCancelBtn, "duel-layout-density-basic: cancel hand command");
  await waitForSmoke(
    () => handPanel.dataset.commandActive === "false" && ctx.els.choiceActions.hidden,
    "duel-layout-density-basic: hand command returns to passive width"
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "duel-layout-density-basic: select field monster");
  await waitForSmoke(
    () => handPanel.dataset.commandActive === "true" &&
      !ctx.els.fieldActionBar.hidden &&
      handCommand.getBoundingClientRect().width >= handPanelRect.width * 0.2,
    "duel-layout-density-basic: field action dock expands"
  );

  if (ctx.els.toast.classList.contains("show") || ctx.els.toast.textContent.trim()) {
    throw new Error(`duel-layout-density-basic: stale feedback survived the new field selection (${ctx.els.toast.textContent.trim()})`);
  }
  if (ctx.els.duelHint.dataset.kind !== "action") {
    throw new Error(`duel-layout-density-basic: field selection hint is not classified as an action (${ctx.els.duelHint.dataset.kind || "unset"})`);
  }
  if (ctx.els.duelHint.scrollWidth > Math.ceil(ctx.els.duelHint.clientWidth) + 1) {
    throw new Error(`duel-layout-density-basic: field action hint is clipped (${ctx.els.duelHint.clientWidth}/${ctx.els.duelHint.scrollWidth})`);
  }

  const fieldActionRect = ctx.els.fieldActionBar.getBoundingClientRect();
  if (fieldActionRect.width < 240 || ctx.els.fieldActionBar.scrollWidth > Math.ceil(fieldActionRect.width)) {
    throw new Error(`duel-layout-density-basic: field actions are clipped (${fieldActionRect.width}/${ctx.els.fieldActionBar.scrollWidth})`);
  }
  if (ctx.els.fieldActionBar.scrollHeight > Math.ceil(fieldActionRect.height) + 1) {
    throw new Error(`duel-layout-density-basic: field actions overflow vertically (${fieldActionRect.height}/${ctx.els.fieldActionBar.scrollHeight})`);
  }
  const fieldActionBottom = Math.max(
    ...[ctx.els.fieldAttackBtn, ctx.els.fieldModeBtn, ctx.els.fieldDetailBtn, ctx.els.fieldCancelBtn]
      .map((button) => button.getBoundingClientRect().bottom)
  );
  if (fieldActionBottom > handPanel.getBoundingClientRect().bottom + 1) {
    throw new Error(`duel-layout-density-basic: field action buttons leave the hand panel (${fieldActionBottom}/${handPanel.getBoundingClientRect().bottom})`);
  }

  clickSmokeElement(ctx.els.fieldCancelBtn, "duel-layout-density-basic: cancel field command");
  await waitForSmoke(
    () => handPanel.dataset.commandActive === "false" && ctx.els.fieldActionBar.hidden,
    "duel-layout-density-basic: field action dock returns to passive width"
  );
  setSmokeStatus("passed", "duel-layout-density-basic");
}

async function runMobileHandChoiceFitBasicSmoke(ctx) {
  setSmokeStatus("running", "mobile-hand-choice-fit-basic");
  await startSmokeDuel(ctx, "trioChainLifecycle");

  if (window.innerWidth > 720) {
    throw new Error(`mobile-hand-choice-fit-basic: expected phone viewport, received ${window.innerWidth}x${window.innerHeight}`);
  }

  const hand = ctx.els.hand;
  const handPanel = document.querySelector(".hand-panel");
  const selectedCard = handCard(ctx.els, "guard-sigil");
  if (!hand || !handPanel || !selectedCard) {
    throw new Error("mobile-hand-choice-fit-basic: required hand regions are missing");
  }

  clickSmokeElement(selectedCard, "mobile-hand-choice-fit-basic: select guard sigil");
  await waitForSmoke(
    () => document.body.dataset.duelSelection === "hand" && !ctx.els.choiceActions.hidden,
    "mobile-hand-choice-fit-basic: hand choice opens"
  );

  const selectedCardRect = selectedCard.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();
  if (selectedCard.scrollHeight > Math.ceil(selectedCard.clientHeight) + 1) {
    throw new Error(`mobile-hand-choice-fit-basic: selected card content is clipped (${selectedCard.clientHeight}/${selectedCard.scrollHeight})`);
  }
  if (hand.scrollHeight > Math.ceil(hand.clientHeight) + 1) {
    throw new Error(`mobile-hand-choice-fit-basic: selected hand needs hidden vertical scrolling (${hand.clientHeight}/${hand.scrollHeight})`);
  }
  if (selectedCardRect.bottom > handRect.bottom + 1 || selectedCardRect.bottom > handPanel.getBoundingClientRect().bottom + 1) {
    throw new Error(`mobile-hand-choice-fit-basic: selected card leaves its hand region (${selectedCardRect.bottom}/${handRect.bottom})`);
  }

  clickSmokeElement(ctx.els.choiceCancelBtn, "mobile-hand-choice-fit-basic: cancel hand choice");
  await waitForSmoke(
    () => document.body.dataset.duelSelection === "none" && ctx.els.choiceActions.hidden,
    "mobile-hand-choice-fit-basic: hand choice closes"
  );
  setSmokeStatus("passed", "mobile-hand-choice-fit-basic");
}

async function runLandscapeHandChoiceFitBasicSmoke(ctx) {
  setSmokeStatus("running", "landscape-hand-choice-fit-basic");
  await startSmokeDuel(ctx, "trioChainLifecycle");

  if (window.innerWidth !== 844 || window.innerHeight !== 390) {
    throw new Error(`landscape-hand-choice-fit-basic: expected 844x390 content viewport, received ${window.innerWidth}x${window.innerHeight}`);
  }

  const hand = ctx.els.hand;
  const handPanel = document.querySelector(".hand-panel");
  const selectedCard = handCard(ctx.els, "guard-sigil");
  if (!hand || !handPanel || !selectedCard) {
    throw new Error("landscape-hand-choice-fit-basic: required hand regions are missing");
  }

  clickSmokeElement(selectedCard, "landscape-hand-choice-fit-basic: select guard sigil");
  await waitForSmoke(
    () => document.body.dataset.duelSelection === "hand" && !ctx.els.choiceActions.hidden,
    "landscape-hand-choice-fit-basic: hand choice opens"
  );

  const selectedCardRect = selectedCard.getBoundingClientRect();
  const handRect = hand.getBoundingClientRect();
  if (selectedCard.scrollHeight > Math.ceil(selectedCard.clientHeight) + 1) {
    throw new Error(`landscape-hand-choice-fit-basic: selected card content is clipped (${selectedCard.clientHeight}/${selectedCard.scrollHeight})`);
  }
  if (hand.scrollHeight > Math.ceil(hand.clientHeight) + 1) {
    throw new Error(`landscape-hand-choice-fit-basic: selected hand needs hidden vertical scrolling (${hand.clientHeight}/${hand.scrollHeight})`);
  }
  if (selectedCardRect.bottom > handRect.bottom + 1 || selectedCardRect.bottom > handPanel.getBoundingClientRect().bottom + 1) {
    throw new Error(`landscape-hand-choice-fit-basic: selected card leaves its hand region (${selectedCardRect.bottom}/${handRect.bottom})`);
  }

  clickSmokeElement(ctx.els.choiceCancelBtn, "landscape-hand-choice-fit-basic: cancel hand choice");
  await waitForSmoke(
    () => document.body.dataset.duelSelection === "none" && ctx.els.choiceActions.hidden,
    "landscape-hand-choice-fit-basic: hand choice closes"
  );
  setSmokeStatus("passed", "landscape-hand-choice-fit-basic");
}

async function runFiveZoneLayoutSmoke(ctx) {
  setSmokeStatus("running", "five-zone-layout");
  await startSmokeDuel(ctx, "expansionParry");

  const countSlots = (root, selector) => root.querySelectorAll(selector).length;
  if (countSlots(ctx.els.playerField, "[data-testid^='player-field-']") !== 5) throw new Error("玩家怪兽区没有渲染 5 格");
  if (countSlots(ctx.els.aiField, "[data-testid^='ai-field-']") !== 5) throw new Error("AI 怪兽区没有渲染 5 格");
  if (countSlots(ctx.els.playerTraps, "[data-testid^='player-trap-']") !== 5) throw new Error("玩家魔陷区没有渲染 5 格");
  if (countSlots(ctx.els.aiTraps, "[data-testid^='ai-trap-']") !== 5) throw new Error("AI 魔陷区没有渲染 5 格");

  const cards = [
    cloneCardById("star-lancer"),
    cloneCardById("solar-knight"),
    cloneCardById("mirror-snare"),
    cloneCardById("guard-sigil")
  ];
  if (cards.some((card) => !card)) throw new Error("five-zone-layout 缺少测试卡牌");

  ctx.state.player.field.fill(null);
  ctx.state.ai.field.fill(null);
  ctx.state.player.traps.fill(null);
  ctx.state.ai.traps.fill(null);
  ctx.state.player.hand = cards;
  ctx.state.player.normalSummonsUsed = 0;
  ctx.state.player.extraSummon = 1;
  ctx.state.selected = null;
  ctx.state.pendingTarget = null;
  ctx.state.turn = "player";
  ctx.state.phase = "main";
  ctx.state.actionWindow = "main";
  ctx.render?.();

  clickSmokeElement(handCard(ctx.els, "star-lancer"), "第 4 格召唤手牌");
  clickSmokeElement(fieldSlot(ctx.els, "player", 3), "玩家第 4 怪兽格");
  await waitForSmoke(
    () => ctx.state.player.field[3]?.id === "star-lancer" &&
      fieldSlot(ctx.els, "player", 3)?.querySelector('[data-card-id="star-lancer"]'),
    "玩家第 4 怪兽格真实更新",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "solar-knight"), "第 5 格召唤手牌");
  clickSmokeElement(fieldSlot(ctx.els, "player", 4), "玩家第 5 怪兽格");
  await waitForSmoke(
    () => ctx.state.player.field[4]?.id === "solar-knight" &&
      fieldSlot(ctx.els, "player", 4)?.querySelector('[data-card-id="solar-knight"]'),
    "玩家第 5 怪兽格真实更新",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "mirror-snare"), "第 4 魔陷手牌");
  clickSmokeElement(trapSlot(ctx.els, "player", 3), "玩家第 4 魔陷格");
  await waitForSmoke(
    () => ctx.state.player.traps[3]?.id === "mirror-snare" &&
      trapCard(ctx.els, "player", "mirror-snare"),
    "玩家第 4 魔陷格真实更新",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "guard-sigil"), "第 5 魔陷手牌");
  clickSmokeElement(trapSlot(ctx.els, "player", 4), "玩家第 5 魔陷格");
  await waitForSmoke(
    () => ctx.state.player.traps[4]?.id === "guard-sigil" &&
      trapCard(ctx.els, "player", "guard-sigil"),
    "玩家第 5 魔陷格真实更新",
    9000
  );

  ctx.state.ai.field[3] = cloneCardById("iron-guardian");
  ctx.state.ai.field[4] = cloneCardById("flare-titan");
  ctx.state.ai.traps[3] = cloneCardById("mirror-snare");
  ctx.state.ai.traps[4] = cloneCardById("guard-sigil");
  ctx.render?.();

  await waitForSmoke(
    () => fieldSlot(ctx.els, "ai", 3)?.querySelector('[data-card-id="iron-guardian"]') &&
      fieldSlot(ctx.els, "ai", 4)?.querySelector('[data-card-id="flare-titan"]') &&
      trapSlot(ctx.els, "ai", 3)?.querySelector(".card.back") &&
      trapSlot(ctx.els, "ai", 4)?.querySelector(".card.back"),
    "AI 第 4 / 第 5 格真实渲染",
    9000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "选择第 4 格攻击怪兽");
  await waitForSmoke(
    () => fieldSlot(ctx.els, "ai", 3)?.classList.contains("attack-target") &&
      fieldSlot(ctx.els, "ai", 4)?.classList.contains("attack-target"),
    "AI 第 4 / 第 5 怪兽格可作为攻击目标",
    9000
  );

  setSmokeStatus("passed", "five-zone-layout");
}

async function runBasicExpansionSmoke(ctx) {
  setSmokeStatus("running", "basic-expansion");
  await startSmokeDuel(ctx, "expansionParry");
  clickSmokeElement(handCard(ctx.els, "rift-bulwark"), "召唤裂隙壁卫");
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "裂隙壁卫召唤区");
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "rift-bulwark" &&
      ctx.state.player.shield === 300 &&
      countGameEvents(ctx.state, "SHIELD_GAINED") >= 1,
    "裂隙壁卫召唤护盾通过规则事件结算",
    9000
  );

  await waitForSmoke(
    () => ctx.state.actionWindow === "main" &&
      ctx.currentPlayerActions().spell &&
      Boolean(handCard(ctx.els, "soul-resonance")),
    "星魂共鸣可发动",
    6000
  );
  clickSmokeElement(handCard(ctx.els, "soul-resonance"), "星魂共鸣手牌");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "soulResonance" &&
      fieldCard(ctx.els, "player", "rift-bulwark")?.classList.contains("targetable"),
    "星魂共鸣目标选择",
    6000
  );
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "rift-bulwark"), "星魂共鸣选择裂隙壁卫");
  await waitForSmoke(
    () => ctx.state.player.field[1]?.tempAtk === 200 &&
      ctx.state.player.field[1]?.tempDef === 200 &&
      countGameEvents(ctx.state, "STAT_MODIFIED") >= 2,
    "星魂共鸣通过规则事件强化目标",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "soul-parry"), "星魂格挡手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放星魂格挡");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "soul-parry"), "星魂格挡盖放成功");

  const shieldEventsBeforeTrap = countGameEvents(ctx.state, "SHIELD_GAINED");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "星魂格挡攻击响应窗口", 18000);
  if (!ctx.els.chainText.textContent.includes("星魂格挡")) {
    throw new Error("星魂格挡响应提示缺少陷阱名称");
  }
  clickSmokeElement(ctx.els.chainYes, "确认发动星魂格挡");
  await waitForSmoke(
    () => countGameEvents(ctx.state, "SHIELD_GAINED") > shieldEventsBeforeTrap &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "STAT_MODIFIED" && event.amount === -300 && event.stat === "tempAtk"
      ) &&
      !ctx.state.player.traps.some((card) => card?.id === "soul-parry") &&
      ctx.state.log.some((entry) => entry.includes("星魂格挡") && entry.includes("攻击继续结算")),
    "星魂格挡削弱攻击怪兽并获得护盾",
    12000
  );
  if (!ctx.state.log.some((entry) => entry.includes("星魂格挡") && entry.includes("攻击继续结算"))) {
    throw new Error(`星魂格挡日志应说明攻击继续结算：${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "basic-expansion");
}

async function runProtagonistComebackDemoSmoke(ctx) {
  setSmokeStatus("running", "protagonist-comeback-demo");
  await startSmokeDuel(ctx, "protagonistComeback");
  assertScenarioBrief(ctx.els, {
    difficulty: "演示版",
    objectives: ["复活天穹逆星者", "完成一次反击攻击"]
  });
  if (ctx.state.player.lp !== 900 || !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace")) {
    throw new Error(`逆境觉醒初始状态不正确：${smokeDebug(ctx)}`);
  }

  const drawEventsBefore = countGameEvents(ctx.state, "CARDS_DRAWN");
  clickSmokeElement(handCard(ctx.els, "last-spark"), "余烬星愿手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "余烬星愿确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动余烬星愿");
  await waitForSmoke(
    () => countGameEvents(ctx.state, "CARDS_DRAWN") > drawEventsBefore &&
      ctx.state.player.hand.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.hand.some((card) => card?.id === "backlash-mirror") &&
      ctx.state.player.grave.some((card) => card?.id === "last-spark"),
    "余烬星愿通过规则事件抽到反击资源",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "starwake-recall"), "醒星回召手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "醒星回召确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动醒星回召");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace") &&
      !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace") &&
      ctx.state.gameEvents.some((event) =>
        event.type === "CARD_MOVED" &&
        event.from?.zone === "grave" &&
        event.to?.zone === "monsterZone"
      ),
    "醒星回召把墓地王牌移回怪兽区",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "dawn-edge"), "破晓锋印手牌");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "dawnEdge", "破晓锋印目标选择");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "astral-comet-ace"), "破晓锋印选择天穹逆星者");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 900),
    "破晓锋印加攻结算",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "limit-break-oath"), "临界誓辉手牌");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "lastStandSurge", "临界誓辉目标选择");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "astral-comet-ace"), "临界誓辉选择天穹逆星者");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 1600),
    "临界誓辉低生命强化结算",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "last-light-guard"), "残光护幕手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放残光护幕");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "last-light-guard"), "残光护幕盖放成功");

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "残光护幕攻击响应窗口", 24000);
  const guardName = ctx.state.player.traps.find((card) => card?.id === "last-light-guard")?.name || "残光护幕";
  const attackDeclared = (ctx.state.gameEvents || []).filter((event) => event.type === "ATTACK_DECLARED").at(-1);
  if (!attackDeclared || !ctx.els.chainText.textContent.includes(guardName)) {
    throw new Error(`残光护幕响应缺少攻击宣言或提示：${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.chainYes, "确认发动残光护幕");
  await waitForSmoke(
    () => ctx.state.gameEvents.some((event) =>
      event.type === "EFFECT_NEGATED" &&
      String(event.targetEffectId) === String(attackDeclared.id)
    ) &&
      ctx.state.gameEvents.some((event) =>
        event.type === "ATTACK_CANCELED" &&
        String(event.declarationEventId) === String(attackDeclared.id)
      ) &&
      !ctx.state.player.traps.some((card) => card?.id === "last-light-guard"),
    "残光护幕无效并取消对手关键攻击",
    12000
  );
  if (ctx.state.gameEvents.some((event) =>
    event.type === "BATTLE_RESOLVED" &&
    String(event.declarationEventId) === String(attackDeclared.id)
  )) {
    throw new Error(`被无效的攻击不应继续复用旧战斗结算：${smokeDebug(ctx)}`);
  }

  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && ctx.state.actionWindow === "main",
    "残光护幕后回到主角回合",
    24000
  );

  const aiLpBeforeCounter = ctx.state.ai.lp;
  const ace = fieldCard(ctx.els, "player", "astral-comet-ace");
  clickSmokeElement(ace, "选择复活后的天穹逆星者");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "flare-titan")?.classList.contains("attack-target"), "反击攻击目标高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "flare-titan"), "天穹逆星者反击熔核巨像");
  await waitForSmoke(
    () => ctx.state.gameEvents.some((event) =>
      event.type === "BATTLE_RESOLVED" &&
      event.playerId === "player" &&
      event.attackerCardId === ctx.state.player.field.find((card) => card?.id === "astral-comet-ace")?.uid
    ) &&
      ctx.state.ai.lp < aiLpBeforeCounter,
    "主角完成反击攻击并造成关键伤害",
    12000
  );

  setSmokeStatus("passed", "protagonist-comeback-demo");
}

async function runProtagonistComebackChallengeSmoke(ctx) {
  setSmokeStatus("running", "protagonist-comeback-challenge");
  await startSmokeDuel(ctx, "protagonistComebackChallenge");
  assertScenarioBrief(ctx.els, {
    difficulty: "挑战版",
    objectives: ["醒星回召选择天穹逆星者", "反击前先用解印射线清掉镜光反制"],
    hints: ["低星怪只是干扰目标"]
  });
  if (ctx.state.player.lp !== 900 ||
      ctx.state.ai.lp !== 3400 ||
      !ctx.state.player.grave.some((card) => card?.id === "spark-runner") ||
      !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace") ||
      !ctx.state.ai.traps.some((card) => card?.id === "mirror-snare")) {
    throw new Error(`逆境觉醒挑战初始状态不正确：${smokeDebug(ctx)}`);
  }

  const drawEventsBefore = countGameEvents(ctx.state, "CARDS_DRAWN");
  clickSmokeElement(handCard(ctx.els, "last-spark"), "挑战：余烬星愿");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "挑战：余烬星愿确认");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "挑战：确认发动余烬星愿");
  await waitForSmoke(
    () => countGameEvents(ctx.state, "CARDS_DRAWN") > drawEventsBefore &&
      ctx.state.player.hand.some((card) => card?.id === "battle-trance") &&
      ctx.state.player.hand.some((card) => card?.id === "backlash-mirror"),
    `挑战：余烬星愿应抽到保留资源。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "starwake-recall"), "挑战：醒星回召");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive" &&
      graveTargetCard(ctx.els, "spark-runner") &&
      graveTargetCard(ctx.els, "astral-comet-ace"),
    `挑战：醒星回召应显示多个墓地目标。${smokeDebug(ctx)}`,
    9000
  );
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "astral-comet-ace"), "挑战：选择天穹逆星者");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace") &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace"),
    `挑战：醒星回召必须复活王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "dawn-edge"), "挑战：破晓锋印");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "dawnEdge", "挑战：破晓锋印目标选择");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：破晓锋印选择王牌");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 900),
    `挑战：破晓锋印应强化王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "limit-break-oath"), "挑战：临界誓辉");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "lastStandSurge", "挑战：临界誓辉目标选择");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：临界誓辉选择王牌");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 1600),
    `挑战：临界誓辉应叠到王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "last-light-guard"), "挑战：残光护幕");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "挑战：盖下残光护幕");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "last-light-guard"), "挑战：残光护幕盖放");

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "挑战：残光护幕响应窗口", 24000);
  const attackDeclared = (ctx.state.gameEvents || []).filter((event) => event.type === "ATTACK_DECLARED").at(-1);
  if (!attackDeclared || !ctx.els.chainText.textContent.includes("残光护幕")) {
    throw new Error(`挑战：关键攻击必须能被残光护幕响应。${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.chainYes, "挑战：发动残光护幕");
  await waitForSmoke(
    () => ctx.state.gameEvents.some((event) =>
      event.type === "ATTACK_CANCELED" &&
      String(event.declarationEventId) === String(attackDeclared.id)
    ) &&
      ctx.state.gameEvents.some((event) =>
        event.type === "EFFECT_NEGATED" &&
        String(event.targetEffectId) === String(attackDeclared.id)
      ) &&
      ctx.state.player.lp === 900,
    `挑战：残光护幕应挡下斩杀攻击。${smokeDebug(ctx)}`,
    12000
  );

  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      ctx.state.player.hand.some((card) => card?.id === "dispelling-ray"),
    `挑战：第二回合应抽到解印射线。${smokeDebug(ctx)}`,
    24000
  );

  const aiTrapBefore = ctx.state.ai.traps.find((card) => card?.id === "mirror-snare")?.uid || null;
  clickSmokeElement(handCard(ctx.els, "dispelling-ray"), "挑战：解印射线");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", "挑战：解印射线目标选择");
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot:not(.empty)"), "挑战：选择对手盖卡");
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "mirror-snare") &&
      ctx.state.ai.grave.some((card) => card?.id === "mirror-snare") &&
      (!aiTrapBefore || ctx.state.gameEvents.some((event) =>
        event.type === "CARD_DESTROYED" &&
        event.cardId === aiTrapBefore
      )),
    `挑战：解印射线应先清掉反制陷阱。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "battle-trance"), "挑战：战斗狂热");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "battleTrance", "挑战：战斗狂热目标选择");
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：战斗狂热选择王牌");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 1800),
    `挑战：战斗狂热应在反击回合强化王牌。${smokeDebug(ctx)}`,
    9000
  );

  const aiLpBeforeCounter = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：选择王牌攻击");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "flare-titan")?.classList.contains("attack-target"), "挑战：反击目标高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "flare-titan"), "挑战：王牌击破熔核巨像");
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "flare-titan") &&
      ctx.state.ai.lp < aiLpBeforeCounter &&
      ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && !card.used),
    `挑战：第一次反击应击破对手并保留再攻击。${smokeDebug(ctx)}`,
    12000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：选择再攻击王牌");
  await waitForSmoke(() => ctx.els.aiPanel.classList.contains("direct-target"), "挑战：再攻击直击高亮");
  clickSmokeElement(ctx.els.aiPanel, "挑战：王牌直接反击");
  await waitForSmoke(
    () => ctx.state.gameOver &&
      ctx.state.gameOverWinner === "player" &&
      countGameEvents(ctx.state, "GAME_OVER_DECLARED") >= 1 &&
      countGameEvents(ctx.state, "BATTLE_RESOLVED") >= 2,
    `挑战：正确路径应完成翻盘胜利。${smokeDebug(ctx)}`,
    12000
  );

  setSmokeStatus("passed", "protagonist-comeback-challenge");
}

async function runProtagonistComebackAutopilotFailsSmoke(ctx) {
  setSmokeStatus("running", "protagonist-comeback-autopilot-fails");
  await startSmokeDuel(ctx, "protagonistComebackChallenge");

  clickSmokeElement(handCard(ctx.els, "dawn-edge"), "乱点：过早发动破晓锋印");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "dawnEdge", "乱点：破晓锋印默认目标");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：默认强化当前怪兽");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) >= 900),
    `乱点：破晓锋印应被浪费在星火信使上。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "last-spark"), "乱点：余烬星愿");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "乱点：余烬星愿确认");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：确认余烬星愿");
  await waitForSmoke(() => ctx.state.player.hand.some((card) => card?.id === "battle-trance"), "乱点：抽到战斗狂热");

  clickSmokeElement(handCard(ctx.els, "starwake-recall"), "乱点：醒星回召");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive" && graveTargetCard(ctx.els, "spark-runner"),
    "乱点：醒星回召目标选择"
  );
  clickSmokeElement(graveTargetCard(ctx.els, "spark-runner"), "乱点：选择墓地星火信使");
  await waitForSmoke(() => !ctx.els.choiceConfirmBtn.disabled, "乱点：星火信使目标就绪");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：错误复活星火信使");
  await waitForSmoke(
    () => ctx.state.player.field.filter((card) => card?.id === "spark-runner").length >= 2 &&
      !ctx.state.player.field.some((card) => card?.id === "astral-comet-ace"),
    `乱点：错误复活应错过王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "last-light-guard"), "乱点：残光护幕");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "乱点：盖下残光护幕");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "last-light-guard"), "乱点：残光护幕盖放");

  clickSmokeElement(handCard(ctx.els, "limit-break-oath"), "乱点：临界誓辉");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "lastStandSurge", "乱点：临界誓辉默认目标");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：默认强化最高攻击怪兽");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) >= 1600),
    `乱点：临界誓辉应继续堆在低收益目标上。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "battle-trance"), "乱点：战斗狂热过早使用");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "battleTrance", "乱点：战斗狂热默认目标");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：默认战斗狂热");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) >= 1800),
    `乱点：战斗狂热应继续浪费在低收益目标上。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "backlash-mirror"), "乱点：逆光折返");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "乱点：盖下逆光折返");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "backlash-mirror"), "乱点：逆光折返盖放");

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "乱点：残光护幕响应", 24000);
  clickSmokeElement(ctx.els.chainYes, "乱点：发动残光护幕");
  await waitForSmoke(
    () => ctx.state.gameEvents.some((event) => event.type === "ATTACK_CANCELED"),
    `乱点：仍会挡下一次攻击，但没有王牌。${smokeDebug(ctx)}`,
    12000
  );

  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      ctx.state.player.hand.some((card) => card?.id === "dispelling-ray"),
    `乱点：第二回合抽到解印射线。${smokeDebug(ctx)}`,
    24000
  );
  clickSmokeElement(handCard(ctx.els, "dispelling-ray"), "乱点：解印射线");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", "乱点：解印射线默认目标");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：默认清理对手盖卡");
  await waitForSmoke(() => !ctx.state.ai.traps.some((card) => card?.id === "mirror-snare"), "乱点：清理反制陷阱");

  const aiLpBeforeAttack = ctx.state.ai.lp;
  const strongestSpark = ctx.state.player.field
    .filter((card) => card?.id === "spark-runner")
    .sort((left, right) => (right.tempAtk || 0) - (left.tempAtk || 0))[0];
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "乱点：选择被错误强化的星火信使");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "flare-titan")?.classList.contains("attack-target"), "乱点：攻击目标高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "flare-titan"), "乱点：星火信使攻击熔核巨像");
  await waitForSmoke(
    () => ctx.state.ai.lp < aiLpBeforeAttack &&
      !ctx.state.gameOver &&
      ctx.state.ai.lp > 0,
    `乱点：低收益目标不应完成挑战胜利。${smokeDebug(ctx)}`,
    12000
  );

  if ((ctx.state.gameOver && ctx.state.gameOverWinner === "player") ||
      ctx.state.ai.lp <= 0 ||
      ctx.state.player.field.some((card) => card?.id === "astral-comet-ace") ||
      (strongestSpark && (strongestSpark.tempAtk || 0) >= 2000)) {
    throw new Error(`乱点路线不应等价于挑战正确路径：${smokeDebug(ctx)}`);
  }

  setSmokeStatus("passed", "protagonist-comeback-autopilot-fails");
}

async function runProtagonistAceEvolutionDemoSmoke(ctx) {
  setSmokeStatus("running", "protagonist-ace-evolution-demo");
  await startSmokeDuel(ctx, "protagonistAceEvolution");
  const materialUids = ctx.state.player.field
    .filter((card) => ["ember-soul-initiate", "lumen-gearlet"].includes(card?.id))
    .map((card) => card.uid);
  const aceAvailable = [...ctx.state.player.hand, ...ctx.state.player.deck]
    .some((card) => card?.id === "astral-forge-dragon");
  if (materialUids.length !== 2 || !aceAvailable) {
    throw new Error(`王牌进化演示初始素材或卡组王牌不正确：${smokeDebug(ctx)}`);
  }

  const statEventsBefore = countGameEvents(ctx.state, "STAT_MODIFIED");
  clickSmokeElement(handCard(ctx.els, "soulforge-ascent"), "星魂铸升手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "星魂铸升确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动星魂铸升");
  await waitForSmoke(
    () => materialUids.every((uid) => ctx.state.player.grave.some((card) => card?.uid === uid)) &&
      ctx.state.player.field.some((card) => card?.id === "astral-forge-dragon") &&
      (ctx.state.gameEvents || []).some((event) => event.type === "MATERIALS_SENT") &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "MONSTER_SUMMONED" &&
        event.summonType === "special" &&
        event.cardId === ctx.state.player.field.find((card) => card?.id === "astral-forge-dragon")?.uid
      ) &&
      countGameEvents(ctx.state, "STAT_MODIFIED") > statEventsBefore &&
      ctx.state.ai.field.some((card) => card?.id === "void-siege-breaker" && (card.tempAtk || 0) < 0),
    `星魂铸升必须送墓素材、特殊召唤王牌并压低对手怪兽。${smokeDebug(ctx)}`,
    10000
  );

  const aiLpBeforeAttack = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-forge-dragon"), "选择天炉星铠王");
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "void-siege-breaker")?.classList.contains("attack-target"),
    `王牌进化后反击目标应该可选。${smokeDebug(ctx)}`,
    6000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "void-siege-breaker"), "天炉星铠王攻击虚痕镇压者");
  await waitForSmoke(
    () => ctx.state.ai.lp < aiLpBeforeAttack &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "BATTLE_RESOLVED" &&
        event.playerId === "player" &&
        event.attackerCardId === ctx.state.player.field.find((card) => card?.id === "astral-forge-dragon")?.uid
      ),
    `进化王牌应该能完成一次攻击反击。${smokeDebug(ctx)}`,
    12000
  );
  setSmokeStatus("passed", "protagonist-ace-evolution-demo");
}

async function runProtagonistAceProtectionDemoSmoke(ctx) {
  setSmokeStatus("running", "protagonist-ace-protection-demo");
  await startSmokeDuel(ctx, "protagonistAceProtection");
  if (!ctx.state.player.field.some((card) => card?.id === "astral-forge-dragon") ||
      !ctx.state.player.hand.some((card) => card?.id === "ace-vow-guard")) {
    throw new Error(`王牌守护演示初始状态不正确：${smokeDebug(ctx)}`);
  }

  clickSmokeElement(handCard(ctx.els, "ace-vow-guard"), "王牌誓护手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放王牌誓护");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "ace-vow-guard"), "王牌誓护盖放成功");

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.ai.grave.some((card) => card?.id === "corebreak-edict") &&
      ctx.state.player.field.some((card) => card?.id === "astral-forge-dragon" && (card.tempAtk || 0) < 0),
    `对手应先发动裂核裁令削弱王牌。${smokeDebug(ctx)}`,
    22000
  );
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `王牌誓护攻击响应窗口。${smokeDebug(ctx)}`, 18000);
  const attackDeclared = (ctx.state.gameEvents || []).filter((event) => event.type === "ATTACK_DECLARED").at(-1);
  if (!attackDeclared || !ctx.els.chainText.textContent.includes("王牌誓护")) {
    throw new Error(`王牌誓护响应缺少攻击声明或提示：${smokeDebug(ctx)}`);
  }
  if (!chainChoiceButton(ctx.els, "ace-vow-guard")) {
    throw new Error(`王牌誓护必须出现在弹窗候选中：${smokeDebug(ctx)}`);
  }
  clickSmokeElement(chainChoiceButton(ctx.els, "ace-vow-guard"), "在弹窗内选择王牌誓护");
  await waitForSmoke(
    () => !ctx.els.chainYes.disabled && ctx.els.chainText.textContent.includes("王牌誓护"),
    `王牌誓护确认按钮必须可用。${smokeDebug(ctx)}`,
    6000
  );
  clickSmokeElement(ctx.els.chainYes, "确认发动王牌誓护");
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).some((event) =>
        event.type === "EFFECT_NEGATED" &&
        String(event.targetEffectId) === String(attackDeclared.id)
      ) &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "ATTACK_CANCELED" &&
        String(event.declarationEventId) === String(attackDeclared.id)
      ) &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "STAT_MODIFIED" &&
        event.sourceCardId === ctx.state.player.grave.find((card) => card?.id === "ace-vow-guard")?.uid &&
        event.amount === 900
      ) &&
      !ctx.state.player.traps.some((card) => card?.id === "ace-vow-guard") &&
      ctx.state.player.field.some((card) => card?.id === "astral-forge-dragon"),
    `王牌誓护必须无效攻击、强化王牌并离场。${smokeDebug(ctx)}`,
    12000
  );

  await waitForSmoke(
    () => !ctx.state.aiRunning && ctx.state.turn === "player" && ctx.state.phase === "main" && ctx.state.actionWindow === "main",
    `王牌守护后应回到玩家主阶段。${smokeDebug(ctx)}`,
    24000
  );

  const aiLpBeforeCounter = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-forge-dragon"), "选择守住后的天炉星铠王");
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "void-siege-breaker")?.classList.contains("attack-target"),
    `守护后的王牌应该可以反击。${smokeDebug(ctx)}`,
    6000
  );
  clickSmokeElement(fieldSlot(ctx.els, "ai", 0), "天炉星铠王反击虚痕镇压者");
  await waitForSmoke(
    () => (ctx.state.ai.lp < aiLpBeforeCounter ||
        ctx.state.ai.grave.some((card) => card?.id === "void-siege-breaker")) &&
      (ctx.state.gameEvents || []).some((event) =>
        event.type === "BATTLE_RESOLVED" &&
        event.playerId === "player" &&
        event.attackerCardId === ctx.state.player.field.find((card) => card?.id === "astral-forge-dragon")?.uid
      ),
    `守住王牌后应该完成关键反击。${smokeDebug(ctx)}`,
    12000
  );
  setSmokeStatus("passed", "protagonist-ace-protection-demo");
}

function assertTrioOmegaInitial(ctx, label) {
  const aiAces = ["trio-sun-judicator", "trio-moon-warden", "trio-star-herald"];
  if (!aiAces.every((id) => ctx.state.ai.field.some((card) => card?.id === id))) {
    throw new Error(`${label}：三曜王牌初始压场不完整。${smokeDebug(ctx)}`);
  }
  if (!ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    throw new Error(`${label}：月曜帷幕未预置。${smokeDebug(ctx)}`);
  }
  const decoy = ctx.state.player.field.find((card) => card?.id === "trio-decoy-ward");
  if (!decoy || (decoy.tempAtk || 0) >= 0 || (decoy.tempDef || 0) >= 0) {
    throw new Error(`${label}：折光诱标卫应被月曜帷幕持续削弱。${smokeDebug(ctx)}`);
  }
  if (!ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn")) {
    throw new Error(`${label}：余烁小卫应埋在墓地作为终局资源。${smokeDebug(ctx)}`);
  }
}

function eventReferencesTemplate(event, templateId) {
  return [
    event?.cardId,
    event?.sourceCardId,
    event?.attackerCardId,
    event?.targetCardId,
    event?.summonCardId
  ].some((value) => String(value || "").startsWith(`${templateId}-`) || value === templateId);
}

function trioOmegaFailureSnapshot(ctx) {
  const events = ctx.state.gameEvents || [];
  const latest = events[events.length - 1] || null;
  return JSON.stringify({
    turnCount: events.filter((event) => event.type === "TURN_STARTED").length + 1,
    turn: ctx.state.turn,
    phase: ctx.state.phase,
    gameOver: ctx.state.gameOver || null,
    gameOverWinner: ctx.state.gameOverWinner || null,
    lp: {
      player: ctx.state.player.lp,
      ai: ctx.state.ai.lp
    },
    player: {
      hand: cardIds(ctx.state.player.hand),
      field: ctx.state.player.field.map(cardSnapshot),
      traps: ctx.state.player.traps.map(cardSnapshot),
      grave: ctx.state.player.grave.map(cardSnapshot)
    },
    ai: {
      field: ctx.state.ai.field.map(cardSnapshot),
      traps: ctx.state.ai.traps.map(cardSnapshot),
      grave: ctx.state.ai.grave.map(cardSnapshot)
    },
    latestGameEvent: eventSnapshot(latest),
    finalCounterActivated: events.some((event) =>
      event.type === "CARD_ACTIVATED" && eventReferencesTemplate(event, "trio-final-counter")
    ) || ctx.state.player.grave.some((card) => card?.id === "trio-final-counter"),
    moonDominionCleared: !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")
  });
}

function currentAttack(card) {
  return (Number(card?.atk) || 0) + (Number(card?.tempAtk) || 0);
}

function strongestCardId(cards = []) {
  return cards
    .filter(Boolean)
    .slice()
    .sort((a, b) => currentAttack(b) - currentAttack(a))[0]?.id || null;
}

async function runTrioOmegaDemoCorrectLine(ctx, scenarioId, smokeName, expectedDifficulty) {
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, scenarioId);
  assertScenarioBrief(ctx.els, {
    difficulty: expectedDifficulty,
    objectives: ["三曜", "低星"],
    hints: ["月曜帷幕"]
  });
  assertTrioOmegaInitial(ctx, smokeName);

  const initialStrongestPlayerAtk = Math.max(...ctx.state.player.field.filter(Boolean).map((card) => card.atk + (card.tempAtk || 0)));
  if (initialStrongestPlayerAtk >= 3000) {
    throw new Error(`${smokeName}：初始场面不应存在可硬打日曜的高攻怪兽。${smokeDebug(ctx)}`);
  }

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}：选择日冕诱锁`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}：盖下日冕诱锁`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}：日冕诱锁盖放`);

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}：日曜攻击响应窗口`, 26000);
  if (!ctx.els.chainText.textContent.includes("曜冕裁决者")) {
    throw new Error(`${smokeName}：第一轮响应应来自日曜攻击。${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.chainYes, `${smokeName}：发动日冕诱锁`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.player.grave.some((card) => card?.id === "trio-solar-snare"),
    `${smokeName}：日曜被诱锁破解`,
    12000
  );
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}：回到玩家反击回合。${smokeDebug(ctx)}`,
    32000
  );
  for (const cardId of ["trio-star-herald", "trio-moon-warden"]) {
    const card = cloneCardById(cardId);
    if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes(`对手保留 ${card.name} 的攻击机会`))) {
      throw new Error(`${smokeName}: ${card.name} should receive an explicit post-chain attack decision. ${smokeDebug(ctx)}`);
    }
  }

  clickSmokeElement(assertHandCardReady(ctx.els, "trio-moonbreaker-ray", `${smokeName}：碎月解幕高亮`), `${smokeName}：选择碎月解幕`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}：碎月解幕目标选择`);
  await clickSmokeElementTwiceAcrossRender(
    () => ctx.els.aiTraps.querySelector(".trap-slot.targetable"),
    `${smokeName}：连续点击破坏月曜帷幕`,
    () => Boolean(ctx.state.pendingTarget?.selectedTarget)
  );
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "trio-decoy-ward" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0),
    `${smokeName}：月曜帷幕被清除并释放修正`,
    9000
  );

  clickSmokeElement(assertHandCardReady(ctx.els, "trio-ember-recall", `${smokeName}：余烁归轨高亮`), `${smokeName}：选择余烁归轨`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}：余烁归轨墓地目标`);
  await clickSmokeElementTwiceAcrossRender(
    () => graveTargetCard(ctx.els, "trio-ember-pawn"),
    `${smokeName}：连续点击回召余烁小卫`,
    () => Boolean(ctx.state.pendingTarget?.selectedTarget)
  );
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" &&
      card.mode === "attack" &&
      !card.used &&
      !card.changedMode &&
      (card.tempAtk || 0) === 0 &&
      (card.tempDef || 0) === 0 &&
      (card.battleWear || 0) === 0
    ) &&
      !ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn"),
    `${smokeName}：余烁小卫以重置后的攻击表示回场`,
    9000
  );
  await waitForSmoke(() => logCardLink(ctx.els, "trio-ember-pawn"), `${smokeName}：时间线出现余烁小卫详情入口`);
  clickSmokeElement(logCardLink(ctx.els, "trio-ember-pawn"), `${smokeName}：打开时间线卡牌详情`);
  await assertCardDetailModal(ctx, cloneCardById("trio-ember-pawn"), `${smokeName}：时间线卡牌详情`);
  clickSmokeElement(ctx.els.zoomClose, `${smokeName}：关闭时间线卡牌详情`);
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), `${smokeName}：时间线详情关闭`);

  clickSmokeElement(assertHandCardReady(ctx.els, "trio-final-counter", `${smokeName}：三曜终断高亮`), `${smokeName}：选择三曜终断`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}：三曜终断确认`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}：发动三曜终断`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && card.atk === 600 && (card.tempAtk || 0) >= 2100),
    `${smokeName}：低攻关键怪获得终局突破力`,
    9000
  );
  await waitForSmoke(() => logCardLink(ctx.els, "trio-final-counter"), `${smokeName}：时间线出现三曜终断详情入口`);
  clickSmokeElement(logCardLink(ctx.els, "trio-final-counter"), `${smokeName}：打开三曜终断详情`);
  await assertCardDetailModal(ctx, cloneCardById("trio-final-counter"), `${smokeName}：三曜终断详情`);
  if (!ctx.els.zoomText.textContent.includes("2100") || !ctx.els.zoomText.textContent.includes("追加攻击")) {
    throw new Error(`${smokeName}：三曜终断详情必须写明攻击力增量和攻击重置结果。`);
  }
  clickSmokeElement(ctx.els.zoomClose, `${smokeName}：关闭三曜终断详情`);
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), `${smokeName}：三曜终断详情关闭`);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}：选择余烁小卫第一次攻击`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"), `${smokeName}：月曜目标高亮`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}：余烁小卫击破月曜`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden") &&
      ctx.state.ai.lp === 300 &&
      ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && !card.used),
    `${smokeName}：攻击重置保留第二击。${smokeDebug(ctx)}`,
    12000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}：选择余烁小卫第二次攻击`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"), `${smokeName}：星曜目标高亮`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}：余烁小卫击破星曜`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "player" &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-star-herald"),
    `${smokeName}：低攻怪完成终局胜利`,
    12000
  );

  const finalPawn = ctx.state.player.field.find((card) => card?.id === "trio-ember-pawn");
  if (!finalPawn || finalPawn.atk !== 600) {
    throw new Error(`${smokeName}：最终胜利必须来自原始低攻余烁小卫。${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioOmegaDemoSmoke(ctx) {
  await runTrioOmegaDemoCorrectLine(ctx, "protagonistTrioOmega", "trio-omega-demo", "演示版");
  setSmokeStatus("passed", "trio-omega-demo");
}

async function runLunarDominionTargetLossSmoke(ctx) {
  const smokeName = "lunar-dominion-target-loss-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmega");
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.id === "trio-decoy-ward") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-moon-dominion") &&
      !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
    `${smokeName}：目标离场后月曜帷幕送墓`,
    30000
  );
  if (!(ctx.state.gameEvents || []).some((event) =>
    event.type === "CARD_DESTROYED" &&
    eventReferencesTemplate(event, "trio-moon-dominion") &&
    event.reason === "continuous-target-left-zone"
  )) {
    throw new Error(`${smokeName}：目标离场后月曜帷幕必须因失去目标送墓。${smokeDebug(ctx)}`);
  }
  if (!(ctx.state.gameEvents || []).some((event) =>
    event.type === "CONTINUOUS_EFFECT_RELEASED" &&
    event.effectId === "lunarDominion" &&
    event.reason === "target-left-zone"
  )) {
    throw new Error(`${smokeName}：目标离场后必须释放月曜帷幕的有效压制状态。${smokeDebug(ctx)}`);
  }
  await waitForSmoke(
    () => (ctx.state.log || []).some((entry) => {
      const message = logEntryMessage(entry);
      return message.includes("月曜帷幕") && message.includes("失去目标") && message.includes("送入墓地");
    }),
    `${smokeName}：时间线必须说明月曜帷幕因失去目标送墓`,
    30000
  );
  await waitForSmoke(() => logCardLink(ctx.els, "trio-moon-dominion"), `${smokeName}：时间线出现月曜帷幕详情入口`);
  clickSmokeElement(logCardLink(ctx.els, "trio-moon-dominion"), `${smokeName}：从时间线打开月曜帷幕详情`);
  await assertCardDetailModal(ctx, cloneCardById("trio-moon-dominion"), `${smokeName}：月曜帷幕详情`);
  if (!ctx.els.zoomText.textContent.includes("目标离开怪兽区时") || !ctx.els.zoomText.textContent.includes("送入持有者墓地")) {
    throw new Error(`${smokeName}：月曜帷幕详情必须写明失去目标后的送墓规则。`);
  }
  clickSmokeElement(ctx.els.zoomClose, `${smokeName}：关闭月曜帷幕详情`);
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), `${smokeName}：月曜帷幕详情关闭`);
  setSmokeStatus("passed", smokeName);
}

async function runTrioOmegaChallengeSmoke(ctx) {
  setSmokeStatus("running", "trio-omega-challenge");
  await startSmokeDuel(ctx, "protagonistTrioOmegaChallenge");
  assertScenarioBrief(ctx.els, {
    difficulty: "挑战版",
    objectives: ["唯一回召", "跨过对手回合"],
    hints: ["攻击力最高"]
  });
  assertTrioOmegaInitial(ctx, "trio-omega-challenge");

  if (handCard(ctx.els, "trio-moonbreaker-ray")) {
    throw new Error(`trio-omega-challenge: challenge should not open with moonbreaker in hand. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.player.grave.some((card) => card?.id === "flare-titan")) {
    throw new Error(`trio-omega-challenge: challenge should include a tempting wrong grave target. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), "challenge: select solar snare");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "challenge: set solar snare");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), "challenge: solar snare set");
  const snareUid = ctx.state.player.traps.find((card) => card?.id === "trio-solar-snare")?.uid;
  if (!ctx.state.player.hand.some((card) => card?.id === "trio-ember-recall") ||
      !ctx.state.player.hand.some((card) => card?.id === "trio-final-counter")) {
    throw new Error(`trio-omega-challenge: correct line must preserve recall and final counter before the rival turn. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `challenge: sun attack response window. ${smokeDebug(ctx)}`, 26000);
  clickSmokeElement(ctx.els.chainYes, "challenge: activate solar snare");
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `challenge: sun ace destroyed by laid trap. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && handCard(ctx.els, "trio-moonbreaker-ray"),
    `challenge: returned to player after rival turn with moonbreaker drawn. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  if (!(ctx.state.gameEvents || []).some((event) => event.type === "TURN_STARTED" && event.playerId === "ai")) {
    throw new Error(`trio-omega-challenge: correct path must cross the rival turn. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  clickSmokeElement(assertHandCardReady(ctx.els, "trio-moonbreaker-ray", "challenge: moonbreaker highlight"), "challenge: select moonbreaker");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", "challenge: moonbreaker target selection");
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), "challenge: destroy moon dominion");
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "trio-decoy-ward" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0),
    `challenge: moon dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  const recallCard = ctx.state.player.hand.find((card) => card?.id === "trio-ember-recall");
  clickSmokeElement(assertHandCardReady(ctx.els, "trio-ember-recall", "challenge: ember recall highlight"), "challenge: select ember recall");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", "challenge: grave target selection");
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), "challenge: revive ember pawn");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" &&
      card.mode === "attack" &&
      !card.used &&
      !card.changedMode &&
      (card.tempAtk || 0) === 0 &&
      (card.tempDef || 0) === 0 &&
      (card.battleWear || 0) === 0
    ) &&
      !ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn"),
    `challenge: ember pawn revived after setup. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  const events = ctx.state.gameEvents || [];
  const snareSetIndex = events.findIndex((event) =>
    event.type === "TRAP_SET" && (!snareUid || event.cardId === snareUid)
  );
  const recallIndex = events.findIndex((event) =>
    event.type === "CARD_ACTIVATED" && (!recallCard?.uid || event.cardId === recallCard.uid)
  );
  if (snareSetIndex < 0 || recallIndex < 0 || snareSetIndex >= recallIndex) {
    throw new Error(`trio-omega-challenge: setup trap must happen before grave recovery. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  clickSmokeElement(assertHandCardReady(ctx.els, "trio-final-counter", "challenge: final counter highlight"), "challenge: select final counter");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "challenge: final counter confirm");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "challenge: activate final counter");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && card.atk === 600 && (card.tempAtk || 0) >= 2100),
    `challenge: low attacker receives finale resource. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  if (!fieldCard(ctx.els, "player", "trio-ember-pawn")?.textContent.includes("再攻 ×1")) {
    throw new Error(`trio-omega-challenge: final counter target should show one sourced extra attack. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), "challenge: pawn first attack");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"), "challenge: moon target highlighted");
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), "challenge: pawn breaks moon");
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden") &&
      ctx.state.ai.lp === 300 &&
      ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && !card.used),
    `challenge: first attack resolves and reset remains. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  if (!(ctx.state.log || []).some((entry) =>
    logEntryMessage(entry).includes("余烁小卫 消耗来自「三曜终断」的追加攻击机会")
  )) {
    throw new Error(`trio-omega-challenge: attack reset log should name its source. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), "challenge: pawn second attack");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"), "challenge: star target highlighted");
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), "challenge: pawn breaks star");
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "player" &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-star-herald"),
    `challenge: low attacker wins after preserved resource line. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );

  const finalPawn = ctx.state.player.field.find((card) => card?.id === "trio-ember-pawn");
  if (!finalPawn || finalPawn.atk !== 600) {
    throw new Error(`trio-omega-challenge: final win must come from base-600 pawn. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  setSmokeStatus("passed", "trio-omega-challenge");
}

async function runTrioOmegaStoryDemoSmoke(ctx) {
  const smokeName = "trio-omega-story-demo";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaStory");
  assertTrioOmegaInitial(ctx, smokeName);
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select solar snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set solar snare`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}: solar snare set`);

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: sun attack response window`, 26000);
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: activate solar snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: sun god destroyed by laid trap. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("第一尊神"), `${smokeName}: fallen god story beat`, 8000);

  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && handCard(ctx.els, "trio-moonbreaker-ray"),
    `${smokeName}: returned to player with moonbreaker drawn. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: moonbreaker target selection`);
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: destroy moon dominion`);
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
    `${smokeName}: moon dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("月曜帷幕解除了"), `${smokeName}: dominion cleared story beat`, 8000);

  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: select ember recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: grave target selection`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: revive ember pawn`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" && card.mode === "attack" && !card.used
    ) && !ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn"),
    `${smokeName}: ember pawn revived. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: select final counter`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: final counter confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: activate final counter`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && card.atk === 600 && (card.tempAtk || 0) >= 2100),
    `${smokeName}: pawn receives finale resource. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("打破封印"), `${smokeName}: final counter story beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn first attack`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"), `${smokeName}: moon target highlighted`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: pawn breaks moon`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden") && ctx.state.ai.lp === 300,
    `${smokeName}: first attack resolves. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("第二尊神"), `${smokeName}: moon falls story beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn second attack`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"), `${smokeName}: star target highlighted`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}: pawn breaks star`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "player",
    `${smokeName}: story line wins. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("最后一尊神"), `${smokeName}: star falls story beat`, 8000);
  await waitForSmoke(() => storyLog().includes("由我来打破"), `${smokeName}: victory story beat`, 8000);
  setSmokeStatus("passed", "trio-omega-story-demo");
}

async function runTrioOmegaVowDemoSmoke(ctx) {
  const smokeName = "trio-omega-vow-demo";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaVow");
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");

  clickSmokeElement(handCard(ctx.els, "seer-call"), `${smokeName}: seer call`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: seer confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm seer call`);
  await waitForSmoke(() => ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray"), `${smokeName}: seer draws moonbreaker`);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set snare`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}: snare set`);

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: sun attack response`, 26000);
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: destroy sun with snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("第一尊神"), `${smokeName}: sun falls beat`, 8000);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: back to player. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: moonbreaker`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: moonbreaker target`);
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: destroy dominion`);
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
    `${smokeName}: dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("月曜帷幕解除了"), `${smokeName}: dominion cleared beat`, 8000);
  if (handCard(ctx.els, "trio-chain-veil")) {
    clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: select chain veil`);
    clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set chain veil`);
  }
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: second rival turn passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: recall target`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: revive pawn`);
  await waitForSmoke(() => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"), `${smokeName}: pawn revived`);
  clickSmokeElement(handCard(ctx.els, "trio-final-counter-vow"), `${smokeName}: cast vow`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: vow confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm vow`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" && card.atk === 600 && card.tempAtk === 2100
    ),
    `${smokeName}: pawn reaches 2700. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("立下誓约"), `${smokeName}: vow beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: moon target`,
    8000
  );
  if (fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target")) {
    clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: pawn breaks moon`);
    await waitForSmoke(
      () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"),
      `${smokeName}: moon destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
      12000
    );
    await waitForSmoke(() => storyLog().includes("第二尊神"), `${smokeName}: moon falls beat`, 8000);
  }
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: third rival turn passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  for (let guard = 0; guard < 6 && !ctx.state.gameOver; guard += 1) {
    if (ctx.state.turn !== "player" || ctx.state.phase !== "main") {
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: wait player turn ${guard}`,
        32000
      );
      continue;
    }
    const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
    clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn attack ${guard}`);
    await waitForSmoke(
      () => ctx.els.aiField?.querySelector(".attack-target") ||
        ctx.els.aiPanel?.classList.contains("direct-target") ||
        ctx.state.gameOver,
      `${smokeName}: attack target ${guard}`,
      8000
    );
    const target = ctx.els.aiField?.querySelector(".attack-target");
    if (target) {
      clickSmokeElement(target, `${smokeName}: break god ${guard}`);
    } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
      clickSmokeElement(ctx.els.aiPanel, `${smokeName}: direct attack ${guard}`);
    }
    await waitForSmoke(
      () => ctx.state.gameOver ||
        countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
        !ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
      `${smokeName}: attack resolves ${guard}`,
      15000
    );
    if (!ctx.state.gameOver) {
      await finishPlayerTurn(ctx);
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: rival turn ${guard}`,
        32000
      );
    }
  }

  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`${smokeName}: story line did not win. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => storyLog().includes("由我打破"), `${smokeName}: victory beat`, 8000);
  setSmokeStatus("passed", "trio-omega-vow-demo");
}

async function runFinaleSunflareTargetLockBasicSmoke(ctx) {
  const smokeName = "finale-sunflare-target-lock-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFinaleRush");
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");

  clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: select chain veil`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set chain veil first`);
  await waitForSmoke(() => ctx.state.player.traps[0]?.id === "trio-chain-veil", `${smokeName}: chain veil set`);
  const veil = ctx.state.player.traps[0];
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select solar snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set solar snare second`);
  await waitForSmoke(() => ctx.state.player.traps[1]?.id === "trio-solar-snare", `${smokeName}: solar snare set`);
  const snare = ctx.state.player.traps[1];
  await finishPlayerTurn(ctx);

  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      chainChoiceButton(ctx.els, "trio-chain-veil") &&
      chainChoiceButton(ctx.els, "trio-solar-snare") &&
      ctx.els.playerTraps.querySelector('.trap-slot[data-index="0"].after-attack-locked .after-attack-lock-chip')?.textContent.includes("日曜锁定"),
    `${smokeName}: both attack traps are offered and the declaration target is marked`,
    26000
  );
  clickSmokeElement(chainChoiceButton(ctx.els, "trio-chain-veil"), `${smokeName}: choose chain veil`);
  await waitForSmoke(
    () => !ctx.els.chainYes.disabled && ctx.els.chainYes.textContent.includes("星线护续"),
    `${smokeName}: chain veil selected`
  );
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: activate chain veil into nullifier`);

  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "chain-nullifier"),
    `${smokeName}: rival reveals chain nullifier`,
    12000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue nullifier reveal`);
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "trio-sun-judicator"),
    `${smokeName}: sun after-attack effect reveal`,
    18000
  );
  if (!ctx.els.aiRevealSummary?.textContent.includes("攻击后效果没有转移到其他魔陷")) {
    throw new Error(`${smokeName}: sun reveal must explain the exact no-transfer resolution. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue sun effect reveal`);

  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.uid === veil.uid) &&
      ctx.state.player.traps.some((card) => card?.uid === snare.uid) &&
      storyLog().includes("星线护续的效果被连锁无效；已发动陷阱仍送入墓地") &&
      storyLog().includes("曜冕裁决者锁定的魔陷「星线护续」已提前离场，攻击后效果没有转移到其他魔陷"),
    `${smokeName}: the negated target leaves and the lock does not transfer. ${trioOmegaFailureSnapshot(ctx)}`,
    18000
  );

  const skippedEvent = (ctx.state.gameEvents || []).find((event) =>
    event.type === "EFFECT_SKIPPED" && event.cardId === veil.uid && event.reason === "negated"
  );
  const lockedEvent = (ctx.state.gameEvents || []).find((event) =>
    event.type === "AFTER_ATTACK_TARGET_LOCKED" && event.targetCardId === veil.uid &&
    eventReferencesTemplate(event, "trio-sun-judicator")
  );
  const lostTargetEvent = (ctx.state.gameEvents || []).find((event) =>
    event.type === "EFFECT_SKIPPED" && event.effectId === "sunflareSunder" &&
    event.targetCardId === veil.uid && event.reason === "locked-target-left-zone"
  );
  const transferredDestruction = (ctx.state.gameEvents || []).find((event) =>
    event.type === "CARD_DESTROYED" && event.cardId === snare.uid &&
    eventReferencesTemplate(event, "trio-sun-judicator")
  );
  if (
    !lockedEvent || !skippedEvent || !lostTargetEvent || transferredDestruction ||
    Number(lockedEvent.id) >= Number(skippedEvent.id) || Number(skippedEvent.id) >= Number(lostTargetEvent.id)
  ) {
    throw new Error(`${smokeName}: declaration lock, chain cleanup, and no-transfer order is wrong. ${smokeDebug(ctx)}`);
  }
  if (!logCardLink(ctx.els, "trio-chain-veil") || !logCardLink(ctx.els, "trio-solar-snare")) {
    throw new Error(`${smokeName}: both public trap names must remain inspectable in the timeline.`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTrioOmegaFinaleSmoke(ctx) {
  const smokeName = "trio-omega-finale-demo";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFinale");
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");

  if (ctx.state.player.lp !== 1500 || ctx.state.ai.lp !== 4000) {
    throw new Error(`${smokeName}: finale opening LP mismatch. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (ctx.state.player.field.filter((card) => card?.id === "trio-decoy-ward").length !== 2) {
    throw new Error(`${smokeName}: finale needs two decoy wards on the player field. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    throw new Error(`${smokeName}: finale needs the moon dominion laid. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.ai.hand.some((card) => card?.id === "chain-nullifier")) {
    throw new Error(`${smokeName}: finale needs the chain nullifier in the rival hand. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  // Turn 1: bait trap in slot 0, real snare behind it in slot 1.
  clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: select chain veil bait`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set chain veil`);
  await waitForSmoke(() => ctx.state.player.traps[0]?.id === "trio-chain-veil", `${smokeName}: chain veil set`);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select solar snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set solar snare`);
  await waitForSmoke(() => ctx.state.player.traps[1]?.id === "trio-solar-snare", `${smokeName}: solar snare set`);
  await finishPlayerTurn(ctx);

  // Rival turn 1: lays the nullifier, then the sun attacks the dominion-pressed decoy.
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show"),
    `${smokeName}: sun response window`,
    26000
  );
  if (!ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier")) {
    throw new Error(`${smokeName}: rival should lay the chain nullifier before attacking. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.player.field[1] || ctx.state.player.field[1].id !== "trio-decoy-ward") {
    throw new Error(`${smokeName}: pressed decoy must occupy player field slot 1. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  // Stable route: decline the first response and let the declaration-locked bait take the sundering.
  // Activating it is also safe now because a departed lock cannot transfer to the rear snare.
  clickSmokeElement(ctx.els.chainNo, `${smokeName}: decline first trap response`);
  await waitForSmoke(
    () => ctx.state.player.lp === 1500 && !ctx.state.player.field[1],
    `${smokeName}: pressed decoy destroyed without battle damage. ${trioOmegaFailureSnapshot(ctx)}`,
    15000
  );
  await waitForSmoke(() => storyLog().includes("碾碎这道防线"), `${smokeName}: sun attack beat`, 8000);
  if (!ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare")) {
    throw new Error(`${smokeName}: solar snare must survive behind the bait. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (ctx.state.player.traps.some((card) => card?.id === "trio-chain-veil")) {
    throw new Error(`${smokeName}: bait trap should be torn down by the sun. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier")) {
    throw new Error(`${smokeName}: nullifier should stay armed after a declined response. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: back to player after first wave. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 2: rebuild the wall, clear any remaining nullifier, keep the pawn in the grave.
  clickSmokeElement(handCard(ctx.els, "trio-decoy-ward"), `${smokeName}: select wall 2`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}: summon wall 2`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "trio-decoy-ward",
    `${smokeName}: wall 2 summoned. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(
    fieldSlot(ctx.els, "player", 1).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: select wall 2 for mode switch`
  );
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: switch wall 2 to defense`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.mode === "defense",
    `${smokeName}: wall 2 in defense`,
    8000
  );
  if (ctx.state.ai.traps.some(Boolean)) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker`);
    await waitForSmoke(
      () => ctx.state.pendingTarget?.effect === "destroySpellTrap",
      `${smokeName}: moonbreaker target window`
    );
    await selectAndConfirmSpellTarget(
      ctx,
      ctx.els.aiTraps.querySelector(".trap-slot.targetable"),
      `${smokeName}: destroy nullifier`
    );
    await waitForSmoke(
      () => !ctx.state.ai.traps.some(Boolean),
      `${smokeName}: nullifier removed. ${trioOmegaFailureSnapshot(ctx)}`,
      9000
    );
    await waitForSmoke(() => storyLog().includes("断链保护消失了"), `${smokeName}: nullifier cleared beat`, 8000);
  }
  await finishPlayerTurn(ctx);

  // Rival turn 2: re-arms the dominion, then the sun walks into the snare.
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show"),
    `${smokeName}: snare response window`,
    24000
  );
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: activate solar snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: sun god destroyed by the surviving snare. ${trioOmegaFailureSnapshot(ctx)}`,
    18000
  );
  await waitForSmoke(() => storyLog().includes("太阳神"), `${smokeName}: sun falls beat`, 8000);
  await waitForSmoke(() => storyLog().includes("再度展开"), `${smokeName}: dominion rearm beat`, 8000);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: back to player after second wave. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 3: clear the re-armed dominion, revive the pawn, cast the finale, break two gods.
  if (ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker 2`);
    await waitForSmoke(
      () => ctx.state.pendingTarget?.effect === "destroySpellTrap",
      `${smokeName}: moonbreaker 2 target window`
    );
    await selectAndConfirmSpellTarget(
      ctx,
      ctx.els.aiTraps.querySelector(".trap-slot.targetable"),
      `${smokeName}: destroy rearmed dominion`
    );
    await waitForSmoke(
      () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
      `${smokeName}: rearmed dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
      9000
    );
  }
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: select ember recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: grave target selection`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: revive ember pawn`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" && card.mode === "attack" && !card.used
    ),
    `${smokeName}: ember pawn revived. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: select final counter`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: final counter confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: activate final counter`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100),
    `${smokeName}: pawn receives finale resource. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("为了打破封印"), `${smokeName}: finale cast beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn first attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"),
    `${smokeName}: moon target highlighted`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: pawn breaks moon`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"),
    `${smokeName}: moon destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("第二尊神"), `${smokeName}: moon falls beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn second attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"),
    `${smokeName}: star target highlighted`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}: pawn breaks star`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-star-herald"),
    `${smokeName}: star destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("最后一尊神"), `${smokeName}: star falls beat`, 8000);
  await finishPlayerTurn(ctx);

  // Rival turn 3 re-arms a second dominion on the pawn; the returned guardian blocks direct attacks.
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "temple-revenant"),
    `${smokeName}: temple guardian re-summoned. ${trioOmegaFailureSnapshot(ctx)}`,
    16000
  );
  await waitForSmoke(() => storyLog().includes("再临守卫"), `${smokeName}: temple re-summon beat`, 8000);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: rival turn 3 passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 4: search the removal, clear the pawn press, then break the returned guardian.
  if (!ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    throw new Error(`${smokeName}: second dominion should press the pawn. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.player.field.some((card) =>
    card?.id === "trio-ember-pawn" && (card.tempAtk || 0) < 2100)) {
    throw new Error(`${smokeName}: pawn should be pressed below finale strength. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  clickSmokeElement(handCard(ctx.els, "seer-call"), `${smokeName}: play seer call`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: seer confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm seer call`);
  await waitForSmoke(
    () => ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray"),
    `${smokeName}: seer draws moonbreaker. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker 3`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: moonbreaker target`);
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: clear pawn press`);
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100),
    `${smokeName}: pawn press cleared. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: cast second finale`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: second finale confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm second finale`);
  const finaleDecoyIndex = () => ctx.state.player.field.findIndex((card) =>
    card?.id === "trio-decoy-ward" && (card.tempAtk || 0) >= 2100);
  await waitForSmoke(
    () => finaleDecoyIndex() >= 0,
    `${smokeName}: decoy receives second finale. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(
    fieldSlot(ctx.els, "player", finaleDecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: select finale decoy`
  );
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: switch finale decoy to attack`);
  await waitForSmoke(
    () => ctx.state.player.field[finaleDecoyIndex()]?.mode === "attack",
    `${smokeName}: finale decoy attack mode`,
    8000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn attacks guardian`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "temple-revenant")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: guardian target highlighted`,
    8000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "temple-revenant"), `${smokeName}: pawn breaks guardian`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "temple-revenant"),
    `${smokeName}: guardian destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("再临的守卫"), `${smokeName}: guardian falls beat`, 8000);
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: final sun god stands. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("永远不会真正倒下"), `${smokeName}: final sun beat`, 8000);
  clickSmokeElement(
    fieldSlot(ctx.els, "player", finaleDecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: decoy attacks final sun`
  );
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-sun-judicator")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: final sun target highlighted`,
    8000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-sun-judicator"), `${smokeName}: decoy breaks final sun`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: final sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await finishPlayerTurn(ctx);

  // The pawn grinds the remaining LP with direct attacks.
  for (let guard = 0; guard < 6 && !ctx.state.gameOver; guard += 1) {
    if (ctx.state.turn !== "player" || ctx.state.phase !== "main") {
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: wait player turn ${guard}`,
        32000
      );
      continue;
    }
    const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
    clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn direct ${guard}`);
    await waitForSmoke(
      () => ctx.els.aiField?.querySelector(".attack-target") ||
        ctx.els.aiPanel?.classList.contains("direct-target") ||
        ctx.state.gameOver,
      `${smokeName}: direct target ${guard}`,
      8000
    );
    const target = ctx.els.aiField?.querySelector(".attack-target");
    if (target) {
      clickSmokeElement(target, `${smokeName}: attack target ${guard}`);
    } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
      clickSmokeElement(ctx.els.aiPanel, `${smokeName}: direct attack ${guard}`);
    }
    await waitForSmoke(
      () => ctx.state.gameOver ||
        countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
        !ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
      `${smokeName}: attack resolves ${guard}`,
      15000
    );
    if (!ctx.state.gameOver) {
      await finishPlayerTurn(ctx);
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: rival turn ${guard}`,
        32000
      );
    }
  }

  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`${smokeName}: story line did not win. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => storyLog().includes("由我彻底打破"), `${smokeName}: victory beat`, 8000);
  setSmokeStatus("passed", "trio-omega-finale-demo");
}

async function runTrioOmegaFinaleRushSmoke(ctx) {
  const smokeName = "trio-omega-finale-rush";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFinaleRush");
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");
  const pawnPressed = () => ctx.state.player.field.some((card) =>
    card?.id === "trio-ember-pawn" && (card.tempAtk || 0) < 2100);
  const pawnReady = () => ctx.state.player.field.some((card) =>
    card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100);
  const finaleDecoyIndex = () => ctx.state.player.field.findIndex((card) =>
    card?.id === "trio-decoy-ward" && (card.tempAtk || 0) >= 2100);

  if (ctx.state.player.lp !== 1500 || ctx.state.ai.lp !== 4000) {
    throw new Error(`${smokeName}: rush opening LP mismatch. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (ctx.state.player.field.filter((card) => card?.id === "trio-decoy-ward").length !== 2) {
    throw new Error(`${smokeName}: rush needs two decoy wards on the player field. ${trioOmegaFailureSnapshot(ctx)}`);
  }

  // Turn 1: bait trap in slot 0, real snare behind it in slot 1.
  clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: select chain veil bait`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set chain veil`);
  await waitForSmoke(() => ctx.state.player.traps[0]?.id === "trio-chain-veil", `${smokeName}: chain veil set`);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select solar snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: set solar snare`);
  await waitForSmoke(() => ctx.state.player.traps[1]?.id === "trio-solar-snare", `${smokeName}: solar snare set`);
  await finishPlayerTurn(ctx);

  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show"),
    `${smokeName}: sun response window`,
    26000
  );
  if (!ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier")) {
    throw new Error(`${smokeName}: rival should lay the chain nullifier before attacking. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  clickSmokeElement(ctx.els.chainNo, `${smokeName}: decline first trap response`);
  await waitForSmoke(
    () => ctx.state.player.lp === 1500 && !ctx.state.player.field[1],
    `${smokeName}: pressed decoy destroyed without battle damage. ${trioOmegaFailureSnapshot(ctx)}`,
    15000
  );
  await waitForSmoke(() => storyLog().includes("碾碎这道防线"), `${smokeName}: sun attack beat`, 8000);
  if (!ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare")) {
    throw new Error(`${smokeName}: solar snare must survive behind the bait. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: back to player after first wave. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 2: rebuild the wall, clear the nullifier.
  clickSmokeElement(handCard(ctx.els, "trio-decoy-ward"), `${smokeName}: select wall 2`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}: summon wall 2`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "trio-decoy-ward",
    `${smokeName}: wall 2 summoned. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(
    fieldSlot(ctx.els, "player", 1).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: select wall 2 for mode switch`
  );
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: switch wall 2 to defense`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.mode === "defense",
    `${smokeName}: wall 2 in defense`,
    8000
  );
  if (ctx.state.ai.traps.some(Boolean)) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker`);
    await waitForSmoke(
      () => ctx.state.pendingTarget?.effect === "destroySpellTrap",
      `${smokeName}: moonbreaker target window`
    );
    await selectAndConfirmSpellTarget(
      ctx,
      ctx.els.aiTraps.querySelector(".trap-slot.targetable"),
      `${smokeName}: destroy nullifier`
    );
    await waitForSmoke(
      () => !ctx.state.ai.traps.some(Boolean),
      `${smokeName}: nullifier removed. ${trioOmegaFailureSnapshot(ctx)}`,
      9000
    );
  }
  await finishPlayerTurn(ctx);

  // Rival turn 2: re-arms the dominion, then the sun walks into the snare.
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show"),
    `${smokeName}: snare response window`,
    24000
  );
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: activate solar snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: sun god destroyed by the surviving snare. ${trioOmegaFailureSnapshot(ctx)}`,
    18000
  );
  await waitForSmoke(() => storyLog().includes("太阳神"), `${smokeName}: sun falls beat`, 8000);
  await waitForSmoke(() => storyLog().includes("再度展开"), `${smokeName}: dominion rearm beat`, 8000);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: back to player after second wave. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 3: clear the first re-armed dominion, revive the pawn, cast the finale, break two gods.
  if (ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: select moonbreaker 2`);
    await waitForSmoke(
      () => ctx.state.pendingTarget?.effect === "destroySpellTrap",
      `${smokeName}: moonbreaker 2 target window`
    );
    await selectAndConfirmSpellTarget(
      ctx,
      ctx.els.aiTraps.querySelector(".trap-slot.targetable"),
      `${smokeName}: destroy rearmed dominion`
    );
    await waitForSmoke(
      () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
      `${smokeName}: rearmed dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
      9000
    );
  }
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: select ember recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: grave target selection`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: revive ember pawn`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" && card.mode === "attack" && !card.used
    ),
    `${smokeName}: ember pawn revived. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: select final counter`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: final counter confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: activate final counter`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100),
    `${smokeName}: pawn receives finale resource. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  await waitForSmoke(() => storyLog().includes("为了打破封印"), `${smokeName}: finale cast beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn first attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"),
    `${smokeName}: moon target highlighted`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: pawn breaks moon`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"),
    `${smokeName}: moon destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("第二尊神"), `${smokeName}: moon falls beat`, 8000);

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn second attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"),
    `${smokeName}: star target highlighted`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}: pawn breaks star`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-star-herald"),
    `${smokeName}: star destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("最后一尊神"), `${smokeName}: star falls beat`, 8000);
  await finishPlayerTurn(ctx);

  // Rival turn 3 re-summons the guardian (the second dominion may arrive on any later turn).
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "temple-revenant"),
    `${smokeName}: temple guardian re-summoned. ${trioOmegaFailureSnapshot(ctx)}`,
    16000
  );
  await waitForSmoke(() => storyLog().includes("再临守卫"), `${smokeName}: temple re-summon beat`, 8000);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: rival turn 3 passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );

  // Turn 4: search the removal, clear the pawn press only if it already landed, then finish the wave.
  clickSmokeElement(handCard(ctx.els, "seer-call"), `${smokeName}: play seer call`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: seer confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm seer call`);
  await waitForSmoke(
    () => ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray"),
    `${smokeName}: seer draws moonbreaker. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  if (pawnPressed()) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: clear early pawn press`);
    await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: moonbreaker target`);
    await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: clear pawn press`);
    await waitForSmoke(
      () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") && pawnReady(),
      `${smokeName}: pawn press cleared. ${trioOmegaFailureSnapshot(ctx)}`,
      9000
    );
  }

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: cast second finale`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: second finale confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm second finale`);
  await waitForSmoke(
    () => finaleDecoyIndex() >= 0,
    `${smokeName}: decoy receives second finale. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(
    fieldSlot(ctx.els, "player", finaleDecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: select finale decoy`
  );
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: switch finale decoy to attack`);
  await waitForSmoke(
    () => ctx.state.player.field[finaleDecoyIndex()]?.mode === "attack",
    `${smokeName}: finale decoy attack mode`,
    8000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn attacks guardian`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "temple-revenant")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: guardian target highlighted`,
    8000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "temple-revenant"), `${smokeName}: pawn breaks guardian`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "temple-revenant"),
    `${smokeName}: guardian destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("再临的守卫"), `${smokeName}: guardian falls beat`, 8000);
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: final sun god stands. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("永远不会真正倒下"), `${smokeName}: final sun beat`, 8000);
  clickSmokeElement(
    fieldSlot(ctx.els, "player", finaleDecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'),
    `${smokeName}: decoy attacks final sun`
  );
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-sun-judicator")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: final sun target highlighted`,
    8000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-sun-judicator"), `${smokeName}: decoy breaks final sun`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: final sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await finishPlayerTurn(ctx);

  // Grind: clear any late dominion that presses the pawn, then direct-attack to the finish.
  for (let guard = 0; guard < 7 && !ctx.state.gameOver; guard += 1) {
    if (ctx.state.turn !== "player" || ctx.state.phase !== "main") {
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: wait player turn ${guard}`,
        32000
      );
      continue;
    }
    if (pawnPressed() && handCard(ctx.els, "trio-moonbreaker-ray")) {
      clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: clear late dominion ${guard}`);
      await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: late moonbreaker target`);
      await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: clear late dominion`);
      await waitForSmoke(
        () => pawnReady(),
        `${smokeName}: pawn unpressed ${guard}. ${trioOmegaFailureSnapshot(ctx)}`,
        9000
      );
    }
    const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
    clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: pawn direct ${guard}`);
    await waitForSmoke(
      () => ctx.els.aiField?.querySelector(".attack-target") ||
        ctx.els.aiPanel?.classList.contains("direct-target") ||
        ctx.state.gameOver,
      `${smokeName}: direct target ${guard}`,
      8000
    );
    const target = ctx.els.aiField?.querySelector(".attack-target");
    if (target) {
      clickSmokeElement(target, `${smokeName}: attack target ${guard}`);
    } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
      clickSmokeElement(ctx.els.aiPanel, `${smokeName}: direct attack ${guard}`);
    }
    await waitForSmoke(
      () => ctx.state.gameOver ||
        countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
        !ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
      `${smokeName}: attack resolves ${guard}`,
      15000
    );
    if (!ctx.state.gameOver) {
      await finishPlayerTurn(ctx);
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: rival turn ${guard}`,
        32000
      );
    }
  }

  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`${smokeName}: rush line did not win. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => storyLog().includes("由我彻底打破"), `${smokeName}: victory beat`, 8000);
  setSmokeStatus("passed", "trio-omega-finale-rush");
}

async function runTrioGauntletSmoke(ctx) {
  const smokeName = "trio-gauntlet-demo";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioGauntlet");
  const storyLog = () => (ctx.state.log || []).map(logEntryMessage).join(" ");
  const waitChapter = (scenarioId, chapterIndex) => waitForSmoke(
    () => ctx.state.scenarioId === scenarioId &&
      ctx.state.gauntlet?.chapterIndex === chapterIndex &&
      ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.pendingOpeningDraw,
    `${smokeName}: gauntlet enters chapter ${chapterIndex + 1} (${scenarioId})`,
    32000
  );

  // ===== Chapter 1: 逆转篇 =====
  await waitChapter("protagonistTrioOmegaStory", 0);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: c1 select snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: c1 set snare`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}: c1 snare set`);
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: c1 sun response`, 26000);
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: c1 activate snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: c1 sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && handCard(ctx.els, "trio-moonbreaker-ray"),
    `${smokeName}: c1 back to player. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );
  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c1 moonbreaker`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c1 moonbreaker target`);
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c1 destroy dominion`);
  await waitForSmoke(() => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"), `${smokeName}: c1 dominion cleared`);
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: c1 recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: c1 recall target`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: c1 revive pawn`);
  await waitForSmoke(() => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && !card.used), `${smokeName}: c1 pawn revived`);
  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: c1 final counter`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c1 counter confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c1 confirm counter`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100),
    `${smokeName}: c1 pawn buffed. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c1 pawn attack`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"), `${smokeName}: c1 moon target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: c1 break moon`);
  await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"), `${smokeName}: c1 moon destroyed`);
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c1 pawn second attack`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"), `${smokeName}: c1 star target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}: c1 break star`);
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "player",
    `${smokeName}: c1 won. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await waitForSmoke(() => storyLog().includes("连战推进"), `${smokeName}: c1 advance log`, 8000);

  // ===== Chapter 2: 誓约篇 =====
  await waitChapter("protagonistTrioOmegaVow", 1);
  clickSmokeElement(handCard(ctx.els, "seer-call"), `${smokeName}: c2 seer`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c2 seer confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c2 confirm seer`);
  await waitForSmoke(() => ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray"), `${smokeName}: c2 seer draws moonbreaker`);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: c2 select snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: c2 set snare`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}: c2 snare set`);
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: c2 sun response`, 26000);
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: c2 activate snare`);
  await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"), `${smokeName}: c2 sun destroyed`, 12000);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main",
    `${smokeName}: c2 back to player. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );
  if (ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c2 moonbreaker`);
    await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c2 moonbreaker target`);
    await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c2 destroy dominion`);
    await waitForSmoke(() => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"), `${smokeName}: c2 dominion cleared`);
  }
  if (handCard(ctx.els, "trio-chain-veil")) {
    clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: c2 set chain veil`);
    clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: c2 confirm chain veil`);
  }
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: c2 second rival turn passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: c2 recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: c2 recall target`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: c2 revive pawn`);
  await waitForSmoke(() => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"), `${smokeName}: c2 pawn revived`);
  clickSmokeElement(handCard(ctx.els, "trio-final-counter-vow"), `${smokeName}: c2 vow`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c2 vow confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c2 confirm vow`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) =>
      card?.id === "trio-ember-pawn" && card.atk === 600 && card.tempAtk === 2100
    ),
    `${smokeName}: c2 pawn 2700. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c2 pawn attack`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target") || ctx.state.gameOver,
    `${smokeName}: c2 moon target`,
    8000
  );
  if (fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target")) {
    clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: c2 break moon`);
    await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"), `${smokeName}: c2 moon destroyed`, 12000);
  }
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: c2 third rival turn passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );
  for (let guard = 0; guard < 8 && !ctx.state.gameOver; guard += 1) {
    if (ctx.state.turn !== "player" || ctx.state.phase !== "main") {
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: c2 wait player turn ${guard}`,
        32000
      );
      continue;
    }
    const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
    clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c2 pawn attack ${guard}`);
    await waitForSmoke(
      () => ctx.els.aiField?.querySelector(".attack-target") ||
        ctx.els.aiPanel?.classList.contains("direct-target") ||
        ctx.state.gameOver,
      `${smokeName}: c2 attack target ${guard}`,
      8000
    );
    const target = ctx.els.aiField?.querySelector(".attack-target");
    if (target) {
      clickSmokeElement(target, `${smokeName}: c2 break target ${guard}`);
    } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
      clickSmokeElement(ctx.els.aiPanel, `${smokeName}: c2 direct ${guard}`);
    }
    await waitForSmoke(
      () => ctx.state.gameOver ||
        countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
        !ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
      `${smokeName}: c2 attack resolves ${guard}`,
      15000
    );
    if (!ctx.state.gameOver) {
      await finishPlayerTurn(ctx);
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: c2 rival turn ${guard}`,
        32000
      );
    }
  }
  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`${smokeName}: chapter 2 did not win. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => storyLog().includes("连战推进"), `${smokeName}: c2 advance log`, 8000);

  // ===== Chapter 3: 终焉篇 =====
  await waitChapter("protagonistTrioOmegaFinale", 2);
  clickSmokeElement(handCard(ctx.els, "trio-chain-veil"), `${smokeName}: c3 select bait`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: c3 set bait`);
  await waitForSmoke(() => ctx.state.player.traps[0]?.id === "trio-chain-veil", `${smokeName}: c3 bait set`);
  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: c3 select snare`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: c3 set snare`);
  await waitForSmoke(() => ctx.state.player.traps[1]?.id === "trio-solar-snare", `${smokeName}: c3 snare set`);
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: c3 sun response`, 26000);
  clickSmokeElement(ctx.els.chainNo, `${smokeName}: c3 decline first response`);
  await waitForSmoke(
    () => !ctx.state.player.field[1] && !ctx.state.player.traps.some((card) => card?.id === "trio-chain-veil"),
    `${smokeName}: c3 bait torn down. ${trioOmegaFailureSnapshot(ctx)}`,
    15000
  );
  if (!ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare")) {
    throw new Error(`${smokeName}: c3 snare must survive. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  await waitForSmoke(() => ctx.state.turn === "player" && ctx.state.phase === "main", `${smokeName}: c3 back to player`, 32000);
  clickSmokeElement(handCard(ctx.els, "trio-decoy-ward"), `${smokeName}: c3 select wall`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}: c3 summon wall`);
  await waitForSmoke(() => ctx.state.player.field[1]?.id === "trio-decoy-ward", `${smokeName}: c3 wall summoned`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1).querySelector('[data-card-id="trio-decoy-ward"]'), `${smokeName}: c3 select wall mode`);
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: c3 wall defense`);
  await waitForSmoke(() => ctx.state.player.field[1]?.mode === "defense", `${smokeName}: c3 wall defense ready`);
  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c3 moonbreaker`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c3 moonbreaker target`);
  await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c3 destroy nullifier`);
  await waitForSmoke(() => !ctx.state.ai.traps.some(Boolean), `${smokeName}: c3 nullifier removed`);
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: c3 snare response`, 24000);
  clickSmokeElement(ctx.els.chainYes, `${smokeName}: c3 activate snare`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: c3 sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    18000
  );
  await waitForSmoke(() => ctx.state.turn === "player" && ctx.state.phase === "main", `${smokeName}: c3 back after sun`, 32000);
  if (ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion")) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c3 moonbreaker 2`);
    await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c3 moonbreaker 2 target`);
    await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c3 destroy dominion 2`);
    await waitForSmoke(() => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"), `${smokeName}: c3 dominion 2 cleared`);
  }
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: c3 recall`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}: c3 recall target`);
  await selectAndConfirmSpellTarget(ctx, graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}: c3 revive pawn`);
  await waitForSmoke(() => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"), `${smokeName}: c3 pawn revived`);
  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: c3 final counter`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c3 counter confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c3 confirm counter`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && (card.tempAtk || 0) >= 2100),
    `${smokeName}: c3 pawn buffed. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c3 pawn attack moon`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-moon-warden")?.classList.contains("attack-target"), `${smokeName}: c3 moon target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-moon-warden"), `${smokeName}: c3 break moon`);
  await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden"), `${smokeName}: c3 moon destroyed`);
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c3 pawn attack star`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-star-herald")?.classList.contains("attack-target"), `${smokeName}: c3 star target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-star-herald"), `${smokeName}: c3 break star`);
  await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "trio-star-herald"), `${smokeName}: c3 star destroyed`);
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "temple-revenant"),
    `${smokeName}: c3 guardian re-summoned. ${trioOmegaFailureSnapshot(ctx)}`,
    16000
  );
  await waitForSmoke(
    () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
    `${smokeName}: c3 rival turn 3 passes. ${trioOmegaFailureSnapshot(ctx)}`,
    32000
  );
  clickSmokeElement(handCard(ctx.els, "seer-call"), `${smokeName}: c3 seer`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c3 seer confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c3 confirm seer`);
  await waitForSmoke(() => ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray"), `${smokeName}: c3 seer draws moonbreaker`);
  const c3PawnPressed = () => ctx.state.player.field.some((card) =>
    card?.id === "trio-ember-pawn" && (card.tempAtk || 0) < 2100);
  if (c3PawnPressed()) {
    clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c3 clear pawn press`);
    await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c3 moonbreaker target`);
    await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c3 clear press`);
    await waitForSmoke(() => !c3PawnPressed(), `${smokeName}: c3 pawn unpressed. ${trioOmegaFailureSnapshot(ctx)}`, 9000);
  }
  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: c3 second finale`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}: c3 second finale confirm`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: c3 confirm second finale`);
  const c3DecoyIndex = () => ctx.state.player.field.findIndex((card) =>
    card?.id === "trio-decoy-ward" && (card.tempAtk || 0) >= 2100);
  await waitForSmoke(() => c3DecoyIndex() >= 0, `${smokeName}: c3 decoy buffed. ${trioOmegaFailureSnapshot(ctx)}`, 9000);
  clickSmokeElement(fieldSlot(ctx.els, "player", c3DecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'), `${smokeName}: c3 select decoy`);
  clickSmokeElement(ctx.els.fieldModeBtn, `${smokeName}: c3 decoy attack mode`);
  await waitForSmoke(() => ctx.state.player.field[c3DecoyIndex()]?.mode === "attack", `${smokeName}: c3 decoy attack ready`);
  clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c3 pawn attacks guardian`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "temple-revenant")?.classList.contains("attack-target") || ctx.state.gameOver, `${smokeName}: c3 guardian target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "temple-revenant"), `${smokeName}: c3 break guardian`);
  await waitForSmoke(() => !ctx.state.ai.field.some((card) => card?.id === "temple-revenant"), `${smokeName}: c3 guardian destroyed`);
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: c3 final sun stands. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  clickSmokeElement(fieldSlot(ctx.els, "player", c3DecoyIndex()).querySelector('[data-card-id="trio-decoy-ward"]'), `${smokeName}: c3 decoy attacks final sun`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-sun-judicator")?.classList.contains("attack-target") || ctx.state.gameOver, `${smokeName}: c3 final sun target`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-sun-judicator"), `${smokeName}: c3 break final sun`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator"),
    `${smokeName}: c3 final sun destroyed. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );
  await finishPlayerTurn(ctx);
  for (let guard = 0; guard < 7 && !ctx.state.gameOver; guard += 1) {
    if (ctx.state.turn !== "player" || ctx.state.phase !== "main") {
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: c3 wait player turn ${guard}`,
        32000
      );
      continue;
    }
    if (c3PawnPressed() && handCard(ctx.els, "trio-moonbreaker-ray")) {
      clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: c3 clear late dominion ${guard}`);
      await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: c3 late moonbreaker target`);
      await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: c3 clear late dominion`);
      await waitForSmoke(() => !c3PawnPressed(), `${smokeName}: c3 pawn unpressed ${guard}`, 9000);
    }
    const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
    clickSmokeElement(fieldCard(ctx.els, "player", "trio-ember-pawn"), `${smokeName}: c3 pawn direct ${guard}`);
    await waitForSmoke(
      () => ctx.els.aiField?.querySelector(".attack-target") ||
        ctx.els.aiPanel?.classList.contains("direct-target") ||
        ctx.state.gameOver,
      `${smokeName}: c3 direct target ${guard}`,
      8000
    );
    const target = ctx.els.aiField?.querySelector(".attack-target");
    if (target) {
      clickSmokeElement(target, `${smokeName}: c3 attack target ${guard}`);
    } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
      clickSmokeElement(ctx.els.aiPanel, `${smokeName}: c3 direct attack ${guard}`);
    }
    await waitForSmoke(
      () => ctx.state.gameOver ||
        countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
        !ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
      `${smokeName}: c3 attack resolves ${guard}`,
      15000
    );
    if (!ctx.state.gameOver) {
      await finishPlayerTurn(ctx);
      await waitForSmoke(
        () => (ctx.state.turn === "player" && ctx.state.phase === "main") || ctx.state.gameOver,
        `${smokeName}: c3 rival turn ${guard}`,
        32000
      );
    }
  }

  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`${smokeName}: gauntlet final chapter did not win. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => ctx.state.gauntlet?.completed === true, `${smokeName}: gauntlet completed`, 8000);
  await waitForSmoke(() => storyLog().includes("连战完成"), `${smokeName}: gauntlet complete log`, 8000);
  setSmokeStatus("passed", "trio-gauntlet-demo");
}

async function runTrioOmegaCasualFailureLine(ctx, smokeName, { continueAfterRival = false } = {}) {
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaChallenge");
  assertTrioOmegaInitial(ctx, smokeName);

  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: click available revive spell`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive" && graveTargetCard(ctx.els, "flare-titan"),
    `${smokeName}: grave revive target selection opens`
  );
  clickSmokeElement(graveTargetCard(ctx.els, "flare-titan"), `${smokeName}: pick strongest grave monster`);
  await waitForSmoke(
    () => !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: strongest grave monster selected`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm wrong grave revive`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-titan") &&
      !ctx.state.player.hand.some((card) => card?.id === "trio-ember-recall"),
    `${smokeName}: wrong revive consumed recall. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: click final counter too early`);
  await waitForSmoke(
    () => ctx.state.player.hand.some((card) => card?.id === "trio-final-counter") &&
      ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      (ctx.els.toast?.textContent || "").includes("余烁小卫"),
    `${smokeName}: final counter explains the missing pawn while moon dominion blocks`,
    6000
  );

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: set visible trap`);
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `${smokeName}: trap slot`);
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"), `${smokeName}: trap set`);

  clickSmokeElement(fieldCard(ctx.els, "player", "flare-titan"), `${smokeName}: select strongest revived monster`);
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "trio-sun-judicator")?.classList.contains("attack-target"), `${smokeName}: highest enemy target highlighted`);
  clickSmokeElement(fieldCard(ctx.els, "ai", "trio-sun-judicator"), `${smokeName}: attack highest ace`);
  await waitForSmoke(
    () => ctx.state.gameOver || !ctx.state.player.field.some((card) => card?.id === "flare-titan") || ctx.state.player.lp < 1300,
    `${smokeName}: high-attack route is punished. ${trioOmegaFailureSnapshot(ctx)}`,
    12000
  );

  if (!ctx.state.gameOver) {
    await finishPlayerTurn(ctx);
    await waitForSmoke(
      () => ctx.state.gameOver ||
        ctx.els.chainModal.classList.contains("show") ||
        (ctx.state.turn === "player" && ctx.state.phase === "main"),
      `${smokeName}: rival response after rough attack. ${trioOmegaFailureSnapshot(ctx)}`,
      32000
    );
    if (ctx.els.chainModal.classList.contains("show")) {
      clickSmokeElement(ctx.els.chainYes, `${smokeName}: confirm obvious trap response`);
      await waitForSmoke(
        () => ctx.state.gameOver || (ctx.state.turn === "player" && ctx.state.phase === "main"),
        `${smokeName}: return or lose after trap response. ${trioOmegaFailureSnapshot(ctx)}`,
        32000
      );
    }
  }

  if (continueAfterRival && !ctx.state.gameOver && ctx.state.turn === "player") {
    if (handCard(ctx.els, "trio-moonbreaker-ray")) {
      clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}: click newly drawn moonbreaker`);
      await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}: moonbreaker target`);
      await selectAndConfirmSpellTarget(ctx, ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: click obvious trap target`);
      await waitForSmoke(
        () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
        `${smokeName}: moon dominion cleared late. ${trioOmegaFailureSnapshot(ctx)}`,
        9000
      );
    }
    if (handCard(ctx.els, "trio-final-counter")) {
      clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: click final counter after late clear`);
      await waitForSmoke(
        () => ctx.state.player.hand.some((card) => card?.id === "trio-final-counter"),
        `${smokeName}: final counter still cannot resolve without pawn. ${trioOmegaFailureSnapshot(ctx)}`,
        6000
      );
    }
    const attackerId = strongestCardId(ctx.state.player.field.filter((card) => card && !card.used && (card.mode || "attack") !== "defense"));
    const targetId = strongestCardId(ctx.state.ai.field);
    if (attackerId && targetId && fieldCard(ctx.els, "player", attackerId)) {
      clickSmokeElement(fieldCard(ctx.els, "player", attackerId), `${smokeName}: click remaining attacker`);
      await waitForSmoke(
        () => fieldCard(ctx.els, "ai", targetId)?.classList.contains("attack-target") || ctx.state.gameOver,
        `${smokeName}: remaining attack target. ${trioOmegaFailureSnapshot(ctx)}`,
        9000
      );
      if (!ctx.state.gameOver && fieldCard(ctx.els, "ai", targetId)?.classList.contains("attack-target")) {
        clickSmokeElement(fieldCard(ctx.els, "ai", targetId), `${smokeName}: attack highest remaining target`);
        await waitForSmoke(
          () => ctx.state.gameOver || ctx.state.phase === "battle",
          `${smokeName}: remaining rough attack resolves. ${trioOmegaFailureSnapshot(ctx)}`,
          12000
        );
      }
    }
  }

  if (ctx.state.gameOverWinner === "player") {
    throw new Error(`${smokeName}: casual click route should not win. ${trioOmegaFailureSnapshot(ctx)}`);
  }
  if (!ctx.state.player.grave.some((card) => card?.id === "trio-ember-recall") ||
      !ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn")) {
    throw new Error(`${smokeName}: failure route should spend recall while leaving the real pawn unavailable. ${trioOmegaFailureSnapshot(ctx)}`);
  }
}

async function runTrioOmegaAutopilotFailsSmoke(ctx) {
  await runTrioOmegaCasualFailureLine(ctx, "trio-omega-autopilot-fails");
  setSmokeStatus("passed", "trio-omega-autopilot-fails");
}

async function runTrioOmegaHappyClickerFailsSmoke(ctx) {
  await runTrioOmegaCasualFailureLine(ctx, "trio-omega-happy-clicker-fails", { continueAfterRival: true });
  setSmokeStatus("passed", "trio-omega-happy-clicker-fails");
}

async function runTrioOmegaFullDuelSmoke(ctx) {
  setSmokeStatus("running", "trio-omega-full-duel");
  await startSmokeDuel(ctx, "protagonistTrioOmegaFull");

  if (ctx.state.player.lp !== 4000 || ctx.state.ai.lp !== 4000) {
    throw new Error(`trio-omega-full-duel: full duel should start at 4000 LP. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.aiStyle !== "scriptedPressure") {
    throw new Error(`trio-omega-full-duel: scenario-aware AI style not applied. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.player.deck.length < 20 || ctx.state.ai.deck.length < 20) {
    throw new Error(`trio-omega-full-duel: decks should remain long after opening draw. ${smokeDebug(ctx)}`);
  }
  if (!ctx.state.player.hand.some((card) => card?.id === "trio-moonbreaker-ray") ||
      ctx.state.player.hand.some((card) => card?.id === "trio-final-counter") ||
      ctx.state.player.hand.some((card) => card?.id === "trio-ember-pawn")) {
    throw new Error(`trio-omega-full-duel: first turn draw should not expose the whole answer. ${smokeDebug(ctx)}`);
  }
  if (!ctx.els.duelHint.textContent.includes("展开阶段")) {
    throw new Error(`trio-omega-full-duel: opening guidance should prioritize setup. ${ctx.els.duelHint.textContent}`);
  }

  await clickSmokeElementTwiceAcrossRender(
    () => handCard(ctx.els, "seer-call"),
    "full duel: use seer call before committing to battle"
  );
  await waitForSmoke(
    () => handCard(ctx.els, "trio-ember-pawn") && handCard(ctx.els, "trio-final-counter"),
    `full duel: seer call should expose later low-star resources. ${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "spark-runner"), "full duel: summon spark-runner");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "full duel: player monster slot 1");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.hand.some((card) => card?.id === "battle-trance") &&
      Boolean(handCard(ctx.els, "battle-trance")),
    `full duel: spark-runner should draw the battle setup card. ${smokeDebug(ctx)}`,
    9000
  );
  if (ctx.state.log.some((entry) => entry.includes("星火信使 因 星火信使 特殊登场"))) {
    throw new Error("trio-omega-full-duel: normal summon should not be described as self-triggered special summon.");
  }

  clickSmokeElement(handCard(ctx.els, "battle-trance"), "full duel: select battle trance");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "battleTrance" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget) &&
      !ctx.els.choiceConfirmBtn.disabled,
    `full duel: battle trance should select the only allied monster. ${smokeDebug(ctx)}`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "full duel: confirm battle trance");
  await waitForSmoke(
    () => (ctx.state.player.field[0]?.tempAtk || 0) === 200,
    `full duel: spark-runner should be strong enough to remove one tribute body. ${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "full duel: select spark-runner attacker");
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"),
    `full duel: iron guardian should be a legal attack target. ${smokeDebug(ctx)}`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "full duel: destroy one tribute body");
  await waitForSmoke(
    () => ctx.state.phase === "battle" &&
      !ctx.state.ai.field.some((card) => card?.id === "iron-guardian") &&
      ctx.state.ai.field.filter(Boolean).length === 3,
    `full duel: one opening body should be destroyed while three tributes remain. ${smokeDebug(ctx)}`,
    12000
  );

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), "full duel: select solar snare");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "full duel: set solar snare");
  await waitForSmoke(
    () => ctx.state.player.traps.some((card) => card?.id === "trio-solar-snare"),
    `full duel: solar snare set before rival pressure. ${smokeDebug(ctx)}`,
    9000
  );
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "ai" && ctx.state.actionWindow === "ai" && ctx.state.aiRunning,
    `full duel: AI action loop should start. ${smokeDebug(ctx)}`,
    6000
  );
  // Let the production-timed AI sequence reach the player response before virtual-time polling resumes.
  await new Promise((resolve) => window.setTimeout(resolve, 11000));
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.ai.traps.some((card) => card?.id === "mirror-snare") &&
      ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier") &&
      ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden" && card.used) &&
      ctx.state.ai.field.some((card) => card?.id === "trio-star-herald" && card.used) &&
      ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) < 0),
    `full duel: rival should establish all three gods, set chain protection, and attack with sun. ${smokeDebug(ctx)}`,
    32000
  );
  const moonPressureCard = fieldCard(ctx.els, "player", "spark-runner");
  if (!moonPressureCard?.textContent.includes("月幕 攻守-900")) {
    throw new Error(`trio-omega-full-duel: lunar dominion target marker is missing. ${smokeDebug(ctx)}`);
  }
  for (const cardId of ["trio-moon-warden", "trio-star-herald"]) {
    const convergedCard = fieldCard(ctx.els, "ai", cardId);
    if (!convergedCard?.textContent.includes("本回合禁攻")) {
      throw new Error(`trio-omega-full-duel: ${cardId} should explain its convergence attack lock.`);
    }
    if (convergedCard.textContent.includes("祭品 3")) {
      throw new Error(`trio-omega-full-duel: ${cardId} should not show its hand summon cost on the field.`);
    }
  }
  clickSmokeElement(trapCard(ctx.els, "ai", "trio-moon-dominion"), "full duel: inspect public moon dominion on field");
  await waitForSmoke(
    () => document.querySelector("#detailName")?.textContent === "月曜帷幕" &&
      document.querySelector("#detailEffect")?.textContent.includes("持续"),
    "full duel: public moon dominion opens its real detail instead of concealed trap detail",
    6000
  );
  await waitForSmoke(
    () => logCardLink(ctx.els, "trio-moon-warden") && logCardLink(ctx.els, "trio-star-herald"),
    `full duel: trio convergence log should expose public card detail links. ${smokeDebug(ctx)}`,
    9000
  );
  clickSmokeElement(logCardLink(ctx.els, "trio-star-herald"), "full duel: inspect converged star god from public log");
  await assertCardDetailModal(ctx, cloneCardById("trio-star-herald"), "full duel: convergence log detail");
  clickSmokeElement(ctx.els.zoomClose, "full duel: close convergence card detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "full duel: convergence card detail closes");
  clickSmokeElement(ctx.els.chainYes, "full duel: activate prepared solar snare");
  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      !ctx.state.aiRunning &&
      ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.ai.field.some((card) => card?.id === "trio-moon-warden") &&
      ctx.state.ai.field.some((card) => card?.id === "trio-star-herald") &&
      ctx.state.ai.grave.some((card) => card?.id === "chain-nullifier") &&
      ctx.state.player.grave.some((card) => card?.id === "trio-solar-snare") &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.lp > 0,
    `full duel: chain protection should preserve sun while the player survives the first god attack. ${smokeDebug(ctx)}`,
    42000
  );
  await waitForSmoke(
    () => (ctx.state.log || []).some((entry) => logEntryMessage(entry).includes("断链裁决 无效了 日冕诱锁")) &&
      (ctx.state.log || []).some((entry) =>
        logEntryMessage(entry).includes("日冕诱锁的效果被连锁无效；已发动陷阱仍送入墓地")
      ),
    `full duel: the public log should explain why solar snare failed. ${smokeDebug(ctx)}`,
    9000
  );
  const convergenceLockLog = (ctx.state.log || []).find((entry) => {
    const message = logEntryMessage(entry);
    return message.includes("月蚀守密者") &&
      message.includes("星坠宣告者") &&
      message.includes("三曜共降限制") &&
      message.includes("下一个回合开始时解除");
  });
  if (!convergenceLockLog ||
      convergenceLockLog.cardId !== "trio-moon-warden" ||
      !convergenceLockLog.relatedCardIds?.includes("trio-star-herald") ||
      !logCardLink(ctx.els, "trio-moon-warden") ||
      !logCardLink(ctx.els, "trio-star-herald")) {
    throw new Error(`trio-omega-full-duel: the public log should explain why only sun attacks this turn and keep both locked gods inspectable. ${smokeDebug(ctx)}`);
  }
  const remainingTrio = ctx.state.ai.field.filter((card) =>
    card?.id === "trio-sun-judicator" || card?.id === "trio-moon-warden" || card?.id === "trio-star-herald"
  );
  const pressureAudit = auditLogEntries(ctx.state.timeline);
  if (remainingTrio.length !== 3 ||
      pressureAudit.issues.some((issue) => issue.code === "duplicate-log")) {
    throw new Error(`trio-omega-full-duel: chain-protected pressure should leave all three gods and clean logs. ${smokeDebug(ctx)}`);
  }
  const aiSunTributes = (ctx.state.gameEvents || []).filter((event) =>
    event.type === "CARD_TRIBUTED" &&
    event.playerId === "ai" &&
    eventReferencesTemplate(event, "trio-sun-judicator")
  );
  if (aiSunTributes.length !== 3) {
    throw new Error(`trio-omega-full-duel: AI sun god should consume exactly three public tributes. ${smokeDebug(ctx)}`);
  }
  if (!(ctx.state.gameEvents || []).some((event) => event.type === "TURN_STARTED" && event.playerId === "ai")) {
    throw new Error(`trio-omega-full-duel: route must cross a rival turn. ${smokeDebug(ctx)}`);
  }
  const events = ctx.state.gameEvents || [];
  const snareSetIndex = events.findIndex((event) => event.type === "TRAP_SET" && eventReferencesTemplate(event, "trio-solar-snare"));
  const openingBodyDestroyedIndex = events.findIndex((event) => event.type === "CARD_DESTROYED" && eventReferencesTemplate(event, "iron-guardian"));
  const convergenceIndex = events.findIndex((event) => event.type === "TRIO_CONVERGENCE_RESOLVED");
  const snareNegatedIndex = events.findIndex((event) =>
    event.type === "EFFECT_NEGATED" &&
    (String(event.targetEffectId || "").startsWith("trio-solar-snare-") || event.targetEffectId === "trio-solar-snare")
  );
  if (openingBodyDestroyedIndex < 0 || snareSetIndex < 0 || convergenceIndex < 0 || snareNegatedIndex < 0 ||
      !(openingBodyDestroyedIndex < snareSetIndex && snareSetIndex < convergenceIndex && convergenceIndex < snareNegatedIndex)) {
    throw new Error(`trio-omega-full-duel: opening disruption, resilient convergence, and chain protection must resolve in order. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.gameOver || ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator")) {
    throw new Error(`trio-omega-full-duel: one destroyed tribute body and one exposed trap must not collapse the boss opening. ${smokeDebug(ctx)}`);
  }

  setSmokeStatus("passed", "trio-omega-full-duel");
}

function finaleAutopilotSignature(state) {
  return JSON.stringify([
    state.turn,
    state.phase,
    state.actionWindow,
    state.player.lp,
    state.ai.lp,
    (state.player.hand || []).length,
    (state.ai.hand || []).length,
    (state.player.field || []).map((card) => card?.id || null),
    (state.ai.field || []).map((card) => card?.id || null),
    state.pendingTarget?.effect || null,
    state.pendingTribute?.cost || null,
    state.pendingFusion ? 1 : 0,
    state.chainOpen ? 1 : 0
  ]);
}

function emptyPlayerFieldSlotEl(els) {
  for (let index = 0; index < 5; index += 1) {
    const slot = fieldSlot(els, "player", index);
    if (slot && !slot.querySelector(".card") && !slot.disabled) return slot;
  }
  return null;
}

function emptyPlayerTrapSlotEl(els) {
  for (let index = 0; index < 5; index += 1) {
    const slot = trapSlot(els, "player", index);
    if (slot && !slot.querySelector(".card") && !slot.disabled) return slot;
  }
  return null;
}

function pickSpellTargetElement(els) {
  const roots = [els.playerField, els.aiField, els.playerTraps, els.aiTraps, els.graveTargets];
  for (const root of roots) {
    if (!root) continue;
    const candidate = root.querySelector('.targetable, [data-target-state="legal"]');
    if (candidate) return candidate;
  }
  return null;
}

async function respondToOpenChain(ctx, smokeName) {
  if (!ctx.els.chainModal?.classList.contains("show")) return false;
  const button = ctx.els.chainYes && !ctx.els.chainYes.disabled ? ctx.els.chainYes : ctx.els.chainNo;
  if (!button) return false;
  clickSmokeElement(button, `${smokeName}: respond to chain`);
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show") || ctx.state.gameOver,
    `${smokeName}: chain closes`,
    10000
  );
  return true;
}

async function resolveAutopilotTribute(ctx, smokeName) {
  if (!ctx.state.pendingTribute) return false;
  if (ctx.els.choiceConfirmBtn?.disabled) {
    throw new Error(`${smokeName}: tribute window stuck with confirm disabled. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm tributes`);
  await waitForSmoke(() => !ctx.state.pendingTribute, `${smokeName}: tribute summon resolves`, 10000);
  return true;
}

async function resolveAutopilotTarget(ctx, smokeName) {
  if (!ctx.state.pendingTarget) return false;
  if (!ctx.els.choiceConfirmBtn?.disabled) {
    clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm selected target`);
    await waitForSmoke(() => !ctx.state.pendingTarget, `${smokeName}: target selection closes`, 10000);
    return true;
  }
  const target = pickSpellTargetElement(ctx.els);
  if (!target) {
    throw new Error(`${smokeName}: target window without a selectable target. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(target, `${smokeName}: pick spell target`);
  await waitForSmoke(() => !ctx.els.choiceConfirmBtn?.disabled, `${smokeName}: target ready`, 10000);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm spell target`);
  await waitForSmoke(() => !ctx.state.pendingTarget, `${smokeName}: spell resolves`, 10000);
  return true;
}

async function autopilotPlayHandCard(ctx, smokeName) {
  const hand = ctx.state.player.hand || [];
  const actions = ctx.currentPlayerActions();
  for (const card of hand) {
    if (!card) continue;
    const cardEl = handCard(ctx.els, card.id);
    if (!cardEl || !cardEl.classList.contains("action-ready") || cardEl.classList.contains("action-blocked")) continue;
    if (card.type === "monster" && !actions.summon) continue;
    if (card.type === "spell" && !actions.spell) continue;
    if (card.type === "trap" && !actions.trap) continue;
    if (card.type === "monster") {
      const slot = emptyPlayerFieldSlotEl(ctx.els);
      if (!slot) continue;
      clickSmokeElement(cardEl, `${smokeName}: select ${card.id}`);
      if (ctx.state.pendingTribute || ctx.state.pendingFusion) return true;
      let summoned = false;
      for (let attempt = 0; attempt < 3 && !summoned; attempt += 1) {
        clickSmokeElement(slot, `${smokeName}: place ${card.id} (attempt ${attempt + 1})`);
        try {
          await waitForSmoke(
            () => ctx.state.player.field.some((entry) => entry?.id === card.id),
            `${smokeName}: ${card.id} summoned`,
            4000
          );
          summoned = true;
        } catch (error) {
          // The drop may have raced the selection render; retry the same slot.
        }
      }
      if (!summoned) {
        throw new Error(`${smokeName}: could not summon ${card.id}. ${smokeDebug(ctx)}`);
      }
      return true;
    }
    if (card.type === "spell") {
      clickSmokeElement(cardEl, `${smokeName}: play spell ${card.id}`);
      await waitForSmoke(
        () => !ctx.els.choiceActions.hidden || ctx.state.pendingTarget || ctx.state.pendingFusion || ctx.state.gameOver,
        `${smokeName}: spell ${card.id} registers`,
        8000
      );
      if (!ctx.state.pendingTarget && !ctx.state.pendingFusion &&
          !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled) {
        clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm spell ${card.id}`);
        await waitForSmoke(
          () => ctx.els.choiceActions.hidden || ctx.state.pendingTarget || ctx.state.gameOver,
          `${smokeName}: spell ${card.id} confirms`,
          8000
        );
      }
      return true;
    }
    if (card.type === "trap") {
      const slot = emptyPlayerTrapSlotEl(ctx.els);
      if (!slot) continue;
      clickSmokeElement(cardEl, `${smokeName}: set trap ${card.id}`);
      clickSmokeElement(slot, `${smokeName}: trap ${card.id} slot`);
      await waitForSmoke(
        () => ctx.state.player.traps.some((entry) => entry?.id === card.id),
        `${smokeName}: trap ${card.id} set :: ${smokeDebug(ctx)}`,
        8000
      );
      return true;
    }
  }
  return false;
}

async function autopilotAttack(ctx, smokeName) {
  if (!ctx.currentPlayerActions().attack) return false;
  const attacker = (ctx.state.player.field || []).find((card) =>
    card && !card.used && (card.mode || "attack") !== "defense"
  );
  if (!attacker) return false;
  const attackerEl = fieldCard(ctx.els, "player", attacker.id);
  if (!attackerEl) return false;
  const battlesBefore = countGameEvents(ctx.state, "BATTLE_RESOLVED");
  const cancelsBefore = countGameEvents(ctx.state, "ATTACK_CANCELED");
  clickSmokeElement(attackerEl, `${smokeName}: select attacker ${attacker.id}`);
  await waitForSmoke(
    () => ctx.els.aiField?.querySelector(".attack-target") ||
      ctx.els.aiPanel?.classList.contains("direct-target") ||
      ctx.state.gameOver,
    `${smokeName}: attack targets for ${attacker.id}`,
    8000
  );
  const target = ctx.els.aiField?.querySelector(".attack-target");
  if (target) {
    clickSmokeElement(target, `${smokeName}: attack ${target.dataset.cardId || "target"}`);
  } else if (ctx.els.aiPanel?.classList.contains("direct-target")) {
    clickSmokeElement(ctx.els.aiPanel, `${smokeName}: direct attack`);
  } else {
    return false;
  }
  await waitForSmoke(
    () => ctx.state.gameOver ||
      countGameEvents(ctx.state, "BATTLE_RESOLVED") > battlesBefore ||
      countGameEvents(ctx.state, "ATTACK_CANCELED") > cancelsBefore ||
      !ctx.state.player.field.some((card) => card?.id === attacker.id) ||
      ctx.els.chainModal?.classList.contains("show"),
    `${smokeName}: attack resolves`,
    15000
  );
  return true;
}

async function runFinaleAutopilotSmoke(ctx) {
  const smokeName = "finale-autopilot";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFull");
  const startedAt = Date.now();
  let idle = 0;
  let lastSignature = finaleAutopilotSignature(ctx.state);
  let steps = 0;
  let playerTurns = 0;

  while (!ctx.state.gameOver) {
    steps += 1;
    if (steps > 500) throw new Error(`${smokeName}: step limit. ${smokeDebug(ctx)}`);
    if (Date.now() - startedAt > 50000) throw new Error(`${smokeName}: time limit. ${smokeDebug(ctx)}`);
    if (await respondToOpenChain(ctx, smokeName)) continue;
    if (ctx.state.turn !== "player") {
      await waitForSmoke(
        () => ctx.state.turn === "player" || ctx.state.gameOver || ctx.els.chainModal?.classList.contains("show"),
        `${smokeName}: rival turn resolves :: ${smokeDebug(ctx)}`,
        25000
      );
      continue;
    }
    if (ctx.state.phase === "draw") {
      await waitForSmoke(
        () => ctx.state.phase === "main" || ctx.state.gameOver,
        `${smokeName}: player turn draw resolves`,
        10000
      );
      continue;
    }
    if (await resolveAutopilotTribute(ctx, smokeName)) continue;
    if (await resolveAutopilotTarget(ctx, smokeName)) continue;
    if (await autopilotPlayHandCard(ctx, smokeName)) continue;
    if (await autopilotAttack(ctx, smokeName)) continue;
    const signature = finaleAutopilotSignature(ctx.state);
    if (signature === lastSignature) {
      idle += 1;
      if (idle >= 8) {
        throw new Error(`${smokeName}: player state stalled. ${smokeDebug(ctx)}`);
      }
    } else {
      idle = 0;
      lastSignature = signature;
    }
    if (ctx.state.turn === "player" && (ctx.state.phase === "main" || ctx.state.phase === "battle")) {
      if (ctx.els.endTurnBtn?.disabled) {
        throw new Error(`${smokeName}: cannot end turn. ${smokeDebug(ctx)}`);
      }
      clickSmokeElement(ctx.els.endTurnBtn, `${smokeName}: end turn`);
      await waitForSmoke(
        () => ctx.state.turn === "ai" || ctx.state.gameOver,
        `${smokeName}: turn passes`,
        10000
      );
      playerTurns += 1;
      continue;
    }
    throw new Error(`${smokeName}: unhandled player state. ${smokeDebug(ctx)}`);
  }

  const winner = ctx.state.gameOverWinner || "none";
  const logTail = (ctx.state.log || []).slice(-5).map(logEntryMessage).join(" | ");
  setSmokeStatus(
    "passed",
    `finale-autopilot winner=${winner} playerTurns=${playerTurns} steps=${steps} playerLp=${ctx.state.player.lp} aiLp=${ctx.state.ai.lp} log=${logTail}`
  );
}

async function runHandSummonBlockProbeSmoke(ctx) {
  const smokeName = "hand-summon-block-probe";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFull");
  if (!ctx.currentPlayerActions().summon) {
    throw new Error(`${smokeName}: no summon available at start. ${smokeDebug(ctx)}`);
  }
  const monster = (ctx.state.player.hand || []).find((card) => card?.type === "monster");
  if (!monster) {
    throw new Error(`${smokeName}: no monster in opening hand. ${smokeDebug(ctx)}`);
  }
  const cardEl = handCard(ctx.els, monster.id);
  const slot = emptyPlayerFieldSlotEl(ctx.els);
  if (!cardEl || !slot) {
    throw new Error(`${smokeName}: monster or slot element missing. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(cardEl, `${smokeName}: select monster`);
  clickSmokeElement(slot, `${smokeName}: place monster`);
  await waitForSmoke(
    () => ctx.state.player.field.some((entry) => entry?.id === monster.id) && ctx.state.player.normalSummonsUsed >= 1,
    `${smokeName}: monster summoned`,
    8000
  );
  const readLeftovers = () => (ctx.state.player.hand || [])
    .filter((card) => card?.type === "monster")
    .map((card) => {
      const el = handCard(ctx.els, card.id);
      return {
        id: card.id,
        ready: Boolean(el?.classList.contains("action-ready")),
        blocked: Boolean(el?.classList.contains("action-blocked")),
        label: el?.querySelector(".action-tag")?.textContent || "",
        reason: el?.title || ""
      };
    });
  const immediate = readLeftovers();
  const staleReady = immediate.filter((entry) => entry.ready);
  if (staleReady.length > 0) {
    throw new Error(`${smokeName}: hand still marks monsters summonable after summon used: ${JSON.stringify(immediate)}`);
  }
  for (let settle = 0; settle < 6; settle += 1) {
    if (ctx.els.chainModal?.classList.contains("show")) {
      const button = ctx.els.chainYes && !ctx.els.chainYes.disabled ? ctx.els.chainYes : ctx.els.chainNo;
      if (button) clickSmokeElement(button, `${smokeName}: settle summon chain`);
    }
    await waitForSmoke(
      () => !ctx.els.chainModal?.classList.contains("show") || ctx.state.gameOver,
      `${smokeName}: summon chain settles`,
      6000
    );
  }
  const settled = readLeftovers();
  setSmokeStatus(
    "passed",
    JSON.stringify({
      normalSummonsUsed: ctx.state.player.normalSummonsUsed,
      extraSummon: ctx.state.player.extraSummon,
      immediate,
      settled
    })
  );
}

async function runSummonClickRaceProbeSmoke(ctx) {
  const smokeName = "summon-click-race-probe";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaFull");
  if (!ctx.currentPlayerActions().summon) {
    throw new Error(`${smokeName}: no summon available at start. ${smokeDebug(ctx)}`);
  }
  const monster = (ctx.state.player.hand || []).find((card) => card?.type === "monster");
  if (!monster) {
    throw new Error(`${smokeName}: no monster in opening hand. ${smokeDebug(ctx)}`);
  }
  const cardEl = handCard(ctx.els, monster.id);
  const slot = emptyPlayerFieldSlotEl(ctx.els);
  if (!cardEl || !slot) {
    throw new Error(`${smokeName}: monster or slot element missing. ${smokeDebug(ctx)}`);
  }
  let success = false;
  let failure = null;
  for (let attempt = 1; attempt <= 5 && !success; attempt += 1) {
    if (ctx.state.player.field.some((entry) => entry?.id === monster.id)) {
      success = true;
      break;
    }
    clickSmokeElement(cardEl, `${smokeName}: select ${monster.id} (attempt ${attempt})`);
    clickSmokeElement(slot, `${smokeName}: place ${monster.id} (attempt ${attempt})`);
    try {
      await waitForSmoke(
        () => ctx.state.player.field.some((entry) => entry?.id === monster.id) ||
          ctx.state.pendingTribute ||
          ctx.state.gameOver,
        `${smokeName}: summon registers`,
        2500
      );
      if (ctx.state.pendingTribute) {
        clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm tribute`);
        await waitForSmoke(
          () => ctx.state.player.field.some((entry) => entry?.id === monster.id),
          `${smokeName}: tribute summon registers`,
          4000
        );
      }
      success = true;
    } catch (error) {
      failure = {
        attempt,
        selected: ctx.state.selected,
        phase: ctx.state.phase,
        actionWindow: ctx.state.actionWindow,
        normalSummonsUsed: ctx.state.player.normalSummonsUsed
      };
    }
  }
  if (!success) {
    throw new Error(`${smokeName}: back-to-back summon click did not register. ${JSON.stringify(failure)} ${smokeDebug(ctx)}`);
  }
  setSmokeStatus(
    "passed",
    JSON.stringify({
      monster: monster.id,
      attempts: failure ? failure.attempt + 1 : 1,
      normalSummonsUsed: ctx.state.player.normalSummonsUsed
    })
  );
}

async function runRedirectPromptSmoke(ctx) {
  setSmokeStatus("running", "redirect-prompt");
  await startSmokeDuel(ctx, "redirect");
  clickSmokeElement(handCard(ctx.els, "phantom-switch"), "幻影换位手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "空陷阱区");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "phantom-switch"), "幻影换位盖放");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "换位陷阱连锁弹窗", 12000);
  const text = ctx.els.chainText.textContent;
  if (!text.includes("对手的") || !text.includes("正在攻击") || !text.includes("发动后会把攻击改为")) {
    throw new Error("换位陷阱提示缺少攻击目标信息");
  }
  if (!text.includes("疾风术士") || !text.includes("铁壁守卫")) {
    throw new Error("换位陷阱提示应该说明原目标和换位目标");
  }
  if (text.includes("低于当前目标")) {
    throw new Error("高防守卫换位场景不应显示低 DEF 风险");
  }
  const lpBeforeDecline = ctx.state.player.lp;
  clickSmokeElement(ctx.els.chainNo, "不发动陷阱");
  await waitForSmoke(
    () => !ctx.state.player.field.some((card) => card?.id === "gale-mage") &&
      ctx.state.player.field.some((card) => card?.id === "iron-guardian"),
    "拒绝换位后低防目标被击破且铁壁保留",
    12000
  );
  if (ctx.state.player.lp !== lpBeforeDecline) {
    throw new Error("拒绝换位后的守备战斗不应造成生命值伤害");
  }
  setSmokeStatus("passed", "redirect-prompt");
}

async function runPhantomSwitchRedirectSmoke(ctx) {
  setSmokeStatus("running", "phantom-switch-redirect");
  await startSmokeDuel(ctx, "phantomRedirect");

  const dusk = ctx.state.player.field[0];
  const iron = ctx.state.player.field[1];
  if (!dusk || dusk.id !== "dusk-alchemist" || !iron || iron.id !== "iron-guardian") {
    throw new Error(`幻影换位复现场景初始怪兽不正确：${phantomRedirectDiagnostics(ctx)}`);
  }
  dusk.tempAtk = 50;
  iron.tempDef = 100;
  ctx.state.player.shield = 550;
  ctx.render?.();
  await waitForSmoke(
    () => ctx.state.player.field[0]?.tempAtk === 50 &&
      ctx.state.player.field[1]?.tempDef === 100 &&
      ctx.state.player.shield === 550,
    "幻影换位复现场景数值校准"
  );

  const originalTargetCardId = ctx.state.player.field[0]?.uid;
  const redirectedTargetCardId = ctx.state.player.field[1]?.uid;
  clickSmokeElement(handCard(ctx.els, "phantom-switch"), "幻影换位手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放幻影换位");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "phantom-switch"), "幻影换位盖放成功");
  const trapCardId = ctx.state.player.traps.find((card) => card?.id === "phantom-switch")?.uid || null;

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "幻影换位攻击响应窗口", 24000);
  const promptText = ctx.els.chainText.textContent;
  const attackDeclared = (ctx.state.gameEvents || []).find((event) =>
    event.type === "ATTACK_DECLARED" &&
    event.targetCardId === originalTargetCardId
  );
  const pendingBeforeTrap = projectMachineStateFromEvents(ctx.state.gameEvents || [], ctx.state.phase).pendingAttack;
  if (!attackDeclared || pendingBeforeTrap?.targetCardId !== originalTargetCardId) {
    throw new Error(`幻影换位响应前攻击宣言或 pendingAttack 不正确：${phantomRedirectDiagnostics(ctx, { promptText, pendingBeforeTrap, trapCardId })}`);
  }
  if (!promptText.includes("幻影换位") || !promptText.includes("暮影炼术师") || !promptText.includes("铁壁守卫")) {
    throw new Error(`幻影换位响应提示缺少原目标或新目标：${phantomRedirectDiagnostics(ctx, { attackDeclared, pendingBeforeTrap, promptText, trapCardId })}`);
  }
  const playerShieldBeforeRedirect = ctx.state.player.shield;

  clickSmokeElement(ctx.els.chainYes, "确认发动幻影换位");
  await waitForSmoke(
    () => ctx.state.log.some((entry) => entry.includes("幻影换位") && entry.includes("铁壁守卫")),
    "幻影换位写入改目标日志",
    9000
  );
  const pendingAfterRedirect = projectMachineStateFromEvents(ctx.state.gameEvents || [], ctx.state.phase).pendingAttack;

  await waitForSmoke(
    () => (ctx.state.gameEvents || []).some((event) =>
      event.type === "BATTLE_RESOLVED" && String(event.declarationEventId) === String(attackDeclared.id)
    ),
    "幻影换位后战斗完成",
    24000
  );

  const battleResolved = (ctx.state.gameEvents || []).find((event) =>
    event.type === "BATTLE_RESOLVED" && String(event.declarationEventId) === String(attackDeclared.id)
  );
  const targetChanged = (ctx.state.gameEvents || []).some((event) =>
    event.type === "ATTACK_TARGET_CHANGED" &&
    String(event.declarationEventId) === String(attackDeclared.id) &&
    event.targetCardId === redirectedTargetCardId
  );
  const oldTargetDamage = (ctx.state.gameEvents || []).some((event) =>
    event.type === "DAMAGE_DEALT" &&
    event.playerId === "player" &&
    event.requested === 550 &&
    event.blocked === 550
  );
  const duskStillOnField = ctx.state.player.field.some((card) => card?.uid === originalTargetCardId);
  const ironStillOnField = ctx.state.player.field.some((card) => card?.uid === redirectedTargetCardId);
  const finalLogUsesIron = ctx.state.log.some((entry) =>
    entry.includes("天岚突袭者") && entry.includes("铁壁守卫")
  );
  const diagnostics = phantomRedirectDiagnostics(ctx, {
    attackDeclared,
    pendingBeforeTrap,
    pendingAfterRedirect,
    promptText,
    trapCardId,
    playerShieldBeforeRedirect
  });
  if (!targetChanged ||
      battleResolved?.targetCardId !== redirectedTargetCardId ||
      oldTargetDamage ||
      !duskStillOnField ||
      !ironStillOnField ||
      ctx.state.player.shield !== playerShieldBeforeRedirect ||
      !finalLogUsesIron) {
    throw new Error(`幻影换位重定向后仍未按新目标结算：${diagnostics}`);
  }

  setSmokeStatus("passed", "phantom-switch-redirect");
}

async function runSpellTargetDefaultBasicSmoke(ctx) {
  setSmokeStatus("running", "spell-target-default-basic");
  await startSmokeDuel(ctx, "divineGuard");
  const target = ctx.state.player.field[0];
  const spell = ctx.state.player.hand.find((card) => card?.id === "war-chant");
  if (!target || target.id !== "celestial-origin-dragon" || !spell) {
    throw new Error("spell-target-default-basic: fixture should contain one monster and war-chant");
  }
  const tempAtkBefore = target.tempAtk || 0;
  const activationsBefore = countGameEvents(ctx.state, "CARD_ACTIVATED");

  clickSmokeElement(handCard(ctx.els, "war-chant"), "spell-target-default-basic: select war-chant");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" &&
      ctx.state.pendingTarget?.selectedTarget?.cardUid === target.uid &&
      ctx.state.pendingTarget?.selectedTargetSource === "default" &&
      fieldCard(ctx.els, "player", "celestial-origin-dragon")?.classList.contains("target-selected") &&
      ctx.els.choiceText?.textContent.includes("已默认选择：创星神龙") &&
      ctx.els.choiceConfirmBtn?.textContent.includes("确认发动"),
    "spell-target-default-basic: only legal target is visibly selected"
  );
  if (!ctx.state.player.hand.some((card) => card?.uid === spell.uid) ||
      countGameEvents(ctx.state, "CARD_ACTIVATED") !== activationsBefore) {
    throw new Error("spell-target-default-basic: opening target selection must not activate the spell");
  }

  confirmSpellTarget(ctx, "spell-target-default-basic: confirm default target");
  await waitForSmoke(
    () => !ctx.state.pendingTarget &&
      !ctx.state.player.hand.some((card) => card?.uid === spell.uid) &&
      (ctx.state.player.field[0]?.tempAtk || 0) === tempAtkBefore + 500 &&
      countGameEvents(ctx.state, "CARD_ACTIVATED") === activationsBefore + 1,
    "spell-target-default-basic: selected target resolves only after confirmation",
    9000
  );
  await waitForSmoke(() => logCardLink(ctx.els, "war-chant"), "spell-target-default-basic: public spell log link");
  clickSmokeElement(logCardLink(ctx.els, "war-chant"), "spell-target-default-basic: open spell detail from log");
  await assertCardDetailModal(ctx, cloneCardById("war-chant"), "spell-target-default-basic");
  setSmokeStatus("passed", "spell-target-default-basic");
}

async function runSpellMultiTargetChoiceBasicSmoke(ctx) {
  const smokeName = "spell-multi-target-choice-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "equipment");

  clickSmokeElement(handCard(ctx.els, "nova-squire"), `${smokeName}: select second monster`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}: choose second monster zone`);
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: summon confirmation enabled`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm second monster summon`);
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "star-lancer" &&
      ctx.state.player.field[1]?.id === "nova-squire" &&
      ctx.state.actionWindow === "main",
    `${smokeName}: two legal equipment targets are on field`,
    9000
  );

  const spell = ctx.state.player.hand.find((card) => card?.id === "blade-sigil");
  const firstTargetAtkBefore = ctx.state.player.field[0]?.tempAtk || 0;
  const secondTargetAtkBefore = ctx.state.player.field[1]?.tempAtk || 0;
  const activationsBefore = countGameEvents(ctx.state, "CARD_ACTIVATED");
  await clickSmokeElementTwiceAcrossRender(
    () => handCard(ctx.els, "blade-sigil"),
    `${smokeName}: repeat equipment spell with multiple targets`,
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      !ctx.state.pendingTarget?.selectedTarget &&
      !ctx.state.pendingTarget?.selectedTargetSource &&
      ctx.els.choiceConfirmBtn.disabled
  );
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      !ctx.state.pendingTarget?.selectedTarget &&
      ctx.els.choiceConfirmBtn.disabled &&
      ctx.state.player.hand.some((card) => card?.uid === spell?.uid) &&
      countGameEvents(ctx.state, "CARD_ACTIVATED") === activationsBefore,
    `${smokeName}: repeated hand activation must wait for an explicit target`
  );
  if (!ctx.els.choiceText?.textContent.includes("尚未选择目标") ||
      fieldCard(ctx.els, "player", "star-lancer")?.classList.contains("target-selected") ||
      fieldCard(ctx.els, "player", "nova-squire")?.classList.contains("target-selected")) {
    throw new Error(`${smokeName}: multiple legal targets must not expose a default selection. ${smokeDebug(ctx)}`);
  }

  await selectAndConfirmSpellTarget(
    ctx,
    fieldCard(ctx.els, "player", "nova-squire"),
    `${smokeName}: explicitly equip the second monster`
  );
  await waitForSmoke(
    () => !ctx.state.pendingTarget &&
      !ctx.state.player.hand.some((card) => card?.uid === spell?.uid),
    `${smokeName}: explicit target activation resolves`,
    9000
  );
  if (ctx.state.player.field[0]?.id !== "star-lancer" ||
      (ctx.state.player.field[0]?.tempAtk || 0) !== firstTargetAtkBefore ||
      ctx.state.player.field[1]?.id !== "nova-squire" ||
      (ctx.state.player.field[1]?.tempAtk || 0) !== secondTargetAtkBefore + 300 ||
      countGameEvents(ctx.state, "CARD_ACTIVATED") !== activationsBefore + 1) {
    throw new Error(`${smokeName}: explicit target receives the equipment effect: ${JSON.stringify({
      field: ctx.state.player.field.map((card) => card ? { id: card.id, tempAtk: card.tempAtk || 0 } : null),
      activationsBefore,
      activationsAfter: countGameEvents(ctx.state, "CARD_ACTIVATED")
    })}. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runSpellTargetLegalityAuditBasicSmoke(ctx) {
  const smokeName = "spell-target-legality-audit-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "equipment");

  assertHandCardReady(ctx.els, "blade-sigil", `${smokeName}: one-target spell readiness`);
  assertHandCardBlocked(ctx.els, "dispelling-ray", `${smokeName}: zero-target spell readiness`, "没有可指定的合法目标");
  clickSmokeElement(handCard(ctx.els, "blade-sigil"), `${smokeName}: open unique target selection`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      ctx.state.pendingTarget?.selectedTargetSource === "default" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget),
    `${smokeName}: unique target auto-selection`
  );
  assertHandCardReady(ctx.els, "nova-squire", `${smokeName}: legal switch remains ready`);
  assertHandCardBlocked(ctx.els, "dispelling-ray", `${smokeName}: illegal spell switch stays blocked`, "不能切换到这张卡");
  clickSmokeElement(ctx.els.choiceCancelBtn, `${smokeName}: cancel unique target selection`);
  await waitForSmoke(() => !ctx.state.pendingTarget, `${smokeName}: unique target selection canceled`);

  clickSmokeElement(handCard(ctx.els, "nova-squire"), `${smokeName}: select second monster`);
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}: choose second monster zone`);
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: summon confirmation enabled`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: summon second monster`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "nova-squire" && ctx.state.actionWindow === "main",
    `${smokeName}: second monster summoned`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "blade-sigil"), `${smokeName}: open multiple target selection`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      !ctx.state.pendingTarget?.selectedTarget &&
      ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: multiple targets require explicit choice`
  );
  assertHandCardReady(ctx.els, "aegis-plate", `${smokeName}: legal spell switch remains ready`);
  const blockedMonster = assertHandCardBlocked(
    ctx.els,
    "aegis-mender",
    `${smokeName}: spent normal summon blocks monster switch`,
    "本回合已经通常召唤过"
  );
  assertHandCardBlocked(ctx.els, "dispelling-ray", `${smokeName}: zero-target switch remains blocked`, "不能切换到这张卡");

  clickSmokeElement(blockedMonster, `${smokeName}: inspect blocked switch without canceling target selection`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      !ctx.state.pendingTarget?.selectedTarget &&
      ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: blocked switch preserves target selection`
  );
  setSmokeStatus("passed", smokeName);
}

async function runGraveCardTargetChoiceBasicSmoke(ctx) {
  const smokeName = "grave-card-target-choice-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "target");

  const spell = ctx.state.player.hand.find((card) => card?.id === "grave-return");
  const chosen = ctx.state.player.grave.find((card) => card?.id === "star-shield");
  const activationsBefore = countGameEvents(ctx.state, "CARD_ACTIVATED");
  if (!spell || !chosen || ctx.state.player.grave.length < 2) {
    throw new Error(`${smokeName}: fixture requires grave-return and two grave cards`);
  }

  await clickSmokeElementTwiceAcrossRender(
    () => handCard(ctx.els, "grave-return"),
    `${smokeName}: repeat grave-return with multiple targets`,
    () => ctx.state.pendingTarget?.effect === "graveReturn" &&
      ctx.state.pendingTarget?.mode === "ownGraveCard" &&
      !ctx.state.pendingTarget?.selectedTarget &&
      ctx.els.choiceConfirmBtn.disabled
  );
  await waitForSmoke(
    () => graveTargetCard(ctx.els, "gale-mage") &&
      graveTargetCard(ctx.els, "star-shield") &&
      ctx.state.player.hand.some((card) => card?.uid === spell.uid) &&
      countGameEvents(ctx.state, "CARD_ACTIVATED") === activationsBefore,
    `${smokeName}: every grave card is selectable without a default`
  );

  clickSmokeElement(graveTargetCard(ctx.els, "star-shield"), `${smokeName}: choose second grave card`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.selectedTarget?.cardUid === chosen.uid &&
      ctx.state.pendingTarget?.selectedTargetSource === "player" &&
      !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: explicit grave card selected`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm grave-return`);
  await waitForSmoke(
    () => !ctx.state.pendingTarget &&
      ctx.state.player.hand.some((card) => card?.uid === chosen.uid) &&
      !ctx.state.player.grave.some((card) => card?.uid === chosen.uid) &&
      ctx.state.player.grave.some((card) => card?.uid === spell.uid) &&
      countGameEvents(ctx.state, "CARD_ACTIVATED") === activationsBefore + 1,
    `${smokeName}: chosen grave card resolves through dispatch`,
    9000
  );
  setSmokeStatus("passed", smokeName);
}

async function runTargetWindowSmoke(ctx) {
  setSmokeStatus("running", "target-window");
  await startSmokeDuel(ctx, "target");
  assertHandCardReady(ctx.els, "renewal", "满 LP 回复卡遵循引擎合法性");
  clickSmokeElement(handCard(ctx.els, "renewal"), "引擎允许的星泉再生手牌");
  await waitForSmoke(
    () => ctx.els.choiceActions.hidden === false &&
      !ctx.els.choiceConfirmBtn.disabled &&
      !ctx.state.pendingTarget,
    "满 LP 回复卡与引擎一样显示可确认"
  );
  clickSmokeElement(ctx.els.choiceCancelBtn, "取消星泉再生选择");
  await waitForSmoke(
    () => ctx.els.choiceActions.hidden && ctx.state.player.hand.some((card) => card?.id === "renewal"),
    "取消星泉再生不会消耗卡牌"
  );
  clickSmokeElement(handCard(ctx.els, "war-chant"), "战意高扬手牌");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" && ctx.state.actionWindow === "targetSelect",
    "战意高扬目标选择窗口"
  );
  const starLancer = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  if (ctx.state.pendingTarget?.selectedTarget?.cardUid !== starLancer?.uid ||
      ctx.state.pendingTarget?.selectedTargetSource !== "default" ||
      !fieldCard(ctx.els, "player", "star-lancer")?.classList.contains("target-selected") ||
      !ctx.els.choiceText?.textContent.includes("已默认选择：星轨枪兵")) {
    throw new Error("战意高扬没有把唯一合法目标明确显示为默认选中");
  }
  assertPendingSelection(ctx, "target", "战意高扬目标选择窗口");
  if (ctx.state.timing !== "targetSelection") {
    throw new Error("目标选择没有进入 targetSelection 时点");
  }
  if (!ctx.state.actionDeadline || ctx.state.actionDeadline <= Date.now()) {
    throw new Error("目标选择窗口没有设置倒计时 deadline");
  }
  if (!ctx.els.timerText.textContent.includes("选目标")) {
    throw new Error("目标选择窗口没有显示倒计时提示");
  }
  clickSmokeElement(handCard(ctx.els, "pierce-line"), "切换到破阵星芒");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "pierceLine" && ctx.state.pendingTarget?.cardName === "破阵星芒",
    "点其它手牌会取消当前目标选择并切换"
  );
  const skyRaider = ctx.state.ai.field.find((card) => card?.id === "sky-raider");
  if (ctx.state.pendingTarget?.selectedTarget?.cardUid !== skyRaider?.uid ||
      !fieldCard(ctx.els, "ai", "sky-raider")?.classList.contains("target-selected") ||
      !ctx.els.choiceText?.textContent.includes("已默认选择：天岚突袭者")) {
    throw new Error("切换魔法后没有重新计算并显示敌方默认目标");
  }
  assertPendingSelection(ctx, "target", "切换到破阵星芒目标选择");
  if (!ctx.state.log.some((entry) => entry.includes("已取消 战意高扬 的目标选择"))) {
    throw new Error("切换手牌时没有记录取消原目标选择");
  }
  clickSmokeElement(handCard(ctx.els, "war-chant"), "切回战意高扬");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" && ctx.state.pendingTarget?.cardName === "战意高扬",
    "切回战意高扬目标选择"
  );
  assertPendingSelection(ctx, "target", "切回战意高扬目标选择");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认战意高扬推荐目标");
  await waitForSmoke(
    () => !ctx.state.pendingTarget && ctx.state.log.some((entry) => entry.includes("发动魔法卡 战意高扬")),
    "确认已选目标后发动战意高扬"
  );
  assertPendingSelection(ctx, "", "战意高扬结算后");
  if (countGameEvents(ctx.state, "STAT_MODIFIED") < 1 || countGameEvents(ctx.state, "CARD_ACTIVATED") < 1) {
    throw new Error("War chant must resolve through engine spell events");
  }
  setSmokeStatus("passed", "target-window");
}

async function runFieldTargetReadabilityBasicSmoke(ctx) {
  const smokeName = "field-target-readability-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "target");
  clickSmokeElement(handCard(ctx.els, "war-chant"), `${smokeName}: open strongest monster target selection`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" && ctx.state.actionWindow === "targetSelect",
    `${smokeName}: target selection is open`
  );

  const legalSlot = fieldSlot(ctx.els, "player", 0);
  const lowerAtkSlot = fieldSlot(ctx.els, "player", 1);
  const emptySlot = fieldSlot(ctx.els, "player", 2);
  const enemySlot = fieldSlot(ctx.els, "ai", 0);
  if (legalSlot?.dataset.effectTargetState !== "legal" ||
      !legalSlot.classList.contains("target-selected") ||
      lowerAtkSlot?.dataset.effectTargetState !== "unavailable" ||
      lowerAtkSlot.dataset.effectTargetLabel !== "不可选：非最高攻击" ||
      emptySlot?.dataset.effectTargetLabel !== "不可选：空格" ||
      enemySlot?.dataset.effectTargetLabel !== "不可选：非己方") {
    throw new Error(`${smokeName}: legal and unavailable targets are not clearly projected. ${smokeDebug(ctx)}`);
  }

  const rulesSnapshot = () => JSON.stringify({
    player: {
      hand: ctx.state.player.hand,
      field: ctx.state.player.field,
      traps: ctx.state.player.traps,
      grave: ctx.state.player.grave
    },
    ai: {
      hand: ctx.state.ai.hand,
      field: ctx.state.ai.field,
      traps: ctx.state.ai.traps,
      grave: ctx.state.ai.grave
    },
    pendingTarget: ctx.state.pendingTarget,
    selected: ctx.state.selected,
    actionWindow: ctx.state.actionWindow,
    actionDeadline: ctx.state.actionDeadline,
    gameEvents: ctx.state.gameEvents
  });
  const beforeInvalidClicks = rulesSnapshot();
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), `${smokeName}: click lower attack monster`);
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "战意高扬只能选择我方攻击力最高的怪兽：星轨枪兵。",
    `${smokeName}: lower attack target explains the strongest rule`
  );
  clickSmokeElement(fieldSlot(ctx.els, "player", 2), `${smokeName}: click empty monster slot`);
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：该格为空。",
    `${smokeName}: empty target explains the reason`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), `${smokeName}: click enemy monster`);
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：不是己方怪兽。",
    `${smokeName}: wrong owner target explains the reason`
  );
  if (rulesSnapshot() !== beforeInvalidClicks) {
    throw new Error(`${smokeName}: invalid field target changed rules state. ${smokeDebug(ctx)}`);
  }

  const targetUid = ctx.state.player.field[0]?.uid;
  const atkBefore = ctx.state.player.field[0]?.tempAtk || 0;
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm default legal target`);
  await waitForSmoke(
    () => !ctx.state.pendingTarget,
    `${smokeName}: legal target selection closes after confirmation`,
    9000
  );
  const targetBuffEvent = ctx.state.gameEvents.find((event) =>
    event.type === "STAT_MODIFIED" &&
    event.cardId === targetUid &&
    event.amount === 500
  );
  if ((ctx.state.player.field[0]?.tempAtk || 0) < atkBefore + 500 || !targetBuffEvent) {
    throw new Error(`${smokeName}: legal target did not receive its +500 ATK event: ${JSON.stringify({
      targetUid,
      atkBefore,
      atkAfter: ctx.state.player.field[0]?.tempAtk || 0,
      field: ctx.state.player.field.map((card) => card ? { id: card.id, uid: card.uid, tempAtk: card.tempAtk || 0 } : null),
      events: ctx.state.gameEvents.slice(-8)
    })}. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runBattleSpellSmoke(ctx) {
  setSmokeStatus("running", "battle-spell");
  await startSmokeDuel(ctx, "direct");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "星轨枪兵");
  clickSmokeElement(ctx.els.aiPanel, "AI 玩家面板");
  await waitForSmoke(() => ctx.state.phase === "battle", "攻击意图自动进入战斗时点");
  clickSmokeElement(handCard(ctx.els, "star-breach"), "战斗阶段星隙穿透手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "战斗阶段魔法确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "战斗阶段确认发动星隙穿透");
  await waitForSmoke(() => ctx.state.phase === "battle" && ctx.state.player.directAttacks > 0, "战斗阶段发动魔法成功");
  if (!ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().attack) {
    throw new Error("战斗阶段魔法发动后不应关闭战斗行动窗口");
  }
  setSmokeStatus("passed", "battle-spell");
}

async function runBattleTrapSmoke(ctx) {
  setSmokeStatus("running", "battle-trap");
  await startSmokeDuel(ctx, "direct");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "星轨枪兵");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "敌方怪兽攻击高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "攻击铁壁守卫");
  await waitForSmoke(
    () => ctx.state.actionWindow === "resolution" ||
      (ctx.state.phase === "battle" && ctx.state.player.field[0]?.used),
    "攻击进入结算或完成"
  );
  if (ctx.state.actionWindow === "resolution" && !ctx.els.endTurnBtn.disabled) {
    throw new Error("攻击结算期间不应允许结束回合");
  }
  await waitForSmoke(
    () => ctx.state.phase === "battle" &&
      ctx.state.actionWindow === "battle" &&
      ctx.state.player.field[0]?.used &&
      auditLogEntries(ctx.state.timeline).ok,
    "攻击完整结算后重新开放战斗窗口",
    9000
  );
  clickSmokeElement(handCard(ctx.els, "mirror-snare"), "战斗阶段选择镜光反制");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "战斗阶段陷阱确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认盖放镜光反制");
  await waitForSmoke(
    () => ctx.state.phase === "battle" && ctx.state.player.traps.some((card) => card?.id === "mirror-snare"),
    "攻击后成功盖放陷阱"
  );
  if (countGameEvents(ctx.state, "TRAP_SET") < 1 || countGameEvents(ctx.state, "CARD_MOVED") < 1) {
    throw new Error("Battle phase trap set must be recorded through engine events");
  }
  if (!ctx.currentPlayerActions().spell && !ctx.currentPlayerActions().trap && !ctx.currentPlayerActions().attack) {
    throw new Error("战斗阶段仍有可行动项时不应关闭行动窗口");
  }
  setSmokeStatus("passed", "battle-trap");
}

async function runComboSpellSmoke(ctx) {
  setSmokeStatus("running", "combo-spell");
  await startSmokeDuel(ctx, "combo");
  const aiLpBefore = ctx.state.ai.lp;
  const attacksBefore = ctx.state.player.field.map((card) => card?.tempAtk || 0);
  clickSmokeElement(handCard(ctx.els, "flame-gale-burst"), "炎岚合击手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "炎岚合击中央确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动炎岚合击");
  await waitForSmoke(
    () => ctx.state.ai.lp <= aiLpBefore - 400 &&
      ctx.state.player.field.every((card, index) => !card || card.tempAtk >= attacksBefore[index] + 200) &&
      ctx.state.player.grave.some((card) => card?.id === "flame-gale-burst"),
    "炎岚合击完成伤害和全体强化"
  );
  if (!ctx.state.log.some((entry) => entry.includes("炎岚合击") && entry.includes("强化我方全体怪兽"))) {
    throw new Error("炎岚合击缺少明确结算日志");
  }
  setSmokeStatus("passed", "combo-spell");
}

async function runAceAttackSmoke(ctx) {
  setSmokeStatus("running", "ace-attack");
  await startSmokeDuel(ctx, "ace");
  clickSmokeElement(handCard(ctx.els, "flare-titan"), "熔核巨像手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "熔核巨像中央确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "进入熔核巨像祭品选择");
  await waitForSmoke(() => ctx.state.pendingTribute?.cost === 1, "熔核巨像等待一只祭品");
  clickSmokeElement(fieldCard(ctx.els, "player", "nova-squire"), "选择新星侍从作为祭品");
  await waitForSmoke(() => !ctx.els.choiceConfirmBtn.disabled, "熔核巨像祭品选择完成");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认祭品召唤熔核巨像");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-titan") &&
      ctx.state.player.grave.some((card) => card?.id === "nova-squire") &&
      ctx.els.aceOverlay.classList.contains("show") &&
      fieldCard(ctx.els, "player", "flare-titan"),
    "王牌召唤动画与场上怪兽"
  );
  if (countGameEvents(ctx.state, "MONSTER_SUMMONED") < 1 || countGameEvents(ctx.state, "CARD_TRIBUTED") !== 1) {
    throw new Error("Flare titan tribute summon must be recorded through engine events");
  }
  clickSmokeElement(fieldCard(ctx.els, "player", "flare-titan"), "选择熔核巨像");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "王牌攻击目标高亮");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "熔核巨像攻击铁壁守卫");
  await waitForSmoke(() => ctx.els.effectLayer.querySelector(".ace-strike"), "王牌攻势特写", 9000);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-titan" && card.used) &&
      !ctx.state.ai.field.some((card) => card?.id === "iron-guardian"),
    "王牌攻击完成结算",
    10000
  );
  setSmokeStatus("passed", "ace-attack");
}

async function runDoubleAttackSmoke(ctx) {
  setSmokeStatus("running", "double-attack");
  await startSmokeDuel(ctx, "direct");
  const aiLpBefore = ctx.state.ai.lp;
  ctx.state.player.attackResets = 1;
  const attacker = fieldCard(ctx.els, "player", "star-lancer");
  clickSmokeElement(attacker, "第一次点击星轨枪兵");
  await waitForSmoke(() => ctx.state.selected?.zone === "playerField" && ctx.state.selected.index === 0, "星轨枪兵被选中");
  clickSmokeElement(attacker, "第二次点击星轨枪兵");
  await waitForSmoke(
    () => ctx.state.phase === "battle" && ctx.state.player.field[0]?.used === false &&
      ctx.state.player.attackResets === 0 && ctx.state.ai.lp < aiLpBefore,
    "第一次攻击后消费重置并恢复攻击",
    9000
  );
  if (ctx.state.ai.field[0]) {
    throw new Error("第一次攻击后应该完成怪兽目标结算");
  }
  if (!ctx.state.gameEvents.some((event) => event.type === "ABILITY_SPENT" && event.ability === "attackReset") ||
      !ctx.state.gameEvents.some((event) => event.type === "MONSTER_READIED" && event.cardId === ctx.state.player.field[0]?.uid)) {
    throw new Error("攻击重置必须通过能力消费和怪兽恢复事件结算");
  }
  const aiLpAfterFirstAttack = ctx.state.ai.lp;
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "重置后再次选择星轨枪兵");
  await waitForSmoke(() => ctx.els.aiPanel.classList.contains("direct-target"), "第二次攻击可直击玩家");
  clickSmokeElement(ctx.els.aiPanel, "第二次攻击直击 AI");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.used && ctx.state.ai.lp < aiLpAfterFirstAttack,
    "攻击重置后的第二次攻击完成",
    9000
  );
  setSmokeStatus("passed", "double-attack");
}

async function runBattleTranceReadySmoke(ctx) {
  setSmokeStatus("running", "battle-trance-ready");
  await startSmokeDuel(ctx, "combo");
  await waitForSmoke(
    () => fieldCard(ctx.els, "player", "ember-drake")?.classList.contains("attack-ready") &&
      fieldCard(ctx.els, "player", "gale-mage")?.classList.contains("attack-ready"),
    "main-window attack-ready highlights come from legal battle projection"
  );
  const ember = fieldCard(ctx.els, "player", "ember-drake");
  clickSmokeElement(ember, "select ember for first attack");
  await waitForSmoke(() => fieldCard(ctx.els, "ai", "iron-guardian")?.classList.contains("attack-target"), "first attack target");
  clickSmokeElement(fieldCard(ctx.els, "ai", "iron-guardian"), "ember attacks iron guardian");
  await waitForSmoke(
    () => ctx.state.phase === "battle" &&
      ctx.state.player.field[0]?.id === "ember-drake" &&
      ctx.state.player.field[0]?.used &&
      !ctx.state.ai.field.some((card) => card?.id === "iron-guardian"),
    "first attack resolved before battle trance",
    10000
  );
  clickSmokeElement(handCard(ctx.els, "battle-trance"), "select battle trance");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "battleTrance", "battle trance target window");
  if (ctx.els.playerField.querySelector(".field-monster-card.attack-ready")) {
    throw new Error("battle-trance-ready: attack highlight must pause during target selection");
  }
  if (!fieldCard(ctx.els, "player", "ember-drake")?.dataset.attackReason?.includes("目标选择")) {
    throw new Error("battle-trance-ready: suspended attack highlight should expose the target-selection reason");
  }
  await clickSmokeElementTwiceAcrossRender(
    () => fieldCard(ctx.els, "player", "ember-drake"),
    "repeat click used strongest monster",
    () => Boolean(ctx.state.pendingTarget?.selectedTarget)
  );
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "ember-drake" &&
      ctx.state.player.field[0]?.used === false &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 200 &&
      fieldCard(ctx.els, "player", "ember-drake")?.classList.contains("attack-ready"),
    "battle trance readies used target",
    9000
  );
  if (!ctx.state.gameEvents.some((event) => event.type === "MONSTER_READIED")) {
    throw new Error("battle-trance should ready the used monster through a MONSTER_READIED event");
  }
  setSmokeStatus("passed", "battle-trance-ready");
}

async function runEffectMarkerLifecycleBasicSmoke(ctx) {
  const smokeName = "effect-marker-lifecycle-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "target");

  clickSmokeElement(handCard(ctx.els, "battle-trance"), `${smokeName}: activate battle trance`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "battleTrance" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget) &&
      !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: strongest target is ready`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm battle trance`);
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "star-lancer" &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 200 &&
      ctx.state.player.attackResets === 1,
    `${smokeName}: sourced buff and extra attack resolve through dispatch`,
    9000
  );
  const empowered = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarker(empowered, "再攻 ×1", "追加攻击 ×1：战斗狂热");
  assertCardEffectMarker(empowered, "战斗 攻+200", "战斗狂热生效：攻击力 +200。");

  clickSmokeElement(empowered, `${smokeName}: select empowered attacker`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "sky-raider")?.classList.contains("attack-target"),
    `${smokeName}: legal attack target highlighted`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "sky-raider"), `${smokeName}: spend extra attack`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "sky-raider") &&
      ctx.state.player.field[0]?.id === "star-lancer" &&
      ctx.state.player.field[0]?.used === false &&
      ctx.state.player.attackResets === 0,
    `${smokeName}: attack reset is consumed and attacker is readied`,
    10000
  );
  const readied = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarkerMissing(readied, "再攻 ×1");
  assertCardEffectMarker(readied, "战斗 攻+200", "战斗狂热生效：攻击力 +200。");
  setSmokeStatus("passed", smokeName);
}

async function runEffectMarkerTurnExpiryBasicSmoke(ctx) {
  const smokeName = "effect-marker-turn-expiry-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "guardSkip");

  const target = ctx.state.player.field.find((card) => card?.id === "iron-guardian");
  if (!target) throw new Error(`${smokeName}: durable marker target is missing`);
  ctx.state.player.attackResets = 2;
  ctx.state.player.attackResetEntries = [
    {
      uses: 1,
      duration: "duel",
      sourceCardId: target.uid,
      targetCardId: target.uid
    },
    {
      uses: 1,
      duration: "turn",
      sourceCardId: target.uid,
      targetCardId: target.uid
    }
  ];
  ctx.render?.();
  assertCardEffectMarker(
    fieldCard(ctx.els, "player", "iron-guardian"),
    "再攻 ×2",
    "追加攻击 ×2：铁壁守卫"
  );

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.aiRunning,
    `${smokeName}: complete turn cycle returns to player`,
    22000
  );

  const expiry = [...ctx.state.gameEvents]
    .reverse()
    .find((event) => event.type === "TURN_ABILITIES_EXPIRED" && event.playerId === "player");
  if (!expiry?.abilities?.some((entry) =>
    entry.ability === "attackReset" &&
    entry.duration === "turn" &&
    entry.sourceCardId === target.uid &&
    entry.targetCardId === target.uid
  )) {
    throw new Error(`${smokeName}: turn-scoped attack reset did not expire through its engine event`);
  }
  if (
    ctx.state.player.attackResets !== 1 ||
    ctx.state.player.attackResetEntries?.length !== 1 ||
    ctx.state.player.attackResetEntries[0]?.duration !== "duel"
  ) {
    throw new Error(`${smokeName}: durable attack reset was lost during turn expiry`);
  }
  const preserved = fieldCard(ctx.els, "player", "iron-guardian");
  assertCardEffectMarkerMissing(preserved, "再攻 ×2");
  assertCardEffectMarker(preserved, "再攻 ×1", "追加攻击 ×1：铁壁守卫");
  clickSmokeElement(preserved, `${smokeName}: inspect preserved effect`);
  const detailMeta = ctx.els.playerField.ownerDocument.querySelector("#detailMeta");
  await waitForSmoke(
    () => detailMeta?.textContent?.includes("生效中") &&
      detailMeta.textContent.includes("追加攻击 ×1"),
    `${smokeName}: inspector keeps the durable active effect`
  );
  setSmokeStatus("passed", smokeName);
}

async function runEffectTargetDepartureBasicSmoke(ctx) {
  const smokeName = "effect-target-departure-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "target");

  const target = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  const vanguard = cloneCardById("solar-vanguard");
  const recall = cloneCardById("starwake-recall");
  if (!target || !vanguard || !recall) {
    throw new Error(`${smokeName}: required lifecycle cards are missing`);
  }

  clickSmokeElement(handCard(ctx.els, "battle-trance"), `${smokeName}: activate battle trance`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "battleTrance" && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: battle trance target is ready`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm battle trance`);
  await waitForSmoke(
    () => ctx.state.player.attackResets === 1 &&
      (ctx.state.player.attackResetEntries || []).some((entry) => entry.targetCardId === target.uid),
    `${smokeName}: target-bound attack reset is active`,
    9000
  );
  assertCardEffectMarker(
    fieldCard(ctx.els, "player", "star-lancer"),
    "再攻 ×1",
    "追加攻击 ×1：战斗狂热"
  );

  ctx.state.player.hand.push(vanguard, recall);
  ctx.render?.();
  clickSmokeElement(handCard(ctx.els, "solar-vanguard"), `${smokeName}: select tribute monster`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: enter tribute selection`);
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cost === 1 &&
      fieldCard(ctx.els, "player", "star-lancer")?.classList.contains("tribute-candidate"),
    `${smokeName}: bound monster is a legal tribute`
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), `${smokeName}: select bound monster as tribute`);
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: tribute is selected`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm tribute summon`);
  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.uid === target.uid) &&
      ctx.state.player.attackResets === 0 &&
      (ctx.state.player.attackResetEntries || []).length === 0,
    `${smokeName}: target departure expires its attack reset`,
    9000
  );
  if (!ctx.state.gameEvents.some((event) =>
    event.type === "ABILITY_EXPIRED" &&
    event.ability === "attackReset" &&
    event.targetCardId === target.uid &&
    event.reason === "target-left-zone"
  )) {
    throw new Error(`${smokeName}: target departure must emit ABILITY_EXPIRED`);
  }

  await waitForSmoke(
    () => ctx.state.actionWindow === "main" &&
      !ctx.state.aiRunning &&
      !ctx.els.chainModal?.classList.contains("show") &&
      handCard(ctx.els, "starwake-recall")?.classList.contains("action-ready"),
    `${smokeName}: summon responses settle before grave revival`,
    9000
  );

  const recallCard = handCard(ctx.els, "starwake-recall");
  if (!recallCard?.classList.contains("action-ready")) {
    throw new Error(`${smokeName}: grave revival is not action-ready: ${recallCard?.dataset.actionReason || "no reason"}. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(recallCard, `${smokeName}: open grave revival`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive",
    `${smokeName}: grave revival target window opens`,
    9000
  );
  const departedTarget = graveTargetCard(ctx.els, "star-lancer");
  if (!departedTarget) {
    const graveText = ctx.els.graveTargets?.textContent?.replace(/\s+/g, " ").trim() || "(empty)";
    throw new Error(`${smokeName}: departed target is missing from grave selection: ${graveText}. ${smokeDebug(ctx)}`);
  }
  await selectAndConfirmSpellTarget(
    ctx,
    departedTarget,
    `${smokeName}: revive departed target`
  );
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.uid === target.uid) &&
      !ctx.state.player.grave.some((card) => card?.uid === target.uid) &&
      ctx.state.player.attackResets === 0,
    `${smokeName}: revived card does not inherit expired attack reset`,
    9000
  );
  const revived = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarkerMissing(revived, "再攻 ×1");
  assertCardEffectMarkerMissing(revived, "战斗 攻+200");
  setSmokeStatus("passed", smokeName);
}

async function runEffectMarkerStackingBasicSmoke(ctx) {
  const smokeName = "effect-marker-stacking-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "target");

  clickSmokeElement(handCard(ctx.els, "war-chant"), `${smokeName}: activate war chant`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget) &&
      !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: war chant target is ready`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm war chant`);
  await waitForSmoke(
    () => !ctx.state.pendingTarget &&
      ctx.state.player.field[0]?.id === "star-lancer" &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 600,
    `${smokeName}: war chant and fire wind combo resolve`,
    9000
  );
  const firstBuffed = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarker(firstBuffed, "炎岚 攻+100", "炎岚追击生效：攻击力 +100。");
  assertCardEffectMarker(firstBuffed, "战意 攻+500", "战意高扬生效：攻击力 +500。");

  clickSmokeElement(handCard(ctx.els, "battle-trance"), `${smokeName}: activate battle trance`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "battleTrance" &&
      Boolean(ctx.state.pendingTarget?.selectedTarget) &&
      !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: battle trance target is ready`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm battle trance`);
  await waitForSmoke(
    () => !ctx.state.pendingTarget &&
      ctx.state.player.attackResets === 1 &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 800,
    `${smokeName}: newest modifier and extra attack resolve`,
    9000
  );
  const stacked = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarker(stacked, "再攻 ×1", "追加攻击 ×1：战斗狂热");
  assertCardEffectMarker(stacked, "战斗 攻+200", "战斗狂热生效：攻击力 +200。");
  assertCardEffectMarker(stacked, "更多效果 +2", "另有 2 项效果：炎岚 攻+100、战意 攻+500");
  assertCardEffectMarkerMissing(stacked, "炎岚 攻+100");
  assertCardEffectMarkerMissing(stacked, "战意 攻+500");

  clickSmokeElement(stacked, `${smokeName}: select stacked attacker`);
  const detailMeta = ctx.els.playerField.ownerDocument.querySelector("#detailMeta");
  await waitForSmoke(
    () => detailMeta?.querySelector(".detail-meta-row.scrollable")?.getClientRects().length > 0 &&
      detailMeta.textContent.includes("生效中") &&
      detailMeta.textContent.includes("追加攻击 ×1：战斗狂热") &&
      detailMeta.textContent.includes("战斗狂热生效：攻击力 +200。") &&
      detailMeta.textContent.includes("炎岚追击生效：攻击力 +100。") &&
      detailMeta.textContent.includes("战意高扬生效：攻击力 +500。"),
    `${smokeName}: selected card inspector lists every active effect`
  );
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "sky-raider")?.classList.contains("attack-target"),
    `${smokeName}: attack target is ready`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "sky-raider"), `${smokeName}: consume extra attack`);
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "sky-raider") &&
      ctx.state.player.field[0]?.used === false &&
      ctx.state.player.attackResets === 0,
    `${smokeName}: extra attack is consumed`,
    10000
  );
  const afterReset = fieldCard(ctx.els, "player", "star-lancer");
  assertCardEffectMarkerMissing(afterReset, "再攻 ×1");
  assertCardEffectMarker(afterReset, "战斗 攻+200", "战斗狂热生效：攻击力 +200。");
  assertCardEffectMarker(afterReset, "炎岚 攻+100", "炎岚追击生效：攻击力 +100。");
  assertCardEffectMarker(afterReset, "更多效果 +1", "另有 1 项效果：战意 攻+500");
  setSmokeStatus("passed", smokeName);
}

async function runAiDirectTrapSmoke(ctx) {
  setSmokeStatus("running", "ai-direct-trap");
  await startSmokeDuel(ctx, "directTrap");
  const playerLpBefore = ctx.state.player.lp;
  clickSmokeElement(handCard(ctx.els, "storm-shift"), "风暴转移手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "空陷阱区");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "storm-shift"), "风暴转移盖放");
  if (countGameEvents(ctx.state, "TRAP_SET") < 1 || countGameEvents(ctx.state, "CARD_MOVED") < 1) {
    throw new Error("Direct trap setup must be recorded through engine events");
  }
  await finishPlayerTurn(ctx);
  for (let promptIndex = 1; promptIndex <= 3; promptIndex += 1) {
    await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `第 ${promptIndex} 次直击风暴转移连锁弹窗`, 20000);
    if (!ctx.els.chainText.textContent.includes("风暴转移") || !ctx.els.chainText.textContent.includes("你本人")) {
      throw new Error("风暴转移直击提示缺少陷阱名或直击目标");
    }
    clickSmokeElement(ctx.els.chainNo, `第 ${promptIndex} 次不发动风暴转移`);
    await waitForSmoke(
      () => ctx.state.log.filter((entry) => entry.includes("你没有发动 风暴转移")).length >= promptIndex,
      `第 ${promptIndex} 次拒绝风暴转移已记录`,
      5000
    );
  }
  await waitForSmoke(() => ctx.state.player.lp < playerLpBefore, "连续直击扣除玩家生命值", 16000);
  const declinedPrompts = ctx.state.log.filter((entry) => entry.includes("你没有发动 风暴转移")).length;
  if (declinedPrompts !== 3) {
    throw new Error(`三次攻击应分别提示风暴转移，实际记录 ${declinedPrompts} 次`);
  }
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).filter((event) => event.type === "RESPONSE_WINDOW_CLOSED" && event.timing === "damageStep").length >= 3,
    "三次直击伤害窗口全部关闭",
    10000
  );
  const directWindows = (ctx.state.gameEvents || []).filter((event) => event.type === "RESPONSE_WINDOW_OPENED" && event.prompt === "direct").length;
  const directCloses = (ctx.state.gameEvents || []).filter((event) => event.type === "RESPONSE_WINDOW_CLOSED" && event.timing === "damageStep").length;
  if (directWindows !== 3 || directCloses !== 3) {
    throw new Error(`连续直击响应事件数量异常：直击窗口 ${directWindows}，关闭 ${directCloses}`);
  }
  setSmokeStatus("passed", "ai-direct-trap");
}

async function runTrapChoiceSmoke(ctx) {
  setSmokeStatus("running", "trap-choice");
  await startSmokeDuel(ctx, "trapChoice");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "多陷阱响应窗口", 12000);
  const mirror = trapCard(ctx.els, "player", "mirror-snare");
  const voidLock = trapCard(ctx.els, "player", "void-lock");
  if (!mirror?.classList.contains("trap-response") || !voidLock?.classList.contains("trap-response")) {
    throw new Error("所有可发动陷阱都应该高亮");
  }
  if (!ctx.els.chainYes.disabled) {
    throw new Error("多陷阱响应时必须先选择一张陷阱");
  }
  if (!chainChoiceButton(ctx.els, "mirror-snare") || !chainChoiceButton(ctx.els, "void-lock")) {
    throw new Error("多陷阱响应应该在弹窗内显示可选陷阱");
  }
  clickSmokeElement(chainChoiceButton(ctx.els, "void-lock"), "在弹窗内选择星界封锁");
  await waitForSmoke(
    () => ctx.els.chainText.textContent.includes("星界封锁") && !ctx.els.chainYes.disabled,
    "选择陷阱后确认按钮可用"
  );
  clickSmokeElement(ctx.els.chainYes, "确认发动星界封锁");
  await waitForSmoke(
    () => ctx.state.player.traps.some((card) => card?.id === "mirror-snare") &&
      !ctx.state.player.traps.some((card) => card?.id === "void-lock") &&
      ctx.state.log.some((entry) => entry.includes("陷阱卡 星界封锁 触发")),
    "只发动选中的陷阱",
    9000
  );
  setSmokeStatus("passed", "trap-choice");
}

async function runTrapChoiceDoubleSmoke(ctx) {
  setSmokeStatus("running", "trap-choice-double");
  await startSmokeDuel(ctx, "trapChoice");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "陷阱双击响应窗口", 12000);
  clickSmokeElement(chainChoiceButton(ctx.els, "void-lock"), "双击第一击选择星界封锁");
  await waitForSmoke(
    () => ctx.state.pendingTrapChoice?.selectedIndex === 1 && chainChoiceButton(ctx.els, "void-lock")?.classList.contains("selected"),
    "第一击重渲染后仍保留选中的星界封锁"
  );
  clickSmokeElement(chainChoiceButton(ctx.els, "void-lock"), "双击第二击直接发动星界封锁");
  await waitForSmoke(
    () => !ctx.state.player.traps.some((card) => card?.id === "void-lock") &&
      ctx.state.player.traps.some((card) => card?.id === "mirror-snare"),
    "双击弹窗内陷阱后直接发动选中的陷阱",
    9000
  );
  setSmokeStatus("passed", "trap-choice-double");
}

async function runTrapChoiceFieldDoubleSmoke(ctx) {
  const smokeName = "trap-choice-field-double";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "trapChoice");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), `${smokeName}: response window`, 12000);
  clickSmokeElement(trapCard(ctx.els, "player", "void-lock"), `${smokeName}: first field click selects void lock`);
  await waitForSmoke(
    () => ctx.state.pendingTrapChoice?.selectedIndex === 1 &&
      trapCard(ctx.els, "player", "void-lock")?.classList.contains("trap-response-selected"),
    `${smokeName}: field response survives selection rerender`
  );
  clickSmokeElement(trapCard(ctx.els, "player", "void-lock"), `${smokeName}: second field click activates void lock`);
  await waitForSmoke(
    () => !ctx.state.player.traps.some((card) => card?.id === "void-lock") &&
      ctx.state.player.traps.some((card) => card?.id === "mirror-snare"),
    `${smokeName}: field double activation resolves selected trap`,
    9000
  );
  setSmokeStatus("passed", smokeName);
}

async function runResponseRestartSmoke(ctx) {
  setSmokeStatus("running", "response-restart");
  await startSmokeDuel(ctx, "trapChoice");
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "重开前陷阱响应窗口", 12000);
  clickSmokeElement(ctx.els.restartBtn, "响应期间重开");
  await waitForSmoke(
    () => !ctx.state.started &&
      ctx.els.modal.classList.contains("show") &&
      !ctx.els.chainModal.classList.contains("show") &&
      !ctx.state.pendingTrapChoice,
    "重开后清理旧响应窗口"
  );
  await new Promise((resolve) => window.setTimeout(resolve, 2200));
  if (ctx.state.started || ctx.els.chainModal.classList.contains("show") || ctx.state.pendingTrapChoice) {
    throw new Error("重开后旧响应流程重新污染了准备界面");
  }
  setSmokeStatus("passed", "response-restart");
}

async function runChainTrapChoiceSmoke(ctx) {
  setSmokeStatus("running", "chain-trap-choice");
  await startSmokeDuel(ctx, "chain");
  clickSmokeElement(handCard(ctx.els, "iron-guardian"), "召唤高防守卫");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "我方怪兽区 1");
  await waitForSmoke(() => ctx.state.player.field.some((card) => card?.id === "iron-guardian"), "高防守卫召唤成功");
  for (const trapId of ["weakening-web", "counter-array", "void-lock"]) {
    clickSmokeElement(handCard(ctx.els, trapId), `选择陷阱 ${trapId}`);
    clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), `盖放陷阱 ${trapId}`);
    await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === trapId), `陷阱 ${trapId} 盖放成功`);
  }
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "连锁测试多陷阱响应窗口", 24000);
  const aiAttackerIds = ctx.state.ai.field.filter(Boolean).map((card) => card.id);
  if (aiAttackerIds.length !== 1 || aiAttackerIds[0] !== "sky-raider") {
    throw new Error(`连锁选择 smoke 必须由唯一的天岚突袭者触发，实际 ${aiAttackerIds.join(",") || "空场"}`);
  }
  if (!ctx.state.player.traps.some((card) => card?.id === "weakening-web") ||
      countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 0) {
    throw new Error("检查三陷阱响应窗口前不应已有陷阱被发动或离场");
  }
  if (countGameEvents(ctx.state, "TRAP_SET") < 3 || countGameEvents(ctx.state, "CARD_MOVED") < 3) {
    throw new Error("Multi-trap setup must record every set trap through engine events");
  }
  const choiceCount = ctx.els.chainChoices?.querySelectorAll("[data-trap-choice-index]").length || 0;
  if (choiceCount !== 3) {
    const choiceIds = [...(ctx.els.chainChoices?.querySelectorAll("[data-card-id]") || [])]
      .map((button) => button.dataset.cardId)
      .join(",");
    const trapIds = ctx.state.player.traps.map((card) => card?.id || "-").join(",");
    throw new Error(`连锁场景应该在弹窗内显示三张可选陷阱，实际 ${choiceCount} 张：choices=${choiceIds || "-"} traps=${trapIds} text=${ctx.els.chainText.textContent}`);
  }
  if (!ctx.els.chainYes.disabled) {
    throw new Error("连锁场景多陷阱响应时必须先选择再确认");
  }
  clickSmokeElement(chainChoiceButton(ctx.els, "counter-array"), "在弹窗内选择反击阵列");
  await waitForSmoke(
    () => ctx.els.chainText.textContent.includes("反击阵列") && !ctx.els.chainYes.disabled,
    "连锁场景选择陷阱后确认按钮可用"
  );
  clickSmokeElement(ctx.els.chainYes, "确认发动反击阵列");
  await waitForSmoke(
    () => !ctx.state.player.traps.some((card) => card?.id === "counter-array") &&
      ctx.state.player.traps.some((card) => card?.id === "weakening-web") &&
      ctx.state.player.traps.some((card) => card?.id === "void-lock"),
    "连锁场景只发动选中的陷阱",
    9000
  );
  if (countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1 ||
      countGameEvents(ctx.state, "RESPONSE_WINDOW_CLOSED") < 1) {
    throw new Error("选中的攻击陷阱必须完整记录加入连锁、结算和关闭响应窗口事件");
  }
  const audit = auditLogEntries(ctx.state.timeline);
  if (!audit.ok) {
    throw new Error(`连锁场景日志审计失败：${audit.issues.map((issue) => issue.message).join(" / ")}`);
  }
  setSmokeStatus("passed", "chain-trap-choice");
}

async function runChainAttackReentrySmoke(ctx) {
  setSmokeStatus("running", "chain-attack-reentry");
  await startSmokeDuel(ctx, "chain");
  ctx.state.ai.hand = [];
  ctx.state.ai.deck = [];
  ctx.render?.();

  clickSmokeElement(handCard(ctx.els, "iron-guardian"), "summon iron guardian");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "player monster slot 1");
  await waitForSmoke(() => ctx.state.player.field[0]?.id === "iron-guardian", "player monster summoned");

  clickSmokeElement(handCard(ctx.els, "counter-array"), "select counter-array");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "set counter-array");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "counter-array"), "counter-array set");

  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "player trap response opens", 20000);
  if (ctx.els.chainYes.disabled) {
    throw new Error(`Counter trap prompt opened but confirm is disabled. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(ctx.els.chainYes, "activate counter-array");
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show") &&
      countGameEvents(ctx.state, "ATTACK_CANCELED") >= 1 &&
      !ctx.state.player.traps.some((card) => card?.id === "counter-array"),
    "counter-array chain resolves and cancels AI attack",
    12000
  );

  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      !ctx.state.aiRunning &&
      !ctx.els.chainModal.classList.contains("show"),
    "duel returns to player main window after chain",
    24000
  );
  const readyMonster = ctx.state.player.field.some((card) =>
    card?.type === "monster" && !card.used && (card.mode || "attack") !== "defense"
  );
  if (!readyMonster) {
    throw new Error(`No player monster remains attack-ready after chain. ${smokeDebug(ctx)}`);
  }

  const attackerEl = fieldCard(ctx.els, "player", "iron-guardian");
  const targetEl = fieldCard(ctx.els, "ai", "sky-raider");
  if (!attackerEl || !targetEl) {
    throw new Error(`Expected attacker and target to remain on field. ${smokeDebug(ctx)}`);
  }
  const declaredBefore = countGameEvents(ctx.state, "ATTACK_DECLARED");
  clickSmokeElement(attackerEl, "select iron guardian after chain");
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "sky-raider")?.classList.contains("attack-target"),
    `sky-raider becomes an attack target after selecting iron guardian. ${smokeDebug(ctx)}`,
    6000
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "sky-raider"), "attack sky-raider after chain");
  await waitForSmoke(
    () => countGameEvents(ctx.state, "ATTACK_DECLARED") > declaredBefore &&
      (ctx.state.gameEvents || []).some((event) => event.type === "ATTACK_DECLARED" && event.playerId === "player"),
    `post-chain player attack dispatches ATTACK_DECLARED. ${smokeDebug(ctx)}`,
    9000
  );

  setSmokeStatus("passed", "chain-attack-reentry");
}

async function runChainWeakenResolutionSmoke(ctx) {
  setSmokeStatus("running", "chain-weaken-resolution");
  await startSmokeDuel(ctx, "chain");
  ctx.state.ai.hand = [];
  ctx.state.ai.deck = [];
  clickSmokeElement(handCard(ctx.els, "gale-mage"), "召唤疾风术士");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "我方怪兽区 1");
  await waitForSmoke(() => ctx.state.player.field[0]?.id === "gale-mage", "疾风术士召唤成功");
  clickSmokeElement(handCard(ctx.els, "weakening-web"), "选择弱化力场");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "盖放弱化力场");
  await waitForSmoke(() => ctx.state.player.traps.some((card) => card?.id === "weakening-web"), "弱化力场盖放成功");
  const aiLpBefore = ctx.state.ai.lp;
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "弱化力场响应窗口", 16000);
  if (!ctx.els.chainText.textContent.includes("弱化力场")) {
    throw new Error("弱化力场响应提示缺少陷阱名称");
  }
  clickSmokeElement(ctx.els.chainYes, "确认发动弱化力场");
  await waitForSmoke(
    () => !ctx.state.ai.field.some((card) => card?.id === "sky-raider") &&
      ctx.state.player.field.some((card) => card?.id === "gale-mage") &&
      ctx.state.ai.lp < aiLpBefore,
    "弱化力场不取消攻击，削弱后继续结算并反杀攻击怪兽",
    12000
  );
  if (!ctx.state.log.some((entry) => entry.includes("弱化力场") && entry.includes("攻击继续结算"))) {
    throw new Error("弱化力场日志应说明攻击继续结算");
  }
  if (countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1 ||
      countGameEvents(ctx.state, "RESPONSE_WINDOW_CLOSED") < 1) {
    throw new Error("弱化力场响应必须完整记录连锁和响应窗口事件");
  }
  const audit = auditLogEntries(ctx.state.timeline);
  if (!audit.ok) {
    throw new Error(`弱化力场结算日志审计失败：${audit.issues.map((issue) => issue.message).join(" / ")}`);
  }
  setSmokeStatus("passed", "chain-weaken-resolution");
}

async function runAiCounterChainSmoke(ctx) {
  setSmokeStatus("running", "ai-counter-chain");
  await startSmokeDuel(ctx, "counterChain");
  const playerLpBefore = ctx.state.player.lp;
  await finishPlayerTurn(ctx);
  await waitForSmoke(() => ctx.els.chainModal.classList.contains("show"), "玩家攻击陷阱响应窗口", 16000);
  if (!ctx.els.chainText.textContent.includes("反击阵列")) {
    throw new Error("AI 反制场景应先提示玩家发动反击阵列");
  }
  if (ctx.els.chainYes.disabled) {
    throw new Error("反击阵列已自动选中，但发动按钮仍被禁用");
  }
  clickSmokeElement(ctx.els.chainYes, "发动反击阵列");
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show"),
    "确认反击阵列后关闭响应窗口",
    3000
  );
  await waitForSmoke(
    () => !ctx.state.player.traps.some((card) => card?.id === "counter-array") &&
      !ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier") &&
      !ctx.state.player.field.some((card) => card?.id === "gale-mage") &&
      ctx.state.player.lp < playerLpBefore,
    "AI 追加断链裁决后攻击继续结算",
    18000
  );
  if (countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 2 ||
      countGameEvents(ctx.state, "CHAIN_LINK_COMMITTED") !== 2 ||
      countGameEvents(ctx.state, "RESPONSE_PRIORITY_PASSED") < 2 ||
      countGameEvents(ctx.state, "EFFECT_NEGATED") !== 1 ||
      countGameEvents(ctx.state, "EFFECT_SKIPPED") !== 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1) {
    throw new Error("AI 反制必须记录两条链接、优先权转移、无效、跳过和统一结算事件");
  }
  if (!ctx.state.log.some((entry) => entry.includes("AI 检测到") && entry.includes("反击阵列")) ||
      !ctx.state.log.some((entry) => entry.includes("断链裁决") && entry.includes("无效"))) {
    throw new Error("AI 追加连锁缺少可读日志");
  }
  setSmokeStatus("passed", "ai-counter-chain");
}

async function runPlayerCounterChainSmoke(ctx) {
  setSmokeStatus("running", "player-counter-chain");
  await startSmokeDuel(ctx, "playerCounterChain");
  const nullifierDefinition = cloneCardById("chain-nullifier");
  if (!nullifierDefinition) throw new Error("player-counter-chain: nullifier definition should exist");
  const attacker = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  const defender = ctx.state.ai.field.find((card) => card?.id === "gale-mage");
  if (!attacker || !defender || !ctx.state.player.traps.some((card) => card?.id === "chain-nullifier") ||
      !ctx.state.ai.traps.some((card) => card?.id === "mirror-snare")) {
    throw new Error(`player-counter-chain: deterministic opening is missing. ${smokeDebug(ctx)}`);
  }
  const aiLpBefore = ctx.state.ai.lp;

  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "player-counter-chain: select attacker");
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "gale-mage")?.classList.contains("attack-target"),
    "player-counter-chain: defender becomes targetable"
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "gale-mage"), "player-counter-chain: declare attack");
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.els.chainText.textContent.includes("镜光反制") &&
      ctx.els.chainText.textContent.includes("断链裁决"),
    `player-counter-chain: counter response opens. ${smokeDebug(ctx)}`,
    12000
  );

  const stackText = ctx.els.chainStack?.textContent || "";
  const stackEntries = ctx.els.chainStack?.querySelectorAll(".chain-stack-entry") || [];
  if (stackEntries.length !== 2 || !stackText.includes("CL1") || !stackText.includes("AI") ||
      !stackText.includes("镜光反制") || !stackText.includes("CL2") || !stackText.includes("你") ||
      !stackText.includes("断链裁决") || !stackText.includes("待发动")) {
    throw new Error(`player-counter-chain: visible chain order is incomplete: ${stackText}`);
  }
  const detailButton = ctx.els.chainStack.querySelector('[data-card-id="chain-nullifier"]');
  clickSmokeElement(detailButton, "player-counter-chain: inspect pending nullifier");
  await assertCardDetailModal(ctx, nullifierDefinition, "player-counter-chain");
  clickSmokeElement(ctx.els.zoomClose, "player-counter-chain: close nullifier detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "player-counter-chain: detail closes");

  clickSmokeElement(ctx.els.chainYes, "player-counter-chain: add nullifier as chain two");
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show") &&
      ctx.state.player.grave.some((card) => card?.id === "chain-nullifier") &&
      ctx.state.ai.grave.some((card) => card?.id === "mirror-snare") &&
      ctx.state.player.field.some((card) => card?.uid === attacker.uid) &&
      ctx.state.ai.grave.some((card) => card?.uid === defender.uid) &&
      ctx.state.ai.lp === aiLpBefore - 600,
    `player-counter-chain: nullifier protects the attack and battle resolves. ${smokeDebug(ctx)}`,
    18000
  );
  if (countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 2 ||
      countGameEvents(ctx.state, "CHAIN_LINK_COMMITTED") !== 2 ||
      countGameEvents(ctx.state, "EFFECT_NEGATED") !== 1 ||
      countGameEvents(ctx.state, "EFFECT_SKIPPED") !== 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1) {
    throw new Error("player-counter-chain: two-link event chain is incomplete");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("镜光反制") && logEntryMessage(entry).includes("无效"))) {
    throw new Error("player-counter-chain: battle log should explain the negated AI trap");
  }
  setSmokeStatus("passed", "player-counter-chain");
}

async function runMirrorDestroyNoDamageBasicSmoke(ctx, smokeName = "mirror-destroy-no-damage-basic") {
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "playerCounterChain");
  const attacker = ctx.state.player.field.find((card) => card?.id === "star-lancer");
  const mirror = ctx.state.ai.traps.find((card) => card?.id === "mirror-snare");
  if (!attacker || !mirror || !ctx.state.ai.field.some((card) => card?.id === "gale-mage")) {
    throw new Error(`${smokeName}: deterministic opening is incomplete. ${smokeDebug(ctx)}`);
  }
  const playerLpBefore = ctx.state.player.lp;
  const aiLpBefore = ctx.state.ai.lp;

  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), `${smokeName}: select attacker`);
  await waitForSmoke(
    () => fieldCard(ctx.els, "ai", "gale-mage")?.classList.contains("attack-target"),
    `${smokeName}: defender becomes attackable`
  );
  clickSmokeElement(fieldCard(ctx.els, "ai", "gale-mage"), `${smokeName}: declare attack`);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") && ctx.state.pendingTrapChoice,
    `${smokeName}: counter response opens`,
    12000
  );
  const declaration = [...(ctx.state.gameEvents || [])].reverse().find((event) => event.type === "ATTACK_DECLARED");
  if (!declaration) throw new Error(`${smokeName}: attack declaration event is missing.`);

  clickSmokeElement(ctx.els.chainNo, `${smokeName}: decline chain nullifier`);
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show") && !ctx.state.pendingTrapChoice,
    `${smokeName}: response closes`,
    16000
  );
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "mirror-snare"),
    `${smokeName}: mirror reveal opens`,
    16000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, `${smokeName}: continue mirror reveal`);
  await waitForSmoke(
    () => !ctx.els.aiRevealModal.classList.contains("show") &&
      ctx.state.player.grave.some((card) => card?.uid === attacker.uid) &&
      ctx.state.ai.grave.some((card) => card?.uid === mirror.uid) &&
      !["response", "resolution"].includes(ctx.state.actionWindow),
    `${smokeName}: mirror resolves and response window clears`,
    16000
  );

  if (!ctx.state.player.grave.some((card) => card?.uid === attacker.uid) ||
      !ctx.state.ai.grave.some((card) => card?.uid === mirror.uid) ||
      ["response", "resolution"].includes(ctx.state.actionWindow)) {
    throw new Error(`${smokeName}: mirror must destroy the attacker and leave the response flow. ${smokeDebug(ctx)}`);
  }

  if (ctx.state.player.lp !== playerLpBefore || ctx.state.ai.lp !== aiLpBefore) {
    throw new Error(`${smokeName}: a destroyed attacker must not reach battle damage. ${smokeDebug(ctx)}`);
  }
  if ((ctx.state.gameEvents || []).some((event) =>
    event.type === "BATTLE_RESOLVED" && String(event.declarationEventId) === String(declaration.id)
  )) {
    throw new Error(`${smokeName}: canceled attack must not emit BATTLE_RESOLVED.`);
  }
  const cancelEvent = (ctx.state.gameEvents || []).find((event) =>
    event.type === "ATTACK_CANCELED" && String(event.declarationEventId) === String(declaration.id)
  );
  if (!cancelEvent) {
    throw new Error(`${smokeName}: mirror destruction must emit ATTACK_CANCELED.`);
  }
  const terminalEvents = (ctx.state.gameEvents || []).filter((event) => Number(event.id) > Number(cancelEvent.id));
  const restoredWindows = terminalEvents.filter((event) =>
    event.type === "ACTION_WINDOW_OPENED" &&
    event.playerId === "player" &&
    event.window === "battle" &&
    event.reason === "chain-canceled-attack"
  );
  if (restoredWindows.length !== 1 || ctx.state.actionWindow !== "battle") {
    throw new Error(`${smokeName}: engine must restore exactly one player battle window after chain cancellation. ${smokeDebug(ctx)}`);
  }
  if (terminalEvents.some((event) =>
    event.type === "COMMAND_DISPATCHED" && event.commandType === "OPEN_ACTION_WINDOW"
  )) {
    throw new Error(`${smokeName}: UI must not dispatch a duplicate action-window command after chain cancellation.`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runBattleFlowRegressionBasicSmoke(ctx) {
  await runMirrorDestroyNoDamageBasicSmoke(ctx, "battle-flow-regression-basic");
}

async function runResponseWindowResumeBasicSmoke(ctx) {
  const smokeName = "response-window-resume-basic";
  setSmokeStatus("running", smokeName);
  await runPlayerCounterChainSmoke(ctx);

  const events = ctx.state.gameEvents || [];
  const chainResolvedIndex = events.findIndex((event) => event.type === "CHAIN_RESOLVED");
  const continuationIndex = events.findIndex((event, index) =>
    index > chainResolvedIndex &&
    event.type === "ACTION_WINDOW_OPENED" &&
    event.playerId === "player" &&
    event.window === "resolution" &&
    event.reason === "chain-resolved"
  );
  const battleResolvedIndex = events.findIndex((event, index) =>
    index > continuationIndex && event.type === "BATTLE_RESOLVED"
  );
  const battleWindowIndex = events.findIndex((event, index) =>
    index > battleResolvedIndex &&
    event.type === "ACTION_WINDOW_OPENED" &&
    event.playerId === "player" &&
    event.window === "battle" &&
    event.reason === "battle-resolved"
  );
  if (!(chainResolvedIndex >= 0 && continuationIndex > chainResolvedIndex &&
      battleResolvedIndex > continuationIndex && battleWindowIndex > battleResolvedIndex)) {
    throw new Error(`${smokeName}: response continuation event order is incomplete. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.ruleCheckIssue) {
    throw new Error(`${smokeName}: rule engine reported ${ctx.state.ruleCheckIssue}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runTripleCounterChainSmoke(ctx) {
  setSmokeStatus("running", "triple-counter-chain");
  await startSmokeDuel(ctx, "tripleCounterChain");
  const nullifierDefinition = cloneCardById("chain-nullifier");
  const defender = ctx.state.player.field.find((card) => card?.id === "gale-mage");
  const attacker = ctx.state.ai.field.find((card) => card?.id === "star-lancer");
  if (!nullifierDefinition || !defender || !attacker ||
      !ctx.state.player.traps.some((card) => card?.id === "counter-array") ||
      !ctx.state.player.traps.some((card) => card?.id === "chain-nullifier") ||
      !ctx.state.ai.traps.some((card) => card?.id === "chain-nullifier")) {
    throw new Error(`triple-counter-chain: deterministic opening is missing. ${smokeDebug(ctx)}`);
  }
  const playerLpBefore = ctx.state.player.lp;

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.els.chainText.textContent.includes("反击阵列") &&
      ctx.els.chainStatus?.textContent.includes("将加入 CL1") &&
      ctx.els.chainYes.textContent.includes("CL1") &&
      !ctx.els.chainYes.disabled,
    `triple-counter-chain: first response opens. ${smokeDebug(ctx)}`,
    16000
  );
  clickSmokeElement(ctx.els.chainYes, "triple-counter-chain: activate chain one");

  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.els.chainStack?.querySelectorAll(".chain-stack-entry").length === 3 &&
      ctx.els.chainStack?.textContent.includes("结算顺序：CL3 → CL2 → CL1") &&
      ctx.els.chainStatus?.textContent.includes("将加入 CL3") &&
      ctx.els.chainYes.textContent.includes("CL3") &&
      !ctx.els.chainYes.disabled,
    `triple-counter-chain: third response opens. ${smokeDebug(ctx)}`,
    12000
  );
  const stackRows = [...ctx.els.chainStack.querySelectorAll(".chain-stack-entry")]
    .map((entry) => entry.textContent.replace(/\s+/g, " ").trim());
  if (!stackRows[0]?.includes("CL1") || !stackRows[0]?.includes("你") || !stackRows[0]?.includes("反击阵列") ||
      !stackRows[1]?.includes("CL2") || !stackRows[1]?.includes("AI") || !stackRows[1]?.includes("断链裁决") ||
      !stackRows[2]?.includes("CL3") || !stackRows[2]?.includes("你") || !stackRows[2]?.includes("断链裁决") ||
      !stackRows[2]?.includes("待发动")) {
    throw new Error(`triple-counter-chain: visible chain stack is incorrect: ${stackRows.join(" / ")}`);
  }

  const pendingDetail = ctx.els.chainStack.querySelector('.chain-stack-entry.pending [data-card-id="chain-nullifier"]');
  clickSmokeElement(pendingDetail, "triple-counter-chain: inspect chain three");
  await assertCardDetailModal(ctx, nullifierDefinition, "triple-counter-chain");
  clickSmokeElement(ctx.els.zoomClose, "triple-counter-chain: close chain three detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "triple-counter-chain: detail closes");

  clickSmokeElement(ctx.els.chainYes, "triple-counter-chain: activate chain three");
  await waitForSmoke(
    () => !ctx.els.chainModal.classList.contains("show") &&
      ctx.state.player.grave.some((card) => card?.id === "counter-array") &&
      ctx.state.player.grave.some((card) => card?.id === "chain-nullifier") &&
      ctx.state.ai.grave.some((card) => card?.id === "chain-nullifier") &&
      ctx.state.player.field.some((card) => card?.uid === defender.uid && card.tempAtk === 400) &&
      ctx.state.ai.field.some((card) => card?.uid === attacker.uid && card.used) &&
      ctx.state.player.lp === playerLpBefore,
    `triple-counter-chain: chain three restores chain one and cancels the attack. ${smokeDebug(ctx)}`,
    20000
  );
  if (countGameEvents(ctx.state, "CHAIN_LINK_ADDED") !== 3 ||
      countGameEvents(ctx.state, "CHAIN_LINK_COMMITTED") !== 3 ||
      countGameEvents(ctx.state, "EFFECT_NEGATED") !== 1 ||
      countGameEvents(ctx.state, "EFFECT_SKIPPED") !== 1 ||
      countGameEvents(ctx.state, "CHAIN_RESOLVED") !== 1 ||
      countGameEvents(ctx.state, "ATTACK_CANCELED") !== 1) {
    throw new Error("triple-counter-chain: event chain should contain three links and one restored defense resolution");
  }
  if (!ctx.state.log.some((entry) => logEntryMessage(entry).includes("断链裁决") && logEntryMessage(entry).includes("连锁无效")) ||
      !ctx.state.log.some((entry) => logEntryMessage(entry).includes("反击阵列") && logEntryMessage(entry).includes("取消了攻击"))) {
    throw new Error("triple-counter-chain: battle log should explain the counter-counter outcome");
  }
  setSmokeStatus("passed", "triple-counter-chain");
}

async function runChainResolutionReviewSmoke(ctx) {
  setSmokeStatus("running", "chain-resolution-review");
  await startSmokeDuel(ctx, "tripleCounterChain");
  const nullifierDefinition = cloneCardById("chain-nullifier");
  if (!nullifierDefinition) throw new Error("chain-resolution-review: nullifier definition should exist");

  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.els.chainText.textContent.includes("反击阵列") &&
      !ctx.els.chainYes.disabled,
    `chain-resolution-review: first response opens. ${smokeDebug(ctx)}`,
    16000
  );
  clickSmokeElement(ctx.els.chainYes, "chain-resolution-review: activate chain one");
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.els.chainStack?.querySelectorAll(".chain-stack-entry").length === 3 &&
      !ctx.els.chainYes.disabled,
    `chain-resolution-review: third response opens. ${smokeDebug(ctx)}`,
    12000
  );
  clickSmokeElement(ctx.els.chainYes, "chain-resolution-review: activate chain three");

  await waitForSmoke(
    () => !ctx.els.chainHistoryToggle?.hidden && countGameEvents(ctx.state, "CHAIN_RESOLVED") === 1,
    `chain-resolution-review: completed chain becomes reviewable. ${smokeDebug(ctx)}`,
    20000
  );
  clickSmokeElementCenter(ctx.els.chainHistoryToggle, "chain-resolution-review: expand history");
  await waitForSmoke(
    () => !ctx.els.chainHistoryList.hidden &&
      ctx.els.chainHistoryList.querySelectorAll(".chain-history-link").length === 3,
    "chain-resolution-review: history expands"
  );

  const historyText = ctx.els.chainHistoryList.textContent || "";
  const historyRows = [...ctx.els.chainHistoryList.querySelectorAll(".chain-history-link")];
  if (!historyText.includes("结算 CL3 → CL2 → CL1") ||
      !historyRows[0]?.textContent.includes("CL1") || !historyRows[0]?.textContent.includes("已生效") ||
      !historyRows[1]?.textContent.includes("CL2") || !historyRows[1]?.textContent.includes("被无效") ||
      !historyRows[2]?.textContent.includes("CL3") || !historyRows[2]?.textContent.includes("已生效")) {
    throw new Error(`chain-resolution-review: result history is incomplete: ${historyText}`);
  }

  const cardLink = ctx.els.chainHistoryList.querySelector('.chain-history-card[data-card-id="chain-nullifier"]');
  clickSmokeElementCenter(cardLink, "chain-resolution-review: inspect public history card");
  await assertCardDetailModal(ctx, nullifierDefinition, "chain-resolution-review");
  clickSmokeElement(ctx.els.zoomClose, "chain-resolution-review: close history detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "chain-resolution-review: detail closes");
  if (!ctx.state.started || ctx.state.gameOver) {
    throw new Error(`chain-resolution-review: reviewing history should not interrupt the duel. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "chain-resolution-review");
}

async function runTurnHandoffBasicSmoke(ctx) {
  const smokeName = "turn-handoff-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "direct");
  ctx.state.ai.hand = [];
  ctx.state.ai.deck = [];
  ctx.state.ai.field = ctx.state.ai.field.map(() => null);
  ctx.state.ai.traps = ctx.state.ai.traps.map(() => null);
  ctx.render?.();

  const eventStart = (ctx.state.gameEvents || []).length;
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => {
      const events = (ctx.state.gameEvents || []).slice(eventStart);
      return ctx.state.turn === "player" &&
        events.some((event) => event.type === "TURN_ENDED" && event.playerId === "player" && event.nextPlayerId === "ai") &&
        events.some((event) => event.type === "TURN_STARTED" && event.playerId === "ai") &&
        events.some((event) => event.type === "TURN_ENDED" && event.playerId === "ai" && event.nextPlayerId === "player") &&
        events.some((event) => event.type === "TURN_STARTED" && event.playerId === "player");
    },
    `${smokeName}: player and AI turns complete through paired end/start events`,
    12000
  );

  const handoffEvents = (ctx.state.gameEvents || []).slice(eventStart)
    .filter((event) => ["TURN_ENDED", "TURN_STARTED"].includes(event.type));
  const sequence = handoffEvents.map((event) => `${event.type}:${event.playerId}`);
  const expected = [
    "TURN_ENDED:player",
    "TURN_STARTED:ai",
    "TURN_ENDED:ai",
    "TURN_STARTED:player"
  ];
  if (expected.some((entry, index) => sequence[index] !== entry)) {
    throw new Error(`${smokeName}: invalid turn handoff sequence ${sequence.join(" -> ")}. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runPhaseProgressionBasicSmoke(ctx) {
  const smokeName = "phase-progression-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "direct");

  const eventStart = (ctx.state.gameEvents || []).length;
  clickSmokeElement(ctx.els.skipAttackBtn, `${smokeName}: enter battle by skipping attacks`);
  await waitForSmoke(
    () => ctx.state.phase === "battle" &&
      (ctx.state.gameEvents || []).slice(eventStart).some((event) =>
        event.type === "PHASE_CHANGED" &&
        event.playerId === "player" &&
        event.from === "main" &&
        event.to === "battle"
      ),
    `${smokeName}: main phase advances to battle through PHASE_CHANGED`
  );

  const phaseEvents = (ctx.state.gameEvents || []).slice(eventStart)
    .filter((event) => event.type === "PHASE_CHANGED");
  if (phaseEvents.length !== 1 || phaseEvents[0].from !== "main" || phaseEvents[0].to !== "battle") {
    throw new Error(`${smokeName}: unexpected phase sequence ${JSON.stringify(phaseEvents)}. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(ctx.els.endTurnBtn, `${smokeName}: end battle phase turn`);
  await waitForSmoke(
    () => (ctx.state.gameEvents || []).slice(eventStart).some((event) =>
      event.type === "TURN_ENDED" &&
      event.playerId === "player" &&
      event.nextPlayerId === "ai" &&
      event.fromPhase === "battle"
    ),
    `${smokeName}: battle phase ends through TURN_ENDED`
  );

  const events = (ctx.state.gameEvents || []).slice(eventStart);
  if (events.some((event) => event.type === "PHASE_CHANGED" && event.to === "end")) {
    throw new Error(`${smokeName}: end phase must not be entered through PHASE_CHANGED. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runPhaseWindowOwnershipBasicSmoke(ctx) {
  const smokeName = "phase-window-ownership-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "direct");

  const openingEvents = ctx.state.gameEvents || [];
  const mainPhaseIndex = openingEvents.findIndex((event) =>
    event.type === "PHASE_CHANGED" &&
    event.playerId === "player" &&
    event.from === "draw" &&
    event.to === "main"
  );
  const mainWindowIndex = openingEvents.findIndex((event, index) =>
    index > mainPhaseIndex &&
    event.type === "ACTION_WINDOW_OPENED" &&
    event.playerId === "player" &&
    event.window === "main" &&
    event.reason === "phase-entered:main"
  );
  if (mainPhaseIndex < 0 || mainWindowIndex !== mainPhaseIndex + 1 || ctx.state.actionWindow !== "main") {
    throw new Error(`${smokeName}: draw-to-main transition left an engine action-window gap. ${smokeDebug(ctx)}`);
  }

  const eventStart = openingEvents.length;
  clickSmokeElement(ctx.els.skipAttackBtn, `${smokeName}: enter battle phase`);
  await waitForSmoke(
    () => ctx.state.phase === "battle" && ctx.state.actionWindow === "battle",
    `${smokeName}: engine opens battle window with phase transition`
  );

  const battleEvents = (ctx.state.gameEvents || []).slice(eventStart);
  const battlePhaseIndex = battleEvents.findIndex((event) =>
    event.type === "PHASE_CHANGED" &&
    event.playerId === "player" &&
    event.from === "main" &&
    event.to === "battle"
  );
  const battleWindowIndex = battleEvents.findIndex((event, index) =>
    index > battlePhaseIndex &&
    event.type === "ACTION_WINDOW_OPENED" &&
    event.playerId === "player" &&
    event.window === "battle" &&
    event.reason === "phase-entered:battle"
  );
  if (battlePhaseIndex < 0 || battleWindowIndex !== battlePhaseIndex + 1) {
    throw new Error(`${smokeName}: main-to-battle transition did not atomically open its action window. ${smokeDebug(ctx)}`);
  }
  if (ctx.state.ruleCheckIssue) {
    throw new Error(`${smokeName}: rule engine reported ${ctx.state.ruleCheckIssue}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runModeAutoEndSmoke(ctx) {
  setSmokeStatus("running", "mode-auto-end");
  await startSmokeDuel(ctx, "combo");
  ctx.state.player.hand = [];
  ctx.state.player.deck = [];
  ctx.state.player.field.forEach((card) => {
    if (!card) return;
    card.mode = "attack";
    card.used = false;
    card.changedMode = false;
  });
  ctx.state.player.normalSummonsUsed = 1;
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), "选择第一只怪兽");
  await waitForSmoke(
    () => !ctx.els.fieldActionBar.hidden &&
      ctx.els.fieldActionName.textContent === "赤焰幼龙" &&
      ctx.els.duelHint.textContent.includes("已选择「赤焰幼龙」") &&
      ctx.els.playerField.querySelector(".field-selection-chip")?.textContent === "当前操作",
    "选中怪兽后显示统一战场操作栏和持续选择提示"
  );
  if (ctx.els.fieldAttackBtn.disabled || ctx.els.fieldDetailBtn.disabled) {
    throw new Error("可攻击怪兽的快捷攻击和详情操作应当可用");
  }
  clickSmokeElement(ctx.els.duelField, "点击战场空白区域取消怪兽选择");
  await waitForSmoke(
    () => !ctx.state.selected &&
      ctx.els.fieldActionBar.hidden &&
      !ctx.els.playerField.querySelector(".field-selection-chip"),
    "点击战场空白区域后清除选择反馈"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), "再次选择第一只怪兽");
  await waitForSmoke(
    () => !ctx.els.fieldActionBar.hidden && ctx.els.fieldActionName.textContent === "赤焰幼龙",
    "再次选中怪兽后恢复战场操作栏"
  );
  clickSmokeElement(ctx.els.fieldCancelBtn, "通过操作栏取消怪兽选择");
  await waitForSmoke(
    () => !ctx.state.selected && ctx.els.fieldActionBar.hidden,
    "取消后收起统一战场操作栏"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), "重新选择第一只怪兽");
  await waitForSmoke(
    () => !ctx.els.fieldModeBtn.hidden && !ctx.els.fieldModeBtn.disabled && ctx.els.fieldModeLabel.textContent === "转守备",
    "选中怪兽后场上显示转守备快捷按钮"
  );
  clickSmokeElement(ctx.els.fieldAttackBtn, "点击攻击但暂不选择目标");
  await waitForSmoke(
    () => ctx.state.attackIntentIndex === 0 &&
      ctx.state.phase === "main" &&
      ctx.state.actionWindow === "main" &&
      !ctx.els.fieldModeBtn.disabled &&
      ctx.els.fieldAttackBtn.getAttribute("aria-pressed") === "true" &&
      ctx.els.fieldCancelLabel.textContent === "取消攻击",
    "准备攻击只进入界面选目标态，不提前离开主要阶段"
  );
  clickSmokeElement(ctx.els.fieldCancelBtn, "取消尚未指定目标的攻击");
  await waitForSmoke(
    () => ctx.state.attackIntentIndex === null &&
      ctx.state.selected?.zone === "playerField" &&
      ctx.state.selected.index === 0 &&
      ctx.state.phase === "main" &&
      ctx.state.actionWindow === "main" &&
      !ctx.els.fieldModeBtn.disabled &&
      ctx.els.fieldCancelLabel.textContent === "取消",
    "取消攻击后保留怪兽选择并恢复切换表示"
  );
  clickSmokeElement(ctx.els.fieldModeBtn, "通过场上快捷按钮将第一只怪兽切换守备");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.mode === "defense" &&
      ctx.state.phase === "main" &&
      ctx.state.actionWindow === "main",
    "第一只切守备后仍保留主阶段给第二只怪兽"
  );
  if (!ctx.els.fieldModeBtn.disabled || ctx.els.fieldModeLabel.textContent !== "守备中") {
    throw new Error("已经切换过表示的怪兽应在场上显示禁用的守备状态");
  }
  const firstDefenseCard = fieldCard(ctx.els, "player", "ember-drake");
  const firstDefenseSlot = firstDefenseCard?.closest(".slot");
  const firstDefenseFace = firstDefenseCard?.querySelector(".field-card-face");
  const firstDefenseStats = firstDefenseCard?.querySelector(".stats");
  const firstDefenseCardRect = firstDefenseCard?.getBoundingClientRect();
  const firstDefenseSlotRect = firstDefenseSlot?.getBoundingClientRect();
  const firstDefenseFaceRect = firstDefenseFace?.getBoundingClientRect();
  const firstDefenseStatsRect = firstDefenseStats?.getBoundingClientRect();
  const firstDefenseFaceTransform = firstDefenseFace
    ? window.getComputedStyle(firstDefenseFace).transform
    : "none";
  const firstDefenseFaceMatrix = firstDefenseFaceTransform === "none"
    ? null
    : new DOMMatrixReadOnly(firstDefenseFaceTransform);
  if (!firstDefenseCard || !firstDefenseSlot || !firstDefenseFace || !firstDefenseStats ||
      window.getComputedStyle(firstDefenseCard).transform !== "none" ||
      !firstDefenseFaceMatrix || Math.abs(firstDefenseFaceMatrix.b) < 0.9 ||
      firstDefenseCardRect.left < firstDefenseSlotRect.left ||
      firstDefenseCardRect.right > firstDefenseSlotRect.right ||
      firstDefenseFaceRect.left < firstDefenseSlotRect.left - 1 ||
      firstDefenseFaceRect.right > firstDefenseSlotRect.right + 1 ||
      firstDefenseFaceRect.bottom > firstDefenseStatsRect.top + 1 ||
      firstDefenseStatsRect.width < firstDefenseCardRect.width * 0.7) {
    throw new Error("守备怪兽必须横置卡面，并在自己的召唤区内独立直立显示 ATK/DEF");
  }
  clickSmokeElement(fieldCard(ctx.els, "player", "gale-mage"), "选择第二只怪兽");
  await waitForSmoke(
    () => !ctx.els.fieldModeBtn.hidden && !ctx.els.fieldModeBtn.disabled && ctx.els.fieldModeLabel.textContent === "转守备",
    "切换所选怪兽后刷新场上表示快捷按钮"
  );
  clickSmokeElement(ctx.els.fieldModeBtn, "通过场上快捷按钮将第二只怪兽切换守备");
  await waitForSmoke(
    () => ctx.state.player.field.every((card) => !card || card.mode === "defense") &&
      (ctx.state.actionWindow === "autoEnd" || ctx.state.turn === "ai"),
    "只剩守备怪兽且无可用手牌时自动进入回合结束",
    5000
  );
  if (countGameEvents(ctx.state, "MONSTER_MODE_CHANGED") !== 2) {
    throw new Error("两次切换表示必须分别产生 MONSTER_MODE_CHANGED 事件");
  }
  if (countGameEvents(ctx.state, "AUTO_END_REQUESTED") < 1) {
    throw new Error("自动结束必须先记录 AUTO_END_REQUESTED 事件");
  }
  await waitForSmoke(
    () => ctx.state.turn === "ai" && countGameEvents(ctx.state, "AUTO_END_COMMITTED") >= 1,
    "自动结束必须提交并交给 AI",
    5000
  );
  if (countGameEvents(ctx.state, "TURN_ENDED") < 1) {
    throw new Error("自动结束必须通过 TURN_ENDED 事件交接回合");
  }
  setSmokeStatus("passed", "mode-auto-end");
}

async function runAiModeEventSmoke(ctx) {
  setSmokeStatus("running", "ai-mode-event");
  await startSmokeDuel(ctx, "combo");
  ctx.state.aiStyle = "control";
  ctx.state.ai.hand = ctx.state.ai.hand.filter((card) => card?.id === "solar-knight");
  ctx.state.ai.deck = [];
  const modeEventsBefore = countGameEvents(ctx.state, "MONSTER_MODE_CHANGED");
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.state.ai.field.some((card) =>
      card?.id === "solar-knight" && card.mode === "defense" && card.changedMode
    ) && countGameEvents(ctx.state, "MONSTER_MODE_CHANGED") > modeEventsBefore,
    "控制型 AI 召唤后通过事件切换守备表示",
    18000
  );
  const modeEvent = (ctx.state.gameEvents || []).find((event) =>
    event.type === "MONSTER_MODE_CHANGED" && event.playerId === "ai" && event.to === "defense"
  );
  if (!modeEvent) {
    throw new Error("AI 转守备必须产生玩家为 ai 的 MONSTER_MODE_CHANGED 事件");
  }
  setSmokeStatus("passed", "ai-mode-event");
}

async function runInvalidSpellAutoEndSmoke(ctx) {
  setSmokeStatus("running", "invalid-spell-auto-end");
  await startSmokeDuel(ctx, "combo");
  const eclipse = ctx.state.player.hand.find((card) => card?.id === "eclipse-barrier");
  if (!eclipse) throw new Error("晨昏星界测试卡不存在");
  ctx.state.player.hand = [eclipse];
  ctx.state.player.deck = [];
  ctx.state.player.field.forEach((card) => {
    if (!card) return;
    card.mode = "defense";
    card.used = false;
    card.changedMode = true;
  });
  ctx.state.player.normalSummonsUsed = 1;
  clickSmokeElement(handCard(ctx.els, "eclipse-barrier"), "查看不可发动的晨昏星界");
  await waitForSmoke(
    () => ctx.state.actionWindow === "autoEnd" || ctx.state.turn === "ai",
    "只有不可发动晨昏星界时查看手牌仍应自动结束",
    5000
  );
  setSmokeStatus("passed", "invalid-spell-auto-end");
}

async function runPauseDetailSmoke(ctx) {
  setSmokeStatus("running", "pause-detail");
  await startSmokeDuel(ctx, "direct");
  clickSmokeElement(handCard(ctx.els, "mirror-snare"), "镜光反制手牌");
  clickSmokeElement(ctx.els.playerTraps.querySelector(".trap-slot.empty"), "空陷阱区");
  await waitForSmoke(() => trapCard(ctx.els, "player", "mirror-snare"), "镜光反制盖放");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "选择星轨枪兵");
  await waitForSmoke(() => !ctx.els.modeBtn.disabled, "怪兽切换表示可用");
  clickSmokeElement(trapCard(ctx.els, "player", "mirror-snare"), "查看盖放陷阱");
  await waitForSmoke(() => ctx.els.detailName.textContent === "镜光反制" && ctx.els.modeBtn.disabled, "陷阱详情清掉怪兽选择");
  clickSmokeElement(ctx.els.pauseBtn, "暂停按钮");
  await waitForSmoke(() => ctx.state.paused, "暂停状态");
  clickSmokeElement(handCard(ctx.els, "war-chant"), "暂停时查看战意高扬");
  await waitForSmoke(() => ctx.els.detailName.textContent === "战意高扬", "暂停时手牌详情切换");
  setSmokeStatus("passed", "pause-detail");
}

async function runCardDetailViewerSmoke(ctx) {
  setSmokeStatus("running", "card-detail-viewer");
  await startSmokeDuel(ctx, "direct");
  const card = ctx.state.player.hand.find((entry) => entry?.id === "star-breach") || ctx.state.player.hand.find(Boolean);
  if (!card) throw new Error("card-detail-viewer: player hand should contain a visible card");
  clickSmokeElement(handCard(ctx.els, card.id), "card-detail-viewer: select visible hand card");
  await waitForSmoke(() => !ctx.els.detailBtn.disabled, "card-detail-viewer: unified detail action enabled");
  clickSmokeElement(ctx.els.detailBtn, "card-detail-viewer: open selected card detail");
  await assertCardDetailModal(ctx, card, "card-detail-viewer");
  clickSmokeElement(ctx.els.zoomClose, "card-detail-viewer: close card detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "card-detail-viewer: modal closes");
  if (!ctx.state.started || ctx.state.turn !== "player") {
    throw new Error(`card-detail-viewer: duel should continue after closing detail. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "card-detail-viewer");
}

async function runBattleLogCardDetailSmoke(ctx) {
  setSmokeStatus("running", "battle-log-card-detail");
  await startSmokeDuel(ctx, "counterChain");
  const card = cloneCardById("chain-nullifier");
  if (!card) throw new Error("battle-log-card-detail: chain-nullifier definition should exist");
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") && ctx.els.chainText.textContent.includes("反击阵列") && !ctx.els.chainYes.disabled,
    "battle-log-card-detail: counter-array response window",
    16000
  );
  clickSmokeElement(ctx.els.chainYes, "battle-log-card-detail: activate counter-array");
  await waitForSmoke(() => logCardLink(ctx.els, "chain-nullifier"), "battle-log-card-detail: AI public log card link", 16000);
  clickSmokeElement(logCardLink(ctx.els, "chain-nullifier"), "battle-log-card-detail: open AI log card detail");
  await assertCardDetailModal(ctx, card, "battle-log-card-detail");
  clickSmokeElement(ctx.els.zoomClose, "battle-log-card-detail: close card detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "battle-log-card-detail: modal closes");
  if (!ctx.state.started || ctx.state.gameOver) {
    throw new Error(`battle-log-card-detail: duel should continue after log detail. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "battle-log-card-detail");
}

async function runAiCardRevealConfirmSmoke(ctx) {
  setSmokeStatus("running", "ai-card-reveal-confirm");
  await startSmokeDuel(ctx, "counterChain");
  const card = cloneCardById("chain-nullifier");
  if (!card) throw new Error("ai-card-reveal-confirm: chain-nullifier definition should exist");
  await finishPlayerTurn(ctx);
  await waitForSmoke(
    () => ctx.els.chainModal.classList.contains("show") && ctx.els.chainText.textContent.includes("反击阵列") && !ctx.els.chainYes.disabled,
    "ai-card-reveal-confirm: player response window has priority",
    16000
  );
  clickSmokeElement(ctx.els.chainYes, "ai-card-reveal-confirm: activate counter-array");
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, "chain-nullifier"),
    "ai-card-reveal-confirm: AI reveal panel",
    16000
  );
  if (!ctx.els.aiRevealTitle.textContent.includes(card.name)) {
    throw new Error("ai-card-reveal-confirm: reveal title should include card name");
  }
  if (!ctx.els.aiRevealType.textContent.includes("陷阱")) {
    throw new Error("ai-card-reveal-confirm: reveal type should be trap");
  }
  if (!ctx.els.aiRevealSummary.textContent.includes(card.text)) {
    throw new Error("ai-card-reveal-confirm: reveal summary should include card effect text");
  }
  clickSmokeElement(ctx.els.aiRevealDetail, "ai-card-reveal-confirm: open detail");
  await assertCardDetailModal(ctx, card, "ai-card-reveal-confirm");
  clickSmokeElement(ctx.els.zoomClose, "ai-card-reveal-confirm: close detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "ai-card-reveal-confirm: detail closes");
  clickSmokeElement(ctx.els.aiRevealContinue, "ai-card-reveal-confirm: continue reveal");
  await waitForSmoke(() => !ctx.els.aiRevealModal.classList.contains("show"), "ai-card-reveal-confirm: reveal closes");
  await waitForSmoke(() => logCardLink(ctx.els, "chain-nullifier"), "ai-card-reveal-confirm: public log card link remains", 6000);
  clickSmokeElement(logCardLink(ctx.els, "chain-nullifier"), "ai-card-reveal-confirm: open log card detail");
  await assertCardDetailModal(ctx, card, "ai-card-reveal-confirm log");
  clickSmokeElement(ctx.els.zoomClose, "ai-card-reveal-confirm: close log detail");
  if (!ctx.state.started || ctx.state.gameOver) {
    throw new Error(`ai-card-reveal-confirm: duel should continue after reveal. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "ai-card-reveal-confirm");
}

async function runAiCardRevealQueueSmoke(ctx) {
  setSmokeStatus("running", "ai-card-reveal-queue");
  await startSmokeDuel(ctx, "direct");
  if (typeof ctx.showAiRevealForSmoke !== "function") {
    throw new Error("ai-card-reveal-queue: reveal test hook should exist");
  }
  const first = cloneCardById("chain-nullifier");
  const second = cloneCardById("mirror-snare");
  if (!first || !second) throw new Error("ai-card-reveal-queue: card definitions should exist");

  const firstReveal = ctx.showAiRevealForSmoke({
    actor: "ai",
    public: true,
    cardId: first.id,
    revealKind: "trap",
    type: "trap"
  });
  const secondReveal = ctx.showAiRevealForSmoke({
    actor: "ai",
    public: true,
    cardId: second.id,
    revealKind: "trap",
    type: "trap"
  });

  await waitForSmoke(
    () => aiRevealVisible(ctx.els, first.id) && (ctx.els.aiRevealProgress?.textContent || "").includes("1 / 2"),
    "ai-card-reveal-queue: first queued reveal shows progress",
    6000
  );
  clickSmokeElement(ctx.els.aiRevealContinue, "ai-card-reveal-queue: continue first reveal");
  await waitForSmoke(
    () => aiRevealVisible(ctx.els, second.id) && (ctx.els.aiRevealProgress?.textContent || "").includes("2 / 2"),
    "ai-card-reveal-queue: second queued reveal shows progress",
    6000
  );
  clickSmokeElement(ctx.els.aiRevealDetail, "ai-card-reveal-queue: inspect second reveal");
  await assertCardDetailModal(ctx, second, "ai-card-reveal-queue");
  clickSmokeElement(ctx.els.zoomClose, "ai-card-reveal-queue: close second detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "ai-card-reveal-queue: detail closes");
  clickSmokeElement(ctx.els.aiRevealContinue, "ai-card-reveal-queue: continue second reveal");
  await Promise.all([firstReveal, secondReveal]);
  await waitForSmoke(() => !ctx.els.aiRevealModal.classList.contains("show"), "ai-card-reveal-queue: reveal queue closes");
  if (!ctx.state.started || ctx.state.gameOver) {
    throw new Error(`ai-card-reveal-queue: duel should continue after queued reveals. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "ai-card-reveal-queue");
}

async function runCustomDeckEditorSmoke(ctx) {
  const smokeName = "custom-deck-editor-basic";
  setSmokeStatus("running", smokeName);
  selectScenario(ctx.els, "normal");
  await waitForSmoke(
    () => ctx.els.modal?.classList.contains("show") && !ctx.els.setupPanel?.hidden && !ctx.state.started,
    `${smokeName}: setup screen visible`,
    6000
  );
  if (!ctx.els.deckEditBtn) {
    throw new Error(`${smokeName}: deck editor button should exist`);
  }
  clickSmokeElement(ctx.els.deckEditBtn, `${smokeName}: open deck editor`);
  await waitForSmoke(
    () => ctx.els.deckEditorModal?.classList.contains("show"),
    `${smokeName}: deck editor opens`
  );
  ctx.els.deckEditorPresetSelect.value = "balanced";
  clickSmokeElement(ctx.els.deckEditorImportPreset, `${smokeName}: import balanced preset`);
  const presetSize = deckPresets.balanced.ids.length;
  await waitForSmoke(
    () => (ctx.els.deckEditorSize?.textContent || "").includes(`${presetSize} 张`),
    `${smokeName}: draft imports preset size`
  );
  const removeTarget = ctx.els.deckEditorDraftList?.querySelector('[data-card-id="ember-drake"] .deck-editor-remove');
  if (!removeTarget) {
    throw new Error(`${smokeName}: ember-drake should be removable from the draft`);
  }
  clickSmokeElement(removeTarget, `${smokeName}: remove an ember-drake copy`);
  const addTarget = ctx.els.deckEditorLibrary?.querySelector('[data-card-id="solar-vanguard"] .deck-editor-library-add');
  if (!addTarget) {
    throw new Error(`${smokeName}: solar-vanguard should be available in the library`);
  }
  clickSmokeElement(addTarget, `${smokeName}: add solar-vanguard`);
  ctx.els.deckEditorName.value = "冒烟测试卡组";
  ctx.els.deckEditorName.dispatchEvent(new Event("input", { bubbles: true }));
  await waitForSmoke(() => !ctx.els.deckEditorSave.disabled, `${smokeName}: save becomes enabled`);
  clickSmokeElement(ctx.els.deckEditorSave, `${smokeName}: save deck`);
  await waitForSmoke(
    () => (ctx.els.deckEditorDeckList?.textContent || "").includes("冒烟测试卡组"),
    `${smokeName}: saved deck appears in list`
  );
  if (!String(ctx.state.deckPreset).startsWith("custom:")) {
    throw new Error(`${smokeName}: custom deck should be selected after save: ${ctx.state.deckPreset}`);
  }
  if (ctx.els.deckSelect?.value !== ctx.state.deckPreset) {
    throw new Error(`${smokeName}: deck select should show the saved custom deck`);
  }
  if (!(ctx.els.preDuelDeckCount?.textContent || "").includes(`${presetSize} 张`)) {
    throw new Error(`${smokeName}: pre-duel preview should show the custom deck size`);
  }
  clickSmokeElement(ctx.els.deckEditorClose, `${smokeName}: close deck editor`);
  await waitForSmoke(
    () => !ctx.els.deckEditorModal.classList.contains("show"),
    `${smokeName}: editor closes`
  );
  clickSmokeElement(ctx.els.modalRestart, `${smokeName}: start duel with custom deck`);
  await waitForSmoke(
    () => ctx.state.started && ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.pendingOpeningDraw,
    `${smokeName}: duel reaches player main phase`,
    9000
  );
  const deckIds = cardIds(ctx.state.player.deck);
  const expectedRemaining = presetSize - 6;
  if (deckIds.length !== expectedRemaining) {
    throw new Error(`${smokeName}: player deck should keep ${expectedRemaining} cards after the opening and turn draws, got ${deckIds.length}`);
  }
  if (!deckIds.includes("solar-vanguard")) {
    throw new Error(`${smokeName}: custom deck should include solar-vanguard`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runPreDuelDeckPreviewSmoke(ctx) {
  setSmokeStatus("running", "pre-duel-deck-preview");
  selectScenario(ctx.els, "protagonistComebackChallenge");
  await waitForSmoke(
    () => ctx.els.modal?.classList.contains("show") &&
      !ctx.els.setupPanel?.hidden &&
      !ctx.state.started,
    "pre-duel-deck-preview: setup screen visible",
    6000
  );
  assertScenarioBrief(ctx.els, {
    difficulty: "挑战版",
    objectives: ["先补两张资源", "反击前先用解印射线清掉镜光反制"],
    hints: ["墓地列表从左到右不是推荐顺序", "战斗狂热最好留到反击回合"]
  });
  if (ctx.els.scenarioHints?.hidden) {
    throw new Error("pre-duel-deck-preview: hints should be visible before duel");
  }
  if (!ctx.els.preDuelLp?.textContent.includes("己方 900") || !ctx.els.preDuelLp.textContent.includes("对方 3400")) {
    throw new Error(`pre-duel-deck-preview: LP preview missing expected values: ${ctx.els.preDuelLp?.textContent || ""}`);
  }
  const routeText = ctx.els.preDuelRecommendedList?.textContent || "";
  if (!routeText.includes("醒星回召选择天穹逆星者")) {
    throw new Error("pre-duel-deck-preview: recommended line should be rendered");
  }
  if (!ctx.els.preDuelDeckList?.hidden) {
    throw new Error("pre-duel-deck-preview: deck list should start collapsed");
  }
  clickSmokeElement(ctx.els.preDuelDeckToggle, "pre-duel-deck-preview: expand deck preview");
  await waitForSmoke(() => !ctx.els.preDuelDeckList.hidden, "pre-duel-deck-preview: deck list expands");
  const previewCard = preDuelDeckCard(ctx.els, "dawn-edge");
  const deckCard = preDuelDeckCard(ctx.els, "battle-trance");
  if (!previewCard || !deckCard) {
    throw new Error("pre-duel-deck-preview: own starting cards and deck cards should be visible");
  }
  if (!previewCard.textContent.includes("魔法")) {
    throw new Error("pre-duel-deck-preview: preview card row should show type");
  }
  if (previewCard.textContent.includes("ATK") || previewCard.textContent.includes("DEF")) {
    throw new Error("pre-duel-deck-preview: spell preview should not show monster stats");
  }
  const card = cloneCardById("dawn-edge");
  if (!card) throw new Error("pre-duel-deck-preview: dawn-edge definition should exist");
  clickSmokeElement(previewCard, "pre-duel-deck-preview: open preview card detail");
  await assertCardDetailModal(ctx, card, "pre-duel-deck-preview");
  clickSmokeElement(ctx.els.zoomClose, "pre-duel-deck-preview: close card detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "pre-duel-deck-preview: modal closes");

  clickSmokeElement(ctx.els.modalRestart, "pre-duel-deck-preview: start duel");
  await waitForSmoke(
    () => ctx.state.started && ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.pendingOpeningDraw,
    "pre-duel-deck-preview: duel reaches original player main phase",
    9000
  );
  const expectedHand = ["dawn-edge", "last-spark", "starwake-recall", "last-light-guard", "limit-break-oath"];
  const actualHand = cardIds(ctx.state.player.hand).slice(0, expectedHand.length);
  if (expectedHand.some((id, index) => actualHand[index] !== id)) {
    throw new Error(`pre-duel-deck-preview: initial hand order changed: ${actualHand.join(",")}`);
  }
  if (!handCard(ctx.els, "dawn-edge")) {
    throw new Error("pre-duel-deck-preview: duel hand should render after start");
  }
  setSmokeStatus("passed", "pre-duel-deck-preview");
}

async function runTrioGauntletPreviewBasicSmoke(ctx) {
  const smokeName = "trio-gauntlet-preview-basic";
  setSmokeStatus("running", smokeName);
  selectScenario(ctx.els, "protagonistTrioGauntlet");
  await waitForSmoke(
    () => ctx.els.modal?.classList.contains("show") &&
      !ctx.els.setupPanel?.hidden &&
      !ctx.state.started,
    `${smokeName}: setup screen visible`,
    6000
  );
  const lifePreview = ctx.els.preDuelLp?.textContent || "";
  if (!lifePreview.includes("己方 1500") || !lifePreview.includes("对方 900")) {
    throw new Error(`${smokeName}: first chapter LP preview is inaccurate: ${lifePreview}`);
  }
  if (!ctx.els.preDuelDeckList?.hidden) {
    throw new Error(`${smokeName}: deck list should start collapsed`);
  }
  clickSmokeElement(ctx.els.preDuelDeckToggle, `${smokeName}: expand first chapter deck`);
  await waitForSmoke(() => !ctx.els.preDuelDeckList.hidden, `${smokeName}: deck list expands`);
  const expectedDeckIds = ["trio-chain-veil", "trio-moonbreaker-ray", "last-spark"];
  for (const cardId of expectedDeckIds) {
    const card = preDuelDeckCard(ctx.els, cardId);
    if (!card || card.dataset.zone !== "deck") {
      throw new Error(`${smokeName}: missing authored first chapter deck card ${cardId}`);
    }
  }

  clickSmokeElement(ctx.els.modalRestart, `${smokeName}: start gauntlet`);
  await waitForSmoke(
    () => ctx.state.started &&
      ctx.state.scenarioId === "protagonistTrioOmegaStory" &&
      ctx.state.gauntlet?.chapterIndex === 0 &&
      ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      !ctx.state.pendingOpeningDraw,
    `${smokeName}: first chapter starts`,
    9000
  );
  if (ctx.state.player.lp !== 1500 || ctx.state.ai.lp !== 900) {
    throw new Error(`${smokeName}: preview and first chapter LP diverged: ${ctx.state.player.lp}/${ctx.state.ai.lp}`);
  }
  setSmokeStatus("passed", smokeName);
}

async function runObjectiveHierarchyMobileBasicSmoke(ctx) {
  const smokeName = "objective-hierarchy-mobile-basic";
  const openingGoal = "当前目标：先布防：盖放日冕诱锁";
  const openingTitle = "当前目标：先布防：盖放日冕诱锁，不要急着攻击或消耗终局资源。";
  const defendedGoal = "当前目标：防御准备完成：结束回合";
  const defendedTitle = "当前目标：防御准备完成：结束回合，让日冕诱锁处理曜冕裁决者。";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioGauntlet");
  await waitForSmoke(
    () => ctx.state.scenarioId === "protagonistTrioOmegaStory" &&
      ctx.els.duelHint?.dataset.kind === "objective" &&
      ctx.els.duelHint.textContent === openingGoal,
    `${smokeName}: first chapter exposes the live opening objective`
  );
  if (ctx.els.duelHint.title !== openingTitle) {
    throw new Error(`${smokeName}: opening objective title should preserve its full instruction`);
  }

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}: select solar snare`);
  await waitForSmoke(
    () => ctx.state.selected?.zone === "hand" &&
      document.querySelector("#handCommand")?.dataset.active === "true" &&
      document.querySelector("#handCommandTitle")?.textContent.includes("日冕诱锁"),
    `${smokeName}: selected card owns the tactical command area`
  );
  clickSmokeElement(trapSlot(ctx.els, "player", 0), `${smokeName}: set solar snare in first trap slot`);
  await waitForSmoke(
    () => trapCard(ctx.els, "player", "trio-solar-snare") &&
      ctx.els.duelHint.textContent === defendedGoal &&
      ctx.els.duelHint.title === defendedTitle,
    `${smokeName}: setting solar snare advances the live objective`
  );
  setSmokeStatus("passed", smokeName);
}

async function runPreDuelDeckScrollPreviewSmoke(ctx) {
  setSmokeStatus("running", "pre-duel-deck-scroll-preview");
  selectScenario(ctx.els, "normal");
  await waitForSmoke(
    () => ctx.els.modal?.classList.contains("show") &&
      !ctx.els.setupPanel?.hidden &&
      !ctx.state.started,
    "pre-duel-deck-scroll-preview: setup screen visible",
    6000
  );
  if (!ctx.els.preDuelDeckCount?.textContent.includes("种 /")) {
    throw new Error(`pre-duel-deck-scroll-preview: duplicate count summary missing: ${ctx.els.preDuelDeckCount?.textContent || ""}`);
  }
  if (!ctx.els.preDuelDeckList?.hidden) {
    throw new Error("pre-duel-deck-scroll-preview: deck list should start collapsed");
  }
  clickSmokeElement(ctx.els.preDuelDeckToggle, "pre-duel-deck-scroll-preview: expand deck preview");
  await waitForSmoke(() => !ctx.els.preDuelDeckList.hidden, "pre-duel-deck-scroll-preview: deck list expands");
  const cards = Array.from(ctx.els.preDuelDeckList.querySelectorAll(".pre-duel-card"));
  const ids = cards.map((item) => item.dataset.cardId || "");
  if (ids.length !== new Set(ids).size) {
    throw new Error(`pre-duel-deck-scroll-preview: duplicate card rows remain: ${ids.join(",")}`);
  }
  const duplicateCard = preDuelDeckCard(ctx.els, "ember-drake");
  if (!duplicateCard || duplicateCard.dataset.count !== "2" || !duplicateCard.textContent.includes("x2")) {
    throw new Error("pre-duel-deck-scroll-preview: duplicate card should render once with x2 count");
  }
  const list = ctx.els.preDuelDeckList;
  if (!(list.scrollWidth > list.clientWidth)) {
    throw new Error("pre-duel-deck-scroll-preview: deck list should be horizontally scrollable");
  }
  const beforeScroll = list.scrollLeft;
  list.scrollLeft = list.scrollWidth;
  await waitForSmoke(() => list.scrollLeft > beforeScroll, "pre-duel-deck-scroll-preview: list scrolls horizontally");
  const card = cloneCardById("ember-drake");
  if (!card) throw new Error("pre-duel-deck-scroll-preview: ember-drake definition should exist");
  clickSmokeElement(duplicateCard, "pre-duel-deck-scroll-preview: open duplicate card detail");
  await assertCardDetailModal(ctx, card, "pre-duel-deck-scroll-preview");
  clickSmokeElement(ctx.els.zoomClose, "pre-duel-deck-scroll-preview: close card detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "pre-duel-deck-scroll-preview: modal closes");
  clickSmokeElement(ctx.els.modalRestart, "pre-duel-deck-scroll-preview: start duel");
  await waitForSmoke(
    () => ctx.state.started && ctx.state.turn === "player" && ctx.state.phase === "main" && !ctx.state.pendingOpeningDraw,
    "pre-duel-deck-scroll-preview: duel starts after preview",
    9000
  );
  setSmokeStatus("passed", "pre-duel-deck-scroll-preview");
}

async function runEquipmentSpellSmoke(ctx) {
  setSmokeStatus("running", "equipment-spell");
  await startSmokeDuel(ctx, "equipment");
  const target = ctx.state.player.field[0];
  if (target?.id !== "star-lancer") throw new Error("equipment scenario missing star-lancer");

  clickSmokeElement(handCard(ctx.els, "blade-sigil"), "Blade Sigil hand card");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade" &&
      fieldCard(ctx.els, "player", "star-lancer")?.classList.contains("targetable"),
    "Blade Sigil target selection",
    6000
  );
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "star-lancer"), "equip Blade Sigil to star-lancer");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.tempAtk === 300 &&
      trapCard(ctx.els, "player", "blade-sigil") &&
      countGameEvents(ctx.state, "CONTINUOUS_EFFECT_REGISTERED") >= 1,
    "Blade Sigil continuous effect registered",
    9000
  );
  assertCardEffectMarker(
    fieldCard(ctx.els, "player", "star-lancer"),
    "锋刃 攻+300",
    "锋刃刻印持续生效：攻击力 +300；来源离场后解除。"
  );

  clickSmokeElement(handCard(ctx.els, "aegis-plate"), "Aegis Plate hand card");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "equipAegis", "Aegis Plate target selection", 6000);
  await selectAndConfirmSpellTarget(ctx, fieldCard(ctx.els, "player", "star-lancer"), "equip Aegis Plate to star-lancer");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.tempDef === 500 &&
      trapCard(ctx.els, "player", "aegis-plate") &&
      countGameEvents(ctx.state, "STAT_MODIFIED") >= 2,
    "Aegis Plate continuous defense boost",
    9000
  );
  assertCardEffectMarker(
    fieldCard(ctx.els, "player", "star-lancer"),
    "庇护 守+500",
    "庇护甲片持续生效：防御力 +500；来源离场后解除。"
  );
  if (ctx.state.player.grave.some((card) => ["blade-sigil", "aegis-plate"].includes(card?.id))) {
    throw new Error("equipment spells should not go to grave after activation");
  }

  const enemyEquip = cloneCardById("blade-sigil");
  if (!enemyEquip) throw new Error("解印射线测试缺少敌方装备卡");
  enemyEquip.ownerId = "ai";
  ctx.state.ai.traps[0] = enemyEquip;
  const enemyTarget = ctx.state.ai.field[0];
  if (!enemyTarget) throw new Error("解印射线测试缺少敌方装备目标");
  enemyTarget.tempAtk = (Number(enemyTarget.tempAtk) || 0) + 300;
  ctx.state.gameEvents.push({
    id: Math.max(1000, (ctx.state.gameEvents.at(-1)?.id || 0) + 1),
    type: "CONTINUOUS_EFFECT_REGISTERED",
    playerId: "ai",
    sourceCardId: enemyEquip.uid,
    effectId: "equipBlade",
    targetCardId: enemyTarget.uid,
    operations: [{ op: "modifyStat", cardId: "$action.targetCardId", stat: "tempAtk", amount: 300 }]
  });
  ctx.render?.();
  await waitForSmoke(() => ctx.els.aiTraps.querySelector('[data-testid="ai-trap-0"] .card'), "敌方魔陷目标入场", 6000);
  assertCardEffectMarker(
    fieldCard(ctx.els, "ai", "iron-guardian"),
    "锋刃 攻+300",
    "锋刃刻印持续生效：攻击力 +300；来源离场后解除。"
  );
  await clickSmokeElementTwiceAcrossRender(
    () => handCard(ctx.els, "dispelling-ray"),
    "连续点击解印射线确认唯一默认目标",
    () => ctx.state.pendingTarget?.effect === "destroySpellTrap" &&
      ctx.state.pendingTarget?.selectedTargetSource === "default" &&
      ctx.state.pendingTarget?.selectedTarget?.owner === "ai" &&
      ctx.state.pendingTarget?.selectedTarget?.zone === "traps" &&
      ctx.els.aiTraps.querySelector('[data-testid="ai-trap-0"]')?.classList.contains("targetable")
  );
  await waitForSmoke(
    () => !ctx.state.ai.traps[0] &&
      ctx.state.ai.grave.some((card) => card?.id === "blade-sigil") &&
      countGameEvents(ctx.state, "CARD_DESTROYED") >= 1 &&
      ctx.state.log.some((entry) => entry.includes("解印射线 破坏了")) &&
      ctx.state.log.some((entry) => entry.includes("持续效果失效")),
    "连续点击解印射线破坏唯一默认敌方魔陷",
    9000
  );
  assertCardEffectMarkerMissing(fieldCard(ctx.els, "ai", "iron-guardian"), "锋刃 攻+300");
  setSmokeStatus("passed", "equipment-spell");
}

async function runSupportTargetReadabilityBasicSmoke(ctx) {
  const smokeName = "support-target-readability-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmega");

  clickSmokeElement(handCard(ctx.els, "trio-solar-snare"), `${smokeName}：选择日冕诱锁`);
  clickSmokeElement(trapSlot(ctx.els, "player", 0), `${smokeName}：盖放日冕诱锁`);
  await waitForSmoke(
    () => trapCard(ctx.els, "player", "trio-solar-snare"),
    `${smokeName}：己方公开魔陷目标入场`
  );

  clickSmokeElement(
    assertHandCardReady(ctx.els, "trio-moonbreaker-ray", `${smokeName}：碎月解幕可发动`),
    `${smokeName}：打开敌方魔陷目标选择`
  );
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "destroySpellTrap",
    `${smokeName}：敌方魔陷目标窗口打开`
  );

  const legalSlot = trapSlot(ctx.els, "ai", 0);
  const wrongOwnerSlot = trapSlot(ctx.els, "player", 0);
  const emptyEnemySlot = trapSlot(ctx.els, "ai", 1);
  if (!legalSlot?.classList.contains("targetable") ||
      legalSlot.dataset.effectTargetState !== "legal" ||
      legalSlot.dataset.effectTargetReason) {
    throw new Error(`${smokeName}：合法敌方魔陷应仅显示可选状态。`);
  }
  if (!wrongOwnerSlot?.classList.contains("support-target-unavailable") ||
      wrongOwnerSlot.dataset.effectTargetState !== "unavailable" ||
      wrongOwnerSlot.dataset.effectTargetLabel !== "不可选：非敌方" ||
      wrongOwnerSlot.dataset.effectTargetReason !== "不能选择该目标：不是敌方魔陷区的卡。") {
    throw new Error(`${smokeName}：己方魔陷缺少明确的非敌方提示。`);
  }
  if (!emptyEnemySlot?.classList.contains("support-target-unavailable") ||
      emptyEnemySlot.dataset.effectTargetLabel !== "不可选：空格" ||
      emptyEnemySlot.dataset.effectTargetReason !== "不能选择该目标：该格为空。") {
    throw new Error(`${smokeName}：敌方空魔陷格缺少明确的空格提示。`);
  }

  const lockedTargetSnapshot = () => JSON.stringify({
    actionWindow: ctx.state.actionWindow,
    actionDeadline: ctx.state.actionDeadline,
    selected: ctx.state.selected,
    pendingTarget: ctx.state.pendingTarget,
    player: {
      hand: ctx.state.player.hand.map(cardSnapshot),
      field: ctx.state.player.field.map(cardSnapshot),
      traps: ctx.state.player.traps.map(cardSnapshot),
      grave: ctx.state.player.grave.map(cardSnapshot)
    },
    ai: {
      hand: ctx.state.ai.hand.map(cardSnapshot),
      field: ctx.state.ai.field.map(cardSnapshot),
      traps: ctx.state.ai.traps.map(cardSnapshot),
      grave: ctx.state.ai.grave.map(cardSnapshot)
    },
    gameEventCount: ctx.state.gameEvents.length,
    logCount: ctx.state.log.length
  });
  const beforeInvalidClicks = lockedTargetSnapshot();

  clickSmokeElement(
    trapCard(ctx.els, "player", "trio-solar-snare"),
    `${smokeName}：点击己方公开魔陷非法目标`
  );
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：不是敌方魔陷区的卡。",
    `${smokeName}：己方魔陷失败原因可见`
  );
  if (ctx.els.cardModal?.classList.contains("show") || lockedTargetSnapshot() !== beforeInvalidClicks) {
    throw new Error(`${smokeName}：己方非法目标点击打开了详情或改变了规则状态。`);
  }

  clickSmokeElement(emptyEnemySlot, `${smokeName}：点击敌方空魔陷格`);
  await waitForSmoke(
    () => ctx.els.toast?.textContent === "不能选择该目标：该格为空。",
    `${smokeName}：空格失败原因可见`
  );
  if (lockedTargetSnapshot() !== beforeInvalidClicks) {
    throw new Error(`${smokeName}：空格非法目标点击改变了规则状态。`);
  }

  await selectSpellTarget(ctx, legalSlot, `${smokeName}：选择月曜帷幕`);
  confirmSpellTarget(ctx, `${smokeName}：确认发动碎月解幕`);
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.ai.grave.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.log.some((entry) =>
        entry.cardId === "trio-moonbreaker-ray" &&
        entry.relatedCardIds?.includes("trio-moon-dominion")
      ),
    `${smokeName}：合法目标完成破坏并写入关联日志`,
    9000
  );
  assertUniqueRuntimeCards(ctx.state, smokeName);

  await waitForSmoke(
    () => logCardLink(ctx.els, "trio-moonbreaker-ray"),
    `${smokeName}：公开日志卡名可点击`
  );
  clickSmokeElement(
    logCardLink(ctx.els, "trio-moonbreaker-ray"),
    `${smokeName}：打开碎月解幕详情`
  );
  await assertCardDetailModal(ctx, cloneCardById("trio-moonbreaker-ray"), smokeName);
  setSmokeStatus("passed", smokeName);
}

async function runHandActionHighlightRecoveryBasicSmoke(ctx) {
  const smokeName = "hand-action-highlight-recovery-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "equipment");

  clickSmokeElement(
    assertHandCardReady(ctx.els, "nova-squire", `${smokeName}：召唤前怪兽高亮`),
    `${smokeName}：选择新星侍从`
  );
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), `${smokeName}：选择第二怪兽区`);
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}：召唤确认可用`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}：确认召唤`);
  await waitForSmoke(
    () => ctx.state.player.field[1]?.id === "nova-squire" && ctx.state.actionWindow === "main",
    `${smokeName}：召唤结算后恢复主要行动窗口`,
    9000
  );
  await waitForSmoke(
    () => {
      const card = handCard(ctx.els, "blade-sigil");
      return card?.classList.contains("action-ready") && !card.classList.contains("action-blocked");
    },
    `${smokeName}：召唤结算后合法魔法恢复高亮`
  );

  clickSmokeElement(
    assertHandCardReady(ctx.els, "blade-sigil", `${smokeName}：锋刃刻印高亮`),
    `${smokeName}：选择锋刃刻印`
  );
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "equipBlade",
    `${smokeName}：锋刃刻印进入目标选择`
  );
  await selectAndConfirmSpellTarget(
    ctx,
    fieldCard(ctx.els, "player", "star-lancer"),
    `${smokeName}：装备锋刃刻印`
  );
  await waitForSmoke(
    () => trapCard(ctx.els, "player", "blade-sigil") && ctx.state.actionWindow === "main",
    `${smokeName}：魔法结算后恢复主要行动窗口`,
    9000
  );
  assertHandCardReady(ctx.els, "aegis-plate", `${smokeName}：魔法结算后下一张合法魔法高亮`);
  setSmokeStatus("passed", smokeName);
}

async function runSpellLegalityHighlightBasicSmoke(ctx) {
  const smokeName = "spell-legality-highlight-basic";
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmega");

  const finalCounter = cloneCardById("trio-final-counter");
  const pawn = cloneCardById("trio-ember-pawn");
  const moonDominion = cloneCardById("trio-moon-dominion");
  if (!finalCounter || !pawn || !moonDominion) {
    throw new Error(`${smokeName}: required finale cards are missing`);
  }
  const continuousId = `continuous:${moonDominion.uid}`;
  ctx.state.player.lp = 1300;
  ctx.state.player.hand = [finalCounter];
  ctx.state.player.field = [pawn, null, null, null, null];
  ctx.state.ai.traps = [moonDominion, null, null, null, null];
  ctx.state.gameEvents = [
    {
      id: continuousId,
      type: "CONTINUOUS_EFFECT_REGISTERED",
      playerId: "ai",
      sourceCardId: moonDominion.uid,
      effectId: "lunarDominion",
      targetCardId: pawn.uid,
      operations: []
    },
    {
      id: continuousId,
      type: "CONTINUOUS_EFFECT_RELEASED",
      playerId: "ai",
      sourceCardId: moonDominion.uid,
      effectId: "lunarDominion",
      targetCardId: pawn.uid,
      reason: "target-left-zone"
    }
  ];
  ctx.render?.();

  clickSmokeElement(
    assertHandCardReady(ctx.els, "trio-final-counter", `${smokeName}: released pressure uses engine highlight`),
    `${smokeName}: select final counter`
  );
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: final counter confirm is enabled`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: activate final counter`);
  await waitForSmoke(
    () => ctx.state.player.grave.some((card) => card?.id === "trio-final-counter") &&
      ctx.state.player.field[0]?.id === "trio-ember-pawn" &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 2100,
    `${smokeName}: legal highlighted spell resolves through dispatch`,
    9000
  );
  setSmokeStatus("passed", smokeName);
}

async function runGameOverEventSmoke(ctx) {
  setSmokeStatus("running", "game-over-event");
  await startSmokeDuel(ctx, "combo");
  const burst = cloneCardById("burst-rune");
  if (!burst) throw new Error("爆裂符文测试卡不存在");
  ctx.state.player.hand = [burst];
  ctx.state.ai.lp = 400;
  ctx.state.ai.shield = 0;
  ctx.render?.();
  await waitForSmoke(() => handCard(ctx.els, "burst-rune"), "致命爆裂符文出现在手牌");
  clickSmokeElement(handCard(ctx.els, "burst-rune"), "致命爆裂符文手牌");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "致命魔法确认可用");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认发动致命爆裂符文");
  await waitForSmoke(
    () => ctx.state.gameOver &&
      ctx.state.gameOverWinner === "player" &&
      ctx.state.actionWindow === "gameOver" &&
      countGameEvents(ctx.state, "GAME_OVER_DECLARED") >= 1,
    "致命伤害通过 GAME_OVER_DECLARED 结算",
    6000
  );
  await waitForSmoke(() => ctx.els.modal.classList.contains("show"), "胜负弹窗显示", 4000);
  setSmokeStatus("passed", "game-over-event");
}

async function runPostDuelLogReviewSmoke(ctx) {
  setSmokeStatus("running", "post-duel-log-review");
  await startSmokeDuel(ctx, "direct");
  const attacker = cloneCardById("star-lancer");
  if (!attacker) throw new Error("post-duel-log-review: star-lancer definition should exist");
  ctx.state.ai.lp = 400;
  ctx.state.ai.shield = 0;
  ctx.render?.();
  clickSmokeElement(handCard(ctx.els, "star-breach"), "post-duel-log-review: select direct attack spell");
  await waitForSmoke(
    () => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled,
    "post-duel-log-review: direct attack spell confirmation enabled"
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, "post-duel-log-review: cast direct attack spell");
  await waitForSmoke(() => ctx.state.player.directAttacks > 0, "post-duel-log-review: direct attack permission granted");
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "post-duel-log-review: select attacker");
  await waitForSmoke(
    () => ctx.els.aiPanel.classList.contains("direct-target"),
    "post-duel-log-review: direct attack target highlighted",
    6000
  );
  clickSmokeElement(ctx.els.aiPanel, "post-duel-log-review: direct attack for game over");
  await waitForSmoke(
    () => ctx.state.gameOver && ctx.state.gameOverWinner === "player",
    "post-duel-log-review: game over declared",
    6000
  );
  await waitForSmoke(
    () => ctx.els.modal.classList.contains("show") && ctx.els.modalReviewLog && !ctx.els.modalReviewLog.hidden,
    "post-duel-log-review: result review action visible",
    4000
  );
  clickSmokeElement(ctx.els.modalReviewLog, "post-duel-log-review: open battle log review");
  await waitForSmoke(
    () => !ctx.els.modal.classList.contains("show") && ctx.state.gameOver && ctx.state.gameOverWinner === "player",
    "post-duel-log-review: result closes without resetting duel",
    4000
  );
  const lockedRulesSnapshot = () => JSON.stringify({
    turn: ctx.state.turn,
    phase: ctx.state.phase,
    actionWindow: ctx.state.actionWindow,
    gameOver: ctx.state.gameOver,
    gameOverWinner: ctx.state.gameOverWinner,
    player: {
      lp: ctx.state.player.lp,
      shield: ctx.state.player.shield,
      hand: cardIds(ctx.state.player.hand),
      deck: cardIds(ctx.state.player.deck),
      field: cardIds(ctx.state.player.field),
      traps: cardIds(ctx.state.player.traps),
      grave: cardIds(ctx.state.player.grave)
    },
    ai: {
      lp: ctx.state.ai.lp,
      shield: ctx.state.ai.shield,
      hand: cardIds(ctx.state.ai.hand),
      deck: cardIds(ctx.state.ai.deck),
      field: cardIds(ctx.state.ai.field),
      traps: cardIds(ctx.state.ai.traps),
      grave: cardIds(ctx.state.ai.grave)
    },
    gameEvents: ctx.state.gameEvents
  });
  const lockedBefore = lockedRulesSnapshot();
  const blockedCard = handCard(ctx.els, "war-chant");
  if (!blockedCard || blockedCard.classList.contains("action-ready")) {
    throw new Error(`post-duel-log-review: finished duel should not highlight hand actions. ${smokeDebug(ctx)}`);
  }
  if (Object.values(ctx.currentPlayerActions()).some(Boolean)) {
    throw new Error(`post-duel-log-review: finished duel should expose no player actions. ${smokeDebug(ctx)}`);
  }
  clickSmokeElement(blockedCard, "post-duel-log-review: inspect hand card after game over");
  await waitForSmoke(
    () => ctx.state.focusedCard?.id === "war-chant",
    "post-duel-log-review: post-game hand click only updates inspection"
  );
  if (lockedRulesSnapshot() !== lockedBefore) {
    throw new Error(`post-duel-log-review: inspecting a hand card after game over changed rules state. ${smokeDebug(ctx)}`);
  }
  await waitForSmoke(() => logCardLink(ctx.els, "star-lancer"), "post-duel-log-review: public battle log link", 6000);
  clickSmokeElement(logCardLink(ctx.els, "star-lancer"), "post-duel-log-review: open log card detail");
  await assertCardDetailModal(ctx, attacker, "post-duel-log-review");
  clickSmokeElement(ctx.els.zoomClose, "post-duel-log-review: close detail");
  await waitForSmoke(() => !ctx.els.cardModal.classList.contains("show"), "post-duel-log-review: detail closes");
  if (!ctx.state.gameOver || ctx.state.gameOverWinner !== "player") {
    throw new Error(`post-duel-log-review: reviewing logs should not reset game over. ${smokeDebug(ctx)}`);
  }
  setSmokeStatus("passed", "post-duel-log-review");
}

export function scheduleBrowserSmoke({ smoke = "", state, els, currentPlayerActions, render = null, showAiRevealForSmoke = null }) {
  if (!smoke) return;
  const smokeRuns = {
    "skip-lock": runSkipLockSmoke,
    "direct-guard": runDirectGuardSmoke,
    "direct-shield-consume": runDirectShieldConsumeSmoke,
    "guard-counter": runGuardCounterSmoke,
    "ai-guard-skip": runAiGuardSkipSmoke,
    "ai-mirror-restraint-basic": runAiMirrorRestraintBasicSmoke,
    "ai-multi-attack-reentry-basic": runAiMultiAttackReentryBasicSmoke,
    "trio-attack-planning-basic": runTrioAttackPlanningBasicSmoke,
    "trio-turn-planning-basic": runTrioTurnPlanningBasicSmoke,
    "trio-trap-planning-basic": runTrioTrapPlanningBasicSmoke,
    "trio-trap-reserve-planning-basic": runTrioTrapReservePlanningBasicSmoke,
    "trio-direct-trap-planning-basic": runTrioDirectTrapPlanningBasicSmoke,
    "trio-chain-lifecycle-basic": runTrioChainLifecycleBasicSmoke,
    "trio-shield-lethal-planning-basic": runTrioShieldLethalPlanningBasicSmoke,
    "trio-after-attack-lethal-planning-basic": runTrioAfterAttackLethalPlanningBasicSmoke,
    "trio-combined-lethal-planning-basic": runTrioCombinedLethalPlanningBasicSmoke,
    "ai-engine-legality-basic": runAiEngineLegalityBasicSmoke,
    "ai-extra-summon-basic": runAiExtraSummonBasicSmoke,
    "response-action-lock-basic": runResponseActionLockBasicSmoke,
    "summon-effects": runSummonEffectsSmoke,
    "summon-fire-buff": runSummonFireBuffSmoke,
    "summon-shield": runSummonShieldSmoke,
    "summon-shadow-burn": runSummonShadowBurnSmoke,
    "summon-trap-response": runSummonTrapResponseSmoke,
    "summon-position-basic": runSummonPositionBasicSmoke,
    "tribute-summon": runTributeSummonSmoke,
    "tribute-summon-basic": runTributeSummonBasicSmoke,
    "tribute-readability-basic": runTributeReadabilityBasicSmoke,
    "tribute-summon-double": runTributeSummonDoubleSmoke,
    "divine-summon": runDivineSummonSmoke,
    "trio-tribute-summon": runTrioTributeSummonSmoke,
    "divine-guard": runDivineGuardSmoke,
    "divine-pierce": runDivinePierceSmoke,
    "divine-pressure": runDivinePressureSmoke,
    "divine-resistance": runDivineResistanceSmoke,
    "divine-break": runDivineBreakSmoke,
    "fusion-summon": runFusionSummonSmoke,
    "fusion-summon-basic": runFusionSummonBasicSmoke,
    "fusion-readability-basic": runFusionReadabilityBasicSmoke,
    "fusion-occlusion-desktop": runFusionOcclusionSmoke,
    "fusion-occlusion-tablet": runFusionOcclusionSmoke,
    "fusion-occlusion-landscape": runFusionOcclusionSmoke,
    "fusion-occlusion-mobile": runFusionOcclusionSmoke,
    "fusion-mixed-materials": runFusionMixedMaterialsSmoke,
    "fusion-result-choice": runFusionResultChoiceSmoke,
    "split-token": runSplitTokenSmoke,
    "token-split-basic": runTokenSplitBasicSmoke,
    "token-readability-basic": runTokenReadabilityBasicSmoke,
    "graveyard-summon-basic": runGraveyardSummonBasicSmoke,
    "grave-target-readability-basic": runGraveTargetReadabilityBasicSmoke,
    "mechanics-regression-basic": runMechanicsRegressionBasicSmoke,
    "duel-layout-density-basic": runDuelLayoutDensityBasicSmoke,
    "mobile-hand-choice-fit-basic": runMobileHandChoiceFitBasicSmoke,
    "landscape-hand-choice-fit-basic": runLandscapeHandChoiceFitBasicSmoke,
    "five-zone-layout": runFiveZoneLayoutSmoke,
    "basic-expansion": runBasicExpansionSmoke,
    "protagonist-comeback-demo": runProtagonistComebackDemoSmoke,
    "protagonist-comeback-challenge": runProtagonistComebackChallengeSmoke,
    "protagonist-comeback-autopilot-fails": runProtagonistComebackAutopilotFailsSmoke,
    "protagonist-ace-evolution-demo": runProtagonistAceEvolutionDemoSmoke,
    "protagonist-ace-protection-demo": runProtagonistAceProtectionDemoSmoke,
    "trio-omega-demo": runTrioOmegaDemoSmoke,
    "lunar-dominion-target-loss-basic": runLunarDominionTargetLossSmoke,
    "lunar-dominion-persistence-basic": runLunarDominionTargetLossSmoke,
    "trio-omega-challenge": runTrioOmegaChallengeSmoke,
    "trio-omega-story-demo": runTrioOmegaStoryDemoSmoke,
    "trio-omega-vow-demo": runTrioOmegaVowDemoSmoke,
    "finale-sunflare-target-lock-basic": runFinaleSunflareTargetLockBasicSmoke,
    "trio-omega-finale-demo": runTrioOmegaFinaleSmoke,
    "trio-omega-finale-rush": runTrioOmegaFinaleRushSmoke,
    "trio-gauntlet-demo": runTrioGauntletSmoke,
    "trio-omega-autopilot-fails": runTrioOmegaAutopilotFailsSmoke,
    "trio-omega-happy-clicker-fails": runTrioOmegaHappyClickerFailsSmoke,
    "trio-omega-full-duel": runTrioOmegaFullDuelSmoke,
    "finale-autopilot": runFinaleAutopilotSmoke,
    "hand-summon-block-probe": runHandSummonBlockProbeSmoke,
    "summon-click-race-probe": runSummonClickRaceProbeSmoke,
    "redirect-prompt": runRedirectPromptSmoke,
    "phantom-switch-redirect": runPhantomSwitchRedirectSmoke,
    "spell-target-default-basic": runSpellTargetDefaultBasicSmoke,
    "spell-multi-target-choice-basic": runSpellMultiTargetChoiceBasicSmoke,
    "spell-target-legality-audit-basic": runSpellTargetLegalityAuditBasicSmoke,
    "grave-card-target-choice-basic": runGraveCardTargetChoiceBasicSmoke,
    "field-target-readability-basic": runFieldTargetReadabilityBasicSmoke,
    "target-window": runTargetWindowSmoke,
    "battle-spell": runBattleSpellSmoke,
    "battle-trap": runBattleTrapSmoke,
    "combo-spell": runComboSpellSmoke,
    "ace-attack": runAceAttackSmoke,
    "double-attack": runDoubleAttackSmoke,
    "battle-trance-ready": runBattleTranceReadySmoke,
    "effect-marker-lifecycle-basic": runEffectMarkerLifecycleBasicSmoke,
    "effect-marker-turn-expiry-basic": runEffectMarkerTurnExpiryBasicSmoke,
    "effect-target-departure-basic": runEffectTargetDepartureBasicSmoke,
    "effect-marker-stacking-basic": runEffectMarkerStackingBasicSmoke,
    "ai-direct-trap": runAiDirectTrapSmoke,
    "trap-choice": runTrapChoiceSmoke,
    "trap-choice-double": runTrapChoiceDoubleSmoke,
    "trap-choice-field-double": runTrapChoiceFieldDoubleSmoke,
    "response-restart": runResponseRestartSmoke,
    "chain-trap-choice": runChainTrapChoiceSmoke,
    "chain-attack-reentry": runChainAttackReentrySmoke,
    "chain-weaken-resolution": runChainWeakenResolutionSmoke,
    "ai-counter-chain": runAiCounterChainSmoke,
    "player-counter-chain": runPlayerCounterChainSmoke,
    "mirror-destroy-no-damage-basic": runMirrorDestroyNoDamageBasicSmoke,
    "battle-flow-regression-basic": runBattleFlowRegressionBasicSmoke,
    "response-window-resume-basic": runResponseWindowResumeBasicSmoke,
    "triple-counter-chain": runTripleCounterChainSmoke,
    "chain-resolution-review": runChainResolutionReviewSmoke,
    "turn-handoff-basic": runTurnHandoffBasicSmoke,
    "phase-progression-basic": runPhaseProgressionBasicSmoke,
    "phase-window-ownership-basic": runPhaseWindowOwnershipBasicSmoke,
    "mode-auto-end": runModeAutoEndSmoke,
    "ai-mode-event": runAiModeEventSmoke,
    "invalid-spell-auto-end": runInvalidSpellAutoEndSmoke,
    "pause-detail": runPauseDetailSmoke,
    "card-detail-viewer": runCardDetailViewerSmoke,
    "battle-log-card-detail": runBattleLogCardDetailSmoke,
    "ai-card-reveal-confirm": runAiCardRevealConfirmSmoke,
    "ai-card-reveal-queue": runAiCardRevealQueueSmoke,
    "custom-deck-editor-basic": runCustomDeckEditorSmoke,
    "pre-duel-deck-preview": runPreDuelDeckPreviewSmoke,
    "trio-gauntlet-preview-basic": runTrioGauntletPreviewBasicSmoke,
    "objective-hierarchy-mobile-basic": runObjectiveHierarchyMobileBasicSmoke,
    "pre-duel-deck-scroll-preview": runPreDuelDeckScrollPreviewSmoke,
    "equipment-spell": runEquipmentSpellSmoke,
    "support-target-readability-basic": runSupportTargetReadabilityBasicSmoke,
    "hand-action-highlight-recovery-basic": runHandActionHighlightRecoveryBasicSmoke,
    "spell-legality-highlight-basic": runSpellLegalityHighlightBasicSmoke,
    "game-over-event": runGameOverEventSmoke,
    "post-duel-log-review": runPostDuelLogReviewSmoke
  };
  const run = smokeRuns[smoke];
  if (!run) {
    setSmokeStatus("failed", `未知 smoke：${smoke}`);
    return;
  }
  window.setTimeout(() => {
    run({ state, els, currentPlayerActions, render, showAiRevealForSmoke }).catch((error) => {
      setSmokeStatus("failed", error.message);
      console.error(error);
    });
  }, 120);
}
