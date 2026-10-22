import { createCardElement } from "./card-renderer.js";
import { renderHandCards } from "./hand-renderer.js";
import { renderMonsterZones, renderSupportZones } from "./field-renderer.js";
import { buildDuelControlsView } from "./control-renderer.js";
import { reconcileHandOrder, shiftHandCard, insertHandCard, sortHandCardsByType } from "./hand-order.js";
import { monsterAssets } from "./data.js";
import { OnlineDuelClient } from "./online-duel-client.js";
import { onlineDisplayCard, onlineCard, onlineCardActions, selectOnlineCard, onlineSelectionModel, onlineBoardState, onlineInteractionView, onlineIdentityView, onlineCardDetailView, onlineAttackIntent } from "./online-duel-ui.js";

const elements = Object.fromEntries([
  "app", "connectionStatus", "lobbyPanel", "playerName", "roomCodeInput", "createRoom", "joinRoom", "lobbyError",
  "roomPanel", "copyRoomCode", "readyButton", "seatGrid", "roomHint", "duelPanel", "aiPanel", "playerPanel",
  "aiTraps", "aiField", "playerField", "playerTraps", "turnLabel", "phaseLabel", "eventLog", "logToggle",
  "handPanel", "hand", "handCount", "handReadyCount", "handGuide", "handSortType", "duelHint", "duelError", "versusStage", "versusPhase",
  "battleButton", "endTurnButton", "rivalDeckCount", "playerDeckCount", "rivalGraveCount", "playerGraveCount", "rivalGrave", "playerGrave",
  "handCommand", "commandSignal", "commandIdle", "commandTitle", "commandHint", "fieldActionBar", "fieldActionName", "fieldActionStatus",
  "fieldAttackBtn", "fieldModeBtn", "fieldDetailBtn", "fieldCancelBtn", "choiceActions", "choiceText", "fieldTargets", "choiceConfirmBtn", "choiceCancelBtn",
  "cardInspector", "inspectorTitle", "inspectorContent", "inspectorClose", "inspectorBackdrop", "viewerIdentity", "viewerName", "viewerSeatLabel"
].map((id) => [id, document.getElementById(id)]));

const STORAGE_KEY = "star-card-duel:online-session:v1";
const client = new OnlineDuelClient();
let actionPending = false;
let selection = null;
let handOrder = [];
let inspectorReturnFocus = null;
const assetForCard = (card) => monsterAssets[card.id] || "";
const EVENT_LABELS = {
  MONSTER_SUMMONED: "怪兽登场", CARD_ACTIVATED: "卡牌发动", CARD_MOVED: "卡牌移动", DAMAGE_DEALT: "生命值受创",
  LIFE_GAINED: "生命值恢复", ATTACK_DECLARED: "攻击宣言", BATTLE_RESOLVED: "战斗结算", MONSTER_DESTROYED: "怪兽破坏",
  TURN_STARTED: "新回合开始", TURN_ENDED: "回合结束", CARDS_DRAWN: "抽取卡牌", TURN_DRAW_RESOLVED: "回合抽卡",
  MODE_CHANGED: "表示形式切换", PHASE_CHANGED: "阶段推进", GAME_OVER_DECLARED: "决斗结束", EFFECT_SKIPPED: "效果条件不足",
  CONTINUOUS_EFFECT_REGISTERED: "持续效果生效"
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function setConnection(state, text) {
  elements.connectionStatus.dataset.state = state;
  elements.connectionStatus.textContent = text;
}
function setError(message = "") {
  (client.view?.status === "playing" ? elements.duelError : elements.lobbyError).textContent = message;
}
function saveSession() {
  if (client.session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client.session));
}
function storedSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}
function seatName(view, id) { return view.seats?.find((seat) => seat.seatId === id)?.name || id; }
function cardName(view, id) { return onlineCard(view, id)?.name || "盖放卡牌"; }

function setEventLogOpen(open) {
  elements.eventLog.hidden = !open;
  elements.logToggle.setAttribute("aria-expanded", String(open));
}

function cancelSelection() {
  if (actionPending || !selection) return false;
  selection = null;
  render(client.view);
  return true;
}

function closeInspector() {
  if (elements.cardInspector.open) elements.cardInspector.close();
}

