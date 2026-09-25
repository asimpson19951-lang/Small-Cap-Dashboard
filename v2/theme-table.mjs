import { atr5dValue, formatAtr5d, atr5dTitle, ATR5D_TITLE } from './atr5d.mjs?v=V2.11.55-LOCAL';
import { bandSortValue, numeric } from './list-sort.mjs?v=V2.11.78';
import { layoutStructureTiles, mapHeightFor, moveTone, suppliedMemberUnion, tileMarkup, vehicleChip } from './theme-board.mjs?v=V2.11.80';

// THEMES table (SPEC_themes_table.md slice 1, V2.11.80).
//
// One compact row per theme. Every number is computed here from member market
// rows; the theme engine's mov_1d / mov_3d / breadth are not read. Unknown stays
// unknown: a missing value is "—" and is left out of that column's denominator.
// Each row is built in its own try/catch so one bad theme marks only its row.
// Measurements only: no stage word, no story, no ranking beyond the chosen sort.

export const THEME_TABLE_COLUMNS = Object.freeze([
  { key: 'name', label: 'THEME', title: 'Theme name · basket member count' },
  { key: 'd1', label: '1D', title: 'Equal-weight mean of basket member 1D change %' },
  { key: 'd3', label: '3D', title: 'Equal-weight mean of basket member price now vs the close three sessions earlier (closes_30d)' },
  { key: 'green', label: 'GREEN', title: 'Basket members up on the day / members with a 1D change' },
  { key: 'ext', label: 'EXT', title: 'Basket members outside the Bollinger band now: ↑ above the upper band, ↓ below the lower band / members with a band position' },
  { key: 'bb', label: 'BB', title: 'Median Bollinger position of basket members (0% lower band, 100% upper band)', narrowHide: true },
  { key: 'ema8', label: '8EMA', title: 'Median basket member distance from the 8EMA' },
  { key: 'atr', label: 'ATR/5D', title: `Median fixed-five ATR move of basket members. ${ATR5D_TITLE}`, narrowHide: true },
  { key: 'd', label: 'D', title: 'Median / max member D count. A run resets on a completed daily close below the prior completed day\'s low; * = live day provisional' },
  { key: 'sc', label: 'SC', title: 'SC vehicles: declared sc_vehicles plus SC rows on today\'s board tagged with this theme', narrowHide: true },
  { key: 'asof', label: 'AS OF', title: 'Newest member quote time (ET); k/n current when some member quotes are from an older session' },
]);

const D_RULE = 'D resets on a completed daily close below the prior completed day\'s low; the next holding session is D1. * = today is provisional.';

