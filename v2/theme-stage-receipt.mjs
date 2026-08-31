export const THEME_STAGES = Object.freeze([
  'CRACKING', 'PARABOLIC', 'ACCELERATING', 'MATURE', 'CAPITULATION',
  'REVERTING', 'BUILDING', 'EMERGING', 'DORMANT',
]);

const THEME_STAGE_SET = new Set(THEME_STAGES);

export function buildThemeStageReceipt(theme, nowMs = Date.now()) {
  const currentStage = theme?.stage || null;
  const rawPrevious = theme?.prev_stage;
  const previousStage = typeof rawPrevious === 'string' && THEME_STAGE_SET.has(rawPrevious)
    ? rawPrevious
    : null;
  const previousReason = previousStage
    ? null
    : rawPrevious == null || (typeof rawPrevious === 'string' && rawPrevious.trim() === '')
      ? 'missing'
      : 'outside_canonical_vocabulary';

  const rawSince = theme?.stage_since;
  const clockMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  let sinceReason = null;
  let sinceMs = null;

  if (rawSince == null) sinceReason = 'missing';
  else if (typeof rawSince !== 'string') sinceReason = 'not_a_timestamp_string';
  else if (rawSince.trim() === '') sinceReason = 'blank';
  else {
    const parsed = Date.parse(rawSince);
    if (!Number.isFinite(parsed)) sinceReason = 'invalid_timestamp';
    else if (parsed > clockMs) sinceReason = 'future_timestamp';
    else sinceMs = parsed;
  }

  return {
    currentStage,
    previousStage,
    previousState: previousStage ? 'measured' : 'unknown',
    previousReason,
    sinceAt: sinceMs == null ? null : rawSince,
    sinceMs,
    sinceState: sinceMs == null ? 'unknown' : 'measured',
    sinceReason,
    elapsedMs: sinceMs == null ? null : clockMs - sinceMs,
  };
}
