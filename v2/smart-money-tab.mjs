// SMART MONEY tab, redesigned (Oct 7 2026 mockup). Self-wiring ES module:
//   <script type="module" src="./smart-money-tab.mjs?v=...">
// Reads ./data/smartmoney.json (built by builds/smart-money-fv), ./data/smartmoney-lens.json (scripts/build-smart-money-lens.mjs:
// 2-yr stretch percentile per name + percentile on each event day + ETF flows + sanity-gate log) and, on first card open,
// ./data/smartmoney-spark.json (derived daily close changes), with smartmoney-bars.json as fallback.
// MR angle: every smart-money row carries the name's own 2-yr stretch percentile on the event day and at the latest close.
// The classic tab (full sortable tables + fund view) stays mounted under #smRoot and is reachable through the FULL TABLES chip.
// Pure render functions are exported so node tests can check the display laws.
import { tradingSessionGap, previousTradingSession } from './market-calendar.mjs';

// ---------- the three NEEDS-YOU calls, one constant each (designer's picks) ----------
/** 1. Card chart. 'daily' = daily bars in the TradingView skin with a buy-window band (pick A). Other values are not built yet and fall back to 'daily'. */
export const CARD_CHART_MODE = 'daily';
/** 2. Stale filings. 'badge' = show under an age badge (pick A) · 'collapse' = collapse insider + 13D tables when older than STALE_AFTER_SESSIONS · 'hide' = hide them. */
export const STALE_FILINGS_MODE = 'badge';
export const STALE_AFTER_SESSIONS = 5;
/** 3. Gold row trigger. 'latest' = 2-yr pctl at the latest close only (pick A) · 'event' = pctl on the event day · 'either'. */
export const GOLD_ROW_ON = 'latest';

/** Why the filings stop (shown on every width, phone included). */
export const FILINGS_REASON = 'EDGAR_UA unset';
export const CONTROL_PCT = 50;
export const EXTREME_LO = 5;
export const EXTREME_HI = 95;
export const SHOW_ROWS = 14;
export const DATA_STALE_MS = 10 * 60 * 1000;
const MINUS = '−';
const DASH = '–';

// ---------- formats (every number unit-marked, missing = n/a) ----------
export const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sgn = (v, d, u) => (!fin(v) ? 'n/a' : (Math.abs(v).toFixed(d) === (0).toFixed(d) ? (0).toFixed(d) + u : (v > 0 ? '+' : MINUS) + Math.abs(v).toFixed(d) + u));
export const fx = (v, d = 2) => sgn(v, d, '×');
export const fp = (v, d = 1) => sgn(v, d, '%');
export const px = (v) => (!fin(v) ? 'n/a' : '$' + (v >= 1 ? v.toFixed(2) : v.toFixed(4)));
export const usd = (v) => {
  if (!fin(v)) return 'n/a';
  const a = Math.abs(v);
  return (v < 0 ? MINUS : '') + '$' + (a >= 1e12 ? (a / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : a.toFixed(0));
};
export const susd = (v) => (!fin(v) ? 'n/a' : (v > 0 ? '+' : '') + usd(v));
export const pctTxt = (v) => (fin(v) ? v.toFixed(1) + '%' : 'n/a');
export const cls = (v) => (!fin(v) ? 'na' : v > 0 ? 'up' : v < 0 ? 'dn' : 'nt');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const md = (d) => (d ? MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10) : 'n/a');
export const mdt = (s) => (s ? md(s.slice(0, 10)) + ' ' + s.slice(11, 16) + ' MT' : 'n/a');
export const isExt = (p) => fin(p) && (p <= EXTREME_LO || p >= EXTREME_HI);
/** Gold row = extreme per GOLD_ROW_ON. p2 = latest close, pe = event day. */
export function goldRow(p2, pe, pf = null, mode = GOLD_ROW_ON) {
  return mode === 'event' ? isExt(pe) || isExt(pf) : mode === 'either' ? isExt(p2) || isExt(pe) || isExt(pf) : isExt(p2);
}
export const ctrlTag = '<span class="tag" title="stake above 50%: a control position, kept and tagged, never excluded">Control &gt; 50%</span>';
export const ipoqTag = '<span class="tag" title="listed after the prior quarter end: no fund could have held it, so the Q2 buyers are an IPO allocation artifact; left out of $ ranking and heat sizing">Ipo qtr</span>';
export const capOf = (mc) => (!fin(mc) ? 'CAP N/A' : mc < 3e8 ? 'MICRO' : mc < 2e9 ? 'SMALL' : mc < 1e10 ? 'MID' : 'LARGE');
const CAP_TXT = { 'CAP N/A': 'Cap n/a', MICRO: 'Micro', SMALL: 'Small', MID: 'Mid', LARGE: 'Large' };
const capTag = (mc) => `<span class="tag">${CAP_TXT[capOf(mc)]}</span>`;

// ---------- colour ramp (heat map + plot): red below 50, green above, grey n/a ----------
const BASE = [38, 42, 46], UPC = [81, 192, 131], DNC = [225, 114, 114];
export function ramp(u) {
  if (u == null) return 'rgb(44,46,48)';
  u = Math.max(-1, Math.min(1, u));
  const t = u >= 0 ? UPC : DNC, k = Math.abs(u);
  return `rgb(${BASE.map((b, i) => Math.round(b + (t[i] - b) * k)).join(',')})`;
}
export const pctColor = (p) => (fin(p) ? ramp((p - 50) / 50) : 'rgb(44,46,48)');

// ---------- model: rows joined to the lens (stretch pctl now, pctl on the event day), sanity gate applied ----------
export function buildModel(sm, lens, { now = Date.now() } = {}) {
  const norm = (t) => String(t || '').split(/[ ,]/)[0].trim();
  const asof = sm.clusters.asof_day;
  const ago = (d) => Math.round((Date.parse(asof) - Date.parse(d)) / 864e5);
  const str = lens.str || {};
  const at = lens.at || {};
  const drop13f = new Set(lens.gate?.drop13f || []);
  const dropD = new Set(lens.gate?.drop13d || []);
  const st = (t) => {
    const m = str[t];
    if (!m) return { nobars: true };
    if (m.stale) return { stale: m.stale, x: null, p2: null };
    if (m.split) return { n: m.n, first: m.first, split: m.split, x: m.x, p2: null, e8p: m.e8p, atr: m.atr, lo2: m.lo2, hi2: m.hi2 };
    return { n: m.n, gap: m.gap || null, first: m.first, p2: m.p2, x: m.x, e8p: m.e8p, atr: m.atr, lo2: m.lo2, hi2: m.hi2, src: m.src };
  };
  const pb = (t, day) => at[t]?.[day] ?? null;
  for (const k of ["clusters", "singles", "sched13"]) for (const r of sm[k].rows) r.mr = r.mr || {};
  for (const r of sm.f13.rollup) r.mr = r.mr || {};
  const r1 = (v) => (fin(v) ? +v.toFixed(2) : null);
  const cl = sm.clusters.rows.filter((r) => ago(r.window_end) <= 90).map((r) => {
    const t = norm(r.ticker);
    return { t, tk: r.ticker, nm: r.issuer_name, mc: r.market_cap, ni: r.n_insiders, nb: r.n_buys, ti: r.titles, usd: r.total_usd, avg: r.avg_price,
      ws: r.window_start, we: r.window_end, lf: r.last_filed, lag: r.lag_days, ipo: !!r.ipo_suspect,
      ins: r.insiders.map((i) => ({ n: i.name, ti: i.titles, usd: i.value_usd, avg: i.avg_price, dn: i.delta_own_pct, f: i.first_date, l: i.last_date })),
      last: r.mr.last, vab: r1(r.mr.vs_avg_buy_pct), sfb: r1(r.mr.since_first_buy_pct), ohi: r1(r.mr.off_high52_pct), hi52: r.mr.high52, lo52: r.mr.low52,
      pbuy: pb(t, r.window_end), pf: pb(t, r.last_filed), ...st(t) };
  });
  const sg = sm.singles.rows.map((r) => {
    const t = norm(r.ticker), i = r.insiders[0] || {};
    return { win: r.win, t, nm: r.issuer_name, mc: r.market_cap, who: i.name, ti: r.titles, usd: r.total_usd, avg: r.avg_price, ws: r.window_start, we: r.window_end,
      lf: r.last_filed, dn: i.delta_own_pct, ipo: !!r.ipo_suspect, last: r.mr.last, vab: r1(r.mr.vs_avg_buy_pct), ohi: r1(r.mr.off_high52_pct), pbuy: pb(t, r.window_end), pf: pb(t, r.last_filed), ...st(t) };
  });
  const s13 = sm.sched13.rows.filter((r) => !dropD.has(r.accession + '|' + r.filer)).map((r) => {
    const t = norm(r.ticker);
    return { t, fam: r.family, act: r.activist, nm: r.subject_name, filer: r.filer, nf: r.n_filers, pc: r.percent_class, ev: r.event_date, fm: r.filed_mt, fd: r.filed_day, ctrl: fin(r.percent_class) && r.percent_class > CONTROL_PCT,
      mc: r.market_cap, last: r.mr.last, sf: r1(r.mr.since_filed_pct), ohi: r1(r.mr.off_high52_pct), pev: pb(t, r.event_date), pf: pb(t, r.filed_day), ...st(t) };
  });
  const ru = sm.f13.rollup.filter((r) => !drop13f.has(norm(r.ticker))).map((r) => ({
    t: r.ticker, nm: r.name, mc: r.market_cap, nb: r.n_buyers, ns: r.n_sellers, nn: r.n_new, na: r.n_add, bu: r.buy_usd, su: r.sell_usd, qe: r.qe_price, fl: r.flagged,
    buyers: r.buyers, sellers: r.sellers, ipoq: !!(str[norm(r.ticker)]?.first && sm.f13.prior_period_end && str[norm(r.ticker)].first > sm.f13.prior_period_end), last: r.mr.last, vqe: r1(r.mr.vs_qe_price_pct), ohi: r1(r.mr.off_high52_pct), pqe: pb(norm(r.ticker), sm.f13.period_end), ...st(norm(r.ticker)),
  }));
  const f13 = sm.f13.rows.filter((r) => !drop13f.has(norm(r.ticker))).map((r) => ({ t: norm(r.ticker), m: r.manager, c: r.change, mv: r.move_usd, pp: r.pct_of_portfolio, ctrl: fin(r.pct_of_cap) && r.pct_of_cap > CONTROL_PCT }));
  const e = lens.etf || null;
  const etfRow = (r, dir) => ({ pw: pb(r.ticker, e.week_end), t: r.ticker, nm: r.name, bk: r.bucket, fl: r.flow_usd, fp: r.flow_pct_aum, aum: r.aum_usd, c: r.close, dir, ...st(r.ticker) });
  const etfIn = e ? e.in.map((r) => etfRow(r, 'in')) : [];
  const etfOut = e ? e.out.map((r) => etfRow(r, 'out')) : [];
  const pol = sm.politicians.agg.map((r) => ({ t: norm(r.ticker), mc: r.market_cap, nm: r.company, nmem: r.n_members, nb: r.n_buys, ns: r.n_sells, lo: r.amount_low, hi: r.amount_high,
    fb: r.first_buy_date, sfb: r1(r.since_first_buy_pct), last: r.last_close, cb: r.cap_bucket, ...st(norm(r.ticker)) }));
  // freshness
  const filingsAsof = asof;
  const pxAsof = lens.px_asof || sm.prices.asof_date;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date(now));
  const daysOld = Math.round((Date.parse(today) - Date.parse(filingsAsof)) / 864e5);
  const gap = tradingSessionGap(filingsAsof, pxAsof);
  const meta = { built_mt: sm.built_mt, lens_mt: lens.built_mt, px_asof: pxAsof, filings_asof: filingsAsof, filings_mt: sm.clusters.asof_mt, days_old: daysOld, sessions_missing: gap,
    priced: sm.prices.tickers_priced, wanted: sm.prices.tickers_wanted, rows_stale: sm.prices.rows_stale,
    f13q: sm.f13.quarter, f13pe: sm.f13.period_end, f13ff: sm.f13.filed_first, f13fl: sm.f13.filed_last, mgrs: sm.f13.managers_total,
    pol_first: sm.politicians.filed_span?.first, pol_last: sm.politicians.filed_span?.last, pol_px: sm.politicians.price_asof, pol_n: sm.politicians.rows?.length ?? 0,
    mr_p2: lens.counts?.mrmap ?? 0, own_p2: lens.counts?.own ?? 0, split_n: lens.counts?.split ?? 0, gate_n: lens.gate?.log?.length ?? 0,
    etf: e ? { week_end: e.week_end, prev: e.prev_week_end, funds: e.funds, net: e.net_usd, clean_n: e.clean_n, excluded_n: e.excluded_n } : null, today, control_n: lens.gate?.control_n ?? 0, ipoq: ru.filter((r) => r.ipoq).map((r) => r.t) };
  return { meta, cl, sg, s13, ru, f13, etfIn, etfOut, pol, ago, gate: lens.gate || { log: [] } };
}

