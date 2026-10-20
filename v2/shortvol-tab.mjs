// Short-volume B2: pure exported render functions + optional browser self-wiring.
// Use #shortvolRoot inside #view-shortvol. The SECTORS strip is an explicit export,
// fetched/mounted by its host; this tab never fetches or renders that strip.
import { isTradingSession, previousTradingSession, tradingSessionGap } from './market-calendar.mjs';

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
  const pctl = `${card ? '<span class="sv-k">2-YR PCTL</span>' : ''}${renderPbar(s?.pctl_2y_pct)}${history}${insufficient}${tail}`;
  return `<${cell} class="sv-new sv-first${gold}" data-shortvol-cell="ratio">${ratio}</${cell}><${cell} class="sv-new${gold}" data-shortvol-cell="percentile">${pctl}</${cell}>`;
}

/** Historical markers use each day's past-only percentile, not a future day's band. */
export function renderSpark(r, width = 196, height = 44) {
  const rows = r.spark || [], valid = rows.filter((p) => fin(p.ratio_pct));
  if (!valid.length) return '<span class="sv-na">no ratio history</span>';
  const b = r.band;
  const values = [...valid.map((p) => p.ratio_pct), ...(b ? [b.low_pct, b.high_pct] : [])];
  let lo = Math.min(...values), hi = Math.max(...values);
  const padding = (hi - lo) * 0.08 || 1; lo -= padding; hi += padding;
  const x = (i) => 4 + i * (width - 50) / Math.max(1, rows.length - 1);
  const y = (v) => 3 + (hi - v) * (height - 6) / (hi - lo);
  const f = (v) => v.toFixed(1);
  let svg = `<svg class="sv-spk" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(r.t)} short-volume ratio over ${rows.length} sessions; ${esc(rows[0]?.date)} to ${esc(rows.at(-1)?.date)}">`;
  if (b) svg += `<rect x="4" y="${f(y(b.high_pct))}" width="${width - 50}" height="${f(y(b.low_pct) - y(b.high_pct))}" fill="#262b30"/><line x1="4" x2="${width - 46}" y1="${f(y(b.median_pct))}" y2="${f(y(b.median_pct))}" stroke="#8d969e" stroke-dasharray="2 3"/>`;
  let path = '', previousValid = false;
  rows.forEach((p, i) => {
    if (!fin(p.ratio_pct)) { previousValid = false; return; }
    path += `${previousValid ? 'L' : 'M'}${f(x(i))} ${f(y(p.ratio_pct))} `; previousValid = true;
  });
  svg += `<path d="${path}" fill="none" stroke="#e0e5e7" stroke-width="1.4"/>`;
  rows.slice(0, -1).forEach((p, i) => {
    if (fin(p.ratio_pct) && isExtreme(p.pctl_2y_pct)) svg += `<circle cx="${f(x(i))}" cy="${f(y(p.ratio_pct))}" r="2.2" fill="${p.pctl_2y_pct >= 95 ? '#51c083' : '#e17272'}"/>`;
  });
  const last = rows.at(-1);
  if (fin(last?.ratio_pct)) {
    const col = !fin(median(r)) ? '#e0e5e7' : last.ratio_pct >= median(r) ? '#51c083' : '#e17272';
    svg += `<circle cx="${f(x(rows.length - 1))}" cy="${f(y(last.ratio_pct))}" r="3.4" fill="${col}" stroke="#000"/><text x="${width - 40}" y="${f(y(last.ratio_pct) + 4)}" class="sv-sl" fill="${col}">${pct(last.ratio_pct)}</text>`;
  }
  return svg + '</svg>';
}

/** FINRA file is expected by 16:00 MT, including DST and non-session days. */
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

export function renderFresh(M, now = Date.now()) {
  const m = M.meta, f = fileFreshness(m.session, now);
  const state = f.gap === 0 ? 'latest expected file' : fin(f.gap) ? `${f.gap} sessions behind expected ${f.expected}` : 'freshness unverified';
  return `<div class="sv-fresh"><span class="sv-bdg"><span>Finra file</span><b>session ${esc(m.session)}</b><span>posted by 16:00 MT · source built ${esc(m.source_built_mt)} · ${esc(state)}</span></span><span class="sv-bdg">Window <b>${m.source_sessions} source sessions</b><span>${esc(m.first_session)} → ${esc(m.session)} · up to 504 prior sessions</span></span><span class="sv-bdg">Set <b>${count(M.universe.length)}</b><span>${count(M.now.length, 'NOW names')} · sector ETFs + indexes included in extremes universe</span></span><span class="sv-bdg">Untested <b>display only</b><span>no backtest links this to next-day moves</span></span><span class="sv-bdg">NOW roster <b>session ${esc(m.roster_session)}</b><span>built ${esc(m.roster_built_mt)}</span></span></div>`;
}

