import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { HOWTO } from './games/howto.js';
import { META, TYPES, playersLabel, fitsGroup } from './games/meta.js';
import { GAMES } from './games/index.js';
import { parseCustom } from './games/trivia.js';
import { sfx, isMuted, setMuted, unlockAudio } from './games/fx.js';
import { keepsFor, keepsHtml, wireKeeps } from './games/keepsakes.js';
import { resolveName } from './games/names.js';
import { search, paginate } from './games/list.js';
import { admit, summary, freeHeld, RESERVE_MS } from './games/capacity.js';
import { lateMode, takePart, watchers, LATE_MODES } from './games/participants.js';
import { supported as cryptoSupported, makeKeys, seal, open as openSealed } from './games/secure.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const BRAND = 'Game Corner';
const app = document.getElementById('app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => ALPHABET[b % ALPHABET.length]).join('');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// S.raw is the host's full game state; S.state is what everyone (including the host) renders.
const S = { code: null, me: null, isHost: false, channel: null, game: 'lobby', raw: null, state: null, priv: null, timer: null, stageView: null, seen: new Set(), banned: new Set(), memory: {}, baseName: '', name: '', joinedAt: 0, pq: '', ppage: 0, pOpen: false,
  maxPlayers: 0, admitted: {}, blocked: new Set(), fullSent: new Map(), room: { max: 0, used: 0, held: 0, full: false }, roomSig: '', limitOpen: false, subscribed: false,
  late: 'auto', participants: null, spectators: new Set(),
  keys: null, stateSeq: 0, sendQ: Promise.resolve(), sealedForMe: null };

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

// Signed-out visitors see the landing page: a few games as a teaser, the rest stay locked until they sign in.
const TEASER = ['werewolf', 'bingo', 'impostor'];

function loginScreen(msg = '') {
  const all = Object.values(GAMES);
  const teaser = TEASER.map(id => GAMES[id]).filter(Boolean);
  const locked = all.length - teaser.length;
  app.innerHTML = `
    <section class="hero">
      <h1>🎲 ${BRAND}</h1>
      <p class="tagline">Party games for the whole barkada. One phone hosts, everyone joins with a link. No app to install.</p>
      <div class="row"><a class="btn" href="#signin">Sign in to play</a><span class="muted">${all.length} games inside</span></div>
    </section>
    <section class="card">
      <h2>What's inside</h2>
      <div class="catalog">${teaser.map(x => gameCardHtml(x)).join('')}${Array.from({ length: Math.min(locked, 3) }, () =>
        '<div class="gtile locked" aria-hidden="true"><span class="gemoji">🔒</span><b>???</b><p class="muted">Sign in to unlock</p></div>').join('')}</div>
      <p class="muted">+${locked} more games, from quick rounds to full Werewolf nights, once you sign in.</p>
    </section>
    <section class="card">
      <h2>How it works</h2>
      <ol class="steps"><li>Sign in with Google or email and create a room.</li><li>Share the invite link. Friends join with just a name.</li><li>Pick a game and play together, in the same room or on a call.</li></ol>
    </section>
    <div class="card auth">
      <h2 id="signin">Sign in or create an account</h2>
      <button type="button" class="google" id="google">${GOOGLE_ICON}<span>Continue with Google</span></button>
      <p class="divider"><span>or use email</span></p>
      <form id="f">
        <input name="email" type="email" placeholder="Email" required autocomplete="email">
        <input name="password" type="password" placeholder="Password (min 8 characters)" required minlength="8" autocomplete="current-password">
        <p class="err" id="ferr">${esc(msg)}</p>
        <p class="muted fine">By continuing you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
        <div class="row"><button type="submit">Sign in</button><button type="button" class="ghost" id="signup">Create account</button></div>
      </form>
    </div>
    ${joinCodeHtml()}
    ${footerHtml()}`;
  bindJoinCode();
  const f = app.querySelector('#f');
  const ferr = app.querySelector('#ferr');
  const busy = on => f.querySelectorAll('button').forEach(b => { b.disabled = on; });
  const creds = () => ({ email: f.email.value.trim(), password: f.password.value });
  app.querySelector('#google').onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL() } });
    if (error) ferr.textContent = error.message; // on success the browser goes to Google and comes back signed in
  };
  f.onsubmit = async e => {
    e.preventDefault();
    busy(true);
    const { data, error } = await sb.auth.signInWithPassword(creds());
    busy(false);
    if (error?.code === 'email_not_confirmed') return verifyScreen(creds().email, 'Your email isn\'t verified yet. Enter the code we sent you.');
    error ? (ferr.textContent = error.message) : hostHome(data.user);
  };
  app.querySelector('#signup').onclick = async () => {
    if (!f.reportValidity()) return;
    busy(true);
    const { data, error } = await sb.auth.signUp({ ...creds(), options: { emailRedirectTo: SITE_URL() } });
    busy(false);
    if (error) return (ferr.textContent = error.message);
    data.session ? hostHome(data.user) : verifyScreen(creds().email);
  };
}

