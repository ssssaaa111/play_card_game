import { OnlineDuelClient } from "./online-duel-client.js?v=20261114-network-recovery-1";
import { installOnlineLifecycle } from "./online-lifecycle.js?v=20261114-network-recovery-1";
import { installPublicReport } from "./public-report.js?v=20261114-network-recovery-1";
import { OnlineAuthClient } from "./online-auth-client.js?v=20261114-network-recovery-1";
import { monsterAssets } from "./data.js";
import { spectatorCard, spectatorName, spectatorStatus, spectatorTimeline } from "./spectator-ui.js?v=20261107-spectator-1";

const el = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
const client = new OnlineDuelClient();
const publicReport = installPublicReport(client);
const auth = new OnlineAuthClient();
let watching = "", pending = false, retries = 0, reconnectTimer = null;
const url = new URL(location.href);
el.watchCode.value = url.searchParams.get("room") || "";
const lobbyUrl = new URL("online.html", location.href);
if (url.searchParams.has("duelServer")) lobbyUrl.searchParams.set("duelServer", url.searchParams.get("duelServer"));
el.duelLink.href = lobbyUrl.href;
const text = (tag, value, className = "") => { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; };

function detail(card) {
  const model = spectatorCard(card);
  if (!model) return;
  el.watchDetailName.textContent = model.name;
  el.watchDetailStats.textContent = model.type === "monster" ? `${model.modeText} · ATK ${model.atkText} / DEF ${model.defText}` : model.modeText;
  el.watchDetailText.textContent = model.text || "没有额外的公开效果说明。";
  if (!el.watchDetail.open) el.watchDetail.showModal();
}
function cardButton(card) {
  const model = spectatorCard(card);
  const button = document.createElement("button");
  button.type = "button"; button.className = "watch-card";
  button.dataset.cardId = model.id;
  button.setAttribute("aria-label", `${model.name}，${model.modeText}，查看公开详情`);
  button.append(text("strong", model.name));
  if (model.type === "monster") {
    const art = document.createElement("div"); art.className = "watch-art"; art.dataset.mode = model.mode;
    const asset = monsterAssets[model.templateId];
    if (asset) { const img = document.createElement("img"); img.src = asset; img.alt = ""; art.append(img); }
    else art.textContent = model.icon || "★";
    button.append(art);
    const stats = document.createElement("div"); stats.className = "watch-stats";
    stats.append(text("span", `攻 ${model.atkText}`), text("span", `守 ${model.defText}`));
    button.append(stats);
  }
  button.append(text("span", `${model.modeText}${model.used ? " · 已行动" : ""}`, "watch-mode"));
  button.addEventListener("click", () => detail(card)); return button;
}
function zone(cards, label, support = false) {
  const root = document.createElement("div"); root.className = `watch-zone${support ? " watch-supports" : ""}`;
  root.setAttribute("aria-label", label);
  for (let index = 0; index < 5; index++) {
    const slot = document.createElement("div"); slot.className = "watch-slot";
    const card = cards?.[index];
    slot.append(!card ? text("span", support ? "魔陷空位" : "怪兽空位", "watch-empty") : card.hidden ? text("span", "盖放卡", "watch-covered") : cardButton(card));
    root.append(slot);
  }
  return root;
}
function render(view) {
  if (view?.viewerRole !== "spectator") return;
  el.watchBoard.hidden = false; el.watchStale.hidden = true;
  el.watchPhase.textContent = spectatorStatus(view);
  const first = spectatorName(view, "p1"), second = spectatorName(view, "p2");
  el.watchSeries.textContent = `房间 ${view.roomCode} · 第 ${view.duelNumber || 1} 局 · ${first} ${view.series?.wins?.p1 || 0} : ${view.series?.wins?.p2 || 0} ${second} · ${view.spectators?.count || 0} 位观众`;
  el.watchPlayers.replaceChildren();
  for (const id of ["p2", "p1"]) {
    const player = view.players?.[id];
    const panel = document.createElement("section"); panel.className = "watch-player"; panel.dataset.seat = id;
    panel.dataset.turn = String(view.status === "playing" && view.turn?.playerId === id);
    const heading = document.createElement("header"); heading.className = "watch-player-head";
    const seat = view.seats.find((seat) => seat.seatId === id);
    heading.append(text("h2", `${id === "p1" ? "1P" : "2P"} · ${spectatorName(view, id)}`));
    if (player) heading.append(text("span", `${player.lp} LP`, "watch-lp"));
    panel.append(heading);
    const info = document.createElement("div"); info.className = "watch-player-info";
    info.append(text("span", seat?.connected ? "在线" : "已断线"));
    if (view.status === "playing" && view.turn?.playerId === id) info.append(text("span", "当前回合"));
    if (player) {
      info.append(text("span", `手牌 ${player.handCount} 张（隐藏）`), text("span", `牌库 ${player.deckCount} 张`));
      panel.append(info, zone(player.monsterZone, `${spectatorName(view, id)}怪兽区`), zone(player.spellTrapZone, `${spectatorName(view, id)}魔陷区`, true));
      const pile = document.createElement("details"); pile.append(text("summary", `公开墓地 ${player.grave.length} 张 · 除外 ${player.banished.length} 张`));
      const list = document.createElement("div"); list.className = "watch-public-pile";
      for (const card of [...player.grave, ...player.banished]) {
        const item = text("button", card.name); item.type = "button"; item.addEventListener("click", () => detail(card)); list.append(item);
      }
      pile.append(list); panel.append(pile);
    } else panel.append(text("p", seat?.ready ? "已准备" : "未准备"));
    el.watchPlayers.append(panel);
  }
  const chain = view.machine?.chain || [];
  el.watchChain.textContent = chain.length ? chain.map((link) => `CL${link.linkId} · ${spectatorName(view, link.playerId)} · ${link.card?.name || "等待公开"}`).join(" → ") : "暂无未结算连锁";
  el.watchEvents.replaceChildren(...spectatorTimeline(view).map((entry) => text("li", entry.text)));
  if (!el.watchEvents.children.length) el.watchEvents.append(text("li", "等待第一步公开行动"));
}
function clearBoard(message) {
  publicReport.close();
  el.watchBoard.hidden = true; el.watchPlayers.replaceChildren(); el.watchEvents.replaceChildren();
  if (el.watchDetail.open) el.watchDetail.close();
  el.watchConnection.textContent = message; el.watchLeave.disabled = true;
  updateControls();
}
function updateControls() {
  const live = Boolean(watching && client.socket?.readyState === 1 && el.watchStale.hidden);
  el.watchCode.disabled = Boolean(watching);
  el.watchJoinSubmit.disabled = pending || live;
  el.watchJoinSubmit.textContent = watching ? live ? "正在观战" : "重新连接" : "进入观战";
}
async function join() {
  if (pending) return;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  const code = el.watchCode.value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { el.watchError.textContent = "请输入 6 位房间码。"; return; }
  pending = true; el.watchJoinSubmit.disabled = true; el.watchError.textContent = "";
  try {
    await client.connect(); await client.watchRoom(code);
    watching = code; retries = 0; el.watchLeave.disabled = false;
    el.watchConnection.textContent = "已进入只读观战；无手牌、牌序和对局操作权限。";
    const next = new URL(location.href); next.searchParams.set("room", code); history.replaceState(null, "", next);
  } catch (error) {
    el.watchError.textContent = error.message;
    if (["SPECTATING_CLOSED", "ROOM_NOT_FOUND", "AUTH_REQUIRED", "SPECTATORS_FULL"].includes(error.code)) {
      watching = ""; clearBoard(error.message);
    } else if (watching) client.resetConnection();
  } finally { pending = false; updateControls(); }
}
client.on("view", render);
client.on("watch-ended", ({ reason }) => { watching = ""; clearTimeout(reconnectTimer); clearBoard(reason); });
client.on("connection", ({ connected }) => {
  if (connected || !watching) return;
  el.watchStale.hidden = false; el.watchConnection.textContent = "连接中断，正在尝试恢复观战…";
  el.watchPhase.textContent = "观战连接已断开 · 最后公开画面";
  updateControls();
  scheduleReconnect();
});
function scheduleReconnect() {
  if (!watching || reconnectTimer) return;
  if (retries >= 8) { el.watchConnection.textContent = "自动重连未成功，可点击重新连接。"; updateControls(); return; }
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null; retries += 1;
    await join();
    if (watching && !client.socket) scheduleReconnect();
  }, Math.min(6000, 700 * (retries + 1)));
}
el.watchJoin.addEventListener("submit", (event) => { event.preventDefault(); if (!watching || !el.watchStale.hidden) { retries = 0; void join(); } });
el.watchLeave.addEventListener("click", async () => {
  if (pending) return;
  pending = true; el.watchLeave.disabled = true;
  watching = ""; clearTimeout(reconnectTimer); reconnectTimer = null;
  updateControls();
  try { await client.leaveRoom(); } catch { client.disconnect(); }
  pending = false;
  client.view = null; client.session = null; clearBoard("已退出观战，不影响双方对局。");
  const next = new URL(location.href); next.searchParams.delete("room"); history.replaceState(null, "", next);
});
el.watchDetailClose.addEventListener("click", () => el.watchDetail.close());
installOnlineLifecycle({ client, document, window,
  onSuspend: () => { if (el.watchDetail.open) el.watchDetail.close(); },
  onResume: async () => {
    if (!watching || pending) return;
    el.watchStale.hidden = false;
    el.watchPhase.textContent = "正在校准公开画面 · 最后收到的场面";
    updateControls();
    if (client.socket?.readyState !== 1) { retries = 0; await join(); return; }
    try {
      await client.sync();
      el.watchConnection.textContent = "已恢复最新公开画面；仍为只读观战。";
      updateControls();
    } catch { client.resetConnection(); scheduleReconnect(); }
  }
});
setInterval(() => { if (client.view && watching && el.watchStale.hidden) el.watchPhase.textContent = spectatorStatus(client.view); }, 1000);
function signedIn(account) {
  el.watchAuth.hidden = true; el.watchJoinPanel.hidden = false;
  el.watchAccount.textContent = `当前账号 @${account.handle} · 本页始终为只读观众，不占用玩家席位`;
}
el.watchLogin.addEventListener("submit", async (event) => {
  event.preventDefault(); if (el.watchLoginSubmit.disabled) return;
  el.watchLoginSubmit.disabled = true; el.watchError.textContent = "";
  try { const result = await auth.login({ handle: el.watchHandle.value, password: el.watchPassword.value }); el.watchPassword.value = ""; signedIn(result.account); if (el.watchCode.value) await join(); }
  catch (error) { el.watchError.textContent = error.message; }
  finally { el.watchLoginSubmit.disabled = false; }
});
const layoutSmoke = url.searchParams.get("smoke");
if (["127.0.0.1", "localhost", "::1"].includes(location.hostname) && url.searchParams.get("test") === "1" &&
  ["spectator-layout-desktop", "spectator-layout-mobile", "spectator-layout-narrow", "spectator-layout-landscape"].includes(layoutSmoke)) {
  const { runSpectatorLayoutSmoke } = await import("./spectator-smoke.js?v=20261107-spectator-1");
  await runSpectatorLayoutSmoke(render, el, layoutSmoke);
} else {
  try { const session = await auth.session(); if (session.authenticated) { signedIn(session.account); if (el.watchCode.value) await join(); } else el.watchAuth.hidden = false; }
  catch (error) { el.watchAuth.hidden = false; el.watchError.textContent = error.message; }
}
