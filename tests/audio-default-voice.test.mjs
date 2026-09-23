import test from "node:test";
import assert from "node:assert/strict";
import { createAudioController } from "../src/audio.js";

test("all spoken lines use the browser default voice and timing", (t) => {
  const originalWindow = globalThis.window;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const spoken = [];
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      speak(utterance) { spoken.push(utterance); }
    }
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = originalUtterance;
  });

  const controller = createAudioController({
    getSettings: () => ({ soundOn: true, voiceOn: true, voiceReady: true })
  });
  controller.playVoice("player", "ace", "群星听令，创星神龙！", true);
  controller.playVoice("ai", "story", "日月星辰，听我号令。三曜，共降！", true);

  assert.equal(spoken.length, 2);
  for (const utterance of spoken) {
    assert.equal(utterance.lang, "zh-CN");
    assert.equal(Object.hasOwn(utterance, "voice"), false);
    assert.equal(Object.hasOwn(utterance, "rate"), false);
    assert.equal(Object.hasOwn(utterance, "pitch"), false);
    assert.equal(Object.hasOwn(utterance, "volume"), false);
  }
});
