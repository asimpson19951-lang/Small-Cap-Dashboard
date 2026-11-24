// RC2 C3b Short vol block (Austin: "use your best judgement"): T2 sample's best pieces, notes fixed.
// Stretch beside short-volume share, long and short side by side; a short card (short interest, days to cover, settlement
// date printed); daily candles + short-volume share bars for the picked name (every NOW name has bars in rc2-t2.json).
import { isNum, esc, px, pc, xx, int, shares, dayLbl, daysBetween, candleSvg, EXCLUDE } from './rc2-t2-lib.mjs?v=V2.21.0';
import { loadJson } from './rc2-t2-data.mjs?v=V2.21.0';

const LS = 'rc2.shortvol';
const S = Object.assign({ sym: null, all: false }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })());
const cls = (v) => (!isNum(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');

// RC2 fix #2: days to cover = short interest ÷ average daily volume, computed here. The vendor's days_to_cover field is
// floored at 1 d, so it is never printed. A missing or non-positive input gives null ("not measured").
export function dtcCalc(si, adv) {
  return isNum(si) && isNum(adv) && si >= 0 && adv > 0 ? si / adv : null;
}
export function svRows(sv, t2) {
  const seen = new Set();
  return sv.now.filter((r) => !EXCLUDE.includes(r.t) && !seen.has(r.t) && seen.add(r.t)).map((r) => {
    const si = t2.shortvol.si[r.t] || null;
    return { t: r.t, book: r.book, x8: r.x8, ratio: r.snap?.ratio_pct, rp: r.snap?.pctl_2y_pct, rn: r.snap?.n_sessions, med: r.band?.median_pct, sv: r.short_vol, tv: r.total_vol, spark: r.spark || [],
      si: si?.short_interest ?? null, dtc: dtcCalc(si?.short_interest, si?.avg_daily_volume), adv: si?.avg_daily_volume ?? null, sd: si?.settlement_date ?? null, bars: t2.shortvol.daily[r.t] || [] };
  });
}
function side(title, sub, rows) {
  const cap = S.all ? rows.length : 10;
  return `<div class="r2t2-side"><div class="r2t2-sh"><h3>${title}</h3><span>${sub} · ${rows.length} names</span></div><div class="r2t2-tw"><table class="r2t2-t">
  <thead><tr><th class="l">Name</th><th>Stretch<small>× ATR vs 8 EMA</small></th><th>Short-vol share<small>% of volume · 2-yr pctl</small></th><th>Short interest<small>shares</small></th><th>Days to cover<small>short int ÷ avg vol</small></th></tr></thead><tbody>
  ${rows.slice(0, cap).map((r) => `<tr class="clk${S.sym === r.t ? ' sel' : ''}${isNum(r.rp) && (r.rp <= 5 || r.rp >= 95) ? ' goldrow' : ''}" data-r2v="${r.t}" tabindex="0"><th class="l">${r.t}<em class="bk">${esc(r.book || '')}</em></th>
    <td class="${cls(r.x8)}">${xx(r.x8)}</td><td>${pc(r.ratio, 1, false)}<small>${isNum(r.rp) ? pc(r.rp, 0, false) + ' 2-yr pctl' : 'pctl not measured'}</small></td><td>${shares(r.si)}</td><td>${isNum(r.dtc) ? r.dtc.toFixed(2) + ' d' : 'not measured'}<small>${r.sd ? 'settled ' + dayLbl(r.sd) : 'settlement not measured'}</small></td></tr>`).join('')}
  </tbody></table></div></div>`;
}
function svBars(r, w) {
  const sp = r.spark.filter((p) => isNum(p.ratio_pct)); if (!sp.length) return '';
  const H = 90, bw = w / sp.length;
  let s = `<svg viewBox="0 0 ${w} ${H}" width="100%" height="${H}" class="r2t2-oi"><rect width="${w}" height="${H}" fill="#000"/>`;
  sp.forEach((p, i) => { const h = p.ratio_pct / 100 * (H - 18); const ext = isNum(p.pctl_2y_pct) && (p.pctl_2y_pct >= 95 || p.pctl_2y_pct <= 5); s += `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="${ext ? '#e4b76e' : '#8fa3b8'}"/>`; });
  if (isNum(r.med)) { const y = H - 14 - r.med / 100 * (H - 18); s += `<path d="M0 ${y.toFixed(1)}H${w}" stroke="#e0e5e7" stroke-dasharray="4 3"/><text x="4" y="${(y - 3).toFixed(1)}" fill="#e0e5e7" font-size="10">2-yr median ${pc(r.med, 1, false)}</text>`; }
  s += `<text x="4" y="${H - 3}" fill="#bec7cd" font-size="10">${dayLbl(sp[0].date)}</text><text x="${w - 4}" y="${H - 3}" fill="#bec7cd" font-size="10" text-anchor="end">${dayLbl(sp[sp.length - 1].date)}</text></svg>`;
  return s;
}
let D = null, host = null;
function render() {
  if (!D || !host) return;
  const W = host.clientWidth || 1200, wide = W >= 1300, R = D.rows;
  if (!R.some((r) => r.t === S.sym)) S.sym = R.slice().sort((a, b) => Math.abs(b.x8 ?? 0) - Math.abs(a.x8 ?? 0))[0]?.t;
  const r = R.find((x) => x.t === S.sym);
  const sess = D.sv.meta.session, sds = [...new Set(R.map((x) => x.sd).filter(Boolean))].sort(), sd = sds[sds.length - 1];
  const age = sd ? daysBetween(sd, sess) : null;
  const shortS = R.filter((x) => x.x8 > 0).sort((a, b) => b.x8 - a.x8), longS = R.filter((x) => x.x8 < 0).sort((a, b) => a.x8 - b.x8);
  const chartW = wide ? Math.round(W * 0.42) : W - 24;
  const card = (k, v, s) => `<div class="r2t2-tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s"><span>${s}</span></div></div>`;
  host.innerHTML = `<div class="r2t2">
  <h1>Short vol</h1>
  <div class="r2-meta">Short-sale volume to <b>${dayLbl(sess)}</b> (FINRA daily files, built ${esc(String(D.sv.meta.source_built_mt || 'not measured').replace(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}) MT/, (_, d, h, m) => `${dayLbl(d)} ${(+h % 12) || 12}:${m} ${+h < 12 ? 'AM' : 'PM'} MT`))}) · short interest settled <b>${sd ? dayLbl(sd) : 'not measured'}</b>${isNum(age) ? ` (${age} days before the volume date; FINRA publishes it twice a month)` : ''} · short-sale volume is not short interest</div>
  <div class="r2t2-grid ${wide ? 'wide' : ''}">
    <div class="r2t2-panel"><div class="r2t2-ph"><h2>Stretch beside short-volume share</h2><span>${R.length} names on the board's short-vol NOW list</span></div>
      <div class="r2t2-sides">${side('Short side', 'stretched above the 8 EMA', shortS)}${side('Long side', 'stretched below the 8 EMA', longS)}</div>
      ${Math.max(shortS.length, longS.length) > 10 ? `<button type="button" class="r2t2-more" data-r2v-all>${S.all ? 'Show 10 each' : 'Show all'}</button>` : ''}
      <p class="r2t2-note">Most stretched first. Short-vol share = short-sale volume ÷ total volume on FINRA-reporting venues that day; 2-yr pctl over ${int(Math.max(...R.map((x) => x.rn).filter(isNum)))} sessions at most. Gold row = share at a 2-yr extreme (≤ 5th or ≥ 95th pctl). Short interest and days to cover from the ${sd ? dayLbl(sd) : 'latest'} settlement (Massive). Click a row for its card and chart. No base rate yet for share extremes against the next move.</p></div>
    ${r ? `<div class="r2t2-panel"><div class="r2t2-ph"><h2>${r.t} · short card</h2><span>settled ${r.sd ? dayLbl(r.sd) : 'not measured'}</span></div>
      <div class="r2t2-cards">${card('Short interest', shares(r.si), `settled ${r.sd ? dayLbl(r.sd) : 'not measured'}`)}${card('Days to cover', isNum(r.dtc) ? r.dtc.toFixed(2) + ' d' : 'not measured', `short interest ÷ avg daily volume ${shares(r.adv)} · settled ${r.sd ? dayLbl(r.sd) : 'not measured'}`)}${card('Short-vol share', pc(r.ratio, 1, false), `${isNum(r.rp) ? pc(r.rp, 0, false) + ' 2-yr pctl' : 'pctl not measured'} · ${dayLbl(sess)}`)}${card('Short % of float · borrow fee', 'not measured', 'no float, borrow or utilization source on our data')}</div>
      ${candleSvg(r.bars, { w: chartW, h: wide ? 330 : 260, tag: 'daily', timeLbl: (ms) => new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) })}
      <div class="r2t2-legend"><span><i style="border-color:#ff9800"></i>EMA 8</span><span><i style="border-color:#a23bc4"></i>BB 20,2</span><span>daily candles, ${r.bars.length} sessions (no VWAP on daily)</span></div>
      <div class="r2t2-sh" style="margin-top:8px"><h3>Short-volume share by day</h3><span>% of volume · gold bar = 2-yr extreme</span></div>${svBars(r, chartW)}
      <p class="r2t2-note">${r.t} on ${dayLbl(sess)}: ${shares(r.sv)} short of ${shares(r.tv)} reported (${pc(r.ratio, 1, false)}). Bars: Massive daily, adjusted.</p></div>` : ''}
  </div>
  <div class="r2t2-rule">Short-volume board</div></div>`;
}
async function show() {
  const panel = document.getElementById('view-shortvol'); if (!panel) return;
  if (!host) {
    host = document.createElement('div'); host.id = 'r2Shortvol'; panel.insertBefore(host, panel.firstChild);
    host.addEventListener('click', (e) => { const a = e.target.closest('[data-r2v-all]'); if (a) { S.all = !S.all; render(); return; } const t = e.target.closest('[data-r2v]'); if (t) { S.sym = t.dataset.r2v; try { localStorage.setItem(LS, JSON.stringify({ sym: S.sym })); } catch { /* */ } render(); } });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-r2v]')) e.target.click(); });
  }
  if (!D) {
    host.innerHTML = '<div class="r2t2"><p class="r2t2-note">Loading short volume…</p></div>';
    try { const [sv, t2] = await Promise.all([loadJson('./data/shortvol.json'), loadJson('./data/rc2-t2.json')]); D = { sv, rows: svRows(sv, t2) }; }
    catch (e) { host.innerHTML = `<div class="r2t2"><p class="r2t2-note">Short vol RC2 data did not load (${esc(e.message || e)}).</p></div>`; return; }
  }
  requestAnimationFrame(render);
}
if (typeof document !== 'undefined') {
  document.querySelector('.view-tab[data-view="shortvol"]')?.addEventListener('click', show);
  if (location.hash === '#shortvol') show();
}
