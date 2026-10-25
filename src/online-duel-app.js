import { createCardElement } from "./card-renderer.js";
import { renderHandCards } from "./hand-renderer.js";
import { renderMonsterZones, renderSupportZones } from "./field-renderer.js";
import { buildDuelControlsView } from "./control-renderer.js";
import { renderBattlePreviewElement } from "./battle-preview-renderer.js";
import { createOnlineActionRunner } from "./online-action-runner.js";
import { createDirectActivationTracker } from "./direct-activation.js";
import { createAudioController, createAudioSettings } from "./audio.js";
import { createAnimationController } from "./animation.js";
import { createPhaseStageController, phaseStageCue } from "./phase-stage.js";
import { renderTrapResponsePanel, buildTrapResponseView } from "./trap-response-renderer.js";
import { selectTrapResponse } from "./response-state.js";
import { trapActivationText } from "./traps.js";
import { onlineTrapResponseChoice } from "./online-duel-ui.js";
import { reconcileHandOrder, shiftHandCard, insertHandCard, sortHandCardsByType } from "./hand-order.js";
import { monsterAssets } from "./data.js";
import { OnlineDuelClient } from "./online-duel-client.js";
import { onlineDisplayCard, onlineCard, onlineCardActions, selectOnlineCard, onlineSelectionModel, onlineBoardState, onlineInteractionView, onlineIdentityView, onlineCardDetailView, onlineAttackIntent, latestOnlineActionReceipt, chooseOnlineCard, onlineBattlePreview, onlineEventSound, onlineActionCue } from "./online-duel-ui.js";

const elements = Object.fromEntries([
  "app", "connectionStatus", "lobbyPanel", "playerName", "roomCodeInput", "createRoom", "joinRoom", "lobbyError",
  "roomPanel", "copyRoomCode", "readyButton", "seatGrid", "roomHint", "duelPanel", "aiPanel", "playerPanel",
  "aiTraps", "aiField", "playerField", "playerTraps", "turnLabel", "phaseLabel", "eventLog", "logToggle",
  "handPanel", "hand", "handCount", "handReadyCount", "handReadyJump", "handGuide", "handSortType", "duelHint", "duelError", "versusStage", "versusPhase",
  "battleButton", "endTurnButton", "rivalDeckCount", "playerDeckCount", "rivalGraveCount", "playerGraveCount", "rivalGrave", "playerGrave",
  "handCommand", "commandSignal", "commandIdle", "commandTitle", "commandHint", "fieldActionBar", "fieldActionName", "fieldActionStatus",
  "fieldAttackBtn", "fieldModeBtn", "fieldDetailBtn", "fieldCancelBtn", "choiceActions", "choiceText", "fieldTargets", "choiceConfirmBtn", "choiceCancelBtn",
  "cardInspector", "inspectorTitle", "inspectorContent", "inspectorClose", "inspectorBackdrop", "viewerIdentity", "viewerName", "viewerSeatLabel", "onlineBattlePreview",
  "onlineResponse", "responseTitle", "responseText", "responseChoices", "responseStatus", "responseActivate", "responsePass", "responseError", "soundBtn", "effectLayer", "phaseStage"
].map((id) => [id, document.getElementById(id)]));

