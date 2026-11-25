import { tvcAttr } from './chart-core.mjs?v=V2.23.1'; // node-safe: returns '' without a DOM
// RC2 C3b (Nov 24 2026): pure helpers + candle chart for the Gamma, ER moves and Short vol RC2 blocks.
// No DOM access here, so node tests can import it. Raw primitives only: no scores, no grades, no buy/sell words.
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const MINUS = '−';
const sgn = (v) => (v < 0 ? MINUS : v > 0 ? '+' : '');
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const px = (p) => (!isNum(p) ? 'not measured' : '$' + (Math.abs(p) >= 1000 ? p.toFixed(0) : Math.abs(p) >= 10 ? p.toFixed(2) : p.toFixed(3)));
export const usd = (v, signed = true) => {
  if (!isNum(v)) return 'not measured';
  const a = Math.abs(v), s = signed ? sgn(v) : v < 0 ? MINUS : '';
  const body = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : a.toFixed(0);
  return s + '$' + body;
};
export const pc = (v, d = 1, signed = true) => (!isNum(v) ? 'not measured' : (signed ? sgn(v) : v < 0 ? MINUS : '') + Math.abs(v).toFixed(d) + '%');
export const xx = (v, d = 2, signed = true) => (!isNum(v) ? 'not measured' : (signed ? sgn(v) : v < 0 ? MINUS : '') + Math.abs(v).toFixed(d) + '×');
export const int = (v) => (!isNum(v) ? 'not measured' : Math.round(v).toLocaleString('en-US'));
export const shares = (v) => (!isNum(v) ? 'not measured' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B sh' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M sh' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K sh' : Math.round(v) + ' sh');

// ---------- time (display in MT, 12-hour; session logic in ET) ----------
const MT_T = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true });
const MT_D = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric' });
const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ET_D = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const tMT = (ms) => MT_T.format(new Date(ms)) + ' MT';
export const dMT = (ms) => MT_D.format(new Date(ms)).replace(',', '');
export const dtMT = (ms) => `${dMT(ms)} ${tMT(ms)}`;
export const dayLbl = (iso) => (!iso ? 'not measured' : new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).replace(',', ''));
export const etDay = (ms) => ET_D.format(new Date(ms));
export const etMin = (ms) => { const [h, m] = ET_HM.format(new Date(ms)).split(':').map(Number); return (h % 24) * 60 + m; };
export const isExt = (ms) => { const m = etMin(ms); return m < 570 || m >= 960; }; // regular = 9:30 AM to 4:00 PM ET = 7:30 AM to 2:00 PM MT
export const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso + 'T12:00:00Z') - Date.parse(fromIso + 'T12:00:00Z')) / 864e5);

// ---------- studies ----------
export function ema(vals, n) { const k = 2 / (n + 1); const out = []; let e = null; for (const v of vals) { e = e == null ? v : v * k + e * (1 - k); out.push(e); } return out; }
export function bb(vals, n = 20, m = 2) {
  return vals.map((_, i) => { if (i < n - 1) return null; const w = vals.slice(i - n + 1, i + 1); const mu = w.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(w.reduce((a, b) => a + (b - mu) ** 2, 0) / n); return [mu - m * sd, mu, mu + m * sd]; });
}
// VWAP that resets each ET day and includes the extended hours (bars = [t, o, h, l, c, v]).
export function vwap(bars) { let day = null, pv = 0, vv = 0; return bars.map((b) => { const d = etDay(b[0]); if (d !== day) { day = d; pv = 0; vv = 0; } const tp = (b[2] + b[3] + b[4]) / 3; pv += tp * b[5]; vv += b[5]; return vv ? pv / vv : tp; }); }

