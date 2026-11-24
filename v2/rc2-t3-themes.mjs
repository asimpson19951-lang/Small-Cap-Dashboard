// RC2 C3c Themes top block. Copies (T3 sample): YCharts card grid + period pills; MarketCarpets numeric legend + as-of stamp;
// SentimenTrader-style n beside rates (no per-name base rate exists: "no base rate yet"). MR spin: theme members stretched
// below | above the 8 EMA in ATR, side by side, cap filter. Member percentiles in themes-matrix.json are 1-YEAR (252 sessions):
// labelled so everywhere, and no gold is drawn from them (gold is for 2-yr extremes only).
import { esc, fin, pct, xatr, mult, cls, dlong, mtStamp, themesModel, PERIODS_T, CAPS, capBucket, money } from './rc2-t3-lib.mjs?v=V2.21.0';

const pills = (key, opts, cur, label) => `<span class="r3-pg" role="group" aria-label="${esc(label)}"><em>${esc(label)}</em>${opts.map(([v, l]) => `<button type="button" class="r3-pill${cur === v ? ' on' : ''}" data-${key}="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</span>`;
const tile = (k, v, s, extra = '') => `<div class="tile${extra ? ` ${extra}` : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
export const heat = (v, scale = 15) => { if (!fin(v)) return '#2a2d31'; const a = (0.22 + 0.6 * Math.min(1, Math.abs(v) / scale)).toFixed(2); return v >= 0 ? `rgba(81,192,131,${a})` : `rgba(225,114,114,${a})`; };
const p1y = (p) => (fin(p) ? `${(+p).toFixed(1)}% 1-yr pctl` : '1-yr pctl not measured');
export function barsSvg(xs) {
  const v = (xs || []).filter(fin); if (!v.length) return '';
  const w = 210, h = 30, mx = Math.max(...v.map(Math.abs), 0.01), bw = w / v.length;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="daily basket move vs IWM, last ${v.length} sessions">${v.map((x, i) => { const hh = Math.max(1, (Math.abs(x) / mx) * (h / 2 - 2)); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(x >= 0 ? h / 2 - hh : h / 2).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${hh.toFixed(1)}" fill="${x >= 0 ? '#51c083' : '#e17272'}"/>`; }).join('')}<line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" stroke="#2a2d31"/></svg>`;
}

