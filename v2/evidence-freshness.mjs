const DAY_MS = 86400000;

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function etDateKey(value) {
  const milliseconds = Date.parse(value || '');
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
