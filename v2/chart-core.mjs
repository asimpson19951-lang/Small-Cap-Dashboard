// chart-core.mjs: the ONE price chart on the board (BOARD_RULES R22-R40, Nov 24 2026).
// Austin, Sep 29 2026 ("this is the standard always"): his TradingView. Austin, Nov 24 2026 (INTAKE #6):
// "all charts should have the same functionality of moving areas, up down zoom in out timeframe ect";
// (INTAKE #10): "This should only have D for daily, all other text is noise. Also there are no dates on the charts?"
//
// Two layers:
//  1. chartSvg(bars, opts) -> { svg, layout, ... }: a pure SVG string (no DOM), testable in plain node.
//     Black pane, extended hours shaded lighter, hollow green up / solid red down, EMA 8 orange, BB 20,2 purple
//     (upper + lower only), VWAP solid blue incl. extended hours, 200 MA maroon, volume pane, High / Low tags on the
//     price axis, round $ levels each with a % (vs VWAP intraday, vs prior close daily), a real MT time axis
//     (dates on daily, 12-hour times plus day breaks intraday), his fills green up-triangle / red down-triangle.
//     No caption text inside the chart: no bar counts, no age, no control hints.
//  2. attachChart(host, bars, opts): the interactive controller (drag pan, wheel zoom, price-axis drag scale,
//     time-axis drag scale, double-click / reset button, auto price scale, timeframe chips, "?" hover hint).
//     The NOW chart (app.js renderCandles) and every module chart that registers with registerChart() use it.
//
// Module charts keep returning their own static SVG string (the no-JS / node fallback); they add
// data-tvc="<id>" via registerChart(), and the hydrator below swaps that static SVG for the shared interactive chart.

export const CHART_TOKENS = Object.freeze({
  bg: '#000000',          // pane
  ext: '#141414',         // extended hours, shaded lighter
  grid: '#1b1e22',
  dayBreak: '#3a414a',
  up: '#26c16a',          // hollow body + wick
  down: '#f23645',        // solid body + wick
  volUp: '#1d6b40',
  volDown: '#80262e',
  ema8: '#ff9800',        // EMA 8 orange (X2: never gold)
  bb: '#a23bc4',          // Bollinger 20,2 purple, upper + lower only
  vwap: '#2f55d4',        // VWAP solid blue, session incl. extended hours
  sma200: '#8b1e3f',      // 200 MA dark maroon (R30)
  text: '#bec7cd',        // axis text: never darker than the board's secondary text
  textHi: '#e0e5e7',
  tag: '#1f3a8a',         // High / Low badge: navy
  tagText: '#ffffff',
  fillEdge: '#000000',
  font: 'Segoe UI Variable Text, Segoe UI, Inter, system-ui, sans-serif',
});

export const CHART_TIMEFRAMES = ['2m', '10m', '1h', 'D'];
export const TF_LABEL = { '2m': '2m', '10m': '10m', '1h': '1h', D: 'D' };
export const DELAYED_NOTE = 'Delayed 2-minute rail: evidence, not execution (DAS is execution).';
export const CONTROLS_HINT = 'Drag: pan · Wheel: zoom · Drag the price axis: scale price · Drag the time axis: scale time · A: auto price scale · Double-click or ⟲: reset';

