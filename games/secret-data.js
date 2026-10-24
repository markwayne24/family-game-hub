// Shared facts for Secret Millionaire: the mansion's rooms, the two teams and the Millionaire's secret agendas.

// Each room has a few different tasks; one is picked at random every time someone walks in.
export const ROOMS = [
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳', title: 'Kitchen duty', tasks: ['reaction', 'catch', 'simmer', 'order'] },
  { id: 'library', name: 'Library', emoji: '📚', title: 'Study time', tasks: ['sequence', 'oddone', 'scramble', 'quiz'] },
  { id: 'garage', name: 'Garage', emoji: '🔧', title: 'Fix it up', tasks: ['numbers', 'wires', 'pump', 'stopclock'] },
  { id: 'garden', name: 'Garden', emoji: '🌿', title: 'Garden work', tasks: ['sums', 'whack', 'harvest', 'water'] },
  { id: 'vault', name: 'Vault', emoji: '🔐', title: 'Crack the vault', tasks: ['timing', 'code', 'pairs', 'lights'] },
];
export const TASKS = {
  reaction: { title: 'Flip the pancakes', how: 'Tap the moment each pancake turns golden. Not before!' },
  simmer: { title: 'Simmer the soup', how: 'Press and HOLD to heat the pot. Let go when the soup is in the green zone. Get two of three pots right.' },
  order: { title: 'Order up!', how: 'Remember the dishes on the order slip. They disappear, then pick them from the menu and serve.' },
  catch: { title: 'Catch the eggs', how: 'Tap the falling eggs before they hit the floor. Catch at least 7 of 10.' },
  sequence: { title: 'Book order', how: 'Watch the glowing books, then tap them in the same order.' },
  scramble: { title: 'Unscramble the word', how: 'The letters are jumbled. Tap them in the right order to spell a book word. Three slips allowed.' },
  quiz: { title: 'Library quiz', how: 'Answer quick questions before the clock runs out.' },
  oddone: { title: 'Spot the odd one out', how: 'One picture in each grid is slightly different. Tap it. Three grids, one slip allowed.' },
  numbers: { title: 'Rewire the engine', how: 'Tap the numbers from 1 to 9 as fast as you can.' },
  pump: { title: 'Pump the tyre', how: 'Tap PUMP as fast as you can. The tyre slowly leaks, so keep going until it is full!' },
  stopclock: { title: 'Stop the clock', how: 'A clock counts up, then hides. Tap STOP when you think it hits the target time.' },
  wires: { title: 'Match the wires', how: 'Tap a wire on the left, then the wire of the same colour on the right.' },
  sums: { title: 'Count the flowers', how: 'Answer four quick sums. Get three right.' },
  harvest: { title: 'Harvest the ripe ones', how: 'Pick every ripe tomato 🍅 and leave the green apples 🍏. One slip allowed.' },
  water: { title: 'Water the plants', how: 'Give each plant exactly the drops it needs. Too much and it wilts!' },
  whack: { title: 'Squash the bugs', how: 'Tap the bugs 🐛 as they pop up. Do NOT tap the bees 🐝. Get at least 7 points.' },
  timing: { title: 'Crack the vault', how: 'Stop the dial inside the gold zone, three times.' },
  pairs: { title: 'Match the gems', how: 'Flip two cards at a time and find all the matching pairs. Up to 6 wrong tries.' },
  lights: { title: 'Lights out', how: 'Tapping a light flips it and its neighbours. Turn every light OFF.' },
  code: { title: 'Crack the code', how: 'Guess the 3-digit code. After each try, arrows show if the real digit is higher or lower. You have 6 tries.' },
};
export const roomOf = id => ROOMS.find(r => r.id === id);

export const TEAMS = [
  { id: 0, name: 'Red', emoji: '🔴', color: '#e03131' },
  { id: 1, name: 'Blue', emoji: '🔵', color: '#1971c2' },
];

export const MIN_PLAYERS = 4;
// Team battles: everybody on both teams plays the same quick game at once; the team with the better average wins the bonus.
export const BATTLE_BONUS = 25;
export const BATTLE_BONUSES = [15, 25, 40, 60];
export const BATTLES = {
  tug: { name: 'Tug of War', emoji: '🪢', dur: 12000, how: 'Tap PULL as fast as you can! The team with the most taps per player wins.', unit: 'taps', max: 190 },
  trivia: { name: 'Trivia Showdown', emoji: '🧠', dur: 40000, how: 'Five questions, eight seconds each. The team with the most right answers per player wins.', unit: 'right', max: 5 },
  reflex: { name: 'Reflex Race', emoji: '⚡', dur: 22000, how: 'Tap the moment the light turns green, three times. Your best time counts. The quicker team wins.', unit: 'ms', lower: true, max: 3000, min: 90 },
  maths: { name: 'Maths Race', emoji: '➗', dur: 30000, how: 'Solve as many sums as you can in 30 seconds. The team with the most right answers per player wins.', unit: 'right', max: 45 },
  memory: { name: 'Memory Chain', emoji: '🔮', dur: 50000, how: 'Watch the lights, then repeat the pattern. It gets one longer each time. One mistake and you are out. The team with the longest chains wins.', unit: 'levels', max: 14 },
  gems: { name: 'Gem Rush', emoji: '💎', dur: 20000, how: 'Tap the falling gems 💎 but NOT the bombs 💣 (they cost you 2). The team with the most gems per player wins.', unit: 'gems', max: 90 },
};
export const BATTLE_ORDER = Object.keys(BATTLES);
export const BATTLE_FREQ = { every: 'After every round', second: 'After every second round', random: 'Now and then (random)', last: 'Only after the last round', off: 'No team battles' };
export const BATTLE_INTRO_MS = 5000;
export const DIFFICULTIES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', rising: 'Rising: gets harder every round' };
// How hard the tasks are in a given round: 0 (easiest) to 2 (hardest).
export const levelFor = (difficulty, round, rounds) => difficulty === 'easy' ? 0 : difficulty === 'hard' ? 2 : difficulty === 'rising' ? Math.round(((Math.max(1, round) - 1) / Math.max(1, rounds - 1)) * 2) : 1;
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
  { key: 'fast', text: 'Finish one task in under 6 seconds.', check: i => i.fastest < 6000 },
  { key: 'fail', text: 'Fail at least one task, without looking suspicious.', check: i => i.fails >= 1 },
  { key: 'spy', text: 'Use your 🔍 check on another player this round.', check: i => i.tags >= 1 },
  { key: 'rooms4', text: 'Visit at least 4 different rooms this round.', check: i => i.visited.size >= 4 },
  { key: 'rooms2', text: 'Visit no more than 2 rooms this round.', check: i => i.visited.size <= 2 },
  ...[['kitchen', 'garage'], ['library', 'garden'], ['vault', 'garden']].map(([a, b]) => { const A = ROOMS.find(r => r.id === a), B = ROOMS.find(r => r.id === b); return { key: `both:${a}:${b}`, text: `Visit both the ${A.name} ${A.emoji} and the ${B.name} ${B.emoji} this round.`, check: i => i.visited.has(a) && i.visited.has(b) }; }),
];
export const agendaOf = key => AGENDAS.find(a => a.key === key);
