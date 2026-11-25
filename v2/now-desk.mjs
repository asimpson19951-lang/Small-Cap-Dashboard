// NOW tab "Linked Desk" (RC2 step C2, V2.21.0-rc2). Self-wiring ES module: <script type="module" src="./now-desk.mjs?v=V2.23.0">.
// Long-side rail | his chart | short-side rail, a stat block and linked panels under it, then a first-class Small cap
// section and a Mid / large section (table | chart wall | heat map). One click on any name retargets every panel.
// Data: ./data/now-stretch.json (through now-stretch.mjs, unchanged feed) + ./data/rc2-now-desk.json (float, share volume,
// gap, discovery tag, poller last seen, local SEC filings, 2-minute bars; built by producers/build-rc2-now-desk.mjs).
// Raw primitives only: no scores, no grades. The live chart, live detail tiles, news and Ask Edgar stay app.js (Supabase).
// Pure helpers are exported for node tests (tests/rc2-now.test.mjs).

import { floatVerdict } from './float-rule.mjs?v=V2.23.0';
import * as NS from './now-stretch.mjs?v=V2.23.0';
import { mtMinuteToMs, tvcAttr } from './chart-core.mjs?v=V2.23.0';
import * as SF from './spec-feeds.mjs?v=V2.23.0';

export const NM = 'not measured';
export const DESK_KEY = 'rc2.nowDesk';
export const UNITS = ['usd', 'pct', 'atr'];
export const UNIT_LABEL = { usd: '$', pct: '%', atr: 'ATR' };
export const EXCLUDE = ['SNDK', 'SENEA']; // split artefacts in the feed: never listed, counted only
export const SMALL_CAP_MAX = 2e9, MID_CAP_MAX = 1e10;
export const FLOAT_MIN_SHARE_OF_VOLUME = 0.01; // a float under 1% of the session's share volume is not believable
export const WALL_CAP = 16;                    // chart wall: 12 to 20 miniatures, never more
export const WALL_MIN_BARS = 60;                // of about 240 possible: a thinner tape draws as loose fragments, so it stays in the table
const MINUS = '−';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const esc = NS.esc;

