// GAMMA tab (V2.17.0). Self-wiring ES module: <script type="module" src="./gamma-tab.mjs?v=V2.17.0">.
// Reads ./data/gamma.json (contract: builds/gamma/SCHEMA.md). Raw primitives only: no scores, no grades, no calls.
// Copies: SqueezeMetrics (index GEX + DIX regime), SpotGamma / MenthorQ (key levels), Barchart / Unusual Whales
// (gamma by strike, expiry + volume-vs-OI toggles), Unusual Whales / Quant Data (cross-ticker heat table).
// Mean-reversion lens: stretch ×ATR vs dealer gamma, stretch ÷ option-implied move, wall distance in ×ATR.
// Pure render functions are exported so node tests can check the display laws.

export const VERSION = 'V2.17.0';
export const NA = 'n/a';
export const EXTREME_LO = 5;
export const EXTREME_HI = 95;
const MINUS = '−';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const num = (x) => (fin(x) ? x : null);
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const signed = (s, x) => (x > 0 ? '+' : x < 0 ? MINUS : '') + s;
const grp = (x, d = 0) => Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- number formats (every number unit-marked; missing = n/a) ----------
export function fmtUsd(x, { sign = true } = {}) {
  if (!fin(x)) return NA;
  const a = Math.abs(x);
  const body = a >= 1e12 ? `$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return sign ? signed(body, x) : (x < 0 ? MINUS : '') + body;
}
export function fmtPx(x) {
  if (!fin(x)) return NA;
  return `${x < 0 ? MINUS : ''}$${grp(x, Math.abs(x) < 1 ? 4 : 2)}`;
}
export function fmtStrike(k) {
  if (!fin(k)) return NA;
  return `$${grp(k, Number.isInteger(k) ? 0 : Number.isInteger(k * 10) ? 1 : 2)}`;
}
export function fmtPct(x, d = 1, { sign = false } = {}) {
  if (!fin(x)) return NA;
  const body = `${grp(x, d)}%`;
  return sign ? signed(body, x) : `${x < 0 ? MINUS : ''}${body}`;
}
export function fmtX(x, { sign = false, d = null, atr = false } = {}) {
  if (!fin(x)) return NA;
  const dd = d ?? (Math.abs(x) >= 10 ? 1 : 2);
  const body = `${grp(x, dd)}×${atr ? ' ATR' : ''}`;
  return sign ? signed(body, x) : `${x < 0 ? MINUS : ''}${body}`;
}
export function fmtCount(x, noun = 'contracts') {
  if (!fin(x)) return NA;
  const a = Math.abs(x);
  const b = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K` : grp(a);
  return `${x < 0 ? MINUS : ''}${b}${noun ? ' ' + noun : ''}`;
}

// ---------- dates (MT) ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (iso) => { if (typeof iso !== 'string' || !DAY_RE.test(iso)) return false; const d = new Date(`${iso}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };
function denverParts(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
export function parseInstant(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) || !validDay(s.slice(0, 10))) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}
// "2026-09-30" -> "Wed Sep 30" (a market day; callers add MT)
export function fmtDay(iso, { dow = true } = {}) {
  let day = iso;
  if (typeof iso === 'string' && iso.includes('T')) { const t = parseInstant(iso); if (!t) return NA; day = denverParts(t).day; }
  if (!validDay(day)) return NA;
  const d = new Date(`${day}T12:00:00Z`);
  return `${dow ? DOW[d.getUTCDay()] + ' ' : ''}${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
// ISO instant -> "Oct 1, 14:25 MT"
export function fmtStamp(s) {
  const t = parseInstant(s);
  if (!t) return NA;
  const p = denverParts(t);
  return `${fmtDay(p.day, { dow: false })}, ${p.hm} MT`;
}
export function fmtHM(s) { const t = parseInstant(s); return t ? `${denverParts(t).hm} MT` : NA; }

// ---------- percentiles / extremes ----------
export const pctOk = (p) => fin(p) && p >= 0 && p <= 100;
export const isExtreme = (p) => pctOk(p) && (p <= EXTREME_LO || p >= EXTREME_HI);
export function pctBar(p) {
  if (!pctOk(p)) return '<span class="gx-pbar gx-pbar-none"></span>';
  return `<span class="gx-pbar" title="Percentile ${fmtPct(p)} vs its own 2-year history (mid-rank, 504 sessions)"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span>`;
}

// ---------- validation ----------
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export function validate(doc) {
  if (!isObj(doc)) return 'not an object';
  if (doc.v !== 1) return `unknown version ${esc(doc.v)}`;
  if (!Array.isArray(doc.tickers)) return 'tickers is not a list';
  const ok = doc.tickers.filter((t) => isObj(t) && typeof t.t === 'string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.t));
  if (!ok.length) return 'no valid tickers';
  if (doc.index_regime != null && !isObj(doc.index_regime)) return 'index_regime is not an object';
  return '';
}
export function tickersOf(doc) {
  return (Array.isArray(doc?.tickers) ? doc.tickers : []).filter((t) => isObj(t) && typeof t.t === 'string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.t));
}
const strikesOf = (t) => (Array.isArray(t?.strikes) ? t.strikes.filter((r) => isObj(r) && fin(r.k)).sort((a, b) => a.k - b.k) : []);

// ---------- state ----------
export const CAPS = ['ALL', 'SMALL', 'MID', 'LARGE'];
export function defaultState() {
  return { sel: null, exp: 'all', metric: 'gex', mode: 'split', sort: { k: 'absx', dir: -1 }, cap: 'ALL', w: 1880, chartW: 620, lensW: 1100 };
}
const callShare = (t) => (fin(t.dvol_call_pct) && fin(t.dvol_pct) && t.dvol_pct > 0 ? (t.dvol_call_pct / t.dvol_pct) * 100 : null);

// ---------- positioning table columns ----------
// tint: 'sign' (green +, red −, by |v| ÷ scale), 'center' (vs a center value), 'logx' (ratio vs 1×), 'median' (vs the column median), null
export const COLS = [
  { k: 't', label: 'Ticker', sub: '', get: (t) => t.t, tint: null },
  { k: 'stretch_x', label: 'Stretch', sub: '×ATR vs 8EMA', get: (t) => num(t.stretch_x), fmt: (v) => fmtX(v, { sign: true }), tint: 'sign', scale: 3 },
  { k: 'net_gex', label: 'Net GEX', sub: '$ per 1%', get: (t) => num(t.net_gex), fmt: (v) => fmtUsd(v), tint: 'signflat' },
  { k: 'gex_per_dv20_pct', label: 'GEX ÷ $vol', sub: '% of 20D $vol', get: (t) => num(t.gex_per_dv20_pct), fmt: (v) => fmtPct(v, 1, { sign: true }), tint: 'sign', scale: 12 },
  { k: 'flip_dist_pct', label: 'Spot vs flip', sub: '%', get: (t) => num(t.flip_dist_pct), fmt: (v) => fmtPct(v, 1, { sign: true }), tint: 'sign', scale: 6 },
  { k: 'call_wall_dist_x', label: 'Call wall', sub: '×ATR from spot', get: (t) => num(t.call_wall_dist_x), fmt: (v) => fmtX(v, { sign: true }), tint: 'sign', scale: 4 },
  { k: 'put_wall_dist_x', label: 'Put wall', sub: '×ATR from spot', get: (t) => num(t.put_wall_dist_x), fmt: (v) => fmtX(v, { sign: true }), tint: 'sign', scale: 4 },
  { k: 'ndoi_pct', label: 'NDOI', sub: '% shares out', get: (t) => num(t.ndoi_pct), fmt: (v) => fmtPct(v, 1, { sign: true }), tint: 'sign', scale: 10 },
  { k: 'dvol_pct', label: 'Δ-adj opt vol', sub: '% stock vol', get: (t) => num(t.dvol_pct), fmt: (v) => fmtPct(v, Math.abs(v) < 10 ? 1 : 0), tint: 'median' },
  { k: 'call_share', label: 'Call share', sub: '% of Δ-adj vol', get: callShare, fmt: (v) => fmtPct(v, 0), tint: 'center', center: 50, scale: 35 },
  { k: 'vol_oi_x', label: 'Vol ÷ OI', sub: '×', get: (t) => num(t.vol_oi_x), fmt: (v) => fmtX(v, { d: Math.abs(v) < 0.1 ? 3 : 2 }), tint: 'median' },
  { k: 'cp_vol_x', label: 'C/P vol', sub: '×', get: (t) => num(t.cp_vol_x), fmt: (v) => fmtX(v), tint: 'logx', scale: Math.log(3) },
  { k: 'iv_atm_pct', label: 'ATM IV', sub: '%', get: (t) => num(t.iv_atm_pct), fmt: (v) => fmtPct(v, 1), tint: 'median' },
  { k: 'imove_1d_pct', label: 'Implied move', sub: '% 1-day', get: (t) => num(t.imove_1d_pct), fmt: (v) => `±${fmtPct(v, 2)}`, tint: 'median' },
  { k: 'stretch_vs_imove_x', label: 'Stretch ÷ impl.', sub: '× implied 1-day', get: (t) => num(t.stretch_vs_imove_x), fmt: (v) => fmtX(v, { sign: true }), tint: 'sign', scale: 6 },
  { k: 'coverage_pct', label: 'Coverage', sub: '% of OI', get: (t) => num(t.coverage_pct), fmt: (v) => fmtPct(v, 0), tint: null },
];
const COL = Object.fromEntries(COLS.map((c) => [c.k, c]));

export function sortRows(rows, sort) {
  const k = sort?.k || 'absx', dir = sort?.dir === 1 ? 1 : -1;
  const get = k === 'absx' ? (t) => (fin(t.stretch_x) ? Math.abs(t.stretch_x) : null) : COL[k]?.get || ((t) => t[k]);
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    const na = va == null || (typeof va === 'number' && !fin(va)), nb = vb == null || (typeof vb === 'number' && !fin(vb));
    if (na || nb) return na === nb ? a.t.localeCompare(b.t) : na ? 1 : -1; // missing values always last
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb) || a.t.localeCompare(b.t);
  });
}
export function filterCap(rows, cap) {
  if (!cap || cap === 'ALL') return rows;
  return rows.filter((t) => t.kind !== 'index' && t.bkt === cap);
}

function tintStyle(col, v, med) {
  if (!fin(v) || !col.tint) return '';
  let s;
  if (col.tint === 'signflat') s = v === 0 ? 0 : Math.sign(v) * 0.55;
  else if (col.tint === 'sign') s = v / col.scale;
  else if (col.tint === 'center') s = (v - col.center) / col.scale;
  else if (col.tint === 'logx') s = v > 0 ? Math.log(v) / col.scale : -1;
  else if (col.tint === 'median') s = fin(med) && med > 0 ? Math.log(Math.max(v, 1e-9) / med) / Math.log(3) : 0;
  else return '';
  s = Math.max(-1, Math.min(1, s));
  if (Math.abs(s) < 0.08) return ''; // muted near zero / near the center
  const m = Math.abs(s), lv = Math.min(5, 1 + Math.floor(m * 5)); // palette D4 (Oct 1 2026): colour lives in CSS
  return ` class="gx-t gx-k-${col.tint} ${s > 0 ? 'gx-tp' : 'gx-tn'} gx-l${lv}" style="--gx-s:${m.toFixed(3)}"`;
}
const median = (arr) => { const v = arr.filter(fin).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const signCls = (x) => (!fin(x) || x === 0 ? '' : x > 0 ? 'gx-pos' : 'gx-neg');

// ---------- sparkline ----------
export function sparkSvg(vals, { w = 260, h = 46, label = '', fmt = (v) => String(v), zero = false } = {}) {
  const v = vals.filter((p) => fin(p.value));
  if (v.length < 2) return '<div class="gx-spark gx-spark-empty"></div>';
  const ys = v.map((p) => p.value);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const rg = hi - lo || 1;
  const X = (i) => (i * (w - 4)) / (v.length - 1) + 2, Y = (x) => h - 4 - ((x - lo) / rg) * (h - 8);
  const line = v.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${X(v.length - 1).toFixed(1)} ${h} L${X(0).toFixed(1)} ${h} Z`;
  const zl = zero && lo < 0 && hi > 0 ? `<line class="gx-spark-zero" x1="0" x2="${w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" vector-effect="non-scaling-stroke"/>` : '';
  const t = `${label}${label ? ' · ' : ''}${v.length} sessions ${fmtDay(v[0].date, { dow: false })} to ${fmtDay(v.at(-1).date, { dow: false })} (MT): low ${fmt(Math.min(...ys))}, high ${fmt(Math.max(...ys))}`;
  return `<svg class="gx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(t)}"><title>${esc(t)}</title><path class="gx-spark-area" d="${area}"/>${zl}<path class="gx-spark-line" d="${line}" vector-effect="non-scaling-stroke"/><circle class="gx-spark-dot" cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v.at(-1).value).toFixed(1)}" r="2.6"/></svg>`;
}

