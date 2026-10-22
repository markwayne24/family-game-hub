// Who takes part in a game that is already running. Anyone who arrives after it began can be asked to watch until the next one,
// which matters most in Bingo: a latecomer's card would start with every number already called marked on it.

export const LATE_MODES = {
  auto: 'Automatic',
  watch: 'Always watch',
  join: 'Always join in',
};

// What newcomers do right now. "Automatic" lets each game decide (Bingo says watch, the casual games say join).
export function lateMode(setting, game) {
  return !setting || setting === 'auto' ? (game?.lateJoin ?? 'join') : setting;
}

// The people taking part when a game begins: everyone connected, plus anyone seen very recently (a dropped connection is not a newcomer).
// `admitted` maps player id -> when they were last seen. The host always takes part.
export function takePart(admitted, connectedIds, hostId, now, withinMs) {
  const set = new Set(Object.entries(admitted).filter(([, seen]) => now - seen <= withinMs).map(([id]) => id));
  for (const id of connectedIds) set.add(id);
  if (hostId) set.add(hostId);
  return set;
}

// Connected people who are not part of the running game.
export const watchers = (participants, connected) => connected.filter(p => !p.host && !participants.has(p.id)).map(p => p.id);
