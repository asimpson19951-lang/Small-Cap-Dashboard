import { metricGenerationFreshness } from './evidence-freshness.mjs?v=V2.11.39';
import { compareByExtension } from './extension-rank.mjs?v=V2.11.39';
import { activeRegistryTickers, attentionCoverage, reconcileAttentionCoverage, selectAttentionLane } from './theme-attention-coverage.mjs?v=V2.11.39';
import { buildThemeBox, orderThemeBoxes, renderThemeHeatBoard } from './theme-board.mjs?v=V2.11.39';
import { buildThemeCatalystCompactCoverage, buildThemeCatalystMemberCoverage, buildThemeCatalystSessionChronology, buildThemeCatalystSessions, buildThemeCatalystTape } from './theme-catalyst-tape.mjs?v=V2.11.39';
import { buildThemeStageReceipt } from './theme-stage-receipt.mjs?v=V2.11.39';

const SUPABASE_URL = 'https://wexnybuijhklmvwncdin.supabase.co';
// Public browser credential. The project RLS contract limits it to read-only surfaces.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG55YnVpamhrbG12d25jZGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjQ5NzEsImV4cCI6MjA5MTQ0MDk3MX0.EYsozs5hxPeskYknXYkXr4mxnSLcjr513vEVr5V9pLI';
const SCANNER_TYPES = {
  gap_sc: { category: 'SC', label: 'SC MOVERS', detail: 'SMALL-CAP MOVER' },
  fade_sc: { category: 'SC', label: 'SC DOWNSIDE', detail: 'SMALL-CAP DOWNSIDE' },
  gap_ml: { category: 'ML', label: 'MID / LARGE MOVERS', detail: 'MID / LARGE MOVER' },
  build_ml: { category: 'ML', label: 'MID / LARGE BUILDS', detail: 'MID / LARGE BUILD' },
  gap_unk: { category: null, label: 'CLASS UNVERIFIED', detail: 'UNCLASSIFIED MOVER' },
};
const SCANNER_STALE_AFTER_MS = 20 * 60_000;
// One vocabulary for a data lane wherever its state is surfaced: the stale
// overlay, the freshness pill, and the load toast.
const LANE_LABELS = {
  market: 'MARKET DATA',
  filings: 'FILING EVIDENCE',
  news: 'NEWS CONTEXT',
  scans: 'SCANNER',
  metricSnapshot: 'DAILY METRICS',
  themes: 'THEME ENGINE',
  themeRegistry: 'THEME REGISTRY',
  themeDossiers: 'CROWD DOSSIERS',
  themeAttentionLive: 'LIVE ATTENTION',
  themeAttention: 'ATTENTION ARCHIVE',
  themeAttentionLiveCoverage: 'LIVE ATTENTION COVERAGE',
  themeAttentionCoverage: 'ATTENTION COVERAGE',
  themeCuration: 'CURATION LOG',
  themeChartReads: 'CHART DESK',
  themeReviews: 'SECOND OPINION',
  breadthSnapshot: 'REGIME SNAPSHOT',
  predictionSnapshot: 'EVENT ODDS',
};

const state = {
  market: [],
  themes: [],
  themeRegistry: [],
  themeDossiers: [],
  themeDossierMeta: null,
  themeAttentionLive: null,
  themeAttention: null,
  themeCuration: null,
  themeChartReads: [],
  themeReviews: [],
  filings: [],
  news: [],
  scans: [],
  metricSnapshot: null,
  metricSnapshotFreshness: null,
  breadthSnapshot: null,
  predictionSnapshot: null,
  scannerAvailable: null,
  scExpanded: true,
  mlExpanded: true,
  discoveryExpanded: false,
  selected: null,
  currentView: 'now',
  selectedTheme: null,
  themeChartTicker: null,
  themeChartTf: '2m',
  themePageTheme: null,
  themePageTicker: null,
  themePageChartTf: '2m',
  themePageChartRequest: 0,
  themeMetricRequest: 0,
  themeCatalystRequest: 0,
  themeCatalystDetail: new Map(),
  dilutionRequest: 0,
  chartTf: null,
  chartRequest: 0,
  laneStatus: {},
  regimeChartTicker: null,
  regimeChartReturnTicker: null,
  chartViews: new WeakMap(),
  loadedOnce: false,
  loading: false,
  lastLoadAt: null,
  lastFailures: [],
  viewScroll: {},
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
  nowView: document.getElementById('view-now'),
  themesView: document.getElementById('view-themes'),
  breadthView: document.getElementById('view-breadth'),
  nowBriefing: document.getElementById('nowBriefing'),
  askEdgarButton: document.querySelector('[data-ask-edgar]'),
  themePageTitle: document.getElementById('themePageTitle'),
  themePageSummary: document.getElementById('themePageSummary'),
  themePageChartTitle: document.getElementById('themePageChartTitle'),
  themePageChartNote: document.getElementById('themePageChartNote'),
  themePageChartHost: document.getElementById('themePageChartHost'),
  breadthAsOf: document.getElementById('breadthAsOf'),
  breadthSurface: document.getElementById('breadthSurface'),
  themeOverview: document.getElementById('themeOverview'),
  themeOverviewClose: document.getElementById('themeOverviewClose'),
  themeOverviewTitle: document.getElementById('themeOverviewTitle'),
  themeOverviewMeta: document.getElementById('themeOverviewMeta'),
  themeOverviewBody: document.getElementById('themeOverviewBody'),
  detailBackdrop: document.getElementById('detailBackdrop'),
  regimeChartModal: document.getElementById('regimeChartModal'),
  regimeChartTitle: document.getElementById('regimeChartTitle'),
  regimeChartHost: document.getElementById('regimeChartHost'),
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

async function restGetCounted(table, params = {}, metadata = {}) {
  const response = await fetch(tableUrl(table, params), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) throw new Error(`${table} unavailable (${response.status})`);
  const rows = await response.json();
  const range = response.headers.get('content-range') || '';
  const totalText = range.split('/')[1];
  const total = totalText && totalText !== '*' && Number.isFinite(Number(totalText)) ? Number(totalText) : null;
  return {
    rows,
    total,
    returned: rows.length,
    capped: total != null && total > rows.length,
    ...metadata,
  };
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

function laneLabel(key) {
  return LANE_LABELS[key] || String(key).toUpperCase();
}

function hasLaneValue(key) {
  if (key === 'breadthSnapshot') return state.breadthSnapshot != null;
  if (key === 'predictionSnapshot') return state.predictionSnapshot != null;
  if (key === 'metricSnapshot') return state.metricSnapshot != null;
  if (key === 'themeAttentionLive' || key === 'themeAttention' || key === 'themeCuration') return Array.isArray(state[key]?.rows);
  return Array.isArray(state[key]) && state[key].length > 0;
}

function validLanePayload(key, value) {
  if (key === 'market') {
    return Array.isArray(value) && value.length > 0 && value.every(row =>
      row && typeof row === 'object' && typeof row.ticker === 'string' &&
      (row.category === 'SC' || row.category === 'ML' || row.category == null));
  }
  if (key === 'themes') {
    return Array.isArray(value) && value.length > 0 && value.every(row =>
      row && typeof row === 'object' && typeof row.name === 'string');
  }
  if (key === 'filings' || key === 'news' || key === 'scans' ||
      key === 'themeRegistry' ||
      key === 'themeChartReads' || key === 'themeReviews') {
    return Array.isArray(value) && value.every(row => row && typeof row === 'object');
  }
  if (key === 'themeDossiers' || key === 'themeAttentionLive' || key === 'themeAttention' || key === 'themeCuration') {
    return value && Array.isArray(value.rows) && value.rows.every(row => row && typeof row === 'object');
  }
  if (key === 'breadthSnapshot') {
    return value != null && typeof value === 'object' && Array.isArray(value?.breadth?.rows) && value.breadth.rows.length > 0;
  }
  if (key === 'predictionSnapshot') {
    return value != null && typeof value === 'object' && Array.isArray(value?.topics) && value.topics.length > 0;
  }
  if (key === 'metricSnapshot') {
    return value?.ok === true && Array.isArray(value?.rows) && value.rows.length > 0;
  }
  return false;
}

// One cycle in flight at a time. The scheduled timer, the refresh button, a
// tab becoming visible, and the network coming back can all ask for a cycle;
// overlapping cycles would race each other's lane writes.
async function loadAll(options = {}) {
  if (state.loading) return;
  state.loading = true;
  try {
    await loadAllLanes(options);
  } finally {
    state.loading = false;
    state.lastLoadAt = Date.now();
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = '↻';
    els.refreshButton.title = `Refresh data · last cycle ${fmtDate(state.lastLoadAt, true)} ET`;
  }
}

async function loadAllLanes({ quiet = false } = {}) {
  const firstLoad = !state.loadedOnce;
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = '…';
  if (!quiet) setFreshness('loading', 'Refreshing read-only data…');

  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const themeEvidenceSince = new Date(Date.now() - 7 * 86400000).toISOString();
  const themeAttentionLiveSince = new Date(Date.now() - 2 * 3600000).toISOString();
  const themeDossierSince = new Date(Date.now() - 30 * 86400000).toISOString();
  const themeCurationSince = new Date(Date.now() - 180 * 86400000).toISOString();
  const requests = {
    market: restGet('market_data', { select: '*' }),
    themes: restGet('themes', { select: '*' }),
    themeRegistry: restGet('theme_registry', { select: '*', order: 'name.asc' }),
    themeDossiers: restGetCounted('theme_dossiers', {
      select: 'id,theme,at,kind,story,evidence,provenance',
      at: `gte.${themeDossierSince}`,
      order: 'at.desc',
      limit: '1200',
    }, { windowDays: 30, limit: 1200 }),
    themeAttentionLive: restGetCounted('attention_snapshots', {
      select: 'source,ticker,captured_at,msg_count,window_minutes,trending_rank,velocity_multiple',
      captured_at: `gte.${themeAttentionLiveSince}`,
      order: 'captured_at.desc',
      limit: '1000',
    }, { windowHours: 2, limit: 1000 }),
    themeAttention: restGetCounted('attention_snapshots', {
      select: 'source,ticker,captured_at,msg_count,window_minutes,trending_rank,velocity_multiple',
      captured_at: `gte.${themeEvidenceSince}`,
      order: 'captured_at.desc',
      limit: '1000',
    }, { windowDays: 7, limit: 1000 }),
    themeCuration: restGetCounted('theme_curation_log', {
      select: 'id,at,actor,action,theme,ticker,applied',
      at: `gte.${themeCurationSince}`,
      order: 'at.desc',
      limit: '400',
    }, { windowDays: 180, limit: 400 }),
    themeChartReads: restGet('theme_chart_reads', {
      select: 'id,theme,read_at,slot,census_stage,chart_read,agrees,why,watch_for,leader',
      read_at: `gte.${themeEvidenceSince}`,
      order: 'read_at.desc',
      limit: '400',
    }),
    themeReviews: restGet('openclaw_reviews', {
      select: 'id,review_date,at,subject,verdict,evidence,source',
      at: `gte.${themeEvidenceSince}`,
      order: 'at.desc',
      limit: '400',
    }),
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
      if (!validLanePayload(key, result.value)) {
        failures.push(key);
        const hasPrior = hasLaneValue(key);
        state.laneStatus[key] = { status: hasPrior ? 'stale' : 'unavailable', observedAt: state.laneStatus[key]?.observedAt || null };
        if (key === 'scans') state.scannerAvailable = hasPrior;
        return;
      }
      state.laneStatus[key] = { status: 'fresh', observedAt: Date.now() };
      if (key === 'breadthSnapshot') state.breadthSnapshot = result.value;
      else if (key === 'predictionSnapshot') state.predictionSnapshot = result.value;
      else if (key === 'metricSnapshot') state.metricSnapshot = result.value;
      else if (key === 'themeDossiers') {
        state.themeDossiers = result.value.rows;
        state.themeDossierMeta = result.value;
      } else {
        state[key] = result.value;
        if (key === 'scans') state.scannerAvailable = true;
      }
    } else {
      failures.push(key);
      const hasPrior = hasLaneValue(key);
      state.laneStatus[key] = { status: hasPrior ? 'stale' : 'unavailable', observedAt: state.laneStatus[key]?.observedAt || null };
      if (key === 'scans') {
        state.scannerAvailable = hasPrior ? true : false;
      }
    }
  });

  if (state.laneStatus.themeRegistry?.status === 'fresh') {
    const attentionLanes = [
      { key: 'themeAttentionLive', since: themeAttentionLiveSince, metadata: { windowHours: 2, limit: 1000 } },
      { key: 'themeAttention', since: themeEvidenceSince, metadata: { windowDays: 7, limit: 1000 } },
    ];
    for (const lane of attentionLanes) {
      if (!state[lane.key]) continue;
      try {
        state[lane.key] = await reconcileAttentionCoverage(
          state[lane.key],
          state.themeRegistry,
          tickers => restGetCounted('attention_snapshots', {
            select: 'source,ticker,captured_at,msg_count,window_minutes,trending_rank,velocity_multiple',
            captured_at: `gte.${lane.since}`,
            ticker: `in.(${tickers.join(',')})`,
            order: 'captured_at.desc',
            limit: '1000',
          }, lane.metadata),
        );
      } catch {
        const registryTickers = activeRegistryTickers(state.themeRegistry);
        const coverage = attentionCoverage(state[lane.key].rows, registryTickers);
        state[lane.key] = {
          ...state[lane.key],
          registryTotal: coverage.total,
          registryObserved: coverage.observed,
          registryRateKnown: coverage.rateKnown,
          registryConfirmedAbsent: [],
          registryUnresolved: coverage.missing,
          coverageComplete: false,
          coverageError: true,
          recoveryQueries: 0,
          requestCount: 1,
        };
        failures.push(`${lane.key}Coverage`);
      }
    }
  }

  if (!state.market.length) {
    renderFatalBookError('Market rows are unavailable. The prototype will not infer or reuse stale values.');
    setFreshness('failed', 'Market data unavailable');
  } else {
    applyMetricSnapshot();
    renderAll();
    renderStaleState();
    updateFreshness(failures);
  }

  state.loadedOnce = true;
  state.lastFailures = failures;
  if (firstLoad && state.market.length) writeDashboardHistory({ replace: true });

  if (failures.length) showToast(`Loaded with ${failures.map(laneLabel).join(', ')} unavailable.`);
}

function renderStaleState() {
  document.querySelectorAll('[data-stale-keys]').forEach(section => {
    const keys = String(section.dataset.staleKeys || '').split(/\s+/).filter(Boolean);
    const failed = keys.filter(key => ['stale', 'unavailable'].includes(state.laneStatus[key]?.status));
    let overlay = section.querySelector(':scope > .section-stale-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'section-stale-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = '<span></span>';
      section.append(overlay);
    }
    const summary = section.matches('details') ? section.querySelector(':scope > summary') : null;
    let flag = summary?.querySelector(':scope > .section-stale-flag') || null;
    if (summary && !flag) {
      flag = document.createElement('span');
      flag.className = 'section-stale-flag';
      flag.setAttribute('role', 'status');
      summary.append(flag);
    }
    section.classList.toggle('section-stale', failed.length > 0);
    overlay.hidden = failed.length === 0;
    const message = failed.length
      ? `LAST VERIFIED DATA · ${failed.map(laneLabel).join(' + ')} NOT UPDATING`
      : '';
    overlay.querySelector('span').textContent = message;
    if (flag) {
      flag.hidden = failed.length === 0;
      flag.textContent = message;
    }
  });
}

function applyMetricSnapshot() {
  const freshness = metricGenerationFreshness(state.metricSnapshot, state.market);
  state.metricSnapshotFreshness = freshness;
  if (!freshness.usable) {
    state.laneStatus.metricSnapshot = {
      status: 'stale',
      observedAt: state.laneStatus.metricSnapshot?.observedAt || null,
    };
  }
  const rows = freshness.rows;
  const byTicker = new Map(rows.map(row => [String(row?.ticker || '').toUpperCase(), row]));
  state.market = state.market.map(row => {
    const shadow = byTicker.get(String(row?.ticker || '').toUpperCase()) || null;
    const liveDCount = finite(row?.d_count);
    const dCount = row?.d_count_lower_bound !== true
      && liveDCount != null
      && Number.isInteger(liveDCount)
      && liveDCount >= 0
      ? liveDCount
      : null;
    const completedBandSide = ['UPPER', 'LOWER', 'IN_BAND'].includes(String(shadow?.metrics?.bb_side || ''))
      ? shadow.metrics.bb_side
      : null;
    const completedBandConsecutive = finite(shadow?.metrics?.bb_consecutive);
    const completedBandPosition = finite(shadow?.metrics?.bb_position_pct);
    return {
      ...row,
      d_count: dCount,
      d_count_as_of: dCount != null ? row?.d_count_as_of || null : null,
      d_count_completed_through: dCount != null ? row?.d_count_completed_through || null : null,
      d_count_provisional: dCount != null && row?.d_count_provisional === true,
      bb_completed_side: completedBandSide,
      bb_completed_consec: completedBandConsecutive != null && Number.isInteger(completedBandConsecutive) && completedBandConsecutive >= 0
        ? completedBandConsecutive
        : null,
      bb_completed_position: completedBandPosition,
      bb_completed_as_of: completedBandSide ? shadow?.completed_through || shadow?.session_date || null : null,
      metric_shadow: shadow,
    };
  });
}

