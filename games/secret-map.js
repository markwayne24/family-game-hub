import { W, H, R, SPEEDS, AREAS, STATIONS, STATION_RADIUS, step, spawn, roomAt, nearStation, canStand } from './secret-world.js';
import { ROOMS, roomOf, TEAMS } from './secret-data.js';
import { reduceMotion } from './fx.js';

// The live map: a top-down mansion drawn on a canvas, everyone walking at once.
// Everything here lives on this phone. Positions are shared with the others as small, throw-away messages
// (never stored in the game state), a few times a second while someone is moving.

const FLOORS = { hall: '#d9c8a4', door: '#c9b78f', kitchen: '#ffe3c2', library: '#dccbf5', garage: '#d3dbe0', garden: '#cdeccb', vault: '#fff0b3' };
const DECOR = {
  kitchen: [['🧊', 262, 70], ['🍳', 70, 70], ['🥖', 262, 232]], library: [['📚', 535, 70], ['🛋️', 335, 232], ['🕰️', 535, 232]],
  garage: [['🚗', 80, 728], ['🧰', 262, 728], ['🛞', 262, 590]], garden: [['🌳', 535, 590], ['🌷', 335, 590], ['⛲', 535, 728]], vault: [['💎', 262, 362], ['💰', 338, 440]],
  hall: [['🪴', 60, 300], ['🪴', 540, 300], ['🖼️', 150, 500], ['🖼️', 450, 500], ['🕯️', 60, 500], ['🕯️', 540, 500]],
};
const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const SEND_EVERY = 400, KEEPALIVE = 4000;

