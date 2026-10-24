import { ROOMS, TEAMS, TASKS, MIN_PLAYERS, TOTAL_POT, BONUS, AGENDAS, agendaOf, levelFor, DIFFICULTIES } from './secret-data.js';
import { makeClue, taskPoints } from './secret-clues.js';
import { renderSecret } from './secret-ui.js';

export { MIN_PLAYERS };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const MIN_TASK_MS = 1200;   // a task can't be finished faster than this (stops fake results)
export const MODERATORS = {
  host: { name: 'The host moderates', emoji: '🎬', blurb: 'The host runs the game and does not play. They know who the Millionaire is and can steer the secret agenda.' },
  player: { name: 'Another player moderates', emoji: '🎙️', blurb: 'The host plays. One chosen player runs the game and does not play.' },
  none: { name: 'No moderator', emoji: '🤖', blurb: 'The app runs the game on timers. Everyone plays, including the host. Nobody knows the secrets.' },
};
export const SECS = [0, 60, 90, 120, 180, 240, 300];
export const BREAK_SECS = [0, 15, 30, 45, 60, 90, 120, 180];
export const VOTE_SECS = [0, 60, 90, 120, 180, 300];

// Two teams, as even as possible, mixed up again every round.
export function makeTeams(ids) {
  const t = {};
  shuffle(ids).forEach((id, i) => { t[id] = i % 2; });
  return t;
}

const randomAgenda = () => pickOne(AGENDAS).key;
const pot = s => Math.round((TOTAL_POT / s.rounds) * s.history.length);