// The address Supabase sends people back to after Google sign-in or the email link.
const SITE_URL = () => location.origin + location.pathname;
const GOOGLE_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

// New email accounts must prove the address is real: Supabase emails a 6-digit code (and a link that does the same).
function verifyScreen(email, msg = '') {
  app.innerHTML = `
    <h1>🎲 ${BRAND}</h1>
    <form class="card" id="v">
      <h2>Check your email</h2>
      <p>We sent a 6-digit code to <b>${esc(email)}</b>. Enter it below, or tap the link in that email.</p>
      <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required>
      <p class="err" id="verr">${esc(msg)}</p>
      <div class="row"><button type="submit">Verify</button><button type="button" class="ghost" id="resend">Resend code</button><button type="button" class="ghost" id="back">Back</button></div>
      <p class="muted">Can't find it? Check your spam folder.</p>
    </form>`;
  const v = app.querySelector('#v');
  const verr = app.querySelector('#verr');
  v.onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.auth.verifyOtp({ email, token: v.code.value.trim(), type: 'email' });
    error ? (verr.textContent = error.message) : hostHome(data.user);
  };
  const resend = app.querySelector('#resend');
  resend.onclick = async () => {
    resend.disabled = true;
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: SITE_URL() } });
    verr.textContent = error ? error.message : 'A new code is on its way.';
    setTimeout(() => { resend.disabled = false; }, 60000); // Supabase only allows one email a minute
  };
  app.querySelector('#back').onclick = () => loginScreen();
}

// Games in the order the home screen lists them (best known first), then any game without details yet.
const orderedGames = () => [...Object.keys(META).map(id => GAMES[id]).filter(Boolean), ...Object.values(GAMES).filter(g => !META[g.id])];

// One game: what it is, who it's for and how long it takes. `how` adds the rules, folded away.
const gameCardHtml = (x, how = false) => {
  const m = META[x.id];
  const facts = m ? `<div class="gfacts"><span>👥 ${playersLabel(m)}</span><span>⏱ ${m.minutes} min</span></div>
      <div class="gtags"><span class="gtag">${TYPES[m.type]}</span>${m.kids ? '<span class="gtag kids">👧 Kid-friendly</span>' : ''}</div>` : '';
  return `<article class="gtile"><div class="ghead"><span class="gemoji">${x.emoji}</span><b>${esc(x.name)}</b></div>
      <p class="gpitch">${esc(m?.pitch ?? HOWTO[x.id]?.goal ?? '')}</p>${facts}
      ${how && HOWTO[x.id] ? `<details class="ghow"><summary>How to play</summary>${howtoHtml(x)}</details>` : ''}</article>`;
};

// Guests with a room code don't need an account: joining a room signs them in anonymously.
const joinCodeHtml = () => `<form class="card" id="jc">
    <h2>Got a room code?</h2>
    <div class="row"><input class="grow" name="code" placeholder="e.g. K7Q2M" maxlength="5" autocapitalize="characters" autocomplete="off" required><button type="submit">Join</button></div>
  </form>`;
function bindJoinCode() {
  app.querySelector('#jc').onsubmit = e => {
    e.preventDefault();
    const code = e.target.code.value.trim().toUpperCase();
    if (!code) return;
    location.search = `?room=${encodeURIComponent(code)}`;
  };
}

