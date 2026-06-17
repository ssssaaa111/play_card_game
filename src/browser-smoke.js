import { auditLogEntries } from './log-audit.js';
import { cloneCardById } from './deck.js';

function cardIds(list = []) {
  return list.map((card) => card?.id || null);
}

export function createTestSnapshot({ testMode = false, state, els, currentPlayerActions }) {
  return function testSnapshot() {
    const actions = currentPlayerActions();
    return {
      mode: testMode ? "test" : "normal",
      started: state.started,
      paused: state.paused,
      turn: state.turn,
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
    throw new Error(`连锁场景应该在弹窗内显示三张可选陷阱，实际 ${choiceCount} 张`);
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
    "redirect-prompt": runRedirectPromptSmoke,
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
    "chain-weaken-resolution": runChainWeakenResolutionSmoke,
    "ai-counter-chain": runAiCounterChainSmoke,
    "mode-auto-end": runModeAutoEndSmoke,
    "ai-mode-event": runAiModeEventSmoke,
    "invalid-spell-auto-end": runInvalidSpellAutoEndSmoke,
    "pause-detail": runPauseDetailSmoke,
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
