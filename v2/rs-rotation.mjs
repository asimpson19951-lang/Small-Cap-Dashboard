// SECTORS tab, RC2 (V2.21.0-rc2): relative strength / rotation view. Austin Nov 23 2026: "work extra on the RS RW tab
// with the sectors, better tracking, data percentiles heat map". Picked sample R2 (percentile heat map) plus Re1 rank
// history, Re2 streaks + RS-line highs / lows, Re4 timeframe heat map, Re5 ranked bars, Re6 rotation quadrant with tails,
// Re7 stretch in ATR + after-similar base rates with n, Re9 "what rotated" read line, benchmark switch SPY / IWM.
//
// Self-contained: reads ./data/rc2-rs.json (built nightly from daily bars) and renders into #rsRotation. It does not need
// the Supabase sector board; when that live run is on the page its top movers are shown inside the open group row.
// The page computes nothing but ordering, ranks inside the chosen group filter and formatting; every reading is stored.
// Display laws: no dim text, one sans, every number unit-marked, gold = fill / outline only at a 2-yr extreme,
// heat cells filled (red for down), bars not lines, 12-hour MT, no scores, no buy / sell words.

import { infoChip } from './info-chip.mjs?v=V2.23.0';
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NM = 'not measured';
function signed(v, dp, unit) {
  const n = finite(v); if (n == null) return NM;
  const r = +n.toFixed(dp);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(dp)}${unit}`;
}
export const fmtPP = (v, dp = 2) => signed(v, dp, ' pp');
export const fmtPct = (v, dp = 2) => signed(v, dp, '%');
export const fmtX = (v, dp = 2) => signed(v, dp, '× ATR');
export const fmtPctile = (p) => (finite(p) == null ? NM : `${p.toFixed(1)}%`);
export const fmtShare = (p) => (finite(p) == null ? NM : `${p.toFixed(1)}%`);
/** Signed rank change in places: +3 = moved up three places. */
export const fmtPlaces = (n) => (finite(n) == null ? NM : n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);
export const isExt = (p) => finite(p) != null && (p <= 5 || p >= 95);
const ud = (v) => { const n = finite(v); return n == null || n === 0 ? '' : n > 0 ? 'up' : 'dn'; };
const sess = (n) => `${n} sess`;

export const TFS = Object.freeze(['1d', '5d', '1m', '3m']);
export const TF_LABEL = Object.freeze({ '1d': '1D', '5d': '5D', '1m': '1M', '3m': '3M' });
// RC2 fix #7: each table heading names its own RS rule (window in sessions, benchmark, pp).
const RS_WIN = Object.freeze({ '1d': 1, '5d': 5, '1m': 21, '3m': 63 });
const TF_WORDS = { '1d': '1 session', '5d': '5 sessions', '1m': '21 sessions', '3m': '63 sessions' };
const QUAD_WORD = { leading: 'Leading', weakening: 'Weakening', lagging: 'Lagging', improving: 'Improving' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayLabel(d, withDow = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return NM;
  const dow = DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${withDow ? dow + ' ' : ''}${MON[+m[2] - 1]} ${+m[3]}`;
}
/** 12-hour Mountain Time stamp, e.g. "Tue Nov 24 9:41 AM MT". */
export function mtStamp(iso) {
  const ms = Date.parse(iso ?? ''); if (!Number.isFinite(ms)) return NM;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.month} ${p.day} ${p.hour}:${p.minute} ${p.dayPeriod} MT`;
}

// ---------- pure rank helpers (tests/rc2-sectors.test.mjs) ----------
/** Consecutive truthy values ending at the last element. */
export function streakLen(flags) { let n = 0; for (let k = flags.length - 1; k >= 0 && flags[k]; k--) n++; return n; }
/** Streaks from a rank history (oldest first). `capped` marks a streak as long as the history itself. */
export function rankStreaks(hist, nGroups) {
  const ok = (r) => finite(r) != null;
  const top = hist.map((r) => ok(r) && r <= 3), bot = hist.map((r) => ok(r) && r >= nGroups - 2);
  const imp = hist.map((r, k) => k > 0 && ok(r) && ok(hist[k - 1]) && r < hist[k - 1]);
  const wor = hist.map((r, k) => k > 0 && ok(r) && ok(hist[k - 1]) && r > hist[k - 1]);
  const out = { top3: streakLen(top), bottom3: streakLen(bot), improving: streakLen(imp), worsening: streakLen(wor) };
  out.capped = { top3: out.top3 >= hist.length, bottom3: out.bottom3 >= hist.length };
  return out;
}
/**
 * Ranks inside a subset, derived from ranks in the full list (a total order each session): a member's subset rank is
 * 1 + the number of subset members ranked above it that session. histByTicker: { T: [rank per session] }.
 */
export function subsetRankHist(histByTicker, tickers) {
  const out = Object.fromEntries(tickers.map((t) => [t, []]));
  const len = Math.max(0, ...tickers.map((t) => (histByTicker[t] || []).length));
  for (let s = 0; s < len; s++) {
    const live = tickers.filter((t) => finite(histByTicker[t]?.[s]) != null).sort((a, b) => histByTicker[a][s] - histByTicker[b][s]);
    const pos = new Map(live.map((t, i) => [t, i + 1]));
    for (const t of tickers) out[t].push(pos.get(t) ?? null);
  }
  return out;
}
/** Rank facts from a history (oldest first): now, 1 / 5 / 21 sessions ago, the changes in places and the streaks. */
export function rankFacts(hist, nGroups) {
  const at = (back) => (hist.length > back ? finite(hist[hist.length - 1 - back]) : null);
  const now = at(0), d1 = at(1), w1 = at(5), m1 = at(21);
  const chg = (was) => (was == null || now == null ? null : was - now);
  return { now, d1, w1, m1, c1: chg(d1), c5: chg(w1), c21: chg(m1), ...rankStreaks(hist, nGroups) };
}
/** Keep the first n and the last n of a sorted list; `mid` = what was folded. */
export function capBothEnds(rows, n) {
  if (rows.length <= 2 * n) return { head: rows, tail: [], mid: [] };
  return { head: rows.slice(0, n), tail: rows.slice(-n), mid: rows.slice(n, -n) };
}
/** Full colour at the 85th percentile of the absolute sizes, so one outlier or a long timeframe cannot saturate the map. */
export function heatScale(values) {
  const a = values.map((v) => Math.abs(finite(v) ?? NaN)).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 1;
  return Math.max(0.01, a[Math.min(a.length - 1, Math.floor(0.85 * (a.length - 1) + 0.5))]);
}
export function heatFill(v, scale) {
  const n = finite(v); if (n == null) return 'transparent';
  const s = Math.min(1, Math.abs(n) / scale);
  return n >= 0 ? `rgba(81,192,131,${(0.10 + 0.52 * s).toFixed(2)})` : `rgba(225,114,114,${(0.11 + 0.55 * s).toFixed(2)})`;
}
/** n for the three horizons: one number when they agree, "9 · 9 · 8" when they differ (red-team F8). */
export function nText(br) {
  const ns = [1, 3, 5].map((h) => finite(br?.h?.[h]?.n));
  if (ns.some((n) => n == null)) return NM;
  return ns.every((n) => n === ns[0]) ? `${ns[0]}` : ns.join(' · ');
}
/** Widest window where the RS line is at a new high / low today: { kind: 'high'|'low', label: '2Y' } or null. */
export function lineToday(line, labels = ['3M', '6M', '1Y', '2Y']) {
  if (!line) return null;
  for (let i = labels.length - 1; i >= 0; i--) {
    if (line.hi?.[i]) return { kind: 'high', label: labels[i] };
    if (line.lo?.[i]) return { kind: 'low', label: labels[i] };
  }
  return null;
}

/**
 * The view model: groups in the filter, joined to the chosen benchmark, ranked on the chosen timeframe.
 * filter 'ALL' uses the stored ranks (streaks over the whole history); 'SECTOR' / 'INDUSTRY' re-rank inside the subset
 * from the stored 65-session rank history.
 */
export function rsModel(data, { bench = 'SPY', tf = '1m', filter = 'ALL' } = {}) {
  const B = data?.bench?.[bench]; if (!B) return null;
  const groups = data.groups.filter((g) => (filter === 'ALL' || g.grp === filter) && B.rows[g.t]);
  const n = groups.length; const tickers = groups.map((g) => g.t);
  const all = filter === 'ALL';
  const sub = all ? null : Object.fromEntries(TFS.map((k) => [k, subsetRankHist(Object.fromEntries(tickers.map((t) => [t, B.rows[t].hist[k]])), tickers)]));
  const rows = groups.map((g) => {
    const r = B.rows[g.t]; const rank = {}; const hist = {};
    for (const k of TFS) {
      hist[k] = all ? r.hist[k] : sub[k][g.t];
      if (all) {
        const s = r.rk[k]; const c = (was) => (finite(was) == null || finite(s.now) == null ? null : was - s.now);
        rank[k] = { now: s.now, d1: s.d1, w1: s.w1, m1: s.m1, c1: c(s.d1), c5: c(s.w1), c21: c(s.m1), top3: s.top3, bottom3: s.bottom3, improving: s.improving, worsening: s.worsening, capped: { top3: false, bottom3: false } };
      } else rank[k] = rankFacts(hist[k], n);
    }
    return { ...g, rs: r.rs, line: r.line, rot: r.rot, brS: r.brS, brR: r.brR, mv: r.mv || null, rank, hist };
  }).sort((a, b) => (a.rank[tf].now ?? 1e9) - (b.rank[tf].now ?? 1e9) || (a.t < b.t ? -1 : 1));
  const idx = Object.entries(B.idx || {}).map(([t, r]) => ({ ...data.indexes[t], ...r, index: true }));
  return { bench, tf, filter, n, rows, idx, benchRow: data.indexes[bench], as_of: data.as_of, generated_at: data.generated_at, windows: data.windows, hist_dates: data.hist_dates, source: data.source, rules: data.rules || null, ruleText: data.ruleText || null };
}

/** Re9: one read line built from the numbers only. Returns plain parts so tests can read them. */
export function whatRotated(m) {
  if (!m || !m.rows.length) return null;
  const tf = m.tf, L = TF_LABEL[tf];
  const lead = m.rows[0], last = m.rows[m.rows.length - 1];
  const moved = m.rows.filter((r) => finite(r.rank[tf].c21) != null);
  const climb = [...moved].sort((a, b) => b.rank[tf].c21 - a.rank[tf].c21)[0] || null;
  const drop = [...moved].sort((a, b) => a.rank[tf].c21 - b.rank[tf].c21)[0] || null;
  const unusual = [...m.rows].filter((r) => finite(r.rs[tf][1]) != null).sort((a, b) => Math.abs(b.rs[tf][1] - 50) - Math.abs(a.rs[tf][1] - 50))[0] || null;
  const stretched = [...m.rows].filter((r) => finite(r.stretch.p) != null).sort((a, b) => Math.abs(b.stretch.p - 50) - Math.abs(a.stretch.p - 50))[0] || null;
  const nExt = m.rows.filter((r) => isExt(r.rs[tf][1])).length;
  return { tf, L, lead, last, climb: climb && climb.rank[tf].c21 > 0 ? climb : null, drop: drop && drop.rank[tf].c21 < 0 ? drop : null, unusual, stretched, nExt };
}

// ---------- V2.22.0: the Themes tab's per-basket readouts, now per ETF (Themes retired Nov 24 2026) ----------
// mv (producer): xs = 21 sessions of ETF 1-day % minus the benchmark's (pp), swing = median abs of the 20 before today,
// ratio = abs(today) / swing, lit = Themes lighting rules met at the close. vol.rvol = volume / prior 20-session mean.
// Old feeds without these fields print "not measured"; nothing is computed here.
export const LIT_WORD = Object.freeze({ a: 'rule a', b: 'rule b', build3: '3-day build' });
export const litOf = (r) => (Array.isArray(r?.mv?.lit) ? r.mv.lit : []);
/** Gold row (MR lens): 2-yr extreme on the ranked RS reading OR on the stretch from the 8 EMA. */
export const rowExt = (r, tf) => isExt(r?.rs?.[tf]?.[1]) || isExt(r?.stretch?.p);
export const fmtTimes = (v, dp = 2) => (finite(v) == null ? NM : `${(+v).toFixed(dp)}×`);
export function mvBarsSvg(xs, label) {
  const v = (xs || []).map((x) => finite(x)); if (!v.some((x) => x != null)) return '';
  const w = 168, h = 28, mx = Math.max(0.01, ...v.filter((x) => x != null).map(Math.abs)), bw = w / v.length;
  return `<svg class="rs-mvb" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${v.map((x, i) => { if (x == null) return ''; const hh = Math.max(1, (Math.abs(x) / mx) * (h / 2 - 1)); return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(x >= 0 ? h / 2 - hh : h / 2).toFixed(1)}" width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${hh.toFixed(1)}" class="${x >= 0 ? 'u' : 'd'}${i === v.length - 1 ? ' t' : ''}"/>`; }).join('')}<line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" class="z"/></svg>`;
}

// ---------- rendering ----------
const pcCell = (p) => (finite(p) == null ? NM : `<span class="pc${isExt(p) ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>`);
const chgCell = (n) => `<td class="${ud(n)}">${fmtPlaces(n)}</td>`;
const rk = (v) => (finite(v) == null ? NM : `${v}`);
const btn = (attr, val, on, label, extra = '') => `<button type="button" ${attr}="${esc(val)}" aria-pressed="${on}"${on ? ' class="on"' : ''}${extra}>${label}</button>`;

function readHtml(m) {
  const w = whatRotated(m); if (!w) return '';
  const tf = w.tf, b = m.bench, n = m.n;
  const nm = (r) => `<b>${esc(r.t)}</b> ${esc(r.name)}`;
  const parts = [];
  const lr = w.lead.rank[tf];
  parts.push(`<b>What rotated</b> (${w.L} RS vs ${b}, to the ${esc(dayLabel(m.as_of))} close): ${nm(w.lead)} is rank 1 of ${n} at <span class="${ud(w.lead.rs[tf][0])}">${fmtPP(w.lead.rs[tf][0])}</span>${finite(lr.m1) != null && lr.m1 !== 1 ? `, up from rank ${lr.m1} a month ago` : ''}${lr.top3 > 1 ? `, ${lr.top3}${lr.capped.top3 ? '+' : ''} sessions in the top 3` : ''}; ${nm(w.last)} is rank ${n} at <span class="${ud(w.last.rs[tf][0])}">${fmtPP(w.last.rs[tf][0])}</span>${finite(w.last.rank[tf].m1) != null && w.last.rank[tf].m1 !== n ? `, from rank ${w.last.rank[tf].m1} a month ago` : ''}.`);
  const mv = [];
  if (w.climb && w.climb !== w.lead) mv.push(`biggest climb in a month ${nm(w.climb)} <span class="up">${fmtPlaces(w.climb.rank[tf].c21)} places</span> (rank ${w.climb.rank[tf].m1} to ${w.climb.rank[tf].now})`);
  if (w.drop && w.drop !== w.last) mv.push(`biggest drop ${nm(w.drop)} <span class="dn">${fmtPlaces(w.drop.rank[tf].c21)} places</span> (rank ${w.drop.rank[tf].m1} to ${w.drop.rank[tf].now})`);
  if (mv.length) parts.push(`${mv.join('; ').replace(/^b/, 'B')}.`);
  if (w.unusual) parts.push(`<b>How unusual:</b> ${esc(w.unusual.t)} ${w.L} RS <span class="${ud(w.unusual.rs[tf][0])}">${fmtPP(w.unusual.rs[tf][0])}</span> sits at ${fmtPctile(w.unusual.rs[tf][1])} of its last 2 years; ${w.nExt} of ${n} groups are at a 2-yr extreme on ${w.L}.`);
  if (w.stretched) {
    const s = w.stretched, h5 = s.brS?.h?.[5];
    const after = h5 && finite(h5.absMed) != null
      ? `after the ${h5.n} earlier times it was this far ${s.brS.side} its 8 EMA, the next 5 sessions had a median of <span class="${ud(h5.absMed)}">${fmtPct(h5.absMed)}</span> (<span class="${ud(h5.vsMed)}">${fmtPP(h5.vsMed)}</span> vs ${b}), ${fmtShare(h5.vsPos)} beat ${b} (n ${h5.n})`
      : `no base rate yet (n ${h5 ? h5.n : 0})`;
    parts.push(`<b>Stretch:</b> ${esc(s.t)} <span class="${ud(s.stretch.x)}">${fmtX(s.stretch.x)}</span> from its 8 EMA (${fmtPctile(s.stretch.p)} of 2 years); ${after}. Descriptive, not an edge claim.`);
  }
  return `<p class="read rs-read${w.nExt ? ' ext' : ''}">${parts.join(' ')}</p>`;
}

function tilesHtml(m) {
  const tf = m.tf, L = TF_LABEL[tf], b = m.benchRow, n = m.n;
  const lead = m.rows[0], last = m.rows[n - 1];
  const tile = (r, word) => {
    const k = r.rank[tf];
    return `<div class="tile${isExt(r.rs[tf][1]) ? ' ext' : ''}"><div class="k">${word} ${L} RS vs ${esc(m.bench)} · ${esc(r.name)}</div><div class="v ${ud(r.rs[tf][0])}">${fmtPP(r.rs[tf][0])}<small>${esc(r.t)}</small></div><div class="s">${fmtPctile(r.rs[tf][1])} of 2 yrs · rank ${rk(k.now)} of ${n}${finite(k.w1) != null ? `, was ${rk(k.w1)} a week ago` : ''}</div></div>`;
  };
  const byS = [...m.rows].filter((r) => finite(r.stretch.x) != null).sort((a, b2) => Math.abs(b2.stretch.p - 50) - Math.abs(a.stretch.p - 50));
  const s0 = byS[0], s1 = byS[1];
  const highs = m.rows.filter((r) => lineToday(r.line)?.kind === 'high'), lows = m.rows.filter((r) => lineToday(r.line)?.kind === 'low');
  const lst = (a) => a.slice(0, 4).map((r) => `${r.t} ${lineToday(r.line).label}`).join(' · ') + (a.length > 4 ? ` +${a.length - 4}` : '');
  const tiles = [
    `<div class="tile${isExt(b.stretch.p) ? ' ext' : ''}"><div class="k">${esc(b.t)} · the benchmark · close $${b.close.toFixed(2)}</div><div class="v ${ud(b.ret['1d'])}">${fmtPct(b.ret['1d'])}<small>1D</small></div><div class="s">5D ${fmtPct(b.ret['5d'])} · 1M ${fmtPct(b.ret['1m'])} · 3M ${fmtPct(b.ret['3m'])} · 8 EMA ${fmtX(b.stretch.x)} (${fmtPctile(b.stretch.p)})</div></div>`,
    tile(lead, 'Strongest'), tile(last, 'Weakest'),
    s0 ? `<div class="tile mr${isExt(s0.stretch.p) ? ' ext' : ''}"><div class="k">Most stretched vs 8 EMA</div><div class="v ${ud(s0.stretch.x)}">${fmtX(s0.stretch.x)}<small>${esc(s0.t)}</small></div><div class="s">${fmtPctile(s0.stretch.p)} of 2 yrs${s1 ? ` · next ${esc(s1.t)} ${fmtX(s1.stretch.x)} (${fmtPctile(s1.stretch.p)})` : ''}</div></div>` : '',
    (() => { const L1 = m.rows.filter((r) => litOf(r).length); const has = m.rows.some((r) => r.mv); return `<div class="tile rs-littile"><div class="k">Lit by a rule vs ${esc(m.bench)} · at the close</div><div class="v">${has ? `${L1.length}<small>of ${n}</small>` : NM}</div><div class="s">${has ? (L1.length ? esc([...L1].sort((a, b2) => (b2.mv.ratio ?? 0) - (a.mv.ratio ?? 0)).slice(0, 5).map((r) => `${r.t} ${fmtTimes(r.mv.ratio)}`).join(' · ') + (L1.length > 5 ? ` +${L1.length - 5}` : '')) : 'none') : 'this feed has no 1D ÷ swing yet'}</div></div>`; })(),
    `<div class="tile"><div class="k">RS line vs ${esc(m.bench)}: new highs / lows today</div><div class="v"><span class="up">${highs.length}</span><small>highs</small> <span class="dn">${lows.length}</span><small>lows</small></div><div class="s">${highs.length || lows.length ? esc([highs.length ? `high: ${lst(highs)}` : '', lows.length ? `low: ${lst(lows)}` : ''].filter(Boolean).join(' · ')) : 'none over 3M, 6M, 1Y or 2Y'}</div></div>`,
  ].filter(Boolean);
  return `<div class="strip rs-tiles" style="--cols:${tiles.length}">${tiles.join('')}</div>`;
}

function heatHtml(m, st) {
  const tf = m.tf, byPct = st.color === 'pctile';
  const scale = Object.fromEntries(TFS.map((k) => [k, heatScale(m.rows.map((r) => r.rs[k][0]))]));
  const cell = (r, k) => {
    const [v, p] = r.rs[k];
    if (finite(v) == null) return `<td class="hc">${NM}</td>`;
    const fill = byPct ? (finite(p) == null ? 'transparent' : heatFill(p - 50, 50)) : heatFill(v, scale[k]);
    return `<td class="hc${isExt(p) ? ' gx' : ''}${k === tf ? ' cur' : ''}" style="background:${fill}" title="${esc(r.t)} ${TF_LABEL[k]}: ${esc(fmtPct(r.ret?.[k]))} vs ${esc(m.bench)} ${esc(fmtPct(m.benchRow.ret[k]))}"><b>${fmtPP(v)}</b><span>${fmtPctile(p)}</span></td>`;
  };
  const row = (r, i) => `<tr class="hr${st.open === r.t ? ' sel' : ''}"${r.index ? '' : ` data-rs-open="${esc(r.t)}" tabindex="0" role="button" aria-label="${esc(r.t)} ${esc(r.name)}: open its row"`}><td class="hn">${r.index ? '' : i}</td><th class="hg"><b>${esc(r.t)}</b><span>${esc(r.name)}</span></th>${TFS.map((k) => cell(r, k)).join('')}</tr>`;
  const head = `<thead><tr><th class="hn">#</th><th class="l">Group</th>${TFS.map((k) => `<th${k === tf ? ' class="cur"' : ''}><button type="button" class="rs-hsort" data-rs-tf="${k}" aria-pressed="${k === tf}" title="Rank every view on ${TF_LABEL[k]} RS (${TF_WORDS[k]})">${TF_LABEL[k]} RS${k === tf ? ' ▼' : ''}</button></th>`).join('')}</tr></thead>`;
  // two blocks of even height: the index rows (plus their divider) count toward the right-hand block
  const two = m.n > 14; const half = two ? Math.min(m.n, Math.ceil((m.n + (m.idx.length ? m.idx.length + 1 : 0)) / 2)) : m.n;
  const tbl = (rows, off, extra = '') => `<div class="tw no-sk-sort"><table class="rs-heat">${head}<tbody>${rows.map((r, i) => row(r, off + i + 1)).join('')}${extra}</tbody></table></div>`;
  const idxRows = m.idx.length ? `<tr class="hdiv"><td colspan="6">Indexes vs ${esc(m.bench)} (not ranked)</td></tr>${m.idx.map((r) => row(r, 0)).join('')}` : '';
  const nx = Object.fromEntries(TFS.map((k) => [k, m.rows.filter((r) => isExt(r.rs[k][1])).length]));
  const legend = byPct
    ? 'Colour = 2-yr percentile: green above the 50th, red below, full colour at 0% and 100%.'
    : `Colour = RS size: green ahead of ${esc(m.bench)}, red behind; full colour at ${TFS.map((k) => `${TF_LABEL[k]} ±${scale[k].toFixed(2)} pp`).join(' · ')} (85th percentile of each column's sizes).`;
  return `<section class="panel rs-heatp"><h2>RS vs ${esc(m.bench)} by timeframe, ${m.n} groups <small class="rs-rule">rule: group % return minus ${esc(m.bench)} % return over 1 / 5 / 21 / 63 sessions, pp</small> <span class="rs-ctl">Colour by <span class="seg">${btn('data-rs-color', 'value', !byPct, 'RS value')}${btn('data-rs-color', 'pctile', byPct, '2-yr percentile')}</span></span></h2>
    <p class="sub">Cell = RS in pp and its 2-yr percentile · ranked on ${TF_LABEL[tf]} (click a column to re-rank everything) · gold outline = at or below the 5th / at or above the 95th percentile · to the ${esc(dayLabel(m.as_of))} close</p>
    <div class="rs-heatgrid${two ? ' two' : ''}">${tbl(m.rows.slice(0, half), 0, two ? '' : idxRows)}${two ? tbl(m.rows.slice(half), half, idxRows) : ''}</div>
    <p class="note">${legend} Gold cells: ${TFS.map((k) => `${TF_LABEL[k]} ${nx[k]}`).join(' · ')} of ${m.n}.</p></section>`;
}

function barsHtml(m, st) {
  const tf = m.tf, L = TF_LABEL[tf];
  const vals = m.rows.map((r) => r.rs[tf][0]).filter((v) => finite(v) != null);
  const mx = Math.max(0.01, ...vals), mn = Math.min(-0.01, ...vals); const span = mx - mn; const zero = ((0 - mn) / span) * 100;
  // RC2 fix #10 (density, Austin's "middle"): the open rank shows the top and bottom 8; the middle folds behind Show all.
  const cap = st.barsAll || m.n <= 16 ? { head: m.rows, tail: [], mid: [] } : capBothEnds(m.rows, 8);
  const row = (r) => {
    const [v, p] = r.rs[tf]; const w = finite(v) == null ? 0 : (Math.abs(v) / span) * 100; const k = r.rank[tf];
    const lit = litOf(r); const mv = r.mv;
    const litTitle = lit.length ? ` · lit at the close by ${lit.map((x) => LIT_WORD[x] || x).join(' + ')}` : '';
    return `<div class="rs-br${rowExt(r, tf) ? ' ext' : ''}${lit.length ? ' lit' : ''}${st.open === r.t ? ' sel' : ''}" data-rs-open="${esc(r.t)}" tabindex="0" role="button" title="${esc(r.t)} ${esc(r.name)}${esc(litTitle)}"><span class="n">${rk(k.now)}</span><b>${esc(r.t)}</b><span class="trk"><i class="${v >= 0 ? 'u' : 'd'}" style="left:${(v >= 0 ? zero : zero - w).toFixed(2)}%;width:${w.toFixed(2)}%"></i><em style="left:${zero.toFixed(2)}%"></em></span><span class="v ${ud(v)}">${fmtPP(v)}</span><span class="p">${fmtPctile(p)}</span><span class="c ${ud(k.c5)}">${finite(k.c5) == null ? NM : k.c5 === 0 ? '0' : `${k.c5 > 0 ? '▲' : '▼'} ${Math.abs(k.c5)}`}</span><span class="s">${fmtTimes(mv?.ratio)}${lit.length ? `<em class="lt">${esc(lit.map((x) => (x === 'build3' ? '3d' : x)).join('+'))}</em>` : ''}</span><span class="r">${fmtTimes(r.vol?.rvol)}</span><span class="x ${ud(r.stretch?.x)}">${fmtX(r.stretch?.x)}</span><span class="y">${fmtPctile(r.stretch?.p1y)}</span></div>`;
  };
  const cross = (list) => { let out = ''; let prev = null; for (const r of list) { const v = r.rs[tf][0]; if (prev != null && prev >= 0 && v < 0) out += `<div class="rs-bz">RS crosses 0 pp here</div>`; out += row(r); prev = v; } return out; };
  const mid = cap.mid.length ? `<div class="rs-bmid">${cap.mid.length} groups in the middle are folded <button type="button" class="sk-cap-btn" data-rs-all="bars">Show all ${m.n}</button></div>` : (st.barsAll && m.n > 16 ? `<div class="rs-bmid"><button type="button" class="sk-cap-btn" data-rs-all="bars">Show the 12 strongest and 12 weakest</button></div>` : '');
  return `<section class="panel rs-barsp"><h2>Ranked: ${L} RS vs ${esc(m.bench)} ${infoChip(`Rule: ${RS_WIN[tf]}-session % return minus ${m.bench}'s, pp`, `Strongest on top, weakest at the bottom · bar = group % minus ${m.bench} % · gold row = 2-yr extreme on RS or on stretch · white outline = lit by a rule at the close (${m.ruleText || 'rules not in this feed'}) · 1D ÷ swing, RVOL and stretch at the ${dayLabel(m.as_of)} close vs ${m.bench}`)}</h2>
    <div class="rs-bh"><span class="n">#</span><b>Group</b><span class="trk"></span><span class="v">RS</span><span class="p">2-yr pctl</span><span class="c">Rank vs 1W</span><span class="s">1D ÷ swing</span><span class="r">RVOL</span><span class="x">Stretch</span><span class="y">1-yr pctl</span></div>
    ${cross(cap.head)}${cap.tail.length ? mid + cross(cap.tail) : mid}</section>`;
}

function histSvg(hist, n, dates) {
  const H = 26, bw = 2.4, gap = 0.6, W = hist.length * (bw + gap);
  const bars = hist.map((r, i) => {
    if (finite(r) == null) return '';
    const h = 2 + ((n - r) / Math.max(1, n - 1)) * (H - 2);
    const c = r <= Math.ceil(n / 3) ? 'u' : r > n - Math.ceil(n / 3) ? 'd' : 'm';
    return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" class="${c}"/>`;
  }).join('');
  const t = dates?.length ? `Rank each session, ${dayLabel(dates[0], false)} to ${dayLabel(dates[dates.length - 1], false)}: tall = rank 1, short = rank ${n}` : 'Rank each session';
  return `<svg class="rs-hist" viewBox="0 0 ${W.toFixed(0)} ${H}" width="${W.toFixed(0)}" height="${H}" role="img" aria-label="${esc(t)}"><title>${esc(t)}</title>${bars}</svg>`;
}

