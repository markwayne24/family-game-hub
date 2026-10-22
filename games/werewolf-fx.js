import { sfx, reduceMotion } from './fx.js';

// A small moonlit scene shown at the top of the night screen. Everyone sees the same one, so it gives nothing away.
export function nightSky() {
  const stars = Array.from({ length: 16 }, (_, i) =>
    `<i class="star" style="left:${(i * 37 + 11) % 97}%;top:${(i * 53 + 7) % 60}%;--d:${(i % 5) * 0.6}s"></i>`).join('');
  return `<div class="ww-sky" aria-hidden="true">${stars}<div class="moon"></div><span class="bat b1">🦇</span><span class="bat b2">🦇</span>
    <span class="hill">🐺</span><div class="fog"></div></div>`;
}

// The morning-after scene, played once on every device: a wolf lunges out of the dark.
// `victim` is { name, role } or null when nobody died.
export function dawnCinematic(victim) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const died = !!victim;
  at(0, () => sfx('howl'));
  at(1200, () => sfx('growl'));
  at(1700, () => { if (died) { sfx('slash'); at(250, () => sfx('gasp')); } else sfx('shield'); });
  at(2100, () => { if (died) sfx('thud'); });
  at(3500, () => sfx('rooster'));
  if (reduceMotion()) return;

  const box = document.createElement('div');
  box.className = `ww-cine ${died ? 'died' : 'safe'}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  box.innerHTML = `<div class="c-moon"></div><div class="c-wolf">🐺</div>
    <svg class="c-claws" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M15 8 L55 92"/><path d="M38 4 L78 88"/><path d="M62 2 L98 80"/></svg>
    <div class="c-flash"></div><div class="c-shield"></div>
    <div class="c-text">${died
      ? `<div class="c-card">💀 ${esc(victim.name)}</div><p>${victim.role ? `${esc(victim.role)} · ` : ''}was taken in the night…</p>`
      : '<div class="c-card">☀️ Nobody died</div><p>The wolves were driven back!</p>'}</div>
    <small class="c-skip">tap to skip</small>`;
  const done = () => { timers.forEach(clearTimeout); box.classList.add('out'); setTimeout(() => box.remove(), 500); };
  box.addEventListener('click', done);
  document.body.append(box);
  timers.push(setTimeout(done, 4600));
}
