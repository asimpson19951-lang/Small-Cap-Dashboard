// REGIME tab, V2.18.0: raw value + past-only percentile + days since the last extreme, breadth,
// "after similar days" (PAST-ONLY, with n and a 90% random range) and Commitments of Traders.
// Pure read-only renderer. Inputs:
//   reg  = ./data/regime-2y.json   (offline builder: scripts/build-sectors-regime-snapshot.mjs)
//   snap = ./data/breadth-tape.json (existing public snapshot: breadth rows, tape, cot)
// Display laws: no dim text, units on every number, gold = fill/edge only (never text), red only in
// heat cells / bars, all-black surface, times in MT, raw values (no scores).
import { pct, xx, badge, pbar, dshort, dmd, mtStamp, barsFreshness, dayWord } from './sectors-tab.mjs?v=V2.21.0';
import { tradingSessionGap } from './market-calendar.mjs';

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const isExt = (p) => finite(p) != null && (p <= 5 || p >= 95);
const cc = (v) => (finite(v) == null || v === 0 ? '' : v > 0 ? 'rg-up' : 'rg-dn');
const fmtK = (v) => (finite(v) == null ? '—' : `${sgn(v)}${Math.abs(v / 1000).toFixed(1)}K`);

/** coloured number + thin bar (palette D4, the shared .sk .db data bar). scale = |v| that fills the bar. */
export function d4(v, scale, fmt = pct) {
  if (finite(v) == null) return '<td>n/a</td>';
  const s = Math.min(1, Math.abs(v) / scale);
  const c = v > 0 ? 'up' : v < 0 ? 'dn' : '';
  return `<td><span class="db ${c}"><span class="${c}">${fmt(v)}</span><i style="width:${(s * 100).toFixed(0)}%"></i></span></td>`;
}
// Nov 13 2026 (UX pass P3): every reading series is a non-price series, so it draws as a thin daily bar histogram on black,
// never a line (display law: price = candles, other series = bars). zero = signed series: bars grow from 0, green above /
// red below (heat-map colours). zero = false: unsigned level series (vol, counts), bars rise from just under the window low
// in bright grey, the newest bar white. gold = bar indexes drawn gold (a known extreme day). Missing values leave a gap.
export function barSpark(vals, { w = 200, h = 40, zero = true, gold = [], label = '' } = {}) {
  const v = (Array.isArray(vals) ? vals : []).map((q) => finite(q));
  const ok = v.filter((q) => q != null);
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  if (ok.length < 2) return `<svg class="rg-spk" width="100%" height="${h}" viewBox="0 0 ${w} ${h}"${aria}></svg>`;
  const n = v.length, mn = Math.min(...ok), mx = Math.max(...ok);
  let lo, hi, base;
  if (zero) { lo = Math.min(0, mn); hi = Math.max(0, mx); base = 0; } else { const pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.05 || 1; lo = mn - pad; hi = mx; base = lo; }
  const r = hi - lo || 1; const Y = (q) => 2 + ((hi - q) / r) * (h - 4);
  const slot = w / n, bw = Math.max(1, slot * 0.7), G = new Set(gold);
  let s = `<rect width="${w}" height="${h}" fill="#000"/>`;
  if (zero && lo < 0 && hi > 0) s += `<line x1="0" x2="${w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#464b52" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  v.forEach((q, i) => {
    if (q == null) return;
    const y0 = Y(base), y1 = Y(q), top = Math.min(y0, y1), bh = Math.max(0.8, Math.abs(y1 - y0));
    const fill = G.has(i) ? '#e4b76e' : zero ? (q > 0 ? '#51c083' : q < 0 ? '#e17272' : '#bec7cd') : (i === n - 1 ? '#e0e5e7' : '#bec7cd');
    s += `<rect x="${(i * slot + (slot - bw) / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${fill}"/>`;
  });
  return `<svg class="rg-spk" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"${aria}>${s}</svg>`;
}
function spark(vals, w = 200, h = 40, zero = true, gold = []) { return barSpark(vals, { w, h, zero, gold }); }
// Index (in a spark that ends on the as-of session) of the last extreme day, or none when it falls outside the spark.
export function extIdx(ext, len) { const i = ext && Number.isInteger(ext.sessions) ? len - 1 - ext.sessions : -1; return i >= 0 && i < len ? [i] : []; }
// Breadth rows the backend labelled P95 (the only extreme label it writes).
const p95Idx = (rows) => rows.map((r, i) => (r?.percentile_reached === 95 ? i : -1)).filter((i) => i >= 0);

/** Quick-view reading card: label, value, 60-session bars (gold = last extreme day), pctile + last extreme. Pure. */
export function readingCard({ label, val, cls = '', bars, p, sub }) {
  return `<div class="rg-cd${isExt(p) ? ' ext' : ''}"><div class="k" title="${esc(label)}">${esc(label)}</div><div class="v ${cls}">${val}</div>${bars}<div class="s">${sub}</div></div>`;
}

/** 8EMA breadth as up / down daily bars: above-band entries up in green, below-band entries down in red, gold column
 *  on the backend's P95 days. One bar per MEASURED session (job-gap sessions are not drawn; the caption counts them). */
