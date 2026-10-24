import { sfx, reduceMotion } from './fx.js';
import { roomOf, TASKS } from './secret-data.js';
import { taskPoints } from './secret-clues.js';
import { LV } from './secret-levels.js';

// The mini-games played inside the mansion's rooms. Each one runs entirely on the player's own phone and reports
// finish(ok, ms) once, where ms is how long the player took from their first tap. They never know about the network.

const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(e); });

/* ---------- Kitchen: tap when the pancake turns golden ---------- */
function reaction(box, finish, { later, level }) {
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
      if (++n >= 3) { const avg = times.reduce((a, b) => a + b, 0) / 3; paint(); return later(() => finish(avg <= LV.reaction.avg[level] && early <= 1, performance.now() - started), 450); }
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
function sequence(box, finish, { later, level }) {
  const LEN = LV.sequence.len[level], STEP = LV.sequence.step[level], COLS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
  const seq = Array.from({ length: LEN }, () => rnd(5));
  box.innerHTML = `<p class="st-say" id="say">Watch carefully…</p><div class="st-books">${COLS.map((c, i) => `<button class="st-book" data-i="${i}" style="--c:${c}" disabled>📖</button>`).join('')}</div><div class="st-dots" id="dots"></div>`;
  const say = box.querySelector('#say'), books = [...box.querySelectorAll('.st-book')], dots = box.querySelector('#dots');
  const lit = (i, ms = 380) => { books[i].classList.add('lit'); sfx('blip'); later(() => books[i].classList.remove('lit'), ms); };
  let pos = 0, t0 = 0;
  seq.forEach((v, k) => later(() => lit(v), 900 + k * STEP));
  later(() => { say.textContent = 'Your turn! Tap them in order.'; books.forEach(b => (b.disabled = false)); t0 = performance.now(); paint(); }, 900 + LEN * STEP + 200);
  const paint = () => { dots.innerHTML = seq.map((_, i) => `<i class="${i < pos ? 'on' : ''}"></i>`).join(''); };
  books.forEach(b => tap(b, () => {
    if (b.disabled) return;
    const i = +b.dataset.i; lit(i, 220);
    if (i === seq[pos]) { pos++; paint(); if (pos === LEN) { books.forEach(x => (x.disabled = true)); finish(true, performance.now() - t0 + LEN * STEP); } }
    else { sfx('buzz'); books.forEach(x => (x.disabled = true)); say.textContent = 'Wrong book!'; later(() => finish(false, performance.now() - t0 + LEN * STEP), 600); }
  }));
}

/* ---------- Garage: tap 1 to 9 in order ---------- */
function numbers(box, finish, { later, level }) {
  const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); let next = 1, t0 = 0, over = false, mistakes = 0;
  box.innerHTML = `<p class="st-say" id="say">Tap <b>1</b> to start the clock.</p><div class="st-grid">${order.map(n => `<button class="st-num" data-n="${n}">${n}</button>`).join('')}</div><div class="st-clock" id="clk"></div>`;
  const say = box.querySelector('#say'), clk = box.querySelector('#clk');
  const LIMIT = LV.numbers.limit[level];
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
function sums(box, finish, { later, level }) {
  const qs = Array.from({ length: 4 }, () => {
    const [A0, A1, B0, B1] = LV.sums.range[level], t = rnd(3), a = A0 + rnd(A1), b = B0 + rnd(B1);
    const [txt, ans] = t === 0 ? [`${a} + ${b}`, a + b] : t === 1 ? [`${a + b} − ${b}`, a] : [`${LV.sums.mul[level][0] + rnd(LV.sums.mul[level][1])} × ${LV.sums.mul[level][2] + rnd(LV.sums.mul[level][3])}`, 0];
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
      setTimeout(() => { if (++i >= qs.length) finish(right >= LV.sums.need[level], performance.now() - t0); else show(); }, 450);
    }));
  };
  t0 = performance.now(); show();
}