// Signed-in home: every game with its details, filtered by group size and type.
const GROUPS = [['any', 'Any size'], ['1', 'Just me'], ['2', '2'], ['3', '3–4'], ['5', '5+']];
const catalogHtml = () => `<section class="card" id="catalog">
    <h2>Pick a game</h2>
    <p class="muted">${Object.keys(GAMES).length} games. Choose one after you create a room. Tap "How to play" for the rules.</p>
    <div class="filters">
      <div class="chips" role="group" aria-label="How many are playing?"><span class="flabel">👥 Playing</span>${GROUPS.map(([v, l]) => `<button class="chip pick" data-group="${v}">${l}</button>`).join('')}</div>
      <div class="chips" role="group" aria-label="Type of game"><span class="flabel">🎲 Type</span><button class="chip pick" data-type="any">All</button>${Object.entries(TYPES).map(([v, l]) => `<button class="chip pick" data-type="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="catalog" id="glist"></div>
  </section>`;
function bindCatalog() {
  const f = { group: store.get('hubGroup') || 'any', type: store.get('hubType') || 'any' };
  const draw = () => {
    const list = orderedGames().filter(x => {
      const m = META[x.id];
      if (!m) return f.group === 'any' && f.type === 'any';
      return (f.group === 'any' || fitsGroup(m, +f.group)) && (f.type === 'any' || m.type === f.type);
    });
    app.querySelector('#glist').innerHTML = list.map(x => gameCardHtml(x, true)).join('')
      || '<p class="muted">No game matches. Try another group size or type.</p>';
    app.querySelectorAll('[data-group]').forEach(b => b.setAttribute('aria-pressed', b.dataset.group === f.group));
    app.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === f.type));
  };
  app.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { f.group = b.dataset.group; store.set('hubGroup', f.group); draw(); });
  app.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { f.type = b.dataset.type; store.set('hubType', f.type); draw(); });
  draw();
}

// Every home screen ends with these links (Google sign-in requires the privacy policy to be linked from the home page).
const footerHtml = () => `<footer class="site-foot"><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="mailto:mwpulido24@gmail.com">Contact</a></footer>`;

// Top of the signed-in home: who you are and a clear way out.
const accountBarHtml = user => `<div class="account"><span class="muted">Signed in as</span> <b>${esc(user.email || 'your account')}</b><button class="ghost small" id="out">Sign out</button></div>`;
async function signOut() {
  await sb.auth.signOut();
  history.replaceState(null, '', location.pathname);
  loginScreen();
}

async function hostHome(user, msg = '') {
  S.me = user.id;
  let { data: row } = await sb.from('hosts').select('user_id').maybeSingle();
  if (!row) {
    const { data: claimed } = await sb.rpc('claim_host');
    if (!claimed) {
      app.innerHTML = `${accountBarHtml(user)}<h1>🎲 ${BRAND}</h1>
        <div class="card"><p class="err">Could not set up hosting for this account. Try signing out and in again.</p></div>
        ${joinCodeHtml()}${catalogHtml()}${footerHtml()}`;
      bindJoinCode();
      bindCatalog();
      app.querySelector('#out').onclick = signOut;
      return;
    }
  }
  app.innerHTML = `
    ${accountBarHtml(user)}
    <h1>🎲 ${BRAND}</h1>
    <section class="card start">
      <h2>Start a game night</h2>
      <ol class="steps"><li>Create a room.</li><li>Share the invite link. Friends join with just a name, no account needed.</li><li>Pick a game from the room.</li></ol>
      <label class="field">Your name in the room<input id="name" value="${esc(store.get('hubName') || 'Host')}" maxlength="20"></label>
      <p class="err">${esc(msg)}</p>
      <button id="create" class="wide">Create a room</button>
      <p class="muted or">Joining a friend's game instead?</p>
      <form id="jc" class="row"><input class="grow" name="code" placeholder="Room code, e.g. K7Q2M" maxlength="5" autocapitalize="characters" autocomplete="off" required aria-label="Room code"><button type="submit" class="ghost">Join</button></form>
    </section>
    ${catalogHtml()}
    ${footerHtml()}`;
  bindJoinCode();
  bindCatalog();
  app.querySelector('#out').onclick = signOut;
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
    const keeps = keepsFor(code);
    app.innerHTML = `<h1>🎲 ${BRAND}</h1><div class="card"><p class="err">Room ${esc(code)} was not found.</p>${keeps.length ? '<p class="muted">It may have been closed, but what you drew is still saved on this phone.</p>' : ''}</div>${keepsHtml(keeps)}`;
    wireKeeps(app, keeps);
    return;
  }
  if ((JSON.parse(store.get('hubKicked') || '[]')).includes(code)) {
    app.innerHTML = `<h1>🎲 ${BRAND}</h1><div class="card"><p class="err">You were removed from room ${esc(code)} by the host.</p></div>`;
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

function connected() {
  const state = S.channel.presenceState();
  return Object.entries(state)
    .map(([id, metas]) => ({ id, ...metas[0] }))
    .sort((a, b) => a.t - b.t);
}
// Everyone who counts as being in the room. The host leaves out people it has turned away because the room is full.
function players() {
  const all = connected();
  return S.blocked.size ? all.filter(p => !S.blocked.has(p.id)) : all;
}
const nameOf = id => players().find(p => p.id === id)?.name ?? '(waiting)';
// Games only see the people taking part; people watching a game in progress are left out until the next one.
const participating = () => (S.spectators.size ? players().filter(p => !S.spectators.has(p.id)) : players());
const env = () => ({ players: participating(), hostId: S.me, now: Date.now() });
// What we tell the room about ourselves. `pk` is our public key, so the host can send us private messages.
const meta = () => ({ name: S.name, t: S.joinedAt, host: S.isHost, pk: S.keys?.publicJwk });
// Fast, throw-away updates that don't belong in the game state (like where people are walking). Games get this as ui.live.
const liveFns = new Set();
const live = {
  send: d => { try { S.channel?.send({ type: 'broadcast', event: 'live', payload: { from: S.me, d } }); } catch { /* not connected */ } },
  on: fn => { liveFns.add(fn); return () => liveFns.delete(fn); },
};

// The host's own actions go straight to the game, so choices only the host makes (like which player is the
// secret millionaire) never travel over the room's shared channel where guests could read them.
const act = (type, data) => {
  const payload = { from: S.me, type, data };
  if (S.isHost && S.subscribed) return hostHandle(payload);
  return S.channel.send({ type: 'broadcast', event: 'action', payload });
};

// Decrypt the private message addressed to us, using the host's public key from the room.
async function openPrivate() {
  const seq = ++S.stateSeq;
  const hostKey = connected().find(p => p.host)?.pk;
  if (!S.keys || !hostKey || !S.sealedForMe) { render(); return; } // retried when the host's key shows up
  const value = await openSealed(S.keys.privateKey, hostKey, S.sealedForMe);
  if (seq !== S.stateSeq) return; // a newer message has arrived since
  S.priv = value;
  render();
}

// Seal each player's private information so only they can read it. A player we have no key for gets nothing until they announce one.
async function sealFor(entries) {
  const keys = new Map(connected().map(p => [p.id, p.pk]));
  const out = {};
  for (const [id, value] of entries) {
    const pk = keys.get(id);
    if (S.keys && pk) out[id] = await seal(S.keys.privateKey, pk, value);
  }
  return out;
}

function pushState() {
  const g = GAMES[S.game];
  const state = g ? (g.view ? g.view(S.raw) : S.raw) : null;
  const privMap = g?.priv && S.raw != null ? g.priv(S.raw) : undefined;
  S.priv = privMap?.[S.me] ?? null; // the host's own secrets never leave this phone
  const others = privMap ? Object.entries(privMap).filter(([id]) => id !== S.me) : [];
  const game = S.game;
  const room = S.room;
  // sent in order, because sealing takes a moment and a later state must never overtake an earlier one
  S.sendQ = S.sendQ.then(async () => {
    const priv = others.length ? await sealFor(others) : undefined;
    S.channel?.send({ type: 'broadcast', event: 'state', payload: { game, state, priv, room } });
  }).catch(err => console.warn('could not send state', err));
  // Games can ask the room to remember things (e.g. Bingo history) after the host moves on to another game.
  if (g?.remember && S.raw) S.memory[g.id] = g.remember(S.raw);
  store.set(`hubState:${S.code}`, JSON.stringify({ game: S.game, raw: S.raw, memory: S.memory, limit: S.maxPlayers, admitted: S.admitted, late: S.late, parts: S.participants ? [...S.participants] : null }));
  // Games with a clock (drawing turns, memory flips) ask the host to fire a 'timeout' action when it runs out.
  clearTimeout(S.timer);
  const at = g?.deadline?.(S.raw);
  if (at) S.timer = setTimeout(() => act('timeout'), Math.max(0, at - Date.now()) + 50);
}

// Games that care about who is still connected (Werewolf) get a 'presence' check from the host, a moment after people come and go.
function watchPresence() {
  clearTimeout(S.presT);
  S.presT = setTimeout(() => {
    const g = GAMES[S.game];
    if (!g?.reduce || S.raw == null || !S.subscribed || !g.watchPresence) return;
    const next = g.reduce(S.raw, { from: S.me, type: 'presence' }, env());
    if (next !== S.raw) { S.raw = next; pushState(); }
  }, 1500);
}

// Runs on the host only; everyone's actions go through here.
function hostHandle(a) {
  if (S.spectators.has(a.from) && a.type !== 'hello') return; // people watching can't act until the next game
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
      S.maxPlayers = saved?.limit ?? 0;
      S.admitted = saved?.admitted ?? {};
      S.late = saved?.late ?? 'auto';
      S.participants = saved?.parts ? new Set(saved.parts) : null;
      S.banned = new Set(JSON.parse(store.get(`hubBanned:${code}`) || '[]'));
    } catch { /* start fresh */ }
  }
  keepAwake();
  S.channel = sb.channel(`room:${code}`, { config: { broadcast: { self: true }, presence: { key: S.me } } });
  S.channel
    .on('broadcast', { event: 'action' }, ({ payload }) => { if (S.isHost) hostHandle(payload); })
    .on('broadcast', { event: 'live' }, ({ payload }) => { if (payload?.from !== S.me) liveFns.forEach(f => f(payload)); })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      S.game = payload.game; S.state = payload.state;
      if (payload.room && !S.isHost) S.room = payload.room;
      if (S.isHost) { render(); return; } // the host already has its own secrets
      S.sealedForMe = payload.priv?.[S.me] ?? null;
      S.priv = null;
      if (!S.sealedForMe) { S.stateSeq++; render(); return; }
      openPrivate(); // render once it has been decrypted, so an old secret never flashes
    })
    .on('presence', { event: 'sync' }, () => { if (S.sealedForMe && S.priv === null) openPrivate(); if (S.isHost) watchPresence(); render(); })
    .on('broadcast', { event: 'kick' }, ({ payload }) => { if (payload.id === S.me) removedScreen('You were removed from the room by the host.', true); })
    .on('broadcast', { event: 'full' }, ({ payload }) => { if (payload.id === S.me) fullScreen(payload.max); })
    .on('broadcast', { event: 'closed' }, () => { if (!S.isHost) removedScreen('The host closed this room. Thanks for playing!'); })
    .on('presence', { event: 'join' }, ({ key }) => {
      if (!S.isHost) return;
      if (S.banned.has(key)) return kick(key);
      pushState();
    })
    .subscribe(async status => {
      if (status !== 'SUBSCRIBED') return;
      S.subscribed = true;
      if (!S.keys && cryptoSupported()) S.keys = await makeKeys();
      await S.channel.track(meta());
      if (isHost) pushState();
      render();
    });
  render();
}

function buildShell() {
  app.innerHTML = `
    <div id="topbar">
      <div class="topcode" title="Room code"><span class="muted">Room</span> <b class="code">${esc(S.code)}</b></div>
      <div class="grow"></div>
      <button class="ghost icon" id="mute" aria-label="Sound on/off"></button>
      <button class="ghost icon" id="gear" aria-label="Menu" aria-expanded="false">⚙</button>
    </div>
    <div id="menuback" hidden></div>
    <div id="menu" hidden role="dialog" aria-label="Room menu">
      <div class="row"><h3 class="grow" style="margin:0">⚙ Menu</h3><button class="ghost small" id="menuclose" aria-label="Close menu">✕</button></div>
      <div id="hostmenu">
        <button class="ghost wide" id="copy">Copy invite link</button>
        <button class="ghost wide" id="lobby">Back to game list</button>
        <div id="limitpanel">
          <h4 class="sethead">Player limit</h4>
          <p class="muted" style="margin:0 0 6px">Most players allowed in this room (you count as one). Players already in are never removed.</p>
          <div class="chips presets">${[0, 4, 6, 8, 10, 12, 15, 20, 30, 50].map(n => `<button class="chip pick" data-limit="${n}">${n ? n : 'No limit'}</button>`).join('')}</div>
          <div class="row"><input id="limitnum" type="number" min="2" max="500" inputmode="numeric" placeholder="Other number" aria-label="Other player limit"><button class="ghost" id="limitset">Set</button></div>
          <p class="muted" id="limitnote"></p>
          <button class="ghost small" id="freeheld" hidden>Free the held seats now</button>
          <h4 class="sethead">People who join during a game</h4>
          <div class="chips presets">${Object.entries(LATE_MODES).map(([k, label]) => `<button class="chip pick" data-late="${k}">${label}</button>`).join('')}</div>
          <p class="muted" id="latenote"></p>
          <button class="ghost small" id="letin" hidden>Let the watchers join now</button>
        </div>
        <button class="ghost danger wide" id="close">Close room</button>
        <button class="ghost wide" id="signout">Sign out</button>
      </div>
      <div id="guestmenu"><button class="ghost wide" id="leave">Leave room</button></div>
    </div>
    <div class="metarow"><div class="whoami" id="whoami"></div><div class="total" id="total" aria-live="polite"></div></div>
    <div id="banner"></div>
    <div id="howto"></div>
    <div class="card" id="stage"></div>
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
  S.menuOpen = false;
  // The menu holds every host control; it drops down under the fixed bar and closes after any choice.
  const setMenu = open => {
    S.menuOpen = open;
    app.querySelector('#menu').hidden = !open;
    app.querySelector('#menuback').hidden = !open;
    app.querySelector('#gear').setAttribute('aria-expanded', open);
    if (open) render();
  };
  app.querySelector('#gear').onclick = () => setMenu(!S.menuOpen);
  app.querySelector('#menuclose').onclick = () => setMenu(false);
  app.querySelector('#menuback').onclick = () => setMenu(false);
  for (const id of ['#lobby', '#close', '#leave', '#signout']) app.querySelector(id).addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.menuOpen) setMenu(false); });
  app.querySelectorAll('[data-limit]').forEach(b => b.onclick = () => setLimit(+b.dataset.limit));
  app.querySelectorAll('[data-late]').forEach(b => b.onclick = () => setLate(b.dataset.late));
  app.querySelector('#letin').onclick = letWatchersIn;
  app.querySelector('#limitset').onclick = () => {
    const n = Math.floor(+app.querySelector('#limitnum').value);
    if (n >= 2 && n <= 500) { setLimit(n); app.querySelector('#limitnum').value = ''; }
    else app.querySelector('#limitnote').textContent = 'Pick a number from 2 to 500.';
  };
  app.querySelector('#freeheld').onclick = () => { S.admitted = freeHeld(S.admitted, connected()); S.roomSig = ''; enforceLimit(); render(); };
  app.querySelector('#pmore').onclick = () => { S.pOpen = !S.pOpen; S.pq = ''; S.ppage = 0; app.querySelector('#psearch').value = ''; render(); };
  app.querySelector('#psearch').oninput = e => { S.pq = e.target.value; S.ppage = 0; render(); };
  app.querySelector('#lobby').onclick = () => hostHandle({ from: S.me, type: 'select', data: { game: 'lobby' } });
  const mute = app.querySelector('#mute');
  mute.textContent = isMuted() ? '🔇' : '🔊';
  mute.onclick = () => { setMuted(!isMuted()); mute.textContent = isMuted() ? '🔇' : '🔊'; sfx('pop'); };
  app.querySelector('#close').onclick = () => closeRoom();
  app.querySelector('#signout').onclick = () => closeRoom({ signOut: true });
  app.querySelector('#leave').onclick = leaveRoom;
  // On phones, open the native share sheet (WhatsApp, Messenger, ...); elsewhere copy the link.
  const copy = app.querySelector('#copy');
  if (navigator.share) copy.textContent = '📤 Share invite';
  copy.onclick = async e => {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: BRAND, text: `Join my game room! Code: ${S.code}`, url: link }); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied!'; }
    catch { prompt('Copy this link:', link); }
  };
}

