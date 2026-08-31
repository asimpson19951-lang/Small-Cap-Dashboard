function ticker(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized) ? normalized : null;
}

function timestamp(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return { value, parsed };
  }
  return null;
}

function memberRows(rows, tickers, fields, requiredTextField = null) {
  if (!Array.isArray(rows)) return null;
  return rows
    .map(row => ({ row, memberTicker: ticker(row?.ticker), stamp: timestamp(row, fields) }))
    .filter(item => item.memberTicker && tickers.has(item.memberTicker) && item.stamp
      && (!requiredTextField || String(item.row?.[requiredTextField] || '').trim()))
    .sort((a, b) => b.stamp.parsed - a.stamp.parsed);
}

function dedupe(items, keyFor) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFor(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeWithMemberTickers(items, keyFor, tracked) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = keyFor(item);
    if (!key) continue;
    const group = groups.get(key) || { item, memberTickers: new Set() };
    const memberTicker = ticker(item?.memberTicker);
    if (memberTicker) group.memberTickers.add(memberTicker);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    ...group.item,
    memberTickers: tracked.filter(memberTicker => group.memberTickers.has(memberTicker)),
  }));
}

function catalystMemberTickers(entry, allowed = null) {
  const supplied = Array.isArray(entry?.memberTickers) && entry.memberTickers.length
    ? entry.memberTickers
    : [entry?.memberTicker];
  const seen = new Set();
  const normalized = [];
  for (const value of supplied) {
    const memberTicker = ticker(value);
    if (!memberTicker || seen.has(memberTicker) || (allowed && !allowed.has(memberTicker))) continue;
    seen.add(memberTicker);
    normalized.push(memberTicker);
  }
  return normalized;
}

function filingIdentity(item) {
  const accession = String(item?.row?.accession_number || '').replace(/\D/g, '');
  if (accession) return `accession:${accession}`;
  const url = String(item?.row?.edgar_url || '').trim().toLowerCase();
  return url ? `url:${url}` : `${item?.row?.filing_type || ''}|${item?.stamp?.parsed}`;
}

function calendarEarnings(tickers, calendar) {
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  return events
    .map(event => ({ event, memberTicker: ticker(event?.ticker), stamp: timestamp(event, ['starts_at']) }))
    .filter(item => item.stamp && String(item.event?.kind || '').toUpperCase() === 'EARNINGS'
      && item.memberTicker && tickers.has(item.memberTicker));
}

const EASTERN_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function easternDate(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(EASTERN_DATE_FORMATTER.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

function themeTapeDates(themeTape) {
  const dates = new Map();
  for (const row of Array.isArray(themeTape) ? themeTape : []) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(row?.d || '')) ? String(row.d) : null;
    if (!date) continue;
    const move = row?.chg ?? row?.m;
    const parsedMove = move == null || move === '' || !Number.isFinite(Number(move)) ? null : Number(move);
    const current = dates.get(date) || { hasDate: true, moves: new Set() };
    if (parsedMove != null) current.moves.add(parsedMove);
    dates.set(date, current);
  }
  return dates;
}

export function buildThemeCatalystSessions({ entries, themeTape }) {
  const tapeDates = themeTapeDates(themeTape);
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const atMs = Number.isFinite(entry?.atMs) ? entry.atMs : Date.parse(entry?.at || '');
    const date = easternDate(atMs);
    const key = date || 'DATE_UNKNOWN';
    const group = groups.get(key) || { date, entries: [], members: new Set(), sourceClasses: new Set() };
    group.entries.push(entry);
    for (const memberTicker of catalystMemberTickers(entry)) group.members.add(memberTicker);
    group.sourceClasses.add(String(entry?.sourceClass || 'unknown').toLowerCase());
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const tapeDate = group.date ? tapeDates.get(group.date) : null;
    const moves = tapeDate ? [...tapeDate.moves] : [];
    const matchState = !group.date
      ? 'date_unknown'
      : !tapeDate
        ? 'unmatched'
        : moves.length === 0
          ? 'move_unknown'
          : moves.length === 1 ? 'matched' : 'contested';
    return {
      date: group.date,
      entries: group.entries.sort((a, b) => (b?.atMs ?? Date.parse(b?.at || '')) - (a?.atMs ?? Date.parse(a?.at || ''))),
      receiptCount: group.entries.length,
      memberTickers: [...group.members].sort(),
      memberCount: group.members.size,
      sourceClasses: [...group.sourceClasses].sort(),
      sourceCount: group.sourceClasses.size,
      themeMove: matchState === 'matched' ? moves[0] : null,
      matchState,
    };
  }).sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date !== b.date) return a.date ? -1 : 1;
    return 0;
  });
}

