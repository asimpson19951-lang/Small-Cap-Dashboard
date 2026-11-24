// Short-volume B2: pure exported render functions + optional browser self-wiring.
// Use #shortvolRoot inside #view-shortvol. The SECTORS strip is an explicit export,
// fetched/mounted by its host; this tab never fetches or renders that strip.
import { isTradingSession, previousTradingSession, tradingSessionGap, fmtMT12Date } from './market-calendar.mjs?v=V2.20.0';
import { hm12, candleSpark } from './mr-map.mjs?v=V2.20.0';

export const LABEL = 'off-exchange short-sale volume, not short interest';
export const FULL_HISTORY = 503;
export const MIN_PRIOR = 120;
export const THIN_SHARES = 50000;
export const REFRESH_MS = 10 * 60 * 1000;
export const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (v) => fin(v) ? v.toFixed(1) + '%' : 'n/a';
export const signed = (v, digits = 1, unit = '%') => !fin(v) ? 'n/a' : (Number(Math.abs(v).toFixed(digits)) === 0 ? '' : v > 0 ? '+' : '−') + Math.abs(v).toFixed(digits) + unit;
export const price = (v) => fin(v) ? '$' + v.toFixed(v < 1 ? 4 : 2) : 'n/a';
export function shares(v) {
  if (!fin(v)) return 'n/a';
  for (const [limit, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (v >= limit) return (v / limit).toFixed(2) + unit + ' sh';
  return Math.round(v) + ' sh';
}
export const tone = (v, mid = 0) => !fin(v) || !fin(mid) || v === mid ? 'sv-nt' : v > mid ? 'sv-up' : 'sv-dn';
export const isExtreme = (p) => fin(p) && (p <= 5 || p >= 95);
export const isThin = (r) => fin(r.total_vol) && r.total_vol < THIN_SHARES;
export const goldCells = (r) => r.fresh && !r.gold_off && isExtreme(r.snap?.pctl_2y_pct) && !isThin(r);
/** V2.18.1: FINRA session and NOW roster session must match, else the tab shows a STALE banner and gold is off. */
export const rosterStale = (meta) => !!meta && !!meta.roster_session && meta.roster_session !== meta.session;
export const renderStaleBanner = (meta) => rosterStale(meta) ? `<div class="sv-stalebn" role="status" data-shortvol-stale><b>STALE · gold fill off.</b> FINRA session ${esc(meta.session)} does not match the NOW roster session ${esc(meta.roster_session)}. Stretch, price and change columns are from ${esc(meta.roster_session)}; gold returns when the sessions match.</div>` : '';
const goldOff = (rows, off) => off ? rows.map((r) => ({ ...r, gold_off: true })) : rows;
export const stretch = (r) => ({ value: r.book === 'ML' && fin(r.p2) ? r.p2 : r.p1, window: r.book === 'ML' && fin(r.p2) ? '2-yr' : '1-yr' });
const median = (r) => r.band?.median_pct ?? null;
const tag = (text, type = '') => `<span class="sv-tag ${type}">${esc(text)}</span>`;
const thinTag = (r) => isThin(r) ? tag(`THIN · ${shares(r.total_vol)}`, 'sv-thin') : '';
const panelHead = (text, right = '') => `<div class="sv-ph"><span>${text}</span><span class="sv-right">${right}</span></div>`;
const count = (n, unit = 'names') => `${n} ${unit}`;

export function renderSessionCount(n) {
  return fin(n) && n < FULL_HISTORY ? `<span class="sv-ns">${n} sessions</span>` : '';
}
export function renderPbar(p) {
  if (!fin(p)) return '<span class="sv-na">n/a</span>';
  const left = Math.max(0, Math.min(100, p));
  return `<span class="sv-pbar"><s aria-hidden="true"><em></em><i class="${p >= 50 ? 'sv-u' : 'sv-d'}" style="left:${left}%"></i></s><b class="${tone(p, 50)}">${pct(p)}</b></span>`;
}
export function renderShortCells(r, { card = false, detail = false } = {}) {
  const s = r.snap, med = median(r), gold = goldCells(r) ? ' sv-gold' : '';
  const cell = card ? 'div' : 'td';
  const unavailable = !s ? `<div class="sv-sub sv-keep">no FINRA row for session; last ${esc(r.last_date || 'n/a')}</div>` : '';
  const ownMedian = fin(med) ? `own median ${pct(med)}` : 'no median yet';
  const ratio = `${card ? '<span class="sv-k">Short vol %</span>' : ''}<b class="${tone(s?.ratio_pct, med)}">${pct(s?.ratio_pct)}</b><div class="sv-sub">${ownMedian}</div>${thinTag(r)}${unavailable}`;
  const history = renderSessionCount(s?.n_sessions);
  const insufficient = s && !fin(s.pctl_2y_pct) && fin(s.n_sessions) && s.n_sessions < MIN_PRIOR ? `<span class="sv-ns">needs ${MIN_PRIOR} prior sessions</span>` : '';
  const tail = detail && fin(s?.pctl_2y_pct) ? `<div class="sv-sub">${s.pctl_2y_pct >= 95 ? 'at/above 95%' : 'at/below 5%'}</div>` : '';
  const pctl = `${card ? '<span class="sv-k">2-yr pctl</span>' : ''}${renderPbar(s?.pctl_2y_pct)}${history}${insufficient}${tail}`;
  return `<${cell} class="sv-new sv-first${gold}" data-shortvol-cell="ratio">${ratio}</${cell}><${cell} class="sv-new${gold}" data-shortvol-cell="percentile">${pctl}</${cell}>`;
}

/** Nov 13 2026 UX: the 20-session ratio history is BARS, never a line. Bar height = that day's short vol % from a 0% base;
 *  green / red = at or above / below the name's own median; grey band = own prior 5%–95%; dashed = own median. */
const barTone = (v, med) => !fin(med) ? '#e0e5e7' : v >= med ? '#51c083' : '#e17272';
export function ratioBars(rows, band, med, { x0 = 0, w, top = 0, h }) {
  const valid = (rows || []).filter((p) => fin(p.ratio_pct));
  if (!valid.length) return { body: '', y: () => top + h, hi: 0 };
  const hi = Math.max(...valid.map((p) => p.ratio_pct), ...(band && fin(band.high_pct) ? [band.high_pct] : [])) * 1.06 || 1;
  const n = rows.length, slot = w / n, bw = Math.max(1, slot * 0.68), f = (v) => v.toFixed(1);
  const y = (v) => top + (hi - v) * h / hi;
  let body = band && fin(band.low_pct) && fin(band.high_pct) ? `<rect x="${f(x0)}" y="${f(y(band.high_pct))}" width="${f(w)}" height="${f(y(band.low_pct) - y(band.high_pct))}" fill="#262b30"/>` : '';
  rows.forEach((p, i) => {
    if (!fin(p.ratio_pct)) return;
    body += `<rect x="${f(x0 + (i + 0.5) * slot - bw / 2)}" y="${f(y(p.ratio_pct))}" width="${f(bw)}" height="${f(Math.max(0.8, y(0) - y(p.ratio_pct)))}" fill="${barTone(p.ratio_pct, med)}"/>`;
  });
  if (fin(med)) body += `<line x1="${f(x0)}" x2="${f(x0 + w)}" y1="${f(y(med))}" y2="${f(y(med))}" stroke="#e0e5e7" stroke-dasharray="2 3"/>`;
  return { body, y, hi };
}
export function renderSpark(r, width = 196, height = 44) {
  const rows = r.spark || [];
  if (!rows.some((p) => fin(p.ratio_pct))) return '<span class="sv-na">no ratio history</span>';
  const med = median(r), plotW = width - 46, bars = ratioBars(rows, r.band, med, { x0: 2, w: plotW, top: 2, h: height - 4 });
  const last = rows.at(-1);
  const tail = fin(last?.ratio_pct) ? `<text x="${width - 40}" y="${Math.min(height - 3, Math.max(11, bars.y(last.ratio_pct) + 4)).toFixed(1)}" class="sv-sl" fill="${barTone(last.ratio_pct, med)}">${pct(last.ratio_pct)}</text>` : '';
  return `<svg class="sv-spk" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(r.t)} short-volume ratio bars over ${rows.length} sessions; ${esc(rows[0]?.date)} to ${esc(rows.at(-1)?.date)}"><rect width="${width}" height="${height}" fill="#000"/>${bars.body}${tail}</svg>`;
}

/** Daily bar -> its ET session date ('YYYY-MM-DD'). Daily bars are stamped midnight ET of the session. */
const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function etDay(t) {
  const d = new Date(typeof t === 'string' && /^\d+$/.test(t) ? Number(t) : t);
  return Number.isFinite(d.getTime()) ? ET_DAY.format(d) : null;
}
/** Keep only the spark days that have BOTH a finite ratio and a daily OHLC bar, so price candles and ratio bars share one x slot. */
export function alignDaily(spark, bars) {
  const byDay = new Map();
  for (const b of bars || []) { const k = b && etDay(b.t); if (k && fin(Number(b.o)) && fin(Number(b.c))) byDay.set(k, b); }
  const days = [], rows = spark || [];
  for (const p of rows) { const b = byDay.get(p.date); if (b && fin(p.ratio_pct)) days.push({ date: p.date, bar: b, ratio_pct: p.ratio_pct }); }
  return { days, dropped: rows.length - days.length };
}
const shortDay = (iso) => dayLabel(iso).replace(/^\w{3} /, '');
const money = (v) => fin(v) ? '$' + v.toFixed(v < 1 ? 4 : 2) : 'n/a';
/** Selected-name visual: daily candles (hollow green up / solid red down) over the short vol % bars, one shared date axis. */
export function renderNameChart(r, bars, { w = 560, state = 'ok' } = {}) {
  if (!r) return '<p class="note">No NOW name selected.</p>';
  const med = median(r), spark = r.spark || [];
  const R = 66, plotW = w - R, priceH = 150, gap = 22, ratioTop = priceH + gap, ratioH = 64, H = ratioTop + ratioH + 18, f = (v) => v.toFixed(1);
  const A = state === 'ok' ? alignDaily(spark, bars) : { days: [], dropped: spark.length };
  const withPrice = A.days.length >= 2;
  const rows = withPrice ? A.days : spark;
  if (!rows.some((p) => fin(p.ratio_pct))) return `<p class="note">${esc(r.t)}: no short-volume history to draw.</p>`;
  let svg = `<svg class="sv-nc" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(r.t)} daily candles over short volume % bars, ${rows.length} sessions"><rect width="${w}" height="${H}" fill="#000"/>`;
  if (withPrice) {
    const C = candleSpark(A.days.map((d) => ({ o: Number(d.bar.o), h: Number(d.bar.h), l: Number(d.bar.l), c: Number(d.bar.c) })), { w: plotW, h: priceH, padTop: 8, padBot: 6 });
    const hiP = Math.max(...A.days.map((d) => Number(d.bar.h ?? d.bar.c))), loP = Math.min(...A.days.map((d) => Number(d.bar.l ?? d.bar.c)));
    const first = Number(A.days[0].bar.c), last = Number(A.days.at(-1).bar.c), chg = first ? (last / first - 1) * 100 : null;
    svg += C.body;
    svg += `<text x="${plotW + 6}" y="${f(C.y(hiP) + 4)}" class="sv-ax">${money(hiP)}</text><text x="${plotW + 6}" y="${f(C.y(loP) + 4)}" class="sv-ax">${money(loP)}</text>`;
    svg += `<text x="${plotW + 6}" y="${f(Math.min(priceH - 14, Math.max(26, C.y(last) + 4)))}" class="sv-pl">${money(last)}</text><text x="${plotW + 6}" y="${f(Math.min(priceH, Math.max(40, C.y(last) + 18)))}" class="sv-ax">${signed(chg)}</text>`;
  }
  const B = ratioBars(rows, r.band, med, { x0: 0, w: plotW, top: ratioTop, h: ratioH });
  svg += B.body + `<text x="${plotW + 6}" y="${f(ratioTop + 9)}" class="sv-ax">${pct(B.hi)}</text><text x="${plotW + 6}" y="${f(ratioTop + ratioH)}" class="sv-ax">0%</text>`;
  if (fin(med)) svg += `<text x="${plotW + 6}" y="${f(B.y(med) + 4)}" class="sv-ax">med ${pct(med)}</text>`;
  const n = rows.length, slot = plotW / n, ticks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  for (const i of ticks) svg += `<text x="${f(Math.min(plotW - 24, Math.max(24, (i + 0.5) * slot)))}" y="${H - 4}" text-anchor="middle" class="sv-ax">${esc(shortDay(rows[i].date))}</text>`;
  svg += `<text x="0" y="${ratioTop - 6}" class="sv-axl">Short vol % · FINRA off-exchange</text></svg>`;
  const note = state === 'loading' ? 'Loading daily bars…' : state === 'none' ? 'Daily bars did not load; short-volume bars only.' : !withPrice ? 'No daily bars line up with the short-volume dates; short-volume bars only.' : A.dropped ? `${A.dropped} of ${spark.length} sessions left out (no daily bar or no ratio that day).` : `${n} sessions, ${esc(shortDay(rows[0].date))} to ${esc(shortDay(rows[n - 1].date))}.`;
  return `${svg}<p class="note">${note} Bars: green / red = at or above / below own median ${pct(med)} · grey band = own 5%–95% (${r.band ? `${pct(r.band.low_pct)} to ${pct(r.band.high_pct)}` : 'no band yet'}). Display only, untested.</p>`;
}
export function renderNameChartPanel(M, sel, bars, state) {
  const r = M.now.find((x) => x.t === sel) || M.now[0];
  if (!r) return '';
  return `<section class="panel" id="svChartPanel"><h2>${esc(r.t)} · daily candles over short vol %</h2><p class="sub">Last ${(r.spark || []).length} FINRA sessions · click a NOW row to switch name</p><div id="svChartHost">${renderNameChart(r, bars, { state })}</div></section>`;
}

/** FINRA file is expected by 4:00 PM MT, including DST and non-session days. */
export function fileFreshness(session, now = Date.now()) {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) return { expected: null, gap: null };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const open = isTradingSession(today);
  const expected = open == null ? null : previousTradingSession(today, open === false || Number(parts.hour) * 60 + Number(parts.minute) >= 16 * 60);
  return { expected, gap: expected ? tradingSessionGap(session, expected) : null };
}

export function buildModel(data) {
  if (data?.schema !== 'shortvol/1' || !data.meta?.session || !Array.isArray(data.now) || !Array.isArray(data.universe)) throw new Error('Unsupported or incomplete short-volume data');
  const now = data.now.slice().sort((a, b) => Number(a.stale) - Number(b.stale) || (fin(stretch(b).value) ? Math.abs(stretch(b).value - 50) : -1) - (fin(stretch(a).value) ? Math.abs(stretch(a).value - 50) : -1));
  const extremes = data.universe.filter((r) => r.fresh && isExtreme(r.snap?.pctl_2y_pct)).sort((a, b) => b.snap.pctl_2y_pct - a.snap.pctl_2y_pct || a.t.localeCompare(b.t));
  const points = now.filter((r) => r.fresh && !r.stale && fin(stretch(r).value) && fin(r.snap?.pctl_2y_pct));
  const corners = points.filter((r) => isExtreme(stretch(r).value) && isExtreme(r.snap.pctl_2y_pct));
  const distance = (r) => Math.max(Math.min(Math.abs(stretch(r).value - 97.5), Math.abs(stretch(r).value - 2.5)), Math.min(Math.abs(r.snap.pctl_2y_pct - 97.5), Math.abs(r.snap.pctl_2y_pct - 2.5)));
  const near = points.slice().sort((a, b) => distance(a) - distance(b)).slice(0, 3);
  const off = rosterStale(data.meta);
  return { ...data, now: goldOff(now, off), universe: goldOff(data.universe, off), extremes: goldOff(extremes, off), points: goldOff(points, off), corners, near, rosterStale: off };
}

// ---------- board skin v2 (Oct 19 2026): display helpers only; every number comes from buildModel unchanged ----------
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-09' -> 'Fri Oct 9' (display only). */
export function dayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || 'n/a');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** '2026-10-11 13:42 MT' -> '1:42 PM MT Sun Oct 11' (display only). */
export function mtLabel(s) {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/.exec(String(s || ''));
  return m ? `${hm12(+m[2].slice(0, 2), +m[2].slice(3))} MT ${dayLabel(m[1])}` : esc(s || 'n/a');
}
const pcCell = (p, ext = false) => fin(p) ? `<span class="pc${ext ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${pct(p)}</b></span>` : '<span class="t2">n/a</span>';
const upDn = (v, mid = 0) => !fin(v) || !fin(mid) || v === mid ? '' : v > mid ? 'up' : 'dn';
const dbCell = (v, clamp, text) => fin(v) ? `<span class="db ${upDn(v)}"><span class="${upDn(v)}">${text}</span><i style="width:${(Math.min(1, Math.abs(v) / clamp) * 100).toFixed(0)}%"></i></span>` : '<span class="t2">n/a</span>';
const bookChip = (r) => r.kind === 'NOW' ? `<span class="chip">${esc(r.book)}</span>` : `<span class="chip">${r.kind === 'IDX' ? 'Index' : 'Sector ETF'}</span>`;
const thinChip = (r) => isThin(r) ? `<span class="chip">Thin · ${shares(r.total_vol)}</span>` : '';
const statusText = (r) => r.stale ? `Poller stale · ${esc(dayLabel(r.upd_day))}` : r.status ? esc(r.status.charAt(0) + r.status.slice(1).toLowerCase()) : '';
/** Ratio cell: coloured vs own median, own median as the small second line. */
const ratioCell = (r) => {
  const s = r.snap, med = median(r);
  if (!s) return `<span class="t2">n/a</span><small>no FINRA row; last ${esc(dayLabel(r.last_date))}</small>`;
  return `<span class="${upDn(s.ratio_pct, med)}">${pct(s.ratio_pct)}</span><small>${fin(med) ? `own median ${pct(med)}` : 'no median yet'}</small>`;
};
const svPctlCell = (r) => {
  const s = r.snap;
  if (!s) return '<span class="t2">n/a</span>';
  if (!fin(s.pctl_2y_pct)) return `<span class="t2">n/a</span>${fin(s.n_sessions) && s.n_sessions < MIN_PRIOR ? `<small>needs ${MIN_PRIOR} prior sess.</small>` : ''}`;
  return `${pcCell(s.pctl_2y_pct, goldCells(r))}${fin(s.n_sessions) && s.n_sessions < FULL_HISTORY ? `<small>${s.n_sessions} sess.</small>` : ''}`;
};
const ext2 = (r) => goldCells(r) ? ' class="extc"' : '';