/* ---------- Vault: stop the dial in the gold zone ---------- */
function timing(box, finish, { later, level }) {
  let hits = 0, tries = 0, t0 = performance.now(), pos = 0, dir = 1, stopped = false, raf = 0;
  const MAXTRIES = 6;
  box.innerHTML = `<div class="st-lock"><div class="st-track" id="trk"><i class="st-zone" id="zone"></i><i class="st-needle" id="nd"></i></div></div><p class="st-say" id="say">Tap to stop the dial in the gold.</p><button class="st-stop" id="stop">🔐 STOP</button><div class="st-dots" id="dots"></div>`;
  const nd = box.querySelector('#nd'), zone = box.querySelector('#zone'), say = box.querySelector('#say'), dots = box.querySelector('#dots');
  let zl = 0.4, zw = LV.timing.zone[level], speed = LV.timing.speed[level];
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
    if (pos >= zl && pos <= zl + zw) { hits++; sfx('ding'); say.textContent = 'Click! 🔓'; zw = Math.max(0.08, zw - 0.03); speed += 0.25; place(); }
    else { sfx('buzz'); say.textContent = 'Missed!'; }
    paint();
    if (hits >= 3 || tries >= MAXTRIES || tries - hits > MAXTRIES - 3) { stopped = true; cancelAnimationFrame(raf); setTimeout(() => finish(hits >= 3, performance.now() - t0), 500); }
  });
}


