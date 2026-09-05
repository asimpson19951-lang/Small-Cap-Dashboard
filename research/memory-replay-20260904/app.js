import { bandAreaPolygons, createReplayView, isFiniteNumber, latestEvidenceItems } from "./view-model.mjs";

const replayParams = new URLSearchParams(window.location.search);
const state = { selectedDate: replayParams.get("date"), selectedTicker: replayParams.get("ticker") || "SNDK" };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const number = (value, digits = 2) => isFiniteNumber(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const pct = (value) => isFiniteNumber(value) ? `${value > 0 ? "+" : ""}${number(value, 1)}%` : "—";
const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const reviewedStatus = (value) => ["accepted", "reviewed"].includes(String(value || "").toLowerCase());

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function statusMessage(data, evidence) {
  const messages = [];
  if (!data) messages.push("Daily replay data is not present yet.");
  if (!evidence) messages.push("Source review is pending; no narrative evidence is available.");
  else if (!reviewedStatus(evidence.reviewStatus)) messages.push(`Evidence file status is ${esc(evidence.reviewStatus || "pending")}; only individually accepted or reviewed checkpoints can appear.`);
  const node = $("#status-panel");
  node.classList.toggle("visible", messages.length > 0);
  node.innerHTML = messages.length ? `<strong>Review pending.</strong> ${messages.join(" ")}` : "";
}

function summaryCards(view) {
  const leader = (ticker) => view.members.find((member) => member.ticker === ticker);
  const card = (label, value, detail, extra = "") => `<article class="summary-card ${extra}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="detail">${esc(detail)}</div></article>`;
  const leaderCard = (ticker) => {
    const member = leader(ticker);
    const row = member?.latest;
    return card(ticker, row ? pct(row.return1dPct) : "—", row ? `${member?.role || "User-identified leader"} · ${dateLabel(row.date)} · close ${number(row.close)}` : (member?.missingReason || member?.role || "No completed session available"), "leader");
  };
  $("#summary").innerHTML = [
    leaderCard("SNDK"),
    leaderCard("MU"),
    card("Candidate coverage", `${view.coverage.latestSessions}/${view.coverage.candidates}`, `${view.coverage.exactSessions}/${view.coverage.candidates} have a bar exactly on this calendar cutoff`),
    card("Close outside bands", view.coverage.bandValid ? `${view.coverage.outsideLower}/${view.coverage.bandValid} below` : "Unknown", `${view.coverage.outsideUpper}/${view.coverage.bandValid} above · ${view.coverage.bandValid}/${view.coverage.candidates} valid on ${view.coverage.bandSession || "unknown session"}`),
    card("Reviewed changes", String(view.coverage.evidenceReviewed), "Dated sources through cutoff · reviewed retrospectively"),
  ].join("");
}

function chartPath(rows, key, x, y) {
  let path = "";
  let drawing = false;
  rows.forEach((row, index) => {
    if (!isFiniteNumber(row[key])) { drawing = false; return; }
    path += `${drawing ? "L" : "M"}${x(index).toFixed(1)},${y(row[key]).toFixed(1)} `;
    drawing = true;
  });
  return path.trim();
}

function bandAreaPath(points, x, y) {
  return `${points.map((point, index) => `${index ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ")} Z`;
}

function renderChart(view) {
  const member = view.selectedMember;
  $("#chart-title").textContent = member ? `${member.ticker} · daily price + Bollinger bands` : "Daily price + Bollinger bands";
  $("#member-selector").innerHTML = view.members.map((item) => `<button class="member-button${item.ticker === member?.ticker ? " active" : ""}" type="button" data-ticker="${esc(item.ticker)}">${esc(item.ticker)}</button>`).join("");
  document.querySelectorAll(".member-button").forEach((button) => button.addEventListener("click", () => { state.selectedTicker = button.dataset.ticker; render(); }));

  const rows = member?.rows || [];
  const values = rows.flatMap((row) => [row.close, row.bbLower, row.bbMid, row.bbUpper]).filter(isFiniteNumber);
  if (!rows.length || !values.length) {
    $("#chart").innerHTML = `<div class="chart-empty">${esc(member?.missingReason || "No completed daily bars are available by this cutoff.")}</div>`;
    return;
  }

  const width = 860, height = 340, margin = { top: 28, right: 60, bottom: 34, left: 18 };
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  let min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * .08, Math.abs(max || 1) * .01);
  min -= padding; max += padding;
  const x = (index) => margin.left + (rows.length === 1 ? innerW / 2 : index * innerW / (rows.length - 1));
  const y = (value) => margin.top + (max - value) * innerH / (max - min || 1);
  const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  const labelIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  const upper = chartPath(rows, "bbUpper", x, y), lower = chartPath(rows, "bbLower", x, y);
  const bandAreas = bandAreaPolygons(rows).map((polygon) => bandAreaPath(polygon, x, y));
  const last = rows[rows.length - 1];
  const anchorIndex = rows.findIndex((row) => row.date === view.anchorDate);
  const aria = `${member.ticker} daily chart through ${view.selectedDate}. ${rows.length} completed sessions. Y axis ${number(min)} to ${number(max)}.`;
  $("#chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">
    ${ticks.map((tick) => `<line class="gridline" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis-label" x="${width - margin.right + 8}" y="${y(tick) + 3}">${number(tick)}</text>`).join("")}
    <line class="axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>
    ${anchorIndex >= 0 ? `<line class="anchor-line" x1="${x(anchorIndex)}" x2="${x(anchorIndex)}" y1="${margin.top}" y2="${height - margin.bottom}"/><text class="axis-label" x="${x(anchorIndex) + 5}" y="${margin.top + 10}">JUL 29 ANCHOR</text>` : ""}
    ${bandAreas.map((path) => `<path class="band-area" d="${path}"/>`).join("")}
    <path class="band-line" d="${upper}"/><path class="band-line band-mid" d="${chartPath(rows, "bbMid", x, y)}"/><path class="band-line" d="${lower}"/>
    <path class="close-line" d="${chartPath(rows, "close", x, y)}"/>
    ${isFiniteNumber(last.close) ? `<circle class="last-dot" cx="${x(rows.length - 1)}" cy="${y(last.close)}" r="4"/>` : ""}
    ${labelIndexes.map((index) => `<text class="axis-label" x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}">${esc(rows[index].date.slice(5))}</text>`).join("")}
    <text class="chart-legend" x="${margin.left}" y="14">CLOSE</text><text class="chart-legend" x="${margin.left + 48}" y="14">BB UPPER / MID / LOWER</text>
  </svg>`;
}

function sourceTimestamp(source) {
  if (!source?.publishedAt) return "publication time unknown";
  const stamp = (value) => value.includes("T") ? value : `${value} · time unknown`;
  return `published ${stamp(source.publishedAt)}${source.updatedAt ? ` · revised ${stamp(source.updatedAt)}` : ""}${source.timingNote ? ` · ${source.timingNote}` : ""}`;
}

function evidenceKind(item) {
  const kind = ["development", "attribution", "context"].includes(item?.kind) ? item.kind : "context";
  return { kind, label: { development: "Documented development", attribution: "Reported attribution", context: "Context / unresolved" }[kind] };
}

function evidenceSources(item) {
  return (Array.isArray(item?.sources) ? item.sources : []).map((source) => {
    const url = safeSourceUrl(source.url);
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || "Source")} ↗ <span>(${esc(sourceTimestamp(source))})</span></a>` : "";
  }).join("");
}

