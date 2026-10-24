import { ROOMS, roomOf, TEAMS } from './secret-data.js';

const pick = a => a[Math.floor(Math.random() * a.length)];

// Points one finished task is worth (also used for the end-of-round ranking).
export const taskPoints = (ok, ms) => (ok ? 10 + Math.max(0, 5 - Math.floor(ms / 5000)) : 0);

// A clue is always a TRUE fact about the Millionaire, taken from what really happened this round.
// round: { log: [{id, room, ok, ms}], visited: [room ids the Millionaire walked into], team: {id: 0|1}, players: [ids], names: {id: name}, millionaire, used: [kinds already given] }
// Returns { kind, text } or null.
export function makeClue({ log, visited: walked, team, players, names, millionaire: m, used = [] }) {
  const mine = log.filter(e => e.id === m);
  const visited = [...new Set([...(walked ?? []), ...mine.map(e => e.room)])];   // rooms walked into, plus rooms where a task was done
  const skipped = ROOMS.map(r => r.id).filter(r => !visited.includes(r));
  const okN = mine.filter(e => e.ok).length;
  const name = String(names[m] ?? '').trim();
  const c = [];
  if (visited.length) { const r = roomOf(pick(visited)); c.push({ kind: 'visit', text: `The Millionaire visited the ${r.name} ${r.emoji} this round.` }); }
  if (skipped.length) { const r = roomOf(pick(skipped)); c.push({ kind: 'skip', text: `The Millionaire never set foot in the ${r.name} ${r.emoji} this round.` }); }
  if (mine.length) c.push({ kind: 'fail', text: mine.some(e => !e.ok) ? 'The Millionaire failed at least one task this round.' : 'The Millionaire did not fail a single task this round.' });
  c.push({ kind: 'count', text: okN === 0 ? 'The Millionaire completed no tasks this round.' : `The Millionaire completed exactly ${okN} task${okN === 1 ? '' : 's'} this round.` });
  const fast = mine.filter(e => e.ok).map(e => e.ms);
  if (fast.length) { const best = Math.min(...fast); const lim = [4, 6, 8, 12, 20].find(s => best < s * 1000); if (lim) c.push({ kind: 'speed', text: `The Millionaire finished a task in under ${lim} seconds.` }); }
  if (players.length >= 4) {
    const pts = Object.fromEntries(players.map(id => [id, log.filter(e => e.id === id).reduce((a, e) => a + taskPoints(e.ok, e.ms), 0)]));
    const more = players.filter(id => pts[id] > pts[m]).length, less = players.filter(id => pts[id] < pts[m]).length, half = players.length / 2;
    if (more < half) c.push({ kind: 'rank', text: 'The Millionaire was in the top half of scorers this round.' });
    else if (less < half) c.push({ kind: 'rank', text: 'The Millionaire was in the bottom half of scorers this round.' });
  }
  if (team[m] != null) c.push({ kind: 'team', text: `This round the Millionaire was on the ${TEAMS[team[m]].emoji} ${TEAMS[team[m]].name} team.` });
  if (name) {
    const ch = name.charAt(0).toUpperCase();
    if (/[A-Z]/.test(ch)) c.push({ kind: 'initial', text: `The Millionaire's name starts with a letter ${ch <= 'M' ? 'from A to M' : 'from N to Z'}.` });
    c.push({ kind: 'length', text: `The Millionaire's name has ${name.length > 5 ? 'more than 5' : '5 or fewer'} letters.` });
  }
  // who they were teamed with (or against) this round
  const mates = players.filter(id => id !== m && team[id] === team[m]), foes = players.filter(id => team[id] != null && team[id] !== team[m]);
  if (mates.length) c.push({ kind: 'mate', text: `This round the Millionaire was on the same team as ${names[pick(mates)]}.` });
  if (foes.length) c.push({ kind: 'notmate', text: `This round the Millionaire was NOT on the same team as ${names[pick(foes)]}.` });
  c.push({ kind: 'rooms', text: `The Millionaire visited exactly ${visited.length} room${visited.length === 1 ? '' : 's'} this round.` });
  if (name && /[A-Za-z]$/.test(name)) c.push({ kind: 'vowel', text: `The Millionaire's name ends with ${/[aeiou]$/i.test(name) ? 'a vowel' : 'a consonant'}.` });
  if (players.length >= 4 && fast.length) {
    const best = id => Math.min(Infinity, ...log.filter(e => e.id === id && e.ok).map(e => e.ms)), mine2 = best(m);
    const quicker = players.filter(id => best(id) < mine2).length, slower = players.filter(id => best(id) > mine2).length;
    if (quicker < players.length / 2) c.push({ kind: 'speedrank', text: 'The Millionaire was in the quicker half this round.' });
    else if (slower < players.length / 2) c.push({ kind: 'speedrank', text: 'The Millionaire was in the slower half this round.' });
  }
  const fresh = c.filter(x => !used.includes(x.kind));
  return pick(fresh.length ? fresh : c);
}