const STORAGE_KEY = "star-card-duel:online-session:v1";
const AUDIO_STORAGE_KEY = "star-card-duel:online-audio:v1";
const client = new OnlineDuelClient();
let actionPending = false;
let selection = null;
let trapChoice = null;
let handOrder = [];
let locatedReadyCardId = null;
let inspectorReturnFocus = null;
let observedReceiptRoomCode = null;
let lastObservedEventId = 0;
let actionReceipt = null;
let actionReceiptTimer = null;
let lastResponseSoundId = null;
let pendingActionCue = null;
let lastFieldPositions = new Map();
let cueCleanupTimer = null;
const directActivationTracker = createDirectActivationTracker();
const audioSettings = loadAudioSettings();
const audioController = createAudioController({
  getSettings: () => audioSettings,
  setSettings: (patch) => {
    Object.assign(audioSettings, patch);
    try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ soundOn: audioSettings.soundOn })); } catch {}
    renderSoundButton();
  },
  announce: () => {}
});
const { playSound, toggleSound: toggleAudioSound, unlock: unlockAudio } = audioController;
const animationController = createAnimationController({
  document,
  window,
  els: {
    effectLayer: elements.effectLayer,
    playerField: elements.playerField,
    aiField: elements.aiField,
    playerTraps: elements.playerTraps,
    aiTraps: elements.aiTraps,
    playerPanel: elements.playerPanel,
    aiPanel: elements.aiPanel
  },
  monsterAssets,
  duelistName: (owner) => {
    const view = client.view;
    if (!view) return owner === "player" ? "你" : "对手";
    return seatName(view, owner === "player" ? view.viewerSeatId : view.opponentSeatId);
  },
  totalAtk: (card) => Math.max(0, Number(card?.atk || 0) + Number(card?.tempAtk || 0)),
  battleValue: (card) => card?.mode === "defense"
    ? Math.max(0, Number(card?.def || 0) + Number(card?.tempDef || 0))
    : Math.max(0, Number(card?.atk || 0) + Number(card?.tempAtk || 0)),
  playSound
});
const phaseStageController = createPhaseStageController({ root: elements.phaseStage, window });
const runCommand = createOnlineActionRunner((pending) => {
  actionPending = pending;
  render(client.view);
});
const assetForCard = (card) => monsterAssets[card.id] || "";
const EVENT_LABELS = {
  MONSTER_SUMMONED: "怪兽登场", CARD_ACTIVATED: "卡牌发动", CARD_MOVED: "卡牌移动", DAMAGE_DEALT: "生命值受创",
  LP_HEALED: "生命值恢复", ATTACK_DECLARED: "攻击宣言", BATTLE_RESOLVED: "战斗结算", CARD_DESTROYED: "卡牌破坏",
  TURN_STARTED: "新回合开始", TURN_ENDED: "回合结束", CARDS_DRAWN: "抽取卡牌", TURN_DRAW_RESOLVED: "回合抽卡",
  MONSTER_MODE_CHANGED: "表示形式切换", PHASE_CHANGED: "阶段推进", GAME_OVER_DECLARED: "决斗结束", EFFECT_SKIPPED: "效果条件不足",
  CONTINUOUS_EFFECT_REGISTERED: "持续效果生效", TRAP_SET: "陷阱盖放", ATTACK_CANCELED: "攻击被取消", ATTACK_TARGET_CHANGED: "攻击目标改变"
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function loadAudioSettings() {
  const settings = createAudioSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || "null");
    if (typeof saved?.soundOn === "boolean") settings.soundOn = saved.soundOn;
  } catch {}
  settings.voiceOn = false;
  return settings;
}
function renderSoundButton() {
  if (!elements.soundBtn) return;
  elements.soundBtn.textContent = `音效 ${audioSettings.soundOn ? "开" : "关"}`;
  elements.soundBtn.setAttribute("aria-pressed", String(audioSettings.soundOn));
}
function setConnection(state, text) {
  elements.connectionStatus.dataset.state = state;
  elements.connectionStatus.textContent = text;
}
function setError(message = "") {
  (client.view?.status === "playing" ? elements.duelError : elements.lobbyError).textContent = message;
  elements.responseError.textContent = message;
}
function saveSession() {
  if (client.session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client.session));
}
function storedSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}
function seatName(view, id) { return view.seats?.find((seat) => seat.seatId === id)?.name || id; }
function cardName(view, id) { return onlineCard(view, id)?.name || "盖放卡牌"; }

function clearActionReceipt() {
  actionReceipt = null;
  if (actionReceiptTimer) clearTimeout(actionReceiptTimer);
  actionReceiptTimer = null;
}

function syncActionReceipt(view) {
  const events = view?.recentEvents || [];
  const newestId = events.reduce((max, event) => Math.max(max, Number(event.id) || 0), 0);
  if (observedReceiptRoomCode !== view.roomCode || newestId < lastObservedEventId) {
    observedReceiptRoomCode = view.roomCode;
    lastObservedEventId = newestId;
    clearActionReceipt();
    pendingActionCue = null;
    lastFieldPositions = new Map();
    phaseStageController.reset();
    return;
  }
  const freshEvents = events.filter((event) => Number(event.id) > Number(lastObservedEventId || 0));
  const cue = onlineActionCue(view, freshEvents);
  const turnEvent = [...freshEvents].reverse().find((event) => event.type === "TURN_STARTED");
  const phaseEvent = !cue ? [...freshEvents].reverse().find((event) => event.type === "PHASE_CHANGED") : null;
  const stageEvent = turnEvent || phaseEvent;
  if (stageEvent) {
    const stagePhase = turnEvent ? view.turn?.phase || turnEvent.phase || "main" : phaseEvent.to || view.turn?.phase;
    phaseStageController.enqueue(phaseStageCue(stagePhase, ownerForSeat(view, stageEvent.playerId)));
  }
  if (cue) {
    const previousSource = lastFieldPositions.get(cue.cardId);
    const previousTarget = lastFieldPositions.get(cue.targetCardId);
    pendingActionCue = {
      ...cue,
      sourceIndex: previousSource?.index ?? null,
      targetIndex: previousTarget?.index ?? null
    };
  }
  const receipt = latestOnlineActionReceipt(view, lastObservedEventId);
  lastObservedEventId = Math.max(lastObservedEventId, newestId);
  const eventSound = [...freshEvents].reverse().map((event) => onlineEventSound(view, event)).find(Boolean);
  if (eventSound) playSound(eventSound);
  if (!receipt) return;
  clearActionReceipt();
  actionReceipt = receipt;
  actionReceiptTimer = setTimeout(() => {
    actionReceipt = null;
    actionReceiptTimer = null;
    render(client.view);
  }, receipt.kind === "battle-result" ? 3800 : 2800);
}