function renderLatestChanges(view) {
  const items = latestEvidenceItems(view.evidenceItems, 3);
  if (!items.length) {
    $("#latest-changes").innerHTML = `<div class="latest-empty">No reviewed documented changes were available by ${esc(dateLabel(view.selectedDate))}.</div>`;
    return;
  }
  $("#latest-changes").innerHTML = items.map((item) => {
    const { kind, label } = evidenceKind(item);
    const tickers = Array.isArray(item.tickers) && item.tickers.length ? item.tickers.join(" / ") : "Unspecified scope";
    return `<article class="latest-item">
      <div class="event-meta"><span class="type-chip kind-${kind}">${esc(label)}</span><span>AVAILABLE ${esc(item.availableDate)}</span><span>· ${esc(tickers)}</span></div>
      <h3>${esc(item.title || "Untitled reviewed checkpoint")}</h3>
      <p class="event-summary">${esc(item.summary || "Summary unavailable.")}</p>
      ${item.caveat ? `<p class="event-caveat">${esc(item.caveat)}</p>` : ""}
      <div class="event-sources">${evidenceSources(item)}</div>
    </article>`;
  }).join("");
}

function renderTimeline(view) {
  $("#evidence-count").textContent = String(view.evidenceItems.length);
  if (!view.evidenceItems.length) {
    $("#timeline").innerHTML = `<div class="timeline-empty">No accepted or reviewed evidence was available by ${esc(dateLabel(view.selectedDate))}.<br>That is an evidence state, not a “no catalyst” claim.</div>`;
    return;
  }
  $("#timeline").innerHTML = view.evidenceItems.map((item) => {
    const sources = evidenceSources(item);
    const { kind, label: kindLabel } = evidenceKind(item);
    const tickers = Array.isArray(item.tickers) && item.tickers.length ? ` · ${item.tickers.join(" / ")}` : "";
    return `<article class="event">
      <div class="event-meta"><span class="type-chip kind-${kind}">${esc(kindLabel)}</span><span>AVAILABLE ${esc(item.availableDate)}</span>${item.eventDate ? `<span>· EVENT ${esc(item.eventDate)}</span>` : ""}<span>${esc(tickers)}</span></div>
      <h3>${esc(item.title || "Untitled reviewed checkpoint")}</h3>
      <p class="event-summary">${esc(item.summary || "Summary unavailable.")}</p>
      ${item.caveat ? `<p class="event-caveat">Uncertainty: ${esc(item.caveat)}</p>` : ""}
      <div class="event-sources">${sources}</div>
    </article>`;
  }).join("");
}

