import { sfx, reduceMotion } from './fx.js';
import { roomOf, TASKS } from './secret-data.js';
import { taskPoints } from './secret-clues.js';

// The mini-games played inside the mansion's rooms. Each one runs entirely on the player's own phone and reports
// finish(ok, ms) once, where ms is how long the player took from their first tap. They never know about the network.

const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(e); });

/* ---------- Kitchen: tap when the pancake turns golden ---------- */
function reaction(box, finish, { later }) {
  let n = 0, early = 0; const times = []; let t0 = 0, ready = false, started = 0;
  box.innerHTML = '<div class="st-pan" id="pan"><span class="st-cake" id="cake">🥞</span></div><p class="st-say" id="say"></p><div class="st-dots" id="dots"></div>';
  const pan = box.querySelector('#pan'), say = box.querySelector('#say'), dots = box.querySelector('#dots');
  const paint = () => { dots.innerHTML = [0, 1, 2].map(i => `<i class="${i < times.length ? 'on' : ''}"></i>`).join(''); };
  const round = () => {
    ready = false; pan.classList.remove('gold'); say.textContent = 'Wait for the golden glow…'; paint();
    later(() => { ready = true; t0 = performance.now(); pan.classList.add('gold'); say.textContent = 'NOW!'; sfx('blip'); }, 900 + rnd(1700));
  };
  tap(pan, () => {
    if (!started) started = performance.now();
    if (ready) {
      times.push(performance.now() - t0); ready = false; sfx('ding'); pan.classList.remove('gold'); pan.classList.add('flip');
      later(() => pan.classList.remove('flip'), 400);
      if (++n >= 3) { const avg = times.reduce((a, b) => a + b, 0) / 3; paint(); return later(() => finish(avg <= 700 && early <= 1, performance.now() - started), 450); }
      say.textContent = `${Math.round(times[times.length - 1])} ms!`; later(round, 700);
    } else {
      early++; sfx('buzz'); say.textContent = early > 1 ? 'Burnt it! Too early again.' : 'Too early! Wait for the glow.';
      pan.classList.add('burn'); later(() => pan.classList.remove('burn'), 400);
      if (early > 1) { later(() => finish(false, performance.now() - started), 700); ready = false; }
    }
  });
  started = 0; round();
}

/* ---------- Library: watch the books glow, repeat the order ---------- */
function sequence(box, finish, { later }) {
  const LEN = 5, COLS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
  const seq = Array.from({ length: LEN }, () => rnd(5));
  box.innerHTML = `<p class="st-say" id="say">Watch carefully…</p><div class="st-books">${COLS.map((c, i) => `<button class="st-book" data-i="${i}" style="--c:${c}" disabled>📖</button>`).join('')}</div><div class="st-dots" id="dots"></div>`;
  const say = box.querySelector('#say'), books = [...box.querySelectorAll('.st-book')], dots = box.querySelector('#dots');
  const lit = (i, ms = 380) => { books[i].classList.add('lit'); sfx('blip'); later(() => books[i].classList.remove('lit'), ms); };
  let pos = 0, t0 = 0;
  seq.forEach((v, k) => later(() => lit(v), 900 + k * 650));
  later(() => { say.textContent = 'Your turn! Tap them in order.'; books.forEach(b => (b.disabled = false)); t0 = performance.now(); paint(); }, 900 + LEN * 650 + 200);
  const paint = () => { dots.innerHTML = seq.map((_, i) => `<i class="${i < pos ? 'on' : ''}"></i>`).join(''); };
  books.forEach(b => tap(b, () => {
    if (b.disabled) return;
    const i = +b.dataset.i; lit(i, 220);
    if (i === seq[pos]) { pos++; paint(); if (pos === LEN) { books.forEach(x => (x.disabled = true)); finish(true, performance.now() - t0 + LEN * 650); } }
    else { sfx('buzz'); books.forEach(x => (x.disabled = true)); say.textContent = 'Wrong book!'; later(() => finish(false, performance.now() - t0 + LEN * 650), 600); }
  }));
}

