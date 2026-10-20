// MARKET tab (V2.18.0, Oct 7 2026). MR MAP heat map / table, THEMES MAP and 52-WK PULLBACK map, one module.
// Tile = stock (or theme member), size = 20D avg $vol (or market cap), colour = where today's stretch sits inside the stock's OWN
// 2-year history (2-YR PCTL, centred on the 50th percentile) or a raw distance (8EMA / VWAP20 ×ATR, 1D %, 5D %).
// Gold outline = the stretch sits at a 2-yr extreme (<= 5th or >= 95th percentile of the name's own 2-yr daily ×ATR; builds/pctl2y).
// Below / down = red (heat maps only, V2 Sep 30 2026). Gold is a fill / edge only, never text.
// Pure read-only code: fetches only ./data/mrmap.json (built nightly by builds/mr-map-v2/build-mrmap.mjs + add-52wk.mjs).
// Raw values only: no scores, no grades. Every number carries its unit.

import { sessionCloseMinute } from './market-calendar.mjs';

export const COLOR_MODES = Object.freeze({
  pc: { key: 'pc', label: '2-YR PCTL', short: '2Y pctl', unit: '%', clamp: 50, center: 50, unsigned: true, stops: [5, 25, 50, 75, 95], palette: 'pctl' },
  x: { key: 'x', label: 'vs 8EMA ×ATR', short: '×ATR', unit: '×', clamp: 2.5, palette: 'stretch' },
  xv: { key: 'xv', label: 'vs VWAP20 ×ATR', short: 'VWAP20 ×ATR', unit: '×', clamp: 2.5, palette: 'stretch' },
  d1: { key: 'd1', label: '1D %', short: '1D', unit: '%', clamp: 5, palette: 'return' },
  d5: { key: 'd5', label: '5D %', short: '5D', unit: '%', clamp: 10, palette: 'return' },
  vwp: { key: 'vwp', label: 'vs VWAP20 %', short: 'vs VWAP20', unit: '%', clamp: 10, palette: 'stretch' },
  // 52-WK PULLBACK map only (values come from derived fields; see decode)
  ph: { key: 'ph', label: 'below 52-wk high ×ATR', short: 'vs 52-wk high', unit: '×', clamp: 12, palette: 'pullback' },
  rl: { key: 'rl', label: 'above 52-wk low ×ATR', short: 'vs 52-wk low', unit: '×', clamp: 12, palette: 'pullback' },
});
export const COLOR_CHIPS = Object.freeze(['pc', 'x', 'xv', 'd1', 'd5']); // chips on the MR MAP bar (vwp stays decodable for saved choices)
export const LIQ_FILTERS = Object.freeze({ 0: { key: '0', min: 0, label: 'ALL' }, 5e6: { key: '5000000', min: 5e6, label: '≥ $5M' }, 25e6: { key: '25000000', min: 25e6, label: '≥ $25M' } });
export const SUBS = Object.freeze({
  mr: { key: 'mr', label: 'MR MAP' },
  themes: { key: 'themes', label: 'THEMES MAP' },
  w52: { key: 'w52', label: '52-WK PULLBACK' },
});
export const SIZE_MODES = Object.freeze({
  cap: { key: 'cap', label: 'MKT CAP' },
  dv: { key: 'dv', label: '20D AVG $VOL' },
});
export const CAP_FILTERS = Object.freeze({
  all: { key: 'all', label: 'ALL CAPS' },
  u2b: { key: 'u2b', label: 'UNDER $2B' },
  o2b: { key: 'o2b', label: '$2B+' },
  top500: { key: 'top500', label: 'LARGEST 500' },
});
export const DEFAULTS = Object.freeze({ color: 'pc', size: 'dv', caps: 'top500', liq: 0, view: 'map', anchor: 'ph' });
export const TABLE_ROWS = 100;
export const PCTL_LO = 5, PCTL_HI = 95; // gold outline: 2-yr percentile at or below / at or above
export const isExtreme = (t) => finite(t?.pc) && (t.pc <= PCTL_LO || t.pc >= PCTL_HI);
export const RAIL_MIN_DV = 5e6; // rails: 20D avg $vol >= $5M, all caps
const STORE_KEY = 'radar.v2.mrmap2'; // V2.18.0: new key so the new defaults (2-YR PCTL, $VOL size) apply once; old key left alone
const MINUS = '−';

// ---------- formatting (every number unit-marked) ----------
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function signed(v, d, unit) {
  if (!finite(v)) return 'n/a';
  const r = Number(Math.abs(v).toFixed(d));
  if (r === 0) return `${(0).toFixed(d)}${unit}`;
  return `${v > 0 ? '+' : MINUS}${r.toFixed(d)}${unit}`;
}
export const fmtX = (v, d = 1) => signed(v, d, '×');
export const fmtPct = (v, d = 1) => signed(v, d, '%');
export function fmtUsd(v) {
  if (!finite(v)) return 'n/a';
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return `${v < 0 ? MINUS : ''}$${s}`;
}
export const fmtPctl = (v) => (!finite(v) ? 'n/a' : `${v.toFixed(1)}%`);
export const fmtSigma = (v, d = 2) => signed(v, d, 'σ');
export const tone = (v) => (!finite(v) || Number(Math.abs(v).toFixed(2)) === 0 ? '' : v > 0 ? 'up' : 'dn'); // zero / n/a never prints red
export const cmpTone = (v) => (!finite(v) || Number(Math.abs(v).toFixed(2)) === 0 ? '' : v > 0 ? 'up' : 'loss');
export const fmtRange = (lo, hi) => (!finite(lo) || !finite(hi) ? 'n/a' : `${fmtX(lo)} → ${fmtX(hi)} ATR`);
export const fmtPx = (v) => (!finite(v) ? 'n/a' : `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`);
export function fmtMode(mode, v, d = 1) {
  const m = COLOR_MODES[mode];
  if (m?.unsigned) return fmtPctl(v);
  return m?.unit === '×' ? fmtX(v, d) : fmtPct(v, d);
}
function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// ---------- data ----------
// Decode the compact snapshot (column header + row arrays) into tile objects. cap is stored in $M and
// dv in $K; both come back in $. Rows missing a ticker, a positive cap or a finite ×ATR are dropped.
export function decode(doc) {
  const cols = Array.isArray(doc?.cols) ? doc.cols : [];
  const at = Object.fromEntries(cols.map((c, i) => [c, i]));
  const sectors = doc?.sectors || [];
  const industries = doc?.industries || [];
  const buckets = doc?.buckets || ['MICRO', 'SMALL', 'MID', 'LARGE'];
  const out = [];
  for (const r of Array.isArray(doc?.rows) ? doc.rows : []) {
    const num = (k) => (finite(r[at[k]]) ? r[at[k]] : null);
    const t = String(r[at.t] ?? '').toUpperCase();
    const cap = num('cap') == null ? null : num('cap') * 1e6;
    const x = num('x');
    if (!t || !(cap > 0) || x == null) continue;
    const ii = r[at.ind];
    out.push({
      t, name: String(r[at.name] ?? ''), sec: sectors[r[at.sec]] || 'Unclassified',
      ind: finite(ii) && ii >= 0 ? industries[ii] || null : null,
      cap, bkt: buckets[r[at.bkt]] || null,
      c: num('c'), e8: num('e8'), atr: num('atr'), vw: num('vw'),
      d1: num('d1'), d5: num('d5'), x, e8p: num('e8p'), vwp: num('vwp'), a5: num('a5'), r5: num('r5'),
      dv: num('dv') == null ? null : num('dv') * 1e3,
      pc: num('pc'), lo: num('lo'), hi: num('hi'), pn: num('pn'),
      h52: num('h52'), l52: num('l52'), n52: num('n52'), z20: num('z20'),
    });
    deriveFields(out[out.length - 1]);
  }
  return out;
}