function dCount(row) {
  if (!row || !isFiniteNumber(row.dCount)) return `<span class="unknown">—</span>`;
  const status = String(row.dStatus || "unknown");
  const lower = status.toLowerCase().includes("lower");
  return `<span class="number ${lower ? "lower-bound" : ""}">${lower ? "≥" : ""}${esc(row.dCount)}</span><span class="member-name">${esc(status)}</span>`;
}

function renderMembers(view) {
  $("#coverage").innerHTML = `${view.coverage.latestSessions}/${view.coverage.candidates} with a prior completed session<br>${view.coverage.metricCoverage}/${view.coverage.candidates} with complete displayed metrics`;
  $("#member-rows").innerHTML = view.members.map((member) => {
    const row = member.latest;
    const moveClass = isFiniteNumber(row?.return1dPct) ? row.return1dPct > 0 ? "positive" : row.return1dPct < 0 ? "negative" : "" : "unknown";
    const bbPos = isFiniteNumber(row?.bbPositionPct) ? `${number(row.bbPositionPct, 2)}%` : "—";
    const bandGauge = isFiniteNumber(row?.bbPositionPct) ? `<div class="band-gauge" aria-hidden="true"><i style="left:${Math.min(100, Math.max(0, row.bbPositionPct))}%"></i></div>` : "";
    const provenance = member.missingReason || member.membershipStatus || "unknown";
    const relationship = member.relationship;
    return `<tr>
      <td><span class="ticker">${esc(member.ticker)}</span><span class="member-name">${esc(member.name)}</span><span class="member-role">${esc(member.role)}</span></td>
      <td class="number ${row ? "" : "unknown"}">${esc(row?.date || "—")}</td>
      <td class="number ${isFiniteNumber(row?.close) ? "" : "unknown"}">${number(row?.close)}</td>
      <td class="number ${moveClass}">${pct(row?.return1dPct)}</td>
      <td>${dCount(row)}</td>
      <td class="number ${isFiniteNumber(row?.bbPositionPct) ? "" : "unknown"}">${esc(bbPos)}${bandGauge}</td>
      <td>${esc(member.bandState.label)}</td>
      <td class="provenance">${relationship ? `<strong>${esc(relationship.relation)}</strong><p>${esc(relationship.summary)}</p><p class="event-caveat">${esc(relationship.caveat)}</p><div class="event-sources">${evidenceSources(relationship)}</div>` : "<strong>Relationship evidence unavailable by cutoff</strong>"}<span class="member-name">${esc(provenance)}</span></td>
    </tr>`;
  }).join("");
  const limitations = [
    "Candidate membership is retrospective; as-of membership is unproved.",
    "Four candidates are not a claim of a complete historical theme universe.",
    "D is a lower bound until an observed reset; no mirrored downside D rule.",
    "OUTSIDE uses completed close; TOUCH can be wick-only.",
    "BB position: 0% is the lower band, 100% is the upper band; values can extend beyond both. Gauge dots stop at the display edges.",
    "Outside-band counts use valid rows from the same latest displayed session; stale and missing members stay in candidate coverage but not that valid denominator.",
    ...(view.source?.limitations || []),
    ...view.evidenceLimitations,
  ];
  if (view.source?.description) limitations.push(`Daily metrics source: ${view.source.description}${view.source.cacheEnd ? ` · cache through ${view.source.cacheEnd}` : ""}.`);
  $("#footnotes").innerHTML = [...new Set(limitations.filter(Boolean))].map((item) => `<span>• ${esc(item)}</span>`).join("");
}

