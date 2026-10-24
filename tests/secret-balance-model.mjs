// A model of how a TYPICAL player does at each task, used to check (and tune) the numbers in games/secret-levels.js.
// These are assumptions about people, not measurements: reaction around 0.37 s on a phone, about 6 fast taps a second,
// a short-term memory span of about 5 things, and so on. Real games will tell better. The end-of-game "task stats" panel
// shows the real pass rates so the numbers can be adjusted from them.
import { LV as DEFAULT } from '../games/secret-levels.js';

let seed = 12345;
const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const N = (m, sd) => m + sd * Math.sqrt(-2 * Math.log(1 - R() || 1e-9)) * Math.cos(2 * Math.PI * R());
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const U = (a, b) => a + (b - a) * R();
const bin = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (R() < p) k++; return k; };
const logit = p => Math.log(p / (1 - p)), unlogit = x => 1 / (1 + Math.exp(-x));

export const person = () => ({
  rt: N(370, 55), spd: Math.exp(N(0, 0.18)), acc: N(0, 1), tap: Math.max(3, N(5.8, 1.3)), span: N(5.3, 1.2),
  tim: Math.abs(N(0.11, 0.03)), weber: Math.abs(N(0.085, 0.02)), know: N(0, 1),
});

export const MODELS = {
  reaction: (p, L, LV) => { let early = 0, sum = 0; for (let i = 0; i < 3; i++) { if (R() < 0.05) early++; sum += Math.max(160, p.rt + N(0, 65)); } return early <= 1 && sum / 3 <= LV.reaction.avg[L]; },
  catch: (p, L, LV) => {
    let avail = 0, caught = 0;
    for (let i = 0; i < 10; i++) {
      const spawn = 400 + 750 * i + U(0, 250), d = (1.9 + U(0, 0.8)) * LV.catch.fall[L] * 1000, start = Math.max(avail, spawn + p.rt * 0.8), h = N(260, 60) * p.spd;
      if (start + h <= spawn + d && R() > 0.07) { caught++; avail = start + h; }
    }
    return caught >= LV.catch.need[L];
  },
  simmer: (p, L, LV) => { const sd = Math.max(3, N(8.5, 2)), half = (LV.simmer.zone[L][1] - LV.simmer.zone[L][0]) / 2; let good = 0; for (let i = 0; i < 3; i++) if (Math.abs(N(0, sd)) <= half) good++; return good >= 2; },
  order: (p, L, LV) => Math.min(p.span, LV.order.show[L] / 450) + N(0, 0.5) >= LV.order.n[L],
  sequence: (p, L, LV) => p.span - (650 - LV.sequence.step[L]) / 250 + N(0, 0.6) >= LV.sequence.len[L] && R() < 0.985 ** LV.sequence.len[L],
  oddone: (p, L, LV) => { let miss = 0; for (const n of LV.oddone.sizes[L]) { const lam = (0.05 + 0.012 * n * n) * Math.exp(-0.3 * p.acc); miss += bin(4, lam / 4); } return miss <= LV.oddone.allow[L]; },
  scramble: (p, L, LV) => { const len = [4, 5, 6.25][L], q = clamp(0.10 + 0.025 * (len - 4) - 0.01 * p.acc, 0.02, 0.5); return bin(Math.round(len), q) < LV.scramble.allow[L]; },
  quiz: (p, L, LV) => { const base = [0.95, 0.85, 0.62][L], timeout = 1 / (1 + Math.exp((LV.quiz.secs[L] - 5.5) / 1.6)), pq = unlogit(logit(base) + 0.8 * p.know) * (1 - timeout); return bin(3, pq) >= LV.quiz.need[L]; },
  numbers: (p, L, LV) => (9 * N(0.8, 0.12) * p.spd + bin(3, 0.1)) * 1000 <= LV.numbers.limit[L],
  wires: (p, L, LV) => { const n = LV.wires.n[L], time = (n * 1.5 * p.spd + N(0, 0.8)) * 1000, mist = bin(n, clamp(0.09 - 0.02 * p.acc, 0.01, 0.4)); return mist <= LV.wires.allow[L] && time <= LV.wires.limit[L]; },
  pump: (p, L, LV) => { let v = 0; for (let t = 0; t < 8; t += 0.05) { v += p.tap * (1 - 0.04 * t) * 0.05 * LV.pump.gain[L] - 0.05 * LV.pump.decay[L]; v = Math.max(0, v); if (v >= 100) return true; } return false; },
  stopclock: (p, L, LV) => Math.abs(N(0, p.weber * LV.stopclock.t[L]) + N(0, 0.1)) <= LV.stopclock.tol[L],
  sums: (p, L, LV) => bin(4, unlogit(logit([0.97, 0.93, 0.87][L]) + 0.4 * p.acc)) >= LV.sums.need[L],
  whack: (p, L, LV) => { let score = 0; for (let i = 0; i < 12; i++) { if (R() < 0.2) { if (R() < 0.05) score--; } else if (p.rt + 90 + N(0, 70) <= LV.whack.show[L] - 80 && R() > 0.03) score++; } return score >= LV.whack.need[L]; },
  harvest: (p, L, LV) => { const ripe = LV.harvest.ripe[L] + 0.5, time = (ripe * N(0.85, 0.15) + 1.0) * p.spd * 1000, mist = bin(Math.round(ripe), clamp(0.04 - 0.012 * p.acc, 0.003, 0.3)); return time <= LV.harvest.limit[L] && mist <= LV.harvest.allow[L]; },
  water: (p, L, LV) => {
    let ok = true, taps = 0;
    for (let i = 0; i < 3; i++) { const n = 1 + Math.floor(R() * LV.water.maxn[L]); taps += n; const h = LV.water.hide[L]; const rem = h ? clamp(0.97 - 0.045 * (n - 1) - (1800 - h) / 8000, 0.3, 1) : 1; if (R() > rem || R() < 0.012 * n) ok = false; }
    return ok && (taps / p.tap + 2.5 * p.spd + 1) * 1000 <= LV.water.limit[L];
  },
  timing: (p, L, LV) => { let w = LV.timing.zone[L], s = LV.timing.speed[L], hits = 0, tries = 0; while (true) { tries++; if (Math.abs(N(0, p.tim * s)) <= w / 2) { hits++; w = Math.max(0.08, w - 0.03); s += 0.25; } if (hits >= 3) return true; if (tries >= 6 || tries - hits > 3) return false; } },
  code: (p, L, LV) => Math.max(3, Math.round(N(5.0, 1.0))) <= LV.code.tries[L],
  pairs: (p, L, LV) => Math.max(2, Math.round(N(6.0, 2.2))) <= LV.pairs.allow[L],
  lights: (p, L, LV) => Math.ceil(LV.lights.k[L] * 0.85 * N(2.1, 0.6)) + (p.acc < -1 ? 1 : 0) <= LV.lights.limit[L],
};

// share of typical players who pass, per task and level
export function passRates(LV = DEFAULT, n = 4000) {
  const out = {}; const crowd = Array.from({ length: n }, person);
  for (const [k, f] of Object.entries(MODELS)) out[k] = [0, 1, 2].map(L => crowd.filter(p => f(p, L, LV)).length / n);
  return out;
}
