import { fresh, memo, confetti, sfx } from './fx.js';
import { nightSky, daySky, dawnCinematic, saveToast } from './werewolf-fx.js';

/* ---------- roles and settings ---------- */

export const ROLES = {
  villager: { name: 'Villager', emoji: '🧑‍🌾', team: 'village', blurb: 'You have no special power. Find the werewolves by listening and voting.' },
  wolf: { name: 'Werewolf', emoji: '🐺', team: 'wolves', blurb: 'Each night, with your pack, choose a villager to eat. Stay hidden by day.' },
  seer: { name: 'Seer', emoji: '🔮', team: 'village', blurb: 'Each night, pick one player and learn whether they are a werewolf.' },
  doctor: { name: 'Doctor', emoji: '🩺', team: 'village', blurb: 'Each night, protect one player from the wolves. Not the same person two nights in a row.' },
  hunter: { name: 'Hunter', emoji: '🏹', team: 'village', blurb: 'If you die, you take one last shot at any player.' },
  bodyguard: { name: 'Bodyguard', emoji: '🛡️', team: 'village', blurb: 'Each night, guard one other player. If the wolves attack them, you die in their place.' },
  witch: { name: 'Witch', emoji: '🧙‍♀️', team: 'village', blurb: 'You have one healing potion and one poison for the whole game. Save the wolves\' victim, or poison anyone.' },
  cupid: { name: 'Cupid', emoji: '💘', team: 'village', blurb: 'On the first night, pick two lovers. If one of them dies, the other dies of a broken heart.' },
  tanner: { name: 'Tanner', emoji: '🎭', team: 'tanner', blurb: 'You are tired of life. You win, alone, if the village votes you out!' },
};
// Roles the host can switch on, in the order they are handed out when there are few players.
export const SPECIALS = ['seer', 'doctor', 'hunter', 'bodyguard', 'witch', 'cupid', 'tanner'];

export const MIN_PLAYERS = 5;
export const MODERATORS = {
  none: { name: 'No moderator', emoji: '🤖', blurb: 'The app runs the game on timers. Everyone plays, including the host.' },
  host: { name: 'Host moderates', emoji: '🎙️', blurb: 'The host sees every role and paces the game. The host does not play.' },
  player: { name: 'A player moderates', emoji: '🙋', blurb: 'You pick one player to moderate. They see every role and pace the game; you play.' },
};
// Timer choices for the no-moderator game.
export const TIMERS = { nightSec: [30, 45, 60], daySec: [60, 120, 180, 300], voteSec: [30, 60, 90] };

const DEFAULTS = {
  mod: 'none', moderator: null, wolves: 'auto', seer: true, doctor: true, hunter: false, bodyguard: false, witch: false, cupid: false, tanner: false,
  reveal: true, ghost: false, stealth: false, openVotes: false, showVotes: true, runoff: false, nightSec: 45, daySec: 180, voteSec: 60,
};
const FLAGS = [...SPECIALS, 'reveal', 'ghost', 'stealth', 'openVotes', 'showVotes', 'runoff'];

export const autoWolves = n => (n <= 7 ? 1 : Math.floor(n / 4));

