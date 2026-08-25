import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatalystCalendar,
  buildCotSnapshot,
  buildEarningsDigest,
  buildSnapshot,
  easternIso,
  parseBlsCalendar,
  rollupThemeTape,
  summarizeRailRows,
  validateSnapshotForPublish,
} from '../scripts/build-breadth-tape-snapshot.mjs';

const rail = [
  { ticker: 'AAA', et_date: '2026-08-21', bar_ts: '2026-08-21T13:30:00Z', hod_bar_ts: 'h1', lod_bar_ts: 'l1', mins_since_hod: 0, mins_since_lod: 0, data_lag_sec: 900 },
  { ticker: 'AAA', et_date: '2026-08-21', bar_ts: '2026-08-21T13:32:00Z', hod_bar_ts: 'h2', lod_bar_ts: 'l1', mins_since_hod: 0, mins_since_lod: 2, data_lag_sec: 902 },
  { ticker: 'AAA', et_date: '2026-08-21', bar_ts: '2026-08-21T13:34:00Z', hod_bar_ts: 'h3', lod_bar_ts: 'l2', mins_since_hod: 0, mins_since_lod: 0, data_lag_sec: 904 },
  { ticker: 'BBB', et_date: '2026-08-21', bar_ts: '2026-08-21T13:30:00Z', hod_bar_ts: 'bh1', lod_bar_ts: 'bl1', mins_since_hod: 0, mins_since_lod: 0, data_lag_sec: 901 },
  { ticker: 'BBB', et_date: '2026-08-21', bar_ts: '2026-08-21T13:32:00Z', hod_bar_ts: 'bh1', lod_bar_ts: 'bl2', mins_since_hod: 2, mins_since_lod: 0, data_lag_sec: 903 },
];

test('rail summary counts re-anchors after the opening anchor and preserves latest clocks', () => {
  const rows = summarizeRailRows(rail);
  assert.deepEqual(rows.map(row => [row.ticker, row.hod_hits, row.lod_hits]), [
    ['AAA', 2, 1],
    ['BBB', 0, 1],
  ]);
  assert.equal(rows[0].mins_since_lod, 0, 'zero is a measured clock, not unknown');
  assert.equal(rows[1].mins_since_hod, 2);
});

test('theme tape uses canonical membership and keeps honest denominators', () => {
  const names = summarizeRailRows(rail);
  const rolled = rollupThemeTape(names, [
    { name: 'Alpha', stage: 'BUILDING', constituents: ['AAA', { ticker: 'MISSING' }], sc_vehicles: ['BBB'] },
    { name: 'Dormant', stage: 'DORMANT', constituents: ['AAA'] },
  ]);
  assert.equal(rolled.themes.length, 1);
  assert.equal(rolled.themes[0].members_measured, 2);
  assert.equal(rolled.themes[0].members_expected, 3);
  assert.equal(rolled.themes[0].hod_hits, 2);
  assert.equal(rolled.themes[0].lod_hits, 2);
  assert.deepEqual(rolled.unmapped_tickers, []);
});

test('snapshot keeps unknown breadth values null and carries delayed-rail provenance', () => {
  const snapshot = buildSnapshot({
    breadthRows: [{ et_date: '2026-08-21', above: 67, below: null, universe_warm: 2098, measured_at: '2026-08-21T20:00:00Z' }],
    railRows: rail,
    themes: [{ name: 'Alpha', stage: 'BUILDING', constituents: ['AAA', 'BBB'] }],
    generatedAt: '2026-08-23T12:00:00Z',
  });
  assert.equal(snapshot.breadth.rows[0].below, null);
  assert.equal(snapshot.tape.et_date, '2026-08-21');
  assert.equal(snapshot.tape.tickers_measured, 2);
  assert.equal(snapshot.tape.median_lag_sec, 904);
  assert.match(snapshot.tape.definition, /delayed board rail/i);
});

