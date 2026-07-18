import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("mobile viewport and app shell respect display cutout safe areas", () => {
  const html = read("index.html");
  const css = read("styles.css");

  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
  assert.match(css, /--safe-area-top: env\(safe-area-inset-top, 0px\);/);
  assert.match(css, /--safe-area-right: env\(safe-area-inset-right, 0px\);/);
  assert.match(css, /--safe-area-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /--safe-area-left: env\(safe-area-inset-left, 0px\);/);
  assert.match(css, /#app\s*\{[\s\S]*max\(12px, var\(--safe-area-top\)\)[\s\S]*max\(12px, var\(--safe-area-left\)\)/);
  assert.match(css, /\.modal\s*\{[\s\S]*max\(18px, var\(--safe-area-top\)\)[\s\S]*max\(18px, var\(--safe-area-bottom\)\)/);
  assert.match(css, /\.modal-box\s*\{[\s\S]*100dvh[\s\S]*var\(--safe-area-top\)[\s\S]*var\(--safe-area-bottom\)/);
});

test("coarse pointers receive touch-sized controls and horizontal hand snapping", () => {
  const css = read("styles.css");

  assert.match(css, /@media \(max-width: 380px\)[\s\S]*\.actions \.btn,[\s\S]*font-size: 11px;/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /button,[\s\S]*\.hand \.card\s*\{[\s\S]*touch-action: manipulation;/);
  assert.match(css, /\.btn,[\s\S]*\.setup-field select\s*\{[\s\S]*min-height: 44px;/);
  assert.match(css, /\.hand\s*\{[\s\S]*scroll-snap-type: x proximity;[\s\S]*overscroll-behavior-inline: contain;/);
  assert.match(css, /\.hand \.card\s*\{[\s\S]*scroll-snap-align: center;/);
});

test("short landscape phones keep the command rail and full field in the first screen", () => {
  const css = read("styles.css");

  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 1040px\)/);
  assert.match(css, /\.topbar\s*\{[\s\S]*grid-template-columns: minmax\(122px, 0\.72fr\) minmax\(108px, 0\.58fr\) minmax\(0, 2fr\);/);
  assert.match(css, /\.actions\s*\{[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;[\s\S]*scrollbar-width: none;/);
  assert.match(css, /\.actions \.btn,[\s\S]*min-height: 44px;/);
  assert.match(css, /\.field\s*\{[\s\S]*--support-track-size: 34px;[\s\S]*grid-template-rows: 72px var\(--support-track-size\) 20px var\(--support-track-size\) 72px;/);
  assert.match(css, /\.slot,[\s\S]*\.trap-slot\s*\{[\s\S]*height: 100%;[\s\S]*min-height: 0;/);
  assert.match(css, /\.slot:has\(\.field-monster-card\)\s*\{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.field-monster-card\s*\{[\s\S]*min-height: 0;[\s\S]*aspect-ratio: auto;[\s\S]*grid-template-rows: 13px minmax\(16px, 1fr\) 12px 20px;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 360px\) and \(max-width: 1040px\)[\s\S]*grid-template-rows: 58px var\(--support-track-size\) 18px var\(--support-track-size\) 58px;/);
});
