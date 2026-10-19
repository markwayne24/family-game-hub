import { fresh, memo, confetti } from './fx.js';

const LETTERS = ['B', 'I', 'N', 'G', 'O'];

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Each player's card is derived from their id, so the host can verify claims without trusting the client.
export function cardFor(id) {
  const r = rng(id);
  const cols = LETTERS.map((_, c) => {
    const nums = Array.from({ length: 15 }, (_, k) => c * 15 + k + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    return nums.slice(0, 5);
  });
  cols[2][2] = 0; // free space
  return Array.from({ length: 25 }, (_, i) => cols[i % 5][Math.floor(i / 5)]);
}

const LINES = [
  ...Array.from({ length: 5 }, (_, r) => [0, 1, 2, 3, 4].map(c => r * 5 + c)),
  ...Array.from({ length: 5 }, (_, c) => [0, 1, 2, 3, 4].map(r => r * 5 + c)),
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];

function hasBingo(card, called) {
  const set = new Set(called);
  return LINES.some(l => l.every(i => card[i] === 0 || set.has(card[i])));
}

export const bingo = {
  id: 'bingo',
  name: 'Bingo',
  emoji: '🎱',

  init() { return { called: [], last: null, winner: null, bad: null }; },

  reduce(s, a, env) {
    if (a.from === env.hostId && a.type === 'reset') return this.init();
    if (a.from === env.hostId && a.type === 'call' && !s.winner) {
      const left = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !s.called.includes(n));
      if (!left.length) return s;
      const n = left[Math.floor(Math.random() * left.length)];
      return { ...s, called: [...s.called, n], last: n, bad: null };
    }
    if (a.type === 'claim' && !s.winner) {
      return hasBingo(cardFor(a.from), s.called) ? { ...s, winner: a.from } : { ...s, bad: { id: a.from, n: s.called.length } };
    }
    return s;
  },

  render(el, s, ui) {
    const card = cardFor(ui.me);
    const called = new Set(s.called);
    const prevCalled = memo(el, 'called', s.called);
    const newNum = prevCalled !== undefined && prevCalled.length !== s.called.length;
    if (s.winner && fresh(el, 'winner', s.winner)) confetti();
    const letter = s.last ? LETTERS[Math.floor((s.last - 1) / 15)] : '';
    const notYet = s.bad && s.bad.id === ui.me && s.bad.n === s.called.length;
    el.innerHTML = `
      <h2>Bingo</h2>
      <div class="big ${newNum ? 'pop' : ''}">${s.last ? `${letter} ${s.last}` : '—'}</div>
      <p class="muted" style="text-align:center">${s.called.length} called${s.winner ? '' : ''}</p>
      ${s.winner ? `<p class="big" style="font-size:1.8rem">🎉 ${ui.esc(ui.nameOf(s.winner))} got BINGO!</p>` : ''}
      <div class="bingo">${LETTERS.map(l => `<div style="background:none">${l}</div>`).join('')}
        ${card.map(n => `<div class="${n === 0 || called.has(n) ? 'hit' : ''} ${prevCalled && called.has(n) && !prevCalled.includes(n) ? 'stamp' : ''}">${n === 0 ? '★' : n}</div>`).join('')}</div>
      ${notYet ? `<p class="err ${fresh(el, 'bad', s.called.length) ? 'shake' : ''}" style="text-align:center">Not yet. Keep playing!</p>` : ''}
      <div class="row">
        <button id="claim" class="grow" ${s.winner ? 'disabled' : ''}>BINGO!</button>
        ${ui.isHost ? `<button id="call" class="grow" ${s.winner ? 'disabled' : ''}>Call next number</button>
        <button id="reset" class="ghost">New game</button>` : ''}
      </div>
      <p class="muted">Called: ${s.called.join(', ') || 'none yet'}</p>`;
    el.querySelector('#claim').onclick = () => ui.act('claim');
    el.querySelector('#call')?.addEventListener('click', () => ui.act('call'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
