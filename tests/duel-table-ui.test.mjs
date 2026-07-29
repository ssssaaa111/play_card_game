import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("duel table shell keeps existing gameplay anchors inside a focused workspace", () => {
  const html = read("index.html");

  assert.match(html, /href="duel-table\.css\?v=20260730-duel-table-2"/);
  assert.match(html, /class="arena duel-table"/);
  assert.match(html, /id="detailDrawer"[\s\S]*id="detailName"/);
  assert.match(html, /id="timelineDrawer"[\s\S]*id="timeline"/);
  assert.match(html, /id="detailDrawerToggle"[\s\S]*aria-controls="detailDrawer"/);
  assert.match(html, /id="timelineDrawerToggle"[\s\S]*aria-controls="timelineDrawer"/);
  assert.match(html, /class="hand-panel" aria-label="玩家手牌"/);
  assert.match(html, /src="src\/duel-table\.js\?v=20260730-duel-table-2"/);
});

test("low-frequency media and session controls live behind one utility menu", () => {
  const html = read("index.html");

  assert.match(html, /id="utilityMenuToggle"[\s\S]*aria-controls="utilityMenu"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="guideBtn"[\s\S]*id="pauseBtn"/);
  assert.match(html, /id="utilityMenu"[\s\S]*id="soundBtn"[\s\S]*id="musicBtn"[\s\S]*id="voiceBtn"/);
  assert.match(html, /class="actions" aria-label="回合操作"[\s\S]*id="skipAttackBtn"[\s\S]*id="endTurnBtn"/);
});

test("desktop duel table promotes the field and overlays compact HUD rails", () => {
  const css = read("duel-table.css");

  assert.match(css, /#app \.arena\.duel-table\s*\{[\s\S]*position: relative;[\s\S]*overflow: hidden;/);
  assert.match(css, /#app \.duel-table \.field\s*\{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*calc\(var\(--table-hud-width\) \+ 18px\)/);
  assert.match(css, /#app \.duel-table \.side\.duel-hud\s*\{[\s\S]*position: absolute;[\s\S]*width: var\(--table-hud-width\);/);
  assert.match(css, /\.workspace-drawer\s*\{[\s\S]*position: absolute;[\s\S]*visibility: hidden;/);
  assert.match(css, /\.workspace-drawer\.is-open\s*\{[\s\S]*visibility: visible;[\s\S]*pointer-events: auto;/);
});

test("compact workspaces keep field and hand in fixed viewport rows", () => {
  const css = read("duel-table.css");

  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*#app\s*\{[\s\S]*height: 100dvh;[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) clamp\(226px, 34dvh, 278px\);[\s\S]*overflow: hidden;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#app\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) clamp\(242px, 36dvh, 296px\);/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-drawer\s*\{[\s\S]*transform: translateY/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 1040px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) clamp\(226px, 31vw, 300px\);/);
});

test("workspace controller synchronizes drawers, timeline badges, and settings", () => {
  const controller = read("src/duel-table.js");

  assert.match(controller, /export function createDuelTableController/);
  assert.match(controller, /function setDrawer\(name, open\)/);
  assert.match(controller, /drawer\.root\?\.classList\.toggle\("is-open", active\)/);
  assert.match(controller, /timelineBadge\.textContent = timelineCount\.textContent/);
  assert.match(controller, /detailRequiresAttention\(\)/);
  assert.match(controller, /compactWorkspace\.addEventListener\("change"/);
});