/* ---------- Garage: tap 1 to 9 in order ---------- */
function numbers(box, finish, { later }) {
  const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); let next = 1, t0 = 0, over = false, mistakes = 0;
  box.innerHTML = `<p class="st-say" id="say">Tap <b>1</b> to start the clock.</p><div class="st-grid">${order.map(n => `<button class="st-num" data-n="${n}">${n}</button>`).join('')}</div><div class="st-clock" id="clk"></div>`;
  const say = box.querySelector('#say'), clk = box.querySelector('#clk');
  const LIMIT = 20000;
  const timer = setInterval(() => { if (!t0 || over) return; const e = performance.now() - t0; clk.textContent = (e / 1000).toFixed(1) + 's'; if (e > LIMIT) { over = true; clearInterval(timer); sfx('buzz'); say.textContent = 'Time ran out!'; finish(false, LIMIT); } }, 100);
  box._stop = () => clearInterval(timer);
  box.querySelectorAll('.st-num').forEach(b => tap(b, () => {
    if (over) return;
    const n = +b.dataset.n;
    if (n === next) {
      if (n === 1) t0 = performance.now();
      b.classList.add('ok'); b.disabled = true; sfx('tick'); next++;
      say.innerHTML = next > 9 ? 'Engine fixed!' : `Now <b>${next}</b>`;
      if (next > 9) { over = true; clearInterval(timer); const ms = performance.now() - t0 + mistakes * 1000; finish(ms <= LIMIT, ms); }
    } else if (t0) { mistakes++; sfx('buzz'); b.classList.add('bad'); later(() => b.classList.remove('bad'), 300); say.innerHTML = `Oops! +1s. Find <b>${next}</b>`; }
  }));
}

/* ---------- Garden: four quick sums ---------- */
function sums(box, finish) {
  const qs = Array.from({ length: 4 }, () => {
    const t = rnd(3), a = 3 + rnd(12), b = 2 + rnd(9);
    const [txt, ans] = t === 0 ? [`${a} + ${b}`, a + b] : t === 1 ? [`${a + b} − ${b}`, a] : [`${2 + rnd(8)} × ${2 + rnd(6)}`, 0];
    let q = txt, r = ans; if (t === 2) { const [x, y] = txt.split(' × ').map(Number); r = x * y; }
    const opts = new Set([r]); while (opts.size < 4) opts.add(Math.max(0, r + rnd(11) - 5)); return { q, r, opts: shuffle([...opts]) };
  });
  let i = 0, right = 0, t0 = 0;
  const show = () => {
    const x = qs[i];
    box.innerHTML = `<div class="st-flower">${'🌸🌼🌷🌻'[i]}</div><p class="st-q">${x.q} = ?</p><div class="st-opts">${x.opts.map(o => `<button class="st-opt" data-o="${o}">${o}</button>`).join('')}</div><div class="st-dots">${qs.map((_, k) => `<i class="${k < i ? 'on' : ''}"></i>`).join('')}</div>`;
    box.querySelectorAll('.st-opt').forEach(b => tap(b, () => {
      if (!t0) t0 = performance.now();
      if (+b.dataset.o === x.r) { right++; sfx('ding'); } else sfx('buzz');
      box.querySelectorAll('.st-opt').forEach(o => { o.disabled = true; if (+o.dataset.o === x.r) o.classList.add('ok'); else if (o === b) o.classList.add('bad'); });
      setTimeout(() => { if (++i >= qs.length) finish(right >= 3, performance.now() - t0); else show(); }, 450);
    }));
  };
  t0 = performance.now(); show();
}

