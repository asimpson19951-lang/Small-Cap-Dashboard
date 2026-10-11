// NOW tab stretch board (V2.18.0). Self-wiring ES module: <script type="module" src="./now-stretch.mjs?v=V2.18.0">.
// Reads ./data/now-stretch.json (built offline by scripts/build-now-stretch.mjs). Raw primitives only: no scores, no grades.
// Copies: the stretch triplet per row (8EMA xATR, VWAP xATR, z 20d), a percentile against the name's own history with a data bar,
// Finviz-style session / min-price / min-$vol controls, the TradingView screener table | heat map | chart toggle.
// Law: EVERY ranked value sits on the official RTH close of the data's session. After-hours is its own column and is never ranked.
// Gold = row fill + edge bar only (percentile <= 5% or >= 95%), never text. Pure functions are exported for node tests.

import { marketSessionClock, previousTradingSession } from './market-calendar.mjs';

export const VERSION = 'V2.18.0';
export const NA = 'n/a';
export const EXTREME_LO = 5;
export const EXTREME_HI = 95;
export const STORE_KEY = 'radar.v2.nowView';
export const VIEWS = ['table', 'heat', 'plot'];
export const SORTS = ['pct', 'x8', 'chg', 'dvol'];
export const SESSIONS = ['pre', 'rth', 'ah'];
export const MIN_PX = [0, 1, 5];
export const MIN_DV = [0, 1e6, 1e7];
export const DEFAULT_STATE = Object.freeze({ ses: 'rth', px: 0, dv: 0, sort: 'pct', view: 'table', books: true });
const MINUS = '−';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- number formats: every finite number carries its unit; missing = n/a ----------
function signed(v, d, unit) {
  if (!fin(v)) return NA;
  const body = Math.abs(v).toFixed(d);
  if (Number(body) === 0) return `${(0).toFixed(d)}${unit}`;
  return `${v > 0 ? '+' : MINUS}${body}${unit}`;
}
export const fmtX = (v, d = 2) => signed(v, d, '×');
export const fmtChg = (v, d = 1) => signed(v, d, '%');
export const fmtZ = (v) => signed(v, 2, 'σ');
export const fmtPctl = (v) => (fin(v) ? `${v.toFixed(1)}%` : NA);
export function fmtPx(v) { return fin(v) ? `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}` : NA; }
export function fmtUsd(v) {
  if (!fin(v)) return NA;
  const a = Math.abs(v);
  return `$${a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0)}`;
}
const tone = (v) => (!fin(v) ? 'ns-na' : v > 0 ? 'ns-up' : v < 0 ? 'ns-dn' : 'ns-nt');

// ---------- ranking + gold rule (pure) ----------
// The percentile that ranks a row: 2-yr for mid/large, 1-yr for small caps. Never from the board poll or the AH print.
export function pctOf(r) {
  if (!r) return null;
  const p = r.book === 'ML' ? r.p2 : r.p1;
  return fin(p) ? p : null;
}
export const isStale = (r) => !!(r && (r.poller_stale || r.bar_stale || !fin(r.p)));
export const MIN_SESS = 250;      // same floor as the MR MAP: a percentile over fewer sessions never takes gold
export const NOMINAL = { SC: 252, ML: 504 };
// Sessions behind the row's ranked percentile (n1 for small caps, n2 for mid/large); null when the build did not record it.
export const sessOf = (r) => { const n = r && (r.book === 'ML' ? r.n2 : r.n1); return fin(n) ? n : null; };
// Why a row may NOT take gold even at an extreme percentile (null = gold allowed).
export function goldBlock(r) {
  if (isStale(r)) return 'stale';
  if (r.behind) return 'behind';                        // D4: the whole snapshot is older than the last completed session
  if (r.ca) return 'ca';                                // D6: split / corporate action inside the window
  if (r.book === 'ML' && r.p2_stale) return 'pctl-asof'; // D1: the 2-yr pctl comes from an older MR MAP snapshot
  const n = sessOf(r);
  if (n != null && n < MIN_SESS) return 'short';        // D3: short history
  return null;
}
// Gold rule: percentile <= 5% or >= 95% on the RTH-close percentile; stale / behind / split-guarded / short-history rows never take gold.
export function isExtreme(r) {
  if (goldBlock(r)) return false;
  const p = pctOf(r);
  return fin(p) && (p <= EXTREME_LO || p >= EXTREME_HI);
}
export function passes(r, st) {
  if (r.live_only) return true;
  if (!fin(r.p)) return st.px === 0 && st.dv === 0;
  return r.p >= st.px && (st.dv === 0 || (fin(r.dvol) && r.dvol >= st.dv));
}
const num = (v, d = 0) => (fin(v) ? v : d);
// Default order = distance from the 50th percentile. Stale rows last. Ties by ticker so the order is deterministic.
export function sortRows(list, key) {
  const k = (r) => {
    if (key === 'x8') return fin(r.x8) ? Math.abs(r.x8) : -1;
    if (key === 'chg') return fin(r.chg) ? Math.abs(r.chg) : -1;
    if (key === 'dvol') return num(r.dvol, -1);
    const p = pctOf(r);
    return fin(p) ? Math.abs(p - 50) : -1;
  };
  return list.slice().sort((a, b) => {
    const sa = isStale(a), sb = isStale(b);
    if (sa !== sb) return sa ? 1 : -1;
    return k(b) - k(a) || String(a.t).localeCompare(String(b.t));
  });
}