// ---------- 1. header ----------
export function renderHeader(doc) {
  const fixture = /FIXTURE/i.test(doc.source || '');
  return `<header class="gx-head">
    <div class="gx-head-main">
      <div class="gx-kicker">MARKET · GAMMA</div>
      <h1>Dealer gamma &amp; options positioning</h1>
      <p class="gx-explain">How much stock options dealers would buy or sell as price moves, from open interest and greeks. Positive net GEX: their hedging leans against moves. Negative: it adds to them.</p>
      <p class="gx-stamps">${doc.levels_for_session ? `Levels for <b>${esc(fmtDay(doc.levels_for_session))}</b>${doc.expired_excluded ? ' (expired contracts removed)' : ''} · ` : ''}OI as of <b>${esc(fmtDay(doc.oi_asof))} close</b> (prior session) · volume &amp; spot as of <b>${esc(fmtDay(doc.vol_asof))}</b>, spot <b>${esc(fmtHM(doc.spot_asof))}</b> · built <b>${esc(fmtStamp(doc.built_at))}</b> · market days are MT dates</p>
    </div>
    <div class="gx-caveat" role="note"><b>Assumption</b> ${esc(doc.convention || NA)}</div>
  </header>${fixture ? `<div class="gx-fixture" role="alert"><b>FIXTURE DATA</b> · ${esc(doc.source)}</div>` : ''}`;
}

// ---------- 2. index regime (SqueezeMetrics) ----------
function regimeCard({ id, label, value, pct, lo, hi, spark, sub, fmt, date }) {
  const ext = isExtreme(pct);
  return `<article class="gx-card gx-reg${ext ? ' gx-ext' : ''}" data-gx-reg="${id}">
    <header class="gx-card-top"><span class="gx-card-label">${esc(label)}</span><span class="gx-card-date">${esc(fmtDay(date, { dow: false }))} MT</span></header>
    <div class="gx-big">${esc(value)}</div>
    <div class="gx-pct">${pctBar(pct)}<span class="gx-pct-num">${pctOk(pct) ? fmtPct(pct) : NA}<small> 2-yr pctile</small></span></div>
    <div class="gx-range">2-yr range ${esc(fmt(lo))} to ${esc(fmt(hi))}</div>
    ${spark}
    <div class="gx-card-sub">${sub}</div>
  </article>`;
}
export function renderRegime(ir) {
  if (!isObj(ir)) return `<article class="gx-card gx-reg"><p class="gx-note">${NA}: no index regime row in this build.</p></article>`;
  const hist = (Array.isArray(ir.hist) ? ir.hist : []).filter((r) => Array.isArray(r) && validDay(r[0]));
  const usdB = (v) => fmtUsd(v, { sign: false });
  return regimeCard({ id: 'gex', label: 'S&P 500 GEX', value: usdB(ir.gex_usd), pct: ir.gex_pctl2y, lo: ir.gex_lo2y, hi: ir.gex_hi2y, date: ir.date, fmt: usdB,
    spark: sparkSvg(hist.map((r) => ({ date: r[0], value: r[1] })), { label: 'S&P 500 GEX, 60 sessions', fmt: usdB, zero: true }),
    sub: `$ of S&amp;P delta per 1% move · SqueezeMetrics · S&amp;P 500 ${esc(fmtPx(ir.spx))}` })
    + regimeCard({ id: 'dix', label: 'DIX · dark-pool buy share', value: fmtPct(ir.dix_pct, 1), pct: ir.dix_pctl2y, lo: ir.dix_lo2y, hi: ir.dix_hi2y, date: ir.date, fmt: (v) => fmtPct(v, 1),
      spark: sparkSvg(hist.map((r) => ({ date: r[0], value: r[2] })), { label: 'DIX, 60 sessions', fmt: (v) => fmtPct(v, 1) }),
      sub: 'Short volume ÷ total volume in dark pools, S&amp;P 500 names, as % · SqueezeMetrics' });
}

// ---------- 3. key levels (SpotGamma / MenthorQ) ----------
const kv = (k, v, extra = '', cls = '', title = '') => `<div class="gx-kv"${title ? ` title="${esc(title)}"` : ''}><span class="gx-k">${k}</span><span class="gx-v ${cls}">${v}</span><span class="gx-x">${extra}</span></div>`;
function gatedNote(all) {
  const g = (all || []).filter((t) => t && t.greeks_ok === false);
  if (!g.length) return '';
  return `<p class="gx-note gx-gated" role="note"><b>Greeks withheld</b> (gamma, flip, IV and NDOI shown as n/a; walls and OI still shown): ${g.map((t) => `${esc(t.t)} · ${esc(t.quality_note || 'failed quality gate')}`).join('; ')}.</p>`;
}