// ---------- units switch: every move / stretch column in $ , % or ATR (pure) ----------
// r = a now-stretch row, d = its rc2-now-desk row (only the gap needs it). Returns a number or null.
export function unitVal(r, col, unit, d = null) {
  if (!r) return null;
  const atr = fin(r.atr) && r.atr > 0 ? r.atr : null;
  let usd = null, pct = null, x = null;
  if (col === 'chg') { usd = fin(r.p) && fin(r.prev) ? r.p - r.prev : null; pct = fin(r.chg) ? r.chg : null; }
  else if (col === 'x8') { usd = fin(r.p) && fin(r.ema8) ? r.p - r.ema8 : null; pct = fin(r.e8p) ? r.e8p : (fin(usd) && r.ema8 > 0 ? (usd / r.ema8) * 100 : null); x = fin(r.x8) ? r.x8 : null; }
  else if (col === 'xv') { usd = fin(r.p) && fin(r.vwap) ? r.p - r.vwap : null; pct = fin(usd) && r.vwap > 0 ? (usd / r.vwap) * 100 : null; x = fin(r.xv) ? r.xv : null; }
  else if (col === 'pre') { pct = fin(r.pre_pct) ? r.pre_pct : null; const c = r.ses?.pre?.c; usd = fin(c) && fin(r.prev) ? c - r.prev : (fin(pct) && fin(r.prev) ? (r.prev * pct) / 100 : null); }
  else if (col === 'ah') { pct = fin(r.ah_pct) ? r.ah_pct : null; usd = fin(r.ah) && fin(r.p) ? r.ah - r.p : (fin(pct) && fin(r.p) ? (r.p * pct) / 100 : null); }
  else if (col === 'gap') { pct = fin(d?.gap) ? d.gap : null; usd = fin(d?.o) && fin(d?.pc) ? d.o - d.pc : null; }
  else return null;
  if (unit === 'usd') return fin(usd) ? usd : null;
  if (unit === 'pct') return fin(pct) ? pct : null;
  if (unit === 'atr') return fin(x) ? x : (fin(usd) && atr ? usd / atr : null);
  return null;
}
// '+$0.12' / '−$0.0345' / '+10.0%' / '+1.25 ATR'; null -> 'not measured'. Every number carries its unit.
export function fmtUnit(v, unit) {
  if (!fin(v)) return NM;
  const a = Math.abs(v);
  let body;
  if (unit === 'usd') body = `$${a >= 100 ? a.toFixed(2) : a >= 1 ? a.toFixed(2) : a >= 0.1 ? a.toFixed(3) : a.toFixed(4)}`;
  else if (unit === 'pct') body = `${a.toFixed(1)}%`;
  else body = `${a.toFixed(2)} ATR`;
  const zero = Number(body.replace(/[^0-9.]/g, '')) === 0;
  return `${zero ? '' : v > 0 ? '+' : MINUS}${body}`;
}
export const fmtShares = (v) => (!fin(v) ? NM : `${v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K` : v.toFixed(0)} shares`);
export const fmtUsdBig = (v) => (!fin(v) ? NM : `$${v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0)}`);
export const fmtRot = (v) => (!fin(v) ? NM : `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`);

// ---------- cap buckets + the SC split (pure) ----------
export function capBucket(cap) {
  if (!fin(cap) || cap <= 0) return null;
  return cap < SMALL_CAP_MAX ? 'small' : cap < MID_CAP_MAX ? 'mid' : 'large';
}
// side of a row for the mean-reversion rails: below the 8 EMA = long side, above = short side.
export const sideOf = (r) => (!r || !fin(r.x8) || r.x8 === 0 ? null : r.x8 < 0 ? 'long' : 'short');
// Small caps are their own book (own count, own 1-yr percentile); mid / large keep the 2-yr percentile.
// Returns { SC:{all,long,short,flat}, ML:{...}, excluded } with SNDK / SENEA removed and only counted.
export function splitDesk(rows) {
  const out = { SC: { all: [], long: [], short: [], flat: [] }, ML: { all: [], long: [], short: [], flat: [] }, excluded: 0 };
  for (const r of rows || []) {
    if (EXCLUDE.includes(String(r.t).toUpperCase())) { out.excluded++; continue; }
    const b = out[r.book === 'ML' ? 'ML' : 'SC'];
    b.all.push(r);
    const s = sideOf(r);
    b[s || 'flat'].push(r);
  }
  return out;
}

// RC2 round 2 fix 1: the name the desk links before the user clicks anything. It is always a close-build name:
// first visible row of the small-cap long rail, else the small-cap short rail, else the first mid / large row.
// `vis(list)` returns the visible, sorted rows of a rail (the board's own filters + sort); default = as given.
export function defaultLinkPick(split, vis = (l) => l) {
  const first = (l) => (vis(l || []) || []).find((r) => r && r.t && !EXCLUDE.includes(String(r.t).toUpperCase())) || null;
  const r = first(split?.SC?.long) || first(split?.SC?.short) || first(split?.ML?.long) || first(split?.ML?.short);
  return r ? r.t : null;
}

// ---------- float plausibility (pure) ----------
// state 'ok' -> float + rotation are printed; 'missing' -> the feed has no float; 'implausible' -> the feed float is
// under 1% of the session's share volume (rotation over 100x): printed as "not measured", the raw value goes in the note.
export function floatCheck(flt, vol, so) {
  if (!fin(flt) || flt <= 0) return { state: 'missing', rot: null };
  const v = floatVerdict(flt, so, vol); // RC2 fix #5: same rule as the live tile (float-rule.mjs)
  if (v.state === 'implausible') return { state: 'implausible', rot: null, raw: flt, why: v.why };
  return { state: 'ok', rot: fin(vol) && vol >= 0 ? vol / flt : null };
}

// ---------- named layouts (pure) ----------
export const PANELS = ['long', 'short', 'chart', 'stat', 'live', 'evid', 'news', 'sec', 'SC', 'ML'];
export const LAYOUTS = {
  pre: { label: 'Pre-market', ses: 'pre', sort: 'ses', open: { long: true, short: true, chart: true, stat: true, live: true, evid: false, news: true, sec: true, SC: true, ML: false } },
  post: { label: 'Post-close', ses: 'ah', sort: 'pct', open: { long: true, short: true, chart: true, stat: true, live: true, evid: true, news: true, sec: true, SC: true, ML: true } },
};
const mtParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
// First visit only: 2:00 AM to 7:30 AM MT on a weekday opens Pre-market, any other time Post-close.
export function defaultLayout(nowMs = Date.now()) {
  const p = mtParts(nowMs); const m = Number(p.hour) * 60 + Number(p.minute);
  return !['Sat', 'Sun'].includes(p.weekday) && m >= 120 && m < 450 ? 'pre' : 'post';
}
export function defaultDesk(nowMs = Date.now()) {
  return { layout: defaultLayout(nowMs), units: 'atr', side: 'both', mlcap: 'all', folds: { pre: {}, post: {} } };
}
export function loadDesk(storage, nowMs = Date.now()) {
  const d = defaultDesk(nowMs);
  try {
    const raw = storage?.getItem(DESK_KEY);
    if (!raw) return d;
    const o = JSON.parse(raw);
    const folds = { pre: {}, post: {} };
    for (const L of Object.keys(LAYOUTS)) for (const k of PANELS) if (typeof o?.folds?.[L]?.[k] === 'boolean') folds[L][k] = o.folds[L][k];
    return {
      layout: LAYOUTS[o.layout] ? o.layout : d.layout,
      units: UNITS.includes(o.units) ? o.units : d.units,
      side: ['both', 'long', 'short'].includes(o.side) ? o.side : d.side,
      mlcap: ['all', 'mid', 'large'].includes(o.mlcap) ? o.mlcap : d.mlcap,
      folds,
    };
  } catch { return d; }
}
export function saveDesk(storage, d) {
  try { storage?.setItem(DESK_KEY, JSON.stringify({ layout: d.layout, units: d.units, side: d.side, mlcap: d.mlcap, folds: d.folds })); return true; } catch { return false; }
}
// Is a panel open? A fold the user set inside this layout wins over the layout's own default.
export function panelOpen(d, key) {
  const own = d?.folds?.[d.layout]?.[key];
  return typeof own === 'boolean' ? own : !!LAYOUTS[d?.layout]?.open?.[key];
}
export function toggleFold(d, key) {
  if (!PANELS.includes(key)) return d;
  return { ...d, folds: { ...d.folds, [d.layout]: { ...(d.folds?.[d.layout] || {}), [key]: !panelOpen(d, key) } } };
}
// Picking a layout: returns the new desk state + the session pill and sort the stretch board must take.
export function applyLayout(d, id) {
  const L = LAYOUTS[id];
  if (!L) return { desk: d, ns: null };
  return { desk: { ...d, layout: id }, ns: { ses: L.ses, sort: L.sort } };
}

// ---------- times ----------
// UTC ISO -> 'Nov 23, 1:06 PM MT' (12-hour Mountain Time, DST-aware)
export function mtStamp(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NM;
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(t));
  return `${s.replace(/ /g, ' ')} MT`;
}
// minutes after midnight -> '7:30 AM'
export function minLabel(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const dShort = (iso) => { const l = NS.dayLabel(iso); return l === NS.NA ? NM : l.replace(/^\w+ /, ''); }; // 'Aug 14'

// ---------- candles in his chart style (pure SVG string) ----------
// bars: [[minute of day MT, o, h, l, c, v], ...] for ONE session. Black pane, extended hours shaded lighter, hollow green
// up / solid red down, EMA 8 orange, BB 20,2 purple, VWAP solid blue from the first bar of the day, volume pane, High / Low tags.
// A true time axis: an empty 2-minute slot stays empty. opts.axis adds the $ + % scale and 12-hour MT time labels.
export const RTH_LO = 450, RTH_HI = 840; // 7:30 AM to 2:00 PM MT
export const GAP_BREAK_MIN = 16;
export const STATIC_GAP_MIN = 12; // close-build fallback chart: an indicator path breaks across more than 5 missing 2-minute bars (gap over 12 minutes)
export const staticCaption = (t, n, slots, day) => `${t} · ${n} of ${slots} 2-minute bars had trades (${day} close build, 2:00 AM to 6:00 PM MT; the live chart has no row for this name right now). Indicator lines break across gaps of more than 5 missing bars. Not execution.`;
export function indicators(bars) {
  const n = bars.length, ema = new Array(n).fill(null), mid = new Array(n).fill(null), up = new Array(n).fill(null), dn = new Array(n).fill(null), vw = new Array(n).fill(null);
  let e = null, pv = 0, vv = 0;
  for (let i = 0; i < n; i++) {
    const c = bars[i][4], v = bars[i][5] || 0, tp = (bars[i][2] + bars[i][3] + bars[i][4]) / 3;
    e = e == null ? c : c * (2 / 9) + e * (7 / 9);
    if (i >= 7) ema[i] = e;
    if (i >= 19) {
      let s = 0; for (let k = i - 19; k <= i; k++) s += bars[k][4];
      const mu = s / 20; let q = 0; for (let k = i - 19; k <= i; k++) q += (bars[k][4] - mu) ** 2;
      const sd = Math.sqrt(q / 20); mid[i] = mu; up[i] = mu + 2 * sd; dn[i] = mu - 2 * sd;
    }
    pv += tp * v; vv += v; vw[i] = vv > 0 ? pv / vv : null;
  }
  return { ema, mid, up, dn, vw };
}
export function candleSvg(bars, opts = {}) {
  const W = opts.w || 460, H = opts.h || 230, lo = opts.lo ?? 360, hi = opts.hi ?? RTH_HI, axis = !!opts.axis;
  const all = (bars || []).filter((b) => Array.isArray(b) && [b[1], b[2], b[3], b[4]].every(fin));
  const ind = indicators(all);
  const idx = []; for (let i = 0; i < all.length; i++) if (all[i][0] >= lo && all[i][0] < hi) idx.push(i);
  if (!idx.length) return { svg: '', n: 0 };
  const PL = 2, PR = axis ? 112 : 2, PT = axis ? 16 : 12, TB = axis ? 20 : 0, VH = Math.round((H - PT - TB) * 0.18), PB = TB + VH + 4;
  const slots = (hi - lo) / 2, sw = (W - PL - PR) / slots;
  const X = (min) => PL + ((min - lo) / 2 + 0.5) * sw;
  let pMin = Infinity, pMax = -Infinity, vMax = 0, iH = idx[0], iL = idx[0];
  for (const i of idx) {
    const b = all[i];
    if (b[2] > pMax) { pMax = b[2]; iH = i; } if (b[3] < pMin) { pMin = b[3]; iL = i; }
    for (const s of [ind.up[i], ind.dn[i], ind.vw[i], ind.ema[i]]) if (fin(s)) { if (s > pMax) pMax = s; if (s < pMin) pMin = s; }
    if (b[5] > vMax) vMax = b[5];
  }
  // the High / Low tags mark the candle extremes, so re-find them on bars only
  let hiP = -Infinity, loP = Infinity; for (const i of idx) { if (all[i][2] > hiP) { hiP = all[i][2]; iH = i; } if (all[i][3] < loP) { loP = all[i][3]; iL = i; } }
  if (!(pMax > pMin)) { pMax += Math.abs(pMax) * 0.01 || 0.01; pMin -= Math.abs(pMin) * 0.01 || 0.01; }
  const pad = (pMax - pMin) * 0.06; pMax += pad; pMin -= pad;
  const Y = (p) => PT + (1 - (p - pMin) / (pMax - pMin)) * (H - PT - PB);
  const f = (v) => v.toFixed(1);
  const px = (v) => `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`;
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#000"/>`;
  // extended hours shaded lighter
  const zone = (a, b) => { const x0 = Math.max(lo, a), x1 = Math.min(hi, b); if (x1 > x0) g += `<rect x="${f(PL + ((x0 - lo) / 2) * sw)}" y="0" width="${f(((x1 - x0) / 2) * sw)}" height="${H - TB}" fill="#16191d"/>`; };
  zone(0, RTH_LO); zone(RTH_HI, 1440);
  if (axis) {
    const ref = fin(opts.prev) && opts.prev > 0 ? opts.prev : null;
    for (let k = 0; k <= 5; k++) {
      const p = pMin + ((pMax - pMin) * k) / 5, y = Y(p);
      g += `<path d="M${PL} ${f(y)}H${W - PR}" stroke="#20252a"/><text x="${W - PR + 6}" y="${f(y + 4)}">${px(p)}${ref ? `  ${NS.fmtChg((p / ref - 1) * 100)}` : ''}</text>`;
    }
    for (let m = Math.ceil(lo / 60) * 60; m < hi; m += 60) { const x = PL + ((m - lo) / 2) * sw; g += `<path d="M${f(x)} 0V${H - TB}" stroke="#20252a"/>${(m / 60) % 2 === 0 ? `<text x="${f(x + 3)}" y="${H - 6}">${minLabel(m)}</text>` : ''}`; }
    g += `<text x="${W - PR + 6}" y="${H - 6}">MT · $ and % vs prior close</text>`;
  }
  // an indicator is never drawn across a stretch with no trades (over 16 minutes): on a thin name that would read as a line chart
  const line = (arr, color, wd = 1.2) => { let d = '', pen = false, last = null; for (const i of idx) { const v = arr[i]; if (last != null && all[i][0] - last > (opts.gapMin ?? GAP_BREAK_MIN)) pen = false; last = all[i][0]; if (!fin(v)) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${f(X(all[i][0]))} ${f(Y(v))}`; pen = true; } return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${wd}"/>` : ''; };
  g += line(ind.up, '#a06bdc', 1) + line(ind.dn, '#a06bdc', 1) + line(ind.mid, '#7a55a8', 0.8) + line(ind.vw, '#3d8bff', 1.5) + line(ind.ema, '#ff9d2e', 1.3);
  const bw = Math.max(1, Math.min(9, sw * 0.68));
  const vBase = H - TB - 2;
  for (const i of idx) {
    const [min, o, h, l, c, v] = all[i]; const x = X(min), upc = c >= o, col = upc ? '#51c083' : '#e17272';
    const y0 = Y(Math.max(o, c)), y1 = Y(Math.min(o, c)), bh = Math.max(1, y1 - y0);
    g += `<path d="M${f(x)} ${f(Y(h))}V${f(Y(l))}" stroke="${col}" stroke-width="1"/>`;
    g += upc ? `<rect x="${f(x - bw / 2)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="#000" stroke="${col}" stroke-width="${bw < 2.2 ? 0.7 : 1}"/>` : `<rect x="${f(x - bw / 2)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="${col}"/>`;
    if (vMax > 0 && v > 0) { const vh = Math.max(1, (v / vMax) * VH); g += `<rect x="${f(x - bw / 2)}" y="${f(vBase - vh)}" width="${f(bw)}" height="${f(vh)}" fill="${col}" opacity=".62"/>`; }
  }
  const tag = (i, isHigh) => { const b = all[i], x = X(b[0]), y = isHigh ? Y(b[2]) - 4 : Y(b[3]) + 12; const right = x > (W - PR) * 0.72; return `<text x="${f(right ? x - 4 : x + 4)}" y="${f(Math.max(11, Math.min(H - PB - 2, y)))}" text-anchor="${right ? 'end' : 'start'}" fill="#f4f5f5" font-weight="600">${isHigh ? 'High' : 'Low'} ${px(isHigh ? b[2] : b[3])}</text>`; };
  g += tag(iH, true) + tag(iL, false);
  const svg = `<svg class="nd-cs" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI Variable Text,Segoe UI,Roboto,system-ui,sans-serif" font-size="${axis ? 12 : 11}" fill="#c9d1d6" role="img" aria-label="2-minute candles">${g}</svg>`;
  return { svg, n: idx.length };
}
// Chart wall: the first WALL_CAP names (board order) that really have 2-minute bars in the window.
export function wallPick(list, deskRows, cap = WALL_CAP, lo = 360, hi = RTH_HI) {
  const have = (t) => (deskRows?.[t]?.m || []).filter((b) => b[0] >= lo && b[0] < hi).length;
  const ok = (list || []).filter((r) => have(r.t) >= WALL_MIN_BARS);
  return { shown: ok.slice(0, Math.max(0, Math.min(20, cap))), withBars: ok.length, noBars: (list || []).length - ok.length };
}

