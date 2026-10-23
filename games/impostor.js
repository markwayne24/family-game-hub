import { fresh, memo, confetti, sfx } from './fx.js';
import { revealCinematic, turnCinematic, scoreBoardHtml, avatar } from './impostor-fx.js';

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
export const CAT_EMOJI = {
  Food: '🍕', Animals: '🦁', Places: '🏖️', Jobs: '👩‍⚕️', Sports: '⚽', 'Things at home': '🛋️', Fruits: '🍍',
  Transport: '🚌', 'Filipino food': '🍲', Nature: '🌋', 'Toys & games': '🧸',
};
export const CATEGORY_NAMES = Object.keys(CATEGORIES);
const MIN_PLAYERS = 3;

const pick = a => a[Math.floor(Math.random() * a.length)];
const norm = t => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The host's chosen categories (none chosen = everything). Words only come from these.
const chosen = cats => (cats ?? []).filter(c => CATEGORIES[c]);

function begin(prev, env) {
  const cats = chosen(prev.cats);
  const base = { cats, scores: prev.scores ?? {}, round: prev.round ?? 0, used: prev.used ?? [] };
  if (env.players.length < MIN_PLAYERS) return { phase: 'lobby', ...base };
  const order = shuffle(env.players.map(p => p.id));
  const cat = pick(cats.length ? cats : CATEGORY_NAMES);
  const fresh = CATEGORIES[cat].filter(w => !base.used.includes(w)); // don't repeat a word until the category runs out
  const word = pick(fresh.length ? fresh : CATEGORIES[cat]);
  return {
    phase: 'clues', order, impostor: pick(order), cat, word,
    clueIdx: 0, clues: [], votes: {}, ejected: null, result: null,
    ...base, used: fresh.length ? [...base.used, word] : [word], round: base.round + 1,
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

  // The game opens in a waiting room where the host picks what the secret words are about.
  init(env, opts) { return { phase: 'lobby', cats: chosen(opts?.memory?.cats), scores: {}, round: 0, used: [] }; },
  remember: s => ({ cats: s.cats ?? [] }),

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return { ...this.init(env), cats: chosen(s.cats) };
    const waiting = s.phase === 'lobby' || s.phase === 'need' || s.phase === 'result';
    if (a.type === 'start' && isHost && waiting) return begin(s, env);
    // The host chooses the categories before a round (or between rounds): tap one to switch it on or off.
    if (a.type === 'config' && isHost && waiting) {
      if (a.data?.all) return { ...s, cats: [] };
      const c = a.data?.cat;
      if (!CATEGORIES[c]) return s;
      const cur = chosen(s.cats);
      return { ...s, cats: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] };
    }

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
    if (s.phase === 'need' || s.phase === 'lobby') return s;
    const { impostor: imp, word, used, ...pub } = s; // `used` would give the word away
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
    el.classList.add('impstage'); // the screen is made of separate cards, so the stage itself stays plain
    const keep = el.querySelector('input');
    const typed = keep?.value ?? '';
    const focused = keep && document.activeElement === keep;
    const name = id => ui.esc(ui.nameOf(id));
    const later = (ms, fn) => setTimeout(fn, ms);
    const panel = (title, inner, cls = '') => `<section class="imp-panel ${cls}">${title ? `<h3 class="imp-ph">${title}</h3>` : ''}${inner}</section>`;
    const gains = {};
    if (s.phase === 'result' && s.result) for (const id of s.order) gains[id] = id === s.impostor ? (s.result.impostorWins ? 2 : 0) : s.result.impostorWins ? 0 : 1;
    // everyone in the room, best score first
    const ids = [...new Set([...Object.keys(s.scores), ...ui.players.map(p => p.id)])];
    const rows = ids.map(id => { const after = s.scores[id] ?? 0, gain = gains[id] ?? 0; return { id, name: ui.nameOf(id), before: after - gain, after, gain, me: id === ui.me }; })
      .sort((a, b) => b.after - a.after || a.name.localeCompare(b.name));
    const scoreCard = `<div class="imp-scorecard"><h3>🏆 Scoreboard</h3>${scoreBoardHtml(rows).html}</div>`;
    const foot = ui.isHost ? '<div class="imp-foot"><button class="ghost" id="reset">New game</button></div>' : '';
    const head = (pills = true) => `<header class="imp-head"><div class="imp-title"><span class="imp-mag">🔎</span> Impostor</div>${pills ? `<div class="imp-pills">${s.round ? `<span class="imp-pill">Round ${s.round}</span>` : ''}${s.cat ? `<span class="imp-pill">${CAT_EMOJI[s.cat] ?? '🎯'} ${ui.esc(s.cat)}</span>` : ''}</div>` : ''}</header>`;
    let body = '';
    let mood = ''; // a class on the whole screen for the current moment

    // sounds for the move from one phase to the next
    const prevPhase = memo(el, 'phase', s.phase);
    if (prevPhase !== undefined && prevPhase !== s.phase) {
      if (s.phase === 'vote') { sfx('flip'); later(200, () => sfx('whoosh')); }
      else if (s.phase === 'guess') { sfx('gasp'); later(250, () => sfx('drumroll')); }
    }

    // the host's category picker (also offered between rounds)
    const cats = (s.cats ?? []).filter(c => CATEGORIES[c]);
    const catChips = disabled => `<div class="imp-cats">
        <button class="chip pick ${cats.length ? '' : 'sel'}" data-cat="__all" ${disabled ? 'disabled' : ''}>🎲 Everything</button>
        ${CATEGORY_NAMES.map(c => `<button class="chip pick ${cats.includes(c) ? 'sel' : ''}" data-cat="${ui.esc(c)}" ${disabled ? 'disabled' : ''}>${CAT_EMOJI[c] ?? '🎯'} ${ui.esc(c)}</button>`).join('')}</div>
      <p class="muted">${cats.length ? `Secret words will only come from: <b>${cats.map(ui.esc).join(', ')}</b>.` : 'Secret words come from <b>every category</b>.'}</p>`;

    if (s.phase === 'lobby' || s.phase === 'need') {
      const enough = ui.players.length >= MIN_PLAYERS;
      body = `${head(false)}
        ${panel('🎯 What are the secret words about?', `${ui.isHost ? '<p class="muted">Pick one or more categories. The secret word is picked at random from them.</p>' : '<p class="muted">The host is choosing what the words are about.</p>'}${catChips(!ui.isHost)}`)}
        ${panel('👥 Players', `<p style="margin:0"><b>${ui.players.length}</b> player${ui.players.length === 1 ? '' : 's'} here · you need at least ${MIN_PLAYERS}</p><div class="chips" style="margin-top:8px">${ui.players.map(p => `<span class="chip ${p.id === ui.me ? 'me' : ''}">${ui.esc(p.name)}</span>`).join('')}</div>`)}
        ${ui.isHost ? `<div class="imp-bar">${enough ? '' : `<p class="muted">⚠️ Need at least ${MIN_PLAYERS} players (${ui.players.length} here)</p>`}<button id="start" ${enough ? '' : 'disabled'}>▶ Start the game</button></div>` : '<p class="muted" style="text-align:center">Waiting for the host to start…</p>'}`;
    } else if (s.phase === 'result') {
      const r = s.result;
      const entries = Object.entries(s.votes);
      const anim = fresh(el, 'res', s.round);
      const inGame = s.order.includes(ui.me);
      const mine = inGame ? (ui.me === s.impostor ? r.impostorWins : !r.impostorWins) : null;
      // Who got what this round (the rules: crew +1 if they win, the impostor +2 if they win).
      const gainOf = id => (id === s.impostor ? (r.impostorWins ? 2 : 0) : r.impostorWins ? 0 : 1);
      const roundScores = s.order.map(id => { const after = s.scores[id] ?? 0, gain = gainOf(id); return { id, name: ui.nameOf(id), before: after - gain, after, gain, me: id === ui.me }; }).sort((a, b) => b.after - a.after);
      // The whole-screen scene plays the sounds itself; the page underneath just shows the final result.
      if (anim) revealCinematic({ scores: roundScores, impostor: ui.nameOf(s.impostor), word: s.word, impostorWins: r.impostorWins, mine, isImpostor: ui.me === s.impostor, ejected: r.ejected ? ui.nameOf(r.ejected) : null, guess: r.guess });
      mood = 'imp-reveal';
      // who voted for whom, grouped by the person they voted for
      const by = {}; const skips = [];
      for (const [from, to] of entries) { if (to === 'skip') skips.push(from); else (by[to] ??= []).push(from); }
      const grouped = Object.entries(by).sort((a, b) => b[1].length - a[1].length);
      const maxV = Math.max(1, ...grouped.map(([, v]) => v.length));
      const voteRows = grouped.map(([to, from]) => `<div class="iv-row ${to === r.ejected ? 'out' : ''} ${to === s.impostor ? 'imp' : ''}">
          ${avatar(ui.nameOf(to))}<div class="iv-main"><div class="iv-nm">${name(to)}${to === r.ejected ? ' <span class="iv-tag">voted out</span>' : ''}${to === s.impostor ? ' <span class="iv-tag bad">impostor</span>' : ''}</div>
          <div class="iv-from">${from.map(f => `<span class="chip">${name(f)}</span>`).join('')}</div>
          <div class="iv-bar"><i style="width:${Math.round((from.length / maxV) * 100)}%"></i></div></div><b class="iv-n">${from.length}</b></div>`).join('');
      const why = r.impostorWins
        ? (r.guess ? 'They guessed the secret word!' : r.ejected ? 'The crew voted out the wrong player.' : 'Nobody was voted out.')
        : 'The impostor was caught and missed the word.';
      body = `${head()}
        <section class="imp-hero imp-verdict ${r.impostorWins ? 'bad' : 'good'}"><div class="ih-emoji">${r.impostorWins ? '🕵️' : '🎉'}</div><div class="ih-title">${r.impostorWins ? 'The impostor wins!' : 'The crew wins!'}</div><div class="ih-sub">${why}</div></section>
        <section class="imp-panel imp-reveal2">
          <div class="irv"><div class="irv-lbl">🕵️ The impostor was</div>${avatar(ui.nameOf(s.impostor))}<div class="imp-name">${name(s.impostor)}</div></div>
          <div class="irv"><div class="irv-lbl">🔤 The secret word was</div><div class="imp-word2">${ui.esc(s.word)}</div><div class="irv-sub">${CAT_EMOJI[s.cat] ?? '🎯'} ${ui.esc(s.cat)}</div></div>
        </section>
        ${panel('🗳️ Who voted for whom', `${voteRows || '<p class="muted">Nobody voted.</p>'}${skips.length ? `<p class="muted iv-skip">Skipped: ${skips.map(name).join(', ')}</p>` : ''}`)}
        ${r.guess !== undefined ? panel('🎯 Last chance', `<p style="margin:0"><b>${name(r.ejected)}</b> was voted out and guessed <b>“${ui.esc(r.guess)}”</b> ${r.impostorWins ? '✅ <b>Correct!</b>' : '❌ Not the word.'}</p>`) : ''}
        ${scoreCard}
        ${ui.isHost ? `${panel('🎯 Words for the next round', `<details class="imp-nextcat" ${el._catOpen ? 'open' : ''}><summary>${cats.length ? cats.map(ui.esc).join(', ') : 'Everything'} · tap to change</summary>${catChips(false)}</details>`)}<div class="imp-bar"><button id="start">▶ Next round</button></div>` : ''}`;
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
      const clues = s.clues.map((c, i) => `<div class="${newClue && i === s.clues.length - 1 ? 'in' : ''}">${avatar(ui.nameOf(c.id))} <b>${name(c.id)}:</b> ${ui.esc(c.text)}</div>`).join('');
      if (s.phase === 'clues') {
        const turn = s.order[s.clueIdx];
        const myTurn = turn === ui.me;
        const key = `${s.round}-${s.clueIdx}`;
        el._curTurn = key;
        if (fresh(el, 'turn', key)) {
          // The first turn waits a moment so people can see their role card first. Later turns show straight away.
          later(s.clueIdx === 0 ? 2600 : 0, () => {
            if (!el.isConnected || el._curTurn !== key) return; // the game has moved on
            turnCinematic({ name: ui.nameOf(turn), mine: myTurn, n: s.clueIdx + 1, total: s.order.length, onDone: () => { if (myTurn) el.querySelector('#cf input')?.focus(); } });
          });
        }
        const order = s.order.map((id, i) => `<span class="chip ${i < s.clueIdx ? 'done' : ''} ${i === s.clueIdx ? 'cur' : ''} ${id === ui.me ? 'me' : ''}">${i < s.clueIdx ? '✓' : i === s.clueIdx ? '🎤' : i + 1} ${name(id)}</span>`).join('');
        mood = myTurn ? 'imp-myturn' : '';
        body = `${head()}${card}
          ${panel('🎤 Give a one-word clue', `<div class="imp-order" aria-label="Turn order">${order}</div>
            <div class="chat">${clues || '<span class="muted">No clues yet</span>'}</div>
            ${myTurn
              ? '<div class="imp-turn">🎤 <b>Your turn!</b> One word that hints at the secret.</div><form id="cf" class="row"><input class="grow" maxlength="30" placeholder="Your clue (don\'t say the word!)" autocomplete="off"><button>Send</button></form>'
              : `<p class="imp-wait">✍️ <b>${name(turn)}</b> is thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`}
            ${ui.isHost ? '<button class="ghost" id="skipclue">Skip this player</button>' : ''}`)}`;
      } else if (s.phase === 'vote') {
        el._curTurn = null;
        const voted = s.votes[ui.me] !== undefined;
        const nVoted = Object.keys(s.votes).length;
        const prev = memo(el, 'voted', nVoted);
        if (prev !== undefined && nVoted > prev && !(voted && nVoted === prev + 1 && el._mine)) sfx('tick');
        const chips = s.order.map(id => `<span class="chip ${s.votes[id] !== undefined ? 'new' : ''}">${s.votes[id] !== undefined ? '✅' : '⏳'} ${name(id)}</span>`).join('');
        body = `${head()}${card}
          ${panel('💬 The clues', `<div class="chat">${clues}</div>`)}
          ${panel('🗳️ Who is the impostor?', `<p class="muted" style="margin-top:0">Discuss out loud, then vote. <b>${nVoted}/${s.order.length}</b> voted.</p>
            <div class="bar"><i style="width:${s.order.length ? (nVoted / s.order.length) * 100 : 0}%"></i></div>
            ${s.order.includes(ui.me) && !voted
              ? `<div class="votes">${s.order.filter(id => id !== ui.me).map(id => `<button data-v="${id}">${name(id)}</button>`).join('')}</div><button class="ghost imp-skip" data-v="skip">Skip (vote for nobody)</button>`
              : '<p class="muted">🔒 Vote locked in. Waiting for the others…</p>'}
            <div class="chips imp-voted">${chips}</div>
            ${ui.isHost ? '<button class="ghost" id="endvote">Count votes now</button>' : ''}`)}`;
      } else if (s.phase === 'guess') {
        const me2 = ui.me === s.ejected;
        mood = 'imp-caught';
        body = `${head()}${card}<div class="imp-alarm">🚨 <b>${name(s.ejected)}</b> was voted out, and was the impostor!</div>
          ${panel('🎯 Last chance', me2
            ? '<div class="imp-turn bad">😈 <b>Last chance!</b> Guess the secret word and you still win.</div><form id="gf" class="row"><input class="grow" maxlength="30" placeholder="The word is…" autocomplete="off"><button>Guess</button></form>'
            : '<p class="imp-wait">😬 Waiting for the impostor’s final guess<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>')}`;
      }
    }

    el.innerHTML = `<div class="imp ${mood}">${body}${s.phase === 'result' ? '' : scoreCard}${foot}</div>`;

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
    el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { sfx('pop'); ui.act('config', b.dataset.cat === '__all' ? { all: true } : { cat: b.dataset.cat }); }));
    el.querySelector('.imp-nextcat')?.addEventListener('toggle', e => { el._catOpen = e.target.open; });
    el.querySelector('#start')?.addEventListener('click', () => ui.act('start'));
    el.querySelector('#skipclue')?.addEventListener('click', () => ui.act('skipclue'));
    el.querySelector('#endvote')?.addEventListener('click', () => ui.act('endvote'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
