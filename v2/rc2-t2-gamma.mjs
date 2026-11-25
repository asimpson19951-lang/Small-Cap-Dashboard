// RC2 C3b Gamma block (TG1, TG5, TG6, TG7, TG10). Self-wiring: mounts #r2Gamma above #gammaRoot in the Gamma tab.
// Reads static files only (gamma.json, mrmap.json, rc2-t2.json), so a Supabase 500 / 503 never blanks it.
import { isNum, esc, px, usd, pc, xx, int, tMT, dMT, dtMT, dayLbl, etDay, isExt, maxPain, heldCount, candleSvg, EXCLUDE } from './rc2-t2-lib.mjs?v=V2.23.1';
import { loadJson } from './rc2-t2-data.mjs?v=V2.23.1';

import { infoChip } from './info-chip.mjs?v=V2.23.1';
const LS = 'rc2.gamma';
const S = Object.assign({ sym: 'SPY', chart: 'SPY', sess: null, ext: false, cap: 'all', all: false, build: null }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })());
const save = () => { try { const { sym, chart, ext, cap } = S; localStorage.setItem(LS, JSON.stringify({ sym, chart, ext, cap })); } catch { /* private mode */ } };
const CHART_SYMS = ['SPY', 'QQQ', 'IWM'];
const cls = (v) => (!isNum(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');

export function model(g, mm, t2) {
  const col = mm && Array.isArray(mm.cols) ? Object.fromEntries(mm.cols.map((c, i) => [c, i])) : null;
  const mmRow = col ? Object.fromEntries(mm.rows.map((r) => [r[0], r])) : {};
  const excluded = g.tickers.filter((t) => EXCLUDE.includes(t.t)).length;
  const rows = g.tickers.filter((t) => !EXCLUDE.includes(t.t)).map((t) => {
    const r = mmRow[t.t]; const mx = r && isNum(r[col.x]) ? r[col.x] : null;
    const sx = mx != null ? mx : t.kind === 'index' && isNum(t.stretch_x) ? t.stretch_x : null;
    const fx = isNum(t.flip) && t.atr14 > 0 ? (t.flip - t.spot) / t.atr14 : null;
    const mpf = t2 && t2.gamma.maxpain ? t2.gamma.maxpain[t.t] : null; const mp = mpf ? { k: mpf[0] } : maxPain(t.strikes);
    return { t: t.t, kind: t.kind, bkt: t.bkt ? String(t.bkt).toLowerCase() : t.kind === 'index' ? 'etf' : null, spot: t.spot, atr: t.atr14, flip: t.flip, fx, cw: t.call_wall, cwx: t.call_wall_dist_x, pw: t.put_wall, pwx: t.put_wall_dist_x, abs: t.abs_strike, net: t.net_gex, gated: t.greeks_ok === false,
      sx, sxSrc: mx != null ? 'mr' : sx != null ? 'gamma' : null, spc: r && isNum(r[col.pc]) ? r[col.pc] : null, mp: mp ? mp.k : null, mpx: mp && t.atr14 > 0 ? (mp.k - t.spot) / t.atr14 : null };
  });
  return { g, rows, excluded, t2 };
}
export function sideTables(rows, cap = 'all') {
  const f = rows.filter((r) => cap === 'all' || r.bkt === cap || (cap === 'large' && r.bkt === 'etf'));
  const byFlip = (a, b) => (a.fx == null) - (b.fx == null) || Math.abs(a.fx ?? 0) - Math.abs(b.fx ?? 0);
  return { short: f.filter((r) => r.sx > 0).sort(byFlip), long: f.filter((r) => r.sx < 0).sort(byFlip), none: f.filter((r) => r.sx == null || r.sx === 0) };
}

function tg5(ir) {
  const tile = (k, v, p, lo, hi, now, hist, fmt) => {
    const ext = isNum(p) && (p <= 5 || p >= 95);
    const pos = isNum(now) && hi > lo ? Math.max(0, Math.min(1, (now - lo) / (hi - lo))) : null;
    const vals = hist.filter(isNum), mx = Math.max(...vals.map(Math.abs)) || 1;
    const bw = 100 / vals.length;
    const bars = k.startsWith('S&P') ? vals.map((v, i) => `<rect x="${(i * bw + bw * 0.15).toFixed(2)}" y="${v >= 0 ? (20 - v / mx * 20).toFixed(2) : 20}" width="${(bw * 0.7).toFixed(2)}" height="${Math.max(0.4, Math.abs(v) / mx * 20).toFixed(2)}" fill="${v >= 0 ? '#51c083' : '#e17272'}"/>`).join('')
      : (() => { const lo2 = Math.min(...vals), hi2 = Math.max(...vals); return vals.map((v, i) => { const hh = 4 + (v - lo2) / ((hi2 - lo2) || 1) * 36; return `<rect x="${(i * bw + bw * 0.15).toFixed(2)}" y="${(40 - hh).toFixed(2)}" width="${(bw * 0.7).toFixed(2)}" height="${hh.toFixed(2)}" fill="#8fa3b8"/>`; }).join(''); })();
    return `<div class="r2t2-tile${ext ? ' ext' : ''}"><div class="k">${k}</div><div class="v">${v}</div>
      <div class="r2t2-range"><i style="left:${pos == null ? 0 : (pos * 100).toFixed(1)}%"></i></div>
      <div class="s"><span>${fmt(lo)}</span><b>${pc(p, 1, false)} 2-yr pctl</b><span>${fmt(hi)}</span></div>
      <svg class="r2t2-tbars" viewBox="0 0 100 40" preserveAspectRatio="none">${bars}</svg><div class="s">${vals.length} sessions to ${dayLbl(ir.date)} · bars ${k.startsWith('S&P') ? 'green above $0, red below' : 'scaled to the window'}</div></div>`;
  };
  return `<div class="r2t2-tg5">${tile(`S&amp;P 500 GEX · SqueezeMetrics · ${dayLbl(ir.date)}`, `${usd(ir.gex_usd)} <small>per 1%</small>`, ir.gex_pctl2y, ir.gex_lo2y, ir.gex_hi2y, ir.gex_usd, ir.hist.map((h) => h[1]), (v) => usd(v))}
    ${tile(`DIX dark-pool buy share · ${dayLbl(ir.date)}`, pc(ir.dix_pct, 1, false), ir.dix_pctl2y, ir.dix_lo2y, ir.dix_hi2y, ir.dix_pct, ir.hist.map((h) => h[2]), (v) => pc(v, 1, false))}</div>`;
}

function sideTable(title, sub, rows, key) {
  const cap = S.all ? rows.length : 12;
  const cell = (v, x) => `<td class="${cls(x)}">${px(v)}<small>${xx(x)} ATR</small></td>`;
  return `<div class="r2t2-side"><div class="r2t2-sh"><h3>${title}</h3><span>${sub} · ${rows.length} names</span></div><div class="r2t2-tw"><table class="r2t2-t">
  <thead><tr><th class="l">Name</th><th>Stretch<small>× ATR vs 8 EMA</small></th><th>Flip<small>$ · × ATR away</small></th><th>Call wall<small>$ · × ATR</small></th><th>Put wall<small>$ · × ATR</small></th><th>Net GEX<small>$ per 1%</small></th></tr></thead><tbody>
  ${rows.slice(0, cap).map((r) => `<tr class="clk${S.sym === r.t ? ' sel' : ''}${isNum(r.spc) && (r.spc <= 5 || r.spc >= 95) ? ' goldrow' : ''}" data-r2g-sym="${r.t}" tabindex="0"><th class="l">${r.t}<em class="bk">${r.bkt || 'cap not measured'}</em></th>
    <td class="${cls(r.sx)}">${xx(r.sx)}<small>${isNum(r.spc) ? pc(r.spc, 1, false) + ' 2-yr pctl' : r.sxSrc === 'gamma' ? 'gamma build close' : 'pctl not measured'}</small></td>
    ${r.gated ? '<td>greeks gated<small>this build</small></td>' : isNum(r.flip) ? cell(r.flip, r.fx) : '<td>no flip<small>within ±15%</small></td>'}${cell(r.cw, r.cwx)}${cell(r.pw, r.pwx)}
    <td class="${cls(r.net)}">${r.gated ? 'gated' : usd(r.net)}</td></tr>`).join('')}
  </tbody></table></div>${rows.length > 12 ? `<button type="button" class="r2t2-more" data-r2g-all>${S.all ? 'Show 12' : `Show all ${rows.length}`}</button>` : ''}</div>`;
}

function buildsFor(M, sym) {
  const B = M.t2.gamma.builds, L = M.t2.gamma.levels[sym] || [];
  return B.map((b, i) => ({ ...b, i, ms: Date.parse(b.spot_asof), bt: Date.parse(b.built_at), lv: L[i] })).filter((b) => b.lv);
}
// RC2 fix #3: one level set per tab. The header and tables read gamma.json; the chart and replay default to that same
// build (matched on built_at). Only a replay pick moves them to another build, and the caption then says which.
export function headerBuild(M, bl) {
  const t = Date.parse(M.g.built_at);
  return bl.find((b) => b.bt === t) || bl.find((b) => Math.abs(b.bt - t) < 120000) || null;
}
export function chartBuild(M, sym, pick) {
  const bl = buildsFor(M, sym);
  const hb = headerBuild(M, bl);
  const cur = pick != null ? bl.find((b) => b.i === pick) || null : null;
  return { bl, hb, cur, use: cur || hb || bl[bl.length - 1] || null };
}
function chartBlock(M, w) {
  const by = M.t2.bars2m.by[S.chart] || [];
  const days = [...new Set(by.map((b) => etDay(b[0])))].sort();
  if (!days.includes(S.sess)) S.sess = days.includes(M.g.levels_for_session) ? M.g.levels_for_session : days[days.length - 1];
  const prevDays = days.filter((d) => d < S.sess); const prevReg = by.filter((b) => prevDays.length && etDay(b[0]) === prevDays[prevDays.length - 1] && !isExt(b[0]));
  // RC2 fix #13: the % scale uses the official daily close from gamma.json when it is the prior session, not the last 2m bar.
  const dClose = S.sess === M.g.levels_for_session ? M.g.tickers.find((t) => t.t === S.chart)?.close : null;
  const ref = isNum(dClose) ? dClose : prevReg.length ? prevReg[prevReg.length - 1][4] : null;
  const bars = by.filter((b) => etDay(b[0]) === S.sess);
  const { hb, cur: pick, use } = chartBuild(M, S.chart, S.sym === S.chart ? S.build : null);
  const cur = pick && hb && pick.i === hb.i ? null : pick;
  const lv = use ? use.lv : null;
  const levels = lv ? [{ y: lv[1], color: '#51c083', dash: '6 4', label: 'Call wall' }, { y: lv[2], color: '#e17272', dash: '6 4', label: 'Put wall' }, { y: lv[3], color: '#e0e5e7', dash: '2 3', label: 'Flip' }, { y: lv[4], color: '#b9c0c7', dash: '4 3', label: 'Abs-γ' }] : [];
  const nReg = bars.filter((b) => !isExt(b[0])).length;
  const svg = candleSvg(bars, { w, h: w < 600 ? 360 : 520, levels, ref, ext: S.ext, ticker: S.chart });
  const pulled = M.t2.bars2m.pulled_at ? Date.parse(M.t2.bars2m.pulled_at) : null;
  return `<div class="r2t2-panel r2t2-chartp"><div class="r2t2-ph"><h2>${S.chart} · 2-minute candles with the gamma levels</h2>
    <div class="r2t2-ctl"><div class="seg">${CHART_SYMS.map((s) => `<button type="button" data-r2g-chart="${s}" class="${S.chart === s ? 'on' : ''}">${s}</button>`).join('')}</div>
    <div class="seg">${days.map((d) => `<button type="button" data-r2g-sess="${d}" class="${S.sess === d ? 'on' : ''}">${dayLbl(d)}</button>`).join('')}</div>
    <div class="seg"><button type="button" data-r2g-ext="0" class="${S.ext ? '' : 'on'}">7:30 AM to 2:00 PM MT</button><button type="button" data-r2g-ext="1" class="${S.ext ? 'on' : ''}">+ extended hours</button></div></div></div>
    ${svg}
    <div class="r2t2-legend"><span><i style="border-color:#51c083;border-top-style:dashed"></i>call wall</span><span><i style="border-color:#e17272;border-top-style:dashed"></i>put wall</span><span><i style="border-color:#e0e5e7;border-top-style:dotted"></i>flip</span><span><i style="border-color:#b9c0c7;border-top-style:dashed"></i>abs-γ strike</span><span><i style="border-color:#ff9800"></i>EMA 8</span><span><i style="border-color:#a23bc4"></i>BB 20,2</span><span><i style="border-color:#2f6bff"></i>VWAP incl. extended hours</span></div>
    <p class="r2t2-note">${bars.length} bars on ${dayLbl(S.sess)} (${nReg} in the regular session)${S.ext ? ', extended hours shaded lighter' : ''}. % scale vs the ${prevDays.length ? dayLbl(prevDays[prevDays.length - 1]) : 'prior'} ${isNum(dClose) ? 'daily close' : 'close (last 2-minute bar)'} ${ref ? px(ref) : 'not measured'}. Levels from the build at ${use ? tMT(use.bt) + ' ' + dMT(use.bt) + ` (spot ${tMT(use.ms)})` : 'not measured'}${cur ? `, picked in the replay; the header and tables use the ${hb ? tMT(hb.bt) + ' ' + dMT(hb.bt) : 'gamma.json'} build` : hb && use === hb ? ', the same build as the header and tables' : ', the header build is not in the stored history'}. Bars: Massive 2-minute${pulled ? `, pulled ${dtMT(pulled)}` : ''}. No fills on this feed.</p></div>`;
}

function ladder(M) {
  const t = M.g.tickers.find((x) => x.t === S.sym); if (!t) return '';
  const r = M.rows.find((x) => x.t === S.sym) || {};
  const st = (t.strikes || []).filter((s) => s.coi + s.poi > 0).sort((a, b) => Math.abs(a.k - t.spot) - Math.abs(b.k - t.spot)).slice(0, 22).sort((a, b) => b.k - a.k);
  const mk = Object.fromEntries((M.t2.gamma.marks[S.sym] || []).map((m) => [m[0], m]));
  const mxOi = Math.max(1, ...st.map((s) => Math.max(s.coi, s.poi)));
  const role = (k) => [k === t.call_wall && 'CW', k === t.put_wall && 'PW', k === t.abs_strike && 'abs-γ', k === r.mp && 'max pain'].filter(Boolean).map((x) => `<em class="role">${x}</em>`).join('');
  const kc = (r) => (r >= 100 ? '≥ 100× OI' : r.toFixed(1) + '× OI');
  let spotDone = false, html = '';
  for (const s of st) {
    if (!spotDone && s.k < t.spot) { spotDone = true; html += `<tr class="spot"><td colspan="6">spot ${px(t.spot)} · ${tMT(Date.parse(M.g.spot_asof))}${isNum(t.flip) ? ` · flip ${px(t.flip)}` : ''}</td></tr>`; }
    const m = mk[s.k]; const vm = m ? [m[1] > 0 && m[1] >= m[2] ? `calls ${kc(m[1] / Math.max(1, m[2]))}` : '', m[3] > 0 && m[3] >= m[4] ? `puts ${kc(m[3] / Math.max(1, m[4]))}` : ''].filter(Boolean).join(' · ') : '';
    html += `<tr${m ? ' class="vo"' : ''}><th class="l">${px(s.k)}${role(s.k)}</th><td class="${cls(s.k / t.spot - 1)}">${pc((s.k / t.spot - 1) * 100, 1)}</td>
      <td class="bar dn"><b style="width:${(s.poi / mxOi * 100).toFixed(1)}%"></b>${int(s.poi)}</td><td class="bar up"><b style="width:${(s.coi / mxOi * 100).toFixed(1)}%"></b>${int(s.coi)}</td>
      <td class="${cls(s.cg + s.pg)}">${usd(s.cg + s.pg)}</td><td class="l">${vm || '<span class="q">no</span>'}</td></tr>`;
  }
  const nMarks = (M.t2.gamma.marks[S.sym] || []).length;
  return `<div class="r2t2-panel"><div class="r2t2-ph"><h2>Strike ladder · ${S.sym}</h2><span>22 strikes nearest spot · OI ${dayLbl(M.g.oi_asof)} close</span></div><div class="r2t2-tw"><table class="r2t2-t r2t2-lad">
  <thead><tr><th class="l">Strike<small>$ · role</small></th><th>From spot<small>%</small></th><th>Put OI<small>contracts</small></th><th>Call OI<small>contracts</small></th><th>Net GEX<small>$ per 1%</small></th><th class="l">Volume ÷ OI<small>${dayLbl(M.t2.gamma.marks_session)} session</small></th></tr></thead><tbody>${html}</tbody></table></div>
  <p class="r2t2-note">Outlined row = a side traded at least its open interest in the ${dayLbl(M.t2.gamma.marks_session)} session (volume from the ${tMT(Date.parse(M.t2.gamma.marks_build))} build, OI ${dayLbl(M.t2.gamma.marks_oi_asof)} close; ${nMarks} such strikes within ±15% of spot). Today's build ran before the open, so it carries no volume yet. No trade-level flow on our data plan.</p></div>`;
}

function replay(M) {
  const bl = buildsFor(M, S.sym); if (!bl.length) return `<div class="r2t2-panel"><h2>Level replay · ${S.sym}</h2><p class="r2t2-note">${S.sym} is in no stored build.</p></div>`;
  const B = M.t2.gamma.builds; const hb = headerBuild(M, bl); const idx = S.build != null && bl.some((b) => b.i === S.build) ? S.build : (hb || bl[bl.length - 1]).i;
  const cur = bl.find((b) => b.i === idx), pos = bl.indexOf(cur), prev = bl[pos - 1];
  const names = ['Spot', 'Call wall', 'Put wall', 'Flip', 'Abs-γ'];
  const held = [1, 2, 3, 4].map((j) => ({ j, ...heldCount(bl.slice(0, pos + 1).map((b) => b.lv[j]), j === 3 ? 0.25 * (M.rows.find((r) => r.t === S.sym)?.atr || 0) : 0) }));
  const rows = bl.slice(Math.max(0, pos - 9), pos + 1).reverse();
  const sessN = new Set(bl.map((b) => b.sess)).size;
  return `<div class="r2t2-panel"><div class="r2t2-ph"><h2>Level replay · ${S.sym}</h2><span>${bl.length} builds over ${sessN} sessions · ${dayLbl(B[0].sess)} to ${dayLbl(B[B.length - 1].sess)}</span></div>
  <div class="r2t2-replay"><input type="range" min="0" max="${bl.length - 1}" value="${pos}" data-r2g-replay aria-label="Pick a build"><b>built ${tMT(cur.bt)} ${dMT(cur.bt)}</b><span>build ${pos + 1} of ${bl.length}${hb && cur.i === hb.i ? ' · the header build' : ''}</span>${CHART_SYMS.includes(S.sym) ? '<span>the chart draws this build</span>' : ''}</div>
  <div class="r2t2-tw"><table class="r2t2-t"><thead><tr><th class="l">Build<small>spot time, MT</small></th>${names.map((n) => `<th>${n}<small>$</small></th>`).join('')}</tr></thead><tbody>
  ${rows.map((b) => { const p = bl[bl.indexOf(b) - 1]; return `<tr${b.i === idx ? ' class="sel"' : ''}><th class="l">${dMT(b.ms)} ${tMT(b.ms)}</th>${b.lv.map((v, j) => `<td class="${j && p && p.lv[j] !== v ? 'chg' : ''}">${px(v)}</td>`).join('')}</tr>`; }).join('')}
  </tbody></table></div>
  <p class="r2t2-note">${held.map((h) => `${names[h.j]} at ${px(cur.lv[h.j])} in <b>${h.same} of ${h.n}</b> builds`).join(' · ')} (up to the picked build; flip counted within ±0.25× ATR). Outlined cell = changed from the build before${prev ? '' : ' (first build in the window)'}. No base rate yet for "wall held, then price reverted".</p></div>`;
}

function oiChart(M, w) {
  const t = M.g.tickers.find((x) => x.t === S.sym); if (!t) return '';
  const r = M.rows.find((x) => x.t === S.sym) || {};
  const st = (t.strikes || []).filter((s) => s.k >= t.spot * 0.9 && s.k <= t.spot * 1.1 && s.coi + s.poi > 0);
  const H = 250, PL = 50, PR = 10, PT = 14, PB = 24, mid = PT + (H - PT - PB) / 2;
  if (!st.length) return '';
  const k0 = Math.min(...st.map((s) => s.k), r.mp ?? Infinity, t.spot), k1 = Math.max(...st.map((s) => s.k), r.mp ?? -Infinity, t.spot);
  const X = (k) => PL + (k - k0) / ((k1 - k0) || 1) * (w - PL - PR), mx = Math.max(1, ...st.map((s) => Math.max(s.coi, s.poi))), half = (H - PT - PB) / 2;
  const bw = Math.max(1.5, Math.min(10, (w - PL - PR) / st.length * 0.7));
  let s = `<svg viewBox="0 0 ${w} ${H}" width="100%" height="${H}" class="r2t2-oi"><rect width="${w}" height="${H}" fill="#000"/>`;
  for (const q of st) { s += `<rect x="${(X(q.k) - bw / 2).toFixed(1)}" y="${(mid - q.coi / mx * half).toFixed(1)}" width="${bw.toFixed(1)}" height="${(q.coi / mx * half).toFixed(1)}" fill="#51c083"/><rect x="${(X(q.k) - bw / 2).toFixed(1)}" y="${mid}" width="${bw.toFixed(1)}" height="${(q.poi / mx * half).toFixed(1)}" fill="#e17272"/>`; }
  const vline = (k, col, dash, lbl, dy) => `<path d="M${X(k).toFixed(1)} ${PT}V${H - PB}" stroke="${col}" ${dash ? `stroke-dasharray="${dash}"` : ''}/><text x="${(X(k) + 3).toFixed(1)}" y="${PT + 10 + dy}" fill="${col}" font-size="11">${lbl} ${px(k)}</text>`;
  s += `<path d="M${PL} ${mid}H${w - PR}" stroke="#464b52"/>` + vline(t.spot, '#ffffff', '', 'spot', 0) + (isNum(r.mp) ? vline(r.mp, '#e0e5e7', '5 3', 'max pain', 14) : '') + (isNum(t.flip) ? vline(t.flip, '#bec7cd', '2 3', 'flip', 28) : '');
  s += `<text x="${PL - 4}" y="${PT + 10}" fill="#bec7cd" font-size="10" text-anchor="end">calls</text><text x="${PL - 4}" y="${H - PB - 2}" fill="#bec7cd" font-size="10" text-anchor="end">puts</text><text x="${PL - 4}" y="${mid - 3}" fill="#bec7cd" font-size="10" text-anchor="end">${int(mx)}</text>`;
  s += `<text x="${PL}" y="${H - 6}" fill="#bec7cd" font-size="10">${px(k0)}</text><text x="${w - PR}" y="${H - 6}" fill="#bec7cd" font-size="10" text-anchor="end">${px(k1)}</text></svg>`;
  return `<div class="r2t2-panel"><div class="r2t2-ph"><h2>Max pain and open interest by strike · ${S.sym}</h2><span>all non-expired expiries combined · OI ${dayLbl(M.g.oi_asof)} close</span></div>${s}
  <p class="r2t2-note">Max pain <b>${px(r.mp)}</b> (over all ${M.t2.gamma.maxpain && M.t2.gamma.maxpain[S.sym] ? M.t2.gamma.maxpain[S.sym][1] + ' listed strikes, build ' + tMT(Date.parse(M.t2.gamma.maxpain_build)) : 'strikes in gamma.json'}) = the strike where option holders' total intrinsic value is smallest (${isNum(r.mp) ? `${pc((r.mp / t.spot - 1) * 100, 2)} from spot, ${xx(r.mpx)} ATR` : 'not measured'}). Bars: call OI up, put OI down, strikes within ±10% of spot. <b>Per expiry: not built yet</b>: no stored build splits OI by expiry (the feed keeps the nearest expiry's gamma only).</p></div>`;
}

let M = null, host = null;
function render() {
  if (!M || !host) return;
  // RC2 fix #6: the header chip reads this tab's own as-of (the gamma.json build), not the live board's row clock.
  if (M.g.built_at) { host.setAttribute('data-asof', M.g.built_at); host.setAttribute('data-built', M.g.built_at); }
  const W = host.clientWidth || 1200, wide = W >= 1300;
  const T = sideTables(M.rows, S.cap);
  const g = M.g, B = M.t2.gamma.builds;
  const chartW = wide ? Math.min(800, Math.round(W * 0.40)) : W - 24;
  host.innerHTML = `<div class="r2t2">
  <div class="r2t2-head"><h1>Gamma</h1>${infoChip(`Levels for ${dayLbl(g.levels_for_session)} · spot ${dtMT(Date.parse(g.spot_asof))} · OI ${dayLbl(g.oi_asof)} close · built ${dtMT(Date.parse(g.built_at))} · ${M.rows.length} names${M.excluded ? ` (${M.excluded} name with split artefacts excluded)` : ''} · level history ${B.length} builds since ${dayLbl(B[0].sess)} · dealer side assumed: long calls, short puts`)}<span class="r2t2-for">Levels for <b>${dayLbl(g.levels_for_session)}</b></span></div>
  ${tg5(g.index_regime)}
  <div class="r2t2-grid ${wide ? 'wide' : ''}">
    <div class="r2t2-panel"><div class="r2t2-ph"><h2>Flip and walls, sorted by distance to the flip</h2>
      <div class="r2t2-ctl"><span>Caps</span><div class="seg">${[['all', 'All'], ['small', 'Small'], ['mid', 'Mid'], ['large', 'Large']].map(([k, l]) => `<button type="button" data-r2g-cap="${k}" class="${S.cap === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="r2t2-sides">${sideTable('Short side', 'stretched above the 8 EMA', T.short)}${sideTable('Long side', 'stretched below the 8 EMA', T.long)}</div>
      <p class="r2t2-note">Nearest flip first (× ATR = (level − spot) ÷ ATR14). Gold row = 2-yr stretch extreme (≤ 5th or ≥ 95th pctl, MR MAP). Caps: small under $2B, mid $2B to $10B, large over $10B (index ETFs under Large). ${T.none.length} names with no stretch reading left out of both sides. Click a row: the ladder, replay and OI panels load it.</p></div>
    ${chartBlock(M, chartW)}
  </div>
  <div class="r2t2-grid3">${ladder(M)}${replay(M)}${oiChart(M, wide ? Math.round((W - 40) / 3) - 26 : W - 24)}</div>
  <div class="r2t2-rule">Full gamma board: sector chips, key levels, curve, universe, reference</div></div>`;
}
function wire() {
  host.addEventListener('click', (e) => {
    const q = (a) => e.target.closest(`[${a}]`);
    let el;
    if ((el = q('data-r2g-sym'))) { S.sym = el.dataset.r2gSym; S.build = null; if (CHART_SYMS.includes(S.sym)) S.chart = S.sym; }
    else if ((el = q('data-r2g-chart'))) { S.chart = el.dataset.r2gChart; S.sym = S.chart; S.build = null; }
    else if ((el = q('data-r2g-sess'))) S.sess = el.dataset.r2gSess;
    else if ((el = q('data-r2g-ext'))) S.ext = el.dataset.r2gExt === '1';
    else if ((el = q('data-r2g-cap'))) S.cap = el.dataset.r2gCap;
    else if ((el = q('data-r2g-all'))) S.all = !S.all;
    else return;
    save(); render();
  });
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-r2g-sym]')) e.target.click(); });
  host.addEventListener('input', (e) => { if (!e.target.matches('[data-r2g-replay]')) return; const bl = buildsFor(M, S.sym); const b = bl[+e.target.value]; if (b) { S.build = b.i; if (CHART_SYMS.includes(S.sym)) { S.chart = S.sym; S.sess = b.sess; } render(); host.querySelector('[data-r2g-replay]')?.focus(); } });
}
async function show() {
  const panel = document.getElementById('view-gamma'); if (!panel) return;
  if (!host) { host = document.createElement('div'); host.id = 'r2Gamma'; panel.insertBefore(host, panel.firstChild); wire(); }
  if (!M) {
    host.innerHTML = '<div class="r2t2"><p class="r2t2-note">Loading gamma levels…</p></div>';
    try { const [g, mm, t2] = await Promise.all([loadJson('./data/gamma.json'), loadJson('./data/mrmap.json').catch(() => null), loadJson('./data/rc2-t2.json')]); M = model(g, mm, t2); }
    catch (e) { host.innerHTML = `<div class="r2t2"><p class="r2t2-note">Gamma RC2 data did not load (${esc(e.message || e)}).</p></div>`; return; }
  }
  requestAnimationFrame(render);
}
if (typeof document !== 'undefined') {
  document.querySelector('.view-tab[data-view="gamma"]')?.addEventListener('click', show);
  document.addEventListener('keydown', (e) => { if (e.key === '0' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) show(); });
  let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (host && !document.getElementById('view-gamma')?.hidden) render(); }, 200); });
  if (location.hash === '#gamma') show();
}
