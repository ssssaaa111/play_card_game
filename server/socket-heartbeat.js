// WebSocket control frames are answered by browsers even when JS timers are
// throttled. Only a missing pong closes a socket; hiding a tab is not a leave.
export function startSocketHeartbeat(server, { intervalMs = 15_000, timers = globalThis } = {}) {
  const alive = new WeakMap();
  const track = (socket) => { alive.set(socket, true); socket.on("pong", () => alive.set(socket, true)); };
  server.on("connection", track);
  const timer = timers.setInterval(() => {
    for (const socket of server.clients) {
      if (socket.readyState !== 1) continue;
      if (alive.get(socket) === false) { socket.terminate(); continue; }
      alive.set(socket, false);
      try { socket.ping(); } catch { socket.terminate(); }
    }
  }, intervalMs);
  timer?.unref?.();
  server.on("close", () => timers.clearInterval(timer));
}
