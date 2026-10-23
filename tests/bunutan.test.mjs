import { bunutan as B, makeDraw, MIN_DRAWERS } from '../games/bunutan.js';
import assert from 'node:assert';

const ids = n => Array.from({ length: n }, (_, i) => (i ? 'p' + i : 'h'));
const env = (n, now = 1) => ({ players: ids(n).map(id => ({ id, name: id.toUpperCase() })), hostId: 'h', now });
const A = (from, type, data) => ({ from, type, data });
const step = (s, e, from, type, data) => B.reduce(s, A(from, type, data), e);

// ---- the draw itself
for (let n = 3; n <= 14; n++) for (let r = 0; r < 60; r++) {
  const who = ids(n); const d = makeDraw(who, { noSwap: true });
  assert.ok(d, `n=${n}`);
  assert.deepEqual(Object.keys(d).sort(), [...who].sort());                                    // everyone gives
  assert.deepEqual(Object.values(d).sort(), [...who].sort());                                  // everyone receives exactly once
  for (const g of who) { assert.notEqual(d[g], g); assert.notEqual(d[d[g]], g, 'no swaps'); } // nobody draws themselves or swaps
}
{
  // two people can only swap, which is fine when swaps are the only way
  const d = makeDraw(['a', 'b']); assert.deepEqual(d, { a: 'b', b: 'a' });
  assert.equal(makeDraw(['a']), null);
  // keep-apart pairs are respected in both directions
  for (let r = 0; r < 200; r++) {
    const who = ids(6); const d = makeDraw(who, { avoid: [['h', 'p1'], ['p2', 'p3']], noSwap: false });
    assert.ok(d); assert.notEqual(d.h, 'p1'); assert.notEqual(d.p1, 'h'); assert.notEqual(d.p2, 'p3'); assert.notEqual(d.p3, 'p2');
  }
  // rules that cannot be met are reported, not looped forever
  assert.equal(makeDraw(['a', 'b', 'c'], { avoid: [['a', 'b']] }), null);
  assert.equal(makeDraw(['a', 'b', 'c'], { avoid: [['a', 'b'], ['b', 'c']] }), null);
  // swaps allowed again makes more draws possible
  assert.ok(makeDraw(['a', 'b', 'c', 'd'], { noSwap: false, avoid: [['a', 'b'], ['c', 'd']] }));
}

// ---- the game
let e = env(5), s = B.init(e);
assert.equal(s.phase, 'lobby'); assert.equal(s.hostIn, true); assert.equal(B.inProgress(s), false);
assert.equal(step(s, e, 'p1', 'config', { title: 'Hacked' }).title, 'Bunutan');                    // only the host sets things up
s = step(s, e, 'h', 'config', { title: '  Family   Christmas 2026  ', budget: '₱300', date: 'Dec 24', note: 'Wrap it nicely!' });
assert.equal(s.title, 'Family Christmas 2026'); assert.equal(s.budget, '₱300');
assert.equal(step(s, e, 'h', 'config', { title: 'x'.repeat(100) }).title.length, 40);
assert.equal(step(s, e, 'h', 'config', { title: '   ' }).title, 'Bunutan');
assert.deepEqual(Object.keys(s.names).sort(), ids(5).sort()); // the lobby tracks who joined, with their names
// keep-apart pairs
let c = step(s, e, 'h', 'config', { addAvoid: ['p1', 'p2'] }); assert.deepEqual(c.avoid, [['p1', 'p2']]);
assert.deepEqual(step(c, e, 'h', 'config', { addAvoid: ['p2', 'p1'] }).avoid, [['p1', 'p2']]);       // no duplicates
assert.deepEqual(step(c, e, 'h', 'config', { addAvoid: ['p1', 'p1'] }).avoid, [['p1', 'p2']]);
assert.deepEqual(step(c, e, 'h', 'config', { addAvoid: ['p1', 'ghost'] }).avoid, [['p1', 'p2']]);
assert.deepEqual(step(c, e, 'h', 'config', { removeAvoid: 0 }).avoid, []);