export function buildThemeCatalystSessionChronology(sessions) {
  const groups = Array.isArray(sessions) ? sessions : [];
  const stateCounts = {
    matched: 0,
    unmatched: 0,
    move_unknown: 0,
    contested: 0,
    date_unknown: 0,
    unknown: 0,
  };
  const dated = [];
  for (const session of groups) {
    const state = Object.hasOwn(stateCounts, session?.matchState) ? session.matchState : 'unknown';
    stateCounts[state] += 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(session?.date || ''))) dated.push(String(session.date));
  }
  dated.sort();
  return {
    totalGroupCount: groups.length,
    datedGroupCount: dated.length,
    exactMatchCount: stateCounts.matched,
    unmatchedCount: stateCounts.unmatched,
    moveUnknownCount: stateCounts.move_unknown,
    contestedCount: stateCounts.contested,
    dateUnknownCount: stateCounts.date_unknown,
    unknownMatchCount: stateCounts.unknown,
    newestDate: dated.length ? dated[dated.length - 1] : null,
    oldestDate: dated.length ? dated[0] : null,
  };
}

const CATALYST_SOURCE_CLASSES = ['news', 'filing', 'earnings'];

function scheduledSession(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'BMO' ? 'bmo' : normalized === 'AMC' ? 'amc' : 'unknown';
}

function compactSourceState(supplied = {}) {
  const freshness = ['fresh', 'stale', 'loading', 'unavailable'].includes(supplied.freshness)
    ? supplied.freshness
    : 'unavailable';
  const scope = ['complete', 'partial'].includes(supplied.scope) ? supplied.scope : 'unknown';
  const readable = supplied.readable === true;
  const state = !readable
    ? freshness === 'loading' ? 'loading' : 'unavailable'
    : freshness === 'loading'
      ? 'loading'
      : scope === 'partial'
        ? 'partial'
        : freshness === 'stale' ? 'stale' : 'fresh';
  return { state, freshness, scope, readable, detail: supplied.detail || null };
}

function catalystEntryDirection(entry, nowMs) {
  const sourceClass = String(entry?.sourceClass || '').toLowerCase();
  const atMs = Number.isFinite(entry?.atMs) ? entry.atMs : Date.parse(entry?.at || '');
  if (!Number.isFinite(atMs)) return 'unassigned';
  if (atMs <= nowMs) return 'observed';
  return sourceClass === 'earnings' ? 'upcoming' : 'unassigned';
}

