// Small animation helpers shared by the games. Screens re-render on every update, so animations
// must be triggered only when something actually changed, not on every render.

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// True the first time `value` is seen for `name` on this element, so an animation plays once.
export function fresh(el, name, value) {
  const m = (el._fx ??= {});
  if (m[name] === value) return false;
  m[name] = value;
  return true;
}

// Returns the previous value stored for `name` and remembers the new one (for diffing).
export function memo(el, name, value) {
  const m = (el._fx ??= {});
  const prev = m[name];
  m[name] = value;
  return prev;
}

export function confetti() {
  if (reduceMotion()) return;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
  c.width = innerWidth;
  c.height = innerHeight;
  document.body.append(c);
  const ctx = c.getContext('2d');
  const colors = ['#6c4cf5', '#f08c00', '#2f9e44', '#e03131', '#1971c2', '#f06595'];
  const bits = Array.from({ length: 140 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.3, y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 6 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const tick = now => {
    const t = now - t0;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of bits) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.col;
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(tick); else c.remove();
  };
  tick(t0);
}

/* ---------- sound ---------- */
// Tiny synthesized sound effects (no audio files). Mute state is remembered on this device.

let audio = null;
let muted = (() => { try { return localStorage.getItem('hubMuted') === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem('hubMuted', value ? '1' : '0'); } catch { /* ignore */ }
}

// Browsers only allow audio after a tap, so call this from the first click.
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio support */ }
}

function tone(freq, dur, { type = 'sine', gain = 0.12, delay = 0, to = null } = {}) {
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  pop: () => tone(420, 0.12, { to: 760, type: 'triangle' }),
  tick: () => tone(1250, 0.03, { type: 'square', gain: 0.035 }),
  thud: () => tone(130, 0.28, { to: 45, gain: 0.22 }),
  blip: () => tone(660, 0.09, { type: 'triangle', gain: 0.08 }),
  flip: () => tone(380, 0.07, { type: 'triangle', to: 520 }),
  ball: () => { tone(260, 0.1, { type: 'square', gain: 0.05 }); tone(390, 0.12, { type: 'square', gain: 0.05, delay: 0.08 }); },
  whoosh: () => tone(180, 0.3, { to: 900, gain: 0.08 }),
  ding: () => { tone(880, 0.15); tone(1320, 0.3, { delay: 0.1 }); },
  buzz: () => tone(150, 0.3, { type: 'sawtooth', gain: 0.08, to: 110 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { delay: i * 0.12, type: 'triangle' })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { delay: i * 0.16, type: 'triangle' })),
};

// A short burst of filtered noise (wind, claws, gasps).
function noise(dur, { gain = 0.1, delay = 0, freq = 1000, to = null, q = 1, type = 'bandpass' } = {}) {
  const t0 = audio.currentTime + delay;
  const n = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.15);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(amp).connect(audio.destination);
  src.start(t0);
}

// A wolf howl: a wobbling note that climbs, holds, then sinks.
function howl(gain = 0.12, len = 2.2) {
  const t0 = audio.currentTime;
  const osc = audio.createOscillator();
  const lp = audio.createBiquadFilter();
  const amp = audio.createGain();
  const lfo = audio.createOscillator();
  const lfoAmp = audio.createGain();
  osc.type = 'sawtooth';
  lp.type = 'lowpass'; lp.frequency.value = 900;
  osc.frequency.setValueAtTime(260, t0);
  osc.frequency.exponentialRampToValueAtTime(640, t0 + len * 0.35);
  osc.frequency.setValueAtTime(640, t0 + len * 0.6);
  osc.frequency.exponentialRampToValueAtTime(360, t0 + len);
  lfo.frequency.value = 6; lfoAmp.gain.value = 14;
  lfo.connect(lfoAmp).connect(osc.frequency);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.4);
  amp.gain.setValueAtTime(gain, t0 + len * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(lp).connect(amp).connect(audio.destination);
  osc.start(t0); lfo.start(t0);
  osc.stop(t0 + len + 0.05); lfo.stop(t0 + len + 0.05);
}

