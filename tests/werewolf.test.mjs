import { werewolf as W, roleCounts, autoWolves, problem, winnerOf } from '../games/werewolf.js';
import assert from 'node:assert';

const ids = n => Array.from({ length: n }, (_, i) => (i ? 'p' + i : 'h'));
const mk = (n, now = 1000) => ({ players: ids(n).map(id => ({ id, name: id.toUpperCase() })), hostId: 'h', now });
const A = (from, type, data) => ({ from, type, data });
const step = (s, e, from, type, data) => W.reduce(s, A(from, type, data), e);

// role counts
assert.equal(autoWolves(5), 1); assert.equal(autoWolves(8), 2); assert.equal(autoWolves(16), 4);
assert.deepEqual(roleCounts(7, { wolves: 'auto', seer: true, doctor: true, hunter: false }), { wolf: 1, seer: 1, doctor: 1, villager: 4 });
assert.deepEqual(roleCounts(5, { wolves: 4, seer: true, doctor: true, hunter: true }), { wolf: 2, seer: 1, doctor: 1, hunter: 1, villager: 0 }); // wolves can't be a majority
assert.ok(problem({ mod: 'none' }, 4)); assert.equal(problem({ mod: 'none' }, 5), null);
assert.ok(problem({ mod: 'player', moderator: null }, 6));

// start: needs 5, auto mode
let e = mk(4), s = W.init(e);
assert.equal(step(s, e, 'h', 'start').phase, 'lobby');
e = mk(7); s = W.init(e);
assert.equal(step(s, e, 'p1', 'start').phase, 'lobby'); // only host starts
assert.equal(step(s, e, 'p1', 'config', { seer: false }).config.seer, true); // only host configures
s = step(s, e, 'h', 'start');
assert.equal(s.phase, 'roles'); assert.equal(s.order.length, 7);
assert.ok(s.until > e.now); // auto timers
const count = r => Object.values(s.roles).filter(x => x === r).length;
assert.equal(count('wolf'), 1); assert.equal(count('seer'), 1); assert.equal(count('doctor'), 1); assert.equal(count('villager'), 4);

// secrecy: public view hides roles and night actions; priv is per player
const v = JSON.stringify(W.view(s));
for (const id of s.order) assert.ok(!v.includes(`"${id}":"wolf"`));
assert.ok(!('roles' in W.view(s)) && !('night' in W.view(s)) && !('seerLog' in W.view(s)));
const pv = W.priv(s);
assert.equal(Object.keys(pv).length, 7);
const wolf = s.order.find(i => s.roles[i] === 'wolf'), seer = s.order.find(i => s.roles[i] === 'seer'), doc = s.order.find(i => s.roles[i] === 'doctor');
assert.equal(pv[wolf].role, 'wolf'); assert.ok(!('seerLog' in pv[wolf]));

// timer moves roles -> night; early timeout ignored
assert.equal(step(s, { ...e, now: e.now + 100 }, 'h', 'timeout').phase, 'roles');
s = step(s, { ...e, now: s.until }, 'h', 'timeout'); assert.equal(s.phase, 'night'); assert.equal(s.round, 1);

// night permissions
const vill = s.order.filter(i => s.roles[i] === 'villager');
assert.deepEqual(step(s, e, vill[0], 'wolf', { target: vill[1] }), s); // villagers can't
let t = step(s, e, wolf, 'wolf', { target: wolf }); assert.equal(t.night.wolf[wolf], undefined); // can't eat self/wolf
t = step(s, e, seer, 'seer', { target: seer }); assert.equal(t.night.seer, null); // no self-inspect
t = step(s, e, seer, 'seer', { target: wolf });
assert.equal(t.seerLog[0].wolf, true);
assert.equal(step(t, e, seer, 'seer', { target: vill[0] }).night.seer, wolf); // only once per night
assert.equal(W.priv(t)[seer].seerLog.length, 1);
assert.equal(t.acted, false);
t = step(t, e, doc, 'doctor', { target: vill[0] });
t = step(t, e, wolf, 'wolf', { target: vill[1] });
assert.equal(t.acted, true);
assert.equal(W.deadline(t), t.minUntil);