// ---------- freshness ----------
// Expected = the last completed RTH session by the clock (calendar-aware). Data is "behind" when its session is older.
export function expectedSession(nowMs = Date.now()) {
  const c = marketSessionClock(nowMs);
  if (!c) return null;
  return c.completed ? c.sessionDate : previousTradingSession(c.sessionDate);
}
export function freshness(doc, nowMs = Date.now()) {
  const expected = expectedSession(nowMs);
  const ok = !!expected && doc.session === expected;
  return { ok, expected, session: doc.session };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return NA;
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function updLabel(upd) {
  if (!upd) return 'never';
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(upd);
  return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])} ${m[4]} MT` : upd;
}

// ---------- persistence (own try/catch; a blocked store never breaks the board) ----------
export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const o = JSON.parse(raw);
    return {
      ses: SESSIONS.includes(o.ses) ? o.ses : DEFAULT_STATE.ses,
      px: MIN_PX.includes(o.px) ? o.px : DEFAULT_STATE.px,
      dv: MIN_DV.includes(o.dv) ? o.dv : DEFAULT_STATE.dv,
      sort: SORTS.includes(o.sort) ? o.sort : DEFAULT_STATE.sort,
      view: VIEWS.includes(o.view) ? o.view : DEFAULT_STATE.view,
      books: typeof o.books === 'boolean' ? o.books : DEFAULT_STATE.books,
    };
  } catch { return { ...DEFAULT_STATE }; }
}
export function saveState(storage, st) {
  try { storage?.setItem(STORE_KEY, JSON.stringify({ ses: st.ses, px: st.px, dv: st.dv, sort: st.sort, view: st.view, books: st.books })); return true; } catch { return false; }
}

// ---------- cells ----------
function d4(v, clamp, fmt) {
  if (!fin(v)) return `<span class="ns-na">${NA}</span>`;
  const w = Math.min(1, Math.abs(v) / clamp) * 50;
  return `<span class="ns-d4 ${tone(v)}">${fmt(v)}<s><i class="${v >= 0 ? 'u' : 'd'}" style="width:${w.toFixed(1)}%"></i></s></span>`;
}
export function pbar(p, suffix = '') {
  if (!fin(p)) return `<span class="ns-na">${NA}</span>`;
  const c = p >= 50 ? 'var(--ns-up)' : 'var(--ns-dn)';
  return `<span class="ns-pbar"><s><em></em><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%;background:${c}"></i></s><span class="${p >= 50 ? 'ns-up' : 'ns-dn'}">${fmtPctl(p)}</span>${suffix}</span>`;
}
// Notes under the percentile: the real session count when it is below nominal, short-history, as-of date of an older MR MAP snapshot.
export function pctNotes(r) {
  const out = [];
  const n = sessOf(r), nom = NOMINAL[r.book === 'ML' ? 'ML' : 'SC'];
  if (n != null && n < nom) out.push(`${n} sess.`);
  if (n != null && n < MIN_SESS) out.push('SHORT HISTORY · no gold');
  if (r.book === 'ML' && r.p2_stale) out.push(`as of ${dayLabel(r.p2_asof)} MT · no gold`);
  if (r.book === 'ML' && r.p2_src === 'own') out.push('own bars (not in MR MAP)');
  return out;
}
function pctCell(r) {
  if (r.ca) return `<span class="ns-na">n/a · split/CA guard ${esc(dayLabel(r.ca.d))}</span>`;
  if (r.book === 'ML' && !fin(r.p2)) { const n = sessOf(r); return `<span class="ns-na">n/a · ${n != null ? `only ${n} sess. of bars` : `&lt; ${MIN_SESS} sess. of bars`}</span>`; }
  const notes = pctNotes(r);
  return pbar(pctOf(r)) + (notes.length ? `<div class="ns-sub">${esc(notes.join(' · '))}</div>` : '');
}
export function subLine(r) {
  const bits = [`${fmtUsd(r.dvol)} $VOL`, r.dlab, r.bb].filter(Boolean);
  return bits.join(' · ');
}
function tags(r) {
  const t = [];
  if (r.poller_stale) t.push(`<span class="ns-tag ns-stale">POLLER STALE · ${esc(updLabel(r.upd).toUpperCase())}</span>`);
  if (r.mover) t.push('<span class="ns-tag">MOVER</span>');
  if (r.status) t.push(`<span class="ns-tag ${r.status === 'RUNNING' ? 'ns-run' : 'ns-fade'}">${esc(r.status)}</span>`);
  if (r.frd) t.push('<span class="ns-tag">FRD</span>');
  if (r.ca) t.push('<span class="ns-tag ns-stale">SPLIT/CA GUARD</span>');
  return t.join('');
}
function ahCell(r, st) {
  const v = st.ses === 'pre' ? r.pre_pct : r.ah_pct;
  const at = st.ses === 'pre' ? r.pre_t : r.ah_t;
  if (!fin(v)) return `<span class="ns-na">${NA}</span>`;
  return `<span class="${tone(v)}">${fmtChg(v)}</span><div class="ns-sub">${esc(at)} MT</div>`;
}

export function rowHtml(r, st, selected = null) {
  const gold = isExtreme(r);
  const p1note = r.book === 'ML' && !fin(r.p2) && fin(r.p1) ? `<div class="ns-sub">1-yr pctl ${fmtPctl(r.p1)} (own 252-session window)</div>` : '';
  if (r.live_only) {
    return `<tr data-ticker="${esc(r.t)}" class="ns-row ns-liveonly${selected === r.t ? ' ns-sel' : ''}"><td><div class="ns-tk">${esc(r.t)}<span class="ns-tag ns-stale">NOT IN LAST CLOSE BUILD</span></div><div class="ns-sub">in the live in-play book · stretch columns appear after the next close build</div></td>${'<td class="ns-na">—</td>'.repeat(7)}</tr>`;
  }
  if (!fin(r.p)) {
    return `<tr data-ticker="${esc(r.t)}" class="ns-row"><td><div class="ns-tk">${esc(r.t)}${tags(r)}</div></td><td colspan="7" class="ns-na">no bar for this session on file · not ranked</td></tr>`;
  }
  return `<tr data-ticker="${esc(r.t)}" class="ns-row${gold ? ' ns-ext' : ''}${selected === r.t ? ' ns-sel' : ''}"><td><div class="ns-tk">${esc(r.t)}${tags(r)}</div><div class="ns-sub">${esc(subLine(r))}</div>${p1note}${whyHtml(r)}</td><td>${fmtPx(r.p)}</td><td class="${tone(r.chg)}">${fmtChg(r.chg)}</td><td>${ahCell(r, st)}</td><td>${d4(r.x8, 4, (v) => fmtX(v))}</td><td>${d4(r.xv, 2, (v) => fmtX(v))}</td><td>${d4(r.z20, 3, fmtZ)}</td><td>${pctCell(r)}</td></tr>`;
}

export function bookHtml(rows, book, st, selected = null) {
  const all = rows.filter((r) => r.book === book);
  const vis = sortRows(all.filter((r) => passes(r, st)), st.sort);
  const isSc = book === 'SC';
  const hidden = all.length - vis.length;
  const liveOnly = all.filter((r) => r.live_only).length;
  const head = `<div class="ns-ph"><span class="ns-bkn ${isSc ? 'sc' : 'ml'}">${book}</span>${isSc ? 'SMALL CAP' : 'MID / LARGE'} · IN PLAY <span class="ns-r">${vis.length} of ${all.length} shown${liveOnly ? ` \u00b7 ${liveOnly} live-only (not in last close build)` : ''}${hidden ? ` \u00b7 ${hidden} hidden by the price / $vol filter` : ''}</span></div>`;
  const sesHead = st.ses === 'pre' ? 'PRE %' : 'AH %';
  const th = `<thead><tr><th>${isSc ? 'SC' : 'ML'} · NAME</th><th>RTH CLOSE</th><th>CHG %</th><th title="${st.ses === 'pre' ? 'Pre-market last 2m print before 07:30 MT' : 'After-hours last 2m print to 18:00 MT'} vs the RTH close. Never ranked.">${sesHead}</th><th>8EMA ×ATR</th><th>VWAP ×ATR</th><th>Z 20D</th><th>${isSc ? '1-YR PCTL' : '2-YR PCTL'}</th></tr></thead>`;
  return `<div class="ns-panel ns-book">${head}<div class="ns-scroll"><table class="ns-t">${th}<tbody>${vis.map((r) => rowHtml(r, st, selected)).join('')}</tbody></table></div></div>`;
}


// ---------- news why-tag with an age label (news_cache; published_at is UTC, shown in MT) ----------
export function ageLabel(iso, nowMs = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NA;
  const m = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}
const mtStamp = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NA;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.month} ${p.day} ${p.hour}:${p.minute} MT`;
};
export function whyHtml(r, nowMs = Date.now()) {
  const n = r.news;
  if (!n) return '<div class="ns-why ns-na">no ticker-named headline since the prior close</div>';
  return `<div class="ns-why"><span class="ns-tag">${esc(n.kind)}</span>${esc(n.h)}<small>${esc(n.src)} \u00b7 ${esc(mtStamp(n.at))} \u00b7 <b>${esc(ageLabel(n.at, nowMs))}</b>${n.n > 1 ? ` \u00b7 ${n.n} mover-list mentions` : ''}</small></div>`;
}

// ---------- live-only rows: names in the live in-play book that the last close build does not carry ----------
export function liveOnlyRows(liveList, docRows) {
  const have = new Set(docRows.map((r) => r.t));
  const seen = new Set();
  const out = [];
  for (const x of liveList || []) {
    const t = String(x.t || '').toUpperCase();
    if (!t || have.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push({ t, book: x.book === 'ML' ? 'ML' : 'SC', live_only: true, p: null });
  }
  return out;
}
export function readLiveInPlay(rootDoc) {
  const out = [];
  if (!rootDoc?.querySelectorAll) return out;
  for (const [id, book] of [['scRows', 'SC'], ['mlRows', 'ML']]) {
    rootDoc.querySelectorAll(`#${id} [data-part="inplay"] [data-ticker]`).forEach((n) => out.push({ t: n.dataset.ticker, book }));
  }
  return out;
}