export const secret = {
  id: 'secret',
  name: 'Secret Millionaire',
  emoji: '💰',
  lateJoin: 'watch',
  inProgress: s => s.phase !== 'lobby' && s.phase !== 'end',

  init(env, opts) {
    if (opts?.memory?.saved) return opts.memory.saved;
    return {
      phase: 'lobby', gm: null, mod: 'host', moderator: null, rounds: 4, secs: 120, breakSecs: 0, voteSecs: 120, difficulty: 'rising', level: 0,
      mode: 'map', speed: 'normal', pickMode: 'random', pick: null,
      players: [], names: {}, team: {}, round: 0, startAt: 0, endAt: 0, breakEnd: 0, voteEnd: 0, shared: [],
      loc: {}, visited: {}, done: {}, goAt: {}, pts: {}, total: {}, teamPts: [0, 0], log: [], history: [],
      millionaire: null, agenda: null, nextAgenda: null, agendaRes: [], bonus: 0,
      clues: [], accusations: [], jailed: {}, votes: {}, outcome: null, error: null,
    };
  },
  remember: s => ({ saved: s }),
  deadline: s => (s.phase === 'round' ? s.endAt : s.phase === 'break' ? s.breakEnd : s.phase === 'vote' ? s.voteEnd : 0) || 0,

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    // who may press the buttons that move the game along: the host always (like Werewolf), and the chosen moderator
    const ctl = isHost || (s.gm != null && a.from === s.gm);
    // who may touch the secrets (the Millionaire and their agenda): only the person moderating
    const secretsOk = s.gm != null && a.from === s.gm;
    if (s.phase === 'lobby') s = { ...s, names: Object.fromEntries(env.players.map(p => [p.id, p.name])) };

    if (a.type === 'reset' && isHost) { const k = this.init(env); const keep = ['mod', 'moderator', 'rounds', 'secs', 'breakSecs', 'voteSecs', 'difficulty', 'mode', 'speed', 'pickMode', 'pick']; for (const f of keep) k[f] = s[f]; return k; }

    /* ---------- the waiting room ---------- */
    if (s.phase === 'lobby') {
      // who is moderating, if anyone: the host, a chosen player, or nobody
      const modId = s.mod === 'host' ? env.hostId : s.mod === 'player' ? s.moderator : null;
      if (a.type === 'config' && (isHost || (modId != null && a.from === modId))) {
        const p = a.data ?? {};
        const n = { ...s, error: null };
        if (isHost) {
          if (Number.isInteger(p.rounds) && p.rounds >= 3 && p.rounds <= 6) n.rounds = p.rounds;
          if (SECS.includes(p.secs)) n.secs = p.secs;
          if (BREAK_SECS.includes(p.breakSecs)) n.breakSecs = p.breakSecs;
          if (VOTE_SECS.includes(p.voteSecs)) n.voteSecs = p.voteSecs;
          if (p.difficulty in DIFFICULTIES) n.difficulty = p.difficulty;
          if (p.mode === 'map' || p.mode === 'rooms') n.mode = p.mode;
          if (['slow', 'normal', 'fast'].includes(p.speed)) n.speed = p.speed;
          if (p.mod in MODERATORS) { n.mod = p.mod; if (p.mod !== 'player') n.moderator = null; if (p.mod !== 'host') { n.pickMode = 'random'; n.pick = null; n.nextAgenda = null; } }
          if (n.mod === 'player' && typeof p.moderator === 'string' && p.moderator !== env.hostId && s.names[p.moderator] != null) n.moderator = p.moderator;
          if (n.mod === 'player' && n.moderator != null && s.names[n.moderator] == null) n.moderator = null;
        }
        // the secrets are the moderator's to choose (the host moderates by default)
        const mod2 = n.mod === 'host' ? env.hostId : n.mod === 'player' ? n.moderator : null;
        if (mod2 != null && a.from === mod2) {
          if (p.pickMode === 'random' || p.pickMode === 'host') n.pickMode = p.pickMode;
          if ('pick' in p) n.pick = s.names[p.pick] != null && p.pick !== mod2 ? p.pick : null;
          if ('agenda' in p) n.nextAgenda = agendaOf(p.agenda) ? p.agenda : null;
        }
        return n;
      }
      if (a.type === 'start' && isHost) {
        if (s.mod === 'player' && (s.moderator == null || s.names[s.moderator] == null)) return { ...s, error: 'Pick which player moderates.' };
        const gm = s.mod === 'host' ? env.hostId : s.mod === 'player' ? s.moderator : null;
        const players = Object.keys(s.names).filter(id => id !== gm);
        if (players.length < MIN_PLAYERS) return { ...s, error: `Need at least ${MIN_PLAYERS} players${gm ? ', not counting the moderator' : ''} (${players.length} here).` };
        // with nobody moderating the app must run itself, so every clock has to be on
        const secs = s.mod === 'none' && !s.secs ? 120 : s.secs, breakSecs = s.mod === 'none' && !s.breakSecs ? 45 : s.breakSecs, voteSecs = s.mod === 'none' && !s.voteSecs ? 120 : s.voteSecs;
        const m = s.mod === 'host' || s.mod === 'player' ? (s.pickMode === 'host' && players.includes(s.pick) ? s.pick : pickOne(players)) : pickOne(players);
        return beginRound({ ...s, gm, secs, breakSecs, voteSecs, players, millionaire: m, round: 0, total: Object.fromEntries(players.map(id => [id, 0])), error: null }, env.now);
      }
      return s;
    }

    /* ---------- a round: everyone walks the mansion and does tasks ---------- */
    if (s.phase === 'round') {
      const sits = id => s.jailedNow?.includes(id);
      if (a.type === 'go' && s.players.includes(a.from) && !sits(a.from) && ROOMS.some(r => r.id === a.data?.room) && !s.done[a.from]?.[a.data.room]) {
        return { ...s, loc: { ...s.loc, [a.from]: a.data.room }, goAt: { ...s.goAt, [a.from]: env.now }, visited: { ...s.visited, [a.from]: { ...s.visited[a.from], [a.data.room]: true } } };
      }
      // walking into a room on the live map (the first time this round) counts as a visit
      if (a.type === 'visit' && s.players.includes(a.from) && !sits(a.from) && ROOMS.some(r => r.id === a.data?.room) && !s.visited[a.from]?.[a.data.room]) {
        return { ...s, visited: { ...s.visited, [a.from]: { ...s.visited[a.from], [a.data.room]: true } } };
      }
      if (a.type === 'leave' && s.players.includes(a.from)) { const { [a.from]: _, ...loc } = s.loc; return { ...s, loc }; }
      if (a.type === 'done' && s.players.includes(a.from) && !sits(a.from)) {
        const d = a.data ?? {}, room = d.room;
        if (s.loc[a.from] !== room || s.done[a.from]?.[room] || env.now - (s.goAt[a.from] ?? 0) < MIN_TASK_MS) return s;
        const ok = d.ok === true, ms = Math.max(0, Math.min(60000, Math.round(+d.ms || 0)));
        const gain = taskPoints(ok, ms), t = s.team[a.from];
        const n = {
          ...s, log: [...s.log, { r: s.round, id: a.from, room, ok, ms, kind: ROOMS.find(x => x.id === room).tasks.includes(d.kind) ? d.kind : null, lv: s.level }], done: { ...s.done, [a.from]: { ...s.done[a.from], [room]: true } },
          pts: { ...s.pts, [a.from]: (s.pts[a.from] ?? 0) + gain }, teamPts: s.teamPts.map((v, i) => (i === t ? v + gain : v)),
        };
        // everyone who can play has done everything: no need to wait for the clock
        const all = s.players.filter(id => !sits(id)).every(id => ROOMS.every(r => n.done[id]?.[r.id]));
        return all ? finishRound(n, env.now) : n;
      }
      if (a.type === 'agenda' && secretsOk) return { ...s, agenda: agendaOf(a.data?.key) ? { key: a.data.key } : s.agenda };
      if (a.type === 'endRound' && ctl) return finishRound(s, env.now);
      // the moderator (or the host) can start, extend or stop the countdown; with nobody moderating it can't be stopped
      if (a.type === 'timer' && ctl) {
        const d = a.data ?? {};
        if (Number.isFinite(d.add) && d.add > 0 && d.add <= 600) return { ...s, endAt: Math.max(s.endAt || env.now, env.now) + Math.round(d.add) * 1000 };
        if (Number.isFinite(d.secs) && d.secs > 0 && d.secs <= 3600) return { ...s, endAt: env.now + Math.round(d.secs) * 1000 };
        if (d.secs === 0 && s.gm != null) return { ...s, endAt: 0 };
        return s;
      }
      if (a.type === 'timeout' && s.endAt && env.now >= s.endAt - 200) return finishRound(s, env.now);
      if (a.type === 'share') return shareClue(s, a.from, a.data?.round);
      return s;
    }

    /* ---------- between rounds: results, clues, accusations ---------- */
    if (s.phase === 'break') {
      if (a.type === 'agenda' && secretsOk) return { ...s, nextAgenda: agendaOf(a.data?.key) ? a.data.key : null };
      if (a.type === 'next' && ctl) return beginRound(s, env.now);
      if (a.type === 'timeout' && s.breakEnd && env.now >= s.breakEnd - 200) return beginRound(s, env.now);
      if (a.type === 'share') return shareClue(s, a.from, a.data?.round);
      if (a.type === 'accuse' && s.players.includes(a.from) && s.players.includes(a.data?.target) && a.data.target !== a.from && !s.accusations.some(x => x.by === a.from)) {
        const ok = a.data.target === s.millionaire;
        const accusations = [...s.accusations, { r: s.round, by: a.from, target: a.data.target, ok }];
        if (ok) return end({ ...s, accusations }, { winner: 'detectives', by: [a.from], how: 'accusation' });
        return { ...s, accusations, jailed: { ...s.jailed, [a.from]: s.round + 1 } };   // wrong guess: sits out the next round
      }
      return s;
    }

    /* ---------- the final vote ---------- */
    if (s.phase === 'vote') {
      if (a.type === 'vote' && s.players.includes(a.from) && s.players.includes(a.data?.target) && a.data.target !== a.from) {
        const n = { ...s, votes: { ...s.votes, [a.from]: a.data.target } };
        return s.players.every(id => n.votes[id]) ? resolveVote(n) : n;
      }
      if (a.type === 'share') return shareClue(s, a.from, a.data?.round);
      if ((a.type === 'resolve' && ctl) || (a.type === 'timeout' && s.voteEnd && env.now >= s.voteEnd - 200)) return resolveVote(s);
      return s;
    }
    return s;
  },

  // What everyone may see. Who the Millionaire is, the agenda, the clues and the task log stay out of it until the end.
  view(s) {
    const { millionaire, agenda, nextAgenda, agendaRes, clues, log, done, goAt, pts, jailed, votes, pick, visited, ...pub } = s;
    const out = { ...pub, jailedNow: s.jailedNow ?? [], hasClue: [...new Set(clues.map(c => c.round))], voted: Object.keys(votes) };
    if (s.phase === 'end') Object.assign(out, { stats: taskStats(log), millionaire, agendaRes, clues: clues.map(({ round, text }) => ({ round, text })) });
    return out;
  },

  // Each person's own secrets, sent sealed to them alone. The host (game master) sees everything.
  priv(s) {
    const out = {};
    for (const id of s.players) {
      out[id] = { clues: s.clues.filter(c => c.to.includes(id)).map(({ round, text }) => ({ round, text, shared: s.shared.some(x => x.round === round) })), doneRooms: Object.keys(s.done[id] ?? {}), myVote: s.votes[id] ?? null };
      if (id === s.millionaire) Object.assign(out[id], { millionaire: true, agenda: s.agenda, agendaRes: s.agendaRes, bonus: s.bonus });
    }
    // in the waiting room the moderator (when it is a player) sees the secrets they have chosen so far
    if (s.phase === 'lobby' && s.mod === 'player' && s.moderator) out[s.moderator] = { lobby: { pick: s.pick, agenda: s.nextAgenda } };
    if (s.gm != null) out[s.gm] = { gm: true, millionaire: s.millionaire, agenda: s.agenda, nextAgenda: s.nextAgenda, agendaRes: s.agendaRes, bonus: s.bonus, log: s.log, visited: s.visited, clues: s.clues, done: s.done, pts: s.pts, votes: s.votes };
    return out;
  },

  render(el, s, ui) { renderSecret(el, s, ui, this); },
};

