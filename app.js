import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { GAMES } from './games/index.js';
import { parseCustom } from './games/trivia.js';
import { sfx, isMuted, setMuted, unlockAudio } from './games/fx.js';
import { resolveName } from './games/names.js';
import { search, paginate } from './games/list.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => ALPHABET[b % ALPHABET.length]).join('');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// S.raw is the host's full game state; S.state is what everyone (including the host) renders.
const S = { code: null, me: null, isHost: false, channel: null, game: 'lobby', raw: null, state: null, priv: null, timer: null, stageView: null, seen: new Set(), banned: new Set(), memory: {}, baseName: '', name: '', joinedAt: 0, pq: '', ppage: 0, pOpen: false };

/* ---------- entry ---------- */

async function start() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) return joinScreen(room.trim().toUpperCase());
  const { data: { session } } = await sb.auth.getSession();
  if (session && !session.user.is_anonymous) {
    const hosting = params.get('host');
    return hosting ? resumeHost(session.user, hosting.trim().toUpperCase()) : hostHome(session.user);
  }
  loginScreen();
}

// A refreshed host tab goes back to its own room, with the game state it had saved.
async function resumeHost(user, code) {
  S.me = user.id;
  const { data } = await sb.from('rooms').select('code').eq('code', code).maybeSingle();
  if (!data) { history.replaceState(null, '', location.pathname); return hostHome(user); }
  enterRoom(code, store.get('hubName') || 'Host', true);
}

function loginScreen(msg = '') {
  app.innerHTML = `
    <h1>🎲 Family Game Hub</h1>
    <p class="muted">Host sign-in. Guests just open the link they were sent.</p>
    <form class="card" id="f">
      <input name="email" type="email" placeholder="Email" required autocomplete="email">
      <input name="password" type="password" placeholder="Password (min 6 characters)" required minlength="6" autocomplete="current-password">
      <p class="err">${esc(msg)}</p>
      <div class="row"><button type="submit">Sign in</button><button type="button" class="ghost" id="signup">Create account</button></div>
    </form>`;
  const f = app.querySelector('#f');
  const creds = () => ({ email: f.email.value.trim(), password: f.password.value });
  f.onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.auth.signInWithPassword(creds());
    error ? loginScreen(error.message) : hostHome(data.user);
  };
  app.querySelector('#signup').onclick = async () => {
    if (!f.reportValidity()) return;
    const { data, error } = await sb.auth.signUp(creds());
    if (error) return loginScreen(error.message);
    data.session ? hostHome(data.user) : loginScreen('Check your email to confirm, then sign in.');
  };
}

async function hostHome(user, msg = '') {
  S.me = user.id;
  let { data: row } = await sb.from('hosts').select('user_id').maybeSingle();
  if (!row) {
    const { data: claimed } = await sb.rpc('claim_host');
    if (!claimed) {
      app.innerHTML = `<h1>🎲 Family Game Hub</h1><div class="card"><p class="err">This account isn't allowed to host games.</p><button id="out">Sign out</button></div>`;
      app.querySelector('#out').onclick = async () => { await sb.auth.signOut(); loginScreen(); };
      return;
    }
  }
  app.innerHTML = `
    <h1>🎲 Family Game Hub</h1>
    <div class="card">
      <p>Your name in the room</p>
      <input id="name" value="${esc(store.get('hubName') || 'Host')}" maxlength="20">
      <p class="err">${esc(msg)}</p>
      <div class="row"><button id="create">Create a room</button><button class="ghost" id="out">Sign out</button></div>
    </div>`;
  app.querySelector('#out').onclick = async () => { await sb.auth.signOut(); loginScreen(); };
  app.querySelector('#create').onclick = async () => {
    const name = app.querySelector('#name').value.trim() || 'Host';
    store.set('hubName', name);
    for (let tries = 0; tries < 5; tries++) {
      const code = newCode();
      const { error } = await sb.from('rooms').insert({ code, host_id: user.id });
      if (!error) { history.replaceState(null, '', `?host=${code}`); return enterRoom(code, name, true); }
      if (error.code !== '23505') return hostHome(user, error.message);
    }
    hostHome(user, 'Could not create a room. Try again.');
  };
}