export function renderThemes(tm, ui = {}) {
  const M = themesModel(tm, ui); const { U } = M; const P = M.period;
  const memDays = tm.members_measured_at ? Math.round((Date.parse(tm.generated_at) - Date.parse(tm.members_measured_at)) / 864e5) : null;
  const head = `<div class="head r3-head"><h1>Themes</h1></div>
<p class="r3-asof">As of: baskets = ${(tm.themes || []).length} themes vs IWM on daily bars at the ${esc(dlong(tm.session))} close, 2:00 PM MT · feed built ${esc(mtStamp(tm.generated_at))} · <span class="r3-stale">member lists last measured ${esc(mtStamp(tm.members_measured_at))}${memDays != null ? `, ${memDays} days before the feed` : ''}</span> · member pctl = 1-yr (252 sessions)</p>`;
  const big = M.big;
  const lo = [...M.below][0]; const hi = [...M.above][0];
  const mostStr = [lo, hi].filter(Boolean).sort((a, b) => Math.abs(b.xatr) - Math.abs(a.xatr))[0];
  const read = `<p class="read">${M.lit.length} of ${M.themes.length} themes meet a lighting rule${M.lit.length ? ` (${M.lit.map((t) => esc(t.name)).join(', ')})` : ''}. Biggest 1D move against its own swing: <b>${esc(big?.name || 'n/a')}</b> ${pct(big?.vs?.d1)} vs IWM, ${mult(big?.ratio)} its ${pct(big?.swing)} swing. IWM ${pct(M.iwm)} over ${P}. Most stretched member: <b>${esc(mostStr?.t || 'n/a')}</b> ${xatr(mostStr?.xatr)} (${p1y(mostStr?.p252)}).</p>`;
  const bar = `<div class="r3-bar">${pills('r3t-period', PERIODS_T, U.period, 'Basket period')}${pills('r3t-cap', CAPS.map((c) => [c, c]), U.cap, 'Cap (members)')}<span class="r3-note">Period re-sorts the cards (basket move minus IWM) · cap filters the members shown (small under $2B, mid $2B to $10B, large over $10B)</span></div>`;
  const R = tm.rules || {};
  const ruleTxt = `rule a = 1D ÷ swing ≥ ${R.a?.ratio ?? 'n/a'}× and RVOL ≥ ${R.a?.rvol ?? 'n/a'}× · rule b = ≥ ${R.b?.ratio ?? 'n/a'}× and RVOL ≥ ${R.b?.rvol ?? 'n/a'}× · 3-day build = ${R.build3?.mult ?? 'n/a'}× and RVOL ≥ ${R.build3?.rvol ?? 'n/a'}×`;
  const iw = M.iwmAll;
  const tiles = `<div class="strip r3-strip">
${tile('Themes lit', `${M.lit.length} <small>of ${M.themes.length}</small>`, `${M.lit.map((t) => `${esc(t.name)} (${t.lit.join(', ')})`).join(' · ') || 'none'} · ${ruleTxt}`)}
${tile('Biggest move vs own swing', `${mult(big?.ratio)}`, `${esc(big?.name || 'n/a')} ${pct(big?.vs?.d1)} vs IWM · swing ${pct(big?.swing)} · 1D`)}
${tile(`IWM ${P}`, `<span class="${cls(M.iwm)}">${pct(M.iwm)}</span>`, PERIODS_T.filter(([k]) => k !== U.period).map(([k, l]) => `${l} ${pct(iw[k])}`).join(' · '))}
${tile('Most stretched member', `<span class="${cls(mostStr?.xatr)}">${xatr(mostStr?.xatr)}</span>`, `${esc(mostStr?.t || 'n/a')} · ${esc((mostStr?.themes || []).join(', '))} · ${p1y(mostStr?.p252)}`, 'mr')}
${tile('Members at a 1-yr extreme', `${M.ext1y.length} <small>of ${M.nNames}</small>`, 'rule: 1-yr stretch pctl ≤ 5th or ≥ 95th (252 sessions) · no gold: gold is for 2-yr extremes only')}
</div>`;
  const card = (t) => `<div class="r3-card${t.lit.length ? ' lit' : ''}"><div class="ch" style="background:${heat(t.vs)}"><b>${esc(t.name)}</b><span>${pct(t.vs)}</span></div>
<div class="cr"><span>own ${P} ${pct(t.own)}</span><span>${t.nPriced} of ${t.n} priced</span></div>${barsSvg(t.xs)}
<div class="cr"><span>1D ÷ swing</span><span>${mult(t.ratio)} · RVOL ${mult(t.rvol)}</span></div>
<div class="cr"><span>lowest ${esc(t.lo?.t || 'n/a')}</span><span class="${cls(t.lo?.xatr)}">${t.lo ? `${xatr(t.lo.xatr)} · ${fin(t.lo.p252) ? `${t.lo.p252.toFixed(1)}% 1y` : 'n/a'}` : `no ${U.cap === 'All' ? '' : `${U.cap.toLowerCase()}-cap `}member`}</span></div>
<div class="cr"><span>highest ${esc(t.hi?.t || 'n/a')}</span><span class="${cls(t.hi?.xatr)}">${t.hi ? `${xatr(t.hi.xatr)} · ${fin(t.hi.p252) ? `${t.hi.p252.toFixed(1)}% 1y` : 'n/a'}` : ''}</span></div>
${t.lit.length ? `<span class="lt">lit: ${t.lit.join(', ')}</span>` : ''}</div>`;
  const legend = `<div class="r3-legend"><em>${P} vs IWM, ${esc(dlong(tm.session))} close (2:00 PM MT)</em>${[-15, -11.3, -7.5, -3.8, 0, 3.8, 7.5, 11.3, 15].map((v) => `<span style="background:${heat(v)}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%</span>`).join('')}</div>`;
  const cards = `<section class="panel"><h2>Theme baskets vs IWM · ${P} · strongest first</h2><p class="sub">Header = equal-weight basket move minus IWM over ${P} · bars = last 21 sessions of the daily basket move vs IWM (newest right) · lowest / highest = members with the lowest and highest stretch vs the 8 EMA (× ATR) with their 1-yr pctl · white outline = lit by a rule</p>
<div class="r3-cards">${M.themes.map(card).join('')}</div>${legend}</section>`;
  const mRow = (m) => `<tr><th>${esc(m.t)} <span class="chip">${capBucket(m.cap) || 'cap n/a'}</span><small>${esc(m.themes.join(', '))}</small></th><td class="${cls(m.xatr)}">${xatr(m.xatr)}</td><td>${fin(m.p252) ? `${m.p252.toFixed(1)}%` : 'not measured'}<small>1-yr pctl</small></td><td class="${cls(m.d1)}">${pct(m.d1)}</td><td class="opt ${cls(m.d5)}">${pct(m.d5)}</td><td class="opt">${fin(m.price) ? `$${m.price.toFixed(2)}` : 'n/a'}<small>${money(m.cap)}</small></td><td class="l opt r3-nb">no base rate yet</td></tr>`;
  const mTbl = (list, side, title, key) => `<div><h3 class="r3-h3 ${side}">${title} <small>${list.length} names</small></h3><div class="tw"><table class="t" data-sk-cap="12" data-sk-cap-key="${key}"><thead><tr><th class="l">Member · cap<small>theme</small></th><th>Stretch<small>vs 8 EMA</small></th><th>Pctl<small>1-yr, 252 s</small></th><th>1D</th><th class="opt">5D</th><th class="opt">Last<small>cap</small></th><th class="l opt">After similar<small>stretch</small></th></tr></thead><tbody>${list.length ? list.map(mRow).join('') : '<tr><td colspan="7" class="l">No members in this filter.</td></tr>'}</tbody></table></div></div>`;
  const lens = `<section class="panel"><h2>Mean-reversion lens: theme members stretched below | above · ${M.nNames} names</h2><p class="sub">Stretch = (close − 8 EMA) ÷ ATR 14 on the theme feed · pctl is 1-year (this feed has no 2-yr) · members as of ${esc(mtStamp(tm.members_measured_at))} · per-name base rate: no base rate yet</p>
<div class="grid2">${mTbl(M.below, 'dn', 'Stretched below the 8 EMA · furthest first', 'r3-th-below')}${mTbl(M.above, 'up', 'Stretched above the 8 EMA · furthest first', 'r3-th-above')}</div></section>`;
  return `<div class="sk r3">${head}${read}${bar}${tiles}${cards}${lens}</div>`;
}

export function mountRc2Themes(host) {
  if (!host) return null;
  let st = { period: 'd1', cap: 'All' }; try { st = { ...st, ...JSON.parse(localStorage.getItem('rc2.themes') || '{}') }; } catch { /* no storage */ }
  let data = null;
  const draw = () => { if (data) host.innerHTML = renderThemes(data, st); };
  host.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-r3t-period],[data-r3t-cap]'); if (!b) return;
    if (b.dataset.r3tPeriod) st.period = b.dataset.r3tPeriod; if (b.dataset.r3tCap) st.cap = b.dataset.r3tCap;
    try { localStorage.setItem('rc2.themes', JSON.stringify(st)); } catch { /* no storage */ }
    draw();
  });
  return fetch('./data/themes-matrix.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`themes-matrix.json HTTP ${r.status}`); return r.json(); })
    .then((j) => { data = j; draw(); })
    .catch((e) => { host.innerHTML = `<div class="loading-card">Themes block could not load: ${esc(e.message)}</div>`; });
}
