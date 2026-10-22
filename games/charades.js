import { fresh, confetti, sfx } from './fx.js';

const PROMPTS = {
  animals: ['monkey', 'elephant', 'chicken', 'penguin', 'kangaroo', 'snake', 'frog', 'butterfly', 'lion', 'crab', 'horse', 'bat'],
  actions: ['brushing teeth', 'swimming', 'playing guitar', 'driving a car', 'cooking', 'taking a selfie', 'dancing', 'sleeping',
    'fishing', 'riding a bike', 'washing dishes', 'climbing a mountain', 'playing basketball', 'singing karaoke', 'eating spaghetti'],
  jobs: ['doctor', 'teacher', 'farmer', 'pilot', 'police officer', 'chef', 'firefighter', 'singer', 'barber', 'photographer'],
  filipino: ['playing sungka', 'riding a jeepney', 'selling at a sari-sari store', 'dancing tinikling', 'doing mano po', 'making a parol',
    'cooking adobo', 'playing patintero', 'singing at a videoke', 'eating kamayan style'],
};
PROMPTS.all = Object.values(PROMPTS).flat();

const ACT_MS = 60000;
const REVEAL_MS = 5000;

function startTurn(s, env) {
  const round = s.round + 1;
  if (round > s.order.length) return { ...s, phase: 'end', until: null };
  return pickPrompt({ ...s, round, actor: s.order[round - 1], phase: 'act', result: null, until: env.now + ACT_MS });
}

function pickPrompt(s) {
  const list = PROMPTS[s.type] ?? PROMPTS.all;
  const pool = list.filter(p => !s.used.includes(p));
  const prompt = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
  return { ...s, prompt, used: [...s.used, prompt] };
}

const toReveal = (s, env, guesser = null) => ({ ...s, phase: 'reveal', result: { guesser }, until: env.now + REVEAL_MS });

export const charades = {
  id: 'charades',
  inProgress: s => s.phase !== 'end',
  name: 'Charades',
  emoji: '🎭',
  options: [{ key: 'type', label: 'Prompts', choices: [['all', 'Everything'], ['animals', 'Animals'], ['actions', 'Actions'], ['jobs', 'Jobs'], ['filipino', 'Filipino fun']] }],

  init(env, opts) {
    return startTurn({ order: env.players.map(p => p.id), round: 0, used: [], scores: {}, type: opts?.type ?? 'all' }, env);
  },

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) return this.init(env, { type: s.type });
    const acting = s.phase === 'act';

    if (a.type === 'got' && acting && a.from === s.actor) {
      const id = a.data?.id;
      if (id === s.actor || !s.order.includes(id)) return s;
      const scores = { ...s.scores, [id]: (s.scores[id] ?? 0) + 100, [s.actor]: (s.scores[s.actor] ?? 0) + 50 };
      return toReveal({ ...s, scores }, env, id);
    }
    if (a.type === 'pass' && acting && a.from === s.actor) return pickPrompt(s);
    if (a.type === 'skip' && isHost) {
      if (acting) return toReveal(s, env);
      if (s.phase === 'reveal') return startTurn(s, env);
    }
    if (a.type === 'timeout' && isHost && s.until && env.now >= s.until - 100) {
      if (acting) return toReveal(s, env);
      if (s.phase === 'reveal') return startTurn(s, env);
    }
    return s;
  },

  deadline: s => (s.phase === 'act' || s.phase === 'reveal' ? s.until : null),

  // Only the actor ever sees the prompt while a turn is running.
  view(s) {
    if (s.phase !== 'act') return s;
    const words = s.prompt.split(' ').length;
    return { ...s, prompt: null, hint: `${words} word${words > 1 ? 's' : ''}`, used: [] };
  },
  priv: s => (s.phase === 'act' ? { [s.actor]: s.prompt } : {}),

  render(el, s, ui) {
    if (!el._d) {
      const d = el._d = { s };
      d.tick = setInterval(() => {
        if (!el.isConnected || el._d !== d) return clearInterval(d.tick);
        const left = d.s.until ? Math.max(0, d.s.until - Date.now()) : 0;
        const t = el.querySelector('#timer');
        if (t) t.textContent = `${Math.ceil(left / 1000)}s`;
        const bar = el.querySelector('.bar i');
        if (bar && d.s.phase === 'act') {
          const pct = Math.min(100, (left / ACT_MS) * 100);
          bar.style.width = `${pct}%`;
          bar.classList.toggle('low', pct < 25);
        }
      }, 500);
    }
    el._d.s = s;

    const name = id => ui.esc(ui.nameOf(id));
    const board = Object.entries(s.scores).sort((a, b) => b[1] - a[1])
      .map(([id, pts]) => `<tr><td>${name(id)}</td><td><b>${pts}</b></td></tr>`).join('');
    const hostBtns = ui.isHost ? '<div class="row"><button class="ghost" id="skip">Skip turn</button><button class="ghost" id="reset">New game</button></div>' : '';
    let body;
    if (s.phase === 'end') {
      if (fresh(el, 'end', true)) { confetti(); sfx('win'); }
      body = '<h3>🏆 Game over!</h3>';
    } else if (s.phase === 'reveal') {
      if (fresh(el, 'rev', s.round)) sfx(s.result.guesser ? 'ding' : 'buzz');
      body = `<p>It was <b class="status-pop">${ui.esc(s.prompt)}</b></p>
        <p>${s.result.guesser ? `🎉 ${name(s.result.guesser)} guessed it!` : "⏰ Time's up!"}</p>`;
    } else if (ui.me === s.actor) {
      if (fresh(el, 'turn', s.round)) sfx('whoosh');
      const others = s.order.filter(id => id !== s.actor);
      body = `<div class="role flip">Act this out (no talking!):<br><b style="font-size:1.6rem">${ui.esc(ui.priv ?? '…')}</b></div>
        <div class="bar"><i style="width:100%"></i></div><p class="muted">Time left: <span id="timer"></span></p>
        <h3>Who guessed it?</h3>
        <div class="votes">${others.map(id => `<button data-got="${id}">${name(id)}</button>`).join('')}</div>
        <button class="ghost" id="pass">Pass (new prompt, no points)</button>`;
    } else {
      body = `<p><b>${name(s.actor)}</b> is acting! Shout your guesses.</p>
        <div class="role">🎭 <small>${ui.esc(s.hint ?? '')}</small></div>
        <div class="bar"><i style="width:100%"></i></div><p class="muted">Time left: <span id="timer"></span></p>`;
    }
    el.innerHTML = `<h2>Charades</h2><p class="muted">Turn ${Math.min(s.round, s.order.length)} of ${s.order.length}. Act it out, others guess out loud.</p>${body}
      <h3>Scores</h3><table class="table">${board || '<tr><td class="muted">No points yet</td></tr>'}</table>${hostBtns}`;

    el.querySelectorAll('[data-got]').forEach(b => b.onclick = () => ui.act('got', { id: b.dataset.got }));
    el.querySelector('#pass')?.addEventListener('click', () => ui.act('pass'));
    el.querySelector('#skip')?.addEventListener('click', () => ui.act('skip'));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
