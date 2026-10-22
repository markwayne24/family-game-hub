import { fresh, memo, confetti, sfx, reduceMotion } from './fx.js';

export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const letterOf = n => LETTERS[Math.floor((n - 1) / 15)];

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// A card is derived from the player's id plus a shuffle seed, so the host can verify wins without trusting anyone.
// Index = row * 5 + column; 0 marks the free centre space.
export function cardFor(id, seed = 0) {
  const r = rng(`${id}:${seed}`);
  const cols = LETTERS.map((_, c) => {
    const nums = Array.from({ length: 15 }, (_, k) => c * 15 + k + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    return nums.slice(0, 5);
  });
  cols[2][2] = 0;
  return Array.from({ length: 25 }, (_, i) => cols[i % 5][Math.floor(i / 5)]);
}
const cardKey = card => card.join(',');

const range = [0, 1, 2, 3, 4];
const row = r => range.map(c => r * 5 + c);
const col = c => range.map(r => r * 5 + c);
const LINES = [...range.map(row), ...range.map(col), [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];

// What the host can ask for. `cells: null` means "any complete line" (the classic game).
export const PATTERNS = {
  line: { name: 'Any line', cells: null, preview: row(2) },
  corners: { name: 'Four corners', cells: [0, 4, 20, 24] },
  x: { name: 'X', cells: [0, 4, 6, 8, 12, 16, 18, 20, 24] },
  l: { name: 'L shape', cells: [...col(0), 21, 22, 23, 24] },
  t: { name: 'T shape', cells: [...row(0), 7, 12, 17, 22] },
  plus: { name: 'Plus', cells: [...row(2), 2, 7, 17, 22] },
  frame: { name: 'Frame', cells: [...row(0), ...row(4), 5, 10, 15, 9, 14, 19] },
  blackout: { name: 'Blackout (all)', cells: Array.from({ length: 25 }, (_, i) => i) },
  custom: { name: 'Custom', cells: [] }, // the host picks the squares; see state.custom
};

// The cells that make a card a winner for this pattern, or null if it isn't one yet.
export function winCells(card, called, pattern, custom = []) {
  const set = new Set(called);
  const done = i => card[i] === 0 || set.has(card[i]);
  const cells = pattern === 'custom' ? custom : (PATTERNS[pattern] ?? PATTERNS.line).cells;
  if (!cells) {
    const hit = LINES.filter(l => l.every(done));
    return hit.length ? [...new Set(hit.flat())] : null;
  }
  return cells.every(done) ? cells : null;
}

export const MAX_CARDS = 6;
export const MODES = {
  auto: 'Instant: the number is drawn and shown to everyone',
  manual: 'Private roll: only the host sees it until they reveal it',
};

// A player can hold several cards; card k of player `id` is seeded independently so each can be shuffled.
const cid = (id, k) => `${id}#${k}`;
export const countOf = (s, id) => s.counts[id] ?? 1;
const seedOf = (s, id, k) => s.seeds[cid(id, k)] ?? 0;
export const cardOf = (s, id, k = 0) => cardFor(cid(id, k), seedOf(s, id, k));
const cardsOf = (s, id) => Array.from({ length: countOf(s, id) }, (_, k) => cardOf(s, id, k));
const randomSeed = () => 1 + Math.floor(Math.random() * 1e9);
const customOk = s => s.pattern !== 'custom' || s.custom.some(i => i !== 12);

// Every player we know about, so new cards can be checked against all existing ones.
function knownIds(s, env) {
  return new Set([...env.players.map(p => p.id), ...Object.keys(s.counts), ...Object.keys(s.seeds).map(k => k.split('#')[0])]);
}
function takenKeys(s, env, except) {
  const taken = new Set();
  for (const id of knownIds(s, env)) {
    for (let k = 0; k < countOf(s, id); k++) if (!(except && except.id === id && except.k === k)) taken.add(cardKey(cardOf(s, id, k)));
  }
  return taken;
}

// Draw a number (auto mode) or reveal the rolled one (manual mode), then check everyone's cards.
function reveal(s, env, n) {
  const called = [...s.called, n];
  const winners = [];
  for (const p of env.players) {
    for (let k = 0; k < countOf(s, p.id); k++) {
      const cells = winCells(cardOf(s, p.id, k), called, s.pattern, s.custom);
      if (cells) { winners.push({ id: p.id, k, cells }); break; } // one entry per player
    }
  }
  return { ...s, called, last: n, pending: null, winners, phase: winners.length ? 'over' : 'play' };
}

const nextNumber = s => {
  const left = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !s.called.includes(n) && n !== s.pending);
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
};

export const bingo = {
  id: 'bingo',
  name: 'Bingo',
  emoji: '🎱',
  options: [
    { key: 'pattern', label: 'Win pattern', choices: Object.entries(PATTERNS).filter(([k]) => k !== 'custom').map(([k, p]) => [k, p.name]) },
    { key: 'mode', label: 'Number draw', choices: [['auto', 'Instant (everyone sees)'], ['manual', 'Private roll, host reveals']] },
  ],

  init(env, opts) {
    return {
      phase: 'lobby', host: env.hostId,
      pattern: PATTERNS[opts?.pattern] && opts.pattern !== 'custom' ? opts.pattern : 'line', custom: [],
      mode: MODES[opts?.mode] ? opts.mode : 'auto', pending: null,
      counts: {}, seeds: {}, called: [], last: null, winners: [],
    };
  },

  reduce(s, a, env) {
    s = { counts: {}, custom: [], mode: 'auto', pending: null, host: env.hostId, ...s };
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) {
      return { ...this.init(env, { pattern: s.pattern === 'custom' ? 'line' : s.pattern, mode: s.mode }), pattern: s.pattern, custom: s.custom, counts: s.counts, seeds: s.seeds };
    }
    if (a.type === 'mode' && isHost && MODES[a.data?.mode] && s.pending == null && s.phase !== 'over') return { ...s, mode: a.data.mode };

    if (s.phase === 'lobby') {
      if (isHost && a.type === 'pattern' && PATTERNS[a.data?.id]) return { ...s, pattern: a.data.id };
      if (isHost && a.type === 'custom') {
        const cells = [...new Set((Array.isArray(a.data?.cells) ? a.data.cells : []).filter(i => Number.isInteger(i) && i >= 0 && i < 25))].sort((x, y) => x - y);
        return { ...s, pattern: 'custom', custom: cells };
      }
      if (isHost && a.type === 'cards') {
        const count = Math.min(MAX_CARDS, Math.max(1, Math.floor(+a.data?.count) || 1));
        const ids = a.data?.id === '*' ? env.players.map(p => p.id) : knownIds(s, env).has(a.data?.id) ? [a.data.id] : [];
        if (!ids.length) return s;
        return { ...s, counts: { ...s.counts, ...Object.fromEntries(ids.map(id => [id, count])) } };
      }
      if (a.type === 'shuffle') {
        // A shuffled card must never match any other card in the room, including the player's own.
        const n = countOf(s, a.from);
        const ks = Number.isInteger(a.data?.k) ? [a.data.k].filter(k => k >= 0 && k < n) : Array.from({ length: n }, (_, k) => k);
        let next = s;
        for (const k of ks) {
          const taken = takenKeys(next, env, { id: a.from, k });
          let seed;
          do { seed = randomSeed(); } while (taken.has(cardKey(cardFor(cid(a.from, k), seed))));
          next = { ...next, seeds: { ...next.seeds, [cid(a.from, k)]: seed } };
        }
        return next;
      }
      if (a.type === 'start' && isHost && customOk(s)) {
        const seeds = { ...s.seeds };
        const seen = new Set();
        for (const p of env.players) {
          for (let k = 0; k < countOf(s, p.id); k++) {
            let seed = seeds[cid(p.id, k)] ?? 0;
            while (seen.has(cardKey(cardFor(cid(p.id, k), seed)))) seed = randomSeed();
            seeds[cid(p.id, k)] = seed;
            seen.add(cardKey(cardFor(cid(p.id, k), seed)));
          }
        }
        return { ...s, seeds, phase: 'play', called: [], last: null, winners: [], pending: null };
      }
    }

    if (s.phase === 'play' && isHost) {
      if (a.type === 'call' && s.mode === 'auto') {
        const n = nextNumber(s);
        return n ? reveal(s, env, n) : s;
      }
      // Private roll: the host sees the number first and chooses when everyone else does.
      if (a.type === 'roll' && s.mode === 'manual' && s.pending == null) {
        const n = nextNumber(s);
        return n ? { ...s, pending: n } : s;
      }
      if (a.type === 'reveal' && s.pending != null) return reveal(s, env, s.pending);
    }
    return s;
  },

  // A rolled-but-unrevealed number is only sent to the host (see priv).
  view(s) {
    const { pending, ...pub } = { counts: {}, custom: [], mode: 'auto', pending: null, ...s };
    return { ...pub, hasPending: pending != null };
  },
  priv: s => (s.pending != null ? { [s.host]: { pending: s.pending } } : {}),

  render(el, s, ui) {
    el._latest = { s, ui };
    const called = new Set(s.called);
    const prevCalled = memo(el, 'called', s.called);
    const newNum = prevCalled !== undefined && s.called.length > prevCalled.length && s.last;
    if (newNum) {
      showBall(s.last);
      el._busyUntil = Date.now() + BALL_MS;
      if (s.phase === 'over') el._holdUntil = Date.now() + BALL_MS;
      rerenderAfter(el, this);
    }
    // The host's private roll plays the same ball animation, just for them.
    const secret = ui.isHost ? (ui.priv?.pending ?? null) : null;
    const prevSecret = memo(el, 'secret', secret);
    if (secret && prevSecret !== undefined && secret !== prevSecret) showBall(secret, { secret: true });

    // Let the ball finish its animation before announcing the winners.
    const holding = Date.now() < (el._holdUntil ?? 0);
    const phase = s.phase === 'over' && holding ? 'play' : s.phase;

    const myCount = countOf(s, ui.me);
    const mySeeds = Array.from({ length: myCount }, (_, k) => seedOf(s, ui.me, k));
    const prevSeeds = memo(el, 'seeds', mySeeds);
    const shuffledAt = new Set(mySeeds.flatMap((sd, k) => (prevSeeds && prevSeeds[k] !== undefined && prevSeeds[k] !== sd ? [k] : [])));
    if (shuffledAt.size) sfx('flip');

    const myWin = phase === 'over' ? s.winners.find(w => w.id === ui.me) : null;
    const pat = PATTERNS[s.pattern] ?? PATTERNS.line;
    const patCells = s.pattern === 'custom' ? s.custom : pat.cells;
    const patName = s.pattern === 'custom' ? `Custom (${s.custom.filter(i => i !== 12).length} squares)` : pat.name;
    const target = new Set(patCells ?? []);
    if (phase === 'over' && fresh(el, 'over', s.called.length)) {
      if (myWin) { confetti(); sfx('win'); } else sfx('ding');
    }

    const esc = ui.esc;
    const nameOf = id => esc(ui.nameOf(id));
    const patNow = `<div class="patnow">${preview(patCells ?? pat.preview)}<span><b>${esc(patName)}</b>${patCells ? '' : '<br><small class="muted">Row, column or diagonal</small>'}</span></div>`;
    const counts = `<div class="cc">${ui.players.map(p => `<span class="chip ${p.id === ui.me ? 'me' : ''}">${esc(p.name)} · 🎴 ${countOf(s, p.id)}</span>`).join('')}</div>`;
    const busy = Date.now() < (el._busyUntil ?? 0);

    // ---- host settings (before the game, and the roll mode during it)
    const modeButtons = ui.isHost && s.pending == null && phase !== 'over'
      ? `<div class="modes">${Object.entries(MODES).map(([k, d]) =>
          `<button class="mode ${k === s.mode ? 'sel' : ''}" data-mode="${k}">${k === 'auto' ? '⚡' : '🤫'}<small>${esc(d)}</small></button>`).join('')}</div>`
      : `<p class="muted">${esc(MODES[s.mode])}</p>`;

    let body;
    if (phase === 'lobby') {
      const picker = ui.isHost
        ? `<div class="pats">${Object.entries(PATTERNS).map(([k, p]) =>
            `<button class="pat ${k === s.pattern ? 'sel' : ''}" data-pat="${k}">${preview(k === 'custom' ? s.custom : p.cells ?? p.preview)}<small>${p.name}</small></button>`).join('')}</div>`
        : patNow;
      const editor = ui.isHost && s.pattern === 'custom'
        ? `<div class="editor"><p class="muted">Tap the squares players must complete to win. The ★ is free.</p>
            <div class="bingo">${LETTERS.map(l => `<div class="bh" style="background:${COLORS[l]}">${l}</div>`).join('')}${
              Array.from({ length: 25 }, (_, i) => i === 12
                ? '<div class="cell hit">★</div>'
                : `<button class="cell ed ${s.custom.includes(i) ? 'on' : ''}" data-cell="${i}" aria-pressed="${s.custom.includes(i)}"></button>`).join('')}</div>
            <div class="row"><button class="ghost" data-fill="none">Clear</button><button class="ghost" data-fill="all">Select all</button></div>
            ${customOk(s) ? '' : '<p class="err">Pick at least one square to continue.</p>'}</div>`
        : '';
      const cardsCtl = ui.isHost
        ? `<div class="cardset"><div class="cs-all"><span>Everyone:</span>${[1, 2, 3].map(n => `<button class="ghost" data-all="${n}">${n} card${n > 1 ? 's' : ''}</button>`).join('')}</div>
            ${ui.players.map(p => `<div class="cs-row"><span>${nameOf(p.id)}</span>
              <button class="ghost" data-cnt="${esc(p.id)}" data-d="-1" ${countOf(s, p.id) <= 1 ? 'disabled' : ''}>−</button><b>${countOf(s, p.id)}</b>
              <button class="ghost" data-cnt="${esc(p.id)}" data-d="1" ${countOf(s, p.id) >= MAX_CARDS ? 'disabled' : ''}>+</button></div>`).join('')}</div>`
        : counts;
      body = `<p class="muted">Shuffle your cards until you like them. Once the host starts, cards are locked.</p>
        <h3>Win pattern</h3>${picker}${editor}
        <h3>How numbers are drawn</h3>${modeButtons}
        <h3>Cards per player</h3>${cardsCtl}
        <h3>Your card${myCount > 1 ? 's' : ''}</h3>${myCardsHtml(s, ui, called, target, shuffledAt, null, true)}
        ${ui.isHost ? `<button id="start" class="${customOk(s) ? '' : 'disabled'}" ${customOk(s) ? '' : 'disabled'} style="width:100%;margin-top:10px">Start game</button>`
          : '<p class="muted">Waiting for the host to start…</p>'}`;
    } else {
      const letter = s.last ? letterOf(s.last) : '';
      const winCards = phase === 'over' ? s.winners.map(w => `<div class="wcard ${w.id === ui.me ? 'me' : ''}">
          <div class="wname">${w.id === ui.me ? '🏆 You' : `🎉 ${nameOf(w.id)}`}${countOf(s, w.id) > 1 ? ` · card ${w.k + 1}` : ''}</div>
          ${cardHtml(cardOf(s, w.id, w.k), called, { win: new Set(w.cells), mini: true })}</div>`).join('') : '';

      // The host's roll controls
      let hostPanel = '';
      if (ui.isHost && phase !== 'over') {
        if (s.mode === 'auto') {
          hostPanel = `<button id="call" style="width:100%" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : 'Call next number'}</button>`;
        } else if (secret) {
          const L = letterOf(secret);
          hostPanel = `<div class="secret"><div class="muted">🤫 Only you can see this number</div>
            <div class="big"><span style="color:${COLORS[L]}">${L}</span> ${secret}</div>
            <p class="muted">Announce it, then reveal it to everyone.</p>
            <button id="reveal" style="width:100%">📣 Reveal to everyone</button></div>`;
        } else {
          hostPanel = `<button id="roll" style="width:100%" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : '🎲 Roll a number'}</button>`;
        }
        hostPanel += modeButtons.includes('data-mode') ? `<details class="mini-mode"><summary>Change draw mode</summary>${modeButtons}</details>` : '';
      }
      const waiting = !ui.isHost && phase !== 'over'
        ? (s.hasPending ? '<div class="pending"><span>?</span><p>The host rolled a number… wait for the announcement!</p></div>'
          : '<p class="muted">The host calls the numbers. Your cards mark themselves and you win automatically!</p>') : '';
      body = `${patNow}
        <div class="lastnum"><span class="lbl">${s.called.length} called</span>
          <div class="big">${s.last ? `<span style="color:${COLORS[letter]}">${letter}</span> ${s.last}` : '—'}</div></div>
        ${phase === 'over' ? `<div class="winners"><div class="bingo-banner">${myWin ? 'BINGO! You win! 🎉' : 'BINGO! 🎉'}</div>
          <p>${s.winners.map(w => nameOf(w.id)).join(' & ')} completed the pattern.</p><div class="wcards">${winCards}</div></div>` : ''}
        ${hostPanel}${waiting}
        ${numberBoard(s, called)}
        <h3>Cards in play</h3>${counts}
        ${phase === 'over' && myWin && myCount === 1 ? '' : `<h3>Your card${myCount > 1 ? 's' : ''}</h3>${myCardsHtml(s, ui, called, target, shuffledAt, phase === 'over' ? myWin : null, false)}`}
        ${ui.isHost && phase === 'over' ? '<button id="reset" style="width:100%">Play again</button>' : ''}`;
    }

    el.innerHTML = `<h2>Bingo</h2>${body}`;
    el.querySelectorAll('[data-pat]').forEach(b => b.onclick = () => ui.act(b.dataset.pat === 'custom' ? 'custom' : 'pattern', b.dataset.pat === 'custom' ? { cells: s.custom } : { id: b.dataset.pat }));
    el.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
      const i = +b.dataset.cell;
      ui.act('custom', { cells: s.custom.includes(i) ? s.custom.filter(x => x !== i) : [...s.custom, i] });
    });
    el.querySelectorAll('[data-fill]').forEach(b => b.onclick = () =>
      ui.act('custom', { cells: b.dataset.fill === 'all' ? Array.from({ length: 25 }, (_, i) => i).filter(i => i !== 12) : [] }));
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => ui.act('mode', { mode: b.dataset.mode }));
    el.querySelectorAll('[data-cnt]').forEach(b => b.onclick = () => ui.act('cards', { id: b.dataset.cnt, count: countOf(s, b.dataset.cnt) + +b.dataset.d }));
    el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => ui.act('cards', { id: '*', count: +b.dataset.all }));
    el.querySelectorAll('[data-shuf]').forEach(b => b.onclick = () => ui.act('shuffle', b.dataset.shuf === 'all' ? {} : { k: +b.dataset.shuf }));
    el.querySelector('#start')?.addEventListener('click', () => { sfx('pop'); ui.act('start'); });
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
    el.querySelector('#call')?.addEventListener('click', () => { el._busyUntil = Date.now() + BALL_MS; rerenderAfter(el, this); ui.act('call'); });
    el.querySelector('#roll')?.addEventListener('click', () => { el._busyUntil = Date.now() + BALL_MS; rerenderAfter(el, this); ui.act('roll'); });
    el.querySelector('#reveal')?.addEventListener('click', () => ui.act('reveal'));
  },
};