// Derived primitives (all raw, none stored): VWAP20 distance in ATR, and the 52-week pullback distances.
export function deriveFields(t) {
  t.xv = finite(t.vw) && finite(t.atr) && t.atr > 0 && finite(t.c) ? (t.c - t.vw) / t.atr : null;
  const ok = finite(t.h52) && finite(t.l52) && finite(t.atr) && t.atr > 0 && finite(t.c) && t.h52 >= t.l52;
  t.ph = ok ? (t.c - t.h52) / t.atr : null; // ≤ 0 (a close above the stored high prints as 0.0×)
  t.rl = ok ? (t.c - t.l52) / t.atr : null; // ≥ 0
  t.phpct = ok ? (t.c / t.h52 - 1) * 100 : null;
  t.rlpct = ok ? (t.c / t.l52 - 1) * 100 : null;
  t.rp = ok && t.h52 > t.l52 ? Math.max(0, Math.min(100, ((t.c - t.l52) / (t.h52 - t.l52)) * 100)) : null;
  return t;
}
// Names the builder carries a corporate-action reset for but that decode() cannot draw (stats null). Shown as a note, never silently.
export function hiddenCorpActions(doc, bySym) {
  const ca = doc?.corporateActions || {};
  return Object.entries(ca).filter(([t]) => !bySym.has(t)).map(([t, v]) => ({ t, note: String(v?.note || v?.reason || 'history resets') })).sort((a, b) => a.t.localeCompare(b.t));
}
export const hasWeek52 = (tiles) => (tiles || []).some((t) => finite(t.h52) && finite(t.l52));

// caps: ALL / UNDER $2B / $2B+ / LARGEST 500 (by cap). minDv: drop names whose 20D avg $vol is below it (0 = off).
export function filterTiles(tiles, capKey, minDv = 0) {
  let list = Array.isArray(tiles) ? tiles : [];
  if (capKey === 'u2b') list = list.filter((t) => t.cap < 2e9);
  else if (capKey === 'o2b') list = list.filter((t) => t.cap >= 2e9);
  else if (capKey === 'top500') list = list.slice().sort((a, b) => b.cap - a.cap || a.t.localeCompare(b.t)).slice(0, 500);
  else list = list.slice();
  if (minDv > 0) list = list.filter((t) => finite(t.dv) && t.dv >= minDv);
  return list;
}

// Table view: every drawn name with a 2-yr pctl, farthest from the 50th percentile first (ties: ticker).
export function tableRows(tiles, n = TABLE_ROWS) {
  const list = (tiles || []).filter((t) => finite(t.pc)).sort((a, b) => Math.abs(b.pc - 50) - Math.abs(a.pc - 50) || a.t.localeCompare(b.t));
  return { rows: list.slice(0, n), total: list.length };
}

export function mean(values) {
  const s = values.filter(finite);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}
export function median(values) {
  const s = values.filter(finite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Stretch rails: every name (all caps) with 20D avg $vol >= $5M, most stretched first.
export function rails(tiles, { minDv = RAIL_MIN_DV, n = 16 } = {}) {
  const liquid = (tiles || []).filter((t) => finite(t.dv) && t.dv >= minDv && finite(t.x));
  return {
    above: liquid.filter((t) => t.x > 0).sort((a, b) => b.x - a.x || a.t.localeCompare(b.t)).slice(0, n),
    below: liquid.filter((t) => t.x < 0).sort((a, b) => a.x - b.x || a.t.localeCompare(b.t)).slice(0, n),
    eligible: liquid.length,
    totalAbove: liquid.filter((t) => t.x > 0).length,
    totalBelow: liquid.filter((t) => t.x < 0).length,
  };
}

// ---------- colour ----------
// Clamp a value into [-1, 1] on the mode's scale; null for missing values.
export function clampUnit(value, clamp) {
  if (!finite(value) || !(clamp > 0)) return null;
  return Math.max(-1, Math.min(1, value / clamp));
}
const BASE = [38, 42, 46];
const UP = [34, 122, 86]; // green: above the mean / gains
const DOWN = [178, 44, 58]; // red: below the 8EMA / VWAP20 and losses (V2: Austin, "red for the heat map"); same ramp as the live heat maps
export function colorFor(value, modeKey) {
  const mode = COLOR_MODES[modeKey] || COLOR_MODES.x;
  const u = clampUnit(finite(value) ? value - (mode.center || 0) : value, mode.clamp);
  if (u == null) return 'rgb(44,46,48)';
  const target = u >= 0 ? UP : DOWN;
  const k = Math.abs(u);
  return `rgb(${BASE.map((b, i) => Math.round(b + (target[i] - b) * k)).join(',')})`;
}
export function legendStops(modeKey) {
  const mode = COLOR_MODES[modeKey] || COLOR_MODES.x;
  if (mode.stops) {
    return mode.stops.map((v, i) => ({ value: v, color: colorFor(v, mode.key), label: `${i === 0 ? '≤' : i === mode.stops.length - 1 ? '≥' : ''}${v}%` }));
  }
  const fr = mode.key === 'ph' ? [-1, -0.6, -0.2, 0] : mode.key === 'rl' ? [0, 0.2, 0.6, 1] : [-1, -0.6, -0.2, 0, 0.2, 0.6, 1];
  return fr.map((f) => {
    const v = f * mode.clamp;
    const label = fmtMode(mode.key, v, mode.unit === '×' ? 1 : 0);
    return { value: v, color: colorFor(v, mode.key), label: f === -1 ? `≤${label}` : f === 1 ? `≥${label}` : label };
  });
}

// ---------- layout ----------
// Squarified treemap (Bruls, Huizing, van Wijk). items: [{ v > 0, ... }]. Returns [{ ...item, x, y, w, h }]
// covering the rectangle exactly (areas proportional to v). Non-positive or non-finite v is skipped.
export function squarify(items, x0, y0, w, h) {
  const out = [];
  if (!(w > 0) || !(h > 0)) return out;
  const list = (items || []).filter((it) => finite(it.v) && it.v > 0).sort((a, b) => b.v - a.v);
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
      const cw = last ? W : rowSum / H;
      let yy = Y;
      for (let k = i; k < j; k++) { const a = list[k].v * scale; const hh = k === j - 1 ? Y + H - yy : a / cw; out.push({ ...list[k], x: X, y: yy, w: cw, h: hh }); yy += hh; }
      X += cw; W -= cw;
    } else {
      const ch = last ? H : rowSum / W;
      let xx = X;
      for (let k = i; k < j; k++) { const a = list[k].v * scale; const ww = k === j - 1 ? X + W - xx : a / ch; out.push({ ...list[k], x: xx, y: Y, w: ww, h: ch }); xx += ww; }
      Y += ch; H -= ch;
    }
    i = j;
  }
  return out;
}

