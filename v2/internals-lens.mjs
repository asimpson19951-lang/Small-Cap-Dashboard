// INTERNALS lens (V2.18.0): past-only extremes, streaks, "last extreme" and extreme EPISODES.
// Pure functions only (no I/O, no network): the private builder imports them, tests/internals-lens.test.mjs pins them,
// and internals-tab.mjs renders data/internals-lens.json built from them.
//
// PAST-ONLY: day j is ranked ONLY against the last WIN observations up to and including j (mid-rank), and only
// after WARM observations exist. Appending later data can never change an earlier day's classification.

export const LENS = { WARM: 120, WIN: 500, GAP: 10, LO: 5, HI: 95 };

// mid-rank percentile of v inside arr (same definition the producer states: mid-rank %)
export function midRank(arr, v) {
  let lt = 0, eq = 0;
  for (const x of arr) { if (x < v) lt++; else if (x === v) eq++; }
  return ((lt + eq / 2) / arr.length) * 100;
}

// side[j] = 'low' | 'high' | null, using ONLY values[0..j]. Days before the warm-up are null.
export function pastOnlySides(values, { warm = LENS.WARM, win = LENS.WIN } = {}) {
  const out = [];
  for (let j = 0; j < values.length; j++) {
    if (j < warm || !Number.isFinite(values[j])) { out.push(null); continue; }
    const w = values.slice(Math.max(0, j - win + 1), j + 1).filter(Number.isFinite);
    const p = midRank(w, values[j]);
    out.push(p <= LENS.LO ? 'low' : p >= LENS.HI ? 'high' : null);
  }
  return out;
}

// Real window (observation count) that day j was ranked on.
export const windowAt = (j, win = LENS.WIN) => Math.min(j + 1, win);

// Raw episodes = the first session of every run of extreme days (re-entries count again).
// Merged episodes = a re-entry within GAP sessions of the episode's LAST extreme session joins that episode.
// `eligible(j)` lets the caller drop starts that have no price on that date (it never affects the gap clock).
export function episodeStarts(sides, side, { gap = LENS.GAP, warm = LENS.WARM, eligible = () => true, win = LENS.WIN } = {}) {
  const raw = [], merged = [];
  let lastExt = -1e9;
  for (let j = warm; j < sides.length; j++) {
    if (sides[j] !== side) continue;
    const start = sides[j - 1] !== side;
    if (start && eligible(j)) raw.push({ j, win: windowAt(j, win) });
    // a start with no price still opens its episode (later re-entries fold into IT, not the previous one); it is just not listed
    if (j - lastExt > gap) merged.push({ j, win: windowAt(j, win), merged: 0, ok: eligible(j) });
    else if (start && merged.length) merged[merged.length - 1].merged++;
    lastExt = j;
  }
  return { raw, merged: merged.filter((e) => e.ok).map(({ ok, ...e }) => e) };
}

// Streak of today's extreme (consecutive sessions on the same side, ending at index k). 0 if k is not extreme.
export function streakAt(sides, k = sides.length - 1) {
  if (k < 0 || !sides[k]) return 0;
  let n = 0;
  for (let j = k; j >= 0 && sides[j] === sides[k]; j--) n++;
  return n;
}

// Most recent extreme session BEFORE the current streak (or before k when k is not extreme). Past-only by construction.
export function lastExtremeBefore(sides, k = sides.length - 1) {
  const st = streakAt(sides, k);
  for (let j = k - st; j >= 0; j--) if (sides[j]) return { j, side: sides[j], ago: k - j };
  return null;
}

