import test from "node:test";
import assert from "node:assert/strict";

import {
  clampMusicVolume,
  createMusicController,
  createMusicSettings,
  musicModeForDuel
} from "../src/music.js";

test("creates conservative music settings for normal and browser test modes", () => {
  assert.deepEqual(createMusicSettings(), { musicOn: true, musicVolume: 0.42 });
  assert.deepEqual(createMusicSettings({ testMode: true }), { musicOn: false, musicVolume: 0.42 });
});

test("clamps music volume without propagating invalid values", () => {
  assert.equal(clampMusicVolume(-1), 0);
  assert.equal(clampMusicVolume(0.63), 0.63);
  assert.equal(clampMusicVolume(8), 1);
  assert.equal(clampMusicVolume("invalid"), 0.42);
});

test("maps duel state to idle, normal, and critical music layers", () => {
  assert.equal(musicModeForDuel({ started: false, playerLp: 4000, aiLp: 4000 }), "idle");
  assert.equal(musicModeForDuel({ started: true, paused: true, playerLp: 4000, aiLp: 4000 }), "idle");
  assert.equal(musicModeForDuel({ started: true, gameOver: true, playerLp: 0, aiLp: 1200 }), "idle");
  assert.equal(musicModeForDuel({ started: true, playerLp: 4000, aiLp: 2100 }), "duel");
  assert.equal(musicModeForDuel({ started: true, playerLp: 1500, aiLp: 4000 }), "critical");
  assert.equal(musicModeForDuel({ started: true, playerLp: 2800, aiLp: 900 }), "critical");
});

test("keeps controller preferences usable when Web Audio is unavailable", () => {
  const settings = createMusicSettings({ testMode: true });
  const controller = createMusicController({
    getSettings: () => settings,
    setSettings: (patch) => Object.assign(settings, patch),
    createContext: () => null,
    setIntervalFn: null,
    clearIntervalFn: null,
    setTimeoutFn: null
  });

  assert.equal(controller.play("duel"), false);
  assert.deepEqual(controller.status(), {
    playing: false,
    requested: true,
    mode: "duel",
    musicOn: false,
    volume: 0.42,
    contextState: "unavailable",
    activeVoices: 0
  });

  assert.equal(controller.toggleMusic(), true);
  assert.equal(controller.setVolume(0.75), 0.75);
  assert.equal(settings.musicOn, true);
  assert.equal(settings.musicVolume, 0.75);
  assert.equal(controller.status().playing, false);
  controller.stop();
  assert.equal(controller.status().requested, false);
  assert.equal(controller.status().mode, "idle");
});