// ---------- cells ----------
const tone = (v) => (!fin(v) ? '' : v > 0 ? 'up' : v < 0 ? 'dn' : '');
const nm = (title = '') => `<span class="nd-nm"${title ? ` title="${esc(title)}"` : ''}>${NM}</span>`;
function uCell(r, col, unit, d, max = 0) {
  const v = unitVal(r, col, unit, d);
  if (!fin(v)) return nm();
  if (!(max > 0)) return `<span class="${tone(v)}">${fmtUnit(v, unit)}</span>`;
  return `<span class="db ${tone(v)}"><span class="${tone(v)}">${fmtUnit(v, unit)}</span><i style="width:${(Math.min(1, Math.abs(v) / max) * 100).toFixed(0)}%"></i></span>`;
}
const colMax = (list, col, unit, D) => list.reduce((m, r) => { const v = unitVal(r, col, unit, D?.[r.t]); return fin(v) && Math.abs(v) > m ? Math.abs(v) : m; }, 0);
function pctlCell(r) {
  if (r.ca) return `<span class="nd-nm" title="A confirmed split or corporate action sits inside the window">split guard</span>`;
  const p = NS.pctOf(r);
  if (!fin(p)) return nm(r.book === 'ML' ? 'Fewer than 250 sessions of bars for a 2-year percentile' : '');
  return NS.pbar(p, '', NS.isExtreme(r));
}
export function floatCell(d) {
  const c = floatCheck(d?.flt, d?.vol, d?.so);
  if (c.state === 'missing') return { flt: nm('The feed carries no float for this name'), rot: nm() };
  const asof = d.flt_asof ? `as of ${dShort(d.flt_asof)}` : 'no as-of date';
  if (c.state === 'implausible') {
    const why = `Feed float ${fmtShares(d.flt)} (${asof}) is ${c.why || "under 1% of the session's share volume"} (${fmtShares(d.vol)} traded${fin(d.so) ? `, ${fmtShares(d.so)} outstanding` : ''}): not believable, so float and rotation are not printed.`;
    return { flt: `${nm(why)}<small>feed: ${esc(fmtShares(d.flt).replace(' shares', ''))} sh. ${esc(asof)}</small>`, rot: nm(why) };
  }
  return { flt: `${esc(fmtShares(d.flt).replace(' shares', ''))} <small class="nd-u">shares</small><small>${esc(asof)}</small>`, rot: fin(c.rot) ? `<b>${fmtRot(c.rot)}</b>` : nm('No session share volume on file') };
}
function tagCell(d) {
  const t = d?.tag;
  if (!t) return nm('No open tracked run for this name');
  const src = (t.trig || []).map((x) => (x === 'TI' ? 'Trade Ideas' : x === 'MOVER' ? 'Poller mover' : x)).join(' + ') || 'Poller';
  return `${esc(src)}<small>first flagged ${esc(dShort(t.first))}${t.status ? ` · ${esc(t.status)}` : ''}</small>`;
}
function secCell(d) {
  const f = d?.fil || [];
  const sho = d?.regsho === true ? '<span class="chip">Reg SHO list</span>' : '';
  if (!f.length) return sho || '<span class="nd-nm" title="No row for this name in the local SEC filing evidence">none on file</span>';
  return `${esc(f[0].f || 'Filing')} · ${esc(f[0].dk || '')} ${esc(dShort(f[0].d))}${f.length > 1 ? `<small>${f.length} filings on file</small>` : ''}${sho}`;
}
const chipBtn = (attr, val, label, on, title = '') => `<span role="button" tabindex="0" class="${on ? 'on' : ''}" data-nd-${attr}="${val}" aria-pressed="${on}"${title ? ` title="${esc(title)}"` : ''}>${label}</span>`;
const grp = (label, inner) => `<span class="ns-grp"><span class="ns-lbl">${label}</span><span class="seg">${inner}</span></span>`;
const sesCol = (st) => (st.ses === 'pre' ? 'pre' : st.ses === 'ah' ? 'ah' : null);
const sesName = (st) => (st.ses === 'pre' ? 'Pre' : 'AH');

