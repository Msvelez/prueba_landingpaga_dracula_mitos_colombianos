// Todo el sonido se sintetiza en vivo con Web Audio: no hay archivos de audio.
let ctx;
let master;
let ambient = null;
let enabled = false;
let whistling = false;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function startAmbient() {
  if (ambient) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.22, now + 2.5);
  out.connect(master);

  // Dron grave en tritono
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  lp.connect(out);
  const drone = ctx.createGain();
  drone.gain.value = 0.18;
  drone.connect(lp);
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 55;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = 55 * Math.SQRT2;
  o2.detune.value = -8;
  o1.connect(drone);
  o2.connect(drone);

  // Viento
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(3);
  wind.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 500;
  bp.Q.value = 0.9;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 320;
  lfo.connect(lfoGain).connect(bp.frequency);
  const windGain = ctx.createGain();
  windGain.gain.value = 0.5;
  wind.connect(bp).connect(windGain).connect(out);

  [o1, o2, wind, lfo].forEach((n) => n.start());
  ambient = { out, nodes: [o1, o2, wind, lfo] };
}

function stopAmbient() {
  if (!ambient) return;
  const { out, nodes } = ambient;
  ambient = null;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  setTimeout(() => {
    nodes.forEach((n) => n.stop());
    out.disconnect();
  }, 1500);
}

export const isSoundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  if (on) {
    ensure();
    startAmbient();
  } else if (ctx) {
    stopAmbient();
  }
}

/** Silbido del Silbón: do, re, mi, fa, sol, la, si. */
export function whistle() {
  if (!enabled || whistling) return;
  whistling = true;
  const now = ctx.currentTime;
  const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77];
  const step = 0.32;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const vib = ctx.createOscillator();
  vib.frequency.value = 6;
  const vibGain = ctx.createGain();
  vibGain.gain.value = 7;
  vib.connect(vibGain).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(-0.8, now);
  pan.pan.linearRampToValueAtTime(0.8, now + notes.length * step);
  notes.forEach((f, i) => {
    const t = now + i * step;
    osc.frequency.setValueAtTime(f * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setTargetAtTime(0.12, t, 0.02);
    g.gain.setTargetAtTime(0.03, t + step * 0.7, 0.03);
  });
  const end = now + notes.length * step;
  g.gain.setTargetAtTime(0, end, 0.08);
  osc.connect(g).connect(pan).connect(master);
  osc.start(now);
  vib.start(now);
  osc.stop(end + 0.6);
  vib.stop(end + 0.6);
  setTimeout(() => (whistling = false), (notes.length * step + 1.2) * 1000);
}

/** Golpe de susto: ruido + caída grave. */
export function stab() {
  if (!enabled) return;
  const now = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.35, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  n.connect(hp).connect(ng).connect(master);
  n.start(now);

  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(180, now);
  o.frequency.exponentialRampToValueAtTime(40, now + 0.8);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.5, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  o.connect(og).connect(master);
  o.start(now);
  o.stop(now + 1);
}

/** Pequeño latido para interacciones de interfaz. */
export function heartbeat() {
  if (!enabled) return;
  const now = ctx.currentTime;
  [0, 0.22].forEach((d, i) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(i ? 55 : 65, now + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now + d);
    g.gain.exponentialRampToValueAtTime(0.5, now + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
    o.connect(g).connect(master);
    o.start(now + d);
    o.stop(now + d + 0.2);
  });
}