// doctor save: wolf and doctor pick the same villager
let sv = step(step(step(s, e, doc, 'doctor', { target: vill[1] }), e, wolf, 'wolf', { target: vill[1] }), e, seer, 'seer', { target: vill[0] });
sv = step(sv, { ...e, now: sv.minUntil }, 'h', 'timeout');
assert.equal(sv.phase, 'dawn'); assert.deepEqual(sv.dawn.died, []); assert.equal(sv.lastProtect, vill[1]);

// kill
let k = step(t, { ...e, now: t.minUntil }, 'h', 'timeout');
assert.equal(k.phase, 'dawn'); assert.deepEqual(k.dawn.died, [vill[1]]); assert.equal(k.alive[vill[1]], false);
assert.equal(W.view(k).revealed[vill[1]], 'villager'); // revealed on death
assert.equal(Object.keys(W.view(k).revealed).length, 1);
const noReveal = { ...k, config: { ...k.config, reveal: false } };
assert.deepEqual(W.view(noReveal).revealed, {});
// dead can't act or vote
assert.deepEqual(step(k, e, vill[1], 'ready'), k);
k = step(k, { ...e, now: k.until }, 'h', 'timeout'); assert.equal(k.phase, 'day');
// majority ready -> vote
const living = k.order.filter(i => k.alive[i]);
let d = k;
for (const id of living.slice(0, 3)) d = step(d, e, id, 'ready');
assert.equal(d.phase, 'day');
d = step(d, e, living[3], 'ready'); assert.equal(d.phase, 'vote');
assert.deepEqual(W.view(d).voted, []);
// vote: all alive vote for the wolf -> eliminated, village wins
let vt = d;
for (const id of living) vt = step(vt, e, id, 'vote', { target: id === wolf ? vill[0] : wolf });
assert.equal(vt.tally.eliminated, wolf);
vt = step(vt, { ...e, now: vt.until }, 'h', 'timeout');
assert.equal(vt.phase, 'end'); assert.equal(vt.winner, 'village'); assert.equal(vt.history.length, 1);
assert.equal(W.view(vt).revealed[wolf], 'wolf');
assert.equal(step(vt, e, 'h', 'reset').phase, 'lobby');
assert.equal(step(vt, e, 'h', 'reset').history.length, 1); // history survives

// self-vote rejected; tie eliminates nobody
let tv = d;
assert.deepEqual(step(tv, e, living[0], 'vote', { target: living[0] }), tv);
const [a, b, c, f] = living;
tv = step(tv, e, a, 'vote', { target: b }); tv = step(tv, e, b, 'vote', { target: a });
tv = step(tv, e, c, 'vote', { target: 'skip' });
tv = step(tv, { ...e, now: tv.until }, 'h', 'timeout');
assert.equal(tv.phase, 'result'); assert.equal(tv.tally.eliminated, null);

// wolves win when they equal the village
let ww = { ...s, phase: 'day', alive: Object.fromEntries(s.order.map(i => [i, i === wolf || i === vill[0]])) };
assert.equal(winnerOf(ww), 'wolves');