function baseCell(h, b) {
  if (!h) return NM;
  if (finite(h.vsMed) == null) return `<span class="rs-nb">no base rate yet</span><small>n ${h.n}</small>`;
  return `<span class="${ud(h.vsMed)}">${fmtPP(h.vsMed)}</span><small>${fmtShare(h.vsPos)} beat ${esc(b)} · n ${h.n}</small>`;
}

function liveHtml(t) {
  const model = globalThis.__skSectorLive; const r = model?.rows?.find?.((x) => x.ticker === t);
  if (!r) return `<p class="note">Top movers come from the live sector board run; it is not on the page right now. Everything above is from the nightly bars and does not need it.</p>`;
  const SKIP = new Set(['SNDK', 'SENEA']);
  const all = Array.isArray(r.movers) ? r.movers : []; const movers = all.filter((x) => !SKIP.has(x.t)); const cut = all.length - movers.length;
  const money = (v) => (finite(v) == null ? NM : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);
  const today = `Today, live run: ${fmtPct(finite(r.today_pct))} · vs IWM ${fmtPct(finite(r.vs_iwm_pct))}${finite(r.move_x) != null ? ` · ${signed(r.move_x, 2, '×')} its normal swing` : ''}${finite(r.rvol) != null ? ` · rel. volume ${r.rvol.toFixed(2)}×` : ''}${finite(r.measured) ? ` · members ${finite(r.up) ?? 0} up / ${finite(r.down) ?? 0} down of ${r.measured} stocks` : ''}`;
  if (!movers.length) return `<p class="sub">${esc(today)}</p><p class="note">No mapped member passed the liquidity floor with a measured move.</p>`;
  return `<p class="sub">${esc(today)}</p><div class="tw no-sk-sort"><table class="t rs-mv"><thead><tr><th class="l">Top movers today</th><th>Price</th><th>Today</th><th>Rel. volume</th><th>Mkt cap</th></tr></thead><tbody>${movers.map((x) => `<tr><th><button type="button" class="rs-tk" data-sector-mover="${esc(x.t)}" title="Open ${esc(x.t)} on Now">${esc(x.t)}</button></th><td>${finite(x.price) == null ? NM : '$' + x.price.toFixed(2)}</td><td class="${ud(x.pct)}">${fmtPct(finite(x.pct))}</td><td>${finite(x.rvol) == null ? NM : x.rvol.toFixed(2) + '×'}</td><td>${money(finite(x.cap))}</td></tr>`).join('')}</tbody></table></div>${cut ? `<p class="note">${cut} name${cut === 1 ? '' : 's'} with split artefacts excluded.</p>` : ''}`;
}