// ---------- stretch triplet card for the detail panel ----------
export function cardHtml(r, nowMs = Date.now()) {
  if (!r) return '<div class="ns-cardnote">Not in the NOW roster \u00b7 no stretch snapshot for this name.</div>';
  if (r.live_only) return `<div class="ns-cardhd"><b>${esc(r.t)}</b><span class="ns-tag ns-stale">NOT IN LAST CLOSE BUILD</span></div><div class="ns-cardnote">In the live in-play book, but the last close build does not carry it. Stretch columns appear after the next close build.</div>`;
  if (!fin(r.p)) return `<div class="ns-cardhd"><b>${esc(r.t)}</b></div><div class="ns-cardnote">No daily bar for this session on file \u00b7 not ranked.</div>`;
  const ml = r.book === 'ML';
  const pc = pctOf(r);
  const gold = isExtreme(r);
  const pTile = ml
    ? `<div class="ns-tl${gold ? ' ns-ext' : ''}"><div class="k"><span>2-yr stretch pctl</span><span>${sessOf(r) ?? 504} sess.</span></div><div class="v ${tone((pc ?? 50) - 50)}">${fmtPctl(pc)}</div><div class="ns-rng">${fin(r.lo2) && fin(r.hi2) && r.hi2 > r.lo2 ? `<em style="left:${((0 - r.lo2) / (r.hi2 - r.lo2) * 100).toFixed(1)}%"></em><i style="left:${Math.max(0, Math.min(100, (r.x2 - r.lo2) / (r.hi2 - r.lo2) * 100)).toFixed(1)}%"></i>` : ''}</div><div class="s">2-yr \u00d7ATR range ${fmtX(r.lo2, 1)} \u2192 ${fmtX(r.hi2, 1)} \u00b7 today ${fmtX(r.x2)}${pctNotes(r).filter((x) => !x.endsWith(' sess.')).map((x) => ` · ${esc(x)}`).join('')}</div></div>`
    : `<div class="ns-tl${gold ? ' ns-ext' : ''}"><div class="k"><span>1-yr stretch pctl</span><span>${sessOf(r) ?? 252} sess.</span></div><div class="v ${tone((pc ?? 50) - 50)}">${fmtPctl(pc)}</div><div class="ns-rng"><em style="left:5%"></em><em style="left:95%"></em>${fin(pc) ? `<i style="left:${Math.max(0, Math.min(100, pc)).toFixed(1)}%"></i>` : ''}</div><div class="s">8EMA % distance vs its own year \u00b7 2-yr history n/a for small caps${r.ca ? ` · split/CA guard ${esc(dayLabel(r.ca.d))}, pctl skipped` : ''}${pctNotes(r).filter((x) => !x.endsWith(' sess.')).map((x) => ` · ${esc(x)}`).join('')}</div></div>`;
  const sesRow = (name, g, base) => (g ? `<tr><td>${name}</td><td>${fmtPx(g.o)}</td><td>${fmtPx(g.h)}</td><td>${fmtPx(g.l)}</td><td>${fmtPx(g.c)}</td><td class="${tone(g.c / base - 1)}">${fmtChg((g.c / base - 1) * 100)}</td></tr>` : '');
  const s = r.ses || {};
  const split = `<table class="ns-split"><thead><tr><th>SESSION</th><th>OPEN</th><th>HIGH</th><th>LOW</th><th>LAST</th><th>CHG %</th></tr></thead><tbody>${sesRow('PRE 02:00\u201307:30 MT', s.pre, r.prev)}${sesRow('RTH last 2m print', s.rth, r.prev)}<tr class="ns-hl"><td>OFFICIAL CLOSE \u00b7 RANKED</td><td></td><td></td><td></td><td>${fmtPx(r.p)}</td><td class="${tone(r.chg)}">${fmtChg(r.chg)}</td></tr>${sesRow('AH 14:00\u201318:00 MT', s.ah, r.p)}${fin(r.poll) ? `<tr><td>LIVE BOARD POLL ${esc(updLabel(r.upd))}</td><td></td><td></td><td></td><td>${fmtPx(r.poll)}</td><td class="ns-na">not ranked</td></tr>` : ''}</tbody></table>`;
  return `<div class="ns-cardhd"><b>${esc(r.t)}</b><span>${fmtPx(r.p)}</span><span class="${tone(r.chg)}">${fmtChg(r.chg)}</span><span class="ns-na">RTH close \u00b7 AH <span class="${tone(r.ah_pct)}">${fmtChg(r.ah_pct)}</span></span></div>
<div class="ns-cardsec">STRETCH TRIPLET <span>at the RTH close \u00b7 ${esc(dayLabel(r.session || ''))}</span></div>
<div class="ns-tiles">
<div class="ns-tl"><div class="k"><span>vs 8EMA</span><span>daily</span></div><div class="v ${tone(r.x8)}">${fmtX(r.x8)} ATR</div><div class="s">${fmtChg(r.e8p)} \u00b7 EMA8 ${fmtPx(r.ema8)} \u00b7 ATR ${fmtPx(r.atr)}</div></div>
<div class="ns-tl"><div class="k"><span>vs VWAP</span><span>02:00\u201314:00 MT</span></div><div class="v ${tone(r.xv)}">${fmtX(r.xv)} ATR</div><div class="s">${fin(r.vwap) && fin(r.p) ? `${fmtChg((r.p / r.vwap - 1) * 100)} \u00b7 VWAP ${fmtPx(r.vwap)}` : 'VWAP n/a'}</div></div>
<div class="ns-tl"><div class="k"><span>z vs 20-day</span><span>20 closes</span></div><div class="v ${tone(r.z20)}">${fmtZ(r.z20)}</div><div class="s">mean ${fmtPx(r.z_mu)} \u00b7 sd ${fmtPx(r.z_sd)}</div></div>
${pTile}
</div>${split}${whyHtml(r, nowMs)}`;
}

