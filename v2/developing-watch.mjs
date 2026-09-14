const finite = (value) => {
  const number = Number(value);
  return value == null || value === '' || !Number.isFinite(number) ? null : number;
};

const tickerOf = (value) => String(value ?? '').trim().toUpperCase();

const STATUSES = new Set(['active', 'watching_quiet', 'input_unknown']);

export function developingWatchInputUnknown(payload, reason = 'current server input is unavailable; prior watch preserved') {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    status: Array.isArray(payload.entries) && payload.entries.length ? 'input_unknown_prior_preserved' : 'input_unknown',
    presentation_at: new Date().toISOString(),
    entries: Array.isArray(payload.entries) ? payload.entries.map((row) => ({
      ...row,
      status: 'input_unknown',
      expires_at: null,
      unknown_reason: reason,
    })) : [],
  };
}

export function developingWatchRows(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const byTicker = new Map();
  for (const value of entries) {
    const ticker = tickerOf(value?.ticker);
    if (!ticker || !STATUSES.has(value?.status) || value?.monitor_stage !== 'developing_watch') continue;
    const candidate = {
      ...value,
      ticker,
      price: finite(value.price),
      change_pct: finite(value.change_pct),
      volume: finite(value.volume),
      dollar_volume: finite(value.dollar_volume),
      avg_dollar_volume: finite(value.avg_dollar_volume),
      run_days: finite(value.run_days),
      run_move_sum_pct: finite(value.run_move_sum_pct),
    };
    const previous = byTicker.get(ticker);
    if (!previous || Date.parse(candidate.last_qualified_at || '') > Date.parse(previous.last_qualified_at || '')) {
      byTicker.set(ticker, candidate);
    }
  }
  return [...byTicker.values()].sort((a, b) => {
    const live = Number(b.status === 'active') - Number(a.status === 'active');
    return live || Date.parse(b.last_qualified_at || '') - Date.parse(a.last_qualified_at || '') || a.ticker.localeCompare(b.ticker);
  });
}

export function developingWatchStatus(row) {
  if (row?.status === 'active') return 'ACTIVE TRIGGER';
  if (row?.status === 'watching_quiet') return 'QUIET · WATCH HELD';
  return 'INPUT UNKNOWN · WATCH HELD';
}

export function developingWatchTrigger(row) {
  const reasons = Array.isArray(row?.trigger_reasons) ? row.trigger_reasons : [];
  const labels = [];
  if (reasons.includes('upside_mover')) labels.push('UPSIDE MOVER');
  if (reasons.includes('downside_mover')) labels.push('DOWNSIDE MOVER');
  if (reasons.includes('grouped_build_evidence')) labels.push('GROUPED BUILD EVIDENCE');
  return labels.join(' · ') || 'TRIGGER RETAINED';
}

export function developingWatchReceipt(payload) {
  const rows = developingWatchRows(payload);
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    carried: rows.filter((row) => row.status !== 'active').length,
    sourceSession: payload?.source?.market_session_date ?? null,
    observedAt: payload?.observed_at ?? null,
    stateUpdatedAt: payload?.state_updated_at ?? null,
    status: payload?.status ?? 'unavailable',
  };
}