/* ---------- Kitchen: catch the falling eggs ---------- */
function catchEggs(box, finish, { later, level }) {
  const TOTAL = 10; let caught = 0, resolved = 0, t0 = performance.now();
  box.innerHTML = '<div class="st-field" id="fld"></div><p class="st-say" id="say">Tap the eggs!</p><div class="st-dots" id="dots"></div>';
  const fld = box.querySelector('#fld'), say = box.querySelector('#say'), dots = box.querySelector('#dots');
  const paint = () => { say.textContent = `${caught} caught`; dots.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<i class="${i < caught ? 'on' : ''}"></i>`).join(''); };
  const resolve = () => { if (++resolved >= TOTAL) later(() => finish(caught >= LV.catch.need[level], performance.now() - t0), 350); };
  paint();
  for (let i = 0; i < TOTAL; i++) later(() => {
    const e = document.createElement('button'); e.className = 'st-egg'; e.textContent = '🥚'; e.style.left = 6 + rnd(78) + '%'; e.style.animationDuration = (1.9 + Math.random() * 0.8) * LV.catch.fall[level] + 's';
    let hit = false;
    tap(e, () => { if (hit) return; hit = true; caught++; sfx('pop'); e.classList.add('caught'); e.textContent = '🍳'; paint(); setTimeout(() => e.remove(), 250); resolve(); });
    e.addEventListener('animationend', () => { if (hit) return; hit = true; sfx('tick'); e.remove(); resolve(); });
    fld.append(e);
  }, 400 + i * 750 + rnd(250));
}

/* ---------- Library: spot the odd one out ---------- */
const PAIRS = [['🙂', '🙃'], ['🐶', '🐕'], ['🍎', '🍅'], ['🕐', '🕑'], ['🌕', '🌖'], ['⭐', '🌟'], ['🔵', '🟦'], ['🐱', '🐈'], ['🍋', '🟡'], ['🌲', '🌳']];
function oddone(box, finish, { later, level }) {
  const sizes = LV.oddone.sizes[level], allow = LV.oddone.allow[level]; let r = 0, mistakes = 0; const t0 = performance.now();
  const show = () => {
    const n = sizes[r], [a, b] = shuffle(PAIRS[rnd(PAIRS.length)]), odd = rnd(n * n);
    box.innerHTML = `<p class="st-say">Find the odd one out <b>${r + 1}/3</b></p><div class="st-odd" style="--n:${n}">${Array.from({ length: n * n }, (_, i) => `<button class="st-cell" data-odd="${i === odd ? 1 : 0}">${i === odd ? b : a}</button>`).join('')}</div><div class="st-dots">${Array.from({ length: allow }, (_, i) => `<i class="${i < mistakes ? 'bad' : ''}"></i>`).join('')}</div>`;
    box.querySelectorAll('.st-cell').forEach(c => tap(c, () => {
      if (c.dataset.odd === '1') { sfx('ding'); if (++r >= sizes.length) return finish(true, performance.now() - t0); show(); }
      else { sfx('buzz'); c.classList.add('bad'); c.disabled = true; if (++mistakes > allow) { box.querySelectorAll('.st-cell').forEach(x => (x.disabled = true)); setTimeout(() => finish(false, performance.now() - t0), 500); } else box.querySelectorAll('.st-dots i').forEach((d, i) => d.classList.toggle('bad', i < mistakes)); }
    }));
  };
  show();
}

/* ---------- Garage: match the wires ---------- */
function wires(box, finish, { later, level }) {
  const COLS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'].slice(0, LV.wires.n[level]), left = COLS.map((_, i) => i), right = shuffle(left), allow = LV.wires.allow[level], limit = LV.wires.limit[level];
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
      if (++done === COLS.length) { const ms = performance.now() - t0; setTimeout(() => finish(mistakes <= allow && ms <= limit, ms), 350); }
    } else { mistakes++; sfx('buzz'); say.textContent = mistakes > allow ? 'Too many wrong tries…' : 'Wrong wire!'; }
  }));
}

/* ---------- Garden: squash the bugs, spare the bees ---------- */
function whack(box, finish, { later, level }) {
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
    if (i >= POPS) return later(() => finish(score >= LV.whack.need[level], performance.now() - t0), 600);
    const h = holes[rnd(9)], bee = Math.random() < 0.2;
    h.dataset.kind = bee ? 'bee' : 'bug'; h.textContent = bee ? '🐝' : '🐛'; hit = false; i++; paint();
    later(() => { h.dataset.kind = ''; h.textContent = ''; later(pop, 250 + rnd(250)); }, LV.whack.show[level]);
  };
  paint(); later(pop, 700);
}

/* ---------- Vault: crack the 3-digit code ---------- */
function code(box, finish, { later, level }) {
  const secret = [rnd(10), rnd(10), rnd(10)], guess = [5, 5, 5], hist = [], TRIES = LV.code.tries[level]; const t0 = performance.now(); let over = false;
  const draw = () => {
    box.innerHTML = `<div class="st-digits">${guess.map((d, i) => `<div class="st-dcol"><button class="st-up" data-i="${i}" aria-label="Up">▲</button><div class="st-dig" data-i="${i}">${d}</div><button class="st-dn" data-i="${i}" aria-label="Down">▼</button></div>`).join('')}</div>
      <button class="st-go" id="try">🔓 Try this code</button><div class="st-hist">${hist.map(h => `<div>${h.g.join('')} ${h.hints.map(x => (x === 0 ? '✅' : x > 0 ? '⬆️' : '⬇️')).join(' ')}</div>`).join('')}</div><p class="st-say">${TRIES - hist.length} tries left</p>`;
    box.querySelectorAll('.st-up,.st-dn').forEach(b => tap(b, () => { if (over) return; const i = +b.dataset.i; guess[i] = (guess[i] + (b.classList.contains('st-up') ? 1 : 9)) % 10; sfx('tick'); box.querySelector(`.st-dig[data-i="${i}"]`).textContent = guess[i]; }));
    tap(box.querySelector('#try'), () => {
      if (over) return;
      const hints = guess.map((d, i) => Math.sign(secret[i] - d));
      hist.push({ g: [...guess], hints });
      if (hints.every(h => h === 0)) { over = true; sfx('ding'); return finish(true, performance.now() - t0); }
      sfx('buzz');
      if (hist.length >= TRIES) { over = true; return finish(false, performance.now() - t0); }
      draw();
    });
  };
  draw();
}

/* ---------- Kitchen: hold to heat the soup, let go in the green ---------- */
function simmer(box, finish, { later, level }) {
  const [LO, HI] = LV.simmer.zone[level]; let pot = 0, good = 0, v = 0, holding = false, over = false, locked = false, raf = 0, last = 0; const t0 = performance.now();
  box.innerHTML = `<p class="st-say" id="say">Pot 1 of 3. Press and hold!</p><div class="st-gauge" id="g" data-v="0" data-lo="${LO}" data-hi="${HI}"><i class="st-fill" id="fill"></i><b class="st-zone2" style="left:${LO}%;width:${HI - LO}%"></b></div><button class="st-hold" id="hold">🍲 HOLD</button><div class="st-dots" id="dots"></div>`;
  const say = box.querySelector('#say'), g = box.querySelector('#g'), fill = box.querySelector('#fill'), btn = box.querySelector('#hold'), dots = box.querySelector('#dots');
  const paint = () => { dots.innerHTML = [0, 1, 2].map(i => `<i class="${i < good ? 'on' : i < pot ? 'bad' : ''}"></i>`).join(''); };
  const setV = x => { v = x; g.dataset.v = Math.round(v); fill.style.width = v + '%'; };
  const settle = ok => {
    holding = false; locked = true; cancelAnimationFrame(raf); if (ok) good++; pot++; sfx(ok ? 'ding' : 'buzz'); paint();
    say.textContent = ok ? 'Perfect!' : v >= 100 ? 'Boiled over!' : v < LO ? 'Too cold…' : 'Too hot!';
    if (pot >= 3 || (3 - pot) + good < 2) { over = true; return later(() => finish(good >= 2, performance.now() - t0), 600); }
    later(() => { setV(0); locked = false; say.textContent = `Pot ${pot + 1} of 3. Press and hold!`; }, 700);
  };
  const frame = now => { if (!holding) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; setV(Math.min(100, v + dt * 70)); if (v >= 100) return settle(false); raf = requestAnimationFrame(frame); };
  tap(btn, () => { if (over || holding || locked) return; holding = true; last = performance.now(); raf = requestAnimationFrame(frame); });
  const up = () => { if (!holding) return; settle(v >= LO && v <= HI); };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  box._stop = () => { cancelAnimationFrame(raf); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  paint();
}

/* ---------- Library: unscramble a word ---------- */
const WORDS = [['BOOK', 'PAGE', 'READ', 'TALE', 'PLOT', 'LINE', 'POEM', 'WORD'], ['BOOKS', 'PAGES', 'NOVEL', 'SHELF', 'STORY', 'WRITE', 'POEMS', 'PROSE', 'VERSE', 'TALES', 'PLOTS', 'INDEX'], ['AUTHOR', 'VOLUME', 'WRITER', 'LEGEND', 'POETRY', 'FICTION', 'LIBRARY', 'READER']];
function scramble(box, finish, { later, level }) {
  const pool = WORDS[level], allow = LV.scramble.allow[level], word = pool[rnd(pool.length)]; let letters; do letters = shuffle(word.split('')); while (letters.join('') === word);
  let pos = 0, mistakes = 0; const t0 = performance.now();
  box.innerHTML = `<div class="st-slots" id="slots" data-ans="${word}">${word.split('').map(() => '<span class="st-slot"></span>').join('')}</div><p class="st-say" id="say">Tap the letters in order.</p><div class="st-letters">${letters.map((c, i) => `<button class="st-letter" data-i="${i}">${c}</button>`).join('')}</div><div class="st-dots">${Array.from({ length: allow }, () => '<i></i>').join('')}</div>`;
  const slots = [...box.querySelectorAll('.st-slot')], say = box.querySelector('#say'), dots = [...box.querySelectorAll('.st-dots i')];
  box.querySelectorAll('.st-letter').forEach(b => tap(b, () => {
    if (b.disabled) return;
    if (b.textContent === word[pos]) { slots[pos].textContent = b.textContent; pos++; b.disabled = true; sfx('tick'); if (pos === word.length) { sfx('ding'); finish(true, performance.now() - t0); } }
    else { sfx('buzz'); dots[mistakes]?.classList.add('bad'); b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); say.textContent = 'Not that one!'; if (++mistakes >= allow) { box.querySelectorAll('.st-letter').forEach(x => (x.disabled = true)); setTimeout(() => finish(false, performance.now() - t0), 500); } }
  }));
}

/* ---------- Garage: pump the tyre by tapping fast ---------- */
function pump(box, finish, { later, level }) {
  let v = 0, over = false, raf = 0;
  const GAIN = LV.pump.gain[level], DECAY = LV.pump.decay[level], LIMIT = 8000, t0 = performance.now(); let last = t0;
  box.innerHTML = `<div class="st-tyre"><div class="st-tyrefill" id="tf"></div><span>🛞</span></div><p class="st-say" id="say">Tap PUMP as fast as you can!</p><button class="st-pumpbtn" id="pump">⬆ PUMP</button><div class="st-clock" id="clk"></div>`;
  const tf = box.querySelector('#tf'), clk = box.querySelector('#clk'), say = box.querySelector('#say');
  const frame = now => {
    if (over) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    { v = Math.max(0, v - dt * DECAY); clk.textContent = ((LIMIT - (performance.now() - t0)) / 1000).toFixed(1) + 's left'; if (performance.now() - t0 > LIMIT) { over = true; sfx('lose'); say.textContent = 'Out of time!'; return finish(false, LIMIT); } }
    tf.style.height = v + '%'; tf.dataset.v = Math.round(v); raf = requestAnimationFrame(frame);
  };
  tap(box.querySelector('#pump'), () => {
    if (over) return;
    v = Math.min(100, v + GAIN); sfx('tick'); tf.style.height = v + '%'; tf.dataset.v = Math.round(v);
    if (v >= 100) { over = true; cancelAnimationFrame(raf); say.textContent = 'Full!'; finish(true, performance.now() - t0); }
  });
  raf = requestAnimationFrame(frame);
  box._stop = () => { over = true; cancelAnimationFrame(raf); };
}

/* ---------- Garden: pick only the ripe tomatoes ---------- */
function harvest(box, finish, { level }) {
  const allow = LV.harvest.allow[level], ripe = LV.harvest.ripe[level] + rnd(2), LIMIT = LV.harvest.limit[level], cells = shuffle([...Array(ripe).fill(1), ...Array(12 - ripe).fill(0)]); let left = ripe, mistakes = 0, over = false; const t0 = performance.now();
  box.innerHTML = `<p class="st-say" id="say">Ripe left: <b>${left}</b></p><div class="st-fruits">${cells.map((r, i) => `<button class="st-fruit" data-ripe="${r}">${r ? '🍅' : '🍏'}</button>`).join('')}</div><div class="st-dots">${Array.from({ length: allow + 1 }, () => '<i></i>').join('')}</div><p class="st-clock" id="clk"></p>`;
  const say = box.querySelector('#say'), dots = [...box.querySelectorAll('.st-dots i')], clk = box.querySelector('#clk');
  const iv = setInterval(() => { if (over || !box.isConnected) return clearInterval(iv); const l = LIMIT - (performance.now() - t0); clk.textContent = Math.max(0, l / 1000).toFixed(0) + 's'; if (l <= 0) { over = true; clearInterval(iv); sfx('lose'); box.querySelectorAll('.st-fruit').forEach(x => (x.disabled = true)); finish(false, LIMIT); } }, 250);
  box._stop = () => clearInterval(iv);
  box.querySelectorAll('.st-fruit').forEach(b => tap(b, () => {
    if (b.disabled || over) return; b.disabled = true;
    if (b.dataset.ripe === '1') { b.classList.add('picked'); b.textContent = '🧺'; sfx('ding'); say.innerHTML = `Ripe left: <b>${--left}</b>`; if (!left) { over = true; clearInterval(iv); finish(true, performance.now() - t0); } }
    else { b.classList.add('bad'); sfx('buzz'); dots[mistakes]?.classList.add('bad'); if (++mistakes > allow) { over = true; clearInterval(iv); box.querySelectorAll('.st-fruit').forEach(x => (x.disabled = true)); setTimeout(() => finish(false, performance.now() - t0), 500); } }
  }));
}

/* ---------- Vault: match the gems ---------- */
function pairs(box, finish, { later, level }) {
  const GEMS = ['💎', '💍', '👑', '🏆', '🔮', '🪙'], deck = shuffle([...GEMS, ...GEMS]); const allow = LV.pairs.allow[level]; let open = [], found = 0, wrong = 0, lock = false; const t0 = performance.now();
  box.innerHTML = `<p class="st-say" id="say">Wrong tries: 0 / ${allow}</p><div class="st-cards">${deck.map((g, i) => `<button class="st-gem" data-v="${g}" data-i="${i}"><span>?</span></button>`).join('')}</div>`;
  const say = box.querySelector('#say'), cards = [...box.querySelectorAll('.st-gem')];
  cards.forEach(c => tap(c, () => {
    if (lock || c.classList.contains('up') || c.classList.contains('found')) return;
    c.classList.add('up'); c.firstChild.textContent = c.dataset.v; sfx('flip'); open.push(c);
    if (open.length < 2) return;
    const [a, b] = open; open = [];
    if (a.dataset.v === b.dataset.v) { a.classList.add('found'); b.classList.add('found'); sfx('ding'); if (++found === GEMS.length) later(() => finish(true, performance.now() - t0), 400); }
    else { wrong++; say.textContent = `Wrong tries: ${wrong} / ${allow}`; sfx('buzz'); lock = true; later(() => { [a, b].forEach(x => { x.classList.remove('up'); x.firstChild.textContent = '?'; }); lock = false; if (wrong >= allow) finish(false, performance.now() - t0); }, 650); }
  }));
}

/* ---------- Kitchen: remember the order slip ---------- */
const DISHES = ['🍔', '🍟', '🥤', '🍕', '🌮', '🍩', '🥗', '🍜', '🍦', '🥪', '🍣', '🥐'];
function order(box, finish, { later, level }) {
  const N = LV.order.n[level], SHOW = LV.order.show[level], menu = shuffle(DISHES).slice(0, 8), want = new Set(shuffle(menu).slice(0, N)); const chosen = new Set(); let t0 = 0, served = false; const tStart = performance.now();
  box.innerHTML = `<div class="st-slip" id="slip">${[...want].map(d => `<span>${d}</span>`).join('')}</div><p class="st-say" id="say">Remember these!</p><div class="st-menu" id="menu" hidden>${menu.map(d => `<button class="st-dish" data-d="${d}" data-want="${want.has(d) ? 1 : 0}">${d}</button>`).join('')}</div><button class="st-go" id="serve" hidden>🛎 Serve</button>`;
  const slip = box.querySelector('#slip'), say = box.querySelector('#say'), mn = box.querySelector('#menu'), sv = box.querySelector('#serve');
  later(() => { slip.classList.add('gone'); slip.innerHTML = '<span>❓</span>'; mn.hidden = false; sv.hidden = false; say.textContent = `Pick the ${N} dishes you saw.`; t0 = performance.now(); sfx('whoosh'); }, SHOW);
  box.querySelectorAll('.st-dish').forEach(b => tap(b, () => { if (!t0 || served) return; const d = b.dataset.d; if (chosen.has(d)) { chosen.delete(d); b.classList.remove('on'); } else { chosen.add(d); b.classList.add('on'); } sfx('tick'); }));
  tap(sv, () => { if (!t0 || served) return; served = true; const ok = chosen.size === N && [...chosen].every(d => want.has(d)); finish(ok, performance.now() - tStart); });
}

/* ---------- Library: a quick quiz ---------- */
// [question, right answer, wrong answers...] grouped by how hard they are
const QUIZ = [
  [['How many days are in a week?', '7', '5', '6', '8'], ['What colour do you get from mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown'], ['Which animal says "moo"?', 'Cow', 'Dog', 'Cat', 'Duck'], ['What is 10 + 5?', '15', '14', '16', '25'], ['How many legs does a spider have?', '8', '6', '4', '10'], ['Which is the largest: ant, elephant, cat?', 'Elephant', 'Ant', 'Cat', 'Dog'], ['What do bees make?', 'Honey', 'Milk', 'Silk', 'Bread'], ['The sun rises in the…', 'East', 'West', 'North', 'South']],
  [['How many continents are there?', '7', '5', '6', '8'], ['What is the capital of the Philippines?', 'Manila', 'Cebu', 'Davao', 'Baguio'], ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Saturn'], ['How many minutes are in an hour?', '60', '30', '90', '100'], ['What gas do plants take in?', 'Carbon dioxide', 'Oxygen', 'Helium', 'Nitrogen'], ['What is 9 × 7?', '63', '56', '72', '54'], ['Which ocean is the largest?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'], ['How many sides does a hexagon have?', '6', '5', '7', '8']],
  [['What is the chemical symbol for gold?', 'Au', 'Ag', 'Go', 'Gd'], ['Who wrote "Noli Me Tangere"?', 'José Rizal', 'Andrés Bonifacio', 'Emilio Aguinaldo', 'Apolinario Mabini'], ['What is 12 × 12?', '144', '124', '132', '148'], ['Which is the smallest prime number?', '2', '1', '3', '0'], ['How many bones does an adult human have?', '206', '106', '306', '256'], ['What is the longest river in the world (commonly cited)?', 'Nile', 'Amazon', 'Mekong', 'Yangtze'], ['Which planet has the most moons?', 'Saturn', 'Mars', 'Venus', 'Mercury'], ['What year did the first Moon landing happen?', '1969', '1959', '1979', '1965']],
];
function quiz(box, finish, { later, level }) {
  const need = LV.quiz.need[level], secs = LV.quiz.secs[level];
  const qs = shuffle([...QUIZ[level], ...(level ? QUIZ[level - 1].slice(0, 2) : [])]).slice(0, 3);
  let i = 0, right = 0, left = secs; const t0 = performance.now(); let tick = 0, answered = false;
  const next = () => { clearInterval(tick); if (++i >= qs.length) return finish(right >= need, performance.now() - t0); show(); };
  const show = () => {
    const [q, ok, ...bad] = qs[i], opts = shuffle([ok, ...bad]); answered = false; left = secs;
    box.innerHTML = `<p class="st-q2">${q}</p><div class="st-quiz">${opts.map(o => `<button class="st-ans" data-ok="${o === ok ? 1 : 0}">${o}</button>`).join('')}</div><p class="st-clock" id="clk">${left}s</p><div class="st-dots">${qs.map((_, k) => `<i class="${k < i ? 'on' : ''}"></i>`).join('')}</div>`;
    const clk = box.querySelector('#clk');
    clearInterval(tick); tick = setInterval(() => { if (!box.isConnected) return clearInterval(tick); clk.textContent = --left + 's'; if (left <= 0) { clearInterval(tick); if (!answered) { answered = true; sfx('buzz'); later(next, 400); } } }, 1000);
    box.querySelectorAll('.st-ans').forEach(b => tap(b, () => { if (answered) return; answered = true; const good = b.dataset.ok === '1'; if (good) right++; sfx(good ? 'ding' : 'buzz'); box.querySelectorAll('.st-ans').forEach(x => { x.disabled = true; if (x.dataset.ok === '1') x.classList.add('ok'); }); if (!good) b.classList.add('bad'); later(next, 650); }));
  };
  box._stop = () => clearInterval(tick);
  show();
}

/* ---------- Garage: stop the clock at the target time ---------- */
function stopclock(box, finish, { level }) {
  const T = LV.stopclock.t[level], tol = LV.stopclock.tol[level]; let raf = 0, over = false;
  box.innerHTML = `<p class="st-say">Stop it at <b>${T.toFixed(2)}</b> seconds.</p><div class="st-bigclock" id="bc">0.00</div><p class="st-say" id="say">The clock hides soon…</p><button class="st-pumpbtn" id="stop2">⏱ STOP</button>`;
  const bc = box.querySelector('#bc'), say = box.querySelector('#say'), t0 = performance.now();
  const frame = () => { if (over) return; const e = (performance.now() - t0) / 1000; if (e < 1.5) bc.textContent = e.toFixed(2); else { bc.textContent = '?.??'; say.textContent = 'Count in your head!'; } box._e = e; raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  box._stop = () => { over = true; cancelAnimationFrame(raf); };
  tap(box.querySelector('#stop2'), () => { if (over) return; over = true; cancelAnimationFrame(raf); const e = (performance.now() - t0) / 1000, err = Math.abs(e - T); bc.textContent = e.toFixed(2); say.textContent = err <= tol ? `Off by ${err.toFixed(2)}s. Great!` : `Off by ${err.toFixed(2)}s.`; bc.dataset.err = err.toFixed(3); setTimeout(() => finish(err <= tol, e * 1000), 600); });
}

/* ---------- Garden: water each plant exactly enough ---------- */
function water(box, finish, { later, level }) {
  const MAXN = LV.water.maxn[level], LIMIT = LV.water.limit[level], HIDE = LV.water.hide[level];
  const need = [0, 1, 2].map(() => 1 + rnd(MAXN)), got = [0, 0, 0]; let over = false; const t0 = performance.now();
  box.innerHTML = `<p class="st-say" id="say">Give each plant exactly the drops it needs.</p><div class="st-plants">${need.map((n, i) => `<button class="st-plant" data-i="${i}" data-need="${n}"><span class="st-need">${'💧'.repeat(n)}</span><span class="st-pl">🪴</span><span class="st-got">0</span></button>`).join('')}</div><button class="st-go" id="done2">✅ All watered</button><p class="st-clock" id="clk"></p>`;
  const say = box.querySelector('#say'), plants = [...box.querySelectorAll('.st-plant')], clk = box.querySelector('#clk');
  if (HIDE) later(() => plants.forEach(p => { p.querySelector('.st-need').textContent = '❓'; }), HIDE);
  const iv = setInterval(() => { if (over || !box.isConnected) return clearInterval(iv); const left = LIMIT - (performance.now() - t0); clk.textContent = (left / 1000).toFixed(0) + 's'; if (left <= 0) { over = true; clearInterval(iv); sfx('lose'); finish(false, LIMIT); } }, 250);
  box._stop = () => clearInterval(iv);
  plants.forEach(p => tap(p, () => { if (over) return; const i = +p.dataset.i; got[i]++; p.querySelector('.st-got').textContent = got[i]; sfx('pop'); if (got[i] > need[i]) { over = true; clearInterval(iv); p.classList.add('wilt'); p.querySelector('.st-pl').textContent = '🥀'; sfx('buzz'); say.textContent = 'Too much water!'; setTimeout(() => finish(false, performance.now() - t0), 600); } }));
  tap(box.querySelector('#done2'), () => { if (over) return; over = true; clearInterval(iv); finish(got.every((g, i) => g === need[i]), performance.now() - t0); });
}

/* ---------- Vault: lights out ---------- */
function lights(box, finish, { level }) {
  const K = LV.lights.k[level], LIMIT = LV.lights.limit[level]; const on = Array(9).fill(false); let moves = 0, over = false; const t0 = performance.now();
  const flip = i => { const r = Math.floor(i / 3), c = i % 3; for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) on[rr * 3 + cc] = !on[rr * 3 + cc]; } };
  do { on.fill(false); shuffle([...Array(9).keys()]).slice(0, K).forEach(flip); } while (!on.some(Boolean));
  box.innerHTML = `<p class="st-say" id="say">Turn every light off. Moves left: <b>${LIMIT}</b></p><div class="st-lights" id="lg">${on.map((_, i) => `<button class="st-light" data-i="${i}"></button>`).join('')}</div>`;
  const say = box.querySelector('#say'), cells = [...box.querySelectorAll('.st-light')];
  const paint = () => { cells.forEach((c, i) => c.classList.toggle('on', on[i])); say.innerHTML = `Turn every light off. Moves left: <b>${LIMIT - moves}</b>`; };
  paint();
  cells.forEach(c => tap(c, () => {
    if (over) return; flip(+c.dataset.i); moves++; sfx('tick'); paint();
    if (!on.some(Boolean)) { over = true; sfx('ding'); return finish(true, performance.now() - t0); }
    if (moves >= LIMIT) { over = true; sfx('buzz'); setTimeout(() => finish(false, performance.now() - t0), 500); }
  }));
}

const GAMES = { reaction, catch: catchEggs, sequence, oddone, numbers, wires, sums, whack, timing, code, simmer, scramble, pump, harvest, pairs, order, quiz, stopclock, water, lights };

/* ---------- the full-screen frame around a task: intro, the task itself, the result ---------- */

// anchor: the game screen; the overlay disappears with it. onFinish(ok, ms) is called once, when the player taps Continue.
// onQuit() is called if they walk out before finishing.
export function openTask(roomId, { anchor, onFinish, onQuit, kind, level = 1 }) {
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
      o.querySelector('#stOk').addEventListener('click', () => { close(); onFinish(ok, ms, kind); });
    }, { later, level });
  });
  return close;
}