// Books rank by extension (Austin, Aug 30 2026): the larger of |CHANGE| and |8EMA|,
// lifted by completed closes outside the band and by relative volume. Unknown stays
// neutral; D-count and theme are context, not rank. See ./extension-rank.mjs.
function watchedRows(category) {
  return state.market
    .filter(row => row && row.watch !== false && row.category === category)
    .sort(compareByExtension);
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

function issuerIdentityDisplay(field) {
  const description = typeof field?.description === 'string' ? field.description.trim() : '';
  const code = typeof field?.code === 'string' ? field.code.trim() : '';
  if (!description && !code) return { value: 'NOT STATED', detail: 'The SEC submissions payload did not state this field.' };
  return {
    value: description || code,
    detail: code && description ? `SEC code ${code}` : code ? 'SEC code only; description not stated.' : 'SEC description; code not stated.',
  };
}

function renderIssuerIdentity(profile) {
  const evidence = profile?.issuer_identity || null;
  if (!evidence) return `<section class="dilution-block"><div class="dilution-block-title">ISSUER IDENTITY · SEC FACTS</div><div class="empty-copy">Identity fields are unavailable from this profile version.</div></section>`;

  const identity = evidence.identity || {};
  const business = issuerIdentityDisplay(identity.sec_business_address);
  const incorporation = issuerIdentityDisplay(identity.incorporation);
  const former = identity.former_names || {};
  const formerCount = finite(former.count);
  const formerList = Array.isArray(former.list) ? former.list.filter(item => typeof item === 'string' && item.trim()) : [];
  const formerValue = formerCount == null ? 'NOT STATED' : formerCount === 0 ? 'NONE OBSERVED' : `${Math.trunc(formerCount)} OBSERVED`;
  const formerDetail = formerCount == null
    ? 'The SEC submissions payload did not provide a formerNames array.'
    : formerList.length ? formerList.join(' · ') : 'No former names were listed in the fetched SEC submissions payload.';
  const coverageState = String(evidence?.coverage?.state || 'COVERAGE UNKNOWN');
  const sourceUrl = /^https:\/\//i.test(evidence?.provenance?.source_url || '') ? evidence.provenance.source_url : null;
  const sourceLabel = [
    evidence?.provenance?.cik ? `CIK ${evidence.provenance.cik}` : 'CIK UNKNOWN',
    coverageState.replaceAll('_', ' '),
    evidence?.provenance?.observed_at ? `OBSERVED ${fmtDate(evidence.provenance.observed_at, true)}` : 'OBSERVED TIME UNKNOWN',
  ].join(' · ');

  return `<section class="dilution-block"><div class="dilution-block-title">ISSUER IDENTITY · SEC FACTS</div>
    <div class="dilution-capacity-grid issuer-identity-grid">
      ${dilutionCard('SEC BUSINESS ADDRESS', business.value, business.detail)}
      ${dilutionCard('INCORPORATION', incorporation.value, incorporation.detail)}
      ${dilutionCard('FORMER NAMES', formerValue, formerDetail)}
    </div>
    <div class="dilution-source">${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceLabel)} · SEC SOURCE ↗</a>` : esc(sourceLabel)} · EXACT SEC FIELDS · NO IDENTITY INFERENCE</div>
  </section>`;
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
    ${renderIssuerIdentity(profile)}
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
    .trim();
}

function latestFilingFact(row) {
  const filings = filingsFor(row.ticker);
  const latest = filings.find(filing =>
    filing?.lifecycle_state === 'ACTIVE_CAPACITY' || isRecentTakedownEvidence(filing));
  if (latest?.lifecycle_state === 'ACTIVE_CAPACITY') return { label: 'ACTIVE CAP', risk: true };
  if (latest) return { label: 'TAKEDOWN', risk: true };
  return null;
}

function isRecentTakedownEvidence(filing, nowMs = Date.now()) {
  if (filing?.lifecycle_state !== 'TAKEDOWN') return false;
  if (filing?.filing_type !== '424B5' && filing?.filing_type !== 'ATM') return false;
  const observedMs = Date.parse(filing.detected_at || filing.filed_at || '');
  const ageMs = nowMs - observedMs;
  return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= 7 * 86400_000;
}

function bbLabel(row) {
  return bbAtGlanceLabel(row) || '—';
}

function bbOutsideLabel(row) {
  const side = String(row?.bb_completed_side || '');
  const days = finite(row?.bb_completed_consec);
  if (days == null || days < 1) return '';
  if (side === 'UPPER') return `UBB ${Math.trunc(days)}d`;
  if (side === 'LOWER') return `LBB ${Math.trunc(days)}d`;
  return '';
}

function bbTouchLabel(row) {
  const touch = String(row?.bb_touch || '').toUpperCase();
  if (touch === 'UBB' || touch === 'LBB') return `TOUCH ${touch}`;
  return '';
}

function bbAtGlanceLabel(row) {
  return bbOutsideLabel(row) || bbTouchLabel(row);
}

function breadthLabel(value) {
  if (typeof value === 'string' && /^\d+\s*\/\s*\d+$/.test(value.trim())) return value.replace(/\s+/g, '');
  const breadth = finite(value);
  return breadth == null ? '—' : `${breadth.toFixed(0)}%`;
}

function runLabel(row) {
  const days = finite(row?.d_count);
  if (days == null) return 'D—';
  return `D${Math.max(0, Math.trunc(days))}${row?.d_count_provisional === true ? '*' : ''}`;
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

function admissibleFloatRotation(row) {
  const source = String(row?.float_source || '').toUpperCase();
  const rotation = finite(row?.float_rot);
  const asOf = Date.parse(row?.float_as_of || '');
  if (!['MASSIVE_FREE_FLOAT', 'MANUAL'].includes(source)) return null;
  if (rotation == null || rotation < 0 || !Number.isFinite(asOf)) return null;
  return { value: rotation, asOf: row.float_as_of, source };
}

function rowTrailingMetric(row) {
  const period = row.category === 'SC' ? 50 : 200;
  const value = row.category === 'SC' ? row.ema50_dist_pct : row.ema200_dist_pct;
  return {
    value: fmtSigned(value),
    className: 'row-class-ema ma-text',
    title: `Distance from daily ${period}EMA`,
  };
}

function renderRow(row) {
  const context = rowContext(row);
  const filing = latestFilingFact(row);
  const band = bbAtGlanceLabel(row);
  const trailing = rowTrailingMetric(row);
  const rotation = row.category === 'SC' ? admissibleFloatRotation(row) : null;
  const contextHtml = [
    context.theme ? `<span class="theme-name">${esc(context.theme)}</span>` : '',
    context.why ? esc(context.why) : '',
  ].filter(Boolean).join(' · ');
  const filingHtml = row.category === 'SC' && filing
    ? `<span class="supply-badge ${filing.risk ? 'risk' : 'clear'}">${esc(filing.label)}</span>`
    : '';

  return `
    <button class="radar-row${state.selected?.ticker === row.ticker ? ' selected' : ''}" type="button" data-ticker="${esc(row.ticker)}" data-book="${esc(row.category)}"${state.selected?.ticker === row.ticker ? ' aria-current="true"' : ''}>
      <span class="name-cell">
        <span class="ticker-line"><span class="ticker">${esc(row.ticker)}</span>${filingHtml}</span>
        ${contextHtml ? `<span class="context-line">${contextHtml}</span>` : ''}
      </span>
      <span class="row-price price">${fmtPrice(row.price)}</span>
      <span class="move-value ${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span>
      <span class="row-dcount d-count">${esc(runLabel(row))}</span>
      <span class="row-bb">${band ? `<span class="bb-badge">${esc(band)}</span>` : '<span class="quiet-value">—</span>'}</span>
      <span class="row-ema ma-text">${fmtSigned(row.ema8_dist)}</span>
      <span class="${esc(trailing.className)}" title="${esc(trailing.title)}">${esc(trailing.value)}</span>
      ${row.category === 'SC' ? `<span class="${rotation ? 'row-frot' : 'row-frot unknown'}" title="${esc(rotation ? `Float source ${rotation.source}; effective ${fmtDate(rotation.asOf)}` : 'No admissible float rotation')}">${esc(rotation ? `${fmtNumber(rotation.value)}×` : '—')}</span>` : ''}
    </button>`;
}

function renderBook(category) {
  const rows = watchedRows(category);
  const isSC = category === 'SC';
  const host = isSC ? els.scRows : els.mlRows;
  const count = isSC ? els.scCount : els.mlCount;
  const toggle = isSC ? els.scToggle : els.mlToggle;

  count.textContent = `${rows.length}`;
  count.title = `${rows.length} verified watched names · all shown · ranked by extension`;
  count.setAttribute('aria-label', count.title);
  toggle.hidden = true;
  host.innerHTML = rows.length
    ? rows.map(renderRow).join('')
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
    <button class="discovery-row${state.selected?.ticker === scan.ticker ? ' selected' : ''}" type="button" data-ticker="${esc(scan.ticker)}"${state.selected?.ticker === scan.ticker ? ' aria-current="true"' : ''}>
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

function themeTimelineEntries(theme) {
  const tape = Array.isArray(theme?.deep?.tape) ? theme.deep.tape : [];
  return tape.map((entry, index) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.d || '')) ? String(entry.d) : null;
    const move = finite(entry?.chg ?? entry?.m);
    const tier = finite(entry?.tier);
    return { date, move, tier, index };
  }).filter(entry => entry.date || entry.move != null || entry.tier != null)
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.date !== b.date) return a.date ? -1 : 1;
      return a.index - b.index;
    });
}

function renderThemeTimeline(theme) {
  const entries = themeTimelineEntries(theme);
  if (!entries.length) return '<section class="theme-history-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">TAPE TIMELINE</div><h3>Completed-session history</h3></div></div><div class="empty-copy">No completed theme tape history is available.</div></section>';
  return `<section class="theme-history-panel">
    <div class="theme-panel-head"><div><div class="theme-overview-label">TAPE TIMELINE</div><h3>Completed-session history</h3></div><span>${entries.length} ${entries.length === 1 ? 'SESSION' : 'SESSIONS'}</span></div>
    <div class="theme-history-table" role="table" aria-label="${esc(theme.name)} completed-session tape timeline">
      <div class="theme-history-head" role="row"><span role="columnheader">DATE</span><span role="columnheader">MOVE</span><span role="columnheader">TIER</span></div>
      ${entries.map(entry => `<div class="theme-history-row" role="row"><time role="cell"${entry.date ? ` datetime="${esc(entry.date)}"` : ''}>${esc(entry.date || 'DATE UNKNOWN')}</time><strong role="cell" class="${moveClass(entry.move)}">${fmtSigned(entry.move)}</strong><span role="cell">${entry.tier == null ? '—' : `TIER ${esc(entry.tier)}`}</span></div>`).join('')}
    </div>
  </section>`;
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

function themeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function themeRegistryRow(name) {
  return state.themeRegistry.find(row => row?.name === name) || null;
}

function themeDossierRows(name) {
  return state.themeDossiers.filter(row => row?.theme === name);
}

function themeChartRead(name) {
  return state.themeChartReads.find(row => row?.theme === name) || null;
}

function themeSecondOpinion(name) {
  const subject = `theme:${themeSlug(name)}`;
  return state.themeReviews.find(row => String(row?.subject || '').toLowerCase() === subject) || null;
}

function evidenceBackend(row) {
  const backend = cleanThemeContextText(row?.provenance?.backend);
  const model = cleanThemeContextText(row?.provenance?.model);
  return backend || model || null;
}

function evidenceReceipt(source, at, tapeAt) {
  const observed = Date.parse(at || '');
  const tape = Date.parse(tapeAt || '');
  const age = Number.isFinite(observed) ? relativeTime(observed) : 'time unknown';
  if (!Number.isFinite(observed) || !Number.isFinite(tape)) return [source, age].filter(Boolean).join(' · ');
  const lagMinutes = Math.round((tape - observed) / 60000);
  if (lagMinutes <= 15) return `${source} · ${age} · current with tape`;
  if (lagMinutes < 60) return `${source} · ${age} · ${lagMinutes}m older than tape`;
  if (lagMinutes < 1440) return `${source} · ${age} · ${Math.round(lagMinutes / 60)}h older than tape`;
  return `${source} · ${age} · ${Math.round(lagMinutes / 1440)}d older than tape`;
}

function themeEvidence(theme) {
  const dossiers = themeDossierRows(theme?.name);
  const latestDossier = dossiers[0] || null;
  const latestRead = themeChartRead(theme?.name);
  const latestReview = themeSecondOpinion(theme?.name);
  const registry = themeRegistryRow(theme?.name);
  return {
    dossiers,
    latestDossier,
    latestRead,
    latestReview,
    registry,
    receipts: {
      dossier: latestDossier ? evidenceReceipt(
        [String(latestDossier.kind || 'story').replaceAll('_', ' ').toUpperCase(), evidenceBackend(latestDossier)?.toUpperCase()].filter(Boolean).join(' · '),
        latestDossier.at,
        theme?.updated_at,
      ) : null,
      chart: latestRead ? evidenceReceipt(`CHART DESK · ${String(latestRead.slot || 'read').toUpperCase()}`, latestRead.read_at, theme?.updated_at) : null,
      review: latestReview ? evidenceReceipt(`SECOND OPINION · ${String(latestReview.source || 'openclaw').toUpperCase()}`, latestReview.at, theme?.updated_at) : null,
    },
  };
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
  const registry = themeRegistryRow(theme?.name);
  const scSet = new Set((Array.isArray(theme.sc_vehicles) ? theme.sc_vehicles : []).map(constituentTicker).map(ticker => ticker.toUpperCase()));
  const provisional = registry?.provisional_members && typeof registry.provisional_members === 'object' && !Array.isArray(registry.provisional_members)
    ? registry.provisional_members
    : {};
  const tickers = [...new Set([
    ...(Array.isArray(registry?.constituents) ? registry.constituents : []),
    ...(Array.isArray(theme.constituents) ? theme.constituents : []).map(constituentTicker),
    ...scSet,
  ].map(ticker => String(ticker || '').toUpperCase()).filter(Boolean))];
  return tickers.map(ticker => {
    const row = state.market.find(item => String(item.ticker || '').toUpperCase() === ticker);
    const category = row?.category || (scSet.has(ticker) ? 'SC' : null);
    return {
      ticker,
      row,
      category,
      isVehicle: category === 'SC' || scSet.has(ticker),
      provisional: Object.prototype.hasOwnProperty.call(provisional, ticker),
      provisionalEvidence: provisional[ticker] || null,
    };
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
    const roleClass = member.category === 'SC' ? 'vehicle' : member.category === 'ML' ? 'structure' : 'class-unknown';
    const roleLabel = member.category === 'SC' ? 'SC vehicle' : member.category === 'ML' ? 'ML structure' : 'class unknown';
    return `<button class="heat-tile ${heatTone(move)} ${roleClass} ${member.provisional ? 'seat-review' : ''}" style="${detailed ? `--tile-square:${size}` : `--tile-span:${size}`}" type="button" data-ticker="${esc(member.ticker)}" title="${esc(member.ticker)} · ${roleLabel}${member.provisional ? ' · provisional seat' : ''} · ${fmtSigned(move)}">
      <strong>${esc(member.ticker)}</strong><span>${fmtSigned(move)}</span>${detailed ? `<small class="structure-metrics"><span>${esc(run)}</span>${band ? `<span class="bb-metric-text">${esc(band)}</span>` : ''}</small><small>${cap == null ? 'CAP —' : fmtCompact(cap)} · ${member.isVehicle ? 'SC VEHICLE' : member.category === 'ML' ? 'ML STRUCTURE' : 'CLASS —'}${member.provisional ? ' · SEAT REVIEW' : ''}</small>` : ''}
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
    const roleClass = member.category === 'SC' ? 'vehicle' : member.category === 'ML' ? 'structure' : 'class-unknown';
    const roleLabel = member.category === 'SC' ? 'SC vehicle' : member.category === 'ML' ? 'ML structure' : 'class unknown';
    return `<button class="heat-tile treemap-tile ${heatTone(move)} ${roleClass} ${member.provisional ? 'seat-review' : ''} ${cap == null ? 'cap-unknown' : ''} ${tileClass}" style="left:${item.x.toFixed(3)}%;top:${item.y.toFixed(3)}%;width:${item.width.toFixed(3)}%;height:${item.height.toFixed(3)}%" type="button" data-ticker="${esc(member.ticker)}" title="${esc(member.ticker)} · ${roleLabel}${member.provisional ? ' · provisional seat' : ''} · ${fmtSigned(move)} · ${cap == null ? 'cap unknown' : fmtCompact(cap)}">
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

function themeStageUnknownReason(kind, reason) {
  if (kind === 'previous') {
    return reason === 'missing'
      ? 'stored previous stage is missing'
      : 'stored previous stage is outside the canonical stage vocabulary';
  }
  const reasons = {
    missing: 'stored stage start is missing',
    not_a_timestamp_string: 'stored stage start is not a timestamp string',
    blank: 'stored stage start is blank',
    invalid_timestamp: 'stored stage start is not a valid timestamp',
    future_timestamp: 'stored stage start is future-dated',
  };
  return reasons[reason] || 'stored stage start is unavailable';
}

function themeStageReceiptMarkup(theme, nowMs = Date.now()) {
  const receipt = buildThemeStageReceipt(theme, nowMs);
  const currentStage = receipt.currentStage || '—';
  const previousStage = receipt.previousStage || 'UNKNOWN';
  const heldLabel = receipt.sinceState === 'measured'
    ? `HELD SINCE ${fmtDate(receipt.sinceMs).toUpperCase()}`
    : 'HELD SINCE UNKNOWN';
  const currentAccessible = currentStage === '—' ? 'Current stage unavailable.' : `Current stage ${currentStage}.`;
  const previousAccessible = receipt.previousState === 'measured'
    ? `Previous stage ${receipt.previousStage}.`
    : `Previous stage unknown because the ${themeStageUnknownReason('previous', receipt.previousReason)}.`;
  const sinceAccessible = receipt.sinceState === 'measured'
    ? `Held since ${fmtDate(receipt.sinceMs)} Eastern Time. Exact stored timestamp ${receipt.sinceAt}.`
    : `Held since unknown because the ${themeStageUnknownReason('since', receipt.sinceReason)}.`;
  const heldMarkup = receipt.sinceState === 'measured'
    ? `<time class="theme-stage-held" datetime="${esc(receipt.sinceAt)}" title="${esc(`Exact stored timestamp ${receipt.sinceAt}`)}">${esc(heldLabel)}</time>`
    : `<span class="theme-stage-held unknown" title="${esc(themeStageUnknownReason('since', receipt.sinceReason))}">${heldLabel}</span>`;
  return `<span class="theme-stage-transition" data-stage-previous-state="${receipt.previousState}" data-stage-since-state="${receipt.sinceState}" aria-label="${esc(`${currentAccessible} ${previousAccessible} ${sinceAccessible}`)}">
    <span class="stage-badge ${stageClass(currentStage)}">${esc(currentStage)}</span>
    <span class="theme-stage-context ${receipt.previousState}">FROM ${esc(previousStage)}</span>
    <span class="theme-stage-separator" aria-hidden="true">·</span>
    ${heldMarkup}
  </span>`;
}

function themeRowFor(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  return state.themes.find(theme => String(theme?.name || '').trim().toLowerCase() === target) || null;
}

// A theme name shown on NOW becomes a jump to that theme's THEMES page when the
// engine actually has the theme; otherwise it stays plain text.
function themeJumpMarkup(name) {
  if (!name) return '';
  const theme = themeRowFor(name);
  if (!theme) return esc(name);
  return `<button class="theme-jump-link" type="button" data-theme-jump="${esc(theme.name)}" title="Open ${esc(theme.name)} on THEMES">${esc(name)}</button>`;
}

function jumpToTheme(name) {
  const theme = themeRowFor(name);
  if (!theme) return;
  if (state.selectedTheme) closeThemeOverview({ history: false });
  switchView('themes', { history: false, scroll: 'top' });
  selectThemePage(theme.name, { history: false });
  writeDashboardHistory();
  els.themePageTitle?.focus({ preventScroll: true });
}

function renderThemeGlance() {
  const themes = activeThemes().slice(0, 4);
  els.themeGlance.innerHTML = themes.length ? themes.map(theme => `
    <button class="theme-glance-card" type="button" data-theme-jump="${esc(theme.name)}" title="Open ${esc(theme.name)} on THEMES">
      <span class="theme-glance-top">
        <span class="theme-name-title">${esc(theme.name)}</span>
        <span class="theme-move ${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</span>
      </span>
      <span class="theme-glance-meta">${esc(theme.stage || '—')} · 3D ${fmtSigned(theme.mov_3d)}${theme.sc_cluster === true ? ' · SC SYMPATHY' : ''}</span>
    </button>`).join('') : '<div class="empty-state">No active theme rows available.</div>';
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

function themeDeepContractState(theme) {
  if (!theme?.deep || typeof theme.deep !== 'object') return null;
  const contract = theme.deep.contract;
  const canonical = finite(theme.deep.v) === 2 &&
    contract?.d_count === 'prior_completed_daily_low_reset_v1' &&
    contract?.run_days === 'consecutive_green_closes_v1' &&
    contract?.missing_evidence === 'unknown_not_negative_v1';
  return canonical ? 'canonical' : 'legacy';
}

function themeBoardDriver(theme) {
  const driver = theme?.deep?.driver;
  if (cleanThemeContextText(driver)) return cleanThemeContextText(driver);
  if (driver && typeof driver === 'object' && cleanThemeContextText(driver.text)) return cleanThemeContextText(driver.text);
  if (cleanThemeContextText(theme?.key_event)) return cleanThemeContextText(theme.key_event);
  return null;
}

function themeBreadthParticipation(theme) {
  const raw = String(theme?.breadth ?? '').trim();
  if (!/^\d+\/\d+$/.test(raw)) return '—';
  const [hot, total] = raw.split('/').map(Number);
  if (total <= 0 || hot > total) return '—';
  return `${hot}/${total}`;
}

function themeBandCensus(members) {
  const measured = members.filter(member => ['UPPER', 'LOWER', 'IN_BAND'].includes(String(member.row?.bb_completed_side || '')));
  const outside = measured.filter(member => finite(member.row?.bb_completed_consec) >= 1 &&
    ['UPPER', 'LOWER'].includes(String(member.row?.bb_completed_side || '')));
  const upper = outside.filter(member => member.row.bb_completed_side === 'UPPER');
  const lower = outside.filter(member => member.row.bb_completed_side === 'LOWER');
  const longest = outside.reduce((best, member) => {
    const days = finite(member.row.bb_completed_consec);
    if (days == null || days < 1) return best;
    const side = member.row.bb_completed_side === 'UPPER' ? 'UBB' : 'LBB';
    return !best || days > best.days ? { ticker: member.ticker, days, side } : best;
  }, null);
  return { measured: measured.length, outside: outside.length, upper: upper.length, lower: lower.length, longest };
}

function themeStructureEvidence(members, scope = null) {
  const measured = members.filter(member => member.row);
  const ema8Measured = measured
    .map(member => ({ member, value: typeof member.row?.ema8_dist === 'number' && Number.isFinite(member.row.ema8_dist) ? member.row.ema8_dist : null }))
    .filter(entry => entry.value != null);
  const furthest8 = [...ema8Measured]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]?.member || null;
  const ema8Side = {
    scope: scope === 'ML' || scope === 'SC' ? scope : null,
    above: ema8Measured.filter(entry => entry.value > 0).length,
    below: ema8Measured.filter(entry => entry.value < 0).length,
    flat: ema8Measured.filter(entry => entry.value === 0).length,
    measured: ema8Measured.length,
  };
  const gapOut = measured.filter(member => ['UBB', 'LBB'].includes(String(member.row?.bb_open_out || '')));
  const volumeMeasured = measured.filter(member => finite(member.row?.volume_ratio) != null);
  const volumeLeader = [...volumeMeasured].sort((a, b) => finite(b.row.volume_ratio) - finite(a.row.volume_ratio))[0] || null;
  const matureRuns = measured.filter(member => (finite(member.row?.run_days) ?? 0) >= 2);
  const accelerating = matureRuns.filter(member => member.row?.run_escalating === true);
  return {
    memberCount: measured.length,
    furthest8,
    ema8Side,
    gapOut,
    volumeLeader,
    volumeMeasured: volumeMeasured.length,
    matureRuns,
    accelerating,
  };
}

function themeEma8SideLabel(structure) {
  const scope = structure?.ema8Side?.scope;
  return `8EMA SIDE · ${scope === 'ML' || scope === 'SC' ? scope : 'CLASS UNKNOWN'}`;
}

function themeEma8SideText(structure) {
  const side = structure?.ema8Side;
  if (!side || !['ML', 'SC'].includes(side.scope) || !Number.isInteger(side.measured) || side.measured < 1) return 'UNKNOWN';
  return `ABOVE ${side.above}/${side.measured} · BELOW ${side.below}/${side.measured} · FLAT ${side.flat}/${side.measured}`;
}

function themeBuildReceipt(theme, nowMs = Date.now()) {
  const build = theme?.build;
  const rawSince = theme?.build_since;
  const hasSince = rawSince != null && String(rawSince).trim() !== '';
  const sinceMs = hasSince ? Date.parse(rawSince) : NaN;
  const clockMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const sinceValid = Number.isFinite(sinceMs) && sinceMs <= clockMs;
  const state = build === true
    ? 'active'
    : build === false ? hasSince ? 'contested' : 'inactive' : 'unknown';
  const evidence = state === 'active' && theme?.build_evidence && typeof theme.build_evidence === 'object' && !Array.isArray(theme.build_evidence)
    ? theme.build_evidence
    : null;
  const evidenceNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const rawSync = evidenceNumber(evidence?.sync);
  const rawTotal = evidenceNumber(evidence?.total);
  const countersValid = Number.isInteger(rawSync) && Number.isInteger(rawTotal)
    && rawSync >= 0 && rawTotal > 0 && rawSync <= rawTotal;
  const sync = countersValid ? rawSync : null;
  const total = countersValid ? rawTotal : null;
  const mov3d = state === 'active' ? evidenceNumber(evidence?.mov_3d) : null;
  const evidenceState = state !== 'active'
    ? 'not_applicable'
    : sync != null && mov3d != null ? 'complete' : sync != null || mov3d != null ? 'partial' : 'unknown';
  return {
    state,
    sinceState: state === 'active' ? sinceValid ? 'measured' : 'unknown' : state === 'contested' ? sinceValid ? 'contested' : 'unknown' : 'not_applicable',
    sinceAt: (state === 'active' || state === 'contested') && sinceValid ? rawSince : null,
    sinceMs: (state === 'active' || state === 'contested') && sinceValid ? sinceMs : null,
    elapsedMs: (state === 'active' || state === 'contested') && sinceValid ? clockMs - sinceMs : null,
    sync,
    total,
    mov3d,
    evidenceState,
  };
}

function themeBuildElapsedLabel(receipt) {
  const elapsedMs = receipt?.elapsedMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const hours = Math.floor(elapsedMs / 3600000);
  if (hours < 1) return '<1H';
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
}

function themeBuildCompactText(receipt) {
  if (receipt?.state === 'active') return `BUILD · ${themeBuildElapsedLabel(receipt) ? `SINCE ${themeBuildElapsedLabel(receipt)}` : 'START UNKNOWN'}`;
  if (receipt?.state === 'inactive') return 'BUILD · INACTIVE';
  if (receipt?.state === 'contested') return 'BUILD · CONTESTED';
  return 'BUILD · UNKNOWN';
}

function themeBuildEvidenceText(receipt) {
  if (receipt?.state === 'inactive') return 'INACTIVE · NOT INVALIDATION';
  if (receipt?.state === 'contested') return `CONTESTED · INACTIVE FLAG + ${receipt.sinceState === 'contested' ? `START RECEIPT ${themeBuildElapsedLabel(receipt) || 'UNKNOWN'} OLD` : 'START RECEIPT UNKNOWN'}`;
  if (receipt?.state !== 'active') return 'UNKNOWN';
  const details = [
    themeBuildElapsedLabel(receipt) ? `ACTIVE SINCE ${themeBuildElapsedLabel(receipt)}` : 'ACTIVE · START UNKNOWN',
    receipt.sync != null && receipt.total != null ? `SYNC ${receipt.sync}/${receipt.total}` : 'SYNC UNKNOWN',
    receipt.mov3d != null ? `3D ${fmtSigned(receipt.mov3d)}` : '3D UNKNOWN',
  ];
  return details.join(' · ');
}

function themeCensusMembers(theme, members) {
  const structure = members.filter(member => member.category === 'ML');
  if (theme?.sc_cluster === true || !structure.length) {
    return { members: members.filter(member => member.category === 'SC'), scope: 'SC' };
  }
  return { members: structure, scope: 'ML' };
}

function renderThemeMemberRail(members) {
  if (!members.length) return '<div class="theme-member-empty">MEMBER DATA UNAVAILABLE</div>';
  const ordered = [...members].sort((a, b) => {
    const aOutside = bbOutsideLabel(a.row) ? 1 : 0;
    const bOutside = bbOutsideLabel(b.row) ? 1 : 0;
    if (bOutside !== aOutside) return bOutside - aOutside;
    const dGap = (finite(b.row?.d_count) ?? -1) - (finite(a.row?.d_count) ?? -1);
    if (dGap !== 0) return dGap;
    const aMove = finite(a.row?.change_pct);
    const bMove = finite(b.row?.change_pct);
    return (bMove == null ? -Infinity : Math.abs(bMove)) - (aMove == null ? -Infinity : Math.abs(aMove));
  });
  return ordered.map(member => {
    const band = bbOutsideLabel(member.row);
    const roleClass = member.category === 'SC' ? 'vehicle' : member.category === 'ML' ? 'structure' : 'class-unknown';
    return `<button class="theme-member-chip ${heatTone(member.row?.change_pct)} ${roleClass} ${member.provisional ? 'seat-review' : ''}" type="button" data-ticker="${esc(member.ticker)}" title="${esc(`${member.ticker}${member.provisional ? ' · provisional seat' : ''} · ${runLabel(member.row)}${band ? ` · ${band}` : ''} · ${fmtSigned(member.row?.change_pct)}`)}">
      <strong>${esc(member.ticker)}</strong>
      <span class="theme-member-move ${moveClass(member.row?.change_pct)}">${fmtSigned(member.row?.change_pct)}</span>
      <span class="theme-member-run">${esc(runLabel(member.row))}</span>
      ${member.provisional ? '<span class="theme-member-band">SEAT REVIEW</span>' : ''}
      ${band ? `<span class="theme-member-band">${esc(band)}</span>` : ''}
    </button>`;
  }).join('');
}

function themeBoardModel(theme) {
  const members = themeMembers(theme);
  const evidence = themeEvidence(theme);
  const census = themeCensusMembers(theme, members);
  const hasMlStructure = members.some(member => member.category === 'ML');
  const unknownCount = members.filter(member => member.category == null).length;
  const participation = themeBreadthParticipation(theme);
  const read = themeBoardRead(theme);
  const readContract = themeDeepContractState(theme);
  const driver = themeBoardDriver(theme);
  const band = themeBandCensus(census.members);
  const structure = themeStructureEvidence(census.members, census.scope);
  const build = themeBuildReceipt(theme);
  const operational = themeLedgerOperationalEvidence(theme, members);
  const move7d = themeTapeMove(theme, 7);
  const leader = [...census.members].sort((a, b) => {
    const av = finite(a.row?.change_pct);
    const bv = finite(b.row?.change_pct);
    return (bv == null ? -Infinity : bv) - (av == null ? -Infinity : av);
  })[0] || null;
  const outside = census.members
    .filter(member => bbOutsideLabel(member.row))
    .sort((a, b) => (finite(b.row?.bb_completed_consec) ?? 0) - (finite(a.row?.bb_completed_consec) ?? 0));
  return {
    theme,
    members,
    evidence,
    read,
    readContract,
    driver,
    band,
    structure,
    build,
    operational,
    move7d,
    leader,
    outside,
    hasMlStructure,
    unknownCount,
    participation,
    censusCount: census.members.length,
    censusScope: census.scope,
    readStamp: [read.source, read.at ? relativeTime(read.at) : null].filter(Boolean).join(' · '),
    bandValue: band.measured ? `${band.outside}/${band.measured}` : '—',
    bandDetail: band.longest ? `${band.longest.ticker} ${band.longest.side} ${Math.trunc(band.longest.days)}D` : band.measured ? `${band.upper} UBB · ${band.lower} LBB` : 'UNAVAILABLE',
  };
}

function catalystLaneStatus(key) {
  const status = state.laneStatus[key]?.status;
  return status === 'fresh' ? 'QUERY OK' : status === 'stale' ? 'LAST VERIFIED' : 'UNAVAILABLE';
}

function themeCatalystTape(theme, members, { expanded = false } = {}) {
  const snapshot = state.breadthSnapshot;
  const detail = expanded ? state.themeCatalystDetail.get(theme.name) : null;
  const detailNews = detail?.news?.status === 'ready' ? detail.news : null;
  const detailFilings = detail?.filings?.status === 'ready' ? detail.filings : null;
  const tape = buildThemeCatalystTape({
    themeName: theme.name,
    members,
    newsRows: detailNews?.rows ?? (state.laneStatus.news?.status ? state.news : null),
    filingRows: detailFilings?.rows ?? (state.laneStatus.filings?.status ? state.filings : null),
    calendar: snapshot?.calendar,
    generatedAt: snapshot?.generated_at,
  });
  tape.detailCoverage = {
    news: detailNews
      ? { ...detailNews, displayStatus: 'MEMBER QUERY OK', memberScoped: true }
      : { status: detail?.news?.status || detail?.status || null, displayStatus: detail?.news?.status === 'failed' ? 'MEMBER QUERY FAILED' : detail?.status === 'loading' ? 'MEMBER QUERY LOADING' : 'GLOBAL SLICE', memberScoped: false },
    filings: detailFilings
      ? { ...detailFilings, displayStatus: 'MEMBER QUERY OK', memberScoped: true }
      : { status: detail?.filings?.status || detail?.status || null, displayStatus: detail?.filings?.status === 'failed' ? 'MEMBER QUERY FAILED' : detail?.status === 'loading' ? 'MEMBER QUERY LOADING' : 'GLOBAL SLICE', memberScoped: false },
  };
  return tape;
}

function catalystPersistentSourceState(sourceClass, tape) {
  const isNews = sourceClass === 'news';
  const isFiling = sourceClass === 'filing';
  const laneKey = isNews ? 'news' : isFiling ? 'filings' : 'breadthSnapshot';
  const laneStatus = state.laneStatus[laneKey]?.status;
  const freshness = laneStatus === 'fresh' || laneStatus === 'stale'
    ? laneStatus
    : laneStatus === 'loading' || (!laneStatus && !state.loadedOnce) ? 'loading' : 'unavailable';
  const readable = isNews
    ? tape.coverage.newsReadable
    : isFiling ? tape.coverage.filingsReadable : tape.coverage.calendarReadable;
  const detail = isNews
    ? '48H GLOBAL SLICE · UP TO 240'
    : isFiling
      ? 'NEWEST GLOBAL ROWS · UP TO 240'
      : `BOUNDED SNAPSHOT · ${tape.coverage.calendarGeneratedAt ? relativeTime(tape.coverage.calendarGeneratedAt) : 'AGE UNKNOWN'}`;
  return { readable, scope: 'partial', freshness, detail };
}

function catalystMemberLabel(entry) {
  const members = Array.isArray(entry?.memberTickers) && entry.memberTickers.length
    ? entry.memberTickers
    : [entry?.memberTicker];
  return members.filter(Boolean).join(' · ') || 'TICKER UNKNOWN';
}

function themeEarningsNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function themeEarningsValue(value) {
  const number = themeEarningsNumber(value);
  if (number == null) return 'UNKNOWN';
  const fixed = number.toFixed(number !== 0 && Math.abs(number) < 0.01 ? 4 : 2);
  return number !== 0 && Number(fixed) === 0 ? number.toPrecision(2) : fixed;
}

function themeEarningsEpsReceipt(event, direction) {
  if (direction === 'scheduled') return `EPS EST ${themeEarningsValue(event?.eps_estimate)} · RESULT NOT DUE`;
  if (direction !== 'observed') return 'EPS RECEIPT UNKNOWN';
  const surprise = themeEarningsNumber(event?.surprise_pct);
  const roundedSurprise = surprise == null ? null : surprise.toFixed(1);
  const surpriseValue = surprise != null && surprise !== 0 && Number(roundedSurprise) === 0 ? surprise.toPrecision(2) : roundedSurprise;
  const surpriseText = surpriseValue == null ? 'UNKNOWN' : `${surprise > 0 ? '+' : ''}${surpriseValue}%`;
  return `EPS ACT ${themeEarningsValue(event?.eps_actual)} · EST ${themeEarningsValue(event?.eps_estimate)} · SURPRISE ${surpriseText}`;
}

function themeCatalystOperationalEvidence(theme, members) {
  const tape = themeCatalystTape(theme, members);
  const observedSessions = buildThemeCatalystSessions({ entries: tape.observed, themeTape: theme?.deep?.tape });
  const compact = buildThemeCatalystCompactCoverage({
    members,
    entries: tape.entries,
    sourceStates: {
      news: catalystPersistentSourceState('news', tape),
      filing: catalystPersistentSourceState('filing', tape),
      earnings: catalystPersistentSourceState('earnings', tape),
    },
  });
  const lines = [];
  let epsReceipt = null;
  if (tape.news) {
    const row = tape.news.row;
    lines.push(`NEWS · ${catalystMemberLabel(tape.news)} · ${cleanContextText(row.headline)} · ${row.source || 'source unknown'} · ${relativeTime(tape.news.stamp.value)}`);
  }
  if (tape.filing) {
    const row = tape.filing.row;
    const detail = cleanContextText(row.summary) || row.lifecycle_state || 'filing receipt';
    lines.push(`SEC ${row.filing_type || 'FILING'} · ${catalystMemberLabel(tape.filing)} · ${detail} · ${relativeTime(tape.filing.stamp.value)}`);
  }
  if (tape.earnings) {
    const event = tape.earnings.event;
    const timing = tape.earnings.mode === 'upcoming' ? 'NEXT EARNINGS' : 'LAST CALENDAR EARNINGS';
    epsReceipt = themeEarningsEpsReceipt(event, tape.earnings.mode === 'upcoming' ? 'scheduled' : 'observed');
    lines.push(`${timing} · ${catalystMemberLabel(tape.earnings)} · ${fmtDate(tape.earnings.stamp.value, true)}${event.session ? ` · ${event.session}` : ''} · ${event.source || 'source unknown'}`);
  }
  return {
    label: 'CATALYST · LOADED WINDOWS',
    headline: 'OBSERVED / SCHEDULED',
    text: lines.join(' · ') || (compact.observed.memberCount == null && compact.upcoming.memberCount == null ? 'Catalyst coverage is unknown.' : 'No observed or scheduled member receipt in the readable loaded windows.'),
    receipt: `OBSERVED ${compact.observed.readableSourceCount}/${compact.observed.sourceTypeCount} WINDOWS READABLE · SCHEDULED ${compact.upcoming.readableSourceCount}/${compact.upcoming.sourceTypeCount} CALENDAR READABLE${compact.unassignedReceiptCount ? ` · ${compact.unassignedReceiptCount} TIME-DIRECTION UNKNOWN` : ''} · NO RECEIPT ≠ NO CATALYST · UNKNOWN ≠ 0 · NO CAUSAL CLAIM`,
    compact,
    epsReceipt,
    latestObservedSession: observedSessions[0] || null,
    observedChronology: buildThemeCatalystSessionChronology(observedSessions),
  };
}

function themeLedgerOperationalEvidence(theme, members) {
  let attention;
  const lane = selectAttentionLane(state.themeAttentionLive, state.themeAttention);
  const payload = lane.payload;
  if (!payload) {
    attention = { headline: 'SOURCE UNAVAILABLE', text: 'Attention is unknown, not quiet.', receipt: 'attention_snapshots · unavailable' };
  } else {
    const index = themeAttentionIndex(payload.rows);
    const observed = members.map(member => ({ ticker: member.ticker, evidence: index.get(String(member.ticker || '').toUpperCase()) || null }))
      .filter(item => item.evidence)
      .sort((a, b) => {
        const velocityDelta = (b.evidence.velocity ?? -Infinity) - (a.evidence.velocity ?? -Infinity);
        if (velocityDelta) return velocityDelta;
        return (b.evidence.rate ?? -Infinity) - (a.evidence.rate ?? -Infinity);
      });
    const top = observed[0] || null;
    const rate = top?.evidence?.rate == null ? null : `${fmtNumber(top.evidence.rate, 1)}${top.evidence.saturated ? '+' : ''}/HR`;
    const rank = top?.evidence?.rank == null ? null : `TRENDING #${Math.trunc(top.evidence.rank)}`;
    const multiple = top?.evidence?.velocity == null ? null : `${fmtNumber(top.evidence.velocity, 1)}× BASELINE`;
    const absent = Array.isArray(payload.registryConfirmedAbsent) ? payload.registryConfirmedAbsent.length : 0;
    const unresolved = Array.isArray(payload.registryUnresolved) ? payload.registryUnresolved.length : 0;
    const window = attentionWindowLabel(payload).toUpperCase();
    const registryCoverage = payload.registryTotal == null
      ? 'REGISTRY DENOMINATOR UNKNOWN'
      : payload.coverageComplete
        ? `${payload.registryObserved}/${payload.registryTotal} REGISTRY OBSERVED${absent ? ` · ${absent} CONFIRMED NO ${window} OBSERVATION` : ''} · COVERAGE COMPLETE`
        : `${payload.registryObserved}/${payload.registryTotal} REGISTRY OBSERVED · ${unresolved} UNRESOLVED · COVERAGE INCOMPLETE`;
    const rowsReceipt = payload.total == null ? 'ROW TOTAL UNKNOWN' : `${payload.returned}/${payload.total} ROWS${payload.capped ? ' CAPPED' : ' COMPLETE'}`;
    const liveState = lane.reason === 'live_empty_archive_unavailable'
      ? 'NO LIVE 2H ROWS · ARCHIVE UNAVAILABLE'
      : lane.mode === 'live'
        ? `LIVE ${window}`
      : lane.reason === 'live_unavailable' ? 'LIVE 2H UNAVAILABLE · LAST OBSERVED' : 'NO LIVE 2H ROWS · LAST OBSERVED';
    attention = {
      label: lane.mode === 'live' ? `CROWD · LIVE ${window}` : 'CROWD · LAST OBSERVED, NOT LIVE',
      headline: top ? [top.ticker, rate || rank || 'OBSERVED'].filter(Boolean).join(' · ') : 'NO MEMBER OBSERVATION IN SLICE',
      text: [`${observed.length}/${members.length} MEMBERS`, multiple, rank].filter(Boolean).join(' · '),
      receipt: `${liveState}${top ? ` · ${relativeTime(top.evidence.latestAt || top.evidence.rateAt)}` : ''} · ${registryCoverage} · ${rowsReceipt}`,
    };
  }

  const triggerRows = themeDossierRows(theme.name).filter(row => row?.provenance?.trigger?.kind);
  const latest = triggerRows[0] || null;
  const meta = state.themeDossierMeta;
  const count = meta?.total != null && meta.capped === false ? `${triggerRows.length}` : `AT LEAST ${triggerRows.length}`;
  const trigger = latest ? {
    headline: String(latest.provenance.trigger.kind).toUpperCase(),
    text: latest.provenance.trigger.line || `${latest.provenance.trigger.source || 'trigger'} receipt`,
    receipt: `STORED TRIGGER · ${relativeTime(latest.at)} · ${count} RECEIPTS / ${meta?.windowDays || 30}D${meta?.total != null && meta.capped === false ? ' · COMPLETE WINDOW' : meta?.capped ? ' · CAPPED SLICE' : ' · DENOMINATOR UNKNOWN'}`,
  } : meta ? {
    headline: 'NO STORED TRIGGER IN WINDOW',
    text: 'No cause is inferred from the current move.',
    receipt: `theme_dossiers · ${meta.windowDays}D · ${meta.total == null ? 'DENOMINATOR UNKNOWN' : meta.capped ? 'CAPPED SLICE' : 'COMPLETE WINDOW'}`,
  } : {
    headline: 'SOURCE UNAVAILABLE',
    text: 'Trigger history is unknown. No cause is inferred.',
    receipt: 'theme_dossiers · unavailable',
  };
  return { attention, trigger, catalyst: themeCatalystOperationalEvidence(theme, members) };
}