function showCards(cards, title = "卡牌详情") {
  elements.inspectorTitle.textContent = title;
  elements.inspectorContent.replaceChildren();
  for (const card of cards.filter((entry) => entry && !entry.hidden)) {
    const display = onlineDisplayCard(card);
    const detail = onlineCardDetailView(card);
    const entry = document.createElement("article");
    entry.className = "online-inspector-entry";
    entry.appendChild(createCardElement(document, display, { asset: assetForCard(display), showStateRail: true }));
    const copy = document.createElement("section");
    copy.className = "online-inspector-copy";
    const kicker = document.createElement("span");
    kicker.className = "online-inspector-kicker";
    kicker.textContent = `${detail.typeLabel} · 效果说明`;
    const effect = document.createElement("p");
    effect.className = "online-inspector-effect";
    effect.textContent = detail.effectText;
    const meta = document.createElement("dl");
    meta.className = "online-inspector-meta";
    for (const [label, value] of detail.rows) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      meta.appendChild(row);
    }
    copy.append(kicker, effect, meta);
    entry.appendChild(copy);
    elements.inspectorContent.appendChild(entry);
  }
  if (!elements.inspectorContent.childElementCount) elements.inspectorContent.textContent = "这里还没有卡牌。";
  if (!elements.cardInspector.open) {
    inspectorReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.dataset.onlineOverlay = "detail";
    elements.cardInspector.showModal();
    elements.inspectorClose.focus({ preventScroll: true });
  }
}

function chooseCard(id) {
  if (actionPending) return;
  const view = client.view;
  const model = onlineSelectionModel(view, selection);
  if (model?.targetIds.includes(id)) {
    selection.targetCardId = id;
  } else if (model?.tributeCount && view.players[view.viewerSeatId].monsterZone.some((card) => card?.id === id)) {
    selection.tributeCardIds = selection.tributeCardIds.includes(id)
      ? selection.tributeCardIds.filter((entry) => entry !== id)
      : [...selection.tributeCardIds, id].slice(-model.tributeCount);
    selection.index = null;
  } else if (onlineCardActions(view, id).length || (
    view.turn.playerId === view.viewerSeatId
    && view.players[view.viewerSeatId].monsterZone.some((card) => card?.id === id)
  )) {
    if (selection?.cardId === id) {
      cancelSelection();
      return;
    }
    selection = selectOnlineCard(view, id);
  } else {
    return;
  }
  render(view);
}

function chooseSlot(owner, zone, index) {
  const view = client.view;
  const model = onlineSelectionModel(view, selection);
  const cards = view.players[owner === "player" ? view.viewerSeatId : view.opponentSeatId][zone];
  const card = cards[index];
  const placementZone = selection?.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone";
  if (!actionPending && owner === "player" && model?.stage === "placement" && zone === placementZone && model.slots.includes(index)) {
    selection.index = index;
    render(view);
  } else if (card) chooseCard(card.id);
  else if (selection && !["placement", "material", "target"].includes(model?.stage)) cancelSelection();
}

async function sendAction(action) {
  if (actionPending || !action) return;
  actionPending = true;
  selection = null;
  setError();
  render(client.view);
  try { await client.sendAction(action); }
  catch (error) {
    if (error.code === "STALE_REVISION") await client.sync().catch(() => {});
    setError(error.message);
  } finally { actionPending = false; render(client.view); }
}

async function prepareSelectedAttack() {
  if (actionPending || !selection?.cardId) return;
  const cardId = selection.cardId;
  const model = onlineSelectionModel(client.view, selection);
  const intent = onlineAttackIntent(client.view, model);
  if (!intent.available) {
    setError("这只怪兽当前不能攻击。");
    return;
  }
  if (!intent.requiresBattlePhase) {
    selection = selectOnlineCard(client.view, cardId, "DECLARE_ATTACK");
    render(client.view);
    return;
  }

  actionPending = true;
  setError();
  render(client.view);
  try {
    await client.sendAction({ type: "CHANGE_PHASE", phase: "battle" });
    if (client.view.turn.phase !== "battle") await client.sync();
    const attackSelection = selectOnlineCard(client.view, cardId, "DECLARE_ATTACK");
    const attackModel = onlineSelectionModel(client.view, attackSelection);
    if (!attackModel?.actions.some((action) => action.type === "DECLARE_ATTACK")) {
      selection = selectOnlineCard(client.view, cardId);
      setError("已进入战斗阶段，但这只怪兽当前不能攻击。");
    } else {
      selection = attackSelection;
    }
  } catch (error) {
    if (error.code === "STALE_REVISION") await client.sync().catch(() => {});
    setError(error.message);
    selection = selectOnlineCard(client.view, cardId);
  } finally {
    actionPending = false;
    render(client.view);
  }
}