// ---------- badges ----------
export function badgesHtml(doc, nowMs = Date.now(), extra = []) {
  const rows = doc.rows.concat(extra);
  const stale = rows.filter((r) => r.poller_stale);
  const f = freshness(doc, nowMs);
  const b = [];
  b.push(`<span class="ns-bdg ns-ok"><span class="k">RANKED ON</span><b>RTH close · ${esc(dayLabel(doc.session))} 14:00 MT</b>official daily close · stretch, pctl, gold + sort</span>`);
  b.push(`<span class="ns-bdg ${f.ok ? 'ns-ok' : 'ns-warn'}"><span class="k">DATA</span><b>${f.ok ? 'current' : 'BEHIND'}</b>${esc(dayLabel(doc.session))} close · built ${esc(doc.built_mt)}${f.ok ? '' : ` · expected ${esc(dayLabel(f.expected))} close · GOLD OFF until the next close build`}</span>`);
  b.push('<span class="ns-bdg"><span class="k">AH</span><b>own column</b>last 2m print to 18:00 MT · never ranked</span>');
  b.push(`<span class="ns-bdg"><span class="k">BOOK</span><b>${rows.filter((r) => r.book === 'SC').length} SC · ${rows.filter((r) => r.book === 'ML').length} ML</b>in play \u00b7 ${esc(doc.md_n)} polled names${rows.some((r) => r.live_only) ? ` \u00b7 <b>${rows.filter((r) => r.live_only).length} live-only, not in last close build</b>` : ''}</span>`);
  b.push(`<span class="ns-bdg ${stale.length ? 'ns-warn' : 'ns-ok'}"><span class="k">POLLER STALE</span><b>${stale.length}</b>${stale.length ? stale.map((r) => `${esc(r.t)} since ${esc(updLabel(r.upd))}`).join(' · ') + ' · sorted last, no gold' : 'every roster name polled this session'}</span>`);
  const mmOld = !!doc.mrmap_asof_date && doc.mrmap_asof_date !== doc.session;
  b.push(`<span class="ns-bdg ${mmOld ? 'ns-warn' : 'ns-ok'}"><span class="k">2-YR PCTL</span><b>${mmOld ? `as of ${esc(dayLabel(doc.mrmap_asof_date))} MT` : esc(doc.mrmap_asof)}</b>MR MAP built ${esc(doc.mrmap_built)} · mid/large only${mmOld ? ' · older than the ranked session · no gold from it' : ''}</span>`);
  return b.join('');
}

