import { W, H, AREAS, STATIONS } from './secret-world.js';

// How the mansion and its people look. The mansion is painted once (see paintMansion) and kept as a picture;
// the glowing pads and the characters are drawn on top every frame. Everything is in world units.

const rrect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
const fillRR = (g, x, y, w, h, r, c) => { rrect(g, x, y, w, h, r); g.fillStyle = c; g.fill(); };
const strokeRR = (g, x, y, w, h, r, c, lw = 2) => { rrect(g, x, y, w, h, r); g.strokeStyle = c; g.lineWidth = lw; g.stroke(); };
const disc = (g, x, y, r, c) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = c; g.fill(); };
const shaded = (g, x, y, w, h, r, c, dy = 4) => { g.save(); g.globalAlpha = 0.28; fillRR(g, x + 1, y + dy, w, h, r, '#000'); g.restore(); fillRR(g, x, y, w, h, r, c); };
const clipArea = (g, [x0, y0, x1, y1], r, fn) => { g.save(); rrect(g, x0, y0, x1 - x0, y1 - y0, r); g.clip(); fn(x0, y0, x1, y1); g.restore(); };
const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/* ------------------------------ the mansion ------------------------------ */

export function paintMansion(g) {
  // the night around the house
  const bg = g.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H / 2, H * 0.75);
  bg.addColorStop(0, '#2b2054'); bg.addColorStop(1, '#0c0919');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff0d';
  for (let x = 12; x < W; x += 28) for (let y = 12; y < H; y += 28) disc(g, x, y, 0.9, '#ffffff10');

  // thick walls: a dark outer edge, a mid layer and a light rim next to the floor
  for (const [grow, col] of [[11, '#120d26'], [8, '#2c2352'], [5, '#5b4c99']]) {
    for (const [x0, y0, x1, y1] of Object.values(AREAS)) fillRR(g, x0 - grow, y0 - grow, x1 - x0 + grow * 2, y1 - y0 + grow * 2, 14, col);
  }

  const A = AREAS;
  // the hall: polished parquet with a red runner
  for (const k of ['hallTop', 'hallBot', 'hallL', 'hallR']) clipArea(g, A[k], 8, (x0, y0, x1, y1) => {
    fillRR(g, x0, y0, x1 - x0, y1 - y0, 0, '#dcc79f');
    for (let x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { g.fillStyle = (x / 26) % 2 ? '#00000010' : '#ffffff12'; g.fillRect(x, y0, 26, y1 - y0); g.fillStyle = '#7a5a2e30'; g.fillRect(x, y0, 1.2, y1 - y0); }
    for (let y = Math.floor(y0 / 40) * 40; y < y1; y += 40) { g.fillStyle = '#7a5a2e22'; g.fillRect(x0, y, x1 - x0, 1); }
  });
  for (const [x, y, w, h] of [[56, 291, 488, 18], [56, 491, 488, 18]]) { shaded(g, x, y, w, h, 6, '#9d2a3a', 2); strokeRR(g, x + 2, y + 2, w - 4, h - 4, 5, '#e8c36a', 1.4); }

  // the rooms
  clipArea(g, A.kitchen, 8, (x0, y0, x1, y1) => {            // tiles, counters, a table
    for (let y = y0; y < y1; y += 25) for (let x = x0; x < x1; x += 25) { g.fillStyle = ((x - x0) / 25 + (y - y0) / 25) % 2 ? '#fbefdc' : '#efd9b9'; g.fillRect(x, y, 25, 25); }
  });
  shaded(g, 56, 50, 190, 34, 8, '#8d5a3b'); fillRR(g, 56, 50, 190, 9, 6, '#b27a52');
  fillRR(g, 96, 56, 40, 22, 6, '#c9d6e0'); fillRR(g, 102, 60, 28, 14, 5, '#9fb6c6');
  for (const bx of [166, 186, 206]) { disc(g, bx, 67, 7, '#2d2d38'); disc(g, bx, 67, 3.2, '#ff7a45'); }
  shaded(g, 248, 50, 34, 62, 7, '#eef2f5'); fillRR(g, 274, 70, 3, 18, 1.5, '#9aa5ad'); fillRR(g, 252, 80, 26, 2, 1, '#c6ced4');
  disc(g, 90, 218, 30, '#00000020'); disc(g, 90, 214, 28, '#a9744a'); disc(g, 90, 214, 23, '#bf8a5e'); disc(g, 80, 208, 6, '#fff'); disc(g, 102, 218, 6, '#fff');
  for (const [cx, cy] of [[52, 196], [128, 196], [52, 236], [128, 236]]) disc(g, cx, cy, 8, '#7b4a2a');

  clipArea(g, A.library, 8, (x0, y0, x1, y1) => { fillRR(g, x0, y0, x1 - x0, y1 - y0, 0, '#d8cbf2'); for (let y = y0; y < y1; y += 14) { g.fillStyle = '#7b5cc912'; g.fillRect(x0, y, x1 - x0, 7); } });
  shaded(g, 338, 112, 194, 112, 16, '#6f4fc2'); strokeRR(g, 346, 120, 178, 96, 12, '#f0c96a', 2.4); strokeRR(g, 354, 128, 162, 80, 8, '#f0c96a88', 1.2);
  shaded(g, 322, 48, 230, 42, 6, '#5d3f27');
  for (let i = 0, x = 328; x < 546; i++) { const w = 7 + (i * 5) % 6, h = 24 + (i * 7) % 12; fillRR(g, x, 56 + (36 - h) / 1, w - 1, h, 1.5, ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#16a085'][i % 6]); x += w; }
  shaded(g, 322, 204, 78, 40, 12, '#a85a70'); fillRR(g, 328, 210, 30, 26, 8, '#c9788d'); fillRR(g, 362, 210, 30, 26, 8, '#c9788d');
  shaded(g, 514, 196, 32, 50, 8, '#7a5230'); disc(g, 530, 214, 11, '#f6efe0'); g.strokeStyle = '#3b2a1a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(530, 214); g.lineTo(530, 207); g.moveTo(530, 214); g.lineTo(535, 216); g.stroke();
  disc(g, 330, 140, 26, '#ffe9a830'); disc(g, 330, 140, 9, '#f5e7b8'); fillRR(g, 328, 146, 4, 24, 2, '#6b4a2e');

  clipArea(g, A.garage, 8, (x0, y0, x1, y1) => {
    fillRR(g, x0, y0, x1 - x0, y1 - y0, 0, '#c9d1d8');
    for (let i = 0; i < 90; i++) { g.fillStyle = i % 3 ? '#00000008' : '#ffffff0c'; g.fillRect(x0 + ((i * 53) % (x1 - x0)), y0 + ((i * 97) % (y1 - y0)), 22, 2); }
    g.save(); g.globalAlpha = 0.1; disc(g, 120, 640, 26, '#000'); disc(g, 250, 700, 20, '#000'); g.restore();
    g.setLineDash([12, 12]); g.lineWidth = 6; g.strokeStyle = '#f1c40f'; rrect(g, x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, 8); g.stroke(); g.lineDashOffset = 12; g.strokeStyle = '#2b2b33'; g.stroke(); g.setLineDash([]);
  });
  shaded(g, 58, 692, 100, 54, 16, '#c0392b'); fillRR(g, 78, 698, 52, 42, 10, '#e5594a'); fillRR(g, 124, 701, 20, 36, 7, '#5a6a7a'); fillRR(g, 82, 701, 12, 36, 5, '#5a6a7a88');
  for (const [wx, wy] of [[66, 684], [66, 736], [130, 684], [130, 736]]) fillRR(g, wx, wy, 22, 10, 4, '#1a1a22');
  shaded(g, 220, 704, 54, 34, 6, '#c0392b'); fillRR(g, 236, 698, 22, 8, 4, '#7f8c8d');
  for (const [tx, ty] of [[262, 606], [262, 598], [262, 590]]) { disc(g, tx, ty, 17, '#1e1e24'); disc(g, tx, ty, 8, '#4a4a55'); }
  shaded(g, 52, 574, 112, 26, 5, '#7a5a3a'); for (const wx of [62, 82, 102]) fillRR(g, wx, 580, 12, 12, 3, '#d0d6dc');

  clipArea(g, A.garden, 8, (x0, y0, x1, y1) => { for (let x = x0; x < x1; x += 22) { g.fillStyle = ((x - x0) / 22) % 2 ? '#b9e3ab' : '#c6ebb9'; g.fillRect(x, y0, 22, y1 - y0); } });
  for (const [px, py, pr] of [[435, 590, 9], [425, 612, 8], [446, 628, 9], [432, 700, 8], [446, 722, 9], [428, 742, 8]]) { g.save(); g.globalAlpha = 0.35; disc(g, px + 1, py + 2, pr, '#000'); g.restore(); disc(g, px, py, pr, '#d8d6cf'); }
  shaded(g, 324, 700, 76, 48, 10, '#6b4a2e', 3); for (let i = 0; i < 14; i++) disc(g, 332 + (i * 13) % 62, 708 + (i * 7) % 32, 4.2, ['#ff6b81', '#ffd43b', '#f783ac', '#ffa94d'][i % 4]);
  shaded(g, 500, 576, 50, 40, 10, '#6b4a2e', 3); for (let i = 0; i < 9; i++) disc(g, 507 + (i * 11) % 38, 584 + (i * 7) % 26, 4, ['#ff8787', '#fff3bf', '#a5d8ff'][i % 3]);
  disc(g, 520, 716, 28, '#00000022'); disc(g, 520, 714, 26, '#d0d6dc'); disc(g, 520, 714, 20, '#74c0fc'); disc(g, 520, 714, 8, '#d0ebff'); disc(g, 520, 714, 3, '#fff');
  for (const [tx, ty, tr] of [[340, 602, 22]]) { disc(g, tx + 4, ty + 6, tr, '#00000024'); disc(g, tx, ty, tr, '#2b8a3e'); disc(g, tx - 6, ty - 6, tr * 0.6, '#51cf66'); disc(g, tx + 8, ty + 4, tr * 0.4, '#37b24d'); }
  shaded(g, 470, 735, 38, 12, 4, '#8a5a35');

  clipArea(g, A.vault, 8, (x0, y0, x1, y1) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1); grad.addColorStop(0, '#f7e7ad'); grad.addColorStop(1, '#e6bf5a'); g.fillStyle = grad; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let x = x0 + 8; x < x1; x += 16) for (let y = y0 + 8; y < y1; y += 16) disc(g, x, y, 1.3, '#8a6a1c55');
    g.strokeStyle = '#8a6a1c33'; g.lineWidth = 2; for (const r of [64, 48]) { g.beginPath(); g.arc(300, 400, r, 0, 7); g.stroke(); }
  });
  for (const [cx, cy] of [[256, 444], [344, 444], [256, 356]]) for (let i = 0; i < 4; i++) { disc(g, cx, cy - i * 4, 9, '#b8860b'); disc(g, cx, cy - i * 4 - 1.5, 8, '#ffd43b'); }
  g.font = '18px system-ui'; g.textAlign = 'center'; g.fillText('💎', 346, 364);

  // the doorways
  for (const k of ['kitchenDoor', 'libraryDoor', 'garageDoor', 'gardenDoor', 'vaultDoor']) clipArea(g, A[k], 5, (x0, y0, x1, y1) => {
    fillRR(g, x0, y0, x1 - x0, y1 - y0, 0, '#b08f5c');
    g.fillStyle = '#00000018'; for (let y = y0; y < y1; y += 8) g.fillRect(x0, y, x1 - x0, 1.2);
    g.fillStyle = '#fff3'; g.fillRect(x0, y0, 3, y1 - y0);
  });

  // the light falls off towards the edges
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72); v.addColorStop(0, '#0000'); v.addColorStop(1, '#0a07188c');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

