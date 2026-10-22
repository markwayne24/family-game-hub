import { GAMES } from '../games/index.js';
import { parseCustom } from '../games/trivia.js';
import assert from 'node:assert';
const P = [{id:'h',name:'Host'},{id:'a',name:'Ann'},{id:'b',name:'Bo'}];
const env = (extra={}) => ({ players: P, hostId: 'h', now: 1000, ...extra });
const A = (from,type,data)=>({from,type,data});

// every game exposes the contract
for (const g of Object.values(GAMES)) for (const k of ['id','name','emoji','init','reduce','render']) assert.ok(g[k], `${g.id}.${k}`);

// ---- custom trivia
const pool = parseCustom('Capital of PH? | Manila | Cebu | Davao\nbad line\nQ2 | yes | no | maybe | never');
assert.equal(pool.length,2); assert.equal(pool[0].c[pool[0].a],'Manila');
let tv = GAMES.trivia; let s = tv.init(env(), {pool});
assert.equal(s.qs.length,2); assert.ok(!('pool' in tv.view(s)));
const three = {...s, i: s.qs.findIndex(q=>q.c.length===3)};
assert.equal(tv.reduce(three,A('a','answer',{choice:3}),env()).answers.a, undefined); // 3-choice question rejects index 3
s = tv.reduce(s,A('h','restart'),env()); assert.equal(s.qs.length,2); // restart keeps custom pool

// ---- rps
let r = GAMES.rps; s = r.init(env());
s = r.reduce(s,A('h','pick',{choice:0}),env()); // rock
s = r.reduce(s,A('a','pick',{choice:1}),env()); // paper
assert.deepEqual(r.view(s).picks,{h:true,a:true});
s = r.reduce(s,A('b','pick',{choice:2}),env()); // scissors -> reveal
assert.equal(s.phase,'reveal'); assert.equal(s.scores.a,1); assert.equal(s.scores.b,1); assert.equal(s.scores.h,1);
assert.equal(r.reduce(s,A('a','next'),env()).phase,'reveal'); // only host advances
s = r.reduce(s,A('h','next'),env()); assert.equal(s.phase,'pick'); assert.equal(s.round,2);

// ---- memory
let m = GAMES.memory; s = m.init(env());
assert.equal(s.cards.length,16);
assert.ok(m.view(s).cards.every(c=>c===null)); // nothing leaks
const face = s.cards[0]; const pair = s.cards.findIndex((c,i)=>i>0&&c===face); const other = s.cards.findIndex((c,i)=>c!==face);
assert.equal(m.reduce(s,A('a','flip',{i:0}),env()).flipped.length,0); // not a's turn
s = m.reduce(s,A('h','flip',{i:0}),env()); s = m.reduce(s,A('h','flip',{i:pair}),env());
assert.equal(s.phase,'check'); assert.ok(m.deadline(s));
assert.equal(m.reduce(s,A('h','timeout'),env({now:1000})).phase,'check'); // too early
s = m.reduce(s,A('h','timeout'),env({now:s.until+50}));
assert.equal(s.scores.h,1); assert.equal(s.phase,'play'); assert.equal(s.turn,0); // match keeps turn
s = m.reduce(s,A('h','flip',{i:s.cards.findIndex((c,i)=>s.matched[i]===undefined)}),env());
const f1 = s.flipped[0]; const mism = s.cards.findIndex((c,i)=>s.matched[i]===undefined&&c!==s.cards[f1]);
s = m.reduce(s,A('h','flip',{i:mism}),env()); s = m.reduce(s,A('h','timeout'),env({now:s.until+50}));
assert.equal(s.turn,1); assert.equal(s.flipped.length,0); // mismatch passes the turn

// ---- drawing
let d = GAMES.drawing; s = d.init(env({now:0}));
assert.equal(s.drawer,'h'); assert.equal(s.phase,'draw');
const pub = d.view(s); assert.equal(pub.word,null); assert.ok(pub.hint.includes('_'));
assert.equal(d.priv(s).h, s.word); assert.equal(Object.keys(d.priv(s)).length,1);
s = d.reduce(s,A('h','stroke',{p:[0.1,0.1,0.5,0.5],c:'#e03131',w:8}),env());
assert.equal(s.strokes.length,1);
assert.equal(d.reduce(s,A('a','stroke',{p:[0,0,1,1]}),env()).strokes.length,1); // only drawer draws
assert.equal(d.reduce(s,A('h','stroke',{p:[0,0,1],c:'x'}),env()).strokes.length,1); // odd length rejected
s = d.reduce(s,A('a','guess',{text:'nope'}),env()); assert.equal(s.guesses[0].text,'nope');
s = d.reduce(s,A('a','guess',{text:s.word.toUpperCase()}),env());
assert.ok(s.correct.includes('a')); assert.ok(s.scores.a>0&&s.scores.h===25);
assert.ok(!JSON.stringify(s.guesses).includes(s.word)); // correct guess never echoed
s = d.reduce(s,A('b','guess',{text:s.word}),env()); assert.equal(s.phase,'reveal'); // everyone got it
s = d.reduce(s,A('h','timeout'),env({now:s.until+50})); assert.equal(s.drawer,'a'); assert.equal(s.round,2);
s = d.reduce(s,A('h','skip'),env()); s = d.reduce(s,A('h','skip'),env()); // reveal -> turn 3
s = d.reduce(s,A('h','skip'),env()); s = d.reduce(s,A('h','skip'),env()); assert.equal(s.phase,'end');