/* ---------- Vault: stop the dial in the gold zone ---------- */
function timing(box, finish) {
  let hits = 0, tries = 0, t0 = performance.now(), pos = 0, dir = 1, stopped = false, raf = 0;
  const MAXTRIES = 6;
  box.innerHTML = `<div class="st-lock"><div class="st-track" id="trk"><i class="st-zone" id="zone"></i><i class="st-needle" id="nd"></i></div></div><p class="st-say" id="say">Tap to stop the dial in the gold.</p><button class="st-stop" id="stop">🔐 STOP</button><div class="st-dots" id="dots"></div>`;
  const nd = box.querySelector('#nd'), zone = box.querySelector('#zone'), say = box.querySelector('#say'), dots = box.querySelector('#dots');
  let zl = 0.4, zw = 0.22, speed = 0.9;
  const place = () => { zl = 0.1 + Math.random() * (0.8 - zw); zone.style.left = zl * 100 + '%'; zone.style.width = zw * 100 + '%'; };
  const paint = () => { dots.innerHTML = [0, 1, 2].map(i => `<i class="${i < hits ? 'on' : ''}"></i>`).join(''); };
  place(); paint();
  let last = performance.now();
  const loop = now => {
    if (!box.isConnected || stopped) return;
    pos += dir * speed * Math.min(0.05, (now - last) / 1000); last = now;
    if (pos >= 1) { pos = 1; dir = -1; } if (pos <= 0) { pos = 0; dir = 1; }
    nd.style.left = pos * 100 + '%'; raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  box._stop = () => { stopped = true; cancelAnimationFrame(raf); };
  tap(box.querySelector('#stop'), () => {
    if (stopped) return;
    tries++;
    if (pos >= zl && pos <= zl + zw) { hits++; sfx('ding'); say.textContent = 'Click! 🔓'; zw = Math.max(0.1, zw - 0.04); speed += 0.25; place(); }
    else { sfx('buzz'); say.textContent = 'Missed!'; }
    paint();
    if (hits >= 3 || tries >= MAXTRIES || tries - hits > MAXTRIES - 3) { stopped = true; cancelAnimationFrame(raf); setTimeout(() => finish(hits >= 3, performance.now() - t0), 500); }
  });
}


/* ---------- Kitchen: catch the falling eggs ---------- */
function catchEggs(box, finish, { later }) {
  const TOTAL = 10; let caught = 0, resolved = 0, t0 = performance.now();
  box.innerHTML = '<div class="st-field" id="fld"></div><p class="st-say" id="say">Tap the eggs!</p><div class="st-dots" id="dots"></div>';
  const fld = box.querySelector('#fld'), say = box.querySelector('#say'), dots = box.querySelector('#dots');
  const paint = () => { say.textContent = `${caught} caught`; dots.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<i class="${i < caught ? 'on' : ''}"></i>`).join(''); };
  const resolve = () => { if (++resolved >= TOTAL) later(() => finish(caught >= 7, performance.now() - t0), 350); };
  paint();
  for (let i = 0; i < TOTAL; i++) later(() => {
    const e = document.createElement('button'); e.className = 'st-egg'; e.textContent = '🥚'; e.style.left = 6 + rnd(78) + '%'; e.style.animationDuration = 1.9 + Math.random() * 0.8 + 's';
    let hit = false;
    tap(e, () => { if (hit) return; hit = true; caught++; sfx('pop'); e.classList.add('caught'); e.textContent = '🍳'; paint(); setTimeout(() => e.remove(), 250); resolve(); });
    e.addEventListener('animationend', () => { if (hit) return; hit = true; sfx('tick'); e.remove(); resolve(); });
    fld.append(e);
  }, 400 + i * 750 + rnd(250));
}

/* ---------- Library: spot the odd one out ---------- */
const PAIRS = [['🙂', '🙃'], ['🐶', '🐕'], ['🍎', '🍅'], ['🕐', '🕑'], ['🌕', '🌖'], ['⭐', '🌟'], ['🔵', '🟦'], ['🐱', '🐈'], ['🍋', '🟡'], ['🌲', '🌳']];
function oddone(box, finish) {
  const sizes = [3, 4, 5]; let r = 0, mistakes = 0; const t0 = performance.now();
  const show = () => {
    const n = sizes[r], [a, b] = shuffle(PAIRS[rnd(PAIRS.length)]), odd = rnd(n * n);
    box.innerHTML = `<p class="st-say">Find the odd one out <b>${r + 1}/3</b></p><div class="st-odd" style="--n:${n}">${Array.from({ length: n * n }, (_, i) => `<button class="st-cell" data-odd="${i === odd ? 1 : 0}">${i === odd ? b : a}</button>`).join('')}</div><div class="st-dots">${[0, 1].map(i => `<i class="${i < mistakes ? 'bad' : ''}"></i>`).join('')}</div>`;
    box.querySelectorAll('.st-cell').forEach(c => tap(c, () => {
      if (c.dataset.odd === '1') { sfx('ding'); if (++r >= sizes.length) return finish(mistakes <= 1, performance.now() - t0); show(); }
      else { sfx('buzz'); c.classList.add('bad'); c.disabled = true; if (++mistakes > 1) { box.querySelectorAll('.st-cell').forEach(x => (x.disabled = true)); setTimeout(() => finish(false, performance.now() - t0), 500); } else box.querySelector('.st-dots').innerHTML = '<i class="bad"></i><i></i>'; }
    }));
  };
  show();
}

/* ---------- Garage: match the wires ---------- */
function wires(box, finish) {
  const COLS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00'], left = [0, 1, 2, 3], right = shuffle(left);
  let sel = null, done = 0, mistakes = 0, t0 = 0;
  box.innerHTML = `<p class="st-say" id="say">Tap a wire, then its twin.</p><div class="st-wires" id="w"><svg id="svg"></svg><div class="st-wcol">${left.map(i => `<button class="st-wire" data-s="l" data-c="${i}" style="--c:${COLS[i]}"></button>`).join('')}</div><div class="st-wcol">${right.map(i => `<button class="st-wire" data-s="r" data-c="${i}" style="--c:${COLS[i]}"></button>`).join('')}</div></div>`;
  const w = box.querySelector('#w'), svg = box.querySelector('#svg'), say = box.querySelector('#say');
  const center = el => { const a = el.getBoundingClientRect(), b = w.getBoundingClientRect(); return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2]; };
  const btn = (s, c) => box.querySelector(`.st-wire[data-s="${s}"][data-c="${c}"]`);
  box.querySelectorAll('.st-wire').forEach(b => tap(b, () => {
    if (!t0) t0 = performance.now();
    if (b.disabled) return;
    if (b.dataset.s === 'l') { box.querySelectorAll('.st-wire[data-s=l]').forEach(x => x.classList.remove('sel')); sel = b.dataset.c; b.classList.add('sel'); sfx('flip'); return; }
    if (sel == null) { say.textContent = 'Pick a wire on the left first.'; return; }
    if (b.dataset.c === sel) {
      const l = btn('l', sel), [x1, y1] = center(l), [x2, y2] = center(b);
      svg.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLS[sel]}" stroke-width="8" stroke-linecap="round"/>`);
      l.disabled = b.disabled = true; l.classList.remove('sel'); sel = null; sfx('ding');
      if (++done === 4) { const ms = performance.now() - t0; setTimeout(() => finish(mistakes <= 2 && ms <= 25000, ms), 350); }
    } else { mistakes++; sfx('buzz'); say.textContent = mistakes > 2 ? 'Too many wrong tries…' : 'Wrong wire!'; }
  }));
}