async function joinScreen(code, msg = '') {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) await sb.auth.signInAnonymously();
  const { data: ok } = await sb.rpc('room_exists', { room_code: code });
  if (!ok) {
    app.innerHTML = `<h1>🎲 Family Game Hub</h1><div class="card"><p class="err">Room ${esc(code)} was not found.</p></div>`;
    return;
  }
  if ((JSON.parse(store.get('hubKicked') || '[]')).includes(code)) {
    app.innerHTML = `<h1>🎲 Family Game Hub</h1><div class="card"><p class="err">You were removed from room ${esc(code)} by the host.</p></div>`;
    return;
  }
  const last = JSON.parse(store.get('hubLast') || 'null');
  if (last?.code === code && last.name) {
    const { data: { user } } = await sb.auth.getUser();
    if (user) { S.me = user.id; return enterRoom(code, last.name, false); }
  }
  app.innerHTML = `
    <h1>🎲 Join room ${esc(code)}</h1>
    <form class="card" id="f">
      <input name="name" placeholder="Your name" maxlength="20" required value="${esc(store.get('hubName') || '')}">
      <p class="err">${esc(msg)}</p>
      <button type="submit">Join</button>
    </form>`;
  app.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    store.set('hubName', name);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return joinScreen(code, 'Could not sign in as a guest. Try again.');
    store.set('hubLast', JSON.stringify({ code, name }));
    S.me = user.id;
    enterRoom(code, name, false);
  };
}

/* ---------- room ---------- */

function players() {
  const state = S.channel.presenceState();
  return Object.entries(state)
    .map(([id, metas]) => ({ id, ...metas[0] }))
    .sort((a, b) => a.t - b.t);
}
const nameOf = id => players().find(p => p.id === id)?.name ?? '(waiting)';
const env = () => ({ players: players(), hostId: S.me, now: Date.now() });
const act = (type, data) => S.channel.send({ type: 'broadcast', event: 'action', payload: { from: S.me, type, data } });

function pushState() {
  const g = GAMES[S.game];
  const state = g ? (g.view ? g.view(S.raw) : S.raw) : null;
  const priv = g?.priv ? g.priv(S.raw) : undefined;
  S.channel.send({ type: 'broadcast', event: 'state', payload: { game: S.game, state, priv } });
  // Games can ask the room to remember things (e.g. Bingo history) after the host moves on to another game.
  if (g?.remember && S.raw) S.memory[g.id] = g.remember(S.raw);
  store.set(`hubState:${S.code}`, JSON.stringify({ game: S.game, raw: S.raw, memory: S.memory }));
  // Games with a clock (drawing turns, memory flips) ask the host to fire a 'timeout' action when it runs out.
  clearTimeout(S.timer);
  const at = g?.deadline?.(S.raw);
  if (at) S.timer = setTimeout(() => act('timeout'), Math.max(0, at - Date.now()) + 50);
}

// Runs on the host only; everyone's actions go through here.
function hostHandle(a) {
  if (a.type === 'select') {
    if (a.from !== S.me) return;
    const g = GAMES[a.data?.game];
    S.game = g ? g.id : 'lobby';
    S.raw = g ? g.init(env(), { ...a.data, memory: S.memory[g.id] }) : null;
  } else {
    const g = GAMES[S.game];
    if (!g) return;
    S.raw = g.reduce(S.raw, a, env());
  }
  pushState();
}

function enterRoom(code, name, isHost) {
  S.code = code;
  S.baseName = name;
  S.name = name;
  S.joinedAt = Date.now();
  S.isHost = isHost;
  if (isHost) {
    try {
      const saved = JSON.parse(store.get(`hubState:${code}`) || 'null');
      if (saved && GAMES[saved.game]) { S.game = saved.game; S.raw = saved.raw; }
      S.memory = saved?.memory ?? {};
      S.banned = new Set(JSON.parse(store.get(`hubBanned:${code}`) || '[]'));
    } catch { /* start fresh */ }
  }
  keepAwake();
  S.channel = sb.channel(`room:${code}`, { config: { broadcast: { self: true }, presence: { key: S.me } } });
  S.channel
    .on('broadcast', { event: 'action' }, ({ payload }) => { if (S.isHost) hostHandle(payload); })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      S.game = payload.game; S.state = payload.state; S.priv = payload.priv?.[S.me] ?? null;
      render();
    })
    .on('presence', { event: 'sync' }, render)
    .on('broadcast', { event: 'kick' }, ({ payload }) => { if (payload.id === S.me) removedScreen('You were removed from the room by the host.', true); })
    .on('broadcast', { event: 'closed' }, () => { if (!S.isHost) removedScreen('The host closed this room. Thanks for playing!'); })
    .on('presence', { event: 'join' }, ({ key }) => {
      if (!S.isHost) return;
      if (S.banned.has(key)) return kick(key);
      pushState();
    })
    .subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      await S.channel.track({ name: S.name, t: S.joinedAt, host: isHost });
      if (isHost) pushState();
      render();
    });
  render();
}

