import { secret as G, makeTeams, MIN_PLAYERS } from '../games/secret.js';
import { makeClue, taskPoints } from '../games/secret-clues.js';
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
console.log('secret millionaire tests passed');