function ownerForSeat(view, seatId) {
  return seatId === view.viewerSeatId ? "player" : "ai";
}

function cardFieldIndex(view, cardId, owner) {
  if (!cardId) return -1;
  const seatId = owner === "player" ? view.viewerSeatId : view.opponentSeatId;
  return view.players[seatId].monsterZone.findIndex((card) => card?.id === cardId);
}

function cardAnchor(view, cardId, owner) {
  if (!cardId) return null;
  const seatId = owner === "player" ? view.viewerSeatId : view.opponentSeatId;
  const player = view.players[seatId];
  const monsterIndex = player.monsterZone.findIndex((card) => card?.id === cardId);
  if (monsterIndex >= 0) return animationController.fieldElement(owner, monsterIndex);
  const trapIndex = player.spellTrapZone.findIndex((card) => card?.id === cardId);
  if (trapIndex >= 0) return animationController.trapElement(owner, trapIndex);
  return null;
}

function pulseActionAnchor(anchor, kind) {
  if (!anchor) return;
  anchor.classList.remove("online-action-focus", "summon", "spell", "trap", "effect", "set", "mode");
  void anchor.offsetWidth;
  anchor.classList.add("online-action-focus", kind);
  window.setTimeout(() => anchor.classList.remove("online-action-focus", "summon", "spell", "trap", "effect", "set", "mode"), 1100);
}

function captureFieldPositions(view) {
  const positions = new Map();
  for (const seatId of [view.viewerSeatId, view.opponentSeatId]) {
    view.players[seatId].monsterZone.forEach((card, index) => {
      if (card?.id) positions.set(card.id, { owner: ownerForSeat(view, seatId), index });
    });
  }
  lastFieldPositions = positions;
}

function playPendingActionCue(view) {
  const cue = pendingActionCue;
  pendingActionCue = null;
  if (!cue || !elements.effectLayer) {
    captureFieldPositions(view);
    return;
  }

  const currentSourceIndex = cardFieldIndex(view, cue.cardId, cue.actor);
  const sourceIndex = currentSourceIndex >= 0 ? currentSourceIndex : cue.sourceIndex;
  const currentTargetIndex = cardFieldIndex(view, cue.targetCardId, cue.rival);
  const targetIndex = currentTargetIndex >= 0 ? currentTargetIndex : cue.targetIndex;
  const source = sourceIndex >= 0 ? animationController.fieldElement(cue.actor, sourceIndex) : animationController.panelElement(cue.actor);
  const target = targetIndex >= 0 ? animationController.fieldElement(cue.rival, targetIndex) : animationController.panelElement(cue.rival);
  elements.effectLayer.dataset.onlineCue = cue.kind;
  elements.effectLayer.dataset.onlineActor = cue.actor;
  if (cueCleanupTimer) clearTimeout(cueCleanupTimer);
  cueCleanupTimer = window.setTimeout(() => {
    if (elements.effectLayer.dataset.onlineCue === cue.kind) {
      delete elements.effectLayer.dataset.onlineCue;
      delete elements.effectLayer.dataset.onlineActor;
    }
    cueCleanupTimer = null;
  }, 1500);

  if (cue.kind === "attack") {
    animationController.playArrow(source, target, "attack", cue.label);
    animationController.playEpicAction(cue.label, "attack", 1050);
    if (sourceIndex >= 0) animationController.playMonsterMotion(cue.actor, sourceIndex, "attack");
    if (cue.resultType) window.setTimeout(() => {
      if (cue.resultType === "ATTACK_CANCELED" || ["guardHold", "guardCounter"].includes(cue.outcome?.kind)) {
        animationController.playGuardShield(target);
      } else {
        animationController.playSlashBurst(source, target);
        const attackerOnlyDestroyed = Boolean(cue.outcome?.destroysAttacker && !cue.outcome?.destroysTarget);
        animationController.playImpactExplosion(attackerOnlyDestroyed ? source : target);
        if (cue.outcome?.destroysAttacker && cue.outcome?.destroysTarget) animationController.playImpactExplosion(source);
        animationController.shakeScreen();
      }
      if (cue.damage) animationController.playLifeDelta(cue.damagePlayerId ? ownerForSeat(view, cue.damagePlayerId) : cue.rival, -cue.damage);
    }, 320);
  } else if (cue.kind === "summon") {
    const anchor = cardAnchor(view, cue.cardId, cue.actor);
    pulseActionAnchor(anchor, "summon");
    animationController.playEpicAction(cue.label, "draw", 1000);
  } else if (["spell", "trap", "effect"].includes(cue.kind)) {
    const card = onlineCard(view, cue.cardId);
    pulseActionAnchor(cardAnchor(view, cue.cardId, cue.actor), cue.kind);
    animationController.playEpicAction(cue.label, cue.kind === "trap" ? "guard" : "draw", 1000);
    if (card) animationController.playCenterCardEffect(card, cue.actor === "player" ? "我方效果发动" : "对手效果发动");
  } else if (cue.kind === "set") {
    const anchor = cue.slotIndex != null ? animationController.trapElement(cue.actor, cue.slotIndex) : animationController.panelElement(cue.actor);
    pulseActionAnchor(anchor, "set");
    animationController.playEpicAction(cue.label, "guard", 900);
  } else if (cue.kind === "mode") {
    const anchor = cardAnchor(view, cue.cardId, cue.actor);
    pulseActionAnchor(anchor, "mode");
    animationController.playEpicAction(cue.label, cue.mode === "defense" ? "guard" : "attack", 900);
    if (sourceIndex >= 0) animationController.playMonsterMotion(cue.actor, sourceIndex, cue.mode === "defense" ? "guard" : "stand");
  } else if (cue.kind === "draw") {
    animationController.playEpicAction(`${cue.label}${cue.count > 1 ? ` ×${cue.count}` : ""}`, "draw", 850);
  } else if (cue.kind === "guard") {
    animationController.playEpicAction(cue.label, "guard", 1000);
    animationController.playGuardShield(target);
  } else if (cue.kind === "impact") {
    animationController.playEpicAction(cue.label, "attack", 900);
    animationController.playImpactExplosion(target);
    animationController.shakeScreen();
  }
  captureFieldPositions(view);
}

