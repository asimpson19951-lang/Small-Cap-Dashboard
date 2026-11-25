// sections.mjs: full-screen sections with one-notch-one-section scrolling (BOARD_RULES R19, Austin Nov 24 2026:
// "Each section needs to be built as one full screen page. when the mouse scrolls, it should wheel down to the new section").
//
// How it works (deterministic, no per-module wrappers, survives every module re-render):
// 1. The active tab panel is split into content blocks: direct children, descending through plain block wrappers
//    that are taller than the screen. Grids, tables and panels stay whole.
// 2. Blocks are packed top to bottom into screens (viewport minus the sticky tab bar). A block taller than a screen
//    becomes its own taller section: it stays fully reachable, the wheel scrolls inside it until its edge.
// 3. The last block of each section gets a bottom margin so the next section starts exactly one screen lower:
//    no half-cut panel ever peeks in under a section. The first block of each section carries [data-snap-start].
// 4. Wheel: one notch = the next / previous section (smooth, locked ~650 ms so a trackpad flick moves one).
//    Keys: PageDown / PageUp / ArrowDown / ArrowUp / Home / End. Space is NOT bound here (it belongs to the list walk).
//    Section dots on the right edge jump to a section (buttons, never hash links).
// 5. Under 768 px wide (phone), everything is switched off and the page scrolls normally.
//
// 6. Scroll panes (Austin, Nov 25 2026: "make these windows scroll wheels within themselves. So that the chart can be
//    accessible at the top while moving thru the list"): on wide screens every table box (.tw, or a div that holds
//    only a table) taller than the room left in its panel gets a capped height and scrolls inside itself, header row
//    pinned. The wheel scrolls the box first; at its edge the next notch steps sections as before. Re-measured on every
//    layout without un-capping, so a re-render never throws the box back to its top.
//
// Coexistence: a wheel the chart already handled (event.defaultPrevented, chart hosts, inner scrollers that can
// still move) is left alone; an open modal or overlay disables the section wheel.

const PHONE_MAX = 768;
const LOCK_MS = 650;
const GAP = 10; // px of air between the tab bar and a section's first block
const DESCEND = new Set(['block', 'flow-root', 'contents']);

const padded = new Map(); // element -> original inline marginBottom
const panes = new Map(); // scroll-pane box -> original inline { maxHeight, overflowY }
const PANE_MIN = 0.45; // a pane never gets less than this share of a screen
let starts = []; // [{ el, label }]
let lastPanel = null;
let panelPad = null;
let lockUntil = 0;
let raf = 0;
let dotsHost = null;
let enabled = false;

const onPhone = () => window.innerWidth < PHONE_MAX;
const navH = () => {
  const nav = document.querySelector('nav.view-tabs');
  return nav ? Math.round(nav.getBoundingClientRect().height) : 0;
};
const screenH = () => window.innerHeight - navH();
const activePanel = () => document.querySelector('[data-view-panel]:not([hidden])');
const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

function visible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed' || s.position === 'absolute') return false;
  const bb = el.getBoundingClientRect();
  return bb.height > 0 && bb.width > 0;
}

/** Content blocks of a panel in reading order. */
export function blocksOf(root, avail) {
  const out = [];
  const walk = (el, depth) => {
    for (const c of el.children) {
      if (!visible(c) || c.matches('script,style,template,.snap-dots')) continue;
      const s = getComputedStyle(c);
      const kids = [...c.children].filter(visible);
      const plain = DESCEND.has(s.display) || (s.display === 'flex' && s.flexDirection === 'column');
      const tall = c.getBoundingClientRect().height > avail;
      const isPanel = c.matches('table,details,svg,.panel,.tile,.strip,[data-section-atomic]');
      if (depth < 6 && plain && tall && kids.length >= 1 && !isPanel) walk(c, depth + 1);
      else out.push(c);
    }
  };
  walk(root, 0);
  return out;
}

/** A title row: a heading, or a short block whose main content is a heading (no table, chart or list under it). */
function headingLike(el) {
  if (el.matches('h1,h2,h3,h4,.r2t2-rule,[data-section-heading]')) return true;
  if (el.getBoundingClientRect().height > 90) return false;
  return !!el.querySelector(':scope > h1, :scope > h2, :scope > h3') && !el.querySelector('table,svg,ol,ul,.strip');
}

