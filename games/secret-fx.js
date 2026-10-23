import { sfx, confetti, reduceMotion } from './fx.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The finale, full screen on everyone's phone (tap to skip): curtains, a spotlight and a drum roll,
// then the Secret Millionaire's name slams in with raining money.
export function revealScene({ name, outcome, isMe, iWin, detectives = [], money, anchor }) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const o = document.createElement('div');
  o.className = 'sm-cine';
  const caught = outcome.winner === 'detectives';
  o.innerHTML = `<div class="smc-curtain l"></div><div class="smc-curtain r"></div><div class="smc-spot"></div>
    <div class="smc-money" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 4.7) % 100}%;--d:${(i % 7) * 0.35}s;--s:${1.2 + (i % 5) * 0.3}rem">${i % 3 ? '💵' : '💰'}</i>`).join('')}</div>
    <div class="smc-text">
      <div class="smc-t1">And the Secret Millionaire is…</div>
      <div class="smc-name">${esc(name)}</div>
      <div class="smc-verdict ${caught ? 'caught' : 'free'}">${caught ? '🕵️ Caught!' : '💰 Got away with it!'}</div>
      <div class="smc-pot">${caught ? `${esc(detectives.join(', ') || 'The group')} split ${money(outcome.pot)}` : `Takes home ${money(outcome.total)}`}</div>
      <p class="smc-skip">${iWin ? '🎉 You won! ' : ''}Tap to continue</p>
    </div>`;
  document.body.append(o);
  const close = () => { timers.forEach(clearTimeout); o.remove(); };
  o.addEventListener('click', close);
  at(0, () => sfx('whoosh'));
  at(300, () => o.classList.add('open'));
  at(1200, () => sfx('drumroll'));
  at(1500, () => o.classList.add('s1'));
  at(3000, () => { o.classList.add('s2'); sfx('bang'); });
  at(3700, () => { o.classList.add('s3'); sfx(caught ? 'win' : 'sparkle'); if (!reduceMotion()) confetti(); });
  at(5200, () => o.classList.add('s4'));
  const watch = setInterval(() => { if (!anchor.isConnected) { clearInterval(watch); close(); } }, 700);
  return close;
}
