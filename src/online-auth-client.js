function defaultAuthServerUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:5178";
  const duelServer = new URLSearchParams(window.location.search).get("duelServer");
  if (duelServer) {
    const url = new URL(duelServer, window.location.href);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.origin;
  }
  return `${window.location.protocol}//${window.location.hostname}:5178`;
}

export class OnlineAuthClient {
  constructor({ baseUrl = defaultAuthServerUrl(), fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) throw new Error("Fetch is not available in this environment");
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.fetchImpl = (...args) => fetchImpl(...args);
    this.account = null;
  }

  async session() {
    const data = await this.#request("/auth/session");
    this.account = data.authenticated ? data.account : null;
    return data;
  }

  async login({ handle, password }) {
    const data = await this.#request("/auth/login", { method: "POST", body: { handle, password } });
    this.account = data.account;
    return data;
  }

  async register({ handle, password, displayName }) {
    const data = await this.#request("/auth/register", { method: "POST", body: { handle, password, displayName } });
    this.account = data.account;
    return data;
  }

  async logout() {
    const data = await this.#request("/auth/logout", { method: "POST", body: {} });
    this.account = null;
    return data;
  }

  async #request(path, { method = "GET", body } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      throw new Error(`登录服务暂时无法连接${error?.message ? `：${error.message}` : ""}`);
    }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const error = new Error(data.error?.message || "登录请求失败");
      error.code = data.error?.code || "AUTH_REQUEST_FAILED";
      throw error;
    }
    return data;
  }
}

export { defaultAuthServerUrl };