// ---------- panel chrome: link mark + fold + pop-out on every panel ----------
export function panelHead(key, title, sub = '') {
  return `<header class="nd-ph"><span class="nd-lk" title="Linked panel: it follows the name you click anywhere on this tab"><i></i><b data-nd-lkt>${NM === '' ? '' : '…'}</b></span><h3>${title}</h3>${sub ? `<span class="nd-phs">${sub}</span>` : ''}<span class="nd-pt"><button type="button" data-nd-fold="${key}" aria-expanded="true">Fold</button><button type="button" data-nd-pop="${key}">Pop out</button></span></header>`;
}

// ---------- rails ----------
export function railHtml(side, split, ctx) {
  const { st, desk, D, linked } = ctx;
  const U = desk.units, sc = sesCol(st);
  const block = (book) => {
    const all = split[book][side];
    const vis = NS.sortRows(all.filter((r) => NS.passes(r, st)), st.sort, st.ses);
    const max = colMax(vis, 'x8', U, D);
    const isSc = book === 'SC';
    const head = `<thead><tr><th class="l">Name</th><th>Close</th><th>Day<small>${UNIT_LABEL[U]}</small></th>${sc ? `<th>${sesName(st)}<small>${UNIT_LABEL[U]}</small></th>` : ''}<th>8 EMA<small>${UNIT_LABEL[U]}</small></th><th>${isSc ? '1-yr' : '2-yr'} pctl</th></tr></thead>`;
    const body = vis.map((r) => `<tr data-ticker="${esc(r.t)}" class="ns-row${NS.isExtreme(r) ? ' ext' : ''}${linked === r.t ? ' nd-linked' : ''}"><th>${esc(r.t)}</th><td>${NS.fmtPx(r.p)}</td><td>${uCell(r, 'chg', U, D[r.t])}</td>${sc ? `<td>${uCell(r, sc, U, D[r.t])}</td>` : ''}<td>${uCell(r, 'x8', U, D[r.t], max)}</td><td>${pctlCell(r)}</td></tr>`).join('');
    const hid = all.length - vis.length;
    return `<div class="nd-rb nd-rb-${book}"><h4>${isSc ? 'Small cap' : 'Mid / large'} <span class="chip">${book}</span> <span class="nd-cnt">${vis.length} ${vis.length === 1 ? 'name' : 'names'}${hid ? ` · ${hid} hidden by filters` : ''} · ${isSc ? '1-year' : '2-year'} percentile</span></h4>${vis.length ? `<div class="tw"><table class="t nd-rt" data-sk-cap="${isSc ? 12 : 5}" data-sk-cap-key="nd-${side}-${book}">${head}<tbody>${body}</tbody></table></div>` : `<p class="nd-none">No ${isSc ? 'small-cap' : 'mid / large'} name ${side === 'long' ? 'below' : 'above'} its 8 EMA passes the filters.</p>`}</div>`;
  };
  return `${block('SC')}${block('ML')}`;
}

