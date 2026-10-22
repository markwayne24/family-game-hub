// Player limit for a room. The host's browser decides who gets a seat, because there is no server.
// The host counts as a player. Someone who drops out keeps their seat for a few minutes so they can come back.

export const RESERVE_MS = 5 * 60 * 1000;

// `admitted` maps player id -> when they were last seen. `players` are the people connected right now:
// [{ id, t, host }] where t is when they joined. `max` of 0 means no limit.
// Returns the new admitted map and the ids that should be told the room is full.
export function admit(admitted, players, max, now) {
  const next = { ...admitted };
  const here = new Set(players.map(p => p.id));

  if (!max) { // no limit: everyone is in
    for (const p of players) next[p.id] = now;
    return { admitted: next, full: [] };
  }

  // seats held for people who dropped out are released after a while
  for (const [id, seen] of Object.entries(next)) if (!here.has(id) && now - seen > RESERVE_MS) delete next[id];

  // anyone already admitted (and the host) keeps their seat, even if the limit was lowered afterwards
  for (const p of players) if (next[p.id] !== undefined || p.host) next[p.id] = now;

  // newcomers take free seats in the order they joined; the rest are turned away
  const full = [];
  const newcomers = players.filter(p => next[p.id] === undefined).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  for (const p of newcomers) {
    if (Object.keys(next).length < max) next[p.id] = now;
    else full.push(p.id);
  }
  return { admitted: next, full };
}

// How the room looks from the outside: people connected, seats in use, seats held for people who dropped out.
export function summary(admitted, players, max) {
  const here = new Set(players.map(p => p.id));
  const used = Object.keys(admitted).length;
  const held = Object.keys(admitted).filter(id => !here.has(id)).length;
  return { max, used, held, full: !!max && used >= max };
}

// Let go of the seats held for people who are not connected.
export function freeHeld(admitted, players) {
  const here = new Set(players.map(p => p.id));
  return Object.fromEntries(Object.entries(admitted).filter(([id]) => here.has(id)));
}
