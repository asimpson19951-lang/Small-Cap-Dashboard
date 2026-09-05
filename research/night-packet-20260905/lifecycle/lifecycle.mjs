const LIFECYCLES = new Set([
  "emerging",
  "active",
  "quiet-developing",
  "off-board",
  "reactivated",
]);

const FEED_STATUSES = new Set(["ok", "failed", "stale", "missing"]);
const CENSUS_STATUSES = new Set(["measured", "stale", "failed", "unknown"]);
const UNSUPPORTED_OPERATIONS = new Set(["theme-merge", "theme-split"]);
const EVENT_TYPES = new Set([
  "theme-created",
  "theme-renamed",
  "lifecycle-set",
  "member-added",
  "member-removed",
  "member-transferred",
  "feed-status",
]);

const ALLOWED_TRANSITIONS = new Map([
  ["emerging", new Set(["active", "quiet-developing", "off-board"])],
  ["active", new Set(["quiet-developing", "off-board"])],
  ["quiet-developing", new Set(["active", "off-board"])],
  ["off-board", new Set(["reactivated"])],
  ["reactivated", new Set(["active", "quiet-developing", "off-board"])],
]);

const PRIOR_QUIET_MOVE_PCT = 1.5;
const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseIsoWithTimezone(value, label) {
  const text = requiredText(value, label);
  const match = ISO_WITH_ZONE.exec(text);
  if (!match) throw new Error(`${label} must be ISO 8601 with an explicit timezone`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"));
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);

  if (
    year < 1000 || month < 1 || month > 12 || day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) {
    throw new Error(`${label} must be a real ISO 8601 timestamp`);
  }

  const offsetSign = match[9] === "-" ? -1 : 1;
  const offsetMinutes = match[8] === "Z"
    ? 0
    : offsetSign * (offsetHour * 60 + offsetMinute);
  const expectedMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
    offsetMinutes * 60_000;
  const parsedMs = Date.parse(text);
  if (!Number.isFinite(parsedMs) || parsedMs !== expectedMs) {
    throw new Error(`${label} must be a real ISO 8601 timestamp`);
  }

  return { source: text, utc: new Date(parsedMs).toISOString(), ms: parsedMs };
}

