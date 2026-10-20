import { fresh, memo, confetti, sfx } from './fx.js';

const LEVELS = {
  easy: ['cat', 'dog', 'sun', 'moon', 'star', 'tree', 'house', 'fish', 'bird', 'flower', 'apple', 'ball', 'car', 'boat', 'hat', 'shoe',
    'cup', 'book', 'cake', 'egg', 'heart', 'balloon', 'kite', 'duck', 'pig', 'cow', 'bed', 'door', 'clock', 'spoon', 'banana', 'pizza',
    'cloud', 'rain', 'bus', 'key', 'bell', 'candle', 'ice cream', 'snake'],
  medium: ['guitar', 'rocket', 'robot', 'snowman', 'umbrella', 'bicycle', 'train', 'airplane', 'elephant', 'giraffe', 'butterfly', 'castle',
    'rainbow', 'glasses', 'mountain', 'spider', 'camera', 'piano', 'dragon', 'pirate', 'volcano', 'lighthouse', 'scissors', 'backpack',
    'hamburger', 'snail', 'penguin', 'crown', 'ladder', 'tent', 'kangaroo', 'dinosaur', 'mermaid', 'windmill', 'helicopter', 'tractor',
    'cactus', 'bridge', 'jeepney', 'parol'],
  hard: ['astronaut', 'earthquake', 'fireworks', 'birthday party', 'traffic jam', 'library', 'waterfall', 'tornado', 'magician', 'skateboard',
    'treasure map', 'haunted house', 'time machine', 'hot air balloon', 'sunrise', 'campfire', 'carnival', 'detective', 'superhero',
    'sandcastle', 'jellyfish', 'telescope', 'parachute', 'wedding', 'thunderstorm', 'fishing', 'farmer', 'brushing teeth', 'sleeping',
    'cooking', 'karaoke', 'basketball game', 'sari-sari store', 'flood', 'typhoon', 'family dinner'],
};
LEVELS.mixed = [...LEVELS.easy, ...LEVELS.medium, ...LEVELS.hard];
const DRAW_MS = 75000;
const REVEAL_MS = 6000;
const COLORS = ['#000000', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#ffffff'];
const WIDTHS = [3, 8, 18];
const HEX = /^#[0-9a-f]{6}$/i;
const W = 600;
const H = 420;

const norm = t => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function startTurn(s, env) {
  const round = s.round + 1;
  if (round > s.order.length) return { ...s, phase: 'end', until: null };
  const words = LEVELS[s.level] ?? LEVELS.mixed;
  const pool = words.filter(w => !s.used.includes(w));
  const word = pool[Math.floor(Math.random() * pool.length)] ?? words[0];
  return {
    ...s, phase: 'draw', round, drawer: s.order[round - 1], word, used: [...s.used, word],
    strokes: [], guesses: [], correct: [], until: env.now + DRAW_MS,
  };
}

const toReveal = (s, env) => ({ ...s, phase: 'reveal', until: env.now + REVEAL_MS });

function paint(ctx, st) {
  ctx.strokeStyle = st.c; ctx.fillStyle = st.c; ctx.lineWidth = st.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const p = st.p;
  if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, st.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath();
  ctx.moveTo(p[0] * W, p[1] * H);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * H);
  ctx.stroke();
}

