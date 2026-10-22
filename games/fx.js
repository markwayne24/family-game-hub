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

export function sfx(name) {
  if (muted) return;
  try {
    unlockAudio();
    if (audio?.state === 'running') SOUNDS[name]?.();
  } catch { /* ignore */ }
}