export function renderDefinition() {
  return `<div class="sv-def"><span class="sv-k">What this is</span><div><b class="sv-label">${LABEL}</b>. FINRA ShortVolume ÷ TotalVolume includes market-maker hedging and routine short sales; it does not measure open short positions. Both share counts cover <b>off-exchange (FINRA TRF / ADF / ORF) regular-hours trades only; exchange volume not included</b>. Facility consolidation does not mean the whole market. <b>Thin</b> = under 50,000 sh off-exchange that day; thin names never get gold fill. FINRA files are posted by 16:00 MT.</div></div>`;
}

function kindLabel(r) {
  return r.kind === 'NOW' ? `${tag(r.book)} NOW · ${esc(r.status)}` : `${tag(r.kind === 'IDX' ? 'INDEX' : 'SECTOR ETF')} ${esc(r.label)}`;
}
const bandText = (r) => r.band ? `own 5%–95% band ${pct(r.band.low_pct)} → ${pct(r.band.high_pct)}` : 'no band yet';
const meanCell = (r) => `<span class="${tone(r.snap?.ratio_20d_pct, median(r))}">${pct(r.snap?.ratio_20d_pct)}</span><div class="sv-sub">20-session mean pctl ${pct(r.snap?.pctl_20d_pct)}</div>`;
function renderExtremeRow(r) {
  const st = stretch(r);
  return `<tr><td class="sv-l"><b class="sv-tk">${esc(r.t)}</b>${thinTag(r)}<div class="sv-sub">${kindLabel(r)}</div></td>${renderShortCells(r, { detail: true })}<td>${shares(r.short_vol)}<div class="sv-sub">of ${shares(r.total_vol)} off-exchange</div></td><td>${meanCell(r)}</td><td class="sv-c">${renderSpark(r)}<div class="sv-sub">${bandText(r)}</div></td><td>${r.kind === 'NOW' ? renderPbar(st.value) + `<div class="sv-sub">${st.window} · chg ${signed(r.chg)}${r.stale ? ' · POLLER STALE' : ''}</div>` : '<span class="sv-na">not on NOW</span>'}</td></tr>`;
}
function renderExtremeCard(r) {
  const st = stretch(r);
  return `<article class="sv-pc"><div class="sv-pch"><b class="sv-tk">${esc(r.t)}</b>${thinTag(r)}<span>${kindLabel(r)}</span></div><div class="sv-pcg">${renderShortCells(r, { card: true })}<div><span class="sv-k">20-Session mean</span>${meanCell(r)}</div><div><span class="sv-k">${r.kind === 'NOW' ? st.window.toUpperCase() : ''} STRETCH</span>${r.kind === 'NOW' ? renderPbar(st.value) : '<span class="sv-na">not on NOW</span>'}</div></div>${renderSpark(r, 360, 46)}<div class="sv-sub">${shares(r.short_vol)} short of ${shares(r.total_vol)} off-exchange · own median ${pct(median(r))} · ${bandText(r)}</div></article>`;
}
export function renderExtremes(M) {
  const rows = M.extremes;
  const info = `${count(rows.length)} of ${count(M.universe.length)} at ≥95% or ≤5% own pctl · ≈ ${(M.universe.length * 0.1).toFixed(1)} names expected by chance (10% of ${count(M.universe.length)}) · ${count(rows.filter((r) => r.snap.pctl_2y_pct >= 95).length, 'high names')} · ${count(rows.filter((r) => r.snap.pctl_2y_pct <= 5).length, 'low names')} · ${count(rows.filter(isThin).length, 'THIN names')}`;
  return `<section class="sv-panel">${panelHead('SHORT-SALE VOLUME EXTREMES', info)}${rows.length ? `<div class="sv-xt"><table class="sv-table"><thead><tr><th class="sv-l" scope="col">Ticker</th><th scope="col">Short vol %<small>${esc(M.meta.session)}</small></th><th scope="col">2-YR PCTL<small>own prior sessions</small></th><th scope="col">Short / total<small>FINRA-reported (off-exchange) sh</small></th><th scope="col">20-Session mean<small>of the ratio</small></th><th scope="col">Last 20 sessions<small>ratio % · grey = own 5%–95% band</small></th><th scope="col">8Ema stretch<small>NOW pctl</small></th></tr></thead><tbody>${rows.map(renderExtremeRow).join('')}</tbody></table></div><div class="sv-cards">${rows.map(renderExtremeCard).join('')}</div>` : '<p class="sv-empty">No names at an own-history extreme.</p>'}<div class="sv-legend"><span>Grey band = own prior-history 5%–95% of ratio; dashed line = own median.</span><span>History dots = that day’s past-only pctl ≥95% (green) or ≤5% (red); latest dot = above/below own median.</span><span>Gold fills the two short-volume cells at an extreme, except THIN names.</span></div></section>`;
}