function labelOf(el) {
  const h = el.matches('h1,h2,h3') ? el : el.querySelector('h1,h2,h3,summary');
  const t = (h?.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  return t.slice(0, 60);
}

function reset() {
  for (const [el, mb] of padded) el.style.marginBottom = mb;
  padded.clear();
  document.querySelectorAll('[data-snap-start]').forEach((el) => el.removeAttribute('data-snap-start'));
  if (panelPad) { panelPad.style.paddingBottom = ''; panelPad = null; }
  starts = [];
}

function addPad(el, px) {
  if (px <= 0.5) return;
  if (!padded.has(el)) padded.set(el, el.style.marginBottom);
  const cur = parseFloat(getComputedStyle(el).marginBottom) || 0;
  el.style.marginBottom = `${Math.round(cur + px)}px`;
}

/** Recompute sections for the active tab. */
export function layout() {
  raf = 0;
  // REDTEAM_POLISH #6: reset() strips the padding that lets the last section sit at the top; the forced reflow would
  // clamp scrollY (a 483 px jump on every module re-render). Pin the page height (on body, so the panel's own
  // measurements stay true) while re-measuring.
  const body = document.body;
  const pinH = body ? body.getBoundingClientRect().height : 0;
  const prevMin = body ? body.style.minHeight : '';
  if (pinH) body.style.minHeight = `${Math.ceil(pinH)}px`;
  const y0 = window.scrollY;
  const w0 = document.querySelector('[data-walk-current]');
  const walked = w0 && onView(w0) ? w0 : null;
  // A page that sat on a section start stays on that section's start after the re-layout (the start may move).
  let aligned = -1;
  if (starts.length && lastPanel === activePanel()) {
    const k = currentIndex();
    if (starts[k]?.el?.isConnected && Math.abs(targetY(starts[k].el) - y0) <= 4) aligned = k;
  }
  try { doLayout(); } finally {
    if (pinH) body.style.minHeight = prevMin;
  }
  if (Date.now() < lockUntil) return; // a go() is in flight; its settle check re-aims it
  const want = aligned >= 0 && starts[aligned] ? targetY(starts[aligned].el) : y0;
  if (Math.abs(window.scrollY - want) > 1) window.scrollTo({ top: want, behavior: 'instant' });
  // The walked row (list walk) stays on screen through a re-layout.
  if (walked && walked.isConnected && !onView(walked)) reveal(walked);
}

const onView = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > navH() && r.top < window.innerHeight; };

function uncapPane(box) {
  const o = panes.get(box);
  if (!o) return;
  box.style.maxHeight = o.maxHeight;
  box.style.overflowY = o.overflowY;
  box.removeAttribute('data-pane-scroll');
  panes.delete(box);
}

function paneBox(table) {
  if (table.parentElement?.closest('table')) return null;
  const tw = table.closest('.tw');
  if (tw && tw.contains(table)) return tw;
  const p = table.parentElement;
  if (p && p.tagName === 'DIV' && [...p.children].filter(visible).length === 1) return p;
  return null;
}

const paneMem = new Map(); // pane key -> last scrollTop; survives module re-renders and tab switches (REDTEAM #1)

