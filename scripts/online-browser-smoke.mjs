import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { WebSocket } from "ws";

import { removeBrowserProfileDir } from "./browser-smoke-cleanup.mjs";

const DEFAULT_FRONTEND_URL = "http://127.0.0.1:5221";
const DEFAULT_DUEL_SERVER_URL = "http://127.0.0.1:5223";

function parseArgs(argv) {
  const result = {
    frontendUrl: process.env.ONLINE_BROWSER_FRONTEND_URL || DEFAULT_FRONTEND_URL,
    duelServerUrl: process.env.ONLINE_BROWSER_DUEL_SERVER_URL || DEFAULT_DUEL_SERVER_URL,
    timeoutMs: Number(process.env.ONLINE_BROWSER_TIMEOUT_MS) || 45_000,
    artifactDir: process.env.ONLINE_BROWSER_ARTIFACT_DIR || path.resolve(".tmp", "online-browser-smoke")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--frontend-url" && value) result.frontendUrl = value, index += 1;
    else if (argv[index] === "--duel-server-url" && value) result.duelServerUrl = value, index += 1;
    else if (argv[index] === "--timeout-ms" && value) result.timeoutMs = Number(value) || result.timeoutMs, index += 1;
    else if (argv[index] === "--artifact-dir" && value) result.artifactDir = path.resolve(value), index += 1;
  }
  return result;
}

function browserCandidates() {
  const candidates = [];
  if (process.env.BROWSER_BIN) candidates.push(process.env.BROWSER_BIN);
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
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
  const browser = browserCandidates().find((candidate) => !candidate.includes(path.sep) || existsSync(candidate));
  if (!browser) throw new Error("No Chrome/Edge browser found. Set BROWSER_BIN to a Chromium-compatible executable.");
  return browser;
}

async function waitFor(check, label, timeoutMs, intervalMs = 40) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpConnection {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.sequence = 0;
    this.pending = new Map();
    socket.on("message", (raw) => {
      if (process.env.ONLINE_BROWSER_DEBUG === "1") console.error(`CDP ${raw.toString("utf8").slice(0, 1000)}`);
      const message = JSON.parse(raw.toString("utf8"));
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
    });
    socket.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Browser closed while waiting for ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  static connect(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chromium DevTools")), timeoutMs);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve(new CdpConnection(socket, timeoutMs));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools command timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function ensureAccount(origin, handle, displayName) {
  const password = "browser-smoke-pass-1";
  let response = await fetch(`${origin}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password, displayName })
  });
  let body = await response.json();
  if (response.status === 409) {
    response = await fetch(`${origin}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, password })
    });
    body = await response.json();
  }
  assert.ok([200, 201].includes(response.status), body.error?.message || `Unable to authenticate ${displayName}`);
  const cookie = response.headers.get("set-cookie")?.match(/star_duel_session=([^;]+)/)?.[1] || "";
  assert.ok(cookie, `Registration for ${displayName} did not return a session cookie`);
  return { handle, cookie };
}

async function createPage(browser, cookieOrigin, cookieValue, targetUrl, timeoutMs) {
  const target = await waitFor(async () => {
    const response = await fetch(`${browser.devtoolsHttpOrigin}/json/list`);
    const targets = await response.json();
    if (process.env.ONLINE_BROWSER_DEBUG === "1") console.error(JSON.stringify(targets, null, 2));
    return targets.find((entry) => entry.type === "page" && entry.url?.startsWith("data:text/html") && entry.webSocketDebuggerUrl)
      || targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl)
      || null;
  }, "DevTools page target", timeoutMs, 40);
  const pageCdp = await CdpConnection.connect(target.webSocketDebuggerUrl, timeoutMs);
  const cookieResult = await pageCdp.send("Network.setCookie", {
    name: "star_duel_session",
    value: cookieValue,
    url: cookieOrigin,
    httpOnly: true,
    sameSite: "Lax"
  });
  assert.notEqual(cookieResult.success, false, "Chromium rejected the auth cookie");
  await pageCdp.send("Page.navigate", { url: targetUrl });
  return { targetId: target.id, cdp: pageCdp };
}

async function evaluate(cdp, page, expression) {
  const response = await (page.cdp || cdp).send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed");
  }
  return response.result?.value;
}

async function waitForPage(cdp, page, expression, label, timeoutMs) {
  return waitFor(() => evaluate(cdp, page, expression), label, timeoutMs);
}