function renderThemeCatalystDirections(compact) {
  const concentrationReceipt = direction => {
    const concentration = direction.concentration;
    if (!concentration) return { compact: 'CONC UNKNOWN', accessible: 'concentration unknown' };
    if (concentration.memberState === 'none') return { compact: 'CONC NONE', accessible: 'no loaded receipt concentration' };
    const memberLead = concentration.memberLeaders.length === 1
      ? concentration.memberLeaders[0]
      : `${concentration.memberLeaders.length}M TIE`;
    const compactSource = sourceClass => sourceClass === 'earnings' ? 'EARN' : catalystSourceClassLabel(sourceClass);
    const sourceLead = concentration.sourceLeaders.length === 1
      ? compactSource(concentration.sourceLeaders[0])
      : `${concentration.sourceLeaders.length}S TIE`;
    const memberDescription = concentration.memberState === 'single'
      ? `single-member cluster led by ${concentration.memberLeaders.join(', ')}`
      : `multi-member participation; top member ${concentration.memberLeaders.join(', ')}`;
    const sourceDescription = concentration.sourceState === 'single'
      ? `single-source cluster led by ${concentration.sourceLeaders.map(catalystSourceClassLabel).join(', ')}`
      : `multi-source participation; top source ${concentration.sourceLeaders.map(catalystSourceClassLabel).join(', ')}`;
    return {
      compact: `M:${memberLead} ${concentration.memberPeakReceiptCount}/${direction.receiptCount} · S:${sourceLead} ${concentration.sourcePeakReceiptCount}/${direction.receiptCount}`,
      accessible: `${memberDescription} with ${concentration.memberPeakReceiptCount} of ${direction.receiptCount} receipts; ${sourceDescription} with ${concentration.sourcePeakReceiptCount} of ${direction.receiptCount} receipts`,
    };
  };
  const directionCard = (label, direction, timing) => {
    const members = direction.memberCount == null ? 'M UNKNOWN' : `M${direction.memberCount}/${compact.trackedCount}`;
    const sources = direction.sourceTypeWithReceiptsCount == null ? 'S UNKNOWN' : `S${direction.sourceTypeWithReceiptsCount}/${direction.readableSourceCount}`;
    const receipts = direction.receiptCount == null ? 'R UNKNOWN' : `${direction.receiptCount}R`;
    const concentration = concentrationReceipt(direction);
    const accessible = `${label}; ${members}; ${sources}; ${receipts}; ${timing}; ${concentration.accessible}`;
    return `<span aria-label="${esc(accessible)}"><b>${esc(label)}</b><strong>${esc(`${members} · ${sources}`)}</strong><i>${esc(`${receipts} · ${timing}`)}</i><u>${esc(concentration.compact)}</u></span>`;
  };
  const observedTiming = compact.observed.newestAt
    ? `NEWEST ${relativeTime(compact.observed.newestAt)}`
    : compact.observed.memberCount == null ? 'RECENCY UNKNOWN' : 'NONE OBSERVED';
  const upcomingTiming = compact.upcoming.nearestAt
    ? `NEXT ${catalystRelativeTime(compact.upcoming.nearestAt)}`
    : compact.upcoming.memberCount == null ? 'TIMING UNKNOWN' : 'NONE SCHEDULED';
  return `<div class="theme-catalyst-directions">${directionCard('OBSERVED', compact.observed, observedTiming)}${directionCard('SCHEDULED', compact.upcoming, upcomingTiming)}</div>`;
}

function renderThemeCatalystSessionCompact(compact, session) {
  if (!session) {
    const unknown = compact.observed.memberCount == null;
    const value = unknown ? 'SESSION UNKNOWN' : 'NONE IN LOADED WINDOWS';
    const detail = unknown ? 'SOURCE COVERAGE UNKNOWN' : 'NO OBSERVED SESSION RECEIPT';
    return `<div class="theme-catalyst-session-compact ${unknown ? 'unknown' : 'none'}" aria-label="Latest observed Eastern session; ${esc(value)}; stored same-date Theme move unavailable; ${esc(detail)}"><b>LATEST ET · ${esc(value)}</b><strong>—</strong><i>MOVE — · ${esc(detail)}</i></div>`;
  }
  const match = catalystSessionMatchReceipt(session);
  const dateLabel = session.date ? fmtDate(`${session.date}T12:00:00Z`) : 'DATE UNKNOWN';
  const breadth = `${session.receiptCount}R · ${session.memberCount}M · ${session.sourceCount}S`;
  const compactDetail = session.matchState === 'matched'
    ? 'EXACT DATE'
    : session.matchState === 'move_unknown'
      ? 'MOVE UNKNOWN'
      : session.matchState === 'contested'
        ? 'CONTESTED'
        : session.matchState === 'date_unknown' ? 'NOT ALIGNABLE' : 'NO STORED TAPE';
  const accessible = `Latest observed Eastern session; ${dateLabel} Eastern; ${session.receiptCount} receipts; ${session.memberCount} members; ${session.sourceCount} source types; stored same-date Theme move ${match.value}; ${match.detail}`;
  return `<div class="theme-catalyst-session-compact ${esc(session.matchState)}" aria-label="${esc(accessible)}"><b>LATEST ET · ${esc(dateLabel)}</b><strong>${esc(breadth)}</strong><i class="${moveClass(session.themeMove)}">MOVE ${esc(match.value)} · ${esc(compactDetail)}</i></div>`;
}

