import assert from "node:assert/strict";
import test from "node:test";

import { isLoopbackHost, onlineOriginAllowed } from "../server/online-origin.js";

test("online origins allow configured deployments and reject unrelated sites", () => {
  const allowedOrigins = new Set(["https://duel.example.com"]);
  assert.equal(onlineOriginAllowed("https://duel.example.com", { allowedOrigins }), true);
  assert.equal(onlineOriginAllowed("https://evil.example.com", { allowedOrigins }), false);
  assert.equal(onlineOriginAllowed("not a url", { allowedOrigins }), false);
  assert.equal(onlineOriginAllowed("", { allowedOrigins }), true, "non-browser smoke clients may omit Origin");
});

test("loopback origins are accepted only for a loopback duel server", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("duel.example.com"), false);
  assert.equal(onlineOriginAllowed("http://127.0.0.1:5177", { allowLoopback: true }), true);
  assert.equal(onlineOriginAllowed("http://localhost:5177", { allowLoopback: true }), true);
  assert.equal(onlineOriginAllowed("http://127.0.0.1:5177", { allowLoopback: false }), false);
});
