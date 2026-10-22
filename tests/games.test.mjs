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
import { cardFor, winCells, PATTERNS, letterOf } from '../games/bingo.js';
const bg = GAMES.bingo;
{ // cards: valid, deterministic, per-seed
  const c = cardFor('a', 0), c2 = cardFor('a', 0), c3 = cardFor('a', 5);
  assert.deepEqual(c, c2); assert.notDeepEqual(c, c3);
  assert.equal(c[12], 0); assert.equal(new Set(c).size, 25);
  for (let i = 0; i < 25; i++) if (i !== 12) { const col = i % 5; assert.ok(c[i] >= col * 15 + 1 && c[i] <= col * 15 + 15, `column range ${i}`); }
  assert.equal(letterOf(1), 'B'); assert.equal(letterOf(16), 'I'); assert.equal(letterOf(31), 'N'); assert.equal(letterOf(46), 'G'); assert.equal(letterOf(75), 'O');
}
{ // lobby: shuffle is allowed before the game starts, host controls the pattern
  let b = bg.init(env(), {}); assert.equal(b.phase, 'lobby'); assert.equal(b.pattern, 'line');
  assert.equal(bg.init(env(), { pattern: 'blackout' }).pattern, 'blackout');
  assert.equal(bg.init(env(), { pattern: 'nonsense' }).pattern, 'line');
  const before = cardFor('a', b.seeds.a ?? 0);
  b = bg.reduce(b, A('a', 'shuffle'), env()); assert.notDeepEqual(cardFor('a', b.seeds.a), before);
  assert.equal(bg.reduce(b, A('a', 'pattern', { id: 'x' }), env()).pattern, 'line'); // players can't pick the pattern
  assert.equal(bg.reduce(b, A('h', 'pattern', { id: 'x' }), env()).pattern, 'x');
  assert.equal(bg.reduce(b, A('h', 'pattern', { id: 'bogus' }), env()).pattern, 'line');
  assert.equal(bg.reduce(b, A('a', 'start'), env()).phase, 'lobby'); // only host starts
  assert.equal(bg.reduce(b, A('a', 'call'), env()).called.length, 0); // no calls before start
  // many shuffles by many players: every card stays unique
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const e30 = { players: many, hostId: 'p0', now: 0 };
  let m = bg.init(e30, {});
  for (let r = 0; r < 3; r++) for (const p of many) m = bg.reduce(m, A(p.id, 'shuffle'), e30);
  m = bg.reduce(m, A('p0', 'start'), e30);
  assert.equal(new Set(many.map(p => cardFor(p.id, m.seeds[p.id]).join(','))).size, 30, 'all 30 cards unique');
}
{ // start locks cards; nobody can shuffle mid-game; host calls numbers
  let b = bg.reduce(bg.init(env(), {}), A('h', 'start'), env());
  assert.equal(b.phase, 'play');
  const seedsBefore = JSON.stringify(b.seeds);
  assert.equal(JSON.stringify(bg.reduce(b, A('a', 'shuffle'), env()).seeds), seedsBefore);
  assert.equal(bg.reduce(b, A('a', 'call'), env()).called.length, 0); // only host calls
  assert.equal(bg.reduce(b, A('h', 'pattern', { id: 'x' }), env()).pattern, b.pattern); // pattern locked
  b = bg.reduce(b, A('h', 'call'), env()); assert.equal(b.called.length, 1); assert.equal(b.last, b.called[0]);
  assert.equal(bg.reduce(b, A('a', 'claim'), env()).winners.length, 0); // the old BINGO button no longer does anything
}
{ // auto-win: the call that completes a card wins immediately, with no claim button
  let b = bg.reduce(bg.init(env(), { pattern: 'line' }), A('h', 'start'), env());
  const card = cardFor('a', b.seeds.a);
  const topRow = [0, 1, 2, 3, 4].map(i => card[i]);
  const needed = topRow[4];
  const all = Array.from({ length: 75 }, (_, i) => i + 1);
  const called = topRow.slice(0, 4);
  const callForced = (state, n) => { // make the random draw land on `n`
    const left = all.filter(x => !state.called.includes(x));
    const orig = Math.random;
    Math.random = () => (left.indexOf(n) + 0.5) / left.length;
    try { return bg.reduce(state, A('h', 'call'), env()); } finally { Math.random = orig; }
  };
  const one = callForced({ ...b, called }, needed);
  assert.equal(one.last, needed); assert.equal(one.phase, 'over');
  const expected = P.filter(p => winCells(cardFor(p.id, b.seeds[p.id]), one.called, 'line')).map(p => p.id).sort();
  assert.deepEqual(one.winners.map(w => w.id).sort(), expected); // exactly the players whose cards complete
  assert.ok(expected.includes('a'));
  assert.ok(one.winners.find(w => w.id === 'a').cells.includes(0)); // winning cells reported for highlighting
  // one number short is not a win
  const miss = callForced({ ...b, called: topRow.slice(0, 3) }, needed);
  assert.equal(miss.phase, miss.winners.length ? 'over' : 'play');
  assert.ok(!miss.winners.some(w => w.id === 'a'));
  assert.equal(bg.reduce(one, A('h', 'call'), env()).called.length, one.called.length); // finished: no more calls
  // play again returns to the lobby with the same cards and pattern
  const again = bg.reduce(one, A('h', 'reset'), env());
  assert.equal(again.phase, 'lobby'); assert.equal(again.called.length, 0); assert.equal(again.winners.length, 0);
  assert.deepEqual(again.seeds, one.seeds); assert.equal(again.pattern, one.pattern);
  assert.equal(bg.reduce(one, A('a', 'reset'), env()).phase, 'over'); // only host resets
  // blackout needs the whole card
  const bo = bg.reduce(bg.init(env(), { pattern: 'blackout' }), A('h', 'start'), env());
  const cardNums = cardFor('a', bo.seeds.a).filter(Boolean);
  const almost = callForced({ ...bo, called: cardNums.slice(0, 23) }, cardNums[23]);
  assert.ok(almost.winners.some(w => w.id === 'a'));
  assert.ok(!callForced({ ...bo, called: cardNums.slice(0, 22) }, cardNums[22]).winners.some(w => w.id === 'a'));
}
{ // patterns: complete only when every cell is called; free space counts
  const card = cardFor('z', 3);
  for (const [k, p] of Object.entries(PATTERNS)) {
    const cells = p.cells ?? [0, 1, 2, 3, 4];
    const nums = cells.map(i => card[i]).filter(Boolean);
    assert.deepEqual(winCells(card, nums, k)?.slice().sort((x, y) => x - y), (p.cells ?? cells).slice().sort((x, y) => x - y), `${k} completes`);
    if (nums.length) assert.equal(winCells(card, nums.slice(1), k), null, `${k} needs every cell`);
  }
  assert.equal(PATTERNS.blackout.cells.length, 25); assert.equal(PATTERNS.corners.cells.length, 4);
  assert.equal(PATTERNS.l.cells.length, 9); assert.equal(PATTERNS.frame.cells.length, 16);
  assert.equal(winCells(card, [], 'blackout'), null);
  // two complete lines at once are both reported (union)
  const two = [...[0, 1, 2, 3, 4].map(i => card[i]), ...[5, 6, 7, 8, 9].map(i => card[i])];
  assert.deepEqual(winCells(card, two, 'line').sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // diagonal and column count as lines
  assert.ok(winCells(card, [0, 6, 18, 24].map(i => card[i]), 'line'));
  assert.ok(winCells(card, [2, 7, 17, 22].map(i => card[i]), 'line'));
}
console.log('all game tests passed');
