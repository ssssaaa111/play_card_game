import { DuelClientMessage } from "./duel-command.js?v=20261114-public-history-1";

// Coming back to the page never repeats a gameplay command. A foreground sync
// must finish before actions are unlocked; merely hiding a tab keeps its seat.
export function installOnlineLifecycle({ client, document, window, onSuspend = () => {}, onResume = async () => {} }) {
  let hidden = document.visibilityState === "hidden", needsResume = hidden, inFlight = false, disposed = false;
  async function resume() {
    if (disposed || document.visibilityState === "hidden" || inFlight || !client.session || window.navigator?.onLine === false) return;
    needsResume = false; inFlight = true;
    try { await onResume(); } catch {} finally { inFlight = false; }
  }
  const visibility = () => {
    if (document.visibilityState === "hidden") { hidden = true; needsResume = true; onSuspend(); }
    else if (hidden || needsResume) { hidden = false; void resume(); }
  };
  const offline = () => {
    needsResume = true; onSuspend();
    client.resetConnection(Object.assign(new Error("设备当前离线，本页已锁定操作；恢复网络后会重新核对战况。"), { code: "NETWORK_OFFLINE" }));
  };
  const online = () => { needsResume = true; void resume(); };
  const focus = () => { if (needsResume) void resume(); };
  const pageshow = (event) => { if (event.persisted) { needsResume = true; void resume(); } };
  const freeze = () => { needsResume = true; onSuspend(); };
  const thaw = () => { needsResume = true; void resume(); };
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("freeze", freeze); document.addEventListener("resume", thaw);
  window.addEventListener("offline", offline); window.addEventListener("online", online);
  window.addEventListener("focus", focus); window.addEventListener("pageshow", pageshow);
  const heartbeat = window.setInterval(() => {
    if (!disposed && !inFlight && client.session && client.socket?.readyState === 1 && document.visibilityState !== "hidden") {
      void client.request(DuelClientMessage.ping).catch(() => {});
    }
  }, 15_000);
  return { resume, dispose() {
    disposed = true; window.clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("freeze", freeze); document.removeEventListener("resume", thaw);
    window.removeEventListener("offline", offline); window.removeEventListener("online", online);
    window.removeEventListener("focus", focus); window.removeEventListener("pageshow", pageshow);
  } };
}
