import { cardArtById } from "./card-art.js";
import { monsterAssets } from "./data.js";
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
let selectedCardId = null;

const EVENT_LABELS = Object.freeze({
  MONSTER_SUMMONED: "怪兽登场",
  CARD_ACTIVATED: "卡牌发动",
  CARD_MOVED: "卡牌移动",
  DAMAGE_DEALT: "生命值受创",
  LIFE_GAINED: "生命值恢复",
  ATTACK_DECLARED: "攻击宣言",
  BATTLE_RESOLVED: "战斗结算",
  MONSTER_DESTROYED: "怪兽破坏",
  TURN_STARTED: "新回合开始",
  TURN_ENDED: "回合结束",
  CARDS_DRAWN: "抽取卡牌",
  TURN_DRAW_RESOLVED: "回合抽卡",
  MODE_CHANGED: "表示形式切换",
  PHASE_CHANGED: "阶段推进",
  GAME_OVER_DECLARED: "决斗结束",
  EFFECT_SKIPPED: "效果条件不足",
  CONTINUOUS_EFFECT_REGISTERED: "持续效果生效"
});

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

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value || "";
  return span.innerHTML;
}

function cardTemplateId(card) {
  return card?.templateId || card?.id || "";
}

function cardTotals(card) {
  return {
    atk: Math.max(0, (Number(card.atk) || 0) + (Number(card.tempAtk) || 0) - (Number(card.battleWear) || 0)),
    def: Math.max(0, (Number(card.def) || 0) + (Number(card.tempDef) || 0))
  };
}

function supportArtStyle(card) {
  const art = cardArtById[cardTemplateId(card)];
  if (!art) return "";
  return [
    `--online-card-art:url(&quot;/${escapeHtml(art.asset)}&quot;)`,
    `--online-card-art-size:${escapeHtml(art.size)}`,
    `--online-card-art-position:${escapeHtml(art.position)}`
  ].join(";");
}

function cardArtMarkup(card) {
  const templateId = cardTemplateId(card);
  if (card.type === "monster") {
    const asset = monsterAssets[templateId];
    return asset
      ? `<img src="/${escapeHtml(asset)}" alt="" loading="lazy">`
      : `<span class="card-glyph">${escapeHtml(card.icon || "星")}</span>`;
  }
  const hasArt = Boolean(cardArtById[templateId]);
  return `<div class="support-art" ${hasArt ? `style="${supportArtStyle(card)}"` : ""}>${hasArt ? "" : `<span class="card-glyph">${escapeHtml(card.icon || (card.type === "trap" ? "陷" : "魔"))}</span>`}</div>`;
}

function cardStateLabel(card) {
  if (card.type !== "monster") return card.type === "trap" ? "陷阱" : "魔法";
  if (card.mode === "defense") return "守备";
  if (card.used) return "已行动";
  return "攻击";
}

function cardActionHint(actions = []) {
  if (actions.length === 0) return "";
  const kinds = new Set(actions.map((action) => action.type));
  if (kinds.has("DECLARE_ATTACK")) return "攻击";
  if (kinds.has("SUMMON_MONSTER")) return "召唤";
  if (kinds.has("ACTIVATE_CARD")) return "发动";
  if (kinds.has("SET_TRAP")) return "盖放";
  if (kinds.has("CHANGE_MONSTER_MODE")) return "切换";
  return "操作";
}

function cardMarkup(card, { zone = "field", actions = [], selected = false } = {}) {
  if (!card) return '<div class="zone-slot"><span>EMPTY</span><i></i></div>';
  if (card.hidden) {
    return '<article class="online-card card-back"><div class="card-back-core"><span>✦</span></div><small>STAR SOUL</small></article>';
  }
  const totals = cardTotals(card);
  const actionHint = cardActionHint(actions);
  const statMarkup = card.type === "monster"
    ? `<div class="online-card-stats"><span>ATK <b>${totals.atk}</b></span><span>DEF <b>${totals.def}</b></span></div>`
    : `<div class="online-card-stats"><span>${card.type === "trap" ? "TRAP" : "SPELL"}</span><span>${escapeHtml(card.rarity || "N")}</span></div>`;
  const stars = card.type === "monster" && card.stars > 0
    ? `<span class="card-stars">${"★".repeat(Math.min(card.stars, 10))}</span>`
    : "";
  return `
    <article class="online-card ${escapeHtml(card.type)} ${escapeHtml(card.element || "neutral")} ${zone === "hand" ? "in-hand" : "on-field"} ${card.mode === "defense" ? "defense" : ""} ${card.used ? "spent" : ""} ${actions.length ? "actionable" : ""} ${selected ? "selected" : ""}"
      data-card-id="${escapeHtml(card.id)}" ${actions.length ? 'role="button" tabindex="0"' : ""}>
      <div class="online-card-head"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(cardStateLabel(card))}</span></div>
      <div class="online-card-art">${cardArtMarkup(card)}${stars}</div>
      <p>${escapeHtml(card.text || card.archetype || "星魂卡牌")}</p>
      ${statMarkup}
      ${actionHint ? `<span class="card-action-hint">${escapeHtml(actionHint)}${actions.length > 1 ? ` ×${actions.length}` : ""}</span>` : ""}
    </article>`;
}