function drawerHtml(r, m) {
  const b = m.bench, W = m.windows;
  const rsTiles = TFS.map((k) => `<div class="tile${isExt(r.rs[k][1]) ? ' ext' : ''}"><div class="k">RS ${TF_LABEL[k]} vs ${esc(b)}</div><div class="v ${ud(r.rs[k][0])}">${fmtPP(r.rs[k][0])}</div><div class="s">${fmtPctile(r.rs[k][1])} of 2 yrs · group ${fmtPct(r.ret[k])}</div></div>`).join('');
  const tiles = `<div class="strip compact" style="--cols:8">${rsTiles}
    <div class="tile${isExt(r.stretch.p) ? ' ext' : ''}"><div class="k">Stretch vs 8 EMA</div><div class="v ${ud(r.stretch.x)}">${fmtX(r.stretch.x)}</div><div class="s">${fmtPctile(r.stretch.p)} of 2 yrs · ${fmtPctile(r.stretch.p1y)} of 1 yr · 8 EMA $${r.stretch.ema8.toFixed(2)} · ATR $${r.stretch.atr14.toFixed(2)}</div></div>
    <div class="tile${litOf(r).length ? ' lit' : ''}"><div class="k">1D ÷ swing vs ${esc(b)} · RVOL</div><div class="v">${fmtTimes(r.mv?.ratio)}<small>RVOL ${fmtTimes(r.vol?.rvol)}</small></div><div class="s">1D ${fmtPP(r.mv?.xs?.[r.mv.xs.length - 1])} vs ${esc(b)} · swing ${finite(r.mv?.swing) == null ? NM : `${r.mv.swing.toFixed(2)} pp`}${litOf(r).length ? ` · lit: ${esc(litOf(r).map((x) => LIT_WORD[x] || x).join(', '))}` : ''}</div>${mvBarsSvg(r.mv?.xs, `${r.t} daily % minus ${b} %, last ${r.mv?.xs?.length || 0} sessions, today right`)}</div>
    <div class="tile"><div class="k">Quadrant vs ${esc(b)}</div><div class="v">${esc(QUAD_WORD[r.rot.q] || NM)}</div><div class="s">${sess(r.rot.qSess)} in a row · RS line ${fmtPct(r.rot.x - 100)} vs its 63-session average</div></div>
    <div class="tile"><div class="k">Close $${r.close.toFixed(2)}</div><div class="v ${ud(r.stretch.run)}">${r.stretch.run === 0 ? 'flat' : `${Math.abs(r.stretch.run)} ${r.stretch.run > 0 ? 'up' : 'down'}`}<small>${r.stretch.run === 0 ? 'last close' : Math.abs(r.stretch.run) === 1 ? 'close' : 'closes in a row'}</small></div><div class="s">1D ${fmtPct(r.ret['1d'])} · 5D ${fmtPct(r.ret['5d'])} · 1M ${fmtPct(r.ret['1m'])} · 3M ${fmtPct(r.ret['3m'])}</div></div></div>`;
  const brRows = (br, label) => [1, 3, 5].map((h, i) => {
    const x = br?.h?.[h]; if (!x) return '';
    const lab = i === 0 ? `<th rowspan="3" class="l rs-cond">${label}<small>true on ${fmtShare(br.share)} of sessions</small></th>` : '';
    if (finite(x.absMed) == null) return `<tr>${lab}<td>${h} sess</td><td>${x.n}</td><td colspan="4" class="l">no base rate yet${x.raw?.length ? `: ${x.raw.map((c) => `${esc(dayLabel(c[0], false))} ${fmtPct(c[1])} (${fmtPP(c[2])} vs ${esc(b)})`).join(' · ')}` : ''}</td></tr>`;
    return `<tr>${lab}<td>${h} sess</td><td>${x.n}</td><td class="${ud(x.absMed)}">${fmtPct(x.absMed)}</td><td>${fmtShare(x.absPos)}</td><td class="${ud(x.vsMed)}">${fmtPP(x.vsMed)}</td><td>${fmtShare(x.vsPos)}</td></tr>`;
  }).join('');
  const base = `<div class="tw no-sk-sort"><table class="t rs-brt"><thead><tr><th class="l">After similar readings</th><th>Next</th><th>n</th><th>Median return</th><th>Share positive</th><th>Median vs ${esc(b)}</th><th>Share that beat ${esc(b)}</th></tr></thead><tbody>
    ${brRows(r.brS, `Stretch at least ${fmtX(r.stretch.x)} ${r.brS.side} the 8 EMA`)}${brRows(r.brR, `1M RS at least ${fmtPP(r.rs['1m'][0])} ${r.brR.side} ${esc(b)}`)}</tbody></table></div>`;
  const line = `<div class="tw no-sk-sort"><table class="t rs-lt"><thead><tr><th class="l">RS line (${esc(r.t)} ÷ ${esc(b)})</th>${W.lineLabels.map((l) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    <tr><th>New high / low today</th>${W.lineLabels.map((l, i) => `<td>${r.line.hi[i] ? '<span class="up">new high</span>' : r.line.lo[i] ? '<span class="dn">new low</span>' : 'neither'}</td>`).join('')}</tr>
    <tr><th>Since the last high</th>${W.lineLabels.map((l, i) => `<td>${finite(r.line.sinceHi[i]) == null ? 'none in the data' : sess(r.line.sinceHi[i])}</td>`).join('')}</tr>
    <tr><th>Since the last low</th>${W.lineLabels.map((l, i) => `<td>${finite(r.line.sinceLo[i]) == null ? 'none in the data' : sess(r.line.sinceLo[i])}</td>`).join('')}</tr></tbody></table></div>`;
  return `${tiles}<div class="rs-dgrid"><div>${base}<p class="note">Past cases at least as extreme as today, kept ${W.baseRateGap}+ sessions apart; n can differ by horizon because a recent case has not had 5 sessions yet. Under ${W.baseRateMinN} cases: no rate, the cases are listed. Overlapping ETFs are not independent. Descriptive, not an edge claim.</p></div><div>${line}<div class="rs-live" data-rs-live="${esc(r.t)}">${liveHtml(r.t)}</div></div></div>`;
}