// All of the viewer's cards, each with its own shuffle button before the game and highlighting after.
function myCardsHtml(s, ui, called, target, shuffledAt, win, lobby) {
  const n = countOf(s, ui.me);
  const cards = Array.from({ length: n }, (_, k) => {
    const winning = win && win.k === k ? new Set(win.cells) : null;
    return `<div class="mycard">${n > 1 ? `<div class="cardlabel">Card ${k + 1} of ${n}</div>` : ''}
      ${cardHtml(cardOf(s, ui.me, k), called, { target, win: winning, shuffled: shuffledAt.has(k) })}
      ${lobby ? `<button class="ghost" data-shuf="${k}">🔀 Shuffle ${n > 1 ? 'this card' : 'my card'}</button>` : ''}</div>`;
  }).join('');
  return `<div class="mycards">${cards}</div>${lobby && n > 1 ? '<button class="ghost" data-shuf="all" style="width:100%;margin-top:8px">🔀 Shuffle all my cards</button>' : ''}`;
}

/* ---------- pieces of the screen ---------- */

const COLORS = { B: '#1971c2', I: '#e03131', N: '#6c4cf5', G: '#2f9e44', O: '#f08c00' };
const BALL_MS = 3200;

const preview = cells => `<span class="pv">${Array.from({ length: 25 }, (_, i) => `<i class="${cells.includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;

