// Spec gaps (V2.22.0, Nov 24 2026): short interest (D1), halts (D4), analyst ratings (D7), econ calendar (D5),
// earnings consensus (D6). Static files only, read once per page and shared by Now, Calendar, Regime and ER moves.
// Every fetch fails soft: a missing file prints "file not loaded" in its own panel, never breaks the tab.
// Pure helpers are exported for node tests (tests/spec-gaps.test.mjs). Raw primitives only, every number unit-marked,
// every time 12-hour Mountain Time labelled MT.

export const NAS = 'no allowed source';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- shared loader ----------
const FILES = { si: './data/short-interest.json', halts: './data/halts.json', ratings: './data/analyst-ratings.json', econ: './data/econ-calendar.json', cons: './data/earnings-consensus.json' };
const cache = {};
export function feed(key) {
  if (!cache[key]) cache[key] = (typeof fetch === 'function' ? fetch(FILES[key], { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null)).catch(() => null);
  return cache[key];
}

// ---------- dates ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-10-30' -> 'Oct 30' (date only, no time zone shift)
export const dMd = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : 'no date'; };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dWd = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return 'no date'; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${WD[d.getUTCDay()]} ${MON[+m[2] - 1]} ${+m[3]}`; };
export const mtDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
// 'Nov 24 5:50:00 PM MT' -> '5:50 PM MT' (the tape is one day; seconds dropped)
export const hmMT = (s) => { const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i.exec(String(s || '')); return m ? `${+m[1]}:${m[2]} ${m[3].toUpperCase()} MT` : null; };

// ---------- D1 short interest ----------
export function siIndex(doc) { const m = new Map(); for (const r of doc?.rows || []) if (r?.ticker) m.set(String(r.ticker).toUpperCase(), r); return m; }
export const fmtPct = (v, d = 2) => (fin(v) ? `${v.toFixed(d)}%` : 'not measured');
export const fmtDays = (v) => (fin(v) ? `${v.toFixed(2)} d` : 'not measured');
// table cell: '12.40%' + '3.10 d to cover · SI Oct 30 · float Sep 23'
export function siCell(row, loaded = true) {
  if (!loaded) return '<span class="sf-nm" title="short-interest.json did not load">file not loaded</span>';
  if (!row) return '<span class="sf-nm" title="This name is not in the short-interest file (FINRA settlement + free float)">not in file</span>';
  return `<span class="sf-sic">${fmtPct(row.short_pct_of_float)}<small>${fmtDays(row.days_to_cover)} to cover · SI ${esc(dMd(row.settlement_date))} · float ${esc(dMd(row.float_effective_date))}</small></span>`;
}
// detail block (Now linked desk)
export function siDetail(row, doc) {
  if (!doc) return '<p class="sf-line"><b>Short interest</b> <span class="sf-nm">file not loaded</span></p>';
  if (!row) return `<p class="sf-line"><b>Short interest</b> <span class="sf-nm">not in the short-interest file</span> <small>(${(doc.rows || []).length} names, settlement ${esc(dMd(doc.settlement_date))})</small></p>`;
  return `<p class="sf-line"><b>Short interest</b> <span>${fmtPct(row.short_pct_of_float)} of float</span> · <span>${fmtDays(row.days_to_cover)} to cover</span> · <small>settlement date ${esc(dMd(row.settlement_date))} · float date ${esc(dMd(row.float_effective_date))}${fin(row.short_interest) ? ` · ${(row.short_interest / 1e6).toFixed(2)}M shares short` : ''}</small></p>`;
}

// ---------- D7 analyst ratings ----------
export function ratingsIndex(doc) { const m = new Map(); for (const r of doc?.rows || []) if (r?.symbol) m.set(String(r.symbol).toUpperCase(), r); return m; }
const sumNN = (...v) => { const n = v.filter(fin); return n.length ? n.reduce((a, b) => a + b, 0) : null; };
export function ratingCounts(r) {
  if (!r || r.no_coverage) return null;
  const buy = sumNN(r.strong_buy, r.buy), hold = fin(r.hold) ? r.hold : null, sell = sumNN(r.sell, r.strong_sell);
  return { buy, hold, sell, sb: r.strong_buy, ss: r.strong_sell, period: r.period, fetched: r.fetched_date };
}
const nOf = (v) => (fin(v) ? `${v}` : 'not measured');
export function ratingsDetail(row, doc) {
  const pt = `<small>Price targets: ${NAS} (decision D64 pending)</small>`;
  if (!doc) return `<p class="sf-line"><b>Analyst ratings</b> <span class="sf-nm">file not loaded</span> ${pt}</p>`;
  if (!row) return `<p class="sf-line"><b>Analyst ratings</b> <span class="sf-nm">not in the ratings file</span> <small>(${(doc.rows || []).length} names)</small> ${pt}</p>`;
  if (row.no_coverage) return `<p class="sf-line"><b>Analyst ratings</b> <span class="sf-nm">no analyst coverage reported</span> <small>Finnhub, checked ${esc(dMd(row.fetched_date))}</small> ${pt}</p>`;
  const c = ratingCounts(row);
  const per = row.period ? `period ${MON[+String(row.period).slice(5, 7) - 1]} ${String(row.period).slice(0, 4)}` : 'period not measured';
  return `<p class="sf-line"><b>Analyst ratings</b> <span>Buy ${nOf(c.buy)}${fin(c.sb) ? ` <small>(${c.sb} strong)</small>` : ''}</span> · <span>Hold ${nOf(c.hold)}</span> · <span>Sell ${nOf(c.sell)}${fin(c.ss) ? ` <small>(${c.ss} strong)</small>` : ''}</span> · <small>${per} · Finnhub, fetched ${esc(dMd(row.fetched_date))}</small> ${pt}</p>`;
}

// ---------- D4 halts ----------
// Nasdaq Trader halt codes (nasdaqtrader.com Trader.aspx?id=TradeHaltCodes, read Nov 24 2026), in plain words.
export const HALT_CODES = {
  T1: 'news pending', T2: 'news being released', T3: 'news out, resumption times set', T5: 'single-stock pause (10% move in 5 minutes)',
  T6: 'extraordinary activity', T7: 'quotes resumed, trading still paused', T8: 'ETF halt (underlying halted)', T12: 'more information requested by Nasdaq',
  H4: 'listing non-compliance', H9: 'filings not current', H10: 'SEC trading suspension', H11: 'regulatory concern (with another market)',
  O1: 'operations halt', IPO1: 'IPO not yet trading', IPOQ: 'IPO released for quotation', IPOE: 'IPO positioning window extended',
  M1: 'corporate action', M2: 'quotation not available', M: 'LULD volatility pause (other exchange listing)', LUDP: 'LULD volatility pause', LUDS: 'LULD volatility pause (straddle)',
  MWC0: 'market-wide circuit breaker (carried over)', MWC1: 'market-wide circuit breaker, level 1', MWC2: 'market-wide circuit breaker, level 2', MWC3: 'market-wide circuit breaker, level 3', MWCQ: 'market-wide circuit breaker resumption',
  R1: 'new issue available', R2: 'issue available', R4: 'qualification issue resolved', R9: 'filing requirements met',
  C3: 'issuer news not forthcoming', C4: 'qualification halt ended', C9: 'qualification halt concluded', C11: 'halt ended by another regulator', D: 'security deleted',
};
export const LULD = new Set(['LUDP', 'LUDS', 'M']);
export const haltWords = (code) => HALT_CODES[String(code || '').toUpperCase()] || `${code || 'no code'} (code not in our list)`;
// Halts on the board's MT date (newest first). nowMs decides "today"; rows carry halt_utc.
export function haltsToday(doc, nowMs = Date.now()) {
  const day = mtDate(nowMs);
  return (doc?.rows || []).filter((r) => r && Date.parse(r.halt_utc) && mtDate(Date.parse(r.halt_utc)) === day)
    .sort((a, b) => Date.parse(b.halt_utc) - Date.parse(a.halt_utc));
}
export function haltTapeHtml(doc, { nowMs = Date.now(), all = false, cap = 8 } = {}) {
  if (!doc) return '<div class="sf-tape sf-empty"><span class="sf-th"><b>Halts</b> · halts file not loaded</span></div>';
  const rows = haltsToday(doc, nowMs);
  const src = `Nasdaq Trader halts feed, as of ${esc(hmMT(doc.asof_mt) || 'not measured')}`;
  // A file from an earlier day must not read as "no halts today" (red-team #8, Nov 24): before the 6:00 AM MT first run, weekends, a failed Action.
  const asofMs = Date.parse(doc.asof_utc || '');
  if (!rows.length && (!asofMs || mtDate(asofMs) !== mtDate(nowMs))) {
    return `<div class="sf-tape sf-empty"><span class="sf-th"><b>Halts</b> · no halts file for today yet (it refreshes 6:00 AM to 6:00 PM MT on weekdays) · last file ${asofMs ? `${dWd(mtDate(asofMs))} ` : ''}${esc(hmMT(doc.asof_mt) || 'time not listed')}</span></div>`;
  }
  if (!rows.length) return `<div class="sf-tape sf-empty"><span class="sf-th"><b>Halts</b> · no halts today · ${src}</span></div>`;
  const nL = rows.filter((r) => LULD.has(String(r.reason_code).toUpperCase())).length, nOpen = rows.filter((r) => r.open).length;
  const show = all ? rows : rows.slice(0, cap);
  const chip = (r) => {
    const l = LULD.has(String(r.reason_code).toUpperCase());
    const res = r.open ? '<span class="sf-open">still halted</span>' : `resumed ${esc(hmMT(r.resume_trade_mt) || hmMT(r.resume_quote_mt) || 'time not listed')}`;
    const px = fin(r.pause_threshold_price_usd) ? ` · pause price $${r.pause_threshold_price_usd.toFixed(2)}` : '';
    return `<span class="sf-h${l ? ' sf-luld' : ''}" data-ticker="${esc(r.symbol)}" role="button" tabindex="0" title="${esc(`${r.symbol} ${r.name || ''} · ${r.reason_code}: ${haltWords(r.reason_code)} · ${r.market || ''}`)}"><b>${esc(r.symbol)}</b>${l ? '<em>LULD</em>' : ''}<span>${esc(haltWords(r.reason_code))}</span><span>halted ${esc(hmMT(r.halt_mt) || 'time not listed')} → ${res}${px}</span></span>`;
  };
  const more = rows.length > cap ? `<button type="button" class="sf-more" data-sf-halts="${all ? 'less' : 'all'}">${all ? `Show ${cap}` : `Show all ${rows.length}`}</button>` : '';
  return `<div class="sf-tape"><span class="sf-th"><b>Halts today</b> · ${rows.length} ${rows.length === 1 ? 'halt' : 'halts'} · ${nL} LULD ${nL === 1 ? 'pause' : 'pauses'} · ${nOpen} still halted · newest first · ${src}</span><div class="sf-hs">${show.map(chip).join('')}${more}</div></div>`;
}

// ---------- D5 econ calendar ----------
export function econUpcoming(doc, nowMs = Date.now(), max = 12) {
  const today = mtDate(nowMs);
  return (doc?.rows || []).filter((r) => r && (r.event_time_utc ? Date.parse(r.event_time_utc) >= nowMs : String(r.date) >= today))
    .sort((a, b) => String(a.event_time_utc || a.date).localeCompare(String(b.event_time_utc || b.date))).slice(0, max);
}
const consVal = (r, k, unit) => (fin(r[`${k}_num`]) ? `${r[`${k}_num`]}${unit || ''}` : r[k] != null && r[k] !== '' ? esc(r[k]) : `<span class="sf-nm">${NAS}</span>`);
export function econHtml(doc, { nowMs = Date.now(), max = 12, title = 'Economic releases, next on the calendar' } = {}) {
  if (!doc) return `<section class="panel sf-econ"><h2>${title}</h2><p class="sub">econ-calendar.json did not load: no releases shown.</p></section>`;
  const rows = econUpcoming(doc, nowMs, max);
  const body = rows.map((r) => `<tr><td class="l">${esc(dWd(r.date))}</td><td>${esc(r.event_time_mt || 'time not listed')}</td><td class="l">${esc(r.event)}</td><td class="l">${esc(r.source)}${r.basis === 'rule' || r.verified === false ? '<small>date by rule, not verified</small>' : ''}</td><td>${consVal(r, 'consensus', r.unit)}</td><td>${consVal(r, 'previous', r.unit)}</td></tr>`).join('');
  return `<section class="panel sf-econ"><h2>${title}</h2><p class="sub">${rows.length} of ${(doc.rows || []).length} rows · agency release calendars (${esc(Object.keys(doc.sources || {}).join(', ') || 'BLS, BEA, Fed, Census')}) · built ${esc(doc.asof_mt || 'not measured')} · consensus and previous: ${NAS}</p>${rows.length ? `<div class="tw"><table class="t sf-t"><thead><tr><th class="l">Day</th><th>Time<small>MT</small></th><th class="l">Release</th><th class="l">Source</th><th>Consensus</th><th>Previous</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="sub">No release left on the calendar file.</p>'}</section>`;
}

