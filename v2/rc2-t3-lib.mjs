// RC2 C3c (History, Themes, Smart money): pure helpers + models shared by rc2-t3-history / -themes / -smart.
// Reads published feeds only (history-mr, mrmap, themes-matrix, smartmoney, smartmoney-lens). No scores, no grades,
// no buy/sell words. Every count carries the rule that produced it. SNDK / SENEA stay out (split artefacts), never named.
import { km, survAt, isExtreme } from './history-mr-core.mjs?v=V2.19.0';

export const EXCL = new Set(['SNDK', 'SENEA']);
export const EXCL_NOTE = '2 names with split artefacts excluded';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fin = (v) => v != null && Number.isFinite(+v);
const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
export const pct = (v, d = 2) => (fin(v) ? `${sg(v)}${Math.abs(v).toFixed(d)}%` : 'not measured');
export const xatr = (v, d = 2) => (fin(v) ? `${sg(v)}${Math.abs(v).toFixed(d)}× ATR` : 'not measured');
export const mult = (v, d = 2) => (fin(v) ? `${(+v).toFixed(d)}×` : 'not measured');
export const pctl = (p, d = 1) => (fin(p) ? `${(+p).toFixed(d)}% pctl` : 'not measured');
export const money = (v) => {
  if (!fin(v)) return 'not measured';
  const a = Math.abs(v); const s = v < 0 ? '−' : '';
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(1)}K` : `${s}$${a.toFixed(0)}`;
};
export const price = (v) => (!fin(v) ? 'not measured' : v < 1 ? `$${(+v).toFixed(4)}` : `$${(+v).toFixed(2)}`);
export const cls = (v) => (!fin(v) || +v === 0 ? '' : v > 0 ? 'up' : 'dn');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dshort = (d) => { if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return 'not measured'; const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${MON[m - 1]} ${dd}`; };
export const dlong = (d) => (d && /^\d{4}/.test(d) ? `${dshort(d)} ${d.slice(0, 4)}` : 'not measured');
// ISO UTC instant -> "Mon Nov 23 2026, 9:32 PM MT"
export const mtStamp = (iso) => {
  if (!iso) return 'not measured';
  const t = new Date(iso); if (Number.isNaN(t.getTime())) return 'not measured';
  const day = t.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  const hm = t.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dlong(day)}, ${hm} MT`;
};
// "2026-11-23 21:33 MT" or "2026-11-20 21:45:18 MT" (already MT, 24-hour) -> 12-hour label
export const mt24 = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})/.exec(String(s || '')); if (!m) return 'not measured';
  const h = +m[2]; const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
  return `${dlong(m[1])}, ${h12}:${m[3]} ${ap} MT`;
};
export const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5) : null);
export const capBucket = (usd) => (!fin(usd) ? null : usd < 2e9 ? 'Small' : usd <= 10e9 ? 'Mid' : 'Large');
export const CAPS = ['All', 'Small', 'Mid', 'Large'];
export const mrIndex = (mm) => { const out = new Map(); if (!mm?.cols) return out; const c = mm.cols; for (const row of mm.rows || []) { const o = {}; c.forEach((k, i) => { o[k] = row[i]; }); out.set(o.t, o); } return out; };

// ---------- HISTORY ----------
export const FULL_WINDOW = 500; // a "2-yr" rank needs 500 sessions of own history behind it
export const extreme = (r) => isExtreme(r.pFlag);
export const extremeFull = (r) => isExtreme(r.pFlag) && r.pN != null && r.pN >= FULL_WINDOW;
export const BANDS5 = [['≤ 5th', (p) => p <= 5], ['5th to 50th', (p) => p > 5 && p < 50], ['50th to 80th', (p) => p >= 50 && p < 80], ['80th to 95th', (p) => p >= 80 && p < 95], ['≥ 95th', (p) => p >= 95]];
const dur = (r) => (r.status === 'resolved' ? (r.toRes != null ? { t: r.toRes, e: true } : null) : (r.so != null ? { t: r.so, e: false } : null));
// Kaplan-Meier on a run list: median sessions to resolve (open runs censored) + share resolved within 5 sessions.
export function kmSum(list) {
  const items = list.map(dur).filter(Boolean);
  const res = list.filter((r) => r.status === 'resolved').length;
  if (!items.length) return { n: list.length, res, open: list.length - res, med: null, bound: false, in5: null, runSize: null };
  const K = km(items);
  const rs = list.map((r) => r.runSize).filter(fin).sort((a, b) => a - b);
  const runSize = rs.length ? (rs.length % 2 ? rs[(rs.length - 1) / 2] : (rs[rs.length / 2 - 1] + rs[rs.length / 2]) / 2) : null;
  return { n: list.length, res, open: list.length - res, med: K.med, bound: K.bound, maxT: K.maxT, in5: (1 - survAt(K, 5)) * 100, runSize };
}
export const kmLabel = (s) => (s.med == null ? 'no base rate yet' : s.bound ? `> ${s.maxT} sess` : `${s.med} sess`);
export function runCap(r, MR) {
  const m = MR.get(r.t);
  if (m && fin(m.cap)) return capBucket(m.cap * 1e6);
  return r.book === 'SC' ? 'Small' : null; // SC-book run with no cap on file counts as Small; ML with none: All only
}
// ui = { cap: All|Small|Mid|Large, side: All|up|down }
export function historyModel(snap, MR, ui = {}) {
  const U = { cap: 'All', side: 'All', ...ui };
  const all = (snap.runs || []).filter((r) => !EXCL.has(r.t));
  const excluded = (snap.runs || []).length - all.length;
  const runs = all.filter((r) => (U.cap === 'All' || runCap(r, MR) === U.cap) && (U.side === 'All' || r.dir === U.side));
  const open = runs.filter((r) => r.status !== 'resolved').sort((a, b) => (b.so ?? -1) - (a.so ?? -1) || a.t.localeCompare(b.t));
  const ext = runs.filter(extreme); const extFull = ext.filter((r) => r.pN >= FULL_WINDOW);
  const bands = (dir) => {
    const q = runs.filter((r) => r.dir === dir);
    return { n: q.length, rows: BANDS5.map(([lab, f]) => ({ lab, ext: lab.startsWith('≤') || lab.startsWith('≥'), ...kmSum(q.filter((r) => r.pFlag != null && f(r.pFlag))) })), all: kmSum(q), noP: q.filter((r) => r.pFlag == null).length };
  };
  const up = bands('up'); const down = bands('down');
  const bandExt = [up, down].reduce((s, b) => s + b.rows[0].n + b.rows[4].n, 0);
  return {
    U, runs, all, excluded, open, ext, extFull, bandExt, up, down, total: kmSum(runs),
    sc: kmSum(runs.filter((r) => r.book === 'SC')), ml: kmSum(runs.filter((r) => r.book === 'ML')),
    nUp: runs.filter((r) => r.dir === 'up').length, nDown: runs.filter((r) => r.dir === 'down').length,
    noCapML: all.filter((r) => runCap(r, MR) == null).length,
    straddle: runs.filter((r) => r.straddle?.length).length,
  };
}

// ---------- THEMES ----------
export const PERIODS_T = [['d1', '1D'], ['d3', '3D'], ['d5', '5D'], ['d20', '20D']];
export const litRules = (t) => [t.rule_a && 'rule a', t.rule_b && 'rule b', t.rule_build3 && '3-day build'].filter(Boolean);
export function themesModel(tm, ui = {}) {
  const U = { period: 'd1', cap: 'All', ...ui };
  const P = U.period;
  const capOk = (m) => U.cap === 'All' || capBucket(m.cap) === U.cap;
  const themes = (tm.themes || []).map((t) => {
    const mem = (t.members || []).filter((m) => !EXCL.has(m.t) && m.priced !== false && fin(m.xatr) && capOk(m));
    const lo = mem.length ? mem.reduce((a, b) => (b.xatr < a.xatr ? b : a)) : null;
    const hi = mem.length ? mem.reduce((a, b) => (b.xatr > a.xatr ? b : a)) : null;
    return { name: t.name, n: t.n, nPriced: t.n_priced, vs: t.vs?.[P], own: t[P], ratio: t.ratio, swing: t.swing, rvol: t.rvol, xs: t.xs || [], lit: litRules(t), lo, hi, nMem: mem.length };
  }).sort((a, b) => (b.vs ?? -1e9) - (a.vs ?? -1e9));
  const members = [];
  for (const t of tm.themes || []) for (const m of t.members || []) if (!EXCL.has(m.t) && fin(m.xatr) && capOk(m)) members.push({ ...m, theme: t.name });
  const seen = new Map(); for (const m of members) { const k = m.t; if (!seen.has(k)) seen.set(k, { ...m, themes: [m.theme] }); else seen.get(k).themes.push(m.theme); }
  const uniq = [...seen.values()];
  const below = uniq.filter((m) => m.xatr < 0).sort((a, b) => a.xatr - b.xatr);
  const above = uniq.filter((m) => m.xatr > 0).sort((a, b) => b.xatr - a.xatr);
  const ext1y = uniq.filter((m) => fin(m.p252) && (m.p252 <= 5 || m.p252 >= 95));
  const lit = themes.filter((t) => t.lit.length);
  const big = (tm.themes || []).filter((t) => fin(t.ratio)).sort((a, b) => b.ratio - a.ratio)[0] || null;
  return { U, themes, lit, big, iwm: tm.iwm?.[P], iwmAll: tm.iwm || {}, below, above, nNames: uniq.length, ext1y, period: PERIODS_T.find(([k]) => k === P)?.[1] || '1D' };
}

// ---------- SMART MONEY ----------
// Rules copied from the T3 sample (FIXES.md job A3) so the counts trace: see the rule strings printed next to each.
export function smartModel(sm, lens, MR, ui = {}) {
  const U = { cap: 'All', ...ui };
  const asof = sm.prices?.asof_date;
  const ev = new Map(); const add = (t, e) => { if (!t || EXCL.has(t)) return; if (!ev.has(t)) ev.set(t, []); ev.get(t).push(e); };
  for (const r of sm.clusters?.rows || []) { if (r.ipo_suspect) continue; add(r.ticker, { k: 'Insider cluster', date: r.window_end, filed: r.last_filed, lag: r.lag_days, who: `${r.n_insiders} insiders · ${(r.titles || []).slice(0, 3).join(' · ')}`, since: r.mr?.since_first_buy_pct, sinceL: 'since first buy', cap: r.market_cap, name: r.issuer_name }); }
  const seen = new Set();
  for (const r of [...(sm.singles?.rows || [])].sort((a, b) => a.win - b.win)) { if (seen.has(r.ticker) || r.ipo_suspect) continue; seen.add(r.ticker); add(r.ticker, { k: 'Insider buy', date: r.window_end, filed: r.last_filed, lag: r.lag_days, who: `${r.insiders?.[0]?.name || '1 insider'}`, since: r.mr?.since_first_buy_pct, sinceL: 'since first buy', cap: r.market_cap, name: r.issuer_name }); }
  for (const r of sm.sched13?.rows || []) add(r.ticker, { k: r.family, date: r.event_date, filed: r.filed_day, lag: daysBetween(r.event_date, r.filed_day), who: `${r.filer} · ${fin(r.percent_class) ? `${r.percent_class}% of class` : '% of class not stated'}`, since: r.mr?.since_filed_pct, sinceL: 'since filed', cap: r.market_cap, name: r.subject_name });
  const Q = sm.f13?.quarter || '13F';
  for (const r of sm.f13?.rows || []) add(r.ticker, { k: `13F ${String(r.change || '').toLowerCase()}`, date: sm.f13.period_end, filed: r.filed, lag: daysBetween(sm.f13.period_end, r.filed), who: `${r.manager}${fin(r.pct_of_portfolio) ? ` · ${r.pct_of_portfolio}% of fund` : ''} · ${Q}`, since: r.vs_qe_price_pct, sinceL: 'since quarter end', cap: r.market_cap, name: r.name });
  for (const r of sm.politicians?.rows || []) add(r.ticker, { k: `House ${r.type}`, date: r.trade_date, filed: r.filed_date, lag: r.lag_days, who: `${r.member} (${r.party}-${r.state}) · $${Number(r.amount_low).toLocaleString('en-US')} to $${Number(r.amount_high).toLocaleString('en-US')}`, since: r.pct_since_trade, sinceL: `trade to ${dshort(sm.politicians.price_asof)} close`, cap: r.market_cap, name: r.company, stale: true });
  for (const side of ['in', 'out']) for (const r of lens.etf?.[side] || []) add(r.ticker, { k: `ETF flow ${side}`, date: lens.etf.week_end, filed: lens.etf.week_end, lag: null, who: `${money(r.flow_usd)} · ${pct(r.flow_pct_aum)} of AUM`, since: null, sinceL: '', cap: null, name: r.name });

  const capOf = (t, e0) => { const m = MR.get(t); return m && fin(m.cap) ? m.cap * 1e6 : e0?.cap ?? null; };
  let universe = 0; const ext = [];
  for (const [t, s] of Object.entries(lens.str || {})) {
    if (EXCL.has(t) || s.gap || s.d !== asof || s.p2 == null) continue;
    universe++;
    if (!(s.p2 <= 5 || s.p2 >= 95)) continue;
    const evs = (ev.get(t) || []).slice().sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
    if (!evs.length) continue;
    const cap = capOf(t, evs[0]);
    ext.push({ t, p2: s.p2, x: s.x, c: s.c, cap, capB: capBucket(cap), e: evs[0], nev: evs.length });
  }
  const extAll = ext; const extF = ext.filter((r) => U.cap === 'All' || r.capB === U.cap);
  const below = extF.filter((r) => r.p2 <= 5).sort((a, b) => a.x - b.x);
  const above = extF.filter((r) => r.p2 >= 95).sort((a, b) => b.x - a.x);
  const cAsof = sm.clusters?.asof_day; const cFrom = cAsof ? new Date(Date.parse(cAsof) - 30 * 864e5).toISOString().slice(0, 10) : '';
  const capOkR = (r) => U.cap === 'All' || capBucket(capOf(r.ticker, { cap: r.market_cap })) === U.cap;
  const c30 = (sm.clusters?.rows || []).filter((r) => !r.ipo_suspect && r.window_end > cFrom && !EXCL.has(r.ticker) && capOkR(r));
  const d13 = (sm.sched13?.rows || []).filter((r) => r.family === '13D' && r.filed_day > cFrom && !EXCL.has(r.ticker) && capOkR(r));
  const roll = [...(sm.f13?.rollup || [])].filter((r) => !EXCL.has(r.ticker) && capOkR(r)).sort((a, b) => b.n_buyers - a.n_buyers || b.buy_usd - a.buy_usd);
  const lensOf = (t) => { const s = lens.str?.[t]; return !s || s.gap || s.d !== asof ? { x: null, p2: null } : { x: s.x, p2: s.p2 }; };
  return {
    U, asof, universe, ext: extAll, extN: extF.length, below, above, cFrom, cAsof,
    clusters: c30.sort((a, b) => b.window_end.localeCompare(a.window_end)).map((r) => ({ ...r, ...lensOf(r.ticker) })),
    clusterUsd: c30.reduce((s, r) => s + (r.total_usd || 0), 0),
    d13: d13.sort((a, b) => String(b.filed_mt).localeCompare(String(a.filed_mt))),
    roll, etf: lens.etf, lensTickers: Object.keys(lens.str || {}).length,
  };
}
