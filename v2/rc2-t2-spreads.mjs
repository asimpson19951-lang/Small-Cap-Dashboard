// RC2 C3b ER moves block (TS1, TS8, TS9; TS10 removed: no option-quotes source). Self-wiring: mounts #r2Spreads above #spreadsTab.
// Reads static files only: spreads.json, gamma.json, mrmap.json, rc2-t2.json.
import { isNum, esc, px, usd, pc, xx, int, dayLbl, daysBetween, relVol, capBucket, EXCLUDE } from './rc2-t2-lib.mjs?v=V2.23.0';
import { loadJson } from './rc2-t2-data.mjs?v=V2.23.0';
import * as SF from './spec-feeds.mjs?v=V2.23.0';

import { infoChip } from './info-chip.mjs?v=V2.23.0';
const LS = 'rc2.spreads';
const S = Object.assign({ sort: 'rv', side: 'all', cap: 'all', all: false }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })());
const save = () => { try { const { sort, side, cap } = S; localStorage.setItem(LS, JSON.stringify({ sort, side, cap })); } catch { /* private mode */ } };
const h12 = (str) => String(str || '').replace(/\b(\d{1,2}):(\d{2}) MT/g, (_, h, m) => `${(+h % 12) || 12}:${m} ${+h < 12 ? 'AM' : 'PM'} MT`);
const cls = (v) => (!isNum(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');
// Funds never report earnings. gamma.json marks some sector ETFs (SOXX, SMH) as 'single', so name them here (red-team #3, Nov 24).
export const FUNDS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'MDY', 'SOXX', 'SMH', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'XBI', 'IBB', 'KRE', 'KBE', 'XRT', 'XHB', 'ITB', 'XME', 'XOP', 'OIH', 'GDX', 'GDXJ', 'SIL', 'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'HYG', 'LQD',
  'EEM', 'EFA', 'FXI', 'KWEB', 'EWZ', 'EWJ', 'ARKK', 'IGV', 'SKYY', 'HACK', 'TAN', 'ICLN', 'URA', 'JETS', 'IYR', 'VNQ', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS',
  'UVXY', 'VXX', 'SPXL', 'SPXS', 'TNA', 'TZA', 'LABU', 'LABD', 'BITO', 'IBIT', 'ETHA']);

// RC2 fix #14: thin history prints "not measured" instead of a full-weight number beside 300-session rows.
export const IVR_MIN_N = 60, RV_MIN_N = 10;
export function rows(sp, g, mm, t2, cons = null, si = null) {
  const ce = SF.erIndex(cons), sim = SF.siIndex(si);
  const col = mm && Array.isArray(mm.cols) ? Object.fromEntries(mm.cols.map((c, i) => [c, i])) : null;
  const mmRow = col ? Object.fromEntries(mm.rows.map((r) => [r[0], r])) : {};
  const gx = Object.fromEntries((g?.tickers || []).map((t) => [t.t, t]));
  const er = Object.fromEntries((sp.earnings || []).map((e) => [e.ticker, e]));
  const OV = t2.optvol, last = OV.sessions[OV.sessions.length - 1], prior = OV.sessions.slice(0, -1);
  const asof = String(sp.header?.data_session_date || last || '').slice(0, 10);
  return (sp.iv_scan || []).filter((r) => !EXCLUDE.includes(r.ticker)).map((r) => {
    const m = mmRow[r.ticker], t = gx[r.ticker], e = er[r.ticker];
    const own = (r.next_er && r.next_er.date) || (e && e.next_er && e.next_er.date) || null, c2 = ce.get(r.ticker);
    const nx = own || (c2 && c2.report_date) || null, erSrc = own ? 'spreads' : nx ? (c2.far ? 'far' : 'consensus') : null;
    const by = OV.by[r.ticker]; const rv = by ? relVol(by[last], prior.map((d) => by[d])) : { x: null, n: 0 };
    const cap = t && isNum(t.cap) ? t.cap : e && isNum(e.market_cap_usd) ? e.market_cap_usd : m && isNum(m[col.cap]) ? m[col.cap] * 1e6 : null; // MR MAP stores cap in $ millions
    return { t: r.ticker, spot: r.spot_usd, iv: r.atm_iv_30d_pct, ivr: (r.history_past_sessions ?? 0) >= IVR_MIN_N ? r.iv_rank_pct : null, ivp: (r.history_past_sessions ?? 0) >= IVR_MIN_N ? r.iv_percentile_pct : null, own: r.history_sessions_own, past: r.history_past_sessions, approx: r.approximate,
      vrp: r.iv30_over_hv20_x, hv: r.hv20_pct, em: r.expected_move_30d_pct, vol: r.total_volume, oi: r.total_oi, ov: by ? by[last] : null, rv: rv.n >= RV_MIN_N ? rv.x : null, rvn: rv.n,
      er: nx, dte: nx && asof ? daysBetween(asof, nx) : null, gex: t && t.greeks_ok !== false ? t.net_gex : null, sx: m && isNum(m[col.x]) ? m[col.x] : null, spc: m && isNum(m[col.pc]) ? m[col.pc] : null,
      cap, bkt: capBucket(cap), erSrc, si: sim.get(r.ticker) || null, etf: FUNDS.has(r.ticker) || !!(t && /etf|index/i.test(String(t.kind || ''))), win: cons && cons.next_er_through ? cons.next_er_through : (cons && Array.isArray(cons.window_days) && cons.window_days.length) ? cons.window_days[cons.window_days.length - 1] : null };
  });
}
const SORTS = { rv: ['Option volume vs average', (r) => r.rv], ivr: ['IV rank', (r) => r.ivr], vrp: ['IV ÷ HV', (r) => r.vrp], sx: ['Stretch', (r) => (isNum(r.sx) ? Math.abs(r.sx) : null)], dte: ['Days to earnings', (r) => (isNum(r.dte) ? -r.dte : null)] };