// ---------- D6 earnings consensus + item 5 ER dates ----------
export function erIndex(doc) { const m = new Map(); for (const r of doc?.rows || []) { const k = String(r?.symbol || '').toUpperCase(); if (!k) continue; const o = m.get(k); if (!o || String(r.report_date) < String(o.report_date)) m.set(k, r); }
  // next_er: date-only fallback beyond the consensus window (out to ~75 days), never overrides a window row
  for (const [k0, v] of Object.entries(doc?.next_er || {})) { const k = k0.toUpperCase(); if (!m.has(k) && v && v.date) m.set(k, { symbol: k, report_date: v.date, far: true, src: v.src }); }
  return m; }
const srcShort = (s) => (/finnhub/i.test(s || '') ? 'Finnhub' : /nasdaq/i.test(s || '') ? 'Nasdaq.com (unofficial)' : s || 'source not named');
export const usdEps = (v) => (fin(v) ? `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}` : null);
// EPS cell: one number + its source, or BOTH numbers + both sources where the two disagree
export function epsCell(r) {
  const a = usdEps(r.eps_forecast), b = usdEps(r.eps_alt);
  if (!a && !b) return `<span class="sf-nm">${NAS}</span>`;
  if (a && b && Math.abs(r.eps_forecast - r.eps_alt) > 0.005) {
    const alt = /vs (.+?) snapshot taken ([^0-9]*\w+ \d+ \d{4} [\d:]+ [AP]M MT)/.exec(r.source_note || '');
    return `<span class="sf-dis" title="${esc(r.source_note || '')}">${a} <span class="sf-src">${esc(srcShort(r.source))}</span> · ${b} <span class="sf-src">${esc(alt ? srcShort(alt[1]).replace(' (unofficial)', '*') : 'second source')}</span></span>`;
  }
  return `${a || b} <span class="sf-src">${esc(srcShort(r.source))}</span>`;
}
const TIME = { 'pre-market': 'before the open', 'after-hours': 'after the close' };
const capTxt = (v) => (fin(v) ? `$${v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : `${(v / 1e6).toFixed(0)}M`}` : 'not measured');
export function consensusHtml(doc, { nowMs = Date.now(), cap = 30 } = {}) {
  if (!doc) return '<section class="panel sf-cons"><h2>Earnings consensus</h2><p class="sub">earnings-consensus.json did not load: no consensus shown.</p></section>';
  const today = mtDate(nowMs);
  const rows = (doc.rows || []).filter((r) => String(r.report_date) >= today).sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)) || (b.market_cap || 0) - (a.market_cap || 0));
  const dis = rows.filter((r) => fin(r.eps_forecast) && fin(r.eps_alt) && Math.abs(r.eps_forecast - r.eps_alt) > 0.005).length;
  const tr = (r) => `<tr data-ticker="${esc(r.symbol)}"><td class="l">${esc(dWd(r.report_date))}</td><td class="l">${esc(TIME[r.time] || 'time not in the feed')}</td><th class="l">${esc(r.symbol)}<small>${esc(r.name || '')}</small></th><td>${capTxt(r.market_cap)}</td><td>${epsCell(r)}</td><td><span class="sf-nm">${NAS}</span></td><td><span class="sf-nm">${NAS}</span></td></tr>`;
  const head = '<thead><tr><th class="l">Reports</th><th class="l">When</th><th class="l">Name</th><th>Market cap</th><th>EPS estimate<small>$ per share · source</small></th><th># estimates</th><th>EPS a year ago</th></tr></thead>';
  const first = rows.slice(0, cap), rest = rows.slice(cap);
  return `<section class="panel sf-cons"><h2>Earnings consensus, next ${(doc.window_days || []).length} sessions</h2><p class="sub">${rows.length} reports from ${esc(dMd(today))} · ${esc(srcShort(doc.source))} · built ${esc(doc.asof_mt || 'not measured')} · ${dis} EPS rows where two sources disagree show both (Nasdaq.com* = unofficial snapshot, time on hover) · # estimates and last year's EPS: ${NAS} · largest cap first within each day</p><div class="tw"><table class="t sf-t">${head}<tbody>${first.map(tr).join('')}</tbody></table></div>${rest.length ? `<details class="fold sf-fold"><summary>${rest.length} more reports</summary><div class="tw"><table class="t sf-t">${head}<tbody>${rest.map(tr).join('')}</tbody></table></div></details>` : ''}</section>`;
}
