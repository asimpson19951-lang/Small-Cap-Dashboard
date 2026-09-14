const CORE_LANES = new Set(['market', 'scans']);

/**
 * Keep a current market/scanner feed visibly healthy when an auxiliary lane is
 * degraded, while preserving STALE for a missed core feed or collection cycle.
 */
export function dashboardHealthKind(sessionMode, failures = []) {
  if (!['live-current', 'session-final'].includes(sessionMode)) return 'stale';
  if (failures.some(key => CORE_LANES.has(key))) return 'stale';
  return failures.length ? 'degraded' : 'fresh';
}
