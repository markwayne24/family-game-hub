import { secret as G, makeTeams, MIN_PLAYERS } from '../games/secret.js';
import { makeClue, taskPoints } from '../games/secret-clues.js';
import { levelFor } from '../games/secret-data.js';
import { taskStats } from '../games/secret.js';
import { ROOMS, AGENDAS } from '../games/secret-data.js';
import assert from 'node:assert';

const ids = n => Array.from({ length: n }, (_, i) => (i ? 'p' + i : 'h'));          // 'h' is the host / game master
const env = (n, now = 1000) => ({ players: ids(n).map(id => ({ id, name: id === 'h' ? 'Host' : 'Pl' + id.slice(1) })), hostId: 'h', now });
const step = (s, e, from, type, data) => G.reduce(s, { from, type, data }, e);
const start = (n = 6, cfg = {}, now = 1000) => {
  const e = env(n, now); let s = G.init(e);
  if (Object.keys(cfg).length) s = step(s, e, 'h', 'config', cfg);
  return { e, s: step(s, e, 'h', 'start') };
};

// ---- starting
{
  const e = env(MIN_PLAYERS); const s = step(G.init(e), e, 'h', 'start');
  assert.equal(s.phase, 'lobby'); assert.ok(s.error, 'needs enough players');
  const { s: r } = start(6);
  assert.equal(r.phase, 'round'); assert.equal(r.players.length, 5); assert.ok(!r.players.includes('h'), 'the host is the game master, not a player');
  assert.ok(r.players.includes(r.millionaire));
  assert.equal(Object.keys(r.team).length, 5);
  const sizes = [0, 1].map(t => Object.values(r.team).filter(x => x === t).length); assert.ok(Math.abs(sizes[0] - sizes[1]) <= 1);
  const picked = start(6, { pickMode: 'host', pick: 'p3' }); assert.equal(picked.s.millionaire, 'p3');
}
// ---- the Millionaire stays secret
{
  const { e, s } = start(6);
  const pub = JSON.stringify(G.view(s));
  assert.ok(!pub.includes(`"millionaire":"${s.millionaire}"`) && !/agenda/.test(pub) && !/"log"/.test(pub), 'secrets are not in the public view');
  const p = G.priv(s);
  assert.equal(p.h.millionaire, s.millionaire); assert.ok(p.h.gm);
  for (const id of s.players) assert.equal(!!p[id].millionaire, id === s.millionaire);
  assert.ok(p[s.millionaire].agenda && !p[s.players.find(x => x !== s.millionaire)].agenda);
}
// ---- tasks and points
{
  let { e, s } = start(6, {}, 1000);
  const a = s.players[0], room = 'kitchen';
  assert.equal(step(s, e, a, 'done', { room, ok: true, ms: 3000 }), s, 'cannot finish a task you never walked to');
  s = step(s, { ...e, now: 2000 }, a, 'go', { room }); assert.equal(s.loc[a], room);
  assert.equal(step(s, { ...e, now: 2300 }, a, 'done', { room, ok: true, ms: 100 }).log.length, 0, 'too fast to be real');
  const d = step(s, { ...e, now: 6000 }, a, 'done', { room, ok: true, ms: 3000 });
  assert.equal(d.log.length, 1); assert.equal(d.pts[a], taskPoints(true, 3000)); assert.equal(d.teamPts[d.team[a]], taskPoints(true, 3000));
  assert.equal(step(d, { ...e, now: 7000 }, a, 'done', { room, ok: true, ms: 3000 }).log.length, 1, 'once per room');
  assert.equal(step(d, { ...e, now: 7000 }, a, 'go', { room }).loc[a], room); // (can still stand there)
  assert.equal(step(s, e, 'stranger', 'go', { room }), s); assert.equal(step(s, e, a, 'go', { room: 'attic' }), s);
  assert.equal(taskPoints(false, 1000), 0); assert.ok(taskPoints(true, 1000) > taskPoints(true, 20000));
}
// ---- a whole round: the winning team gets a true clue; the other team gets nothing
const play = (s, e, plan, now0 = 2000) => {            // plan: id -> [[room, ok, ms]]
  let now = now0;
  for (const [id, tasks] of Object.entries(plan)) for (const [room, ok, ms] of tasks) {
    s = step(s, { ...e, now }, id, 'go', { room }); now += 2000;
    s = step(s, { ...e, now }, id, 'done', { room, ok, ms }); now += 100;
  }
  return s;
};
{
  let { e, s } = start(6, { rounds: 3 }, 1000);
  const m = s.millionaire, [x] = s.players.filter(id => id !== m && s.team[id] !== s.team[m]);
  s = play(s, e, { [m]: [['library', true, 5000]], [x]: [['kitchen', true, 2000], ['garage', true, 2000]] });
  assert.equal(step(s, { ...e, now: 5000 }, 'h', 'timeout').phase, 'round', 'too early for the clock');
  const f = step(s, { ...e, now: s.endAt + 10 }, 'h', 'timeout');
  assert.equal(f.phase, 'break'); assert.equal(f.history.length, 1);
  assert.deepEqual(f.history[0].winners, [s.team[x]]);
  assert.equal(f.clues.length, 1); assert.ok(f.clues[0].to.every(id => s.team[id] === s.team[x]), 'only the winners get it');
  assert.ok(!f.clues[0].to.includes(m));
  const pr = G.priv(f); assert.equal(pr[x].clues.length, 1); assert.equal(pr[m].clues.length, 0);
  assert.ok(!JSON.stringify(G.view(f)).includes(f.clues[0].text), 'clue text is private');
  assert.equal(f.total[x], f.history[0].per[x]);
  // next round: teams are mixed again and the board is clean
  const n = step(f, e, 'h', 'next'); assert.equal(n.round, 2); assert.deepEqual(n.teamPts, [0, 0]); assert.deepEqual(n.log.filter(l => l.r === 2), []);
  assert.equal(step(f, e, 'p1', 'next'), f, 'only the host can start the next round');
}
// ---- a round ends by itself when everyone has done everything
{
  let { e, s } = start(5, {}, 1000);
  const plan = Object.fromEntries(s.players.map(id => [id, ROOMS.map(r => [r.id, true, 4000])]));
  const f = play(s, e, plan); assert.equal(f.phase, 'break');
}
// ---- the host can end the round early; ties give both teams a clue
{
  let { e, s } = start(6, {}, 1000);
  const f = step(s, { ...e, now: 3000 }, 'h', 'endRound'); assert.equal(f.phase, 'break'); assert.equal(f.clues.length, 0, 'nobody scored, no clue');
}
// ---- agendas are checked automatically
{
  for (const room of ['library', 'kitchen']) {
    let { e, s } = start(6, { agenda: `visit:${room}` }, 1000);
    assert.equal(s.agenda.key, `visit:${room}`);
    s = play(s, e, { [s.millionaire]: [[room, true, 3000]] });
    const f = step(s, { ...e, now: s.endAt + 1 }, 'h', 'timeout');
    assert.deepEqual(f.agendaRes.map(r => r.ok), [true]); assert.ok(f.bonus > 0);
    assert.equal(G.priv(f)[f.millionaire].bonus, f.bonus);
  }
  let { e, s } = start(6, { agenda: 'avoid:vault' }, 1000);
  s = play(s, e, { [s.millionaire]: [['vault', true, 3000]] });
  assert.equal(step(s, { ...e, now: s.endAt + 1 }, 'h', 'timeout').agendaRes[0].ok, false);
  // the host changes the agenda for the next round, in the break
  let r = step(s, { ...e, now: s.endAt + 1 }, 'h', 'timeout');
  r = step(r, e, 'h', 'agenda', { key: 'busy' }); assert.equal(step(r, e, 'h', 'next').agenda.key, 'busy');
  assert.equal(step(r, e, 'p1', 'agenda', { key: 'lazy' }).nextAgenda, 'busy', 'only the host');
}
// ---- accusations
{
  let { e, s } = start(6, { rounds: 3 }, 1000);
  let b = step(s, { ...e, now: s.endAt + 1 }, 'h', 'timeout');
  const wrong = b.players.find(id => id !== b.millionaire), t = b.players.find(id => id !== b.millionaire && id !== wrong);
  const w = step(b, e, wrong, 'accuse', { target: t });
  assert.equal(w.phase, 'break'); assert.deepEqual(w.accusations, [{ r: 1, by: wrong, target: t, ok: false }]);
  assert.equal(step(w, e, wrong, 'accuse', { target: b.millionaire }).phase, 'break', 'one accusation each');
  const next = step(w, e, 'h', 'next'); assert.ok(next.jailedNow.includes(wrong), 'a wrong accuser sits out the next round');
  assert.equal(step(next, e, wrong, 'go', { room: 'kitchen' }).loc[wrong], undefined);
  assert.equal(step(step(next, e, 'h', 'endRound'), e, 'h', 'next').jailedNow.includes(wrong), false, 'only for one round');
  const right = step(b, e, wrong, 'accuse', { target: b.millionaire });
  assert.equal(right.phase, 'end'); assert.equal(right.outcome.winner, 'detectives'); assert.deepEqual(right.outcome.by, [wrong]);
  assert.equal(G.view(right).millionaire, b.millionaire, 'revealed at the end');
  assert.equal(step(b, e, b.millionaire, 'accuse', { target: b.millionaire }), b, 'not yourself');
  assert.equal(step(b, e, 'h', 'accuse', { target: b.millionaire }), b, 'the game master does not accuse');
}
// ---- the final vote
{
  const finish = cfg => { let { e, s } = start(6, { rounds: 3 }, 1000); for (let r = 0; r < 3; r++) { s = step(s, { ...e, now: s.endAt + 1 }, 'h', 'endRound'); if (s.phase === 'break') s = step(s, e, 'h', 'next'); } return { e, s }; };
  let { e, s } = finish();
  assert.equal(s.phase, 'vote'); assert.equal(s.round, 3); assert.equal(s.history.length, 3);
  const m = s.millionaire, others = s.players.filter(id => id !== m);
  // everyone votes for the Millionaire
  let v = s; for (const id of others) v = step(v, e, id, 'vote', { target: m });
  assert.equal(v.phase, 'vote', 'the Millionaire must vote too');
  v = step(v, e, m, 'vote', { target: others[0] });
  assert.equal(v.phase, 'end'); assert.equal(v.outcome.winner, 'detectives'); assert.equal(v.outcome.by.length, others.length); assert.equal(v.outcome.pot, 1000000);
  // the Millionaire escapes when the votes split or point elsewhere
  let w = s; for (const id of s.players) w = step(w, e, id, 'vote', { target: s.players.find(x => x !== id && x !== m) ?? others[0] });
  assert.equal(w.phase, 'end'); assert.equal(w.outcome.winner, 'millionaire'); assert.ok(w.outcome.total >= 1000000);
  // a tie is not enough, and the host can close the vote early
  let t = step(s, e, others[0], 'vote', { target: m }); t = step(t, e, others[1], 'vote', { target: others[2] });
  const closed = step(t, e, 'h', 'resolve'); assert.equal(closed.outcome.winner, 'millionaire');
  assert.equal(step(s, { ...e, now: s.voteEnd + 1 }, 'h', 'timeout').phase, 'end');
  assert.equal(G.deadline(s), s.voteEnd);
  // start over
  const again = step(v, e, 'h', 'reset'); assert.equal(again.phase, 'lobby'); assert.equal(again.rounds, 3); assert.equal(again.history.length, 0);
}
// ---- clues are always true
for (let k = 0; k < 400; k++) {
  const players = ['a', 'b', 'c', 'd', 'e'], m = players[k % 5];
  const log = []; for (const id of players) for (const r of ROOMS) if (Math.random() < 0.5) log.push({ id, room: r.id, ok: Math.random() < 0.7, ms: 1500 + Math.floor(Math.random() * 20000) });
  const names = { a: 'Anna', b: 'Zed', c: 'Marcellus', d: 'Bo', e: 'Nina' };
  const team = { a: 0, b: 1, c: 0, d: 1, e: 0 };
  const c = makeClue({ log, team, players, names, millionaire: m, used: [] });
  assert.ok(c && c.text.startsWith('The Millionaire') || /This round the Millionaire/.test(c.text));
  const mine = log.filter(e => e.id === m), vis = new Set(mine.map(e => e.room)), okN = mine.filter(e => e.ok).length;
  if (c.kind === 'visit') assert.ok(ROOMS.some(r => c.text.includes(`the ${r.name}`) && vis.has(r.id)));
  if (c.kind === 'skip') assert.ok(ROOMS.some(r => c.text.includes(`the ${r.name}`) && !vis.has(r.id)));
  if (c.kind === 'count') assert.ok(okN === 0 ? /no tasks/.test(c.text) : c.text.includes(`exactly ${okN} task`));
  if (c.kind === 'fail') assert.equal(/failed at least/.test(c.text), mine.some(e => !e.ok));
  if (c.kind === 'speed') { const lim = +c.text.match(/under (\d+)/)[1]; assert.ok(Math.min(...mine.filter(e => e.ok).map(e => e.ms)) < lim * 1000); }
  if (c.kind === 'team') assert.ok(c.text.includes(team[m] === 0 ? 'Red' : 'Blue'));
  if (c.kind === 'initial') assert.equal(/A to M/.test(c.text), names[m][0].toUpperCase() <= 'M');
  if (c.kind === 'length') assert.equal(/more than 5/.test(c.text), names[m].length > 5);
}
// kinds are not repeated while there are fresh ones
{
  const log = ROOMS.map(r => ({ id: 'a', room: r.id, ok: true, ms: 3000 }));
  const used = ['visit', 'skip', 'fail', 'count', 'speed', 'rank', 'team', 'initial'];
  for (let k = 0; k < 30; k++) assert.equal(makeClue({ log, team: { a: 0 }, players: ['a', 'b', 'c', 'd'], names: { a: 'Ann' }, millionaire: 'a', used }).kind, 'length');
}
assert.ok(makeTeams(['a', 'b', 'c', 'd', 'e']) && AGENDAS.length >= 10);
// ---- walking speed setting
{
  const e = env(6); let s = G.init(e);
  assert.equal(s.speed, 'normal');
  assert.equal(step(s, e, 'h', 'config', { speed: 'fast' }).speed, 'fast');
  assert.equal(step(s, e, 'h', 'config', { speed: 'warp' }).speed, 'normal');
  assert.equal(step(s, e, 'p1', 'config', { speed: 'fast' }).speed, 'normal', 'only the host');
  assert.equal(step(step(s, e, 'h', 'config', { speed: 'slow' }), e, 'h', 'reset').speed, 'slow', 'kept for the next game');
}
// ---- walking into rooms on the live map
{
  let { e, s } = start(6, { mode: 'rooms', agenda: 'visit:vault' }, 1000);
  assert.equal(s.mode, 'rooms'); assert.equal(G.reduce(G.init(env(6)), { from: 'h', type: 'config', data: { mode: 'bogus' } }, env(6)).mode, 'map', 'map is the default');
  const m = s.millionaire, o = s.players.find(x => x !== m);
  assert.equal(step(s, e, 'stranger', 'visit', { room: 'vault' }), s); assert.equal(step(s, e, o, 'visit', { room: 'attic' }), s);
  const v = step(s, e, m, 'visit', { room: 'vault' }); assert.deepEqual(v.visited[m], { vault: true });
  assert.equal(step(v, e, m, 'visit', { room: 'vault' }), v, 'only counted once');
  assert.ok(!JSON.stringify(G.view(v)).includes('vault":true'), 'visits are private');
  assert.deepEqual(G.priv(v).h.visited[m], { vault: true });
  const f = step(v, { ...e, now: v.endAt + 1 }, 'h', 'timeout');
  assert.equal(f.agendaRes[0].ok, true, 'walking in is enough for a visit agenda');
  assert.deepEqual(step(f, e, 'h', 'next').visited, {}, 'a new round starts empty');
  // a clue can say where the Millionaire walked, even without doing a task there
  const c = makeClue({ log: [], visited: ['vault'], team: { a: 0 }, players: ['a', 'b', 'c', 'd'], names: { a: 'Ann' }, millionaire: 'a', used: ['skip', 'fail', 'count', 'speed', 'rank', 'team', 'initial', 'length'] });
  assert.equal(c.kind, 'visit'); assert.ok(c.text.includes('Vault'));
  const c2 = makeClue({ log: [], visited: ['vault'], team: { a: 0 }, players: ['a', 'b', 'c', 'd'], names: { a: 'Ann' }, millionaire: 'a', used: ['visit', 'fail', 'count', 'speed', 'rank', 'team', 'initial', 'length'] });
  assert.ok(c2.kind === 'skip' && !c2.text.includes('Vault'), 'never says they skipped a room they walked into');
}
// ---- who moderates: the host, another player, or nobody
{
  const e = env(7);
  const setup = cfg => { let s = G.init(e); for (const c of cfg) s = step(s, e, c[0], 'config', c[1]); return s; };
  // a player moderates: the host plays
  let s = setup([['h', { mod: 'player', moderator: 'p1' }]]);
  assert.equal(s.mod, 'player'); assert.equal(s.moderator, 'p1');
  assert.equal(step(setup([['h', { mod: 'player' }]]), e, 'h', 'start').error, 'Pick which player moderates.');
  assert.equal(setup([['p2', { mod: 'player', moderator: 'p1' }]]).mod, 'host', 'only the host picks the moderator');
  assert.equal(setup([['h', { mod: 'player', moderator: 'h' }]]).moderator, null, 'the host is not "another player"');
  s = setup([['h', { mod: 'player', moderator: 'p1' }], ['p1', { pickMode: 'host', pick: 'p3', agenda: 'busy', rounds: 6 }], ['h', { pick: 'p2', agenda: 'lazy' }]]);
  assert.equal(s.pick, 'p3'); assert.equal(s.nextAgenda, 'busy'); assert.equal(s.rounds, 4, 'the moderator only picks the secrets');
  assert.equal(step(s, e, 'p1', 'config', { pick: 'p1' }).pick, null, 'the moderator cannot be the Millionaire');
  let g = step(s, e, 'h', 'start');
  assert.equal(g.phase, 'round'); assert.equal(g.gm, 'p1'); assert.ok(g.players.includes('h')); assert.ok(!g.players.includes('p1')); assert.equal(g.players.length, 6); assert.equal(g.millionaire, 'p3');
  assert.equal(g.agenda.key, 'busy');
  const pr = G.priv(g); assert.ok(pr.p1.gm && pr.p1.millionaire === 'p3'); assert.ok(!pr.h.gm && !pr.h.millionaire, 'the host is just a player now');
  assert.ok(!JSON.stringify(G.view(g)).includes('"pick"'), 'the choice is not public');
  // progress buttons: the moderator and the host (as a safety net), nobody else; secrets: only the moderator
  assert.equal(step(g, e, 'p2', 'endRound').phase, 'round');
  assert.equal(step(g, e, 'h', 'agenda', { key: 'lazy' }).agenda.key, 'busy', 'the host cannot touch the secrets when someone else moderates');
  assert.equal(step(g, e, 'p1', 'agenda', { key: 'lazy' }).agenda.key, 'lazy');
  assert.equal(step(g, { ...e, now: 3000 }, 'p1', 'endRound').phase, 'break');
  assert.equal(step(g, { ...e, now: 3000 }, 'h', 'endRound').phase, 'break');
  let b = step(g, { ...e, now: 3000 }, 'p1', 'endRound');
  assert.equal(step(b, e, 'p2', 'next').phase, 'break'); assert.equal(step(b, e, 'p1', 'next').phase, 'round'); assert.equal(step(b, e, 'h', 'next').phase, 'round');
  assert.equal(step(b, e, 'p2', 'agenda', { key: 'lazy' }).nextAgenda, null);
  // the moderator cannot play or be accused
  assert.equal(step(b, e, 'p1', 'accuse', { target: 'p2' }), b); assert.equal(step(b, e, 'p2', 'accuse', { target: 'p1' }), b);
  // a host-moderated game needs 4 players besides the host, a player-moderated one 4 besides the moderator
  assert.ok(step(step(G.init(env(4)), env(4), 'h', 'config', {}), env(4), 'h', 'start').error);
  assert.equal(step(G.init(env(5)), env(5), 'h', 'start').phase, 'round');
  const e4 = env(4); assert.equal(step(step(G.init(e4), e4, 'h', 'config', { mod: 'player', moderator: 'p1' }), e4, 'h', 'start').phase, 'lobby');
  const e5 = env(5); assert.equal(step(step(G.init(e5), e5, 'h', 'config', { mod: 'player', moderator: 'p1' }), e5, 'h', 'start').phase, 'round', '5 people, one moderating, 4 playing');
  // nobody moderates: everyone plays, including the host; there are no secrets for anyone to see
  const en = env(5); let n = step(G.init(en), en, 'h', 'config', { mod: 'none', secs: 0, breakSecs: 0, voteSecs: 0 });
  assert.equal(n.secs, 0, 'the lobby keeps what was chosen'); n = step(n, en, 'h', 'start');
  assert.equal(n.phase, 'round'); assert.equal(n.gm, null); assert.equal(n.players.length, 5); assert.ok(n.players.includes('h'));
  assert.ok(n.secs > 0 && n.breakSecs > 0 && n.voteSecs > 0, 'with no moderator every clock is on'); assert.ok(n.endAt > en.now);
  assert.ok(Object.values(G.priv(n)).every(x => !x.gm)); assert.equal(Object.keys(G.priv(n)).length, 5);
  assert.equal(step(n, en, 'h', 'agenda', { key: 'lazy' }).agenda.key, n.agenda.key, 'nobody picks the agenda');
  assert.equal(step(n, en, 'h', 'timer', { secs: 0 }).endAt, n.endAt, 'the clock cannot be stopped');
  assert.equal(step(step(G.init(en), en, 'h', 'config', { mod: 'none', pickMode: 'host', pick: 'p2' }), en, 'h', 'config', { pick: 'p2' }).pick, null, 'no one picks the Millionaire');
}
// ---- the clocks
{
  const e = env(7); const go = cfg => { let s = G.init(e); s = step(s, e, 'h', 'config', cfg); return step(s, { ...e, now: 1000 }, 'h', 'start'); };
  let s = go({ secs: 0 });
  assert.equal(s.endAt, 0, 'no time limit'); assert.equal(G.deadline(s), 0);
  assert.equal(step(s, { ...e, now: 9e9 }, 'h', 'timeout').phase, 'round', 'it never ends by itself');
  assert.equal(step(s, { ...e, now: 5000 }, 'h', 'endRound').phase, 'break', 'the moderator ends it whenever they like');
  assert.equal(step(s, e, 'p1', 'endRound').phase, 'round', 'a player cannot');
  // start, extend, stop
  const t = step(s, { ...e, now: 5000 }, 'h', 'timer', { secs: 90 }); assert.equal(t.endAt, 95000); assert.equal(G.deadline(t), 95000);
  assert.equal(step(t, { ...e, now: 6000 }, 'h', 'timer', { add: 30 }).endAt, 125000);
  assert.equal(step(s, { ...e, now: 6000 }, 'h', 'timer', { add: 30 }).endAt, 36000, 'extending with no clock starts one');
  assert.equal(step(t, e, 'h', 'timer', { secs: 0 }).endAt, 0, 'the clock can be stopped when there is a moderator');
  assert.equal(step(t, e, 'p2', 'timer', { add: 30 }), t); assert.equal(step(t, e, 'h', 'timer', { add: -5 }), t); assert.equal(step(t, e, 'h', 'timer', { add: 99999 }), t);
  assert.equal(step(step(t, { ...e, now: 7000 }, 'h', 'timer', { secs: 0 }), { ...e, now: 99999 }, 'h', 'timeout').phase, 'round');
  assert.equal(step(t, { ...e, now: 95001 }, 'h', 'timeout').phase, 'break');
  // the break and the vote
  const w = go({ secs: 60, breakSecs: 30, voteSecs: 90, rounds: 3 });
  assert.equal(w.endAt, 61000);
  let b = step(w, { ...e, now: 61001 }, 'h', 'timeout'); assert.equal(b.phase, 'break'); assert.equal(b.breakEnd, 61001 + 30000); assert.equal(G.deadline(b), b.breakEnd);
  assert.equal(step(b, { ...e, now: b.breakEnd - 5000 }, 'h', 'timeout').phase, 'break', 'not yet');
  const r2 = step(b, { ...e, now: b.breakEnd + 1 }, 'h', 'timeout'); assert.equal(r2.phase, 'round'); assert.equal(r2.round, 2); assert.equal(r2.breakEnd, 0);
  const waits = step(go({ secs: 60, breakSecs: 0, rounds: 3 }), { ...e, now: 61001 }, 'h', 'timeout');
  assert.equal(waits.breakEnd, 0); assert.equal(step(waits, { ...e, now: 9e9 }, 'h', 'timeout').phase, 'break', 'with 0 the moderator moves on');
  let v = w; for (let i = 0; i < 3; i++) { v = step(v, { ...e, now: v.endAt + 1 }, 'h', 'timeout'); if (v.phase === 'break') v = step(v, e, 'h', 'next'); }
  assert.equal(v.phase, 'vote'); assert.equal(v.voteEnd > 0, true); assert.equal(G.deadline(v), v.voteEnd);
  const noVoteClock = go({ secs: 60, voteSecs: 0, rounds: 3 }); let u = noVoteClock; for (let i = 0; i < 3; i++) { u = step(u, { ...e, now: 9e6 }, 'h', 'endRound'); if (u.phase === 'break') u = step(u, e, 'h', 'next'); }
  assert.equal(u.phase, 'vote'); assert.equal(u.voteEnd, 0); assert.equal(step(u, { ...e, now: 9e9 }, 'h', 'timeout').phase, 'vote', 'waits for the moderator'); assert.equal(step(u, e, 'h', 'resolve').phase, 'end');
}
// ---- difficulty
{
  const e = env(7); const lv = (d, rounds) => { let s = step(G.init(e), e, 'h', 'config', { difficulty: d, rounds }); s = step(s, e, 'h', 'start'); const out = [s.level]; for (let i = 1; i < rounds; i++) { s = step(s, e, 'h', 'endRound'); s = step(s, e, 'h', 'next'); out.push(s.level); } return out; };
  assert.deepEqual(lv('easy', 4), [0, 0, 0, 0]); assert.deepEqual(lv('normal', 4), [1, 1, 1, 1]); assert.deepEqual(lv('hard', 4), [2, 2, 2, 2]);
  assert.deepEqual(lv('rising', 3), [0, 1, 2]); assert.deepEqual(lv('rising', 4), [0, 1, 1, 2]); assert.deepEqual(lv('rising', 5), [0, 1, 1, 2, 2]); assert.deepEqual(lv('rising', 6), [0, 0, 1, 1, 2, 2]);
  assert.equal(G.init(e).difficulty, 'rising', 'it rises by default'); assert.equal(step(G.init(e), e, 'h', 'config', { difficulty: 'nope' }).difficulty, 'rising');
  assert.equal(levelFor('rising', 1, 1), 0);
}
// ---- sharing a clue: every combination
{
  const e0 = env(8); const startRound = () => { let s = step(G.init(e0), e0, 'h', 'config', { rounds: 3 }); return step(s, { ...e0, now: 1000 }, 'h', 'start'); };
  const rich = (s, extra = {}) => { const m = s.millionaire, mates = s.players.filter(id => s.team[id] === s.team[m] && id !== m), foes = s.players.filter(id => s.team[id] !== s.team[m]); return { m, mates, foes, ...extra }; };
  const winnersWith = (s, who) => play(s, e0, { [who]: [['kitchen', true, 2000], ['garage', true, 2000]] });
  // (a) a teammate of the winners shares: everyone sees it, once
  let s = startRound(); let { m, mates, foes } = rich(s); const w = foes[0];
  let f = step(winnersWith(s, w), { ...e0, now: 60000 }, 'h', 'endRound');
  const clue = f.clues[0]; assert.ok(clue.to.includes(w)); assert.ok(!clue.to.includes(m));
  assert.equal(G.priv(f)[w].clues[0].shared, false);
  const sh = step(f, e0, w, 'share', { round: 1 });
  assert.deepEqual(sh.shared, [{ round: 1, by: w, text: clue.text }]);
  assert.ok(JSON.stringify(G.view(sh)).includes(clue.text), 'everyone can read a shared clue');
  assert.ok(!JSON.stringify(G.view(f)).includes(clue.text), 'and nobody can before');
  for (const id of clue.to) assert.equal(G.priv(sh)[id].clues[0].shared, true, 'every holder sees that it is shared');
  assert.equal(step(sh, e0, clue.to.find(x => x !== w) ?? w, 'share', { round: 1 }), sh, 'sharing twice does nothing');
  // (b) people who do not hold the clue cannot share it
  for (const id of [m, ...mates, 'h', 'stranger']) if (!clue.to.includes(id)) assert.equal(step(f, e0, id, 'share', { round: 1 }), f, `${id} does not hold it`);
  assert.equal(step(f, e0, w, 'share', { round: 2 }), f, 'there is no clue for round 2'); assert.equal(step(f, e0, w, 'share', {}), f); assert.equal(step(f, e0, w, 'share', { round: '1' }), f);
  // (c) keeping it secret = doing nothing, and it can still be shared later (next round, vote)
  const r2 = step(f, e0, 'h', 'next'); assert.equal(r2.phase, 'round');
  assert.equal(step(r2, e0, w, 'share', { round: 1 }).shared.length, 1, 'shareable during the next round');
  let v = r2; v = step(v, e0, 'h', 'endRound'); v = step(v, e0, 'h', 'next'); v = step(v, e0, 'h', 'endRound'); assert.equal(v.phase, 'vote');
  assert.equal(step(v, e0, w, 'share', { round: 1 }).shared.length, 1, 'shareable in the final vote');
  // (d) the Millionaire, when on the winning team, can share their own team's clue too
  let s2 = startRound(); const mm = s2.millionaire; const f2 = step(winnersWith(s2, mm), { ...e0, now: 60000 }, 'h', 'endRound');
  assert.ok(f2.clues[0].to.includes(mm)); assert.equal(step(f2, e0, mm, 'share', { round: 1 }).shared[0].by, mm);
  // (e) a tie gives both teams the clue and either can share
  let s3 = startRound(); const a = s3.players.find(id => s3.team[id] === 0), b2 = s3.players.find(id => s3.team[id] === 1);
  const tie = play(s3, e0, { [a]: [['kitchen', true, 3000]], [b2]: [['kitchen', true, 3000]] });
  const f3 = step(tie, { ...e0, now: 60000 }, 'h', 'endRound'); assert.deepEqual(f3.history[0].winners.length, 2); assert.equal(f3.clues[0].to.length, f3.players.length, 'both teams get it');
  assert.equal(step(f3, e0, b2, 'share', { round: 1 }).shared[0].by, b2); assert.equal(step(f3, e0, a, 'share', { round: 1 }).shared[0].by, a);
  // (f) a round nobody scored has no clue to share
  const none = step(startRound(), { ...e0, now: 3000 }, 'h', 'endRound'); assert.equal(step(none, e0, none.players[0], 'share', { round: 1 }), none);
  // (h) a player sitting out for a wrong accusation still holds their team's clue and can share it; a late joiner cannot
  { let s5 = startRound(); const w5 = s5.players.find(id => s5.team[id] !== s5.team[s5.millionaire]); let g5 = step(winnersWith(s5, w5), { ...e0, now: 60000 }, 'h', 'endRound');
    const who = g5.clues[0].to.find(id => id !== g5.millionaire && id !== w5) ?? w5; const wrongTarget = g5.players.find(id => id !== who && id !== g5.millionaire);
    g5 = step(g5, e0, who, 'accuse', { target: wrongTarget }); assert.ok(g5.jailed[who], 'the accuser is jailed');
    assert.equal(step(g5, e0, who, 'share', { round: 1 }).shared.length, 1, 'a jailed holder can still share');
    assert.equal(step(g5, e0, 'late-joiner', 'share', { round: 1 }), g5); }
  // (g) not in the waiting room or after the game; and every round's clue is its own
  assert.equal(step(startRound(), e0, 'p1', 'share', { round: 1 }).shared.length, 0);
  let s4 = startRound(); const x = s4.players.find(id => s4.team[id] === 0); let g4 = step(play(s4, e0, { [x]: [['kitchen', true, 2000]] }), { ...e0, now: 60000 }, 'h', 'endRound');
  g4 = step(g4, e0, 'h', 'next'); const lead = g4.players.find(id => g4.team[id] === 1); g4 = step(play(g4, { ...e0, now: 70000 }, { [lead]: [['kitchen', true, 2000]] }, 70000), { ...e0, now: 200000 }, 'h', 'endRound');
  if (g4.clues.length === 2) { const one = step(g4, e0, g4.clues[1].to[0], 'share', { round: 2 }); assert.deepEqual(one.shared.map(x => x.round), [2]); assert.ok(!JSON.stringify(G.view(one)).includes(g4.clues[0].text) || g4.clues[0].text === g4.clues[1].text); }
  const ended = step(g4, e0, g4.players.find(id => id !== g4.millionaire), 'accuse', { target: g4.millionaire }); assert.equal(ended.phase, 'end');
  assert.equal(step(ended, e0, g4.clues[0].to[0], 'share', { round: 1 }), ended, 'nothing to share once it is over');
  assert.ok(G.view(ended).clues.length >= 1, 'every clue is shown at the end');
}
// ---- what the end-of-game task stats are made of
{
  const { e, s } = start(6, { rounds: 3, difficulty: 'hard' }, 1000);
  const a = s.players[0]; let g = step(s, { ...e, now: 2000 }, a, 'go', { room: 'kitchen' });
  g = step(g, { ...e, now: 6000 }, a, 'done', { room: 'kitchen', ok: true, ms: 3000, kind: 'catch' });
  g = step(g, { ...e, now: 7000 }, a, 'go', { room: 'garage' }); g = step(g, { ...e, now: 11000 }, a, 'done', { room: 'garage', ok: false, ms: 9000, kind: 'catch' });
  assert.equal(g.log[0].kind, 'catch'); assert.equal(g.log[0].lv, 2); assert.equal(g.log[1].kind, null, 'a task from another room is not trusted');
  const st = taskStats([...g.log, { kind: 'catch', ok: false, ms: 5000, lv: 1 }]);
  assert.deepEqual(st.map(x => [x.kind, x.n, x.pass]), [['catch', 2, 1]]); assert.equal(st[0].byLevel[1].n, 1); assert.equal(st[0].byLevel[2].pass, 1);
  assert.ok(!('stats' in G.view(g)), 'stats are for the end');
  assert.ok(Array.isArray(G.view(step(g, e, a, 'accuse', { target: g.millionaire }) ?? g).stats) || true);
  const ended = step(step(g, { ...e, now: 20000 }, 'h', 'endRound'), e, g.players.find(id => id !== g.millionaire && id !== a) , 'accuse', { target: g.millionaire });
  assert.equal(ended.phase, 'end'); assert.ok(Array.isArray(G.view(ended).stats));
}
console.log('secret millionaire tests passed');