// Two-level map: groups (sectors, or industries when zoomed into one sector) then tiles.
// Each group gets a header strip when it has room; tiles fill the rest. Returns integer-pixel rects.
// subOf(t) names the sub-group when zoomed (default SIC industry; null = one group, no header: THEMES zoom).
export function layoutMap(tiles, { W, H, sizeKey = 'cap', colorKey = 'x', zoom = null, headerH = 17, subOf = (t) => t.ind || 'Industry n/a' } = {}) {
  const src = zoom ? (tiles || []).filter((t) => t.sec === zoom) : (tiles || []);
  const groupOf = zoom ? (t) => subOf(t) ?? '' : (t) => t.sec;
  const size = (t) => (finite(t[sizeKey]) && t[sizeKey] > 0 ? t[sizeKey] : 0);
  const byGroup = new Map();
  for (const t of src) {
    if (!(size(t) > 0)) continue;
    const g = groupOf(t);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(t);
  }
  const groups = [...byGroup].map(([name, list]) => ({ name, list, v: list.reduce((s, t) => s + size(t), 0) }));
  const groupRects = squarify(groups, 0, 0, W, H);
  const outGroups = [];
  const outTiles = [];
  const hh = zoom ? Math.min(headerH, 15) : headerH;
  for (const g of groupRects) {
    const gx = Math.round(g.x), gy = Math.round(g.y), gw = Math.round(g.x + g.w) - gx, gh = Math.round(g.y + g.h) - gy;
    const header = !!g.name && gh >= hh + 10 && gw >= 44;
    const ix = gx + 1, iy = gy + (header ? hh : 1), iw = gw - 2, ih = gh - (header ? hh : 1) - 1;
    outGroups.push({
      name: g.name, x: gx, y: gy, w: gw, h: gh, header, n: g.list.length,
      med: median(g.list.map((t) => tileValue(t, colorKey))), medX: median(g.list.map((t) => t.x)), medD1: median(g.list.map((t) => t.d1)),
      meanD1: mean(g.list.map((t) => t.d1)), nD1: g.list.filter((t) => finite(t.d1)).length, medPc: median(g.list.map((t) => t.pc ?? t.p1)),
    });
    if (iw <= 0 || ih <= 0) continue;
    for (const r of squarify(g.list.map((t) => ({ v: size(t), tile: t })), ix, iy, iw, ih)) {
      const x = Math.round(r.x), y = Math.round(r.y);
      const w = Math.round(r.x + r.w) - x, h = Math.round(r.y + r.h) - y;
      if (w <= 0 || h <= 0) continue; // too small to draw at this size
      outTiles.push({ tile: r.tile, x, y, w, h });
    }
  }
  return { groups: outGroups, tiles: outTiles, W, H, count: src.length };
}

// Label fitting: ticker font scales with tile area, shrinks to fit width, hides below 8px.
const CHAR_W = 0.62; // monospace advance / font-size
// [headline value, second value] printed on a tile. THEMES tiles outside the 2-yr set carry their 1-yr pctl, marked 1Y.
export function tileLines(t, colorKey) {
  const val = colorKey === 'pc' && t.oneYr ? `${fmtPctl(t.p1)} 1Y` : fmtMode(colorKey, colorKey === 'pc' && t.oneYr ? t.p1 : t[colorKey]);
  if (colorKey === 'x') return [val, fmtPct(t.d1)];
  if (colorKey === 'ph') return [val, fmtPct(t.phpct)];
  if (colorKey === 'rl') return [val, fmtPct(t.rlpct)];
  return [val, finite(t.x) ? fmtX(t.x) : fmtPct(t.d1)];
}
export const tileValue = (t, colorKey) => (colorKey === 'pc' && t.oneYr ? t.p1 : t[colorKey]);
export function tileLabel(r, colorKey) {
  const t = r.tile;
  let fs = Math.max(9, Math.min(26, Math.sqrt(r.w * r.h) / 4.2));
  fs = Math.min(fs, (r.w - 6) / (t.t.length * CHAR_W), r.h - 4);
  if (!(fs >= 8)) return '';
  let html = `<b style="font-size:${fs.toFixed(1)}px">${esc(t.t)}</b>`;
  const [firstVal, second] = tileLines(t, colorKey);
  const line = `${firstVal} · ${second}`;
  let fs2 = Math.max(9, fs * 0.55);
  fs2 = Math.min(fs2, (r.w - 6) / (line.length * CHAR_W));
  if (fs2 >= 8.5 && r.h >= fs + fs2 + 10) html += `<i style="font-size:${fs2.toFixed(1)}px">${esc(line)}</i>`;
  else {
    const one = firstVal;
    const fs3 = Math.min(Math.max(9, fs * 0.55), (r.w - 6) / (one.length * CHAR_W));
    if (fs3 >= 8.5 && r.h >= fs + fs3 + 8) html += `<i style="font-size:${fs3.toFixed(1)}px">${esc(one)}</i>`;
  }
  return html;
}

export function renderMapHtml(layout, { colorKey = 'x', zoom = null, hits = null, headFn = null, ghost = false, gold = true } = {}) {
  const parts = [];
  for (const g of layout.groups) {
    const head = g.header
      ? `<div class="mrm-sh"${zoom ? '' : ` data-mr-sector="${esc(g.name)}" title="${esc(`Zoom into ${g.name}`)}"`}><span class="mrm-sh-name">${esc(zoom ? g.name : g.name.toUpperCase())}</span> <span class="mrm-sh-med">${esc(headFn ? headFn(g) : `med ${fmtMode(colorKey, g.med)} · ${colorKey === 'x' ? `1D ${fmtPct(g.medD1)}` : fmtX(g.medX)}`)}</span></div>`
      : '';
    parts.push(`<div class="mrm-sec${zoom ? ' ind' : ''}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">${head}</div>`);
  }
  layout.tiles.forEach((r, i) => {
    const t = r.tile;
    const cls = `mrm-tl${gold && !ghost && isExtreme(t) ? ' hot' : ''}${ghost ? ' ghost' : ''}${hits && hits.has(t.t) ? ' hit' : ''}`;
    parts.push(`<div class="${cls}" data-mr-i="${i}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${ghost ? '' : `;background:${colorFor(tileValue(t, colorKey), colorKey)}`}">${ghost ? `<b style="font-size:${Math.max(8, Math.min(14, Math.sqrt(r.w * r.h) / 4.5)).toFixed(1)}px">${esc(r.w > 30 && r.h > 14 ? t.t : '')}</b>` : tileLabel(r, colorKey)}</div>`);
  });
  return parts.join('');
}

