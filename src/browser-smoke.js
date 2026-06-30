import { auditLogEntries } from './log-audit.js';
import { cloneCardById } from './deck.js';
import { projectMachineStateFromEvents } from './game-engine.js';

function cardIds(list = []) {
  return list.map((card) => card?.id || null);
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
      latestLog: state.log[0] || "",
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
      activePlayerMonsters: activeMonsterSnapshots(state),
      controls: {
        skipAttackButtonDisabled: Boolean(els.skipAttackBtn?.disabled),
        endTurnButtonDisabled: Boolean(els.endTurnBtn?.disabled),
        handConfirmButtonDisabled: Boolean(els.handConfirmBtn?.disabled),
        aiPanelDirectTarget: Boolean(els.aiPanel?.classList.contains("direct-target"))
      },
      pendingTarget: state.pendingTarget ? {
        mode: state.pendingTarget.mode,
        cardName: state.pendingTarget.cardName,
        effect: state.pendingTarget.effect
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
    log: (ctx.state.log || []).slice(0, 6),
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

function graveTargetCard(els, cardId) {
  return els.graveTargets?.querySelector(`[data-zone="player-grave"][data-card-id="${cardId}"]`);
}

function trapCard(els, owner, cardId) {
  const root = owner === "player" ? els.playerTraps : els.aiTraps;
  return root.querySelector(`[data-zone="${owner}-trap"][data-card-id="${cardId}"]`);
}

function chainChoiceButton(els, cardId) {
  return els.chainChoices?.querySelector(`[data-card-id="${cardId}"]`);
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
    logs: (ctx.state.log || []).slice(0, 10),
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

export function scheduleBrowserSmoke({ smoke = "", state, els, currentPlayerActions, render = null }) {
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
    "basic-expansion": runBasicExpansionSmoke,
    "protagonist-comeback-demo": runProtagonistComebackDemoSmoke,
    "protagonist-comeback-challenge": runProtagonistComebackChallengeSmoke,
    "protagonist-comeback-autopilot-fails": runProtagonistComebackAutopilotFailsSmoke,
    "protagonist-ace-evolution-demo": runProtagonistAceEvolutionDemoSmoke,
    "protagonist-ace-protection-demo": runProtagonistAceProtectionDemoSmoke,
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
    "equipment-spell": runEquipmentSpellSmoke,
    "game-over-event": runGameOverEventSmoke
  };
  const run = smokeRuns[smoke];
  if (!run) {
    setSmokeStatus("failed", `未知 smoke：${smoke}`);
    return;
  }
  window.setTimeout(() => {
    run({ state, els, currentPlayerActions, render }).catch((error) => {
      setSmokeStatus("failed", error.message);
      console.error(error);
    });
  }, 120);
}