function parseDateKey(value, label) {
  const text = requiredText(value, label);
  const match = DATE_KEY.exec(text);
  if (!match) throw new Error(`${label} must be YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1000 || month < 1 || month > 12 || day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  ) {
    throw new Error(`${label} must be a real calendar date`);
  }
  return text;
}

function nonNegativeInteger(value, label, fallback = undefined) {
  const candidate = value == null ? fallback : value;
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return candidate;
}

function normalizeEvent(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`events[${index}] must be an object`);
  }
  const label = `events[${index}]`;
  const eventId = requiredText(raw.eventId, `${label}.eventId`);
  const type = requiredText(raw.type, `${label}.type`);
  if (UNSUPPORTED_OPERATIONS.has(type)) {
    throw new Error(`${label} uses unsupported operation ${type}`);
  }
  if (!EVENT_TYPES.has(type)) throw new Error(`${label}.type is unsupported: ${type}`);

  const at = parseIsoWithTimezone(raw.at, `${label}.at`);
  const event = {
    eventId,
    type,
    at: at.source,
    atUtc: at.utc,
    atMs: at.ms,
    order: nonNegativeInteger(raw.order, `${label}.order`, 0),
    reason: requiredText(raw.reason, `${label}.reason`),
    synthetic: raw.synthetic === true,
  };

  if (["theme-created", "theme-renamed", "lifecycle-set", "member-added", "member-removed", "feed-status"].includes(type)) {
    event.themeId = requiredText(raw.themeId, `${label}.themeId`);
  }
  if (type === "theme-created") {
    event.name = requiredText(raw.name, `${label}.name`);
    event.lifecycle = requiredText(raw.lifecycle, `${label}.lifecycle`);
    event.decisionKind = requiredText(raw.decisionKind, `${label}.decisionKind`);
    if (!LIFECYCLES.has(event.lifecycle)) throw new Error(`${label}.lifecycle is unsupported`);
    if (event.decisionKind !== "explicit-scenario") {
      throw new Error(`${label}.decisionKind must be explicit-scenario`);
    }
  } else if (type === "theme-renamed") {
    event.name = requiredText(raw.name, `${label}.name`);
  } else if (type === "lifecycle-set") {
    event.lifecycle = requiredText(raw.lifecycle, `${label}.lifecycle`);
    event.decisionKind = requiredText(raw.decisionKind, `${label}.decisionKind`);
    if (!LIFECYCLES.has(event.lifecycle)) throw new Error(`${label}.lifecycle is unsupported`);
    if (event.decisionKind !== "explicit-scenario") {
      throw new Error(`${label}.decisionKind must be explicit-scenario`);
    }
  } else if (type === "member-added" || type === "member-removed") {
    event.ticker = requiredText(raw.ticker, `${label}.ticker`).toUpperCase();
  } else if (type === "member-transferred") {
    event.fromThemeId = requiredText(raw.fromThemeId, `${label}.fromThemeId`);
    event.toThemeId = requiredText(raw.toThemeId, `${label}.toThemeId`);
    event.ticker = requiredText(raw.ticker, `${label}.ticker`).toUpperCase();
    if (event.fromThemeId === event.toThemeId) {
      throw new Error(`${label} cannot transfer within one theme`);
    }
  } else if (type === "feed-status") {
    event.feedId = requiredText(raw.feedId, `${label}.feedId`);
    event.status = requiredText(raw.status, `${label}.status`);
    if (!FEED_STATUSES.has(event.status)) throw new Error(`${label}.status is unsupported`);
  }
  return event;
}

function publicEvent(event, extra = {}) {
  const base = {
    eventId: event.eventId,
    type: event.type,
    at: event.at,
    atUtc: event.atUtc,
    order: event.order,
    reason: event.reason,
    synthetic: event.synthetic,
  };
  const fields = [
    "themeId", "fromThemeId", "toThemeId", "ticker", "name", "lifecycle",
    "decisionKind", "feedId", "status",
  ];
  for (const field of fields) {
    if (event[field] != null) base[field] = event[field];
  }
  return { ...base, ...extra };
}

function newTheme(event) {
  return {
    themeId: event.themeId,
    displayName: event.name,
    lifecycle: event.lifecycle,
    lifecycleReason: event.reason,
    lifecycleChangedAt: event.at,
    feed: { status: "unknown", feedId: null, at: null, reason: "No feed-status event through cutoff" },
    members: new Map(),
    nameHistory: [{ name: event.name, at: event.at, eventId: event.eventId, reason: event.reason }],
    lifecycleHistory: [{ lifecycle: event.lifecycle, at: event.at, eventId: event.eventId, reason: event.reason }],
    eventIds: [event.eventId],
  };
}

function getTheme(themes, themeId, eventId) {
  const theme = themes.get(themeId);
  if (!theme) throw new Error(`${eventId} references unknown theme ${themeId}`);
  return theme;
}

function assertTransition(from, to, eventId) {
  if (from === to) throw new Error(`${eventId} repeats lifecycle ${to}`);
  if (!ALLOWED_TRANSITIONS.get(from)?.has(to)) {
    throw new Error(`${eventId} cannot transition ${from} to ${to}`);
  }
}

function finalizeTheme(theme, historyById) {
  return {
    themeId: theme.themeId,
    displayName: theme.displayName,
    lifecycle: theme.lifecycle,
    lifecycleReason: theme.lifecycleReason,
    lifecycleChangedAt: theme.lifecycleChangedAt,
    feed: { ...theme.feed },
    members: [...theme.members.values()]
      .map((member) => ({ ...member }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    nameHistory: theme.nameHistory.map((entry) => ({ ...entry })),
    lifecycleHistory: theme.lifecycleHistory.map((entry) => ({ ...entry })),
    history: theme.eventIds.map((eventId) => ({ ...historyById.get(eventId) })),
  };
}

/**
 * Replays explicit theme, lifecycle, membership, and feed events through cutoff.
 * Names are labels only; themeId owns identity. Feed events never change lifecycle.
 */
export function buildLifecycleView(events, cutoff) {
  if (!Array.isArray(events)) throw new Error("events must be an array");
  const parsedCutoff = parseIsoWithTimezone(cutoff, "cutoff");
  const normalized = events.map(normalizeEvent);
  const ids = new Set();
  for (const event of normalized) {
    if (ids.has(event.eventId)) throw new Error(`duplicate eventId: ${event.eventId}`);
    ids.add(event.eventId);
  }

  normalized.sort((a, b) =>
    a.atMs - b.atMs || a.order - b.order || a.eventId.localeCompare(b.eventId));
  const eligible = normalized.filter((event) => event.atMs <= parsedCutoff.ms);
  const themes = new Map();
  const history = [];

  for (const event of eligible) {
    let record;
    if (event.type === "theme-created") {
      if (themes.has(event.themeId)) throw new Error(`${event.eventId} duplicates themeId ${event.themeId}`);
      themes.set(event.themeId, newTheme(event));
      record = publicEvent(event);
    } else if (event.type === "theme-renamed") {
      const theme = getTheme(themes, event.themeId, event.eventId);
      const fromName = theme.displayName;
      theme.displayName = event.name;
      theme.nameHistory.push({ name: event.name, at: event.at, eventId: event.eventId, reason: event.reason });
      theme.eventIds.push(event.eventId);
      record = publicEvent(event, { fromName });
    } else if (event.type === "lifecycle-set") {
      const theme = getTheme(themes, event.themeId, event.eventId);
      const fromLifecycle = theme.lifecycle;
      assertTransition(fromLifecycle, event.lifecycle, event.eventId);
      theme.lifecycle = event.lifecycle;
      theme.lifecycleReason = event.reason;
      theme.lifecycleChangedAt = event.at;
      theme.lifecycleHistory.push({ lifecycle: event.lifecycle, at: event.at, eventId: event.eventId, reason: event.reason });
      theme.eventIds.push(event.eventId);
      record = publicEvent(event, { fromLifecycle });
    } else if (event.type === "member-added") {
      const theme = getTheme(themes, event.themeId, event.eventId);
      if (theme.members.has(event.ticker)) throw new Error(`${event.eventId} adds existing member ${event.ticker}`);
      theme.members.set(event.ticker, {
        ticker: event.ticker,
        since: event.at,
        reason: event.reason,
        via: "member-added",
      });
      theme.eventIds.push(event.eventId);
      record = publicEvent(event);
    } else if (event.type === "member-removed") {
      const theme = getTheme(themes, event.themeId, event.eventId);
      if (!theme.members.has(event.ticker)) throw new Error(`${event.eventId} removes absent member ${event.ticker}`);
      theme.members.delete(event.ticker);
      theme.eventIds.push(event.eventId);
      record = publicEvent(event);
    } else if (event.type === "member-transferred") {
      const fromTheme = getTheme(themes, event.fromThemeId, event.eventId);
      const toTheme = getTheme(themes, event.toThemeId, event.eventId);
      if (!fromTheme.members.has(event.ticker)) {
        throw new Error(`${event.eventId} transfers absent member ${event.ticker}`);
      }
      if (toTheme.members.has(event.ticker)) {
        throw new Error(`${event.eventId} transfers onto existing member ${event.ticker}`);
      }
      fromTheme.members.delete(event.ticker);
      toTheme.members.set(event.ticker, {
        ticker: event.ticker,
        since: event.at,
        reason: event.reason,
        via: "member-transferred",
        fromThemeId: event.fromThemeId,
      });
      fromTheme.eventIds.push(event.eventId);
      toTheme.eventIds.push(event.eventId);
      record = publicEvent(event);
    } else if (event.type === "feed-status") {
      const theme = getTheme(themes, event.themeId, event.eventId);
      theme.feed = {
        status: event.status,
        feedId: event.feedId,
        at: event.at,
        reason: event.reason,
      };
      theme.eventIds.push(event.eventId);
      record = publicEvent(event, { lifecycleUnchanged: true });
    }
    history.push(record);
  }

  const historyById = new Map(history.map((event) => [event.eventId, event]));
  return {
    cutoff: parsedCutoff.source,
    cutoffUtc: parsedCutoff.utc,
    ordering: ["at", "order", "eventId"],
    policy: {
      lifecycleSource: "explicit-scenario-events-only",
      feedFailureCanChangeLifecycle: false,
      inferredRetirementThreshold: null,
      unsupportedOperations: [...UNSUPPORTED_OPERATIONS].sort(),
    },
    themeCount: themes.size,
    themes: [...themes.values()]
      .map((theme) => finalizeTheme(theme, historyById))
      .sort((a, b) => a.themeId.localeCompare(b.themeId)),
    history: history.map((event) => ({ ...event })),
    future: { excludedCount: normalized.length - eligible.length },
  };
}

function normalizeCensus(raw, label) {
  if (raw == null) {
    return {
      status: "unknown",
      membersMeasured: null,
      membersExpected: null,
      outsideBandCount: null,
      completeness: "unknown",
      verdict: "unknown",
      reason: "missing-census",
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  const status = requiredText(raw.status, `${label}.status`);
  if (!CENSUS_STATUSES.has(status)) throw new Error(`${label}.status is unsupported`);
  if (status !== "measured") {
    return {
      status,
      membersMeasured: null,
      membersExpected: null,
      outsideBandCount: null,
      completeness: "unknown",
      verdict: "unknown",
      reason: `${status}-census`,
    };
  }

  const membersMeasured = nonNegativeInteger(raw.membersMeasured, `${label}.membersMeasured`);
  const membersExpected = nonNegativeInteger(raw.membersExpected, `${label}.membersExpected`);
  const outsideBandCount = nonNegativeInteger(raw.outsideBandCount, `${label}.outsideBandCount`);
  if (membersMeasured > membersExpected) throw new Error(`${label} measures more members than expected`);
  if (outsideBandCount > membersMeasured) throw new Error(`${label} has more outside-band members than measured members`);
  if (membersExpected === 0) {
    return {
      status,
      membersMeasured,
      membersExpected,
      outsideBandCount,
      completeness: "unknown",
      verdict: "unknown",
      reason: "empty-census",
    };
  }
  if (membersMeasured < membersExpected) {
    return {
      status,
      membersMeasured,
      membersExpected,
      outsideBandCount,
      completeness: "partial",
      verdict: "unknown",
      reason: "partial-census",
    };
  }
  return {
    status,
    membersMeasured,
    membersExpected,
    outsideBandCount,
    completeness: "complete",
    verdict: outsideBandCount === 0 ? "quiet" : "not-quiet",
    reason: outsideBandCount === 0 ? "complete-zero-outside-band" : "complete-outside-band-detected",
  };
}

/**
 * Compares the existing prior-session |basket move| < 1.5 approximation with
 * a complete dated outside-band census. It does not define retirement behavior.
 */
export function compareQuietHistory(history) {
  if (!Array.isArray(history)) throw new Error("history must be an array");
  const seenDates = new Set();
  let todayCount = 0;
  const rows = history.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`history[${index}] must be an object`);
    }
    const label = `history[${index}]`;
    const date = parseDateKey(raw.date, `${label}.date`);
    if (seenDates.has(date)) throw new Error(`duplicate history date: ${date}`);
    seenDates.add(date);
    const sessionRole = raw.sessionRole == null ? "prior" : requiredText(raw.sessionRole, `${label}.sessionRole`);
    if (!new Set(["prior", "today"]).has(sessionRole)) throw new Error(`${label}.sessionRole is unsupported`);
    if (sessionRole === "today") todayCount++;

    const basketMovePct = typeof raw.basketMovePct === "number" && Number.isFinite(raw.basketMovePct)
      ? raw.basketMovePct
      : null;
    const approximation = basketMovePct == null
      ? "unknown"
      : Math.abs(basketMovePct) < PRIOR_QUIET_MOVE_PCT ? "quiet" : "not-quiet";
    const outsideBandCensus = normalizeCensus(raw.outsideBandCensus, `${label}.outsideBandCensus`);

    let fullVerdict;
    let fullReason;
    if (approximation === "not-quiet") {
      fullVerdict = "not-quiet";
      fullReason = "basket-move-not-quiet";
    } else if (outsideBandCensus.verdict === "not-quiet") {
      fullVerdict = "not-quiet";
      fullReason = outsideBandCensus.reason;
    } else if (approximation === "unknown") {
      fullVerdict = "unknown";
      fullReason = "basket-move-unknown";
    } else if (outsideBandCensus.verdict === "unknown") {
      fullVerdict = "unknown";
      fullReason = outsideBandCensus.reason;
    } else {
      fullVerdict = outsideBandCensus.verdict;
      fullReason = outsideBandCensus.reason;
    }

    let comparison = "unresolved";
    if (approximation === "quiet" && fullVerdict === "not-quiet") comparison = "false-quiet";
    else if (approximation === "quiet" && fullVerdict === "quiet") comparison = "confirmed-quiet";
    else if (approximation === "not-quiet" && fullVerdict === "not-quiet") comparison = "agreement-not-quiet";

    return {
      date,
      sessionRole,
      basketMovePct,
      existingApproximation: approximation,
      outsideBandCensus,
      fullVerdict,
      fullReason,
      comparison,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (todayCount > 1) throw new Error("history may contain at most one today row");
  const today = rows.find((row) => row.sessionRole === "today");
  const todayProtection = !today
    ? { status: "not-provided", date: null, allowsQuietStreak: null }
    : {
        status: today.fullVerdict === "quiet"
          ? "quiet-confirmed"
          : today.fullVerdict === "not-quiet" ? "heat-detected" : "unknown-protective",
        date: today.date,
        allowsQuietStreak: today.fullVerdict === "quiet",
      };

  return {
    existingApproximation: {
      rule: "abs(basketMovePct) < 1.5",
      thresholdPct: PRIOR_QUIET_MOVE_PCT,
      scope: "existing prior-session approximation; not a new retirement rule",
    },
    rows,
    summary: {
      sessions: rows.length,
      falseQuietDates: rows.filter((row) => row.comparison === "false-quiet").map((row) => row.date),
      confirmedQuietDates: rows.filter((row) => row.comparison === "confirmed-quiet").map((row) => row.date),
      unresolvedDates: rows.filter((row) => row.fullVerdict === "unknown").map((row) => row.date),
    },
    todayProtection,
  };
}