function battleImpactForSeat(seatId) {
  if (actionReceipt?.kind !== "battle-result") return "none";
  if (actionReceipt.destroyedSeatIds?.includes(seatId)) return "destroyed";
  if (actionReceipt.damagePlayerId === seatId && actionReceipt.damage > 0) return "damage";
  return actionReceipt.result === "canceled" && actionReceipt.actor === (seatId === client.view?.viewerSeatId ? "self" : "opponent")
    ? "blocked" : "none";
}

function setEventLogOpen(open) {
  elements.eventLog.hidden = !open;
  elements.logToggle.setAttribute("aria-expanded", String(open));
}

function cancelSelection() {
  if (actionPending || !selection) return false;
  selection = null;
  directActivationTracker.reset();
  playSound("click");
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
  if (view.machine?.responseWindow) return;
  const next = chooseOnlineCard(view, selection, id);
  if (next === selection) return;
  clearActionReceipt();
  selection = next;
  playSound("click");
  render(view);
}

function chooseHandCard(id, { directActivate = false } = {}) {
  if (actionPending || client.view?.machine?.responseWindow) return;
  const alreadySelected = selection?.cardId === id;
  if (!alreadySelected) chooseCard(id);
  if (!directActivate) {
    if (alreadySelected) chooseCard(id);
    return;
  }
  const model = onlineSelectionModel(client.view, selection);
  if (model?.action) sendAction(model.action);
}

function chooseSlot(owner, zone, index, { directActivate = false } = {}) {
  const view = client.view;
  const model = onlineSelectionModel(view, selection);
  const cards = view.players[owner === "player" ? view.viewerSeatId : view.opponentSeatId][zone];
  const card = cards[index];
  const placementZone = selection?.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone";
  const cardIsCandidate = Boolean(card && (
    model?.targetIds.includes(card.id)
    || (owner === "player" && zone === "monsterZone" && model?.tributeCount)
  ));
  let directCandidate = false;
  if (!actionPending && owner === "player" && model?.stage === "placement" && zone === placementZone && model.slots.includes(index)) {
    clearActionReceipt();
    selection.index = index;
    directCandidate = true;
    playSound("click");
    render(view);
  } else if (card) {
    directCandidate = cardIsCandidate;
    const keepChosenTribute = directActivate && model?.tributeCardIds.includes(card.id);
    if (!keepChosenTribute) chooseCard(card.id);
  }
  else if (selection && !["placement", "material", "target"].includes(model?.stage)) cancelSelection();
  if (directActivate && directCandidate) {
    const action = onlineSelectionModel(view, selection)?.action;
    if (action) sendAction(action);
  }
}

async function sendAction(action) {
  if (actionPending || !action) return;
  clearActionReceipt();
  selection = null;
  setError();
  return runCommand(async () => {
    try { await client.sendAction(action); }
    catch (error) {
      if (error.code === "STALE_REVISION") await client.sync().catch(() => {});
      setError(error.message);
    }
  });
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
    playSound("click");
    render(client.view);
    return;
  }

  setError();
  return runCommand(async () => {
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
    }
  });
}