export function renderLevelCard(t, selected) {
  return `<article class="gx-card gx-lvl${selected ? ' gx-sel' : ''}" data-gx-t="${esc(t.t)}" tabindex="0" role="button" aria-pressed="${selected ? 'true' : 'false'}" title="Show ${esc(t.t)} gamma by strike">
    <header class="gx-card-top"><span class="gx-card-tk">${esc(t.t)}</span><span class="gx-card-name">${esc(t.name || '')}</span></header>
    <div class="gx-lvl-hero"><span class="gx-big">${esc(fmtPx(t.spot))}</span><span class="gx-hero-gex ${signCls(t.net_gex)}" title="Net GEX, $ per 1% move">${esc(fmtUsd(t.net_gex))}<small> net GEX / 1%</small></span></div>
    ${kv('Flip', esc(fmtStrike(t.flip)), fin(t.flip) ? `${esc(fmtPct(t.flip_dist_pct, 1, { sign: true }))} · ${esc(fmtX(t.flip_dist_x, { sign: true, atr: true }))}` : 'none in range', '', 'Zero-gamma level: spot price where re-priced total net GEX crosses 0 (nearest to spot). Spot vs flip in % and ×ATR')}
    ${kv('Call wall', esc(fmtStrike(t.call_wall)), esc(fmtX(t.call_wall_dist_x, { sign: true, atr: true })), '', 'Strike at or above spot with the largest call GEX (searched within ±10% of spot for index ETFs, ±25% for singles); distance from spot in ×ATR')}
    ${kv('Put wall', esc(fmtStrike(t.put_wall)), esc(fmtX(t.put_wall_dist_x, { sign: true, atr: true })), '', 'Strike at or below spot with the largest |put GEX| (searched within ±10% of spot for index ETFs, ±25% for singles); distance from spot in ×ATR')}
    ${kv('Abs-γ strike', esc(fmtStrike(t.abs_strike)), `${esc(fmtPct(t.abs_strike_share_pct, 1))} of |GEX|`, '', 'Strike with the largest Σ|GEX| (searched within ±10% of spot for index ETFs, ±25% for singles); its share of all |GEX|')}
    ${kv('Nearest exp', esc(fmtDay(t.near_exp, { dow: false })), `${esc(fmtPct(t.near_share_pct, 1))} of |GEX|`, '', 'Nearest expiry with OI; its share of all |GEX|')}
    ${kv('ATM IV', esc(fmtPct(t.iv_atm_pct, 1)), `1-day ±${esc(fmtPct(t.imove_1d_pct, 2))}`, '', 'ATM implied vol (expiry nearest 30 days) and implied 1-day move = IV ÷ √252')}
    ${kv('Stretch', esc(fmtX(t.stretch_x, { sign: true, atr: true })), `${esc(fmtX(t.stretch_vs_imove_x, { sign: true }))} impl. move`, signCls(t.stretch_x), '(close − 8EMA) ÷ ATR14, and the same stretch in implied 1-day moves')}
  </article>`;
}

// ---------- 4. gamma by strike (Barchart / Unusual Whales) ----------
export const METRICS = { gex: 'GEX', oi: 'OI', vol: 'Volume' };
function strikeValues(t, st, s) {
  const near = s.exp === 'near' && s.metric === 'gex';
  return st.map((r) => {
    let c, p;
    if (s.metric === 'oi') { c = num(r.coi); p = fin(r.poi) ? -r.poi : null; }
    else if (s.metric === 'vol') { c = num(r.cv); p = fin(r.pv) ? -r.pv : null; }
    else { c = num(near ? r.cg_near : r.cg); p = num(near ? r.pg_near : r.pg); }
    return { k: r.k, c, p, net: fin(c) || fin(p) ? (c || 0) + (p || 0) : null, r };
  });
}
const fmtMetric = (v, metric, sign = true) => (metric === 'gex' ? fmtUsd(v, { sign }) : fmtCount(sign ? v : Math.abs(v)));
function placeTags(tags, top, bottom, gap) {
  tags.sort((a, b) => a.y - b.y);
  for (let i = 0; i < tags.length; i++) { tags[i].ty = Math.max(tags[i].y, top + gap / 2); if (i && tags[i].ty < tags[i - 1].ty + gap) tags[i].ty = tags[i - 1].ty + gap; }
  for (let i = tags.length - 1; i >= 0; i--) { const lim = i === tags.length - 1 ? bottom - gap / 2 : tags[i + 1].ty - gap; if (tags[i].ty > lim) tags[i].ty = lim; }
  return tags;
}
export function strikeSvg(t, s) {
  const st = strikesOf(t);
  if (!st.length) return { svg: `<p class="gx-note">${NA}: no strikes in this build for ${esc(t.t)}.</p>`, spotY: 0, h: 0 };
  const W = Math.max(300, Math.round(s.chartW || 620)), narrow = W < 480;
  const rowH = Math.max(15, Math.min(28, Math.floor(560 / Math.max(1, st.length)))), L = narrow ? 50 : 58, R = narrow ? 100 : 128, top = 4;
  const n = st.length, H = top * 2 + n * rowH;
  const vals = strikeValues(t, st, s);
  const net = s.mode === 'net';
  const maxAbs = Math.max(1e-9, ...vals.flatMap((v) => (net ? [Math.abs(v.net || 0)] : [Math.abs(v.c || 0), Math.abs(v.p || 0)])));
  const x0 = L + (W - L - R) / 2, half = (W - L - R) / 2 - 4;
  const cy = (i) => top + (n - 1 - i) * rowH + rowH / 2; // ascending index -> y (high strikes on top)
  const yOf = (price) => {
    if (!fin(price)) return null;
    if (price < st[0].k - 1e-9 || price > st[n - 1].k + 1e-9) return null;
    for (let i = 0; i < n - 1; i++) if (price >= st[i].k && price <= st[i + 1].k) return cy(i) + ((price - st[i].k) / (st[i + 1].k - st[i].k || 1)) * (cy(i + 1) - cy(i));
    return cy(n - 1);
  };
  const out = [];
  out.push(`<line class="gx-axis0" x1="${x0}" x2="${x0}" y1="0" y2="${H}"/>`);
  vals.forEach((v, i) => {
    const y = cy(i), bh = rowH - 4;
    if (i % 5 === 0) out.push(`<line class="gx-grid" x1="${L}" x2="${W - R}" y1="${(y + rowH / 2).toFixed(1)}" y2="${(y + rowH / 2).toFixed(1)}"/>`);
    out.push(`<text class="gx-k-lbl" x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(fmtStrike(v.k))}</text>`);
    const bar = (val, cls) => {
      if (!fin(val) || val === 0) return '';
      const wpx = Math.max(1, (Math.abs(val) / maxAbs) * half);
      const x = val > 0 ? x0 : x0 - wpx;
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(y - bh / 2).toFixed(1)}" width="${wpx.toFixed(1)}" height="${bh}" rx="1.5"/>`;
    };
    if (net) out.push(bar(v.net, v.net >= 0 ? 'gx-bar-up' : 'gx-bar-dn'));
    else out.push(bar(v.c, 'gx-bar-up') + bar(v.p, 'gx-bar-dn'));
    const r = v.r;
    const tip = `${fmtStrike(v.k)} · call GEX ${fmtUsd(r.cg)} · put GEX ${fmtUsd(r.pg)} · nearest expiry ${fmtUsd(r.cg_near)} / ${fmtUsd(r.pg_near)} · OI ${fmtCount(r.coi)} calls / ${fmtCount(r.poi)} puts · volume ${fmtCount(r.cv)} calls / ${fmtCount(r.pv)} puts`;
    out.push(`<rect class="gx-hit" x="0" y="${(y - rowH / 2).toFixed(1)}" width="${W}" height="${rowH}"><title>${esc(tip)}</title></rect>`);
  });
  const marks = [
    { key: 'spot', label: 'SPOT', v: t.spot, cls: 'gx-m-spot', fmt: fmtPx },
    { key: 'flip', label: 'FLIP', v: t.flip, cls: 'gx-m-flip', fmt: fmtPx },
    { key: 'cw', label: narrow ? 'CALL' : 'CALL WALL', v: t.call_wall, cls: 'gx-m-cw', fmt: fmtStrike },
    { key: 'pw', label: narrow ? 'PUT' : 'PUT WALL', v: t.put_wall, cls: 'gx-m-pw', fmt: fmtStrike },
    { key: 'abs', label: narrow ? 'ABS γ' : 'ABS γ', v: t.abs_strike, cls: 'gx-m-abs', fmt: fmtStrike },
  ].map((m) => ({ ...m, y: yOf(m.v) })).filter((m) => m.y != null);
  const tags = placeTags(marks.map((m) => ({ ...m })), 0, H, 17);
  for (const m of tags) {
    out.push(`<line class="gx-mline ${m.cls}" x1="${L}" x2="${W - R + 2}" y1="${m.y.toFixed(1)}" y2="${m.y.toFixed(1)}"/>`);
    out.push(`<path class="gx-mlink ${m.cls}" d="M${W - R + 2} ${m.y.toFixed(1)} L${W - R + 8} ${m.ty.toFixed(1)}"/>`);
    out.push(`<g class="gx-tag ${m.cls}"><rect x="${W - R + 8}" y="${(m.ty - 8).toFixed(1)}" width="${R - 10}" height="16" rx="3"/><text x="${W - R + 13}" y="${(m.ty + 4).toFixed(1)}">${esc(m.label)} ${esc(m.fmt(m.v))}</text></g>`);
  }
  const spotY = yOf(t.spot) ?? H / 2;
  const svg = `<svg class="gx-strikes" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${t.t} ${METRICS[s.metric]} by strike, ${n} strikes`)}">${out.join('')}</svg>`;
  return { svg, spotY, h: H, maxAbs, L, R, W };
}
const seg = (opt, cur, items) => `<div class="gx-seg" role="group">${items.map(([v, lab]) => `<button type="button" class="${v === cur ? 'on' : ''}" data-gx-opt="${opt}" data-gx-val="${v}" aria-pressed="${v === cur}">${lab}</button>`).join('')}</div>`;
export function renderChart(t, s) {
  if (!t) return `<section class="gx-panel gx-chart"><p class="gx-note">${NA}: no ticker selected.</p></section>`;
  const { svg, spotY, maxAbs, L, R, W } = strikeSvg(t, s);
  const near = s.exp === 'near';
  const nearNote = near && s.metric !== 'gex' ? `<p class="gx-note gx-warn">Nearest-expiry split exists for GEX only in this build; ${METRICS[s.metric]} shows all expiries.</p>` : '';
  const net = s.mode === 'net';
  const leftLab = net ? 'net below 0' : `puts`;
  const rightLab = net ? 'net above 0' : `calls`;
  const scale = fin(maxAbs) && maxAbs > 1e-6 ? fmtMetric(maxAbs, s.metric, false) : NA;
  return `<section class="gx-panel gx-chart" id="gxChart" aria-label="Gamma by strike">
    <header class="gx-chart-head">
      <div><h2>${esc(t.t)} · ${METRICS[s.metric]} by strike</h2>
      <p class="gx-note">Spot <b>${esc(fmtPx(t.spot))}</b> · net GEX <b class="${signCls(t.net_gex)}">${esc(fmtUsd(t.net_gex))}</b> / 1% · ${esc(fmtPct(t.gex_per_dv20_pct, 1, { sign: true }))} of 20D $vol · nearest exp <b>${esc(fmtDay(t.near_exp, { dow: false }))}</b> · ${esc(fmtCount(t.n_contracts))} · coverage ${esc(fmtPct(t.coverage_pct, 1))}</p></div>
    </header>
    <div class="gx-toggles">${seg('exp', s.exp, [['all', 'All expiries'], ['near', `Nearest ${esc(fmtDay(t.near_exp, { dow: false }))}`]])}${seg('metric', s.metric, [['gex', 'GEX'], ['oi', 'OI'], ['vol', 'Volume']])}${seg('mode', s.mode, [['split', 'Calls | puts'], ['net', 'Net']])}</div>
    ${nearNote}
    <div class="gx-axisrow" style="--gx-l:${L || 0}px;--gx-r:${R || 0}px"><span class="gx-neg">${MINUS}${esc(scale.replace(/^[+−]/, ''))} ← ${esc(leftLab)}</span><span class="gx-pos">${esc(rightLab)} → +${esc(scale.replace(/^[+−]/, ''))}</span></div>
    <div class="gx-chart-scroll" data-gx-spot-y="${Math.round(spotY)}" data-gx-chart-key="${esc(`${t.t}|${s.exp}|${s.metric}|${s.mode}`)}">${svg}</div>
    <p class="gx-note gx-legend"><span><i class="gx-lg gx-m-spot"></i>spot</span><span><i class="gx-lg gx-m-flip"></i>flip</span><span><i class="gx-lg gx-m-cw"></i>call wall</span><span><i class="gx-lg gx-m-pw"></i>put wall</span><span><i class="gx-lg gx-m-abs"></i>abs-γ strike</span><span>strikes within ${t.kind === 'index' ? '±10%' : '±25%'} of spot · hover a row for its numbers</span></p>
  </section>`;
}

