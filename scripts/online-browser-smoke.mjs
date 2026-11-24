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
    effectChoices: false,
    tributeChoices: false,
    chainRhythm: false,
    pendingFeedback: false,
    selectionExpiry: false,
    artifactDir: process.env.ONLINE_BROWSER_ARTIFACT_DIR || path.resolve(".tmp", "online-browser-smoke")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--frontend-url" && value) result.frontendUrl = value, index += 1;
    else if (argv[index] === "--duel-server-url" && value) result.duelServerUrl = value, index += 1;
    else if (argv[index] === "--timeout-ms" && value) result.timeoutMs = Number(value) || result.timeoutMs, index += 1;
    else if (argv[index] === "--artifact-dir" && value) result.artifactDir = path.resolve(value), index += 1;
    else if (argv[index] === "--effect-choices") result.effectChoices = true;
    else if (argv[index] === "--tribute-choices") result.tributeChoices = true;
    else if (argv[index] === "--chain-rhythm") result.chainRhythm = true;
    else if (argv[index] === "--pending-feedback") result.pendingFeedback = true;
    else if (argv[index] === "--selection-expiry") result.selectionExpiry = true;
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
  const point = await waitForPage(cdp, page, `(async () => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled || element.hidden || !element.getClientRects().length) return null;
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`, `clickable ${selector}`, page.cdp.timeoutMs).catch(async (error) => {
    const state = await evaluate(cdp, page, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const rect = element?.getBoundingClientRect();
      const hit = rect && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { viewport: [innerWidth, innerHeight], visibility: document.visibilityState,
        disabled: element?.disabled, hidden: element?.hidden,
        rect: rect?.toJSON(), hit: hit ? hit.tagName + '#' + hit.id + '.' + hit.className : null,
        dialogs: [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id || dialog.className) };
    })()`).catch(() => null);
    throw new Error(`${error.message}; click state: ${JSON.stringify(state)}`, { cause: error });
  });
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
  const point = await waitForPage(cdp, page, `(async () => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((entry) => !entry.hidden && entry.getClientRects().length && !entry.disabled);
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    await new Promise(requestAnimationFrame);
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`, `double-clickable ${selector}`, page.cdp.timeoutMs);
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

async function checkGuidanceLayout(cdp, page) {
  const layout = await evaluate(cdp, page, `(() => {
    const hint = document.querySelector('#duelHint'), rect = hint.getBoundingClientRect(), style = getComputedStyle(hint);
    const above = document.querySelector('#aiTraps').getBoundingClientRect(), below = document.querySelector('#playerTraps').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, text: hint.textContent, fontSize: parseFloat(style.fontSize),
      rect: rect.toJSON(), aboveBottom: above.bottom, belowTop: below.top,
      clipped: hint.scrollWidth > hint.clientWidth + 1 || hint.scrollHeight > hint.clientHeight + 1,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  })()`);
  const shortLandscape = layout.width <= 1040 && layout.width > layout.height && layout.height <= 400;
  assert.ok(layout.fontSize >= (shortLandscape ? 12 : 13), `Guidance text is too small at ${layout.width}x${layout.height}`);
  if (layout.width >= 2560) assert.ok(layout.fontSize >= 18, 'Large-screen guidance did not scale up');
  assert.equal(layout.clipped, false, `Guidance text is clipped at ${layout.width}x${layout.height}`);
  assert.equal(layout.pageOverflow, false, 'Guidance introduced horizontal page overflow');
  assert.ok(layout.rect.width > 0 && layout.rect.top >= layout.aboveBottom - 1 && layout.rect.bottom <= layout.belowTop + 1,
    `Guidance overlaps a support zone at ${layout.width}x${layout.height}`);
  return layout;
}

async function exerciseGuidanceLayouts(cdp, page, options, roomCode) {
  const layouts = [];
  await waitForPage(cdp, page, `document.querySelector('#phaseStage').hidden && document.querySelector('#actionStage').hidden`, 'guidance without transient presentation', options.timeoutMs);
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440], [3840, 2160], [390, 844], [320, 720], [844, 390], [568, 320]]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await click(cdp, page, '#hand .card[data-card-id="iron-guardian"] .card-name');
    await waitForPage(cdp, page, textMatchExpression('#duelHint', '等待对手行动'), 'long unavailable-card guidance', options.timeoutMs);
    layouts.push(await checkGuidanceLayout(cdp, page));
    if ([3840, 390, 320, 568].includes(width)) {
      await writeFile(path.join(options.artifactDir, `online-guidance-${width}x${height}-${roomCode}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
    }
  }
  await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  return layouts;
}

async function exerciseHandNavigation(cdp, page, timeoutMs, { selectLast = false, screenshotPath = "" } = {}) {
  const before = await evaluate(cdp, page, `(() => ({
    ids: [...document.querySelectorAll('#hand > .card')].map(card => card.dataset.cardUid),
    turn: document.querySelector('#turnLabel').textContent,
    range: document.querySelector('#handVisibleRange').textContent
  }))()`);
  await waitForPage(cdp, page, visibleExpression('#handNavigation'), "overflow hand navigation", timeoutMs);
  assert.equal(await evaluate(cdp, page, `document.querySelector('#handPrevious').disabled`), true);
  await click(cdp, page, '#handNext');
  await waitForPage(cdp, page, `document.querySelector('#hand').scrollLeft > 2 && !document.querySelector('#handPrevious').disabled`, "hand page moves right", timeoutMs);
  const pressInHand = async (key, keyCode) => {
    await evaluate(cdp, page, `document.querySelector('#hand').focus({ preventScroll: true })`);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode });
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode });
  };
  await pressInHand('End', 35);
  await waitForPage(cdp, page, `(() => { const hand = document.querySelector('#hand'); return hand.scrollWidth - hand.clientWidth - hand.scrollLeft <= 2 && document.querySelector('#handNext').disabled; })()`, "keyboard reaches last hand card", timeoutMs);
  const end = await evaluate(cdp, page, `({ scroll: document.querySelector('#hand').scrollLeft, range: document.querySelector('#handVisibleRange').textContent })`);
  assert.notEqual(end.range, before.range);
  await click(cdp, page, '#hand .card:last-child .card-detail-entry');
  await waitForPage(cdp, page, visibleExpression('#cardInspector[open]'), "last hand card details", timeoutMs);
  await click(cdp, page, '#inspectorClose');
  assert.ok(Math.abs(await evaluate(cdp, page, `document.querySelector('#hand').scrollLeft`) - end.scroll) <= 2, "Closing details reset hand browsing position");
  assert.equal(await evaluate(cdp, page, `document.body.dataset.duelSelection`), 'none', "Browsing selected or played a card");
  assert.deepEqual(await evaluate(cdp, page, `[...document.querySelectorAll('#hand > .card')].map(card => card.dataset.cardUid)`), before.ids);
  if (selectLast) {
    await click(cdp, page, '#hand .card:last-child .card-head');
    await waitForPage(cdp, page, visibleExpression('#choiceConfirmBtn'), "selecting the last visible hand card", timeoutMs);
    assert.equal(await evaluate(cdp, page, `document.querySelector('#hand .card.selected')?.dataset.cardUid`), before.ids.at(-1));
    assert.ok(Math.abs(await evaluate(cdp, page, `document.querySelector('#hand').scrollLeft`) - end.scroll) <= 2, "Selecting a card reset hand browsing position");
    await click(cdp, page, '#choiceCancelBtn');
    assert.ok(Math.abs(await evaluate(cdp, page, `document.querySelector('#hand').scrollLeft`) - end.scroll) <= 2, "Canceling a choice reset hand browsing position");
  }
  if (screenshotPath) {
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, Buffer.from((await page.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })).data, "base64"));
  }
  await click(cdp, page, '#handPrevious');
  await waitForPage(cdp, page, `document.querySelector('#hand').scrollLeft < ${end.scroll - 2}`, "hand page moves left", timeoutMs);
  await pressInHand('Home', 36);
  await waitForPage(cdp, page, `document.querySelector('#hand').scrollLeft <= 2 && document.querySelector('#handPrevious').disabled`, "keyboard returns to first hand card", timeoutMs);
  return { turn: before.turn, firstRange: before.range, lastRange: end.range, detailsPreservedScroll: true, selectionPreservedScroll: selectLast, screenshotPath };
}

async function exerciseVerticalHandNavigation(cdp, page, timeoutMs) {
  const idsExpression = `[...document.querySelectorAll('#hand > .card')].map(card => card.dataset.cardUid)`;
  const atEnd = `(() => { const hand = document.querySelector('#hand'); return hand.scrollTop > 2 && hand.scrollHeight - hand.clientHeight - hand.scrollTop <= 2; })()`;
  const point = (selector) => evaluate(cdp, page, `(() => {
    const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  })()`);
  const slide = async (start, end) => {
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      const y = Math.round(start.y + (end.y - start.y) * fraction);
      await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y }] });
    }
    await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 568, height: 320, deviceScaleFactor: 1, mobile: false });
  await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  try {
    await waitForPage(cdp, page, `innerWidth === 568 && document.querySelector('#hand > .card:nth-child(6)') && document.querySelector('#phaseStage').hidden`, 'six cards in short landscape', timeoutMs);
    const ids = await evaluate(cdp, page, idsExpression);
    await evaluate(cdp, page, `document.querySelector('#hand').focus({ preventScroll: true })`);
    await pressPageKey(page, 'End', 'End', 35);
    await waitForPage(cdp, page, atEnd, 'End reaches the bottom row', timeoutMs);
    await pressPageKey(page, 'Home', 'Home', 36);
    await waitForPage(cdp, page, `document.querySelector('#hand').scrollTop <= 1`, 'Home returns to the top row', timeoutMs);
    const swipe = await point('#hand > .card:nth-child(4) .card-head');
    await slide(swipe, { y: swipe.y - 105 });
    await waitForPage(cdp, page, atEnd, 'swiping from a card scrolls the hand', timeoutMs);
    assert.deepEqual(await evaluate(cdp, page, idsExpression), ids, 'Browsing changed the hand order');
    await click(cdp, page, '#hand > .card:last-child .card-detail-entry');
    await waitForPage(cdp, page, visibleExpression('#cardInspector[open]'), 'details open on the bottom card', timeoutMs);
    await click(cdp, page, '#inspectorClose');
    await waitForPage(cdp, page, `${atEnd} && document.activeElement.closest('#hand > .card')?.dataset.cardUid === ${JSON.stringify(ids.at(-1))}`, 'details return to the same card and vertical position', timeoutMs);
    for (const [width, height] of [[390, 844], [568, 320]]) {
      await click(cdp, page, '#hand > .card:last-child .card-detail-entry');
      await waitForPage(cdp, page, visibleExpression('#cardInspector[open]'), 'hand details before rotation', timeoutMs);
      await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await click(cdp, page, '#inspectorClose');
      await waitForPage(cdp, page, `(() => {
        const focus = document.activeElement;
        const card = focus.closest('#hand > .card');
        if (!focus.matches('.card-detail-entry') || card?.dataset.cardUid !== ${JSON.stringify(ids.at(-1))}) return false;
        const frame = document.querySelector('#hand').getBoundingClientRect(), box = card.getBoundingClientRect();
        return box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
      })()`, 'returning after rotation reveals the same hand card', timeoutMs);
    }
    const grip = await point('#hand > .card:last-child .hand-reorder-grip');
    const target = await point('#hand > .card:nth-last-child(2) .hand-reorder-grip');
    await slide(grip, { y: target.y - 8 });
    const reordered = [...ids.slice(0, -2), ids.at(-1), ids.at(-2)];
    await waitForPage(cdp, page, `JSON.stringify(${idsExpression}) === ${JSON.stringify(JSON.stringify(reordered))}`, 'dragging the grip reorders two cards', timeoutMs);
    assert.equal(await evaluate(cdp, page, `${atEnd} && document.querySelector('#choiceActions').hidden`), true, 'Reordering moved the list or opened a card action');
    return { cardCount: ids.length, keyboardReachedEnds: true, touchScrolled: true, detailsPreservedScroll: true, rotationRestoredCard: true, touchReorderedAtEnd: true };
  } finally {
    await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  }
}

async function installStageObserver(cdp, page) {
  await evaluate(cdp, page, `(() => {
    window.__onlineStageHistory = [];
    window.__onlineRhythmHistory = [];
    const roots = [
      ["action", document.querySelector("#actionStage")],
      ["chain", document.querySelector("#chainResolutionStage")]
    ];
    const capture = () => {
      const action = document.querySelector('#actionStage');
      const beat = {
        phase: !document.querySelector('#phaseStage').hidden,
        action: !action.hidden,
        chain: !document.querySelector('#chainResolutionStage').hidden,
        response: document.querySelector('#onlineResponse').open,
        waiting: Boolean(document.querySelector('body[data-online-response="waiting"]')),
        result: document.querySelector('#onlineResult').open,
        title: action.querySelector('h2')?.textContent || '',
        hint: document.querySelector('#duelHint').textContent,
        hintKind: document.querySelector('#duelHint').dataset.kind,
        hintTone: document.querySelector('#duelHint').dataset.tone,
        epic: document.querySelectorAll('.epic-action').length,
        damage: document.querySelector('.life-delta')?.textContent || ''
      };
      const beatKey = JSON.stringify(beat);
      if (window.__onlineRhythmHistory.at(-1)?.key !== beatKey) {
        window.__onlineRhythmHistory.push({ ...beat, key: beatKey, at: Math.round(performance.now()) });
      }
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
    for (const element of [...roots.map(([, element]) => element), document.querySelector('#phaseStage'), document.querySelector('#effectLayer'), document.querySelector('#onlineResponse'), document.querySelector('#onlineResult'), document.querySelector('#duelHint')]) {
      if (element) new MutationObserver(capture).observe(element, { attributes: true, childList: true, subtree: true });
    }
    new MutationObserver(capture).observe(document.body, { attributes: true, attributeFilter: ['data-online-response'] });
    capture();
    return true;
  })()`);
}

async function stageHistory(cdp, page) {
  return evaluate(cdp, page, `(window.__onlineStageHistory || []).map(({ key, ...entry }) => entry)`);
}

async function pressPageKey(page, key, code, windowsVirtualKeyCode, extra = {}) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : '';
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(text ? { text } : {}), ...extra });
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers: extra.modifiers || 0 });
}

