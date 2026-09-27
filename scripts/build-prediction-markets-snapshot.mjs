import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  groupContracts,
  normalizeKalshiMarket,
  normalizePolymarketMarket,
} from './lib/prediction-markets.mjs';

const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTPUT_PATH = process.env.SNAPSHOT_OUT_DIR
  ? resolve(process.env.SNAPSHOT_OUT_DIR, 'prediction-markets.json')
  : resolve(ROOT, 'v2', 'data', 'prediction-markets.json');

// Every topic is resolved live against recurring venue series/search results —
// no hard-coded contract or event ids. A topic with no live match on a venue
// publishes null for that venue rather than an invented number.
export const TOPICS = [
  {
    id: 'fomc-decision',
    label: 'FOMC · RATE DECISION',
    relatedThemes: ['Fintech', 'Precious Metals', 'Crypto'],
    kalshiSeries: ['KXFEDDECISION'],
    polymarket: [{ query: 'fed decision', slugPattern: /^fed-decision-in-/ }],
  },
  {
    id: 'cpi-inflation',
    label: 'CPI · INFLATION',
    relatedThemes: ['Fintech', 'Precious Metals'],
    kalshiSeries: ['KXCPIYOY', 'KXCPICORE'],
    polymarket: [{ query: 'core cpi', slugPattern: /^core-cpi-(mom|yoy)-/ }],
  },
  {
    id: 'jobs-payrolls',
    label: 'JOBS · PAYROLLS & UNEMPLOYMENT',
    relatedThemes: ['Fintech'],
    kalshiSeries: ['KXPAYROLLS', 'KXU3'],
    polymarket: [
      { query: 'jobs report', slugPattern: /^how-many-jobs-added-in-/ },
      { query: 'unemployment rate', slugPattern: /-unemployment-rate(-\d{4})?$/ },
    ],
  },
  {
    id: 'gdp-growth',
    label: 'GDP · GROWTH',
    relatedThemes: ['Fintech'],
    kalshiSeries: ['KXGDP'],
    polymarket: [{ query: 'us gdp growth', slugPattern: /^us-gdp-growth-in-q\d-/ }],
  },
  {
    id: 'pce-inflation',
    label: 'PCE · FED PREFERRED INFLATION',
    relatedThemes: ['Fintech'],
    kalshiSeries: ['KXPCECORE', 'KXPCEHEAD'],
    polymarket: [{ query: 'core pce', slugPattern: /^core-pce-(mom|yoy)-/ }],
  },
  // Kalshi runs one quarterly KPI series per company (headcount, production,
  // ad-impression growth, etc. -- the metric varies) plus a slower annual
  // variant; the Kalshi series ticker does not always match the stock
  // ticker (Alphabet trades as KXGOOG, not KXGOOGL). Verified live 2026-09-27:
  // MSFT currently has no open Kalshi KPI series and no Polymarket earnings
  // series either -- it reports UNAVAILABLE rather than a guessed id.
  ...[
    { ticker: 'NVDA', kalshiSeries: ['KXNVDAA'] },
    { ticker: 'AAPL', kalshiSeries: ['KXAAPLA'] },
    { ticker: 'MSFT', kalshiSeries: [] },
    { ticker: 'AMZN', kalshiSeries: ['KXAMZN', 'KXAMZNA'] },
    { ticker: 'GOOGL', kalshiSeries: ['KXGOOG', 'KXGOOGA'] },
    { ticker: 'META', kalshiSeries: ['KXMETA', 'KXMETAA'] },
    { ticker: 'TSLA', kalshiSeries: ['KXTSLA', 'KXTSLAA'] },
  ].map(({ ticker, kalshiSeries }) => ({
    id: `earnings-${ticker.toLowerCase()}`,
    label: `${ticker} · EARNINGS-LINKED KPI`,
    relatedThemes: [],
    kalshiSeries,
    polymarket: [],
  })),
];

