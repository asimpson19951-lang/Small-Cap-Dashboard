// NOW book ordering by extension.
//
// Austin's approved principle (V2_FEEDBACK.md, confirmed Aug 30 2026): Radar is a
// mean-reversion system, so extension decides which names deserve attention first.
// Extension is the combined setup — Bollinger position, distance from the daily
// 8EMA, and the parabolic read (volume, gap behaviour) — additive, never a checklist.
// A missing component is neutral and never invalidates extension visible in the
// other measured primitives. D-count and theme heat explain a move; they do not
// outrank it, so they are deliberately absent from this key.
//
// The key reads only what the row already shows: CHANGE, 8EMA, the BB badge, and
// the relative volume behind the discovery cards. Direction is ignored on purpose:
// mean reversion is long AND short.
//
//   stretch  = max(|change_pct|, |ema8_dist|)                (percent of price)
//   band     = 1 + 0.15 × min(completed closes outside, 5)   (wick touch = 1.05)
//   volume   = 1 + 0.25 × max(0, min(relative volume, 5) − 1) (unknown = 1)
//   priority = stretch × band × volume
//
// Band and volume are multipliers, not addends: confirmation can lift an extended
// name, but volume alone can never rank a name that is not extended. The constants
// are Austin's to tune on sight (replay: scratchpad replay/REPORT.md, Sep 1 2026).

export const EXTENSION_RANK = Object.freeze({
  bandStepPerDay: 0.15,
  bandDayCap: 5,
  touchLift: 0.05,
  volumeStepPerX: 0.25,
  volumeCap: 5,
});

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The larger of today's displacement and the stretch from the daily 8EMA.
 * Null only when neither primitive is known. */
export function extensionStretch(row) {
  const change = finite(row?.change_pct);
  const ema8 = finite(row?.ema8_dist);
  if (change == null && ema8 == null) return null;
  return Math.max(Math.abs(change ?? 0), Math.abs(ema8 ?? 0));
}

/** Completed closes outside the band lift the name; a wick touch lifts it slightly.
 * Unknown band evidence is neutral (1). */
export function extensionBandFactor(row) {
  const side = String(row?.bb_completed_side || '').toUpperCase();
  const consecutive = finite(row?.bb_completed_consec);
  if ((side === 'UPPER' || side === 'LOWER') && consecutive != null && consecutive >= 1) {
    return 1 + EXTENSION_RANK.bandStepPerDay * Math.min(Math.trunc(consecutive), EXTENSION_RANK.bandDayCap);
  }
  const touch = String(row?.bb_touch || '').toUpperCase();
  if (touch === 'UBB' || touch === 'LBB') return 1 + EXTENSION_RANK.touchLift;
  return 1;
}

/** Relative volume above 1× lifts the name, capped at 5×. Below-average or unknown
 * volume is neutral (1): decreasing volume never demotes visible extension. */
export function extensionVolumeFactor(row) {
  const ratio = finite(row?.volume_ratio);
  if (ratio == null) return 1;
  return 1 + EXTENSION_RANK.volumeStepPerX * Math.max(0, Math.min(ratio, EXTENSION_RANK.volumeCap) - 1);
}

export function extensionPriority(row) {
  const stretch = extensionStretch(row);
  if (stretch == null) return null;
  return stretch * extensionBandFactor(row) * extensionVolumeFactor(row);
}

/** Sort comparator: highest extension first, unrankable rows last, ticker breaks ties. */
export function compareByExtension(a, b) {
  const left = extensionPriority(a);
  const right = extensionPriority(b);
  const x = left == null ? -Infinity : left;
  const y = right == null ? -Infinity : right;
  if (y !== x) return y - x;
  return String(a?.ticker || '').localeCompare(String(b?.ticker || ''));
}