async function quickAttack(cardId) {
  if (actionPending || !cardId) return;
  if (selection?.cardId !== cardId) {
    selection = selectOnlineCard(client.view, cardId);
    render(client.view);
  }
  await prepareSelectedAttack();
  const model = onlineSelectionModel(client.view, selection);
  const attacks = model?.choices?.filter((action) => action.type === "DECLARE_ATTACK") || [];
  if (attacks.length === 1 && model?.action) await sendAction(model.action);
}

function chooseFieldCard(id, { directActivate = false } = {}) {
  if (directActivate) {
    quickAttack(id);
    return;
  }
  chooseCard(id);
}

function renderDuelist(root, view, seatId, rival) {
  const player = view.players[seatId];
  const seat = view.seats.find((entry) => entry.seatId === seatId);
  const active = view.turn.playerId === seatId;
  const identity = onlineIdentityView(view);
  const seatNumber = seatId === "p1" ? "1P" : "2P";
  root.dataset.battleImpact = battleImpactForSeat(seatId);
  root.dataset.onlineRole = rival ? "opponent" : "self";
  root.innerHTML = `<div class="duelist-face"><div class="duelist-figure ${rival ? "ai" : "player"}" aria-hidden="true"><img class="duelist-sprite" src="assets/duelist-${rival ? "ai" : "player"}.png" alt=""></div><div><div class="player-title"><span><b class="online-role-badge">${rival ? "对手" : "你"}</b>${escapeHtml(seatName(view, seatId))}</span><span class="life-caption">LP</span></div><div class="life-bar"><div class="life-fill" style="width:${Math.max(0, Math.min(100, player.lp / 40))}%"></div><span class="life-value">${player.lp} / 4000</span></div><div class="skill-line"><b class="online-seat-number">${seatNumber}</b> · ${seat?.connected ? "在线" : "断线重连中"} · 手牌 ${player.handCount}${active ? " · 当前回合" : ""}</div></div></div>`;
  root.setAttribute("aria-label", `${rival ? "对手" : "当前玩家"} ${seatName(view, seatId)}，${seatNumber}${!rival && identity ? `，${identity.seatRole}` : ""}`);
  elements[rival ? "rivalDeckCount" : "playerDeckCount"].textContent = player.deckCount;
  elements[rival ? "rivalGraveCount" : "playerGraveCount"].textContent = player.grave.length;
}

