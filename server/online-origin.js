const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);

export function isLoopbackHost(hostname = "") {
  const normalized = String(hostname || "").toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function onlineOriginAllowed(origin = "", { allowedOrigins = [], allowLoopback = false } = {}) {
  const value = String(origin || "").trim();
  if (!value) return true;
  const configured = allowedOrigins instanceof Set ? allowedOrigins : new Set(allowedOrigins);
  if (configured.has(value)) return true;
  if (!allowLoopback) return false;
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}
