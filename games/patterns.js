// Bingo win patterns on the 5x5 card. Square index = row * 5 + column, and the centre (12) is the free space.
// Shapes are drawn as little pictures: X marks a square that must be called.

const art = (...rows) => rows.flatMap((r, ri) => [...r].flatMap((ch, ci) => (ch === 'X' ? [ri * 5 + ci] : [])));
const shape = (name, group, ...rows) => ({ name, group, cells: art(...rows) });

const range = [0, 1, 2, 3, 4];
const row = r => range.map(c => r * 5 + c);
const col = c => range.map(r => r * 5 + c);
export const LINES = [...range.map(row), ...range.map(col), [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];

export const GROUPS = { classic: 'Classic', letters: 'Letters', shapes: 'Shapes', fun: 'Fun' };

// `any` lists alternative ways to make the pattern (any one of them completes it).
export const PATTERNS = {
  // ---- classic
  line: { name: 'Any line', group: 'classic', cells: null, any: LINES, preview: row(2) },
  corners: shape('Four corners', 'classic', 'X...X', '.....', '.....', '.....', 'X...X'),
  postage: {
    name: 'Postage stamp', group: 'classic',
    cells: art('XX...', 'XX...', '.....', '.....', '.....'),
    any: [art('XX...', 'XX...', '.....', '.....', '.....'), art('...XX', '...XX', '.....', '.....', '.....'),
      art('.....', '.....', '.....', 'XX...', 'XX...'), art('.....', '.....', '.....', '...XX', '...XX')],
  },
  x: shape('X', 'classic', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X'),
  plus: shape('Plus', 'classic', '..X..', '..X..', 'XXXXX', '..X..', '..X..'),
  frame: shape('Frame', 'classic', 'XXXXX', 'X...X', 'X...X', 'X...X', 'XXXXX'),
  stripes: shape('Three stripes', 'classic', 'XXXXX', '.....', 'XXXXX', '.....', 'XXXXX'),
  checker: shape('Checkerboard', 'classic', 'X.X.X', '.X.X.', 'X.X.X', '.X.X.', 'X.X.X'),
  tracks: shape('Railroad tracks', 'classic', '.X.X.', '.X.X.', '.X.X.', '.X.X.', '.X.X.'),
  blackout: shape('Blackout (all)', 'classic', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'),

  // ---- letters
  a: shape('Letter A', 'letters', '.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'),
  c: shape('Letter C', 'letters', 'XXXXX', 'X....', 'X....', 'X....', 'XXXXX'),
  d: shape('Letter D', 'letters', 'XXXX.', 'X...X', 'X...X', 'X...X', 'XXXX.'),
  e: shape('Letter E', 'letters', 'XXXXX', 'X....', 'XXXXX', 'X....', 'XXXXX'),
  f: shape('Letter F', 'letters', 'XXXXX', 'X....', 'XXXX.', 'X....', 'X....'),
  h: shape('Letter H', 'letters', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'),
  i: shape('Letter I', 'letters', 'XXXXX', '..X..', '..X..', '..X..', 'XXXXX'),
  l: shape('L shape', 'letters', 'X....', 'X....', 'X....', 'X....', 'XXXXX'),
  m: shape('Letter M', 'letters', 'X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'),
  n: shape('Letter N', 'letters', 'X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X'),
  p: shape('Letter P', 'letters', 'XXXX.', 'X...X', 'XXXX.', 'X....', 'X....'),
  t: shape('T shape', 'letters', 'XXXXX', '..X..', '..X..', '..X..', '..X..'),
  u: shape('Letter U', 'letters', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXXX'),
  v: shape('Letter V', 'letters', 'X...X', 'X...X', '.X.X.', '.X.X.', '..X..'),
  w: shape('Letter W', 'letters', 'X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'),
  y: shape('Letter Y', 'letters', 'X...X', '.X.X.', '..X..', '..X..', '..X..'),
  z: shape('Letter Z', 'letters', 'XXXXX', '...X.', '..X..', '.X...', 'XXXXX'),

  // ---- shapes
  diamond: shape('Diamond', 'shapes', '..X..', '.X.X.', 'X...X', '.X.X.', '..X..'),
  smalldiamond: shape('Small diamond', 'shapes', '.....', '..X..', '.X.X.', '..X..', '.....'),
  innerring: shape('Inner ring', 'shapes', '.....', '.XXX.', '.X.X.', '.XXX.', '.....'),
  heart: shape('Heart', 'shapes', '.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'),
  arrow: shape('Arrow', 'shapes', '..X..', '.XXX.', 'X.X.X', '..X..', '..X..'),
  hourglass: shape('Hourglass', 'shapes', 'XXXXX', '.X.X.', '..X..', '.X.X.', 'XXXXX'),
  stairs: shape('Staircase', 'shapes', 'X....', 'XX...', 'XXX..', 'XXXX.', 'XXXXX'),
  star: shape('Star', 'shapes', '..X..', 'XXXXX', '.XXX.', '.X.X.', 'X...X'),

  // ---- fun
  tree: shape('Christmas tree', 'fun', '..X..', '.XXX.', 'XXXXX', '..X..', '..X..'),
  house: shape('House', 'fun', '..X..', '.X.X.', 'XXXXX', 'X...X', 'XXXXX'),
  smiley: shape('Smiley face', 'fun', '.X.X.', '.X.X.', '.....', 'X...X', '.XXX.'),

  // the host draws this one square by square (see state.custom)
  custom: { name: 'Custom', group: 'custom', cells: [] },
};

export const PATTERN_IDS = Object.keys(PATTERNS);
export const PRESET_IDS = PATTERN_IDS.filter(id => id !== 'custom');

// Which squares to show in a small preview of this pattern.
export const previewCells = (id, custom = []) =>
  (id === 'custom' ? custom : PATTERNS[id]?.preview ?? PATTERNS[id]?.cells ?? PATTERNS.line.preview);

const setsOf = (id, custom) => (id === 'custom' ? [custom] : (PATTERNS[id] ?? PATTERNS.line).any ?? [(PATTERNS[id] ?? PATTERNS.line).cells]);

// The squares that make a card a winner for this pattern, or null if it isn't one yet.
export function winCells(card, called, id, custom = []) {
  const got = new Set(called);
  const done = i => card[i] === 0 || got.has(card[i]);
  const complete = setsOf(id, custom).filter(cells => cells.length && cells.every(done));
  return complete.length ? [...new Set(complete.flat())] : null;
}

// How many squares a card still needs for this pattern (0 = it has won).
export function needCount(card, called, id, custom = []) {
  const got = new Set(called);
  const missing = cells => cells.filter(i => card[i] !== 0 && !got.has(card[i])).length;
  const sets = setsOf(id, custom).filter(c => c.length);
  return sets.length ? Math.min(...sets.map(missing)) : 24;
}

// With several patterns selected, a card wins as soon as any one of them is complete.
export function matchPatterns(card, called, ids, custom = []) {
  for (const id of PATTERN_IDS) {
    if (!ids.includes(id)) continue;
    const cells = winCells(card, called, id, custom);
    if (cells) return { id, cells };
  }
  return null;
}

export const needAny = (card, called, ids, custom = []) => Math.min(...ids.map(id => needCount(card, called, id, custom)));

// A clean list of selected patterns: valid ids only, no duplicates, in the standard order. Null if none are valid.
export function cleanPatterns(ids) {
  const list = PATTERN_IDS.filter(id => Array.isArray(ids) && ids.includes(id));
  return list.length ? list : null;
}
