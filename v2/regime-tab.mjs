// REGIME tab, V2.18.0: raw value + past-only percentile + days since the last extreme, breadth,
// "after similar days" (PAST-ONLY, with n and a 90% random range) and Commitments of Traders.
// Pure read-only renderer. Inputs:
//   reg  = ./data/regime-2y.json   (offline builder: scripts/build-sectors-regime-snapshot.mjs)
//   snap = ./data/breadth-tape.json (existing public snapshot: breadth rows, tape, cot)
// Display laws: no dim text, units on every number, gold = fill/edge only (never text), red only in
// heat cells / bars, all-black surface, times in MT, raw values (no scores).
import { pct, xx, badge, pbar, dshort, dmd, mtStamp, barsFreshness, dayWord } from './sectors-tab.mjs?v=V2.18.0';
import { tradingSessionGap } from './market-calendar.mjs';

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const isExt = (p) => finite(p) != null && (p <= 5 || p >= 95);
const cc = (v) => (finite(v) == null || v === 0 ? '' : v > 0 ? 'rg-up' : 'rg-dn');
const fmtK = (v) => (finite(v) == null ? '—' : `${sgn(v)}${Math.abs(v / 1000).toFixed(1)}K`);

/** coloured number + thin bar (palette D4). scale = |v| that fills the bar. */
export function d4(v, scale, fmt = pct) {
  if (finite(v) == null) return '<td class="rg-n rg-na">n/a</td>';
  const s = Math.min(1, Math.abs(v) / scale);
  return `<td class="rg-n rg-d4 ${cc(v)}"><span>${fmt(v)}</span><i style="width:${(s * 100).toFixed(0)}%"></i></td>`;
}
function spark(vals, w = 200, h = 40, zero = true) {
  const v = vals.filter((q) => finite(q) != null); if (v.length < 2) return `<svg class="rg-spk" width="${w}" height="${h}"></svg>`;
  const mn = Math.min(...v, zero ? 0 : Infinity), mx = Math.max(...v, zero ? 0 : -Infinity), r = mx - mn || 1;
  const pts = vals.map((q, i) => (finite(q) == null ? null : `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((q - mn) / r) * (h - 6)).toFixed(1)}`)).filter(Boolean);
  const z = h - 3 - ((0 - mn) / r) * (h - 6); const last = pts.at(-1).split(',');
  return `<svg class="rg-spk" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${zero ? `<line x1="0" x2="${w}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}" class="rg-spk-z"/>` : ''}<polyline points="${pts.join(' ')}" class="rg-spk-l"/><circle cx="${last[0]}" cy="${last[1]}" r="2.4" class="rg-spk-d"/></svg>`;
}

// Trading sessions strictly between two ISO dates (exchange calendar: holidays are not sessions).
function weekdaysBetween(a, b) {
  const g = tradingSessionGap(a, b);
  return g == null ? 0 : Math.max(0, g - 1);
}

function extTxt(e, f, windowN, word = 'today') {
  if (!e) return `no extreme in the last ${windowN} sessions`;
  if (e.sessions === 0) return `<b>at an extreme ${word}</b>`;
  return `last extreme <b>${e.sessions} sessions ago</b> · ${dmd(e.date)} ${f(e.val)} (${e.p.toFixed(1)}%)`;
}
const chg = (v, w, f) => { if (finite(v) == null || finite(w) == null) return ''; const d = v - w; return `${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${f(Math.abs(d))} vs 5 sessions ago`; };

