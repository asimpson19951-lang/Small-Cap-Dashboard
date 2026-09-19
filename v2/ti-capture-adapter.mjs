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

export function tiRows(payload) {
  if (!validTiCapture(payload)) return [];
  return payload.tickers.map(row => ({
    ticker: row.symbol.trim().toUpperCase(),
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
  }));
}

export function tiDetailRow(row) {
  if (!row) return null;
  return { ticker: row.ticker, category: null, price: row.alertPrice, change_pct: row.alertMovePct,
    volume: row.alertVolume, volume_ratio: row.alertRelativeVolume, updated_at: row.alertSourceAt, tiCapture: row };
}
