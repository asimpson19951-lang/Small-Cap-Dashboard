// INTERNALS tab (V2.14.1). Loaded lazily by app.js the first time the tab opens.
// Reads ./data/internals.json (flows, breadth, fear/greed snapshot) and
// ./data/internals-series.json (tile sparklines, Market Monitor, 8EMA stretch).
// Raw primitives only: no composite, no grades. Percentile = mid-rank vs the
// series' own ~2-year history. Gold marks a 2-year extreme (<= 5th or >= 95th percentile).
// Pure render functions are exported so node tests can check the display laws.

export const EXTREME_LO = 5;
export const EXTREME_HI = 95;

// Every fear/greed component is shown: breadth ids in the Breadth section, the rest in these groups.
export const BREADTH_IDS = ['pct_above_50dma', 'pct_above_200dma', 'new_52w_highs', 'new_52w_lows', 'new_52w_highs_minus_lows'];
export const FG_GROUPS = [
  ['Volatility', ['vix', 'vix9d', 'vix3m', 'vix_over_vix3m', 'vix9d_over_vix']],
  ['Options · Cboe put/call', ['cboe_put_call_equity', 'cboe_put_call_total', 'cboe_put_call_index']],
  ['Credit & risk appetite', ['hyg_ief_ratio', 'hyg_ief_ratio_change_20d', 'lqd_ief_ratio', 'lqd_ief_ratio_change_20d', 'spy_tlt_20d_return_spread']],
  ['Positioning · futures & margin', ['cot_sp500_emini_noncomm_net', 'cot_vix_futures_noncomm_net', 'finra_margin_debt']],
];
export const COMPONENT_LABELS = {
  pct_above_50dma: 'Stocks above 50-day MA', pct_above_200dma: 'Stocks above 200-day MA', new_52w_highs: 'New 52-week highs', new_52w_lows: 'New 52-week lows',
  new_52w_highs_minus_lows: 'New highs − new lows', vix: 'VIX', vix9d: 'VIX9D (9-day)', vix3m: 'VIX3M (3-month)', vix_over_vix3m: 'VIX / VIX3M', vix9d_over_vix: 'VIX9D / VIX',
  cboe_put_call_equity: 'Equity put/call', cboe_put_call_total: 'Total put/call', cboe_put_call_index: 'Index put/call',
  hyg_ief_ratio: 'HYG / IEF (junk vs Treasuries)', hyg_ief_ratio_change_20d: 'HYG / IEF, 20-session change', lqd_ief_ratio: 'LQD / IEF (IG credit vs Treasuries)',
  lqd_ief_ratio_change_20d: 'LQD / IEF, 20-session change', spy_tlt_20d_return_spread: 'SPY − TLT, 20-day return spread',
  cot_sp500_emini_noncomm_net: 'COT S&P 500 e-mini, specs net', cot_vix_futures_noncomm_net: 'COT VIX futures, specs net', finra_margin_debt: 'FINRA margin debt',
};

export const BUCKET_LABELS = {
  'style:large_broad': ['Large caps', 'STYLE'],
  'style:mid_cap': ['Mid caps', 'STYLE'],
  'style:small_cap': ['Small caps', 'STYLE'],
  'style:growth': ['Growth', 'STYLE'],
  'style:value': ['Value', 'STYLE'],
  'style:dividend': ['Dividend', 'STYLE'],
  'sector:technology': ['Technology', 'SECTOR'],
  'sector:semiconductors': ['Semiconductors', 'SECTOR'],
  'sector:biotech_health': ['Biotech & health', 'SECTOR'],
  'sector:financials': ['Financials', 'SECTOR'],
  'sector:energy': ['Energy', 'SECTOR'],
  'sector:industrials': ['Industrials', 'SECTOR'],
  'sector:materials': ['Materials', 'SECTOR'],
  'sector:real_estate': ['Real estate', 'SECTOR'],
  'sector:utilities': ['Utilities', 'SECTOR'],
  'sector:consumer': ['Consumer', 'SECTOR'],
  'sector:communication': ['Communication', 'SECTOR'],
  'bonds:broad': ['Bonds, broad', 'BONDS'],
  'bonds:treasury': ['Treasuries', 'BONDS'],
  'bonds:credit': ['Investment-grade credit', 'BONDS'],
  'bonds:high_yield': ['High-yield bonds', 'BONDS'],
  'bonds:muni': ['Municipal bonds', 'BONDS'],
  'commodity:broad': ['Commodities, broad', 'COMMOD'],
  'commodity:gold': ['Gold', 'COMMOD'],
  'commodity:silver': ['Silver', 'COMMOD'],
  'commodity:oil_gas': ['Oil & gas', 'COMMOD'],
  country: ['Country & international', 'OTHER'],
  crypto: ['Crypto', 'OTHER'],
  currency: ['Currency', 'OTHER'],
  multi_asset: ['Multi-asset', 'OTHER'],
  volatility: ['Volatility products', 'OTHER'],
  leveraged_inverse: ['Leveraged & inverse', 'OTHER'],
  unknown: ['Unclassified', 'OTHER'],
};

export const FLAG_LABELS = {
  large_pct_aum: ['big vs AUM', 'Weekly flow is a large share of the fund’s assets'],
  reversal_suspect: ['may reverse', 'Looks like a creation/redemption that reverses the next week'],
  split: ['split', 'Share split inside the week'],
  split_suspect: ['split?', 'Possible share split inside the week'],
  multi_week_step: ['stepped', 'Shares outstanding updated in a multi-week step'],
};

// ---------- formatting ----------
// Missing data is always the literal "n/a": never 0, never an invented value, never a bare dash.
export const NA = 'n/a';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const MINUS = '−';
const signed = (s, x) => (x > 0 ? '+' : x < 0 ? MINUS : '') + s;
const grp = (x, d = 0) => (fin(x) ? Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : NA);
// count + noun, or n/a when the count is absent (never "0 funds" for a missing count)
const cnt = (x, noun) => (fin(x) ? `${grp(x)} ${noun}` : NA);

