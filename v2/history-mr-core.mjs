// HISTORY tab math (V2.18.0). Pure functions shared by the tab (browser) and the node tests.
// Descriptive statistics only: no scores, no edge claim. Open runs are counted (Kaplan-Meier).
export const BANDS = ['≤5%', '5–50%', '50–80%', '80–95%', '≥95%'];
export const GOLD_MIN_WINDOW = 250; // sessions of own history a percentile needs before it can earn a gold row (same floor as SMART MONEY)
export const WINDOW_MAX = 500;

export const median = (a) => {
  const s = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const bandIdx = (p) => (p == null ? null : p <= 5 ? 0 : p < 50 ? 1 : p < 80 ? 2 : p < 95 ? 3 : 4);
export const isExtreme = (p) => p != null && (p <= 5 || p >= 95);
// Gold only when the reading is an extreme AND its own window is long enough to mean something.
export const goldRow = (run) => isExtreme(run.pFlag) && run.pN != null && run.pN >= GOLD_MIN_WINDOW;

// Items: { t: sessions observed, e: true when the run resolved (event), false when still open (censored at t) }.
// Median = first t where the survival curve drops to 0.5 or lower. When it never does (over half still open at the longest
// follow-up) the median is only a lower bound: bound = true and med = the longest follow-up ("> N s").
export function km(items) {
  const events = [...new Set(items.filter((x) => x.e).map((x) => x.t))].sort((a, b) => a - b);
  let s = 1;
  const curve = [];
  for (const t of events) {
    const n = items.filter((x) => x.t >= t).length;
    const d = items.filter((x) => x.e && x.t === t).length;
    s *= 1 - d / n;
    curve.push({ t, s: +s.toFixed(4), n, d });
  }
  const hit = curve.find((c) => c.s <= 0.5);
  const maxT = Math.max(...items.map((x) => x.t), 0);
  return { curve, med: hit ? hit.t : maxT, bound: !hit, maxT };
}
export const survAt = (K, t) => {
  let v = 1;
  for (const c of K.curve) if (c.t <= t) v = c.s;
  return v;
};
// Red-team fix (Oct 19 2026): a median that rests on one resolved run with only a couple of runs still at risk is
// not a point estimate. Say "more than N sessions" (N = the last follow-up where survival is still above 50%) and name the support.
export const kmText = (x) => {
  if (!x.n) return 'n/a';
  if (x.km.bound) return `> ${x.km.maxT} s`;
  const idx = x.km.curve.findIndex((c) => c.s <= 0.5);
  const hit = x.km.curve[idx];
  if (hit && hit.n < 5) {
    const prev = idx > 0 ? x.km.curve[idx - 1].t : 0;
    return `more than ${prev} sessions (${hit.d} resolved run${hit.d === 1 ? '' : 's'}, ${hit.n} still at risk)`;
  }
  return `${x.km.med} s`;
};

// A run is usable in the stats when no reverse split sits inside its life and it has a duration (an open run on 0 sessions counts).
export const usable = (m) => !m.straddle?.length && (m.status === 'resolved' ? m.toRes != null : m.so != null);
export const item = (m) => (m.status === 'resolved' ? { t: m.toRes, e: true } : { t: m.so, e: false });

export function summarize(q) {
  const rs = q.filter((m) => m.status === 'resolved');
  return {
    n: q.length, res: rs.length, open: q.length - rs.length, km: km(q.map(item)),
    toPeak: median(rs.map((m) => m.toPeak)), runSize: median(q.map((m) => m.runSize)),
    shortWin: q.filter((m) => m.pN != null && m.pN < GOLD_MIN_WINDOW).length, tickers: q.map((m) => m.t),
  };
}
export function buildStats(runs) {
  const stats = {};
  for (const book of ['SC', 'ML']) {
    const q = runs.filter((m) => m.book === book && usable(m));
    stats[book] = {
      all: summarize(q),
      bands: BANDS.map((_, k) => summarize(q.filter((m) => bandIdx(m.pFlag) === k))),
      noP: q.filter((m) => m.pFlag == null).length,
      straddle: runs.filter((m) => m.book === book && m.straddle?.length).map((m) => m.t),
    };
  }
  return stats;
}
// Resolved-only median (what the page used to say before open runs were counted); shown beside the KM figure for honesty.
export const resolvedMedian = (runs, book) => median(runs.filter((r) => r.book === book && r.status === 'resolved' && !r.straddle?.length).map((r) => r.toRes));
// Share of a band still open at this age + how many runs were observed that long (at risk).
export function bandAtAge(runs, run, B) {
  if (run.so == null || run.pFlag == null) return null;
  const bi = bandIdx(run.pFlag);
  const atRisk = runs.filter((x) => x.book === run.book && usable(x) && bandIdx(x.pFlag) === bi && (x.status === 'resolved' ? x.toRes : x.so) >= run.so).length;
  return { s: survAt(B.km, run.so), atRisk };
}