function renderBoard(view, model) {
  const state = onlineBoardState(view, selection);
  state.pendingTrapChoice = trapChoice;
  for (const owner of ["ai", "player"]) {
    const duelist = state[owner];
    const seatId = owner === "player" ? view.viewerSeatId : view.opponentSeatId;
    elements[owner === "ai" ? "aiField" : "playerField"].dataset.battleImpact = battleImpactForSeat(seatId);
    const targeting = model?.stage === "target";
    const attacking = selection?.actionType === "DECLARE_ATTACK";
    const placement = (zone, index) => model?.stage === "placement" ? {
      ok: owner === "player" && zone === (selection.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone") && model.slots.includes(index),
      kind: selection.actionType === "SET_TRAP" ? "trap" : "summon",
      reason: owner === "player" && zone === (selection.actionType === "SET_TRAP" ? "spellTrapZone" : "monsterZone") && model.slots.includes(index)
        ? model.index === index ? "已选择此落点，确认后出牌" : "点击选择此落点" : "此区域不能放置所选卡牌"
    } : null;
    const isTarget = (card) => Boolean(card && model?.targetIds.includes(card.uid || card.id));
    const click = (zone, index, directActivate = false) => chooseSlot(owner, zone, index, { directActivate });
    const clickSlot = (zone, index) => click(zone, index, directActivationTracker.register(`slot:${owner}:${zone}:${index}`));
    const monsterClick = (index, directActivate = false) => {
      const card = duelist.field[index];
      const cardId = card?.uid || card?.id;
      const candidate = Boolean(cardId && (model?.targetIds.includes(cardId) || (owner === "player" && model?.tributeCount)));
      if (candidate || owner !== "player") click("monsterZone", index, directActivate);
      else if (cardId) chooseFieldCard(cardId, { directActivate });
    };
    const attackReadiness = (card) => {
      if (owner !== "player" || !card) return null;
      const cardId = card.uid || card.id;
      const cardModel = onlineSelectionModel(view, selectOnlineCard(view, cardId));
      const intent = onlineAttackIntent(view, cardModel);
      return {
        ok: !actionPending && intent.available,
        reason: intent.requiresBattlePhase ? "双击将自动进入战斗阶段并攻击" : intent.available ? "双击发起攻击" : "当前不能攻击"
      };
    };
    renderMonsterZones({
      document, root: elements[owner === "ai" ? "aiField" : "playerField"], duelist, owner, state, assetForCard,
      targetableAt: (index) => targeting && !attacking && isTarget(duelist.field[index]),
      attackTargetableAt: (index) => targeting && attacking && isTarget(duelist.field[index]),
      targetSelectedAt: (index) => targeting && duelist.field[index]?.uid === model.targetCardId,
      attackReadinessAt: (index) => attackReadiness(duelist.field[index]),
      materialTargetAt: (index) => model?.tributeCount ? { ok: owner === "player" && Boolean(duelist.field[index]), reason: "选择召唤祭品" } : null,
      selectedTributeIndexes: duelist.field.flatMap((card, index) => model?.tributeCardIds.includes(card?.uid) ? [index] : []),
      placementTargetAt: (index) => placement("monsterZone", index),
      onSlotClick: (index) => clickSlot("monsterZone", index),
      onSlotDoubleClick: (index) => click("monsterZone", index, true),
      onCardClick: (index) => monsterClick(index, directActivationTracker.register(`field:${owner}:${duelist.field[index].uid || duelist.field[index].id}`))
    });
    renderSupportZones({
      document, root: elements[owner === "ai" ? "aiTraps" : "playerTraps"], duelist, owner, state, assetForCard,
      targetableAt: (index) => targeting && isTarget(duelist.traps[index]),
      targetSelectedAt: (index) => targeting && duelist.traps[index]?.uid === model.targetCardId,
      spellTargetAt: (index) => targeting ? { ok: isTarget(duelist.traps[index]), reason: "请选择高亮目标" } : null,
      placementTargetAt: (index) => placement("spellTrapZone", index),
      onSlotClick: (index) => clickSlot("spellTrapZone", index),
      onSlotDoubleClick: (index) => click("spellTrapZone", index, true),
      onCardClick: (_card, index) => click("spellTrapZone", index, directActivationTracker.register(`field:${owner}:spellTrapZone:${index}`)),
      onCardDoubleClick: (_card, index) => click("spellTrapZone", index, true)
    });
  }
  if (model?.stage === "placement") {
    const root = selection.actionType === "SET_TRAP" ? elements.playerTraps : elements.playerField;
    const slot = root.children[model.index];
    slot?.classList.add("online-placement-selected");
    slot?.setAttribute("aria-pressed", "true");
  }
  const canAct = !actionPending && !view.gameOver && !view.machine.responseWindow && state.turn === "player";
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
      return { ok: ready, label: ready ? card.type === "monster" ? "召唤" : card.type === "trap" ? "盖放" : "发动" : "暂不可用", reason: !canAct ? "等待对手行动，可查看卡牌详情" : ready ? `单击选择 · 双击${card.type === "monster" ? "召唤" : card.type === "trap" ? "盖放" : "发动"}` : "当前阶段或场上条件不满足" };
    },
    onCardClick: (card) => chooseHandCard(card.uid, { directActivate: directActivationTracker.register(`hand:${card.uid}`) }),
    onCardDoubleClick: (card) => chooseHandCard(card.uid, { directActivate: true }),
    onCardDetail: (card) => showCards([onlineCard(view, card.uid)], card.name)
  });
  const readyCards = canAct ? state.player.hand.filter((card) => onlineCardActions(view, card.uid).length) : [];
  if (!readyCards.some((card) => card.uid === locatedReadyCardId)) locatedReadyCardId = null;
  elements.handPanel.dataset.readyCount = String(readyCards.length);
  elements.handPanel.dataset.hasSelection = String(Boolean(selection));
  elements.handPanel.dataset.attention = model?.stage || "none";
  elements.handCount.textContent = `${state.player.handCount} 张`;
  elements.handReadyCount.textContent = `${readyCards.length} 可操作`;
  elements.handReadyJump.disabled = readyCards.length === 0;
  elements.handReadyJump.title = readyCards.length ? "定位下一张可操作手牌" : "当前没有可操作手牌";
  elements.handReadyJump.setAttribute("aria-label", elements.handReadyJump.title);
}

function locateNextReadyHandCard() {
  const cards = [...elements.hand.querySelectorAll(".card.action-ready:not(.action-blocked)")];
  if (!cards.length) return;
  const current = cards.findIndex((card) => card.dataset.cardUid === locatedReadyCardId);
  const card = cards[(current + 1) % cards.length];
  locatedReadyCardId = card.dataset.cardUid;
  card.focus({ preventScroll: true });
  card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  card.classList.remove("online-ready-located");
  requestAnimationFrame(() => card.classList.add("online-ready-located"));
}