export function fmtUsd(x, { sign = true } = {}) {
  if (!fin(x)) return NA;
  const a = Math.abs(x);
  const body = a >= 1e12 ? `$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return sign ? signed(body, x) : (x < 0 ? MINUS : '') + body;
}
export function fmtPct(x, d = 1, { sign = false } = {}) {
  if (!fin(x)) return NA;
  return sign ? signed(`${grp(x, d)}%`, x) : `${x < 0 ? MINUS : ''}${grp(x, d)}%`;
}
// Units are an allowlist; an unknown unit is stripped to harmless text (nothing from data reaches markup unchecked).
const cleanUnit = (u) => String(u ?? '').replace(/[^A-Za-z%$×/ .·-]/g, '').trim();
// value + unit for a fear/greed-style component
export function fmtUnit(x, unit, { sign = false } = {}) {
  if (!fin(x)) return NA;
  const neg = x < 0 ? MINUS : '';
  const sg = sign ? (x > 0 ? '+' : neg) : neg;
  switch (unit) {
    case '%': return `${sg}${grp(x, Math.abs(x) >= 10 ? 1 : 2)}%`;
    case 'pp': return `${sg}${grp(x, 1)} pts`;
    case 'pts': return `${sg}${grp(x, 2)} pts`;
    case '×': return `${sg}${grp(x, Math.abs(x) < 10 ? 3 : 2)}×`;
    case 'tickers': return `${sg}${grp(x, 0)} stocks`;
    case 'contracts': return Math.abs(x) >= 1e4 ? `${sg}${grp(Math.abs(x) / 1e3, Math.abs(x) >= 1e5 ? 0 : 1)}K contracts` : `${sg}${grp(x, 0)} contracts`;
    case '$M': return fmtUsd(x * 1e6, { sign });
    default: return `${sg}${grp(x, 2)} ${cleanUnit(unit)}`.trim();
  }
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const validDay = (iso) => { if (!DAY_RE.test(iso)) return false; const d = new Date(`${iso}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };
// America/Denver (DST-aware) wall-clock parts of an instant.
function denverParts(instant) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
// Contracts: "YYYY-MM-DD" market day (parsed as UTC noon so no timezone can slide it), "YYYY-MM" month, or a full
// ISO instant with an offset (converted to the America/Denver calendar day). Anything else, or an impossible date, is n/a.
// Callers add the "MT" label.
export function fmtDay(iso, { dow = true } = {}) {
  if (typeof iso !== 'string') return NA;
  if (MONTH_RE.test(iso)) return `${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
  let day = iso;
  if (INSTANT_RE.test(iso)) {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return NA;
    day = denverParts(t).day;
  }
  if (!validDay(day)) return NA;
  const d = new Date(`${day}T12:00:00Z`);
  return `${dow ? DOW[d.getUTCDay()] + ' ' : ''}${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
// "2026-09-29 23:09 MT" -> "Sep 29, 23:09 MT"; an ISO instant is converted to Denver time.
export function fmtStamp(s) {
  const m = /^(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):([0-5]\d) MT$/.exec(s || '');
  if (m && validDay(m[1])) return `${fmtDay(m[1], { dow: false })}, ${m[2]}:${m[3]} MT`;
  if (typeof s === 'string' && INSTANT_RE.test(s) && !Number.isNaN(new Date(s).getTime())) { const p = denverParts(new Date(s)); return `${fmtDay(p.day, { dow: false })}, ${p.hm} MT`; }
  return NA;
}
export const isExtreme = (p) => fin(p) && (p <= EXTREME_LO || p >= EXTREME_HI);
export function bucketLabel(code) {
  const hit = BUCKET_LABELS[code];
  if (hit) return hit;
  const tail = String(code).split(':').pop().replace(/_/g, ' ');
  return [tail.charAt(0).toUpperCase() + tail.slice(1), 'OTHER'];
}
const signCls = (x) => (!fin(x) || x === 0 ? '' : x > 0 ? 'ix-pos' : 'ix-neg');

// ---------- small SVG pieces ----------
const FREQ_NOUN = { daily: 'sessions', weekly: 'weeks', monthly: 'months' };
// 'daily' | 'weekly' | 'monthly' from a component's frequency text (matches build-data freqKey)
export const freqOf = (f) => (/^weekly/.test(f || '') ? 'weekly' : /^monthly/.test(f || '') ? 'monthly' : 'daily');
export function sparkSvg(points, { unit = '', w = 240, h = 44, label = '', freq = 'daily' } = {}) {
  const v = (points || []).filter((p) => fin(p?.value));
  if (v.length < 2) return '<div class="ix-spark ix-spark-empty"></div>';
  const vals = v.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), rg = hi - lo || 1;
  const X = (i) => (i * (w - 4)) / (v.length - 1) + 2;
  const Y = (x) => h - 4 - ((x - lo) / rg) * (h - 8);
  const line = v.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${X(v.length - 1).toFixed(1)} ${h} L${X(0).toFixed(1)} ${h} Z`;
  const t = `${label ? label + ' · ' : ''}${v.length} ${FREQ_NOUN[freq] || 'observations'} ${fmtDay(v[0].date, { dow: false })} to ${fmtDay(v.at(-1).date, { dow: false })} (MT): low ${fmtUnit(lo, unit)}, high ${fmtUnit(hi, unit)}`;
  return `<svg class="ix-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(t)}"><title>${esc(t)}</title><path class="ix-spark-area" d="${area}"/><path class="ix-spark-line" d="${line}" vector-effect="non-scaling-stroke"/><circle class="ix-spark-dot" cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v.at(-1).value).toFixed(1)}" r="2.6" vector-effect="non-scaling-stroke"/></svg>`;
}

export function pctBar(p, { compact = false } = {}) {
  if (!fin(p)) return '<span class="ix-pbar ix-pbar-none"></span>';
  const ext = isExtreme(p);
  return `<span class="ix-pbar${ext ? ' ix-pbar-ext' : ''}${compact ? ' ix-pbar-compact' : ''}" title="Percentile ${fmtPct(p)} vs its own ~2-year history (mid-rank)"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span>`;
}

// ---------- metric rows (breadth + fear/greed grids) ----------
// Every derived change needs BOTH the current and the prior value to be finite; otherwise it is missing (null), never a
// change from an invented zero.
const chg = (cur, prior) => (fin(cur) && fin(prior) ? cur - prior : null);
// History (spark + prior value) is only paired with a headline when it is the same reading: no mismatch flag from the
// builder and the same as-of date. Otherwise the history is dropped and the row/tile says so.
export function histOk(c, t) {
  if (!t) return { ok: false, note: '' };
  if (t.mismatch) return { ok: false, note: 'history differs from this reading, change hidden' };
  if (t.as_of !== c.as_of) return { ok: false, note: `history is as of ${fmtDay(t.as_of, { dow: false })} MT, change hidden` };
  return { ok: true, note: '' };
}
export function compModel(c, T) {
  const t = T?.[c.id];
  const h = histOk(c, t);
  const wk = h.ok ? t.week_ago || null : null;
  const dU = c.unit === '%' ? 'pp' : c.unit;
  return { id: c.id, label: COMPONENT_LABELS[c.id] || c.label, unit: c.unit, value: c.value, as_of: c.as_of, pct: c.percentile_pct,
    low: c.window_min, median: c.window_median, high: c.window_max, n: c.window_n, week_ago: wk,
    delta: chg(c.value, wk?.value), delta_unit: dU, change_label: (h.ok && t.change_label) || '1 wk', freq: (h.ok && t.freq) || freqOf(c.frequency), spark: h.ok ? t.spark || [] : [], hist_note: h.note };
}
// Market Monitor row model. The row stays even when the value is missing (renders n/a). History (series60) is paired
// only when its newest point is the same session as the headline.
export function mmModel(mm, key, label, unit, hint = '') {
  const r = mm?.rows?.[0]; if (!r) return null;
  const ser0 = mm.series60?.[key] || [];
  const aligned = ser0.length > 0 && ser0[ser0.length - 1]?.date === r.date;
  const ser = aligned ? ser0 : [];
  const wk = ser.length > 5 ? ser[ser.length - 6] : null; const hs = mm.history_stats?.[key] || {};
  const val = fin(r[key]) ? r[key] : null;
  return { id: key, label, hint, unit, value: val, as_of: r.date, pct: r.pct?.[key], low: hs.min, median: hs.median, high: hs.max, n: hs.n,
    week_ago: wk && fin(wk.value) ? wk : null, delta: chg(val, wk?.value), delta_unit: unit === '%' ? 'pp' : unit, change_label: '1 wk', freq: 'daily', spark: ser, hist_note: '' };
}
export function metricRow(m, common = null) {
  const ext = isExtreme(m.pct);
  const d = fin(m.delta) ? `<b>${m.delta > 0 ? '▲' : m.delta < 0 ? '▼' : '■'} ${esc(fmtUnit(Math.abs(m.delta), m.delta_unit))}</b>` : NA;
  const wkT = m.hist_note || (m.week_ago ? `${m.change_label} ago: ${fmtUnit(m.week_ago.value, m.unit)} on ${fmtDay(m.week_ago.date)} MT` : '');
  return `<tr class="${ext ? 'ix-row-ext' : ''}" data-metric="${esc(m.id)}"><th scope="row"${m.hint ? ` title="${esc(m.hint)}"` : ''}>${esc(m.label)}${m.hint ? ' <span class="ix-i">ⓘ</span>' : ''}${m.as_of && m.as_of !== common ? ` <small class="ix-asof">${fmtDay(m.as_of, { dow: false })} MT</small>` : ''}${m.hist_note ? ` <small class="ix-asof">${esc(m.hist_note)}</small>` : ''}</th>
    <td class="ix-m-val" data-unit="${esc(m.unit)}">${esc(fmtUnit(m.value, m.unit))}</td>
    <td class="ix-m-chg" title="${esc(wkT)}">${d}${m.change_label !== '1 wk' && fin(m.delta) ? `<small> ${esc(m.change_label)}</small>` : ''}</td>
    <td class="ix-m-spark">${sparkSvg(m.spark, { unit: m.unit, label: m.label, w: 110, h: 26, freq: m.freq })}</td>
    <td class="ix-pct-cell">${pctBar(m.pct, { compact: true })}<span class="ix-pct-v${ext ? ' ix-gold' : ''}">${fmtPct(m.pct)}</span></td>
    <td class="ix-m-range" title="2-year median ${esc(fmtUnit(m.median, m.unit))} · ${cnt(m.n, 'obs')}">${esc(rangeText(m.low, m.high, m.unit))}</td></tr>`;
}
export function metricTable(title, models, { note = '' } = {}) {
  const rows = models.filter(Boolean);
  if (!rows.length) return '';
  const counts = {}; for (const r of rows) if (r.as_of) counts[r.as_of] = (counts[r.as_of] || 0) + 1;
  const common = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || (x < y ? 1 : -1))[0] || null;
  return `<div class="ix-mpanel"><h3>${esc(title)}${note ? ` <span class="ix-i" title="${esc(note)}">ⓘ</span>` : ''}${common ? `<span class="ix-h3-date">as of ${fmtDay(common, { dow: false })} MT</span>` : ''}</h3><div class="tt-wrap"><table class="theme-table ix-metrics"><thead><tr><th class="l">Measure</th><th>Latest</th><th title="Weekly and daily series: vs 1 week ago. Monthly series: vs 1 month ago.">Change vs prior</th><th class="ix-m-spark-h">Recent history</th><th>2-yr percentile</th><th>2-yr range</th></tr></thead><tbody>${rows.map((r) => metricRow(r, common)).join('')}</tbody></table></div></div>`;
}