function renderThemeCatalystChronologyCompact(compact, chronology) {
  if (compact.observed.memberCount == null || !chronology) {
    return '<div class="theme-catalyst-chronology-compact unknown" aria-label="Observed Eastern chronology unknown; source coverage unknown"><b>OBS ET GROUPS</b><strong>UNKNOWN</strong><i>SOURCE COVERAGE UNKNOWN</i><u>DATED SPAN UNKNOWN</u></div>';
  }
  if (chronology.totalGroupCount === 0) {
    return '<div class="theme-catalyst-chronology-compact none" aria-label="Zero observed Eastern date groups in the readable loaded windows; no dated span"><b>OBS ET GROUPS</b><strong>0</strong><i>NO OBSERVED SESSION RECEIPT</i><u>NO DATED SPAN</u></div>';
  }
  const stateCounts = `EXACT${chronology.exactMatchCount} · UN${chronology.unmatchedCount} · MOVE?${chronology.moveUnknownCount} · CONT${chronology.contestedCount} · DATE?${chronology.dateUnknownCount}${chronology.unknownMatchCount ? ` · STATE?${chronology.unknownMatchCount}` : ''}`;
  const span = chronology.newestDate && chronology.oldestDate
    ? `NEW ${fmtDate(`${chronology.newestDate}T12:00:00Z`)} · OLD ${fmtDate(`${chronology.oldestDate}T12:00:00Z`)} · ${chronology.datedGroupCount} DATED`
    : 'DATED SPAN UNKNOWN';
  const accessible = `${chronology.totalGroupCount} observed Eastern date groups; ${chronology.exactMatchCount} exact matches; ${chronology.unmatchedCount} unmatched; ${chronology.moveUnknownCount} move unknown; ${chronology.contestedCount} contested; ${chronology.dateUnknownCount} date unknown; ${chronology.unknownMatchCount} match state unknown; newest dated group ${chronology.newestDate || 'unknown'}; oldest dated group ${chronology.oldestDate || 'unknown'}; ${chronology.datedGroupCount} dated groups`;
  return `<div class="theme-catalyst-chronology-compact" aria-label="${esc(accessible)}"><b>OBS ET GROUPS</b><strong>${chronology.totalGroupCount}</strong><i>${esc(stateCounts)}</i><u>${esc(span)}</u></div>`;
}

function renderThemeCatalystCompactStates(compact) {
  const sources = ['news', 'filing', 'earnings'];
  return `<div class="theme-catalyst-compact-states">${sources.map(sourceClass => {
    const source = compact.sources[sourceClass];
    const status = source.state === 'partial' ? `PARTIAL · ${source.freshness.toUpperCase()}` : source.state.toUpperCase();
    const observed = source.observedMemberCount == null ? 'O UNKNOWN' : `O${source.observedMemberCount}/${compact.trackedCount}`;
    const upcoming = source.supportsUpcoming
      ? source.upcomingMemberCount == null ? 'N UNKNOWN' : `N${source.upcomingMemberCount}/${compact.trackedCount}`
      : null;
    const breadth = [observed, upcoming].filter(Boolean).join(' · ');
    const windowDetail = sourceClass === 'news'
      ? '48H GLOBAL · ≤240'
      : sourceClass === 'filing'
        ? 'NEWEST GLOBAL · ≤240'
        : `SNAPSHOT · ${String(source.detail || '').split(' · ').slice(1).join(' · ') || 'AGE UNKNOWN'}`;
    const accessible = `${catalystSourceClassLabel(sourceClass)}; ${status}; observed ${source.observedMemberCount == null ? 'unknown' : `${source.observedMemberCount} of ${compact.trackedCount}`}${source.supportsUpcoming ? `; scheduled ${source.upcomingMemberCount == null ? 'unknown' : `${source.upcomingMemberCount} of ${compact.trackedCount}`}` : ''}; window ${source.detail || 'unknown'}`;
    return `<span class="${esc(source.state)}" aria-label="${esc(accessible)}"><b>${esc(catalystSourceClassLabel(sourceClass))}</b><em>${esc(status)}</em><i>${esc(breadth)}</i><u>${esc(windowDetail)}</u></span>`;
  }).join('')}</div>`;
}

function renderThemeCatalystDensityCompact(compact) {
  const densityCard = (label, density, overlap, dateFront, sessionFront, { dated = false } = {}) => {
    const coverage = String(density?.coverageState || 'unknown').toUpperCase();
    const valueState = density?.valueState || 'unknown';
    const memberDensity = valueState === 'unknown'
      ? `R/${density?.memberDenominator ?? compact.trackedCount}M UNKNOWN`
      : `${density.receiptCount}R/${density.memberDenominator}M`;
    const datedDensity = !dated
      ? null
      : valueState === 'unknown'
        ? 'R/ETG UNKNOWN'
        : `${density.datedReceiptCount}R/${density.datedGroupDenominator}ETG`;
    const visible = [datedDensity, memberDensity].filter(Boolean).join(' · ');
    const overlapKnown = overlap?.zeroSourceMemberCount != null && overlap?.singleSourceMemberCount != null && overlap?.multipleSourceMemberCount != null;
    const overlapVisible = overlapKnown
      ? `0S${overlap.zeroSourceMemberCount} · 1S${overlap.singleSourceMemberCount} · 2+S${overlap.multipleSourceMemberCount} · M${overlap.memberDenominator}`
      : `0S/1S/2+S UNKNOWN · M${overlap?.memberDenominator ?? compact.trackedCount}`;
    const frontLabel = dated ? 'NEW' : 'NEAR';
    const frontSessionVisible = dated
      ? null
      : sessionFront?.valueState === 'zero'
        ? 'SESSION NONE'
        : ['measured', 'partial', 'contested'].includes(sessionFront?.valueState)
          ? `BMO${sessionFront.bmoMemberCount} AMC${sessionFront.amcMemberCount} ?${sessionFront.unknownMemberCount}${sessionFront.contestedMemberCount ? ` !${sessionFront.contestedMemberCount}` : ''}`
          : 'SESSION UNKNOWN';
    const frontVisible = dateFront?.valueState === 'zero'
      ? `${frontLabel} 0/0M · DATE NONE`
      : dateFront?.valueState === 'measured' && dateFront.date
        ? `${frontLabel} ${dateFront.frontMemberCount}/${dateFront.memberDenominator}M · ${fmtDate(`${dateFront.date}T12:00:00Z`)}${frontSessionVisible ? ` · ${frontSessionVisible}` : ''}`
        : `${frontLabel} UNKNOWN`;
    const accessible = valueState === 'unknown'
      ? `${label} catalyst receipt density unknown; coverage ${coverage.toLowerCase()}; tracked member denominator ${density?.memberDenominator ?? compact.trackedCount}`
      : `${label} catalyst receipt density; coverage ${coverage.toLowerCase()}; ${density.receiptCount} receipts across ${density.memberDenominator} tracked members${dated ? `; ${density.datedReceiptCount} dated receipts across ${density.datedGroupDenominator} Eastern date groups` : ''}; value state ${valueState}`;
    const overlapAccessible = overlapKnown
      ? `${overlap.zeroSourceMemberCount} of ${overlap.memberDenominator} tracked members have zero represented source classes; ${overlap.singleSourceMemberCount} have one; ${overlap.multipleSourceMemberCount} have two or more`
      : `member source overlap unknown across ${overlap?.memberDenominator ?? compact.trackedCount} tracked members`;
    const frontAccessible = dateFront?.valueState === 'zero'
      ? `${dated ? 'newest observed' : 'nearest scheduled'} date-front breadth is zero of zero direction members; no front date`
      : dateFront?.valueState === 'measured'
        ? `${dateFront.frontMemberCount} of ${dateFront.memberDenominator} direction members are represented on the ${dated ? 'newest observed' : 'nearest scheduled'} Eastern date ${dateFront.date}`
        : `${dated ? 'newest observed' : 'nearest scheduled'} date-front breadth unknown`;
    const sessionAccessible = dated
      ? ''
      : sessionFront?.valueState === 'zero'
        ? '; nearest scheduled date has no earnings-session receipt'
        : sessionFront?.memberDenominator == null
          ? '; nearest scheduled earnings-session composition unknown'
          : `; nearest scheduled date session composition across ${sessionFront.memberDenominator} members: ${sessionFront.bmoMemberCount} before market open, ${sessionFront.amcMemberCount} after market close, ${sessionFront.unknownMemberCount} session unknown, ${sessionFront.contestedMemberCount} contested`;
    return `<span class="${esc(`${density?.coverageState || 'unknown'} ${valueState}`)}" aria-label="${esc(`${accessible}; ${overlapAccessible}; ${frontAccessible}${sessionAccessible}`)}"><b>${esc(`${label} DENS · ${coverage}`)}</b><strong>${esc(visible)}</strong><i>${esc(overlapVisible)}</i><u>${esc(frontVisible)}</u></span>`;
  };
  return `<div class="theme-catalyst-density-compact">${densityCard('OBS', compact.observed.density, compact.observed.overlap, compact.observed.dateFront, compact.observed.sessionFront, { dated: true })}${densityCard('SCH', compact.upcoming.density, compact.upcoming.overlap, compact.upcoming.dateFront, compact.upcoming.sessionFront)}</div>`;
}

function renderThemeEarningsCompact(receipt) {
  if (!receipt) return '';
  return `<div class="theme-catalyst-eps-compact"><b>EARNINGS EPS</b><span>${esc(receipt)}</span></div>`;
}

function renderThemeOperationalItem(item) {
  const body = item.compact
    ? `${renderThemeCatalystDirections(item.compact)}${renderThemeCatalystSessionCompact(item.compact, item.latestObservedSession)}${renderThemeCatalystChronologyCompact(item.compact, item.observedChronology)}${renderThemeCatalystDensityCompact(item.compact)}${renderThemeCatalystCompactStates(item.compact)}${renderThemeEarningsCompact(item.epsReceipt)}`
    : `<strong>${esc(item.headline)}</strong>`;
  return `<section${item.compact ? ' class="theme-catalyst-compact"' : ''}><small>${esc(item.label || 'CROWD · ATTENTION')}</small>${body}<p>${esc(item.text)}</p><time>${esc(item.receipt)}</time></section>`;
}

function renderThemeOperationalLedger(model) {
  const items = [
    { label: model.operational.attention.label || 'CROWD · ATTENTION', ...model.operational.attention },
    { label: 'WHY IT FIRED · STORED RECEIPT', ...model.operational.trigger },
    model.operational.catalyst,
  ];
  return `<div class="theme-ledger-operational">${items.map(renderThemeOperationalItem).join('')}</div>`;
}

function renderThemePageOperational(model) {
  const items = [
    model.operational.attention,
    { label: 'WHY IT FIRED · STORED RECEIPT', ...model.operational.trigger },
    model.operational.catalyst,
  ];
  return items.map(renderThemeOperationalItem).join('');
}

function renderThemePrimitiveStrip(model) {
  const structure = model.structure;
  const furthest8 = structure.furthest8
    ? `${structure.furthest8.ticker} ${fmtSigned(structure.furthest8.row.ema8_dist)}`
    : '—';
  const volumeLeader = structure.volumeLeader
    ? `${structure.volumeLeader.ticker} ${fmtNumber(structure.volumeLeader.row.volume_ratio)}×`
    : '—';
  const matureAccel = structure.matureRuns.length
    ? `${structure.accelerating.length}/${structure.matureRuns.length}`
    : 'NO 2D+ RUN';
  return `<div class="theme-primitive-strip">
    <span aria-label="${esc(`${themeEma8SideLabel(structure)} · ${themeEma8SideText(structure)} · FURTHEST ${furthest8}`)}"><small>${esc(themeEma8SideLabel(structure))}</small><strong class="ma-text theme-ema8-side-value">${esc(themeEma8SideText(structure))}</strong><em>FURTHEST ${esc(furthest8)}</em></span>
    <span><small>BB GAP-OUT</small><strong class="bb-text">${structure.gapOut.length}/${structure.memberCount || '—'}</strong></span>
    <span><small>RVOL · LEADER</small><strong>${esc(volumeLeader)}</strong><em>${structure.volumeMeasured}/${structure.memberCount || '—'} measured</em></span>
    <span><small>2D+ RUN · ACCEL</small><strong>${esc(matureAccel)}</strong></span>
  </div>`;
}

function themeBuildBadge(receipt) {
  const state = ['active', 'inactive', 'contested'].includes(receipt?.state) ? receipt.state : 'unknown';
  return `<span class="theme-build-badge ${state}" title="${esc(themeBuildEvidenceText(receipt))}" aria-label="Build episode: ${esc(themeBuildEvidenceText(receipt))}">${esc(themeBuildCompactText(receipt))}</span>`;
}

function themeIdentity(model, { meta = true } = {}) {
  const { theme } = model;
  return `<div class="theme-text-identity">
    <button class="theme-title-button" type="button" data-theme-name="${esc(theme.name)}">${esc(theme.name)}</button>
    ${meta ? `${themeStageReceiptMarkup(theme)}${themeBuildBadge(model.build)}` : ''}
    ${model.evidence.registry?.provisional === true ? '<span class="theme-evidence-badge provisional">PROVISIONAL THEME</span>' : ''}
  </div>`;
}

function themeLeader(model) {
  if (!model.leader) return '<span class="theme-unknown">—</span>';
  return `<button class="theme-text-ticker" type="button" data-ticker="${esc(model.leader.ticker)}">${esc(model.leader.ticker)}</button><span class="${moveClass(model.leader.row?.change_pct)}">${fmtSigned(model.leader.row?.change_pct)}</span><small>${esc(runLabel(model.leader.row))}</small>`;
}

function themeBookText(model) {
  if (model.theme.sc_cluster === true || !model.hasMlStructure) return '<strong>—</strong><small>NO ML STRUCTURE · SC SYMPATHY</small>';
  const unknown = model.unknownCount ? ` · ${model.unknownCount} CLASS UNKNOWN` : '';
  return `<strong>${esc(model.participation)}</strong><small>${model.censusCount} ML NAMES${unknown}</small>`;
}

function themeBandText(model) {
  return `<strong class="theme-bb-text">${esc(model.bandValue)}</strong><small>${esc(model.bandDetail)}</small>`;
}

function themeSignalLinks(items) {
  if (!items.length) return '<span class="theme-unknown">NONE</span>';
  return items.slice(0, 6).map(member => {
    const suffix = bbOutsideLabel(member.row);
    return `<button type="button" class="theme-signal-link bb" data-ticker="${esc(member.ticker)}">${esc(member.ticker)} <span>${esc(suffix)}</span></button>`;
  }).join('');
}

function themeEvidencePlaceholder(key) {
  const status = state.laneStatus[key]?.status;
  if (status === 'stale') return { headline: 'LAST VERIFIED DATA', text: 'The source did not refresh. Open the theme for the last retained evidence and timestamp.' };
  if (status !== 'fresh') return { headline: 'SOURCE UNAVAILABLE', text: 'No source response is available. This is unknown, not a negative read.' };
  return { headline: 'NO 7D ENTRY', text: 'The source refreshed successfully but returned no entry for this theme in the seven-day evidence window.' };
}

function renderThemeIntel(model) {
  const { latestDossier, latestRead, latestReview, receipts } = model.evidence;
  const dossierPlaceholder = themeEvidencePlaceholder('themeDossiers');
  const chartPlaceholder = themeEvidencePlaceholder('themeChartReads');
  const reviewPlaceholder = themeEvidencePlaceholder('themeReviews');
  const items = [
    latestDossier ? {
      label: 'CROWD STORY',
      headline: String(latestDossier.kind || 'story').replaceAll('_', ' ').toUpperCase(),
      text: cleanThemeContextText(latestDossier.story),
      receipt: receipts.dossier,
    } : { label: 'CROWD STORY', ...dossierPlaceholder },
    latestRead ? {
      label: 'CHART DESK',
      headline: [latestRead.chart_read, latestRead.agrees === true ? 'AGREES' : latestRead.agrees === false ? 'DISAGREES' : 'AGREEMENT UNKNOWN'].filter(Boolean).join(' · '),
      text: cleanThemeContextText(latestRead.why),
      receipt: receipts.chart,
    } : { label: 'CHART DESK', ...chartPlaceholder },
    latestReview ? {
      label: 'SECOND OPINION',
      headline: cleanThemeContextText(latestReview.verdict)?.toUpperCase() || 'VERDICT UNKNOWN',
      text: cleanThemeContextText(latestReview.evidence),
      receipt: receipts.review,
    } : { label: 'SECOND OPINION', ...reviewPlaceholder },
  ];
  return `<div class="theme-ledger-intel">${items.map(item => `<section>
    <small>${esc(item.label)}</small>
    <strong>${esc(item.headline)}</strong>
    ${item.text ? `<p>${esc(item.text)}</p>` : '<p>Evidence text unavailable.</p>'}
    ${item.receipt ? `<time>${esc(item.receipt)}</time>` : ''}
  </section>`).join('')}</div>`;
}

function themeSourceReceipt(key, label) {
  const coveragePartial = (key === 'themeAttentionLive' || key === 'themeAttention')
    && state[key]
    && state[key].coverageComplete === false;
  const status = coveragePartial ? 'stale' : state.laneStatus[key]?.status || 'unavailable';
  const suffix = coveragePartial ? 'COVERAGE PARTIAL' : status === 'fresh' ? 'QUERY OK' : status === 'stale' ? 'LAST VERIFIED' : 'UNAVAILABLE';
  return `<span class="theme-source-state ${esc(status)}"><strong>${esc(label)}</strong> ${suffix}</span>`;
}

function themeCoverageReceipt() {
  const activeRegistry = state.themeRegistry.filter(row => row?.is_active !== false && row?.name);
  const engineNames = new Set(state.themes.map(theme => theme?.name).filter(Boolean));
  const missing = activeRegistry.map(row => row.name).filter(name => !engineNames.has(name));
  const untrackedMembers = activeRegistry.reduce((total, row) => {
    const theme = state.themes.find(item => item?.name === row.name);
    if (!theme) return total + (Array.isArray(row.constituents) ? row.constituents.length : 0);
    const returned = new Set((Array.isArray(theme.constituents) ? theme.constituents : []).map(constituentTicker));
    return total + (Array.isArray(row.constituents) ? row.constituents.filter(ticker => !returned.has(ticker)).length : 0);
  }, 0);
  return `<div class="theme-coverage-receipt">
    ${activeRegistry.length ? `<span><strong>${engineNames.size}/${activeRegistry.length}</strong> ACTIVE REGISTRY THEMES HAVE ENGINE ROWS</span>` : '<span><strong>—</strong> ACTIVE REGISTRY COVERAGE UNKNOWN</span>'}
    ${activeRegistry.length ? `<span><strong>${untrackedMembers}</strong> REGISTRY MEMBERS LACK CURRENT THEME MEASUREMENTS</span>` : ''}
    ${missing.length ? `<span class="warning"><strong>MISSING</strong> ${esc(missing.join(' · '))}</span>` : ''}
    <span class="theme-source-receipts">
      ${themeSourceReceipt('themes', 'ENGINE')}
      ${themeSourceReceipt('themeRegistry', 'REGISTRY')}
      ${themeSourceReceipt('themeDossiers', 'CROWD')}
      ${themeSourceReceipt('themeAttentionLive', 'ATTN LIVE')}
      ${themeSourceReceipt('themeAttention', 'ATTN ARCHIVE')}
      ${themeSourceReceipt('themeCuration', 'CURATION')}
      ${themeSourceReceipt('themeChartReads', 'CHART DESK')}
      ${themeSourceReceipt('themeReviews', 'SECOND OPINION')}
      ${themeSourceReceipt('metricSnapshot', 'DAILY')}
    </span>
  </div>`;
}

function renderThemeLedger(models) {
  return `<div class="theme-ledger theme-view-surface">${models.map(model => `<article class="theme-ledger-row" role="button" tabindex="0" data-theme-card="${esc(model.theme.name)}" aria-label="Open ${esc(model.theme.name)} theme">
    <div class="theme-ledger-top">${themeIdentity(model)}<div>${themePerformanceCell('1D', model.theme.mov_1d)}${themePerformanceCell('3D', model.theme.mov_3d)}${themePerformanceCell('7D', model.move7d)}</div></div>
    <div class="theme-ledger-census"><span><small>PARTICIPATION · ML · EXT &gt;55 OR CLOSED OUTSIDE BB</small>${themeBookText(model)}</span><span><small>BB · ${esc(model.censusScope)} CLOSED OUTSIDE</small>${themeBandText(model)}</span><span><small>${esc(model.censusScope)} LEADER</small>${themeLeader(model)}</span></div>
    ${model.read.text ? `<p>${esc(model.read.text)}</p>` : ''}
    ${model.readStamp ? `<time>${esc(model.readStamp)}${model.readContract === 'legacy' ? ' · LEGACY D LANGUAGE' : model.readContract === 'canonical' ? ' · D CONTRACT V2' : ''}</time>` : ''}
    ${model.driver && model.driver !== model.read.text ? `<div class="theme-ledger-driver"><strong>DRIVER</strong><span>${esc(model.driver)}</span></div>` : ''}
    ${renderThemePrimitiveStrip(model)}
    ${renderThemeOperationalLedger(model)}
    ${renderThemeIntel(model)}
    <footer><span>CLOSED OUTSIDE ${themeSignalLinks(model.outside)}</span></footer>
  </article>`).join('')}</div>`;
}

// SC vehicles follow the tape (Austin, Sep 1 2026): any small cap on today's
// board carrying the theme tag rides in the theme box, curated or not.
function themeTaggedVehicles(theme) {
  const slug = themeSlug(theme?.name);
  if (!slug) return [];
  return state.market.filter(row => row && row.watch !== false && row.category === 'SC' && themeSlug(row.theme) === slug);
}

function themePageMemberTickers(theme) {
  const tickers = new Set(themeMembers(theme).map(member => member.ticker));
  for (const row of themeTaggedVehicles(theme)) tickers.add(String(row.ticker || '').toUpperCase());
  return tickers;
}