function paneKey(box) {
  const view = box.closest('[data-view-panel]')?.dataset.viewPanel || '';
  const t = box.querySelector('table');
  if (t?.dataset.skCapKey) return `${view}|${t.dataset.skCapKey}`;
  const host = box.parentElement?.closest('[id]');
  const head = (t?.tHead?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  // A fold is part of the key (REDTEAM_2 #2): Calendar's open list and its all-reports fold share host + header.
  const det = box.closest('details');
  return `${view}|${host?.id || ''}|${det ? `fold:${det.className}` : ''}|${head}`;
}

/** Height under a box inside its OWN column of host: a side-by-side neighbour never counts (REDTEAM #3). */
function belowInColumn(box, host) {
  if (!host || host === box) return 0;
  const bb = box.getBoundingClientRect();
  let bottom = bb.bottom;
  for (let el = box; el && el !== host && host.contains(el); el = el.parentElement) {
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) {
      if (!visible(s)) continue;
      const r = s.getBoundingClientRect();
      if (r.left < bb.right - 1 && r.right > bb.left + 1 && r.top >= bb.bottom - 1) bottom = Math.max(bottom, r.bottom);
    }
  }
  // Padding + border of every element from the box's parent up to the host (REDTEAM_2 #1: .nd-pb's inner padding).
  let pad = 0;
  for (let el = box.parentElement; el && host.contains(el); el = el.parentElement) {
    const s = getComputedStyle(el);
    pad += (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.borderBottomWidth) || 0);
    if (el === host) break;
  }
  return Math.max(0, bottom - bb.bottom) + pad;
}

const paneHost = (box, panel) => {
  const h = box.parentElement?.closest('.panel, .card, .nd-sec, .nd-rb, section:not([data-view-panel]), details');
  return h && panel && panel.contains(h) ? h : box;
};

function paneRestore() {
  const live = [...panes.keys()].filter((box) => box.isConnected && !box.closest('[data-view-panel][hidden]'));
  const count = new Map();
  for (const box of live) { const k = paneKey(box); count.set(k, (count.get(k) || 0) + 1); }
  for (const box of live) {
    const k = paneKey(box);
    if (count.get(k) > 1) continue; // never restore a key two live panes share
    const want = paneMem.get(k);
    if (want > 0 && Math.abs(box.scrollTop - want) > 1) box.scrollTop = want;
  }
}

/** Cap every over-tall table box in the active panel so it scrolls inside itself (rule 6 above). */
export function capPanes(panel, on) {
  // Boxes in a hidden tab keep their cap (REDTEAM #1); only detached boxes, or everything on a phone, are released.
  for (const box of [...panes.keys()]) if (!on || !box.isConnected) uncapPane(box);
  if (!on || !panel) return;
  const avail = screenH() - GAP;
  const seen = new Set();
  for (const t of panel.querySelectorAll('table')) {
    const box = paneBox(t);
    if (!box || seen.has(box)) continue;
    seen.add(box);
    if (box.closest('[data-pane-scroll-off], .snap-dots') || box.closest('details:not([open])')) { uncapPane(box); continue; }
    if (!visible(box)) continue;
    const mine = panes.has(box);
    // An author-set inner scroller (now-desk, gamma) already bounds itself: leave it alone.
    if (!mine && /(auto|scroll)/.test(getComputedStyle(box).overflowY) && getComputedStyle(box).maxHeight !== 'none') continue;
    const host = paneHost(box, panel);
    const bb = box.getBoundingClientRect();
    const above = host === box ? 0 : Math.max(0, bb.top - host.getBoundingClientRect().top);
    const below = belowInColumn(box, host);
    const cap = Math.round(Math.max(avail * PANE_MIN, avail - above - below - 6));
    // Decide in ONE padding state (REDTEAM #2): the tight pane padding is off while measuring, so a box can never
    // flip between capped and uncapped on alternate layouts.
    if (box.hasAttribute('data-pane-scroll')) box.removeAttribute('data-pane-scroll');
    const natural = box.scrollHeight + (box.offsetHeight - box.clientHeight); // content + horizontal scrollbar
    if (natural <= cap + 2) { uncapPane(box); continue; }
    if (!mine) panes.set(box, { maxHeight: box.style.maxHeight, overflowY: box.style.overflowY });
    if (box.style.maxHeight !== `${cap}px`) box.style.maxHeight = `${cap}px`;
    box.style.overflowY = 'auto';
    box.setAttribute('data-pane-scroll', '');
  }
}

