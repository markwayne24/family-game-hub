import { fresh, memo, confetti, sfx, reduceMotion } from './fx.js';
import { search, paginate } from './list.js';
import { PATTERNS, PATTERN_IDS, PRESET_IDS, GROUPS, winCells, needCount, needAny, matchPatterns, previewCells, cleanPatterns } from './patterns.js';

export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const letterOf = n => LETTERS[Math.floor((n - 1) / 15)];

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// A card is derived from the player's id plus a shuffle seed, so the host can verify wins without trusting anyone.
// Index = row * 5 + column; 0 marks the free centre space.
export function cardFor(id, seed = 0) {
  const r = rng(`${id}:${seed}`);
  const cols = LETTERS.map((_, c) => {
    const nums = Array.from({ length: 15 }, (_, k) => c * 15 + k + 1);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    return nums.slice(0, 5);
  });
  cols[2][2] = 0;
  return Array.from({ length: 25 }, (_, i) => cols[i % 5][Math.floor(i / 5)]);
}
const cardKey = card => card.join(',');

export { PATTERNS, winCells, needCount, needAny, matchPatterns };

export const MAX_CARDS = 6;
export const MODES = {
  auto: 'Instant: the number is drawn and shown to everyone',
  manual: 'Private roll: only the host sees it until they reveal it',
};

// A player can hold several cards; card k of player `id` is seeded independently so each can be shuffled.
const cid = (id, k) => `${id}#${k}`;
export const countOf = (s, id) => s.counts[id] ?? s.defaultCount ?? 1; // per-player override, else the room default
const seedOf = (s, id, k) => s.seeds[cid(id, k)] ?? 0;
export const cardOf = (s, id, k = 0) => cardFor(cid(id, k), seedOf(s, id, k));
const cardsOf = (s, id) => Array.from({ length: countOf(s, id) }, (_, k) => cardOf(s, id, k));
const randomSeed = () => 1 + Math.floor(Math.random() * 1e9);
const customOk = s => !s.patterns.includes('custom') || s.custom.some(i => i !== 12);

// Every player we know about, so new cards can be checked against all existing ones.
function knownIds(s, env) {
  return new Set([...env.players.map(p => p.id), ...Object.keys(s.counts), ...Object.keys(s.seeds).map(k => k.split('#')[0])]);
}
function takenKeys(s, env, except) {
  const taken = new Set();
  for (const id of knownIds(s, env)) {
    for (let k = 0; k < countOf(s, id); k++) if (!(except && except.id === id && except.k === k)) taken.add(cardKey(cardOf(s, id, k)));
  }
  return taken;
}

// Up to this many players the host sees a plain list; beyond it, search and pages take over.
const SMALL_ROOM = 8;
const PER_PAGE = 8;

const patName = s => {
  const ids = s.patterns;
  if (ids.length === 1) return ids[0] === 'custom' ? `Custom (${s.custom.filter(i => i !== 12).length} squares)` : PATTERNS[ids[0]].name;
  return PRESET_IDS.every(id => ids.includes(id)) ? 'All patterns' : `${ids.length} patterns`;
};
const nameOfPattern = id => PATTERNS[id]?.name ?? id;

// One history entry per finished game (a win, or the host ending it). Abandoned games are not recorded.
function record(s, env, winners) {
  const entry = {
    n: s.history.length + 1,
    winners: winners.map(w => ({ id: w.id, name: env.players.find(p => p.id === w.id)?.name ?? s.names?.[w.id] ?? '?', k: w.k, multi: countOf(s, w.id) > 1, how: w.pattern ? nameOfPattern(w.pattern) : null })),
    pattern: patName(s), patterns: s.patterns.length, mode: s.mode, called: s.called.length, at: env.now,
  };
  return [...s.history, entry];
}

// A player whose connection drops stays in the game for a while: their card keeps filling in and they can still win.
export const GRACE_MS = 5 * 60 * 1000;

// Remember who is here (and what they are called) every time the host handles something.
function touch(s, env) {
  if (!env.players.length) return s;
  const seen = { ...(s.seen ?? {}) };
  const names = { ...(s.names ?? {}) };
  for (const p of env.players) { seen[p.id] = env.now; names[p.id] = p.name; }
  return { ...s, seen, names };
}

// Everyone connected now, plus anyone seen within the grace period (a dropped connection, a phone that went to sleep).
function inRoom(s, env) {
  const here = new Set(env.players.map(p => p.id));
  const recent = Object.entries(s.seen ?? {}).filter(([, t]) => t > 0 && env.now - t <= GRACE_MS).map(([id]) => id);
  return { ids: [...new Set([...here, ...recent])], here };
}

// Draw a number (auto mode) or reveal the rolled one (manual mode), then check everyone's cards.
function reveal(s, env, n) {
  const called = [...s.called, n];
  const winners = [];
  const { ids, here } = inRoom(s, env);
  for (const id of ids) {
    for (let k = 0; k < countOf(s, id); k++) {
      const hit = matchPatterns(cardOf(s, id, k), called, s.patterns, s.custom);
      if (hit) { winners.push({ id, k, cells: hit.cells, pattern: hit.id, offline: !here.has(id) }); break; } // one entry per player
    }
  }
  const next = { ...s, called, last: n, pending: null, winners, phase: winners.length ? 'over' : 'play' };
  return winners.length ? { ...next, history: record(next, env, winners) } : next;
}