function finite(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tickerOf(value) {
  const raw = typeof value === 'string' ? value : value?.ticker || value?.tk || value?.symbol;
  return String(raw || '').trim().toUpperCase();
}

export function themeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function listOrThrow(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} is not a list`);
  return value;
}

export function mean(values) {
  const known = values.filter(value => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

/** Lower middle for an even count, so a D count stays a whole session number. */
export function lowerMedian(values) {
  const known = values.filter(value => value != null).sort((a, b) => a - b);
  return known.length ? known[Math.floor((known.length - 1) / 2)] : null;
}

export function median(values) {
  const known = values.filter(value => value != null).sort((a, b) => a - b);
  if (!known.length) return null;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2;
}

/** Price now against the close `sessions` sessions earlier. closes_30d carries the live bar last. */
export function closesReturn(row, sessions = 3) {
  const closes = Array.isArray(row?.closes_30d) ? row.closes_30d.map(finite) : [];
  if (closes.length < sessions + 1) return null;
  const window = closes.slice(-(sessions + 1));
  if (window.some(value => value == null || value <= 0)) return null;
  return (window.at(-1) / window[0] - 1) * 100;
}

function etDateKey(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function quoteAt(row) {
  const value = row?.metric_provenance?.change_pct?.observed_at || row?.updated_at || null;
  return Number.isFinite(Date.parse(value || '')) ? value : null;
}

function quoteSession(row) {
  return row?.change_session_date || etDateKey(quoteAt(row));
}

/** Theme list: active registry rows ∪ engine rows (the union renderThemeBoard built). */
export function themeList({ registry = [], themes = [] } = {}) {
  const byName = new Map();
  for (const engine of Array.isArray(themes) ? themes : []) {
    if (!engine || typeof engine.name !== 'string' || !engine.name.trim()) continue;
    byName.set(engine.name, { name: engine.name, engine, registry: null });
  }
  for (const reg of Array.isArray(registry) ? registry : []) {
    if (!reg || reg.is_active === false || typeof reg.name !== 'string' || !reg.name.trim()) continue;
    const entry = byName.get(reg.name);
    if (entry) entry.registry = reg;
    else byName.set(reg.name, { name: reg.name, engine: null, registry: reg });
  }
  return [...byName.values()];
}

/** Members of one theme: registry constituents ∪ engine constituents ∪ sc_vehicles ∪ tagged SC rows. */
export function themeTableMembers(entry, rowFor, taggedRows = []) {
  const registryList = listOrThrow(entry.registry?.constituents, 'registry constituents');
  const engineList = listOrThrow(entry.engine?.constituents, 'engine constituents');
  const scList = listOrThrow(entry.engine?.sc_vehicles, 'sc_vehicles');
  const provisionalRaw = entry.registry?.provisional_members;
  const provisional = provisionalRaw && typeof provisionalRaw === 'object' && !Array.isArray(provisionalRaw) ? provisionalRaw : {};
  const scSet = new Set(scList.map(tickerOf).filter(Boolean));
  const tickers = [...new Set([...registryList.map(tickerOf), ...engineList.map(tickerOf), ...scSet].filter(Boolean))];
  const joined = tickers.map(ticker => {
    const row = rowFor(ticker) || null;
    return {
      ticker,
      row,
      category: row?.category || (scSet.has(ticker) ? 'SC' : null),
      provisional: Object.prototype.hasOwnProperty.call(provisional, ticker),
    };
  });
  const slug = themeSlug(entry.name);
  const tagged = (Array.isArray(taggedRows) ? taggedRows : [])
    .filter(row => row && row.watch !== false && row.category === 'SC' && slug && themeSlug(row.theme) === slug)
    .map(row => ({ ...(rowFor(tickerOf(row)) || row), ticker: tickerOf(row) }));
  return suppliedMemberUnion({ members: joined, vehicles: tagged });
}

/** One theme row. Throws on malformed input; the caller isolates the throw to this row. */
export function buildThemeRow(entry, { rowFor, taggedRows = [], sessionDate = null, marketStale = false } = {}) {
  const members = themeTableMembers(entry, rowFor, taggedRows);
  const ml = members.filter(member => member.category === 'ML');
  const sc = members.filter(member => member.category === 'SC');
  const unknownClass = members.filter(member => member.category == null);
  const scBasket = sc.length > 0 && (ml.length === 0 || entry.engine?.sc_cluster === true);
  const basket = scBasket ? [...sc, ...unknownClass] : [...ml, ...unknownClass];
  const rows = basket.map(member => member.row).filter(Boolean);

  const change = basket.map(member => finite(member.row?.change_pct));
  const ret3 = basket.map(member => (member.row ? closesReturn(member.row, 3) : null));
  const bbPos = basket.map(member => finite(member.row?.bb_position));
  const ema8 = basket.map(member => finite(member.row?.ema8_dist));
  const atr = basket.map(member => (member.row ? atr5dValue(member.row) : null));
  const dVals = basket.map(member => {
    const d = finite(member.row?.d_count);
    return d == null ? null : Math.max(0, Math.trunc(d));
  });
  const known = values => values.filter(value => value != null);

  let dMax = null;
  basket.forEach((member, index) => {
    const d = dVals[index];
    if (d == null) return;
    if (!dMax || d > dMax.value) dMax = { value: d, ticker: member.ticker, provisional: member.row?.d_count_provisional === true };
  });
  const completedOut = basket.filter(member => {
    const days = finite(member.row?.bb_completed_consec);
    return days != null && days >= 1 && ['UPPER', 'LOWER'].includes(String(member.row?.bb_completed_side || ''));
  });
  const completedMeasured = basket.filter(member => ['UPPER', 'LOWER', 'IN_BAND'].includes(String(member.row?.bb_completed_side || ''))).length;

  const scBest = sc
    .map(member => ({ ticker: member.ticker, move: finite(member.row?.change_pct) }))
    .filter(item => item.move != null)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0] || null;

  // AS OF across every member with a quote (basket and vehicles).
  const quoted = members.filter(member => member.row && quoteAt(member.row));
  const newest = quoted.map(member => quoteAt(member.row)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const current = sessionDate ? quoted.filter(member => quoteSession(member.row) === sessionDate).length : quoted.length;
  let asofState = 'none';
  if (quoted.length) {
    if (marketStale) asofState = 'lane-stale';
    else if (current === quoted.length) asofState = 'current';
    else if (current === 0) asofState = 'stale';
    else asofState = 'partial';
  }

  const d1 = mean(change);
  const d3 = mean(ret3);
  const measured1d = known(change).length;
  return {
    name: entry.name,
    failed: false,
    source: entry.engine && entry.registry ? 'registry+engine' : entry.engine ? 'engine' : 'registry',
    scBasket,
    members,
    basket,
    ml,
    sc,
    unknownClass,
    n: basket.length,
    quotedBasket: rows.length,
    d1,
    d1Median: median(change),
    d1Measured: measured1d,
    d3,
    d3Measured: known(ret3).length,
    green: known(change).filter(value => value > 0).length,
    greenMeasured: measured1d,
    extUp: known(bbPos).filter(value => value > 100).length,
    extDown: known(bbPos).filter(value => value < 0).length,
    bbMeasured: known(bbPos).length,
    bbMedian: median(bbPos),
    bbCompletedOut: completedOut.length,
    bbCompletedMeasured: completedMeasured,
    ema8Median: median(ema8),
    ema8Above: known(ema8).filter(value => value > 0).length,
    ema8Measured: known(ema8).length,
    atrMedian: median(atr),
    atrMeasured: known(atr).length,
    dMedian: lowerMedian(dVals),
    dMax,
    dMeasured: known(dVals).length,
    scCount: sc.length,
    scBest,
    asof: { newest, current, quoted: quoted.length, state: asofState },
    sink: measured1d === 0,
  };
}

/**
 * Rows for every theme. `marketRows` are the page's display rows (market_data merged
 * with market-heatmap-snapshot); `taggedRows` are today's board rows for tagged SC vehicles.
 */
export function buildThemeTableRows({ registry = [], themes = [], marketRows = [], taggedRows = [], session = {}, marketStale = false, onRowError = null } = {}) {
  const byTicker = new Map();
  for (const row of Array.isArray(marketRows) ? marketRows : []) {
    const ticker = tickerOf(row);
    if (ticker && !byTicker.has(ticker)) byTicker.set(ticker, row);
  }
  const rowFor = ticker => byTicker.get(ticker) || null;
  return themeList({ registry, themes }).map(entry => {
    try {
      return buildThemeRow(entry, { rowFor, taggedRows, sessionDate: session?.latestDate || null, marketStale });
    } catch (error) {
      if (typeof onRowError === 'function') onRowError(entry.name, error);
      return { name: entry.name, failed: true, error: error instanceof Error ? error.message : String(error), sink: true, members: [], basket: [] };
    }
  });
}

function sortValue(row, key) {
  if (row.failed) return null;
  switch (key) {
    case 'name': return row.name;
    case 'abs1d': return row.d1 == null ? null : Math.abs(row.d1);
    case 'd1': return row.d1;
    case 'd3': return row.d3;
    case 'green': return row.greenMeasured ? row.green / row.greenMeasured : null;
    case 'ext': return row.bbMeasured ? row.extUp + row.extDown : null;
    case 'bb': return row.bbMedian;
    case 'ema8': return row.ema8Median;
    case 'atr': return row.atrMedian;
    case 'd': return row.dMax ? row.dMax.value : null;
    case 'sc': return row.scCount;
    case 'asof': return row.asof?.newest ? Date.parse(row.asof.newest) : null;
    default: return null;
  }
}

/** Default: |1D| descending, tie-break |3D|. Failed and unmeasured rows always sink. Unknown values last. */
export function compareThemeRows(a, b, sort = null) {
  const sinkA = a.sink === true || a.failed === true;
  const sinkB = b.sink === true || b.failed === true;
  if (sinkA !== sinkB) return sinkA ? 1 : -1;
  const key = sort?.key || 'abs1d';
  const direction = sort?.direction || (key === 'name' ? 'asc' : 'desc');
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va == null || vb == null) {
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
  } else if (va !== vb) {
    const sign = direction === 'asc' ? 1 : -1;
    return sign * (typeof va === 'string' ? va.localeCompare(vb, 'en') : va - vb);
  }
  const abs = (row, field) => (row[field] == null ? -Infinity : Math.abs(row[field]));
  return (abs(b, 'd1') - abs(a, 'd1')) || (abs(b, 'd3') - abs(a, 'd3')) || String(a.name).localeCompare(String(b.name), 'en');
}

export function sortThemeRows(rows, sort = null) {
  return [...rows].sort((a, b) => compareThemeRows(a, b, sort));
}

/** Header click cycle: desc → asc → default (null). THEME starts ascending. */
export function nextThemeSort(current, key) {
  const first = key === 'name' ? 'asc' : 'desc';
  const second = first === 'asc' ? 'desc' : 'asc';
  if (current?.key !== key) return { key, direction: first };
  return current.direction === first ? { key, direction: second } : null;
}

// ---------- rendering ----------

function signed(value, digits = 1, suffix = '%') {
  const n = finite(value);
  if (n == null) return '—';
  const text = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${text === '-0.0' ? '0.0' : text}${suffix}`;
}