export function breadthChart(rows, { w = 640, h = 200 } = {}) {
  const R = (Array.isArray(rows) ? rows : []).filter((r) => r && finite(r.above) != null && finite(r.below) != null);
  if (R.length < 2) return '';
  const padL = 64, padR = 8, padT = 8, padB = 20, pw = w - padL - padR, ph = h - padT - padB, mid = padT + ph / 2;
  const mx = Math.max(1, ...R.map((r) => Math.max(r.above, r.below))), sc = (ph / 2 - 2) / mx;
  const slot = pw / R.length, bw = Math.max(1.5, slot * 0.7);
  let s = `<svg class="rg-bc" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="8EMA breadth, ${R.length} measured sessions ${esc(dmd(R[0].et_date))} to ${esc(dmd(R.at(-1).et_date))}: above-band entries up, below-band entries down"><rect width="${w}" height="${h}" fill="#000"/>`;
  R.forEach((r, i) => { if (r.percentile_reached === 95) s += `<rect x="${(padL + i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${ph}" fill="rgba(228,183,110,.26)"/>`; });
  s += `<line x1="${padL}" x2="${w - padR}" y1="${mid}" y2="${mid}" stroke="#464b52"/>`;
  R.forEach((r, i) => {
    const x = (padL + i * slot + (slot - bw) / 2).toFixed(1);
    if (r.above > 0) s += `<rect x="${x}" y="${(mid - r.above * sc).toFixed(1)}" width="${bw.toFixed(1)}" height="${(r.above * sc).toFixed(1)}" fill="#51c083"><title>${esc(dshort(r.et_date))}: ${r.above} stocks above the band</title></rect>`;
    if (r.below > 0) s += `<rect x="${x}" y="${mid}" width="${bw.toFixed(1)}" height="${(r.below * sc).toFixed(1)}" fill="#e17272"><title>${esc(dshort(r.et_date))}: ${r.below} stocks below the band</title></rect>`;
  });
  const t = (x, y, txt, a = 'end') => `<text x="${x}" y="${y}" text-anchor="${a}" fill="#e0e5e7" font-size="11">${txt}</text>`;
  s += t(padL - 6, padT + 10, `${mx} above`) + t(padL - 6, mid + 4, '0 stocks') + t(padL - 6, padT + ph - 2, `${mx} below`);
  for (const i of [0, Math.floor((R.length - 1) / 2), R.length - 1]) s += t((padL + (i + 0.5) * slot).toFixed(1), h - 5, esc(dmd(R[i].et_date)), i === 0 ? 'start' : i === R.length - 1 ? 'end' : 'middle');
  return `${s}</svg>`;
}

