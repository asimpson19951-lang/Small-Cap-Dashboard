const LANE_STATES = new Set(['fresh', 'stale', 'partial', 'unavailable']);
const MEMBERSHIP_CLASSES = new Set(['tracked_member', 'known_nonmember', 'outside_universe']);
const MEASUREMENT_STATES = new Set(['measured', 'unsampled', 'unavailable']);
const EXPLANATION_STATES = new Set(['explained', 'unexplained', 'pending', 'not_requested', 'unavailable']);
const PRIORITIES = new Set(['standard', 'outlier']);
const ISO_WITH_TIMEZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

function iso(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const match = ISO_WITH_TIMEZONE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number(((match[7]?.slice(1) || '') + '000').slice(0, 3));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (match[8] !== 'Z') {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    offsetMinutes = (offsetHour * 60 + offsetMinute) * (match[9] === '+' ? 1 : -1);
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  const time = date.getTime() - offsetMinutes * 60_000;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function ticker(value) {
  return typeof value === 'string' && /^[A-Z0-9.-]{1,10}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function normalizeMembership(value, cutoffMs) {
  if (!value || !MEMBERSHIP_CLASSES.has(value.classification)) {
    return { error: 'invalid_membership_classification' };
  }
  const evidence = value.evidence;
  const evidenceAsOf = iso(evidence?.asOf);
  if (!evidence || typeof evidence.source !== 'string' || !evidence.source.trim() || !evidenceAsOf) {
    return { error: 'invalid_membership_evidence' };
  }
  if (Date.parse(evidenceAsOf) > cutoffMs) return { future: true };
  return {
    value: {
      classification: value.classification,
      evidence: {
        source: evidence.source,
        kind: typeof evidence.kind === 'string' ? evidence.kind : 'unspecified',
        asOf: evidenceAsOf,
        note: typeof evidence.note === 'string' ? evidence.note : null,
      },
    },
  };
}

function normalizeMove(record, cutoffMs) {
  if (!MEASUREMENT_STATES.has(record.measurementState)) {
    return { error: 'invalid_measurement_state' };
  }
  if (record.measurementState !== 'measured') {
    if (record.move != null) return { error: 'move_present_for_unmeasured_record' };
    return { value: null };
  }

  const move = record.move;
  const start = iso(move?.window?.start);
  const end = iso(move?.window?.end);
  if (!move || !Number.isFinite(move.percent) || typeof move.window?.label !== 'string' || !start || !end) {
    return { error: 'invalid_measured_move' };
  }
  if (Date.parse(start) > Date.parse(end)) return { error: 'invalid_move_window_order' };
  if (Date.parse(end) > cutoffMs) return { future: true };

  return {
    value: {
      percent: move.percent,
      direction: move.percent > 0 ? 'positive' : move.percent < 0 ? 'negative' : 'flat',
      window: { label: move.window.label, start, end },
    },
  };
}

function normalizeExplanation(value, cutoffMs) {
  if (!value || !EXPLANATION_STATES.has(value.state)) {
    return { error: 'invalid_research_explanation_state' };
  }
  const asOf = value.asOf == null ? null : iso(value.asOf);
  const summary = typeof value.summary === 'string' && value.summary.trim() ? value.summary : null;
  const source = typeof value.source === 'string' && value.source.trim() ? value.source : null;
  if (value.asOf != null && !asOf) return { error: 'invalid_research_explanation_as_of' };
  if (value.state === 'explained' && (!asOf || !summary)) {
    return { error: 'explained_state_requires_dated_summary' };
  }
  if (!asOf && (summary || source)) {
    return {
      value: {
        state: 'not_available_at_cutoff',
        asOf: null,
        summary: null,
        source: null,
      },
      omissionFlag: 'undated_explanation_omitted',
    };
  }
  if (asOf && Date.parse(asOf) > cutoffMs) {
    return {
      value: {
        state: 'not_available_at_cutoff',
        asOf: null,
        summary: null,
        source: null,
      },
      omissionFlag: 'future_explanation_omitted',
    };
  }
  return {
    value: {
      state: value.state,
      asOf,
      summary,
      source,
    },
  };
}

function normalizeRecord(record, lane, index, cutoffMs) {
  const sourceRecordId = typeof record?.sourceRecordId === 'string'
    ? record.sourceRecordId
    : `${lane.id}:${index}`;
  const dispositionBase = { sourceRecordId, lane: lane.id };
  const symbol = ticker(record?.symbol);
  const observationCutoff = iso(record?.observationCutoff);

  if (!symbol || !observationCutoff) {
    return {
      disposition: { ...dispositionBase, symbol: null, status: 'malformed', reason: 'invalid_symbol_or_observation_cutoff' },
    };
  }
  if (Date.parse(observationCutoff) > cutoffMs) {
    return {
      disposition: { ...dispositionBase, symbol: null, status: 'future_excluded', reason: 'record_observation_after_cutoff' },
    };
  }
  if (lane.observationCutoff && Date.parse(observationCutoff) > Date.parse(lane.observationCutoff)) {
    return {
      disposition: { ...dispositionBase, symbol, status: 'malformed', reason: 'record_after_lane_observation_cutoff' },
    };
  }

  const membership = normalizeMembership(record.membership, cutoffMs);
  if (membership.future) {
    return {
      disposition: { ...dispositionBase, symbol: null, status: 'future_excluded', reason: 'membership_evidence_after_cutoff' },
    };
  }
  if (membership.error) {
    return {
      disposition: { ...dispositionBase, symbol, status: 'malformed', reason: membership.error },
    };
  }

  const move = normalizeMove(record, cutoffMs);
  if (move.future) {
    return {
      disposition: { ...dispositionBase, symbol: null, status: 'future_excluded', reason: 'move_window_after_cutoff' },
    };
  }
  if (move.error) {
    return {
      disposition: { ...dispositionBase, symbol, status: 'malformed', reason: move.error },
    };
  }

  const explanation = normalizeExplanation(record.researchExplanation, cutoffMs);
  if (explanation.error) {
    return {
      disposition: { ...dispositionBase, symbol, status: 'malformed', reason: explanation.error },
    };
  }

  const researchPriority = PRIORITIES.has(record.researchPriority) ? record.researchPriority : 'standard';
  const status = lane.state === 'stale' ? 'included_stale'
    : lane.state === 'partial' ? 'included_partial'
      : 'included';
  const row = {
    symbol,
    lane: lane.id,
    laneKind: lane.kind,
    laneState: lane.state,
    laneObservationCutoff: lane.observationCutoff,
    observationCutoff,
    sourceRecordId,
    membership: membership.value,
    measurementState: record.measurementState,
    move: move.value,
    researchPriority,
    researchExplanation: explanation.value,
    disposition: status,
    limitations: Array.isArray(record.limitations) ? [...record.limitations] : [],
    flags: explanation.omissionFlag ? [explanation.omissionFlag] : [],
  };
  return {
    row,
    disposition: { ...dispositionBase, symbol, status, reason: explanation.omissionFlag || null },
  };
}

function candidateDisposition(candidate) {
  if (candidate.membership.classification === 'conflicting') return 'conflicting_membership_evidence';
  if (candidate.measurementState === 'measured') {
    return candidate.membership.classification === 'tracked_member' ? 'tracked_measured' : `${candidate.membership.classification}_measured`;
  }
  if (candidate.membership.classification === 'tracked_member' && candidate.measurementState === 'unsampled') {
    return 'tracked_unsampled';
  }
  return `${candidate.membership.classification}_${candidate.measurementState}`;
}

function mergeCandidates(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  return [...bySymbol.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, origins]) => {
    const classifications = [...new Set(origins.map(row => row.membership.classification))].sort();
    const measurementStates = origins.map(row => row.measurementState);
    const measurementState = measurementStates.includes('measured') ? 'measured'
      : measurementStates.includes('unsampled') ? 'unsampled'
        : 'unavailable';
    const candidate = {
      symbol,
      sourceOrigins: origins.map(row => ({
        lane: row.lane,
        laneKind: row.laneKind,
        laneState: row.laneState,
        observationCutoff: row.observationCutoff,
        sourceRecordId: row.sourceRecordId,
        disposition: row.disposition,
      })),
      membership: {
        classification: classifications.length === 1 ? classifications[0] : 'conflicting',
        classifications,
        evidence: origins.map(row => ({ lane: row.lane, ...row.membership.evidence })),
      },
      measurementState,
      moveObservations: origins.filter(row => row.move).map(row => ({
        lane: row.lane,
        observationCutoff: row.observationCutoff,
        researchPriority: row.researchPriority,
        ...row.move,
      })),
      explanationObservations: origins.map(row => ({ lane: row.lane, ...row.researchExplanation })),
      hasExplicitOutlier: origins.some(row => row.researchPriority === 'outlier'),
      hasUnexplainedOutlier: origins.some(row => row.researchPriority === 'outlier'
        && ['unexplained', 'pending', 'unavailable', 'not_available_at_cutoff'].includes(row.researchExplanation.state)),
      originCount: origins.length,
    };
    return { ...candidate, disposition: candidateDisposition(candidate) };
  });
}

/**
 * Builds a deterministic, read-only coverage packet from already-authorized evidence.
 * Lane freshness and outlier priority are explicit input states; this function does not
 * scan, rank, infer theme membership from price movement, or treat missing data as zero.
 */
export function buildCoveragePacket(input, cutoff) {
  const cutoffIso = iso(cutoff);
  if (!cutoffIso) throw new TypeError('cutoff must be a valid ISO-8601 timestamp');
  if (!input || !Array.isArray(input.lanes)) throw new TypeError('input.lanes must be an array');
  const cutoffMs = Date.parse(cutoffIso);
  const rows = [];
  const recordDispositions = [];
  const lanes = [];
  const laneIds = new Set();

  for (const [laneIndex, laneInput] of input.lanes.entries()) {
    if (!laneInput || typeof laneInput.id !== 'string' || !laneInput.id.trim()) {
      throw new TypeError(`lane ${laneIndex} must have an id`);
    }
    const laneId = laneInput.id.trim();
    if (laneIds.has(laneId)) throw new TypeError(`duplicate lane id: ${laneId}`);
    laneIds.add(laneId);
    if (!LANE_STATES.has(laneInput.state)) throw new TypeError(`lane ${laneId} has an invalid state`);
    const laneObservationCutoff = laneInput.observationCutoff == null ? null : iso(laneInput.observationCutoff);
    if (laneInput.state !== 'unavailable' && !laneObservationCutoff) {
      throw new TypeError(`lane ${laneId} requires observationCutoff`);
    }
    if (laneObservationCutoff && Date.parse(laneObservationCutoff) > cutoffMs) {
      throw new TypeError(`lane ${laneId} observationCutoff is after packet cutoff`);
    }
    const records = Array.isArray(laneInput.records) ? laneInput.records : [];
    if (laneInput.state === 'unavailable' && records.length) {
      throw new TypeError(`unavailable lane ${laneId} cannot contain records`);
    }
    const lane = {
      id: laneId,
      kind: typeof laneInput.kind === 'string' ? laneInput.kind : laneId,
      state: laneInput.state,
      observationCutoff: laneObservationCutoff,
      limitations: Array.isArray(laneInput.limitations) ? [...laneInput.limitations] : [],
    };
    const before = rows.length;
    for (const [recordIndex, record] of records.entries()) {
      const normalized = normalizeRecord(record, lane, recordIndex, cutoffMs);
      recordDispositions.push(normalized.disposition);
      if (normalized.row) rows.push(normalized.row);
    }
    lanes.push({ ...lane, submittedRecords: records.length, includedRecords: rows.length - before });
  }

  const candidates = mergeCandidates(rows);
  const laneStates = Object.fromEntries([...LANE_STATES].map(state => [state, lanes.filter(lane => lane.state === state).length]));
  const classifications = ['tracked_member', 'known_nonmember', 'outside_universe', 'conflicting'];
  const measurementStates = ['measured', 'unsampled', 'unavailable'];
  const tracked = candidates.filter(candidate => candidate.membership.classification === 'tracked_member');
  const trackedMeasured = tracked.filter(candidate => candidate.measurementState === 'measured').length;
  const included = recordDispositions.filter(item => item.status.startsWith('included')).length;
  const malformed = recordDispositions.filter(item => item.status === 'malformed').length;
  const futureExcluded = recordDispositions.filter(item => item.status === 'future_excluded').length;

  const packet = {
    schemaVersion: 1,
    packetId: typeof input.packetId === 'string' ? input.packetId : null,
    asOfCutoff: cutoffIso,
    rows,
    candidates,
    recordDispositions,
    laneCoverage: {
      denominator: lanes.length,
      byState: laneStates,
      lanes,
    },
    denominators: {
      sourceRecords: {
        submitted: recordDispositions.length,
        included,
        malformed,
        futureExcluded,
        reconciles: recordDispositions.length === included + malformed + futureExcluded,
      },
      uniqueCandidates: {
        denominator: candidates.length,
        byMembershipClassification: Object.fromEntries(classifications.map(value => [
          value,
          candidates.filter(candidate => candidate.membership.classification === value).length,
        ])),
        byMeasurementState: Object.fromEntries(measurementStates.map(value => [
          value,
          candidates.filter(candidate => candidate.measurementState === value).length,
        ])),
      },
      trackedMembersInObservedCandidateUnion: {
        denominator: tracked.length,
        measured: trackedMeasured,
        unmeasured: tracked.length - trackedMeasured,
        measuredRate: percentage(trackedMeasured, tracked.length),
      },
    },
    limitations: [
      'The candidate union is the largest valid denominator; it is not whole-market coverage.',
      'Lane state, membership evidence, and outlier priority come from inputs and are not inferred from shared movement.',
      'Missing, unsampled, stale, partial, malformed, future, and unavailable evidence remains explicit and is never converted to zero or quiet.',
    ],
  };
  return deepFreeze(packet);
}