function themeBoxFor(theme, { read = true } = {}) {
  return buildThemeBox(theme, {
    members: themeMembers(theme),
    vehicles: themeTaggedVehicles(theme),
    read: read ? themeBoardRead(theme) : null,
  });
}

const themeBoardHelpers = { esc, fmtSigned, fmtPrice, fmtCompact, runLabel, bandLabel: bbAtGlanceLabel, relativeTime };

// THEMES scan surface = Austin's heat-map concept (Aug 21 / Sep 1 2026): one
// bordered box per theme, hottest first, ML structure tiled by capped cap, SC
// vehicles in their own strip, one story line. Receipts live behind the title.
function renderThemeBoard() {
  const boxes = orderThemeBoxes(state.themes.filter(theme => theme && theme.name).map(theme => themeBoxFor(theme)));
  if (!boxes.length) {
    els.themeBoard.innerHTML = '<div class="empty-state">Theme engine returned no active rows.</div>';
    state.themePageTheme = null;
    renderThemePageBriefing();
    return;
  }
  els.themeBoard.innerHTML = renderThemeHeatBoard(boxes, themeBoardHelpers)
    + `<details class="theme-board-receipts"><summary>SOURCE RECEIPTS · ${boxes.length} THEMES</summary>${themeCoverageReceipt()}</details>`;
  const current = boxes.find(box => box.name === state.themePageTheme?.name) || boxes[0];
  selectThemePage(current.name, { history: false, loadChart: state.themePageTheme?.name !== current.name || !state.themePageTicker });
}

// The chart dock under the board: selected theme name, its story line, and the
// charted member. Receipts and censuses stay behind the theme title click.
function renderThemePageBriefing() {
  const theme = state.themePageTheme;
  if (!theme) {
    els.themePageTitle.textContent = 'Choose a theme';
    els.themePageSummary.textContent = 'No active theme is selected.';
    els.themePageChartTitle.textContent = 'Chart';
    els.themePageChartNote.textContent = 'Choose a theme member.';
    els.themePageChartHost.innerHTML = '';
    return;
  }
  const read = themeBoardRead(theme);
  const stamp = [read.at ? relativeTime(read.at) : null, read.source].filter(Boolean).join(' · ');
  els.themePageTitle.textContent = theme.name;
  els.themePageSummary.textContent = read.text ? `${read.text}${stamp ? ` — ${stamp}` : ''}` : 'Current narrative unavailable.';
  els.themePageChartTitle.textContent = state.themePageTicker ? `${state.themePageTicker} chart` : 'Chart';
  document.querySelectorAll('[data-theme-page-chart-tf]').forEach(button => {
    button.classList.toggle('active', button.dataset.themePageChartTf === state.themePageChartTf);
  });
  els.themeBoard.querySelectorAll('[data-theme-card]').forEach(card => {
    card.classList.toggle('selected', card.dataset.themeCard === theme.name);
  });
  els.themeBoard.querySelectorAll('[data-ticker]').forEach(button => {
    const owner = button.closest('[data-theme-card]')?.dataset.themeCard;
    button.classList.toggle('chart-selected', owner === theme.name && button.dataset.ticker === state.themePageTicker);
  });
}

function selectThemePage(name, { history = true, loadChart = true } = {}) {
  const theme = state.themes.find(item => item?.name === name);
  if (!theme) return;
  state.themePageTheme = theme;
  const allowed = themePageMemberTickers(theme);
  if (!allowed.has(state.themePageTicker)) {
    const box = themeBoxFor(theme, { read: false });
    const byMove = rows => [...rows].sort((a, b) => {
      const av = finite(a?.change_pct);
      const bv = finite(b?.change_pct);
      return (bv == null ? -Infinity : Math.abs(bv)) - (av == null ? -Infinity : Math.abs(av));
    });
    const structureRows = [...box.structure, ...box.unknownClass].map(member => member.row).filter(Boolean);
    const preferred = byMove(structureRows)[0] || byMove(box.vehicles)[0] || null;
    state.themePageTicker = preferred ? String(preferred.ticker || '').toUpperCase() : ([...allowed][0] || null);
  }
  renderThemePageBriefing();
  if (loadChart && state.themePageTicker) loadThemePageChart(state.themePageTicker, state.themePageChartTf);
  if (history) writeDashboardHistory();
}

function selectThemePageTicker(ticker, { history = true } = {}) {
  if (!state.themePageTheme) return;
  if (!themePageMemberTickers(state.themePageTheme).has(ticker)) return;
  state.themePageTicker = ticker;
  renderThemePageBriefing();
  loadThemePageChart(ticker, state.themePageChartTf);
  if (history) writeDashboardHistory();
}

async function loadThemePageChart(ticker, tf) {
  const request = ++state.themePageChartRequest;
  els.themePageChartHost.innerHTML = '<div class="loading-card" style="width:100%;height:300px">Loading chart…</div>';
  els.themePageChartNote.textContent = tf === '2m' ? 'Delayed 2-minute evidence — execution stays on DAS.' : 'Daily context.';
  try {
    const bars = await fetchChart(ticker, tf);
    if (request !== state.themePageChartRequest || ticker !== state.themePageTicker) return;
    renderCandles(bars, tf, els.themePageChartHost, ticker);
  } catch (error) {
    if (request !== state.themePageChartRequest || ticker !== state.themePageTicker) return;
    els.themePageChartHost.innerHTML = chartErrorMarkup(error, 'theme-page');
  }
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
  let role = '—';
  if (Array.isArray(roles.leaders) && roles.leaders.includes(ticker)) role = 'LEADER';
  else if (Array.isArray(roles.laggards) && roles.laggards.includes(ticker)) role = 'LAGGARD';
  else if (member.isVehicle || (Array.isArray(roles.vehicles) && roles.vehicles.includes(ticker))) role = 'VEHICLE';
  return member.provisional ? `${role === '—' ? '' : `${role} · `}SEAT REVIEW` : role;
}

function themeRosterMembers(members) {
  return [...members].sort((a, b) => (finite(b.row?.change_pct) ?? -Infinity) - (finite(a.row?.change_pct) ?? -Infinity));
}

function renderThemeRoster(theme, members, structure) {
  const rows = themeRosterMembers(members);
  const furthest8 = structure?.furthest8
    ? `${structure.furthest8.ticker} ${fmtSigned(structure.furthest8.row.ema8_dist)}`
    : 'UNKNOWN';
  return `<div class="theme-roster-side" aria-label="${esc(`${themeEma8SideLabel(structure)} · ${themeEma8SideText(structure)} · stored one-decimal distance · furthest ${furthest8}`)}"><strong>${esc(themeEma8SideLabel(structure))}</strong><span class="ma-text">${esc(themeEma8SideText(structure))}</span><small>STORED 0.1% DISTANCE · FURTHEST ${esc(furthest8)}</small></div>
  <div class="theme-roster" role="table" aria-label="Theme member structure">
    <div class="theme-roster-head" role="row"><span>NAME</span><span>ROLE</span><span>D</span><span>BB</span><span>8EMA</span><span>CLASS EMA</span><span>1D</span><span>PRICE</span></div>
    ${rows.map(member => {
      const row = member.row;
      const classEma = !row
        ? '—'
        : row.category === 'SC'
          ? `50 ${fmtSigned(row.ema50_dist_pct)}`
          : row.category === 'ML'
            ? `200 ${fmtSigned(row.ema200_dist_pct)}`
            : '—';
      return `<button type="button" class="theme-roster-row" role="row" data-ticker="${esc(member.ticker)}">
        <strong>${esc(member.ticker)}${member.row ? '' : '<small>UNMEASURED</small>'}</strong>
        <span class="theme-role ${member.isVehicle ? 'vehicle' : ''}">${esc(themeRole(theme, member))}</span>
        <span>${row ? esc(runLabel(row)) : 'D—'}</span>
        <span class="bb-cell">${row ? esc(bbOutsideLabel(row) || '—') : '—'}</span>
        <span class="ma-cell">${row ? fmtSigned(row.ema8_dist) : '—'}</span>
        <span class="ma-cell">${esc(classEma)}</span>
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
  const side = String(row?.bb_completed_side || '');
  const position = finite(row?.bb_completed_position);
  const days = finite(row?.bb_completed_consec);
  const dayLabel = days == null ? 'DAYS UNKNOWN' : `${Math.max(0, Math.trunc(days))}D OUT`;
  if (position == null || days == null || days < 1) return null;
  if (side === 'UPPER') return { value: `+${fmtNumber(position - 100, 0)}% UBB`, note: dayLabel };
  if (side === 'LOWER') return { value: `-${fmtNumber(Math.abs(position), 0)}% LBB`, note: dayLabel };
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
    ? ['50EMA', fmtSigned(row.ema50_dist_pct)]
    : ['200EMA', fmtSigned(row.ema200_dist_pct)];
  const rvol = finite(row.volume_ratio) ?? volumeStats?.ratio ?? null;
  host.innerHTML = [
    bollinger ? metricTile('BOLLINGER', bollinger.value, bollinger.note, 'bb-metric') : '',
    metricTile('8EMA', fmtSigned(row.ema8_dist), 'distance', 'ma-metric'),
    metricTile('D COUNT', runLabel(row), ''),
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

function themeChartReadRows(name) {
  return state.themeChartReads.filter(row => row?.theme === name);
}

function themeSecondOpinionRows(name) {
  const subject = `theme:${themeSlug(name)}`;
  return state.themeReviews.filter(row => String(row?.subject || '').toLowerCase() === subject);
}

function safeEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function renderActiveThemeCatalystLedger(theme, members) {
  if (state.selectedTheme?.name !== theme.name) return;
  const current = document.getElementById('themeCatalystLedger');
  if (current) current.outerHTML = renderThemeCatalystLedger(theme, members);
}

async function loadThemeCatalystDetail(theme, members) {
  const cached = state.themeCatalystDetail.get(theme.name);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < 5 * 60000) return;
  const tickers = members.map(member => String(member?.ticker || '').trim().toUpperCase()).filter(value => /^[A-Z][A-Z0-9.-]{0,9}$/.test(value));
  const request = ++state.themeCatalystRequest;
  state.themeCatalystDetail.set(theme.name, { status: 'loading', requestedAt: Date.now(), news: { status: 'loading' }, filings: { status: 'loading' } });
  renderActiveThemeCatalystLedger(theme, members);
  const newsSince = new Date(Date.now() - 30 * 86400000).toISOString();
  const tickerFilter = `in.(${tickers.join(',')})`;
  const reads = tickers.length ? [
    restGetCounted('news_cache', { select: '*', ticker: tickerFilter, published_at: `gte.${newsSince}`, order: 'published_at.desc', limit: '240' }, { scope: 'theme_members', windowDays: 30, limit: 240 }),
    restGetCounted('filings', { select: '*', ticker: tickerFilter, order: 'detected_at.desc', limit: '240' }, { scope: 'theme_members', limit: 240 }),
  ] : [
    Promise.resolve({ rows: [], total: 0, returned: 0, capped: false, scope: 'theme_members', windowDays: 30, limit: 240 }),
    Promise.resolve({ rows: [], total: 0, returned: 0, capped: false, scope: 'theme_members', limit: 240 }),
  ];
  const [newsResult, filingResult] = await Promise.allSettled(reads);
  if (request !== state.themeCatalystRequest || state.selectedTheme?.name !== theme.name) return;
  const news = newsResult.status === 'fulfilled' ? { status: 'ready', ...newsResult.value } : { status: 'failed' };
  const filings = filingResult.status === 'fulfilled' ? { status: 'ready', ...filingResult.value } : { status: 'failed' };
  state.themeCatalystDetail.set(theme.name, {
    status: news.status === 'ready' && filings.status === 'ready' ? 'ready' : 'partial',
    fetchedAt: Date.now(),
    news,
    filings,
  });
  renderActiveThemeCatalystLedger(theme, members);
}

function catalystCoverageCard(label, status, count, detail) {
  return `<article><header><strong>${esc(label)}</strong><span>${esc(status)}</span></header><p>${esc(count)}</p><small>${esc(detail)}</small></article>`;
}

function catalystExpandedCoverage(sourceClass, coverage, detail) {
  const isNews = sourceClass === 'news';
  const readable = isNews ? coverage.newsReadable : coverage.filingsReadable;
  const matched = isNews ? coverage.newsMatched : coverage.filingsMatched;
  const loaded = isNews ? coverage.newsLoaded : coverage.filingsLoaded;
  if (detail.memberScoped) {
    const total = detail.total == null ? 'UNKNOWN' : detail.total;
    const rows = detail.total == null ? `${detail.returned} LOADED · DENOMINATOR UNKNOWN` : `${detail.returned}/${detail.total} ROWS · ${detail.capped ? 'CAPPED' : 'COMPLETE'}`;
    return {
      status: detail.displayStatus,
      count: readable ? `${matched} UNIQUE / ${total} THEME ROWS` : 'UNIQUE RECEIPTS UNKNOWN',
      detail: isNews ? `30D MEMBER SCOPE · ${rows}` : `ALL RETAINED MEMBER ROWS · ${rows}`,
    };
  }
  const fallback = isNews ? '48H GLOBAL SLICE · UP TO 240 · PARTIAL' : 'NEWEST GLOBAL ROWS · UP TO 240 · PARTIAL';
  const stateNote = detail.displayStatus === 'MEMBER QUERY LOADING'
    ? ' · MEMBER QUERY LOADING'
    : detail.displayStatus === 'MEMBER QUERY FAILED' ? ' · MEMBER QUERY FAILED · GLOBAL FALLBACK' : '';
  return {
    status: detail.displayStatus === 'GLOBAL SLICE' ? catalystLaneStatus(isNews ? 'news' : 'filings') : detail.displayStatus,
    count: readable ? `${matched} MATCHED / ${loaded} LOADED` : 'MATCHED UNKNOWN / LOADED UNKNOWN',
    detail: `${fallback}${stateNote}`,
  };
}

function catalystRelativeTime(value) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms) || ms <= Date.now()) return relativeTime(value);
  const minutes = Math.max(1, Math.ceil((ms - Date.now()) / 60000));
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.ceil(hours / 24)}d`;
}

function renderThemeCatalystEntry(entry, direction = null) {
  const href = safeEvidenceUrl(entry.sourceUrl);
  const source = entry.source || 'source unknown';
  const sourceReceipt = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(source)} · OPEN SOURCE</a>`
    : `<span>${esc(source)} · ${entry.sourceUrl ? 'URL UNAVAILABLE' : 'URL NOT STORED'}</span>`;
  const earningsSession = entry.sourceClass === 'earnings'
    ? ['BMO', 'AMC'].includes(String(entry.row?.session || '').toUpperCase()) ? String(entry.row.session).toUpperCase() : 'SESSION UNKNOWN'
    : null;
  const earningsReceipt = entry.sourceClass === 'earnings' ? themeEarningsEpsReceipt(entry.row, direction) : null;
  return `<article class="theme-catalyst-row">
    <time datetime="${esc(entry.at)}"><strong>${esc(fmtDate(entry.at, true))}</strong><span>${esc(catalystRelativeTime(entry.at))}</span></time>
    <div class="theme-catalyst-kind"><strong>${esc(entry.kind)}</strong><span>${esc([catalystMemberLabel(entry), earningsSession].filter(Boolean).join(' · '))}</span></div>
    <div class="theme-catalyst-title">${esc(cleanContextText(entry.title) || 'Receipt detail unavailable.')}${earningsReceipt ? `<small class="theme-catalyst-eps">${esc(earningsReceipt)}</small>` : ''}</div>
    <div class="theme-catalyst-source">${sourceReceipt}</div>
  </article>`;
}

function renderThemeCatalystGroup(label, entries, emptyCopy) {
  const direction = label === 'UPCOMING' ? 'scheduled' : label === 'OBSERVED' ? 'observed' : null;
  return `<section class="theme-catalyst-group"><header><strong>${esc(label)}</strong><span>${entries.length} ${entries.length === 1 ? 'RECEIPT' : 'RECEIPTS'}</span></header>${entries.length ? entries.map(entry => renderThemeCatalystEntry(entry, direction)).join('') : `<div class="theme-catalyst-empty">${esc(emptyCopy)}</div>`}</section>`;
}

function catalystSourceClassLabel(sourceClass) {
  if (sourceClass === 'filing') return 'SEC';
  if (sourceClass === 'earnings') return 'EARNINGS';
  if (sourceClass === 'news') return 'NEWS';
  return 'SOURCE UNKNOWN';
}

function catalystSessionMatchReceipt(session) {
  if (session.matchState === 'matched') return { value: fmtSigned(session.themeMove), detail: 'EXACT ET DATE MATCH' };
  if (session.matchState === 'move_unknown') return { value: '—', detail: 'STORED DATE · MOVE UNKNOWN' };
  if (session.matchState === 'contested') return { value: '—', detail: 'CONFLICTING STORED MOVES' };
  if (session.matchState === 'date_unknown') return { value: '—', detail: 'DATE UNKNOWN · NOT ALIGNABLE' };
  return { value: '—', detail: 'NO STORED THEME TAPE FOR DATE' };
}

function renderThemeCatalystSession(session) {
  const match = catalystSessionMatchReceipt(session);
  const dateLabel = session.date ? `${fmtDate(`${session.date}T12:00:00Z`)} · ET` : 'DATE UNKNOWN';
  const sourceLabels = session.sourceClasses.map(catalystSourceClassLabel).join(' + ');
  const breadth = `${session.receiptCount} ${session.receiptCount === 1 ? 'RECEIPT' : 'RECEIPTS'} · ${session.memberCount} ${session.memberCount === 1 ? 'MEMBER' : 'MEMBERS'} · ${session.sourceCount} ${session.sourceCount === 1 ? 'SOURCE TYPE' : 'SOURCE TYPES'} · ${sourceLabels}`;
  return `<section class="theme-catalyst-session ${esc(session.matchState)}">
    <header>
      <div><strong>${esc(dateLabel)}</strong><span>${esc(breadth)}</span></div>
      <div class="theme-catalyst-session-move"><small>STORED SAME-DATE THEME MOVE</small><strong class="${moveClass(session.themeMove)}">${esc(match.value)}</strong><span>${esc(match.detail)}</span></div>
    </header>
    <div>${session.entries.map(entry => renderThemeCatalystEntry(entry, 'observed')).join('')}</div>
  </section>`;
}

function renderThemeCatalystSessions(sessions, emptyCopy) {
  return `<section class="theme-catalyst-group theme-catalyst-observed"><header><strong>OBSERVED · ET DATE GROUPS · NEWEST FIRST</strong><span>${sessions.length} ${sessions.length === 1 ? 'DATE' : 'DATES'}</span></header>${sessions.length ? sessions.map(renderThemeCatalystSession).join('') : `<div class="theme-catalyst-empty">${esc(emptyCopy)}</div>`}</section>`;
}

function catalystMemberSourceState(sourceClass, tape) {
  const coverage = tape.coverage;
  if (sourceClass === 'earnings') {
    return coverage.calendarReadable
      ? { state: 'partial', detail: `BOUNDED SNAPSHOT · ${coverage.calendarMatched} MAPPED / ${coverage.calendarLoaded} LOADED` }
      : { state: 'unavailable', detail: 'SNAPSHOT UNAVAILABLE' };
  }
  const isNews = sourceClass === 'news';
  const detail = tape.detailCoverage[isNews ? 'news' : 'filings'];
  const readable = isNews ? coverage.newsReadable : coverage.filingsReadable;
  const loaded = isNews ? coverage.newsLoaded : coverage.filingsLoaded;
  if (detail.memberScoped) {
    const count = detail.total == null ? `${detail.returned} LOADED · DENOMINATOR UNKNOWN` : `${detail.returned}/${detail.total} ROWS`;
    return {
      state: detail.total != null && !detail.capped ? 'complete' : 'partial',
      detail: `${isNews ? '30D' : 'ALL RETAINED'} MEMBER SCOPE · ${count}${detail.capped ? ' · CAPPED' : detail.total != null ? ' · COMPLETE' : ''}`,
    };
  }
  if (detail.displayStatus === 'MEMBER QUERY LOADING') return { state: 'loading', detail: `${loaded ?? 'UNKNOWN'} GLOBAL FALLBACK ROWS · MEMBER QUERY LOADING` };
  if (readable) return { state: 'partial', detail: `${loaded} GLOBAL FALLBACK ROWS · ${detail.displayStatus === 'MEMBER QUERY FAILED' ? 'MEMBER QUERY FAILED' : 'MEMBER QUERY NOT READY'}` };
  return { state: 'unavailable', detail: detail.displayStatus === 'MEMBER QUERY FAILED' ? 'MEMBER QUERY FAILED · NO READABLE FALLBACK' : 'SOURCE UNAVAILABLE' };
}

function catalystMemberCell(sourceClass, source, counts) {
  if (source.state === 'unavailable') return '<span class="theme-catalyst-member-cell unavailable" role="cell"><strong>—</strong><small>UNKNOWN</small></span>';
  const detail = source.state === 'complete' ? 'IN WINDOW' : source.state === 'loading' ? 'LOADED · REFRESHING' : 'IN LOADED';
  const scheduled = sourceClass === 'earnings' ? ` · S${counts.scheduled}` : '';
  const accessible = `${catalystSourceClassLabel(sourceClass)}: ${counts.observed} observed${sourceClass === 'earnings' ? `, ${counts.scheduled} scheduled` : ''}, ${counts.unassigned} direction unknown; ${detail.toLowerCase()}`;
  return `<span class="theme-catalyst-member-cell" role="cell" aria-label="${esc(accessible)}"><strong>O${counts.observed}${scheduled} · ?${counts.unassigned}</strong><small>${esc(detail)}</small></span>`;
}

function catalystMemberCoverageSummary(coverage) {
  if (coverage?.coverageKnown === false) {
    return {
      headline: 'OBSERVED / SCHEDULED UNKNOWN',
      detail: 'MEMBER COVERAGE UNKNOWN',
      noReceipt: 'OBSERVED MEMBER COVERAGE UNKNOWN',
    };
  }
  const unobservedTickers = Array.isArray(coverage?.unobservedTickers) ? coverage.unobservedTickers : [];
  return {
    headline: `${coverage.observedCount}/${coverage.trackedCount} OBSERVED · ${coverage.scheduledCount}/${coverage.trackedCount} SCHEDULED`,
    detail: `${coverage.unobservedCount} WITH 0 OBSERVED${coverage.unassignedCount ? ` · ${coverage.unassignedCount} WITH ? DIRECTION` : ''}`,
    noReceipt: unobservedTickers.length
      ? `0 OBSERVED IN LOADED WINDOWS · ${unobservedTickers.join(' · ')}`
      : 'EVERY TRACKED MEMBER HAS AT LEAST ONE LOADED RECEIPT',
  };
}

