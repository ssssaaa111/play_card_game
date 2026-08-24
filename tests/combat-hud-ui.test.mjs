import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("combat HUD keeps life tone and turn resources in dedicated status rails", () => {
  const html = read("index.html");
  const hudRenderer = read("src/hud-renderer.js");
  const css = read("styles.css");

  assert.match(html, /id="playerLifeBar"/);
  assert.match(html, /id="playerVitalStatus"/);
  assert.match(html, /id="aiVitalStatus"/);
  assert.match(hudRenderer, /export function vitalStatusItems/);
  assert.match(hudRenderer, /lifeBar\.dataset\.tone = view\.life\.tone/);
  assert.match(hudRenderer, /panel\.dataset\.lifeTone = view\.life\.tone/);
  assert.match(css, /\.life-bar\[data-tone="critical"\]/);
  assert.match(css, /\.vital-chip\.turn/);
  assert.match(css, /\.vital-chip\.shield/);
});

test("field monsters expose a compact fixed-height state rail", () => {
  const renderer = read("src/card-renderer.js");
  const stateDisplay = read("src/card-state-display.js");
  const fieldRenderer = read("src/field-renderer.js");
  const css = read("styles.css");

  assert.match(stateDisplay, /export function cardStateChips/);
  assert.match(renderer, /from '\.\/card-state-display\.js'/);
  assert.match(renderer, /class="card-state-rail"/);
  assert.match(fieldRenderer, /export function monsterFieldSlotView/);
  assert.match(fieldRenderer, /enhanced: \(card\?\.tempAtk/);
  assert.match(fieldRenderer, /weakened: \(card\?\.tempAtk/);
  assert.match(css, /\.card-state-rail\s*\{[\s\S]*height: 18px;/);
  assert.match(css, /\.card-state-chip\.ready/);
  assert.match(css, /\.field-monster-card\.attack-ready/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.field-monster-card \.stats\s*\{[\s\S]*grid-template-columns: 1fr;/);
});

test("short desktop layouts reserve enough height for both field rows", () => {
  const css = read("styles.css");

  assert.match(css, /#app\s*\{[\s\S]*grid-template-rows: auto minmax\(360px, 1fr\) clamp\(190px, 26vh, 224px\);/);
  assert.match(css, /\.field\s*\{[\s\S]*--support-track-size: clamp\(48px, 5\.4dvh, 60px\);[\s\S]*minmax\(96px, 1fr\)[\s\S]*var\(--support-track-size\)[\s\S]*30px[\s\S]*transform-style: flat;/);
  assert.match(css, /@media \(min-width: 1041px\) and \(max-height: 980px\)[\s\S]*grid-template-rows: auto minmax\(360px, 1fr\) 190px;[\s\S]*--support-track-size: 48px;/);
});

test("field support cards cannot resize their fixed spell trap rows", () => {
  const css = read("styles.css");

  assert.match(css, /\.trap-row\s*\{[\s\S]*height: 100%;[\s\S]*min-height: 0;/);
  assert.match(css, /\.trap-slot\s*\{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.trap-slot \.card\s*\{[\s\S]*height: 100%;[\s\S]*aspect-ratio: auto;[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*overflow: hidden;/);
  assert.match(css, /\.trap-slot \.card\.field-support-card\s*\{[\s\S]*max-height: 100%;[\s\S]*min-height: 0;[\s\S]*grid-template-rows: 14px minmax\(0, 1fr\);/);
  assert.match(css, /\.trap-slot \.card\.field-support-card \.card-head\s*\{[\s\S]*min-height: 14px;/);
  assert.match(css, /\.trap-slot \.card\.field-support-card \.art\s*\{[\s\S]*min-height: 0;/);
  assert.match(css, /\.trap-slot \.card\.back::after\s*\{[\s\S]*inset: 2px;/);
});

test("desktop field monsters preserve a bounded card ratio", () => {
  const css = read("styles.css");

  assert.match(css, /\.field-monster-card\s*\{[\s\S]*width: auto;[\s\S]*max-width: min\(100%, 220px\);[\s\S]*height: min\(100%, clamp\(190px, 20dvh, 320px\)\);[\s\S]*aspect-ratio: 0\.68;/);
  assert.match(css, /\.field-monster-card > \*\s*\{[\s\S]*min-width: 0;/);
  assert.match(css, /\.field-monster-card \.stats\s*\{[\s\S]*overflow: hidden;/);
});

test("defense mode rotates only the field card face while battle stats stay upright", () => {
  const fieldRenderer = read("src/field-renderer.js");
  const css = read("styles.css");

  assert.match(fieldRenderer, /faceEl\.className = "field-card-face"/);
  assert.match(fieldRenderer, /if \(child !== statsEl\) faceEl\.appendChild\(child\)/);
  assert.match(css, /\.card\.defense\s*\{[\s\S]*rotate\(90deg\)/);
  assert.match(css, /\.card\.field-monster-card\.defense\s*\{[\s\S]*transform: none;[\s\S]*background: transparent;/);
  assert.match(css, /\.field-monster-card\.defense \.field-card-face\s*\{[\s\S]*rotate\(90deg\)/);
  assert.match(css, /\.field-monster-card\.defense > \.stats\s*\{[\s\S]*z-index: 7;[\s\S]*transform: none;/);
  assert.match(css, /\.card\.field-monster-card\.defense:hover\s*\{[\s\S]*transform: translateY\(-2px\)/);
});

test("short desktop status columns keep the player life panel on screen", () => {
  const css = read("styles.css");

  assert.match(css, /@media \(min-width: 1041px\) and \(max-height: 980px\)[\s\S]*\.side\s*\{[\s\S]*align-content: start;/);
  assert.match(css, /@media \(min-width: 1041px\) and \(max-height: 980px\)[\s\S]*\.side:not\(\.enemy\)\s*\{[\s\S]*grid-template-rows: auto auto 60px minmax\(72px, 1fr\);/);
  assert.match(css, /@media \(min-width: 1041px\) and \(max-height: 980px\)[\s\S]*\.profile-stats\s*\{[\s\S]*white-space: nowrap;/);
});

test("mobile duel commands use fixed columns without label wrapping", () => {
  const css = read("styles.css");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.phase\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.phase #timerText:empty\s*\{[\s\S]*display: none;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.actions\s*\{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.btn\s*\{[\s\S]*white-space: nowrap;/);
});

test("mobile field tracks preserve both monster stats and horizontal support names", () => {
  const css = read("styles.css");

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.field\s*\{[\s\S]*--support-track-size: 52px;[\s\S]*grid-template-rows: 112px var\(--support-track-size\) 28px var\(--support-track-size\) 112px;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.field-monster-card\s*\{[\s\S]*height: 100%;[\s\S]*aspect-ratio: auto;[\s\S]*grid-template-rows: 15px minmax\(24px, 1fr\) 14px 30px;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.trap-slot \.card\.field-support-card \.card-name\s*\{[\s\S]*white-space: nowrap;/);
});

test("attack selection exposes intent and exact target comparisons", () => {
  const app = read("src/app.js");
  const fieldRenderer = read("src/field-renderer.js");
  const renderer = read("src/battle-preview-renderer.js");
  const rules = read("src/rules.js");
  const css = read("styles.css");

  assert.match(rules, /export function makeAttackIntentPreview/);
  assert.match(app, /state\.battlePreview \|\| selectedAttackPreview\(\)/);
  assert.match(app, /renderBattlePreviewElement\(document, els\.battlePreview, preview\)/);
  assert.match(app, /renderBattlePreviewElement\(document, els\.fieldBattlePreview, preview\)/);
  assert.match(renderer, /battle-preview-versus/);
  assert.match(renderer, /root\.dataset\.previewVariant/);
  assert.match(renderer, /root\.classList\.add\(\.\.\.variantClasses\)/);
  assert.match(app, /function showSelectedAttackTargetPreview\(targetIndex\)/);
  assert.match(app, /onAttackPreview: showSelectedAttackTargetPreview/);
  assert.match(fieldRenderer, /slot\.addEventListener\("pointerenter"/);
  assert.match(fieldRenderer, /slot\.addEventListener\("focus"/);
  assert.match(app, /showSelectedAttackTargetPreview\(-1\)/);
  assert.match(css, /\.battle-preview-versus\s*\{/);
  assert.match(css, /\.battle-preview-diff\.positive/);
  assert.match(css, /\.battle-preview\.intent/);
  assert.match(read("index.html"), /id="fieldBattlePreview"/);
  assert.match(read("duel-table.css"), /\.field-battle-preview\[data-preview-mode="target"\] \.battle-preview-grid/);
});

test("clicking an attack target does not replace the selected attacker details", () => {
  const app = read("src/app.js");

  assert.doesNotMatch(app, /handleAiSlot\(index\);\s*showDetail\(card\);/);
  assert.match(app, /if \(!state\.selected \|\| state\.selected\.zone !== "playerField"\) \{\s*showDetail\(card\);/);
});
