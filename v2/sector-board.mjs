// SECTORS board (SB1, V2.13.0). Austin 2026-09-29: "make the sectors board now tonight".
//
// Reads the latest successful run written by the run-sector-board edge function
// (sector_board_runs + sector_board_rows, anon read-only). The page computes NOTHING: every
// number is the function's raw measured value; the page only orders, formats and expands.
//
// Display laws: no dim text (text / text-2 only); every number unit-marked (% × $); red only for
// negative moves; gold only for the open-row and active-sort accents; raw values, no scores.

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

export const SECTOR_COLUMNS = Object.freeze([
  { key: 'rank', label: '#', title: 'Rank by |move vs normal swing|, biggest unusual move first (either direction)' },
  { key: 'ticker', label: 'ETF', title: 'ETF — plain-English label · SECTOR (SPDR) or INDUSTRY' },
  { key: 'today_pct', label: 'TODAY', title: 'ETF % move vs the prior session close (live runs: 15-min delayed snapshot)' },
  { key: 'vs_iwm_pct', label: 'VS IWM', title: 'ETF today % minus IWM today %' },
  { key: 'move_x', label: '× SWING', title: 'VS IWM ÷ normal swing. Normal swing = median |daily % − IWM daily %| over the prior 20 sessions (shown underneath). Default order: largest |×| first' },
  { key: 'rvol', label: 'RVOL', title: 'Volume ÷ 20-session average volume. Intraday: time-of-day adjusted (standard U-shaped volume curve). Premarket: none' },
  { key: 'prev1d_pct', label: 'PREV 1D', title: 'The prior completed session\'s % move' },
  { key: 'r5d_pct', label: '5D', title: 'Close vs the close 5 sessions back, %' },
  { key: 'r20d_pct', label: '20D', title: 'Close vs the close 20 sessions back, %' },
  { key: 'off_high_pct', label: 'OFF 20D HIGH', title: 'Close vs the highest high of the last 20 sessions (incl. today), %' },
  { key: 'above_low_pct', label: 'OVER 20D LOW', title: 'Close vs the lowest low of the last 20 sessions (incl. today), %' },
  { key: 'strip', label: '20 SESSIONS', title: 'Each bar is one session: height = |ETF % − IWM %|, green above IWM, red below; the last bar is today (gold outline)' },
  { key: 'breadth', label: 'MEMBERS UP / DOWN', title: 'Mapped members passing the liquidity floor ($1 price, $2M 20-session average dollar volume): up / down today' },
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

const LABEL_TIME = { '0600': '06:00 MT premarket', '0930': '09:30 MT', '1130': '11:30 MT', '1330': '13:30 MT', '1430': '14:30 MT close', '1815': '18:15 MT final', backfill: 'backfill' };

/** runRows: result of sector_board_runs?select=*,sector_board_rows(*)&ok=eq.true&order=id.desc&limit=1 */
export function buildSectorModel(runRows) {
  const run = Array.isArray(runRows) ? runRows[0] : null;
  if (!run) return { run: null, bench: [], rows: [] };
  const all = Array.isArray(run.sector_board_rows) ? run.sector_board_rows : [];
  const benchOrder = ['SPY', 'QQQ', 'IWM'];
  const bench = all.filter((r) => r.grp === 'BENCH').sort((a, b) => benchOrder.indexOf(a.ticker) - benchOrder.indexOf(b.ticker));
  const rows = all.filter((r) => r.grp !== 'BENCH').sort((a, b) => (finite(a.rank) ?? 1e9) - (finite(b.rank) ?? 1e9));
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
  const head = `<p class="sb-movers-cap">${esc(row.ticker)} — top ${movers.length} of ${finite(row.measured) ?? '—'} liquid members by |% move| (${finite(row.mapped) ?? '—'} mapped; floor: $1 price, $2M 20-session avg dollar volume). Click a ticker to open it on NOW.</p>`;
  if (!movers.length) return `${head}<p class="sb-movers-cap">No mapped member passed the liquidity floor with a measured move.</p>`;
  return `${head}<table class="tt-members sb-movers"><thead><tr><th scope="col">TICKER</th><th scope="col">PRICE</th><th scope="col">TODAY</th><th scope="col">RVOL</th><th scope="col">MKT CAP</th><th scope="col">CAP</th><th scope="col">MAP</th></tr></thead><tbody>${movers.map((m) => `<tr>
    <th scope="row"><button type="button" data-sector-mover="${esc(m.t)}">${esc(m.t)}</button></th>
    <td>${price(m.price)}</td>
    <td class="${signClass(m.pct)}">${arrow(m.pct)} ${signedPct(m.pct)}</td>
    <td>${times(m.rvol)}</td>
    <td>${dollars(m.cap)}</td>
    <td>${m.tag ? `<span class="rot-tag${m.tag === 'SC' ? ' rot-tag-sc' : ''}">${esc(m.tag)}</span>` : '—'}</td>
    <td>${esc(m.src === 'hand' ? 'LIST' : m.src === 'sic_sc' ? 'SIC SC' : m.src === 'override' ? 'LIST' : 'SIC')}</td>
  </tr>`).join('')}</tbody></table>`;
}

function benchCard(r) {
  return `<div class="sb-bench-card">
    <strong>${esc(r.ticker)}</strong><small>${esc(r.label ?? '')}</small>
    <span class="sb-bench-big ${signClass(r.today_pct)}">${arrow(r.today_pct)} ${signedPct(r.today_pct)}</span>
    <span>5D <b class="${signClass(r.r5d_pct)}">${signedPct(r.r5d_pct)}</b></span>
    <span>20D <b class="${signClass(r.r20d_pct)}">${signedPct(r.r20d_pct)}</b></span>
    <span>RVOL <b>${times(r.rvol)}</b></span>
    <span>OFF 20D HIGH <b class="${signClass(r.off_high_pct)}">${signedPct(r.off_high_pct)}</b></span>
  </div>`;
}

function fmtMt(iso) {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
function sessionLabel(d) {
  const ms = Date.parse(`${d}T12:00:00Z`);
  if (!Number.isFinite(ms)) return d || '—';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

/**
 * opts: { sort, openTicker, filter: 'ALL'|'SECTOR'|'INDUSTRY', laneStatus }
 */
export function renderSectorBoard(model, opts = {}) {
  if (!model?.run) {
    const lane = opts.laneStatus;
    return `<div class="error-state">${lane && lane !== 'fresh' ? `Sectors board unavailable (sector_board_runs ${esc(lane)}). Retrying next refresh.` : 'Sectors board has no completed run yet.'}</div>`;
  }
  const { run } = model;
  const filter = opts.filter || 'ALL';
  const rows = sortSectorRows(model.rows.filter((r) => filter === 'ALL' || r.grp === filter), opts.sort);
  const basis = run.basis === 'grouped' ? 'final daily bars' : run.basis === 'premarket snapshot' ? 'premarket price vs last close · no volume ratio' : run.basis === 'snapshot' ? '15-min delayed snapshot' : 'daily bars';
  const head = `<header class="sb-head">
    <div><div class="book-kicker">SECTORS · FIXED ETF UNIVERSE · MAP ${esc(run.map_version ?? '—')}</div>
      <h1>Sectors</h1>
      <p class="sb-meta">Session <b>${esc(sessionLabel(run.session))}</b> · ${esc(LABEL_TIME[run.run_label] ?? run.run_label)} run · ${esc(basis)} · written ${esc(fmtMt(run.finished_at))} MT${run.as_of ? ` · data ${esc(fmtMt(run.as_of))} MT` : ''} · ${model.rows.length} ETFs ranked by |× swing|</p>
    </div>
    <div class="sb-filter" role="group" aria-label="Filter ETFs">${['ALL', 'SECTOR', 'INDUSTRY'].map((f) => `<button type="button" data-sector-filter="${f}" aria-pressed="${f === filter}">${f === 'ALL' ? 'ALL' : f === 'SECTOR' ? 'SECTORS (11)' : 'INDUSTRIES'}</button>`).join('')}</div>
  </header>`;
  const bench = `<div class="sb-bench">${model.bench.map(benchCard).join('')}</div>`;
  const th = SECTOR_COLUMNS.map((c) => {
    const active = opts.sort?.key === c.key;
    const cls = c.key === 'ticker' ? ' class="tt-name-col"' : '';
    if (c.key === 'strip') return `<th scope="col"${cls}><span class="tt-sort sb-nosort" title="${esc(c.title)}">${esc(c.label)}</span></th>`;
    return `<th scope="col"${cls}${active ? ' aria-sort="' + (opts.sort.dir === 'asc' ? 'ascending' : 'descending') + '"' : ''}><button type="button" class="tt-sort${active ? ' sb-sort-active' : ''}" data-sector-sort="${c.key}" title="${esc(c.title)}">${esc(c.label)}${active ? `<span class="tt-arrow">${opts.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</button></th>`;
  }).join('');
  const body = rows.map((r) => {
    const open = opts.openTicker === r.ticker;
    const main = `<tr class="tt-row sb-row${open ? ' open' : ''}" data-sector-row="${esc(r.ticker)}" tabindex="0" aria-expanded="${open}">
      <td>${finite(r.rank) ?? '—'}</td>
      <th scope="row"><span class="tt-chevron">${open ? '▾' : '▸'}</span><span class="tt-name">${esc(r.ticker)}</span> <span class="sb-label">— ${esc(r.label ?? '')}</span><span class="rot-tag">${r.grp === 'SECTOR' ? 'SECTOR' : 'INDUSTRY'}</span></th>
      <td class="${signClass(r.today_pct)}"><b>${arrow(r.today_pct)} ${signedPct(r.today_pct)}</b></td>
      <td class="${signClass(r.vs_iwm_pct)}">${signedPct(r.vs_iwm_pct)}</td>
      <td class="sb-x"><b class="${signClass(r.move_x)}">${times(r.move_x, 2, true)}</b><small>swing ${signedPct(r.swing_pct).replace('+', '')}</small></td>
      <td>${times(r.rvol)}</td>
      <td class="${signClass(r.prev1d_pct)}">${signedPct(r.prev1d_pct)}</td>
      <td class="${signClass(r.r5d_pct)}">${signedPct(r.r5d_pct)}</td>
      <td class="${signClass(r.r20d_pct)}">${signedPct(r.r20d_pct)}</td>
      <td class="${signClass(r.off_high_pct)}">${signedPct(r.off_high_pct)}</td>
      <td class="${signClass(r.above_low_pct)}">${signedPct(r.above_low_pct)}</td>
      <td>${stripWithDates(r.spark, run.spark_sessions)}</td>
      <td class="sb-breadth">${finite(r.measured) ? `<span class="tt-up">${finite(r.up) ?? 0}↑</span> / <span class="tt-down">${finite(r.down) ?? 0}↓</span><small>of ${finite(r.measured)}</small>` : '—'}</td>
    </tr>`;
    const detail = open ? `<tr class="tt-expand sb-expand"><td colspan="${SECTOR_COLUMNS.length}">${moverTable(r)}</td></tr>` : '';
    return main + detail;
  }).join('');
  return `<div class="sb-surface">${head}${bench}<div class="tt-wrap"><table class="theme-table rot-table sb-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="tt-caption">Members: 11 sector ETFs map by SIC code (GICS approximation, big-name overrides); industry ETFs use a fixed list of their main US names plus SIC-matched small caps (&lt; $2B). Holdings are not on the data plan. Market caps from the Sep 27 reference snapshot.</p></div>`;
}