export function renderHead(M) {
  const m = M.meta;
  return `<div class="head"><h1>Short vol</h1><span class="meta">FINRA session ${esc(dayLabel(m.session))} · file built ${m.source_generated_utc && fmtMT12Date(m.source_generated_utc) !== 'n/a' ? esc(fmtMT12Date(m.source_generated_utc)) : mtLabel(m.source_built_mt)} · NOW roster ${esc(dayLabel(m.roster_session))}, built ${mtLabel(m.roster_built_mt)} · ${LABEL}</span></div>`;
}
/** '1 NOW name (SGLY) is …' / '2 NOW names (A, B) are …' / 'No NOW name is …'. */
export function bothSentence(corners) {
  const n = (corners || []).length;
  if (!n) return 'No NOW name is at an extreme on both stretch and short volume.';
  return `${n} NOW ${n === 1 ? 'name' : 'names'} (${corners.map((r) => `<b>${esc(r.t)}</b>`).join(', ')}) ${n === 1 ? 'is' : 'are'} at an extreme on both stretch and short volume.`;
}
export function renderRead(M, now = Date.now()) {
  const f = fileFreshness(M.meta.session, now);
  const hi = M.extremes.filter((r) => r.snap.pctl_2y_pct >= 95), lo = M.extremes.filter((r) => r.snap.pctl_2y_pct <= 5);
  const list = (rows) => rows.map((r) => `<b>${esc(r.t)}</b> (${pct(r.snap.pctl_2y_pct)})`).join(', ');
  const chance = (M.universe.length * 0.1).toFixed(1);
  const behind = fin(f.gap) && f.gap > 0 ? ` <span class="t2">Data: FINRA session ${esc(dayLabel(M.meta.session))} is ${f.gap} sessions behind the expected ${esc(dayLabel(f.expected))} file.</span>` : '';
  const xs = M.extremes.length
    ? `${M.extremes.length} of ${M.universe.length} names sit at an own 2-yr short-volume extreme${hi.length ? `, high: ${list(hi)}` : ''}${lo.length ? `${hi.length ? ';' : ','} low: ${list(lo)}` : ''}. About ${chance} names land there by chance alone.`
    : `No name of ${M.universe.length} sits at an own 2-yr short-volume extreme (about ${chance} would by chance).`;
  const both = ' ' + bothSentence(M.corners);
  return `<p class="read">${xs}${both}${behind}</p>`;
}
// V2.19.5 drill-down (Austin Oct 20: click a count tile -> its names open in place; click the tile again to close).
let drill = null;
const svDt = (k) => ` drill${drill === k ? ' open' : ''}" data-sk-drill="${k}" tabindex="0" role="button" aria-expanded="${drill === k}"`;
const svDrills = (M) => ({
  ext: { title: `${M.extremes.length} ${M.extremes.length === 1 ? 'name' : 'names'} at a 2-yr short-volume extreme`, sub: `Own 2-yr pctl ≥ 95% or ≤ 5% · all ${M.universe.length} names incl. sector ETFs and indexes · highest first`, list: M.extremes, kind: 'ext' },
  hilo: { title: `${M.extremes.filter((r) => r.snap.pctl_2y_pct >= 95).length} high (≥ 95%) and ${M.extremes.filter((r) => r.snap.pctl_2y_pct <= 5).length} low (≤ 5%) short-volume names`, sub: 'Same names as the 2-yr extreme tile · high first, then low', list: M.extremes, kind: 'ext' },
  both: { title: `${M.corners.length} NOW ${M.corners.length === 1 ? 'name' : 'names'} at an extreme on both stretch and short volume`, sub: 'Stretch pctl and short-vol pctl both ≥ 95% or ≤ 5% · most stretched first', list: M.corners, kind: 'now' },
  now: { title: `All ${M.now.length} NOW names`, sub: 'Most stretched first · stretch beside short volume', list: M.now, kind: 'now' },
});
const svExtRow = (r) => `<tr${goldCells(r) ? ' class="ext"' : ''}><th>${esc(r.t)}${bookChip(r)}${thinChip(r)}<small>${r.kind === 'NOW' ? statusText(r) : esc(r.label)}</small></th><td>${ratioCell(r)}</td><td>${pcCell(r.snap.pctl_2y_pct, goldCells(r))}</td><td class="opt">${shares(r.short_vol)}<small>of ${shares(r.total_vol)}</small></td></tr>`;
const svNowRow = (r) => { const st = stretch(r); return `<tr><th>${esc(r.t)}${bookChip(r)}${thinChip(r)}<small>${statusText(r)}</small></th><td class="${upDn(r.chg)}">${signed(r.chg)}</td><td class="opt">${dbCell(r.x8, 4, signed(r.x8, 2, '×'))}</td><td>${pcCell(st.value)}<small>${st.window}</small></td><td${ext2(r)}>${ratioCell(r)}</td><td${ext2(r)}>${svPctlCell(r)}</td></tr>`; };
export function renderDrill(M) {
  const D = drill && svDrills(M)[drill];
  if (!D || !D.list.length) return '';
  const head = D.kind === 'ext'
    ? `<tr><th class="l">Name</th><th>Short vol %</th><th>2-yr pctl<small>own prior sessions</small></th><th class="opt">Short / total<small>off-exchange sh</small></th></tr>`
    : `<tr><th class="l">Name</th><th>Chg %</th><th class="opt">8EMA<small>× ATR</small></th><th>Stretch pctl<small>SC 1-yr · ML 2-yr</small></th><th>Short vol %<small>FINRA ${esc(dayLabel(M.meta.session))}</small></th><th>Short-vol pctl<small>own 2-yr</small></th></tr>`;
  return `<section class="panel drillp" aria-label="${esc(D.title)}"><h2>${esc(D.title)}</h2><p class="sub">${esc(D.sub)} · click the tile again to close</p><div class="tw"><table class="t"><thead>${head}</thead><tbody>${D.list.map(D.kind === 'ext' ? svExtRow : svNowRow).join('')}</tbody></table></div></section>`;
}
export function renderStrip(M, now = Date.now()) {
  const f = fileFreshness(M.meta.session, now);
  const hi = M.extremes.filter((r) => r.snap.pctl_2y_pct >= 95).length, lo = M.extremes.filter((r) => r.snap.pctl_2y_pct <= 5).length;
  const near = M.near.map((r) => esc(r.t)).join(', ') || 'none';
  const D = svDrills(M);
  const tile = (k, v, s, cls = '', dk = '') => `<div class="tile${cls}${dk && D[dk].list.length ? svDt(dk) : '"'}><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `<div class="strip">${[
    tile('At a 2-yr extreme', `${M.extremes.length} <small>of ${M.universe.length} names</small>`, `≈ ${(M.universe.length * 0.1).toFixed(1)} names expected by chance`, M.extremes.some(goldCells) ? ' ext' : '', 'ext'),
    tile('High ≥ 95% · low ≤ 5%', `${hi} <small>high</small> ${lo} <small>low</small>`, `${M.universe.filter(isThin).length} thin names never take gold`, '', 'hilo'),
    tile('Both extremes', `${M.corners.length} <small>names</small>`, `closest: ${near} · descriptive, untested`, ' mr', 'both'),
    tile('NOW names', `${M.now.length} <small>names</small>`, `${M.now.filter((r) => r.book === 'SC').length} SC · ${M.now.filter((r) => r.book === 'ML').length} ML · ${M.now.filter((r) => r.stale).length} poller stale`, '', 'now'),
    tile('FINRA file', esc(dayLabel(M.meta.session)), f.gap === 0 ? 'latest expected file · posted by 4:00 PM MT' : fin(f.gap) ? `${f.gap} sessions behind ${esc(dayLabel(f.expected))}` : 'freshness unverified'),
  ].join('')}</div>`;
}
const QUICK_ROWS = 14;
export function renderQuickNow(M, sel = null) {
  const rows = M.now.slice(0, QUICK_ROWS), cur = sel || M.now[0]?.t;
  const body = rows.map((r) => {
    const st = stretch(r);
    return `<tr class="click${r.t === cur ? ' sel' : ''}" data-sv-sel="${esc(r.t)}" tabindex="0" aria-label="Show ${esc(r.t)} chart"><th>${esc(r.t)}${bookChip(r)}${thinChip(r)}<small>${statusText(r)}</small></th><td class="${upDn(r.chg)}">${signed(r.chg)}</td><td class="opt">${dbCell(r.x8, 4, signed(r.x8, 2, '×'))}</td><td>${pcCell(st.value)}<small>${st.window}</small></td><td${ext2(r)}>${ratioCell(r)}</td><td${ext2(r)}>${svPctlCell(r)}</td></tr>`;
  }).join('');
  return `<section class="panel"><h2>NOW names · stretch beside short volume</h2><p class="sub">Most stretched first · ${rows.length} of ${M.now.length} · ranked on the ${esc(dayLabel(M.meta.roster_session))} RTH close · short vol % green / red = above / below own median · gold = short volume at an own 2-yr extreme (not thin) · click a row for its chart</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Chg %</th><th class="opt">8EMA<small>× ATR</small></th><th>Stretch pctl<small>SC 1-yr · ML 2-yr</small></th><th>Short vol %<small>FINRA ${esc(dayLabel(M.meta.session))}</small></th><th>Short-vol pctl<small>own 2-yr</small></th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
export function renderQuickExtremes(M) {
  const rows = M.extremes.slice(0, QUICK_ROWS);
  const body = rows.map((r) => `<tr${goldCells(r) ? ' class="ext"' : ''}><th>${esc(r.t)}${bookChip(r)}${thinChip(r)}<small>${r.kind === 'NOW' ? statusText(r) : esc(r.label)}</small></th><td>${ratioCell(r)}</td><td>${pcCell(r.snap.pctl_2y_pct, goldCells(r))}</td><td class="opt">${shares(r.short_vol)}<small>of ${shares(r.total_vol)}</small></td></tr>`).join('');
  return `<section class="panel"><h2>Short-volume extremes</h2><p class="sub">Own 2-yr pctl ≥ 95% or ≤ 5% · all ${M.universe.length} names incl. sector ETFs and indexes · ${rows.length} of ${M.extremes.length}</p>${rows.length ? `<div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Short vol %</th><th>2-yr pctl<small>own prior sessions</small></th><th class="opt">Short / total<small>off-exchange sh</small></th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="note">No name at an own-history extreme.</p>'}<p class="note">Short-sale volume share of off-exchange trades, not short interest. Display only: no backtest links it to next-day moves.</p></section>`;
}

// ---------- Deep view: everything that existed before, restyled to the kit ----------
export function renderFresh(M, now = Date.now()) {
  const m = M.meta, f = fileFreshness(m.session, now);
  const state = f.gap === 0 ? 'latest expected file' : fin(f.gap) ? `${f.gap} sessions behind expected ${esc(dayLabel(f.expected))}` : 'freshness unverified';
  return `<ul class="ctx" data-sk-label="Freshness"><li><b>FINRA file · session ${esc(dayLabel(m.session))}</b> <span>posted by 4:00 PM MT · source built ${mtLabel(m.source_built_mt)} · ${state}</span></li><li><b>Window · ${m.source_sessions} source sessions</b> <span>${esc(dayLabel(m.first_session))} → ${esc(dayLabel(m.session))} · up to 504 prior sessions</span></li><li><b>Set · ${count(M.universe.length)}</b> <span>${count(M.now.length, 'NOW names')} · sector ETFs + indexes included in the extremes universe</span></li><li><b>Untested · display only</b> <span>no backtest links this to next-day moves</span></li><li><b>NOW roster · session ${esc(dayLabel(m.roster_session))}</b> <span>built ${mtLabel(m.roster_built_mt)}</span></li></ul>`;
}

export function renderDefinition() {
  return `<p class="note" data-sk-label="What it measures"><b>What this is: ${LABEL}.</b> FINRA ShortVolume ÷ TotalVolume includes market-maker hedging and routine short sales; it does not measure open short positions. Both share counts cover <b>off-exchange (FINRA TRF / ADF / ORF) regular-hours trades only; exchange volume not included</b>. Facility consolidation does not mean the whole market. <b>Thin</b> = under 50,000 sh off-exchange that day; thin names never get gold fill. FINRA files are posted by 4:00 PM MT.</p>`;
}

function kindLabel(r) {
  return r.kind === 'NOW' ? `${esc(r.book)} NOW · ${statusText(r)}` : `${r.kind === 'IDX' ? 'Index' : 'Sector ETF'} · ${esc(r.label)}`;
}
const bandText = (r) => r.band ? `own 5%–95% band ${pct(r.band.low_pct)} → ${pct(r.band.high_pct)}` : 'no band yet';
const meanCell = (r) => `<span class="${upDn(r.snap?.ratio_20d_pct, median(r))}">${pct(r.snap?.ratio_20d_pct)}</span><small>20-session mean pctl ${pct(r.snap?.pctl_20d_pct)}</small>`;
function renderExtremeRow(r) {
  const st = stretch(r);
  return `<tr${goldCells(r) ? ' class="ext"' : ''}><th>${esc(r.t)}${thinChip(r)}<small>${kindLabel(r)}</small></th><td>${ratioCell(r)}</td><td>${svPctlCell(r)}<small>${r.snap.pctl_2y_pct >= 95 ? 'at/above 95%' : 'at/below 5%'}</small></td><td class="opt">${shares(r.short_vol)}<small>of ${shares(r.total_vol)} off-exchange</small></td><td class="opt">${meanCell(r)}</td><td class="opt">${renderSpark(r)}<small>${bandText(r)}</small></td><td>${r.kind === 'NOW' ? `${pcCell(st.value)}<small>${st.window} · chg ${signed(r.chg)}${r.stale ? ' · poller stale' : ''}</small>` : '<span class="t2">not on NOW</span>'}</td></tr>`;
}
export function renderExtremes(M) {
  const rows = M.extremes;
  const info = `${count(rows.length)} of ${count(M.universe.length)} at ≥ 95% or ≤ 5% own pctl · ≈ ${(M.universe.length * 0.1).toFixed(1)} names expected by chance (10% of ${count(M.universe.length)}) · ${count(rows.filter((r) => r.snap.pctl_2y_pct >= 95).length, 'high names')} · ${count(rows.filter((r) => r.snap.pctl_2y_pct <= 5).length, 'low names')} · ${count(rows.filter(isThin).length, 'thin names')}`;
  return `<section class="panel sec" data-sk-label="Extremes table"><h2>Short-sale volume extremes · full table</h2><p class="sub">${info}</p>${rows.length ? `<div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Short vol %<small>${esc(dayLabel(M.meta.session))}</small></th><th>2-yr pctl<small>own prior sessions</small></th><th class="opt">Short / total<small>FINRA-reported (off-exchange) sh</small></th><th class="opt">20-session mean<small>of the ratio</small></th><th class="opt">Last 20 sessions<small>ratio % · grey = own 5%–95% band</small></th><th>8EMA stretch<small>NOW pctl</small></th></tr></thead><tbody>${rows.map(renderExtremeRow).join('')}</tbody></table></div>` : '<p class="note">No names at an own-history extreme.</p>'}<p class="note">Bars = each session's short vol % from a 0% base, green / red = at or above / below own median; grey band = own prior-history 5%–95% of ratio; dashed line = own median. Gold = short volume at an extreme, except thin names.</p></section>`;
}

export function renderNowRow(r) {
  const st = stretch(r);
  const tags = `${r.mover ? '<span class="chip">Mover</span>' : ''}${r.stale ? `<span class="chip">Poller stale · ${esc(dayLabel(r.upd_day))}</span>` : ''}${thinChip(r)}`;
  return `<tr><th>${esc(r.t)}${tags}<small>${r.status ? esc(r.status.charAt(0) + r.status.slice(1).toLowerCase()) : ''}</small></th><td class="opt">${price(r.p)}</td><td class="opt ${upDn(r.chg)}">${signed(r.chg)}</td><td class="opt">${dbCell(r.x8, 4, signed(r.x8, 2, '×'))}</td><td>${pcCell(st.value)}${r.book === 'ML' && st.window === '1-yr' ? '<small>1-yr fallback</small>' : ''}</td><td${ext2(r)}>${ratioCell(r)}</td><td${ext2(r)}>${svPctlCell(r)}</td></tr>`;
}
export function renderNow(M, book) {
  const rows = M.now.filter((r) => r.book === book);
  return `<section class="panel"><h2>${book === 'SC' ? 'Small cap' : 'Mid / large'} <span class="chip">${book}</span> · ${M.rosterStale ? 'roster ' + esc(dayLabel(M.meta.roster_session)) : 'in play'}</h2><p class="sub">${count(rows.length)} · ranked on the ${esc(dayLabel(M.meta.roster_session))} RTH close</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th class="opt">RTH close</th><th class="opt">Chg %</th><th class="opt">8EMA<small>× ATR</small></th><th>${book === 'SC' ? '1-yr' : '2-yr'} stretch</th><th>Short vol %<small>FINRA · ${esc(dayLabel(M.meta.session))}</small></th><th>2-yr pctl<small>own prior history</small></th></tr></thead><tbody>${rows.map(renderNowRow).join('')}</tbody></table></div></section>`;
}
export function renderScatter(M) {
  const W = 560, H = 380, L = 50, T = 12, pw = 494, ph = 328;
  const x = (v) => L + v / 100 * pw, y = (v) => T + (100 - v) / 100 * ph, f = (v) => v.toFixed(1);
  let svg = `<svg class="sv-sc" viewBox="0 0 ${W} ${H}" role="img" aria-label="NOW stretch percentile versus short-volume percentile; ${M.points.length} names"><rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="#000" stroke="#353a40"/>`;
  for (const a of [0, 95]) for (const b of [0, 95]) svg += `<rect x="${f(x(a))}" y="${f(y(b + 5))}" width="${f(pw * 0.05)}" height="${f(ph * 0.05)}" fill="#262b30" stroke="#59636a"/>`;
  for (const v of [5, 95]) svg += `<line x1="${f(x(v))}" x2="${f(x(v))}" y1="${T}" y2="${T + ph}" stroke="#4a5158" stroke-dasharray="3 3"/><line x1="${L}" x2="${L + pw}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="#4a5158" stroke-dasharray="3 3"/>`;
  for (const v of [0, 25, 50, 75, 100]) svg += `<text x="${f(x(v))}" y="${T + ph + 15}" text-anchor="middle" class="sv-ax">${v}%</text><text x="${L - 6}" y="${f(y(v) + 4)}" text-anchor="end" class="sv-ax">${v}%</text>`;
  svg += `<text x="${L + pw / 2}" y="${H - 5}" text-anchor="middle" class="sv-axl">8EMA stretch pctl (SC 1-yr · ML 2-yr / 1-yr fallback) →</text><text transform="translate(13 ${T + ph / 2}) rotate(-90)" text-anchor="middle" class="sv-axl">short-sale vol 2-yr pctl →</text>`;
  const labels = { left: [], right: [] };
  for (const r of M.points) {
    const p = stretch(r).value, q = r.snap.pctl_2y_pct, cx = x(p), cy = y(q);
    const title = `<title>${esc(r.t)} · stretch ${pct(p)} · short-volume pctl ${pct(q)}${isThin(r) ? ' · THIN' : ''}</title>`;
    svg += r.book === 'SC' ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="4" fill="none" stroke="#e0e5e7" stroke-width="1.5">${title}</circle>` : `<rect x="${f(cx - 3.5)}" y="${f(cy - 3.5)}" width="7" height="7" fill="#e0e5e7">${title}</rect>`;
    if (q >= 85 || q <= 15 || isExtreme(p)) labels[p > 80 ? 'left' : 'right'].push({ yy: cy + 4, xx: cx, t: r.t });
  }
  for (const [side, arr] of Object.entries(labels)) {
    arr.sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < arr.length; i++) arr[i].yy = Math.max(arr[i].yy, arr[i - 1].yy + 12);
    for (let i = arr.length - 1; i >= 0; i--) arr[i].yy = Math.min(arr[i].yy, T + ph - 4 - (arr.length - 1 - i) * 12);
    for (const p of arr) svg += `<text x="${f(p.xx + (side === 'left' ? -8 : 8))}" y="${f(p.yy)}" text-anchor="${side === 'left' ? 'end' : 'start'}" class="sv-pl">${esc(p.t)}</text>`;
  }
  const stale = M.now.filter((r) => r.stale).map((r) => r.t).join(', ') || 'none';
  const missing = M.now.length - M.points.length - M.now.filter((r) => r.stale).length;
  const near = M.near.map((r) => `<b>${esc(r.t)}</b> <span>(${esc(r.book)}): stretch pctl ${pct(stretch(r).value)} · short-vol pctl ${pct(r.snap.pctl_2y_pct)}</span>`).join('<br>') || 'none';
  return `<section class="panel sec sv-mr" data-sk-label="MR scatter"><h2>MR view · stretch × short-sale volume</h2><p class="sub">${count(M.points.length, 'NOW names')} · poller-stale ${esc(stale)} left out · ${count(missing, 'names without both pctls')} · descriptive, not an edge claim</p><div class="grid2 xgrid"><div>${svg}</svg></div><ul class="ctx"><li>Grey corners = both at an own-history extreme (≤5% or ≥95% on each axis). <b>Today: ${count(M.corners.length)} (${esc(M.corners.map((r) => r.t).join(', ') || 'none')}).</b></li><li>Closest to a corner:<br>${near}</li><li>Raw percentiles only. Untested: nothing here says the move reverts. ○ small cap · ■ mid / large.</li></ul></div></section>`;
}

export function renderFoot(M) {
  const thin = M.universe.filter(isThin).map((r) => `${esc(r.t)} ${shares(r.total_vol)}`).join(', ') || 'none';
  return `<p class="note" data-sk-label="Definitions"><b>How to read.</b> Short vol % = FINRA ShortVolume ÷ TotalVolume for the session. 2-yr pctl = mid-rank vs up to 504 prior sessions (strictly earlier ticker rows), valid values only; today and future excluded; n/a under 120 prior valid sessions. Missing ticker days are not filled. History counts show below 503 sessions. 20-session mean includes today; its percentile uses only earlier means (overlapping windows are autocorrelated). Band/median use only prior ratios. Green/red ratio text means above/below own median; percentile bars use the 50% midpoint; neither means good/bad. Gold marks only the short-volume cells (the whole row in the extremes tables) when own pctl ≤ 5% or ≥ 95% and not thin. About 10% of names occupy the two tails by chance alone (≈ ${(M.universe.length * 0.1).toFixed(1)} names of ${count(M.universe.length)}); this is a heuristic baseline, not a backtest. Thin today: ${thin}. Compare each name with its own history: ETF medians often differ from single-stock medians.<br><b>Sources.</b> FINRA daily_ratio.csv.gz + snapshot_latest.json + meta.json; session ${esc(dayLabel(M.meta.session))}, source built ${mtLabel(M.meta.source_built_mt)}. NOW roster/stretch = the board now-stretch build, session ${esc(dayLabel(M.meta.roster_session))}, built ${mtLabel(M.meta.roster_built_mt)}. No symbol-change handling or pre-window history; half-day ratios retained. All times MT.</p>`;
}

/** Tab-only stale notice in the kit's one status style (the SECTORS strip keeps renderStaleBanner). */
const staleStatus = (meta) => rosterStale(meta) ? `<p style="margin:6px 0 10px"><span class="status" role="status" data-shortvol-stale><b>Stale · gold off.</b> FINRA session ${esc(dayLabel(meta.session))} does not match the NOW roster session ${esc(dayLabel(meta.roster_session))}. Stretch, price and change columns are from ${esc(dayLabel(meta.roster_session))}; gold returns when the sessions match.</span></p>` : '';

export function renderTab(data, { now = Date.now(), sel = null, bars = null, barsState = 'loading' } = {}) {
  const M = buildModel(data);
  const deep = `<details class="deep"><summary>Deep view <span>file and window details, definition, full extremes table with 20-session bars, MR scatter, both NOW books (${M.now.length} names), how to read, sources</span></summary><div class="body">${renderFresh(M, now)}${renderDefinition()}${renderExtremes(M)}${renderScatter(M)}<div class="grid2" data-sk-label="In play (NOW books)">${renderNow(M, 'SC')}${renderNow(M, 'ML')}</div>${renderFoot(M)}</div></details>`;
  return `<div class="sk" data-asof="${esc(M.meta.session)}"${M.meta.source_generated_utc ? ` data-built="${esc(M.meta.source_generated_utc)}"` : ''}>${renderHead(M)}${staleStatus(M.meta)}${renderRead(M, now)}${renderStrip(M, now)}${renderDrill(M)}<div class="grid2 wide-left">${renderQuickNow(M, sel)}<div class="sv-col">${renderNameChartPanel(M, sel, bars, barsState)}${renderQuickExtremes(M)}</div></div>${deep}</div>`;
}

/** SECTORS-only export. Its host supplies data/shortvol-etf-strip.json explicitly. */
export function renderEtfStrip(data) {
  if (data?.schema !== 'shortvol-etf-strip/1' || !data.meta?.session || !Array.isArray(data.rows)) throw new Error('Unsupported or incomplete ETF strip data');
  const rows = goldOff(data.rows, rosterStale(data.meta)).slice().sort((a, b) => (b.snap?.pctl_2y_pct ?? -1) - (a.snap?.pctl_2y_pct ?? -1) || a.t.localeCompare(b.t));
  const tile = (r) => `<article class="sv-tile"><div class="sv-tt"><b>${esc(r.t)}</b>${thinTag(r)}<span>${esc(r.label)}</span></div><div class="sv-pcg">${renderShortCells(r, { card: true })}</div></article>`;
  return `<section class="shortvol-etf-strip sv-panel" data-shortvol-etf-strip>${panelHead('Sector ETFs + indexes · short vol % · 2-yr pctl', `${count(rows.length)} · session ${esc(data.meta.session)}`)}${renderStaleBanner(data.meta)}<div class="sv-def"><b>${LABEL}</b></div><div class="sv-tiles">${rows.map(tile).join('')}</div><div class="sv-legend">Sorted by own past-only percentile. Compare each ETF with its own history; ETF medians can be higher than single-stock medians. THIN = total under 50,000 sh off-exchange; no gold fill. Green/red ratio = above/below own median; percentile = above/below 50%.</div></section>`;
}

const mounts = new WeakMap();
export function mount(root = typeof document === 'undefined' ? null : document.getElementById('shortvolRoot'), { dataUrl = './data/shortvol.json', fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  if (!root) return null;
  if (mounts.has(root)) return mounts.get(root);
  const panel = root.closest('[id^="view-"]') || root;
  let data = null, pending = null, loadedAt = null, status = 'idle', destroyed = false, sel = null;
  const barsCache = new Map(); // ticker -> {state:'loading'|'ok'|'none', bars}
  const current = () => sel || (data ? buildModel(data).now[0]?.t : null);
  const tabHTML = () => { const t = current(), c = t && barsCache.get(t); return renderTab(data, { now: now(), sel: t, bars: c?.bars || null, barsState: c?.state || 'loading' }); };
  const paintChart = () => {
    const t = current(), host = root.querySelector('#svChartPanel');
    if (!data || !t || !host) return;
    const c = barsCache.get(t);
    host.outerHTML = renderNameChartPanel(buildModel(data), t, c?.bars || null, c?.state || 'loading');
    root.querySelectorAll('tr[data-sv-sel]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.svSel === t));
  };
  const loadBars = (t) => {
    if (!t || barsCache.has(t)) { paintChart(); return; }
    const fetchBars = typeof window !== 'undefined' && window.radarFetchBars;
    if (typeof fetchBars !== 'function') { barsCache.set(t, { state: 'none', bars: null }); paintChart(); return; }
    barsCache.set(t, { state: 'loading', bars: null }); paintChart();
    Promise.resolve().then(() => fetchBars(t, 'D')).then((b) => { barsCache.set(t, Array.isArray(b) && b.length ? { state: 'ok', bars: b } : { state: 'none', bars: null }); })
      .catch(() => barsCache.set(t, { state: 'none', bars: null })).finally(() => { if (!destroyed && current() === t) paintChart(); });
  };
  const errorHTML = (e) => `<div class="sk"><p class="hidden-note sv-error" role="alert">Short-volume data did not load (${esc(e?.message || e)}). <button type="button" data-shortvol-retry>Retry</button></p></div>`;
  function load() {
    if (destroyed) return Promise.resolve(null);
    if (pending) return pending;
    status = 'loading';
    if (!data) root.innerHTML = `<div class="sk"><div class="head"><h1>Short vol</h1></div><p class="note" role="status">Loading short-volume data…</p>${renderDefinition()}</div>`;
    pending = Promise.resolve().then(() => fetchImpl(dataUrl, { cache: 'no-cache' })).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then((value) => {
      renderTab(value, { now: now() }); // validate before swapping state
      if (destroyed) return null;
      data = value; loadedAt = now(); status = 'ready'; root.innerHTML = tabHTML(); loadBars(current());
      return value;
    }).catch((error) => {
      if (!destroyed) { status = 'error'; root.innerHTML = (data ? tabHTML() : `<div class="sk">${renderDefinition()}</div>`) + errorHTML(error); }
      return null;
    }).finally(() => { pending = null; });
    return pending;
  }
  const seen = () => { if (!root.hidden && !panel.hidden && (loadedAt == null || now() - loadedAt > REFRESH_MS)) return load(); return pending; };
  const click = (e) => {
    if (e.target.closest('[data-shortvol-retry]')) { load(); return; }
    const tile = e.target.closest('[data-sk-drill]');
    if (tile) { const k = tile.dataset.skDrill; drill = drill === k ? null : k; if (data) root.innerHTML = tabHTML(); root.querySelector('[data-sk-drill="' + k + '"]')?.focus({ preventScroll: true }); return; }
    const row = e.target.closest('tr[data-sv-sel]');
    if (row && data) { sel = row.dataset.svSel; loadBars(sel); }
  };
  const keydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-sk-drill],tr[data-sv-sel]')) { e.preventDefault(); e.target.click(); } };
  root.addEventListener('click', click);
  root.addEventListener('keydown', keydown);
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(seen);
  observer?.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  if (panel !== root) observer?.observe(root, { attributes: true, attributeFilter: ['hidden'] });
  const handle = { load, seen, get status() { return status; }, destroy() { destroyed = true; observer?.disconnect(); root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); mounts.delete(root); } };
  mounts.set(root, handle); seen();
  return handle;
}
// V2.18.1: SECTORS ETF strip. Lands collapsed (<details id="shortvolEtfStrip">); data loads only on first open.
export function mountEtfStrip(host = typeof document === 'undefined' ? null : document.getElementById('shortvolEtfStrip'), { dataUrl = './data/shortvol-etf-strip.json', fetchImpl = globalThis.fetch } = {}) {
  if (!host) return null;
  if (mounts.has(host)) return mounts.get(host);
  const body = host.querySelector?.('[data-shortvol-etf-body]') || host;
  let pending = null, status = 'idle';
  function load() {
    if (pending || status === 'ready') return pending;
    status = 'loading'; body.innerHTML = '<div class="sv-empty" role="status">Loading short-volume ETF strip…</div>';
    pending = Promise.resolve().then(() => fetchImpl(dataUrl, { cache: 'no-cache' })).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then((value) => { body.innerHTML = renderEtfStrip(value); status = 'ready'; return value; })
      .catch((error) => { status = 'error'; body.innerHTML = `<div class="sv-error" role="alert">Short-volume ETF strip did not load (${esc(error?.message || error)}). Close and reopen to retry.</div>`; return null; })
      .finally(() => { pending = null; });
    return pending;
  }
  const toggle = () => { if (host.open && status !== 'ready') load(); };
  host.addEventListener('toggle', toggle);
  const handle = { load, get status() { return status; }, destroy() { host.removeEventListener('toggle', toggle); mounts.delete(host); } };
  mounts.set(host, handle); toggle();
  return handle;
}
if (typeof document !== 'undefined') {
  const boot = () => { mount(); mountEtfStrip(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
