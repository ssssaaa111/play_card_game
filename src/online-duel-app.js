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
import { OnlineAuthClient } from "./online-auth-client.js";
import { onlineDisplayCard, onlineCard, onlineCardActions, selectOnlineCard, onlineSelectionModel, onlineBoardState, onlineInteractionView, onlineIdentityView, onlineSeriesView, onlineCardDetailView, onlineAttackIntent, onlineResponseBattleView, onlineGameResultView, onlineRematchView, latestOnlineActionReceipt, chooseOnlineCard, onlineBattlePreview, onlineEventSound, onlineActionCue, onlineEventTimeline, onlineConnectionView, onlineResponseTimerView } from "./online-duel-ui.js";

const elements = Object.fromEntries([
  "authPanel", "authTitle", "authLead", "authLoginTab", "authRegisterTab", "authForm", "authHandle", "authDisplayField", "authDisplayName", "authPassword", "authSubmit", "authError", "accountBadge", "accountName", "accountHandle", "logoutButton",
  "app", "connectionStatus", "lobbyPanel", "playerName", "roomCodeInput", "createRoom", "joinRoom", "lobbyError",
  "roomPanel", "copyRoomCode", "readyButton", "seatGrid", "roomHint", "duelPanel", "aiPanel", "playerPanel",
  "aiTraps", "aiField", "playerField", "playerTraps", "turnLabel", "phaseLabel", "eventLog", "eventLogList", "eventLogClose", "logToggle", "logUnread", "logSelfGrave", "logSelfGraveCount", "logRivalGrave", "logRivalGraveCount",
  "handPanel", "hand", "handCount", "handReadyCount", "handReadyJump", "handGuide", "handSortType", "duelHint", "duelError", "versusStage", "versusPhase",
  "battleButton", "endTurnButton", "rivalDeckCount", "playerDeckCount", "rivalGraveCount", "playerGraveCount", "rivalGrave", "playerGrave",
  "handCommand", "commandSignal", "commandIdle", "commandTitle", "commandHint", "fieldActionBar", "fieldActionName", "fieldActionStatus",
  "fieldAttackBtn", "fieldModeBtn", "fieldDetailBtn", "fieldCancelBtn", "choiceActions", "choiceText", "fieldTargets", "choiceConfirmBtn", "choiceCancelBtn",
  "cardInspector", "inspectorTitle", "inspectorKicker", "inspectorContent", "inspectorBack", "inspectorClose", "inspectorBackdrop", "viewerIdentity", "viewerName", "viewerSeatLabel", "onlineBattlePreview",
  "onlineResponse", "responseTitle", "responseLead", "responseBattle", "responseAttackerName", "responseAttackerStat", "responseBattleBadge", "responseTargetName", "responseTargetStat", "responseBattleSummary", "responseCountdown", "responseText", "responseChoices", "responseStatus", "responseActivate", "responsePass", "responseError",
  "onlineResult", "resultKicker", "resultTitle", "resultSummary", "resultSelfName", "resultSelfLp", "resultRivalName", "resultRivalLp", "resultSeries", "resultSeriesScore", "resultSeriesDetail", "resultReview", "resultLobby", "resultRematch", "resultRematchStatus",
  "forfeitButton", "resultReopenButton", "onlineForfeit", "forfeitTitle", "forfeitSummary", "forfeitError", "forfeitCancel", "forfeitConfirm",
  "connectionOverlay", "connectionKicker", "connectionTitle", "connectionSummary", "connectionDetail", "connectionActions", "connectionRetry", "connectionLobby", "soundBtn", "effectLayer", "phaseStage"
].map((id) => [id, document.getElementById(id)]));

const STORAGE_KEY_PREFIX = "star-card-duel:online-session:v2";
const AUDIO_STORAGE_KEY = "star-card-duel:online-audio:v1";
const client = new OnlineDuelClient();
const authClient = new OnlineAuthClient();
let currentAccount = null;
let authMode = "login";
let authPending = false;
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
let responseCountdownInterval = null;
let pendingActionCue = null;
let lastFieldPositions = new Map();
let cueCleanupTimer = null;
let lastResultKey = null;
let resultRevealTimer = null;
let inspectorCollection = null;
let eventLogRoomCode = null;
let eventReadThroughId = 0;
let transportState = "connecting";
let reconnectAttempt = 0;
let reconnectTimer = null;
let reconnectInFlight = false;
let recoveryFailed = false;
let intentionalDisconnect = false;
let forfeitPending = false;
let rematchPending = false;
let rematchError = "";
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
  transportState = state;
  document.body.dataset.onlineConnection = state;
  elements.connectionStatus.dataset.state = state;
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.title = text;
}

