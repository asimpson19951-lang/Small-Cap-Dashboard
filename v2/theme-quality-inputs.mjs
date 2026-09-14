import { tradingSessionDates } from './market-calendar.mjs';

const DEFAULT_MAX_TICKERS = 16;

function tickerOf(value) {
  return String(value?.ticker ?? value ?? '').trim().toUpperCase();
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function orderedBars(bars, throughSession = null) {
  if (!Array.isArray(bars)) return null;
  const normalized = bars
    .map(bar => ({
      close: finite(bar?.c ?? bar?.close),
      volume: finite(bar?.v ?? bar?.volume),
      at: finite(bar?.t ?? bar?.timestamp),
    }));
  if (normalized.some(bar => bar.close == null || bar.close <= 0 || bar.at == null || sessionDate(bar.at) == null)) return null;
  const eligible = normalized
    .filter(bar => !throughSession || sessionDate(bar.at) <= throughSession)
    .sort((a, b) => a.at - b.at);
  const dates = eligible.map(bar => sessionDate(bar.at));
  if (new Set(dates).size !== dates.length) return null;
  return eligible;
}

function sessionDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function dailyBarEvidence(ticker, bars, marketSessionDate = null) {
  const ordered = orderedBars(bars, marketSessionDate);
  if (!ordered) return null;
  if (ordered.length < 21) return null;
  const latest = ordered.at(-1);
  if (marketSessionDate && sessionDate(latest.at) !== marketSessionDate) return null;
  const sessionDates = ordered.slice(-30).map(bar => sessionDate(bar.at));
  const expectedDates = tradingSessionDates(sessionDates.at(-1), sessionDates.length);
  const sequenceComplete = Array.isArray(expectedDates) && expectedDates.every((date, index) => date === sessionDates[index]);
  if (marketSessionDate && !sequenceComplete) return null;
  const priorVolumes = ordered.slice(-21, -1).map(bar => bar.volume).filter(value => value != null && value >= 0);
  const volumeMean = priorVolumes.length === 20
    ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length
    : null;
  return {
    ticker: tickerOf(ticker),
    category: null,
    closes_30d: ordered.slice(-30).map(bar => bar.close),
    quality_closes_30d: ordered.slice(-30).map(bar => bar.close),
    quality_session_dates: sessionDates,
    quality_session_sequence: sequenceComplete ? 'complete' : 'partial',
    quality_history_session: sessionDate(latest.at),
    change_pct: ((latest.close / ordered.at(-2).close) - 1) * 100,
    change_session_date: sessionDate(latest.at),
    volume_ratio: latest.volume != null && volumeMean > 0 ? latest.volume / volumeMean : null,
    updated_at: new Date(latest.at).toISOString(),
    quality_as_of: new Date(latest.at).toISOString(),
    quality_source: 'chart-bars:D',
    quality_return_basis: sequenceComplete ? 'adjusted_price_dated_sessions' : 'adjusted_price_ordered_observations',
  };
}

function legacyCompletedHistory(row) {
  if (Array.isArray(row?.quality_session_dates) && row.quality_session_dates.length && row?.quality_history_session) return row;
  const completed = /^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_completed_through || ''))
    ? row.d_count_completed_through
    : null;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_as_of || '')) ? row.d_count_as_of : null;
  if (!completed || !Array.isArray(row?.closes_30d)) return row;
  const closes = row.closes_30d.map(value => {
    const close = finite(value);
    return close != null && close > 0 ? close : null;
  });
  const trimLive = asOf && asOf > completed ? 1 : 0;
  const history = trimLive ? closes.slice(0, -1) : closes;
  return {
    ...row,
    quality_closes_30d: history,
    quality_history_session: completed,
    quality_session_sequence: 'unavailable',
    quality_return_basis: 'adjusted_price_ordered_observations',
    quality_live_observation_trimmed: trimLive === 1,
  };
}

function evidenceSession(row) {
  const dates = Array.isArray(row?.quality_session_dates) ? row.quality_session_dates : [];
  const completed = /^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_completed_through || ''))
    ? row.d_count_completed_through
    : null;
  return row?.quality_history_session || dates.at(-1) || sessionDate(row?.quality_as_of) || completed;
}

function currentMeasurementSession(row) {
  const explicit = row?.change_session_date ?? row?.session_date ?? row?.market_session_date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(explicit || ''))) return String(explicit);
  if (row?.d_count_as_of === row?.d_count_completed_through &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_as_of || ''))) return row.d_count_as_of;
  return sessionDate(row?.updated_at);
}

