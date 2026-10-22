import { fresh, memo, confetti, sfx } from './fx.js';
import { nightSky, dawnCinematic } from './werewolf-fx.js';

/* ---------- roles and settings ---------- */

export const ROLES = {
  villager: { name: 'Villager', emoji: '🧑‍🌾', team: 'village', blurb: 'You have no special power. Find the werewolves by listening and voting.' },
  wolf: { name: 'Werewolf', emoji: '🐺', team: 'wolves', blurb: 'Each night, with your pack, choose a villager to eat. Stay hidden by day.' },
  seer: { name: 'Seer', emoji: '🔮', team: 'village', blurb: 'Each night, pick one player and learn whether they are a werewolf.' },
  doctor: { name: 'Doctor', emoji: '🩺', team: 'village', blurb: 'Each night, protect one player from the wolves. Not the same person two nights in a row.' },
  hunter: { name: 'Hunter', emoji: '🏹', team: 'village', blurb: 'If you die, you take one last shot at any player.' },
};

export const MIN_PLAYERS = 5;
export const MODERATORS = {
  none: { name: 'No moderator', emoji: '🤖', blurb: 'The app runs the game on timers. Everyone plays, including the host.' },
  host: { name: 'Host moderates', emoji: '🎙️', blurb: 'The host sees every role and paces the game. The host does not play.' },
  player: { name: 'A player moderates', emoji: '🙋', blurb: 'You pick one player to moderate. They see every role and pace the game; you play.' },
};
// Timer choices for the no-moderator game.
export const TIMERS = { nightSec: [30, 45, 60], daySec: [60, 120, 180, 300], voteSec: [30, 60, 90] };

const DEFAULTS = {
  mod: 'none', moderator: null, wolves: 'auto', seer: true, doctor: true, hunter: false,
  reveal: true, ghost: false, stealth: false, nightSec: 45, daySec: 180, voteSec: 60,
};

export const autoWolves = n => (n <= 7 ? 1 : Math.floor(n / 4));

// How many of each role for n players.
export function roleCounts(n, cfg) {
  const wolves = cfg.wolves === 'auto' ? autoWolves(n) : Math.min(Math.max(1, cfg.wolves | 0), Math.max(1, Math.floor((n - 1) / 2)));
  const specials = ['seer', 'doctor', 'hunter'].filter(r => cfg[r]).slice(0, Math.max(0, n - wolves));
  return { wolf: wolves, ...Object.fromEntries(specials.map(r => [r, 1])), villager: n - wolves - specials.length };
}

