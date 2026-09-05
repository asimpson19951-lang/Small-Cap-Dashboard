const REVIEWED = new Set(["accepted", "reviewed"]);

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeDate(value, fallback = null) {
  const match = typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return fallback;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : fallback;
}

export function clampDate(value, start, end) {
  const safeStart = normalizeDate(start);
  const safeEnd = normalizeDate(end);
  const safeValue = normalizeDate(value, safeStart);
  if (!safeStart || !safeEnd) return safeValue;
  return safeValue < safeStart ? safeStart : safeValue > safeEnd ? safeEnd : safeValue;
}

export function datesBetween(start, end) {
  const first = normalizeDate(start);
  const last = normalizeDate(end);
  if (!first || !last || first > last) return [];
  const dates = [];
  const cursor = new Date(`${first}T12:00:00Z`);
  const stop = new Date(`${last}T12:00:00Z`);
  while (cursor <= stop) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function rowsThrough(rows, selectedDate) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => normalizeDate(row?.date) && row.date <= selectedDate)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function reviewedEvidenceThrough(evidence, selectedDate) {
  if (!evidence || !Array.isArray(evidence.checkpoints)) return [];
  return evidence.checkpoints
    .filter((item) => REVIEWED.has(String(item?.reviewStatus || "").toLowerCase()))
    .filter((item) => normalizeDate(item?.availableDate) && item.availableDate <= selectedDate)
    .slice()
    .sort((a, b) =>
      a.availableDate.localeCompare(b.availableDate) ||
      String(a.eventDate || "").localeCompare(String(b.eventDate || "")) ||
      String(a.id || "").localeCompare(String(b.id || "")),
    );
}

export function latestEvidenceItems(evidenceItems, limit = 3) {
  if (!Array.isArray(evidenceItems) || !Number.isInteger(limit) || limit <= 0) return [];
  return evidenceItems.slice(-limit).reverse();
}

export function classifyBand(row) {
  if (!row || !isFiniteNumber(row.close) || !isFiniteNumber(row.bbUpper) || !isFiniteNumber(row.bbLower) || row.bbUpper < row.bbLower) return { code: "unknown", label: "Unknown" };
  if (isFiniteNumber(row.bbUpper) && row.close > row.bbUpper) return { code: "outside-upper", label: "Close outside upper" };
  if (isFiniteNumber(row.bbLower) && row.close < row.bbLower) return { code: "outside-lower", label: "Close outside lower" };
  const upperTouch = isFiniteNumber(row.bbUpper) && isFiniteNumber(row.high) && row.high >= row.bbUpper;
  const lowerTouch = isFiniteNumber(row.bbLower) && isFiniteNumber(row.low) && row.low <= row.bbLower;
  if (upperTouch && lowerTouch) return { code: "touch-both", label: "Wick touched both bands" };
  if (upperTouch) return { code: "touch-upper", label: "Wick touched upper" };
  if (lowerTouch) return { code: "touch-lower", label: "Wick touched lower" };
  if (isFiniteNumber(row.bbUpper) && isFiniteNumber(row.bbLower)) return { code: "inside", label: "Inside bands" };
  return { code: "unknown", label: "Unknown" };
}

export function bandAreaSegments(rows) {
  if (!Array.isArray(rows)) return [];
  const segments = [];
  let current = [];
  rows.forEach((row, index) => {
    if (isFiniteNumber(row?.bbUpper) && isFiniteNumber(row?.bbLower)) {
      current.push({ index, upper: row.bbUpper, lower: row.bbLower });
      return;
    }
    if (current.length >= 2) segments.push(current);
    current = [];
  });
  if (current.length >= 2) segments.push(current);
  return segments;
}

export function bandAreaPolygons(rows) {
  return bandAreaSegments(rows).map((segment) => [
    ...segment.map((point) => ({ index: point.index, value: point.upper })),
    ...segment.slice().reverse().map((point) => ({ index: point.index, value: point.lower })),
  ]);
}

function latestRow(rows) {
  return rows.length ? rows[rows.length - 1] : null;
}

function memberView(member, selectedDate, evidence) {
  const rows = rowsThrough(member?.rows, selectedDate);
  const latest = latestRow(rows);
  return {
    ticker: String(member?.ticker || "—"),
    name: String(member?.name || "Unknown"),
    role: String(member?.role || "—"),
    membershipStatus: String(member?.membershipStatus || "unknown"),
    relationship: (Array.isArray(evidence?.relationships) ? evidence.relationships : [])
      .filter((item) => item.ticker === member?.ticker && REVIEWED.has(item.reviewStatus) && normalizeDate(item.availableDate) && item.availableDate <= selectedDate)
      .sort((a, b) => b.availableDate.localeCompare(a.availableDate))[0] || null,
    missingReason: member?.missingReason || null,
    rows,
    latest,
    bandState: classifyBand(latest),
    hasSelectedSession: latest?.date === selectedDate,
  };
}

export function createReplayView(data, evidence, requestedDate, requestedTicker) {
  const start = normalizeDate(data?.windowStart);
  const end = normalizeDate(data?.windowEnd);
  const selectedDate = clampDate(requestedDate || data?.anchorDate, start, end);
  const members = Array.isArray(data?.members)
    ? data.members.map((member) => memberView(member, selectedDate, evidence))
    : [];
  const selectedMember = members.find((member) => member.ticker === requestedTicker) || members[0] || null;
  const evidenceItems = reviewedEvidenceThrough(evidence, selectedDate);
  const latestSessions = members.filter((member) => member.latest).length;
  const exactSessions = members.filter((member) => member.hasSelectedSession).length;
  const bandSession = members.map((member) => member.latest?.date).filter(Boolean).sort().at(-1) || null;
  const bandMembers = members.filter((member) => member.latest?.date === bandSession && member.bandState.code !== "unknown");
  const metricCoverage = members.filter((member) => {
    const row = member.latest;
    return row && isFiniteNumber(row.dCount) && isFiniteNumber(row.bbPositionPct) && isFiniteNumber(row.return1dPct);
  }).length;

  return {
    selectedDate,
    start,
    end,
    dateOptions: datesBetween(start, end),
    anchorDate: normalizeDate(data?.anchorDate),
    isAftermath: Boolean(normalizeDate(data?.anchorDate) && selectedDate > data.anchorDate),
    members,
    selectedMember,
    evidenceItems,
    coverage: {
      candidates: members.length,
      latestSessions,
      exactSessions,
      metricCoverage,
      bandSession,
      bandValid: bandMembers.length,
      outsideLower: bandMembers.filter((member) => member.bandState.code === "outside-lower").length,
      outsideUpper: bandMembers.filter((member) => member.bandState.code === "outside-upper").length,
      evidenceReviewed: evidenceItems.length,
    },
    source: data?.source || null,
    generatedAt: data?.generatedAt || null,
    evidenceStatus: evidence?.reviewStatus || "pending",
    evidenceLimitations: Array.isArray(evidence?.limitations) ? evidence.limitations : [],
  };
}
