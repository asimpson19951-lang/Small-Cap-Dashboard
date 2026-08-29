const SUPABASE_URL = 'https://wexnybuijhklmvwncdin.supabase.co';
// Public browser credential. The project RLS contract limits it to read-only surfaces.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG55YnVpamhrbG12d25jZGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjQ5NzEsImV4cCI6MjA5MTQ0MDk3MX0.EYsozs5hxPeskYknXYkXr4mxnSLcjr513vEVr5V9pLI';
const ROW_FOLD = 8;
const SCANNER_TYPES = {
  gap_sc: { category: 'SC', label: 'SC MOVERS', detail: 'SMALL-CAP MOVER' },
  fade_sc: { category: 'SC', label: 'SC DOWNSIDE', detail: 'SMALL-CAP DOWNSIDE' },
  gap_ml: { category: 'ML', label: 'MID / LARGE MOVERS', detail: 'MID / LARGE MOVER' },
  build_ml: { category: 'ML', label: 'MID / LARGE BUILDS', detail: 'MID / LARGE BUILD' },
  gap_unk: { category: null, label: 'CLASS UNVERIFIED', detail: 'UNCLASSIFIED MOVER' },
};
const SCANNER_STALE_AFTER_MS = 20 * 60_000;

const state = {
  market: [],
  themes: [],
  filings: [],
  news: [],
  scans: [],
  metricSnapshot: null,
  breadthSnapshot: null,
  predictionSnapshot: null,
  scannerAvailable: null,
  scExpanded: false,
  mlExpanded: false,
  discoveryExpanded: false,
  selected: null,
  selectedTheme: null,
  themeChartTicker: null,
  themeChartTf: 'D',
  themeMetricRequest: 0,
  dilutionRequest: 0,
  chartTf: null,
  chartRequest: 0,
  loadedOnce: false,
};

const els = {
  freshness: document.getElementById('freshness'),
  freshnessText: document.getElementById('freshnessText'),
  refreshButton: document.getElementById('refreshButton'),
  scRows: document.getElementById('scRows'),
  mlRows: document.getElementById('mlRows'),
  scCount: document.getElementById('scCount'),
  mlCount: document.getElementById('mlCount'),
  scToggle: document.getElementById('scToggle'),
  mlToggle: document.getElementById('mlToggle'),
  discoveryRows: document.getElementById('discoveryRows'),
  discoveryCount: document.getElementById('discoveryCount'),
  discoveryToggle: document.getElementById('discoveryToggle'),
  themeGlance: document.getElementById('themeGlance'),
  themeBoard: document.getElementById('themeBoard'),
  breadthAsOf: document.getElementById('breadthAsOf'),
  breadthSurface: document.getElementById('breadthSurface'),
  themeOverview: document.getElementById('themeOverview'),
  themeOverviewClose: document.getElementById('themeOverviewClose'),
  themeOverviewTitle: document.getElementById('themeOverviewTitle'),
  themeOverviewMeta: document.getElementById('themeOverviewMeta'),
  themeOverviewBody: document.getElementById('themeOverviewBody'),
  detailBackdrop: document.getElementById('detailBackdrop'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailClose: document.getElementById('detailClose'),
  detailClass: document.getElementById('detailClass'),
  detailTicker: document.getElementById('detailTicker'),
  detailSubhead: document.getElementById('detailSubhead'),
  detailFacts: document.getElementById('detailFacts'),
  detailContext: document.getElementById('detailContext'),
  detailSupply: document.getElementById('detailSupply'),
  detailSupplySection: document.getElementById('detailSupplySection'),
  detailNews: document.getElementById('detailNews'),
  chartHost: document.getElementById('chartHost'),
  chartNote: document.getElementById('chartNote'),
  toast: document.getElementById('toast'),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(value, digits = 1) {
  const n = finite(value);
  return n == null ? '—' : n.toFixed(digits);
}

function fmtSigned(value, suffix = '%', digits = 1) {
  const n = finite(value);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`;
}

function fmtPrice(value) {
  const n = finite(value);
  if (n == null) return '—';
  const digits = n < 1 ? 4 : n < 10 ? 2 : 2;
  return `$${n.toFixed(digits)}`;
}

function fmtCompact(value) {
  const n = finite(value);
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function fmtDate(value, withTime = false) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return '—';
  const options = withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }
    : { month: 'short', day: 'numeric', timeZone: 'America/New_York' };
  return new Intl.DateTimeFormat('en-US', options).format(new Date(ms));
}

function relativeTime(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return 'time unknown';
  const delta = Math.max(0, Date.now() - ms);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function easternClockParts(value = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function scannerSessionState(newestMs, nowMs = Date.now()) {
  const clock = easternClockParts(nowMs);
  const minute = Number(clock.hour) * 60 + Number(clock.minute);
  const businessDay = !['Sat', 'Sun'].includes(clock.weekday);
  const scheduled = businessDay && minute >= 8 * 60 && minute < 18 * 60;
  if (!Number.isFinite(newestMs)) return { mode: scheduled ? 'stale' : 'carried' };
  if (scheduled && nowMs - newestMs > SCANNER_STALE_AFTER_MS) return { mode: 'stale' };
  return { mode: scheduled ? 'current' : 'carried' };
}

function moveClass(value) {
  const n = finite(value);
  if (n == null || n === 0) return 'neutral';
  return n > 0 ? 'positive' : 'negative';
}

function tableUrl(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

async function restGet(table, params = {}) {
  const response = await fetch(tableUrl(table, params), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`${table} unavailable (${response.status})`);
  return response.json();
}

async function functionGet(name) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`${name} unavailable (${response.status})`);
  return response.json();
}

async function staticGet(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} unavailable (${response.status})`);
  return response.json();
}

async function loadAll({ quiet = false } = {}) {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = '…';
  if (!quiet) setFreshness('loading', 'Refreshing read-only data…');

  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const requests = {
    market: restGet('market_data', { select: '*' }),
    themes: restGet('themes', { select: '*' }),
    filings: restGet('filings', { select: '*', order: 'detected_at.desc', limit: '240' }),
    news: restGet('news_cache', { select: '*', published_at: `gte.${since}`, order: 'published_at.desc', limit: '240' }),
    scans: restGet('scanner_hits', { select: '*', order: 'rank.asc,ticker.asc' }),
    metricSnapshot: functionGet('market-metric-snapshot'),
    breadthSnapshot: staticGet('./data/breadth-tape.json'),
    predictionSnapshot: staticGet('./data/prediction-markets.json'),
  };

  const keys = Object.keys(requests);
  const settled = await Promise.allSettled(Object.values(requests));
  const failures = [];

  settled.forEach((result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled') {
      if (key === 'breadthSnapshot') state.breadthSnapshot = result.value && typeof result.value === 'object' ? result.value : null;
      else if (key === 'predictionSnapshot') state.predictionSnapshot = result.value && typeof result.value === 'object' ? result.value : null;
      else if (key === 'metricSnapshot') state.metricSnapshot = result.value?.ok === true ? result.value : null;
      else {
        state[key] = Array.isArray(result.value) ? result.value : [];
        if (key === 'scans') state.scannerAvailable = true;
      }
    } else {
      failures.push(key);
      if (key === 'metricSnapshot') state.metricSnapshot = null;
      if (key === 'predictionSnapshot') state.predictionSnapshot = null;
      if (key === 'scans') {
        state.scans = [];
        state.scannerAvailable = false;
      }
    }
  });

  if (!state.market.length) {
    renderFatalBookError('Market rows are unavailable. The prototype will not infer or reuse stale values.');
    setFreshness('failed', 'Market data unavailable');
  } else {
    applyMetricSnapshot();
    renderAll();
    updateFreshness(failures);
  }

  state.loadedOnce = true;
  els.refreshButton.disabled = false;
  els.refreshButton.textContent = '↻';

  if (failures.length) showToast(`Loaded with ${failures.join(', ')} unavailable.`);
}

function applyMetricSnapshot() {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(state.metricSnapshot?.as_of || ''))
    ? state.metricSnapshot.as_of
    : null;
  const coverageStatus = String(state.metricSnapshot?.coverage?.status || '');
  const usableGeneration = asOf != null && ['FRESH', 'DEGRADED'].includes(coverageStatus);
  const rows = usableGeneration && Array.isArray(state.metricSnapshot?.rows)
    ? state.metricSnapshot.rows.filter(row => row?.session_date === asOf)
    : [];
  const byTicker = new Map(rows.map(row => [String(row?.ticker || '').toUpperCase(), row]));
  state.market = state.market.map(row => {
    const shadow = byTicker.get(String(row?.ticker || '').toUpperCase()) || null;
    const dCount = finite(shadow?.metrics?.d_count);
    return {
      ...row,
      d_count: dCount != null && Number.isInteger(dCount) && dCount >= 0 ? dCount : null,
      d_count_as_of: dCount != null ? shadow?.session_date || null : null,
      metric_shadow: shadow,
    };
  });
}

function watchedRows(category) {
  return state.market
    .filter(row => row && row.watch !== false && row.category === category)
    .sort((a, b) => {
      const av = finite(a.change_pct);
      const bv = finite(b.change_pct);
      const am = av == null ? -Infinity : Math.abs(av);
      const bm = bv == null ? -Infinity : Math.abs(bv);
      if (bm !== am) return bm - am;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''));
    });
}

function currentScannerRows() {
  const rows = state.scans.filter(scan => scan && scan.ticker && Object.hasOwn(SCANNER_TYPES, scan.scan_type));
  if (!rows.length) return [];
  const stamp = scan => Date.parse(scan.last_seen_at || scan.first_seen_at || '');
  const times = rows.map(stamp).filter(Number.isFinite);
  if (!times.length) return [];
  const newest = Math.max(...times);
  const typeOrder = Object.keys(SCANNER_TYPES);
  return rows
    .filter(scan => Number.isFinite(stamp(scan)) && newest - stamp(scan) < 10 * 60000)
    .sort((a, b) => {
      const section = typeOrder.indexOf(a.scan_type) - typeOrder.indexOf(b.scan_type);
      if (section !== 0) return section;
      const rank = (finite(a.rank) ?? 999) - (finite(b.rank) ?? 999);
      if (rank !== 0) return rank;
      return Math.abs(finite(b.change_pct) ?? 0) - Math.abs(finite(a.change_pct) ?? 0);
    });
}

function watchedTickerSet() {
  return new Set(state.market.filter(row => row?.watch !== false).map(row => String(row.ticker || '').toUpperCase()));
}

function scannerDetailRow(scan) {
  const type = SCANNER_TYPES[scan.scan_type];
  return {
    ticker: String(scan.ticker || '').toUpperCase(),
    category: type?.category ?? null,
    price: scan.price,
    change_pct: scan.change_pct,
    volume_ratio: scan.volume_ratio,
    float_size: scan.float_size,
    float_rot: scan.float_rot,
    float_source: scan.float_source,
    market_cap: scan.market_cap,
    updated_at: scan.last_seen_at,
    discovery: scan,
  };
}

function detailRowFor(ticker) {
  const target = String(ticker || '').toUpperCase();
  const scan = currentScannerRows().find(item => String(item.ticker || '').toUpperCase() === target);
  const market = state.market.find(item => String(item.ticker || '').toUpperCase() === target);
  if (!market) return scan ? scannerDetailRow(scan) : null;
  if (!scan) return market;
  const discovered = scannerDetailRow(scan);
  return { ...discovered, ...market, category: market.category ?? discovered.category, discovery: scan };
}

function filingsFor(ticker) {
  return state.filings
    .filter(filing => String(filing?.ticker || '').toUpperCase() === ticker)
    .sort((a, b) => Date.parse(b.detected_at || b.filed_at || 0) - Date.parse(a.detected_at || a.filed_at || 0));
}

const DILUTION_PROFILE_CACHE = new Map();
const DILUTION_PROFILE_TTL_MS = 5 * 60_000;

function fmtSecDate(value) {
  if (!value) return 'DATE UNKNOWN';
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw);
  if (!Number.isFinite(date.getTime())) return 'DATE UNKNOWN';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function fmtUsdShort(value) {
  const n = finite(value);
  if (n == null) return 'AMOUNT UNKNOWN';
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
}

function fmtShares(value) {
  const n = finite(value);
  if (n == null) return null;
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)} SHARES`;
}

function dilutionFormMeaning(form) {
  const normalized = String(form || '').toUpperCase();
  if (normalized.startsWith('424B')) return { title: 'Offering-specific prospectus document', copy: 'May create, amend, price, suspend, or terminate an offering path. It does not prove a sale, issuer dilution, or remaining capacity.' };
  if (normalized === 'ATM') return { title: 'At-the-market program document', copy: 'Documents an ATM path at a point in time. Current usability, sales, and unused capacity require separate evidence.' };
  if (normalized.startsWith('S-3') || normalized.startsWith('F-3')) return { title: 'Shelf registration', copy: 'Creates an offering framework. Filed is not the same as effective, and the registered amount is not the unused balance.' };
  if (normalized.startsWith('S-1') || normalized.startsWith('F-1')) return { title: 'Offering registration', copy: 'Registers a new or resale offering. Filing alone does not mean the shares can be sold immediately.' };
  if (normalized === 'D' || normalized === 'FORM_D') return { title: 'Private offering notice', copy: 'Reports an exempt private raise. It is not an exchange-traded ATM program.' };
  return { title: 'SEC filing', copy: 'Read the filing and lifecycle state before treating it as sellable supply.' };
}

function dilutionCard(label, value, detail, className = '') {
  return `<div class="dilution-card ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
}

function atmAssessmentDisplay(assessment) {
  const stateName = String(assessment?.state || 'CURRENT_USABILITY_UNKNOWN');
  if (stateName === 'PUBLIC_EVIDENCE_SUPPORTS_USABILITY_AS_OF') {
    const capacity = finite(assessment?.remaining_capacity);
    return {
      value: 'SUPPORTED AS OF',
      detail: `${assessment?.as_of ? fmtSecDate(assessment.as_of) : 'DATE UNKNOWN'} · ${capacity == null ? 'remaining capacity unknown' : `${fmtUsdShort(capacity)} remaining capacity verified`}.`,
      className: 'active',
    };
  }
  if (stateName === 'NO_MATCHED_PROGRAM_IN_COVERED_RECORDS') {
    return {
      value: 'NO MATCHED PROGRAM',
      detail: `Scoped only to complete records through ${assessment?.coverage_through ? fmtSecDate(assessment.coverage_through) : 'an unknown date'}.`,
      className: 'quiet',
    };
  }
  if (stateName === 'CONTESTED') {
    return { value: 'CONTESTED', detail: 'Credible public evidence conflicts. No current-usability claim is shown.', className: 'pending' };
  }
  return {
    value: 'UNKNOWN',
    detail: 'Program documents, current eligibility, stop states, and the remaining-capacity ledger are not all reconciled.',
    className: 'quiet',
  };
}