/** Filings (Form 4, 13D/13G) display state under STALE_FILINGS_MODE: 'show' | 'collapse' | 'hide'. */
export function filingsState(M, mode = STALE_FILINGS_MODE, limit = STALE_AFTER_SESSIONS) {
  const old = fin(M.meta.sessions_missing) && M.meta.sessions_missing > limit;
  if (!old || mode === 'badge') return 'show';
  return mode === 'hide' ? 'hide' : mode === 'collapse' ? 'collapse' : 'show';
}

// ---------- view state + slices ----------
export const newState = () => ({ cap: 'all', win: 30, ext: 'all', sort: 'pct', view: 'table', sel: null, openStale: false });
const capPass = (S, r) => S.cap === 'all' || (fin(r.mc) && (S.cap === 's' ? r.mc < 2e9 : r.mc >= 2e9));
const extPass = (S, ...ps) => S.ext === 'all' || ps.some((p) => fin(p) && (S.ext === '5' ? p <= 5 || p >= 95 : p <= 10 || p >= 90));
const dist = (p) => (fin(p) ? Math.abs(p - 50) : -1);
export function sortBy(S, list, usdKey, dateKey, ...pk) {
  return list.slice().sort((a, b) => {
    if (S.sort === 'usd') return (b.ipoq ? 0 : Math.abs(b[usdKey] ?? 0)) - (a.ipoq ? 0 : Math.abs(a[usdKey] ?? 0));
    if (S.sort === 'new') return String(b[dateKey] || '').localeCompare(String(a[dateKey] || ''));
    return Math.max(...pk.map((q) => dist(b[q]))) - Math.max(...pk.map((q) => dist(a[q])));
  });
}
export const slices = (M, S) => {
  const fs = filingsState(M) === 'hide';
  return {
    CL: fs ? [] : M.cl.filter((r) => !r.ipo && M.ago(r.we) <= S.win && capPass(S, r) && extPass(S, r.p2, r.pbuy)),
    SG: fs ? [] : M.sg.filter((r) => r.win === S.win && !r.ipo && capPass(S, r) && extPass(S, r.p2, r.pbuy)),
    S13: fs ? [] : M.s13.filter((r) => capPass(S, r) && extPass(S, r.p2, r.pev)),
    RU: M.ru.filter((r) => capPass(S, r) && extPass(S, r.p2, r.pqe)),
    ETF: [...M.etfIn, ...M.etfOut].filter((r) => extPass(S, r.p2)),
    POL: M.pol.filter((r) => capPass(S, r) && extPass(S, r.p2)),
  };
};

// ---------- small cells ----------
export function d4(v, clamp, fmt) {
  if (!fin(v)) return '<span class="na">n/a</span>';
  const w = Math.min(1, Math.abs(v) / clamp) * 50;
  return `<span class="d4 ${cls(v)}">${fmt(v)}<s><i class="${v >= 0 ? 'u' : 'd'}" style="width:${w}%"></i></s></span>`;
}
export function pbar(p) {
  if (!fin(p)) return '<span class="na">n/a</span>';
  const c = p >= 50 ? 'var(--up)' : 'var(--dn)';
  return `<span class="pbar"><s><em></em><i style="left:${p}%;background:${c}"></i></s><span class="${p >= 50 ? 'up' : 'dn'}">${p.toFixed(1)}%</span></span>`;
}
export function pcell(r, key = 'p2') {
  if (r.nobars) return '<span class="na">n/a · no daily bars</span>';
  if (r.stale) return `<span class="na">last bar ${md(r.stale)}</span>`;
  if (r.split) return `<span class="na">n/a · split ${md(r.split)}</span>`;
  if (!fin(r[key])) return `<span class="na">n/a · ${fin(r.n) && r.n < 250 ? r.n + ' sess. (&lt; 250)' : '&lt; 250 sess.'}</span>`;
  return pbar(r[key]) + (r.gap ? `<span class="two" title="a one-day close move of -45% or worse / +80% or better that is not a split sits in the 2-yr window; the value stays">check: big gap ${md(r.gap)}</span>` : '');
}
const rowCls = (S, r, ...pe) => (goldRow(r.p2, pe[0], pe[1]) ? 'ext' : '') + (S.sel === r.t ? ' sel' : '');
const pe = (p, pf) => (fin(p) ? pbar(p) : '<span class="na">n/a</span>') + (fin(pf) ? `<span class="two">filed day ${pf.toFixed(1)}%</span>` : '');
const head = (title, right) => `<div class="ph">${title}<span class="r cnt">${right}</span></div>`;

// ---------- freshness badges ----------
export function pxBadgeClass(M) {
  // green only while the snapshot is the latest completed session; a static snapshot ages to amber on its own
  const today = M.meta.today, latest = today ? previousTradingSession(today, true) : null;
  const lag = latest && M.meta.px_asof ? tradingSessionGap(M.meta.px_asof, latest) : null;
  return fin(lag) && lag === 0 ? 'ok' : fin(lag) ? 'warn' : '';
}
export function renderFresh(M) {
  const m = M.meta;
  const stale = fin(m.sessions_missing) && m.sessions_missing > 0;
  const pc = pxBadgeClass(M);
  const b = [
    `<span class="bdg ${stale ? 'warn' : 'ok'}" data-badge="filings"><span class="k">Filings as of</span><b>${md(m.filings_asof)} · ${m.days_old} d old</b>Form 4 + 13D/13G · ${fin(m.sessions_missing) ? m.sessions_missing : 'n/a'} sessions not loaded · EDGAR fetch off (${FILINGS_REASON})</span>`,
    `<span class="bdg ${pc}" data-badge="prices"><span class="k">Prices</span><b>as of ${md(m.px_asof)} close</b>${m.priced} of ${m.wanted} priced<span class="dsk"> · ${m.rows_stale} rows with an older last bar</span></span>`,
    `<span class="bdg dsk" data-badge="pctl"><span class="k">2-yr pctl</span><b>as of ${md(m.px_asof)} close</b>static snapshot · 8EMA ×ATR in own 504 sessions · ${m.mr_p2} names from MR MAP + ${m.own_p2} from local bars</span>`,
    `<span class="bdg dsk"><span class="k">13F</span><b>${esc(m.f13q)}</b>positions ${md(m.f13pe)} · filed ${md(m.f13ff)} ${DASH} ${md(m.f13fl)} · ${m.mgrs} managers</span>`,
  ];
  if (m.etf) b.push(`<span class="bdg dsk" data-badge="etf"><span class="k">ETF flows</span><b>${md(m.etf.prev)} → ${md(m.etf.week_end)}</b>Δshares × close · weekly · net of ${m.etf.clean_n.toLocaleString('en-US')} funds; ${m.etf.excluded_n.toLocaleString('en-US')} excluded: flagged, multi-week or zero flow</span>`);
  b.push(`<span class="bdg warn dsk"><span class="k">Congress</span><b>House only</b>filed ${md(m.pol_first)} ${DASH} ${md(m.pol_last)} · prices ${md(m.pol_px)} close · Senate not covered</span>`);
  if (m.gate_n) b.push(`<span class="bdg dsk" data-badge="gate"><span class="k">Bad-row guard</span><b>${m.gate_n} rows dropped</b>filer % of cap ≠ position ÷ market cap</span>`);
  if (m.control_n) b.push(`<span class="bdg dsk" data-badge="control"><span class="k">Control &gt; 50%</span><b>${m.control_n} rows tagged</b>kept, never excluded</span>`);
  return b.join('');
}

// ---------- MR LENS ----------
export function lensRows(M, S) {
  const { CL, SG, S13, RU, ETF } = slices(M, S);
  const out = [];
  for (const r of CL) out.push({ src: 'cl', lab: 'CLUSTER', t: r.t, mc: r.mc, what: `${r.ni} insiders · ${usd(r.usd)} · ${esc(r.ti.join(' '))}`, ev: r.we, evl: 'last buy', pe: r.pbuy, pf: r.pf, r, vs: r.vab, vsl: 'vs avg buy', usd: r.usd });
  for (const r of SG) if (r.usd >= 1e5) out.push({ src: 'sg', lab: 'SINGLE', t: r.t, mc: r.mc, what: `${esc(r.who)} · ${usd(r.usd)}`, ev: r.we, evl: 'last buy', pe: r.pbuy, pf: r.pf, r, vs: r.vab, vsl: 'vs avg buy', usd: r.usd });
  for (const r of S13.filter((x) => x.act && M.ago(x.fd) <= S.win)) out.push({ src: 'd13', lab: '13D', t: r.t, mc: r.mc, what: `${esc(r.filer)} · ${fin(r.pc) ? r.pc.toFixed(1) + '% of class' : 'n/a'}${r.ctrl ? ' ' + ctrlTag : ''}`, ev: r.ev, evl: 'event', pe: r.pev, pf: r.pf, r, vs: r.sf, vsl: 'since filed', usd: null });
  for (const r of RU) out.push({ src: 'f13', lab: '13F Q2', t: r.t, mc: r.mc, what: `${r.nb} buyers · ${r.ns} sellers · buy ${usd(r.bu)}${r.ipoq ? ' ' + ipoqTag : ''}`, ev: M.meta.f13pe, evl: 'quarter end', pe: r.pqe, r, vs: r.vqe, vsl: 'vs Q-end $', usd: r.ipoq ? 0 : r.bu, ipoq: r.ipoq });
  for (const r of ETF) out.push({ src: 'etf', lab: r.dir === 'in' ? 'ETF IN' : 'ETF OUT', t: r.t, mc: null, what: `${susd(r.fl)} · ${fp(r.fp, 2)} of AUM · ${esc(r.bk)}`, ev: M.meta.etf?.week_end, evl: 'flow week end', pe: r.pw, r, vs: null, vsl: '', usd: Math.abs(r.fl) });
  return out.filter((o) => (isExt(o.r.p2) || isExt(o.pe) || isExt(o.pf)) && !o.r.stale && !o.r.split);
}
export function renderLens(M, S, bars, sparks) {
  const all = lensRows(M, S);
  const rows = sortBy(S, all.map((o) => ({ ...o, p2: o.r.p2 })), 'usd', 'ev', 'p2', 'pe').slice(0, SHOW_ROWS);
  const body = rows.map((o) => {
    const r = o.r;
    return `<tr data-t="${esc(o.t)}" class="${goldRow(r.p2, o.pe, o.pf) ? 'ext' : ''}${S.sel === o.t ? ' sel' : ''}"><td><span class="src ${o.src}">${SRC_LAB[o.lab] || o.lab}</span></td><td class="l"><div class="tk">${esc(o.t)}${o.mc != null ? capTag(o.mc) : ''}</div>${rowSpark(o.t, bars, sparks)}</td><td class="wcell">${o.what}</td><td>${md(o.ev)}<span class="two">${o.evl}</span></td>
<td>${pe(o.pe, o.pf)}</td><td>${pcell(r)}</td><td>${d4(r.x, 3, fx)}</td><td>${fin(o.vs) ? `<span class="${cls(o.vs)}">${fp(o.vs)}</span><span class="two">${o.vsl}</span>` : '<span class="na">n/a</span>'}</td></tr>`;
  }).join('');
  return `<div class="ph">MR lens · smart-money names at a stretch extreme, then or now <span class="r cnt">2-yr pctl ≤ ${EXTREME_LO}% or ≥ ${EXTREME_HI}% on the trade / filing / flow-week day or at the ${md(M.meta.px_asof)} close · ${rows.length} of ${all.length} shown · gold row = extreme ${GOLD_ROW_ON === 'event' ? 'on the event day' : GOLD_ROW_ON === 'either' ? 'then or now' : 'now'}</span></div>
<table class="bk"><colgroup><col style="width:6%"><col style="width:9%"><col><col style="width:7%"><col style="width:11%"><col style="width:11%"><col style="width:8%"><col style="width:8%"></colgroup>
<thead><tr><th class="l">Who</th><th>Ticker</th><th class="l">What</th><th>Date</th><th title="2-yr stretch percentile on the trade (or event, or flow-week) day; second line = the day the filing hit EDGAR">Pctl on the day</th><th class="srt">2-yr pctl ${md(M.meta.px_asof)}</th><th>8EMA × ATR</th><th>Vs their $</th></tr></thead><tbody>${body || '<tr><td colspan="8" class="na">No smart-money row sits at a stretch extreme under these filters.</td></tr>'}</tbody></table>`;
}