function cardHtml(card, called, { target, win, shuffled, mini } = {}) {
  const head = LETTERS.map(l => `<div class="bh" style="background:${COLORS[l]}">${l}</div>`).join('');
  const cells = card.map((n, i) => {
    const hit = n === 0 || called.has(n);
    const cls = ['cell', hit ? 'hit' : '', win?.has(i) ? 'win' : '', !win && target?.has(i) ? 'target' : '', shuffled ? 'shuf' : ''].join(' ');
    return `<div class="${cls}" style="--i:${i}">${n === 0 ? '★' : n}</div>`;
  }).join('');
  return `<div class="bingo ${mini ? 'mini' : ''}">${head}${cells}</div>`;
}

function numberBoard(s, called) {
  return `<div class="nb">${LETTERS.map((L, ci) => `<div class="nb-row"><b style="background:${COLORS[L]}">${L}</b>${
    Array.from({ length: 15 }, (_, k) => {
      const n = ci * 15 + k + 1;
      return `<span class="${called.has(n) ? 'on' : ''} ${n === s.last ? 'last' : ''}" style="--c:${COLORS[L]}">${n}</span>`;
    }).join('')}</div>`).join('')}</div>`;
}

// Re-render once the ball animation is over so buttons re-enable and winners appear.
function rerenderAfter(el, game) {
  clearTimeout(el._rt);
  el._rt = setTimeout(() => { if (el.isConnected && el._latest) game.render(el, el._latest.s, el._latest.ui); }, BALL_MS + 30);
}

