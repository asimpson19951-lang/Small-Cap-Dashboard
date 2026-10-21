// NOW tab stretch board (V2.18.0). Self-wiring ES module: <script type="module" src="./now-stretch.mjs?v=V2.18.0">.
// Reads ./data/now-stretch.json (built offline by scripts/build-now-stretch.mjs). Raw primitives only: no scores, no grades.
// Copies: the stretch triplet per row (8EMA xATR, VWAP xATR, z 20d), a percentile against the name's own history with a data bar,
// Finviz-style session / min-price / min-$vol controls, the TradingView screener table | heat map | chart toggle.
// Law: EVERY ranked value sits on the official RTH close of the data's session. After-hours is its own column and is never ranked.
// Gold = row fill + edge bar only (percentile <= 5% or >= 95%), never text. Pure functions are exported for node tests.

import { hm12, marketSessionClock, mt12, previousTradingSession } from './market-calendar.mjs';
import { candleSpark } from './mr-map.mjs?v=V2.19.6';

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
const tone = (v) => (!fin(v) ? 't2' : v > 0 ? 'up' : v < 0 ? 'dn' : '');

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

// ---------- cells (board skin v2, Oct 19 2026: shared .sk kit classes; values and rules unchanged) ----------
const NA_HTML = `<span class="t2">${NA}</span>`;
function d4(v, clamp, fmt) {
  if (!fin(v)) return NA_HTML;
  const w = Math.min(1, Math.abs(v) / clamp) * 100;
  return `<span class="db ${tone(v)}"><span class="${tone(v)}">${fmt(v)}</span><i style="width:${w.toFixed(0)}%"></i></span>`;
}
export function pbar(p, suffix = '', ext = false) {
  if (!fin(p)) return NA_HTML;
  return `<span class="pc${ext ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${fmtPctl(p)}</b></span>${suffix}`;
}
// Notes under the percentile: the real session count when it is below nominal, short-history, as-of date of an older MR MAP snapshot.
export function pctNotes(r) {
  const out = [];
  const n = sessOf(r), nom = NOMINAL[r.book === 'ML' ? 'ML' : 'SC'];
  if (n != null && n < nom) out.push(`${n} sess.`);
  if (n != null && n < MIN_SESS) out.push('short history · no gold');
  if (r.book === 'ML' && r.p2_stale) out.push(`as of ${dayLabel(r.p2_asof)} MT · no gold`);
  if (r.book === 'ML' && r.p2_src === 'own') out.push('own bars (not in MR MAP)');
  return out;
}
function pctCell(r) {
  if (r.ca) return `<span class="t2">n/a</span><small>split/CA guard ${esc(dayLabel(r.ca.d))}</small>`;
  if (r.book === 'ML' && !fin(r.p2)) { const n = sessOf(r); return `<span class="t2">n/a</span><small>${n != null ? `only ${n} sess. of bars` : `&lt; ${MIN_SESS} sess. of bars`}</small>`; }
  const notes = pctNotes(r);
  return pbar(pctOf(r), '', isExtreme(r)) + (notes.length ? `<small>${esc(notes.join(' · '))}</small>` : '');
}
// Builder labels arrive upper-case ('TOUCH UBB'); show them in sentence case, keeping band acronyms.
const sentence = (s) => String(s || '').split(' ').map((w, i) => /^(UBB|LBB|BB|D\d+|D—+|SC|ML|CA)$/.test(w) ? w : i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()).join(' ');
export function subLine(r) {
  const bits = [`${fmtUsd(r.dvol)} $vol`, r.dlab, r.bb ? sentence(r.bb) : ''].filter(Boolean);
  return bits.join(' · ');
}
// One chip at most (a warning); the rest of the row state reads as plain text on the small line.
function tags(r) {
  if (r.poller_stale) return `<span class="chip">Poller stale · ${esc(updLabel(r.upd))}</span>`;
  if (r.ca) return '<span class="chip">Split/CA guard</span>';
  return '';
}
function stateLine(r) {
  return [r.status ? sentence(r.status) : '', r.mover ? 'Mover' : '', r.frd ? 'Frd' : ''].filter(Boolean).join(' · ');
}
function ahCell(r, st) {
  const v = st.ses === 'pre' ? r.pre_pct : r.ah_pct;
  const at = st.ses === 'pre' ? r.pre_t : r.ah_t;
  if (!fin(v)) return NA_HTML;
  return `<span class="${tone(v)}">${fmtChg(v)}</span><small>${esc(at)} MT</small>`;
}