// not enough people
assert.match(step(B.init(env(2)), env(2), 'h', 'draw').error, /at least 3/);
assert.equal(step(B.init(env(2)), env(2), 'h', 'draw').phase, 'lobby');
// only the host can start it
assert.equal(step(s, e, 'p1', 'draw').phase, 'lobby');
// the host leaves themselves out: 4 players -> 3 in the draw, the host gets nothing
let out = step(step(B.init(env(4)), env(4), 'h', 'config', { hostIn: false }), env(4), 'h', 'draw');
assert.equal(out.phase, 'drawn'); assert.deepEqual(out.drawers.sort(), ['p1', 'p2', 'p3']); assert.ok(!('h' in B.priv(out)));
assert.equal(step(B.init(env(3)), env(3), 'h', 'config', { hostIn: false }).hostIn, false);
assert.match(step(step(B.init(env(3)), env(3), 'h', 'config', { hostIn: false }), env(3), 'h', 'draw').error, /at least 3/);

// the draw: nobody sees anyone else's result
let d = step(c, e, 'h', 'draw');
assert.equal(d.phase, 'drawn'); assert.equal(B.inProgress(d), true); assert.equal(d.round, 1);
const pub = B.view(d); assert.ok(!('assign' in pub)); assert.ok(!JSON.stringify(pub).includes('"to"'));
const priv = B.priv(d);
assert.deepEqual(Object.keys(priv).sort(), ids(5).sort());
assert.deepEqual(Object.values(priv).map(x => x.to).sort(), ids(5).sort());                       // everyone is drawn by exactly one person
for (const [id, p] of Object.entries(priv)) { assert.notEqual(p.to, id); assert.equal(p.toName, p.to.toUpperCase()); }
assert.ok(!(priv.p1.to === 'p2' || priv.p2.to === 'p1'));                                           // the partners are kept apart
// reveal progress is public, only for people in the draw, once
assert.deepEqual(d.revealed, {});
let r = step(d, e, 'p1', 'reveal'); assert.deepEqual(r.revealed, { p1: true });
assert.deepEqual(step(r, e, 'p1', 'reveal').revealed, { p1: true });
assert.deepEqual(step(d, e, 'stranger', 'reveal').revealed, {});
// names are frozen at the draw, and later config does nothing
const late = { ...e, players: [...e.players, { id: 'late', name: 'Late' }] };
assert.ok(!('late' in step(d, late, 'h', 'config', { title: 'x' }).names));
assert.equal(step(d, e, 'h', 'config', { title: 'Changed' }).title, d.title);
assert.equal(step(d, e, 'h', 'draw').round, 1);                                                      // can't draw twice
// start over (host only): same event, no draw
assert.equal(step(d, e, 'p1', 'reset').phase, 'drawn');
const again = step(d, e, 'h', 'reset'); assert.equal(again.phase, 'lobby'); assert.equal(again.title, d.title); assert.deepEqual(again.avoid, d.avoid); assert.equal(again.round, 1);
assert.deepEqual(B.priv(again), {});
assert.equal(step(again, e, 'h', 'draw').round, 2);
// leaving to another game and coming back keeps the draw
const kept = B.remember(r);
const back = B.init(e, { memory: kept });
assert.equal(back.phase, 'drawn'); assert.deepEqual(back.revealed, { p1: true }); assert.deepEqual(B.priv(back), B.priv(r));
assert.equal(B.init(e, { memory: undefined }).phase, 'lobby');
// the same person drawing twice never gets two results, and every draw is valid over many runs
for (let k = 0; k < 100; k++) {
  const x = step(step(B.init(env(7)), env(7), 'h', 'config', {}), env(7), 'h', 'draw'); const p = B.priv(x);
  assert.deepEqual(Object.values(p).map(q => q.to).sort(), ids(7).sort());
  for (const [id, q] of Object.entries(p)) { assert.notEqual(q.to, id); assert.notEqual(p[q.to].to, id); }
}
console.log('bunutan tests passed');