const nextNumber = s => {
  const left = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !s.called.includes(n) && n !== s.pending);
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
};

export const bingo = {
  id: 'bingo',
  name: 'Bingo',
  emoji: '🎱',
  options: [
    { key: 'pattern', label: 'Win pattern', choices: PRESET_IDS.map(k => [k, PATTERNS[k].name]) },
    { key: 'mode', label: 'Number draw', choices: [['auto', 'Instant (everyone sees)'], ['manual', 'Private roll, host reveals']] },
  ],

  init(env, opts) {
    return {
      phase: 'lobby', host: env.hostId,
      // `patterns` is the list of shapes that win (any one of them); the picker sends a single `pattern`, a reset sends the list
      patterns: cleanPatterns(opts?.patterns) ?? [PATTERNS[opts?.pattern] && opts.pattern !== 'custom' ? opts.pattern : 'line'], custom: [],
      mode: MODES[opts?.mode] ? opts.mode : 'auto', pending: null,
      counts: {}, defaultCount: 1, seeds: {}, called: [], last: null, winners: [], ended: false,
      history: opts?.memory?.history ?? [], // survives "new game" and even leaving Bingo for another game
    };
  },

  reduce(s, a, env) {
    s = { counts: {}, defaultCount: 1, custom: [], mode: 'auto', pending: null, host: env.hostId, history: [], ended: false, ...s };
    if (!s.patterns) s = { ...s, patterns: [s.pattern ?? 'line'] }; // a game saved before several patterns existed
    s = touch(s, env);
    const isHost = a.from === env.hostId;
    if (a.type === 'reset' && isHost) {
      // New game: back to the lobby with the same settings and cards. An abandoned game isn't counted.
      return { ...this.init(env, { patterns: s.patterns, mode: s.mode, memory: { history: s.history } }), custom: s.custom, counts: s.counts, defaultCount: s.defaultCount, seeds: s.seeds };
    }
    if (a.type === 'clearhistory' && isHost) return { ...s, history: [] };
    // End game: the host stops it early. It counts as played, with no winner.
    if (a.type === 'end' && isHost && s.phase === 'play') {
      return { ...s, phase: 'over', pending: null, winners: [], ended: true, history: record(s, env, []) };
    }
    if (a.type === 'mode' && isHost && MODES[a.data?.mode] && s.pending == null && s.phase !== 'over') return { ...s, mode: a.data.mode };

    if (s.phase === 'lobby') {
      if (isHost && a.type === 'pattern' && PATTERNS[a.data?.id]) return { ...s, patterns: [a.data.id] }; // just this one
      if (isHost && a.type === 'patterns') { const ids = cleanPatterns(a.data?.ids); return ids ? { ...s, patterns: ids } : s; } // any of these
      if (isHost && a.type === 'custom') {
        const cells = [...new Set((Array.isArray(a.data?.cells) ? a.data.cells : []).filter(i => Number.isInteger(i) && i >= 0 && i < 25))].sort((x, y) => x - y);
        return { ...s, custom: cells, patterns: s.patterns.includes('custom') ? s.patterns : cleanPatterns([...s.patterns, 'custom']) };
      }
      if (isHost && a.type === 'cards') {
        const count = Math.min(MAX_CARDS, Math.max(1, Math.floor(+a.data?.count) || 1));
        // '*' sets the room default (also for people who join later) and clears individual overrides.
        if (a.data?.id === '*') return { ...s, defaultCount: count, counts: {} };
        if (!knownIds(s, env).has(a.data?.id)) return s;
        const counts = { ...s.counts, [a.data.id]: count };
        if (count === (s.defaultCount ?? 1)) delete counts[a.data.id]; // back to the default: no override needed
        return { ...s, counts };
      }
      if (a.type === 'shuffle') {
        // A shuffled card must never match any other card in the room, including the player's own.
        const n = countOf(s, a.from);
        const ks = Number.isInteger(a.data?.k) ? [a.data.k].filter(k => k >= 0 && k < n) : Array.from({ length: n }, (_, k) => k);
        let next = s;
        for (const k of ks) {
          const taken = takenKeys(next, env, { id: a.from, k });
          let seed;
          do { seed = randomSeed(); } while (taken.has(cardKey(cardFor(cid(a.from, k), seed))));
          next = { ...next, seeds: { ...next.seeds, [cid(a.from, k)]: seed } };
        }
        return next;
      }
      if (a.type === 'start' && isHost && customOk(s)) {
        const seeds = { ...s.seeds };
        const seen = new Set();
        for (const id of inRoom(s, env).ids) {
          for (let k = 0; k < countOf(s, id); k++) {
            let seed = seeds[cid(id, k)] ?? 0;
            while (seen.has(cardKey(cardFor(cid(id, k), seed)))) seed = randomSeed();
            seeds[cid(id, k)] = seed;
            seen.add(cardKey(cardFor(cid(id, k), seed)));
          }
        }
        return { ...s, seeds, phase: 'play', called: [], last: null, winners: [], pending: null };
      }
    }

    if (s.phase === 'play' && isHost) {
      if (a.type === 'call' && s.mode === 'auto') {
        const n = nextNumber(s);
        return n ? reveal(s, env, n) : s;
      }
      // Private roll: the host sees the number first and chooses when everyone else does.
      if (a.type === 'roll' && s.mode === 'manual' && s.pending == null) {
        const n = nextNumber(s);
        return n ? { ...s, pending: n } : s;
      }
      if (a.type === 'reveal' && s.pending != null) return reveal(s, env, s.pending);
    }
    return s;
  },

  // A rolled-but-unrevealed number is never broadcast: the host's browser reads it from its own state (ui.raw).
  view(s) {
    const { pending, seen, ...pub } = { counts: {}, defaultCount: 1, custom: [], mode: 'auto', pending: null, history: [], ended: false, names: {}, ...s };
    return { ...pub, patterns: pub.patterns ?? [pub.pattern ?? 'line'], hasPending: pending != null };
  },
  // The host removed this player from the room: they no longer count, even within the grace period.
  drop: (s, id) => ({ ...s, seen: { ...(s.seen ?? {}), [id]: 0 } }),
  // What the room remembers about Bingo after the host moves on to another game.
  remember: s => ({ history: s.history ?? [] }),
  render(el, s, ui) {
    el._latest = { s, ui };
    // Screen-only state (open sections, search boxes, pages, selected card tab) lives on the element, not in the game.
    const U = (el._ui ??= { tab: 0, open: {}, giveq: '', allq: '', allPage: 0, ovrPage: 0, patTab: 'classic' });
    const called = new Set(s.called);
    const prevCalled = memo(el, 'called', s.called);
    const newNum = prevCalled !== undefined && s.called.length > prevCalled.length && s.last;
    if (newNum) {
      showBall(s.last);
      el._busyUntil = Date.now() + BALL_MS;
      if (s.phase === 'over') el._holdUntil = Date.now() + BALL_MS;
      rerenderAfter(el, this);
    }
    // The host's private roll plays the same ball animation, just for them.
    const secret = ui.isHost ? (ui.raw?.pending ?? null) : null;
    const prevSecret = memo(el, 'secret', secret);
    if (secret && prevSecret !== undefined && secret !== prevSecret) showBall(secret, { secret: true });

    // Let the ball finish its animation before announcing the winners.
    const holding = Date.now() < (el._holdUntil ?? 0);
    const phase = s.phase === 'over' && holding ? 'play' : s.phase;

    const myCount = countOf(s, ui.me);
    const mySeeds = Array.from({ length: myCount }, (_, k) => seedOf(s, ui.me, k));
    const prevSeeds = memo(el, 'seeds', mySeeds);
    const shuffledAt = new Set(mySeeds.flatMap((sd, k) => (prevSeeds && prevSeeds[k] !== undefined && prevSeeds[k] !== sd ? [k] : [])));
    if (shuffledAt.size) sfx('flip');

    const myWin = phase === 'over' ? s.winners.find(w => w.id === ui.me) : null;
    const ids = s.patterns;
    const one = ids.length === 1 ? ids[0] : null;
    const multiPat = ids.length > 1;
    // dashed squares on the card only when a single shape is in play (with several, the whole card would be dashed)
    const target = new Set(one && one !== 'line' ? (one === 'custom' ? s.custom : PATTERNS[one].cells) : []);
    if (phase === 'over' && fresh(el, 'over', s.called.length)) {
      if (myWin) { confetti(); sfx('win'); U.tab = myWin.k; } else sfx('ding');
    }
    U.tab = Math.min(U.tab, myCount - 1);

    const esc = ui.esc;
    const ps = ui.players;
    const nameOf = id => esc(ps.find(p => p.id === id)?.name ?? s.names?.[id] ?? ui.nameOf(id)); // a winner may have dropped out
    const defaultCount = s.defaultCount ?? 1;
    const busy = Date.now() < (el._busyUntil ?? 0);
    const hist = historyHtml(s, ui, el, phase);
    const gameNo = s.history.length + (s.phase === 'over' ? 0 : 1);
    const pager = (key, pg) => (pg.pages > 1
      ? `<div class="pager"><button class="ghost small" data-pg="${key}:-1" ${pg.page === 0 ? 'disabled' : ''}>‹ Prev</button><span class="muted">Page ${pg.page + 1} of ${pg.pages}</span><button class="ghost small" data-pg="${key}:1" ${pg.page >= pg.pages - 1 ? 'disabled' : ''}>Next ›</button></div>` : '');

    const patNow = one
      ? `<div class="patnow">${preview(previewCells(one, s.custom))}<span><b>${esc(patName(s))}</b>${one === 'line' ? '<br><small class="muted">Row, column or diagonal</small>' : ''}</span></div>`
      : `<details class="patnow-multi" data-sec="pats" ${U.open.pats ? 'open' : ''}><summary><b>🎯 ${esc(patName(s))}</b><small>win with any one</small></summary>
          <div class="patlist">${ids.map(id => `<div class="patmini">${preview(previewCells(id, s.custom))}<small>${esc(nameOfPattern(id))}</small></div>`).join('')}</div></details>`;

    // ---- the viewer's own cards: one at a time with tabs when there are several
    const myCards = () => {
      const lobby = phase === 'lobby';
      const needs = Array.from({ length: myCount }, (_, k) => needAny(cardOf(s, ui.me, k), called, s.patterns, s.custom));
      const best = Math.min(...needs);
      const tabs = myCount > 1
        ? `<div class="tabs" role="tablist">${needs.map((need, k) => `<button role="tab" class="tab ${k === U.tab ? 'on' : ''}" data-tab="${k}">Card ${k + 1}${
            lobby ? '' : `<small>${need === 0 ? '✓ bingo' : `needs ${need}${need === best ? ' ⭐' : ''}`}</small>`}</button>`).join('')}</div>` : '';
      const cards = Array.from({ length: myCount }, (_, k) => {
        const winning = myWin && myWin.k === k ? new Set(myWin.cells) : null;
        return `<div class="mycard" data-card="${k}" ${k === U.tab ? '' : 'hidden'}>${cardHtml(cardOf(s, ui.me, k), called, { target, win: winning, shuffled: shuffledAt.has(k) })}${
          lobby ? `<button class="ghost" data-shuf="${k}">🔀 Shuffle ${myCount > 1 ? 'this card' : 'my card'}</button>` : ''}</div>`;
      }).join('');
      return `${tabs}<div class="mycards">${cards}</div>${lobby && myCount > 1 ? '<button class="ghost" data-shuf="all" style="width:100%;margin-top:8px">🔀 Shuffle all my cards</button>' : ''}`;
    };

    // ---- everyone: a short summary of who holds how many cards, with a searchable list for big rooms
    const roomSummary = () => {
      const total = ps.reduce((n, p) => n + countOf(s, p.id), 0);
      const holders = [...ps].sort((a, b) => countOf(s, b.id) - countOf(s, a.id) || a.name.localeCompare(b.name));
      const multi = holders.filter(p => countOf(s, p.id) > 1);
      const shown = ps.length <= SMALL_ROOM ? holders : (multi.length ? multi : holders).slice(0, 5);
      const chips = shown.map(p => `<span class="chip ${p.id === ui.me ? 'me' : ''}">${esc(p.name)} · 🎴 ${countOf(s, p.id)}</span>`).join('')
        + (ps.length > shown.length ? `<span class="chip">+${ps.length - shown.length} more</span>` : '');
      let everyone = '';
      if (ps.length > SMALL_ROOM) {
        const pg = paginate(search(holders, U.allq), U.allPage, PER_PAGE);
        U.allPage = pg.page;
        everyone = `<button class="ghost small" data-toggle="all">${U.open.all ? 'Hide list' : `See everyone (${ps.length})`}</button>${U.open.all
          ? `<div class="biglist"><input type="search" data-keep="allq" value="${esc(U.allq)}" placeholder="Search players…" autocomplete="off">
              ${pg.items.map(p => `<div class="prow"><span>${esc(p.name)}</span><b>🎴 ${countOf(s, p.id)}</b></div>`).join('') || '<p class="muted">No players match.</p>'}${pager('all', pg)}</div>` : ''}`;
      }
      return `<div class="roomsum"><b>👥 ${ps.length} player${ps.length === 1 ? '' : 's'} · 🎴 ${total} card${total === 1 ? '' : 's'} in play</b>
        <div class="cc">${chips}</div>${everyone}</div>`;
    };

    // ---- host setup, collapsed into three sections that each summarise their current value
    const modeButtons = ui.isHost && s.pending == null && phase !== 'over'
      ? `<div class="modes">${Object.entries(MODES).map(([k, d]) =>
          `<button class="mode ${k === s.mode ? 'sel' : ''}" data-mode="${k}">${k === 'auto' ? '⚡' : '🤫'}<small>${esc(d)}</small></button>`).join('')}</div>`
      : `<p class="muted">${esc(MODES[s.mode])}</p>`;
    const section = (key, title, summary, content) => `<details class="sec" data-sec="${key}" ${U.open[key] ? 'open' : ''}>
        <summary><span>${title}</span><small>${esc(summary)}</small></summary><div class="sec-body">${content}</div></details>`;
    const stepper = p => `<div class="cs-row"><span>${nameOf(p.id)}</span>
        <button class="ghost" data-cnt="${esc(p.id)}" data-d="-1" ${countOf(s, p.id) <= 1 ? 'disabled' : ''} aria-label="Fewer cards">−</button><b>${countOf(s, p.id)}</b>
        <button class="ghost" data-cnt="${esc(p.id)}" data-d="1" ${countOf(s, p.id) >= MAX_CARDS ? 'disabled' : ''} aria-label="More cards">+</button>
        ${s.counts[p.id] !== undefined ? `<button class="ghost small" data-reset="${esc(p.id)}" title="Back to the default" aria-label="Back to the default">↺</button>` : ''}</div>`;
    const hostSetup = () => {
      const multi = U.multi ?? ids.length > 1;
      const tabSel = U.patTab ?? 'classic';
      const inGroup = g => (g === 'custom' ? ['custom'] : PRESET_IDS.filter(id => PATTERNS[id].group === g));
      const patTabs = [...Object.entries(GROUPS), ['custom', 'Custom']].map(([g, label]) => {
        const n = inGroup(g).filter(id => ids.includes(id)).length;
        return `<button role="tab" class="tab ${g === tabSel ? 'on' : ''}" data-pattab="${g}">${label}${n ? `<small>${n} ✓</small>` : ''}</button>`;
      }).join('');
      const grid = `<div class="pats">${inGroup(tabSel).map(id => {
        const on = ids.includes(id);
        return `<button class="pat ${on ? 'sel' : ''}" data-pat="${id}" aria-pressed="${on}">${on && multi ? '<span class="tick">✓</span>' : ''}${preview(previewCells(id, s.custom))}<small>${esc(PATTERNS[id].name)}</small></button>`;
      }).join('')}</div>`;
      const chosen = `<p class="muted">Winning patterns: <b>${ids.slice(0, 5).map(id => esc(nameOfPattern(id))).join(', ')}${ids.length > 5 ? ` +${ids.length - 5} more` : ''}</b></p>`;
      const controls = `<label class="check"><input type="checkbox" data-multi ${multi ? 'checked' : ''}> Select several patterns (a card wins with any one of them)</label>
        <div class="row"><button class="ghost small" data-patall>Select all</button><button class="ghost small" data-patone>Reset to “Any line”</button></div>`;
      const picker = `${controls}${chosen}<div class="tabs pattabs" role="tablist">${patTabs}</div>${grid}`;
      const editor = tabSel === 'custom'
        ? `<div class="editor"><p class="muted">Tap the squares players must complete to win. The ★ is free. Drawing here adds it to the winning patterns.</p>
            <div class="bingo">${LETTERS.map(l => `<div class="bh" style="background:${COLORS[l]}">${l}</div>`).join('')}${
              Array.from({ length: 25 }, (_, i) => i === 12
                ? '<div class="cell hit">★</div>'
                : `<button class="cell ed ${s.custom.includes(i) ? 'on' : ''}" data-cell="${i}" aria-pressed="${s.custom.includes(i)}"></button>`).join('')}</div>
            <div class="row"><button class="ghost" data-fill="none">Clear</button><button class="ghost" data-fill="all">Select all</button></div>
            ${customOk(s) ? '' : '<p class="err">Pick at least one square to continue.</p>'}</div>` : '';

      // Cards per player scales with the number of exceptions, not the number of players.
      const overrides = ps.filter(p => s.counts[p.id] !== undefined);
      let perPlayer;
      if (ps.length <= SMALL_ROOM) {
        perPlayer = ps.map(stepper).join('');
      } else {
        const pg = paginate(overrides, U.ovrPage, 5);
        U.ovrPage = pg.page;
        const q = U.giveq.trim();
        const matches = q ? search(ps, q) : [];
        perPlayer = `<h4>Players with a different number (${overrides.length})</h4>${
          overrides.length ? pg.items.map(stepper).join('') + pager('ovr', pg) : '<p class="muted">Nobody yet. Everyone has the default.</p>'}
          <h4>Give cards to a specific player</h4>
          <input type="search" data-keep="giveq" value="${esc(U.giveq)}" placeholder="Type a name…" autocomplete="off">
          ${matches.slice(0, 5).map(stepper).join('') || `<p class="muted">${q ? 'No players match.' : 'Type a name to find a player. The top 5 matches are shown.'}</p>`}
          ${matches.length > 5 ? `<p class="muted">+${matches.length - 5} more matches. Keep typing to narrow it down.</p>` : ''}`;
      }
      const cardsContent = `<div class="cs-all"><span>Everyone gets:</span>${[1, 2, 3, 4].map(n =>
          `<button class="${n === defaultCount ? '' : 'ghost'}" data-all="${n}">${n}</button>`).join('')}</div>
        <p class="muted">Also applies to anyone who joins later.</p><div class="cardset">${perPlayer}</div>`;
      return `<div class="setup"><h3>⚙️ Host setup</h3>${
        section('pattern', '🎯 Win patterns', patName(s), picker + editor)}${
        section('mode', '🎲 Number draw', s.mode === 'auto' ? 'Instant' : 'Private roll', modeButtons)}${
        section('cards', '🎴 Cards per player', `${defaultCount} each${overrides.length ? ` · ${overrides.length} different` : ''}`, cardsContent)}</div>`;
    };

    // ---- the host's main buttons stay pinned to the bottom of the screen
    let bar = '';
    if (ui.isHost) {
      if (phase === 'lobby') {
        bar = `<button id="start" class="grow" ${customOk(s) ? '' : 'disabled'}>Start game</button>`;
      } else if (phase === 'over') {
        bar = '<button id="reset" class="grow">🔄 New game</button>';
      } else {
        const primary = s.mode === 'auto'
          ? `<button id="call" class="grow" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : 'Call next number'}</button>`
          : secret ? '<button id="reveal" class="grow">📣 Reveal to everyone</button>'
          : `<button id="roll" class="grow" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : '🎲 Roll a number'}</button>`;
        bar = `${primary}${s.phase === 'play' ? '<button class="ghost danger" id="endgame" title="End game" aria-label="End game">⏹</button><button class="ghost" id="newgame" title="New game" aria-label="New game">🔄</button>' : ''}`;
      }
    }
    const actionbar = bar ? `<div class="actionbar">${bar}</div>` : '';

    let body;
    if (phase === 'lobby') {
      body = `${patNow}
        <p class="muted" style="margin:2px 0 6px">🎲 ${esc(MODES[s.mode])}</p>
        <h3>Your card${myCount > 1 ? 's' : ''}</h3>${myCards()}
        ${ui.isHost ? hostSetup() : ''}
        <h3>Players &amp; cards</h3>${roomSummary()}
        ${ui.isHost ? '' : '<p class="muted">Waiting for the host to start… You can shuffle your card until then.</p>'}
        ${hist}${actionbar}`;
    } else {
      const letter = s.last ? letterOf(s.last) : '';
      const winCards = phase === 'over' ? s.winners.map(w => `<div class="wcard ${w.id === ui.me ? 'me' : ''}">
          <div class="wname">${w.id === ui.me ? '🏆 You' : `🎉 ${nameOf(w.id)}`}${w.offline ? ' <small class="muted">· was offline</small>' : ''}${countOf(s, w.id) > 1 ? ` · card ${w.k + 1}` : ''}${multiPat ? ` · ${esc(nameOfPattern(w.pattern))}` : ''}</div>
          ${cardHtml(cardOf(s, w.id, w.k), called, { win: new Set(w.cells), mini: true })}</div>`).join('') : '';
      const secretPanel = ui.isHost && phase === 'play' && s.mode === 'manual' && secret
        ? `<div class="secret"><div class="muted">🤫 Only you can see this number</div>
            <div class="big"><span style="color:${COLORS[letterOf(secret)]}">${letterOf(secret)}</span> ${secret}</div>
            <p class="muted">Announce it, then tap “Reveal to everyone” below.</p></div>` : '';
      const modeMini = ui.isHost && phase === 'play' && s.pending == null
        ? `<details class="mini-mode"><summary>Change draw mode</summary>${modeButtons}</details>` : '';
      const waiting = !ui.isHost && phase !== 'over'
        ? (s.hasPending ? '<div class="pending"><span>?</span><p>The host rolled a number… wait for the announcement!</p></div>'
          : '<p class="muted">The host calls the numbers. Your cards mark themselves and you win automatically!</p>') : '';
      const result = phase === 'over' ? (s.ended
        ? '<div class="winners"><div class="bingo-banner ended">Game ended</div><p class="muted">The host ended this game early. No winner this time.</p></div>'
        : `<div class="winners"><div class="bingo-banner">${myWin ? (myWin.offline ? 'BINGO! You won while you were away! 🎉' : 'BINGO! You win! 🎉') : 'BINGO! 🎉'}</div>
            <p>${s.winners.map(w => `${nameOf(w.id)}${multiPat ? ` <small class="muted">(${esc(nameOfPattern(w.pattern))})</small>` : ''}`).join(' &amp; ')} completed the pattern.</p><div class="wcards">${winCards}</div></div>`) : '';
      body = `${patNow}
        <div class="lastnum"><span class="lbl">${s.called.length} called</span>
          <div class="big">${s.last ? `<span style="color:${COLORS[letter]}">${letter}</span> ${s.last}` : '—'}</div></div>
        ${result}${phase === 'over' ? hist : ''}${secretPanel}${waiting}${modeMini}
        ${numberBoard(s, called)}
        ${phase === 'over' && myWin && myCount === 1 ? '' : `<h3>Your card${myCount > 1 ? 's' : ''}</h3>${myCards()}`}
        <h3>Players &amp; cards</h3>${roomSummary()}
        ${phase === 'over' ? '' : hist}${actionbar}`;
    }

    // Keep the cursor in a search box while the screen redraws around it.
    const focused = document.activeElement;
    const focusKey = focused && el.contains(focused) ? focused.dataset?.keep : null;
    const caret = focusKey ? focused.selectionStart : null;

    el.innerHTML = `<h2>Bingo <small class="muted">· Game ${gameNo}</small></h2>${body}`;

    if (focusKey) {
      const input = el.querySelector(`[data-keep="${focusKey}"]`);
      if (input) { input.focus(); try { input.setSelectionRange(caret, caret); } catch { /* not a text field */ } }
    }
    const redraw = () => this.render(el, el._latest.s, el._latest.ui);
    el.querySelectorAll('[data-keep]').forEach(inp => inp.addEventListener('input', () => {
      U[inp.dataset.keep] = inp.value;
      if (inp.dataset.keep === 'allq') U.allPage = 0;
      redraw();
    }));
    el.querySelectorAll('details[data-sec]').forEach(d => d.addEventListener('toggle', () => { U.open[d.dataset.sec] = d.open; }));
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { U.tab = +b.dataset.tab; redraw(); });
    el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { U.open[b.dataset.toggle] = !U.open[b.dataset.toggle]; redraw(); });
    el.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
      const [key, d] = b.dataset.pg.split(':');
      if (key === 'all') U.allPage += +d; else U.ovrPage += +d;
      redraw();
    });
    el.querySelectorAll('[data-pat]').forEach(b => b.onclick = () => {
      const id = b.dataset.pat;
      if (!(U.multi ?? s.patterns.length > 1)) return ui.act('pattern', { id }); // single mode: just this one
      const next = s.patterns.includes(id) ? s.patterns.filter(x => x !== id) : [...s.patterns, id];
      if (next.length) ui.act('patterns', { ids: next }); // can't untick the last one
    });
    el.querySelectorAll('[data-pattab]').forEach(b => b.onclick = () => { U.patTab = b.dataset.pattab; redraw(); });
    el.querySelectorAll('[data-multi]').forEach(b => b.onchange = () => {
      U.multi = b.checked;
      if (!b.checked && s.patterns.length > 1) ui.act('pattern', { id: s.patterns[0] });
      redraw();
    });
    el.querySelectorAll('[data-patall]').forEach(b => b.onclick = () => {
      U.multi = true;
      ui.act('patterns', { ids: [...PRESET_IDS, ...(s.custom.some(i => i !== 12) ? ['custom'] : [])] });
    });
    el.querySelectorAll('[data-patone]').forEach(b => b.onclick = () => { U.multi = false; ui.act('pattern', { id: 'line' }); });
    el.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
      const i = +b.dataset.cell;
      ui.act('custom', { cells: s.custom.includes(i) ? s.custom.filter(x => x !== i) : [...s.custom, i] });
    });
    el.querySelectorAll('[data-fill]').forEach(b => b.onclick = () =>
      ui.act('custom', { cells: b.dataset.fill === 'all' ? Array.from({ length: 25 }, (_, i) => i).filter(i => i !== 12) : [] }));
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => ui.act('mode', { mode: b.dataset.mode }));
    el.querySelectorAll('[data-cnt]').forEach(b => b.onclick = () => ui.act('cards', { id: b.dataset.cnt, count: countOf(s, b.dataset.cnt) + +b.dataset.d }));
    el.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => ui.act('cards', { id: b.dataset.reset, count: defaultCount }));
    el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => ui.act('cards', { id: '*', count: +b.dataset.all }));
    el.querySelectorAll('[data-shuf]').forEach(b => b.onclick = () => ui.act('shuffle', b.dataset.shuf === 'all' ? {} : { k: +b.dataset.shuf }));
    el.querySelector('#start')?.addEventListener('click', () => { sfx('pop'); ui.act('start'); });
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
    el.querySelector('#endgame')?.addEventListener('click', () => { if (confirm('End this game now? It counts as played, with no winner.')) ui.act('end'); });
    el.querySelector('#newgame')?.addEventListener('click', () => { if (confirm('Abandon this game and start a new one? This game will not be counted.')) ui.act('reset'); });
    el.querySelector('#clearhist')?.addEventListener('click', () => { if (confirm('Clear the Bingo history for this room?')) ui.act('clearhistory'); });
    el.querySelector('#call')?.addEventListener('click', () => { el._busyUntil = Date.now() + BALL_MS; rerenderAfter(el, this); ui.act('call'); });
    el.querySelector('#roll')?.addEventListener('click', () => { el._busyUntil = Date.now() + BALL_MS; rerenderAfter(el, this); ui.act('roll'); });
    el.querySelector('#reveal')?.addEventListener('click', () => ui.act('reveal'));
    const histBox = el.querySelector('[data-hist]');
    if (histBox) histBox.addEventListener('toggle', () => { el._histOpen = histBox.open; });
  },
};