const COLS = 8;
export function rowHtml(r, st, selected = null) {
  const gold = isExtreme(r);
  const p1note = r.book === 'ML' && !fin(r.p2) && fin(r.p1) ? `<small>1-yr pctl ${fmtPctl(r.p1)} (own 252-session window)</small>` : '';
  if (r.live_only) {
    return `<tr data-ticker="${esc(r.t)}" class="ns-row ns-liveonly${selected === r.t ? ' ns-sel' : ''}"><th>${esc(r.t)}<small>in the live in-play book</small></th><td colspan="${COLS - 1}" class="l t2">Not in the last close build · stretch columns appear after the next close build</td></tr>`;
  }
  if (!fin(r.p)) {
    return `<tr data-ticker="${esc(r.t)}" class="ns-row"><th>${esc(r.t)}${tags(r)}</th><td colspan="${COLS - 1}" class="l t2">No bar for this session on file · not ranked</td></tr>`;
  }
  const state = stateLine(r);
  return `<tr data-ticker="${esc(r.t)}" class="ns-row${gold ? ' ext' : ''}${selected === r.t ? ' ns-sel' : ''}"><th>${esc(r.t)}${tags(r)}<small>${esc([state, subLine(r)].filter(Boolean).join(' · '))}</small>${p1note}${r.news ? whyHtml(r) : ''}</th><td>${fmtPx(r.p)}</td><td class="${tone(r.chg)}">${fmtChg(r.chg)}</td><td class="opt">${ahCell(r, st)}</td><td>${d4(r.x8, 4, (v) => fmtX(v))}</td><td class="opt">${d4(r.xv, 2, (v) => fmtX(v))}</td><td class="opt">${d4(r.z20, 3, fmtZ)}</td><td>${pctCell(r)}</td></tr>`;
}

