import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveStaticRequest } from "../scripts/static-path.mjs";

const root = resolve("static-fixture");
test("static assets resolve normally without exposing private directories or dot files", () => {
  assert.equal(resolveStaticRequest(root, "/"), resolve(root, "index.html"));
  assert.equal(resolveStaticRequest(root, "/src/online-duel-app.js?v=1"), resolve(root, "src/online-duel-app.js"));
  assert.equal(resolveStaticRequest(root, "/assets/card.png"), resolve(root, "assets/card.png"));
  for (const path of ["/.data/online-rooms-5178.json", "/.data/online-auth.json", "/.tmp/account.json", "/.git/config", "/.env", "/src/.private", "/%2Edata/rooms.json", "/%2Edata%5Crooms.json", "/assets/%2E%2E%5C.data/rooms.json", "/%E0%A4%A"]) {
    assert.equal(resolveStaticRequest(root, path), null, path);
  }
});
