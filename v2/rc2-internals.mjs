// RC2 C3a · INTERNALS tab additions: TI1 daily mover-count grid (Stockbee Market Monitor idea), TI3 breadth panes under
// SPY candles (TrendSpider), TI6 put/call vs its own 50-day average (Index Indicators), TI9 new highs over 14 / 21 / 64
// sessions (TrendSpider). Standalone: static feeds only; renders into #r2Internals above the V2.20.0 Internals surface.
import { esc, finite, fPct, fX, fP, fInt, ud, isExt, dLabel, mtTime, candleChart, vsOwnAverage, loadJson, mountHost } from './rc2-t1-lib.mjs?v=V2.23.1';

import { infoChip } from './info-chip.mjs?v=V2.23.1';
/** Values of a [{date,value}] series aligned to a date list (null where missing). Pure. */
export function alignByDate(dates, series) { const m = new Map((series || []).filter((p) => p && p.date).map((p) => [p.date, finite(p.value)])); return dates.map((d) => (m.has(d) ? m.get(d) : null)); }

// TI1 columns: [key, label, side] side: up = green, dn = red, ratio = green above 1 / red below, lvl = white
export const MM_COLS = [['up4', 'Up 4%+', 'up'], ['down4', 'Down 4%+', 'dn'], ['ratio5', '5-day ratio', 'ratio'], ['ratio10', '10-day ratio', 'ratio'], ['up25q', 'Up 25%+ quarter', 'up'], ['down25q', 'Down 25%+ quarter', 'dn'], ['up25m', 'Up 25%+ month', 'up'], ['down25m', 'Down 25%+ month', 'dn'], ['up13_34', 'Up 13%+ 34-day', 'up'], ['down13_34', 'Down 13%+ 34-day', 'dn'], ['t2108', 'T2108', 'lvl'], ['ext_below2_pct', '≥2 ATR below 8EMA', 'dn'], ['ext_above2_pct', '≥2 ATR above 8EMA', 'up']];
const isPctKey = (k) => k === 't2108' || k.endsWith('_pct');

/** One TI1 cell: coloured count + its 2-yr pctile with a thin bar; gold outline at <= 5th / >= 95th. Pure. */
export function mmCell(row, key, side) {
  const v = finite(row?.[key]); const p = finite(row?.pct?.[key]);
  if (v == null) return '<td>not measured</td>';
  const txt = side === 'ratio' ? `${v.toFixed(2)}×` : isPctKey(key) ? `${v.toFixed(1)}%` : fInt(v);
  const cls = side === 'up' ? 'up' : side === 'dn' ? 'dn' : side === 'ratio' ? (v > 1 ? 'up' : v < 1 ? 'dn' : '') : '';
  const bar = p == null ? '' : `<i style="width:${Math.max(2, p).toFixed(0)}%"></i>`;
  return `<td class="${isExt(p) ? 'gx' : ''}"><span class="db ${cls}"><span class="${cls}">${txt}</span>${bar}</span><small>${p == null ? 'pctl not measured' : `${p.toFixed(0)}% pctl`}</small></td>`;
}

export function renderMonitorGrid(mm) {
  const rows = Array.isArray(mm?.rows) ? mm.rows : [];
  if (!rows.length) return '<section class="panel"><h2>Market monitor</h2><p class="sub">Market monitor not measured (feed missing).</p></section>';
  const head = `<thead><tr><th class="l">Session</th>${MM_COLS.map(([, l, s]) => `<th>${esc(l)}<small>${s === 'ratio' ? '×' : l === 'T2108' || l.includes('ATR') ? '% of names' : 'stocks'}</small></th>`).join('')}</tr></thead>`;
  const tr = (r) => `<tr data-walk-row data-walk-key="mm-${esc(r.date)}" data-walk-focus><th>${esc(dLabel(r.date))}</th>${MM_COLS.map(([k, , s]) => mmCell(r, k, s)).join('')}</tr>`;
  const open = rows.slice(0, 10), rest = rows.slice(10);
  const u = rows[0];
  return `<section class="panel"><h2>Market monitor · daily mover counts, newest first</h2><p class="sub">Stockbee Market Monitor idea (his scan rules from the 2011 TC2000 code; his sheet itself not seen) · top ${fInt(u.universe_n)} US common stocks by 20-day $ volume · to the ${esc(dLabel(mm.as_of))} close, built ${esc(mtTime(mm.generated_at_mt))} · small number = its 2-yr (500-session) pctl, gold cell = at or beyond the 5th / 95th</p>
  <div class="tw"><table class="t r2-mm">${head}<tbody>${open.map(tr).join('')}</tbody></table></div>
  ${rest.length ? `<details class="fold"><summary>Show ${rest.length} earlier sessions<span>${esc(dLabel(rest.at(-1).date))} → ${esc(dLabel(rest[0].date))}</span></summary><div class="tw"><table class="t r2-mm">${head}<tbody>${rest.map(tr).join('')}</tbody></table></div></details>` : ''}
  <p class="note">Green = up-side counts, red = down-side counts (heat-map colours, not P&amp;L); ratios green above 1.00×, red below. Universe is today's roster applied to past sessions (survivorship bias possible).</p></section>`;
}

