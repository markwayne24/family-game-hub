import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { GAMES } from './games/index.js';

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
const S = { code: null, me: null, isHost: false, channel: null, game: 'lobby', raw: null, state: null };

/* ---------- entry ---------- */

async function start() {
  const room = new URLSearchParams(location.search).get('room');
  if (room) return joinScreen(room.trim().toUpperCase());
  const { data: { session } } = await sb.auth.getSession();
  if (session && !session.user.is_anonymous) return hostHome(session.user);
  loginScreen();
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
const env = () => ({ players: players(), hostId: S.me });
const act = (type, data) => S.channel.send({ type: 'broadcast', event: 'action', payload: { from: S.me, type, data } });

function pushState() {
  const g = GAMES[S.game];
  const state = g ? (g.view ? g.view(S.raw) : S.raw) : null;
  S.channel.send({ type: 'broadcast', event: 'state', payload: { game: S.game, state } });
}

// Runs on the host only; everyone's actions go through here.
function hostHandle(a) {
  if (a.type === 'select') {
    if (a.from !== S.me) return;
    const g = GAMES[a.data?.game];
    S.game = g ? g.id : 'lobby';
    S.raw = g ? g.init(env()) : null;
  } else {
    const g = GAMES[S.game];
    if (!g) return;
    S.raw = g.reduce(S.raw, a, env());
  }
  pushState();
}

function enterRoom(code, name, isHost) {
  S.code = code;
  S.isHost = isHost;
  S.channel = sb.channel(`room:${code}`, { config: { broadcast: { self: true }, presence: { key: S.me } } });
  S.channel
    .on('broadcast', { event: 'action' }, ({ payload }) => { if (S.isHost) hostHandle(payload); })
    .on('broadcast', { event: 'state' }, ({ payload }) => { S.game = payload.game; S.state = payload.state; render(); })
    .on('presence', { event: 'sync' }, render)
    .on('presence', { event: 'join' }, () => { if (S.isHost) pushState(); })
    .subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      await S.channel.track({ name, t: Date.now(), host: isHost });
      if (isHost) pushState();
      render();
    });
  render();
}

function render() {
  if (!S.channel) return;
  const ps = players();
  const hostOnline = ps.some(p => p.host);
  const link = `${location.origin}${location.pathname}?room=${S.code}`;
  const g = GAMES[S.game];

  app.innerHTML = `
    <div class="row">
      <div class="grow"><div class="muted">Room code</div><div class="code">${esc(S.code)}</div></div>
      ${S.isHost ? '<button class="ghost" id="copy">Copy invite link</button>' : ''}
    </div>
    ${hostOnline ? '' : '<div class="banner">The host is offline. Waiting for them to come back…</div>'}
    <div class="card" id="stage"></div>
    ${S.isHost && g ? '<div class="row"><button class="ghost" id="lobby">Back to game list</button></div>' : ''}
    <div class="card"><div class="muted">Players (${ps.length})</div>
      <div class="chips">${ps.map(p => `<span class="chip ${p.id === S.me ? 'me' : ''}">${p.host ? '👑 ' : ''}${esc(p.name)}</span>`).join('')}</div></div>`;

  const stage = app.querySelector('#stage');
  if (g && S.state) {
    g.render(stage, S.state, { me: S.me, isHost: S.isHost, players: ps, nameOf, act, esc });
  } else if (S.isHost) {
    stage.innerHTML = `<h2>Pick a game</h2><div class="games">${Object.values(GAMES).map(x => `<button data-g="${x.id}">${x.emoji}<br>${esc(x.name)}</button>`).join('')}</div>`;
    stage.querySelectorAll('[data-g]').forEach(b => b.onclick = () => act('select', { game: b.dataset.g }));
  } else {
    stage.innerHTML = '<h2>Waiting for the host to pick a game…</h2><p class="muted">Hang tight, this screen updates by itself.</p>';
  }

  app.querySelector('#lobby')?.addEventListener('click', () => act('select', { game: 'lobby' }));
  app.querySelector('#copy')?.addEventListener('click', async e => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied!'; }
    catch { prompt('Copy this link:', link); }
  });
}

start();