function connectionPaused(view = client.view) {
  return Boolean(onlineConnectionView(view, { transportState, reconnectAttempt, recoveryFailed }));
}

function renderConnectionState(view = client.view) {
  const panel = onlineConnectionView(view, { transportState, reconnectAttempt, recoveryFailed });
  const paused = Boolean(panel);
  document.body.dataset.onlinePaused = String(paused);
  elements.connectionOverlay.hidden = !paused;
  elements.handPanel.inert = paused;
  elements.duelPanel.dataset.connectionPaused = String(paused);
  elements.forfeitButton.disabled = paused || actionPending || forfeitPending;
  if (!paused) return;
  selection = null;
  elements.connectionOverlay.dataset.connectionKind = panel.kind;
  elements.connectionKicker.textContent = panel.kicker;
  elements.connectionTitle.textContent = panel.title;
  elements.connectionSummary.textContent = panel.summary;
  elements.connectionDetail.textContent = panel.status;
  elements.connectionActions.hidden = !panel.showActions;
  elements.battleButton.disabled = true;
  elements.endTurnButton.disabled = true;
  elements.responseActivate.disabled = true;
  elements.responsePass.disabled = true;
}

function clearReconnectTimer() {
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(delay = Math.min(6000, 700 * Math.max(1, reconnectAttempt + 1))) {
  if (intentionalDisconnect || reconnectTimer || reconnectInFlight || !storedSession()) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void attemptReconnect();
  }, delay);
}

