const MUSIC_MODES = new Set(["idle", "duel", "critical"]);
const STEP_PATTERN = Object.freeze([0, 2, 4, 7, 4, 2, 9, 7, 0, 4, 7, 11, 9, 7, 4, 2]);
const ROOT_FREQUENCY = 110;

export function clampMusicVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.42;
  return Math.min(1, Math.max(0, number));
}

export function createMusicSettings({ testMode = false } = {}) {
  return {
    musicOn: !testMode,
    musicVolume: 0.42
  };
}

export function musicModeForDuel({ started, paused, gameOver, playerLp, aiLp }, criticalLp = 1500) {
  if (!started || paused || gameOver) return "idle";
  return Math.min(Number(playerLp) || 0, Number(aiLp) || 0) <= criticalLp ? "critical" : "duel";
}

function defaultContextFactory() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  return AudioContext ? new AudioContext() : null;
}

function frequencyForStep(step) {
  return ROOT_FREQUENCY * (2 ** (step / 12));
}

export function createMusicController({
  getSettings,
  setSettings,
  createContext = defaultContextFactory,
  setIntervalFn = globalThis.setInterval?.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis)
} = {}) {
  const audio = {
    ctx: null,
    master: null,
    duck: null,
    baseBus: null,
    tensionBus: null,
    noiseBuffer: null
  };
  const activeVoices = new Set();
  let timer = null;
  let requested = false;
  let playing = false;
  let mode = "idle";
  let stepIndex = 0;
  let nextStepTime = 0;

  function readSettings() {
    const settings = getSettings?.() || {};
    return {
      musicOn: settings.musicOn !== false,
      musicVolume: clampMusicVolume(settings.musicVolume)
    };
  }

  function writeSettings(patch) {
    if (setSettings) {
      setSettings(patch);
      return;
    }
    const settings = getSettings?.();
    if (settings) Object.assign(settings, patch);
  }

  function targetMasterGain() {
    return readSettings().musicVolume * 0.24;
  }

  function rampGain(node, value, duration = 0.18) {
    const ctx = audio.ctx;
    if (!ctx || !node) return;
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), now + duration);
  }

  function buildNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x51a7d00d;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = ((seed / 0xffffffff) * 2 - 1) * (1 - index / data.length);
    }
    return buffer;
  }

  function ensureAudio() {
    if (audio.ctx) {
      if (audio.ctx.state === "suspended") audio.ctx.resume?.();
      return audio.ctx;
    }
    const ctx = createContext?.();
    if (!ctx) return null;
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.duck = ctx.createGain();
    audio.baseBus = ctx.createGain();
    audio.tensionBus = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 16;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.26;
    audio.master.gain.value = 0.0001;
    audio.duck.gain.value = 1;
    audio.baseBus.gain.value = 1;
    audio.tensionBus.gain.value = 0.0001;
    audio.baseBus.connect(audio.duck);
    audio.tensionBus.connect(audio.duck);
    audio.duck.connect(audio.master);
    audio.master.connect(compressor);
    compressor.connect(ctx.destination);
    audio.noiseBuffer = buildNoiseBuffer(ctx);
    return ctx;
  }

  function trackVoice(source) {
    activeVoices.add(source);
    source.addEventListener?.("ended", () => activeVoices.delete(source), { once: true });
    source.onended = () => activeVoices.delete(source);
  }

  function scheduleTone({ frequency, time, duration, gain, type = "triangle", bus = audio.baseBus, cutoff = 1200 }) {
    const ctx = audio.ctx;
    if (!ctx || !bus) return;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, time);
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gain, time + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
    trackVoice(oscillator);
  }

  function scheduleDrum(time, gain = 0.22, bus = audio.baseBus) {
    const ctx = audio.ctx;
    if (!ctx || !bus) return;
    const oscillator = ctx.createOscillator();
    const body = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(96, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.2);
    body.gain.setValueAtTime(gain, time);
    body.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    oscillator.connect(body);
    body.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + 0.3);
    trackVoice(oscillator);

    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const impact = ctx.createGain();
    noise.buffer = audio.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.value = 520;
    impact.gain.setValueAtTime(gain * 0.32, time);
    impact.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    noise.connect(filter);
    filter.connect(impact);
    impact.connect(bus);
    noise.start(time);
    noise.stop(time + 0.14);
    trackVoice(noise);
  }

  function scheduleMetal(time, gain = 0.026) {
    scheduleTone({ frequency: 1460, time, duration: 0.12, gain, type: "sine", cutoff: 3200 });
    scheduleTone({ frequency: 2190, time: time + 0.008, duration: 0.09, gain: gain * 0.58, type: "sine", cutoff: 3600 });
  }

  function scheduleStep(step, time) {
    const patternStep = step % STEP_PATTERN.length;
    const pitch = STEP_PATTERN[patternStep];
    if (patternStep % 4 === 0) scheduleDrum(time, patternStep === 0 ? 0.24 : 0.18);
    if ([2, 6, 10, 14].includes(patternStep)) scheduleMetal(time, 0.018);
    if (patternStep % 2 === 0) {
      scheduleTone({
        frequency: frequencyForStep(pitch + 12),
        time: time + 0.025,
        duration: 0.36,
        gain: patternStep % 4 === 0 ? 0.052 : 0.036,
        type: "triangle",
        cutoff: 1480
      });
    }
    if (patternStep === 0 || patternStep === 8) {
      const root = patternStep === 0 ? ROOT_FREQUENCY / 2 : frequencyForStep(2) / 2;
      scheduleTone({ frequency: root, time, duration: 2.75, gain: 0.058, type: "sawtooth", cutoff: 260 });
      scheduleTone({ frequency: root * 1.5, time: time + 0.03, duration: 2.65, gain: 0.032, type: "triangle", cutoff: 420 });
    }
    if (mode === "critical") {
      if (patternStep % 2 === 1) scheduleDrum(time + 0.015, 0.075, audio.tensionBus);
      if ([3, 7, 11, 15].includes(patternStep)) {
        scheduleTone({
          frequency: frequencyForStep(pitch + 19),
          time,
          duration: 0.22,
          gain: 0.032,
          type: "square",
          bus: audio.tensionBus,
          cutoff: 1800
        });
      }
    }
  }

  function scheduleAhead() {
    const ctx = audio.ctx;
    if (!ctx || !playing) return;
    const stepDuration = 60 / 82 / 2;
    while (nextStepTime < ctx.currentTime + 0.45) {
      scheduleStep(stepIndex, nextStepTime);
      stepIndex = (stepIndex + 1) % STEP_PATTERN.length;
      nextStepTime += stepDuration;
    }
  }

  function clearScheduler() {
    if (timer !== null && clearIntervalFn) clearIntervalFn(timer);
    timer = null;
  }

  function stopVoices(delayMs = 0) {
    const voices = Array.from(activeVoices);
    const stop = () => {
      for (const source of voices) {
        try {
          source.stop?.();
        } catch (error) {
          // Scheduled sources may already have ended.
        }
        activeVoices.delete(source);
      }
    };
    if (delayMs > 0 && setTimeoutFn) setTimeoutFn(stop, delayMs);
    else stop();
  }

  function setMode(nextMode) {
    mode = MUSIC_MODES.has(nextMode) ? nextMode : "duel";
    if (!audio.tensionBus) return mode;
    rampGain(audio.tensionBus, mode === "critical" ? 0.78 : 0.0001, 0.55);
    return mode;
  }

  function play(nextMode = mode === "idle" ? "duel" : mode) {
    requested = true;
    setMode(nextMode);
    if (!readSettings().musicOn) return false;
    const ctx = ensureAudio();
    if (!ctx) return false;
    if (playing) {
      rampGain(audio.master, targetMasterGain());
      return true;
    }
    playing = true;
    stepIndex = 0;
    nextStepTime = ctx.currentTime + 0.06;
    rampGain(audio.master, targetMasterGain(), 0.7);
    scheduleAhead();
    if (setIntervalFn) timer = setIntervalFn(scheduleAhead, 90);
    return true;
  }

  function pause({ fadeMs = 320 } = {}) {
    playing = false;
    clearScheduler();
    rampGain(audio.master, 0.0001, fadeMs / 1000);
    stopVoices(fadeMs + 80);
    return true;
  }

  function stop(options = {}) {
    requested = false;
    setMode("idle");
    return pause(options);
  }

  function setMusicOn(musicOn) {
    const enabled = Boolean(musicOn);
    writeSettings({ musicOn: enabled });
    if (!enabled) pause({ fadeMs: 180 });
    else if (requested) play(mode === "idle" ? "duel" : mode);
    return enabled;
  }

  function toggleMusic() {
    return setMusicOn(!readSettings().musicOn);
  }

  function setVolume(value) {
    const musicVolume = clampMusicVolume(value);
    writeSettings({ musicVolume });
    if (playing) rampGain(audio.master, targetMasterGain(), 0.08);
    return musicVolume;
  }

  function setVoiceActive(active) {
    if (!audio.duck) return Boolean(active);
    rampGain(audio.duck, active ? 0.34 : 1, active ? 0.08 : 0.34);
    return Boolean(active);
  }

  function unlock() {
    const ctx = ensureAudio();
    ctx?.resume?.();
    return Boolean(ctx);
  }

  function status() {
    const settings = readSettings();
    return Object.freeze({
      playing,
      requested,
      mode,
      musicOn: settings.musicOn,
      volume: settings.musicVolume,
      contextState: audio.ctx?.state || "unavailable",
      activeVoices: activeVoices.size
    });
  }

  return {
    pause,
    play,
    setMode,
    setMusicOn,
    setVoiceActive,
    setVolume,
    status,
    stop,
    toggleMusic,
    unlock
  };
}