function buildShell() {
  app.innerHTML = `
    <div class="row">
      <div class="grow"><div class="muted">Room code</div><div class="code">${esc(S.code)}</div></div>
      <button class="ghost" id="mute" aria-label="Sound on/off"></button>
      <button class="ghost" id="copy">Copy invite link</button>
    </div>
    <div class="whoami" id="whoami"></div>
    <div id="banner"></div>
    <div class="card" id="stage"></div>
    <div class="row">
      <button class="ghost" id="lobby">Back to game list</button>
      <button class="ghost danger" id="close">Close room</button>
      <button class="ghost" id="leave">Leave room</button>
    </div>
    <div class="card" id="players">
      <div class="row"><div class="muted grow" id="pcount"></div><button class="ghost small" id="pmore" hidden></button></div>
      <div class="chips" id="chips"></div>
      <div id="pfull" hidden>
        <input id="psearch" type="search" placeholder="Search players…" autocomplete="off" aria-label="Search players">
        <div id="plist"></div>
        <div class="row pager" id="ppager"></div>
      </div>
    </div>`;
  S.stageView = null;
  app.querySelector('#pmore').onclick = () => { S.pOpen = !S.pOpen; S.pq = ''; S.ppage = 0; app.querySelector('#psearch').value = ''; render(); };
  app.querySelector('#psearch').oninput = e => { S.pq = e.target.value; S.ppage = 0; render(); };
  app.querySelector('#lobby').onclick = () => hostHandle({ from: S.me, type: 'select', data: { game: 'lobby' } });
  const mute = app.querySelector('#mute');
  mute.textContent = isMuted() ? '🔇' : '🔊';
  mute.onclick = () => { setMuted(!isMuted()); mute.textContent = isMuted() ? '🔇' : '🔊'; sfx('pop'); };
  app.querySelector('#close').onclick = closeRoom;
  app.querySelector('#leave').onclick = leaveRoom;
  // On phones, open the native share sheet (WhatsApp, Messenger, ...); elsewhere copy the link.
  const copy = app.querySelector('#copy');
  if (navigator.share) copy.textContent = '📤 Share invite';
  copy.onclick = async e => {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Family Game Hub', text: `Join my game room! Code: ${S.code}`, url: link }); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied!'; }
    catch { prompt('Copy this link:', link); }
  };
}

function stopChannel() {
  allowSleep();
  clearTimeout(S.timer);
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = null;
  S.seen = new Set();
  S.stageView = null;
}

function removedScreen(message, kicked = false) {
  if (kicked) store.set('hubKicked', JSON.stringify([...new Set([...JSON.parse(store.get('hubKicked') || '[]'), S.code])]));
  store.set('hubLast', 'null');
  stopChannel();
  app.innerHTML = `<h1>🎲 Family Game Hub</h1><div class="card"><p>${esc(message)}</p></div>`;
}

function kick(id) {
  S.banned.add(id);
  store.set(`hubBanned:${S.code}`, JSON.stringify([...S.banned]));
  S.channel.send({ type: 'broadcast', event: 'kick', payload: { id } });
  // Games that keep absent players in the game for a while (Bingo) should let go of this one now.
  const g = GAMES[S.game];
  if (g?.drop && S.raw) { S.raw = g.drop(S.raw, id); pushState(); }
}

function leaveRoom() {
  const code = S.code;
  store.set('hubLast', 'null');
  stopChannel();
  joinScreen(code);
}