export function median(a) {
  const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Summary of a start list. f5(start) = IWM next-5-session % return, or null while still pending.
export function summarize(starts, f5) {
  const f = starts.map((e) => f5(e));
  const done = f.filter((x) => x != null);
  return { n: starts.length, n5: done.length, iwm5: median(done), iwm5up: done.filter((x) => x > 0).length };
}

// ---------- rendering helpers (used by internals-tab.mjs; kept here so the patch to the tab stays small) ----------
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MINUS = '−';
export const escH = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// "Sep 10 2026": always with the year (these dates can be a year or more back).
export function dYear(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${MON[+m[2] - 1]} ${+m[3]} ${m[1]}` : 'n/a';
}
const dMD = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : 'n/a'; };
export const sp = (x, d = 2) => (fin(x) ? `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(x).toFixed(d)}%` : 'n/a');
const signCls = (x) => (!fin(x) || x === 0 ? '' : x > 0 ? 'ix-pos' : 'ix-neg');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Window label for a summary: real session counts, flagged when under the full 500 (2 yrs).
export function windowLabel(sum) {
  const list = sum?.list || [];
  if (!list.length) return 'none';
  const w = list.map((x) => x.win), lo = Math.min(...w), hi = Math.max(...w);
  const under = list.filter((x) => x.win < LENS.WIN).length;
  return `${lo === hi ? lo : `${lo}–${hi}`} sessions${under ? ` · ${under} of ${list.length} under 2 yrs` : ''}`;
}

// LAST EXTREME cell (past-only). Returns {html, text}. lens = parsed internals-lens.json (or null); c = fear/greed component.
export function lastExtremeCell(lens, c, fmtVal) {
  const L = lens?.series && Object.hasOwn(lens.series, c?.id) ? lens.series[c.id] : null;
  const na = (why) => ({ text: 'n/a', html: `<span title="${escH(why)}">n/a</span>` });
  if (!L) return na('No past-only history for this series in this build');
  if (L.freq !== 'daily') return na(`Weekly and monthly series are shorter than the ${LENS.WARM}-observation warm-up, so no past-only rank exists`);
  if (L.as_of !== c.as_of) return na(`Past-only history ends ${dYear(L.as_of)} MT; this reading is ${dYear(c.as_of)} MT`);
  if (L.today) {
    const t = `now`;
    const tip = `At an extreme today (${L.today}), ${plural(L.streak, 'session', 'sessions')} running since ${dMD(L.streak_from)}. Past-only: each day ranked only against the sessions up to it.`;
    return { text: t, html: `<b class="ix-now-ext" title="${escH(tip)}">${escH(t)}</b>` };
  }
  if (!L.last) return { text: 'none', html: `<span title="Past-only ranks start ${escH(dYear(lens.meta?.series_from))}">none since ${escH(dYear(lens.meta?.series_from))}</span>` };
  const v = fmtVal && fin(L.last.value) ? ` · ${fmtVal(L.last.value)}` : '';
  const tip = `${dYear(L.last.date)} ${L.last.side}${v} · past-only`;
  return { text: `${L.last.ago} sessions ago`, html: `<span title="${escH(tip)}">${L.last.ago} sess</span>` };
}

// One short phrase per series at an extreme today, for the header pill (text only, no gold text).
export function streakPhrases(lens, comps) {
  const out = [];
  for (const c of comps) {
    const L = lens?.series && Object.hasOwn(lens.series, c.id) ? lens.series[c.id] : null;
    if (!L || !L.today || L.as_of !== c.as_of) continue;
    out.push({ id: c.id, label: c.label, side: L.today, streak: L.streak, from: L.streak_from });
  }
  return out;
}

const EP_IDS = ['pct_above_50dma', 'new_52w_highs_minus_lows', 'new_52w_lows', 'vix', 'vix_over_vix3m', 'cboe_put_call_equity', 'cboe_put_call_index', 'cboe_put_call_total', 'hyg_ief_ratio', 'spy_tlt_20d_return_spread'];
const upTxt = (s) => (s.n5 ? `${s.iwm5up} of ${s.n5} up` : 'no 5-day result yet');
function sideCells(S) {
  const m = S.merged, r = S.raw;
  const tip = (m.list || []).map((x) => `${dYear(x.d)} ranked on ${x.win} sessions${x.merged ? ` (+${plural(x.merged, 're-entry', 're-entries')})` : ''}: IWM next 5 days ${x.f5 == null ? 'pending' : sp(x.f5)}`).join(' | ');
  const rawTxt = r.n ? `${plural(r.n, 'episode', 'episodes')} · ${r.n5 ? `${sp(r.iwm5)} · ${r.iwm5up} of ${r.n5} up` : 'no 5-day result yet'}` : '0 episodes';
  if (!m.n) return `<td data-unit="episodes" class="ix-ep-n">0 episodes</td><td>n/a</td><td>n/a</td><td class="ix-ep-w">none</td><td class="ix-ep-raw">${escH(rawTxt)}</td>`;
  return `<td data-unit="episodes" class="ix-ep-n" title="${escH(tip)}"><b>${escH(plural(m.n, 'episode', 'episodes'))}</b></td><td class="${signCls(m.iwm5)}" data-unit="%">${escH(sp(m.iwm5))}</td><td data-unit="count">${escH(upTxt(m))}</td><td class="ix-ep-w">${escH(windowLabel(m))}</td><td class="ix-ep-raw">${escH(rawTxt)}</td>`;
}

// The episodes card body: summary table + baseline + episode-by-episode table for the headline series.
export function renderEpisodes(lens, comps, labels, fmtVal) {
  if (!lens?.series || !lens.meta) return '';
  const C = Object.fromEntries(comps.map((c) => [c.id, c]));
  const rows = EP_IDS.filter((id) => Object.hasOwn(lens.series, id) && C[id]).map((id) => {
    const E = lens.series[id], c = C[id];
    const now = E.today && E.as_of === c.as_of ? `<b class="ix-now-ext">${escH(E.today)} extreme now</b> · ${escH(plural(E.streak, 'session', 'sessions'))}` : 'inside its range';
    return `<tr class="${E.today && E.as_of === c.as_of ? 'ix-row-ext' : ''}"><th scope="row">${escH(labels[id] || c.label)}</th><td data-unit="${escH(c.unit)}">${escH(fmtVal(c.value, c.unit))}</td><td class="ix-ep-now">${now}</td>${sideCells(E.low)}${sideCells(E.high)}</tr>`;
  }).join('');
  if (!rows) return '';
  const B = lens.base || {};
  const base = B.IWM ? `<p class="ix-note"><b>Baseline, same span as the episodes:</b> every session ${escH(dYear(B.from))} → ${escH(dYear(B.to))} MT (${escH(plural(B.n5, 'session', 'sessions'))} with a 5-day result): IWM next 1 day median <b>${escH(sp(B.IWM.d1))}</b>, next 5 days median <b>${escH(sp(B.IWM.d5))}</b>${B.from_other && B.from_other !== B.from ? ` (longest series, VIX). Series starting ${escH(dYear(B.from_other))}: next 5 days median <b>${escH(sp(B.IWM.d5_other))}</b>.` : "."}</p>` : '';
  const head = (side) => `<th colspan="5" class="ix-ep-grp">${side} EXTREME EPISODES · MERGED</th>`;
  const sub = '<th>Episodes</th><th>IWM next 5 days<br>median</th><th>IWM 5 days<br>up</th><th>Ranked on<br>(window)</th><th>Raw (re-entries<br>counted)</th>';
  const main = `<div class="tt-wrap"><table class="theme-table ix-ep"><thead><tr><th class="l" rowspan="2">Series</th><th rowspan="2">Latest</th><th class="l" rowspan="2">Now (past-only)</th>${head('LOW')}${head('HIGH')}</tr><tr>${sub}${sub}</tr></thead><tbody>${rows}</tbody></table></div>`;
  // episode-by-episode for the headline series (low side)
  const A = lens.series.pct_above_50dma?.low;
  let detail = '';
  if (A?.merged?.list?.length) {
    const ml = A.merged.list, rl = A.raw.list || [];
    const body = ml.map((x, i) => {
      const nxt = ml[i + 1]?.d || '9999-12-31';
      const inside = rl.filter((r) => r.d >= x.d && r.d < nxt);
      return `<tr><th scope="row">${escH(dYear(x.d))}</th><td data-unit="sessions">${x.win} sessions${x.win < LENS.WIN ? ' <span class="ix-chip">under 2 yrs</span>' : ''}</td><td>${x.merged ? escH(plural(x.merged, 're-entry', 're-entries')) + ' merged' : 'none'}</td><td class="ix-ep-in">${inside.map((r) => `${escH(dMD(r.d))} ${r.f5 == null ? 'pending' : escH(sp(r.f5))}`).join(' · ')}</td><td class="${signCls(x.f5)}" data-unit="%">${x.f5 == null ? 'pending' : escH(sp(x.f5))}</td></tr>`;
    }).join('');
    detail = `<div class="ix-sub-head"><h3>Episode by episode · stocks above 50-day MA · low side</h3></div><p class="ix-note">Raw: ${escH(plural(A.raw.n, 'episode', 'episodes'))}, IWM next 5 days median <b>${escH(sp(A.raw.iwm5))}</b>, up ${A.raw.iwm5up} of ${A.raw.n5}. Merged: ${escH(plural(A.merged.n, 'episode', 'episodes'))}, median <b>${escH(sp(A.merged.iwm5))}</b>, up ${A.merged.iwm5up} of ${A.merged.n5}. Re-entries inside one episode are not counted as new evidence.</p><div class="tt-wrap"><table class="theme-table ix-epx"><thead><tr><th class="l">Episode start</th><th>Ranked on</th><th>Re-entries</th><th class="l">Raw starts inside · IWM next 5 days each</th><th>IWM next 5 days<br>(merged)</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  return { base, main, detail };
}
