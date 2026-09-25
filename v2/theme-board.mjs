import { atr5dValue, formatAtr5d, atr5dTitle, ATR5D_TITLE } from './atr5d.mjs?v=V2.11.55-LOCAL';
import { bandSortValue, numeric } from './list-sort.mjs?v=V2.11.78';

// THEMES heat-map board.
//
// Austin's concept (V2_FEEDBACK.md "Themes — heat-map scan plus clickable overview",
// Aug 21 2026; confirmed Sep 1 2026): the scan surface shows WHERE heat is
// concentrated, WHICH names participate, and a compact current story.
// Every receipt, census, and reader agreement lives behind the theme title click.
//
// Doctrine carried here:
//   - Story-identity, not scores: a theme box carries name, basket move, breadth,
//     two or three current sentences with age, and the names. No stage word or composite.
//   - Two systems: ML structure tiles are sized by capped market cap inside the
//     box; SC vehicles are a separate marked strip pulled from today's tape
//     (rows on the board that carry the theme tag). They never share a tile map.
//   - Unknown stays unknown: a missing move renders as "—" and a neutral tile.
//   - Long AND short: heat is absolute basket movement, direction shown by color.
//   - Cold themes stay on the board at reduced size so nothing disappears.

export const THEME_BOARD = Object.freeze({
  coldMove1d: 1.0, // percent: below this on the day and...
  coldMove3d: 3.0, // ...below this over three sessions with no extended member = cold
  storyMaxChars: 440,
  storyMaxSentences: 3,
  treemapPower: 0.62,
  treemapMaxShare: 0.38,
  mapMinHeight: 120,
  mapMaxHeight: 300,
  mapHeightPerMember: 24,
  mapHeightBase: 70,
});

// Theme-quality is an evidence ladder, not a blended score. Each gate stays
// visible so a large one-day move cannot overpower weak breadth, missing
// history, or an old catalyst. The thresholds are deliberately few and map to
// observable market facts: at least two names, at least 60% of the expected ML
// basket, two multi-session windows, and half the measured basket trading at
// least 20% above its prior-20-session average when volume confirms activity.
export const THEME_QUALITY = Object.freeze({
  minMeasuredMembers: 2,
  minCoverageRatio: 0.60,
  minDirectionalBreadth: 0.60,
  currentMoveFloorPct: 1.0,
  emergingMove5dPct: 2.0,
  volumeFloor: 1.20,
  volumeBreadth: 0.50,
  freshCatalystDays: 7,
  retireQuietSessions: 3,
});