/** Shrink the capped panes inside block b so b ends by `limit` (document y), if every pane keeps PANE_MIN. */
function fitPanes(b, limit) {
  const inside = [...panes.keys()].filter((box) => b.contains(box));
  if (!inside.length) return false;
  const bBottom = docTop(b) + b.getBoundingClientRect().height;
  if (bBottom <= limit) return false;
  const avail = screenH() - GAP;
  const plan = [];
  for (const box of inside) {
    const r = box.getBoundingClientRect();
    const boxTop = docTop(box);
    // what sits under this pane inside the block, in its own column
    const host = box.parentElement?.closest('.panel, .card, .nd-sec, .nd-rb, section:not([data-view-panel]), details');
    const below = host && b.contains(host) ? belowInColumn(box, host) : 0;
    const room = Math.floor(limit - boxTop - below - 6);
    if (room < avail * PANE_MIN) return false;
    plan.push([box, Math.min(room, Math.round(r.height))]);
  }
  const prev = plan.map(([box]) => box.style.maxHeight);
  for (const [box, h] of plan) box.style.maxHeight = `${h}px`;
  // Another column of the block (a side table) may still run past the screen: then the shrink buys nothing, undo it.
  if (docTop(b) + b.getBoundingClientRect().height > limit + 1) { plan.forEach(([box], i) => { box.style.maxHeight = prev[i]; }); return false; }
  return true;
}

function doLayout() {
  reset();
  const panel = activePanel();
  enabled = !!panel && !onPhone();
  capPanes(panel, enabled);
  document.documentElement.classList.toggle('snap-on', enabled);
  document.documentElement.style.setProperty('--snap-nav', `${navH()}px`);
  if (!enabled) { renderDots(); return; }
  const avail = screenH() - GAP;
  const blocks = blocksOf(panel, avail);
  if (!blocks.length) { renderDots(); return; }
  // Greedy pack: a section starts at a block and takes following blocks while they end inside one screen.
  const groups = [];
  let cur = null;
  for (const b of blocks) {
    const top = docTop(b), bottom = top + b.getBoundingClientRect().height;
    // A sparse section (under 45% of a screen used) keeps an oversized next block instead of leaving a near-empty screen;
    // the section is then taller than the viewport and the wheel scrolls through it natively before stepping on.
    // [data-section-start] (the TI list + chart) always opens its own one-screen section.
    const own = b.matches('[data-section-start]');
    // Rule 6: a block holding a capped pane first tries to stay with what sits above it (the chart / tiles): the pane
    // shrinks to the room left on this screen, never under PANE_MIN of a screen. Without that room it opens its own
    // section at its host-based cap.
    if (cur && !own && !cur.tall) fitPanes(b, cur.top + avail);
    const sparse = cur && !cur.tall && !own && top - cur.top < avail * 0.45;
    if (sparse && bottom - cur.top > avail) { cur.blocks.push(b); cur.tall = true; continue; }
    if (!cur || own || bottom - cur.top > avail) {
      // Keep-with-next: a heading or title row never ends a section; it moves down with the content it names.
      const carry = [];
      while (cur && cur.blocks.length > 1 && headingLike(cur.blocks[cur.blocks.length - 1])) carry.unshift(cur.blocks.pop());
      cur = { top: carry.length ? docTop(carry[0]) : top, blocks: [...carry, b] };
      groups.push(cur);
    } else cur.blocks.push(b);
  }
  // A short tail (a button bar, a rule line) never gets a near-empty screen of its own: it joins the section above.
  if (groups.length > 1) {
    const lg0 = groups[groups.length - 1], lb = lg0.blocks[lg0.blocks.length - 1];
    const h = docTop(lb) + lb.getBoundingClientRect().height - lg0.top;
    if (h < avail * 0.3) groups[groups.length - 2].blocks.push(...groups.pop().blocks);
  }
  // Rule 6 guard (REDTEAM #3): a pane never ends below its own section's screen, the first section included. It shrinks
  // to the room left (never under PANE_MIN); a taller neighbour column still makes a tall section that scrolls natively.
  for (const g of groups) {
    const limit = docTop(g.blocks[0]) + avail;
    for (const box of panes.keys()) {
      if (!box.isConnected || !g.blocks.some((b) => b.contains(box))) continue;
      const room = Math.floor(limit - docTop(box) - belowInColumn(box, paneHost(box, panel)) - 6);
      const h = box.getBoundingClientRect().height;
      if (room >= avail * PANE_MIN && room < h - 1) box.style.maxHeight = `${room}px`;
    }
    // REDTEAM_2 #1: if the section still runs past one screen (margins the box math cannot see), take the overrun
    // off its tallest pane, never under PANE_MIN, so the wheel does not treat it as a tall section.
    const gi = groups.indexOf(g);
    if (gi < groups.length - 1) {
      const over = Math.ceil(docTop(groups[gi + 1].blocks[0]) - docTop(g.blocks[0]) - avail);
      if (over > 0) {
        const mine = [...panes.keys()].filter((box) => box.isConnected && g.blocks.some((b) => b.contains(box)));
        const tallest = mine.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
        const h = tallest ? tallest.getBoundingClientRect().height : 0;
        if (tallest && h - over >= avail * PANE_MIN) tallest.style.maxHeight = `${Math.floor(h - over)}px`;
      }
    }
  }
  // Pad each section to a full screen so the next one starts exactly one screen lower. Two passes absorb margin collapse.
  for (let i = 0; i < groups.length - 1; i += 1) {
    const g = groups[i], last = g.blocks[g.blocks.length - 1], next = groups[i + 1].blocks[0];
    // REDTEAM_POLISH #12: up to four passes, so margin collapse never leaves the next panel peeking in by a few px.
    for (let pass = 0; pass < 4; pass += 1) {
      const used = docTop(next) - docTop(g.blocks[0]);
      if (used >= avail - 0.5) break;
      addPad(last, avail - used);
    }
  }
  // The last section also fills the screen, so it can sit at the top like every other one.
  const lg = groups[groups.length - 1];
  const tail = avail - (panel.getBoundingClientRect().bottom - lg.blocks[0].getBoundingClientRect().top);
  if (groups.length > 1 && tail > 0) { panel.style.paddingBottom = `${Math.round(tail)}px`; panelPad = panel; }
  starts = groups.map((g, i) => {
    g.blocks[0].setAttribute('data-snap-start', '');
    return { el: g.blocks[0], label: g.blocks.map(labelOf).find(Boolean) || `Section ${i + 1}` };
  });
  lastPanel = panel;
  paneRestore();
  renderDots();
}