// Every finished game in this room: who won, which pattern, how many numbers, plus a wins tally.
function historyHtml(s, ui, el, phase) {
  if (!s.history.length) return '';
  const esc = ui.esc;
  const n = s.history.length;
  const tally = {};
  for (const h of s.history) {
    for (const w of h.winners) {
      const t = (tally[w.id] ??= { name: w.name, wins: 0 });
      t.wins++;
      t.name = ui.players.find(p => p.id === w.id)?.name ?? t.name;
    }
  }
  const chips = Object.values(tally).sort((a, b) => b.wins - a.wins)
    .map(t => `<span class="chip">🏆 ${esc(t.name)} × ${t.wins}</span>`).join('');
  const rows = [...s.history].reverse().map(h => `<tr>
      <td><b>#${h.n}</b></td>
      <td>${h.winners.length ? h.winners.map(w => `🏆 ${esc(w.name)}${w.multi ? ` <small class="muted">(card ${w.k + 1})</small>` : ''}${h.patterns > 1 && w.how ? ` <small class="muted">· ${esc(w.how)}</small>` : ''}`).join('<br>') : '<span class="muted">Ended · no winner</span>'}</td>
      <td>${esc(h.pattern)}<br><small class="muted">${h.called} numbers · ${new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></td></tr>`).join('');
  const open = el._histOpen ?? phase === 'over';
  return `<details class="hist" data-hist ${open ? 'open' : ''}><summary>📜 History · ${n} game${n > 1 ? 's' : ''} played</summary>
    ${chips ? `<div class="cc">${chips}</div>` : ''}
    <table class="table hist-table"><tr><th>Game</th><th>Winner</th><th>Pattern</th></tr>${rows}</table>
    ${ui.isHost ? '<button class="ghost" id="clearhist" style="margin-top:6px">Clear history</button>' : ''}</details>`;
}