async function attemptReconnect({ immediate = false } = {}) {
  if (intentionalDisconnect || reconnectInFlight) return false;
  const session = storedSession();
  if (!session) return false;
  clearReconnectTimer();
  reconnectInFlight = true;
  reconnectAttempt += 1;
  recoveryFailed = false;
  setConnection("reconnecting", `正在恢复身份 · 第 ${reconnectAttempt} 次尝试`);
  renderConnectionState();
  try {
    await client.connect();
    const result = await client.resumeRoom(session);
    saveSession();
    reconnectAttempt = 0;
    recoveryFailed = false;
    setConnection("connected", `连接已恢复 · ${seatName(result.view, result.seatId)}`);
    render(result.view);
    return true;
  } catch (error) {
    const terminal = ["ROOM_NOT_FOUND", "UNKNOWN_SEAT", "INVALID_MESSAGE"].includes(error.code);
    recoveryFailed = terminal || reconnectAttempt >= 8;
    setConnection(recoveryFailed ? "error" : "reconnecting", recoveryFailed ? "无法恢复原房间" : "连接中断 · 正在重试");
    renderConnectionState();
    if (!recoveryFailed) scheduleReconnect(immediate ? 700 : undefined);
    return false;
  } finally {
    reconnectInFlight = false;
    if (!recoveryFailed && transportState !== "connected") scheduleReconnect();
  }
}
function setError(message = "") {
  (client.view?.status === "playing" ? elements.duelError : elements.lobbyError).textContent = message;
  elements.responseError.textContent = message;
}
function roomStorageKey() {
  return currentAccount?.id ? `${STORAGE_KEY_PREFIX}:${currentAccount.id}` : "";
}
function saveSession() {
  const key = roomStorageKey();
  if (key && client.session) localStorage.setItem(key, JSON.stringify(client.session));
}
function syncRoomUrl(roomCode) {
  if (!roomCode) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("room") === roomCode) return;
  url.searchParams.set("room", roomCode);
  window.history.replaceState(null, "", url);
}
function storedSession() {
  const key = roomStorageKey();
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function clearStoredSession() {
  const key = roomStorageKey();
  if (!key) return;
  try { localStorage.removeItem(key); } catch {}
}
function renderAccountState() {
  const signedIn = Boolean(currentAccount);
  document.body.dataset.onlineAuth = signedIn ? "signed-in" : "signed-out";
  elements.authPanel.hidden = signedIn;
  elements.accountBadge.hidden = !signedIn;
  elements.accountName.textContent = currentAccount ? `@${currentAccount.handle}` : "";
  elements.accountHandle.textContent = currentAccount ? `@${currentAccount.handle}` : "";
  elements.accountBadge.title = currentAccount ? `${currentAccount.displayName} · @${currentAccount.handle}` : "";
  elements.playerName.value = currentAccount?.displayName || "决斗者";
  if (!signedIn) {
    elements.lobbyPanel.hidden = true;
    elements.roomPanel.hidden = true;
    elements.duelPanel.hidden = true;
    elements.handPanel.hidden = true;
    elements.viewerIdentity.hidden = true;
    elements.copyRoomCode.hidden = true;
    setConnection("error", "请先登录");
    return;
  }
  if (!client.view) elements.lobbyPanel.hidden = false;
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const registering = authMode === "register";
  elements.authLoginTab.setAttribute("aria-selected", String(!registering));
  elements.authRegisterTab.setAttribute("aria-selected", String(registering));
  elements.authDisplayField.hidden = !registering;
  elements.authDisplayName.required = registering;
  elements.authPassword.autocomplete = registering ? "new-password" : "current-password";
  elements.authTitle.textContent = registering ? "创建决斗账号" : "登录决斗账号";
  elements.authLead.textContent = registering
    ? "注册后由服务端保存账号，当前浏览器会自动保持登录。"
    : "登录后刷新或重新打开浏览器，仍会恢复当前账号。";
  elements.authSubmit.textContent = registering ? "创建账号并登录" : "登录";
  elements.authError.textContent = "";
}

async function connectOnlineService() {
  setConnection("connecting", "连接对战服务");
  await client.connect();
  setConnection("connected", "服务已连接");
  const session = storedSession();
  if (!session) {
    elements.lobbyPanel.hidden = false;
    return;
  }
  try {
    const result = await client.resumeRoom(session);
    saveSession();
    setConnection("connected", `房间已恢复 · ${seatName(result.view, result.seatId)}`);
    render(result.view);
  } catch (error) {
    if (["ROOM_NOT_FOUND", "UNKNOWN_SEAT", "INVALID_MESSAGE", "ACCOUNT_MISMATCH"].includes(error.code)) {
      clearStoredSession();
      elements.lobbyPanel.hidden = false;
      return;
    }
    throw error;
  }
}

async function submitAuth(event) {
  event.preventDefault();
  if (authPending) return;
  authPending = true;
  elements.authError.textContent = "";
  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = authMode === "register" ? "正在创建…" : "正在登录…";
  try {
    const credentials = { handle: elements.authHandle.value, password: elements.authPassword.value };
    const result = authMode === "register"
      ? await authClient.register({ ...credentials, displayName: elements.authDisplayName.value })
      : await authClient.login(credentials);
    currentAccount = result.account;
    elements.authPassword.value = "";
    renderAccountState();
    await connectOnlineService();
  } catch (error) {
    if (currentAccount) {
      setConnection("error", "对战服务不可用");
      elements.lobbyPanel.hidden = false;
      setError(error.message);
    } else {
      elements.authError.textContent = error.message;
    }
  } finally {
    authPending = false;
    elements.authSubmit.disabled = false;
    elements.authSubmit.textContent = authMode === "register" ? "创建账号并登录" : "登录";
  }
}

async function logoutAccount() {
  if (!currentAccount || authPending) return;
  authPending = true;
  elements.logoutButton.disabled = true;
  intentionalDisconnect = true;
  clearReconnectTimer();
  try { if (client.view) await client.leaveRoom(); } catch {}
  clearStoredSession();
  client.disconnect();
  client.view = null;
  client.session = null;
  try { await authClient.logout(); } catch (error) { elements.authError.textContent = error.message; }
  currentAccount = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
  intentionalDisconnect = false;
  authPending = false;
  elements.logoutButton.disabled = false;
  renderAccountState();
  setAuthMode("login");
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
  if (open) {
    eventReadThroughId = Math.max(eventReadThroughId, ...onlineEventTimeline(client.view).map((entry) => entry.id));
    renderEvents(client.view);
    elements.eventLogClose.focus({ preventScroll: true });
  }
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

function appendCardDetail(card) {
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

function appendCardCollection(cards, title) {
  const visibleCards = cards.filter((entry) => entry && !entry.hidden);
  const summary = document.createElement("p");
  summary.className = "online-zone-summary";
  summary.innerHTML = `<strong>${visibleCards.length} 张公开卡牌</strong><span>按入墓顺序排列 · 点击查看完整效果</span>`;
  const grid = document.createElement("section");
  grid.className = "online-zone-browser";
  grid.setAttribute("aria-label", title);
  for (const card of [...visibleCards].reverse()) {
    const display = onlineDisplayCard(card);
    const detail = onlineCardDetailView(card);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-zone-card";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-label", `查看${card.name}详情`);
    button.appendChild(createCardElement(document, display, { asset: assetForCard(display), showStateRail: false }));
    const caption = document.createElement("span");
    caption.className = "online-zone-card-caption";
    caption.innerHTML = `<strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(detail.typeLabel)}${card.type === "monster" ? ` · ATK ${Math.max(0, Number(card.atk || 0) + Number(card.tempAtk || 0))}` : ""}</small>`;
    button.appendChild(caption);
    grid.appendChild(button);
  }
  elements.inspectorContent.append(summary, grid);
}

function showCards(cards, title = "卡牌详情", { collection = false, preserveCollection = false } = {}) {
  if (collection) inspectorCollection = { cards: cards.filter(Boolean), title };
  else if (!preserveCollection) inspectorCollection = null;
  elements.inspectorTitle.textContent = title;
  elements.inspectorKicker.textContent = collection ? "PUBLIC ZONE" : "CARD ARCHIVE";
  elements.inspectorBack.hidden = !(!collection && inspectorCollection);
  elements.inspectorContent.replaceChildren();
  const visibleCards = cards.filter((entry) => entry && !entry.hidden);
  if (collection && visibleCards.length) appendCardCollection(visibleCards, title);
  else visibleCards.forEach(appendCardDetail);
  if (!elements.inspectorContent.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "online-zone-empty";
    empty.innerHTML = "<b>墓地还是空的</b><span>被破坏或结算后的公开卡牌会出现在这里。</span>";
    elements.inspectorContent.appendChild(empty);
  }
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
  if (actionPending || !action || connectionPaused()) return;
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
  elements[rival ? "logRivalGraveCount" : "logSelfGraveCount"].textContent = player.grave.length;
  const graveButton = elements[rival ? "rivalGrave" : "playerGrave"];
  graveButton.dataset.empty = String(player.grave.length === 0);
  graveButton.title = player.grave.length ? `查看${rival ? "对手" : "我方"}墓地的 ${player.grave.length} 张卡` : `${rival ? "对手" : "我方"}墓地为空`;
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
      return { ok: ready, label: view.gameOver ? "已结束" : ready ? card.type === "monster" ? "召唤" : card.type === "trap" ? "盖放" : "发动" : "暂不可用", reason: view.gameOver ? "决斗已结束，可查看卡牌详情" : !canAct ? "等待对手行动，可查看卡牌详情" : ready ? `单击选择 · 双击${card.type === "monster" ? "召唤" : card.type === "trap" ? "盖放" : "发动"}` : "当前阶段或场上条件不满足" };
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
  elements.aiPanel.classList.remove("online-response-direct-target");
  elements.playerPanel.classList.remove("online-response-direct-target");
  const pendingAttack = view.machine?.pendingAttack;
  if (pendingAttack) {
    const attackerOwner = ownerForSeat(view, pendingAttack.playerId);
    const targetOwner = ownerForSeat(view, pendingAttack.rivalId);
    cardAnchor(view, pendingAttack.attackerCardId, attackerOwner)?.classList.add("online-response-attacker");
    if (pendingAttack.targetCardId) {
      cardAnchor(view, pendingAttack.targetCardId, targetOwner)?.classList.add("online-response-target");
    } else {
      elements[targetOwner === "player" ? "playerPanel" : "aiPanel"].classList.add("online-response-direct-target");
    }
  }
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
  elements.commandSignal.textContent = view.gameOver ? "结束" : actionPending ? "结算中" : model ? "操作中" : canAct ? "待命" : "等待";
  elements.commandTitle.textContent = view.gameOver ? "决斗结束" : canAct ? "选择一张手牌或场上怪兽" : "对手正在行动";
  elements.commandHint.textContent = view.gameOver ? "可查看卡牌详情与战斗记录。" : canAct ? "单击选择，双击快捷执行；需要目标时，合法候选会高亮。" : "可以查看公开卡牌和墓地。";
  elements.duelHint.textContent = model ? prompt : actionReceipt?.text || elements.commandTitle.textContent;
  elements.duelHint.dataset.kind = model ? "action" : actionReceipt ? actionReceipt.kind || "receipt" : "status";
  elements.duelHint.dataset.actor = !model && actionReceipt ? actionReceipt.actor : "none";
  elements.duelHint.dataset.eventType = !model && actionReceipt ? actionReceipt.type : "none";
  elements.duelHint.dataset.tone = !model && actionReceipt ? actionReceipt.tone || "neutral" : "neutral";
  elements.duelPanel.dataset.battleResult = !model && actionReceipt?.kind === "battle-result" ? actionReceipt.result : "none";
  elements.handGuide.textContent = view.gameOver ? "决斗已结束 · 可查看卡牌详情" : model ? "确认或双击高亮候选执行" : "单击选择 · 双击快捷出牌";
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

function renderResponseBattle(view) {
  const battle = onlineResponseBattleView(view);
  elements.responseBattle.hidden = !battle;
  elements.responseBattleSummary.hidden = !battle;
  if (!battle) return;
  elements.responseBattle.dataset.tone = battle.tone;
  elements.responseBattle.dataset.direct = String(battle.direct);
  elements.responseAttackerName.textContent = battle.attackerName;
  elements.responseAttackerStat.textContent = battle.attackerStat;
  elements.responseBattleBadge.textContent = battle.badge;
  elements.responseTargetName.textContent = battle.targetName;
  elements.responseTargetStat.textContent = battle.targetStat;
  elements.responseBattleSummary.textContent = `若不发动陷阱：${battle.summary}`;
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

function clearResponseCountdown() {
  if (responseCountdownInterval) window.clearInterval(responseCountdownInterval);
  responseCountdownInterval = null;
  elements.responseCountdown.textContent = "";
}

function paintResponseCountdown(view = client.view) {
  const countdown = onlineResponseTimerView(view);
  if (!countdown) {
    clearResponseCountdown();
    return null;
  }
  elements.responseCountdown.textContent = countdown.label;
  elements.responseCountdown.dataset.urgent = String(!countdown.paused && countdown.seconds <= 5);
  elements.responseCountdown.dataset.paused = String(countdown.paused);
  if (view.machine?.responseWindow) {
    elements.commandSignal.textContent = countdown.paused ? "已暂停" : `${countdown.seconds}s`;
    if (!countdown.ownResponse) {
      elements.commandHint.textContent = countdown.label;
      elements.duelHint.textContent = countdown.label;
    }
  }
  return countdown;
}

function renderResponseCountdown(view) {
  const countdown = paintResponseCountdown(view);
  if (!countdown || countdown.paused || responseCountdownInterval) return;
  responseCountdownInterval = window.setInterval(() => paintResponseCountdown(), 200);
}

function renderResponse(view) {
  renderResponseBattle(view);
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
    elements.responseChoices.hidden = panel.choices.length === 0;
    elements.responseTitle.textContent = panel.singleChoice ? "可发动一张陷阱" : "选择本次攻击的响应";
    elements.responseLead.textContent = panel.singleChoice ? "唯一可用陷阱已自动选中，直接决定发动或放弃。" : "选择一张陷阱响应本次攻击，双击候选可直接发动。";
    elements.responseText.hidden = panel.singleChoice;
    elements.responseActivate.disabled ||= actionPending;
    elements.responsePass.disabled = actionPending;
    elements.responseChoices.querySelectorAll("button").forEach((button) => {
      button.disabled = actionPending || panel.singleChoice;
      button.classList.toggle("single-ready", panel.singleChoice);
      if (panel.singleChoice) button.title = "唯一可用陷阱，已自动选中";
    });
    if (!elements.onlineResponse.open) {
      closeInspector();
      elements.onlineResponse.showModal();
      elements[panel.singleChoice ? "responseActivate" : "responsePass"].focus({ preventScroll: true });
    }
  } else if (elements.onlineResponse.open) elements.onlineResponse.close();
  if (!view.machine.responseWindow) {
    clearResponseCountdown();
    document.body.dataset.onlineResponse = "none";
    return;
  }
  const ownResponse = view.machine.responseWindow.playerId === view.viewerSeatId;
  document.body.dataset.onlineResponse = ownResponse ? "acting" : "waiting";
  const text = ownResponse ? "对手发起攻击，请选择陷阱或放弃响应。" : "等待对手选择是否发动陷阱，攻击尚未结算。";
  document.body.dataset.duelFocus = ownResponse ? "response" : "idle";
  elements.commandTitle.textContent = ownResponse ? "轮到你响应攻击" : "等待对手响应";
  elements.commandHint.textContent = text;
  elements.commandSignal.textContent = "响应中";
  elements.duelHint.textContent = text;
  elements.duelHint.dataset.kind = "status";
  renderResponseCountdown(view);
}

function renderGameResult(view) {
  const result = onlineGameResultView(view);
  if (!result) {
    rematchError = "";
    document.body.dataset.onlineResult = "none";
    lastResultKey = null;
    if (resultRevealTimer) clearTimeout(resultRevealTimer);
    resultRevealTimer = null;
    if (elements.onlineResult.open) elements.onlineResult.close();
    return;
  }
  document.body.dataset.onlineResult = result.tone;
  elements.onlineResult.dataset.resultTone = result.tone;
  elements.resultKicker.textContent = result.kicker;
  elements.resultTitle.textContent = result.title;
  elements.resultSummary.textContent = result.summary;
  elements.resultSelfName.textContent = result.selfName;
  elements.resultSelfLp.textContent = `${result.selfLp} LP`;
  elements.resultRivalName.textContent = result.rivalName;
  elements.resultRivalLp.textContent = `${result.rivalLp} LP`;
  const series = onlineSeriesView(view);
  elements.resultSeries.hidden = !series;
  elements.resultSeriesScore.textContent = series?.score || "0 : 0";
  elements.resultSeriesDetail.textContent = series?.detail || "已完成 0 局";
  const rematch = onlineRematchView(view);
  elements.resultRematch.disabled = rematchPending || rematch?.disabled || transportState !== "connected";
  elements.resultRematch.textContent = rematchPending ? "正在确认…" : rematch?.label || "再来一局";
  elements.resultRematchStatus.textContent = rematchError || rematch?.status || "双方确认后可在当前房间再来一局。";
  elements.resultRematchStatus.dataset.state = rematchError ? "error" : rematchPending ? "ready" : rematch?.selfReady ? "waiting" : rematch?.rivalReady ? "ready" : "idle";
  if (elements.onlineForfeit.open) elements.onlineForfeit.close();
  elements.duelHint.textContent = `${result.title} · ${result.summary}`;
  elements.duelHint.dataset.kind = "status";
  elements.duelHint.dataset.tone = result.tone;
  if (lastResultKey === result.key) return;
  lastResultKey = result.key;
  if (resultRevealTimer) clearTimeout(resultRevealTimer);
  resultRevealTimer = window.setTimeout(() => {
    resultRevealTimer = null;
    if (!elements.onlineResult.open) elements.onlineResult.showModal();
    elements.resultRematch.focus({ preventScroll: true });
  }, 1050);
}

function openOnlineResult() {
  if (!client.view?.gameOver) return;
  closeInspector();
  if (!elements.onlineResult.open) elements.onlineResult.showModal();
  elements.resultRematch.focus({ preventScroll: true });
}

function reviewFinalBoard() {
  if (elements.onlineResult.open) elements.onlineResult.close();
  elements.resultReopenButton.focus({ preventScroll: true });
}

async function requestOnlineRematch() {
  if (rematchPending || !client.view?.gameOver) return;
  rematchPending = true;
  rematchError = "";
  elements.resultRematch.disabled = true;
  elements.resultRematch.textContent = "正在确认…";
  elements.resultRematchStatus.dataset.state = "ready";
  elements.resultRematchStatus.textContent = "正在向对手发送再战请求…";
  try {
    await client.requestRematch();
  } catch (error) {
    rematchError = error.message || "再战请求失败，请稍后重试。";
  } finally {
    rematchPending = false;
    render(client.view);
  }
}

async function returnToOnlineLobby() {
  if (intentionalDisconnect) return;
  intentionalDisconnect = true;
  clearReconnectTimer();
  elements.resultLobby.disabled = true;
  elements.connectionLobby.disabled = true;
  if (!elements.connectionLobby.hidden) elements.connectionLobby.textContent = "正在返回…";
  elements.resultLobby.textContent = "正在返回…";
  try { await client.leaveRoom(); } catch {}
  clearStoredSession();
  client.disconnect();
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.location.assign(url.toString());
}

function openForfeitDialog() {
  if (client.view?.status !== "playing" || client.view?.gameOver || forfeitPending || connectionPaused()) return;
  closeInspector();
  elements.forfeitError.textContent = "";
  elements.forfeitConfirm.disabled = false;
  elements.forfeitConfirm.textContent = "确认认输";
  if (!elements.onlineForfeit.open) elements.onlineForfeit.showModal();
  elements.forfeitCancel.focus({ preventScroll: true });
}

function closeForfeitDialog() {
  if (!forfeitPending && elements.onlineForfeit.open) elements.onlineForfeit.close();
}

async function confirmForfeit() {
  if (forfeitPending || client.view?.status !== "playing" || client.view?.gameOver) return;
  forfeitPending = true;
  elements.forfeitError.textContent = "";
  elements.forfeitCancel.disabled = true;
  elements.forfeitConfirm.disabled = true;
  elements.forfeitConfirm.textContent = "正在结算…";
  elements.forfeitButton.disabled = true;
  try {
    await client.forfeitRoom();
    if (elements.onlineForfeit.open) elements.onlineForfeit.close();
  } catch (error) {
    elements.forfeitError.textContent = error.message;
  } finally {
    forfeitPending = false;
    elements.forfeitCancel.disabled = false;
    elements.forfeitConfirm.disabled = false;
    elements.forfeitConfirm.textContent = "确认认输";
    render(client.view);
  }
}

function renderRoom(view) {
  const playing = view.status !== "waiting";
  elements.logoutButton.disabled = view.status === "playing" && !view.gameOver;
  elements.logoutButton.title = elements.logoutButton.disabled ? "对局进行中，请先完成或认输本局" : "退出当前账号";
  document.body.dataset.onlineStatus = playing ? "playing" : "waiting";
  elements.lobbyPanel.hidden = true;
  elements.roomPanel.hidden = playing;
  elements.copyRoomCode.hidden = false;
  elements.copyRoomCode.textContent = view.roomCode;
  elements.forfeitButton.hidden = view.status !== "playing" || Boolean(view.gameOver);
  elements.forfeitButton.disabled = actionPending || forfeitPending || connectionPaused(view);
  elements.resultReopenButton.hidden = !view.gameOver;
  elements.battleButton.hidden = Boolean(view.gameOver);
  elements.endTurnButton.hidden = Boolean(view.gameOver);
  const identity = onlineIdentityView(view);
  const series = onlineSeriesView(view);
  elements.viewerIdentity.hidden = !identity;
  elements.viewerName.textContent = identity?.name || "";
  elements.viewerSeatLabel.textContent = identity
    ? `${identity.seatNumber} · ${identity.seatRole}${series?.duelNumber ? ` · 第 ${series.duelNumber} 局` : ""}`
    : "";
  elements.viewerIdentity.title = series ? `本房间战绩 ${series.score}${series.draws ? `，${series.draws} 场平局` : ""}` : "";
  elements.viewerIdentity.dataset.seat = identity?.seatId || "";
  document.body.dataset.onlineViewerSeat = identity?.seatId || "none";
  elements.seatGrid.innerHTML = view.seats.map((seat) => `<div class="seat-card" data-ready="${seat.ready}"><strong>${escapeHtml(seat.name)}${seat.seatId === view.viewerSeatId ? "（你）" : ""}</strong><span>${seat.connected ? "在线" : "已断线"} · ${seat.ready ? "已准备" : "未准备"}</span></div>`).join("");
  const self = view.seats.find((seat) => seat.seatId === view.viewerSeatId);
  elements.readyButton.disabled = Boolean(self?.ready);
  elements.readyButton.textContent = self?.ready ? "已准备" : "准备";
  elements.roomHint.textContent = view.seats.length < 2 ? "等待第二名玩家加入，点击上方房间码复制邀请链接。" : "双方准备后自动开局。";
}

function renderEvents(view) {
  const timeline = onlineEventTimeline(view);
  const latestId = timeline.reduce((max, entry) => Math.max(max, entry.id), 0);
  if (eventLogRoomCode !== view.roomCode || latestId < eventReadThroughId) {
    eventLogRoomCode = view.roomCode;
    eventReadThroughId = latestId;
  }
  if (!elements.eventLog.hidden) eventReadThroughId = latestId;
  const unread = timeline.filter((entry) => entry.id > eventReadThroughId).length;
  elements.logUnread.hidden = unread === 0;
  elements.logUnread.textContent = String(Math.min(99, unread));
  elements.logToggle.dataset.unread = String(unread > 0);
  elements.logToggle.setAttribute("aria-label", unread ? `战斗记录，${unread} 条新事件` : "战斗记录");
  elements.eventLogList.replaceChildren();
  if (!timeline.length) {
    const empty = document.createElement("p");
    empty.className = "online-event-empty";
    empty.textContent = "等待第一步行动";
    elements.eventLogList.appendChild(empty);
    return;
  }
  timeline.forEach((entry, index) => {
    const article = document.createElement("article");
    article.className = "online-event-entry";
    article.dataset.category = entry.category;
    article.dataset.actor = entry.actor;
    article.dataset.tone = entry.tone;
    article.dataset.unread = String(entry.id > eventReadThroughId);
    article.setAttribute("aria-posinset", String(timeline.length - index));
    article.setAttribute("aria-setsize", String(timeline.length));
    const marker = document.createElement("span");
    marker.className = "online-event-marker";
    marker.textContent = entry.label;
    const copy = document.createElement("div");
    copy.className = "online-event-copy";
    const meta = document.createElement("small");
    meta.textContent = `${entry.actor === "self" ? "你的行动" : entry.actor === "opponent" ? "对手行动" : "系统"} · #${entry.id}`;
    const text = document.createElement("strong");
    text.textContent = entry.text;
    copy.append(meta, text);
    if (entry.cardIds.length) {
      const cards = document.createElement("div");
      cards.className = "online-event-cards";
      for (const cardId of entry.cardIds) {
        const card = onlineCard(view, cardId);
        if (!card) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.cardId = cardId;
        button.textContent = card.name;
        button.title = `查看${card.name}详情`;
        cards.appendChild(button);
      }
      copy.appendChild(cards);
    }
    article.append(marker, copy);
    elements.eventLogList.appendChild(article);
  });
}

function render(view) {
  if (!view) return;
  syncRoomUrl(view.roomCode);
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
  renderGameResult(view);
  renderEvents(view);
  renderConnectionState(view);
  playPendingActionCue(view);
}

client.on("view", render);
client.on("connection", ({ connected }) => {
  if (connected) {
    if (transportState === "connecting") setConnection("connected", "服务已连接");
    return;
  }
  if (intentionalDisconnect) return;
  recoveryFailed = false;
  setConnection(storedSession() ? "reconnecting" : "error", storedSession() ? "连接中断 · 正在恢复" : "连接已断开");
  renderConnectionState();
  if (currentAccount) scheduleReconnect(500);
});
client.on("error", (error) => setError(error.message));
elements.authLoginTab.addEventListener("click", () => setAuthMode("login"));
elements.authRegisterTab.addEventListener("click", () => setAuthMode("register"));
elements.authForm.addEventListener("submit", submitAuth);
elements.logoutButton.addEventListener("click", () => { void logoutAccount(); });
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
elements.resultReview.addEventListener("click", reviewFinalBoard);
elements.resultLobby.addEventListener("click", () => { void returnToOnlineLobby(); });
elements.resultRematch.addEventListener("click", () => { void requestOnlineRematch(); });
elements.resultReopenButton.addEventListener("click", openOnlineResult);
elements.forfeitButton.addEventListener("click", openForfeitDialog);
elements.forfeitCancel.addEventListener("click", closeForfeitDialog);
elements.forfeitConfirm.addEventListener("click", () => { void confirmForfeit(); });
elements.onlineForfeit.addEventListener("cancel", (event) => {
  if (forfeitPending) event.preventDefault();
});
elements.connectionRetry.addEventListener("click", () => { recoveryFailed = false; reconnectAttempt = 0; void attemptReconnect({ immediate: true }); });
elements.connectionLobby.addEventListener("click", () => { void returnToOnlineLobby(); });
for (const id of ["fieldCancelBtn", "choiceCancelBtn"]) elements[id].addEventListener("click", cancelSelection);
elements.fieldAttackBtn.addEventListener("click", prepareSelectedAttack);
elements.fieldModeBtn.addEventListener("click", () => sendAction(onlineCardActions(client.view, selection?.cardId).find((action) => action.type === "CHANGE_MONSTER_MODE")));
elements.fieldDetailBtn.addEventListener("click", () => { const card = onlineCard(client.view, selection?.cardId); if (card) showCards([card], card.name); });
elements.battleButton.addEventListener("click", () => sendAction({ type: "CHANGE_PHASE", phase: "battle" }));
elements.endTurnButton.addEventListener("click", () => sendAction({ type: "END_TURN" }));
elements.inspectorClose.addEventListener("click", closeInspector);
elements.inspectorBack.addEventListener("click", () => {
  if (inspectorCollection) showCards(inspectorCollection.cards, inspectorCollection.title, { collection: true });
});
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
elements.eventLogClose.addEventListener("click", () => {
  setEventLogOpen(false);
  elements.logToggle.focus({ preventScroll: true });
});
elements.eventLogList.addEventListener("click", (event) => {
  const button = event.target.closest?.("button[data-card-id]");
  const card = button ? onlineCard(client.view, button.dataset.cardId) : null;
  if (card) showCards([card], card.name);
});
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
for (const [id, own] of [["playerGrave", true], ["rivalGrave", false]]) elements[id].addEventListener("click", () => showCards(client.view.players[own ? client.view.viewerSeatId : client.view.opponentSeatId].grave, own ? "我方墓地" : "对手墓地", { collection: true }));
for (const [id, own] of [["logSelfGrave", true], ["logRivalGrave", false]]) elements[id].addEventListener("click", () => showCards(client.view.players[own ? client.view.viewerSeatId : client.view.opponentSeatId].grave, own ? "我方墓地" : "对手墓地", { collection: true }));
elements.inspectorContent.addEventListener("click", (event) => {
  const button = event.target.closest?.(".online-zone-card[data-card-id]");
  if (!button) return;
  const card = onlineCard(client.view, button.dataset.cardId);
  if (card) showCards([card], card.name, { preserveCollection: true });
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.cardInspector.open) cancelSelection(); });
elements.roomCodeInput.value = new URLSearchParams(window.location.search).get("room") || "";
renderSoundButton();
setAuthMode("login");
renderAccountState();
try {
  const auth = await authClient.session();
  if (auth.authenticated) {
    currentAccount = auth.account;
    renderAccountState();
    await connectOnlineService();
  }
} catch (error) {
  if (!currentAccount) {
    setConnection("error", "登录服务不可用");
    elements.authError.textContent = `${error.message}，请确认对战服务已启动。`;
  } else {
    const session = storedSession();
    setConnection(session ? "reconnecting" : "error", session ? "服务未连接 · 正在重试" : "服务未启动");
    setError(`${error.message}。${session ? "正在自动恢复。" : "请稍后重试。"}`);
    if (session) scheduleReconnect(700);
  }
}