/* --------------------------- the task pads --------------------------- */

export function drawPad(g, room, { t, done, near, label }) {
  const [sx, sy] = STATIONS[room.id], pulse = (Math.sin(t * 3) + 1) / 2;
  const glow = g.createRadialGradient(sx, sy, 6, sx, sy, 66);
  glow.addColorStop(0, done ? '#51cf6680' : near ? '#ffe066d0' : `#ffd43b${pulse > 0.5 ? '90' : '70'}`); glow.addColorStop(1, '#ffd43b00');
  g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, 66, 0, 7); g.fill();
  disc(g, sx, sy, 27, '#0000002e'); disc(g, sx, sy, 25, done ? '#e6fcf5' : '#fffaf0'); disc(g, sx, sy, 19, done ? '#c3fae8' : '#ffe9a8');
  g.save(); g.lineWidth = 3; g.strokeStyle = done ? '#2f9e44' : '#e8a317'; if (!done) { g.setLineDash([9, 6]); g.lineDashOffset = -t * 18; }
  g.beginPath(); g.arc(sx, sy, 28, 0, 7); g.stroke(); g.restore();
  if (near && !done) { g.save(); g.globalAlpha = 1 - pulse; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 28 + pulse * 18, 0, 7); g.stroke(); g.restore(); }
  g.font = '26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(room.emoji, sx, sy + 1); g.textBaseline = 'alphabetic';
  if (done) { disc(g, sx + 19, sy - 19, 9, '#2f9e44'); g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(sx + 14.5, sy - 19); g.lineTo(sx + 18, sy - 15.5); g.lineTo(sx + 24, sy - 23); g.stroke(); }
  // a small name plate under it
  g.font = '800 14px system-ui'; const w = g.measureText(label).width + 18;
  fillRR(g, sx - w / 2, sy + 34, w, 20, 10, '#150f2cc4'); g.fillStyle = '#fff'; g.fillText(label, sx, sy + 48.5);
}

