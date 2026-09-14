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

export function renderMarketHeatmap(model, { query = '', expandedGroups = new Set(), previewLimit = 80 } = {}) {
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
      groups.push(`<section class="market-heat-group" data-market-group="${esc(group.id)}">
        <header><span class="market-group-kind">${esc(group.kind.toUpperCase())}</span><strong>${esc(group.name)}</strong><small>↑${up} ↓${down} =${flat} · ${missing} unknown · showing ${visible.length}/${filtered.length}</small></header>
        <div class="market-heat-tiles">${visible.map(stock => {
          const memberships = stock.themes.length > 1 ? `<small title="Appears in ${stock.themes.length} mapped themes">×${stock.themes.length}</small>` : '';
          const title = `${stock.symbol} · ${model.periodLabel} ${signed(stock.changePct)} · ${stock.sector}${stock.themes.length ? ` · ${stock.themes.join(', ')}` : ''}`;
          const body = `<strong>${esc(stock.symbol)}</strong><span>${esc(signed(stock.changePct))}</span>${memberships}`;
          return stock.detailAvailable
            ? `<button type="button" class="market-heat-tile ${stock.heat}" data-ticker="${esc(stock.symbol)}" title="${esc(title)}" aria-label="${esc(title)}">${body}</button>`
            : `<div class="market-heat-tile ${stock.heat}" title="${esc(`${title} · detail unavailable`)}">${body}</div>`;
        }).join('')}</div>
        ${hidden > 0 ? `<button type="button" class="market-group-expand" data-market-group-expand="${esc(group.id)}">SHOW ${hidden} MORE</button>` : ''}
      </section>`);
    }
    if (groups.length) sections.push(`<section class="market-sector-row"><header class="market-sector-head"><h2>${esc(sector.name)}</h2><span>${groups.length} ${groups.length === 1 ? 'group' : 'groups'}</span></header><div class="market-sector-groups">${groups.join('')}</div></section>`);
  }
  return sections.length ? sections.join('') : '<div class="empty-copy">No names match this filter.</div>';
}

export const MARKET_HEATMAP_PERIODS = PERIODS;