// ---------- stat block for the linked name (close-build numbers, static) ----------
export function statHtml(r, d, ctx) {
  const { desk, doc, linked } = ctx;
  const U = desk.units;
  if (!linked) return `<p class="nd-none">Click any name: the chart, this stat block, the evidence, news and SEC panels all follow it.</p>`;
  if (!r || !fin(r.p)) return `<p class="nd-none"><b>${esc(linked)}</b> is not in the ${esc(NS.dayLabel(doc.session))} close build, so there are no close-build numbers for it. The live detail panel below still follows it.</p>`;
  const fc = floatCell(d);
  const cell = (k, v, s = '') => `<div class="nd-sc"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const u = (col) => { const v = unitVal(r, col, U, d); return fin(v) ? `<span class="${tone(v)}">${fmtUnit(v, U)}</span>` : nm(); };
  const isSc = r.book !== 'ML';
  const p = NS.pctOf(r);
  const cells = [
    cell('Close', NS.fmtPx(r.p), `${esc(NS.dayLabel(doc.session))} · 2:00 PM MT`),
    cell('Day', u('chg'), `prior close ${NS.fmtPx(r.prev)}`),
    cell('Gap at the open', u('gap'), fin(d?.o) ? `open ${NS.fmtPx(d.o)}` : ''),
    cell('Pre-market', u('pre'), r.pre_t ? `last print ${esc(NS.clock12(r.pre_t))} MT` : ''),
    cell('After-hours', u('ah'), r.ah_t ? `last print ${esc(NS.clock12(r.ah_t))} MT` : ''),
    cell('From 8 EMA', u('x8'), `EMA 8 ${NS.fmtPx(r.ema8)} · ATR ${NS.fmtPx(r.atr)}`),
    cell('From VWAP', u('xv'), fin(r.vwap) ? `VWAP ${NS.fmtPx(r.vwap)}` : ''),
    `<div class="nd-sc${NS.isExtreme(r) ? ' ext' : ''}"><div class="k">${isSc ? '1-year' : '2-year'} stretch pctl</div><div class="v">${fin(p) ? NS.fmtPctl(p) : nm()}</div><div class="s">${NS.sessOf(r) != null ? `${NS.sessOf(r)} sessions` : ''}</div></div>`,
    cell('$ volume', fin(r.dvol) ? NS.fmtUsd(r.dvol) : nm(), `close × volume${fin(d?.vol) ? ' · ' + esc(fmtShares(d.vol)) : ''}`), // RC2 fix #17: say how it is built
    cell('Float', fc.flt),
    cell('Float rotation', fc.rot, 'share volume ÷ float'),
    cell('Market cap', fin(d?.cap) ? fmtUsdBig(d.cap) : nm(), capBucket(d?.cap) ? `${capBucket(d.cap)} cap` : ''),
  ];
  return `<div class="nd-stat">${cells.join('')}</div>`;
}

// ---------- sections: Small cap (first-class) and Mid / large ----------
function sectionRows(book, split, ctx) {
  const { st, desk, D } = ctx;
  let all = split[book].all;
  if (book === 'ML' && desk.mlcap !== 'all') all = all.filter((r) => capBucket(D[r.t]?.cap) === desk.mlcap);
  const sided = desk.side === 'both' ? all : all.filter((r) => sideOf(r) === desk.side);
  const vis = NS.sortRows(sided.filter((r) => NS.passes(r, st)), st.sort, st.ses);
  return { all, sided, vis };
}
export function sectionTableHtml(book, vis, ctx) {
  const { st, desk, D, linked } = ctx;
  const U = desk.units, L = UNIT_LABEL[U], isSc = book === 'SC';
  const m8 = colMax(vis, 'x8', U, D), mv = colMax(vis, 'xv', U, D);
  const th = `<thead><tr><th class="l">Name</th><th>Close</th><th>Day<small>${L}</small></th><th class="opt">Gap<small>${L}</small></th><th class="opt">Pre<small>${L} · not ranked</small></th><th class="opt">AH<small>${L} · not ranked</small></th><th>8 EMA<small>${L}</small></th><th>VWAP<small>${L}</small></th><th class="opt">Z 20D<small>σ</small></th><th>${isSc ? '1-yr pctl' : '2-yr pctl'}<small>own stretch</small></th><th>$ vol</th><th class="opt">Share vol</th>${isSc ? '<th>Float<small>feed, as-of</small></th><th>Rotation<small>vol ÷ float</small></th><th>Short % float<small>days to cover · SI + float dates</small></th>' : '<th>Market cap</th>'}<th class="l opt">Found by</th><th class="opt">Poller last seen</th>${isSc ? '<th class="l">SEC / dilution<small>local evidence</small></th>' : ''}</tr></thead>`;
  const body = vis.map((r) => {
    const d = D[r.t] || null;
    if (r.live_only || !fin(r.p)) return `<tr data-ticker="${esc(r.t)}" class="ns-row${linked === r.t ? ' nd-linked' : ''}"><th>${esc(r.t)}</th><td colspan="${isSc ? 17 : 14}" class="l">${r.live_only ? 'In the live in-play book, not in the last close build' : 'No bar for this session on file'} · not ranked</td></tr>`;
    const fc = isSc ? floatCell(d) : null;
    const state = [r.status ? r.status.charAt(0) + r.status.slice(1).toLowerCase() : '', r.dlab && r.dlab !== 'D—' ? r.dlab : ''].filter(Boolean).join(' · ');
    return `<tr data-ticker="${esc(r.t)}" class="ns-row${NS.isExtreme(r) ? ' ext' : ''}${linked === r.t ? ' nd-linked' : ''}"><th>${esc(r.t)}${state ? `<small>${esc(state)}</small>` : ''}</th><td>${NS.fmtPx(r.p)}</td><td>${uCell(r, 'chg', U, d)}</td><td class="opt">${uCell(r, 'gap', U, d)}</td><td class="opt">${uCell(r, 'pre', U, d)}</td><td class="opt">${uCell(r, 'ah', U, d)}</td><td>${uCell(r, 'x8', U, d, m8)}</td><td>${uCell(r, 'xv', U, d, mv)}</td><td class="opt">${fin(r.z20) ? `<span class="${tone(r.z20)}">${NS.fmtZ(r.z20)}</span>` : nm()}</td><td>${pctlCell(r)}</td><td>${fin(r.dvol) ? NS.fmtUsd(r.dvol) : nm()}</td><td class="opt">${fin(d?.vol) ? esc(fmtShares(d.vol).replace(' shares', '')) + ' <small class="nd-u">sh.</small>' : nm()}</td>${isSc ? `<td>${fc.flt}</td><td>${fc.rot}</td><td>${SF.siCell(ctx.si?.get(r.t), !!ctx.si)}</td>` : `<td>${fin(d?.cap) ? `${fmtUsdBig(d.cap)}<small>${capBucket(d.cap)} cap</small>` : nm()}</td>`}<td class="l opt">${tagCell(d)}</td><td class="opt">${d?.seen ? esc(mtStamp(d.seen)) : nm()}</td>${isSc ? `<td class="l">${secCell(d)}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="tw"><table class="t nd-st" data-sk-cap="12" data-sk-cap-key="nd-sec-${book}">${th}<tbody>${body}</tbody></table></div>`;
}
export function wallHtml(book, vis, ctx) {
  const { desk, D, linked, doc } = ctx;
  const U = desk.units;
  const pick = wallPick(vis, D, book === 'SC' ? WALL_CAP : 8);
  if (!pick.shown.length) return `<p class="nd-none">No name here has 2-minute bars on file for ${esc(NS.dayLabel(doc.session))}.</p>`;
  const cards = pick.shown.map((r) => {
    const d = D[r.t]; const c = candleSvg(d.m, { w: 460, h: 232 });
    const v8 = unitVal(r, 'x8', U, d), vc = unitVal(r, 'chg', U, d), p = NS.pctOf(r);
    return `<div class="nd-wc${NS.isExtreme(r) ? ' ext' : ''}${linked === r.t ? ' nd-linked' : ''}" data-ticker="${esc(r.t)}" role="button" tabindex="0"><div class="nd-wh"><b>${esc(r.t)}</b><span>${NS.fmtPx(r.p)}</span><span class="${tone(vc)}">${fmtUnit(vc, U)}</span><span class="nd-wr">8 EMA <span class="${tone(v8)}">${fmtUnit(v8, U)}</span> · pctl ${fin(p) ? NS.fmtPctl(p) : NM}</span></div>${c.svg}</div>`;
  }).join('');
  return `<p class="sub nd-wsub">${pick.shown.length} of ${vis.length} drawn in board order (cap ${book === 'SC' ? WALL_CAP : 8})${pick.noBars ? ` · ${pick.noBars} with under ${WALL_MIN_BARS} two-minute bars left out (still in the table)` : ''} · 2-minute candles, 6:00 AM to 2:00 PM MT, ${esc(NS.dayLabel(doc.session))} · pre-market shaded lighter · EMA 8 orange · BB 20,2 purple · VWAP blue · volume below</p><div class="nd-wall">${cards}</div>`;
}
export function heatTilesHtml(vis, ctx, W, H) {
  const { desk, D } = ctx; const U = desk.units;
  const list = vis.filter((r) => fin(r.p));
  const tot = list.reduce((s, r) => s + (fin(r.dvol) ? r.dvol : 0), 0);
  const items = list.map((r) => ({ v: Math.max(fin(r.dvol) ? r.dvol : 0, tot * 0.012, 1), r }));
  let html = '';
  for (const q of NS.squarify(items, 0, 0, W, H)) {
    const r = q.r, p = NS.pctOf(r);
    const fs = Math.max(10, Math.min(24, Math.sqrt(q.w * q.h) / 4.4, (q.w - 6) / (r.t.length * 0.62)));
    const l2 = `${fin(p) ? NS.fmtPctl(p) : NM} · ${fmtUnit(unitVal(r, 'x8', U, D[r.t]), U)}`;
    const l3 = `day ${fmtUnit(unitVal(r, 'chg', U, D[r.t]), U)}`;
    html += `<div class="ns-ht${NS.isExtreme(r) ? ' ns-hot' : ''}" data-ticker="${esc(r.t)}" title="${esc(`${r.t} · pctl ${fin(p) ? NS.fmtPctl(p) : NM} · 8 EMA ${fmtUnit(unitVal(r, 'x8', U, D[r.t]), U)} · ${NS.fmtUsd(r.dvol)} $vol`)}" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px;background:${NS.pctColor(p)}">${q.w > 22 ? `<b style="font-size:${fs.toFixed(1)}px">${esc(r.t)}</b>` : ''}${q.h > fs + 22 && q.w > l2.length * 6.6 + 8 ? `<i>${l2}</i>` : ''}${q.h > fs + 40 && q.w > l3.length * 6.6 + 8 ? `<i>${l3}</i>` : ''}</div>`;
  }
  return html;
}
export function sectionHtml(book, split, ctx) {
  const { st, desk, doc, pop } = ctx;
  const isSc = book === 'SC';
  const { all, sided, vis } = sectionRows(book, split, ctx);
  const open = panelOpen(desk, book);
  const nLong = all.filter((r) => sideOf(r) === 'long').length, nShort = all.filter((r) => sideOf(r) === 'short').length;
  const title = isSc ? 'Small caps <span class="chip">SC</span> · under $2B · their own book' : 'Mid / large <span class="chip">ML</span> · $2B and over';
  const basis = isSc ? 'ranked on each name\'s own 1-year percentile of 8 EMA stretch (252 sessions)' : 'ranked on each name\'s own 2-year percentile of 8 EMA stretch (504 sessions)';
  const sub = `${all.length} ${isSc ? 'small-cap' : 'mid / large'} names in play of ${esc(doc.md_n)} polled · ${nLong} below the 8 EMA (long side) · ${nShort} above (short side) · ${vis.length} shown${sided.length - vis.length ? ` · ${sided.length - vis.length} hidden by the price / $vol filter` : ''} · ${basis} · gold = ≤ 5% or ≥ 95%`;
  const side = grp('Side', `${chipBtn('side', 'both', 'Both', desk.side === 'both')}${chipBtn('side', 'long', 'Long side', desk.side === 'long', 'Stretched below the 8 EMA')}${chipBtn('side', 'short', 'Short side', desk.side === 'short', 'Stretched above the 8 EMA')}`);
  const cap = isSc ? '' : grp('Cap', `${chipBtn('mlcap', 'all', 'All', desk.mlcap === 'all')}${chipBtn('mlcap', 'mid', 'Mid $2B to $10B', desk.mlcap === 'mid')}${chipBtn('mlcap', 'large', 'Large over $10B', desk.mlcap === 'large')}`);
  let inner;
  if (!vis.length) inner = `<p class="nd-none">No ${isSc ? 'small-cap' : 'mid / large'} name passes the filters.</p>`;
  else if (st.view === 'wall') inner = wallHtml(book, vis, ctx);
  else if (st.view === 'heat') inner = `<p class="sub nd-wsub">colour = own stretch percentile (green above the 50th, red below) · size = $ volume · gold outline = ≤ 5% or ≥ 95%</p><div class="ns-heat nd-heat" data-nd-heat="${book}" style="height:${isSc ? 430 : 190}px"></div>`;
  else inner = sectionTableHtml(book, vis, ctx);
  return `<section class="panel nd-panel nd-sec nd-sec-${book}${open ? '' : ' nd-folded'}${pop === book ? ' nd-pop' : ''}" data-nd-panel="${book}">${panelHead(book, title)}<div class="nd-pb"><p class="sub">${sub}</p><div class="ns-ctrl nd-secctl">${side}${cap}</div>${inner}</div></section>`;
}

// ---------- spec gaps: short interest (D1) + analyst ratings (D7) for the linked name ----------
export function refHtml(t, si = SI, rt = RT) {
  const T = String(t || '').toUpperCase();
  return `<div class="nd-ref">${SF.siDetail(SF.siIndex(si).get(T) || null, si)}${SF.ratingsDetail(SF.ratingsIndex(rt).get(T) || null, rt)}</div>`;
}
function paintHalts() { const h = $('ndHalts'); if (h && haltsLoaded) h.innerHTML = SF.haltTapeHtml(HALTS, { all: haltsAll }); }

// ---------- desk bar ----------
export function barHtml(ctx) {
  const { st, desk, linked, follow } = ctx;
  const lay = grp('Layout', Object.entries(LAYOUTS).map(([k, L]) => chipBtn('layout', k, L.label, desk.layout === k, `${L.label}: session pill ${L.ses === 'pre' ? 'Pre' : 'AH'}, sort ${L.sort === 'ses' ? 'by that session\'s move' : 'by percentile extreme'}, its own open panels. Remembered.`)).join(''));
  const units = grp('Units', UNITS.map((u) => chipBtn('units', u, UNIT_LABEL[u], desk.units === u, 'Every move and stretch column on this tab')).join(''));
  return `<div class="ns-ctrl nd-bar">${lay}${units}${NS.ctrlGroupsHtml(st, ['ses', 'px', 'dv', 'sort'], { rc2: true })}<span class="nd-link"><i></i>Linked: <b>${linked ? esc(linked) : 'no name yet'}</b>${linked ? ` · ${follow} panels follow` : ''}</span></div>`;
}

// =====================================================================================================================
// boot (browser only)
// =====================================================================================================================
const hasDom = typeof document !== 'undefined';
let desk = hasDom ? null : defaultDesk(0);
let userClicked = false; // set by the first click on a name; until then the desk links the default close-build name
let SI = null, SIm = null, RT = null, HALTS = null, haltsAll = false, haltsLoaded = false; // spec gaps D1 / D7 / D4
let D = {}, deskDoc = null, deskErr = null, linked = null, pop = null, lastPaint = null, staticFor = null, lastLive = null;
const $ = (id) => document.getElementById(id);
const store = () => { try { return window.localStorage; } catch { return null; } };
const panelEl = (key) => document.querySelector(`[data-nd-panel="${key}"]`);
const rowOf = (t) => (lastPaint?.rows || []).find((r) => r.t === t) || null;
const ctxNow = () => ({ si: SIm, st: lastPaint.st, doc: lastPaint.doc, desk, D, linked, pop, follow: document.querySelectorAll('#view-now [data-nd-panel]').length });

function build() {
  const brief = $('nowBriefing'), sel = $('selectedStockPanel'), chart = brief?.querySelector('.now-chart');
  if (!brief || !sel || !chart) return false;
  document.body.classList.add('nd-on');
  brief.classList.add('nd-on');
  const halts = document.createElement('div'); halts.id = 'ndHalts'; halts.className = 'sk nd-halts'; brief.parentNode.insertBefore(halts, brief);
  const bar = document.createElement('div'); bar.id = 'ndBar'; bar.className = 'sk'; brief.parentNode.insertBefore(bar, brief);
  const mk = (id, key, title, sub = '') => { const s = document.createElement('section'); s.id = id; s.className = 'sk nd-panel'; s.dataset.ndPanel = key; s.innerHTML = `${panelHead(key, title, sub)}<div class="nd-pb"></div>`; return s; };
  const long = mk('ndLong', 'long', 'Long side', 'stretched below the 8 EMA'), short = mk('ndShort', 'short', 'Short side', 'stretched above the 8 EMA');
  const stat = mk('ndStat', 'stat', 'Stat block', 'close build');
  chart.classList.add('nd-panel'); chart.dataset.ndPanel = 'chart';
  chart.insertAdjacentHTML('afterbegin', panelHead('chart', 'Chart'));
  brief.insertBefore(long, chart); brief.appendChild(short); brief.appendChild(stat);
  // linked panels row: live detail, stretch evidence, news / context, SEC / dilution
  const row = document.createElement('div'); row.id = 'ndPanels';
  const live = mk('ndLive', 'live', 'Live detail', 'live board row'), evid = mk('ndEvid', 'evid', 'Stretch evidence', 'triplet + sessions'), news = mk('ndNews', 'news', 'News / context'), sec = mk('ndSec', 'sec', 'SEC / dilution evidence', 'small caps');
  row.append(live, evid, news, sec);
  brief.insertAdjacentElement('afterend', row);
  live.querySelector('.nd-pb').appendChild(sel);
  for (const pn of [live, news, sec]) pn.querySelector('.nd-pb').insertAdjacentHTML('afterbegin', '<p class="nd-none nd-livemsg" hidden></p>');
  const nw = $('detailNewsSection'), sp = $('detailSupplySection');
  if (nw) { news.querySelector('.nd-pb').appendChild(nw); keepOpen(nw); news.querySelector('.nd-pb').insertAdjacentHTML('beforeend', '<p class="nd-none nd-newsnone">No headline on the page for this name. Headlines come from the live board (news_cache).</p>'); }
  if (sp) { sec.querySelector('.nd-pb').appendChild(sp); keepOpen(sp); sec.querySelector('.nd-pb').insertAdjacentHTML('beforeend', '<p class="nd-none nd-secnone">Filing evidence is kept for small caps only, and it loads with the live board row.</p><div id="ndSecLocal"></div>'); }
  return true;
}
// the two <details> blocks become panel bodies: the panel's own Fold button replaces their summary
function keepOpen(det) {
  det.open = true;
  new MutationObserver(() => { if (!det.open) det.open = true; }).observe(det, { attributes: true, attributeFilter: ['open'] });
}

function applyFolds() {
  for (const key of PANELS) {
    const el = panelEl(key); if (!el) continue;
    const open = panelOpen(desk, key);
    el.classList.toggle('nd-folded', !open);
    const b = el.querySelector('[data-nd-fold]'); if (b) { b.textContent = open ? 'Fold' : 'Open'; b.setAttribute('aria-expanded', String(open)); }
    const p = el.querySelector('[data-nd-pop]'); if (p) p.textContent = pop === key ? 'Close' : 'Pop out';
    el.classList.toggle('nd-pop', pop === key);
  }
  $('nowBriefing')?.classList.toggle('nd-chart-folded', !panelOpen(desk, 'chart'));
  document.body.classList.toggle('nd-popping', !!pop);
}
function markLinked() {
  document.querySelectorAll('#view-now .nd-linked').forEach((n) => n.classList.remove('nd-linked'));
  if (linked) document.querySelectorAll(`#view-now tr[data-ticker="${CSS.escape(linked)}"], #view-now .nd-wc[data-ticker="${CSS.escape(linked)}"], #view-now .ns-ht[data-ticker="${CSS.escape(linked)}"]`).forEach((n) => n.classList.add('nd-linked'));
  document.querySelectorAll('#view-now [data-nd-lkt]').forEach((n) => { n.textContent = linked || 'no name'; });
}
function paintLinkedPanels() {
  if (!lastPaint) return;
  const ctx = ctxNow(), r = rowOf(linked), d = linked ? D[linked] : null;
  const stat = $('ndStat')?.querySelector('.nd-pb'); if (stat) stat.innerHTML = statHtml(r, d, ctx) + (linked ? refHtml(linked) : '');
  // RC2 fix #15: the stat block's panel head names the close it is built on, so it is not read as today's live numbers.
  const sph = $('ndStat')?.querySelector('.nd-phs'); const sDoc = lastPaint?.doc || deskDoc; if (sph && sDoc?.session) { const t = `${NS.dayLabel(sDoc.session)} close build`; if (sph.textContent !== t) sph.textContent = t; }
  const ev = $('ndEvid')?.querySelector('.nd-pb');
  if (ev) ev.innerHTML = r ? NS.cardHtml({ ...r, session: lastPaint.doc.session }) : `<p class="nd-none">${linked ? `<b>${esc(linked)}</b> is not in the ${esc(NS.dayLabel(lastPaint.doc.session))} close build: no stretch triplet for it.` : 'Click a name to see its stretch triplet and session split.'}</p>`;
  const loc = $('ndSecLocal');
  if (loc) { const f = d?.fil || []; loc.innerHTML = linked && r?.book !== 'ML' ? `<p class="sub">Local filing evidence in the close build for <b>${esc(linked)}</b>: ${f.length ? f.map((x) => `${esc(x.f || 'Filing')} (${esc(x.dk)} ${esc(dShort(x.d))})`).join(' · ') : 'none on file'}${d?.regsho === true ? ' · on the Reg SHO threshold list' : ''}.</p>` : ''; }
  const bar = $('ndBar'); if (bar) bar.innerHTML = barHtml(ctx);
  markLinked();
  if (typeof syncLive === 'function') syncLive();
}
function paintRails() {
  if (!lastPaint) return;
  const ctx = ctxNow(), split = splitDesk(lastPaint.rows);
  for (const side of ['long', 'short']) { const el = $(side === 'long' ? 'ndLong' : 'ndShort')?.querySelector('.nd-pb'); if (el) el.innerHTML = `<div class="sk-in">${railHtml(side, split, ctx)}</div>`; }
}
function paintHeat() {
  if (!lastPaint || lastPaint.st.view !== 'heat') return;
  const ctx = ctxNow(), split = splitDesk(lastPaint.rows);
  document.querySelectorAll('[data-nd-heat]').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 0) el.innerHTML = heatTilesHtml(sectionRows(el.dataset.ndHeat, split, ctx).vis, ctx, r.width, r.height); });
  markLinked();
}
function applyDefaultLink() {
  if (userClicked || linked || !lastPaint) return;
  const st = lastPaint.st;
  const t = defaultLinkPick(splitDesk(lastPaint.rows), (l) => NS.sortRows(l.filter((r) => NS.passes(r, st)), st.sort, st.ses));
  if (!t) return;
  setLinked(t);
}
// RC2 round 3: the three live-fed panels (live detail, news, SEC) always belong to the LINKED name.
// Linked name has a live board row -> show it (by default, open it the way a click does, without setting userClicked).
// No live row -> say so and show no other name's numbers; the chart falls back to the close build's 2-minute bars.
const bootAt = Date.now();
let defaultDrawn = null;
function syncLive() {
  const wrap = $('ndPanels'); if (!wrap) return;
  const L = window.__rc2Live;
  if (!linked || !L) { wrap.classList.remove('nd-nolive'); return; }
  const has = L.has(linked), ready = L.ready() || Date.now() - bootAt > 8000;
  if (has) {
    wrap.classList.remove('nd-nolive');
    if (!userClicked && liveTicker() !== linked) { L.open(linked); lastLive = liveTicker(); staticFor = null; }
  } else if (ready) {
    wrap.classList.add('nd-nolive');
    wrap.querySelectorAll('.nd-livemsg').forEach((m) => { m.hidden = false; m.innerHTML = `<b>${esc(linked)}</b> has no live board row right now. The live numbers, headlines and filings are not shown for another name.`; });
    if (!userClicked && defaultDrawn !== linked) { defaultDrawn = linked; drawStaticChart(linked); }
  }
}
function onPaint(p) {
  lastPaint = p;
  applyDefaultLink();
  paintRails(); paintLinkedPanels(); paintHeat(); applyFolds();
  if (staticFor && staticFor === linked) drawStaticChart(linked);
}
function viewHtml({ rows, st, doc }) {
  if (st.view === 'plot') return null; // the V2.20.0 stretch plot stays as it is
  lastPaint = { rows, st, doc };
  const split = splitDesk(rows), ctx = ctxNow();
  const ex = split.excluded ? `<p class="note">${split.excluded} ${split.excluded === 1 ? 'name' : 'names'} with split artefacts excluded.</p>` : '';
  const err = deskErr ? `<p class="hidden-note"><b>Desk feed did not load</b> · ${esc(deskErr)} · float, share volume, gap, discovery and the chart wall read "not measured" until it does.</p>` : '';
  return `${err}${sectionHtml('SC', split, ctx)}${sectionHtml('ML', split, ctx)}${ex}`;
}

