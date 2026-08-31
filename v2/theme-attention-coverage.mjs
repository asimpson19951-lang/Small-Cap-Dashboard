export const ATTENTION_RECOVERY_MAX_ROUNDS = 3;

function tickerOf(value) {
  const ticker = typeof value === 'string' ? value : value?.ticker ?? value?.tk ?? value?.symbol;
  return typeof ticker === 'string' && /^[A-Z0-9.\-]{1,10}$/i.test(ticker.trim())
    ? ticker.trim().toUpperCase()
    : null;
}

export function activeRegistryTickers(registry) {
  const tickers = new Set();
  for (const row of registry || []) {
    if (!row || row.is_active === false) continue;
    for (const member of Array.isArray(row.constituents) ? row.constituents : []) {
      const ticker = tickerOf(member);
      if (ticker) tickers.add(ticker);
    }
    const provisional = row.provisional_members && typeof row.provisional_members === 'object' && !Array.isArray(row.provisional_members)
      ? Object.keys(row.provisional_members)
      : [];
    for (const member of provisional) {
      const ticker = tickerOf(member);
      if (ticker) tickers.add(ticker);
    }
  }
  return [...tickers].sort();
}

export function attentionCoverage(rows, registryTickers) {
  const expected = new Set((registryTickers || []).map(tickerOf).filter(Boolean));
  const observed = new Set();
  const rateKnown = new Set();
  for (const row of rows || []) {
    const ticker = tickerOf(row?.ticker);
    if (!ticker || !expected.has(ticker)) continue;
    observed.add(ticker);
    if (row?.msg_count != null && Number(row?.window_minutes) > 0) rateKnown.add(ticker);
  }
  return {
    total: expected.size,
    observed: observed.size,
    rateKnown: rateKnown.size,
    missing: [...expected].filter(ticker => !observed.has(ticker)),
  };
}

export async function reconcileAttentionCoverage(payload, registry, fetchMissing, maxRounds = ATTENTION_RECOVERY_MAX_ROUNDS) {
  const registryTickers = activeRegistryTickers(registry);
  const rows = Array.isArray(payload?.rows) ? [...payload.rows] : [];
  let coverage = attentionCoverage(rows, registryTickers);
  let unresolved = coverage.missing;
  let confirmedAbsent = [];
  let recoveryQueries = 0;

  if (unresolved.length && payload?.total != null && payload?.capped === false) {
    confirmedAbsent = unresolved;
    unresolved = [];
  }

  while (unresolved.length && recoveryQueries < maxRounds) {
    const recovery = await fetchMissing(unresolved);
    recoveryQueries += 1;
    if (Array.isArray(recovery?.rows)) rows.push(...recovery.rows);
    coverage = attentionCoverage(rows, registryTickers);
    unresolved = coverage.missing;
    if (!unresolved.length) break;
    if (recovery?.total != null && recovery?.capped === false) {
      confirmedAbsent = unresolved;
      unresolved = [];
      break;
    }
  }

  return {
    ...payload,
    rows,
    registryTotal: coverage.total,
    registryObserved: coverage.observed,
    registryRateKnown: coverage.rateKnown,
    registryConfirmedAbsent: confirmedAbsent,
    registryUnresolved: unresolved,
    coverageComplete: coverage.total > 0 && unresolved.length === 0,
    recoveryQueries,
    requestCount: 1 + recoveryQueries,
  };
}

export function selectAttentionLane(live, archive) {
  const liveReadable = live && Array.isArray(live.rows);
  const archiveReadable = archive && Array.isArray(archive.rows);
  if (liveReadable && live.rows.length) return { mode: 'live', reason: 'live_rows', payload: live };
  if (archiveReadable) return { mode: 'archive', reason: liveReadable ? 'no_live_rows' : 'live_unavailable', payload: archive };
  if (liveReadable) return { mode: 'live', reason: 'live_empty_archive_unavailable', payload: live };
  return { mode: 'unavailable', reason: 'both_unavailable', payload: null };
}
