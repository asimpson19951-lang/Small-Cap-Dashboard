// RC2 C3a · MARKET tab (MR map sub-view) addition: stretch summary above the V2.20.0 MR map.
// From the T1 Market sample, with the red-team notes fixed: F5 no SNDK / SENEA anywhere (a count only), F9 the universe in
// every tile title, the table follows the cap filter, caps follow the board law (small < $2B, mid $2B to $10B, large > $10B).
// Copies: StockCharts MarketCarpets (Table button, pinned mini chart), TradingView heat map (control row + result count).
// Standalone: reads ./data/mrmap.json + ./data/rc2-t1.json (pinned candles); renders into #r2Market (data-market-pane="mr").
import { esc, finite, fX, fP, fPct, fBig, fInt, ud, isExt, dLabel, mtTime, candleChart, capBucket, loadJson, mountHost } from './rc2-t1-lib.mjs?v=V2.21.0';

export const EXCLUDED = ['SNDK', 'SENEA']; // split artefacts: never shown by name
export const CAPS = [['All', 'All'], ['Small', 'Small <$2B'], ['Mid', 'Mid $2B–10B'], ['Large', 'Large >$10B']];
export const LIQ_MIN_K = 5000; // 20D $vol >= $5M (mrmap dv is in $K)
const LS = 'rc2.market';
const prefs = () => { try { return { cap: 'All', view: 'rails', all: false, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { cap: 'All', view: 'rails', all: false }; } };
const save = (p) => { try { localStorage.setItem(LS, JSON.stringify({ cap: p.cap, view: p.view })); } catch { /* private mode */ } };

/** mrmap rows -> objects; drops the split-artefact names and counts them. Pure. */
export function decodeMr(mr) {
  const c = Object.fromEntries((mr?.cols || []).map((k, i) => [k, i]));
  const all = (mr?.rows || []).map((r) => ({ t: r[c.t], name: r[c.name], cap: r[c.cap], c: r[c.c], x: finite(r[c.x]), xv: finite(r[c.vw]) != null && finite(r[c.atr]) ? (r[c.c] - r[c.vw]) / r[c.atr] : null, pc: finite(r[c.pc]), dv: r[c.dv], d1: finite(r[c.d1]), bkt: capBucket(r[c.cap]) }));
  const rows = all.filter((r) => !EXCLUDED.includes(r.t));
  return { rows, excluded: all.length - rows.length, total: all.length };
}
/** Liquid names in one cap bucket. Pure. */
export const universe = (rows, cap) => rows.filter((r) => r.dv >= LIQ_MIN_K && r.x != null && (cap === 'All' || r.bkt === cap));
const capWord = (cap) => (cap === 'All' ? 'liquid names' : `liquid ${cap.toLowerCase()} caps`);
const median = (v) => { const s = v.filter((q) => q != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Summary numbers for one cap bucket. Pure. */
export function summary(rows, cap) {
  const U = universe(rows, cap); const n = U.length;
  const below = U.filter((r) => r.x < 0), above = U.filter((r) => r.x > 0);
  const lo = [...U].sort((a, b) => a.x - b.x), hi = [...U].sort((a, b) => b.x - a.x);
  return { n, U, ext: U.filter((r) => isExt(r.pc)).length, below: below.length, above: above.length, b2: U.filter((r) => r.x <= -2).length, a2: U.filter((r) => r.x >= 2).length, med: median(U.map((r) => r.x)), medPc: median(U.map((r) => r.pc)), lo, hi };
}

const chip = (b) => (b ? `<span class="r2-cap">${esc(b)}</span>` : '');
const xCell = (v) => `<td class="${ud(v)}">${fX(v)}</td>`;
function railTable(list, title, sub) {
  const body = list.map((r) => `<tr class="${isExt(r.pc) ? 'ext' : ''}"><th><b>${esc(r.t)}</b> ${chip(r.bkt)}</th>${xCell(r.x)}<td class="opt ${ud(r.xv)}">${fX(r.xv)}</td><td>${fP(r.pc)}</td><td class="opt">${fBig(r.dv * 1000, '$')}</td><td class="${ud(r.d1)}">${fPct(r.d1)}</td></tr>`).join('');
  return `<section class="panel"><h2>${title}</h2><p class="sub">${sub}</p><div class="tw"><table class="t"><thead><tr><th class="l">Ticker</th><th>8EMA ×ATR</th><th class="opt">VWAP20 ×ATR</th><th>2-yr pctl</th><th class="opt">20D $vol</th><th>1D</th></tr></thead><tbody>${body || '<tr><td colspan="6">no names in this bucket</td></tr>'}</tbody></table></div></section>`;
}

/** Whole summary block for the chosen cap bucket + view. Pure. */
export function renderMarketRc2(dec, mr, D, st) {
  const S = summary(dec.rows, st.cap); const w = capWord(st.cap); const of = `of ${fInt(S.n)} ${w}`;
  const lo0 = S.lo[0], hi0 = S.hi[0];
  const read = S.n ? `${fInt(S.ext)} ${of} sit at a 2-yr stretch extreme (≤5th / ≥95th pctl of their own ×ATR). Most stretched below the 8EMA: <b>${esc(lo0.t)} ${fX(lo0.x)} ATR</b> (${fP(lo0.pc)} pctl); above: <b>${esc(hi0.t)} ${fX(hi0.x)} ATR</b> (${fP(hi0.pc)} pctl). ${fInt(S.b2)} sit ≥2× ATR below and ${fInt(S.a2)} ≥2× ATR above.` : `No ${w} in this bucket.`;
  const tile = (k, v, s, ext = false) => `<div class="tile${ext ? ' ext' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const tiles = `<div class="strip r2-mstrip">${tile(`At a 2-yr extreme · ${of}`, `${fInt(S.ext)} names`, `${S.n ? fP((S.ext / S.n) * 100) : 'not measured'} of them · ≤5th or ≥95th pctl`)}${tile(`Below 8EMA · long side · ${of}`, `${fInt(S.below)} names`, lo0 ? `most: ${esc(lo0.t)} ${fX(lo0.x)} ATR` : 'not measured')}${tile(`Above 8EMA · short side · ${of}`, `${fInt(S.above)} names`, hi0 ? `most: ${esc(hi0.t)} ${fX(hi0.x)} ATR` : 'not measured')}${tile(`≥2× ATR from 8EMA · ${of}`, `<span class="dn">${fInt(S.b2)}</span> below · <span class="up">${fInt(S.a2)}</span> above`, 'counts · no base rate yet')}${tile(`Median 8EMA distance · ${of}`, `<span class="${ud(S.med)}">${fX(S.med)} ATR</span>`, `median 2-yr pctl ${fP(S.medPc)}`)}</div>`;
  const pills = (key, opts) => `<div class="r2-pills" role="group">${opts.map(([k, l]) => `<button type="button" data-r2m-${key}="${k}" aria-pressed="${st[key] === k}">${esc(l)}</button>`).join('')}</div>`;
  const ctl = `<div class="r2-ctl"><span class="lab">View</span>${pills('view', [['rails', 'Rails'], ['table', 'Table']])}<span class="lab">Caps</span>${pills('cap', CAPS)}<span class="r2-count">${fInt(S.n)} ${w} (20D $vol ≥ $5M) of ${fInt(dec.total)} names on the map · ${dec.excluded} names with split artefacts excluded</span></div>`;
  let body;
  if (st.view === 'table') {
    const list = S.lo; const cap = st.all ? list.length : 15;
    body = `<section class="panel"><h2>Every ${w}, most stretched below the 8EMA first</h2><p class="sub">${fInt(list.length)} names · follows the Caps filter · gold left edge = 2-yr extreme</p><div class="tw r2-mtab"><table class="t"><thead><tr><th class="l">Ticker</th><th class="l opt">Name</th><th>Price</th><th>8EMA ×ATR</th><th class="opt">VWAP20 ×ATR</th><th>2-yr pctl</th><th class="opt">20D $vol</th><th>1D</th></tr></thead><tbody>${list.slice(0, cap).map((r) => `<tr class="${isExt(r.pc) ? 'ext' : ''}"><th><b>${esc(r.t)}</b> ${chip(r.bkt)}</th><td class="l opt w">${esc(r.name)}</td><td>${fBig(r.c, '$') === 'not measured' ? 'not measured' : `$${r.c.toFixed(2)}`}</td>${xCell(r.x)}<td class="opt ${ud(r.xv)}">${fX(r.xv)}</td><td>${fP(r.pc)}</td><td class="opt">${fBig(r.dv * 1000, '$')}</td><td class="${ud(r.d1)}">${fPct(r.d1)}</td></tr>`).join('')}</tbody></table></div>${list.length > 15 ? `<button type="button" class="r2-more" data-r2m-all="1">${st.all ? 'Show 15' : `Show all ${fInt(list.length)}`}</button>` : ''}</section>`;
  } else {
    body = `<div class="r2-rails">${railTable(S.lo.slice(0, 12), 'Stretched below 8EMA · long side', `Top 12 of ${fInt(S.below)} ${w} below · gold left edge = 2-yr extreme`)}${railTable(S.hi.slice(0, 12), 'Stretched above 8EMA · short side', `Top 12 of ${fInt(S.above)} ${w} above · gold left edge = 2-yr extreme`)}</div>`;
  }
  const pin = (r, side) => { const b = r && D?.pins?.bars?.[r.t]; return `<section class="panel"><h2>${r ? `${esc(r.t)} · most stretched ${side} · ${fX(r.x)} ATR · ${fP(r.pc)} 2-yr pctl` : `most stretched ${side}: none`}</h2>${b ? `<div class="r2-chart-wd">${candleChart(b, { w: 900, h: 400, title: `${r.t} · daily · 60 sessions · % scale vs the prior close` })}</div><div class="r2-chart-ph">${candleChart(b, { w: 380, h: 280, title: `${r.t} · daily · 60 sessions`, compact: true })}</div>` : '<p class="sub">chart not measured (no pinned bars for this name)</p>'}</section>`; };
  const pins = `<div class="r2-pins">${pin(lo0, 'below')}${pin(hi0, 'above')}</div><p class="note">Long and short side by side. VWAP20 ×ATR = (close − 20-session VWAP) ÷ ATR14 from mrmap fields. Base rate for these names: <b>no base rate yet</b> (the map carries no after-similar-stretch history per name). Pinned charts: Massive grouped daily bars (not split-adjusted), StockCharts shows them on hover, pinned here.</p>`;
  return `<div class="head r2-mhead"><h2>Stretch summary</h2><span class="r2-meta">mrmap.json to the ${esc(dLabel(mr?.asof))} close, built ${esc(mtTime(mr?.built_utc))} · market caps dated ${esc(dLabel(mr?.cap_from, false))} to ${esc(dLabel(mr?.cap_to, false))}</span></div><p class="read">${read}</p>${tiles}${ctl}${body}${pins}`;
}

async function boot() {
  const anchor = document.getElementById('mrMapRoot'); if (!anchor) return;
  const host = mountHost('r2Market', '#mrMapRoot', 'before', 'r2-market'); if (!host) return;
  host.dataset.marketPane = 'mr'; host.hidden = anchor.hidden;
  host.innerHTML = '<div class="loading-card">Loading the stretch summary…</div>';
  const [mr, D] = await Promise.all([loadJson('./data/mrmap.json'), loadJson('./data/rc2-t1.json')]);
  if (!mr) { host.innerHTML = '<p class="read">MR map file not measured (mrmap.json missing).</p>'; return; }
  const dec = decodeMr(mr); const st = prefs(); if (!CAPS.some((c) => c[0] === st.cap)) st.cap = 'All';
  const draw = () => { host.innerHTML = renderMarketRc2(dec, mr, D, st); };
  draw();
  // The MR map host also serves the Themes map and 52-wk pullback subs: show this block on the MR map sub only.
  const syncSub = () => { const on = document.querySelector('[data-market-sub][aria-pressed="true"]')?.dataset.marketSub; const show = !anchor.hidden && (on == null || on === 'mr'); host.hidden = !show; document.getElementById('view-market')?.classList.toggle('r2-mr', show); };
  syncSub(); new MutationObserver(syncSub).observe(document.querySelector('.market-subnav') || document.body, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
  new MutationObserver(syncSub).observe(anchor, { attributes: true, attributeFilter: ['hidden'] });
  host.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-r2m-cap]'); if (c) { st.cap = c.dataset.r2mCap; st.all = false; save(st); draw(); return; }
    const v = ev.target.closest('[data-r2m-view]'); if (v) { st.view = v.dataset.r2mView; save(st); draw(); return; }
    if (ev.target.closest('[data-r2m-all]')) { st.all = !st.all; draw(); }
  });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