// ---------- linking ----------
function setLinked(t) {
  const next = t && /^[A-Z][A-Z0-9.-]{0,9}$/.test(t) ? t : null;
  if (next === linked) return;
  linked = next; if (staticFor !== linked) staticFor = null;
  paintLinkedPanels();
}
const liveTicker = () => ($('detailTicker')?.textContent || '').trim().toUpperCase();
// The live chart is app.js (chart-bars call). When the live board has no row for the clicked name (or did not load),
// draw the close build's own 2-minute bars in the same chart style and say so.
function drawStaticChart(t) {
  const host = $('chartHost'), d = D[t];
  if (!host || !d?.m?.length) return false;
  const r = host.getBoundingClientRect();
  const c = candleSvg(d.m, { w: Math.max(320, Math.floor(r.width) || 900), h: Math.max(260, Math.floor(r.height) || 480), lo: 120, hi: 1080, axis: true, prev: rowOf(t)?.prev, gapMin: STATIC_GAP_MIN });
  if (!c.n) return false;
  // R37 / R38: the close build's bars draw in the board's one shared chart; the caption moves behind its "?" hover.
  const day = lastPaint?.doc?.session;
  const tvBars = day ? d.m.filter((b) => b[0] >= 120 && b[0] < 1080).map((b) => [mtMinuteToMs(day, b[0]), b[1], b[2], b[3], b[4], b[5]]) : [];
  const attr = tvBars.length ? tvcAttr(tvBars, { tf: '2m', ticker: t, ref: rowOf(t)?.prev ?? null, refName: 'the prior close', note: staticCaption(t, c.n, 480, NS.dayLabel(day)), timeframes: null }) : '';
  host.innerHTML = `<div class="nd-static">${attr ? c.svg.replace('<svg class="nd-cs"', `<svg${attr} class="nd-cs"`) : c.svg}</div>`;
  const note = $('chartNote'); if (note) note.textContent = attr ? '' : staticCaption(t, c.n, 480, NS.dayLabel(day));
  staticFor = t;
  return true;
}
function afterClick(t) {
  userClicked = true;
  setLinked(t);
  setTimeout(() => { if (linked === t && liveTicker() !== t) drawStaticChart(t); }, 700);
}

