// RC2 C3c Smart money top block. Copies (T3 sample): Capitol Trades count tiles + cap filter and filed-after days; Quiver
// return since the filing; HedgeFollow quarter stamp + top-5 buyer chips; OpenInsider cluster table with returns in the row.
// MR spin: smart-money names at a 2-yr stretch extreme, long side | short side. Every headline count prints its rule; every
// source prints its own as-of (13F one quarter behind, House last built Sep 30, Senate not covered). No grades, no buy/sell calls.
import { esc, fin, pct, xatr, money, cls, dshort, dlong, mtStamp, mt24, smartModel, mrIndex, CAPS, capBucket, EXCL_NOTE } from './rc2-t3-lib.mjs?v=V2.23.0';

import { infoChip } from './info-chip.mjs?v=V2.23.0';
const pills = (key, opts, cur, label) => `<span class="r3-pg" role="group" aria-label="${esc(label)}"><em>${esc(label)}</em>${opts.map(([v, l]) => `<button type="button" class="r3-pill${cur === v ? ' on' : ''}" data-${key}="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</span>`;
const tile = (k, v, s, extra = '') => `<div class="tile${extra ? ` ${extra}` : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const pbar = (p) => (fin(p) ? `<span class="r3-pbar"><i><b style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></b></i>${(+p).toFixed(1)}%</span>` : 'not measured');
const lagTxt = (d) => (fin(d) ? `${d} day${d === 1 ? '' : 's'}` : 'not measured');
const utcStampToIso = (s) => { const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/.exec(String(s || '')); return m ? `${m[1]}T${m[2]}:00Z` : null; };

export function renderSmart(sm, lens, MR, ui = {}) {
  const M = smartModel(sm, lens, MR, ui); const { U } = M;
  const f13 = sm.f13 || {}; const pol = sm.politicians || {}; const etf = lens.etf || {};
  const polBuilt = mtStamp(utcStampToIso(pol.built_utc_stamp));
  const asofsHtml = `<div class="r3-asofs">
<div><b>Prices + stretch</b>${esc(dlong(M.asof))} close, 2:00 PM MT · feed built ${esc(mt24(sm.built_mt))}</div>
<div><b>Form 4 + 13D / 13G</b>filings through ${esc(dlong(M.cAsof))} · built ${esc(mt24(sm.clusters?.asof_mt))}</div>
<div class="stale"><b>13F · ${esc(f13.quarter || 'n/a')} · one quarter behind</b>positions as of ${esc(dlong(f13.period_end))}, filed ${esc(dshort(f13.filed_first))} to ${esc(dlong(f13.filed_last))}</div>
<div class="stale"><b>House trades · stale · Senate not covered</b>last built ${esc(polBuilt)} · filed ${esc(dshort(pol.filed_span?.first))} to ${esc(dlong(pol.filed_span?.last))} · prices to ${esc(dlong(pol.price_asof))}</div>
<div><b>ETF flows · week to ${esc(dlong(etf.week_end))}</b>built ${esc(mt24(etf.built))}</div>
</div>`;
  const lo = M.below[0]; const hi = M.above[0];
  const readHtml = `<p class="read">${M.extN} smart-money names sit at a 2-yr stretch extreme at the ${esc(dshort(M.asof))} close: <b>${M.below.length}</b> at or below the 5th pctl and <b>${M.above.length}</b> at or above the 95th.${lo ? ` Furthest below: <b>${esc(lo.t)}</b> ${xatr(lo.x)} (${lo.p2.toFixed(1)}% pctl).` : ''}${hi ? ` Furthest above: <b>${esc(hi.t)}</b> ${xatr(hi.x)} (${hi.p2.toFixed(1)}% pctl).` : ''} Insider clusters in the last 30 days: ${M.clusters.length} companies, ${money(M.clusterUsd)} bought.</p>`;
  const rule = `<details class="r3-method"><summary>Method: rules behind the counts</summary><p class="r3-rule"> "of ${M.universe.toLocaleString('en-US')}" = smart-money lens tickers priced on ${esc(dshort(M.asof))} with a 2-yr stretch pctl and no price gap (${M.lensTickers.toLocaleString('en-US')} tickers in the lens; ${EXCL_NOTE}). A name counts toward "${M.extN}" when that pctl is ≤ 5th or ≥ 95th AND it has at least one smart-money row (Form 4 cluster or single buy, 13D / 13G, 13F, House trade or ETF flow). Insider clusters = Form 4 code P buys by 2+ insiders within 10 days, window ending after ${esc(dshort(M.cFrom))} (30 days before the ${esc(dshort(M.cAsof))} filings as-of), IPO / SPAC allocation suspects hidden.</p></details>`;
  const bar = `<div class="r3-bar">${pills('r3s-cap', CAPS.map((c) => [c, c]), U.cap, 'Cap')}${infoChip("Tiles and tables count the current filter · cap = MR map cap, else the filing's cap · small under $2B, mid $2B to $10B, large over $10B")}</div>`;
  const top = M.roll[0];
  const tiles = `<div class="strip r3-strip">