function trackerHtml(m, st) {
  const tf = m.tf, L = TF_LABEL[tf], n = m.n, b = m.bench; const COLS = 15;
  const cap = st.trackAll ? { head: m.rows, tail: [], mid: [] } : capBothEnds(m.rows, 7);
  const midOpen = cap.mid.find((r) => r.t === st.open);
  const row = (r) => {
    const k = r.rank[tf]; const open = st.open === r.t; const lt = lineToday(r.line);
    const streak = k.top3 ? `<span class="up">Top 3 · ${k.top3}${k.capped.top3 ? '+' : ''} sess</span>` : k.bottom3 ? `<span class="dn">Bottom 3 · ${k.bottom3}${k.capped.bottom3 ? '+' : ''} sess</span>` : 'neither';
    const moving = k.improving ? `<span class="up">▲ ${sess(k.improving)}</span>` : k.worsening ? `<span class="dn">▼ ${sess(k.worsening)}</span>` : 'no change';
    const main = `<tr class="click${open ? ' open' : ''}${isExt(r.rs[tf][1]) ? ' ext' : ''}" data-rs-open="${esc(r.t)}" data-rs-row="${esc(r.t)}" tabindex="0" aria-expanded="${open}">
      <td class="rs-rank">${rk(k.now)}</td><th>${esc(r.t)}<span class="chip">${r.grp === 'SECTOR' ? 'Sector' : 'Industry'}</span><small>${esc(r.name)}</small></th>
      <td class="${ud(r.rs[tf][0])}">${fmtPP(r.rs[tf][0])}</td><td>${pcCell(r.rs[tf][1])}</td>
      <td class="opt">${rk(k.d1)}</td><td>${rk(k.w1)}</td><td>${rk(k.m1)}</td>${chgCell(k.c1).replace('<td class="', '<td class="opt ')}${chgCell(k.c5)}${chgCell(k.c21)}
      <td class="opt rs-histc">${histSvg(r.hist[tf], n, m.hist_dates)}</td>
      <td class="l">${streak}<small>rank ${moving}</small></td>
      <td class="l opt">${lt ? `<span class="chip g rs-lc">${lt.label} ${lt.kind}</span>` : 'none'}<small>3M high ${finite(r.line.sinceHi[0]) == null ? NM : sess(r.line.sinceHi[0]) + ' ago'} · low ${finite(r.line.sinceLo[0]) == null ? NM : sess(r.line.sinceLo[0]) + ' ago'}</small></td>
      <td class="${isExt(r.stretch.p) ? 'rs-gx ' : ''}${ud(r.stretch.x)}">${fmtX(r.stretch.x)}<small>${fmtPctile(r.stretch.p)} of 2 yrs</small></td>
      <td class="opt">${baseCell(r.brS?.h?.[5], b)}</td></tr>`;
    return main + (open ? `<tr class="xrow"><td colspan="${COLS}">${drawerHtml(r, m)}</td></tr>` : '');
  };
  const mid = cap.mid.length ? `<tr class="rs-mid"><td colspan="${COLS}">${cap.mid.length} groups in the middle of this ranking are folded <button type="button" class="sk-cap-btn" data-rs-all="track">Show all ${n}</button></td></tr>${midOpen ? row(midOpen) : ''}` : (st.trackAll && n > 14 ? `<tr class="rs-mid"><td colspan="${COLS}"><button type="button" class="sk-cap-btn" data-rs-all="track">Show the 7 strongest and 7 weakest</button></td></tr>` : '');
  return `<section class="panel rs-trackp"><h2>RS rank tracker: ${n} groups vs ${esc(b)}, ranked on ${L} RS <small class="rs-rule">rule: ${RS_WIN[tf]}-session % return minus ${esc(b)}'s, pp</small> <span class="rs-h2n">click a row for its base rates, RS-line windows and today's top movers</span></h2>
    <div class="tw no-sk-sort"><table class="t rs-track"><thead><tr class="grp"><th colspan="2"></th><th colspan="2">${L} RS vs ${esc(b)}</th><th colspan="3">Rank was</th><th colspan="3">Rank change, places</th><th class="opt">Rank history</th><th colspan="2">Streaks and RS line</th><th colspan="2">Mean-reversion lens</th></tr>
    <tr><th>Rank<small>of ${n}</small></th><th class="l">Group</th><th>RS</th><th>2-yr percentile</th><th class="opt">1D ago</th><th>1W ago</th><th>1M ago</th><th class="opt">vs 1D</th><th>vs 1W</th><th>vs 1M</th><th class="opt l">${m.windows.histSessions} sessions</th><th class="l">Top / bottom 3<small>rank moving</small></th><th class="l opt">RS line today<small>sessions since 3M high / low</small></th><th>Stretch vs 8 EMA<small>2-yr percentile</small></th><th class="opt">After similar stretch<small>next 5 sess vs ${esc(b)} · n</small></th></tr></thead>
    <tbody>${cap.head.map(row).join('')}${mid}${cap.tail.map(row).join('')}</tbody></table></div>
    <p class="note">Rank 1 = strongest · rank change in places (+ = moved up) · history = one bar per session for ${m.windows.histSessions} sessions, tall = rank 1 · gold row = ${L} RS at a 2-yr extreme · gold box = stretch at a 2-yr extreme.</p></section>`;
}