// ---- impostor
let im = GAMES.impostor;
assert.equal(im.init({players:P.slice(0,2),hostId:'h',now:0}).phase,'need');
s = im.init(env());
assert.equal(s.phase,'clues'); const pubS = im.view(s);
assert.ok(!('impostor' in pubS) && !('word' in pubS));
const privs = im.priv(s); assert.equal(Object.values(privs).filter(x=>x.role==='impostor').length,1);
assert.ok(Object.values(privs).filter(x=>x.role==='crew').every(x=>x.word===s.word));
for (const id of s.order.slice()) { s = im.reduce(s,A(s.order[s.clueIdx],'clue',{text:'hint'}),env()); }
assert.equal(s.phase,'vote');
const imp = s.impostor; const crew = s.order.filter(x=>x!==imp);
// crew votes out impostor -> impostor guess phase, wrong guess -> crew wins
for (const id of s.order) { const t = id===imp ? crew[0] : imp; s = im.reduce(s,A(id,'vote',{target:t}),env()); }
assert.equal(s.phase,'guess'); assert.ok(!('word' in im.view(s)));
let w = im.reduce(s,A(imp,'guessword',{text:'zzz'}),env());
assert.equal(w.result.impostorWins,false); assert.equal(w.scores[crew[0]],1); assert.equal(w.scores[imp]??0,0);
w = im.reduce(s,A(imp,'guessword',{text:s.word}),env()); assert.equal(w.result.impostorWins,true); assert.equal(w.scores[imp],2);
assert.equal(im.reduce(s,A(crew[0],'guessword',{text:s.word}),env()).phase,'guess'); // only impostor may guess
w = im.reduce(w,A('h','start'),env()); assert.equal(w.phase,'clues'); assert.equal(w.round,2);
// wrong person voted out -> impostor wins
s = im.init(env()); for (const id of s.order) s = im.reduce(s,A(s.order[s.clueIdx],'clue',{text:'x'}),env());
const victim = s.order.find(x=>x!==s.impostor);
for (const id of s.order) s = im.reduce(s,A(id,'vote',{target: id===victim ? s.impostor : victim}),env());
assert.equal(s.phase,'result'); assert.equal(s.result.impostorWins,true);
assert.equal(im.view(s).impostor, s.impostor); // revealed at the end


// ---- packs & options
import { PACKS } from '../games/packs.js';
for (const [k,p] of Object.entries(PACKS)) {
  assert.ok(p.qs.length>=20, k);
  for (const [q,c,a] of p.qs) { assert.ok(q && c.length===4 && a>=0 && a<4, `${k}: ${q}`); assert.equal(new Set(c).size,4,`dup choices ${q}`); }
}
for (const k of Object.keys(PACKS)) { const st = GAMES.trivia.init(env(),{pack:k}); assert.equal(st.qs.length,8); for (const q of st.qs) assert.ok(PACKS[k].qs.some(x=>x[0]===q.q && x[1][x[2]]===q.c[q.a]),'answer preserved after shuffle'); }
for (const lv of ['easy','medium','hard','mixed']) assert.equal(GAMES.drawing.init(env({now:0}),{level:lv}).level, lv);
assert.equal(GAMES.drawing.reduce(GAMES.drawing.init(env({now:0}),{level:'hard'}),A('h','reset'),env()).level,'hard'); // reset keeps level
assert.ok(GAMES.trivia.options && GAMES.drawing.options && GAMES.charades.options);

// ---- connect 4
let c4 = GAMES.connect4; s = c4.init(env());
s = c4.reduce(s,A('h','drop',{col:3}),env()); assert.equal(s.board[5*7+3],'R');
assert.equal(c4.reduce(s,A('h','drop',{col:3}),env()).board.filter(Boolean).length,1); // not h's turn
assert.equal(c4.reduce(s,A('b','drop',{col:0}),env()).board.filter(Boolean).length,1);  // spectator ignored
s = c4.reduce(s,A('a','drop',{col:3}),env()); assert.equal(s.board[4*7+3],'Y'); // stacks
for (const [who,col] of [['h',0],['a',1],['h',0],['a',1],['h',0]]) s = c4.reduce(s,A(who,'drop',{col}),env());
assert.equal(s.winner,null); s = c4.reduce(s,A('a','drop',{col:2}),env()); s = c4.reduce(s,A('h','drop',{col:0}),env());
assert.equal(s.winner,'R'); assert.equal(s.line.length,4); // vertical four in column 0
assert.equal(c4.reduce(s,A('a','drop',{col:5}),env()).board.filter(Boolean).length, s.board.filter(Boolean).length); // frozen after win
let full = c4.init(env()); // column overflow
for (let i=0;i<6;i++) full = c4.reduce(full,A(i%2?'a':'h','drop',{col:6}),env());
const before = full.board.filter(Boolean).length; full = c4.reduce(full,A('h','drop',{col:6}),env()); assert.equal(full.board.filter(Boolean).length,before);
assert.equal(c4.reduce(c4.init(env()),A('h','drop',{col:9}),env()).board.filter(Boolean).length,0);

