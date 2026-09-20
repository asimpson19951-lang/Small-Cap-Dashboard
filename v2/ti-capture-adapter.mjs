function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function iso(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

const STRATEGY = 'RTH Volume New Highs';
const HISTORY_SOURCE_STATES = new Set(['accepted_hash_verified', 'stale_excluded', 'unavailable_excluded', 'hash_mismatch_excluded', 'invalid_excluded', 'unsafe_path_excluded']);

export function validTiCapture(payload) {
  if (!(payload && payload.schema_version === 1 &&
    payload?.source_identity?.strategy_name === STRATEGY &&
    iso(payload.generated_at) && Number.isInteger(payload.quality?.accepted_event_count) && payload.quality.accepted_event_count >= 1 &&
    Number.isInteger(payload.quality?.unique_ticker_count) && payload.quality.unique_ticker_count >= 1 &&
    Array.isArray(payload.tickers) && payload.tickers.length > 0 &&
    payload.tickers.every(row => typeof row?.symbol === 'string' && row.symbol.trim() &&
      Number.isInteger(row?.event_count) && row.event_count >= 1 &&
      iso(row.first_seen_at) && iso(row.last_seen_at) && row.latest && typeof row.latest === 'object' &&
      ['fresh', 'stale'].includes(row.latest.current_freshness)))) return false;
  return payload.quality.unique_ticker_count === payload.tickers.length &&
    payload.quality.accepted_event_count === payload.tickers.reduce((sum, row) => sum + row.event_count, 0);
}

export function validTiHistory(payload) {
  if (!(payload && payload.schema_version === 1 && payload.formula_version === 'ti_move_history_dashboard_v1' &&
    payload?.source_identity?.strategy_name === STRATEGY && iso(payload.generated_at) &&
    payload.measurement_basis === 'retained_capture_events_only' && payload.coverage &&
    HISTORY_SOURCE_STATES.has(payload.coverage.historical_source_status) &&
    ['fresh', 'stale', 'clock_skew'].includes(payload.coverage.operational_ledger_status) && iso(payload.coverage.operational_ledger_observed_at) &&
    Array.isArray(payload.coverage.captured_session_dates) &&
    Number.isInteger(payload.coverage.distinct_captured_sessions) && payload.coverage.distinct_captured_sessions >= 1 &&
    payload.coverage.distinct_captured_sessions === payload.coverage.captured_session_dates.length &&
    payload.coverage.missing_dates === 'unknown_not_zero' &&
    payload.coverage.missing_intervals === 'unknown_between_captured_alerts_and_outside_explicit_captured_dates' &&
    Array.isArray(payload.tickers) && payload.tickers.every(row =>
      typeof row?.symbol === 'string' && row.symbol.trim() && iso(row.first_captured_alert_at) && iso(row.last_captured_alert_at) &&
      Number.isInteger(row.distinct_captured_sessions) && row.distinct_captured_sessions >= 1 &&
      Number.isInteger(row.repeat_days) && row.repeat_days === row.distinct_captured_sessions - 1 &&
      Array.isArray(row.captured_session_dates) && row.captured_session_dates.length === row.distinct_captured_sessions &&
      row.measurement_label === 'observed at captured TI alerts'))) return false;
  return true;
}

export function tiHistoryCoverageLabel(payload) {
  if (!validTiHistory(payload)) return 'RETAINED HISTORY UNAVAILABLE · sessions, repeat days, sampled maxima, and pullback unknown';
  const sourceLabels = {
    accepted_hash_verified: 'ACCEPTED BASELINE VERIFIED',
    stale_excluded: 'STALE BASELINE EXCLUDED',
    unavailable_excluded: 'BASELINE MISSING EXCLUDED',
    hash_mismatch_excluded: 'BASELINE HASH MISMATCH EXCLUDED',
    invalid_excluded: 'INVALID BASELINE EXCLUDED',
    unsafe_path_excluded: 'UNSAFE BASELINE PATH EXCLUDED',
  };
  const ledger = payload.coverage.operational_ledger_status === 'fresh'
    ? 'operational ledger fresh'
    : payload.coverage.operational_ledger_status === 'clock_skew'
      ? `OPERATIONAL LEDGER CLOCK SKEW · observed ${payload.coverage.operational_ledger_observed_at}`
      : `OPERATIONAL LEDGER STALE · observed ${payload.coverage.operational_ledger_observed_at}`;
  return `${sourceLabels[payload.coverage.historical_source_status]} · ${ledger} · ${payload.coverage.distinct_captured_sessions} explicit captured dates · missing dates/intervals unknown · sampled maxima are observed at captured alerts, not true market peaks`;
}

const WATCHER_STATES = new Set(['healthy', 'degraded', 'failed', 'stopped']);
const POLL_OUTCOMES = new Set(['updated', 'no_change', 'waiting_for_first_alert', 'source_missing', 'capture_failed']);

export function validTiRuntimeStatus(status) {
  const base = Boolean(status && status.schema_version === 1 && status.runtime_version === 1 &&
    status.strategy_name === STRATEGY && WATCHER_STATES.has(status.watcher_state) &&
    POLL_OUTCOMES.has(status.poll_outcome) && iso(status.observed_at) &&
    typeof status.source_present === 'boolean' && typeof status.cached_snapshot_may_exist === 'boolean' &&
    iso(status.last_snapshot_published_at) && Number.isInteger(status.total_ledger_occurrences) && status.total_ledger_occurrences >= 0 &&
    Number.isInteger(status.unique_dashboard_tickers) && status.unique_dashboard_tickers >= 0 &&
    status.production_enabled === false && status.network_delivery_enabled === false &&
    status.logger_health === 'unknown_no_heartbeat');
  if (!base) return false;
  if (status.watcher_state === 'stopped') {
    return status.process_state === 'stopped' && status.last_poll_outcome === status.poll_outcome &&
      ['bounded_run_complete', 'signal'].includes(status.stopped_reason);
  }
  if (status.watcher_state === 'failed') {
    return status.poll_outcome === 'capture_failed' && /^[a-f0-9]{64}$/.test(status.failure_key || '') &&
      ['failed_start', 'identity_or_session_resolution', 'capture_poll', 'runtime_loop'].includes(status.failure_phase);
  }
  if (status.capture_gate === 'hold_incomplete_header') {
    return status.watcher_state === 'degraded' && status.poll_outcome === 'waiting_for_first_alert';
  }
  return true;
}

export function tiRuntimeStatusMatchesSnapshot(status, snapshot) {
  if (!validTiRuntimeStatus(status) || !validTiCapture(snapshot)) return false;
  return status.strategy_name === snapshot.source_identity.strategy_name &&
    status.total_ledger_occurrences === snapshot.quality?.accepted_event_count &&
    status.unique_dashboard_tickers === snapshot.quality?.unique_ticker_count &&
    iso(status.last_snapshot_published_at) === iso(snapshot.generated_at);
}

export function tiRuntimePresentation(status, snapshot, { now = Date.now(), staleAfterMs = 45_000 } = {}) {
  if (!validTiRuntimeStatus(status)) return { kind: 'unavailable', label: 'Runtime status unavailable · snapshot preserved' };
  const checked = iso(status.observed_at);
  if (!tiRuntimeStatusMatchesSnapshot(status, snapshot)) {
    return { kind: 'cached', label: `CACHED SNAPSHOT · watcher status does not match this snapshot · checked ${checked}` };
  }
  if (status.watcher_state === 'stopped') return { kind: 'cached', label: `CACHED SNAPSHOT · watcher stopped · last poll ${status.poll_outcome.replaceAll('_', ' ')} · checked ${checked}` };
  if (status.watcher_state === 'failed') return { kind: 'cached', label: `CACHED SNAPSHOT · watcher failed · last poll ${status.poll_outcome.replaceAll('_', ' ')} · checked ${checked}` };
  if (status.capture_gate === 'hold_incomplete_header') return { kind: 'waiting', label: `CACHED SNAPSHOT · incomplete source header held · last poll ${status.poll_outcome.replaceAll('_', ' ')} · checked ${checked}` };
  if (now - Date.parse(checked) > staleAfterMs) return { kind: 'cached', label: `CACHED SNAPSHOT · last watcher check is stale · checked ${checked}` };
  if (status.poll_outcome === 'source_missing') return { kind: 'cached', label: `CACHED SNAPSHOT · current-session source missing · checked ${checked}` };
  if (status.poll_outcome === 'capture_failed') return { kind: 'cached', label: `CACHED SNAPSHOT · last capture failed · checked ${checked}` };
  if (status.poll_outcome === 'waiting_for_first_alert') return { kind: 'waiting', label: `Watcher checked ${checked} · waiting for first alert · logger heartbeat unknown` };
  if (status.poll_outcome === 'updated') {
    const added = Number.isInteger(status.accepted_occurrences_this_poll) ? status.accepted_occurrences_this_poll : 0;
    return { kind: 'healthy', label: `Watcher checked ${checked} · updated +${added} exported occurrences · logger heartbeat unknown` };
  }
  return { kind: 'healthy', label: `Watcher checked ${checked} · no new exported occurrences · logger heartbeat unknown` };
}

export function tiRows(payload, historyPayload = null) {
  if (!validTiCapture(payload)) return [];
  const history = validTiHistory(historyPayload)
    ? new Map(historyPayload.tickers.map(row => [row.symbol.trim().toUpperCase(), row])) : new Map();
  return payload.tickers.map(row => {
    const ticker = row.symbol.trim().toUpperCase();
    const measured = history.get(ticker) || null;
    return ({
    ticker,
    alertPrice: finite(row.latest.price),
    alertMovePct: finite(row.latest.change_from_close_percent),
    alertVolume: finite(row.latest.volume_today),
    alertRelativeVolume: finite(row.latest.relative_volume),
    occurrenceCount: row.event_count,
    firstSourceAt: iso(row.first_seen_at),
    lastSourceAt: iso(row.last_seen_at),
    alertSourceAt: iso(row.latest.source_at),
    captureObservedAt: iso(row.latest.observed_at),
    snapshotGeneratedAt: iso(payload.generated_at),
    freshnessAtSnapshot: row.latest.current_freshness === 'fresh' ? 'fresh' : 'stale',
    freshnessAtObservation: ['fresh', 'stale'].includes(row.latest.freshness_at_observation)
      ? row.latest.freshness_at_observation : 'unknown',
    missingFields: Array.isArray(row.latest.missing_fields) ? [...row.latest.missing_fields] : [],
    instrumentIdentityStatus: typeof row.latest?.instrument_identity?.status === 'string' ? row.latest.instrument_identity.status : 'unverified',
    unusualSymbol: row.latest?.instrument_identity?.status === 'unverified_unusual_symbol',
    sourceName: payload.source_identity.strategy_name,
    historyCoverageAvailable: Boolean(measured),
    firstCapturedAlertAt: measured ? iso(measured.first_captured_alert_at) : null,
    distinctCapturedSessions: measured?.distinct_captured_sessions ?? null,
    repeatDays: measured?.repeat_days ?? null,
    capturedSessionDates: measured ? [...measured.captured_session_dates] : [],
    currentCapturedSourceDate: measured?.current_captured_source_date ?? null,
    maximumObservedAlertMovePct: finite(measured?.maximum_observed_alert_move_percent),
    latestObservedAlertMovePct: finite(measured?.latest_observed_alert_move_percent),
    pullbackFromMaximumObservedAlertMovePctPoints: finite(measured?.pullback_from_maximum_observed_alert_move_percentage_points),
    observedMoveSampleCount: measured?.current_session_observed_move_sample_count ?? null,
    missingMoveSampleCount: measured?.current_session_missing_move_sample_count ?? null,
    historyMeasurementLabel: measured?.measurement_label ?? 'history unavailable',
    historyCoverageNote: measured?.coverage_note ?? 'Retained move-history aggregate unavailable; repeat days and sampled extrema are unknown.',
  });
  });
}

export function tiDetailRow(row) {
  if (!row) return null;
  return { ticker: row.ticker, category: null, price: row.alertPrice, change_pct: row.alertMovePct,
    volume: row.alertVolume, volume_ratio: row.alertRelativeVolume, updated_at: row.alertSourceAt, tiCapture: row };
}
