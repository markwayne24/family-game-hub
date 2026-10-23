import { ROOMS, TEAMS, MIN_PLAYERS, TOTAL_POT, BONUS, AGENDAS, agendaOf } from './secret-data.js';
import { makeClue, taskPoints } from './secret-clues.js';
import { renderSecret } from './secret-ui.js';

export { MIN_PLAYERS };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const MIN_TASK_MS = 1200;   // a task can't be finished faster than this (stops fake results)
const VOTE_MS = 120000;

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
      phase: 'lobby', gm: env.hostId, rounds: 4, secs: 120, mode: 'map', speed: 'normal', pickMode: 'random', pick: null,
      players: [], names: {}, team: {}, round: 0, startAt: 0, endAt: 0, voteEnd: 0,
      loc: {}, visited: {}, done: {}, goAt: {}, pts: {}, total: {}, teamPts: [0, 0], log: [], history: [],
      millionaire: null, agenda: null, nextAgenda: null, agendaRes: [], bonus: 0,
      clues: [], accusations: [], jailed: {}, votes: {}, outcome: null, error: null,
    };
  },
  remember: s => ({ saved: s }),
  deadline: s => (s.phase === 'round' ? s.endAt : s.phase === 'vote' ? s.voteEnd : 0),

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    const live = () => s.players.filter(id => !s.jailedNow?.includes(id));
    if (s.phase === 'lobby') s = { ...s, names: Object.fromEntries(env.players.filter(p => p.id !== env.hostId).map(p => [p.id, p.name])) };

    if (a.type === 'reset' && isHost) return { ...this.init(env), rounds: s.rounds, secs: s.secs, mode: s.mode, speed: s.speed, pickMode: s.pickMode, pick: s.pick };

    /* ---------- the waiting room ---------- */
    if (s.phase === 'lobby') {
      if (a.type === 'config' && isHost) {
        const p = a.data ?? {};
        const n = { ...s, error: null };
        if (Number.isInteger(p.rounds) && p.rounds >= 3 && p.rounds <= 6) n.rounds = p.rounds;
        if ([60, 90, 120, 180, 240].includes(p.secs)) n.secs = p.secs;
        if (p.mode === 'map' || p.mode === 'rooms') n.mode = p.mode;
        if (['slow', 'normal', 'fast'].includes(p.speed)) n.speed = p.speed;
        if (p.pickMode === 'random' || p.pickMode === 'host') n.pickMode = p.pickMode;
        if ('pick' in p) n.pick = s.names[p.pick] != null ? p.pick : null;
        if ('agenda' in p) n.nextAgenda = agendaOf(p.agenda) ? p.agenda : null;
        return n;
      }
      if (a.type === 'start' && isHost) {
        const players = Object.keys(s.names);
        if (players.length < MIN_PLAYERS) return { ...s, error: `Need at least ${MIN_PLAYERS} players besides you (${players.length} here).` };
        const m = s.pickMode === 'host' && players.includes(s.pick) ? s.pick : pickOne(players);
        return beginRound({ ...s, players, millionaire: m, round: 0, total: Object.fromEntries(players.map(id => [id, 0])), error: null }, env.now);
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
          ...s, log: [...s.log, { r: s.round, id: a.from, room, ok, ms }], done: { ...s.done, [a.from]: { ...s.done[a.from], [room]: true } },
          pts: { ...s.pts, [a.from]: (s.pts[a.from] ?? 0) + gain }, teamPts: s.teamPts.map((v, i) => (i === t ? v + gain : v)),
        };
        // everyone who can play has done everything: no need to wait for the clock
        const all = s.players.filter(id => !sits(id)).every(id => ROOMS.every(r => n.done[id]?.[r.id]));
        return all ? finishRound(n, env.now) : n;
      }
      if (a.type === 'agenda' && isHost) return { ...s, agenda: agendaOf(a.data?.key) ? { key: a.data.key } : s.agenda };
      if (a.type === 'endRound' && isHost) return finishRound(s, env.now);
      if (a.type === 'timeout' && env.now >= s.endAt - 200) return finishRound(s, env.now);
      return s;
    }

    /* ---------- between rounds: results, clues, accusations ---------- */
    if (s.phase === 'break') {
      if (a.type === 'agenda' && isHost) return { ...s, nextAgenda: agendaOf(a.data?.key) ? a.data.key : null };
      if (a.type === 'next' && isHost) return beginRound(s, env.now);
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
      if ((a.type === 'resolve' && isHost) || (a.type === 'timeout' && env.now >= s.voteEnd - 200)) return resolveVote(s);
      return s;
    }
    return s;
  },

  // What everyone may see. Who the Millionaire is, the agenda, the clues and the task log stay out of it until the end.
  view(s) {
    const { millionaire, agenda, nextAgenda, agendaRes, clues, log, done, goAt, pts, jailed, votes, pick, visited, ...pub } = s;
    const out = { ...pub, jailedNow: s.jailedNow ?? [], hasClue: [...new Set(clues.map(c => c.round))], voted: Object.keys(votes) };
    if (s.phase === 'end') Object.assign(out, { millionaire, agendaRes, clues: clues.map(({ round, text }) => ({ round, text })) });
    return out;
  },

  // Each person's own secrets, sent sealed to them alone. The host (game master) sees everything.
  priv(s) {
    const out = {};
    for (const id of s.players) {
      out[id] = { clues: s.clues.filter(c => c.to.includes(id)).map(({ round, text }) => ({ round, text })), doneRooms: Object.keys(s.done[id] ?? {}), myVote: s.votes[id] ?? null };
      if (id === s.millionaire) Object.assign(out[id], { millionaire: true, agenda: s.agenda, agendaRes: s.agendaRes, bonus: s.bonus });
    }
    out[s.gm] = { gm: true, millionaire: s.millionaire, agenda: s.agenda, nextAgenda: s.nextAgenda, agendaRes: s.agendaRes, bonus: s.bonus, log: s.log, visited: s.visited, clues: s.clues, done: s.done, pts: s.pts, votes: s.votes };
    return out;
  },

  render(el, s, ui) { renderSecret(el, s, ui, this); },
};

/* ---------- helpers that move the game along ---------- */

function beginRound(s, now) {
  const round = s.round + 1;
  const sitting = s.players.filter(id => s.jailed[id] === round);
  return {
    ...s, phase: 'round', round, startAt: now, endAt: now + s.secs * 1000,
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
  const res = agendaOf(s.agenda?.key)?.check({ visited, done: mine.length, ok: mine.filter(e => e.ok).length, won: winners.includes(s.team[s.millionaire]) }) ?? false;
  const n = {
    ...s, phase: s.round < s.rounds ? 'break' : 'vote', voteEnd: s.round < s.rounds ? 0 : now + VOTE_MS,
    total: Object.fromEntries(s.players.map(id => [id, (s.total[id] ?? 0) + per[id]])),
    history: [...s.history, { round: s.round, teamPts: s.teamPts, winners, per, team: s.team, sat: s.jailedNow ?? [] }],
    clues: clue ? [...s.clues, { round: s.round, kind: clue.kind, text: clue.text, to }] : s.clues,
    agendaRes: [...s.agendaRes, { round: s.round, key: s.agenda?.key, ok: res }], bonus: s.bonus + (res ? BONUS : 0),
    loc: {},
  };
  return n;
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