function stopChannel() {
  allowSleep();
  S.keys = null; S.sealedForMe = null; S.priv = null; // a fresh key next time
  S.subscribed = false;
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
  const keeps = kicked ? [] : keepsFor(S.code);
  app.innerHTML = `<h1>🎲 ${BRAND}</h1><div class="card"><p>${esc(message)}</p></div>${keepsHtml(keeps)}`;
  wireKeeps(app, keeps);
}

function fullScreen(max) {
  const code = S.code;
  stopChannel();
  app.innerHTML = `<h1>🎲 ${BRAND}</h1><div class="card"><h2>🚪 This room is full</h2>
    <p>The host set a limit of <b>${esc(max)}</b> players, and every seat is taken. Ask the host to make room, then try again.</p>
    <button id="retry">Try again</button></div>`;
  app.querySelector('#retry').onclick = () => joinScreen(code);
}

// Host only: decide who gets a seat, tell everyone else the room is full, and keep the totals up to date.
function enforceLimit() {
  const all = connected();
  const { admitted, full } = admit(S.admitted, all, S.maxPlayers, Date.now());
  S.admitted = admitted;
  S.blocked = new Set(full);
  const now = Date.now();
  for (const id of full) {
    if ((S.fullSent.get(id) ?? 0) + 4000 < now) { // keep telling them until they have left
      S.fullSent.set(id, now);
      S.channel.send({ type: 'broadcast', event: 'full', payload: { id, max: S.maxPlayers } });
    }
  }
  refreshParticipants();
  S.room = { ...summary(S.admitted, players(), S.maxPlayers), watching: [...S.spectators], late: S.late };
  const sig = `${S.room.max}/${S.room.used}/${S.room.held}/${players().length}/${S.late}/${[...S.spectators].sort().join(',')}`;
  if (sig !== S.roomSig) { S.roomSig = sig; pushState(); } // everyone's totals changed
}

