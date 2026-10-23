import { sfx, reduceMotion } from './fx.js';
import { roomOf } from './secret-data.js';
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

const GAMES = { reaction, sequence, numbers, sums, timing };

/* ---------- the full-screen frame around a task: intro, the task itself, the result ---------- */

// anchor: the game screen; the overlay disappears with it. onFinish(ok, ms) is called once, when the player taps Continue.
// onQuit() is called if they walk out before finishing.
export function openTask(roomId, { anchor, onFinish, onQuit }) {
  const room = roomOf(roomId);
  const o = document.createElement('div');
  o.className = 'st-overlay';
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(() => { if (o.isConnected) fn(); }, ms); timers.push(t); return t; };
  const close = () => { timers.forEach(clearTimeout); o.querySelector('.st-body')?._stop?.(); clearInterval(watch); o.remove(); };
  const watch = setInterval(() => { if (!anchor.isConnected) close(); }, 700);
  let done = false;
  o.innerHTML = `<div class="st-card"><div class="st-head"><span class="st-room">${room.emoji}</span><div><b>${room.name}</b><small>${room.title}</small></div><button class="st-x" aria-label="Leave the room">✕</button></div>
    <div class="st-body"><p class="st-how">${room.how}</p><button class="st-go" id="stGo">▶ Start</button></div></div>`;
  document.body.append(o);
  sfx('pop');
  o.querySelector('.st-x').addEventListener('click', () => { if (done) return; close(); onQuit?.(); });
  const body = o.querySelector('.st-body');
  o.querySelector('#stGo').addEventListener('click', () => {
    sfx('flip');
    GAMES[room.task](body, (ok, ms) => {
      if (done) return; done = true; body._stop?.();
      const pts = taskPoints(ok, ms);
      sfx(ok ? 'win' : 'lose');
      body.innerHTML = `<div class="st-result ${ok ? 'good' : 'bad'}"><div class="st-big">${ok ? '✅' : '❌'}</div><h3>${ok ? 'Task complete!' : 'Task failed'}</h3><p>${ok ? `+${pts} points for your team` : 'No points this time.'}</p><small>${(ms / 1000).toFixed(1)} seconds</small><button class="st-go" id="stOk">Continue</button></div>`;
      o.querySelector('#stOk').addEventListener('click', () => { close(); onFinish(ok, ms); });
    }, { later });
  });
  return close;
}
