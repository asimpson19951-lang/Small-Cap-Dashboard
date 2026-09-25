// V2.11.78 · Phase 2a in-play book (SPEC_live_board.md, Austin's Sep 25 2026 decisions).
// V2.11.79 · Phase 2b adds the DAS tag (names traded today, from the local read-only DAS bridge) and
// TRACKED (an open multi-day run from an earlier session). The same MOVER rule is duplicated in
// supabase/functions/tracked-runs-eod/rules.mjs for the end-of-day job; a test keeps them equal.
// THE THRESHOLDS LIVE HERE. They are Austin's defaults; tune these numbers, nothing else.
// SC and ML stay separate systems: each book is judged only by its own rule.
export const IN_PLAY_RULES = Object.freeze({
  SC: Object.freeze({
    // MOVER: daily change at least +20% AND today's dollar volume at least $2M. UP moves only.
    moverMinChangePct: 20,
    moverMinDollarVolume: 2_000_000,
  }),
  ML: Object.freeze({
    // MOVER (either direction): one-day move at least 1.5 daily ATR, OR |ATR / 5D| at least 4.
    moverMinOneDayAtr: 1.5,
    moverMinAbsAtr5d: 4,
  }),
});

export const IN_PLAY_TAGS = Object.freeze(['TI', 'MOVER', 'DAS', 'ME']);

function finite(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Dollar volume today = last price × today's share volume (market_data.volume_today).
// Unknown when either input is missing; an unknown never qualifies.
export function scDollarVolume(row) {
  const price = finite(row?.price);
  const shares = finite(row?.volume_today);
  if (price == null || shares == null || price <= 0 || shares < 0) return null;
  return price * shares;
}

// One-day move in daily ATR units: (price − prior close) / daily ATR, where the prior
// close is implied by the row's own change % (price / (1 + change / 100)). Signed.
export function oneDayAtrMove(row) {
  const price = finite(row?.price);
  const change = finite(row?.change_pct);
  const atr = finite(row?.atr);
  if (price == null || change == null || atr == null || price <= 0 || atr <= 0 || change <= -100) return null;
  const priorClose = price / (1 + change / 100);
  return (price - priorClose) / atr;
}

export function moverEvidence(row, rules = IN_PLAY_RULES) {
  if (row?.category === 'SC') {
    const rule = rules.SC;
    const change = finite(row?.change_pct);
    const dollarVolume = scDollarVolume(row);
    const qualifies = change != null && dollarVolume != null &&
      change >= rule.moverMinChangePct && dollarVolume >= rule.moverMinDollarVolume;
    return { qualifies, change, dollarVolume };
  }
  if (row?.category === 'ML') {
    const rule = rules.ML;
    const oneDayAtr = oneDayAtrMove(row);
    const atr5d = finite(row?.atr_5d);
    const byOneDay = oneDayAtr != null && Math.abs(oneDayAtr) >= rule.moverMinOneDayAtr;
    const byAtr5d = atr5d != null && Math.abs(atr5d) >= rule.moverMinAbsAtr5d;
    return { qualifies: byOneDay || byAtr5d, oneDayAtr, atr5d, byOneDay, byAtr5d };
  }
  return { qualifies: false };
}

// A ticker the user typed. Letters first; letters, digits, dot or dash after; max 10.
export function normalizeTicker(input) {
  const ticker = String(input ?? '').trim().toUpperCase().replace(/^\$/, '');
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) ? ticker : null;
}

// Split one book into its in-play rows (with reasons) and everything else.
// trackedTickers: tickers with an OPEN tracked run in this book (any flag date). They stay in the
// in-play section until the run resolves (decision 4a), even on a day nothing else flags them.
export function splitInPlay(rows, { tiTickers = new Set(), meTickers = new Set(), dasTickers = new Set(), trackedTickers = new Set(), rules = IN_PLAY_RULES } = {}) {
  const inPlay = [];
  const rest = [];
  for (const row of rows || []) {
    const ticker = String(row?.ticker || '').toUpperCase();
    const mover = moverEvidence(row, rules);
    const reasons = [];
    if (tiTickers.has(ticker)) reasons.push('TI');
    if (mover.qualifies) reasons.push('MOVER');
    if (dasTickers.has(ticker)) reasons.push('DAS');
    if (meTickers.has(ticker)) reasons.push('ME');
    if (trackedTickers.has(ticker)) reasons.push('TRACKED');
    if (reasons.length) inPlay.push({ row, reasons, mover });
    else rest.push(row);
  }
  return { inPlay, rest };
}