function renderDilutionPreview(row) {
  const filings = filingsFor(row.ticker).slice(0, 6);
  els.detailSupply.innerHTML = `
    <div class="dilution-preview">
      <strong>SUPPLY / FILING EVIDENCE</strong>
      <span>Ask Edgar separates filing events, registration history, program documents, offering terms, and honest unknowns. Current sellable capacity requires a complete evidence ledger.</span>
    </div>
    ${filings.length ? `<div class="dilution-local-list">${filings.map(filing => {
      const meaning = dilutionFormMeaning(filing.filing_type);
      return `<div class="filing-item">
        <strong>${esc(filing.filing_type || 'FILING')}</strong>${filing.lifecycle_state ? ` · ${esc(filing.lifecycle_state)}` : ''}
        <div>${esc(filing.summary || meaning.title)}</div>
        <div class="item-meta">${fmtSecDate(filing.filed_at || filing.detected_at)} · ${esc(filing.risk_level || 'risk not assigned')}</div>
      </div>`;
    }).join('')}</div>` : '<div class="empty-copy">No local filing evidence returned for this ticker. Ask Edgar can still check the issuer directly.</div>'}`;
}

function renderTappableCapacity(profile) {
  const tap = profile?.stats?.tappable;
  if (!tap) return '<div class="empty-copy">Program evidence could not be measured. Current usability remains unknown.</div>';
  const cards = [];
  const atmAssessment = profile?.evidence?.atm_program || null;
  if (atmAssessment) {
    const display = atmAssessmentDisplay(atmAssessment);
    cards.push(dilutionCard('ATM CURRENT USABILITY', display.value, display.detail, display.className));
  } else {
    cards.push(tap.atm_active === true
      ? dilutionCard('ATM LIFECYCLE ROW', 'ACTIVE_CAPACITY RECORDED', 'Stored lifecycle evidence exists. This profile does not yet prove complete later coverage, current usability, or unused balance.', 'pending')
      : dilutionCard('ATM EVIDENCE', 'NOT VERIFIED', 'Absence in this profile is not proof that no ATM program exists.', 'quiet'));
  }

  const shelfAmount = tap.shelf_capacity_usd == null ? 'AMOUNT UNKNOWN' : `${fmtUsdShort(tap.shelf_capacity_usd)} REGISTERED`;
  if (tap.shelf_state === 'ACTIVE_CAPACITY') {
    cards.push(dilutionCard('SHELF LIFECYCLE ROW', shelfAmount, 'An effectiveness/capacity state is stored. Current usability and the unused balance are not proven by this profile.', 'pending'));
  } else if (tap.shelf_state === 'FILED_PENDING') {
    cards.push(dilutionCard('SHELF STATUS', 'FILED / PENDING', `${shelfAmount}. Effectiveness is not verified.`, 'pending'));
  } else {
    cards.push(dilutionCard('SHELF EVIDENCE', 'NOT VERIFIED', 'No positive or negative current-usability claim is supported by this profile.', 'quiet'));
  }

  const babyScreen = profile?.evidence?.baby_shelf_screen || null;
  if (babyScreen?.state === 'IB6_SCREEN_ESTIMATE') {
    cards.push(dilutionCard('I.B.6 SCREEN', babyScreen.one_third_screen_usd_est == null ? 'ESTIMATE UNAVAILABLE' : `≈ ${fmtUsdShort(babyScreen.one_third_screen_usd_est)} / 12MO`, 'Source-stamped float proxy only. Eligibility, measurement basis, prior usage, instrument scope, and legal headroom remain unknown.', 'pending'));
  }
  return `<div class="dilution-capacity-grid">${cards.join('')}</div>`;
}

function renderDilutionHistory(profile) {
  const stats = profile?.stats || {};
  const counts = stats.counts_24mo || {};
  const historyCoverage = profile?.coverage?.history || null;
  const historyComplete = historyCoverage?.complete === true;
  const countScope = historyComplete ? '24MO' : 'OBSERVED';
  const countDetail = historyComplete
    ? 'Complete requested 24-month SEC submissions index.'
    : historyCoverage
      ? `${historyCoverage.observed_files ?? '—'}/${historyCoverage.expected_files ?? '—'} SEC submission files read; count is partial.`
      : 'Coverage metadata is unavailable from this profile version; count is partial.';
  const last = stats.last_424b5 || null;
  const terms = stats.last_424b5_terms || null;
  const termParts = [fmtShares(terms?.shares), finite(terms?.price) == null ? null : `@ $${fmtNumber(terms.price, terms.price < 1 ? 4 : 2)}`].filter(Boolean);
  return `<div class="dilution-history-grid">
    ${dilutionCard(`424B5 · ${countScope}`, finite(counts['424B5']) == null ? '—' : String(Math.trunc(Number(counts['424B5']))), countDetail)}
    ${dilutionCard(`SHELVES · ${countScope}`, finite(counts['S-3']) == null ? '—' : String(Math.trunc(Number(counts['S-3']))), countDetail)}
    ${dilutionCard('LAST 424B5', last?.days_ago == null ? '—' : `${Math.trunc(last.days_ago)}D AGO`, last?.date ? fmtSecDate(last.date) : 'No dated event returned.')}
    ${dilutionCard('LAST EXTRACTED TERMS', termParts.length ? termParts.join(' · ') : 'TERMS UNKNOWN', 'Document terms only. Primary, resale, conditional, sale, and closing status must be established separately.')}
  </div>`;
}

function plainEdgarBullets(profile) {
  const stats = profile?.stats || {};
  const tap = stats.tappable || null;
  const bullets = [];
  if (!tap) return ['Program evidence could not be measured; current usability remains unknown.'];

  const atmAssessment = profile?.evidence?.atm_program || null;
  if (atmAssessment) {
    const display = atmAssessmentDisplay(atmAssessment);
    bullets.push(`ATM current usability: ${display.value}. ${display.detail}`);
  } else {
    bullets.push(tap.atm_active === true
      ? 'An ATM row is stored as ACTIVE_CAPACITY, but this profile does not yet prove complete later coverage, current usability, or unused balance.'
      : 'No ATM is verified by this profile; incomplete coverage prevents a global negative claim.');
  }

  const registered = tap.shelf_capacity_usd == null ? 'an unknown registered amount' : `${fmtUsdShort(tap.shelf_capacity_usd)} registered`;
  if (tap.shelf_state === 'ACTIVE_CAPACITY') {
    bullets.push(`A shelf lifecycle row carries ACTIVE_CAPACITY with ${registered}; the current usable path and unused balance remain unverified here.`);
  } else if (tap.shelf_state === 'FILED_PENDING') {
    bullets.push(`A shelf was filed with ${registered}, but effectiveness is not verified, so it is not counted as sellable now.`);
  } else {
    bullets.push('No positive or negative current shelf-usability claim is supported by this profile.');
  }

  const babyScreen = profile?.evidence?.baby_shelf_screen || null;
  if (babyScreen?.state === 'IB6_SCREEN_ESTIMATE') {
    bullets.push(babyScreen.one_third_screen_usd_est == null
      ? 'The source-stamped I.B.6 screen is unavailable; exact headroom is unknown.'
      : `The source-stamped float screen is approximately ${fmtUsdShort(babyScreen.one_third_screen_usd_est)} over 12 months; this is not legal headroom, and eligibility, measurement basis, prior usage, and instrument scope remain unknown.`);
  }

  const b5Count = finite(stats.counts_24mo?.['424B5']);
  const last = stats.last_424b5;
  if (b5Count != null) {
    const historyCoverage = profile?.coverage?.history || null;
    const scope = historyCoverage?.complete === true
      ? `the complete requested ${Math.trunc(finite(stats.window_months) ?? 24)}-month SEC submissions index`
      : historyCoverage
        ? `the returned SEC submissions files (${historyCoverage.observed_files ?? '—'}/${historyCoverage.expected_files ?? '—'} read; partial)`
        : 'a legacy profile without coverage metadata (partial count)';
    bullets.push(`${Math.trunc(b5Count)} 424B5 ${Math.trunc(b5Count) === 1 ? 'filing' : 'filings'} in ${scope}${last?.days_ago == null ? '.' : `; the latest was ${Math.trunc(last.days_ago)} days ago.`}`);
  }
  return bullets;
}

function renderDilutionIntel(profile, ticker) {
  const currentRows = filingsFor(ticker);
  const byAccession = new Map(currentRows.map(row => [String(row.accession_number || ''), row]));
  const rows = Array.isArray(profile?.our_filings) ? profile.our_filings.slice(0, 8) : [];
  if (!rows.length) return '';
  return `<section class="dilution-block"><div class="dilution-block-title">PARSED OFFERING INTEL</div><div class="dilution-intel-list">${rows.map(row => {
    const local = byAccession.get(String(row.accession_number || ''));
    const meaning = dilutionFormMeaning(row.filing_type);
    const weighted = typeof local?.dilution_line === 'string' ? local.dilution_line.trim() : '';
    const terms = [fmtShares(row.shares_offered), finite(row.offer_price) == null ? null : `@ $${fmtNumber(row.offer_price, row.offer_price < 1 ? 4 : 2)}`, finite(row.shelf_capacity) == null ? null : `${fmtUsdShort(row.shelf_capacity)} REGISTERED`].filter(Boolean).join(' · ');
    return `<article class="dilution-intel"><header><span>${esc(row.filing_type || 'FILING')}</span><strong>${esc(row.lifecycle_state || 'STATE UNKNOWN')}</strong><time>${fmtSecDate(row.filed_at || row.detected_at)}</time></header><h4>${esc(meaning.title)}</h4>${weighted ? `<p class="dilution-weight-line">${esc(weighted)}</p>` : ''}<p>${esc(row.summary || meaning.copy)}</p>${terms ? `<small>${esc(terms)}</small>` : ''}</article>`;
  }).join('')}</div></section>`;
}

function renderRecentEdgarFilings(profile) {
  const filings = Array.isArray(profile?.filings) ? profile.filings.slice(0, 10) : [];
  return `<section class="dilution-block"><div class="dilution-block-title">RECENT DILUTION FILINGS</div>${filings.length ? `<div class="edgar-filing-list">${filings.map(filing => {
    const meaning = dilutionFormMeaning(filing.form || filing.type);
    const url = /^https:\/\//i.test(filing.url || '') ? filing.url : null;
    return `<article><time>${fmtSecDate(filing.date)}</time><span>${esc(filing.form || filing.type || 'FILING')}</span><div><strong>${esc(meaning.title)}</strong><small>${esc(meaning.copy)}</small></div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open ${esc(filing.form || 'filing')} on SEC">SEC ↗</a>` : ''}</article>`;
  }).join('')}</div>` : '<div class="empty-copy">No dilution-form filings were found in the measured window.</div>'}</section>`;
}

function renderDilutionGlossary() {
  const terms = [
    ['ATM', 'A program that may permit gradual market sales. Documents, present usability, actual sales, and remaining capacity are separate facts.'],
    ['S-3 / F-3 SHELF', 'A registration framework. Filed is not effective; registered amount is not the remaining balance.'],
    ['BABY SHELF', 'S-3/F-3 instruction limits can apply to qualifying issuers. A vendor-float one-third screen is only an estimate; exact headroom needs all eligibility, timing, scope, and prior-sale inputs.'],
    ['424B5', 'A prospectus supplement that can contain an offering, ATM terms, debt, resale paper, or a shelf takedown. Read the actual terms.'],
  ];
  return `<details class="dilution-glossary"><summary>SEC TERMS IN PLAIN ENGLISH</summary><div>${terms.map(([term, copy]) => `<article><strong>${term}</strong><span>${copy}</span></article>`).join('')}</div></details>`;
}

function renderDilutionProfile(ticker, profile, fetchedAt = Date.now()) {
  if (!state.selected || state.selected.ticker !== ticker) return;
  const readBullets = plainEdgarBullets(profile);
  const windowMonths = finite(profile?.stats?.window_months);
  const observedAt = profile?.filing_version_at || profile?.fetched;
  const historyCoverage = profile?.coverage?.history || null;
  const historyLabel = historyCoverage?.complete === true
    ? `HISTORY ${historyCoverage.observed_files}/${historyCoverage.expected_files} FILES COMPLETE`
    : historyCoverage
      ? `HISTORY ${historyCoverage.observed_files ?? '—'}/${historyCoverage.expected_files ?? '—'} FILES PARTIAL`
      : 'HISTORY COVERAGE UNAVAILABLE · LEGACY PROFILE';
  els.detailSupply.innerHTML = `
    <section class="dilution-block"><div class="dilution-block-title">WHAT THE CURRENT EVIDENCE SUPPORTS</div>${renderTappableCapacity(profile)}</section>
    <section class="dilution-block"><div class="dilution-block-title">PLAIN-ENGLISH READ</div><ul class="dilution-read">${readBullets.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>
    <section class="dilution-block"><div class="dilution-block-title">OFFERING HISTORY</div>${renderDilutionHistory(profile)}</section>
    ${renderDilutionIntel(profile, ticker)}
    ${renderRecentEdgarFilings(profile)}
    ${renderDilutionGlossary()}
    <div class="dilution-source">EDGAR · ${windowMonths == null ? 'WINDOW UNKNOWN' : `${Math.trunc(windowMonths)}-MONTH REQUESTED WINDOW`} · ${historyLabel} · FULL LIFECYCLE COVERAGE NOT PROVEN · ${observedAt ? `PROFILE STATE ${fmtSecDate(observedAt)}` : 'STATE TIME UNKNOWN'} · ${profile?.cached ? 'SERVER CACHE' : relativeTime(fetchedAt)}</div>`;
}

async function loadDilutionProfile(ticker, { force = false } = {}) {
  const normalized = String(ticker || '').toUpperCase();
  if (!normalized || !state.selected || state.selected.ticker !== normalized) return;
  const hit = DILUTION_PROFILE_CACHE.get(normalized);
  if (!force && hit && Date.now() - hit.fetchedAt < DILUTION_PROFILE_TTL_MS) {
    renderDilutionProfile(normalized, hit.profile, hit.fetchedAt);
    return;
  }
  const request = ++state.dilutionRequest;
  els.detailSupply.innerHTML = '<div class="dilution-loading"><strong>ASKING EDGAR</strong><span>Checking filing history, stored lifecycle evidence, offering terms, and explicit unknowns…</span></div>';
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/edgar-profile`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: normalized }),
    });
    let profile = null;
    try { profile = await response.json(); } catch { /* non-JSON response remains an error */ }
    if (!response.ok || profile?.error) throw new Error(profile?.error || `EDGAR profile unavailable (${response.status})`);
    if (request !== state.dilutionRequest || !state.selected || state.selected.ticker !== normalized) return;
    const fetchedAt = Date.now();
    DILUTION_PROFILE_CACHE.set(normalized, { profile, fetchedAt });
    renderDilutionProfile(normalized, profile, fetchedAt);
  } catch (error) {
    if (request !== state.dilutionRequest || !state.selected || state.selected.ticker !== normalized) return;
    els.detailSupply.innerHTML = `<div class="dilution-error"><strong>EDGAR PROFILE UNAVAILABLE</strong><span>${esc(error.message || 'The filing profile could not be read.')}</span><button type="button" data-ask-edgar-retry>RETRY</button></div>`;
  }
}