${tile('At a 2-yr stretch extreme', `${M.extN} <small>names</small>`, `${M.below.length} ≤ 5th · ${M.above.length} ≥ 95th · of ${M.universe.toLocaleString('en-US')} lens names with a 2-yr pctl (rule in Method)`, 'mr')}
${tile('Insider cluster buys · 30 days', money(M.clusterUsd), `${M.clusters.length} companies · 2+ insiders each · windows ending ${esc(dshort(M.cFrom))} to ${esc(dshort(M.cAsof))}`)}
${tile('New 13D stakes · 30 days', `${M.d13.length} <small>filings</small>`, `rule: Schedule 13D family, filed after ${esc(dshort(M.cFrom))} through ${esc(dshort(M.cAsof))}`)}
${tile(`13F most bought · ${esc(f13.quarter || 'n/a')}`, top ? esc(top.ticker) : 'n/a', top ? `${top.n_buyers} buyers · ${money(top.buy_usd)} · rule: most buying managers of ${f13.managers_total ?? 'n/a'} tracked · one quarter behind` : 'no 13F rows in this filter')}
${tile(`ETF net flow · week to ${esc(dshort(etf.week_end))}`, `<span class="${cls(etf.net_usd)}">${fin(etf.net_usd) && etf.net_usd > 0 ? '+' : ''}${money(etf.net_usd)}</span>`, `${(etf.funds ?? 0).toLocaleString('en-US')} funds · ${(etf.clean_n ?? 0).toLocaleString('en-US')} clean rows (all caps)`)}
</div>`;
  const row = (r) => {
    const e = r.e;
    return `<tr class="r3-edge"><th>${esc(r.t)} <span class="chip">${r.capB || 'cap n/a'}</span>${e.stale ? ' <span class="chip">stale</span>' : ''}<small>${esc(e.k)} · ${esc(e.who)}</small></th>`
      + `<td class="opt">${dshort(e.filed)}<small>event ${dshort(e.date)}</small></td><td>${lagTxt(e.lag)}</td>`
      + `<td class="${cls(e.since)}">${pct(e.since)}<small>${esc(e.sinceL || '')}</small></td><td class="${cls(r.x)}">${xatr(r.x)}</td><td>${pbar(r.p2)}</td></tr>`;
  };
  const tbl = (list, side, title, key) => `<div><h3 class="r3-h3" data-side="${side}">${title} <small>${list.length} names</small></h3><div class="tw"><table class="t" data-sk-cap="12" data-sk-cap-key="${key}"><thead><tr><th class="l">Name · latest filing</th><th class="opt">Filed</th><th>Filed<small>after</small></th><th>Since<small>the filing</small></th><th>Stretch<small>vs 8 EMA</small></th><th>2-yr pctl</th></tr></thead><tbody>${list.length ? list.map(row).join('') : '<tr><td colspan="6" class="l">No names in this filter.</td></tr>'}</tbody></table></div></div>`;
  const lensP = `<section class="panel"><h2>Mean-reversion lens: smart-money names at a 2-yr stretch extreme · long side | short side</h2><p class="sub">Stretch = (close − 8 EMA) ÷ ATR 14, ranked in the name's own last ${lens.sessions_window ?? 504} sessions · every row qualifies, so gold is an edge only · filed after = days from the event to the filing · since the filing = % move from the event or filing reference to the ${esc(dshort(M.asof))} close · descriptive, not an edge claim · per-name base rate: no base rate yet</p>