const finite = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const escAttr = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// ---------- bars ----------
// Accepts {t|time|timestamp|datetime, o, h, l, c, v|volume} objects or [t, o, h, l, c, v] arrays.
// t: ms, seconds, ISO string or 'YYYY-MM-DD'. Bars without four finite prices are dropped. Unknown volume stays null.
export function toMs(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00Z`);
  const n = Number(s);
  if (Number.isFinite(n) && s.trim() !== '') return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : null;
}
export function normalizeBars(raw) {
  const out = [];
  for (const b of raw || []) {
    if (!b) continue;
    const arr = Array.isArray(b);
    const t = toMs(arr ? b[0] : (b.t ?? b.time ?? b.timestamp ?? b.datetime ?? b.date));
    const o = finite(arr ? b[1] : b.o), h = finite(arr ? b[2] : b.h), l = finite(arr ? b[3] : b.l), c = finite(arr ? b[4] : b.c);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    const vr = finite(arr ? b[5] : (b.v ?? b.volume));
    out.push({ t, o, h, l, c, v: vr != null && vr >= 0 ? vr : null });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
// MT minute-of-day on an ISO session date -> epoch ms (now-desk bars are [minute of day MT, o, h, l, c, v]).
export function mtMinuteToMs(dateIso, minute) {
  const base = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(base)) return null;
  const guess = base + minute * 60000 + 7 * 3600000; // MST
  const hourMt = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', hourCycle: 'h23' }).format(new Date(guess)));
  const want = Math.floor(minute / 60) % 24;
  return guess + ((want - hourMt + 36) % 24 - 12) * 3600000;
}

// ---------- clocks (MT for display, ET for the session) ----------
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const MT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parts = (fmt, ms) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
export function etSession(ms) {
  const p = parts(ET, ms);
  const m = Number(p.hour) * 60 + Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, session: m < 570 ? 'PRE' : m < 960 ? 'RTH' : 'AH' };
}
function mtParts(ms) {
  const p = parts(MT, ms);
  return { date: `${p.year}-${p.month}-${p.day}`, y: Number(p.year), mo: Number(p.month), d: Number(p.day), hour: Number(p.hour), min: Number(p.minute) };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Daily bars carry a session date: a UTC-midnight stamp is that date; anything else is read in ET.
function dailyDate(ms) {
  if (ms % 86400000 === 0) { const d = new Date(ms); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  const p = parts(ET, ms); return { y: Number(p.year), mo: Number(p.month), d: Number(p.day) };
}
export function clock12(hour, min) {
  return `${hour % 12 === 0 ? 12 : hour % 12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}
function dowOf(y, mo, d) { return DOW[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]; }

// Time-axis labels for the visible bars: [{ index, text, major }]. Daily: dates (month starts are major, a new year
// prints the year). Intraday: each new MT day is a major "Tue Nov 24" break; between breaks, round 12-hour MT times.
export function timeAxisLabels(bars, tf, plotW) {
  const n = bars.length;
  if (!n) return [];
  const slot = plotW / Math.max(1, n);
  const minGap = 74;
  const out = [];
  const place = (index, text, major) => {
    const x = index * slot;
    const prev = out.at(-1);
    if (prev && x - prev.index * slot < minGap) {
      if (major && !prev.major) out.pop(); else return;
    }
    out.push({ index, text, major });
  };
  if (tf === 'D') {
    const every = Math.max(1, Math.ceil(minGap / slot));
    let prev = null;
    bars.forEach((b, i) => {
      const d = dailyDate(b.t);
      if (prev && d.y !== prev.y) place(i, String(d.y), true);
      else if (prev && d.mo !== prev.mo) place(i, MON[d.mo - 1], true);
      else if (i % every === 0) place(i, `${MON[d.mo - 1]} ${d.d}`, false);
      prev = d;
    });
    return out;
  }
  const barMin = tf === '1h' ? 60 : tf === '10m' ? 10 : 2;
  const perPx = barMin / slot; // minutes per pixel (inside a session)
  const step = [30, 60, 120, 240, 480].find((s) => s / perPx >= minGap) || 1440;
  let prevDate = null;
  bars.forEach((b, i) => {
    const p = mtParts(b.t);
    if (p.date !== prevDate) {
      if (prevDate != null) place(i, `${dowOf(p.y, p.mo, p.d)} ${MON[p.mo - 1]} ${p.d}`, true);
      else place(i, `${MON[p.mo - 1]} ${p.d}`, true);
      prevDate = p.date;
      return;
    }
    const m = p.hour * 60 + p.min;
    if (step < 1440 && m % step < barMin) { const rm = m - (m % step); place(i, clock12(Math.floor(rm / 60), rm % 60), false); }
  });
  return out;
}

// Round $ levels for the price axis.
export function priceTicks(low, high, plotH) {
  const want = Math.max(3, Math.min(10, Math.floor(plotH / 46)));
  const raw = (high - low) / want;
  if (!(raw > 0)) return [];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((q) => q >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(low / step) * step; v <= high + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
export function priceLabel(v) {
  const a = Math.abs(v);
  const digits = a < 1 ? 4 : a < 10 ? 2 : a < 1000 ? 2 : 0;
  return `${v < 0 ? '−' : ''}$${a.toFixed(digits)}`;
}
export function pctLabel(p) {
  if (!Number.isFinite(p)) return '';
  const a = Math.abs(p);
  return `${p > 0.004 ? '+' : p < -0.004 ? '−' : ''}${a.toFixed(a < 10 ? 1 : 0)}%`;
}

// ---------- indicators (on every bar, then sliced) ----------
export function indicators(bars, tf) {
  const n = bars.length, close = bars.map((b) => b.c);
  const ema8 = new Array(n).fill(null), upper = new Array(n).fill(null), lower = new Array(n).fill(null), sma200 = new Array(n).fill(null), vwap = new Array(n).fill(null);
  const k = 2 / 9; let e = null;
  for (let i = 0; i < n; i++) { e = e == null ? close[i] : close[i] * k + e * (1 - k); ema8[i] = i >= 7 ? e : null; }
  let s20 = 0, q20 = 0, s200 = 0;
  for (let i = 0; i < n; i++) {
    s20 += close[i]; q20 += close[i] * close[i]; s200 += close[i];
    if (i >= 20) { s20 -= close[i - 20]; q20 -= close[i - 20] * close[i - 20]; }
    if (i >= 200) s200 -= close[i - 200];
    if (i >= 19) { const mu = s20 / 20; const sd = Math.sqrt(Math.max(0, q20 / 20 - mu * mu)); upper[i] = mu + 2 * sd; lower[i] = mu - 2 * sd; }
    if (i >= 199) sma200[i] = s200 / 200;
  }
  if (tf !== 'D') {
    // Session VWAP per ET date over every bar incl. pre-market and after-hours; unknown volume is excluded, never 0.
    let date = null, pv = 0, vv = 0;
    for (let i = 0; i < n; i++) {
      const d = etSession(bars[i].t).date;
      if (d !== date) { date = d; pv = 0; vv = 0; }
      const v = bars[i].v;
      if (v != null) { pv += ((bars[i].h + bars[i].l + bars[i].c) / 3) * v; vv += v; }
      vwap[i] = vv > 0 ? pv / vv : null;
    }
  }
  return { ema8, upper, lower, sma200, vwap };
}

// ---------- the pure chart ----------
// opts: { width, height, tf, view: { count, offset, autoScale, low, high }, levels: [{ y, color, label, dash }],
//         fills: [{ t, price, side: 'B'|'S' }], ticker, rightOffset }
export function chartSvg(allBars, opts = {}) {
  const tf = opts.tf || '2m';
  const full = allBars;
  const width = Math.max(240, Math.floor(opts.width || 640));
  const height = Math.max(160, Math.floor(opts.height || 320));
  const T = CHART_TOKENS;
  if (!full.length) return { svg: `<svg class="tvc" viewBox="0 0 ${width} ${height}" width="100%" height="100%"><rect width="${width}" height="${height}" fill="${T.bg}"/></svg>`, layout: null, count: 0 };
  const view = opts.view || {};
  const count = Math.max(Math.min(12, full.length), Math.min(full.length, Math.trunc(view.count || full.length)));
  const offset = Math.max(0, Math.min(full.length - count, Math.trunc(view.offset || 0)));
  const end = full.length - offset, start = Math.max(0, end - count);
  const bars = full.slice(start, end);
  const ind = opts.indicators || indicators(full, tf);
  const sl = (a) => a.slice(start, end);
  const ema8 = sl(ind.ema8), upper = sl(ind.upper), lower = sl(ind.lower), sma200 = sl(ind.sma200), vwap = sl(ind.vwap);

  const compact = height < 260;
  const top = 8, right = compact ? 92 : 112, left = 4, axisH = 20;
  const volumeH = Math.max(24, Math.round((height - top - axisH) * 0.15)), gap = 6;
  const plotW = width - left - right;
  const plotH = height - top - axisH - volumeH - gap;
  const volumeTop = top + plotH + gap;
  const bottom = height - axisH;

  // auto price scale = the visible candles only (overlays outside clip), like TradingView
  let low = view.low, high = view.high;
  if (view.autoScale !== false || low == null || high == null || !(high > low)) {
    low = Math.min(...bars.map((b) => b.l)); high = Math.max(...bars.map((b) => b.h));
    if (high === low) { high += Math.abs(high) * 0.01 || 1; low -= Math.abs(low) * 0.01 || 1; }
    const pad = (high - low) * 0.07; high += pad; low -= pad;
  }
  const y = (v) => top + ((high - v) / (high - low)) * plotH;
  const rightOffset = opts.rightOffset ?? Math.min(12, Math.round(bars.length * 0.06));
  const step = plotW / (bars.length + rightOffset);
  const bodyW = Math.max(1, step - Math.min(2, Math.max(0.75, step * 0.12)));
  const xAt = (i) => left + i * step + step / 2;
  const f = (v) => v.toFixed(2);
  let s = '';

  // extended hours shaded lighter (intraday only) + MT day breaks
  if (tf !== 'D') {
    let run = null;
    const flush = (i) => { if (run != null) { s += `<rect class="tvc-ext" x="${f(left + run * step)}" y="${top}" width="${f((i - run) * step)}" height="${bottom - top}" fill="${T.ext}"/>`; run = null; } };
    bars.forEach((b, i) => { const ext = etSession(b.t).session !== 'RTH'; if (ext && run == null) run = i; if (!ext) flush(i); });
    flush(bars.length);
  }
  const labels = timeAxisLabels(bars, tf, plotW - rightOffset * step);
  for (const lb of labels) {
    const x = xAt(lb.index);
    if (lb.major && tf !== 'D' && lb.index > 0) s += `<line class="tvc-daybreak" x1="${f(x - step / 2)}" y1="${top}" x2="${f(x - step / 2)}" y2="${bottom}" stroke="${T.dayBreak}" stroke-width="1"/>`;
    else s += `<line x1="${f(x)}" y1="${top}" x2="${f(x)}" y2="${f(top + plotH)}" stroke="${T.grid}" stroke-width="1"/>`;
  }

  // price grid: round $ levels, each with its % (vs VWAP intraday, vs prior close daily)
  const lastV = vwap.filter((v) => v != null).at(-1);
  const prevClose = tf === 'D' ? (full[end - 2]?.c ?? null) : null;
  const ref = opts.ref != null ? opts.ref : tf === 'D' ? prevClose : lastV ?? null;
  const refName = opts.refName || (opts.ref != null ? 'the reference' : tf === 'D' ? 'the prior close' : 'VWAP');
  const ticks = priceTicks(low, high, plotH);
  const axX = left + plotW + 6;
  s += `<g class="tvc-yaxis" font-size="${compact ? 10 : 11}">`;
  for (const v of ticks) {
    const gy = y(v);
    if (gy < top + 4 || gy > top + plotH - 2) continue;
    s += `<line x1="${left}" y1="${f(gy)}" x2="${left + plotW}" y2="${f(gy)}" stroke="${T.grid}" stroke-width="1"/>`;
    s += `<text class="tvc-px" x="${axX}" y="${f(gy + 4)}" fill="${T.textHi}">${priceLabel(v)}</text>`;
    if (ref) s += `<text class="tvc-pct" x="${width - 4}" y="${f(gy + 4)}" fill="${T.text}" text-anchor="end"><title>% from ${escAttr(refName)}</title>${pctLabel((v / ref - 1) * 100)}</text>`;
  }
  s += '</g>';

  // overlays (solid), clipped to the plot
  const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${f(xAt(i))} ${f(y(v))}`; pen = true; }); return d; };
  const clip = `tvcClip${++clipSeq}`;
  let g = '';
  for (const [vals, color, w, cls] of [[upper, T.bb, 1, 'chart-line-bb'], [lower, T.bb, 1, 'chart-line-bb'], [sma200, T.sma200, 1.3, 'chart-line-sma200'], [vwap, T.vwap, 1.5, 'chart-line-vwap'], [ema8, T.ema8, 1.4, 'chart-line-ema8']]) {
    const d = path(vals);
    if (d) g += `<path class="${cls}" d="${d}" fill="none" stroke="${color}" stroke-width="${w}" vector-effect="non-scaling-stroke"/>`;
  }
  // candles: hollow up, solid down
  bars.forEach((b, i) => {
    const up = b.c >= b.o, col = up ? T.up : T.down, x = xAt(i);
    const yo = y(b.o), yc = y(b.c), ry = Math.min(yo, yc), rh = Math.max(1, Math.abs(yc - yo));
    g += `<line class="chart-candle-wick" x1="${f(x)}" y1="${f(y(b.h))}" x2="${f(x)}" y2="${f(ry)}" stroke="${col}" stroke-width="1"/><line class="chart-candle-wick" x1="${f(x)}" y1="${f(ry + rh)}" x2="${f(x)}" y2="${f(y(b.l))}" stroke="${col}" stroke-width="1"/>`;
    g += up
      ? `<rect class="chart-candle-body up" x="${f(x - bodyW / 2 + 0.5)}" y="${f(ry)}" width="${f(Math.max(0.5, bodyW - 1))}" height="${f(rh)}" fill="none" stroke="${col}" stroke-width="1"/>`
      : `<rect class="chart-candle-body dn" x="${f(x - bodyW / 2)}" y="${f(ry)}" width="${f(bodyW)}" height="${f(rh)}" fill="${col}"/>`;
  });
  // his fills: green up-triangle under a buy, red down-triangle over a sell, thin black edge
  for (const fl of opts.fills || []) {
    const t = toMs(fl.t), px = finite(fl.price);
    if (t == null) continue;
    let idx = -1;
    for (let i = 0; i < bars.length; i++) if (bars[i].t <= t) idx = i; else break;
    if (idx < 0 || (full[end] && full[end].t <= t)) continue; // before the window, or after it (panned back)
    const buy = String(fl.side || '').toUpperCase().startsWith('B');
    const x = xAt(idx), b = bars[idx];
    const yy = buy ? y(px ?? b.l) + 9 : y(px ?? b.h) - 9;
    const z = Math.max(4, Math.min(7, step * 0.6));
    g += buy
      ? `<path class="tvc-fill buy" d="M${f(x)} ${f(yy - z)}L${f(x + z)} ${f(yy + z * 0.8)}L${f(x - z)} ${f(yy + z * 0.8)}Z" fill="${T.up}" stroke="${T.fillEdge}" stroke-width="0.8"/>`
      : `<path class="tvc-fill sell" d="M${f(x)} ${f(yy + z)}L${f(x + z)} ${f(yy - z * 0.8)}L${f(x - z)} ${f(yy - z * 0.8)}Z" fill="${T.down}" stroke="${T.fillEdge}" stroke-width="0.8"/>`;
  }
  s += `<defs><clipPath id="${clip}"><rect x="${left}" y="${top}" width="${plotW}" height="${plotH}"/></clipPath></defs><g clip-path="url(#${clip})">${g}</g>`;

  // levels (e.g. gamma walls): solid unless the caller asks for a dash; labelled at the right edge of the plot
  for (const lv of opts.levels || []) {
    const v = finite(lv.y);
    if (v == null || v < low || v > high) continue;
    const ly = y(v);
    s += `<line class="tvc-level" x1="${left}" y1="${f(ly)}" x2="${left + plotW}" y2="${f(ly)}" stroke="${lv.color || T.textHi}" stroke-width="1.1"${lv.dash ? ` stroke-dasharray="${escAttr(lv.dash)}"` : ''}/>`;
    if (lv.label) s += `<text x="${left + plotW - 4}" y="${f(ly - 3)}" fill="${lv.color || T.textHi}" font-size="10.5" text-anchor="end">${escAttr(lv.label)} ${priceLabel(v)}</text>`;
  }

  // volume pane
  const vols = bars.map((b) => b.v);
  const vmax = Math.max(1, ...vols.filter((v) => v != null));
  s += `<line x1="${left}" y1="${volumeTop - 3}" x2="${left + plotW}" y2="${volumeTop - 3}" stroke="${T.grid}" stroke-width="1"/>`;
  bars.forEach((b, i) => {
    if (b.v == null) return; // unknown volume stays unknown: no bar at all
    const h = b.v > 0 ? Math.max(1, (b.v / vmax) * volumeH) : 0;
    s += `<rect class="tvc-vol" x="${f(xAt(i) - bodyW / 2)}" y="${f(volumeTop + volumeH - h)}" width="${f(bodyW)}" height="${f(h)}" fill="${b.c >= b.o ? T.volUp : T.volDown}"/>`;
  });

  // last price: solid line + badge on the axis
  const last = bars.at(-1);
  const lastCol = last.c >= last.o ? T.up : T.down;
  const lastY = y(last.c);
  const badge = (yy, fill, text, cls) => { const by = Math.max(top, Math.min(top + plotH - 16, yy - 8)); return `<g class="${cls}"><rect x="${left + plotW + 1}" y="${f(by)}" width="${right - 3}" height="16" rx="2" fill="${fill}"/><text x="${axX}" y="${f(by + 12)}" fill="#ffffff" font-size="${compact ? 10 : 11}" font-weight="600">${text}</text></g>`; };
  let tags = '';
  if (lastY >= top && lastY <= top + plotH) {
    s += `<line class="tvc-last" x1="${left}" y1="${f(lastY)}" x2="${left + plotW}" y2="${f(lastY)}" stroke="${lastCol}" stroke-width="1" opacity="0.7"/>`;
    tags += badge(lastY, lastCol, `${priceLabel(last.c)}${ref ? ` ${pctLabel((last.c / ref - 1) * 100)}` : ''}`, 'tvc-last-tag');
  }
  // High / Low tags: navy badge, white text, on the price axis. Intraday = the newest MT day; daily = the visible range.
  let pool = bars;
  if (tf !== 'D') { const day = mtParts(last.t).date; pool = bars.filter((b) => mtParts(b.t).date === day); }
  const hod = Math.max(...pool.map((b) => b.h)), lod = Math.min(...pool.map((b) => b.l));
  const tagWord = tf === 'D' ? ['High', 'Low'] : ['HOD', 'LOD'];
  if (y(hod) >= top - 1 && Math.abs(y(hod) - lastY) > 14) tags += badge(y(hod), T.tag, `${tagWord[0]} ${priceLabel(hod)}`, 'tvc-hl-tag tvc-hod');
  if (y(lod) <= top + plotH + 1 && Math.abs(y(lod) - lastY) > 14) tags += badge(y(lod), T.tag, `${tagWord[1]} ${priceLabel(lod)}`, 'tvc-hl-tag tvc-lod');
  s += tags;

  // time axis (MT, 12-hour; dates on daily)
  s += `<g class="tvc-xaxis" font-size="${compact ? 10 : 11}">`;
  for (const lb of labels) {
    const x = Math.max(left + 2, Math.min(left + plotW - 4, xAt(lb.index)));
    s += `<text class="tvc-time${lb.major ? ' major' : ''}" x="${f(x)}" y="${height - 6}" fill="${lb.major ? T.textHi : T.text}"${lb.major ? ' font-weight="600"' : ''} text-anchor="${lb.index === 0 ? 'start' : 'middle'}">${escAttr(lb.text)}</text>`;
  }
  if (tf !== 'D') s += `<text class="tvc-tz" x="${width - 4}" y="${height - 6}" fill="${T.text}" text-anchor="end">MT</text>`;
  s += '</g>';

  const svg = `<svg class="tvc" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="${escAttr(opts.ticker || '')} ${escAttr(TF_LABEL[tf] || tf)} candles" font-family="${T.font}"><rect class="tvc-bg" width="${width}" height="${height}" fill="${T.bg}"/>${s}</svg>`;
  return { svg, layout: { left, right, top, bottom: axisH, width, height, plotW, plotH }, low, high, count, offset, visible: bars.length, labels };
}
let clipSeq = 0;

// ---------- interactive controller ----------
const hasDom = () => typeof document !== 'undefined' && typeof window !== 'undefined';

function inPriceAxis(host, ev) {
  const r = host.getBoundingClientRect(); const L = host.__tvc?.layout; if (!L) return false;
  return ev.clientX >= r.left + (L.width - L.right) * (r.width / L.width);
}
function inTimeAxis(host, ev) {
  const r = host.getBoundingClientRect(); const L = host.__tvc?.layout; if (!L) return false;
  return ev.clientY >= r.top + (L.height - L.bottom) * (r.height / L.height);
}

// host: an element; bars: any accepted bar shape; opts: { tf, ticker, key, levels, fills, ref, refName,
//   timeframes: ['2m','10m','1h','D'] | null, onTimeframe(tf) -> Promise<bars> | void, defaultCount, note }
export function attachChart(host, rawBars, opts = {}) {
  if (!host) return null;
  const bars = normalizeBars(rawBars);
  const tf = opts.tf || '2m';
  const key = `${opts.key || opts.ticker || ''}:${tf}`;
  const defaultCount = opts.defaultCount || (tf === '2m' ? 195 : 120);
  const prev = host.__tvc;
  const view = prev && prev.key === key && prev.view
    ? prev.view
    : { count: Math.min(defaultCount, bars.length), offset: 0, autoScale: true, low: null, high: null };
  const st = { ...(prev || {}), key, bars, tf, opts, view, ind: indicators(bars, tf) };
  host.__tvc = st;
  host.classList?.add('tvc-host');
  if (!bars.length) { host.innerHTML = '<div class="empty-state">No bars returned.</div>'; return st; }
  draw(host);
  if (hasDom()) wire(host);
  return st;
}

export function redraw(host) { if (host?.__tvc) draw(host); }

function clampView(st) {
  const n = st.bars.length;
  st.view.count = Math.max(Math.min(12, n), Math.min(n, Math.round(st.view.count || n)));
  st.view.offset = Math.max(0, Math.min(n - st.view.count, Math.round(st.view.offset || 0)));
}

function draw(host) {
  const st = host.__tvc;
  clampView(st);
  const width = Math.max(240, Math.floor(host.clientWidth || st.opts.width || 640));
  const height = Math.max(160, Math.floor(host.clientHeight || st.opts.height || 320));
  st.size = { width, height };
  const out = chartSvg(st.bars, { tf: st.tf, width, height, view: st.view, levels: st.opts.levels, fills: st.opts.fills, ref: st.opts.ref, refName: st.opts.refName, ticker: st.opts.ticker, indicators: st.ind });
  st.layout = out.layout;
  if (st.view.autoScale !== false) { st.view.low = out.low; st.view.high = out.high; }
  host.innerHTML = out.svg + toolbar(st);
}

function toolbar(st) {
  const { tf, opts } = st;
  const tfs = opts.timeframes || null;
  const chips = tfs ? tfs.map((t) => `<button type="button" class="tvc-tf${t === tf ? ' active' : ''}" data-tvc-tf="${t}"${t === '2m' ? ` title="${escAttr(DELAYED_NOTE)}"` : ''}>${TF_LABEL[t] || t}</button>`).join('') : '';
  const help = [tf === '2m' ? DELAYED_NOTE : '', opts.note || '', CONTROLS_HINT].filter(Boolean).join('\n');
  const auto = st.view.autoScale === false ? '<button type="button" class="tvc-btn tvc-auto" data-tvc-auto title="Restore auto price scale">A</button>' : '';
  return `<div class="tvc-bar">${chips}${auto}<button type="button" class="tvc-btn tvc-reset" data-tvc-reset title="Reset the view (double-click does the same)">⟲</button><span class="tvc-help" tabindex="0" role="note" title="${escAttr(help)}">?</span></div>`;
}

function reset(host) {
  const st = host.__tvc; if (!st) return;
  st.view = { count: Math.min(st.opts.defaultCount || (st.tf === '2m' ? 195 : 120), st.bars.length), offset: 0, autoScale: true, low: null, high: null };
  draw(host);
}

async function switchTf(host, tf) {
  const st = host.__tvc; if (!st || tf === st.tf) return;
  const fetcher = st.opts.onTimeframe;
  if (!fetcher) return;
  host.classList.add('tvc-loading');
  try {
    const bars = await fetcher(tf);
    if (Array.isArray(bars)) attachChart(host, bars, { ...st.opts, tf });
  } catch (e) {
    const note = host.querySelector('.tvc-help');
    if (note) note.title = `${TF_LABEL[tf] || tf} bars unavailable: ${e?.message || e}`;
  } finally { host.classList.remove('tvc-loading'); }
}

function wire(host) {
  if (host.__tvcWired) return;
  host.__tvcWired = true;
  host.addEventListener('wheel', (ev) => {
    const st = host.__tvc; if (!st?.layout) return;
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 0.85 : 1.18;
    if (inPriceAxis(host, ev)) {
      const mid = (st.view.low + st.view.high) / 2, half = ((st.view.high - st.view.low) / 2) * factor;
      st.view.low = mid - half; st.view.high = mid + half; st.view.autoScale = false;
    } else {
      st.view.count = Math.round(st.view.count * factor);
    }
    draw(host);
  }, { passive: false });
  host.addEventListener('dblclick', (ev) => { if (!ev.target.closest('.tvc-bar')) reset(host); });
  host.addEventListener('click', (ev) => {
    const tfb = ev.target.closest('[data-tvc-tf]');
    if (tfb) { ev.stopPropagation(); switchTf(host, tfb.dataset.tvcTf); return; }
    if (ev.target.closest('[data-tvc-reset]')) { ev.stopPropagation(); reset(host); return; }
    if (ev.target.closest('[data-tvc-auto]')) { ev.stopPropagation(); const st = host.__tvc; st.view.autoScale = true; draw(host); }
  });
  let drag = null;
  const start = (ev) => {
    if (ev.button !== 0 || ev.target.closest('.tvc-bar')) return;
    const st = host.__tvc; if (!st?.layout) return;
    ev.preventDefault();
    const mode = inPriceAxis(host, ev) ? 'scale' : inTimeAxis(host, ev) ? 'timescale' : 'pan';
    drag = { mode, x: ev.clientX, y: ev.clientY, y0: ev.clientY, low: st.view.low, high: st.view.high, rem: 0 };
    host.classList.add('chart-dragging');
    host.setPointerCapture?.(ev.pointerId);
  };
  const move = (ev) => {
    const st = host.__tvc;
    if (!drag) { if (st?.layout) host.style.cursor = inPriceAxis(host, ev) ? 'ns-resize' : inTimeAxis(host, ev) ? 'ew-resize' : 'crosshair'; return; }
    ev.preventDefault();
    const r = host.getBoundingClientRect();
    if (drag.mode === 'scale') {
      const k = Math.max(0.2, Math.min(6, Math.exp((ev.clientY - drag.y0) * 0.008)));
      const mid = (drag.low + drag.high) / 2, half = ((drag.high - drag.low) / 2) * k;
      st.view.low = mid - half; st.view.high = mid + half; st.view.autoScale = false;
    } else if (drag.mode === 'timescale') {
      const k = Math.max(0.2, Math.min(6, Math.exp((drag.x - ev.clientX) * 0.006)));
      drag.x = ev.clientX; st.view.count = Math.round(st.view.count * k);
    } else {
      const dx = ev.clientX - drag.x; drag.x = ev.clientX;
      drag.rem += (dx / Math.max(1, r.width)) * st.view.count;
      const db = drag.rem < 0 ? Math.ceil(drag.rem) : Math.floor(drag.rem);
      if (db) { drag.rem -= db; st.view.offset += db; }
      const dy = ev.clientY - drag.y; drag.y = ev.clientY;
      if (dy && st.layout) {
        const span = st.view.high - st.view.low; const shift = (dy / Math.max(1, st.layout.plotH * (r.height / st.layout.height))) * span;
        st.view.low += shift; st.view.high += shift; st.view.autoScale = false;
      }
    }
    draw(host);
  };
  const end = (ev) => { if (!drag) return; drag = null; host.classList.remove('chart-dragging'); if (ev?.pointerId != null && host.hasPointerCapture?.(ev.pointerId)) host.releasePointerCapture(ev.pointerId); };
  host.addEventListener('pointerdown', start);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('pointerleave', () => { if (!drag) host.style.cursor = ''; });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      const st = host.__tvc; if (!st?.size) return;
      const w = Math.floor(host.clientWidth), h = Math.floor(host.clientHeight);
      if (w < 1 || h < 1 || (Math.abs(w - st.size.width) < 2 && Math.abs(h - st.size.height) < 2)) return;
      cancelAnimationFrame(host.__tvcFrame || 0);
      host.__tvcFrame = requestAnimationFrame(() => draw(host));
    });
    ro.observe(host);
  }
}

// ---------- module charts: register + hydrate ----------
// A module renderer keeps returning its static SVG (tests, no-JS) and stamps it with registerChart(); once that SVG is in
// the page, the hydrator swaps it for the shared interactive chart with the same bars, levels and reference.
const registry = new Map();
let seq = 0;
export function registerChart(bars, opts = {}) {
  if (!hasDom()) return '';
  const id = `tvc${++seq}`;
  registry.set(id, { bars, opts });
  if (registry.size > 300) registry.delete(registry.keys().next().value);
  ensureHydrator();
  return id;
}
// ' data-tvc="id"' for a renderer's <svg ...> tag ('' in node, where nothing hydrates).
export function tvcAttr(bars, opts) { const id = registerChart(bars, opts); return id ? ` data-tvc="${id}"` : ''; }

function hydrate(svgEl) {
  const id = svgEl.getAttribute('data-tvc');
  const entry = registry.get(id);
  if (!entry) return;
  registry.delete(id);
  const vb = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const vw = vb[2] || Number(svgEl.getAttribute('width')) || 640, vh = vb[3] || Number(svgEl.getAttribute('height')) || 320;
  const hAttr = svgEl.getAttribute('height');
  const host = document.createElement('div');
  host.className = 'tvc-host tvc-module';
  if (hAttr && hAttr !== '100%' && /^\d+(\.\d+)?$/.test(hAttr)) host.style.height = `${hAttr}px`;
  else host.style.aspectRatio = `${vw} / ${vh}`;
  const wAttr = svgEl.getAttribute('width');
  if (wAttr && /^\d+(\.\d+)?$/.test(wAttr)) host.style.maxWidth = `${wAttr}px`;
  svgEl.replaceWith(host);
  const ticker = entry.opts.ticker;
  const fetchBars = typeof window !== 'undefined' ? window.radarFetchBars : null;
  const opts = { ...entry.opts };
  if (opts.timeframes === undefined && ticker && fetchBars) {
    const native = { tf: opts.tf, bars: entry.bars };
    opts.timeframes = [...new Set([...(CHART_TIMEFRAMES), opts.tf])].filter((t) => CHART_TIMEFRAMES.includes(t) || t === opts.tf);
    opts.onTimeframe = (tf) => (tf === native.tf ? Promise.resolve(native.bars) : fetchBars(ticker, tf));
  }
  const go = () => attachChart(host, entry.bars, opts);
  if (host.clientWidth > 0) go();
  else if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (host.clientWidth > 0) { ro.disconnect(); go(); } });
    ro.observe(host);
  } else go();
}

let observer = null;
function ensureHydrator() {
  if (observer || !hasDom() || typeof MutationObserver === 'undefined' || !document.body) {
    if (!observer && hasDom() && !document.body) document.addEventListener('DOMContentLoaded', ensureHydrator, { once: true });
    return;
  }
  const scan = (root) => { if (root.nodeType !== 1) return; if (root.matches?.('svg[data-tvc]')) hydrate(root); root.querySelectorAll?.('svg[data-tvc]').forEach(hydrate); };
  observer = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(scan); });
  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}
