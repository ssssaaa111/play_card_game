const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(hostname = "") {
  return LOOPBACK_HOSTS.has(String(hostname || "").toLowerCase());
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