function renderDuelist(root, view, seatId, rival) {
  const player = view.players[seatId];
  const seat = view.seats.find((entry) => entry.seatId === seatId);
  const active = view.turn.playerId === seatId;
  const identity = onlineIdentityView(view);
  const seatNumber = seatId === "p1" ? "1P" : "2P";
  root.dataset.onlineRole = rival ? "opponent" : "self";
  root.innerHTML = `<div class="duelist-face"><div class="duelist-figure ${rival ? "ai" : "player"}" aria-hidden="true"><img class="duelist-sprite" src="assets/duelist-${rival ? "ai" : "player"}.png" alt=""></div><div><div class="player-title"><span><b class="online-role-badge">${rival ? "对手" : "你"}</b>${escapeHtml(seatName(view, seatId))}</span><span class="life-caption">LP</span></div><div class="life-bar"><div class="life-fill" style="width:${Math.max(0, Math.min(100, player.lp / 40))}%"></div><span class="life-value">${player.lp} / 4000</span></div><div class="skill-line"><b class="online-seat-number">${seatNumber}</b> · ${seat?.connected ? "在线" : "断线重连中"} · 手牌 ${player.handCount}${active ? " · 当前回合" : ""}</div></div></div>`;
  root.setAttribute("aria-label", `${rival ? "对手" : "当前玩家"} ${seatName(view, seatId)}，${seatNumber}${!rival && identity ? `，${identity.seatRole}` : ""}`);
  elements[rival ? "rivalDeckCount" : "playerDeckCount"].textContent = player.deckCount;
  elements[rival ? "rivalGraveCount" : "playerGraveCount"].textContent = player.grave.length;
}