function finite(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tickerOf(value) {
  const raw = typeof value === 'string' ? value : value?.ticker;
  return String(raw || '').trim().toUpperCase();
}

function sourceNames(value, fallback) {
  const supplied = Array.isArray(value?.membershipSources) ? value.membershipSources : [];
  return [...new Set([...supplied, fallback].filter(Boolean).map(source => String(source).trim()).filter(Boolean))];
}

function normalizedMember(value, { category = undefined, source = null, rowValue = undefined } = {}) {
  const ticker = tickerOf(value);
  if (!ticker) return null;
  const explicitCategory = typeof value === 'object' && value !== null && 'category' in value ? value.category : undefined;
  const rawCategory = explicitCategory !== undefined ? explicitCategory : category;
  const categoryText = rawCategory == null ? '' : String(rawCategory).trim().toUpperCase();
  const normalizedCategory = categoryText === 'ML' || categoryText === 'SC' ? categoryText : null;
  const row = rowValue !== undefined
    ? rowValue
    : typeof value === 'object' && value !== null && 'row' in value
      ? value.row
      : null;
  return {
    ...(typeof value === 'object' && value !== null ? value : {}),
    ticker,
    category: normalizedCategory,
    suppliedCategory: categoryText && normalizedCategory == null ? categoryText : null,
    row: row && typeof row === 'object' ? { ...row, ticker } : null,
    provisional: value?.provisional === true,
    membershipSources: sourceNames(value, source),
  };
}

/**
 * Deduplicated union of every member source supplied to the renderer. The
 * current joined `members` and tagged `vehicles` inputs remain supported;
 * `rosters` lets integration preserve identities before market rows exist.
 */
export function suppliedMemberUnion({ members = [], vehicles = [], rosters = null } = {}) {
  const ordered = [];
  const byTicker = new Map();
  const add = (value, defaults) => {
    const candidate = normalizedMember(value, defaults);
    if (!candidate) return;
    const existing = byTicker.get(candidate.ticker);
    if (!existing) {
      byTicker.set(candidate.ticker, candidate);
      ordered.push(candidate);
      return;
    }
    existing.membershipSources = [...new Set([...existing.membershipSources, ...candidate.membershipSources])];
    existing.provisional = existing.provisional || candidate.provisional;
    if (!existing.row && candidate.row) existing.row = candidate.row;
    if (existing.category == null && candidate.category != null) existing.category = candidate.category;
    if (existing.category != null && candidate.category != null && existing.category !== candidate.category) {
      existing.classificationConflict = true;
    }
  };

  for (const member of members) add(member, { source: 'joined' });
  for (const member of rosters?.registry || []) add(member, { source: 'registry' });
  for (const member of rosters?.theme || []) add(member, { source: 'theme' });
  for (const member of rosters?.declaredSc || []) add(member, { category: 'SC', source: 'declared SC' });
  for (const row of vehicles) add(row, { category: 'SC', source: 'tagged', rowValue: row });
  for (const row of rosters?.tagged || []) add(row, { category: 'SC', source: 'tagged', rowValue: row });

  return ordered.map(member => ({
    ...member,
    taggedOnly: member.membershipSources.length === 1 && member.membershipSources[0] === 'tagged',
  }));
}

function hasBbMeasurement(row) {
  return finite(row?.bb_position) != null
    || String(row?.bb_touch || '').trim() !== ''
    || (String(row?.bb_completed_side || '').trim() !== '' && finite(row?.bb_completed_consec) != null);
}

export function measurementCoverage(members) {
  const total = members.length;
  const count = predicate => members.filter(member => predicate(member.row)).length;
  return {
    total,
    move1d: count(row => finite(row?.change_pct) != null),
    daily: count(row => finite(row?.d_count) != null),
    bb: count(row => hasBbMeasurement(row)),
    ema8: count(row => finite(row?.ema8_dist) != null),
    atr5d: count(row => atr5dValue(row) != null),
  };
}

export function tapeAvailability(mov1d, mov3d) {
  const available = [finite(mov1d), finite(mov3d)].filter(value => value != null).length;
  if (available === 0) return 'unavailable';
  if (available === 1) return 'partial';
  return 'complete';
}

function wholeCount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function membershipState(value, loaded) {
  const allowed = new Set(['complete', 'partial', 'unavailable', 'conflicting']);
  let status = allowed.has(String(value?.status || '').toLowerCase()) ? String(value.status).toLowerCase() : 'unavailable';
  const expectedTotal = wholeCount(value?.expectedTotal);
  if (expectedTotal != null && expectedTotal < loaded) status = 'conflicting';
  const complete = status === 'complete' && expectedTotal === loaded;
  if (status === 'complete' && !complete) status = 'conflicting';
  return { status, expectedTotal, complete };
}

export function receiptCoverageState(value) {
  const allowed = new Set(['complete', 'partial', 'unavailable', 'conflicting', 'retained']);
  let status = allowed.has(String(value?.status || '').toLowerCase()) ? String(value.status).toLowerCase() : 'unavailable';
  const loaded = wholeCount(value?.loaded);
  const expected = wholeCount(value?.expected);
  if ((expected != null && (loaded == null || expected < loaded)) || (status === 'complete' && (loaded == null || expected == null || loaded !== expected))) {
    status = 'conflicting';
  }
  if (loaded == null && status !== 'unavailable') status = 'conflicting';
  return { status, loaded, expected };
}

function observation(value) {
  const observedAt = String(value?.observedAt || '').trim();
  const basis = String(value?.basis || '').trim();
  const timestamp = Date.parse(observedAt);
  if (!observedAt || !basis || !Number.isFinite(timestamp)) return null;
  return { observedAt, basis, timestamp };
}

/** Displays a supplied summary only when paired observations share a basis. */
export function comparisonState(comparison) {
  const start = observation(comparison?.start);
  const end = observation(comparison?.end);
  if (!start || !end) {
    const hasInvalidTimestamp = (comparison?.start?.observedAt && !start) || (comparison?.end?.observedAt && !end);
    return {
      available: false,
      reason: hasInvalidTimestamp ? 'Observation timestamp or basis is invalid.' : 'No compatible baseline was supplied.',
      startAt: start?.observedAt || null,
      endAt: end?.observedAt || null,
    };
  }
  if (start.basis !== end.basis) {
    return { available: false, reason: 'Observation basis differs.', startAt: start.observedAt, endAt: end.observedAt };
  }
  if (end.timestamp <= start.timestamp) {
    return { available: false, reason: 'End observation must be later than the baseline.', startAt: start.observedAt, endAt: end.observedAt };
  }
  const summary = String(comparison?.summary || '').trim();
  if (!summary) {
    return { available: false, reason: 'No change summary was supplied.', startAt: start.observedAt, endAt: end.observedAt };
  }
  return { available: true, summary, startAt: start.observedAt, endAt: end.observedAt, basis: start.basis };
}

export function parseBreadth(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const hot = Number(match[1]);
  const total = Number(match[2]);
  if (!(total > 0) || hot > total) return null;
  return { hot, total };
}

/** Split-adjusted price return over an ordered observation window. Missing
 * observations stay missing: compacting a gap would silently change the start
 * session and fabricate a return. Dated chart-bar enrichment identifies exact
 * sessions separately through `quality_session_dates`. */
export function sessionReturn(row, sessions) {
  if (!Number.isInteger(sessions) || sessions < 1) return null;
  const sourceCloses = Array.isArray(row?.quality_closes_30d) ? row.quality_closes_30d : row?.closes_30d;
  const closes = Array.isArray(sourceCloses)
    ? sourceCloses.map(value => {
      const close = finite(value);
      return close != null && close > 0 ? close : null;
    })
    : [];
  if (closes.length < sessions + 1) return null;
  const window = closes.slice(-(sessions + 1));
  if (window.some(value => value == null)) return null;
  const end = window.at(-1);
  const start = window[0];
  return start > 0 ? (end / start - 1) * 100 : null;
}

function medianKnown(values) {
  const known = values.filter(value => value != null).sort((a, b) => a - b);
  if (!known.length) return null;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2;
}

function directionalBreadth(values, total) {
  const known = values.filter(value => value != null);
  if (known.length < THEME_QUALITY.minMeasuredMembers || !(total > 0)) return null;
  const positive = known.filter(value => value > 0).length;
  const negative = known.filter(value => value < 0).length;
  const dominant = Math.max(positive, negative);
  if (dominant < THEME_QUALITY.minMeasuredMembers || dominant / total < THEME_QUALITY.minDirectionalBreadth) return null;
  return {
    direction: positive > negative ? 'bullish' : 'bearish',
    confirmed: dominant,
    positive,
    negative,
    measured: known.length,
    total,
  };
}

function etDateKey(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function catalystTimestamp(catalyst) {
  for (const value of [catalyst?.publication_at, catalyst?.published_at, catalyst?.event_at, catalyst?.date]) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function latestCatalyst(theme, wallClockMs) {
  const catalysts = Array.isArray(theme?.deep?.driver?.catalysts) ? theme.deep.driver.catalysts : [];
  const timestamps = catalysts
    .filter(catalyst => catalyst?.sc !== true && String(catalyst?.kind || catalyst?.category || '').toUpperCase() !== 'COMMENTARY')
    .map(catalystTimestamp).filter(value => value != null && value <= wallClockMs);
  const timestamp = timestamps.length ? Math.max(...timestamps) : null;
  const ageDays = timestamp == null ? null : (wallClockMs - timestamp) / 86400000;
  return {
    timestamp,
    ageDays,
    fresh: ageDays != null && ageDays <= THEME_QUALITY.freshCatalystDays,
  };
}

function rounded(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function previousStateFor(context, name) {
  if (context?.previousByName instanceof Map) return context.previousByName.get(name)?.state || null;
  return context?.previousByName?.[name]?.state || null;
}

function fundLike(member) {
  const row = member?.row || {};
  const kind = row.instrumentKind ?? row.instrument_type ?? row.security_type ?? row.type;
  return typeof kind === 'string' && /^(ETF|ETN|ETV|FUND|COMMODITY POOL)$/i.test(kind.trim());
}

function exactSessionHistory(row, expectedSession) {
  const dates = Array.isArray(row?.quality_session_dates) ? row.quality_session_dates : [];
  const closes = Array.isArray(row?.quality_closes_30d) ? row.quality_closes_30d : row?.closes_30d;
  return row?.quality_session_sequence === 'complete' && dates.length === closes.length && dates.length > 0 && dates.at(-1) === expectedSession;
}

function memberSessionDate(row) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.change_session_date || ''))) return row.change_session_date;
  return etDateKey(row?.updated_at);
}

function memberHistorySessionDate(row) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.quality_history_session || ''))) return row.quality_history_session;
  const dated = Array.isArray(row?.quality_session_dates) ? row.quality_session_dates.at(-1) : null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dated || ''))) return dated;
  const qualityAt = etDateKey(row?.quality_as_of);
  if (qualityAt) return qualityAt;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_as_of || '')) &&
      row?.d_count_completed_through === row.d_count_as_of) return row.d_count_as_of;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.d_count_completed_through || ''))) return row.d_count_completed_through;
  return null;
}

function independentlyClassified(member) {
  if (fundLike(member)) return false;
  const row = member?.row || {};
  const kind = row.instrumentKind ?? row.instrument_type ?? row.security_type ?? row.type;
  if (kind == null || String(kind).trim() === '') return member?.category === 'ML';
  return /^(CS|COMMON STOCK|STOCK|EQUITY|COMPANY)$/i.test(String(kind).trim());
}

