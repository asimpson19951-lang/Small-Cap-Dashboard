// Standalone lazy board tab. Pure string renderer supports Node smoke tests without jsdom.
export function renderSpreads(d) {
if(!d?.header||!Array.isArray(d.earnings)||!Array.isArray(d.iv_scan))throw new Error('Invalid spreads data');
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const NA = 'n/a';
const M = '−';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 2, sign = false) => (fin(x) ? `${x > 0 && sign ? '+' : x < 0 ? M : ''}${Math.abs(x).toFixed(d)}%` : NA);
const usd = (x, d = 2) => (fin(x) ? `${x < 0 ? M : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}` : NA);
const xx = (x, d = 2) => (fin(x) ? `${x.toFixed(d)}×` : NA);
const pts = (x) => (fin(x) ? `${x > 0 ? '+' : x < 0 ? M : ''}${Math.abs(x).toFixed(2)} vol pts` : NA);
const cnt = (x) => (fin(x) ? (x >= 1e4 ? `${(x / 1e3).toFixed(1)}K` : x.toLocaleString('en-US')) : NA);
const median = (a) => { if(!a.length)return null; const s = [...a].sort((p, q) => p - q); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const midRank = (arr, x) => ((arr.filter((v) => v < x).length + 0.5 * arr.filter((v) => v === x).length) / arr.length) * 100;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dlabel = (iso, dow = true) => { if(!iso || !Number.isFinite(Date.parse(iso)))return NA; const t = new Date(iso + 'T12:00:00Z'); return `${dow ? DOW[t.getUTCDay()] + ' ' : ''}${MON[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const TODAY = d.header.generated_date || new Date().toLocaleDateString('en-CA', {timeZone:'America/Denver'});
const daysTo = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(TODAY + 'T12:00:00Z')) / 864e5);
const SESS = { 'time-pre-market': 'before open', 'time-after-hours': 'after close', 'time-not-supplied': 'time not given' };
const bar = (frac, cls) => !fin(frac) ? '' : `<i class="db ${cls}" style="width:${Math.max(2, Math.min(100, frac * 100)).toFixed(1)}%"></i>`;
// signed vs a reference: green above, red below (heat-map law)
const vsRef = (x, ref) => (!fin(x) ? '' : x > ref ? 'up' : x < ref ? 'dn' : '');
const pbar = (p, ext) => !fin(p) ? '' : `<span class="pbar${ext ? ' ext' : ''}"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span>`;

// ---------- earnings rows ----------
const E = d.earnings.map(e => ({t:esc(e.ticker),spot:e.spot_usd,next:e.next_er,s:{front_expiry:e.front_expiry,atm_strike_usd:e.atm_strike_usd,call_last_usd:e.call_last_usd,put_last_usd:e.put_last_usd,straddle_last_usd:e.straddle_usd},raw:e.straddle_pct,imp:e.implied_move_pct,mv:e.events||[],abs:(e.events||[]).filter(h=>fin(h.move_pct)).map(h=>Math.abs(h.move_pct)),mean:e.mean_abs_pct,med:e.median_abs_pct,mx:Math.max(...(e.events||[]).filter(h=>fin(h.move_pct)).map(h=>Math.abs(h.move_pct))),mn:Math.min(...(e.events||[]).filter(h=>fin(h.move_pct)).map(h=>Math.abs(h.move_pct))),outN:e.outside_count,ownN:e.own_implied_count,histN:e.history_events,ratio:e.implied_over_mean_x,rawRatio:e.raw_ratio_x,pctl:e.implied_midrank_pct,ext:e.mr_extreme,assumed:(e.events||[]).some(h=>h.session_assumed),days:e.days_to_er}));
const maxImp = Math.max(...E.map((e) => e.imp));
const chip = h => {
  const o=h.chip==='outside', unavailable=h.chip==='n/a';
  const tip = 'ER '+h.er_date+' · close '+(h.base_close_date||NA)+' '+usd(h.base_close_usd)+' → '+(h.react_close_date||NA)+' '+usd(h.react_close_usd)+' · '+pct(h.move_pct,2,true)+' · own pre-ER implied '+pct(h.own_implied_pct)+' · '+h.chip+(h.session_assumed?' · session assumed':' · filing-time session')+(h.own_quote_date?' · prints '+h.own_quote_date:'')+(h.own_implied_note?' · '+h.own_implied_note:'');
  return '<span tabindex="0" class="chip '+(unavailable?'unavailable':o?'out':'in')+' '+(fin(h.move_pct)?h.move_pct>=0?'up':'dn':'')+'" title="'+esc(tip)+'"><b>'+(unavailable?'n/a':o?'O':'I')+'</b>'+(fin(h.move_pct)?pct(h.move_pct,1,true):'')+'</span>';
};
const erRow = (e) => `<tr class="${e.ext ? 'gold' : ''}">
<th class="tk">${e.t}</th>
<td class="l">${dlabel(e.next.date)} <span class="tag">${SESS[e.next.session] || NA}</span> <span class="sm">${e.days ?? daysTo(e.next.date)} days</span></td>
<td>${usd(e.spot)}</td>
<td class="l sm">${dlabel(e.s.front_expiry, false)} · ${usd(e.s.atm_strike_usd)} K</td>
<td title="call ${usd(e.s.call_last_usd)} + put ${usd(e.s.put_last_usd)} (last prints)">${usd(e.s.straddle_last_usd)}</td>
<td>${pct(e.raw)}</td>
<td class="bc"><span class="num">±${pct(e.imp)}</span>${bar(e.imp / maxImp, 'nb')}</td>
<td class="l chips">${e.mv.map((h) => chip(h, e.imp)).join('')}</td>
<td>${pct(e.mean)}</td>
<td>${pct(e.med)}</td>
<td class="bc" title="raw straddle ÷ mean = ${xx(e.rawRatio, 3)}"><span class="num ${vsRef(e.ratio, 1)}">${xx(e.ratio)}</span>${bar(Math.min(e.ratio, 2) / 2, vsRef(e.ratio, 1))}</td>
<td class="pc">${pbar(e.pctl, !!e.ext)}<span class="num">${pct(e.pctl, 1)}</span></td>
<td>${e.outN} of ${e.ownN}<small class="sm">past implied n = ${e.ownN}; past moves n = ${e.histN}</small></td>
<td class="sm na">${NA}</td>
</tr>`;

// ---------- IV scan rows ----------
const S = d.iv_scan.map(e => ({r:{ticker:esc(e.ticker),spot_usd:e.spot_usd,atm_iv_30d_pct:e.atm_iv_30d_pct,atm_iv_60d_pct:e.atm_iv_60d_pct,iv30_over_rv20_x:e.iv30_over_hv20_x,rv20_annualized_pct:e.hv20_pct,term_60d_over_30d_x:e.term_60d_over_30d_x,skew25d_put_iv_pct:e.put25_iv_pct,skew25d_call_iv_pct:e.call25_iv_pct,skew25d_put_minus_call_volpts:e.skew_vol_pts,expected_move_30d_from_iv_pct:e.expected_move_30d_pct,liquidity_30d_expiry:{oi_contracts:e.total_oi,volume_contracts:e.total_volume,atm_call_oi:null,atm_put_oi:null}},rank:e.iv_rank_pct,pctlPast:e.iv_percentile_pct,n:e.history_sessions_own+e.history_sessions_approx,ed:e.next_er,erIn30:e.er_expiry_tag==='before 30d expiry',outside:null,own:e.history_sessions_own,approx:e.history_sessions_approx,basis:e.history_label,gold:e.mr_iv||e.mr_skew,mrIv:e.mr_iv,mrSkew:e.mr_skew,skewPctl:e.skew_percentile_pct,putDelta:e.put25_delta,callDelta:e.call25_delta,exp:e.skew_expiry}));
const scan=S.map(s=>s.r);
const maxIv = Math.max(...S.map((s) => s.r.atm_iv_30d_pct));
const maxOi = Math.max(...S.map((s) => s.r.liquidity_30d_expiry.oi_contracts));
const maxVol = Math.max(...S.map((s) => s.r.liquidity_30d_expiry.volume_contracts));
const ivRow = (s) => {
  const r = s.r, L = r.liquidity_30d_expiry;
  const inv = fin(r.term_60d_over_30d_x) && r.term_60d_over_30d_x < 1;
  const skew = r.skew25d_put_minus_call_volpts;
  return `<tr class="${s.gold ? 'gold' : ''}">
<th class="tk">${r.ticker}</th>
<td>${usd(r.spot_usd)}</td>
<td class="l sm">${s.ed ? `${dlabel(s.ed.date, false)}${s.erIn30 ? ' <span class="tag">before 30d expiry</span>' : ' <span class="tag">after 30d expiry</span>'}` : (['SPY','QQQ','IWM'].includes(r.ticker) ? 'fund, no ER' : NA)}</td>
<td class="bc"><span class="num">${pct(r.atm_iv_30d_pct)}</span>${bar(r.atm_iv_30d_pct / maxIv, 'nb')}</td>
<td>${pct(r.atm_iv_60d_pct)}</td>
<td class="pc">${fin(s.rank) ? `${pbar(s.rank, s.mrIv)}<span class="num">${pct(s.rank, 0)}</span>` : `<span class="na">${NA}</span>`}</td>
<td class="pc">${fin(s.pctlPast) ? `${pbar(s.pctlPast, s.mrIv)}<span class="num">${pct(s.pctlPast, 0)}</span>` : `<span class="na">${NA}</span>`}</td>
<td class="sm history">${s.own} own sessions<br>${s.approx} approx sessions<br><span class="tag">${s.n ? esc(s.basis) : 'no history'}</span></td>
<td class="bc"><span class="num ${vsRef(r.iv30_over_rv20_x, 1)}">${xx(r.iv30_over_rv20_x)}</span>${bar(Math.min(r.iv30_over_rv20_x, 2.2) / 2.2, vsRef(r.iv30_over_rv20_x, 1))}</td>
<td>${pct(r.rv20_annualized_pct)}</td>
<td class="bc"><span class="num ${vsRef(r.term_60d_over_30d_x, 1)}">${xx(r.term_60d_over_30d_x, 3)}${inv ? ' <span class="flag">inverted</span>' : ''}</span>${bar(Math.abs(r.term_60d_over_30d_x - 1) / 0.2, vsRef(r.term_60d_over_30d_x, 1))}</td>
<td title="picked put delta ${fin(s.putDelta)?s.putDelta.toFixed(4):NA} delta · ${esc(s.exp||NA)} expiry">${pct(r.skew25d_put_iv_pct)}</td>
<td title="picked call delta ${fin(s.callDelta)?s.callDelta.toFixed(4):NA} delta · ${esc(s.exp||NA)} expiry">${pct(r.skew25d_call_iv_pct)}</td>
<td class="bc" title="skew past-only percentile ${pct(s.skewPctl)}"><span class="num ${vsRef(skew, 0)}">${fin(skew) ? pts(skew) : NA}${s.mrSkew ? pbar(s.skewPctl,true) : ''}</span>${fin(skew) ? bar(Math.abs(skew) / 5, vsRef(skew, 0)) : ''}</td>
<td>±${pct(r.expected_move_30d_from_iv_pct)}</td>
<td class="bc"><span class="num">${cnt(L.oi_contracts)} contracts</span>${bar(L.oi_contracts / maxOi, 'nb')}</td>
<td class="bc"><span class="num">${cnt(L.volume_contracts)} contracts</span>${bar(L.volume_contracts / maxVol, 'nb')}</td>
<td class="sm">${NA}</td>
</tr>`;
};


const ER_CAP = 15;
const erCard = (e, i = 0) => `<div class="mc${e.ext ? ' gold' : ''}${i >= ER_CAP ? ' mc-x' : ''}"><div class="mc1"><b>${e.t}</b><span>${dlabel(e.next.date)} · ${SESS[e.next.session] || NA} · ${e.days ?? daysTo(e.next.date)} days</span></div>
<div class="mc2"><span>implied <b>±${pct(e.imp)}</b></span><span>÷ mean <b class="${vsRef(e.ratio, 1)}">${xx(e.ratio)}</b></span><span>pctl ${pbar(e.pctl,!!e.ext)}<b>${pct(e.pctl, 0)}</b></span><span><b>${e.outN} of ${e.ownN}</b> outside (past implied n = ${e.ownN}; past moves n = ${e.histN})</span></div>
<div class="chips wrap">${e.mv.map((h) => chip(h, e.imp)).join('')}</div></div>`;
const ivCard = (s) => { const r = s.r; const inv = fin(r.term_60d_over_30d_x) && r.term_60d_over_30d_x < 1; return `<div class="mc${s.gold ? ' gold' : ''}"><div class="mc1"><b>${r.ticker}</b><span>${usd(r.spot_usd)} · ${s.ed ? 'ER ' + dlabel(s.ed.date, false) : ['SPY','QQQ','IWM'].includes(r.ticker)?'fund, no ER':NA}</span></div>
<div class="mc2"><span>IV30 <b>${pct(r.atm_iv_30d_pct)}</b></span><span>IV÷HV20 <b class="${vsRef(r.iv30_over_rv20_x, 1)}">${xx(r.iv30_over_rv20_x)}</b></span><span>60d÷30d <b class="${vsRef(r.term_60d_over_30d_x, 1)}">${xx(r.term_60d_over_30d_x, 3)}</b>${inv ? ' <span class="flag">inverted</span>' : ''}</span><span>skew <b class="${vsRef(r.skew25d_put_minus_call_volpts, 0)}">${pts(r.skew25d_put_minus_call_volpts)}</b></span><span>IV rank <b>${fin(s.rank) ? pct(s.rank, 0) : NA}</b> · IV pctl ${pbar(s.pctlPast,s.mrIv)}<b>${pct(s.pctlPast,0)}</b>${s.mrSkew ? pbar(s.skewPctl,true) : ''} · ${s.own} own sessions · ${s.approx} approx sessions · ${s.n ? esc(s.basis) : 'no history'}</span></div></div>`; };
// ---------- tiles ----------
const spy = scan.find((r) => r.ticker === 'SPY') || {};
const nInv = S.filter((s) => fin(s.r.term_60d_over_30d_x) && s.r.term_60d_over_30d_x < 1).length, nInvEr = S.filter((s) => fin(s.r.term_60d_over_30d_x) && s.r.term_60d_over_30d_x < 1 && s.erIn30).length;
const nGold = E.filter((e) => e.ext).length;
const ratios = E.map((e) => e.ratio).filter(fin);
const top = [...E].filter(e=>fin(e.pctl)).sort((a,b)=>Math.min(a.pctl,100-a.pctl)-Math.min(b.pctl,100-b.pctl))[0] || {t:NA,pctl:null,imp:null,abs:[],mx:null};
const bmo = E.filter((e) => e.next.session === 'time-pre-market').length, amc = E.filter((e) => e.next.session === 'time-after-hours').length;
const lastEr = E.reduce((m, e) => (e.next.date > m ? e.next.date : m), E[0]?.next.date || TODAY);
const tile = (label, date, value, sub1, sub2, gold = false) => `<div class="tile${gold ? ' gold' : ''}"><div class="tl"><span>${label}</span><span class="td">${date}</span></div><div class="tv">${value}</div><div class="ts">${sub1}</div><div class="ts2">${sub2}</div></div>`;
const ownImp = (e) => median(e.mv.map(h => h.own_implied_pct).filter(fin));
const vsOwn = E.map(e => ({ t: e.t, r: fin(ownImp(e)) && ownImp(e) > 0 ? e.imp / ownImp(e) : null })).filter(q => fin(q.r));
const tiles = [
  tile('Reporting window', `to ${dlabel(lastEr, false)}`, `${E.length} names`, `${bmo} before open · ${amc} after close · ${E.length-bmo-amc} time unknown`, 'cap ≥ $'+d.header.min_cap_b+'B'),
  tile('Implied ÷ past implied', 'median', xx(median(vsOwn.map(q => q.r))), vsOwn.length + ' names with past own implied on file', 'straddle runs to its own expiry (see column), so it includes ordinary days before the report'),
  tile('Implied at extreme', 'vs past ERs', `${nGold} names`, nGold ? E.filter((e) => e.ext).map((e) => `${e.t} ${e.ext} past ${e.ext === 'above' ? 'max' : 'min'}`).join(' · ') : `nearest: ${top.t} at ${pct(top.pctl, 1)} pctl`, 'gold row = outside every past move', nGold > 0),
  tile('SPY ATM IV, 30-day', dlabel(d.header.data_session_date), pct(spy.atm_iv_30d_pct), `60-day ${pct(spy.atm_iv_60d_pct)} · 60d/30d ${xx(spy.term_60d_over_30d_x, 3)}`, `±${pct(spy.expected_move_30d_from_iv_pct)} 1-SD move to 30 days`),
  tile('SPY IV ÷ HV20', dlabel(d.header.data_session_date), xx(spy.iv30_over_rv20_x), `HV20 ${pct(spy.rv20_annualized_pct)} annualized`, 'above 1.00× = IV over realized'),
  tile('SPY 25Δ skew', dlabel(d.header.data_session_date), pts(spy.skew25d_put_minus_call_volpts), `put ${pct(spy.skew25d_put_iv_pct)} · call ${pct(spy.skew25d_call_iv_pct)}`, (d.iv_scan.find(r=>r.ticker==='SPY')?.skew_expiry || NA)+' expiry'),
  tile('Term inverted', dlabel(d.header.data_session_date), `${nInv} of ${S.length} names`, `60d ÷ 30d below 1.00×`, `${nInvEr} of them have ER before 30d expiry`),
].join('');

const banner = nGold
  ? `At a past-only extreme: ${E.filter((e) => e.ext).map((e) => `${e.t} implied ±${pct(e.imp)} ${e.ext} every one of its last ${e.abs.length} ER moves (${e.ext === 'above' ? 'max' : 'min'} ${pct(e.ext === 'above' ? e.mx : e.mn)})`).join(' · ')}`
  : `No priced name at a past-only extreme today. Nearest: ${top.t} implied ±${pct(top.imp)} sits at the ${pct(top.pctl, 1)} pctl of its last ${top.abs.length} ER moves (max ${pct(top.mx)})`;

const quickRow = (e) => { const oi = ownImp(e); const exp = dlabel(e.s.front_expiry, false); const xd = Math.round((Date.parse(e.s.front_expiry + "T12:00:00Z") - Date.parse(d.header.data_session_date + "T12:00:00Z")) / 864e5);
return `<tr class="${e.ext ? 'gold' : ''}"><th class="tk">${e.t}<small class="sm">${dlabel(e.next.date)} · ${SESS[e.next.session] || NA}</small></th>
<td class="bc"><span class="num">±${pct(e.imp)}</span>${bar(e.imp / maxImp, 'nb')}<small class="sm">to ${exp} expiry, ${xd} days after the chain</small></td>
<td>${fin(oi) ? '±' + pct(oi) : NA}<small class="sm">median of past same-day implieds</small></td>
<td class="bc"><span class="num ${vsRef(fin(oi) && oi > 0 ? e.imp / oi : null, 1)}">${fin(oi) && oi > 0 ? xx(e.imp / oi) : NA}</span></td>
<td>${e.outN} of ${e.ownN}<small class="sm">past implied n = ${e.ownN}</small></td>
<td class="opt">${pct(e.mean)}<small class="sm">past moves n = ${e.histN}</small></td></tr>`; };
const quick = `<section class="card" id="quick"><div class="head"><div><h2>Earnings this window <small>Quick view</small></h2>
<p class="note">Each straddle is priced to the expiry shown, so it carries ordinary days before the report. Compare it with the same name's past same-day implied moves, not with a flat average.</p></div><div class="asof">sorted by ER date · ${esc(d.header.chain_as_of_mt)}</div></div>
<div class="tw"><table><thead><tr><th class="tk">Ticker · reports</th><th>Implied ± (to expiry)</th><th>Past implied</th><th>Implied ÷ past implied</th><th>Beat implied</th><th class="opt">Mean move</th></tr></thead><tbody>${E.map(quickRow).join('')}</tbody></table></div></section>`;
const deepOpen = '<details class="deep-view"><summary>Deep view <span>full 14-column Spreads table, past-move chips, IV scan, credit spreads, sources</span></summary><div class="deep-body">';
const html = `<main>
<div class="kick">Spreads · earnings straddles · IV scan · credit spreads · raw, no scores</div>
<h1>Spread watcher</h1>
<div class="meta"><b>${esc(d.header.chain_as_of_mt)}</b> · <b>${esc(d.header.data_lag_note)}</b> · ${esc(d.header.print_note)} · built <b>${esc(d.header.generated_mt)}</b> · capture label <b>${esc(d.header.run_label)}</b>${d.header.capture_is_weekend?' · weekend capture of last-session prints':''}<span class="runs">${d.header.scheduled_times_mt.map(t=>'<span class="run">'+esc(t)+'</span>').join('')}</span></div>
<div class="banner${nGold ? '' : ' plain'}">${esc(banner)}</div>
<div class="tiles">${tiles}</div>
${quick}
${deepOpen}

<section class="card" id="er">
<div class="head"><div><h2>Earnings straddles <small>NEXT ${d.header.window_days} DAYS · OPTIONSLAM-STYLE INSIDE / OUTSIDE</small></h2>
<p class="note">Implied move = <b>0.85 ×</b> the ATM straddle of the first expiry after the report ÷ spot (tastytrade / Barchart rule). Each chip is one of up to 12 actual ER moves (close before → close after), <b>O</b> = it moved more than the event's own implied, <b>I</b> = within or equal to its own implied; <b>n/a</b> = no pre-report option bars. Percentile = where today's implied sits among those past moves (past only). Gold row = implied above every past move or below every past move (≥ 8 events).</p></div>
<div class="asof">sorted by ER date · as of ${dlabel(d.header.data_session_date)} MT</div></div>
<div class="tw"><table>
<thead><tr class="grp"><th class="tk"></th><th colspan="1"></th><th colspan="5">Straddle now (front expiry after ER)</th><th colspan="6">Past ER moves (up to 12, close to close)</th><th></th></tr>
<tr><th class="tk">Ticker</th><th class="l">ER date<small>session · days to ER</small></th><th>Spot<small>snapshot spot</small></th><th class="l">Expiry · ATM<small>strike</small></th><th>Straddle<small>raw $</small></th><th>Straddle<small>% of spot</small></th><th>Implied move<small>0.85 × straddle</small></th>
<th class="l">Last moves, oldest → newest<small>O = outside the event's own implied · I = inside</small></th><th>Mean<small>|move|</small></th><th>Median<small>|move|</small></th><th>Implied ÷<small>mean ×</small></th><th class="l">Implied pctl<small>vs past moves</small></th><th>Outside<small>count</small></th><th>IV crush<small>no captures</small></th></tr></thead>
<tbody>${E.map(erRow).join('')}</tbody></table></div>
<div class="mlist er${E.length > ER_CAP ? ' capped' : ''}" id="erList">${E.map(erCard).join('')}${E.length > Er_cap ? `<button type="button" class="er-toggle" data-er-toggle aria-expanded="false" aria-controls="erList">Show all ${E.length}</button>` : ''}</div>
<div class="legend"><span><span class="chip out up"><b>O</b>+4.4%</span>moved more than the event's own implied (up)</span><span><span class="chip out dn"><b>O</b>−6.5%</span>(down)</span><span><span class="chip in up"><b>I</b>+1.5%</span>inside</span><span><span class="sw"></span>past-only extreme</span><span>Hover a chip for the dates and closes.</span></div>
</section>

<section class="card" id="iv">
<div class="head"><div><h2>IV scan <small>Rank · percentile · IV ÷ hv · term · skew · liquidity</small></h2>
<p class="note">IV30 and IV60 are constant-maturity ATM IV (total-variance interpolation, 30 / 60 days). <b>Honest history:</b> one close per session; <b>approx (reconstructed)</b> uses expired monthly option bars and is separately counted. Percentile = past days strictly below today; today and future days are excluded. IV/skew gold needs ≥ 60 own sessions and a past-only 5th / 95th percentile extreme. Green = above 1.00× or 0 vol pts; red = below. Sorted by option OI, then volume (contracts).</p></div>
<div class="asof">as of ${dlabel(d.header.data_session_date)} MT · ${S.length} names</div></div>
<div class="tw"><table>
<thead><tr class="grp"><th class="tk"></th><th colspan="2"></th><th colspan="5">Implied volatility (ATM)</th><th colspan="2">vs realized</th><th>Term</th><th colspan="3">25-delta skew (expiry nearest 30 days)</th><th></th><th colspan="3">Liquidity (captured chain window)</th></tr>
<tr><th class="tk">Ticker</th><th>Spot</th><th class="l">Next ER<small>vs 30d expiry</small></th><th>IV30</th><th>IV60</th><th class="l">IV rank<small>archive</small></th><th class="l">IV pctl<small>past only</small></th><th>History<small>own / approximate sessions</small></th><th>IV ÷ HV20<small>×</small></th><th>HV20<small>annualized</small></th><th>60d ÷ 30d<small>below 1.00× = inverted</small></th><th>Put IV</th><th>Call IV</th><th>Put − call<small>vol pts</small></th><th>1-SD move<small>to 30 days</small></th><th>OI<small>contracts</small></th><th>Volume<small>contracts</small></th><th>Atm oi<small>not retained in snapshot</small></th></tr></thead>
<tbody>${S.map(ivRow).join('')}</tbody></table></div>
<div class="mlist">${S.map(ivCard).join('')}</div>
</section>

<section class="card ph" id="spreads">
<div class="head"><div><h2>Credit spreads <small>Credit ÷ width</small><span class="need">Needs bid/ask quotes</span></h2>
<p class="note"><b>Placeholder</b> · ${esc(d.credit_spreads.label)}. Spread pricing requires simultaneous bid/ask on both legs.</p></div></div>
<div class="tw"><table><thead><tr><th class="tk">Ticker</th><th>Expiry</th><th>Short / long<small>strike $</small></th><th>Width<small>$</small></th><th>Credit<small>mid $</small></th><th>Credit ÷ width<small>%</small></th><th>Return on risk<small>%</small></th><th>Breakeven<small>$</small></th><th>Short delta<small>model</small></th><th>Bid-ask<small>% of mid, per leg</small></th><th>OI<small>per leg</small></th></tr></thead>
<tbody><tr><th class="tk">·</th><td colspan="10">needs bid/ask quotes: column layout only, no values</td></tr></tbody></table></div>

</section>

<details class="card" id="defs"><summary><h2>Sources &amp; definitions</h2> <span class="note" style="display:inline">data, formulas, what is not known yet</span></summary>
<div class="defs"><p><b>Chain:</b> Massive options snapshot; last prints, no bid/ask. Header capture time comes from snapshot timestamps, converted to MT with daylight saving.</p><p><b>ER dates:</b> Nasdaq calendar, cap ≥ $${d.header.min_cap_b}B, next ${d.header.window_days} days. Historical dates: surprise table + prior-quarter calendar scan. Sessions: filing acceptance time when available, else upcoming session assumption, flagged in chips.</p><p><b>Event move:</b> before open = previous close → report-day close; after close = report-day close → next session close. Adjusted daily bars.</p><p><b>Own implied:</b> expired first expiry on/after reaction session, ATM nearest unadjusted pre-report close, call + put prints on that session × 0.85 ÷ close. Missing bars = n/a. Counts use only events with both actual and own-implied.</p><p><b>Rank:</b> (now − min) ÷ (max − min), including today. <b>Percentile:</b> past sessions strictly below today. Approximate monthly IV uses Black-Scholes inversion, 4% rate, no dividends; American options and stale prints create bias.</p><p><b>Gold:</b> implied above/below every past move with ≥ 8 events; IV/skew at/beyond past-only 5th/95th percentile with ≥ 60 own sessions. Approximate sessions never unlock gold.</p><p><b>IV/HV:</b> IV30 ÷ annualized HV20; term = IV60 ÷ IV30. Skew = picked 25-delta put IV − call IV, vol pts; actual deltas in tooltips.</p><p><b>IV crush:</b> n/a until same-expiry real pre/post captures exist. <b>Liquidity:</b> contracts in the saved chain window, not front-expiry OI. ATM OI was not retained.</p></div></details>
</div></details>
</main>`;
return html;
}

// Phone cap: the earnings list shows the first 15 rows; this flips capped/expanded. Works on any element-like with closest().
export function toggleErCap(btn) {
  const list = btn?.closest?.('.mlist.er'); if (!list) return false;
  const open = list.classList.toggle('capped') === false;
  const n = list.querySelectorAll ? list.querySelectorAll('.mc').length : 0;
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? 'Show top 15' : 'Show all ' + n;
  return open;
}

export async function mountSpreads(host, {dataUrl='./data/spreads.json', data=null}={}) {
  if(!host)throw new Error('SPREADS host missing');
  const doc=host.ownerDocument||globalThis.document;
  if(doc&&!doc.querySelector('link[data-spreads-css]')){const l=doc.createElement('link');l.rel='stylesheet';l.href=new URL('./spreads-tab.css',import.meta.url).href+'?v=V2.19.0';l.dataset.spreadsCss='';doc.head.appendChild(l);}
  host.innerHTML='<div id="spreadsRoot"><main class="meta">Loading SPREADS…</main></div>';
  if(host.addEventListener&&!host._erBound){host._erBound=true;host.addEventListener('click',ev=>{const b=ev.target?.closest?.('[data-er-toggle]');if(b)toggleErCap(b);});}
  try{if(!data){const r=await fetch(dataUrl,{cache:'no-store'});if(!r.ok)throw new Error('SPREADS data HTTP '+r.status);data=await r.json();}
    host.innerHTML='<div id="spreadsRoot">'+renderSpreads(data)+'</div>';return {data};
  }catch(e){host.innerHTML='<div id="spreadsRoot"><main class="meta">SPREADS unavailable. Retry loading this tab.</main></div>';throw e;}
}
