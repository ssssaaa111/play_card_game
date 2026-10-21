import { OnlineDuelClient } from "./online-duel-client.js";

const elements = Object.fromEntries([
  "connectionStatus", "lobbyPanel", "playerName", "roomCodeInput", "createRoom", "joinRoom", "lobbyError",
  "roomPanel", "copyRoomCode", "readyButton", "seatGrid", "roomHint", "duelPanel", "rivalPanel", "playerPanel",
  "rivalTraps", "rivalField", "playerField", "playerTraps", "turnLabel", "phaseLabel", "revisionLabel", "eventLog",
  "playerHand", "handCount", "actionList", "actionHint", "duelError"
].map((id) => [id, document.getElementById(id)]));

const STORAGE_KEY = "star-card-duel:online-session:v1";
const client = new OnlineDuelClient();
let actionPending = false;

function setConnection(state, text) {
  elements.connectionStatus.dataset.state = state;
  elements.connectionStatus.textContent = text;
}
function setError(message = "") {
  const target = client.view?.status === "playing" ? elements.duelError : elements.lobbyError;
  target.textContent = message;
}

function saveSession() {
  if (client.session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client.session));
}

function storedSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function cardMarkup(card) {
  if (!card) return '<div class="zone-slot"><span>EMPTY</span></div>';
  if (card.hidden) return '<div class="mini-card hidden"><strong>星魂卡背</strong><small>隐藏信息</small></div>';
  const stats = card.type === "monster" ? `<small>ATK ${card.atk + card.tempAtk} / DEF ${card.def + card.tempDef}</small>` : `<small>${card.type === "spell" ? "魔法" : "陷阱"}</small>`;
  return `<div class="mini-card"><strong>${escapeHtml(card.name)}</strong>${stats}</div>`;
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value || "";
  return span.innerHTML;
}

function renderCards(target, cards = []) {
  target.innerHTML = cards.map(cardMarkup).join("");
}

function seatName(view, seatId) {
  return view.seats?.find((seat) => seat.seatId === seatId)?.name || seatId;
}

function renderDuelist(target, view, seatId, label) {
  const player = view.players[seatId];
  const seat = view.seats.find((entry) => entry.seatId === seatId);
  target.innerHTML = `<div><span class="eyebrow">${label}</span><h3>${escapeHtml(seatName(view, seatId))}</h3><p>${seat?.connected ? "在线" : "断线重连中"} · 手牌 ${player.handCount} · 卡组 ${player.deckCount}</p></div><strong class="life">${player.lp} LP</strong>`;
}

function cardName(view, cardId) {
  for (const player of Object.values(view.players || {})) {
    for (const zone of ["hand", "monsterZone", "spellTrapZone", "grave", "banished"]) {
      const card = (player[zone] || []).find((entry) => entry?.id === cardId);
      if (card) return card.name;
    }
  }
  return "目标";
}

function actionLabel(view, action) {
  const sourceName = cardName(view, action.cardId || action.attackerCardId);
  const targetName = action.targetCardId ? cardName(view, action.targetCardId) : "玩家";
  switch (action.type) {
    case "SUMMON_MONSTER": return `召唤 · ${sourceName}`;
    case "SET_TRAP": return `盖放 · ${sourceName}`;
    case "ACTIVATE_CARD": return `发动 · ${sourceName}${action.targetCardId ? ` → ${targetName}` : ""}`;
    case "CHANGE_MONSTER_MODE": return `切换表示 · ${sourceName}`;
    case "DECLARE_ATTACK": return `攻击 · ${sourceName} → ${targetName}`;
    default: return action.type;
  }
}

async function sendAction(action) {
  if (actionPending) return;
  actionPending = true;
  setError();
  render(client.view);
  try {
    await client.sendAction(action);
  } catch (error) {
    if (error.code === "STALE_REVISION") await client.sync().catch(() => {});
    setError(error.message);
  } finally {
    actionPending = false;
    render(client.view);
  }
}

function actionKind(action) {
  if (action.type === "DECLARE_ATTACK") return "attack";
  if (action.type === "SUMMON_MONSTER") return "summon";
  return "utility";
}