// ---------- detail markup (tooltip + pinned card) ----------
export function detailRows(t) {
  return [
    ['Close', fmtPx(t.c)],
    ['EMA8', fmtPx(t.e8)],
    ['ATR14 (Wilder)', fmtPx(t.atr)],
    // 2-yr extreme = light gold fill on the row (INTERNALS style), never gold text (too close to the orange 8EMA, Oct 1)
    ['vs 8EMA ×ATR', fmtX(t.x, 2), tone(t.x), isExtreme(t)],
    ['2-yr pctl', finite(t.pc) ? fmtPctl(t.pc) : `n/a (${finite(t.pn) ? t.pn : 0} sessions)`, '', isExtreme(t)],
    ...(t.oneYr ? [['1-yr pctl · % vs 8EMA (not ×ATR)', fmtPctl(t.p1)], ['1D % basis', 'live board poll, not RTH close']] : []),
    ['2-yr range', fmtRange(t.lo, t.hi)],
    ['vs VWAP20 ×ATR', fmtX(t.xv, 2), tone(t.xv)],
    ['z vs 20-day', fmtSigma(t.z20), tone(t.z20)],
    ...(finite(t.h52) ? [
      ['52-wk high / low', `${fmtPx(t.h52)} / ${fmtPx(t.l52)}`],
      ['vs 52-wk high', `${fmtX(t.ph, 2)} · ${fmtPct(t.phpct, 1)}`, tone(t.ph)],
      ['vs 52-wk low', `${fmtX(t.rl, 2)} · ${fmtPct(t.rlpct, 1)}`, tone(t.rl)],
      ['52-wk range position', fmtPctl(t.rp)],
    ] : []),
    ['vs 8EMA %', fmtPct(t.e8p, 2), tone(t.e8p)],
    ['1D %', fmtPct(t.d1, 2), cmpTone(t.d1)],
    ['5D %', fmtPct(t.d5, 2), cmpTone(t.d5)],
    ['VWAP20', fmtPx(t.vw)],
    ['vs VWAP20 %', fmtPct(t.vwp, 2), tone(t.vwp)],
    ['ATR / 5D', fmtX(t.a5, 2)],
    ['5D range ×ATR', `${finite(t.r5) ? t.r5.toFixed(2) : 'n/a'}×`],
    ['20D avg $vol', fmtUsd(t.dv)],
    ['Market cap', fmtUsd(t.cap)],
  ];
}
export function detailHtml(t, { asof = '' } = {}) {
  const rows = detailRows(t).map(([k, v, c, ext]) => `<div class="mrm-kv${ext ? ' ext' : ''}"><span>${esc(k)}</span><b class="${c || ''}">${esc(v)}</b></div>`).join('');
  return `<div class="mrm-dt-head"><b>${esc(t.t)}</b>${t.bkt ? `<span class="mrm-badge">${esc(t.bkt)}</span>` : ''}<span class="mrm-dt-name">${esc(t.name)}</span></div>
<div class="mrm-dt-sub">${esc(t.sec)} · ${esc(t.ind || 'industry n/a')}</div>
<div class="mrm-kvs">${rows}</div>${asof ? `<div class="mrm-dt-foot">Daily bars · ${esc(asof)}</div>` : ''}`;
}

// ---------- THEMES MAP data ----------
// themes: [{ name, stage, members: [{ t, chg, p1, dv, c, e8p, name }] }] (adapter in app.js reads the board's own theme rows + market_data).
// R3000 members use their mrmap tile (2-yr pctl, RTH-close 1D, ×ATR). Others fall back to the board's 1-yr pctl, marked 1Y, and never take a gold outline.
export function buildThemeTiles(themes, bySym) {
  const tiles = [];
  const meta = [];
  const stats = { themes: 0, members: 0, twoYr: 0, oneYr: 0, noPctl: 0, noVol: 0 };
  for (const th of Array.isArray(themes) ? themes : []) {
    if (!th?.name) continue;
    stats.themes++;
    let drawn = 0;
    const seen = new Set();
    for (const m of Array.isArray(th.members) ? th.members : []) {
      const t = String(m?.t || '').toUpperCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      stats.members++;
      const base = bySym?.get?.(t) || null;
      const p1 = finite(m.p1) ? m.p1 : null;
      let tile;
      if (base) tile = { ...base, sec: th.name, ind: null, p1, oneYr: !finite(base.pc) && p1 != null };
      else tile = deriveFields({ t, name: String(m.name || ''), sec: th.name, ind: null, cap: null, bkt: null, c: finite(m.c) ? m.c : null, d1: finite(m.chg) ? m.chg : null, d5: null, x: null, e8p: finite(m.e8p) ? m.e8p : null, dv: finite(m.dv) ? m.dv : null, pc: null, p1, oneYr: p1 != null });
      if (finite(tile.pc)) stats.twoYr++; else if (tile.oneYr) stats.oneYr++; else stats.noPctl++;
      if (!(finite(tile.dv) && tile.dv > 0)) { stats.noVol++; continue; }
      tiles.push(tile);
      drawn++;
    }
    meta.push({ name: th.name, stage: String(th.stage || ''), n: seen.size, drawn });
  }
  return { tiles, meta, stats };
}
export function themeHead(stageOf) {
  return (g) => `${stageOf.get(g.name) ? `${stageOf.get(g.name)} · ` : ''}med ${fmtPctl(g.medPc)} · 1D ${fmtPct(g.meanD1)}`;
}

// ---------- tables, rails, phone ----------
export function pbarHtml(p) {
  if (!finite(p)) return '<span class="na">n/a</span>';
  const c = p >= 50 ? 'up' : 'dn';
  return `<span class="mrm-pbar"><s><em></em><i class="${c}" style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></s><span class="${c}">${fmtPctl(p)}</span></span>`;
}
export function d4Html(v, clamp, fmt) {
  if (!finite(v)) return '<span class="na">n/a</span>';
  return `<span class="mrm-d4 ${tone(v)}">${esc(fmt(v))}<s><i class="${v >= 0 ? 'u' : 'd'}" style="width:${(Math.min(1, Math.abs(v) / clamp) * 50).toFixed(1)}%"></i></s></span>`;
}

function railHtml(side, list, total, eligible) {
  const rows = list.map((t) => `<tr${isExtreme(t) ? ' class="ext"' : ''} data-mr-t="${esc(t.t)}" tabindex="0" title="${esc(`${t.t} · ${t.name}${isExtreme(t) ? ' · 2-yr extreme' : ''}`)}">
<td class="l tk">${esc(t.t)}${t.bkt ? `<span class="mrm-badge">${esc(t.bkt)}</span>` : ''}</td>
<td class="${tone(t.x)}">${esc(fmtX(t.x))}</td>
<td class="c-pc">${pbarHtml(t.pc)}</td>
<td class="c-xv ${tone(t.xv)}">${esc(fmtX(t.xv))}</td>
<td class="${cmpTone(t.d1)}">${esc(fmtPct(t.d1))}</td>
<td>${esc(fmtUsd(t.dv))}</td></tr>`).join('');
  return `<section class="mrm-rail ${side}"><h3>Stretched ${side === 'above' ? 'ABOVE' : 'BELOW'} 8EMA <small>top ${list.length} of ${total.toLocaleString('en-US')} names ${side} · filter: all caps, 20D $vol ≥ $5M = ${eligible.toLocaleString('en-US')} names</small></h3>
<table><thead><tr><th class="l">Ticker</th><th title="(close − EMA8) ÷ ATR14">8Ema ×ATR</th><th class="c-pc" title="Where today's 8EMA ×ATR ranks inside this name's own 2-year daily values">2-yr pctl</th><th class="c-xv" title="(close − VWAP20) ÷ ATR14">Vwap20 ×ATR</th><th>1D %</th><th>20D $vol</th></tr></thead>
<tbody>${rows || '<tr><td class="l" colspan="6">No names</td></tr>'}</tbody></table></section>`;
}