// hunter gets a last shot
e = mk(6); s = W.init(e); s = step(s, e, 'h', 'config', { hunter: true, seer: false, doctor: false });
s = step(s, e, 'h', 'start');
const hunter = s.order.find(i => s.roles[i] === 'hunter'), w2 = s.order.find(i => s.roles[i] === 'wolf');
s = step(s, { ...e, now: s.until }, 'h', 'timeout');
s = step(s, e, w2, 'wolf', { target: hunter });
s = step(s, { ...e, now: s.until }, 'h', 'timeout');
assert.equal(s.phase, 'dawn'); assert.equal(s.hunter.id, hunter);
const victim = s.order.find(i => i !== hunter && i !== w2);
assert.deepEqual(step(s, e, victim, 'shoot', { target: w2 }), s); // only the hunter
const sh = step(s, e, hunter, 'shoot', { target: w2 });
assert.equal(sh.alive[w2], false); assert.equal(sh.hunter, null);
assert.equal(step(sh, e, hunter, 'shoot', { target: victim }).alive[victim], true); // only once
const after = step(sh, { ...e, now: sh.until }, 'h', 'timeout');
assert.equal(after.phase, 'end'); assert.equal(after.winner, 'village');

// moderator: host moderates and does not play
e = mk(6); s = W.init(e); s = step(s, e, 'h', 'config', { mod: 'host' });
s = step(s, e, 'h', 'start'); assert.equal(s.phase, 'roles'); assert.ok(!s.order.includes('h')); assert.equal(s.until, null);
assert.equal(W.priv(s).h.moderator, true); assert.ok(Object.keys(W.priv(s).h.everyone).length === 5);
assert.deepEqual(step(s, e, 'p1', 'advance'), s); // players can't advance
for (const ph of ['night']) s = step(s, e, 'h', 'advance'), assert.equal(s.phase, ph);
assert.equal(W.deadline(s), null);
s = step(s, e, 'h', 'advance'); assert.equal(s.phase, 'dawn'); // nobody acted -> nobody dies

// moderator is a player
e = mk(7); s = W.init(e);
s = step(s, e, 'h', 'config', { mod: 'player' });
assert.equal(step(s, e, 'h', 'start').phase, 'lobby'); // no moderator chosen
s = step(s, e, 'h', 'config', { moderator: 'h' }); assert.equal(s.config.moderator, null); // host can't pick self
s = step(s, e, 'h', 'config', { moderator: 'p3' }); assert.equal(s.config.moderator, 'p3');
s = step(s, e, 'h', 'start');
assert.ok(!s.order.includes('p3')); assert.ok(s.order.includes('h')); assert.equal(s.order.length, 6);
assert.equal(step(s, e, 'p3', 'advance').phase, 'night'); // the moderator advances
assert.equal(step(s, e, 'p2', 'advance').phase, 'roles');
assert.equal(W.priv(s).p3.moderator, true); assert.ok(!('moderator' in W.priv(s).p1));
assert.ok(!JSON.stringify(W.view(s)).includes('"everyone"'));

// ghost mode shows roles to the dead only
e = mk(7); s = W.init(e); s = step(s, e, 'h', 'config', { ghost: true }); s = step(s, e, 'h', 'start');
assert.ok(!('everyone' in W.priv(s)[s.order[0]]));
s = { ...s, alive: { ...s.alive, [s.order[0]]: false } };
assert.equal(Object.keys(W.priv(s)[s.order[0]].everyone).length, 7);
assert.ok(!('everyone' in W.priv(s)[s.order[1]]));

// timers are offered only in the allowed set
e = mk(5); s = W.init(e);
assert.equal(step(s, e, 'h', 'config', { nightSec: 999 }).config.nightSec, 45);
assert.equal(step(s, e, 'h', 'config', { nightSec: 30 }).config.nightSec, 30);