export const QUICK_ROWS = 14;
export function bookHtml(rows, book, st, selected = null, limit = Infinity) {
  const all = rows.filter((r) => r.book === book);
  const vis = sortRows(all.filter((r) => passes(r, st)), st.sort);
  const show = vis.slice(0, limit);
  const isSc = book === 'SC';
  const hidden = all.length - vis.length;
  const liveOnly = all.filter((r) => r.live_only).length;
  const sub = `${show.length < vis.length ? `${show.length} of ${vis.length} shown here, all in Deep view` : `${vis.length} of ${all.length} shown`}${liveOnly ? ` · ${liveOnly} live-only (not in last close build)` : ''}${hidden ? ` · ${hidden} hidden by the price / $vol filter` : ''} · gold = ${isSc ? '1-yr' : '2-yr'} stretch pctl ≤ 5% or ≥ 95%`;
  const sesHead = st.ses === 'pre' ? 'Pre %' : 'AH %';
  const th = `<thead><tr><th class="l">Name</th><th>RTH close</th><th>Chg %</th><th class="opt" title="${st.ses === 'pre' ? 'Pre-market last 2m print before 7:30 AM MT' : 'After-hours last 2m print to 6:00 PM MT'} vs the RTH close. Never ranked.">${sesHead}<small>never ranked</small></th><th>8EMA<small>× ATR</small></th><th class="opt">VWAP<small>× ATR</small></th><th class="opt">Z 20D<small>σ</small></th><th>${isSc ? '1-yr pctl' : '2-yr pctl'}<small>own stretch</small></th></tr></thead>`;
  return `<section class="panel ns-book"><h2>${isSc ? 'Small cap' : 'Mid / large'} <span class="chip">${book}</span> · in play</h2><p class="sub">${sub}</p><div class="tw"><table class="t">${th}<tbody>${show.map((r) => rowHtml(r, st, selected)).join('')}</tbody></table></div></section>`;
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
  return `${p.month} ${p.day} ${mt12(t)} MT`;
};
export function whyHtml(r, nowMs = Date.now(), li = false) {
  const n = r.news;
  if (!n) return li ? '<li><span>No ticker-named headline since the prior close</span></li>' : '<small class="ns-why">no ticker-named headline since the prior close</small>';
  const meta = `${esc(n.src)} · ${esc(mtStamp(n.at))} · ${esc(ageLabel(n.at, nowMs))}${n.n > 1 ? ` · ${n.n} mover-list mentions` : ''}`;
  return li ? `<li><b>${esc(sentence(n.kind))}</b> ${esc(n.h)} <span>· ${meta}</span></li>` : `<small class="ns-why"><b>${esc(sentence(n.kind))}</b> ${esc(n.h)} · ${meta}</small>`;
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

// ---------- stretch triplet card for the detail panel (name-card mock: compact strip + .t session split) ----------
export function cardHtml(r, nowMs = Date.now()) {
  if (!r) return '';
  const wrap = (inner) => `<div class="sk ns-cardsk">${inner}</div>`;
  if (r.live_only) return wrap(`<div class="ns-cardhd"><b>${esc(r.t)}</b><span class="chip">Not in last close build</span></div><p class="note">In the live in-play book, but the last close build does not carry it. Stretch columns appear after the next close build.</p>`);
  if (!fin(r.p)) return wrap(`<div class="ns-cardhd"><b>${esc(r.t)}</b></div><p class="note">No daily bar for this session on file · not ranked.</p>`);
  const ml = r.book === 'ML';
  const pc = pctOf(r);
  const gold = isExtreme(r);
  const notes = pctNotes(r).filter((x) => !x.endsWith(' sess.')).map((x) => ` · ${esc(x)}`).join('');
  const tile = (k, v, s, cls = '') => `<div class="tile${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const pTile = ml
    ? tile(`2-yr stretch pctl <span class="t2">${sessOf(r) ?? 504} sess.</span>`, fmtPctl(pc), `2-yr ×ATR range ${fmtX(r.lo2, 1)} → ${fmtX(r.hi2, 1)} · today ${fmtX(r.x2)}${notes}`, gold ? ' ext' : '')
    : tile(`1-yr stretch pctl <span class="t2">${sessOf(r) ?? 252} sess.</span>`, fmtPctl(pc), `8EMA % distance vs its own year · 2-yr history n/a for small caps${r.ca ? ` · split/CA guard ${esc(dayLabel(r.ca.d))}, pctl skipped` : ''}${notes}`, gold ? ' ext' : '');
  const sesRow = (name, g, base) => (g ? `<tr><th>${name}</th><td>${fmtPx(g.o)}</td><td class="opt">${fmtPx(g.h)}</td><td class="opt">${fmtPx(g.l)}</td><td>${fmtPx(g.c)}</td><td class="${tone(g.c / base - 1)}">${fmtChg((g.c / base - 1) * 100)}</td></tr>` : '');
  const s = r.ses || {};
  const split = `<div class="tw"><table class="t ns-split"><thead><tr><th class="l">Session</th><th>Open</th><th class="opt">High</th><th class="opt">Low</th><th>Last</th><th>Chg %</th></tr></thead><tbody>${sesRow('Pre 2:00 AM–7:30 AM MT', s.pre, r.prev)}${sesRow('RTH last 2m print', s.rth, r.prev)}<tr class="base"><th>Official close · ranked</th><td></td><td class="opt"></td><td class="opt"></td><td>${fmtPx(r.p)}</td><td class="${tone(r.chg)}">${fmtChg(r.chg)}</td></tr>${sesRow('AH 2:00 PM–6:00 PM MT', s.ah, r.p)}${fin(r.poll) ? `<tr><th>Live board poll ${esc(updLabel(r.upd))}</th><td></td><td class="opt"></td><td class="opt"></td><td>${fmtPx(r.poll)}</td><td class="t2">not ranked</td></tr>` : ''}</tbody></table></div>`;
  return wrap(`<div class="ns-cardhd"><b>${esc(r.t)}</b><span>${fmtPx(r.p)}</span><span class="${tone(r.chg)}">${fmtChg(r.chg)}</span><span class="t2">RTH close · AH <span class="${tone(r.ah_pct)}">${fmtChg(r.ah_pct)}</span></span></div>
<p class="sub">Stretch triplet at the RTH close · ${esc(dayLabel(r.session || ''))}</p>
<div class="strip compact" style="--cols:4">
${tile('vs 8EMA <span class="t2">daily</span>', `<span class="${tone(r.x8)}">${fmtX(r.x8)}</span> <small>ATR</small>`, `${fmtChg(r.e8p)} · EMA8 ${fmtPx(r.ema8)} · ATR ${fmtPx(r.atr)}`)}
${tile('vs VWAP <span class="t2">2:00 AM–2:00 PM MT</span>', `<span class="${tone(r.xv)}">${fmtX(r.xv)}</span> <small>ATR</small>`, fin(r.vwap) && fin(r.p) ? `${fmtChg((r.p / r.vwap - 1) * 100)} · VWAP ${fmtPx(r.vwap)}` : 'VWAP n/a')}
${tile('z vs 20-day <span class="t2">20 closes</span>', `<span class="${tone(r.z20)}">${fmtZ(r.z20)}</span>`, `mean ${fmtPx(r.z_mu)} · sd ${fmtPx(r.z_sd)}`)}
${pTile}
</div>${split}<ul class="ctx">${whyHtml(r, nowMs, true)}</ul>`);
}

// '2026-10-11 08:17 MT' -> '08:17 MT Sun Oct 11'; '2026-10-09 close' -> 'Fri Oct 9 close' (display only)
const mtWhen = (v) => { const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?(.*)$/.exec(String(v || '')); if (!m) return esc(v); return m[2] ? `${hm12(+m[2].slice(0, 2), +m[2].slice(3))} MT ${dayLabel(m[1])}` : `${dayLabel(m[1])}${esc(m[3])}`; };
// ---------- head + strip (replaces the old badge row; same facts) ----------
export function headHtml(doc, nowMs = Date.now(), extra = []) {
  const f = freshness(doc, nowMs);
  const mmOld = !!doc.mrmap_asof_date && doc.mrmap_asof_date !== doc.session;
  return `<div class="head"><h1>Stretch board</h1><span class="meta">Ranked on the ${esc(dayLabel(doc.session))} RTH close (2:00 PM MT) · built ${mtWhen(doc.built_mt)} · 2-yr pctl from MR MAP ${mmOld ? `as of ${esc(dayLabel(doc.mrmap_asof_date))}` : mtWhen(doc.mrmap_asof)}, built ${mtWhen(doc.mrmap_built)} · AH = last 2m print to 6:00 PM MT, never ranked</span></div>`;
}
export function readHtml(doc, nowMs = Date.now(), extra = []) {
  const rows = doc.rows.concat(extra).filter((r) => !r.live_only && fin(r.p));
  const hi = rows.filter((r) => fin(pctOf(r)) && pctOf(r) >= EXTREME_HI && !goldBlock(r)), lo = rows.filter((r) => fin(pctOf(r)) && pctOf(r) <= EXTREME_LO && !goldBlock(r));
  const names = (list) => list.slice(0, 5).map((r) => `<b>${esc(r.t)}</b> ${fmtPctl(pctOf(r))}`).join(', ') + (list.length > 5 ? ` and ${list.length - 5} more` : '');
  const top = rows.filter((r) => fin(r.x8)).sort((a, b) => Math.abs(b.x8) - Math.abs(a.x8))[0];
  return `<p class="read">${hi.length + lo.length} of ${rows.length} ranked in-play names sit at a stretch extreme vs their own history${hi.length ? `; high: ${names(hi)}` : ''}${lo.length ? `; low: ${names(lo)}` : ''}.${top ? ` Most stretched from the daily 8EMA: <b>${esc(top.t)}</b> at <span class="${tone(top.x8)}">${fmtX(top.x8)}</span> ATR.` : ''}${freshness(doc, nowMs).ok ? '' : ` <b>Gold is off:</b> this is the ${esc(dayLabel(doc.session))} close and the ${esc(dayLabel(freshness(doc, nowMs).expected))} close build has not landed; the live books below are current.`} <span class="t2">Descriptive percentiles, not an edge claim.</span></p>`;
}
// V2.19.5 drill-down (Austin Oct 20: click a count tile -> its names open in place; click the tile again to close).
let drill = null;
const nsDt = (k) => ` drill${drill === k ? ' open' : ''}" data-sk-drill="${k}" tabindex="0" role="button" aria-expanded="${drill === k}"`;
const nsDrills = (rows) => ({
  book: { title: `All ${rows.length} in-play names`, sub: 'Small cap and mid / large books together · sorted by the board sort · click a name for its chart', list: rows },
  stale: { title: `${rows.filter((r) => r.poller_stale).length} poller-stale ${rows.filter((r) => r.poller_stale).length === 1 ? 'name' : 'names'}`, sub: 'Roster names the poller did not update this session · sorted last on the board, never gold · click a name for its chart', list: rows.filter((r) => r.poller_stale) },
});
export function drillHtml(doc, st, selected = null, extra = []) {
  const rows = doc.rows.concat(extra);
  const D = drill && nsDrills(rows)[drill];
  if (!D || !D.list.length) return '';
  const sesHead = st.ses === 'pre' ? 'Pre %' : 'AH %';
  const th = `<thead><tr><th class="l">Name</th><th>RTH close</th><th>Chg %</th><th class="opt">${sesHead}<small>never ranked</small></th><th>8EMA<small>× ATR</small></th><th class="opt">VWAP<small>× ATR</small></th><th class="opt">Z 20D<small>σ</small></th><th>Stretch pctl<small>own: SC 1-yr · ML 2-yr</small></th></tr></thead>`;
  return `<section class="panel drillp" aria-label="${esc(D.title)}"><h2>${esc(D.title)}</h2><p class="sub">${esc(D.sub)} · click the tile again to close</p><div class="tw"><table class="t">${th}<tbody>${sortRows(D.list, st.sort).map((r) => rowHtml(r, st, selected)).join('')}</tbody></table></div></section>`;
}
export function badgesHtml(doc, nowMs = Date.now(), extra = []) {
  const rows = doc.rows.concat(extra);
  const stale = rows.filter((r) => r.poller_stale);
  const f = freshness(doc, nowMs);
  const mmOld = !!doc.mrmap_asof_date && doc.mrmap_asof_date !== doc.session;
  const live = rows.filter((r) => r.live_only).length;
  const D = nsDrills(rows);
  const tile = (k, v, s, cls = '', dk = '') => `<div class="tile${cls}${dk && D[dk].list.length ? nsDt(dk) : '"'}><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `<div class="strip">${[
    tile('Ranked on', esc(dayLabel(doc.session)), 'RTH close 2:00 PM MT · stretch, pctl, gold + sort'),
    tile('Data', f.ok ? 'Current' : 'Behind', f.ok ? `${esc(dayLabel(doc.session))} close · built ${mtWhen(doc.built_mt)}` : `expected ${esc(dayLabel(f.expected))} close · gold off until the next close build`),
    tile('Book', `${rows.filter((r) => r.book === 'SC').length} <small>SC</small> ${rows.filter((r) => r.book === 'ML').length} <small>ML</small>`, `in play · ${esc(doc.md_n)} polled names${live ? ` · ${live} live-only, not in last close build` : ''}`, '', 'book'),
    tile('Poller stale', `${stale.length} <small>names</small>`, stale.length ? stale.map((r) => `${esc(r.t)} since ${esc(updLabel(r.upd))}`).join(' · ') + ' · sorted last, no gold' : 'every roster name polled this session', '', 'stale'),
    tile('2-yr pctl', mmOld ? esc(dayLabel(doc.mrmap_asof_date)) : 'Same session', `MR MAP built ${mtWhen(doc.mrmap_built)} · mid/large only${mmOld ? ' · older than the ranked session · no gold from it' : ''}`, ' mr'),
  ].join('')}</div>`;
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
  [['SC', 0, 'Small cap · colour = 1-yr pctl (up to 252 sess.) · size = $vol'], ['ML', gw, 'Mid / large · colour = 2-yr pctl (up to 504 sess.) · size = $vol']].forEach(([bk, x0, label]) => {
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
    return `<g class="ns-dot" data-ticker="${esc(r.t)}"><title>${esc(`${r.t} · pctl ${fmtPctl(p)} · 8EMA ${fmtX(r.x8)} ATR`)}</title>${shape}<text x="${(x + rad + 4).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="#e0e5e7" font-weight="600">${esc(r.t)}</text></g>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI Variable Text,Segoe UI,sans-serif" font-size="11.5" fill="#bec7cd">${g}${dots}</svg>`;
}

// ---------- phone cards (<= 700 px) ----------
function spark(cl) {
  if (!Array.isArray(cl) || cl.length < 2) return '';
  const w = 160, h = 30, cs = candleSpark(cl.filter(fin), { w, h, padTop: 2, padBot: 2 });
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="close-to-close candles, no intraday range">${cs.body}</svg>`;
}
export function cardsHtml(rows, st, snap = '') {
  const list = sortRows(rows.filter((r) => passes(r, st)), st.sort);
  const c = list.map((r) => {
    const p = pctOf(r), n = sessOf(r), nom = NOMINAL[r.book === 'ML' ? 'ML' : 'SC'], lab = `${r.book === 'ML' ? '2Y' : '1Y'}${n != null && n < nom ? ` ${n} sess.${n < MIN_SESS ? ' SHORT' : ''}` : ''}${r.ca ? ' SPLIT/CA' : ''}${r.book === 'ML' && r.p2_stale ? ` as of ${dayLabel(r.p2_asof)} MT` : ''}`;
    if (r.live_only) return `<div class="ns-gc" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b><span class="ns-tag ns-stale">Not in last close build</span></div><div class="ns-r4 ns-na">\u2014 stretch columns appear after the next close build</div></div>`;
    if (!fin(r.p)) return `<div class="ns-gc" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b></div><div class="ns-r4 ns-na">no session bar · not ranked</div></div>`;
    return `<div class="ns-gc${isExtreme(r) ? ' ns-ext' : ''}" data-ticker="${esc(r.t)}"><div class="ns-r1"><b>${esc(r.t)}</b><span class="ns-bkn ${r.book.toLowerCase()}">${r.book}</span><span class="ns-px">${fmtPx(r.p)}</span><span class="ns-ch ${tone(r.chg)}">${fmtChg(r.chg)}</span></div>
<div class="ns-r2">${spark(r.cl)}${pbar(p, `<span class="ns-na" style="font-size:10px">${lab}</span>`)}</div>
<div class="ns-r3"><span>8Ema <b class="${tone(r.x8)}">${fmtX(r.x8, 1)}</b></span><span>VWAP <b class="${tone(r.xv)}">${fmtX(r.xv, 1)}</b></span><span>z <b class="${tone(r.z20)}">${fmtZ(r.z20)}</b></span><span>AH <b class="${tone(r.ah_pct)}">${fmtChg(r.ah_pct)}</b></span></div>
<div class="ns-r4">${r.poller_stale ? `<span class="ns-tag ns-stale">Poller stale · ${esc(updLabel(r.upd))}</span>` : ''}${r.status ? `<span class="ns-tag ${r.status === 'RUNNING' ? 'ns-run' : 'ns-fade'}">${esc(r.status)}</span>` : ''}${esc([r.dlab, fmtUsd(r.dvol) + ' $vol'].filter(Boolean).join(' \u00b7 '))}</div>${r.news ? whyHtml(r) : ''}</div>`;
  }).join('');
  return `<div class="ns-cardh">In play · ${list.length} names <span>${esc(snap || 'RTH close · pctl extreme')}</span></div>${c}`;
}

export function sessionNote(st, doc) {
  const d = dayLabel(doc.session);
  if (st.ses === 'pre') return `Pre-market % (last 2m print before 7:30 AM MT vs the prior close) is shown in its own column. Ranking stays on the ${d} RTH close.`;
  if (st.ses === 'ah') return `After-hours % (last 2m print to 6:00 PM MT vs the RTH close) is shown in its own column. Ranking stays on the ${d} RTH close.`;
  return `Every row is ranked on the official RTH close (${d} 2:00 PM MT). After-hours sits in its own AH % column and is never ranked.`;
}

// ---------- controls (kit segmented toggles; spans act as buttons, Enter/Space wired in boot) ----------
const chip = (attr, val, label, on, small = '') => `<span role="button" tabindex="0" class="${on ? 'on' : ''}" data-ns-${attr}="${val}" aria-pressed="${on}">${label}${small ? ` <small>${small}</small>` : ''}</span>`;
const grp = (label, inner, cls = '') => `<span class="ns-grp${cls}"><span class="ns-lbl">${label}</span><span class="seg">${inner}</span></span>`;
export function controlsHtml(st, doc) {
  return `<div class="ns-ctrl">
${grp('Session', `${chip('ses', 'pre', 'Pre', st.ses === 'pre', '2:00 AM–7:30 AM MT')}${chip('ses', 'rth', 'RTH', st.ses === 'rth', '7:30 AM–2:00 PM MT')}${chip('ses', 'ah', 'AH', st.ses === 'ah', '2:00 PM–6:00 PM MT')}`)}
${grp('Min price', `${chip('px', 0, 'All', st.px === 0)}${chip('px', 1, '≥ $1', st.px === 1)}${chip('px', 5, '≥ $5', st.px === 5)}`)}
${grp('Min $vol', `${chip('dv', 0, 'All', st.dv === 0)}${chip('dv', 1e6, '≥ $1M', st.dv === 1e6)}${chip('dv', 1e7, '≥ $10M', st.dv === 1e7)}`)}
${grp('Sort', `${chip('sort', 'pct', 'Pctl extreme', st.sort === 'pct')}${chip('sort', 'x8', '8EMA ×ATR', st.sort === 'x8')}${chip('sort', 'chg', 'Chg %', st.sort === 'chg')}${chip('sort', 'dvol', '$vol', st.sort === 'dvol')}`)}
${grp('View', `${chip('view', 'table', 'Table', st.view === 'table')}${chip('view', 'heat', 'Heat map', st.view === 'heat')}${chip('view', 'plot', 'Stretch plot', st.view === 'plot')}`, ' ns-dsk')}
${grp('Live books', `${chip('books', 'on', 'Shown', st.books)}${chip('books', 'off', 'Hidden', !st.books)}`, ' ns-dsk')}
</div><p class="note" id="nsNote">${esc(sessionNote(st, doc))}</p>`;
}

export function footHtml(doc) {
  return `<p class="note" data-sk-label="Definitions"><b>Stretch triplet, per row.</b> All on the <b>official RTH close of ${esc(dayLabel(doc.session))}</b> (daily bar), never the after-hours poll. 8EMA ×ATR = (close − daily EMA8) ÷ Wilder ATR14. VWAP ×ATR = (close − day VWAP 2:00 AM–2:00 PM MT, pre-market included) ÷ ATR. Z 20D σ = (close − 20-day mean) ÷ population sd. Percentiles: small caps = share of the last 252 sessions of 8EMA % distance at or below today. Mid/large = mid-rank (share below + half the ties) of today's ×ATR within the name's own last 504 sessions; it comes from the MR MAP when that snapshot is for the same session, else from the name's own bars (labelled), else n/a. Rows with fewer sessions show the real count; under 250 sessions they are marked short history and never take gold. A confirmed corporate action (MR MAP list) inside the window skips the percentile (split/CA guard); a big gap alone never does. Gold row fill + edge bar = percentile ≤ 5% or ≥ 95%. Poller-stale, split-guarded, short-history and behind-data rows never take gold. All times MT.</p>`;
}

// ---------- CSS (injected). Board skin v2: colours, fonts, tables, tiles come from the shared .sk kit; only what the kit lacks lives here ----------
export const CSS = `
#nowStretch,#nsCard{margin:0 0 10px;color:var(--text,#e0e5e7)}
#nowStretch *,#nsCard *{box-sizing:border-box}
#nowStretch .sk{padding:4px 0 8px}
#nowStretch .ns-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin:0 0 4px}
#nowStretch .ns-grp{display:inline-flex;align-items:center;gap:8px}
#nowStretch .ns-lbl{color:var(--text-2);font:600 13px/1.2 var(--font)}
#nowStretch .seg span[role=button]{cursor:pointer;white-space:nowrap}
#nowStretch .seg span[role=button]:focus-visible{outline:2px solid var(--text);outline-offset:1px}
#nowStretch .seg small{font:400 11.5px/1 var(--font);color:var(--text-2);margin-left:3px}
#nowStretch .ns-books{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start;margin-top:12px}
@media (max-width:1500px){#nowStretch .ns-books{grid-template-columns:minmax(0,1fr)}}
#nowStretch .ns-books .t th:first-child{min-width:200px;max-width:340px;white-space:normal}
#nowStretch .t tr.ns-row{cursor:pointer}
#nowStretch .t tr.ns-row:hover > *{background:var(--raised-2)}
#nowStretch .t tr.ns-sel > *{background:var(--raised-2)}
#nowStretch .t tr.ns-sel > :first-child{box-shadow:inset 3px 0 0 var(--text)}
#nowStretch .t tr.ns-sel.ext > :first-child{box-shadow:inset 3px 0 0 var(--gold)}
#nowStretch .ns-why,#nsCard .ns-why{white-space:normal;max-width:520px}
#nowStretch .ns-why b{color:var(--text)}
#nowStretch .ns-views .ns-why{display:none}
#nowStretch .ns-heat{position:relative;height:640px;background:#000;border-radius:6px}
#nowStretch .ns-hg{position:absolute;box-shadow:inset 0 0 0 1px var(--line-strong)}
#nowStretch .ns-hgh{position:absolute;left:0;right:0;top:0;height:20px;padding:2px 7px;background:var(--raised);color:var(--text);font:600 12px/16px var(--font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#nowStretch .ns-ht{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #000;overflow:hidden;text-align:center;cursor:pointer}
#nowStretch .ns-ht b{color:#fff;font:600 14px/1 var(--font);text-shadow:0 1px 1px rgba(0,0,0,.4)}
#nowStretch .ns-ht i{margin-top:3px;color:#f4f5f5;font:400 11.5px/1.1 var(--font);font-style:normal;white-space:nowrap}
#nowStretch .ns-ht.ns-hot{box-shadow:inset 0 0 0 2px var(--gold)}
#nowStretch .ns-leg{display:inline-flex;margin-left:8px;vertical-align:middle}
#nowStretch .ns-leg span{min-width:44px;padding:2px 5px;color:#fff;font:600 11.5px/1.2 var(--font);text-align:center}
#nowStretch .ns-scat{background:#000;border-radius:6px;overflow-x:auto}
#nowStretch .ns-dot{cursor:pointer}
#nowStretch .ns-empty{padding:14px 0;color:var(--text-2)}
#nsCard{margin:10px 0 0}
#nsCard .sk{padding:12px 14px;background:var(--raised);border-radius:8px}
#nsCard .ns-cardhd{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0 0 4px}
#nsCard .ns-cardhd b{font:600 22px/1.1 var(--font)}
#nsCard .ns-cardhd > span{font:600 16px/1 var(--font)}
#nsCard .sub{margin:0 0 6px;color:var(--text-2);font-size:13px}
#nsCard .strip.compact .tile{background:var(--raised-2)}
#nsCard .strip.compact .tile .k{display:flex;justify-content:space-between;gap:6px}
#nsCard .strip.compact .tile .s{white-space:normal}
#nsCard .t.ns-split{margin-top:10px}
#nsCard .t.ns-split thead th{background:var(--raised-2)}
#nsCard .ctx{margin-top:8px}
@media (max-width:1100px){#nsCard .strip.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:700px){
#nowStretch .ns-dsk{display:none!important}
#nowStretch .ns-ctrl{gap:8px 12px}
#nowStretch .seg{flex-wrap:wrap}
#nowStretch .seg small{display:none}
#nowStretch .ns-grp{flex-wrap:wrap}
#nowStretch .ns-books{grid-template-columns:minmax(0,1fr)}
#nowStretch .ns-books .t th:first-child{min-width:0}
#nowStretch .t .ns-why{display:none}
body.ns-on:not(.ns-behind) .books-grid{display:none}
body.ns-on.ns-behind.ns-books-off .books-grid{display:grid}
}
body.ns-on.ns-books-off .books-grid{display:none}
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
    return `<section class="panel"><h2>In-play heat map <span class="ns-leg">${leg}</span></h2><p class="sub" id="nsHcount">colour = own stretch pctl · size = $vol</p><div class="ns-heat" id="nsHeat"></div></section>`;
  }
  if (st.view === 'plot') return `<section class="panel"><h2>Stretch plot</h2><p class="sub">x = vs 8EMA ×ATR · y = stretch pctl · dot size = $vol · ○ small cap (1-yr pctl) · □ mid/large (2-yr pctl)</p><div class="ns-scat" id="nsScat"></div></section>`;
  return `<div class="ns-books">${bookHtml(rows, 'SC', st, selected, QUICK_ROWS)}${bookHtml(rows, 'ML', st, selected, QUICK_ROWS)}</div>`;
}

let deepOpen = false;
function paint() {
  if (!root || !doc) return;
  behind = !freshness(doc).ok;
  document.body.classList.toggle('ns-behind', behind);
  document.body.classList.toggle('ns-books-off', !st.books);
  const rows = allRows();
  const full = `<div class="ns-books" data-sk-label="All names">${bookHtml(rows, 'SC', st, selected)}${bookHtml(rows, 'ML', st, selected)}</div>`;
  const deep = `<details class="deep" id="nsDeep"${deepOpen ? ' open' : ''}><summary>Deep view <span>every in-play row in both books (${rows.length} names) with the news line, how the stretch triplet is computed</span></summary><div class="body">${full}${footHtml(doc)}</div></details>`;
  root.innerHTML = `<div class="sk">${headHtml(doc, Date.now(), liveOnly)}${readHtml(doc, Date.now(), liveOnly)}${badgesHtml(doc, Date.now(), liveOnly)}${drillHtml(doc, st, selected, liveOnly)}${controlsHtml(st, doc)}<div class="ns-views" id="nsViews">${viewHtml()}</div>${deep}</div>`;
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
  const dtile = e.target.closest('[data-sk-drill]');
  if (dtile) { const k = dtile.dataset.skDrill; drill = drill === k ? null : k; paint(); root.querySelector('[data-sk-drill="' + k + '"]')?.focus({ preventScroll: true }); e.stopPropagation(); return; }
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
  root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-ns-ses],[role=button][data-ns-px],[role=button][data-ns-dv],[role=button][data-ns-sort],[role=button][data-ns-view],[role=button][data-ns-books],[role=button][data-sk-drill]')) { e.preventDefault(); e.target.click(); } });
  root.addEventListener('toggle', (e) => { if (e.target.id === 'nsDeep') deepOpen = e.target.open; }, true);
  host.parentNode.insertBefore(root, host);
  st = loadState(store());
  try {
    const res = await fetch('./data/now-stretch.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j?.schema !== 'now-stretch/1' || !Array.isArray(j.rows)) throw new Error('unexpected schema');
    doc = j;
  } catch (err) {
    root.innerHTML = `<div class="sk"><p class="hidden-note"><b>Stretch board unavailable</b> · ${esc(String(err.message || err))} · the live books below are unchanged</p></div>`;
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