// ---------- options math ----------
// Max pain over the listed strikes: the settle price S (taken from the strike list) that minimises the total intrinsic value
// paid to option holders, Σ callOI × max(0, S − k) + putOI × max(0, k − S). strikes = [{k, coi, poi}].
export function maxPain(strikes) {
  const ks = (strikes || []).filter((s) => isNum(s.k) && (s.coi > 0 || s.poi > 0));
  if (!ks.length) return null;
  let best = null;
  for (const c of ks) { let pay = 0; for (const s of ks) pay += (s.coi || 0) * Math.max(0, c.k - s.k) + (s.poi || 0) * Math.max(0, s.k - c.k); if (!best || pay < best.pay) best = { k: c.k, pay }; }
  return best && { k: best.k, pay: best.pay * 100 };
}
// Strikes where the session's volume on a side was at least its open interest (volume > OI marks).
export function volOverOi(strikes) { const out = []; for (const s of strikes || []) { if (s.cv > 0 && s.cv >= (s.coi || 0)) out.push({ k: s.k, side: 'C', v: s.cv, oi: s.coi || 0 }); if (s.pv > 0 && s.pv >= (s.poi || 0)) out.push({ k: s.k, side: 'P', v: s.pv, oi: s.poi || 0 }); } return out; }
// Relative volume vs the mean of earlier sessions (hist excludes today). Returns {x, avg, n}.
export function relVol(today, hist) { const h = (hist || []).filter((v) => isNum(v) && v > 0); if (!isNum(today) || !h.length) return { x: null, avg: null, n: h.length }; const avg = h.reduce((a, b) => a + b, 0) / h.length; return { x: avg ? today / avg : null, avg, n: h.length }; }
// Share of values at or below x, in % (the board's percentile rule).
export function pctAtOrBelow(arr, x) { const v = (arr || []).filter(isNum); if (!v.length || !isNum(x)) return null; return v.filter((a) => a <= x).length / v.length * 100; }
// How many of a level series equal its last value (a level "held" across builds). tol in $.
export function heldCount(series, tol = 0) { const v = series.filter(isNum); if (!v.length) return { same: 0, n: 0 }; const last = v[v.length - 1]; return { same: v.filter((a) => Math.abs(a - last) <= tol).length, n: v.length }; }
export const capBucket = (cap) => (!isNum(cap) ? null : cap < 2e9 ? 'small' : cap <= 10e9 ? 'mid' : 'large');
export const EXCLUDE = ['SNDK', 'SENEA']; // split artefacts: counted, never named on the page