/* ---------- Garden: squash the bugs, spare the bees ---------- */
function whack(box, finish, { later }) {
  const POPS = 12; let score = 0, i = 0, hit = false; const t0 = performance.now();
  box.innerHTML = `<p class="st-say" id="say">Score: 0</p><div class="st-holes">${Array.from({ length: 9 }, (_, k) => `<button class="st-hole" data-k="${k}"></button>`).join('')}</div><div class="st-dots" id="dots"></div>`;
  const say = box.querySelector('#say'), holes = [...box.querySelectorAll('.st-hole')], dots = box.querySelector('#dots');
  const paint = () => { say.textContent = `Score: ${score}`; dots.innerHTML = Array.from({ length: POPS }, (_, k) => `<i class="${k < i ? 'on' : ''}"></i>`).join(''); };
  holes.forEach(h => tap(h, () => {
    if (!h.dataset.kind || hit) return;
    hit = true;
    if (h.dataset.kind === 'bug') { score++; sfx('ding'); h.textContent = '💥'; } else { score--; sfx('buzz'); h.textContent = '💢'; }
    h.dataset.kind = ''; paint();
  }));
  const pop = () => {
    if (i >= POPS) return later(() => finish(score >= 7, performance.now() - t0), 600);
    const h = holes[rnd(9)], bee = Math.random() < 0.2;
    h.dataset.kind = bee ? 'bee' : 'bug'; h.textContent = bee ? '🐝' : '🐛'; hit = false; i++; paint();
    later(() => { h.dataset.kind = ''; h.textContent = ''; later(pop, 250 + rnd(250)); }, 950);
  };
  paint(); later(pop, 700);
}

