// Players pick their own display names, so two people can ask for the same one.
// The player who got there first keeps it; the other is shown as "Name 2", "Name 3", ...

export const normName = n => String(n ?? '').trim().toLowerCase();

// `players` is the room's presence list: [{ id, name, t }] where t is when each player joined.
export function resolveName(players, me, wanted) {
  const mine = players.find(p => p.id === me);
  if (!mine) return wanted;
  const earlier = p => p.id !== me && (p.t < mine.t || (p.t === mine.t && p.id < me));
  if (!players.some(p => earlier(p) && normName(p.name) === normName(wanted))) return wanted;
  const taken = new Set(players.filter(p => p.id !== me).map(p => normName(p.name)));
  let n = 2;
  while (taken.has(normName(`${wanted} ${n}`))) n++;
  return `${wanted} ${n}`;
}
