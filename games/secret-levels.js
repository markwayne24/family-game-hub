// How hard each task is, by level: [0] easy, [1] normal, [2] hard. The one place to change a number.
// tests/secret-balance.test.mjs checks these against a model of how a typical player does, so they stay in their bands.
export const LV = {
  reaction: { avg: [520, 450, 400] },                       // average reaction in ms that still counts as quick enough
  catch: { need: [7, 8, 9], fall: [0.7, 0.55, 0.48] },      // eggs to catch (of 10); how long an egg takes to fall (multiplier)
  sequence: { len: [4, 5, 5], step: [800, 720, 640] },      // books in the sequence; ms per flash
  oddone: { sizes: [[3, 3, 4], [3, 4, 5], [4, 5, 6]], allow: [2, 1, 1] }, // grid sizes; wrong taps allowed
  numbers: { limit: [11000, 9000, 8000] },                  // ms to tap 1 to 9
  wires: { n: [4, 4, 5], allow: [3, 0, 0], limit: [13000, 11500, 12000] },
  sums: { need: [3, 4, 4], range: [[2, 8, 2, 6], [3, 12, 2, 9], [6, 24, 4, 12]], mul: [[2, 7, 2, 5], [2, 8, 2, 6], [3, 6, 3, 6]] }, // right answers (of 4); number sizes
  whack: { need: [7, 8, 9], show: [950, 800, 680] },        // score needed (of 12 pops); how long a bug stays up (ms)
  timing: { zone: [0.26, 0.22, 0.18], speed: [0.7, 0.8, 0.9] },
  code: { tries: [7, 6, 5] },
  simmer: { zone: [[59, 85], [63, 81], [66, 78]] },         // the green zone, in % full
  scramble: { allow: [3, 2, 2] },                           // the game is lost on this many wrong letters
  pump: { gain: [5.5, 5.25, 5.25], decay: [6, 9, 12] },     // % per tap; % lost per second
  harvest: { allow: [2, 0, 0], ripe: [5, 5, 7], limit: [9000, 9500, 9000] },
  pairs: { allow: [9, 7, 6] },
  order: { n: [3, 4, 5], show: [2400, 2400, 3000] },
  quiz: { need: [2, 2, 2], secs: [10, 8, 9] },
  stopclock: { t: [4, 5, 6], tol: [0.65, 0.55, 0.4] },
  water: { maxn: [3, 4, 5], limit: [18000, 15000, 16000], hide: [0, 1800, 1400] },
  lights: { k: [3, 4, 5], limit: [8, 9, 10] },
};
