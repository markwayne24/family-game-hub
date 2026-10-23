import { AREAS, ROOM_IDS, STATIONS, canStand, roomAt, nearStation, step, spawn, W, H, SPEED } from '../games/secret-world.js';
import assert from 'node:assert';

// every task pad and every spawn point is somewhere a character can stand
for (const id of ROOM_IDS) { const [x, y] = STATIONS[id]; assert.ok(canStand(x, y), id); assert.equal(roomAt(x, y), id); assert.equal(nearStation(x, y), id); }
for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) { const p = spawn(i, n); assert.ok(canStand(p.x, p.y), `spawn ${i}/${n}`); assert.equal(roomAt(p.x, p.y), null); }
// nothing outside the walls
for (const [x, y] of [[-5, 100], [W + 5, 100], [100, -5], [100, H + 5], [300, 270], [300, 330], [225, 400], [365, 400]]) assert.ok(!canStand(x, y), `${x},${y} is wall`);

// walls stop you, and you slide along them
let p = { x: 100, y: 300 };
for (let i = 0; i < 100; i++) p = step(p, 0, -1, 0.05);             // walk up from the hall into the wall above (not at the door)
assert.ok(p.y > 270, 'stopped by the wall, got ' + p.y);
p = { x: 100, y: 300 }; for (let i = 0; i < 40; i++) p = step(p, 1, -1, 0.05); assert.ok(p.x > 100 && canStand(p.x, p.y), 'slides along');
// the speed is what we say
const q = step({ x: 100, y: 300 }, 1, 0, 0.1); assert.ok(Math.abs(q.x - 100 - SPEED * 0.1) < 1e-6);
assert.ok(Math.abs(step({ x: 100, y: 300 }, 1, 1, 0.1).x - 100 - SPEED * 0.1 * Math.SQRT1_2) < 1e-6, 'diagonals are not faster');
assert.deepEqual(step({ x: 100, y: 300 }, 0, 0, 0.1), { x: 100, y: 300 });
assert.deepEqual(step({ x: 100, y: 300 }, 1, 0, 5).x - 100 <= SPEED * 0.1 + 1e-6, true, 'a long pause cannot teleport you through a wall');

// every pad can be reached from the hall by walking (breadth-first over a grid), and only through doors
const key = (x, y) => `${Math.round(x / 10)},${Math.round(y / 10)}`;
const seen = new Set(), queue = [{ x: 300, y: 300 }]; seen.add(key(300, 300));
while (queue.length) {
  const c = queue.shift();
  for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
    const nx = c.x + dx, ny = c.y + dy;
    if (!seen.has(key(nx, ny)) && canStand(nx, ny)) { seen.add(key(nx, ny)); queue.push({ x: nx, y: ny }); }
  }
}
for (const id of ROOM_IDS) assert.ok(seen.has(key(...STATIONS[id])), `${id} is reachable`);
// walking from the Kitchen door to the pad really works with the step function
let w = { x: 165, y: 300 }; for (let i = 0; i < 80; i++) w = step(w, 0, -1, 0.05); assert.equal(roomAt(w.x, w.y), 'kitchen');
// but the rooms are separate: you cannot cross from the Kitchen into the Library
let k = { x: 250, y: 150 }; for (let i = 0; i < 80; i++) k = step(k, 1, 0, 0.05); assert.equal(roomAt(k.x, k.y), 'kitchen');
// the vault only opens from below
let v = { x: 300, y: 300 }; for (let i = 0; i < 40; i++) v = step(v, 0, 1, 0.05); assert.equal(roomAt(v.x, v.y), null);
let v2 = { x: 300, y: 500 }; for (let i = 0; i < 40; i++) v2 = step(v2, 0, -1, 0.05); assert.equal(roomAt(v2.x, v2.y), 'vault');
assert.ok(AREAS.vault);
console.log('secret world tests passed');