function renderActions(view) {
  const legal = view.legalActions;
  const ownTurn = view.turn.playerId === view.viewerSeatId;
  elements.actionList.replaceChildren();
  if (!ownTurn || view.gameOver) {
    elements.actionHint.textContent = view.gameOver ? "决斗已结束" : "等待对手行动";
    return;
  }
  const actions = [
    ...(legal.actions.summon || []),
    ...(legal.actions.activateCard || []),
    ...(legal.actions.setTrap || []),
    ...(legal.actions.changeMode || []),
    ...(legal.actions.declareAttack || [])
  ];
  if (view.turn.phase === "main") actions.push({ type: "CHANGE_PHASE", phase: "battle" });
  actions.push({ type: "END_TURN" });
  elements.actionHint.textContent = actionPending ? "服务端结算中…" : `${actions.length} 个可用操作`;
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = actionPending;
    button.dataset.kind = actionKind(action);
    button.textContent = action.type === "CHANGE_PHASE"
      ? "进入战斗阶段"
      : action.type === "END_TURN"
        ? "结束回合"
        : actionLabel(view, action);
    button.addEventListener("click", () => sendAction(action));
    elements.actionList.appendChild(button);
  }
}

function renderRoom(view) {
  elements.lobbyPanel.hidden = true;
  elements.roomPanel.hidden = false;
  elements.copyRoomCode.textContent = view.roomCode;
  elements.seatGrid.innerHTML = (view.seats || []).map((seat) => `
    <div class="seat-card" data-ready="${seat.ready}">
      <strong>${escapeHtml(seat.name)} ${seat.seatId === view.viewerSeatId ? "（你）" : ""}</strong>
      <span>${seat.connected ? "在线" : "已断线"} · ${seat.ready ? "已准备" : "未准备"}</span>
    </div>
  `).join("");
  const self = view.seats?.find((seat) => seat.seatId === view.viewerSeatId);
  elements.readyButton.hidden = view.status !== "waiting";
  elements.readyButton.disabled = Boolean(self?.ready);
  elements.readyButton.textContent = self?.ready ? "已准备" : "准备";
  elements.roomHint.textContent = view.seats?.length < 2
    ? "等待第二名玩家加入。"
    : view.status === "waiting"
      ? "双方准备后自动开局。"
      : "权威服务端已创建牌局。";
}

function render(view) {
  if (!view) return;
  renderRoom(view);
  elements.duelPanel.hidden = view.status === "waiting";
  if (view.status === "waiting") return;
  const selfId = view.viewerSeatId;
  const rivalId = view.opponentSeatId;
  const self = view.players[selfId];
  const rival = view.players[rivalId];
  renderDuelist(elements.rivalPanel, view, rivalId, "RIVAL");
  renderDuelist(elements.playerPanel, view, selfId, "YOU");
  renderCards(elements.rivalTraps, rival.spellTrapZone);
  renderCards(elements.rivalField, rival.monsterZone);
  renderCards(elements.playerField, self.monsterZone);
  renderCards(elements.playerTraps, self.spellTrapZone);
  renderCards(elements.playerHand, self.hand);
  elements.handCount.textContent = `${self.handCount} 张`;
  elements.turnLabel.textContent = view.turn.playerId === selfId ? "YOUR TURN" : "RIVAL TURN";
  elements.phaseLabel.textContent = { main: "主要阶段", battle: "战斗阶段", end: "结束阶段" }[view.turn.phase] || view.turn.phase;
  elements.revisionLabel.textContent = view.revision;
  elements.eventLog.innerHTML = (view.recentEvents || []).slice(-10).reverse()
    .map((event) => `<span>#${event.id || "-"} ${escapeHtml(event.type)}</span>`).join("");
  renderActions(view);
}

async function createRoom() {
  try {
    setError();
    const result = await client.createRoom(elements.playerName.value);
    saveSession();
    render(result.view);
  } catch (error) { setError(error.message); }
}

async function joinRoom() {
  try {
    setError();
    const result = await client.joinRoom(elements.roomCodeInput.value, elements.playerName.value);
    saveSession();
    render(result.view);
  } catch (error) { setError(error.message); }
}

client.on("view", render);
client.on("connection", ({ connected }) => setConnection(connected ? "connected" : "error", connected ? "服务已连接" : "连接已断开"));
client.on("error", (error) => setError(error.message));
elements.createRoom.addEventListener("click", createRoom);
elements.joinRoom.addEventListener("click", joinRoom);
elements.readyButton.addEventListener("click", async () => {
  try { await client.setReady(true); } catch (error) { setError(error.message); }
});
elements.copyRoomCode.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", client.view.roomCode);
  await navigator.clipboard?.writeText(url.toString());
  elements.roomHint.textContent = "邀请链接已复制。";
});
elements.roomCodeInput.value = new URLSearchParams(window.location.search).get("room") || "";

try {
  await client.connect();
  setConnection("connected", "服务已连接");
  const session = storedSession();
  if (session) {
    try {
      const resumed = await client.resumeRoom(session);
      saveSession();
      render(resumed.view);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
} catch (error) {
  setConnection("error", "服务未启动");
  setError(`${error.message}。请先运行 npm run serve:online。`);
}