function renderThemeCatalystMemberCoverage(coverage) {
  const sourceOrder = ['news', 'filing', 'earnings'];
  const readableSources = sourceOrder.filter(sourceClass => coverage.sources[sourceClass].state !== 'unavailable').length;
  const summary = catalystMemberCoverageSummary(coverage);
  const sourceHead = sourceClass => `<span role="columnheader"><strong>${esc(catalystSourceClassLabel(sourceClass))}</strong><small>${esc(coverage.sources[sourceClass].state.toUpperCase())}</small></span>`;
  const rows = coverage.members.map(row => {
    const total = readableSources ? `<strong>O${row.observedTotal} · S${row.scheduledTotal} · ?${row.unassignedTotal}</strong><small>${row.hasObserved ? 'OBSERVED LOADED' : row.hasScheduled ? 'SCHEDULED ONLY' : row.hasUnassigned ? 'DIRECTION UNKNOWN' : 'IN LOADED WINDOWS'}</small>` : '<strong>—</strong><small>UNKNOWN</small>';
    return `<div class="theme-catalyst-member-row ${row.hasObserved ? 'observed' : row.hasScheduled ? 'scheduled-only' : 'unobserved'}" role="row">
      <strong role="cell">${esc(row.memberTicker)}</strong>
      ${sourceOrder.map(sourceClass => catalystMemberCell(sourceClass, coverage.sources[sourceClass], row.sourceCounts[sourceClass])).join('')}
      <span class="theme-catalyst-member-cell total" role="cell">${total}</span>
    </div>`;
  }).join('');
  return `<section class="theme-catalyst-members">
    <header><div><strong>MEMBER RECEIPT COVERAGE</strong><span>${summary.headline}</span></div><small>${summary.detail}</small></header>
    <div class="theme-catalyst-member-table" role="table" aria-label="Observed, scheduled, and direction-unknown catalyst receipt coverage across tracked Theme members">
      <div class="theme-catalyst-member-head" role="row"><span role="columnheader"><strong>MEMBER</strong><small>TRACKED ORDER</small></span>${sourceOrder.map(sourceHead).join('')}<span role="columnheader"><strong>TOTAL</strong><small>LOADED</small></span></div>
      ${rows || '<div class="theme-catalyst-empty">No tracked members are available.</div>'}
    </div>
    <div class="theme-catalyst-member-source-state">${sourceOrder.map(sourceClass => `<span><strong>${esc(catalystSourceClassLabel(sourceClass))} · ${esc(coverage.sources[sourceClass].state.toUpperCase())}</strong>${esc(coverage.sources[sourceClass].detail || 'DETAIL UNAVAILABLE')}</span>`).join('')}</div>
    <p>${esc(summary.noReceipt)} · This is windowed coverage, not invalidation or a no-catalyst claim. Unknown is never zero.</p>
  </section>`;
}

function renderThemeCatalystLedger(theme, members) {
  const tape = themeCatalystTape(theme, members, { expanded: true });
  const observedSessions = buildThemeCatalystSessions({ entries: tape.observed, themeTape: theme?.deep?.tape });
  const memberCoverage = buildThemeCatalystMemberCoverage({
    members: themeRosterMembers(members),
    entries: tape.memberCoverageEntries,
    sourceStates: {
      news: catalystMemberSourceState('news', tape),
      filing: catalystMemberSourceState('filing', tape),
      earnings: catalystMemberSourceState('earnings', tape),
    },
  });
  const coverage = tape.coverage;
  const newsCoverage = catalystExpandedCoverage('news', coverage, tape.detailCoverage.news);
  const filingCoverage = catalystExpandedCoverage('filings', coverage, tape.detailCoverage.filings);
  const calendarAge = coverage.calendarGeneratedAt ? relativeTime(coverage.calendarGeneratedAt) : 'AGE UNKNOWN';
  const readable = coverage.newsReadable || coverage.filingsReadable || coverage.calendarReadable;
  const receiptCount = tape.entries.length;
  const emptyCopy = readable
    ? 'No member receipt in the loaded slices. This is not a no-catalyst claim.'
    : 'Catalyst sources are unavailable. Receipt coverage is unknown.';
  return `<section class="theme-evidence-panel theme-catalyst-panel" id="themeCatalystLedger">
    <div class="theme-panel-head"><div><div class="theme-overview-label">CATALYST LEDGER</div><h3>Observed and scheduled member receipts — no causal claim</h3></div><span>${receiptCount} ${receiptCount === 1 ? 'RECEIPT' : 'RECEIPTS'} IN LOADED SLICES</span></div>
    <div class="theme-catalyst-coverage">
      ${catalystCoverageCard('NEWS', newsCoverage.status, newsCoverage.count, newsCoverage.detail)}
      ${catalystCoverageCard('SEC', filingCoverage.status, filingCoverage.count, filingCoverage.detail)}
      ${catalystCoverageCard('EARNINGS', catalystLaneStatus('breadthSnapshot'), coverage.calendarReadable ? `${coverage.calendarMatched} MATCHED / ${coverage.calendarLoaded} LOADED` : 'MATCHED UNKNOWN / LOADED UNKNOWN', `SNAPSHOT · ${calendarAge} · BOUNDED`)}
    </div>
    <p class="theme-catalyst-warning">Missing receipt does not mean no catalyst. Exact ET date alignment is observation only; it does not claim a receipt caused the stored Theme move.</p>
    ${renderThemeCatalystMemberCoverage(memberCoverage)}
    <div class="theme-catalyst-timeline">
      ${renderThemeCatalystGroup('UPCOMING', tape.upcoming, coverage.calendarReadable ? 'No upcoming mapped member earnings in the current snapshot.' : 'Calendar snapshot unavailable.')}
      ${tape.unassigned.length ? renderThemeCatalystGroup('DIRECTION UNKNOWN', tape.unassigned, '') : ''}
      ${renderThemeCatalystSessions(observedSessions, emptyCopy)}
    </div>
  </section>`;
}

function themeAttentionIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const ticker = String(row?.ticker || '').toUpperCase();
    if (!ticker) continue;
    let entry = index.get(ticker);
    if (!entry) {
      entry = { latestAt: row?.captured_at || null, rate: null, velocity: null, rateAt: null, rateSource: null, saturated: false, rank: null, rankSource: null };
      index.set(ticker, entry);
    }
    if (entry.rate == null && row?.msg_count != null && finite(row?.window_minutes) > 0) {
      entry.rate = finite(row.msg_count) / finite(row.window_minutes) * 60;
      entry.velocity = finite(row?.velocity_multiple);
      entry.rateAt = row?.captured_at || null;
      entry.rateSource = row?.source || null;
      entry.saturated = finite(row?.window_minutes) < 60;
    }
    if (entry.rank == null && finite(row?.trending_rank) != null) {
      entry.rank = finite(row.trending_rank);
      entry.rankSource = row?.source || null;
    }
  }
  return index;
}

function attentionSourceLabel(source) {
  const value = String(source || '').toLowerCase();
  if (value === 'stocktwits') return 'ST';
  if (value === 'reddit') return 'REDDIT';
  return value ? value.toUpperCase() : 'SOURCE UNKNOWN';
}

function attentionWindowLabel(payload) {
  if (finite(payload?.windowHours) != null) return `${fmtNumber(payload.windowHours, 0)}h`;
  if (finite(payload?.windowDays) != null) return `${fmtNumber(payload.windowDays, 0)}d`;
  return 'window unknown';
}

function countedEvidenceFooter(table, payload) {
  if (!payload) return `${table} · source unavailable`;
  const window = attentionWindowLabel(payload);
  const total = payload.total == null ? 'global total unknown' : `${payload.total.toLocaleString('en-US')} global rows`;
  if (payload.total == null) return `${table} · ${window} window · ${total} · denominator unavailable`;
  if (!payload.capped) return `${table} · ${window} window · ${total} · complete window`;
  const requested = payload.limit && payload.limit !== payload.returned ? ` (requested ${payload.limit})` : '';
  return `${table} · ${window} window · ${total} · global slice capped after ${payload.returned} rows${requested}`;
}

function attentionCoverageFooter(payload) {
  if (!payload || payload.registryTotal == null) return 'active registry denominator unavailable';
  const absent = Array.isArray(payload.registryConfirmedAbsent) ? payload.registryConfirmedAbsent.length : 0;
  const unresolved = Array.isArray(payload.registryUnresolved) ? payload.registryUnresolved.length : 0;
  const requests = payload.requestCount === 1 ? '1 request' : `${payload.requestCount || 1} requests`;
  if (payload.coverageComplete) {
    return `latest coverage complete · ${payload.registryObserved}/${payload.registryTotal} active members observed${absent ? ` · ${absent} confirmed without a ${attentionWindowLabel(payload)} observation` : ''} · ${requests}`;
  }
  return `latest coverage incomplete · ${payload.registryObserved}/${payload.registryTotal} active members observed · ${unresolved} unresolved${payload.coverageError ? ' · recovery failed' : ''} · ${requests}`;
}

function renderThemeAttentionEvidence(members) {
  const lane = selectAttentionLane(state.themeAttentionLive, state.themeAttention);
  const payload = lane.payload;
  if (!payload) return `<article class="theme-operation-column"><header><strong>CROWD OBSERVATIONS</strong><span>UNAVAILABLE</span></header><div class="theme-operation-empty">Attention snapshots were not readable. Unknown is not quiet.</div></article>`;
  const index = themeAttentionIndex(payload.rows);
  const rows = members.map(member => ({ ticker: member.ticker, evidence: index.get(String(member.ticker || '').toUpperCase()) || null }))
    .sort((a, b) => {
      if (!!a.evidence !== !!b.evidence) return a.evidence ? -1 : 1;
      const velocityDelta = (b.evidence?.velocity ?? -Infinity) - (a.evidence?.velocity ?? -Infinity);
      if (velocityDelta) return velocityDelta;
      const rateDelta = (b.evidence?.rate ?? -Infinity) - (a.evidence?.rate ?? -Infinity);
      return rateDelta || a.ticker.localeCompare(b.ticker);
    });
  const covered = rows.filter(row => row.evidence).length;
  const body = rows.map(({ ticker, evidence }) => {
    if (!evidence) return `<div class="theme-operation-row"><strong>${esc(ticker)}</strong><span>not observed in the fetched slice</span><time>unknown</time></div>`;
    const rate = evidence.rate == null ? 'rate unknown' : `${fmtNumber(evidence.rate, 1)}${evidence.saturated ? '+' : ''}/hr ${attentionSourceLabel(evidence.rateSource)}`;
    const velocity = evidence.velocity == null ? 'baseline multiple unknown' : `${fmtNumber(evidence.velocity, 1)}× own same-hour median`;
    const rank = evidence.rank == null ? null : `${attentionSourceLabel(evidence.rankSource)} trending #${Math.trunc(evidence.rank)}`;
    return `<div class="theme-operation-row"><strong>${esc(ticker)}</strong><span>${esc([rate, velocity, rank].filter(Boolean).join(' · '))}</span><time>${esc(relativeTime(evidence.latestAt || evidence.rateAt))}</time></div>`;
  }).join('');
  const evidenceState = lane.reason === 'live_empty_archive_unavailable'
    ? 'NO LIVE 2H ROWS · ARCHIVE UNAVAILABLE'
    : lane.mode === 'live'
      ? `LIVE ${attentionWindowLabel(payload).toUpperCase()}`
    : lane.reason === 'live_unavailable'
      ? 'LIVE 2H UNAVAILABLE · LAST OBSERVED, NOT LIVE'
      : 'NO LIVE 2H ROWS · LAST OBSERVED, NOT LIVE';
  return `<article class="theme-operation-column"><header><strong>CROWD OBSERVATIONS</strong><span>${covered}/${members.length} MEMBERS</span></header><div class="theme-operation-list">${body || '<div class="theme-operation-empty">No registry members to measure.</div>'}</div><footer>${esc(evidenceState)} · ${esc(attentionCoverageFooter(payload))} · ${esc(countedEvidenceFooter('attention_snapshots', payload))}</footer></article>`;
}

function renderThemeTriggerEvidence(theme) {
  const meta = state.themeDossierMeta;
  if (!meta) return `<article class="theme-operation-column"><header><strong>WHY IT FIRED</strong><span>UNAVAILABLE</span></header><div class="theme-operation-empty">Dossier receipts were not readable. No trigger history or cause is inferred.</div></article>`;
  const rows = themeDossierRows(theme.name).filter(row => row?.provenance?.trigger?.kind);
  const complete = meta?.total != null && meta.capped === false;
  const body = rows.map(row => {
    const trigger = row.provenance.trigger;
    const alerts = Array.isArray(trigger.alert_ids) && trigger.alert_ids.length ? ` · alert ${trigger.alert_ids.map(id => `#${id}`).join(', ')}` : '';
    const outcome = row.provenance.outcome === 'expired_unread' ? ' · expired unread' : '';
    return `<div class="theme-operation-row"><strong>${esc(String(trigger.kind).toUpperCase())}</strong><span>${esc(trigger.line || `${trigger.source || 'trigger'} receipt`)}${esc(alerts + outcome)}</span><time>${esc(relativeTime(row.at))}</time></div>`;
  }).join('');
  const count = complete ? rows.length : `AT LEAST ${rows.length}`;
  return `<article class="theme-operation-column"><header><strong>WHY IT FIRED</strong><span>${count} RECEIPTS</span></header><div class="theme-operation-list">${body || '<div class="theme-operation-empty">No stored trigger receipt for this theme in the loaded window. No cause is inferred.</div>'}</div><footer>${esc(countedEvidenceFooter('theme_dossiers', meta))}</footer></article>`;
}

const THEME_CURATION_ACTION = {
  add_theme: 'theme added',
  add_member: 'member added',
  remove_member: 'member removed',
  deactivate_theme: 'theme deactivated',
  set_provisional: 'provisional state changed',
  set_provisional_member: 'provisional member changed',
};

function renderThemeCurationEvidence(theme) {
  const payload = state.themeCuration;
  if (!payload) return `<article class="theme-operation-column"><header><strong>MEMBERSHIP HISTORY</strong><span>UNAVAILABLE</span></header><div class="theme-operation-empty">Curation receipts were not readable. No history is inferred from the current roster.</div></article>`;
  const rows = payload.rows.filter(row => row?.theme === theme.name);
  const complete = payload.total != null && payload.capped === false;
  const body = rows.map(row => {
    const action = THEME_CURATION_ACTION[row.action] || String(row.action || 'change').replaceAll('_', ' ');
    const actor = String(row.actor || 'actor unknown').replaceAll('_', ' ');
    const applied = row.applied === false ? ' · NOT APPLIED' : '';
    return `<div class="theme-operation-row"><strong>${esc(row.ticker || 'THEME')}</strong><span>${esc(`${action} · ${actor}${applied}`)}</span><time>${esc(relativeTime(row.at))}</time></div>`;
  }).join('');
  const count = complete ? rows.length : `AT LEAST ${rows.length}`;
  return `<article class="theme-operation-column"><header><strong>MEMBERSHIP HISTORY</strong><span>${count} CHANGES</span></header><div class="theme-operation-list">${body || '<div class="theme-operation-empty">0 curation receipts for this theme in the loaded window.</div>'}</div><footer>${esc(countedEvidenceFooter('theme_curation_log', payload))}</footer></article>`;
}

function renderThemeOperationalEvidence(theme, members) {
  return `<section class="theme-evidence-panel theme-operation-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">EVIDENCE TAPE</div><h3>Observations and stored receipts — no score</h3></div><span>READ-ONLY CONTEXT</span></div><div class="theme-operation-grid">${renderThemeAttentionEvidence(members)}${renderThemeTriggerEvidence(theme)}${renderThemeCurationEvidence(theme)}</div></section>`;
}

function renderDossierEntry(row, { latest = false } = {}) {
  const claims = Array.isArray(row?.evidence) ? row.evidence : [];
  const sources = Array.isArray(row?.provenance?.sources) ? row.provenance.sources : [];
  const backend = evidenceBackend(row);
  return `<article class="theme-evidence-entry ${latest ? 'latest' : ''}">
    <header><strong>${esc(String(row?.kind || 'story').replaceAll('_', ' ').toUpperCase())}</strong><span>${esc([backend?.toUpperCase(), row?.at ? relativeTime(row.at) : null].filter(Boolean).join(' · ') || 'RECEIPT UNKNOWN')}</span></header>
    <p>${esc(cleanThemeContextText(row?.story) || 'Story text unavailable.')}</p>
    ${claims.length ? `<div class="theme-evidence-claims">${claims.map(item => `<div><strong>${esc(item?.when || 'DATE UNKNOWN')}</strong><span>${esc(item?.claim || 'Claim text unavailable.')}</span><small>${esc(item?.source || 'SOURCE UNKNOWN')}</small></div>`).join('')}</div>` : ''}
    ${sources.length ? `<details><summary>SOURCE RECEIPTS · ${sources.length}</summary><div class="theme-source-links">${sources.map(item => {
      const href = safeEvidenceUrl(item?.url);
      const label = item?.title || item?.source || href || 'source';
      const meta = [item?.source, item?.when].filter(Boolean).join(' · ');
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"><span>${esc(label)}</span><small>${esc(meta)}</small></a>`
        : `<span><span>${esc(label)}</span><small>${esc(meta || 'URL unavailable')}</small></span>`;
    }).join('')}</div></details>` : ''}
  </article>`;
}

function renderThemeDossierHistory(theme) {
  const rows = themeDossierRows(theme.name);
  const status = state.laneStatus.themeDossiers?.status;
  if (!rows.length) return `<section class="theme-evidence-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">CROWD STORY LEDGER</div><h3>No dossier entries in the 30-day window</h3></div><span>${esc(status === 'fresh' ? 'READ COMPLETE' : 'SOURCE UNAVAILABLE')}</span></div></section>`;
  return `<section class="theme-evidence-panel">
    <div class="theme-panel-head"><div><div class="theme-overview-label">CROWD STORY LEDGER</div><h3>What the crowd was saying, with receipts</h3></div><span>${rows.length} ${rows.length === 1 ? 'ENTRY' : 'ENTRIES'} · 30D</span></div>
    ${renderDossierEntry(rows[0], { latest: true })}
    ${rows.length > 1 ? `<details class="theme-evidence-history"><summary>EARLIER STORY STATES · ${rows.length - 1}</summary>${rows.slice(1).map(row => renderDossierEntry(row)).join('')}</details>` : ''}
  </section>`;
}

function renderChartReadEntry(row, { latest = false } = {}) {
  const agreement = row?.agrees === true ? 'AGREES WITH CENSUS' : row?.agrees === false ? 'DISAGREES WITH CENSUS' : 'AGREEMENT UNKNOWN';
  return `<article class="theme-evidence-entry ${latest ? 'latest' : ''}">
    <header><strong>${esc(row?.chart_read || 'READ UNKNOWN')} · ${esc(agreement)}</strong><span>${esc([row?.slot?.toUpperCase(), row?.read_at ? relativeTime(row.read_at) : null].filter(Boolean).join(' · ') || 'RECEIPT UNKNOWN')}</span></header>
    <p>${esc(cleanThemeContextText(row?.why) || 'Chart reasoning unavailable.')}</p>
    <div class="theme-evidence-lines">
      <span><strong>LEADER</strong>${esc(row?.leader || '—')}</span>
      <span><strong>WATCH FOR</strong>${esc(cleanThemeContextText(row?.watch_for) || '—')}</span>
      <span><strong>CENSUS STAGE</strong>${esc(row?.census_stage || '—')}</span>
    </div>
  </article>`;
}

function renderThemeChartDesk(theme) {
  const rows = themeChartReadRows(theme.name);
  const status = state.laneStatus.themeChartReads?.status;
  if (!rows.length) return `<section class="theme-evidence-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">CHART DESK</div><h3>No chart read in the 7-day window</h3></div><span>${esc(status === 'fresh' ? 'READ COMPLETE' : 'SOURCE UNAVAILABLE')}</span></div></section>`;
  return `<section class="theme-evidence-panel">
    <div class="theme-panel-head"><div><div class="theme-overview-label">CHART DESK</div><h3>Independent chart structure and what changes it</h3></div><span>${rows.length} ${rows.length === 1 ? 'READ' : 'READS'} · 7D</span></div>
    ${renderChartReadEntry(rows[0], { latest: true })}
    ${rows.length > 1 ? `<details class="theme-evidence-history"><summary>PRIOR CHART READS · ${rows.length - 1}</summary>${rows.slice(1).map(row => renderChartReadEntry(row)).join('')}</details>` : ''}
  </section>`;
}

function renderReviewEntry(row, { latest = false } = {}) {
  return `<article class="theme-evidence-entry ${latest ? 'latest' : ''}">
    <header><strong>${esc(cleanThemeContextText(row?.verdict)?.toUpperCase() || 'VERDICT UNKNOWN')}</strong><span>${esc([String(row?.source || 'second opinion').toUpperCase(), row?.at ? relativeTime(row.at) : null].filter(Boolean).join(' · '))}</span></header>
    <p>${esc(cleanThemeContextText(row?.evidence) || 'Supporting evidence unavailable.')}</p>
  </article>`;
}

function renderThemeSecondOpinions(theme) {
  const rows = themeSecondOpinionRows(theme.name);
  const status = state.laneStatus.themeReviews?.status;
  if (!rows.length) return `<section class="theme-evidence-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">SECOND OPINION</div><h3>No independent review in the 7-day window</h3></div><span>${esc(status === 'fresh' ? 'READ COMPLETE' : 'SOURCE UNAVAILABLE')}</span></div></section>`;
  return `<section class="theme-evidence-panel">
    <div class="theme-panel-head"><div><div class="theme-overview-label">SECOND OPINION</div><h3>Agreement and dissent stay separate</h3></div><span>${rows.length} ${rows.length === 1 ? 'REVIEW' : 'REVIEWS'} · 7D</span></div>
    ${renderReviewEntry(rows[0], { latest: true })}
    ${rows.length > 1 ? `<details class="theme-evidence-history"><summary>PRIOR REVIEWS · ${rows.length - 1}</summary>${rows.slice(1).map(row => renderReviewEntry(row)).join('')}</details>` : ''}
  </section>`;
}