// ---------- tables ----------
function collapsedNote(M, S, id, title) {
  return `<div class="ph">${title}<span class="r cnt">filings are ${M.meta.sessions_missing} sessions behind (as of ${md(M.meta.filings_asof)})</span></div><div class="more" data-open-stale="1">${S.openStale ? 'Hide' : 'Show'} stale rows · ${id}</div>`;
}
export function renderCluster(M, S) {
  if (filingsState(M) === 'hide') return '';
  const title = `Insider cluster buys <span class="tag">Form 4 · code P</span> <span class="tag">2+ insiders · 10 d apart</span>`;
  if (filingsState(M) === 'collapse' && !S.openStale) return collapsedNote(M, S, 'insider clusters', title);
  const all = slices(M, S).CL, vis = sortBy(S, all, 'usd', 'lf', 'p2', 'pbuy'), hid = M.cl.filter((r) => r.ipo && M.ago(r.we) <= S.win).length;
  const body = vis.slice(0, SHOW_ROWS).map((r) => {
    const top = r.ins.slice().sort((a, b) => b.usd - a.usd)[0] || {};
    return `<tr data-t="${esc(r.t)}" class="${rowCls(S, r, r.pbuy, r.pf)}"><td><div class="tk">${esc(r.tk)}${capTag(r.mc)}</div><div class="sub">${esc(r.nm)} · ${usd(r.mc)} cap</div></td>
<td class="l"><b>${r.ni} ins</b><span class="two">${esc(r.ti.join(' · '))}</span></td><td>${usd(r.usd)}<span class="two">${r.nb} buys</span></td><td>${px(r.avg)}</td><td>${px(r.last)}</td><td>${d4(r.vab, 30, fp)}</td>
<td>${fin(top.dn) ? fp(top.dn) : '<span class="na">new / n/a</span>'}<span class="two">top buyer</span></td><td>${md(r.lf)}<span class="two">${md(r.ws)} ${DASH} ${md(r.we)} · lag ${r.lag} d</span></td>
<td>${pe(r.pbuy, r.pf)}</td><td>${pcell(r)}</td><td>${d4(r.x, 3, fx)}</td><td>${d4(r.ohi, 60, fp)}</td></tr>`;
  }).join('');
  return head(title, `${all.length} companies · cluster ended in the last ${S.win} d to ${md(M.meta.filings_asof)} · ${usd(all.reduce((s, r) => s + r.usd, 0))} bought · ${hid} IPO/SPAC suspects hidden · showing ${Math.min(SHOW_ROWS, vis.length)}`) +
    `<table class="bk"><colgroup><col style="width:17%"><col style="width:8%"><col style="width:7%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:7.5%"><col style="width:7%"><col style="width:10%"><col style="width:9.5%"><col style="width:9.5%"><col style="width:6.5%"><col></colgroup>
<thead><tr><th>Ticker</th><th class="l">Insiders</th><th>$ bought</th><th>Avg buy</th><th>Last $</th><th>Vs avg buy</th><th>Δ own</th><th>Filed · window</th><th title="2-yr pctl on the last trade date; second line = the filing day (first day the public could act)">Pctl @ last buy</th><th class="srt">2-yr pctl ${md(M.meta.px_asof)}</th><th>8EMA × ATR</th><th>Off 52-wk high</th></tr></thead><tbody>${body}</tbody></table>${vis.length > SHOW_ROWS ? `<div class="more">${vis.length - SHOW_ROWS} more rows in Full tables</div>` : ''}`;
}
export function render13D(M, S) {
  if (filingsState(M) === 'hide') return '';
  const title = `New 13D stakes <span class="tag">Activist · initial filings</span>`;
  if (filingsState(M) === 'collapse' && !S.openStale) return collapsedNote(M, S, '13D stakes', title);
  const s = slices(M, S).S13, all = s.filter((r) => r.act), g = s.filter((r) => !r.act && M.ago(r.fd) <= 30).length, vis = sortBy(S, all, 'pc', 'fm', 'p2', 'pev');
  const body = vis.slice(0, 12).map((r) => `<tr data-t="${esc(r.t)}" class="${rowCls(S, r, r.pev, r.pf)}"><td><div class="tk">${esc(r.t)}${capTag(r.mc)}</div><div class="sub">${esc(r.nm)}</div></td><td class="wcell">${esc(r.filer)}${r.ctrl ? ' ' + ctrlTag : ''}${r.nf > 1 ? `<small>${r.nf} filers on the form</small>` : ''}</td><td>${fin(r.pc) ? r.pc.toFixed(1) + '%' : 'n/a'}</td><td>${mdt(r.fm)}<span class="two">event ${md(r.ev)}</span></td><td>${d4(r.sf, 30, fp)}</td><td>${pe(r.pev, r.pf)}</td><td>${pcell(r)}</td></tr>`).join('');
  return head(title, `${all.length} since Jul 1 · plus ${g} passive 13G in 30 d`) +
    `<table class="bk"><colgroup><col style="width:21%"><col><col style="width:9%"><col style="width:15%"><col style="width:11%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>Ticker</th><th class="l">Filer</th><th>% class</th><th>Filed</th><th>Since filed</th><th>Pctl @ event</th><th class="srt">2-yr pctl</th></tr></thead><tbody>${body}</tbody></table>${vis.length > 12 ? `<div class="more">${vis.length - 12} more rows in Full tables</div>` : ''}`;
}
export function render13F(M, S) {
  const all = slices(M, S).RU, vis = sortBy(S, all, 'bu', 't', 'p2', 'pqe');
  const body = vis.slice(0, 12).map((r) => `<tr data-t="${esc(r.t)}" class="${rowCls(S, r, r.pqe)}"><td><div class="tk">${esc(r.t)}${capTag(r.mc)}${r.ipoq ? ipoqTag : ''}</div><div class="sub">${esc(r.nm)}</div></td><td><span class="up">${r.nb} buy</span><span class="two">${r.nn} new · ${r.na} add</span></td><td><span class="dn">${r.ns} sell</span></td><td>${usd(r.bu)}<span class="two">sold ${usd(r.su)}</span></td><td>${px(r.qe)}<span class="two">last ${px(r.last)}</span></td><td>${d4(r.vqe, 40, fp)}</td><td>${pe(r.pqe)}</td><td>${pcell(r)}</td></tr>`).join('');
  return head(`13F most bought <span class="tag">${esc(M.meta.f13q)} · ${M.meta.mgrs} managers</span>`, `buyers = new + added positions · prices vs the ${md(M.meta.f13pe)} quarter-end close${M.meta.ipoq.length ? ' · IPO-quarter names (' + M.meta.ipoq.join(', ') + ') tagged and left out of $ ranking: no fund could hold them at the prior quarter end' : ''}`) +
    `<table class="bk"><colgroup><col style="width:21%"><col style="width:9%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col style="width:10%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>Ticker</th><th>Buyers</th><th>Sellers</th><th>Buy $</th><th>Q-end $</th><th>Vs q-end</th><th>Pctl ${md(M.meta.f13pe)}</th><th class="srt">2-yr pctl</th></tr></thead><tbody>${body}</tbody></table><div class="more">${Math.max(0, vis.length - 12)} more names · manager moves (new / added / trimmed / exited) and fund view in Full tables</div>`;
}
export function renderEtf(M, S) {
  if (!M.meta.etf) return head('ETF flows', 'no flows file in this build') + '<div class="more">ETF flows were not part of this build.</div>';
  const filt = (a) => a.filter((r) => extPass(S, r.p2));
  const row = (r) => `<tr data-t="${esc(r.t)}" class="${rowCls(S, r, r.pw)}"><td><div class="tk">${esc(r.t)}</div><div class="sub">${esc(r.bk)}</div></td><td><span class="${cls(r.fl)}">${susd(r.fl)}</span></td><td>${d4(r.fp, 3, (v) => fp(v, 2))}</td><td>${usd(r.aum)}</td><td>${d4(r.x, 3, fx)}</td><td>${pe(r.pw)}</td><td>${pcell(r)}</td></tr>`;
  const sec = (t) => `<tr><td colspan="7" class="l secrow">${t}</td></tr>`;
  const th = `<colgroup><col style="width:17%"><col style="width:13%"><col style="width:11%"><col style="width:12%"><col style="width:10%"><col style="width:19%"><col></colgroup><thead><tr><th>ETF</th><th>Net flow</th><th>% of AUM</th><th>AUM</th><th>8EMA × ATR</th><th title="2-yr pctl on the last day of the flow week">Pctl ${md(M.meta.etf.week_end)} (flow wk)</th><th class="srt">2-yr pctl ${md(M.meta.px_asof)}</th></tr></thead>`;
  return head(`ETF flows <span class="tag">Week to ${md(M.meta.etf.week_end)}</span>`, `top 6 in / top 6 out · net ${susd(M.meta.etf.net)} of ${M.meta.etf.clean_n.toLocaleString('en-US')} funds; ${M.meta.etf.excluded_n.toLocaleString('en-US')} excluded: flagged, multi-week or zero flow`) +
    `<table class="bk">${th}<tbody>${sec('Inflows')}${sortBy(S, filt(M.etfIn), 'fl', 't', 'p2').slice(0, 6).map(row).join('')}${sec('Outflows')}${sortBy(S, filt(M.etfOut), 'fl', 't', 'p2').slice(0, 6).map(row).join('')}</tbody></table>`;
}
export function renderSingles(M, S) {
  if (filingsState(M) === 'hide') return '';
  const title = `Single-insider buys <span class="tag">One insider · no cluster</span>`;
  if (filingsState(M) === 'collapse' && !S.openStale) return collapsedNote(M, S, 'single insiders', title);
  const all = slices(M, S).SG, vis = sortBy(S, all, 'usd', 'lf', 'p2', 'pbuy');
  const body = vis.slice(0, 10).map((r) => `<tr data-t="${esc(r.t)}" class="${rowCls(S, r, r.pbuy, r.pf)}"><td><div class="tk">${esc(r.t)}${capTag(r.mc)}</div><div class="sub">${esc(r.nm)}</div></td><td class="wcell">${esc(r.who)}<small>${esc(r.ti.join(' · '))} · Δown ${fin(r.dn) ? fp(r.dn) : 'n/a'}</small></td><td>${usd(r.usd)}<span class="two">avg ${px(r.avg)}</span></td><td>${d4(r.vab, 30, fp)}</td><td>${pe(r.pbuy, r.pf)}</td><td>${pcell(r)}</td></tr>`).join('');
  return head(title, `top by $ in the ${S.win} d window · ${vis.length} after filters`) +
    `<table class="bk"><colgroup><col style="width:21%"><col><col style="width:12%"><col style="width:11%"><col style="width:14%"><col style="width:14%"></colgroup><thead><tr><th>Ticker</th><th class="l">Insider</th><th>$ bought</th><th>Vs avg buy</th><th>Pctl @ buy</th><th class="srt">2-yr pctl</th></tr></thead><tbody>${body}</tbody></table>`;
}
export function renderPol(M, S) {
  const all = slices(M, S).POL, vis = sortBy(S, all, 'hi', 'fb', 'p2');
  const body = vis.slice(0, 10).map((r) => `<tr data-t="${esc(r.t)}" class="${rowCls(S, r)}"><td><div class="tk">${esc(r.t)}${capTag(r.mc ?? (r.cb === 'LARGE' ? 2e10 : null))}</div><div class="sub">${esc(r.nm)}</div></td><td>${r.nmem} mem<span class="two">${r.nb} buys · ${r.ns} sells</span></td><td>${usd(r.lo)} ${DASH} ${usd(r.hi)}</td><td>${d4(r.sfb, 40, fp)}<span class="two">since ${md(r.fb)}</span></td><td>${pcell(r)}</td></tr>`).join('');
  return head(`Congress most bought <span class="tag">House · 60 d filed</span>`, `${M.meta.pol_n} trades · $ = STOCK Act ranges, not exact`) +
    `<table class="bk"><colgroup><col style="width:24%"><col style="width:13%"><col style="width:20%"><col style="width:16%"><col></colgroup><thead><tr><th>Ticker</th><th>Members</th><th>Disclosed $</th><th>Since 1st buy</th><th class="srt">2-yr pctl</th></tr></thead><tbody>${body}</tbody></table>`;
}
export function renderGap() {
  return head('Not on this tab yet · what each needs', 'surveyed products have these; our data does not') + `<div class="gap"><ol>
<li><b>Fresh Form 4 + 13D/13G (daily)</b> <span>· EDGAR_UA set on the feed so filings refresh nightly.</span></li>
<li><b>Dark-pool prints / off-exchange %</b> <span>· needs a trades feed with exchange codes. FINRA ATS weekly volume is free but 2${DASH}4 weeks late.</span></li>
<li><b>Options flow (sweeps, blocks)</b> <span>· needs an options trades feed; the GAMMA tab has OI only.</span></li>
<li><b>10b5-1 flag on insider rows</b> <span>· parse the Form 4 footnote checkbox (2023+ forms).</span></li>
<li><b>Senate trades</b> <span>· eFD sits behind an "I agree" gate; needs a session-cookie fetcher.</span></li>
<li><b>Short volume (FINRA Reg SHO daily)</b> <span>· free daily file; one fetcher.</span></li></ol></div>`;
}

