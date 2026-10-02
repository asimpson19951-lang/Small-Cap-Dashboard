// MR MAP (V2.16.5) — MARKET tab sub-view. A Finviz-style squarified treemap re-coloured for mean
// reversion: tile = stock, size = market cap (or 20D avg $vol), colour = how far the close sits from its
// 8EMA in ATR units (or 1D %, 5D %, vs VWAP20 %). Gold outline = the stretch sits at a 2-yr extreme
// (<= 5th or >= 95th percentile of the name's own 2-yr daily ×ATR; builds/pctl2y). Below / down = red (V2, Sep 30 2026).
// Pure read-only code: fetches only ./data/mrmap.json (built nightly by builds/mr-map/build-mrmap.mjs).
// Raw values only: no scores, no grades. Every number carries its unit.

export const COLOR_MODES = Object.freeze({
  x: { key: 'x', label: 'vs 8EMA ×ATR', short: '×ATR', unit: '×', clamp: 2.5, palette: 'stretch' },
  d1: { key: 'd1', label: '1D %', short: '1D', unit: '%', clamp: 5, palette: 'return' },
  d5: { key: 'd5', label: '5D %', short: '5D', unit: '%', clamp: 10, palette: 'return' },
  vwp: { key: 'vwp', label: 'vs VWAP20 %', short: 'vs VWAP20', unit: '%', clamp: 10, palette: 'stretch' },
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
export const DEFAULTS = Object.freeze({ color: 'x', size: 'cap', caps: 'top500' });
export const PCTL_LO = 5, PCTL_HI = 95; // gold outline: 2-yr percentile at or below / at or above
export const isExtreme = (t) => finite(t?.pc) && (t.pc <= PCTL_LO || t.pc >= PCTL_HI);
export const RAIL_MIN_DV = 5e6; // rails: 20D avg $vol >= $5M, all caps
const STORE_KEY = 'radar.v2.mrmap';
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
export const fmtRange = (lo, hi) => (!finite(lo) || !finite(hi) ? 'n/a' : `${fmtX(lo)} → ${fmtX(hi)} ATR`);
export const fmtPx = (v) => (!finite(v) ? 'n/a' : `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`);
export function fmtMode(mode, v, d = 1) { return COLOR_MODES[mode]?.unit === '×' ? fmtX(v, d) : fmtPct(v, d); }
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
    });
  }
  return out;
}