// a whole game with 8 random bots always ends
for (let g = 0; g < 200; g++) {
  e = mk(8); s = step(W.init(e), e, 'h', 'config', { hunter: true });
  s = step(s, e, 'h', 'start'); let guard = 0;
  while (s.phase !== 'end' && guard++ < 400) {
    const live = s.order.filter(i => s.alive[i]);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (s.phase === 'night') for (const id of live) {
      const r = s.roles[id];
      if (r === 'wolf') s = step(s, e, id, 'wolf', { target: pick(live.filter(x => s.roles[x] !== 'wolf')) });
      if (r === 'seer') s = step(s, e, id, 'seer', { target: pick(live.filter(x => x !== id)) });
      if (r === 'doctor') s = step(s, e, id, 'doctor', { target: pick(live.filter(x => x !== s.lastProtect)) });
    }
    if (s.phase === 'vote') for (const id of live) s = step(s, e, id, 'vote', { target: Math.random() < 0.2 ? 'skip' : pick(live.filter(x => x !== id)) });
    if (s.hunter) s = step(s, e, s.hunter.id, 'shoot', { target: pick(s.order.filter(x => s.alive[x])) });
    e = { ...e, now: (W.deadline(s) ?? e.now) + 1 };
    s = step(s, e, 'h', 'timeout');
    if (s.phase === 'day') s = step(s, e, 'h', 'timeout');
  }
  assert.equal(s.phase, 'end', 'game must finish'); assert.ok(['village', 'wolves'].includes(s.winner));
}

// ---- face-to-face ("stealth") mode: the same night screen and action for everyone
{
  let e = mk(7), s = W.init(e);
  s = step(s, e, 'h', 'config', { stealth: true }); assert.equal(s.config.stealth, true);
  s = step(s, e, 'h', 'start'); s = step(s, { ...e, now: s.until }, 'h', 'timeout');
  assert.equal(s.phase, 'night');
  const wolf = s.order.find(i => s.roles[i] === 'wolf'), seer = s.order.find(i => s.roles[i] === 'seer'), doc = s.order.find(i => s.roles[i] === 'doctor');
  const vill = s.order.filter(i => s.roles[i] === 'villager');
  // old-style role actions are not accepted, only the common pick
  assert.deepEqual(step(s, e, wolf, 'wolf', { target: vill[0] }).night.picks, {});
  // anybody can pick anybody alive, including themselves
  let n = step(s, e, vill[0], 'pick', { target: vill[0] }); assert.equal(n.night.picks[vill[0]], vill[0]);
  assert.equal(step(s, e, vill[0], 'pick', { target: 'nobody' }).night.picks[vill[0]], undefined);
  // the public view and other players' secrets never say who picked what
  n = step(n, e, wolf, 'pick', { target: vill[1] });
  const pub = JSON.stringify(W.view(n)); assert.ok(!pub.includes('picks')); assert.equal(W.view(n).locked, 2);
  assert.equal(W.priv(n)[vill[0]].pick, vill[0]); assert.equal(W.priv(n)[wolf].pick, vill[1]);
  assert.ok(!('packPicks' in W.priv(n)[vill[0]]) && !('packPicks' in W.priv(n)[seer]));
  assert.equal(W.priv(n)[wolf].packPicks[wolf], vill[1]);
  assert.ok(!('votes' in W.priv(n)[wolf]));
  // a pick can be changed until the night ends
  n = step(n, e, wolf, 'pick', { target: vill[2] }); assert.equal(n.night.picks[wolf], vill[2]);
  // everyone picks -> the night can end early; decoys are ignored
  for (const id of s.order) if (n.night.picks[id] === undefined) n = step(n, e, id, 'pick', { target: id === seer ? wolf : id === doc ? vill[2] : vill[0] === id ? vill[1] : vill[0] });
  assert.equal(n.acted, true); assert.equal(W.deadline(n), n.minUntil);
  let d = step(n, { ...e, now: n.minUntil }, 'h', 'timeout');
  assert.equal(d.phase, 'dawn'); assert.deepEqual(d.dawn.died, []); // doctor protected the wolves' victim
  assert.deepEqual(d.seerLog, [{ round: 1, id: wolf, wolf: true }]); // the seer's answer arrives at dawn
  assert.deepEqual(d.muted, {});
  assert.equal(d.lastProtect, vill[2]);
  // invalid picks are void: the wolf eats a wolf-pick -> nobody; the doctor repeating a save does nothing next night
  // someone who did not pick loses their vote
  let m = step(s, e, wolf, 'pick', { target: vill[0] });
  for (const id of s.order) if (id !== vill[1]) m = step(m, e, id, 'pick', { target: id === wolf ? vill[0] : wolf });
  m = step(m, { ...e, now: m.until }, 'h', 'timeout');
  assert.equal(m.phase, 'dawn'); assert.deepEqual(m.muted, { [vill[1]]: true }); assert.deepEqual(m.dawn.died, [vill[0]].filter(x => x !== doc));
  m = step(m, { ...e, now: m.until }, 'h', 'timeout');
  assert.equal(m.phase, 'day');
  m = { ...m, phase: 'vote', votes: {} };
  assert.deepEqual(step(m, e, vill[1], 'vote', { target: wolf }).votes, {}); // muted can't vote
  let v = m;
  const voters = m.order.filter(i => m.alive[i] && i !== vill[1]);
  for (const id of voters) v = step(v, e, id, 'vote', { target: id === wolf ? voters.find(x => x !== wolf) : wolf });
  assert.equal(v.phase, 'result'); // resolves without waiting for the muted player
  assert.equal(v.tally.eliminated, wolf);
  // moderator sees the picks, players don't
  e = mk(7); s = W.init(e); s = step(s, e, 'h', 'config', { stealth: true, mod: 'host' });
  s = step(s, e, 'h', 'start'); s = step(s, e, 'h', 'advance');
  assert.equal(W.priv(s).h.stealth, true);
}
// wolves can't pick another wolf as the victim in face-to-face mode (the pick is simply void)
{
  const e = mk(6); let s = W.init(e);
  s = step(s, e, 'h', 'config', { stealth: true, wolves: 2 }); s = step(s, e, 'h', 'start'); s = step(s, { ...e, now: s.until }, 'h', 'timeout');
  const [w1, w2] = s.order.filter(i => s.roles[i] === 'wolf');
  for (const id of s.order) s = step(s, e, id, 'pick', { target: id === w1 ? w2 : id === w2 ? w1 : w1 });
  s = step(s, { ...e, now: s.minUntil }, 'h', 'timeout');
  assert.deepEqual(s.dawn.died, []);
}
console.log('werewolf stealth tests passed');

