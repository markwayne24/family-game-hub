import { sfx, confetti, reduceMotion } from './fx.js';
import { avatar as impAvatar } from './impostor-fx.js';

export const avatar = impAvatar;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- 1. "the names are going into the box" (everyone sees this when the host starts the draw) ---------- */
export function shuffleCinematic({ names, title }) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  sfx('whoosh'); at(250, () => sfx('shuffle')); at(1500, () => sfx('shuffle')); at(2500, () => sfx('drumroll'));
  at(4000, () => { sfx('ding'); sfx('sparkle'); });
  if (reduceMotion()) return;
  const pool = []; while (pool.length < 16) pool.push(...shuffle(names.length ? names : ['?']));
  const tags = pool.slice(0, 16).map((n, i, arr) => {
    const ang = (i / arr.length) * Math.PI * 2 + Math.random() * 0.4;
    const r = 38 + Math.random() * 10;
    return `<span class="bnc-tag" style="--x:${(Math.cos(ang) * r).toFixed(1)}vmin;--y:${(Math.sin(ang) * r).toFixed(1)}vmin;--r:${Math.round(Math.random() * 60 - 30)}deg;--d:${(0.2 + i * 0.14).toFixed(2)}s">${esc(n)}</span>`;
  }).join('');
  const box = document.createElement('div');
  box.className = 'bn-cine';
  box.innerHTML = `<div class="bnc-snow"></div><div class="bnc-stage">${tags}<div class="bnc-hat">🎁</div></div>
    <div class="bnc-text"><div class="bnc-t1">Mixing the names…</div><div class="bnc-t2">🎉 The names are in!<br><small>Open your gift to see who you drew</small></div></div>
    <small class="bnc-skip">tap to skip</small>`;
  const done = () => { timers.forEach(clearTimeout); box.classList.add('out'); setTimeout(() => box.remove(), 400); };
  box.addEventListener('click', done);
  document.body.append(box);
  timers.push(setTimeout(done, 5600));
}

/* ---------- 2. opening your own gift: the box shakes, pops, the names spin and land on yours ---------- */
export function openGiftCinematic({ names, target, title, fromName, onLanded, onDone }) {
  const timers = []; let raf = 0; let finished = false;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const quick = reduceMotion();
  const box = document.createElement('div');
  box.className = 'bn-cine open';
  const reelNames = (() => { // a long reel of names; the last one is the winner
    const base = names.length ? names : [target];
    const out = []; while (out.length < 34) out.push(...shuffle(base));
    const reel = out.slice(0, 34);
    if (reel[33] === target) reel[33] = target; else reel[33] = target;
    if (reel[32] === target && base.length > 1) reel[32] = base.find(n => n !== target);
    return reel;
  })();
  box.innerHTML = `<div class="bnc-snow"></div>
    <div class="bnc-step s1"><div class="bnc-gift3d"><i class="g-lid"></i><i class="g-body"></i><i class="g-rib"></i><i class="g-bow"></i></div><p>Opening your gift…</p></div>
    <div class="bnc-step s2"><p class="bnc-draw">Drawing a name…</p><div class="bnc-win"><div class="bnc-reel">${reelNames.map(n => `<div class="bnc-item">${esc(n)}</div>`).join('')}</div><i class="bnc-pointer l"></i><i class="bnc-pointer r"></i></div></div>
    <div class="bnc-step s3"><div class="bnc-ribbon">🎁 You drew</div><div class="bnc-big">${esc(target)}</div><p class="bnc-shh">🤫 Keep it a secret!</p>${title ? `<p class="bnc-ev">${esc(title)}</p>` : ''}<button class="bnc-go" id="bncGo">Continue</button></div>`;
  document.body.append(box);
  const finish = () => { if (finished) return; finished = true; timers.forEach(clearTimeout); cancelAnimationFrame(raf); box.classList.add('out'); setTimeout(() => box.remove(), 400); onDone?.(); };
  const land = () => {
    box.classList.remove('s2on'); box.classList.add('s3on');
    sfx('win'); sfx('sparkle'); confetti(); at(500, confetti);
    try { navigator.vibrate?.([80, 40, 160]); } catch { /* not supported */ }
    onLanded?.();
  };
  box.querySelector('#bncGo').addEventListener('click', finish);
  if (quick) { box.classList.add('s3on'); sfx('win'); onLanded?.(); return; }

  // stage 1: the box shakes, then pops open
  box.classList.add('s1on');
  sfx('rustle'); at(500, () => sfx('rustle')); at(1000, () => sfx('rustle'));
  at(1500, () => { box.classList.add('popped'); sfx('pop'); sfx('whoosh'); confetti(); });
  // stage 2: the reel spins and slows to a stop on the winner (a tick for every name that passes)
  at(2100, () => {
    box.classList.remove('s1on'); box.classList.add('s2on');
    const reel = box.querySelector('.bnc-reel'); const ITEM = 64; const last = reelNames.length - 1; const T = 4200;
    const t0 = performance.now(); let lastIdx = -1;
    const frame = now => {
      const k = Math.min(1, (now - t0) / T);
      const pos = (1 - Math.pow(1 - k, 4)) * last;          // fast, then slower and slower
      reel.style.transform = `translateY(${-pos * ITEM}px)`;
      const idx = Math.floor(pos + 0.5);
      if (idx !== lastIdx) { lastIdx = idx; sfx('tick'); }
      if (k < 1) raf = requestAnimationFrame(frame); else at(350, land);
    };
    sfx('drumroll'); raf = requestAnimationFrame(frame);
  });
}