// While a game is running, people who arrived after it began watch (if the setting says so). Everyone present when it began,
// plus anyone who only dropped out for a moment, is a player. Outside a running game nobody is held back.
function refreshParticipants() {
  const g = GAMES[S.game];
  const running = !!(g && S.raw && g.inProgress?.(S.raw));
  if (!running || lateMode(S.late, g) === 'join') { S.participants = null; S.spectators = new Set(); return; }
  const here = connected().filter(p => !S.blocked.has(p.id));
  S.participants ??= takePart(S.admitted, here.map(p => p.id), S.me, Date.now(), RESERVE_MS);
  S.spectators = new Set(watchers(S.participants, here));
}

function setLate(mode) {
  if (!LATE_MODES[mode]) return;
  S.late = mode;
  enforceLimit();
  pushState();
  render();
}

// The host lets everyone who is watching take part right now.
function letWatchersIn() {
  S.participants = takePart(S.admitted, connected().map(p => p.id), S.me, Date.now(), RESERVE_MS);
  S.roomSig = '';
  enforceLimit();
  render();
}

function setLimit(n) {
  S.maxPlayers = n;
  S.fullSent.clear();
  enforceLimit();
  pushState();
  render();
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

// Signing out from inside a room closes it first: the host's phone runs the game, so the room can't outlive the host.
async function closeRoom({ signOut: andSignOut = false } = {}) {
  const ask = andSignOut ? 'Sign out? This closes the room for everyone and disconnects the players.' : 'Close this room for everyone? Players will be disconnected.';
  if (!confirm(ask)) return;
  const code = S.code;
  S.channel.send({ type: 'broadcast', event: 'closed', payload: {} });
  await sb.from('rooms').delete().eq('code', code);
  store.set(`hubState:${code}`, 'null');
  store.set(`hubBanned:${code}`, '[]');
  stopChannel();
  history.replaceState(null, '', location.pathname);
  if (andSignOut) return signOut();
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
  S.channel.track(meta());
  // Anything sent while we were away is gone, so ask the host for the current game (any action makes it re-send everything).
  if (S.isHost) pushState(); else act('hello');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.channel) { keepAwake(); resync(); }
});
addEventListener('online', resync);