/* ---------- the ball draw ---------- */
// A full-screen overlay: the ball drops in and bounces, "rolls" through random numbers and colours
// like a slot machine, then lands on the real number with a ring and spark burst before flying off.

let stopBall = null;

function showBall(n, { secret = false } = {}) {
  stopBall?.();
  const letter = letterOf(n);
  const palette = Object.values(COLORS);
  const o = document.createElement('div');
  o.className = `bb-overlay ${secret ? 'secret' : ''}`;
  o.style.setProperty('--c', COLORS[letter]);
  o.innerHTML = `
    <div class="bb-rain">${Array.from({ length: 14 }, () => {
      const size = 10 + Math.random() * 16;
      return `<i style="left:${Math.random() * 100}%;width:${size}px;height:${size}px;background:${palette[Math.floor(Math.random() * 5)]};animation-delay:${(Math.random() * 0.45).toFixed(2)}s"></i>`;
    }).join('')}</div>
    <div class="bb-stage">
      <div class="bb-ring"></div>
      <div class="bb-sparks">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${120 + Math.random() * 70}px"></i>`).join('')}</div>
      <div class="bb-ball"><div class="bb-disc"><span class="bb-letter">${letter}</span><span class="bb-num">${n}</span></div></div>
      ${secret ? '<div class="bb-secret">🤫 Only you can see this</div>' : ''}
    </div>`;
  document.body.append(o);

  if (reduceMotion()) {
    sfx('ding');
    const t = setTimeout(() => o.remove(), 1800);
    stopBall = () => { clearTimeout(t); o.remove(); };
    return;
  }

  const ball = o.querySelector('.bb-ball');
  const numEl = o.querySelector('.bb-num');
  const letterEl = o.querySelector('.bb-letter');
  numEl.textContent = '?';
  letterEl.textContent = '';
  const timers = [];
  let roll = null;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  at(560, () => sfx('thud'));
  at(750, () => {
    ball.classList.add('rolling');
    let k = 0;
    roll = setInterval(() => {
      const r = 1 + Math.floor(Math.random() * 75);
      numEl.textContent = r;
      letterEl.textContent = letterOf(r);
      o.style.setProperty('--c', COLORS[letterOf(r)]);
      if (k++ % 2 === 0) sfx('tick');
    }, 70);
  });
  at(1700, () => {
    clearInterval(roll);
    numEl.textContent = n;
    letterEl.textContent = letter;
    o.style.setProperty('--c', COLORS[letter]);
    ball.classList.remove('rolling');
    o.classList.add('landed');
    sfx('ding');
  });
  at(2750, () => o.classList.add('leaving'));
  at(BALL_MS + 50, () => { o.remove(); stopBall = null; });
  stopBall = () => { timers.forEach(clearTimeout); clearInterval(roll); o.remove(); stopBall = null; };
}