// ---------- 5. positioning table (UW / Quant Data heat table) ----------
export function renderTable(doc, s) {
  const all = tickersOf(doc);
  const rows = sortRows(filterCap(all, s.cap), s.sort);
  const meds = Object.fromEntries(COLS.filter((c) => c.tint === 'median').map((c) => [c.k, median(rows.map(c.get))]));
  const sk = s.sort?.k || 'absx', dir = s.sort?.dir === 1 ? 1 : -1;
  const arrow = (k) => (k === sk ? (dir === 1 ? ' ▲' : ' ▼') : k === 'stretch_x' && sk === 'absx' ? ' |▼|' : '');
  const head = COLS.map((c) => `<th class="${c.k === 't' ? 'l gx-sticky' : ''}${c.k === sk || (c.k === 'stretch_x' && sk === 'absx') ? ' gx-sorted' : ''}" data-gx-sort="${c.k}" scope="col" title="Sort by ${esc(c.label)}">${esc(c.label)}${arrow(c.k)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</th>`).join('');
  const body = rows.map((t) => {
    const sel = t.t === s.sel;
    const badge = t.kind === 'index' ? '<span class="gx-bkt gx-bkt-ix">INDEX</span>' : t.bkt ? `<span class="gx-bkt">${esc(t.bkt)}</span>` : '';
    const cells = COLS.slice(1).map((c) => { const v = c.get(t); return `<td${tintStyle(c, v, meds[c.k])}>${esc(fin(v) ? c.fmt(v) : NA)}</td>`; }).join('');
    return `<tr class="gx-row${sel ? ' gx-sel' : ''}" data-gx-t="${esc(t.t)}" tabindex="0"><th class="l gx-sticky" scope="row"><b>${esc(t.t)}</b>${badge}</th>${cells}</tr>`;
  }).join('');
  const chips = CAPS.map((c) => `<button type="button" class="${c === s.cap ? 'on' : ''}" data-gx-cap="${c}" aria-pressed="${c === s.cap}">${c}</button>`).join('');
  return `<section class="gx-panel gx-table-panel" id="gxTable" aria-label="Positioning table">
    <header class="gx-panel-head"><div><h2>Positioning · every ticker</h2>
      ${gatedNote(all)}<p class="gx-note">${rows.length} of ${all.length} tickers · default sort |stretch ×ATR| largest first · click a header to sort, a row to chart it. Tint: signed columns green +/above, red ${MINUS}/below; unsigned columns vs the median of the listed names; stronger = further; none near zero. Coverage is not tinted.</p></div>
      <div class="gx-seg gx-capseg" role="group" aria-label="Cap filter">${chips}</div></header>
    <div class="gx-tablewrap"><table class="gx-table"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${COLS.length}" class="l">${NA}: no tickers in this cap bucket.</td></tr>`}</tbody></table></div>
  </section>`;
}

// ---------- 6. MR lens ----------
function niceStep(range, target) { const raw = range / target, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
export function scatterSvg(doc, s) {
  const pts = tickersOf(doc).filter((t) => t.kind !== 'index' && fin(t.stretch_x) && fin(t.gex_per_dv20_pct));
  const W = Math.max(300, Math.round(s.lensW || 1100)), narrow = W < 560, H = narrow ? 330 : 460;
  const pl = narrow ? 44 : 58, pr = 14, pt = 30, pb = 40;
  if (!pts.length) return `<p class="gx-note">${NA}: no singles with both stretch and GEX ÷ $vol.</p>`;
  const X = Math.max(3, Math.ceil(Math.max(...pts.map((p) => Math.abs(p.stretch_x))) * 1.05));
  const ys = pts.map((p) => Math.abs(p.gex_per_dv20_pct)).sort((a, b) => a - b);
  const Y = Math.max(5, ys[Math.floor((ys.length - 1) * 0.92)] * 1.25);
  const px = (x) => pl + ((x + X) / (2 * X)) * (W - pl - pr), py = (y) => pt + ((Y - Math.max(-Y, Math.min(Y, y))) / (2 * Y)) * (H - pt - pb);
  const o = [], caps = [];
  o.push(`<rect class="gx-sc-bg-up" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${(py(0) - pt).toFixed(1)}"/>`);
  o.push(`<rect class="gx-sc-bg-dn" x="${pl}" y="${py(0).toFixed(1)}" width="${W - pl - pr}" height="${(H - pb - py(0)).toFixed(1)}"/>`);
  const xs = niceStep(2 * X, narrow ? 6 : 12);
  for (let v = -Math.floor(X / xs) * xs; v <= X + 1e-9; v += xs) { const x = px(v).toFixed(1); o.push(`<line class="${Math.abs(v) < 1e-9 ? 'gx-sc-zero' : 'gx-grid'}" x1="${x}" x2="${x}" y1="${pt}" y2="${H - pb}"/><text class="gx-sc-tick" x="${x}" y="${H - pb + 14}" text-anchor="middle">${esc(fmtX(v, { sign: true, d: xs < 1 ? 1 : 0 }))}</text>`); }
  const ysStep = niceStep(2 * Y, narrow ? 5 : 8);
  for (let v = -Math.floor(Y / ysStep) * ysStep; v <= Y + 1e-9; v += ysStep) { const y = py(v).toFixed(1); o.push(`<line class="${Math.abs(v) < 1e-9 ? 'gx-sc-zero' : 'gx-grid'}" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="gx-sc-tick" x="${pl - 6}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${esc(fmtPct(v, ysStep < 1 ? 1 : 0, { sign: true }))}</text>`); }
  caps.push(`<text class="gx-sc-cap" x="${pl + 8}" y="${pt + 15}">${narrow ? 'dealers long γ (assumed): hedging leans against moves' : 'Net GEX above 0 · dealers long gamma (assumed): their hedging leans against moves'}</text>`);
  caps.push(`<text class="gx-sc-cap" x="${pl + 8}" y="${H - pb - 8}">${narrow ? 'dealers short γ (assumed): hedging adds to moves' : 'Net GEX below 0 · dealers short gamma (assumed): their hedging adds to moves'}</text>`);
  o.push(`<text class="gx-sc-axis" x="${pl}" y="${H - 6}">← below 8EMA</text><text class="gx-sc-axis" x="${W - pr}" y="${H - 6}" text-anchor="end">above 8EMA →</text><text class="gx-sc-axis" x="${(pl + W - pr) / 2}" y="${H - 6}" text-anchor="middle">stretch ×ATR</text>`);
  o.push(`<text class="gx-sc-axis" x="${pl}" y="${pt - 12}">GEX ÷ 20D $vol, %</text>`);
  const labelSet = new Set([...pts].sort((a, b) => Math.abs(b.stretch_x) - Math.abs(a.stretch_x)).slice(0, narrow ? 8 : 15).map((p) => p.t));
  if (s.sel) labelSet.add(s.sel);
  const boxes = [];
  const dots = [], labels = [];
  for (const p of pts) {
    const x = px(p.stretch_x), y = py(p.gex_per_dv20_pct), clipped = Math.abs(p.gex_per_dv20_pct) > Y;
    const sel = p.t === s.sel;
    const tip = `${p.t} · stretch ${fmtX(p.stretch_x, { sign: true, atr: true })} · GEX ÷ 20D $vol ${fmtPct(p.gex_per_dv20_pct, 1, { sign: true })}${clipped ? ' (beyond the axis, drawn at the edge)' : ''} · net GEX ${fmtUsd(p.net_gex)} / 1% · stretch ÷ implied move ${fmtX(p.stretch_vs_imove_x, { sign: true })}`;
    const cls = `gx-dot ${p.stretch_x >= 0 ? 'gx-dot-up' : 'gx-dot-dn'}${sel ? ' gx-dot-sel' : ''}`;
    dots.push(clipped
      ? `<path class="${cls}" data-gx-t="${esc(p.t)}" d="M${x.toFixed(1)} ${(y + (p.gex_per_dv20_pct > 0 ? -6 : 6)).toFixed(1)} l5 ${p.gex_per_dv20_pct > 0 ? 9 : -9} h-10 Z"><title>${esc(tip)}</title></path>`
      : `<circle class="${cls}" data-gx-t="${esc(p.t)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 6 : 4.5}"><title>${esc(tip)}</title></circle>`);
    if (labelSet.has(p.t)) {
      const wpx = p.t.length * 7.4 + 2, right = x < W - pr - wpx - 12;
      for (const dy of [0, -12, 12, -24, 24]) {
        const lx = right ? x + 8 : x - 8 - wpx, ly = y + 4 + dy;
        const b = { x1: lx, x2: lx + wpx, y1: ly - 10, y2: ly + 2 };
        if (boxes.some((q) => b.x1 < q.x2 && b.x2 > q.x1 && b.y1 < q.y2 && b.y2 > q.y1)) continue;
        boxes.push(b);
        labels.push(`<text class="gx-sc-lbl${sel ? ' gx-sc-lbl-sel' : ''}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" data-gx-t="${esc(p.t)}">${esc(p.t)}</text>`);
        break;
      }
    }
  }
  return `<svg class="gx-scatter" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stretch ×ATR against GEX ÷ 20-day $ volume, ${pts.length} singles">${o.join('')}${dots.join('')}${labels.join('')}${caps.join('')}</svg>`;
}
export function renderLens(doc, s) {
  const singles = tickersOf(doc).filter((t) => t.kind !== 'index');
  const top = sortRows(singles, { k: 'absx', dir: -1 }).slice(0, 8);
  const mini = `<div class="gx-miniwrap"><table class="gx-mini"><thead><tr><th class="l">Most stretched</th><th>Stretch<small>×ATR</small></th><th>÷ implied<small>× 1-day move</small></th><th>Put wall<small>×ATR</small></th><th>Call wall<small>×ATR</small></th></tr></thead><tbody>${top.map((t) => `<tr class="gx-row${t.t === s.sel ? ' gx-sel' : ''}" data-gx-t="${esc(t.t)}" tabindex="0"><th class="l"><b>${esc(t.t)}</b>${t.bkt ? `<span class="gx-bkt">${esc(t.bkt)}</span>` : ''}</th><td class="${signCls(t.stretch_x)}">${esc(fmtX(t.stretch_x, { sign: true }))}</td><td class="${signCls(t.stretch_vs_imove_x)}">${esc(fmtX(t.stretch_vs_imove_x, { sign: true }))}</td><td>${esc(fmtX(t.put_wall_dist_x, { sign: true }))}</td><td>${esc(fmtX(t.call_wall_dist_x, { sign: true }))}</td></tr>`).join('')}</tbody></table></div>`;
  return `<section class="gx-panel gx-lens" id="gxLens" aria-label="Mean-reversion lens">
    <header class="gx-panel-head"><div><h2>MR lens · stretch vs dealer gamma</h2>
      <p class="gx-note">One dot per single: x = (close − 8EMA) ÷ ATR14, y = net GEX ÷ 20-day $ volume. Green dot = above its 8EMA, red = below. Labels on the largest |stretch| (15; 8 on phones). Click a dot to chart it. Mechanism captions, not signals: the dealer side is assumed.</p></div></header>
    <div class="gx-lens-grid">
      <div class="gx-lens-host">${scatterSvg(doc, s)}</div>
      <aside class="gx-lens-side">
        <div class="gx-prim"><h3>Stretch ÷ implied move <span class="gx-unit">×</span></h3><p>How many option-implied days of move the current stretch from the 8EMA already is: (close − 8EMA) ÷ (spot × implied 1-day move). <b>+2.0×</b> = two implied days above the 8EMA.</p></div>
        <div class="gx-prim"><h3>Wall distance <span class="gx-unit">×ATR</span></h3><p>Room from spot to the call wall (above) and put wall (below), in ATR14 units: the same language as the stretch. <b>${MINUS}0.5×</b> put wall = the heaviest put strike sits half an ATR under spot.</p></div>
        ${mini}
      </aside>
    </div>
  </section>`;
}

