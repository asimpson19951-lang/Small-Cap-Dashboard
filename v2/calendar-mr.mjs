// CALENDAR · PRE-EARNINGS MEAN-REVERSION BLOCK (V2.18.0).
// Renders ./data/calendar-mr.json (built offline by scripts/build-calendar-mr-snapshot.mjs).
// Playbook status is stated in the header: NOT YET TESTED. Every report row carries its date status
// (CONFIRMED by a company release / ESTIMATED = no company date / UNVERIFIED = no check file) and its source.
// Raw values only; n < 10 reads "raw count, n=X"; the median is hidden under n = 3; each name's own
// any-day base rate sits beside its pre-ER record. Times are Mountain Time (MT). No scores, no grades.

export const PLAYBOOK_RESULT = 'The pre-ER day reverts slightly more than ordinary days (+0.08 to +0.12 pts), but no mechanical rule cleared costs. This is a discretionary watch, not an edge.';
const MINUS = '−';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function signed(v, d, unit) {
  if (!finite(v)) return 'n/a';
  const r = Number(Math.abs(v).toFixed(d));
  return r === 0 ? `${(0).toFixed(d)}${unit}` : `${v > 0 ? '+' : MINUS}${r.toFixed(d)}${unit}`;
}
export const fmtPct = (v, d = 2) => signed(v, d, '%');
export const fmtX = (v, d = 2) => signed(v, d, '×');
export const fmtPlain = (v, d = 1) => (finite(v) ? `${v.toFixed(d)}%` : 'n/a');
export const mtStamp = (iso) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return 'n/a'; return `${d.toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hour12: false })} MT`; };
const filedMt = (f) => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d) ET$/.exec(f || ''); if (!m) return ''; const mins = (+m[4]) * 60 + (+m[5]) - 120; const wrap = mins < 0 ? mins + 1440 : mins; return `${String(Math.floor(wrap / 60)).padStart(2, '0')}:${String(wrap % 60).padStart(2, '0')} MT`; };
export const timingLabel = (x, session) => (x.timing === 'INTRADAY' ? (session === 'BMO' ? 'BMO (8-K in session)' : session === 'AMC' ? 'AMC' : 'time unknown (8-K in session)') : x.timing);
const cls = (v) => (!finite(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');
const parts = (d) => d.split('-').map(Number);
export const dShort = (d) => { if (!d) return 'n/a'; const [y, m, dd] = parts(d); return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${MON[m - 1]} ${dd}`; };
export const dMd = (d) => { const [, m, dd] = parts(d); return `${MON[m - 1]} ${dd}`; };
export function weekdaysBetween(from, to) { // sessions from `from` to `to` (weekdays only; the board has no holiday table here)
  const [fy, fm, fd] = parts(from), [ty, tm, td] = parts(to); let a = Date.UTC(fy, fm - 1, fd); const b = Date.UTC(ty, tm - 1, td); const dir = b >= a ? 1 : -1; let n = 0;
  while (a !== b) { a += dir * 86400000; const w = new Date(a).getUTCDay(); if (w !== 0 && w !== 6) n += dir; }
  return n;
}
const d4 = (v, scale, fmt = fmtPct) => {
  if (!finite(v)) return '<td class="cm-n cm-na">n/a</td>';
  const s = Math.min(1, Math.abs(v) / scale);
  return `<td class="cm-n cm-d4 ${cls(v)}"><span>${fmt(v)}</span><i style="width:${(s * 100).toFixed(0)}%"></i></td>`;
};
const d4span = (v, scale, fmt = fmtPct) => (finite(v) ? `<span class="cm-d4s ${cls(v)}"><span>${fmt(v)}</span><i style="width:${(Math.min(1, Math.abs(v) / scale) * 100).toFixed(0)}%"></i></span>` : 'n/a');
const pbar = (p) => (finite(p) ? `<span class="cm-pb ${p <= 5 || p >= 95 ? 'x' : ''}"><span class="cm-pbt"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>` : 'n/a');

// ---- date / time text (the part that must never overstate what is known) ----
export function dateModel(r, verifiedOn) {
  const v = r.verified || {}; const fh = r.finnhub;
  if (r.date_status === 'CONFIRMED') {
    const sess = v.session; const time = [];
    if (sess === 'AMC') time.push('after the close');
    if (v.release_mt) time.push(`release ${v.release_mt} MT`);
    else time.push(sess === 'BMO' ? 'release time TBA' : 'release minute TBA');
    if (v.call_mt) time.push(`call ${v.call_next_day ? 'next day ' : ''}${v.call_mt} MT`);
    return { badge: 'CONFIRMED', date: v.date, line1: `${dShort(v.date)} · ${sess || 'time TBA'}`, line2: time.join(' · '), pre: v.pre_er_date,
      warn: v.finnhub_wrong ? `Finnhub feed shows ${fh.session || 'no time'} ${dShort(fh.date)}; the company release says ${sess} ${dShort(v.date)}` : null, source: v.source };
  }
  if (r.date_status === 'ESTIMATED') {
    return { badge: 'ESTIMATED', date: null, line1: v.est_date ? `est. ${dShort(v.est_date)} · not announced` : 'no date announced', line2: 'time TBA',
      pre: null, warn: `Finnhub feed shows ${dShort(fh.date)}; no company release supports that date`, source: v.source };
  }
  return { badge: 'UNVERIFIED', date: null, line1: `${dShort(fh.date)} · ${fh.session || 'time TBA'}`, line2: 'date not checked against a company release', pre: null,
    warn: verifiedOn ? null : 'ER date check file not found at build time', source: null };
}
const badgeHtml = (m) => `<span class="cm-bd cm-bd-${m.badge.toLowerCase()}">${m.badge}</span>${m.source ? `<a class="cm-src" href="${esc(m.source.url)}" target="_blank" rel="noopener">${m.source.tier === 'P' ? 'company release' : m.source.tier === 'S' ? 'secondary est.' : 'source'}</a>` : ''}`;

const moves = (hist, key) => (hist.length ? `<span class="cm-mv">${[...hist].reverse().map((x) => `<b class="${cls(x[key])}" title="${esc(x.react_date)}">${fmtPct(x[key], 1)}</b>`).join('')}</span>` : '<span class="cm-na">no past reports in the bar window</span>');
function recordCells(r) {
  const rp = r.reports; const any = r.any_day;
  const med = rp.median_hidden ? `<span class="cm-hid">median hidden · n=${rp.n}</span>` : `${rp.median_abs_react.toFixed(2)}%`;
  const against = rp.n ? `<b>${rp.against} of ${rp.n}</b> against 5D run-up` : 'n/a';
  const base = any ? `any day: <b>${any.against_pct.toFixed(1)}%</b> against (n=${any.n}) · median |move| ${any.median_abs_move_pct.toFixed(2)}%` : 'any day: n/a';
  return { rp, med, against, base, count: rp.small_n ? `raw count, n=${rp.n}` : `n=${rp.n}` };
}

function drawerHtml(r) {
  const sess = r.verified?.session || null;
  const rows = r.reports.history.map((x) => `<tr><td class="l">${dShort(x.react_date)}</td><td class="l">${timingLabel(x, sess)} · 8-K ${filedMt(x.filed_et)}</td>${d4(x.run5, 20)}${d4(x.pre, 10)}<td class="cm-n">${Math.sign(x.pre) !== Math.sign(x.run5) ? 'against' : 'with'}</td>${d4(x.gap, 25)}${d4(x.react, 25)}</tr>`).join('');
  const c = r.now;
  const now = c ? `NOW · 5D run-up <b>${fmtPct(c.r5)}</b> (<b>${fmtPlain(c.run5_pctile)}</b> pctile of its own ${c.run5_n} 5D runs) · 20D <b>${fmtPct(c.r20)}</b> · <b>${fmtX(c.stretch)}</b> ATR from the 8EMA (pctile <b>${fmtPlain(c.stretch_pctile)}</b>) · <b>${fmtX(c.v20sma_atr)}</b> ATR from the 20SMA (20EMA: <b>${fmtX(c.v20ema_atr)}</b>) · ATR <b>${c.atr_pct.toFixed(2)}%</b> of price` : 'No bars for this name.';
  const cnt = r.reports.small_n ? ` Raw count, n=${r.reports.n}: a record, not a pattern.` : '';
  return `<div class="cm-dr"><div class="cm-sk">${esc(r.ticker)} · past reports (SEC 8-K item 2.02) · raw, n=${r.reports.n}</div>
${r.reports.n ? `<table class="cm-t cm-mini"><thead><tr><th class="l">Reaction day</th><th class="l">Release · 8-K accepted</th><th>5D run-up into pre-er</th><th>Pre-er day</th><th>Vs run-up</th><th>Gap</th><th>Er-day move</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="cm-na">No 8-K item 2.02 reports fall inside this name\'s bar window (foreign filers file 6-K).</div>'}
<div class="cm-ex">${now}.${cnt}</div></div>`;
}

export function renderPreEr(data, { today, openTicker = null, drill = null, canChart = null } = {}) {
  const T = today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  const models = data.rows.map((r) => ({ r, m: dateModel(r, data.er_dates_verified), rec: recordCells(r) }));
  const firm = models.filter((x) => x.m.pre).sort((a, b) => a.m.pre.localeCompare(b.m.pre) || a.r.ticker.localeCompare(b.r.ticker));
  const rest = models.filter((x) => !x.m.pre).sort((a, b) => (a.r.verified?.est_date || '9').localeCompare(b.r.verified?.est_date || '9') || a.r.ticker.localeCompare(b.r.ticker));
  const nConf = models.filter((x) => x.m.badge === 'CONFIRMED').length, nEst = models.filter((x) => x.m.badge === 'ESTIMATED').length, nUn = models.filter((x) => x.m.badge === 'UNVERIFIED').length;
  const preCell = (x) => {
    if (!x.m.pre) return '<span class="cm-na">no firm pre-ER day · date not announced</span>';
    const n = weekdaysBetween(T, x.m.pre);
    return `<b>${dMd(x.m.pre)}</b> <span class="cm-k">· ${n === 0 ? 'today' : n < 0 ? `${-n} sess ago` : `in ${n} sess`}</span>`;
  };
  const row = (x) => {
    const { r, m, rec } = x; const c = r.now || {}; const open = openTicker === r.ticker;
    return `<tr class="cm-row ${open ? 'open' : ''} ${(c.stretch_pctile <= 5 || c.stretch_pctile >= 95) ? 'ext' : ''}" data-cm-ticker="${esc(r.ticker)}" tabindex="0" aria-expanded="${open}">
<td class="l"><div class="cm-bw">${badgeHtml(m)}</div><b>${esc(m.line1)}</b><div class="cm-k sm">${esc(m.line2)}</div>${m.warn ? `<div class="cm-warn">${esc(m.warn)}</div>` : ''}</td>
<td class="l"><b class="cm-tk">${esc(r.ticker)}</b><div class="cm-k sm">${esc(r.themes.join(', '))}</div></td>
<td class="l"><div class="cm-sl">Pre-er day</div>${moves(rec.rp.history, 'pre')}<div class="cm-sl">Er day</div>${moves(rec.rp.history, 'react')}<div class="cm-cnt">${rec.count}</div></td>
<td class="cm-n">${rec.med}</td><td class="l">${rec.against}<div class="cm-k sm">${rec.base}</div></td>
${d4(c.r5, 10)}${d4(c.r20, 20)}<td class="cm-n">${pbar(c.run5_pctile)}</td>${d4(c.stretch, 2.5, fmtX)}${d4(c.v20sma_atr, 3, fmtX)}<td class="cm-n">${finite(c.p252) ? `${c.p252.toFixed(1)}%` : 'n/a'}</td>
<td class="cm-n">${preCell(x)}</td></tr>${open ? `<tr class="cm-drawer"><td colspan="12" class="l">${drawerHtml(r)}</td></tr>` : ''}`;
  };
  const card = (x) => {
    const { r, m, rec } = x; const c = r.now || {};
    return `<div class="cm-card ${(c.stretch_pctile <= 5 || c.stretch_pctile >= 95) ? 'ext' : ''}"><div class="cm-ch"><b class="cm-tk">${esc(r.ticker)}</b>${badgeHtml(m)}</div>
<div class="cm-cd"><b>${esc(m.line1)}</b> <span class="cm-k">${esc(m.line2)}</span></div>${m.warn ? `<div class="cm-warn">${esc(m.warn)}</div>` : ''}
<div class="cm-scroll"><div class="cm-sl">Pre-er day</div>${moves(rec.rp.history, 'pre')}<div class="cm-sl">Er day</div>${moves(rec.rp.history, 'react')}</div><div class="cm-cnt">${rec.count}</div>
<div class="cm-g"><div><em>Median |er move|</em>${rec.med}</div><div><em>Pre-ER vs run-up</em>${rec.rp.n ? `${rec.rp.against} of ${rec.rp.n} against` : 'n/a'}</div><div><em>Any day, against</em>${r.any_day ? `${r.any_day.against_pct.toFixed(1)}% (n=${r.any_day.n})` : 'n/a'}</div><div><em>5D now</em>${d4span(c.r5, 10)}</div><div><em>5D run-up pctile</em>${fmtPlain(c.run5_pctile)}</div><div><em>×ATR 8ema</em>${fmtX(c.stretch)}</div><div><em>×ATR vs 20SMA</em>${fmtX(c.v20sma_atr)}</div><div><em>Pre-er session</em>${x.m.pre ? dMd(x.m.pre) : 'not set'}</div></div></div>`;
  };
  const head = `<thead><tr><th class="l">Report date · status</th><th class="l">Name</th><th class="l">Past moves · oldest → newest</th><th>Median |er-day move|</th><th class="l">Pre-ER day vs 5D run-up · any-day base rate</th><th>5D now</th><th>20D now</th><th>5D run-up pctile</th><th>×ATR 8ema</th><th>×ATR vs 20SMA</th><th>1-yr 8EMA pctile</th><th>Pre-er session</th></tr></thead>`;
  const stamp = data.er_dates_verified
    ? `Dates checked against company releases (${nConf} confirmed · ${nEst} estimated, no company date)`
    : `ER dates UNVERIFIED: no check file at build time (${nUn} rows)`;
  const fullBlock = `<section class="breadth-panel cm-panel" aria-labelledby="cmTitle">
<div class="breadth-panel-head"><div><div class="book-kicker">Pre-earnings · mean-reversion watch · ${dMd(data.window.from)} → ${dMd(data.window.to)} (Finnhub window)</div><h3 id="cmTitle">History first: each name's last reports and how it is set up now</h3></div><span>bars to ${esc(dShort(data.bar_session))} close</span></div>
<p class="cm-status"><b>Tested sep 30</b> · ${esc(PLAYBOOK_RESULT)} n &lt; ${data.small_n} is a record, not a pattern. ${esc(stamp)}.</p>
<p class="breadth-definition">Past reports = SEC 8-K item 2.02 acceptance times on this name's own daily bars. Pre-ER day = the last full session before the reaction session; 5D run-up = the 5 sessions before it; ER-day = close-to-close on the reaction session. Run-up percentile = today's 5D return against this name's own 5D returns in the bar window. Any-day base rate = how often an ordinary session moved against the prior 5D run, same name, same bars. Estimated rows never show a firm pre-ER day; a BMO release minute that was not verified reads "time TBA".</p>
<div class="cm-tw cm-wide"><table class="cm-t">${head}<tbody>${firm.map(row).join('')}${rest.length ? `<tr class="cm-sep"><td colspan="12" class="l">Date not announced or not checked · ${rest.length} names · no firm pre-ER day</td></tr>${rest.map(row).join('')}` : ''}</tbody></table></div>
<div class="cm-cards">${firm.map(card).join('')}${rest.length ? `<div class="cm-sep2">Date not announced or not checked · no firm pre-er day</div>${rest.map(card).join('')}` : ''}</div>
<p class="breadth-definition">Sources: ${esc(data.sources.dates)} · ${esc(data.sources.past_reports)} · bars ${esc(data.sources.bars)}. Built ${esc(mtStamp(data.generated_at))}; every time on this page is MT.</p></section>`;
  // ---- board skin v2 (Oct 19 2026): .sk head → read → strip → quick view → Deep view (the full block below, unchanged data) ----
  const isX = (p) => finite(p) && (p <= 5 || p >= 95);
  const ud = (v) => (!finite(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');
  const pcSk = (p) => (finite(p) ? `<span class="pc${isX(p) ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>` : 'n/a');
  const upcoming = firm.filter((x) => weekdaysBetween(T, x.m.pre) >= 0);
  const next = upcoming[0] || null;
  const extN = models.filter((x) => isX(x.r.now?.stretch_pctile)).length;
  const sessWord = (pre) => { const n = weekdaysBetween(T, pre); return n === 0 ? 'today' : n < 0 ? `${-n} sess ago` : `in ${n} sess`; };
  // V2.19.4 drill-down (Austin Oct 20: click a count tile → its names open in place; click a name → its detail).
  // dt() closes the tile's class attribute and adds the drill hooks; one list open at a time.
  const dt = (k) => ` drill${drill === k ? ' open' : ''}" data-sk-drill="${k}" tabindex="0" role="button" aria-expanded="${drill === k}"`;
  const extDist = (x) => { const p = x.r.now?.stretch_pctile; return finite(p) ? Math.abs(p - 50) : -1; };
  const DRILLS = {
    all: { title: `All ${models.length} names in the window`, sub: 'Confirmed pre-ER days first, soonest first; then names with no firm date', list: () => [...firm, ...rest] },
    conf: { title: `${nConf} names with a confirmed date`, sub: 'Date checked against the company release · soonest pre-ER day first', list: () => [...firm, ...rest].filter((x) => x.m.badge === 'CONFIRMED') },
    next: { title: `${upcoming.length} confirmed pre-ER days ahead`, sub: 'Soonest first', list: () => upcoming },
    ext: { title: `${extN} ${extN === 1 ? 'name' : 'names'} at a stretch extreme`, sub: '×ATR from the 8EMA at or below the 5th or at or above the 95th percentile of its own history · most extreme first', list: () => models.filter((x) => isX(x.r.now?.stretch_pctile)).sort((a, b) => extDist(b) - extDist(a)) },
  };
  // One clickable name row (+ its detail row when open). Shared by the drill list and the quick view.
  const nameRow = (x, cols) => {
    const c = x.r.now || {}; const open = openTicker === x.r.ticker;
    const chart = open && typeof canChart === 'function' && canChart(x.r.ticker) ? ` <button type="button" class="sk-go" data-cm-chart="${esc(x.r.ticker)}">Open on Now ›</button>` : '';
    return `<tr class="click${open ? ' open' : ''}${isX(c.stretch_pctile) ? ' ext' : ''}" data-cm-ticker="${esc(x.r.ticker)}" tabindex="0" aria-expanded="${open}">${cols(x, c)}</tr>${open ? `<tr class="xrow"><td colspan="9">${drawerHtml(x.r)}${chart}</td></tr>` : ''}`;
  };
  const drillCols = (x, c) => `<th>${esc(x.r.ticker)}<small>${esc(x.r.themes.join(', '))}</small></th><td class="l">${esc(x.m.line1)}<small>${esc(x.m.badge.toLowerCase())}</small></td><td>${x.m.pre ? `${dMd(x.m.pre)}<small>${sessWord(x.m.pre)}</small>` : 'not set'}</td><td class="${ud(c.r5)}">${fmtPct(c.r5)}</td><td class="${ud(c.stretch)}">${fmtX(c.stretch)}</td><td>${pcSk(c.stretch_pctile)}</td>`;
  const D = drill && DRILLS[drill];
  const drillPanel = D ? `<section class="panel drillp" aria-label="${esc(D.title)}"><h2>${esc(D.title)}</h2><p class="sub">${esc(D.sub)} · click a name for its past reports · click the tile again to close</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th class="l">Report</th><th>Pre-ER session</th><th>5D now</th><th>×ATR 8EMA</th><th>×ATR pctile (own history)</th></tr></thead><tbody>${D.list().map((x) => nameRow(x, drillCols)).join('') || '<tr><td colspan="6" class="l">No names.</td></tr>'}</tbody></table></div></section>` : '';
  const skHead = `<div class="head"><h1>Calendar</h1><span class="meta">Pre-earnings watch ${dMd(data.window.from)} → ${dMd(data.window.to)} (Finnhub window) · bars to the ${esc(dShort(data.bar_session))} close · built ${esc(mtStamp(data.generated_at))}</span></div>`;
  const read = `<p class="read">${next ? `Next firm pre-ER day: <b>${esc(next.r.ticker)} ${dMd(next.m.pre)}</b> (${sessWord(next.m.pre)}), 5D run-up ${fmtPct(next.r.now?.r5)} (${fmtPlain(next.r.now?.run5_pctile)} pctl of its own 5D runs). ` : 'No firm pre-ER day ahead in this window. '}${upcoming.length} of ${models.length} names have a confirmed pre-ER day ahead. Tested Sep 30: the pre-ER day reverts slightly more than ordinary days, but no mechanical rule cleared costs.</p>`;
  const tiles = [
    `<div class="tile${dt('all')}><div class="k">Names in window</div><div class="v">${models.length}<small>names</small></div><div class="s">${dMd(data.window.from)} → ${dMd(data.window.to)}</div></div>`,
    `<div class="tile${dt('conf')}><div class="k">Dates confirmed</div><div class="v">${nConf}<small>of ${models.length}</small></div><div class="s">${nEst} estimated · ${nUn} not checked</div></div>`,
    `<div class="tile${upcoming.length ? dt('next') : '"'}><div class="k">Next pre-ER day</div><div class="v">${next ? dMd(next.m.pre) : 'none'}${next ? `<small>${esc(next.r.ticker)}</small>` : ''}</div><div class="s">${next ? `${sessWord(next.m.pre)} · ${upcoming.length} ahead` : 'no firm date ahead'}</div></div>`,
    `<div class="tile mr${extN ? ' ext' : ''}${extN ? dt('ext') : '"'}><div class="k">At a stretch extreme</div><div class="v">${extN}<small>${extN === 1 ? "name" : "names"}</small></div><div class="s">×ATR 8EMA ≤5% or ≥95% of own history</div></div>`,
  ];
  const strip = `<div class="strip" style="--cols:4">${tiles.join('')}</div>`;
  const qRows = (upcoming.length ? upcoming : firm).slice(0, 12);
  const quick = `<section class="panel"><h2>Mean-reversion lens: pre-ER setups, next ${qRows.length}</h2><p class="sub">Confirmed pre-ER days, soonest first · gold row = ×ATR at its own-history extreme · click a name for its past reports · the full table is in Deep view</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Pre-ER session</th><th class="opt">Report</th><th>5D now</th><th>5D run-up pctile</th><th>×ATR 8EMA</th><th class="opt">Pre-ER day vs run-up</th><th class="opt">Median |ER move|</th></tr></thead><tbody>${qRows.length ? qRows.map((x) => nameRow(x, (x, c) => `<th>${esc(x.r.ticker)}<small>${esc(x.r.themes.join(', '))}</small></th><td>${dMd(x.m.pre)}<small>${sessWord(x.m.pre)}</small></td><td class="opt">${esc(x.m.line1)}</td><td class="${ud(c.r5)}">${fmtPct(c.r5)}</td><td>${pcSk(c.run5_pctile)}</td><td class="${ud(c.stretch)}">${fmtX(c.stretch)}</td><td class="opt">${x.rec.rp.n ? `${x.rec.rp.against} of ${x.rec.rp.n} against` : 'n/a'}</td><td class="opt">${x.rec.rp.median_hidden ? `hidden · n=${x.rec.rp.n}` : `${x.rec.rp.median_abs_react.toFixed(2)}%`}</td>`)).join('') : '<tr><td colspan="8" class="l">No confirmed pre-ER day in this window.</td></tr>'}</tbody></table></div><p class="note">Descriptive, not an edge claim. n &lt; ${data.small_n} is a record, not a pattern. ${esc(stamp)}.</p></section>`;
  const deepOpen = !!globalThis.__skDeepOpen?.has('calendar');
  return `<div class="sk">${skHead}${read}${strip}${drillPanel}${quick}<details class="deep" data-sk-deep="calendar"${deepOpen ? ' open' : ''}><summary>Deep view <span>all ${models.length} names · past reports per name · date status and sources · definitions</span></summary><div class="body">${fullBlock}</div></details></div>`;
}

let cache = null; let openTicker = null; let drill = null;
export async function mountCalendarMr(host, { dataUrl = './data/calendar-mr.json', today, openChart = null, canChart = null } = {}) {
  if (!host) return;
  try {
    if (!cache) { const res = await fetch(dataUrl, { cache: 'no-cache' }); if (!res.ok) throw new Error(`calendar-mr.json ${res.status}`); cache = await res.json(); }
    const paint = (focusSel) => { host.innerHTML = renderPreEr(cache, { today, openTicker, drill, canChart }); if (focusSel) host.querySelector(focusSel)?.focus({ preventScroll: true }); };
    paint();
    host.onclick = (ev) => {
      if (ev.target.closest('a')) return;
      const go = ev.target.closest('[data-cm-chart]'); if (go) { if (typeof openChart === 'function') openChart(go.dataset.cmChart); return; }
      const tile = ev.target.closest('[data-sk-drill]'); if (tile) { const k = tile.dataset.skDrill; drill = drill === k ? null : k; paint(`[data-sk-drill="${k}"]`); return; }
      const tr = ev.target.closest('[data-cm-ticker]'); if (!tr) return; const t = tr.dataset.cmTicker; const inDrill = !!tr.closest('.drillp'); openTicker = openTicker === t ? null : t; paint(`${inDrill ? '.drillp ' : ''}[data-cm-ticker="${t}"]`);
    };
    host.onkeydown = (ev) => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const tr = ev.target.closest?.('[data-cm-ticker], [data-sk-drill]'); if (tr && tr === ev.target) { ev.preventDefault(); tr.click(); } };
  } catch (error) {
    host.innerHTML = `<section class="breadth-panel"><div class="loading-card">Pre-earnings block unavailable: ${esc(error?.message || String(error))}</div></section>`;
  }
}
