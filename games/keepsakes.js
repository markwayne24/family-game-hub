import { openGiftCinematic, makeCardImage, saveImage, avatar } from './bunutan-fx.js';
import { sfx } from './fx.js';

// Results that belong to one person (like a Bunutan draw) are also kept on that person's own device,
// so they can still be opened later even when the host has left or closed the room.
const KEY = 'hubKeeps';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const loadKeeps = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveAll = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-30))); } catch { /* storage full or blocked */ } };

// keep = { room, game, round, title, toName, names, budget, date, note, fromName }
export function addKeep(k) {
  const list = loadKeeps();
  const old = list.find(x => x.room === k.room && x.game === k.game && x.round === k.round);
  const rest = list.filter(x => x !== old);
  rest.push({ ...k, opened: k.opened ?? old?.opened ?? false, savedAt: old?.savedAt ?? Date.now() });
  saveAll(rest);
}
const update = (k, patch) => saveAll(loadKeeps().map(x => (x.room === k.room && x.game === k.game && x.round === k.round ? { ...x, ...patch } : x)));
const remove = k => saveAll(loadKeeps().filter(x => !(x.room === k.room && x.game === k.game && x.round === k.round)));
export const keepsFor = room => loadKeeps().filter(x => x.room === room).reverse();

// A list of what is saved on this device (names stay hidden until opened).
export function keepsHtml(list, heading = '🎁 Saved on this device') {
  if (!list.length) return '';
  return `<section class="card keeps"><h3 style="margin-top:0">${heading}</h3><p class="muted" style="margin-top:0">These stay on your phone, even if the host has left.</p>
    ${list.map((k, i) => `<div class="keep"><div><b>${esc(k.title || 'Bunutan')}</b><div class="muted">${k.budget ? `💰 ${esc(k.budget)} · ` : ''}${k.date ? `📅 ${esc(k.date)} · ` : ''}room ${esc(k.room)}</div></div><button data-keep="${i}">${k.opened ? '👁 See my name' : '🎁 Open my gift'}</button></div>`).join('')}</section>`;
}

export function wireKeeps(root, list) {
  root.querySelectorAll('[data-keep]').forEach(b => b.addEventListener('click', () => openKeep(list[+b.dataset.keep], () => { b.textContent = '👁 See my name'; })));
}

function openKeep(k, onOpened) {
  const show = () => {
    const m = document.createElement('div');
    m.className = 'bn-modal';
    let timer = 0;
    const draw = revealed => {
      m.innerHTML = `<div class="bnm-box keepview"><div class="bn-card"><div class="bn-card-lbl">🤫 Your bunutan is</div>
        ${revealed ? `<div class="bn-card-name">${esc(k.toName)}</div>` : '<div class="bn-card-name" style="font-size:1.4rem;color:var(--mute);-webkit-text-fill-color:currentColor">Hidden for privacy</div>'}
        <div class="bn-details" style="justify-content:center">${k.budget ? `<span class="bn-pill">💰 ${esc(k.budget)}</span>` : ''}${k.date ? `<span class="bn-pill">📅 ${esc(k.date)}</span>` : ''}</div>
        <div class="bn-card-foot">${esc(k.title || 'Bunutan')}</div></div>
        <div class="bnm-btns">${revealed ? '<button class="ghost" id="kHide">🙈 Hide</button>' : '<button id="kShow">👁 Tap to see</button>'}<button id="kSave">📥 Save as image</button></div>
        <button class="ghost bnm-close" id="kRemove">🗑 Remove from this device</button><button class="ghost bnm-close" id="kClose">Close</button></div>`;
      m.querySelector('#kShow')?.addEventListener('click', () => { sfx('flip'); draw(true); clearTimeout(timer); timer = setTimeout(() => draw(false), 10000); });
      m.querySelector('#kHide')?.addEventListener('click', () => { sfx('flip'); clearTimeout(timer); draw(false); });
      m.querySelector('#kClose').addEventListener('click', () => { clearTimeout(timer); m.remove(); });
      m.querySelector('#kRemove').addEventListener('click', () => { if (confirm('Remove this from your device? You will not be able to see who you drew again.')) { clearTimeout(timer); remove(k); m.remove(); location.reload(); } });
      m.querySelector('#kSave').addEventListener('click', async e => {
        const b = e.currentTarget; b.disabled = true;
        try { await saveImage(await makeCardImage({ title: k.title, toName: k.toName, fromName: k.fromName, budget: k.budget, date: k.date, note: k.note }), `bunutan-${String(k.toName).replace(/[^\w-]+/g, '_') || 'name'}.png`); } catch (err) { console.warn(err); }
        b.disabled = false;
      });
    };
    draw(false);
    document.body.append(m);
  };
  if (k.opened) return show();
  // first time: the same gift-opening moment, even without the host
  openGiftCinematic({ names: k.names ?? [k.toName], target: k.toName, title: k.title, onDone: () => { update(k, { opened: true }); k.opened = true; onOpened?.(); show(); } });
}

export { avatar };
