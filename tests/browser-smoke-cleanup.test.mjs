import test from "node:test";
import assert from "node:assert/strict";

import { removeBrowserProfileDir } from "../scripts/browser-smoke-cleanup.mjs";

test("browser profile cleanup retries transient Chromium cache races", async () => {
  const waits = [];
  let attempts = 0;

  await removeBrowserProfileDir("/tmp/browser-smoke-profile", {
    remove: async (target, options) => {
      attempts += 1;
      assert.equal(target, "/tmp/browser-smoke-profile");
      assert.deepEqual(options, { recursive: true, force: true });
      if (attempts < 3) {
        throw Object.assign(new Error("cache is still busy"), { code: "ENOTEMPTY" });
      }
    },
    wait: async (delayMs) => waits.push(delayMs),
    retries: 4,
    retryDelayMs: 25
  });

  assert.equal(attempts, 3);
  assert.deepEqual(waits, [25, 50]);
});

test("browser profile cleanup does not hide permanent filesystem failures", async () => {
  const denied = Object.assign(new Error("permission denied"), { code: "EACCES" });

  await assert.rejects(
    removeBrowserProfileDir("/tmp/browser-smoke-profile", {
      remove: async () => { throw denied; },
      wait: async () => assert.fail("permanent errors must not be retried")
    }),
    denied
  );
});