export function createLiveMap(o) {
  const box = document.createElement('div');
  box.className = 'sm-livemap';
  box.innerHTML = '<canvas class="sm-canvas" aria-label="The mansion. Drag to walk."></canvas><div class="sm-use"><p class="sm-hint"></p><button class="sm-usebtn" disabled></button></div>';
  const cv = box.querySelector('canvas'), g = cv.getContext('2d'), hint = box.querySelector('.sm-hint'), btn = box.querySelector('.sm-usebtn');
  let opt = o, destroyed = false, raf = 0, off = 0, last = performance.now(), t = 0;
  const idx = id => Math.max(0, opt.players.indexOf(id));
  const st = { me: { ...spawn(idx(opt.me), opt.players.length) }, others: {}, input: { dx: 0, dy: 0 }, keys: new Set(), joy: null, near: null, room: null, visited: new Set(), busy: null, face: 1, sentAt: 0, sent: { x: -1, y: -1, b: null }, dirty: true };
  const api = { box, st, opt: () => opt, setInput(dx, dy) { st.input.dx = dx; st.input.dy = dy; }, teleport(x, y) { if (canStand(x, y)) { st.me.x = x; st.me.y = y; st.dirty = true; } }, update, destroy, setBusy };

  function other(id) {
    return (st.others[id] ??= { ...spawn(idx(id), opt.players.length), tx: 0, ty: 0, busy: null, face: 1, init: false });
  }
  const off1 = opt.live.on(({ from, d }) => {
    if (!opt.players.includes(from) || !d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
    const p = other(from);
    const x = Math.max(0, Math.min(W, d.x)), y = Math.max(0, Math.min(H, d.y));
    if (!p.init) { p.x = x; p.y = y; p.init = true; }
    p.tx = x; p.ty = y; p.busy = d.b ?? null; p.seen = performance.now();
  });
  function update(next) { opt = next; paintUse(); }
  function setBusy(room) { st.busy = room; send(true); }

  const send = force => {
    if (!opt.canMove) return;
    const now = performance.now(), me = st.me;
    const moved = Math.abs(me.x - st.sent.x) > 1 || Math.abs(me.y - st.sent.y) > 1 || st.busy !== st.sent.b;
    if (!force && !(moved && now - st.sentAt >= SEND_EVERY) && now - st.sentAt < KEEPALIVE) return;
    st.sentAt = now; st.sent = { x: me.x, y: me.y, b: st.busy };
    opt.live.send({ x: Math.round(me.x), y: Math.round(me.y), b: st.busy });
  };

  /* ---- the "play" button under the map ---- */
  let shown = '';
  function paintUse() {
    const done = st.near && opt.doneRooms.includes(st.near);
    const key = `${st.near}|${done}|${opt.canMove}|${opt.watching}`;
    if (key === shown) return; shown = key;
    if (opt.watching) { hint.textContent = 'Watching the mansion live.'; btn.hidden = true; return; }
    btn.hidden = false;
    if (!opt.canMove) { hint.textContent = '🚔 You are sitting this round out.'; btn.hidden = true; return; }
    if (st.near && !done) { const r = roomOf(st.near); hint.textContent = `You are in the ${r.name}.`; btn.disabled = false; btn.textContent = `${r.emoji} ${r.title}: play!`; }
    else if (st.near) { const r = roomOf(st.near); hint.textContent = `You already finished the ${r.name}.`; btn.disabled = true; btn.textContent = '✅ Done here'; }
    else { hint.textContent = 'Drag on the map (or use the arrow keys) to walk. Step on a glowing pad to play its task.'; btn.disabled = true; btn.textContent = 'Walk to a glowing pad'; }
  }
  btn.addEventListener('click', () => { if (st.near && opt.canMove && !opt.doneRooms.includes(st.near) && !st.busy) opt.onUse(st.near); });

  /* ---- steering: drag on the map, or the keyboard ---- */
  const JOY = 46;
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // The map is picked up and put back whenever the game screen redraws, so the drag is tracked on the whole window.
  cv.addEventListener('pointerdown', e => { if (!opt.canMove) return; e.preventDefault(); const [x, y] = pt(e); st.joy = { id: e.pointerId, ox: x, oy: y, x, y }; });
  const mv = e => { if (st.joy && e.pointerId === st.joy.id) { const [x, y] = pt(e); st.joy.x = x; st.joy.y = y; } };
  const end = e => { if (st.joy && e.pointerId === st.joy.id) { st.joy = null; setTimeout(() => opt.onRelease?.(), 0); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const kd = e => { if (e.target.closest?.('input,textarea,select')) return; const k = KEYS[e.key] && e.key; if (k) { e.preventDefault(); st.keys.add(k); } };
  const ku = e => st.keys.delete(e.key);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const blur = () => st.keys.clear(); addEventListener('blur', blur);
  function steer() {
    let dx = st.input.dx, dy = st.input.dy;
    for (const k of st.keys) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
    if (st.joy) { const vx = st.joy.x - st.joy.ox, vy = st.joy.y - st.joy.oy, l = Math.hypot(vx, vy); if (l > 8) { dx += (vx / Math.max(l, JOY)) * Math.min(1, l / JOY); dy += (vy / Math.max(l, JOY)) * Math.min(1, l / JOY); } }
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    return [dx, dy];
  }

  /* ---- each frame ---- */
  function tick(dt) {
    if (opt.canMove && !st.busy) {
      const [dx, dy] = steer();
      if (dx || dy) { const n = step(st.me, dx, dy, dt, SPEEDS[opt.speed] ?? 1); if (n.x !== st.me.x || n.y !== st.me.y) { st.me = n; st.dirty = true; } if (Math.abs(dx) > 0.2) st.face = dx > 0 ? 1 : -1; }
    }
    const near = nearStation(st.me.x, st.me.y);
    if (near !== st.near) { st.near = near; paintUse(); }
    const room = roomAt(st.me.x, st.me.y);
    if (room !== st.room) { st.room = room; if (room && !st.visited.has(room)) { st.visited.add(room); opt.onVisit?.(room); } }
    const k = 1 - Math.exp(-dt * 10);
    for (const [id, p] of Object.entries(st.others)) {
      if (!p.init) continue;
      const dx = p.tx - p.x; if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1;
      p.x += dx * k; p.y += (p.ty - p.y) * k;
    }
    send(false);
  }

  /* ---- drawing ---- */
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  function who(id) { return { id, name: opt.nameOf(id), team: opt.team[id] }; }
  function drawPlayer(x, y, face, name, team, busy, me) {
    const bob = reduceMotion() ? 0 : Math.sin(t * 9 + x * 0.05) * 1.2;
    g.save(); g.translate(x, y + bob);
    g.fillStyle = '#0003'; g.beginPath(); g.ellipse(0, R * 0.9, R * 0.95, R * 0.4, 0, 0, 7); g.fill();
    g.fillStyle = `hsl(${hue(name)} 70% 55%)`; g.strokeStyle = TEAMS[team]?.color ?? '#fff'; g.lineWidth = 3.2;
    g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(face * 4.4, -2.5, 5.8, 4.6, 0, 0, 7); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(face * 6.6, -2.5, 2.4, 0, 7); g.fill();
    g.restore();
    g.font = '800 17px system-ui,sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#000b'; g.fillStyle = me ? '#ffe066' : '#fff';
    g.strokeText(name, x, y - R - 8); g.fillText(name, x, y - R - 8);
    if (busy) { g.font = '22px system-ui'; g.fillText('💭', x + R + 6, y - R - 22); }
  }
  function draw() {
    const w = cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, devicePixelRatio || 1), ph = Math.round((w * H) / W);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ph * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(ph * dpr); }
    const sc = (w * dpr) / W;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.fillStyle = '#1b1530'; g.fillRect(0, 0, W, H);
    // walls first (every area a little bigger), then floors on top, so touching areas melt into one
    g.fillStyle = '#3a2d5e';
    for (const [x0, y0, x1, y1] of Object.values(AREAS)) { rr(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12, 12); g.fill(); }
    for (const [name, [x0, y0, x1, y1]] of Object.entries(AREAS)) {
      g.fillStyle = FLOORS[name] ?? (name.endsWith('Door') ? FLOORS.door : FLOORS.hall);
      rr(x0, y0, x1 - x0, y1 - y0, 8); g.fill();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.55; g.font = '34px system-ui';
    for (const list of Object.values(DECOR)) for (const [e, x, y] of list) g.fillText(e, x, y);
    g.globalAlpha = 1; g.textBaseline = 'alphabetic';
    // the task pads
    for (const r of ROOMS) {
      const [sx, sy] = STATIONS[r.id], done = opt.doneRooms.includes(r.id), pulse = reduceMotion() ? 0 : Math.sin(t * 3) * 3;
      g.fillStyle = done ? '#2f9e4455' : '#f0b42955'; g.beginPath(); g.arc(sx, sy, STATION_RADIUS * 0.7 + pulse, 0, 7); g.fill();
      g.strokeStyle = done ? '#2f9e44' : '#f0b429'; g.lineWidth = 3; g.setLineDash(done ? [] : [6, 5]); g.beginPath(); g.arc(sx, sy, STATION_RADIUS * 0.7, 0, 7); g.stroke(); g.setLineDash([]);
      g.font = '34px system-ui'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(done ? '✅' : r.emoji, sx, sy); g.textBaseline = 'alphabetic';
      g.font = '800 17px system-ui'; g.fillStyle = '#4a3b00'; g.fillText(r.name, sx, sy + STATION_RADIUS * 0.7 + 22);
    }
    // everybody, back to front
    const list = [];
    for (const id of opt.players) {
      if (id === opt.me) continue;
      const p = st.others[id] ?? other(id);
      list.push({ y: p.y, id, x: p.x, face: p.face, busy: p.busy, me: false });
    }
    if (opt.canMove || opt.players.includes(opt.me)) list.push({ y: st.me.y, id: opt.me, x: st.me.x, face: st.face, busy: st.busy, me: true });
    list.sort((a, b) => a.y - b.y);
    for (const p of list) { const w2 = who(p.id); drawPlayer(p.x, p.y, p.face, w2.name, w2.team, p.busy, p.me); }
    // the on-screen stick
    if (st.joy) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { ox, oy, x, y } = st.joy, vx = x - ox, vy = y - oy, l = Math.hypot(vx, vy), k = l > JOY ? JOY / l : 1;
      g.fillStyle = '#ffffff33'; g.strokeStyle = '#ffffffaa'; g.lineWidth = 2; g.beginPath(); g.arc(ox, oy, JOY, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(ox + vx * k, oy + vy * k, 18, 0, 7); g.fill();
    }
  }
  function frame(now) {
    if (destroyed) return;
    if (!box.isConnected && ++off > 90) { destroy(); return; }
    if (box.isConnected) off = 0;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    tick(dt); draw();
    raf = requestAnimationFrame(frame);
  }
  function destroy() {
    destroyed = true; cancelAnimationFrame(raf); off1();
    removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur);
  }
  paintUse(); send(true);
  raf = requestAnimationFrame(frame);
  return api;
}
