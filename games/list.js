// Helpers for long lists of players: search by name and paginate, so a big room never makes a screen endless.
import { normName } from './names.js';

export function search(items, query, get = x => x.name) {
  const q = normName(query);
  return q ? items.filter(i => normName(get(i)).includes(q)) : items;
}

// Returns one page of items plus the (clamped) page number and page count.
export function paginate(items, page, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  return { items: items.slice(p * perPage, p * perPage + perPage), page: p, pages, total: items.length };
}