function newsFor(ticker) {
  return state.news
    .filter(item => String(item?.ticker || '').toUpperCase() === ticker && cleanContextText(item?.headline))
    .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
}

const GENERIC_CONTEXT_PATTERNS = [
  /^let(?:'|’)?s\s+(?:take|have)\s+a\s+look\b/i,
  /^let(?:'|’)?s\s+(?:uncover|explore|check|see)\b/i,
  /^stay\s+(?:updated|tuned|informed)\b/i,
  /^(?:click|read|learn)\s+(?:here|more)\b/i,
  /^(?:latest|breaking)\s+(?:news|updates?)\s*[.:!—-]*$/i,
  /^(?:these\s+)?stocks?\s+(?:are\s+)?the\s+most\s+active\b/i,
  /^top\s+stock\s+movements?\b/i,
  /^\d+\s+[a-z/& -]+\s+stocks?\s+moving\b/i,
  /^no\s+(?:verified\s+)?catalyst[.!]?\s*$/i,
];

function cleanContextText(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || !/[a-z0-9]/i.test(text)) return '';
  return GENERIC_CONTEXT_PATTERNS.some(pattern => pattern.test(text)) ? '' : text;
}

function cleanThemeContextText(value) {
  const text = cleanContextText(value);
  if (!text) return '';
  return text
    .replace(/^no\s+(?:verified\s+)?catalyst[.!]?\s*/i, '')
    .trim()
    .replace(/\bD(\d+)\b/gi, (_, days) => `green day ${days}`)
    .replace(/\bd:(\d+)\b/gi, (_, days) => `green run ${days}`);
}

function latestFilingFact(row) {
  const filings = filingsFor(row.ticker);
  const active = filings.find(isCurrentDilutionEvidence);
  if (active) return { label: 'ACTIVE CAP', risk: true };
  return null;
}

function isCurrentDilutionEvidence(filing, nowMs = Date.now()) {
  if (filing?.lifecycle_state === 'ACTIVE_CAPACITY') return true;
  if (filing?.lifecycle_state !== 'TAKEDOWN') return false;
  if (filing?.filing_type !== '424B5' && filing?.filing_type !== 'ATM') return false;
  const observedMs = Date.parse(filing.detected_at || filing.filed_at || '');
  const ageMs = nowMs - observedMs;
  return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= 7 * 86400_000;
}

function bbLabel(row) {
  return bbOutsideLabel(row) || '—';
}

function bbOutsideLabel(row) {
  const pos = finite(row?.bb_position);
  const days = finite(row?.bb_consec);
  if (pos != null && pos > 100) return days != null && days > 0 ? `UBB ${Math.trunc(days)}d` : 'OUT UBB';
  if (pos != null && pos < 0) return days != null && days > 0 ? `LBB ${Math.trunc(days)}d` : 'OUT LBB';
  return '';
}

function breadthLabel(value) {
  if (typeof value === 'string' && /^\d+\s*\/\s*\d+$/.test(value.trim())) return value.replace(/\s+/g, '');
  const breadth = finite(value);
  return breadth == null ? '—' : `${breadth.toFixed(0)}%`;
}

function runLabel(row) {
  const days = finite(row.d_count);
  if (days == null) return 'D—';
  return `D${Math.max(0, Math.trunc(days))}`;
}

function greenRunLabel(row) {
  const run = finite(row.run_days);
  if (run == null) return '';
  return `GREEN ${Math.max(0, Math.trunc(run))}d`;
}

function buildLabel(row) {
  const build = finite(row.build_days);
  if (build == null) return 'BUILD —';
  return `BUILD ${Math.max(0, Math.trunc(build))}d`;
}

function rowContext(row) {
  const theme = cleanContextText(row.theme ? String(row.theme) : '');
  const catalyst = cleanContextText(row.catalyst_cat);
  const reason = cleanContextText(row.reason);
  const why = row.category === 'SC'
    ? catalyst
    : (reason || catalyst);
  return { theme, why, catalyst };
}

function renderRow(row) {
  const context = rowContext(row);
  const filing = latestFilingFact(row);
  const isSC = row.category === 'SC';
  const ema8Context = finite(row.ema8_dist) == null ? '8EMA —' : `8EMA ${fmtSigned(row.ema8_dist)}`;
  const rightMain = isSC ? '' : buildLabel(row);
  const rightSub = isSC
    ? (row.volume_trend ? `VOL ${row.volume_trend}` : '')
    : (row.frd === true ? 'FRD' : (row.shape_state || ''));
  const structureContext = ema8Context;
  const band = bbOutsideLabel(row);
  const contextHtml = [
    context.theme ? `<span class="theme-name">${esc(context.theme)}</span>` : '',
    context.why ? esc(context.why) : '',
  ].filter(Boolean).join(' · ');

  return `
    <button class="radar-row" type="button" data-ticker="${esc(row.ticker)}">
      <span class="name-cell">
        <span class="ticker-line"><span class="ticker">${esc(row.ticker)}</span><span class="price">${fmtPrice(row.price)}</span></span>
        ${contextHtml ? `<span class="context-line">${contextHtml}</span>` : ''}
      </span>
      <span class="move-cell">
        <span class="move-value ${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span>
        <span class="cell-sub">SESSION</span>
      </span>
      <span class="structure-cell">
        ${band ? `<span class="bb-badge">${esc(band)}</span>` : ''}
        <span class="d-count">${esc(runLabel(row))}</span>
        <span class="cell-sub ma-text">${esc(structureContext)}</span>
      </span>
      <span class="supply-cell">
        ${isSC ? (filing ? `<span class="supply-badge ${filing.risk ? 'risk' : 'clear'}">${esc(filing.label)}</span>` : '') : `<span class="state-badge">${esc(rightMain)}</span>`}
        <span class="cell-sub">${esc(isSC ? rightSub : (rightSub || 'STRUCTURE'))}</span>
      </span>
    </button>`;
}

function renderBook(category) {
  const rows = watchedRows(category);
  const isSC = category === 'SC';
  const expanded = isSC ? state.scExpanded : state.mlExpanded;
  const visible = expanded ? rows : rows.slice(0, ROW_FOLD);
  const host = isSC ? els.scRows : els.mlRows;
  const count = isSC ? els.scCount : els.mlCount;
  const toggle = isSC ? els.scToggle : els.mlToggle;

  const shown = expanded ? rows.length : Math.min(ROW_FOLD, rows.length);
  count.textContent = `${shown}/${rows.length}`;
  count.title = `${rows.length} watched · ${expanded ? 'all shown' : `top ${shown} by absolute move`}`;
  count.setAttribute('aria-label', count.title);
  toggle.hidden = rows.length <= ROW_FOLD;
  toggle.textContent = expanded ? 'TOP' : 'ALL';
  host.innerHTML = visible.length
    ? visible.map(renderRow).join('')
    : '<div class="empty-state">No verified watched names in this class.</div>';
}

function scannerMoveLabel(scan) {
  return scan.scan_type === 'build_ml'
    ? `LAST ${fmtSigned(scan.change_pct)}`
    : `SESSION ${fmtSigned(scan.change_pct)}`;
}

function renderDiscoveryRow(scan, inBook) {
  const news = newsFor(String(scan.ticker || '').toUpperCase())[0];
  const evidence = [];
  if (finite(scan.volume_ratio) != null) evidence.push(`${fmtNumber(scan.volume_ratio)}× VOL`);
  if (scan.market_cap && scan.market_cap !== '—') evidence.push(String(scan.market_cap));
  const seen = finite(scan.seen_count);
  const provenance = [
    seen == null ? '' : `SEEN ${Math.max(1, Math.trunc(seen))}×`,
    relativeTime(scan.last_seen_at),
  ].filter(Boolean).join(' · ');
  return `
    <button class="discovery-row" type="button" data-ticker="${esc(scan.ticker)}">
      <span class="discovery-name">
        <span class="ticker-line"><span class="ticker">${esc(scan.ticker)}</span><span class="price">${fmtPrice(scan.price)}</span>${inBook ? '<span class="in-book-chip">IN BOOK</span>' : ''}</span>
        ${news?.headline ? `<span class="context-line">${esc(news.headline)}</span>` : ''}
      </span>
      <span class="discovery-reading">
        <span class="move-value ${moveClass(scan.change_pct)}">${esc(scannerMoveLabel(scan))}</span>
        <span class="cell-sub">${esc(evidence.join(' · ') || 'RAW MOVE ONLY')}</span>
        <span class="discovery-seen">${esc(provenance)}</span>
      </span>
    </button>`;
}

function renderDiscovery() {
  if (state.scannerAvailable === false) {
    els.discoveryCount.textContent = 'scanner unavailable';
    els.discoveryToggle.hidden = true;
    els.discoveryRows.innerHTML = '<div class="error-state">Market-wide discovery is unavailable. The watched books remain independent.</div>';
    return;
  }

  const allRows = currentScannerRows();
  const watched = watchedTickerSet();
  const outsideRows = allRows.filter(scan => !watched.has(String(scan.ticker || '').toUpperCase()));
  const visibleRows = state.discoveryExpanded ? allRows : outsideRows;
  const newest = allRows.map(scan => Date.parse(scan.last_seen_at || '')).filter(Number.isFinite);
  const newestMs = newest.length ? Math.max(...newest) : NaN;
  const session = scannerSessionState(newestMs);
  if (session.mode === 'stale') {
    els.discoveryCount.textContent = 'scanner stale';
    els.discoveryToggle.hidden = true;
    els.discoveryRows.innerHTML = '<div class="error-state">Scanner cycles are missing during the scheduled session. Stale candidates are hidden.</div>';
    return;
  }
  const freshness = Number.isFinite(newestMs) ? relativeTime(newestMs) : 'time unknown';

  els.discoveryCount.textContent = session.mode === 'carried'
    ? `LAST SCANNER SESSION · ${outsideRows.length} outside · ${allRows.length} total · ${fmtDate(newestMs, true)} ET`
    : `${outsideRows.length} outside · ${allRows.length} total · ${freshness}`;
  els.discoveryToggle.hidden = allRows.length === outsideRows.length;
  els.discoveryToggle.textContent = state.discoveryExpanded ? 'OUTSIDE ONLY' : `INCLUDE ALL ${allRows.length}`;

  if (!visibleRows.length) {
    els.discoveryRows.innerHTML = '<div class="empty-state">No current scanner names sit outside the watched books.</div>';
    return;
  }

  els.discoveryRows.innerHTML = Object.entries(SCANNER_TYPES).map(([scanType, type]) => {
    const rows = visibleRows.filter(scan => scan.scan_type === scanType);
    if (!rows.length) return '';
    return `
      <section class="discovery-group" aria-label="${esc(type.label)}">
        <div class="discovery-group-head"><span>${esc(type.label)}</span><span>${rows.length}</span></div>
        <div>${rows.map(scan => renderDiscoveryRow(scan, watched.has(String(scan.ticker || '').toUpperCase()))).join('')}</div>
      </section>`;
  }).join('');
}

function themeMove(theme, field = 'mov_1d') {
  return finite(theme?.[field]);
}

function themeTapeMove(theme, sessions) {
  const tape = Array.isArray(theme?.deep?.tape) ? theme.deep.tape : [];
  const measured = tape
    .map(entry => ({ date: String(entry?.d || ''), move: finite(entry?.chg ?? entry?.m) }))
    .filter(entry => entry.date && entry.move != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (measured.length < sessions) return null;
  return measured.slice(-sessions).reduce((sum, entry) => sum + entry.move, 0);
}

function themePerformanceCell(label, value) {
  return `<span class="theme-performance-cell"><small>${esc(label)}</small><strong class="${moveClass(value)}">${fmtSigned(value)}</strong></span>`;
}

function activeThemes() {
  return state.themes
    .filter(theme => theme && theme.name && theme.stage !== 'DORMANT')
    .sort((a, b) => {
      const av = themeMove(a);
      const bv = themeMove(b);
      const am = av == null ? -Infinity : Math.abs(av);
      const bm = bv == null ? -Infinity : Math.abs(bv);
      if (bm !== am) return bm - am;
      return String(a.name).localeCompare(String(b.name));
    });
}

function constituentTicker(item) {
  if (typeof item === 'string') return item;
  return item?.ticker || item?.tk || item?.symbol || '';
}

function themeNarrative(theme) {
  const candidates = [theme.key_event, theme.narrative, Array.isArray(theme.bullets) ? theme.bullets[0] : theme.bullets];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && cleanThemeContextText(candidate)) return cleanThemeContextText(candidate);
    if (candidate && typeof candidate === 'object') {
      const text = candidate.text || candidate.headline || candidate.summary;
      if (cleanThemeContextText(text)) return cleanThemeContextText(text);
    }
  }
  return '';
}

function leadersFor(theme, limit = 6) {
  const constituents = Array.isArray(theme.constituents) ? theme.constituents : [];
  return constituents
    .map(item => ({ ticker: constituentTicker(item), sc: item && typeof item === 'object' && item.sc === true }))
    .filter(item => item.ticker)
    .slice(0, limit);
}