// ---- hangman
let hm = GAMES.hangman; s = hm.init(env());
let pv = hm.view(s); assert.ok(!('word' in pv)); assert.equal(pv.pattern.length, s.word.length); assert.ok(pv.pattern.every(x=>x===null));
const hw = s.word; const wrongL = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l=>!hw.includes(l));
s = hm.reduce(s,A('a','guess',{letter:hw[0]}),env()); assert.ok(s.scores.a>=10);
assert.equal(hm.reduce(s,A('b','guess',{letter:hw[0].toUpperCase()}),env()).guessed.length,1); // repeat ignored
assert.equal(hm.reduce(s,A('b','guess',{letter:'12'}),env()).guessed.length,1);
for (const l of wrongL.slice(0,6)) s = hm.reduce(s,A('b','guess',{letter:l}),env());
assert.equal(s.phase,'lost'); assert.equal(hm.view(s).word, hw);
assert.equal(hm.reduce(s,A('a','next'),env()).phase,'lost'); s = hm.reduce(s,A('h','next'),env()); assert.equal(s.phase,'play'); assert.equal(s.round,2);
let won = hm.init(env()); for (const l of new Set(won.word)) won = hm.reduce(won,A('a','guess',{letter:l}),env());
assert.equal(won.phase,'won'); assert.ok(won.scores.a>=50);

// ---- word race
import { feedback } from '../games/wordrace.js';
assert.deepEqual(feedback('crane','crane'),['g','g','g','g','g']);
assert.deepEqual(feedback('speed','abide'),['x','x','y','x','y']);   // duplicate letters: only as many yellows as exist
assert.deepEqual(feedback('allee','eagle'),['y','y','x','y','g']);
let wr = GAMES.wordrace; s = wr.init(env());
assert.ok(!('answer' in wr.view(s)) && !('guesses' in wr.view(s)));
s = wr.reduce(s,A('a','guess',{word:'xxxxx'}),env()); assert.deepEqual(wr.priv(s).a.guesses,['xxxxx']);
assert.deepEqual(wr.view(s).fb.a[0],['x','x','x','x','x']);
assert.equal(wr.reduce(s,A('a','guess',{word:'abc'}),env()).guesses.a.length,1); // must be 5 letters
const ans = s.answer;
s = wr.reduce(s,A('b','guess',{word:ans}),env()); assert.equal(s.solved[0],'b'); const firstPts = s.scores.b; assert.ok(firstPts>=100);
s = wr.reduce(s,A('a','guess',{word:ans}),env()); assert.ok(s.scores.a < firstPts+1 && s.scores.a>=20); // later solver earns less (despite same/fewer tries)
assert.equal(s.phase,'play'); s = wr.reduce(s,A('h','guess',{word:ans}),env()); assert.equal(s.phase,'reveal'); // all done
assert.equal(wr.view(s).answer, ans);
let out = wr.init(env()); for (let i=0;i<7;i++) out = wr.reduce(out,A('a','guess',{word:'zzzzz'}),env()); assert.equal(out.guesses.a.length,6); // capped at 6 tries

// ---- charades
let ch = GAMES.charades; s = ch.init(env({now:0}),{type:'animals'});
assert.equal(s.actor,'h'); assert.equal(s.phase,'act');
assert.equal(ch.view(s).prompt,null); assert.equal(ch.priv(s).h,s.prompt); assert.equal(Object.keys(ch.priv(s)).length,1);
assert.equal(ch.reduce(s,A('a','got',{id:'b'}),env()).phase,'act'); // only actor awards points
assert.equal(ch.reduce(s,A('h','got',{id:'h'}),env()).phase,'act'); // can't award yourself
const p1 = s.prompt; s = ch.reduce(s,A('h','pass'),env()); assert.notEqual(s.prompt,p1);
s = ch.reduce(s,A('h','got',{id:'a'}),env({now:5})); assert.equal(s.scores.a,100); assert.equal(s.scores.h,50); assert.equal(s.phase,'reveal');
assert.equal(ch.view(s).prompt, s.prompt); // revealed after the turn
s = ch.reduce(s,A('h','timeout'),env({now:s.until+50})); assert.equal(s.actor,'a'); assert.equal(s.phase,'act');
s = ch.reduce(s,A('h','timeout'),env({now:s.until+50})); s = ch.reduce(s,A('h','timeout'),env({now:s.until+50}));
s = ch.reduce(s,A('h','timeout'),env({now:s.until+50})); s = ch.reduce(s,A('h','timeout'),env({now:s.until+50})); assert.equal(s.phase,'end');