// Quick-view layout (own file; the shared .sk kit has no 2 × 2 panel grid). Injected once into <head>.
const RG_CSS = `.rg-q{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);grid-template-areas:"c d" "a b";gap:16px 22px;align-items:start;margin-bottom:18px}
.rg-q>.rg-a{grid-area:a}.rg-q>.rg-b{grid-area:b}.rg-q>.rg-c{grid-area:c}.rg-q>.rg-d{grid-area:d}
.rg-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.rg-cd{min-width:0;padding:8px 10px 9px;background:var(--raised,#202428);border-radius:8px}
.rg-cd.ext{background:linear-gradient(var(--gold-fill,rgba(228,183,110,.12)),var(--gold-fill,rgba(228,183,110,.12))),var(--raised,#202428);box-shadow:inset 3px 0 0 var(--gold,#e4b76e)}
.rg-cd .k{color:var(--text);font:600 12.5px/1.25 var(--font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rg-cd .v{margin:3px 0 5px;font:600 19px/1.1 var(--font);white-space:nowrap}
.rg-cd .rg-spk{display:block;height:34px;border-radius:3px}
.rg-cd .s{margin-top:5px;color:var(--text-2);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rg-bc{display:block;width:100%;height:auto;border-radius:4px}.rg-bc.ph{display:none}
@media (max-width:1100px){.rg-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:700px){.rg-q{grid-template-columns:minmax(0,1fr);grid-template-areas:"c" "a" "b" "d"}.rg-cd .s{white-space:normal}.rg-bc.wd{display:none}.rg-bc.ph{display:block}}`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('regimeQuickCss')) return;
  const st = document.createElement('style'); st.id = 'regimeQuickCss'; st.textContent = RG_CSS; document.head.appendChild(st);
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
  if (!I || !S) return '<section class="panel"><h2>After similar days</h2><p class="sub">After-similar-days table unavailable (snapshot missing).</p></section>';
  const rng = (x) => (x ? `${pct(x.lo)} → ${pct(x.hi)} · ${x.inside ? 'inside' : 'outside'}` : '—');
  const row = (name, key, scale) => `<tr><th>${name}</th>${d4(I.readings[key].v, scale)}<td>${rng(I.readings[key])}</td>${d4(S.readings[key].v, scale)}<td>${rng(S.readings[key])}</td></tr>`;
  const bandTxt = (x) => `band ${x.band[0]}–${x.band[1]}% · ${dword} ${xx(x.todayVal)} (${x.todayP.toFixed(1)}%)`;
  const totalOut = I.outside + S.outside, totalN = 6, exp = ((I.expectedOutside + S.expectedOutside)).toFixed(1);
  return `<section class="panel"><h2>After similar days: what the index did next from the same stretch band (full)</h2>
    <p class="sub">Sessions whose ×ATR-from-8EMA percentile sat in the same 20-point band as ${esc(dmd(reg.as_of))}, and the index's next-day / next-5-day close-to-close move. <b>Past-only:</b> each day is ranked only against the sessions up to that day (trailing ${reg.windows.pctileSessions}-session window, ${reg.windows.warmupSessions}-session warm-up), so the sample starts ${esc(dshort(I.firstDate))}. <b>Random 90%</b> = the 90% range of the same statistic from ${I.draws.toLocaleString('en-US')} random draws that keep the band's run lengths, and whether the reading falls inside it.</p>
    <div class="tw"><table class="t"><thead><tr><th class="l">Statistic</th><th>IWM</th><th>IWM · random 90%</th><th>SPY</th><th>SPY · random 90%</th></tr></thead><tbody>
      <tr><th>Sample · band</th><td colspan="2"><b>n = ${I.n} days</b> in ${I.runs} runs<small>${bandTxt(I)}</small></td><td colspan="2"><b>n = ${S.n} days</b> in ${S.runs} runs<small>${bandTxt(S)}</small></td></tr>
      ${row('Next 1D median', 'med1', 0.6)}${row('Next 1D mean', 'mean1', 0.6)}${row('Next 5D median', 'med5', 1.2)}
      <tr><th>Next 1D up</th><td>${I.up1}% of days</td><td>—</td><td>${S.up1}% of days</td><td>—</td></tr>
      <tr class="base"><th>All days · 1D median</th>${d4(I.all.med1, 0.6)}<td>n = ${I.all.n} days</td>${d4(S.all.med1, 0.6)}<td>n = ${S.all.n} days</td></tr>
      <tr class="base"><th>All days · 5D median</th>${d4(I.all.med5, 1.2)}<td>n = ${I.all.n} days</td>${d4(S.all.med5, 1.2)}<td>n = ${S.all.n} days</td></tr>
    </tbody></table></div>
    <p class="note">${totalOut} of ${totalN} readings fall outside their 90% random range; about ${exp} of ${totalN} would by chance alone. Band days cluster in runs and the 5D windows overlap, so the effective sample is closer to the run count than to n. Sample: ${I.all.n} eligible sessions, ${esc(dshort(I.firstDate))} to ${esc(dshort(I.lastDate))} (the last 5 sessions have no 5-day outcome yet); each day ranked within its trailing ${I.window} sessions. A record, not a pattern.</p></section>`;
}

function breadthTiles(snap) {
  const rows = Array.isArray(snap?.breadth?.rows) ? snap.breadth.rows : [];
  if (!rows.length) return { tiles: [], quick: [], rows, n: 0 };
  const last = rows.at(-1), n = rows.length;
  const rank = (key) => (rows.filter((r) => r[key] <= last[key]).length / n) * 100;
  const quick = [];
  const p95 = [...rows].reverse().find((r) => r.percentile_reached === 95);
  const span95 = p95 ? tradingSessionGap(p95.et_date, last.et_date) : null;
  const sinceShort = p95 ? `last P95 ${span95 ?? '—'} sess ago · ${dmd(p95.et_date)}` : `no P95 day in ${n} sess`;
  const mk = (key, label) => {
    const p = rank(key); const wkRow = rows[Math.max(0, n - 6)];
    quick.push({ label, val: `${last[key].toLocaleString('en-US')} stocks`, wk: chg(last[key], wkRow[key], (v) => `${v} stocks`).replace(' vs 5 sessions ago', ''), p, since: sinceShort });
    return tile({ label, date: dmd(last.et_date), val: `${last[key].toLocaleString('en-US')} stocks`, wk: chg(last[key], wkRow[key], (v) => `${v} stocks`), sp: spark(rows.map((r) => r[key]), 200, 40, false, p95Idx(rows)), p, plabel: `${n}-session pctile`, rng: `range ${Math.min(...rows.map((r) => r[key]))} → ${Math.max(...rows.map((r) => r[key]))} stocks · ${n} measured sessions`, ext: `of ${finite(last.universe_warm)?.toLocaleString('en-US') ?? '—'} warm mid/large caps` });
  };
  let since = '<div class="rg-tile"><div class="rg-th"><b>Since last breadth extreme</b><span>calibrated P95</span></div><div class="rg-tv">no P95 day</div><div class="rg-tr">none in the ' + n + ' measured sessions</div></div>';
  if (p95) {
    const after = rows.filter((r) => r.et_date > p95.et_date);
    const span = span95; // true NYSE sessions since the P95 day
    const unmeasured = span == null ? null : span - after.length;
    since = `<div class="rg-tile"><div class="rg-th"><b>Since last breadth extreme</b><span>calibrated P95</span></div><div class="rg-tv">${span ?? '—'} sessions</div><div class="rg-tw2">${esc(dshort(p95.et_date))} · ${p95.side_max} stocks ${p95.side_max_side === 'ABOVE' ? 'above' : 'below'} the band</div><div class="rg-gap"><b>${after.length} measured</b>${unmeasured ? ` · <b>${unmeasured} not measured</b> (job gap)` : ''}</div><div class="rg-tf">The backend labels each day P50 / P75 / P95. Count = NYSE sessions after the P95 day through ${esc(dshort(last.et_date))}.</div></div>`;
  }
  return { tiles: [mk('above', 'Entries above 8EMA band'), mk('below', 'Entries below 8EMA band'), since], quick, rows, n };
}