export function buildThemeCatalystCompactCoverage({ members, entries, sourceStates, nowMs = Date.now() }) {
  const tracked = [];
  const seen = new Set();
  for (const member of Array.isArray(members) ? members : []) {
    const memberTicker = ticker(member?.ticker ?? member);
    if (!memberTicker || seen.has(memberTicker)) continue;
    seen.add(memberTicker);
    tracked.push(memberTicker);
  }
  const sources = Object.fromEntries(CATALYST_SOURCE_CLASSES.map(sourceClass => [sourceClass, {
    ...compactSourceState(sourceStates?.[sourceClass]),
    receiptCount: 0,
    observedMemberCount: 0,
    observedReceiptCount: 0,
    upcomingMemberCount: 0,
    upcomingReceiptCount: 0,
    supportsUpcoming: sourceClass === 'earnings',
  }]));
  const directionMembers = { observed: new Set(), upcoming: new Set() };
  const directionSources = { observed: new Set(), upcoming: new Set() };
  const directionReceipts = { observed: 0, upcoming: 0 };
  const directionDatedReceipts = { observed: 0, upcoming: 0 };
  const directionDates = { observed: new Set(), upcoming: new Set() };
  const directionDateMembers = { observed: new Map(), upcoming: new Map() };
  const upcomingDateMemberSessions = new Map();
  const directionMemberReceipts = {
    observed: new Map(tracked.map(memberTicker => [memberTicker, 0])),
    upcoming: new Map(tracked.map(memberTicker => [memberTicker, 0])),
  };
  const directionMemberSources = {
    observed: new Map(tracked.map(memberTicker => [memberTicker, new Set()])),
    upcoming: new Map(tracked.map(memberTicker => [memberTicker, new Set()])),
  };
  const directionSourceReceipts = {
    observed: new Map(CATALYST_SOURCE_CLASSES.map(sourceClass => [sourceClass, 0])),
    upcoming: new Map(CATALYST_SOURCE_CLASSES.map(sourceClass => [sourceClass, 0])),
  };
  const sourceMembers = Object.fromEntries(CATALYST_SOURCE_CLASSES.map(sourceClass => [sourceClass, {
    observed: new Set(),
    upcoming: new Set(),
  }]));
  let newestObservedMs = null;
  let newestObservedAt = null;
  let nearestUpcomingMs = null;
  let nearestUpcomingAt = null;
  let unassignedReceiptCount = 0;
  const unassignedMembers = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const memberTickers = catalystMemberTickers(entry, seen);
    const sourceClass = String(entry?.sourceClass || '').toLowerCase();
    const source = sources[sourceClass];
    if (!memberTickers.length || !source?.readable) continue;
    const atMs = Number.isFinite(entry?.atMs) ? entry.atMs : Date.parse(entry?.at || '');
    const direction = catalystEntryDirection(entry, nowMs);
    if (direction === 'unassigned') {
      unassignedReceiptCount += 1;
      for (const memberTicker of memberTickers) unassignedMembers.add(memberTicker);
      continue;
    }
    source.receiptCount += 1;
    source[`${direction}ReceiptCount`] += 1;
    for (const memberTicker of memberTickers) {
      sourceMembers[sourceClass][direction].add(memberTicker);
      directionMembers[direction].add(memberTicker);
    }
    directionSources[direction].add(sourceClass);
    directionReceipts[direction] += 1;
    const receiptDate = easternDate(atMs);
    if (receiptDate) {
      directionDatedReceipts[direction] += 1;
      directionDates[direction].add(receiptDate);
      const dateMembers = directionDateMembers[direction].get(receiptDate) || new Set();
      for (const memberTicker of memberTickers) dateMembers.add(memberTicker);
      directionDateMembers[direction].set(receiptDate, dateMembers);
      if (direction === 'upcoming') {
        const dateSessions = upcomingDateMemberSessions.get(receiptDate) || new Map();
        for (const memberTicker of memberTickers) {
          const memberSessions = dateSessions.get(memberTicker) || new Set();
          memberSessions.add(scheduledSession(entry?.row?.session));
          dateSessions.set(memberTicker, memberSessions);
        }
        upcomingDateMemberSessions.set(receiptDate, dateSessions);
      }
    }
    for (const memberTicker of memberTickers) {
      directionMemberReceipts[direction].set(memberTicker, directionMemberReceipts[direction].get(memberTicker) + 1);
      directionMemberSources[direction].get(memberTicker).add(sourceClass);
    }
    directionSourceReceipts[direction].set(sourceClass, directionSourceReceipts[direction].get(sourceClass) + 1);
    if (direction === 'observed' && (newestObservedMs == null || atMs > newestObservedMs)) {
      newestObservedMs = atMs;
      newestObservedAt = entry?.at || new Date(atMs).toISOString();
    }
    if (direction === 'upcoming' && (nearestUpcomingMs == null || atMs < nearestUpcomingMs)) {
      nearestUpcomingMs = atMs;
      nearestUpcomingAt = entry?.at || new Date(atMs).toISOString();
    }
  }
  for (const sourceClass of CATALYST_SOURCE_CLASSES) {
    const source = sources[sourceClass];
    if (!source.readable) {
      source.receiptCount = null;
      source.observedMemberCount = null;
      source.observedReceiptCount = null;
      source.upcomingMemberCount = null;
      source.upcomingReceiptCount = null;
    } else {
      source.observedMemberCount = sourceMembers[sourceClass].observed.size;
      source.upcomingMemberCount = source.supportsUpcoming ? sourceMembers[sourceClass].upcoming.size : null;
    }
  }
  const summarizeDirection = (direction, relevantSources) => {
    const readableSources = relevantSources.filter(sourceClass => sources[sourceClass].readable);
    const breadthKnown = readableSources.length > 0;
    const coverageState = !breadthKnown
      ? relevantSources.some(sourceClass => sources[sourceClass].state === 'loading')
        ? 'loading'
        : relevantSources.every(sourceClass => sources[sourceClass].state === 'unavailable')
          ? 'unavailable'
          : 'unknown'
      : readableSources.length < relevantSources.length || readableSources.some(sourceClass => sources[sourceClass].scope === 'partial')
        ? 'partial'
        : readableSources.some(sourceClass => sources[sourceClass].freshness === 'stale')
          ? 'stale'
          : readableSources.every(sourceClass => sources[sourceClass].freshness === 'fresh') ? 'fresh' : 'unknown';
    const memberTickers = breadthKnown ? tracked.filter(memberTicker => directionMembers[direction].has(memberTicker)) : [];
    const noReceiptTickers = breadthKnown ? tracked.filter(memberTicker => !directionMembers[direction].has(memberTicker)) : [];
    const timing = direction === 'observed'
      ? { newestAt: newestObservedAt, newestMs: newestObservedMs }
      : { nearestAt: nearestUpcomingAt, nearestMs: nearestUpcomingMs };
    const receiptCount = breadthKnown ? directionReceipts[direction] : null;
    const memberPeak = receiptCount > 0 ? Math.max(...directionMemberReceipts[direction].values()) : 0;
    const sourcePeak = receiptCount > 0
      ? Math.max(...relevantSources.map(sourceClass => directionSourceReceipts[direction].get(sourceClass)))
      : 0;
    const memberLeaders = memberPeak > 0
      ? tracked.filter(memberTicker => directionMemberReceipts[direction].get(memberTicker) === memberPeak)
      : [];
    const sourceLeaders = sourcePeak > 0
      ? relevantSources.filter(sourceClass => directionSourceReceipts[direction].get(sourceClass) === sourcePeak)
      : [];
    const memberSourceCounts = breadthKnown
      ? tracked.map(memberTicker => [...directionMemberSources[direction].get(memberTicker)]
        .filter(sourceClass => readableSources.includes(sourceClass)).length)
      : [];
    const sortedDates = [...directionDates[direction]].sort();
    const frontDate = sortedDates.length
      ? direction === 'observed' ? sortedDates[sortedDates.length - 1] : sortedDates[0]
      : null;
    const frontMembers = frontDate ? directionDateMembers[direction].get(frontDate) : null;
    const sessionFront = direction === 'upcoming' ? (() => {
      const empty = {
        coverageState,
        valueState: !breadthKnown ? 'unknown' : receiptCount === 0 ? 'zero' : 'unknown',
        bmoMemberCount: !breadthKnown ? null : 0,
        amcMemberCount: !breadthKnown ? null : 0,
        unknownMemberCount: !breadthKnown ? null : 0,
        contestedMemberCount: !breadthKnown ? null : 0,
        memberDenominator: !breadthKnown ? null : frontMembers?.size ?? 0,
      };
      if (!breadthKnown || receiptCount === 0 || !frontDate || !frontMembers) return empty;
      const counts = { bmo: 0, amc: 0, unknown: 0, contested: 0 };
      const dateSessions = upcomingDateMemberSessions.get(frontDate) || new Map();
      for (const memberTicker of frontMembers) {
        const sessions = dateSessions.get(memberTicker) || new Set(['unknown']);
        if (sessions.size !== 1) counts.contested += 1;
        else counts[[...sessions][0]] += 1;
      }
      const valueState = counts.contested
        ? 'contested'
        : counts.unknown === frontMembers.size
          ? 'unknown'
          : counts.unknown ? 'partial' : 'measured';
      return {
        coverageState,
        valueState,
        bmoMemberCount: counts.bmo,
        amcMemberCount: counts.amc,
        unknownMemberCount: counts.unknown,
        contestedMemberCount: counts.contested,
        memberDenominator: frontMembers.size,
      };
    })() : null;
    return {
      memberCount: breadthKnown ? memberTickers.length : null,
      noReceiptMemberCount: breadthKnown ? noReceiptTickers.length : null,
      memberTickers,
      noReceiptTickers,
      receiptCount,
      sourceTypeCount: relevantSources.length,
      sourceTypeWithReceiptsCount: breadthKnown
        ? readableSources.filter(sourceClass => directionSources[direction].has(sourceClass)).length
        : null,
      readableSourceCount: readableSources.length,
      density: {
        coverageState,
        valueState: breadthKnown ? receiptCount === 0 ? 'zero' : 'measured' : 'unknown',
        receiptCount,
        memberDenominator: tracked.length,
        datedReceiptCount: direction === 'observed' && breadthKnown ? directionDatedReceipts[direction] : null,
        datedGroupDenominator: direction === 'observed' && breadthKnown ? directionDates[direction].size : null,
      },
      overlap: {
        coverageState,
        zeroSourceMemberCount: breadthKnown ? memberSourceCounts.filter(count => count === 0).length : null,
        singleSourceMemberCount: breadthKnown ? memberSourceCounts.filter(count => count === 1).length : null,
        multipleSourceMemberCount: breadthKnown ? memberSourceCounts.filter(count => count >= 2).length : null,
        memberDenominator: tracked.length,
      },
      dateFront: {
        coverageState,
        valueState: !breadthKnown ? 'unknown' : receiptCount === 0 ? 'zero' : frontDate ? 'measured' : 'unknown',
        date: frontDate,
        frontMemberCount: !breadthKnown ? null : receiptCount === 0 ? 0 : frontMembers?.size ?? null,
        memberDenominator: breadthKnown ? memberTickers.length : null,
      },
      sessionFront,
      concentration: breadthKnown ? {
        memberState: receiptCount === 0 ? 'none' : memberTickers.length === 1 ? 'single' : 'multi',
        sourceState: receiptCount === 0 ? 'none' : directionSources[direction].size === 1 ? 'single' : 'multi',
        memberLeaders,
        memberPeakReceiptCount: memberPeak,
        sourceLeaders,
        sourcePeakReceiptCount: sourcePeak,
      } : null,
      ...timing,
    };
  };
  return {
    trackedCount: tracked.length,
    observed: summarizeDirection('observed', CATALYST_SOURCE_CLASSES),
    upcoming: summarizeDirection('upcoming', ['earnings']),
    unassignedReceiptCount,
    unassignedMemberCount: unassignedMembers.size,
    sources,
  };
}