/** Classifies one Theme from current measured evidence. Stage labels and old
 * narratives are descriptive inputs only; neither can keep a theme in play.
 * A bearish theme can qualify, but a fading former bull needs current breadth,
 * volume, or a fresh catalyst before it is treated as an active breakdown. */
export function themeQualityProfile(box, context = {}) {
  const marketSession = context.marketSession || {};
  const currentSession = marketSession.latestDate || marketSession.sessionDate || null;
  const historySession = context.completedHistorySession || marketSession.completedDate || currentSession;
  const themeDate = etDateKey(box?.theme?.updated_at);
  const sessionUsable = ['live-current', 'session-final'].includes(marketSession.mode);
  const sourceCutoff = context.sourceCutoff || marketSession.latestAt || box?.theme?.updated_at || null;
  const wallClockAt = context.wallClockAt || context.evaluationAt || new Date().toISOString();
  const wallClockMs = Date.parse(wallClockAt || '');
  const wallClockDate = etDateKey(wallClockAt);
  const themeReceiptFresh = themeDate != null && currentSession != null && themeDate >= currentSession &&
    (wallClockDate == null || themeDate <= wallClockDate);
  const metricsFresh = sessionUsable && currentSession != null && themeReceiptFresh;

  // Unknown classification remains eligible for measurement but is called out
  // in data health. SC vehicles stay outside the structure calculation.
  const members = [
    ...(Array.isArray(box?.structure) ? box.structure : []),
    ...(Array.isArray(box?.unknownClass) ? box.unknownClass : []),
  ];
  const total = Math.max(
    members.length,
    wholeCount(box?.breadth?.total) ?? 0,
  );
  const fullMembershipTotal = Math.max(box?.members?.length || 0, wholeCount(box?.membership?.expectedTotal) ?? 0);
  const memberCurrent = members.map(member => memberSessionDate(member?.row) === currentSession);
  const historyCurrent = members.map(member => memberHistorySessionDate(member?.row) === historySession);
  const returns5 = members.map((member, index) => historyCurrent[index] ? sessionReturn(member.row, 5) : null);
  const returns20 = members.map((member, index) => historyCurrent[index] ? sessionReturn(member.row, 20) : null);
  const measured5 = returns5.filter(value => value != null).length;
  const measured20 = returns20.filter(value => value != null).length;
  const exactHistoryMeasured = members.filter((member, index) => historyCurrent[index] &&
    sessionReturn(member.row, 5) != null && exactSessionHistory(member.row, historySession)).length;
  const coverage5 = total > 0 ? measured5 / total : 0;
  const coverage20 = total > 0 ? measured20 / total : 0;
  const breadth5 = directionalBreadth(returns5, total);
  const breadth20 = directionalBreadth(returns20, total);
  const persistentDirection = breadth5 && breadth20 && breadth5.direction === breadth20.direction
    ? breadth5.direction
    : null;

  // Equal-weight median keeps one extreme member from defining the basket.
  const return5d = medianKnown(returns5);
  const return20d = medianKnown(returns20);
  const benchmark = context.benchmark || null;
  const benchmarkCurrent = benchmark && benchmark.asOf === historySession;
  const benchmark5 = benchmarkCurrent ? finite(benchmark.return5d) : null;
  const benchmark20 = benchmarkCurrent ? finite(benchmark.return20d) : null;
  const relative5d = return5d != null && benchmark5 != null ? return5d - benchmark5 : null;
  const relative20d = return20d != null && benchmark20 != null ? return20d - benchmark20 : null;

  const direction = persistentDirection || breadth5?.direction || null;
  // A member appearing in several themes, or a sector/industry fund, may
  // describe the direction of a basket but cannot independently confirm that
  // the basket has fresh participation. Keep it in return/breadth coverage and
  // remove it only from the activity confirmation denominator.
  const sharedTickers = context.sharedTickers instanceof Set
    ? context.sharedTickers
    : new Set((context.sharedTickers || []).map(tickerOf).filter(Boolean));
  const sharedMembers = members.filter(member => sharedTickers.has(tickerOf(member))).map(tickerOf);
  const fundMembers = members.filter(fundLike).map(tickerOf);
  const classificationUnknownMembers = members.filter(member => !fundLike(member) && !independentlyClassified(member)).map(tickerOf);
  const confirmationEligible = members.filter(member =>
    !sharedTickers.has(tickerOf(member)) && independentlyClassified(member));
  const confirmationTotal = confirmationEligible.length;
  const confirmationMembers = confirmationEligible.filter(member => memberSessionDate(member?.row) === currentSession);
  const currentCoverage = confirmationTotal > 0 ? confirmationMembers.length / confirmationTotal : 0;
  const currentCoverageSufficient = currentCoverage >= THEME_QUALITY.minCoverageRatio;
  const currentMoves = confirmationMembers.map(member => finite(member?.row?.change_pct));
  const currentAligned = direction == null ? 0 : currentMoves.filter(value => value != null &&
    Math.abs(value) >= THEME_QUALITY.currentMoveFloorPct &&
    (direction === 'bullish' ? value > 0 : value < 0)).length;
  const currentBroad = confirmationTotal > 0 && currentAligned >= THEME_QUALITY.minMeasuredMembers &&
    currentAligned / confirmationTotal >= THEME_QUALITY.minDirectionalBreadth;

  const volumeValues = confirmationMembers.map(member => finite(member?.row?.volume_ratio)).filter(value => value != null);
  const volumeConfirmedCount = volumeValues.filter(value => value >= THEME_QUALITY.volumeFloor).length;
  const volumeNeeded = Math.max(THEME_QUALITY.minMeasuredMembers, Math.ceil(confirmationTotal * THEME_QUALITY.volumeBreadth));
  const volumeConfirmed = volumeConfirmedCount >= volumeNeeded;
  const catalyst = latestCatalyst(box?.theme, Number.isFinite(wallClockMs) ? wallClockMs : Date.now());

  const directionalRelative5 = direction === 'bearish' && relative5d != null ? -relative5d : relative5d;
  const directionalRelative20 = direction === 'bearish' && relative20d != null ? -relative20d : relative20d;
  const relativePersistent = directionalRelative5 != null && directionalRelative20 != null &&
    directionalRelative5 > 0 && directionalRelative20 > 0;
  const broad5 = breadth5 != null && coverage5 >= THEME_QUALITY.minCoverageRatio;
  const broad20 = breadth20 != null && coverage20 >= THEME_QUALITY.minCoverageRatio;
  const persistent = persistentDirection != null && broad5 && broad20;
  const material5 = return5d != null && Math.abs(return5d) >= THEME_QUALITY.emergingMove5dPct;
  // Direction is not activity. A broad multi-week decline is still cooling
  // unless the current session participates and volume, relative movement, or
  // a fresh dated catalyst independently confirms that the breakdown is live.
  const independentEligible = confirmationTotal >= THEME_QUALITY.minMeasuredMembers;
  const bearishConfirmed = direction === 'bearish' && independentEligible && currentBroad &&
    (volumeConfirmed || catalyst.fresh);
  const bullishConfirmed = direction === 'bullish' && independentEligible &&
    (volumeConfirmed || relativePersistent || catalyst.fresh);
  const emergingConfirmed = direction === 'bearish'
    ? (volumeConfirmed || catalyst.fresh)
    : (material5 || volumeConfirmed || directionalRelative5 > 0 || catalyst.fresh);

  let state;
  if (!metricsFresh || total < THEME_QUALITY.minMeasuredMembers || coverage5 < THEME_QUALITY.minCoverageRatio) {
    state = 'unavailable';
  } else if (persistent && currentCoverageSufficient && (bullishConfirmed || bearishConfirmed)) {
    state = 'in_play';
  } else if (broad5 && currentBroad && emergingConfirmed) {
    state = 'emerging';
  } else if (finite(box?.theme?.quiet_days) >= THEME_QUALITY.retireQuietSessions ||
    (box?.theme?.stage === 'DORMANT' && !currentBroad && !catalyst.fresh)) {
    state = 'retired';
  } else {
    state = 'cooling';
  }

  const dataHealth = [];
  if (!sessionUsable) dataHealth.push('MARKET_SESSION_UNUSABLE');
  if (sessionUsable && !themeReceiptFresh) dataHealth.push('THEME_RECEIPT_STALE_OR_FUTURE');
  const currentMembers = memberCurrent.filter(Boolean).length;
  if (currentMembers < total) dataHealth.push(`MEMBER_SESSION_COVERAGE_PARTIAL:${currentMembers}/${total}`);
  const historyCurrentMembers = historyCurrent.filter(Boolean).length;
  if (historyCurrentMembers < total) dataHealth.push(`HISTORY_SESSION_COVERAGE_PARTIAL:${historyCurrentMembers}/${total}`);
  if (exactHistoryMeasured < measured5) dataHealth.push(`HISTORY_SESSION_DATES_PARTIAL:${exactHistoryMeasured}/${measured5}`);
  if (box?.members?.length < fullMembershipTotal) dataHealth.push(`FULL_MEMBERSHIP_COVERAGE_PARTIAL:${box?.members?.length || 0}/${fullMembershipTotal}`);
  if (coverage5 < 1) dataHealth.push('FIVE_DAY_COVERAGE_PARTIAL');
  if (coverage20 < 1) dataHealth.push('TWENTY_DAY_COVERAGE_PARTIAL');
  if (volumeValues.length < confirmationTotal) dataHealth.push(`VOLUME_COVERAGE_PARTIAL:${volumeValues.length}/${confirmationTotal}`);
  if (!currentCoverageSufficient) dataHealth.push(`CURRENT_ACTIVITY_COVERAGE_PARTIAL:${confirmationMembers.length}/${confirmationTotal}`);
  if (!benchmarkCurrent || benchmark5 == null || benchmark20 == null) dataHealth.push('BENCHMARK_UNAVAILABLE');
  if ((box?.unknownClass || []).length) dataHealth.push('MEMBER_CLASSIFICATION_PARTIAL');
  if (classificationUnknownMembers.length) dataHealth.push(`UNCLASSIFIED_ACTIVITY_EXCLUDED:${[...new Set(classificationUnknownMembers)].join(',')}`);
  if (sharedMembers.length) dataHealth.push(`SHARED_MEMBER_ACTIVITY_EXCLUDED:${[...new Set(sharedMembers)].join(',')}`);
  if (fundMembers.length) dataHealth.push(`FUND_ACTIVITY_EXCLUDED:${[...new Set(fundMembers)].join(',')}`);
  if (catalyst.timestamp == null) dataHealth.push('CATALYST_UNAVAILABLE');
  else if (!catalyst.fresh) dataHealth.push('CATALYST_STALE');

  const whyRanked = [
    `${measured5}/${total} measured over 5 observations${members.every(member => !member?.row || exactSessionHistory(member.row, historySession)) ? ' (dated sessions)' : ' (session dates partial)'}`,
    breadth5 ? `${breadth5.confirmed}/${total} ${breadth5.direction} over 5 observations` : '5-observation direction unconfirmed',
    breadth20 ? `${breadth20.confirmed}/${total} ${breadth20.direction} over 20 observations` : '20-observation direction unconfirmed',
    `${currentAligned}/${confirmationTotal} independent members aligned today`,
    `${volumeConfirmedCount}/${confirmationTotal} independent members at or above ${THEME_QUALITY.volumeFloor.toFixed(1)}x volume`,
    benchmarkCurrent && relative5d != null && relative20d != null
      ? `vs ${benchmark.ticker || 'benchmark'} ${relative5d >= 0 ? '+' : ''}${relative5d.toFixed(1)}% 5D, ${relative20d >= 0 ? '+' : ''}${relative20d.toFixed(1)}% 20D`
      : 'benchmark comparison unavailable',
    catalyst.fresh ? 'fresh confirmed catalyst' : catalyst.timestamp == null ? 'catalyst unavailable' : 'catalyst stale',
  ];
  const priorState = previousStateFor(context, box?.name);

  return Object.freeze({
    state,
    rankBand: { in_play: 0, emerging: 1, cooling: 2, retired: 3, unavailable: 4 }[state],
    direction,
    sourceCutoff,
    whatChanged: priorState && priorState !== state ? `${priorState} -> ${state}` : priorState ? 'unchanged' : 'baseline unavailable',
    whyRanked: Object.freeze(whyRanked),
    dataHealth: Object.freeze(dataHealth),
    evidence: Object.freeze({
      measured5, measured20, total, fullMembershipTotal,
      coverage5: rounded(coverage5), coverage20: rounded(coverage20),
      positive5d: breadth5?.positive ?? null, negative5d: breadth5?.negative ?? null,
      positive20d: breadth20?.positive ?? null, negative20d: breadth20?.negative ?? null,
      direction5d: breadth5?.direction ?? null, direction20d: breadth20?.direction ?? null,
      currentAligned, activityEligible: confirmationTotal,
      activityCurrent: confirmationMembers.length, currentCoverage: rounded(currentCoverage),
      volumeMeasured: volumeValues.length, volumeConfirmed: volumeConfirmedCount,
      return5d: rounded(return5d), return20d: rounded(return20d),
      relative5d: rounded(relative5d), relative20d: rounded(relative20d),
      directionalRelative5: rounded(directionalRelative5), directionalRelative20: rounded(directionalRelative20),
      catalystAgeDays: rounded(catalyst.ageDays),
      metricsFresh, persistent, currentBroad, memberSessionCurrent: currentMembers,
      historySessionCurrent: historyCurrentMembers, exactHistoryMeasured, currentSession, historySession,
      sharedMembers: Object.freeze([...new Set(sharedMembers)]),
      fundMembers: Object.freeze([...new Set(fundMembers)]),
      classificationUnknownMembers: Object.freeze([...new Set(classificationUnknownMembers)]),
    }),
  });
}

