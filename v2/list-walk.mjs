// list-walk.mjs: the spacebar walk on EVERY list of the board (BOARD_RULES R1-R6, Nov 24 2026).
// Austin, Aug 5 2026 (DIR W2#1): "Spacebar walk" (shift+space walks up, builds on the j/k kbTicker keys, never scrolls
// the page). Austin, Nov 24 2026 (INTAKE #7): "every list on the dashboards needs the spacebar functionaly".
//
// Space / j = next row, Shift+Space / k = previous row. The active list is the list holding focus (or the last walked
// row), else the list nearest the middle of the screen. Past the last row the walk continues into the next visible list
// in reading order (top to bottom, then left to right) and wraps from the last list to the first (R2).
// Focus always moves with { preventScroll: true }. A row inside its own scrolling box (a table with overflow) is kept in
// view by moving that box. R6 as amended by R19 sections (REDTEAM_POLISH #4, Nov 24 2026): the page stays put while the
// walked row is on screen; when the walk leaves the screen, the page follows to the row inside the row's own section
// (sections.mjs reveal), so the walk never moves through invisible rows. With nothing walked yet, the walk starts in
// the first list on screen. A module that re-renders its table on click gets the walk back on the same row (found
// again by its ticker), so the walk never stalls (#5).
//
// Every row that carries a ticker is a walk row (R7: everything with a ticker is clickable and walkable). A module
// that lists things without a data-ticker marks its rows with data-walk-row.

export const WALK_ROW_SELECTOR = [
  '[data-walk-row]',
  '.ti-row[data-ticker]', '.discovery-row[data-ticker]', '.radar-row[data-ticker]',
  '.ns-row[data-ticker]', '.nd-wc[data-ticker]', '.ns-gc[data-ticker]',
  '.market-heat-tile[data-ticker]', '.theme-roster-row[data-ticker]', 'tr[data-sector-row]', 'li[data-sector-row]',
  'tr[data-ticker]', 'li[data-ticker]', 'button[data-ticker]', 'div[data-ticker]', 'a[data-ticker]',
  'tr[data-t]', 'button[data-t]', 'div[data-t]', '[data-pick]', '[data-sv-sel]', '[data-r2-sym]',
].join(', ');

// ---------- pure core (testable without a DOM) ----------
// lists: [{ top, left, size }] already filtered to visible, non-empty lists.
export function readingOrder(lists) {
  return lists.map((l, i) => ({ ...l, i })).sort((a, b) => (Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left)).map((l) => l.i);
}
// order: list indexes in reading order; sizes: rows per list (by list index); at: { list, row } or null; delta: +1 / -1.
export function stepTarget(order, sizes, at, delta) {
  if (!order.length) return null;
  if (!at || !order.includes(at.list)) {
    const list = delta > 0 ? order[0] : order[order.length - 1];
    return { list, row: delta > 0 ? 0 : sizes[list] - 1 };
  }
  const row = at.row + delta;
  if (row >= 0 && row < sizes[at.list]) return { list: at.list, row };
  const pos = order.indexOf(at.list);
  const nextList = order[(pos + (delta > 0 ? 1 : -1) + order.length) % order.length];
  return { list: nextList, row: delta > 0 ? 0 : sizes[nextList] - 1 };
}

// ---------- DOM binder ----------
function visible(el) {
  if (!el || el.closest('[hidden], details:not([open]) > :not(summary)')) return false;
  if (typeof el.getClientRects === 'function' && !el.getClientRects().length) return false;
  return true;
}

// Rows grouped by their list (the rows' shared parent: tbody, .rows, a wall, a grid).
export function collectLists(root) {
  if (!root) return [];
  const rows = [...root.querySelectorAll(WALK_ROW_SELECTOR)].filter((row) => !row.parentElement?.closest(WALK_ROW_SELECTOR) && visible(row));
  const byParent = new Map();
  for (const row of rows) {
    const key = row.closest('[data-walk-list]') || row.parentElement;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  return [...byParent.entries()].map(([el, list]) => {
    const r = list[0].getBoundingClientRect();
    return { el, rows: list, top: r.top + (typeof window !== 'undefined' ? window.scrollY : 0), left: r.left };
  });
}

const NAV_SEL = 'nav.view-tabs';
function viewTop() {
  const nav = typeof document !== 'undefined' ? document.querySelector(NAV_SEL) : null;
  return nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
}
function onScreen(el) {
  if (typeof window === 'undefined' || typeof el?.getBoundingClientRect !== 'function') return true;
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > viewTop() + 2 && r.top < window.innerHeight - 2;
}

// The first list (in reading order) with a row on screen; else the first list below the viewport top; else -1.
function firstListOnScreen(lists, order) {
  if (typeof window === 'undefined') return -1;
  for (const li of order) if (lists[li].rows.some(onScreen)) return li;
  for (const li of order) if (lists[li].rows[0].getBoundingClientRect().top >= viewTop()) return li;
  return -1;
}

// What identifies a row across a module re-render.
const KEY_ATTRS = ['ticker', 't', 'pick', 'svSel', 'r2Sym', 'sectorRow', 'walkKey'];
function rowKey(row) {
  for (const a of KEY_ATTRS) if (row?.dataset?.[a]) return { a, v: row.dataset[a] };
  return null;
}

// Keep a row visible inside its own scrolling box (never the page).
function keepInBox(row) {
  let box = row.parentElement;
  while (box && box !== document.body && box !== document.documentElement) {
    const cs = getComputedStyle(box);
    if (/(auto|scroll)/.test(cs.overflowY) && box.scrollHeight > box.clientHeight + 1) break;
    box = box.parentElement;
  }
  if (!box || box === document.body || box === document.documentElement) return;
  const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
}

// Keep the walked row (and, in a one-screen section, its whole section) on screen. sections.mjs decides; without it,
// only an off-screen row moves the page.
function show(el) {
  if (window.__sections?.reveal) { window.__sections.reveal(el); return; }
  if (!onScreen(el)) el.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
}

// #5: modules that fetch and re-render after the click replace the walked row a moment later. Find it again by its key,
// mark it, give it focus back and keep it on screen, so the walk and its outline survive the re-render.
let settleTimers = [];
function cancelSettle() { settleTimers.forEach(clearTimeout); settleTimers = []; }
if (typeof window !== 'undefined') {
  // The user moving the page (wheel, a section key, a dot) ends the walk's follow-up: it never pulls the page back.
  window.__walkSettleCancel = cancelSettle;
  window.addEventListener('wheel', cancelSettle, { passive: true });
}
function settle(root) {
  cancelSettle();
  const key = lastKey;
  settleTimers = [80, 350, 900, 1800].map((ms) => setTimeout(() => {
    if (lastKey !== key || !root.isConnected) return;
    const live = walkCurrent();
    if (live) { show(live); return; } // still the same node: just keep it on screen if a re-render moved it
    const again = refind(collectLists(root));
    if (!again) return;
    current = again;
    again.setAttribute('data-walk-current', '');
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) {
      if (again.tabIndex < 0 && !again.hasAttribute('tabindex')) again.setAttribute('tabindex', '-1');
      again.focus?.({ preventScroll: true });
    }
    keepInBox(again);
    show(again);
  }, ms));
}