function tile({ label, date, val, wk, sp, p, plabel, rng, ext, foot }) {
  return `<div class="rg-tile${isExt(p) ? ' rg-extc' : ''}"><div class="rg-th"><b>${esc(label)}</b><span>${esc(date)}</span></div><div class="rg-tv">${val}</div><div class="rg-tw2">${wk}</div>${sp}<div class="rg-tp">${pbar(p, 92)}<em>${esc(plabel)}</em></div><div class="rg-tr">${rng}</div><div class="rg-tf">${ext}</div>${foot ? `<div class="rg-tf">${foot}</div>` : ''}</div>`;
}

function breadthSection(rows) {
  if (!rows.length) return '<section class="sec panel" data-sk-label="8EMA breadth"><h2>8EMA breadth</h2><p class="sub">Breadth rows unavailable.</p></section>';
  const maxS = Math.max(...rows.map((r) => Math.max(r.above, r.below)), 1);
  const desc = [...rows].reverse();
  const body = desc.map((r, i) => {
    const nxt = desc[i + 1]; // the older row
    const gap = nxt ? weekdaysBetween(nxt.et_date, r.et_date) : 0;
    const gapRow = gap > 0 ? `<tr class="more"><td colspan="7">${esc(dshort(nxt.et_date))} → ${esc(dshort(r.et_date))} · ${gap} session${gap === 1 ? '' : 's'} not measured (job gap)</td></tr>` : '';
    const themes = Array.isArray(r.theme_names) && r.theme_names.length ? r.theme_names.join(', ') : 'none';
    return `<tr class="${r.percentile_reached === 95 ? 'ext' : ''}"><th>${esc(dshort(r.et_date))}</th><td class="rg-bl"><span class="rg-bw"><i class="rg-bdn" style="width:${((r.below / maxS) * 100).toFixed(1)}%"></i><b>${r.below} stocks</b></span></td><td class="rg-br l"><span class="rg-bw"><i class="rg-bup" style="width:${((r.above / maxS) * 100).toFixed(1)}%"></i><b>${r.above} stocks</b></span></td><td>${r.total} stocks</td><td class="opt">${r.side_max_side === 'ABOVE' ? 'above' : 'below'}</td><td class="opt">${finite(r.percentile_reached) ? `P${r.percentile_reached}` : 'under P50'}</td><td class="opt l w">${esc(themes)}</td></tr>${gapRow}`;
  }).join('');
  return `<section class="sec panel" data-sk-label="8EMA breadth"><h2>8EMA breadth · newest on top</h2><p class="sub">Calibrated mid / large universe. Daily count of stocks that closed beyond their calibrated 8EMA extension band. Bars: red = below, green = above (heat-map colours, not P&amp;L). Gold row = the backend's P95 day. ${rows.length} measured sessions.</p>
    <div class="tw"><table class="t"><thead><tr><th class="l">Session</th><th>Below band</th><th class="l">Above band</th><th>Total</th><th class="opt">Heavier</th><th class="opt">Calibrated</th><th class="l opt">Themes burning</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function cotSection(cot) {
  const cotRows = Array.isArray(cot?.contracts) ? cot.contracts : [];
  if (!cotRows.length) return '<section class="sec panel" data-sk-label="Commitments of Traders"><h2>Commitments of Traders</h2><p class="sub">COT snapshot unavailable.</p></section>';
  return `<section class="sec panel" data-sk-label="Commitments of Traders"><h2>Commitments of Traders</h2><p class="sub">Official CFTC weekly positioning · positions ${esc(dshort(cot.report_date))}. Net = longs − shorts in contracts. % OI is a heat column (green net long, red net short). ${esc(cot.cadence || '')} A history percentile needs the CFTC history backfill and is not shown.</p>
    <div class="tw"><table class="t"><thead><tr><th class="l">Contract</th><th class="l opt">Primary</th><th>Net</th><th class="opt">Week Δ</th><th>% OI</th><th class="l opt">Secondary</th><th>% OI</th></tr></thead><tbody>${cotRows.map((c) => `<tr><th>${esc(c.key)}<small>${esc(c.label)}</small></th><td class="l opt">${esc(c.primary_label)}</td><td>${fmtK(c.primary_net)} contracts</td><td class="opt">${fmtK(c.primary_weekly_change)}</td>${d4(c.primary_net_pct_oi, 40)}<td class="l opt">${esc(c.secondary_label)}</td>${d4(c.secondary_net_pct_oi, 60)}</tr>`).join('')}</tbody></table></div></section>`;
}

function footSection(reg, rows, W) {
  return `<details class="fold sec" data-sk-label="Definitions"><summary>Sources and definitions<span>×ATR, pctile, last extreme, breadth, COT</span></summary><p class="note">
    <b>×ATR</b> = (close − EMA8) ÷ Wilder ATR14 on daily bars, ${reg.source.sessions} sessions ${esc(reg.source.first)} → ${esc(reg.source.last)} (offline snapshot <b>regime-2y.json</b>). <b>Pctile</b> = share of the trailing ${W} sessions at or below the reading, ranked only against sessions up to that day (a day with fewer than ${reg.windows.warmupSessions} valid sessions gets no rank). <b>Last extreme</b> = the most recent day whose own past-only pctile was at or beyond 5% / 95%. <b>Breadth</b> = the existing <b>breadth-tape.json</b> (${rows.length} measured sessions, so its pctile is a ${rows.length}-session rank). <b>COT</b> = CFTC Public Reporting, weekly.</p></details>`;
}

// ---- board skin v2 (Oct 19 2026): .sk page = head → read → strip → quick view → Deep view (everything else) ----
const pcSk = (p) => (finite(p) == null ? '—' : `<span class="pc${isExt(p) ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>`);
const ud = (v) => (finite(v) == null || v === 0 ? '' : v > 0 ? 'up' : 'dn');
const lastExtShort = (e, W) => (!e ? `none in ${W} sess` : e.sessions === 0 ? 'now' : `${e.sessions} sess ago · ${dmd(e.date)}`);
if (typeof document !== 'undefined' && !globalThis.__skDeepOpen) {
  globalThis.__skDeepOpen = new Set();
  document.addEventListener('toggle', (ev) => { const d = ev.target; const k = d?.dataset?.skDeep; if (!k) return; if (d.open) globalThis.__skDeepOpen.add(k); else globalThis.__skDeepOpen.delete(k); }, true);
}
const deepIsOpen = (key) => !!globalThis.__skDeepOpen?.has(key);

/** Whole REGIME surface. Returns { asOf, html }. asOf is '' because the head meta line carries every as-of (no duplicate lines). */
export function renderRegimeTab(reg, snap, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const ok = reg && reg.iwm && reg.spy && reg.windows;
  const rows = Array.isArray(snap?.breadth?.rows) ? snap.breadth.rows : [];
  const lastRow = rows.at(-1) || null;
  const W = ok ? reg.windows.pctileSessions : null;
  const tape = snap?.tape || null;
  const cot = snap?.cot || null;
  const badges = [];
  if (lastRow) { badges.push(badge('8EMA breadth', `through ${dshort(lastRow.et_date)} · ${rows.length} sessions measured`, opts.breadthFresh === false ? 'STALE' : 'FRESH', `measured ${mtStamp(lastRow.measured_at)}`)); }
  else badges.push(badge('8EMA breadth', 'no rows', 'GAP'));
  const barsFresh = ok ? (opts.barsFresh ?? barsFreshness(reg.as_of, nowMs).fresh) : false;
  if (ok) { badges.push(badge('IWM / SPY daily bars', `${reg.source.sessions} sessions from ${dmd(reg.source.first)} ${reg.source.first.slice(0, 4)} · through ${dshort(reg.as_of)}`, barsFresh ? 'FRESH' : 'STALE', `window ${W} sessions · built ${mtStamp(reg.generated_at)} · rebuilt by hand`)); }
  else badges.push(badge('IWM / SPY daily bars', 'snapshot unavailable', 'GAP', 'stretch tiles and after-similar-days are off'));
  if (cot?.report_date) { badges.push(badge('CFTC COT', `positions ${dshort(cot.report_date)} · weekly`, opts.cotFresh === false ? 'STALE' : 'FRESH')); }
  if (tape) badges.push(badge('HOD / LOD hit tape', `last data ${tape.as_of ? dshort(tape.as_of) : 'unknown'}`, tape.status === 'stale' ? 'STALE' : 'FRESH', tape.status === 'stale' ? 'not shown until the rail runs again' : ''));
  const meta = `Breadth through ${lastRow ? esc(dshort(lastRow.et_date)) : 'date unknown'}${lastRow ? ` (measured ${esc(mtStamp(lastRow.measured_at))})` : ''} · IWM / SPY bars to the ${ok ? esc(dshort(reg.as_of)) : 'unavailable'} close${ok ? ` (built ${esc(mtStamp(reg.generated_at))})` : ''} · CFTC positions ${cot?.report_date ? esc(dshort(cot.report_date)) : 'unavailable'}`;
  // S2: the shared status chip reads data-asof / data-built (the older of the two daily inputs), so the tab draws no pill.
  const asOf = [ok ? reg.as_of : null, lastRow?.et_date].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''))).sort()[0] || '';
  const rootAttrs = `${asOf ? ` data-asof="${esc(asOf)}"` : ''}${ok && reg.generated_at ? ` data-built="${esc(reg.generated_at)}"` : ''}`;
  const head = `<div class="head"><h1>Regime</h1><span class="meta">${meta}</span></div>`;
  injectCss();
  if (!ok) return { asOf: '', html: `<div class="sk rg-root" style="display:block"${rootAttrs}>${head}<p class="read">2-year IWM / SPY snapshot unavailable.</p><div class="sx-fbrow">${badges.join('')}</div></div>` };

  const I = reg.iwm, S = reg.spy, T = reg.iwmVsSpy20;
  const d = dmd(reg.as_of); const word = dayWord(reg.as_of, nowMs);
  const pl = `${W}-session pctile`;
  const fRv = (v) => `${v.toFixed(2)}%`;
  const sp = (t, zero = true) => spark(t.spark, 200, 40, zero, extIdx(t.ext, Array.isArray(t.spark) ? t.spark.length : 0));
  const tiles = [
    tile({ label: 'IWM ×ATR from 8EMA', date: d, val: xx(I.stretch.v), wk: chg(I.stretch.v, I.stretch.wk, (v) => `${v.toFixed(2)}×`), sp: sp(I.stretch), p: I.stretch.p, plabel: pl, rng: `${I.stretch.nWin}-session range ${xx(I.stretch.range[0])} → ${xx(I.stretch.range[1])}`, ext: extTxt(I.stretch.ext, xx, W, word) }),
    tile({ label: 'IWM vs 50-day SMA', date: d, val: pct(I.v50.v), wk: chg(I.v50.v, I.v50.wk, (v) => `${v.toFixed(2)} pts`), sp: sp(I.v50), p: I.v50.p, plabel: pl, rng: `${I.v50.nWin}-session range ${pct(I.v50.range[0])} → ${pct(I.v50.range[1])}`, ext: extTxt(I.v50.ext, pct, W, word) }),
    tile({ label: 'IWM 20-day realised vol', date: d, val: `${I.rv20.v.toFixed(2)}%`, wk: chg(I.rv20.v, I.rv20.wk, (v) => `${v.toFixed(2)} pts`), sp: sp(I.rv20, false), p: I.rv20.p, plabel: pl, rng: `${I.rv20.nWin}-session range ${I.rv20.range[0].toFixed(1)}% → ${I.rv20.range[1].toFixed(1)}%`, ext: extTxt(I.rv20.ext, (v) => `${v.toFixed(1)}%`, W, word), foot: 'annualised, close-to-close' }),
    tile({ label: 'IWM vs SPY · 20 sessions', date: d, val: pct(T.v), wk: chg(T.v, T.wk, (v) => `${v.toFixed(2)} pts`), sp: sp(T), p: T.p, plabel: pl, rng: `${T.nWin}-session range ${pct(T.range[0])} → ${pct(T.range[1])}`, ext: extTxt(T.ext, pct, W, word) }),
    tile({ label: 'SPY ×ATR from 8EMA', date: d, val: xx(S.stretch.v), wk: chg(S.stretch.v, S.stretch.wk, (v) => `${v.toFixed(2)}×`), sp: sp(S.stretch), p: S.stretch.p, plabel: pl, rng: `${S.stretch.nWin}-session range ${xx(S.stretch.range[0])} → ${xx(S.stretch.range[1])}`, ext: extTxt(S.stretch.ext, xx, W, word) }),
  ];
  const B = breadthTiles(snap); tiles.push(...B.tiles);

  // the five bar readings, one list for read / strip / quick table
  const R5 = [['IWM ×ATR from 8EMA', I.stretch, xx, (v) => `${v.toFixed(2)}×`], ['IWM vs 50-day SMA', I.v50, pct, (v) => `${v.toFixed(2)} pts`], ['IWM 20-day realised vol', I.rv20, fRv, (v) => `${v.toFixed(2)} pts`], ['IWM vs SPY over 20 sessions', T, pct, (v) => `${v.toFixed(2)} pts`], ['SPY ×ATR from 8EMA', S.stretch, xx, (v) => `${v.toFixed(2)}×`]];
  const extNow = R5.filter(([, t]) => isExt(t.p));
  const readTxt = extNow.length
    ? `At a ${W}-session extreme ${word}: ${extNow.map(([n, t, f]) => `<b>${esc(n)} ${f(t.v)} (${t.p.toFixed(1)}% pctl)</b>`).join(' · ')}.`
    : `No reading is at its 5th / 95th pctile of the last ${W} sessions ${word}. IWM sits <b>${xx(I.stretch.v)} ATR from its 8EMA</b> (${I.stretch.p.toFixed(1)}% pctl) and <b>${pct(I.v50.v)} vs its 50-day</b>; IWM vs SPY over 20 sessions ${pct(T.v)} (${T.p.toFixed(1)}% pctl).${lastRow ? ` Breadth ${esc(dmd(lastRow.et_date))}: ${lastRow.below} stocks below the 8EMA band, ${lastRow.above} above.` : ''}`;
  const read = `<p class="read${extNow.length ? ' ext' : ''}">${readTxt}</p>`;
  const stile = (label, t, f, wkf, mr) => `<div class="tile${mr ? ' mr' : ''}${isExt(t.p) ? ' ext' : ''}"><div class="k">${esc(label)}</div><div class="v ${f === fRv ? '' : ud(t.v)}">${f(t.v)}</div><div class="s">${t.p.toFixed(1)}% 2-yr pctl · ${chg(t.v, t.wk, wkf).replace(' vs 5 sessions ago', ' vs 5 sess')}</div></div>`;
  const strip = `<div class="strip">${R5.map(([n, t, f, wkf], i) => stile(n.replace(' over 20 sessions', ' · 20 sess'), t, f, wkf, i === 0)).join('')}</div>`;

  // quick view A: the readings now (5 bar readings + 2 breadth counts)
  const qRow = ([n, t, f, wkf]) => `<tr class="${isExt(t.p) ? 'ext' : ''}"><th>${esc(n)}</th><td class="${f === fRv ? '' : ud(t.v)}">${f(t.v)}</td><td class="opt">${chg(t.v, t.wk, wkf).replace(' vs 5 sessions ago', '')}</td><td>${pcSk(t.p)}</td><td class="opt">${lastExtShort(t.ext, W)}</td></tr>`;
  const bRows = B.quick.map((q) => `<tr class="${isExt(q.p) ? 'ext' : ''}"><th>${esc(q.label)}<small>${B.n}-session pctile</small></th><td>${q.val}</td><td class="opt">${q.wk}</td><td>${pcSk(q.p)}</td><td class="opt">${esc(q.since)}</td></tr>`).join('');
  const quickA = `<section class="panel"><h2>Is the tape stretched?</h2><p class="sub">Bars to the ${esc(dshort(reg.as_of))} close · breadth to ${lastRow ? esc(dshort(lastRow.et_date)) : 'n/a'} · gold row = at or beyond the 5th / 95th pctile</p><div class="tw"><table class="t"><thead><tr><th class="l">Measure</th><th>Now</th><th class="opt">vs 5 sess ago</th><th>2-yr percentile</th><th class="opt">Last extreme</th></tr></thead><tbody>${R5.map(qRow).join('')}${bRows}</tbody></table></div></section>`;
  // quick view C: every reading as a card with its last 60 sessions as daily bars (gold bar = the last extreme day)
  const cards = R5.map(([n, t, f]) => readingCard({ label: n, val: f(t.v), cls: f === fRv ? '' : ud(t.v), bars: barSpark(t.spark, { w: 200, h: 34, zero: f !== fRv, gold: extIdx(t.ext, Array.isArray(t.spark) ? t.spark.length : 0), label: `${n}, last ${Array.isArray(t.spark) ? t.spark.length : 0} sessions` }), p: t.p, sub: `${t.p.toFixed(1)}% pctl · ext ${lastExtShort(t.ext, W)}` }));
  if (rows.length) {
    const g = p95Idx(rows), bn = rows.length;
    const p95 = [...rows].reverse().find((r) => r.percentile_reached === 95);
    const sinceP95 = p95 ? `last P95 ${tradingSessionGap(p95.et_date, lastRow.et_date) ?? '—'} sess ago` : `no P95 in ${bn} sess`;
    B.quick.forEach((q, i) => { const key = i === 0 ? 'above' : 'below'; cards.push(readingCard({ label: q.label.replace('Entries', 'Stocks'), val: q.val, bars: barSpark(rows.map((r) => r[key]), { w: 200, h: 34, zero: false, gold: g, label: `${q.label}, ${bn} measured sessions` }), p: q.p, sub: `${q.p.toFixed(1)}% ${bn}-sess pctl · ${esc(sinceP95)}` })); });
    const tot = rows.map((r) => r.total), tp = (tot.filter((v) => v <= lastRow.total).length / bn) * 100;
    cards.push(readingCard({ label: 'Stocks beyond the band, total', val: `${lastRow.total.toLocaleString('en-US')} stocks`, bars: barSpark(tot, { w: 200, h: 34, zero: false, gold: g, label: `Total entries, ${bn} measured sessions` }), p: tp, sub: `${tp.toFixed(1)}% ${bn}-sess pctl · ${esc(sinceP95)}` }));
  }
  const quickC = `<section class="panel rg-c"><h2>Readings · last 60 sessions as daily bars</h2><p class="sub">Green up / red down from zero for signed readings, grey for levels and counts · gold bar = the last day at or beyond the 5th / 95th pctile (breadth: the backend's P95 days)</p><div class="rg-cards">${cards.join('')}</div></section>`;
  // quick view D: 8EMA breadth as up / down bars
  const bcW = breadthChart(rows), bcP = breadthChart(rows, { w: 360, h: 190 });
  const bc = bcW ? bcW.replace('class="rg-bc"', 'class="rg-bc wd"') + bcP.replace('class="rg-bc"', 'class="rg-bc ph"') : '';
  const gaps = rows.length ? rows.slice(1).reduce((a, r, i) => a + weekdaysBetween(rows[i].et_date, r.et_date), 0) : 0;
  const quickD = bc ? `<section class="panel rg-d"><h2>8EMA breadth · ${rows.length} measured sessions</h2><p class="sub">Stocks closing beyond their calibrated 8EMA band each session: above the band up (green), below down (red) · gold column = the backend's P95 day · ${esc(dshort(rows[0].et_date))} → ${esc(dshort(lastRow.et_date))}${gaps ? ` · ${gaps} session${gaps === 1 ? '' : 's'} not measured (job gaps, not drawn)` : ''}</p>${bc}</section>` : '';
  const quick = `<div class="rg-q"><div class="rg-a">${quickA}</div><div class="rg-b">${renderSimilarQuick(reg, nowMs)}</div>${quickC}${quickD}</div>`;
  const html = `<div class="sk rg-root" style="display:block"${rootAttrs}>${head}${read}${quick}
    <details class="deep" data-sk-deep="regime"${deepIsOpen('regime') ? ' open' : ''}><summary>Deep view <span>reading details with ranges · after similar days, full · 8EMA breadth by session · Commitments of Traders · sources</span></summary><div class="body">
    <section class="sec" data-sk-label="Freshness"><div class="sx-fbrow">${badges.join('')}</div></section>
    <section class="sec" data-sk-label="Reading details"><div class="rg-tiles">${tiles.join('')}</div></section>
    <section class="sec" data-sk-label="After similar days">${renderSimilarDays(reg, nowMs)}</section>
    ${breadthSection(rows)}${cotSection(cot)}${footSection(reg, rows, W)}</div></details></div>`;
  return { asOf: '', html };
}