export function renderSimilarDays(reg, nowMs = Date.now()) {
  const dword = dayWord(reg?.as_of, nowMs);
  const I = reg?.similar?.iwm, S = reg?.similar?.spy;
  if (!I || !S) return '<div class="rg-card"><div class="error-state">After-similar-days table unavailable (snapshot missing). Unknown remains unknown.</div></div>';
  const rng = (x) => (x ? `${pct(x.lo)} → ${pct(x.hi)} · ${x.inside ? 'inside' : 'outside'}` : '—');
  const row = (name, key, scale) => `<tr><td class="rg-l">${name}</td>${d4(I.readings[key].v, scale)}<td class="rg-n">${rng(I.readings[key])}</td>${d4(S.readings[key].v, scale)}<td class="rg-n">${rng(S.readings[key])}</td></tr>`;
  const bandTxt = (x) => `band ${x.band[0]}–${x.band[1]}% · ${dword} ${xx(x.todayVal)} (${x.todayP.toFixed(1)}%)`;
  const totalOut = I.outside + S.outside, totalN = 6, exp = ((I.expectedOutside + S.expectedOutside)).toFixed(1);
  return `<div class="rg-card"><div class="rg-k">After similar days · mean-reversion lens · past-only</div><h2>What the index did next from the same stretch band</h2>
    <p class="rg-sub">Sessions whose ×ATR-from-8EMA percentile sat in the same 20-point band as ${esc(dmd(reg.as_of))}, and the index's next-day / next-5-day close-to-close move. <b>Past-only:</b> each day is ranked only against the sessions up to that day (trailing ${reg.windows.pctileSessions}-session window, ${reg.windows.warmupSessions}-session warm-up), so the sample starts ${esc(dshort(I.firstDate))}. <b>Random 90%</b> = the 90% range of the same statistic from ${I.draws.toLocaleString('en-US')} random draws that keep the band's run lengths, and whether the reading falls inside it.</p>
    <div class="rg-tw"><table class="rg-t rg-sim"><thead><tr><th class="rg-l">Statistic</th><th>IWM</th><th>IWM · random 90%</th><th>SPY</th><th>SPY · random 90%</th></tr></thead><tbody>
      <tr><td class="rg-l"><b>Sample</b> · band</td><td class="rg-n" colspan="2"><b>n = ${I.n} days</b> in ${I.runs} runs<br>${bandTxt(I)}</td><td class="rg-n" colspan="2"><b>n = ${S.n} days</b> in ${S.runs} runs<br>${bandTxt(S)}</td></tr>
      ${row('Next 1D median', 'med1', 0.6)}${row('Next 1D mean', 'mean1', 0.6)}${row('Next 5D median', 'med5', 1.2)}
      <tr><td class="rg-l">Next 1D up</td><td class="rg-n">${I.up1}% of days</td><td class="rg-n">—</td><td class="rg-n">${S.up1}% of days</td><td class="rg-n">—</td></tr>
      <tr><td class="rg-l">All days · 1D median</td>${d4(I.all.med1, 0.6)}<td class="rg-n">n = ${I.all.n} days</td>${d4(S.all.med1, 0.6)}<td class="rg-n">n = ${S.all.n} days</td></tr>
      <tr><td class="rg-l">All days · 5D median</td>${d4(I.all.med5, 1.2)}<td class="rg-n">n = ${I.all.n} days</td>${d4(S.all.med5, 1.2)}<td class="rg-n">n = ${S.all.n} days</td></tr>
    </tbody></table></div>
    <p class="rg-sub" style="margin-top:6px">${totalOut} of ${totalN} readings fall outside their 90% random range; about ${exp} of ${totalN} would by chance alone. Band days cluster in runs and the 5D windows overlap, so the effective sample is closer to the run count than to n. Sample: ${I.all.n} eligible sessions, ${esc(dshort(I.firstDate))} to ${esc(dshort(I.lastDate))} (the last 5 sessions have no 5-day outcome yet); each day ranked within its trailing ${I.window} sessions. A record, not a pattern.</p></div>`;
}

function breadthTiles(snap) {
  const rows = Array.isArray(snap?.breadth?.rows) ? snap.breadth.rows : [];
  if (!rows.length) return { tiles: [], rows, n: 0 };
  const last = rows.at(-1), n = rows.length;
  const rank = (key) => (rows.filter((r) => r[key] <= last[key]).length / n) * 100;
  const mk = (key, label) => {
    const p = rank(key); const wkRow = rows[Math.max(0, n - 6)];
    return tile({ label, date: dmd(last.et_date), val: `${last[key].toLocaleString('en-US')} stocks`, wk: chg(last[key], wkRow[key], (v) => `${v} stocks`), sp: spark(rows.map((r) => r[key]), 200, 40, false), p, plabel: `${n}-session pctile`, rng: `range ${Math.min(...rows.map((r) => r[key]))} → ${Math.max(...rows.map((r) => r[key]))} stocks · ${n} measured sessions`, ext: `of ${finite(last.universe_warm)?.toLocaleString('en-US') ?? '—'} warm mid/large caps` });
  };
  const p95 = [...rows].reverse().find((r) => r.percentile_reached === 95);
  let since = '<div class="rg-tile"><div class="rg-th"><b>Since last breadth extreme</b><span>calibrated P95</span></div><div class="rg-tv">no P95 day</div><div class="rg-tr">none in the ' + n + ' measured sessions</div></div>';
  if (p95) {
    const after = rows.filter((r) => r.et_date > p95.et_date);
    const span = tradingSessionGap(p95.et_date, last.et_date); // true NYSE sessions since the P95 day
    const unmeasured = span == null ? null : span - after.length;
    since = `<div class="rg-tile"><div class="rg-th"><b>Since last breadth extreme</b><span>calibrated P95</span></div><div class="rg-tv">${span ?? '—'} sessions</div><div class="rg-tw2">${esc(dshort(p95.et_date))} · ${p95.side_max} stocks ${p95.side_max_side === 'ABOVE' ? 'above' : 'below'} the band</div><div class="rg-gap"><b>${after.length} measured</b>${unmeasured ? ` · <b>${unmeasured} not measured</b> (job gap)` : ''}</div><div class="rg-tf">The backend labels each day P50 / P75 / P95. Count = NYSE sessions after the P95 day through ${esc(dshort(last.et_date))}.</div></div>`;
  }
  return { tiles: [mk('above', 'Entries ABOVE 8EMA band'), mk('below', 'Entries BELOW 8EMA band'), since], rows, n };
}

