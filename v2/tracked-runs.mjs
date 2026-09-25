// V2.11.79 · Phase 2b multi-day tracking (SPEC_live_board.md decision 4a). Pure helpers, no I/O.
// Source table: public.tracked_runs (anon read-only). Status, peak, run start and last close are
// written once a session by the tracked-runs-eod Edge Function; the page adds only live distance.
import { tradingSessionGap } from './market-calendar.mjs';

export const TRACK_TRIGGERS = Object.freeze(['TI', 'MOVER', 'DAS', 'ME']);

function finite(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const runKey = (ticker, book) => `${String(ticker || '').toUpperCase()}|${book}`;

// Open (not resolved) runs keyed by ticker|book. Resolved names drop off the board.
export function openRunsByKey(runs) {
  const map = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.status === 'resolved' || (run.book !== 'SC' && run.book !== 'ML')) continue;
    map.set(runKey(run.ticker, run.book), run);
  }
  return map;
}

export function openRunFor(openRuns, ticker, book) {
  return openRuns?.get(runKey(ticker, book)) || null;
}

export function openTickersForBook(openRuns, book) {
  const out = new Set();
  for (const run of openRuns?.values?.() || []) if (run.book === book) out.add(String(run.ticker).toUpperCase());
  return out;
}

// Signed % from the run's peak to the current price (live when known, else the last completed close).
// Up runs read negative below the peak; down runs (ML only) read positive above the low.
export function offPeakPct(run, price) {
  const peak = finite(run?.peak_price);
  const now = finite(price) ?? finite(run?.last_close);
  if (peak == null || now == null || peak <= 0) return null;
  return ((now - peak) / peak) * 100;
}

// Trading sessions since the first flag (0 on the flag session itself). Null when unknown.
export function sessionsSinceFlag(run, sessionDate) {
  if (!run?.first_flag_date || !sessionDate) return null;
  return tradingSessionGap(run.first_flag_date, sessionDate);
}

// Which (ticker, book, trigger) intents still need a track-name call. `sent` holds keys already sent
// today (day|ticker|book|trigger). A trigger already stored on the open run is never re-sent.
export function pendingTrackCalls({ items = [], openRuns = new Map(), sent = new Set(), day }) {
  const out = [];
  if (!day) return out;
  for (const { ticker, book, trigger } of items) {
    if (!TRACK_TRIGGERS.includes(trigger) || (book !== 'SC' && book !== 'ML')) continue;
    if (!/^[A-Z.]{1,6}$/.test(String(ticker || ''))) continue;
    const run = openRunFor(openRuns, ticker, book);
    if (run && Array.isArray(run.triggers) && run.triggers.includes(trigger)) continue;
    const key = `${day}|${ticker}|${book}|${trigger}`;
    if (sent.has(key)) continue;
    out.push({ ticker, book, trigger, key });
  }
  return out;
}

// ── HISTORY tab ──────────────────────────────────────────────────────────────
export function historyRows(runs) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run && run.status === 'resolved')
    .map((run) => ({
      ticker: String(run.ticker || '').toUpperCase(),
      book: run.book,
      firstFlagDate: run.first_flag_date || null,
      peak: finite(run.peak_price),
      peakDate: run.peak_date || null,
      daysToPeak: finite(run.sessions_to_peak),
      daysToResolve: finite(run.sessions_to_resolve),
      resolvedAt: run.resolved_at || null,
      resolveReason: run.resolve_reason || null,
      maxOffPeakPct: finite(run.max_off_peak_pct),
      runStart: finite(run.run_start_price),
      direction: run.direction || null,
      traded: Array.isArray(run.triggers) ? run.triggers.includes('DAS') : null,
      triggers: Array.isArray(run.triggers) ? run.triggers : [],
    }));
}

// Inclusive ISO-date window on the FIRST FLAG date. Empty bounds are open.
export function filterHistory(rows, { from = '', to = '', book = 'ALL' } = {}) {
  return rows.filter((row) =>
    (book === 'ALL' || row.book === book) &&
    (!from || (row.firstFlagDate && row.firstFlagDate >= from)) &&
    (!to || (row.firstFlagDate && row.firstFlagDate <= to)));
}

const HISTORY_SORT_VALUE = {
  ticker: (r) => r.ticker,
  book: (r) => r.book,
  first: (r) => r.firstFlagDate,
  peak: (r) => r.peak,
  toPeak: (r) => r.daysToPeak,
  toResolve: (r) => r.daysToResolve,
  offPeak: (r) => r.maxOffPeakPct,
  traded: (r) => (r.traded == null ? null : r.traded ? 1 : 0),
  resolved: (r) => r.resolvedAt,
};
export const HISTORY_SORT_KEYS = Object.freeze(Object.keys(HISTORY_SORT_VALUE));

// Unknown values always sort last, in either direction.
export function sortHistory(rows, key = 'resolved', dir = 'desc') {
  const pick = HISTORY_SORT_VALUE[key] || HISTORY_SORT_VALUE.resolved;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = pick(a), vb = pick(b);
    if (va == null && vb == null) return a.ticker.localeCompare(b.ticker);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * sign;
    if (va > vb) return 1 * sign;
    return a.ticker.localeCompare(b.ticker);
  });
}
