import { marketSessionClock, previousTradingSession } from './market-calendar.mjs';

const CORE_LANES = new Set(['market', 'scans']);
const NONBLOCKING_AUXILIARY_LANES = new Set(['metricSnapshot', 'marketHeatmap']);

/**
 * Keep a current market/scanner feed visibly healthy when an auxiliary lane is
 * degraded, while preserving STALE for a missed core feed or collection cycle.
 */
export function dashboardHealthKind(sessionMode, failures = []) {
  if (!['live-current', 'session-final'].includes(sessionMode)) return 'stale';
  if (failures.some(key => CORE_LANES.has(key))) return 'stale';
  return failures.length ? 'degraded' : 'fresh';
}

/**
 * Auxiliary daily metrics and broad-market context can be incomplete while the
 * section's live market/scanner content remains usable. Keep their warning
 * visible without covering that content. Any other failed dependency retains
 * the full stale treatment.
 */
export function sectionWarningKind(failures = []) {
  if (!failures.length) return 'none';
  return failures.every(key => NONBLOCKING_AUXILIARY_LANES.has(key)) ? 'degraded' : 'stale';
}

/**
 * A broad snapshot from the last completed session is the correct premarket
 * baseline. Current-session names remain partial/unknown until regular trading;
 * do not describe that deliberate fail-closed mix as a stopped pipeline.
 */
export function marketHeatmapStaleMessage(snapshot, nowMs = Date.now()) {
  const clock = marketSessionClock(nowMs);
  const coverage = snapshot?.coverage ?? {};
  const returned = Number(coverage.returned);
  const measured = Number(coverage.measured_1d);
  const sameSession = Number(coverage.session_measured_1d);
  const expectedPrior = clock ? previousTradingSession(clock.sessionDate) : null;
  const adequateCompletedSession = returned >= 1_000 && measured / returned >= 0.5 &&
    sameSession / measured >= 0.8 && snapshot?.market_session_date === expectedPrior;
  if (clock && !clock.closedDay && !clock.completed && clock.minute < 9 * 60 + 30 && adequateCompletedSession) {
    return 'LAST VERIFIED DATA · BROAD MARKET · PREMARKET PARTIAL · LAST COMPLETE SESSION';
  }
  return null;
}
