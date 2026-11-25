// RC2 C3c History top block (opt-in from history-tab.mjs when mounted with { rc2: true }).
// Copies (T3 sample): Capitol Trades filter bar + count tiles that recount; Market Chameleon "# of obs" + median beside every
// base rate; SentimenTrader bands, up runs | down runs. RED-TEAM F1/F2 fixed: the stretch printed beside a percentile is the
// stretch of the SAME ranked session (runs[].rank.stretch, ranked on runs[].rank.d); every extreme count states its rule.
import { esc, fin, pct, xatr, price, cls, dshort, dlong, mtStamp, kmLabel, historyModel, extremeFull, runCap, CAPS, EXCL_NOTE, FULL_WINDOW } from './rc2-t3-lib.mjs?v=V2.23.1';

import { infoChip } from './info-chip.mjs?v=V2.23.1';
const pills = (key, opts, cur, label) => `<span class="r3-pg" role="group" aria-label="${esc(label)}"><em>${esc(label)}</em>${opts.map(([v, l]) => `<button type="button" class="r3-pill${cur === v ? ' on' : ''}" data-${key}="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</span>`;
const tile = (k, v, s, extra = '') => `<div class="tile${extra ? ` ${extra}` : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const ordinalPctl = (p) => (fin(p) ? `${(+p).toFixed(1)}%` : 'no rank');

export function renderRc2History(snap, MR, ui = {}) {
  const M = historyModel(snap, MR, ui);
  const { U } = M;
  const minuteEnd = snap.sources?.minuteStoreEndsMT ? dshort(new Date(snap.sources.minuteStoreEndsMT).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })) : 'not measured';
  const openExtFull = M.open.filter(extremeFull).length; const openExt = M.open.filter((r) => fin(r.pFlag) && (r.pFlag <= 5 || r.pFlag >= 95)).length;
  // R54: as-of line and summary sentence fold into the ⓘ chip.
  const head = `<div class="head r3-head"><h1>History</h1>${infoChip(`As of: runs pulled ${esc(mtStamp(snap.runsPulledAt || snap.builtAt))} · flags ${esc(dshort(snap.span?.from))} to ${esc(dlong(snap.span?.to))} (${snap.span?.sessions ?? 'n/a'} sessions) · daily bars through the ${esc(dlong(snap.barsThrough))} close, 2:00 PM MT · 2m charts only for runs flagged by ${esc(minuteEnd)} (the minute store ends there) · ${M.excluded ? EXCL_NOTE : 'no split-artefact names in this feed'}`, `${M.total.res} runs have resolved and ${M.open.length} are still open. Small-cap-book runs take <b>${kmLabel(M.sc)}</b> (median, open runs counted) to come back; mid/large take <b>${kmLabel(M.ml)}</b>. <b>${openExtFull} of the ${M.open.length}</b> open runs were flagged at ≤ 5th or ≥ 95th pctl of a full ${FULL_WINDOW}-session own history (${openExt} counting runs ranked on fewer sessions).`)}</div>`;
  const bar = `<div class="r3-bar">${pills('r3h-cap', CAPS.map((c) => [c, c]), U.cap, 'Cap')}${pills('r3h-side', [['All', 'All'], ['up', 'Up runs'], ['down', 'Down runs']], U.side, 'Side')}${infoChip(`Tiles and tables recount the filter · cap from the MR map (small under $2B, mid $2B to $10B, large over $10B); SC-book runs with no cap on file count as Small; ${M.noCapML} ML runs with no cap appear under All only`)}</div>`;
  const tiles = `<div class="strip r3-strip">
${tile('Runs in this filter', `${M.runs.length} <small>runs</small>`, `${M.total.res} resolved · ${M.open.length} open`)}
${tile('Median sessions to resolve', `${kmLabel(M.total).replace(' sess', ' <small>sess</small>')}`, `SC ${kmLabel(M.sc)} · ML ${kmLabel(M.ml)} · Kaplan-Meier, open runs counted`)}
${tile('Resolved within 5 sessions', fin(M.total.in5) ? `${M.total.in5.toFixed(1)} <small>%</small>` : 'no base rate yet', `n = ${M.total.n} runs (open runs censored)`)}
${tile('Up runs · down runs', `<span class="up">${M.nUp}</span> <small>up</small> · <span class="dn">${M.nDown}</span> <small>down</small>`, 'run direction at the flag: up = flagged on an up move, down = flagged on a down move; the stretch beside it is the ranked session and can sit either side of the 8 EMA')}
${tile('At a stretch extreme', `${M.ext.length} <small>runs</small>`, `rule: pctl ≤ 5th or ≥ 95th, ranked session · ${M.extFull.length} of them on a full ${FULL_WINDOW}-session rank = gold rows`, 'ext mr')}
</div>`;
  const dist = (r) => (r.book === 'SC'
    ? (fin(r.eod?.lastCloseVsStartPct) ? `<span class="${cls(r.eod.lastCloseVsStartPct)}">${pct(r.eod.lastCloseVsStartPct)}</span><small>last close vs start</small>` : 'not measured')
    : (fin(r.eod?.lastAtr5d) ? `${xatr(r.eod.lastAtr5d)}<small>ATR / 5D (under 2.00× resolves)</small>` : 'not measured'));
  const oRow = (r) => {
    const cap = runCap(r, MR); const st = r.rank?.stretch;
    const rk = !r.rank?.d ? 'no ranked session' : r.rank.pre ? `ranked ${dshort(r.rank.d)} close` : 'ranked same day';
    return `<tr class="${extremeFull(r) ? 'ext' : ''}" data-ticker="${esc(r.t)}" data-walk-focus><th>${esc(r.t)} <span class="chip">${cap || 'cap n/a'}</span><small>${r.book} · ${r.dir === 'up' ? 'up' : 'down'}</small></th>`
      + `<td class="opt">${dshort(r.flag)}<small>${rk}</small></td>`
      + `<td class="${cls(st)}">${xatr(st)}</td>`
      + `<td>${ordinalPctl(r.pFlag)}<small>${r.pN == null ? '' : r.pN >= FULL_WINDOW ? `of ${r.pN} s (2-yr)` : `of ${r.pN} s`}</small></td>`
      + `<td>${r.so == null ? 'not measured' : `${r.so} sess`}<small>${esc(r.status)}</small></td>`
      + `<td class="${cls(r.runSize)}">${pct(r.runSize)}<small>${price(r.start)} → ${price(r.peak)}</small></td>`
      + `<td>${dist(r)}</td><td class="l opt r3-nb">no base rate yet</td></tr>`;
  };
  const openTbl = `<section class="panel"><h2>Open runs · ${M.open.length} · longest open first ${infoChip(`Stretch and pctl are both from the <b>ranked session</b>: the flag day, or the session before it for pre-market flags · gold row = pctl ≤ 5th or ≥ 95th on a full ${FULL_WINDOW}-session own history · resolves at back to run start (SC) or |ATR / 5D| under 2 (ML)`, 'Per-name "after similar days" base rates are not in the history feed yet, so every row prints "no base rate yet"; the band rates on the right describe the whole run sample.')}</h2>