// "👥 7 / 10 players" for everyone, plus the host's controls for the limit.
function renderTotals(ps) {
  const room = S.room;
  const n = ps.length;
  const spots = room.max ? Math.max(0, room.max - room.used) : 0;
  const total = app.querySelector('#total');
  total.innerHTML = `👥 <b>${n}${room.max ? ` / ${room.max}` : ''}</b> player${n === 1 ? '' : 's'}${
    room.max ? (room.full ? ' · <span class="fullflag">Room full</span>' : ` · ${spots} spot${spots === 1 ? '' : 's'} left`) : ''}${
    room.watching?.length ? ` · 👀 ${room.watching.length} watching` : ''}`;
  total.title = room.held ? `${room.held} seat${room.held === 1 ? ' is' : 's are'} held for players who dropped out` : '';

  const panel = app.querySelector('#limitpanel');
  if (S.isHost && S.menuOpen) {
    app.querySelectorAll('[data-limit]').forEach(b => b.classList.toggle('sel', +b.dataset.limit === S.maxPlayers));
    const over = S.maxPlayers && room.used > S.maxPlayers;
    app.querySelector('#limitnote').textContent = `${room.used} seat${room.used === 1 ? '' : 's'} in use${room.held ? `, ${room.held} held for players who dropped out` : ''}.${over ? ' Already over the limit: it only blocks new players.' : ''}`;
    app.querySelector('#freeheld').hidden = !room.held;
    app.querySelectorAll('[data-late]').forEach(b => b.classList.toggle('sel', b.dataset.late === S.late));
    const watching = room.watching?.length ?? 0;
    app.querySelector('#latenote').textContent = {
      auto: 'Automatic: Bingo makes newcomers watch until the next game (their card would start with every called number marked). The other games let them join in.',
      watch: 'Newcomers watch until the next game, in every game.',
      join: 'Newcomers always join in, even in Bingo.',
    }[S.late] + (watching ? ` ${watching} ${watching === 1 ? 'person is' : 'people are'} watching right now.` : '');
    app.querySelector('#letin').hidden = !watching;
  }
}

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

