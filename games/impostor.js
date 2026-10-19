const CATEGORIES = {
  Food: ['pizza', 'burger', 'sushi', 'pasta', 'taco', 'salad', 'pancake', 'ice cream'],
  Animals: ['lion', 'dolphin', 'penguin', 'elephant', 'monkey', 'rabbit', 'eagle', 'turtle'],
  Places: ['beach', 'library', 'airport', 'hospital', 'school', 'zoo', 'mall', 'farm'],
  Jobs: ['teacher', 'doctor', 'chef', 'pilot', 'farmer', 'firefighter', 'singer', 'driver'],
  Sports: ['soccer', 'basketball', 'tennis', 'swimming', 'volleyball', 'baseball', 'boxing', 'golf'],
  'Things at home': ['sofa', 'fridge', 'toothbrush', 'blanket', 'mirror', 'lamp', 'pillow', 'kettle'],
};
const MIN_PLAYERS = 3;

const pick = a => a[Math.floor(Math.random() * a.length)];
const norm = t => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function begin(prev, env) {
  if (env.players.length < MIN_PLAYERS) return { phase: 'need', scores: prev.scores ?? {}, round: prev.round ?? 0 };
  const order = shuffle(env.players.map(p => p.id));
  const cat = pick(Object.keys(CATEGORIES));
  return {
    phase: 'clues', order, impostor: pick(order), cat, word: pick(CATEGORIES[cat]),
    clueIdx: 0, clues: [], votes: {}, ejected: null, result: null,
    scores: prev.scores ?? {}, round: (prev.round ?? 0) + 1,
  };
}

function finish(s, impostorWins, extra = {}) {
  const scores = { ...s.scores };
  for (const id of s.order) {
    if (id === s.impostor) { if (impostorWins) scores[id] = (scores[id] ?? 0) + 2; }
    else if (!impostorWins) scores[id] = (scores[id] ?? 0) + 1;
  }
  return { ...s, phase: 'result', scores, result: { impostorWins, ...extra } };
}