function onDeskClick(e) {
  const hm = e.target.closest('[data-sf-halts]');
  if (hm) { haltsAll = hm.dataset.sfHalts === 'all'; paintHalts(); e.stopPropagation(); return; }
  const fold = e.target.closest('[data-nd-fold]');
  if (fold) { desk = toggleFold(desk, fold.dataset.ndFold); saveDesk(store(), desk); applyFolds(); if (fold.dataset.ndFold === 'chart' && panelOpen(desk, 'chart')) redrawChart(); e.stopPropagation(); return; }
  const pp = e.target.closest('[data-nd-pop]');
  if (pp) { setPop(pop === pp.dataset.ndPop ? null : pp.dataset.ndPop); e.stopPropagation(); return; }
  const b = e.target.closest('[data-nd-layout],[data-nd-units],[data-nd-side],[data-nd-mlcap]');
  if (b) {
    const ds = b.dataset;
    if (ds.ndLayout) { const out = applyLayout(desk, ds.ndLayout); desk = out.desk; saveDesk(store(), desk); if (out.ns) NS.setState(out.ns); }
    else { if (ds.ndUnits) desk = { ...desk, units: ds.ndUnits }; else if (ds.ndSide) desk = { ...desk, side: ds.ndSide }; else if (ds.ndMlcap) desk = { ...desk, mlcap: ds.ndMlcap }; saveDesk(store(), desk); NS.setState({}); }
    e.stopPropagation(); return;
  }
  const c = e.target.closest('#ndBar [data-ns-ses],#ndBar [data-ns-px],#ndBar [data-ns-dv],#ndBar [data-ns-sort]');
  if (c) { const ds = c.dataset; NS.setState(ds.nsSes ? { ses: ds.nsSes } : ds.nsPx != null ? { px: Number(ds.nsPx) } : ds.nsDv != null ? { dv: Number(ds.nsDv) } : { sort: ds.nsSort }); e.stopPropagation(); return; }
  const t = e.target.closest('[data-ticker]');
  if (t) {
    if (liveTicker() === String(t.dataset.ticker).toUpperCase()) lastLive = liveTicker();
    afterClick(String(t.dataset.ticker).toUpperCase());
    // A mouse click scrolls to the briefing; a Space / j / k walk (a synthetic click) never does: the walk keeps the walked
    // row on screen itself (REDTEAM_POLISH #4).
    if (t.closest('#nowStretch') && !pop && e.isTrusted) $('nowBriefing')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (pop && pop !== 'chart' && t.closest('.nd-pop')) { /* stay in the popped panel; the desk behind it has retargeted */ }
  }
  // app.js's own document handler opens the live chart + detail from data-ticker
}
function redrawChart() {
  if (staticFor && staticFor === linked) { drawStaticChart(linked); return; }
  document.querySelector('#nowBriefing .chart-tabs button.active')?.click(); // app.js reloads the live chart at the new size
}
function setPop(key) {
  pop = key && panelEl(key) ? key : null;
  let bg = $('ndPopBg');
  if (!bg) { bg = document.createElement('div'); bg.id = 'ndPopBg'; bg.addEventListener('click', () => setPop(null)); document.body.appendChild(bg); }
  bg.hidden = !pop;
  if (pop && !panelOpen(desk, pop)) { desk = toggleFold(desk, pop); saveDesk(store(), desk); }
  if (pop === 'SC' || pop === 'ML') NS.setState({}); else applyFolds();
  requestAnimationFrame(() => { if (pop === 'chart' || !pop) redrawChart(); paintHeat(); });
}