function renderThemeRegistryEvidence(theme, members) {
  const registry = themeRegistryRow(theme.name);
  if (!registry) return `<section class="theme-evidence-panel"><div class="theme-panel-head"><div><div class="theme-overview-label">MEMBERSHIP RECEIPT</div><h3>Registry row unavailable</h3></div></div></section>`;
  const provisionalMembers = registry.provisional_members && typeof registry.provisional_members === 'object' && !Array.isArray(registry.provisional_members)
    ? Object.entries(registry.provisional_members)
    : [];
  const unmeasured = members.filter(member => !member.row);
  const sectors = Array.isArray(registry.sector_cross) ? registry.sector_cross.filter(Boolean) : [];
  return `<section class="theme-evidence-panel">
    <div class="theme-panel-head"><div><div class="theme-overview-label">MEMBERSHIP RECEIPT</div><h3>Registry truth versus measured coverage</h3></div><span>${registry.provisional === true ? 'PROVISIONAL THEME' : 'RATIFIED THEME'}</span></div>
    <div class="theme-membership-facts">
      <span><small>REGISTRY MEMBERS</small><strong>${Array.isArray(registry.constituents) ? registry.constituents.length : '—'}</strong></span>
      <span><small>MEASURED ROWS</small><strong>${members.filter(member => member.row).length}</strong></span>
      <span><small>UNMEASURED</small><strong>${unmeasured.length}</strong></span>
      <span><small>SEATS ON REVIEW</small><strong>${provisionalMembers.length}</strong></span>
    </div>
    ${cleanThemeContextText(registry.description) ? `<p class="theme-registry-description">${esc(cleanThemeContextText(registry.description))}</p>` : ''}
    ${sectors.length ? `<div class="theme-registry-list"><strong>SECTOR CROSS</strong><span>${esc(sectors.join(' · '))}</span></div>` : ''}
    ${unmeasured.length ? `<div class="theme-registry-list warning"><strong>NO CURRENT MEASUREMENT</strong><span>${esc(unmeasured.map(member => member.ticker).join(' · '))}</span></div>` : ''}
    ${provisionalMembers.length ? `<div class="theme-seat-review-list">${provisionalMembers.map(([ticker, evidence]) => `<article><strong>${esc(ticker)}</strong><span>${esc([evidence?.seat_reason, evidence?.source, evidence?.since ? `since ${fmtDate(evidence.since, true)}` : null].filter(Boolean).join(' · ') || 'SEAT EVIDENCE UNKNOWN')}</span><small>${esc([
      finite(evidence?.comove) == null ? null : `CO-MOVE ${fmtNumber(evidence.comove, 2)}`,
      finite(evidence?.comove_floor) == null ? null : `FLOOR ${fmtNumber(evidence.comove_floor, 2)}`,
      finite(evidence?.atr_multiple) == null ? null : `${fmtNumber(evidence.atr_multiple, 1)} ATR`,
    ].filter(Boolean).join(' · ') || 'MEASUREMENTS UNKNOWN')}</small></article>`).join('')}</div>` : ''}
  </section>`;
}

function openThemeOverview(name, { history = true } = {}) {
  const theme = state.themes.find(item => item.name === name);
  if (!theme) return;
  state.selectedTheme = theme;
  state.themePageTheme = theme;
  els.themeOverviewTitle.textContent = theme.name;
  const boardRead = themeBoardRead(theme);
  const move7d = themeTapeMove(theme, 7);
  const readStamp = [boardRead.source, boardRead.at ? relativeTime(boardRead.at) : null].filter(Boolean).join(' · ');
  const readContract = themeDeepContractState(theme);
  const build = themeBuildReceipt(theme);
  els.themeOverviewMeta.innerHTML = `${themeStageReceiptMarkup(theme)} ${themeBuildBadge(build)} · 1D <span class="${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</span> · 3D <span class="${moveClass(theme.mov_3d)}">${fmtSigned(theme.mov_3d)}</span> · 7D <span class="${moveClass(move7d)}">${fmtSigned(move7d)}</span>${readStamp ? ` · ${esc(readStamp)}` : ''}${readContract === 'legacy' ? ' · <span class="theme-contract-warning">LEGACY D LANGUAGE</span>' : readContract === 'canonical' ? ' · D CONTRACT V2' : ''}`;
  const story = deepText(theme, 'story') || themeNarrative(theme);
  const driver = themeBoardDriver(theme);
  const falsifier = deepText(theme, 'falsifier');
  const members = themeMembers(theme);
  const census = themeCensusMembers(theme, members);
  const rosterStructure = themeStructureEvidence(census.members, census.scope);
  const structure = members.filter(member => member.category === 'ML');
  const vehicles = members.filter(member => member.category === 'SC');
  const unknown = members.filter(member => member.category == null);
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
        ${unknown.length ? `<div class="theme-mover-group"><strong>CLASS UNKNOWN</strong><div>${moverLine(unknown)}</div></div>` : ''}
      </div>
      <div class="theme-overview-label theme-read-label">CURRENT READ</div>
      <div class="theme-read-line"><strong>BUILD EPISODE</strong><span>${esc(themeBuildEvidenceText(build))}</span></div>
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
      ${renderThemeRoster(theme, members, rosterStructure)}
    </section>
    <section class="theme-map-panel">
      <div class="theme-panel-head"><div><div class="theme-overview-label">THE NAMES</div><h3>Market-cap heat map</h3></div><div class="heat-legend"><span>DOWN</span><i class="legend-down"></i><i class="legend-flat"></i><i class="legend-up"></i><span>UP</span></div></div>
      <div class="theme-expanded-treemap">${renderTreemapMemberTiles(theme)}</div>
    </section>
    ${renderThemeOperationalEvidence(theme, members)}
    ${renderThemeCatalystLedger(theme, members)}
    ${renderThemeTimeline(theme)}
    ${renderThemeRegistryEvidence(theme, members)}
    ${renderThemeChartDesk(theme)}
    ${renderThemeDossierHistory(theme)}
    ${renderThemeSecondOpinions(theme)}
    <section class="theme-feed-panel">
      ${renderThemeNarrative(theme)}
      ${renderThemeNews(theme, members)}
    </section>`;
  document.body.style.overflow = 'hidden';
  els.detailBackdrop.hidden = false;
  els.themeOverview.classList.add('open');
  els.themeOverview.setAttribute('aria-hidden', 'false');
  loadThemeCatalystDetail(theme, members);
  if (state.themeChartTicker) selectThemeChartTicker(state.themeChartTicker);
  if (history) writeDashboardHistory();
}

function closeThemeOverview({ history = true } = {}) {
  state.chartRequest += 1;
  state.themeMetricRequest += 1;
  state.themeCatalystRequest += 1;
  state.selectedTheme = null;
  state.themeChartTicker = null;
  els.themeOverview.classList.remove('open');
  els.themeOverview.setAttribute('aria-hidden', 'true');
  if (els.regimeChartModal.hidden) {
    els.detailBackdrop.hidden = true;
    document.body.style.overflow = '';
  }
  if (history) writeDashboardHistory();
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
    <section class="breadth-panel event-odds-panel" aria-labelledby="eventOddsTitle" data-stale-keys="predictionSnapshot">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">PUBLIC EVENT MARKETS · READ ONLY</div><h3 id="eventOddsTitle">Event odds</h3></div>
        <span>${countLabel(predictionSnapshot?.coverage?.contracts_measured)}/${countLabel(predictionSnapshot?.coverage?.contracts_expected)} measured · snapshot ${relativeTime(predictionSnapshot?.generated_at)}</span>
      </div>
      <p class="breadth-definition">${esc(predictionSnapshot?.definition || 'Venue-implied probabilities are unavailable.')}</p>
      ${renderPredictionMarkets(predictionSnapshot)}
    </section>

    <section class="breadth-panel" aria-labelledby="entryBreadthTitle" data-stale-keys="breadthSnapshot">
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

    <section class="breadth-panel" aria-labelledby="themeTapeTitle" data-stale-keys="breadthSnapshot">
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

    <section class="breadth-panel" aria-labelledby="cotTitle" data-stale-keys="breadthSnapshot">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">OFFICIAL CFTC · WEEKLY POSITIONING</div><h3 id="cotTitle">Commitments of Traders</h3></div>
        <span>Positions ${esc(cot?.report_date || 'date unknown')} · ${countLabel(cot?.contracts_measured)}/${countLabel(cot?.contracts_expected)} contracts</span>
      </div>
      <p class="breadth-definition">${esc(cot?.cadence || '')}</p>
      ${renderCotPositioning(cot)}
    </section>

    <section class="breadth-panel" aria-labelledby="calendarTitle" data-stale-keys="breadthSnapshot">
      <div class="breadth-panel-head">
        <div><div class="book-kicker">VERIFIED SCHEDULES · ECONOMIC + EARNINGS</div><h3 id="calendarTitle">Catalyst calendar</h3></div>
        <span>${countLabel(calendar?.events?.length)} events · ${esc((calendar?.sources || []).join(' · ') || 'sources unavailable')}</span>
      </div>
      <p class="breadth-definition">${esc(calendar?.definition || '')}</p>
      ${renderCalendarSourceStatus(calendar)}
      ${renderCatalystCalendar(calendar)}
    </section>

    <section class="breadth-panel" aria-labelledby="earningsDigestTitle" data-stale-keys="breadthSnapshot">
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
  if (state.selected) {
    refreshSelectedDetail();
  } else {
    const initial = watchedRows('SC')[0] || watchedRows('ML')[0] || null;
    if (initial) openDetail(initial.ticker, { history: false });
  }
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
  updateDocumentTitle();
}

// The browser tab title carries the selected name, its move, and a STALE or
// FAILED prefix, so the board can be read from the tab strip while another
// tab is in front.
function updateDocumentTitle() {
  const parts = [];
  if (els.freshness.classList.contains('failed')) parts.push('FAILED');
  else if (els.freshness.classList.contains('stale')) parts.push('STALE');
  if (state.selected?.ticker) parts.push(`${state.selected.ticker} ${fmtSigned(state.selected.change_pct)}`);
  parts.push('Radar V2');
  document.title = parts.join(' · ');
}

function updateFreshness(failures = state.lastFailures) {
  if (navigator.onLine === false) {
    setFreshness('failed', 'Offline · showing last verified data');
    return;
  }
  const rowTimes = state.market.map(row => Date.parse(row.updated_at || '')).filter(Number.isFinite);
  const latest = rowTimes.length ? Math.max(...rowTimes) : NaN;
  if (!Number.isFinite(latest)) {
    setFreshness('stale', failures.length ? 'Loaded with gaps' : 'Row time unknown');
    return;
  }
  const age = Date.now() - latest;
  const kind = failures.length ? 'stale' : age <= 15 * 60000 ? 'fresh' : 'stale';
  const suffix = failures.length ? ` · ${failures.map(laneLabel).join(', ')} unavailable` : '';
  setFreshness(kind, `Rows ${relativeTime(latest)}${suffix}`);
}

function dashboardHistoryState() {
  return {
    radar: true,
    view: state.currentView,
    ticker: state.selected?.ticker || null,
    theme: state.themePageTheme?.name || null,
    themeTicker: state.themePageTicker || null,
    themeOverview: state.selectedTheme?.name || null,
    edgarOpen: els.detailSupplySection?.hidden === false && els.detailSupplySection?.open === true,
    regimeTicker: els.regimeChartModal?.hidden === false ? state.regimeChartTicker : null,
  };
}

function writeDashboardHistory({ replace = false } = {}) {
  const payload = dashboardHistoryState();
  if (!replace && window.history.state?.radar && JSON.stringify(window.history.state) === JSON.stringify(payload)) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](payload, '', window.location.href);
}

// Each view remembers where it was scrolled. Hopping NOW -> THEMES -> NOW
// returns to the same row instead of the top; re-selecting the active tab
// (or an explicit scroll: 'top') still goes to the top.
function switchView(view, { history = true, scroll = 'restore' } = {}) {
  if (!['now', 'themes', 'breadth'].includes(view)) return;
  const changed = state.currentView !== view;
  if (changed) state.viewScroll[state.currentView] = window.scrollY;
  state.currentView = view;
  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  const top = scroll === 'restore' && changed ? (state.viewScroll[view] || 0) : 0;
  window.scrollTo({ top, behavior: top ? 'auto' : 'smooth' });
  if (history) writeDashboardHistory();
}

function fact(label, value, className = '') {
  return `<div class="fact"><div class="fact-label">${esc(label)}</div><div class="fact-value ${className}">${esc(value ?? '—')}</div></div>`;
}

function factHtml(label, markup, className = '') {
  return `<div class="fact"><div class="fact-label">${esc(label)}</div><div class="fact-value ${className}">${markup}</div></div>`;
}

// The selected-stock panel is rendered from a row snapshot. It is re-rendered
// on every data cycle (refreshSelectedDetail) so the facts never drift from the
// books beneath them; the chart, Ask Edgar state, and history stay untouched.
function renderSelectedDetail(row) {
  const context = rowContext(row);
  els.detailClass.textContent = row.category === 'SC'
    ? 'SMALL CAP · INTRADAY CONTEXT'
    : row.category === 'ML' ? 'MID / LARGE · SWING CONTEXT' : 'CLASS UNVERIFIED · DISCOVERY';
  els.detailTicker.textContent = row.ticker;
  els.detailSubhead.innerHTML = `<span class="${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span> · ${fmtPrice(row.price)} · ${themeJumpMarkup(context.theme) || 'No theme attached'}`;

  const rotation = admissibleFloatRotation(row);
  const sharedFacts = [
    fact('Price', fmtPrice(row.price)),
    fact('Change', fmtSigned(row.change_pct), moveClass(row.change_pct)),
    fact('D count', runLabel(row)),
    fact('Bollinger', bbLabel(row), 'bb-text'),
    fact('8EMA', fmtSigned(row.ema8_dist), 'ma-text'),
    fact('Daily ATR', finite(row.atr) == null ? '—' : `$${fmtNumber(row.atr, row.atr < 1 ? 4 : 2)}`),
    fact('ATR move', finite(row.atr_days) == null ? '—' : `${fmtSigned(row.atr_days, ' ATR')}`),
  ];
  const scFacts = [
    fact('50EMA', fmtSigned(row.ema50_dist_pct), 'ma-text'),
    fact('Float', (row.float_source === 'MASSIVE_FREE_FLOAT' || row.float_source === 'MANUAL') ? `${fmtCompact(row.float_size)} · AS OF ${fmtDate(row.float_as_of)}` : '—'),
    fact('Float rotation', rotation ? `${fmtNumber(rotation.value)}×` : '—'),
    fact('Share volume', finite(row.volume) == null ? '—' : fmtCompact(row.volume)),
    fact('VWAP', fmtSigned(row.vwap_dist)),
  ];
  const mlFacts = [
    fact('200EMA', fmtSigned(row.ema200_dist_pct), 'ma-text'),
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
    context.theme ? `<div class="context-copy"><strong>Theme:</strong> ${themeJumpMarkup(context.theme)}</div>` : '',
    context.why ? `<div class="context-copy"><strong>Current reason:</strong> ${esc(context.why)}</div>` : '',
    context.catalyst ? `<div class="context-copy"><strong>Catalyst class:</strong> ${esc(context.catalyst)}</div>` : '',
  ].filter(Boolean);
  els.detailContext.innerHTML = contextLines.join('');

  const news = newsFor(row.ticker).slice(0, 5);
  els.detailNews.innerHTML = news.map(item => `
    <div class="news-item">
      <div>${esc(item.headline)}</div>
      <div class="item-meta">${esc(item.source || 'source unknown')} · ${relativeTime(item.published_at)}</div>
    </div>`).join('');
  updateDocumentTitle();
}

function refreshSelectedDetail() {
  const ticker = state.selected?.ticker;
  if (!ticker) return;
  const row = detailRowFor(ticker);
  if (!row) return;
  if (row.category !== state.selected.category) {
    openDetail(ticker, { history: false });
    return;
  }
  state.selected = row;
  renderSelectedDetail(row);
}

function openDetail(ticker, { history = true } = {}) {
  const row = detailRowFor(ticker);
  if (!row) return;
  state.selected = row;
  state.chartTf = '2m';
  renderSelectedDetail(row);

  els.detailSupplySection.hidden = row.category !== 'SC';
  els.askEdgarButton.hidden = row.category !== 'SC';
  if (row.category === 'SC') {
    els.detailSupplySection.open = false;
    renderDilutionPreview(row);
  }

  renderBook('SC');
  renderBook('ML');
  renderDiscovery();
  updateChartTabs();
  loadChart(row.ticker, state.chartTf);
  if (history) writeDashboardHistory();
}

function closeRegimeChart({ history = true, restoreFocus = true } = {}) {
  const returnFocus = [...els.breadthView.querySelectorAll('[data-ticker]')]
    .find(row => row.dataset.ticker === state.regimeChartReturnTicker) || null;
  state.chartRequest += 1;
  state.regimeChartTicker = null;
  state.regimeChartReturnTicker = null;
  els.regimeChartModal.hidden = true;
  els.detailBackdrop.hidden = true;
  document.body.style.overflow = '';
  if (restoreFocus) {
    requestAnimationFrame(() => {
      returnFocus?.scrollIntoView({ block: 'nearest' });
      returnFocus?.focus({ preventScroll: true });
    });
  }
  if (history) writeDashboardHistory();
}

async function openRegimeChart(ticker, { history = true, returnFocus = null } = {}) {
  const row = detailRowFor(ticker);
  if (!row) return;
  const active = document.activeElement;
  const activeTickerControl = active?.closest?.('#view-breadth [data-ticker]');
  if (returnFocus?.dataset?.ticker) state.regimeChartReturnTicker = returnFocus.dataset.ticker;
  else if (activeTickerControl) state.regimeChartReturnTicker = activeTickerControl.dataset.ticker;
  state.regimeChartTicker = row.ticker;
  els.regimeChartTitle.textContent = row.ticker;
  els.regimeChartHost.innerHTML = '<div class="loading-card" style="width:100%;height:320px">Loading chart…</div>';
  els.detailBackdrop.hidden = false;
  els.regimeChartModal.hidden = false;
  document.body.style.overflow = 'hidden';
  els.detailClose.focus({ preventScroll: true });
  if (history) writeDashboardHistory();
  const request = ++state.chartRequest;
  try {
    const bars = await fetchChart(row.ticker, '2m');
    if (request !== state.chartRequest || els.regimeChartModal.hidden) return;
    renderCandles(bars, '2m', els.regimeChartHost, row.ticker);
  } catch (error) {
    if (request !== state.chartRequest || els.regimeChartModal.hidden) return;
    els.regimeChartHost.innerHTML = chartErrorMarkup(error, 'regime');
  }
}

function updateChartTabs() {
  document.querySelectorAll('[data-chart-tf]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartTf === state.chartTf);
  });
}

// A failed chart load offers a retry in place instead of forcing a re-click
// on the row. The scope names which chart host to reload.
function chartErrorMarkup(error, scope) {
  return `<div class="error-state chart-error"><span>${esc(error?.message || 'Chart unavailable.')}</span><button class="text-button" type="button" data-chart-retry="${esc(scope)}">RETRY</button></div>`;
}

function retryChart(scope) {
  if (scope === 'now' && state.selected) loadChart(state.selected.ticker, state.chartTf || '2m');
  else if (scope === 'theme-page' && state.themePageTicker) loadThemePageChart(state.themePageTicker, state.themePageChartTf);
  else if (scope === 'theme-overview' && state.selectedTheme && state.themeChartTicker) loadThemeChart(state.themeChartTicker, state.themeChartTf);
  else if (scope === 'regime' && state.regimeChartTicker) openRegimeChart(state.regimeChartTicker, { history: false });
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
  els.chartNote.textContent = tf === '2m'
    ? 'Delayed 2-minute evidence — execution stays on DAS.'
    : tf === '10m'
      ? '10-minute context.'
      : 'Daily context.';
  try {
    const bars = await fetchChart(ticker, tf);
    if (request !== state.chartRequest) return;
    renderCandles(bars, tf, els.chartHost, ticker);
  } catch (error) {
    if (request !== state.chartRequest) return;
    els.chartHost.innerHTML = chartErrorMarkup(error, 'now');
  }
}

function chartDragIsAxis(host, event) {
  const rect = host.getBoundingClientRect();
  const layout = host.__radarChartLayout || { right: 58, width: Math.max(1, rect.width) };
  return event.clientX >= rect.right - Math.max(48, rect.width * (layout.right / layout.width));
}

function chartDragCursor(host, event) {
  if (host.__radarChartView?.drag) return;
  host.style.cursor = chartDragIsAxis(host, event) ? 'ns-resize' : 'grab';
}

function chartDragStart(host, event, input) {
  if (event.button !== 0) return;
  const chartView = host.__radarChartView;
  if (!chartView) return;
  event.preventDefault();
  const axis = chartDragIsAxis(host, event);
  chartView.drag = {
    input,
    mode: axis ? 'scale' : 'pan',
    lastX: event.clientX,
    startY: event.clientY,
    priceScale: chartView.priceScale,
    barRemainder: 0,
  };
  host.classList.add('chart-dragging');
  host.style.cursor = axis ? 'ns-resize' : 'grabbing';
}

function chartDragMove(host, event, input) {
  const chartView = host.__radarChartView;
  const drag = chartView?.drag;
  if (!drag || drag.input !== input) return;
  if (input === 'mouse' && event.buttons === 0) {
    chartDragEnd(host, event, input);
    return;
  }
  event.preventDefault();
  if (drag.mode === 'scale') {
    chartView.priceScale = Math.max(0.2, Math.min(6, drag.priceScale * Math.exp((event.clientY - drag.startY) * 0.008)));
  } else {
    const rect = host.getBoundingClientRect();
    const deltaPx = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    drag.barRemainder += (deltaPx / Math.max(1, rect.width)) * chartView.count;
    const deltaBars = drag.barRemainder < 0 ? Math.ceil(drag.barRemainder) : Math.floor(drag.barRemainder);
    if (!deltaBars) return;
    drag.barRemainder -= deltaBars;
    const maxOffset = Math.max(0, (host.__radarChartSource?.validCount || chartView.count) - chartView.count);
    const nextOffset = Math.max(0, Math.min(maxOffset, chartView.offset + deltaBars));
    if (nextOffset === chartView.offset) {
      drag.barRemainder = 0;
      return;
    }
    chartView.offset = nextOffset;
  }
  const source = host.__radarChartSource;
  if (source) renderCandles(source.rawBars, source.tf, host, source.ticker);
}

