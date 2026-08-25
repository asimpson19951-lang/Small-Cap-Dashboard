import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const APP_PATH = resolve(ROOT, 'v2', 'app.js');
const OUTPUT_PATH = resolve(ROOT, 'v2', 'data', 'breadth-tape.json');
const PAGE_SIZE = 1000;
const CFTC_TFF_URL = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
const CFTC_DCOT_URL = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';
const BLS_ICS_URL = 'https://www.bls.gov/schedule/news_release/bls.ics';

const COT_CONTRACTS = [
  { key: 'ES', label: 'S&P 500', dataset: 'TFF', match: /^E-MINI S&P 500 -/i },
  { key: 'NQ', label: 'Nasdaq 100', dataset: 'TFF', match: /^NASDAQ MINI -/i },
  { key: 'RTY', label: 'Russell 2000', dataset: 'TFF', match: /^RUSSELL E-MINI -/i },
  { key: 'VIX', label: 'VIX', dataset: 'TFF', match: /^VIX FUTURES -/i },
  { key: 'DXY', label: 'U.S. Dollar', dataset: 'TFF', match: /(U\.S\. DOLLAR INDEX|USD INDEX|DOLLAR INDEX)/i },
  { key: 'EUR', label: 'Euro FX', dataset: 'TFF', match: /^EURO FX -/i },
  { key: '10Y', label: '10Y Treasury', dataset: 'TFF', match: /^UST 10Y NOTE -/i },
  { key: 'BTC', label: 'Bitcoin', dataset: 'TFF', match: /^BITCOIN - CHICAGO/i },
  { key: 'ETH', label: 'Ether', dataset: 'TFF', match: /^ETHER CASH SETTLED -/i },
  { key: 'GC', label: 'Gold', dataset: 'DCOT', match: /^GOLD - COMMODITY EXCHANGE/i },
  { key: 'SI', label: 'Silver', dataset: 'DCOT', match: /^SILVER - COMMODITY EXCHANGE/i },
  { key: 'HG', label: 'Copper', dataset: 'DCOT', match: /^COPPER- #1 - COMMODITY EXCHANGE/i },
  { key: 'CL', label: 'WTI Crude', dataset: 'DCOT', match: /^WTI-PHYSICAL - NEW YORK/i },
  { key: 'NG', label: 'Natural Gas', dataset: 'DCOT', match: /^NAT GAS NYME - NEW YORK/i },
];

const FOMC_MEETINGS = {
  2026: [['2026-09-16', true], ['2026-10-28', false], ['2026-12-09', true]],
  2027: [['2027-01-27', false], ['2027-03-17', true], ['2027-04-28', false], ['2027-06-09', true], ['2027-07-28', false], ['2027-09-15', true], ['2027-10-27', false], ['2027-12-08', true]],
};

const BLS_KEEP = /(Consumer Price Index|Producer Price Index|Employment Situation|Job Openings and Labor Turnover|Employment Cost Index|Productivity and Costs|U\.S\. Import and Export Price Indexes)/i;
const BEA_KEEP = /(Gross Domestic Product|GDP \(|Personal Income and Outlays|International Trade in Goods and Services)/i;

function asNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function constituentTicker(value) {
  if (typeof value === 'string') return value.trim().toUpperCase();
  return String(value?.ticker || value?.tk || value?.symbol || '').trim().toUpperCase();
}

function uniqueTickers(theme) {
  return [...new Set([
    ...(Array.isArray(theme?.constituents) ? theme.constituents : []),
    ...(Array.isArray(theme?.sc_vehicles) ? theme.sc_vehicles : []),
  ].map(constituentTicker).filter(Boolean))];
}

export function summarizeRailRows(rows) {
  const byTicker = new Map();
  for (const row of rows) {
    const ticker = String(row?.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    let item = byTicker.get(ticker);
    if (!item) {
      item = { ticker, hodAnchors: new Set(), lodAnchors: new Set(), latest: null };
      byTicker.set(ticker, item);
    }
    if (row.hod_bar_ts) item.hodAnchors.add(row.hod_bar_ts);
    if (row.lod_bar_ts) item.lodAnchors.add(row.lod_bar_ts);
    if (!item.latest || Date.parse(row.bar_ts || '') > Date.parse(item.latest.bar_ts || '')) item.latest = row;
  }

  return [...byTicker.values()].map(item => ({
    ticker: item.ticker,
    // The first anchor establishes the session range. Only later anchor changes
    // are counted as hits, so a quiet name is 0 rather than 1.
    hod_hits: Math.max(0, item.hodAnchors.size - 1),
    lod_hits: Math.max(0, item.lodAnchors.size - 1),
    mins_since_hod: asNumber(item.latest?.mins_since_hod),
    mins_since_lod: asNumber(item.latest?.mins_since_lod),
    latest_bar: item.latest?.bar_ts || null,
    data_lag_sec: asNumber(item.latest?.data_lag_sec),
    provider_status: item.latest?.poly_status || null,
  })).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function rankedNames(members, field) {
  return members
    .filter(member => member[field] > 0)
    .sort((a, b) => b[field] - a[field] || a.ticker.localeCompare(b.ticker))
    .map(member => ({ ticker: member.ticker, hits: member[field], mins_since: field === 'hod_hits' ? member.mins_since_hod : member.mins_since_lod }));
}

export function rollupThemeTape(names, themes) {
  const nameMap = new Map(names.map(item => [item.ticker, item]));
  const mapped = new Set();
  const rows = themes
    .filter(theme => theme?.name && theme.stage !== 'DORMANT')
    .map(theme => {
      const tickers = uniqueTickers(theme);
      const members = tickers.map(ticker => nameMap.get(ticker)).filter(Boolean);
      members.forEach(member => mapped.add(member.ticker));
      const highs = rankedNames(members, 'hod_hits');
      const lows = rankedNames(members, 'lod_hits');
      return {
        name: theme.name,
        stage: theme.stage || null,
        members_measured: members.length,
        members_expected: tickers.length,
        hod_hits: highs.reduce((sum, item) => sum + item.hits, 0),
        lod_hits: lows.reduce((sum, item) => sum + item.hits, 0),
        hod_names: highs.length,
        lod_names: lows.length,
        highs,
        lows,
      };
    })
    .filter(theme => theme.members_measured > 0)
    .sort((a, b) => (b.hod_hits + b.lod_hits) - (a.hod_hits + a.lod_hits) || a.name.localeCompare(b.name));

  return {
    themes: rows,
    mapped_tickers: mapped.size,
    unmapped_tickers: names.map(item => item.ticker).filter(ticker => !mapped.has(ticker)),
  };
}

function normalizeBreadth(row) {
  return {
    et_date: row.et_date,
    above: asNumber(row.above),
    below: asNumber(row.below),
    side_max: asNumber(row.side_max),
    side_max_side: row.side_max_side || null,
    total: asNumber(row.total),
    universe_evaluated: asNumber(row.universe_evaluated),
    universe_warm: asNumber(row.universe_warm),
    themes_burning: asNumber(row.themes_burning),
    theme_names: Array.isArray(row.theme_names) ? row.theme_names : [],
    percentile_reached: asNumber(row.percentile_reached),
    monster: row.monster === true,
    trigger_kind: row.trigger_kind || null,
    measured_at: row.measured_at || null,
  };
}

function isoDay(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function signedNet(longValue, shortValue) {
  const long = asNumber(longValue);
  const short = asNumber(shortValue);
  return long == null || short == null ? null : long - short;
}

function pctOfOpenInterest(net, openInterest) {
  const oi = asNumber(openInterest);
  return net == null || oi == null || oi === 0 ? null : net / oi * 100;
}

function cotRow(contract, row) {
  if (!row) return null;
  const financial = contract.dataset === 'TFF';
  const primaryLong = financial ? row.lev_money_positions_long : row.m_money_positions_long_all;
  const primaryShort = financial ? row.lev_money_positions_short : row.m_money_positions_short_all;
  const primaryChangeLong = financial ? row.change_in_lev_money_long : row.change_in_m_money_long_all;
  const primaryChangeShort = financial ? row.change_in_lev_money_short : row.change_in_m_money_short_all;
  const secondaryLong = financial ? row.asset_mgr_positions_long : row.prod_merc_positions_long;
  const secondaryShort = financial ? row.asset_mgr_positions_short : row.prod_merc_positions_short;
  const primaryNet = signedNet(primaryLong, primaryShort);
  const secondaryNet = signedNet(secondaryLong, secondaryShort);
  return {
    key: contract.key,
    label: contract.label,
    dataset: contract.dataset,
    market: row.market_and_exchange_names || null,
    report_date: isoDay(row.report_date_as_yyyy_mm_dd),
    open_interest: asNumber(row.open_interest_all),
    primary_label: financial ? 'Leveraged funds' : 'Managed money',
    primary_net: primaryNet,
    primary_net_pct_oi: pctOfOpenInterest(primaryNet, row.open_interest_all),
    primary_weekly_change: signedNet(primaryChangeLong, primaryChangeShort),
    secondary_label: financial ? 'Asset managers' : 'Producers',
    secondary_net: secondaryNet,
    secondary_net_pct_oi: pctOfOpenInterest(secondaryNet, row.open_interest_all),
  };
}

export function buildCotSnapshot(tffRows, dcotRows) {
  const rowsByDataset = { TFF: tffRows || [], DCOT: dcotRows || [] };
  const contracts = COT_CONTRACTS.map(contract => {
    const match = rowsByDataset[contract.dataset]
      .filter(row => contract.match.test(String(row.market_and_exchange_names || '')))
      .sort((a, b) => String(b.report_date_as_yyyy_mm_dd || '').localeCompare(String(a.report_date_as_yyyy_mm_dd || '')))[0];
    return cotRow(contract, match);
  }).filter(Boolean);
  const dates = contracts.map(contract => contract.report_date).filter(Boolean).sort();
  return {
    source: 'CFTC Commitments of Traders Public Reporting Environment',
    source_url: 'https://publicreporting.cftc.gov/stories/s/r4w3-av2u',
    cadence: 'Weekly; Friday release using positions as of Tuesday close.',
    report_date: dates.at(-1) || null,
    contracts_expected: COT_CONTRACTS.length,
    contracts_measured: contracts.length,
    contracts,
  };
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '');
}

export function easternIso(year, month, day, hour = 0, minute = 0, second = 0) {
  const parts = [year, month, day, hour, minute, second].map(Number);
  if (parts.some(value => !Number.isInteger(value))) return null;
  const [yyyy, mm, dd, hh, min, sec] = parts;
  if (yyyy < 2000 || mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh < 0 || hh > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  // These official calendar events occur well after the 02:00 DST boundary.
  // Noon on the same New York date therefore gives the applicable UTC offset
  // without guessing whether the date is EST (-05:00) or EDT (-04:00).
  const probe = new Date(Date.UTC(yyyy, mm - 1, dd, 12));
  const zoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
    hour: '2-digit',
  }).formatToParts(probe).find(part => part.type === 'timeZoneName')?.value;
  const offset = String(zoneName || '').match(/^GMT([+-]\d{2}:\d{2})$/)?.[1];
  if (!offset) return null;
  return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}${offset}`;
}

function easternDateTime(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  return easternIso(match[1], match[2], match[3], match[4] || 0, match[5] || 0, match[6] || 0);
}

export function parseBlsCalendar(text) {
  const blocks = unfoldIcs(text).split('BEGIN:VEVENT').slice(1);
  return blocks.map(block => {
    const start = block.match(/DTSTART[^:]*:([^\r\n]+)/)?.[1];
    const title = block.match(/SUMMARY:([^\r\n]+)/)?.[1]?.replace(/\\,/g, ',').trim();
    const startsAt = easternDateTime(start);
    if (!title || !startsAt || !BLS_KEEP.test(title)) return null;
    return { starts_at: startsAt, kind: 'MACRO', title, source: 'BLS', source_url: BLS_ICS_URL };
  }).filter(Boolean);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function parseBeaSchedule(html, year = new Date().getFullYear()) {
  const rows = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rows.map(row => {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(stripHtml);
    const joined = cells.join(' ');
    const date = joined.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{1,2}:\d{2})\s+(AM|PM)/i);
    if (!date || !BEA_KEEP.test(joined)) return null;
    const month = new Date(`${date[1]} 1, ${year}`).getMonth() + 1;
    let hour = Number(date[3].split(':')[0]);
    const minute = date[3].split(':')[1];
    if (date[4].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (date[4].toUpperCase() === 'AM' && hour === 12) hour = 0;
    const title = cells.find(cell => BEA_KEEP.test(cell) && !date[0].includes(cell)) || joined.replace(date[0], '').replace(/^[NVD A]+\s*/i, '').trim();
    return {
      starts_at: easternIso(year, month, Number(date[2]), hour, Number(minute), 0),
      kind: 'MACRO',
      title,
      source: 'BEA',
      source_url: 'https://www.bea.gov/news/schedule/full',
    };
  }).filter(Boolean);
}

export function fomcCalendar(years = Object.keys(FOMC_MEETINGS).map(Number)) {
  return years.flatMap(year => (FOMC_MEETINGS[year] || []).map(([date, projections]) => ({
    starts_at: easternIso(...date.split('-').map(Number), 14, 0, 0),
    kind: 'MACRO',
    title: projections ? 'FOMC decision + economic projections' : 'FOMC decision',
    source: 'Federal Reserve',
    source_url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  })));
}

function uniqueThemeMembership(theme) {
  return uniqueTickers(theme);
}

export function buildEarningsDigest(earningsRows, newsRows, themes) {
  const tickerThemes = new Map();
  for (const theme of themes || []) {
    if (!theme?.name || theme.stage === 'DORMANT') continue;
    for (const ticker of uniqueThemeMembership(theme)) {
      if (!tickerThemes.has(ticker)) tickerThemes.set(ticker, []);
      tickerThemes.get(ticker).push(theme.name);
    }
  }
  const newsByTicker = new Map();
  for (const item of newsRows || []) {
    const ticker = String(item?.ticker || '').trim().toUpperCase();
    const sourceTier = asNumber(item?.source_tier);
    if (!ticker || sourceTier == null || sourceTier > 2 || item?.match_basis === 'MENTION') continue;
    if (!newsByTicker.has(ticker)) newsByTicker.set(ticker, []);
    newsByTicker.get(ticker).push({
      headline: item.headline || null,
      source: item.source || null,
      published_at: item.published_at || null,
      source_tier: sourceTier,
    });
  }
  for (const items of newsByTicker.values()) {
    items.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  }

  const byTheme = new Map();
  for (const row of earningsRows || []) {
    const ticker = String(row?.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    for (const themeName of tickerThemes.get(ticker) || []) {
      if (!byTheme.has(themeName)) byTheme.set(themeName, []);
      byTheme.get(themeName).push({
        ticker,
        report_date: row.report_date || null,
        session: row.session || null,
        eps_estimate: asNumber(row.eps_estimate),
        eps_actual: asNumber(row.eps_actual),
        surprise_pct: asNumber(row.surprise_pct),
        status: row.eps_actual == null ? 'SCHEDULED' : 'REPORTED',
        source: row.source || null,
        headlines: (newsByTicker.get(ticker) || []).slice(0, 2),
        transcript_status: 'UNAVAILABLE',
      });
    }
  }

  return {
    definition: 'Theme-member earnings dates/results plus matched news evidence. Transcript text remains unavailable until a licensed source is connected.',
    transcript_source: null,
    themes: [...byTheme.entries()].map(([name, events]) => ({
      name,
      events: events.sort((a, b) => String(a.report_date || '').localeCompare(String(b.report_date || '')) || a.ticker.localeCompare(b.ticker)),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function buildCatalystCalendar({ macroEvents = [], earningsRows = [], themes = [], generatedAt = new Date().toISOString(), daysBack = 3, daysForward = 45 }) {
  const now = Date.parse(generatedAt);
  const start = now - daysBack * 86400000;
  const end = now + daysForward * 86400000;
  const tickerThemes = new Map();
  for (const theme of themes || []) {
    for (const ticker of uniqueThemeMembership(theme)) {
      if (!tickerThemes.has(ticker)) tickerThemes.set(ticker, []);
      tickerThemes.get(ticker).push(theme.name);
    }
  }
  const earnings = (earningsRows || []).map(row => {
    const date = String(row.report_date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const [hour, minute] = row.session === 'BMO' ? [7, 0] : row.session === 'AMC' ? [16, 5] : [12, 0];
    return {
      starts_at: date ? easternIso(date[1], date[2], date[3], hour, minute, 0) : null,
      kind: 'EARNINGS',
      title: `${String(row.ticker || '').toUpperCase()} earnings`,
      ticker: String(row.ticker || '').toUpperCase() || null,
      themes: tickerThemes.get(String(row.ticker || '').toUpperCase()) || [],
      session: row.session || null,
      source: row.source || null,
      eps_estimate: asNumber(row.eps_estimate),
      eps_actual: asNumber(row.eps_actual),
      surprise_pct: asNumber(row.surprise_pct),
    };
  });
  const events = [...macroEvents, ...earnings]
    .filter(event => {
      const time = Date.parse(event.starts_at || '');
      return Number.isFinite(time) && time >= start && time <= end;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || String(a.title).localeCompare(String(b.title)));
  return {
    definition: 'Official U.S. macro release schedules plus the existing Finnhub-backed theme-member earnings calendar.',
    window: { from: new Date(start).toISOString(), to: new Date(end).toISOString() },
    sources: [...new Set(events.map(event => event.source).filter(Boolean))],
    events,
  };
}

export function buildSnapshot({ breadthRows, railRows, themes, cot = null, calendar = null, earningsDigest = null, generatedAt = new Date().toISOString() }) {
  const names = summarizeRailRows(railRows);
  const rollup = rollupThemeTape(names, themes);
  const latestBarMs = names.map(item => Date.parse(item.latest_bar || '')).filter(Number.isFinite);
  const lagValues = names.map(item => item.data_lag_sec).filter(value => value != null).sort((a, b) => a - b);
  const medianLag = lagValues.length ? lagValues[Math.floor(lagValues.length / 2)] : null;
  const etDate = railRows.find(row => row?.et_date)?.et_date || null;
  return {
    schema_version: 2,
    generated_at: generatedAt,
    breadth: {
      source: 'monster_day_breadth',
      definition: 'Daily entries beyond the calibrated 8EMA extension band in the mid/large-cap study universe.',
      rows: breadthRows.map(normalizeBreadth).sort((a, b) => String(a.et_date).localeCompare(String(b.et_date))),
    },
    tape: {
      source: 'rail_state',
      definition: 'Distinct RTH HOD/LOD re-anchors after the opening session anchor; delayed board rail, not a market-wide execution feed.',
      et_date: etDate,
      latest_bar: latestBarMs.length ? new Date(Math.max(...latestBarMs)).toISOString() : null,
      median_lag_sec: medianLag,
      tickers_measured: names.length,
      mapped_tickers: rollup.mapped_tickers,
      unmapped_tickers: rollup.unmapped_tickers,
      hod_hits: names.reduce((sum, item) => sum + item.hod_hits, 0),
      lod_hits: names.reduce((sum, item) => sum + item.lod_hits, 0),
      themes: rollup.themes,
    },
    cot,
    calendar,
    earnings_digest: earningsDigest,
  };
}

export function validateSnapshotForPublish(snapshot, now = Date.now()) {
  const errors = [];
  const generatedAt = Date.parse(snapshot?.generated_at || '');
  if (snapshot?.schema_version !== 2) errors.push('schema_version must be 2');
  if (!Number.isFinite(generatedAt)) errors.push('generated_at is missing or invalid');
  else if (Math.abs(now - generatedAt) > 15 * 60_000) errors.push('generated_at is more than 15 minutes from the validation clock');
  if (!Array.isArray(snapshot?.breadth?.rows) || snapshot.breadth.rows.length === 0) errors.push('breadth has no measured sessions');
  if (!Number.isInteger(snapshot?.tape?.tickers_measured) || snapshot.tape.tickers_measured <= 0) errors.push('tape has no measured tickers');
  const cotMeasured = snapshot?.cot?.contracts_measured;
  const cotExpected = snapshot?.cot?.contracts_expected;
  if (!Number.isInteger(cotMeasured) || !Number.isInteger(cotExpected) || cotMeasured !== cotExpected || cotExpected <= 0) {
    errors.push('COT contract coverage is incomplete');
  }
  if (!Array.isArray(snapshot?.calendar?.events) || snapshot.calendar.events.length === 0) errors.push('catalyst calendar has no verified events');
  if (!snapshot?.earnings_digest || !Array.isArray(snapshot.earnings_digest.themes)) errors.push('earnings digest is missing');
  return errors;
}

async function publicConfig() {
  const app = await readFile(APP_PATH, 'utf8');
  const url = app.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
  const key = app.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
  if (!url || !key) throw new Error('V2 public read configuration was not found.');
  return { url, key };
}

async function restGet(config, table, params = {}, range = null) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, value);
  });
  const headers = { apikey: config.key, Authorization: `Bearer ${config.key}` };
  if (range) headers.Range = `${range.from}-${range.to}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${table} returned ${response.status}`);
  return response.json();
}

async function restGetPaged(config, table, params) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await restGet(config, table, params, { from, to: from + PAGE_SIZE - 1 });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function publicJson(url, params) {
  const target = new URL(url);
  Object.entries(params || {}).forEach(([key, value]) => target.searchParams.set(key, value));
  const response = await fetch(target, { headers: { 'User-Agent': 'Austin Mean Reversion Radar personal research' } });
  if (!response.ok) throw new Error(`${target.hostname} returned ${response.status}`);
  return response.json();
}

async function publicText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Austin Mean Reversion Radar personal research' } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

async function cotSnapshot() {
  const selectTff = [
    'market_and_exchange_names', 'report_date_as_yyyy_mm_dd', 'open_interest_all',
    'asset_mgr_positions_long', 'asset_mgr_positions_short',
    'lev_money_positions_long', 'lev_money_positions_short',
    'change_in_lev_money_long', 'change_in_lev_money_short',
  ].join(',');
  const selectDcot = [
    'market_and_exchange_names', 'report_date_as_yyyy_mm_dd', 'open_interest_all',
    'prod_merc_positions_long', 'prod_merc_positions_short',
    'm_money_positions_long_all', 'm_money_positions_short_all',
    'change_in_m_money_long_all', 'change_in_m_money_short_all',
  ].join(',');
  const [tffRows, dcotRows] = await Promise.all([
    publicJson(CFTC_TFF_URL, { '$select': selectTff, '$order': 'report_date_as_yyyy_mm_dd desc', '$limit': '1000' }),
    publicJson(CFTC_DCOT_URL, { '$select': selectDcot, '$order': 'report_date_as_yyyy_mm_dd desc', '$limit': '1400' }),
  ]);
  return buildCotSnapshot(tffRows, dcotRows);
}

async function macroCalendar(generatedAt) {
  const year = Number(String(generatedAt).slice(0, 4));
  const [blsText, beaHtml] = await Promise.all([
    publicText(BLS_ICS_URL),
    publicText('https://www.bea.gov/news/schedule/full'),
  ]);
  return [
    ...parseBlsCalendar(blsText),
    ...parseBeaSchedule(beaHtml, year),
    ...fomcCalendar([year, year + 1]),
  ];
}

export async function refreshSnapshot() {
  const config = await publicConfig();
  const generatedAt = new Date().toISOString();
  const today = generatedAt.slice(0, 10);
  const fromDay = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
  const toDay = new Date(Date.parse(`${today}T12:00:00Z`) + 45 * 86400000).toISOString().slice(0, 10);
  const sinceNews = new Date(Date.parse(generatedAt) - 14 * 86400000).toISOString();
  const [breadthRows, latestRailDay, themes, earningsRows, newsRows, cot, macroEvents] = await Promise.all([
    restGet(config, 'monster_day_breadth', {
      select: 'et_date,above,below,side_max,side_max_side,total,universe_evaluated,universe_warm,themes_burning,theme_names,percentile_reached,monster,trigger_kind,measured_at',
      order: 'et_date.desc',
      limit: '60',
    }),
    restGet(config, 'rail_state', { select: 'et_date', session: 'eq.rth', order: 'et_date.desc', limit: '1' }),
    restGet(config, 'themes', { select: 'name,stage,constituents,sc_vehicles' }),
    restGet(config, 'earnings_calendar', {
      select: 'ticker,report_date,session,eps_estimate,eps_actual,surprise_pct,source,fetched_at',
      report_date: `gte.${fromDay}`,
      and: `(report_date.lte.${toDay})`,
      order: 'report_date.asc,ticker.asc',
      limit: '1000',
    }),
    restGet(config, 'news_cache', {
      select: 'ticker,headline,source,published_at,source_tier,provider,match_basis',
      published_at: `gte.${sinceNews}`,
      order: 'published_at.desc',
      limit: '1000',
    }),
    cotSnapshot(),
    macroCalendar(generatedAt),
  ]);
  const etDate = latestRailDay[0]?.et_date;
  const railRows = etDate ? await restGetPaged(config, 'rail_state', {
    select: 'ticker,bar_ts,et_date,hod_bar_ts,lod_bar_ts,mins_since_hod,mins_since_lod,data_lag_sec,poly_status',
    et_date: `eq.${etDate}`,
    session: 'eq.rth',
    order: 'bar_ts.asc,ticker.asc',
  }) : [];
  const calendar = buildCatalystCalendar({ macroEvents, earningsRows, themes, generatedAt });
  const earningsDigest = buildEarningsDigest(earningsRows, newsRows, themes);
  const snapshot = buildSnapshot({ breadthRows, railRows, themes, cot, calendar, earningsDigest, generatedAt });
  const validationErrors = validateSnapshotForPublish(snapshot, Date.parse(generatedAt));
  if (validationErrors.length) throw new Error(`snapshot refused: ${validationErrors.join('; ')}`);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const snapshot = await refreshSnapshot();
  console.log(`regime snapshot: ${snapshot.breadth.rows.length} breadth sessions, ${snapshot.tape.tickers_measured} tape names, ${snapshot.cot?.contracts_measured || 0} COT contracts, ${snapshot.calendar?.events?.length || 0} catalysts, ${snapshot.earnings_digest?.themes?.length || 0} earnings themes`);
}
