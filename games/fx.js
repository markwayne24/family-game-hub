// Small animation helpers shared by the games. Screens re-render on every update, so animations
// must be triggered only when something actually changed, not on every render.

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
