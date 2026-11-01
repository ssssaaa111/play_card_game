import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ONLINE_AUTH_COOKIE = "star_duel_session";
export const ONLINE_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,23}$/;

export class OnlineAuthError extends Error {
  constructor(message, code = "AUTH_ERROR", status = 400, retryAfterSeconds = null) {
    super(message);
    this.name = "OnlineAuthError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds == null ? null : Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1));
  }
}

export class OnlineAuthAttemptLimiter {
  constructor({ limit = 8, windowMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.limit = Math.max(1, Number(limit) || 8);
    this.windowMs = Math.max(1_000, Number(windowMs) || 10 * 60 * 1000);
    this.now = now;
    this.attempts = new Map();
  }

  attempt(key) {
    const normalizedKey = String(key || "unknown");
    const now = this.now();
    const cutoff = now - this.windowMs;
    const recent = (this.attempts.get(normalizedKey) || []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
      this.attempts.set(normalizedKey, recent);
      throw new OnlineAuthError(`尝试次数过多，请在 ${retryAfterSeconds} 秒后重试`, "RATE_LIMITED", 429, retryAfterSeconds);
    }
    recent.push(now);
    this.attempts.set(normalizedKey, recent);
    return this.limit - recent.length;
  }

  reset(key) {
    return this.attempts.delete(String(key || "unknown"));
  }
}

function normalizeHandle(value) {
  const handle = String(value || "").trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw new OnlineAuthError("账号需为 3–24 位小写字母、数字、下划线或短横线", "INVALID_HANDLE");
  }
  return handle;
}

function normalizeDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 24) {
    throw new OnlineAuthError("对战昵称需为 1–24 个字符", "INVALID_DISPLAY_NAME");
  }
  return name;
}

function normalizePassword(value) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 6 || password.length > 72) {
    throw new OnlineAuthError("密码需为 6–72 个字符", "INVALID_PASSWORD");
  }
  return password;
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 32).toString("base64url");
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function publicAccount(account) {
  return account ? {
    id: account.id,
    handle: account.handle,
    displayName: account.displayName,
    createdAt: account.createdAt
  } : null;
}

export function parseCookieHeader(header = "") {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}

export function authCookie(token, { secure = false, maxAge = ONLINE_AUTH_MAX_AGE_SECONDS } = {}) {
  const parts = [
    `${ONLINE_AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAuthCookie({ secure = false } = {}) {
  return authCookie("", { secure, maxAge: 0 });
}

export class OnlineAuthStore {
  constructor({ filePath = null, now = () => Date.now(), maxAgeSeconds = ONLINE_AUTH_MAX_AGE_SECONDS } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.maxAgeSeconds = Math.max(60, Number(maxAgeSeconds) || ONLINE_AUTH_MAX_AGE_SECONDS);
    this.data = { version: 1, accounts: [], sessions: [] };
    this.#load();
  }

  register({ handle, password, displayName }) {
    const normalizedHandle = normalizeHandle(handle);
    const normalizedPassword = normalizePassword(password);
    const normalizedName = normalizeDisplayName(displayName);
    if (this.data.accounts.some((account) => account.handle === normalizedHandle)) {
      throw new OnlineAuthError("这个账号已存在，请直接登录", "ACCOUNT_EXISTS", 409);
    }
    const salt = randomBytes(16).toString("base64url");
    const account = {
      id: randomUUID(),
      handle: normalizedHandle,
      displayName: normalizedName,
      salt,
      passwordHash: passwordDigest(normalizedPassword, salt),
      createdAt: this.now()
    };
    this.data.accounts.push(account);
    const result = this.#createSession(account);
    this.#save();
    return result;
  }

  login({ handle, password }) {
    const normalizedHandle = normalizeHandle(handle);
    const normalizedPassword = normalizePassword(password);
    const account = this.data.accounts.find((candidate) => candidate.handle === normalizedHandle);
    const comparisonSalt = account?.salt || "missing-account-salt";
    const comparisonHash = passwordDigest(normalizedPassword, comparisonSalt);
    if (!account || !safeEqual(comparisonHash, account.passwordHash)) {
      throw new OnlineAuthError("账号或密码不正确", "INVALID_CREDENTIALS", 401);
    }
    const result = this.#createSession(account);
    this.#save();
    return result;
  }

  accountForToken(token) {
    if (!token) return null;
    this.#pruneExpiredSessions();
    const digest = tokenDigest(token);
    const session = this.data.sessions.find((candidate) => candidate.tokenHash === digest);
    if (!session) return null;
    return publicAccount(this.data.accounts.find((account) => account.id === session.accountId));
  }

  accountForCookieHeader(header) {
    return this.accountForToken(parseCookieHeader(header)[ONLINE_AUTH_COOKIE]);
  }

  logout(token) {
    if (!token) return false;
    const digest = tokenDigest(token);
    const previousLength = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== digest);
    if (this.data.sessions.length !== previousLength) this.#save();
    return this.data.sessions.length !== previousLength;
  }

  #createSession(account) {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    this.#pruneExpiredSessions();
    this.data.sessions.push({
      tokenHash: tokenDigest(token),
      accountId: account.id,
      createdAt: now,
      expiresAt: now + this.maxAgeSeconds * 1000
    });
    return { token, account: publicAccount(account) };
  }

  #pruneExpiredSessions() {
    const now = this.now();
    this.data.sessions = this.data.sessions.filter((session) => Number(session.expiresAt) > now);
  }

  #load() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (parsed?.version === 1 && Array.isArray(parsed.accounts) && Array.isArray(parsed.sessions)) {
        this.data = parsed;
        this.#pruneExpiredSessions();
      }
    } catch {
      throw new OnlineAuthError("账号数据文件无法读取，请检查后重启服务", "AUTH_STORE_CORRUPT", 500);
    }
  }

  #save() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(temporaryPath, this.filePath);
  }
}
