// The mansion for Secret Millionaire's live map: where the walls are, where the rooms and task pads are, and how a
// character moves. Pure functions, so it can be tested without a screen.

export const W = 600, H = 800, R = 14;           // world size and the character's radius
export const SPEED = 150;                         // units per second

// Walkable areas [x0, y0, x1, y1]. Anything outside them is wall. Rooms touch the hall only through their doors.
export const AREAS = {
  hallTop: [40, 280, 560, 320], hallBot: [40, 480, 560, 520], hallL: [40, 280, 220, 520], hallR: [380, 280, 560, 520],
  kitchen: [40, 40, 290, 260], kitchenDoor: [140, 260, 190, 280],
  library: [310, 40, 560, 260], libraryDoor: [410, 260, 460, 280],
  garage: [40, 560, 290, 760], garageDoor: [140, 520, 190, 560],
  garden: [310, 560, 560, 760], gardenDoor: [410, 520, 460, 560],
  vault: [240, 340, 360, 460], vaultDoor: [285, 460, 315, 480],
};
const WALK = Object.values(AREAS);
export const ROOM_IDS = ['kitchen', 'library', 'garage', 'garden', 'vault'];
export const STATIONS = { kitchen: [165, 150], library: [435, 150], garage: [165, 660], garden: [435, 660], vault: [300, 400] };
export const STATION_RADIUS = 42;

const inside = (x, y) => WALK.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
export const canStand = (x, y, r = R) => inside(x, y) && inside(x - r, y) && inside(x + r, y) && inside(x, y - r) && inside(x, y + r)
  && inside(x - r * 0.7, y - r * 0.7) && inside(x + r * 0.7, y - r * 0.7) && inside(x - r * 0.7, y + r * 0.7) && inside(x + r * 0.7, y + r * 0.7);

// Which room a point is in (doors and the hall belong to no room).
export const roomAt = (x, y) => ROOM_IDS.find(id => { const [a, b, c, d] = AREAS[id]; return x >= a && x <= c && y >= b && y <= d; }) ?? null;

// The task pad the character is standing on, if any.
export function nearStation(x, y) {
  let best = null, bd = STATION_RADIUS;
  for (const id of ROOM_IDS) { const [sx, sy] = STATIONS[id]; const d = Math.hypot(x - sx, y - sy); if (d <= bd) { best = id; bd = d; } }
  return best;
}

// Walk (dx, dy) (each -1..1) for dt seconds, sliding along walls. Returns the new { x, y }.
export function step({ x, y }, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (!len || !(dt > 0)) return { x, y };
  const k = Math.min(1, len) / len, d = SPEED * Math.min(dt, 0.1);
  const mx = dx * k * d, my = dy * k * d;
  let nx = x, ny = y;
  if (canStand(x + mx, y)) nx = x + mx;
  if (canStand(nx, y + my)) ny = y + my;
  return { x: nx, y: ny };
}

// Everyone starts in the hall, spread along the top, so nobody needs to be told where the others are.
export function spawn(index, count) {
  const x = 70 + ((560 - 70 - 40) * (index + 0.5)) / Math.max(1, count);
  return { x: Math.round(x), y: 300 };
}