function renderCommands(view, model) {
  const ownTurn = view.turn.playerId === view.viewerSeatId;
  const canAct = ownTurn && !actionPending && !view.gameOver && !view.machine.responseWindow;
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
  const preview = isAttack ? onlineBattlePreview(view, model) : null;
  elements.onlineBattlePreview.hidden = !preview;
  renderBattlePreviewElement(document, elements.onlineBattlePreview, preview);
  elements.choiceCancelBtn.disabled = actionPending;
  elements.choiceActions.classList.toggle("target-choice", interaction.choice.target);
  elements.choiceActions.classList.toggle("online-attack-choice", isAttack);
  elements.choiceActions.classList.toggle("single-target", interaction.choice.targetSingle);
  elements.choiceActions.classList.toggle("single-choice", interaction.choice.single);
  elements.choiceActions.classList.toggle("multiple-choice", interaction.choice.multiple);
  elements.choiceActions.classList.toggle("placement-choice", interaction.choice.placement);
  elements.choiceActions.classList.toggle("material-choice", interaction.choice.material);
  elements.choiceActions.dataset.selectionMode = interaction.choice.selectionMode;
  elements.choiceActions.dataset.targetStep = interaction.choice.targetStep;
  elements.commandIdle.hidden = Boolean(model);
  elements.handPanel.dataset.commandActive = String(Boolean(model));
  elements.handCommand.dataset.active = String(Boolean(model));
  elements.handCommand.dataset.signal = actionPending || model ? "active" : canAct ? "ready" : "idle";
  elements.handCommand.dataset.step = model ? model.action ? "execute" : "locate" : "select";
  elements.commandSignal.textContent = actionPending ? "结算中" : model ? "操作中" : canAct ? "待命" : "等待";
  elements.commandTitle.textContent = view.gameOver ? "决斗结束" : canAct ? "选择一张手牌或场上怪兽" : "对手正在行动";
  elements.commandHint.textContent = view.gameOver ? "可查看卡牌详情与战斗记录。" : canAct ? "单击选择，双击快捷执行；需要目标时，合法候选会高亮。" : "可以查看公开卡牌和墓地。";
  elements.duelHint.textContent = model ? prompt : actionReceipt?.text || elements.commandTitle.textContent;
  elements.duelHint.dataset.kind = model ? "action" : actionReceipt ? actionReceipt.kind || "receipt" : "status";
  elements.duelHint.dataset.actor = !model && actionReceipt ? actionReceipt.actor : "none";
  elements.duelHint.dataset.eventType = !model && actionReceipt ? actionReceipt.type : "none";
  elements.duelHint.dataset.tone = !model && actionReceipt ? actionReceipt.tone || "neutral" : "neutral";
  elements.duelPanel.dataset.battleResult = !model && actionReceipt?.kind === "battle-result" ? actionReceipt.result : "none";
  elements.handGuide.textContent = model ? "确认或双击高亮候选执行" : "单击选择 · 双击快捷出牌";
  const inBattle = view.turn.phase === "battle";
  elements.battleButton.textContent = inBattle ? "战斗阶段" : "进入战斗";
  elements.battleButton.dataset.currentPhase = String(inBattle);
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

function responseRendererOptions(view) {
  return { choice: trapChoice, traps: view.players[view.viewerSeatId].spellTrapZone.map(onlineDisplayCard), activationText: trapActivationText };
}

function selectResponse(index) {
  if (actionPending) return;
  trapChoice = selectTrapResponse(trapChoice, index) || trapChoice;
  // Keep the clicked button mounted so a second click can become a double-click.
  const panel = buildTrapResponseView(responseRendererOptions(client.view));
  elements.responseText.textContent = panel.detailsText;
  elements.responseStatus.textContent = panel.statusText;
  elements.responseActivate.textContent = panel.actionText;
  elements.responseActivate.disabled = panel.actionDisabled;
  for (const button of elements.responseChoices.children) {
    const selected = Number(button.dataset.trapChoiceIndex) === trapChoice.selectedIndex;
    button.classList.toggle("selected", selected);
    button.dataset.choiceState = selected ? "selected" : "ready";
    button.setAttribute("aria-pressed", String(selected));
    const state = button.querySelector(".trap-choice-state");
    state.textContent = selected ? "已选择" : "可发动";
    state.className = `trap-choice-state ${selected ? "selected" : "ready"}`;
    button.setAttribute("aria-label", `${button.querySelector(".trap-choice-title strong").textContent}，${state.textContent}。${button.querySelector(".trap-choice-effect").textContent}`);
  }
}

function respondToAttack(activate, index = trapChoice?.selectedIndex) {
  const response = client.view?.attackResponse;
  if (!response || actionPending) return;
  const candidate = response.candidates.find((entry) => entry.index === index);
  if (activate && !candidate) return;
  return sendAction({ type: activate ? "RESPOND_TRAP" : "PASS_ATTACK_RESPONSE", declarationEventId: response.declarationEventId, ...(activate ? { cardId: candidate.cardId } : {}) });
}

function renderResponse(view) {
  const responseSoundId = view.attackResponse?.declarationEventId || null;
  if (responseSoundId && responseSoundId !== lastResponseSoundId) {
    lastResponseSoundId = responseSoundId;
    playSound("trap");
  } else if (!responseSoundId) lastResponseSoundId = null;
  if (trapChoice) {
    const panel = renderTrapResponsePanel({ document, ...responseRendererOptions(view), elements: {
      chainText: elements.responseText, chainStatus: elements.responseStatus, chainYes: elements.responseActivate, chainChoices: elements.responseChoices
    }, onSelect: selectResponse, onActivate: (index) => respondToAttack(true, index) });
    elements.onlineResponse.dataset.responseMode = panel.singleChoice ? "single" : "multiple";
    elements.onlineResponse.classList.toggle("single-response", panel.singleChoice);
    elements.responseChoices.hidden = panel.singleChoice || panel.choices.length === 0;
    elements.responseTitle.textContent = panel.singleChoice ? "可发动一张陷阱" : "选择本次攻击的响应";
    elements.responseActivate.disabled ||= actionPending;
    elements.responsePass.disabled = actionPending;
    elements.responseChoices.querySelectorAll("button").forEach((button) => { button.disabled = actionPending; });
    if (!elements.onlineResponse.open) {
      closeInspector();
      elements.onlineResponse.showModal();
      elements[panel.singleChoice ? "responseActivate" : "responsePass"].focus({ preventScroll: true });
    }
  } else if (elements.onlineResponse.open) elements.onlineResponse.close();
  if (!view.machine.responseWindow) return;
  const ownResponse = view.machine.responseWindow.playerId === view.viewerSeatId;
  const text = ownResponse ? "对手发起攻击，请选择陷阱或放弃响应。" : "等待对手选择是否发动陷阱，攻击尚未结算。";
  document.body.dataset.duelFocus = ownResponse ? "response" : "idle";
  elements.commandTitle.textContent = ownResponse ? "轮到你响应攻击" : "等待对手响应";
  elements.commandHint.textContent = text;
  elements.commandSignal.textContent = "响应中";
  elements.duelHint.textContent = text;
  elements.duelHint.dataset.kind = "status";
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
      : event.type === "LP_HEALED" ? `恢复 ${event.amount || 0} LP` : EVENT_LABELS[event.type];
    const id = event.cardId || event.attackerCardId || event.sourceCardId;
    return `<span>${escapeHtml(player)} · ${escapeHtml(text)}${id ? ` · ${escapeHtml(cardName(view, id))}` : ""}</span>`;
  }).join("") || "<span>等待第一步行动</span>";
}