/* ---------- pieces of the screen ---------- */

const COLORS = { B: '#1971c2', I: '#e03131', N: '#6c4cf5', G: '#2f9e44', O: '#f08c00' };
const BALL_MS = 3200;

const preview = cells => `<span class="pv">${Array.from({ length: 25 }, (_, i) => `<i class="${cells.includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;

function cardHtml(card, called, { target, win, shuffled, mini } = {}) {
  const head = LETTERS.map(l => `<div class="bh" style="background:${COLORS[l]}">${l}</div>`).join('');
  const cells = card.map((n, i) => {
    const hit = n === 0 || called.has(n);
    const cls = ['cell', hit ? 'hit' : '', win?.has(i) ? 'win' : '', !win && target?.has(i) ? 'target' : '', shuffled ? 'shuf' : ''].join(' ');
    return `<div class="${cls}" style="--i:${i}">${n === 0 ? '★' : n}</div>`;
  }).join('');
  return `<div class="bingo ${mini ? 'mini' : ''}">${head}${cells}</div>`;
}

function numberBoard(s, called) {
  return `<div class="nb">${LETTERS.map((L, ci) => `<div class="nb-row"><b style="background:${COLORS[L]}">${L}</b>${
    Array.from({ length: 15 }, (_, k) => {
      const n = ci * 15 + k + 1;
      return `<span class="${called.has(n) ? 'on' : ''} ${n === s.last ? 'last' : ''}" style="--c:${COLORS[L]}">${n}</span>`;
    }).join('')}</div>`).join('')}</div>`;
}