// ---------- 7. definitions ----------
export const DEFS = [
  ['Net GEX', '$ per 1% move', 'Σ gamma × OI × 100 × spot² × 0.01 over every contract with greeks; calls +, puts − (dealer side assumed). Dollars of stock dealers would trade for a 1% move.'],
  ['Call GEX / put GEX', '$ per 1% move', 'The same sum for calls only (+) and puts only (−).'],
  ['GEX ÷ $vol', '%', 'Net GEX ÷ 20-day average $ volume × 100: dealer hedge flow per 1% move against a normal day\'s trading.'],
  ['Flip', '$', 'Zero-gamma level: total net GEX re-priced with Black-Scholes gamma (each contract’s own IV) at test spot prices ±15%; the crossing of 0 nearest to spot. n/a when there is no crossing within ±15%.'],
  ['Spot vs flip', '% and ×ATR', '(spot − flip) ÷ spot × 100; and (spot − flip) ÷ ATR14.'],
  ['Call wall', '$, ×ATR', 'Strike at or above spot with the largest call GEX across all expiries (searched within ±10% of spot for index ETFs, ±25% for singles); distance (strike − spot) ÷ ATR14.'],
  ['Put wall', '$, ×ATR', 'Strike at or below spot with the largest |put GEX| across all expiries (searched within ±10% of spot for index ETFs, ±25% for singles); distance (strike − spot) ÷ ATR14.'],
  ['Abs-γ strike', '$, %', 'Strike with the largest Σ|GEX| (calls + |puts|) (searched within ±10% of spot for index ETFs, ±25% for singles); its share of all |GEX|.'],
  ['Nearest-expiry share', '%', 'Σ|GEX| of the nearest expiry with OI ÷ Σ|GEX| of all expiries × 100.'],
  ['Stretch', '×ATR', '(close − EMA8 of daily closes) ÷ ATR14 (Wilder), daily bars.'],
  ['NDOI', '% shares out', 'Σ OI × delta × 100 ÷ shares outstanding × 100 (singles only; ETFs n/a). Baig, Strong & Zaynutdinova (working paper, Dec 2025) used this measure for squeeze events.'],
  ['Δ-adj opt vol', '% stock vol', 'Σ today\'s option volume × |delta| × 100 ÷ today\'s stock volume × 100. Call share = the calls\' part ÷ the total × 100.'],
  ['Vol ÷ OI', '×', 'Today\'s option volume ÷ open interest (contracts). Above 1× = more traded today than was open last night.'],
  ['C/P vol', '×', 'Call volume ÷ put volume (contracts), today.'],
  ['ATM IV', '%', 'Mean of call and put implied vol at the strike nearest spot, expiry nearest 30 calendar days.'],
  ['Implied move', '% 1-day', 'ATM IV ÷ √252.'],
  ['Stretch ÷ implied move', '×', '(close − EMA8) ÷ (spot × implied 1-day move ÷ 100).'],
  ['Coverage', '% of OI', 'Share of total OI whose contracts carried gamma and delta; the rest is left out of every sum.'],
  ['S&P 500 GEX · DIX', '$, %', 'SqueezeMetrics daily file: index GEX ($ of S&P delta per 1% move) and DIX (dark-pool short volume ÷ total, as %). 2-yr percentile = mid-rank over the last 504 sessions; 60-session sparkline.'],
];
export function renderDefs(doc) {
  return `<section class="gx-panel gx-defs" id="gxDefs"><header class="gx-panel-head"><div><h2>Definitions &amp; sources</h2></div></header>
    <dl class="gx-dl">${DEFS.map(([k, u, d]) => `<div><dt>${esc(k)} <span class="gx-unit">${esc(u)}</span></dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
    <p class="gx-note gx-src"><b>Source</b> ${esc(doc.source || NA)} · <b>Convention</b> ${esc(doc.convention || NA)} · Data is 15 minutes delayed; OI is the prior session's close; 0DTE contracts opened today are not in OI.</p>
  </section>`;
}

// ---------- full render ----------
const safe = (name, fn) => { try { return fn(); } catch (e) { return `<section class="gx-panel"><p class="gx-note">${NA}: ${esc(name)} could not be shown (${esc(e?.message || e)}).</p></section>`; } };
export function pickSel(doc, s) {
  const ts = tickersOf(doc);
  if (s.sel && ts.some((t) => t.t === s.sel)) return s.sel;
  return ts[0]?.t || null;
}
export function renderGamma(doc, state) {
  const s = { ...defaultState(), ...(state || {}) };
  s.sel = pickSel(doc, s);
  const ts = tickersOf(doc);
  const sel = ts.find((t) => t.t === s.sel) || null;
  const narrow = s.w < 560;
  const idx = ts.filter((t) => t.kind === 'index');
  const top = safe('index cards', () => `<section class="gx-top" aria-label="Index regime and key levels">${renderRegime(doc.index_regime)}${idx.map((t) => renderLevelCard(t, t.t === s.sel)).join('')}</section>`);
  return `<div class="gx${narrow ? ' gx-narrow' : ''}" data-gx-version="${VERSION}">
    ${safe('header', () => renderHeader(doc))}
    ${top}
    <div class="gx-main">
      <div class="gx-chart-col gx-chart-host">${safe('gamma by strike', () => renderChart(sel, s))}</div>
      <div class="gx-table-col">${safe('positioning table', () => renderTable(doc, s))}</div>
    </div>
    ${safe('MR lens', () => renderLens(doc, s))}
    ${safe('definitions', () => renderDefs(doc))}
  </div>`;
}

// ---------- CSS (scoped, injected once; board tokens with fallbacks) ----------
export const CSS = `
.gx{--gx-dim:#cbc8c0;--gx-text:var(--text,#e0e5e7);--gx-panel:var(--panel,#191c1f);--gx-panel2:var(--panel-2,#202428);--gx-line:var(--line,#353a40);--gx-line2:var(--line-bright,#59636a);--gx-green:var(--green-hi,#a2d7bd);--gx-red:var(--red-hi,#f0aaa8);--gx-mono:var(--mono,"Cascadia Mono",Consolas,monospace);--gx-sans:var(--sans,"Segoe UI",system-ui,sans-serif);
  display:grid;gap:12px;padding:6px 0 28px;color:var(--gx-text);font-family:var(--gx-sans);min-width:0}
.gx *{box-sizing:border-box}
.gx-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}
.gx-head-main{min-width:0;flex:1 1 640px}
.gx-kicker{color:var(--gx-dim);font:700 12px/1.3 var(--gx-mono);letter-spacing:.12em}
.gx-head h1{margin:2px 0 4px;color:var(--gx-text);font:800 26px/1.1 var(--gx-sans)}
.gx-explain{margin:0 0 4px;color:var(--gx-text);font:500 14px/1.45 var(--gx-sans);max-width:1100px}
.gx-stamps{margin:0;color:var(--gx-dim);font:600 12.5px/1.45 var(--gx-mono)}
.gx-stamps b{color:var(--gx-text)}
.gx-caveat{flex:0 1 560px;border:1px solid var(--gx-line2);border-radius:6px;padding:7px 11px;color:var(--gx-text);background:var(--gx-panel);font:500 12.5px/1.45 var(--gx-sans)}
.gx-caveat b{font:800 11px/1 var(--gx-mono);letter-spacing:.08em;margin-right:6px;text-transform:uppercase}
.gx-fixture{border:1px dashed var(--gx-line2);border-radius:6px;padding:6px 11px;color:var(--gx-text);background:rgba(143,180,216,.08);font:600 12px/1.4 var(--gx-mono)}
.gx-fixture b{letter-spacing:.08em}
.gx-top{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,.8fr) repeat(4,minmax(0,1.1fr));gap:8px}
@media (max-width:1699px){.gx-top{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:1099px){.gx-top{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:620px){.gx-top{grid-template-columns:minmax(0,1fr)}}
.gx-card{display:flex;flex-direction:column;gap:5px;min-width:0;padding:10px 12px 11px;border:1px solid var(--gx-line);border-radius:8px;background:var(--gx-panel)}
.gx-ext{background:linear-gradient(rgba(228,183,110,.12),rgba(228,183,110,.12)),var(--gx-panel);border-color:rgba(228,183,110,.55);box-shadow:inset 3px 0 0 var(--gold,#e4b76e)}
.gx-card-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-width:0}
.gx-card-label{color:var(--gx-text);font:700 13px/1.25 var(--gx-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-card-date{flex:none;color:var(--gx-dim);font:600 10.5px/1.2 var(--gx-mono)}
.gx-card-tk{color:var(--gx-text);font:800 15px/1.2 var(--gx-mono)}
.gx-card-name{min-width:0;color:var(--gx-dim);font:500 11.5px/1.2 var(--gx-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-big{color:var(--gx-text);font:800 26px/1.05 var(--gx-mono);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.gx-pct{display:flex;align-items:center;gap:8px}
.gx-pbar{position:relative;flex:1;display:inline-block;height:6px;min-width:60px;border-radius:3px;background:linear-gradient(90deg,var(--gx-panel2),#2c3237 50%,var(--gx-panel2));border:1px solid var(--gx-line)}
.gx-pbar::before,.gx-pbar::after{content:"";position:absolute;top:-1px;bottom:-1px;width:1px;background:var(--gx-line2)}
.gx-pbar::before{left:25%}.gx-pbar::after{left:75%}
.gx-pbar i{position:absolute;top:-4px;width:3px;height:12px;margin-left:-1.5px;border-radius:1px;background:var(--gx-text)}
.gx-pct-num{flex:none;color:var(--gx-text);font:700 13px/1 var(--gx-mono)}
.gx-pct-num small{color:var(--gx-dim);font:600 11px/1 var(--gx-mono)}
.gx-range{color:var(--gx-dim);font:600 11px/1.35 var(--gx-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-card-sub{color:var(--gx-dim);border-top:1px solid var(--gx-line);padding-top:6px;margin-top:auto;font:500 11.5px/1.35 var(--gx-sans)}
.gx-spark{display:block;width:100%;height:46px;margin:2px 0}
.gx-spark-line{fill:none;stroke:#8fb4d8;stroke-width:1.6}
.gx-spark-area{fill:rgba(143,180,216,.10)}
.gx-spark-zero{stroke:var(--gx-line2);stroke-width:1;stroke-dasharray:3 3}
.gx-spark-dot{fill:var(--gx-text)}
.gx-spark-empty{height:46px}
.gx-lvl{cursor:pointer;gap:3px}
.gx-lvl:hover{border-color:var(--gx-line2)}
.gx-lvl:focus-visible{outline:2px solid #e0e5e7;outline-offset:1px}
.gx-sel.gx-lvl{border-color:#e0e5e7;box-shadow:inset 0 0 0 1px #e0e5e7}
.gx-lvl-hero{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:1px 0 4px}
.gx-hero-gex{font:800 15px/1.1 var(--gx-mono)}
.gx-hero-gex small{color:var(--gx-dim);font:600 10.5px var(--gx-mono)}
.gx-kv{display:grid;grid-template-columns:76px minmax(54px,auto) minmax(0,1fr);gap:6px;align-items:baseline;padding:2px 0;border-top:1px solid var(--line-mid,#30353a);font:600 12px/1.3 var(--gx-mono)}
.gx-k{color:var(--gx-dim);font:600 11.5px/1.3 var(--gx-sans)}
.gx-v{color:var(--gx-text);font-weight:800}
.gx-x{color:var(--gx-text);font-size:11.5px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-pos{color:var(--gx-green)!important}
.gx-neg{color:var(--gx-red)!important}
.gx-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(460px,500px);grid-template-areas:"table chart";gap:12px;align-items:start}
.gx-table-col{grid-area:table;min-width:0}
.gx-chart-col{grid-area:chart;min-width:0;position:sticky;top:8px}
@media (max-width:1499px){.gx-main{grid-template-columns:minmax(0,1fr);grid-template-areas:"chart" "table"}.gx-chart-col{position:static}}
.gx-panel{min-width:0;border:1px solid var(--gx-line);border-radius:8px;background:var(--gx-panel);padding:12px 14px 14px}
.gx-panel h2{margin:0;color:var(--gx-text);font:800 17px/1.2 var(--gx-sans)}
.gx-panel-head,.gx-chart-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.gx-note{margin:4px 0 0;color:var(--gx-dim);font:500 12.5px/1.45 var(--gx-sans)}
.gx-note b{color:var(--gx-text);font-family:var(--gx-mono)}
.gx-warn{color:var(--gx-text)}
.gx-toggles{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.gx-seg{display:inline-flex;border:1px solid var(--gx-line2);border-radius:6px;overflow:hidden}
.gx-seg button{appearance:none;border:0;border-left:1px solid var(--gx-line);background:transparent;color:var(--gx-dim);padding:5px 10px;font:700 12px/1.2 var(--gx-mono);cursor:pointer;white-space:nowrap}
.gx-seg button:first-child{border-left:0}
.gx-seg button:hover{color:var(--gx-text);background:rgba(255,255,255,.04)}
.gx-seg button.on{color:#f4f4f2;background:#353c42;box-shadow:inset 0 -2px 0 #e0e5e7}
.gx-axisrow{display:flex;justify-content:space-between;gap:8px;padding:0 var(--gx-r) 4px var(--gx-l);font:600 11px/1.3 var(--gx-mono)}
.gx-chart-scroll{max-height:640px;overflow:auto;border:1px solid var(--gx-line);border-radius:6px;background:#0f1113;overscroll-behavior:contain}
.gx-strikes{display:block}
.gx-k-lbl{fill:var(--gx-text);font:600 11px var(--gx-mono)}
.gx-grid{stroke:#262b30;stroke-width:1}
.gx-axis0{stroke:var(--gx-line2);stroke-width:1}
.gx-bar-up{fill:rgba(139,197,170,.85)}
.gx-bar-dn{fill:rgba(232,147,145,.85)}
.gx-hit{fill:transparent}
.gx-hit:hover{fill:rgba(255,255,255,.05)}
.gx-mline{stroke-width:1.4}
.gx-mlink{fill:none;stroke-width:1}
.gx-tag text{font:700 10.5px var(--gx-mono);stroke:none}
.gx-tag rect{stroke-width:1}
.gx-m-spot{stroke:#f4f4f2;color:#f4f4f2}.gx-tag.gx-m-spot rect{fill:#2a2f33}.gx-tag.gx-m-spot text{fill:#f4f4f2}
.gx-m-flip{stroke:#cbc8c0;stroke-dasharray:5 4;color:#cbc8c0}.gx-tag.gx-m-flip rect{fill:#1b1e21;stroke-dasharray:none}.gx-tag.gx-m-flip text{fill:#e0e5e7}
.gx-m-cw{stroke:#a2d7bd;color:#a2d7bd}.gx-tag.gx-m-cw rect{fill:#18271f}.gx-tag.gx-m-cw text{fill:#a2d7bd}
.gx-m-pw{stroke:#f0aaa8;color:#f0aaa8}.gx-tag.gx-m-pw rect{fill:#2a1a1a}.gx-tag.gx-m-pw text{fill:#f0aaa8}
.gx-m-abs{stroke:#8fb4d8;stroke-dasharray:2 3;color:#8fb4d8}.gx-tag.gx-m-abs rect{fill:#172029;stroke-dasharray:none}.gx-tag.gx-m-abs text{fill:#b9d3ec}
.gx-mlink.gx-m-flip,.gx-mlink.gx-m-abs{stroke-dasharray:none}
.gx-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.gx-lg{display:inline-block;width:16px;height:0;border-top:2px solid currentColor;margin-right:4px;vertical-align:middle}
.gx-lg.gx-m-flip,.gx-lg.gx-m-abs{border-top-style:dashed}
.gx-capseg button{min-width:58px}
.gx-tablewrap{overflow:auto;max-height:780px;border:1px solid var(--gx-line);border-radius:6px}
.gx-table{border-collapse:separate;border-spacing:0;width:100%;font:600 12px/1.25 var(--gx-mono);font-variant-numeric:tabular-nums}
.gx-table th,.gx-table td{padding:6px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line-mid,#30353a);color:var(--gx-text)}
.gx-table thead th{position:sticky;top:0;z-index:2;background:var(--gx-panel2);color:var(--gx-dim);font:700 11.5px/1.2 var(--gx-mono);vertical-align:bottom;cursor:pointer;user-select:none;border-bottom:1px solid var(--gx-line2)}
.gx-table thead th small{display:block;color:var(--gx-dim);font:600 10px/1.2 var(--gx-mono);margin-top:2px}
.gx-table thead th:hover,.gx-table thead th.gx-sorted{color:var(--gx-text)}
.gx-table .l{text-align:left}
.gx-table thead th.gx-sticky{z-index:3}
.gx-sticky{position:sticky;left:0;background:var(--gx-panel);z-index:1}
.gx-table tbody th{font:700 12px/1.25 var(--gx-mono)}
.gx-miniwrap{overflow-x:auto;min-width:0}
.gx-legend span{white-space:nowrap}
.gx-table tbody th b,.gx-mini th b{display:inline-block;min-width:46px;color:var(--gx-text)}
.gx-row{cursor:pointer}
.gx-row:hover td,.gx-row:hover th{box-shadow:inset 0 999px 0 rgba(255,255,255,.04)}
.gx-row.gx-sel th{box-shadow:inset 3px 0 0 #e0e5e7;background:#262b30}
.gx-row.gx-sel td{border-bottom-color:#59636a}
.gx-row:focus-visible{outline:2px solid #e0e5e7;outline-offset:-2px}
.gx-bkt{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid var(--gx-line2);border-radius:3px;color:var(--gx-text);font:700 9.5px/1.5 var(--gx-mono);letter-spacing:.04em;vertical-align:1px}
.gx-bkt-ix{border-style:dashed}
.gx-lens-grid{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:16px;align-items:start}
@media (max-width:1299px){.gx-lens-grid{grid-template-columns:minmax(0,1fr)}}
.gx-lens-host{min-width:0}
.gx-scatter{display:block;max-width:100%}
.gx-sc-bg-up{fill:rgba(139,197,170,.04)}
.gx-sc-bg-dn{fill:rgba(232,147,145,.04)}
.gx-sc-zero{stroke:var(--gx-line2);stroke-width:1.2}
.gx-sc-tick{fill:var(--gx-dim);font:600 10.5px var(--gx-mono)}
.gx-sc-cap{fill:var(--gx-text);font:600 12px var(--gx-sans);paint-order:stroke;stroke:#191c1f;stroke-width:4px}
.gx-sc-axis{fill:var(--gx-dim);font:600 11px var(--gx-mono)}
.gx-dot{cursor:pointer;stroke:#0f1113;stroke-width:1}
.gx-dot-up{fill:#a2d7bd}.gx-dot-dn{fill:#f0aaa8}
.gx-dot-sel{stroke:#f4f4f2;stroke-width:2.2}
.gx-dot:hover{stroke:#f4f4f2;stroke-width:1.6}
.gx-sc-lbl{fill:var(--gx-text);font:700 11px var(--gx-mono);cursor:pointer;paint-order:stroke;stroke:#191c1f;stroke-width:3px}
.gx-sc-lbl-sel{text-decoration:underline}
.gx-lens-side{display:grid;gap:10px;min-width:0}
.gx-prim{border:1px solid var(--gx-line);border-radius:6px;padding:8px 10px;background:var(--gx-panel2)}
.gx-prim h3{margin:0 0 3px;color:var(--gx-text);font:700 12px/1.3 var(--gx-mono);letter-spacing:.06em;text-transform:uppercase}
.gx-prim p{margin:0;color:var(--gx-text);font:500 12.5px/1.45 var(--gx-sans)}
.gx-prim b{font-family:var(--gx-mono)}
.gx-unit{color:var(--gx-dim);font:600 11px var(--gx-mono);letter-spacing:0;text-transform:none}
.gx-mini{border-collapse:collapse;width:100%;font:600 12px/1.25 var(--gx-mono);font-variant-numeric:tabular-nums}
.gx-mini th,.gx-mini td{padding:5px 6px;text-align:right;border-bottom:1px solid var(--line-mid,#30353a);color:var(--gx-text);white-space:nowrap}
.gx-mini thead th{color:var(--gx-dim);font:700 11px/1.2 var(--gx-mono);vertical-align:bottom}
.gx-mini thead th small{display:block;font:600 10px/1.2 var(--gx-mono)}
.gx-mini .l{text-align:left}
.gx-dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:8px 22px;margin:0}
.gx-dl div{min-width:0}
.gx-dl dt{color:var(--gx-text);font:700 12.5px/1.3 var(--gx-mono)}
.gx-dl dd{margin:2px 0 0;color:var(--gx-dim);font:500 12.5px/1.45 var(--gx-sans)}
.gx-src{margin-top:12px;border-top:1px solid var(--gx-line);padding-top:8px}
.gx-loading,.gx-error,.gx-notice{padding:12px 14px;border:1px solid var(--gx-line);border-radius:8px;background:var(--panel,#191c1f);color:var(--text,#e0e5e7);font:600 13px/1.4 var(--sans,system-ui)}
.gx-notice{margin-bottom:10px;border-color:var(--red-hi,#f0aaa8)}
/* phones (the 400 px layout) */
.gx-narrow .gx-head h1{font-size:21px}
.gx-narrow .gx-explain{font-size:13px}
.gx-narrow .gx-big{font-size:22px}
.gx-narrow .gx-panel{padding:10px 10px 12px}
.gx-narrow .gx-kv{grid-template-columns:78px minmax(50px,auto) minmax(0,1fr)}
.gx-narrow .gx-seg button{padding:5px 8px;font-size:11.5px}
.gx-narrow .gx-tablewrap{max-height:70vh}
.gx-narrow .gx-table th,.gx-narrow .gx-table td{padding:5px 6px;font-size:12px}
.gx-narrow .gx-lens-side .gx-mini th,.gx-narrow .gx-lens-side .gx-mini td{padding:4px 4px;font-size:11.5px}
@media (max-width:560px){.gx-chart-head h2,.gx-panel h2{font-size:15.5px}.gx-caveat{flex-basis:100%}.gx-head-main{flex-basis:100%}}
/* palette D4 (Oct 1 2026, Austin picked D, toned: D2 then S x0.85). Tokens: Desk/builds/gamma/palette/NOTES.md */
.gx-table td.gx-t{font-weight:700}

body:has(#view-gamma:not([hidden])){background:#000}
.gx{--gx-panel:#0a0a0b;--gx-panel2:#141518;--gx-line:#26292d;--gx-line2:#464b52;--line-mid:#1b1d20;--gx-text:#eceae4;--gx-dim:#cfd2d6;--gx-green:#51c083;--gx-red:#e17272}
.gx-table td{color:#eceae4}
.gx-table td.gx-t{--gx-bc:81 192 131;background:linear-gradient(rgb(var(--gx-bc) / .95),rgb(var(--gx-bc) / .95)) right 4px bottom 2px / calc(var(--gx-s) * (100% - 8px)) 3px no-repeat}
.gx-table td.gx-tn{--gx-bc:225 114 114}
.gx-table td.gx-k-signflat{background:none}
.gx-table td.gx-tp:not(.gx-k-median){color:#51c083}
.gx-table td.gx-tn:not(.gx-k-median){color:#e17272}
.gx-table td.gx-l5{font-weight:800}
.gx-table td.gx-l5.gx-tp{background-color:rgba(81,192,131,.07)}.gx-table td.gx-l5.gx-tn{background-color:rgba(225,114,114,.08)}
.gx-chart-scroll{background:#000}.gx-grid{stroke:#17191c}
.gx-bar-up{fill:#45bb7b}.gx-bar-dn{fill:#e16c6c}
.gx-m-cw{stroke:#51c083;color:#51c083}.gx-tag.gx-m-cw rect{fill:#06240f}.gx-tag.gx-m-cw text{fill:#51c083}
.gx-m-pw{stroke:#e17272;color:#e17272}.gx-tag.gx-m-pw rect{fill:#2c0b0b}.gx-tag.gx-m-pw text{fill:#e38585}
.gx-dot-up{fill:#51c083}.gx-dot-dn{fill:#e17272}
.gx-sc-bg-up{fill:rgba(81,192,131,.04)}.gx-sc-bg-dn{fill:rgba(225,114,114,.04)}
.gx-sc-cap,.gx-sc-lbl{stroke:#0a0a0b}
.gx-seg button.on{background:#24272b}
`;

// ---------- browser wiring (self-contained) ----------
function boot() {
  const STALE_MS = 10 * 60 * 1000;
  const state = defaultState();
  let DATA = null, loadedAt = 0, loading = null, failNote = null, lastKey = '', resizeT = 0;
  const qs = new URLSearchParams(window.location.search);
  const qT = (qs.get('t') || '').toUpperCase().trim();
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(qT)) state.sel = qT;

  if (!document.getElementById('gammaTabCss')) { const st = document.createElement('style'); st.id = 'gammaTabCss'; st.textContent = CSS; document.head.appendChild(st); }
  let btn = document.querySelector('.view-tab[data-view="gamma"]');
  if (!btn) {
    const nav = document.querySelector('.view-tabs');
    if (!nav) return;
    btn = document.createElement('button');
    btn.className = 'view-tab'; btn.type = 'button'; btn.dataset.view = 'gamma'; btn.textContent = 'GAMMA';
    btn.title = 'GAMMA · dealer gamma, key levels, options positioning · key 0'; btn.setAttribute('aria-keyshortcuts', '0');
    const after = nav.querySelector('.view-tab[data-view="smartmoney"]') || [...nav.querySelectorAll('.view-tab')].pop();
    if (after) after.after(btn); else nav.prepend(btn);
  }
  if (!btn.getAttribute('aria-keyshortcuts')) btn.setAttribute('aria-keyshortcuts', '0');
  let panel = document.getElementById('view-gamma');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'view'; panel.id = 'view-gamma'; panel.dataset.viewPanel = 'gamma'; panel.hidden = true;
    panel.innerHTML = '<div id="gammaRoot"></div>';
    const host = document.querySelector('main') || document.querySelector('.app-shell') || document.body;
    host.appendChild(panel);
  }
  let root = document.getElementById('gammaRoot');
  if (!root) { root = document.createElement('div'); root.id = 'gammaRoot'; panel.appendChild(root); }

  const measure = () => {
    state.w = root.clientWidth || window.innerWidth;
    const ch = root.querySelector('.gx-chart-host'), le = root.querySelector('.gx-lens-host');
    return { chartW: ch ? Math.max(300, ch.clientWidth - 30) : state.chartW, lensW: le ? Math.max(300, le.clientWidth) : state.lensW };
  };
  const notice = () => (failNote == null ? '' : `<div class="gx-notice" role="alert"><b>Refresh failed</b>, showing data loaded ${esc(fmtStamp(new Date(loadedAt).toISOString().replace(/\.\d+Z$/, 'Z')))} (${esc(failNote)}). Reopen this tab to retry.</div>`);
  function paint() {
    if (!DATA) return;
    const sc = root.querySelector('.gx-chart-scroll');
    const prevTop = sc ? sc.scrollTop : 0;
    state.w = root.clientWidth || window.innerWidth;
    root.innerHTML = notice() + renderGamma(DATA, state);
    const m = measure();
    if (Math.abs(m.chartW - state.chartW) > 4 || Math.abs(m.lensW - state.lensW) > 4) { state.chartW = m.chartW; state.lensW = m.lensW; root.innerHTML = notice() + renderGamma(DATA, state); }
    state.sel = pickSel(DATA, state);
    const s2 = root.querySelector('.gx-chart-scroll');
    if (s2) {
      const key = s2.getAttribute('data-gx-chart-key');
      if (key !== lastKey) { s2.scrollTop = Math.max(0, +s2.getAttribute('data-gx-spot-y') - s2.clientHeight / 2); lastKey = key; } else s2.scrollTop = prevTop;
    }
  }
  function load() {
    if (loading) return loading;
    if (!DATA) root.innerHTML = '<div class="gx-loading">Loading gamma data…</div>';
    loading = fetch('./data/gamma.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => { const bad = validate(j); if (bad) throw new Error('data does not match the expected layout: ' + bad); DATA = j; loadedAt = Date.now(); failNote = null; loading = null; paint(); })
      .catch((e) => {
        loading = null;
        const msg = e && e.message ? e.message : String(e);
        if (DATA) { failNote = msg; paint(); } else root.innerHTML = `<div class="gx-error">Gamma data did not load (${esc(msg)}). Press 0 to retry.</div>`;
      });
    return loading;
  }
  function activate() {
    document.querySelectorAll('[data-view-panel]').forEach((p) => { const on = p === panel; p.hidden = !on; p.classList.toggle('active', on); });
    document.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t === btn));
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (!DATA || Date.now() - loadedAt > STALE_MS) load(); else paint();
  }
  btn.addEventListener('click', activate);
  // Another board tab: hide this panel in case the board's own switcher does not know it.
  document.querySelectorAll('.view-tab').forEach((t) => { if (t !== btn) t.addEventListener('click', () => { panel.hidden = true; panel.classList.remove('active'); btn.classList.remove('active'); }); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '0' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    activate();
  });
  const select = (tk) => {
    state.sel = tk; paint();
    const ch = root.querySelector('#gxChart');
    if (ch) { const b = ch.getBoundingClientRect(); if (b.top < 0 || b.top > window.innerHeight - 120) ch.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  };
  root.addEventListener('click', (e) => {
    let el;
    if ((el = e.target.closest('[data-gx-sort]'))) {
      const k = el.getAttribute('data-gx-sort'), s = state.sort;
      if (k === 'stretch_x') state.sort = s.k === 'absx' ? { k: 'stretch_x', dir: -1 } : s.k === 'stretch_x' && s.dir === -1 ? { k: 'stretch_x', dir: 1 } : { k: 'absx', dir: -1 };
      else if (s.k === k) state.sort = { k, dir: -s.dir };
      else state.sort = { k, dir: k === 't' ? 1 : -1 };
      return paint();
    }
    if ((el = e.target.closest('[data-gx-cap]'))) { state.cap = el.getAttribute('data-gx-cap'); return paint(); }
    if ((el = e.target.closest('[data-gx-opt]'))) { state[el.getAttribute('data-gx-opt')] = el.getAttribute('data-gx-val'); return paint(); }
    if ((el = e.target.closest('[data-gx-t]'))) return select(el.getAttribute('data-gx-t'));
  });
  root.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = e.target.closest && e.target.closest('[data-gx-t]'); if (el) { e.preventDefault(); select(el.getAttribute('data-gx-t')); } });
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (DATA && !panel.hidden) paint(); }, 150); });
  const wantDeep = () => window.location.hash === '#gamma' || qs.get('view') === 'gamma';
  window.addEventListener('hashchange', () => { if (window.location.hash === '#gamma') activate(); });
  if (wantDeep()) {
    activate();
    // The board's own boot may switch views after its data lands; hold the deep link for its first seconds.
    let n = 0; const iv = setInterval(() => { if (panel.hidden) activate(); if (++n > 20) clearInterval(iv); }, 250);
    const stop = () => { clearInterval(iv); document.removeEventListener('keydown', stop, true); document.removeEventListener('pointerdown', stop, true); };
    document.addEventListener('keydown', stop, true); document.addEventListener('pointerdown', stop, true);
  }
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
