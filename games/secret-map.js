import { W, H, R, SPEEDS, AREAS, STATIONS, STATION_RADIUS, step, spawn, roomAt, nearStation, canStand } from './secret-world.js';
import { ROOMS, roomOf, TEAMS } from './secret-data.js';
import { reduceMotion } from './fx.js';
import { paintMansion, drawPad, drawBuddy, drawDust } from './secret-art.js';

// The live map: a top-down mansion drawn on a canvas, everyone walking at once.
// Everything here lives on this phone. Positions are shared with the others as small, throw-away messages
// (never stored in the game state), a few times a second while someone is moving.

const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const SEND_EVERY = 400, KEEPALIVE = 4000, DWELL_MS = 450;

export function createLiveMap(o) {
  const box = document.createElement('div');
  box.className = 'sm-livemap';
  box.innerHTML = '<div class="sm-cvwrap"><canvas class="sm-canvas" aria-label="The mansion. Drag to walk."></canvas></div><div class="sm-use"><p class="sm-hint"></p><button class="sm-usebtn" disabled></button></div><div class="sm-tagbar" hidden></div>';
  const cv = box.querySelector('canvas'), g = cv.getContext('2d'), hint = box.querySelector('.sm-hint'), btn = box.querySelector('.sm-usebtn'), tagbar = box.querySelector('.sm-tagbar');
  let opt = o, destroyed = false, raf = 0, off = 0, last = performance.now(), t = 0;
  const idx = id => Math.max(0, opt.players.indexOf(id));
  const st = { armed: false, nearSince: 0, me: { ...spawn(idx(opt.me), opt.players.length) }, others: {}, input: { dx: 0, dy: 0 }, keys: new Set(), joy: null, near: null, room: null, visited: new Set(), busy: null, face: 1, sentAt: 0, sent: { x: -1, y: -1, b: null }, dirty: true };
  const api = { box, st, opt: () => opt, setFrozen(v) { st.frozen = !!v; }, setInput(dx, dy) { st.input.dx = dx; st.input.dy = dy; }, teleport(x, y) { if (canStand(x, y)) { st.me.x = x; st.me.y = y; st.dirty = true; } }, update, destroy, setBusy };

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
  function update(next) { opt = next; paintUse(); paintTags(true); }
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
    if (st.near && !done) { const r = roomOf(st.near); hint.textContent = `You are in the ${r.name}. The task opens by itself, or tap the button.`; btn.disabled = false; btn.textContent = `${r.emoji} ${r.title}: play!`; }
    else if (st.near) { const r = roomOf(st.near); hint.textContent = `You already finished the ${r.name}.`; btn.disabled = true; btn.textContent = '✅ Done here'; }
    else { hint.textContent = 'Drag on the map (or use the arrow keys) to walk. Stand on a glowing pad and its task opens.'; btn.disabled = true; btn.textContent = 'Walk to a glowing pad'; }
  }
  btn.addEventListener('click', () => { if (st.near && opt.canMove && !opt.doneRooms.includes(st.near) && !st.busy) opt.onUse(st.near); });

  /* ---- the "check a player" buttons: only people standing close by ---- */
  const NEAR = 120; let shownTags = '';
  const nearIds = () => (opt.canTag ? opt.players.filter(id => id !== opt.me && st.others[id]?.init && Math.hypot(st.others[id].x - st.me.x, st.others[id].y - st.me.y) <= NEAR) : []);
  function paintTags(force) {
    const ids = nearIds(), key = `${opt.canTag}|${ids.join()}`;
    if (!force && key === shownTags) return; shownTags = key;
    tagbar.hidden = !opt.canTag;
    tagbar.innerHTML = opt.canTag ? (ids.length ? `<span class="sm-taghint">🔍 Check who has been where:</span>${ids.map(id => `<button class="sm-tagbtn" data-t="${id}">🔍 ${opt.nameOf(id)}</button>`).join('')}` : '<span class="sm-taghint">🔍 Stand next to a player to check which rooms they have visited. One check per round.</span>') : '';
    tagbar.querySelectorAll('.sm-tagbtn').forEach(b => b.addEventListener('click', () => opt.onTag?.(b.dataset.t)));
  }

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
    if (opt.canMove && !st.busy && !st.frozen) {
      const [dx, dy] = steer();
      if (dx || dy) { const n = step(st.me, dx, dy, dt, SPEEDS[opt.speed] ?? 1); if (n.x !== st.me.x || n.y !== st.me.y) { st.me = n; st.dirty = true; st.moving = true; } else st.moving = false; if (Math.abs(dx) > 0.2) st.face = dx > 0 ? 1 : -1; } else st.moving = false;
    }
    const near = nearStation(st.me.x, st.me.y);
    if (near !== st.near) { st.near = near; st.nearSince = performance.now(); st.armed = true; paintUse(); }
    // standing on a task pad for a moment opens its task, so nobody has to find a button. After closing it you must step off and
    // back on (or tap the button) to open it again, and just walking across a pad does nothing.
    if (st.near && st.armed && opt.canMove && !st.busy && !st.frozen && !opt.doneRooms.includes(st.near) && performance.now() - st.nearSince >= DWELL_MS) { st.armed = false; opt.onUse(st.near); }
    const room = roomAt(st.me.x, st.me.y);
    if (room !== st.room) { st.room = room; if (room && !st.visited.has(room)) { st.visited.add(room); opt.onVisit?.(room); } }
    if (st.frozen || st.busy) st.moving = false;
    if (st.moving) puff(st.me.x, st.me.y);
    const k = 1 - Math.exp(-dt * 10);
    for (const [id, p] of Object.entries(st.others)) {
      if (!p.init) continue;
      const dx = p.tx - p.x; if (Math.abs(dx) > 0.5) p.face = dx > 0 ? 1 : -1;
      p.x += dx * k; p.y += (p.ty - p.y) * k; p.moving = Math.hypot(p.tx - p.x, p.ty - p.y) > 1.5; if (p.moving) puff(p.x, p.y);
    }
    for (const d of dust) d.life -= dt * 2.2;
    while (dust.length && dust[0].life <= 0) dust.shift();
    paintTags(false);
    send(false);
  }

  /* ---- drawing ---- */
  function who(id) { return { id, name: opt.nameOf(id), team: opt.team[id] }; }
  // On the page the map is as wide as the screen; full screen it is as big as fits (the mansion keeps its shape).
  function fit() {
    const full = !!box.closest('.sm-full'), wrap = cv.parentElement;
    if (!full) { if (cv.style.width) { cv.style.width = ''; cv.style.height = ''; wrap.style.flex = ''; } return; }
    const bars = (box.querySelector('.sm-use')?.offsetHeight ?? 0) + (tagbar.offsetHeight ?? 0) + 18;
    const aw = box.clientWidth - 4, ah = box.clientHeight - bars; if (aw <= 0 || ah <= 0) return;
    const k = Math.min(aw / W, ah / H), w = Math.floor(W * k), h = Math.floor(H * k);
    wrap.style.flex = 'none';
    if (cv.style.width !== w + 'px' || cv.style.height !== h + 'px') { cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  }
  // the mansion itself never changes, so it is painted once per screen size and copied every frame
  let bgImg = null, bgKey = '';
  function background(sc) {
    const key = `${cv.width}x${cv.height}`;
    if (bgKey !== key) { bgImg = document.createElement('canvas'); bgImg.width = cv.width; bgImg.height = cv.height; const c = bgImg.getContext('2d'); c.scale(sc, sc); paintMansion(c); bgKey = key; }
    return bgImg;
  }
  const dust = []; let lastDust = 0;
  function puff(x, y) { if (reduceMotion() || t - lastDust < 0.14) return; dust.push({ x: x + (Math.random() - 0.5) * 6, y: y + 12, life: 1 }); lastDust = t; }
  function draw() {
    fit();
    const w = cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, devicePixelRatio || 1), ph = Math.round((w * H) / W);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ph * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(ph * dpr); }
    const sc = (w * dpr) / W;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(background(sc), 0, 0);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    for (const r of ROOMS) drawPad(g, r, { t: reduceMotion() ? 0 : t, done: opt.doneRooms.includes(r.id), near: st.near === r.id, label: r.name });
    drawDust(g, dust);
    // everybody, back to front
    const list = [];
    for (const id of opt.players) {
      if (id === opt.me) continue;
      const p = st.others[id] ?? other(id);
      list.push({ y: p.y, id, x: p.x, face: p.face, busy: p.busy, me: false, moving: !!p.moving });
    }
    if (opt.canMove || opt.players.includes(opt.me)) list.push({ y: st.me.y, id: opt.me, x: st.me.x, face: st.face, busy: st.busy, me: true, moving: !!st.moving });
    list.sort((a, b) => a.y - b.y);
    for (const p of list) { const w2 = who(p.id); drawBuddy(g, { x: p.x, y: p.y, face: p.face, name: w2.name, teamColor: TEAMS[w2.team]?.color ?? '#adb5bd', moving: p.moving, t: reduceMotion() ? 0 : t, busy: p.busy, me: p.me, seed: hue(w2.name) % 7 }); }
    // the on-screen stick
    if (st.joy) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { ox, oy, x, y } = st.joy, vx = x - ox, vy = y - oy, l = Math.hypot(vx, vy), k = l > JOY ? JOY / l : 1;
      g.fillStyle = '#ffffff26'; g.strokeStyle = '#ffffffaa'; g.lineWidth = 2; g.beginPath(); g.arc(ox, oy, JOY, 0, 7); g.fill(); g.stroke();
      const knob = g.createRadialGradient(ox + vx * k - 5, oy + vy * k - 5, 2, ox + vx * k, oy + vy * k, 20); knob.addColorStop(0, '#fff'); knob.addColorStop(1, '#ffffffaa');
      g.fillStyle = knob; g.beginPath(); g.arc(ox + vx * k, oy + vy * k, 18, 0, 7); g.fill();
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
