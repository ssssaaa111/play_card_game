export function createAudioController({ getState, announce }) {
  const audio = {
    ctx: null,
    master: null,
    voiceMaster: null
  };

  const voiceFiles = {
    player: {
      start: "assets/voice/player-start.wav",
      turn: "assets/voice/player-turn.wav",
      draw: "assets/voice/player-draw.wav",
      summon: "assets/voice/player-summon.wav",
      ace: "assets/voice/player-ace.wav",
      spell: "assets/voice/player-spell.wav",
      trap: "assets/voice/player-trap.wav",
      attack: "assets/voice/player-attack.wav",
      direct: "assets/voice/player-direct.wav",
      hit: "assets/voice/player-hit.wav",
      break: "assets/voice/player-break.wav",
      combo: "assets/voice/player-combo.wav",
      shield: "assets/voice/player-shield.wav",
      win: "assets/voice/player-win.wav",
      lose: "assets/voice/player-lose.wav"
    },
    ai: {
      turn: "assets/voice/ai-turn.wav",
      draw: "assets/voice/ai-draw.wav",
      summon: "assets/voice/ai-summon.wav",
      ace: "assets/voice/ai-ace.wav",
      spell: "assets/voice/ai-spell.wav",
      trap: "assets/voice/ai-trap.wav",
      attack: "assets/voice/ai-attack.wav",
      direct: "assets/voice/ai-direct.wav",
      hit: "assets/voice/ai-hit.wav",
      break: "assets/voice/ai-break.wav",
      combo: "assets/voice/ai-combo.wav",
      shield: "assets/voice/ai-shield.wav",
      win: "assets/voice/ai-win.wav",
      lose: "assets/voice/ai-lose.wav"
    },
    common: {
      clash: "assets/voice/common-clash.wav",
      damage: "assets/voice/common-damage.wav",
      heal: "assets/voice/common-heal.wav"
    }
  };

  let cachedVoices = [];
  let activeVoiceAudio = [];
  let voiceQueue = [];
  let voicePlaying = false;
  let finishActiveVoice = null;
  let voiceToken = 0;
  let activeVoicePriority = 0;
  let activeVoiceKey = "";
  const voiceBufferCache = new Map();

  if ("speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices();
    };
  }

  function ensureAudio(force = false) {
    if (!getState().soundOn && !force) return null;
    if (!audio.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audio.ctx = new AudioContext();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.22;
      audio.master.connect(audio.ctx.destination);
      audio.voiceMaster = audio.ctx.createGain();
      audio.voiceMaster.gain.value = 0.92;
      audio.voiceMaster.connect(audio.ctx.destination);
    } else if (!audio.voiceMaster) {
      audio.voiceMaster = audio.ctx.createGain();
      audio.voiceMaster.gain.value = 0.92;
      audio.voiceMaster.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }
    return audio.ctx;
  }

  function tone(freq, start, duration, type = "sine", gain = 0.18, endGain = 0.001) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    vol.gain.setValueAtTime(0.001, ctx.currentTime + start);
    vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.018);
    vol.gain.exponentialRampToValueAtTime(endGain, ctx.currentTime + start + duration);
    osc.connect(vol);
    vol.connect(audio.master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.04);
  }

  function sweep(fromFreq, toFreq, start, duration, type = "sawtooth", gain = 0.12) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, ctx.currentTime + start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), ctx.currentTime + start + duration);
    vol.gain.setValueAtTime(0.001, ctx.currentTime + start);
    vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.018);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    osc.connect(vol);
    vol.connect(audio.master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.05);
  }

  function chord(freqs, start, duration, type = "triangle", gain = 0.07) {
    freqs.forEach((freq, index) => tone(freq, start + index * 0.018, duration, type, gain));
  }

  function noise(start, duration, gain = 0.14, filterFreq = 1200) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const vol = ctx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;
    vol.gain.setValueAtTime(gain, ctx.currentTime + start);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    source.connect(filter);
    filter.connect(vol);
    vol.connect(audio.master);
    source.start(ctx.currentTime + start);
  }

  function noiseSweep(start, duration, fromFreq, toFreq, gain = 0.12, type = "bandpass") {
    const ctx = ensureAudio();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const fade = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const vol = ctx.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.setValueAtTime(fromFreq, ctx.currentTime + start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), ctx.currentTime + start + duration);
    filter.Q.value = 1.25;
    vol.gain.setValueAtTime(gain, ctx.currentTime + start);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    source.connect(filter);
    filter.connect(vol);
    vol.connect(audio.master);
    source.start(ctx.currentTime + start);
  }

  function playSound(name) {
    if (!getState().soundOn) return;
    if (name === "draw") {
      noiseSweep(0, 0.18, 2800, 720, 0.09, "bandpass");
      sweep(360, 1200, 0.02, 0.16, "triangle", 0.07);
      chord([740, 932, 1175], 0.13, 0.22, "sine", 0.045);
      noise(0.22, 0.09, 0.035, 3200);
    }
    if (name === "summon") {
      tone(180, 0, 0.18, "sawtooth", 0.11);
      tone(360, 0.08, 0.18, "triangle", 0.12);
      tone(720, 0.16, 0.22, "sine", 0.1);
    }
    if (name === "ace") {
      noise(0, 0.18, 0.12, 1800);
      tone(196, 0, 0.18, "sawtooth", 0.1);
      tone(392, 0.1, 0.22, "triangle", 0.1);
      tone(784, 0.22, 0.28, "sine", 0.09);
      tone(1175, 0.34, 0.34, "triangle", 0.07);
    }
    if (name === "spell") {
      tone(520, 0, 0.12, "sine", 0.1);
      tone(780, 0.05, 0.14, "triangle", 0.11);
      tone(1040, 0.11, 0.18, "sine", 0.08);
    }
    if (name === "spell-burn500") {
      noise(0, 0.16, 0.13, 520);
      tone(180, 0, 0.16, "sawtooth", 0.1);
      tone(92, 0.08, 0.18, "square", 0.08);
    }
    if (name === "spell-heal700") {
      tone(523, 0, 0.13, "sine", 0.08);
      tone(659, 0.08, 0.16, "triangle", 0.09);
      tone(880, 0.18, 0.22, "sine", 0.07);
    }
    if (name === "spell-buff500") {
      tone(247, 0, 0.1, "square", 0.08);
      tone(494, 0.07, 0.14, "sawtooth", 0.08);
      tone(988, 0.14, 0.2, "triangle", 0.06);
    }
    if (name === "spell-draw2") {
      noise(0, 0.07, 0.07, 2100);
      tone(740, 0.03, 0.08, "triangle", 0.07);
      noise(0.1, 0.07, 0.06, 2500);
      tone(930, 0.13, 0.1, "triangle", 0.07);
    }
    if (name === "spell-elementEcho") {
      chord([392, 523, 659, 784], 0, 0.24, "triangle", 0.06);
      sweep(520, 1320, 0.08, 0.24, "sine", 0.055);
      noiseSweep(0.02, 0.18, 2600, 900, 0.045, "bandpass");
    }
    if (name === "spell-extraSummon") {
      chord([330, 494, 660], 0, 0.2, "square", 0.05);
      sweep(260, 880, 0.04, 0.2, "triangle", 0.055);
    }
    if (name === "spell-rallyAttack") {
      noiseSweep(0, 0.18, 1200, 2400, 0.08, "bandpass");
      chord([247, 494, 988], 0.04, 0.22, "sawtooth", 0.045);
    }
    if (name === "spell-pierceLine") {
      noiseSweep(0, 0.22, 3600, 420, 0.12, "bandpass");
      sweep(1200, 180, 0.02, 0.2, "sawtooth", 0.08);
      tone(220, 0.1, 0.18, "square", 0.07);
    }
    if (name === "spell-graveReturn") {
      chord([392, 494, 587], 0, 0.2, "triangle", 0.055);
      noiseSweep(0.05, 0.2, 680, 2200, 0.055, "bandpass");
      sweep(330, 880, 0.1, 0.22, "sine", 0.05);
    }
    if (name === "spell-battleTrance") {
      noiseSweep(0, 0.25, 220, 2600, 0.1, "bandpass");
      chord([196, 392, 784], 0.03, 0.26, "sawtooth", 0.05);
      tone(98, 0.18, 0.24, "square", 0.08);
    }
    if (name === "spell-directStrike") {
      noiseSweep(0, 0.24, 3200, 620, 0.12, "bandpass");
      sweep(420, 1480, 0.02, 0.24, "triangle", 0.075);
      chord([330, 660, 990], 0.08, 0.26, "sawtooth", 0.052);
      tone(82, 0.22, 0.22, "sine", 0.08);
    }
    if (name === "spell-fireWindCombo") {
      noiseSweep(0, 0.26, 420, 3600, 0.12, "bandpass");
      chord([220, 440, 660, 880], 0.04, 0.26, "sawtooth", 0.052);
      sweep(1320, 180, 0.14, 0.28, "triangle", 0.07);
    }
    if (name === "spell-lightShadowCombo") {
      chord([294, 392, 587, 784], 0, 0.28, "triangle", 0.055);
      noiseSweep(0.04, 0.28, 2400, 560, 0.08, "bandpass");
      sweep(220, 1100, 0.12, 0.28, "sine", 0.06);
    }
    if (name === "spell-shield800") {
      playSound("guard");
    }
    if (name === "attack") {
      noiseSweep(0, 0.2, 180, 2400, 0.1, "bandpass");
      sweep(96, 520, 0, 0.18, "sawtooth", 0.09);
      sweep(1200, 320, 0.1, 0.2, "triangle", 0.06);
      tone(64, 0.15, 0.18, "sine", 0.08);
    }
    if (name === "attack-charge") {
      noiseSweep(0, 0.42, 140, 3600, 0.12, "bandpass");
      sweep(72, 740, 0.02, 0.48, "sawtooth", 0.11);
      chord([196, 294, 392], 0.12, 0.36, "triangle", 0.055);
      tone(48, 0.36, 0.2, "sine", 0.12);
    }
    if (name === "attack-impact") {
      noiseSweep(0, 0.42, 5200, 120, 0.22, "bandpass");
      noiseSweep(0.03, 0.5, 160, 60, 0.2, "lowpass");
      tone(42, 0, 0.48, "sine", 0.17);
      tone(84, 0.06, 0.3, "square", 0.09);
      chord([220, 165, 110], 0.16, 0.26, "sawtooth", 0.06);
    }
    if (name === "attack-direct") {
      noiseSweep(0, 0.34, 4200, 420, 0.18, "bandpass");
      sweep(880, 64, 0.02, 0.36, "sawtooth", 0.15);
      tone(46, 0.04, 0.4, "sine", 0.15);
      tone(156, 0.12, 0.22, "square", 0.08);
    }
    if (name === "attack-break") {
      noiseSweep(0, 0.44, 3600, 160, 0.22, "bandpass");
      noiseSweep(0.08, 0.45, 220, 72, 0.18, "lowpass");
      tone(44, 0, 0.48, "sine", 0.16);
      tone(110, 0.03, 0.26, "square", 0.1);
      chord([330, 247, 196], 0.16, 0.24, "sawtooth", 0.06);
    }
    if (name === "attack-clash") {
      noiseSweep(0, 0.48, 2400, 260, 0.22, "bandpass");
      tone(70, 0, 0.3, "sawtooth", 0.13);
      tone(140, 0.08, 0.22, "square", 0.1);
      tone(70, 0.18, 0.28, "sawtooth", 0.11);
      chord([392, 277, 196], 0.2, 0.24, "sawtooth", 0.052);
    }
    if (name === "damage") {
      noiseSweep(0, 0.2, 520, 140, 0.13, "lowpass");
      tone(130, 0, 0.18, "sawtooth", 0.1);
      sweep(300, 80, 0.05, 0.2, "square", 0.06);
    }
    if (name === "guard") {
      noiseSweep(0, 0.16, 4200, 1200, 0.08, "bandpass");
      chord([523, 659, 784, 1046], 0.02, 0.22, "triangle", 0.055);
      sweep(1800, 620, 0.04, 0.22, "sine", 0.06);
      tone(92, 0.08, 0.18, "sine", 0.06);
    }
    if (name === "turn") {
      tone(330, 0, 0.08, "triangle", 0.08);
      tone(495, 0.08, 0.1, "triangle", 0.08);
    }
    if (name === "win") {
      [392, 523, 659, 784].forEach((freq, index) => tone(freq, index * 0.09, 0.22, "triangle", 0.09));
    }
    if (name === "lose") {
      [330, 247, 196, 147].forEach((freq, index) => tone(freq, index * 0.1, 0.24, "sawtooth", 0.08));
    }
    if (name === "click") {
      tone(440, 0, 0.045, "triangle", 0.05);
    }
    if (name === "trap") {
      noise(0, 0.12, 0.12, 1500);
      tone(920, 0.03, 0.11, "square", 0.07);
      tone(460, 0.11, 0.18, "sawtooth", 0.08);
    }
    if (name === "trap-attackDestroy") {
      tone(1040, 0, 0.08, "square", 0.08);
      noise(0.05, 0.18, 0.16, 980);
      tone(130, 0.13, 0.18, "sawtooth", 0.09);
    }
    if (name === "trap-directShield") {
      tone(392, 0, 0.11, "triangle", 0.08);
      tone(523, 0.09, 0.18, "sine", 0.09);
      noise(0.04, 0.2, 0.05, 2300);
    }
    if (name === "trap-attackShift") {
      playSound("guard");
      noiseSweep(0.02, 0.2, 2600, 760, 0.08, "bandpass");
      sweep(420, 1120, 0.04, 0.22, "triangle", 0.055);
    }
    if (name === "trap-attackNegate") {
      tone(880, 0, 0.09, "square", 0.075);
      tone(440, 0.07, 0.14, "triangle", 0.065);
      noiseSweep(0.04, 0.22, 3200, 260, 0.1, "bandpass");
      chord([330, 494, 659], 0.14, 0.2, "sine", 0.045);
    }
    if (name === "trap-redirectAttack") {
      tone(740, 0, 0.08, "triangle", 0.07);
      sweep(1280, 360, 0.04, 0.24, "sine", 0.06);
      noiseSweep(0.08, 0.22, 2100, 540, 0.08, "bandpass");
      tone(220, 0.18, 0.16, "square", 0.055);
    }
    if (name === "trap-summonBurn") {
      noise(0, 0.16, 0.15, 620);
      tone(156, 0.04, 0.18, "sawtooth", 0.09);
      tone(312, 0.13, 0.14, "square", 0.06);
    }
    if (name === "trap-weakenAttack") {
      noiseSweep(0, 0.22, 3000, 240, 0.12, "bandpass");
      tone(156, 0.04, 0.18, "square", 0.08);
      sweep(620, 180, 0.09, 0.2, "sawtooth", 0.06);
    }
    if (name === "trap-directRebound") {
      playSound("guard");
      noiseSweep(0.08, 0.24, 180, 3600, 0.1, "bandpass");
      chord([330, 660, 990], 0.14, 0.22, "square", 0.045);
    }
  }

  function preferredVoice(owner = "player") {
    const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
    const zhVoices = voices.filter((voice) => /zh|Chinese|Mandarin|普通话|中文/i.test(`${voice.lang} ${voice.name}`));
    const preferred = owner === "ai"
      ? [/Yunxi|Kangkang|male|男|Microsoft.*Chinese/i, /zh-CN/i]
      : [/Xiaoxiao|Huihui|female|女|Microsoft.*Chinese/i, /zh-CN/i];
    return preferred
      .map((pattern) => zhVoices.find((voice) => pattern.test(`${voice.name} ${voice.lang}`)))
      .find(Boolean) || zhVoices[0] || voices[0] || null;
  }

  function stopVoiceAudio() {
    voiceToken += 1;
    voiceQueue = [];
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    activeVoiceAudio.forEach((item) => {
      try {
        item.stop?.();
      } catch (error) {
        // Already stopped.
      }
    });
    activeVoiceAudio = [];
    voicePlaying = false;
    activeVoicePriority = 0;
    activeVoiceKey = "";
    if (finishActiveVoice) {
      finishActiveVoice();
      finishActiveVoice = null;
    }
  }

  function playVoice(owner, key, fallback = "", force = false) {
    return speak(fallback, force, owner);
  }

  function voicePriority(key) {
    return {
      win: 10,
      lose: 10,
      ace: 9,
      combo: 8,
      direct: 8,
      break: 7,
      attack: 6,
      trap: 6,
      spell: 5,
      summon: 5,
      turn: 4,
      shield: 4,
      hit: 3,
      draw: 2,
      start: 2
    }[key] || 1;
  }

  function enqueueVoice(job) {
    if (job.priority <= 2 && (voicePlaying || voiceQueue.length > 0)) {
      return false;
    }
    if (voicePlaying) {
      const shouldInterrupt = job.force || job.priority >= 8 || (job.priority >= 6 && activeVoicePriority <= 6);
      if (shouldInterrupt) {
        stopVoiceAudio();
      } else if (job.priority <= 4 || activeVoicePriority >= job.priority) {
        return false;
      }
    }
    voiceQueue = voiceQueue.filter((item) => item.priority >= 5);
    voiceQueue.push(job);
    if (voiceQueue.length > 2) {
      voiceQueue.sort((a, b) => b.priority - a.priority);
      voiceQueue = voiceQueue.slice(0, 2);
    }
    processVoiceQueue();
    return true;
  }

  async function processVoiceQueue() {
    if (voicePlaying || voiceQueue.length === 0) return;
    const job = voiceQueue.shift();
    voicePlaying = true;
    activeVoicePriority = job.priority;
    activeVoiceKey = job.key;
    const runToken = voiceToken;
    try {
      await playProcessedVoice(job);
    } catch (error) {
      await delay(120);
    } finally {
      if (runToken === voiceToken) {
        voicePlaying = false;
        activeVoicePriority = 0;
        activeVoiceKey = "";
        finishActiveVoice = null;
        window.setTimeout(processVoiceQueue, 60);
      }
    }
  }

  async function loadVoiceBuffer(src) {
    const ctx = ensureAudio(true);
    if (!ctx) throw new Error("AudioContext unavailable");
    if (voiceBufferCache.has(src)) return voiceBufferCache.get(src);
    const response = await fetch(src);
    if (!response.ok) throw new Error("Voice file missing");
    const data = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    voiceBufferCache.set(src, buffer);
    return buffer;
  }

  async function playProcessedVoice(job) {
    const ctx = ensureAudio(true);
    const buffer = await loadVoiceBuffer(job.src);
    const token = voiceToken;
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        activeVoiceAudio = [];
        resolve();
      };
      const source = ctx.createBufferSource();
      const highpass = ctx.createBiquadFilter();
      const presence = ctx.createBiquadFilter();
      const compressor = ctx.createDynamicsCompressor();
      const shaper = ctx.createWaveShaper();
      const dry = ctx.createGain();
      const delay = ctx.createDelay(0.6);
      const feedback = ctx.createGain();
      const wet = ctx.createGain();
      const lowBoom = ctx.createOscillator();
      const boomGain = ctx.createGain();

      source.buffer = buffer;
      source.playbackRate.value = job.owner === "ai" ? 1.04 : job.owner === "common" ? 1.08 : 1.12;
      source.detune.value = job.owner === "ai" ? -320 : job.owner === "common" ? -60 : 45;

      highpass.type = "highpass";
      highpass.frequency.value = 78;
      presence.type = "peaking";
      presence.frequency.value = job.owner === "ai" ? 1750 : 2300;
      presence.Q.value = 0.9;
      presence.gain.value = job.owner === "ai" ? 3.4 : 2.4;
      compressor.threshold.value = -28;
      compressor.knee.value = 18;
      compressor.ratio.value = 5.5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      shaper.curve = distortionCurve(job.owner === "ai" ? 42 : 24);
      shaper.oversample = "4x";
      dry.gain.value = job.owner === "ai" ? 0.9 : 0.82;
      delay.delayTime.value = job.owner === "ai" ? 0.16 : 0.12;
      feedback.gain.value = job.priority >= 8 ? 0.28 : 0.18;
      wet.gain.value = job.priority >= 8 ? 0.2 : 0.12;

      source.connect(highpass);
      highpass.connect(presence);
      presence.connect(compressor);
      compressor.connect(shaper);
      shaper.connect(dry);
      dry.connect(audio.voiceMaster);
      shaper.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(audio.voiceMaster);

      if (job.priority >= 6) {
        lowBoom.type = "sine";
        lowBoom.frequency.value = job.owner === "ai" ? 48 : 64;
        boomGain.gain.setValueAtTime(0.001, ctx.currentTime);
        boomGain.gain.exponentialRampToValueAtTime(job.priority >= 8 ? 0.11 : 0.07, ctx.currentTime + 0.025);
        boomGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
        lowBoom.connect(boomGain);
        boomGain.connect(audio.voiceMaster);
        lowBoom.start();
        lowBoom.stop(ctx.currentTime + 0.46);
      }

      activeVoiceAudio = [{ stop: () => source.stop() }, { stop: () => lowBoom.stop() }];
      finishActiveVoice = finish;
      source.onended = () => {
        window.setTimeout(finish, job.priority >= 8 ? 220 : 120);
      };
      source.start();
      const maxMs = job.priority >= 8 ? 2100 : job.priority >= 5 ? 1700 : 1150;
      window.setTimeout(() => {
        if (!finished && token === voiceToken) {
          try {
            source.stop();
          } catch (error) {
            finish();
          }
        }
      }, maxMs);
      window.setTimeout(() => {
        if (token === voiceToken) finish();
      }, Math.min(maxMs + 260, Math.max(900, (buffer.duration / source.playbackRate.value) * 1000 + 220)));
    });
  }

  function distortionCurve(amount = 20) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function speak(text, force = false, owner = "player") {
    if (!text) return false;
    if (!getState().soundOn) return false;
    if (!getState().voiceOn) return false;
    if (!getState().voiceReady && !force) return false;
    if (!("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.voice = preferredVoice(owner);
    utterance.rate = owner === "ai" ? 0.96 : 1.02;
    utterance.pitch = owner === "ai" ? 0.88 : 1.05;
    utterance.volume = 0.96;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function cue(text) {
    announce(text);
    speak(text);
  }


  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  return {
    ensureAudio,
    playSound,
    playVoice,
    stopVoiceAudio,
    speak,
    cue
  };
}
