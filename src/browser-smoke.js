import { auditLogEntries } from './log-audit.js';
import { logEntryMessage } from './battle-log.js';
import { cloneCardById } from './deck.js';
import { projectMachineStateFromEvents } from './game-engine.js';

function cardIds(list = []) {
  return list.map((card) => card?.id || null);
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
        reason: event.reason || null
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
        effect: state.pendingTarget.effect
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

function doubleClickSmokeElement(element, label) {
  if (!element) throw new Error(`找不到测试目标：${label}`);
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
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
  return els.log?.querySelector(`.log-card-link[data-card-id="${cardId}"]`);
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
  if (!ctx.state.log.some((entry) => entry.includes("AI 保留 星轨枪兵"))) {
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
    () => ctx.state.pendingTribute?.cardName && ctx.state.pendingTribute.cost === 1,
    "tribute-summon: pending tribute selection"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-summon: select field tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 &&
      fieldCard(ctx.els, "player", "spark-runner")?.classList.contains("tribute-selected"),
    "tribute-summon: tribute card selected"
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

async function runTributeSummonDoubleSmoke(ctx) {
  setSmokeStatus("running", "tribute-summon-double");
  await startSmokeDuel(ctx, "tributeSummonDouble");
  if (ctx.state.player.field[0]?.id !== "spark-runner" || ctx.state.player.field[1]?.id !== "lumen-gearlet") {
    throw new Error("tribute-summon-double: two material monsters should start on player field");
  }
  clickSmokeElement(handCard(ctx.els, "starfall-colossus"), "tribute-summon-double: select two-tribute monster");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "tribute-summon-double: enter tribute selection");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.cardName && ctx.state.pendingTribute.cost === 2,
    "tribute-summon-double: pending tribute selection"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "tribute-summon-double: select first tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 && ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon-double: first tribute selected but confirm still blocked"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "lumen-gearlet"), "tribute-summon-double: select second tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 2 && !ctx.els.choiceConfirmBtn.disabled,
    "tribute-summon-double: two tributes selected"
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
    () => ctx.state.pendingTribute?.cardName && ctx.state.pendingTribute.cost === 3 && ctx.els.choiceConfirmBtn.disabled,
    "divine-summon: pending three-tribute selection"
  );
  if (!ctx.els.choiceActions?.classList.contains("material-choice")) {
    throw new Error("divine-summon: tribute chooser should avoid covering the field");
  }
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "divine-summon: select first tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 1 && ctx.els.choiceConfirmBtn.disabled,
    "divine-summon: first tribute selected"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "lumen-gearlet"), "divine-summon: select second tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 2 && ctx.els.choiceConfirmBtn.disabled,
    "divine-summon: second tribute selected"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-soul-initiate"), "divine-summon: select third tribute");
  await waitForSmoke(
    () => ctx.state.pendingTribute?.selectedIndexes?.length === 3 && !ctx.els.choiceConfirmBtn.disabled,
    "divine-summon: three tributes selected"
  );
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
  clickSmokeElement(fieldCard(ctx.els, "player", "spark-runner"), "split-token: choose source monster");
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
  clickSmokeElement(fieldCard(ctx.els, "player", "rift-bulwark"), "星魂共鸣选择裂隙壁卫");
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
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "破晓锋印选择天穹逆星者");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 900),
    "破晓锋印加攻结算",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "limit-break-oath"), "临界誓辉手牌");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "lastStandSurge", "临界誓辉目标选择");
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "临界誓辉选择天穹逆星者");
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
  clickSmokeElement(graveTargetCard(ctx.els, "astral-comet-ace"), "挑战：选择天穹逆星者");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace") &&
      ctx.state.player.grave.some((card) => card?.id === "spark-runner") &&
      !ctx.state.player.grave.some((card) => card?.id === "astral-comet-ace"),
    `挑战：醒星回召必须复活王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "dawn-edge"), "挑战：破晓锋印");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "dawnEdge", "挑战：破晓锋印目标选择");
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：破晓锋印选择王牌");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "astral-comet-ace" && (card.tempAtk || 0) >= 900),
    `挑战：破晓锋印应强化王牌。${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "limit-break-oath"), "挑战：临界誓辉");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "lastStandSurge", "挑战：临界誓辉目标选择");
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：临界誓辉选择王牌");
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
  clickSmokeElement(ctx.els.aiTraps.querySelector(".trap-slot:not(.empty)"), "挑战：选择对手盖卡");
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
  clickSmokeElement(fieldCard(ctx.els, "player", "astral-comet-ace"), "挑战：战斗狂热选择王牌");
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
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", "乱点：醒星回召默认目标");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "乱点：默认复活第一个墓地怪兽");
  await waitForSmoke(
    () => ctx.state.player.field.filter((card) => card?.id === "spark-runner").length >= 2 &&
      !ctx.state.player.field.some((card) => card?.id === "astral-comet-ace"),
    `乱点：默认复活应错过王牌。${smokeDebug(ctx)}`,
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
    event?.targetCardId
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

  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), `${smokeName}：选择碎月解幕`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", `${smokeName}：碎月解幕目标选择`);
  clickSmokeElement(ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}：破坏月曜帷幕`);
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "trio-decoy-ward" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0),
    `${smokeName}：月曜帷幕被清除并释放修正`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}：选择余烁归轨`);
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", `${smokeName}：余烁归轨墓地目标`);
  clickSmokeElement(graveTargetCard(ctx.els, "trio-ember-pawn"), `${smokeName}：回召余烁小卫`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn") &&
      !ctx.state.player.grave.some((card) => card?.id === "trio-ember-pawn"),
    `${smokeName}：余烁小卫回场`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}：选择三曜终断`);
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, `${smokeName}：三曜终断确认`);
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}：发动三曜终断`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && card.atk === 600 && (card.tempAtk || 0) >= 2100),
    `${smokeName}：低攻关键怪获得终局突破力`,
    9000
  );

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

  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), "challenge: select moonbreaker");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", "challenge: moonbreaker target selection");
  clickSmokeElement(ctx.els.aiTraps.querySelector(".trap-slot.targetable"), "challenge: destroy moon dominion");
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "trio-decoy-ward" && (card.tempAtk || 0) === 0 && (card.tempDef || 0) === 0),
    `challenge: moon dominion cleared. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  const recallCard = ctx.state.player.hand.find((card) => card?.id === "trio-ember-recall");
  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), "challenge: select ember recall");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "graveRevive", "challenge: grave target selection");
  clickSmokeElement(graveTargetCard(ctx.els, "trio-ember-pawn"), "challenge: revive ember pawn");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn") &&
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

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), "challenge: select final counter");
  await waitForSmoke(() => !ctx.els.choiceActions.hidden && !ctx.els.choiceConfirmBtn.disabled, "challenge: final counter confirm");
  clickSmokeElement(ctx.els.choiceConfirmBtn, "challenge: activate final counter");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn" && card.atk === 600 && (card.tempAtk || 0) >= 2100),
    `challenge: low attacker receives finale resource. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

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