export function renderNowRow(r) {
  const st = stretch(r);
  const tags = `${r.mover ? tag('MOVER') : ''}${r.status ? tag(r.status, r.status === 'FADING' ? 'sv-fade' : '') : ''}${r.stale ? tag(`POLLER STALE · ${r.upd_day}`, 'sv-stale') : ''}`;
  return `<tr><td class="sv-l"><b class="sv-tk">${esc(r.t)}</b> ${tags}</td><td class="sv-hide-phone">${price(r.p)}</td><td class="sv-hide-phone ${tone(r.chg)}">${signed(r.chg)}</td><td class="sv-hide-phone ${tone(r.x8)}">${signed(r.x8, 2, '×')}</td><td>${renderPbar(st.value)}${r.book === 'ML' && st.window === '1-yr' ? '<span class="sv-ns">1-yr fallback</span>' : ''}</td>${renderShortCells(r)}</tr>`;
}
export function renderNow(M, book) {
  const rows = M.now.filter((r) => r.book === book);
  return `<section class="sv-panel">${panelHead(`${tag(book)} ${book === 'SC' ? 'SMALL CAP' : 'MID / LARGE'} · ${M.rosterStale ? 'ROSTER ' + esc(M.meta.roster_session) : 'IN PLAY'}`, `${count(rows.length)} · ranked on ${esc(M.meta.roster_session)} RTH close`)}<table class="sv-table sv-now"><thead><tr><th class="sv-l" scope="col">Ticker</th><th class="sv-hide-phone" scope="col">RTH close</th><th class="sv-hide-phone" scope="col">Chg %</th><th class="sv-hide-phone" scope="col">8Ema ×ATR</th><th scope="col">${book === 'SC' ? '1-YR' : '2-YR'} STRETCH</th><th class="sv-new sv-first" scope="col">Short vol %<small>FINRA · ${esc(M.meta.session)}</small></th><th class="sv-new" scope="col">2-YR PCTL<small>own prior history</small></th></tr></thead><tbody>${rows.map(renderNowRow).join('')}</tbody></table></section>`;
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
  const near = M.near.map((r) => `<b>${esc(r.t)}</b> (${esc(r.book)}): stretch pctl ${pct(stretch(r).value)} · short-vol pctl ${pct(r.snap.pctl_2y_pct)}`).join('<br>') || 'none';
  return `<section class="sv-panel sv-mr">${panelHead('MR VIEW · STRETCH × SHORT-SALE VOLUME', `${count(M.points.length, 'NOW names')} · poller-stale ${esc(stale)} left out · ${count(missing, 'names without both pctls')}`)}<div class="sv-body">${svg}</svg><ul class="sv-facts"><li>Grey corners = both at an own-history extreme (≤5% or ≥95% on each axis). <b>Today: ${count(M.corners.length)} (${esc(M.corners.map((r) => r.t).join(', ') || 'none')}).</b></li><li>Closest to a corner:<br>${near}</li><li>Raw percentiles only. Untested: nothing here says the move reverts. ○ small cap · ■ mid / large.</li></ul></div></section>`;
}

export function renderFoot(M) {
  const thin = M.universe.filter(isThin).map((r) => `${esc(r.t)} ${shares(r.total_vol)}`).join(', ') || 'none';
  return `<div class="sv-foot"><b>How to read.</b> SHORT VOL % = FINRA ShortVolume ÷ TotalVolume for the session. 2-YR PCTL = mid-rank vs up to 504 prior sessions (strictly earlier ticker rows), valid values only; today and future excluded; n/a under 120 prior valid sessions. Missing ticker days are not filled. History counts show below 503 sessions. 20-session mean includes today; its percentile uses only earlier means (overlapping windows are autocorrelated). Band/median use only prior ratios. Green/red ratio text means above/below own median; percentile bars use the 50% midpoint; neither means good/bad. Gold fills only the two short-volume cells when own pctl ≤5% or ≥95% and not THIN. About 10% of names occupy the two tails by chance alone (≈ ${(M.universe.length * 0.1).toFixed(1)} names of ${count(M.universe.length)}); this is a heuristic baseline, not a backtest. THIN today: ${thin}. Compare each name with its own history: ETF medians often differ from single-stock medians.<br><b>Sources.</b> FINRA daily_ratio.csv.gz + snapshot_latest.json + meta.json; session ${esc(M.meta.session)}, source built ${esc(M.meta.source_built_mt)}. NOW roster/stretch = the board now-stretch build, session ${esc(M.meta.roster_session)}, built ${esc(M.meta.roster_built_mt)}. No symbol-change handling or pre-window history; half-day ratios retained. All times MT.</div>`;
}