export function buildThemeCatalystMemberCoverage({ members, entries, sourceStates, nowMs = Date.now() }) {
  const tracked = [];
  const seen = new Set();
  for (const member of Array.isArray(members) ? members : []) {
    const memberTicker = ticker(member?.ticker ?? member);
    if (!memberTicker || seen.has(memberTicker)) continue;
    seen.add(memberTicker);
    tracked.push(memberTicker);
  }
  const sources = Object.fromEntries(CATALYST_SOURCE_CLASSES.map(sourceClass => {
    const supplied = sourceStates?.[sourceClass];
    const state = ['complete', 'partial', 'loading', 'unavailable'].includes(supplied?.state) ? supplied.state : 'unavailable';
    return [sourceClass, { state, detail: supplied?.detail || null }];
  }));
  const emptySourceCounts = () => Object.fromEntries(CATALYST_SOURCE_CLASSES.map(sourceClass => [sourceClass, {
    observed: 0,
    scheduled: 0,
    unassigned: 0,
  }]));
  const counts = new Map(tracked.map(memberTicker => [memberTicker, emptySourceCounts()]));
  for (const entry of Array.isArray(entries) ? entries : []) {
    const memberTicker = ticker(entry?.memberTicker);
    const sourceClass = String(entry?.sourceClass || '').toLowerCase();
    if (!counts.has(memberTicker) || !CATALYST_SOURCE_CLASSES.includes(sourceClass) || sources[sourceClass].state === 'unavailable') continue;
    const direction = catalystEntryDirection(entry, nowMs);
    const bucket = direction === 'upcoming' ? 'scheduled' : direction;
    counts.get(memberTicker)[sourceClass][bucket] += 1;
  }
  const rows = tracked.map(memberTicker => {
    const sourceCounts = counts.get(memberTicker);
    const totalFor = direction => CATALYST_SOURCE_CLASSES.reduce((sum, sourceClass) => sum + sourceCounts[sourceClass][direction], 0);
    const observedTotal = totalFor('observed');
    const scheduledTotal = totalFor('scheduled');
    const unassignedTotal = totalFor('unassigned');
    return {
      memberTicker,
      sourceCounts,
      observedTotal,
      scheduledTotal,
      unassignedTotal,
      hasObserved: observedTotal > 0,
      hasScheduled: scheduledTotal > 0,
      hasUnassigned: unassignedTotal > 0,
    };
  });
  const readableSourceCount = CATALYST_SOURCE_CLASSES.filter(sourceClass => sources[sourceClass].state !== 'unavailable').length;
  const coverageKnown = readableSourceCount > 0;
  return {
    members: rows,
    trackedCount: rows.length,
    coverageKnown,
    readableSourceCount,
    observedCount: coverageKnown ? rows.filter(row => row.hasObserved).length : null,
    scheduledCount: coverageKnown ? rows.filter(row => row.hasScheduled).length : null,
    unassignedCount: coverageKnown ? rows.filter(row => row.hasUnassigned).length : null,
    unobservedCount: coverageKnown ? rows.filter(row => !row.hasObserved).length : null,
    observedTickers: coverageKnown ? rows.filter(row => row.hasObserved).map(row => row.memberTicker) : [],
    scheduledTickers: coverageKnown ? rows.filter(row => row.hasScheduled).map(row => row.memberTicker) : [],
    unassignedTickers: coverageKnown ? rows.filter(row => row.hasUnassigned).map(row => row.memberTicker) : [],
    unobservedTickers: coverageKnown ? rows.filter(row => !row.hasObserved).map(row => row.memberTicker) : [],
    sources,
  };
}