async function closeRoom() {
  if (!confirm('Close this room for everyone? Players will be disconnected.')) return;
  const code = S.code;
  S.channel.send({ type: 'broadcast', event: 'closed', payload: {} });
  await sb.from('rooms').delete().eq('code', code);
  store.set(`hubState:${code}`, 'null');
  store.set(`hubBanned:${code}`, '[]');
  stopChannel();
  history.replaceState(null, '', location.pathname);
  const { data: { user } } = await sb.auth.getUser();
  user ? hostHome(user) : loginScreen();
}

// Phones: keep the screen awake while in a room (the host's phone runs the game, so if it sleeps the game freezes),
// and re-sync when the phone wakes up or the network comes back.
let wake = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { /* unsupported or refused: nothing to do */ }
}
function allowSleep() {
  try { wake?.release(); } catch { /* ignore */ }
  wake = null;
}
function resync() {
  if (!S.channel) return;
  S.channel.track({ name: S.name, t: S.joinedAt, host: S.isHost });
  // Anything sent while we were away is gone, so ask the host for the current game (any action makes it re-send everything).
  if (S.isHost) pushState(); else act('hello');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.channel) { keepAwake(); resync(); }
});
addEventListener('online', resync);

// Small rooms show everyone as chips. Big rooms show the host, you and a few others, with a searchable, paged full list.
const CHIP_LIMIT = 12;
const PAGE_SIZE = 10;

function renderPlayers(ps) {
  const kickBtn = p => (S.isHost && p.id !== S.me ? `<button class="x" data-kick="${esc(p.id)}" title="Remove ${esc(p.name)}" aria-label="Remove ${esc(p.name)}">×</button>` : '');
  const big = ps.length > CHIP_LIMIT;
  if (!big) S.pOpen = false;
  const open = big && S.pOpen;
  const q = app.querySelector('#players');
  q.querySelector('#pcount').textContent = `Players (${ps.length})`;
  const more = q.querySelector('#pmore');
  more.hidden = !big;
  more.textContent = open ? 'Hide list' : `See all ${ps.length}`;
  q.querySelector('#pfull').hidden = !open;

  // Host first, then you, then everyone else in join order.
  const ordered = [...ps].sort((a, b) => (b.host - a.host) || ((b.id === S.me) - (a.id === S.me)));
  const chips = big ? ordered.slice(0, CHIP_LIMIT - 2) : ps;
  const chips_el = q.querySelector('#chips');
  chips_el.hidden = open;
  // Only players who just arrived get the pop-in animation.
  chips_el.innerHTML = chips.map(p =>
    `<span class="chip ${p.id === S.me ? 'me' : ''} ${S.seen.has(p.id) ? '' : 'new'}">${p.host ? '👑 ' : ''}${esc(p.name)}${kickBtn(p)}</span>`).join('')
    + (big ? `<span class="chip">+${ps.length - chips.length} more</span>` : '');

  if (open) {
    const found = search(ordered, S.pq);
    const pg = paginate(found, S.ppage, PAGE_SIZE);
    S.ppage = pg.page;
    q.querySelector('#plist').innerHTML = pg.items.map(p =>
      `<div class="prow"><span>${p.host ? '👑 ' : ''}${esc(p.name)}${p.id === S.me ? ' <small class="muted">(you)</small>' : ''}</span>${kickBtn(p)}</div>`).join('')
      || '<p class="muted">No players match.</p>';
    q.querySelector('#ppager').innerHTML = pg.pages > 1
      ? `<button class="ghost small" data-pg="-1" ${pg.page === 0 ? 'disabled' : ''}>‹ Prev</button><span class="muted">Page ${pg.page + 1} of ${pg.pages} · ${pg.total} players</span><button class="ghost small" data-pg="1" ${pg.page >= pg.pages - 1 ? 'disabled' : ''}>Next ›</button>`
      : `<span class="muted">${pg.total} player${pg.total === 1 ? '' : 's'}</span>`;
    q.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { S.ppage += +b.dataset.pg; render(); });
  }
  q.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => {
    if (confirm(`Remove ${b.title.replace('Remove ', '')} from the room?`)) kick(b.dataset.kick);
  });
}

