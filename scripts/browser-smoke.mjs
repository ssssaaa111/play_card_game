import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5177";
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 60000;
const DEFAULT_SMOKES = [
  "game-over-event",
  "mode-auto-end",
  "battle-trap",
  "basic-expansion",
  "chain-trap-choice",
  "combo-spell",
  "equipment-spell",
  "support-target-readability-basic"
];

function browserCandidates() {
  const candidates = [];
  if (process.env.BROWSER_BIN) candidates.push(process.env.BROWSER_BIN);
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    );
  } else {
    candidates.push("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge");
  }
  return candidates;
}

function resolveBrowserBin() {
  for (const candidate of browserCandidates()) {
    if (!candidate.includes(path.sep) || existsSync(candidate)) return candidate;
  }
  throw new Error("No Chrome/Edge browser found. Set BROWSER_BIN to a Chromium-compatible executable.");
}

function parseArgs(argv) {
  const smokes = [];
  let baseUrl = process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
  let timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS) || 45000;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1] || baseUrl;
      index += 1;
    } else if (arg === "--timeout-ms") {
      timeoutMs = Number(argv[index + 1]) || timeoutMs;
      index += 1;
    } else {
      smokes.push(arg);
    }
  }
  return { baseUrl, timeoutMs, smokes: smokes.length ? smokes : DEFAULT_SMOKES };
}

async function assertServerReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Dev server is not reachable at ${baseUrl}. Start it with npm run serve. ${error.message}`);
  }
}

function runBrowser({ browserBin, profileDir, url, timeoutMs }) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--mute-audio",
    `--user-data-dir=${profileDir}`,
    "--run-all-compositor-stages-before-draw",
    `--virtual-time-budget=${DEFAULT_VIRTUAL_TIME_BUDGET_MS}`,
    "--dump-dom",
    url
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(browserBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Browser smoke timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function smokeStatusFromDom(html) {
  const status = html.match(/data-smoke-status="([^"]+)"/)?.[1] || "";
  const detail = html.match(/data-smoke-detail="([^"]*)"/)?.[1] || "";
  return { status, detail };
}

function browserProfileRoots() {
  return [
    path.join(process.cwd(), ".tmp"),
    path.join(tmpdir(), "star-card-duel-browser-smoke")
  ];
}

async function createBrowserProfileDir() {
  const errors = [];
  for (const root of browserProfileRoots()) {
    try {
      await mkdir(root, { recursive: true });
      return await mkdtemp(path.join(root, "browser-smoke-profile-"));
    } catch (error) {
      errors.push(`${root}: ${error.message}`);
    }
  }
  throw new Error(`Unable to create browser smoke profile directory. ${errors.join(" | ")}`);
}

async function runSmoke({ smoke, baseUrl, timeoutMs, browserBin }) {
  const profileDir = await createBrowserProfileDir();
  const url = `${baseUrl}/?test=1&smoke=${encodeURIComponent(smoke)}&t=${Date.now()}`;
  try {
    const result = await runBrowser({ browserBin, profileDir, url, timeoutMs });
    const { status, detail } = smokeStatusFromDom(result.stdout);
    if (result.code !== 0) {
      throw new Error(`${smoke} browser exited with ${result.code}: ${result.stderr.trim()}`);
    }
    if (status !== "passed") {
      const diagnostic = result.stderr.trim() || result.stdout.slice(0, 500);
      throw new Error(`${smoke} ${status || "missing-status"} ${detail ? `(${detail})` : ""}\n${diagnostic}`);
    }
    console.log(`${smoke} passed`);
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserBin = resolveBrowserBin();
  await assertServerReachable(options.baseUrl);
  for (const smoke of options.smokes) {
    await runSmoke({ ...options, smoke, browserBin });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