export function buildThemeCatalystTape({ themeName, members, newsRows, filingRows, calendar, generatedAt, nowMs = Date.now() }) {
  const tracked = [...new Set((Array.isArray(members) ? members : []).map(member => ticker(member?.ticker ?? member)).filter(Boolean))];
  const tickers = new Set(tracked);
  const newsMatches = memberRows(newsRows, tickers, ['published_at'], 'headline') || [];
  const filingMatches = memberRows(filingRows, tickers, ['detected_at', 'filed_at']) || [];
  const newsItems = dedupeWithMemberTickers(newsMatches, item => String(item.row.headline).trim().toLowerCase(), tracked);
  const memberNewsItems = dedupe(newsMatches, item => `${item.memberTicker}|${String(item.row.headline).trim().toLowerCase()}`);
  const filingItems = dedupeWithMemberTickers(filingMatches, filingIdentity, tracked);
  const memberFilingItems = dedupe(filingMatches, item => `${item.memberTicker}|${filingIdentity(item)}`);
  const earningsItems = dedupeWithMemberTickers(calendarEarnings(tickers, calendar), item => `${item.memberTicker || ''}|${item.stamp.parsed}|${String(item.event?.title || '').trim().toLowerCase()}`, tracked);
  const upcomingEarnings = earningsItems.filter(item => item.stamp.parsed > nowMs).sort((a, b) => a.stamp.parsed - b.stamp.parsed);
  const priorEarnings = earningsItems.filter(item => item.stamp.parsed <= nowMs).sort((a, b) => b.stamp.parsed - a.stamp.parsed);
  const news = newsItems[0] || null;
  const filing = filingItems[0] || null;
  const earnings = upcomingEarnings[0]
    ? { ...upcomingEarnings[0], mode: 'upcoming' }
    : priorEarnings[0] ? { ...priorEarnings[0], mode: 'prior' } : null;
  const toNewsEntry = item => ({
      sourceClass: 'news',
      kind: 'NEWS',
      memberTicker: item.memberTicker,
      memberTickers: item.memberTickers || [item.memberTicker],
      at: item.stamp.value,
      atMs: item.stamp.parsed,
      title: item.row.headline,
      source: item.row.source || null,
      sourceUrl: item.row.url || item.row.source_url || null,
      row: item.row,
    });
  const toFilingEntry = item => ({
      sourceClass: 'filing',
      kind: item.row.filing_type || 'SEC FILING',
      memberTicker: item.memberTicker,
      memberTickers: item.memberTickers || [item.memberTicker],
      at: item.stamp.value,
      atMs: item.stamp.parsed,
      title: item.row.summary || item.row.lifecycle_state || 'Filing receipt',
      source: item.row.source || 'SEC',
      sourceUrl: item.row.edgar_url || item.row.source_url || null,
      row: item.row,
    });
  const toEarningsEntry = item => ({
      sourceClass: 'earnings',
      kind: 'EARNINGS',
      memberTicker: item.memberTicker || ticker(item.event?.ticker),
      memberTickers: item.memberTickers || [item.memberTicker || ticker(item.event?.ticker)].filter(Boolean),
      at: item.stamp.value,
      atMs: item.stamp.parsed,
      title: item.event.title || `${item.memberTicker || 'Member'} earnings`,
      source: item.event.source || null,
      sourceUrl: item.event.source_url || null,
      row: item.event,
    });
  const entries = [
    ...newsItems.map(toNewsEntry),
    ...filingItems.map(toFilingEntry),
    ...earningsItems.map(toEarningsEntry),
  ];
  const memberCoverageEntries = [
    ...memberNewsItems.map(toNewsEntry),
    ...memberFilingItems.map(toFilingEntry),
    ...earningsItems.map(toEarningsEntry),
  ];
  const upcoming = entries.filter(entry => catalystEntryDirection(entry, nowMs) === 'upcoming')
    .sort((a, b) => a.atMs - b.atMs || String(a.memberTicker).localeCompare(String(b.memberTicker)));
  const observed = entries.filter(entry => catalystEntryDirection(entry, nowMs) === 'observed')
    .sort((a, b) => b.atMs - a.atMs || String(a.memberTicker).localeCompare(String(b.memberTicker)));
  const unassigned = entries.filter(entry => catalystEntryDirection(entry, nowMs) === 'unassigned')
    .sort((a, b) => a.atMs - b.atMs || String(a.memberTicker).localeCompare(String(b.memberTicker)));
  return {
    news,
    filing,
    earnings,
    entries: [...upcoming, ...observed, ...unassigned],
    memberCoverageEntries,
    upcoming,
    observed,
    unassigned,
    coverage: {
      newsReadable: Array.isArray(newsRows),
      newsWindowHours: 48,
      newsLimit: 240,
      newsLoaded: Array.isArray(newsRows) ? newsRows.length : null,
      newsMatched: Array.isArray(newsRows) ? newsItems.length : null,
      filingsReadable: Array.isArray(filingRows),
      filingsLimit: 240,
      filingsLoaded: Array.isArray(filingRows) ? filingRows.length : null,
      filingsMatched: Array.isArray(filingRows) ? filingItems.length : null,
      calendarReadable: Array.isArray(calendar?.events),
      calendarGeneratedAt: generatedAt || null,
      calendarLoaded: Array.isArray(calendar?.events) ? calendar.events.length : null,
      calendarMatched: Array.isArray(calendar?.events) ? earningsItems.length : null,
    },
  };
}