<div class="grid2">${tbl(M.below, 'dn', 'At or below the 5th pctl · furthest below first', 'r3-sm-below')}${tbl(M.above, 'up', 'At or above the 95th pctl · furthest above first', 'r3-sm-above')}</div></section>`;
  const cRow = (r) => `<tr><th>${esc(r.ticker)} <span class="chip">${capBucket(r.market_cap) || 'cap n/a'}</span><small>${esc(r.issuer_name)} · ${r.n_insiders} insiders · ${esc((r.titles || []).slice(0, 3).join(' · '))}</small></th><td>${money(r.total_usd)}</td><td class="opt">${dshort(r.window_end)}<small>filed ${dshort(r.last_filed)}</small></td><td>${lagTxt(r.lag_days)}</td><td class="${cls(r.mr?.since_first_buy_pct)}">${pct(r.mr?.since_first_buy_pct)}</td><td class="${cls(r.x)}">${xatr(r.x)}</td><td>${pbar(r.p2)}</td></tr>`;
  const dRow = (r) => `<tr><th>${esc(r.ticker)} <span class="chip">${capBucket(r.market_cap) || 'cap n/a'}</span><small>${esc(r.subject_name)} · ${esc(r.filer)}</small></th><td>${fin(r.percent_class) ? `${r.percent_class}%` : 'not stated'}</td><td class="opt">${dshort(r.filed_day)}<small>event ${dshort(r.event_date)}</small></td><td class="${cls(r.mr?.since_filed_pct)}">${pct(r.mr?.since_filed_pct)}</td></tr>`;
  const fRow = (r) => `<tr><th>${esc(r.ticker)} <span class="chip">${capBucket(r.market_cap) || 'cap n/a'}</span><small>${esc(r.name)}</small></th><td>${r.n_buyers}<small>${r.n_new} new · ${r.n_add} added</small></td><td>${money(r.buy_usd)}</td><td>${r.n_sellers}</td><td class="${cls(r.mr?.vs_qe_price_pct)}">${pct(r.mr?.vs_qe_price_pct)}<small>since quarter end</small></td><td class="l opt r3-chips">${(r.buyers || []).slice(0, 5).map((b) => `<span class="chip">${esc(b)}</span>`).join(' ')}</td></tr>`;
  const fold = (title, span, inner) => `<details class="r3-fold"><summary>${title}<span>${span}</span></summary><div class="body">${inner}</div></details>`;
  const folds = fold(`Insiders · cluster buys, last 30 days · ${M.clusters.length}`, `Form 4 code P, 2+ insiders within 10 days · IPO / SPAC suspects hidden · filings to ${esc(dshort(M.cAsof))}`,
    `<div class="tw"><table class="t" data-sk-cap="12" data-sk-cap-key="r3-sm-cl"><thead><tr><th class="l">Name · insiders</th><th>Bought</th><th class="opt">Window end<small>last filed</small></th><th>Filed<small>after</small></th><th>Since<small>first buy</small></th><th>Stretch<small>vs 8 EMA</small></th><th>2-yr pctl</th></tr></thead><tbody>${M.clusters.map(cRow).join('')}</tbody></table></div>`)
    + fold(`13D · new stakes, last 30 days · ${M.d13.length}`, 'Schedule 13D family · % of class as filed',
      `<div class="tw"><table class="t" data-sk-cap="12" data-sk-cap-key="r3-sm-13d"><thead><tr><th class="l">Name · filer</th><th>% of class</th><th class="opt">Filed<small>event</small></th><th>Since<small>filed</small></th></tr></thead><tbody>${M.d13.map(dRow).join('')}</tbody></table></div>`)
    + fold(`13F · ${esc(f13.quarter || 'n/a')} most-bought names · one quarter behind`, `positions as of ${esc(dlong(f13.period_end))} · quarter stamped on the title · chips = first 5 buying managers`,
      `<div class="tw"><table class="t" data-sk-cap="12" data-sk-cap-key="r3-sm-13f"><thead><tr><th class="l">Name</th><th>Buyers<small>managers</small></th><th>Bought</th><th>Sellers<small>managers</small></th><th>Price<small>vs quarter end</small></th><th class="l opt">Buyers (first 5)</th></tr></thead><tbody>${M.roll.slice(0, 40).map(fRow).join('')}</tbody></table></div>`);
  // R54: provenance + summary fold into the ⓘ chip; the stale feeds keep one short visible flag (R83: never stale as current).
  const staleTxt = [f13.quarter ? `13F ${f13.quarter} one quarter behind` : '', 'House trades stale'].filter(Boolean).join(' · ');
  const asofs = '', read = '';
  return `<div class="sk r3"><div class="head r3-head"><h1>Smart money</h1>${infoChip(asofsHtml.replace(/<\/div>/g, ' · '), readHtml)}<span class="r3-staleflag" title="${esc(staleTxt)}">${esc(staleTxt)}</span></div>${asofs}${read}${rule}${bar}${tiles}${lensP}${folds}<p class="note">House trades: STOCK Act ranges, never exact; the full House, 13F and fund tables stay in the classic view below. Not built here: borrow / utilization, dark-pool prints and insider sells are not on our data; 2m charts for these names are not in the Lab feeds (the classic view's name card draws one per clicked row).</p><p class="r3-classic">Classic view: it counts on its own rule, so its numbers can differ from the block above <span>· its lens counts a name at a 2-yr extreme on the event day OR at the close (the block above: at the close only) · each panel prints its rule in its sub-line · click a row for its name card and 2m chart</span></p></div>`;
}

export function mountRc2Smart(host) {
  if (!host) return null;
  let st = { cap: 'All' }; try { st = { ...st, ...JSON.parse(localStorage.getItem('rc2.smart') || '{}') }; } catch { /* no storage */ }
  let D = null;
  const draw = () => { if (D) host.innerHTML = renderSmart(D.sm, D.lens, D.MR, st); };
  host.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-r3s-cap]'); if (!b) return;
    st.cap = b.dataset.r3sCap; try { localStorage.setItem('rc2.smart', JSON.stringify(st)); } catch { /* no storage */ }
    draw();
  });
  host.innerHTML = '<div class="loading-card">Loading the smart-money lens…</div>';
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${u.split('/').pop()} HTTP ${r.status}`); return r.json(); });
  return Promise.all([get('./data/smartmoney.json'), get('./data/smartmoney-lens.json'), get('./data/mrmap.json').catch(() => null)])
    .then(([sm, lens, mm]) => { D = { sm, lens, MR: mrIndex(mm) }; draw(); })
    .catch((e) => { host.innerHTML = `<div class="loading-card">Smart money block could not load: ${esc(e.message)}</div>`; });
}
