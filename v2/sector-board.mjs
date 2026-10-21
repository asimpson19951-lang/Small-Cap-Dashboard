// SECTORS board (SB1, V2.13.0). Austin 2026-09-29: "make the sectors board now tonight".
//
// Reads the latest successful run written by the run-sector-board edge function
// (sector_board_runs + sector_board_rows, anon read-only). The page computes NOTHING: every
// number is the function's raw measured value; the page only orders, formats and expands.
//
// Display laws: no dim text (text / text-2 only); every number unit-marked (% × $); red only for
// negative moves; gold only for the open-row and active-sort accents; raw values, no scores.

import { sectorExtremes, renderStretchWatch } from './sectors-tab.mjs?v=V2.19.0';

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

export const SECTOR_COLUMNS = Object.freeze([
  { key: 'rank', label: '#', title: 'Rank by |move vs normal swing|, biggest unusual move first (either direction)' },
  { key: 'ticker', label: 'ETF', title: 'ETF — plain-English label · SECTOR (SPDR) or INDUSTRY' },
  { key: 'today_pct', label: 'Today', title: 'ETF % move vs the prior session close (live runs: 15-min delayed snapshot)' },
  { key: 'vs_iwm_pct', label: 'vs IWM', title: 'ETF today % minus IWM today %' },
  { key: 'move_x', label: '× swing', title: 'VS IWM ÷ normal swing. Normal swing = median |daily % − IWM daily %| over the prior 20 sessions (shown underneath). Default order: largest |×| first' },
  { key: 'rvol', label: 'Rvol', title: 'Volume ÷ 20-session average volume. Intraday: time-of-day adjusted (standard U-shaped volume curve). Premarket: none' },
  { key: 'prev1d_pct', label: 'Prev 1D', title: 'The prior completed session\'s % move' },
  { key: 'r5d_pct', label: '5D', title: 'Close vs the close 5 sessions back, %' },
  { key: 'r20d_pct', label: '20D', title: 'Close vs the close 20 sessions back, %' },
  { key: 'x20_pct', label: '20D vs IWM', title: 'ETF 20-session return minus IWM 20-session return, as a ratio change (ETF/IWM now vs 20 sessions ago), %. From the offline 2-year bar snapshot' },
  { key: 'x20_pctile', label: '20D pctile', title: 'Where the 20D-vs-IWM reading sits among the last 504 sessions (ranked only against sessions up to that day). Gold row = at or beyond the 5th / 95th pctile' },
  { key: 'stretch_x', label: '×ATR 8EMA', title: '(close − 8EMA) ÷ Wilder ATR14, in ATR multiples. Rubber-band stretch from the 8EMA. From the offline 2-year bar snapshot' },
  { key: 'stretch_pctile', label: '×ATR pctile', title: 'Where the ×ATR reading sits among the last 504 sessions (ranked only against sessions up to that day)' },
  { key: 'off_high_pct', label: 'Off 20D high', title: 'Close vs the highest high of the last 20 sessions (incl. today), %' },
  { key: 'above_low_pct', label: 'Over 20D low', title: 'Close vs the lowest low of the last 20 sessions (incl. today), %' },
  { key: 'strip', label: '20 sessions', title: 'Each bar is one session: height = |ETF % − IWM %|, green above IWM, red below; the last bar is today (gold outline)' },
  { key: 'breadth', label: 'Members up / down', title: 'Mapped members passing the liquidity floor ($1 price, $2M 20-session average dollar volume): up / down today' },
]);