export async function boot() {
  if (!hasDom || !$('view-now')) return;
  let firstVisit = false; try { firstVisit = !store()?.getItem(DESK_KEY); } catch { firstVisit = false; }
  desk = loadDesk(store());
  if (!build()) return;
  const view = $('view-now');
  view.addEventListener('click', onDeskClick);
  view.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-nd-layout],[role=button][data-nd-units],[role=button][data-nd-side],[role=button][data-nd-mlcap],#ndBar [role=button],.nd-wc,.sf-h')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) setPop(null); });
  try {
    const res = await fetch('./data/rc2-now-desk.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j?.schema !== 'rc2-now-desk/1' || !j.rows) throw new Error('unexpected schema');
    deskDoc = j; D = j.rows;
    try { window.__rc2DeskRows = D; } catch {} // RC2 fix #5: the live tile reads shares outstanding from here
  } catch (err) { deskErr = String(err.message || err); D = {}; }
  NS.attachDesk({ viewHtml, onPaint, boardGroups: ['view', 'books'] });
  Promise.all([SF.feed('si'), SF.feed('ratings'), SF.feed('halts')]).then(([a, b, c]) => { SI = a; SIm = a ? SF.siIndex(a) : null; RT = b; HALTS = c; haltsLoaded = true; paintHalts(); NS.setState({}); });
  if (firstVisit) { saveDesk(store(), desk); NS.setState(applyLayout(desk, desk.layout).ns); }
  // first visit of a layout: the board takes that layout's session pill + sort once
  const tk = $('detailTicker');
  if (tk) {
    // RC2 round 2: the live board's own auto-selected name is NOT linked until the user clicks something (the default is a close-build name)
    const follow = () => { syncLive(); const t = liveTicker(); if (!userClicked || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(t) || t === lastLive) return; lastLive = t; staticFor = null; setLinked(t); };
    new MutationObserver(follow).observe(tk, { childList: true, characterData: true, subtree: true });
    follow();
  }
  // nothing selected by the live board after a while (it did not load): link the first small-cap name and draw its close-build chart
  setInterval(syncLive, 1500);
  setTimeout(() => { if (!linked && !userClicked && lastPaint) { const s = splitDesk(lastPaint.rows); const first = NS.sortRows(s.SC.all.filter((r) => NS.passes(r, lastPaint.st)), lastPaint.st.sort, lastPaint.st.ses)[0] || s.ML.all[0]; if (first) { setLinked(first.t); drawStaticChart(first.t); } } }, 7000);
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { paintHeat(); if (staticFor && staticFor === linked) drawStaticChart(linked); }, 180); });
  // the phone's "Phone view" button floated over the bottom-right content: seat it in its own row above the tab content
  let tries = 0; const seat = () => { const b = document.querySelector('body > .ph-fullbtn'); if (b) { const rowEl = document.createElement('div'); rowEl.className = 'nd-phrow'; rowEl.appendChild(b); const main = document.querySelector('main'); main?.parentNode.insertBefore(rowEl, main); } else if (++tries < 20) setTimeout(seat, 250); };
  seat();
}
if (hasDom) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot(); }
