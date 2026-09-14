function suppliedTicker(value) {
  if (typeof value === 'string') return value.trim().toUpperCase();
  return String(value?.ticker || value?.tk || value?.symbol || '').trim().toUpperCase();
}

function suppliedRoster(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => {
    const ticker = suppliedTicker(value);
    if (!ticker) return null;
    return typeof value === 'object' && value !== null ? { ...value, ticker } : ticker;
  }).filter(Boolean);
}

/**
 * Adapter for the current V2 caller shape. Current registry/theme rows provide
 * identities, but no authoritative expected-total, source-receipt denominator,
 * or dated baseline comparison. Those fields therefore stay unavailable.
 */
export function buildThemeDisplayInputs({ theme, registry = null, members = [], vehicles = [] } = {}) {
  return {
    members,
    vehicles,
    rosters: {
      registry: suppliedRoster(registry?.constituents),
      theme: suppliedRoster(theme?.constituents),
      declaredSc: suppliedRoster(theme?.sc_vehicles),
    },
    membership: { status: 'unavailable', expectedTotal: null },
    sourceCoverage: { status: 'unavailable', loaded: null, expected: null },
    comparison: null,
  };
}