function sourceCardId(action) {
  return action.cardId || action.attackerCardId || "";
}

function cardActions(view, cardId) {
  const buckets = view?.legalActions?.actions || {};
  return Object.values(buckets).flat().filter((action) => sourceCardId(action) === cardId);
}

function renderCards(target, cards = [], { view = null, zone = "field" } = {}) {
  const entries = cards.map((card) => ({
    card,
    actions: card?.hidden ? [] : cardActions(view, card?.id)
  }));
  target.innerHTML = entries.map(({ card, actions }) => cardMarkup(card, {
    zone,
    actions,
    selected: card?.id === selectedCardId
  })).join("");

  target.querySelectorAll(".online-card.actionable").forEach((cardElement) => {
    const cardId = cardElement.dataset.cardId;
    const actions = cardActions(view, cardId);
    const choose = () => {
      if (actionPending) return;
      if (actions.length === 1) {
        void sendAction(actions[0]);
        return;
      }
      selectedCardId = selectedCardId === cardId ? null : cardId;
      render(view);
      elements.actionList.closest(".action-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    cardElement.addEventListener("click", choose);
    cardElement.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
  });
}

function seatName(view, seatId) {
  return view.seats?.find((seat) => seat.seatId === seatId)?.name || seatId;
}

function renderDuelist(target, view, seatId, label, { rival = false } = {}) {
  const player = view.players[seatId];
  const seat = view.seats.find((entry) => entry.seatId === seatId);
  const active = view.turn.playerId === seatId;
  const lifePercent = Math.max(0, Math.min(100, player.lp / 40));
  target.classList.toggle("active-turn", active);
  target.innerHTML = `
    <div class="duelist-identity">
      <div class="duelist-avatar ${rival ? "rival" : "self"}"><img src="/${rival ? "assets/duelist-ai.png" : "assets/duelist-player.png"}" alt=""></div>
      <div><span class="eyebrow">${label}${active ? " · ACTIVE" : ""}</span><h3>${escapeHtml(seatName(view, seatId))}</h3><p>${seat?.connected ? "在线" : "断线重连中"} · 手牌 ${player.handCount} · 卡组 ${player.deckCount}</p></div>
    </div>
    <div class="life-block"><strong class="life">${player.lp}<small> LP</small></strong><div class="life-meter"><i style="width:${lifePercent}%"></i></div></div>`;
}

function cardName(view, cardId) {
  for (const player of Object.values(view.players || {})) {
    for (const zone of ["hand", "monsterZone", "spellTrapZone", "grave", "banished"]) {
      const card = (player[zone] || []).find((entry) => entry?.id === cardId);
      if (card && !card.hidden) return card.name;
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
    case "CHANGE_MONSTER_MODE": return `${action.mode === "defense" ? "转为守备" : "转为攻击"} · ${sourceName}`;
    case "DECLARE_ATTACK": return `攻击 · ${sourceName} → ${targetName}`;
    default: return action.type;
  }
}

async function sendAction(action) {
  if (actionPending) return;
  actionPending = true;
  selectedCardId = null;
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
  if (action.type === "ACTIVATE_CARD") return "spell";
  return "utility";
}

function renderActions(view) {
  const legal = view.legalActions;
  const ownTurn = view.turn.playerId === view.viewerSeatId;
  elements.actionList.replaceChildren();
  if (!ownTurn || view.gameOver) {
    selectedCardId = null;
    elements.actionHint.textContent = view.gameOver ? "决斗已结束" : "等待对手行动";
    return;
  }
  const cardActionList = [
    ...(legal.actions.summon || []),
    ...(legal.actions.activateCard || []),
    ...(legal.actions.setTrap || []),
    ...(legal.actions.changeMode || []),
    ...(legal.actions.declareAttack || [])
  ];
  let focusedActions = selectedCardId
    ? cardActionList.filter((action) => sourceCardId(action) === selectedCardId)
    : cardActionList;
  if (selectedCardId && focusedActions.length === 0) {
    selectedCardId = null;
    focusedActions = cardActionList;
  }
  const actions = [...focusedActions];
  if (!selectedCardId && view.turn.phase === "main" && legal.can.endTurn) {
    actions.push({ type: "CHANGE_PHASE", phase: "battle" });
  }
  if (!selectedCardId && legal.can.endTurn) actions.push({ type: "END_TURN" });
  elements.actionHint.textContent = actionPending
    ? "服务端结算中…"
    : selectedCardId
      ? `已选择 ${cardName(view, selectedCardId)} · ${actions.length} 个操作`
      : `${actions.length} 个可用操作 · 也可直接点击发光卡牌`;

  if (selectedCardId) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel-selection";
    cancel.textContent = "取消选择";
    cancel.addEventListener("click", () => {
      selectedCardId = null;
      render(view);
    });
    elements.actionList.appendChild(cancel);
  }
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
  elements.roomPanel.dataset.status = view.status;
  elements.copyRoomCode.textContent = view.roomCode;
  elements.seatGrid.innerHTML = (view.seats || []).map((seat) => `
    <div class="seat-card" data-ready="${seat.ready}" data-self="${seat.seatId === view.viewerSeatId}">
      <span class="seat-dot"></span><strong>${escapeHtml(seat.name)} ${seat.seatId === view.viewerSeatId ? "（你）" : ""}</strong>
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
      : "权威服务端同步中 · 点击房间码可复制邀请链接";
}

function eventSummary(view, event) {
  const player = event.playerId ? seatName(view, event.playerId) : "系统";
  const label = EVENT_LABELS[event.type] || event.type.replaceAll("_", " ");
  const cardId = event.cardId || event.attackerCardId || event.sourceCardId;
  const card = cardId ? cardName(view, cardId) : "";
  if (event.type === "DAMAGE_DEALT") return `${player}受到 ${event.amount || event.damage || 0} 点伤害`;
  if (event.type === "LIFE_GAINED") return `${player}恢复 ${event.amount || 0} LP`;
  if (event.type === "CARDS_DRAWN") return `${player}抽取 ${event.count || 1} 张卡`;
  if (card && card !== "目标") return `${player} · ${label} · ${card}`;
  return `${player} · ${label}`;
}

function renderEvents(view) {
  const events = (view.recentEvents || [])
    .filter((event) => EVENT_LABELS[event.type])
    .slice(-7)
    .reverse();
  elements.eventLog.innerHTML = events.length
    ? events.map((event) => `<span><i></i>${escapeHtml(eventSummary(view, event))}</span>`).join("")
    : "<span><i></i>等待第一步行动</span>";
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
  renderDuelist(elements.rivalPanel, view, rivalId, "RIVAL", { rival: true });
  renderDuelist(elements.playerPanel, view, selfId, "YOU");
  renderCards(elements.rivalTraps, rival.spellTrapZone, { view, zone: "support" });
  renderCards(elements.rivalField, rival.monsterZone, { view, zone: "field" });
  renderCards(elements.playerField, self.monsterZone, { view, zone: "field" });
  renderCards(elements.playerTraps, self.spellTrapZone, { view, zone: "support" });
  renderCards(elements.playerHand, self.hand, { view, zone: "hand" });
  elements.handCount.textContent = `${self.handCount} 张`;
  elements.turnLabel.textContent = view.turn.playerId === selfId ? "YOUR TURN" : "RIVAL TURN";
  elements.turnLabel.dataset.active = view.turn.playerId === selfId;
  elements.phaseLabel.textContent = { main: "主要阶段", battle: "战斗阶段", end: "结束阶段" }[view.turn.phase] || view.turn.phase;
  elements.revisionLabel.textContent = view.revision;
  renderEvents(view);
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
  try {
    await navigator.clipboard?.writeText(url.toString());
    elements.roomHint.textContent = "邀请链接已复制。";
  } catch {
    elements.roomHint.textContent = `房间码 ${client.view.roomCode} · 请手动复制`;
  }
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
