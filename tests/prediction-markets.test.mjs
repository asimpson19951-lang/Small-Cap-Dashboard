import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  findPolymarketMarket,
  groupContracts,
  normalizeKalshiMarket,
  normalizePolymarketMarket,
} from '../scripts/lib/prediction-markets.mjs';
import { buildSnapshot } from '../scripts/build-prediction-markets-snapshot.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/prediction-markets.fixture.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../v2/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../v2/styles.css', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../v2/data/prediction-markets.json', import.meta.url), 'utf8'));
const meta = { topicId: 'fed-september', topicLabel: 'FED · SEPTEMBER DECISION', relatedThemes: ['Fintech'] };

test('Kalshi normalization uses midpoint, keeps contract units, and omits deprecated liquidity', () => {
  const row = normalizeKalshiMarket(fixture.kalshi, meta, fixture.observed_at);
  assert.equal(row.probability_pct, 70);
  assert.equal(row.probability_method, 'YES_BID_ASK_MIDPOINT');
  assert.equal(row.delta_reference_pp, 3);
  assert.equal(row.delta_reference_label, 'PREV');
  assert.equal(row.volume_24h_contracts, 145819);
  assert.equal(row.open_interest_contracts, 4488170);
  assert.equal(row.liquidity_usd, null);
  assert.equal(row.evidence_state, 'MEASURED');
});

test('Polymarket normalization reads the YES outcome and preserves point changes', () => {
  const market = findPolymarketMarket(fixture.polymarket_event, '2252244');
  const row = normalizePolymarketMarket(fixture.polymarket_event, market, meta, fixture.observed_at);
  assert.equal(row.probability_pct, 69.5);
  assert.equal(row.delta_1h_pp, 1);
  assert.equal(row.delta_24h_pp, 2);
  assert.equal(row.delta_7d_pp, -1);
  assert.equal(row.volume_24h_usd, 390591);
  assert.equal(row.liquidity_usd, 382870);
  assert.equal(row.evidence_state, 'MEASURED');
});

test('malformed prices fail closed instead of becoming zero', () => {
  const row = normalizePolymarketMarket(
    fixture.polymarket_event,
    { ...fixture.polymarket_event.markets[0], outcomePrices: 'not-json' },
    meta,
    fixture.observed_at,
  );
  assert.equal(row.probability_pct, null);
  assert.equal(row.evidence_state, 'PARTIAL');
});

test('grouping never blends contracts across venues', () => {
  const kalshi = normalizeKalshiMarket(fixture.kalshi, meta, fixture.observed_at);
  const polymarket = normalizePolymarketMarket(fixture.polymarket_event, fixture.polymarket_event.markets[0], meta, fixture.observed_at);
  const groups = groupContracts([kalshi, polymarket], [{ id: 'fed-september', label: 'FED · SEPTEMBER DECISION', relatedThemes: ['Fintech'] }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].contracts.length, 2);
  assert.deepEqual(groups[0].contracts.map(row => row.provider), ['KALSHI', 'POLYMARKET']);
  assert.equal('consensus_probability_pct' in groups[0], false);
});

test('Regime renders event odds with explicit venue units and provenance', () => {
  assert.match(app, /predictionSnapshot: staticGet\('\.\/data\/prediction-markets\.json'\)/);
  assert.match(app, /function renderPredictionMarkets\(snapshot\)/);
  assert.match(app, /PUBLIC EVENT MARKETS · READ ONLY/);
  assert.match(app, /volume_24h_contracts/);
  assert.match(app, /volume_24h_usd/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
  assert.match(css, /\.event-odds-row/);
  assert.match(css, /\.event-probability strong \{[^}]*font:800 14px\/1 var\(--mono\);/);
});

test('live trial snapshot is internally coherent and keeps provider units separate', () => {
  const contracts = snapshot.topics.flatMap(topic => topic.contracts);
  // Ladders may be capped for display (contracts_shown of contracts_total); loaded counts every fetched contract.
  assert.equal(snapshot.coverage.contracts_loaded, snapshot.topics.reduce((n, t) => n + (t.contracts_total ?? t.contracts.length), 0));
  const shownMeasured = contracts.filter(row => row.evidence_state === 'MEASURED').length;
  assert.ok(shownMeasured <= snapshot.coverage.contracts_measured && snapshot.coverage.contracts_measured <= snapshot.coverage.contracts_loaded);
  if (!snapshot.topics.some(t => t.contracts_total != null)) assert.equal(snapshot.coverage.contracts_measured, shownMeasured);
  assert.ok(contracts.some(row => row.provider === 'KALSHI'));
  assert.ok(contracts.some(row => row.provider === 'POLYMARKET'));
  for (const row of contracts) {
    assert.ok(row.probability_pct >= 0 && row.probability_pct <= 100);
    assert.ok(row.source_url.startsWith('https://'));
    if (row.provider === 'KALSHI') {
      assert.equal(row.volume_24h_usd, null);
      assert.equal(row.liquidity_usd, null);
    } else {
      assert.equal(row.volume_24h_contracts, null);
      assert.equal(row.open_interest_contracts, null);
    }
  }
});

test('collector failure is explicit and publishes no invented contracts', async () => {
  const failed = await buildSnapshot({
    observedAt: fixture.observed_at,
    fetchJsonFn: async () => { throw new Error('fixture provider unavailable'); },
  });
  assert.equal(failed.coverage.status, 'UNAVAILABLE');
  assert.equal(failed.coverage.contracts_loaded, 0);
  assert.equal(failed.coverage.failures.length, failed.coverage.contracts_expected);
  assert.deepEqual(failed.topics, []);
});

// (Local-tree frontend source-contract test omitted here: the public V2 app.js renders event odds differently.)