function themeMembers(theme) {
  const scSet = new Set((Array.isArray(theme.sc_vehicles) ? theme.sc_vehicles : []).map(constituentTicker).map(ticker => ticker.toUpperCase()));
  const tickers = [...new Set([
    ...(Array.isArray(theme.constituents) ? theme.constituents : []).map(constituentTicker),
    ...scSet,
  ].map(ticker => String(ticker || '').toUpperCase()).filter(Boolean))];
  return tickers.map(ticker => {
    const row = state.market.find(item => String(item.ticker || '').toUpperCase() === ticker);
    const category = row?.category || (scSet.has(ticker) ? 'SC' : null);
    return { ticker, row, category, isVehicle: category === 'SC' || scSet.has(ticker) };
  }).sort((a, b) => (finite(b.row?.market_cap) ?? -1) - (finite(a.row?.market_cap) ?? -1));
}

function heatTone(value) {
  const n = finite(value);
  if (n == null) return 'unknown';
  if (n >= 8) return 'up-4';
  if (n >= 4) return 'up-3';
  if (n >= 1.5) return 'up-2';
  if (n > 0) return 'up-1';
  if (n <= -8) return 'down-4';
  if (n <= -4) return 'down-3';
  if (n <= -1.5) return 'down-2';
  if (n < 0) return 'down-1';
  return 'flat';
}

function heatSpan(member, largestCap) {
  const cap = finite(member.row?.market_cap);
  if (cap == null || largestCap == null || largestCap <= 0) return 3;
  const ratio = cap / largestCap;
  if (ratio >= 0.85) return 8;
  if (ratio >= 0.6) return 7;
  if (ratio >= 0.4) return 6;
  if (ratio >= 0.2) return 5;
  if (ratio >= 0.1) return 4;
  return 3;
}

function heatSquareSpan(member, largestCap) {
  const cap = finite(member.row?.market_cap);
  if (cap == null || largestCap == null || largestCap <= 0) return 1;
  const ratio = cap / largestCap;
  if (ratio >= 0.85) return 3;
  if (ratio >= 0.18) return 2;
  return 1;
}

function renderHeatTiles(theme, detailed = false) {
  const members = themeMembers(theme);
  const caps = members.map(member => finite(member.row?.market_cap)).filter(value => value != null);
  const largestCap = caps.length ? Math.max(...caps) : null;
  if (!members.length) return '<div class="empty-copy">Constituents unavailable.</div>';
  return members.map(member => {
    const move = member.row?.change_pct;
    const cap = finite(member.row?.market_cap);
    const size = detailed ? heatSquareSpan(member, largestCap) : heatSpan(member, largestCap);
    const run = member.row ? runLabel(member.row) : 'D—';
    const band = member.row ? bbOutsideLabel(member.row) : '';
    return `<button class="heat-tile ${heatTone(move)} ${member.isVehicle ? 'vehicle' : 'structure'}" style="${detailed ? `--tile-square:${size}` : `--tile-span:${size}`}" type="button" data-ticker="${esc(member.ticker)}" title="${esc(member.ticker)} · ${member.isVehicle ? 'SC vehicle' : 'ML structure'} · ${fmtSigned(move)}">
      <strong>${esc(member.ticker)}</strong><span>${fmtSigned(move)}</span>${detailed ? `<small class="structure-metrics"><span>${esc(run)}</span>${band ? `<span class="bb-metric-text">${esc(band)}</span>` : ''}</small><small>${cap == null ? 'CAP —' : fmtCompact(cap)} · ${member.isVehicle ? 'SC VEHICLE' : member.category === 'ML' ? 'ML STRUCTURE' : 'CLASS —'}</small>` : ''}
    </button>`;
  }).join('');
}

function treemapWeight(member, fallback) {
  return finite(member.row?.market_cap) ?? fallback;
}

function compressTreemapWeights(items, { power = 0.62, maxShare = 0.38 } = {}) {
  const compressed = items.map(item => ({ ...item, weight: Math.pow(Math.max(item.weight, 1), power) }));
  if (compressed.length < 2) return compressed;
  const largest = compressed.reduce((best, item) => item.weight > best.weight ? item : best, compressed[0]);
  const others = compressed.reduce((sum, item) => item === largest ? sum : sum + item.weight, 0);
  const cappedLargest = others > 0 ? Math.min(largest.weight, (maxShare / (1 - maxShare)) * others) : largest.weight;
  return compressed.map(item => item === largest ? { ...item, weight: cappedLargest } : item);
}

function binaryTreemap(items, x = 0, y = 0, width = 100, height = 100) {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], x, y, width, height }];

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;
  let splitIndex = 1;
  let smallestGap = Infinity;
  for (let index = 1; index < items.length; index += 1) {
    running += items[index - 1].weight;
    const gap = Math.abs(total / 2 - running);
    if (gap < smallestGap) {
      smallestGap = gap;
      splitIndex = index;
    }
  }

  const first = items.slice(0, splitIndex);
  const second = items.slice(splitIndex);
  const firstWeight = first.reduce((sum, item) => sum + item.weight, 0);
  const ratio = total > 0 ? firstWeight / total : first.length / items.length;
  if (width >= height) {
    const firstWidth = width * ratio;
    return [
      ...binaryTreemap(first, x, y, firstWidth, height),
      ...binaryTreemap(second, x + firstWidth, y, width - firstWidth, height),
    ];
  }
  const firstHeight = height * ratio;
  return [
    ...binaryTreemap(first, x, y, width, firstHeight),
    ...binaryTreemap(second, x, y + firstHeight, width, height - firstHeight),
  ];
}

function renderTreemapMemberTiles(theme) {
  const members = themeMembers(theme);
  if (!members.length) return '<div class="empty-copy">Constituents unavailable.</div>';
  const knownCaps = members.map(member => finite(member.row?.market_cap)).filter(value => value != null && value > 0);
  const largest = knownCaps.length ? Math.max(...knownCaps) : 1;
  const fallback = Math.max(1, largest * 0.025);
  const rawItems = members
    .map(member => ({ member, weight: treemapWeight(member, fallback) }))
    .sort((a, b) => b.weight - a.weight);
  const items = compressTreemapWeights(rawItems);
  return binaryTreemap(items).map(item => {
    const { member } = item;
    const move = member.row?.change_pct;
    const cap = finite(member.row?.market_cap);
    const band = member.row ? bbOutsideLabel(member.row) : '';
    const area = item.width * item.height;
    const tileClass = item.width < 11 || item.height < 14 || area < 220
      ? 'micro'
      : item.width < 18 || item.height < 22 || area < 500
        ? 'small'
        : area > 1450 && item.width > 28 && item.height > 28
          ? 'hero'
          : '';
    return `<button class="heat-tile treemap-tile ${heatTone(move)} ${member.isVehicle ? 'vehicle' : 'structure'} ${cap == null ? 'cap-unknown' : ''} ${tileClass}" style="left:${item.x.toFixed(3)}%;top:${item.y.toFixed(3)}%;width:${item.width.toFixed(3)}%;height:${item.height.toFixed(3)}%" type="button" data-ticker="${esc(member.ticker)}" title="${esc(member.ticker)} · ${member.isVehicle ? 'SC vehicle' : 'ML structure'} · ${fmtSigned(move)} · ${cap == null ? 'cap unknown' : fmtCompact(cap)}">
      <strong>${esc(member.ticker)}</strong><span>${fmtSigned(move)}</span><small class="structure-metrics"><span>${member.row ? esc(runLabel(member.row)) : 'D—'}</span>${band ? `<span class="bb-metric-text">${esc(band)}</span>` : ''}</small>
      ${cap == null ? '<small class="cap-unknown-label">CAP —</small>' : ''}
    </button>`;
  }).join('');
}

function stageClass(stage) {
  if (['PARABOLIC', 'CRACKING', 'ACCELERATING'].includes(stage)) return 'hot';
  if (['EMERGING', 'BUILDING'].includes(stage)) return 'building';
  return 'cool';
}

function renderThemeGlance() {
  const themes = activeThemes().slice(0, 4);
  els.themeGlance.innerHTML = themes.length ? themes.map(theme => `
    <article class="theme-glance-card">
      <div class="theme-glance-top">
        <div class="theme-name-title">${esc(theme.name)}</div>
        <div class="theme-move ${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</div>
      </div>
      <div class="theme-glance-meta">${esc(theme.stage || '—')} · 3D ${fmtSigned(theme.mov_3d)}${theme.sc_cluster === true ? ' · SC SYMPATHY' : ''}</div>
    </article>`).join('') : '<div class="empty-state">No active theme rows available.</div>';
}

function themeBoardRead(theme) {
  const deepStory = cleanThemeContextText(theme?.deep?.story);
  const engineNarrative = cleanThemeContextText(theme?.narrative);
  const firstBullet = Array.isArray(theme?.bullets)
    ? theme.bullets.map(item => cleanThemeContextText(typeof item === 'string' ? item : item?.t || item?.text)).find(Boolean)
    : '';
  const keyEvent = cleanThemeContextText(theme?.key_event);
  if (deepStory) return { text: deepStory, source: 'DEEP READ', at: theme.deep_updated_at || theme.updated_at };
  if (engineNarrative) return { text: engineNarrative, source: 'ENGINE READ', at: theme.updated_at };
  if (firstBullet) return { text: String(firstBullet).trim(), source: 'ENGINE CONTEXT', at: theme.updated_at };
  if (keyEvent) return { text: keyEvent, source: 'EVENT CONTEXT', at: theme.updated_at };
  return { text: null, source: null, at: null };
}

function themeBoardDriver(theme) {
  const driver = theme?.deep?.driver;
  if (cleanThemeContextText(driver)) return cleanThemeContextText(driver);
  if (driver && typeof driver === 'object' && cleanThemeContextText(driver.text)) return cleanThemeContextText(driver.text);
  if (cleanThemeContextText(theme?.key_event)) return cleanThemeContextText(theme.key_event);
  return null;
}

function themeRunCensus(members) {
  const measured = members.filter(member => finite(member.row?.run_days) != null);
  const runners = measured.filter(member => finite(member.row.run_days) >= 2);
  const longest = measured.reduce((best, member) => {
    const days = finite(member.row.run_days);
    return !best || days > best.days ? { ticker: member.ticker, days } : best;
  }, null);
  return { measured: measured.length, runners: runners.length, longest };
}

function themeBandCensus(members) {
  const measured = members.filter(member => finite(member.row?.bb_position) != null);
  const outside = measured.filter(member => {
    const position = finite(member.row.bb_position);
    return position > 100 || position < 0;
  });
  const upper = outside.filter(member => finite(member.row.bb_position) > 100);
  const lower = outside.filter(member => finite(member.row.bb_position) < 0);
  const longest = outside.reduce((best, member) => {
    const days = finite(member.row.bb_consec);
    if (days == null || days < 1) return best;
    const side = finite(member.row.bb_position) > 100 ? 'UBB' : 'LBB';
    return !best || days > best.days ? { ticker: member.ticker, days, side } : best;
  }, null);
  return { measured: measured.length, outside: outside.length, upper: upper.length, lower: lower.length, longest };
}

function themeCensusMembers(theme, members) {
  const structure = members.filter(member => !member.isVehicle);
  if (theme?.sc_cluster === true || !structure.length) return { members, scope: 'SC' };
  return { members: structure, scope: 'ML' };
}

function renderThemeMemberRail(members) {
  if (!members.length) return '<div class="theme-member-empty">MEMBER DATA UNAVAILABLE</div>';
  const ordered = [...members].sort((a, b) => {
    const aOutside = bbOutsideLabel(a.row) ? 1 : 0;
    const bOutside = bbOutsideLabel(b.row) ? 1 : 0;
    if (bOutside !== aOutside) return bOutside - aOutside;
    const runGap = (finite(b.row?.run_days) ?? -1) - (finite(a.row?.run_days) ?? -1);
    if (runGap !== 0) return runGap;
    const aMove = finite(a.row?.change_pct);
    const bMove = finite(b.row?.change_pct);
    return (bMove == null ? -Infinity : Math.abs(bMove)) - (aMove == null ? -Infinity : Math.abs(aMove));
  });
  return ordered.map(member => {
    const band = bbOutsideLabel(member.row);
    return `<button class="theme-member-chip ${heatTone(member.row?.change_pct)} ${member.isVehicle ? 'vehicle' : 'structure'}" type="button" data-ticker="${esc(member.ticker)}" title="${esc(`${member.ticker} · ${runLabel(member.row)}${band ? ` · ${band}` : ''} · ${fmtSigned(member.row?.change_pct)}`)}">
      <strong>${esc(member.ticker)}</strong>
      <span class="theme-member-move ${moveClass(member.row?.change_pct)}">${fmtSigned(member.row?.change_pct)}</span>
      <span class="theme-member-run">${esc(runLabel(member.row))}</span>
      ${band ? `<span class="theme-member-band">${esc(band)}</span>` : ''}
    </button>`;
  }).join('');
}

function themeBoardModel(theme) {
  const members = themeMembers(theme);
  const census = themeCensusMembers(theme, members);
  const read = themeBoardRead(theme);
  const driver = themeBoardDriver(theme);
  const run = themeRunCensus(census.members);
  const band = themeBandCensus(census.members);
  const move7d = themeTapeMove(theme, 7);
  const leader = [...census.members].sort((a, b) => {
    const av = finite(a.row?.change_pct);
    const bv = finite(b.row?.change_pct);
    return (bv == null ? -Infinity : bv) - (av == null ? -Infinity : av);
  })[0] || null;
  const runners = census.members
    .filter(member => finite(member.row?.run_days) >= 2)
    .sort((a, b) => finite(b.row.run_days) - finite(a.row.run_days));
  const outside = census.members
    .filter(member => bbOutsideLabel(member.row))
    .sort((a, b) => (finite(b.row?.bb_consec) ?? 0) - (finite(a.row?.bb_consec) ?? 0));
  return {
    theme,
    members,
    read,
    driver,
    run,
    band,
    move7d,
    leader,
    runners,
    outside,
    censusScope: census.scope,
    readStamp: [read.source, read.at ? relativeTime(read.at) : null].filter(Boolean).join(' · '),
    runValue: run.measured ? `${run.runners}/${run.measured}` : '—',
    runDetail: run.longest ? `${run.longest.ticker} GREEN ${Math.trunc(run.longest.days)}d` : 'UNAVAILABLE',
    bandValue: band.measured ? `${band.outside}/${band.measured}` : '—',
    bandDetail: band.longest ? `${band.longest.ticker} ${band.longest.side} ${Math.trunc(band.longest.days)}D` : band.measured ? `${band.upper} UBB · ${band.lower} LBB` : 'UNAVAILABLE',
  };
}

