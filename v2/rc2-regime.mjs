// RC2 C3a · REGIME tab additions (tab key `breadth`): TR1 index + sector mini-table driving one centre chart (Koyfin),
// TR8 period pills on that table (YCharts), TR4 futures positioning by trader class (CFTC TFF / disaggregated),
// TR5 event odds with 24h change + 24h volume (Polymarket / Kalshi). TR3 (n per horizon) lives in regime-tab.mjs.
// Standalone: reads static feeds only (no Supabase), renders into #r2Regime above the V2.20.0 Regime surface.
import { esc, finite, fPct, fX, fP, fPp, fUsd, fBig, fInt, ud, isExt, dLabel, mtTime, candleChart, stretchSeries, loadJson, mountHost, sortBy } from './rc2-t1-lib.mjs?v=V2.21.0';

export const PERIODS = [['1d', '1D'], ['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD']];
export const MACRO_TOPICS = ['fomc-decision', 'cpi-inflation', 'jobs-payrolls', 'gdp-growth', 'pce-inflation'];
const LS = 'rc2.regime';
const prefs = () => { try { return { period: '1d', sym: 'IWM', ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { period: '1d', sym: 'IWM' }; } };
const save = (p) => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* private mode */ } };

const db = (v, scale, txt) => { if (finite(v) == null) return '<td>not measured</td>'; const c = ud(v); return `<td><span class="db ${c}"><span class="${c}">${txt}</span><i style="width:${Math.min(100, (Math.abs(v) / scale) * 100).toFixed(0)}%"></i></span></td>`; };
const pctl = (p) => (finite(p) == null ? 'not measured' : `<span class="pc${isExt(p) ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>`);