/* ---------- helpers that move the game along ---------- */

function beginRound(s, now) {
  const round = s.round + 1;
  const sitting = s.players.filter(id => s.jailed[id] === round);
  return {
    ...s, phase: 'round', round, startAt: now, endAt: s.secs ? now + s.secs * 1000 : 0, breakEnd: 0, level: levelFor(s.difficulty, round, s.rounds),
    team: makeTeams(s.players), teamPts: [0, 0], loc: {}, visited: {}, done: {}, goAt: {}, pts: {}, jailedNow: sitting,
    agenda: { key: s.nextAgenda ?? randomAgenda() }, nextAgenda: null, error: null,
  };
}

function finishRound(s, now) {
  const roundLog = s.log.filter(e => e.r === s.round);
  const per = Object.fromEntries(s.players.map(id => [id, s.pts[id] ?? 0]));
  const top = Math.max(...s.teamPts);
  const winners = top > 0 ? [0, 1].filter(t => s.teamPts[t] === top) : [];
  const to = s.players.filter(id => winners.includes(s.team[id]));
  const used = s.clues.map(c => c.kind);
  const clue = to.length ? makeClue({ log: roundLog, visited: Object.keys(s.visited[s.millionaire] ?? {}), team: s.team, players: s.players, names: s.names, millionaire: s.millionaire, used }) : null;
  const visited = new Set([...Object.keys(s.visited[s.millionaire] ?? {}), ...roundLog.filter(e => e.id === s.millionaire).map(e => e.room)]);
  const mine = roundLog.filter(e => e.id === s.millionaire);
  const res = agendaOf(s.agenda?.key)?.check({ visited, done: mine.length, ok: mine.filter(e => e.ok).length, fails: mine.filter(e => !e.ok).length, fastest: Math.min(Infinity, ...mine.filter(e => e.ok).map(e => e.ms)), tags: (s.tags ?? []).filter(x => x.r === s.round && x.by === s.millionaire).length, won: winners.includes(s.team[s.millionaire]) }) ?? false;
  const n = {
    ...s, phase: s.round < s.rounds ? 'break' : 'vote', endAt: 0, breakEnd: s.round < s.rounds && s.breakSecs ? now + s.breakSecs * 1000 : 0, voteEnd: s.round >= s.rounds && s.voteSecs ? now + s.voteSecs * 1000 : 0,
    total: Object.fromEntries(s.players.map(id => [id, (s.total[id] ?? 0) + per[id]])),
    history: [...s.history, { round: s.round, teamPts: s.teamPts, winners, per, team: s.team, sat: s.jailedNow ?? [] }],
    clues: clue ? [...s.clues, { round: s.round, kind: clue.kind, text: clue.text, to }] : s.clues,
    agendaRes: [...s.agendaRes, { round: s.round, key: s.agenda?.key, ok: res }], bonus: s.bonus + (res ? BONUS : 0),
    loc: {},
  };
  return n;
}

