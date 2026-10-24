import { sfx, confetti, reduceMotion } from './fx.js';
import { BATTLES, TEAMS } from './secret-data.js';
import { QUIZ } from './secret-tasks.js';

// Team battles, played full screen on every player's phone at the same moment. The rules and the scoring live in secret.js;
// this is only what people see and tap. Live progress travels as small throw-away messages (ui.live), the final score as one action.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(e); });
const rnd = n => Math.floor(Math.random() * n);

// everyone gets the same questions: a seeded shuffle of the bank
const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function battleQuestions(seed, level, n = 5) {
  const r = mulberry(seed), pool = [...QUIZ[level], ...(level ? QUIZ[level - 1] : QUIZ[1].slice(0, 3))];
  const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n).map(([q, ok, ...bad]) => { const opts = [ok, ...bad]; for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; } return { q, ok, opts }; });
}

// the same sums for everybody, from the same seed
export function mathQuestion(r, level) {
  const t = Math.floor(r() * 3), big = [1, 1.6, 2.4][level] ?? 1, a = 3 + Math.floor(r() * 9 * big), b = 2 + Math.floor(r() * 7 * big);
  const [q, ans] = t === 0 ? [`${a} + ${b}`, a + b] : t === 1 ? [`${a + b} − ${b}`, a] : [`${2 + Math.floor(r() * 7)} × ${2 + Math.floor(r() * 6)}`, 0];
  let ok = ans; if (t === 2) { const [x, y] = q.split(' × ').map(Number); ok = x * y; }
  const set = new Set([ok]); while (set.size < 4) set.add(Math.max(0, ok + Math.floor(r() * 11) - 5));
  const opts = [...set]; for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { q, ok, opts };
}