function render() {
  const data = window.MEMORY_REPLAY_DATA;
  const evidence = window.MEMORY_REPLAY_EVIDENCE;
  statusMessage(data, evidence);
  if (!data) {
    $("#summary").innerHTML = "";
    $("#latest-changes").innerHTML = `<div class="latest-empty">Waiting for reviewed evidence and the local data build.</div>`;
    $("#member-selector").innerHTML = "";
    $("#chart").innerHTML = `<div class="chart-empty">Waiting for the local data build.</div>`;
    $("#timeline").innerHTML = `<div class="timeline-empty">Waiting for source review.</div>`;
    $("#member-rows").innerHTML = `<tr><td colspan="8" class="unknown">No candidate data loaded.</td></tr>`;
    return;
  }
  const view = createReplayView(data, evidence, state.selectedDate, state.selectedTicker);
  state.selectedDate = view.selectedDate;
  state.selectedTicker = view.selectedMember?.ticker || state.selectedTicker;
  const dateInput = $("#cutoff-date"), slider = $("#cutoff-slider");
  dateInput.min = view.start || ""; dateInput.max = view.end || ""; dateInput.value = view.selectedDate || "";
  slider.max = String(Math.max(0, view.dateOptions.length - 1)); slider.value = String(Math.max(0, view.dateOptions.indexOf(view.selectedDate)));
  const mode = $("#cutoff-mode");
  mode.textContent = view.isAftermath ? "Aftermath · EOD Eastern" : "EOD Eastern";
  mode.classList.toggle("aftermath", view.isAftermath);
  summaryCards(view);
  renderLatestChanges(view);
  renderChart(view);
  renderTimeline(view);
  renderMembers(view);
}

$("#cutoff-date").addEventListener("change", (event) => { state.selectedDate = event.target.value; render(); });
$("#cutoff-slider").addEventListener("input", (event) => {
  const data = window.MEMORY_REPLAY_DATA;
  const view = createReplayView(data, window.MEMORY_REPLAY_EVIDENCE, state.selectedDate, state.selectedTicker);
  state.selectedDate = view.dateOptions[Number(event.target.value)] || view.selectedDate;
  render();
});

render();