// A clue holder tells everyone the clue (it can't be changed, only shared or kept). Once is enough for the whole team.
// How the tasks went in this game: for each task, how many tries, the share that passed, and the typical time.
export function taskStats(log) {
  const by = {};
  for (const e of log) if (e.kind) (by[e.kind] ??= []).push(e);
  return Object.entries(by).map(([kind, es]) => {
    const ms = es.map(e => e.ms).sort((a, b) => a - b);
    return { kind, n: es.length, pass: es.filter(e => e.ok).length, ms: ms[Math.floor(ms.length / 2)], byLevel: [0, 1, 2].map(l => { const x = es.filter(e => e.lv === l); return { n: x.length, pass: x.filter(e => e.ok).length }; }) };
  }).sort((a, b) => b.n - a.n);
}

function shareClue(s, from, round) {
  const c = s.clues.find(x => x.round === round);
  if (!c || !c.to.includes(from) || s.shared.some(x => x.round === round)) return s;
  return { ...s, shared: [...s.shared, { round, by: from, text: c.text }] };
}

function resolveVote(s) {
  const tally = {};
  for (const t of Object.values(s.votes)) tally[t] = (tally[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const lead = Object.keys(tally).filter(t => tally[t] === max);
  if (lead.length === 1 && lead[0] === s.millionaire) {
    return end(s, { winner: 'detectives', by: s.players.filter(id => s.votes[id] === s.millionaire), how: 'vote' });
  }
  return end(s, { winner: 'millionaire', by: [s.millionaire], how: 'vote', caught: lead.length === 1 ? lead[0] : null });
}

function end(s, outcome) {
  const total = pot(s) + (outcome.winner === 'millionaire' ? s.bonus : 0);
  return { ...s, phase: 'end', outcome: { ...outcome, pot: pot(s), bonus: outcome.winner === 'millionaire' ? s.bonus : 0, total } };
}