/** Quick-view MR panel: the after-similar-days medians, compact. Full table stays in Deep view. */
function renderSimilarQuick(reg, nowMs) {
  const I = reg?.similar?.iwm, S = reg?.similar?.spy;
  if (!I || !S) return '<section class="panel"><h2>Mean-reversion lens: what the index did next</h2><p class="sub">After-similar-days table unavailable.</p></section>';
  const dword = dayWord(reg?.as_of, nowMs);
  const rng = (x) => (x ? `${pct(x.lo)} → ${pct(x.hi)}` : '—');
  // RC2 TR3: n per horizon (band days that already have a 1-day / 5-day outcome); 0 prints "no base rate yet".
  // The exchange calendar only covers recent years; an older date with >= 2h+5 calendar days to the as-of has h sessions after it for sure.
  const calDays = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;
  const hasH = (d, h) => { const g = tradingSessionGap(d, reg.as_of); return g != null ? g >= h : calDays(d, reg.as_of) >= 2 * h + 5; };
  const nH = (X, h) => (Array.isArray(X.bandDates) ? X.bandDates.filter((d) => hasH(d, h)).length : X.n);
  const NI = { med1: nH(I, 1), mean1: nH(I, 1), med5: nH(I, 5) }, NS = { med1: nH(S, 1), mean1: nH(S, 1), med5: nH(S, 5) };
  const cell = (X, N, key) => (N[key] > 0 ? `<td class="${ud(X.readings[key].v)}">${pct(X.readings[key].v)}<small>n = ${N[key]} days</small></td><td class="opt">${rng(X.readings[key])}</td>` : '<td>no base rate yet<small>n = 0 days</small></td><td class="opt">—</td>');
  const row = (name, key) => `<tr><th>${name}</th>${cell(I, NI, key)}${cell(S, NS, key)}</tr>`;
  return `<section class="panel"><h2>Mean-reversion lens: what IWM and SPY did next from the same stretch band</h2><p class="sub">IWM band ${I.band[0]}–${I.band[1]}% (${dword} ${xx(I.todayVal)}, ${I.todayP.toFixed(1)}%) · n = ${I.n} days in ${I.runs} runs · SPY band ${S.band[0]}–${S.band[1]}% · n = ${S.n} days in ${S.runs} runs · past-only · n per horizon under each value · random 90% = ${I.draws.toLocaleString('en-US')} run-preserving random draws</p><div class="tw"><table class="t"><thead><tr><th class="l">Next move</th><th>IWM</th><th class="opt">IWM random 90%</th><th>SPY</th><th class="opt">SPY random 90%</th></tr></thead><tbody>
    ${row('Next 1D median', 'med1')}${row('Next 1D mean', 'mean1')}${row('Next 5D median', 'med5')}
    <tr><th>Next 1D up</th><td>${I.up1}% of days</td><td class="opt"></td><td>${S.up1}% of days</td><td class="opt"></td></tr>
    <tr class="base"><th>All days · 1D median</th><td>${pct(I.all.med1)}</td><td class="opt">n = ${I.all.n} days</td><td>${pct(S.all.med1)}</td><td class="opt">n = ${S.all.n} days</td></tr>
    <tr class="base"><th>All days · 5D median</th><td>${pct(I.all.med5)}</td><td class="opt">n = ${I.all.n} days</td><td>${pct(S.all.med5)}</td><td class="opt">n = ${S.all.n} days</td></tr></tbody></table></div>
    <p class="note">Descriptive, not an edge claim. ${I.outside + S.outside} of 6 readings fall outside their 90% random range; about ${(I.expectedOutside + S.expectedOutside).toFixed(1)} of 6 would by chance alone. Band days cluster in runs, so the run count is the honest sample.</p></section>`;
}