let D = null, host = null;
function render() {
  if (!D || !host) return;
  const all = D.rows;
  let R = all.filter((r) => (S.side === 'all' || (S.side === 'short' ? r.sx > 0 : r.sx < 0)) && (S.cap === 'all' || r.bkt === S.cap));
  const key = SORTS[S.sort][1]; R = R.slice().sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
  const cap = S.all ? R.length : 15, OV = D.t2.optvol;
  const nEr = all.filter((r) => r.er).length, nRv = all.filter((r) => isNum(r.rv)).length, nG = all.filter((r) => isNum(r.gex)).length;
  const ownMin = Math.min(...all.map((r) => r.own).filter(isNum)), pastMax = Math.max(...all.map((r) => r.past).filter(isNum));
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-r2s="${k}:${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  host.innerHTML = `<div class="r2t2">
  <div class="r2t2-head"><h1>ER moves</h1>${infoChip(`${h12(D.sp.header?.chain_as_of_mt)} · built ${esc(h12(D.sp.header?.generated_mt))} · option volume from the gamma builds, last session ${dayLbl(OV.sessions[OV.sessions.length - 1])} · ER dates: this feed's earnings rows, then earnings-consensus.json (Finnhub) where the feed has none (${nEr} of ${all.length} names dated, ${all.filter((r) => r.erSrc === 'consensus').length} from the consensus file) · short interest: FINRA settlement + free float (short-interest.json)`)}</div>
  <div class="r2t2-panel"><div class="r2t2-ph"><h2>IV scan · IV rank, IV ÷ HV and GEX beside option volume</h2>
    <div class="r2t2-ctl"><span>Sort</span>${seg('sort', Object.entries(SORTS).map(([k, [l]]) => [k, l]))}<span>Side</span>${seg('side', [['all', 'Both'], ['short', 'Short side'], ['long', 'Long side']])}<span>Caps</span>${seg('cap', [['all', 'All'], ['small', 'Small'], ['mid', 'Mid'], ['large', 'Large']])}</div></div>
  <div class="r2t2-tw"><table class="r2t2-t">
  <thead><tr><th class="l">Name</th><th>Spot<small>$</small></th><th>Stretch<small>× ATR vs 8 EMA</small></th><th>Option volume<small>contracts, ${dayLbl(OV.sessions[OV.sessions.length - 1])}</small></th><th>vs average<small>× mean of up to ${OV.sessions.length - 1} sessions</small></th><th>IV 30-day<small>% ATM</small></th><th>IV rank<small>% over up to ${pastMax} sessions</small></th><th>IV pctl<small>%</small></th><th>IV ÷ HV<small>× (IV30 ÷ HV20)</small></th><th>Expected move<small>% 30-day</small></th><th>Days to ER<small>days</small></th><th>Net GEX<small>$ per 1%</small></th><th>Short % float<small>days to cover · SI + float dates</small></th></tr></thead><tbody>
  ${R.slice(0, cap).map((r) => `<tr data-ticker="${r.t}" data-walk-focus${isNum(r.spc) && (r.spc <= 5 || r.spc >= 95) ? ' class="goldrow"' : ''}><th class="l">${r.t}<em class="bk">${r.bkt || 'cap not measured'}</em></th><td>${px(r.spot)}</td>
    <td class="${cls(r.sx)}">${xx(r.sx)}<small>${isNum(r.spc) ? pc(r.spc, 0, false) + ' 2-yr pctl' : 'pctl not measured'}</small></td>
    <td>${int(isNum(r.ov) ? r.ov : r.vol)}</td><td class="${isNum(r.rv) ? (r.rv >= 1 ? 'up' : 'dn') : ''}">${xx(r.rv, 2, false)}<small>${r.rvn ? r.rvn + ' sessions' : 'not in gamma builds'}</small></td>
    <td>${pc(r.iv, 1, false)}</td><td>${pc(r.ivr, 0, false)}<small>${r.past > r.own ? `${r.own} own + ${r.past - r.own} rebuilt` : `${r.own} own sessions`}</small></td><td>${pc(r.ivp, 0, false)}</td>
    <td class="${isNum(r.vrp) ? (r.vrp >= 1 ? 'up' : 'dn') : ''}">${xx(r.vrp, 2, false)}<small>HV20 ${pc(r.hv, 1, false)}</small></td><td>±${pc(r.em, 1, false)}</td>
    <td>${r.etf ? '<span class="q">fund · no ER</span>' : isNum(r.dte) ? (r.erSrc === 'far' ? '~' : '') + r.dte + ' d' : r.win ? `<span class="q">not on calendar through ${dayLbl(r.win)}</span>` : '<span class="q">no date</span>'}${r.er && !r.etf ? `<small>${r.erSrc === 'far' ? 'est. ' : ''}${dayLbl(r.er)}${r.erSrc === 'consensus' ? ' · consensus file' : r.erSrc === 'far' ? ' · Finnhub projection' : ''}</small>` : ''}</td><td class="${cls(r.gex)}">${usd(r.gex)}</td><td>${SF.siCell(r.si, !!D.si)}</td></tr>`).join('')}
  </tbody></table></div>${R.length > 15 ? `<button type="button" class="r2t2-more" data-r2s="all:x">${S.all ? 'Show 15' : `Show all ${R.length}`}</button>` : ''}
  <p class="r2t2-note">${R.length} of ${all.length} names in view. IV rank and IV pctl print "not measured" under ${IVR_MIN_N} sessions of history, vs average under ${RV_MIN_N} sessions (the session count stays in the sub-line). <b>IV rank</b> = where today's 30-day ATM IV sits between its low and high over the feed's history: ${ownMin} sessions of our own snapshots plus sessions rebuilt from daily option closes (${pastMax} at most, labelled "approx" by the feed), so it never takes gold. <b>vs average</b> = the ${dayLbl(OV.sessions[OV.sessions.length - 1])} option volume ÷ the mean of the earlier full-session gamma builds since ${dayLbl(OV.sessions[0])} (a 90-day average needs history we do not keep yet; ${nRv} of ${all.length} names are in the gamma builds). <b>IV ÷ HV</b> above 1.00× = options price more movement than the last 20 sessions delivered. Net GEX for ${nG} names (gamma build). Gold row = 2-yr stretch extreme (MR MAP). Short side = stretched above the 8 EMA, long side = below. No base rate yet for IV rank against the next move.</p></div>
  </div>`; // the module below titles itself (spreads-tab foldHead, R54)
}
async function show() {
  const panel = document.getElementById('view-spreads'); if (!panel) return;
  if (!host) {
    host = document.createElement('div'); host.id = 'r2Spreads'; panel.insertBefore(host, panel.firstChild);
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-r2s]'); if (!b) return; const [k, v] = b.dataset.r2s.split(':'); if (k === 'all') S.all = !S.all; else S[k] = v; save(); render(); });
  }
  if (!D) {
    host.innerHTML = '<div class="r2t2"><p class="r2t2-note">Loading the IV scan…</p></div>';
    try { const [sp, g, mm, t2] = await Promise.all([loadJson('./data/spreads.json'), loadJson('./data/gamma.json').catch(() => null), loadJson('./data/mrmap.json').catch(() => null), loadJson('./data/rc2-t2.json')]); const [cons, si] = await Promise.all([SF.feed('cons'), SF.feed('si')]); D = { sp, t2, si, rows: rows(sp, g, mm, t2, cons, si) }; }
    catch (e) { host.innerHTML = `<div class="r2t2"><p class="r2t2-note">ER moves RC2 data did not load (${esc(e.message || e)}).</p></div>`; return; }
  }
  render();
}
if (typeof document !== 'undefined') {
  document.querySelector('.view-tab[data-view="spreads"]')?.addEventListener('click', show);
  if (location.hash === '#spreads') show();
}
