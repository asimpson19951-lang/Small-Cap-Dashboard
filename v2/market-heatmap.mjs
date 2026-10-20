import { isTradingSession } from './market-calendar.mjs';

const PERIODS = Object.freeze(['1d', '5d', '20d']);
const KNOWN_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'VIXY', 'GLD', 'SLV', 'USO', 'XBI', 'XLE', 'OIH', 'GDX', 'IBIT', 'SPCX', 'BWET']);
const UNKNOWN_LABEL = 'Unclassified';
const PRIMARY_SECTORS = ['Communication', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Financials', 'Health Care', 'Industrials', 'Information Technology', 'Materials', 'Real Estate', 'Utilities'];

function finite(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function tickerOf(row) {
  return text(row?.ticker ?? row?.symbol).toUpperCase();
}

function etDate(value) {
  const milliseconds = Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(milliseconds)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function metricSession(row) {
  const explicit = text(row?.change_session_date ?? row?.session_date ?? row?.market_session_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const observedDate = etDate(row?.updated_at ?? row?.as_of);
  if (isTradingSession(observedDate) === true) return observedDate;
  if (isTradingSession(observedDate) === false && row?.d_count_as_of === row?.d_count_completed_through && /^\d{4}-\d{2}-\d{2}$/.test(text(row?.d_count_as_of))) {
    return row.d_count_as_of;
  }
  return observedDate;
}

function periodSession(row, period) {
  if (period === '1d') return metricSession(row);
  const explicit = text(row?.return_session_date?.[period] ?? row?.returns_as_of?.[period]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const qualityDates = Array.isArray(row?.quality_session_dates) ? row.quality_session_dates : [];
  const qualityDate = text(qualityDates.at(-1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(qualityDate)) return qualityDate;
  return etDate(row?.quality_as_of) || metricSession(row);
}

function metricCandidate(row, names, source) {
  if (!row) return null;
  let value = null;
  for (const name of names) {
    value = finite(row?.[name]);
    if (value != null) break;
  }
  if (value == null) return null;
  const session = metricSession(row);
  const priceMetric = names.includes('price');
  const explicitAt = priceMetric
    ? row?.price_updated_at ?? row?.quote_updated_at ?? row?.provider_updated_at ?? row?.market_as_of
    : row?.change_updated_at ?? row?.quote_updated_at ?? row?.provider_updated_at ?? row?.market_as_of;
  const observedAt = explicitAt ?? (source === 'broad' ? row?.updated_at ?? row?.as_of : source === 'chart-bars:D' ? row?.quality_as_of : null);
  const observedDate = etDate(observedAt);
  const metricAt = observedDate === session ? Date.parse(observedAt || '') : NaN;
  return {
    value,
    session,
    observedAt,
    metricAt: Number.isFinite(metricAt) ? metricAt : null,
    source,
    priority: row?.quality_source === 'chart-bars:D' ? 3 : source === 'broad' ? 2 : 1,
  };
}

function newestMetric(...candidates) {
  return candidates.filter(Boolean).sort((a, b) =>
    text(b.session).localeCompare(text(a.session)) ||
    (b.metricAt ?? -Infinity) - (a.metricAt ?? -Infinity) || b.priority - a.priority)[0] || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function closesReturn(closes, sessions) {
  const values = Array.isArray(closes) ? closes.map(finite) : [];
  if (values.length < sessions + 1) return null;
  const window = values.slice(-(sessions + 1));
  if (window.some(value => value == null || value <= 0)) return null;
  const latest = window.at(-1);
  const base = window[0];
  return base > 0 ? ((latest / base) - 1) * 100 : null;
}

export function periodReturn(row, period) {
  if (!PERIODS.includes(period)) return null;
  if (period === '1d') return finite(row?.returns?.['1d'] ?? row?.change_pct ?? row?.changePct);
  return finite(row?.returns?.[period]) ?? closesReturn(row?.closes_30d, period === '5d' ? 5 : 20);
}

export function heatLevel(value) {
  const move = finite(value);
  if (move == null) return 'missing';
  if (move <= -5) return 'down-4';
  if (move <= -2) return 'down-3';
  if (move <= -0.5) return 'down-2';
  if (move < 0) return 'down-1';
  if (move === 0) return 'flat';
  if (move < 0.5) return 'up-1';
  if (move < 2) return 'up-2';
  if (move < 5) return 'up-3';
  return 'up-4';
}

function registryMembership(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = text(row?.name);
    if (!name || row?.is_active === false) continue;
    for (const ticker of unique((Array.isArray(row?.constituents) ? row.constituents : []).map(value => text(value).toUpperCase()))) {
      if (!map.has(ticker)) map.set(ticker, []);
      map.get(ticker).push(name);
    }
  }
  for (const names of map.values()) names.sort((a, b) => a.localeCompare(b, 'en'));
  return map;
}

function instrumentKind(row) {
  const kind = text(row?.instrument_type ?? row?.type).toUpperCase();
  if (KNOWN_ETFS.has(tickerOf(row)) || ['ETF', 'ETN', 'ETV'].includes(kind)) return 'ETF';
  if (['CS', 'COMMON STOCK', 'STOCK', 'EQUITY'].includes(kind)) return 'Company';
  return 'Unknown';
}

function sectorLabel(row, kind) {
  if (kind === 'ETF') return 'ETFs';
  const sector = text(row?.sector);
  return sector && sector.toUpperCase() !== 'UNCLASSIFIED' ? sector : UNKNOWN_LABEL;
}

function formatPeriod(period) {
  return period.toUpperCase();
}

function compareSectors(a, b) {
  if (a.name === b.name) return 0;
  if (a.name === 'ETFs') return -1;
  if (b.name === 'ETFs') return 1;
  const aPrimary = PRIMARY_SECTORS.indexOf(a.name);
  const bPrimary = PRIMARY_SECTORS.indexOf(b.name);
  if (aPrimary >= 0 || bPrimary >= 0) return aPrimary >= 0 && bPrimary >= 0 ? aPrimary - bPrimary : aPrimary >= 0 ? -1 : 1;
  if (a.name === UNKNOWN_LABEL) return 1;
  if (b.name === UNKNOWN_LABEL) return -1;
  return a.name.localeCompare(b.name, 'en', { numeric: true });
}

export function mergeMarketHeatmapRows(snapshotRows, detailRows, classificationRows = []) {
  const details = new Map((Array.isArray(detailRows) ? detailRows : []).map(row => [tickerOf(row), row]));
  const snapshots = new Map((Array.isArray(snapshotRows) ? snapshotRows : []).map(row => [tickerOf(row), row]));
  const classifications = new Map((Array.isArray(classificationRows) ? classificationRows : []).map(row => [tickerOf(row), row]));
  const tickers = unique([...snapshots.keys(), ...details.keys()]);
  return tickers.map(symbol => {
    const row = snapshots.get(symbol) || {};
    const ticker = symbol;
    const detail = details.get(ticker) || null;
    const classification = classifications.get(ticker) || null;
    const priceMetric = newestMetric(metricCandidate(row, ['price'], 'broad'), metricCandidate(detail, ['price'], 'radar'));
    const changeMetric = newestMetric(
      metricCandidate(row, ['change_pct', 'changePct'], 'broad'),
      metricCandidate(detail, ['change_pct', 'changePct'], detail?.quality_source === 'chart-bars:D' ? 'chart-bars:D' : 'radar'),
    );
    return {
      ...row,
      ...classification,
      ...detail,
      ticker,
      name: text(detail?.name ?? detail?.company_name) || text(classification?.name) || text(row?.name ?? row?.company_name) || null,
      sector: text(classification?.sector) || text(row?.sector) || null,
      instrument_type: text(classification?.instrument_type) || text(row?.instrument_type ?? row?.type) || text(detail?.instrument_type ?? detail?.type) || (KNOWN_ETFS.has(ticker) ? 'ETF' : null),
      theme: text(detail?.theme) || text(row?.theme) || null,
      themes: unique([
        ...(Array.isArray(row?.themes) ? row.themes.map(text) : []),
        ...(Array.isArray(detail?.themes) ? detail.themes.map(text) : []),
      ]),
      closes_30d: Array.isArray(detail?.closes_30d) ? detail.closes_30d : row?.closes_30d,
      returns: detail?.returns && typeof detail.returns === 'object' ? detail.returns : row?.returns,
      volume_ratio: finite(detail?.volume_ratio) ?? finite(row?.volume_ratio),
      price: priceMetric?.value ?? null,
      change_pct: changeMetric?.value ?? null,
      change_session_date: changeMetric?.session ?? null,
      updated_at: changeMetric?.observedAt ?? priceMetric?.observedAt ?? detail?.updated_at ?? row?.updated_at ?? row?.as_of ?? null,
      collection_updated_at: detail?.updated_at ?? null,
      metric_provenance: Object.freeze({
        price: priceMetric ? { source: priceMetric.source, session_date: priceMetric.session, observed_at: priceMetric.observedAt } : null,
        change_pct: changeMetric ? { source: changeMetric.source, session_date: changeMetric.session, observed_at: changeMetric.observedAt } : null,
      }),
      classification_source: text(classification?.classification_source) || (classification ? 'iShares Russell 3000 ETF holdings' : null),
      detailAvailable: detail?.detailAvailable === false ? false : details.has(ticker),
      broadIncluded: snapshots.has(ticker) || detail?.broadIncluded === true,
    };
  }).filter(row => row.ticker);
}

export function applyThemeQualityEnrichment(baseRows, enrichmentRows) {
  const byTicker = new Map((Array.isArray(baseRows) ? baseRows : []).map(row => [tickerOf(row), row]));
  for (const evidence of Array.isArray(enrichmentRows) ? enrichmentRows : []) {
    const ticker = tickerOf(evidence);
    if (!ticker) continue;
    const base = byTicker.get(ticker) || { ticker, detailAvailable: false };
    byTicker.set(ticker, { ...base, ...evidence, ticker, detailAvailable: base.detailAvailable === true });
  }
  return [...byTicker.values()];
}

export function buildMarketHeatmapModel({
  snapshotRows = [],
  detailRows = [],
  preparedRows = [],
  classificationRows = [],
  registryRows = [],
  period = '1d',
  source = {},
} = {}) {
  const selectedPeriod = PERIODS.includes(period) ? period : '1d';
  const memberships = registryMembership(registryRows);
  const rows = Array.isArray(preparedRows) && preparedRows.length
    ? preparedRows
    : mergeMarketHeatmapRows(snapshotRows, detailRows, classificationRows);
  const sectors = new Map();
  let measured = 0;
  let sectorClassified = 0;
  let themeMapped = 0;
  let detailAvailable = 0;
  let trackedSupplemental = 0;
  let latestAt = null;

  for (const row of rows) {
    const ticker = row.ticker;
    const kind = instrumentKind(row);
    const sector = sectorLabel(row, kind);
    const registryThemes = memberships.get(ticker) || [];
    const themes = kind === 'ETF' ? [] : unique([
      ...registryThemes,
      text(row.theme),
      ...(Array.isArray(row.themes) ? row.themes.map(text) : []),
    ]).sort((a, b) => a.localeCompare(b, 'en'));
    const rawValue = periodReturn(row, selectedPeriod);
    const acceptedSession = text(source?.marketSessionDate);
    const value = acceptedSession && periodSession(row, selectedPeriod) !== acceptedSession ? null : rawValue;
    const updatedMs = Date.parse(row.updated_at || '');
    if (Number.isFinite(updatedMs) && (!latestAt || updatedMs > Date.parse(latestAt))) latestAt = new Date(updatedMs).toISOString();
    if (value != null) measured += 1;
    if (kind === 'ETF' || sector !== UNKNOWN_LABEL) sectorClassified += 1;
    if (themes.length) themeMapped += 1;
    if (row.detailAvailable) detailAvailable += 1;
    if (!row.broadIncluded) trackedSupplemental += 1;

    const stock = Object.freeze({
      symbol: ticker,
      name: text(row?.name ?? row?.company_name) || null,
      price: finite(row.price),
      changePct: value,
      heat: heatLevel(value),
      sector,
      themes: Object.freeze(themes),
      instrumentKind: kind,
      detailAvailable: row.detailAvailable,
      asOf: row.updated_at || null,
    });

    if (!sectors.has(sector)) sectors.set(sector, new Map());
    const groups = sectors.get(sector);
    const groupNames = kind === 'ETF' ? ['ETF / market proxies'] : themes.length ? themes : ['Sector / no mapped theme'];
    for (const groupName of groupNames) {
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(stock);
    }
  }

  const sectorRows = [...sectors.entries()].map(([name, groups]) => ({
    name,
    groups: [...groups.entries()].map(([groupName, stocks]) => ({
      id: `${name}\u001f${groupName}`,
      name: groupName,
      kind: groupName === 'Sector / no mapped theme' ? 'sector' : groupName === 'ETF / market proxies' ? 'etf' : 'theme',
      stocks: stocks.sort((a, b) => {
        if (a.changePct == null || b.changePct == null) return a.changePct == null ? b.changePct == null ? a.symbol.localeCompare(b.symbol) : 1 : -1;
        return (b.changePct - a.changePct) || a.symbol.localeCompare(b.symbol);
      }),
    })).sort((a, b) => (a.kind === 'theme' ? 0 : 1) - (b.kind === 'theme' ? 0 : 1) || a.name.localeCompare(b.name, 'en')),
  })).sort(compareSectors);

  const total = rows.length;
  return Object.freeze({
    period: selectedPeriod,
    periodLabel: formatPeriod(selectedPeriod),
    rows: Object.freeze(sectorRows),
    coverage: Object.freeze({
      total,
      measured,
      missing: Math.max(total - measured, 0),
      classified: sectorClassified,
      sectorClassified,
      classificationMissing: Math.max(total - sectorClassified, 0),
      themeMapped,
      detailAvailable,
      providerReturned: finite(source?.providerReturned),
      trackedSupplemental,
      tileMentions: sectorRows.reduce((sum, sector) => sum + sector.groups.reduce((n, group) => n + group.stocks.length, 0), 0),
      universeLabel: text(source?.universeLabel) || (snapshotRows.length ? 'Massive U.S. stocks snapshot' : 'Radar tracked universe'),
      sourceLabel: text(source?.sourceLabel) || (snapshotRows.length ? 'Massive full-market snapshot' : 'Radar market_data'),
      cacheStatus: text(source?.cacheStatus) || (snapshotRows.length ? 'unknown' : 'tracked-only'),
      marketAsOf: source?.marketAsOf || latestAt,
      marketSessionDate: text(source?.marketSessionDate) || null,
      generatedAt: source?.generatedAt || null,
      classificationLabel: text(source?.classificationLabel) || 'Radar theme_registry + market_data sectors',
      classificationAsOf: source?.classificationAsOf || null,
    }),
  });
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function signed(value) {
  const number = finite(value);
  return number == null ? '—' : `${number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}

function matches(stock, query, sector, group) {
  if (!query) return true;
  return [stock.symbol, stock.name, sector, group, ...stock.themes]
    .filter(Boolean).join(' ').toLowerCase().includes(query);
}

// ---------- board skin v2 (Oct 19 2026): .sk kit markup, palette D4 cells. Display only; the model and its values are unchanged. ----------
const D4_CLAMP = 5; // bar length = |1D %| / 5, full bar at ±5% (the old heat scale's top step)
function toneOf(value) {
  const number = finite(value);
  if (number == null || Number(Math.abs(number).toFixed(1)) === 0) return '';
  return number > 0 ? 'up' : 'dn';
}
function d4Cell(value) {
  const number = finite(value);
  if (number == null) return '<span class="t2">n/a</span>';
  const tone = toneOf(number);
  return `<span class="db ${tone}"><span class="${tone}">${esc(signed(number))}</span><i style="width:${(Math.min(1, Math.abs(number) / D4_CLAMP) * 100).toFixed(1)}%"></i></span>`;
}
function medianOf(values) {
  const list = values.filter(value => finite(value) != null).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}
function uniqueStocks(stocks) {
  const seen = new Map();
  for (const stock of stocks) if (!seen.has(stock.symbol)) seen.set(stock.symbol, stock);
  return [...seen.values()];
}
const count = value => Number(value || 0).toLocaleString('en-US');

function quickView(model) {
  const sectors = (model?.rows || []).map(sector => {
    const stocks = uniqueStocks(sector.groups.flatMap(group => group.stocks));
    const measured = stocks.filter(stock => stock.changePct != null);
    return {
      name: sector.name,
      names: stocks.length,
      up: measured.filter(stock => stock.changePct > 0).length,
      down: measured.filter(stock => stock.changePct < 0).length,
      median: medianOf(measured.map(stock => stock.changePct)),
    };
  });
  const everyone = uniqueStocks((model?.rows || []).flatMap(sector => sector.groups.flatMap(group => group.stocks)));
  const measured = everyone.filter(stock => stock.changePct != null);
  const up = measured.filter(stock => stock.changePct > 0).length;
  const down = measured.filter(stock => stock.changePct < 0).length;
  const median = medianOf(measured.map(stock => stock.changePct));
  const ranked = sectors.filter(sector => sector.median != null && sector.name !== 'ETFs' && sector.names >= 5).sort((a, b) => b.median - a.median);
  const best = ranked[0];
  const worst = ranked.at(-1);
  const period = esc(model?.periodLabel || '1D');
  const read = measured.length
    ? `<b>${count(up)}</b> of ${count(measured.length)} measured names rose ${period}, <b>${count(down)}</b> fell; the median name moved <b class="${toneOf(median)}">${esc(signed(median))}</b>.${best && worst && best !== worst ? ` Strongest sector by median: ${esc(best.name)} ${esc(signed(best.median))}; weakest: ${esc(worst.name)} ${esc(signed(worst.median))}.` : ''}`
    : `No measured ${period} moves for this session yet.`;
  const tile = (k, v, s) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a');
  const strip = [
    tile('Up names', `<span class="up">${count(up)}</span><small>names</small>`, `${pct(up, measured.length)} of measured · ${period}`),
    tile('Down names', `<span class="dn">${count(down)}</span><small>names</small>`, `${pct(down, measured.length)} of measured · ${period}`),
    tile('Median move', `<span class="${toneOf(median)}">${esc(signed(median))}</span>`, `${period} · every measured name`),
    tile('Measured', `${count(measured.length)}<small>names</small>`, `of ${count(everyone.length)} on the map · ${count(everyone.length - measured.length)} missing`),
  ].join('');
  const sectorRows = sectors.map(sector => `<tr><th>${esc(sector.name)}</th><td>${count(sector.names)}</td><td class="up">${count(sector.up)}</td><td class="dn">${count(sector.down)}</td><td>${d4Cell(sector.median)}</td></tr>`).join('');
  const movers = measured.filter(stock => stock.sector !== UNKNOWN_LABEL && stock.price != null && stock.price >= 1).sort((a, b) => b.changePct - a.changePct || a.symbol.localeCompare(b.symbol));
  const top = movers.slice(0, 7);
  const bottom = movers.slice(-7).reverse().filter(stock => !top.includes(stock));
  const moverRow = stock => `<tr${stock.detailAvailable ? ` data-ticker="${esc(stock.symbol)}" style="cursor:pointer"` : ''}><th>${esc(stock.symbol)}</th><td class="l opt">${esc(stock.sector)}</td><td>${d4Cell(stock.changePct)}</td><td class="opt">${stock.price == null ? 'n/a' : `$${esc(stock.price.toFixed(2))}`}</td></tr>`;
  const moverBody = `${top.map(moverRow).join('')}${bottom.length ? `<tr class="base"><th colspan="4" style="text-align:left">Biggest decliners</th></tr>${bottom.map(moverRow).join('')}` : ''}`;
  const panels = `<div class="grid2">
  <section class="panel"><h2>Sectors, ${period}</h2><p class="sub">Unique names per sector (multi-theme names counted once) · median of measured names</p>
    <div class="tw"><table class="t"><thead><tr><th class="l">Sector</th><th>Names</th><th>Up</th><th>Down</th><th>Median ${period} %</th></tr></thead><tbody>${sectorRows || '<tr class="more"><td colspan="5">No sectors yet.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><h2>Biggest ${period} moves</h2><p class="sub">Top 7 up, then top 7 down · classified names at $1 and up · descriptive, not a signal</p>
    <div class="tw"><table class="t"><thead><tr><th class="l">Ticker</th><th class="l opt">Sector</th><th>${period} %</th><th class="opt">Price</th></tr></thead><tbody>${moverBody || '<tr class="more"><td colspan="4">No measured moves yet.</td></tr>'}</tbody></table></div></section>
</div>`;
  return `<p class="read">${read}</p><div class="strip" style="--cols:4">${strip}</div>${panels}`;
}

function heatTile(stock, model) {
  const memberships = stock.themes.length > 1 ? `<small title="Appears in ${stock.themes.length} mapped themes">×${stock.themes.length}</small>` : '';
  const title = `${stock.symbol} · ${model.periodLabel} ${signed(stock.changePct)} · ${stock.sector}${stock.themes.length ? ` · ${stock.themes.join(', ')}` : ''}`;
  const tone = toneOf(stock.changePct);
  const bar = stock.changePct == null ? '' : `<i style="display:block;width:${(Math.min(1, Math.abs(stock.changePct) / D4_CLAMP) * 100).toFixed(1)}%;height:3px;margin:4px auto 0;border-radius:2px;background:var(${tone === 'dn' ? '--dn-bar' : tone === 'up' ? '--up-bar' : '--bar'})"></i>`;
  const body = `<strong>${esc(stock.symbol)}</strong><span class="${tone || 't2'}">${esc(signed(stock.changePct))}</span>${bar}${memberships}`;
  const style = 'background:#191c1f;text-shadow:none;color:var(--text)'; // palette D4: number + bar on black, no filled heat block
  return stock.detailAvailable
    ? `<button type="button" class="market-heat-tile" data-heat="${stock.heat}" data-ticker="${esc(stock.symbol)}" title="${esc(title)}" aria-label="${esc(title)}" style="${style}">${body}</button>`
    : `<div class="market-heat-tile" data-heat="${stock.heat}" title="${esc(`${title} · detail unavailable`)}" style="${style}">${body}</div>`;
}

// The body re-renders every poll cycle; keep the Deep view open when the user opened it (or is searching / expanding).
function deepWasOpen() {
  try { return globalThis.document?.querySelector?.('#marketHeatBody details.deep')?.open === true; } catch { return false; }
}

export function renderMarketHeatmap(model, { query = '', expandedGroups = new Set(), previewLimit = 80, deepOpen = null } = {}) {
  const needle = text(query).toLowerCase();
  const sections = [];
  for (const sector of model?.rows || []) {
    const groups = [];
    for (const group of sector.groups || []) {
      const filtered = group.stocks.filter(stock => matches(stock, needle, sector.name, group.name));
      if (!filtered.length) continue;
      const expanded = needle || expandedGroups.has(group.id);
      const visible = expanded || filtered.length <= previewLimit
        ? filtered
        : Array.from({ length: previewLimit }, (_, index) => filtered[Math.floor(index * filtered.length / previewLimit)]);
      const hidden = filtered.length - visible.length;
      const up = filtered.filter(stock => stock.changePct != null && stock.changePct > 0).length;
      const down = filtered.filter(stock => stock.changePct != null && stock.changePct < 0).length;
      const flat = filtered.filter(stock => stock.changePct === 0).length;
      const missing = filtered.length - up - down - flat;
      const kind = group.kind === 'etf' ? 'ETF' : group.kind.charAt(0).toUpperCase() + group.kind.slice(1);
      groups.push(`<section class="market-heat-group" data-market-group="${esc(group.id)}" style="background:var(--raised)">
        <header><span class="chip" style="margin:0">${esc(kind)}</span><strong style="font-size:13.5px">${esc(group.name)}</strong><small style="font-size:12.5px;color:var(--text-2)"><span class="up">${up} up</span> · <span class="dn">${down} down</span> · ${flat} flat · ${missing} unknown · showing ${visible.length} of ${filtered.length}</small></header>
        <div class="market-heat-tiles">${visible.map(stock => heatTile(stock, model)).join('')}</div>
        ${hidden > 0 ? `<button type="button" class="market-group-expand" data-market-group-expand="${esc(group.id)}" style="font-size:12.5px;color:var(--text)">Show ${hidden} more</button>` : ''}
      </section>`);
    }
    if (groups.length) sections.push(`<section class="market-sector-row" style="background:var(--raised)"><header class="market-sector-head" style="background:var(--raised-2)"><h2>${esc(sector.name)}</h2><span style="font-size:12.5px;color:var(--text-2)">${groups.length} ${groups.length === 1 ? 'group' : 'groups'}</span></header><div class="market-sector-groups">${groups.join('')}</div></section>`);
  }
  const open = deepOpen ?? (Boolean(needle) || expandedGroups.size > 0 || deepWasOpen());
  const deepBody = sections.length ? sections.join('') : '<p class="note">No names match this filter.</p>';
  return `<div class="sk" style="--mono:var(--font);--sans:var(--font)">${quickView(model)}<details class="deep"${open ? ' open' : ''}><summary>Deep view <span>every sector, theme group and name as a ${esc(model?.periodLabel || '1D')} heat grid</span></summary><div class="body" style="display:grid;gap:10px">${deepBody}</div></details></div>`;
}

export const MARKET_HEATMAP_PERIODS = PERIODS;
