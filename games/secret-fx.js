import { sfx, confetti, reduceMotion } from './fx.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The finale, full screen on everyone's phone (tap to skip): curtains, a spotlight and a drum roll,
// then the Secret Millionaire's name slams in with raining money.
export function revealScene({ name, outcome, isMe, iWin, detectives = [], money, anchor }) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const o = document.createElement('div');
  o.className = 'sm-cine';
  const caught = outcome.winner === 'detectives';
  o.innerHTML = `<div class="smc-curtain l"></div><div class="smc-curtain r"></div><div class="smc-spot"></div>
    <div class="smc-money" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 4.7) % 100}%;--d:${(i % 7) * 0.35}s;--s:${1.2 + (i % 5) * 0.3}rem">${i % 3 ? '💵' : '💰'}</i>`).join('')}</div>
    <div class="smc-text">
      <div class="smc-t1">And the Secret Millionaire is…</div>
      <div class="smc-name">${esc(name)}</div>
      <div class="smc-verdict ${caught ? 'caught' : 'free'}">${caught ? '🕵️ Caught!' : '💰 Got away with it!'}</div>
      <div class="smc-pot">${caught ? `${esc(detectives.join(', ') || 'The group')} split ${money(outcome.pot)}` : `Takes home ${money(outcome.total)}`}</div>
      <p class="smc-skip">${iWin ? '🎉 You won! ' : ''}Tap to continue</p>
    </div>`;
  document.body.append(o);
  const close = () => { timers.forEach(clearTimeout); o.remove(); };
  o.addEventListener('click', close);
  at(0, () => sfx('whoosh'));
  at(300, () => o.classList.add('open'));
  at(1200, () => sfx('drumroll'));
  at(1500, () => o.classList.add('s1'));
  at(3000, () => { o.classList.add('s2'); sfx('bang'); });
  at(3700, () => { o.classList.add('s3'); sfx(caught ? 'win' : 'sparkle'); if (!reduceMotion()) confetti(); });
  at(5200, () => o.classList.add('s4'));
  const watch = setInterval(() => { if (!anchor.isConnected) { clearInterval(watch); close(); } }, 700);
  return close;
}

// The first screen of a game, shown to every player the same way: "your secret role is ready", then a tap shows it.
// Nothing on the first screen gives anything away, so people sitting next to each other can't tell who is who.
export function roleScene({ isM, team, agenda, bonus, anchor, onClose }) {
  const o = document.createElement('div');
  o.className = 'sm-role-scene';
  let timer = 0;
  const close = () => { clearTimeout(timer); if (!o.isConnected) return; o.remove(); onClose?.(); };
  const ready = () => {
    o.className = 'sm-role-scene';
    o.innerHTML = '<div class="srs-card"><div class="srs-big">🎭</div><h2>Your secret role is ready</h2><p>Hold your phone so nobody else can see, then tap.</p><button id="srsShow">👁 Reveal my role</button></div>';
    o.querySelector('#srsShow').addEventListener('click', e => { e.stopPropagation(); reveal(); });
  };
  const reveal = () => {
    o.className = `sm-role-scene ${isM ? 'gold' : 'blue'}`;
    o.innerHTML = isM
      ? `<div class="srs-card"><div class="srs-big">💰</div><h2>You are the SECRET MILLIONAIRE</h2><p>Stay hidden until the end and the pot is yours.</p><div class="srs-agenda"><b>🤫 Your agenda this round</b><br>${esc(agenda ?? '')}<br><small>Finish it for ${esc(bonus)}.</small></div><button id="srsHide">🙈 Hide and play</button></div>`
      : `<div class="srs-card"><div class="srs-big">🕵️</div><h2>You are a detective</h2><p>You are on ${team ? `${team.emoji} team ${esc(team.name)}` : 'a team'}. Win tasks, collect clues and find out who the Secret Millionaire is.</p><button id="srsHide">🙈 Hide and play</button></div>`;
    sfx(isM ? 'sparkle' : 'mystic'); if (isM && !reduceMotion()) confetti();
    o.querySelector('#srsHide').addEventListener('click', e => { e.stopPropagation(); sfx('flip'); close(); });
    timer = setTimeout(close, 15000);
  };
  document.body.append(o);
  ready(); sfx('whoosh');
  const watch = setInterval(() => { if (!anchor.isConnected) { clearInterval(watch); close(); } }, 700);
  return close;
}

// Before every round, on every player's phone at the same moment: the round, how hard it is, then 3, 2, 1, GO.
// Nobody can move until GO (the map is frozen meanwhile), so it is fair.
export function roundIntro({ round, rounds, level, team, anchor, onDone }) {
  const o = document.createElement('div');
  o.className = 'sm-intro';
  const stars = '★'.repeat(level + 1) + '☆'.repeat(2 - level);
  const LV = ['Easy tasks', 'Medium tasks', 'Hard tasks'][level] ?? '';
  o.innerHTML = `<div class="smi-bg"></div><div class="smi-card">
    <div class="smi-round">ROUND ${round}<small> of ${rounds}</small></div>
    <div class="smi-lv"><span>${stars}</span> ${LV}</div>
    <div class="smi-team">${team ? `${team.emoji} You are on team ${esc(team.name)}` : ''}</div>
    <div class="smi-count" id="smiN"></div>
    <p class="smi-tip">Walk to a glowing pad and stand on it. Do tasks, earn points, find clues.</p></div>`;
  document.body.append(o);
  const n = o.querySelector('#smiN'); const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const show = (txt, cls) => { n.textContent = txt; n.className = 'smi-count ' + (cls ?? ''); void n.offsetWidth; n.classList.add('pop'); };
  const fast = reduceMotion();
  const gap = fast ? 400 : 800;
  sfx('whoosh');
  at(700, () => { show('3'); sfx('tick'); sfx('blip'); });
  at(700 + gap, () => { show('2'); sfx('blip'); });
  at(700 + gap * 2, () => { show('1'); sfx('blip'); });
  at(700 + gap * 3, () => { show('GO!', 'go'); sfx('ding'); sfx('whoosh'); o.classList.add('going'); });
  const end = () => { timers.forEach(clearTimeout); clearInterval(watch); if (!o.isConnected) return; o.classList.add('out'); setTimeout(() => o.remove(), 350); onDone?.(); };
  at(700 + gap * 3 + 650, end);
  const watch = setInterval(() => { if (!anchor.isConnected) { timers.forEach(clearTimeout); clearInterval(watch); o.remove(); onDone?.(); } }, 600);
  return end;
}

// A short banner over the screen ("Time's up!", "The final vote"): it never blocks a tap and goes away by itself.
export function splash({ emoji, title, sub = '', sound = 'whoosh', ms = 1600 }) {
  const o = document.createElement('div');
  o.className = 'sm-splash';
  o.innerHTML = `<div class="sms-card"><div class="sms-e">${emoji}</div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  document.body.append(o);
  sfx(sound);
  setTimeout(() => o.classList.add('out'), ms - 350);
  setTimeout(() => o.remove(), ms);
}
