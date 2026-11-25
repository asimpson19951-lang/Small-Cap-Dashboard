import { tvcAttr } from './chart-core.mjs?v=V2.23.1'; // node-safe: returns '' without a DOM
// RC2 C3a shared helpers for the Regime / Internals / Market additions. Pure (no DOM) except loadJson.
// Display laws: no dim text, every number unit-marked, 12-hour MT times, candles for every price chart
// (hollow green up / solid red down, black pane, EMA 8 orange, BB 20,2 purple), non-price series as bars.

export const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = '−';
export const sgnNum = (v, d = 2) => (finite(v) == null ? null : `${v > 0 ? '+' : v < 0 ? M : ''}${Math.abs(v).toFixed(d)}`);
export const fPct = (v, d = 2) => (finite(v) == null ? 'not measured' : `${sgnNum(v, d)}%`);
export const fPp = (v, d = 1) => (finite(v) == null ? 'not measured' : `${sgnNum(v, d)} pp`);
export const fX = (v, d = 2) => (finite(v) == null ? 'not measured' : `${sgnNum(v, d)}×`);
export const fP = (v, d = 1) => (finite(v) == null ? 'not measured' : `${v.toFixed(d)}%`);
export const fUsd = (v, d = 2) => (finite(v) == null ? 'not measured' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const fInt = (v) => (finite(v) == null ? 'not measured' : Math.round(v).toLocaleString('en-US'));
export const fBig = (v, unit = '$') => {
  if (finite(v) == null) return 'not measured';
  const a = Math.abs(v), s = v < 0 ? M : '';
  const n = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0);
  return unit === '$' ? `${s}$${n}` : `${s}${n} ${unit}`;
};
export const ud = (v) => (finite(v) == null || v === 0 ? '' : v > 0 ? 'up' : 'dn');
export const isExt = (p) => finite(p) != null && (p <= 5 || p >= 95);

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' -> 'Mon Nov 23' (a session date, no time zone involved). */
export function dLabel(iso, withDay = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return 'date unknown';
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${withDay ? WD[dt.getUTCDay()] + ' ' : ''}${MO[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}
/** An instant (ISO with zone, or 'YYYY-MM-DD HH:MM MT') -> 'Mon Nov 23, 9:31 PM MT' (12-hour, America/Denver). */
export function mtTime(v) {
  if (!v) return 'time unknown';
  const mt = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?\s*MT$/.exec(String(v));
  if (mt) { const h = +mt[2]; return `${dLabel(mt[1])}, ${h % 12 || 12}:${mt[3]} ${h < 12 ? 'AM' : 'PM'} MT`; }
  const d = new Date(v); if (Number.isNaN(d.getTime())) return 'time unknown';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod} MT`;
}

// ---- indicators ----
export function ema(vals, n) { const k = 2 / (n + 1); const out = []; let e = null; vals.forEach((v, i) => { e = e == null ? v : v * k + e * (1 - k); out.push(i >= n - 1 ? e : null); }); return out; }
export function bollinger(vals, n = 20, k = 2) {
  return vals.map((_, i) => { if (i < n - 1) return null; const w = vals.slice(i - n + 1, i + 1); const m = w.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n); return [m - k * sd, m, m + k * sd]; });
}
/** Wilder ATR14 per bar ([d,o,h,l,c,v] rows). */
export function atrWilder(b, n = 14) {
  const tr = b.map((x, i) => (i === 0 ? x[2] - x[3] : Math.max(x[2] - x[3], Math.abs(x[2] - b[i - 1][4]), Math.abs(x[3] - b[i - 1][4]))));
  const out = []; let a = null;
  tr.forEach((t, i) => { if (i < n - 1) { out.push(null); return; } if (a == null) a = tr.slice(0, n).reduce((s, q) => s + q, 0) / n; else a = (a * (n - 1) + t) / n; out.push(a); });
  return out;
}
/** (close - EMA8) / ATR14 per bar: the board's stretch. */
export function stretchSeries(b) { const c = b.map((x) => x[4]); const e = ema(c, 8), a = atrWilder(b); return b.map((x, i) => (e[i] == null || !a[i] ? null : (x[4] - e[i]) / a[i])); }
/** Period return in % from the last close over n sessions. */
export function periodRet(b, n) { const c = b.at(-1)?.[4], p = b.at(-1 - n)?.[4]; return finite(c) && finite(p) && p ? ((c / p) - 1) * 100 : null; }

// ---- base-rate helpers ----
/** n per horizon: band days that have h later sessions inside the session list (no outcome yet = not counted). */
export function nPerHorizon(bandDates, sessions, horizons = [1, 5]) {
  const idx = new Map(sessions.map((d, i) => [d, i])); const last = sessions.length - 1;
  return Object.fromEntries(horizons.map((h) => [h, (bandDates || []).filter((d) => idx.has(d) && idx.get(d) + h <= last).length]));
}
/** Text for a base-rate cell: the value, or "no base rate yet" when n is 0. */
export const baseCell = (n, txt) => (n > 0 ? txt : 'no base rate yet');
/** A ratio vs its own trailing n-session average, per date: [{date, value, avg, diff, diffPct}] where avg exists. */
export function vsOwnAverage(series, n = 50) {
  const s = (series || []).filter((p) => finite(p?.value) != null);
  const out = [];
  for (let i = n - 1; i < s.length; i++) { const w = s.slice(i - n + 1, i + 1); const avg = w.reduce((a, p) => a + p.value, 0) / n; out.push({ date: s[i].date, value: s[i].value, avg, diff: s[i].value - avg, diffPct: ((s[i].value / avg) - 1) * 100 }); }
  return out;
}
/** Cap bucket from market cap in $M (board law: small < $2B, mid $2B to $10B, large > $10B). */
export const capBucket = (capM) => (finite(capM) == null ? null : capM < 2000 ? 'Small' : capM <= 10000 ? 'Mid' : 'Large');
/** Sort rows by a numeric key, nulls last. */
export const sortBy = (rows, f, desc = true) => [...rows].sort((a, b) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return desc ? y - x : x - y; });

// ---- squarified treemap ----
/** items [{v>0,...}] -> same items with {x,y,w,h} inside the rect. */
export function squarify(items, x, y, w, h) {
  const tot = items.reduce((a, it) => a + it.v, 0); if (!tot || w <= 0 || h <= 0) return [];
  const sc = (w * h) / tot; const rest = items.map((it) => ({ ...it, a: it.v * sc })).sort((p, q) => q.a - p.a);
  const out = []; let rx = x, ry = y, rw = w, rh = h;
  const worst = (row, side) => { const s = row.reduce((a, r) => a + r.a, 0); const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(rw, rh); const row = [rest.shift()];
    while (rest.length && worst([...row, rest[0]], side) <= worst(row, side)) row.push(rest.shift());
    const s = row.reduce((a, r) => a + r.a, 0);
    if (rw >= rh) { const cw = s / rh; let cy = ry; row.forEach((r) => { const ch = r.a / cw; out.push({ ...r, x: rx, y: cy, w: cw, h: ch }); cy += ch; }); rx += cw; rw -= cw; }
    else { const ch = s / rw; let cx = rx; row.forEach((r) => { const cw = r.a / ch; out.push({ ...r, x: cx, y: ry, w: cw, h: ch }); cx += cw; }); ry += ch; rh -= ch; }
  }
  return out;
}

// ---- charts ----
const T = (x, y, s, a = 'start', fill = '#e0e5e7', size = 11, extra = '') => `<text x="${x}" y="${y}" text-anchor="${a}" fill="${fill}" font-size="${size}"${extra}>${s}</text>`;
/**
 * Daily candle chart, his TradingView standard: black pane, hollow green up / solid red down, EMA 8 orange, BB 20,2 purple,
 * volume pane, High / Low tags, $ scale right and % scale left (% vs the first drawn session's prior close), last-price tag.
 * bars = [[date,o,h,l,c,v], ...] incl. warm-up; show = sessions drawn. panes = [{label, values (aligned to the drawn bars),
 * mode:'signed'|'level'|'updown', values2 (updown: down counts), fmt, gold:[idx]}].
 */
export function candleChart(bars, { w = 900, h = 460, show = 60, title = '', panes = [], volume = true, compact = false, ticker = '' } = {}) {
  const B = (bars || []).filter((b) => b && [1, 2, 3, 4].every((i) => finite(b[i]) != null));
  if (B.length < 5) return `<svg viewBox="0 0 ${w} 60" width="100%"><rect width="${w}" height="60" fill="#000"/>${T(10, 34, 'not measured: no bars')}</svg>`;
  const cl = B.map((b) => b[4]); const e8 = ema(cl, 8), bb = bollinger(cl, 20, 2);
  const s0 = Math.max(0, B.length - show); const D = B.slice(s0); const E = e8.slice(s0), BB = bb.slice(s0); const n = D.length;
  const ml = compact ? 40 : 52, mr = compact ? 50 : 62, mt = 18, fs = compact ? 10 : 11;
  const paneH = compact ? 40 : 54, volH = volume ? (compact ? 34 : 46) : 0, axH = 16;
  const priceH = h - mt - volH - panes.length * (paneH + 6) - axH - 6;
  const pw = w - ml - mr, slot = pw / n, bw = Math.max(1.2, slot * 0.62);
  const lows = D.map((b) => b[3]), highs = D.map((b) => b[2]);
  BB.forEach((q) => { if (q) { lows.push(q[0]); highs.push(q[2]); } });
  let lo = Math.min(...lows), hi = Math.max(...highs); const pad = (hi - lo) * 0.07 || 1; lo -= pad; hi += pad * 1.4;
  const Y = (v) => mt + ((hi - v) / (hi - lo)) * priceH; const X = (i) => ml + i * slot + slot / 2;
  const ref = B[s0 - 1]?.[4] ?? D[0][1];
  let s = `<rect width="${w}" height="${h}" fill="#000"/>`;
  // grid + scales: $ right, % left
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, y = Y(v).toFixed(1);
    s += `<line x1="${ml}" x2="${w - mr}" y1="${y}" y2="${y}" stroke="#1c2025"/>`;
    s += T(w - mr + 4, +y + 4, `$${v >= 100 ? v.toFixed(0) : v.toFixed(2)}`, 'start', '#e0e5e7', fs);
    s += T(ml - 4, +y + 4, `${sgnNum(((v / ref) - 1) * 100, 1)}%`, 'end', '#e0e5e7', fs);
  }
  const line = (vals, col, dash = '') => { let p = ''; vals.forEach((v, i) => { if (v == null) return; p += `${p ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; }); return p ? `<path d="${p}" fill="none" stroke="${col}" stroke-width="1.3"${dash}/>` : ''; };
  s += line(BB.map((q) => q && q[2]), '#9b7fe0') + line(BB.map((q) => q && q[0]), '#9b7fe0') + line(BB.map((q) => q && q[1]), '#9b7fe0', ' stroke-dasharray="3 3" stroke-opacity=".7"') + line(E, '#f0a03c');
  D.forEach((b, i) => {
    const up = b[4] >= b[1], col = up ? '#51c083' : '#e17272', x = X(i);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(b[2]).toFixed(1)}" y2="${Y(b[3]).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
    const y1 = Y(Math.max(b[1], b[4])), y2 = Y(Math.min(b[1], b[4]));
    s += `<rect x="${(x - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" fill="${up ? '#000' : col}" stroke="${col}" stroke-width="1"><title>${esc(dLabel(b[0]))}: O $${b[1]} H $${b[2]} L $${b[3]} C $${b[4]}</title></rect>`;
  });
  // High / Low tags
  const iH = highs.slice(0, n).indexOf(Math.max(...D.map((b) => b[2]))), iL = lows.slice(0, n).indexOf(Math.min(...D.map((b) => b[3])));
  const tag = (i, v, above) => T(Math.min(w - mr - 4, Math.max(ml + 4, X(i))).toFixed(1), (Y(v) + (above ? -5 : 13)).toFixed(1), `${above ? 'H' : 'L'} $${v.toFixed(2)}`, X(i) > w - mr - 60 ? 'end' : X(i) < ml + 60 ? 'start' : 'middle', '#e0e5e7', fs, ' font-weight="600"');
  s += tag(iH, D[iH][2], true) + tag(iL, D[iL][3], false);
  // last price tag
  const lc = D.at(-1)[4], lup = lc >= D.at(-1)[1];
  s += `<rect x="${w - mr + 1}" y="${(Y(lc) - 8).toFixed(1)}" width="${mr - 2}" height="16" fill="${lup ? '#2f7a52' : '#a54848'}"/>` + T(w - mr + 4, (Y(lc) + 4).toFixed(1), `$${lc.toFixed(2)}`, 'start', '#ffffff', fs, ' font-weight="600"');
  // R37 / REDTEAM_POLISH #7: no caption line on a chart; only the symbol is drawn, the full title is the hover (<title>).
  if (title) s += `<title>${esc(title)}</title>` + T(ml + 6, mt - 5, esc(String(title).split(' · ')[0]), 'start', '#e0e5e7', fs);
  let y0 = mt + priceH + 6;
  const barPane = (vals, { label, mode = 'signed', values2 = null, fmt = (v) => String(v), gold = [] }) => {
    const v = vals.map(finite), v2 = values2 ? values2.map(finite) : null; const ok = v.filter((q) => q != null).concat(v2 ? v2.filter((q) => q != null) : []);
    let out = `<rect x="${ml}" y="${y0}" width="${pw}" height="${paneH}" fill="#06080a"/>`;
    if (ok.length) {
      const G = new Set(gold);
      if (mode === 'updown') {
        const mx = Math.max(1, ...ok), mid = y0 + paneH / 2, sc = (paneH / 2 - 2) / mx;
        out += `<line x1="${ml}" x2="${w - mr}" y1="${mid}" y2="${mid}" stroke="#464b52"/>`;
        v.forEach((q, i) => { if (q != null && q > 0) out += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(mid - q * sc).toFixed(1)}" width="${bw.toFixed(1)}" height="${(q * sc).toFixed(1)}" fill="${G.has(i) ? '#e4b76e' : '#51c083'}"/>`; });
        v2.forEach((q, i) => { if (q != null && q > 0) out += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${mid}" width="${bw.toFixed(1)}" height="${(q * sc).toFixed(1)}" fill="${G.has(i) ? '#e4b76e' : '#e17272'}"/>`; });
        out += T(w - mr + 4, y0 + 10, `${fmt(mx)} up`, 'start', '#e0e5e7', fs) + T(w - mr + 4, y0 + paneH - 2, `${fmt(mx)} dn`, 'start', '#e0e5e7', fs);
      } else {
        const mn = Math.min(...ok), mx = Math.max(...ok);
        const lo2 = mode === 'signed' ? Math.min(0, mn) : mn - (mx - mn) * 0.15, hi2 = mode === 'signed' ? Math.max(0, mx) : mx; const r = hi2 - lo2 || 1;
        const YY = (q) => y0 + 2 + ((hi2 - q) / r) * (paneH - 4); const base = mode === 'signed' ? YY(0) : y0 + paneH;
        if (mode === 'signed' && lo2 < 0 && hi2 > 0) out += `<line x1="${ml}" x2="${w - mr}" y1="${base.toFixed(1)}" y2="${base.toFixed(1)}" stroke="#464b52"/>`;
        v.forEach((q, i) => { if (q == null) return; const y1 = YY(q), top = Math.min(base, y1), hh = Math.max(0.8, Math.abs(base - y1)); const fill = G.has(i) ? '#e4b76e' : mode === 'signed' ? (q >= 0 ? '#51c083' : '#e17272') : '#8fb4e0'; out += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${fill}"/>`; });
        out += T(w - mr + 4, y0 + 10, fmt(hi2), 'start', '#e0e5e7', fs) + T(w - mr + 4, y0 + paneH - 2, fmt(lo2), 'start', '#e0e5e7', fs);
      }
    }
    out += T(ml + 4, y0 + 11, esc(label), 'start', '#e0e5e7', fs);
    y0 += paneH + 6; return out;
  };
  if (volume) {
    const vm = Math.max(1, ...D.map((b) => b[5] || 0));
    s += `<rect x="${ml}" y="${y0}" width="${pw}" height="${volH}" fill="#06080a"/>`;
    D.forEach((b, i) => { const hh = ((b[5] || 0) / vm) * (volH - 12); s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(y0 + volH - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${b[4] >= b[1] ? 'rgba(81,192,131,.6)' : 'rgba(225,114,114,.6)'}"/>`; });
    s += T(ml + 4, y0 + 11, 'Volume', 'start', '#e0e5e7', fs) + T(w - mr + 4, y0 + 10, `${fBig(vm, 'sh')}`, 'start', '#e0e5e7', fs);
    y0 += volH + 6;
  }
  for (const p of panes) s += barPane(p.values, p);
  const ticks = compact ? [0, Math.floor(n / 2), n - 1] : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  ticks.forEach((i, k) => { s += T(X(i).toFixed(1), h - 4, esc(dLabel(D[i][0], false)), k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle', '#e0e5e7', fs); });
  // R38: a plain price chart (no breadth panes under it) is swapped in the page for the board's one shared interactive
  // chart (chart-core.mjs); charts that carry measured panes keep this static drawing so the panes stay aligned.
  const tvc = panes.length ? '' : tvcAttr(B, { tf: 'D', ticker, defaultCount: show });
  return `<svg${tvc} class="r2c" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}, daily candles, ${n} sessions">${s}</svg>`;
}

/** fetch JSON, null on failure (a missing feed prints "not measured", never a fake). */
export async function loadJson(url) { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; } }
/** Insert (once) a host element before / after an anchor; returns it. */
export function mountHost(id, anchorSel, where = 'before', cls = '') {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(id); if (el) return el;
  const a = document.querySelector(anchorSel); if (!a) return null;
  el = document.createElement('div'); el.id = id; el.className = `sk r2 ${cls}`.trim(); el.style.display = 'block';
  if (where === 'before') a.parentNode.insertBefore(el, a); else if (where === 'prepend') a.prepend(el); else a.parentNode.insertBefore(el, a.nextSibling);
  return el;
}
