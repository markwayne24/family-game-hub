const BANK = [
  ['How many days are in a leap year?', ['364', '365', '366', '367'], 2],
  ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1],
  ['What is the largest animal on Earth?', ['Elephant', 'Blue whale', 'Giraffe', 'Great white shark'], 1],
  ['How many colors are in a rainbow?', ['5', '6', '7', '8'], 2],
  ['What do bees make?', ['Milk', 'Silk', 'Honey', 'Butter'], 2],
  ['Which ocean is the largest?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
  ['How many legs does a spider have?', ['6', '8', '10', '12'], 1],
  ['What is the capital of Japan?', ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'], 2],
  ['Which fruit is traditionally used to make guacamole?', ['Mango', 'Avocado', 'Banana', 'Papaya'], 1],
  ['What is H2O commonly called?', ['Salt', 'Water', 'Oxygen', 'Hydrogen'], 1],
  ['How many continents are there?', ['5', '6', '7', '8'], 2],
  ['Which animal is known as the King of the Jungle?', ['Tiger', 'Lion', 'Bear', 'Wolf'], 1],
  ['What color do you get mixing blue and yellow?', ['Green', 'Purple', 'Orange', 'Brown'], 0],
  ['How many minutes are in an hour?', ['30', '45', '60', '100'], 2],
  ['Which is the tallest mountain above sea level?', ['K2', 'Mount Everest', 'Mount Fuji', 'Kilimanjaro'], 1],
  ['What gas do plants take in from the air?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], 2],
  ['How many players are on a soccer team on the field?', ['9', '10', '11', '12'], 2],
  ['What is the largest country by area?', ['Canada', 'China', 'USA', 'Russia'], 3],
  ['Which instrument has black and white keys?', ['Guitar', 'Piano', 'Drum', 'Flute'], 1],
  ['What is the hardest natural substance?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2],
];
const ROUNDS = 8;
const POINTS = 100;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function reveal(s, env) {
  const q = s.qs[s.i];
  const scores = { ...s.scores };
  for (const [id, c] of Object.entries(s.answers)) if (c === q.a) scores[id] = (scores[id] ?? 0) + POINTS;
  return { ...s, phase: 'reveal', scores };
}

export const trivia = {
  id: 'trivia',
  name: 'Trivia',
  emoji: '🧠',

  init() {
    const qs = shuffle(BANK).slice(0, ROUNDS).map(([q, c, a]) => ({ q, c, a }));
    return { phase: 'question', i: 0, qs, answers: {}, scores: {} };
  },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'restart' && isHost) return this.init();
    if (a.type === 'answer' && s.phase === 'question') {
      const c = a.data?.choice;
      if (s.answers[a.from] !== undefined || !(c >= 0 && c < 4)) return s;
      const next = { ...s, answers: { ...s.answers, [a.from]: c } };
      return env.players.every(p => next.answers[p.id] !== undefined) ? reveal(next, env) : next;
    }
    if (a.type === 'reveal' && isHost && s.phase === 'question') return reveal(s, env);
    if (a.type === 'next' && isHost && s.phase === 'reveal') {
      return s.i + 1 < s.qs.length ? { ...s, phase: 'question', i: s.i + 1, answers: {} } : { ...s, phase: 'end' };
    }
    return s;
  },

  // Hide correct answers and other players' picks until the reveal.
  view(s) {
    if (s.phase !== 'question') return s;
    return {
      ...s,
      qs: s.qs.map(({ a, ...rest }) => rest),
      answers: Object.fromEntries(Object.keys(s.answers).map(id => [id, true])),
    };
  },

  render(el, s, ui) {
    const board = () => {
      const rows = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
        .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');
      return `<table class="table">${rows || '<tr><td class="muted">No points yet</td></tr>'}</table>`;
    };
    if (s.phase === 'end') {
      el.innerHTML = `<h2>🏆 Final scores</h2>${board()}${ui.isHost ? '<button id="again">Play again</button>' : ''}`;
      el.querySelector('#again')?.addEventListener('click', () => ui.act('restart'));
      return;
    }
    const q = s.qs[s.i];
    const mine = s.answers[ui.me];
    const revealed = s.phase === 'reveal';
    const choices = q.c.map((text, k) => {
      let cls = 'choice';
      if (revealed) cls += k === q.a ? ' right' : (s.answers[ui.me] === k ? ' wrong' : '');
      else if (this._picked === k && mine !== undefined) cls += ' picked';
      return `<button class="${cls}" data-k="${k}" ${mine !== undefined || revealed ? 'disabled' : ''}>${ui.esc(text)}</button>`;
    }).join('');
    const answered = Object.keys(s.answers).length;
    el.innerHTML = `
      <p class="muted">Question ${s.i + 1} of ${s.qs.length} · ${answered}/${ui.players.length} answered</p>
      <h2>${ui.esc(q.q)}</h2>${choices}
      ${revealed ? `<h3>Scores</h3>${board()}` : ''}
      ${ui.isHost ? (revealed
        ? `<button id="next">${s.i + 1 < s.qs.length ? 'Next question' : 'Final scores'}</button>`
        : '<button class="ghost" id="reveal">Reveal now</button>') : ''}`;
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { this._picked = +b.dataset.k; ui.act('answer', { choice: +b.dataset.k }); });
    el.querySelector('#next')?.addEventListener('click', () => ui.act('next'));
    el.querySelector('#reveal')?.addEventListener('click', () => ui.act('reveal'));
  },
};