function themeIdentity(model, { meta = true } = {}) {
  const { theme } = model;
  return `<div class="theme-text-identity">
    <button class="theme-title-button" type="button" data-theme-name="${esc(theme.name)}">${esc(theme.name)}</button>
    ${meta ? `<span class="stage-badge ${stageClass(theme.stage)}">${esc(theme.stage || '—')}</span>` : ''}
  </div>`;
}

function themeLeader(model) {
  if (!model.leader) return '<span class="theme-unknown">—</span>';
  return `<button class="theme-text-ticker" type="button" data-ticker="${esc(model.leader.ticker)}">${esc(model.leader.ticker)}</button><span class="${moveClass(model.leader.row?.change_pct)}">${fmtSigned(model.leader.row?.change_pct)}</span>`;
}

function themeRunText(model) {
  return `<strong class="theme-run-text">${esc(model.runValue)}</strong><small>${esc(model.runDetail)}</small>`;
}

function themeBandText(model) {
  return `<strong class="theme-bb-text">${esc(model.bandValue)}</strong><small>${esc(model.bandDetail)}</small>`;
}

function themeSignalLinks(items, kind) {
  if (!items.length) return '<span class="theme-unknown">NONE</span>';
  return items.slice(0, 6).map(member => {
    const suffix = kind === 'run' ? greenRunLabel(member.row) : bbOutsideLabel(member.row);
    return `<button type="button" class="theme-signal-link ${kind === 'band' ? 'bb' : 'run'}" data-ticker="${esc(member.ticker)}">${esc(member.ticker)} <span>${esc(suffix)}</span></button>`;
  }).join('');
}

function renderThemeLedger(models) {
  return `<div class="theme-ledger theme-view-surface">${models.map(model => `<article class="theme-ledger-row" role="button" tabindex="0" data-theme-card="${esc(model.theme.name)}" aria-label="Open ${esc(model.theme.name)} theme">
    <div class="theme-ledger-top">${themeIdentity(model)}<div>${themePerformanceCell('1D', model.theme.mov_1d)}${themePerformanceCell('3D', model.theme.mov_3d)}${themePerformanceCell('7D', model.move7d)}</div></div>
    <div class="theme-ledger-census"><span><small>GREEN RUN · ${esc(model.censusScope)} 2+</small>${themeRunText(model)}</span><span><small>BB · ${esc(model.censusScope)} OUTSIDE</small>${themeBandText(model)}</span><span><small>${esc(model.censusScope)} LEADER</small>${themeLeader(model)}</span></div>
    ${model.read.text ? `<p>${esc(model.read.text)}</p>` : ''}
    ${model.readStamp ? `<time>${esc(model.readStamp)}</time>` : ''}
    ${model.driver && model.driver !== model.read.text ? `<div class="theme-ledger-driver"><strong>DRIVER</strong><span>${esc(model.driver)}</span></div>` : ''}
    <footer><span>RUNNERS ${themeSignalLinks(model.runners, 'run')}</span><span>OUTSIDE ${themeSignalLinks(model.outside, 'band')}</span></footer>
  </article>`).join('')}</div>`;
}

function renderThemeBoard() {
  const models = state.themes
    .filter(theme => theme && theme.name)
    .map(themeBoardModel)
    .sort((a, b) => {
      const dormantGap = Number(a.theme.stage === 'DORMANT') - Number(b.theme.stage === 'DORMANT');
      if (dormantGap !== 0) return dormantGap;
      const outsideGap = Number(b.band.outside > 0) - Number(a.band.outside > 0);
      if (outsideGap !== 0) return outsideGap;
      const aRun = finite(a.run.longest?.days) ?? -1;
      const bRun = finite(b.run.longest?.days) ?? -1;
      if (bRun !== aRun) return bRun - aRun;
      const aMove = finite(a.theme.mov_1d);
      const bMove = finite(b.theme.mov_1d);
      const moveGap = (bMove == null ? -Infinity : Math.abs(bMove)) - (aMove == null ? -Infinity : Math.abs(aMove));
      if (moveGap !== 0) return moveGap;
      return String(a.theme.name).localeCompare(String(b.theme.name));
    });
  if (!models.length) {
    els.themeBoard.innerHTML = '<div class="empty-state">Theme engine returned no active rows.</div>';
    return;
  }
  els.themeBoard.innerHTML = renderThemeLedger(models);
}

function deepText(theme, key) {
  const value = theme?.deep?.[key];
  return cleanThemeContextText(value) || null;
}