export function schedule() {
  if (!raf) raf = requestAnimationFrame(layout);
}

const targetY = (el) => Math.max(0, Math.round(docTop(el) - navH() - GAP));

/** Index of the section the viewport currently sits in. */
export function currentIndex() {
  const y = window.scrollY + 4;
  let i = 0;
  starts.forEach((s, k) => { if (targetY(s.el) <= y) i = k; });
  return i;
}

let settleTimer = 0;
function go(i, behavior = 'smooth') {
  if (!starts.length) return;
  const k = Math.max(0, Math.min(starts.length - 1, i));
  window.__walkSettleCancel?.(); // a section move ends the list walk's follow-up (it must not pull the page back)
  lockUntil = Date.now() + LOCK_MS;
  window.scrollTo({ top: targetY(starts[k].el), behavior });
  markDot(k);
  // REDTEAM_POLISH #2: a module re-render during the smooth scroll can move the target; land exactly on it.
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const el = starts[k]?.el;
    if (!el || !el.isConnected) return;
    const t = targetY(el);
    if (Math.abs(window.scrollY - t) > 1) window.scrollTo({ top: t, behavior: 'instant' });
    markDot(currentIndex());
  }, LOCK_MS + 30);
}

/** Index of the section holding an element (by its document top). */
export function sectionOf(el) {
  if (!starts.length || !el) return -1;
  const top = docTop(el);
  let k = 0;
  starts.forEach((s, i) => { if (s.el.isConnected && docTop(s.el) <= top + 1) k = i; });
  return k;
}

/**
 * Bring an element (a walked list row) into view inside its own section (REDTEAM_POLISH #4, ask 7). A section that
 * fits one screen is moved to its start (the page follows the walk section by section); inside a taller section the
 * page scrolls just enough to show the row, never past the section's edges. Instant, so the walk stays crisp.
 */