/** TI9: new 14 / 21 / 64-session highs and lows per session. Pure. */
export function renderNewHighs(nh) {
  const rows = Array.isArray(nh?.rows) ? nh.rows : [];
  if (!rows.length) return '<section class="panel"><h2>New highs over 14 / 21 / 64 sessions</h2><p class="sub">Not measured (rc2-t1.json missing).</p></section>';
  const W = nh.windows || [14, 21, 64]; const last = rows.at(-1);
  const mx = Math.max(1, ...rows.slice(-12).flatMap((r) => W.flatMap((w) => [r[`h${w}`], r[`l${w}`]])));
  const cell = (v, cls) => `<td><span class="db ${cls}"><span class="${cls}">${fInt(v)}</span><i style="width:${Math.min(100, (v / mx) * 100).toFixed(0)}%"></i></span></td>`;
  const net = (r, w) => { const v = r[`h${w}`] - r[`l${w}`]; return `<td class="${ud(v)}">${v > 0 ? '+' : v < 0 ? '−' : ''}${fInt(Math.abs(v))}</td>`; };
  const body = rows.slice(-12).reverse().map((r) => `<tr data-walk-row data-walk-key="hl-${esc(r.d)}" data-walk-focus><th>${esc(dLabel(r.d))}</th>${W.map((w) => `${cell(r[`h${w}`], 'up')}${cell(r[`l${w}`], 'dn')}${net(r, w).replace('<td', '<td class="opt"').replace('class="opt" class="', 'class="opt ')}`).join('')}</tr>`).join('');
  const tiles = W.map((w) => { const h = last[`h${w}`], l = last[`l${w}`]; return `<div class="r2-tile"><div class="k">${w}-session highs vs lows · of ${fInt(last[`n${w}`])} names</div><div class="v"><span class="up">${fInt(h)}</span> · <span class="dn">${fInt(l)}</span></div><div class="s">net ${h - l > 0 ? '+' : h - l < 0 ? '−' : ''}${fInt(Math.abs(h - l))} stocks · ${fP((h / last[`n${w}`]) * 100)} / ${fP((l / last[`n${w}`]) * 100)} of names</div></div>`; }).join('');
  return `<section class="panel"><h2>New highs over 14 / 21 / 64 sessions ${infoChip(`Stocks whose daily high beat the prior ${W.map((w) => w - 1).join(' / ')} sessions' highest high (lows: below the lowest low) · ${fInt(nh.universe_n)} MR-map names (2 names with split artefacts excluded, plus split-suspect names) · Massive grouped daily bars to the ${esc(dLabel(last.d))} close · 12 newest sessions`)}</h2>
  <div class="r2-tiles r2-t3">${tiles}</div>
  <div class="tw"><table class="t"><thead><tr><th class="l">Session</th>${W.map((w) => `<th>${w}-sess highs<small>stocks</small></th><th>${w}-sess lows<small>stocks</small></th><th class="opt">Net<small>stocks</small></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
  <p class="note">No 2-yr percentile yet (the file carries ${rows.length} sessions), so no gold. Bars unadjusted: a split inside the window can add a false high or low.</p></section>`;
}

/** TI6: put/call vs its own 50-day average, for the three Cboe ratios. Pure. */
export function renderPutCall(tiles) {
  const ids = [['cboe_put_call_equity', 'Equity put/call'], ['cboe_put_call_total', 'Total put/call'], ['cboe_put_call_index', 'Index put/call']];
  const rows = ids.map(([id, label]) => ({ id, label, t: tiles?.[id], v: vsOwnAverage(tiles?.[id]?.spark || [], 50) })).filter((r) => r.v.length);
  if (!rows.length) return '<section class="panel"><h2>Put/call vs its 50-day average</h2><p class="sub">Not measured (fewer than 50 sessions in the feed).</p></section>';
  const bars = (v) => { const d = v.map((p) => p.diffPct); const m = Math.max(1, ...d.map(Math.abs)); return `<span class="r2-mini">${d.map((q) => `<i class="${q >= 0 ? 'up' : 'dn'}" style="height:${Math.max(2, (Math.abs(q) / m) * 100).toFixed(0)}%;${q >= 0 ? '' : 'align-self:flex-start'}"></i>`).join('')}</span>`; };
  const body = rows.map(({ label, t, v }) => { const L = v.at(-1); return `<tr data-walk-row data-walk-key="rt-${esc(label)}" data-walk-focus><th>${esc(label)}<small>${esc(dLabel(L.date))}</small></th><td>${L.value.toFixed(2)}×</td><td>${L.avg.toFixed(2)}×</td><td class="${ud(L.diff)}">${fX(L.diff)}</td><td class="${ud(L.diffPct)}">${fPct(L.diffPct, 1)}</td><td class="opt">${bars(v)}<small>${v.length} sessions with a 50-day average</small></td></tr>`; }).join('');
  return `<section class="panel"><h2>Put/call vs its own 50-day average ${infoChip(`Index Indicators style: today's Cboe ratio minus its trailing 50-session mean · above the average = more puts than usual (green bars above, red below) · internals-series.json to the ${esc(dLabel(rows[0].t?.as_of))} close`)}</h2>
  <div class="tw"><table class="t"><thead><tr><th class="l">Ratio</th><th>Today</th><th>50-day avg</th><th>vs avg</th><th>vs avg %</th><th class="opt">vs avg, each session</th></tr></thead><tbody>${body}</tbody></table></div>
  <p class="note">The feed ships 60 sessions per series, so the 50-day average exists for the last ${rows[0].v.length} sessions only; a 2-yr percentile of the gap is not measured.</p></section>`;
}

/** TI3: SPY daily candles with breadth panes beneath (each series drawn as bars). Pure. */
export function renderBreadthChart(D, ser) {
  const b = D?.candles?.SPY; if (!b) return '<section class="panel"><h2>Breadth under the candles</h2><p class="sub">SPY bars not measured.</p></section>';
  const dates = b.slice(-60).map((x) => x[0]); const T = ser?.tiles || {}; const mm = ser?.market_monitor || {};
  const nhm = new Map((D.newhighs?.rows || []).map((r) => [r.d, r]));
  const panes = [
    { label: 'Stocks above 50-day MA, % (level bars)', values: alignByDate(dates, T.pct_above_50dma?.spark), mode: 'level', fmt: (v) => `${v.toFixed(0)}%` },
    { label: 'Up 4%+ (green) vs down 4%+ (red), stocks', values: alignByDate(dates, mm.series60?.up4), values2: alignByDate(dates, mm.series60?.down4), mode: 'updown', fmt: (v) => fInt(v) },
    { label: 'New 21-session highs (green) vs lows (red), stocks', values: dates.map((d) => nhm.get(d)?.h21 ?? null), values2: dates.map((d) => nhm.get(d)?.l21 ?? null), mode: 'updown', fmt: (v) => fInt(v) },
    { label: 'New 52-week highs − lows, stocks', values: alignByDate(dates, T.new_52w_highs_minus_lows?.spark), mode: 'signed', fmt: (v) => fInt(v) },
  ];
  return `<section class="panel"><h2>Breadth under the candles ${infoChip(`TrendSpider pattern: SPY daily candles, EMA 8 orange, BB 20,2 purple, volume, then four breadth panes as bars · 60 sessions to the ${esc(dLabel(D.as_of))} close`)}</h2>
  <div class="r2-chart-wd">${candleChart(b, { w: 900, h: 700, title: 'SPY · daily · 60 sessions · % scale vs the prior close', panes })}</div><div class="r2-chart-ph">${candleChart(b, { w: 380, h: 560, title: 'SPY · daily · 60 sessions', panes, compact: true })}</div></section>`;
}

export function renderInternalsRc2(D, ser) {
  const mm = ser?.market_monitor;
  const meta = `SPY bars + new highs to the ${D ? esc(dLabel(D.as_of)) : 'not measured'} close (rc2-t1.json built ${D ? esc(mtTime(D.generated_at)) : 'not measured'}) · internals series built ${ser ? esc(mtTime(ser.generated_at_mt)) : 'not measured'} · market monitor to the ${mm ? esc(dLabel(mm.as_of)) : 'not measured'} close`;
  return `<div class="head"><h1>Internals</h1>${infoChip(meta)}</div>
  <div class="r2-g3">${renderBreadthChart(D, ser)}<div>${renderNewHighs(D?.newhighs)}${renderPutCall(ser?.tiles)}</div></div>
  ${renderMonitorGrid(mm)}`;
}

async function boot() {
  const host = mountHost('r2Internals', '#internalsTab', 'before', 'r2-internals'); if (!host) return;
  host.innerHTML = '<div class="loading-card">Loading breadth panes…</div>';
  const [D, ser] = await Promise.all([loadJson('./data/rc2-t1.json'), loadJson('./data/internals-series.json')]);
  host.innerHTML = renderInternalsRc2(D, ser);
  document.getElementById('view-internals')?.classList.add('r2-on');
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
