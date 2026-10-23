import { sfx, confetti, reduceMotion } from './fx.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const avatar = name => `<span class="sb-av" style="--h:${hue(name)}">${esc(String(name).trim().charAt(0).toUpperCase() || '?')}</span>`;
const MEDALS = ['🥇', '🥈', '🥉'];

// The score card: a podium for the top three and a tidy list for everyone else.
// rows: [{ name, before, after, gain, me }] already sorted by score. With `anim`, totals start at their old value
// and everything is timed (seconds after the card appears) so the scene can count them up.
export function scoreBoardHtml(rows, { anim = false } = {}) {
  if (!rows.length) return { html: '', delays: [], end: 0 };
  const max = Math.max(0, ...rows.map(r => r.after));
  const podium = max > 0 ? rows.slice(0, 3) : [];
  const rest = rows.slice(podium.length);
  const delays = [];
  podium.forEach((_, r) => { delays[r] = 0.3 + (podium.length - 1 - r) * 0.65; });
  const restStart = 0.3 + podium.length * 0.65 + 0.2;
  rest.forEach((_, i) => { delays[podium.length + i] = restStart + i * 0.3; });
  const end = Math.max(0, ...delays) + 0.9;
  const pts = (r, i) => `<b class="sb-pts" data-from="${anim ? r.before : r.after}" data-to="${r.after}" data-delay="${(delays[i] ?? 0).toFixed(2)}" data-gain="${r.gain || 0}">${anim ? r.before : r.after}</b>`;
  const plus = (r, i) => (r.gain ? `<em class="sb-plus" style="--p:${((delays[i] ?? 0) + 0.9).toFixed(2)}s">+${r.gain}</em>` : '');
  const col = (r, i) => `<div class="sb-col r${i} ${r.me ? 'me' : ''}" style="--d:${delays[i].toFixed(2)}s">
      <div class="sb-top">${i === 0 ? '<span class="sb-crown">👑</span>' : ''}${avatar(r.name)}${plus(r, i)}<div class="sb-nm">${esc(r.name)}</div></div>
      <div class="sb-ped"><span class="sb-medal">${MEDALS[i]}</span>${pts(r, i)}</div></div>`;
  const order = podium.length === 3 ? [1, 0, 2] : podium.length === 2 ? [1, 0] : [0];
  const list = rest.map((r, k) => { const i = podium.length + k; return `<div class="sb-row ${r.me ? 'me' : ''}" style="--d:${delays[i].toFixed(2)}s;--w:${max ? Math.round((r.after / max) * 100) : 0}%">
      <span class="sb-rk">${i + 1}</span>${avatar(r.name)}<span class="sb-nm">${esc(r.name)}</span><span class="sb-bar"><i></i></span>${pts(r, i)}${plus(r, i)}</div>`; }).join('');
  return { html: `<div class="sb ${anim ? 'anim' : ''}">${podium.length ? `<div class="sb-podium n${podium.length}">${order.map(i => col(podium[i], i)).join('')}</div>` : ''}${list ? `<div class="sb-list">${list}</div>` : ''}${max === 0 ? '<p class="sb-none">No points yet. Be the first!</p>' : ''}</div>`, delays, end };
}

