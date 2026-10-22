// Players pick their own display names, so two people can ask for the same one.
// The player who got there first keeps it; the other is shown with a short ID, like "Nicole (31351)",
// so the host can tell them apart (for example when one of them wins).

export const normName = n => String(n ?? '').trim().toLowerCase();

// A stable 5-digit tag derived from the player's id, so it stays the same after a refresh.
export function shortId(id) {
  let h = 2166136261;
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 10000 + ((h >>> 0) % 90000);
}

// `players` is the room's presence list: [{ id, name, t }] where t is when each player joined.
// `current` is the name this player is showing now, so a tag, once given, doesn't change under the host's feet.
export function resolveName(players, me, wanted, current = '') {
  const mine = players.find(p => p.id === me);
  if (!mine) return wanted;
  const earlier = p => p.id !== me && (p.t < mine.t || (p.t === mine.t && p.id < me));
  const taken = new Set(players.filter(p => p.id !== me).map(p => normName(p.name)));
  const tagged = () => {
    let n = shortId(me);
    let name;
    do { name = `${wanted} (${n})`; n = n >= 99999 ? 10000 : n + 1; } while (taken.has(normName(name)));
    return name;
  };
  if (players.some(p => earlier(p) && normName(p.name) === normName(wanted))) return tagged();
  if (current && current !== wanted && current.startsWith(`${wanted} (`) && !taken.has(normName(current))) return current;
  return wanted;
}