export function renderTab(data, { now = Date.now() } = {}) {
  const M = buildModel(data);
  return `${renderStaleBanner(M.meta)}${renderFresh(M, now)}${renderDefinition()}<div class="sv-kick">SHORT-SALE VOLUME EXTREMES · plus the MR view</div><div class="sv-top">${renderExtremes(M)}${renderScatter(M)}</div><div class="sv-kick">NOW · two short-volume columns ${tag('NEW')} · history count below 503 sessions</div><div class="sv-two">${renderNow(M, 'SC')}${renderNow(M, 'ML')}</div>${renderFoot(M)}`;
}

/** SECTORS-only export. Its host supplies data/shortvol-etf-strip.json explicitly. */
export function renderEtfStrip(data) {
  if (data?.schema !== 'shortvol-etf-strip/1' || !data.meta?.session || !Array.isArray(data.rows)) throw new Error('Unsupported or incomplete ETF strip data');
  const rows = goldOff(data.rows, rosterStale(data.meta)).slice().sort((a, b) => (b.snap?.pctl_2y_pct ?? -1) - (a.snap?.pctl_2y_pct ?? -1) || a.t.localeCompare(b.t));
  const tile = (r) => `<article class="sv-tile"><div class="sv-tt"><b>${esc(r.t)}</b>${thinTag(r)}<span>${esc(r.label)}</span></div><div class="sv-pcg">${renderShortCells(r, { card: true })}</div></article>`;
  return `<section class="shortvol-etf-strip sv-panel" data-shortvol-etf-strip>${panelHead('SECTOR ETFs + INDEXES · SHORT VOL % · 2-YR PCTL', `${count(rows.length)} · session ${esc(data.meta.session)}`)}${renderStaleBanner(data.meta)}<div class="sv-def"><b>${LABEL}</b></div><div class="sv-tiles">${rows.map(tile).join('')}</div><div class="sv-legend">Sorted by own past-only percentile. Compare each ETF with its own history; ETF medians can be higher than single-stock medians. THIN = total under 50,000 sh off-exchange; no gold fill. Green/red ratio = above/below own median; percentile = above/below 50%.</div></section>`;
}

const mounts = new WeakMap();
export function mount(root = typeof document === 'undefined' ? null : document.getElementById('shortvolRoot'), { dataUrl = './data/shortvol.json', fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  if (!root) return null;
  if (mounts.has(root)) return mounts.get(root);
  const panel = root.closest('[id^="view-"]') || root;
  let data = null, pending = null, loadedAt = null, status = 'idle', destroyed = false;
  const errorHTML = (e) => `<div class="sv-error" role="alert">Short-volume data did not load (${esc(e?.message || e)}). <button type="button" data-shortvol-retry>Retry</button></div>`;
  function load() {
    if (destroyed) return Promise.resolve(null);
    if (pending) return pending;
    status = 'loading';
    if (!data) root.innerHTML = `${renderDefinition()}<div class="sv-empty" role="status">Loading short-volume data…</div>`;
    pending = Promise.resolve().then(() => fetchImpl(dataUrl, { cache: 'no-cache' })).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then((value) => {
      const html = renderTab(value, { now: now() });
      if (destroyed) return null;
      data = value; loadedAt = now(); status = 'ready'; root.innerHTML = html;
      return value;
    }).catch((error) => {
      if (!destroyed) { status = 'error'; root.innerHTML = (data ? renderTab(data, { now: now() }) : renderDefinition()) + errorHTML(error); }
      return null;
    }).finally(() => { pending = null; });
    return pending;
  }
  const seen = () => { if (!root.hidden && !panel.hidden && (loadedAt == null || now() - loadedAt > REFRESH_MS)) return load(); return pending; };
  const click = (e) => { if (e.target.closest('[data-shortvol-retry]')) load(); };
  root.addEventListener('click', click);
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(seen);
  observer?.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  if (panel !== root) observer?.observe(root, { attributes: true, attributeFilter: ['hidden'] });
  const handle = { load, seen, get status() { return status; }, destroy() { destroyed = true; observer?.disconnect(); root.removeEventListener('click', click); mounts.delete(root); } };
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
