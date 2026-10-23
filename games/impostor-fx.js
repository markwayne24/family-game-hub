import { sfx, confetti, reduceMotion } from './fx.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  const SC = 7200, ROW = 0.38;                       // when the scores start (ms) and the gap between rows (s)
  if (scores.length) {
    at(SC - 200, () => sfx('whoosh'));
    scores.forEach((r, i) => {
      at(SC + 300 + i * ROW * 1000, () => sfx('vote'));
      if (r.gain) at(SC + 900 + i * ROW * 1000, () => sfx('ding'));
    });
  }
  if (reduceMotion()) return;

  const box = document.createElement('div');
  box.className = `imp-cine ${impostorWins ? 'bad' : 'good'}`;
  const len = String(impostor).length;
  box.innerHTML = `
    <div class="ic-beam"></div>
    <i class="ic-q q1">?</i><i class="ic-q q2">?</i><i class="ic-q q3">?</i><i class="ic-q q4">?</i><i class="ic-q q5">?</i>
    <div class="ic-det"><span class="ic-man">🕵️</span><span class="ic-mag">🔎</span></div>
    <div class="ic-lines">
      <p class="ic-was">The impostor was…</p>
      <div class="ic-name ${len > 9 ? 'long' : ''}">${esc(impostor)}</div>
      <div class="ic-word"><small>and the secret word was</small><b>${esc(word)}</b>${ejected ? `<em>Voted out: ${esc(ejected)}${guess ? ` · guessed “${esc(guess)}”` : ''}</em>` : '<em>Nobody was voted out</em>'}</div>
      <div class="ic-verdict">${impostorWins ? '🕵️ The impostor wins!' : '🎉 The crew wins!'}</div>
    </div>
    <div class="ic-flash"></div>
    ${scores.length ? `<div class="ic-scores"><h3>🏆 Scores</h3>${(() => {
      const max = Math.max(1, ...scores.map(r => r.after));
      return scores.map((r, i) => `<div class="ic-row ${r.me ? 'me' : ''}" style="--d:${(0.3 + i * ROW).toFixed(2)}s;--w:${Math.round((r.after / max) * 100)}%">
        <span class="rk">${i === 0 && r.after > 0 ? '👑' : i + 1}</span><span class="nm">${esc(r.name)}</span>
        <span class="bar"><i></i></span><b class="pts" data-from="${r.before}" data-to="${r.after}">${r.before}</b>${r.gain ? `<em class="plus" style="--p:${(0.9 + i * ROW).toFixed(2)}s">+${r.gain}</em>` : '<em class="plus none"></em>'}</div>`).join('');
    })()}</div>` : ''}
    <small class="ic-skip">tap to skip</small>`;
  const done = () => { timers.forEach(clearTimeout); box.classList.add('out'); setTimeout(() => box.remove(), 500); };
  box.addEventListener('click', done);
  document.body.append(box);
  if (scores.length) {
    // after the verdict, swap to the scores and count each total up
    at(SC, () => box.classList.add('scores'));
    box.querySelectorAll('.pts').forEach((el, i) => at(SC + 900 + i * ROW * 1000, () => {
      const from = +el.dataset.from, to = +el.dataset.to, t0 = performance.now();
      if (from === to) return;
      const tick = now => { const k = Math.min(1, (now - t0) / 700); el.textContent = Math.round(from + (to - from) * k); if (k < 1 && el.isConnected) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
  }
  timers.push(setTimeout(done, scores.length ? SC + 1500 + scores.length * ROW * 1000 + 3500 : 8200));
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