function compareQualityBoxes(a, b) {
  const qa = a.quality;
  const qb = b.quality;
  if (qa.rankBand !== qb.rankBand) return qa.rankBand - qb.rankBand;
  if (qa.evidence.persistent !== qb.evidence.persistent) return qa.evidence.persistent ? -1 : 1;
  const aConfirmed = qa.evidence.total > 0
    ? (Math.max(qa.evidence.positive5d ?? 0, qa.evidence.negative5d ?? 0) +
      Math.max(qa.evidence.positive20d ?? 0, qa.evidence.negative20d ?? 0)) / qa.evidence.total
    : 0;
  const bConfirmed = qb.evidence.total > 0
    ? (Math.max(qb.evidence.positive5d ?? 0, qb.evidence.negative5d ?? 0) +
      Math.max(qb.evidence.positive20d ?? 0, qb.evidence.negative20d ?? 0)) / qb.evidence.total
    : 0;
  if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed;
  const aVolume = qa.evidence.volumeMeasured > 0 ? qa.evidence.volumeConfirmed / qa.evidence.volumeMeasured : 0;
  const bVolume = qb.evidence.volumeMeasured > 0 ? qb.evidence.volumeConfirmed / qb.evidence.volumeMeasured : 0;
  if (bVolume !== aVolume) return bVolume - aVolume;
  // Rank the strength of the classified direction. Never erase direction by
  // sorting on absolute return: a fading former leader is not hot because it
  // moved a lot in the opposite direction.
  const ar = (qa.evidence.directionalRelative5 ?? 0) + (qa.evidence.directionalRelative20 ?? 0);
  const br = (qb.evidence.directionalRelative5 ?? 0) + (qb.evidence.directionalRelative20 ?? 0);
  if (br !== ar) return br - ar;
  return String(a.name).localeCompare(String(b.name));
}