// ---------- selected-name card ----------
export function ctx(M, t) {
  const c = M.cl.find((r) => r.t === t), g = M.sg.find((r) => r.t === t), d = M.s13.filter((r) => r.t === t), f = M.ru.find((r) => r.t === t),
    e = [...M.etfIn, ...M.etfOut].find((r) => r.t === t), p = M.pol.find((r) => r.t === t), m = M.f13.filter((r) => r.t === t);
  return { c, g, d, f, e, p, m, base: c || g || d[0] || f || e || p };
}
export function defaultSelection(M, S) {
  const l = sortBy(S, lensRows(M, S).map((o) => ({ ...o, p2: o.r.p2 })), 'usd', 'ev', 'p2', 'pe')[0];
  return l ? l.t : (M.cl[0]?.t || M.ru[0]?.t || null);
}
const dOf = (s) => '20' + s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4, 6);

/** Pure, accessible percent-change sparkline; invalid points are ignored. */
export function sparkSvg(values, opts = {}) {
  opts = opts && typeof opts === 'object' ? opts : {};
  const points = Array.isArray(values) ? values.filter(fin) : [];
  const W = fin(opts.width) ? Math.max(140, Math.min(2000, opts.width)) : 240;
  const H = fin(opts.height) ? Math.max(30, Math.min(600, opts.height)) : 48;
  const last = points.at(-1), label = fin(last) ? `${last >= 0 ? '+' : '-'}${Math.abs(last).toFixed(1)}%` : 'n/a';
  const aria = `${opts.label || 'Daily close change'}: ${label} vs first close; ${points.length} sessions`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(aria)}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#000"><rect width="${W}" height="${H}" fill="#000"/>`;
  if (!points.length) return `${head}<text x="${W - 6}" y="${H / 2 + 4}" text-anchor="end" fill="#e0e5e7" font-size="12">n/a</text></svg>`;
  // Normalize before scaling so even extreme finite inputs cannot overflow the range.
  const scale = points.reduce((max, v) => Math.max(max, Math.abs(v)), 1);
  const normalized = points.map((v) => v / scale);
  const lo = normalized.reduce((min, v) => Math.min(min, v), 0);
  const hi = normalized.reduce((max, v) => Math.max(max, v), 0);
  const range = hi - lo || 1, right = W - Math.max(64, label.length * 7.5 + 8);
  const Y = (v) => 6 + (hi === lo ? 0.5 : (hi - v) / range) * (H - 12);
  const poly = normalized.map((v, i) => `${(6 + i / Math.max(1, points.length - 1) * Math.max(1, right - 6)).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return `${head}<line x1="6" x2="${Math.max(7, right)}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#bec7cd" stroke-dasharray="2 3"/><polyline fill="none" stroke="${last >= 0 ? '#51c083' : '#e17272'}" stroke-width="1.8" points="${poly}"/><text x="${W - 6}" y="${Math.max(15, Math.min(H - 6, Y(last / scale) + 4)).toFixed(1)}" text-anchor="end" fill="#e0e5e7" font-size="12">${label}</text></svg>`;
}

function sparkValues(sym, bars, sparks) {
  const values = sparks?.schema === 'smartmoney-spark/1' && sparks.days === 60 ? sparks.spark?.[sym] : null;
  if (Array.isArray(values) && values.length >= 5 && values.length <= 60 && values.every(fin)) return values;
  const B = bars?.[sym];
  if (!Array.isArray(B) || B.length < 5) return null;
  const window = B.slice(-60), first = window[0]?.[4];
  if (!window.every((b) => fin(b?.[4]) && b[4] > 0)) return null;
  const derived = window.map((b) => Number(((b[4] / first - 1) * 100).toFixed(1)) || 0);
  return derived.every(fin) ? derived : null;
}

function rowSpark(sym, bars, sparks) {
  const values = sparkValues(sym, bars, sparks);
  return values ? `<div class="r2 sm-spark">${sparkSvg(values, { label: `${sym} daily close change` })}</div>` : '';
}

export function renderCard(M, S, sym, bars, sparks) {
  const X0 = ctx(M, sym), r = X0.base;
  if (!r) return '';
  const asofL = md(M.meta.px_asof);
  const p2 = r.p2, pfd = X0.c?.pf ?? X0.g?.pf ?? X0.d[0]?.pf ?? null;
  const BB = bars?.[sym];
  const lastPx = r.last ?? r.c ?? (BB ? BB[BB.length - 1][4] : null);
  const mc = r.mc;
  let pev = null, pel = '', vs = null, vsl = '', vsS = '', since = null, sinceL = '';
  if (X0.c) { pev = X0.c.pbuy; pel = `pctl on last buy · ${md(X0.c.we)}`; vs = X0.c.vab; vsl = "vs insiders' avg buy"; vsS = `avg ${px(X0.c.avg)} · last ${px(X0.c.last)}`; since = X0.c.sfb; sinceL = 'since first buy'; }
  else if (X0.g) { pev = X0.g.pbuy; pel = `pctl on the buy · ${md(X0.g.we)}`; vs = X0.g.vab; vsl = 'vs insider avg buy'; vsS = `avg ${px(X0.g.avg)}`; }
  else if (X0.d.length) { pev = X0.d[0].pev; pel = `pctl on 13D event · ${md(X0.d[0].ev)}`; vs = X0.d[0].sf; vsl = 'since filed'; vsS = mdt(X0.d[0].fm); }
  else if (X0.e) { pev = X0.e.pw; pel = `pctl at flow-week end · ${md(M.meta.etf?.week_end)}`; vs = X0.e.fp; vsl = 'flow % of AUM'; vsS = `${susd(X0.e.fl)} · AUM ${usd(X0.e.aum)}`; }
  else if (X0.f) { pev = X0.f.pqe; pel = `pctl on ${md(M.meta.f13pe)} (Q-end)`; vs = X0.f.vqe; vsl = 'vs 13F Q-end close'; vsS = `Q-end ${px(X0.f.qe)}`; }
  const ohi = X0.c?.ohi ?? X0.g?.ohi ?? X0.d[0]?.ohi ?? X0.f?.ohi;
  const tile = (k, k2, v, s) => `<div class="tl"><div class="k"><span>${k}</span><span>${k2}</span></div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const gold = (on) => (on ? ' ext' : '');
  const pTile = `<div class="tl${gold(goldRow(p2, pev, pfd))}"><div class="k"><span>2-yr stretch pctl</span><span>${fin(r.n) ? r.n : 504} sess.</span></div><div class="v ${cls((p2 ?? 50) - 50)}">${fin(p2) ? p2.toFixed(1) + '%' : 'n/a'}</div><div class="rng">${fin(r.lo2) && fin(r.x) && r.hi2 > r.lo2 ? `<em style="left:${Math.max(0, Math.min(100, (0 - r.lo2) / (r.hi2 - r.lo2) * 100))}%"></em><i style="left:${Math.max(0, Math.min(100, (r.x - r.lo2) / (r.hi2 - r.lo2) * 100))}%"></i>` : ''}</div><div class="s">today ${fx(r.x)} ATR · 2-yr range ${fx(r.lo2, 1)} to ${fx(r.hi2, 1)}</div></div>`;
  const peTile = `<div class="tl${GOLD_ROW_ON === 'latest' ? '' : gold(isExt(pev) || isExt(pfd))}"><div class="k"><span>${pel || 'pctl on the event'}</span><span>2-yr</span></div><div class="v ${cls((pev ?? 50) - 50)}">${fin(pev) ? pev.toFixed(1) + '%' : 'n/a'}</div><div class="rng"><em style="left:5%"></em><em style="left:95%"></em>${fin(pev) ? `<i style="left:${pev}%"></i>` : ''}</div><div class="s">${fin(pfd) ? `filing day: <b>${pfd.toFixed(1)}%</b> · ` : ''}${fin(pev) && fin(p2) ? `${pev.toFixed(1)}% then → ${p2.toFixed(1)}% now` : 'event-day pctl n/a'}</div></div>`;
  let who = '';
  if (X0.c) who = `<div class="who"><table><thead><tr><th>Insider</th><th>Title</th><th>$</th><th>Avg $</th><th>Δ Own</th><th>Dates</th></tr></thead><tbody>${X0.c.ins.slice().sort((a, b) => b.usd - a.usd).slice(0, 5).map((i) => `<tr><td>${esc(i.n)}</td><td>${esc(i.ti.join(' '))}</td><td>${usd(i.usd)}</td><td>${px(i.avg)}</td><td>${fin(i.dn) ? fp(i.dn) : 'n/a'}</td><td>${md(i.f)}${i.l !== i.f ? ' ' + DASH + ' ' + md(i.l) : ''}</td></tr>`).join('')}</tbody></table></div>`;
  else if (X0.d.length) who = `<div class="who"><table><thead><tr><th>Filer</th><th>Form</th><th>% Class</th><th>Filed</th></tr></thead><tbody>${X0.d.slice(0, 5).map((d) => `<tr><td>${esc(d.filer)}${d.ctrl ? ' ' + ctrlTag : ''}</td><td>${d.fam}</td><td>${fin(d.pc) ? d.pc.toFixed(1) + '%' : 'n/a'}</td><td>${mdt(d.fm)}</td></tr>`).join('')}</tbody></table></div>`;
  else if (X0.f) who = `<div class="who"><table><thead><tr><th>BUYERS (${X0.f.nb})</th><th style="text-align:left">SELLERS (${X0.f.ns})</th></tr></thead><tbody><tr><td style="white-space:normal">${X0.f.buyers.slice(0, 8).map(esc).join(' · ')}</td><td style="text-align:left;white-space:normal">${X0.f.sellers.slice(0, 8).map(esc).join(' · ') || 'none'}</td></tr></tbody></table></div>`;
  const also = [];
  if (X0.c && X0.g) also.push(`<div><span class="src sg">Single</span>${esc(X0.g.who)} ${usd(X0.g.usd)}</div>`);
  for (const d of (X0.c || X0.g) ? X0.d : X0.d.slice(5)) also.push(`<div><span class="src d13">${d.fam}</span>${esc(d.filer)} · ${fin(d.pc) ? d.pc.toFixed(1) + '%' : 'n/a'} · filed ${mdt(d.fm)}</div>`);
  for (const m of X0.m.slice(0, 4)) also.push(`<div><span class="src f13">13F ${esc(m.c)}</span>${esc(m.m)} · ${susd(m.mv)} · ${fin(m.pp) ? m.pp.toFixed(1) + '% of book' : ''}${m.ctrl ? ' ' + ctrlTag : ''}</div>`);
  if (X0.p) also.push(`<div><span class="src pol">House</span>${X0.p.nmem} members · ${X0.p.nb} buys · ${usd(X0.p.lo)} ${DASH} ${usd(X0.p.hi)}</div>`);
  if (X0.e) also.push(`<div><span class="src etf">ETF ${X0.e.dir}</span>${susd(X0.e.fl)} week to ${md(M.meta.etf?.week_end)} · ${fp(X0.e.fp, 2)} of AUM</div>`);
  let perf = '';
  const fd = X0.c?.lf || X0.g?.lf || X0.d[0]?.fd;
  if (fd && BB) {
    const cs = BB.map((b) => ({ d: dOf(b[0]), c: b[4] })), k = cs.findIndex((c) => c.d >= fd);
    if (k >= 0) {
      const base = cs[k].c, at = (n) => (k + n < cs.length ? (cs[k + n].c / base - 1) * 100 : null);
      const cells = [['+1 session', at(1)], ['+5 sessions', at(5)], ['+21 sessions', at(21)], [`To ${asofL}`, (cs[cs.length - 1].c / base - 1) * 100]];
      perf = `<div class="split"><table><thead><tr><th>Since filed ${md(cs[k].d)} · close ${px(base)}</th>${cells.map((c) => '<th>' + c[0] + '</th>').join('')}</tr></thead><tbody><tr><td>price change</td>${cells.map((c) => `<td class="${cls(c[1])}">${fin(c[1]) ? fp(c[1]) : 'not yet'}</td>`).join('')}</tr></tbody></table></div>`;
    }
  }
  const stalePart = X0.c || X0.g || X0.d.length ? `filings as of ${md(M.meta.filings_asof)} (${M.meta.days_old} d old) · ` : '';
  return `<div class="hd"><h2>${esc(sym)}</h2><span class="px">${px(lastPx)}</span><span class="cnt">${asofL} close${fin(mc) ? ' · ' + usd(mc) + ' cap' : ''}</span><span class="bk">${fin(mc) ? capTag(mc) : '<span class="tag">ETF</span>'}${r.ipoq ? ipoqTag : ''}</span></div>
${rowSpark(sym, bars, sparks)}<div class="ph" style="border-top:1px solid var(--line-mid)">Smart money vs stretch <span class="r">${stalePart}prices ${asofL} close</span></div>
<div class="tiles">${pTile}${peTile}
${tile('vs 8EMA', 'daily', `<span class="${cls(r.x)}">${fx(r.x)} ATR</span>`, `${fp(r.e8p)} · ATR ${px(r.atr)}`)}
${tile(vsl || 'vs their price', '', `<span class="${cls(vs)}">${fp(vs)}</span>`, vsS || 'n/a')}
${tile('off 52-wk high', '252 sess.', `<span class="${cls(ohi)}">${fp(ohi)}</span>`, X0.c ? `high ${px(X0.c.hi52)} · low ${px(X0.c.lo52)}` : '')}
${tile(sinceL || 'cap', '', since != null ? `<span class="${cls(since)}">${fp(since)}</span>` : (fin(mc) ? usd(mc) : 'n/a'), X0.c ? `${X0.c.ni} insiders · ${X0.c.nb} buys · ${usd(X0.c.usd)}` : '')}
</div>${perf}${who}${also.length ? `<div class="also">${also.join('')}</div>` : '<div class="also"><span class="na">No other smart-money source on this name.</span></div>'}`;
}

