// sound.js — the tiny "tick" of the click wheel, synthesized with the Web Audio API.

let ctx = null;
let enabled = true;
let lastTick = 0;

export function setClickSound(on) {
  enabled = !!on;
}

/** Call from a user gesture (tap / key) so browsers allow audio. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

/** One short click. kind: 'tick' (wheel) or 'press' (buttons). */
export function click(kind = 'tick') {
  const now = performance.now();
  if (now - lastTick < 18) return; // avoid a buzz when spinning very fast
  lastTick = now;

  if (navigator.vibrate) {
    try {
      navigator.vibrate(5);
    } catch {
      /* ignore */
    }
  }
  if (!enabled || !ctx || ctx.state !== 'running') return;

  const t = ctx.currentTime;
  // A burst of filtered noise sounds much more like a plastic click than a beep.
  const len = Math.floor(ctx.sampleRate * 0.012);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = kind === 'press' ? 1800 : 3200;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(kind === 'press' ? 0.5 : 0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.04);
}