export function signedPct(v, digits = 2) {
  const n = finite(v);
  if (n == null) return '—';
  const t = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${/^-0\.?0*$/.test(t) ? (0).toFixed(digits) : t}%`;
}
export function times(v, digits = 2, signed = false) {
  const n = finite(v);
  if (n == null) return '—';
  const t = n.toFixed(digits);
  return `${signed && n > 0 ? '+' : ''}${/^-0\.?0*$/.test(t) ? (0).toFixed(digits) : t}×`;
}
export function dollars(v) {
  const n = finite(v);
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(2)}`;
}
function price(v) {
  const n = finite(v);
  return n == null ? '—' : `$${n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
}
function signClass(v) {
  const n = finite(v);
  if (n == null || n === 0) return '';
  return n > 0 ? 'tt-up' : 'tt-down';
}
function arrow(v) {
  const n = finite(v);
  return n == null || n === 0 ? '' : n > 0 ? '↑' : '↓';
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

import { mtStamp12 } from './market-calendar.mjs';
const LABEL_TIME = { '0600': '6:00 AM MT premarket', '0930': '9:30 AM MT', '1130': '11:30 AM MT', '1330': '1:30 PM MT', '1430': '2:30 PM MT close', '1815': '6:15 PM MT final', backfill: 'backfill' };

/** runRows: result of sector_board_runs?select=*,sector_board_rows(*)&ok=eq.true&order=id.desc&limit=1 */
export function buildSectorModel(runRows, enrich) {
  const run = Array.isArray(runRows) ? runRows[0] : null;
  if (!run) return { run: null, bench: [], rows: [] };
  const all = Array.isArray(run.sector_board_rows) ? run.sector_board_rows : [];
  const benchOrder = ['SPY', 'QQQ', 'IWM'];
  const bench = all.filter((r) => r.grp === 'BENCH').sort((a, b) => benchOrder.indexOf(a.ticker) - benchOrder.indexOf(b.ticker));
  let rows = all.filter((r) => r.grp !== 'BENCH').sort((a, b) => (finite(a.rank) ?? 1e9) - (finite(b.rank) ?? 1e9));
  if (typeof enrich === 'function') rows = enrich(rows);
  return { run, bench, rows };
}

/** sort: { key, dir: 'desc'|'asc' } or null (default = rank). Unknown values always last. */
export function sortSectorRows(rows, sort) {
  if (!sort || !sort.key || sort.key === 'rank') {
    const out = [...rows].sort((a, b) => (finite(a.rank) ?? 1e9) - (finite(b.rank) ?? 1e9));
    return sort?.key === 'rank' && sort.dir === 'desc' ? out.reverse() : out;
  }
  const key = sort.key, dir = sort.dir === 'asc' ? 1 : -1;
  const val = (r) => {
    if (key === 'ticker') return r.ticker;
    if (key === 'move_x') return finite(r.move_x) == null ? null : Math.abs(finite(r.move_x));
    if (key === 'breadth') { const u = finite(r.up), d = finite(r.down); return u == null || d == null || u + d === 0 ? null : u / (u + d); }
    return finite(r[key]);
  };
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return a.ticker < b.ticker ? -1 : 1;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return dir * (x < y ? -1 : x > y ? 1 : 0);
    return dir * (x - y) || (a.ticker < b.ticker ? -1 : 1);
  });
}

export function nextSort(sort, key) {
  const first = key === 'ticker' || key === 'rank' ? 'asc' : 'desc';
  if (!sort || sort.key !== key) return { key, dir: first };
  if (sort.dir === first) return { key, dir: first === 'desc' ? 'asc' : 'desc' };
  return null;
}

function strip(spark) {
  const s = Array.isArray(spark) ? spark : [];
  if (!s.length) return '<span class="sb-strip-none">—</span>';
  const max = Math.max(0.01, ...s.map((x) => Math.abs(finite(x?.vs) ?? 0)));
  return `<span class="sb-strip" aria-hidden="true">${s.map((x, i) => {
    const v = finite(x?.vs);
    const h = v == null ? 2 : Math.max(2, Math.round((Math.abs(v) / max) * 22));
    const cls = v == null ? 'sb-s-n' : v >= 0 ? 'sb-s-up' : 'sb-s-dn';
    return `<i class="sb-s ${cls}${i === s.length - 1 ? ' sb-s-today' : ''}" style="height:${h}px" title="${esc(x?.d ?? '')} ETF ${esc(signedPct(x?.pct))} · vs IWM ${esc(signedPct(x?.vs))}"></i>`;
  }).join('')}</span>`;
}

function stripWithDates(spark, sessions) {
  const s = Array.isArray(spark) ? spark : [];
  const d = Array.isArray(sessions) ? sessions.slice(-s.length) : [];
  return strip(s.map((x, i) => ({ ...x, d: d[i] ?? '' })));
}

function moverTable(row) {
  const movers = Array.isArray(row.movers) ? row.movers : [];
  const head = `<p class="note">${esc(row.ticker)} — top ${movers.length} of ${finite(row.measured) ?? '—'} liquid members by |% move| (${finite(row.mapped) ?? '—'} mapped; floor: $1 price, $2M 20-session avg dollar volume). Click a ticker to open it on NOW.</p>`;
  if (!movers.length) return `${head}<p class="note">No mapped member passed the liquidity floor with a measured move.</p>`;
  return `${head}<div class="tw"><table class="t" style="margin-top:6px;max-width:760px"><thead><tr><th scope="col" class="l">Ticker</th><th scope="col">Price</th><th scope="col">Today</th><th scope="col">Rvol</th><th scope="col">Mkt cap</th><th scope="col" class="opt">Cap</th><th scope="col" class="opt">Map</th></tr></thead><tbody>${movers.map((m) => `<tr>
    <th scope="row"><button type="button" data-sector-mover="${esc(m.t)}" style="all:unset;cursor:pointer;text-decoration:underline dotted">${esc(m.t)}</button></th>
    <td>${price(m.price)}</td>
    <td class="${ud(m.pct)}">${signedPct(m.pct)}</td>
    <td>${times(m.rvol)}</td>
    <td>${dollars(m.cap)}</td>
    <td class="opt">${m.tag ? `<span class="chip">${esc(m.tag)}</span>` : '—'}</td>
    <td class="opt">${esc(m.src === 'hand' ? 'List' : m.src === 'sic_sc' ? 'SIC SC' : m.src === 'override' ? 'List' : 'SIC')}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

const opts_windowN = (snap) => snap?.windows?.pctileSessions;
function pctileCell(p) {
  const n = finite(p);
  if (n == null) return '<span class="sb-pc-na">—</span>';
  const ext = n <= 5 || n >= 95;
  return `<span class="sb-pcw"><span class="sb-pcb${ext ? ' sb-pcx' : ''}"><i style="left:${Math.max(0, Math.min(100, n)).toFixed(1)}%"></i></span><b>${n.toFixed(1)}%</b></span>`;
}

function fmtMt(iso) {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '—';
  return mtStamp12(ms).replace(/ MT$/, '');
}
function sessionLabel(d) {
  const ms = Date.parse(`${d}T12:00:00Z`);
  if (!Number.isFinite(ms)) return d || '—';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

// ---- board skin v2 (Oct 19 2026): .sk page = head → read → strip → quick view → Deep view (everything else) ----
const isExtP = (p) => finite(p) != null && (p <= 5 || p >= 95);
const ud = (v) => { const n = finite(v); return n == null || n === 0 ? '' : n > 0 ? 'up' : 'dn'; };
function pcSk(p) {
  const n = finite(p);
  if (n == null) return '—';
  return `<span class="pc${isExtP(n) ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, n)).toFixed(1)}%"></i></span><b>${n.toFixed(1)}%</b></span>`;
}
// Deep view open/closed survives every re-render (sort clicks, row expands, the data refresh).
// One capture listener for every tab that marks its details with data-sk-deep="<tab>".
if (typeof document !== 'undefined' && !globalThis.__skDeepOpen) {
  globalThis.__skDeepOpen = new Set();
  document.addEventListener('toggle', (ev) => { const d = ev.target; const k = d?.dataset?.skDeep; if (!k) return; if (d.open) globalThis.__skDeepOpen.add(k); else globalThis.__skDeepOpen.delete(k); }, true);
}
export function deepIsOpen(key) { return !!globalThis.__skDeepOpen?.has(key); }

function benchTable(bench, snap) {
  if (!bench.length) return '';
  const n = finite(opts_windowN(snap));
  return `<section class="sec panel" data-sk-label="Benchmarks"><h2>Benchmarks</h2><p class="sub">SPY, QQQ and IWM from the same run${n ? ` · ×ATR pctile of ${n} sessions` : ''}</p><div class="tw"><table class="t"><thead><tr><th class="l">Index</th><th>Today</th><th>5D</th><th>20D</th><th class="opt">Rvol</th><th class="opt">Off 20D high</th><th>×ATR 8EMA</th><th>2-yr percentile</th></tr></thead><tbody>${bench.map((r) => {
    const sb = snap?.bench?.[r.ticker];
    return `<tr class="${sb && isExtP(sb.stretchPctile) ? 'ext' : ''}"><th>${esc(r.ticker)}<small>${esc(r.label ?? '')}</small></th><td class="${ud(r.today_pct)}">${signedPct(r.today_pct)}</td><td class="${ud(r.r5d_pct)}">${signedPct(r.r5d_pct)}</td><td class="${ud(r.r20d_pct)}">${signedPct(r.r20d_pct)}</td><td class="opt">${times(r.rvol)}</td><td class="opt ${ud(r.off_high_pct)}">${signedPct(r.off_high_pct)}</td><td class="${ud(sb?.stretch)}">${sb ? times(sb.stretch, 2, true) : '—'}</td><td>${sb ? pcSk(sb.stretchPctile) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}

/**
 * opts: { sort, openTicker, filter: 'ALL'|'SECTOR'|'INDUSTRY', laneStatus, snap, insight, footnote }
 */
// Adds the Deep-view section label to the first tag of a block built elsewhere (sectors-tab.mjs).
const skLabel = (html, label) => (html ? String(html).replace(/^(\s*<[a-z]+)/, `$1 data-sk-label="${label}"`) : '');

export function renderSectorBoard(model, opts = {}) {
  if (!model?.run) {
    const lane = opts.laneStatus;
    return `<div class="sk"><div class="head"><h1>Sectors</h1></div><p class="read">${lane && lane !== 'fresh' ? `Sectors board unavailable (sector_board_runs ${esc(lane)}). Retrying next refresh.` : 'Sectors board has no completed run yet.'}</p></div>`;
  }
  const { run } = model;
  const snap = opts.snap;
  const filter = opts.filter || 'ALL';
  const rows = sortSectorRows(model.rows.filter((r) => filter === 'ALL' || r.grp === filter), opts.sort);
  const basis = run.basis === 'grouped' ? 'final daily bars' : run.basis === 'premarket snapshot' ? 'premarket price vs last close · no volume ratio' : run.basis === 'snapshot' ? '15-min delayed snapshot' : 'daily bars';
  const seg = `<span class="seg" role="group" aria-label="Filter ETFs">${['ALL', 'SECTOR', 'INDUSTRY'].map((f) => `<span class="${f === filter ? 'on' : ''}" role="button" tabindex="0" style="cursor:pointer" data-sector-filter="${f}" aria-pressed="${f === filter}">${f === 'ALL' ? 'All' : f === 'SECTOR' ? 'Sectors (11)' : 'Industries'}</span>`).join('')}</span>`;
  const barsTo = snap?.as_of ? ` · 2-yr bars to the ${esc(sessionLabel(snap.as_of))} close` : '';
  const head = `<div class="head"><h1>Sectors</h1><span class="meta">Session ${esc(sessionLabel(run.session))} · ${esc(LABEL_TIME[run.run_label] ?? run.run_label)} run · ${esc(basis)} · written ${esc(fmtMt(run.finished_at))} MT${run.as_of ? ` · data ${esc(fmtMt(run.as_of))} MT` : ''}${barsTo} · ${model.rows.length} ETFs · map ${esc(run.map_version ?? '—')}</span>${seg}</div>`;

  // read sentence + tiles: stored values only (rank 1 = biggest |× swing|; extremes = the stretch-watch filter)
  const byRank = sortSectorRows(model.rows, null);
  const top = byRank[0] || null;
  const ext = snap ? sectorExtremes(model, snap) : [];
  const iwm = model.bench.find((b) => b.ticker === 'IWM');
  const readTxt = `${top ? `Biggest unusual move on ${esc(sessionLabel(run.session))}: <b>${esc(top.ticker)} ${esc(top.label ?? '')} ${signedPct(top.vs_iwm_pct)} vs IWM</b>, ${times(top.move_x, 2, true)} its normal swing of ${signedPct(top.swing_pct).replace('+', '')}.` : ''}${iwm ? ` IWM ${signedPct(iwm.today_pct)}.` : ''}${snap ? (ext.length ? ` ${ext.length} ETF${ext.length === 1 ? ' sits' : 's sit'} at a 2-yr extreme on 20D vs IWM or ×ATR: <b>${ext.slice(0, 5).map((r) => esc(r.t)).join(', ')}</b>${ext.length > 5 ? ` and ${ext.length - 5} more` : ''}.` : ' No ETF is at a 2-yr extreme on 20D vs IWM or ×ATR.') : ''}`;
  const read = `<p class="read${ext.length ? ' ext' : ''}">${readTxt}</p>`;
  const benchTile = (b) => {
    const sb = snap?.bench?.[b.ticker];
    return `<div class="tile${sb && isExtP(sb.stretchPctile) ? ' ext' : ''}"><div class="k">${esc(b.ticker)} · ${esc(b.label ?? '')}</div><div class="v ${ud(b.today_pct)}">${signedPct(b.today_pct)}</div><div class="s">5D ${signedPct(b.r5d_pct)} · 20D ${signedPct(b.r20d_pct)}${sb ? ` · ×ATR ${times(sb.stretch, 2, true)} (${finite(sb.stretchPctile) == null ? '—' : sb.stretchPctile.toFixed(1) + '%'} pctl)` : ''}</div></div>`;
  };
  const tiles = [...model.bench.map(benchTile)];
  if (top) tiles.push(`<div class="tile"><div class="k">Biggest unusual move</div><div class="v ${ud(top.move_x)}">${times(top.move_x, 2, true)}<small>${esc(top.ticker)}</small></div><div class="s">${signedPct(top.vs_iwm_pct)} vs IWM · normal swing ${signedPct(top.swing_pct).replace('+', '')}</div></div>`);
  if (snap) tiles.push(`<div class="tile mr${ext.length ? ' ext' : ''}"><div class="k">At a 2-yr extreme</div><div class="v">${ext.length}<small>ETFs</small></div><div class="s">${ext.length ? esc(ext.slice(0, 4).map((r) => r.t).join(' · ')) : 'none on 20D vs IWM or ×ATR'}</div></div>`);
  const strip = `<div class="strip" style="--cols:${tiles.length}">${tiles.join('')}</div>`;

  // quick view: the 12 biggest unusual moves (current filter, rank order) + the MR stretch watch
  const quickRows = sortSectorRows(model.rows.filter((r) => filter === 'ALL' || r.grp === filter), null).slice(0, 12);
  const maxX = Math.max(0.01, ...quickRows.map((r) => Math.abs(finite(r.move_x) ?? 0)));
  const quick = `<section class="panel"><h2>Biggest moves vs normal swing</h2><p class="sub">Top ${quickRows.length} of ${rows.length} by |× swing| · gold row = 2-yr extreme · full table in Deep view</p><div class="tw"><table class="t"><thead><tr><th class="l">ETF</th><th>Today</th><th>vs IWM</th><th>× swing</th><th class="opt">5D</th><th class="opt">20D</th><th class="opt">×ATR 8EMA</th><th>×ATR 2-yr percentile</th></tr></thead><tbody>${quickRows.map((r) => {
    const x = finite(r.move_x);
    const w = x == null ? 0 : (Math.abs(x) / maxX) * 100;
    return `<tr class="${isExtP(r.x20_pctile) || isExtP(r.stretch_pctile) ? 'ext' : ''}"><th>${esc(r.ticker)}<small>${esc(r.label ?? '')}</small></th><td class="${ud(r.today_pct)}">${signedPct(r.today_pct)}</td><td class="${ud(r.vs_iwm_pct)}">${signedPct(r.vs_iwm_pct)}</td><td><span class="db ${ud(r.move_x)}"><span class="${ud(r.move_x)}">${times(r.move_x, 2, true)}</span><i style="width:${w.toFixed(0)}%"></i></span></td><td class="opt ${ud(r.r5d_pct)}">${signedPct(r.r5d_pct)}</td><td class="opt ${ud(r.r20d_pct)}">${signedPct(r.r20d_pct)}</td><td class="opt ${ud(r.stretch_x)}">${times(r.stretch_x, 2, true)}</td><td>${pcSk(r.stretch_pctile)}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;

  // deep view: the full sortable table (same columns), quadrant + heat map, benchmarks, sources
  const optKeys = new Set(['rank', 'rvol', 'prev1d_pct', 'x20_pct', 'off_high_pct', 'above_low_pct', 'strip', 'breadth']);
  const thStyle = ' style="font:inherit;color:inherit;padding:0;width:auto;text-align:inherit"';
  const th = SECTOR_COLUMNS.map((c) => {
    const active = opts.sort?.key === c.key;
    const cl = [c.key === 'ticker' ? 'l' : '', optKeys.has(c.key) ? 'opt' : ''].filter(Boolean).join(' ');
    const cls = cl ? ` class="${cl}"` : '';
    const barKeys = ['x20_pct', 'x20_pctile', 'stretch_x', 'stretch_pctile'];
    const barDate = barKeys.includes(c.key) && snap?.as_of ? `to ${sessionLabel(snap.as_of)} close` : '';
    if (c.key === 'strip') return `<th scope="col"${cls}><span title="${esc(c.title)}">${esc(c.label)}</span></th>`;
    return `<th scope="col"${cls}${active ? ' aria-sort="' + (opts.sort.dir === 'asc' ? 'ascending' : 'descending') + '"' : ''}><button type="button" class="tt-sort${active ? ' sb-sort-active' : ''}"${thStyle} data-sector-sort="${c.key}" title="${esc(c.title)}">${esc(c.label)}${active ? ` ${opts.sort.dir === 'asc' ? '▲' : '▼'}` : ''}${barDate ? `<small>${esc(barDate)}</small>` : ''}</button></th>`;
  }).join('');
  const body = rows.map((r) => {
    const open = opts.openTicker === r.ticker;
    const extRow = isExtP(r.x20_pctile) || isExtP(r.stretch_pctile);
    const main = `<tr class="click${open ? ' open' : ''}${extRow ? ' ext' : ''}" data-sector-row="${esc(r.ticker)}" tabindex="0" aria-expanded="${open}">
      <td class="opt">${finite(r.rank) ?? '—'}</td>
      <th scope="row">${esc(r.ticker)}<span class="chip">${r.grp === 'SECTOR' ? 'Sector' : 'Industry'}</span><small>${esc(r.label ?? '')}</small></th>
      <td class="${ud(r.today_pct)}">${signedPct(r.today_pct)}</td>
      <td class="${ud(r.vs_iwm_pct)}">${signedPct(r.vs_iwm_pct)}</td>
      <td class="${ud(r.move_x)}">${times(r.move_x, 2, true)}<small>swing ${signedPct(r.swing_pct).replace('+', '')}</small></td>
      <td class="opt">${times(r.rvol)}</td>
      <td class="opt ${ud(r.prev1d_pct)}">${signedPct(r.prev1d_pct)}</td>
      <td class="${ud(r.r5d_pct)}">${signedPct(r.r5d_pct)}</td>
      <td class="${ud(r.r20d_pct)}">${signedPct(r.r20d_pct)}</td>
      <td class="opt ${ud(r.x20_pct)}">${signedPct(r.x20_pct)}</td>
      <td>${pcSk(r.x20_pctile)}</td>
      <td class="${ud(r.stretch_x)}">${times(r.stretch_x, 2, true)}</td>
      <td>${pcSk(r.stretch_pctile)}</td>
      <td class="opt ${ud(r.off_high_pct)}">${signedPct(r.off_high_pct)}</td>
      <td class="opt ${ud(r.above_low_pct)}">${signedPct(r.above_low_pct)}</td>
      <td class="opt">${stripWithDates(r.spark, run.spark_sessions)}</td>
      <td class="opt">${finite(r.measured) ? `<span class="up">${finite(r.up) ?? 0}↑</span> / <span class="dn">${finite(r.down) ?? 0}↓</span><small>of ${finite(r.measured)} stocks</small>` : '—'}</td>
    </tr>`;
    const detail = open ? `<tr class="xrow"><td colspan="${SECTOR_COLUMNS.length}">${moverTable(r)}</td></tr>` : '';
    return main + detail;
  }).join('');
  const table = `<section class="sec panel" data-sk-label="All ETFs"><h2>All ${rows.length} ETFs</h2><p class="sub">Click a header to sort, a row for its top movers · gold row = 2-yr extreme on 20D vs IWM or ×ATR</p><div class="tw"><table class="t"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="note">Members: 11 sector ETFs map by SIC code (GICS approximation, big-name overrides); industry ETFs use a fixed list of their main US names plus SIC-matched small caps (&lt; $2B). Holdings are not on the data plan. Market caps from the Sep 27 reference snapshot.</p></section>`;
  const deep = `<details class="deep" data-sk-deep="sectors"${deepIsOpen('sectors') ? ' open' : ''}><summary>Deep view <span>all ${rows.length} ETFs, sortable · relative-strength quadrant · heat map · benchmarks · sources</span></summary><div class="body">${table}${skLabel(opts.insight, 'Quadrant &amp; heat map')}${benchTable(model.bench, snap)}${skLabel(opts.footnote, 'Definitions')}</div></details>`;
  return `<div class="sk">${head}${read}${strip}${drillPanel}<div class="grid2 wide-left">${quick}${snap ? renderStretchWatch(model, snap) : ''}</div>${deep}</div>`;
}