// Re-render once the ball animation is over so buttons re-enable and winners appear.
function rerenderAfter(el, game) {
  clearTimeout(el._rt);
  el._rt = setTimeout(() => { if (el.isConnected && el._latest) game.render(el, el._latest.s, el._latest.ui); }, BALL_MS + 30);
}

/* ---------- the ball draw ---------- */
// A full-screen overlay: the ball drops in and bounces, "rolls" through random numbers and colours
// like a slot machine, then lands on the real number with a ring and spark burst before flying off.

let stopBall = null;

function showBall(n, { secret = false } = {}) {
  stopBall?.();
  const letter = letterOf(n);
  const palette = Object.values(COLORS);
  const o = document.createElement('div');
  o.className = `bb-overlay ${secret ? 'secret' : ''}`;
  o.style.setProperty('--c', COLORS[letter]);
  o.innerHTML = `
    <div class="bb-rain">${Array.from({ length: 14 }, () => {
      const size = 10 + Math.random() * 16;
      return `<i style="left:${Math.random() * 100}%;width:${size}px;height:${size}px;background:${palette[Math.floor(Math.random() * 5)]};animation-delay:${(Math.random() * 0.45).toFixed(2)}s"></i>`;
    }).join('')}</div>
    <div class="bb-stage">
      <div class="bb-ring"></div>
      <div class="bb-sparks">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${120 + Math.random() * 70}px"></i>`).join('')}</div>
      <div class="bb-ball"><div class="bb-disc"><span class="bb-letter">${letter}</span><span class="bb-num">${n}</span></div></div>
      ${secret ? '<div class="bb-secret">🤫 Only you can see this</div>' : ''}
    </div>`;
  document.body.append(o);

  if (reduceMotion()) {
    sfx('ding');
    const t = setTimeout(() => o.remove(), 1800);
    stopBall = () => { clearTimeout(t); o.remove(); };
    return;
  }

  const ball = o.querySelector('.bb-ball');
  const numEl = o.querySelector('.bb-num');
  const letterEl = o.querySelector('.bb-letter');
  numEl.textContent = '?';
  letterEl.textContent = '';
  const timers = [];
  let roll = null;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  at(560, () => sfx('thud'));
  at(750, () => {
    ball.classList.add('rolling');
    let k = 0;
    roll = setInterval(() => {
      const r = 1 + Math.floor(Math.random() * 75);
      numEl.textContent = r;
      letterEl.textContent = letterOf(r);
      o.style.setProperty('--c', COLORS[letterOf(r)]);
      if (k++ % 2 === 0) sfx('tick');
    }, 70);
  });
  at(1700, () => {
    clearInterval(roll);
    numEl.textContent = n;
    letterEl.textContent = letter;
    o.style.setProperty('--c', COLORS[letter]);
    ball.classList.remove('rolling');
    o.classList.add('landed');
    sfx('ding');
  });
  at(2750, () => o.classList.add('leaving'));
  at(BALL_MS + 50, () => { o.remove(); stopBall = null; });
  stopBall = () => { timers.forEach(clearTimeout); clearInterval(roll); o.remove(); stopBall = null; };
}