const howtoHtml = x => {
  const h = HOWTO[x.id];
  if (!h) return '';
  return `<div class="howbody"><p><b>🎯 Goal:</b> ${esc(h.goal)}</p><ol>${h.steps.map(l => `<li>${esc(l)}</li>`).join('')}</ol>${(h.tips ?? []).map(l => `<p class="muted">💡 ${esc(l)}</p>`).join('')}</div>`;
};

function pickerHtml() {
  return `<h2>Pick a game</h2>
    <div class="games">${Object.values(GAMES).map(x => `<div class="gcard"><button data-g="${x.id}">${x.emoji}<br>${esc(x.name)}</button>${(x.options ?? []).map(o =>
      `<label class="opt">${esc(o.label)}<select data-opt="${x.id}.${o.key}">${o.choices.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`).join('')}</div>`).join('')}</div>
    <details class="howto"><summary>❓ How do the games work?</summary>${Object.values(GAMES).map(x => `<details><summary>${x.emoji} ${esc(x.name)}</summary>${howtoHtml(x)}</details>`).join('')}</details>
    <details><summary>Custom trivia questions</summary>
      <p class="muted">One per line: Question | Right answer | Wrong 1 | Wrong 2 | Wrong 3. Leave empty to use the built-in questions.</p>
      <textarea id="custom" rows="6" placeholder="Where did we go on vacation in 2019? | Cebu | Bohol | Davao | Manila"></textarea>
    </details>`;
}

