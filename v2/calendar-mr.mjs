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
import { hm12, mtStamp12, decode as decodeMrMap } from './mr-map.mjs?v=V2.20.0';
import { isTradingSession, fmtMT12Date } from './market-calendar.mjs?v=V2.20.0';
export const mtStamp = (iso) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return 'n/a'; return mtStamp12(d.getTime()); };
const filedMt = (f) => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d) ET$/.exec(f || ''); if (!m) return ''; const mins = (+m[4]) * 60 + (+m[5]) - 120; const wrap = mins < 0 ? mins + 1440 : mins; return `${hm12(Math.floor(wrap / 60), wrap % 60)} MT`; };
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

// ---- ALL-STOCKS earnings (Oct 20 2026 ruling: nothing limited to the board universe) ----
export const CAP_BUCKETS = ['all', 'under2b', 'over2b'];
export const inBucket = (r, b) => (b === 'under2b' ? finite(r.market_cap) && r.market_cap < 2e9 : b === 'over2b' ? finite(r.market_cap) && r.market_cap >= 2e9 : true);
export const fmtCap = (v) => (!finite(v) ? 'n/a' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`);
const fmtEps = (v) => (finite(v) ? `${v < 0 ? MINUS : ''}$${Math.abs(v).toFixed(2)}` : 'n/a');
const dayLbl = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const SESS_LBL = { BMO: 'Before open', AMC: 'After close' };
export function allErUpcoming(allEr, today, bucket) { return (allEr || []).filter((r) => r && typeof r.report_date === 'string' && r.report_date >= today && inBucket(r, bucket)); }
export function allErDays(rows, today, max = 10) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.report_date)) by.set(r.report_date, { date: r.report_date, bmo: 0, amc: 0, na: 0, total: 0, rows: [] }); const d = by.get(r.report_date); d.total += 1; d.rows.push(r); if (r.session === 'BMO') d.bmo += 1; else if (r.session === 'AMC') d.amc += 1; else d.na += 1; }
  return [...by.values()].filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, max);
}
const capDesc = (a, b) => (finite(b.market_cap) ? b.market_cap : -1) - (finite(a.market_cap) ? a.market_cap : -1);

// ---- P1 (Nov 13 2026): week-at-a-glance earnings grid, next US releases, rates + inflation odds ----
// Earnings Whispers / Nasdaq-style day columns, split by report time. The MR angle is each name's ×ATR from the 8EMA
// (MR MAP; gold fill when that sits at ≤5% or ≥95% of its own 2-yr history) and the confirmed pre-ER day row. Raw values only.
const addDay = (iso, n) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
// The next `n` trading sessions starting at `today` (today counts when it is a session). Outside the 2026-2028
// holiday table isTradingSession returns null; then a weekday counts.
export function nextSessions(today, n = 5, isTrading = isTradingSession) {
  const out = []; let d = today;
  for (let i = 0; out.length < n && i < 40; i += 1, d = addDay(d, 1)) {
    const k = isTrading(d);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (k === true || (k == null && wd !== 0 && wd !== 6)) out.push(d);
  }
  return out;
}
const SPREAD_SESS = { 'time-pre-market': 'BMO', 'time-after-hours': 'AMC' };
export const isExt = (p) => finite(p) && (p <= 5 || p >= 95);
// One model for the grid. allEr = breadth-tape calendar.earnings_all; spreads = spreads.json earnings rows;
// mrBy = Map ticker -> decoded MR MAP row; preRows = [{ticker, pre, date, session, x, pc}] from calendar-mr.json.
// Session comes from the earnings feed, else from the options feed for the same date, else "time n/a" (never guessed).
export function weekModel({ sessions = [], allEr = [], spreads = [], mrBy = new Map(), preRows = [] } = {}) {
  const want = new Set(sessions);
  const sp = new Map();
  for (const r of spreads || []) if (r && r.ticker && r.next_er && want.has(r.next_er.date)) sp.set(`${String(r.ticker).toUpperCase()}|${r.next_er.date}`, r);
  const seen = new Set(); const items = [];
  const add = (t, date, sess, cap) => {
    const key = `${t}|${date}`; if (seen.has(key)) return; seen.add(key);
    const o = sp.get(key); const mm = mrBy.get(t);
    const session = sess === 'BMO' || sess === 'AMC' ? sess : (o && SPREAD_SESS[o.next_er.session]) || null;
    items.push({ t, date, session, cap: finite(cap) ? cap : finite(o?.market_cap_usd) ? o.market_cap_usd : finite(mm?.cap) ? mm.cap : null,
      im: finite(o?.implied_move_pct) ? o.implied_move_pct : null, x: finite(mm?.x) ? mm.x : null, pc: finite(mm?.pc) ? mm.pc : null });
  };
  for (const r of allEr || []) if (r && r.ticker && want.has(r.report_date)) add(String(r.ticker).toUpperCase(), r.report_date, r.session, r.market_cap);
  for (const o of sp.values()) add(String(o.ticker).toUpperCase(), o.next_er.date, null, null);
  const byCap = (a, b) => (finite(b.cap) ? b.cap : -1) - (finite(a.cap) ? a.cap : -1) || a.t.localeCompare(b.t);
  return sessions.map((date) => {
    const day = items.filter((i) => i.date === date);
    const pre = (preRows || []).filter((r) => r.pre === date).map((r) => ({ t: r.ticker, report: r.date, session: r.session || null,
      x: finite(r.x) ? r.x : null, pc: finite(r.pc) ? r.pc : null, cap: finite(mrBy.get(r.ticker)?.cap) ? mrBy.get(r.ticker).cap : null })).sort(byCap);
    return { date, total: day.length, pre, bmo: day.filter((i) => i.session === 'BMO').sort(byCap), amc: day.filter((i) => i.session === 'AMC').sort(byCap), na: day.filter((i) => !i.session).sort(byCap) };
  });
}
// The rates + inflation odds quick view: contracts with real 24h activity only (Kalshi contracts, Polymarket $),
// each topic's venues interleaved by probability, then the topics taken in turn until `max` rows.
export const ODDS_QUICK_TOPICS = ['fomc-decision', 'cpi-inflation', 'pce-inflation'];
export const oddsActivity = (c) => (c?.provider === 'KALSHI' ? c?.volume_24h_contracts : c?.volume_24h_usd);
export function eventOddsQuick(snapshot, { topics = ODDS_QUICK_TOPICS, max = 8 } = {}) {
  const list = Array.isArray(snapshot?.topics) ? snapshot.topics : [];
  const queues = topics.map((id) => list.find((t) => t && t.id === id)).filter(Boolean).map((topic) => {
    const live = (topic.contracts || []).filter((c) => finite(oddsActivity(c)) && oddsActivity(c) > 0 && finite(c.probability_pct));
    const byProv = new Map();
    for (const c of live) { if (!byProv.has(c.provider)) byProv.set(c.provider, []); byProv.get(c.provider).push(c); }
    for (const a of byProv.values()) a.sort((x, y) => y.probability_pct - x.probability_pct);
    const lanes = [...byProv.values()].sort((a, b) => b[0].probability_pct - a[0].probability_pct); const q = [];
    for (let i = 0; lanes.some((l) => i < l.length); i += 1) for (const l of lanes) if (i < l.length) q.push(l[i]);
    return { topic, q };
  });
  const picked = queues.map(() => []); let n = 0;
  for (let i = 0; n < max && queues.some((x) => i < x.q.length); i += 1) {
    for (let k = 0; k < queues.length && n < max; k += 1) if (i < queues[k].q.length) { picked[k].push(queues[k].q[i]); n += 1; }
  }
  return queues.map((x, k) => ({ id: x.topic.id, label: x.topic.label, rows: picked[k] })).filter((g) => g.rows.length);
}
// The next US macro releases from the catalyst feed (kind MACRO), soonest first, from `nowMs` on.
export function macroNext(events, nowMs = Date.now(), max = 6) {
  return (Array.isArray(events) ? events : []).filter((e) => e && e.kind === 'MACRO' && Date.parse(e.starts_at) >= nowMs)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, max);
}
const fmtPp = (v) => (finite(v) ? signed(v, 1, ' pp') : 'n/a');
const fmtAct = (c) => { const v = oddsActivity(c); if (!finite(v)) return 'n/a'; const k = v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`; return c.provider === 'KALSHI' ? `${k} contracts` : `$${k}`; };
const topicName = (label) => String(label || '').split(' · ').map((x, i) => (i === 0 ? x : x.charAt(0) + x.slice(1).toLowerCase())).join(' · ');
export const CELL_CAP = 8;
function weekHtml(week, T, more) {
  const chip = (i, kind) => {
    const bits = [finite(i.cap) ? `<span>${fmtCap(i.cap)}</span>` : ''];
    if (kind === 'pre') bits.push(`<span>reports ${esc(dShort(i.report))}${i.session ? ` ${esc(i.session)}` : ''}</span>`);
    else if (finite(i.im)) bits.push(`<span title="options-implied move into the report">±${i.im.toFixed(1)}%</span>`);
    if (finite(i.x)) bits.push(`<span class="${cls(i.x)}" title="×ATR from the 8EMA${finite(i.pc) ? ` · ${i.pc.toFixed(0)}% of its own 2-yr history` : ''}">${fmtX(i.x, 1)}</span>`);
    return `<li class="${isExt(i.pc) ? 'ext' : ''}" data-ticker="${esc(i.t)}" tabindex="0"><b>${esc(i.t)}</b>${bits.filter(Boolean).join('')}</li>`;
  };
  const group = (d, key, label, kind) => {
    const list = d[key]; if (!list.length) return '';
    const k = `${d.date}|${key}`; const open = more.has(k); const show = open ? list : list.slice(0, CELL_CAP);
    const btn = list.length > CELL_CAP ? `<button type="button" class="cw-more" data-cw-more="${esc(k)}" aria-expanded="${open}">${open ? `Show first ${CELL_CAP}` : `+${list.length - CELL_CAP} more`}</button>` : '';
    return `<div class="cw-g${kind === 'pre' ? ' cw-pre' : ''}"><div class="cw-gl">${label} <span>${list.length}</span></div><ul>${show.map((i) => chip(i, kind)).join('')}</ul>${btn}</div>`;
  };
  return `<div class="cw-grid">${week.map((d) => `<section class="cw-day${d.date === T ? ' today' : ''}"><h3>${esc(dShort(d.date))}${d.date === T ? ' <small>today</small>' : ''}<span>${d.total} ${d.total === 1 ? 'report' : 'reports'}</span></h3>${group(d, 'pre', 'Pre-ER day (confirmed)', 'pre')}${group(d, 'bmo', 'Before the open', '')}${group(d, 'amc', 'After the close', '')}${group(d, 'na', 'Time n/a', '')}${d.total || d.pre.length ? '' : '<p class="cw-none">No reports in the feed.</p>'}</section>`).join('')}</div>`;
}
function oddsHtml(groups, snap) {
  if (!groups.length) return '<p class="note">No rates or inflation contract traded in the last 24 hours.</p>';
  const rows = groups.map((g) => `<tr class="grp-row"><th colspan="6" class="l">${esc(topicName(g.label))}</th></tr>${g.rows.map((c) => `<tr><th class="l">${esc(c.contract_label || c.question)}<small>${esc(c.question)}</small></th><td class="l">${c.provider === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</td><td>${c.probability_pct.toFixed(1)}%</td><td class="${cls(c.delta_24h_pp)}">${fmtPp(c.delta_24h_pp)}</td><td class="opt ${cls(c.delta_7d_pp)}">${fmtPp(c.delta_7d_pp)}</td><td class="opt">${fmtAct(c)}</td></tr>`).join('')}`).join('');
  return `<div class="tw"><table class="t no-sk-sort"><thead><tr><th class="l">Contract</th><th class="l">Venue</th><th>Yes</th><th>24h<small>pp</small></th><th class="opt">7d<small>pp</small></th><th class="opt">24h activity</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">Venue-implied, read only · snapshot ${esc(mtStamp(snap?.generated_at))} · every series in Deep view.</p>`;
}
function macroHtml(list) {
  if (!list.length) return '<p class="note">No US release ahead in the feed window.</p>';
  return `<div class="tw"><table class="t no-sk-sort"><thead><tr><th class="l">When (MT)</th><th class="l">Release</th><th class="l">Source</th></tr></thead><tbody>${list.map((e) => `<tr><th class="l">${esc(fmtMT12Date(e.starts_at))}</th><td class="l w">${esc(e.title)}</td><td class="l">${e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener">${esc(e.source || 'source')}</a>` : esc(e.source || 'n/a')}</td></tr>`).join('')}</tbody></table></div><p class="note">The feed carries the schedule only: no previous, forecast or actual values.</p>`;
}
export const CW_CSS = `
.sk .cw-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 4px 0 18px; }
.sk .cw-day { min-width: 0; padding: 10px 10px 8px; background: var(--raised); border-radius: 8px; }
.sk .cw-day.today { box-shadow: inset 0 0 0 1px var(--line-strong); }
.sk .cw-day h3 { margin: 0 0 8px; display: flex; align-items: baseline; gap: 6px; font: 600 15px/1.3 var(--font); color: var(--text); }
.sk .cw-day h3 small { font: 600 12px/1 var(--font); color: var(--text); padding: 2px 6px; border-radius: 3px; background: var(--raised-2); }
.sk .cw-day h3 > span { margin-left: auto; font: 400 13px/1 var(--font); color: var(--text-2); }
.sk .cw-g { margin: 0 0 8px; }
.sk .cw-gl { margin: 0 0 3px; color: var(--text-2); font: 600 12.5px/1.3 var(--font); }
.sk .cw-gl span { color: var(--text); margin-left: 4px; }
.sk .cw-g ul { margin: 0; padding: 0; list-style: none; }
.sk .cw-g li { display: flex; gap: 8px; align-items: baseline; padding: 3px 6px; border-radius: 4px; cursor: pointer; font: 400 13px/1.35 var(--font); color: var(--text-2); white-space: nowrap; overflow: hidden; }
.sk .cw-g li b { min-width: 46px; color: var(--text); font-weight: 600; }
.sk .cw-g li .up { color: var(--up); }
.sk .cw-g li .dn { color: var(--dn); }
.sk .cw-g li:hover, .sk .cw-g li:focus-visible { background: var(--raised-2); outline: none; }
.sk .cw-g li.ext { background: var(--gold-fill); box-shadow: inset 3px 0 0 var(--gold); }
.sk .cw-pre { padding: 4px 0 6px; border-bottom: 1px solid var(--line); }
.sk .cw-more { margin: 2px 0 0 6px; padding: 0; border: 0; background: none; color: var(--text); font: 600 12.5px/1.3 var(--font); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.sk .cw-none { margin: 0; color: var(--text-2); font-size: 13px; }
.sk .t tr.grp-row th { padding-top: 10px; color: var(--text); background: none; border-bottom: 1px solid var(--line-strong); }
@media (max-width: 1280px) { .sk .cw-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px) { .sk .cw-grid { grid-template-columns: minmax(0, 1fr); } }
`;

export function renderPreEr(data, { today, openTicker = null, drill = null, canChart = null, allEr = [], spreads = null, mrBy = null, odds = null, events = null, nowMs = Date.now(), legacy = null, more = new Set() } = {}) {
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
  const fullBlock = `<section class="breadth-panel cm-panel" aria-labelledby="cmTitle" data-sk-label="All names">
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
  const tiles = [
    `<div class="tile${dt('all')}><div class="k">Names in window</div><div class="v">${models.length}<small>names</small></div><div class="s">${dMd(data.window.from)} → ${dMd(data.window.to)}</div></div>`,
    `<div class="tile${dt('conf')}><div class="k">Dates confirmed</div><div class="v">${nConf}<small>of ${models.length}</small></div><div class="s">${nEst} estimated · ${nUn} not checked</div></div>`,
    `<div class="tile${upcoming.length ? dt('next') : '"'}><div class="k">Next pre-ER day</div><div class="v">${next ? dMd(next.m.pre) : 'none'}${next ? `<small>${esc(next.r.ticker)}</small>` : ''}</div><div class="s">${next ? `${sessWord(next.m.pre)} · ${upcoming.length} ahead` : 'no firm date ahead'}</div></div>`,
    `<div class="tile mr${extN ? ' ext' : ''}${extN ? dt('ext') : '"'}><div class="k">At a stretch extreme</div><div class="v">${extN}<small>${extN === 1 ? "name" : "names"}</small></div><div class="s">×ATR 8EMA ≤5% or ≥95% of own history</div></div>`,
  ];
  const strip = `<div class="strip" style="--cols:4">${tiles.join('')}</div>`;
  const qRows = (upcoming.length ? upcoming : firm).slice(0, 12);
  const quick = `<section class="panel" data-sk-label="Pre-ER setups"><h2>Pre-ER setups, next ${qRows.length}</h2><p class="sub">Confirmed pre-ER days, soonest first · gold row = ×ATR at its own-history extreme · click a name for its past reports</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Pre-ER session</th><th class="opt">Report</th><th>5D now</th><th>5D run-up pctile</th><th>×ATR 8EMA</th><th class="opt">Pre-ER day vs run-up</th><th class="opt">Median |ER move|</th></tr></thead><tbody>${qRows.length ? qRows.map((x) => nameRow(x, (x, c) => `<th>${esc(x.r.ticker)}<small>${esc(x.r.themes.join(', '))}</small></th><td>${dMd(x.m.pre)}<small>${sessWord(x.m.pre)}</small></td><td class="opt">${esc(x.m.line1)}</td><td class="${ud(c.r5)}">${fmtPct(c.r5)}</td><td>${pcSk(c.run5_pctile)}</td><td class="${ud(c.stretch)}">${fmtX(c.stretch)}</td><td class="opt">${x.rec.rp.n ? `${x.rec.rp.against} of ${x.rec.rp.n} against` : 'n/a'}</td><td class="opt">${x.rec.rp.median_hidden ? `hidden · n=${x.rec.rp.n}` : `${x.rec.rp.median_abs_react.toFixed(2)}%`}</td>`)).join('') : '<tr><td colspan="8" class="l">No confirmed pre-ER day in this window.</td></tr>'}</tbody></table></div><p class="note">Descriptive, not an edge claim. n &lt; ${data.small_n} is a record, not a pattern. ${esc(stamp)}.</p></section>`;
  const boardSet = new Set(models.map((x) => x.r.ticker));
  const erAll = Array.isArray(allEr) ? allEr : [];
  const erRows = allErUpcoming(erAll, T, capBucket);
  const erDays = allErDays(erRows, T, 10);
  const nNullCapUp = allErUpcoming(erAll, T, 'all').filter((r) => !finite(r.market_cap)).length;
  const nNullSess = erAll.filter((r) => r && r.report_date >= T && r.session !== 'BMO' && r.session !== 'AMC').length;
  const dayTag = (iso) => { const n = weekdaysBetween(T, iso); return iso === T ? ' <small>today</small>' : n === 1 ? ' <small>tomorrow</small>' : ''; };
  const erQuick = `<section class="panel" aria-label="All stocks reporting" data-sk-label="Reporting by day"><h2>All stocks reporting · next 10 sessions</h2><p class="sub">Every listed name from the earnings feed · cap chip filters the deep list too</p>${erDays.length ? `<div class="tw"><table class="t"><thead><tr><th class="l">Date</th><th>Before open</th><th>After close</th><th>Session n/a</th><th>Total</th><th class="l">Biggest names</th></tr></thead><tbody>${erDays.map((d) => `<tr><th>${esc(dayLbl(d.date))}${dayTag(d.date)}</th><td>${d.bmo}</td><td>${d.amc}</td><td>${d.na}</td><td>${d.total}</td><td class="l">${d.rows.filter((r) => finite(r.market_cap)).sort(capDesc).slice(0, 5).map((r) => esc(r.ticker)).join(' · ') || 'n/a'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">No upcoming reports in the earnings feed.</p>'}</section>`;
  const capBtn = (k, label) => `<button type="button" data-cap="${k}" aria-pressed="${capBucket === k}">${label}</button>`;
  const erDeep = `<section class="er-all" data-sk-label="All stocks"><div class="ctrl"><div class="seg" role="group" aria-label="Market cap filter">${capBtn('all', 'All caps')}${capBtn('under2b', 'Under $2B')}${capBtn('over2b', '$2B and up')}</div></div><p class="sub">Report times: BMO = before the open, AMC = after the close; 'session n/a' = the feed has no time (${nNullSess} rows). Sized chips exclude ${nNullCapUp} names with no market cap.</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th class="l">Report</th><th class="l">Session</th><th>Market cap</th><th class="opt">EPS est.</th><th>In board universe</th></tr></thead><tbody>${[...erRows].sort((a, b) => a.report_date.localeCompare(b.report_date) || capDesc(a, b) || String(a.ticker).localeCompare(String(b.ticker))).map((r) => `<tr><th class="l">${esc(r.ticker)}</th><td class="l">${esc(dayLbl(r.report_date))}</td><td class="l">${SESS_LBL[r.session] || 'session n/a'}</td><td>${fmtCap(r.market_cap)}</td><td class="opt">${fmtEps(r.eps_estimate)}</td><td>${boardSet.has(r.ticker) ? '✓' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="l">No upcoming reports in this cap range.</td></tr>'}</tbody></table></div></section>`;
  // P1 (Nov 13 2026): open = week grid (the MR lens), next US releases, rates + inflation odds; the rest folds into one Deep view.
  const sessions = nextSessions(T, 5);
  const preRows = firm.map((x) => ({ ticker: x.r.ticker, pre: x.m.pre, date: x.m.date, session: x.r.verified?.session || null, x: x.r.now?.stretch, pc: x.r.now?.stretch_pctile }));
  const week = weekModel({ sessions, allEr: erAll, spreads: Array.isArray(spreads) ? spreads : [], mrBy: mrBy || new Map(), preRows });
  const wk = week.reduce((a, d) => ({ n: a.n + d.total, bmo: a.bmo + d.bmo.length, amc: a.amc + d.amc.length, pre: a.pre + d.pre.length, ext: a.ext + [...d.bmo, ...d.amc, ...d.na].filter((i) => isExt(i.pc)).length }), { n: 0, bmo: 0, amc: 0, pre: 0, ext: 0 });
  const macro = macroNext(events, nowMs, 6);
  const oddsG = eventOddsQuick(odds, { max: 8 });
  const span = sessions.length ? `${dShort(sessions[0])} → ${dShort(sessions[sessions.length - 1])}` : '';
  const read = `<p class="read">Next ${sessions.length} sessions (${esc(span)}): <b>${wk.n} reports</b>, ${wk.bmo} before the open, ${wk.amc} after the close, ${wk.n - wk.bmo - wk.amc} with no time in the feed. ${wk.pre ? `${wk.pre} confirmed pre-ER ${wk.pre === 1 ? 'day falls' : 'days fall'} in the window. ` : ''}${wk.ext ? `${wk.ext} reporting ${wk.ext === 1 ? 'name sits' : 'names sit'} at a 2-yr stretch extreme (gold). ` : ''}${macro.length ? `Next US release: <b>${esc(macro[0].title)}</b>, ${esc(fmtMT12Date(macro[0].starts_at))}.` : ''}</p>`;
  const weekPanel = `<section class="panel cw-panel"><h2>Earnings · next ${sessions.length} sessions</h2><p class="sub">Every listed name from the earnings feed, biggest first, ${CELL_CAP} per slot · each name: market cap · options-implied move (when the options feed has it) · ×ATR from the 8EMA at the last close (MR MAP) · gold = that ×ATR at ≤5% or ≥95% of its own 2-yr history · click a name for its chart</p>${weekHtml(week, T, more)}</section>`;
  const nOdds = oddsG.reduce((a, g) => a + g.rows.length, 0);
  const sidePanels = `<div class="grid2"><section class="panel"><h2>Next US releases</h2><p class="sub">Official schedules (BLS, BEA, Federal Reserve) · times MT</p>${macroHtml(macro)}</section><section class="panel"><h2>Event odds · rates and inflation</h2><p class="sub">Fed decision, CPI and PCE contracts that traded in the last 24 hours, top ${nOdds}</p>${oddsHtml(oddsG, odds)}</section></div>`;
  const L = (typeof legacy === 'function' ? legacy() : legacy) || {};
  const sec = (label, html) => (html ? `<section class="panel" data-sk-label="${esc(label)}">${html}</section>` : '');
  const deepOpen = !!globalThis.__skDeepOpen?.has('calendar');
  return `<div class="sk" data-asof="${esc(data.bar_session || '')}" data-built="${esc(data.generated_at || '')}">${skHead}${read}${strip}${drillPanel}${weekPanel}${sidePanels}<details class="deep" data-sk-deep="calendar"${deepOpen ? ' open' : ''}><summary>Deep view <span>pre-ER setups · reporting by day · all stocks · past reports per name · every event-odds series · catalyst calendar · earnings evidence</span></summary><div class="body">${quick}${erQuick}${erDeep}${fullBlock}${sec('Event odds · all series', L.eventOdds)}${sec('Catalyst calendar', L.catalyst)}${sec('Earnings evidence', L.digest)}</div></details></div>`;
}

let cache = null; let openTicker = null; let drill = null; let capBucket = 'all'; const more = new Set();
// One shared promise per feed: app.js can mount twice while data arrives, and both mounts must see the same rows
// (the old `allEr = []` before the await let the second mount paint an empty earnings list).
const feeds = {};
const getJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${url.split('/').pop()} ${r.status}`); return r.json(); });
const soft = (key, url, pick) => (feeds[key] = feeds[key] || getJson(url).then(pick).catch((e) => { console.warn(`calendar: ${key} unavailable`, e?.message || e); return null; }));
export function mrIndex(doc) { const m = new Map(); for (const r of decodeMrMap(doc)) m.set(r.t, r); return m; }
export async function mountCalendarMr(host, { dataUrl = './data/calendar-mr.json', today, openChart = null, canChart = null, legacy = null } = {}) {
  if (!host) return;
  if (!document.getElementById('calendarWeekCss')) { const st = document.createElement('style'); st.id = 'calendarWeekCss'; st.textContent = CW_CSS; document.head.appendChild(st); }
  try {
    if (!cache) cache = await (feeds.mr = feeds.mr || getJson(dataUrl).catch((e) => { feeds.mr = null; throw e; }));
    const [tape, spreads, mrBy, odds] = await Promise.all([
      soft('tape', './data/breadth-tape.json', (j) => j?.calendar || null),
      soft('spreads', './data/spreads.json', (j) => (Array.isArray(j?.earnings) ? j.earnings : null)),
      soft('mrmap', './data/mrmap.json', mrIndex),
      soft('odds', './data/prediction-markets.json', (j) => j),
    ]);
    const allEr = Array.isArray(tape?.earnings_all) ? tape.earnings_all : [];
    const T = today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const paint = (focusSel) => { host.innerHTML = renderPreEr(cache, { today: T, openTicker, drill, canChart, allEr, spreads, mrBy, odds, events: tape?.events, legacy, more }); if (focusSel) host.querySelector(focusSel)?.focus({ preventScroll: true }); };
    paint();
    host.onclick = (ev) => {
      if (ev.target.closest('a')) return;
      const mb = ev.target.closest('[data-cw-more]'); if (mb) { const k = mb.dataset.cwMore; if (more.has(k)) more.delete(k); else more.add(k); paint(`[data-cw-more="${k}"]`); return; }
      const chip = ev.target.closest('[data-cap]'); if (chip) { capBucket = chip.dataset.cap; paint('[data-cap="' + capBucket + '"]'); return; }
      const go = ev.target.closest('[data-cm-chart]'); if (go) { if (typeof openChart === 'function') openChart(go.dataset.cmChart); return; }
      const tile = ev.target.closest('[data-sk-drill]'); if (tile) { const k = tile.dataset.skDrill; drill = drill === k ? null : k; paint(`[data-sk-drill="${k}"]`); return; }
      const tr = ev.target.closest('[data-cm-ticker]'); if (!tr) return; const t = tr.dataset.cmTicker; const inDrill = !!tr.closest('.drillp'); openTicker = openTicker === t ? null : t; paint(`${inDrill ? '.drillp ' : ''}[data-cm-ticker="${t}"]`);
    };
    host.onkeydown = (ev) => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const tr = ev.target.closest?.('[data-cm-ticker], [data-sk-drill], .cw-g li[data-ticker]'); if (tr && tr === ev.target) { ev.preventDefault(); tr.click(); } };
  } catch (error) {
    host.innerHTML = `<section class="breadth-panel"><div class="loading-card">Pre-earnings block unavailable: ${esc(error?.message || String(error))}</div></section>`;
  }
}
