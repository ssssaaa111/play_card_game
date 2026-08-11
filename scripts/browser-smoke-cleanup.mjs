import { rm } from "node:fs/promises";

const RETRYABLE_REMOVE_CODES = new Set([
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "ENOTEMPTY",
  "EPERM"
]);

export async function removeBrowserProfileDir(profileDir, {
  remove = rm,
  wait = waitForDelay,
  retries = 5,
  retryDelayMs = 100
} = {}) {
  const retryLimit = Math.max(0, Number(retries) || 0);
  const baseDelayMs = Math.max(0, Number(retryDelayMs) || 0);

  for (let attempt = 0; ; attempt += 1) {
    try {
      await remove(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!RETRYABLE_REMOVE_CODES.has(error?.code) || attempt >= retryLimit) throw error;
      await wait(baseDelayMs * (attempt + 1));
    }
  }
}

function waitForDelay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