// ---------- heat map ----------
const BASE = [38, 42, 46], UPC = [34, 122, 86], DNC = [178, 44, 58];
export function ramp(u) {
  if (u == null) return 'rgb(44,46,48)';
  const c = Math.max(-1, Math.min(1, u));
  const t = c >= 0 ? UPC : DNC, k = Math.abs(c);
  return `rgb(${BASE.map((b, i) => Math.round(b + (t[i] - b) * k)).join(',')})`;
}
export const pctColor = (p) => (fin(p) ? ramp((p - 50) / 50) : 'rgb(44,46,48)');
// Treemap squarify, copied from the live mr-map.mjs.
export function squarify(items, x0, y0, w, h) {
  const out = [];
  if (!(w > 0) || !(h > 0)) return out;
  const list = (items || []).filter((it) => fin(it.v) && it.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((s, it) => s + it.v, 0);
  if (!(total > 0)) return out;
  const scale = (w * h) / total;
  let X = x0, Y = y0, W = w, H = h, i = 0;
  while (i < list.length) {
    const side = Math.min(W, H);
    let rowSum = 0, rowMin = Infinity, rowMax = 0, j = i, best = Infinity;
    while (j < list.length) {
      const a = list[j].v * scale;
      const s = rowSum + a, mn = Math.min(rowMin, a), mx = Math.max(rowMax, a);
      const worst = Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
      if (j > i && worst > best) break;
      best = worst; rowSum = s; rowMin = mn; rowMax = mx; j++;
    }
    const last = j >= list.length;
    if (W >= H) {
      const cw = last ? W : rowSum / H; let yy = Y;
      for (let k = i; k < j; k++) { const a = list[k].v * scale; const hh = k === j - 1 ? Y + H - yy : a / cw; out.push({ ...list[k], x: X, y: yy, w: cw, h: hh }); yy += hh; }
      X += cw; W -= cw;
    } else {
      const ch = last ? H : rowSum / W; let xx = X;
      for (let k = i; k < j; k++) { const a = list[k].v * scale; const ww = k === j - 1 ? X + W - xx : a / ch; out.push({ ...list[k], x: xx, y: Y, w: ww, h: ch }); xx += ww; }
      Y += ch; H -= ch;
    }
    i = j;
  }
  return out;
}
export function heatHtml(rows, st, W, H) {
  if (!(W > 0)) return { html: '', n: 0 };
  let html = '', n = 0;
  const gw = W / 2;
  [['SC', 0, 'SMALL CAP · colour = 1-yr pctl (up to 252 sess.) · size = $vol'], ['ML', gw, 'MID / LARGE · colour = 2-yr pctl (up to 504 sess.) · size = $vol']].forEach(([bk, x0, label]) => {
    const list = rows.filter((r) => r.book === bk && fin(r.p) && passes(r, st));
    const tot = list.reduce((s, r) => s + num(r.dvol), 0);
    const items = list.map((r) => ({ v: Math.max(num(r.dvol), tot * 0.006), r }));
    html += `<div class="ns-hg" style="left:${x0}px;top:0;width:${gw}px;height:${H}px"><div class="ns-hgh">${esc(label)} · ${list.length} names · ${fmtUsd(tot)} total</div></div>`;
    for (const q of squarify(items, x0 + 1, 21, gw - 2, H - 22)) {
      const r = q.r, p = pctOf(r);
      n++;
      const fs = Math.max(9, Math.min(24, Math.sqrt(q.w * q.h) / 4.4, (q.w - 6) / (r.t.length * 0.62)));
      const l2 = `${fmtPctl(p)} · ${fmtX(r.x8, 1)}`;
      const sv = st.ses === 'pre' ? r.pre_pct : st.ses === 'ah' ? r.ah_pct : r.chg;
      const l3 = `${fmtChg(sv)} · ${fmtUsd(r.dvol)}`;
      const title = `${r.t} · ${bk === 'ML' ? '2-yr' : '1-yr'} pctl ${fmtPctl(p)} · 8EMA ${fmtX(r.x8)} ATR · VWAP ${fmtX(r.xv)} ATR · z ${fmtZ(r.z20)} · ${fmtUsd(r.dvol)} $vol`;
      html += `<div class="ns-ht${isExtreme(r) ? ' ns-hot' : ''}" data-ticker="${esc(r.t)}" title="${esc(title)}" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px;background:${pctColor(p)}">${fs >= 8 && q.w > 14 ? `<b style="font-size:${fs.toFixed(1)}px">${esc(r.t)}</b>` : ''}${q.h > fs + 22 && q.w > l2.length * 7.4 + 8 ? `<i>${l2}</i>` : ''}${q.h > fs + 40 && q.w > l3.length * 7.4 + 8 ? `<i>${l3}</i>` : ''}</div>`;
    }
  });
  return { html, n };
}

// ---------- stretch plot ----------
export function plotHtml(rows, st, W) {
  const H = 560, PL = 58, PR = 20, PT = 16, PB = 40;
  const list = rows.filter((r) => fin(r.p) && passes(r, st) && fin(pctOf(r)) && fin(r.x8));
  if (!list.length) return '<div class="ns-empty">No names pass the filters.</div>';
  const xs = list.map((r) => r.x8);
  const xlo = Math.min(-3, Math.floor(Math.min(...xs))), xhi = Math.max(3, Math.ceil(Math.max(...xs)));
  const X = (v) => PL + ((v - xlo) / (xhi - xlo)) * (W - PL - PR), Y = (p) => PT + (1 - p / 100) * (H - PT - PB);
  const mx = Math.max(...list.map((r) => num(r.dvol))) || 1;
  let g = `<rect x="${PL}" y="${Y(100)}" width="${W - PL - PR}" height="${Y(95) - Y(100)}" fill="rgba(228,183,110,.10)"/><rect x="${PL}" y="${Y(5)}" width="${W - PL - PR}" height="${Y(0) - Y(5)}" fill="rgba(228,183,110,.10)"/>`;
  for (let v = xlo; v <= xhi; v++) g += `<path d="M${X(v)} ${PT}V${H - PB}" stroke="${v === 0 ? '#59636a' : '#1c1f22'}"/><text x="${X(v)}" y="${H - PB + 16}" text-anchor="middle">${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v)}×</text>`;
  for (const p of [0, 5, 25, 50, 75, 95, 100]) g += `<path d="M${PL} ${Y(p)}H${W - PR}" stroke="${p === 50 ? '#59636a' : '#1c1f22'}"/><text x="${PL - 8}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`;
  g += `<text x="${(PL + W - PR) / 2}" y="${H - 6}" text-anchor="middle">vs 8EMA ×ATR on the RTH close (close − EMA8) ÷ ATR</text><text x="14" y="${(PT + H - PB) / 2}" transform="rotate(-90 14 ${(PT + H - PB) / 2})" text-anchor="middle">stretch pctl (%)</text>`;
  g += `<text x="${W - PR - 6}" y="${Y(97.5) + 4}" text-anchor="end">≥ 95% band</text><text x="${W - PR - 6}" y="${Y(2.5) + 4}" text-anchor="end">≤ 5% band</text>`;
  const dots = list.slice().sort((a, b) => num(b.dvol) - num(a.dvol)).map((r) => {
    const p = pctOf(r), rad = 4 + 16 * Math.sqrt(num(r.dvol) / mx), x = X(r.x8), y = Y(p), c = pctColor(p);
    const shape = r.book === 'SC' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${c}" stroke="#e0e5e7" stroke-width="1"/>` : `<rect x="${(x - rad).toFixed(1)}" y="${(y - rad).toFixed(1)}" width="${(2 * rad).toFixed(1)}" height="${(2 * rad).toFixed(1)}" fill="${c}" stroke="#e0e5e7" stroke-width="1"/>`;
    return `<g class="ns-dot" data-ticker="${esc(r.t)}"><title>${esc(`${r.t} · pctl ${fmtPctl(p)} · 8EMA ${fmtX(r.x8)} ATR`)}</title>${shape}<text x="${(x + rad + 4).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#e0e5e7" font-weight="800">${esc(r.t)}</text></g>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Cascadia Mono,Consolas,monospace" font-size="11.5" fill="#bec7cd">${g}${dots}</svg>`;
}

// ---------- phone cards (<= 700 px) ----------
function spark(cl) {
  if (!Array.isArray(cl) || cl.length < 2) return '';
  const w = 160, h = 30, lo = Math.min(...cl), hi = Math.max(...cl);
  const d = cl.map((v, i) => `${i ? 'L' : 'M'}${((i / (cl.length - 1)) * w).toFixed(1)} ${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${cl[cl.length - 1] >= cl[0] ? '#51c083' : '#e17272'}" stroke-width="1.5"/></svg>`;
}
export function cardsHtml(rows, st, snap = '') {
  const list = sortRows(rows.filter((r) => passes(r, st)), st.sort);
  const c = list.map((r) => {
    const p = pctOf(r), n = sessOf(r), nom = NOMINAL[r.book === 'ML' ? 'ML' : 'SC'], lab = `${r.book === 'ML' ? '2Y' : '1Y'}${n != null && n < nom ? ` ${n} sess.${n < MIN_SESS ? ' SHORT' : ''}` : ''}${r.ca ? ' SPLIT/CA' : ''}${r.book === 'ML' && r.p2_stale ? ` as of ${dayLabel(r.p2_asof)} MT` : ''}`;
    if (r.live_only) return `<div class="ns-gc" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b><span class="ns-tag ns-stale">NOT IN LAST CLOSE BUILD</span></div><div class="ns-r4 ns-na">\u2014 stretch columns appear after the next close build</div></div>`;
    if (!fin(r.p)) return `<div class="ns-gc" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b></div><div class="ns-r4 ns-na">no session bar · not ranked</div></div>`;
    return `<div class="ns-gc${isExtreme(r) ? ' ns-ext' : ''}" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b><span class="ns-bkn ${r.book.toLowerCase()}">${r.book}</span><span class="ns-px">${fmtPx(r.p)}</span><span class="ns-ch ${tone(r.chg)}">${fmtChg(r.chg)}</span></div>
<div class="ns-r2">${spark(r.cl)}${pbar(p, `<span class="ns-na" style="font-size:10px">${lab}</span>`)}</div>
<div class="ns-r3"><span>8EMA <b class="${tone(r.x8)}">${fmtX(r.x8, 1)}</b></span><span>VWAP <b class="${tone(r.xv)}">${fmtX(r.xv, 1)}</b></span><span>z <b class="${tone(r.z20)}">${fmtZ(r.z20)}</b></span><span>AH <b class="${tone(r.ah_pct)}">${fmtChg(r.ah_pct)}</b></span></div>
<div class="ns-r4">${r.poller_stale ? `<span class="ns-tag ns-stale">POLLER STALE · ${esc(updLabel(r.upd).toUpperCase())}</span>` : ''}${r.status ? `<span class="ns-tag ${r.status === 'RUNNING' ? 'ns-run' : 'ns-fade'}">${esc(r.status)}</span>` : ''}${esc([r.dlab, fmtUsd(r.dvol) + ' $vol'].filter(Boolean).join(' \u00b7 '))}</div>${r.news ? whyHtml(r) : ''}</div>`;
  }).join('');
  return `<div class="ns-cardh">IN PLAY · ${list.length} NAMES <span>${esc(snap || 'RTH close · pctl extreme')}</span></div>${c}`;
}

export function sessionNote(st, doc) {
  const d = dayLabel(doc.session);
  if (st.ses === 'pre') return `Pre-market % (last 2m print before 07:30 MT vs the prior close) is shown in its own column. Ranking stays on the ${d} RTH close.`;
  if (st.ses === 'ah') return `After-hours % (last 2m print to 18:00 MT vs the RTH close) is shown in its own column. Ranking stays on the ${d} RTH close.`;
  return `Every row is ranked on the official RTH close (${d} 14:00 MT). After-hours sits in its own AH % column and is never ranked.`;
}

// ---------- controls ----------
const chip = (attr, val, label, on, small = '') => `<button type="button" class="ns-chip" data-ns-${attr}="${val}" aria-pressed="${on}">${label}${small ? ` <small>${small}</small>` : ''}</button>`;
export function controlsHtml(st, doc) {
  return `<div class="ns-ctrl">
<span class="ns-grp"><span class="ns-lbl">SESSION</span>${chip('ses', 'pre', 'PRE', st.ses === 'pre', '02:00–07:30 MT')}${chip('ses', 'rth', 'RTH', st.ses === 'rth', '07:30–14:00 MT')}${chip('ses', 'ah', 'AH', st.ses === 'ah', '14:00–18:00 MT')}</span>
<span class="ns-grp"><span class="ns-lbl">MIN PRICE</span>${chip('px', 0, 'ALL', st.px === 0)}${chip('px', 1, '≥ $1', st.px === 1)}${chip('px', 5, '≥ $5', st.px === 5)}</span>
<span class="ns-grp"><span class="ns-lbl">MIN $VOL</span>${chip('dv', 0, 'ALL', st.dv === 0)}${chip('dv', 1e6, '≥ $1M', st.dv === 1e6)}${chip('dv', 1e7, '≥ $10M', st.dv === 1e7)}</span>
<span class="ns-grp"><span class="ns-lbl">SORT</span>${chip('sort', 'pct', 'PCTL EXTREME', st.sort === 'pct')}${chip('sort', 'x8', '8EMA ×ATR', st.sort === 'x8')}${chip('sort', 'chg', 'CHG %', st.sort === 'chg')}${chip('sort', 'dvol', '$VOL', st.sort === 'dvol')}</span>
<span class="ns-grp ns-dsk"><span class="ns-lbl">VIEW</span>${chip('view', 'table', 'TABLE', st.view === 'table')}${chip('view', 'heat', 'HEAT MAP', st.view === 'heat')}${chip('view', 'plot', 'STRETCH PLOT', st.view === 'plot')}</span>
<span class="ns-grp ns-dsk"><span class="ns-lbl">LIVE BOOKS</span>${chip('books', 'on', 'SHOWN', st.books)}${chip('books', 'off', 'HIDDEN', !st.books)}</span>
<span class="ns-note" id="nsNote">${esc(sessionNote(st, doc))}</span></div>`;
}

export function footHtml(doc) {
  return `<p class="ns-foot"><b>Stretch triplet, per row.</b> All on the <b>official RTH close of ${esc(dayLabel(doc.session))}</b> (daily bar), never the after-hours poll. 8EMA ×ATR = (close − daily EMA8) ÷ Wilder ATR14. VWAP ×ATR = (close − day VWAP 02:00–14:00 MT, pre-market included) ÷ ATR. Z 20D σ = (close − 20-day mean) ÷ population sd. Percentiles: small caps = share of the last 252 sessions of 8EMA % distance at or below today. Mid/large = mid-rank (share below + half the ties) of today's ×ATR within the name's own last 504 sessions; it comes from the MR MAP when that snapshot is for the same session, else from the name's own bars (labelled), else n/a. Rows with fewer sessions show the real count; under 250 sessions they are marked SHORT HISTORY and never take gold. A confirmed corporate action (MR MAP list) inside the window skips the percentile (SPLIT/CA GUARD); a big gap alone never does. Gold row fill + edge bar = percentile ≤ 5% or ≥ 95%. Poller-stale, split-guarded, short-history and BEHIND-data rows never take gold. All times MT.</p>`;
}

// ---------- CSS (injected, scoped under .ns) ----------
export const CSS = `
#nowStretch,#nsCard{--ns-up:#51c083;--ns-dn:#e17272;--ns-ink:#0b0c0d;--ns-text:#e0e5e7;--ns-text2:#bec7cd;--ns-line:#353a40;--ns-mid:#30353a;--ns-bright:#59636a;--ns-gold:var(--gold,#e4b76e);--ns-fill:rgba(228,183,110,.12);margin:0 0 10px;color:var(--ns-text)}
#nowStretch *,#nsCard *{box-sizing:border-box}
.ns-fresh{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.ns-bdg{display:inline-flex;align-items:baseline;gap:6px;padding:4px 8px;border:1px solid var(--ns-line);border-radius:4px;background:#191c1f;font:700 11px/1.25 var(--mono,Consolas,monospace);color:var(--ns-text2)}
.ns-bdg b{color:var(--ns-text);font-weight:800}
.ns-bdg .k{letter-spacing:.07em}
.ns-bdg.ns-warn{border-color:#7a5a2a;background:#1e1a12}
.ns-bdg.ns-warn::before,.ns-bdg.ns-ok::before{content:"";align-self:center;width:6px;height:6px;border-radius:50%;background:var(--ns-gold)}
.ns-bdg.ns-ok::before{background:var(--ns-up)}
.ns-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:7px 10px;border:1px solid var(--ns-mid);border-radius:6px;background:#15181b;margin-bottom:8px}
.ns-grp{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap}
.ns-lbl{margin-right:6px;color:var(--ns-text);font:800 10.5px/1 var(--mono,Consolas,monospace);letter-spacing:.09em}
.ns-chip{padding:4px 9px;border:1px solid var(--ns-line);border-radius:3px;background:#202428;color:var(--ns-text2);font:700 11px/1.2 var(--mono,Consolas,monospace);letter-spacing:.04em;cursor:pointer;white-space:nowrap}
.ns-chip:hover{border-color:var(--ns-bright);color:var(--ns-text)}
.ns-chip[aria-pressed=true]{border-color:var(--ns-gold);background:var(--ns-fill);color:var(--ns-text)}
.ns-chip small{font-size:9.5px;color:var(--ns-text2);margin-left:4px}
.ns-note{color:var(--ns-text2);font:600 11.5px/1.35 var(--sans,system-ui,sans-serif)}
.ns-panel{border:1px solid var(--ns-mid);border-radius:8px;background:#191c1f}
.ns-ph{display:flex;align-items:baseline;gap:10px;padding:8px 12px;border-bottom:1px solid var(--ns-mid);font:800 11.5px/1.2 var(--mono,Consolas,monospace);letter-spacing:.07em;color:var(--ns-text)}
.ns-ph .ns-r{margin-left:auto;font-weight:700;letter-spacing:.02em;color:var(--ns-text2)}
.ns-up{color:var(--ns-up)}.ns-dn{color:var(--ns-dn)}.ns-nt{color:var(--ns-text)}.ns-na{color:var(--ns-text2)}
.ns-d4{display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px;font:700 12.5px/1 var(--mono,Consolas,monospace)}
.ns-d4 s{display:block;height:2px;width:46px;background:#24282c;position:relative;text-decoration:none}
.ns-d4 s i{position:absolute;top:0;height:2px}
.ns-d4 s i.u{left:50%;background:var(--ns-up)}.ns-d4 s i.d{right:50%;background:var(--ns-dn)}
.ns-d4 s::after{content:"";position:absolute;left:50%;top:-1px;width:1px;height:4px;background:var(--ns-bright)}
.ns-pbar{display:inline-flex;align-items:center;gap:6px;font:800 12.5px/1 var(--mono,Consolas,monospace)}
.ns-pbar s{position:relative;display:block;width:58px;height:6px;background:#202428;border-radius:1px;text-decoration:none}
.ns-pbar s::before,.ns-pbar s::after{content:"";position:absolute;top:0;bottom:0;width:1px;background:#3d444b}
.ns-pbar s::before{left:5%}.ns-pbar s::after{left:95%}
.ns-pbar s i{position:absolute;top:-2px;width:3px;height:10px;margin-left:-1px;border-radius:1px}
.ns-pbar s em{position:absolute;left:50%;top:1px;bottom:1px;width:1px;background:var(--ns-bright)}
.ns-tag{display:inline-block;padding:1px 5px;border:1px solid var(--ns-bright);border-radius:2px;font:800 9.5px/1.3 var(--mono,Consolas,monospace);letter-spacing:.05em;color:var(--ns-text);white-space:nowrap}
.ns-tag.ns-run{border-color:#3f7a5d}.ns-tag.ns-fade{border-style:dashed}.ns-tag.ns-stale{border-color:#8a6a35;background:#221c12}
.ns-bkn{padding:1px 6px;border-radius:2px;font:800 10.5px/1.3 var(--mono,Consolas,monospace)}
.ns-bkn.sc{background:#3a2516;color:#f1c7a5}.ns-bkn.ml{background:#16301f;color:#b6e3c6}
.ns-books{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media (max-width:1500px){.ns-books{grid-template-columns:minmax(0,1fr)}}
.ns-scroll{overflow-x:auto}
table.ns-t{width:100%;border-collapse:collapse;min-width:640px;table-layout:fixed}
table.ns-t th:first-child{width:36%}
table.ns-t th:last-child{width:17%}
table.ns-t td:first-child{overflow:hidden}
table.ns-t td:last-child{white-space:nowrap}
table.ns-t td:last-child .ns-sub{white-space:normal;text-align:right;overflow:visible}
table.ns-t th{padding:6px 6px;background:#1d2125;color:var(--ns-text);font:800 10px/1.2 var(--mono,Consolas,monospace);letter-spacing:.06em;text-align:right;white-space:nowrap;border-bottom:1px solid var(--ns-mid)}
table.ns-t th:first-child,table.ns-t td:first-child{text-align:left;padding-left:10px}
table.ns-t td{padding:6px 6px;border-bottom:1px solid #262a2f;text-align:right;vertical-align:middle;font:700 12.5px/1.15 var(--mono,Consolas,monospace);color:var(--ns-text)}
table.ns-t tr.ns-row{cursor:pointer}
table.ns-t tbody tr:hover td{background:rgba(255,255,255,.04)}
table.ns-t tr.ns-sel td:first-child{box-shadow:inset 2px 0 0 #fff}
table.ns-t tr.ns-ext td{background:var(--ns-fill)}
table.ns-t tr.ns-ext td:first-child{box-shadow:inset 3px 0 0 var(--ns-gold)}
.ns-tk{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font:800 14px/1 var(--mono,Consolas,monospace);color:var(--ns-text)}
.ns-sub{margin-top:4px;color:var(--ns-text2);font:700 10.5px/1.2 var(--mono,Consolas,monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ns-heat{position:relative;height:640px;background:var(--ns-ink);border-top:1px solid var(--ns-mid)}
.ns-hg{position:absolute;box-shadow:inset 0 0 0 1px #3a4046}
.ns-hgh{position:absolute;left:0;right:0;top:0;height:20px;padding:3px 7px;background:#1d2125;color:var(--ns-text);font:800 10.5px/14px var(--mono,Consolas,monospace);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ns-ht{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--ns-ink);overflow:hidden;text-align:center;cursor:pointer}
.ns-ht b{color:#fff;font:800 14px/1 var(--mono,Consolas,monospace);text-shadow:0 1px 1px rgba(0,0,0,.4)}
.ns-ht i{margin-top:3px;color:#f4f5f5;font:700 11px/1.1 var(--mono,Consolas,monospace);font-style:normal;white-space:nowrap}
.ns-ht.ns-hot{box-shadow:inset 0 0 0 2px var(--ns-gold)}
.ns-leg{display:inline-flex}.ns-leg span{min-width:44px;padding:3px 5px;color:#fff;font:700 10.5px/1.2 var(--mono,Consolas,monospace);text-align:center}
.ns-scat{background:#000;border-top:1px solid var(--ns-mid);overflow-x:auto}
.ns-dot{cursor:pointer}
.ns-empty{padding:18px;color:var(--ns-text2);font:700 12px var(--mono,Consolas,monospace)}
.ns-foot{margin:12px 0 0;color:var(--ns-text2);font:600 11.5px/1.5 var(--sans,system-ui,sans-serif)}
.ns-foot b{color:var(--ns-text)}
.ns-cards{display:none}
.ns-cardh{display:flex;justify-content:space-between;margin:10px 2px 6px;font:800 11px/1.2 var(--mono,Consolas,monospace);letter-spacing:.07em;color:var(--ns-text)}
.ns-cardh span{color:var(--ns-text2);letter-spacing:0}
.ns-gc{margin-bottom:6px;padding:9px 10px;border:1px solid var(--ns-mid);border-radius:7px;background:#191c1f;cursor:pointer}
.ns-gc.ns-ext{background:var(--ns-fill);box-shadow:inset 3px 0 0 var(--ns-gold)}
.ns-r1{display:flex;align-items:baseline;gap:7px}.ns-r1 b{font:800 17px/1 var(--mono,Consolas,monospace)}
.ns-r1 .ns-px{margin-left:auto;font:800 13.5px/1 var(--mono,Consolas,monospace)}
.ns-r1 .ns-ch{font:800 13.5px/1 var(--mono,Consolas,monospace);min-width:62px;text-align:right}
.ns-r2{display:flex;align-items:center;gap:10px;margin-top:7px}.ns-r2 svg{flex:1;height:30px;min-width:0}
.ns-r3{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font:700 11.5px/1.2 var(--mono,Consolas,monospace);color:var(--ns-text2)}.ns-r3 b{font-weight:800}
.ns-r4{margin-top:6px;color:var(--ns-text);font:600 11.5px/1.3 var(--sans,system-ui,sans-serif);overflow:hidden;text-overflow:ellipsis}
.ns-r4 .ns-tag{margin-right:5px}
body.ns-on.ns-books-off .books-grid{display:none}
.ns-why{margin-top:4px;color:var(--ns-text);font:600 11.5px/1.35 var(--sans,system-ui,sans-serif);white-space:normal;max-width:620px}
.ns-why .ns-tag{margin-right:6px}
.ns-why small{display:block;margin-top:2px;color:var(--ns-text2);font:700 10px/1.3 var(--mono,Consolas,monospace)}
.ns-why small b{color:var(--ns-text)}
table.ns-t tr.ns-liveonly td{background:#15181b}
.ns-card{margin:10px 0 0;border:1px solid var(--ns-mid);border-radius:8px;background:#191c1f;color:var(--ns-text)}
.ns-cardhd{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;padding:10px 12px 6px}
.ns-cardhd b{font:800 22px/1 var(--mono,Consolas,monospace)}
.ns-cardhd span{font:800 14px/1 var(--mono,Consolas,monospace)}
.ns-cardsec{display:flex;justify-content:space-between;padding:7px 12px;border-top:1px solid var(--ns-mid);border-bottom:1px solid var(--ns-mid);font:800 11px/1.2 var(--mono,Consolas,monospace);letter-spacing:.07em}
.ns-cardsec span{font-weight:700;letter-spacing:0;color:var(--ns-text2)}
.ns-cardnote{padding:8px 12px 10px;color:var(--ns-text2);font:600 12px/1.4 var(--sans,system-ui,sans-serif)}
.ns-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:8px 10px}
.ns-tl{padding:8px 10px 7px;border:1px solid var(--ns-mid);border-radius:6px;background:#202428}
.ns-tl.ns-ext{background:var(--ns-fill);box-shadow:inset 3px 0 0 var(--ns-gold)}
.ns-tl .k{display:flex;justify-content:space-between;gap:6px;color:var(--ns-text);font:700 11.5px/1.2 var(--sans,system-ui,sans-serif)}
.ns-tl .k span:last-child{color:var(--ns-text2);font:700 10.5px/1.2 var(--mono,Consolas,monospace)}
.ns-tl .v{margin-top:5px;font:800 20px/1 var(--mono,Consolas,monospace)}
.ns-tl .s{margin-top:5px;color:var(--ns-text2);font:700 10.5px/1.35 var(--mono,Consolas,monospace)}
.ns-rng{position:relative;height:8px;margin:8px 0 2px;background:#15181b;border-radius:1px}
.ns-rng i{position:absolute;top:-3px;width:3px;height:14px;margin-left:-1px;background:var(--ns-text)}
.ns-rng em{position:absolute;top:0;bottom:0;width:1px;background:var(--ns-bright)}
.ns-split{width:calc(100% - 20px);margin:0 10px 8px;border-collapse:collapse;font:700 11px/1.2 var(--mono,Consolas,monospace)}
.ns-split th{padding:5px 6px;background:#1d2125;color:var(--ns-text);font:800 10px/1.2 var(--mono,Consolas,monospace);text-align:right}
.ns-split td{padding:5px 6px;border-top:1px solid var(--ns-mid);text-align:right;color:var(--ns-text)}
.ns-split th:first-child,.ns-split td:first-child{text-align:left;color:var(--ns-text2)}
.ns-split tr.ns-hl td{background:#1e1a12}
#nsCard .ns-why{margin:0 10px 10px;padding:7px 9px;border:1px solid var(--ns-mid);border-radius:6px;background:#15181b}
@media (max-width:700px){
.ns-books,.ns-views,.ns-dsk{display:none!important}
.ns-cards{display:block}
.ns-bdg{white-space:normal;max-width:100%}
.ns-ctrl{gap:6px 10px;padding:6px 8px}
body.ns-on:not(.ns-behind) .books-grid{display:none}
body.ns-on.ns-behind.ns-books-off .books-grid{display:grid}
}
`;

// ---------- boot ----------
const hasDom = typeof document !== 'undefined';
let doc = null, st = { ...DEFAULT_STATE }, selected = null, root = null, liveOnly = [], liveKey = '';
let behind = false;
const allRows = () => (doc ? doc.rows.concat(liveOnly).map((r) => (behind && !r.live_only ? { ...r, behind: true } : r)) : []);
const store = () => { try { return window.localStorage; } catch { return null; } };

function viewHtml() {
  const rows = allRows();
  if (st.view === 'heat') {
    const leg = [0, 5, 25, 50, 75, 95, 100].map((p) => `<span style="background:${pctColor(p)}">${p === 0 ? '≤ 5%' : p === 100 ? '≥ 95%' : `${p}%`}</span>`).join('');
    return `<div class="ns-panel"><div class="ns-ph">IN-PLAY HEAT MAP <span class="ns-leg">${leg}</span><span class="ns-r" id="nsHcount"></span></div><div class="ns-heat" id="nsHeat"></div></div>`;
  }
  if (st.view === 'plot') return `<div class="ns-panel"><div class="ns-ph">STRETCH PLOT · x = vs 8EMA ×ATR · y = stretch pctl · dot size = $vol <span class="ns-r">○ small cap (1-yr pctl) · □ mid/large (2-yr pctl)</span></div><div class="ns-scat" id="nsScat"></div></div>`;
  return `<div class="ns-books">${bookHtml(rows, 'SC', st, selected)}${bookHtml(rows, 'ML', st, selected)}</div>`;
}

function paint() {
  if (!root || !doc) return;
  behind = !freshness(doc).ok;
  document.body.classList.toggle('ns-behind', behind);
  document.body.classList.toggle('ns-books-off', !st.books);
  root.innerHTML = `<div class="ns-fresh">${badgesHtml(doc, Date.now(), liveOnly)}</div>${controlsHtml(st, doc)}<div class="ns-views" id="nsViews">${viewHtml()}</div><div class="ns-cards" id="nsCards">${cardsHtml(allRows(), st, behind ? `snapshot as of ${dayLabel(doc.session)} close · BEHIND · live books below` : '')}</div>${footHtml(doc)}`;
  paintCanvas();
}
function paintCanvas() {
  const heat = document.getElementById('nsHeat');
  if (heat) {
    const r = heat.getBoundingClientRect();
    const out = heatHtml(allRows(), st, r.width, r.height);
    heat.innerHTML = out.html;
    const c = document.getElementById('nsHcount');
    if (c) c.textContent = `${out.n} tiles · size floor 0.6% of the book so every name draws`;
  }
  const scat = document.getElementById('nsScat');
  if (scat) scat.innerHTML = plotHtml(allRows(), st, Math.max(640, Math.floor(scat.getBoundingClientRect().width) || 1200));
}

function onClick(e) {
  const b = e.target.closest('[data-ns-ses],[data-ns-px],[data-ns-dv],[data-ns-sort],[data-ns-view],[data-ns-books]');
  if (b) {
    const d = b.dataset;
    if (d.nsSes) st.ses = d.nsSes;
    else if (d.nsPx != null) st.px = Number(d.nsPx);
    else if (d.nsDv != null) st.dv = Number(d.nsDv);
    else if (d.nsSort) st.sort = d.nsSort;
    else if (d.nsView) st.view = d.nsView;
    else if (d.nsBooks) st.books = d.nsBooks === 'on';
    saveState(store(), st);
    paint();
    e.stopPropagation();
    return;
  }
  const t = e.target.closest('[data-ticker]');
  if (t) { selected = t.dataset.ticker; root.querySelectorAll('.ns-sel').forEach((n) => n.classList.remove('ns-sel')); root.querySelectorAll(`tr[data-ticker="${selected}"]`).forEach((n) => n.classList.add('ns-sel')); }
  // the board's own delegated handler opens the chart + detail panel from data-ticker
}

export async function boot() {
  if (!hasDom) return;
  const host = document.querySelector('#view-now .books-grid');
  if (!host) return;
  if (!document.getElementById('nowStretchCss')) { const s = document.createElement('style'); s.id = 'nowStretchCss'; s.textContent = CSS; document.head.appendChild(s); }
  root = document.createElement('section');
  root.id = 'nowStretch';
  root.setAttribute('aria-label', 'NOW stretch board');
  root.addEventListener('click', onClick);
  host.parentNode.insertBefore(root, host);
  st = loadState(store());
  try {
    const res = await fetch('./data/now-stretch.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j?.schema !== 'now-stretch/1' || !Array.isArray(j.rows)) throw new Error('unexpected schema');
    doc = j;
  } catch (err) {
    root.innerHTML = `<div class="ns-bdg ns-warn"><span class="k">STRETCH BOARD</span><b>unavailable</b>${esc(String(err.message || err))} · the live books below are unchanged</div>`;
    return;   // books stay visible: no body.ns-on
  }
  document.body.classList.add('ns-on');
  syncLive(false);
  paint();
  watchLive();
  watchDetail();
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(paintCanvas, 150); });
}

if (hasDom) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}

// live book -> rows the last close build does not carry (the board's own in-play DOM is the live source)
function syncLive(repaint = true) {
  const next = liveOnlyRows(readLiveInPlay(document), doc.rows);
  const key = next.map((r) => `${r.book}:${r.t}`).sort().join(',');
  if (key === liveKey) return;
  liveKey = key; liveOnly = next;
  if (repaint) paint();
}
function watchLive() {
  let t = null;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => syncLive(true), 400); });
  for (const id of ['scRows', 'mlRows']) { const n = document.getElementById(id); if (n) obs.observe(n, { childList: true, subtree: true }); }
}
// stretch triplet card under the detail panel's context block
function watchDetail() {
  const tk = document.getElementById('detailTicker');
  const anchor = document.getElementById('detailContext');
  if (!tk || !anchor) return;
  let card = document.getElementById('nsCard');
  if (!card) { card = document.createElement('div'); card.id = 'nsCard'; card.className = 'ns-card'; card.hidden = true; anchor.insertAdjacentElement('afterend', card); }
  const draw = () => {
    const t = (tk.textContent || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)) { card.hidden = true; return; }
    const r = allRows().find((x) => x.t === t);
    card.hidden = false;
    card.innerHTML = cardHtml(r ? { ...r, session: doc.session } : null);
  };
  new MutationObserver(draw).observe(tk, { childList: true, characterData: true, subtree: true });
  draw();
}