export function requiredThemeQualityTickers({
  registryRows = [], marketRows = [], benchmarkTicker = 'SPY', marketSessionDate = null,
} = {}) {
  const available = new Set((Array.isArray(marketRows) ? marketRows : [])
    .map(legacyCompletedHistory)
    .filter(row => {
      const closes = Array.isArray(row?.quality_closes_30d) ? row.quality_closes_30d : row?.closes_30d;
      return Array.isArray(closes) && closes.length >= 21 &&
        (!marketSessionDate || (evidenceSession(row) === marketSessionDate && currentMeasurementSession(row) === marketSessionDate));
    })
    .map(tickerOf));
  const required = new Set([tickerOf(benchmarkTicker)]);
  for (const row of Array.isArray(registryRows) ? registryRows : []) {
    if (row?.is_active === false) continue;
    for (const ticker of Array.isArray(row?.constituents) ? row.constituents : []) required.add(tickerOf(ticker));
  }
  return [...required].filter(ticker => ticker && !available.has(ticker)).sort();
}

/** Applies closed-session history without letting an earlier daily bar replace
 * a fresher live price, move, volume ratio, or provider timestamp. */
export function applyThemeQualityEvidence(marketRows = [], evidenceRows = []) {
  const byTicker = new Map((Array.isArray(marketRows) ? marketRows : []).map(row => {
    const prepared = legacyCompletedHistory(row);
    return [tickerOf(prepared), prepared];
  }));
  for (const evidence of Array.isArray(evidenceRows) ? evidenceRows : []) {
    const ticker = tickerOf(evidence);
    if (!ticker) continue;
    const base = byTicker.get(ticker) || { ticker };
    const baseAt = Date.parse(base.updated_at || '');
    const evidenceAt = Date.parse(evidence.quality_as_of || evidence.updated_at || '');
    const evidenceIsNewer = Number.isFinite(evidenceAt) && (!Number.isFinite(baseAt) || evidenceAt >= baseAt);
    const baseSession = currentMeasurementSession(base);
    const historySession = evidenceSession(evidence);
    const baseMeasurementIsCurrent = baseSession && historySession && baseSession >= historySession;
    byTicker.set(ticker, {
      ...base,
      ticker,
      closes_30d: evidence.closes_30d,
      quality_closes_30d: evidence.quality_closes_30d,
      quality_session_dates: evidence.quality_session_dates,
      quality_session_sequence: evidence.quality_session_sequence,
      quality_history_session: evidence.quality_history_session,
      quality_as_of: evidence.quality_as_of,
      quality_source: evidence.quality_source,
      quality_return_basis: evidence.quality_return_basis,
      change_pct: baseMeasurementIsCurrent ? (base.change_pct ?? evidence.change_pct) : evidence.change_pct,
      change_session_date: baseMeasurementIsCurrent ? (base.change_session_date ?? base.session_date ?? evidence.change_session_date) : evidence.change_session_date,
      volume_ratio: baseMeasurementIsCurrent ? (base.volume_ratio ?? evidence.volume_ratio) : evidence.volume_ratio,
      updated_at: evidenceIsNewer ? evidence.updated_at : base.updated_at,
    });
  }
  return [...byTicker.values()];
}

/** One bounded daily enrichment of missing active-theme members and SPY. The
 * caller owns the cache lifetime and supplies the existing chart-bars reader;
 * this module creates no polling loop and performs no writes. */
export async function enrichThemeQualityRows({
  registryRows = [], marketRows = [], fetchDailyBars, maxTickers = DEFAULT_MAX_TICKERS, marketSessionDate = null,
} = {}) {
  if (typeof fetchDailyBars !== 'function') throw new Error('fetchDailyBars is required');
  const missing = requiredThemeQualityTickers({ registryRows, marketRows, marketSessionDate });
  const selected = missing.slice(0, Math.max(0, maxTickers));
  const settled = await Promise.allSettled(selected.map(async ticker => ({
    ticker,
    evidence: dailyBarEvidence(ticker, await fetchDailyBars(ticker, 'D'), marketSessionDate),
  })));
  const enriched = [];
  const failed = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    if (result.status === 'fulfilled' && result.value.evidence) enriched.push(result.value.evidence);
    else failed.push(selected[index]);
  }
  const rows = applyThemeQualityEvidence(marketRows, enriched);
  return Object.freeze({
    rows: Object.freeze(rows),
    evidenceRows: Object.freeze(enriched),
    receipt: Object.freeze({
      requested: selected.length,
      enriched: enriched.length,
      failed: Object.freeze(failed),
      skipped: Object.freeze(missing.slice(selected.length)),
      capped: missing.length > selected.length,
      source: 'existing chart-bars D endpoint; adjusted provider bars; read only',
    }),
  });
}

export const THEME_QUALITY_MAX_DAILY_ENRICHMENT = DEFAULT_MAX_TICKERS;
