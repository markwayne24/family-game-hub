import { passRates, MODELS } from './secret-balance-model.mjs';
import { LV } from '../games/secret-levels.js';
import assert from 'node:assert';

// Every task has numbers for three levels, and a model to check them with
for (const [task, params] of Object.entries(LV)) {
  assert.ok(MODELS[task], `${task} has no model`);
  for (const [k, v] of Object.entries(params)) assert.equal(v.length, 3, `${task}.${k} needs 3 levels`);
}
for (const t of Object.keys(MODELS)) assert.ok(LV[t], `${t} has a model but no levels`);

// For a typical player (see the model) each level should be about this hard: easy mostly passes, hard is a real challenge.
const rates = passRates(LV, 3000);
for (const [task, [easy, normal, hard]] of Object.entries(rates)) {
  const pct = x => Math.round(x * 100);
  assert.ok(easy >= 0.82, `${task} easy is too hard (${pct(easy)}%)`);
  assert.ok(normal >= 0.55 && normal <= 0.98, `${task} normal is off (${pct(normal)}%)`);
  assert.ok(hard >= 0.35 && hard <= 0.92, `${task} hard is off (${pct(hard)}%)`);
  assert.ok(easy + 0.03 >= normal && normal + 0.03 >= hard, `${task} does not get harder (${pct(easy)}/${pct(normal)}/${pct(hard)})`);
}
const avg = i => Object.values(rates).reduce((a, r) => a + r[i], 0) / Object.keys(rates).length;
assert.ok(avg(0) > 0.9 && avg(1) > 0.7 && avg(1) < 0.9 && avg(2) > 0.5 && avg(2) < 0.75, `overall ${[0, 1, 2].map(i => Math.round(avg(i) * 100))}`);
console.log('secret balance tests passed (typical player passes ' + [0, 1, 2].map(i => Math.round(avg(i) * 100) + '%').join(' / ') + ' on easy / normal / hard)');