function storyBullets(text, limit = 6) {
  if (!text) return [];
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function moverLine(members) {
  return members
    .sort((a, b) => (finite(b.row?.change_pct) ?? -Infinity) - (finite(a.row?.change_pct) ?? -Infinity))
    .map(member => `<button type="button" class="mover-link" data-ticker="${esc(member.ticker)}"><strong>${esc(member.ticker)}</strong> <span class="${moveClass(member.row?.change_pct)}">${fmtSigned(member.row?.change_pct)}</span></button>`)
    .join('');
}

function themeRole(theme, member) {
  const roles = theme?.deep?.roles || {};
  const ticker = member.ticker;
  if (Array.isArray(roles.leaders) && roles.leaders.includes(ticker)) return 'LEADER';
  if (Array.isArray(roles.laggards) && roles.laggards.includes(ticker)) return 'LAGGARD';
  if (member.isVehicle || (Array.isArray(roles.vehicles) && roles.vehicles.includes(ticker))) return 'VEHICLE';
  return '—';
}

function renderThemeRoster(theme, members) {
  const rows = [...members].sort((a, b) => (finite(b.row?.change_pct) ?? -Infinity) - (finite(a.row?.change_pct) ?? -Infinity));
  return `<div class="theme-roster" role="table" aria-label="Theme member structure">
    <div class="theme-roster-head" role="row"><span>NAME</span><span>ROLE</span><span>D</span><span>BB</span><span>8EMA</span><span>1D</span><span>PRICE</span></div>
    ${rows.map(member => {
      const row = member.row;
      return `<button type="button" class="theme-roster-row" role="row" data-ticker="${esc(member.ticker)}">
        <strong>${esc(member.ticker)}</strong>
        <span class="theme-role ${member.isVehicle ? 'vehicle' : ''}">${esc(themeRole(theme, member))}</span>
        <span>${row ? esc(runLabel(row)) : 'D—'}</span>
        <span class="bb-cell">${row ? esc(bbOutsideLabel(row) || '—') : '—'}</span>
        <span class="ma-cell">${row ? fmtSigned(row.ema8_dist) : '—'}</span>
        <span class="${moveClass(row?.change_pct)}">${fmtSigned(row?.change_pct)}</span>
        <span>${row ? fmtPrice(row.price) : '—'}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function volumeStatsFromDailyBars(rawBars) {
  const volumes = rawBars
    .map(bar => finite(bar?.v ?? bar?.volume))
    .filter(value => value != null && value >= 0);
  if (volumes.length < 6) return null;
  const today = volumes[volumes.length - 1];
  const prior = volumes.slice(Math.max(0, volumes.length - 21), -1);
  if (prior.length < 5) return null;
  const average = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  return {
    ratio: average > 0 ? today / average : null,
    sessions: prior.length,
  };
}

function bbMetricParts(row) {
  const position = finite(row?.bb_position);
  const days = finite(row?.bb_consec);
  const dayLabel = days == null ? 'DAYS UNKNOWN' : `${Math.max(0, Math.trunc(days))}D OUT`;
  if (position == null) return null;
  if (position > 100) return { value: `+${fmtNumber(position - 100, 0)}% UBB`, note: dayLabel };
  if (position < 0) return { value: `-${fmtNumber(Math.abs(position), 0)}% LBB`, note: dayLabel };
  return null;
}

function metricTile(label, value, note = '', className = '') {
  return `<div class="theme-metric ${esc(className)}"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
}

function renderThemeSelectedMetrics(ticker, volumeStats = null) {
  const host = document.getElementById('themeMetricStrip');
  if (!host) return;
  const row = detailRowFor(ticker);
  if (!row) {
    host.innerHTML = '<div class="empty-copy">Metrics unavailable for this name.</div>';
    return;
  }
  const bollinger = bbMetricParts(row);
  const longAverage = row.category === 'SC'
    ? ['50SMA', fmtSigned(row.sma50_dist_pct)]
    : ['200SMA', fmtSigned(row.sma200_dist_pct)];
  const rvol = finite(row.volume_ratio) ?? volumeStats?.ratio ?? null;
  host.innerHTML = [
    bollinger ? metricTile('BOLLINGER', bollinger.value, bollinger.note, 'bb-metric') : '',
    metricTile('8EMA', fmtSigned(row.ema8_dist), 'distance', 'ma-metric'),
    metricTile('D COUNT', runLabel(row), ''),
    metricTile('GREEN RUN', greenRunLabel(row) || '—', row.run_escalating === true ? 'escalating' : ''),
    metricTile(longAverage[0], longAverage[1], 'distance', 'ma-metric'),
    metricTile('ATR MOVE', finite(row.atr_days) == null ? '—' : `${fmtSigned(row.atr_days, ' ATR')}`, row.shape_state || ''),
    metricTile('RVOL20', rvol == null ? '—' : `${fmtNumber(rvol, 2)}×`, 'vs prior 20 sessions'),
    metricTile('VOLUME TREND', row.volume_trend || '—', 'backend primitive'),
  ].filter(Boolean).join('');
}

async function loadThemeDailyVolumeMetrics(ticker) {
  const request = ++state.themeMetricRequest;
  try {
    const bars = await fetchChart(ticker, 'D');
    if (request !== state.themeMetricRequest || state.themeChartTicker !== ticker) return;
    renderThemeSelectedMetrics(ticker, volumeStatsFromDailyBars(bars));
  } catch {
    if (request !== state.themeMetricRequest || state.themeChartTicker !== ticker) return;
    renderThemeSelectedMetrics(ticker, null);
  }
}

function themeNewsItems(members, limit = 8) {
  const seen = new Set();
  return members
    .flatMap(member => newsFor(member.ticker).map(item => ({ ...item, memberTicker: member.ticker })))
    .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0))
    .filter(item => {
      const key = String(item.headline || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function renderThemeNarrative(theme) {
  const deep = theme?.deep || {};
  const lifecycle = deep.lifecycle || {};
  const dataBullets = Array.isArray(theme?.bullets)
    ? theme.bullets.map(item => cleanContextText(typeof item === 'string' ? item : item?.t || item?.text)).filter(Boolean)
    : [];
  const crowd = cleanContextText(theme?.narrative) || null;
  const deskEvidence = cleanContextText(lifecycle.evidence);
  const desk = deskEvidence
    ? `${lifecycle.phase ? `${lifecycle.phase}: ` : ''}${deskEvidence}`
    : null;
  const measurement = dataBullets.length ? dataBullets.join(' · ') : null;
  const panels = [
    crowd ? `<div><strong>CROWD</strong><p>${esc(crowd)}</p></div>` : '',
    desk ? `<div><strong>DESK</strong><p>${esc(desk)}</p></div>` : '',
    measurement ? `<div><strong>MEASUREMENT</strong><p>${esc(measurement)}</p></div>` : '',
  ].filter(Boolean);
  if (!panels.length) return '';
  return `<details class="theme-expander">
    <summary><strong>NARRATIVE — THE CROWD, THE DESK, THE MEASUREMENT</strong><span>${panels.length} OF 3 SOURCES</span></summary>
    <div class="theme-expander-body narrative-grid">${panels.join('')}</div>
  </details>`;
}

function renderThemeNews(theme, members) {
  const news = themeNewsItems(members);
  const heat = theme?.deep?.story_heat || {};
  const trend = typeof heat.trend === 'string' ? heat.trend.toUpperCase() : '—';
  const mentions = finite(heat.mentions_7d);
  const chatter = [mentions == null ? null : `${Math.trunc(mentions)} MENTIONS / 7D`, trend === '—' ? null : `CHATTER ${trend}`].filter(Boolean).join(' · ');
  if (!news.length && !chatter) return '';
  return `<details class="theme-expander">
    <summary><strong>NEWS &amp; CHATTER</strong><span>${[`${news.length} ${news.length === 1 ? 'STORY' : 'STORIES'}`, chatter].filter(Boolean).map(esc).join(' · ')}</span></summary>
    <div class="theme-expander-body">
      ${chatter ? `<div class="chatter-strip"><strong>CHATTER</strong><span>${esc(chatter)}</span></div>` : ''}
      ${news.length ? `<div class="theme-news-list">${news.map(item => `<article><strong>${esc(item.memberTicker)}</strong><div>${esc(item.headline)}</div><small>${esc(item.source || 'source unknown')} · ${relativeTime(item.published_at)}</small></article>`).join('')}</div>` : ''}
    </div>
  </details>`;
}

function openThemeOverview(name) {
  const theme = state.themes.find(item => item.name === name);
  if (!theme) return;
  state.selectedTheme = theme;
  els.themeOverviewTitle.textContent = theme.name;
  const boardRead = themeBoardRead(theme);
  const move7d = themeTapeMove(theme, 7);
  const readStamp = [boardRead.source, boardRead.at ? relativeTime(boardRead.at) : null].filter(Boolean).join(' · ');
  els.themeOverviewMeta.innerHTML = `<span class="stage-badge ${stageClass(theme.stage)}">${esc(theme.stage || '—')}</span> · 1D <span class="${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</span> · 3D <span class="${moveClass(theme.mov_3d)}">${fmtSigned(theme.mov_3d)}</span> · 7D <span class="${moveClass(move7d)}">${fmtSigned(move7d)}</span>${readStamp ? ` · ${esc(readStamp)}` : ''}`;
  const story = deepText(theme, 'story') || themeNarrative(theme);
  const driver = themeBoardDriver(theme);
  const falsifier = deepText(theme, 'falsifier');
  const members = themeMembers(theme);
  const structure = members.filter(member => !member.isVehicle);
  const vehicles = members.filter(member => member.isVehicle);
  const bullets = storyBullets(story);
  const defaultChartMember = structure.find(member => member.row) || members.find(member => member.row) || members[0];
  state.themeChartTicker = defaultChartMember?.ticker || null;
  state.themeChartTf = '2m';
  els.themeOverviewBody.innerHTML = `
    <section class="theme-story-panel">
      <div class="theme-overview-label">TAPE SNAPSHOT</div>
      <div class="theme-mover-groups">
        <div class="theme-mover-group"><strong>ML STRUCTURE</strong><div>${structure.length ? moverLine(structure) : '<span class="empty-copy">None tracked.</span>'}</div></div>
        <div class="theme-mover-group"><strong>SC VEHICLES</strong><div>${vehicles.length ? moverLine(vehicles) : '<span class="empty-copy">None tracked.</span>'}</div></div>
      </div>
      <div class="theme-overview-label theme-read-label">CURRENT READ</div>
      ${bullets.length ? `<ul class="theme-read-bullets">${bullets.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      ${driver ? `<div class="theme-read-line"><strong>DRIVER</strong><span>${esc(driver)}</span></div>` : ''}
      ${falsifier ? `<div class="theme-read-line"><strong>WHAT CHANGES THE READ</strong><span>${esc(falsifier)}</span></div>` : ''}
    </section>
    <section class="theme-chart-panel">
      <div class="theme-panel-head">
        <div><div class="theme-overview-label">CHART</div><h3 id="themeChartTicker">${esc(state.themeChartTicker || '—')}</h3></div>
        <div class="chart-tabs" aria-label="Theme chart timeframe">
          <button type="button" data-theme-chart-tf="2m" class="active" title="Delayed rail is not execution">2M</button>
          <button type="button" data-theme-chart-tf="10m">10M</button>
          <button type="button" data-theme-chart-tf="1h">1H</button>
          <button type="button" data-theme-chart-tf="D">D</button>
        </div>
      </div>
      <div class="chart-note" id="themeChartNote">Delayed 2-minute evidence — execution stays on DAS.</div>
      <div class="theme-chart-legend"><span class="ema8-key">8EMA</span><span class="bb-key">BB</span><span class="sma200-key">200SMA</span><span class="vol-key">VOL</span></div>
      <div class="chart-host theme-chart-host" id="themeChartHost"><div class="loading-card">Loading chart…</div></div>
      <div class="theme-selected-metrics" id="themeMetricStrip"></div>
    </section>
    <section class="theme-names-panel">
      <div class="theme-panel-head"><div><div class="theme-overview-label">THE NAMES — ${members.length}</div><h3>Click a row to chart it here</h3></div></div>
      ${renderThemeRoster(theme, members)}
    </section>
    <section class="theme-map-panel">
      <div class="theme-panel-head"><div><div class="theme-overview-label">THE NAMES</div><h3>Market-cap heat map</h3></div><div class="heat-legend"><span>DOWN</span><i class="legend-down"></i><i class="legend-flat"></i><i class="legend-up"></i><span>UP</span></div></div>
      <div class="theme-expanded-treemap">${renderTreemapMemberTiles(theme)}</div>
    </section>
    <section class="theme-feed-panel">
      ${renderThemeNarrative(theme)}
      ${renderThemeNews(theme, members)}
    </section>`;
  document.body.style.overflow = 'hidden';
  els.detailBackdrop.hidden = false;
  els.themeOverview.classList.add('open');
  els.themeOverview.setAttribute('aria-hidden', 'false');
  if (state.themeChartTicker) selectThemeChartTicker(state.themeChartTicker);
}

function closeThemeOverview() {
  state.chartRequest += 1;
  state.themeMetricRequest += 1;
  state.selectedTheme = null;
  state.themeChartTicker = null;
  els.themeOverview.classList.remove('open');
  els.themeOverview.setAttribute('aria-hidden', 'true');
  if (!state.selected) {
    els.detailBackdrop.hidden = true;
    document.body.style.overflow = '';
  }
}

function countLabel(value, fallback = '—') {
  const number = finite(value);
  return number == null ? fallback : Math.trunc(number).toLocaleString('en-US');
}

function lagLabel(seconds) {
  const value = finite(seconds);
  if (value == null) return 'lag unknown';
  if (value < 120) return `${Math.round(value)}s lag`;
  return `${Math.round(value / 60)}m lag`;
}

function countWithNoun(value, singular, plural = `${singular}s`) {
  const number = finite(value);
  return number == null ? `— ${plural}` : `${countLabel(number)} ${Math.trunc(number) === 1 ? singular : plural}`;
}

function tapeLeaders(items, side) {
  if (!Array.isArray(items) || !items.length) return '<span class="tape-none">—</span>';
  return items.slice(0, 3).map(item => `<button type="button" class="tape-name ${side}" data-ticker="${esc(item.ticker)}" title="${esc(item.ticker)} · ${countLabel(item.hits)} ${side === 'high' ? 'HOD' : 'LOD'} re-anchors · ${finite(item.mins_since) == null ? 'clock unknown' : `${Math.trunc(item.mins_since)}m since anchor`}"><strong>${esc(item.ticker)}</strong><span>${countLabel(item.hits)}</span></button>`).join('');
}

function renderBreadthHistory(rows) {
  if (!rows.length) return '<div class="empty-copy">No breadth history has been published yet.</div>';
  const maxValue = Math.max(1, ...rows.flatMap(row => [finite(row.above) ?? 0, finite(row.below) ?? 0]));
  return `<div class="breadth-history" role="table" aria-label="Historical 8EMA entry breadth">
    <div class="breadth-history-head" role="row"><span>SESSION</span><span>BELOW</span><span>ABOVE</span><span>HEAVY SIDE</span></div>
    ${rows.map(row => {
      const above = finite(row.above);
      const below = finite(row.below);
      const aboveWidth = above == null ? 0 : Math.max(2, above / maxValue * 100);
      const belowWidth = below == null ? 0 : Math.max(2, below / maxValue * 100);
      const side = row.side_max_side === 'ABOVE' || row.side_max_side === 'BELOW' ? row.side_max_side : '—';
      const percentile = finite(row.percentile_reached);
      return `<div class="breadth-history-row" role="row">
        <time>${esc(fmtDate(`${row.et_date}T16:00:00-04:00`))}</time>
        <div class="breadth-bar-cell below"><span style="--bar:${belowWidth.toFixed(2)}%"></span><strong>${countLabel(below)}</strong></div>
        <div class="breadth-bar-cell above"><span style="--bar:${aboveWidth.toFixed(2)}%"></span><strong>${countLabel(above)}</strong></div>
        <div class="breadth-side ${side.toLowerCase()}"><strong>${esc(side)}</strong>${percentile == null ? '' : `<span>P${Math.trunc(percentile)}</span>`}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderThemeTape(tape) {
  const themes = Array.isArray(tape?.themes) ? tape.themes : [];
  if (!themes.length) return '<div class="empty-copy">No theme members were measurable on the latest rail session.</div>';
  return `<div class="theme-tape" role="table" aria-label="Theme HOD and LOD hit tape">
    <div class="theme-tape-head" role="row"><span>THEME</span><span>COVERAGE</span><span>HOD HITS</span><span>LOD HITS</span><span>BALANCE</span><span>LEADERS</span></div>
    ${themes.map(theme => {
      const high = finite(theme.hod_hits);
      const low = finite(theme.lod_hits);
      const balance = high == null || low == null ? null : high - low;
      const balanceClass = balance == null || balance === 0 ? 'neutral' : balance > 0 ? 'positive' : 'negative';
      return `<div class="theme-tape-row" role="row">
        <button type="button" class="theme-tape-title" data-theme-name="${esc(theme.name)}"><strong>${esc(theme.name)}</strong><span>${esc(theme.stage || '—')}</span></button>
        <div class="theme-tape-coverage"><strong>${countLabel(theme.members_measured)}/${countLabel(theme.members_expected)}</strong><span>names</span></div>
        <div class="theme-tape-count positive"><strong>${countLabel(high)}</strong><span>${countWithNoun(theme.hod_names, 'name')}</span></div>
        <div class="theme-tape-count negative"><strong>${countLabel(low)}</strong><span>${countWithNoun(theme.lod_names, 'name')}</span></div>
        <div class="theme-tape-balance ${balanceClass}">${balance == null ? '—' : `${balance > 0 ? '+' : ''}${Math.trunc(balance)}`}</div>
        <div class="theme-tape-leaders"><div>${tapeLeaders(theme.highs, 'high')}</div><div>${tapeLeaders(theme.lows, 'low')}</div></div>
      </div>`;
    }).join('')}
  </div>`;
}

function fmtNet(value) {
  const number = finite(value);
  if (number == null) return '—';
  const absolute = Math.abs(number);
  const compact = absolute >= 1000000 ? `${(absolute / 1000000).toFixed(2)}M` : absolute >= 1000 ? `${Math.round(absolute / 1000)}K` : Math.round(absolute).toLocaleString('en-US');
  return `${number > 0 ? '+' : number < 0 ? '−' : ''}${compact}`;
}

function fmtPlainPct(value) {
  const number = finite(value);
  return number == null ? '—' : `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}

function renderCotPositioning(cot) {
  const contracts = Array.isArray(cot?.contracts) ? cot.contracts : [];
  if (!contracts.length) return '<div class="empty-copy">Official CFTC positioning is unavailable.</div>';
  return `<div class="cot-grid" role="table" aria-label="CFTC weekly positioning">
    <div class="cot-grid-head" role="row"><span>CONTRACT</span><span>PRIMARY NET</span><span>WEEK</span><span>% OPEN INTEREST</span><span>SECONDARY NET</span></div>
    ${contracts.map(contract => {
      const primary = finite(contract.primary_net);
      const weekly = finite(contract.primary_weekly_change);
      const secondary = finite(contract.secondary_net);
      return `<div class="cot-row" role="row">
        <div class="cot-contract"><strong>${esc(contract.key)}</strong><span>${esc(contract.label)}</span></div>
        <div><strong class="${moveClass(primary)}">${fmtNet(primary)}</strong><span>${esc(contract.primary_label || 'primary')}</span></div>
        <div><strong class="${moveClass(weekly)}">${fmtNet(weekly)}</strong><span>net change</span></div>
        <div><strong class="${moveClass(contract.primary_net_pct_oi)}">${fmtPlainPct(contract.primary_net_pct_oi)}</strong><span>primary net</span></div>
        <div><strong class="${moveClass(secondary)}">${fmtNet(secondary)}</strong><span>${esc(contract.secondary_label || 'secondary')}</span></div>
      </div>`;
    }).join('')}
  </div>`;
}

function etEventParts(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return { day: 'DATE UNKNOWN', time: '—' };
  return {
    day: date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(),
    time: date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
  };
}

function renderCatalystCalendar(calendar) {
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  if (!events.length) return '<div class="empty-copy">No verified catalysts are available in the current window.</div>';
  const groups = new Map();
  for (const event of events) {
    const parts = etEventParts(event.starts_at);
    if (!groups.has(parts.day)) groups.set(parts.day, []);
    groups.get(parts.day).push({ ...event, displayTime: parts.time });
  }
  return `<div class="catalyst-list">
    ${[...groups.entries()].map(([day, items]) => `<section class="catalyst-day">
      <div class="catalyst-day-label">${esc(day)}</div>
      <div>${items.map(event => {
        const surprise = finite(event.surprise_pct);
        const themes = Array.isArray(event.themes) && event.themes.length ? event.themes.slice(0, 2).join(' · ') : '';
        return `<div class="catalyst-row ${String(event.kind || '').toLowerCase()}">
          <time>${esc(event.displayTime)} ET</time>
          <span class="catalyst-kind">${esc(event.kind || 'EVENT')}</span>
          <div><strong>${esc(event.title)}</strong><span>${esc([event.session, themes, event.source].filter(Boolean).join(' · '))}</span></div>
          <div class="catalyst-result">${surprise == null ? '' : `<strong class="${moveClass(surprise)}">${fmtPlainPct(surprise)}</strong><span>EPS surprise</span>`}</div>
        </div>`;
      }).join('')}</div>
    </section>`).join('')}
  </div>`;
}

function renderCalendarSourceStatus(calendar) {
  const carried = (Array.isArray(calendar?.source_status) ? calendar.source_status : [])
    .filter(item => item?.mode === 'last_verified');
  if (!carried.length) return '';
  return `<p class="breadth-definition"><strong>LAST VERIFIED SOURCE</strong> · ${carried.map(item => `${esc(item.source)} ${esc(relativeTime(item.verified_at))}`).join(' · ')}</p>`;
}

function earningsStatusLine(event) {
  if (event.status === 'REPORTED') {
    return `EPS ${event.eps_actual == null ? 'actual unknown' : event.eps_actual} vs ${event.eps_estimate == null ? 'estimate unknown' : event.eps_estimate}${finite(event.surprise_pct) == null ? '' : ` · ${fmtPlainPct(event.surprise_pct)} surprise`}`;
  }
  return `${event.report_date || 'date unknown'}${event.session ? ` · ${event.session}` : ' · session unknown'} · estimate ${event.eps_estimate == null ? 'unknown' : event.eps_estimate}`;
}

function renderEarningsDigest(digest) {
  const themes = Array.isArray(digest?.themes) ? digest.themes : [];
  if (!themes.length) return '<div class="empty-copy">No active-theme earnings fall inside the measured window.</div>';
  return `<div class="earnings-digest">
    ${themes.map(theme => `<section class="earnings-theme">
      <button type="button" class="earnings-theme-title" data-theme-name="${esc(theme.name)}">${esc(theme.name)}</button>
      <div class="earnings-events">${(theme.events || []).map(event => {
        const headlines = Array.isArray(event.headlines) ? event.headlines.filter(item => item?.headline) : [];
        return `<article class="earnings-event">
          <div class="earnings-event-head"><button type="button" data-ticker="${esc(event.ticker)}">${esc(event.ticker)}</button><span class="${event.status === 'REPORTED' ? 'reported' : ''}">${esc(event.status || 'UNKNOWN')}</span></div>
          <p>${esc(earningsStatusLine(event))}</p>
          ${headlines.length ? `<ul>${headlines.map(item => `<li>${esc(item.headline)} <span>${esc(item.source || 'source unknown')}</span></li>`).join('')}</ul>` : '<div class="earnings-empty">No matched earnings evidence headlines.</div>'}
          <div class="transcript-empty">TRANSCRIPT UNAVAILABLE · no licensed source connected</div>
        </article>`;
      }).join('')}</div>
    </section>`).join('')}
  </div>`;
}

function fmtProbability(value) {
  const number = finite(value);
  return number == null ? '—' : `${number.toFixed(number < 10 ? 1 : 0)}%`;
}

function fmtPointMove(value) {
  const number = finite(value);
  if (number == null) return '—';
  return `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number).toFixed(1)}pp`;
}

function predictionChangeParts(contract) {
  return [
    ['1H', contract?.delta_1h_pp],
    ['24H', contract?.delta_24h_pp],
    ['7D', contract?.delta_7d_pp],
    [contract?.delta_reference_label, contract?.delta_reference_pp],
  ].filter(([label, value]) => label && finite(value) != null);
}

function predictionActivity(contract) {
  if (contract?.provider === 'KALSHI') {
    const volume = finite(contract?.volume_24h_contracts);
    const openInterest = finite(contract?.open_interest_contracts);
    return {
      primary: volume == null ? '24H —' : `${fmtCompact(volume)} ctr · 24H`,
      secondary: openInterest == null ? 'OI —' : `${fmtCompact(openInterest)} ctr · OI`,
    };
  }
  const volume = finite(contract?.volume_24h_usd);
  const liquidity = finite(contract?.liquidity_usd);
  return {
    primary: volume == null ? '24H —' : `$${fmtCompact(volume)} · 24H`,
    secondary: liquidity == null ? 'LIQ —' : `$${fmtCompact(liquidity)} · LIQ`,
  };
}

function renderPredictionMarkets(snapshot) {
  const topics = Array.isArray(snapshot?.topics) ? snapshot.topics.filter(topic => Array.isArray(topic?.contracts) && topic.contracts.length) : [];
  if (!topics.length) return '<div class="empty-copy">Event-odds snapshot unavailable.</div>';
  return `<div class="event-odds">
    <div class="event-odds-head" role="row"><span>CONTRACT</span><span>VENUE</span><span>YES</span><span>CHANGE</span><span>ACTIVITY</span><span>CLOSES / SOURCE</span></div>
    ${topics.map(topic => `<section class="event-odds-topic">
      <div class="event-topic-head">
        <strong>${esc(topic.label)}</strong>
        <span>${(topic.related_themes || []).map(theme => `<button type="button" data-theme-name="${esc(theme)}">${esc(theme)}</button>`).join('')}</span>
      </div>
      ${(topic.contracts || []).map(contract => {
        const changes = predictionChangeParts(contract);
        const activity = predictionActivity(contract);
        const measured = contract?.evidence_state === 'MEASURED';
        const method = contract?.probability_method === 'YES_BID_ASK_MIDPOINT' ? 'YES bid/ask midpoint' : contract?.probability_method === 'YES_OUTCOME_PRICE' ? 'YES outcome price' : 'method unknown';
        const book = finite(contract?.yes_bid_pct) == null || finite(contract?.yes_ask_pct) == null ? '' : `B ${fmtProbability(contract.yes_bid_pct)} · A ${fmtProbability(contract.yes_ask_pct)}`;
        return `<article class="event-odds-row ${measured ? '' : 'partial'}">
          <div class="event-contract"><strong>${esc(contract.question)}</strong><span>${esc(contract.contract_label || contract.contract_id || '')}</span></div>
          <div class="event-provider ${String(contract.provider || '').toLowerCase()}"><strong>${esc(contract.provider || '—')}</strong><span>${esc(measured ? 'MEASURED' : contract.evidence_state || 'PARTIAL')}</span></div>
          <div class="event-probability" title="${esc(method)}"><strong>${fmtProbability(contract.probability_pct)}</strong><span>${esc(book || method)}</span></div>
          <div class="event-changes">${changes.length ? changes.map(([label, value]) => `<span><small>${esc(label)}</small><strong class="${moveClass(value)}">${fmtPointMove(value)}</strong></span>`).join('') : '<span class="event-unknown">—</span>'}</div>
          <div class="event-activity"><strong>${esc(activity.primary)}</strong><span>${esc(activity.secondary)}</span></div>
          <div class="event-source"><strong>${esc(fmtDate(contract.closes_at, true))}</strong><a href="${esc(contract.source_url)}" target="_blank" rel="noopener noreferrer">${esc(contract.provider || 'SOURCE')} · observed ${esc(relativeTime(contract.observed_at))}</a></div>
        </article>`;
      }).join('')}
    </section>`).join('')}
  </div>`;
}

function renderBreadthSurface() {
  if (!els.breadthSurface || !els.breadthAsOf) return;
  const snapshot = state.breadthSnapshot;
  const rows = Array.isArray(snapshot?.breadth?.rows) ? snapshot.breadth.rows : [];
  const tape = snapshot?.tape && typeof snapshot.tape === 'object' ? snapshot.tape : null;
  if (!rows.length && !tape) {
    els.breadthAsOf.textContent = 'Measured snapshot unavailable';
    els.breadthSurface.innerHTML = '<div class="error-state">Breadth snapshot unavailable. Unknown remains unknown.</div>';
    return;
  }
  const latest = rows.at(-1) || null;
  const generated = snapshot?.generated_at;
  els.breadthAsOf.textContent = `Through ${tape?.et_date || latest?.et_date || 'date unknown'} · snapshot ${relativeTime(generated)}`;
  const burningNames = Array.isArray(latest?.theme_names) && latest.theme_names.length ? latest.theme_names.join(', ') : 'none';
  const breadthRows = rows.slice(-20);
  const cot = snapshot?.cot && typeof snapshot.cot === 'object' ? snapshot.cot : null;
  const calendar = snapshot?.calendar && typeof snapshot.calendar === 'object' ? snapshot.calendar : null;
  const earningsDigest = snapshot?.earnings_digest && typeof snapshot.earnings_digest === 'object' ? snapshot.earnings_digest : null;
  const predictionSnapshot = state.predictionSnapshot;
  els.breadthSurface.innerHTML = `
    <section class="breadth-panel event-odds-panel" aria-labelledby="eventOddsTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">PUBLIC EVENT MARKETS · READ ONLY</div><h3 id="eventOddsTitle">Event odds</h3></div>
        <span>${countLabel(predictionSnapshot?.coverage?.contracts_measured)}/${countLabel(predictionSnapshot?.coverage?.contracts_expected)} measured · snapshot ${relativeTime(predictionSnapshot?.generated_at)}</span>
      </div>
      <p class="breadth-definition">${esc(predictionSnapshot?.definition || 'Venue-implied probabilities are unavailable.')}</p>
      ${renderPredictionMarkets(predictionSnapshot)}
    </section>

    <section class="breadth-panel" aria-labelledby="entryBreadthTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">CALIBRATED MID / LARGE UNIVERSE</div><h3 id="entryBreadthTitle">8EMA entry breadth</h3></div>
        <span>${breadthRows.length} measured sessions</span>
      </div>
      <div class="breadth-kpis">
        <div><span>ABOVE ENTRIES</span><strong class="positive">${countLabel(latest?.above)}</strong><small>${latest?.side_max_side === 'ABOVE' && finite(latest?.percentile_reached) != null ? `P${Math.trunc(latest.percentile_reached)} heavy side` : 'latest session'}</small></div>
        <div><span>BELOW ENTRIES</span><strong class="negative">${countLabel(latest?.below)}</strong><small>${latest?.side_max_side === 'BELOW' && finite(latest?.percentile_reached) != null ? `P${Math.trunc(latest.percentile_reached)} heavy side` : 'latest session'}</small></div>
        <div><span>TOTAL ENTRIES</span><strong>${countLabel(latest?.total)}</strong><small>both sides</small></div>
        <div><span>WARM UNIVERSE</span><strong>${countLabel(latest?.universe_warm)}/${countLabel(latest?.universe_evaluated)}</strong><small>honest denominator</small></div>
        <div><span>BURNING THEMES</span><strong>${countLabel(latest?.themes_burning)}</strong><small>${esc(burningNames)}</small></div>
      </div>
      <p class="breadth-definition">${esc(snapshot?.breadth?.definition || '')}</p>
      ${renderBreadthHistory(breadthRows)}
    </section>

    <section class="breadth-panel" aria-labelledby="themeTapeTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">DELAYED 2-MINUTE BOARD RAIL</div><h3 id="themeTapeTitle">Theme HOD / LOD hit tape</h3></div>
        <span>${esc(tape?.et_date || 'date unknown')} · ${esc(lagLabel(tape?.median_lag_sec))}</span>
      </div>
      <div class="tape-summary">
        <div><span>HOD RE-ANCHORS</span><strong class="positive">${countLabel(tape?.hod_hits)}</strong></div>
        <div><span>LOD RE-ANCHORS</span><strong class="negative">${countLabel(tape?.lod_hits)}</strong></div>
        <div><span>RAIL NAMES</span><strong>${countLabel(tape?.tickers_measured)}</strong></div>
        <div><span>THEME-MAPPED</span><strong>${countLabel(tape?.mapped_tickers)}/${countLabel(tape?.tickers_measured)}</strong></div>
      </div>
      <p class="breadth-definition">${esc(tape?.definition || '')}</p>
      ${renderThemeTape(tape)}
    </section>

    <section class="breadth-panel" aria-labelledby="cotTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">OFFICIAL CFTC · WEEKLY POSITIONING</div><h3 id="cotTitle">Commitments of Traders</h3></div>
        <span>Positions ${esc(cot?.report_date || 'date unknown')} · ${countLabel(cot?.contracts_measured)}/${countLabel(cot?.contracts_expected)} contracts</span>
      </div>
      <p class="breadth-definition">${esc(cot?.cadence || '')}</p>
      ${renderCotPositioning(cot)}
    </section>

    <section class="breadth-panel" aria-labelledby="calendarTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">VERIFIED SCHEDULES · ECONOMIC + EARNINGS</div><h3 id="calendarTitle">Catalyst calendar</h3></div>
        <span>${countLabel(calendar?.events?.length)} events · ${esc((calendar?.sources || []).join(' · ') || 'sources unavailable')}</span>
      </div>
      <p class="breadth-definition">${esc(calendar?.definition || '')}</p>
      ${renderCalendarSourceStatus(calendar)}
      ${renderCatalystCalendar(calendar)}
    </section>

    <section class="breadth-panel" aria-labelledby="earningsDigestTitle">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">THEME MEMBERS · RESULTS + EVIDENCE</div><h3 id="earningsDigestTitle">Earnings evidence digest</h3></div>
        <span>${countLabel(earningsDigest?.themes?.length)} active themes</span>
      </div>
      <p class="breadth-definition">${esc(earningsDigest?.definition || '')}</p>
      ${renderEarningsDigest(earningsDigest)}
    </section>`;
}

function renderAll() {
  renderBook('SC');
  renderBook('ML');
  renderDiscovery();
  renderThemeGlance();
  renderThemeBoard();
  renderBreadthSurface();
}

function renderFatalBookError(message) {
  const html = `<div class="error-state">${esc(message)}</div>`;
  els.scRows.innerHTML = html;
  els.mlRows.innerHTML = html;
  els.scCount.textContent = 'unavailable';
  els.mlCount.textContent = 'unavailable';
}

function setFreshness(kind, label) {
  els.freshness.className = `freshness ${kind}`;
  els.freshnessText.textContent = label;
}

function updateFreshness(failures = []) {
  const rowTimes = state.market.map(row => Date.parse(row.updated_at || '')).filter(Number.isFinite);
  const latest = rowTimes.length ? Math.max(...rowTimes) : NaN;
  if (!Number.isFinite(latest)) {
    setFreshness('stale', failures.length ? 'Loaded with gaps' : 'Row time unknown');
    return;
  }
  const age = Date.now() - latest;
  const kind = failures.length ? 'stale' : age <= 15 * 60000 ? 'fresh' : 'stale';
  const suffix = failures.length ? ` · ${failures.join(', ')} unavailable` : '';
  setFreshness(kind, `Rows ${relativeTime(latest)}${suffix}`);
}

function switchView(view) {
  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fact(label, value, className = '') {
  return `<div class="fact"><div class="fact-label">${esc(label)}</div><div class="fact-value ${className}">${esc(value ?? '—')}</div></div>`;
}

function openDetail(ticker) {
  const row = detailRowFor(ticker);
  if (!row) return;
  state.selected = row;
  state.chartTf = row.category === 'SC' ? '2m' : 'D';

  const context = rowContext(row);
  els.detailClass.textContent = row.category === 'SC'
    ? 'SMALL CAP · INTRADAY CONTEXT'
    : row.category === 'ML' ? 'MID / LARGE · SWING CONTEXT' : 'CLASS UNVERIFIED · DISCOVERY';
  els.detailTicker.textContent = row.ticker;
  els.detailSubhead.innerHTML = `<span class="${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span> · ${fmtPrice(row.price)} · ${esc(context.theme || 'No theme attached')}`;

  const sharedFacts = [
    fact('Price', fmtPrice(row.price)),
    fact('Session', fmtSigned(row.change_pct), moveClass(row.change_pct)),
    fact('8EMA', fmtSigned(row.ema8_dist), 'ma-text'),
    fact('Bollinger', bbLabel(row), 'bb-text'),
    fact('D count', runLabel(row)),
    fact('Build clock', buildLabel(row)),
    fact('Daily ATR', finite(row.atr) == null ? '—' : `$${fmtNumber(row.atr, row.atr < 1 ? 4 : 2)}`),
    fact('ATR move', finite(row.atr_days) == null ? '—' : `${fmtSigned(row.atr_days, ' ATR')}`),
    fact('Shape', row.shape_state || '—'),
  ];
  const scFacts = [
    fact('Float', (row.float_source === 'MASSIVE_FREE_FLOAT' || row.float_source === 'MANUAL') ? `${fmtCompact(row.float_size)} · AS OF ${fmtDate(row.float_as_of)}` : '—'),
    fact('Short interest', finite(row.si_pct) == null ? '—' : `${fmtNumber(row.si_pct, 0)}%`),
    fact('Borrow', finite(row.borrow_fee) == null ? '—' : `${fmtNumber(row.borrow_fee, 0)}% APR`),
    fact('VWAP', fmtSigned(row.vwap_dist)),
  ];
  const mlFacts = [
    fact('200SMA', fmtSigned(row.sma200_dist_pct), 'ma-text'),
    fact('Volume', finite(row.volume_ratio) == null ? '—' : `${fmtNumber(row.volume_ratio)}×`),
    fact('FRD', row.frd === true ? 'YES' : row.frd === false ? 'NO' : '—'),
  ];
  const unknownFacts = [
    fact('Market cap', row.market_cap || '—'),
    fact('Volume', finite(row.volume_ratio) == null ? '—' : `${fmtNumber(row.volume_ratio)}×`),
    fact('Class', 'UNVERIFIED'),
  ];
  els.detailFacts.innerHTML = [...sharedFacts, ...(row.category === 'SC' ? scFacts : row.category === 'ML' ? mlFacts : unknownFacts)].join('');

  const contextLines = [
    row.discovery ? `<div class="context-copy"><strong>Discovery:</strong> ${esc(SCANNER_TYPES[row.discovery.scan_type]?.detail || 'SCANNER HIT')} · backend rank ${esc(finite(row.discovery.rank) == null ? '—' : Math.trunc(Number(row.discovery.rank)) + 1)} · last seen ${esc(relativeTime(row.discovery.last_seen_at))}</div>` : '',
    context.theme ? `<div class="context-copy"><strong>Theme:</strong> ${esc(context.theme)}</div>` : '',
    context.why ? `<div class="context-copy"><strong>Current reason:</strong> ${esc(context.why)}</div>` : '',
    context.catalyst ? `<div class="context-copy"><strong>Catalyst class:</strong> ${esc(context.catalyst)}</div>` : '',
  ].filter(Boolean);
  els.detailContext.innerHTML = contextLines.join('');

  els.detailSupplySection.hidden = row.category !== 'SC';
  if (row.category === 'SC') renderDilutionPreview(row);

  const news = newsFor(row.ticker).slice(0, 5);
  els.detailNews.innerHTML = news.map(item => `
    <div class="news-item">
      <div>${esc(item.headline)}</div>
      <div class="item-meta">${esc(item.source || 'source unknown')} · ${relativeTime(item.published_at)}</div>
    </div>`).join('');

  document.body.style.overflow = 'hidden';
  els.detailBackdrop.hidden = false;
  els.detailDrawer.classList.add('open');
  els.detailDrawer.setAttribute('aria-hidden', 'false');
  updateChartTabs();
  loadChart(row.ticker, state.chartTf);
}

function closeDetail() {
  state.chartRequest += 1;
  state.dilutionRequest += 1;
  state.selected = null;
  els.detailDrawer.classList.remove('open');
  els.detailDrawer.setAttribute('aria-hidden', 'true');
  els.detailBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function updateChartTabs() {
  document.querySelectorAll('[data-chart-tf]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartTf === state.chartTf);
  });
}

async function fetchChart(ticker, tf) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/chart-bars`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ticker, tf }),
  });
  let body = null;
  try { body = await response.json(); } catch { /* response body is optional on failure */ }
  if (!response.ok || body?.error) throw new Error(body?.error || `Chart unavailable (${response.status})`);
  return Array.isArray(body?.bars) ? body.bars : [];
}

async function loadChart(ticker, tf) {
  const request = ++state.chartRequest;
  els.chartHost.innerHTML = '<div class="loading-card" style="width:100%;height:260px">Loading chart…</div>';
  els.chartNote.textContent = tf === '2m' ? 'Delayed 2-minute evidence — execution stays on DAS.' : 'Daily context.';
  try {
    const bars = await fetchChart(ticker, tf);
    if (request !== state.chartRequest) return;
    renderCandles(bars, tf, els.chartHost, ticker);
  } catch (error) {
    if (request !== state.chartRequest) return;
    els.chartHost.innerHTML = `<div class="error-state">${esc(error.message || 'Chart unavailable.')}</div>`;
  }
}

function renderCandles(rawBars, tf, host = els.chartHost, ticker = state.selected?.ticker || '') {
  const maxBars = tf === '2m' ? 130 : 120;
  const fullBars = rawBars.filter(bar => [bar?.o, bar?.h, bar?.l, bar?.c].every(value => finite(value) != null));
  if (!fullBars.length) {
    host.innerHTML = '<div class="empty-state">No bars returned.</div>';
    return;
  }

  const closes = fullBars.map(bar => Number(bar.c));
  const ema = (values, period) => {
    const out = new Array(values.length).fill(null);
    if (!values.length) return out;
    const k = 2 / (period + 1);
    let value = values[0];
    out[0] = value;
    for (let index = 1; index < values.length; index += 1) {
      value = values[index] * k + value * (1 - k);
      out[index] = value;
    }
    return out;
  };
  const rolling = (values, period, projector) => values.map((_, index) => {
    if (index + 1 < period) return null;
    const window = values.slice(index + 1 - period, index + 1);
    return projector(window);
  });
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const ema8All = ema(closes, 8);
  const sma20All = rolling(closes, 20, mean);
  const std20All = rolling(closes, 20, values => {
    const avg = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
  });
  const upperAll = sma20All.map((value, index) => value == null ? null : value + 2 * std20All[index]);
  const lowerAll = sma20All.map((value, index) => value == null ? null : value - 2 * std20All[index]);
  const sma200All = rolling(closes, 200, mean);
  const start = Math.max(0, fullBars.length - maxBars);
  const bars = fullBars.slice(start);
  const ema8 = ema8All.slice(start);
  const upper = upperAll.slice(start);
  const lower = lowerAll.slice(start);
  const sma200 = sma200All.slice(start);

  const width = 640;
  const height = 320;
  const top = 18;
  const right = 58;
  const bottom = 24;
  const left = 12;
  const volumeH = 48;
  const volumeGap = 9;
  const plotW = width - left - right;
  const plotH = height - top - bottom - volumeH - volumeGap;
  const volumeTop = top + plotH + volumeGap;
  const indicatorValues = [...ema8, ...upper, ...lower, ...sma200].filter(value => finite(value) != null);
  const lows = [...bars.map(bar => Number(bar.l)), ...indicatorValues];
  const highs = [...bars.map(bar => Number(bar.h)), ...indicatorValues];
  let low = Math.min(...lows);
  let high = Math.max(...highs);
  if (high === low) { high += 1; low -= 1; }
  const pad = (high - low) * 0.06;
  high += pad;
  low -= pad;
  const y = value => top + ((high - value) / (high - low)) * plotH;
  const step = plotW / bars.length;
  const bodyW = Math.max(1, Math.min(6, step * 0.62));

  const grid = [0, 0.25, 0.5, 0.75, 1].map(part => {
    const gy = top + plotH * part;
    const price = high - (high - low) * part;
    return `<line x1="${left}" y1="${gy.toFixed(2)}" x2="${left + plotW}" y2="${gy.toFixed(2)}" stroke="#20252c" stroke-width="1"/><text x="${width - 5}" y="${(gy + 3).toFixed(2)}" fill="#929aa4" font-size="9" font-family="monospace" text-anchor="end">${price.toFixed(price < 10 ? 2 : 1)}</text>`;
  }).join('');

  const candles = bars.map((bar, index) => {
    const open = Number(bar.o);
    const close = Number(bar.c);
    const highY = y(Number(bar.h));
    const lowY = y(Number(bar.l));
    const openY = y(open);
    const closeY = y(close);
    const up = close >= open;
    const color = up ? '#58b77a' : '#e05a5a';
    const x = left + index * step + step / 2;
    const rectY = Math.min(openY, closeY);
    const rectH = Math.max(1, Math.abs(closeY - openY));
    return `<line x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1"/><rect x="${(x - bodyW / 2).toFixed(2)}" y="${rectY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${rectH.toFixed(2)}" fill="${color}"/>`;
  }).join('');

  const seriesPath = series => {
    let path = '';
    let drawing = false;
    series.forEach((value, index) => {
      if (finite(value) == null) { drawing = false; return; }
      const x = left + index * step + step / 2;
      path += `${drawing ? 'L' : 'M'}${x.toFixed(2)} ${y(Number(value)).toFixed(2)} `;
      drawing = true;
    });
    return path.trim();
  };
  const overlays = [
    { values: upper, color: '#68448b', width: 1 },
    { values: lower, color: '#68448b', width: 1 },
    { values: ema8, color: '#d0a53a', width: 1.35 },
    { values: sma200, color: '#d0a53a', width: 1.05, dash: '5 4' },
  ].map(series => {
    const path = seriesPath(series.values);
    return path ? `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="${series.width}"${series.dash ? ` stroke-dasharray="${series.dash}"` : ''} opacity="0.92"/>` : '';
  }).join('');

  const volumes = bars.map(bar => Math.max(0, finite(bar.v ?? bar.volume) ?? 0));
  const maxVolume = Math.max(...volumes, 1);
  const volumeBars = bars.map((bar, index) => {
    const value = volumes[index];
    const barH = value > 0 ? Math.max(1, (value / maxVolume) * volumeH) : 0;
    const x = left + index * step + step / 2;
    const color = Number(bar.c) >= Number(bar.o) ? '#316b4a' : '#73383b';
    return `<rect x="${(x - bodyW / 2).toFixed(2)}" y="${(volumeTop + volumeH - barH).toFixed(2)}" width="${bodyW.toFixed(2)}" height="${barH.toFixed(2)}" fill="${color}" opacity="0.8"/>`;
  }).join('');

  const last = bars[bars.length - 1];
  const lastClose = Number(last.c);
  const lastY = y(lastClose);
  const lastColor = lastClose >= Number(last.o) ? '#58b77a' : '#e05a5a';
  const lastLine = `<line x1="${left}" y1="${lastY.toFixed(2)}" x2="${left + plotW}" y2="${lastY.toFixed(2)}" stroke="${lastColor}" stroke-width="1" stroke-dasharray="3 4" opacity="0.65"/><text x="${width - 5}" y="${(lastY - 5).toFixed(2)}" fill="${lastColor}" font-size="10" font-weight="700" font-family="monospace" text-anchor="end">${lastClose.toFixed(lastClose < 10 ? 2 : 1)}</text>`;

  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ticker)} ${esc(tf)} candlestick chart"><rect width="${width}" height="${height}" fill="#090b0d"/>${grid}${overlays}${candles}${lastLine}<line x1="${left}" y1="${(volumeTop - 4).toFixed(2)}" x2="${left + plotW}" y2="${(volumeTop - 4).toFixed(2)}" stroke="#20252c" stroke-width="1"/>${volumeBars}<text x="${left}" y="${height - 6}" fill="#929aa4" font-size="9" font-family="monospace">${bars.length} bars · ${esc(tf)}${tf === '2m' ? ' · DELAYED' : ''}</text></svg>`;
}

function updateThemeChartSelection() {
  document.querySelectorAll('[data-theme-chart-tf]').forEach(button => {
    button.classList.toggle('active', button.dataset.themeChartTf === state.themeChartTf);
  });
  document.querySelectorAll('#themeOverviewBody [data-ticker]').forEach(button => {
    button.classList.toggle('chart-selected', button.dataset.ticker === state.themeChartTicker);
  });
}

async function loadThemeChart(ticker, tf) {
  const host = document.getElementById('themeChartHost');
  const note = document.getElementById('themeChartNote');
  if (!host || !note) return;
  const request = ++state.chartRequest;
  host.innerHTML = '<div class="loading-card" style="width:100%;height:280px">Loading chart…</div>';
  note.textContent = tf === '2m'
    ? 'Delayed 2-minute evidence — execution stays on DAS.'
    : tf === '10m'
      ? '10-minute context.'
      : tf === '1h'
        ? 'Hourly context.'
        : 'Daily context.';
  updateThemeChartSelection();
  try {
    const bars = await fetchChart(ticker, tf);
    if (request !== state.chartRequest || !state.selectedTheme) return;
    renderCandles(bars, tf, host, ticker);
    if (tf === 'D') renderThemeSelectedMetrics(ticker, volumeStatsFromDailyBars(bars));
  } catch (error) {
    if (request !== state.chartRequest || !state.selectedTheme) return;
    host.innerHTML = `<div class="error-state">${esc(error.message || 'Chart unavailable.')}</div>`;
  }
}

function selectThemeChartTicker(ticker) {
  if (!state.selectedTheme) return;
  state.themeChartTicker = ticker;
  const title = document.getElementById('themeChartTicker');
  if (title) title.textContent = ticker;
  updateThemeChartSelection();
  renderThemeSelectedMetrics(ticker, null);
  if (state.themeChartTf !== 'D') loadThemeDailyVolumeMetrics(ticker);
  loadThemeChart(ticker, state.themeChartTf);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 4200);
}

document.addEventListener('click', event => {
  const askEdgarButton = event.target.closest('[data-ask-edgar], [data-ask-edgar-retry]');
  if (askEdgarButton && state.selected?.category === 'SC') {
    loadDilutionProfile(state.selected.ticker, { force: askEdgarButton.hasAttribute('data-ask-edgar-retry') });
    return;
  }

  const themeChartButton = event.target.closest('[data-theme-chart-tf]');
  if (themeChartButton && state.selectedTheme && state.themeChartTicker) {
    state.themeChartTf = themeChartButton.dataset.themeChartTf;
    updateThemeChartSelection();
    loadThemeChart(state.themeChartTicker, state.themeChartTf);
    return;
  }

  const tickerButton = event.target.closest('[data-ticker]');
  if (tickerButton) {
    if (state.selectedTheme) selectThemeChartTicker(tickerButton.dataset.ticker);
    else openDetail(tickerButton.dataset.ticker);
    return;
  }

  const themeButton = event.target.closest('[data-theme-name]');
  if (themeButton) { openThemeOverview(themeButton.dataset.themeName); return; }

  const themeCard = event.target.closest('[data-theme-card]');
  if (themeCard) { openThemeOverview(themeCard.dataset.themeCard); return; }

  const viewButton = event.target.closest('[data-view], [data-switch-view]');
  if (viewButton) { switchView(viewButton.dataset.view || viewButton.dataset.switchView); return; }

  const chartButton = event.target.closest('[data-chart-tf]');
  if (chartButton && state.selected) {
    state.chartTf = chartButton.dataset.chartTf;
    updateChartTabs();
    loadChart(state.selected.ticker, state.chartTf);
  }
});

els.scToggle.addEventListener('click', () => { state.scExpanded = !state.scExpanded; renderBook('SC'); });
els.mlToggle.addEventListener('click', () => { state.mlExpanded = !state.mlExpanded; renderBook('ML'); });
els.discoveryToggle.addEventListener('click', () => { state.discoveryExpanded = !state.discoveryExpanded; renderDiscovery(); });
els.refreshButton.addEventListener('click', () => loadAll());
els.detailClose.addEventListener('click', closeDetail);
els.detailBackdrop.addEventListener('click', closeDetail);
els.themeOverviewClose.addEventListener('click', closeThemeOverview);
els.detailBackdrop.addEventListener('click', closeThemeOverview);
document.addEventListener('keydown', event => {
  const themeCard = event.target.closest?.('[data-theme-card]');
  if (themeCard && event.target === themeCard && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openThemeOverview(themeCard.dataset.themeCard);
    return;
  }
  if (event.key === 'Escape' && state.selectedTheme) closeThemeOverview();
  if (event.key === 'Escape' && state.selected) closeDetail();
  if ((event.key === '1' || event.key === '2' || event.key === '3') && !state.selected && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    switchView(event.key === '1' ? 'now' : event.key === '2' ? 'themes' : 'breadth');
  }
});

loadAll();
setInterval(() => {
  if (document.visibilityState === 'visible') loadAll({ quiet: true });
}, 120000);