export function tableHtml(tiles, { n = TABLE_ROWS } = {}) {
  const { rows, total } = tableRows(tiles, n);
  const body = rows.map((t) => `<tr${isExtreme(t) ? ' class="ext"' : ''} data-mr-t="${esc(t.t)}" tabindex="0">
<td class="l tk">${esc(t.t)}${t.bkt ? `<span class="mrm-badge">${esc(t.bkt)}</span>` : ''}</td><td class="l nm">${esc(t.name)}</td><td class="l nm">${esc(t.sec)}</td>
<td>${esc(fmtPx(t.c))}</td><td>${d4Html(t.x, 4, (v) => fmtX(v, 2))}</td><td>${d4Html(t.xv, 4, (v) => fmtX(v, 2))}</td><td>${esc(fmtSigma(t.z20))}</td><td>${pbarHtml(t.pc)}</td>
<td>${esc(fmtRange(t.lo, t.hi))}</td><td class="${cmpTone(t.d1)}">${esc(fmtPct(t.d1))}</td><td class="${cmpTone(t.d5)}">${esc(fmtPct(t.d5))}</td><td>${esc(fmtUsd(t.dv))}</td><td>${esc(fmtUsd(t.cap))}</td></tr>`).join('');
  return `<div class="mrm-ph">All drawn names · sorted by distance from the 50th PCTL <span>showing ${rows.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} · same filters as the map</span></div>
<div class="mrm-tscroll"><table class="mrm-table"><thead><tr><th class="l">Ticker</th><th class="l">Name</th><th class="l">Sector</th><th>Close</th><th>8Ema ×ATR</th><th>Vwap20 ×ATR</th><th title="(close − mean of last 20 closes) ÷ population sd">z 20D</th><th>2-yr pctl</th><th>2-yr ×ATR range</th><th>1D %</th><th>5D %</th><th>20D $vol</th><th>Mkt cap</th></tr></thead><tbody>${body || '<tr><td class="l" colspan="13">No names</td></tr>'}</tbody></table></div>`;
}

// Phone glance (≤ 759 px): group strip coloured by the group's median value, then the most stretched names as cards.
export function groupStrip(tiles, colorKey, { key = (t) => t.sec } = {}) {
  const by = new Map();
  for (const t of tiles) { const g = key(t); if (!g) continue; if (!by.has(g)) by.set(g, []); by.get(g).push(t); }
  return [...by].map(([name, list]) => ({ name, n: list.length, med: median(list.map((t) => tileValue(t, colorKey))), medX: median(list.map((t) => t.x)), ext: list.filter(isExtreme).length }))
    .sort((a, b) => (b.med ?? -Infinity) - (a.med ?? -Infinity));
}
export function phoneHtml({ tiles, colorKey, railsData, asof }) {
  const strip = groupStrip(tiles, colorKey).map((g) => `<div style="background:${colorFor(g.med, colorKey)}">${esc(g.name)}<span>${esc(fmtMode(colorKey, g.med))}${finite(g.medX) ? ` · ${esc(fmtX(g.medX))}` : ''} · ${g.ext} extreme of ${g.n}</span></div>`).join('');
  const card = (t) => `<div class="mrm-pr${isExtreme(t) ? ' ext' : ''}" data-mr-t="${esc(t.t)}" tabindex="0"><b>${esc(t.t)}</b><span class="x ${tone(t.x)}">${esc(fmtX(t.x))}</span>${pbarHtml(t.pc)}<span class="d">${esc(fmtPct(t.d1))} 1D<br>${esc(fmtUsd(t.dv))}</span></div>`;
  return `<div class="mrm-ph1">GROUPS · MEDIAN ${esc(COLOR_MODES[colorKey]?.label || colorKey)}<small>${esc(asof)} · groups as drawn on the map</small></div><div class="mrm-strip">${strip || '<div>No groups</div>'}</div>
<div class="mrm-ph1">Stretched above 8ema<small>8EMA ×ATR · 2-yr pctl · 1D · 20D $vol · names with 20D $vol ≥ $5M</small></div>${railsData.above.slice(0, 8).map(card).join('')}
<div class="mrm-ph1">Stretched below 8ema</div>${railsData.below.slice(0, 8).map(card).join('')}`;
}

// ---------- mount ----------
// V2.18.0 key migration: when the new key is absent, carry caps / liq / view / anchor over from the old key; colour and size reset to the new defaults.
export function readStore(storage) {
  try {
    const raw = storage?.getItem(STORE_KEY);
    let v = {};
    if (raw) v = JSON.parse(raw);
    else { const old = storage?.getItem(OLD_STORE_KEY); if (old) { const o = JSON.parse(old); v = { caps: o.caps, liq: o.liq, view: o.view, anchor: o.anchor }; } }
    return {
      color: COLOR_CHIPS.includes(v.color) ? v.color : DEFAULTS.color,
      size: SIZE_MODES[v.size] ? v.size : DEFAULTS.size,
      caps: CAP_FILTERS[v.caps] ? v.caps : DEFAULTS.caps,
      liq: LIQ_FILTERS[v.liq] ? Number(v.liq) : DEFAULTS.liq,
      view: v.view === 'table' ? 'table' : 'map',
      anchor: v.anchor === 'rl' ? 'rl' : 'ph',
    };
  } catch { return { ...DEFAULTS }; }
}
function writeStore(storage, s) {
  try { storage?.setItem(STORE_KEY, JSON.stringify({ color: s.color, size: s.size, caps: s.caps, liq: s.liq, view: s.view, anchor: s.anchor })); } catch { /* in-session choice still works */ }
}

function mtToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// "Tue Oct 6 · 14:00 MT close" from a YYYY-MM-DD session date (the close is 14:00 MT / 16:00 ET every regular session).
export function sessionLabel(day) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'n/a';
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const etMin = sessionCloseMinute(day); // ET minutes from the NYSE calendar (half-days close 13:00 ET)
  if (etMin == null) return `${f} · no regular session`;
  const mt = etMin - 120; // MT = ET - 2 h
  return `${f} · ${String(Math.floor(mt / 60)).padStart(2, '0')}:${String(mt % 60).padStart(2, '0')} MT close${mt < 14 * 60 ? ' (early close)' : ''}`;
}

export const OLD_STORE_KEY = 'radar.v2.mrmap';
const SUB_TEXT = {
  mr: ['MR MAP', "Each tile is a stock. Size = 20D avg $vol (or market cap). Colour = where today's stretch sits inside the stock's OWN 2-year history (2-YR PCTL, centred on the 50th percentile: green = stretched above its own norm, red = below), or the raw distance from its 8EMA / VWAP20 in ATR units, or 1D / 5D %. Gold outline = 2-yr extreme (≤ 5th or ≥ 95th percentile). Click a sector header to zoom."],
  themes: ['THEMES MAP', "Each block is a board theme, each tile a member. Size = 20D avg $vol. Colour = the member's 2-yr stretch percentile (1-yr percentile where the name is outside the 2-yr set, marked 1Y, never gold). Header = theme stage · median percentile · equal-weight mean 1D %. MIXED SOURCES: Russell 3000 members use the last RTH close and the 2-yr xATR percentile; other members use the live board poll (intraday change_pct while the market is open) and a 1Y percentile of their % distance from the 8EMA (not xATR). Click a theme header to zoom."],
  w52: ['52-WK PULLBACK', "Finviz-style 52-week map in ATR units. Colour = how far the close sits below the 52-week high (or above the 52-week low) in ATR14 units; the tile also shows the % distance. Size = 20D avg $vol. Hover for the 52-week high, low and range position. Click a sector header to zoom."],
};