export function themeBoardModel(boxes, context = {}) {
  const source = Array.isArray(boxes) ? boxes : [];
  const appearances = new Map();
  for (const box of source) {
    for (const member of [...(box?.structure || []), ...(box?.unknownClass || [])]) {
      const ticker = tickerOf(member);
      if (!ticker) continue;
      appearances.set(ticker, (appearances.get(ticker) || 0) + 1);
    }
  }
  const ranked = source
    .map(box => {
      const sharedMembers = [...new Set([...(box?.structure || []), ...(box?.unknownClass || [])]
        .map(tickerOf)
        .filter(ticker => ticker && (appearances.get(ticker) || 0) > 1))];
      const base = themeQualityProfile(box, { ...context, sharedTickers: new Set(sharedMembers) });
      const quality = sharedMembers.length ? Object.freeze({
        ...base,
        dataHealth: Object.freeze([...base.dataHealth, `SHARED_MEMBER_OVERLAP:${sharedMembers.join(',')}`]),
      }) : base;
      return { ...box, quality };
    })
    .sort(compareQualityBoxes);
  const byState = state => ranked.filter(box => box.quality.state === state);
  return Object.freeze({
    ranked: Object.freeze(ranked),
    inPlay: Object.freeze(byState('in_play')),
    emerging: Object.freeze(byState('emerging')),
    cooling: Object.freeze(byState('cooling')),
    retired: Object.freeze(byState('retired')),
    unavailable: Object.freeze(byState('unavailable')),
    sourceCutoff: context.sourceCutoff || context.marketSession?.latestAt || null,
  });
}

