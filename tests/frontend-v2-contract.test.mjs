import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../v2/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../v2/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../v2/styles.css', import.meta.url), 'utf8');

test('v2 is a separate prototype with distinct trading books', () => {
  assert.match(html, /application-build" content="V2\.9\.3-prototype"/);
  assert.match(html, /Small Caps — Today/);
  assert.match(html, /Mid \/ Large — Swing/);
  assert.match(html, /class="lane-label">SC</);
  assert.match(html, /class="lane-label">ML</);
});

test('v2 adds one market-regime workspace for all five measured value adds', () => {
  assert.match(html, /data-view="breadth">REGIME/);
  assert.match(html, /id="breadthSurface"/);
  assert.match(app, /staticGet\('\.\/data\/breadth-tape\.json'\)/);
  assert.match(app, /8EMA entry breadth/);
  assert.match(app, /Theme HOD \/ LOD hit tape/);
  assert.match(app, /DELAYED 2-MINUTE BOARD RAIL/);
  assert.match(app, /members_measured/);
  assert.match(app, /median_lag_sec/);
  assert.match(app, /Commitments of Traders/);
  assert.match(app, /Catalyst calendar/);
  assert.match(app, /Earnings evidence digest/);
  assert.match(app, /TRANSCRIPT UNAVAILABLE/);
});

test('v2 browser data access is read-only and omits unused index context', () => {
  assert.doesNotMatch(app, /eq\.indices/);
  assert.doesNotMatch(html, /id="marketStrip"/);
  assert.doesNotMatch(app, /rest(?:Insert|Update|Delete|Upsert|Write)\s*\(/i);
  assert.doesNotMatch(app, /\/rest\/v1\/[^`'"?]+[^\s]*\b(?:insert|update|delete|upsert)\b/i);
});

test('v2 starts on data with only compact navigation, freshness, and refresh above it', () => {
  assert.doesNotMatch(html, /class="topbar"/);
  assert.doesNotMatch(html, /class="market-strip"/);
  assert.doesNotMatch(html, /class="book-header"/);
  assert.doesNotMatch(html, /class="section-heading"/);
  assert.match(html, /class="view-rule"><\/div>[\s\S]*id="freshness"[\s\S]*id="refreshButton"/);
  assert.match(css, /\.view-tabs\s*\{[^}]*min-height:\s*34px;/s);
});

test('v2 preserves unknown values instead of coercing null to zero', () => {
  assert.match(app, /if \(value == null \|\| value === ''\) return null;/);
  assert.match(app, /return n == null \? '—'/);
  assert.match(app, /rowTimes\.length \? Math\.max\(\.\.\.rowTimes\) : NaN/);
});

test('theme headers show measured 1D, 3D, and seven-session performance', () => {
  assert.match(app, /function themeTapeMove\(theme, sessions\)/);
  assert.match(app, /if \(measured\.length < sessions\) return null;/);
  assert.match(app, /themePerformanceCell\('1D', theme\.mov_1d\)/);
  assert.match(app, /themePerformanceCell\('3D', theme\.mov_3d\)/);
  assert.match(app, /themePerformanceCell\('7D', move7d\)/);
});

test('v2 preserves the delayed-rail execution boundary', () => {
  assert.match(html, /delayed rail is not execution/i);
  assert.match(app, /Delayed 2-minute evidence — execution stays on DAS\./);
  assert.match(app, /tf === '2m' \? ' · DELAYED'/);
});

test('1080 portrait keeps both books side by side and clips long row context', () => {
  assert.match(css, /\.books-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.books-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.context-line\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
});

test('v2 reuses the shipped current-dilution lifecycle rule', () => {
  assert.match(app, /filing\?\.lifecycle_state === 'ACTIVE_CAPACITY'/);
  assert.match(app, /filing\?\.lifecycle_state !== 'TAKEDOWN'/);
  assert.match(app, /filing\?\.filing_type !== '424B5' && filing\?\.filing_type !== 'ATM'/);
  assert.match(app, /ageMs <= 7 \* 86400_000/);
});

test('v2 exposes Ask Edgar as a plain-English small-cap dilution workspace', () => {
  assert.match(html, /data-ask-edgar>ASK EDGAR/);
  assert.match(app, /functions\/v1\/edgar-profile/);
  assert.match(app, /WHAT THE CURRENT EVIDENCE SUPPORTS/);
  assert.match(app, /profile\?\.evidence\?\.atm_program/);
  assert.match(app, /ATM CURRENT USABILITY/);
  assert.match(app, /CURRENT_USABILITY_UNKNOWN/);
  assert.match(app, /profile\?\.evidence\?\.baby_shelf_screen/);
  assert.match(app, /ATM LIFECYCLE ROW/);
  assert.match(app, /SHELF LIFECYCLE ROW/);
  assert.match(app, /I\.B\.6 SCREEN/);
  assert.match(app, /RECENT DILUTION FILINGS/);
  assert.match(app, /SEC TERMS IN PLAIN ENGLISH/);
  assert.match(app, /Registered amount is not the remaining balance/i);
  assert.match(app, /function plainEdgarBullets\(profile\)/);
  assert.match(app, /not counted as sellable now/);
  assert.match(app, /FULL LIFECYCLE COVERAGE NOT PROVEN/);
  assert.match(app, /historyCoverage\?\.complete === true/);
  assert.match(app, /FILES PARTIAL/);
  assert.match(app, /count is partial/);
  assert.match(app, /HISTORY COVERAGE UNAVAILABLE · LEGACY PROFILE/);
  assert.doesNotMatch(app, /WHAT THEY CAN SELL NOW/);
  assert.doesNotMatch(app, /verified active ATM program/i);
  assert.doesNotMatch(app, /BABY-SHELF CEILING/);
  assert.doesNotMatch(app, /% OF FLOAT/);
  assert.doesNotMatch(app, /storyBullets\(profile\?\.ai_read/);
});

test('v2 surfaces current market-wide scanner discovery without guessing class', () => {
  assert.match(html, /id="discoveryTitle">Market-wide discovery/);
  assert.match(html, /class="rail-tools"/);
  assert.match(app, /restGet\('scanner_hits', \{ select: '\*', order: 'rank\.asc,ticker\.asc' \}\)/);
  assert.match(app, /scan\.last_seen_at \|\| scan\.first_seen_at/);
  assert.match(app, /const rank = \(finite\(a\.rank\) \?\? 999\) - \(finite\(b\.rank\) \?\? 999\)/);
  assert.match(app, /gap_unk: \{ category: null/);
  assert.match(app, /const outsideRows = allRows\.filter\(scan => !watched\.has/);
  assert.match(app, /data-ticker="\$\{esc\(scan\.ticker\)\}"/);
});
