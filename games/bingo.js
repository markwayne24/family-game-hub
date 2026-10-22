import { fresh, memo, confetti, sfx } from './fx.js';

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
};

// The cells that make a card a winner for this pattern, or null if it isn't one yet.
export function winCells(card, called, pattern) {
  const set = new Set(called);
  const done = i => card[i] === 0 || set.has(card[i]);
  const cells = (PATTERNS[pattern] ?? PATTERNS.line).cells;
  if (!cells) {
    const hit = LINES.filter(l => l.every(done));
    return hit.length ? [...new Set(hit.flat())] : null;
  }
  return cells.every(done) ? cells : null;
}

const seedOf = (s, id) => s.seeds[id] ?? 0;
const cardOf = (s, id) => cardFor(id, seedOf(s, id));
const randomSeed = () => 1 + Math.floor(Math.random() * 1e9);

export const bingo = {
  id: 'bingo',
  name: 'Bingo',
  emoji: '🎱',
  options: [{ key: 'pattern', label: 'Win pattern', choices: Object.entries(PATTERNS).map(([k, p]) => [k, p.name]) }],

  init(env, opts) {
    return { phase: 'lobby', pattern: PATTERNS[opts?.pattern] ? opts.pattern : 'line', seeds: {}, called: [], last: null, winners: [] };
  },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return { ...this.init(env, { pattern: s.pattern }), seeds: s.seeds };

    if (s.phase === 'lobby') {
      if (a.type === 'pattern' && isHost && PATTERNS[a.data?.id]) return { ...s, pattern: a.data.id };
      if (a.type === 'shuffle') {
        // A new card must never match anyone else's.
        const ids = new Set([...env.players.map(p => p.id), ...Object.keys(s.seeds)]);
        ids.delete(a.from);
        const taken = new Set([...ids].map(id => cardKey(cardOf(s, id))));
        let seed;
        do { seed = randomSeed(); } while (taken.has(cardKey(cardFor(a.from, seed))));
        return { ...s, seeds: { ...s.seeds, [a.from]: seed } };
      }
      if (a.type === 'start' && isHost) {
        const seeds = { ...s.seeds };
        const seen = new Set();
        for (const p of env.players) {
          let seed = seeds[p.id] ?? 0;
          while (seen.has(cardKey(cardFor(p.id, seed)))) seed = randomSeed();
          seeds[p.id] = seed;
          seen.add(cardKey(cardFor(p.id, seed)));
        }
        return { ...s, seeds, phase: 'play', called: [], last: null, winners: [] };
      }
    }

    if (s.phase === 'play' && a.type === 'call' && isHost) {
      const left = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !s.called.includes(n));
      if (!left.length) return s;
      const n = left[Math.floor(Math.random() * left.length)];
      const called = [...s.called, n];
      // Everyone whose card now completes the pattern wins automatically, no button needed.
      const winners = env.players
        .map(p => ({ id: p.id, cells: winCells(cardOf(s, p.id), called, s.pattern) }))
        .filter(w => w.cells);
      return { ...s, called, last: n, winners, phase: winners.length ? 'over' : 'play' };
    }
    return s;
  },

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
    // Let the ball finish its animation before announcing the winners.
    const holding = Date.now() < (el._holdUntil ?? 0);
    const phase = s.phase === 'over' && holding ? 'play' : s.phase;

    const mySeed = seedOf(s, ui.me);
    const prevSeed = memo(el, 'seed', mySeed);
    const shuffled = prevSeed !== undefined && prevSeed !== mySeed;
    if (shuffled) sfx('flip');
    const myCard = cardFor(ui.me, mySeed);
    const mine = phase === 'over' ? s.winners.find(w => w.id === ui.me) : null;
    const pat = PATTERNS[s.pattern] ?? PATTERNS.line;
    const target = new Set(pat.cells ?? []);

    if (phase === 'over' && fresh(el, 'over', s.called.length)) {
      if (mine) { confetti(); sfx('win'); } else sfx('ding');
    }

    const patternPicker = ui.isHost && phase === 'lobby'
      ? `<div class="pats">${Object.entries(PATTERNS).map(([k, p]) =>
          `<button class="pat ${k === s.pattern ? 'sel' : ''}" data-pat="${k}">${preview(p.cells ?? p.preview)}<small>${p.name}</small></button>`).join('')}</div>`
      : `<div class="patnow">${preview(pat.cells ?? pat.preview)}<span><b>${pat.name}</b>${pat.cells ? '' : '<br><small class="muted">Row, column or diagonal</small>'}</span></div>`;

    let body;
    if (phase === 'lobby') {
      body = `<p class="muted">Shuffle your card until you like it. Once the host starts, cards are locked.</p>
        <h3>Win pattern</h3>${patternPicker}
        <h3>Your card</h3>${cardHtml(myCard, called, { target, shuffled })}
        <div class="row"><button id="shuffle" class="grow ghost">🔀 Shuffle my card</button>
          ${ui.isHost ? '<button id="start" class="grow">Start game</button>' : ''}</div>
        ${ui.isHost ? '' : '<p class="muted">Waiting for the host to start…</p>'}`;
    } else {
      const busy = Date.now() < (el._busyUntil ?? 0);
      const letter = s.last ? letterOf(s.last) : '';
      const winCards = phase === 'over' ? s.winners.map(w => `<div class="wcard ${w.id === ui.me ? 'me' : ''}">
          <div class="wname">${w.id === ui.me ? '🏆 You' : `🎉 ${ui.esc(ui.nameOf(w.id))}`}</div>
          ${cardHtml(cardOf(s, w.id), called, { win: new Set(w.cells), mini: true })}</div>`).join('') : '';
      body = `<div class="patnow">${preview(pat.cells ?? pat.preview)}<span><b>${pat.name}</b></span></div>
        <div class="lastnum"><span class="lbl">${s.called.length} called</span>
          <div class="big">${s.last ? `<span style="color:${COLORS[letter]}">${letter}</span> ${s.last}` : '—'}</div></div>
        ${phase === 'over' ? `<div class="winners"><div class="bingo-banner">${mine ? 'BINGO! You win! 🎉' : 'BINGO! 🎉'}</div>
          <p>${s.winners.map(w => ui.esc(ui.nameOf(w.id))).join(' & ')} completed the pattern.</p>
          <div class="wcards">${winCards}</div></div>` : ''}
        ${numberBoard(s, called)}
        ${mine ? '' : `<h3>Your card</h3>${cardHtml(myCard, called, { target })}`}
        ${ui.isHost ? `<div class="row">${phase === 'over'
          ? '<button id="reset" class="grow">Play again</button>'
          : `<button id="call" class="grow" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : 'Call next number'}</button>`}</div>`
          : phase === 'over' ? '' : '<p class="muted">The host calls the numbers. Your card marks itself, and you win automatically!</p>'}`;
    }

    el.innerHTML = `<h2>Bingo</h2>${body}`;
    el.querySelectorAll('[data-pat]').forEach(b => b.onclick = () => ui.act('pattern', { id: b.dataset.pat }));
    el.querySelector('#shuffle')?.addEventListener('click', () => ui.act('shuffle'));
    el.querySelector('#start')?.addEventListener('click', () => { sfx('pop'); ui.act('start'); });
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
    el.querySelector('#call')?.addEventListener('click', () => { el._busyUntil = Date.now() + BALL_MS; rerenderAfter(el, this); ui.act('call'); });
  },
};

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

// Placeholder until the animated draw lands in the next change.
function showBall() {}
