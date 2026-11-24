// RC2 C3b: one fetch per file for the three RC2 blocks (Gamma, ER moves, Short vol). Static files only.
const cache = new Map();
export function loadJson(url) {
  if (!cache.has(url)) cache.set(url, fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(url.split('/').pop() + ' HTTP ' + r.status); return r.json(); }).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url);
}
