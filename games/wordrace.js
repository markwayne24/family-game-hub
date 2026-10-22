import { fresh, memo, confetti, sfx } from './fx.js';

const ANSWERS = [
  'apple', 'bread', 'chair', 'dance', 'eagle', 'flame', 'grape', 'house', 'juice', 'knife', 'lemon', 'mouse', 'night', 'ocean', 'piano',
  'queen', 'river', 'snake', 'table', 'uncle', 'voice', 'water', 'young', 'zebra', 'beach', 'cloud', 'dream', 'earth', 'field', 'ghost',
  'heart', 'honey', 'jelly', 'light', 'magic', 'money', 'music', 'paper', 'party', 'plant', 'radio', 'robot', 'shirt', 'smile', 'sound',
  'spoon', 'storm', 'sugar', 'sunny', 'tiger', 'toast', 'train', 'truck', 'watch', 'whale', 'wheel', 'world', 'pizza', 'candy', 'bunny',
  'clock', 'cream', 'crown', 'fairy', 'fruit', 'giant', 'glass', 'green', 'happy', 'horse', 'lunch', 'mango', 'movie', 'panda', 'pearl',
  'phone', 'pilot', 'plane', 'rainy', 'salad', 'scarf', 'sheep', 'sleep', 'snack', 'socks', 'stone', 'sweet', 'tooth', 'towel', 'tulip',
  'video', 'wagon',
];
const TRIES = 6;
const LEN = 5;

const isSolved = (s, id) => (s.guesses[id] ?? []).includes(s.answer);
const isDone = (s, id) => isSolved(s, id) || (s.guesses[id]?.length ?? 0) >= TRIES;

export function feedback(guess, answer) {
  const res = Array(LEN).fill('x');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'g';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < LEN; i++) if (res[i] === 'x' && left[guess[i]] > 0) { res[i] = 'y'; left[guess[i]]--; }
  return res;
}

function newRound(s) {
  const pool = ANSWERS.filter(w => !s.used.includes(w));
  const list = pool.length ? pool : ANSWERS;
  const answer = list[Math.floor(Math.random() * list.length)];
  return { ...s, answer, guesses: {}, solved: [], phase: 'play', used: [...s.used, answer], round: s.round + 1 };
}

export const wordrace = {
  id: 'wordrace',
  inProgress: s => s.phase === 'play' && Object.keys(s.guesses).length > 0,
  name: 'Word Race',
  emoji: '🔤',

  init() { return newRound({ used: [], scores: {}, round: 0 }); },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init();
    if (a.type === 'next' && isHost && s.phase === 'reveal') return newRound(s);
    if (a.type === 'reveal' && isHost && s.phase === 'play') return { ...s, phase: 'reveal' };
    if (a.type !== 'guess' || s.phase !== 'play' || isDone(s, a.from)) return s;
    const word = String(a.data?.word ?? '').toLowerCase();
    if (!/^[a-z]{5}$/.test(word)) return s;
    const mine = [...(s.guesses[a.from] ?? []), word];
    const next = { ...s, guesses: { ...s.guesses, [a.from]: mine } };
    if (word === s.answer) {
      const place = s.solved.length;
      next.solved = [...s.solved, a.from];
      next.scores = { ...s.scores, [a.from]: (s.scores[a.from] ?? 0) + Math.max(20, 100 - 20 * place) + 10 * (TRIES - mine.length) };
    }
    return env.players.every(p => isDone(next, p.id)) ? { ...next, phase: 'reveal' } : next;
  },

  // Everyone sees the colours of every guess; only each player sees their own letters (via priv).
  view(s) {
    const fb = Object.fromEntries(Object.entries(s.guesses).map(([id, gs]) => [id, gs.map(g => feedback(g, s.answer))]));
    const { guesses, answer, used, ...pub } = s;
    return { ...pub, fb, ...(s.phase === 'reveal' ? { answer } : {}) };
  },
  priv: s => Object.fromEntries(Object.entries(s.guesses).map(([id, gs]) => [id, { guesses: gs }])),

  render(el, s, ui) {
    const keep = el.querySelector('input');
    const typed = keep?.value ?? '';
    const focused = keep && document.activeElement === keep;

    const mine = ui.priv?.guesses ?? [];
    const myFb = s.fb[ui.me] ?? [];
    const solved = myFb.some(f => f.every(x => x === 'g'));
    const done = solved || mine.length >= TRIES;
    const prevCount = memo(el, 'mine', mine.length);
    if (solved && fresh(el, 'solved', s.round)) { confetti(); sfx('win'); }
    else if (prevCount !== undefined && mine.length > prevCount) sfx('flip');

    const rows = Array.from({ length: TRIES }, (_, r) => {
      const isNew = prevCount !== undefined && r === mine.length - 1 && mine.length > prevCount;
      return `<div class="wr-row">${Array.from({ length: LEN }, (_, c) => {
        const ch = mine[r]?.[c] ?? '';
        const cls = mine[r] ? myFb[r]?.[c] : '';
        return `<span class="wr-tile ${cls} ${isNew ? 'flip' : ''}" style="--i:${c}">${ui.esc(ch)}</span>`;
      }).join('')}</div>`;
    }).join('');
    const others = ui.players.filter(p => p.id !== ui.me).map(p => {
      const f = s.fb[p.id] ?? [];
      return `<div class="wr-other"><span>${ui.esc(p.name)}${s.solved.includes(p.id) ? ' ✅' : ''}</span>
        <div class="wr-mini">${f.map(r => `<div>${r.map(x => `<i class="${x}"></i>`).join('')}</div>`).join('')}</div></div>`;
    }).join('');
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');

    el.innerHTML = `
      <h2>Word Race</h2>
      <p class="muted">Round ${s.round}. Everyone guesses the same 5-letter word. Faster solves score more.</p>
      <div class="wr">${rows}</div>
      ${s.phase === 'play' && !done
        ? `<form id="wf" class="row"><input id="wi" class="grow" maxlength="5" placeholder="5-letter word" autocomplete="off" autocapitalize="off" spellcheck="false"><button>Guess</button></form>`
        : s.phase === 'play' ? `<p><b>${solved ? '🎉 You got it! Waiting for the others…' : 'Out of tries. Waiting for the others…'}</b></p>` : ''}
      ${s.phase === 'reveal' ? `<p><b>The word was ${ui.esc((s.answer ?? '').toUpperCase())}</b></p>` : ''}
      <div class="wr-others">${others}</div>
      ${ui.isHost ? `<div class="row">${s.phase === 'reveal' ? '<button id="next">Next word</button>' : '<button class="ghost" id="reveal">Reveal now</button>'}<button class="ghost" id="reset">New game</button></div>` : ''}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>`;

    const input = el.querySelector('#wi');
    if (input && typed) input.value = typed;
    if (input && focused) input.focus();
    el.querySelector('#wf')?.addEventListener('submit', e => {
      e.preventDefault();
      const word = input.value.trim().toLowerCase();
      if (/^[a-z]{5}$/.test(word)) { ui.act('guess', { word }); input.value = ''; }
      else input.classList.add('bad');
    });
    el.querySelector('#next')?.addEventListener('click', () => ui.act('next'));
    el.querySelector('#reveal')?.addEventListener('click', () => ui.act('reveal'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