function pickerHtml() {
  return `<h2>Pick a game</h2>
    <div class="games">${Object.values(GAMES).map(x => `<div class="gcard"><button data-g="${x.id}">${x.emoji}<br>${esc(x.name)}</button>${(x.options ?? []).map(o =>
      `<label class="opt">${esc(o.label)}<select data-opt="${x.id}.${o.key}">${o.choices.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`).join('')}</div>`).join('')}</div>
    <details><summary>Custom trivia questions</summary>
      <p class="muted">One per line: Question | Right answer | Wrong 1 | Wrong 2 | Wrong 3. Leave empty to use the built-in questions.</p>
      <textarea id="custom" rows="6" placeholder="Where did we go on vacation in 2019? | Cebu | Bohol | Davao | Manila"></textarea>
    </details>`;
}

function render() {
  if (!S.channel) return;
  if (!app.querySelector('#stage')) buildShell();
  const ps = players();
  const g = GAMES[S.game];
  const stage = app.querySelector('#stage');

  app.querySelector('#copy').style.display = S.isHost ? '' : 'none';
  app.querySelector('#lobby').style.display = S.isHost && g ? '' : 'none';
  app.querySelector('#close').style.display = S.isHost ? '' : 'none';
  app.querySelector('#leave').style.display = S.isHost ? 'none' : '';
  // Two people with the same name: the later joiner becomes "Name 2". Their join time is kept so seats and turn order don't change.
  const wanted = resolveName(ps, S.me, S.baseName, S.name);
  if (wanted !== S.name) {
    S.name = wanted;
    S.channel.track({ name: S.name, t: S.joinedAt, host: S.isHost });
  }
  const renamed = S.name !== S.baseName ? `<div class="banner">Someone already has the name “${esc(S.baseName)}”, so you appear as “${esc(S.name)}”. The number lets the host tell you apart.</div>` : '';
  // Always show people their own name, as everyone else sees it.
  app.querySelector('#whoami').innerHTML = `${S.isHost ? '👑' : '👤'} You are <b>${esc(S.name)}</b>`;
  app.querySelector('#banner').innerHTML = (ps.some(p => p.host) ? '' : '<div class="banner">The host is offline. Waiting for them to come back…</div>') + renamed;
  renderPlayers(ps);
  if (S.seen.size && ps.some(p => !S.seen.has(p.id) && p.id !== S.me)) sfx('blip');
  ps.forEach(p => S.seen.add(p.id));

  // The picker and waiting screens are built once so typing in the custom-trivia box isn't wiped by joins.
  const view = g && S.state ? g.id : S.isHost ? 'picker' : 'wait';
  if (view !== S.stageView) {
    S.stageView = view;
    stage.innerHTML = '';
    stage._d = null;
    stage._fx = null;
    stage.classList.remove('enter');
    void stage.offsetWidth;
    stage.classList.add('enter');
    if (view === 'picker') {
      stage.innerHTML = pickerHtml();
      const box = stage.querySelector('#custom');
      box.value = store.get('hubCustom') || '';
      box.oninput = () => store.set('hubCustom', box.value);
      // Remember each game's option choices on this device.
      const saved = JSON.parse(store.get('hubOpts') || '{}');
      stage.querySelectorAll('[data-opt]').forEach(sel => {
        if (saved[sel.dataset.opt]) sel.value = saved[sel.dataset.opt];
        sel.onchange = () => { saved[sel.dataset.opt] = sel.value; store.set('hubOpts', JSON.stringify(saved)); };
      });
      stage.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const data = { game: b.dataset.g };
        stage.querySelectorAll(`[data-opt^="${b.dataset.g}."]`).forEach(sel => { data[sel.dataset.opt.split('.')[1]] = sel.value; });
        if (data.game === 'trivia') data.pool = parseCustom(box.value);
        // Handled locally on the host so custom answers never travel over the channel.
        hostHandle({ from: S.me, type: 'select', data });
      });
    } else if (view === 'wait') {
      stage.innerHTML = '<h2>Waiting for the host to pick a game…</h2><p class="muted">Hang tight, this screen updates by itself.</p>';
    }
  }
  if (g && S.state) {
    // `raw` is the host's own full game state; it never leaves the host's browser, so games can keep host-only info there.
    g.render(stage, S.state, { me: S.me, isHost: S.isHost, players: ps, nameOf, act, esc, priv: S.priv, raw: S.isHost ? S.raw : null });
  }
}

document.addEventListener('pointerdown', unlockAudio, { once: true });
start();