// Low rumbling growl: a saw wave chopped by a fast tremolo.
function growl(gain = 0.16, len = 0.8) {
  const t0 = audio.currentTime;
  const osc = audio.createOscillator();
  const lp = audio.createBiquadFilter();
  const amp = audio.createGain();
  const lfo = audio.createOscillator();
  const lfoAmp = audio.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(75, t0); osc.frequency.linearRampToValueAtTime(55, t0 + len);
  lp.type = 'lowpass'; lp.frequency.value = 400;
  lfo.frequency.value = 30; lfoAmp.gain.value = gain * 0.6;
  amp.gain.setValueAtTime(gain * 0.5, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  lfo.connect(lfoAmp).connect(amp.gain);
  osc.connect(lp).connect(amp).connect(audio.destination);
  osc.start(t0); lfo.start(t0);
  osc.stop(t0 + len + 0.05); lfo.stop(t0 + len + 0.05);
}

const SOUNDS_SPOOKY = {
  howl: () => howl(0.12, 2.2),
  farhowl: () => howl(0.04, 2.6),
  growl: () => growl(),
  slash: () => { [0, 0.07, 0.14].forEach(d => noise(0.16, { delay: d, freq: 5000, to: 1500, q: 2, gain: 0.2 })); tone(110, 0.3, { to: 40, gain: 0.2, delay: 0.1 }); },
  heartbeat: () => { tone(72, 0.13, { to: 40, gain: 0.28 }); tone(64, 0.16, { to: 38, gain: 0.22, delay: 0.17 }); },
  cricket: () => [0, 0.07, 0.14].forEach(d => tone(4300, 0.035, { type: 'square', gain: 0.012, delay: d })),
  wind: () => noise(2.4, { freq: 300, to: 700, q: 0.7, gain: 0.05 }),
  gasp: () => noise(0.35, { freq: 2500, q: 0.8, gain: 0.08 }),
  rooster: () => [[523, 0.12, 0], [784, 0.1, 0.14], [659, 0.12, 0.28], [988, 0.45, 0.44]].forEach(([f, d, at]) => tone(f, d, { type: 'triangle', delay: at, gain: 0.1 })),
  shield: () => { tone(1046, 0.5, { gain: 0.09 }); tone(1568, 0.7, { gain: 0.07, delay: 0.12 }); },
  mystic: () => { tone(494, 0.7, { to: 740, gain: 0.07 }); tone(740, 0.9, { to: 988, gain: 0.05, delay: 0.15 }); },
};
Object.assign(SOUNDS, SOUNDS_SPOOKY, {
  farewell: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.55, { delay: i * 0.32, type: 'triangle', gain: 0.09 })),
  bang: () => { noise(0.25, { freq: 900, to: 200, q: 0.6, gain: 0.35 }); tone(90, 0.25, { to: 35, gain: 0.3 }); },
  drumroll: () => Array.from({ length: 14 }, (_, i) => tone(110 + (i % 2) * 14, 0.07, { type: 'triangle', gain: 0.05 + i * 0.006, delay: i * 0.09 })),
  vote: () => tone(720, 0.06, { type: 'square', gain: 0.04 }),
  birds: () => [[2400, 0], [3000, 0.12], [2700, 0.26], [3300, 0.4]].forEach(([f, d]) => tone(f, 0.09, { to: f * 1.25, gain: 0.025, delay: d })),
  heartbreak: () => { tone(520, 0.9, { to: 210, type: 'sine', gain: 0.1 }); tone(392, 0.9, { to: 160, type: 'sine', gain: 0.07, delay: 0.1 }); },
  love: () => [659, 784, 988].forEach((f, i) => tone(f, 0.4, { delay: i * 0.14, gain: 0.07 })),
  potion: () => { tone(300, 0.15, { to: 700, gain: 0.07 }); tone(500, 0.12, { to: 900, gain: 0.05, delay: 0.12 }); noise(0.3, { freq: 3000, q: 3, gain: 0.04, delay: 0.1 }); },
});

export function sfx(name) {
  if (muted) return;
  try {
    unlockAudio();
    if (audio?.state === 'running') SOUNDS[name]?.();
  } catch { /* ignore */ }
}