// ---------- TradingView-skin DAILY chart ----------
const CC = { bg: '#000000', grid: '#1c1c1c', divider: '#2a2a2a', text: '#d6dae0', up: '#51c083', down: '#e17272', volUp: '#51c083', volDown: '#e17272', vwap: '#2f55d4', pct: '#8fb0ff', ema: '#ff9800', bb: '#a23bc4', tag: '#1b2a55' };
export function indicators(B) {
  const a = 2 / 9;
  let e = null;
  const o = B.map((b) => ({ d: dOf(b[0]), o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] * 100 }));
  o.forEach((c, i) => {
    e = e == null ? c.c : c.c * a + e * (1 - a);
    c.ema = i >= 7 ? e : null;
    if (i >= 19) {
      const w = o.slice(i - 19, i + 1), m = w.reduce((s, x) => s + x.c, 0) / 20, sd = Math.sqrt(w.reduce((s, x) => s + (x.c - m) ** 2, 0) / 20);
      c.bbU = m + 2 * sd; c.bbL = m - 2 * sd;
      const pv = w.reduce((s, x) => s + (x.h + x.l + x.c) / 3 * x.v, 0), vv = w.reduce((s, x) => s + x.v, 0);
      c.vwap = vv > 0 ? pv / vv : null;
    }
  });
  return o;
}
const niceStep = (r) => { const raw = r / 8, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; };
export function renderChart(M, sym, bars, boxW = 900, sparks) {
  const values = sparkValues(sym, null, sparks);
  if (values) return `<div class="ph">${esc(sym)} · daily close change <span class="r">${values.length} sessions · vs first close · as of ${md(sparks.px_asof)} close</span></div>${sparkSvg(values, { width: boxW, height: 180, label: `${sym} daily close change` })}`;
  const asofL = md(M.meta.px_asof);
  const B = bars?.[sym], X0 = ctx(M, sym);
  if (bars && bars.__absent) return `<div class="ph">${esc(sym)} · daily</div><div class="nochart">Price charts are not published in this build. Percentiles, filings and flows are unaffected.</div>`;
  if (!B || B.length < 30) return `<div class="ph">${esc(sym)} · daily</div><div class="nochart">No daily bars for ${esc(sym)} in this build.</div>`;
  const all = indicators(B), cs = all.slice(-70);
  let ref, refl;
  if (X0.c) { ref = X0.c.avg; refl = "insiders' avg buy"; } else if (X0.g) { ref = X0.g.avg; refl = 'insider avg buy'; } else if (X0.f) { ref = X0.f.qe; refl = '13F Q-end close'; } else { ref = cs[cs.length - 1].c; refl = `${asofL} close`; }
  if (!fin(ref)) { ref = cs[cs.length - 1].c; refl = `${asofL} close`; }
  const W = Math.max(600, boxW - 2), H = 600, PL = 6, PR = 132, PT = 24, PB = 22, VOL_H = 92, GAP = 8;
  const n = cs.length, plotW = W - PL - PR, slot = plotW / n, bw = Math.max(2, Math.min(11, slot * 0.62));
  const hi0 = Math.max(...cs.map((c) => c.h)), lo0 = Math.min(...cs.map((c) => c.l)), indv = cs.flatMap((c) => [c.bbU, c.bbL, c.ema, c.vwap]).filter(fin);
  let lo = Math.min(lo0, ...indv, ref), hi = Math.max(hi0, ...indv, ref);
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const priceH = H - PT - PB - VOL_H - GAP, X = (i) => PL + (i + 0.5) * slot, Y = (p) => PT + (1 - (p - lo) / (hi - lo)) * priceH, volTop = PT + priceH + GAP, volBase = volTop + VOL_H, vmax = Math.max(...cs.map((c) => c.v)) || 1;
  let wu = '', wd = '', bu = '', bd = '', vu = '', vd = '';
  cs.forEach((c, i) => {
    const cx = X(i).toFixed(1), up = c.c >= c.o, top = Y(Math.max(c.o, c.c)), bot = Y(Math.min(c.o, c.c)), bh = Math.max(0.8, bot - top);
    const body = `M${(cx - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${bh.toFixed(1)}h${(-bw).toFixed(1)}z`;
    if (up) { wu += `M${cx} ${Y(c.h).toFixed(1)}V${top.toFixed(1)}M${cx} ${(top + bh).toFixed(1)}V${Y(c.l).toFixed(1)}`; bu += body; } else { wd += `M${cx} ${Y(c.h).toFixed(1)}V${Y(c.l).toFixed(1)}`; bd += body; }
    const vb = `M${(cx - bw / 2).toFixed(1)} ${volBase}h${bw.toFixed(1)}v${(-(c.v / vmax) * VOL_H).toFixed(1)}h${(-bw).toFixed(1)}z`;
    if (up) vu += vb; else vd += vb;
  });
  const line = (k) => { let d = '', pen = false; cs.forEach((c, i) => { const v = c[k]; if (!fin(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; }); return d; };
  const hiI = cs.reduce((a, c, i) => (c.h > cs[a].h ? i : a), 0), loI = cs.reduce((a, c, i) => (c.l < cs[a].l ? i : a), 0);
  const tagYs = [cs[hiI].h, cs[loI].l, ref].map(Y), st = niceStep(hi - lo);
  let grid = '';
  for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) {
    const y = Y(p);
    if (y < PT + 8 || tagYs.some((t) => Math.abs(t - y) < 15)) continue;
    const pc = (p / ref - 1) * 100;
    grid += `<path d="M${PL} ${y.toFixed(1)}H${PL + plotW}" stroke="${CC.grid}"/><text x="${W - PR + 6}" y="${(y + 4).toFixed(1)}">${px(p)}</text><text x="${W - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${CC.pct}">${pc >= 0 ? '+' : MINUS}${Math.abs(pc).toFixed(0)}%</text>`;
  }
  const tag = (l, p, f) => `<rect x="${W - PR + 1}" y="${(Y(p) - 9).toFixed(1)}" width="${PR - 2}" height="18" rx="2" fill="${f || CC.tag}"/><text x="${W - PR + 6}" y="${(Y(p) + 4).toFixed(1)}" fill="#fff">${l} ${px(p)}</text>`;
  let xl = '', pm = '';
  cs.forEach((c, i) => { const m = c.d.slice(5, 7); if (m !== pm && i > 0) xl += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${MON[+m - 1]} 1</text><path d="M${X(i).toFixed(1)} ${volBase}v4" stroke="#3a3a3a"/>`; pm = m; });
  let marks = '';
  const idx = (d) => { let k = -1; cs.forEach((c, i) => { if (c.d <= d) k = i; }); return k; };
  const band = (a, b, l) => { const i0 = Math.max(0, idx(a)), i1 = idx(b); if (i1 < 0 || i1 < i0) return ''; return `<rect x="${(X(i0) - slot / 2).toFixed(1)}" y="${PT}" width="${((i1 - i0 + 1) * slot).toFixed(1)}" height="${priceH}" fill="rgba(255,255,255,.07)"/><text x="${(X(i0) - slot / 2 + 4).toFixed(1)}" y="${PT + 14}" fill="#e0e5e7">${l}</text>`; };
  if (X0.c) marks += band(X0.c.ws, X0.c.we, `insider buy window ${md(X0.c.ws)} ${DASH} ${md(X0.c.we)}`); else if (X0.g) marks += band(X0.g.ws, X0.g.we, `insider buy ${md(X0.g.ws)} ${DASH} ${md(X0.g.we)}`);
  for (const d of X0.d) { const i = idx(d.ev); if (i >= 0) marks += `<path d="M${X(i).toFixed(1)} ${PT}V${PT + priceH}" stroke="#bec7cd" stroke-dasharray="2 4"/><text x="${(X(i) + 4).toFixed(1)}" y="${PT + 30}" fill="#e0e5e7">${d.fam} ${fin(d.pc) ? d.pc + '%' : 'n/a'} event</text>`; }
  const refLine = `<path d="M${PL} ${Y(ref).toFixed(1)}H${PL + plotW}" stroke="#e0e5e7" stroke-dasharray="5 4" stroke-width="1.2"/>`;
  const last = cs[n - 1];
  return `<div class="ph">${esc(sym)} · daily · ${md(cs[0].d)} ${DASH} ${md(last.d)} <span class="r">daily bars (insider windows span weeks) · % scale vs ${refl} ${px(ref)}</span></div>
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:${CC.bg}"><defs><clipPath id="sm2cp"><rect x="${PL}" y="${PT}" width="${plotW}" height="${priceH}"/></clipPath></defs>
<g font-family="Segoe UI Variable Text,Segoe UI,sans-serif" font-size="11.5" fill="${CC.text}">${marks}${grid}${refLine}
<text x="${PL + 4}" y="15">${esc(sym)} · 1D · close ${px(last.c)}<tspan fill="${CC.pct}"> · VWAP 20D (rolling, daily)</tspan><tspan fill="${CC.ema}"> · EMA 8</tspan><tspan fill="#c77be0"> · BB 20,2</tspan><tspan fill="#e0e5e7"> · - - ${refl}</tspan></text>
${tag('High', cs[hiI].h)}${tag('Low', cs[loI].l)}${tag(X0.c || X0.g ? 'AvgBuy' : 'Ref', ref, '#3a3f45')}${xl}</g>
<path d="M${PL} ${volTop - GAP / 2}H${PL + plotW}" stroke="${CC.divider}"/><path d="${vu}" fill="${CC.volUp}"/><path d="${vd}" fill="${CC.volDown}"/>
<g clip-path="url(#sm2cp)" fill="none"><path d="${line('bbU')}" stroke="${CC.bb}" stroke-width="1.2"/><path d="${line('bbL')}" stroke="${CC.bb}" stroke-width="1.2"/><path d="${line('vwap')}" stroke="${CC.vwap}" stroke-width="1.8"/><path d="${line('ema')}" stroke="${CC.ema}" stroke-width="1.3"/>
<path d="${wu}" stroke="${CC.up}"/><path d="${wd}" stroke="${CC.down}"/><path d="${bu}" stroke="${CC.up}"/><path d="${bd}" fill="${CC.down}"/></g></svg>
<div class="cnote">Daily, not 2m: the smart-money events span days to a quarter. No extended-hours shading on daily bars. Insider buys are a white band + dashed avg-buy line, never ▲▼ (those stay your fills). High ${px(cs[hiI].h)} on ${md(cs[hiI].d)} · Low ${px(cs[loI].l)} on ${md(cs[loI].d)}.</div>`;
}

// ---------- MR plot ----------
export function renderPlot(M, S, W = 1800) {
  const { CL, SG, RU } = slices(M, S), ETF = slices(M, S).ETF;
  const pts = [...CL.map((r) => ({ t: r.t, p: r.p2, v: r.usd, s: 'c' })), ...SG.map((r) => ({ t: r.t, p: r.p2, v: r.usd, s: 'o' })), ...RU.filter((r) => !r.ipoq).map((r) => ({ t: r.t, p: r.p2, v: r.bu, s: 'd' })), ...ETF.map((r) => ({ t: r.t, p: r.p2, v: Math.abs(r.fl), s: r.dir === 'in' ? 'q' : 'qo' }))].filter((q) => fin(q.p) && fin(q.v) && q.v > 0);
  if (!pts.length) return '<div class="nochart">No row has a 2-yr percentile under these filters.</div>';
  const H = 600, PL = 70, PR = 20, PT = 16, PB = 40;
  const lv = pts.map((q) => Math.log10(q.v)), ylo = Math.floor(Math.min(...lv)), yhi = Math.max(ylo + 1, Math.ceil(Math.max(...lv)));
  const X = (p) => PL + p / 100 * (W - PL - PR), Y = (v) => PT + (1 - (Math.log10(v) - ylo) / (yhi - ylo)) * (H - PT - PB);
  let g = `<rect x="${X(0)}" y="${PT}" width="${X(5) - X(0)}" height="${H - PT - PB}" fill="rgba(228,183,110,.10)"/><rect x="${X(95)}" y="${PT}" width="${X(100) - X(95)}" height="${H - PT - PB}" fill="rgba(228,183,110,.10)"/>`;
  for (const p of [0, 5, 25, 50, 75, 95, 100]) g += `<path d="M${X(p)} ${PT}V${H - PB}" stroke="${p === 50 ? '#59636a' : '#1c1f22'}"/><text x="${X(p)}" y="${H - PB + 16}" text-anchor="middle">${p}%</text>`;
  for (let e = ylo; e <= yhi; e++) g += `<path d="M${PL} ${Y(10 ** e)}H${W - PR}" stroke="#1c1f22"/><text x="${PL - 8}" y="${Y(10 ** e) + 4}" text-anchor="end">${usd(10 ** e)}</text>`;
  g += `<text x="${(PL + W - PR) / 2}" y="${H - 6}" text-anchor="middle">2-yr stretch pctl at the ${md(M.meta.px_asof)} close (%) · left = stretched down · right = stretched up</text><text x="14" y="${(PT + H - PB) / 2}" transform="rotate(-90 14 ${(PT + H - PB) / 2})" text-anchor="middle">$ bought / flow</text>`;
  const lab = new Set(), placed = [], want = [...pts.filter((q) => isExt(q.p)), ...pts.slice().sort((a, b) => b.v - a.v).slice(0, 40)];
  for (const q of want) { const x = X(q.p) + 9, y = Y(q.v) - 8, w = q.t.length * 7.4 + 2, h = 13; if (placed.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue; placed.push({ x, y, w, h }); lab.add(q.t + q.s); }
  const dots = pts.map((q) => {
    const x = X(q.p), y = Y(q.v), c = pctColor(q.p), r = 6;
    let sh;
    if (q.s === 'c') sh = `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#e0e5e7"/>`;
    else if (q.s === 'o') sh = `<circle cx="${x}" cy="${y}" r="${r - 1}" fill="none" stroke="${c === 'rgb(44,46,48)' ? '#e0e5e7' : c}" stroke-width="2"/>`;
    else if (q.s === 'd') sh = `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}z" fill="${c}" stroke="#e0e5e7"/>`;
    else if (q.s === 'q') sh = `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${c}" stroke="#e0e5e7"/>`;
    else sh = `<rect x="${x - r + 1}" y="${y - r + 1}" width="${2 * r - 2}" height="${2 * r - 2}" fill="none" stroke="${c === 'rgb(44,46,48)' ? '#e0e5e7' : c}" stroke-width="2"/>`;
    sh = `<g data-t="${esc(q.t)}"><title>${esc(q.t)} · 2-yr pctl ${q.p.toFixed(1)}% · ${usd(q.v)}</title>${sh}</g>`;
    const rt = x > W - PR - 60;
    return sh + (lab.has(q.t + q.s) ? `<text x="${rt ? x - r - 3 : x + r + 3}" y="${y + 4}" text-anchor="${rt ? 'end' : 'start'}" fill="#e0e5e7" font-weight="800">${esc(q.t)}</text>` : '');
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI Variable Text,Segoe UI,sans-serif" font-size="11.5" fill="#bec7cd">${g}${dots}</svg>`;
}

// ---------- heat map ----------
export function squarify(items, x0, y0, w, h) {
  const out = [];
  if (!(w > 0) || !(h > 0)) return out;
  const list = (items || []).filter((it) => fin(it.v) && it.v > 0).sort((a, b) => b.v - a.v), total = list.reduce((s, it) => s + it.v, 0);
  if (!(total > 0)) return out;
  const scale = (w * h) / total;
  let X = x0, Y = y0, W = w, H = h, i = 0;
  while (i < list.length) {
    const side = Math.min(W, H);
    let rowSum = 0, rowMin = Infinity, rowMax = 0, j = i, best = Infinity;
    while (j < list.length) {
      const a = list[j].v * scale, s = rowSum + a, mn = Math.min(rowMin, a), mx = Math.max(rowMax, a), worst = Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
      if (j > i && worst > best) break;
      best = worst; rowSum = s; rowMin = mn; rowMax = mx; j++;
    }
    const last = j >= list.length;
    if (W >= H) { const cw = last ? W : rowSum / H; let yy = Y; for (let k = i; k < j; k++) { const a = list[k].v * scale, hh = k === j - 1 ? Y + H - yy : a / cw; out.push({ ...list[k], x: X, y: yy, w: cw, h: hh }); yy += hh; } X += cw; W -= cw; }
    else { const ch = last ? H : rowSum / W; let xx = X; for (let k = i; k < j; k++) { const a = list[k].v * scale, ww = k === j - 1 ? X + W - xx : a / ch; out.push({ ...list[k], x: xx, y: Y, w: ww, h: ch }); xx += ww; } Y += ch; H -= ch; }
    i = j;
  }
  return out;
}
export function renderHeat(M, S, W, H) {
  const { CL, RU } = slices(M, S);
  const etfIn = M.etfIn.filter((r) => extPass(S, r.p2)), etfOut = M.etfOut.filter((r) => extPass(S, r.p2));
  const wk = md(M.meta.etf?.week_end), px0 = md(M.meta.px_asof);
  const groups = [[`Insider clusters · size = $ bought`, CL.map((r) => ({ t: r.t, v: r.usd, p: r.p2, sub: usd(r.usd) }))], [`13F most bought ${esc(M.meta.f13q)} · size = buy $`, RU.map((r) => ({ t: r.t, v: r.ipoq ? 0 : r.bu, p: r.p2, sub: usd(r.bu) + (r.ipoq ? ' IPO qtr' : '') }))],
    [`ETF inflows · week to ${wk}`, etfIn.map((r) => ({ t: r.t, v: r.fl, p: r.p2, sub: susd(r.fl) }))], [`ETF outflows · week to ${wk}`, etfOut.map((r) => ({ t: r.t, v: -r.fl, p: r.p2, sub: susd(r.fl) }))]];
  let html = '', n = 0;
  const gw = W / 2, gh = H / 2;
  groups.forEach(([label, list], gi) => {
    const x0 = (gi % 2) * gw, y0 = Math.floor(gi / 2) * gh, tot = list.reduce((s, q) => s + (q.v || 0), 0);
    html += `<div class="hg" style="left:${x0}px;top:${y0}px;width:${gw}px;height:${gh}px"><div class="hgh">${label} · ${list.length} names · ${usd(tot)} · colour = 2-yr pctl ${px0}</div></div>`;
    for (const q of squarify(list.map((x) => ({ ...x, v: Math.max(x.v, tot * 0.006) })), x0 + 1, y0 + 21, gw - 2, gh - 22)) {
      n++;
      const fs = Math.max(9, Math.min(22, Math.sqrt(q.w * q.h) / 4.4, (q.w - 6) / (q.t.length * 0.62))), l2 = `${fin(q.p) ? q.p.toFixed(1) + '%' : 'n/a'} · ${q.sub}`, show = q.h > fs + 22 && q.w > l2.length * 7.2 + 8;
      html += `<div class="ht${isExt(q.p) ? ' hot' : ''}" data-t="${esc(q.t)}" title="${esc(q.t)} · 2-yr pctl ${fin(q.p) ? q.p.toFixed(1) + '%' : 'n/a'} · ${q.sub}" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px;background:${pctColor(q.p)}">${fs >= 8 && q.w > 14 ? `<b style="font-size:${fs.toFixed(1)}px">${esc(q.t)}</b>` : ''}${show ? `<i>${l2}</i>` : ''}</div>`;
    }
  });
  return { html, n };
}
export const heatLegend = () => [0, 5, 25, 50, 75, 95, 100].map((p) => `<span style="background:${pctColor(p)}">${p === 0 ? '≤5' : p === 100 ? '≥95' : p}%</span>`).join('');

// ---------- phone cards ----------
export function renderPhone(M, S, bars, sparks) {
  const lr = sortBy(S, lensRows(M, S).map((o) => ({ ...o, p2: o.r.p2 })), 'usd', 'ev', 'p2', 'pe').slice(0, 10);
  const cc = sortBy(S, slices(M, S).CL, 'usd', 'lf', 'p2', 'pbuy').slice(0, 12);
  const card = (t, srcCls, srcLab, mc, price, p2, pev, pel, l3, l4) => `<div class="gc${goldRow(p2, pev, null) ? ' ext' : ''}" data-t="${esc(t)}" style="${goldRow(p2, pev) ? 'background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold)' : ''}"><div class="r1"><b>${esc(t)}</b><span class="src ${srcCls}">${srcLab}</span>${mc}<span class="px">${price}</span></div>
${rowSpark(t, bars, sparks)}<div class="r3"><span>Now ${pbar(p2)}</span><span>${pel} ${fin(pev) ? `<b class="${pev >= 50 ? 'up' : 'dn'}">${pev.toFixed(1)}%</b>` : '<b class="na">n/a</b>'}</span></div><div class="r3">${l3}</div><div class="r4">${l4}</div></div>`;
  const a = lr.map((o) => card(o.t, o.src, SRC_LAB[o.lab] || o.lab, o.mc != null ? capTag(o.mc) : '', px(o.r.last ?? o.r.c), o.r.p2, o.pe, o.evl === 'last buy' ? 'at buy' : o.evl === 'event' ? 'at event' : o.evl === 'quarter end' ? 'at Q-end' : '', `<span>8EMA <b class="${cls(o.r.x)}">${fx(o.r.x, 1)}</b></span>${fin(o.vs) ? `<span>${o.vsl} <b class="${cls(o.vs)}">${fp(o.vs)}</b></span>` : ''}`, o.what)).join('');
  const b = cc.map((r) => card(r.t, 'cl', 'Cluster', capTag(r.mc), px(r.last), r.p2, r.pbuy, 'at buy', `<span>${usd(r.usd)}</span><span>vs avg buy <b class="${cls(r.vab)}">${fp(r.vab)}</b></span><span>8EMA <b class="${cls(r.x)}">${fx(r.x, 1)}</b></span>`, `${r.ni} insiders · ${esc(r.ti.join(' '))} · filed ${md(r.lf)}`)).join('');
  return `<div class="cardh">MR lens · into a stretch extreme <span>2-yr pctl ≤ ${EXTREME_LO}% · ≥ ${EXTREME_HI}%</span></div>${a || '<div class="gc"><span class="na">No smart-money row sits at a stretch extreme under these filters.</span></div>'}<div class="cardh">Insider clusters · ${S.win} d <span>filings to ${md(M.meta.filings_asof)}</span></div>${b}`;
}

export function renderFoot(M) {
  const m = M.meta, d = md(m.px_asof);
  const gate = ` <b>Stakes.</b> A stake above ${CONTROL_PCT}% (13F position of market cap, 13D/G % of class) is real control and is kept with a CONTROL &gt; 50% tag (${m.control_n} rows today). Only a 13F row whose filer-reported % of cap disagrees with position ÷ market cap is dropped and logged in smartmoney-lens.json (${m.gate_n} today).`;
  return `<b>MR angle.</b> Every smart-money row carries the name's <b>2-yr stretch percentile</b>: (close − EMA8) ÷ ATR14 ranked mid-rank inside the name's own last 504 daily values (MR MAP method). Readings per row: <b>on the day</b> (the insider's last trade, the 13D event date, the ${md(m.f13pe)} 13F quarter end, the last day of the ETF flow week), <b>on the filing day</b> for insider and 13D rows (the first day the public could act; shown as "filed day" under the first reading) and <b>at the ${d} close</b>. Gold row fill + edge bar = 2-yr pctl ≤ ${EXTREME_LO}% or ≥ ${EXTREME_HI}% ${GOLD_ROW_ON === 'event' ? 'on the event day' : GOLD_ROW_ON === 'either' ? 'then or now' : `at the ${d} close`}. Red/green on the percentile bars and heat map = below/above the 50th; elsewhere green/red = sign only. Raw values, no scores.
<span class="dsk"> <b>Rules.</b> Cluster = 2+ distinct insiders, open-market Form 4 code P, each buy within 10 days of the next; one row per company; IPO/SPAC allocation suspects hidden. Single = exactly one insider, no cluster. 13D = initial activist filings (amendments hidden). 13F most bought = managers that opened or added in ${esc(m.f13q)} among ${m.mgrs} tracked superinvestors. ETF flow = Δ shares outstanding × close, weekly; multi-week and flagged funds excluded. Pctl shows n/a under 250 sessions of history, when the last bar is older than ${d}, or when a confirmed split sits in the last 80 sessions (MR MAP rule: integer-ratio move with normal dollar volume; ${m.split_n} names). A big non-split gap keeps its value and shows "check: big gap".${gate}
<b>Sources.</b> smartmoney.json built ${esc(m.built_mt)} (Form 4 + 13D/13G from EDGAR to ${md(m.filings_asof)}, 13F ${esc(m.f13q)}, House PTRs filed ${md(m.pol_first)} ${DASH} ${md(m.pol_last)}). 2-yr pctl: v2/data/mrmap.json for ${m.mr_p2} names, recomputed from local daily bars for ${m.own_p2} more (lens built ${esc(m.lens_mt)}).</span>`;
}

// ---------- board skin v2 quick view (Oct 19 2026): head · read · strip · quick panels; everything else sits under Deep view ----------
const SRC_LAB = { CLUSTER: 'Cluster', SINGLE: 'Single', '13D': '13D', '13F Q2': '13F Q2', 'ETF IN': 'ETF in', 'ETF OUT': 'ETF out' };
const capChip = (mc) => (fin(mc) ? `<span class="chip">${{ MICRO: 'Micro', SMALL: 'Small', MID: 'Mid', LARGE: 'Large' }[capOf(mc)]}</span>` : '');
const mdtTxt = (s) => (s ? md(String(s).slice(0, 10)) + ' ' + String(s).slice(11, 16) + ' MT' : 'n/a');
export function pcTrack(r, p = r.p2) {
  if (!fin(p)) return pcell(r);
  return `<span class="pc${isExt(p) ? ' ext' : ''}"><span class="trk"><i style="left:${p.toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>`;
}
const pcOnly = (p) => (fin(p) ? `<span class="pc${isExt(p) ? ' ext' : ''}"><span class="trk"><i style="left:${p.toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>` : '<span class="t2">n/a</span>');
const signCls = (v) => (fin(v) && v > 0 ? 'up' : fin(v) && v < 0 ? 'dn' : '');
export function renderQuick(M, S) {
  const m = M.meta, d = md(m.px_asof);
  const all = lensRows(M, S);
  const nowExt = all.filter((o) => isExt(o.r.p2));
  const lens = sortBy(S, all.map((o) => ({ ...o, p2: o.r.p2 })), 'usd', 'ev', 'p2', 'pe').slice(0, SHOW_ROWS);
  const sl = slices(M, S);
  const cl = sortBy(S, sl.CL, 'usd', 'lf', 'p2', 'pbuy');
  const clUsd = sl.CL.reduce((s, r) => s + (r.usd || 0), 0);
  const d13 = sl.S13.filter((r) => r.act && M.ago(r.fd) <= S.win);
  const ru = sl.RU.filter((r) => !r.ipoq).slice().sort((a, b) => (b.bu || 0) - (a.bu || 0));
  const etfNet = m.etf ? m.etf.net : null;
  const lo = nowExt.filter((o) => o.r.p2 <= EXTREME_LO).length, hi = nowExt.length - lo;
  const topExt = nowExt.slice().sort((a, b) => Math.abs(b.r.p2 - 50) - Math.abs(a.r.p2 - 50))[0];
  const stale = fin(m.sessions_missing) && m.sessions_missing > 0;
  const head = `<div class="head"><h1>Smart money</h1><span class="meta">Filings as of ${md(m.filings_asof)} (${m.days_old} d old) · prices and 2-yr pctl ${d} close · 13F ${esc(m.f13q)} · ETF flows week to ${m.etf ? md(m.etf.week_end) : 'n/a'} · built ${mdtTxt(m.built_mt)}</span></div>`;
  const read = `<p class="read${nowExt.length ? ' ext' : ''}"><b>${nowExt.length} smart-money name${nowExt.length === 1 ? '' : 's'}</b> sit at a 2-yr stretch extreme at the ${d} close (${lo} at or below ${EXTREME_LO}%, ${hi} at or above ${EXTREME_HI}%)${topExt ? `; the furthest out is <b>${esc(topExt.t)} at ${topExt.r.p2.toFixed(1)}%</b> (${fx(topExt.r.x)} ATR vs 8EMA)` : ''}. Insider clusters in the last ${S.win} d: <b>${sl.CL.length} companies, ${usd(clUsd)} bought</b>.${stale ? ` Filings are ${m.sessions_missing} sessions behind.` : ''}</p>`;
  const tile = (k, v, s, ext = false, mr = false) => `<div class="tile${ext ? ' ext' : ''}${mr ? ' mr' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const strip = `<div class="strip">${[
    tile('At a 2-yr stretch extreme', `${nowExt.length} <small>names</small>`, `of ${all.length} smart-money rows at an extreme then or now`, nowExt.length > 0, true),
    tile(`Insider cluster buys · ${S.win} d`, usd(clUsd), `${sl.CL.length} companies · 2+ insiders each`),
    tile(`New 13D stakes · ${S.win} d`, `${d13.length} <small>filings</small>`, `activist initial filings · ${sl.S13.filter((r) => r.act).length} since Jul 1`),
    tile(`13F most bought · ${esc(m.f13q)}`, ru[0] ? esc(ru[0].t) : 'n/a', ru[0] ? `${ru[0].nb} buyers · ${usd(ru[0].bu)} · ${m.mgrs} managers` : `${m.mgrs} managers`),
    tile(`ETF net flow · week to ${m.etf ? md(m.etf.week_end) : 'n/a'}`, `<span class="${signCls(etfNet)}">${fin(etfNet) ? susd(etfNet) : 'n/a'}</span>`, m.etf ? `${m.etf.clean_n.toLocaleString('en-US')} funds net` : 'no flows file in this build'),
  ].join('')}</div>`;
  const lensBody = lens.map((o) => {
    const r = o.r;
    return `<tr class="click${isExt(r.p2) ? ' ext' : ''}" data-t="${esc(o.t)}"><th>${esc(o.t)}${o.mc != null ? capChip(o.mc) : ''}<small>${SRC_LAB[o.lab] || esc(o.lab)} · ${o.what.replace(/<span class="tag"[^>]*>([^<]*)<\/span>/g, '$1')}</small></th><td class="opt">${md(o.ev)}<small>${o.evl}</small></td><td class="opt">${pcOnly(o.pe)}</td><td>${pcTrack(r)}</td><td class="${signCls(r.x)}">${fin(r.x) ? fx(r.x) : 'n/a'}</td><td class="opt">${fin(o.vs) ? `<span class="${signCls(o.vs)}">${fp(o.vs)}</span><small>${o.vsl}</small>` : '<span class="t2">n/a</span>'}</td></tr>`;
  }).join('');
  const lensPanel = `<section class="panel"><h2>Mean-reversion lens: smart-money names at a stretch extreme</h2><p class="sub">${lens.length} of ${all.length} rows · 2-yr pctl ≤ ${EXTREME_LO}% or ≥ ${EXTREME_HI}% on the event day or at the ${d} close · gold row = extreme now</p><div class="tw"><table class="t"><thead><tr><th class="l">Name<small>who · what</small></th><th class="opt">Date<small>event</small></th><th class="opt">2-yr pctl<small>on the day</small></th><th>2-yr pctl<small>${d} close</small></th><th>Stretch<small>× ATR vs 8EMA</small></th><th class="opt">Vs their $<small>%</small></th></tr></thead><tbody>${lensBody || '<tr class="more"><td colspan="6">No smart-money row sits at a stretch extreme under these filters.</td></tr>'}</tbody></table></div><p class="note">Descriptive, not an edge claim. Stretch = (close − 8EMA) ÷ ATR14, ranked in the name's own last 504 sessions.</p></section>`;
  const clBody = cl.slice(0, 10).map((r) => `<tr class="click${isExt(r.p2) ? ' ext' : ''}" data-t="${esc(r.t)}"><th>${esc(r.tk)}${capChip(r.mc)}<small>${r.ni} insiders · ${esc(r.ti.slice(0, 3).join(' · '))}</small></th><td>${usd(r.usd)}<small>${r.nb} buys</small></td><td class="${signCls(r.vab)}">${fin(r.vab) ? fp(r.vab) : 'n/a'}</td><td class="opt">${md(r.lf)}</td><td>${pcTrack(r)}</td></tr>`).join('');
  const clPanel = `<section class="panel"><h2>Insider cluster buys · last ${S.win} d</h2><p class="sub">Form 4 code P · 2+ insiders within 10 d · ${Math.min(10, cl.length)} of ${cl.length} companies · filings to ${md(m.filings_asof)}</p><div class="tw"><table class="t"><thead><tr><th class="l">Company</th><th>Bought<small>$</small></th><th>Vs avg buy<small>%</small></th><th class="opt">Last filed</th><th>2-yr pctl<small>${d} close</small></th></tr></thead><tbody>${clBody || '<tr class="more"><td colspan="5">No cluster buys under these filters.</td></tr>'}</tbody></table></div></section>`;
  return `${head}${read}${strip}<div class="grid2 wide-left">${lensPanel}${clPanel}</div>`;
}

// ---------- shell + wiring ----------
export const SHELL = `<div class="sk"><div id="sm2Quick"></div>
<details class="deep" id="sm2Deep"><summary>Deep view <span>name chart and card, freshness, filters, full MR lens, insider clusters, 13D, 13F, ETF flows, single insiders, Congress, MR plot, heat map, sources</span></summary><div class="body sml">
<div class="fresh" id="sm2Fresh"></div>
<div class="ctrl" id="sm2Ctrl">
  <span class="grp"><span class="lbl">Cap</span><button class="chip" data-cap="all" aria-pressed="true">All</button><button class="chip" data-cap="s">Under $2B</button><button class="chip" data-cap="l">$2B+</button></span>
  <span class="grp"><span class="lbl">Insider window</span><button class="chip" data-win="10">10 d</button><button class="chip" data-win="30" aria-pressed="true">30 d</button><button class="chip" data-win="90">90 d</button></span>
  <span class="grp"><span class="lbl">Stretch</span><button class="chip" data-ext="all" aria-pressed="true">All</button><button class="chip" data-ext="10">≤ 10% · ≥ 90%</button><button class="chip" data-ext="5">≤ 5% · ≥ 95%</button></span>
  <span class="grp dsk"><span class="lbl">Sort</span><button class="chip" data-sort="pct" aria-pressed="true">Pctl extreme</button><button class="chip" data-sort="usd">$ size</button><button class="chip" data-sort="new">Newest</button></span>
  <span class="grp dsk"><span class="lbl">View</span><button class="chip" data-view="table" aria-pressed="true">Tables</button><button class="chip" data-view="plot">MR plot</button><button class="chip" data-view="heat">Heat map</button><button class="chip" data-view="classic">Full tables · fund view</button></span>
  <span class="note dsk" id="sm2Note"></span>
</div>
<div id="sm2Main">
<section class="top"><div class="chartbox" id="sm2Chart"></div><div class="panel card" id="sm2Card"></div></section>
<section class="smv on" id="sm2-table">
  <div class="panel lens" id="sm2Lens"></div>
  <div class="grid2"><div class="panel full" id="sm2Cl"></div><div class="panel" id="sm2D13"></div><div class="panel" id="sm2F13"></div><div class="panel" id="sm2Etf"></div><div class="panel" id="sm2Sg"></div><div class="panel" id="sm2Pol"></div><div class="panel" id="sm2Gap"></div></div>
</section>
<section class="smv panel" id="sm2-plot"><div class="ph">MR plot · x = 2-yr stretch pctl now · y = $ size (log) · shape = who <span class="r">● insider cluster · ◆ 13F most bought · ■ ETF inflow · □ ETF outflow · ○ single insider · colour = same pctl ramp as the heat map</span></div><div class="scat" id="sm2Scat"></div></section>
<section class="smv panel" id="sm2-heat"><div class="ph">Smart money heat map <span class="leg" id="sm2Leg"></span><span class="hotkey"><i></i>2-yr pctl ≤ ${EXTREME_LO}% or ≥ ${EXTREME_HI}%</span><span class="r" id="sm2HeatN"></span></div><div class="heat" id="sm2Heat"></div></section>
<section class="cards" id="sm2Cards"></section>
<p class="foot" id="sm2Foot"></p>
</div>
</div></details></div>`;

const BOX = (id) => (typeof document === 'undefined' ? null : document.getElementById(id));
export function mount() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('sm2Root'), classic = document.getElementById('smRoot'), panel = document.getElementById('view-smartmoney');
  if (!root || !panel) return;
  root.innerHTML = SHELL;
  BOX('sm2Deep')?.addEventListener('toggle', () => { if (BOX('sm2Deep').open) render(); });
  const S = newState();
  let sm = null, lens = null, M = null, bars = null, sparks = null, barsLoading = null, chartsLoading = null, loadedAt = 0, loading = null;
  const set = (id, h) => { const el = BOX(id); if (el) el.innerHTML = h; };
  const press = (attr, val) => root.querySelectorAll(`[data-${attr}]`).forEach((b) => { if (b.matches('.chip')) b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))); });
  function drawSel() {
    if (!M || !S.sel) return;
    set('sm2Card', renderCard(M, S, S.sel, bars, sparks));
    set('sm2Chart', renderChart(M, S.sel, bars, (BOX('sm2Chart')?.clientWidth) || 900, sparks));
    const nt = BOX('sm2Note'); if (nt) nt.textContent = `Selected: ${S.sel} · click any row or tile.`;
  }
  function loadBars() {
    if (bars || barsLoading) return barsLoading;
    barsLoading = fetch('./data/smartmoney-bars.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => { bars = j.bars || {}; render(); }).catch(() => { bars = { __absent: true }; render(); });
    return barsLoading;
  }
  function ensureFallback() {
    if (!M || !sparks) return;
    const lens = sortBy(S, lensRows(M, S).map((o) => ({ ...o, p2: o.r.p2 })), 'usd', 'ev', 'p2', 'pe').slice(0, SHOW_ROWS);
    const clusters = sortBy(S, slices(M, S).CL, 'usd', 'lf', 'p2', 'pbuy').slice(0, 12);
    const syms = [S.sel, ...lens.map((o) => o.t), ...clusters.map((r) => r.t)];
    if (syms.some((t) => t && !sparkValues(t, null, sparks))) loadBars();
  }
  function loadCharts() {
    if (chartsLoading) return chartsLoading;
    chartsLoading = fetch('./data/smartmoney-spark.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => {
        if (j.schema !== 'smartmoney-spark/1' || j.days !== 60 || !j.spark || typeof j.spark !== 'object' || Array.isArray(j.spark)) throw new Error('Invalid spark schema');
        return j;
      }).catch(() => null).then((j) => {
        if (!j) return loadBars();
        sparks = j; render();
      });
    return chartsLoading;
  }
  function render() {
    if (!M) return;
    if (!S.sel) S.sel = defaultSelection(M, S);
    set('sm2Quick', renderQuick(M, S));
    set('sm2Fresh', renderFresh(M));
    set('sm2Lens', renderLens(M, S, bars, sparks)); set('sm2Cl', renderCluster(M, S)); set('sm2D13', render13D(M, S)); set('sm2F13', render13F(M, S));
    set('sm2Etf', renderEtf(M, S)); set('sm2Sg', renderSingles(M, S)); set('sm2Pol', renderPol(M, S)); set('sm2Gap', renderGap());
    set('sm2Cards', renderPhone(M, S, bars, sparks)); set('sm2Foot', renderFoot(M));
    const hostW = BOX('sm2Main')?.clientWidth || 1800;
    if (S.view === 'plot') set('sm2Scat', renderPlot(M, S, hostW));
    if (S.view === 'heat') { set('sm2Leg', heatLegend()); const h = BOX('sm2Heat'); const r = renderHeat(M, S, h.clientWidth, h.clientHeight); h.innerHTML = r.html; set('sm2HeatN', `${r.n} tiles · grey = pctl n/a`); }
    drawSel(); ensureFallback();
  }
  function showView() {
    const isClassic = S.view === 'classic';
    BOX('sm2Main').hidden = isClassic;
    if (classic) classic.hidden = !isClassic;
    root.querySelectorAll('.smv').forEach((v) => v.classList.toggle('on', v.id === 'sm2-' + S.view));
    press('view', S.view);
  }
  function load() {
    if (loading) return loading;
    if (!M) set('sm2Fresh', '<span class="bdg"><span class="k">Loading</span>smart-money data…</span>');
    loading = Promise.all([fetch('./data/smartmoney.json', { cache: 'no-cache' }), fetch('./data/smartmoney-lens.json', { cache: 'no-cache' })])
      .then(async ([a, b]) => { if (!a.ok || !b.ok) throw new Error('HTTP ' + a.status + '/' + b.status); return [await a.json(), await b.json()]; })
      .then(([s, l]) => { sm = s; lens = l; M = buildModel(sm, lens); loadedAt = Date.now(); loading = null; render(); loadCharts(); })
      .catch((e) => { loading = null; if (!M) set('sm2Fresh', `<div class="sm-error">Smart-money data did not load (${esc(e && e.message ? e.message : e)}). Reopen the tab to retry.</div>`); });
    return loading;
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-stale]')) { S.openStale = !S.openStale; render(); return; }
    const b = e.target.closest('button,[data-t]');
    if (!b || !root.contains(b)) return;
    for (const k of ['cap', 'win', 'ext', 'sort']) if (b.dataset[k] != null) { S[k] = k === 'win' ? +b.dataset[k] : b.dataset[k]; press(k, b.dataset[k]); render(); return; }
    if (b.dataset.view) { S.view = b.dataset.view; showView(); render(); return; }
    if (b.dataset.t) { const dp = BOX('sm2Deep'), fromQuick = !!b.closest('#sm2Quick'); if (dp && fromQuick) dp.open = true; S.sel = b.dataset.t; drawSel(); ensureFallback(); const top = BOX('sm2Card'); if (top && fromQuick) top.scrollIntoView({ behavior: 'smooth', block: 'start' }); else if (top && window.scrollY > 600) window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  const seen = () => { if (!panel.hidden && (!M || Date.now() - loadedAt > DATA_STALE_MS)) load(); };
  new MutationObserver(seen).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  showView();
  seen();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
}