let current = null; // the last walked row
let lastKey = null; // { a, v, list, row }: the last walked row, to find it again after a re-render
export function walkCurrent() { return current?.isConnected ? current : null; }

// The last walked row in freshly collected lists: the same node, else the same key (same list first), else null.
function refind(lists) {
  if (walkCurrent()) return walkCurrent();
  if (!lastKey) return null;
  const match = (r) => r.dataset?.[lastKey.a] === lastKey.v;
  const same = lists[lastKey.list]?.rows.find(match);
  if (same) return same;
  for (const l of lists) { const r = l.rows.find(match); if (r) return r; }
  return null;
}

// root: the active view element. delta: +1 / -1. activate(row): opens the detail / chart for that row.
export function walkList(root, delta, { activate, selectedTicker } = {}) {
  const lists = collectLists(root);
  if (!lists.length) return null;
  const order = readingOrder(lists);
  const sizes = lists.map((l) => l.rows.length);
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  let at = null;
  const find = (el) => { for (let li = 0; li < lists.length; li++) { const ri = lists[li].rows.indexOf(el); if (ri >= 0) return { list: li, row: ri }; } return null; };
  const holder = active?.closest?.(WALK_ROW_SELECTOR);
  const again = refind(lists);
  at = (holder && find(holder)) || (again && find(again)) || null;
  if (!at && selectedTicker) {
    for (let li = 0; li < lists.length && !at; li++) { const ri = lists[li].rows.findIndex((r) => r.dataset.ticker === selectedTicker); if (ri >= 0) at = { list: li, row: ri }; }
  }
  if (!at) {
    // nothing walked yet: start in the first list on screen, at its first (or last) row on screen
    const li = firstListOnScreen(lists, order);
    if (li >= 0) {
      const vis = lists[li].rows.map((r, i) => (onScreen(r) ? i : -1)).filter((i) => i >= 0);
      at = { list: li, row: delta > 0 ? (vis.length ? vis[0] - 1 : -1) : (vis.length ? vis[vis.length - 1] + 1 : sizes[li]) };
    }
  }
  const target = at && at.row >= 0 && at.row < sizes[at.list] ? stepTarget(order, sizes, at, delta)
    : at ? { list: at.list, row: Math.max(0, Math.min(sizes[at.list] - 1, at.row + delta)) } : stepTarget(order, sizes, null, delta);
  if (!target) return null;
  const row = lists[target.list].rows[target.row];
  const ticker = row.dataset.ticker || row.dataset.t || row.dataset.pick || row.dataset.svSel || row.dataset.r2Sym || '';
  const sx = typeof window !== 'undefined' ? window.scrollX : 0, sy = typeof window !== 'undefined' ? window.scrollY : 0;
  if (current && current !== row) current.removeAttribute?.('data-walk-current');
  const key = rowKey(row);
  lastKey = key ? { ...key, list: target.list, row: target.row } : null;
  current = row;
  const landed = activate ? activate(row, ticker) : row;
  let el = landed?.isConnected ? landed : row.isConnected ? row : null;
  if (!el && lastKey) {
    // #5: the module re-rendered its list on the click; walk on from the same row in the new table
    current = null;
    el = refind(collectLists(root));
  }
  current = el;
  if (el) {
    el.setAttribute('data-walk-current', '');
    el.focus?.({ preventScroll: true });
    keepInBox(el);
  }
  if (typeof window !== 'undefined') {
    // R6: a module handler that scrolled the page is put back ...
    if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo({ left: sx, top: sy, behavior: 'instant' });
    // ... unless the row is off screen: then the page follows to the row, inside the row's own section (R19).
    if (el) show(el);
    settle(root);
  }
  return { row: el, ticker };
}