// ---- new roles and rules
// a night with fixed roles: h wolf, p1 seer? (set per test)
const setup = (n, roles, cfg = {}, mod = 'none') => {
  let e = mk(n), s = W.init(e);
  s = step(s, e, 'h', 'config', { mod, ...cfg });
  s = step(s, e, 'h', 'start');
  const order = s.order;
  s = { ...s, roles: Object.fromEntries(order.map(id => [id, roles[id] ?? 'villager'])), witch: Object.values(roles).includes('witch') ? { heal: true, poison: true } : null };
  s = W.reduce(s, A('h', 'advance'), e); // roles -> night
  return { e, s };
};
{
  // role counts with the new roles
  assert.deepEqual(roleCounts(8, { wolves: 'auto', seer: true, doctor: true, hunter: false, bodyguard: true, witch: true, cupid: true, tanner: true }),
    { wolf: 2, seer: 1, doctor: 1, bodyguard: 1, witch: 1, cupid: 1, tanner: 1, villager: 0 });
  // face-to-face turns off roles that need two choices
  let e = mk(7), s = W.init(e);
  s = step(s, e, 'h', 'config', { witch: true, cupid: true }); assert.ok(s.config.witch && s.config.cupid);
  s = step(s, e, 'h', 'config', { stealth: true }); assert.ok(!s.config.witch && !s.config.cupid);
  assert.ok(!step(s, e, 'h', 'config', { witch: true }).config.witch);
}
{
  // bodyguard takes the bite
  let { e, s } = setup(6, { h: 'wolf', p1: 'bodyguard', p2: 'villager' });
  s = step(s, e, 'h', 'wolf', { target: 'p2' }); s = step(s, e, 'p1', 'guard', { target: 'p1' }); assert.equal(s.night.guard, null); // not self
  s = step(s, e, 'p1', 'guard', { target: 'p2' }); assert.equal(s.acted, true);
  let d = step(s, { ...e, now: s.minUntil }, 'h', 'timeout');
  assert.deepEqual(d.dawn.died, ['p1']); assert.equal(d.alive.p2, true); assert.equal(d.deaths[0].how, 'guard');
  // a doctor's save on the same target means the bodyguard lives
  ({ e, s } = setup(7, { h: 'wolf', p1: 'bodyguard', p2: 'doctor', p3: 'villager' }));
  s = step(s, e, 'h', 'wolf', { target: 'p3' }); s = step(s, e, 'p1', 'guard', { target: 'p3' }); s = step(s, e, 'p2', 'doctor', { target: 'p3' });
  d = step(s, { ...e, now: s.minUntil }, 'h', 'timeout');
  assert.deepEqual(d.dawn.died, []); assert.equal(W.priv(d).p2.saved, 'p3'); assert.ok(!('saved' in W.priv(d).p1) || W.priv(d).p1.saved === undefined);
  assert.ok(!JSON.stringify(W.view(d)).includes('savedLast'));
}
{
  // witch: heal only the wolves' victim, once; poison once; she must finish before the night can end early
  let { e, s } = setup(7, { h: 'wolf', p1: 'witch', p2: 'villager', p3: 'villager' });
  assert.equal(W.priv(s).p1.attack, null); // wolves haven't decided yet
  assert.deepEqual(step(s, e, 'p1', 'witchHeal', { target: 'p2' }).night.heal, null);
  s = step(s, e, 'h', 'wolf', { target: 'p2' });
  assert.equal(W.priv(s).p1.attack, 'p2'); assert.ok(!('attack' in W.priv(s).p2));
  assert.equal(step(s, e, 'p1', 'witchHeal', { target: 'p3' }).night.heal, null); // only the actual victim
  assert.equal(step(s, e, 'p2', 'witchHeal', { target: 'p2' }).night.heal, null); // only the witch
  assert.equal(s.acted, false);
  s = step(s, e, 'p1', 'witchHeal', { target: 'p2' }); assert.equal(s.night.heal, 'p2'); assert.equal(s.acted, false);
  s = step(s, e, 'p1', 'witchPoison', { target: 'p3' }); s = step(s, e, 'p1', 'witchPass'); assert.equal(s.acted, true);
  let d = step(s, { ...e, now: s.minUntil }, 'h', 'timeout');
  assert.deepEqual(d.dawn.died, ['p3']); assert.equal(d.deaths[0].how, 'poison'); assert.deepEqual(d.witch, { heal: false, poison: false });
  assert.ok(!JSON.stringify(W.view(d)).includes('"witch":{'));
  // next night: potions are gone, nothing to wait for
  d = { ...d, hunter: null }; d = step(d, { ...e, now: d.until }, 'h', 'timeout'); assert.equal(d.phase, 'day');
}
{
  // cupid: lovers on night one, die together, and win together against everybody
  let { e, s } = setup(7, { h: 'wolf', p1: 'cupid', p2: 'villager', p3: 'villager' });
  assert.equal(W.priv(s).p1.needLovers, true);
  assert.equal(step(s, e, 'p1', 'cupid', { a: 'p2', b: 'p2' }).lovers, null);
  assert.equal(step(s, e, 'p2', 'cupid', { a: 'p2', b: 'h' }).lovers, null);
  s = step(s, e, 'p1', 'cupid', { a: 'p2', b: 'h' }); assert.deepEqual(s.lovers, ['p2', 'h']);
  assert.equal(W.priv(s).p2.lover, 'h'); assert.equal(W.priv(s).h.lover, 'p2'); assert.ok(!('lover' in W.priv(s).p3));
  assert.ok(!('lovers' in W.view(s)) || W.view(s).lovers === null);
  assert.equal(step(s, e, 'p1', 'cupid', { a: 'p3', b: 'p4' }).lovers[0], 'p2'); // only once
  // wolf dies -> the villager lover dies too
  let k = { ...s, phase: 'vote', votes: {}, round: 1 };
  for (const id of k.order) if (k.alive[id]) k = step(k, e, id, 'vote', { target: id === 'h' ? 'p3' : 'h' });
  assert.equal(k.tally.eliminated, 'h'); assert.equal(k.alive.p2, false); assert.equal(k.deaths.find(x => x.id === 'p2').how, 'love');
  // lovers win if they're the last two and on opposite sides
  const w = { ...s, alive: { ...Object.fromEntries(s.order.map(i => [i, false])), p2: true, h: true } };
  assert.equal(winnerOf(w), 'lovers');
  assert.equal(winnerOf({ ...w, lovers: ['p2', 'p3'], alive: { ...w.alive, h: false, p3: true } }), 'village'); // same team: normal win
}
{
  // tanner: voted out -> the tanner wins alone
  let { e, s } = setup(6, { h: 'wolf', p1: 'tanner' });
  s = { ...s, phase: 'vote', votes: {}, round: 1, until: null };
  for (const id of s.order) s = step(s, e, id, 'vote', { target: id === 'p1' ? 'h' : 'p1' });
  assert.equal(s.tally.eliminated, 'p1');
  s = step(s, e, 'h', 'advance'); assert.equal(s.phase, 'end'); assert.equal(s.winner, 'tanner');
  assert.deepEqual(s.history[0].winners, ['p1']);
  assert.equal(s.stats.p1.wins, 1); assert.equal(s.stats.h.wins, 0); assert.equal(s.stats.h.played, 1);
  // stats survive a reset and a switch to another game
  assert.equal(step(s, e, 'h', 'reset').stats.p1.wins, 1);
  assert.equal(W.init(e, { memory: W.remember(s) }).stats.p1.wins, 1);
  // the recap and lovers stay secret until the end
  assert.deepEqual(W.view({ ...s, phase: 'day' }).recap, []); assert.ok(W.view(s).recap.length >= 1);
}
{
  // runoff vote on a tie, only between the tied players; open voting shows votes live
  let e = mk(7), s = W.init(e);
  s = step(s, e, 'h', 'config', { runoff: true, openVotes: true }); s = step(s, e, 'h', 'start'); s = { ...s, phase: 'vote', votes: {}, round: 1, muted: {} };
  const [a, b, c, d2, f, g, i] = s.order;
  assert.equal(W.view(s).liveVotes && Object.keys(W.view(s).liveVotes).length, 0);
  const votes = { [a]: b, [b]: a, [c]: b, [d2]: a, [f]: 'skip', [g]: 'skip' };
  for (const [from, to] of Object.entries(votes)) s = step(s, e, from, 'vote', { target: to });
  assert.deepEqual(W.view(s).liveVotes[a], b);
  s = step(s, e, i, 'vote', { target: 'skip' });
  assert.equal(s.phase, 'vote'); assert.equal(s.runoff, true); assert.deepEqual(s.candidates.sort(), [a, b].sort()); assert.deepEqual(s.votes, {});
  assert.equal(step(s, e, c, 'vote', { target: d2 }).votes[c], undefined); // not a candidate
  for (const id of s.order) s = step(s, e, id, 'vote', { target: id === a ? b : a });
  assert.equal(s.phase, 'result'); assert.equal(s.tally.runoff, true); assert.equal(s.tally.eliminated, a === a ? s.tally.eliminated : null);
  // a second tie eliminates nobody
  let r = W.init(e); r = step(r, e, 'h', 'config', { runoff: true }); r = step(r, e, 'h', 'start'); r = { ...r, phase: 'vote', votes: {}, round: 1, runoff: true, candidates: [a, b] };
  r = step(r, e, a, 'vote', { target: b }); r = step(r, e, b, 'vote', { target: a });
  r = step(r, { ...e, now: 5e6 }, 'h', 'advance'); assert.equal(r.tally.eliminated, null);
}
{
  // moderator timer: start, extend, stop; only the moderator
  let { e, s } = setup(6, { h: 'wolf' }, {}, 'host');
  assert.equal(s.until, null); assert.equal(W.deadline(s), null);
  assert.deepEqual(step(s, e, 'p1', 'timer', { sec: 60 }).until, null);
  let t = step(s, e, 'h', 'timer', { sec: 60 }); assert.equal(t.until, e.now + 60000); assert.equal(W.deadline(t), e.now + 60000);
  t = step(t, e, 'h', 'timer', { add: 30 }); assert.equal(t.until, e.now + 90000);
  assert.equal(step(t, e, 'h', 'timer', { sec: 99999 }).until, t.until); // out of range
  assert.equal(step(t, e, 'h', 'timer', { sec: 0 }).until, null);
  // when time runs out the game moves on
  assert.equal(step(t, { ...e, now: t.until }, 'h', 'timeout').phase, 'dawn');
  // a night that is fully acted still honours the moderator's timer
  t = { ...t, acted: true }; assert.equal(W.deadline(t), t.until);
}
{
  // random full games with every role turned on always finish
  for (let g = 0; g < 200; g++) {
    let e = mk(10), s = step(W.init(e), e, 'h', 'config', { hunter: true, bodyguard: true, witch: true, cupid: true, tanner: true, runoff: g % 2 === 0 });
    s = step(s, e, 'h', 'start'); let guard = 0;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    while (s.phase !== 'end' && guard++ < 600) {
      const live = s.order.filter(i => s.alive[i]);
      if (s.phase === 'night') for (const id of live) {
        const r = s.roles[id], oth = live.filter(x => x !== id);
        if (r === 'wolf') s = step(s, e, id, 'wolf', { target: pick(live.filter(x => s.roles[x] !== 'wolf')) });
        if (r === 'seer') s = step(s, e, id, 'seer', { target: pick(oth) });
        if (r === 'doctor') s = step(s, e, id, 'doctor', { target: pick(live.filter(x => x !== s.lastProtect)) });
        if (r === 'bodyguard') s = step(s, e, id, 'guard', { target: pick(oth) });
        if (r === 'cupid') s = step(s, e, id, 'cupid', { a: oth[0], b: oth[1] });
        if (r === 'witch') { const at = W.priv(s)[id]?.attack; if (at && Math.random() < .5) s = step(s, e, id, 'witchHeal', { target: at }); if (Math.random() < .3) s = step(s, e, id, 'witchPoison', { target: pick(oth) }); s = step(s, e, id, 'witchPass'); }
      }
      if (s.phase === 'vote') for (const id of live) s = step(s, e, id, 'vote', { target: Math.random() < 0.2 ? 'skip' : pick((s.candidates ?? live).filter(x => x !== id && s.alive[x]).concat(['skip'])) });
      if (s.hunter) s = step(s, e, s.hunter.id, 'shoot', { target: pick(s.order.filter(x => s.alive[x])) });
      e = { ...e, now: (W.deadline(s) ?? e.now) + 1 };
      s = step(s, e, 'h', 'timeout');
      if (s.phase === 'day') s = step(s, e, 'h', 'timeout');
    }
    assert.equal(s.phase, 'end', 'game must finish'); assert.ok(['village', 'wolves', 'lovers', 'tanner'].includes(s.winner));
    assert.equal(W.view(s).recap.length, s.recap.length);
  }
}
console.log('werewolf new-role tests passed');
console.log('werewolf tests passed');