function visibleExpression(selector) {
  return `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return Boolean(element && !element.hidden && element.getClientRects().length); })()`;
}

function textMatchExpression(selector, text) {
  return `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].some((element) => !element.hidden && element.getClientRects().length && (element.getAttribute("aria-label") || element.textContent || "").includes(${JSON.stringify(text)})))()`;
}

async function click(cdp, page, selector) {
  const result = await evaluate(cdp, page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.disabled) return false; element.click(); return true; })()`);
  assert.equal(result, true, `Unable to click ${selector}`);
}

async function dispatchDoubleClick(page, point, label) {
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), `Unable to locate ${label}`);
  const input = page.cdp;
  await input.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await input.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await input.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await input.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 2 });
  await input.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 2 });
}

async function doubleClickText(cdp, page, selector, text) {
  const point = await evaluate(cdp, page, `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((entry) => !entry.hidden && entry.getClientRects().length && (entry.getAttribute("aria-label") || entry.textContent || "").includes(${JSON.stringify(text)}));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await dispatchDoubleClick(page, point, text);
}

async function doubleClick(cdp, page, selector) {
  const point = await evaluate(cdp, page, `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((entry) => !entry.hidden && entry.getClientRects().length && !entry.disabled);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await dispatchDoubleClick(page, point, selector);
}

async function fill(cdp, page, selector, value) {
  const result = await evaluate(cdp, page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.equal(result, true, `Unable to fill ${selector}`);
}

async function endTurn(cdp, page, timeoutMs) {
  await click(cdp, page, "#endTurnButton");
  const confirmation = await waitForPage(cdp, page, `(() => {
    const button = document.querySelector("#endTurnButton");
    return button?.dataset.confirming === "true" ? "confirm" : document.querySelector("#turnLabel")?.textContent?.trim() !== "你的回合" ? "ended" : "";
  })()`, "end-turn confirmation", timeoutMs);
  if (confirmation === "confirm") await click(cdp, page, "#endTurnButton");
}

async function installStageObserver(cdp, page) {
  await evaluate(cdp, page, `(() => {
    window.__onlineStageHistory = [];
    const roots = [
      ["action", document.querySelector("#actionStage")],
      ["chain", document.querySelector("#chainResolutionStage")]
    ];
    const capture = () => {
      for (const [kind, element] of roots) {
        if (!element || element.hidden || !element.getClientRects().length) continue;
        const entry = {
          at: Math.round(performance.now()),
          kind,
          tone: element.dataset.kind || "chain",
          actor: element.dataset.actor || "system",
          depth: Number(element.dataset.queueDepth || 0),
          text: (element.innerText || "").replace(/\\s+/g, " ").trim()
        };
        const last = window.__onlineStageHistory.at(-1);
        const key = JSON.stringify([entry.kind, entry.tone, entry.actor, entry.depth, entry.text]);
        if (last?.key !== key) window.__onlineStageHistory.push({ ...entry, key });
      }
    };
    for (const [, element] of roots) {
      if (element) new MutationObserver(capture).observe(element, { attributes: true, childList: true, subtree: true });
    }
    capture();
    return true;
  })()`);
}

async function stageHistory(cdp, page) {
  return evaluate(cdp, page, `(window.__onlineStageHistory || []).map(({ key, ...entry }) => entry)`);
}

async function startBrowser(browserBin, profileDir, timeoutMs) {
  const child = spawn(browserBin, [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    "--disable-features=Vulkan,UseSkiaRenderer,SkiaGraphite,WebGPU",
    "--use-angle=swiftshader",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--window-size=1440,900",
    `--user-data-dir=${profileDir}`,
    "data:text/html,<title>card-duel-qa</title>"
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("exit", (code, signal) => {
    if (code != null && code !== 0) console.error(`Chromium exited (${code ?? signal}): ${stderr.slice(-1600)}`);
  });
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  const activePort = await waitFor(async () => {
    try {
      const [port, browserPath] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
      return port && browserPath ? { port, browserPath } : null;
    } catch {
      if (child.exitCode != null) throw new Error(`Chromium exited with ${child.exitCode}: ${stderr.slice(-1200)}`);
      return null;
    }
  }, "Chromium DevTools endpoint", timeoutMs, 50);
  return {
    child,
    devtoolsUrl: `ws://127.0.0.1:${activePort.port}${activePort.browserPath}`,
    devtoolsHttpOrigin: `http://127.0.0.1:${activePort.port}`
  };
}