async function exerciseHandKeyboard(cdp, page, options, roomCode) {
  const before = await evaluate(cdp, page, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`);
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, page, '#hand .card[data-card-id="solar-knight"] .card-detail-entry');
  await pressPageKey(page, 'Escape', 'Escape', 27);
  await pressPageKey(page, 'Tab', 'Tab', 9, { modifiers: 8 });
  assert.equal(await evaluate(cdp, page, `document.activeElement.dataset.cardId`), 'solar-knight');
  const states = [];
  for (const [key, code, keyCode] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
    await pressPageKey(page, key, code, keyCode);
    await pressPageKey(page, key, code, keyCode, { autoRepeat: true });
    const selected = await evaluate(cdp, page, `({ focused: document.activeElement.dataset.cardId, tag: document.activeElement.tagName, id: document.activeElement.id, visibility: document.visibilityState,
      selected: document.activeElement.classList.contains('selected'),
      outline: parseFloat(getComputedStyle(document.activeElement).outlineWidth),
      busy: document.querySelector('#handCommand').getAttribute('aria-busy'),
      monsters: document.querySelectorAll('#playerField .slot[data-card-uid]').length })`);
    assert.equal(selected.focused, 'solar-knight', `Selecting a hand card lost its keyboard cursor (${code}): ${JSON.stringify(selected)}`);
    assert.ok(selected.selected && selected.outline >= 2, 'Keyboard selection lost its visible focus');
    assert.equal(selected.busy, 'false', 'Holding a key confirmed a command');
    assert.equal(selected.monsters, 0, 'Holding a key summoned a monster');
    if (key === 'Enter') await writeFile(path.join(options.artifactDir, `online-hand-keyboard-mobile-${roomCode}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
    await pressPageKey(page, 'Escape', 'Escape', 27);
    assert.equal(await evaluate(cdp, page, `document.activeElement.dataset.cardId === 'solar-knight' && !document.activeElement.classList.contains('selected')`), true, 'Canceling lost its hand cursor');
    states.push({ key: code, ...selected, cancelPreservedFocus: true });
  }
  assert.deepEqual(await evaluate(cdp, page, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), before, 'Keyboard selection or cancellation consumed a card');
  await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, page, 'innerWidth > 1040', 'keyboard hand desktop restored', options.timeoutMs);
  return { states, heldKeysIgnored: true, canceledWithoutPlaying: true };
}

async function exerciseFieldKeyboard(cdp, page, options, roomCode) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, page, '#playerField .slot[data-index="0"]');
  await pressPageKey(page, 'Escape', 'Escape', 27);
  const revision = await evaluate(cdp, page, `document.querySelector('#app').dataset.revision`);
  const states = [];
  for (const [key, code, keyCode] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
    await pressPageKey(page, key, code, keyCode);
    await pressPageKey(page, key, code, keyCode, { autoRepeat: true });
    const selected = await evaluate(cdp, page, `({ zone: document.activeElement.parentElement.id, index: document.activeElement.dataset.index,
      outline: parseFloat(getComputedStyle(document.activeElement).outlineWidth),
      menuVisible: !document.querySelector('#fieldActionBar').hidden, previewHidden: document.querySelector('#choiceActions').hidden })`);
    assert.equal(selected.zone, 'playerField', 'Field selection lost its keyboard cursor');
    assert.equal(selected.index, '0');
    assert.ok(selected.menuVisible && selected.previewHidden && selected.outline >= 2, 'Holding a field key changed selection or opened an attack');
    await pressPageKey(page, key, code, keyCode);
    assert.equal(await evaluate(cdp, page, `document.querySelector('#fieldActionBar').hidden && document.querySelector('#choiceActions').hidden`), true, 'Independent keyboard presses were treated as a double-click attack');
    states.push({ key: code, ...selected, secondPressCanceled: true });
  }
  assert.equal(await evaluate(cdp, page, `document.querySelector('#app').dataset.revision`), revision, 'Field keyboard selection sent a server action');
  await writeFile(path.join(options.artifactDir, `online-field-keyboard-mobile-${roomCode}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await pressPageKey(page, 'Tab', 'Tab', 9);
  assert.equal(await evaluate(cdp, page, `document.activeElement.parentElement.id === 'playerField' && document.activeElement.dataset.index === '1'`), true, 'Tab restarted instead of moving to the next slot');
  await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, page, 'innerWidth > 1040', 'field keyboard desktop restored', options.timeoutMs);
  return { states, revisionUnchanged: true, tabContinued: true };
}

async function checkInspectorLayouts(cdp, page, options, roomCode, label) {
  const original = await evaluate(cdp, page, `({ width: innerWidth, height: innerHeight })`);
  const layouts = [];
  for (const [width, height] of [[1440, 900], [3840, 2160], [390, 844], [320, 568], [844, 390], [568, 320]]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, page, `innerWidth === ${width} && innerHeight === ${height}`, 'inspector viewport', options.timeoutMs);
    await click(cdp, page, '.online-inspector-meta > div:last-child');
    layouts.push(await waitForPage(cdp, page, `(() => {
      const panel = document.querySelector('#cardInspector .online-inspector-panel');
      const header = panel.querySelector('header').getBoundingClientRect();
      const body = document.querySelector('#inspectorContent');
      const content = body.getBoundingClientRect();
      const close = document.querySelector('#inspectorClose').getBoundingClientRect();
      const back = document.querySelector('#inspectorBack');
      const context = document.querySelector('#inspectorContext');
      const contextRect = context.getBoundingClientRect();
      const last = body.querySelector('.online-inspector-meta > div:last-child').getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const controls = [document.querySelector('#inspectorClose'), ...(!back.hidden ? [back] : [])];
      return bounds.top >= 0 && bounds.bottom <= innerHeight && panel.scrollTop === 0
        && content.top >= header.bottom && content.bottom <= bounds.bottom
        && last.top >= content.top - 1 && last.bottom <= content.bottom + 1
        && body.scrollWidth <= body.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth
        && (context.hidden || contextRect.top >= header.top - 1 && contextRect.bottom <= header.bottom + 1 && context.scrollWidth <= context.clientWidth + 1)
        && controls.every(button => { const rect = button.getBoundingClientRect(); return rect.height >= 44 && rect.top >= bounds.top && rect.bottom <= content.top; })
        ? { width: innerWidth, height: innerHeight, closeTop: close.top, bodyScrolled: body.scrollTop, fixedControlsVisible: true, allMetadataReachable: true, contextText: context.hidden ? '' : context.textContent } : null;
    })()`, 'inspector controls stay visible at the end of its body', options.timeoutMs));
    if (width === 844 || height === 568 || height === 320) {
      const screenshot = await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(path.join(options.artifactDir, `online-inspector-${label}-${width}x${height}-${roomCode}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { ...original, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, page, `innerWidth === ${original.width} && innerHeight === ${original.height}`, 'inspector viewport restored', options.timeoutMs);
  return layouts;
}

async function checkChoiceControls(cdp, page, timeoutMs) {
  return waitForPage(cdp, page, `(() => {
    const panel = document.querySelector('#choiceActions').getBoundingClientRect();
    const confirm = document.querySelector('#choiceConfirmBtn');
    const cancel = document.querySelector('#choiceCancelBtn');
    const a = confirm.getBoundingClientRect(), b = cancel.getBoundingClientRect();
    const primary = getComputedStyle(confirm), secondary = getComputedStyle(cancel);
    const gap = b.left - a.right;
    return !document.querySelector('#choiceActions').hidden && a.height >= 44 && b.height >= 44
      && Math.abs(a.top - b.top) <= 1 && Math.abs(gap - 8) <= 1
      && a.top >= panel.top && a.bottom <= panel.bottom + 1 && b.bottom <= innerHeight
      && primary.borderRadius === '8px' && secondary.borderRadius === '8px'
      && getComputedStyle(document.querySelector('#choiceActions')).borderRadius === '16px'
      && primary.backgroundImage.includes('linear-gradient') && secondary.backgroundImage === 'none'
      ? { confirmHeight: a.height, cancelHeight: b.height, gap, buttonRadius: primary.borderRadius, panelRadius: '16px', primaryAndSecondaryDistinct: true } : null;
  })()`, 'consistent reachable confirmation and cancellation controls', timeoutMs);
}

async function checkDialogLayouts(cdp, page, selector, options, roomCode) {
  const layouts = [];
  const sizes = selector === '#onlineResult'
    ? [[1440, 900], [3840, 2160], [390, 844], [320, 568], [844, 390], [568, 320]]
    : [[1440, 900], [390, 844], [320, 720], [844, 390]];
  for (const [width, height] of sizes) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    if (selector === '#onlineResponse') {
      await evaluate(cdp, page, `(() => { const scroll = document.querySelector('.online-response-scroll'); scroll.scrollTop = scroll.scrollHeight; })()`);
    }
    layouts.push(await waitForPage(cdp, page, `(() => {
      const dialog = document.querySelector(${JSON.stringify(selector)});
      const footer = dialog.querySelector('footer').getBoundingClientRect();
      const buttons = [...dialog.querySelectorAll('footer .btn')].filter(button => button.getClientRects().length);
      const content = dialog.querySelector('.online-response-scroll, .online-result-content').getBoundingClientRect();
      return innerWidth === ${width} && dialog.open && buttons.length >= 2 && content.bottom <= footer.top + 1
        && buttons.every(button => { const rect = button.getBoundingClientRect(); return rect.height >= 44 && rect.top >= footer.top && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth; })
        && document.documentElement.scrollWidth <= innerWidth
        ? { width: innerWidth, height: innerHeight, buttonHeight: buttons[0].getBoundingClientRect().height, footerVisible: true } : null;
    })()`, `${selector} fixed footer and touch targets at ${width}`, options.timeoutMs));
    if (selector === '#onlineResponse') layouts.at(-1).decision = await checkResponseDecisionLayout(cdp, page);
    if (selector === '#onlineResult') {
      const actions = await evaluate(cdp, page, `(() => {
        const buttons = [...document.querySelectorAll('#onlineResult footer .btn')];
        const rects = buttons.map(button => button.getBoundingClientRect());
        const primary = getComputedStyle(buttons[0]);
        return { order: buttons.map(button => button.id || 'report'),
          primaryFirst: primary.backgroundImage.includes('linear-gradient'),
          sameRows: Math.abs(rects[0].top - rects[1].top) <= 1 && Math.abs(rects[2].top - rects[3].top) <= 1,
          separated: rects[0].bottom <= rects[2].top && rects[1].bottom <= rects[3].top,
          gaps: [rects[1].left - rects[0].right, rects[3].left - rects[2].right],
          quietSecondary: buttons.slice(2).every(button => { const style = getComputedStyle(button); return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderTopColor === 'rgba(0, 0, 0, 0)'; }) };
      })()`);
      assert.deepEqual(actions.order, ['resultRematch', 'resultReview', 'report', 'resultLobby']);
      assert.ok(actions.primaryFirst && actions.sameRows && actions.separated && actions.quietSecondary && actions.gaps.every(gap => Math.abs(gap - 8) <= 1), `Result actions lost their hierarchy: ${JSON.stringify(actions)}`);
      layouts.at(-1).actions = actions;
    }
    if (width === 844 || selector === '#onlineResult' && (width === 390 || height === 320)) {
      const image = await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const name = selector === '#onlineResult' ? `online-result-actions-${width}x${height}` : `${selector.slice(1)}-landscape`;
      await writeFile(path.join(options.artifactDir, `${name}-${roomCode}.png`), Buffer.from(image.data, 'base64'));
    }
  }
  await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, page, 'innerWidth > 1040', 'dialog desktop viewport restored', options.timeoutMs);
  return layouts;
}