function tally(s) {
  const counts = {};
  for (const t of Object.values(s.votes)) counts[t] = (counts[t] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(k => counts[k] === top);
  const ejected = leaders.length === 1 && leaders[0] !== 'skip' ? leaders[0] : null;
  if (ejected === s.impostor) return { ...s, phase: 'guess', ejected };
  return finish({ ...s, ejected }, true, { ejected });
}

export const impostor = {
  id: 'impostor',
  name: 'Impostor',
  emoji: '🕵️',

  init(env) { return begin({}, env); },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init(env);
    if (a.type === 'start' && isHost && (s.phase === 'need' || s.phase === 'result')) return begin(s, env);

    if (s.phase === 'clues') {
      const advance = (text) => {
        const clues = [...s.clues, { id: s.order[s.clueIdx], text }];
        const clueIdx = s.clueIdx + 1;
        return clueIdx >= s.order.length ? { ...s, clues, clueIdx, phase: 'vote' } : { ...s, clues, clueIdx };
      };
      if (a.type === 'clue' && a.from === s.order[s.clueIdx]) {
        const text = String(a.data?.text ?? '').trim().slice(0, 30);
        return text ? advance(text) : s;
      }
      if (a.type === 'skipclue' && isHost) return advance('(skipped)');
    }

    if (s.phase === 'vote') {
      if (a.type === 'vote' && s.order.includes(a.from) && s.votes[a.from] === undefined) {
        const t = a.data?.target;
        if (t !== 'skip' && (!s.order.includes(t) || t === a.from)) return s;
        const next = { ...s, votes: { ...s.votes, [a.from]: t } };
        const present = env.players.map(p => p.id).filter(id => s.order.includes(id));
        return present.every(id => next.votes[id] !== undefined) ? tally(next) : next;
      }
      if (a.type === 'endvote' && isHost) return tally(s);
    }

    if (s.phase === 'guess' && a.type === 'guessword' && a.from === s.impostor) {
      const text = String(a.data?.text ?? '');
      return finish(s, norm(text) === norm(s.word), { ejected: s.ejected, guess: text.slice(0, 30) });
    }
    return s;
  },

  // Roles and the secret word are hidden until the round is over.
  view(s) {
    if (s.phase === 'need') return s;
    const { impostor: imp, word, ...pub } = s;
    const showAll = s.phase === 'result';
    return {
      ...pub,
      ...(showAll ? { impostor: imp, word } : {}),
      votes: showAll ? s.votes : Object.fromEntries(Object.keys(s.votes).map(id => [id, true])),
    };
  },
  priv(s) {
    if (!['clues', 'vote', 'guess'].includes(s.phase)) return {};
    return Object.fromEntries(s.order.map(id => [id, id === s.impostor ? { role: 'impostor' } : { role: 'crew', word: s.word }]));
  },

  render(el, s, ui) {
    const keep = el.querySelector('input');
    const typed = keep?.value ?? '';
    const focused = keep && document.activeElement === keep;
    const name = id => ui.esc(ui.nameOf(id));
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${name(id)}</td><td><b>${pts}</b></td></tr>`).join('');
    const hostBtns = ui.isHost ? '<div class="row"><button class="ghost" id="reset">New game</button></div>' : '';
    let body = '';

    if (s.phase === 'need') {
      body = `<p>Need at least ${MIN_PLAYERS} players. ${ui.players.length} here now.</p>
        ${ui.isHost ? '<button id="start">Start round</button>' : '<p class="muted">Waiting for the host to start…</p>'}`;
    } else if (s.phase === 'result') {
      const r = s.result;
      const votes = Object.entries(s.votes).map(([from, t]) => `${name(from)} → ${t === 'skip' ? 'skip' : name(t)}`).join(' · ');
      body = `<h3>${r.impostorWins ? '🕵️ The impostor wins!' : '🎉 The crew wins!'}</h3>
        <p>The impostor was <b>${name(s.impostor)}</b>. The word was <b>${ui.esc(s.word)}</b>.</p>
        ${r.ejected ? `<p>Voted out: <b>${name(r.ejected)}</b>${r.guess ? ` · impostor guessed “${ui.esc(r.guess)}”` : ''}</p>` : '<p>Nobody was voted out.</p>'}
        <p class="muted">${votes}</p>
        ${ui.isHost ? '<button id="start">Next round</button>' : ''}`;
    } else {
      const me = ui.priv;
      const card = !me ? '<div class="banner">You joined mid-round. Watching this one!</div>'
        : me.role === 'impostor'
          ? `<div class="role bad">🕵️ You are the IMPOSTOR<br><small>Category: ${ui.esc(s.cat)}. Blend in!</small></div>`
          : `<div class="role">Your secret word: <b>${ui.esc(me.word)}</b><br><small>Category: ${ui.esc(s.cat)}. Find the impostor.</small></div>`;
      const clues = s.clues.map(c => `<div><b>${name(c.id)}:</b> ${ui.esc(c.text)}</div>`).join('');
      if (s.phase === 'clues') {
        const turn = s.order[s.clueIdx];
        body = `${card}<h3>Give a one-word clue</h3><div class="chat">${clues || '<span class="muted">No clues yet</span>'}</div>
          ${turn === ui.me
            ? '<form id="cf" class="row"><input class="grow" maxlength="30" placeholder="Your clue (don\'t say the word!)" autocomplete="off"><button>Send</button></form>'
            : `<p class="muted">Waiting for ${name(turn)}…</p>`}
          ${ui.isHost ? '<button class="ghost" id="skipclue">Skip this player</button>' : ''}`;
      } else if (s.phase === 'vote') {
        const voted = s.votes[ui.me] !== undefined;
        body = `${card}<h3>Who is the impostor?</h3><div class="chat">${clues}</div>
          <p class="muted">Discuss out loud, then vote. ${Object.keys(s.votes).length}/${s.order.length} voted.</p>
          ${s.order.includes(ui.me) && !voted
            ? `<div class="games">${s.order.filter(id => id !== ui.me).map(id => `<button data-v="${id}">${name(id)}</button>`).join('')}<button class="ghost" data-v="skip">Skip</button></div>`
            : '<p class="muted">Vote locked in. Waiting for the others…</p>'}
          ${ui.isHost ? '<button class="ghost" id="endvote">Count votes now</button>' : ''}`;
      } else if (s.phase === 'guess') {
        body = `${card}<h3>${name(s.ejected)} was voted out, and was the impostor!</h3>
          ${ui.me === s.ejected
            ? '<p>One last chance: guess the secret word to win.</p><form id="gf" class="row"><input class="grow" maxlength="30" placeholder="The word is…" autocomplete="off"><button>Guess</button></form>'
            : '<p class="muted">Waiting for the impostor’s final guess…</p>'}`;
      }
    }

    el.innerHTML = `<h2>Impostor</h2><p class="muted">Round ${s.round}. Everyone but one player knows the secret word.</p>${body}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>${hostBtns}`;

    const input = el.querySelector('form input');
    if (input && typed) input.value = typed;
    if (input && focused) input.focus();
    const send = (id, type, key) => el.querySelector(id)?.addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.trim();
      if (v) ui.act(type, { text: v });
    });
    send('#cf', 'clue');
    send('#gf', 'guessword');
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => ui.act('vote', { target: b.dataset.v }));
    el.querySelector('#start')?.addEventListener('click', () => ui.act('start'));
    el.querySelector('#skipclue')?.addEventListener('click', () => ui.act('skipclue'));
    el.querySelector('#endvote')?.addEventListener('click', () => ui.act('endvote'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