// How many of each role for n players.
export function roleCounts(n, cfg) {
  const wolves = cfg.wolves === 'auto' ? autoWolves(n) : Math.min(Math.max(1, cfg.wolves | 0), Math.max(1, Math.floor((n - 1) / 2)));
  const specials = SPECIALS.filter(r => cfg[r]).slice(0, Math.max(0, n - wolves));
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
const holder = (s, role) => aliveIds(s).find(x => s.roles[x] === role);
const auto = s => s.config.mod === 'none';
export const aliveIdsOf = aliveIds;
export const teamOf = (s, id) => (s.roles[id] === 'wolf' ? 'wolves' : s.roles[id] === 'tanner' ? 'tanner' : 'village');
// How long someone may be offline before the host is asked what to do.
export const GRACE_MS = 120000;
const graceOf = s => s.grace ?? GRACE_MS;
const needed = (s, id) => !s.stale?.includes(id); // people who are offline too long are not waited for
// A testing knob: localStorage.hubGraceMs shortens the 2-minute grace period.
const testGrace = () => { try { return Number(localStorage.getItem('hubGraceMs')) || undefined; } catch { return undefined; } };
const freshNight = () => ({ wolf: {}, seer: null, doctor: null, guard: null, heal: null, poison: null, witchDone: false, picks: {} });

export function winnerOf(s) {
  const alive = aliveIds(s);
  const w = wolvesAlive(s).length;
  // Two lovers on opposite sides who outlast everyone else win together.
  if (s.lovers && alive.length === 2 && alive.every(id => s.lovers.includes(id)) && (s.roles[alive[0]] === 'wolf') !== (s.roles[alive[1]] === 'wolf')) return 'lovers';
  if (w === 0) return 'village';
  if (w >= alive.length - w) return 'wolves';
  return null;
}

// The most-picked target. Ties are settled by seating order, so the witch's preview matches what happens.
function plurality(targets, order) {
  const counts = {};
  for (const t of targets) counts[t] = (counts[t] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(k => counts[k] === top).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return leaders[0] ?? null;
}

// What the wolves have decided so far (null until every wolf has chosen).
function wolfTarget(s) {
  const wolves = wolvesAlive(s).filter(w => needed(s, w));
  if (!wolves.length || wolves.some(w => s.night.wolf[w] === undefined)) return null;
  return plurality(wolves.map(w => s.night.wolf[w]).filter(t => s.alive[t]), s.order);
}

function kill(s, id, how, env) {
  if (!s.alive[id]) return s;
  let next = { ...s, alive: { ...s.alive, [id]: false }, deaths: [...s.deaths, { id, how, round: s.round }] };
  // A dying hunter gets a last shot (once).
  if (s.roles[id] === 'hunter' && !s.hunterUsed && !s.hunter && how !== 'left') next.hunter = { id, until: auto(s) ? env.now + 30000 : null };
  // Lovers die together.
  const mate = s.lovers?.includes(id) ? s.lovers.find(x => x !== id) : null;
  if (mate && next.alive[mate]) next = kill(next, mate, 'love', env);
  return next;
}

function enter(s, phase, env, extra = {}) {
  const t = env.now;
  const c = s.config;
  const base = { ...s, phase, ...extra };
  switch (phase) {
    case 'roles': return { ...base, until: auto(s) ? t + 20000 : null };
    case 'night': return {
      ...base, round: s.round + 1, night: freshNight(), muted: {}, acted: false, candidates: null, runoff: false,
      until: auto(s) ? t + c.nightSec * 1000 : null, minUntil: auto(s) ? t + Math.min(15, c.nightSec) * 1000 : null,
    };
    case 'dawn': return { ...base, until: auto(s) ? t + 8000 : null };
    case 'day': return { ...base, ready: {}, until: auto(s) ? t + c.daySec * 1000 : null };
    case 'vote': return { ...base, votes: {}, until: auto(s) ? t + c.voteSec * 1000 : null };
    case 'result': return { ...base, until: auto(s) ? t + 12000 : null };
    default: return base;
  }
}

function endGame(s, winner) {
  const won = id => (winner === 'lovers' ? s.lovers?.includes(id) : teamOf(s, id) === winner);
  const stats = { ...s.stats };
  for (const id of s.order) {
    const st = stats[id] ?? { played: 0, wins: 0, survived: 0 };
    stats[id] = { name: s.names[id] ?? st.name ?? '?', played: st.played + 1, wins: st.wins + (won(id) ? 1 : 0), survived: st.survived + (s.alive[id] ? 1 : 0) };
  }
  const entry = { n: s.history.length + 1, winner, rounds: s.round, players: s.order.length, mod: s.config.mod, winners: s.order.filter(won) };
  return { ...s, phase: 'end', winner, until: null, minUntil: null, hunter: null, stats, history: [...s.history, entry] };
}

// Everyone who has a job tonight has done it.
const allActed = s => {
  if (s.config.stealth) return aliveIds(s).filter(id => needed(s, id)).every(id => s.night.picks[id] !== undefined);
  const wolves = wolvesAlive(s).filter(w => needed(s, w));
  if (wolves.some(w => s.night.wolf[w] === undefined)) return false;
  const job = role => { const id = holder(s, role); return id && needed(s, id); };
  for (const role of ['seer', 'doctor']) if (job(role) && s.night[role] == null) return false;
  if (job('bodyguard') && s.night.guard == null) return false;
  if (job('cupid') && s.round === 1 && !s.lovers) return false;
  if (job('witch') && (s.witch?.heal || s.witch?.poison) && !s.night.witchDone) return false;
  return true;
};

function resolveNight(s, env) {
  let base = s, votes, protect, guard, look;
  if (s.config.stealth) {
    // Everyone picked someone; only the picks that fit each role count, the rest are decoys.
    const picks = s.night.picks;
    const ok = t => typeof t === 'string' && s.alive[t];
    votes = wolvesAlive(s).map(w => picks[w]).filter(t => ok(t) && s.roles[t] !== 'wolf');
    const doc = holder(s, 'doctor');
    protect = doc && ok(picks[doc]) && picks[doc] !== s.lastProtect ? picks[doc] : null;
    const bg = holder(s, 'bodyguard');
    guard = bg && ok(picks[bg]) && picks[bg] !== bg ? picks[bg] : null;
    const seer = holder(s, 'seer');
    look = seer && ok(picks[seer]) && picks[seer] !== seer ? picks[seer] : null;
    if (look) base = { ...base, seerLog: [...s.seerLog, { round: s.round, id: look, wolf: s.roles[look] === 'wolf' }] };
    // Anyone who did not take part in the night loses their vote today.
    base = { ...base, muted: Object.fromEntries(aliveIds(s).filter(id => picks[id] === undefined).map(id => [id, true])) };
  } else {
    votes = Object.entries(s.night.wolf).filter(([w, t]) => s.alive[w] && s.roles[w] === 'wolf' && s.alive[t]).map(([, t]) => t);
    protect = s.night.doctor;
    guard = s.night.guard;
    look = s.night.seer;
  }
  const victim = plurality(votes, s.order);
  const before = s.deaths.length;
  const entry = { kind: 'night', round: s.round, target: victim, protect: protect ?? null, guard: guard ?? null, seer: look ? { id: look, wolf: s.roles[look] === 'wolf' } : null, lovers: s.round === 1 ? s.lovers ?? null : null };
  let next = { ...base, lastProtect: protect ?? null, shots: [], savedLast: null };
  let witch = s.witch;
  const bodyguard = holder(s, 'bodyguard');
  if (victim) {
    if (victim === protect) { next.savedLast = { by: 'doctor', id: victim }; entry.saved = 'doctor'; }
    else if (!s.config.stealth && witch?.heal && s.night.heal === victim) { witch = { ...witch, heal: false }; next.savedLast = { by: 'witch', id: victim }; entry.saved = 'witch'; }
    else if (bodyguard && guard === victim) { next = kill(next, bodyguard, 'guard', env); entry.saved = 'bodyguard'; }
    else next = kill(next, victim, 'wolves', env);
  }
  const poison = s.config.stealth ? null : s.night.poison;
  if (poison && witch?.poison && next.alive[poison]) { witch = { ...witch, poison: false }; next = kill(next, poison, 'poison', env); entry.poison = poison; }
  next.witch = witch;
  entry.died = next.deaths.slice(before).map(x => x.id);
  next.dawn = { round: s.round, died: entry.died };
  next.recap = [...s.recap, entry];
  return enter(next, 'dawn', env);
}

const votesDone = s => aliveIds(s).filter(id => !s.muted?.[id] && needed(s, id)).every(id => s.votes[id] !== undefined);

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
  // A tie either goes to a second vote between the tied players (if the host wants that) or eliminates nobody.
  if (leaders.length > 1 && s.config.runoff && !s.runoff) return enter({ ...s, runoff: true, candidates: leaders }, 'vote', env);
  const eliminated = top > 0 && leaders.length === 1 ? leaders[0] : null;
  let next = { ...s, shots: [], tally: { counts, votes: s.votes, skips: Object.entries(s.votes).filter(([v, x]) => x === 'skip' && s.alive[v] && !s.muted?.[v]).length, eliminated, round: s.round, runoff: !!s.runoff } };
  next.recap = [...s.recap, { kind: 'vote', round: s.round, counts, votes: s.votes, eliminated, runoff: !!s.runoff }];
  if (eliminated) next = kill(next, eliminated, 'vote', env);
  return enter(next, 'result', env);
}

function leaveResult(s, env) {
  const next = s.hunter ? { ...s, hunter: null, hunterUsed: true } : s;
  const out = next.tally?.eliminated;
  if (out && next.tally.round === next.round && next.roles[out] === 'tanner') return endGame(next, 'tanner');
  const w = winnerOf(next);
  return w ? endGame(next, w) : enter(next, 'night', env);
}

// Move on to the next phase (a timer ran out, or the moderator pressed the button).
function forward(s, env) {
  switch (s.phase) {
    case 'roles': return enter(s, 'night', env);
    case 'night': return resolveNight(s, env);
    case 'dawn': return leaveDawn(s, env);
    case 'day': return enter(s, 'vote', env, { candidates: null, runoff: false });
    case 'vote': return resolveVote(s, env);
    case 'result': return leaveResult(s, env);
    default: return s;
  }
}

// When the current phase ends by itself (null when it waits for the moderator).
function baseDeadline(s) {
  if ((s.phase === 'dawn' || s.phase === 'result') && s.hunter) return s.hunter.until;
  if (s.phase === 'night') return s.acted && s.minUntil != null ? s.minUntil : s.until;
  return s.until ?? null;
}

/* ---------- people who drop out ---------- */

// Who is in the game but not in the room right now, and for how long.
function presence(s, env) {
  if (!s.stale) s = { ...s, stale: [], away: s.away ?? {}, auto: s.auto ?? {}, paused: s.paused ?? null };
  if (!s.order.length || s.phase === 'lobby' || s.phase === 'end') return s;
  const here = new Set(env.players.map(p => p.id));
  const people = [...aliveIds(s), ...(s.config.mod === 'player' && s.moderator ? [s.moderator] : [])].filter(id => id !== env.hostId);
  const away = {};
  for (const id of people) if (!here.has(id)) away[id] = s.away?.[id] ?? env.now;
  const auto = Object.fromEntries(Object.keys(s.auto ?? {}).filter(id => !here.has(id) && s.alive[id]).map(id => [id, true])); // back again: they play for themselves
  const stale = s.paused ? s.stale : Object.keys(away).filter(id => away[id] + graceOf(s) <= env.now && !auto[id]);
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  if (same(away, s.away ?? {}) && same(auto, s.auto ?? {}) && stale.length === s.stale.length && stale.every((x, i) => x === s.stale[i])) return s;
  return settle({ ...s, away, auto, stale }, env);
}

// After somebody is no longer waited for, the night or the vote may be complete.
function settle(s, env) {
  if (s.phase === 'night' && !s.paused) { const acted = allActed(s); if (acted !== s.acted) return { ...s, acted }; }
  if (s.phase === 'vote' && !s.paused && Object.keys(s.votes).length && votesDone(s)) return resolveVote(s, env);
  return s;
}

const PHASE_SEC = { roles: 20, dawn: 8, result: 12 };
// The app plays for people who are away and have been put on autopilot: random but legal moves, nothing clever.
function autoplay(s, env, game) {
  if (!s.auto || !Object.keys(s.auto).length || s.phase === 'lobby' || s.phase === 'end' || s.paused) return s;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  let n = s;
  for (let pass = 0; pass < 3; pass++) {
    const before = n;
    for (const id of Object.keys(n.auto)) {
      if (!n.alive[id]) continue;
      const live = aliveIds(n), oth = live.filter(x => x !== id), role = n.roles[id];
      const go = (type, data) => { n = game.step(n, { from: id, type, data }, env); };
      if (n.phase === 'night') {
        if (n.config.stealth) { if (n.night.picks[id] === undefined) go('pick', { target: pick(live) }); continue; }
        if (role === 'wolf' && n.night.wolf[id] === undefined) go('wolf', { target: pick(live.filter(x => n.roles[x] !== 'wolf')) });
        else if (role === 'seer' && n.night.seer == null) go('seer', { target: pick(oth) });
        else if (role === 'doctor' && n.night.doctor == null) go('doctor', { target: pick(live.filter(x => x !== n.lastProtect)) });
        else if (role === 'bodyguard' && n.night.guard == null) go('guard', { target: pick(oth) });
        else if (role === 'cupid' && n.round === 1 && !n.lovers && oth.length > 1) { const two = [...oth].sort(() => Math.random() - 0.5); go('cupid', { a: two[0], b: two[1] }); }
        else if (role === 'witch' && !n.night.witchDone) go('witchPass');
      } else if (n.phase === 'vote' && n.votes[id] === undefined && !n.muted?.[id]) go('vote', { target: 'skip' });
      else if ((n.phase === 'dawn' || n.phase === 'result') && n.hunter?.id === id) go('shoot', { target: pick(live) });
    }
    if (n === before) break;
  }
  return n;
}

/* ---------- the game ---------- */

export const werewolf = {
  id: 'werewolf',
  name: 'Werewolf',
  emoji: '🐺',
  lateJoin: 'watch',
  watchPresence: true,
  inProgress: s => s.phase !== 'lobby' && s.phase !== 'end',

  init(env, opts) {
    return {
      phase: 'lobby', host: env.hostId, config: { ...DEFAULTS }, order: [], moderator: null,
      roles: {}, alive: {}, names: {}, round: 0, night: freshNight(), muted: {}, lastProtect: null, seerLog: [],
      deaths: [], dawn: null, votes: {}, tally: null, ready: {}, hunter: null, hunterUsed: false, shots: [], winner: null,
      lovers: null, witch: null, savedLast: null, recap: [], candidates: null, runoff: false,
      away: {}, stale: [], auto: {}, paused: null, grace: testGrace(),
      until: null, minUntil: null, acted: false, history: opts?.memory?.history ?? [], stats: opts?.memory?.stats ?? {},
    };
  },

  // Everything goes through here: the host's presence checks first, then the rules, then autopilot for anyone who is away.
  reduce(s, a, env) {
    if (a.type === 'presence') return a.from === env.hostId ? presence(s, env) : s;
    return autoplay(this.step(s, a, env), env, this);
  },

  step(s, a, env) {
    if (!s.stale) s = { ...s, stale: [], away: s.away ?? {}, auto: s.auto ?? {}, paused: s.paused ?? null }; // a game saved before drop-outs were handled
    s = { ...s, names: { ...s.names, ...Object.fromEntries(env.players.map(p => [p.id, p.name])) } };
    const isHost = a.from === env.hostId;
    const controls = isHost || (s.config.mod === 'player' && a.from === s.moderator);

    if (a.type === 'reset' && isHost) return { ...this.init(env, { memory: { history: s.history, stats: s.stats } }), config: s.config, names: s.names };

    /* --- lobby: the host sets things up --- */
    if (s.phase === 'lobby') {
      if (a.type === 'config' && isHost) {
        const p = a.data ?? {};
        const c = { ...s.config };
        if (MODERATORS[p.mod]) { c.mod = p.mod; c.moderator = p.mod === 'host' ? env.hostId : null; }
        if (c.mod === 'player' && typeof p.moderator === 'string' && p.moderator !== env.hostId && env.players.some(x => x.id === p.moderator)) c.moderator = p.moderator;
        if (p.wolves === 'auto') c.wolves = 'auto';
        else if (Number.isInteger(p.wolves)) c.wolves = Math.min(8, Math.max(1, p.wolves));
        for (const k of FLAGS) if (typeof p[k] === 'boolean') c[k] = p[k];
        for (const [k, choices] of Object.entries(TIMERS)) if (choices.includes(p[k])) c[k] = p[k];
        if (c.stealth) { c.witch = false; c.cupid = false; } // these need two choices, which the one-tap face-to-face screen can't give
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
          lovers: null, witch: roles && Object.values(roles).includes('witch') ? { heal: true, poison: true } : null, savedLast: null, recap: [], candidates: null, runoff: false, away: {}, stale: [], auto: {}, paused: null,
        }, 'roles', env);
      }
      return s;
    }
    if (s.phase === 'end') return s;

    /* --- the person running the game (moderator or host) --- */
    if (a.type === 'pause' && controls && !s.paused) return { ...s, paused: { at: env.now } };
    if (a.type === 'resume' && controls && s.paused) {
      const gap = env.now - s.paused.at;
      const shift = x => (typeof x === 'number' ? x + gap : x);
      return { ...s, paused: null, until: shift(s.until), minUntil: shift(s.minUntil), hunter: s.hunter ? { ...s.hunter, until: shift(s.hunter.until) } : s.hunter, away: Object.fromEntries(Object.entries(s.away ?? {}).map(([k, v]) => [k, v + gap])) };
    }
    if (s.paused) return s; // nothing happens until the game is resumed

    // What to do about people who have been offline for a while.
    if (controls && (a.type === 'awayWait' || a.type === 'awayRemove' || a.type === 'awayAuto' || a.type === 'modTimers')) {
      const id = a.data?.id;
      if (a.type === 'modTimers') {
        if (s.config.mod !== 'player' || !s.moderator) return s;
        const sec = { night: s.config.nightSec, day: s.config.daySec, vote: s.config.voteSec }[s.phase] ?? PHASE_SEC[s.phase] ?? 8;
        const keep = { ...s.away }; delete keep[s.moderator];
        return { ...s, config: { ...s.config, mod: 'none', moderator: null }, moderator: null, away: keep, stale: s.stale.filter(x => x !== s.moderator), until: env.now + sec * 1000, minUntil: s.phase === 'night' ? env.now + Math.min(15, sec) * 1000 : s.minUntil };
      }
      if (!(s.alive[id] && s.away?.[id] !== undefined)) return s;
      const rest = { away: { ...s.away }, stale: s.stale.filter(x => x !== id) };
      if (a.type === 'awayWait') { rest.away[id] = env.now; return settle({ ...s, ...rest }, env); }
      if (a.type === 'awayAuto') return settle({ ...s, ...rest, auto: { ...s.auto, [id]: true } }, env);
      delete rest.away[id];
      const gone = kill({ ...s, ...rest }, id, 'left', env);
      const w = winnerOf(gone);
      return w ? endGame(gone, w) : settle(gone, env);
    }

    if (a.type === 'advance' && controls) return forward(s, env);
    if (a.type === 'timeout' && isHost) {
      const base = baseDeadline(s);
      if (base && env.now >= base - 100) return forward(s, env);
      // otherwise a grace period may just have run out
      const stale = Object.keys(s.away ?? {}).filter(id => s.away[id] + graceOf(s) <= env.now && !s.auto?.[id]);
      return stale.length === s.stale.length && stale.every((x, i) => x === s.stale[i]) ? s : { ...s, stale };
    }
    // A countdown the moderator can start, extend or stop (0 stops it).
    if (a.type === 'timer' && controls && ['night', 'day', 'vote'].includes(s.phase)) {
      const sec = Number(a.data?.sec), add = Number(a.data?.add);
      if (Number.isFinite(add) && add > 0 && add <= 300) return { ...s, until: Math.max(s.until ?? 0, env.now) + add * 1000 };
      if (!Number.isFinite(sec) || sec < 0 || sec > 900) return s;
      return { ...s, until: sec ? env.now + sec * 1000 : null };
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

    /* --- night: everyone with a job acts in secret --- */
    if (s.phase === 'night') {
      const target = a.data?.target;
      const alive = t => typeof t === 'string' && s.alive[t];
      const role = s.roles[me];
      let next = s;
      if (s.config.stealth) {
        // Face-to-face mode: everybody does the very same thing, so nobody can tell who has a job.
        if (a.type !== 'pick' || !alive(target)) return s;
        next = { ...s, night: { ...s.night, picks: { ...s.night.picks, [me]: target } } };
        return { ...next, acted: allActed(next) };
      }
      const set = patch => ({ ...s, night: { ...s.night, ...patch } });
      if (a.type === 'wolf' && role === 'wolf' && alive(target) && s.roles[target] !== 'wolf') {
        next = set({ wolf: { ...s.night.wolf, [me]: target } });
      } else if (a.type === 'seer' && role === 'seer' && s.night.seer == null && alive(target) && target !== me) {
        next = { ...set({ seer: target }), seerLog: [...s.seerLog, { round: s.round, id: target, wolf: s.roles[target] === 'wolf' }] };
      } else if (a.type === 'doctor' && role === 'doctor' && alive(target) && target !== s.lastProtect) {
        next = set({ doctor: target });
      } else if (a.type === 'guard' && role === 'bodyguard' && alive(target) && target !== me) {
        next = set({ guard: target });
      } else if (a.type === 'cupid' && role === 'cupid' && s.round === 1 && !s.lovers) {
        const [x, y] = [a.data?.a, a.data?.b];
        if (!(alive(x) && alive(y) && x !== y)) return s;
        next = { ...s, lovers: [x, y] };
      } else if (a.type === 'witchHeal' && role === 'witch' && s.witch?.heal && alive(target) && target === wolfTarget(s)) {
        next = set({ heal: target });
      } else if (a.type === 'witchPoison' && role === 'witch' && s.witch?.poison && alive(target) && target !== me) {
        next = set({ poison: target });
      } else if (a.type === 'witchPass' && role === 'witch') {
        next = set({ witchDone: true });
      } else return s;
      return { ...next, acted: allActed(next) };
    }

    /* --- day: talk, then vote --- */
    if (s.phase === 'day' && a.type === 'ready') {
      const ready = { ...s.ready, [me]: true };
      const next = { ...s, ready };
      return Object.keys(ready).filter(id => s.alive[id]).length > aliveIds(s).length / 2 ? enter(next, 'vote', env, { candidates: null, runoff: false }) : next;
    }
    if (s.phase === 'vote' && a.type === 'vote') {
      const t = a.data?.target;
      if (s.muted?.[me]) return s; // slept through the night, so no vote today
      if (t !== 'skip' && !(typeof t === 'string' && s.alive[t] && t !== me)) return s;
      if (t !== 'skip' && s.candidates && !s.candidates.includes(t)) return s; // second round: only the tied players
      const next = { ...s, votes: { ...s.votes, [me]: t } };
      return votesDone(next) ? resolveVote(next, env) : next;
    }

    return s;
  },

  deadline(s) {
    if (s.paused) return null;
    const base = baseDeadline(s);
    const grace = Object.keys(s.away ?? {}).filter(id => !(s.stale ?? []).includes(id) && !s.auto?.[id]).map(id => s.away[id] + graceOf(s));
    const all = [base, ...grace].filter(x => typeof x === 'number');
    return all.length ? Math.min(...all) : null;
  },

  // What everyone may see. Roles appear only when someone dies (if the host allows it) or the game ends.
  view(s) {
    const { roles, night, seerLog, lastProtect, votes, host, lovers, witch, savedLast, recap, auto, away, stale, ...pub } = s;
    const over = s.phase === 'end';
    const secret = !s.config.showVotes; // the host can keep who-voted-for-whom private
    const hide = x => (secret && x ? { ...x, votes: null } : x);
    const revealed = {};
    for (const id of s.order) if (over || (!s.alive[id] && s.config.reveal)) revealed[id] = roles[id];
    const composition = {};
    for (const id of s.order) composition[roles[id]] = (composition[roles[id]] ?? 0) + 1;
    return {
      ...pub, tally: hide(pub.tally), revealed, away: Object.keys(away ?? {}), stale: stale ?? [], paused: s.paused ?? null, composition: s.phase === 'lobby' ? {} : composition,
      voted: s.phase === 'vote' ? Object.keys(votes) : [],
      liveVotes: s.config.openVotes && s.phase === 'vote' ? votes : null,
      locked: s.config.stealth && s.phase === 'night' ? Object.keys(night.picks ?? {}).filter(id => s.alive[id]).length : null,
      recap: over ? recap.map(e => (e.kind === 'vote' ? hide(e) : e)) : [], lovers: over ? lovers : null,
    };
  },

  // What each player (and the moderator) may see privately. Sent encrypted, one message per person.
  priv(s) {
    if (s.phase === 'lobby' || !s.order.length) return {};
    const out = {};
    const wolves = s.order.filter(id => s.roles[id] === 'wolf');
    const nightOn = s.phase === 'night';
    const stealth = s.config.stealth;
    for (const id of s.order) {
      const role = s.roles[id];
      const live = nightOn && s.alive[id];
      const mine = { role };
      if (role === 'wolf') {
        mine.pack = wolves.filter(w => w !== id);
        if (live) mine[stealth ? 'packPicks' : 'votes'] = stealth ? Object.fromEntries(wolves.filter(w => s.night.picks[w] !== undefined).map(w => [w, s.night.picks[w]])) : s.night.wolf;
      }
      if (stealth && live) { mine.pick = s.night.picks[id] ?? null; mine.done = mine.pick !== null; }
      if (role === 'seer') mine.seerLog = s.seerLog;
      if (role === 'doctor') { mine.lastProtect = s.lastProtect; mine.saved = s.phase === 'dawn' && s.savedLast?.by === 'doctor' ? s.savedLast.id : null; }
      if (role === 'witch' && s.witch) {
        mine.witch = s.witch;
        if (live) Object.assign(mine, { attack: wolfTarget(s), healing: s.night.heal, poisoning: s.night.poison, witchDone: s.night.witchDone });
      }
      if (role === 'cupid') { mine.lovers = s.lovers; mine.needLovers = live && s.round === 1 && !s.lovers; }
      if (s.lovers?.includes(id)) mine.lover = s.lovers.find(x => x !== id);
      if (live && !stealth) {
        mine.done = { wolf: s.night.wolf[id] !== undefined, seer: s.night.seer != null, doctor: s.night.doctor != null, bodyguard: s.night.guard != null, witch: s.night.witchDone, cupid: !mine.needLovers }[role] ?? null;
      }
      if (!s.alive[id] && s.config.ghost) mine.everyone = s.roles;
      out[id] = mine;
    }
    if (s.moderator) out[s.moderator] = { moderator: true, everyone: s.roles, night: s.night, stealth, acted: s.acted, lastProtect: s.lastProtect, seerLog: s.seerLog, lovers: s.lovers, witch: s.witch, attack: wolfTarget(s) };
    return out;
  },

  render(el, s, ui) {
    const d = el._d ??= { show: false, myVote: null, tick: null, mstep: 0, lovePick: [] };
    d.s = s; d.ui = ui;
    const dl = this.deadline(s);
    if (d.at !== dl) { d.at = dl; d.total = dl ? Math.max(1000, dl - Date.now()) : 0; }
    if (!d.tick) {
      d.tick = setInterval(() => {
        if (!el.isConnected || el._d !== d) { clearInterval(d.tick); d.tick = null; document.getElementById('ww-pause')?.remove(); return; }
        if (d.s.paused) return; // quiet while paused
        const at = d.at;
        const left = at ? Math.max(0, at - Date.now()) : 0;
        d.n = (d.n ?? 0) + 1;
        if (d.s.phase === 'night') {
          if (at && left <= 10000 && d.n % 2 === 0) sfx('heartbeat'); // the last ten seconds beat like a heart
          else if (d.n % 5 === 0) sfx(Math.random() < 0.2 ? 'wind' : 'cricket');
          if (d.n % 40 === 0) sfx('farhowl');
        } else if ((d.s.phase === 'day' || d.s.phase === 'dawn') && d.n % 14 === 0) sfx('birds');
        else if (d.s.phase === 'vote' && at && left <= 10000 && d.n % 2 === 0) sfx('tick');
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
    if (fresh(el, 'round', `${s.round}${s.phase === 'vote' ? 'v' : ''}${s.runoff ? 'r' : ''}`)) d.myVote = null;
    if (fresh(el, 'scriptStep', `${s.phase}${s.round}`)) d.mstep = 0;
    if (s.phase !== 'night') d.lovePick = [];

    const nm = id => { const n = ui.nameOf(id); return n === '(waiting)' ? s.names?.[id] ?? n : n; }; // people who are offline keep their name
    const name = id => ui.esc(nm(id));
    const me = ui.priv;
    const isMod = !!me?.moderator;
    const inGame = s.order.includes(ui.me);
    const alive = !!s.alive[ui.me];
    const role = inGame ? me?.role : null;
    const R = r => ROLES[r] ?? { name: '?', emoji: '❔' };
    const tag = id => (s.revealed[id] ? ` ${R(s.revealed[id]).emoji}` : '');
    const cfgAttr = (k, v) => `data-k="${k}" data-v="${ui.esc(JSON.stringify(v))}"`;
    const controls = ui.isHost || isMod;
    const theme = s.phase === 'night' ? 'night' : s.phase === 'result' ? 'dusk' : ['dawn', 'day', 'vote'].includes(s.phase) ? 'day' : '';
    const how = { wolves: 'was taken in the night…', poison: 'was poisoned…', guard: 'gave their life guarding someone…', love: 'died of a broken heart…', hunter: 'was shot by the hunter', vote: 'was voted out', left: 'left the game' };

    /* ---- sounds and scenes for what just changed ---- */
    const prevPhase = memo(el, 'phase', s.phase);
    if (prevPhase !== undefined && prevPhase !== s.phase) {
      if (s.phase === 'night') sfx('howl');
      else if (s.phase === 'dawn') {
        const gone = (s.dawn?.died ?? []).map(id => ({ name: nm(id), role: s.revealed[id] ? R(s.revealed[id]).name : '', how: how[s.deaths.find(x => x.id === id && x.round === s.dawn.round)?.how] ?? how.wolves }));
        dawnCinematic(gone);
        if (s.dawn?.died?.some(id => s.deaths.find(x => x.id === id && x.round === s.dawn.round)?.how === 'love')) setTimeout(() => sfx('heartbreak'), 2800);
        if (me?.saved) setTimeout(() => saveToast(`You saved ${nm(me.saved)} from the wolves!`), 4800);
      } else if (s.phase === 'day') sfx('birds');
      else if (s.phase === 'vote') sfx('flip');
      else if (s.phase !== 'result') sfx('whoosh');
    }
    if (me?.lover && fresh(el, 'lover', me.lover)) setTimeout(() => sfx('love'), 400);
    const prevShots = memo(el, 'shots', s.shots?.length ?? 0);
    if (prevShots !== undefined && (s.shots?.length ?? 0) > prevShots) sfx('bang');

    const online = new Set([...ui.players, ...(ui.watching ?? [])].map(p => p.id));
    const players = chips => `<div class="chips ww-players">${chips}</div>`;
    const roster = () => players(s.order.map(id => {
      const dead = !s.alive[id];
      const heart = me?.lover === id ? ' 💘' : '';
      const off = !dead && s.away.includes(id) ? ' 🔌' : '';
      return `<span class="chip ${dead ? 'dead' : ''} ${id === ui.me ? 'me' : ''}">${dead ? '💀 ' : ''}${name(id)}${tag(id)}${heart}${off}</span>`;
    }).join(''));
    const timer = dl ? `<div class="bar"><i style="width:100%"></i></div><p class="muted">Time left: <span id="timer"></span></p>` : '';
    const targets = (ids, attr, picked, locked = []) => `<div class="votes">${ids.map(id =>
      `<button ${attr}="${id}" class="${picked === id || (Array.isArray(picked) && picked.includes(id)) ? 'sel' : ''}" ${locked.includes(id) ? 'disabled' : ''}>${name(id)}</button>`).join('')}</div>`;
    const others = (pred = () => true) => aliveIdsOf(s).filter(id => id !== ui.me && pred(id));
    const sky = s.phase === 'night' ? nightSky({ eyes: role === 'wolf' && alive && !s.config.stealth }) : theme === 'day' ? daySky() : '';

    /* ---- the card showing my role ---- */
    const roleCard = () => {
      if (isMod) return '<div class="role">🎙️ You are the <b>moderator</b><br><small>You see everything. Read the script aloud and press the button to move on.</small></div>';
      if (!role) return '';
      const r = R(role);
      const wolves = role === 'wolf' && me.pack?.length ? `<br><small>Pack: ${me.pack.map(name).join(', ')}</small>` : '';
      const looks = role === 'seer' && me.seerLog?.length ? `<br><small>${me.seerLog.map(l => `🔮 ${name(l.id)}: ${l.wolf ? '🐺 werewolf' : 'not a werewolf'}`).join('<br>')}</small>` : '';
      const love = me.lover ? `<br><small>💘 You are in love with <b>${name(me.lover)}</b>. If one of you dies, so does the other.</small>` : '';
      const potions = role === 'witch' && me.witch ? `<br><small>Potions left: ${me.witch.heal ? '🧪 heal' : '—'} · ${me.witch.poison ? '☠️ poison' : '—'}</small>` : '';
      return d.show
        ? `<div class="role ww-role ${role === 'wolf' ? 'bad' : ''} ${fresh(el, 'rc', `${s.round}${d.show}`) ? 'flip' : ''}">${r.emoji} You are ${/^[aeiou]/i.test(r.name) ? 'an' : 'a'} <b>${r.name}</b>${alive ? '' : ' (out)'}<br><small>${r.blurb}</small>${wolves}${looks}${love}${potions}</div>
           <button class="ghost" id="hide">🙈 Hide my role</button>`
        : '<button class="ghost ww-peek" id="peek">👁 Tap to see my role (keep your screen private)</button>';
    };

    /* ---- the moderator's control panel ---- */
    const everyone = me?.everyone ?? {};
    const holderOf = r => s.order.find(id => s.alive[id] && everyone[id] === r);
    const nightLines = () => {
      const L = [['🌙', 'Night falls. Everyone, close your eyes.', 'whoosh']];
      if (s.round === 1 && holderOf('cupid')) L.push(['💘', 'Cupid, wake up. Point at two people to fall in love. Cupid, sleep. Lovers, open your eyes, look at each other, and close them again.', 'love']);
      L.push(['🐺', 'Werewolves, wake up. Silently choose a victim.', 'howl']);
      if (holderOf('seer')) L.push(['🔮', 'Wolves, sleep. Seer, wake up. Choose someone to inspect.', 'mystic']);
      if (holderOf('doctor')) L.push(['🩺', 'Seer, sleep. Doctor, wake up. Choose someone to protect.', 'shield']);
      if (holderOf('bodyguard')) L.push(['🛡️', 'Bodyguard, wake up. Choose someone to guard.', 'shield']);
      if (holderOf('witch')) L.push(['🧙‍♀️', `Witch, wake up. ${me?.attack ? `The victim is ${nm(me.attack)}. ` : ''}Do you heal them? Do you poison someone?`, 'potion']);
      L.push(['☀️', 'Everyone, wake up when I say the sun rises.', 'whoosh']);
      return L;
    };
    const scriptLines = {
      roles: [['🎭', 'Everyone look at your role privately. Keep it secret!', 'flip']],
      dawn: [['☀️', 'Announce who died (if anyone). If a hunter fell, let them shoot.', 'ding']],
      day: [['🗣️', 'Discuss! Who do you think the werewolves are?', 'whoosh']],
      vote: [['🗳️', s.runoff ? 'A tie! Vote again, only between the tied players.' : 'Vote now. The most-voted player is eliminated. A tie means nobody goes.', 'flip']],
      result: [['⚰️', 'Announce the vote result, then start the next night.', 'thud']],
    };
    const modPanel = () => {
      const list = s.order.map(id => `<tr class="${s.alive[id] ? '' : 'out'}"><td>${name(id)}${me.lovers?.includes(id) ? ' 💘' : ''}</td><td>${R(everyone[id]).emoji} ${R(everyone[id]).name}</td><td>${s.alive[id] ? '' : '💀'}</td></tr>`).join('');
      let night = '';
      if (s.phase === 'night') {
        const n = me.night ?? { wolf: {} };
        if (me.stealth) {
          night = `<div class="ww-nightlog"><b>Tonight's picks:</b><br>${s.order.filter(id => s.alive[id]).map(id => `${R(everyone[id]).emoji} ${name(id)} → ${n.picks?.[id] ? name(n.picks[id]) : '…'}`).join('<br>')}</div>`;
        } else {
          const picks = Object.entries(n.wolf).map(([w, t]) => `${name(w)} → ${name(t)}`).join(', ') || '…';
          night = `<div class="ww-nightlog"><b>Tonight:</b><br>🐺 ${picks}<br>🔮 ${n.seer ? name(n.seer) : '…'}<br>🩺 ${n.doctor ? name(n.doctor) : '…'}<br>🛡️ ${n.guard ? name(n.guard) : '…'}
            ${me.witch ? `<br>🧙‍♀️ heal ${n.heal ? name(n.heal) : (me.witch.heal ? '…' : 'used')} · poison ${n.poison ? name(n.poison) : (me.witch.poison ? '…' : 'used')}` : ''}
            ${me.lovers ? `<br>💘 ${me.lovers.map(name).join(' & ')}` : ''}</div>`;
        }
      }
      return `<details open><summary><b>All roles</b></summary><table class="table">${list}</table></details>${night}`;
    };
    const modScript = () => {
      const lines = s.phase === 'night' ? nightLines() : scriptLines[s.phase] ?? [];
      const i = Math.min(d.mstep, lines.length - 1);
      const timerBtns = ['night', 'day', 'vote'].includes(s.phase)
        ? `<div class="chips ww-timers">${[60, 120, 180].map(v => `<button class="chip pick" data-timer="${v}">⏱ ${v / 60} min</button>`).join('')}<button class="chip pick" data-add="30">+30s</button><button class="chip pick" data-timer="0">⏹ stop</button></div>` : '';
      return `<div class="ww-script"><p class="ww-line">${lines[i]?.[0] ?? ''} <i>${lines[i]?.[1] ?? ''}</i></p>
        ${lines.length > 1 ? `<p class="muted">Step ${i + 1} of ${lines.length}</p><button class="ghost" id="mnext" ${i >= lines.length - 1 ? 'disabled' : ''}>▶ Next line</button>` : ''}
        ${timerBtns}${modPanel()}</div>`;
    };
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
      const modName = c.mod === 'player' && c.moderator ? nm(c.moderator) : '';
      if (ui.isHost) {
        const pick = (k, v, label, on, off = false) => `<button class="chip pick ${on ? 'sel' : ''}" ${cfgAttr(k, v)} ${off ? 'disabled' : ''}>${label}</button>`;
        const tog = (k, label, off = false) => pick(k, !c[k], `${c[k] ? '✅' : '⬜'} ${label}`, c[k], off);
        const role = k => tog(k, `${R(k).emoji} ${R(k).name}`, c.stealth && (k === 'witch' || k === 'cupid'));
        body = `<h3>Who runs the game?</h3>
          <div class="ww-mods">${Object.entries(MODERATORS).map(([k, m]) =>
            `<button class="chip pick ${c.mod === k ? 'sel' : ''}" ${cfgAttr('mod', k)}>${m.emoji} ${m.name}</button>`).join('')}</div>
          <p class="muted">${MODERATORS[c.mod].blurb}</p>
          ${c.mod === 'player' ? `<h3>Moderator</h3><div class="chips">${ui.players.filter(p => p.id !== ui.me).map(p => pick('moderator', p.id, ui.esc(p.name), c.moderator === p.id)).join('') || '<span class="muted">Waiting for someone to join…</span>'}</div>` : ''}
          <h3>Werewolves</h3><div class="chips">${pick('wolves', 'auto', 'Auto', c.wolves === 'auto')}${[1, 2, 3, 4].map(k => pick('wolves', k, k, c.wolves === k)).join('')}</div>
          <h3>Roles</h3><div class="chips">${SPECIALS.map(role).join('')}</div>
          ${c.stealth ? '<p class="muted">Witch and Cupid need two choices, so they are off in face-to-face mode.</p>' : ''}
          <h3>Rules</h3><div class="chips">${tog('reveal', 'Show role of the dead')}${tog('ghost', 'Dead players see all roles')}${tog('showVotes', 'Show who voted for whom')}${tog('openVotes', 'Open voting (see votes live)')}${tog('runoff', 'Runoff vote on a tie')}${tog('stealth', '🕵️ Face-to-face mode')}</div>
          ${c.stealth ? '<p class="muted">Sitting together? At night everyone gets the same screen and must pick a player, so nobody can tell who the wolves, seer or doctor are. Only the right picks count. Anyone who skips the night can\'t vote the next day.</p>' : ''}
          ${c.mod === 'none' ? `<h3>Timers</h3>
            <p class="muted">Night</p><div class="chips">${TIMERS.nightSec.map(v => pick('nightSec', v, `${v}s`, c.nightSec === v)).join('')}</div>
            <p class="muted">Discussion</p><div class="chips">${TIMERS.daySec.map(v => pick('daySec', v, `${v / 60 >= 1 ? v / 60 + ' min' : v + 's'}`, c.daySec === v)).join('')}</div>
            <p class="muted">Voting</p><div class="chips">${TIMERS.voteSec.map(v => pick('voteSec', v, `${v}s`, c.voteSec === v)).join('')}</div>` : ''}`;
      } else {
        body = `<p><b>${MODERATORS[c.mod].emoji} ${MODERATORS[c.mod].name}</b>${modName ? `: ${ui.esc(modName)}` : ''}</p><p class="muted">${MODERATORS[c.mod].blurb}</p>
          <p class="muted">Roles: ${SPECIALS.filter(k => c[k]).map(k => `${R(k).emoji} ${R(k).name}`).join(', ') || 'none'}${c.stealth ? ' · 🕵️ Face-to-face mode' : ''}${c.openVotes ? ' · open voting' : ''}${c.showVotes ? '' : ' · secret votes'}${c.runoff ? ' · runoff on ties' : ''}</p>`;
      }
      body += `<div class="ww-comp"><b>${n >= MIN_PLAYERS ? n : '5+'} players:</b> ${comp}</div>
        ${why ? `<p class="muted">${ui.esc(why)}</p>` : ''}
        ${ui.isHost ? `<button id="start" ${why ? 'disabled' : ''}>Start the game</button>` : '<p class="muted">Waiting for the host to start…</p>'}`;
      const board = Object.values(s.stats ?? {}).sort((a, b) => b.wins - a.wins || b.survived - a.survived);
      if (board.length) body += `<h3>🏆 Leaderboard</h3><table class="table"><tr class="muted"><td></td><td>Wins</td><td>Played</td><td>Survived</td></tr>${board.map(x => `<tr><td>${ui.esc(x.name)}</td><td><b>${x.wins}</b></td><td>${x.played}</td><td>${x.survived}</td></tr>`).join('')}</table>`;
      if (s.history.length) body += `<p class="muted">Past games: ${s.history.map(h => `#${h.n} ${{ wolves: '🐺', village: '🏡', lovers: '💘', tanner: '🎭' }[h.winner]} (${h.rounds} nights)`).join(' · ')}</p>`;
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
            bodyguard: '🛡️ You are the bodyguard. Your pick is guarded. If the wolves attack them, you die instead.',
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
          <div class="votes">${others(id => !me.pack.includes(id)).map(id =>
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
      } else if (role === 'bodyguard') {
        act = me.done
          ? '<h3>🛡️ Guard set</h3><p class="muted">If the wolves attack them, you take the bite. Now wait for the morning.</p>'
          : `<h3>🛡️ Who do you guard tonight?</h3><p class="muted">If the wolves attack them, you die in their place.</p>${targets(others(), 'data-guard', null)}`;
      } else if (role === 'cupid' && me.needLovers) {
        act = `<h3>💘 Choose two lovers</h3><p class="muted">If one dies, the other dies too. They'll be told who their love is. Tap two players.</p>${targets(aliveIdsOf(s), 'data-lover', d.lovePick)}
          <button id="cupidgo" ${d.lovePick.length === 2 ? '' : 'disabled'}>💘 Make them fall in love</button>`;
      } else if (role === 'cupid' && me.lovers) {
        act = `<h3>💘 Your lovers</h3><p><b>${me.lovers.map(name).join(' & ')}</b> are in love. Keep it secret!</p>`;
      } else if (role === 'witch' && me.witch) {
        const w = me.witch;
        if (me.witchDone) act = '<h3>🧙‍♀️ Potions set</h3><p class="muted">Now wait for the morning.</p>';
        else act = `<h3>🧙‍♀️ Your potions</h3>
          <p>${me.attack ? `The wolves chose <b>${name(me.attack)}</b>.` : (w.heal ? 'The wolves are still deciding…' : 'You have used your healing potion.')}</p>
          ${w.heal && me.attack ? `<button id="heal" class="${me.healing === me.attack ? 'sel' : ''}">🧪 ${me.healing === me.attack ? 'Healing ' : 'Heal '}${name(me.attack)}</button>` : ''}
          ${w.poison ? `<p class="muted">☠️ Or poison someone (one use for the whole game):</p>${targets(others(), 'data-poison', me.poisoning)}` : ''}
          <button class="ghost" id="witchdone">✔ Done for tonight</button>`;
      } else {
        // Villagers, the hunter and the tanner get a decoy job that looks like the seer's or doctor's, so a quiet phone doesn't give them away.
        const kind = [...ui.me].reduce((h, c) => h + c.charCodeAt(0), s.round) % 2 ? 'seer' : 'doctor';
        const dc = d.decoy?.round === s.round ? d.decoy : null;
        if (kind === 'seer') {
          act = dc
            ? `<h3>🔮 You looked at ${name(dc.pick)}</h3>${dc.ready ? '<p><b>🌫️ The vision is cloudy. Nothing clear tonight.</b></p>' : '<p class="muted">Reading the stars…</p>'}`
            : `<h3>🔮 Who do you want to inspect?</h3>${targets(others(), 'data-decoy', null)}`;
        } else {
          act = dc
            ? '<h3>🩺 Protection set</h3><p class="muted">Now wait for the morning.</p>'
            : `<h3>🩺 Who do you protect tonight?</h3><p class="muted">Can be yourself, but not the same person as last night.</p>${targets(aliveIdsOf(s), 'data-decoy', null)}`;
        }
      }
      body = `${sky}<h3>🌙 Night ${s.round}</h3>${roleCard()}${act}${timer}`;
    }

    /* ---------------- dawn ---------------- */
    else if (s.phase === 'dawn') {
      const died = s.dawn?.died ?? [];
      const shot = (s.shots ?? []).map(x => `🏹 ${name(x.by)} shot ${name(x.target)}${tag(x.target)}`).join('<br>');
      let hunter = '';
      if (s.hunter) hunter = s.hunter.id === ui.me
        ? `<h3>🏹 Take your last shot!</h3>${targets(others(), 'data-shoot', null)}`
        : `<p>🏹 <b>${name(s.hunter.id)}</b> was the hunter, and is taking a last shot…</p>`;
      const why = id => how[s.deaths.find(x => x.id === id && x.round === s.dawn.round)?.how] ?? how.wolves;
      body = `${sky}<h3>☀️ Morning of day ${s.round}</h3>
        ${died.length ? died.map(id => `<p class="status-pop"><b>💀 ${name(id)}</b> ${why(id)}${tag(id)}</p>`).join('') : '<p class="status-pop"><b>😮 Nobody died tonight!</b></p>'}
        ${me?.saved ? `<p class="banner">🛡️ Your protection saved <b>${name(me.saved)}</b> tonight!</p>` : ''}
        ${shot ? `<p>${shot}</p>` : ''}${hunter}${roleCard()}${timer}`;
    }

    /* ---------------- day ---------------- */
    else if (s.phase === 'day') {
      const readyN = Object.keys(s.ready).filter(id => s.alive[id]).length;
      const aliveN = aliveIdsOf(s).length;
      const mutedNames = Object.keys(s.muted ?? {}).filter(id => s.alive[id]);
      body = `${sky}<h3>🗣️ Day ${s.round}: discuss!</h3>${mutedNames.length ? `<p class="banner">🔇 ${mutedNames.map(name).join(', ')} skipped the night and can't vote today.</p>` : ''}<p class="muted">Who is acting suspicious? Talk it out loud.</p>${roleCard()}${timer}
        ${alive && inGame ? (s.ready[ui.me] ? '<p class="muted">You are ready to vote.</p>' : '<button id="ready">✋ I\'m ready to vote</button>') : ''}
        <p class="muted">${readyN}/${aliveN} ready · majority starts the vote</p>`;
    }

    /* ---------------- vote ---------------- */
    else if (s.phase === 'vote') {
      let pick = '';
      const pool = s.candidates ? others(id => s.candidates.includes(id)) : others();
      if (alive && inGame && s.muted?.[ui.me]) pick = '<p class="banner">🔇 You skipped the night, so you can\'t vote today.</p>';
      else if (alive && inGame) {
        pick = s.voted.includes(ui.me)
          ? `<p class="muted">Vote locked in${d.myVote ? `: ${d.myVote === 'skip' ? 'skip' : name(d.myVote)}` : ''}. Waiting for the others…</p>`
          : `${targets(pool, 'data-vote', null)}<button class="ghost" data-vote="skip">Skip (vote for nobody)</button>`;
      }
      const live = s.liveVotes ? `<div class="ww-live">${Object.entries(s.liveVotes).map(([f, t]) => `<div>${name(f)} → <b>${t === 'skip' ? 'skip' : name(t)}</b></div>`).join('')}</div>` : '';
      body = `${sky}<h3>🗳️ ${s.runoff ? 'Runoff vote' : 'Vote someone out'}</h3>${s.runoff ? `<p class="banner">⚖️ A tie! Choose between ${s.candidates.map(name).join(' and ')}.</p>` : ''}${roleCard()}${pick}${timer}
        <p class="muted">${s.voted.length}/${aliveIdsOf(s).filter(id => !s.muted?.[id]).length} voted</p>
        ${live || players(aliveIdsOf(s).map(id => `<span class="chip ${s.voted.includes(id) ? 'new' : ''}">${s.muted?.[id] ? '🔇' : s.voted.includes(id) ? '✅' : '⏳'} ${name(id)}</span>`).join(''))}`;
    }

    /* ---------------- vote result: the votes are read out one by one ---------------- */
    else if (s.phase === 'result') {
      const t = s.tally;
      const entries = Object.entries(t?.votes ?? {}).filter(([f]) => !s.muted?.[f]);
      const hidden = !t?.votes; // the host keeps votes private
      const anim = fresh(el, 'tally', `${s.round}${t?.runoff ? 'r' : ''}`) && (entries.length > 0 || (hidden && Object.keys(t?.counts ?? {}).length > 0));
      const step = 0.45;
      const countAt = entries.length * step + 0.3;
      const verdictAt = countAt + 1.6;
      if (anim) {
        entries.forEach((_, i) => setTimeout(() => sfx('vote'), i * step * 1000));
        setTimeout(() => sfx('drumroll'), countAt * 1000);
        setTimeout(() => sfx(t.eliminated ? 'farewell' : 'blip'), verdictAt * 1000);
      } else if (!anim && prevPhase !== s.phase) sfx(t?.eliminated ? 'thud' : 'blip');
      const delay = (sec) => (anim ? `style="--d:${sec}s"` : '');
      const lines = Object.entries(t?.counts ?? {}).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...lines.map(([, k]) => k));
      const skips = hidden ? t?.skips ?? 0 : entries.filter(([, v]) => v === 'skip').length;
      const shot = (s.shots ?? []).map(x => `🏹 ${name(x.by)} shot ${name(x.target)}${tag(x.target)}`).join('<br>');
      let hunter = '';
      if (s.hunter) hunter = s.hunter.id === ui.me
        ? `<h3>🏹 Take your last shot!</h3>${targets(others(), 'data-shoot', null)}`
        : `<p>🏹 <b>${name(s.hunter.id)}</b> was the hunter, and is taking a last shot…</p>`;
      body = `<h3>🗳️ The votes${t?.runoff ? ' (runoff)' : ''}</h3>
        <div class="ww-tally">${hidden ? '<p class="muted">🔒 The host keeps individual votes secret. Here are the totals.</p>' : ''}${entries.map(([f, to], i) => `<div class="tv ${anim ? 'rd' : ''}" style="--d:${(i * step).toFixed(2)}s">${name(f)} → <b>${to === 'skip' ? 'skip' : name(to)}</b></div>`).join('') || (hidden ? '' : '<p class="muted">Nobody voted.</p>')}</div>
        <div class="ww-bars ${anim ? 'rd' : ''}" ${delay(countAt)}>${lines.map(([id, k]) => `<div class="tb"><span>${name(id)}</span><i style="--w:${(k / max) * 100}%"></i><b>${k}</b></div>`).join('')}${skips ? `<p class="muted">Skipped: ${skips}</p>` : ''}</div>
        <div class="ww-verdict ${anim ? 'rd' : ''} ${t?.eliminated ? 'out' : ''}" ${delay(verdictAt)}>${t?.eliminated
          ? `<div class="ww-farewell">💀 <b>${name(t.eliminated)}</b> is out${tag(t.eliminated)}<br><small>“It wasn't me…” Farewell, ${name(t.eliminated)}.</small></div>`
          : '<div class="ww-farewell">🤝 <b>Nobody</b> was eliminated</div>'}</div>
        ${shot ? `<p>${shot}</p>` : ''}${hunter}${roleCard()}${timer}`;
    }

    /* ---------------- game over ---------------- */
    else if (s.phase === 'end') {
      const mineWon = role ? (s.winner === 'lovers' ? s.lovers?.includes(ui.me) : R(role).team === s.winner) : null;
      if (fresh(el, 'end', s.history.length)) {
        if (s.winner === 'wolves') sfx('howl');
        if (mineWon === false) sfx('lose'); else { confetti(); sfx('win'); }
      }
      const title = { wolves: '🐺 The werewolves win!', village: '🏡 The village wins!', lovers: '💘 The lovers win!', tanner: '🎭 The tanner wins! They wanted to be voted out.' }[s.winner];
      const winners = new Set(s.history[s.history.length - 1]?.winners ?? []);
      const recap = (s.recap ?? []).map(e => {
        if (e.kind === 'night') {
          const bits = [];
          if (e.lovers) bits.push(`💘 lovers: ${e.lovers.map(name).join(' & ')}`);
          bits.push(e.target ? `🐺 wolves chose ${name(e.target)}` : '🐺 wolves chose nobody');
          if (e.protect) bits.push(`🩺 doctor protected ${name(e.protect)}`);
          if (e.guard) bits.push(`🛡️ bodyguard guarded ${name(e.guard)}`);
          if (e.seer) bits.push(`🔮 seer checked ${name(e.seer.id)} (${e.seer.wolf ? 'wolf' : 'not a wolf'})`);
          if (e.saved) bits.push(e.saved === 'bodyguard' ? '🛡️ the bodyguard took the bite' : `✨ saved by the ${e.saved}`);
          if (e.poison) bits.push(`☠️ poisoned ${name(e.poison)}`);
          bits.push(e.died.length ? `💀 died: ${e.died.map(name).join(', ')}` : '😮 nobody died');
          return `<li><b>🌙 Night ${e.round}</b><br><small>${bits.join(' · ')}</small></li>`;
        }
        const tally = Object.entries(e.counts).map(([id, k]) => `${name(id)} ${k}`).join(', ') || 'no votes';
        return `<li><b>🗳️ Day ${e.round}${e.runoff ? ' (runoff)' : ''}</b><br><small>${tally} · ${e.eliminated ? `💀 ${name(e.eliminated)} voted out` : 'nobody voted out'}</small></li>`;
      }).join('');
      const board = Object.values(s.stats ?? {}).sort((a, b) => b.wins - a.wins || b.survived - a.survived);
      body = `<h3 class="status-pop">${title}</h3>
        <table class="table">${s.order.map(id => `<tr class="${s.alive[id] ? '' : 'out'}"><td>${winners.has(id) ? '⭐ ' : ''}${name(id)}${s.lovers?.includes(id) ? ' 💘' : ''}</td><td>${R(s.revealed[id]).emoji} ${R(s.revealed[id]).name}</td><td>${s.alive[id] ? '✅ survived' : '💀'}</td></tr>`).join('')}</table>
        ${s.moderator ? `<p class="muted">Moderator: ${name(s.moderator)}</p>` : ''}
        <details open><summary><b>📜 What happened</b></summary><ol class="ww-recap">${recap}</ol></details>
        <details><summary><b>🏆 Leaderboard</b></summary><table class="table"><tr class="muted"><td></td><td>Wins</td><td>Played</td><td>Survived</td></tr>${board.map(x => `<tr><td>${ui.esc(x.name)}</td><td><b>${x.wins}</b></td><td>${x.played}</td><td>${x.survived}</td></tr>`).join('')}</table></details>
        <p class="muted">Games played: ${s.history.length} · 🏡 ${s.history.filter(h => h.winner === 'village').length} · 🐺 ${s.history.filter(h => h.winner === 'wolves').length}${s.history.some(h => h.winner === 'lovers') ? ` · 💘 ${s.history.filter(h => h.winner === 'lovers').length}` : ''}${s.history.some(h => h.winner === 'tanner') ? ` · 🎭 ${s.history.filter(h => h.winner === 'tanner').length}` : ''}</p>`;
    }

    /* ---- the ghost view: what happened so far, for people who are out ---- */
    const ghostOn = inGame && !alive && !isMod && s.phase !== 'end' && s.phase !== 'lobby';
    const deathsTxt = s.deaths.map(x => `<li><small>${x.how === 'vote' ? '🗳️ Day' : '🌙 Night'} ${x.round}: <b>${name(x.id)}</b> ${how[x.how] ?? ''}${tag(x.id)}</small></li>`).join('');
    const ghost = ghostOn
      ? `<div class="ww-ghost"><p>👻 <b>You are out.</b> Watch quietly, and no hints!</p><details open><summary>What happened so far</summary><ol class="ww-recap">${deathsTxt || '<li><small>Nobody has died yet.</small></li>'}</ol></details>${me?.everyone ? `<details><summary>👻 All roles</summary><table class="table">${s.order.map(id => `<tr><td>${name(id)}</td><td>${R(me.everyone[id]).emoji} ${R(me.everyone[id]).name}</td></tr>`).join('')}</table></details>` : ''}</div>` : '';

    /* ---- people who dropped out, and the pause ---- */
    const droprow = id => `<div class="ww-droprow"><b>${name(id)}${id === s.moderator ? ' (moderator)' : ''}</b><div class="chips"><button class="chip pick" data-away="wait" data-id="${id}">⏳ Wait</button>${id === s.moderator
      ? `<button class="chip pick" data-away="timers" data-id="${id}">⏱ Switch to timers</button>`
      : `<button class="chip pick" data-away="auto" data-id="${id}">🤖 Autopilot</button><button class="chip pick" data-away="remove" data-id="${id}">🚪 Remove</button>`}</div></div>`;
    const dropBlock = s.phase === 'lobby' || s.phase === 'end' ? '' : (controls && s.stale.length
      ? `<div class="banner ww-drop"><b>🔌 Offline for over 2 minutes</b><p class="muted">Wait for them, let the app play for them, or take them out of the game.</p>${s.stale.map(droprow).join('')}</div>` : '')
      + (s.away.filter(id => !controls || !s.stale.includes(id)).length ? `<p class="muted">🔌 ${s.away.filter(id => !controls || !s.stale.includes(id)).map(name).join(', ')} ${s.away.length > 1 ? 'are' : 'is'} offline${s.stale.length && !controls ? '. The host is deciding what to do.' : '. Giving them a couple of minutes to come back.'}</p>` : '');
    const pauseBlock = '';

    /* ---- shared bottom part ---- */
    const showRoster = s.phase !== 'lobby' && s.phase !== 'end' && s.order.length;
    const modBlock = isMod && s.phase !== 'lobby' && s.phase !== 'end' ? modScript() : '';
    const buttons = [];
    const inGameNow = s.phase !== 'lobby' && s.phase !== 'end';
    if (controls && inGameNow && !s.paused) buttons.push('<button class="ghost" id="pause">⏸ Pause</button>');
    if (controls && !s.paused && nextLabel && s.phase !== 'lobby' && s.phase !== 'end') buttons.push(`<button id="adv" class="${isMod ? '' : 'ghost'}">${isMod ? '▶ ' : '⏭ Skip ahead: '}${nextLabel}</button>`);
    if (ui.isHost && !isMod && ['night', 'day', 'vote'].includes(s.phase) && s.config.mod === 'none') buttons.push('<button class="ghost" data-add="30">⏱ +30s</button>');
    if (ui.isHost && s.phase !== 'lobby') buttons.push(`<button class="ghost" id="reset">${s.phase === 'end' ? '🔁 Play again' : '✖ End game'}</button>`);

    // A paused game covers the whole screen, wherever you have scrolled to.
    let veil = document.getElementById('ww-pause');
    if (s.paused) {
      if (!veil) { veil = document.createElement('div'); veil.id = 'ww-pause'; document.body.append(veil); }
      veil.innerHTML = `<div class="box"><div class="big">⏸</div><h2>Game paused</h2>
        <p>${controls ? 'Take your time. Press Resume when everyone is ready.' : `Waiting for the ${s.config.mod === 'player' ? 'moderator' : 'host'} to resume.`}</p>
        ${controls ? '<button id="ww-resume">▶ Resume</button>' : ''}</div>`;
      veil.querySelector('#ww-resume')?.addEventListener('click', () => d.ui.act('resume'));
    } else veil?.remove();
    el.innerHTML = `<div class="ww ${theme} ${ghostOn ? 'ghosted' : ''} ${s.paused ? 'paused' : ''}"><h2>🐺 Werewolf</h2>${pauseBlock}${dropBlock}
      ${showRoster ? `<p class="muted">${aliveIdsOf(s).length} alive of ${s.order.length}</p>${roster()}` : ''}
      ${modBlock}${ghost}${body}
      ${buttons.length ? `<div class="row ww-ctl ${isMod && s.phase !== 'end' ? 'stick' : ''}">${buttons.join('')}</div>` : ''}</div>`;

    /* ---- wiring ---- */
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
    on('[data-k]', b => ui.act('config', { [b.dataset.k]: JSON.parse(b.dataset.v) }));
    on('#start', () => ui.act('start'));
    on('#peek', () => { d.show = true; this.render(el, d.s, ui); });
    on('#hide', () => { d.show = false; this.render(el, d.s, ui); });
    on('[data-wolf]', b => sfx('blip') || ui.act('wolf', { target: b.dataset.wolf }));
    on('[data-decoy]', b => {
      sfx('blip');
      d.decoy = { round: s.round, pick: b.dataset.decoy, ready: false };
      this.render(el, d.s, ui);
      setTimeout(() => { if (d.decoy?.round === s.round) { d.decoy.ready = true; if (el.isConnected) this.render(el, d.s, ui); } }, 2500);
    });
    on('[data-pick]', b => sfx('blip') || ui.act('pick', { target: b.dataset.pick }));
    on('#peeknight', () => { d.peek = true; clearTimeout(d.peekT); d.peekT = setTimeout(() => { d.peek = false; if (el.isConnected) this.render(el, d.s, ui); }, 4000); this.render(el, d.s, ui); });
    on('[data-seer]', b => sfx('blip') || ui.act('seer', { target: b.dataset.seer }));
    on('[data-doc]', b => sfx('blip') || ui.act('doctor', { target: b.dataset.doc }));
    on('[data-guard]', b => sfx('blip') || ui.act('guard', { target: b.dataset.guard }));
    on('[data-lover]', b => {
      const id = b.dataset.lover;
      d.lovePick = d.lovePick.includes(id) ? d.lovePick.filter(x => x !== id) : [...d.lovePick, id].slice(-2);
      sfx('blip'); this.render(el, d.s, ui);
    });
    on('#cupidgo', () => { sfx('love'); ui.act('cupid', { a: d.lovePick[0], b: d.lovePick[1] }); });
    on('#heal', () => { sfx('potion'); ui.act('witchHeal', { target: me.attack }); });
    on('[data-poison]', b => { sfx('potion'); ui.act('witchPoison', { target: b.dataset.poison }); });
    on('#witchdone', () => ui.act('witchPass'));
    on('[data-shoot]', b => ui.act('shoot', { target: b.dataset.shoot }));
    on('[data-vote]', b => { d.myVote = b.dataset.vote; ui.act('vote', { target: b.dataset.vote }); });
    on('#ready', () => ui.act('ready'));
    on('#adv', () => ui.act('advance'));
    on('#mnext', () => {
      const lines = s.phase === 'night' ? nightLines() : scriptLines[s.phase] ?? [];
      d.mstep = Math.min(d.mstep + 1, lines.length - 1);
      sfx(lines[d.mstep]?.[2] ?? 'blip'); this.render(el, d.s, ui);
    });
    on('[data-timer]', b => ui.act('timer', { sec: Number(b.dataset.timer) }));
    on('[data-add]', b => ui.act('timer', { add: Number(b.dataset.add) }));
    on('#reset', () => ui.act('reset'));
    on('#pause', () => ui.act('pause'));
    on('#resume', () => ui.act('resume'));
    on('[data-away]', b => {
      const id = b.dataset.id, kind = b.dataset.away;
      if (kind === 'remove' && !confirm(`Take ${nm(id)} out of the game? They will be marked as having left.`)) return;
      ui.act(kind === 'timers' ? 'modTimers' : { wait: 'awayWait', auto: 'awayAuto', remove: 'awayRemove' }[kind], { id });
    });
  },

  remember: s => ({ history: s.history ?? [], stats: s.stats ?? {} }),
};