function render(view) {
  if (!view) return;
  renderRoom(view);
  syncActionReceipt(view);
  elements.duelPanel.hidden = view.status === "waiting";
  elements.handPanel.hidden = view.status === "waiting";
  if (view.status === "waiting") return;
  if (view.machine.responseWindow) selection = null;
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
  trapChoice = onlineTrapResponseChoice(view, trapChoice);
  renderBoard(view, model);
  renderCommands(view, model);
  renderResponse(view);
  renderEvents(view);
  playPendingActionCue(view);
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
elements.responseActivate.addEventListener("click", () => respondToAttack(true));
elements.responsePass.addEventListener("click", () => respondToAttack(false));
elements.onlineResponse.addEventListener("cancel", (event) => event.preventDefault());
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
elements.handReadyJump.addEventListener("click", locateNextReadyHandCard);
elements.hand.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("button")) return;
  const card = event.target.closest(".card[data-card-uid]");
  if (card) { event.preventDefault(); chooseHandCard(card.dataset.cardUid); }
});
elements.soundBtn?.addEventListener("click", () => {
  const enabled = toggleAudioSound({ previewSound: "click" });
  elements.soundBtn.title = enabled ? "关闭联机决斗音效" : "开启联机决斗音效";
});
document.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
elements.logToggle.addEventListener("click", () => setEventLogOpen(elements.eventLog.hidden));
document.addEventListener("click", (event) => {
  if (!runCommand.blocksRepeatedClick(event.detail)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
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
renderSoundButton();
try {
  await client.connect(); setConnection("connected", "服务已连接");
  const session = storedSession();
  if (session) {
    try { const result = await client.resumeRoom(session); saveSession(); setConnection("connected", `身份已恢复 · ${seatName(result.view, result.seatId)}`); render(result.view); }
    catch { sessionStorage.removeItem(STORAGE_KEY); }
  }
} catch (error) { setConnection("error", "服务未启动"); setError(`${error.message}。请先启动对战服务。`); }
