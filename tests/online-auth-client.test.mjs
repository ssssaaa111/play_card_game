import assert from "node:assert/strict";
import test from "node:test";

import { OnlineAuthClient } from "../src/online-auth-client.js";

test("auth client keeps cookie credentials on session, login, register, and logout", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const account = { id: "account-1", handle: "star_one", displayName: "星野" };
    return new Response(JSON.stringify(url.endsWith("/auth/logout")
      ? { authenticated: false, account: null }
      : { authenticated: true, account }), { status: url.endsWith("/auth/register") ? 201 : 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new OnlineAuthClient({ baseUrl: "http://127.0.0.1:5180/", fetchImpl });

  await client.session();
  await client.login({ handle: "star_one", password: "secret-1" });
  await client.register({ handle: "star_two", password: "secret-2", displayName: "月见" });
  await client.logout();

  assert.deepEqual(calls.map((call) => call.url), [
    "http://127.0.0.1:5180/auth/session",
    "http://127.0.0.1:5180/auth/login",
    "http://127.0.0.1:5180/auth/register",
    "http://127.0.0.1:5180/auth/logout"
  ]);
  assert.ok(calls.every((call) => call.options.credentials === "include"));
  assert.equal(JSON.parse(calls[1].options.body).handle, "star_one");
  assert.equal(JSON.parse(calls[2].options.body).displayName, "月见");
  assert.equal(client.account, null);
});

test("auth client surfaces server account errors", async () => {
  const client = new OnlineAuthClient({
    baseUrl: "http://127.0.0.1:5180",
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "账号或密码不正确" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  });

  await assert.rejects(
    client.login({ handle: "star_one", password: "wrong-1" }),
    (error) => error.code === "INVALID_CREDENTIALS" && error.message === "账号或密码不正确"
  );
});

test("auth client exposes retry timing for rate-limited login feedback", async () => {
  const client = new OnlineAuthClient({
    baseUrl: "http://127.0.0.1:5180",
    fetchImpl: async () => new Response(JSON.stringify({ error: {
      code: "RATE_LIMITED", message: "尝试次数过多，请稍后重试", retryAfterSeconds: 42
    } }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "42" }
    })
  });

  await assert.rejects(
    client.login({ handle: "star_one", password: "wrong-1" }),
    (error) => error.code === "RATE_LIMITED" && error.retryAfterSeconds === 42
  );
});