const options = parseArgs(process.argv.slice(2));
const frontend = new URL(options.frontendUrl);
const duelServer = new URL(options.duelServerUrl);
const secondFrontend = new URL(frontend);
const secondDuelServer = new URL(duelServer);
const browserBin = resolveBrowserBin();
const firstProfileDir = await mkdtemp(path.join(tmpdir(), "card-duel-online-browser-p1-"));
const secondProfileDir = await mkdtemp(path.join(tmpdir(), "card-duel-online-browser-p2-"));
let firstBrowser = null;
let secondBrowser = null;
let firstPage = null;
let secondPage = null;
const cdp = null; // Page helpers use each page's isolated DevTools connection.

try {
  const [frontendHealth, duelHealth] = await Promise.all([
    fetch(new URL("/online.html", frontend)),
    fetch(new URL("/health", duelServer))
  ]);
  assert.equal(frontendHealth.status, 200, "Online page is not reachable");
  assert.equal(duelHealth.status, 200, "Duel server is not reachable");

  const [firstAccount, secondAccount] = await Promise.all([
    ensureAccount(duelServer.origin, "browser_stage_p1", "星野演出测试"),
    ensureAccount(secondDuelServer.origin, "browser_stage_p2", "月见演出测试")
  ]);
  firstBrowser = await startBrowser(browserBin, firstProfileDir, options.timeoutMs);
  secondBrowser = await startBrowser(browserBin, secondProfileDir, options.timeoutMs);
  const socketUrl = new URL(duelServer);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.pathname = "/duel";
  const secondSocketUrl = new URL(secondDuelServer);
  secondSocketUrl.protocol = secondSocketUrl.protocol === "https:" ? "wss:" : "ws:";
  secondSocketUrl.pathname = "/duel";
  const firstUrl = new URL("/online.html", frontend);
  firstUrl.searchParams.set("duelServer", socketUrl.toString());
  firstUrl.searchParams.set("qa", "browser-action-stage-p1");
  const secondUrl = new URL("/online.html", secondFrontend);
  secondUrl.searchParams.set("duelServer", secondSocketUrl.toString());
  secondUrl.searchParams.set("qa", "browser-action-stage-p2");
  firstPage = await createPage(firstBrowser, duelServer.origin, firstAccount.cookie, firstUrl.toString(), options.timeoutMs);
  secondPage = await createPage(secondBrowser, secondDuelServer.origin, secondAccount.cookie, secondUrl.toString(), options.timeoutMs);
  await Promise.all([
    waitForPage(cdp, firstPage, visibleExpression("#createRoom"), "1P lobby", options.timeoutMs),
    waitForPage(cdp, secondPage, visibleExpression("#joinRoom"), "2P lobby", options.timeoutMs)
  ]);
  await Promise.all([installStageObserver(cdp, firstPage), installStageObserver(cdp, secondPage)]);

  await click(cdp, firstPage, "#createRoom");
  const roomCode = await waitForPage(cdp, firstPage, `(() => document.querySelector("#copyRoomCode")?.textContent?.trim() || "")()`, "room code", options.timeoutMs);
  await fill(cdp, secondPage, "#roomCodeInput", roomCode);
  await click(cdp, secondPage, "#joinRoom");
  await Promise.all([
    waitForPage(cdp, firstPage, visibleExpression("#readyButton"), "1P ready button", options.timeoutMs),
    waitForPage(cdp, secondPage, visibleExpression("#readyButton"), "2P ready button", options.timeoutMs)
  ]);
  await click(cdp, firstPage, "#readyButton");
  await click(cdp, secondPage, "#readyButton");
  await Promise.all([
    waitForPage(cdp, firstPage, textMatchExpression("#hand .card", "双重召唤"), "1P fixed opening", options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression("#hand .card", "弱化力场"), "2P fixed opening", options.timeoutMs)
  ]);

  await doubleClickText(cdp, firstPage, "#hand .card", "双重召唤");
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "双重召唤"), "spell action stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#hand .card.action-ready", "日冕骑士"), "solar knight action", options.timeoutMs);
  await doubleClickText(cdp, firstPage, "#hand .card.action-ready", "日冕骑士");
  await waitForPage(cdp, firstPage, `(window.__onlineStageHistory || []).some((entry) => entry.kind === "action" && entry.depth >= 1)`, "queued public action", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "怪兽召唤"), "queued summon stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, visibleExpression("#playerField .slot[data-card-uid]"), "summoned attacker", options.timeoutMs);

  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "2P turn", options.timeoutMs);
  await doubleClickText(cdp, secondPage, "#hand .card.action-ready", "弱化力场");
  await waitForPage(cdp, secondPage, visibleExpression("#playerTraps .trap-slot:not(.empty)"), "set weakening web", options.timeoutMs);
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "1P attack turn", options.timeoutMs);

  await waitForPage(cdp, firstPage, visibleExpression('#playerField .slot[data-attack-state="ready"]'), "attack-ready field highlight", options.timeoutMs);
  await doubleClick(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await waitForPage(cdp, firstPage, `(() => Boolean(document.querySelector(".online-response-attacker")) || (document.querySelector("#actionStage")?.innerText || "").includes("直接攻击"))()`, "declared attack presentation", options.timeoutMs);
  await waitForPage(cdp, secondPage, `(() => { const button = document.querySelector("#responseActivate"); return Boolean(button && !button.disabled && button.getClientRects().length); })()`, "trap activation", options.timeoutMs);
  await click(cdp, secondPage, "#responseActivate");

  try {
    await waitForPage(cdp, firstPage, `(window.__onlineStageHistory || []).some((entry) => entry.text.includes("月见演出测试") && (entry.text.includes("直接攻击") || entry.text.includes("直接命中")))`, "direct-attack public target stage", options.timeoutMs);
  } catch (error) {
    const [history, currentStage, responseText] = await Promise.all([
      stageHistory(cdp, firstPage),
      evaluate(cdp, firstPage, `document.querySelector("#actionStage")?.innerText || ""`),
      evaluate(cdp, secondPage, `document.querySelector("#responsePanel")?.innerText || ""`)
    ]);
    console.error(`online-browser-smoke stage diagnostics: ${JSON.stringify({ history, currentStage, responseText })}`);
    throw error;
  }
  await waitForPage(cdp, firstPage, `(() => {
    const stages = [document.querySelector("#actionStage"), document.querySelector("#chainResolutionStage")];
    return stages.some((stage) => stage && !stage.hidden && stage.getClientRects().length && (stage.innerText || "").includes("1200"));
  })()`, "visible 1200-damage presentation", options.timeoutMs);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  await mkdir(options.artifactDir, { recursive: true });
  const screenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const screenshotPath = path.join(options.artifactDir, `online-action-stage-${roomCode}.png`);
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  await Promise.all([
    waitForPage(cdp, firstPage, `document.querySelector("#aiPanel")?.textContent?.includes("2800 / 4000")`, "1P final rival LP", options.timeoutMs),
    waitForPage(cdp, secondPage, `document.querySelector("#playerPanel")?.textContent?.includes("2800 / 4000")`, "2P final LP", options.timeoutMs),
    waitForPage(cdp, firstPage, `document.querySelector("#eventLogList")?.textContent?.includes("1200 伤害")`, "exact battle receipt", options.timeoutMs)
  ]);
  const [firstStages, secondStages] = await Promise.all([stageHistory(cdp, firstPage), stageHistory(cdp, secondPage)]);
  assert.ok(firstStages.some((entry) => entry.text.includes("双重召唤")), "Spell action stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.text.includes("怪兽召唤")), "Queued summon stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.depth >= 1), "Second action replaced the active public action instead of queuing");
  assert.ok([...firstStages, ...secondStages].some((entry) => entry.text.includes("1200")), "Delayed damage was not captured by a public presentation stage");
  const reportPath = path.join(options.artifactDir, `online-action-stage-${roomCode}.json`);
  await writeFile(reportPath, `${JSON.stringify({ roomCode, screenshotPath, firstStages, secondStages }, null, 2)}\n`, "utf8");
  console.log(`online-browser-smoke passed (${roomCode}, queued action stage, trap response, 1200 damage)`);
  console.log(`screenshot: ${screenshotPath}`);
  console.log(`stage report: ${reportPath}`);
} finally {
  firstPage?.cdp.close();
  secondPage?.cdp.close();
  if (firstBrowser?.child && firstBrowser.child.exitCode == null) firstBrowser.child.kill();
  if (secondBrowser?.child && secondBrowser.child.exitCode == null) secondBrowser.child.kill();
  await Promise.all([
    removeBrowserProfileDir(firstProfileDir).catch(() => {}),
    removeBrowserProfileDir(secondProfileDir).catch(() => {})
  ]);
}