const QCOL = { leading: 'ql', weakening: 'qw', lagging: 'qg', improving: 'qi' };
function quadHtml(m, st) {
  const tf = m.tf, W = 700, H = 470, pl = 50, pr = 16, pt = 18, pb = 40;
  const steps = st.tail; const n = m.n;
  const tailSet = new Set([...(n <= 14 ? m.rows : [...m.rows.slice(0, 3), ...m.rows.slice(-3)]).map((r) => r.t), ...(st.open ? [st.open] : [])]);
  const items = m.rows.filter((r) => finite(r.rot.x) != null && finite(r.rot.y) != null).map((r) => ({ r, X: r.rot.x - 100, Y: r.rot.y - 100, tail: (steps && tailSet.has(r.t) ? r.rot.tail.slice(-(steps + 1)) : []).map((p) => ({ d: p[0], x: p[1] - 100, y: p[2] - 100 })) }));
  if (!items.length) return '';
  const xs = items.flatMap((i) => [i.X, ...i.tail.map((p) => p.x)]), ys = items.flatMap((i) => [i.Y, ...i.tail.map((p) => p.y)]);
  const q = (a, f) => { const s = [...a].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
  const step = (span) => (span > 60 ? 10 : span > 24 ? 5 : span > 10 ? 2 : 1);
  let X0 = Math.min(q(xs, 0.02), -2), X1 = Math.max(q(xs, 0.98), 2), Y0 = Math.min(q(ys, 0.02), -2), Y1 = Math.max(q(ys, 0.98), 2);
  const sxs = step(X1 - X0), sys = step(Y1 - Y0);
  X0 = Math.floor(X0 / sxs) * sxs; X1 = Math.ceil(X1 / sxs) * sxs; Y0 = Math.floor(Y0 / sys) * sys; Y1 = Math.ceil(Y1 / sys) * sys;
  const cx = (v) => Math.max(X0, Math.min(X1, v)), cy = (v) => Math.max(Y0, Math.min(Y1, v));
  const sx = (v) => pl + ((cx(v) - X0) / (X1 - X0)) * (W - pl - pr), sy = (v) => pt + ((Y1 - cy(v)) / (Y1 - Y0)) * (H - pt - pb);
  const lab = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
  const cnt = { leading: 0, weakening: 0, lagging: 0, improving: 0 }; for (const i of items) cnt[i.r.rot.q]++;
  let s = `<svg class="rs-quad" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rotation quadrant vs ${esc(m.bench)}: RS line vs its 63-session average across, that reading vs its own 21-session average up"><rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" class="bg"/>`;
  for (let v = X0; v <= X1 + 1e-9; v += sxs) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${pt}" y2="${H - pb}" class="g"/><text x="${sx(v)}" y="${H - pb + 15}" class="ax" text-anchor="middle">${lab(v)}</text>`;
  for (let v = Y0; v <= Y1 + 1e-9; v += sys) s += `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" class="g"/><text x="${pl - 6}" y="${sy(v) + 4}" class="ax" text-anchor="end">${lab(v)}</text>`;
  s += `<line x1="${sx(0)}" x2="${sx(0)}" y1="${pt}" y2="${H - pb}" class="z"/><line x1="${pl}" x2="${W - pr}" y1="${sy(0)}" y2="${sy(0)}" class="z"/>`;
  s += `<text x="${W - pr - 8}" y="${pt + 17}" text-anchor="end" class="ql lab">Leading · ${cnt.leading}</text><text x="${W - pr - 8}" y="${H - pb - 9}" text-anchor="end" class="qw lab">Weakening · ${cnt.weakening}</text><text x="${pl + 8}" y="${H - pb - 9}" class="qg lab">Lagging · ${cnt.lagging}</text><text x="${pl + 8}" y="${pt + 17}" class="qi lab">Improving · ${cnt.improving}</text>`;
  s += `<text x="${(pl + W - pr) / 2}" y="${H - 5}" text-anchor="middle" class="axl">Across: RS line vs its 63-session average (%) · right = stronger vs ${esc(m.bench)} than its 3M norm</text><text transform="translate(12 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" class="axl">Up: that reading vs its own 21-session average (%) · up = gaining</text>`;
  for (const i of items) {
    const c = QCOL[i.r.rot.q];
    for (let k = 1; k < i.tail.length; k++) s += `<line x1="${sx(i.tail[k - 1].x).toFixed(1)}" y1="${sy(i.tail[k - 1].y).toFixed(1)}" x2="${sx(i.tail[k].x).toFixed(1)}" y2="${sy(i.tail[k].y).toFixed(1)}" class="tl ${c}${st.open === i.r.t ? ' sel' : ''}" style="opacity:${(0.3 + 0.65 * (k / Math.max(1, i.tail.length - 1))).toFixed(2)}"/>`;
    i.tail.slice(0, -1).forEach((p) => { s += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2" class="td ${c}"><title>${esc(i.r.t)} ${esc(dayLabel(p.d, false))}: ${lab(+p.x.toFixed(2))} / ${lab(+p.y.toFixed(2))}</title></circle>`; });
  }
  const off = [];
  for (const i of items) {
    const r = i.r, x = sx(i.X), y = sy(i.Y), sel = st.open === r.t, ext = isExt(r.rs[tf][1]);
    const isOff = i.X > X1 || i.X < X0 || i.Y > Y1 || i.Y < Y0; if (isOff) off.push(i);
    s += `<g class="dot" data-rs-open="${esc(r.t)}" tabindex="0" role="button" aria-label="${esc(r.t)} ${esc(r.name)}, ${QUAD_WORD[r.rot.q]}">${ext ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 11 : 9}" class="gx"/>` : ''}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 6.5 : tailSet.has(r.t) ? 5 : 3.6}" class="d ${QCOL[r.rot.q]}${sel ? ' sel' : ''}"><title>${esc(r.t)} ${esc(r.name)} · ${QUAD_WORD[r.rot.q]} for ${sess(r.rot.qSess)} · across ${lab(+i.X.toFixed(2))} · up ${lab(+i.Y.toFixed(2))} · ${TF_LABEL[tf]} RS ${fmtPP(r.rs[tf][0])}</title></circle>${tailSet.has(r.t) || ext || n <= 14 ? `<text x="${(x + 8).toFixed(1)}" y="${(y - 7).toFixed(1)}" class="tk">${esc(r.t)}</text>` : ''}</g>`;
  }
  off.forEach((i, k) => { s += `<text x="${W - pr - 8}" y="${pt + 36 + k * 14}" text-anchor="end" class="ax">${esc(i.r.t)} ${lab(+i.X.toFixed(1))} / ${lab(+i.Y.toFixed(1))} is off the scale</text>`; });
  s += '</svg>';
  const tails = [0, 4, 8, 12].map((v) => btn('data-rs-tail', String(v), st.tail === v, v ? `${v} steps` : 'Off')).join('');
  return `<section class="panel rs-quadp"><h2>Rotation quadrant vs ${esc(m.bench)} <span class="chip">RRG-style, our formula</span> <span class="rs-ctl">Tail <span class="seg">${tails}</span></span></h2>
    <p class="sub">${items.length} groups · 1 step = 5 sessions · tails on the 3 strongest and 3 weakest by ${TF_LABEL[tf]} RS${st.open ? ` and ${esc(st.open)}` : ''}${n <= 14 ? ' (all groups in this filter)' : ''} · gold ring = ${TF_LABEL[tf]} RS at a 2-yr extreme · click a dot for its row</p>${s}
    <p class="note"><span class="rs-key ql">Leading</span> ahead and gaining · <span class="rs-key qw">Weakening</span> ahead, losing pace · <span class="rs-key qg">Lagging</span> behind and losing · <span class="rs-key qi">Improving</span> behind, gaining. Position only: across = 100 × RS line ÷ its 63-session average, up = 100 × that ÷ its own 21-session average, both shown as % from 100. Not the StockCharts RS-Ratio / RS-Momentum formula.</p></section>`;
}

function evidenceHtml(m) {
  const b = m.bench;
  const withS = m.rows.filter((r) => finite(r.stretch.x) != null);
  const up = withS.filter((r) => r.stretch.x > 0).sort((a, c) => c.stretch.x - a.stretch.x), dn = withS.filter((r) => r.stretch.x < 0).sort((a, c) => a.stretch.x - c.stretch.x);
  const cell = (h) => {
    if (!h) return `<td>${NM}</td>`;
    if (finite(h.absMed) == null) return `<td class="rs-nbc">no base rate yet</td>`;
    return `<td><span class="${ud(h.absMed)}">${fmtPct(h.absMed)}</span> <span class="rs-sh">${fmtShare(h.absPos)} up</span><small><span class="${ud(h.vsMed)}">${fmtPP(h.vsMed)}</span> · ${fmtShare(h.vsPos)} beat</small></td>`;
  };
  const tbl = (rows, key) => `<div class="tw"><table class="t rs-ev" data-sk-cap="6" data-sk-cap-key="rs-ev-${key}"><thead><tr><th class="l">Group</th><th>Stretch<small>2-yr percentile</small></th><th>${TF_LABEL[m.tf]} RS<small>2-yr percentile</small></th><th>n<small>share of sessions</small></th><th>Next 1 sess</th><th>Next 3 sess</th><th>Next 5 sess</th></tr></thead><tbody>${rows.map((r) => `<tr class="${isExt(r.stretch.p) ? 'ext' : ''}"><th>${esc(r.t)}<small>${esc(r.name)}</small></th><td class="${ud(r.stretch.x)}">${fmtX(r.stretch.x)}<small>${fmtPctile(r.stretch.p)}</small></td><td class="${ud(r.rs[m.tf][0])}">${fmtPP(r.rs[m.tf][0])}<small>${fmtPctile(r.rs[m.tf][1])}</small></td><td>${nText(r.brS)}<small>${fmtShare(r.brS?.share)}</small></td>${[1, 3, 5].map((h) => cell(r.brS?.h?.[h])).join('')}</tr>`).join('') || `<tr><td colspan="7" class="l">No group on this side today.</td></tr>`}</tbody></table></div>`;
  return `<section class="panel rs-evp"><h2>Mean-reversion evidence: stretch from the 8 EMA and what followed</h2>
    <p class="sub">Both sides, most stretched first · stretch = (close − 8 EMA) ÷ ATR 14 · each "next" cell: median return and share of cases that rose, then the same minus ${esc(b)} and the share that beat ${esc(b)} · n = past cases at least this stretched, 5+ sessions apart (three numbers when the horizons differ)</p>
    <div class="rs-evgrid"><div><h3>Stretched above the 8 EMA <span>${up.length} of ${m.n} groups</span></h3>${tbl(up, 'up')}</div><div><h3>Stretched below the 8 EMA <span>${dn.length} of ${m.n} groups</span></h3>${tbl(dn, 'dn')}</div></div>
    <p class="note">"Share of sessions" = how often the condition was true; when it is high (a small stretch) the rate is close to the plain everyday rate. ${m.source.sessions} sessions, ${esc(dayLabel(m.source.first, false))} ${esc(m.source.first.slice(0, 4))} to ${esc(dayLabel(m.source.last, false))} ${esc(m.source.last.slice(0, 4))}: one market regime, overlapping ETFs. Descriptive, not an edge claim.</p></section>`;
}

function methodHtml(m, st) {
  const W = m.windows;
  return `<details class="fold sec rs-method" data-sk-label="Definitions" data-rs-fold="method"${st.method ? ' open' : ''}><summary>Method and definitions<span>RS, ranks, percentile rule, quadrant formula, base rates, source</span></summary><div class="note">
    <p><b>RS</b> = group % return minus benchmark % return over the same sessions, in percentage points: 1D = 1 session, 5D = 5, 1M = 21, 3M = 63.</p>
    <p><b>Rank</b>: groups sorted by RS, 1 = strongest, among the 46 ETFs (SPY, QQQ and IWM are never ranked). With the Sectors or Industries pill on, ranks are counted inside that set, from the stored ${W.histSessions}-session history, so a streak longer than ${W.histSessions} sessions prints with a +.</p>
    <p><b>2-yr percentile</b> = share of the group's own last ${W.pctileSessions} sessions (today included) at or below today's reading. Same rule and same daily bars as the board's other 2-yr columns, so SPY's stretch percentile here equals the Regime tab's.</p>
    <p><b>RS line</b> = group close ÷ benchmark close. New high / low today = today is the highest / lowest of the last 63 / 126 / 252 / 504 sessions.</p>
    <p><b>Stretch</b> = (close − 8 EMA) ÷ Wilder ATR 14. <b>After similar</b>: past sessions at least as stretched on the same side (or 1M RS at least as far ahead / behind), kept ${W.baseRateGap}+ sessions apart; forward returns over 1, 3 and 5 sessions, absolute and minus the benchmark. Under ${W.baseRateMinN} cases no rate is printed.</p>
    <p><b>Quadrant</b>: across = 100 × RS line ÷ its ${W.rotX}-session average, up = 100 × that ÷ its own ${W.rotY}-session average. RRG-style layout with our own formula.</p>
    <p><b>Source</b>: ${esc(m.source.dataset)}, ${m.source.sessions} sessions ${esc(m.source.first)} to ${esc(m.source.last)}. Built ${esc(mtStamp(m.generated_at))}. Nightly data: it does not move during the session.</p></div></details>`;
}

export function renderRs(data, st) {
  const pills = `<span class="seg" role="group" aria-label="Filter groups">${[['ALL', 'All'], ['SECTOR', 'Sectors'], ['INDUSTRY', 'Industries']].map(([f, l]) => { const c = data?.groups ? data.groups.filter((g) => f === 'ALL' || g.grp === f).length : null; return btn('data-sector-filter', f, st.filter === f, `${l}${c != null ? ` ${c}` : ''}`); }).join('')}</span>`;
  if (!data || !data.bench) return `<div class="sk rs"><div class="head"><h1>Sectors</h1>${pills}</div><p class="read">${esc(st.error ? `The relative-strength file did not load (${st.error}). The live board below is unaffected.` : 'Loading relative strength…')}</p></div>`;
  const m = rsModel(data, st);
  if (!m || !m.rows.length) return `<div class="sk rs"><div class="head"><h1>Sectors</h1>${pills}</div><p class="read">No group in this filter has relative-strength data.</p></div>`;
  const ctl = `<div class="rs-ctlrow"><span class="rs-ctl">Benchmark <span class="seg" role="group" aria-label="Benchmark">${Object.keys(data.bench).map((b) => btn('data-rs-bench', b, st.bench === b, b)).join('')}</span></span>
    <span class="rs-ctl">Groups ${pills}</span>
    <span class="rs-ctl">Rank on <span class="seg" role="group" aria-label="Timeframe">${TFS.map((k) => btn('data-rs-tf', k, st.tf === k, TF_LABEL[k], ` title="${TF_WORDS[k]}"`)).join('')}</span></span>
    </div>`;
  const dropped = Array.isArray(data.dropped) && data.dropped.length ? `<p class="note">${data.dropped.length} ETF${data.dropped.length === 1 ? '' : 's'} left out for short or broken bar history: ${esc(data.dropped.map((d) => d.t).join(', '))}.</p>` : '';
  // R54: no meta line or summary paragraph at the top; both fold into the ⓘ chip beside the title, controls share the row.
  const chip = infoChip(`RS to the ${dayLabel(m.as_of)} close · built ${mtStamp(m.generated_at)}`, `Relative strength: ${m.source.dataset} · ${m.source.sessions} sessions ${m.source.first} to ${m.source.last}`, readHtml(m));
  return `<div class="sk rs"><div class="head rs-headrow"><h1>Sectors</h1>${chip}${ctl}</div>
    ${tilesHtml(m)}
    <div class="rs-low">${quadHtml(m, st)}${evidenceHtml(m)}</div>
    <div class="rs-rank1">${barsHtml(m, st)}</div>
    <details class="rs-fold" data-rs-fold="heat"${st.fold_heat ? ' open' : ''}><summary>Reference: RS heat map, all ${m.n} groups on 1D / 5D / 1M / 3M with 2-yr pctl</summary>${heatHtml(m, st)}</details>
    <details class="rs-fold" data-rs-fold="track"${st.fold_track ? ' open' : ''}><summary>Reference: RS rank tracker, rank history per group</summary>${trackerHtml(m, st)}</details>${dropped}
    ${methodHtml(m, st)}</div>`;
}

// ---------- browser wiring ----------
const KEY = 'rc2.rs';
export function loadPrefs(raw) {
  const d = { bench: 'SPY', tf: '1m', color: 'value', tail: 4 };
  try {
    const p = JSON.parse(raw || '{}');
    if (p.bench === 'SPY' || p.bench === 'IWM') d.bench = p.bench;
    if (TFS.includes(p.tf)) d.tf = p.tf;
    if (p.color === 'value' || p.color === 'pctile') d.color = p.color;
    if ([0, 4, 8, 12].includes(p.tail)) d.tail = p.tail;
  } catch { /* bad or blocked storage: defaults */ }
  return d;
}

if (typeof document !== 'undefined' && !globalThis.__rsRotationWired) {
  globalThis.__rsRotationWired = true;
  let stored = null; try { stored = localStorage.getItem(KEY); } catch { /* blocked */ }
  const st = { ...loadPrefs(stored), filter: 'ALL', open: null, trackAll: false, barsAll: false, method: false, error: null };
  let data = null;
  const host = () => document.getElementById('rsRotation');
  // D63: the live board lower on the tab reads its 1M RS column from this file and this benchmark (app.js listens).
  const announce = () => { globalThis.__rc2Rs = { data, bench: st.bench }; try { document.dispatchEvent(new CustomEvent('rc2-rs-change')); } catch { /* no CustomEvent */ } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ bench: st.bench, tf: st.tf, color: st.color, tail: st.tail })); } catch { /* blocked */ } };
  const paint = (refocus) => {
    const h = host(); if (!h) return;
    h.innerHTML = renderRs(data, st);
    // RC2 fix #6: the header chip reads the RS feed's own as-of (the close it runs to), not the live board's clock.
    // Set on the host so the chip's attribute observer repaints; the host sits above the live board in the tab.
    if (data && /^\d{4}-\d{2}-\d{2}$/.test(String(data.as_of || ''))) { h.setAttribute('data-asof', data.as_of); if (data.generated_at) h.setAttribute('data-built', data.generated_at); }
    if (refocus) h.querySelector(refocus)?.focus({ preventScroll: true });
  };
  // RC2 fix #10: remember which reference folds are open across re-renders.
  document.addEventListener('toggle', (ev) => { const d = ev.target; if (d?.matches?.('details[data-rs-fold]')) st['fold_' + d.dataset.rsFold] = d.open; }, true);
  document.addEventListener('click', (ev) => {
    const h = host(); const el = ev.target?.closest?.('[data-rs-bench],[data-rs-tf],[data-rs-color],[data-rs-tail],[data-rs-all],[data-rs-open],[data-sector-filter]');
    if (!h || !el) return;
    if (el.dataset.sectorFilter) { // shared with the live board (app.js re-renders that one from the same click)
      if (st.filter !== el.dataset.sectorFilter) { st.filter = el.dataset.sectorFilter; paint(h.contains(el) ? `[data-sector-filter="${st.filter}"]` : null); }
      return;
    }
    if (!h.contains(el)) return;
    if (ev.target.closest('[data-sector-mover]')) return; // a mover ticker opens on Now (app.js)
    const d = el.dataset;
    if (d.rsBench) { st.bench = d.rsBench; save(); paint(`[data-rs-bench="${st.bench}"]`); announce(); return; }
    if (d.rsTf) { st.tf = d.rsTf; save(); paint(`.rs-ctlrow [data-rs-tf="${st.tf}"]`); return; }
    if (d.rsColor) { st.color = d.rsColor; save(); paint(`[data-rs-color="${st.color}"]`); return; }
    if (d.rsTail != null && d.rsTail !== '') { st.tail = +d.rsTail; save(); paint(`[data-rs-tail="${st.tail}"]`); return; }
    if (d.rsAll) { if (d.rsAll === 'track') st.trackAll = !st.trackAll; else st.barsAll = !st.barsAll; paint(`[data-rs-all="${d.rsAll}"]`); return; }
    if (d.rsOpen) {
      if (ev.target.closest('tr.xrow')) return;
      const fromTable = !!el.closest('.rs-track'); const t = d.rsOpen;
      if (!data?.bench?.[st.bench]?.rows?.[t]) return; // an index row has no tracker row
      st.open = st.open === t && fromTable ? null : t;
      paint();
      const row = h.querySelector(`tr[data-rs-row="${t}"]`);
      if (row) { row.focus({ preventScroll: true }); if (!fromTable) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.key !== 'Enter' && ev.key !== ' ') || !ev.target?.matches?.('[data-rs-open]') || !host()?.contains(ev.target)) return;
    ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  document.addEventListener('toggle', (ev) => { if (ev.target?.dataset?.rsFold === 'method') st.method = ev.target.open; }, true);
  // the live board (sector-board.mjs) announces each render: refresh only the movers slot of the open row
  document.addEventListener('sk-sector-live', () => { const slot = host()?.querySelector('[data-rs-live]'); if (slot) slot.innerHTML = liveHtml(slot.dataset.rsLive); });
  const start = async () => {
    paint();
    try {
      const res = await fetch(new URL('./data/rc2-rs.json', import.meta.url), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) { st.error = e?.message || String(e); }
    paint();
    announce();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
