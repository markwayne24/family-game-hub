const EMOJI = ['🪨', '📄', '✂️'];
const NAMES = ['Rock', 'Paper', 'Scissors'];
const beats = (a, b) => (a - b + 3) % 3 === 1;

function reveal(s) {
  const scores = { ...s.scores };
  const gained = {};
  const ids = Object.keys(s.picks);
  for (const id of ids) {
    gained[id] = ids.filter(o => o !== id && beats(s.picks[id], s.picks[o])).length;
    scores[id] = (scores[id] ?? 0) + gained[id];
  }
  return { ...s, phase: 'reveal', scores, gained };
}

let mine = { round: 0, k: null };

export const rps = {
  id: 'rps',
  name: 'Rock Paper Scissors',
  emoji: '✂️',

  init() { return { phase: 'pick', round: 1, picks: {}, scores: {}, gained: {} }; },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init();
    if (a.type === 'pick' && s.phase === 'pick') {
      const k = a.data?.choice;
      if (s.picks[a.from] !== undefined || !(k >= 0 && k < 3)) return s;
      const next = { ...s, picks: { ...s.picks, [a.from]: k } };
      return env.players.every(p => next.picks[p.id] !== undefined) ? reveal(next) : next;
    }
    if (a.type === 'reveal' && isHost && s.phase === 'pick') return Object.keys(s.picks).length ? reveal(s) : s;
    if (a.type === 'next' && isHost && s.phase === 'reveal') return { ...s, phase: 'pick', round: s.round + 1, picks: {}, gained: {} };
    return s;
  },

  // Hide what people picked until everyone has chosen.
  view(s) {
    if (s.phase !== 'pick') return s;
    return { ...s, picks: Object.fromEntries(Object.keys(s.picks).map(id => [id, true])) };
  },

  render(el, s, ui) {
    if (mine.round !== s.round) mine = { round: s.round, k: null };
    const picked = s.picks[ui.me] !== undefined;
    let body;
    if (s.phase === 'pick') {
      body = `<div class="row">${EMOJI.map((e, k) =>
        `<button class="grow rpsbtn ${mine.k === k ? 'picked' : ''}" data-k="${k}" ${picked ? 'disabled' : ''}>${e}<br>${NAMES[k]}</button>`).join('')}</div>
        <p class="muted">${Object.keys(s.picks).length}/${ui.players.length} chosen${picked ? ' · waiting for the others…' : ''}</p>
        ${ui.isHost ? '<button class="ghost" id="reveal">Reveal now</button>' : ''}`;
    } else {
      const rows = Object.keys(s.picks).map(id =>
        `<tr><td>${ui.esc(ui.nameOf(id))}</td><td>${EMOJI[s.picks[id]]}</td><td>+${s.gained[id] ?? 0}</td></tr>`).join('');
      body = `<table class="table">${rows}</table>${ui.isHost ? '<button id="next">Next round</button>' : ''}`;
    }
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${ui.esc(ui.nameOf(id))}</td><td><b>${pts}</b></td></tr>`).join('');
    el.innerHTML = `
      <h2>Rock Paper Scissors</h2>
      <p class="muted">Round ${s.round}. Beat each opponent to score a point per win.</p>
      ${body}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>
      ${ui.isHost ? '<button class="ghost" id="reset">Reset scores</button>' : ''}`;
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { mine.k = +b.dataset.k; ui.act('pick', { choice: +b.dataset.k }); });
    el.querySelector('#reveal')?.addEventListener('click', () => ui.act('reveal'));
    el.querySelector('#next')?.addEventListener('click', () => ui.act('next'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