export function moveTone(value) {
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

/** Two or three sentences from the freshest read, clipped for board scanning. */
export function storyLine(read) {
  const text = String(read?.text || '').trim();
  if (!text) return { text: null, at: read?.at || null, source: read?.source || null };
  const story = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .slice(0, THEME_BOARD.storyMaxSentences)
    .join(' ');
  const clipped = story.length > THEME_BOARD.storyMaxChars
    ? `${story.slice(0, THEME_BOARD.storyMaxChars - 1).replace(/\s+\S*$/, '')}…`
    : story;
  return { text: clipped, at: read?.at || null, source: read?.source || null };
}

export function upperBandBreadth(members) {
  const measured = members
    .map(member => finite(member?.row?.bb_position))
    .filter(position => position != null);
  if (!measured.length) return null;
  return { outside: measured.filter(position => position > 100).length, measured: measured.length };
}

/** Cold = flat tape: small 1D and 3D basket moves and no extended member.
 * Unknown moves are cold (unknown never reads as heat). */
export function isColdTheme({ mov1d, mov3d, breadth }) {
  const d1 = finite(mov1d);
  const d3 = finite(mov3d);
  if (d1 == null && d3 == null) return true;
  const hot = breadth?.hot > 0;
  return Math.abs(d1 ?? 0) < THEME_BOARD.coldMove1d && Math.abs(d3 ?? 0) < THEME_BOARD.coldMove3d && !hot;
}

export function themeHeat(mov1d, mov3d) {
  const d1 = finite(mov1d);
  const d3 = finite(mov3d);
  return { primary: d1 == null ? -Infinity : Math.abs(d1), secondary: d3 == null ? -Infinity : Math.abs(d3) };
}

export function compareThemeBoxes(a, b) {
  if (a.cold !== b.cold) return a.cold ? 1 : -1;
  if (b.heat.primary !== a.heat.primary) return b.heat.primary - a.heat.primary;
  if (b.heat.secondary !== a.heat.secondary) return b.heat.secondary - a.heat.secondary;
  return String(a.name).localeCompare(String(b.name));
}

export function compressTreemapWeights(items, { power = THEME_BOARD.treemapPower, maxShare = THEME_BOARD.treemapMaxShare } = {}) {
  const compressed = items.map(item => ({ ...item, weight: Math.pow(Math.max(item.weight, 1), power) }));
  if (compressed.length < 2) return compressed;
  const largest = compressed.reduce((best, item) => item.weight > best.weight ? item : best, compressed[0]);
  const others = compressed.reduce((sum, item) => item === largest ? sum : sum + item.weight, 0);
  const cappedLargest = others > 0 ? Math.min(largest.weight, (maxShare / (1 - maxShare)) * others) : largest.weight;
  return compressed.map(item => item === largest ? { ...item, weight: cappedLargest } : item);
}

export function binaryTreemap(items, x = 0, y = 0, width = 100, height = 100) {
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

function tileSizeClass(tile) {
  const area = tile.width * tile.height;
  if (tile.width < 11 || tile.height < 14 || area < 220) return 'micro';
  if (tile.width < 18 || tile.height < 22 || area < 500) return 'small';
  if (area > 1450 && tile.width > 28 && tile.height > 28) return 'hero';
  return '';
}

/** Cap-weighted tile layout for the ML structure. Unknown caps get a small
 * fixed footprint so they stay visible without pretending to a size. */
export function layoutStructureTiles(members) {
  const knownCaps = members.map(member => finite(member.row?.market_cap)).filter(value => value != null && value > 0);
  const largest = knownCaps.length ? Math.max(...knownCaps) : 1;
  const fallback = Math.max(1, largest * 0.025);
  const rawItems = members
    .map(member => ({ member, weight: finite(member.row?.market_cap) ?? fallback }))
    .sort((a, b) => b.weight - a.weight);
  return binaryTreemap(compressTreemapWeights(rawItems)).map(tile => ({ ...tile, sizeClass: tileSizeClass(tile) }));
}

export function mapHeightFor(count) {
  if (!(count > 0)) return 0;
  return Math.min(THEME_BOARD.mapMaxHeight, Math.max(THEME_BOARD.mapMinHeight, THEME_BOARD.mapHeightBase + THEME_BOARD.mapHeightPerMember * count));
}

/**
 * One theme box. `members` is the joined roster (ticker, row, category,
 * provisional); `vehicles` are today's SC rows carrying the theme tag.
 */
export function buildThemeBox(theme, {
  members = [], vehicles = [], rosters = null, membership = null,
  sourceCoverage = null, comparison = null, read = null,
} = {}) {
  const memberUnion = suppliedMemberUnion({ members, vehicles, rosters });
  const breadth = parseBreadth(theme?.breadth);
  const mov1d = finite(theme?.mov_1d);
  const mov3d = finite(theme?.mov_3d);
  const structure = memberUnion.filter(member => member.category === 'ML');
  const unknownClass = memberUnion.filter(member => member.category == null);
  const vehicleMembers = memberUnion.filter(member => member.category === 'SC');
  vehicleMembers.sort((a, b) => (Math.abs(finite(b.row?.change_pct) ?? -Infinity)) - (Math.abs(finite(a.row?.change_pct) ?? -Infinity)));
  const cold = isColdTheme({ mov1d, mov3d, breadth });
  const upperBand = upperBandBreadth(theme?.sc_cluster === true || !structure.length ? vehicleMembers : structure);
  const normalizedMembership = membershipState(membership, memberUnion.length);
  const normalizedSourceCoverage = receiptCoverageState(sourceCoverage);
  return {
    name: theme.name,
    theme,
    mov1d,
    mov3d,
    breadth,
    upperBand,
    story: storyLine(read),
    cold,
    tapeAvailability: tapeAvailability(mov1d, mov3d),
    heat: themeHeat(mov1d, mov3d),
    tone: moveTone(mov1d),
    members: memberUnion,
    structure,
    unknownClass,
    vehicleMembers,
    vehicles: vehicleMembers.map(member => member.row || ({ ticker: member.ticker })),
    coverage: measurementCoverage(memberUnion),
    membership: normalizedMembership,
    sourceCoverage: normalizedSourceCoverage,
    comparison: comparisonState(comparison),
    singleStock: normalizedMembership.complete && normalizedMembership.expectedTotal === 1 && memberUnion.length === 1,
    tiles: cold ? [] : layoutStructureTiles([...structure, ...unknownClass]),
    mapHeight: cold ? 0 : mapHeightFor(structure.length + unknownClass.length),
  };
}

export function orderThemeBoxes(boxes) {
  return [...boxes].sort(compareThemeBoxes);
}

/** Tickers a box can chart, in the same order as the visible member table. */
export function boxTickers(box) {
  return memberTableMembers(box)
    .map(member => member.ticker);
}

function memberTableMembers(box) {
  return [...(box.structure || []), ...(box.unknownClass || []), ...(box.vehicleMembers || [])];
}

function tileMarkup(tile, helpers) {
  const { member } = tile;
  const row = member.row;
  const move = row?.change_pct;
  const cap = finite(row?.market_cap);
  const band = row ? helpers.bandLabel(row) : '';
  const run = row ? helpers.runLabel(row) : 'D—';
  const roleClass = member.category === 'ML' ? 'structure' : member.category === 'SC' ? 'vehicle' : 'class-unknown';
  const title = [
    member.ticker,
    row ? helpers.fmtPrice(row.price) : null,
    helpers.fmtSigned(move),
    run,
    band || null,
    row ? `8EMA ${helpers.fmtSigned(row.ema8_dist)}` : null,
    cap == null ? 'cap unknown' : helpers.fmtCompact(cap),
    member.provisional ? 'provisional seat' : null,
  ].filter(Boolean).join(' · ');
  return `<button class="heat-tile treemap-tile ${moveTone(move)} ${roleClass}${member.provisional ? ' seat-review' : ''}${cap == null ? ' cap-unknown' : ''}${tile.sizeClass ? ` ${tile.sizeClass}` : ''}" style="left:${tile.x.toFixed(3)}%;top:${tile.y.toFixed(3)}%;width:${tile.width.toFixed(3)}%;height:${tile.height.toFixed(3)}%" type="button" data-ticker="${helpers.esc(member.ticker)}" title="${helpers.esc(title)}"><strong>${helpers.esc(member.ticker)}</strong><span>${helpers.fmtSigned(move)}</span><small class="structure-metrics"><span>${helpers.esc(run)}</span>${band ? `<span class="bb-metric-text">${helpers.esc(band)}</span>` : ''}</small></button>`;
}

function vehicleChip(member, helpers) {
  const row = member.row;
  const move = row?.change_pct;
  const run = row ? helpers.runLabel(row) : 'D—';
  const band = row ? helpers.bandLabel(row) : '';
  const membership = member.taggedOnly ? 'tagged only' : member.membershipSources.join(' + ');
  return `<button class="theme-member-chip vehicle ${moveTone(move)}${member.provisional ? ' seat-review' : ''}" type="button" data-ticker="${helpers.esc(member.ticker)}" title="${helpers.esc([member.ticker, 'SC vehicle', membership, member.provisional ? 'provisional seat' : null, helpers.fmtSigned(move), run, band || null].filter(Boolean).join(' · '))}"><strong>${helpers.esc(member.ticker)}</strong><span class="theme-member-move ${finite(move) == null ? '' : finite(move) > 0 ? 'up' : finite(move) < 0 ? 'down' : ''}">${helpers.fmtSigned(move)}</span><span class="theme-member-run">${helpers.esc(run)}</span>${band ? `<span class="theme-member-band">${helpers.esc(band)}</span>` : ''}</button>`;
}

function coldChip(member, helpers) {
  const move = member.row?.change_pct;
  return `<button class="theme-cold-chip ${moveTone(move)}" type="button" data-ticker="${helpers.esc(member.ticker)}" title="${helpers.esc(`${member.ticker} · ${helpers.fmtSigned(move)} · ${member.row ? helpers.runLabel(member.row) : 'D—'}`)}"><strong>${helpers.esc(member.ticker)}</strong><span>${helpers.fmtSigned(move)}</span></button>`;
}

function boxHeader(box, helpers) {
  const breadth = box.breadth ? `${box.breadth.hot}/${box.breadth.total}` : '—';
  // V2.11.77 (Austin's ruling): the card header shows measurements only. The stage
  // word (IN PLAY / COOLING ...) and the data-health warning badge are no longer
  // rendered here; the quality state and data health remain in Details / Evidence.
  const tapeState = box.tapeAvailability === 'unavailable'
    ? '<span class="theme-tape-state unavailable">MOVEMENT UNAVAILABLE</span>'
    : box.tapeAvailability === 'partial'
      ? '<span class="theme-tape-state partial">MOVEMENT PARTIAL</span>'
      : '';
  return `<header class="theme-box-head">
      <button class="theme-box-title" type="button" data-theme-name="${helpers.esc(box.name)}" title="Open ${helpers.esc(box.name)}">${helpers.esc(box.name)}</button>
      <span class="theme-box-moves"><b class="${moveTone(box.mov1d)}">${helpers.fmtSigned(box.mov1d)}</b><small>1D</small><b class="${moveTone(box.mov3d)}">${helpers.fmtSigned(box.mov3d)}</b><small>3D</small></span>
      <span class="theme-box-breadth" title="ML members extended past 55 or closed outside the band, over members measured">${helpers.esc(breadth)}<small>EXTENDED</small></span>
      ${box.upperBand ? `<span class="theme-box-band-breadth" title="Members with a readable Bollinger position currently outside the upper band">${box.upperBand.outside}/${box.upperBand.measured}<small>OUT OF UBB</small></span>` : ''}
      ${tapeState}
    </header>`;
}

function qualityMarkup(box, helpers) {
  const quality = box.quality;
  if (!quality) return '';
  const state = quality.state.replaceAll('_', ' ').toUpperCase();
  const direction = quality.direction ? ` · ${quality.direction.toUpperCase()}` : '';
  const evidence = quality.evidence;
  const trend = [
    evidence.direction5d ? `5D: ${Math.max(evidence.positive5d || 0, evidence.negative5d || 0)}/${evidence.total} ${evidence.direction5d}` : `5D: ${evidence.measured5}/${evidence.total} measured`,
    evidence.direction20d ? `20D: ${Math.max(evidence.positive20d || 0, evidence.negative20d || 0)}/${evidence.total} ${evidence.direction20d}` : `20D: ${evidence.measured20}/${evidence.total} measured`,
  ].join(' · ');
  const activity = `RVOL: ${evidence.volumeConfirmed}/${evidence.activityEligible} high · ${evidence.volumeMeasured}/${evidence.activityEligible} measured`;
  const changed = quality.whatChanged === 'baseline unavailable' ? '' : ` · ${quality.whatChanged}`;
  const health = quality.dataHealth.length
    ? quality.dataHealth.map(item => item.replaceAll('_', ' ').replace(':', ': ')).join(' · ')
    : 'Complete';
  return `<div class="theme-quality-receipt ${helpers.esc(quality.state)}" aria-label="Theme activity evidence">
      <strong>${helpers.esc(`${state}${direction}`)}</strong>
      <span><b>Trend</b>${helpers.esc(trend)}</span>
      <span><b>Activity</b>${helpers.esc(activity)}</span>
      <time><b>Sessions</b>${helpers.esc(`Current ${evidence.currentSession || 'unknown'} · history through ${evidence.historySession || 'unknown'}${changed}`)}</time>
      <small><b>History basis</b>${helpers.esc(evidence.exactHistoryMeasured === evidence.measured5 ? 'Dated sessions' : 'Ordered observations; session dates partial')}</small>
      <small><b>Collected</b>${helpers.esc(quality.sourceCutoff || 'Unknown')}</small>
      <small><b>Data notes</b>${helpers.esc(health)}</small>
    </div>`;
}

function contextMarkup(box, helpers) {
  if (!box.story.text && !box.story.at && !box.story.source) return '';
  const date = box.story.at ? helpers.relativeTime(box.story.at) : 'Date unavailable';
  return `<section class="theme-card-context"><strong>Context</strong>
    ${box.story.text ? `<p>${helpers.esc(box.story.text)}</p>` : '<p>Context unavailable.</p>'}
    <time${box.story.at ? ` datetime="${helpers.esc(box.story.at)}"` : ''}>${helpers.esc(`${date}${box.story.source ? ` · ${box.story.source}` : ''}`)}</time>
  </section>`;
}

function evidenceDetails(box, helpers) {
  return `<details class="theme-card-evidence">
    <summary>DETAILS / EVIDENCE</summary>
    <div>${contextMarkup(box, helpers)}${qualityMarkup(box, helpers)}${comparisonMarkup(box, helpers)}${coverageMarkup(box, helpers)}</div>
  </details>`;
}

function comparisonMarkup(box, helpers) {
  const comparison = box.comparison;
  const dates = [comparison.startAt, comparison.endAt].filter(Boolean).map(value => helpers.esc(value)).join(' → ');
  if (!comparison.available) {
    return `<section class="theme-row-change unavailable" aria-label="Comparison unavailable"><strong>COMPARISON UNAVAILABLE</strong><span>${helpers.esc(comparison.reason)}</span>${dates ? `<time>${dates}</time>` : ''}</section>`;
  }
  return `<section class="theme-row-change available" aria-label="Dated supplied comparison"><strong>SUPPLIED CHANGE</strong><span>${helpers.esc(comparison.summary)}</span><time>${dates} · ${helpers.esc(comparison.basis)}</time></section>`;
}

function coverageMarkup(box, helpers) {
  const c = box.coverage;
  const loaded = `${c.total} loaded member${c.total === 1 ? '' : 's'}`;
  const membership = box.singleStock
    ? `Single-stock story · ${loaded}`
    : box.membership.expectedTotal != null
      ? `${box.membership.status === 'partial' ? 'Partial basket · ' : box.membership.status === 'conflicting' ? 'Membership status conflicting · ' : ''}${loaded} · ${c.total}/${box.membership.expectedTotal} expected`
      : `${box.membership.status === 'partial' ? 'Partial basket · ' : box.membership.status === 'conflicting' ? 'Membership status conflicting · ' : ''}${loaded} · expected total unknown`;
  const receipts = box.sourceCoverage.loaded == null
    ? 'unavailable'
    : box.sourceCoverage.expected == null
      ? `${box.sourceCoverage.loaded} loaded · expected total unknown · ${box.sourceCoverage.status}`
      : `${box.sourceCoverage.loaded}/${box.sourceCoverage.expected} loaded · ${box.sourceCoverage.status}`;
  const measurements = `1D ${c.move1d}/${c.total} · D ${c.daily}/${c.total} · BB ${c.bb}/${c.total} · 8EMA ${c.ema8}/${c.total} · ATR / 5D ${c.atr5d}/${c.total}`;
  return `<div class="theme-row-coverage" aria-label="${helpers.esc(`${membership}. Measurement and source receipt coverage`)}">
    <span><strong>MEMBERSHIP</strong>${helpers.esc(membership)}</span>
    <span><strong>MEASUREMENTS</strong>${helpers.esc(measurements)}</span>
    <span><strong>SOURCE RECEIPTS</strong>${helpers.esc(receipts)}</span>
  </div>`;
}

function memberTable(box, helpers) {
  const members = memberTableMembers(box);
  if (!members.length) return '<p class="theme-row-empty quiet-value">Member measurements unavailable.</p>';
  return `<div class="theme-row-table-wrap" tabindex="0" role="region" aria-label="${helpers.esc(box.name)} member measurements">
    <table class="theme-row-table"><caption class="sr-only">${helpers.esc(box.name)} members and daily measurements</caption>
      <thead><tr><th scope="col" data-sort-key="name">MEMBER</th><th scope="col" data-sort-key="change">1D</th><th scope="col" data-sort-key="d">D</th><th scope="col" data-sort-key="bb">BB</th><th scope="col" class="ema8-key" data-sort-key="ema8">8EMA</th><th scope="col" data-sort-key="atr5d" title="${helpers.esc(ATR5D_TITLE)}">ATR / 5D</th></tr></thead>
      <tbody>${members.map(member => {
        const row = member.row;
        const role = member.category === 'ML' ? 'ML' : member.category === 'SC' ? 'SC VEHICLE' : `CLASS UNKNOWN${member.suppliedCategory ? ` · SUPPLIED ${member.suppliedCategory}` : ''}`;
        const status = [member.taggedOnly ? 'TAGGED ONLY' : null, member.provisional ? 'PROVISIONAL' : null, member.classificationConflict ? 'CLASS CONFLICT' : null].filter(Boolean);
        const band = row ? helpers.bandLabel(row) : '';
        const position = finite(row?.bb_position);
        const bandText = band || (position == null ? '—' : `${position.toFixed(0)}%`);
        const sortValues = {
          name: member.ticker,
          change: numeric(row?.change_pct),
          d: numeric(row?.d_count) == null ? null : Math.max(0, Math.trunc(numeric(row.d_count))),
          bb: bandSortValue(row, { position: true }),
          ema8: numeric(row?.ema8_dist),
          atr5d: atr5dValue(row),
        };
        return `<tr data-sort-values="${helpers.esc(JSON.stringify(sortValues))}"><th scope="row"><button type="button" data-ticker="${helpers.esc(member.ticker)}" title="Select ${helpers.esc(member.ticker)}">${helpers.esc(member.ticker)}</button><small>${helpers.esc(role)}${status.length ? ` · ${helpers.esc(status.join(' · '))}` : ''}</small></th>
          <td class="${moveTone(row?.change_pct)}">${helpers.fmtSigned(row?.change_pct)}</td>
          <td>${helpers.esc(row ? helpers.runLabel(row) : 'D—')}</td>
          <td class="theme-row-band" title="${helpers.esc(band || (position == null ? 'Band measurement unavailable' : 'Bollinger position: 0% lower band, 100% upper band'))}">${helpers.esc(bandText)}</td>
          <td class="ma-cell">${helpers.fmtSigned(row?.ema8_dist)}</td>
          <td class="theme-row-atr" title="${helpers.esc(atr5dTitle(row))}">${formatAtr5d(row)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function hotBox(box, helpers) {
  const displayedTiles = box.singleStock ? layoutStructureTiles(box.members) : box.tiles;
  const mapHeight = box.singleStock ? mapHeightFor(1) : box.mapHeight;
  const tiles = displayedTiles.length
    ? `<div class="theme-box-map" style="height:${mapHeight}px">${displayedTiles.map(tile => tileMarkup(tile, helpers)).join('')}</div>`
    : '<div class="theme-box-map empty"><span class="quiet-value">ML structure unavailable.</span></div>';
  const vehicles = box.vehicleMembers.length
    ? `<div class="theme-box-vehicles"><small>SC VEHICLES · ${box.vehicleMembers.length}</small><div>${box.vehicleMembers.map(member => vehicleChip(member, helpers)).join('')}</div></div>`
    : '<div class="theme-box-vehicles none"><small>NO SC VEHICLE ON THE BOARD</small></div>';
  const mapLabel = box.singleStock ? 'SINGLE-STOCK HEAT' : 'MEMBER HEAT';
  const mapDetail = box.singleStock ? '1D move · one supplied member' : '1D move · sized by capped market cap';
  const qualityClass = box.quality ? ` quality-${box.quality.state}` : '';
  return `<article class="theme-box hot ${box.tone}${qualityClass}" role="group" tabindex="0" data-theme-card="${helpers.esc(box.name)}" aria-label="Open ${helpers.esc(box.name)} theme">
    <div class="theme-row-details">${boxHeader(box, helpers)}${evidenceDetails(box, helpers)}${memberTable(box, helpers)}</div>
    <div class="theme-row-heat"><div class="theme-row-map-label"><span>${mapLabel}</span><small>${mapDetail}</small></div>${tiles}${vehicles}</div>
  </article>`;
}

function coldBox(box, helpers) {
  const members = [...box.structure, ...box.unknownClass];
  const chips = members.length ? members.map(member => coldChip(member, helpers)).join('') : '<span class="quiet-value">Members unavailable.</span>';
  const vehicles = box.vehicleMembers.map(member => coldChip(member, helpers)).join('');
  const qualityClass = box.quality ? ` quality-${box.quality.state}` : '';
  return `<article class="theme-box cold ${box.tone}${qualityClass}" role="button" tabindex="0" data-theme-card="${helpers.esc(box.name)}" aria-label="Open ${helpers.esc(box.name)} theme">
    ${boxHeader(box, helpers)}${evidenceDetails(box, helpers)}
    <div class="theme-cold-chips">${chips}${vehicles ? `<span class="theme-cold-divider" title="SC vehicles on today's board"></span>${vehicles}` : ''}</div>
  </article>`;
}

/**
 * helpers: { esc, fmtSigned, fmtPrice, fmtCompact, runLabel, bandLabel, relativeTime }
 */
export function renderThemeHeatBoard(boxes, helpers, qualityContext = null) {
  if (qualityContext) {
    const model = themeBoardModel(boxes, qualityContext);
    const cards = model.ranked.map(box => box.cold ? coldBox(box, helpers) : hotBox(box, helpers)).join('');
    return cards
      ? `<section class="theme-ranked-board" aria-label="Ranked themes">${cards}</section>`
      : '<div class="empty-state">Theme engine returned no ranked themes.</div>';
  }
  const ordered = orderThemeBoxes(boxes);
  const hot = ordered.filter(box => !box.cold);
  const cold = ordered.filter(box => box.cold);
  const hotMarkup = hot.length
    ? `<div class="theme-heat-board" aria-label="Themes with heat, hottest first">${hot.map(box => hotBox(box, helpers)).join('')}</div>`
    : '<div class="theme-heat-board empty"><div class="empty-state">No measured theme is moving. Flat, partial, and unavailable baskets remain below.</div></div>';
  const flatCount = cold.filter(box => box.tapeAvailability === 'complete').length;
  const partialCount = cold.filter(box => box.tapeAvailability === 'partial').length;
  const unavailableCount = cold.filter(box => box.tapeAvailability === 'unavailable').length;
  const coldMarkup = cold.length
    ? `<div class="theme-cold-shelf" aria-label="Flat and movement-unavailable themes"><div class="theme-cold-shelf-head"><span>FLAT · ${flatCount}</span>${partialCount ? `<span>MOVEMENT PARTIAL · ${partialCount}</span>` : ''}${unavailableCount ? `<span>MOVEMENT UNAVAILABLE · ${unavailableCount}</span>` : ''}</div><div class="theme-cold-grid">${cold.map(box => coldBox(box, helpers)).join('')}</div></div>`
    : '';
  return hotMarkup + coldMarkup;
}