// The end-of-round scene, played full screen on every phone (tap to skip):
// a spotlight sweeps the dark, the detective arrives, a drum roll builds, the impostor's name slams in,
// the secret word flips over, and the verdict lands.
export function revealCinematic({ impostor, word, impostorWins, mine, isImpostor, ejected, guess, scores = [] }) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  at(0, () => sfx('whoosh'));
  at(900, () => sfx('drumroll'));
  at(2600, () => sfx(isImpostor ? 'gasp' : 'thud'));
  at(4200, () => sfx('ding'));
  at(5400, () => {
    if (mine === false) sfx('lose'); else { confetti(); sfx('win'); }
    if (impostorWins && mine !== true) sfx('growl');
  });
  const SC = 7200;                                  // when the scores start (ms)
  const board = scores.length ? scoreBoardHtml(scores, { anim: true }) : null;
  if (board) {
    at(SC - 200, () => sfx('whoosh'));
    scores.forEach((r, i) => {
      const d = board.delays[i] ?? 0;
      at(SC + (d + 0.2) * 1000, () => sfx(i === 0 && r.after > 0 ? 'drumroll' : 'vote'));
      if (r.gain) at(SC + (d + 0.95) * 1000, () => sfx('ding'));
    });
  }
  if (reduceMotion()) return;

  const box = document.createElement('div');
  box.className = `imp-cine ${impostorWins ? 'bad' : 'good'}`;
  const len = String(impostor).length;
  box.innerHTML = `
    <div class="ic-beam"></div>
    <i class="ic-q q1">?</i><i class="ic-q q2">?</i><i class="ic-q q3">?</i><i class="ic-q q4">?</i><i class="ic-q q5">?</i>
    <div class="ic-lines">
      <div class="ic-det"><span class="ic-man">🕵️</span><span class="ic-mag">🔎</span></div>
      <p class="ic-was">The impostor was…</p>
      <div class="ic-name ${len > 9 ? 'long' : ''}">${esc(impostor)}</div>
      <div class="ic-word"><small>and the secret word was</small><b>${esc(word)}</b>${ejected ? `<em>Voted out: ${esc(ejected)}${guess ? ` · guessed “${esc(guess)}”` : ''}</em>` : '<em>Nobody was voted out</em>'}</div>
      <div class="ic-verdict">${impostorWins ? '🕵️ The impostor wins!' : '🎉 The crew wins!'}</div>
    </div>
    <div class="ic-flash"></div>
    ${board ? `<div class="ic-scores"><h3>🏆 Scores</h3>${board.html}</div>` : ''}
    <small class="ic-skip">tap to skip</small>`;
  const done = () => { timers.forEach(clearTimeout); box.classList.add('out'); setTimeout(() => box.remove(), 500); };
  box.addEventListener('click', done);
  document.body.append(box);
  if (board) {
    // after the verdict, swap to the scores and count each total up
    at(SC, () => box.classList.add('scores'));
    box.querySelectorAll('.sb-pts').forEach(el => at(SC + (+el.dataset.delay + 0.5) * 1000, () => {
      const from = +el.dataset.from, to = +el.dataset.to, t0 = performance.now();
      if (from === to) return;
      const tick = now => { const k = Math.min(1, (now - t0) / 800); el.textContent = Math.round(from + (to - from) * k); if (k < 1 && el.isConnected) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
  }
  timers.push(setTimeout(done, board ? SC + (board.end + 3.2) * 1000 : 8200));
}

// A short full-screen "whose turn is it" banner for the clue round, so nobody misses their turn.
export function turnCinematic({ name, mine, n, total, onDone }) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  if (mine) { sfx('whoosh'); at(150, () => sfx('blip')); at(330, () => sfx('blip')); at(520, () => sfx('ding')); } else sfx('pop');
  try { if (mine) navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
  if (reduceMotion()) { if (onDone) at(0, onDone); return; }
  const box = document.createElement('div');
  box.className = `imp-turnfx ${mine ? 'mine' : ''}`;
  box.innerHTML = `<div class="tf-ring"></div><div class="tf-mic">🎤</div>
    <div class="tf-title">${mine ? 'YOUR TURN!' : `${esc(name)}’s turn`}</div>
    <div class="tf-sub">${mine ? 'Give a one-word clue' : 'Listen to their clue'}</div>
    <div class="tf-count">Clue ${n} of ${total}</div>`;
  const done = () => { timers.forEach(clearTimeout); box.classList.add('out'); setTimeout(() => box.remove(), 350); if (onDone) onDone(); };
  box.addEventListener('click', done);
  document.body.append(box);
  timers.push(setTimeout(done, mine ? 2000 : 1500));
}