export function reveal(el) {
  if (!el || !el.isConnected) return false;
  paneKeep(el);
  const r = el.getBoundingClientRect();
  const nav = navH();
  const inView = r.top >= nav && r.bottom <= window.innerHeight;
  if (enabled && starts.length && !starts.some((s) => !s.el.isConnected)) {
    // A section that fits one screen is shown whole: the walked row AND whatever sits beside it (the TI chart).
    const k = sectionOf(el), top = targetY(starts[k].el);
    // the last section ends at the page bottom, so its span is measured to the page end, not to its last scroll stop
    const span = k + 1 < starts.length ? sectionEnd(k) - top : document.documentElement.scrollHeight - window.innerHeight - top + screenH();
    if (span <= screenH() + 4) {
      if (Math.abs(window.scrollY - top) <= 4) return false;
      lockUntil = Date.now() + 120;
      window.scrollTo({ top, behavior: 'instant' });
      markDot(k);
      return true;
    }
  }
  if (inView) return false;
  if (!enabled || !starts.length) {
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return true;
  }
  // A module that re-rendered on the walk's click detached the old section starts: re-measure first.
  if (starts.some((s) => !s.el.isConnected)) { if (raf) { cancelAnimationFrame(raf); raf = 0; } layout(); }
  if (!starts.length) { el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return true; }
  const k = sectionOf(el);
  const top = targetY(starts[k].el), end = sectionEnd(k);
  lockUntil = Date.now() + 120;
  const span2 = k + 1 < starts.length ? end - top : document.documentElement.scrollHeight - window.innerHeight - top + screenH();
  if (span2 <= screenH() + 4) {
    window.scrollTo({ top, behavior: 'instant' });
  } else {
    const rowTop = r.top + window.scrollY;
    const want = rowTop - nav - Math.max(GAP, (screenH() - r.height) / 3);
    window.scrollTo({ top: Math.max(top, Math.min(end, Math.round(want))), behavior: 'instant' });
  }
  markDot(k);
  return true;
}

/** Scroll a capped pane so a row inside it sits below the pinned header and above the box bottom. */
export function paneKeep(el) {
  const box = el?.closest?.('[data-pane-scroll]');
  if (!box) return false;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const head = box.querySelector(':scope > table > thead, :scope > * > table > thead');
  const top = b.top + (head ? head.getBoundingClientRect().height : 0);
  const bottom = b.top + box.clientHeight;
  if (r.top < top) box.scrollTop -= top - r.top;
  else if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
  else return false;
  return true;
}

function sectionEnd(i) {
  return i + 1 < starts.length ? targetY(starts[i + 1].el) : document.documentElement.scrollHeight - window.innerHeight;
}

function canInnerScroll(target, dy) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (dy < 0 && el.scrollTop > 0) return true;
    }
  }
  return false;
}

const overlayOpen = () => !!document.querySelector('#regimeChartModal:not([hidden]), #themeOverview.open, dialog[open], .sm-modal:not([hidden])');

function onWheel(e) {
  if (!enabled || e.defaultPrevented || e.ctrlKey || !starts.length || overlayOpen()) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t && t.closest('[data-interactive-chart], .chart-host, .persistent-chart svg, input, select, textarea')) return;
  const dy = e.deltaY;
  if (!dy || canInnerScroll(t, dy)) return;
  e.preventDefault();
  if (Date.now() < lockUntil) return;
  const i = currentIndex();
  const y = window.scrollY;
  const px = e.deltaMode === 1 ? dy * 40 : e.deltaMode === 2 ? dy * window.innerHeight : dy;
  if (dy > 0) {
    const end = sectionEnd(i);
    if (end - y > 4 && end - y > 0 && i + 1 < starts.length && end - targetY(starts[i].el) > screenH() + 4) {
      // Tall section: scroll inside it until its last screen, then the next notch moves on.
      // One notch moves up to a screen (minus an overlap) so a slightly-tall section costs one extra notch, not ten.
      lockUntil = Date.now() + LOCK_MS;
      window.scrollTo({ top: Math.min(end, y + Math.max(Math.abs(px), screenH() - 80)), behavior: 'smooth' });
      return;
    }
    if (i + 1 < starts.length) go(i + 1);
    else window.scrollBy({ top: Math.abs(px), behavior: 'instant' });
  } else {
    const top = targetY(starts[i].el);
    if (y - top > 4) {
      const tall = sectionEnd(i) - top > screenH() + 4;
      if (tall) { lockUntil = Date.now() + LOCK_MS; window.scrollTo({ top: Math.max(top, y - Math.max(Math.abs(px), screenH() - 80)), behavior: 'smooth' }); return; }
      go(i);
      return;
    }
    go(i - 1);
  }
}