/** TR1 + TR8: the index / sector table, sorted by the chosen period (indexes pinned on top). Pure. */
export function renderSectorTable(D, period, sym) {
  const lab = PERIODS.find((p) => p[0] === period)?.[1] || '1D';
  const rows = Object.entries(D.table).map(([t, r]) => ({ t, ...r }));
  const idx = rows.filter((r) => r.grp === 'INDEX'), sec = sortBy(rows.filter((r) => r.grp === 'SECTOR'), (r) => r.ret[period]);
  const scale = Math.max(0.5, ...rows.map((r) => Math.abs(r.ret[period] ?? 0)));
  const tr = (r) => `<tr class="r2-click${r.t === sym ? ' sel' : ''}${isExt(r.p) ? ' ext' : ''}" data-r2-sym="${esc(r.t)}" tabindex="0"><th><b>${esc(r.t)}</b> <small>${esc(r.name)}</small></th><td>${fUsd(r.close)}</td>${db(r.ret[period], scale, fPct(r.ret[period]))}<td class="${ud(r.x)}">${fX(r.x)}</td><td>${pctl(r.p)}</td></tr>`;
  const pills = `<div class="r2-pills" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button type="button" data-r2-per="${k}" aria-pressed="${k === period}">${l}</button>`).join('')}</div>`;
  return `${pills}<div class="tw"><table class="t r2-sect"><thead><tr><th class="l">Index / sector ETF</th><th>Price</th><th>${lab} return</th><th>×ATR from 8EMA</th><th>2-yr pctl</th></tr></thead><tbody>${idx.map(tr).join('')}<tr class="r2-sep"><td colspan="5"></td></tr>${sec.map(tr).join('')}</tbody></table></div>
  <p class="note">Sectors sorted by the ${lab} return, strongest on top · YTD from the ${esc(dLabel(D.ytd_base))} close · ×ATR = (close − EMA8) ÷ ATR14 · 2-yr pctl from sectors-2y.json · gold row = at or beyond the 5th / 95th pctl · click a row to put it in the centre chart.</p>`;
}

/** Centre chart for one ticker: daily candles + volume + the ×ATR-from-8EMA pane. Pure. */
export function renderCentreChart(D, sym) {
  const b = D.candles[sym] || D.candles.IWM; const t = D.candles[sym] ? sym : 'IWM'; const r = D.table[t];
  const st = stretchSeries(b).slice(-60);
  const pane = { label: `${t} ×ATR from 8EMA (bars, green above / red below)`, values: st, mode: 'signed', fmt: (v) => fX(v, 1) };
  const ttl = `${t} · ${r.name} · daily · 60 sessions to ${dLabel(D.as_of)} · % scale vs the prior close`;
  return `<div class="r2-chart-wd">${candleChart(b, { w: 980, h: 520, title: ttl, panes: [pane] })}</div><div class="r2-chart-ph">${candleChart(b, { w: 380, h: 380, title: `${t} · daily · 60 sessions`, panes: [pane], compact: true })}</div>
  <p class="note">${esc(t)} ${fUsd(r.close)} · 1D ${fPct(r.ret['1d'])} · 1M ${fPct(r.ret['1m'])} · ${fX(r.x)} ATR from 8EMA (${fP(r.p)} 2-yr pctl). Daily bars carry no VWAP (VWAP is drawn on the 2-minute charts).</p>`;
}

/** TR4: futures positioning by trader class, one row per contract. Pure. */
export function renderCot(snap) {
  const c = snap?.cot; const rows = Array.isArray(c?.contracts) ? c.contracts : [];
  if (!rows.length) return '<section class="panel"><h2>Futures positioning by trader class</h2><p class="sub">CFTC positions not measured (feed missing).</p></section>';
  const sc1 = Math.max(10, ...rows.map((r) => Math.abs(r.primary_net_pct_oi ?? 0))), sc2 = Math.max(10, ...rows.map((r) => Math.abs(r.secondary_net_pct_oi ?? 0)));
  const body = rows.map((r) => `<tr><th><b>${esc(r.key)}</b> <small>${esc(r.label)}</small></th><td class="opt">${fInt(r.open_interest)} contracts</td><td class="l"><small>${esc(r.primary_label)}</small></td><td class="${ud(r.primary_net)}">${fBig(r.primary_net, 'contracts')}</td>${db(r.primary_net_pct_oi, sc1, fP(r.primary_net_pct_oi))}<td class="${ud(r.primary_weekly_change)}">${fBig(r.primary_weekly_change, 'contracts')}</td><td class="l opt"><small>${esc(r.secondary_label)}</small></td><td class="opt ${ud(r.secondary_net)}">${fBig(r.secondary_net, 'contracts')}</td>${db(r.secondary_net_pct_oi, sc2, fP(r.secondary_net_pct_oi)).replace('<td>', '<td class="opt">')}</tr>`).join('');
  return `<section class="panel"><h2>Futures positioning by trader class</h2><p class="sub">CFTC Commitments of Traders (TFF for financials, disaggregated for commodities) · positions ${esc(dLabel(c.report_date))} (Tuesday), released the Friday after · feed built ${esc(mtTime(snap.generated_at))} · net = long − short · green net long, red net short</p>
  <div class="tw"><table class="t r2-cot"><thead><tr><th class="l">Contract</th><th class="opt">Open interest</th><th class="l">Class</th><th>Net</th><th>Net % of OI</th><th>Week change</th><th class="l opt">Class</th><th class="opt">Net</th><th class="opt">Net % of OI</th></tr></thead><tbody>${body}</tbody></table></div>
  <p class="note">${rows.length} of ${c.contracts_expected ?? rows.length} contracts measured · a 2-yr percentile needs the CFTC history backfill: not measured.</p></section>`;
}

/** TR5: event odds, macro topics open, earnings-linked folded. Pure. */
export function renderOdds(pm) {
  const topics = Array.isArray(pm?.topics) ? pm.topics : [];
  if (!topics.length) return '<section class="panel"><h2>Event odds</h2><p class="sub">Prediction-market odds not measured (feed missing).</p></section>';
  const vol = (c) => (finite(c.volume_24h_usd) != null ? fBig(c.volume_24h_usd, '$') : finite(c.volume_24h_contracts) != null ? fBig(c.volume_24h_contracts, 'contracts') : 'not measured');
  const row = (t, c, first, span) => `<tr>${first ? `<th rowspan="${span}">${esc(String(t.label).replace(/\s*·\s*/, ' · '))}</th>` : ''}<td class="l w">${esc(c.contract_label || c.question)}<small>${esc(c.question || '')}</small></td><td><b>${fP(c.probability_pct)}</b></td><td class="${ud(c.delta_24h_pp)}">${fPp(c.delta_24h_pp)}</td><td>${vol(c)}</td><td class="opt">${esc(c.provider === 'POLYMARKET' ? 'Polymarket' : c.provider === 'KALSHI' ? 'Kalshi' : c.provider || '')}</td></tr>`;
  const block = (t, cap) => { const cs = (t.contracts || []).slice().sort((a, b) => (b.probability_pct ?? -1) - (a.probability_pct ?? -1)).slice(0, cap); return cs.map((c, i) => row(t, c, i === 0, cs.length)).join(''); };
  const head = '<thead><tr><th class="l">Event</th><th class="l">Outcome</th><th>Odds</th><th>24h change</th><th>24h volume</th><th class="opt">Venue</th></tr></thead>';
  const macro = topics.filter((t) => MACRO_TOPICS.includes(t.id) || /FOMC|CPI|JOBS|GDP|PCE/i.test(t.label));
  const other = topics.filter((t) => !macro.includes(t));
  const un = pm.coverage?.unavailable_topics || [];
  return `<section class="panel"><h2>Event odds</h2><p class="sub">Polymarket + Kalshi, the 2 most likely outcomes per macro event · odds as of ${esc(mtTime(pm.generated_at))} · 24h change in pp</p>
  <div class="tw"><table class="t r2-odds">${head}<tbody>${macro.map((t) => block(t, 2)).join('')}</tbody></table></div>
  ${other.length ? `<details class="fold"><summary>Earnings-linked odds<span>${other.length} topics</span></summary><div class="tw"><table class="t r2-odds">${head}<tbody>${other.map((t) => block(t, 1)).join('')}</tbody></table></div></details>` : ''}
  <p class="note">${un.length ? `${un.length} topics had no open market on either venue: ${esc(un.map((u) => u.topic_label).join(', '))}. ` : ''}A null 24h change prints "not measured" (most Kalshi contracts).</p></section>`;
}

export function renderRegimeRc2(D, feeds, st) {
  const { snap, pm } = feeds; const rows = snap?.breadth?.rows || []; const last = rows.at(-1);
  const meta = `Index + sector daily bars to the ${esc(dLabel(D.as_of))} close (rc2-t1.json built ${esc(mtTime(D.generated_at))}) · 8EMA breadth through ${last ? esc(dLabel(last.et_date)) : 'not measured'}${last?.measured_at ? ` (measured ${esc(mtTime(last.measured_at))})` : ''} · CFTC positions ${snap?.cot?.report_date ? esc(dLabel(snap.cot.report_date)) : 'not measured'} · odds ${pm ? esc(mtTime(pm.generated_at)) : 'not measured'}`;
  return `<div class="head"><h1>Regime</h1><span class="r2-meta">${meta}</span></div>
  <div class="r2-g2 r2-lead"><section class="panel"><h2>Indices and sectors</h2><p class="sub">Click a row: its candles go in the centre chart</p><div data-r2-table>${renderSectorTable(D, st.period, st.sym)}</div></section>
  <section class="panel"><h2>Centre chart</h2><p class="sub">Daily candles, EMA 8 orange, BB 20,2 purple, volume, then ×ATR from the 8EMA as bars</p><div data-r2-chart>${renderCentreChart(D, st.sym)}</div></section></div>
  <div class="r2-g2">${renderCot(snap)}${renderOdds(pm)}</div>`;
}

async function boot() {
  const host = mountHost('r2Regime', '#breadthAsOf', 'before', 'r2-regime'); if (!host) return;
  host.innerHTML = '<div class="loading-card">Loading index and sector bars…</div>';
  const [D, snap, pm] = await Promise.all([loadJson('./data/rc2-t1.json'), loadJson('./data/breadth-tape.json'), loadJson('./data/prediction-markets.json')]);
  if (!D) { host.innerHTML = '<p class="read">Index and sector bars not measured (rc2-t1.json missing).</p>'; return; }
  const st = prefs(); if (!D.table[st.sym]) st.sym = 'IWM'; if (!PERIODS.some((p) => p[0] === st.period)) st.period = '1d';
  host.innerHTML = renderRegimeRc2(D, { snap, pm }, st);
  document.getElementById('view-breadth')?.classList.add('r2-on');
  const pick = (sym) => { st.sym = sym; save(st); host.querySelector('[data-r2-chart]').innerHTML = renderCentreChart(D, sym); host.querySelectorAll('[data-r2-sym]').forEach((r) => r.classList.toggle('sel', r.dataset.r2Sym === sym)); };
  host.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-r2-per]'); if (p) { st.period = p.dataset.r2Per; save(st); host.querySelector('[data-r2-table]').innerHTML = renderSectorTable(D, st.period, st.sym); return; }
    const r = ev.target.closest('[data-r2-sym]'); if (r) pick(r.dataset.r2Sym);
  });
  host.addEventListener('keydown', (ev) => { const r = ev.target.closest?.('[data-r2-sym]'); if (r && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pick(r.dataset.r2Sym); } });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