async function runTrioOmegaCasualFailureLine(ctx, smokeName, { continueAfterRival = false } = {}) {
  setSmokeStatus("running", smokeName);
  await startSmokeDuel(ctx, "protagonistTrioOmegaChallenge");
  assertTrioOmegaInitial(ctx, smokeName);

  clickSmokeElement(handCard(ctx.els, "trio-ember-recall"), `${smokeName}: click available revive spell`);
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "graveRevive" && !ctx.els.choiceConfirmBtn.disabled,
    `${smokeName}: default grave target ready`
  );
  clickSmokeElement(ctx.els.choiceConfirmBtn, `${smokeName}: confirm default grave target`);
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-titan") &&
      !ctx.state.player.hand.some((card) => card?.id === "trio-ember-recall"),
    `${smokeName}: wrong revive consumed recall. ${trioOmegaFailureSnapshot(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-final-counter"), `${smokeName}: click final counter too early`);
  await waitForSmoke(
    () => ctx.state.player.hand.some((card) => card?.id === "trio-final-counter") &&
      ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion"),
    `${smokeName}: final counter remains blocked by moon dominion`,
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
      clickSmokeElement(ctx.els.aiTraps.querySelector(".trap-slot.targetable"), `${smokeName}: click obvious trap target`);
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

  clickSmokeElement(handCard(ctx.els, "spark-runner"), "full duel: summon spark-runner");
  clickSmokeElement(fieldSlot(ctx.els, "player", 0), "full duel: player monster slot 1");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "spark-runner") &&
      ctx.state.player.hand.some((card) => card?.id === "trio-ember-pawn"),
    `full duel: spark-runner should draw a low-star resource. ${smokeDebug(ctx)}`,
    9000
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
    () => ctx.els.chainModal.classList.contains("show") &&
      ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.ai.traps.some((card) => card?.id === "mirror-snare") &&
      ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) < 0),
    `full duel: rival should establish moon pressure, protect it, and attack with sun. ${smokeDebug(ctx)}`,
    32000
  );
  clickSmokeElement(ctx.els.chainYes, "full duel: activate prepared solar snare");
  await waitForSmoke(
    () => ctx.state.ai.grave.some((card) => card?.id === "trio-sun-judicator") &&
      ctx.state.player.grave.some((card) => card?.id === "trio-solar-snare") &&
      ctx.state.player.field.some((card) => card?.id === "spark-runner"),
    `full duel: prepared trap should trade for the sun ace. ${smokeDebug(ctx)}`,
    12000
  );

  await waitForSmoke(
    () => ctx.state.turn === "player" &&
      ctx.state.phase === "main" &&
      !ctx.state.aiRunning &&
      handCard(ctx.els, "trio-final-counter"),
    `full duel: player should cross the rival turn and draw later resources. ${smokeDebug(ctx)}`,
    34000
  );
  if (!(ctx.state.gameEvents || []).some((event) => event.type === "TURN_STARTED" && event.playerId === "ai")) {
    throw new Error(`trio-omega-full-duel: route must cross a rival turn. ${smokeDebug(ctx)}`);
  }

  clickSmokeElement(handCard(ctx.els, "trio-moonbreaker-ray"), "full duel: select moonbreaker");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "destroySpellTrap", "full duel: moonbreaker target window");
  clickSmokeElement(ctx.els.aiTraps.querySelector(".trap-slot.targetable"), "full duel: clear moon dominion");
  await waitForSmoke(
    () => !ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") &&
      ctx.state.player.field.some((card) => card?.id === "spark-runner" && (card.tempAtk || 0) === 0) &&
      (ctx.state.gameEvents || []).some((event) => event.type === "CONTINUOUS_EFFECT_RELEASED" && event.effectId === "lunarDominion"),
    `full duel: moon pressure should clear and release the modifier. ${smokeDebug(ctx)}`,
    9000
  );

  clickSmokeElement(handCard(ctx.els, "trio-ember-pawn"), "full duel: summon preserved low-star pawn");
  clickSmokeElement(fieldSlot(ctx.els, "player", 1), "full duel: player monster slot 2");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "trio-ember-pawn"),
    `full duel: low-star resource should reach the field after setup. ${smokeDebug(ctx)}`,
    9000
  );

  const events = ctx.state.gameEvents || [];
  const snareSetIndex = events.findIndex((event) => event.type === "TRAP_SET" && eventReferencesTemplate(event, "trio-solar-snare"));
  const sunDestroyedIndex = events.findIndex((event) => event.type === "CARD_DESTROYED" && eventReferencesTemplate(event, "trio-sun-judicator"));
  const moonClearedIndex = events.findIndex((event) => event.type === "CONTINUOUS_EFFECT_RELEASED" && event.effectId === "lunarDominion");
  const pawnSummonedIndex = events.findIndex((event) => event.type === "MONSTER_SUMMONED" && eventReferencesTemplate(event, "trio-ember-pawn"));
  if (snareSetIndex < 0 || sunDestroyedIndex < 0 || moonClearedIndex < 0 || pawnSummonedIndex < 0 ||
      !(snareSetIndex < sunDestroyedIndex && sunDestroyedIndex < moonClearedIndex && moonClearedIndex < pawnSummonedIndex)) {
    throw new Error(`trio-omega-full-duel: setup, defense exchange, pressure clear, and low-star follow-up must happen in order. ${smokeDebug(ctx)}`);
  }
  const strongestPlayerAtk = Math.max(...ctx.state.player.field.filter(Boolean).map((card) => (card.atk || 0) + (card.tempAtk || 0)));
  if (ctx.state.gameOver ||
      ctx.state.ai.field.some((card) => card?.id === "trio-sun-judicator") ||
      ctx.state.ai.traps.some((card) => card?.id === "trio-moon-dominion") ||
      strongestPlayerAtk >= 3000 ||
      events.some((event) => event.type === "CARD_ACTIVATED" && eventReferencesTemplate(event, "trio-final-counter"))) {
    throw new Error(`trio-omega-full-duel: advantage should come from preserved resources, not high-attack or final-counter shortcut. ${smokeDebug(ctx)}`);
  }

  setSmokeStatus("passed", "trio-omega-full-duel");
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

async function runTargetWindowSmoke(ctx) {
  setSmokeStatus("running", "target-window");
  await startSmokeDuel(ctx, "target");
  clickSmokeElement(handCard(ctx.els, "renewal"), "条件不足的星泉再生手牌");
  await waitForSmoke(() => ctx.els.choiceActions.hidden, "条件不足魔法不显示中央确认");
  clickSmokeElement(handCard(ctx.els, "war-chant"), "战意高扬手牌");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" && ctx.state.actionWindow === "targetSelect",
    "战意高扬目标选择窗口"
  );
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
  if (!ctx.state.log.some((entry) => entry.includes("已取消 战意高扬 的目标选择"))) {
    throw new Error("切换手牌时没有记录取消原目标选择");
  }
  clickSmokeElement(handCard(ctx.els, "war-chant"), "切回战意高扬");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "buff500" && ctx.state.pendingTarget?.cardName === "战意高扬",
    "切回战意高扬目标选择"
  );
  clickSmokeElement(handCard(ctx.els, "war-chant"), "再次点击战意高扬默认发动");
  await waitForSmoke(
    () => !ctx.state.pendingTarget && ctx.state.log.some((entry) => entry.includes("发动魔法卡 战意高扬")),
    "战意高扬二次点击默认发动"
  );
  if (countGameEvents(ctx.state, "STAT_MODIFIED") < 1 || countGameEvents(ctx.state, "CARD_ACTIVATED") < 1) {
    throw new Error("War chant must resolve through engine spell events");
  }
  setSmokeStatus("passed", "target-window");
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
  await waitForSmoke(() => ctx.state.actionWindow === "resolution", "攻击期间关闭玩家行动窗口");
  if (!ctx.els.endTurnBtn.disabled) {
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
  clickSmokeElement(ctx.els.choiceConfirmBtn, "确认召唤熔核巨像");
  await waitForSmoke(
    () => ctx.state.player.field.some((card) => card?.id === "flare-titan") &&
      ctx.els.aceOverlay.classList.contains("show") &&
      fieldCard(ctx.els, "player", "flare-titan"),
    "王牌召唤动画与场上怪兽"
  );
  if (countGameEvents(ctx.state, "MONSTER_SUMMONED") < 1 || countGameEvents(ctx.state, "CARD_MOVED") < 1) {
    throw new Error("Monster summon must be recorded through engine events");
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
  clickSmokeElement(fieldCard(ctx.els, "player", "ember-drake"), "target used strongest monster");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.id === "ember-drake" &&
      ctx.state.player.field[0]?.used === false &&
      (ctx.state.player.field[0]?.tempAtk || 0) >= 200,
    "battle trance readies used target",
    9000
  );
  if (!ctx.state.gameEvents.some((event) => event.type === "MONSTER_READIED")) {
    throw new Error("battle-trance should ready the used monster through a MONSTER_READIED event");
  }
  setSmokeStatus("passed", "battle-trance-ready");
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
  doubleClickSmokeElement(chainChoiceButton(ctx.els, "void-lock"), "双击星界封锁直接发动");
  await waitForSmoke(
    () => !ctx.state.player.traps.some((card) => card?.id === "void-lock") &&
      ctx.state.player.traps.some((card) => card?.id === "mirror-snare"),
    "双击弹窗内陷阱后直接发动选中的陷阱",
    9000
  );
  setSmokeStatus("passed", "trap-choice-double");
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
  clickSmokeElement(ctx.els.modeBtn, "第一只怪兽切换守备");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.mode === "defense" &&
      ctx.state.phase === "main" &&
      ctx.state.actionWindow === "main",
    "第一只切守备后仍保留主阶段给第二只怪兽"
  );
  clickSmokeElement(fieldCard(ctx.els, "player", "gale-mage"), "选择第二只怪兽");
  clickSmokeElement(ctx.els.modeBtn, "第二只怪兽切换守备");
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
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "equip Blade Sigil to star-lancer");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.tempAtk === 300 &&
      trapCard(ctx.els, "player", "blade-sigil") &&
      countGameEvents(ctx.state, "CONTINUOUS_EFFECT_REGISTERED") >= 1,
    "Blade Sigil continuous effect registered",
    9000
  );

  clickSmokeElement(handCard(ctx.els, "aegis-plate"), "Aegis Plate hand card");
  await waitForSmoke(() => ctx.state.pendingTarget?.effect === "equipAegis", "Aegis Plate target selection", 6000);
  clickSmokeElement(fieldCard(ctx.els, "player", "star-lancer"), "equip Aegis Plate to star-lancer");
  await waitForSmoke(
    () => ctx.state.player.field[0]?.tempDef === 500 &&
      trapCard(ctx.els, "player", "aegis-plate") &&
      countGameEvents(ctx.state, "STAT_MODIFIED") >= 2,
    "Aegis Plate continuous defense boost",
    9000
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
  clickSmokeElement(handCard(ctx.els, "dispelling-ray"), "解印射线手牌");
  await waitForSmoke(
    () => ctx.state.pendingTarget?.effect === "destroySpellTrap" &&
      ctx.els.aiTraps.querySelector('[data-testid="ai-trap-0"]')?.classList.contains("targetable"),
    "解印射线选择敌方魔陷目标",
    6000
  );
  clickSmokeElement(handCard(ctx.els, "dispelling-ray"), "再次点击解印射线默认选择唯一魔陷");
  await waitForSmoke(
    () => !ctx.state.ai.traps[0] &&
      ctx.state.ai.grave.some((card) => card?.id === "blade-sigil") &&
      countGameEvents(ctx.state, "CARD_DESTROYED") >= 1 &&
      ctx.state.log.some((entry) => entry.includes("解印射线 破坏了")) &&
      ctx.state.log.some((entry) => entry.includes("装备持续效果失效")),
    "解印射线破坏敌方魔陷",
    9000
  );
  setSmokeStatus("passed", "equipment-spell");
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
    "summon-effects": runSummonEffectsSmoke,
    "summon-fire-buff": runSummonFireBuffSmoke,
    "summon-shield": runSummonShieldSmoke,
    "summon-shadow-burn": runSummonShadowBurnSmoke,
    "summon-trap-response": runSummonTrapResponseSmoke,
    "tribute-summon": runTributeSummonSmoke,
    "tribute-summon-double": runTributeSummonDoubleSmoke,
    "divine-summon": runDivineSummonSmoke,
    "fusion-summon": runFusionSummonSmoke,
    "split-token": runSplitTokenSmoke,
    "five-zone-layout": runFiveZoneLayoutSmoke,
    "basic-expansion": runBasicExpansionSmoke,
    "protagonist-comeback-demo": runProtagonistComebackDemoSmoke,
    "protagonist-comeback-challenge": runProtagonistComebackChallengeSmoke,
    "protagonist-comeback-autopilot-fails": runProtagonistComebackAutopilotFailsSmoke,
    "protagonist-ace-evolution-demo": runProtagonistAceEvolutionDemoSmoke,
    "protagonist-ace-protection-demo": runProtagonistAceProtectionDemoSmoke,
    "trio-omega-demo": runTrioOmegaDemoSmoke,
    "trio-omega-challenge": runTrioOmegaChallengeSmoke,
    "trio-omega-autopilot-fails": runTrioOmegaAutopilotFailsSmoke,
    "trio-omega-happy-clicker-fails": runTrioOmegaHappyClickerFailsSmoke,
    "trio-omega-full-duel": runTrioOmegaFullDuelSmoke,
    "redirect-prompt": runRedirectPromptSmoke,
    "phantom-switch-redirect": runPhantomSwitchRedirectSmoke,
    "target-window": runTargetWindowSmoke,
    "battle-spell": runBattleSpellSmoke,
    "battle-trap": runBattleTrapSmoke,
    "combo-spell": runComboSpellSmoke,
    "ace-attack": runAceAttackSmoke,
    "double-attack": runDoubleAttackSmoke,
    "battle-trance-ready": runBattleTranceReadySmoke,
    "ai-direct-trap": runAiDirectTrapSmoke,
    "trap-choice": runTrapChoiceSmoke,
    "trap-choice-double": runTrapChoiceDoubleSmoke,
    "response-restart": runResponseRestartSmoke,
    "chain-trap-choice": runChainTrapChoiceSmoke,
    "chain-attack-reentry": runChainAttackReentrySmoke,
    "chain-weaken-resolution": runChainWeakenResolutionSmoke,
    "ai-counter-chain": runAiCounterChainSmoke,
    "mode-auto-end": runModeAutoEndSmoke,
    "ai-mode-event": runAiModeEventSmoke,
    "invalid-spell-auto-end": runInvalidSpellAutoEndSmoke,
    "pause-detail": runPauseDetailSmoke,
    "card-detail-viewer": runCardDetailViewerSmoke,
    "battle-log-card-detail": runBattleLogCardDetailSmoke,
    "ai-card-reveal-confirm": runAiCardRevealConfirmSmoke,
    "ai-card-reveal-queue": runAiCardRevealQueueSmoke,
    "pre-duel-deck-preview": runPreDuelDeckPreviewSmoke,
    "pre-duel-deck-scroll-preview": runPreDuelDeckScrollPreviewSmoke,
    "equipment-spell": runEquipmentSpellSmoke,
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