function renderBoard(view, model) {
  const state = onlineBoardState(view, selection);
  for (const owner of ["ai", "player"]) {
    const duelist = state[owner];
    const targeting = model?.stage === "target";
    const attacking = selection?.actionType === "DECLARE_ATTACK";
    const placement = (zone, index) => model?.stage === "placement" ? {
      ok: owner === "player" && zone === (selection.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone") && model.slots.includes(index),
      kind: selection.actionType === "SET_TRAP" ? "trap" : "summon",
      reason: owner === "player" && zone === (selection.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone") && model.slots.includes(index)
        ? model.index === index ? "已选择此落点，确认后出牌" : "点击选择此落点" : "此区域不能放置所选卡牌"
    } : null;
    const isTarget = (card) => Boolean(card && model?.targetIds.includes(card.uid || card.id));
    const click = (zone, index) => chooseSlot(owner, zone, index);
    renderMonsterZones({
      document, root: elements[owner === "ai" ? "aiField" : "playerField"], duelist, owner, state, assetForCard,
      targetableAt: (index) => targeting && !attacking && isTarget(duelist.field[index]),
      attackTargetableAt: (index) => targeting && attacking && isTarget(duelist.field[index]),
      targetSelectedAt: (index) => targeting && duelist.field[index]?.uid === model.targetCardId,
      attackReadinessAt: (index) => owner === "player" && duelist.field[index] ? { ok: !actionPending && onlineCardActions(view, duelist.field[index].uid).some((action) => action.type === "DECLARE_ATTACK"), reason: view.turn.phase === "main" ? "进入战斗阶段后可攻击" : "当前不能攻击" } : null,
      materialTargetAt: (index) => model?.tributeCount ? { ok: owner === "player" && Boolean(duelist.field[index]), reason: "选择召唤祭品" } : null,
      selectedTributeIndexes: duelist.field.flatMap((card, index) => model?.tributeCardIds.includes(card?.uid) ? [index] : []),
      placementTargetAt: (index) => placement("monsterZone", index),
      onSlotClick: (index) => click("monsterZone", index), onCardClick: (index) => click("monsterZone", index)
    });
    renderSupportZones({
      document, root: elements[owner === "ai" ? "aiTraps" : "playerTraps"], duelist, owner, state, assetForCard,
      targetableAt: (index) => targeting && isTarget(duelist.traps[index]),
      targetSelectedAt: (index) => targeting && duelist.traps[index]?.uid === model.targetCardId,
      spellTargetAt: (index) => targeting ? { ok: isTarget(duelist.traps[index]), reason: "请选择高亮目标" } : null,
      placementTargetAt: (index) => placement("spellTrapZone", index),
      onSlotClick: (index) => click("spellTrapZone", index), onCardClick: (_card, index) => click("spellTrapZone", index)
    });
  }
  if (model?.stage === "placement") {
    const root = selection.actionType === "SET_TRAP" ? elements.playerTraps : elements.playerField;
    const slot = root.children[model.index];
    slot?.classList.add("online-placement-selected");
    slot?.setAttribute("aria-pressed", "true");
  }
  const canAct = !actionPending && !view.gameOver && state.turn === "player";
  const hand = reconcileHandOrder(state.player.hand, handOrder);
  handOrder = hand.map((card) => card.uid);
  renderHandCards({
    document, root: elements.hand, cards: hand, assetForCard, started: true, canAct,
    directReorder: true,
    onMoveCard: (card, direction) => { handOrder = shiftHandCard(handOrder, card.uid, direction); render(client.view); },
    onInsertCard: (uid, beforeUid) => { handOrder = insertHandCard(handOrder, uid, beforeUid); render(client.view); },
    selectedZone: "hand", selectedUid: selection?.cardId,
    actionForCard: (card) => {
      const ready = canAct && onlineCardActions(view, card.uid).length > 0;
      return { ok: ready, label: ready ? card.type === "monster" ? "召唤" : card.type === "trap" ? "盖放" : "发动" : "暂不可用", reason: !canAct ? "等待对手行动，可查看卡牌详情" : ready ? "点击选择，再确认出牌" : "当前阶段或场上条件不满足" };
    },
    onCardClick: (card) => chooseCard(card.uid), onCardDetail: (card) => showCards([onlineCard(view, card.uid)], card.name)
  });
  elements.handCount.textContent = `${state.player.handCount} 张`;
  elements.handReadyCount.textContent = `${state.player.hand.filter((card) => onlineCardActions(view, card.uid).length).length} 可操作`;
}

function renderCommands(view, model) {
  const ownTurn = view.turn.playerId === view.viewerSeatId;
  const canAct = ownTurn && !actionPending && !view.gameOver;
  const inHand = view.players[view.viewerSeatId].hand.some((card) => card.id === selection?.cardId);
  const attacks = model?.actions.filter((action) => action.type === "DECLARE_ATTACK") || [];
  const attackIntent = onlineAttackIntent(view, model);
  const mode = model?.actions.find((action) => action.type === "CHANGE_MONSTER_MODE");
  const isAttack = selection?.actionType === "DECLARE_ATTACK";
  const targeting = model?.stage === "target";
  const interaction = onlineInteractionView(model, { inHand, isAttack });
  const selectedField = Boolean(model && !inHand && !selection.actionType);
  const name = model?.card.name || "";
  const confirmLabel = isAttack ? model?.targetIds.length ? "确认攻击" : "直接攻击" : inHand ? model?.card.type === "monster" ? "确认召唤" : model?.card.type === "trap" ? "确认盖放" : "确认发动" : "确认";
  const prompt = model?.stage === "material" ? `${name}：选择祭品 ${model.tributeCardIds.length}/${model.tributeCount}。`
    : model?.stage === "placement" ? `${name}：已选第 ${model.index + 1} 格，可点击其他高亮空位。`
      : targeting ? `${name}：${model.targetCardId ? `已选 ${cardName(view, model.targetCardId)}，确认后${isAttack ? "攻击" : "发动"}。` : "点击场上高亮卡牌选择目标。"}`
        : isAttack ? `${name}：对手场上没有怪兽，可直接攻击。`
          : selectedField ? attackIntent.requiresBattlePhase
            ? `${name}：可进入战斗阶段并发起攻击。`
            : `${name}：选择攻击、切换表示或查看详情。` : `${name}：确认后${confirmLabel.replace("确认", "")}。`;
  const controls = buildDuelControlsView({
    started: true, gameOver: Boolean(view.gameOver), canAct, canUseTurnControls: canAct,
    phase: view.turn.phase, selectedHandReady: inHand && Boolean(model?.action), selectedHandName: name,
    pendingTarget: targeting || model?.stage === "material" || model?.stage === "placement" || isAttack ? {} : null,
    targetSelectionStatus: { complete: Boolean(model?.action), text: prompt, confirmLabel, singleTarget: model?.targetIds.length === 1 },
    confirmLabel, selectedPlayerMonster: selectedField, selectedPlayerMonsterName: name,
    selectedPlayerMonsterMode: model?.card.mode, selectedPlayerMonsterCanAttack: attacks.length > 0,
    selectedPlayerMonsterCanChangeMode: Boolean(mode), focusedCard: model?.card
  });
  elements.fieldActionBar.hidden = !selectedField;
  elements.fieldActionName.textContent = name;
  elements.fieldActionStatus.textContent = attackIntent.requiresBattlePhase ? "点击攻击将自动进入战斗阶段" : controls.fieldAction.status;
  elements.fieldAttackBtn.disabled = !canAct || !attackIntent.available;
  elements.fieldAttackBtn.textContent = `⚔ ${attackIntent.label}`;
  elements.fieldAttackBtn.dataset.phaseJump = String(attackIntent.requiresBattlePhase);
  elements.fieldModeBtn.disabled = !canAct || !mode;
  elements.fieldModeBtn.textContent = controls.modeText;
  elements.choiceActions.hidden = !model || selectedField;
  elements.choiceText.textContent = prompt;
  elements.choiceConfirmBtn.textContent = confirmLabel;
  elements.choiceConfirmBtn.disabled = !canAct || !model?.action;
  elements.choiceCancelBtn.disabled = actionPending;
  elements.choiceActions.classList.toggle("target-choice", interaction.choice.target);
  elements.choiceActions.classList.toggle("single-target", interaction.choice.targetSingle);
  elements.choiceActions.classList.toggle("single-choice", interaction.choice.single);
  elements.choiceActions.classList.toggle("multiple-choice", interaction.choice.multiple);
  elements.choiceActions.classList.toggle("placement-choice", interaction.choice.placement);
  elements.choiceActions.classList.toggle("material-choice", interaction.choice.material);
  elements.choiceActions.dataset.selectionMode = interaction.choice.selectionMode;
  elements.choiceActions.dataset.targetStep = interaction.choice.targetStep;
  elements.commandIdle.hidden = Boolean(model);
  elements.handCommand.dataset.active = String(Boolean(model));
  elements.handCommand.dataset.step = model ? model.action ? "execute" : "locate" : "select";
  elements.commandSignal.textContent = actionPending ? "结算中" : model ? "操作中" : canAct ? "待命" : "等待";
  elements.commandTitle.textContent = view.gameOver ? "决斗结束" : canAct ? "选择一张手牌或场上怪兽" : "对手正在行动";
  elements.commandHint.textContent = view.gameOver ? "可查看卡牌详情与战斗记录。" : canAct ? "选择卡牌，再选择落点或目标。" : "可以查看公开卡牌和墓地。";
  elements.duelHint.textContent = model ? prompt : elements.commandTitle.textContent;
  elements.handGuide.textContent = model ? "确认或取消后继续行动" : "选择卡牌 · 再选择落点或目标";
  elements.battleButton.disabled = !canAct || Boolean(selection) || view.turn.phase !== "main" || !view.legalActions.can.endTurn;
  elements.endTurnButton.disabled = !canAct || Boolean(selection) || !view.legalActions.can.endTurn;
  const directAttackReady = Boolean(isAttack && model?.action && model.targetIds.length === 0);
  elements.aiPanel.classList.toggle("online-direct-target", directAttackReady);
  elements.aiPanel.setAttribute("aria-current", directAttackReady ? "true" : "false");
  elements.fieldTargets.replaceChildren();
  elements.fieldTargets.hidden = !interaction.choice.targetList;
  for (const targetId of model?.targetIds || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-target";
    button.disabled = actionPending;
    button.setAttribute("aria-pressed", String(targetId === model.targetCardId));
    button.textContent = `${cardName(view, targetId)}${targetId === model.targetCardId ? " · 已选择 ✓" : " · 点击选择"}`;
    button.addEventListener("click", () => chooseCard(targetId));
    elements.fieldTargets.appendChild(button);
  }
}

function renderRoom(view) {
  const playing = view.status !== "waiting";
  document.body.dataset.onlineStatus = playing ? "playing" : "waiting";
  elements.lobbyPanel.hidden = true;
  elements.roomPanel.hidden = playing;
  elements.copyRoomCode.hidden = false;
  elements.copyRoomCode.textContent = view.roomCode;
  const identity = onlineIdentityView(view);
  elements.viewerIdentity.hidden = !identity;
  elements.viewerName.textContent = identity?.name || "";
  elements.viewerSeatLabel.textContent = identity ? `${identity.seatNumber} · ${identity.seatRole}` : "";
  elements.viewerIdentity.dataset.seat = identity?.seatId || "";
  document.body.dataset.onlineViewerSeat = identity?.seatId || "none";
  elements.seatGrid.innerHTML = view.seats.map((seat) => `<div class="seat-card" data-ready="${seat.ready}"><strong>${escapeHtml(seat.name)}${seat.seatId === view.viewerSeatId ? "（你）" : ""}</strong><span>${seat.connected ? "在线" : "已断线"} · ${seat.ready ? "已准备" : "未准备"}</span></div>`).join("");
  const self = view.seats.find((seat) => seat.seatId === view.viewerSeatId);
  elements.readyButton.disabled = Boolean(self?.ready);
  elements.readyButton.textContent = self?.ready ? "已准备" : "准备";
  elements.roomHint.textContent = view.seats.length < 2 ? "等待第二名玩家加入，点击上方房间码复制邀请链接。" : "双方准备后自动开局。";
}

function renderEvents(view) {
  elements.eventLog.innerHTML = view.recentEvents.filter((event) => EVENT_LABELS[event.type]).slice(-20).reverse().map((event) => {
    const player = event.playerId ? seatName(view, event.playerId) : "系统";
    const text = event.type === "DAMAGE_DEALT" ? `受到 ${event.amount || event.damage || 0} 点伤害`
      : event.type === "LIFE_GAINED" ? `恢复 ${event.amount || 0} LP` : EVENT_LABELS[event.type];
    const id = event.cardId || event.attackerCardId || event.sourceCardId;
    return `<span>${escapeHtml(player)} · ${escapeHtml(text)}${id ? ` · ${escapeHtml(cardName(view, id))}` : ""}</span>`;
  }).join("") || "<span>等待第一步行动</span>";
}

function render(view) {
  if (!view) return;
  renderRoom(view);
  elements.duelPanel.hidden = view.status === "waiting";
  elements.handPanel.hidden = view.status === "waiting";
  if (view.status === "waiting") return;
  const model = onlineSelectionModel(view, selection);
  if (!model) selection = null;
  const ownTurn = view.turn.playerId === view.viewerSeatId;
  const inHand = view.players[view.viewerSeatId].hand.some((card) => card.id === selection?.cardId);
  const interaction = onlineInteractionView(model, {
    inHand,
    isAttack: selection?.actionType === "DECLARE_ATTACK"
  });
  const phase = { main: "主要阶段", battle: "战斗阶段", end: "结束阶段" }[view.turn.phase] || view.turn.phase;
  document.body.dataset.duelTurn = ownTurn ? "player" : "ai";
  document.body.dataset.duelPhase = view.turn.phase;
  document.body.dataset.duelSelection = interaction.selection;
  document.body.dataset.duelTargeting = interaction.targeting;
  document.body.dataset.duelFocus = interaction.focus;
  elements.app.dataset.revision = view.revision;
  elements.turnLabel.textContent = view.gameOver ? "决斗已结束" : ownTurn ? "你的回合" : "对手回合";
  elements.phaseLabel.textContent = phase;
  elements.versusPhase.textContent = phase;
  elements.versusStage.dataset.actor = ownTurn ? "player" : "ai";
  document.querySelectorAll("[data-phase-step]").forEach((step) => step.classList.toggle("is-current", step.dataset.phaseStep === view.turn.phase));
  renderDuelist(elements.aiPanel, view, view.opponentSeatId, true);
  renderDuelist(elements.playerPanel, view, view.viewerSeatId, false);
  renderBoard(view, model);
  renderCommands(view, model);
  renderEvents(view);
}

client.on("view", render);
client.on("connection", ({ connected }) => setConnection(connected ? "connected" : "error", connected ? "服务已连接" : "连接已断开"));
client.on("error", (error) => setError(error.message));
for (const [id, join] of [["createRoom", false], ["joinRoom", true]]) elements[id].addEventListener("click", async () => {
  try {
    setError();
    const result = join ? await client.joinRoom(elements.roomCodeInput.value, elements.playerName.value) : await client.createRoom(elements.playerName.value);
    saveSession(); setConnection("connected", `身份已保存 · ${seatName(result.view, result.seatId)}`); render(result.view);
  } catch (error) { setError(error.message); }
});
elements.readyButton.addEventListener("click", async () => { try { await client.setReady(true); } catch (error) { setError(error.message); } });
elements.copyRoomCode.addEventListener("click", async () => {
  const url = new URL(window.location.href); url.searchParams.set("room", client.view.roomCode);
  try { await navigator.clipboard.writeText(url.toString()); elements.copyRoomCode.title = "邀请链接已复制"; }
  catch { elements.copyRoomCode.title = `房间码 ${client.view.roomCode}，可手动复制`; }
});
elements.choiceConfirmBtn.addEventListener("click", () => sendAction(onlineSelectionModel(client.view, selection)?.action));
for (const id of ["fieldCancelBtn", "choiceCancelBtn"]) elements[id].addEventListener("click", cancelSelection);
elements.fieldAttackBtn.addEventListener("click", prepareSelectedAttack);
elements.fieldModeBtn.addEventListener("click", () => sendAction(onlineCardActions(client.view, selection?.cardId).find((action) => action.type === "CHANGE_MONSTER_MODE")));
elements.fieldDetailBtn.addEventListener("click", () => { const card = onlineCard(client.view, selection?.cardId); if (card) showCards([card], card.name); });
elements.battleButton.addEventListener("click", () => sendAction({ type: "CHANGE_PHASE", phase: "battle" }));
elements.endTurnButton.addEventListener("click", () => sendAction({ type: "END_TURN" }));
elements.inspectorClose.addEventListener("click", closeInspector);
elements.inspectorBackdrop.addEventListener("click", closeInspector);
elements.cardInspector.addEventListener("click", (event) => { if (event.target === elements.cardInspector) closeInspector(); });
elements.cardInspector.addEventListener("close", () => {
  document.body.dataset.onlineOverlay = "none";
  const returnFocus = inspectorReturnFocus;
  inspectorReturnFocus = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
elements.handSortType.addEventListener("click", () => { handOrder = sortHandCardsByType(onlineBoardState(client.view, selection).player.hand, handOrder).map((card) => card.uid); render(client.view); });
elements.hand.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("button")) return;
  const card = event.target.closest(".card[data-card-uid]");
  if (card) { event.preventDefault(); chooseCard(card.dataset.cardUid); }
});
elements.logToggle.addEventListener("click", () => setEventLogOpen(elements.eventLog.hidden));
elements.duelPanel.addEventListener("click", (event) => {
  if (!elements.eventLog.hidden && !event.target.closest?.("#eventLog, #logToggle")) setEventLogOpen(false);
  if (event.target.closest?.(".slot, .trap-slot, .card, button, a")) return;
  cancelSelection();
});
elements.hand.addEventListener("click", (event) => {
  if (!event.target.closest?.(".card, button")) cancelSelection();
});
for (const [id, own] of [["playerGrave", true], ["rivalGrave", false]]) elements[id].addEventListener("click", () => showCards(client.view.players[own ? client.view.viewerSeatId : client.view.opponentSeatId].grave, own ? "我方墓地" : "对手墓地"));
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.cardInspector.open) cancelSelection(); });
elements.roomCodeInput.value = new URLSearchParams(window.location.search).get("room") || "";
try {
  await client.connect(); setConnection("connected", "服务已连接");
  const session = storedSession();
  if (session) {
    try { const result = await client.resumeRoom(session); saveSession(); setConnection("connected", `身份已恢复 · ${seatName(result.view, result.seatId)}`); render(result.view); }
    catch { sessionStorage.removeItem(STORAGE_KEY); }
  }
} catch (error) { setConnection("error", "服务未启动"); setError(`${error.message}。请先启动对战服务。`); }
