import { fresh, memo, confetti, sfx } from './fx.js';

const WORDS = {
  Animals: ['elephant', 'giraffe', 'penguin', 'dolphin', 'butterfly', 'kangaroo', 'crocodile', 'flamingo', 'octopus', 'squirrel'],
  Food: ['pineapple', 'spaghetti', 'chocolate', 'sandwich', 'watermelon', 'pancake', 'strawberry', 'hamburger', 'noodles', 'coconut'],
  Places: ['airport', 'library', 'hospital', 'playground', 'mountain', 'beach', 'museum', 'island', 'volcano', 'garden'],
  Things: ['umbrella', 'keyboard', 'telescope', 'backpack', 'bicycle', 'scissors', 'lantern', 'blanket', 'computer', 'telephone'],
};
const MAX_WRONG = 6;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function newWord(s) {
  const cat = Object.keys(WORDS)[Math.floor(Math.random() * Object.keys(WORDS).length)];
  const pool = WORDS[cat].filter(w => !s.used.includes(w));
  const list = pool.length ? pool : WORDS[cat];
  const word = list[Math.floor(Math.random() * list.length)];
  return { ...s, word, cat, guessed: [], wrong: 0, phase: 'play', used: [...s.used, word], round: s.round + 1 };
}

// Gallows plus six body parts, drawn in order as wrong guesses pile up.
const PARTS = [
  '<circle cx="150" cy="60" r="16"/>',
  '<line x1="150" y1="76" x2="150" y2="130"/>',
  '<line x1="150" y1="90" x2="125" y2="115"/>',
  '<line x1="150" y1="90" x2="175" y2="115"/>',
  '<line x1="150" y1="130" x2="130" y2="165"/>',
  '<line x1="150" y1="130" x2="170" y2="165"/>',
];

export const hangman = {
  id: 'hangman',
  inProgress: s => s.phase === 'play' && s.guessed.length > 0,
  name: 'Hangman',
  emoji: '🪢',

  init() { return newWord({ used: [], scores: {}, round: 0 }); },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init();
    if (a.type === 'next' && isHost && s.phase !== 'play') return newWord(s);
    if (a.type !== 'guess' || s.phase !== 'play') return s;
    const letter = String(a.data?.letter ?? '').toLowerCase();
    if (!/^[a-z]$/.test(letter) || s.guessed.includes(letter)) return s;
    const guessed = [...s.guessed, letter];
    const scores = { ...s.scores };
    if (s.word.includes(letter)) {
      const hits = [...s.word].filter(c => c === letter).length;
      scores[a.from] = (scores[a.from] ?? 0) + 10 * hits;
      const solved = [...s.word].every(c => guessed.includes(c));
      if (solved) scores[a.from] += 50;
      return { ...s, guessed, scores, phase: solved ? 'won' : 'play' };
    }
    const wrong = s.wrong + 1;
    return { ...s, guessed, wrong, scores, phase: wrong >= MAX_WRONG ? 'lost' : 'play' };
  },

  // The word stays hidden until the round ends.
  view(s) {
    const pattern = [...s.word].map(c => (s.guessed.includes(c) ? c : null));
    const { word, used, ...pub } = s;
    return { ...pub, pattern, ...(s.phase === 'play' ? {} : { word }) };
  },

  render(el, s, ui) {
    const prevWrong = memo(el, 'wrong', s.wrong);
    const prevGuessed = memo(el, 'guessed', s.guessed.length);
    if (s.phase === 'won' && fresh(el, 'end', `won${s.round}`)) { confetti(); sfx('win'); }
    else if (s.phase === 'lost' && fresh(el, 'end', `lost${s.round}`)) sfx('lose');
    else if (prevWrong !== undefined && s.wrong > prevWrong) sfx('buzz');
    else if (prevGuessed !== undefined && s.guessed.length > prevGuessed) sfx('ding');

    const word = s.pattern.map((c, i) => `<span class="hm-letter ${c ? 'on' : ''}">${ui.esc(c ?? (s.word ? s.word[i] : '')) || '&nbsp;'}</span>`).join('');
    const keys = LETTERS.map(l => {
      const used = s.guessed.includes(l);
      const hit = used && s.pattern.includes(l);
      return `<button data-l="${l}" class="key ${used ? (hit ? 'hit' : 'miss') : ''}" ${used || s.phase !== 'play' ? 'disabled' : ''}>${l}</button>`;
    }).join('');
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');
    el.innerHTML = `
      <h2>Hangman</h2>
      <p class="muted">Everyone guesses together. Category: <b>${ui.esc(s.cat)}</b> · ${MAX_WRONG - s.wrong} misses left</p>
      <svg viewBox="0 0 220 190" class="hm" aria-hidden="true">
        <g class="gallows"><line x1="30" y1="180" x2="130" y2="180"/><line x1="60" y1="180" x2="60" y2="20"/><line x1="60" y1="20" x2="150" y2="20"/><line x1="150" y1="20" x2="150" y2="44"/></g>
        ${PARTS.map((p, i) => `<g class="part ${i < s.wrong ? 'show' : ''} ${prevWrong !== undefined && i === s.wrong - 1 && s.wrong > prevWrong ? 'draw' : ''}">${p}</g>`).join('')}
      </svg>
      <div class="hm-word">${word}</div>
      ${s.phase === 'won' ? '<p><b>🎉 You got it!</b></p>' : s.phase === 'lost' ? `<p><b>😢 Out of guesses. The word was ${ui.esc(s.word)}.</b></p>` : ''}
      <div class="keys">${keys}</div>
      ${ui.isHost ? `<div class="row">${s.phase !== 'play' ? '<button id="next">Next word</button>' : ''}<button class="ghost" id="reset">New game</button></div>` : ''}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>`;
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => ui.act('guess', { letter: b.dataset.l }));
    el.querySelector('#next')?.addEventListener('click', () => ui.act('next'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