function render() {
  if (!S.channel) return;
  if (!app.querySelector('#stage')) buildShell();
  if (S.isHost && S.subscribed) enforceLimit();
  const ps = players();
  const g = GAMES[S.game];
  const stage = app.querySelector('#stage');

  app.querySelector('#hostmenu').hidden = !S.isHost;
  app.querySelector('#guestmenu').hidden = S.isHost;
  app.querySelector('#lobby').style.display = S.isHost && g ? '' : 'none';
  // Two people with the same name: the later joiner becomes "Name 2". Their join time is kept so seats and turn order don't change.
  const wanted = resolveName(ps, S.me, S.baseName, S.name);
  if (wanted !== S.name) {
    S.name = wanted;
    S.channel.track(meta());
  }
  const watching = new Set(S.room.watching ?? []);
  const spectator = !S.isHost && watching.has(S.me);
  const watchNote = spectator ? '<div class="banner watch">👀 A game is already in progress, so you\'re watching. You\'ll join the next one!</div>' : '';
  const renamed = S.name !== S.baseName ? `<div class="banner">Someone already has the name “${esc(S.baseName)}”, so you appear as “${esc(S.name)}”. The number lets the host tell you apart.</div>` : '';
  // Always show people their own name, as everyone else sees it.
  app.querySelector('#whoami').innerHTML = `${S.isHost ? '👑' : '👤'} You are <b>${esc(S.name)}</b>`;
  const hostGone = !S.isHost && !ps.some(p => p.host);
  const keeps = hostGone ? keepsFor(S.code) : [];
  app.querySelector('#banner').innerHTML = (hostGone ? '<div class="banner">The host is offline. Waiting for them to come back…</div>' : '') + renamed + watchNote + keepsHtml(keeps, '🎁 Your saved draw');
  wireKeeps(app.querySelector('#banner'), keeps);
  renderTotals(ps);
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
    stage.classList.remove('enter', 'wwstage', 'impstage', 'bnstage', 'smstage');
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
  // Instructions for the current game, open the first time this device sees that game.
  const howto = app.querySelector('#howto');
  const hid = g && S.state ? g.id : '';
  if (howto.dataset.id !== hid) {
    howto.dataset.id = hid;
    const seen = JSON.parse(store.get('hubHow') || '{}');
    howto.innerHTML = hid ? `<details class="howto card"${seen[hid] ? '' : ' open'}><summary>❓ How to play ${esc(g.name)}</summary>${howtoHtml(g)}<button class="ghost wide" data-gotit>Got it, let's play</button></details>` : '';
    howto.querySelector('[data-gotit]')?.addEventListener('click', () => { howto.querySelector('details').open = false; });
    howto.querySelector('details')?.addEventListener('toggle', () => {
      const m = JSON.parse(store.get('hubHow') || '{}');
      if (!howto.querySelector('details').open) { m[hid] = 1; store.set('hubHow', JSON.stringify(m)); }
    });
  }
  stage.classList.toggle('spectating', spectator);
  if (g && S.state) {
    // `raw` is the host's own full game state; it never leaves the host's browser, so games can keep host-only info there.
    g.render(stage, S.state, { me: S.me, isHost: S.isHost, players: ps.filter(p => !watching.has(p.id)), watching: ps.filter(p => watching.has(p.id)), spectator, nameOf, act, live, esc, room: S.code, priv: S.priv, raw: S.isHost ? S.raw : null });
  }
}

document.addEventListener('pointerdown', unlockAudio, { once: true });
start();