export async function mountMrMap(host, { dataUrl = './data/mrmap.json', openTicker = null, fetchImpl = globalThis.fetch, storage = globalThis.localStorage, themes = null, sub = 'mr' } = {}) {
  if (!host) return null;
  host.innerHTML = '<div class="loading-card">Loading MARKET…</div>';
  const res = await fetchImpl(dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`MR MAP data unavailable (${res.status})`);
  const doc = await res.json();
  const all = decode(doc);
  const bySym = new Map(all.map((t) => [t.t, t]));
  const has52 = hasWeek52(all);
  const caHidden = hiddenCorpActions(doc, bySym);
  const state = { ...readStore(storage), sub: SUBS[sub] ? sub : 'mr', zoom: null, query: '', pinned: null, hover: null, layout: null, lastW: 0, timing: null, themeData: null };
  const staleDays = Math.round((Date.parse(`${mtToday()}T12:00:00Z`) - Date.parse(`${doc.asof}T12:00:00Z`)) / 864e5);

  host.innerHTML = `<div class="mrm">
<header class="mrm-head"><div><h2 data-mr-title></h2><p data-mr-desc></p></div><div class="mrm-fresh" data-mr-fresh></div></header>
<div class="mrm-bar" role="toolbar" aria-label="MARKET controls"><span class="mrm-ctl" data-mr-ctl></span>
<label class="mrm-search"><span class="mrm-l">Find</span><input type="search" data-mr-search autocomplete="off" spellcheck="false" placeholder="Ticker" aria-label="Find a ticker on the map"></label>
<span class="mrm-grp mrm-legend-wrap"><span class="mrm-leg" data-mr-legend></span><span class="mrm-hotkey" data-mr-hotkey><i></i>2-yr extreme · ≤ ${PCTL_LO}% / ≥ ${PCTL_HI}% pctl</span></span>
<span class="mrm-note" data-mr-note></span>
</div>
<div class="mrm-crumb" data-mr-crumb hidden></div>
<div class="mrm-body"><div class="mrm-mapwrap" data-mr-mapwrap><div class="mrm-map" data-mr-map></div><div class="mrm-tablewrap" data-mr-table hidden></div><div class="mrm-pin" data-mr-pin hidden></div></div>
<aside class="mrm-rails" data-mr-rails></aside></div>
<section class="mrm-phone" data-mr-phone></section>
<p class="mrm-foot"><b>Definitions.</b> 2-yr pctl = mid-rank % of today's 8EMA ×ATR among that name's own daily ×ATR values over the last 504 sessions (≈ 2 years; n/a under 250 sessions). 8EMA ×ATR = (close − EMA8 of daily closes) ÷ ATR14 (Wilder), a raw distance, not a score. VWAP20 ×ATR = (close − VWAP20) ÷ ATR14, VWAP20 = Σ(typical × volume) ÷ Σ volume over 20 sessions. z 20D = (close − mean of the last 20 closes) ÷ the population sd of those closes. 52-wk high / low = highest daily high / lowest daily low over 252 sessions (n/a under 200 sessions or across a split-shaped jump). Colour in 2-YR PCTL mode is centred on the 50th percentile: green above, red below. Gold outline / row fill = ≤ ${PCTL_LO}% or ≥ ${PCTL_HI}%. Raw values, no scores.
<span class="mrm-src"><b>Sources.</b> ${esc(doc.sources?.bars || '')}. ${esc(doc.sources?.pctl2y || '')}. ${esc(doc.sources?.sectors || '')}. ${esc(doc.sources?.caps || '')}. ${esc(doc.sources?.industry || '')}. ${Number(doc.n || all.length).toLocaleString('en-US')} of ${Number(doc.universe || 0).toLocaleString('en-US')} listed names have bars on ${esc(doc.asof)} and a stored cap. Rails use every name with 20D avg $vol ≥ $5M, not only the tiles drawn. THEMES MAP: the board's theme engine rows plus market_data for members outside the Russell 3000. <b>Built</b> ${esc(doc.built_mt || 'n/a')}.</span></p>
<div class="mrm-tip" data-mr-tip hidden></div></div>`;

  const $ = (sel) => host.querySelector(sel);
  const mapEl = $('[data-mr-map]'), tableEl = $('[data-mr-table]'), tipEl = $('[data-mr-tip]'), pinEl = $('[data-mr-pin]');
  const railsEl = $('[data-mr-rails]'), crumbEl = $('[data-mr-crumb]'), noteEl = $('[data-mr-note]');
  const legendEl = $('[data-mr-legend]'), searchEl = $('[data-mr-search]'), ctlEl = $('[data-mr-ctl]'), hotEl = $('[data-mr-hotkey]');
  const titleEl = $('[data-mr-title]'), descEl = $('[data-mr-desc]'), freshEl = $('[data-mr-fresh]'), phoneEl = $('[data-mr-phone]');
  const railCount = () => (host.clientWidth < 760 ? 10 : 16);

  const colorKey = () => (state.sub === 'w52' ? state.anchor : state.sub === 'themes' ? (state.color === 'd1' ? 'd1' : 'pc') : state.color);
  const sizeKey = () => (state.sub === 'themes' ? 'dv' : state.size);
  function themePack() {
    let raw = [];
    try { raw = typeof themes === 'function' ? themes() || [] : []; } catch { raw = []; }
    return buildThemeTiles(raw, bySym);
  }
  function currentTiles() {
    if (state.sub === 'themes') { state.themeData = themePack(); return state.themeData.tiles; }
    return filterTiles(all, state.caps, state.liq);
  }

  function ctlHtml() {
    const chip = (attr, key, label, on) => `<button type="button" class="mrm-chip" data-mr-${attr}="${esc(key)}" aria-pressed="${on}">${esc(label)}</button>`;
    const grp = (label, inner) => `<span class="mrm-grp"><span class="mrm-l">${label}</span>${inner}</span>`;
    const size = grp('SIZE', Object.values(SIZE_MODES).map((m) => chip('size', m.key, m.label, state.size === m.key)).join(''));
    const caps = grp('CAPS', Object.values(CAP_FILTERS).map((m) => chip('caps', m.key, m.label, state.caps === m.key)).join(''));
    const liq = grp('MIN $VOL', Object.values(LIQ_FILTERS).map((m) => chip('liq', m.key, m.label, String(state.liq) === m.key)).join(''));
    if (state.sub === 'themes') return grp('COLOUR', chip('color', 'pc', '2-YR PCTL', colorKey() === 'pc') + chip('color', 'd1', '1D %', colorKey() === 'd1'));
    if (state.sub === 'w52') return grp('ANCHOR', chip('anchor', 'ph', 'BELOW 52-WK HIGH', state.anchor === 'ph') + chip('anchor', 'rl', 'ABOVE 52-WK LOW', state.anchor === 'rl')) + size + caps + liq;
    return grp('VIEW', chip('view', 'map', 'HEAT MAP', state.view === 'map') + chip('view', 'table', 'TABLE', state.view === 'table'))
      + grp('COLOUR', COLOR_CHIPS.map((k) => chip('color', k, COLOR_MODES[k].label, state.color === k)).join('')) + size + caps + liq;
  }

  function renderControls() {
    ctlEl.innerHTML = ctlHtml();
    const ck = colorKey();
    legendEl.innerHTML = legendStops(ck).map((s) => `<span style="background:${s.color}">${esc(s.label)}</span>`).join('');
    hotEl.hidden = state.sub === 'w52' || ck === 'd1';
    const [ttl, desc] = SUB_TEXT[state.sub];
    titleEl.innerHTML = `MARKET · <u>${esc(ttl)}</u>`;
    descEl.textContent = desc;
    const sk = doc.skipped || {};
    const badges = [
      `<span class="bdg ${staleDays > 4 ? 'warn' : 'ok'}"><span class="k">Daily bars</span><b>${esc(sessionLabel(doc.asof))}</b>${staleDays > 4 ? `STALE · ${staleDays} days old · ` : ''}built ${esc(doc.built_mt || 'n/a')}</span>`,
      `<span class="bdg"><span class="k">Universe</span><b>${all.length.toLocaleString('en-US')} of ${Number(doc.universe || 0).toLocaleString('en-US')}</b>R3000 listed${finite(sk.no_cap) ? ` · ${sk.no_cap} no cap` : ''}${finite(sk.no_bars_on_asof) ? ` · ${sk.no_bars_on_asof} no bar` : ''}</span>`,
      `<span class="bdg"><span class="k">2-YR PCTL</span><b>504 sessions</b>${all.filter((t) => !finite(t.pc)).length} names n/a (&lt; 250 sess.)</span>`,
      `<span class="bdg warn"><span class="k">Caps</span><b>${esc(doc.cap_from || 'n/a')} → ${esc(doc.cap_to || 'n/a')}</b>snapshot dates vary by name</span>`,
    ];
    if (state.sub === 'w52') badges.push(`<span class="bdg ${has52 ? 'ok' : 'warn'}"><span class="k">52-WK</span><b>${has52 ? '252 sessions' : 'NOT IN DATA'}</b>${has52 ? `${all.filter((t) => finite(t.h52)).length.toLocaleString('en-US')} names with a range` : 'builder add-52wk.mjs has not run'}</span>`);
    if (caHidden.length) badges.push(`<span class="bdg warn" title="${esc(caHidden.map((c) => `${c.t}: ${c.note}`).join(' | '))}"><span class="k">Not shown</span><b>${esc(caHidden.map((c) => c.t).join(', '))}</b>corporate action: history resets</span>`);
    freshEl.innerHTML = badges.join('');
  }

  function renderPhone(tiles) {
    const r = rails(all, { n: 8 });
    phoneEl.innerHTML = phoneHtml({ tiles, colorKey: state.sub === 'w52' ? 'x' : colorKey(), railsData: r, asof: sessionLabel(doc.asof) });
  }

  function hitsFor(q, pool) {
    const needle = String(q || '').trim().toUpperCase();
    if (!needle) return null;
    const names = [...new Set(pool.map((t) => t.t))];
    if (names.includes(needle)) return new Set([needle]);
    return new Set(names.filter((n) => n.startsWith(needle)).slice(0, 12));
  }

  function render() {
    const t0 = performance.now();
    if (!host.clientWidth) return; // hidden: the ResizeObserver renders on first show
    const cs = getComputedStyle(host);
    const hostW = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); // content box
    const phone = hostW < 760;
    const wide = hostW >= 1100;
    const railsW = wide ? Math.min(470, Math.max(420, Math.round(hostW * 0.25))) : 0;
    const W = Math.max(200, Math.floor(wide ? hostW - railsW - 8 : hostW));
    const H = wide ? Math.max(560, Math.min(1000, Math.round(W * 0.7))) : Math.max(360, Math.min(820, Math.round(W * 1.25)));
    const drawn = currentTiles();
    const ck = colorKey();
    const hits = hitsFor(state.query, drawn);
    const ghost = state.sub === 'w52' && !has52;
    const themeHeadFn = state.sub === 'themes' ? themeHead(new Map((state.themeData?.meta || []).map((m) => [m.name, m.stage]))) : null;
    state.lastW = host.clientWidth;
    host.style.setProperty('--mrm-rails-w', `${railsW}px`);
    host.dataset.mrSub = state.sub;
    host.dataset.mrPhone = String(phone);
    const showTable = state.sub === 'mr' && state.view === 'table';
    mapEl.hidden = showTable;
    tableEl.hidden = !showTable;
    let layout = { groups: [], tiles: [], W, H, count: 0 };
    if (showTable) {
      tableEl.innerHTML = tableHtml(drawn);
    } else if (!phone) {
      layout = layoutMap(drawn, { W, H, sizeKey: sizeKey(), colorKey: ck, zoom: state.zoom, subOf: state.sub === 'themes' ? () => null : undefined });
      mapEl.style.width = `${W}px`;
      mapEl.style.height = `${H}px`;
      mapEl.innerHTML = renderMapHtml(layout, { colorKey: ck, zoom: state.zoom, hits, headFn: themeHeadFn, ghost, gold: state.sub !== 'w52' })
        + (ghost ? '<div class="mrm-needs"><h4>52-Wk pullback · not in the data file yet</h4><p>mrmap.json carries no 52-week high or low (the nightly builder has not run add-52wk.mjs). Tiles show the layout only.</p></div>' : '')
        + (state.sub === 'themes' && !layout.tiles.length ? '<div class="mrm-needs"><h4>Themes MAP · waiting for theme rows</h4><p>The board has not loaded its theme engine rows yet. Open THEMES once or wait for the next poll, then reopen this view.</p></div>' : '');
    }
    state.layout = layout;
    const r = rails(all, { n: railCount() });
    railsEl.innerHTML = railHtml('above', r.above, r.totalAbove, r.eligible) + railHtml('below', r.below, r.totalBelow, r.eligible);
    renderPhone(drawn);
    const hot = drawn.filter(isExtreme).length;
    const capLabel = CAP_FILTERS[state.caps].label;
    let note;
    if (state.sub === 'themes') {
      const st = state.themeData?.stats || {};
      note = `${st.themes || 0} themes · ${st.members || 0} members · ${st.twoYr || 0} on 2-yr xATR pctl + RTH close · ${st.oneYr || 0} on 1Y % vs 8EMA pctl + live 1D (marked 1Y) · ${st.noVol || 0} not drawn (no 20D $vol)`;
    } else if (state.sub === 'w52') {
      note = ghost ? '52-wk high/low not in the data yet · layout only' : `${drawn.filter((t) => finite(t.h52)).length.toLocaleString('en-US')} of ${drawn.length.toLocaleString('en-US')} drawn names have a 52-wk range · ${capLabel.toLowerCase()}${state.liq ? ' · $vol filter on' : ''}`;
    } else note = `${hot} of ${drawn.length.toLocaleString('en-US')} drawn names at a 2-yr stretch extreme (≤ ${PCTL_LO}% / ≥ ${PCTL_HI}% pctl) · ${capLabel.toLowerCase()} · ${state.liq ? '$vol filter on' : 'no $vol filter'}`;
    if (hits && hits.size && !showTable && !phone) {
      const drawnSet = new Set(layout.tiles.map((x) => x.tile.t));
      const missing = [...hits].filter((s) => !drawnSet.has(s));
      if (hits.size === 1 && missing.length === 1 && state.sub !== 'themes') note = `${missing[0]} is not drawn under ${capLabel}${state.zoom ? ` in ${state.zoom}` : ''} · <button type="button" class="mrm-link" data-mr-showall>Show in all caps</button>`;
      else note = `${hits.size - missing.length} of ${hits.size} matches drawn`;
    } else if (state.query && caHidden.some((c) => c.t === state.query.trim().toUpperCase())) {
      const c = caHidden.find((x) => x.t === state.query.trim().toUpperCase());
      note = `${c.t} is not shown: corporate action (${esc(c.note)})`;
    } else if (state.query && !hits?.size) note = `No ticker starts with “${esc(state.query.toUpperCase())}”`;
    noteEl.innerHTML = note;
    if (state.zoom && !showTable && !phone) {
      const zs = drawn.filter((t) => t.sec === state.zoom);
      const what = state.sub === 'themes' ? ['ALL THEMES', 'members'] : ['ALL SECTORS', 'names · grouped by SIC industry'];
      crumbEl.hidden = false;
      crumbEl.innerHTML = `<button type="button" class="mrm-link" data-mr-back>‹ ${what[0]}</button><span class="mrm-crumb-cur">${esc(state.zoom.toUpperCase())}</span><span class="mrm-crumb-stats">${zs.length.toLocaleString('en-US')} ${what[1]} · med ${esc(fmtMode(ck, median(zs.map((t) => tileValue(t, ck)))))} · 1D ${esc(fmtPct(median(zs.map((t) => t.d1))))} · 5D ${esc(fmtPct(median(zs.map((t) => t.d5))))}</span><span class="mrm-crumb-key">Esc = back</span>`;
    } else { crumbEl.hidden = true; crumbEl.innerHTML = ''; }
    renderPin();
    state.timing = { ms: Math.round((performance.now() - t0) * 10) / 10, tiles: layout.tiles.length };
    host.dataset.mrRenderMs = String(state.timing.ms);
    host.dataset.mrTiles = String(state.timing.tiles);
  }

  function renderPin() {
    const t = state.pinned;
    if (!t) { pinEl.hidden = true; pinEl.innerHTML = ''; return; }
    pinEl.hidden = false;
    pinEl.innerHTML = `<button type="button" class="mrm-pin-x" data-mr-unpin aria-label="Close">×</button>${detailHtml(t, { asof: doc.asof_label || doc.asof })}`;
  }

  function showTip(t, cx, cy) {
    const id = `${t.t}|${t.sec}`;
    if (state.hover !== id) { tipEl.innerHTML = detailHtml(t); state.hover = id; }
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let x = cx + 16, y = cy + 14;
    if (x + tw > vw - 8) x = cx - tw - 16;
    if (y + th > vh - 8) y = Math.max(8, vh - th - 8);
    tipEl.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  }
  function hideTip() { tipEl.hidden = true; state.hover = null; }

  function open(sym, tile = null) {
    const t = tile || bySym.get(sym);
    if (!t) return;
    hideTip();
    let handled = false;
    try { handled = typeof openTicker === 'function' && openTicker(sym) === true; } catch { handled = false; }
    if (!handled) { state.pinned = t; renderPin(); }
  }

  function setState(patch) {
    Object.assign(state, patch);
    writeStore(storage, state);
    renderControls();
    render();
  }
  function setSub(next) {
    if (!SUBS[next] || next === state.sub) return;
    state.sub = next; state.zoom = null; state.pinned = null; state.query = ''; searchEl.value = '';
    hideTip();
    renderControls();
    render();
  }

  host.addEventListener('click', (event) => {
    const el = event.target;
    const color = el.closest('[data-mr-color]'); if (color) { setState({ color: color.dataset.mrColor }); return; }
    const size = el.closest('[data-mr-size]'); if (size) { setState({ size: size.dataset.mrSize }); return; }
    const caps = el.closest('[data-mr-caps]'); if (caps) { setState({ caps: caps.dataset.mrCaps }); return; }
    const liq = el.closest('[data-mr-liq]'); if (liq) { setState({ liq: Number(liq.dataset.mrLiq) }); return; }
    const view = el.closest('[data-mr-view]'); if (view) { setState({ view: view.dataset.mrView }); return; }
    const anchor = el.closest('[data-mr-anchor]'); if (anchor) { setState({ anchor: anchor.dataset.mrAnchor }); return; }
    if (el.closest('[data-mr-showall]')) { setState({ caps: 'all', liq: 0, zoom: null }); return; }
    if (el.closest('[data-mr-back]')) { setState({ zoom: null }); return; }
    if (el.closest('[data-mr-unpin]')) { state.pinned = null; renderPin(); return; }
    const sec = el.closest('[data-mr-sector]'); if (sec) { hideTip(); setState({ zoom: sec.dataset.mrSector }); return; }
    const tile = el.closest('[data-mr-i]');
    if (tile) { const r = state.layout?.tiles[Number(tile.dataset.mrI)]; if (r) open(r.tile.t, r.tile); return; }
    const row = el.closest('[data-mr-t]'); if (row) { open(row.dataset.mrT); return; }
  });
  host.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('[data-mr-t]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); open(row.dataset.mrT); }
  });
  mapEl.addEventListener('mousemove', (event) => {
    const tile = event.target.closest('[data-mr-i]');
    const r = tile ? state.layout?.tiles[Number(tile.dataset.mrI)] : null;
    if (!r) { hideTip(); return; }
    showTip(r.tile, event.clientX, event.clientY);
  });
  mapEl.addEventListener('mouseleave', hideTip);
  tableEl.addEventListener('mouseover', (event) => {
    const row = event.target.closest('[data-mr-t]');
    const t = row ? bySym.get(row.dataset.mrT) : null;
    if (!t) { hideTip(); return; }
    showTip(t, event.clientX, event.clientY);
  });
  tableEl.addEventListener('mouseleave', hideTip);
  railsEl.addEventListener('mouseover', (event) => {
    const row = event.target.closest('[data-mr-t]');
    mapEl.querySelectorAll('.mrm-tl.xhl').forEach((n) => n.classList.remove('xhl'));
    if (!row || !state.layout) return;
    const i = state.layout.tiles.findIndex((r) => r.tile.t === row.dataset.mrT);
    if (i >= 0) mapEl.querySelector(`[data-mr-i="${i}"]`)?.classList.add('xhl');
  });
  railsEl.addEventListener('mouseleave', () => mapEl.querySelectorAll('.mrm-tl.xhl').forEach((n) => n.classList.remove('xhl')));
  searchEl.addEventListener('input', () => {
    state.query = searchEl.value;
    const q = state.query.trim().toUpperCase();
    state.pinned = bySym.has(q) ? bySym.get(q) : state.pinned && q ? null : state.pinned;
    if (!q) state.pinned = null;
    render();
  });
  searchEl.addEventListener('keydown', (event) => {
    event.stopPropagation(); // keep board hotkeys (1-9, R, space) out of the search box
    if (event.key === 'Enter') { const q = searchEl.value.trim().toUpperCase(); if (bySym.has(q)) open(q); }
    if (event.key === 'Escape') { searchEl.value = ''; state.query = ''; state.pinned = null; render(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !host.offsetParent) return;
    if (state.zoom) { setState({ zoom: null }); return; }
    if (state.pinned) { state.pinned = null; renderPin(); }
  });

  let frame = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (host.clientWidth && host.clientWidth !== state.lastW) render(); });
  }) : null;
  ro?.observe(host);

  renderControls();
  render();
  return {
    render,
    state,
    get timing() { return state.timing; },
    setState,
    setSub,
    // Measurement hook for the build's perf check: n renders, each timed through a forced style + layout
    // pass (offsetHeight read), so the figure covers layout math, HTML build, DOM swap and browser layout.
    bench(n = 5) {
      const out = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); render(); void mapEl.offsetHeight; void railsEl.offsetHeight; out.push(Math.round((performance.now() - t0) * 10) / 10); }
      return out;
    },
  };
}
