import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

test("top bar exposes independent music and volume controls", () => {
  const html = read("../index.html");
  const css = read("../styles.css");
  const app = read("../src/app.js");
  const controls = read("../src/control-renderer.js");

  assert.match(html, /id="musicBtn"/);
  assert.match(html, /id="musicVolume"[^>]*type="range"[^>]*min="0"[^>]*max="100"/);
  assert.match(app, /els\.musicBtn\.addEventListener\("click", toggleMusic\)/);
  assert.match(app, /els\.musicVolume\.addEventListener\("input", changeMusicVolume\)/);
  assert.match(app, /musicPlaying: musicStatus\(\)\.playing/);
  assert.match(controls, /elements\.musicVolume\.disabled = view\.music\.volumeDisabled/);
  assert.match(controls, /elements\.musicBtn\.dataset\.playing = String\(view\.music\.playing\)/);
  assert.match(controls, /elements\.musicBtn\.setAttribute\("aria-pressed", String\(view\.music\.pressed\)\)/);
  assert.match(css, /\.music-volume-control\s*\{/);
  assert.match(css, /\.btn\.music-critical\s*\{/);
});

test("duel lifecycle coordinates music without owning synthesis", () => {
  const app = read("../src/app.js");

  assert.match(app, /playMusic\(currentMusicMode\(\)\)/);
  assert.match(app, /pauseMusic\(\{ fadeMs: 180 \}\)/);
  assert.match(app, /stopMusic\(\{ fadeMs: 900 \}\)/);
  assert.match(app, /musicModeForDuel\(\{/);
  assert.match(app, /onVoiceActivity: setMusicVoiceActive/);
  assert.doesNotMatch(app, /createOscillator\(/);
  assert.doesNotMatch(app, /createGain\(/);
});