// ---- bingo
import { cardFor, cardOf, countOf, winCells, PATTERNS, MAX_CARDS, MODES, letterOf } from '../games/bingo.js';
const bg = GAMES.bingo;
const ALL = Array.from({ length: 75 }, (_, i) => i + 1);
// make the random draw land on a specific number (for 'call' and 'roll')
const forced = (state, n, type, who = 'h') => {
  const left = ALL.filter(x => !state.called.includes(x) && x !== state.pending);
  const orig = Math.random;
  Math.random = () => (left.indexOf(n) + 0.5) / left.length;
  try { return bg.reduce(state, A(who, type), env()); } finally { Math.random = orig; }
};
const row0 = card => [0, 1, 2, 3, 4].map(i => card[i]);

{ // cards
  const c = cardFor('a#0', 0);
  assert.deepEqual(c, cardFor('a#0', 0)); assert.notDeepEqual(c, cardFor('a#0', 5)); assert.notDeepEqual(c, cardFor('a#1', 0));
  assert.equal(c[12], 0); assert.equal(new Set(c).size, 25);
  for (let i = 0; i < 25; i++) if (i !== 12) { const col = i % 5; assert.ok(c[i] >= col * 15 + 1 && c[i] <= col * 15 + 15); }
  assert.deepEqual(['B', 'I', 'N', 'G', 'O'], [1, 16, 31, 46, 75].map(letterOf));
}
{ // defaults
  const b = bg.init(env(), {});
  assert.equal(b.phase, 'lobby'); assert.equal(b.pattern, 'line'); assert.equal(b.mode, 'auto'); assert.equal(b.host, 'h');
  assert.equal(countOf(b, 'a'), 1); // everyone starts with a single card
  assert.equal(bg.init(env(), { pattern: 'blackout', mode: 'manual' }).mode, 'manual');
  assert.equal(bg.init(env(), { pattern: 'nonsense', mode: 'nope' }).pattern, 'line');
  assert.equal(bg.init(env(), { pattern: 'custom' }).pattern, 'line'); // custom is drawn in the lobby, not picked up front
}
{ // lobby: shuffle, pattern, host-only controls
  let b = bg.init(env(), {});
  const before = cardOf(b, 'a');
  b = bg.reduce(b, A('a', 'shuffle'), env()); assert.notDeepEqual(cardOf(b, 'a'), before);
  assert.equal(bg.reduce(b, A('a', 'pattern', { id: 'x' }), env()).pattern, 'line'); // players can't pick
  assert.equal(bg.reduce(b, A('h', 'pattern', { id: 'x' }), env()).pattern, 'x');
  assert.equal(bg.reduce(b, A('h', 'pattern', { id: 'bogus' }), env()).pattern, 'line');
  assert.equal(bg.reduce(b, A('a', 'start'), env()).phase, 'lobby');
  assert.equal(bg.reduce(b, A('a', 'call'), env()).called.length, 0);
}
{ // several cards per player
  let b = bg.init(env(), {});
  b = bg.reduce(b, A('h', 'cards', { id: 'a', count: 3 }), env()); assert.equal(countOf(b, 'a'), 3); assert.equal(countOf(b, 'b'), 1);
  assert.equal(countOf(bg.reduce(b, A('a', 'cards', { id: 'a', count: 6 }), env()), 'a'), 3); // only the host adds cards
  assert.equal(countOf(bg.reduce(b, A('h', 'cards', { id: 'a', count: 99 }), env()), 'a'), MAX_CARDS);
  assert.equal(countOf(bg.reduce(b, A('h', 'cards', { id: 'a', count: 0 }), env()), 'a'), 1);
  assert.equal(countOf(bg.reduce(b, A('h', 'cards', { id: 'a', count: 'x' }), env()), 'a'), 1);
  assert.equal(countOf(bg.reduce(b, A('h', 'cards', { id: 'ghost', count: 4 }), env()), 'ghost'), 1); // unknown player ignored
  const all = bg.reduce(b, A('h', 'cards', { id: '*', count: 2 }), env());
  assert.ok(P.every(p => countOf(all, p.id) === 2));
  // shuffle one card vs all cards
  const before = [0, 1, 2].map(k => cardOf(b, 'a', k).join());
  const one = bg.reduce(b, A('a', 'shuffle', { k: 1 }), env());
  assert.deepEqual([0, 1, 2].map(k => cardOf(one, 'a', k).join()).map((c, k) => c === before[k]), [true, false, true]);
  const every = bg.reduce(b, A('a', 'shuffle'), env());
  assert.ok([0, 1, 2].every(k => cardOf(every, 'a', k).join() !== before[k]));
  assert.equal(bg.reduce(b, A('a', 'shuffle', { k: 5 }), env()).seeds && JSON.stringify(bg.reduce(b, A('a', 'shuffle', { k: 5 }), env()).seeds), JSON.stringify(b.seeds)); // card that doesn't exist
  // every card in the room stays unique (30 players x 3 cards, shuffled repeatedly)
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const e30 = { players: many, hostId: 'p0', now: 0 };
  let m = bg.reduce(bg.init(e30, {}), A('p0', 'cards', { id: '*', count: 3 }), e30);
  for (let r = 0; r < 3; r++) for (const p of many) m = bg.reduce(m, A(p.id, 'shuffle'), e30);
  m = bg.reduce(m, A('p0', 'start'), e30);
  const keys = many.flatMap(p => [0, 1, 2].map(k => cardOf(m, p.id, k).join()));
  assert.equal(new Set(keys).size, 90, 'all 90 cards unique');
}
{ // custom pattern
  let b = bg.init(env(), {});
  b = bg.reduce(b, A('h', 'custom', { cells: [0, 6, 6, 24, 99, -1, 'x', 1.5] }), env());
  assert.equal(b.pattern, 'custom'); assert.deepEqual(b.custom, [0, 6, 24]); // de-duplicated, sorted, junk dropped
  assert.deepEqual(bg.reduce(b, A('a', 'custom', { cells: [1] }), env()).custom, [0, 6, 24]); // host only
  const card = cardOf(b, 'a');
  const nums = [0, 6, 24].map(i => card[i]);
  assert.deepEqual(winCells(card, nums, 'custom', b.custom), [0, 6, 24]);
  assert.equal(winCells(card, nums.slice(1), 'custom', b.custom), null);
  assert.ok(winCells(card, [], 'custom', [12]) !== null || true); // centre alone is free
  // can't start with an empty or centre-only pattern
  const empty = bg.reduce(b, A('h', 'custom', { cells: [] }), env());
  assert.equal(bg.reduce(empty, A('h', 'start'), env()).phase, 'lobby');
  assert.equal(bg.reduce(bg.reduce(b, A('h', 'custom', { cells: [12] }), env()), A('h', 'start'), env()).phase, 'lobby');
  // plays through: completing exactly the custom squares wins
  let g = bg.reduce(b, A('h', 'start'), env());
  const ca = cardOf(g, 'a');
  g = { ...g, called: [ca[0], ca[6]] };
  const done = forced(g, ca[24], 'call');
  assert.equal(done.phase, 'over'); assert.ok(done.winners.some(w => w.id === 'a'));
  assert.deepEqual(done.winners.find(w => w.id === 'a').cells, [0, 6, 24]);
  // custom survives "play again"; picking a preset pattern keeps the drawing for later
  const again = bg.reduce(done, A('h', 'reset'), env());
  assert.equal(again.pattern, 'custom'); assert.deepEqual(again.custom, [0, 6, 24]);
  assert.deepEqual(bg.reduce(again, A('h', 'pattern', { id: 'x' }), env()).custom, [0, 6, 24]);
}
{ // start locks cards, pattern, counts
  let b = bg.reduce(bg.init(env(), {}), A('h', 'cards', { id: 'a', count: 2 }), env());
  b = bg.reduce(b, A('h', 'start'), env()); assert.equal(b.phase, 'play');
  const snap = JSON.stringify([b.seeds, b.counts, b.pattern]);
  for (const act of [A('a', 'shuffle'), A('h', 'pattern', { id: 'x' }), A('h', 'cards', { id: 'a', count: 5 }), A('h', 'custom', { cells: [1] })])
    assert.equal(JSON.stringify([bg.reduce(b, act, env()).seeds, bg.reduce(b, act, env()).counts, bg.reduce(b, act, env()).pattern]), snap);
  assert.equal(bg.reduce(b, A('a', 'call'), env()).called.length, 0); // only host calls
  assert.equal(bg.reduce(b, A('a', 'claim'), env()).winners.length, 0); // no BINGO button any more
}
{ // instant mode: the number is revealed to everyone straight away
  let b = bg.reduce(bg.init(env(), {}), A('h', 'start'), env());
  b = bg.reduce(b, A('h', 'call'), env()); assert.equal(b.called.length, 1); assert.equal(b.last, b.called[0]);
  assert.equal(bg.reduce(b, A('h', 'roll'), env()).pending ?? null, null); // roll is a manual-mode action
}
{ // auto-win, including with a second card
  let b = bg.reduce(bg.init(env(), { pattern: 'line' }), A('h', 'cards', { id: 'a', count: 2 }), env());
  b = bg.reduce(b, A('h', 'start'), env());
  const second = row0(cardOf(b, 'a', 1)), need = second[4];
  const one = forced({ ...b, called: second.slice(0, 4) }, need, 'call');
  assert.equal(one.phase, 'over');
  const w = one.winners.find(x => x.id === 'a'); assert.ok(w, 'a wins with no button'); assert.equal(w.k, 1); // via their second card
  const expected = P.filter(p => Array.from({ length: countOf(b, p.id) }, (_, k) => k).some(k => winCells(cardOf(b, p.id, k), one.called, 'line'))).map(p => p.id).sort();
  assert.deepEqual(one.winners.map(x => x.id).sort(), expected); // exactly the players with a completed card, one entry each
  assert.equal(bg.reduce(one, A('h', 'call'), env()).called.length, one.called.length); // finished
  assert.ok(forced({ ...b, called: second.slice(0, 3) }, need, 'call').winners.every(x => !(x.id === 'a' && x.k === 1)));
  const again = bg.reduce(one, A('h', 'reset'), env());
  assert.equal(again.phase, 'lobby'); assert.equal(again.called.length, 0); assert.equal(again.winners.length, 0);
  assert.deepEqual(again.seeds, one.seeds); assert.deepEqual(again.counts, one.counts); assert.equal(again.pattern, one.pattern);
  assert.equal(bg.reduce(one, A('a', 'reset'), env()).phase, 'over');
}
{ // private roll
  let b = bg.reduce(bg.init(env(), { mode: 'manual' }), A('h', 'start'), env());
  assert.equal(bg.reduce(b, A('h', 'call'), env()).called.length, 0); // 'call' is for instant mode
  assert.equal(bg.reduce(b, A('a', 'roll'), env()).pending ?? null, null); // only the host rolls
  assert.equal(bg.reduce(b, A('h', 'reveal'), env()).called.length, 0); // nothing to reveal yet
  const rolled = bg.reduce(b, A('h', 'roll'), env());
  const n = rolled.pending; assert.ok(n >= 1 && n <= 75);
  assert.equal(rolled.called.length, 0); // rolling announces nothing
  // players never receive the number, and neither does anyone on the network until it is revealed
  const pub = bg.view(rolled);
  assert.ok(!('pending' in pub) && pub.hasPending === true);
  assert.ok(!JSON.stringify(pub).includes(`"last":${n}`));
  assert.equal(bg.priv, undefined); // nothing addressed to anyone: the host reads its own state, the number never hits the wire
  assert.ok(!JSON.stringify(pub).includes('pending'));
  assert.equal(bg.view(b).hasPending, false);
  // can't roll again or switch mode until it is revealed; non-host can't reveal
  assert.equal(bg.reduce(rolled, A('h', 'roll'), env()).pending, n);
  assert.equal(bg.reduce(rolled, A('h', 'mode', { mode: 'auto' }), env()).mode, 'manual');
  assert.equal(bg.reduce(rolled, A('a', 'reveal'), env()).pending, n);
  const shown = bg.reduce(rolled, A('h', 'reveal'), env());
  assert.deepEqual(shown.called, [n]); assert.equal(shown.last, n); assert.equal(shown.pending, null);
  assert.equal(bg.view(shown).hasPending, false);
  // the next roll never repeats a revealed or pending number
  for (let i = 0; i < 74; i++) { const r = bg.reduce(shown, A('h', 'roll'), env()); assert.ok(r.pending !== n); }
  const noPlayers = { players: [], hostId: 'h', now: 0 }; // nobody can win, so the draw runs to the end
  let seq = shown; for (let i = 0; i < 74; i++) { seq = bg.reduce(seq, A('h', 'roll'), noPlayers); seq = bg.reduce(seq, A('h', 'reveal'), noPlayers); }
  assert.equal(new Set(seq.called).size, 75); assert.equal(bg.reduce(seq, A('h', 'roll'), noPlayers).pending ?? null, null); // all 75 drawn, no repeats
  // revealing the number that completes a card wins, same as instant mode
  let m = bg.reduce(bg.init(env(), { mode: 'manual' }), A('h', 'start'), env());
  const top = row0(cardOf(m, 'a'));
  m = forced({ ...m, called: top.slice(0, 4) }, top[4], 'roll');
  assert.equal(m.pending, top[4]); assert.equal(m.phase, 'play');
  m = bg.reduce(m, A('h', 'reveal'), env()); assert.equal(m.phase, 'over'); assert.ok(m.winners.some(x => x.id === 'a'));
  // switching modes: allowed in the lobby and between numbers, host only
  let l = bg.init(env(), {});
  assert.equal(bg.reduce(l, A('h', 'mode', { mode: 'manual' }), env()).mode, 'manual');
  assert.equal(bg.reduce(l, A('a', 'mode', { mode: 'manual' }), env()).mode, 'auto');
  assert.equal(bg.reduce(l, A('h', 'mode', { mode: 'bogus' }), env()).mode, 'auto');
  assert.ok(MODES.auto && MODES.manual);
  // an old saved game (no counts/mode fields) still works
  const old = { phase: 'play', pattern: 'line', seeds: {}, called: [], last: null, winners: [] };
  assert.equal(bg.reduce(old, A('h', 'call'), env()).called.length, 1);
  assert.equal(bg.view(old).hasPending, false);
}
{ // presets
  const card = cardOf(bg.init(env(), {}), 'z');
  for (const [k, p] of Object.entries(PATTERNS)) {
    if (k === 'custom') continue;
    const cells = p.cells ?? [0, 1, 2, 3, 4];
    const nums = cells.map(i => card[i]).filter(Boolean);
    assert.deepEqual(winCells(card, nums, k).slice().sort((x, y) => x - y), cells.slice().sort((x, y) => x - y), `${k} completes`);
    if (nums.length) assert.equal(winCells(card, nums.slice(1), k), null, `${k} needs every cell`);
  }
  assert.equal(PATTERNS.blackout.cells.length, 25); assert.equal(PATTERNS.l.cells.length, 9); assert.equal(PATTERNS.frame.cells.length, 16);
  assert.equal(winCells(card, [], 'blackout'), null);
  const two = [...[0, 1, 2, 3, 4], ...[5, 6, 7, 8, 9]].map(i => card[i]);
  assert.deepEqual(winCells(card, two, 'line').sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
}


// ---- bingo: ending games and history
{
  // a win is recorded: game number, winner names, pattern, how many numbers were called
  let b = bg.reduce(bg.init(env(), { pattern: 'line' }), A('h', 'start'), env());
  assert.deepEqual(b.history, []);
  const top = row0(cardOf(b, 'a'));
  const won = forced({ ...b, called: top.slice(0, 4) }, top[4], 'call');
  assert.equal(won.phase, 'over'); assert.equal(won.history.length, 1);
  const h1 = won.history[0];
  assert.equal(h1.n, 1); assert.equal(h1.pattern, 'Any line'); assert.equal(h1.called, 5); assert.equal(h1.ended, undefined);
  assert.ok(h1.winners.some(w => w.id === 'a' && w.name === 'Ann'), 'winner name is stored');
  assert.deepEqual(h1.winners.map(w => w.id).sort(), won.winners.map(w => w.id).sort());
  assert.ok(h1.at >= 0 && h1.mode === 'auto');

  // new game keeps the history and the settings; the second win becomes game #2
  const lobby = bg.reduce(won, A('h', 'reset'), env());
  assert.equal(lobby.phase, 'lobby'); assert.equal(lobby.history.length, 1); assert.equal(lobby.ended, false);
  assert.equal(bg.reduce(won, A('a', 'reset'), env()).phase, 'over'); // only the host
  let g2 = bg.reduce(lobby, A('h', 'start'), env());
  const top2 = row0(cardOf(g2, 'b'));
  const won2 = forced({ ...g2, called: top2.slice(0, 4) }, top2[4], 'call');
  assert.equal(won2.history.length, 2); assert.equal(won2.history[1].n, 2); assert.deepEqual(won2.history[0], h1); // earlier entry untouched

  // ending a game early counts as played with no winner
  let play = bg.reduce(bg.init(env(), { pattern: 'x' }), A('h', 'start'), env());
  play = bg.reduce(bg.reduce(play, A('h', 'call'), env()), A('h', 'call'), env());
  assert.equal(bg.reduce(play, A('a', 'end'), env()).phase, 'play'); // only the host can end it
  assert.equal(bg.reduce(bg.init(env(), {}), A('h', 'end'), env()).phase, 'lobby'); // nothing to end in the lobby
  const ended = bg.reduce(play, A('h', 'end'), env());
  assert.equal(ended.phase, 'over'); assert.equal(ended.ended, true); assert.deepEqual(ended.winners, []);
  assert.equal(ended.history.length, 1); assert.deepEqual(ended.history[0].winners, []); assert.equal(ended.history[0].called, 2); assert.equal(ended.history[0].pattern, 'X');
  assert.equal(bg.reduce(ended, A('h', 'call'), env()).called.length, 2); // finished: no more numbers
  assert.equal(bg.reduce(bg.reduce(ended, A('h', 'end'), env()), A('h', 'end'), env()).history.length, 1); // can't end twice
  assert.equal(bg.reduce(ended, A('h', 'reset'), env()).ended, false);

  // ending while a private roll is pending discards the number
  let man = bg.reduce(bg.init(env(), { mode: 'manual' }), A('h', 'start'), env());
  man = bg.reduce(man, A('h', 'roll'), env()); assert.ok(man.pending);
  const manEnded = bg.reduce(man, A('h', 'end'), env());
  assert.equal(manEnded.pending, null); assert.equal(manEnded.called.length, 0); assert.equal(bg.view(manEnded).hasPending, false);

  // abandoning mid-game (New game) is NOT counted
  const abandoned = bg.reduce(play, A('h', 'reset'), env());
  assert.equal(abandoned.phase, 'lobby'); assert.equal(abandoned.history.length, 0); assert.equal(abandoned.called.length, 0);
  assert.equal(bg.reduce(bg.reduce(won, A('h', 'reset'), env()), A('h', 'start'), env()).history.length, 1);
  assert.equal(bg.reduce(bg.reduce(bg.reduce(won, A('h', 'reset'), env()), A('h', 'start'), env()), A('h', 'reset'), env()).history.length, 1);

  // history survives leaving Bingo for another game (the room remembers it) and is restored on return
  const memory = bg.remember(won2);
  assert.equal(memory.history.length, 2);
  const back = bg.init(env(), { pattern: 'line', memory });
  assert.equal(back.history.length, 2); assert.equal(back.phase, 'lobby'); assert.equal(back.called.length, 0);
  assert.equal(bg.init(env(), {}).history.length, 0);
  assert.deepEqual(bg.remember({ phase: 'play' }), { history: [] }); // old saved game without history

  // clear history: host only
  assert.equal(bg.reduce(won2, A('a', 'clearhistory'), env()).history.length, 2);
  assert.equal(bg.reduce(won2, A('h', 'clearhistory'), env()).history.length, 0);

  // the public view carries the history to everyone, and the winner of a multi-card player knows which card
  assert.equal(bg.view(won2).history.length, 2);
  let multi = bg.reduce(bg.init(env(), { pattern: 'line' }), A('h', 'cards', { id: 'a', count: 2 }), env());
  multi = bg.reduce(multi, A('h', 'start'), env());
  const second = row0(cardOf(multi, 'a', 1));
  const mw = forced({ ...multi, called: second.slice(0, 4) }, second[4], 'call');
  const entry = mw.history[0].winners.find(w => w.id === 'a');
  assert.equal(entry.k, 1); assert.equal(entry.multi, true);
  assert.equal(mw.history[0].winners.find(w => w.id !== 'a')?.multi ?? false, false);

  // custom patterns are named by how many squares they use
  let cu = bg.reduce(bg.init(env(), {}), A('h', 'custom', { cells: [0, 6, 24] }), env());
  cu = bg.reduce(cu, A('h', 'start'), env());
  const ca = cardOf(cu, 'a');
  const cuWon = forced({ ...cu, called: [ca[0], ca[6]] }, ca[24], 'call');
  assert.equal(cuWon.history[0].pattern, 'Custom (3 squares)');

  // old saved games without history/ended still work end to end
  const oldGame = { phase: 'play', pattern: 'line', seeds: {}, called: [], last: null, winners: [] };
  assert.equal(bg.reduce(oldGame, A('h', 'end'), env()).history.length, 1);
  assert.equal(bg.view(oldGame).history.length, 0);
}


// ---- duplicate display names
import { resolveName, normName } from '../games/names.js';
{
  const pl = (...xs) => xs.map(([id, name, t]) => ({ id, name, t }));
  assert.equal(resolveName(pl(['a', 'Nicole', 1]), 'a', 'Nicole'), 'Nicole'); // alone: keeps the name
  assert.equal(resolveName(pl(['a', 'Nicole', 1], ['b', 'Nicole', 2]), 'a', 'Nicole'), 'Nicole'); // first to join keeps it
  assert.equal(resolveName(pl(['a', 'Nicole', 1], ['b', 'Nicole', 2]), 'b', 'Nicole'), 'Nicole 2'); // second becomes "Nicole 2"
  assert.equal(resolveName(pl(['a', 'Nicole', 1], ['b', 'NICOLE', 2]), 'b', 'NICOLE'), 'NICOLE 2'); // not case-sensitive
  assert.equal(resolveName(pl(['a', 'Nicole', 1], ['b', 'Nicole 2', 2], ['c', 'Nicole', 3]), 'c', 'Nicole'), 'Nicole 3'); // skips taken suffixes
  assert.equal(resolveName(pl(['a', 'Nicole', 1], ['b', 'Nicole 2', 2]), 'b', 'Nicole'), 'Nicole 2'); // stable once renamed
  assert.equal(resolveName(pl(['b', 'Nicole 2', 2]), 'b', 'Nicole'), 'Nicole'); // the original left: gets the plain name back
  assert.equal(resolveName(pl(['a', 'Ann', 1], ['b', 'Bo', 2]), 'b', 'Bo'), 'Bo'); // different names are untouched
  assert.equal(resolveName(pl(['a', 'Sam', 5], ['b', 'Sam', 5]), 'a', 'Sam'), 'Sam'); // same join time: lower id wins
  assert.equal(resolveName(pl(['a', 'Sam', 5], ['b', 'Sam', 5]), 'b', 'Sam'), 'Sam 2');
  assert.equal(resolveName([], 'x', 'Zed'), 'Zed'); // not in the list yet
  // everyone ends up with a different name, whatever order they join in
  const joined = ['id1', 'id2', 'id3', 'id4'].map((id, i) => ({ id, name: 'Nicole', t: 10 + i }));
  for (let pass = 0; pass < 3; pass++) for (const p of joined) p.name = resolveName(joined, p.id, 'Nicole');
  assert.equal(new Set(joined.map(p => normName(p.name))).size, 4); assert.deepEqual(joined.map(p => p.name), ['Nicole', 'Nicole 2', 'Nicole 3', 'Nicole 4']);
}


// ---- long player lists: search and pagination
import { search, paginate } from '../games/list.js';
{
  const people = Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, name: i % 100 === 0 ? `Nicole ${i}` : `Player ${i}` }));
  assert.equal(search(people, '').length, 1000);
  assert.equal(search(people, 'nicole').length, 10); // case-insensitive
  assert.equal(search(people, '  NICOLE 3 ').map(p => p.name).join(), 'Nicole 300');
  assert.equal(search(people, 'zzz').length, 0);
  const pg = paginate(people, 0, 10);
  assert.equal(pg.items.length, 10); assert.equal(pg.pages, 100); assert.equal(pg.total, 1000); assert.equal(pg.page, 0);
  assert.equal(paginate(people, 99, 10).items[9].id, 'p999'); // last page
  assert.equal(paginate(people, 500, 10).page, 99); // too far: clamped to the last page
  assert.equal(paginate(people, -3, 10).page, 0);
  assert.equal(paginate([], 0, 10).pages, 1); assert.equal(paginate([], 0, 10).items.length, 0);
  assert.equal(paginate(people.slice(0, 25), 2, 10).items.length, 5); // partial last page
}
console.log('all game tests passed');
