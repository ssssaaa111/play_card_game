import assert from "node:assert/strict";
import test from "node:test";

import {
  ONLINE_AUTH_COOKIE,
  OnlineAuthAttemptLimiter,
  OnlineAuthError,
  OnlineAuthStore,
  authCookie,
  clearAuthCookie,
  parseCookieHeader
} from "../server/online-auth.js";

test("auth attempt limiter blocks repeated attempts and resets after its window", () => {
  let now = 1_000;
  const limiter = new OnlineAuthAttemptLimiter({ limit: 3, windowMs: 10_000, now: () => now });
  assert.equal(limiter.attempt("login:one"), 2);
  assert.equal(limiter.attempt("login:one"), 1);
  assert.equal(limiter.attempt("login:one"), 0);
  assert.throws(
    () => limiter.attempt("login:one"),
    (error) => error instanceof OnlineAuthError && error.code === "RATE_LIMITED" && error.status === 429 && error.retryAfterSeconds === 10
  );
  assert.equal(limiter.attempt("login:two"), 2, "separate account and address keys keep independent budgets");
  now += 10_001;
  assert.equal(limiter.attempt("login:one"), 2);
  assert.equal(limiter.reset("login:one"), true);
  assert.equal(limiter.attempt("login:one"), 2);
});

test("online accounts register, log in, and restore an HttpOnly cookie session", () => {
  let now = 1_000;
  const store = new OnlineAuthStore({ now: () => now, maxAgeSeconds: 600 });
  const registered = store.register({ handle: "star_one", password: "orbit-123", displayName: "星野" });

  assert.equal(registered.account.handle, "star_one");
  assert.equal(registered.account.displayName, "星野");
  assert.equal(store.accountForToken(registered.token)?.id, registered.account.id);
  assert.match(authCookie(registered.token), new RegExp(`^${ONLINE_AUTH_COOKIE}=`));
  assert.match(authCookie(registered.token), /HttpOnly/);
  assert.match(authCookie(registered.token), /SameSite=Lax/);

  const parsed = parseCookieHeader(`theme=dark; ${ONLINE_AUTH_COOKIE}=${registered.token}`);
  assert.equal(store.accountForToken(parsed[ONLINE_AUTH_COOKIE])?.handle, "star_one");

  const loggedIn = store.login({ handle: "STAR_ONE", password: "orbit-123" });
  assert.equal(loggedIn.account.id, registered.account.id);
  assert.equal(store.logout(loggedIn.token), true);
  assert.equal(store.accountForToken(loggedIn.token), null);
  assert.match(clearAuthCookie(), /Max-Age=0/);

  now += 601_000;
  assert.equal(store.accountForToken(registered.token), null);
});

test("online accounts reject duplicate handles and invalid credentials", () => {
  const store = new OnlineAuthStore();
  store.register({ handle: "duelist", password: "secret-1", displayName: "决斗者" });

  assert.throws(
    () => store.register({ handle: "DUELIST", password: "secret-2", displayName: "另一位" }),
    (error) => error instanceof OnlineAuthError && error.code === "ACCOUNT_EXISTS"
  );
  assert.throws(
    () => store.login({ handle: "duelist", password: "wrong-1" }),
    (error) => error instanceof OnlineAuthError && error.code === "INVALID_CREDENTIALS"
  );
});
