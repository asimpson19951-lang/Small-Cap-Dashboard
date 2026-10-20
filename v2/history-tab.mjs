// HISTORY tab (V2.18.0). Loaded lazily by app.js the first time the tab opens. Reads ./data/history-mr.json (built by the close-refresh
// runner: tracked_runs + daily bars + one 2m chart). Pure render functions are exported for the node tests.
// Raw primitives only, no scores. Open runs are counted (Kaplan-Meier). Percentiles are past-only and print their real window.
// Display laws: no dim text, units on every number, gold = row fill / edge only (never text), palette #51c083 / #e17272, times MT.
import { IN_PLAY_RULES } from './in-play.mjs?v=V2.11.79';
import { BANDS, GOLD_MIN_WINDOW, WINDOW_MAX, bandAtAge, bandIdx, buildStats, goldRow, isExtreme, kmText, resolvedMedian, usable } from './history-mr-core.mjs?v=V2.19.0';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const num = (v) => v != null && isFinite(v);
export const pct = (v, dp = 2) => (!num(v) ? 'n/a' : `${sgn(v)}${Math.abs(v).toFixed(dp)}%`);
export const xx = (v, dp = 2) => (!num(v) ? 'n/a' : `${sgn(v)}${Math.abs(v).toFixed(dp)}×`);
export const usd = (v, dp = 2) => (!num(v) ? 'n/a' : `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const price = (v) => (!num(v) ? 'n/a' : v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
const dv = (v) => (!num(v) ? 'n/a' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);
const ss = (n) => (n == null ? 'n/a' : `${n} ${n === 1 ? 'session' : 'sessions'}`);
const sN = (n) => (n == null ? 'n/a' : `${n} s`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dshort = (d) => { if (!d) return 'n/a'; const [y, m, dd] = d.split('-').map(Number); return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${MON[m - 1]} ${dd}`; };
export const dmd = (d) => { if (!d) return 'n/a'; const [, m, dd] = d.split('-').map(Number); return `${MON[m - 1]} ${dd}`; };
const mtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hour12: false });
const mtDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
export const mtStamp = (iso) => (iso ? `${dshort(mtDate(iso))}, ${mtTime(iso)} MT` : 'n/a');
const cls = (v) => (!num(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');

function d4(v, scale, fmt = pct, extra = '') {
  if (!num(v)) return `<td class="n na ${extra}">n/a</td>`;
  const s = Math.min(1, Math.abs(v) / scale);
  return `<td class="n d4 ${cls(v)} ${s >= 0.8 ? 'x5' : ''} ${extra}"><span>${fmt(v)}</span><i style="width:${(s * 100).toFixed(0)}%"></i></td>`;
}
function pbar(p, w = 64) {
  if (p == null) return `<span class="pbw"><span class="pb" style="width:${w}px"></span><b class="pbn">n/a</b></span>`;
  return `<span class="pbw"><span class="pb ${isExtreme(p) ? 'pbx' : ''}" style="width:${w}px"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b class="pbn">${p.toFixed(1)}%</b></span>`;
}
const badge = (src, stamp, status, note = '') => `<span class="fb fb-${status.toLowerCase()}"><b>${esc(src)}</b><span>${stamp}</span><em>${status}</em>${note ? `<span class="fbn">${note}</span>` : ''}</span>`;

const REASON = { back_to_run_start: 'back to run start', atr5d_below_2: '|ATR / 5D| < 2', touched_20ema: '20EMA touch', touched_20ema_and_atr5d_below_2: '20EMA + ATR / 5D' };
const trigTags = (r) => (r.trig || []).map((t) => `<span class="tg tg-${esc(String(t).toLowerCase())}">${esc(t)}</span>`).join('');
const pcell = (r, w) => (r.pFlag == null ? 'n/a' : `${pbar(r.pFlag, w)}<span class="win ${r.pN < GOLD_MIN_WINDOW ? 'wsh' : ''}">of ${r.pN} s</span>`);
const rankLbl = (r) => (!r.rank?.d ? 'no prior close' : r.rank.pre ? `${dshort(r.rank.d)} close (flag came before that day's close)` : `${dshort(r.rank.d)} close (flag came after it)`);
const gTag = (r) => (r.straddle?.length ? `<span class="gd">SPLIT ${dmd(r.straddle[0])} · levels pre-split · out of stats</span>`
  : r.guardEv?.length ? `<span class="gd">${r.guardEv.map((e) => `${esc(e.kind)} ${dmd(e.d)} · ${esc(e.act)}`).join(' · ')}</span>` : '');

// ---------- Check-run explainer (Koyfin "Check Ticker" pattern: each rule, its value, pass / no) ----------
const mark = (ok) => (ok == null ? '<b class="no">n/a</b>' : ok ? '<b class="ok">Pass</b>' : '<b class="no">NO</b>');
// Rule rows shared by the deep explainer and the quick-view expand row (same values, two layouts).
export function ruleRows(r) {
  const f = r.flagDay; const sc = r.book === 'SC'; const rows = [];
  const R = IN_PLAY_RULES;
  const has = (t) => (r.trig || []).includes(t);
  rows.push(['TI hit on the flag session', has('TI') ? 'Trade Ideas alert logged' : 'no TI alert logged', 'any TI hit', has('TI')]);
  let moverOk = null;
  if (sc) {
    const a = f ? f.chg >= R.SC.moverMinChangePct : null, b = f ? f.dvol >= R.SC.moverMinDollarVolume : null;
    rows.push(['MOVER · change', f ? pct(f.chg) : 'n/a', `≥ +${R.SC.moverMinChangePct.toFixed(2)}%`, a]);
    rows.push(['MOVER · $ volume', f ? dv(f.dvol) : 'n/a', `≥ ${dv(R.SC.moverMinDollarVolume)}`, b]);
    moverOk = f ? a && b : null;
  } else {
    const a = f && f.oneDayAtr != null ? Math.abs(f.oneDayAtr) >= R.ML.moverMinOneDayAtr : null, b = f && f.atr5d != null ? Math.abs(f.atr5d) >= R.ML.moverMinAbsAtr5d : null;
    rows.push(['MOVER · one-day move', f ? `${xx(f.oneDayAtr)} ATR` : 'n/a', `≥ ${R.ML.moverMinOneDayAtr.toFixed(2)}× ATR either way`, a]);
    rows.push(['MOVER · |ATR / 5D|', f ? `${xx(f.atr5d)} ATR` : 'n/a', `≥ ${R.ML.moverMinAbsAtr5d.toFixed(2)}× ATR`, b]);
    moverOk = f ? !!(a || b) : null;
  }
  rows.push(['Traded in DAS while open', has('DAS') ? 'fill seen' : 'no fill seen', 'any fill', has('DAS')]);
  rows.push(['On the ME list', has('ME') ? 'listed' : 'not listed', 'listed', has('ME')]);
  return { rows, moverOk };
}
// The resolve sentence without the Pass badge (quick-view note); the explainer appends the badge.
export function resolveText(r) {
  const sc = r.book === 'SC';
  return r.resolved && r.resDay ? (sc
    ? `Session low on ${dshort(r.resolved)} reached the run start ${price(r.start)} (the close before D1 ${dmd(r.d1)}); that day closed ${price(r.resDay.c)}, ${pct((r.resDay.c / r.start - 1) * 100)} vs the start`
    : `|ATR / 5D| ${xx(r.resDay.atr5d)} on ${dshort(r.resolved)} (rule &lt; 2.00×)`) : r.resolved ? `resolved ${dshort(r.resolved)}` : 'open';
}
export function explainer(r, ctx, { compact = false } = {}) {
  const f = r.flagDay; const sc = r.book === 'SC';
  const flagMT = mtStamp(r.flagAt).startsWith(dshort(r.flag)) ? `first flagged ${mtStamp(r.flagAt)}` : `flag session ${dshort(r.flag)} · logged ${mtStamp(r.flagAt)}`;
  const has = (t) => (r.trig || []).includes(t);
  const { rows, moverOk } = ruleRows(r);
  const rulesHtml = rows.map(([k, v, rule, ok]) => `<tr><td class="l">${k}</td><td class="n">${v}</td><td class="n k2">${rule}</td><td class="n">${mark(ok)}</td></tr>`).join('');
  const passed = [has('TI') && 'TI', moverOk && 'MOVER', has('DAS') && 'DAS', has('ME') && 'ME'].filter(Boolean);
  const why = `In play via <b>${passed.join(' + ') || 'n/a'}</b>${moverOk === false ? ` · <b>why not MOVER:</b> ${sc ? `${pct(f.chg)} change or ${dv(f.dvol)} volume is under the rule` : 'both ATR rules under threshold'} <span class="k2">(values are the daily close; a name flagged live met the rule on the intraday reading)</span>` : ''}${moverOk == null ? ' · <b>flag-day bars not on file</b>' : ''}`;
  const res = r.resolved && r.resDay ? `${resolveText(r)} · <b class="ok">Pass</b>` : resolveText(r);
  const B = r.pFlag != null ? ctx.stats[r.book].bands[bandIdx(r.pFlag)] : null;
  const mr = `<div class="mrl"><span class="mrk">MR</span> ${r.pFlag == null ? 'no own-history rank for this run (too little daily history before the flag).' : `stretch at the last close before the flag (${rankLbl(r)}) <b>${xx(r.rank.stretch)} ATR</b> from the 8EMA = <b>${r.pFlag.toFixed(1)}%</b> of its own last <b>${r.pN} sessions</b> (past-only${r.pN < WINDOW_MAX ? `, under ${WINDOW_MAX} sessions of history` : ''}) · ${r.book} runs in the ${BANDS[bandIdx(r.pFlag)]} band: <b>${B.res} resolved, ${B.open} open</b>, median <b>${kmText(B)}</b> to resolve, open runs counted (n = ${B.n})`}${gTag(r) ? ` · ${gTag(r)}` : ''}</div>`;
  return `<div class="chk ${goldRow(r) ? 'chk-x' : ''}">
<div class="chk-h"><b>${esc(r.t)}</b><span class="tagb">${r.book}</span><span class="tagb">${esc((r.dir || '').toUpperCase())} RUN</span>${trigTags(r)}<span class="chk-s">${flagMT} · ${r.via === 'eod' ? 'end-of-day pass' : 'tracked live'}</span></div>
<div class="chk-why">${why}</div>
<table class="t chk-t"><thead><tr><th class="l">RULE (${r.book} book)</th><th>Flag-day value</th><th>Rule</th><th>Result</th></tr></thead><tbody>${rulesHtml}</tbody></table>
${compact ? '' : `<div class="chk-g">
<div><em>D1 · D-count at flag</em>${dmd(r.d1)} · ${r.eod?.dCount != null ? `D${r.eod.dCount}` : 'D n/a'}</div>
<div><em>Run start (resolve level)</em>${price(r.start)}</div>
<div><em>Peak · sessions to peak</em>${price(r.peak)} · ${ss(r.toPeak)}</div>
<div><em>Run size (start → peak)</em>${pct(r.runSize)}</div>
<div><em>Resolved · sessions</em>${r.resolved ? `${dshort(r.resolved)} · ${ss(r.toRes)}` : 'open'}</div>
<div><em>Daily ATR14 at flag</em>${f ? usd(f.atr, 4) : 'n/a'}</div>
</div>`}
<div class="chk-res"><span class="mrk">Resolved by</span> ${sc ? 'SC rule: close back to the run start' : 'ML rule: |ATR / 5D| under 2 or a daily 20EMA touch'} · ${res}</div>
${mr}
</div>`;
}

// ---------- TradingView-spec 2m chart (Austin's standard: 2m candles, black bg, EMA8 orange, BB20,2 purple, VWAP blue, volume pane) ----------
const etParts = (t) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t));
  const g = (k) => f.find((p) => p.type === k).value;
  return { d: `${g('year')}-${g('month')}-${g('day')}`, m: (+g('hour') % 24) * 60 + +g('minute') };
};
export function tvChart(all, day, { w = 900, h = 330, vh = 70, title = '', levels = [] } = {}) {
  const closes = all.map((b) => b.c); const a = 2 / 9; const ema = [];
  closes.forEach((c, i) => ema.push(i ? c * a + ema[i - 1] * (1 - a) : c));
  const bbU = [], bbL = [];
  closes.forEach((_, i) => { if (i < 19) { bbU.push(null); bbL.push(null); return; } const w20 = closes.slice(i - 19, i + 1); const m = w20.reduce((s, v) => s + v, 0) / 20; const sd = Math.sqrt(w20.reduce((s, v) => s + (v - m) ** 2, 0) / 20); bbU.push(m + 2 * sd); bbL.push(m - 2 * sd); });
  const idx = all.map((b, i) => ({ b, i, p: etParts(b.t) })).filter((q) => q.p.d === day && q.p.m >= 240 && q.p.m < 1200);
  if (!idx.length) return '';
  let pv = 0, vv = 0;
  const vwap = idx.map((q) => { const tp = (q.b.h + q.b.l + q.b.c) / 3; pv += tp * q.b.v; vv += q.b.v; return pv / vv; });
  const padR = 112, padT = 22; const pw = w - padR; const ph = h - padT - 22; const slots = 480; const sx = (m) => ((m - 240) / 2 / slots) * pw;
  const hi = Math.max(...idx.map((q) => q.b.h)), lo = Math.min(...idx.map((q) => q.b.l));
  const vis = [...idx.map((q) => q.b.h), ...idx.map((q) => q.b.l), ...idx.map((q) => bbU[q.i]).filter(Boolean), ...idx.map((q) => bbL[q.i]).filter(Boolean), ...levels.map((l) => l.v)];
  let ymx = Math.max(...vis), ymn = Math.min(...vis); const pad = (ymx - ymn) * 0.06 || ymx * 0.02; ymx += pad; ymn -= pad;
  const sy = (v) => padT + ((ymx - v) / (ymx - ymn)) * ph;
  const vmax = Math.max(...idx.map((q) => q.b.v), 1); const vy0 = h + vh - 4;
  const cw = Math.max(1, (pw / slots) * 0.68); const lastV = vwap.at(-1);
  const rng = ymx - ymn; const raw = rng / 6; const mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const lv = []; for (let v = Math.ceil(ymn / step) * step; v <= ymx; v += step) lv.push(v);
  const dpp = step < 0.1 ? 3 : 2;
  let s = `<svg class="tv" viewBox="0 0 ${w} ${h + vh}" width="100%" preserveAspectRatio="xMinYMin meet" style="max-width:${w}px" role="img" aria-label="${esc(title)}">`;
  s += `<rect x="0" y="0" width="${w}" height="${h + vh}" fill="#000"/>`;
  s += `<rect x="0" y="${padT}" width="${sx(570)}" height="${h + vh - padT}" fill="#141414"/><rect x="${sx(960)}" y="${padT}" width="${pw - sx(960)}" height="${h + vh - padT}" fill="#141414"/>`;
  for (const v of lv) { const y = sy(v); s += `<line x1="0" x2="${pw}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1c1c1c"/><text x="${pw + 6}" y="${(y + 4).toFixed(1)}" class="tv-ax">$${v.toFixed(dpp)} · ${sgn(v / lastV - 1)}${Math.abs((v / lastV - 1) * 100).toFixed(1)}%</text>`; }
  for (const [m, lab] of [[240, '02:00'], [360, '04:00'], [480, '06:00'], [570, '07:30'], [660, '09:00'], [750, '10:30'], [840, '12:00'], [960, '14:00'], [1080, '16:00']]) { const x = sx(m); s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${padT}" y2="${h + vh - 4}" stroke="#1c1c1c"/><text x="${(x + 3).toFixed(1)}" y="${h + vh - 8}" class="tv-t">${lab}</text>`; }
  const line = (arr, color, wdt) => { const p = idx.map((q, k) => { const v = arr(q, k); return v == null ? null : `${(sx(q.p.m) + cw / 2).toFixed(1)},${sy(v).toFixed(1)}`; }).filter(Boolean); return `<polyline fill="none" stroke="${color}" stroke-width="${wdt}" points="${p.join(' ')}"/>`; };
  s += line((q) => bbU[q.i], '#a23bc4', 1.2) + line((q) => bbL[q.i], '#a23bc4', 1.2);
  for (const q of idx) {
    const b = q.b; const x = sx(q.p.m); const up = b.c >= b.o; const col = up ? '#26c16a' : '#f23645'; const yo = sy(b.o), yc = sy(b.c);
    s += `<line x1="${(x + cw / 2).toFixed(1)}" x2="${(x + cw / 2).toFixed(1)}" y1="${sy(b.h).toFixed(1)}" y2="${sy(b.l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
    s += up ? `<rect x="${x.toFixed(1)}" y="${Math.min(yo, yc).toFixed(1)}" width="${cw.toFixed(1)}" height="${Math.max(0.8, Math.abs(yc - yo)).toFixed(1)}" fill="#000" stroke="${col}" stroke-width="0.9"/>` : `<rect x="${x.toFixed(1)}" y="${Math.min(yo, yc).toFixed(1)}" width="${cw.toFixed(1)}" height="${Math.max(0.8, Math.abs(yc - yo)).toFixed(1)}" fill="${col}"/>`;
    const vhgt = (b.v / vmax) * (vh - 14); s += `<rect x="${x.toFixed(1)}" y="${(vy0 - vhgt).toFixed(1)}" width="${cw.toFixed(1)}" height="${vhgt.toFixed(1)}" fill="${up ? 'rgba(38,193,106,.55)' : 'rgba(242,54,69,.55)'}"/>`;
  }
  s += line((q) => ema[q.i], '#ff9800', 1.5) + line((q, k) => vwap[k], '#2f55d4', 1.8);
  s += `<line x1="0" x2="${pw}" y1="${h}" y2="${h}" stroke="#2a2a2a"/><text x="4" y="${h + 12}" class="tv-t">Vol</text>`;
  const tagY = (v, lab) => { const y = sy(v); return `<rect x="${pw + 2}" y="${(y - 8).toFixed(1)}" width="${padR - 4}" height="16" rx="2" fill="#1e2f6b"/><text x="${pw + 6}" y="${(y + 4).toFixed(1)}" class="tv-tag">${lab} $${v.toFixed(dpp)}</text>`; };
  s += tagY(hi, 'H') + tagY(lo, 'L');
  for (const L of levels) { const y = sy(L.v); s += `<line x1="0" x2="${pw}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e0e5e7" stroke-width="1" stroke-dasharray="5 4"/><rect x="6" y="${(y - 17).toFixed(1)}" width="${L.w || 250}" height="15" rx="2" fill="#000" stroke="#464b52"/><text x="11" y="${(y - 6).toFixed(1)}" class="tv-tag">${esc(L.label)}</text>`; }
  s += `<text x="${pw + 6}" y="${h + vh - 8}" class="tv-t">MT</text>`;
  const last = idx.at(-1).b.c;
  s += `<text x="6" y="15" class="tv-ti">${esc(title)}</text><text x="${pw - 4}" y="15" text-anchor="end" class="tv-lg"><tspan fill="#ff9800">EMA 8</tspan>  <tspan fill="#c27be0">BB 20,2</tspan>  <tspan fill="#6f8fff">VWAP ${usd(lastV, dpp)}</tspan>  <tspan fill="#e0e5e7">last ${usd(last, dpp)}</tspan></text>`;
  return `${s}</svg>`;
}

// ---------- scatter: percentile at the last close before the flag vs sessions to resolve ----------
function scatter(ctx, sel, w = 560, h = 262) {
  const padL = 46, padB = 34, padT = 12, padR = 12; const pw = w - padL - padR, ph = h - padT - padB; const ymax = Math.max(10, Math.ceil((Math.max(...ctx.runs.map((r) => r.toRes ?? r.so ?? 0)) + 1) / 2) * 2);
  const X = (p) => padL + (p / 100) * pw, Y = (d) => padT + ph - (d / ymax) * ph;
  let s = `<svg class="sc" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="Percentile before the flag against sessions to resolve">`;
  s += `<rect x="${X(0)}" y="${padT}" width="${X(5) - X(0)}" height="${ph}" fill="rgba(228,183,110,.13)"/><rect x="${X(95)}" y="${padT}" width="${X(100) - X(95)}" height="${ph}" fill="rgba(228,183,110,.13)"/>`;
  for (let d = 0; d <= ymax; d += 2) s += `<line x1="${padL}" x2="${w - padR}" y1="${Y(d)}" y2="${Y(d)}" stroke="#1f2226"/><text x="${padL - 6}" y="${Y(d) + 4}" text-anchor="end" class="sc-a">${d} s</text>`;
  for (const p of [0, 5, 25, 50, 75, 95, 100]) s += `<line x1="${X(p)}" x2="${X(p)}" y1="${padT}" y2="${padT + ph}" stroke="#1f2226"/><text x="${X(p)}" y="${h - 18}" text-anchor="middle" class="sc-a">${p}%</text>`;
  s += `<text x="${padL + pw / 2}" y="${h - 3}" text-anchor="middle" class="sc-a">own-history stretch pctile at the last close before the flag (≤${WINDOW_MAX} sessions, past-only)</text>`;
  const jit = {};
  for (const r of ctx.runs.filter((q) => q.pFlag != null && usable(q))) {
    const tt = r.status === 'resolved' ? r.toRes : r.so; const k = `${Math.round(r.pFlag / 3)}-${tt}-${r.status === 'resolved'}`; jit[k] = (jit[k] || 0) + 1; const j = (jit[k] - 1) * 5;
    const x = X(r.pFlag) + (j % 15) - 5, y = Y(tt) - Math.floor(j / 15) * 5; const col = r.book === 'SC' ? '#e0e5e7' : '#6f8fff';
    if (r.status !== 'resolved') { s += `<g><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y.toFixed(1)}" y2="${(y - 12).toFixed(1)}" stroke="${col}" stroke-width="1.3"/><path d="M${(x - 3).toFixed(1)} ${(y - 9).toFixed(1)} L${x.toFixed(1)} ${(y - 13).toFixed(1)} L${(x + 3).toFixed(1)} ${(y - 9).toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${col}"><title>${esc(r.t)} ${r.book} OPEN ${r.pFlag}% · ${r.so} s so far</title></circle></g>`; continue; }
    s += r.book === 'SC' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="none" stroke="#e0e5e7" stroke-width="1.6"><title>${esc(r.t)} SC ${r.pFlag}% ${r.toRes} s</title></circle>` : `<rect x="${(x - 3.6).toFixed(1)}" y="${(y - 3.6).toFixed(1)}" width="7.2" height="7.2" fill="#6f8fff"><title>${esc(r.t)} ML ${r.pFlag}% ${r.toRes} s</title></rect>`;
    if (r.t === sel) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="none" stroke="#e4b76e" stroke-width="1.5"/><text x="${(x - 10).toFixed(1)}" y="${(y - 1).toFixed(1)}" text-anchor="end" class="sc-l">${esc(sel)}</text>`;
  }
  s += `<g transform="translate(${padL + 8},${padT + 6})"><rect width="370" height="20" fill="#000" stroke="#26292d"/><circle cx="12" cy="10" r="4.2" fill="none" stroke="#e0e5e7" stroke-width="1.6"/><text x="22" y="14" class="sc-a">SC</text><rect x="44" y="6.4" width="7.2" height="7.2" fill="#6f8fff"/><text x="58" y="14" class="sc-a">ML</text><line x1="88" x2="88" y1="16" y2="5" stroke="#e0e5e7" stroke-width="1.3"/><path d="M85 8 L88 4 L91 8" fill="none" stroke="#e0e5e7" stroke-width="1.3"/><text x="96" y="14" class="sc-a">open (so far, still rising)</text><rect x="300" y="5" width="10" height="10" fill="rgba(228,183,110,.3)"/><text x="314" y="14" class="sc-a">≤5 / ≥95</text></g>`;
  return `${s}</svg>`;
}

// ---------- the whole tab ----------
// snap = history-mr.json; ui = { book: 'ALL'|'SC'|'ML', trig: 'ANY'|'TI'|'MOVER'|'DAS', from, to, open: Set(ticker|id) }; live = { count } | null
export function renderHistory(snap, ui = {}, live = null) {
  const U = { book: 'ALL', trig: 'ANY', from: '', to: '', open: null, ...ui };
  const runs = snap.runs || [];
  const stats = buildStats(runs); const ctx = { runs, stats };
  const SP = snap.span; const pulled = snap.runsPulledAt || snap.builtAt;
  const pulledTxt = mtStamp(pulled); const pulledDay = mtDate(pulled);
  const resolvedAll = runs.filter((r) => r.status === 'resolved').sort((a, b) => b.resolved.localeCompare(a.resolved) || a.t.localeCompare(b.t));
  const open = runs.filter((r) => r.status !== 'resolved');
  const chart = snap.chart; const chartRun = chart ? resolvedAll.find((r) => r.t === chart.t && r.flag === chart.day) : null;
  const defaultOpen = (chartRun || resolvedAll[0]) ? (chartRun || resolvedAll[0]).id : null;
  const openSet = U.open || new Set(defaultOpen != null ? [defaultOpen] : []);
  const passFilter = (r) => (U.book === 'ALL' || r.book === U.book) && (U.trig === 'ANY' || (r.trig || []).includes(U.trig)) && (!U.from || r.flag >= U.from) && (!U.to || r.flag <= U.to);
  const resolved = resolvedAll.filter(passFilter);
  const openF = open.filter(passFilter);
  const S = stats;
  const medR = (b) => { const v = resolvedMedian(runs, b); return v == null ? 'n/a' : v; };
  const barsThrough = snap.barsThrough;
  const minuteEnd = snap.sources?.minuteStoreEndsMT ? mtStamp(snap.sources.minuteStoreEndsMT) : null;
  const guardFixed = (snap.guardList || []).filter((e) => e.kind !== 'jump kept'); const guardKept = (snap.guardList || []).filter((e) => e.kind === 'jump kept');
  const quiet = guardKept.filter((e) => e.vr != null && e.vr <= 1.5);
  const liveDiff = live && live.count != null && live.count !== runs.length;

  const rowR = (r) => `<tr class="rowc ${goldRow(r) ? 'ext' : ''} ${openSet.has(r.id) ? 'sel' : ''}" data-hx-row="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${openSet.has(r.id)}"><td class="l"><b>${esc(r.t)}</b>${gTag(r) ? '<span class="gmk">Guard</span>' : ''}</td><td class="l">${r.book}</td><td class="l">${r.dir === 'up' ? 'up' : 'down'}</td><td class="l">${trigTags(r)}</td><td class="l">${dmd(r.flag)}<br><span class="rb">${r.rank?.pre ? `rank ${dmd(r.rank.d)}` : r.rank?.d ? 'rank same day' : 'no rank'}</span></td>${d4(r.rank?.stretch, 3, xx)}<td class="n">${pcell(r, 50)}</td><td class="n">${price(r.peak)}</td><td class="n">${sN(r.toPeak)}</td><td class="n">${sN(r.toRes)}</td>${d4(r.runSize, 100)}<td class="l">${REASON[r.reason] || 'n/a'}</td><td class="l">${(r.trig || []).includes('DAS') ? '<b>DAS</b>' : 'no'}</td><td class="l">${dmd(r.resolved)}</td></tr>${openSet.has(r.id) ? `<tr class="exrow"><td colspan="14">${explainer(r, ctx)}</td></tr>` : ''}`;
  const tableR = resolved.length ? resolved.map(rowR).join('') : '<tr><td colspan="14" class="l">No resolved runs match these filters.</td></tr>';
  const cardR = (r) => `<div class="pc ${goldRow(r) ? 'ext' : ''}" data-hx-row="${esc(r.id)}"><div class="pc-h"><b>${esc(r.t)} <span class="tagb">${r.book}</span> ${trigTags(r)}</b><span>${dmd(r.flag)} → ${dmd(r.resolved)}</span></div><div class="pc-g"><div><em>Stretch before flag</em>${xx(r.rank?.stretch)} · ${r.pFlag == null ? 'n/a' : `${r.pFlag.toFixed(1)}% of ${r.pN} s`}</div><div><em>To resolve</em>${ss(r.toRes)}</div><div><em>Run size</em><span class="${r.runSize >= 0 ? 'cu' : 'cd'}">${pct(r.runSize)}</span></div><div><em>Peak</em>${price(r.peak)} · ${sN(r.toPeak)}</div><div><em>Resolved by</em>${REASON[r.reason] || 'n/a'}</div><div><em>Traded</em>${(r.trig || []).includes('DAS') ? 'DAS' : 'no'}</div></div>${openSet.has(r.id) ? explainer(r, ctx) : ''}</div>`;

  const cellB = (x) => (x.n ? `<td class="n">${x.n}${x.shortWin ? `<span class="win">${x.shortWin} &lt;${GOLD_MIN_WINDOW} s</span>` : ''}</td><td class="n">${x.res}</td><td class="n">${x.open}</td><td class="n"><b>${kmText(x)}</b></td>${d4(x.runSize, 100)}` : '<td class="n">0</td><td class="n">0</td><td class="n">0</td><td class="n">n/a</td><td class="n na">n/a</td>');
  const bandTable = BANDS.map((lab, k) => `<tr class="${k === 0 || k === 4 ? 'ext' : ''}"><td class="l"><b>${lab}</b></td>${cellB(S.SC.bands[k])}${cellB(S.ML.bands[k])}</tr>`).join('')
    + `<tr><td class="l" colspan="11" style="white-space:normal">RES. = resolved. Median to resolve = Kaplan-Meier, open runs counted; &gt; N s = over half still open at the longest follow-up. Run size = median peak ÷ run start − 1. &lt;${GOLD_MIN_WINDOW} s = runs ranked on a short own window.</td></tr>`
    + `<tr class="tot"><td class="l"><b>All runs</b></td>${cellB(S.SC.all)}${cellB(S.ML.all)}</tr>`;

  const openRows = openF.map((r) => { const B = r.pFlag != null ? S[r.book].bands[bandIdx(r.pFlag)] : null; return { r, bm: B ? bandAtAge(runs, r, B) : null }; })
    .sort((a, b) => (b.r.so ?? -1) - (a.r.so ?? -1) || a.r.t.localeCompare(b.r.t));
  const dist = (r) => (r.book === 'SC' ? d4(r.eod?.lastCloseVsStartPct, 100, pct, 'dist') : `<td class="n dist">${num(r.eod?.lastAtr5d) ? `${xx(r.eod.lastAtr5d)} ATR / 5D` : 'n/a'}</td>`);
  const tableO = openRows.length ? openRows.map(({ r, bm }) => `<tr class="${goldRow(r) ? 'ext' : ''}"><td class="l"><b>${esc(r.t)}</b>${gTag(r) ? '<span class="gmk">Guard</span>' : ''}</td><td class="l">${r.book}</td><td class="l">${esc(r.dir)}</td><td class="l">${trigTags(r)}</td><td class="l">${dmd(r.flag)}</td><td class="n">${pcell(r, 42)}</td><td class="n">${r.so == null ? 'n/a' : `${r.so} s`}</td><td class="n">${bm == null ? 'n/a' : `${(bm.s * 100).toFixed(0)}%<span class="ar"> · ${bm.atRisk} at risk</span>`}</td>${d4(r.runSize, 100)}${dist(r)}<td class="l">${esc(r.status)}</td></tr>`).join('') : '<tr><td colspan="11" class="l">No open runs match these filters.</td></tr>';

  const openSC = open.filter((r) => r.book === 'SC').length, openML = open.length - openSC;
  const tradedN = resolvedAll.filter((r) => (r.trig || []).includes('DAS')).length;
  const extAll = runs.filter(goldRow); const ext95 = resolvedAll.filter(goldRow);
  const flagDays = new Set(runs.map((r) => r.flag)).size;
  const tile = (h, v, sub, extra = '') => `<div class="tile ${extra}"><div class="t-h"><b>${h}</b></div><div class="t-v">${v}</div><div class="t-f">${sub}</div></div>`;
  const straddleNames = [...S.SC.straddle, ...S.ML.straddle];
  const toggle = (key, opts, cur) => `<span class="toggle" role="group">${opts.map(([v, l]) => `<a class="${cur === v ? 'on' : ''}" role="button" tabindex="0" data-hx-${key}="${v}" aria-pressed="${cur === v}">${l}</a>`).join('')}</span>`;
  const B5 = S.SC.bands[4]; const MB5 = S.ML.bands[4];
  const banner = `MR read, open runs counted (${SP.sessions} closes, ${dmd(SP.from)} → ${dmd(pulledDay)}; descriptive only, not an edge claim): SC runs whose last close before the flag sat at <b>≥95% of their own stretch</b>: <b>${B5.res} resolved, ${B5.open} open</b>, median to resolve <b>${kmText(B5)}</b>${B5.km.bound && B5.n ? ' (more than half still open at the longest follow-up)' : ''} vs <b>${kmText(S.SC.all)}</b> for all SC (${S.SC.all.res} resolved, ${S.SC.all.open} open) · ML ≥95%: ${MB5.res} resolved, ${MB5.open} open, median <b>${kmText(MB5)}</b> vs <b>${kmText(S.ML.all)}</b> all ML`;

  const levels = chartRun ? [{ v: chartRun.start, label: `run start ${price(chartRun.start)} · resolve level${chartRun.resolved ? ` (hit ${dshort(chartRun.resolved)})` : ''}`, w: 330 }] : [];
  const chartCard = chart && chartRun
    ? `<div class="card"><div class="sec-k">FLAG SESSION · ${esc(chart.t)} · ${dshort(chart.day).toUpperCase()} · 2m · MT</div><h2>${esc(chart.t)} on the day it was flagged</h2><div class="sub">2m candles, extended hours shaded, EMA 8, BB 20,2, VWAP incl. extended hours, volume pane, H / L tags, $ + % scale. Dashed line = the run-start resolve level. No fills drawn${(chartRun.trig || []).includes('DAS') ? ' (the DAS fill log is not part of this snapshot)' : ' (not traded)'}. Minute store ends ${minuteEnd || 'n/a'}, so a chart exists only for runs flagged on or before then; this one is the newest resolved run it covers.</div>
${tvChart(chart.bars.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })), chart.day, { w: 760, h: 360, vh: 80, title: `${chart.t} · 2m · ${dshort(chart.day)} ${chart.day.slice(0, 4)}`, levels })}</div>`
    : `<div class="card"><div class="sec-k">Flag session chart</div><h2>No minute chart for these runs</h2><div class="sub">The local minute store has no 2m bars for a resolved run's flag session yet (it ends ${minuteEnd || 'before the first flag'}). A chart for any run needs the chart-bars service, which is not called from this tab.</div></div>`;
  const ipdn = resolvedAll.find((r) => (r.trig || []).includes('TI') && r.flagDay && r.book === 'SC' && r.flagDay.chg < IN_PLAY_RULES.SC.moverMinChangePct)
    || resolvedAll.find((r) => (r.trig || []).includes('TI') && r.flagDay && r.book === 'ML' && Math.abs(r.flagDay.oneDayAtr ?? 0) < IN_PLAY_RULES.ML.moverMinOneDayAtr && Math.abs(r.flagDay.atr5d ?? 0) < IN_PLAY_RULES.ML.moverMinAbsAtr5d);
  const whyNot = ipdn ? `<div class="card"><div class="sec-k">Check another · why not</div><h2>${esc(ipdn.t)} · in play, but not as a MOVER</h2><div class="sub">Same check on a run that came in on a Trade Ideas hit without passing the MOVER rule. The failing rule is named, with its value.</div>${explainer(ipdn, ctx, { compact: true })}</div>` : '';
  const shortest = Math.min(...runs.filter((r) => r.pN).map((r) => r.pN));

  // ---------- quick view (Oct 19 2026 board skin v2, shared .sk kit): head, read sentence, 5 tiles, newest resolved + MR lens side by side ----------
  const kq = (x) => { // kmText → short tile/cell value + its support, display only (same Kaplan-Meier result)
    const t = kmText(x); let m;
    if ((m = /^(\d+) s$/.exec(t))) return { v: m[1], n: +m[1], sup: '' };
    if ((m = /^> (\d+) s$/.exec(t))) return { v: `&gt; ${m[1]}`, n: +m[1], sup: 'over half still open' };
    if ((m = /^more than (\d+) sessions \((.*)\)$/.exec(t))) return { v: `&gt; ${m[1]}`, n: +m[1], sup: m[2].replace(/ resolved runs?/, ' resolved').replace(' still at risk', ' at risk').replace(', ', ' · ') };
    return { v: esc(t), n: null, sup: '' };
  };
  const sessW = (q) => (q.n === 1 && !q.v.startsWith('&gt;') ? 'session' : 'sessions');
  const kLong = (x) => { const q = kq(x); return `${q.v.replace('&gt; ', 'more than ')} ${sessW(q)}`; };
  const kCell = (x) => { if (!x.n) return '<td>n/a</td>'; const q = kq(x); return `<td>${q.v} sess${q.sup ? `<small>${esc(q.sup)}</small>` : ''}</td>`; };
  const qSC = kq(S.SC.all), qML = kq(S.ML.all), qB5 = kq(B5);
  const usableN = runs.filter(usable).length;
  const maxRun = Math.max(1, ...resolvedAll.map((r) => Math.abs(r.runSize ?? 0)));
  const dbw = (v) => (!num(v) ? 0 : Math.max(4, Math.round(Math.sqrt(Math.abs(v) / maxRun) * 100)));
  const QN = 13; const quickRuns = resolvedAll.slice(0, QN); const older = resolvedAll.slice(QN);
  const olderFlags = older.map((r) => r.flag).sort();
  const xrow = (r) => {
    const { rows } = ruleRows(r); const f = r.flagDay;
    const chip = (ok) => `<span class="chip">${ok == null ? 'n/a' : ok ? 'PASS' : 'NO'}</span>`;
    const rt = rows.map(([k, v, rule, ok]) => `<tr><th>${k}</th><td>${v}</td><td>${rule}</td><td>${chip(ok)}</td></tr>`).join('');
    const note = `Resolved by the ${r.book} rule: ${resolveText(r)}. Run start ${price(r.start)} → peak ${price(r.peak)} = ${pct(r.runSize)} in ${ss(r.toPeak)}; resolved in ${ss(r.toRes)}.${f ? ` Daily ATR14 at flag ${usd(f.atr, 4)}.` : ''}${r.pFlag != null ? ` Stretch ${xx(r.rank?.stretch)} ATR = ${r.pFlag.toFixed(1)}% of its own last ${r.pN} sessions (past-only).` : ''}${gTag(r) ? ` ${gTag(r)}` : ''}`;
    const isChart = chart && chartRun && chartRun.id === r.id;
    const right = isChart
      ? `${tvChart(chart.bars.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })), chart.day, { w: 560, h: 300, vh: 70, title: `${chart.t} · 2m · ${dshort(chart.day)} ${chart.day.slice(0, 4)}`, levels })}<p class="cap">${esc(chart.t)} 2m · ${dshort(chart.day)} · dashed line = run-start resolve level · times MT</p>`
      : `<p class="note">No 2m chart for this run: the local minute store ends ${minuteEnd || 'n/a'}, so only runs flagged on or before then have one${chartRun ? ` (newest covered: ${esc(chartRun.t)})` : ''}.</p>`;
    return `<tr class="xrow"><td colspan="7"><div class="grid2 xgrid"><div><div class="tw"><table class="t"><thead><tr><th class="l">Rule (${r.book} book)</th><th>Flag-day value</th><th>Rule</th><th>Result</th></tr></thead><tbody>${rt}</tbody></table></div><p class="note">${note}</p></div><div>${right}</div></div></td></tr>`;
  };
  const qRow = (r) => {
    const op = openSet.has(r.id); const st = r.rank?.stretch;
    return `<tr class="click${goldRow(r) ? ' ext' : ''}${op ? ' open' : ''}" data-hx-row="${esc(r.id)}" tabindex="0" role="button" aria-expanded="${op}"><th>${esc(r.t)}<span class="chip">${r.book} · ${r.dir === 'up' ? 'up' : 'down'}</span></th><td class="opt">${dmd(r.flag)}</td>`
      + `<td><span class="${cls(st)}">${xx(st)}</span> <span class="t2">· ${r.pFlag == null ? 'no rank' : `${r.pFlag.toFixed(1)}% pctl`}</span></td>`
      + `<td><span class="db ${cls(r.runSize)}"><span><span class="${cls(r.runSize)}">${pct(r.runSize)}</span></span><i style="width:${dbw(r.runSize)}%"></i></span></td>`
      + `<td>${r.toRes == null ? 'n/a' : `${r.toRes} sess`}</td><td class="l opt">${REASON[r.reason] || 'n/a'}</td><td class="opt">${(r.trig || []).includes('DAS') ? '<span class="chip">traded</span>' : '—'}</td></tr>${op ? xrow(r) : ''}`;
  };
  const lensCells = (x, withSize) => (x.n ? `<td>${x.n}<small>${x.res} · ${x.open}</small></td>${kCell(x)}${withSize ? `<td class="opt ${cls(x.runSize)}">${pct(x.runSize)}</td>` : ''}` : `<td>0</td><td>n/a</td>${withSize ? '<td class="opt">n/a</td>' : ''}`);
  const lensRows = BANDS.map((lab, k) => `<tr class="${k === 0 || k === 4 ? 'ext' : ''}"><th>${lab}</th>${lensCells(S.SC.bands[k], true)}${lensCells(S.ML.bands[k], false)}</tr>`).join('')
    + `<tr class="base"><th>All runs</th>${lensCells(S.SC.all, true)}${lensCells(S.ML.all, false)}</tr>`;
  const straddleTxt = straddleNames.length ? `: ${runs.filter((r) => r.straddle?.length).map((r) => `${esc(r.t)} (${r.book}, ${r.status === 'resolved' ? 'resolved' : 'open'})`).join(', ')} ${straddleNames.length === 1 ? 'is' : 'are'} left out because a reverse split${runs.find((r) => r.straddle?.length)?.straddle?.[0] ? ` on ${dmd(runs.find((r) => r.straddle?.length).straddle[0])}` : ''} sits inside the run` : '';
  const noP = S.SC.noP + S.ML.noP;
  const qTile = (k, v, s, extra = '', title = '') => `<div class="tile${extra ? ` ${extra}` : ''}"${title ? ` title="${esc(title)}"` : ''}><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const quick = `<div class="head"><h1>History</h1><span class="meta">Resolved multi-day runs · SC and ML tracked separately · flags ${dshort(SP.from)} → ${dshort(SP.to)} MT · closes through ${dshort(SP.barsThrough)} · pulled ${pulledTxt}</span></div>
<p class="read">${resolvedAll.length} runs have resolved and ${open.length} are still open. Small caps take <b>${kLong(S.SC.all)}</b> (median) to come back to the run start; mid/large take <b>${kLong(S.ML.all)}</b>. <span class="t2">Data: ${liveDiff ? `snapshot holds ${runs.length} of ${live.count} live runs` : `snapshot holds ${runs.length} runs`} · 2m bars end ${minuteEnd || 'n/a'}.</span></p>
<div class="strip">
${qTile('Resolved runs', `${resolvedAll.length} <small>runs</small>`, `SC ${resolvedAll.filter((r) => r.book === 'SC').length} · ML ${resolvedAll.filter((r) => r.book === 'ML').length} · ${flagDays} flag sessions`)}
${qTile('Open now', `${open.length} <small>runs</small>`, `SC ${openSC} · ML ${openML} · ${open.filter((r) => r.status === 'running').length} running · ${open.filter((r) => r.status === 'fading').length} fading`)}
${qTile('Median sessions to resolve', `${qSC.v} <small>SC</small> · ${qML.v} <small>ML</small>`, 'open runs counted (Kaplan-Meier)', '', `Resolved-only medians would say SC ${medR('SC')} s, ML ${medR('ML')} s`)}
${qTile('Most stretched SC flags', `${qB5.v} <small>sessions</small>`, `at ≥95% pctl vs ${qSC.v} for all SC · ${B5.res} resolved · ${B5.open} still open · Kaplan-Meier`, 'ext mr', kmText(B5))}
${qTile('Traded in DAS', `${tradedN} <small>runs</small>`, resolvedAll.filter((r) => (r.trig || []).includes('DAS')).map((r) => esc(r.t)).join(' · ') || 'none')}
</div>
<div class="grid2 wide-left">
<section class="panel"><h2>Resolved runs · newest first</h2><p class="sub">Click a row for the rule check and its 2m chart · gold row = flagged at ≤5% or ≥95% of its own stretch history (window ${GOLD_MIN_WINDOW}+ sessions)</p><div class="tw"><table class="t"><thead><tr><th class="l">Ticker · book</th><th class="opt">Flagged</th><th>Stretch before flag<small>× ATR from 8EMA · own 2-yr pctl</small></th><th>Run size<small>start → peak</small></th><th>To resolve</th><th class="l opt">Resolved by</th><th class="opt">DAS</th></tr></thead><tbody>
${quickRuns.map(qRow).join('')}${older.length ? `<tr class="more"><td colspan="7">+ ${older.length} older resolved runs · flagged ${dmd(olderFlags[0])} → ${dmd(olderFlags.at(-1))} MT · all in Deep view</td></tr>` : ''}</tbody></table></div></section>
<section class="panel"><h2>Mean-reversion lens: does a more stretched flag take longer to come back?</h2><p class="sub">Stretch = (close − EMA8) ÷ ATR14 at the last close before the flag, ranked in the name's own past</p><div class="tw"><table class="t"><thead><tr class="grp"><th></th><th colspan="3">SC · small caps</th><th colspan="2">ML · mid / large</th></tr>
<tr><th class="l">Stretch pctl before flag</th><th>Runs<small>resolved · open</small></th><th>Median to resolve</th><th class="opt">Median run size</th><th>Runs</th><th>Median to resolve</th></tr></thead><tbody>${lensRows}</tbody></table></div>
<p class="note">Median to resolve is Kaplan-Meier: open runs count as "at least this long"; "&gt; N sess" = more than half still open past N sessions, with its support underneath. ${usableN} of ${runs.length} runs${straddleTxt}.${noP ? ` ${noP} usable run${noP === 1 ? ' has' : 's have'} no own-history rank and sit only in All runs.` : ''} ${SP.sessions}-close sample, descriptive only, not an edge claim.</p></section>
</div>`;

  return `<div class="sk">${quick}
<details class="deep"><summary>Deep view <span>the 2-hour read · all 14 columns + filters (book, trigger, flagged dates) · scatter · "why not" checker · open runs · split guard · data receipts · definitions</span></summary><div class="body"><div class="hx">
<div class="stamps">Runs: <b>tracked_runs</b> table, pulled <b>${pulledTxt}</b> (${runs.length} runs) · <b>sample span ${dshort(SP.from)} → ${dshort(pulledDay)}</b>: flags ${dshort(SP.from)} → ${dshort(SP.to)}, closes through ${dshort(SP.barsThrough)} = <b>${SP.sessions} closes</b> · daily bars through <b>${dshort(barsThrough)}</b> · 2m bars through <b>${minuteEnd || 'n/a'}</b></div>
<div class="stamps">${banner}</div>
<div class="tiles">
${tile('Resolved runs', `${resolvedAll.length} runs`, `SC ${resolvedAll.filter((r) => r.book === 'SC').length} · ML ${resolvedAll.filter((r) => r.book === 'ML').length} · ${flagDays} flag sessions`)}
${tile('Open on NOW', `${open.length} runs`, `SC ${openSC} · ML ${openML} · ${open.filter((r) => r.status === 'running').length} running · ${open.filter((r) => r.status === 'fading').length} fading`)}
${tile('Median sessions to resolve', `SC ${kmText(S.SC.all)} · ML ${kmText(S.ML.all)}`, `open runs counted (Kaplan-Meier) · resolved-only would say SC ${medR('SC')} s, ML ${medR('ML')} s`)}
${tile('Sample span', `${SP.sessions} closes`, `flags ${dmd(SP.from)} → ${dmd(SP.to)} · closes through ${dmd(SP.barsThrough)} · pulled ${dmd(pulledDay)}`)}
${tile('Flagged at an own-history extreme', `${extAll.length} runs`, `≤5% or ≥95% at the close before the flag, window ≥${GOLD_MIN_WINDOW} s · ${ext95.length} resolved`, 'extc')}
${tile('Traded in DAS', `${tradedN} runs`, `${resolvedAll.filter((r) => (r.trig || []).includes('DAS')).map((r) => esc(r.t)).join(' · ') || 'none'} · from the run triggers`)}
</div>
<div class="fbrow">
${badge('tracked_runs', `pulled ${pulledTxt}`, liveDiff ? 'STALE' : 'FRESH', liveDiff ? `live table has ${live.count} runs, this snapshot ${runs.length}` : `${resolvedAll.length} resolved · ${open.length} open`)}
${badge('Daily bars (grouped)', `through ${dshort(barsThrough)}`, 'FRESH', 'stretch + percentile + rule values')}
${badge('2m minute store', minuteEnd ? `last bar ${minuteEnd}` : 'n/a', 'STALE', 'chart only for runs flagged on or before then')}
${badge('Sample span', `${dmd(SP.from)} → ${dmd(pulledDay)} · ${SP.sessions} closes`, 'INFO', 'small sample · descriptive only')}
${badge('Split / bad-print guard', `${guardFixed.length} fixed · ${guardKept.length} jumps kept`, 'INFO', 'reverse splits adjusted · bad prints dropped')}
</div>
<div class="g2">
<div class="card">
<div class="hrow"><div><div class="sec-k">Resolved · newest on top · click a row to check it</div><h2>Resolved runs <span class="cnt">${resolved.length} of ${resolvedAll.length}</span></h2></div><div class="ctl">${toggle('book', [['ALL', 'ALL'], ['SC', 'SC'], ['ML', 'ML']], U.book)}${toggle('trig', [['ANY', 'ANY TRIGGER'], ['TI', 'TI'], ['MOVER', 'MOVER'], ['DAS', 'DAS']], U.trig)}<label class="fld">flagged <input type="date" data-hx-from value="${esc(U.from)}" min="${SP.from}" max="${SP.to}"> → <input type="date" data-hx-to value="${esc(U.to)}" min="${SP.from}" max="${SP.to}"></label></div></div>
<div class="sub">Stretch = (close − EMA8) ÷ ATR14 at the <b>last close before the flag</b>: a pre-market or intraday flag is ranked on the prior session's close, an end-of-day flag on that day's close. Pctile = that reading's rank in the name's own history, past-only; <b>"of N s" = the real window</b> (up to ${WINDOW_MAX} sessions; boxed = under ${GOLD_MIN_WINDOW}). Run size = peak ÷ run start − 1, heat green + / red −. Gold row = ≤5% or ≥95% on a window of ${GOLD_MIN_WINDOW}+ sessions. GUARD = a split or bad print was fixed in the window.</div>
<div class="wide-only tblw"><table class="t rt"><thead><tr><th class="l">Ticker</th><th class="l">Book</th><th class="l">Dir</th><th class="l">Why in play</th><th class="l">Flagged</th><th>Stretch<br>Before flag</th><th>Own pctile · window</th><th>Peak</th><th>TO<br>Peak</th><th>TO<br>Resolve</th><th>Run size<br>Start → peak</th><th class="l">Resolved by</th><th class="l">Traded</th><th class="l">Resolved</th></tr></thead><tbody>${tableR}</tbody></table></div>
<div class="phone-only">${resolved.slice(0, 12).map(cardR).join('')}${resolved.length > 12 ? `<div class="more">Showing 12 of ${resolved.length} · widen the filters or open on a wide screen for all</div>` : ''}</div>
</div>
<div class="rcol">
${chartCard}
<div class="card"><div class="sec-k">MEAN-REVERSION LENS · PERCENTILE BEFORE THE FLAG vs SESSIONS TO RESOLVE</div><h2>Does a more stretched flag take longer to come back?</h2>
<div class="sub">Each dot = one resolved run; an arrow = a run still open, plotted at the sessions it has been open so far (it can only go higher). Median to resolve is Kaplan-Meier: open runs count as "at least this long", so a band where most runs are still open reads <b>&gt; N s</b>. ${runs.length} runs over a ${SP.sessions}-close sample (${dmd(SP.from)} → ${dmd(pulledDay)}): no run can show more than ${SP.sessions - 1} sessions yet. Descriptive only, not an edge claim.${straddleNames.length ? ` ${straddleNames.length} run left out: ${straddleNames.map(esc).join(', ')} (its $ levels sit on both sides of a reverse split).` : ''}</div>
${scatter(ctx, chartRun?.t)}
<div class="tblw"><table class="t bt"><thead><tr><th class="l" rowspan="2">Pctile before flag</th><th colspan="5" class="grp">SC · small caps</th><th colspan="5" class="grp">ML · mid / large</th></tr><tr><th>n</th><th>Res.</th><th>Open</th><th>Median<br>To resolve</th><th>Run<br>Size</th><th>n</th><th>Res.</th><th>Open</th><th>Median<br>To resolve</th><th>Run<br>Size</th></tr></thead><tbody>${bandTable}</tbody></table></div>
</div>
${whyNot}
<div class="card"><div class="sec-k">Split / bad-print guard · tracked names · since oct 2024</div><h2>Bars fixed before ranking</h2><div class="sub">Jump = a close &gt; 2.60× or &lt; 0.38× the prior close. Reverse split = up-jump on volume at or below the prior day with the whole bar above 2× the prior high: earlier bars are scaled by the ratio. Bad print = a jump undone the next session on no volume burst: the bar is dropped. Every other jump is kept as a real move: ${guardKept.length} of them, ${guardKept.length - quiet.length} on volume above 1.5× the prior day and ${quiet.length} on 1.5× or less (not dropped: only a jump the next open reverses, with no volume burst, is a bad print). All are listed in the data file.</div>
<div class="tblw"><table class="t gt"><thead><tr><th class="l">Ticker</th><th class="l">Session</th><th class="l">Kind</th><th>Close jump</th><th class="l">Action</th><th class="l">Runs affected</th></tr></thead><tbody>${guardFixed.length ? guardFixed.map((e) => `<tr><td class="l"><b>${esc(e.t)}</b></td><td class="l">${dshort(e.d)}</td><td class="l">${esc(e.kind)}</td><td class="n">${xx(e.r)}</td><td class="l">${esc(e.act)}</td><td class="l">${runs.filter((r) => r.t === e.t).map((r) => `${dmd(r.flag)} ${r.straddle.includes(e.d) ? 'out of stats' : r.guardEv.some((g) => g.d === e.d) ? 'ranked on fixed bars' : 'not in window'}`).join(' · ') || 'no tracked run'}</td></tr>`).join('') : '<tr><td colspan="6" class="l">No split or bad print found.</td></tr>'}</tbody></table></div></div>
</div>
</div>
<div class="card" style="margin-top:10px"><div class="sec-k">STILL OPEN · ${openF.length} RUNS · LONGEST OPEN FIRST</div><h2>Open runs vs the history above</h2><div class="sub">Sessions open = sessions since the first flag. Band still open at this age = Kaplan-Meier share of runs in the same book and percentile band that had not resolved by this many sessions, with the number of runs observed that long (at risk). It describes the band; it is not a timer for this run. Distance to resolve: SC = last close vs the run start (0.00% resolves); ML = last ATR / 5D (under 2.00× resolves, or a 20EMA touch).</div>
<div class="tblw"><table class="t ot"><thead><tr><th class="l">Ticker</th><th class="l">Book</th><th class="l">Dir</th><th class="l">Why in play</th><th class="l">Flagged</th><th>Own pctile · window</th><th>Sessions<br>Open</th><th>Band still open<br>At this age</th><th>Run size<br>Start → peak</th><th>Distance<br>To resolve</th><th class="l">Status</th></tr></thead><tbody>${tableO}</tbody></table></div></div>
<details class="foot" open><summary><b>Sources &amp; definitions</b></summary>
<b>Runs</b> = Supabase <code>tracked_runs</code> (the rows the old table below reads), pulled ${pulledTxt}. <b>Rules</b> = <code>in-play.mjs</code>: SC MOVER = change ≥ +${IN_PLAY_RULES.SC.moverMinChangePct}% AND $ volume ≥ ${dv(IN_PLAY_RULES.SC.moverMinDollarVolume)} (up only); ML MOVER = one-day move ≥ ${IN_PLAY_RULES.ML.moverMinOneDayAtr}× daily ATR either way OR |ATR / 5D| ≥ ${IN_PLAY_RULES.ML.moverMinAbsAtr5d}. Resolve: SC = close back to the close before D1; ML = |ATR / 5D| under 2 or a daily 20EMA touch. <b>Flag-day values</b> are recomputed from the daily close; a name flagged live intraday met the rule on the intraday reading, so its close can sit under the threshold, and the check says so. <b>Stretch</b> = (close − EMA8) ÷ Wilder ATR14. <b>Own pctile</b> = share of the name's last ≤${WINDOW_MAX} sessions, up to and including the last close before the flag, at or below that reading; each cell prints its real window (the shortest here is ${Number.isFinite(shortest) ? shortest : 'n/a'} s). Close = 16:00 ET = 14:00 MT (the build reads the New York clock, so the daylight-saving change is handled); a flag stamped before the close on its flag date is ranked on the prior close. <b>Median to resolve</b> = Kaplan-Meier with open runs censored at their sessions open. <b>Run size</b> replaces "max off peak". <b>2m chart</b> from the local minute store. Times MT.
</details>
</div></div></details>
</div>`;
}

// ---------- CSS: written against the mockup's palette and scoped under .hx so the live board's styles are untouched ----------
const RAW_CSS = String.raw`
.hx{--hx-bg:#191c1f;--hx-panel:#191c1f;--hx-panel2:#202428;--hx-line:#26292d;--hx-line2:#464b52;--hx-row:#1b1d20;--hx-text:#e0e5e7;--hx-text2:#bec7cd;--hx-green:#51c083;--hx-red:#e17272;--hx-gold:#e4b76e;--hx-goldfill:rgba(228,183,110,.12);
--hx-mono:"Segoe UI Variable Text","Segoe UI",Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;--hx-sans:"Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;color:var(--hx-text);font:500 13px/1.4 var(--hx-sans);min-width:0;max-width:100%}
.hx *{box-sizing:border-box}
.hx .kick{font:600 12px/1.3 var(--hx-mono);letter-spacing:0;color:var(--hx-text2);margin:2px 0 3px}
.hx h1{font:600 26px/1.15 var(--hx-sans);margin:0 0 4px;letter-spacing:0;color:var(--hx-text)}.hx h1 small{font:600 13px var(--hx-mono);color:var(--hx-text2);margin-left:10px;letter-spacing:0}
.hx .stamps{font:600 12.5px/1.5 var(--hx-mono);color:var(--hx-text2);margin:0 0 8px}.hx .stamps b{color:var(--hx-text)}
.hx .fbrow{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.hx .fb{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--hx-line2);border-radius:5px;padding:4px 8px;font:600 11.5px/1.25 var(--hx-mono);color:var(--hx-text2);background:var(--hx-panel)}
.hx .fb b{color:var(--hx-text);font-weight:600}.hx .fb em{font-style:normal;font:600 10.5px/1 var(--hx-mono);letter-spacing:0;padding:2px 5px;border-radius:3px;border:1px solid var(--hx-line2);color:var(--hx-text)}
.hx .fb-stale{border-style:dashed;border-color:#8a8f96}.hx .fb-stale em{background:#2a2b2e}.hx .fbn{color:var(--hx-text2)}
.hx .card{background:var(--hx-panel);border:1px solid var(--hx-line);border-radius:8px;padding:10px 12px 12px;min-width:0}
.hx .card h2{font:600 16px/1.2 var(--hx-sans);margin:0;color:var(--hx-text);letter-spacing:0;text-transform:none}.hx .card h2 .cnt{font:600 12px var(--hx-mono);color:var(--hx-text2);margin-left:8px}
.hx .card .sub{font:500 12.5px/1.45 var(--hx-sans);color:var(--hx-text2);margin:3px 0 8px}
.hx .sec-k{font:600 11.5px/1.3 var(--hx-mono);letter-spacing:0;color:var(--hx-text2)}
.hx .toggle{display:inline-flex;border:1px solid var(--hx-line2);border-radius:5px;overflow:hidden}.hx .toggle a{padding:5px 10px;font:600 11.5px/1 var(--hx-mono);color:var(--hx-text2);border-right:1px solid var(--hx-line2);cursor:pointer;letter-spacing:0;text-decoration:none}.hx .toggle a:last-child{border-right:0}
.hx .toggle a.on{color:var(--hx-text);background:rgba(228,183,110,.10);box-shadow:inset 0 -2px 0 var(--hx-gold)}
.hx table.t{width:100%;border-collapse:collapse;font:600 12.5px/1.25 var(--hx-mono);background:transparent;color:var(--hx-text)}
.hx table.t th{font:600 10.5px/1.2 var(--hx-mono);letter-spacing:0;color:var(--hx-text2);text-align:right;padding:6px 7px;border-bottom:1px solid var(--hx-line2);white-space:nowrap;vertical-align:bottom;background:var(--hx-panel);position:static}
.hx table.t th.l,.hx table.t td.l{text-align:left}.hx table.t td{padding:5px 7px;border-bottom:1px solid var(--hx-row);text-align:right;white-space:nowrap;color:var(--hx-text);background:transparent}
.hx table.t tr:hover td{background:rgba(228,183,110,.05)}.hx table.t tr.rowc{cursor:pointer}
.hx td.n{font-variant-numeric:tabular-nums}.hx td.na,.hx .na{color:var(--hx-text2)}
.hx .d4{position:relative}.hx .d4 span{position:relative;z-index:1}.hx .d4 i{position:absolute;right:7px;bottom:2px;height:2px;max-width:calc(100% - 14px);border-radius:1px}
.hx td.d4.up{color:var(--hx-green)}.hx td.d4.dn{color:var(--hx-red)}.hx td.d4.up i{background:rgba(81,192,131,.9)}.hx td.d4.dn i{background:rgba(225,114,114,.9)}
.hx td.d4.x5{font-weight:600}.hx td.d4.x5.up{background:rgba(81,192,131,.07)}.hx td.d4.x5.dn{background:rgba(225,114,114,.08)}
.hx tr.ext td{background:var(--hx-goldfill)}.hx tr.ext td:first-child{box-shadow:inset 3px 0 0 var(--hx-gold)}
.hx .pbw{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end}.hx .pb{position:relative;display:inline-block;height:6px;border-radius:3px;border:1px solid var(--hx-line2);background:linear-gradient(90deg,#1c1e21,#2c3036 50%,#1c1e21)}
.hx .pb i{position:absolute;top:-3px;width:3px;height:10px;margin-left:-1.5px;background:var(--hx-text);border-radius:1px}.hx .pb.pbx{border-color:var(--hx-gold)}.hx .pb.pbx i{background:var(--hx-gold)}
.hx .pbn{font:600 12px/1 var(--hx-mono);color:var(--hx-text);min-width:44px;text-align:right}
.hx .foot{margin-top:12px;border:1px solid var(--hx-line);border-radius:8px;background:var(--hx-panel);padding:10px 14px;font:500 12px/1.55 var(--hx-sans);color:var(--hx-text2)}.hx .foot b{color:var(--hx-text)}
.hx .phone-only{display:none}
.hx .pc{border:1px solid var(--hx-line);border-radius:7px;background:var(--hx-panel);padding:8px 10px;margin:0 0 6px;cursor:pointer}
.hx .pc-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.hx .pc-h b{font:600 14px var(--hx-mono)}.hx .pc-h span{font:600 11px var(--hx-mono);color:var(--hx-text2)}
.hx .pc-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;margin-top:5px;font:600 12px/1.3 var(--hx-mono)}.hx .pc-g div{min-width:0}.hx .pc-g em{display:block;font:600 9.5px/1.2 var(--hx-mono);color:var(--hx-text2);font-style:normal;letter-spacing:0}
.hx .pc.ext{background:linear-gradient(var(--hx-goldfill),var(--hx-goldfill)),var(--hx-panel);box-shadow:inset 3px 0 0 var(--hx-gold);border-color:rgba(228,183,110,.45)}
.hx .banner{border:1px solid rgba(228,183,110,.55);background:var(--hx-goldfill);box-shadow:inset 3px 0 0 var(--hx-gold);border-radius:6px;padding:7px 12px;margin:0 0 10px;font:600 12.5px/1.5 var(--hx-mono);color:var(--hx-text)}
.hx .tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:10px}
.hx .tile{background:var(--hx-panel);border:1px solid var(--hx-line);border-radius:8px;padding:9px 11px 10px;min-width:0;display:flex;flex-direction:column;gap:3px}.hx .tile.extc{border-color:rgba(228,183,110,.6);background:var(--hx-goldfill);box-shadow:inset 3px 0 0 var(--hx-gold)}
.hx .t-h{font:600 12.5px/1.25 var(--hx-sans)}.hx .t-v{font:600 22px/1.15 var(--hx-mono)}.hx .t-f{font:600 11.5px/1.4 var(--hx-mono);color:var(--hx-text2)}
.hx .g2{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:10px;align-items:start}.hx .g2>*{min-width:0}.hx .rcol{display:flex;flex-direction:column;gap:10px;min-width:0}
.hx .hrow{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap}.hx .ctl{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.hx .fld{font:600 11.5px var(--hx-mono);color:var(--hx-text2);border:1px solid var(--hx-line2);border-radius:5px;padding:3px 8px;display:inline-flex;gap:4px;align-items:center}
.hx .fld input{height:22px;border:1px solid var(--hx-line2);border-radius:3px;background:#202428;color:var(--hx-text);font:600 11.5px var(--hx-mono);color-scheme:dark;padding:0 3px;max-width:128px}
.hx .tg{display:inline-block;margin-right:3px;border:1px solid var(--hx-line2);border-radius:3px;padding:1px 4px;font:600 9.5px/1.2 var(--hx-mono);letter-spacing:0;color:var(--hx-text)}
.hx .tg-ti{background:#1d2633;border-color:#3e5878}.hx .tg-mover{background:#202020}.hx .tg-das{background:#252016;border-color:#6b5a3a}.hx .tg-me{background:#1f1d28}
.hx .tagb{display:inline-block;border:1px solid var(--hx-line2);border-radius:3px;padding:0 5px;font:600 10px/1.5 var(--hx-mono);color:var(--hx-text);margin-right:3px}
.hx table.t tr.sel td{background:rgba(228,183,110,.10)}.hx table.t tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--hx-gold)}
.hx table.t tr.exrow td{padding:0 6px 8px;white-space:normal;text-align:left;background:#272c31}
.hx .chk{border:1px solid var(--hx-line2);border-radius:7px;background:var(--hx-panel2);padding:9px 11px;margin:4px 0 2px;font:500 12.5px/1.5 var(--hx-sans);white-space:normal;text-align:left}
.hx .chk.chk-x{box-shadow:inset 3px 0 0 var(--hx-gold);border-color:rgba(228,183,110,.5)}
.hx .chk-h{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}.hx .chk-h>b{font:600 15px var(--hx-mono);margin-right:4px}.hx .chk-s{font:600 11.5px var(--hx-mono);color:var(--hx-text2);margin-left:auto}
.hx .chk-why{font:600 12.5px/1.5 var(--hx-mono);margin:5px 0 4px}.hx .chk-why b{color:var(--hx-text)}
.hx table.chk-t{margin:2px 0 6px}.hx table.chk-t td{padding:3px 7px}
.hx b.ok,.hx b.no{display:inline-block;min-width:42px;text-align:center;border-radius:3px;padding:1px 5px;font:600 10.5px/1.3 var(--hx-mono);letter-spacing:0}
.hx b.ok{border:1px solid #e0e5e7;color:#000;background:#e0e5e7}.hx b.no{border:1px dashed #8a8f96;color:var(--hx-text)}
.hx .chk-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;font:600 12px/1.35 var(--hx-mono);margin:4px 0 6px}.hx .chk-g em{display:block;font:600 10px/1.3 var(--hx-mono);color:var(--hx-text2);font-style:normal;letter-spacing:0}
.hx .chk-res,.hx .mrl{font:600 12px/1.5 var(--hx-mono);margin-top:4px}.hx .mrl{border-top:1px dashed var(--hx-line2);padding-top:5px}
.hx .mrk{display:inline-block;font:600 9.5px/1.4 var(--hx-mono);letter-spacing:0;border:1px solid var(--hx-gold);border-radius:3px;padding:0 4px;color:var(--hx-text);background:var(--hx-goldfill);margin-right:4px}
.hx .win{display:block;text-align:right;margin-top:1px;font:600 10px var(--hx-mono);color:var(--hx-text2)}.hx .win.wsh{border:1px dashed #8a8f96;border-radius:3px;padding:0 3px;color:var(--hx-text);display:inline-block;float:right}
.hx table.rt td,.hx table.rt th{padding:4px 4px}.hx table.gt td:last-child{white-space:normal}.hx table.bt td,.hx table.bt th{padding:4px 5px}
.hx .rb{font:600 10px var(--hx-mono);color:var(--hx-text2)}.hx .gmk{display:inline-block;margin-left:4px;font:600 8.5px/1.3 var(--hx-mono);border:1px solid #8a8f96;border-radius:3px;padding:0 3px;color:var(--hx-text)}.hx .gd{font:600 11px var(--hx-mono);border:1px dashed #8a8f96;border-radius:3px;padding:0 4px}
.hx .k2{color:var(--hx-text2)}
.hx .pc{display:block}.hx .pc b{min-width:0;text-align:inherit}.hx table.t tbody td{font:inherit}.hx table.t tbody th{font:inherit;text-align:inherit}
.hx .sc{display:block;margin:2px 0 8px}.hx .sc-a{fill:#d6d6d6;font:600 10.5px var(--hx-mono)}.hx .sc-l{fill:#fff;font:600 11px var(--hx-mono)}
.hx table.bt th.grp{text-align:center;border-bottom:1px solid var(--hx-line2)}.hx table.bt tr.tot td{border-top:1px solid var(--hx-line2)}
.hx .tblw{overflow-x:auto}.hx .more{border:1px dashed var(--hx-line2);border-radius:6px;padding:7px;text-align:center;font:600 11.5px var(--hx-mono);margin-bottom:8px}.hx .cu{color:var(--hx-green)}.hx .cd{color:var(--hx-red)}
.hx details.foot summary{cursor:pointer;margin-bottom:4px}.hx code{font:600 11.5px var(--hx-mono);color:var(--hx-text)}
.hx .tv{display:block;border:1px solid #1f1f1f;border-radius:6px}.hx .tv-ax{fill:#e6e6e6;font:600 11px var(--hx-mono)}.hx .tv-t{fill:#d6d6d6;font:600 10.5px var(--hx-mono)}.hx .tv-tag{fill:#fff;font:600 11px var(--hx-mono)}.hx .tv-ti{fill:#fff;font:600 12.5px var(--hx-mono)}.hx .tv-lg{font:600 11.5px var(--hx-mono)}
@media (max-width:1500px){.hx .g2{grid-template-columns:1fr}.hx .tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:640px){.hx .wide-only{display:none!important}.hx .phone-only{display:block}.hx h1{font-size:21px}.hx h1 small{display:block;margin:2px 0 0}.hx .stamps{font-size:11.5px}.hx .fb{font-size:10.5px;flex-wrap:wrap;max-width:100%}
 .hx .tiles{grid-template-columns:1fr 1fr;gap:6px}.hx .t-v{font-size:17px}.hx .tile{padding:7px 8px}.hx .banner{font-size:11.5px}
 .hx table.chk-t th:nth-child(3),.hx table.chk-t td:nth-child(3){display:none}.hx table.chk-t{font-size:11px}.hx .chk-g{grid-template-columns:1fr 1fr}.hx .chk-s{margin-left:0}
 .hx table.ot th:nth-child(n+2):nth-child(-n+5),.hx table.ot td:nth-child(n+2):nth-child(-n+5),.hx table.ot th:nth-child(9),.hx table.ot td:nth-child(9),.hx table.ot th:nth-child(11),.hx table.ot td:nth-child(11){display:none}
 .hx table.bt td:nth-child(6),.hx table.bt td:nth-child(11),.hx table.bt tr:nth-child(2) th:nth-child(5),.hx table.bt tr:nth-child(2) th:nth-child(10){display:none}.hx table.gt th:nth-child(4),.hx table.gt td:nth-child(4){display:none}.hx table.gt td{white-space:normal}
 .hx table.chk-t td{white-space:normal}.hx table.bt th,.hx table.ot th{white-space:normal}.hx table.bt td,.hx table.ot td{font-size:10px}.hx table.bt td,.hx table.bt th,.hx table.ot td,.hx table.ot th{padding:4px 2px}.hx table.bt th,.hx table.ot th{font-size:9px;letter-spacing:0}.hx table.bt .pbw,.hx table.ot .pbw{gap:3px}.hx table.ot .pb{width:34px!important}.hx .chk{padding:8px 8px}
 .hx table.t{font-size:11px}.hx table.t td,.hx table.t th{padding:4px 4px}.hx table.bt .win{display:none}.hx table.ot .win{font-size:8.5px}.hx table.ot .pb{width:28px!important}.hx table.ot td,.hx table.ot th{padding:4px 2px 4px 4px}.hx table.ot .ar{display:none}.hx .ctl{gap:4px}.hx .fld input{max-width:104px}}`;
export const CSS = RAW_CSS;

// ---------- mount ----------
export function mountHistory(host, opts = {}) {
  if (!host) return null;
  if (typeof document !== 'undefined' && !document.getElementById('historyTabCss')) {
    const st = document.createElement('style'); st.id = 'historyTabCss'; st.textContent = CSS; document.head.appendChild(st);
  }
  const ui = { book: 'ALL', trig: 'ANY', from: '', to: '', open: null };
  let snap = null;
  const draw = () => {
    if (!snap) return;
    const deepOpen = host.querySelector?.('details.deep')?.open || false; // keep Deep view open across a row toggle / filter re-render
    host.innerHTML = renderHistory(snap, ui, { count: opts.liveCount ? opts.liveCount() : null });
    if (deepOpen) { const d = host.querySelector?.('details.deep'); if (d) d.open = true; }
  };
  const toggleRow = (id) => {
    const key = snap.runs.find((r) => String(r.id) === String(id))?.id; if (key == null) return;
    if (!ui.open) { ui.open = new Set(); const d = snap.chart ? snap.runs.find((r) => r.t === snap.chart.t && r.flag === snap.chart.day) : null; if (d) ui.open.add(d.id); }
    if (ui.open.has(key)) ui.open.delete(key); else ui.open.add(key);
    draw();
  };
  host.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-hx-book]'); if (b) { ui.book = b.dataset.hxBook; return draw(); }
    const t = e.target.closest?.('[data-hx-trig]'); if (t) { ui.trig = t.dataset.hxTrig; return draw(); }
    if (e.target.closest?.('input')) return;
    const r = e.target.closest?.('[data-hx-row]'); if (r) toggleRow(r.dataset.hxRow);
  });
  host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-hx-row],[data-hx-book],[data-hx-trig]')) { e.preventDefault(); e.target.click(); } });
  host.addEventListener('change', (e) => {
    if (e.target.matches?.('[data-hx-from]')) { ui.from = e.target.value; draw(); }
    if (e.target.matches?.('[data-hx-to]')) { ui.to = e.target.value; draw(); }
  });
  const load = fetch('./data/history-mr.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`history-mr.json HTTP ${r.status}`); return r.json(); }).then((j) => {
    if (!j?.runs || !j.span) throw new Error('history-mr.json is missing runs or span');
    snap = j; draw();
  });
  return { ready: load, refresh: draw };
}