// Why a game can't start, or null.
export function problem(cfg, n) {
  if (n < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (${n} here${cfg.mod === 'host' ? ', not counting the moderator' : ''})`;
  if (cfg.mod === 'player' && !cfg.moderator) return 'Pick which player moderates';
  return null;
}

const shuffle = a => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/* ---------- state helpers ---------- */

const aliveIds = s => s.order.filter(id => s.alive[id]);
const wolvesAlive = s => aliveIds(s).filter(id => s.roles[id] === 'wolf');
const auto = s => s.config.mod === 'none';
export const aliveIdsOf = aliveIds;

export function winnerOf(s) {
  const w = wolvesAlive(s).length;
  const others = aliveIds(s).length - w;
  if (w === 0) return 'village';
  if (w >= others) return 'wolves';
  return null;
}

// The most-voted target; a tie is settled at random (the wolves are meant to agree out loud).
function plurality(targets) {
  const counts = {};
  for (const t of targets) counts[t] = (counts[t] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(k => counts[k] === top);
  return leaders.length ? leaders[Math.floor(Math.random() * leaders.length)] : null;
}

function kill(s, id, how, env) {
  if (!s.alive[id]) return s;
  const next = { ...s, alive: { ...s.alive, [id]: false }, deaths: [...s.deaths, { id, how, round: s.round }] };
  // A dying hunter gets a last shot (once).
  if (s.roles[id] === 'hunter' && !s.hunterUsed) next.hunter = { id, until: auto(s) ? env.now + 30000 : null };
  return next;
}

function enter(s, phase, env, extra = {}) {
  const t = env.now;
  const c = s.config;
  const base = { ...s, phase, ...extra };
  switch (phase) {
    case 'roles': return { ...base, until: auto(s) ? t + 20000 : null };
    case 'night': return {
      ...base, round: s.round + 1, night: { wolf: {}, seer: null, doctor: null, picks: {} }, muted: {}, acted: false,
      until: auto(s) ? t + c.nightSec * 1000 : null, minUntil: auto(s) ? t + Math.min(15, c.nightSec) * 1000 : null,
    };
    case 'dawn': return { ...base, until: auto(s) ? t + 8000 : null };
    case 'day': return { ...base, ready: {}, until: auto(s) ? t + c.daySec * 1000 : null };
    case 'vote': return { ...base, votes: {}, until: auto(s) ? t + c.voteSec * 1000 : null };
    case 'result': return { ...base, until: auto(s) ? t + 8000 : null };
    default: return base;
  }
}

function endGame(s, winner) {
  const entry = { n: s.history.length + 1, winner, rounds: s.round, players: s.order.length, mod: s.config.mod };
  return { ...s, phase: 'end', winner, until: null, minUntil: null, hunter: null, history: [...s.history, entry] };
}

// Everyone who has a job tonight has done it.
const allActed = s => {
  if (s.config.stealth) return aliveIds(s).every(id => s.night.picks[id] !== undefined);
  const wolves = wolvesAlive(s);
  if (wolves.some(w => s.night.wolf[w] === undefined)) return false;
  for (const role of ['seer', 'doctor']) {
    const id = aliveIds(s).find(x => s.roles[x] === role);
    if (id && s.night[role] == null) return false;
  }
  return true;
};

function resolveNight(s, env) {
  let base = s, votes, protect;
  if (s.config.stealth) {
    // Everyone picked someone; only the picks that fit each role count, the rest are decoys.
    const picks = s.night.picks;
    const ok = t => typeof t === 'string' && s.alive[t];
    votes = wolvesAlive(s).map(w => picks[w]).filter(t => ok(t) && s.roles[t] !== 'wolf');
    const doc = aliveIds(s).find(x => s.roles[x] === 'doctor');
    protect = doc && ok(picks[doc]) && picks[doc] !== s.lastProtect ? picks[doc] : null;
    const seer = aliveIds(s).find(x => s.roles[x] === 'seer');
    const look = seer ? picks[seer] : null;
    if (ok(look) && look !== seer) base = { ...base, seerLog: [...s.seerLog, { round: s.round, id: look, wolf: s.roles[look] === 'wolf' }] };
    // Anyone who did not take part in the night loses their vote today.
    base = { ...base, muted: Object.fromEntries(aliveIds(s).filter(id => picks[id] === undefined).map(id => [id, true])) };
  } else {
    votes = Object.entries(s.night.wolf).filter(([w, t]) => s.alive[w] && s.roles[w] === 'wolf' && s.alive[t]).map(([, t]) => t);
    protect = s.night.doctor;
  }
  const victim = plurality(votes);
  const died = [];
  let next = { ...base, lastProtect: protect ?? null, shots: [] };
  if (victim && victim !== protect) { next = kill(next, victim, 'wolves', env); died.push(victim); }
  next.dawn = { round: s.round, died };
  return enter(next, 'dawn', env);
}

function leaveDawn(s, env) {
  const next = s.hunter ? { ...s, hunter: null, hunterUsed: true } : s; // the hunter ran out of time
  const w = winnerOf(next);
  return w ? endGame(next, w) : enter(next, 'day', env);
}

function resolveVote(s, env) {
  const counts = {};
  for (const [voter, t] of Object.entries(s.votes)) if (s.alive[voter] && !s.muted?.[voter] && t !== 'skip' && s.alive[t]) counts[t] = (counts[t] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(k => counts[k] === top);
  const eliminated = top > 0 && leaders.length === 1 ? leaders[0] : null; // a tie eliminates nobody
  let next = { ...s, shots: [], tally: { counts, votes: s.votes, eliminated, round: s.round } };
  if (eliminated) next = kill(next, eliminated, 'vote', env);
  return enter(next, 'result', env);
}

function leaveResult(s, env) {
  const next = s.hunter ? { ...s, hunter: null, hunterUsed: true } : s;
  const w = winnerOf(next);
  return w ? endGame(next, w) : enter(next, 'night', env);
}

// Move on to the next phase (a timer ran out, or the moderator pressed the button).
function forward(s, env) {
  switch (s.phase) {
    case 'roles': return enter(s, 'night', env);
    case 'night': return resolveNight(s, env);
    case 'dawn': return leaveDawn(s, env);
    case 'day': return enter(s, 'vote', env);
    case 'vote': return resolveVote(s, env);
    case 'result': return leaveResult(s, env);
    default: return s;
  }
}

/* ---------- the game ---------- */

export const werewolf = {
  id: 'werewolf',
  name: 'Werewolf',
  emoji: '🐺',
  lateJoin: 'watch',
  inProgress: s => s.phase !== 'lobby' && s.phase !== 'end',

  init(env, opts) {
    return {
      phase: 'lobby', host: env.hostId, config: { ...DEFAULTS }, order: [], moderator: null,
      roles: {}, alive: {}, names: {}, round: 0, night: { wolf: {}, seer: null, doctor: null, picks: {} }, muted: {}, lastProtect: null, seerLog: [],
      deaths: [], dawn: null, votes: {}, tally: null, ready: {}, hunter: null, hunterUsed: false, shots: [], winner: null,
      until: null, minUntil: null, acted: false, history: opts?.memory?.history ?? [],
    };
  },

  reduce(s, a, env) {
    s = { ...s, names: { ...s.names, ...Object.fromEntries(env.players.map(p => [p.id, p.name])) } };
    const isHost = a.from === env.hostId;
    const controls = isHost || (s.config.mod === 'player' && a.from === s.moderator);

    if (a.type === 'reset' && isHost) return { ...this.init(env, { memory: { history: s.history } }), config: s.config, names: s.names };

    /* --- lobby: the host sets things up --- */
    if (s.phase === 'lobby') {
      if (a.type === 'config' && isHost) {
        const p = a.data ?? {};
        const c = { ...s.config };
        if (MODERATORS[p.mod]) { c.mod = p.mod; c.moderator = p.mod === 'host' ? env.hostId : null; }
        if (c.mod === 'player' && typeof p.moderator === 'string' && p.moderator !== env.hostId && env.players.some(x => x.id === p.moderator)) c.moderator = p.moderator;
        if (p.wolves === 'auto') c.wolves = 'auto';
        else if (Number.isInteger(p.wolves)) c.wolves = Math.min(8, Math.max(1, p.wolves));
        for (const k of ['seer', 'doctor', 'hunter', 'reveal', 'ghost', 'stealth']) if (typeof p[k] === 'boolean') c[k] = p[k];
        for (const [k, choices] of Object.entries(TIMERS)) if (choices.includes(p[k])) c[k] = p[k];
        return { ...s, config: c };
      }
      if (a.type === 'start' && isHost) {
        const c = s.config;
        const mod = c.mod === 'host' ? env.hostId : c.mod === 'player' ? c.moderator : null;
        if (c.mod === 'player' && !env.players.some(p => p.id === mod)) return s;
        const ids = env.players.map(p => p.id).filter(id => id !== mod);
        if (problem(c, ids.length)) return s;
        const counts = roleCounts(ids.length, c);
        const pool = shuffle(Object.entries(counts).flatMap(([role, n]) => Array(n).fill(role)));
        const roles = Object.fromEntries(ids.map((id, i) => [id, pool[i]]));
        return enter({
          ...s, order: ids, moderator: mod, roles, alive: Object.fromEntries(ids.map(id => [id, true])), round: 0, deaths: [], seerLog: [],
          lastProtect: null, dawn: null, tally: null, hunter: null, hunterUsed: false, shots: [], winner: null, muted: {},
        }, 'roles', env);
      }
      return s;
    }
    if (s.phase === 'end') return s;

    /* --- the person running the game (moderator or host) --- */
    if (a.type === 'advance' && controls) return forward(s, env);
    if (a.type === 'timeout' && isHost) {
      const at = this.deadline(s);
      return at && env.now >= at - 100 ? forward(s, env) : s;
    }

    const me = a.from;
    /* --- the hunter's last shot (during the morning or the vote result) --- */
    if (a.type === 'shoot' && s.hunter?.id === me && (s.phase === 'dawn' || s.phase === 'result')) {
      const t = a.data?.target;
      if (!(typeof t === 'string' && s.alive[t])) return s;
      let next = kill({ ...s, hunter: null, hunterUsed: true }, t, 'hunter', env);
      next = { ...next, shots: [...(next.shots ?? []), { by: me, target: t }], until: auto(s) ? env.now + 6000 : null };
      return next;
    }

    if (!s.alive[a.from]) return s; // the dead (and anyone not in the game) can't act

    /* --- night: wolves, seer and doctor act in secret --- */
    if (s.phase === 'night') {
      const target = a.data?.target;
      const alive = t => typeof t === 'string' && s.alive[t];
      let next = s;
      if (s.config.stealth) {
        // Face-to-face mode: everybody does the very same thing, so nobody can tell who has a job.
        if (a.type !== 'pick' || !alive(target)) return s;
        next = { ...s, night: { ...s.night, picks: { ...s.night.picks, [me]: target } } };
        return { ...next, acted: allActed(next) };
      }
      if (a.type === 'wolf' && s.roles[me] === 'wolf' && alive(target) && s.roles[target] !== 'wolf') {
        next = { ...s, night: { ...s.night, wolf: { ...s.night.wolf, [me]: target } } };
      } else if (a.type === 'seer' && s.roles[me] === 'seer' && s.night.seer == null && alive(target) && target !== me) {
        next = { ...s, night: { ...s.night, seer: target }, seerLog: [...s.seerLog, { round: s.round, id: target, wolf: s.roles[target] === 'wolf' }] };
      } else if (a.type === 'doctor' && s.roles[me] === 'doctor' && alive(target) && target !== s.lastProtect) {
        next = { ...s, night: { ...s.night, doctor: target } };
      } else return s;
      return { ...next, acted: allActed(next) };
    }

    /* --- day: talk, then vote --- */
    if (s.phase === 'day' && a.type === 'ready') {
      const ready = { ...s.ready, [me]: true };
      const next = { ...s, ready };
      return Object.keys(ready).filter(id => s.alive[id]).length > aliveIds(s).length / 2 ? enter(next, 'vote', env) : next;
    }
    if (s.phase === 'vote' && a.type === 'vote') {
      const t = a.data?.target;
      if (s.muted?.[me]) return s; // slept through the night, so no vote today
      if (t !== 'skip' && !(typeof t === 'string' && s.alive[t] && t !== me)) return s;
      const next = { ...s, votes: { ...s.votes, [me]: t } };
      return aliveIds(next).filter(id => !next.muted?.[id]).every(id => next.votes[id] !== undefined) ? resolveVote(next, env) : next;
    }

    return s;
  },

  deadline(s) {
    if ((s.phase === 'dawn' || s.phase === 'result') && s.hunter) return s.hunter.until;
    if (s.phase === 'night') return s.acted ? s.minUntil : s.until;
    return s.until ?? null;
  },

  // What everyone may see. Roles appear only when someone dies (if the host allows it) or the game ends.
  view(s) {
    const { roles, night, seerLog, lastProtect, votes, host, ...pub } = s;
    const revealed = {};
    for (const id of s.order) if (s.phase === 'end' || (!s.alive[id] && s.config.reveal)) revealed[id] = roles[id];
    const composition = {};
    for (const id of s.order) composition[roles[id]] = (composition[roles[id]] ?? 0) + 1;
    return { ...pub, revealed, composition: s.phase === 'lobby' ? {} : composition, voted: s.phase === 'vote' ? Object.keys(votes) : [], locked: s.config.stealth && s.phase === 'night' ? Object.keys(night.picks ?? {}).filter(id => s.alive[id]).length : null };
  },

  // What each player (and the moderator) may see privately. Sent encrypted, one message per person.
  priv(s) {
    if (s.phase === 'lobby' || !s.order.length) return {};
    const out = {};
    const wolves = s.order.filter(id => s.roles[id] === 'wolf');
    const nightOn = s.phase === 'night';
    for (const id of s.order) {
      const role = s.roles[id];
      const mine = { role };
      if (role === 'wolf') {
        mine.pack = wolves.filter(w => w !== id);
        if (nightOn && s.alive[id]) mine[s.config.stealth ? 'packPicks' : 'votes'] = s.config.stealth ? Object.fromEntries(wolves.filter(w => s.night.picks[w] !== undefined).map(w => [w, s.night.picks[w]])) : s.night.wolf;
      }
      if (s.config.stealth && nightOn && s.alive[id]) { mine.pick = s.night.picks[id] ?? null; mine.done = mine.pick !== null; }
      if (role === 'seer') mine.seerLog = s.seerLog;
      if (role === 'doctor') mine.lastProtect = s.lastProtect;
      if (nightOn && s.alive[id] && !s.config.stealth) mine.done = role === 'wolf' ? s.night.wolf[id] !== undefined : role === 'seer' ? s.night.seer != null : role === 'doctor' ? s.night.doctor != null : null;
      if (!s.alive[id] && s.config.ghost) mine.everyone = s.roles;
      out[id] = mine;
    }
    if (s.moderator) out[s.moderator] = { moderator: true, everyone: s.roles, night: s.night, stealth: s.config.stealth, acted: s.acted, lastProtect: s.lastProtect, seerLog: s.seerLog };
    return out;
  },

  render(el, s, ui) {
    const d = el._d ??= { show: false, myVote: null, tick: null };
    d.s = s;
    const dl = this.deadline(s);
    if (d.at !== dl) { d.at = dl; d.total = dl ? Math.max(1000, dl - Date.now()) : 0; }
    if (!d.tick) {
      d.tick = setInterval(() => {
        if (!el.isConnected) { clearInterval(d.tick); d.tick = null; return; }
        const at = d.at;
        const left = at ? Math.max(0, at - Date.now()) : 0;
        d.n = (d.n ?? 0) + 1;
        if (d.s.phase === 'night') {
          if (at && left <= 10000 && d.n % 2 === 0) sfx('heartbeat'); // the last ten seconds beat like a heart
          else if (d.n % 5 === 0) sfx(Math.random() < 0.2 ? 'wind' : 'cricket');
          if (d.n % 40 === 0) sfx('farhowl');
        } else if (d.s.phase === 'vote' && at && left <= 10000 && d.n % 2 === 0) sfx('tick');
        const t = el.querySelector('#timer');
        if (t) t.textContent = `${Math.ceil(left / 1000)}s`;
        const bar = el.querySelector('.bar i');
        if (bar && at) {
          const pct = Math.min(100, (left / d.total) * 100);
          bar.style.width = `${pct}%`;
          bar.classList.toggle('low', pct < 25);
        }
      }, 500);
    }
    if (s.phase === 'lobby' || s.phase === 'roles' || s.phase === 'end') d.myVote = null;
    if (s.phase !== 'night') d.peek = false;
    if (s.phase === 'lobby') d.show = false; // a fresh game starts with the role hidden
    if (fresh(el, 'round', `${s.round}${s.phase === 'vote' ? 'v' : ''}`)) d.myVote = null;

    const name = id => ui.esc(ui.nameOf(id));
    const me = ui.priv;
    const isMod = !!me?.moderator;
    const inGame = s.order.includes(ui.me);
    const alive = !!s.alive[ui.me];
    const role = inGame ? me?.role : null;
    const R = r => ROLES[r] ?? { name: '?', emoji: '❔' };
    const tag = id => (s.revealed[id] ? ` ${R(s.revealed[id]).emoji}` : '');
    const cfgAttr = (k, v) => `data-k="${k}" data-v="${ui.esc(JSON.stringify(v))}"`;
    const controls = ui.isHost || isMod;
    const theme = s.phase === 'night' ? 'night' : s.phase === 'lobby' || s.phase === 'end' ? '' : 'day';

    const prevPhase = memo(el, 'phase', s.phase);
    if (prevPhase !== undefined && prevPhase !== s.phase) {
      if (s.phase === 'night') { sfx('howl'); }
      else if (s.phase === 'dawn') {
        const gone = s.dawn?.died?.[0];
        dawnCinematic(gone ? { name: ui.nameOf(gone), role: s.revealed[gone] ? R(s.revealed[gone]).name : '' } : null);
      }
      else if (s.phase === 'result') sfx(s.tally?.eliminated ? 'thud' : 'blip');
      else sfx(s.phase === 'vote' ? 'flip' : 'whoosh');
    }

    const players = chips => `<div class="chips ww-players">${chips}</div>`;
    const roster = () => players(s.order.map(id => {
      const dead = !s.alive[id];
      return `<span class="chip ${dead ? 'dead' : ''} ${id === ui.me ? 'me' : ''}">${dead ? '💀 ' : ''}${name(id)}${tag(id)}</span>`;
    }).join(''));
    const timer = dl ? `<div class="bar"><i style="width:100%"></i></div><p class="muted">Time left: <span id="timer"></span></p>` : '';
    const targets = (ids, attr, picked, locked = []) => `<div class="votes">${ids.map(id =>
      `<button ${attr}="${id}" class="${picked === id ? 'sel' : ''}" ${locked.includes(id) ? 'disabled' : ''}>${name(id)}</button>`).join('')}</div>`;
    const others = (pred = () => true) => aliveIdsOf(s).filter(id => id !== ui.me && pred(id));

    /* ---- the card showing my role ---- */
    const roleCard = () => {
      if (isMod) return '<div class="role">🎙️ You are the <b>moderator</b><br><small>You see everything. Read the script aloud and press the button to move on.</small></div>';
      if (!role) return '';
      const r = R(role);
      const wolves = role === 'wolf' && me.pack?.length ? `<br><small>Pack: ${me.pack.map(name).join(', ')}</small>` : '';
      const looks = role === 'seer' && me.seerLog?.length ? `<br><small>${me.seerLog.map(l => `🔮 ${name(l.id)}: ${l.wolf ? '🐺 werewolf' : 'not a werewolf'}`).join('<br>')}</small>` : '';
      return d.show
        ? `<div class="role ww-role ${role === 'wolf' ? 'bad' : ''} ${fresh(el, 'rc', `${s.round}${d.show}`) ? 'flip' : ''}">${r.emoji} You are ${role === 'villager' ? 'a' : 'the'} <b>${r.name}</b>${alive ? '' : ' (out)'}<br><small>${r.blurb}</small>${wolves}${looks}</div>
           <button class="ghost" id="hide">🙈 Hide my role</button>`
        : '<button class="ghost ww-peek" id="peek">👁 Tap to see my role (keep your screen private)</button>';
    };

    /* ---- the moderator's control panel ---- */
    const modPanel = () => {
      const all = me.everyone ?? {};
      const list = s.order.map(id => `<tr class="${s.alive[id] ? '' : 'out'}"><td>${name(id)}</td><td>${R(all[id]).emoji} ${R(all[id]).name}</td><td>${s.alive[id] ? '' : '💀'}</td></tr>`).join('');
      let night = '';
      if (s.phase === 'night') {
        const n = me.night ?? { wolf: {} };
        const picks = Object.entries(n.wolf).map(([w, t]) => `${name(w)} → ${name(t)}`).join(', ') || '…';
        if (me.stealth) {
          night = `<div class="ww-nightlog"><b>Tonight's picks:</b><br>${s.order.filter(id => s.alive[id]).map(id => `${R(all[id]).emoji} ${name(id)} → ${n.picks?.[id] ? name(n.picks[id]) : '…'}`).join('<br>')}</div>`;
        } else night = `<div class="ww-nightlog"><b>Tonight:</b><br>🐺 ${picks}<br>🔮 ${n.seer ? name(n.seer) : '…'}<br>🩺 ${n.doctor ? name(n.doctor) : '…'}</div>`;
      }
      return `<details open><summary><b>All roles</b></summary><table class="table">${list}</table></details>${night}`;
    };
    const script = {
      roles: 'Everyone look at your role privately. Keep it secret!',
      night: '“Night falls. Everyone close your eyes. Wolves, wake up and choose a victim… Seer, doctor, do your thing… Everyone, wake up when I say.”',
      dawn: 'Announce who died (if anyone). If a hunter fell, let them shoot.',
      day: '“Discuss! Who do you think the werewolves are?”',
      vote: '“Vote now. The most-voted player is eliminated. A tie means nobody goes.”',
      result: 'Announce the vote result, then start the next night.',
    }[s.phase];
    const nextLabel = { roles: 'Start the night', night: 'Dawn breaks', dawn: 'Start the day', day: 'Open the vote', vote: 'Count the votes', result: 'Next night' }[s.phase];

    let body = '';
    /* ---------------- lobby ---------------- */
    if (s.phase === 'lobby') {
      const c = s.config;
      const here = ui.players.length;
      const n = here - (c.mod === 'none' ? 0 : 1);
      const counts = roleCounts(Math.max(n, MIN_PLAYERS), c);
      const comp = Object.entries(counts).filter(([, k]) => k > 0).map(([r, k]) => `${R(r).emoji} ${k} ${R(r).name}${k > 1 ? 's' : ''}`).join(' · ');
      const why = problem(c, n);
      const modName = c.mod === 'player' && c.moderator ? ui.nameOf(c.moderator) : '';
      if (ui.isHost) {
        const pick = (k, v, label, on) => `<button class="chip pick ${on ? 'sel' : ''}" ${cfgAttr(k, v)}>${label}</button>`;
        const tog = (k, label) => pick(k, !c[k], `${c[k] ? '✅' : '⬜'} ${label}`, c[k]);
        body = `<h3>Who runs the game?</h3>
          <div class="ww-mods">${Object.entries(MODERATORS).map(([k, m]) =>
            `<button class="chip pick ${c.mod === k ? 'sel' : ''}" ${cfgAttr('mod', k)}>${m.emoji} ${m.name}</button>`).join('')}</div>
          <p class="muted">${MODERATORS[c.mod].blurb}</p>
          ${c.mod === 'player' ? `<h3>Moderator</h3><div class="chips">${ui.players.filter(p => p.id !== ui.me).map(p => pick('moderator', p.id, ui.esc(p.name), c.moderator === p.id)).join('') || '<span class="muted">Waiting for someone to join…</span>'}</div>` : ''}
          <h3>Werewolves</h3><div class="chips">${pick('wolves', 'auto', 'Auto', c.wolves === 'auto')}${[1, 2, 3, 4].map(k => pick('wolves', k, k, c.wolves === k)).join('')}</div>
          <h3>Roles</h3><div class="chips">${tog('seer', '🔮 Seer')}${tog('doctor', '🩺 Doctor')}${tog('hunter', '🏹 Hunter')}</div>
          <h3>Rules</h3><div class="chips">${tog('reveal', 'Show role of the dead')}${tog('ghost', 'Dead players see all roles')}${tog('stealth', '🕵️ Face-to-face mode')}</div>
          ${c.stealth ? '<p class="muted">Sitting together? At night everyone gets the same screen and must pick a player, so nobody can tell who the wolves, seer or doctor are. Only the right picks count. Anyone who skips the night can\'t vote the next day.</p>' : ''}
          ${c.mod === 'none' ? `<h3>Timers</h3>
            <p class="muted">Night</p><div class="chips">${TIMERS.nightSec.map(v => pick('nightSec', v, `${v}s`, c.nightSec === v)).join('')}</div>
            <p class="muted">Discussion</p><div class="chips">${TIMERS.daySec.map(v => pick('daySec', v, `${v / 60 >= 1 ? v / 60 + ' min' : v + 's'}`, c.daySec === v)).join('')}</div>
            <p class="muted">Voting</p><div class="chips">${TIMERS.voteSec.map(v => pick('voteSec', v, `${v}s`, c.voteSec === v)).join('')}</div>` : ''}`;
      } else {
        body = `<p><b>${MODERATORS[c.mod].emoji} ${MODERATORS[c.mod].name}</b>${modName ? `: ${ui.esc(modName)}` : ''}</p><p class="muted">${MODERATORS[c.mod].blurb}</p>
          <p class="muted">Seer ${c.seer ? '✅' : '—'} · Doctor ${c.doctor ? '✅' : '—'} · Hunter ${c.hunter ? '✅' : '—'}${c.stealth ? ' · 🕵️ Face-to-face mode' : ''}</p>`;
      }
      body += `<div class="ww-comp"><b>${n >= MIN_PLAYERS ? n : '5+'} players:</b> ${comp}</div>
        ${why ? `<p class="muted">${ui.esc(why)}</p>` : ''}
        ${ui.isHost ? `<button id="start" ${why ? 'disabled' : ''}>Start the game</button>` : '<p class="muted">Waiting for the host to start…</p>'}`;
      if (s.history.length) body += `<h3>Past games</h3><p class="muted">${s.history.map(h => `#${h.n} ${h.winner === 'wolves' ? '🐺' : '🏡'} (${h.rounds} nights)`).join(' · ')}</p>`;
    }

    /* ---------------- role reveal ---------------- */
    else if (s.phase === 'roles') {
      body = `<h3>Look at your role</h3>${roleCard()}${timer}
        <p class="muted">${s.order.length} players. ${Object.entries(s.composition).map(([r, k]) => `${R(r).emoji}${k}`).join(' ')}</p>`;
    }

    /* ---------------- night ---------------- */
    else if (s.phase === 'night') {
      let act = '';
      if (isMod) act = '';
      else if (inGame && alive && s.config.stealth) {
        // Face-to-face mode: the same screen for every role, so nobody can read it over a shoulder.
        const peekText = d.peek ? (() => {
          const bits = {
            wolf: `🐺 You are a werewolf. Pack: ${(me.pack ?? []).map(name).join(', ') || 'none'}.<br>Your pack's picks so far: ${Object.entries(me.packPicks ?? {}).map(([w, x]) => `${name(w)} → ${name(x)}`).join(', ') || 'none'}.<br>Pick a villager (not your pack). The most-picked one is eaten.`,
            seer: '🔮 You are the seer. Your pick is inspected. The answer arrives in the morning.',
            doctor: `🩺 You are the doctor. Your pick is protected tonight${me.lastProtect ? ` (not ${name(me.lastProtect)}, who you saved last night)` : ''}.`,
          }[role] ?? `${R(role).emoji} Your pick is only a decoy. Nothing happens, but you must still pick so you can vote tomorrow.`;
          return `<div class="role ww-peek-card">${bits}</div>`;
        })() : '';
        act = `<h3>Pick a player</h3><p class="muted">Everyone picks one player, whatever their role. No pick means no vote tomorrow.</p>
          ${targets(aliveIdsOf(s), 'data-pick', me.pick)}
          <p class="muted">${me.done ? '✅ Locked in (you can still change it).' : '⏳ Not picked yet.'} ${s.locked ?? 0}/${aliveIdsOf(s).length} locked in.</p>
          <button class="ghost" id="peeknight">👁 Peek at what my pick does</button>${peekText}`;
      }
      else if (!inGame) act = '<p>🌙 It is night. You are watching.</p>';
      else if (!alive) act = '<p>💀 You are out. Stay quiet and watch.</p>';
      else if (role === 'wolf') {
        const mine = me.votes?.[ui.me];
        const counts = {};
        for (const t of Object.values(me.votes ?? {})) counts[t] = (counts[t] ?? 0) + 1;
        act = `<h3>🐺 Choose a victim</h3><p class="muted">Agree with your pack out loud (whispers!). Most votes wins.</p>
          <div class="votes">${others(id => s.roles?.[id] !== 'wolf' && !me.pack.includes(id)).map(id =>
            `<button data-wolf="${id}" class="${mine === id ? 'sel' : ''}">${name(id)}${counts[id] ? ` · ${counts[id]}🐺` : ''}</button>`).join('')}</div>`;
      } else if (role === 'seer') {
        const last = (me.seerLog ?? []).find(l => l.round === s.round);
        act = me.done
          ? `<h3>🔮 You looked at ${name(last.id)}</h3><p class="${last.wolf ? 'err' : ''}"><b>${last.wolf ? '🐺 They ARE a werewolf!' : '🧑‍🌾 They are NOT a werewolf.'}</b></p>`
          : `<h3>🔮 Who do you want to inspect?</h3>${targets(others(), 'data-seer', null)}`;
      } else if (role === 'doctor') {
        act = me.done
          ? '<h3>🩺 Protection set</h3><p class="muted">Now wait for the morning.</p>'
          : `<h3>🩺 Who do you protect tonight?</h3><p class="muted">Can be yourself, but not the same person as last night.</p>${targets(aliveIdsOf(s), 'data-doc', null, me.lastProtect ? [me.lastProtect] : [])}`;
      } else act = '<div class="ww-sleep">😴<p>Eyes closed. The night is quiet…</p></div>';
      body = `${nightSky()}<h3>🌙 Night ${s.round}</h3>${roleCard()}${act}${timer}`;
    }

    /* ---------------- dawn ---------------- */
    else if (s.phase === 'dawn') {
      const died = s.dawn?.died ?? [];
      const shot = (s.shots ?? []).map(x => `🏹 ${name(x.by)} shot ${name(x.target)}${tag(x.target)}`).join('<br>');
      let hunter = '';
      if (s.hunter) hunter = s.hunter.id === ui.me
        ? `<h3>🏹 Take your last shot!</h3>${targets(others(), 'data-shoot', null)}`
        : `<p>🏹 <b>${name(s.hunter.id)}</b> was the hunter, and is taking a last shot…</p>`;
      body = `<h3>☀️ Morning of day ${s.round}</h3>
        ${died.length ? died.map(id => `<p class="status-pop"><b>💀 ${name(id)}</b> was killed in the night${tag(id)}.</p>`).join('') : '<p class="status-pop"><b>😮 Nobody died tonight!</b></p>'}
        ${shot ? `<p>${shot}</p>` : ''}${hunter}${roleCard()}${timer}`;
    }

    /* ---------------- day ---------------- */
    else if (s.phase === 'day') {
      const readyN = Object.keys(s.ready).filter(id => s.alive[id]).length;
      const aliveN = aliveIdsOf(s).length;
      const mutedNames = Object.keys(s.muted ?? {}).filter(id => s.alive[id]);
      body = `<h3>🗣️ Day ${s.round}: discuss!</h3>${mutedNames.length ? `<p class="banner">🔇 ${mutedNames.map(name).join(', ')} skipped the night and can't vote today.</p>` : ''}<p class="muted">Who is acting suspicious? Talk it out loud.</p>${roleCard()}${timer}
        ${alive && inGame ? (s.ready[ui.me] ? '<p class="muted">You are ready to vote.</p>' : '<button id="ready">✋ I\'m ready to vote</button>') : ''}
        <p class="muted">${readyN}/${aliveN} ready · majority starts the vote</p>`;
    }

    /* ---------------- vote ---------------- */
    else if (s.phase === 'vote') {
      let pick = '';
      if (alive && inGame && s.muted?.[ui.me]) pick = '<p class="banner">🔇 You skipped the night, so you can\'t vote today.</p>';
      else if (alive && inGame) {
        pick = s.voted.includes(ui.me)
          ? `<p class="muted">Vote locked in${d.myVote ? `: ${d.myVote === 'skip' ? 'skip' : name(d.myVote)}` : ''}. Waiting for the others…</p>`
          : `${targets(others(), 'data-vote', null)}<button class="ghost" data-vote="skip">Skip (vote for nobody)</button>`;
      }
      body = `<h3>🗳️ Vote someone out</h3>${roleCard()}${pick}${timer}
        <p class="muted">${s.voted.length}/${aliveIdsOf(s).filter(id => !s.muted?.[id]).length} voted</p>
        ${players(aliveIdsOf(s).map(id => `<span class="chip ${s.voted.includes(id) ? 'new' : ''}">${s.muted?.[id] ? '🔇' : s.voted.includes(id) ? '✅' : '⏳'} ${name(id)}</span>`).join(''))}`;
    }

    /* ---------------- vote result ---------------- */
    else if (s.phase === 'result') {
      const t = s.tally;
      const lines = Object.entries(t?.counts ?? {}).sort((a, b) => b[1] - a[1]).map(([id, k]) => `${name(id)}: <b>${k}</b>`).join(' · ');
      const skips = Object.values(t?.votes ?? {}).filter(v => v === 'skip').length;
      const shot = (s.shots ?? []).map(x => `🏹 ${name(x.by)} shot ${name(x.target)}${tag(x.target)}`).join('<br>');
      let hunter = '';
      if (s.hunter) hunter = s.hunter.id === ui.me
        ? `<h3>🏹 Take your last shot!</h3>${targets(others(), 'data-shoot', null)}`
        : `<p>🏹 <b>${name(s.hunter.id)}</b> was the hunter, and is taking a last shot…</p>`;
      body = `<h3>${t?.eliminated ? `💀 ${name(t.eliminated)} is out${tag(t.eliminated)}` : '🤝 Nobody was eliminated'}</h3>
        <p class="muted">${lines || 'No votes'}${skips ? ` · skipped: ${skips}` : ''}</p>${shot ? `<p>${shot}</p>` : ''}${hunter}${roleCard()}${timer}`;
    }

    /* ---------------- game over ---------------- */
    else if (s.phase === 'end') {
      if (fresh(el, 'end', s.history.length)) {
        const mine = role ? R(role).team === s.winner : null;
        if (s.winner === 'wolves') sfx('howl');
        if (mine === false) sfx('lose'); else { confetti(); sfx('win'); }
      }
      body = `<h3 class="status-pop">${s.winner === 'wolves' ? '🐺 The werewolves win!' : '🏡 The village wins!'}</h3>
        <table class="table">${s.order.map(id => `<tr class="${s.alive[id] ? '' : 'out'}"><td>${name(id)}</td><td>${R(s.revealed[id]).emoji} ${R(s.revealed[id]).name}</td><td>${s.alive[id] ? '✅ survived' : '💀'}</td></tr>`).join('')}</table>
        ${s.moderator ? `<p class="muted">Moderator: ${name(s.moderator)}</p>` : ''}
        <p class="muted">Games played: ${s.history.length} · 🏡 ${s.history.filter(h => h.winner === 'village').length} · 🐺 ${s.history.filter(h => h.winner === 'wolves').length}</p>`;
    }

    /* ---- shared bottom part ---- */
    const showRoster = s.phase !== 'lobby' && s.phase !== 'end' && s.order.length;
    const modBlock = isMod && s.phase !== 'lobby' && s.phase !== 'end' ? `<div class="ww-script"><p>🎙️ <i>${script}</i></p>${modPanel()}</div>` : '';
    const ghost = !alive && inGame && me?.everyone && s.phase !== 'end'
      ? `<details><summary>👻 All roles</summary><table class="table">${s.order.map(id => `<tr><td>${name(id)}</td><td>${R(me.everyone[id]).emoji} ${R(me.everyone[id]).name}</td></tr>`).join('')}</table></details>` : '';
    const spectate = ui.spectator ? '' : '';
    const buttons = [];
    if (controls && nextLabel && s.phase !== 'lobby' && s.phase !== 'end') buttons.push(`<button id="adv" class="${isMod ? '' : 'ghost'}">${isMod ? '▶ ' : '⏭ Skip ahead: '}${nextLabel}</button>`);
    if (ui.isHost && s.phase !== 'lobby') buttons.push(`<button class="ghost" id="reset">${s.phase === 'end' ? '🔁 Play again' : '✖ End game'}</button>`);

    el.innerHTML = `<div class="ww ${theme}"><h2>🐺 Werewolf</h2>
      ${showRoster ? `<p class="muted">${aliveIdsOf(s).length} alive of ${s.order.length}</p>${roster()}` : ''}
      ${spectate}${modBlock}${body}${ghost}
      ${buttons.length ? `<div class="row ww-ctl">${buttons.join('')}</div>` : ''}</div>`;

    /* ---- wiring ---- */
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
    on('[data-k]', b => ui.act('config', { [b.dataset.k]: JSON.parse(b.dataset.v) }));
    on('#start', () => ui.act('start'));
    on('#peek', () => { d.show = true; this.render(el, d.s, ui); });
    on('#hide', () => { d.show = false; this.render(el, d.s, ui); });
    on('[data-wolf]', b => sfx('blip') || ui.act('wolf', { target: b.dataset.wolf }));
    on('[data-pick]', b => sfx('blip') || ui.act('pick', { target: b.dataset.pick }));
    on('#peeknight', () => { d.peek = true; clearTimeout(d.peekT); d.peekT = setTimeout(() => { d.peek = false; if (el.isConnected) this.render(el, d.s, ui); }, 4000); this.render(el, d.s, ui); });
    on('[data-seer]', b => sfx('blip') || ui.act('seer', { target: b.dataset.seer }));
    on('[data-doc]', b => sfx('blip') || ui.act('doctor', { target: b.dataset.doc }));
    on('[data-shoot]', b => sfx('slash') || ui.act('shoot', { target: b.dataset.shoot }));
    on('[data-vote]', b => { d.myVote = b.dataset.vote; ui.act('vote', { target: b.dataset.vote }); });
    on('#ready', () => ui.act('ready'));
    on('#adv', () => ui.act('advance'));
    on('#reset', () => ui.act('reset'));
  },

  remember: s => ({ history: s.history ?? [] }),
};