// Legacy one-off contracts from the prior hard-coded build. They have no
// recurring series on either venue, so they are reported unavailable with a
// reason instead of silently disappearing or throwing.
export const RETIRED_ONE_OFF_TOPICS = [
  { id: 'iran-geopolitics', label: 'IRAN · GEOPOLITICS', reason: 'One-off contracts from the prior build have expired; no recurring series exists on Kalshi or Polymarket for this topic.' },
  { id: 'wti-august', label: 'WTI · AUGUST EXTREME', reason: 'One-off contract from the prior build has expired; no recurring series exists on Kalshi or Polymarket for this topic.' },
  { id: 'fed-2026', label: 'FED · FULL-YEAR PATH', reason: 'One-off contract from the prior build has expired; superseded by fomc-decision, which resolves the nearest live meeting.' },
];

// A small mutex caps how many requests are in flight at once (the topic
// registry can issue ~20 concurrent lookups, which trips Kalshi's rate
// limit). 429s also get one retry after a short backoff.
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;
const requestQueue = [];

function runQueued(task) {
  return new Promise((resolvePromise, rejectPromise) => {
    const attempt = () => {
      activeRequests += 1;
      task().then(resolvePromise, rejectPromise).finally(() => {
        activeRequests -= 1;
        if (requestQueue.length) requestQueue.shift()();
      });
    };
    if (activeRequests < MAX_CONCURRENT_REQUESTS) attempt();
    else requestQueue.push(attempt);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJsonOnce(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const error = new Error(`${url} returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchJson(url) {
  return runQueued(async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetchJsonOnce(url);
      } catch (error) {
        lastError = error;
        if (error?.status !== 429) throw error;
        await sleep(600 * (attempt + 1) + Math.random() * 400);
      }
    }
    throw lastError;
  });
}

function futureMarkets(markets, observedMs) {
  return (Array.isArray(markets) ? markets : []).filter(market => {
    const closeMs = Date.parse(market?.close_time || '');
    return Number.isFinite(closeMs) && closeMs > observedMs;
  });
}

function earliestClose(markets) {
  return Math.min(...markets.map(market => Date.parse(market.close_time)));
}

// Resolves the nearest upcoming (unexpired) event for a Kalshi series and
// returns its still-open markets. Returns null if the series has no open
// future event -- the caller marks that venue unavailable, it does not throw.
async function nearestKalshiSeriesMarkets(seriesTicker, observedMs, fetchJsonFn) {
  const url = `${KALSHI_BASE}/events?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200&with_nested_markets=true`;
  const payload = await fetchJsonFn(url);
  const events = Array.isArray(payload?.events) ? payload.events : [];
  let best = null;
  let bestClose = Infinity;
  for (const event of events) {
    const markets = futureMarkets(event.markets, observedMs);
    if (!markets.length) continue;
    const close = earliestClose(markets);
    if (close < bestClose) {
      bestClose = close;
      best = { event, markets };
    }
  }
  return best;
}

async function collectKalshiTopicContracts(topic, observedAt, observedMs, fetchJsonFn) {
  const contracts = [];
  const failures = [];
  let resolvedSeries = null;
  for (const seriesTicker of topic.kalshiSeries || []) {
    try {
      const result = await nearestKalshiSeriesMarkets(seriesTicker, observedMs, fetchJsonFn);
      if (!result) continue;
      resolvedSeries = seriesTicker;
      for (const market of result.markets) {
        const meta = {
          topicId: topic.id,
          topicLabel: topic.label,
          relatedThemes: topic.relatedThemes,
          seriesTicker,
        };
        contracts.push(normalizeKalshiMarket(market, meta, observedAt));
      }
    } catch (error) {
      failures.push({ topic_id: topic.id, provider: 'KALSHI', contract_id: seriesTicker, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { contracts, failures, resolvedSeries };
}

// Company KPI topics: the quarterly series is the primary target, the annual
// series is a fallback when no quarterly event is currently open. Only the
// first series with a live event is used (a real fallback chain, unlike the
// macro topics above which combine independent series).
async function collectKalshiFallbackChain(topic, observedAt, observedMs, fetchJsonFn) {
  const failures = [];
  for (const seriesTicker of topic.kalshiSeries || []) {
    try {
      const result = await nearestKalshiSeriesMarkets(seriesTicker, observedMs, fetchJsonFn);
      if (!result) continue;
      return {
        contracts: result.markets.map(market => normalizeKalshiMarket(market, {
          topicId: topic.id,
          topicLabel: topic.label,
          relatedThemes: topic.relatedThemes,
          seriesTicker,
        }, observedAt)),
        failures,
      };
    } catch (error) {
      failures.push({ topic_id: topic.id, provider: 'KALSHI', contract_id: seriesTicker, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { contracts: [], failures };
}

async function nearestPolymarketEvent(query, slugPattern, observedMs, fetchJsonFn) {
  const url = `${POLYMARKET_BASE}/public-search?q=${encodeURIComponent(query)}&events_status=active&limit_per_type=20`;
  const payload = await fetchJsonFn(url);
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const candidates = events
    .filter(event => slugPattern.test(String(event?.slug || '')))
    .map(event => ({ event, closeMs: Date.parse(event?.endDate || '') }))
    .filter(item => Number.isFinite(item.closeMs) && item.closeMs > observedMs)
    .sort((a, b) => a.closeMs - b.closeMs);
  return candidates[0]?.event || null;
}

async function collectPolymarketTopicContracts(topic, observedAt, observedMs, fetchJsonFn) {
  const contracts = [];
  const failures = [];
  for (const spec of topic.polymarket || []) {
    try {
      const event = await nearestPolymarketEvent(spec.query, spec.slugPattern, observedMs, fetchJsonFn);
      if (!event) continue;
      const markets = (Array.isArray(event.markets) ? event.markets : [])
        .filter(market => Number.isFinite(Date.parse(market?.endDate || event?.endDate || '')) && Date.parse(market?.endDate || event?.endDate || '') > observedMs);
      for (const market of markets) {
        contracts.push(normalizePolymarketMarket(event, market, {
          topicId: topic.id,
          topicLabel: topic.label,
          relatedThemes: topic.relatedThemes,
        }, observedAt));
      }
    } catch (error) {
      failures.push({ topic_id: topic.id, provider: 'POLYMARKET', contract_id: spec.query, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { contracts, failures };
}

const FALLBACK_CHAIN_TOPIC_PREFIX = 'earnings-';

async function collectTopic(topic, observedAt, observedMs, fetchJsonFn) {
  const isFallbackChain = topic.id.startsWith(FALLBACK_CHAIN_TOPIC_PREFIX);
  const kalshiResult = isFallbackChain
    ? await collectKalshiFallbackChain(topic, observedAt, observedMs, fetchJsonFn)
    : await collectKalshiTopicContracts(topic, observedAt, observedMs, fetchJsonFn);
  const polymarketResult = await collectPolymarketTopicContracts(topic, observedAt, observedMs, fetchJsonFn);
  const contracts = [...kalshiResult.contracts, ...polymarketResult.contracts];
  const failures = [...kalshiResult.failures, ...polymarketResult.failures];
  return { topic, contracts, failures };
}

const MAX_LADDER_CONTRACTS = 5;

// Ladder markets (CPI/PCE/jobs/GDP threshold rungs) can return dozens of
// contracts per topic. Every contract still exists in coverage math
// (contracts_loaded counts all of them) -- this only bounds what a single
// topic renders, and it says so via contracts_total/contracts_shown so
// nothing is silently dropped.
function ladderThreshold(contract) {
  const tickerMatch = String(contract?.contract_id || '').match(/-T(-?\d+(?:\.\d+)?)$/i);
  if (tickerMatch) return Number(tickerMatch[1]);
  const labelMatch = String(contract?.contract_label || '').match(/(-?\d+(?:\.\d+)?)/);
  if (labelMatch) return Number(labelMatch[1]);
  return Number.POSITIVE_INFINITY;
}

function ladderSortKey(a, b) {
  return ladderThreshold(a.contract) - ladderThreshold(b.contract)
    || String(a.contract.contract_id || '').localeCompare(String(b.contract.contract_id || ''));
}

export function capTopicLadder(topic) {
  const total = topic.contracts.length;
  if (total <= MAX_LADDER_CONTRACTS) {
    return { ...topic, contracts_total: total, contracts_shown: total };
  }
  const withDistance = topic.contracts.map(contract => ({
    contract,
    distance: contract.probability_pct == null ? Number.POSITIVE_INFINITY : Math.abs(50 - contract.probability_pct),
  }));
  // Nearest-to-50% first; ties (including all-null probabilities) break on
  // threshold ascending, then contract_id, so the result is deterministic
  // rather than dependent on venue response order.
  withDistance.sort((a, b) => a.distance - b.distance || ladderSortKey(a, b));
  const selected = withDistance.slice(0, MAX_LADDER_CONTRACTS).sort(ladderSortKey);
  return {
    ...topic,
    contracts: selected.map(item => item.contract),
    contracts_total: total,
    contracts_shown: selected.length,
  };
}

export async function buildSnapshot({ observedAt = new Date().toISOString(), fetchJsonFn = fetchJson } = {}) {
  const observedMs = Date.parse(observedAt);
  const results = await Promise.all(TOPICS.map(topic => collectTopic(topic, observedAt, observedMs, fetchJsonFn)));
  const contracts = results.flatMap(result => result.contracts);
  const failures = results.flatMap(result => result.failures);
  const unavailableTopics = [
    ...results.filter(result => result.contracts.length === 0 && result.failures.length === 0).map(result => ({
      topic_id: result.topic.id,
      topic_label: result.topic.label,
      reason: 'No live open market found on either venue for the nearest upcoming event.',
    })),
    ...RETIRED_ONE_OFF_TOPICS.map(topic => ({ topic_id: topic.id, topic_label: topic.label, reason: topic.reason })),
  ];
  const measured = contracts.filter(contract => contract.evidence_state === 'MEASURED');
  const topicsWithData = results.filter(result => result.contracts.length > 0).length;
  // contracts_expected preserves the old coverage contract: the number of
  // live-market fetch attempts across every topic (one per Kalshi series,
  // one per Polymarket search) -- so it still equals failures.length when
  // every fetch fails, the same invariant the old hard-coded build had.
  const contractsExpected = TOPICS.reduce((sum, topic) => sum + (topic.kalshiSeries?.length || 0) + (topic.polymarket?.length || 0), 0);
  let status;
  if (contracts.length === 0) status = 'UNAVAILABLE';
  else if (failures.length > 0) status = 'DEGRADED';
  else status = 'FRESH';
  return {
    schema_version: 2,
    generated_at: observedAt,
    definition: 'Venue-implied event odds for the nearest live event in each recurring series. Contracts remain separate unless their resolution terms are proven equivalent. No LLM-generated or invented values.',
    provider_units: {
      KALSHI: '24-hour volume and open interest are contracts. Deprecated liquidity is intentionally omitted.',
      POLYMARKET: '24-hour volume and liquidity are U.S. dollars as returned by Gamma.',
    },
    coverage: {
      status,
      topics_expected: TOPICS.length,
      topics_with_data: topicsWithData,
      topics_unavailable: unavailableTopics.length,
      contracts_expected: contractsExpected,
      contracts_loaded: contracts.length,
      contracts_measured: measured.length,
      failures,
      unavailable_topics: unavailableTopics,
    },
    topics: groupContracts(contracts, TOPICS).map(capTopicLadder),
  };
}

async function main() {
  const snapshot = await buildSnapshot();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Prediction-market snapshot: ${snapshot.coverage.topics_with_data}/${snapshot.coverage.topics_expected} topics live, ${snapshot.coverage.contracts_loaded} contracts, ${snapshot.coverage.topics_unavailable} unavailable -> ${OUTPUT_PATH}`);
  if (!snapshot.coverage.contracts_loaded) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