// Team averages from the live numbers (a missing number counts as zero, or nothing at all for reflex).
export function liveAverages(s, live, kind) {
  return [0, 1].map(t => {
    const ids = s.players.filter(id => s.team[id] === t);
    if (!ids.length) return 0;
    if (BATTLES[kind].lower) { const v = ids.map(id => live[id]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; }
    return Math.round((ids.reduce((a, id) => a + (live[id] ?? 0), 0) / ids.length) * 10) / 10;
  });
}

export function openBattle({ s, ui, anchor, nm, myTeam, level }) {
  const b = s.battle, K = BATTLES[b.kind], intro = b.playFrom - b.startAt, dur = b.endAt - b.playFrom;
  const live = {}; let mine = b.kind === 'reflex' ? null : 0, over = false;
  const timers = []; const at = (ms, fn) => { const h = setTimeout(() => { if (o.isConnected) fn(); }, ms); timers.push(h); return h; };
  const o = document.createElement('div');
  o.className = `sm-battle bt-${b.kind}`;
  const members = i => s.players.filter(id => s.team[id] === i).map(id => esc(nm(id))).join(', ');
  o.innerHTML = `<div class="bt-head"><div class="bt-title">⚔ TEAM BATTLE · ${K.emoji} ${K.name}</div>
      <div class="bt-vs"><div class="bt-side t0 ${myTeam === 0 ? 'mine' : ''}"><span>🔴 Red</span><b data-avg="0">–</b></div><div class="bt-bar"><i class="t0"></i><i class="t1"></i></div><div class="bt-side t1 ${myTeam === 1 ? 'mine' : ''}"><span>🔵 Blue</span><b data-avg="1">–</b></div></div></div>
    <div class="bt-body" id="btBody"></div>`;
  document.body.append(o);
  const body = o.querySelector('#btBody');
  const bars = () => {
    const a = liveAverages(s, { ...live, [ui.me]: mine }, b.kind);
    o.querySelectorAll('[data-avg]').forEach(x => { const v = a[+x.dataset.avg]; x.textContent = v == null ? '–' : K.unit === 'ms' ? `${v} ms` : v; });
    const x = a[0] ?? 0, y = a[1] ?? 0, tot = x + y;
    const share = tot ? (K.lower ? y / tot : x / tot) : 0.5;
    o.querySelector('.bt-bar .t0').style.width = share * 100 + '%'; o.querySelector('.bt-bar .t1').style.width = (1 - share) * 100 + '%';
    o.style.setProperty('--pull', (share - 0.5).toFixed(3));
  };
  const off = ui.live.on(({ from, d }) => { if (d?.k === 'bt' && s.players.includes(from)) { live[from] = d.v; bars(); } });
  const send = () => ui.live.send({ k: 'bt', v: mine });
  const finish = score => { if (over) return; over = true; clearInterval(sendIv); sfx('bang'); ui.act('battleScore', { score }); body.innerHTML = '<div class="bt-wait"><div class="bt-spin">⏳</div><b>Time! Your score is in.</b><p>Waiting for everyone else…</p></div>'; };
  let sendIv = 0;

  /* ---- 1. the VS card and the count-in ---- */
  body.innerHTML = `<div class="bt-card"><div class="bt-big">${K.emoji}</div><h2>${K.name}</h2><p>${K.how}</p>
    <div class="bt-teams"><div class="t0"><b>🔴 Red</b><small>${members(0)}</small></div><div class="t1"><b>🔵 Blue</b><small>${members(1)}</small></div></div><div class="smi-count" id="btCount"></div></div>`;
  sfx('whoosh');
  const cnt = body.querySelector('#btCount'); const show = (x, cls) => { cnt.textContent = x; cnt.className = 'smi-count ' + (cls ?? ''); void cnt.offsetWidth; cnt.classList.add('pop'); };
  const t3 = intro - 3 * 900 - 300;
  at(t3, () => { show('3'); sfx('blip'); }); at(t3 + 900, () => { show('2'); sfx('blip'); }); at(t3 + 1800, () => { show('1'); sfx('blip'); });
  at(t3 + 2700, () => { show('GO!', 'go'); sfx('ding'); });
  at(intro, () => play());

  /* ---- 2. the game itself ---- */
  function play() {
    sendIv = setInterval(() => { if (!o.isConnected) return clearInterval(sendIv); send(); bars(); }, 300);
    const end = () => finish(b.kind === 'reflex' ? (best ?? 1500) : (mine ?? 0));
    const clock = (ms) => { const el = body.querySelector('.bt-clock i'); if (el) { el.style.transition = `width ${ms}ms linear`; requestAnimationFrame(() => (el.style.width = '0%')); } };
    let best = null;
    if (b.kind === 'tug') {
      body.innerHTML = `<div class="bt-clock"><i style="width:100%"></i></div><div class="bt-rope"><span class="bt-flag t0">🔴</span><div class="bt-line"><i class="bt-knot" id="knot">🪢</i></div><span class="bt-flag t1">🔵</span></div><p class="bt-count">Your pulls: <b id="mine">0</b></p><button class="bt-pull" id="pull">🪢 PULL!</button>`;
      clock(dur); const pull = body.querySelector('#pull'), n = body.querySelector('#mine'), knot = body.querySelector('#knot');
      tap(pull, () => { if (over) return; mine = (mine ?? 0) + 1; n.textContent = mine; pull.classList.remove('hit'); void pull.offsetWidth; pull.classList.add('hit'); navigator.vibrate?.(6); if (mine % 3 === 0) sfx('tick'); bars(); });
      const mv = setInterval(() => { if (!o.isConnected || over) return clearInterval(mv); knot.style.left = (50 + Number(o.style.getPropertyValue('--pull') || 0) * 90) + '%'; }, 120);
      at(dur, end);
    } else if (b.kind === 'trivia') {
      const qs = battleQuestions(b.seed, level); let i = 0, left = 8;
      const next = () => { if (i >= qs.length) return end(); const { q, ok, opts } = qs[i]; left = 8;
        body.innerHTML = `<div class="bt-clock"><i style="width:100%"></i></div><p class="bt-q">${esc(q)}</p><div class="bt-opts">${opts.map(x => `<button class="bt-opt" data-ok="${x === ok ? 1 : 0}">${esc(x)}</button>`).join('')}</div><p class="bt-count">Question ${i + 1} of ${qs.length} · right: <b>${mine}</b></p>`;
        clock(8000); let done = false;
        const adv = (good) => { if (done || over) return; done = true; clearTimeout(tm); if (good) { mine++; sfx('ding'); } else sfx('buzz'); body.querySelectorAll('.bt-opt').forEach(x => { x.disabled = true; if (x.dataset.ok === '1') x.classList.add('ok'); }); send(); bars(); i++; at(650, next); };
        const tm = at(8000, () => adv(false));
        body.querySelectorAll('.bt-opt').forEach(x => tap(x, () => { const good = x.dataset.ok === '1'; if (!good) x.classList.add('bad'); adv(good); }));
      };
      next();
      at(dur, end);
    } else if (b.kind === 'maths') {
      const r = mulberry(b.seed + 7); let lock = false;
      const next = () => { const { q, ok, opts } = mathQuestion(r, level); lock = false;
        body.innerHTML = `<div class="bt-clock"><i style="width:${Math.max(0, (b.endAt - Date.now()) / dur) * 100}%"></i></div><p class="bt-q big">${q} = ?</p><div class="bt-opts two">${opts.map(x => `<button class="bt-opt" data-ok="${x === ok ? 1 : 0}">${x}</button>`).join('')}</div><p class="bt-count">Right so far: <b>${mine}</b></p>`;
        body.querySelectorAll('.bt-opt').forEach(x => tap(x, () => { if (over || lock) return; lock = true; const good = x.dataset.ok === '1'; if (good) { mine++; sfx('ding'); send(); bars(); next(); } else { sfx('buzz'); x.classList.add('bad'); setTimeout(() => { if (!over && o.isConnected) next(); }, 600); } }));
      };
      next(); at(dur, end);
    } else if (b.kind === 'memory') {
      const r = mulberry(b.seed + 11), seq = Array.from({ length: 20 }, () => Math.floor(r() * 4)), COLS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00'];
      let level = 1, shownAll = false;
      const round = () => { const len = level + 2, want = seq.slice(0, len); let pos = 0; shownAll = false;
        body.innerHTML = `<div class="bt-clock"><i style="width:${Math.max(0, (b.endAt - Date.now()) / dur) * 100}%"></i></div><p class="bt-count" id="msay">Level <b>${level}</b>: watch…</p><div class="bt-pads">${COLS.map((c, i) => `<button class="bt-pad" data-i="${i}" style="--c:${c}" disabled></button>`).join('')}</div><p class="bt-count">Chain length so far: <b>${mine}</b></p>`;
        const pads = [...body.querySelectorAll('.bt-pad')], say = body.querySelector('#msay'); const flash = (i, ms = 360) => { pads[i].classList.add('lit'); sfx('blip'); at(ms, () => pads[i].classList.remove('lit')); };
        want.forEach((v, k) => at(700 + k * 560, () => flash(v)));
        at(700 + len * 560 + 150, () => { shownAll = true; say.innerHTML = `Level <b>${level}</b>: your turn!`; pads.forEach(p => (p.disabled = false)); });
        pads.forEach(p => tap(p, () => { if (!shownAll || over) return; const i = +p.dataset.i; flash(i, 180);
          if (i === want[pos]) { pos++; if (pos === len) { mine = level; level++; shownAll = false; pads.forEach(x => (x.disabled = true)); sfx('ding'); send(); bars(); at(800, round); } }
          else { sfx('buzz'); shownAll = false; pads.forEach(x => (x.disabled = true)); say.textContent = 'Wrong one! You are out.'; at(700, end); } }));
      };
      round(); at(dur, end);
    } else if (b.kind === 'gems') {
      const r = mulberry(b.seed + 13); let net = 0;
      body.innerHTML = `<div class="bt-clock"><i style="width:100%"></i></div><div class="bt-field" id="gf"></div><p class="bt-count">Gems: <b id="gn">0</b></p>`;
      clock(dur); const gf = body.querySelector('#gf'), gn = body.querySelector('#gn');
      for (let ts = 300; ts < dur - 1500; ts += 330 + Math.floor(r() * 220)) { const bomb = r() < 0.22, x = 6 + Math.floor(r() * 78), fall = 1500 + Math.floor(r() * 700); at(ts, () => {
        const e = document.createElement('button'); e.className = 'bt-gem'; e.textContent = bomb ? '💣' : '💎'; e.style.left = x + '%'; e.style.animationDuration = fall + 'ms'; let hit = false;
        tap(e, () => { if (hit || over) return; hit = true; if (bomb) { net = Math.max(0, net - 2); sfx('bang'); e.textContent = '💥'; } else { net++; sfx('pop'); e.textContent = '✨'; } mine = net; gn.textContent = net; e.classList.add('hit'); setTimeout(() => e.remove(), 250); bars(); });
        e.addEventListener('animationend', () => { if (!hit) e.remove(); }); gf.append(e); }); }
      at(dur, end);
    } else {
      let tries = 0, ready = false, t0 = 0, early = 0;
      body.innerHTML = `<div class="bt-clock"><i style="width:100%"></i></div><p class="bt-count" id="rsay">Wait for green…</p><button class="bt-light" id="light">…</button><p class="bt-count">Best: <b id="rbest">–</b> · try <b id="rtry">1</b> of 3</p>`;
      clock(dur); const light = body.querySelector('#light'), say = body.querySelector('#rsay'), bestEl = body.querySelector('#rbest'), tryEl = body.querySelector('#rtry');
      const round = () => { ready = false; light.className = 'bt-light'; light.textContent = '…'; say.textContent = 'Wait for green…'; early = 0; at(1200 + rnd(2200), () => { ready = true; t0 = performance.now(); light.className = 'bt-light go'; light.textContent = 'TAP!'; sfx('blip'); }); };
      tap(light, () => {
        if (over) return;
        if (!ready) { early = 400; sfx('buzz'); say.textContent = 'Too early! +400 ms'; return; }
        const ms = Math.max(90, Math.round(performance.now() - t0) + early); ready = false; tries++;
        best = best == null ? ms : Math.min(best, ms); mine = best; bestEl.textContent = best + ' ms'; light.className = 'bt-light done'; light.textContent = `${ms} ms`; sfx('ding'); say.textContent = `${ms} ms!`; send(); bars();
        if (tries >= 3) return at(900, end); tryEl.textContent = tries + 1; at(1000, round);
      });
      round(); at(dur, end);
    }
    bars();
  }
  const close = () => { timers.forEach(clearTimeout); clearInterval(sendIv); off(); o.remove(); };
  return { close, bars, el: o, live };
}

// The result, on every phone: both averages, who won, the bonus, and the new team totals counting up.
export function battleResult({ res, teams, from, to, myTeam, anchor, onClose }) {
  const K = BATTLES[res.kind], o = document.createElement('div');
  o.className = 'sm-battle-res';
  const win = res.winner, mine = win != null && win === myTeam;
  const fmt = v => (K.unit === 'ms' ? `${v} ms` : v);
  o.innerHTML = `<div class="btr-card"><div class="btr-k">${K.emoji} ${K.name}</div>
    <div class="btr-vs">${teams.map((tm, i) => `<div class="btr-side t${i} ${win === i ? 'won' : ''}"><span>${tm.emoji} ${esc(tm.name)}</span><b>${fmt(res.avg[i])}</b>${win === i ? '<em class="btr-bonus">+' + res.bonus + '</em>' : ''}</div>`).join('<span class="btr-x">VS</span>')}</div>
    <h2 class="btr-win">${win == null ? '🤝 It\'s a tie!' : `${teams[win].emoji} ${esc(teams[win].name)} wins the battle!`}</h2>
    <p class="btr-sub">${K.unit === 'ms' ? 'average of each player\'s best time' : 'average per player'}${win == null ? '. No bonus this time.' : '. Bonus points for the winners!'}</p>
    <div class="btr-tot">${teams.map((tm, i) => `<div class="t${i}"><small>${tm.emoji} total</small><b data-i="${i}">${from[i]}</b></div>`).join('')}</div><p class="btr-tap">Tap to continue</p></div>`;
  document.body.append(o);
  let closed = false; const close = () => { if (closed) return; closed = true; o.classList.add('out'); setTimeout(() => o.remove(), 350); onClose?.(); };
  o.addEventListener('click', close);
  sfx(win == null ? 'blip' : mine ? 'win' : 'mystic'); if (mine && !reduceMotion()) setTimeout(confetti, 400);
  setTimeout(() => { for (const i of [0, 1]) { const n = o.querySelector(`.btr-tot b[data-i="${i}"]`), a = from[i], z = to[i], t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / 1100); n.textContent = Math.round(a + (z - a) * (1 - (1 - k) ** 3)); if (k < 1 && o.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); } if (win != null) sfx('ding'); }, 1100);
  setTimeout(close, 6500);
  const watch = setInterval(() => { if (!anchor.isConnected) { clearInterval(watch); o.remove(); } }, 800);
  return close;
}