function fmtAtr(value) {
  const n = finite(value);
  if (n == null) return '—';
  const rounded = Number(n.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ATR`;
}

function fmtD(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function toneClass(value) {
  return `tt-tone ${moveTone(value)}`;
}

function signClass(value) {
  const n = finite(value);
  if (n == null || n === 0) return '';
  return n > 0 ? 'tt-up' : 'tt-down';
}

export function etTime(value) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }).format(new Date(ms));
}

function etShortDate(value) {
  const ms = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(ms));
}

function asofCell(row, esc) {
  const a = row.asof;
  if (!a || a.state === 'none') return { cls: '', text: 'no member quotes', title: 'No member has a market row' };
  const time = etTime(a.newest);
  const date = etShortDate(a.newest);
  if (a.state === 'lane-stale') return { cls: 'tt-stale', text: `STALE ${date || ''} ${time || ''}`.trim(), title: 'market_data refresh failed; showing the prior values' };
  if (a.state === 'stale') return { cls: 'tt-stale', text: `STALE ${date || '—'}`, title: `No member quote is from the current session · newest ${date || '—'} ${time || ''} ET` };
  if (a.state === 'partial') return { cls: 'tt-stale', text: `${a.current}/${a.quoted} current`, title: `${a.current} of ${a.quoted} member quotes are from the current session · newest ${time || '—'} ET` };
  return { cls: '', text: time ? `${time} ET` : '—', title: `${a.quoted}/${a.quoted} member quotes current · newest ${date || ''} ${time || ''} ET` };
}

function cellsFor(row, esc) {
  const as = asofCell(row, esc);
  const dText = row.dMax ? `D${fmtD(row.dMedian)} / D${row.dMax.value}${row.dMax.provisional ? '*' : ''}` : '—';
  const dTitle = row.dMax
    ? `Median D${fmtD(row.dMedian)} (lower middle when even) · max D${row.dMax.value}${row.dMax.provisional ? '*' : ''} ${row.dMax.ticker} · ${row.dMeasured}/${row.n} measured · ${D_RULE}`
    : `D unavailable · 0/${row.n} measured · ${D_RULE}`;
  return [
    { key: 'd1', cls: toneClass(row.d1), text: signed(row.d1), title: `Mean ${signed(row.d1, 2)} · median ${signed(row.d1Median, 2)} · ${row.d1Measured}/${row.n} measured` },
    { key: 'd3', cls: toneClass(row.d3), text: signed(row.d3), title: `Mean 3-session return ${signed(row.d3, 2)} · ${row.d3Measured}/${row.n} measured` },
    { key: 'green', cls: '', text: row.greenMeasured ? `${row.green}/${row.greenMeasured}` : '—', title: `${row.green} up / ${row.greenMeasured} with a 1D change · ${row.greenMeasured}/${row.n} measured` },
    { key: 'ext', cls: '', text: row.bbMeasured ? `↑${row.extUp} ↓${row.extDown} /${row.bbMeasured}` : '—', title: `${row.extUp} above the upper band · ${row.extDown} below the lower band · ${row.bbMeasured}/${row.n} measured` },
    { key: 'bb', cls: 'tt-narrow-hide', text: row.bbMedian == null ? '—' : `${row.bbMedian.toFixed(0)}%`, title: `Median band position · ${row.bbMeasured}/${row.n} measured · completed close outside the band: ${row.bbCompletedOut}/${row.bbCompletedMeasured}` },
    { key: 'ema8', cls: `tt-ema8 ${signClass(row.ema8Median)}`, text: signed(row.ema8Median), title: `${row.ema8Above} above 8EMA / ${row.ema8Measured} measured · ${row.ema8Measured}/${row.n} measured` },
    { key: 'atr', cls: 'tt-narrow-hide', text: fmtAtr(row.atrMedian), title: `Median of ${row.atrMeasured}/${row.n} measured · ${ATR5D_TITLE}` },
    { key: 'd', cls: '', text: dText, title: dTitle },
    { key: 'sc', cls: 'tt-narrow-hide', text: String(row.scCount), title: row.scBest ? `Best SC mover ${row.scBest.ticker} ${signed(row.scBest.move)}` : row.scCount ? 'SC vehicles have no 1D change' : 'No SC vehicle declared or tagged' },
    { key: 'asof', cls: as.cls, text: as.text, title: as.title },
  ];
}

function headerMarkup(sort, esc) {
  return `<thead><tr>${THEME_TABLE_COLUMNS.map(column => {
    const active = sort?.key === column.key || (!sort && column.key === 'd1');
    const direction = sort?.key === column.key ? sort.direction : !sort && column.key === 'd1' ? 'desc' : null;
    const arrow = active ? (direction === 'asc' ? '▲' : '▼') : '↕';
    const note = !sort && column.key === 'd1' ? ' (default: largest |1D| first)' : '';
    const cls = [column.key === 'ema8' ? 'ema8-key' : '', column.narrowHide ? 'tt-narrow-hide' : '', column.key === 'name' ? 'tt-name-col' : ''].filter(Boolean).join(' ');
    return `<th scope="col"${cls ? ` class="${cls}"` : ''} aria-sort="${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="tt-sort" data-theme-sort="${column.key}" title="${esc(`${column.title}. Click to sort; third click restores |1D| order.${note}`)}">${esc(column.label)}<span class="tt-arrow" aria-hidden="true">${arrow}</span></button></th>`;
  }).join('')}</tr></thead>`;
}

function rowMarkup(row, esc, open) {
  const safeName = esc(row.name);
  if (row.failed) {
    return `<tr class="tt-row tt-failed" data-theme-row="${safeName}"><th scope="row" class="tt-name-col"><span class="tt-name">${safeName}</span></th><td colspan="${THEME_TABLE_COLUMNS.length - 1}" class="tt-fail-cell">${safeName} · row failed: ${esc(row.error || 'unknown error')}</td></tr>`;
  }
  const tag = row.scBasket ? '<span class="tt-tag" title="No ML members (or SC cluster): the SC members are this theme\'s basket">SC BASKET</span>' : '';
  return `<tr class="tt-row${open ? ' open' : ''}${row.sink ? ' tt-sunk' : ''}" data-theme-row="${safeName}" tabindex="0" aria-expanded="${open ? 'true' : 'false'}" title="${safeName} · click to ${open ? 'collapse' : 'expand'}">
      <th scope="row" class="tt-name-col"><span class="tt-chevron" aria-hidden="true">${open ? '▾' : '▸'}</span><span class="tt-name">${safeName}</span><span class="tt-count" title="${row.n} basket members${row.members.length !== row.n ? ` · ${row.members.length} members incl. vehicles` : ''}">·${row.n}</span>${tag}</th>
      ${cellsFor(row, esc).map(cell => `<td class="tt-${cell.key}${cell.cls ? ` ${cell.cls}` : ''}" title="${esc(cell.title)}">${esc(cell.text)}</td>`).join('')}
    </tr>`;
}

function memberRole(member) {
  const role = member.category === 'ML' ? 'ML' : member.category === 'SC' ? 'SC VEHICLE' : 'CLASS ?';
  return [role, member.taggedOnly ? 'TAGGED ONLY' : null, member.provisional ? 'PROVISIONAL' : null, member.row ? null : 'NO QUOTE'].filter(Boolean).join(' · ');
}

function memberTableMarkup(row, helpers, sessionDate) {
  const { esc } = helpers;
  const ordered = [...row.ml, ...row.unknownClass, ...row.sc];
  const roleRank = member => (member.category === 'ML' ? 3 : member.category == null ? 2 : 1);
  return `<div class="tt-members-wrap" role="region" aria-label="${esc(row.name)} members" tabindex="0">
    <table class="tt-members" data-theme-members="${esc(row.name)}"><caption class="sr-only">${esc(row.name)} members</caption>
      <thead><tr><th scope="col">TICKER</th><th scope="col">PRICE</th><th scope="col">1D</th><th scope="col">3D</th><th scope="col">D</th><th scope="col">BB</th><th scope="col" class="ema8-key">8EMA</th><th scope="col" title="${esc(ATR5D_TITLE)}">ATR/5D</th><th scope="col">RVOL</th><th scope="col">MCAP</th><th scope="col">AS OF</th></tr></thead>
      <tbody data-default-sort="role">${ordered.map(member => {
        const r = member.row;
        const pos = finite(r?.bb_position);
        const out = r ? helpers.bbOutsideLabel(r) : '';
        const bandText = pos == null && !out ? '—' : `${pos == null ? '—' : `${pos.toFixed(0)}%`}${out ? ` OUT ${out}` : ''}`;
        const ret3 = r ? closesReturn(r, 3) : null;
        const rvol = finite(r?.volume_ratio);
        const at = r ? quoteAt(r) : null;
        const stale = r && sessionDate && quoteSession(r) !== sessionDate;
        const sortValues = {
          name: member.ticker,
          role: roleRank(member),
          change: numeric(r?.change_pct),
          price: numeric(r?.price),
          ret3,
          d: numeric(r?.d_count) == null ? null : Math.max(0, Math.trunc(numeric(r.d_count))),
          bb: bandSortValue(r, { position: true }),
          ema8: numeric(r?.ema8_dist),
          atr5d: r ? atr5dValue(r) : null,
          rvol,
          mcap: numeric(r?.market_cap),
          asof: at ? Date.parse(at) : null,
        };
        return `<tr data-sort-values="${esc(JSON.stringify(sortValues))}" class="${r ? '' : 'tt-noquote'}">
          <th scope="row"><button type="button" data-ticker="${esc(member.ticker)}" data-theme-member="${esc(row.name)}" title="Chart ${esc(member.ticker)}">${esc(member.ticker)}</button><small>${esc(memberRole(member))}</small></th>
          <td>${r ? esc(helpers.fmtPrice(r.price)) : '—'}</td>
          <td class="${toneClass(r?.change_pct)}">${signed(r?.change_pct)}</td>
          <td class="${signClass(ret3)}">${signed(ret3)}</td>
          <td title="${esc(r ? helpers.runTitle(r) : 'No quote')}">${esc(r ? helpers.runLabel(r) : '—')}</td>
          <td title="Bollinger position: 0% lower band, 100% upper band">${esc(bandText)}</td>
          <td class="tt-ema8 ${signClass(r?.ema8_dist)}">${signed(r?.ema8_dist)}</td>
          <td title="${esc(r ? atr5dTitle(r) : 'No quote')}">${r ? formatAtr5d(r) : '—'}</td>
          <td>${rvol == null ? '—' : `${rvol.toFixed(1)}×`}</td>
          <td>${r && finite(r.market_cap) != null ? `$${esc(helpers.fmtCompact(r.market_cap))}` : '—'}</td>
          <td class="${stale ? 'tt-stale' : ''}">${r ? (at ? `${esc(stale ? `${etShortDate(at) || ''} ` : '')}${esc(etTime(at) || '—')}` : '—') : 'NO QUOTE'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function heatMarkup(row, helpers) {
  const tileHelpers = { esc: helpers.esc, fmtSigned: helpers.fmtSigned, fmtPrice: helpers.fmtPrice, fmtCompact: helpers.fmtCompact, runLabel: helpers.runLabel, bandLabel: helpers.bandLabel };
  const mapMembers = row.scBasket ? row.basket : [...row.ml, ...row.unknownClass];
  const strip = row.scBasket ? [] : [...row.sc].sort((a, b) => Math.abs(finite(b.row?.change_pct) ?? -Infinity) - Math.abs(finite(a.row?.change_pct) ?? -Infinity));
  const tiles = mapMembers.length ? layoutStructureTiles(mapMembers) : [];
  const map = tiles.length
    ? `<div class="theme-box-map" style="height:${mapHeightFor(mapMembers.length)}px">${tiles.map(tile => tileMarkup(tile, tileHelpers)).join('')}</div>`
    : '<div class="theme-box-map empty"><span>No members to map.</span></div>';
  const vehicles = strip.length
    ? `<div class="theme-box-vehicles"><small>SC VEHICLES · ${strip.length}</small><div>${strip.map(member => vehicleChip(member, tileHelpers)).join('')}</div></div>`
    : row.scBasket ? '' : '<div class="theme-box-vehicles none"><small>NO SC VEHICLE ON THE BOARD</small></div>';
  return `<div class="tt-heat"><div class="theme-row-map-label"><span>MEMBER HEAT</span><small>1D % · sized by capped market cap</small></div>${map}${vehicles}</div>`;
}

/** Default chart ticker: the member with the largest |1D|. */
export function defaultChartTicker(row) {
  const pool = (row.members || []).filter(member => finite(member.row?.change_pct) != null);
  pool.sort((a, b) => Math.abs(finite(b.row.change_pct)) - Math.abs(finite(a.row.change_pct)));
  return pool[0]?.ticker || row.members?.[0]?.ticker || null;
}

function expandMarkup(row, helpers, sessionDate, chartTf) {
  const safe = helpers.esc(row.name);
  const tfs = [['2m', '2M'], ['10m', '10M'], ['D', 'D']];
  return `<tr class="tt-expand" data-theme-expand="${safe}"><td colspan="${THEME_TABLE_COLUMNS.length}">
      <div class="tt-expand-grid">
        <div class="tt-left">
          ${memberTableMarkup(row, helpers, sessionDate)}
          <section class="tt-chart" aria-label="${safe} member chart">
            <div class="tt-chart-head"><strong data-theme-row-chart-title="${safe}">—</strong>
              <span class="tt-chart-tabs chart-tabs">${tfs.map(([tf, label]) => `<button type="button" data-theme-row-tf="${tf}" class="${chartTf === tf ? 'active' : ''}"${tf === '2m' ? ' title="Delayed rail is not execution"' : ''}>${label}</button>`).join('')}</span>
              <small data-theme-row-chart-note="${safe}"></small></div>
            <div class="tt-chart-legend" aria-hidden="true"><span class="ema8-key">8EMA</span><span class="bb-key">BB</span></div>
            <div class="chart-host theme-chart-host tt-chart-host" data-theme-row-chart="${safe}"><div class="loading-card">Select a member to chart.</div></div>
          </section>
        </div>
        ${heatMarkup(row, helpers)}
      </div>
    </td></tr>`;
}

/**
 * helpers: { esc, fmtSigned, fmtPrice, fmtCompact, runLabel, runTitle, bandLabel, bbOutsideLabel }
 * options: { sort, openName, sessionDate, chartTf, freshness, captions: [] }
 */
export function renderThemeTable(rows, helpers, { sort = null, openName = null, sessionDate = null, chartTf = 'D', freshness = '', captions = [] } = {}) {
  const { esc } = helpers;
  const ordered = sortThemeRows(rows, sort);
  const body = ordered.map(row => {
    const open = !row.failed && row.name === openName;
    try {
      return `<tbody class="tt-group${open ? ' open' : ''}">${rowMarkup(row, esc, open)}${open ? expandMarkup(row, helpers, sessionDate, chartTf) : ''}</tbody>`;
    } catch (error) {
      if (typeof helpers.onRowError === 'function') helpers.onRowError(row.name, error);
      return `<tbody class="tt-group">${rowMarkup({ name: row.name, failed: true, error: error instanceof Error ? error.message : String(error) }, esc, false)}</tbody>`;
    }
  }).join('');
  return `<section class="theme-table-surface" aria-label="Themes table">
    <p class="tt-freshness" data-theme-table-freshness>${esc(freshness)}</p>
    <div class="tt-wrap"><table class="theme-table"><caption class="sr-only">One row per theme; click a row to expand its members, heat map and chart</caption>
      ${headerMarkup(sort, esc)}${body}
    </table></div>
    ${captions.length ? `<p class="tt-caption">${captions.map(esc).join(' · ')}</p>` : ''}
  </section>`;
}
