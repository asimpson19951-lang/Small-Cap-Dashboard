// New tests for RG1 items 2/3b -- the deterministic nearest-event resolver
// added to scripts/build-prediction-markets-snapshot.mjs. Written to the out
// dir because tests/** is owned by another worker in this session; drop
// alongside tests/prediction-markets.test.mjs if it ships (same relative
// import path as that file).
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshot, capTopicLadder, TOPICS, RETIRED_ONE_OFF_TOPICS } from '../scripts/build-prediction-markets-snapshot.mjs';

const OBSERVED_AT = '2026-09-27T15:00:00Z';
const OBSERVED_MS = Date.parse(OBSERVED_AT);

function kalshiEventsPayload(eventTicker, closeIso, tickers) {
  return {
    events: [{
      event_ticker: eventTicker,
      markets: tickers.map(t => ({
        ticker: `${eventTicker}-${t}`,
        event_ticker: eventTicker,
        title: `Will X happen (${t})?`,
        yes_sub_title: t,
        close_time: closeIso,
        yes_bid_dollars: '0.4000',
        yes_ask_dollars: '0.5000',
        last_price_dollars: '0.4500',
      })),
    }],
  };
}

function fakeFetch(routes) {
  return async url => {
    for (const [pattern, response] of routes) {
      if (pattern.test(url)) return typeof response === 'function' ? response(url) : response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

test('resolver picks the nearest unexpired event and never throws on an expired topic', async () => {
  const fetchJsonFn = fakeFetch([
    [/series_ticker=KXFEDDECISION/, kalshiEventsPayload('KXFEDDECISION-26OCT', '2026-10-28T18:00:00Z', ['H0'])],
    [/series_ticker=/, { events: [] }], // every other Kalshi series: none open
    [/public-search/, { events: [] }], // no Polymarket matches in this fixture
  ]);
  const snapshot = await buildSnapshot({ observedAt: OBSERVED_AT, fetchJsonFn });
  assert.notEqual(snapshot.coverage.status, undefined);
  const fomc = snapshot.topics.find(t => t.id === 'fomc-decision');
  assert.ok(fomc, 'fomc topic has at least one live contract');
  assert.equal(fomc.contracts.length, 1);
  assert.equal(fomc.contracts[0].event_ticker, 'KXFEDDECISION-26OCT');
  assert.equal(fomc.contracts[0].series_ticker, 'KXFEDDECISION');
  // No topic-level throw even though every other series/search is empty.
  assert.ok(Array.isArray(snapshot.coverage.unavailable_topics));
});

test('an expired-looking event (all markets closed before observedAt) is excluded, not thrown', async () => {
  const fetchJsonFn = fakeFetch([
    [/series_ticker=KXFEDDECISION/, kalshiEventsPayload('KXFEDDECISION-26AUG', '2026-08-01T18:00:00Z', ['H0'])], // closed before OBSERVED_AT
    [/series_ticker=/, { events: [] }],
    [/public-search/, { events: [] }],
  ]);
  const snapshot = await buildSnapshot({ observedAt: OBSERVED_AT, fetchJsonFn });
  const fomc = snapshot.topics.find(t => t.id === 'fomc-decision');
  assert.equal(fomc, undefined, 'a topic with zero live contracts is dropped from topics[], not populated with stale data');
  const reason = snapshot.coverage.unavailable_topics.find(t => t.topic_id === 'fomc-decision');
  assert.ok(reason, 'fomc-decision is reported unavailable with a reason instead of silently vanishing');
});

test('a fetch failure on one series degrades coverage without discarding topics that succeeded', async () => {
  const fetchJsonFn = fakeFetch([
    [/series_ticker=KXFEDDECISION/, kalshiEventsPayload('KXFEDDECISION-26OCT', '2026-10-28T18:00:00Z', ['H0'])],
    [/series_ticker=KXCPIYOY/, () => { throw new Error('kalshi 500'); }],
    [/series_ticker=/, { events: [] }],
    [/public-search/, { events: [] }],
  ]);
  const snapshot = await buildSnapshot({ observedAt: OBSERVED_AT, fetchJsonFn });
  assert.equal(snapshot.coverage.status, 'DEGRADED');
  assert.ok(snapshot.coverage.failures.some(f => f.topic_id === 'cpi-inflation'));
  assert.ok(snapshot.topics.some(t => t.id === 'fomc-decision'), 'the unrelated fomc topic still published');
});

test('the retired one-off topics from the prior build always report a reason', () => {
  assert.deepEqual(RETIRED_ONE_OFF_TOPICS.map(t => t.id).sort(), ['fed-2026', 'iran-geopolitics', 'wti-august']);
  for (const topic of RETIRED_ONE_OFF_TOPICS) assert.ok(topic.reason.length > 0);
});

test('every declared topic id is unique', () => {
  const ids = TOPICS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

function contract(id, probability_pct) {
  return { contract_id: id, contract_label: null, probability_pct };
}

test('capTopicLadder leaves a topic with 5 or fewer contracts unchanged, tagging total/shown', () => {
  const topic = { id: 'x', contracts: [contract('A-T1', 10), contract('A-T2', 20)] };
  const capped = capTopicLadder(topic);
  assert.equal(capped.contracts.length, 2);
  assert.equal(capped.contracts_total, 2);
  assert.equal(capped.contracts_shown, 2);
});

test('capTopicLadder keeps the 5 contracts nearest 50% and reports total/shown', () => {
  const topic = {
    id: 'x',
    contracts: [
      contract('A-T1', 1), contract('A-T2', 99), contract('A-T3', 50),
      contract('A-T4', 45), contract('A-T5', 55), contract('A-T6', 40),
      contract('A-T7', 60), contract('A-T8', 30),
    ],
  };
  const capped = capTopicLadder(topic);
  assert.equal(capped.contracts_total, 8);
  assert.equal(capped.contracts_shown, 5);
  assert.deepEqual(capped.contracts.map(c => c.contract_id), ['A-T3', 'A-T4', 'A-T5', 'A-T6', 'A-T7'], 'selected 5 nearest 50%, displayed in threshold-ascending ladder order');
});

test('capTopicLadder tie-breaks equal distance-from-50 by threshold ascending, deterministically', () => {
  // T1=40 and T9=60 are both 10pp from 50 -- threshold ascending must pick T1 before T9
  // when only one of a tied pair fits in the remaining slots.
  const topic = {
    id: 'x',
    contracts: [
      contract('S-T50', 50), contract('S-T49', 49), contract('S-T51', 51),
      contract('S-T48', 48), contract('S-T52', 52), contract('S-T40', 40), contract('S-T60', 60),
    ],
  };
  const first = capTopicLadder(topic);
  const second = capTopicLadder({ id: 'x', contracts: [...topic.contracts].reverse() });
  assert.deepEqual(first.contracts.map(c => c.contract_id), second.contracts.map(c => c.contract_id), 'result does not depend on input order');
  assert.deepEqual(first.contracts.map(c => c.contract_id), ['S-T48', 'S-T49', 'S-T50', 'S-T51', 'S-T52']);
});