const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function onKey(e) {
  if (!enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !starts.length || overlayOpen()) return;
  if (typing(document.activeElement)) return;
  const map = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
  if (!(e.key in map)) return;
  const a = document.activeElement;
  // Arrow keys inside a focused list row, a menu or a slider stay with that control.
  if (/^Arrow/.test(e.key) && a && a !== document.body && a.closest('[role="listbox"],[role="menu"],[role="slider"],[role="tablist"],[data-walk]')) return;
  // REDTEAM_POLISH #11: a focused table row no longer gets the browser's native 40 px arrow scroll; arrows step sections.
  e.preventDefault();
  const v = map[e.key];
  if (v === 'first') go(0);
  else if (v === 'last') go(starts.length - 1);
  else go(currentIndex() + v);
}

function renderDots() {
  if (!dotsHost) {
    dotsHost = document.createElement('nav');
    dotsHost.className = 'snap-dots';
    dotsHost.setAttribute('aria-label', 'Sections on this tab');
    dotsHost.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button[data-snap-i]') : null;
      if (b) go(Number(b.dataset.snapI));
    });
    document.body.appendChild(dotsHost);
  }
  if (!enabled || starts.length < 2) { dotsHost.hidden = true; dotsHost.innerHTML = ''; return; }
  dotsHost.hidden = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  dotsHost.innerHTML = starts.map((s, i) => `<button type="button" data-snap-i="${i}" title="${esc(s.label)}" aria-label="Section ${i + 1}: ${esc(s.label)}"><i></i></button>`).join('');
  markDot(currentIndex());
}

function markDot(i) {
  if (!dotsHost) return;
  dotsHost.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
}

let scrollRaf = 0;
function onScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; if (Date.now() >= lockUntil) markDot(currentIndex()); });
}

export function init() {
  if (typeof window === 'undefined' || window.__sectionsInit) return;
  window.__sectionsInit = true;
  window.__sections = { state: () => _state(), layout, go: (i) => go(i), reveal, sectionOf, currentIndex, paneKeep };
  const main = document.querySelector('main') || document.body;
  // Module re-renders (childList) and tab switches (the hidden attribute on panels) trigger a debounced re-layout.
  // Our own writes are style / data-snap-start attributes, which this observer does not watch.
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') { if (m.target instanceof Element && m.target.closest('.snap-dots')) continue; schedule(); return; }
      if (m.type === 'attributes' && m.attributeName === 'hidden' && m.target instanceof Element && m.target.matches('[data-view-panel]')) { schedule(); return; }
      if (m.type === 'attributes' && m.attributeName === 'open' && m.target instanceof Element && m.target.matches('details')) { schedule(); return; }
    }
  });
  mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  if ('ResizeObserver' in window) {
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      const p = activePanel();
      const h = p ? Math.round(p.getBoundingClientRect().height - (parseFloat(p.style.paddingBottom) || 0)) : 0;
      if (Math.abs(h - lastH) > 24) { lastH = h; schedule(); }
    });
    document.querySelectorAll('[data-view-panel]').forEach((p) => ro.observe(p));
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onScroll, { passive: true });
  // Rule 6: remember where each pane was scrolled (capture: element scrolls do not bubble), never while its tab is hidden.
  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.hasAttribute('data-pane-scroll') && !el.closest('[data-view-panel][hidden]')) paneMem.set(paneKey(el), el.scrollTop);
  }, { capture: true, passive: true });
  schedule();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export const _state = () => ({ enabled, starts: starts.map((s) => ({ label: s.label, top: targetY(s.el) })), panel: lastPanel?.dataset?.viewPanel, panes: panes.size });