// ---------- candle chart (his TradingView standard) ----------
// bars [t, o, h, l, c, v] in ms. levels [{y, color, dash, label}]. fills [{t, y, side:'B'|'S'}] (none on these feeds).
export function candleSvg(bars, { w = 900, h = 520, levels = [], ref = null, ext = true, timeLbl = (ms) => MT_T.format(new Date(ms)), tag = '2m', ticker = '' } = {}) {
  if (!bars || bars.length < 2) return `<div class="r2t2-nobars">No ${esc(tag)} bars on this page for this name.</div>`;
  const all = bars, C = all.map((b) => b[4]);
  const E8 = ema(C, 8), BB = bb(C, 20, 2), VW = tag === '2m' ? vwap(all) : null;
  const vis = ext ? all.map((_, i) => i) : all.map((b, i) => (isExt(b[0]) ? -1 : i)).filter((i) => i >= 0);
  if (vis.length < 2) return `<div class="r2t2-nobars">No regular-session bars yet for this session.</div>`;
  const PL = 8, PR = 74, PT = 16, VOLH = Math.round(h * 0.16), GAP = 8, PB = 22, PH = h - PT - VOLH - GAP - PB;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (const i of vis) { lo = Math.min(lo, all[i][3]); hi = Math.max(hi, all[i][2]); vmax = Math.max(vmax, all[i][5]); }
  const inRange = levels.filter((l) => isNum(l.y) && l.y >= lo - (hi - lo) * 0.6 && l.y <= hi + (hi - lo) * 0.6);
  let y0 = Math.min(lo, ...inRange.map((l) => l.y)), y1 = Math.max(hi, ...inRange.map((l) => l.y)); const pad = (y1 - y0) * 0.04 || 1; y0 -= pad; y1 += pad;
  const n = vis.length, step = (w - PL - PR) / n, bw = Math.max(1, Math.min(9, step * 0.7));
  const X = (j) => PL + step * (j + 0.5), Y = (v) => PT + (1 - (v - y0) / (y1 - y0)) * PH, VY = (v) => PT + PH + GAP + VOLH - (vmax ? v / vmax * VOLH : 0);
  // R38: in the page this static SVG is swapped for the board's one shared interactive chart (chart-core.mjs).
  const tvc = tvcAttr(vis.map((i) => all[i]), { tf: tag === '2m' ? '2m' : 'D', ticker, ref, refName: 'the prior close', defaultCount: vis.length, levels: levels.map((l) => ({ ...l })) });
  let s = `<svg${tvc} class="r2t2-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="${esc(tag)} candles">`;
  s += `<rect x="0" y="0" width="${w}" height="${h}" fill="#000"/>`;
  // extended hours shaded lighter
  let runStart = null; vis.forEach((i, j) => { const e = isExt(all[i][0]); if (e && runStart == null) runStart = j; if ((!e || j === n - 1) && runStart != null) { const end = e ? j : j - 1; s += `<rect x="${(X(runStart) - step / 2).toFixed(1)}" y="${PT}" width="${(step * (end - runStart + 1)).toFixed(1)}" height="${PH + GAP + VOLH}" fill="#14171b"/>`; runStart = null; } });
  // grid + $ scale + % scale
  const span = y1 - y0, raw = span / 6, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((q) => q >= raw);
  for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) { const yy = Y(v).toFixed(1); s += `<path d="M${PL} ${yy}H${w - PR}" stroke="#1c2024"/><text x="${w - PR + 4}" y="${(+yy + 4).toFixed(1)}" fill="#e0e5e7" font-size="11">${px(v)}</text>${isNum(ref) && ref ? `<text x="${w - 4}" y="${(+yy + 4).toFixed(1)}" fill="#bec7cd" font-size="10" text-anchor="end">${pc((v / ref - 1) * 100, 1)}</text>` : ''}`; }
  // time axis: one label per hour
  let lastH = null; vis.forEach((i, j) => { const t = all[i][0], hh = new Date(t).getUTCHours(); if (hh !== lastH && new Date(t).getUTCMinutes() < 2) { lastH = hh; s += `<text x="${X(j).toFixed(1)}" y="${h - 6}" fill="#bec7cd" font-size="10" text-anchor="middle">${timeLbl(t)}</text>`; } });
  // levels
  for (const l of inRange) { const yy = Y(l.y).toFixed(1); s += `<path d="M${PL} ${yy}H${w - PR}" stroke="${l.color}" stroke-width="1.2" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''}/><text x="${w - PR - 4}" y="${(+yy - 3).toFixed(1)}" fill="${l.color}" font-size="10.5" text-anchor="end">${esc(l.label)} ${px(l.y)}</text>`; }
  // levels outside the visible range: named at the pane edge with their distance (never dropped silently)
  const off = levels.filter((l) => isNum(l.y) && !inRange.includes(l));
  const lastC = all[vis[vis.length - 1]][4];
  const ab = off.filter((l) => l.y > y1), be = off.filter((l) => l.y < y0);
  if (ab.length) s += `<text x="${PL + 6}" y="${PT + 12}" fill="#e0e5e7" font-size="11">Above the pane: ${ab.map((l) => `${esc(l.label)} ${px(l.y)} (${pc((l.y / lastC - 1) * 100, 1)})`).join(' · ')}</text>`;
  if (be.length) s += `<text x="${PL + 6}" y="${PT + (ab.length ? 28 : 12)}" fill="#e0e5e7" font-size="11">Below the pane: ${be.map((l) => `${esc(l.label)} ${px(l.y)} (${pc((l.y / lastC - 1) * 100, 1)})`).join(' · ')}</text>`;
  // BB, EMA, VWAP lines
  const line = (arr, pick, color, wd = 1.3) => { let d = ''; vis.forEach((i, j) => { const v = pick(arr[i]); if (!isNum(v)) return; d += (d ? 'L' : 'M') + X(j).toFixed(1) + ' ' + Y(v).toFixed(1); }); return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${wd}"/>` : ''; };
  s += line(BB, (b) => b && b[2], '#a23bc4', 1) + line(BB, (b) => b && b[1], '#a23bc4', 0.8) + line(BB, (b) => b && b[0], '#a23bc4', 1);
  s += line(E8, (v) => v, '#ff9800', 1.4);
  if (VW) s += line(VW, (v) => v, '#2f6bff', 1.6);
  // candles + volume
  vis.forEach((i, j) => { const [, o, hh, ll, c, v] = all[i]; const up = c >= o, col = up ? '#51c083' : '#e17272', x = X(j);
    s += `<path d="M${x.toFixed(1)} ${Y(hh).toFixed(1)}V${Y(Math.max(o, c)).toFixed(1)}M${x.toFixed(1)} ${Y(Math.min(o, c)).toFixed(1)}V${Y(ll).toFixed(1)}" stroke="${col}"/>`;
    const top = Y(Math.max(o, c)), ht = Math.max(1, Math.abs(Y(o) - Y(c)));
    s += up ? `<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${ht.toFixed(1)}" fill="#000" stroke="${col}"/>` : `<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${ht.toFixed(1)}" fill="${col}"/>`;
    s += `<rect x="${(x - bw / 2).toFixed(1)}" y="${VY(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(PT + PH + GAP + VOLH - VY(v)).toFixed(1)}" fill="${up ? '#2a5a41' : '#6a3434'}"/>`; });
  // High / Low tags
  let hiJ = 0, loJ = 0; vis.forEach((i, j) => { if (all[i][2] > all[vis[hiJ]][2]) hiJ = j; if (all[i][3] < all[vis[loJ]][3]) loJ = j; });
  const tagAt = (j, v, above) => { const x = Math.min(w - PR - 60, Math.max(PL + 2, X(j) - 28)); const yy = above ? Y(v) - 6 : Y(v) + 14; return `<text x="${x.toFixed(1)}" y="${yy.toFixed(1)}" fill="#e0e5e7" font-size="11" font-weight="600">${above ? 'High' : 'Low'} ${px(v)}</text>`; };
  s += tagAt(hiJ, all[vis[hiJ]][2], true) + tagAt(loJ, all[vis[loJ]][3], false);
  s += `<text x="${PL + 4}" y="${PT + PH + GAP + 11}" fill="#bec7cd" font-size="10">Volume</text>`;
  return s + '</svg>';
}
