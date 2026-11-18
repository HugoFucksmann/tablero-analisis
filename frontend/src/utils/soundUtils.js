/**
 * soundUtils.js
 * Sonidos de ajedrez sintetizados con Web Audio API: sin archivos ni red.
 * La preferencia on/off se guarda en localStorage.
 */

const STORAGE_KEY = 'chess-sound-enabled';

let ctx = null;
let noiseBuffer = null;
let enabled = readPreference();

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export const isSoundEnabled = () => enabled;

export const setSoundEnabled = (value) => {
  enabled = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* almacenamiento no disponible: la preferencia vale solo para esta sesión */
  }
};

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function getNoise(audioCtx) {
  if (!noiseBuffer) {
    const length = Math.floor(audioCtx.sampleRate * 0.1);
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Tono con caída exponencial de volumen. */
function tone(audioCtx, { type = 'sine', from, to = from, start = 0, duration, gain = 0.2 }) {
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Golpe de madera: ráfaga corta de ruido filtrado. */
function knock(audioCtx, { frequency, gain, duration = 0.06 }) {
  const t0 = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const amp = audioCtx.createGain();
  src.buffer = getNoise(audioCtx);
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(amp).connect(audioCtx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

const SOUNDS = {
  move: (c) => {
    knock(c, { frequency: 900, gain: 0.8 });
    tone(c, { type: 'triangle', from: 180, to: 90, duration: 0.07, gain: 0.25 });
  },
  capture: (c) => {
    knock(c, { frequency: 1400, gain: 1.2, duration: 0.09 });
    tone(c, { type: 'triangle', from: 220, to: 70, duration: 0.1, gain: 0.35 });
  },
  check: (c) => {
    tone(c, { type: 'sine', from: 660, duration: 0.12, gain: 0.2 });
    tone(c, { type: 'sine', from: 880, start: 0.1, duration: 0.18, gain: 0.2 });
  },
  notify: (c) => {
    tone(c, { type: 'sine', from: 523, duration: 0.12, gain: 0.18 });
    tone(c, { type: 'sine', from: 784, start: 0.1, duration: 0.2, gain: 0.18 });
  },
  illegal: (c) => {
    tone(c, { type: 'square', from: 140, to: 100, duration: 0.15, gain: 0.08 });
  },
};

export const playChessSound = (type) => {
  if (!enabled) return;
  const play = SOUNDS[type];
  if (!play) return;
  try {
    const audioCtx = getContext();
    if (audioCtx) play(audioCtx);
  } catch (err) {
    console.error('Error playing sound:', err);
  }
};