export function filterTiles(tiles, capKey) {
  const list = Array.isArray(tiles) ? tiles : [];
  if (capKey === 'u2b') return list.filter((t) => t.cap < 2e9);
  if (capKey === 'o2b') return list.filter((t) => t.cap >= 2e9);
  if (capKey === 'top500') return list.slice().sort((a, b) => b.cap - a.cap || a.t.localeCompare(b.t)).slice(0, 500);
  return list.slice();
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
  const u = clampUnit(value, mode.clamp);
  if (u == null) return 'rgb(44,46,48)';
  const target = u >= 0 ? UP : DOWN;
  const k = Math.abs(u);
  return `rgb(${BASE.map((b, i) => Math.round(b + (target[i] - b) * k)).join(',')})`;
}
export function legendStops(modeKey) {
  const mode = COLOR_MODES[modeKey] || COLOR_MODES.x;
  return [-1, -0.6, -0.2, 0, 0.2, 0.6, 1].map((f) => {
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
export function layoutMap(tiles, { W, H, sizeKey = 'cap', colorKey = 'x', zoom = null, headerH = 17 } = {}) {
  const src = zoom ? (tiles || []).filter((t) => t.sec === zoom) : (tiles || []);
  const groupOf = zoom ? (t) => t.ind || 'Industry n/a' : (t) => t.sec;
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
    const header = gh >= hh + 10 && gw >= 44;
    const ix = gx + 1, iy = gy + (header ? hh : 1), iw = gw - 2, ih = gh - (header ? hh : 1) - 1;
    outGroups.push({
      name: g.name, x: gx, y: gy, w: gw, h: gh, header, n: g.list.length,
      med: median(g.list.map((t) => t[colorKey])), medX: median(g.list.map((t) => t.x)), medD1: median(g.list.map((t) => t.d1)),
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
export function tileLabel(r, colorKey) {
  const t = r.tile;
  let fs = Math.max(9, Math.min(26, Math.sqrt(r.w * r.h) / 4.2));
  fs = Math.min(fs, (r.w - 6) / (t.t.length * CHAR_W), r.h - 4);
  if (!(fs >= 8)) return '';
  let html = `<b style="font-size:${fs.toFixed(1)}px">${esc(t.t)}</b>`;
  const second = colorKey === 'x' ? fmtPct(t.d1) : fmtX(t.x);
  const line = `${fmtMode(colorKey, t[colorKey])} · ${second}`;
  let fs2 = Math.max(9, fs * 0.55);
  fs2 = Math.min(fs2, (r.w - 6) / (line.length * CHAR_W));
  if (fs2 >= 8.5 && r.h >= fs + fs2 + 10) html += `<i style="font-size:${fs2.toFixed(1)}px">${esc(line)}</i>`;
  else {
    const one = fmtMode(colorKey, t[colorKey]);
    const fs3 = Math.min(Math.max(9, fs * 0.55), (r.w - 6) / (one.length * CHAR_W));
    if (fs3 >= 8.5 && r.h >= fs + fs3 + 8) html += `<i style="font-size:${fs3.toFixed(1)}px">${esc(one)}</i>`;
  }
  return html;
}

export function renderMapHtml(layout, { colorKey = 'x', zoom = null, hits = null } = {}) {
  const parts = [];
  for (const g of layout.groups) {
    const head = g.header
      ? `<div class="mrm-sh"${zoom ? '' : ` data-mr-sector="${esc(g.name)}" title="${esc(`Zoom into ${g.name}`)}"`}><span class="mrm-sh-name">${esc(zoom ? g.name : g.name.toUpperCase())}</span> <span class="mrm-sh-med">med ${esc(fmtMode(colorKey, g.med))} · ${esc(colorKey === 'x' ? `1D ${fmtPct(g.medD1)}` : fmtX(g.medX))}</span></div>`
      : '';
    parts.push(`<div class="mrm-sec${zoom ? ' ind' : ''}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">${head}</div>`);
  }
  layout.tiles.forEach((r, i) => {
    const t = r.tile;
    const cls = `mrm-tl${isExtreme(t) ? ' hot' : ''}${hits && hits.has(t.t) ? ' hit' : ''}`;
    parts.push(`<div class="${cls}" data-mr-i="${i}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${colorFor(t[colorKey], colorKey)}">${tileLabel(r, colorKey)}</div>`);
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
    ['vs 8EMA ×ATR', fmtX(t.x, 2), t.x > 0 ? 'up' : t.x < 0 ? 'dn' : '', isExtreme(t)],
    ['2-yr pctl', finite(t.pc) ? fmtPctl(t.pc) : `n/a (${finite(t.pn) ? t.pn : 0} sessions)`, '', isExtreme(t)],
    ['2-yr range', fmtRange(t.lo, t.hi)],
    ['vs 8EMA %', fmtPct(t.e8p, 2), t.e8p > 0 ? 'up' : t.e8p < 0 ? 'dn' : ''],
    ['1D %', fmtPct(t.d1, 2), t.d1 > 0 ? 'up' : t.d1 < 0 ? 'loss' : ''],
    ['5D %', fmtPct(t.d5, 2), t.d5 > 0 ? 'up' : t.d5 < 0 ? 'loss' : ''],
    ['VWAP20', fmtPx(t.vw)],
    ['vs VWAP20 %', fmtPct(t.vwp, 2), t.vwp > 0 ? 'up' : t.vwp < 0 ? 'dn' : ''],
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

function railHtml(title, list, side, eligible) {
  const rows = list.map((t) => `<tr${isExtreme(t) ? ' class="ext"' : ''} data-mr-t="${esc(t.t)}" tabindex="0" title="${esc(`${t.t} · ${t.name}${isExtreme(t) ? ' · 2-yr extreme' : ''}`)}">
<td class="l tk">${esc(t.t)}${t.bkt ? `<span class="mrm-badge">${esc(t.bkt)}</span>` : ''}</td>
<td class="${t.x > 0 ? 'up' : 'dn'}">${esc(fmtX(t.x))}</td>
<td class="c-pc">${esc(fmtPctl(t.pc))}</td>
<td class="c-e8p ${t.e8p > 0 ? 'up' : t.e8p < 0 ? 'dn' : ''}">${esc(fmtPct(t.e8p))}</td>
<td class="${t.d1 > 0 ? 'up' : t.d1 < 0 ? 'loss' : ''}">${esc(fmtPct(t.d1))}</td>
<td class="c-r5">${esc(finite(t.r5) ? `${t.r5.toFixed(1)}×` : 'n/a')}</td>
<td>${esc(fmtUsd(t.dv))}</td></tr>`).join('');
  return `<section class="mrm-rail ${side}"><h3>Stretched ${side === 'above' ? 'ABOVE' : 'BELOW'} 8EMA <small>all caps · 20D $vol ≥ $5M · ${eligible.toLocaleString('en-US')} names</small></h3>
<table><thead><tr><th class="l">Ticker</th><th title="(close − EMA8) ÷ ATR14">vs 8EMA ×ATR</th><th class="c-pc" title="Where today's ×ATR ranks inside this name's own 2-year daily ×ATR values">2-yr pctl</th><th class="c-e8p">vs 8EMA %</th><th>1D %</th><th class="c-r5" title="5-session high-to-low range ÷ ATR14">5D rng ×ATR</th><th>20D avg $vol</th></tr></thead>
<tbody>${rows || '<tr><td class="l" colspan="7">No names</td></tr>'}</tbody></table></section>`;
}

// ---------- mount ----------
function readStore(storage) {
  try {
    const raw = storage?.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return {
      color: COLOR_MODES[v.color] ? v.color : DEFAULTS.color,
      size: SIZE_MODES[v.size] ? v.size : DEFAULTS.size,
      caps: CAP_FILTERS[v.caps] ? v.caps : DEFAULTS.caps,
    };
  } catch { return { ...DEFAULTS }; }
}
function writeStore(storage, s) {
  try { storage?.setItem(STORE_KEY, JSON.stringify({ color: s.color, size: s.size, caps: s.caps })); } catch { /* in-session choice still works */ }
}

function mtToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export async function mountMrMap(host, { dataUrl = './data/mrmap.json', openTicker = null, fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  if (!host) return null;
  host.innerHTML = '<div class="loading-card">Loading MR MAP…</div>';
  const res = await fetchImpl(dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`MR MAP data unavailable (${res.status})`);
  const doc = await res.json();
  const all = decode(doc);
  const bySym = new Map(all.map((t) => [t.t, t]));
  const state = { ...readStore(storage), zoom: null, query: '', pinned: null, hover: null, layout: null, lastW: 0, timing: null };
  const staleDays = Math.round((Date.parse(`${mtToday()}T12:00:00Z`) - Date.parse(`${doc.asof}T12:00:00Z`)) / 864e5);

  host.innerHTML = `<div class="mrm">
<header class="mrm-head"><div><h2>MARKET · <b>MR MAP</b></h2><p>Each tile is a stock. Size = market cap or 20D avg $vol. Colour = how far the close sits from its 8EMA in ATR units (or 1D %, 5D %, vs VWAP20 %). Gold outline = the stretch is at a 2-year extreme for that stock (≤ ${PCTL_LO}th or ≥ ${PCTL_HI}th percentile of its own daily ×ATR). Below the mean = red.</p></div>
<div class="mrm-stamp">${staleDays > 4 ? `<span class="mrm-stale">STALE · ${staleDays} days old</span> ` : ''}Daily bars as of <b>${esc(doc.asof_label || doc.asof)}</b> · built ${esc(doc.built_mt || 'n/a')}<br><span data-mr-count></span></div></header>
<div class="mrm-bar" role="toolbar" aria-label="MR MAP controls">
<span class="mrm-grp"><span class="mrm-l">COLOUR</span>${Object.values(COLOR_MODES).map((m) => `<button type="button" class="mrm-chip" data-mr-color="${m.key}">${esc(m.label)}</button>`).join('')}</span>
<span class="mrm-grp"><span class="mrm-l">SIZE</span>${Object.values(SIZE_MODES).map((m) => `<button type="button" class="mrm-chip" data-mr-size="${m.key}">${esc(m.label)}</button>`).join('')}</span>
<span class="mrm-grp"><span class="mrm-l">CAPS</span>${Object.values(CAP_FILTERS).map((m) => `<button type="button" class="mrm-chip" data-mr-caps="${m.key}">${esc(m.label)}</button>`).join('')}</span>
<label class="mrm-search"><span class="mrm-l">FIND</span><input type="search" data-mr-search autocomplete="off" spellcheck="false" placeholder="Ticker" aria-label="Find a ticker on the map"></label>
<span class="mrm-grp mrm-legend-wrap"><span class="mrm-leg" data-mr-legend></span><span class="mrm-hotkey"><i></i>2-yr extreme · ≤ ${PCTL_LO}% / ≥ ${PCTL_HI}% pctl</span></span>
<span class="mrm-note" data-mr-note></span>
</div>
<div class="mrm-crumb" data-mr-crumb hidden></div>
<div class="mrm-body"><div class="mrm-mapwrap" data-mr-mapwrap><div class="mrm-map" data-mr-map></div><div class="mrm-pin" data-mr-pin hidden></div></div>
<aside class="mrm-rails" data-mr-rails></aside></div>
<p class="mrm-foot"><b>Definitions.</b> ×ATR = (close − EMA8 of daily closes) ÷ ATR14 (Wilder), a raw distance, not a score. vs VWAP20 % = close vs Σ(typical × volume) ÷ Σ volume over 20 sessions. ATR / 5D = (close − close 5 sessions earlier) ÷ ATR14 (the board's definition). 5D rng ×ATR = 5-session high-to-low range ÷ ATR14. Sector header = median of the drawn names. Red = below the mean or down, green = above or up. 2-yr pctl = mid-rank % of today's ×ATR among that name's own daily ×ATR values over the last 504 sessions (≈ 2 years; hidden under 250 sessions); gold outline = ≤ ${PCTL_LO}% or ≥ ${PCTL_HI}%.
<b>Sources.</b> ${esc(doc.sources?.bars || '')}. ${esc(doc.sources?.sectors || '')}. ${esc(doc.sources?.caps || '')}. ${esc(doc.sources?.industry || '')}. ${Number(doc.n || all.length).toLocaleString('en-US')} of ${Number(doc.universe || 0).toLocaleString('en-US')} listed names have bars on ${esc(doc.asof)} and a stored cap. Rails use every name with 20D avg $vol ≥ $5M, not only the tiles drawn. <b>Built</b> ${esc(doc.built_mt || 'n/a')}.</p>
<div class="mrm-tip" data-mr-tip hidden></div></div>`;

  const $ = (sel) => host.querySelector(sel);
  const mapEl = $('[data-mr-map]'), wrapEl = $('[data-mr-mapwrap]'), tipEl = $('[data-mr-tip]'), pinEl = $('[data-mr-pin]');
  const railsEl = $('[data-mr-rails]'), crumbEl = $('[data-mr-crumb]'), noteEl = $('[data-mr-note]'), countEl = $('[data-mr-count]');
  const legendEl = $('[data-mr-legend]'), searchEl = $('[data-mr-search]');
  const railCount = () => (host.clientWidth < 760 ? 10 : 16);

  function hitsFor(q) {
    const needle = String(q || '').trim().toUpperCase();
    if (!needle) return null;
    if (bySym.has(needle)) return new Set([needle]);
    return new Set(all.filter((t) => t.t.startsWith(needle)).slice(0, 12).map((t) => t.t));
  }

  function renderControls() {
    host.querySelectorAll('[data-mr-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mrColor === state.color)));
    host.querySelectorAll('[data-mr-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mrSize === state.size)));
    host.querySelectorAll('[data-mr-caps]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mrCaps === state.caps)));
    legendEl.innerHTML = legendStops(state.color).map((s) => `<span style="background:${s.color}">${esc(s.label)}</span>`).join('');
  }

  function render() {
    const t0 = performance.now();
    if (!host.clientWidth) return; // hidden: the ResizeObserver renders on first show
    const cs = getComputedStyle(host);
    const hostW = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); // content box
    const wide = hostW >= 1100;
    const railsW = wide ? Math.min(470, Math.max(420, Math.round(hostW * 0.25))) : 0;
    const W = Math.max(200, Math.floor(wide ? hostW - railsW - 8 : hostW));
    const H = wide ? Math.max(560, Math.min(1000, Math.round(W * 0.7))) : Math.max(360, Math.min(820, Math.round(W * 1.25)));
    const drawn = filterTiles(all, state.caps);
    const hits = hitsFor(state.query);
    const layout = layoutMap(drawn, { W, H, sizeKey: state.size, colorKey: state.color, zoom: state.zoom });
    state.layout = layout;
    state.lastW = host.clientWidth;
    host.style.setProperty('--mrm-rails-w', `${railsW}px`);
    mapEl.style.width = `${W}px`;
    mapEl.style.height = `${H}px`;
    mapEl.innerHTML = renderMapHtml(layout, { colorKey: state.color, zoom: state.zoom, hits });
    const r = rails(all, { n: railCount() });
    railsEl.innerHTML = railHtml('above', r.above, 'above', r.eligible) + railHtml('below', r.below, 'below', r.eligible);
    const hot = layout.tiles.filter((x) => isExtreme(x.tile)).length;
    const capLabel = CAP_FILTERS[state.caps].label;
    countEl.textContent = `${all.length.toLocaleString('en-US')} names with a stored cap · ${capLabel.toLowerCase()} · ${layout.tiles.length.toLocaleString('en-US')} tiles drawn`;
    let note = `${hot} of ${layout.tiles.length.toLocaleString('en-US')} drawn are at a 2-yr stretch extreme (≤ ${PCTL_LO}% / ≥ ${PCTL_HI}% pctl)`;
    if (hits && hits.size) {
      const drawnSet = new Set(layout.tiles.map((x) => x.tile.t));
      const missing = [...hits].filter((s) => !drawnSet.has(s));
      if (hits.size === 1 && missing.length === 1) note = `${missing[0]} is not drawn under ${capLabel}${state.zoom ? ` in ${state.zoom}` : ''} · <button type="button" class="mrm-link" data-mr-showall>SHOW IN ALL CAPS</button>`;
      else note = `${hits.size - missing.length} of ${hits.size} matches drawn`;
    } else if (state.query) note = `No ticker starts with “${esc(state.query.toUpperCase())}”`;
    noteEl.innerHTML = note;
    if (state.zoom) {
      const zs = drawn.filter((t) => t.sec === state.zoom);
      crumbEl.hidden = false;
      crumbEl.innerHTML = `<button type="button" class="mrm-link" data-mr-back>‹ ALL SECTORS</button><span class="mrm-crumb-cur">${esc(state.zoom.toUpperCase())}</span><span class="mrm-crumb-stats">${zs.length.toLocaleString('en-US')} names · grouped by SIC industry · med ${esc(fmtX(median(zs.map((t) => t.x))))} · 1D ${esc(fmtPct(median(zs.map((t) => t.d1))))} · 5D ${esc(fmtPct(median(zs.map((t) => t.d5))))}</span><span class="mrm-crumb-key">Esc = back</span>`;
    } else { crumbEl.hidden = true; crumbEl.innerHTML = ''; }
    renderPin();
    state.timing = { ms: Math.round((performance.now() - t0) * 10) / 10, tiles: layout.tiles.length };
    host.dataset.mrRenderMs = String(state.timing.ms);
    host.dataset.mrTiles = String(state.timing.tiles);
  }

  function renderPin() {
    const t = state.pinned ? bySym.get(state.pinned) : null;
    if (!t) { pinEl.hidden = true; pinEl.innerHTML = ''; return; }
    pinEl.hidden = false;
    pinEl.innerHTML = `<button type="button" class="mrm-pin-x" data-mr-unpin aria-label="Close">×</button>${detailHtml(t, { asof: doc.asof_label || doc.asof })}`;
  }

  function showTip(t, cx, cy) {
    if (state.hover !== t.t) { tipEl.innerHTML = detailHtml(t); state.hover = t.t; }
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let x = cx + 16, y = cy + 14;
    if (x + tw > vw - 8) x = cx - tw - 16;
    if (y + th > vh - 8) y = Math.max(8, vh - th - 8);
    tipEl.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  }
  function hideTip() { tipEl.hidden = true; state.hover = null; }

  function open(sym) {
    const t = bySym.get(sym);
    if (!t) return;
    hideTip();
    let handled = false;
    try { handled = typeof openTicker === 'function' && openTicker(sym) === true; } catch { handled = false; }
    if (!handled) { state.pinned = sym; renderPin(); }
  }

  function setState(patch) {
    Object.assign(state, patch);
    writeStore(storage, state);
    renderControls();
    render();
  }

  host.addEventListener('click', (event) => {
    const el = event.target;
    const color = el.closest('[data-mr-color]'); if (color) { setState({ color: color.dataset.mrColor }); return; }
    const size = el.closest('[data-mr-size]'); if (size) { setState({ size: size.dataset.mrSize }); return; }
    const caps = el.closest('[data-mr-caps]'); if (caps) { setState({ caps: caps.dataset.mrCaps }); return; }
    if (el.closest('[data-mr-showall]')) { setState({ caps: 'all', zoom: null }); return; }
    if (el.closest('[data-mr-back]')) { setState({ zoom: null }); return; }
    if (el.closest('[data-mr-unpin]')) { state.pinned = null; renderPin(); return; }
    const sec = el.closest('[data-mr-sector]'); if (sec) { hideTip(); setState({ zoom: sec.dataset.mrSector }); return; }
    const tile = el.closest('[data-mr-i]');
    if (tile) { const r = state.layout?.tiles[Number(tile.dataset.mrI)]; if (r) open(r.tile.t); return; }
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
    state.pinned = bySym.has(q) ? q : state.pinned && q ? null : state.pinned;
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
    // Measurement hook for the build's perf check: n renders, each timed through a forced style + layout
    // pass (offsetHeight read), so the figure covers layout math, HTML build, DOM swap and browser layout.
    bench(n = 5) {
      const out = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); render(); void mapEl.offsetHeight; void railsEl.offsetHeight; out.push(Math.round((performance.now() - t0) * 10) / 10); }
      return out;
    },
  };
}
