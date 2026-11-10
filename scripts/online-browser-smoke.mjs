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
    this.crashed = false;
    socket.on("message", (raw) => {
      if (process.env.ONLINE_BROWSER_DEBUG === "1") console.error(`CDP ${raw.toString("utf8").slice(0, 1000)}`);
      const message = JSON.parse(raw.toString("utf8"));
      if (message.method === "Inspector.targetCrashed") {
        this.crashed = true;
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Browser target crashed while waiting for ${pending.method}`));
        }
        this.pending.clear();
        return;
      }
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
    if (this.crashed) return Promise.reject(new Error(`Browser target crashed before ${method}`));
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
  return `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].some((element) => !element.hidden && element.getClientRects().length && ((element.getAttribute("aria-label") || "") + " " + (element.textContent || "")).includes(${JSON.stringify(text)})))()`;
}

async function click(cdp, page, selector) {
  const point = await waitForPage(cdp, page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled || element.hidden || !element.getClientRects().length) return null;
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`, `clickable ${selector}`, page.cdp.timeoutMs);
  await page.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await page.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await page.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}

async function reloadPage(cdp, page, timeoutMs) {
  await evaluate(cdp, page, `window.__onlineSmokeBeforeReload = true`);
  await page.cdp.send("Page.reload");
  await waitForPage(cdp, page, `!window.__onlineSmokeBeforeReload && document.readyState === "complete"`, "fresh document after reload", timeoutMs);
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
  const point = await waitForPage(cdp, page, `(async () => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((entry) => !entry.hidden && entry.getClientRects().length && (entry.getAttribute("aria-label") || entry.textContent || "").includes(${JSON.stringify(text)}));
    if (!element) return null;
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`, `double-clickable ${text}`, page.cdp.timeoutMs);
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

async function checkHandLayout(cdp, page) {
  const layout = await evaluate(cdp, page, `(() => ({
    width: innerWidth, selection: document.body.dataset.duelSelection,
    fieldRows: [...document.querySelectorAll('#duelField > .zone-row, #duelField > .trap-row')].map(row => {
      const box = row.getBoundingClientRect(), field = document.querySelector('#duelField').getBoundingClientRect();
      return { id: row.id, height: box.height, inside: box.top >= field.top - 1 && box.bottom <= field.bottom + 1 };
    }),
    cards: [...document.querySelectorAll("#hand > .card")].map(card => {
      const rect = card.getBoundingClientRect();
      const parts = [...card.children].filter(element => getComputedStyle(element).display !== "none")
        .map(element => { const box = element.getBoundingClientRect(); return { name: element.className,
          left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height,
          inside: box.left >= rect.left - 1 && box.right <= rect.right + 1 && box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1 }; });
      const overlaps = parts.flatMap((part, index) => parts.slice(index + 1)
        .filter(other => Math.min(part.right, other.right) - Math.max(part.left, other.left) > 1
          && Math.min(part.bottom, other.bottom) - Math.max(part.top, other.top) > 1)
        .map(other => [part.name, other.name]));
      return { name: card.dataset.cardName, height: rect.height, parts, overlaps };
    })
  }))()`);
  assert.ok(layout.cards.length, "Hand layout has no cards to inspect");
  for (const row of layout.fieldRows) assert.ok(row.inside, `${row.id} clipped behind the hand panel at ${layout.width}px`);
  for (const card of layout.cards) {
    assert.deepEqual(card.overlaps, [], `${card.name} hand content overlaps at ${layout.width}px (${layout.selection})`);
    for (const part of card.parts) assert.ok(part.inside, `${card.name} ${part.name} escaped its card at ${layout.width}px (${layout.selection})`);
    assert.ok(card.parts.find(part => part.name === "card-detail-entry")?.height >= 24, `${card.name} detail button became too small`);
  }
  return layout;
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

async function failurePageState(cdp, page) {
  if (!page?.cdp) return null;
  try {
    return await evaluate(cdp, page, `(() => {
      const text = (selector) => (document.querySelector(selector)?.innerText || document.querySelector(selector)?.textContent || "").replace(/\\s+/g, " ").trim();
      const visible = (element) => Boolean(element && !element.hidden && element.getClientRects().length);
      return {
        url: location.href,
        title: document.title,
        bodyState: { ...document.body.dataset },
        turn: text("#turnLabel"),
        phase: text("#phaseLabel"),
        player: text("#playerPanel"),
        rival: text("#aiPanel"),
        connection: text("#connectionText"),
        command: text("#handCommand"),
        actionStage: text("#actionStage"),
        chainStage: text("#chainResolutionStage"),
        response: text("#onlineResponse"),
        recovery: text("#recoveryBrief"),
        result: text("#onlineResult"),
        spectator: { connection: text("#watchConnection"), phase: text("#watchPhase"), series: text("#watchSeries"), players: text("#watchPlayers") },
        visibleDialogs: [...document.querySelectorAll("dialog[open]")].filter(visible).map((dialog) => ({ id: dialog.id, text: (dialog.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1200) })),
        alerts: [...document.querySelectorAll('[role="alert"]')].filter(visible).map((alert) => (alert.innerText || alert.textContent || "").replace(/\\s+/g, " ").trim()).filter(Boolean),
        hand: [...document.querySelectorAll("#hand .card")].map((card) => (card.getAttribute("aria-label") || card.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240)),
        stages: (window.__onlineStageHistory || []).map(({ key, ...entry }) => entry)
      };
    })()`);
  } catch (error) {
    return { captureError: error.message };
  }
}

async function saveFailureArtifacts({ artifactDir, error, roomCode, pages, cdp }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    failedAt: new Date().toISOString(),
    roomCode: roomCode || null,
    error: { name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || "" },
    pages: {}
  };
  for (const [label, page] of pages) {
    report.pages[label] = await failurePageState(cdp, page);
    if (!page?.cdp) continue;
    try {
      const screenshot = await page.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const screenshotPath = path.join(artifactDir, `online-browser-failure-${label}.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      report.pages[label] = { ...report.pages[label], screenshotPath };
    } catch (captureError) {
      report.pages[label] = { ...report.pages[label], screenshotError: captureError.message };
    }
  }
  const reportPath = path.join(artifactDir, "online-browser-failure.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function startBrowser(browserBin, profileDir, timeoutMs) {
  const child = spawn(browserBin, [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--run-all-compositor-stages-before-draw",
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
const spectatorProfileDir = await mkdtemp(path.join(tmpdir(), "card-duel-online-browser-spectator-"));
let firstBrowser = null;
let secondBrowser = null;
let spectatorBrowser = null;
let firstPage = null;
let secondPage = null;
let spectatorPage = null;
let roomCode = "";
const cdp = null; // Page helpers use each page's isolated DevTools connection.

try {
  const [frontendHealth, duelHealth] = await Promise.all([
    fetch(new URL("/online.html", frontend)),
    fetch(new URL("/health", duelServer))
  ]);
  assert.equal(frontendHealth.status, 200, "Online page is not reachable");
  assert.equal(duelHealth.status, 200, "Duel server is not reachable");

  const [firstAccount, secondAccount, spectatorAccount] = await Promise.all([
    ensureAccount(duelServer.origin, "browser_stage_p1", "星野演出测试"),
    ensureAccount(secondDuelServer.origin, "browser_stage_p2", "月见演出测试"),
    ensureAccount(duelServer.origin, "browser_stage_watch", "公开观战测试")
  ]);
  firstBrowser = await startBrowser(browserBin, firstProfileDir, options.timeoutMs);
  secondBrowser = await startBrowser(browserBin, secondProfileDir, options.timeoutMs);
  spectatorBrowser = await startBrowser(browserBin, spectatorProfileDir, options.timeoutMs);
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
  const spectatorUrl = new URL("/watch.html", frontend);
  spectatorUrl.searchParams.set("duelServer", socketUrl.toString());
  spectatorUrl.searchParams.set("qa", "browser-action-stage-spectator");
  firstPage = await createPage(firstBrowser, duelServer.origin, firstAccount.cookie, firstUrl.toString(), options.timeoutMs);
  secondPage = await createPage(secondBrowser, secondDuelServer.origin, secondAccount.cookie, secondUrl.toString(), options.timeoutMs);
  spectatorPage = await createPage(spectatorBrowser, duelServer.origin, spectatorAccount.cookie, spectatorUrl.toString(), options.timeoutMs);
  await Promise.all([
    waitForPage(cdp, firstPage, visibleExpression("#createRoom"), "1P lobby", options.timeoutMs),
    waitForPage(cdp, secondPage, visibleExpression("#joinRoom"), "2P lobby", options.timeoutMs),
    waitForPage(cdp, spectatorPage, visibleExpression("#watchJoinPanel"), "spectator lobby", options.timeoutMs)
  ]);
  await Promise.all([installStageObserver(cdp, firstPage), installStageObserver(cdp, secondPage)]);

  await click(cdp, firstPage, "#createRoom");
  roomCode = await waitForPage(cdp, firstPage, `(() => document.querySelector("#copyRoomCode")?.textContent?.trim() || "")()`, "room code", options.timeoutMs);
  await fill(cdp, secondPage, "#roomCodeInput", roomCode);
  await click(cdp, secondPage, "#joinRoom");
  await Promise.all([
    waitForPage(cdp, firstPage, visibleExpression("#readyButton"), "1P ready button", options.timeoutMs),
    waitForPage(cdp, secondPage, visibleExpression("#readyButton"), "2P ready button", options.timeoutMs)
  ]);
  await click(cdp, firstPage, "#spectatorConsent");
  await click(cdp, secondPage, "#spectatorConsent");
  await Promise.all([
    waitForPage(cdp, firstPage, textMatchExpression("#spectatorStatus", "双方均已同意"), "1P spectator consent", options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression("#spectatorStatus", "双方均已同意"), "2P spectator consent", options.timeoutMs)
  ]);
  await fill(cdp, spectatorPage, "#watchCode", roomCode);
  await click(cdp, spectatorPage, "#watchJoinSubmit");
  await Promise.all([
    waitForPage(cdp, spectatorPage, visibleExpression("#watchBoard"), "public spectator board", options.timeoutMs),
    waitForPage(cdp, firstPage, textMatchExpression("#onlineSpectatorCount", "观众 1"), "spectator count", options.timeoutMs)
  ]);
  await click(cdp, firstPage, "#readyButton");
  await click(cdp, secondPage, "#readyButton");
  await Promise.all([
    waitForPage(cdp, firstPage, textMatchExpression("#hand .card", "双重召唤"), "1P fixed opening", options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression("#hand .card", "弱化力场"), "2P fixed opening", options.timeoutMs),
    waitForPage(cdp, spectatorPage, `(() => {
      const board = document.querySelector("#watchPlayers");
      return document.querySelectorAll("#watchPlayers .watch-player").length === 2
        && (board?.textContent || "").includes("手牌 5 张（隐藏）");
    })()`, "spectator hidden-hand board", options.timeoutMs)
  ]);

  // Exercise the real responsive header and selection states before the duel sequence.
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const mobileLayout = await waitForPage(cdp, firstPage, `(() => {
    const header = document.querySelector(".topbar").getBoundingClientRect();
    return header.height <= 120 && document.documentElement.scrollWidth <= innerWidth
      ? { width: innerWidth, headerHeight: header.height, fieldHeight: document.querySelector("#duelPanel").getBoundingClientRect().height } : null;
  })()`, "compact mobile header without overflow", options.timeoutMs);
  const handLayouts = { mobile: await checkHandLayout(cdp, firstPage) };
  const openingHandIds = await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`);
  await click(cdp, firstPage, '#hand .card .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "mobile hand details", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Viewing details played a hand card");
  assert.equal(await evaluate(cdp, firstPage, visibleExpression("#viewerSeatLabel")), true, "Mobile layout hid the player's seat identity");
  await click(cdp, firstPage, "#onlineToolsToggle");
  await waitForPage(cdp, firstPage, visibleExpression("#soundBtn"), "mobile utility menu", options.timeoutMs);
  await click(cdp, firstPage, "#phaseLabel");
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector("#onlineTools").open`), false, "Utility menu did not dismiss on outside click");
  await click(cdp, firstPage, "#hand .card.action-ready");
  await waitForPage(cdp, firstPage, visibleExpression("#choiceConfirmBtn"), "mobile summon command", options.timeoutMs);
  handLayouts.mobileSelected = await checkHandLayout(cdp, firstPage);
  await click(cdp, firstPage, '#hand .card.selected .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "selected-card details without activation", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Selected-card detail click activated a card");
  assert.equal(await evaluate(cdp, firstPage, visibleExpression('#choiceConfirmBtn')), true, "Closing details lost the pending choice");
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 720, deviceScaleFactor: 1, mobile: false });
  handLayouts.narrowSelected = await checkHandLayout(cdp, firstPage);
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, firstPage, "#playerField .placement-candidate:nth-child(5)");
  const selectionAppearance = await evaluate(cdp, firstPage, `(() => {
    const selected = document.querySelector("#playerField .online-placement-selected");
    const candidate = document.querySelector("#playerField .placement-candidate:not(.online-placement-selected)");
    return { selectedIndex: selected?.dataset.index, selectedColor: getComputedStyle(selected).borderColor,
      candidateColor: getComputedStyle(candidate).borderColor, label: getComputedStyle(selected, "::after").content };
  })()`);
  assert.equal(selectionAppearance.selectedIndex, "4", "Clicking the last mobile slot did not change the destination");
  assert.notEqual(selectionAppearance.selectedColor, selectionAppearance.candidateColor, "Selected slot is indistinguishable from other candidates");
  assert.match(selectionAppearance.label, /已选/);
  await mkdir(options.artifactDir, { recursive: true });
  const mobileScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(options.artifactDir, `online-workspace-mobile-${roomCode}.png`), Buffer.from(mobileScreenshot.data, "base64"));
  await click(cdp, firstPage, "#choiceCancelBtn");
  await click(cdp, firstPage, "#logToggle");
  await waitForPage(cdp, firstPage, visibleExpression("#eventLog"), "mobile battle log", options.timeoutMs);
  await click(cdp, firstPage, "#eventLogClose");
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `document.querySelector(".topbar").getBoundingClientRect().height <= 60 && document.documentElement.scrollWidth <= innerWidth`, "compact landscape header without overflow", options.timeoutMs);
  handLayouts.landscape = await checkHandLayout(cdp, firstPage);
  await firstPage.cdp.send("Emulation.clearDeviceMetricsOverride");
  await waitForPage(cdp, firstPage, `innerWidth > 1040 && document.querySelector(".topbar").getBoundingClientRect().height < 100`, "desktop layout restored", options.timeoutMs);
  handLayouts.desktop = await checkHandLayout(cdp, firstPage);
  await click(cdp, firstPage, "#hand .card.action-ready");
  await waitForPage(cdp, firstPage, visibleExpression("#choiceConfirmBtn"), "desktop summon command", options.timeoutMs);
  const workspaceScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const workspaceScreenshotPath = path.join(options.artifactDir, `online-workspace-desktop-${roomCode}.png`);
  await writeFile(workspaceScreenshotPath, Buffer.from(workspaceScreenshot.data, "base64"));
  await click(cdp, firstPage, "#choiceCancelBtn");

  await click(cdp, firstPage, '#hand .card[data-card-id="twin-summon"]');
  await click(cdp, firstPage, '#hand .card.selected .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "selected spell details without activation", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Spell detail click activated the spell");
  await click(cdp, firstPage, '#choiceCancelBtn');
  await doubleClickText(cdp, firstPage, "#hand .card", "双重召唤");
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "双重召唤"), "spell action stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#hand .card.action-ready", "日冕骑士"), "solar knight action", options.timeoutMs);
  await doubleClickText(cdp, firstPage, "#hand .card.action-ready", "日冕骑士");
  await waitForPage(cdp, firstPage, `(window.__onlineStageHistory || []).some((entry) => entry.kind === "action" && entry.depth >= 1)`, "queued public action", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "怪兽召唤"), "queued summon stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, visibleExpression("#playerField .slot[data-card-uid]"), "summoned attacker", options.timeoutMs);
  await waitForPage(cdp, firstPage, `(() => {
    const slot = document.querySelector('#playerField .slot[data-attack-state="ready"]');
    if (!slot) return false;
    return parseFloat(getComputedStyle(slot, "::before").height) < 32;
  })()`, "compact attack hint without covering card art", options.timeoutMs);

  await doubleClickText(cdp, firstPage, "#hand .card.action-ready", "疾风术士");
  await waitForPage(cdp, firstPage, textMatchExpression('#hand .card[data-action-label="次数用完"]', "铁壁守卫"), "authoritative summon exhaustion reason", options.timeoutMs);
  await click(cdp, firstPage, '#hand .card[data-action-label="次数用完"]');
  await waitForPage(cdp, firstPage, textMatchExpression("#duelHint", "本回合召唤次数已用完"), "clicked unavailable-card explanation", options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector("#cardInspector").open`), false, "Unavailable-card click opened details instead of explaining the rule");
  await waitForPage(cdp, firstPage, `document.querySelector("#actionStage").hidden`, "clear unavailable-card explanation", options.timeoutMs);
  const feedbackScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const handFeedbackPath = path.join(options.artifactDir, `online-hand-feedback-${roomCode}.png`);
  await writeFile(handFeedbackPath, Buffer.from(feedbackScreenshot.data, "base64"));

  // Verify real cards after summoning, including defense and narrow-screen stat legibility.
  const fieldCardLayout = {};
  const readFieldCards = () => evaluate(cdp, firstPage, `(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll("#playerField .field-monster-card")].map(card => {
      const rect = card.getBoundingClientRect();
      const art = card.querySelector(".art").getBoundingClientRect();
      return { name: card.querySelector(".card-name").textContent, defense: card.classList.contains("defense"),
        width: rect.width, height: rect.height, slotWidth: card.closest(".slot").getBoundingClientRect().width,
        artHeight: art.height, nameSize: parseFloat(getComputedStyle(card.querySelector(".card-name")).fontSize),
        nameHeight: card.querySelector(".card-name").getBoundingClientRect().height,
        faceTransform: getComputedStyle(card.querySelector(".field-card-face")).transform,
        statsTransform: getComputedStyle(card.querySelector(".stats")).transform,
        stats: [...card.querySelectorAll(".stat")].map(stat => {
          const box = stat.getBoundingClientRect();
          return { text: stat.textContent, width: stat.clientWidth, contentWidth: stat.scrollWidth,
            inside: box.left >= rect.left - 1 && box.right <= rect.right + 1 && box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1 };
        }) };
    })
  }))()`);
  const assertFieldCards = (layout) => {
    assert.ok(layout.scrollWidth <= layout.width, `Field overflow at ${layout.width}px`);
    assert.equal(layout.cards.length, 2);
    for (const card of layout.cards) {
      assert.ok(card.artHeight >= 16, `${card.name} art collapsed at ${layout.width}px`);
      assert.equal(card.faceTransform, "none", `${card.name} text rotated with defense art`);
      assert.equal(card.statsTransform, "none");
      assert.equal(card.stats.length, 2);
      for (const stat of card.stats) {
        assert.ok(stat.inside && stat.width > 0 && stat.contentWidth <= stat.width + 1, `${stat.text} clipped at ${layout.width}px`);
      }
      if (layout.width > 1040) {
        assert.ok(card.width >= card.slotWidth * .8, `${card.name} shrank inside its desktop slot`);
        assert.ok(card.nameSize >= 11, `${card.name} desktop name is too small`);
        assert.ok(card.nameHeight >= 14, `${card.name} desktop name collapsed`);
      }
    }
  };
  await click(cdp, firstPage, '#playerField .slot[data-card-uid]');
  await click(cdp, firstPage, '#fieldModeBtn');
  await waitForPage(cdp, firstPage, visibleExpression('#playerField .field-monster-card.defense'), "upright defense card", options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector("#actionStage").hidden`, "defense presentation completed", options.timeoutMs);
  fieldCardLayout.desktop = await readFieldCards();
  assertFieldCards(fieldCardLayout.desktop);
  assert.equal(fieldCardLayout.desktop.cards[0].defense, true);
  const fieldScreenshotPath = path.join(options.artifactDir, `online-field-cards-${roomCode}.png`);
  await writeFile(fieldScreenshotPath, Buffer.from((await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })).data, "base64"));
  for (const [width, height] of [[390, 844], [320, 720], [844, 390]]) {
    await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, firstPage, `innerWidth === ${width}`, "field-card responsive viewport", options.timeoutMs);
    fieldCardLayout[width] = await readFieldCards();
    assertFieldCards(fieldCardLayout[width]);
    handLayouts[width] = await checkHandLayout(cdp, firstPage);
    if (width === 390) {
      await writeFile(path.join(options.artifactDir, `online-field-cards-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })).data, "base64"));
    }
  }
  await firstPage.cdp.send("Emulation.clearDeviceMetricsOverride");
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, "field-card desktop viewport restored", options.timeoutMs);

  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "2P turn", options.timeoutMs);
  await doubleClickText(cdp, secondPage, "#hand .card.action-ready", "弱化力场");
  await waitForPage(cdp, secondPage, visibleExpression("#playerTraps .trap-slot:not(.empty)"), "set weakening web", options.timeoutMs);
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "1P attack turn", options.timeoutMs);

  await click(cdp, firstPage, '#playerField .slot:has(.field-monster-card.defense)');
  await click(cdp, firstPage, '#fieldModeBtn');
  await waitForPage(cdp, firstPage, `!document.querySelector('#playerField .field-monster-card.defense')`, "defense card returned to attack", options.timeoutMs);
  await waitForPage(cdp, firstPage, visibleExpression('#playerField .slot[data-attack-state="ready"]'), "attack-ready field highlight", options.timeoutMs);
  await doubleClick(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await waitForPage(cdp, firstPage, `(() => Boolean(document.querySelector(".online-response-attacker")) || (document.querySelector("#actionStage")?.innerText || "").includes("直接攻击"))()`, "declared attack presentation", options.timeoutMs);
  await waitForPage(cdp, secondPage, `(() => { const button = document.querySelector("#responseActivate"); return Boolean(button && !button.disabled && button.getClientRects().length); })()`, "trap activation", options.timeoutMs);

  // Refresh must preserve the authenticated seat and pending response, without replaying history or applying damage.
  await reloadPage(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, visibleExpression("#onlineResponse[open] #responseActivate"), "restored trap response after refresh", options.timeoutMs);
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector("#accountName")?.textContent?.trim()`), "@browser_stage_p2");
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector("#recoverySelfLp")?.textContent?.trim()`), "4000 LP");
  assert.equal(await evaluate(cdp, secondPage, visibleExpression("#actionStage")), false, "Refresh replayed an old public action");
  await installStageObserver(cdp, secondPage);
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
    waitForPage(cdp, firstPage, `document.querySelector("#eventLogList")?.textContent?.includes("1200 伤害")`, "exact battle receipt", options.timeoutMs),
    waitForPage(cdp, spectatorPage, `document.querySelector("#watchPlayers")?.textContent?.includes("2800 LP")`, "spectator final LP", options.timeoutMs)
  ]);
  const [firstStages, secondStages, spectatorSummary] = await Promise.all([
    stageHistory(cdp, firstPage),
    stageHistory(cdp, secondPage),
    evaluate(cdp, spectatorPage, `(() => ({
      phase: document.querySelector("#watchPhase")?.textContent?.trim() || "",
      series: document.querySelector("#watchSeries")?.textContent?.trim() || "",
      players: document.querySelector("#watchPlayers")?.textContent?.replace(/\\s+/g, " ").trim() || ""
    }))()`)
  ]);
  assert.ok(firstStages.some((entry) => entry.text.includes("双重召唤")), "Spell action stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.text.includes("怪兽召唤")), "Queued summon stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.depth >= 1), "Second action replaced the active public action instead of queuing");
  assert.ok([...firstStages, ...secondStages].some((entry) => entry.text.includes("1200")), "Delayed damage was not captured by a public presentation stage");

  // Spectator refresh rejoins the same public room, without occupying a player seat or duplicating its count.
  await reloadPage(cdp, spectatorPage, options.timeoutMs);
  await Promise.all([
    waitForPage(cdp, spectatorPage, textMatchExpression("#watchPlayers", "2800 LP"), "spectator refreshed public state", options.timeoutMs),
    waitForPage(cdp, firstPage, textMatchExpression("#onlineSpectatorCount", "观众 1"), "spectator count after refresh", options.timeoutMs)
  ]);
  assert.equal(await evaluate(cdp, spectatorPage, `new URL(location.href).searchParams.get("room")`), roomCode);
  assert.equal(await evaluate(cdp, spectatorPage, `document.querySelectorAll("#watchPlayers .watch-player").length`), 2);

  await click(cdp, firstPage, "#onlineToolsToggle");
  await click(cdp, firstPage, "#forfeitButton");
  await click(cdp, firstPage, "#forfeitCancel");
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector("#onlineForfeit").open`), false);
  assert.equal(await evaluate(cdp, firstPage, `document.body.dataset.onlineResult`), "none", "Canceling surrender ended the duel");
  await click(cdp, firstPage, "#onlineToolsToggle");
  await click(cdp, firstPage, "#forfeitButton");
  await click(cdp, firstPage, "#forfeitConfirm");
  await Promise.all([
    waitForPage(cdp, firstPage, visibleExpression("#onlineResult[open]"), "1P result", options.timeoutMs),
    waitForPage(cdp, secondPage, visibleExpression("#onlineResult[open]"), "2P result", options.timeoutMs),
    waitForPage(cdp, spectatorPage, textMatchExpression("#watchPhase", "月见演出测试获胜"), "spectator result", options.timeoutMs)
  ]);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector("#resultSeriesScore")?.textContent?.trim()`), "0 : 1");
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector("#resultSeriesScore")?.textContent?.trim()`), "1 : 0");
  await click(cdp, secondPage, "#resultRematch");
  await waitForPage(cdp, firstPage, textMatchExpression("#resultRematch", "接受再战"), "rival rematch invitation", options.timeoutMs);
  await reloadPage(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, visibleExpression("#onlineResult[open]"), "result restored after refresh", options.timeoutMs);
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector("#resultRematch")?.disabled`), true, "Refresh lost an accepted rematch");
  assert.match(await evaluate(cdp, secondPage, `document.querySelector("#resultRematchStatus")?.textContent || ""`), /你已接受再战/);
  await click(cdp, firstPage, "#resultRematch");
  await Promise.all([
    waitForPage(cdp, secondPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合" && document.querySelector("#viewerSeatLabel")?.textContent?.includes("第 2 局")`, "2P rematch first turn", options.timeoutMs),
    waitForPage(cdp, firstPage, `document.querySelector("#onlineResult")?.open === false && document.querySelector("#viewerSeatLabel")?.textContent?.includes("第 2 局")`, "1P rematch board", options.timeoutMs),
    waitForPage(cdp, spectatorPage, textMatchExpression("#watchSeries", "第 2 局"), "spectator rematch", options.timeoutMs)
  ]);
  await waitForPage(cdp, secondPage, textMatchExpression("#hand .card.action-ready", "铁壁守卫"), "2P rematch summon highlight", options.timeoutMs);
  await doubleClickText(cdp, secondPage, "#hand .card.action-ready", "铁壁守卫");
  await Promise.all([
    waitForPage(cdp, secondPage, textMatchExpression("#playerField", "铁壁守卫"), "2P double-click summon", options.timeoutMs),
    waitForPage(cdp, firstPage, textMatchExpression("#aiField", "铁壁守卫"), "1P sees 2P summon", options.timeoutMs),
    waitForPage(cdp, spectatorPage, textMatchExpression('#watchPlayers [data-seat="p2"]', "铁壁守卫"), "spectator sees 2P summon", options.timeoutMs)
  ]);
  await click(cdp, spectatorPage, "#watchLeave");
  await waitForPage(cdp, firstPage, textMatchExpression("#onlineSpectatorCount", "观众 0"), "spectator left count", options.timeoutMs);
  assert.equal(await evaluate(cdp, spectatorPage, visibleExpression("#watchBoard")), false, "Leaving spectator retained the public board");
  const lifecycle = { refreshedPendingResponse: true, refreshedSpectator: true, restoredRematchAcceptance: true, secondPlayerSummoned: true, spectatorLeft: true };
  const reportPath = path.join(options.artifactDir, `online-action-stage-${roomCode}.json`);
  await writeFile(reportPath, `${JSON.stringify({ roomCode, screenshotPath, workspaceScreenshotPath, handFeedbackPath, fieldScreenshotPath, fieldCardLayout, handLayouts, mobileLayout, selectionAppearance, firstStages, secondStages, spectatorSummary, lifecycle }, null, 2)}\n`, "utf8");
  console.log(`online-browser-smoke passed (${roomCode}, consent spectator, queued action stage, refreshed trap response, 1200 damage, refreshed rematch, 2P summon)`);
  console.log(`screenshot: ${screenshotPath}`);
  console.log(`stage report: ${reportPath}`);
} catch (error) {
  try {
    const reportPath = await saveFailureArtifacts({
      artifactDir: options.artifactDir,
      error,
      roomCode,
      pages: [["p1", firstPage], ["p2", secondPage], ["spectator", spectatorPage]],
      cdp
    });
    console.error(`online-browser-smoke failure report: ${reportPath}`);
  } catch (artifactError) {
    console.error(`Unable to save online browser failure artifacts: ${artifactError.message}`);
  }
  throw error;
} finally {
  firstPage?.cdp.close();
  secondPage?.cdp.close();
  spectatorPage?.cdp.close();
  if (firstBrowser?.child && firstBrowser.child.exitCode == null) firstBrowser.child.kill();
  if (secondBrowser?.child && secondBrowser.child.exitCode == null) secondBrowser.child.kill();
  if (spectatorBrowser?.child && spectatorBrowser.child.exitCode == null) spectatorBrowser.child.kill();
  await Promise.all([
    removeBrowserProfileDir(firstProfileDir).catch(() => {}),
    removeBrowserProfileDir(secondProfileDir).catch(() => {}),
    removeBrowserProfileDir(spectatorProfileDir).catch(() => {})
  ]);
}