async function checkResponseDecisionLayout(cdp, page) {
  const layout = await evaluate(cdp, page, `(() => {
    const dialog = document.querySelector('#onlineResponse');
    const footer = dialog.querySelector('footer'), bounds = footer.getBoundingClientRect();
    const timer = document.querySelector('#responseCountdown'), rect = timer.getBoundingClientRect();
    const activate = document.querySelector('#responseActivate').getBoundingClientRect();
    const status = document.querySelector('#responseStatus');
    return { width: innerWidth, height: innerHeight,
      countdownVisible: footer.contains(timer) && rect.height > 0 && rect.top >= bounds.top && rect.bottom <= activate.top && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      countdownText: timer.textContent,
      noRepeatedInstructions: status.textContent === '' && !dialog.querySelector('.online-response-rule'),
      candidateEffectsVisible: [...dialog.querySelectorAll('.trap-choice-effect')].every(effect => effect.textContent.trim().length > 0),
      scrolledBody: document.querySelector('.online-response-scroll').scrollTop };
  })()`);
  assert.ok(layout.countdownVisible && /秒/.test(layout.countdownText), `Response countdown left the fixed actions: ${JSON.stringify(layout)}`);
  assert.ok(layout.noRepeatedInstructions && layout.candidateEffectsVisible, 'Response repeats instructions or lost candidate effects');
  return layout;
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
        focus: document.activeElement?.id || document.activeElement?.getAttribute("data-testid") || document.activeElement?.tagName,
        damageIndicators: document.querySelectorAll('.life-delta').length,
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

async function checkChainPlaybackControls(cdp, page, busy) {
  const controls = await evaluate(cdp, page, `({
    busy: document.body.dataset.onlineChainPlayback === 'true',
    phaseDisabled: document.querySelector('#battleButton').disabled,
    endDisabled: document.querySelector('#endTurnButton').disabled,
    label: document.querySelector('#endTurnButton').textContent,
    confirming: document.querySelector('#endTurnButton').dataset.confirming === 'true'
  })`);
  assert.equal(controls.busy, busy);
  assert.equal(controls.endDisabled, busy, busy ? 'End turn is clickable during chain playback' : 'End turn stayed disabled after chain playback');
  if (busy) {
    assert.equal(controls.phaseDisabled, true, 'Phase controls remained active during chain playback');
    assert.equal(controls.label, '连锁演出中');
    assert.equal(controls.confirming, false, 'An old end-turn confirmation survived chain playback');
  }
  return controls;
}

async function exerciseChainRhythm(firstPage, secondPage, spectatorPage, options, roomCode) {
  const settle = page => waitForPage(cdp, page, `document.querySelector('#actionStage').hidden && document.querySelector('#chainResolutionStage').hidden && document.querySelector('#phaseStage').hidden`, 'chain rhythm presentations completed', options.timeoutMs);
  const play = async (page, id) => {
    const selector = `#hand .card.action-ready[data-card-id="${id}"]`;
    const before = await evaluate(cdp, page, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
    await click(cdp, page, selector);
    await click(cdp, page, '#choiceConfirmBtn');
    await waitForPage(cdp, page, `document.querySelectorAll(${JSON.stringify(selector)}).length < ${before}`, `confirmed ${id}`, options.timeoutMs);
  };
  const nextRound = async () => {
    await settle(firstPage);
    await endTurn(cdp, firstPage, options.timeoutMs);
    await waitForPage(cdp, secondPage, textMatchExpression('#turnLabel', '你的回合'), 'defender turn', options.timeoutMs);
    await endTurn(cdp, secondPage, options.timeoutMs);
    await waitForPage(cdp, firstPage, visibleExpression('#playerField .slot[data-attack-state="ready"]'), 'next attack available', options.timeoutMs);
  };
  await play(firstPage, 'chain-nullifier');
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '断链裁决');
  await waitForPage(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="chain-nullifier"]').length === 0`, 'a fresh double-click immediately after confirmation plays the next card', options.timeoutMs);
  await play(firstPage, 'solar-knight');
  await waitForPage(cdp, firstPage, textMatchExpression('#playerField', '日冕骑士'), 'chain attacker summoned', options.timeoutMs);
  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, textMatchExpression('#turnLabel', '你的回合'), 'defender setup turn', options.timeoutMs);
  await play(secondPage, 'mirror-snare');
  await play(secondPage, 'chain-nullifier');
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, visibleExpression('#playerField .slot[data-attack-state="ready"]'), 'chain attack available', options.timeoutMs);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await doubleClick(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await waitForPage(cdp, secondPage, visibleExpression('#onlineResponse[open]'), 'attack response', options.timeoutMs);
  assert.match(await evaluate(cdp, secondPage, `document.querySelector('#responseBattleSummary').textContent`), /^若不发动陷阱：/);
  await click(cdp, secondPage, '#responseActivate');
  await waitForPage(cdp, firstPage, visibleExpression('#onlineResponse[open]'), 'CL2 response', options.timeoutMs);
  await click(cdp, firstPage, '#responseChain .chain-stack-card');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), 'inspect a public chain card during response', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorTitle').textContent`), '镜光反制');
  await click(cdp, firstPage, '#inspectorClose');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#onlineResponse').open && document.querySelector('#onlineResponse').contains(document.activeElement)`), true, 'Closing chain details lost the active response');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#responseLead').textContent`), '可反制 CL1《镜光反制》；不再连锁则按 CL1 结算。');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#responseBattleSummary').textContent`), /^原始攻击预估（未计入连锁）：/);
  const responseDecisions = { cl2BeforeSelection: await checkResponseDecisionLayout(cdp, firstPage) };
  await writeFile(path.join(options.artifactDir, `online-response-decision-CL2-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#responseChoices button');
  responseDecisions.cl2Selected = await checkResponseDecisionLayout(cdp, firstPage);
  await click(cdp, firstPage, '#responseActivate');
  await waitForPage(cdp, secondPage, visibleExpression('#onlineResponse[open]'), 'CL3 response', options.timeoutMs);
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector('#responseLead').textContent`), '可反制 CL2《断链裁决》；不再连锁则按 CL2 → CL1 结算。');
  responseDecisions.cl3 = await checkResponseDecisionLayout(cdp, secondPage);
  await click(cdp, secondPage, '#responseActivate');
  await waitForPage(cdp, firstPage, textMatchExpression('#responseTitle', 'CL4'), 'single candidate retains CL4 title', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#responseLead').textContent`), '可反制 CL3《断链裁决》；不再连锁则按 CL3 → CL2 → CL1 结算。');
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `innerWidth === 844 && document.querySelector('#responsePass').getBoundingClientRect().bottom <= innerHeight`, 'CL4 decision buttons fit landscape', options.timeoutMs);
  await evaluate(cdp, firstPage, `(() => { const scroll = document.querySelector('.online-response-scroll'); scroll.scrollTop = scroll.scrollHeight; })()`);
  responseDecisions.cl4Landscape = await checkResponseDecisionLayout(cdp, firstPage);
  await writeFile(path.join(options.artifactDir, `online-response-decision-CL4-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, firstPage, '#responseActivate');
  await waitForPage(cdp, firstPage, visibleExpression('#chainResolutionStage'), 'four-link resolution', options.timeoutMs);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#chainResolutionStage').textContent`), /CL4 → CL3 → CL2 → CL1/);
  const playbackControls = { live: await checkChainPlaybackControls(cdp, firstPage, true) };
  await writeFile(path.join(options.artifactDir, `online-chain-controls-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await waitForPage(cdp, firstPage, `(() => { const delta = document.querySelector('.life-delta'); return delta?.textContent === '-1700' && Number(getComputedStyle(delta).opacity) > .9; })()`, 'readable damage follows chain', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#chainResolutionStage').hidden && !document.querySelector('#onlineResult').open && !document.querySelector('.epic-action')`), true);
  assert.equal(await evaluate(cdp, firstPage, `Number(getComputedStyle(document.querySelector('#effectLayer')).zIndex) > Number(getComputedStyle(document.querySelector('#actionStage')).zIndex)`), true, 'Damage must be visible above the action card on mobile');
  assert.equal(await evaluate(cdp, firstPage, `(() => { const delta = document.querySelector('.life-delta').getBoundingClientRect(); return delta.top > document.querySelector('#actionStage').getBoundingClientRect().bottom && delta.bottom < innerHeight; })()`), true, 'Damage must not cover the mobile action card');
  await writeFile(path.join(options.artifactDir, `online-chain-impact-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await waitForPage(cdp, spectatorPage, textMatchExpression('#watchPlayers', '2300 LP'), 'spectator chain damage', options.timeoutMs);
  await settle(firstPage);
  playbackControls.liveResumed = await checkChainPlaybackControls(cdp, firstPage, false);
  await waitForPage(cdp, firstPage, `document.querySelector('#duelHint').dataset.kind === 'battle-result' && document.querySelector('#duelHint').textContent.includes('1700')`, 'battle receipt follows the complete hit', options.timeoutMs);
  await writeFile(path.join(options.artifactDir, `online-battle-receipt-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'chain desktop viewport restored', options.timeoutMs);
  const beforeReplay = await evaluate(cdp, firstPage, `window.__onlineRhythmHistory.length`);
  await click(cdp, firstPage, '#onlineToolsToggle');
  await click(cdp, firstPage, '#lastChainButton');
  await waitForPage(cdp, firstPage, `!document.querySelector('#chainResolutionStage').hidden && getComputedStyle(document.querySelector('.online-chain-resolution-result')).opacity > .9`, 'readable chain replay summary', options.timeoutMs);
  playbackControls.replay = await checkChainPlaybackControls(cdp, firstPage, true);
  await writeFile(path.join(options.artifactDir, `online-chain-resolution-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await settle(firstPage);
  playbackControls.replayResumed = await checkChainPlaybackControls(cdp, firstPage, false);
  assert.equal(await evaluate(cdp, firstPage, `window.__onlineRhythmHistory.slice(${beforeReplay}).some(beat => beat.damage || beat.action || beat.hintKind === 'battle-result')`), false, 'Manual replay must not repeat a hit, damage or old receipt');
  for (const lp of [600, 0]) {
    await nextRound();
    await doubleClick(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
    await waitForPage(cdp, secondPage, textMatchExpression('#playerPanel', `${lp} / 4000`), 'next direct-attack LP', options.timeoutMs);
  }
  await Promise.all([firstPage, secondPage].map(page => waitForPage(cdp, page, visibleExpression('#onlineResult[open]'), 'lethal hit finishes before result', options.timeoutMs)));
  const histories = await Promise.all([firstPage, secondPage].map(page => evaluate(cdp, page, `window.__onlineRhythmHistory.map(({ key, ...beat }) => beat)`)));
  for (const history of histories) {
    assert.ok(history.some(beat => beat.chain), 'No chain playback recorded');
    assert.ok(history.some(beat => beat.damage === '-1700'), 'No post-chain damage recorded');
    assert.ok(history.filter(beat => beat.response || beat.waiting).every(beat => !beat.phase && !beat.action && !beat.chain && !beat.epic && !beat.damage), 'Background presentations overlap a response');
    assert.ok(history.filter(beat => beat.chain).every(beat => !beat.phase && !beat.action && !beat.response && !beat.damage), 'Chain overlaps another presentation');
    assert.ok(history.some(beat => beat.hintKind === 'battle-result' && beat.hint.includes('1700')), 'Post-chain receipt never appeared');
    assert.ok(history.filter(beat => beat.hintKind === 'battle-result').every(beat => !beat.chain && !beat.action && !beat.damage), 'Battle receipt reveals the result before playback finishes');
    assert.ok(history.filter(beat => beat.hintTone === 'victory' || beat.hintTone === 'defeat').every(beat => !beat.chain && !beat.action && !beat.damage), 'Victory hint reveals the lethal result early');
    assert.ok(history.filter(beat => beat.result).every(beat => !beat.chain && !beat.action && !beat.epic && !beat.damage), 'Result covers the lethal hit');
  }
  await writeFile(path.join(options.artifactDir, `online-chain-rhythm-${roomCode}.json`), `${JSON.stringify({ roomCode, histories, playbackControls, responseDecisions, responseDecisionLabels: true, rapidCommands: true, spectatorSynced: true, replayDidNotRepeatDamage: true, lethalResultWaited: true }, null, 2)}\n`);
  console.log(`online-chain-rhythm-smoke passed (${roomCode}, four links, response priority, damage, replay, lethal result, spectator)`);
}

async function checkTributeSelectionAppearance(cdp, page) {
  const appearance = await evaluate(cdp, page, `(() => ({
    width: innerWidth, height: innerHeight,
    choices: [...document.querySelectorAll('#fieldTargets [data-tribute-id]')].map(button => {
      const slot = [...document.querySelectorAll('#playerField .slot')].find(slot => slot.dataset.cardUid === button.dataset.tributeId);
      return { selected: button.getAttribute('aria-pressed') === 'true', border: getComputedStyle(button).borderColor,
        shadow: getComputedStyle(button).boxShadow, text: button.querySelector('strong').textContent,
        fieldSelected: slot.classList.contains('tribute-selected'), fieldPressed: slot.getAttribute('aria-pressed') === 'true',
        fieldBorder: getComputedStyle(slot).borderColor, fieldBadge: getComputedStyle(slot, '::after').content };
    })
  }))()`);
  assert.ok(appearance.choices.length >= 2, 'No tribute candidates were checked');
  for (const choice of appearance.choices) {
    assert.equal(choice.border, choice.fieldBorder, 'List and field disagree on tribute selection color');
    assert.equal(choice.selected, choice.fieldSelected, 'List and field disagree on selected tribute');
    assert.equal(choice.selected, choice.fieldPressed, 'Field pressed state disagrees with the tribute list');
    assert.equal(choice.fieldBadge.includes('✓'), choice.selected, 'Selected tribute must have a check mark');
    if (choice.selected) {
      assert.match(choice.text, /✓/);
      assert.match(choice.shadow, /115, 226, 213/, 'Selected tribute retained an old gold inset');
    }
  }
  const selected = appearance.choices.find(choice => choice.selected), candidate = appearance.choices.find(choice => !choice.selected);
  if (selected && candidate) assert.notEqual(selected.border, candidate.border, 'Selected and available tribute look identical');
  return appearance;
}

async function exerciseTributeChoices(firstPage, secondPage, spectatorPage, options, roomCode) {
  const settle = () => waitForPage(cdp, firstPage, `document.querySelector('#actionStage').hidden && document.querySelector('#phaseStage').hidden`, 'tribute setup presentations completed', options.timeoutMs);
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '双重召唤');
  await waitForPage(cdp, firstPage, `!document.querySelector('#hand .card[data-card-id="twin-summon"]') && !document.querySelector('#endTurnButton').disabled`, 'extra summon command completed', options.timeoutMs);
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '日冕骑士');
  await waitForPage(cdp, firstPage, textMatchExpression('#playerField', '日冕骑士'), 'first tribute summoned', options.timeoutMs);
  await waitForPage(cdp, firstPage, `!document.querySelector('#endTurnButton').disabled`, 'first tribute command completed', options.timeoutMs);
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '铁壁守卫');
  await waitForPage(cdp, firstPage, textMatchExpression('#playerField', '铁壁守卫'), 'second tribute summoned', options.timeoutMs);
  await settle();
  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, textMatchExpression('#turnLabel', '你的回合'), 'rival setup turn', options.timeoutMs);
  await endTurn(cdp, secondPage, options.timeoutMs);
  const boss = '#hand .card.action-ready[data-card-id="starfall-colossus"]';
  await waitForPage(cdp, firstPage, visibleExpression(boss), 'tribute summon available', options.timeoutMs);
  await click(cdp, firstPage, boss);
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '已选 0/2'), 'empty tribute count', options.timeoutMs);
  const first = '#fieldTargets [data-tribute-id]:nth-child(1)';
  const second = '#fieldTargets [data-tribute-id]:nth-child(2)';
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').disabled`), true);
  await click(cdp, firstPage, first);
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '已选 1/2'), 'partial tribute count', options.timeoutMs);
  await settle();
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const selectionAppearance = { partial: await checkTributeSelectionAppearance(cdp, firstPage) };
  await writeFile(path.join(options.artifactDir, `online-tribute-selection-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await click(cdp, firstPage, '#playerField .slot[data-index="1"]');
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '已选 2/2'), 'field and list tribute selections agree', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#fieldTargets [aria-pressed="true"]').length`), 2);
  await doubleClick(cdp, firstPage, '#playerField .slot[data-index="1"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="starfall-colossus"]').length`), 1, 'Double-clicking the last tribute must not summon');
  await click(cdp, firstPage, first);
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '已选 1/2'), 'list deselects tribute', options.timeoutMs);
  selectionAppearance.deselected = await checkTributeSelectionAppearance(cdp, firstPage);
  await click(cdp, firstPage, first);
  await click(cdp, firstPage, '#playerField .slot[data-index="4"]');
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '召唤至第 5 格'), 'chosen destination displayed', options.timeoutMs);
  const layouts = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720], [320, 568], [844, 390], [568, 320]]) {
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    layouts.push(await waitForPage(cdp, firstPage, `(() => {
      const panel = document.querySelector('#choiceActions').getBoundingClientRect();
      const list = document.querySelector('#fieldTargets').getBoundingClientRect();
      const confirm = document.querySelector('#choiceConfirmBtn').getBoundingClientRect();
      return innerWidth === ${width} && panel.top >= 0 && panel.bottom <= innerHeight && list.bottom <= confirm.top && confirm.bottom <= panel.bottom && document.documentElement.scrollWidth <= innerWidth
        ? { width: innerWidth, height: innerHeight, confirmationVisible: true } : null;
    })()`, 'tribute list and confirmation stay in viewport', options.timeoutMs));
    layouts.at(-1).controls = await checkChoiceControls(cdp, firstPage, options.timeoutMs);
    layouts.at(-1).selection = await checkTributeSelectionAppearance(cdp, firstPage);
    await writeFile(path.join(options.artifactDir, `online-tribute-${width}-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  }
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'tribute desktop viewport restored', options.timeoutMs);
  await click(cdp, firstPage, '#choiceCancelBtn');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .tribute-selected, #playerField [aria-pressed="true"]').length`), 0, 'Cancelled tribute selection left a selected field marker');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .slot[data-card-uid]').length`), 2);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="starfall-colossus"]').length`), 1);
  await click(cdp, firstPage, boss);
  await click(cdp, firstPage, first);
  await click(cdp, firstPage, second);
  await click(cdp, firstPage, '#playerField .slot[data-index="1"]');
  await click(cdp, firstPage, '#choiceConfirmBtn');
  await Promise.all([
    waitForPage(cdp, firstPage, textMatchExpression('#playerField .slot[data-index="1"]', '坠星巨卫'), 'boss occupies a released tribute slot', options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression('#aiField', '坠星巨卫'), 'rival sees tribute summon', options.timeoutMs),
    waitForPage(cdp, spectatorPage, textMatchExpression('#watchPlayers', '坠星巨卫'), 'spectator sees tribute summon', options.timeoutMs)
  ]);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="starfall-colossus"]').length`), 0);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#playerGraveCount').textContent`), '3');
  await writeFile(path.join(options.artifactDir, `online-tribute-${roomCode}.json`), `${JSON.stringify({ roomCode, layouts, selectionAppearance, cancelledWithoutConsuming: true, doubleClickDidNotCommit: true, releasedSlotUsed: true, rivalAndSpectatorSynced: true }, null, 2)}\n`, 'utf8');
  console.log(`online-tribute-choice-smoke passed (${roomCode}, select, deselect, cancel, explicit confirm, released slot, spectator)`);
}

async function exerciseSelectionExpiry(firstPage, secondPage, spectatorPage, options, roomCode) {
  const resets = [];
  for (const [page, nextPage, cardId, width, height] of [
    [firstPage, secondPage, 'solar-knight', 390, 844],
    [secondPage, firstPage, 'mirror-snare', 844, 390]
  ]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const hand = await evaluate(cdp, page, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`);
    await click(cdp, page, `#hand .card[data-card-id="${cardId}"] .card-name`);
    await waitForPage(cdp, page, visibleExpression('#choiceConfirmBtn'), 'unconfirmed placement before timeout', options.timeoutMs);
    await click(cdp, page, cardId === 'mirror-snare' ? '#playerTraps .trap-slot[data-index="4"]' : '#playerField .slot[data-index="4"]');
    await waitForPage(cdp, page, `document.querySelector('#turnLabel').textContent === '对手回合' && document.querySelector('#duelHint').dataset.kind === 'selection-reset'`, 'authoritative timeout cancels selection', options.timeoutMs);
    const reset = await evaluate(cdp, page, `(() => {
      const hint = document.querySelector('#duelHint'), rect = hint.getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, text: hint.textContent, visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight,
        hand: [...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid), selection: document.body.dataset.duelSelection,
        confirmHidden: document.querySelector('#choiceActions').hidden, phaseHidden: document.querySelector('#phaseStage').hidden,
        fieldCount: document.querySelectorAll('#playerField .slot[data-card-uid], #playerTraps .trap-slot:not(.empty)').length };
    })()`);
    assert.match(reset.text, /回合时间已到，原选择已取消/);
    assert.equal(reset.visible, true, 'Selection reset feedback is outside the viewport');
    assert.deepEqual(reset.hand, hand, 'An expired choice consumed a card');
    assert.equal(reset.selection, 'none');
    assert.equal(reset.confirmHidden, true, 'Stale placement can still be confirmed');
    assert.equal(reset.phaseHidden, true, 'Phase presentation covers the cancellation reason');
    assert.equal(reset.fieldCount, 0, 'Expired choice placed a card');
    reset.guidance = await checkGuidanceLayout(cdp, page);
    await waitForPage(cdp, nextPage, textMatchExpression('#turnLabel', '你的回合'), 'next player received timeout turn', options.timeoutMs);
    await writeFile(path.join(options.artifactDir, `online-selection-expiry-${width}-${roomCode}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
    resets.push(reset);
    await page.cdp.send('Emulation.clearDeviceMetricsOverride');
  }
  await click(cdp, firstPage, '#hand .card[data-card-id="solar-knight"] .card-name');
  await waitForPage(cdp, firstPage, visibleExpression('#choiceConfirmBtn'), 'fresh placement next turn', options.timeoutMs);
  await click(cdp, firstPage, '#choiceConfirmBtn');
  await Promise.all([
    waitForPage(cdp, firstPage, textMatchExpression('#playerField', '日冕骑士'), 'fresh summon succeeds', options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression('#aiField', '日冕骑士'), 'rival sees fresh summon', options.timeoutMs),
    waitForPage(cdp, spectatorPage, textMatchExpression('#watchPlayers', '日冕骑士'), 'spectator sees fresh summon', options.timeoutMs)
  ]);
  assert.notEqual(await evaluate(cdp, firstPage, `document.querySelector('#duelHint').dataset.kind`), 'selection-reset', 'A successful command looked like an invalidated choice');
  await writeFile(path.join(options.artifactDir, `online-selection-expiry-${roomCode}.json`), `${JSON.stringify({ roomCode, resets, freshSummonSynced: true }, null, 2)}\n`, 'utf8');
  console.log(`online-selection-expiry-smoke passed (${roomCode}, both seats, preserved hands, fresh summon, spectator)`);
}

async function exerciseEffectChoices(firstPage, secondPage, spectatorPage, options, roomCode) {
  const settle = page => waitForPage(cdp, page, `document.querySelector('#actionStage').hidden && document.querySelector('#phaseStage').hidden`, 'effect presentation completed', options.timeoutMs);
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '日冕骑士');
  await settle(firstPage);
  await click(cdp, firstPage, '#hand .card.action-ready[data-card-id="blade-sigil"]');
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '锋刃刻印 → 日冕骑士'), 'unique spell target', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldTargets').hidden`), true);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').disabled`), false);
  await click(cdp, firstPage, '#choiceCancelBtn');
  const reviveSelector = '#hand .card.action-ready[data-card-id="trio-ember-recall"]';
  await click(cdp, firstPage, reviveSelector);
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open][data-grave-choice="true"]'), 'grave picker opened for multiple targets', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#inspectorContent [data-grave-select]:not(:disabled)').length`), 2);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#graveChoiceConfirm').disabled`), true);
  const guard = '#inspectorContent .online-grave-entry:has(.card[data-card-id="iron-guardian"]) [data-grave-select]';
  const mage = '#inspectorContent .online-grave-entry:has(.card[data-card-id="gale-mage"]) [data-grave-select]';
  const spell = '#inspectorContent .online-grave-entry:has(.card[data-card-id="war-chant"])';
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector(${JSON.stringify(spell + ' [data-grave-select]')}).disabled`), true);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, 'innerWidth === 390', 'mobile inspector navigation', options.timeoutMs);
  await click(cdp, firstPage, `${spell} .online-grave-detail`);
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.id`), 'inspectorBack', 'Opening nested details lost keyboard focus');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContext').textContent`), '余烁归轨 · 尚未选择目标');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContext').hidden`), false);
  for (const type of ['keyDown', 'keyUp']) await firstPage.cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  await waitForPage(cdp, firstPage, `document.querySelector('#cardInspector').dataset.collection === 'true'`, 'Enter returns to the grave list', options.timeoutMs);
  const inspectorNavigation = await evaluate(cdp, firstPage, `(() => ({
    returnedToSameCard: document.activeElement.dataset.cardId === document.querySelector(${JSON.stringify(spell + ' .online-grave-detail')}).dataset.cardId,
    returnedToDetailsButton: document.activeElement.matches('.online-grave-detail'),
    scrollTop: document.querySelector('#inspectorContent').scrollTop
  }))()`);
  assert.ok(inspectorNavigation.returnedToSameCard && inspectorNavigation.returnedToDetailsButton && inspectorNavigation.scrollTop > 0, `Returning from details lost its place: ${JSON.stringify(inspectorNavigation)}`);
  await writeFile(path.join(options.artifactDir, `online-inspector-return-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContext').textContent`), '', 'Target context leaked into the target list');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#graveChoiceConfirm').disabled`), true, 'Reading details selected a target');
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 568, height: 320, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, 'innerWidth === 568', 'short landscape grave options', options.timeoutMs);
  await click(cdp, firstPage, guard);
  await click(cdp, firstPage, `${spell} .online-grave-detail`);
  await waitForPage(cdp, firstPage, textMatchExpression('#inspectorTitle', '战意高扬'), 'unavailable grave card details remain readable', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContext').textContent`), '余烁归轨 · 已选目标：铁壁守卫');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#graveChoiceActions').hidden`), true, 'Details exposed an activation button for the card being inspected');
  const graveDetailLayouts = await checkInspectorLayouts(cdp, firstPage, options, roomCode, 'grave-detail');
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
  await click(cdp, firstPage, '#inspectorBack');
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.matches('.online-grave-detail') && document.activeElement.dataset.cardId === document.querySelector(${JSON.stringify(spell + ' .online-grave-detail')}).dataset.cardId`), true, 'Pointer return focused a different grave card');
  inspectorNavigation.rotatedReturn = await waitForPage(cdp, firstPage, `(() => {
    const frame = document.querySelector('#inspectorContent').getBoundingClientRect();
    const origin = document.activeElement.getBoundingClientRect();
    return origin.top >= frame.top - 1 && origin.bottom <= frame.bottom + 1 && !document.querySelector('#graveChoiceConfirm').disabled;
  })()`, 'rotation reveals the original grave entry and leaves the target confirmable', options.timeoutMs);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#graveChoiceStatus').textContent`), /铁壁守卫/);
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'inspector navigation desktop restored', options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  await click(cdp, firstPage, '#fieldTargets .online-open-grave');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#graveChoiceStatus').textContent`), /铁壁守卫/);
  await click(cdp, firstPage, '#graveChoiceCancel');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="trio-ember-recall"]').length`), 2);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .slot[data-card-uid]').length`), 1);
  await doubleClick(cdp, firstPage, reviveSelector);
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open][data-grave-choice="true"]'), 'hand double-click keeps multi-target grave picker open', options.timeoutMs);
  const graveLayouts = {};
  let graveMobilePath;
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720], [844, 390], [568, 320]]) {
    const shortLandscape = width > height && height <= 400;
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    graveLayouts[width] = await waitForPage(cdp, firstPage, `(() => {
      const panel = document.querySelector('#cardInspector .online-inspector-panel').getBoundingClientRect();
      const content = document.querySelector('#inspectorContent');
      const contentRect = content.getBoundingClientRect();
      const footer = document.querySelector('#graveChoiceActions').getBoundingClientRect();
      const confirm = document.querySelector('#graveChoiceConfirm').getBoundingClientRect();
      const firstTargetsVisible = [...content.querySelectorAll('.online-grave-entry[data-eligible="true"]')].every(entry => {
        const bounds = entry.getBoundingClientRect();
        return bounds.top >= contentRect.top && bounds.bottom <= contentRect.bottom;
      });
      return innerWidth === ${width} && innerHeight === ${height} && panel.top >= 0 && panel.bottom <= innerHeight && contentRect.bottom <= footer.top && confirm.bottom <= panel.bottom && confirm.height >= 44 && content.scrollWidth <= content.clientWidth + 2 && (innerWidth < 1040 || content.scrollHeight <= content.clientHeight + 2) && (!${shortLandscape} || firstTargetsVisible)
        ? { width: innerWidth, height: innerHeight, panelHeight: panel.height, confirmVisible: true, firstTargetsVisible } : null;
    })()`, 'grave choice scrolls above fixed confirmation', options.timeoutMs);
    if (width === 320) {
      graveMobilePath = path.join(options.artifactDir, `online-grave-choice-mobile-${roomCode}.png`);
      await writeFile(graveMobilePath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
    }
  }
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, 'grave desktop viewport restored', options.timeoutMs);
  const gravePath = path.join(options.artifactDir, `online-grave-choice-${roomCode}.png`);
  await writeFile(gravePath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, mage);
  await click(cdp, firstPage, '#graveChoiceConfirm');
  await waitForPage(cdp, firstPage, textMatchExpression('#playerField .slot[data-index="1"]', '疾风术士'), 'chosen grave monster revived', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#cardInspector').open`), false);
  await click(cdp, firstPage, '#logToggle');
  await click(cdp, firstPage, '#logSelfGrave');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('.online-zone-summary').textContent`), /最新入墓在前/);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('.online-zone-browser .online-zone-card .card').dataset.cardId`), 'trio-ember-recall', 'Grave order disagrees with its latest-first label');
  await click(cdp, firstPage, '#inspectorContent .online-zone-card');
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.id`), 'inspectorBack', 'Ordinary grave details lost their return control');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContext').hidden && document.querySelector('#inspectorContext').textContent === ''`), true, 'Ordinary grave details retained an old target');
  for (const type of ['keyDown', 'keyUp']) await firstPage.cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  await waitForPage(cdp, firstPage, `document.querySelector('#cardInspector').dataset.collection === 'true'`, 'Enter returns to an ordinary grave list', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.matches('.online-zone-card') && document.activeElement.dataset.cardId === document.querySelector('.online-zone-browser .online-zone-card').dataset.cardId`), true, 'Ordinary grave return lost the original card');
  inspectorNavigation.ordinaryReturn = true;
  await click(cdp, firstPage, '#inspectorClose');
  await click(cdp, firstPage, '#eventLogClose');
  await click(cdp, firstPage, reviveSelector);
  await waitForPage(cdp, firstPage, textMatchExpression('#choiceText', '余烁归轨 → 铁壁守卫'), 'unique grave target uses compact confirmation', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#cardInspector').open`), false);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').disabled`), false);
  await click(cdp, firstPage, '#choiceCancelBtn');
  await settle(firstPage);
  await click(cdp, firstPage, '#hand .card.action-ready[data-card-id="blade-sigil"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldTargets').children.length`), 2);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').disabled`), true);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#fieldTargets').textContent`), /第 1 格.*1700.*第 2 格.*1200/);
  const layouts = {};
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720], [320, 568], [844, 390], [568, 320]]) {
    const layoutKey = height === 568 ? '320x568' : String(width);
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    layouts[layoutKey] = await waitForPage(cdp, firstPage, `(() => {
      const panel = document.querySelector('#choiceActions').getBoundingClientRect();
      const choices = document.querySelector('#fieldTargets').getBoundingClientRect();
      const button = document.querySelector('#choiceConfirmBtn').getBoundingClientRect();
      return innerWidth === ${width} && panel.top >= 0 && panel.bottom <= innerHeight && choices.bottom <= button.top && button.height >= 38 && document.documentElement.scrollWidth <= innerWidth
        ? { width: innerWidth, height: panel.height, confirmVisible: true } : null;
    })()`, 'spell target responsive panel', options.timeoutMs);
    layouts[layoutKey].controls = await checkChoiceControls(cdp, firstPage, options.timeoutMs);
    if (width === 568) await writeFile(path.join(options.artifactDir, `online-effect-controls-landscape-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  }
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, 'effect desktop viewport restored', options.timeoutMs);
  await settle(firstPage);
  const screenshotPath = path.join(options.artifactDir, `online-effect-choice-${roomCode}.png`);
  await writeFile(screenshotPath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#fieldTargets .online-target:last-child');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#choiceText').textContent`), /锋刃刻印 → 疾风术士/);
  const selectionPalette = await evaluate(cdp, firstPage, `(() => {
    const selected = document.querySelector('#fieldTargets [aria-pressed="true"]'), candidate = document.querySelector('#fieldTargets [aria-pressed="false"]');
    return { selected: getComputedStyle(selected).borderColor, candidate: getComputedStyle(candidate).borderColor,
      fieldSelected: getComputedStyle(document.querySelector('#playerField .target-selected')).borderColor,
      fieldCandidate: getComputedStyle(document.querySelector('#playerField .targetable:not(.target-selected)')).borderColor };
  })()`);
  assert.equal(selectionPalette.selected, selectionPalette.fieldSelected, 'Spell target list and field use different selected colors');
  assert.equal(selectionPalette.candidate, selectionPalette.fieldCandidate, 'Spell target list and field use different candidate colors');
  assert.notEqual(selectionPalette.selected, selectionPalette.candidate);
  await click(cdp, firstPage, '#playerField .slot[data-index="0"]');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#choiceText').textContent`), /锋刃刻印 → 日冕骑士/);
  await doubleClickText(cdp, firstPage, '#fieldTargets .online-target', '疾风术士');
  await waitForPage(cdp, firstPage, textMatchExpression('#playerField .slot[data-index="1"] .stats', '1500'), 'equipment applied to chosen mage', options.timeoutMs);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#playerField .slot[data-index="0"] .stats').textContent`), /1700/);
  await settle(firstPage);
  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, textMatchExpression('#turnLabel', '你的回合'), 'defender sets concealed targets', options.timeoutMs);
  await doubleClickText(cdp, secondPage, '#hand .card.action-ready', '弱化力场');
  await settle(secondPage);
  await click(cdp, secondPage, '#hand .card.action-ready[data-card-id="mirror-snare"]');
  await click(cdp, secondPage, '#playerTraps .trap-slot[data-index="3"]');
  await click(cdp, secondPage, '#choiceConfirmBtn');
  await settle(secondPage);
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression('#turnLabel', '你的回合'), 'dispel turn', options.timeoutMs);
  await click(cdp, firstPage, '#hand .card.action-ready[data-card-id="dispelling-ray"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#aiTraps .trap-slot.targetable').length`), 2);
  const hiddenTargets = await evaluate(cdp, firstPage, `document.querySelector('#fieldTargets').textContent`);
  assert.match(hiddenTargets, /盖放卡.*第 1 格.*盖放卡.*第 4 格/);
  assert.doesNotMatch(hiddenTargets, /镜光反制|弱化力场/);
  await click(cdp, firstPage, '#fieldTargets .online-target:last-child');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#choiceText').textContent`), /解印射线 → 盖放卡.*第 4 格/);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#aiTraps .trap-slot.target-selected[data-index="3"]').length`), 1);
  await settle(firstPage);
  const coveredPath = path.join(options.artifactDir, `online-covered-target-${roomCode}.png`);
  await writeFile(coveredPath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#choiceCancelBtn');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#aiTraps .trap-slot:not(.empty)').length`), 2);
  await click(cdp, firstPage, '#hand .card.action-ready[data-card-id="dispelling-ray"]');
  await doubleClickText(cdp, firstPage, '#fieldTargets .online-target', '第 4 格');
  await waitForPage(cdp, firstPage, `document.querySelectorAll('#aiTraps .trap-slot:not(.empty)').length === 1`, 'selected covered trap destroyed', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#aiTraps .trap-slot[data-index="3"]').classList.contains('empty')`), true);
  await waitForPage(cdp, spectatorPage, textMatchExpression('#watchPlayers', '镜光反制'), 'destroyed trap becomes public to spectator', options.timeoutMs);
  const reportPath = path.join(options.artifactDir, `online-effect-choice-${roomCode}.json`);
  await writeFile(reportPath, `${JSON.stringify({ roomCode, layouts, selectionPalette, graveLayouts, graveDetailLayouts, inspectorNavigation, gravePath, graveMobilePath, screenshotPath, coveredPath, uniqueTarget: true, targetSwitch: true, doubleClickTarget: true, concealedSlotTarget: true, canceledWithoutActivation: true, graveSelection: true, graveDetailsPreserved: true, graveDetailContext: true, ordinaryGraveClearedContext: true, latestGraveFirst: true, graveCancelPreserved: true, uniqueGraveCompact: true }, null, 2)}\n`, 'utf8');
  console.log(`online-effect-choice-smoke passed (${roomCode}, unique, multiple, equipment, concealed slot, spectator)`);
  console.log(`screenshot: ${screenshotPath}`);
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
  await mkdir(options.artifactDir, { recursive: true });
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
    waitForPage(cdp, firstPage, textMatchExpression("#hand .card", options.chainRhythm ? "断链裁决" : options.tributeChoices ? "坠星巨卫" : options.effectChoices ? "余烁归轨" : "双重召唤"), "1P fixed opening", options.timeoutMs),
    waitForPage(cdp, secondPage, textMatchExpression("#hand .card", options.chainRhythm ? "镜光反制" : "弱化力场"), "2P fixed opening", options.timeoutMs),
    waitForPage(cdp, spectatorPage, `(() => {
      const board = document.querySelector("#watchPlayers");
      return document.querySelectorAll("#watchPlayers .watch-player").length === 2
        && (board?.textContent || "").includes("手牌 5 张（隐藏）");
    })()`, "spectator hidden-hand board", options.timeoutMs)
  ]);

  if (options.selectionExpiry) {
    await exerciseSelectionExpiry(firstPage, secondPage, spectatorPage, options, roomCode);
  } else if (options.chainRhythm) {
    await exerciseChainRhythm(firstPage, secondPage, spectatorPage, options, roomCode);
  } else if (options.tributeChoices) {
    await exerciseTributeChoices(firstPage, secondPage, spectatorPage, options, roomCode);
  } else if (options.effectChoices) {
    await exerciseEffectChoices(firstPage, secondPage, spectatorPage, options, roomCode);
  } else {
  // Exercise the real responsive header and selection states before the duel sequence.
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const mobileLayout = await waitForPage(cdp, firstPage, `(() => {
    const header = document.querySelector(".topbar").getBoundingClientRect();
    return header.height <= 120 && document.documentElement.scrollWidth <= innerWidth
      ? { width: innerWidth, headerHeight: header.height, fieldHeight: document.querySelector("#duelPanel").getBoundingClientRect().height } : null;
  })()`, "compact mobile header without overflow", options.timeoutMs);
  const handLayouts = { mobile: await checkHandLayout(cdp, firstPage) };
  const handNavigationChecks = { ownTurn: await exerciseHandNavigation(cdp, firstPage, options.timeoutMs, {
    selectLast: true, screenshotPath: path.join(options.artifactDir, `online-hand-navigation-${roomCode}.png`)
  }) };
  await secondPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  handNavigationChecks.rivalTurn = await exerciseHandNavigation(cdp, secondPage, options.timeoutMs);
  await secondPage.cdp.send("Emulation.clearDeviceMetricsOverride");
  const openingHandIds = await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`);
  await click(cdp, firstPage, '#hand .card .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "mobile hand details", options.timeoutMs);
  const inspectorLayouts = await checkInspectorLayouts(cdp, firstPage, options, roomCode, 'hand');
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
  const ordinaryControls = await checkChoiceControls(cdp, firstPage, options.timeoutMs);
  await click(cdp, firstPage, '#hand .card.selected .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "selected-card details without activation", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Selected-card detail click activated a card");
  assert.equal(await evaluate(cdp, firstPage, visibleExpression('#choiceConfirmBtn')), true, "Closing details lost the pending choice");
  await click(cdp, firstPage, '#hand .card.selected .card-name');
  await waitForPage(cdp, firstPage, `!document.querySelector('#endTurnButton').disabled`, 'hand input has settled after closing details', options.timeoutMs);
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, 'A single click after viewing details must not play the selected card');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceActions').hidden`), true, 'A single click after details should cancel the current selection');
  await click(cdp, firstPage, '#hand .card.action-ready');
  assert.equal(await evaluate(cdp, firstPage, visibleExpression('#choiceConfirmBtn')), true, 'Reselecting the same card after cancellation must not directly play it');
  const detailClickBoundary = true;
  await writeFile(path.join(options.artifactDir, `online-detail-click-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 720, deviceScaleFactor: 1, mobile: false });
  handLayouts.narrowSelected = await checkHandLayout(cdp, firstPage);
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, firstPage, "#playerField .placement-candidate:nth-child(5)");
  await pressPageKey(firstPage, ' ', 'Space', 32);
  await pressPageKey(firstPage, ' ', 'Space', 32, { autoRepeat: true });
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.parentElement.id === 'playerField' && document.activeElement.dataset.index === '4'`), true, 'Selecting a summon destination lost its keyboard cursor');
  const selectionAppearance = await evaluate(cdp, firstPage, `(() => {
    const selected = document.querySelector("#playerField .online-placement-selected");
    const candidate = document.querySelector("#playerField .placement-candidate:not(.online-placement-selected)");
    return { selectedIndex: selected?.dataset.index, selectedColor: getComputedStyle(selected).borderColor,
      candidateColor: getComputedStyle(candidate).borderColor, label: getComputedStyle(selected, "::after").content };
  })()`);
  assert.equal(selectionAppearance.selectedIndex, "4", "Clicking the last mobile slot did not change the destination");
  assert.notEqual(selectionAppearance.selectedColor, selectionAppearance.candidateColor, "Selected slot is indistinguishable from other candidates");
  assert.match(selectionAppearance.label, /已选/);
  const mobileScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(options.artifactDir, `online-workspace-mobile-${roomCode}.png`), Buffer.from(mobileScreenshot.data, "base64"));
  await click(cdp, firstPage, "#choiceCancelBtn");
  await click(cdp, firstPage, "#logToggle");
  await waitForPage(cdp, firstPage, visibleExpression("#eventLog"), "mobile battle log", options.timeoutMs);
  await click(cdp, firstPage, "#eventLogClose");
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `document.querySelector(".topbar").getBoundingClientRect().height <= 60 && document.documentElement.scrollWidth <= innerWidth`, "compact landscape header without overflow", options.timeoutMs);
  handLayouts.landscape = await checkHandLayout(cdp, firstPage);
  await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width: 568, height: 320, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `innerWidth === 568 && innerHeight === 320`, "short landscape hand", options.timeoutMs);
  handLayouts.shortLandscape = await checkHandLayout(cdp, firstPage);
  const shortHandLayout = `(() => {
    const hand = document.querySelector('#hand');
    const frame = hand.getBoundingClientRect();
    const panel = document.querySelector('#handPanel').getBoundingClientRect();
    return { left: frame.left - panel.left, right: panel.right - frame.right, bottom: innerHeight - frame.bottom,
      overflowX: hand.scrollWidth - hand.clientWidth, overflowY: hand.scrollHeight - hand.clientHeight };
  })()`;
  const shortHandFits = await waitForPage(cdp, firstPage, `(() => {
    const layout = ${shortHandLayout};
    return layout.left >= -1 && layout.right >= -1 && layout.bottom >= -1 && layout.overflowX <= 1 && layout.overflowY <= 1
      ? layout : null;
  })()`, "the five opening hand rows fit inside the short landscape panel", options.timeoutMs).catch(async (error) => {
    throw new Error(`${error.message}: ${JSON.stringify(await evaluate(cdp, firstPage, shortHandLayout))}`, { cause: error });
  });
  handLayouts.shortLandscape.bounds = shortHandFits;
  await click(cdp, firstPage, '#handReadyJump');
  await waitForPage(cdp, firstPage, `document.activeElement.matches('#hand .action-ready') && document.querySelector('#choiceActions').hidden`, "short landscape jump focuses a playable card without selecting it", options.timeoutMs);
  await click(cdp, firstPage, '#hand > .card:last-child .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "last short landscape hand row opens details", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand > .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Short landscape navigation changed the opening hand");
  await click(cdp, firstPage, '#hand > .card.monster.action-ready');
  await waitForPage(cdp, firstPage, `(() => {
    const choice = document.querySelector('#choiceActions');
    return !choice.hidden && choice.getBoundingClientRect().right <= document.querySelector('#hand').getBoundingClientRect().left;
  })()`, "short landscape summon confirmation sits beside the hand", options.timeoutMs);
  await click(cdp, firstPage, '#playerField .placement-candidate:nth-child(5)');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#playerField .online-placement-selected')?.dataset.index`), "4");
  for (const [width, height] of [[320, 568], [568, 320]]) {
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, firstPage, `(() => {
      const slot = document.querySelector('#playerField .online-placement-selected');
      const confirm = document.querySelector('#choiceConfirmBtn');
      const box = confirm.getBoundingClientRect();
      return innerWidth === ${width} && innerHeight === ${height} && slot?.dataset.index === '4' && !confirm.disabled
        && box.bottom <= innerHeight && confirm.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })()`, 'rotation preserves the fifth summon destination and confirmation', options.timeoutMs);
  }
  handLayouts.shortLandscape.placementRestored = true;
  await click(cdp, firstPage, '#choiceCancelBtn');
  await firstPage.cdp.send("Emulation.clearDeviceMetricsOverride");
  await waitForPage(cdp, firstPage, `innerWidth > 1040 && document.querySelector(".topbar").getBoundingClientRect().height < 100`, "desktop layout restored", options.timeoutMs);
  handLayouts.desktop = await checkHandLayout(cdp, firstPage);
  await waitForPage(cdp, firstPage, `document.querySelector('#handNavigation').hidden`, "hand navigation hides when all cards fit", options.timeoutMs);
  await click(cdp, firstPage, "#hand .card.action-ready");
  await waitForPage(cdp, firstPage, visibleExpression("#choiceConfirmBtn"), "desktop summon command", options.timeoutMs);
  const workspaceScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const workspaceScreenshotPath = path.join(options.artifactDir, `online-workspace-desktop-${roomCode}.png`);
  await writeFile(workspaceScreenshotPath, Buffer.from(workspaceScreenshot.data, "base64"));
  await click(cdp, firstPage, "#choiceCancelBtn");
  const keyboardHand = await exerciseHandKeyboard(cdp, firstPage, options, roomCode);

  await click(cdp, firstPage, '#hand .card[data-card-id="twin-summon"]');
  await click(cdp, firstPage, '#hand .card.selected .card-detail-entry');
  await waitForPage(cdp, firstPage, visibleExpression('#cardInspector[open]'), "selected spell details without activation", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  assert.deepEqual(await evaluate(cdp, firstPage, `[...document.querySelectorAll('#hand .card')].map(card => card.dataset.cardUid)`), openingHandIds, "Spell detail click activated the spell");
  await click(cdp, firstPage, '#choiceCancelBtn');
  await click(cdp, firstPage, '#hand .card[data-card-id="twin-summon"] .card-detail-entry');
  await pressPageKey(firstPage, 'Escape', 'Escape', 27);
  await pressPageKey(firstPage, 'Tab', 'Tab', 9, { modifiers: 8 });
  await pressPageKey(firstPage, 'Enter', 'Enter', 13);
  await pressPageKey(firstPage, 'Enter', 'Enter', 13);
  await waitForPage(cdp, firstPage, `!document.querySelector('#hand .card[data-card-id="twin-summon"]') && document.activeElement.matches('#hand > .card')`, 'keyboard confirmation plays once and advances the cursor', options.timeoutMs);
  keyboardHand.afterConfirmation = await evaluate(cdp, firstPage, `({ focusedCard: document.activeElement.dataset.cardId, handCount: document.querySelectorAll('#hand > .card').length })`);
  assert.equal(keyboardHand.afterConfirmation.handCount, openingHandIds.length - 1, 'Keyboard confirmation played more than one card');
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "双重召唤"), "spell action stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#hand .card.action-ready", "日冕骑士"), "solar knight action", options.timeoutMs);
  await doubleClickText(cdp, firstPage, "#hand .card.action-ready", "日冕骑士");
  await waitForPage(cdp, firstPage, `(window.__onlineStageHistory || []).some((entry) => entry.kind === "action" && entry.depth >= 1)`, "queued public action", options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression("#actionStage", "怪兽召唤"), "queued summon stage", options.timeoutMs);
  await waitForPage(cdp, firstPage, visibleExpression("#playerField .slot[data-card-uid]"), "summoned attacker", options.timeoutMs);

  await doubleClickText(cdp, firstPage, "#hand .card.action-ready", "疾风术士");
  let pendingFeedback = null;
  if (options.pendingFeedback) {
    await waitForPage(cdp, firstPage, `document.querySelector('#handCommand').getAttribute('aria-busy') === 'true' && /正在提交召唤.*等待服务器确认/.test(document.querySelector('#duelHint').textContent)`, 'summon submission feedback', options.timeoutMs);
    assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .slot[data-card-uid]').length`), 1, 'Delayed summon changed the field before confirmation');
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await doubleClickText(cdp, firstPage, '#hand .card', '疾风术士');
    const mobile = await evaluate(cdp, firstPage, `(() => {
      const hint = document.querySelector('#duelHint'), rect = hint.getBoundingClientRect();
      return { text: hint.textContent, busy: document.querySelector('#handCommand').getAttribute('aria-busy'), visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight, selected: document.querySelectorAll('#hand .card.selected').length };
    })()`);
    assert.match(mobile.text, /正在提交召唤.*等待服务器确认/);
    assert.equal(mobile.busy, 'true');
    assert.equal(mobile.visible, true, 'Mobile submission feedback is outside the viewport');
    assert.equal(mobile.selected, 0, 'Repeated pending clicks opened a new selection');
    mobile.guidance = await checkGuidanceLayout(cdp, firstPage);
    const screenshotPath = path.join(options.artifactDir, `online-pending-feedback-mobile-${roomCode}.png`);
    await writeFile(screenshotPath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
    await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
    pendingFeedback = { mobile, screenshotPath, repeatedClicksIgnored: true };
  }
  await waitForPage(cdp, firstPage, textMatchExpression('#hand .card[data-action-label="次数用完"]', "铁壁守卫"), "authoritative summon exhaustion reason", options.timeoutMs);
  if (options.pendingFeedback) {
    await waitForPage(cdp, firstPage, `document.querySelector('#handCommand').getAttribute('aria-busy') === 'false' && !/正在提交召唤/.test(document.querySelector('#duelHint').textContent)`, 'submission feedback cleared', options.timeoutMs);
    assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .slot[data-card-uid]').length`), 2, 'Repeated pending clicks submitted another summon');
    assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#hand .card[data-card-id="gale-mage"]').length`), 0);
    pendingFeedback.clearedAfterConfirmation = true;
  }
  await click(cdp, firstPage, '#hand .card[data-action-label="次数用完"]');
  await waitForPage(cdp, firstPage, textMatchExpression("#duelHint", "本回合召唤次数已用完"), "clicked unavailable-card explanation", options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector("#cardInspector").open`), false, "Unavailable-card click opened details instead of explaining the rule");
  await waitForPage(cdp, firstPage, `document.querySelector("#actionStage").hidden`, "clear unavailable-card explanation", options.timeoutMs);
  const feedbackScreenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const handFeedbackPath = path.join(options.artifactDir, `online-hand-feedback-${roomCode}.png`);
  await writeFile(handFeedbackPath, Buffer.from(feedbackScreenshot.data, "base64"));

  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const openingRevision = await evaluate(cdp, firstPage, `document.querySelector('#app').dataset.revision`);
  await doubleClick(cdp, firstPage, '#playerField .slot[data-index="0"]');
  const openingTurn = await evaluate(cdp, firstPage, `({
    phase: document.querySelector('#phaseLabel').textContent,
    label: document.querySelector('#battleButton').textContent,
    topDisabled: document.querySelector('#battleButton').disabled,
    monsterDisabled: document.querySelector('#fieldAttackBtn').disabled,
    previewClosed: document.querySelector('#choiceActions').hidden,
    hint: document.querySelector('#duelHint').textContent,
    revision: document.querySelector('#app').dataset.revision
  })`);
  assert.ok(openingTurn.topDisabled && openingTurn.monsterDisabled && openingTurn.previewClosed);
  assert.equal(openingTurn.phase, '主要阶段');
  assert.equal(openingTurn.label, '首回合禁攻');
  assert.match(openingTurn.hint, /先手首回合不能攻击/);
  assert.equal(openingTurn.revision, openingRevision, 'Opening double-click sent a phase or attack command');
  await writeFile(path.join(options.artifactDir, `online-opening-turn-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#fieldCancelBtn');
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'opening-turn desktop restored', options.timeoutMs);

  // Verify real cards after summoning, including defense and narrow-screen stat legibility.
  const fieldCardLayout = {};
  const readFieldCards = () => evaluate(cdp, firstPage, `(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll("#playerField .field-monster-card")].map(card => {
      const rect = card.getBoundingClientRect();
      const art = card.querySelector(".art").getBoundingClientRect();
      const head = card.querySelector('.card-head').getBoundingClientRect();
      return { name: card.querySelector(".card-name").textContent, defense: card.classList.contains("defense"),
        width: rect.width, height: rect.height, slotWidth: card.closest(".slot").getBoundingClientRect().width,
        artHeight: art.height, artWidth: art.width, artBelowName: art.top >= head.bottom - 1,
        nameSize: parseFloat(getComputedStyle(card.querySelector(".card-name")).fontSize),
        nameHeight: card.querySelector(".card-name").getBoundingClientRect().height,
        status: card.querySelector('.card-state-chip')?.textContent,
        statusHeight: card.querySelector('.card-state-chip')?.getBoundingClientRect().height || 0,
        faceTransform: getComputedStyle(card.querySelector(".field-card-face")).transform,
        statsTransform: getComputedStyle(card.querySelector(".stats")).transform,
        stats: [...card.querySelectorAll(".stat")].map(stat => {
          const box = stat.getBoundingClientRect();
          return { text: stat.textContent, width: stat.clientWidth, contentWidth: stat.scrollWidth,
            inside: box.left >= rect.left - 1 && box.right <= rect.right + 1 && box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1 };
        }) };
    })
  }))()`);
  const assertFieldCards = (layout, { shortLandscape = false } = {}) => {
    assert.ok(layout.scrollWidth <= layout.width, `Field overflow at ${layout.width}px`);
    assert.equal(layout.cards.length, 2);
    for (const card of layout.cards) {
      assert.ok(card.artHeight >= 16, `${card.name} art collapsed at ${layout.width}px`);
      if (!shortLandscape) assert.ok(card.statusHeight >= 8, `${card.name} action state disappeared at ${layout.width}px`);
      assert.equal(card.faceTransform, "none", `${card.name} text rotated with defense art`);
      assert.equal(card.statsTransform, "none");
      assert.equal(card.stats.length, 2);
      for (const stat of card.stats) {
        assert.ok(stat.inside && stat.width > 0 && stat.contentWidth <= stat.width + 1, `${stat.text} clipped at ${layout.width}px`);
      }
      if (layout.width > 1040) {
        assert.ok(card.width >= Math.min(280, card.slotWidth * .8) - 1, `${card.name} shrank inside its desktop slot`);
        assert.ok(card.nameSize >= 11, `${card.name} desktop name is too small`);
        assert.ok(card.nameHeight >= 14, `${card.name} desktop name collapsed`);
        if (card.height >= 180 && card.width / card.height <= 1.7) {
          assert.ok(card.artWidth >= card.width * .85 && card.artBelowName, `${card.name} leaves a blank text column inside its tall card at ${layout.width}px`);
        }
      }
    }
  };
  await click(cdp, firstPage, '#playerField .slot[data-card-uid]');
  await click(cdp, firstPage, '#fieldModeBtn');
  await waitForPage(cdp, firstPage, visibleExpression('#playerField .field-monster-card.defense'), "upright defense card", options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector("#actionStage").hidden`, "defense presentation completed", options.timeoutMs);
  await click(cdp, firstPage, '#playerField .slot[data-monster-state="defense"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldAttackBtn').disabled`), true);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#duelHint').textContent`), /守备表示不能攻击/);
  await click(cdp, firstPage, '#fieldCancelBtn');
  fieldCardLayout.desktop = await readFieldCards();
  assertFieldCards(fieldCardLayout.desktop);
  assert.equal(fieldCardLayout.desktop.cards[0].defense, true);
  const fieldScreenshotPath = path.join(options.artifactDir, `online-field-cards-${roomCode}.png`);
  await writeFile(fieldScreenshotPath, Buffer.from((await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })).data, "base64"));
  for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160], [390, 844], [320, 720], [844, 390]]) {
    await firstPage.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, firstPage, `innerWidth === ${width}`, "field-card responsive viewport", options.timeoutMs);
    fieldCardLayout[width] = await readFieldCards();
    assertFieldCards(fieldCardLayout[width]);
    if (width <= 1040) handLayouts[width] = await checkHandLayout(cdp, firstPage);
    if (width === 390) {
      await writeFile(path.join(options.artifactDir, `online-field-cards-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })).data, "base64"));
    }
  }
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 568, height: 320, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, 'innerWidth === 568 && innerHeight === 320', 'short landscape field-card viewport', options.timeoutMs);
  await click(cdp, firstPage, '#playerField .slot[data-monster-state="defense"]');
  await waitForPage(cdp, firstPage, visibleExpression('#fieldActionBar'), 'selected defense card in short landscape', options.timeoutMs);
  fieldCardLayout.shortLandscape = await readFieldCards();
  assertFieldCards(fieldCardLayout.shortLandscape, { shortLandscape: true });
  assert.equal(fieldCardLayout.shortLandscape.cards[0].defense, true);
  await checkGuidanceLayout(cdp, firstPage);
  await writeFile(path.join(options.artifactDir, `online-field-cards-568x320-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#fieldCancelBtn');
  await firstPage.cdp.send("Emulation.clearDeviceMetricsOverride");
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, "field-card desktop viewport restored", options.timeoutMs);

  await endTurn(cdp, firstPage, options.timeoutMs);
  await waitForPage(cdp, secondPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "2P turn", options.timeoutMs);
  handNavigationChecks.shortLandscape = await exerciseVerticalHandNavigation(cdp, secondPage, options.timeoutMs);
  assert.equal(await evaluate(cdp, secondPage, `!document.querySelector('#battleButton').disabled`), true, 'The follower could not enter battle on their first turn');
  openingTurn.followerCanEnterBattle = true;
  const guidanceLayouts = await exerciseGuidanceLayouts(cdp, firstPage, options, roomCode);
  await waitForPage(cdp, firstPage, visibleExpression('#playerField .slot[data-monster-state="waiting"]'), "rival-turn monster waiting state", options.timeoutMs);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await click(cdp, firstPage, '#hand .card:last-child .card-detail-entry');
  const inspectorCloseOrigin = await evaluate(cdp, firstPage, `({ cardId: document.querySelector('#hand .card:last-child').dataset.cardUid, scrollLeft: document.querySelector('#hand').scrollLeft, revision: Number(document.querySelector('#app').dataset.revision) })`);
  await doubleClickText(cdp, secondPage, "#hand .card.action-ready", "弱化力场");
  await waitForPage(cdp, secondPage, visibleExpression("#playerTraps .trap-slot:not(.empty)"), "set weakening web", options.timeoutMs);
  await waitForPage(cdp, firstPage, `Number(document.querySelector('#app').dataset.revision) > ${inspectorCloseOrigin.revision}`, 'hand refreshed while details remain open', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#cardInspector').open`), true, 'Incoming action dismissed the card being read');
  for (const type of ['keyDown', 'keyUp']) await firstPage.cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitForPage(cdp, firstPage, `!document.querySelector('#cardInspector').open && document.activeElement.matches('.card-detail-entry')`, 'Escape restores the refreshed hand entry', options.timeoutMs);
  const inspectorCloseFocus = { escape: await evaluate(cdp, firstPage, `({ cardId: document.activeElement.closest('.card').dataset.cardUid, scrollLeft: document.querySelector('#hand').scrollLeft })`) };
  assert.equal(inspectorCloseFocus.escape.cardId, inspectorCloseOrigin.cardId, 'Escape returned to another hand card');
  assert.ok(Math.abs(inspectorCloseFocus.escape.scrollLeft - inspectorCloseOrigin.scrollLeft) <= 1, 'Closing details moved the hand scroll position');
  await writeFile(path.join(options.artifactDir, `online-inspector-close-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#hand .card:last-child .card-detail-entry');
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector("#turnLabel")?.textContent?.trim() === "你的回合"`, "1P attack turn", options.timeoutMs);
  await click(cdp, firstPage, '#inspectorClose');
  await waitForPage(cdp, firstPage, `document.activeElement.matches('.card-detail-entry')`, 'Close button restores the refreshed hand entry', options.timeoutMs);
  inspectorCloseFocus.button = await evaluate(cdp, firstPage, `({ cardId: document.activeElement.closest('.card').dataset.cardUid })`);
  assert.equal(inspectorCloseFocus.button.cardId, inspectorCloseOrigin.cardId, 'Turn change returned to another hand card');
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'inspector close desktop restored', options.timeoutMs);

  await click(cdp, firstPage, '#playerField .slot:has(.field-monster-card.defense)');
  await click(cdp, firstPage, '#fieldModeBtn');
  await waitForPage(cdp, firstPage, `!document.querySelector('#playerField .field-monster-card.defense')`, "defense card returned to attack", options.timeoutMs);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `innerWidth === 2560 && document.querySelector('#actionStage').hidden && document.querySelector('#phaseStage').hidden`, 'large portrait field card without transient stages', options.timeoutMs);
  const largeCardClip = await evaluate(cdp, firstPage, `(() => { const r = document.querySelector('#playerField .slot').getBoundingClientRect(); return { x: Math.max(0,r.x - 6), y: Math.max(0,r.y - 6), width: r.width + 12, height: r.height + 12, scale: 1 }; })()`);
  await writeFile(path.join(options.artifactDir, `online-field-card-large-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: largeCardClip })).data, 'base64'));
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040 && innerWidth < 1920', 'field-card desktop viewport restored after 4K check', options.timeoutMs);
  await waitForPage(cdp, firstPage, `(() => {
    const slot = document.querySelector('#playerField .slot[data-attack-state="ready"]');
    return slot && parseFloat(getComputedStyle(slot, "::before").height) < 32;
  })()`, "compact attack hint without covering card art", options.timeoutMs);
  const keyboardField = await exerciseFieldKeyboard(cdp, firstPage, options, roomCode);
  await click(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await click(cdp, firstPage, '#fieldAttackBtn');
  await waitForPage(cdp, firstPage, visibleExpression('.online-attack-preview[data-preview-mode="direct"]'), "compact direct-attack decision", options.timeoutMs);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('.online-attack-route').textContent`), /日冕骑士.*月见演出测试/);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('.online-attack-outcome').textContent`), /预计造成 1700 伤害.*4000 → 2300/);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('.online-attack-details').open`), false);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#playerField .online-attack-source').length`), 1);
  const attackChoiceLayouts = {};
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720], [320, 568], [844, 390], [568, 320]]) {
    const layoutKey = height === 568 ? '320x568' : String(width);
    const landscape = width > height && width <= 1040;
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    attackChoiceLayouts[layoutKey] = await waitForPage(cdp, firstPage, `(() => {
      if (innerWidth !== ${width} || innerHeight !== ${height}) return null;
      const panel = document.querySelector('#choiceActions').getBoundingClientRect();
      const confirm = document.querySelector('#choiceConfirmBtn').getBoundingClientRect();
      const preview = document.querySelector('#onlineBattlePreview').getBoundingClientRect();
      const hand = document.querySelector('#handPanel').getBoundingClientRect();
      const field = document.querySelector('#duelPanel').getBoundingClientRect();
      const besideField = panel.left >= field.right && panel.top >= hand.top && panel.right <= hand.right + 1 && panel.bottom <= hand.bottom + 1;
      return (${landscape} ? besideField : panel.height < 230) && panel.top >= 0 && panel.bottom <= innerHeight && confirm.bottom <= panel.bottom && confirm.top >= preview.bottom && document.documentElement.scrollWidth <= innerWidth
        ? { width: innerWidth, height: panel.height, confirmVisible: true, besideField } : null;
    })()`, 'compact attack decision and reachable confirmation', options.timeoutMs);
    attackChoiceLayouts[layoutKey].controls = await checkChoiceControls(cdp, firstPage, options.timeoutMs);
    if (width === 568) await writeFile(path.join(options.artifactDir, `online-attack-controls-landscape-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  }
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, 'attack decision desktop viewport restored', options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector('#actionStage').hidden && document.querySelector('#phaseStage').hidden`, 'attack preview screenshot without transient presentations', options.timeoutMs);
  const attackChoicePath = path.join(options.artifactDir, `online-attack-choice-${roomCode}.png`);
  await writeFile(attackChoicePath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '.online-attack-details summary');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('.online-attack-details').open`), true);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `(() => {
    const panel = document.querySelector('#choiceActions').getBoundingClientRect();
    const preview = document.querySelector('#onlineBattlePreview').getBoundingClientRect();
    const button = document.querySelector('#choiceConfirmBtn').getBoundingClientRect();
    return innerWidth === 844 && preview.top >= panel.top && preview.bottom <= button.top && button.bottom <= innerHeight;
  })()`, 'expanded attack detail scrolls inside landscape panel', options.timeoutMs);
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, `innerWidth > 1040`, 'expanded detail desktop viewport restored', options.timeoutMs);
  const attackReturnRevision = await evaluate(cdp, firstPage, `document.querySelector('#app').dataset.revision`);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceCancelBtn').textContent`), '返回操作');
  await click(cdp, firstPage, '#choiceCancelBtn');
  const attackPreviewReturn = await evaluate(cdp, firstPage, `({ monster: document.querySelector('#fieldActionName').textContent,
    menuVisible: !document.querySelector('#fieldActionBar').hidden, previewHidden: document.querySelector('#choiceActions').hidden,
    focus: document.activeElement.id, ready: document.querySelector('#playerField .slot[data-index="0"]').dataset.attackState,
    revision: document.querySelector('#app').dataset.revision })`);
  assert.equal(attackPreviewReturn.monster, '日冕骑士');
  assert.ok(attackPreviewReturn.menuVisible && attackPreviewReturn.previewHidden);
  assert.equal(attackPreviewReturn.focus, 'fieldAttackBtn');
  assert.equal(attackPreviewReturn.ready, 'ready', 'Returning from preview consumed the attack');
  assert.equal(attackPreviewReturn.revision, attackReturnRevision, 'Returning from preview sent a server action');
  await writeFile(path.join(options.artifactDir, `online-attack-return-mobile-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#aiPanel').textContent`), /4000 \/ 4000/);
  assert.equal(await evaluate(cdp, firstPage, visibleExpression('.online-attack-source')), false, 'Cancel left an attack source highlighted');
  await click(cdp, firstPage, '#playerField .slot[data-index="1"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldActionName').textContent`), '疾风术士', 'Switching attackers required another click');
  await click(cdp, firstPage, '#fieldAttackBtn');
  await pressPageKey(firstPage, 'Escape', 'Escape', 27);
  assert.equal(await evaluate(cdp, firstPage, `!document.querySelector('#fieldActionBar').hidden && document.querySelector('#fieldActionName').textContent === '疾风术士' && document.activeElement.id === 'fieldAttackBtn'`), true, 'Escape did not return to the attacker menu');
  await pressPageKey(firstPage, 'Escape', 'Escape', 27);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldActionBar').hidden && document.querySelector('#choiceActions').hidden`), true, 'Second Escape did not clear the monster selection');
  attackPreviewReturn.switchedAttackerOnce = true;
  attackPreviewReturn.escapeReturnedThenCleared = true;
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, firstPage, 'innerWidth > 1040', 'attack return desktop restored', options.timeoutMs);
  await click(cdp, secondPage, '#logToggle');
  await click(cdp, secondPage, '#eventLog [data-public-report]');
  await waitForPage(cdp, secondPage, visibleExpression('.public-report[open]'), 'rival reading a report before response', options.timeoutMs);
  await click(cdp, firstPage, '#playerField .slot[data-index="0"]');
  await click(cdp, firstPage, '#fieldAttackBtn');
  await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').focus()`);
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.id`), 'choiceConfirmBtn');
  await pressPageKey(firstPage, 'Enter', 'Enter', 13);
  await waitForPage(cdp, firstPage, `(() => Boolean(document.querySelector(".online-response-attacker")) || (document.querySelector("#actionStage")?.innerText || "").includes("直接攻击"))()`, "declared attack presentation", options.timeoutMs);
  await waitForPage(cdp, secondPage, `(() => { const button = document.querySelector("#responseActivate"); return Boolean(button && !button.disabled && button.getClientRects().length); })()`, "trap activation", options.timeoutMs);
  assert.deepEqual(await evaluate(cdp, secondPage, `[...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id || dialog.className)`), ['onlineResponse'], 'Response retained a stale report underneath');
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector('#eventLog').hidden`), true, 'Response retained the old timeline');
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector('#onlineResponse').contains(document.activeElement)`), true, 'Response focus remained in a closed browsing window');
  await secondPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const responseScreenshotPath = path.join(options.artifactDir, `online-response-takeover-mobile-${roomCode}.png`);
  await writeFile(responseScreenshotPath, Buffer.from((await secondPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await secondPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  const responseTakeover = { closedReport: true, closedTimeline: true, focusEnteredResponse: true, responseScreenshotPath };
  const responseLayouts = await checkDialogLayouts(cdp, secondPage, '#onlineResponse', options, roomCode);

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
  const screenshot = await firstPage.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const screenshotPath = path.join(options.artifactDir, `online-action-stage-${roomCode}.png`);
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  await Promise.all([
    waitForPage(cdp, firstPage, `document.querySelector("#aiPanel")?.textContent?.includes("2800 / 4000")`, "1P final rival LP", options.timeoutMs),
    waitForPage(cdp, secondPage, `document.querySelector("#playerPanel")?.textContent?.includes("2800 / 4000")`, "2P final LP", options.timeoutMs),
    waitForPage(cdp, firstPage, `document.querySelector("#eventLogList")?.textContent?.includes("1200 伤害")`, "exact battle receipt", options.timeoutMs),
    waitForPage(cdp, spectatorPage, `document.querySelector("#watchPlayers")?.textContent?.includes("2800 LP")`, "spectator final LP", options.timeoutMs)
  ]);
  await Promise.all([firstPage, secondPage].map(page => waitForPage(cdp, page, `document.querySelector('#duelHint').dataset.kind === 'battle-result' && document.querySelector('#duelHint').textContent.includes('1200')`, 'single-trap receipt follows playback', options.timeoutMs)));
  const battleHandoff = await waitForPage(cdp, firstPage, `(() => {
    const slot = document.activeElement;
    const next = slot.matches('#playerField .slot[data-attack-state="ready"]');
    return next && document.querySelector('#actionStage').hidden && document.querySelector('#chainResolutionStage').hidden
      && !document.querySelector('.life-delta') ? { next: slot.querySelector('.card-name').textContent, focusVisible: slot.matches(':focus-visible') } : null;
  })()`, 'keyboard focus moves to a ready attacker after playback', options.timeoutMs);
  assert.deepEqual(battleHandoff, { next: '疾风术士', focusVisible: true });
  await writeFile(path.join(options.artifactDir, `online-battle-handoff-${roomCode}.png`), Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await pressPageKey(firstPage, 'Enter', 'Enter', 13);
  assert.equal(await evaluate(cdp, firstPage, `!document.querySelector('#fieldActionBar').hidden && document.querySelector('#fieldActionName').textContent === '疾风术士' && document.querySelector('#choiceActions').hidden`), true, 'Selecting the focused monster started another attack');
  await pressPageKey(firstPage, 'Escape', 'Escape', 27);
  for (const page of [firstPage, secondPage]) {
    assert.equal(await evaluate(cdp, page, `window.__onlineRhythmHistory.some(beat => beat.hintKind === 'battle-result' && (beat.chain || beat.action || beat.damage))`), false, 'Single-trap receipt appeared during playback');
  }
  const [firstStages, secondStages, spectatorSummary] = await Promise.all([
    stageHistory(cdp, firstPage),
    stageHistory(cdp, secondPage),
    evaluate(cdp, spectatorPage, `(() => ({
      phase: document.querySelector("#watchPhase")?.textContent?.trim() || "",
      series: document.querySelector("#watchSeries")?.textContent?.trim() || "",
      players: document.querySelector("#watchPlayers")?.textContent?.replace(/\\s+/g, " ").trim() || ""
    }))()`)
  ]);
  assert.equal(await evaluate(cdp, secondPage, `document.querySelectorAll('dialog[open]').length === 0 && document.querySelector('#eventLog').hidden`), true, 'Resolving the response exposed an old browsing window');
  responseTakeover.resolutionReturnedToBoard = true;
  assert.ok(firstStages.some((entry) => entry.text.includes("双重召唤")), "Spell action stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.text.includes("怪兽召唤")), "Queued summon stage was not recorded");
  assert.ok(firstStages.some((entry) => entry.depth >= 1), "Second action replaced the active public action instead of queuing");
  assert.ok([...firstStages, ...secondStages].some((entry) => entry.text.includes("1200")), "Delayed damage was not captured by a public presentation stage");

  await waitForPage(cdp, firstPage, `document.querySelector('#actionStage').hidden && document.querySelector('#chainResolutionStage').hidden`, "battle presentation finished", options.timeoutMs);
  await click(cdp, firstPage, '#playerField .slot[data-monster-state="spent"]');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldAttackBtn').disabled`), true);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#duelHint').textContent`), /本次攻击已使用/);
  await click(cdp, firstPage, '#fieldDetailBtn');
  await waitForPage(cdp, firstPage, textMatchExpression('#inspectorContent', '数值修正随怪兽离场重置'), "sourced monster effect lifetime", options.timeoutMs);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#inspectorContent').textContent`), /弱化力场/);
  const monsterEffectsPath = path.join(options.artifactDir, `online-monster-effects-${roomCode}.png`);
  await writeFile(monsterEffectsPath, Buffer.from((await firstPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await click(cdp, firstPage, '#inspectorClose');
  await click(cdp, firstPage, '#fieldCancelBtn');

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
  await click(cdp, secondPage, '#logToggle');
  await waitForPage(cdp, secondPage, visibleExpression('#eventLog'), 'rival timeline before the duel ends', options.timeoutMs);
  await click(cdp, secondPage, '#hand .card .card-detail-entry');
  await waitForPage(cdp, secondPage, visibleExpression('#cardInspector[open]'), 'rival reads details before the duel ends', options.timeoutMs);
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
  assert.deepEqual(await evaluate(cdp, secondPage, `[...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id || dialog.className)`), ['onlineResult'], 'Automatic result left an old browsing dialog underneath');
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.id`), 'resultRematch', 'Result should focus its primary action');
  const resultKeyboardOrder = [];
  for (const expected of ['resultReview', 'report', 'resultLobby']) {
    await firstPage.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await firstPage.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focused = await evaluate(cdp, firstPage, `document.activeElement.id || (document.activeElement.matches('[data-public-report]') ? 'report' : '')`);
    assert.equal(focused, expected, 'Result keyboard order differs from visual action order');
    resultKeyboardOrder.push(focused);
  }
  for (const expected of ['report', 'resultReview', 'resultRematch']) {
    await firstPage.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    await firstPage.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    assert.equal(await evaluate(cdp, firstPage, `document.activeElement.id || (document.activeElement.matches('[data-public-report]') ? 'report' : '')`), expected, 'Result reverse keyboard order differs from visual action order');
  }
  assert.equal(await evaluate(cdp, secondPage, `document.querySelector('#eventLog').hidden`), true, 'Automatic result retained the timeline over the final board');
  await click(cdp, secondPage, '#resultReview');
  assert.equal(await evaluate(cdp, secondPage, `document.querySelectorAll('dialog[open]').length`), 0, 'Reviewing the final board exposed stale details');
  assert.equal(await evaluate(cdp, secondPage, `document.activeElement.id`), 'resultReopenButton');
  await secondPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, secondPage, visibleExpression('#resultReopenButton'), 'mobile final board remains accessible', options.timeoutMs);
  const reviewScreenshotPath = path.join(options.artifactDir, `online-result-review-mobile-${roomCode}.png`);
  await writeFile(reviewScreenshotPath, Buffer.from((await secondPage.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await secondPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await click(cdp, secondPage, '#resultReopenButton');
  await click(cdp, secondPage, '#onlineResult [data-public-report]');
  await waitForPage(cdp, secondPage, visibleExpression('.public-report[open]'), 'intentional report from result', options.timeoutMs);
  await click(cdp, secondPage, '.public-report [data-close]');
  await waitForPage(cdp, secondPage, visibleExpression('#onlineResult[open]'), 'closing report returns to result', options.timeoutMs);
  assert.equal(await evaluate(cdp, secondPage, `document.activeElement.matches('#onlineResult [data-public-report]')`), true, 'Report close lost its result-page entry point');
  const resultTakeover = { closedStaleDetails: true, closedTimeline: true, reviewBoardUnobstructed: true, intentionalReportReturned: true, resultKeyboardOrder, reviewScreenshotPath };
  const resultLayouts = await checkDialogLayouts(cdp, firstPage, '#onlineResult', options, roomCode);
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
  await waitForPage(cdp, secondPage, `document.querySelector('#actionStage').hidden`, 'rematch summon presentation completed', options.timeoutMs);
  await endTurn(cdp, secondPage, options.timeoutMs);
  await waitForPage(cdp, firstPage, textMatchExpression('#hand .card.action-ready', '日冕骑士'), 'rematch 1P summon available', options.timeoutMs);
  await doubleClickText(cdp, firstPage, '#hand .card.action-ready', '日冕骑士');
  await waitForPage(cdp, firstPage, `document.querySelector('#actionStage').hidden`, 'rematch attacker presentation completed', options.timeoutMs);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await waitForPage(cdp, firstPage, `innerWidth === 844`, 'landscape slot shortcut viewport', options.timeoutMs);
  await click(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await click(cdp, firstPage, '#fieldAttackBtn');
  await waitForPage(cdp, firstPage, textMatchExpression('.online-attack-route', '铁壁守卫'), 'unique monster target preselected', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#fieldTargets').hidden`), true, 'Unique target rendered a redundant candidate list');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#choiceConfirmBtn').disabled`), false);
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('.online-attack-outcome').textContent`), /预计造成 800 伤害.*4000 → 3200/);
  const attackTargetId = await evaluate(cdp, firstPage, `document.querySelector('#aiField .target-selected')?.dataset.cardUid`);
  assert.ok(attackTargetId, 'Unique attack has no selected field target');
  for (const [width, height] of [[320, 568], [568, 320]]) {
    await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, firstPage, `(() => {
      if (innerWidth !== ${width} || innerHeight !== ${height}) return false;
      const confirm = document.querySelector('#choiceConfirmBtn');
      const slot = document.querySelector('#aiField .target-selected');
      return slot?.dataset.cardUid === ${JSON.stringify(attackTargetId)} && !confirm.disabled && [slot, confirm].every(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
    })()`, 'rotation preserves the attack target and keeps it clickable', options.timeoutMs);
  }
  attackChoiceLayouts[568].targetRestored = true;
  await click(cdp, firstPage, '#aiField .slot.attack-target');
  await pressPageKey(firstPage, 'Enter', 'Enter', 13);
  await pressPageKey(firstPage, 'Enter', 'Enter', 13, { autoRepeat: true });
  assert.equal(await evaluate(cdp, firstPage, `document.activeElement.parentElement.id === 'aiField' && document.activeElement.getAttribute('aria-pressed') === 'true'`), true, 'Selecting an attack target lost its keyboard cursor');
  keyboardField.targetPreservedFocus = true;
  await click(cdp, firstPage, '#choiceCancelBtn');
  assert.equal(await evaluate(cdp, firstPage, `!document.querySelector('#fieldActionBar').hidden && document.querySelector('#fieldActionName').textContent === '日冕骑士'`), true, 'Unique-target preview lost its attacker on return');
  assert.match(await evaluate(cdp, firstPage, `document.querySelector('#aiPanel').textContent`), /4000 \/ 4000/);
  await firstPage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  // The explicit button opens a preview; double-click intentionally executes the sole legal attack.
  await doubleClick(cdp, firstPage, '#playerField .slot[data-attack-state="ready"]');
  await waitForPage(cdp, firstPage, textMatchExpression('#aiPanel', '3200 / 4000'), 'landscape unique-target quick attack deals damage once', options.timeoutMs);
  await waitForPage(cdp, firstPage, `(window.__onlineRhythmHistory || []).some((entry) => entry.damage === '-800')`, 'damage caption follows attack impact', options.timeoutMs);
  await waitForPage(cdp, firstPage, `document.querySelector('#duelHint').dataset.kind === 'battle-result' && document.querySelector('#duelHint').textContent.includes('800')`, 'direct battle receipt follows damage', options.timeoutMs);
  const rhythm = await evaluate(cdp, firstPage, `(window.__onlineRhythmHistory || []).map(({ key, ...entry }) => entry)`);
  assert.ok(rhythm.some((entry) => entry.phase), 'No phase presentation was observed');
  assert.ok(rhythm.some((entry) => entry.epic > 0), 'Key attack lost its impact caption');
  assert.ok(rhythm.every((entry) => !entry.phase || (!entry.action && !entry.epic && !entry.damage)), 'Phase and action effects overlapped');
  assert.ok(rhythm.every((entry) => !entry.damage || !entry.epic), 'Damage caption overlapped the attack caption');
  assert.ok(rhythm.filter(entry => entry.hintKind === 'battle-result').every(entry => !entry.chain && !entry.action && !entry.damage), 'Direct battle receipt appeared during playback');
  assert.ok(rhythm.every((entry) => !['魔法发动', '怪兽召唤', '后场盖放', '转为守备', '转为攻击'].includes(entry.title) || !entry.epic), 'Ordinary action repeated a central caption');
  assert.equal(await evaluate(cdp, firstPage, `document.querySelectorAll('#aiField .slot[data-card-uid]').length`), 0);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#playerField .slot[data-card-uid]').dataset.monsterState`), 'spent');
  await firstPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await click(cdp, spectatorPage, '[data-public-report]');
  await waitForPage(cdp, spectatorPage, textMatchExpression('.public-report [data-status]', '第 2 局'), 'current public history', options.timeoutMs);
  await evaluate(cdp, spectatorPage, `(() => { const select = document.querySelector('.public-report [data-game]'); select.value = '1'; select.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await waitForPage(cdp, spectatorPage, textMatchExpression('.public-report [data-status]', '已结束'), 'previous duel public history', options.timeoutMs);
  assert.match(await evaluate(cdp, spectatorPage, `document.querySelector('.public-report [data-entries] li').textContent`), /本局开始/);
  const publicReportLayouts = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720], [844, 390]]) {
    await spectatorPage.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForPage(cdp, spectatorPage, `innerWidth === ${width}`, 'public report viewport', options.timeoutMs);
    const layout = await evaluate(cdp, spectatorPage, `(() => { const dialog = document.querySelector('.public-report'); return { width: innerWidth, height: innerHeight,
      listHeight: dialog.querySelector('ol').clientHeight,
      fits: [...dialog.querySelectorAll('button,select')].every(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.height >= 44; }) }; })()`);
    assert.ok(layout.fits && layout.listHeight > 60, `Public report controls overflow: ${JSON.stringify(layout)}`);
    publicReportLayouts.push(layout);
  }
  await spectatorPage.cdp.send('Emulation.clearDeviceMetricsOverride');
  await waitForPage(cdp, spectatorPage, `innerWidth > 1040`, 'public report desktop viewport restored', options.timeoutMs);
  await click(cdp, spectatorPage, '.public-report [data-close]');
  await waitForPage(cdp, spectatorPage, `!document.querySelector('.public-report').open`, 'public report closed before leaving spectator', options.timeoutMs);
  const beforeResume = await evaluate(cdp, firstPage, `document.querySelector('#connectionStatus').textContent`);
  const beforeResumeLp = await evaluate(cdp, firstPage, `document.querySelector('#aiPanel').textContent`);
  await firstPage.cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await firstPage.cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await firstPage.cdp.send('Page.bringToFront');
  await waitForPage(cdp, firstPage, `document.body.dataset.onlineConnection === 'connected' && /已同步最新战况|连接已恢复/.test(document.querySelector('#connectionStatus').textContent)`, 'foreground reconciles after browser freeze', options.timeoutMs);
  assert.equal(await evaluate(cdp, firstPage, `document.querySelector('#aiPanel').textContent`), beforeResumeLp);
  assert.equal(await evaluate(cdp, firstPage, `!document.querySelector('#actionStage').hidden`), false, 'Foreground replayed historical action');
  await click(cdp, spectatorPage, "#watchLeave");
  await waitForPage(cdp, firstPage, textMatchExpression("#onlineSpectatorCount", "观众 0"), "spectator left count", options.timeoutMs);
  assert.equal(await evaluate(cdp, spectatorPage, visibleExpression("#watchBoard")), false, "Leaving spectator retained the public board");
  const lifecycle = { refreshedPendingResponse: true, refreshedSpectator: true, restoredRematchAcceptance: true, secondPlayerSummoned: true, spectatorLeft: true, openingTurn, battleHandoff, keyboardField, attackPreviewReturn, inspectorCloseFocus, guidanceLayouts, publicReportLayouts, responseLayouts, responseTakeover, resultLayouts, resultTakeover, browserFreezeResumed: true, beforeResume };
  const reportPath = path.join(options.artifactDir, `online-action-stage-${roomCode}.json`);
  await writeFile(reportPath, `${JSON.stringify({ roomCode, screenshotPath, workspaceScreenshotPath, handFeedbackPath, pendingFeedback, fieldScreenshotPath, fieldCardLayout, handLayouts, inspectorLayouts, detailClickBoundary, ordinaryControls, handNavigationChecks, keyboardHand, monsterEffectsPath, attackChoicePath, attackChoiceLayouts, mobileLayout, selectionAppearance, firstStages, secondStages, rhythm, spectatorSummary, lifecycle }, null, 2)}\n`, "utf8");
  console.log(`online-browser-smoke passed (${roomCode}, consent spectator, queued action stage, refreshed trap response, 1200 damage, refreshed rematch, 2P summon)`);
  console.log(`screenshot: ${screenshotPath}`);
  console.log(`stage report: ${reportPath}`);
  }
} catch (error) {
  if (process.env.GITHUB_ACTIONS) {
    const message = String(error.message || error).split("\n")[0].slice(0, 2000).replaceAll("%", "%25").replaceAll("\r", "%0D");
    console.error(`::error title=Online browser smoke failure::${message}`);
  }
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
