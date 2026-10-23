import { fresh, memo, confetti, sfx } from './fx.js';
import { revealCinematic } from './impostor-fx.js';

const CATEGORIES = {
  Food: ['pizza', 'burger', 'sushi', 'pasta', 'taco', 'salad', 'pancake', 'ice cream'],
  Animals: ['lion', 'dolphin', 'penguin', 'elephant', 'monkey', 'rabbit', 'eagle', 'turtle'],
  Places: ['beach', 'library', 'airport', 'hospital', 'school', 'zoo', 'mall', 'farm'],
  Jobs: ['teacher', 'doctor', 'chef', 'pilot', 'farmer', 'firefighter', 'singer', 'driver'],
  Sports: ['soccer', 'basketball', 'tennis', 'swimming', 'volleyball', 'baseball', 'boxing', 'golf'],
  'Things at home': ['sofa', 'fridge', 'toothbrush', 'blanket', 'mirror', 'lamp', 'pillow', 'kettle'],
  Fruits: ['mango', 'banana', 'grapes', 'pineapple', 'watermelon', 'strawberry', 'papaya', 'orange'],
  Transport: ['jeepney', 'tricycle', 'airplane', 'train', 'bicycle', 'ship', 'bus', 'taxi'],
  'Filipino food': ['adobo', 'sinigang', 'lechon', 'halo-halo', 'pancit', 'lumpia', 'kare-kare', 'bibingka'],
  Nature: ['volcano', 'waterfall', 'rainbow', 'island', 'forest', 'river', 'cave', 'desert'],
  'Toys & games': ['puzzle', 'yoyo', 'chess', 'doll', 'kite', 'marbles', 'lego', 'cards'],
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
  inProgress: s => ['clues', 'vote', 'guess'].includes(s.phase),
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
    const later = (ms, fn) => setTimeout(fn, ms);
    let body = '';
    let mood = ''; // a class on the whole screen for the current moment

    // sounds for the move from one phase to the next
    const prevPhase = memo(el, 'phase', s.phase);
    if (prevPhase !== undefined && prevPhase !== s.phase) {
      if (s.phase === 'vote') { sfx('flip'); later(200, () => sfx('whoosh')); }
      else if (s.phase === 'guess') { sfx('gasp'); later(250, () => sfx('drumroll')); }
    }

    if (s.phase === 'need') {
      body = `<p>Need at least ${MIN_PLAYERS} players. ${ui.players.length} here now.</p>
        ${ui.isHost ? '<button id="start">Start round</button>' : '<p class="muted">Waiting for the host to start…</p>'}`;
    } else if (s.phase === 'result') {
      /* ---- the big reveal, one beat at a time ---- */
      const r = s.result;
      const entries = Object.entries(s.votes);
      const anim = fresh(el, 'res', s.round);
      const step = 0.35;
      const t1 = entries.length * step + 0.5;   // "The impostor was…"
      const t2 = t1 + 1.7;                      // their name
      const t3 = t2 + 1;                        // the secret word
      const t4 = t3 + 0.9;                      // who won
      const inGame = s.order.includes(ui.me);
      const mine = inGame ? (ui.me === s.impostor ? r.impostorWins : !r.impostorWins) : null;
      // The whole-screen scene plays the sounds itself; the page underneath just shows the final result.
      if (anim) revealCinematic({ impostor: ui.nameOf(s.impostor), word: s.word, impostorWins: r.impostorWins, mine, isImpostor: ui.me === s.impostor, ejected: r.ejected ? ui.nameOf(r.ejected) : null, guess: r.guess });
      const d = () => '';
      const rd = '';
      mood = 'imp-reveal';
      body = `<h3>🗳️ The votes</h3>
        <div class="imp-votes">${entries.map(([from, tgt], i) => `<div class="step ${rd}" ${d(i * step)}>${name(from)} → <b>${tgt === 'skip' ? 'skip' : name(tgt)}</b></div>`).join('') || '<p class="muted">Nobody voted.</p>'}</div>
        <div class="step ${rd} imp-suspense" ${d(t1)}>🕵️ The impostor was…</div>
        <div class="step ${rd} imp-name" ${d(t2)}>${name(s.impostor)}</div>
        <div class="step ${rd}" ${d(t3)}><p>The secret word was <b class="imp-word">${ui.esc(s.word)}</b></p>
          ${r.ejected ? `<p>Voted out: <b>${name(r.ejected)}</b>${r.guess ? ` · the impostor guessed “${ui.esc(r.guess)}”` : ''}</p>` : '<p>Nobody was voted out.</p>'}</div>
        <div class="step ${rd} imp-verdict ${r.impostorWins ? 'bad' : 'good'}" ${d(t4)}>${r.impostorWins ? '🕵️ The impostor wins!' : '🎉 The crew wins!'}</div>
        ${ui.isHost ? `<div class="step ${rd}" ${d(t4 + 0.3)}><button id="start">Next round</button></div>` : ''}`;
    } else {
      const me = ui.priv;
      const newRole = !!me && fresh(el, 'role', s.round);
      if (newRole) {
        sfx('whoosh');
        later(500, () => sfx(me.role === 'impostor' ? 'growl' : 'ding'));
        if (me.role === 'impostor') later(1100, () => sfx('heartbeat'));
        try { navigator.vibrate?.(me.role === 'impostor' ? [120, 80, 120] : 60); } catch { /* not supported */ }
      }
      const card = !me ? '<div class="banner">You joined mid-round. Watching this one!</div>'
        : me.role === 'impostor'
          ? `<div class="role bad imp-card imp-evil ${newRole ? 'flip' : ''}">🕵️ You are the IMPOSTOR<br><small>Category: ${ui.esc(s.cat)}. Blend in!</small></div>`
          : `<div class="role imp-card imp-crew ${newRole ? 'flip' : ''}">Your secret word<br><b class="imp-word">${ui.esc(me.word)}</b><br><small>Category: ${ui.esc(s.cat)}. Find the impostor.</small></div>`;
      const nClues = memo(el, 'clues', s.clues.length);
      const newClue = nClues !== undefined && s.clues.length > nClues;
      if (newClue) sfx('pop');
      const clues = s.clues.map((c, i) => `<div class="${newClue && i === s.clues.length - 1 ? 'in' : ''}"><b>${name(c.id)}:</b> ${ui.esc(c.text)}</div>`).join('');
      if (s.phase === 'clues') {
        const turn = s.order[s.clueIdx];
        const myTurn = turn === ui.me;
        if (fresh(el, 'turn', `${s.round}-${s.clueIdx}`) && myTurn) { sfx('blip'); later(180, () => sfx('blip')); try { navigator.vibrate?.(150); } catch { /* not supported */ } }
        const order = s.order.map((id, i) => `<span class="chip ${i < s.clueIdx ? 'done' : ''} ${i === s.clueIdx ? 'cur' : ''} ${id === ui.me ? 'me' : ''}">${i < s.clueIdx ? '✓' : i === s.clueIdx ? '🎤' : i + 1} ${name(id)}</span>`).join('');
        mood = myTurn ? 'imp-myturn' : '';
        body = `${card}<h3>Give a one-word clue</h3>
          <div class="imp-order" aria-label="Turn order">${order}</div>
          <div class="chat">${clues || '<span class="muted">No clues yet</span>'}</div>
          ${myTurn
            ? '<div class="imp-turn">🎤 <b>Your turn!</b> One word that hints at the secret.</div><form id="cf" class="row"><input class="grow" maxlength="30" placeholder="Your clue (don\'t say the word!)" autocomplete="off"><button>Send</button></form>'
            : `<p class="imp-wait">✍️ <b>${name(turn)}</b> is thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`}
          ${ui.isHost ? '<button class="ghost" id="skipclue">Skip this player</button>' : ''}`;
      } else if (s.phase === 'vote') {
        const voted = s.votes[ui.me] !== undefined;
        const nVoted = Object.keys(s.votes).length;
        const prev = memo(el, 'voted', nVoted);
        if (prev !== undefined && nVoted > prev && !(voted && nVoted === prev + 1 && el._mine)) sfx('tick');
        const chips = s.order.map(id => `<span class="chip ${s.votes[id] !== undefined ? 'new' : ''}">${s.votes[id] !== undefined ? '✅' : '⏳'} ${name(id)}</span>`).join('');
        body = `${card}<h3>🗳️ Who is the impostor?</h3><div class="chat">${clues}</div>
          <p class="muted">Discuss out loud, then vote. ${nVoted}/${s.order.length} voted.</p>
          <div class="bar"><i style="width:${s.order.length ? (nVoted / s.order.length) * 100 : 0}%"></i></div>
          ${s.order.includes(ui.me) && !voted
            ? `<div class="votes">${s.order.filter(id => id !== ui.me).map(id => `<button data-v="${id}">${name(id)}</button>`).join('')}</div><button class="ghost imp-skip" data-v="skip">Skip (vote for nobody)</button>`
            : '<p class="muted">🔒 Vote locked in. Waiting for the others…</p>'}
          <div class="chips imp-voted">${chips}</div>
          ${ui.isHost ? '<button class="ghost" id="endvote">Count votes now</button>' : ''}`;
      } else if (s.phase === 'guess') {
        const me2 = ui.me === s.ejected;
        mood = 'imp-caught';
        body = `${card}<div class="imp-alarm">🚨 <b>${name(s.ejected)}</b> was voted out, and was the impostor!</div>
          ${me2
            ? '<div class="imp-turn bad">😈 <b>Last chance!</b> Guess the secret word and you still win.</div><form id="gf" class="row"><input class="grow" maxlength="30" placeholder="The word is…" autocomplete="off"><button>Guess</button></form>'
            : '<p class="imp-wait">😬 Waiting for the impostor’s final guess<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>'}`;
      }
    }

    el.innerHTML = `<div class="imp ${mood}"><h2><span class="imp-mag">🔎</span> Impostor</h2><p class="muted">Round ${s.round}. Everyone but one player knows the secret word.</p>${body}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>${hostBtns}</div>`;

    const input = el.querySelector('form input');
    if (input && typed) input.value = typed;
    if (input && focused) input.focus();
    const send = (id, type) => el.querySelector(id)?.addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.trim();
      if (v) { sfx(type === 'clue' ? 'pop' : 'drumroll'); ui.act(type, { text: v }); }
    });
    send('#cf', 'clue');
    send('#gf', 'guessword');
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { sfx('vote'); el._mine = true; setTimeout(() => { el._mine = false; }, 1500); ui.act('vote', { target: b.dataset.v }); });
    el.querySelector('#start')?.addEventListener('click', () => ui.act('start'));
    el.querySelector('#skipclue')?.addEventListener('click', () => ui.act('skipclue'));
    el.querySelector('#endvote')?.addEventListener('click', () => ui.act('endvote'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
