import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { WebSocket } from "ws";

const serverUrl = process.env.DUEL_SERVER_URL || "ws://127.0.0.1:5178/duel";
const expectedLimit = Math.max(1, Number(process.env.DUEL_EXPECTED_AUTH_LIMIT) || 3);
const httpUrl = new URL(serverUrl);
httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
const baseUrl = httpUrl.origin;
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);

async function register(handle) {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password: "security-pass-1", displayName: `安全测试 ${handle.slice(-2)}` })
  });
  const body = await response.json();
  assert.equal(response.status, 201, body.error?.message || "registration failed");
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

const blockedHttp = await fetch(`${baseUrl}/auth/session`, { headers: { Origin: "https://evil.example.com" } });
assert.equal(blockedHttp.status, 403);

await new Promise((resolve, reject) => {
  const socket = new WebSocket(serverUrl, { origin: "https://evil.example.com" });
  socket.once("open", () => reject(new Error("untrusted WebSocket origin was accepted")));
  socket.once("unexpected-response", (_request, response) => {
    try {
      assert.equal(response.statusCode, 403);
      response.destroy();
      resolve();
    } catch (error) { reject(error); }
  });
  socket.once("error", (error) => {
    if (!String(error.message).includes("403")) reject(error);
  });
});

const limitedHandle = `guard_${suffix}`;
await register(limitedHandle);
const validCookie = await register(`clean_${suffix}`);
for (let index = 0; index < expectedLimit; index += 1) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: limitedHandle, password: "wrong-pass" })
  });
  assert.equal(response.status, 401);
}
const limited = await fetch(`${baseUrl}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ handle: limitedHandle, password: "wrong-pass" })
});
const limitedBody = await limited.json();
assert.equal(limited.status, 429);
assert.equal(limitedBody.error?.code, "RATE_LIMITED");
assert.ok(Number(limited.headers.get("retry-after")) > 0);

await new Promise((resolve, reject) => {
  const socket = new WebSocket(serverUrl, {
    origin: "http://127.0.0.1:5193",
    headers: { Cookie: validCookie }
  });
  socket.once("open", () => {});
  socket.once("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString("utf8"));
      assert.equal(message.type, "transport/connected");
      assert.equal(message.data?.authenticated, true);
      socket.close();
      resolve();
    } catch (error) { reject(error); }
  });
  socket.once("error", reject);
});

console.log(`online-security-smoke passed (${limitedHandle}, limit ${expectedLimit})`);