<div class="tw r3-openw"><table class="t r3-open" data-sk-cap="12" data-sk-cap-key="r3-hx-open"><thead><tr><th class="l">Ticker · cap</th><th class="opt">Flagged</th><th>Stretch<small>ranked session · vs 8 EMA</small></th><th>Stretch pctl<small>ranked session</small></th><th>Open for<small>status</small></th><th>Run size<small>start → peak</small></th><th>Distance<small>to resolve</small></th><th class="l opt">This name after<small>similar days</small></th></tr></thead>
<tbody>${M.open.length ? M.open.map(oRow).join('') : '<tr><td colspan="8" class="l">No open runs in this filter.</td></tr>'}</tbody></table></div>
</section>`;
  const maxMed = Math.max(1, ...[...M.up.rows, ...M.down.rows, M.up.all, M.down.all].map((x) => (fin(x.med) ? x.med : 0)));
  const bRow = (x, side, isAll = false) => `<tr class="${x.ext && x.n ? 'ext' : ''}${isAll ? ' base' : ''}"><th>${esc(isAll ? 'All' : x.lab)}</th><td>${x.n}<small>${x.res} · ${x.open}</small></td>`
    + `<td class="l"><span class="r3-km"><i class="${side}" style="width:${x.med == null ? 0 : Math.max(4, Math.round((x.med / maxMed) * 100))}%"></i><b>${x.n ? kmLabel(x) : 'no base rate yet'}</b></span></td>`
    + `<td>${x.n && fin(x.in5) ? `${x.in5.toFixed(1)}%` : 'n/a'}</td><td class="opt ${cls(x.runSize)}">${x.n ? pct(x.runSize) : 'n/a'}</td></tr>`;
  const bTbl = (B, side, title) => `<h3 class="r3-h3 ${side}">${title} <small>${B.n} runs${B.noP ? ` · ${B.noP} with no rank (All row only)` : ''}</small></h3>
<div class="tw"><table class="t r3-band"><thead><tr><th class="l">Stretch pctl<small>ranked session</small></th><th># of obs<small>resolved · open</small></th><th class="l">Median sessions to resolve<small>Kaplan-Meier</small></th><th>Resolved by<small>5 sessions</small></th><th class="opt">Median run<small>size</small></th></tr></thead>
<tbody>${B.rows.map((x) => bRow(x, side)).join('')}${bRow(B.all, side, true)}</tbody></table></div>`;
  const showUp = U.side !== 'down'; const showDn = U.side !== 'up';
  const bands = `<section class="panel"><h2>Base rates by stretch band (ranked session)${showUp && showDn ? ' · up runs | down runs' : ''}</h2>
<p class="sub">Every rate carries its n · median = Kaplan-Meier (open runs count as "at least this long") · descriptive, not an edge claim</p>
${showUp ? bTbl(M.up, 'up', 'Up runs (run direction at the flag: flagged on an up move)') : ''}${showDn ? bTbl(M.down, 'dn', 'Down runs (run direction at the flag: flagged on a down move)') : ''}
<p class="note">≤ 5th + ≥ 95th rows here = ${M.bandExt} runs = the "At a stretch extreme" tile (rule: pctl ≤ 5th or ≥ 95th on the ranked session; ${M.extFull.length} of them ranked on a full ${FULL_WINDOW} sessions, ${M.ext.length - M.extFull.length} on fewer).${M.straddle ? ` ${M.straddle} run${M.straddle === 1 ? ' has' : 's have'} a reverse split inside the run: counted here, left out of the lens table further down.` : ''}</p></section>`;
  return `${head}${bar}${tiles}<div class="grid2 r3-g">${openTbl}${bands}</div>`;
}

export function rc2HistoryState() {
  try { return { cap: 'All', side: 'All', ...JSON.parse(localStorage.getItem('rc2.history') || '{}') }; } catch { return { cap: 'All', side: 'All' }; }
}
export function saveRc2History(s) { try { localStorage.setItem('rc2.history', JSON.stringify({ cap: s.cap, side: s.side })); } catch { /* private mode */ } }
