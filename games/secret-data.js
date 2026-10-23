// Shared facts for Secret Millionaire: the mansion's rooms, the two teams and the Millionaire's secret agendas.

// Each room has a few different tasks; one is picked at random every time someone walks in.
export const ROOMS = [
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳', title: 'Kitchen duty', tasks: ['reaction', 'catch'] },
  { id: 'library', name: 'Library', emoji: '📚', title: 'Study time', tasks: ['sequence', 'oddone'] },
  { id: 'garage', name: 'Garage', emoji: '🔧', title: 'Fix it up', tasks: ['numbers', 'wires'] },
  { id: 'garden', name: 'Garden', emoji: '🌿', title: 'Garden work', tasks: ['sums', 'whack'] },
  { id: 'vault', name: 'Vault', emoji: '🔐', title: 'Crack the vault', tasks: ['timing', 'code'] },
];
export const TASKS = {
  reaction: { title: 'Flip the pancakes', how: 'Tap the moment each pancake turns golden. Not before!' },
  catch: { title: 'Catch the eggs', how: 'Tap the falling eggs before they hit the floor. Catch at least 7 of 10.' },
  sequence: { title: 'Book order', how: 'Watch the glowing books, then tap them in the same order.' },
  oddone: { title: 'Spot the odd one out', how: 'One picture in each grid is slightly different. Tap it. Three grids, one slip allowed.' },
  numbers: { title: 'Rewire the engine', how: 'Tap the numbers from 1 to 9 as fast as you can.' },
  wires: { title: 'Match the wires', how: 'Tap a wire on the left, then the wire of the same colour on the right.' },
  sums: { title: 'Count the flowers', how: 'Answer four quick sums. Get three right.' },
  whack: { title: 'Squash the bugs', how: 'Tap the bugs 🐛 as they pop up. Do NOT tap the bees 🐝. Get at least 7 points.' },
  timing: { title: 'Crack the vault', how: 'Stop the dial inside the gold zone, three times.' },
  code: { title: 'Crack the code', how: 'Guess the 3-digit code. After each try, arrows show if the real digit is higher or lower. You have 6 tries.' },
};
export const roomOf = id => ROOMS.find(r => r.id === id);

export const TEAMS = [
  { id: 0, name: 'Red', emoji: '🔴', color: '#e03131' },
  { id: 1, name: 'Blue', emoji: '🔵', color: '#1971c2' },
];

export const MIN_PLAYERS = 4;
export const TOTAL_POT = 1000000;
export const BONUS = 50000;           // what the Millionaire earns for finishing a secret agenda
export const money = n => '$' + Math.round(n).toLocaleString('en-US');

// The Millionaire's secret agendas. Each one is checked automatically from what happened in the round.
// `key` is what the host picks. `check(info)` gets { visited:Set of room ids, done:number, ok:number, won:boolean }.
export const AGENDAS = [
  ...ROOMS.map(r => ({ key: `visit:${r.id}`, text: `Visit the ${r.name} ${r.emoji} this round.`, check: i => i.visited.has(r.id) })),
  ...ROOMS.map(r => ({ key: `avoid:${r.id}`, text: `Never enter the ${r.name} ${r.emoji} this round.`, check: i => !i.visited.has(r.id) })),
  { key: 'lose', text: 'Quietly make sure your team does NOT win this round.', check: i => !i.won },
  { key: 'win', text: 'Help your team win this round, so nobody suspects you.', check: i => i.won },
  { key: 'busy', text: 'Complete at least 3 tasks this round.', check: i => i.ok >= 3 },
  { key: 'lazy', text: 'Complete no more than 1 task this round.', check: i => i.ok <= 1 },
];
export const agendaOf = key => AGENDAS.find(a => a.key === key);