function tile({ label, date, val, wk, sp, p, plabel, rng, ext, foot }) {
  return `<div class="rg-tile${isExt(p) ? ' rg-extc' : ''}"><div class="rg-th"><b>${esc(label)}</b><span>${esc(date)}</span></div><div class="rg-tv">${val}</div><div class="rg-tw2">${wk}</div>${sp}<div class="rg-tp">${pbar(p, 92)}<em>${esc(plabel)}</em></div><div class="rg-tr">${rng}</div><div class="rg-tf">${ext}</div>${foot ? `<div class="rg-tf">${foot}</div>` : ''}</div>`;
}

/** Whole REGIME surface. Returns { asOf, html }. */
export function renderRegimeTab(reg, snap, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const ok = reg && reg.iwm && reg.spy && reg.windows;
  const rows = Array.isArray(snap?.breadth?.rows) ? snap.breadth.rows : [];
  const lastRow = rows.at(-1) || null;
  const W = ok ? reg.windows.pctileSessions : null;
  const tape = snap?.tape || null;
  const cot = snap?.cot || null;
  const badges = [];
  if (lastRow) badges.push(badge('8EMA entry breadth', `through ${dshort(lastRow.et_date)} · ${rows.length} sessions measured`, opts.breadthFresh === false ? 'STALE' : 'FRESH', `measured ${mtStamp(lastRow.measured_at)}`));
  else badges.push(badge('8EMA entry breadth', 'no rows', 'GAP'));
  if (ok) badges.push(badge('IWM / SPY daily bars', `${reg.source.sessions} sessions from ${dmd(reg.source.first)} ${reg.source.first.slice(0, 4)} · through ${dshort(reg.as_of)}`, (opts.barsFresh ?? barsFreshness(reg.as_of, nowMs).fresh) ? 'FRESH' : 'STALE', `window ${W} sessions · built ${mtStamp(reg.generated_at)} · rebuilt by hand`));
  else badges.push(badge('IWM / SPY daily bars', 'snapshot unavailable', 'GAP', 'stretch tiles and after-similar-days are off'));
  if (cot?.report_date) badges.push(badge('CFTC COT', `positions ${dshort(cot.report_date)} · weekly`, opts.cotFresh === false ? 'STALE' : 'FRESH'));
  if (tape) badges.push(badge('HOD / LOD hit tape', `last data ${tape.as_of ? dshort(tape.as_of) : 'unknown'}`, tape.status === 'stale' ? 'STALE' : 'FRESH', tape.status === 'stale' ? 'not shown until the rail runs again' : ''));
  const stamps = `<div class="rg-stamps">Breadth through <b>${lastRow ? esc(dshort(lastRow.et_date)) : 'date unknown'}</b>${lastRow ? ` (measured ${esc(mtStamp(lastRow.measured_at))})` : ''} · IWM / SPY bars through <b>${ok ? esc(dshort(reg.as_of)) : 'unavailable'}</b> · CFTC positions <b>${cot?.report_date ? esc(dshort(cot.report_date)) : 'unavailable'}</b></div>`;
  const head = `<div class="rg-kick">Regime · breadth + positioning · raw, no scores</div><h1 class="rg-h1">Regime <small>is the tape stretched? raw value · ${ok ? `${W}-session` : '2-yr'} percentile · sessions since the last extreme (past-only)</small></h1>${stamps}<div class="rg-fbrow">${badges.join('')}</div>`;
  if (!ok) return { asOf: lastRow ? `Breadth through ${lastRow.et_date}` : 'Measured snapshot unavailable', html: `<div class="rg-root">${head}<div class="error-state">2-year IWM / SPY snapshot unavailable. Unknown remains unknown.</div></div>` };

  const I = reg.iwm, S = reg.spy, T = reg.iwmVsSpy20;
  const d = dmd(reg.as_of); const word = dayWord(reg.as_of, nowMs);
  const pl = `${W}-session pctile`;
  const tiles = [
    tile({ label: 'IWM ×ATR from 8EMA', date: d, val: xx(I.stretch.v), wk: chg(I.stretch.v, I.stretch.wk, (v) => `${v.toFixed(2)}×`), sp: spark(I.stretch.spark), p: I.stretch.p, plabel: pl, rng: `${I.stretch.nWin}-session range ${xx(I.stretch.range[0])} → ${xx(I.stretch.range[1])}`, ext: extTxt(I.stretch.ext, xx, W, word) }),
    tile({ label: 'IWM vs 50-day SMA', date: d, val: pct(I.v50.v), wk: chg(I.v50.v, I.v50.wk, (v) => `${v.toFixed(2)} pts`), sp: spark(I.v50.spark), p: I.v50.p, plabel: pl, rng: `${I.v50.nWin}-session range ${pct(I.v50.range[0])} → ${pct(I.v50.range[1])}`, ext: extTxt(I.v50.ext, pct, W, word) }),
    tile({ label: 'IWM 20-day realised vol', date: d, val: `${I.rv20.v.toFixed(2)}%`, wk: chg(I.rv20.v, I.rv20.wk, (v) => `${v.toFixed(2)} pts`), sp: spark(I.rv20.spark, 200, 40, false), p: I.rv20.p, plabel: pl, rng: `${I.rv20.nWin}-session range ${I.rv20.range[0].toFixed(1)}% → ${I.rv20.range[1].toFixed(1)}%`, ext: extTxt(I.rv20.ext, (v) => `${v.toFixed(1)}%`, W, word), foot: 'annualised, close-to-close' }),
    tile({ label: 'IWM vs SPY · 20 sessions', date: d, val: pct(T.v), wk: chg(T.v, T.wk, (v) => `${v.toFixed(2)} pts`), sp: spark(T.spark), p: T.p, plabel: pl, rng: `${T.nWin}-session range ${pct(T.range[0])} → ${pct(T.range[1])}`, ext: extTxt(T.ext, pct, W, word) }),
    tile({ label: 'SPY ×ATR from 8EMA', date: d, val: xx(S.stretch.v), wk: chg(S.stretch.v, S.stretch.wk, (v) => `${v.toFixed(2)}×`), sp: spark(S.stretch.spark), p: S.stretch.p, plabel: pl, rng: `${S.stretch.nWin}-session range ${xx(S.stretch.range[0])} → ${xx(S.stretch.range[1])}`, ext: extTxt(S.stretch.ext, xx, W, word) }),
  ];
  const B = breadthTiles(snap); tiles.push(...B.tiles);

  const extNow = [['IWM ×ATR from 8EMA', I.stretch, xx], ['IWM vs 50-day SMA', I.v50, pct], ['IWM 20-day realised vol', I.rv20, (v) => `${v.toFixed(2)}%`], ['IWM vs SPY over 20 sessions', T, pct], ['SPY ×ATR from 8EMA', S.stretch, xx]].filter(([, t]) => isExt(t.p));
  const banner = extNow.length ? `<div class="rg-banner">At a ${W}-session extreme ${word}: ${extNow.map(([n, t, f]) => `<b>${esc(n)} ${f(t.v)} (${t.p.toFixed(1)}% pctile)</b>`).join(' · ')}</div>` : `<div class="rg-banner rg-banner-none">No tile is at its 5th / 95th pctile of the last ${W} sessions ${word}.</div>`;

  // breadth history
  let bTable = '';
  if (rows.length) {
    const maxS = Math.max(...rows.map((r) => Math.max(r.above, r.below)), 1);
    const desc = [...rows].reverse();
    bTable = desc.map((r, i) => {
      const nxt = desc[i + 1]; // the older row
      const gap = nxt ? weekdaysBetween(nxt.et_date, r.et_date) : 0;
      const gapRow = gap > 0 ? `<tr class="rg-gaprow"><td colspan="7" class="rg-l">${esc(dshort(nxt.et_date))} → ${esc(dshort(r.et_date))} · ${gap} session${gap === 1 ? '' : 's'} not measured (job gap)</td></tr>` : '';
      const themes = Array.isArray(r.theme_names) && r.theme_names.length ? r.theme_names.join(', ') : 'none';
      return `<tr class="${r.percentile_reached === 95 ? 'rg-ext' : ''}"><td class="rg-l">${esc(dshort(r.et_date))}</td><td class="rg-bl"><span class="rg-bw"><i class="rg-bdn" style="width:${((r.below / maxS) * 100).toFixed(1)}%"></i><b>${r.below} stocks</b></span></td><td class="rg-br"><span class="rg-bw"><i class="rg-bup" style="width:${((r.above / maxS) * 100).toFixed(1)}%"></i><b>${r.above} stocks</b></span></td><td class="rg-n">${r.total} stocks</td><td class="rg-n">${r.side_max_side === 'ABOVE' ? 'above' : 'below'}</td><td class="rg-n">${finite(r.percentile_reached) ? `P${r.percentile_reached}` : 'under P50'}</td><td class="rg-l rg-th2">${esc(themes)}</td></tr>${gapRow}`;
    }).join('');
  }
  const breadthCard = rows.length ? `<div class="rg-card"><div class="rg-k">Calibrated mid / large universe · newest on top</div><h2>8EMA entry breadth</h2><p class="rg-sub">Daily count of stocks that closed beyond their calibrated 8EMA extension band. Bars: red = below, green = above (heat-map colours, not P&amp;L). Gold row = the backend's P95 day. ${rows.length} measured sessions.</p>
    <div class="rg-tw"><table class="rg-t rg-br-t"><thead><tr><th class="rg-l">Session</th><th>Below band</th><th class="rg-l">Above band</th><th>Total</th><th>Heavier</th><th>Calibrated</th><th class="rg-l">Themes burning</th></tr></thead><tbody>${bTable}</tbody></table></div></div>` : '<div class="rg-card"><div class="error-state">Breadth rows unavailable. Unknown remains unknown.</div></div>';

  const cotRows = Array.isArray(cot?.contracts) ? cot.contracts : [];
  const cotCard = cotRows.length ? `<div class="rg-card"><div class="rg-k">OFFICIAL CFTC · WEEKLY POSITIONING · POSITIONS ${esc(dshort(cot.report_date).toUpperCase())}</div><h2>Commitments of Traders</h2><p class="rg-sub">Net = longs − shorts in contracts. % OI is a heat column (green net long, red net short). ${esc(cot.cadence || '')} A history percentile needs the CFTC history backfill and is not shown.</p>
    <div class="rg-tw"><table class="rg-t rg-cot"><thead><tr><th class="rg-l">Contract</th><th class="rg-l">Primary</th><th>Net</th><th>Week Δ</th><th>% OI</th><th class="rg-l">Secondary</th><th>% OI</th></tr></thead><tbody>${cotRows.map((c) => `<tr><td class="rg-l"><b>${esc(c.key)}</b> <span class="rg-k2">${esc(c.label)}</span></td><td class="rg-l rg-k2">${esc(c.primary_label)}</td><td class="rg-n">${fmtK(c.primary_net)}</td><td class="rg-n">${fmtK(c.primary_weekly_change)}</td>${d4(c.primary_net_pct_oi, 40)}<td class="rg-l rg-k2">${esc(c.secondary_label)}</td>${d4(c.secondary_net_pct_oi, 60)}</tr>`).join('')}</tbody></table></div></div>` : '<div class="rg-card"><div class="error-state">COT snapshot unavailable. Unknown remains unknown.</div></div>';

  const foot = `<details class="rg-foot" open><summary><b>Sources &amp; definitions</b></summary>
    <b>×ATR</b> = (close − EMA8) ÷ Wilder ATR14 on daily bars, ${reg.source.sessions} sessions ${esc(reg.source.first)} → ${esc(reg.source.last)} (offline snapshot <code>regime-2y.json</code>). <b>Pctile</b> = share of the trailing ${W} sessions at or below the reading, ranked only against sessions up to that day (a day with fewer than ${reg.windows.warmupSessions} valid sessions gets no rank). <b>Last extreme</b> = the most recent day whose own past-only pctile was at or beyond 5% / 95%. <b>Breadth</b> = the existing <code>breadth-tape.json</code> (${rows.length} measured sessions, so its pctile is a ${rows.length}-session rank). <b>Cot</b> = CFTC Public Reporting, weekly.</details>`;

  const html = `<div class="rg-root">${head}${banner}<div class="rg-tiles">${tiles.join('')}</div>
    <div class="rg-g2">${breadthCard}<div class="rg-col">${renderSimilarDays(reg, nowMs)}${cotCard}</div></div>${foot}</div>`;
  return { asOf: `Breadth through ${lastRow?.et_date || 'date unknown'} · bars through ${reg.as_of}`, html };
}