test('COT snapshot computes net positioning without converting unknown values to zero', () => {
  const cot = buildCotSnapshot([
    {
      market_and_exchange_names: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',
      report_date_as_yyyy_mm_dd: '2026-08-18T00:00:00.000',
      open_interest_all: '1000',
      lev_money_positions_long: '250',
      lev_money_positions_short: '400',
      change_in_lev_money_long: '20',
      change_in_lev_money_short: '5',
      asset_mgr_positions_long: '500',
      asset_mgr_positions_short: '200',
    },
  ], []);
  const es = cot.contracts.find(contract => contract.key === 'ES');
  assert.equal(es.primary_net, -150);
  assert.equal(es.primary_weekly_change, 15);
  assert.equal(es.primary_net_pct_oi, -15);
  assert.equal(es.secondary_net, 300);
  assert.equal(cot.contracts_measured, 1);
});

test('BLS parser keeps selected market-moving releases and ignores the rest', () => {
  const rows = parseBlsCalendar(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20260911T083000\nSUMMARY:Consumer Price Index\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20260912T100000\nSUMMARY:County Employment and Wages\nEND:VEVENT\nEND:VCALENDAR`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Consumer Price Index');
  assert.equal(rows[0].starts_at, '2026-09-11T08:30:00-04:00');
});

test('official Eastern event times use the correct daylight or standard offset', () => {
  assert.equal(easternIso(2026, 9, 16, 14), '2026-09-16T14:00:00-04:00');
  assert.equal(easternIso(2026, 12, 9, 14), '2026-12-09T14:00:00-05:00');
});

test('catalyst calendar combines official macro dates with theme-member earnings', () => {
  const calendar = buildCatalystCalendar({
    generatedAt: '2026-08-23T12:00:00.000Z',
    macroEvents: [{ starts_at: '2026-08-26T08:30:00-04:00', kind: 'MACRO', title: 'GDP', source: 'BEA' }],
    earningsRows: [{ ticker: 'AAA', report_date: '2026-08-27', session: null, eps_estimate: null, source: 'finnhub' }],
    themes: [{ name: 'Alpha', constituents: ['AAA'] }],
  });
  assert.equal(calendar.events.length, 2);
  assert.deepEqual(calendar.events[1].themes, ['Alpha']);
  assert.equal(calendar.events[1].eps_estimate, null);
});

test('earnings digest is honest about missing transcripts and keeps matched evidence', () => {
  const digest = buildEarningsDigest(
    [{ ticker: 'AAA', report_date: '2026-08-27', eps_estimate: '1.2', eps_actual: null, source: 'finnhub' }],
    [{ ticker: 'AAA', headline: 'AAA sets earnings date', source: 'Company', published_at: '2026-08-20T12:00:00Z', source_tier: 2 }],
    [{ name: 'Alpha', stage: 'BUILDING', constituents: ['AAA'] }],
  );
  assert.equal(digest.themes[0].events[0].transcript_status, 'UNAVAILABLE');
  assert.equal(digest.themes[0].events[0].headlines[0].headline, 'AAA sets earnings date');
  assert.match(digest.definition, /licensed source/i);
});

test('publish validation accepts complete real-shaped evidence and rejects partial refreshes', () => {
  const generatedAt = '2026-08-25T12:00:00.000Z';
  const valid = {
    schema_version: 2,
    generated_at: generatedAt,
    breadth: { rows: [{ et_date: '2026-08-24', above: 1, below: 2 }] },
    tape: { tickers_measured: 148 },
    cot: { contracts_measured: 14, contracts_expected: 14 },
    calendar: { events: [{ starts_at: '2026-08-26T08:30:00-04:00' }] },
    earnings_digest: { themes: [] },
  };
  assert.deepEqual(validateSnapshotForPublish(valid, Date.parse(generatedAt)), []);
  assert.match(validateSnapshotForPublish({ ...valid, cot: { contracts_measured: 13, contracts_expected: 14 } }, Date.parse(generatedAt)).join(' '), /COT contract coverage is incomplete/);
  assert.match(validateSnapshotForPublish({ ...valid, breadth: { rows: [] } }, Date.parse(generatedAt)).join(' '), /breadth has no measured sessions/);
});
