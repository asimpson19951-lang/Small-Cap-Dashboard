// New tests for RG1 items 2/3b -- the equity-session age gate added to
// scripts/build-breadth-tape-snapshot.mjs. Written to the out dir because
// tests/** is owned by another worker in this session; the lead should
// place this alongside tests/breadth-tape-snapshot.test.mjs if it ships.
//
// Import path assumes this file is dropped into the real repo's tests/
// directory (same relative path as tests/breadth-tape-snapshot.test.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSnapshot,
  equitySectionStatus,
  latestCompletedSession,
} from '../scripts/build-breadth-tape-snapshot.mjs';

test('latestCompletedSession steps back over a weekend to Friday', () => {
  assert.equal(latestCompletedSession('2026-09-27T15:29:00Z'), '2026-09-25'); // Sunday -> prior Friday
});

test('latestCompletedSession treats a weekday before 16:00 ET as still mid-session', () => {
  // 2026-09-25 is a Friday; 12:00 UTC = 08:00 ET, before the close.
  assert.equal(latestCompletedSession('2026-09-25T12:00:00Z'), '2026-09-24');
});

test('latestCompletedSession accepts a weekday after 16:00 ET as the completed session', () => {
  // 21:00 UTC = 17:00 EDT, after the close.
  assert.equal(latestCompletedSession('2026-09-25T21:00:00Z'), '2026-09-25');
});

test('equitySectionStatus flags data older than the expected session as stale with its as-of date', () => {
  assert.deepEqual(equitySectionStatus('2026-09-01', '2026-09-25'), {
    status: 'stale',
    as_of: '2026-09-01',
    expected_session: '2026-09-25',
  });
});

test('equitySectionStatus treats the expected session itself as current', () => {
  assert.deepEqual(equitySectionStatus('2026-09-25', '2026-09-25'), {
    status: 'current',
    as_of: '2026-09-25',
    expected_session: '2026-09-25',
  });
});

test('equitySectionStatus reports unavailable when there is no measured date at all', () => {
  assert.deepEqual(equitySectionStatus(null, '2026-09-25'), {
    status: 'unavailable',
    as_of: null,
    expected_session: '2026-09-25',
  });
});

test('buildSnapshot marks a stale breadth/tape section without nulling the rows, and does not touch calibrated definitions', () => {
  const rail = [
    { ticker: 'AAA', et_date: '2026-09-01', bar_ts: '2026-09-01T13:30:00Z', hod_bar_ts: 'h1', lod_bar_ts: 'l1', mins_since_hod: 0, mins_since_lod: 0, data_lag_sec: 900 },
  ];
  const snapshot = buildSnapshot({
    breadthRows: [{ et_date: '2026-09-01', above: 10, below: 5, measured_at: '2026-09-01T20:00:00Z' }],
    railRows: rail,
    themes: [],
    generatedAt: '2026-09-27T15:00:00Z',
  });
  assert.equal(snapshot.breadth.status, 'stale');
  assert.equal(snapshot.breadth.as_of, '2026-09-01');
  assert.equal(snapshot.breadth.expected_session, '2026-09-25');
  assert.equal(snapshot.breadth.rows.length, 1, 'stale data still publishes, it is flagged not dropped');
  assert.equal(snapshot.tape.status, 'stale');
  assert.equal(snapshot.tape.as_of, '2026-09-01');
  assert.match(snapshot.breadth.definition, /calibrated 8EMA extension band/i, 'calibrated definition text is unchanged');
  assert.match(snapshot.tape.definition, /delayed board rail/i, 'calibrated definition text is unchanged');
});

test('buildSnapshot marks a current session as current when et_date matches the expected session', () => {
  const rail = [
    { ticker: 'AAA', et_date: '2026-09-25', bar_ts: '2026-09-25T13:30:00Z', hod_bar_ts: 'h1', lod_bar_ts: 'l1', mins_since_hod: 0, mins_since_lod: 0, data_lag_sec: 900 },
  ];
  const snapshot = buildSnapshot({
    breadthRows: [{ et_date: '2026-09-25', above: 10, below: 5, measured_at: '2026-09-25T20:00:00Z' }],
    railRows: rail,
    themes: [],
    generatedAt: '2026-09-27T15:00:00Z',
  });
  assert.equal(snapshot.breadth.status, 'current');
  assert.equal(snapshot.tape.status, 'current');
});