function chartDragEnd(host, event, input) {
  const chartView = host.__radarChartView;
  if (!chartView?.drag || chartView.drag.input !== input) return;
  chartView.drag = null;
  host.classList.remove('chart-dragging');
  if (event && Number.isFinite(event.clientX)) chartDragCursor(host, event);
  else host.style.cursor = '';
}

function renderCandles(rawBars, tf, host = els.chartHost, ticker = state.selected?.ticker || '') {
  const fullBars = rawBars.filter(bar => [bar?.o, bar?.h, bar?.l, bar?.c].every(value => finite(value) != null));
  const defaultBars = tf === '2m' ? fullBars.length : 120;
  if (!fullBars.length) {
    host.innerHTML = '<div class="empty-state">No bars returned.</div>';
    return;
  }
  const chartKey = `${ticker}:${tf}`;
  const existingView = host.__radarChartView;
  const chartView = existingView?.key === chartKey
    ? existingView
    : { key: chartKey, count: Math.min(defaultBars, fullBars.length), offset: 0, priceScale: 1, drag: null };
  chartView.count = Math.max(Math.min(24, fullBars.length), Math.min(fullBars.length, Math.trunc(chartView.count || defaultBars)));
  chartView.offset = Math.max(0, Math.min(Math.max(0, fullBars.length - chartView.count), Math.trunc(chartView.offset || 0)));
  chartView.priceScale = Math.max(0.2, Math.min(6, finite(chartView.priceScale) ?? 1));
  host.__radarChartView = chartView;
  host.__radarChartSource = { rawBars, tf, ticker, validCount: fullBars.length };

  const easternClock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const easternSession = bar => {
    const rawTimestamp = bar?.t ?? bar?.time ?? bar?.timestamp ?? bar?.datetime;
    const numericTimestamp = finite(rawTimestamp);
    const instant = new Date(numericTimestamp == null
      ? rawTimestamp
      : numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp);
    if (!Number.isFinite(instant.getTime())) return null;
    const parts = Object.fromEntries(easternClock.formatToParts(instant).map(part => [part.type, part.value]));
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    const session = minute < 570 ? 'PRE' : minute < 960 ? 'RTH' : 'AH';
    return { date: `${parts.year}-${parts.month}-${parts.day}`, session };
  };

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
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;
  let cumulativeDate = null;
  const vwapAll = fullBars.map(bar => {
    if (tf === 'D') return null;
    const barSession = easternSession(bar);
    if (barSession?.date && barSession.date !== cumulativeDate) {
      cumulativeDate = barSession.date;
      cumulativeVolume = 0;
      cumulativePriceVolume = 0;
    }
    const volume = Math.max(0, finite(bar.v ?? bar.volume) ?? 0);
    cumulativeVolume += volume;
    cumulativePriceVolume += ((Number(bar.h) + Number(bar.l) + Number(bar.c)) / 3) * volume;
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
  });
  const end = fullBars.length - chartView.offset;
  const start = Math.max(0, end - chartView.count);
  const bars = fullBars.slice(start, end);
  const ema8 = ema8All.slice(start, end);
  const upper = upperAll.slice(start, end);
  const lower = lowerAll.slice(start, end);
  const sma200 = sma200All.slice(start, end);
  const vwap = vwapAll.slice(start, end);

  // SVG stays vector-sharp only when its logical geometry tracks the actual
  // host. The former fixed 640x320 viewBox was stretched into every workspace,
  // scaling 1px candles and grids across both axes and visibly softening them.
  const width = Math.max(320, Math.floor(host.clientWidth || 640));
  const height = Math.max(220, Math.floor(host.clientHeight || 320));
  host.__radarChartSize = { width, height };
  const top = 18;
  const right = 58;
  const bottom = 24;
  const left = 12;
  const volumeH = 48;
  const volumeGap = 9;
  const plotW = width - left - right;
  const plotH = height - top - bottom - volumeH - volumeGap;
  const volumeTop = top + plotH + volumeGap;
  host.__radarChartLayout = { right, width };
  const indicatorValues = [...ema8, ...upper, ...lower, ...sma200, ...vwap].filter(value => finite(value) != null);
  const lows = [...bars.map(bar => Number(bar.l)), ...indicatorValues];
  const highs = [...bars.map(bar => Number(bar.h)), ...indicatorValues];
  let low = Math.min(...lows);
  let high = Math.max(...highs);
  if (high === low) { high += 1; low -= 1; }
  const pad = (high - low) * 0.06;
  high += pad;
  low -= pad;
  const priceMid = (high + low) / 2;
  const priceHalf = ((high - low) / 2) * chartView.priceScale;
  high = priceMid + priceHalf;
  low = priceMid - priceHalf;
  const y = value => top + ((high - value) / (high - low)) * plotH;
  const step = plotW / bars.length;
  const bodyGap = Math.min(2, Math.max(0.75, step * 0.12));
  const bodyW = Math.max(1, step - bodyGap);

  const sessionSegments = [];
  if (tf === '2m') {
    bars.forEach((bar, index) => {
      const point = easternSession(bar);
      if (!point) return;
      const current = sessionSegments.at(-1);
      if (!current || current.date !== point.date || current.session !== point.session) {
        sessionSegments.push({ ...point, start: index, end: index });
      } else {
        current.end = index;
      }
    });
  }
  const sessionColors = { PRE: '#111923', RTH: '#0d1114', AH: '#18131b' };
  const sessionBands = sessionSegments.map((segment, index) => {
    const x = left + segment.start * step;
    const segmentWidth = (segment.end - segment.start + 1) * step;
    const boundary = index ? `<line class="chart-pixel-line" x1="${x.toFixed(2)}" y1="${top}" x2="${x.toFixed(2)}" y2="${volumeTop + volumeH}" stroke="#59616a" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.55"/>` : '';
    const label = segmentWidth >= 28
      ? `<text x="${(x + 4).toFixed(2)}" y="${top + 11}" fill="#858d96" font-size="8" font-family="monospace">${segment.session}</text>`
      : '';
    return `<rect x="${x.toFixed(2)}" y="${top}" width="${segmentWidth.toFixed(2)}" height="${volumeTop + volumeH - top}" fill="${sessionColors[segment.session]}"/>${boundary}${label}`;
  }).join('');

  const grid = [0, 0.25, 0.5, 0.75, 1].map(part => {
    const gy = top + plotH * part;
    const price = high - (high - low) * part;
    return `<line class="chart-pixel-line" x1="${left}" y1="${gy.toFixed(2)}" x2="${left + plotW}" y2="${gy.toFixed(2)}" stroke="#20252c" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${width - 5}" y="${(gy + 3).toFixed(2)}" fill="#aab2bb" font-size="10" font-family="monospace" text-anchor="end">${price.toFixed(price < 10 ? 2 : 1)}</text>`;
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
    return `<line class="chart-candle-wick" x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke"/><rect class="chart-candle-body" x="${(x - bodyW / 2).toFixed(2)}" y="${rectY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${rectH.toFixed(2)}" fill="${color}"/>`;
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
    { values: upper, color: '#9f77c8', width: 1, className: 'chart-line-bb' },
    { values: lower, color: '#9f77c8', width: 1, className: 'chart-line-bb' },
    { values: ema8, color: '#d0a53a', width: 1.35, className: 'chart-line-ema8' },
    { values: sma200, color: '#74404a', width: 1.15, className: 'chart-line-sma200' },
    { values: vwap, color: '#3f7fa8', width: 1.15, className: 'chart-line-vwap' },
  ].map(series => {
    const path = seriesPath(series.values);
    return path ? `<path class="${series.className}" d="${path}" fill="none" stroke="${series.color}" stroke-width="${series.width}" vector-effect="non-scaling-stroke" opacity="0.96"/>` : '';
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
  const lastLine = `<line class="chart-pixel-line" x1="${left}" y1="${lastY.toFixed(2)}" x2="${left + plotW}" y2="${lastY.toFixed(2)}" stroke="${lastColor}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 4" opacity="0.65"/><text x="${width - 5}" y="${(lastY - 5).toFixed(2)}" fill="${lastColor}" font-size="11" font-weight="700" font-family="monospace" text-anchor="end">${lastClose.toFixed(lastClose < 10 ? 2 : 1)}</text>`;
  const lastTimestamp = finite(last?.t ?? last?.time ?? last?.timestamp ?? last?.datetime);
  const sessionReceipt = tf === '2m' && lastTimestamp != null
    ? ` · ${fmtDate(lastTimestamp)} ET · ${relativeTime(lastTimestamp)}`
    : '';

  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="${esc(ticker)} ${esc(tf)} candlestick chart" data-interactive-chart><rect width="${width}" height="${height}" fill="#090b0d"/>${sessionBands}${grid}${overlays}${candles}${lastLine}<line class="chart-pixel-line" x1="${left}" y1="${(volumeTop - 4).toFixed(2)}" x2="${left + plotW}" y2="${(volumeTop - 4).toFixed(2)}" stroke="#20252c" stroke-width="1" vector-effect="non-scaling-stroke"/>${volumeBars}<text x="${left}" y="${height - 6}" fill="#aab2bb" font-size="10" font-family="monospace">${bars.length} bars · ${esc(tf)}${tf === '2m' ? ' · DELAYED' : ''}${tf === '2m' ? ' · PRE/RTH/AH ET' : ''}${esc(sessionReceipt)} · WHEEL ZOOM · LEFT-DRAG PAN · PRICE-AXIS DRAG · DOUBLE-CLICK RESET</text></svg>`;

  host.onwheel = event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const nextCount = Math.max(Math.min(24, fullBars.length), Math.min(fullBars.length, Math.round(chartView.count * factor)));
    chartView.count = nextCount;
    chartView.offset = Math.min(chartView.offset, Math.max(0, fullBars.length - nextCount));
    renderCandles(rawBars, tf, host, ticker);
  };
  // Mouse uses document-level move/up listeners so dragging survives every
  // SVG repaint and leaving the plot. Touch and pen retain pointer capture.
  host.onmousedown = event => chartDragStart(host, event, 'mouse');
  host.onmousemove = event => chartDragCursor(host, event);
  host.onpointerdown = event => {
    if (event.pointerType === 'mouse') return;
    chartDragStart(host, event, 'pointer');
    if (host.__radarChartView?.drag) host.setPointerCapture?.(event.pointerId);
  };
  host.onpointermove = event => {
    if (event.pointerType !== 'mouse') chartDragMove(host, event, 'pointer');
  };
  host.onpointerup = event => {
    if (event.pointerType === 'mouse') return;
    chartDragEnd(host, event, 'pointer');
    if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
  };
  host.onpointercancel = event => chartDragEnd(host, event, 'pointer');
  host.onpointerleave = () => {
    if (!chartView.drag) host.style.cursor = '';
  };
  host.ondblclick = () => {
    chartView.count = Math.min(defaultBars, fullBars.length);
    chartView.offset = 0;
    chartView.priceScale = 1;
    renderCandles(rawBars, tf, host, ticker);
  };

  if (!host.__radarMouseDragHandlers && typeof document !== 'undefined') {
    const move = event => chartDragMove(host, event, 'mouse');
    const up = event => chartDragEnd(host, event, 'mouse');
    const blur = () => chartDragEnd(host, null, 'mouse');
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    if (typeof window !== 'undefined') window.addEventListener('blur', blur);
    host.__radarMouseDragHandlers = { move, up, blur };
  }

  if (!host.__radarChartResizeObserver && typeof ResizeObserver !== 'undefined') {
    host.__radarChartResizeObserver = new ResizeObserver(() => {
      const current = host.__radarChartSize;
      const nextWidth = Math.max(0, Math.floor(host.clientWidth));
      const nextHeight = Math.max(0, Math.floor(host.clientHeight));
      if (!current || nextWidth < 1 || nextHeight < 1
        || (Math.abs(nextWidth - current.width) < 2 && Math.abs(nextHeight - current.height) < 2)) return;
      cancelAnimationFrame(host.__radarChartResizeFrame || 0);
      host.__radarChartResizeFrame = requestAnimationFrame(() => {
        const source = host.__radarChartSource;
        if (source) renderCandles(source.rawBars, source.tf, host, source.ticker);
      });
    });
    host.__radarChartResizeObserver.observe(host);
  }
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
    host.innerHTML = chartErrorMarkup(error, 'theme-overview');
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
  const chartRetry = event.target.closest('[data-chart-retry]');
  if (chartRetry) { retryChart(chartRetry.dataset.chartRetry); return; }

  const askEdgarButton = event.target.closest('[data-ask-edgar], [data-ask-edgar-retry]');
  if (askEdgarButton && state.selected?.category === 'SC') {
    els.detailSupplySection.open = true;
    loadDilutionProfile(state.selected.ticker, { force: askEdgarButton.hasAttribute('data-ask-edgar-retry') });
    writeDashboardHistory();
    return;
  }

  const themePageChartButton = event.target.closest('[data-theme-page-chart-tf]');
  if (themePageChartButton && state.themePageTicker) {
    state.themePageChartTf = themePageChartButton.dataset.themePageChartTf;
    renderThemePageBriefing();
    loadThemePageChart(state.themePageTicker, state.themePageChartTf);
    writeDashboardHistory();
    return;
  }

  const themeChartButton = event.target.closest('[data-theme-chart-tf]');
  if (themeChartButton && state.selectedTheme && state.themeChartTicker) {
    state.themeChartTf = themeChartButton.dataset.themeChartTf;
    updateThemeChartSelection();
    loadThemeChart(state.themeChartTicker, state.themeChartTf);
    return;
  }

  const themeJump = event.target.closest('[data-theme-jump]');
  if (themeJump) { jumpToTheme(themeJump.dataset.themeJump); return; }

  const tickerButton = event.target.closest('[data-ticker]');
  if (tickerButton) {
    if (state.selectedTheme) selectThemeChartTicker(tickerButton.dataset.ticker);
    else if (state.currentView === 'themes') {
      const parentTheme = tickerButton.closest('[data-theme-card]')?.dataset.themeCard;
      if (parentTheme && parentTheme !== state.themePageTheme?.name) selectThemePage(parentTheme, { history: false, loadChart: false });
      selectThemePageTicker(tickerButton.dataset.ticker);
    } else if (state.currentView === 'breadth') openRegimeChart(tickerButton.dataset.ticker);
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

document.addEventListener('contextmenu', event => {
  const tickerButton = event.target.closest('[data-ticker]');
  if (!tickerButton) return;
  const row = detailRowFor(tickerButton.dataset.ticker);
  if (row?.category !== 'SC') return;
  event.preventDefault();
  switchView('now', { history: false });
  openDetail(row.ticker, { history: false });
  els.detailSupplySection.open = true;
  loadDilutionProfile(row.ticker);
  writeDashboardHistory();
});

els.scToggle.addEventListener('click', () => { state.scExpanded = !state.scExpanded; renderBook('SC'); });
els.mlToggle.addEventListener('click', () => { state.mlExpanded = !state.mlExpanded; renderBook('ML'); });
els.discoveryToggle.addEventListener('click', () => { state.discoveryExpanded = !state.discoveryExpanded; renderDiscovery(); });
els.refreshButton.addEventListener('click', () => loadAll());
els.detailClose.addEventListener('click', () => closeRegimeChart());
els.detailBackdrop.addEventListener('click', () => {
  if (state.selectedTheme) closeThemeOverview();
  else if (!els.regimeChartModal.hidden) closeRegimeChart();
});
els.themeOverviewClose.addEventListener('click', closeThemeOverview);

function typingTarget(element) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName) || element?.isContentEditable === true;
}

function interactiveSpaceOwner(element) {
  if (typingTarget(element)) return true;
  if (element?.closest?.('.discovery-row[data-ticker], .radar-row[data-ticker], .theme-roster-row[data-ticker]')) return false;
  if (element?.closest?.('#view-breadth [data-ticker]')) return false;
  if (element?.matches?.('[data-theme-card]')) return false;
  return Boolean(element?.closest?.('button, a, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"]'));
}

function advanceActiveList() {
  if (state.currentView === 'now') {
    const rows = [...els.nowView.querySelectorAll('.discovery-row[data-ticker], .radar-row[data-ticker]')];
    if (!rows.length) return;
    const focused = rows.indexOf(document.activeElement);
    const current = focused >= 0 ? focused : rows.findIndex(row => row.dataset.ticker === state.selected?.ticker);
    const nextIndex = (current + 1 + rows.length) % rows.length;
    const next = rows[nextIndex];
    const ticker = next.dataset.ticker;
    openDetail(ticker);
    const renderedRows = [...els.nowView.querySelectorAll('.discovery-row[data-ticker], .radar-row[data-ticker]')];
    const rendered = renderedRows[nextIndex] || renderedRows.find(row => row.dataset.ticker === ticker);
    rendered?.scrollIntoView({ block: 'nearest' });
    rendered?.focus({ preventScroll: true });
    return;
  }
  if (state.currentView === 'themes') {
    if (state.selectedTheme) {
      const rows = [...els.themeOverviewBody.querySelectorAll('.theme-roster-row[data-ticker]')];
      if (!rows.length) return;
      const current = rows.findIndex(row => row.dataset.ticker === state.themeChartTicker);
      const next = rows[(current + 1 + rows.length) % rows.length];
      selectThemeChartTicker(next.dataset.ticker);
      next.scrollIntoView({ block: 'nearest' });
      next.focus({ preventScroll: true });
      return;
    }
    const themes = [...els.themeBoard.querySelectorAll('[data-theme-card]')];
    if (!themes.length) return;
    const current = themes.findIndex(card => card.dataset.themeCard === state.themePageTheme?.name);
    const next = themes[(current + 1 + themes.length) % themes.length];
    selectThemePage(next.dataset.themeCard);
    next.scrollIntoView({ block: 'nearest' });
    next.focus({ preventScroll: true });
    return;
  }
  const rows = [...els.breadthView.querySelectorAll('[data-ticker]')];
  if (!rows.length) return;
  const current = rows.findIndex(row => row.dataset.ticker === els.regimeChartTitle?.textContent);
  const next = rows[(current + 1 + rows.length) % rows.length];
  next.scrollIntoView({ block: 'nearest' });
  next.focus({ preventScroll: true });
  openRegimeChart(next.dataset.ticker);
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.selectedTheme) { closeThemeOverview(); return; }
  if (event.key === 'Escape' && !els.regimeChartModal.hidden) { closeRegimeChart(); return; }
  if (typingTarget(event.target)) return;
  if (event.key === ' ') {
    const viewButton = event.target.closest?.('[data-view]');
    if (viewButton) {
      event.preventDefault();
      switchView(viewButton.dataset.view);
      return;
    }
    if (interactiveSpaceOwner(event.target)) return;
    event.preventDefault();
    advanceActiveList();
    return;
  }
  if (event.key === 'Enter') {
    const themeCard = event.target.closest?.('[data-theme-card]');
    if (themeCard && event.target === themeCard) { openThemeOverview(themeCard.dataset.themeCard); return; }
  }
  if (event.key === '1' || event.key === '2' || event.key === '3') {
    switchView(event.key === '1' ? 'now' : event.key === '2' ? 'themes' : 'breadth');
    return;
  }
  if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
    loadAll();
  }
});

window.addEventListener('popstate', event => {
  if (!state.loadedOnce) return;
  const target = event.state?.radar ? event.state : { view: 'now' };
  if (state.selectedTheme) closeThemeOverview({ history: false });
  if (!els.regimeChartModal.hidden) closeRegimeChart({ history: false, restoreFocus: false });
  switchView(target.view || 'now', { history: false });
  if (target.ticker) openDetail(target.ticker, { history: false });
  if (target.theme) selectThemePage(target.theme, { history: false, loadChart: false });
  if (target.themeTicker) selectThemePageTicker(target.themeTicker, { history: false });
  if (target.themeOverview) openThemeOverview(target.themeOverview, { history: false });
  if (!target.edgarOpen) {
    els.detailSupplySection.open = false;
  } else if (state.selected?.category === 'SC') {
    els.detailSupplySection.open = true;
    loadDilutionProfile(state.selected.ticker);
  } else {
    els.detailSupplySection.open = false;
  }
  if (target.regimeTicker) {
    const returnFocus = [...els.breadthView.querySelectorAll('[data-ticker]')]
      .find(row => row.dataset.ticker === target.regimeTicker) || null;
    openRegimeChart(target.regimeTicker, { history: false, returnFocus });
  }
  requestAnimationFrame(() => {
    let restored = null;
    if (target.themeOverview) {
      restored = [...els.themeOverviewBody.querySelectorAll('.theme-roster-row[data-ticker]')]
        .find(row => row.dataset.ticker === state.themeChartTicker);
    } else if (target.regimeTicker) {
      restored = els.detailClose;
    } else if (target.view === 'themes' && target.theme) {
      restored = [...els.themeBoard.querySelectorAll('[data-theme-card]')]
        .find(card => card.dataset.themeCard === target.theme);
    } else if (target.ticker) {
      restored = [...els.nowView.querySelectorAll('.discovery-row[data-ticker], .radar-row[data-ticker]')]
        .find(row => row.dataset.ticker === target.ticker);
    }
    restored?.scrollIntoView({ block: 'nearest' });
    restored?.focus({ preventScroll: true });
  });
});

loadAll();
setInterval(() => {
  if (document.visibilityState === 'visible') loadAll({ quiet: true });
}, 120000);
// Keep the row-age label honest between cycles instead of freezing on the
// label from the last render.
setInterval(() => {
  if (state.loadedOnce && state.market.length && !state.loading) updateFreshness();
}, 30000);
// Coming back to the tab after a gap should not wait up to two minutes for the
// next scheduled cycle; the same applies when the network returns.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.loadedOnce || state.loading) return;
  if (Date.now() - (state.lastLoadAt || 0) >= 60000) loadAll({ quiet: true });
});
window.addEventListener('online', () => { if (state.loadedOnce) loadAll({ quiet: true }); });
window.addEventListener('offline', () => setFreshness('failed', 'Offline · showing last verified data'));