/* ---------- 3. the picture they can keep ---------- */
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function fitText(g, text, maxW, start, min, font) {
  let size = start; g.font = `${font.replace('{s}', size)}`;
  while (size > min && g.measureText(text).width > maxW) { size -= 4; g.font = font.replace('{s}', size); }
  return size;
}
function wrap(g, text, maxW, maxLines) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export async function makeCardImage({ title, toName, fromName, budget, date, note }) {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const F = 'system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  // background
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b3d2e'); bg.addColorStop(0.5, '#14573f'); bg.addColorStop(1, '#8f1730');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  glow(180, 200, 520, 'rgba(255,217,102,.22)'); glow(950, 1180, 600, 'rgba(255,120,120,.25)');
  // snow
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) { g.globalAlpha = 0.25 + rnd() * 0.55; g.fillStyle = '#fff'; g.beginPath(); g.arc(rnd() * W, rnd() * H, 2 + rnd() * 6, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  // gold frame
  const gold = g.createLinearGradient(0, 0, W, 0); gold.addColorStop(0, '#f7d774'); gold.addColorStop(0.5, '#fff3b0'); gold.addColorStop(1, '#e0a526');
  g.strokeStyle = gold; g.lineWidth = 8; roundRect(g, 34, 34, W - 68, H - 68, 46); g.stroke();
  g.lineWidth = 2; g.globalAlpha = 0.6; roundRect(g, 54, 54, W - 108, H - 108, 34); g.stroke(); g.globalAlpha = 1;
  // header: gift + event title
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `150px ${F}`; g.fillStyle = '#fff'; g.fillText('🎁', W / 2, 250);
  g.font = `800 66px ${F}`; g.fillStyle = '#fff6d6';
  const tl = wrap(g, String(title || 'Bunutan'), W - 220, 2);
  tl.forEach((l, i) => g.fillText(l, W / 2, 345 + i * 74));
  const afterTitle = 345 + (tl.length - 1) * 74;
  g.font = `600 34px ${F}`; g.fillStyle = '#ffd9a0'; g.fillText('SECRET GIFT EXCHANGE', W / 2, afterTitle + 62);
  // the white card
  const cy = afterTitle + 120, ch = 500;
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 50; g.shadowOffsetY = 24;
  g.fillStyle = '#fffaf0'; roundRect(g, 100, cy, W - 200, ch, 44); g.fill(); g.restore();
  g.strokeStyle = '#e8c15a'; g.lineWidth = 4; roundRect(g, 124, cy + 24, W - 248, ch - 48, 30); g.stroke();
  g.fillStyle = '#a61e4d'; g.font = `700 40px ${F}`; g.fillText('🤫  MY DRAW IS', W / 2, cy + 110);
  g.fillStyle = '#d4a017'; g.font = `36px ${F}`; g.fillText('✦ ✦ ✦', W / 2, cy + 160);
  const name = String(toName || '?');
  const size = fitText(g, name, W - 340, 170, 56, `900 {s}px ${F}`);
  g.font = `900 ${size}px ${F}`;
  const nameGrad = g.createLinearGradient(0, cy + 200, 0, cy + 360); nameGrad.addColorStop(0, '#c2255c'); nameGrad.addColorStop(1, '#8f1730');
  g.fillStyle = nameGrad; g.fillText(name, W / 2, cy + 300 + size * 0.12);
  // details
  const pills = [budget && `💰 ${budget}`, date && `📅 ${date}`].filter(Boolean);
  if (pills.length) {
    g.font = `700 34px ${F}`;
    const widths = pills.map(p => g.measureText(p).width + 64); const total = widths.reduce((a, b) => a + b, 0) + (pills.length - 1) * 20;
    let x = (W - total) / 2; const y = cy + ch - 120;
    pills.forEach((p, i) => { g.fillStyle = '#fdecc8'; roundRect(g, x, y, widths[i], 64, 32); g.fill(); g.fillStyle = '#7a4b00'; g.textAlign = 'left'; g.fillText(p, x + 32, y + 44); x += widths[i] + 20; });
    g.textAlign = 'center';
  }
  // note + footer
  let ny = cy + ch + 80;
  if (note) { g.font = `italic 600 38px ${F}`; g.fillStyle = '#fff1c9'; wrap(g, `“${note}”`, W - 240, 2).forEach((l, i) => g.fillText(l, W / 2, ny + i * 50)); ny += 110; }
  g.font = `800 44px ${F}`; g.fillStyle = '#fff'; g.fillText('Shhh… keep it a secret! 🤐', W / 2, Math.min(H - 170, ny + 20));
  g.font = `500 28px ${F}`; g.fillStyle = '#ffffffaa';
  g.fillText(fromName ? `Drawn by ${fromName}  ·  Family Game Hub` : 'Family Game Hub', W / 2, H - 100);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// Show the picture (so it can also be saved by long-pressing it) and offer to share or download it.
export function saveImage(blob, filename, { onSaved } = {}) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const file = new File([blob], filename, { type: 'image/png' });
    const canShare = !!navigator.canShare?.({ files: [file] }); // phones: opens the share sheet (Messenger, Viber, Photos...)
    const m = document.createElement('div');
    m.className = 'bn-modal';
    m.innerHTML = `<div class="bnm-box"><img alt="Your draw picture" src="${url}"><p class="muted">Tip: you can also press and hold the picture to save it.</p>
      <div class="bnm-btns ${canShare ? 'two' : ''}">${canShare ? '<button id="bnmShare">📤 Share</button>' : ''}<button id="bnmDl" class="${canShare ? 'ghost' : ''}">📥 Download</button></div>
      <button class="ghost bnm-close" id="bnmClose">Close</button></div>`;
    const close = () => { m.remove(); URL.revokeObjectURL(url); resolve(); };
    m.querySelector('#bnmClose').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('#bnmShare')?.addEventListener('click', async () => {
      try { await navigator.share({ files: [file], title: 'My draw', text: 'Shh! This is who I drew 🎁' }); onSaved?.('share'); } catch (e) { if (e?.name !== 'AbortError') console.warn(e); }
    });
    m.querySelector('#bnmDl').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      onSaved?.('download');
      sfx('ding');
    });
    document.body.append(m);
  });
}
