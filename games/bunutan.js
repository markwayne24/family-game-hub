import { fresh, memo, confetti, sfx } from './fx.js';
import { shuffleCinematic, openGiftCinematic, makeCardImage, saveImage, avatar } from './bunutan-fx.js';

/* ---------- the draw ---------- */

export const MIN_DRAWERS = 3;
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Who gives to whom: everybody gives to exactly one person and receives from exactly one, never themselves,
// never a pair the host wants kept apart, and (optionally) nobody just swaps with someone else.
// Returns { giver: receiver } or null when the rules can't all be met.
export function makeDraw(ids, { avoid = [], noSwap = true } = {}) {
  if (ids.length < 2) return null;
  const apart = new Set(avoid.flatMap(([a, b]) => [`${a}>${b}`, `${b}>${a}`]));
  const givers = shuffle(ids);
  const taken = new Set(); const out = {};
  let steps = 0;
  const ok = (g, r) => g !== r && !taken.has(r) && !apart.has(`${g}>${r}`) && !(noSwap && ids.length > 2 && out[r] === g);
  const go = i => {
    if (++steps > 20000) return false; // a safety net for impossible rules
    if (i === givers.length) return true;
    const g = givers[i];
    for (const r of shuffle(ids)) {
      if (!ok(g, r)) continue;
      out[g] = r; taken.add(r);
      if (go(i + 1)) return true;
      delete out[g]; taken.delete(r);
    }
    return false;
  };
  return go(0) ? out : null;
}

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/* ---------- the game ---------- */

