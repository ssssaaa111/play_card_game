import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("combat HUD keeps life tone and turn resources in dedicated status rails", () => {
  const html = read("index.html");
  const app = read("src/app.js");
  const css = read("styles.css");

  assert.match(html, /id="playerLifeBar"/);
  assert.match(html, /id="playerVitalStatus"/);
  assert.match(html, /id="aiVitalStatus"/);
  assert.match(app, /function renderVitalStatus\(/);
  assert.match(app, /els\.playerLifeBar\.dataset\.tone = playerLife\.tone/);
  assert.match(app, /els\.playerPanel\.dataset\.lifeTone = playerLife\.tone/);
  assert.match(css, /\.life-bar\[data-tone="critical"\]/);
  assert.match(css, /\.vital-chip\.turn/);
  assert.match(css, /\.vital-chip\.shield/);
});

test("field monsters expose a compact fixed-height state rail", () => {
  const renderer = read("src/card-renderer.js");
  const app = read("src/app.js");
  const css = read("styles.css");

  assert.match(renderer, /export function cardStateChips/);
  assert.match(renderer, /class="card-state-rail"/);
  assert.match(app, /cardEl\.classList\.toggle\("enhanced"/);
  assert.match(app, /cardEl\.classList\.toggle\("weakened"/);
  assert.match(css, /\.card-state-rail\s*\{[\s\S]*height: 18px;/);
  assert.match(css, /\.card-state-chip\.ready/);
  assert.match(css, /\.field-monster-card\.attack-ready/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.field-monster-card \.stats\s*\{[\s\S]*grid-template-columns: 1fr;/);
});