/* --------------------------- the characters --------------------------- */

// A small round "buddy": soft body, a beanie in the team's colour, eyes that blink and look where they walk.
export function drawBuddy(g, o) {
  const { x, y, face, name, teamColor, moving, t, busy, me, seed = 0 } = o;
  const walk = moving ? Math.sin(t * 14 + seed) : 0, breathe = Math.sin(t * 2 + seed) * 0.5;
  const bob = moving ? -Math.abs(walk) * 2.4 : breathe, sq = moving ? 1 + 0.05 * walk : 1 + breathe * 0.03;
  const h = hue(name);
  // shadow and, for you, a golden ring
  g.save(); g.translate(x, y + 15); g.scale(1, 0.34); const sh = g.createRadialGradient(0, 0, 2, 0, 0, 17); sh.addColorStop(0, '#0007'); sh.addColorStop(1, '#0000'); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 17, 0, 7); g.fill(); g.restore();
  if (me) { g.save(); g.strokeStyle = `rgba(255,224,102,${0.65 + 0.3 * Math.sin(t * 4)})`; g.lineWidth = 2.4; g.beginPath(); g.ellipse(x, y + 15, 19, 7, 0, 0, 7); g.stroke(); g.restore(); }
  g.save(); g.translate(x, y + 15); g.rotate(face * 0.07 * (moving ? 1 : 0)); g.translate(-x, -(y + 15)); g.translate(0, bob);
  // feet
  for (const s of [-1, 1]) { const lift = moving ? Math.max(0, s * walk) * 3 : 0; fillRR(g, x + s * 6 - 4.5, y + 9 - lift, 9, 7, 3.5, '#2d2540'); }
  // body
  g.save(); g.translate(x, y + 12); g.scale(1, sq); g.translate(-x, -(y + 12));
  const body = g.createLinearGradient(0, y - 16, 0, y + 12); body.addColorStop(0, `hsl(${h} 78% 70%)`); body.addColorStop(1, `hsl(${h} 66% 48%)`);
  rrect(g, x - 13, y - 15, 26, 28, 12); g.fillStyle = body; g.fill(); g.lineWidth = 1.6; g.strokeStyle = `hsl(${h} 55% 32%)`; g.stroke();
  g.save(); g.globalAlpha = 0.3; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 6, y - 4, 3.2, 7, -0.2, 0, 7); g.fill(); g.restore();
  // beanie
  g.beginPath(); g.arc(x, y - 7, 13.4, Math.PI, 0); g.closePath(); g.fillStyle = teamColor; g.fill(); g.strokeStyle = '#0003'; g.lineWidth = 1; g.stroke();
  fillRR(g, x - 14, y - 9, 28, 5.5, 2.7, '#00000026'); fillRR(g, x - 14, y - 9.4, 28, 4.6, 2.3, teamColor);
  disc(g, x + face * 1.5, y - 22.4, 3.6, '#fff'); g.restore();
  // face
  const blink = ((t * 1000 + seed * 700) % 3800) < 130, ew = 4.4, eh = blink ? 0.9 : 5.2;
  for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + s * 5.2 + face * 1.6, y - 1.5, ew, eh, 0, 0, 7); g.fill(); if (!blink) disc(g, x + s * 5.2 + face * 3.2, y - 1, 2.1, '#1b1530'); }
  g.fillStyle = '#ff8fa355'; disc(g, x - 9, y + 4, 2.6, '#ff8fa355'); disc(g, x + 9, y + 4, 2.6, '#ff8fa355');
  g.strokeStyle = '#1b1530'; g.lineWidth = 1.5; g.lineCap = 'round'; g.beginPath(); g.arc(x + face * 1.6, y + 3.4, 3, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
  // name plate
  g.font = '800 14px system-ui,sans-serif'; g.textAlign = 'center';
  const w = g.measureText(name).width + 28, py = y - 44 + bob;
  fillRR(g, x - w / 2, py, w, 19, 9.5, '#150f2cd0'); if (me) strokeRR(g, x - w / 2, py, w, 19, 9.5, '#ffe066', 1.4);
  disc(g, x - w / 2 + 9, py + 9.5, 3.6, teamColor); g.fillStyle = me ? '#ffe066' : '#fff'; g.fillText(name, x + 4, py + 14);
  if (busy) { // thinking about a task
    disc(g, x + 17, y - 24, 2, '#fff'); disc(g, x + 22, y - 31, 3, '#fff'); fillRR(g, x + 22, y - 54, 34, 20, 10, '#fff');
    for (let i = 0; i < 3; i++) disc(g, x + 32 + i * 9, y - 44, 2.4, `rgba(80,60,140,${0.35 + 0.65 * ((Math.sin(t * 6 - i) + 1) / 2)})`);
  }
}

// a little puff of dust where somebody has just walked
export function drawDust(g, puffs) {
  for (const p of puffs) { g.save(); g.globalAlpha = Math.max(0, p.life) * 0.5; disc(g, p.x, p.y, 3 + (1 - p.life) * 5, '#fff'); g.restore(); }
}