// ---------- tiles ----------
// Each tile: one headline primitive. Value, change vs 1 week ago (5 observations), 60-session
// sparkline, 2-year percentile bar, 2-year low/median/high, and a sub-line of related raw values.
export function tileModels(d, s) {
  const C = Object.fromEntries((d.feargreed?.components || []).map((c) => [c.id, c]));
  const B = Object.fromEntries((d.breadth?.rows || []).map((r) => [r.id, r]));
  const T = s?.tiles || {};
  const mm = s?.market_monitor;
  const deltaUnit = (u) => (u === '%' ? 'pp' : u);
  const fromComp = (id, label, sub, extra = {}) => {
    const c = C[id]; if (!c) return null;
    const t = T[id];
    const h = histOk(c, t);
    const wk = h.ok ? t.week_ago || null : null;
    return {
      id, label, unit: c.unit, value: c.value, as_of: c.as_of, pct: c.percentile_pct,
      low: c.window_min, median: c.window_median, high: c.window_max, n: c.window_n,
      week_ago: wk, delta: chg(c.value, wk?.value), delta_unit: deltaUnit(c.unit),
      spark: t ? (h.ok ? t.spark || [] : []) : B[id]?.spark || [], freq: (h.ok && t.freq) || freqOf(c.frequency), hist_note: h.note, sub, ...extra,
    };
  };
  const v = (id, u) => (C[id] ? fmtUnit(C[id].value, u ?? C[id].unit) : NA);
  const elig = (id) => (B[id] && fin(B[id].eligible_n) ? `${grp(B[id].eligible_n)} liquid stocks` : 'liquid stock count n/a');
  const tiles = [
    fromComp('pct_above_50dma', 'Above 50-day MA', `of ${elig('pct_above_50dma')}`),
    fromComp('pct_above_200dma', 'Above 200-day MA', `of ${elig('pct_above_200dma')}`),
    fromComp('new_52w_highs_minus_lows', 'New highs − lows', `${v('new_52w_highs')} highs · ${C.new_52w_lows ? cnt(C.new_52w_lows.value, '') .trim() : NA} lows`),
    fromComp('vix', 'VIX', `VIX9D ${v('vix9d')} · VIX3M ${v('vix3m')}`),
    fromComp('vix_over_vix3m', 'VIX / VIX3M', `VIX9D / VIX ${v('vix9d_over_vix')}`, { hint: 'VIX divided by 3-month VIX. Below 1.000× = 30-day implied vol under 3-month.' }),
    fromComp('cboe_put_call_equity', 'Equity put/call', `Total ${v('cboe_put_call_total')} · index ${v('cboe_put_call_index')}`, { hint: 'Cboe equity-only put/call volume ratio' }),
    fromComp('hyg_ief_ratio', 'Credit HYG / IEF', `20-session chg ${C.hyg_ief_ratio_change_20d ? fmtUnit(C.hyg_ief_ratio_change_20d.value, '%', { sign: true }) : NA}`, { hint: 'High-yield bonds vs 7–10y Treasuries, price ratio' }),
  ].filter(Boolean);
  const row = mm?.rows?.[0];
  if (row) {
    const ser0 = mm.series60?.ext_below2_pct || [];
    const ser = ser0.length > 0 && ser0[ser0.length - 1]?.date === row.date ? ser0 : [];
    const wk = ser.length > 5 && fin(ser[ser.length - 6]?.value) ? ser[ser.length - 6] : null;
    const hs = mm.history_stats?.ext_below2_pct || {};
    const val = fin(row.ext_below2_pct) ? row.ext_below2_pct : null;
    tiles.push({
      id: 'ext_below2_pct', label: '≥2 ATR below 8EMA', noIcon: true, unit: '%', value: val, as_of: row.date,
      pct: row.pct?.ext_below2_pct, low: hs.min, median: hs.median, high: hs.max, n: hs.n,
      week_ago: wk, delta: chg(val, wk?.value), delta_unit: 'pp', spark: ser, freq: 'daily', hist_note: '',
      sub: `${cnt(row.ext_below2, 'stocks')} · ≥2 ATR above ${fmtPct(row.ext_above2_pct)}`,
      hint: 'Share of the liquid universe closing at least 2 ATR14 below its 8-day EMA: (close − 8EMA) ÷ ATR14 ≤ −2.0. Mean-reversion stretch lens.', mr: true,
    });
  }
  return tiles;
}

// "12.77 → 52.33 pts": the unit word is written once, on the high end.
export function rangeText(lo, hi, unit) {
  const a = fmtUnit(lo, unit), b = fmtUnit(hi, unit);
  const word = { pts: ' pts', tickers: ' stocks', contracts: ' contracts' }[unit];
  return `${word && a.endsWith(word) ? a.slice(0, -word.length) : a} → ${b}`;
}

export function renderTile(t) {
  const ext = isExtreme(t.pct);
  const dU = t.delta_unit;
  const delta = fin(t.delta) && t.week_ago
    ? `<span class="ix-delta" title="1 week ago: ${esc(fmtUnit(t.week_ago.value, t.unit))} on ${esc(fmtDay(t.week_ago.date))} MT"><b>${t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '■'} ${esc(fmtUnit(Math.abs(t.delta), dU))}</b> vs 1 wk ago</span>`
    : `<span class="ix-delta"${t.hist_note ? ` title="${esc(t.hist_note)}"` : ''}>1-week change: ${NA}${t.hist_note ? ' (history mismatch)' : ''}</span>`;
  const big = fmtUnit(t.value, t.unit);
  return `<article class="ix-tile${ext ? ' ix-tile-ext' : ''}${t.mr ? ' ix-tile-mr' : ''}" data-tile="${esc(t.id)}">
    <header class="ix-tile-head"><span class="ix-tile-label" title="${esc(t.hint || t.label)}">${esc(t.label)}${t.hint && !t.noIcon ? ' <span class="ix-i">ⓘ</span>' : ''}</span><span class="ix-tile-date">${esc(fmtDay(t.as_of, { dow: false }))} MT</span></header>
    <div class="ix-tile-value">${esc(big)}</div>
    ${delta}
    ${sparkSvg(t.spark, { unit: t.unit, label: t.label, freq: t.freq })}
    <div class="ix-tile-pct">${pctBar(t.pct)}<span class="ix-pct-num${ext ? ' ix-gold' : ''}">${fmtPct(t.pct)}<small> 2-yr pctile</small></span></div>
    <div class="ix-tile-range" title="2-year low ${esc(fmtUnit(t.low, t.unit))} · median ${esc(fmtUnit(t.median, t.unit))} · high ${esc(fmtUnit(t.high, t.unit))}">2-yr range ${esc(rangeText(t.low, t.high, t.unit))}</div>
    ${t.sub ? `<div class="ix-tile-sub">${esc(t.sub)}</div>` : ''}
  </article>`;
}

