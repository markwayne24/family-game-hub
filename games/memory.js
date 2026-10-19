import { fresh, memo, confetti } from './fx.js';

const EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐰', '🐻', '🦄', '🐙'];
const PAIRS = 8;
const CHECK_MS = 1100;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const current = s => s.order[s.turn % s.order.length];

export const memory = {
  id: 'memory',
  name: 'Memory Match',
  emoji: '🃏',

  init({ players }) {
    const faces = shuffle(EMOJIS).slice(0, PAIRS);
    return {
      phase: 'play', order: players.map(p => p.id), turn: 0,
      cards: shuffle([...faces, ...faces]), flipped: [], matched: {}, scores: {}, until: null,
    };
  },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init(env);
    if (!s.order.length) return s;
    if (a.type === 'skip' && isHost && s.phase !== 'end') return { ...s, phase: 'play', flipped: [], until: null, turn: s.turn + 1 };

    if (a.type === 'flip' && s.phase === 'play' && a.from === current(s)) {
      const i = a.data?.i;
      if (!(i >= 0 && i < s.cards.length) || s.matched[i] !== undefined || s.flipped.includes(i)) return s;
      const flipped = [...s.flipped, i];
      return flipped.length === 2 ? { ...s, flipped, phase: 'check', until: env.now + CHECK_MS } : { ...s, flipped };
    }

    if (a.type === 'timeout' && isHost && s.phase === 'check' && env.now >= s.until - 100) {
      const [i, j] = s.flipped;
      if (s.cards[i] === s.cards[j]) {
        const who = current(s);
        const matched = { ...s.matched, [i]: who, [j]: who };
        const scores = { ...s.scores, [who]: (s.scores[who] ?? 0) + 1 };
        const done = Object.keys(matched).length === s.cards.length;
        return { ...s, matched, scores, flipped: [], until: null, phase: done ? 'end' : 'play' };
      }
      return { ...s, flipped: [], until: null, phase: 'play', turn: s.turn + 1 };
    }
    return s;
  },

  deadline: s => (s.phase === 'check' ? s.until : null),

  // Only flipped or matched faces are sent to players.
  view(s) {
    return { ...s, cards: s.cards.map((c, i) => (s.matched[i] !== undefined || s.flipped.includes(i) ? c : null)) };
  },

  render(el, s, ui) {
    const shown = new Set(s.cards.flatMap((c, i) => (c !== null ? [i] : [])));
    const prevShown = memo(el, 'shown', shown);
    const prevMatched = memo(el, 'matched', s.matched);
    if (s.phase === 'end' && fresh(el, 'end', true)) confetti();
    const turnId = s.order.length ? current(s) : null;
    const myTurn = turnId === ui.me && s.phase === 'play';
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');
    el.innerHTML = `
      <h2>Memory Match</h2>
      <p><b>${s.phase === 'end' ? '🏆 All pairs found!' : myTurn ? 'Your turn! Flip two cards.' : `Turn: ${ui.esc(ui.nameOf(turnId))}`}</b></p>
      <div class="mem">${s.cards.map((c, i) => {
        const owned = s.matched[i] !== undefined;
        return `<button data-i="${i}" class="${owned ? 'done' : ''} ${prevShown && c !== null && !prevShown.has(i) ? 'flip' : ''} ${prevMatched && owned && prevMatched[i] === undefined ? 'match' : ''}" ${myTurn && c === null ? '' : 'disabled'}>${c ?? '❓'}</button>`;
      }).join('')}</div>
      <table class="table">${board || '<tr><td class="muted">No pairs yet</td></tr>'}</table>
      ${ui.isHost ? '<div class="row"><button class="ghost" id="skip">Skip turn</button><button class="ghost" id="reset">New game</button></div>' : ''}`;
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => ui.act('flip', { i: +b.dataset.i }));
    el.querySelector('#skip')?.addEventListener('click', () => ui.act('skip'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
