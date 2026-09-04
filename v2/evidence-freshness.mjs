const DAY_MS = 86400000;
const MARKET_LIVE_START_MINUTE = 7 * 60;
const MARKET_LIVE_END_MINUTE = 17 * 60;
const LIVE_STALE_AFTER_MS = 15 * 60000;

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function etDateKey(value) {
  const milliseconds = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(milliseconds));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function etClock(value) {
  const milliseconds = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(milliseconds));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    weekday: byType.weekday,
    minute: Number(byType.hour) * 60 + Number(byType.minute),
  };
}

function previousWeekdayKey(value) {
  const day = validDateKey(value);
  if (!day) return null;
  let cursor = Date.parse(`${day}T00:00:00Z`) - DAY_MS;
  while ([0, 6].includes(new Date(cursor).getUTCDay())) cursor -= DAY_MS;
  return new Date(cursor).toISOString().slice(0, 10);
}

function latestMarketTimestamp(marketRows) {
  const times = (Array.isArray(marketRows) ? marketRows : [])
    .map(row => Date.parse(row?.updated_at || ''))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * The scheduled market collector runs from 07:00 through 16:59 ET. During
 * that window, age is a live-health signal. Outside it, the last valid row of
 * the latest expected weekday is a completed-session receipt rather than a
 * permanently aging outage. Holiday ambiguity stays conservative.
 */
export function marketCollectionPresentation(marketRows, nowMs = Date.now()) {
  const now = finite(nowMs);
  const clock = etClock(now);
  const latestAt = latestMarketTimestamp(marketRows);
  const latestDate = etDateKey(latestAt);
  if (!clock || !Number.isFinite(latestAt) || !latestDate) {
    return Object.freeze({ mode: 'unknown', latestAt: null, latestDate: null, sessionDate: null, ageMs: null });
  }

  const businessDay = !['Sat', 'Sun'].includes(clock.weekday);
  const liveExpected = businessDay && clock.minute >= MARKET_LIVE_START_MINUTE && clock.minute < MARKET_LIVE_END_MINUTE;
  const ageMs = now - latestAt;
  if (ageMs < -60000) {
    return Object.freeze({ mode: 'clock-conflict', latestAt, latestDate, sessionDate: null, ageMs });
  }
  if (liveExpected) {
    const current = latestDate === clock.date && ageMs <= LIVE_STALE_AFTER_MS;
    return Object.freeze({
      mode: current ? 'live-current' : 'live-missed',
      latestAt,
      latestDate,
      sessionDate: clock.date,
      ageMs,
    });
  }

  const sessionDate = businessDay && clock.minute >= MARKET_LIVE_END_MINUTE
    ? clock.date
    : previousWeekdayKey(clock.date);
  return Object.freeze({
    mode: latestDate === sessionDate ? 'session-final' : 'outdated-session',
    latestAt,
    latestDate,
    sessionDate,
    ageMs,
  });
}

/**
 * Same-session market rows can carry the completed daily primitives even when
 * the separate audit snapshot is unavailable. Missing D-count remains a
 * ticker-level unknown and is counted; a measured D-count from an older
 * session prevents the fallback from looking current.
 */
export function dailyMetricSessionPresentation(marketRows, nowMs = Date.now()) {
  const rows = (Array.isArray(marketRows) ? marketRows : []).filter(row => row?.watch !== false);
  const market = marketCollectionPresentation(rows, nowMs);
  const total = rows.length;
  const coreMeasured = rows.filter(row =>
    finite(row?.bb_position) != null && finite(row?.bb_consec) != null && finite(row?.ema8_dist) != null).length;
  const measuredD = rows.filter(row =>
    finite(row?.d_count) != null && row?.d_count_lower_bound !== true &&
    validDateKey(row?.d_count_completed_through) === market.sessionDate).length;
  const outdatedD = rows.filter(row =>
    finite(row?.d_count) != null && row?.d_count_lower_bound !== true &&
    validDateKey(row?.d_count_completed_through) !== market.sessionDate).length;
  const missingD = Math.max(total - measuredD - outdatedD, 0);
  const usable = market.mode === 'session-final' && total > 0 && coreMeasured === total && measuredD > 0 && outdatedD === 0;
  return Object.freeze({
    usable,
    reason: usable ? 'SESSION_FINAL' : market.mode.toUpperCase().replaceAll('-', '_'),
    market,
    total,
    coreMeasured,
    measuredD,
    missingD,
    outdatedD,
  });
}

/** Retained model context is latest-session context only outside the live
 * window and only when its evidence belongs to the completed market session. */
export function themeContextPresentation(row, marketRows, nowMs = Date.now()) {
  const state = String(row?.context_state || row?.status || 'unknown').toLowerCase();
  const status = String(row?.status || 'unknown').toLowerCase();
  const market = marketCollectionPresentation(marketRows, nowMs);
  const evidenceDate = etDateKey(row?.evidence_cutoff || row?.generated_at);
  const retained = state === 'stale' && market.mode === 'session-final' && evidenceDate === market.sessionDate &&
    ['complete', 'degraded'].includes(status);
  if (!retained) return Object.freeze({ state, label: state.toUpperCase(), retained: false });
  return Object.freeze({
    state: status === 'degraded' ? 'degraded' : 'fresh',
    label: status === 'degraded' ? 'LATEST SESSION · DEGRADED' : 'LATEST SESSION',
    retained: true,
  });
}

/** Counts weekdays after `from` through `through`. It is deliberately not a
 * holiday calendar. A holiday ambiguity therefore fails stale, not fresh. */
export function marketWeekdayGap(from, through) {
  const startKey = validDateKey(from);
  const endKey = validDateKey(through);
  if (!startKey || !endKey) return null;
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (end < start) return null;
  let weekdays = 0;
  for (let cursor = start + DAY_MS; cursor <= end; cursor += DAY_MS) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
  }
  return weekdays;
}

export function metricGenerationFreshness(snapshot, marketRows) {
  const asOf = validDateKey(snapshot?.as_of);
  const coverageStatus = String(snapshot?.coverage?.status || '');
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const marketTimestamps = (Array.isArray(marketRows) ? marketRows : [])
    .map(row => Date.parse(row?.updated_at || ''))
    .filter(Number.isFinite);
  const latestMarketAt = marketTimestamps.length ? new Date(Math.max(...marketTimestamps)).toISOString() : null;
  const marketDate = etDateKey(latestMarketAt);
  const weekdayGap = marketWeekdayGap(asOf, marketDate);
  const matchingRows = asOf ? rows.filter(row => row?.session_date === asOf) : [];

  let reason = 'CURRENT';
  if (snapshot?.ok !== true) reason = 'SNAPSHOT_UNAVAILABLE';
  else if (!asOf) reason = 'AS_OF_UNKNOWN';
  else if (!marketDate) reason = 'MARKET_CLOCK_UNKNOWN';
  else if (weekdayGap == null) reason = 'CLOCK_CONFLICT';
  else if (weekdayGap > 1) reason = 'STALE_SESSION';
  else if (!['FRESH', 'DEGRADED'].includes(coverageStatus)) reason = 'COVERAGE_UNUSABLE';
  else if (!matchingRows.length) reason = 'SESSION_ROWS_MISSING';

  return Object.freeze({
    usable: reason === 'CURRENT',
    reason,
    asOf,
    marketDate,
    latestMarketAt,
    weekdayGap,
    rows: Object.freeze(reason === 'CURRENT' ? matchingRows : []),
  });
}