/* ---------- Vault: crack the 3-digit code ---------- */
function code(box, finish) {
  const secret = [rnd(10), rnd(10), rnd(10)], guess = [5, 5, 5], hist = []; const t0 = performance.now(); let over = false;
  const draw = () => {
    box.innerHTML = `<div class="st-digits">${guess.map((d, i) => `<div class="st-dcol"><button class="st-up" data-i="${i}" aria-label="Up">▲</button><div class="st-dig" data-i="${i}">${d}</div><button class="st-dn" data-i="${i}" aria-label="Down">▼</button></div>`).join('')}</div>
      <button class="st-go" id="try">🔓 Try this code</button><div class="st-hist">${hist.map(h => `<div>${h.g.join('')} ${h.hints.map(x => (x === 0 ? '✅' : x > 0 ? '⬆️' : '⬇️')).join(' ')}</div>`).join('')}</div><p class="st-say">${6 - hist.length} tries left</p>`;
    box.querySelectorAll('.st-up,.st-dn').forEach(b => tap(b, () => { if (over) return; const i = +b.dataset.i; guess[i] = (guess[i] + (b.classList.contains('st-up') ? 1 : 9)) % 10; sfx('tick'); box.querySelector(`.st-dig[data-i="${i}"]`).textContent = guess[i]; }));
    tap(box.querySelector('#try'), () => {
      if (over) return;
      const hints = guess.map((d, i) => Math.sign(secret[i] - d));
      hist.push({ g: [...guess], hints });
      if (hints.every(h => h === 0)) { over = true; sfx('ding'); return finish(true, performance.now() - t0); }
      sfx('buzz');
      if (hist.length >= 6) { over = true; return finish(false, performance.now() - t0); }
      draw();
    });
  };
  draw();
}

const GAMES = { reaction, catch: catchEggs, sequence, oddone, numbers, wires, sums, whack, timing, code };

/* ---------- the full-screen frame around a task: intro, the task itself, the result ---------- */

// anchor: the game screen; the overlay disappears with it. onFinish(ok, ms) is called once, when the player taps Continue.
// onQuit() is called if they walk out before finishing.
export function openTask(roomId, { anchor, onFinish, onQuit, kind }) {
  const room = roomOf(roomId);
  kind = kind ?? globalThis.__forceTask?.[roomId] ?? room.tasks[rnd(room.tasks.length)];   // (the hook is for browser tests)
  const info = TASKS[kind];
  const o = document.createElement('div');
  o.className = 'st-overlay';
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(() => { if (o.isConnected) fn(); }, ms); timers.push(t); return t; };
  const close = () => { timers.forEach(clearTimeout); o.querySelector('.st-body')?._stop?.(); clearInterval(watch); o.remove(); };
  const watch = setInterval(() => { if (!anchor.isConnected) close(); }, 700);
  let done = false;
  o.innerHTML = `<div class="st-card"><div class="st-head"><span class="st-room">${room.emoji}</span><div><b>${room.name}</b><small>${info.title}</small></div><button class="st-x" aria-label="Leave the room">✕</button></div>
    <div class="st-body"><p class="st-how">${info.how}</p><button class="st-go" id="stGo">▶ Start</button></div></div>`;
  document.body.append(o);
  sfx('pop');
  o.querySelector('.st-x').addEventListener('click', () => { if (done) return; close(); onQuit?.(); });
  const body = o.querySelector('.st-body');
  o.querySelector('#stGo').addEventListener('click', () => {
    sfx('flip');
    GAMES[kind](body, (ok, ms) => {
      if (done) return; done = true; body._stop?.();
      const pts = taskPoints(ok, ms);
      sfx(ok ? 'win' : 'lose');
      body.innerHTML = `<div class="st-result ${ok ? 'good' : 'bad'}"><div class="st-big">${ok ? '✅' : '❌'}</div><h3>${ok ? 'Task complete!' : 'Task failed'}</h3><p>${ok ? `+${pts} points for your team` : 'No points this time.'}</p><small>${(ms / 1000).toFixed(1)} seconds</small><button class="st-go" id="stOk">Continue</button></div>`;
      o.querySelector('#stOk').addEventListener('click', () => { close(); onFinish(ok, ms); });
    }, { later });
  });
  return close;
}