export const drawing = {
  id: 'drawing',
  name: 'Draw & Guess',
  emoji: '🎨',
  options: [{ key: 'level', label: 'Words', choices: [['easy', 'Easy (kids)'], ['medium', 'Medium'], ['hard', 'Hard'], ['mixed', 'Mixed']] }],

  init(env, opts) {
    const level = opts?.level ?? 'mixed';
    return startTurn({ phase: 'draw', order: env.players.map(p => p.id), round: 0, used: [], scores: {}, level }, env);
  },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init(env, { level: s.level });
    const drawing = s.phase === 'draw';

    if (a.type === 'stroke' && drawing && a.from === s.drawer && s.strokes.length < 400) {
      const p = Array.isArray(a.data?.p) ? a.data.p.slice(0, 400).map(n => Math.min(1, Math.max(0, +n || 0))) : [];
      if (p.length < 2 || p.length % 2) return s;
      const stroke = { p, c: HEX.test(a.data?.c) ? a.data.c : '#000000', w: WIDTHS.includes(a.data?.w) ? a.data.w : 3 };
      return { ...s, strokes: [...s.strokes, stroke] };
    }
    if (a.type === 'clear' && drawing && a.from === s.drawer) return { ...s, strokes: [] };
    if (a.type === 'undo' && drawing && a.from === s.drawer) return { ...s, strokes: s.strokes.slice(0, -1) };

    if (a.type === 'guess' && drawing && a.from !== s.drawer && !s.correct.includes(a.from)) {
      const text = String(a.data?.text ?? '').trim().slice(0, 40);
      if (!text) return s;
      if (norm(text) !== norm(s.word)) return { ...s, guesses: [...s.guesses, { id: a.from, text }].slice(-30) };
      const scores = { ...s.scores };
      scores[a.from] = (scores[a.from] ?? 0) + Math.max(30, 100 - 15 * s.correct.length);
      scores[s.drawer] = (scores[s.drawer] ?? 0) + 25;
      const next = { ...s, scores, correct: [...s.correct, a.from], guesses: [...s.guesses, { id: a.from, ok: true }].slice(-30) };
      const guessers = env.players.filter(p => p.id !== s.drawer);
      return guessers.every(p => next.correct.includes(p.id)) ? toReveal(next, env) : next;
    }

    if (a.type === 'skip' && isHost) {
      if (drawing) return toReveal(s, env);
      if (s.phase === 'reveal') return startTurn(s, env);
    }
    if (a.type === 'timeout' && isHost && s.until && env.now >= s.until - 100) {
      if (drawing) return toReveal(s, env);
      if (s.phase === 'reveal') return startTurn(s, env);
    }
    return s;
  },

  deadline: s => (s.phase === 'draw' || s.phase === 'reveal' ? s.until : null),

  // The word stays server-side (host) during a turn; only the drawer gets it via priv().
  view(s) {
    if (s.phase !== 'draw') return s;
    const hint = [...s.word].map(c => (c === ' ' ? '/' : '_')).join(' ');
    return { ...s, word: null, hint, used: [] };
  },
  priv: s => (s.phase === 'draw' ? { [s.drawer]: s.word } : {}),

  render(el, s, ui) {
    let d = el._d;
    if (!d) {
      el.innerHTML = `
        <h2>Draw &amp; Guess</h2>
        <p id="info"></p>
        <div class="bar"><i></i></div>
        <div id="wrap"><canvas width="${W}" height="${H}" class="draw"></canvas></div>
        <div id="tools" class="row">
          ${COLORS.map(c => `<button class="swatch" data-c="${c}" style="background:${c}" aria-label="color ${c}"></button>`).join('')}
          ${WIDTHS.map(w => `<button class="ghost" data-w="${w}">${w === 3 ? 'Thin' : w === 8 ? 'Medium' : 'Thick'}</button>`).join('')}
          <button class="ghost" id="undo">Undo</button><button class="ghost" id="clear">Clear</button>
        </div>
        <div id="chat" class="chat"></div>
        <form id="gf" class="row"><input id="gi" class="grow" placeholder="Type your guess…" maxlength="40" autocomplete="off"><button>Guess</button></form>
        <div id="board"></div>
        <div id="hostbar" class="row"></div>`;
      d = el._d = {
        s, ui, color: COLORS[0], width: WIDTHS[0], cur: null,
        canvas: el.querySelector('canvas'), info: el.querySelector('#info'), chat: el.querySelector('#chat'),
        form: el.querySelector('#gf'), input: el.querySelector('#gi'), tools: el.querySelector('#tools'),
        wrap: el.querySelector('#wrap'), board: el.querySelector('#board'), hostbar: el.querySelector('#hostbar'),
      };
      d.ctx = d.canvas.getContext('2d');
      d.bar = el.querySelector('.bar i');
      const pos = e => {
        const r = d.canvas.getBoundingClientRect();
        return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
      };
      const canDraw = () => d.s.phase === 'draw' && d.ui.me === d.s.drawer;
      d.canvas.addEventListener('pointerdown', e => {
        if (!canDraw()) return;
        d.canvas.setPointerCapture(e.pointerId);
        d.cur = { c: d.color, w: d.width, p: pos(e) };
        paint(d.ctx, { ...d.cur, p: d.cur.p });
      });
      d.canvas.addEventListener('pointermove', e => {
        if (!d.cur) return;
        const [x, y] = pos(e);
        const p = d.cur.p;
        d.ctx.strokeStyle = d.cur.c; d.ctx.lineWidth = d.cur.w; d.ctx.lineCap = 'round';
        d.ctx.beginPath(); d.ctx.moveTo(p[p.length - 2] * W, p[p.length - 1] * H); d.ctx.lineTo(x * W, y * H); d.ctx.stroke();
        p.push(x, y);
      });
      const end = () => {
        const st = d.cur;
        d.cur = null;
        if (!st) return;
        let p = st.p;
        const pts = p.length / 2;
        if (pts > 200) {
          const k = Math.ceil(pts / 200), q = [];
          for (let i = 0; i < pts; i += k) q.push(p[i * 2], p[i * 2 + 1]);
          q.push(p[p.length - 2], p[p.length - 1]);
          p = q;
        }
        d.ui.act('stroke', { p: p.map(n => Math.round(n * 1000) / 1000), c: st.c, w: st.w });
      };
      d.canvas.addEventListener('pointerup', end);
      d.canvas.addEventListener('pointercancel', end);
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { d.color = b.dataset.c; });
      el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { d.width = +b.dataset.w; });
      el.querySelector('#undo').onclick = () => d.ui.act('undo');
      el.querySelector('#clear').onclick = () => d.ui.act('clear');
      d.form.onsubmit = e => {
        e.preventDefault();
        const text = d.input.value.trim();
        if (text) d.ui.act('guess', { text });
        d.input.value = '';
      };
      d.tick = setInterval(() => {
        if (!el.isConnected || el._d !== d) return clearInterval(d.tick);
        const t = el.querySelector('#timer');
        if (t && d.s.until) t.textContent = `${Math.max(0, Math.ceil((d.s.until - Date.now()) / 1000))}s`;
        if (d.s.phase === 'draw' && d.s.until) {
          const pct = Math.max(0, Math.min(100, ((d.s.until - Date.now()) / DRAW_MS) * 100));
          d.bar.style.width = `${pct}%`;
          d.bar.classList.toggle('low', pct < 25);
        }
      }, 500);
    }
    d.s = s; d.ui = ui;
    const prevLen = memo(el, 'guesses', s.guesses.length) ?? s.guesses.length;
    const wasCorrect = memo(el, 'iCorrect', s.correct.includes(ui.me));
    if (wasCorrect === false && s.correct.includes(ui.me)) { confetti(); sfx('ding'); }
    else if (s.guesses.length > prevLen) sfx('blip');
    if (s.phase === 'end' && fresh(el, 'end', true)) { confetti(); sfx('win'); }
    d.bar.parentElement.style.visibility = s.phase === 'draw' ? 'visible' : 'hidden';

    const iDraw = s.phase === 'draw' && ui.me === s.drawer;
    const drawerName = ui.esc(ui.nameOf(s.drawer));
    d.info.innerHTML = s.phase === 'end' ? '🏆 Game over!'
      : s.phase === 'reveal' ? `The word was <b class="${fresh(el, 'rev', s.round) ? 'status-pop' : ''}">${ui.esc(s.word)}</b>`
      : iDraw ? `Draw: <b>${ui.esc(ui.priv ?? '…')}</b> · <span id="timer"></span>`
      : `${drawerName} is drawing: <b>${ui.esc(s.hint ?? '')}</b> · <span id="timer"></span>`;
    d.wrap.style.display = s.phase === 'end' ? 'none' : '';
    d.tools.style.display = iDraw ? '' : 'none';
    d.form.style.display = s.phase === 'draw' ? '' : 'none';
    d.input.disabled = iDraw || s.correct.includes(ui.me);
    d.input.placeholder = iDraw ? 'You are drawing!' : s.correct.includes(ui.me) ? 'You got it! 🎉' : 'Type your guess…';

    if (!d.cur) {
      d.ctx.fillStyle = '#fff';
      d.ctx.fillRect(0, 0, W, H);
      for (const st of s.strokes) paint(d.ctx, st);
    }
    d.chat.innerHTML = s.guesses.map((g, i) => {
      const cls = i >= prevLen ? ' class="in"' : '';
      return g.ok
        ? `<div${cls}>🎉 <b>${ui.esc(ui.nameOf(g.id))}</b> guessed it!</div>`
        : `<div${cls}><b>${ui.esc(ui.nameOf(g.id))}:</b> ${ui.esc(g.text)}</div>`;
    }).join('');
    d.chat.scrollTop = d.chat.scrollHeight;
    const rows = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');
    d.board.innerHTML = `<h3>Scores${s.phase !== 'end' ? ` · turn ${s.round} of ${s.order.length}` : ''}</h3><table class="table">${rows || '<tr><td class="muted">No points yet</td></tr>'}</table>`;
    d.hostbar.innerHTML = ui.isHost ? '<button class="ghost" id="skip">Skip turn</button><button class="ghost" id="reset">New game</button>' : '';
    d.hostbar.querySelector('#skip')?.addEventListener('click', () => ui.act('skip'));
    d.hostbar.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
