import { sfx, fresh, memo, confetti } from './fx.js';
import { ROOMS, TEAMS, MIN_PLAYERS, TOTAL_POT, BONUS, AGENDAS, agendaOf, money } from './secret-data.js';
import { openTask } from './secret-tasks.js';
import { createLiveMap } from './secret-map.js';
import { revealScene } from './secret-fx.js';
import { avatar, scoreBoardHtml } from './impostor-fx.js';

const fmt = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export function renderSecret(el, s, ui, game) {
  el.classList.add('smstage');
  el._s = s; el._ui = ui;
  const redraw = () => { if (el.isConnected && el.classList.contains('smstage')) renderSecret(el, el._s, el._ui, game); };
  const esc = ui.esc;
  const nm = id => (ui.nameOf(id) === '(waiting)' ? (s.names?.[id] ?? '?') : ui.nameOf(id));
  const m = (el._m ??= { peek: false, notes: new Set(), opened: new Set(), accuse: false });
  const p = ui.priv;
  const gm = ui.isHost;
  const playing = s.players.includes(ui.me);
  const myTeam = s.team?.[ui.me];
  const sits = s.jailedNow?.includes(ui.me);
  const potNow = Math.round((TOTAL_POT / s.rounds) * s.history.length);
  const panel = (title, inner, cls = '') => `<section class="bn-panel ${cls}">${title ? `<h3 class="bn-ph">${title}</h3>` : ''}${inner}</section>`;
  const chip = (id, extra = '') => `<span class="bn-who ${id === ui.me ? 'me' : ''}">${avatar(nm(id))}<b>${esc(nm(id))}</b>${extra}</span>`;
  const teamTag = t => `<span class="sm-team t${t}">${TEAMS[t].emoji} ${TEAMS[t].name}</span>`;
  const last = s.history[s.history.length - 1];

  // the live map belongs to a round: it is created when the round starts and thrown away when it ends
  const mapOn = s.phase === 'round' && s.mode === 'map';
  if ((!mapOn || el._lmKey !== s.round) && el._lm) { el._lm.destroy(); el._lm = null; }
  const launch = room => {
    if (el._closeTask) return;
    ui.act('go', { room });
    sfx('whoosh');
    el._lm?.setBusy(room);
    el._closeTask = openTask(room, {
      anchor: el,
      onFinish: (ok, ms) => { el._closeTask = null; el._lm?.setBusy(null); ui.act('done', { room, ok, ms }); },
      onQuit: () => { el._closeTask = null; el._lm?.setBusy(null); ui.act('leave'); },
    });
  };
  if (mapOn) {
    const lmOpts = { live: ui.live, me: ui.me, players: s.players, nameOf: nm, team: s.team, speed: s.speed, canMove: playing && !sits, watching: !playing, doneRooms: p?.doneRooms ?? [], onVisit: room => ui.act('visit', { room }), onUse: launch };
    if (!el._lm) { el._lm = createLiveMap(lmOpts); el._lmKey = s.round; el.querySelector('.sm-livemap')?.remove(); }
    el._lm.update(lmOpts);
    window.__smap = el._lm;   // handy for testing
  }

  // leaving a room's task when the round is over
  if (s.phase !== 'round' && el._closeTask) { el._closeTask(); el._closeTask = null; }
  if (fresh(el, 'round', `${s.round}:${s.phase}`)) {
    if (s.phase === 'round') { sfx('whoosh'); m.peek = false; }
    else if (s.phase === 'break') sfx('ding');
    else if (s.phase === 'vote') sfx('drumroll');
  }
  if (!el._tick) {
    el._tick = setInterval(() => {
      if (!el.isConnected || !el.classList.contains('smstage')) { clearInterval(el._tick); el._tick = null; return; }
      const at = game.deadline(el._s);
      const out = el.querySelector('[data-left]');
      if (!at || !out) return;
      const left = Math.max(0, at - Date.now());
      out.textContent = fmt(left);
      out.classList.toggle('hot', left <= 10000);
      const sec = Math.ceil(left / 1000);
      if (left <= 10000 && left > 0 && sec !== el._lastSec) { el._lastSec = sec; sfx('tick'); }
    }, 500);
  }

  const subs = { lobby: 'Find the hidden millionaire', round: `Round ${s.round} of ${s.rounds}`, break: `Round ${s.round} complete`, vote: 'The final vote', end: 'Game over' };
  const head = `<header class="sm-head"><div class="sm-coin">💰</div><div class="grow"><div class="sm-title">Secret Millionaire</div><div class="sm-sub">${subs[s.phase]}</div></div><div class="sm-pot"><small>Pot</small><b>${money(potNow)}</b></div></header>`;
  const timer = at => (at ? `<span class="sm-timer">⏱ <b data-left>${fmt(Math.max(0, at - Date.now()))}</b></span>` : '');
  let body = '', bar = '';

  /* ---- who is who: your team, and for the Millionaire / game master, their secrets ---- */
  const myTag = playing && myTeam != null ? `<div class="sm-me">You are on ${teamTag(myTeam)}${sits ? ' <span class="sm-sit">🚔 sitting this round out</span>' : ''}</div>` : '';
  const secretCard = () => {
    if (gm && p?.gm) {
      const ag = agendaOf(p.agenda?.key);
      return panel('🎬 You are the game master', `<p class="sm-gm">The Secret Millionaire is <b>${esc(nm(p.millionaire))}</b>${ag && s.phase === 'round' ? `<br>Their agenda this round: <i>${esc(ag.text)}</i>` : ''}</p>`, 'sm-secret');
    }
    if (p?.millionaire && s.phase !== 'lobby' && s.phase !== 'end') {
      const ag = agendaOf(p.agenda?.key);
      return panel('💰 You are the Secret Millionaire', m.peek
        ? `<div class="sm-agenda"><div class="sm-agl">🤫 Your secret agenda${s.phase === 'round' ? '' : ' (this round)'}</div><p>${esc(ag?.text ?? '')}</p><small>Finish it for <b>${money(BONUS)}</b>. Don't get caught!</small></div><button class="ghost" id="hidePeek">🙈 Hide</button>`
        : `<p class="muted" style="margin-top:0">Only you know this. Win by staying hidden until the end.</p><button id="peek">👁 Tap to see your secret agenda</button>${p.bonus ? `<p class="sm-bonus">Agenda bonus so far: <b>${money(p.bonus)}</b></p>` : ''}`, 'sm-secret');
    }
    return '';
  };

  /* ================================ waiting room ================================ */
  if (s.phase === 'lobby') {
    const here = ui.players.filter(x => !x.host);
    const ok = here.length >= MIN_PLAYERS;
    const whos = here.map(x => chip(x.id)).join('') || '<span class="muted">Nobody yet. Share the link!</span>';
    if (gm) {
      const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
      body = `${panel(`👥 Players <span class="bn-count">${here.length}</span>`, `<div class="bn-whos">${whos}</div><p class="muted">You run the game as the <b>game master</b>: you don't play, you know who the Millionaire is, and you can steer their secret agenda.</p>`)}
        ${panel('⚙️ Game settings', `<div class="sm-set">
          <label>Rounds<select data-cfg="rounds">${[3, 4, 5, 6].map(n => opt(n, s.rounds, `${n} rounds`)).join('')}</select></label>
          <label>Time per round<select data-cfg="secs">${[60, 90, 120, 180, 240].map(n => opt(n, s.secs, `${n % 60 === 0 ? n / 60 + ' min' : n + ' sec'}`)).join('')}</select></label>
          <label>How players move<select id="modeSel"><option value="map" ${s.mode === 'map' ? 'selected' : ''}>🗺 Walk around the mansion (live)</option><option value="rooms" ${s.mode === 'rooms' ? 'selected' : ''}>📋 Pick a room from a list (uses less data)</option></select></label>
          <label>Walking speed (live map)<select id="speedSel">${[['slow', '🐢 Slow'], ['normal', '🚶 Normal'], ['fast', '🏃 Fast']].map(([v, l]) => opt(v, s.speed, l)).join('')}</select></label>
          <label>Who is the Millionaire?<select id="pickMode"><option value="random" ${s.pickMode === 'random' ? 'selected' : ''}>🎲 Pick at random</option>${here.map(x => opt('p:' + x.id, s.pickMode === 'host' ? 'p:' + (ui.raw ?? s).pick : '', `Choose ${esc(x.name)}`)).join('')}</select></label>
          <label>First round's secret agenda<select id="agenda0"><option value="">🎲 Random</option>${AGENDAS.map(a => opt(a.key, s.nextAgenda ?? '', esc(a.text))).join('')}</select></label>
        </div>`)}
        ${panel('📖 How it works', '<ol class="sm-how"><li>Players are split into two teams. Each round they walk the mansion room by room and do small tasks for points.</li><li>The winning team gets a <b>clue</b> about the Secret Millionaire.</li><li>Between rounds anyone can accuse once. Wrong guesses sit out a round.</li><li>After the last round everybody votes. Catch the Millionaire to split the pot!</li></ol>')}`;
      bar = `<div class="bn-bar">${s.error ? `<p class="err">${esc(s.error)}</p>` : !ok ? `<p class="muted">Need at least ${MIN_PLAYERS} players besides you (${here.length} here).</p>` : ''}<button id="start" ${ok ? '' : 'disabled'}>▶ Start the game</button></div>`;
    } else {
      body = `${panel(`👥 Who's playing <span class="bn-count">${here.length}</span>`, `<div class="bn-whos">${whos}</div>`)}
        ${panel('', '<div class="bn-wait"><div class="bn-bounce">💰</div><p><b>Waiting for the game master to start…</b></p><p class="muted">One of you will secretly be the Millionaire. You\'ll find out when the game starts.</p></div>')}
        ${panel('📖 How it works', '<ol class="sm-how"><li>You\'ll be on a team. Walk the mansion room by room and finish tasks to score points.</li><li>The winning team earns a clue about the Secret Millionaire.</li><li>Accuse once, but a wrong guess costs you a round.</li><li>At the end, everyone votes for who they think it is.</li></ol>')}`;
    }
  }

  /* ================================ a round ================================ */
  else if (s.phase === 'round') {
    const tiles = ROOMS.map(r => {
      const here = Object.entries(s.loc).filter(([, room]) => room === r.id).map(([id]) => id);
      const done = !!p?.doneRooms?.includes(r.id);
      const canGo = playing && !sits && !done;
      const people = here.map(id => `<span class="sm-pin" title="${esc(nm(id))}">${avatar(nm(id))}</span>`).join('');
      return `<${canGo ? 'button' : 'div'} class="sm-room ${done ? 'done' : ''} ${canGo ? '' : 'idle'}" ${canGo ? `data-room="${r.id}"` : ''}><span class="sm-re">${r.emoji}</span><b>${r.name}</b><small>${done ? '✅ Done' : r.title}</small><span class="sm-people">${people}</span></${canGo ? 'button' : 'div'}>`;
    }).join('');
    const teamBars = TEAMS.map(t => {
      const members = s.players.filter(id => s.team[id] === t.id);
      return `<div class="sm-tb t${t.id} ${myTeam === t.id ? 'mine' : ''}"><div class="sm-tbh">${t.emoji} <b>${t.name}</b><span class="sm-tp">${s.teamPts[t.id]} pts</span></div><div class="sm-tm">${members.map(id => esc(nm(id))).join(', ')}</div></div>`;
    }).join('');
    const mineDone = p?.doneRooms?.length ?? 0;
    let gmPanel = '';
    if (gm && p?.gm) {
      const rows = s.players.map(id => {
        const mine = p.log.filter(e => e.r === s.round && e.id === id);
        return `<div class="sm-st"><span class="grow">${avatar(nm(id))} <b>${esc(nm(id))}</b> ${teamTag(s.team[id])}${id === p.millionaire ? ' 💰' : ''}${s.jailedNow.includes(id) ? ' 🚔' : ''}</span><small>${s.loc[id] ? ROOMS.find(r => r.id === s.loc[id]).emoji : '🚶'} · ${mine.filter(e => e.ok).length}/${mine.length} ✓</small></div>`;
      }).join('');
      gmPanel = panel('🎬 Game master', `${rows}
        <label class="sm-lab">Change the Millionaire's agenda this round<select id="agendaNow">${AGENDAS.map(a => `<option value="${a.key}" ${a.key === p.agenda?.key ? 'selected' : ''}>${esc(a.text)}</option>`).join('')}</select></label>
        <button class="ghost danger" id="endRound">⏭ End this round now</button>`);
    }
    body = `${myTag}${secretCard()}${panel(`🏆 Teams ${timer(s.endAt)}`, `<div class="sm-tbs">${teamBars}</div>`)}
      ${mapOn ? panel(`🏠 The mansion${playing && !sits ? ` <span class="bn-count">${mineDone}/${ROOMS.length} done</span>` : ''}`, '<div id="mapSlot"></div>', 'sm-mappanel') : ''}
      ${mapOn ? '' : panel(`🏠 The mansion${playing && !sits ? ` <span class="bn-count">${mineDone}/${ROOMS.length} done</span>` : ''}`, `${playing && !sits ? '<p class="muted" style="margin-top:0">Tap a room to walk in and do its task. Everyone can see which room you\'re in.</p>' : sits ? '<p class="sm-sitmsg">🚔 You guessed wrong, so you sit this round out. Watch the others!</p>' : '<p class="muted" style="margin-top:0">Watching the mansion live.</p>'}<div class="sm-map">${tiles}</div>`)}
      ${gmPanel}`;
  }

  /* ================================ between rounds ================================ */
  else if (s.phase === 'break') {
    const rows = s.players.map(id => ({ id, name: nm(id), after: s.total[id] ?? 0, gain: last.per[id] ?? 0, me: id === ui.me }))
      .map(r => ({ ...r, before: r.after - r.gain })).sort((a, b) => b.after - a.after || b.gain - a.gain);
    const win = last.winners.length === 0 ? 'Nobody scored, so no team wins.' : last.winners.length === 2 ? `It's a tie: ${teamTag(0)} and ${teamTag(1)} both win!` : `${teamTag(last.winners[0])} <b>wins round ${last.round}!</b>`;
    const result = panel(`🏁 Round ${last.round} results`, `<p class="sm-win">${win}</p><p class="sm-tpts">${TEAMS.map(t => `${t.emoji} ${last.teamPts[t.id]}`).join('  ·  ')}</p>${scoreBoardHtml(rows, { anim: false }).html}`);
    const mine = (p?.clues ?? []).filter(c => c.round === last.round);
    let clue = '';
    if (s.hasClue.includes(last.round)) {
      if (mine.length) {
        const open = m.opened.has(last.round);
        clue = panel('🔎 Your team found a clue!', open ? `<div class="sm-clue open">“${esc(mine[0].text)}”</div><p class="muted">Share it, or don't. Others might not believe you.</p>` : '<button class="sm-env" id="openClue"><span>✉️</span><b>Tap to open the envelope</b></button>', 'sm-cluep');
      } else clue = panel('🔎 A clue was found', `<p>${last.winners.map(t => teamTag(t)).join(' and ')} found a clue about the Secret Millionaire. Ask them what it says… but are they telling the truth?</p>`);
    }
    const allClues = (p?.clues ?? []).filter(c => !mine.length || c.round !== last.round || m.opened.has(c.round));
    const suspects = s.players.filter(id => id !== ui.me);
    const board = (playing || gm) ? panel('🗂 Detective notebook', `${allClues.length ? `<ul class="sm-cl">${allClues.map(c => `<li><b>R${c.round}</b> ${esc(c.text)}</li>`).join('')}</ul>` : '<p class="muted" style="margin-top:0">No clues for your team yet.</p>'}
      <p class="muted">Tap names to cross people off your list:</p><div class="bn-whos">${suspects.map(id => `<button class="sm-sus ${m.notes.has(id) ? 'x' : ''}" data-sus="${id}">${avatar(nm(id))} ${esc(nm(id))}</button>`).join('')}</div>`) : '';
    const acc = s.accusations.length ? `<div class="sm-accs">${s.accusations.map(a => `<div>🕵️ <b>${esc(nm(a.by))}</b> accused <b>${esc(nm(a.target))}</b> in round ${a.r}: ${a.ok ? '✅ correct!' : '❌ wrong'}</div>`).join('')}</div>` : '';
    const used = s.accusations.some(a => a.by === ui.me);
    const accuse = playing ? panel('🕵️ Accuse someone', m.accuse
      ? `<p class="muted" style="margin-top:0">Who is the Secret Millionaire? If you are right, the game ends and you win! If you are wrong, you sit out the next round.</p><div class="bn-whos">${suspects.map(id => `<button class="sm-sus pick" data-acc="${id}">${avatar(nm(id))} ${esc(nm(id))}</button>`).join('')}</div><button class="ghost" id="accCancel" style="margin-top:10px">Cancel</button>${acc}`
      : `${used ? '<p class="muted" style="margin-top:0">You already used your one accusation.</p>' : '<p class="muted" style="margin-top:0">You get <b>one</b> accusation in the whole game. Use it when you\'re sure.</p><button id="accuse">🕵️ I know who it is</button>'}${acc}`)
      : (acc ? panel('🕵️ Accusations', acc) : '');
    let agendaRes = '';
    if (p?.millionaire) { const r = p.agendaRes[p.agendaRes.length - 1]; agendaRes = panel('🤫 Your secret agenda', `<p>${r?.ok ? `✅ Done! You earned <b>${money(BONUS)}</b>.` : '❌ Not completed this time.'}</p><small class="muted">Agenda bonus so far: ${money(p.bonus)}</small>`); }
    let gmPanel = '';
    if (gm && p?.gm) {
      const r = p.agendaRes[p.agendaRes.length - 1], c = p.clues.find(x => x.round === last.round);
      gmPanel = panel('🎬 Game master', `<p>Agenda ${r?.ok ? '✅ completed' : '❌ missed'} by <b>${esc(nm(p.millionaire))}</b>: <i>${esc(agendaOf(r?.key)?.text ?? '')}</i></p>${c ? `<p>Clue sent to ${c.to.map(id => esc(nm(id))).join(', ')}:<br><i>“${esc(c.text)}”</i></p>` : ''}
        <label class="sm-lab">Next round's secret agenda<select id="agendaNext"><option value="">🎲 Random</option>${AGENDAS.map(a => `<option value="${a.key}" ${a.key === p.nextAgenda ? 'selected' : ''}>${esc(a.text)}</option>`).join('')}</select></label>`);
      bar = `<div class="bn-bar"><button id="next">▶ Start round ${s.round + 1}</button></div>`;
    } else bar = '';
    body = `${myTag}${result}${clue}${agendaRes}${accuse}${board}${gmPanel}${gm ? '' : panel('', '<p class="muted" style="text-align:center;margin:0">Waiting for the game master to start the next round…</p>')}`;
  }

  /* ================================ the final vote ================================ */
  else if (s.phase === 'vote') {
    const rows = s.players.map(id => ({ id, name: nm(id), after: s.total[id] ?? 0, gain: last.per[id] ?? 0, me: id === ui.me })).map(r => ({ ...r, before: r.after - r.gain })).sort((a, b) => b.after - a.after);
    const myVote = p?.myVote;
    const suspects = s.players.filter(id => id !== ui.me);
    const board = (playing || gm) ? panel('🗂 Your clues', `${(p?.clues ?? []).length ? `<ul class="sm-cl">${p.clues.map(c => `<li><b>R${c.round}</b> ${esc(c.text)}</li>`).join('')}</ul>` : '<p class="muted" style="margin-top:0">Your team found no clues.</p>'}`) : '';
    let vote;
    if (playing) vote = panel(`🗳 Who is the Secret Millionaire? ${timer(s.voteEnd)}`, `<p class="muted" style="margin-top:0">Everyone votes in secret. If most of you pick the right person, you split the pot. If not, the Millionaire takes it all!</p><div class="sm-votes">${suspects.map(id => `<button class="sm-sus pick ${myVote === id ? 'picked' : ''}" data-vote="${id}">${avatar(nm(id))} ${esc(nm(id))}${myVote === id ? ' ✔' : ''}</button>`).join('')}</div><p class="sm-vc"><b>${s.voted.length}/${s.players.length}</b> have voted</p>`);
    else vote = panel(`🗳 The final vote ${timer(s.voteEnd)}`, `<p><b>${s.voted.length}/${s.players.length}</b> have voted.</p>${gm && p?.gm ? `<p class="sm-gm">The Millionaire is <b>${esc(nm(p.millionaire))}</b>.</p>` : ''}`);
    let gmBar = '';
    if (gm) bar = `<div class="bn-bar"><button id="resolve">✅ Close the vote now</button></div>`;
    body = `${myTag}${vote}${board}${panel('🏆 Final scores', scoreBoardHtml(rows, { anim: false }).html)}`;
  }

  /* ================================ the reveal ================================ */
  else {
    const o = s.outcome;
    const me = ui.me;
    const iWin = o.winner === 'detectives' ? o.by.includes(me) : me === s.millionaire;
    if (fresh(el, 'endScene', `${s.round}:${o.winner}`) && !el._seenEnd) {
      el._seenEnd = true;
      revealScene({ name: nm(s.millionaire), outcome: o, isMe: me === s.millionaire, iWin, detectives: o.by.map(nm), money, anchor: el });
    }
    const split = o.winner === 'detectives' && o.by.length ? Math.round(o.pot / o.by.length) : 0;
    const headline = o.winner === 'detectives'
      ? `🕵️ The Millionaire was caught!`
      : `💰 The Millionaire got away!`;
    const detail = o.winner === 'detectives'
      ? `${o.how === 'accusation' ? `${esc(nm(o.by[0]))} named them in an accusation.` : 'The group voted them out.'}<br>${o.by.length ? `${o.by.map(id => esc(nm(id))).join(', ')} split the <b>${money(o.pot)}</b> pot: <b>${money(split)}</b> each.` : ''}`
      : `${o.caught ? `The group voted for ${esc(nm(o.caught))}, who was wrong.` : 'The votes were split.'}<br><b>${esc(nm(s.millionaire))}</b> takes the <b>${money(o.pot)}</b> pot${o.bonus ? ` plus <b>${money(o.bonus)}</b> in agenda bonuses` : ''}: <b>${money(o.total)}</b>!`;
    const ar = s.agendaRes.length ? panel('🤫 The Millionaire\'s secret agendas', `<ul class="sm-cl">${s.agendaRes.map(r => `<li><b>R${r.round}</b> ${esc(agendaOf(r.key)?.text ?? '')} ${r.ok ? '✅' : '❌'}</li>`).join('')}</ul>`) : '';
    const cl = s.clues.length ? panel('🔎 Every clue that was found', `<ul class="sm-cl">${s.clues.map(c => `<li><b>R${c.round}</b> ${esc(c.text)}</li>`).join('')}</ul>`) : '';
    const rows = s.players.map(id => ({ id, name: nm(id), after: s.total[id] ?? 0, gain: 0, before: s.total[id] ?? 0, me: id === me })).sort((a, b) => b.after - a.after);
    body = `<section class="bn-panel sm-end ${iWin ? 'won' : ''}"><div class="sm-big">${o.winner === 'detectives' ? '🕵️' : '💰'}</div><h2>${headline}</h2>
      <div class="sm-who">${avatar(nm(s.millionaire))}<b>${esc(nm(s.millionaire))}</b><small>was the Secret Millionaire</small></div><p>${detail}</p>${iWin ? '<p class="sm-youwin">🎉 You won!</p>' : ''}</section>
      ${ar}${cl}${panel('🏆 Task points', scoreBoardHtml(rows, { anim: false }).html)}
      ${s.accusations.length ? panel('🕵️ Accusations', s.accusations.map(a => `<div>🕵️ <b>${esc(nm(a.by))}</b> → <b>${esc(nm(a.target))}</b> (round ${a.r}) ${a.ok ? '✅' : '❌'}</div>`).join('')) : ''}
      ${gm ? '<div class="bn-foot"><button id="again">🔄 Play again</button></div>' : ''}`;
  }

  el.innerHTML = `<div class="sm ${s.phase === 'lobby' ? 'is-lobby' : ''}">${head}${body}${bar}</div>`;

  const slot = el.querySelector('#mapSlot');
  if (slot && el._lm) slot.replaceWith(el._lm.box);

  /* ---- wiring ---- */
  const on = (sel, fn) => el.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b)));
  el.querySelectorAll('select[data-cfg]').forEach(x => x.addEventListener('change', () => { sfx('pop'); ui.act('config', { [x.dataset.cfg]: +x.value }); }));
  el.querySelector('#pickMode')?.addEventListener('change', e => { sfx('pop'); const v = e.target.value; ui.act('config', v === 'random' ? { pickMode: 'random', pick: null } : { pickMode: 'host', pick: v.slice(2) }); });
  el.querySelector('#speedSel')?.addEventListener('change', e => { sfx('pop'); ui.act('config', { speed: e.target.value }); });
  el.querySelector('#modeSel')?.addEventListener('change', e => { sfx('pop'); ui.act('config', { mode: e.target.value }); });
  el.querySelector('#agenda0')?.addEventListener('change', e => ui.act('config', { agenda: e.target.value }));
  el.querySelector('#agendaNow')?.addEventListener('change', e => ui.act('agenda', { key: e.target.value }));
  el.querySelector('#agendaNext')?.addEventListener('change', e => ui.act('agenda', { key: e.target.value }));
  on('#start', () => { sfx('whoosh'); ui.act('start'); });
  on('#next', () => ui.act('next'));
  on('#endRound', () => { if (confirm('End this round now and give out the clue?')) ui.act('endRound'); });
  on('#resolve', () => { if (confirm('Close the vote now and reveal the Millionaire?')) ui.act('resolve'); });
  on('#again', () => { if (confirm('Start a new game with the same players?')) { el._seenEnd = false; ui.act('reset'); } });
  on('#peek', () => { sfx('flip'); m.peek = true; clearTimeout(m.pt); m.pt = setTimeout(() => { m.peek = false; redraw(); }, 9000); redraw(); });
  on('#hidePeek', () => { sfx('flip'); m.peek = false; clearTimeout(m.pt); redraw(); });
  on('#openClue', () => { sfx('sparkle'); m.opened.add(last.round); redraw(); });
  on('[data-sus]', b => { sfx('pop'); const id = b.dataset.sus; m.notes.has(id) ? m.notes.delete(id) : m.notes.add(id); redraw(); });
  on('#accuse', () => { sfx('flip'); m.accuse = true; redraw(); });
  on('#accCancel', () => { m.accuse = false; redraw(); });
  on('[data-acc]', b => { const t = b.dataset.acc; if (confirm(`Accuse ${nm(t)}? If you're wrong you sit out the next round.`)) { m.accuse = false; sfx('drumroll'); ui.act('accuse', { target: t }); redraw(); } });
  on('[data-vote]', b => { sfx('vote'); ui.act('vote', { target: b.dataset.vote }); });
  on('[data-room]', b => launch(b.dataset.room));
}
