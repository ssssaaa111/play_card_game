import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("duel table shell keeps existing gameplay anchors inside a focused workspace", () => {
  const html = read("index.html");

  assert.match(html, /href="duel-table\.css\?v=20260730-duel-attention-2"/);
  assert.match(html, /class="arena duel-table"/);
  assert.match(html, /id="detailDrawer"[\s\S]*id="detailName"/);
  assert.match(html, /id="timelineDrawer"[\s\S]*id="timeline"/);
  assert.match(html, /id="detailDrawerToggle"[\s\S]*aria-controls="detailDrawer"/);
  assert.match(html, /id="timelineDrawerToggle"[\s\S]*aria-controls="timelineDrawer"/);
  assert.match(html, /class="hand-panel" aria-label="玩家手牌"/);
  assert.match(html, /src="src\/duel-table\.js\?v=20260730-duel-attention-2"/);
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

test("combat attention system exposes phase progress and hand readiness", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");
  const app = read("src/app.js");

  assert.match(html, /id="phaseRail"[\s\S]*data-phase-step="draw"[\s\S]*data-phase-step="main"[\s\S]*data-phase-step="battle"/);
  assert.match(html, /id="handGuide"[\s\S]*id="handReadyCount"[\s\S]*id="handReadyLabel"/);
  assert.match(css, /\.phase-step\.is-current[\s\S]*\.hand-panel:not\(\[data-ready-count="0"\]\)/);
  assert.match(css, /body\[data-duel-action-window="targetSelect"\][\s\S]*#duelHint/);
  assert.match(controller, /function syncCombatAttention\(\)/);
  assert.match(controller, /querySelectorAll\("\.card\.action-ready:not\(\.action-blocked\)"\)/);
  assert.match(controller, /handPanel\.dataset\.attention = selection/);
  assert.match(app, /document\.body\.dataset\.duelPhase/);
  assert.match(app, /document\.body\.dataset\.duelSelection/);
  assert.match(app, /document\.body\.dataset\.duelCanAct/);
});

test("pre-duel setup uses a responsive loadout and tactical intelligence cockpit", () => {
  const html = read("index.html");
  const css = read("duel-table.css");
  const controller = read("src/duel-table.js");

  assert.match(html, /class="modal-header"[\s\S]*id="setupReadySummary"[\s\S]*id="setupReadyMode"/);
  assert.match(html, /class="setup-cockpit"[\s\S]*class="setup-loadout"[\s\S]*class="setup-intel"/);
  assert.match(html, /data-setup-kind="role"[\s\S]*data-setup-kind="deck"[\s\S]*data-setup-kind="ai"[\s\S]*data-setup-kind="scenario"/);
  assert.match(css, /\.modal\.setup-modal \.modal-box\s*\{[\s\S]*width: min\(1040px, 100%\)/);
  assert.match(css, /\.setup-cockpit\s*\{[\s\S]*grid-template-columns: minmax\(330px, 0\.88fr\) minmax\(0, 1\.12fr\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.setup-modal \.setup-grid,[\s\S]*\.setup-modal \.pre-duel-summary\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(controller, /function syncSetupSummary\(\)/);
  assert.match(controller, /setupReadySummary\.textContent = `\$\{role\} · \$\{deck\}`/);
  assert.match(controller, /select\.addEventListener\("change", setupChangeHandler\)/);
});