// ---------- Market Monitor (Stockbee-style) ----------
export const MM_GROUPS = [
  ['Today', [['up4', 'Up 4%+', 'up'], ['down4', 'Down 4%+', 'down']]],
  ['Up/down ratio', [['ratio5', '5-day', 'ratio'], ['ratio10', '10-day', 'ratio']]],
  ['Quarter · 65 sessions', [['up25q', 'Up 25%+', 'up'], ['down25q', 'Down 25%+', 'down']]],
  ['Month · 20 sessions', [['up25m', 'Up 25%+', 'up'], ['down25m', 'Down 25%+', 'down'], ['up50m', 'Up 50%+', 'up'], ['down50m', 'Down 50%+', 'down']]],
  ['34 sessions', [['up13_34', 'Up 13%+', 'up'], ['down13_34', 'Down 13%+', 'down']]],
  ['T2108', [['t2108', '% > 40-day MA', 'pct']]],
  ['8EMA stretch · ±2 ATR', [['ext_above2_pct', 'Above', 'pctmr'], ['ext_below2_pct', 'Below', 'pctmr']]],
];
const PAIR = { up4: 'down4', down4: 'up4', up25q: 'down25q', down25q: 'up25q', up25m: 'down25m', down25m: 'up25m', up50m: 'down50m', down50m: 'up50m', up13_34: 'down13_34', down13_34: 'up13_34' };

export function mmCell(row, key, kind) {
  const x = row[key]; const p = row.pct?.[key];
  const ext = isExtreme(p);
  let txt, cls = '';
  // Tints: green marks the up side when it is larger; the down side / a ratio under 1.00× gets a NEUTRAL highlight.
  // Red is kept for negative values and losses, and these are positive counts and ratios.
  if (kind === 'ratio') { txt = fin(x) ? `${x.toFixed(2)}×` : NA; cls = fin(x) ? (x > 1 ? 'ix-tint-up' : x < 1 ? 'ix-tint-flat' : '') : ''; }
  else if (kind === 'pct' || kind === 'pctmr') { txt = fmtPct(x); }
  else {
    txt = fin(x) ? `${grp(x)}` : NA;
    const o = row[PAIR[key]];
    if (fin(x) && fin(o) && x > o) cls = kind === 'up' ? 'ix-tint-up' : 'ix-tint-flat';
  }
  const unitNote = kind === 'up' || kind === 'down' ? ' stocks' : '';
  const eligKey = { up25q: 'elig_q', down25q: 'elig_q', up25m: 'elig_m', down25m: 'elig_m', up50m: 'elig_m', down50m: 'elig_m', up13_34: 'elig_34', down13_34: 'elig_34', up4: 'elig_daily', down4: 'elig_daily' }[key];
  const eligNote = eligKey && fin(row[eligKey]) ? ` · ${grp(row[eligKey])} stocks eligible` : '';
  const title = `${fmtDay(row.date)} MT · ${txt}${txt === NA ? '' : unitNote}${eligNote} · ${fin(p) ? fmtPct(p) + ' 2-yr pctile' : 'percentile n/a'}${ext ? ' · 2-year extreme' : ''}`;
  return `<td class="${cls}${ext ? ' ix-ext' : ''}" data-unit="${kind === 'up' || kind === 'down' ? 'stocks' : kind === 'ratio' ? '×' : '%'}" title="${esc(title)}">${esc(txt)}</td>`;
}