export const bunutan = {
  id: 'bunutan',
  name: 'Bunutan',
  emoji: '🎁',
  lateJoin: 'watch',
  // once the names are drawn the group is fixed, so newcomers watch
  inProgress: s => s.phase === 'drawn',

  init(env, opts) {
    // coming back to Bunutan after another game: the draw (and who has seen theirs) is still there
    if (opts?.memory?.saved) return opts.memory.saved;
    return {
      phase: 'lobby', title: 'Bunutan', budget: '', date: '', note: '', hostIn: true, noSwap: true, avoid: [],
      drawers: [], names: {}, assign: {}, revealed: {}, error: null, round: 0,
    };
  },
  remember: s => ({ saved: s }),

  reduce(s, a, env) {
    const isHost = a.from === env.hostId;
    if (s.phase === 'lobby') s = { ...s, names: Object.fromEntries(env.players.map(p => [p.id, p.name])) }; // after the draw the names are frozen

    // start over: a fresh draw with the same event details
    if (a.type === 'reset' && isHost) return { ...this.init(env), title: s.title, budget: s.budget, date: s.date, note: s.note, hostIn: s.hostIn, noSwap: s.noSwap, avoid: s.avoid, round: s.round };

    if (s.phase === 'lobby') {
      if (a.type === 'config' && isHost) {
        const p = a.data ?? {};
        const n = { ...s };
        if ('title' in p) n.title = clip(p.title, 40) || 'Bunutan';
        if ('budget' in p) n.budget = clip(p.budget, 30);
        if ('date' in p) n.date = clip(p.date, 30);
        if ('note' in p) n.note = clip(p.note, 90);
        if (typeof p.hostIn === 'boolean') n.hostIn = p.hostIn;
        if (typeof p.noSwap === 'boolean') n.noSwap = p.noSwap;
        if (Array.isArray(p.addAvoid) && p.addAvoid.length === 2) {
          const [x, y] = p.addAvoid;
          const known = new Set(env.players.map(q => q.id));
          if (x !== y && known.has(x) && known.has(y) && !s.avoid.some(([m, k]) => (m === x && k === y) || (m === y && k === x))) n.avoid = [...s.avoid, [x, y]].slice(0, 12);
        }
        if (Number.isInteger(p.removeAvoid)) n.avoid = s.avoid.filter((_, i) => i !== p.removeAvoid);
        n.error = null;
        return n;
      }
      if (a.type === 'draw' && isHost) {
        const ids = env.players.map(p => p.id).filter(id => s.hostIn || id !== env.hostId);
        if (ids.length < MIN_DRAWERS) return { ...s, error: `Need at least ${MIN_DRAWERS} people in the draw (${ids.length} here).` };
        const avoid = s.avoid.filter(([x, y]) => ids.includes(x) && ids.includes(y));
        const assign = makeDraw(ids, { avoid, noSwap: s.noSwap });
        if (!assign) return { ...s, error: 'Those rules can\'t all be met. Try removing a "keep apart" pair or turning off "no swaps".' };
        return {
          ...s, phase: 'drawn', drawers: ids, assign, revealed: {}, error: null, round: s.round + 1,
          names: Object.fromEntries(env.players.filter(p => ids.includes(p.id)).map(p => [p.id, p.name])),
        };
      }
      return s;
    }

    // after the draw: each person opens their own gift once; the host can only start over
    if (a.type === 'reveal' && s.drawers.includes(a.from) && !s.revealed[a.from]) return { ...s, revealed: { ...s.revealed, [a.from]: true } };
    return s;
  },

  // What everyone may see. Who drew whom is never in here.
  view(s) {
    const { assign, ...pub } = s;
    return pub;
  },

  // Each person's own result, sent sealed to them alone (it is also what lets them come back later and look again).
  priv(s) {
    if (s.phase !== 'drawn') return {};
    return Object.fromEntries(s.drawers.map(id => [id, { to: s.assign[id], toName: s.names[s.assign[id]] }]));
  },

  /* ---------- the screens ---------- */
  render(el, s, ui) {
    el.classList.add('bnstage');
    el._s = s; el._ui = ui;
    const redraw = () => { if (el.isConnected && el.classList.contains('bnstage')) this.render(el, el._s, el._ui); };
    const esc = ui.esc;
    const nm = id => ui.nameOf(id) === '(waiting)' ? (s.names?.[id] ?? '?') : ui.nameOf(id);
    const panel = (title, inner, cls = '') => `<section class="bn-panel ${cls}">${title ? `<h3 class="bn-ph">${title}</h3>` : ''}${inner}</section>`;
    const me = ui.priv;
    const drawer = s.drawers.includes(ui.me);

    // remember what is being typed so a new person joining doesn't wipe it
    const typing = {};
    el.querySelectorAll('input[data-f]').forEach(i => { typing[i.dataset.f] = { v: i.value, focus: document.activeElement === i }; });

    /* sounds and scenes for what just changed */
    const prev = memo(el, 'phase', s.phase);
    if (prev === 'lobby' && s.phase === 'drawn' && drawer) {
      shuffleCinematic({ names: s.drawers.map(id => s.names[id] ?? nm(id)), title: s.title });
    }
    const nowHere = ui.players.length;
    const prevHere = memo(el, 'here', nowHere);
    if (s.phase === 'lobby' && prevHere !== undefined && nowHere > prevHere) sfx('pop');
    const nRev = Object.keys(s.revealed).length;
    const prevRev = memo(el, 'rev', nRev);
    if (s.phase === 'drawn' && prevRev !== undefined && nRev > prevRev && !(el._justRevealed)) sfx('blip');
    if (s.phase === 'drawn' && drawer && nRev === s.drawers.length && fresh(el, 'allDone', `${s.round}`)) { setTimeout(() => { sfx('win'); confetti(); }, 400); }
    if (fresh(el, 'round', s.round)) { el._show = false; clearTimeout(el._hideT); }

    const head = `<header class="bn-head"><div class="bn-snow" aria-hidden="true"></div><div class="bn-gift">🎁</div><div><div class="bn-title">${esc(s.title)}</div><div class="bn-sub">${s.phase === 'lobby' ? 'Secret gift exchange' : `${s.drawers.length} people in the draw`}</div></div></header>`;
    const details = (s.budget || s.date || s.note) ? `<div class="bn-details">${s.budget ? `<span class="bn-pill">💰 ${esc(s.budget)}</span>` : ''}${s.date ? `<span class="bn-pill">📅 ${esc(s.date)}</span>` : ''}${s.note ? `<p class="bn-note">“${esc(s.note)}”</p>` : ''}</div>` : '';
    let body = '';

    /* ------------------------------ the waiting room ------------------------------ */
    if (s.phase === 'lobby') {
      const here = ui.players;
      const inDraw = here.filter(p => s.hostIn || !p.host);
      const chips = here.map(p => `<span class="bn-who ${p.id === ui.me ? 'me' : ''} ${!s.hostIn && p.host ? 'out' : ''}">${avatar(p.name)}<b>${esc(p.name)}</b>${p.host ? '<small>host</small>' : ''}${!s.hostIn && p.host ? '<small>watching</small>' : ''}</span>`).join('');
      const enough = inDraw.length >= MIN_DRAWERS;
      if (ui.isHost) {
        const field = (f, label, ph, max) => `<label class="bn-field">${label}<input data-f="${f}" maxlength="${max}" placeholder="${ph}" value="${esc(typing[f]?.v ?? s[f])}" autocomplete="off"></label>`;
        const optsSel = inDraw.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        const optsSel2 = inDraw.map((p, i) => `<option value="${esc(p.id)}" ${i === 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
        body = `${head}
          ${panel(`👥 Who's in <span class="bn-count">${inDraw.length}</span>`, `<div class="bn-whos">${chips || '<span class="muted">Nobody yet</span>'}</div>
            <p class="muted" style="margin:8px 0 0">Everyone who opens your link joins the draw. Wait until all of them are here, because nobody can be added after you start.</p>
            <label class="bn-switch"><input type="checkbox" id="hostIn" ${s.hostIn ? 'checked' : ''}><span class="bn-track"><i></i></span><span>Include me in the draw</span></label>`)}
          ${panel('🎄 About the exchange', `${field('title', 'Name of the event', 'e.g. Family Christmas 2026', 40)}${field('budget', 'Gift budget', 'e.g. ₱300', 30)}${field('date', 'Exchange date', 'e.g. Dec 24', 30)}${field('note', 'A note for everyone (optional)', 'e.g. Wrap it nicely!', 90)}<p class="muted" style="margin:6px 0 0">This appears on each person's picture.</p>`)}
          ${panel('🚫 Rules', `<label class="bn-switch"><input type="checkbox" id="noSwap" ${s.noSwap ? 'checked' : ''}><span class="bn-track"><i></i></span><span>No swaps (A and B can't draw each other)</span></label>
            <p class="muted" style="margin:10px 0 6px">Keep two people from drawing each other (like partners):</p>
            ${s.avoid.map(([x, y], i) => `<div class="bn-pair"><span>${esc(nm(x))} ↔ ${esc(nm(y))}</span><button class="ghost small" data-rm="${i}" aria-label="Remove this pair">✕</button></div>`).join('')}
            ${inDraw.length >= 2 ? `<div class="bn-addpair"><select id="avA">${optsSel}</select><span>↔</span><select id="avB">${optsSel2}</select><button class="ghost" id="addPair">Add</button></div>` : ''}`)}
          <div class="bn-bar">${s.error ? `<p class="bn-err">⚠️ ${esc(s.error)}</p>` : !enough ? `<p class="muted">⏳ Waiting for more people… ${inDraw.length} of at least ${MIN_DRAWERS}</p>` : '<p class="muted">Everyone here? Tap when all your players have joined.</p>'}
            <button id="draw" ${enough ? '' : 'disabled'}>🎲 Draw the names</button></div>`;
      } else {
        body = `${head}${details}
          ${panel(`👥 Who's in <span class="bn-count">${inDraw.length}</span>`, `<div class="bn-whos">${chips}</div>`)}
          ${panel('', '<div class="bn-wait"><div class="bn-bounce">🎁</div><p><b>Waiting for the host to start the draw…</b></p><p class="muted">Stay on this screen. You\'ll pick your name in a moment.</p></div>')}`;
      }
    }

    /* ------------------------------ after the draw ------------------------------ */
    else {
      const mineSeen = !!s.revealed[ui.me];
      const progress = panel(`🎁 Who has drawn <span class="bn-count">${nRev}/${s.drawers.length}</span>`,
        `<div class="bn-bar-track"><i style="width:${s.drawers.length ? (nRev / s.drawers.length) * 100 : 0}%"></i></div>
         <div class="bn-whos">${s.drawers.map(id => `<span class="bn-who ${s.revealed[id] ? 'done' : ''} ${id === ui.me ? 'me' : ''}">${avatar(nm(id))}<b>${esc(nm(id))}</b><small>${s.revealed[id] ? '✅ drawn' : '⏳'}</small></span>`).join('')}</div>
         ${nRev === s.drawers.length ? '<p class="bn-alldone">🎉 Everyone has drawn their name!</p>' : ''}`);
      let mine = '';
      if (!drawer) {
        mine = panel('', `<div class="bn-wait"><div>👀</div><p><b>You're not in this draw.</b></p><p class="muted">${ui.isHost ? 'You chose to stay out. You can still watch who has drawn.' : 'The draw started before you joined. Ask the host for the next one.'}</p></div>`);
      } else if (!me) {
        mine = panel('', '<div class="bn-wait"><div class="bn-bounce">🔐</div><p><b>Getting your name…</b></p><p class="muted">One moment while it arrives securely.</p></div>');
      } else if (!mineSeen) {
        mine = `<button class="bn-box" id="open"><span class="bn-box-gift"><i class="bn-lid"></i><i class="bn-body"></i><i class="bn-rib"></i></span><b>Tap to open your gift</b><small>You'll draw one name, and only you will see it.</small></button>`;
      } else {
        const card = `<div class="bn-card"><div class="bn-card-lbl">🤫 Your bunutan is</div><div class="bn-card-name">${esc(me.toName)}</div>${details}<div class="bn-card-foot">Keep it a secret!</div></div>`;
        mine = el._show
          ? `${card}<div class="bn-actions"><button id="save">📥 Save as image</button><button class="ghost" id="hide">🙈 Hide my name</button></div>`
          : `<button class="bn-peek" id="peek">👁 Tap to see who you drew<small>Keep your screen private. It hides again after a few seconds.</small></button><div class="bn-actions"><button id="save">📥 Save as image</button></div>`;
      }
      body = `${head}${mineSeen && el._show ? '' : details}${mine}${progress}${ui.isHost ? '<div class="bn-foot"><button class="ghost danger" id="again">🔄 Start a new draw</button></div>' : ''}`;
    }

    el.innerHTML = `<div class="bn ${s.phase === 'lobby' ? 'is-lobby' : 'is-drawn'}">${body}</div>`;

    // put back what was being typed
    for (const [f, t] of Object.entries(typing)) {
      const i = el.querySelector(`input[data-f="${f}"]`);
      if (i && t.v !== i.value) i.value = t.v;
      if (i && t.focus) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* not a text field */ } }
    }

    /* wiring */
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
    el.querySelectorAll('input[data-f]').forEach(i => i.addEventListener('change', () => ui.act('config', { [i.dataset.f]: i.value })));
    el.querySelector('#hostIn')?.addEventListener('change', e => { sfx('pop'); ui.act('config', { hostIn: e.target.checked }); });
    el.querySelector('#noSwap')?.addEventListener('change', e => { sfx('pop'); ui.act('config', { noSwap: e.target.checked }); });
    on('#addPair', () => { const a = el.querySelector('#avA').value, b = el.querySelector('#avB').value; if (a !== b) { sfx('pop'); ui.act('config', { addAvoid: [a, b] }); } });
    on('[data-rm]', b => ui.act('config', { removeAvoid: +b.dataset.rm }));
    on('#draw', () => { if (confirm(`Start the draw with ${ui.players.filter(p => s.hostIn || !p.host).length} people? Nobody can join the draw after this.`)) ui.act('draw'); });
    on('#again', () => { if (confirm('Throw away this draw and start a new one? Everyone will draw again.')) ui.act('reset'); });
    on('#open', () => {
      el._justRevealed = true;
      openGiftCinematic({
        names: s.drawers.map(id => s.names[id] ?? nm(id)), target: me.toName, title: s.title, fromName: nm(ui.me),
        onLanded: () => { ui.act('reveal'); },
        onDone: () => { el._justRevealed = false; el._show = true; clearTimeout(el._hideT); el._hideT = setTimeout(() => { el._show = false; redraw(); }, 12000); redraw(); },
      });
    });
    on('#peek', () => { sfx('flip'); el._show = true; clearTimeout(el._hideT); el._hideT = setTimeout(() => { el._show = false; redraw(); }, 10000); redraw(); });
    on('#hide', () => { sfx('flip'); el._show = false; clearTimeout(el._hideT); redraw(); });
    on('#save', async b => {
      b.disabled = true; const label = b.textContent; b.textContent = 'Making your picture…';
      try {
        const blob = await makeCardImage({ title: s.title, toName: me.toName, fromName: nm(ui.me), budget: s.budget, date: s.date, note: s.note });
        await saveImage(blob, `bunutan-${me.toName.replace(/[^\w-]+/g, '_') || 'name'}.png`);
        sfx('ding');
      } catch (e) { console.warn(e); }
      b.disabled = false; b.textContent = label;
    });
  },
};