export function renderMonitor(mm) {
  if (!mm?.rows?.length) return '';
  const head1 = MM_GROUPS.map(([g, cols]) => `<th colspan="${cols.length}" class="ix-mm-grp">${esc(g)}</th>`).join('');
  const head2 = MM_GROUPS.flatMap(([, cols]) => cols.map(([k, l, kind]) => `<th class="ix-mm-${kind}" title="${esc(mm.definitions?.[k] || '')}">${esc(l)}${kind === 'up' || kind === 'down' ? '<small>stocks</small>' : ''}</th>`)).join('');
  const body = mm.rows.map((r, i) => `<tr${i === 0 ? ' class="ix-mm-latest"' : ''}><th scope="row">${fmtDay(r.date)}</th>${MM_GROUPS.flatMap(([, cols]) => cols.map(([k, , kind]) => mmCell(r, k, kind))).join('')}</tr>`).join('');
  return `<div class="tt-wrap ix-mm-wrap"><table class="theme-table ix-mm">
    <thead><tr><th rowspan="2" class="ix-mm-date">Session (MT)</th>${head1}</tr><tr>${head2}</tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

// ---------- after-similar-days (MR lens) ----------
const FWD_LABELS = { ext_below2_pct: ['Stretched ≥2 ATR below 8EMA', '%'], ext_above2_pct: ['Stretched ≥2 ATR above 8EMA', '%'], down4: ['Stocks down 4%+', 'stocks'], up4: ['Stocks up 4%+', 'stocks'], t2108: ['T2108 (% > 40-day MA)', '%'] };
// After-similar-days table. SPY = market-wide read; IWM = small-cap read (labelled as such).
// Falls back to IWM only when an older market-monitor.json has no forward_by_ticker.
export const FWD_TICKERS = [['SPY', 'SPY', 'S&P 500 · market-wide'], ['IWM', 'IWM', 'Russell 2000 · small caps']];
export function renderForward(mmOrFw) {
  const byT = mmOrFw?.forward_by_ticker || (mmOrFw?.forward_iwm ? { IWM: mmOrFw.forward_iwm } : mmOrFw?.by_metric ? { IWM: mmOrFw } : null);
  if (!byT) return '';
  const cols = FWD_TICKERS.filter(([k]) => byT[k]?.by_metric);
  if (!cols.length) return '';
  const lead = byT[cols[0][0]];
  // Neutral field names (next1_/next5_); the older iwm_-prefixed names are still read so an old JSON renders.
  const g = (m, a, b) => (m ? (m[a] !== undefined ? m[a] : m[b]) : undefined);
  const n1 = (m) => g(m, 'next1_median_pct', 'iwm_next1_median_pct'), n5 = (m) => g(m, 'next5_median_pct', 'iwm_next5_median_pct'), up1 = (m) => g(m, 'next1_up_share_pct', 'iwm_next1_up_share_pct');
  const cell = (m, t) => `<td class="${signCls(n1(m))}" data-unit="%"${fin(up1(m)) ? ` title="${esc(t)} up the next day in ${fmtPct(up1(m))} of these sessions"` : ''}>${fmtPct(n1(m), 2, { sign: true })}</td>`;
  // Sample size per ticker (each ETF can lose sessions to missing closes separately). Sessions overlap, so the
  // non-overlapping count is shown beside it.
  const sample = (m) => (m && fin(m.n) ? `${grp(m.n)} days${fin(m.n_independent) ? ` · ${grp(m.n_independent)} non-overlapping` : ''}` : NA);
  const pair = (m, t) => `${cell(m, t)}<td class="${signCls(n5(m))}" data-unit="%">${fmtPct(n5(m), 2, { sign: true })}</td><td data-unit="days">${esc(sample(m))}</td>`;
  const rows = Object.entries(FWD_LABELS).filter(([k]) => lead.by_metric[k]).map(([k, [label, u]]) => {
    const m = lead.by_metric[k];
    const tv = u === '%' ? fmtPct(m.today_value) : cnt(m.today_value, 'stocks');
    const band = typeof m.band === 'string' && /^\d{1,3}-\d{1,3}$/.test(m.band) ? `${m.band.replace('-', '–')}%` : NA;
    return `<tr><th scope="row">${esc(label)}</th><td data-unit="${u}">${esc(tv)}</td><td class="${isExtreme(m.today_pct) ? 'ix-gold' : ''}" data-unit="%">${fmtPct(m.today_pct)}</td><td data-unit="%">${esc(band)}</td>${cols.map(([t]) => pair(byT[t].by_metric[k], t)).join('')}</tr>`;
  }).join('');
  const base = lead.baseline ? `<tr class="ix-fwd-base"><th scope="row">All sessions in span (baseline)</th><td></td><td></td><td></td>${cols.map(([t]) => pair(byT[t].baseline, t)).join('')}</tr>` : '';
  const grpHead = `<tr class="ix-fwd-grp"><th colspan="4"></th>${cols.map(([t, , d]) => `<th colspan="3" class="ix-fwd-tk"><b>${t}</b> <small>${esc(d)}</small></th>`).join('')}</tr>`;
  const subHead = `<tr><th class="l">Reading (latest session)</th><th>Today</th><th>2-yr<br>pctile</th><th>Same<br>band</th>${cols.map(() => '<th>Next day<br>median</th><th>Next 5 days<br>median</th><th>Past days<br>matched (n)</th>').join('')}</tr>`;
  return `<div class="tt-wrap ix-fwd-wrap"><table class="theme-table ix-fwd"><thead>${grpHead}${subHead}</thead><tbody>${rows}${base}</tbody></table></div>`;
}

// ---------- rotation ----------
export function renderRotation(flows) {
  const bs = [...(flows?.buckets || [])].filter((b) => fin(b.pct_aum)).sort((a, b) => b.pct_aum - a.pct_aum);
  if (!bs.length) return '';
  const max = Math.max(...bs.map((b) => Math.abs(b.pct_aum))) || 1;
  const weeks = flows.history_weeks || [];
  const rows = bs.map((b) => {
    const [name, tag] = bucketLabel(b.bucket);
    const w = (Math.abs(b.pct_aum) / max) * 50;    const pos = b.pct_aum >= 0;
    const hist = (b.history || []).slice(-8);
    const hm = Math.max(1, ...hist.map((h) => (fin(h.net_usd) ? Math.abs(h.net_usd) : 0)));
    // A week with no net flow reading is drawn as a flat neutral tick, never as a $0 green bar.
    const strip = hist.map((h, i) => `<i class="${!fin(h.net_usd) ? 'ix-s-na' : h.net_usd >= 0 ? 'ix-s-up' : 'ix-s-down'}${i === hist.length - 1 ? ' ix-s-now' : ''}" style="height:${fin(h.net_usd) ? Math.max(2, (Math.abs(h.net_usd) / hm) * 19).toFixed(1) : 2}px" title="Week to ${esc(fmtDay(h.as_of, { dow: false }))} MT: ${esc(fmtUsd(h.net_usd))}"></i>`).join('');
    const sumCounts = (o) => (o && typeof o === 'object' && Object.values(o).every(fin) ? Object.values(o).reduce((s, x) => s + x, 0) : null);
    const exN = sumCounts(b.excluded), flN = sumCounts(b.flagged);
    const tip = `${name}: ${cnt(b.fund_count, 'funds')}, ${fin(b.stale_count) ? `${grp(b.stale_count)} with no share update` : `no-share-update count ${NA}`}, ${fin(exN) ? `${grp(exN)} excluded` : `excluded ${NA}`}, ${fin(flN) ? `${grp(flN)} flagged` : `flagged ${NA}`} · start AUM ${fmtUsd(b.start_aum_usd, { sign: false })} · ex-flagged ${fmtUsd(b.net_ex_suspect_usd)}`;
    return `<div class="ix-rot-row" title="${esc(tip)}">
      <span class="ix-rot-name">${esc(name)}<span class="rot-tag">${esc(tag)}</span></span>
      <span class="ix-rot-bar"><span class="ix-rot-axis"></span><span class="ix-rot-fill ${pos ? 'ix-fill-up' : 'ix-fill-down'}" style="${pos ? 'left:50%' : `right:50%`};width:${w.toFixed(2)}%"></span></span>
      <span class="ix-rot-pct ${signCls(b.pct_aum)}">${fmtPct(b.pct_aum, 2, { sign: true })}</span>
      <span class="ix-rot-usd ${signCls(b.net_usd)}">${fmtUsd(b.net_usd)}</span>
      <span class="ix-rot-strip" aria-hidden="true">${strip}</span>
      <span class="ix-rot-4w ${signCls(b.net_4w_usd)}">${fmtUsd(b.net_4w_usd)}</span>
    </div>`;
  }).join('');
  return `<div class="ix-rot"><div class="ix-rot-row ix-rot-headrow"><span>Theme</span><span class="ix-rot-scale"><span>outflow</span><span>% of start AUM</span><span>inflow</span></span><span>% AUM</span><span>Net flow</span><span>Last 8 weeks${weeks.length ? ` · to ${fmtDay(weeks.at(-1), { dow: false })} MT` : ''}</span><span>4-week net</span></div>${rows}</div>`;
}

export function renderTopFlows(list, dir) {
  if (!list?.length) return '';
  const rows = list.map((f, i) => {
    const [theme] = bucketLabel(f.bucket);
    const chips = (Array.isArray(f.flags) ? f.flags : []).map((k) => { const [l, t] = FLAG_LABELS[k] || [k.replace(/_/g, ' '), '']; return `<span class="ix-chip" title="${esc(t)}">${esc(l)}</span>`; }).join('');
    return `<tr><td class="ix-rank">${i + 1}</td><th scope="row"><span class="ix-tk">${esc(f.ticker)}</span><span class="ix-fund">${esc(f.name || '')}</span></th><td class="ix-theme">${esc(theme)}</td><td class="${signCls(f.net_usd)}" data-unit="$">${fmtUsd(f.net_usd)}</td><td class="${signCls(f.pct_aum)}" data-unit="%">${fmtPct(f.pct_aum, 2, { sign: true })}</td><td data-unit="$">${fmtUsd(f.aum_usd, { sign: false })}</td><td class="ix-chips">${chips}</td></tr>`;
  }).join('');
  return `<div class="tt-wrap"><table class="theme-table ix-top ix-top-${dir}"><thead><tr><th>#</th><th class="l">${dir === 'in' ? 'Biggest inflows' : 'Biggest outflows'}</th><th class="l">Theme</th><th>Net flow</th><th>% of AUM</th><th>AUM</th><th class="l">Flags</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- fear/greed table ----------
export function renderComponents(fg) {
  const rows = (fg?.components || []).map((c) => {
    const ext = isExtreme(c.percentile_pct);
    return `<tr${ext ? ' class="ix-row-ext"' : ''}><th scope="row">${esc(c.label)}</th><td data-unit="${esc(c.unit)}">${esc(fmtUnit(c.value, c.unit))}</td><td>${esc(fmtDay(c.as_of))} MT</td><td class="ix-pct-cell">${pctBar(c.percentile_pct, { compact: true })}<span class="${ext ? 'ix-gold' : ''}">${fmtPct(c.percentile_pct)}</span></td><td>${esc(fmtUnit(c.window_min, c.unit))}</td><td>${esc(fmtUnit(c.window_median, c.unit))}</td><td>${esc(fmtUnit(c.window_max, c.unit))}</td><td data-unit="obs">${esc(cnt(c.window_n, 'obs'))}</td><td class="ix-freq">${esc(String(c.frequency || '').replace(/\s*\(.*\)$/, ''))}</td></tr>`;
  }).join('');
  return `<div class="tt-wrap"><table class="theme-table ix-fg"><thead><tr><th class="l">Component</th><th>Latest</th><th>Date</th><th>2-yr percentile</th><th>2-yr low</th><th>2-yr median</th><th>2-yr high</th><th>History</th><th class="l">Updates</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- page ----------
const card = (id, title, note, body, { right = '' } = {}) => `<section class="ix-card" id="${id}">
  <header class="ix-card-head"><div><h2>${title}</h2>${note ? `<p class="ix-note">${note}</p>` : ''}</div>${right ? `<div class="ix-card-right">${right}</div>` : ''}</header>${body}</section>`;
const info = (t) => `<span class="ix-i" tabindex="0" title="${esc(t)}">ⓘ</span>`;

// History lines (internals-series.json) are built for one internals.json snapshot. If the two stamps
// differ, say so in one line instead of silently pairing new headlines with old sparklines.
export function seriesLag(d, s) {
  if (!s) return `<p class="sb-meta ix-lag">History lines unavailable for this build; headline values are current.</p>`;
  if (s.internals_generated_at_mt && s.internals_generated_at_mt !== d?.meta?.generated_at_mt) return `<p class="sb-meta ix-lag">History lines and 1-week changes are from the ${fmtStamp(s.internals_generated_at_mt)} build; headline values are from ${fmtStamp(d?.meta?.generated_at_mt)}.</p>`;
  return '';
}

// One line: the historical span behind the after-similar-days table, and the overlap caveat. Never invented.
export function fwdSpanText(fw) {
  const sp = fw?.span;
  const yd = (d) => (fmtDay(d, { dow: false }) === NA ? NA : `${fmtDay(d, { dow: false })} ${String(d).slice(0, 4)}`);
  const range = sp && yd(sp.from) !== NA && yd(sp.to) !== NA ? `Sessions used: ${yd(sp.from)} to ${yd(sp.to)} MT (${cnt(sp.sessions, 'sessions')}).` : `Sessions used: ${NA}.`;
  return `${range} These samples overlap (a 5-session window starting on neighbouring sessions shares sessions), so the non-overlapping count is shown beside n.`;
}

export function renderInternals(d, s) {
  const m = d.meta || {};
  const mm = s?.market_monitor || null;
  const T = s?.tiles || {};
  const tiles = tileModels(d, s);
  const fl = d.flows || {};
  const tot = fl.total || {};
  const caveats = Array.isArray(fl.caveats) ? fl.caveats : [];
  const comps = d.feargreed?.components || [];
  const byId = Object.fromEntries(comps.map((c) => [c.id, c]));
  const extremes = comps.filter((c) => isExtreme(c.percentile_pct)).map((c) => `${COMPONENT_LABELS[c.id] || c.label} ${fmtPct(c.percentile_pct)}`);

  const head = `<header class="sb-head ix-head"><div>
      <div class="book-kicker">INTERNALS · BREADTH · FEAR / GREED · FLOWS · RAW, NO SCORES</div>
      <h1>Market internals</h1>
      <p class="sb-meta">Breadth &amp; fear/greed <b>${fmtDay(m.feargreed_as_of || m.breadth_as_of)} MT</b>${mm ? ` · Market Monitor <b>${fmtDay(mm.as_of)} MT</b>` : ''} · ETF flows week <b>${fmtDay(m.flows_week?.from, { dow: false })} → ${fmtDay(m.flows_week?.to, { dow: false })} MT</b> · built ${fmtStamp(m.generated_at_mt)} · dates are MT market days</p>${seriesLag(d, s)}
    </div>
    <div class="ix-head-right">${extremes.length ? `<span class="ix-ext-pill" title="Percentile at or below 5% or at or above 95% of its own ~2-year history">At a 2-yr extreme: ${esc(extremes.join(' · '))}</span>` : ''}</div>
  </header>`;

  const tileStrip = `<section class="ix-tiles" aria-label="Market mood at a glance">${tiles.map(renderTile).join('')}</section>`;

  const brModels = [
    ...BREADTH_IDS.filter((id) => byId[id]).map((id) => compModel(byId[id], T)),
    mmModel(mm, 't2108', 'T2108 · stocks above 40-day MA', '%', 'Share of the liquid universe closing above its 40-day simple moving average (Stockbee/Worden T2108 definition)'),
    mmModel(mm, 'up4', 'Stocks up 4%+ today', 'tickers', 'Close at least 4% above the prior close, on volume above the prior session and at least 100,000 shares'),
    mmModel(mm, 'down4', 'Stocks down 4%+ today', 'tickers', 'Close at least 4% below the prior close, on volume above the prior session and at least 100,000 shares'),
    mmModel(mm, 'ratio10', 'Up/down 4% ratio, 10-day', '×', 'Sum of up-4% counts over 10 sessions divided by the sum of down-4% counts'),
    mmModel(mm, 'ext_below2_pct', 'Stretched ≥2 ATR below 8EMA', '%', '(close − 8-day EMA) ÷ ATR14 at or below −2.0; share of liquid stocks trading $2M+ that day. Mean-reversion lens.'),
    mmModel(mm, 'ext_above2_pct', 'Stretched ≥2 ATR above 8EMA', '%', '(close − 8-day EMA) ÷ ATR14 at or above +2.0; share of liquid stocks trading $2M+ that day. Mean-reversion lens.'),
  ];
  const fwdLead = mm?.forward_by_ticker?.SPY || mm?.forward_by_ticker?.IWM || mm?.forward_iwm || null;
  const fwd = fwdLead ? `<div class="ix-mpanel"><h3>After similar days · mean-reversion lens <span class="ix-i" title="${esc(fwdLead.note || '')}">ⓘ</span></h3><p class="ix-note">Past sessions whose 2-yr percentile sat in the same 20-point band as the latest session, and what the index did next (close to close). SPY = market-wide; IWM = small caps. Raw medians; each ticker shows its own sample size. ${esc(fwdSpanText(fwdLead))} Hover a next-day cell for the share of up days.</p>${renderForward(mm)}</div>` : '';
  const breadth = `<section class="ix-card" id="ixBreadth"><header class="ix-card-head"><div><h2>Breadth</h2><p class="ix-note">Liquid universe: top 3,000 US common stocks by 20-day $ volume. Gold = 2-yr extreme (at or below the 5th or at or above the 95th percentile). <span class="ix-i" title="${esc(d.breadth?.universe_note || '')}">ⓘ</span></p></div></header>
    <div class="ix-breadth-top">${metricTable('Breadth components', brModels)}${fwd}</div>
    ${mm ? `<div class="ix-sub-head"><h3>Market Monitor · Stockbee-style, newest session on top <span class="ix-i" title="${esc((mm.universe_rule || '') + ' Definitions follow Stockbee’s published 2011 scan code; his sheet counts every common stock, so his numbers run higher.')}">ⓘ</span></h3><p class="ix-note">Counts are stocks. Tint = the larger side of each up/down pair (green when the up side is larger, a neutral highlight when the down side is larger; ratios: green above 1.00×, neutral below). Red is kept for negative values. Gold outline = 2-yr extreme for that column. Hover any cell for its percentile.</p></div>${renderMonitor(mm)}` : ''}
  </section>`;

  const used = new Set([...BREADTH_IDS, ...FG_GROUPS.flatMap(([, ids]) => ids)]);
  const groups = [...FG_GROUPS, ['Other', comps.map((c) => c.id).filter((id) => !used.has(id))]];
  const nBr = BREADTH_IDS.filter((id) => byId[id]).length;
  const fg = `<section class="ix-card" id="ixFearGreed"><header class="ix-card-head"><div><h2>Fear / greed components</h2><p class="ix-note">${comps.length} raw series (${nBr} of them under Breadth above), each vs its own ~2-year history. No composite. Change = vs 1 week ago (monthly series: 1 month).</p></div></header>
    <div class="ix-fg-grid">${groups.map(([g, ids]) => metricTable(g, ids.filter((id) => byId[id]).map((id) => compModel(byId[id], T)))).join('')}</div></section>`;

  const rotation = card('ixRotation', 'Rotation · weekly ETF net flows by theme',
    `Week ${fmtDay(m.flows_week?.from, { dow: false })} → ${fmtDay(m.flows_week?.to, { dow: false })} MT (Thu to Thu). All themes: <b class="${signCls(tot.net_usd)}">${fmtUsd(tot.net_usd)}</b> (${fmtPct(tot.pct_aum, 2, { sign: true })} of start AUM) ${fin(tot.fund_count) ? `across ${grp(tot.fund_count)} funds` : `(fund count ${NA})`}. Bars = % of start AUM. ${info(caveats.join(' '))}`,
    renderRotation(fl) || `<p class="ix-note">${NA}: no theme flow data in this build.</p>`);
  const topFlows = card('ixTopFlows', 'Biggest ETF flows · week', 'Same week, single funds. Hover a flag for what it means.',
    (renderTopFlows(fl.top_inflows, 'in') + renderTopFlows(fl.top_outflows, 'out')) || `<p class="ix-note">${NA}: no single-fund flow data in this build.</p>`);

  const defs = mm?.definitions ? Object.entries(mm.definitions).map(([k, v]) => `<li><b>${esc(k)}</b> — ${esc(v)}</li>`).join('') : '';
  const sources = `<details class="ix-card ix-fold" id="ixSources"><summary><h2>Sources &amp; definitions</h2><span class="ix-note">universe rules, flow caveats, Market Monitor definitions</span></summary>
    <div class="ix-defs"><div><h3>Breadth universe</h3><p>${esc(d.breadth?.universe_note || '')}</p><h3>ETF flows</h3><ul>${caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    <div><h3>Market Monitor &amp; 8EMA stretch</h3><p>${esc(mm?.universe_rule || '')}</p><ul>${defs}</ul></div></div></details>`;

  return `<div class="ix">${head}${tileStrip}${breadth}${fg}<div class="ix-grid2">${rotation}${topFlows}</div>${sources}</div>`;
}


// ---------- CSS (injected once; board tokens from styles.css + terminal-skin.css) ----------
export const CSS = `
.ix{--ix-dim:#cbc8c0;display:grid;gap:12px;padding:6px 0 24px}
.ix-head{align-items:flex-end}
.ix-head h1{margin:2px 0 4px;color:var(--text);font:800 26px/1.05 var(--sans)}
.ix-head-right{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.ix-ext-pill{border:1px solid var(--gold);color:var(--gold);background:rgba(228,183,110,.07);padding:5px 10px;border-radius:5px;font:700 12px/1.3 var(--mono)}
.ix-tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px}
@media (max-width:1699px){.ix-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:760px){.ix-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ix-tile{display:flex;flex-direction:column;gap:5px;min-width:0;padding:10px 12px 11px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.ix-tile-ext{border-color:rgba(228,183,110,.55);box-shadow:inset 3px 0 0 var(--gold)}
.ix-tile-mr{background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.ix-tile-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.ix-tile-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font:700 13px/1.25 var(--sans)}
.ix-tile-label .ix-i{font-size:11px}
.ix-tile-date{flex:none;color:var(--ix-dim);font:600 10.5px/1.2 var(--mono)}
.ix-tile-value{color:var(--text);font:800 28px/1.05 var(--mono);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.ix-delta{color:var(--ix-dim);font:600 11.5px/1.3 var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ix-delta b{color:var(--text);font-weight:700}
.ix-spark{display:block;width:100%;height:44px;margin:2px 0}
.ix-spark-line{fill:none;stroke:#8fb4d8;stroke-width:1.6}
.ix-spark-area{fill:rgba(143,180,216,.10)}
.ix-spark-dot{fill:var(--text);stroke:none}
.ix-spark-empty{height:44px}
.ix-tile-pct{display:flex;align-items:center;gap:8px}
.ix-pbar{position:relative;flex:1;display:inline-block;height:6px;min-width:60px;border-radius:3px;background:linear-gradient(90deg,var(--panel-2),#2c3237 50%,var(--panel-2));border:1px solid var(--line)}
.ix-pbar::before,.ix-pbar::after{content:"";position:absolute;top:-1px;bottom:-1px;width:1px;background:var(--line-bright)}
.ix-pbar::before{left:25%}.ix-pbar::after{left:75%}
.ix-pbar i{position:absolute;top:-4px;width:3px;height:12px;margin-left:-1.5px;border-radius:1px;background:var(--text)}
.ix-pbar-ext i{background:var(--gold);box-shadow:0 0 0 2px rgba(228,183,110,.25)}
.ix-pbar-compact{min-width:90px;max-width:140px}
.ix-pct-num{flex:none;color:var(--text);font:700 13px/1 var(--mono)}
.ix-pct-num small{color:var(--ix-dim);font:600 11px/1 var(--mono)}
.ix-tile-range,.ix-tile-sub{color:var(--ix-dim);font:600 11px/1.35 var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ix-tile-sub{color:var(--text-1);border-top:1px solid var(--line);padding-top:6px;margin-top:1px}
.ix-gold{color:var(--gold)!important}
.ix-card{min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:12px 14px 14px}
.ix-card-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}
.ix-card h2,.ix-fold summary h2{margin:0;color:var(--text);font:800 17px/1.2 var(--sans)}
.ix-sub-head{margin:16px 0 8px}
.ix-sub-head h3,.ix-defs h3{margin:0;color:var(--text);font:700 12px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase}
.ix-note{margin:4px 0 0;color:var(--ix-dim);font:500 13px/1.45 var(--sans)}
.ix-note b{font-family:var(--mono)}
.ix-i{display:inline-block;margin-left:2px;color:var(--ix-dim);cursor:help;font:600 13px/1 var(--sans)}
.ix-i:hover,.ix-i:focus-visible{color:var(--text)}
.ix .tt-wrap{border-radius:6px}
.ix .theme-table th,.ix .theme-table td{padding:6px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line-mid)}
.ix .theme-table thead th{padding:7px 10px;color:var(--ix-dim);font:700 11.5px/1.25 var(--mono);letter-spacing:.04em;vertical-align:bottom}
.ix .theme-table thead th small{display:block;color:var(--ix-dim);font:600 10px/1.2 var(--mono);letter-spacing:0;text-transform:none}
.ix .theme-table th.l,.ix .theme-table tbody th{text-align:left}
.ix .theme-table tbody th{color:var(--text);font:700 12.5px/1.3 var(--mono)}
.ix .theme-table tbody tr:hover{background:var(--hover)}
.ix-mm{font-size:13px}
.ix-mm thead th.ix-mm-grp{text-align:center;color:var(--text);border-left:1px solid var(--line-bright);border-bottom:1px solid var(--line)}
.ix-mm thead tr:nth-child(2) th{border-left:1px solid transparent}
.ix-mm thead th.ix-mm-date{text-align:left}
.ix-mm tbody td{font-weight:700;color:var(--text)}
.ix-mm tbody td:nth-child(2),.ix-mm tbody td:nth-child(4),.ix-mm tbody td:nth-child(6),.ix-mm tbody td:nth-child(8),.ix-mm tbody td:nth-child(12),.ix-mm tbody td:nth-child(14),.ix-mm tbody td:nth-child(15),.ix-mm tbody td:nth-child(17){border-left:1px solid var(--line-bright)}
.ix-mm thead tr:nth-child(2) th:nth-child(1),.ix-mm thead tr:nth-child(2) th:nth-child(3),.ix-mm thead tr:nth-child(2) th:nth-child(5),.ix-mm thead tr:nth-child(2) th:nth-child(7),.ix-mm thead tr:nth-child(2) th:nth-child(11),.ix-mm thead tr:nth-child(2) th:nth-child(13),.ix-mm thead tr:nth-child(2) th:nth-child(14){border-left:1px solid var(--line-bright)}
.ix-mm .ix-mm-uni{border-left:1px solid var(--line-bright)}
.ix-mm td.ix-tint-up{background:rgba(139,197,170,.13);color:var(--green-hi)}
.ix-mm td.ix-tint-flat{background:rgba(240,238,232,.10);color:var(--text)}
.ix-mm td.ix-ext{color:var(--gold)!important;box-shadow:inset 0 0 0 1px rgba(228,183,110,.7)}
.ix-mm tr.ix-mm-latest th,.ix-mm tr.ix-mm-latest td{border-bottom:2px solid var(--line-bright)}
.ix-mm tr.ix-mm-latest th{color:var(--text)}
.ix-fwd{font-size:12.5px}
.ix .ix-fwd tr.ix-fwd-grp th{border-bottom:1px solid var(--line);text-align:center;color:var(--text)}
.ix .ix-fwd th.ix-fwd-tk{border-left:1px solid var(--line-bright)}
.ix-fwd th.ix-fwd-tk small{color:var(--ix-dim);font-weight:600}
.ix-fwd tbody td:nth-child(5),.ix-fwd tbody td:nth-child(8){border-left:1px solid var(--line-bright)}
.ix-fwd-wrap{max-width:1280px}
.ix-fwd td{color:var(--text)}
.ix-fwd tr.ix-fwd-base th,.ix-fwd tr.ix-fwd-base td{border-top:1px solid var(--line-bright);color:var(--ix-dim)}
.ix-pos{color:var(--green-hi)!important}
.ix-neg{color:var(--red-hi)!important}
.ix-grid2{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:12px;align-items:start}
@media (max-width:1859px){.ix-grid2{grid-template-columns:minmax(0,1fr)}}
.ix-rot{display:grid;gap:0;font:600 12.5px/1.2 var(--mono)}
.ix-rot-row{display:grid;grid-template-columns:minmax(150px,1.25fr) minmax(160px,2fr) 72px 82px 120px 82px;align-items:center;gap:10px;padding:1px 4px;border-bottom:1px solid var(--line-mid);color:var(--text)}
.ix-rot-row:hover{background:var(--hover)}
.ix-rot-headrow{color:var(--ix-dim);font:700 11.5px/1.2 var(--mono);letter-spacing:.04em;border-bottom:1px solid var(--line-bright);padding-bottom:6px}
.ix-rot-headrow>span:nth-child(n+3){text-align:right}
.ix-rot-scale{display:flex;justify-content:space-between}
.ix-rot-name{display:flex;align-items:center;justify-content:space-between;gap:6px;font:700 13px/1.2 var(--sans);white-space:nowrap;overflow:hidden}
.ix-rot-name .rot-tag{flex:none;margin-left:0;color:var(--ix-dim);font-size:9.5px}
.ix-rot-bar{position:relative;height:16px}
.ix-rot-axis{position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--line-bright)}
.ix-rot-fill{position:absolute;top:2px;height:12px;border-radius:2px}
.ix-fill-up{background:linear-gradient(90deg,rgba(139,197,170,.55),var(--green-hi))}
.ix-fill-down{background:linear-gradient(270deg,rgba(232,147,145,.55),var(--red-hi))}
.ix-rot-pct,.ix-rot-usd,.ix-rot-4w{text-align:right;font-variant-numeric:tabular-nums}
.ix-rot-strip{display:flex;align-items:flex-end;justify-content:flex-end;gap:3px;height:21px;padding-top:1px}
.ix-rot-strip i{display:inline-block;width:10px;min-height:2px;border-radius:1px 1px 0 0;opacity:.8}
.ix-rot-strip i.ix-s-now{opacity:1;outline:1px solid var(--line-bright)}
.ix-s-up{background:var(--green-hi)}.ix-s-down{background:var(--red-hi)}.ix-s-na{background:var(--ix-dim)}
.ix-top{font-size:12.5px}
.ix-top + .ix-top,.tt-wrap + .tt-wrap{margin-top:10px}
.ix-top .ix-rank{color:var(--ix-dim);width:28px}
.ix-top .ix-tk{display:inline-block;min-width:52px;color:var(--text);font-weight:800}
.ix-top .ix-fund{display:inline-block;max-width:190px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;color:var(--ix-dim);font:500 12px/1.3 var(--sans)}
.ix .theme-table td.ix-theme{text-align:left;color:var(--text-1);font:600 12px/1.3 var(--sans)}
.ix .ix-chips{text-align:left!important;white-space:normal;min-width:84px}
.ix-chip{margin-bottom:2px}
.ix-mpanel h3 .ix-h3-date{float:right;color:var(--ix-dim);font:600 11px/1.3 var(--mono);letter-spacing:0;text-transform:none}
.ix-lag{color:var(--text)!important}
.ix-metrics th .ix-asof{white-space:nowrap;color:var(--ix-dim);font:600 10.5px var(--mono);margin-left:4px}
.ix-chip{display:inline-block;margin-right:4px;padding:1px 6px;border:1px solid var(--line-bright);border-radius:4px;color:var(--ix-dim);font:600 10.5px/1.4 var(--mono)}
.ix-fold{padding:0}
.ix-fold summary{display:flex;align-items:baseline;gap:14px;padding:12px 14px;cursor:pointer;list-style:none}
.ix-fold summary::-webkit-details-marker{display:none}
.ix-fold summary::before{content:"▸";color:var(--text);font:700 13px/1 var(--mono)}
.ix-fold[open] summary::before{content:"▾"}
.ix-fold summary .ix-note{margin:0}
.ix-fold > .tt-wrap,.ix-fold > .ix-defs{margin:0 14px 14px}
.ix-fg td{color:var(--text)}
.ix-fg .ix-pct-cell{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.ix-fg tr.ix-row-ext th{color:var(--gold)}
.ix-fg .ix-freq{text-align:left;color:var(--ix-dim)}
.ix-defs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;color:var(--ix-dim);font:500 13px/1.5 var(--sans)}
.ix-defs p{margin:6px 0 12px}
.ix-defs ul{margin:6px 0 12px;padding-left:18px}
.ix-defs b{color:var(--text);font-family:var(--mono);font-weight:700}
@media (max-width:1099px){.ix-defs{grid-template-columns:1fr}.ix-rot-row{grid-template-columns:minmax(120px,1fr) minmax(120px,1.4fr) 64px 76px 0 76px}.ix-rot-strip{display:none}}
`;

export const CSS2 = `
.ix-breadth-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,880px),1fr));gap:14px;align-items:start;margin-bottom:6px}
.ix-fg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,880px),1fr));gap:14px;align-items:start}
.ix-mpanel h3{margin:0 0 7px;color:var(--text);font:700 12px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase}
.ix-mpanel .ix-note{margin:-2px 0 8px}
.ix-mpanel .ix-i{font-size:12px;letter-spacing:0}
.ix-metrics{font-size:12.5px}
.ix .ix-metrics tbody th{font:600 13px/1.25 var(--sans);white-space:normal;min-width:150px;max-width:210px}
.ix-metrics td{color:var(--text)}
.ix-metrics td.ix-m-val{font-weight:800;font-size:13.5px}
.ix-metrics td.ix-m-chg{color:var(--text-1)}
.ix-metrics td.ix-m-chg small,.ix-metrics td.ix-m-date{color:var(--ix-dim);font-size:11px}
.ix-metrics td.ix-m-range{color:var(--text-1);font-size:11.5px}
.ix .ix-metrics td.ix-m-spark{padding:2px 6px;width:110px}
.ix-metrics .ix-spark{width:110px;height:26px;margin:0}
.ix-metrics td.ix-pct-cell .ix-pbar{display:inline-block;flex:none;width:60px;min-width:60px;vertical-align:middle;margin-right:8px}
.ix-pct-v{display:inline-block;min-width:44px;text-align:right;font-weight:700}
.ix-metrics tr.ix-row-ext{background:rgba(228,183,110,.05)}
.ix-metrics tr.ix-row-ext th{box-shadow:inset 3px 0 0 var(--gold)}
@media (max-width:1499px){.ix .ix-mm th,.ix .ix-mm td{padding:5px 6px}.ix-mm{font-size:12px}}
@media (max-width:1399px){.ix .ix-mm th,.ix .ix-mm td{padding:4px 4px}.ix-mm{font-size:11.5px}.ix .ix-mm thead th{white-space:normal}}
`;

export async function mountInternals(host) {
  if (!host) return;
  if (!document.getElementById('internalsTabCss')) {
    const st = document.createElement('style'); st.id = 'internalsTabCss'; st.textContent = CSS + CSS2; document.head.appendChild(st);
  }
  const get = (p) => fetch(p, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); });
  const [d, s] = await Promise.all([get('./data/internals.json'), get('./data/internals-series.json').catch(() => null)]);
  if (!d?.meta || !d.flows || !d.breadth || !d.feargreed) throw new Error('internals.json is missing a section');
  host.innerHTML = renderInternals(d, s);
}
