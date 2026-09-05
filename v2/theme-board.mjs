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

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
export function buildThemeBox(theme, { members = [], vehicles = [], read = null } = {}) {
  const breadth = parseBreadth(theme?.breadth);
  const mov1d = finite(theme?.mov_1d);
  const mov3d = finite(theme?.mov_3d);
  const structure = members.filter(member => member.category === 'ML');
  const unknownClass = members.filter(member => member.category == null);
  const curatedVehicles = members.filter(member => member.category === 'SC');
  const seen = new Set();
  const vehicleRows = [];
  for (const candidate of [...curatedVehicles.map(member => member.row).filter(Boolean), ...vehicles]) {
    const ticker = String(candidate?.ticker || '').toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    vehicleRows.push(candidate);
  }
  vehicleRows.sort((a, b) => (Math.abs(finite(b.change_pct) ?? -Infinity)) - (Math.abs(finite(a.change_pct) ?? -Infinity)));
  const cold = isColdTheme({ mov1d, mov3d, breadth });
  const upperBand = upperBandBreadth(theme?.sc_cluster === true || !structure.length ? curatedVehicles : structure);
  return {
    name: theme.name,
    theme,
    mov1d,
    mov3d,
    breadth,
    upperBand,
    story: storyLine(read),
    cold,
    heat: themeHeat(mov1d, mov3d),
    tone: moveTone(mov1d),
    structure,
    unknownClass,
    vehicles: vehicleRows,
    tiles: cold ? [] : layoutStructureTiles([...structure, ...unknownClass]),
    mapHeight: cold ? 0 : mapHeightFor(structure.length + unknownClass.length),
  };
}

export function orderThemeBoxes(boxes) {
  return [...boxes].sort(compareThemeBoxes);
}

/** Tickers a box can chart: structure, unknown-class members, and vehicles. */
export function boxTickers(box) {
  return [...box.structure, ...box.unknownClass].map(member => member.ticker)
    .concat(box.vehicles.map(row => String(row.ticker || '').toUpperCase()));
}

function tileMarkup(tile, helpers) {
  const { member } = tile;
  const row = member.row;
  const move = row?.change_pct;
  const cap = finite(row?.market_cap);
  const band = row ? helpers.bandLabel(row) : '';
  const run = row ? helpers.runLabel(row) : 'D—';
  const roleClass = member.category === 'ML' ? 'structure' : 'class-unknown';
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

function vehicleChip(row, helpers) {
  const move = row?.change_pct;
  const run = helpers.runLabel(row);
  const band = helpers.bandLabel(row);
  return `<button class="theme-member-chip vehicle ${moveTone(move)}" type="button" data-ticker="${helpers.esc(row.ticker)}" title="${helpers.esc([row.ticker, 'SC vehicle on today’s board', helpers.fmtSigned(move), run, band || null].filter(Boolean).join(' · '))}"><strong>${helpers.esc(row.ticker)}</strong><span class="theme-member-move ${finite(move) == null ? '' : finite(move) > 0 ? 'up' : finite(move) < 0 ? 'down' : ''}">${helpers.fmtSigned(move)}</span><span class="theme-member-run">${helpers.esc(run)}</span>${band ? `<span class="theme-member-band">${helpers.esc(band)}</span>` : ''}</button>`;
}

function coldChip(member, helpers) {
  const move = member.row?.change_pct;
  return `<button class="theme-cold-chip ${moveTone(move)}" type="button" data-ticker="${helpers.esc(member.ticker)}" title="${helpers.esc(`${member.ticker} · ${helpers.fmtSigned(move)} · ${member.row ? helpers.runLabel(member.row) : 'D—'}`)}"><strong>${helpers.esc(member.ticker)}</strong><span>${helpers.fmtSigned(move)}</span></button>`;
}

function boxHeader(box, helpers) {
  const breadth = box.breadth ? `${box.breadth.hot}/${box.breadth.total}` : '—';
  const age = box.story.at ? helpers.relativeTime(box.story.at) : null;
  const stamp = [age, box.story.source].filter(Boolean).join(' · ');
  return `<header class="theme-box-head">
      <button class="theme-box-title" type="button" data-theme-name="${helpers.esc(box.name)}" title="Open ${helpers.esc(box.name)}">${helpers.esc(box.name)}</button>
      <span class="theme-box-moves"><b class="${moveTone(box.mov1d)}">${helpers.fmtSigned(box.mov1d)}</b><small>1D</small><b class="${moveTone(box.mov3d)}">${helpers.fmtSigned(box.mov3d)}</b><small>3D</small></span>
      <span class="theme-box-breadth" title="ML members extended past 55 or closed outside the band, over members measured">${helpers.esc(breadth)}<small>EXTENDED</small></span>
      ${box.upperBand ? `<span class="theme-box-band-breadth" title="Members with a readable Bollinger position currently outside the upper band">${box.upperBand.outside}/${box.upperBand.measured}<small>OUT OF UBB</small></span>` : ''}
    </header>
    <p class="theme-box-story">${box.story.text ? helpers.esc(box.story.text) : '<span class="quiet-value">No current read.</span>'}${stamp ? ` <time${box.story.at ? ` datetime="${helpers.esc(box.story.at)}"` : ''}>${helpers.esc(stamp)}</time>` : ''}</p>`;
}

function memberTable(box, helpers) {
  const members = [...box.structure, ...box.unknownClass,
    ...box.vehicles.map(row => ({ticker: row.ticker, category: 'SC', row}))];
  if (!members.length) return '<p class="theme-row-empty quiet-value">Member measurements unavailable.</p>';
  return `<div class="theme-row-table-wrap" tabindex="0" role="region" aria-label="${helpers.esc(box.name)} member measurements">
    <table class="theme-row-table"><caption class="sr-only">${helpers.esc(box.name)} members and daily measurements</caption>
      <thead><tr><th scope="col">MEMBER</th><th scope="col">1D</th><th scope="col">D</th><th scope="col">BB</th><th scope="col" class="ema8-key">8EMA</th></tr></thead>
      <tbody>${members.map(member => {
        const row = member.row;
        const role = member.category === 'ML' ? 'ML' : member.category === 'SC' ? 'SC VEHICLE' : 'CLASS UNKNOWN';
        const band = row ? helpers.bandLabel(row) : '';
        const position = finite(row?.bb_position);
        const bandText = band || (position == null ? '—' : `${position.toFixed(0)}%`);
        return `<tr><th scope="row"><button type="button" data-ticker="${helpers.esc(member.ticker)}" title="Chart ${helpers.esc(member.ticker)}">${helpers.esc(member.ticker)}</button><small>${role}${member.provisional ? ' · PROVISIONAL' : ''}</small></th>
          <td class="${moveTone(row?.change_pct)}">${helpers.fmtSigned(row?.change_pct)}</td>
          <td>${helpers.esc(row ? helpers.runLabel(row) : 'D—')}</td>
          <td class="theme-row-band" title="${helpers.esc(band || (position == null ? 'Band measurement unavailable' : 'Bollinger position: 0% lower band, 100% upper band'))}">${helpers.esc(bandText)}</td>
          <td class="ma-cell">${helpers.fmtSigned(row?.ema8_dist)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function hotBox(box, helpers) {
  const tiles = box.tiles.length
    ? `<div class="theme-box-map" style="height:${box.mapHeight}px">${box.tiles.map(tile => tileMarkup(tile, helpers)).join('')}</div>`
    : '<div class="theme-box-map empty"><span class="quiet-value">ML structure unavailable.</span></div>';
  const vehicles = box.vehicles.length
    ? `<div class="theme-box-vehicles"><small>SC VEHICLES · ${box.vehicles.length}</small><div>${box.vehicles.map(row => vehicleChip(row, helpers)).join('')}</div></div>`
    : '<div class="theme-box-vehicles none"><small>NO SC VEHICLE ON THE BOARD</small></div>';
  return `<article class="theme-box hot ${box.tone}" role="group" tabindex="0" data-theme-card="${helpers.esc(box.name)}" aria-label="Open ${helpers.esc(box.name)} theme">
    <div class="theme-row-details">${boxHeader(box, helpers)}${memberTable(box, helpers)}</div>
    <div class="theme-row-heat"><div class="theme-row-map-label"><span>MEMBER HEAT</span><small>1D move · sized by capped market cap</small></div>${tiles}${vehicles}</div>
  </article>`;
}

function coldBox(box, helpers) {
  const members = [...box.structure, ...box.unknownClass];
  const chips = members.length ? members.map(member => coldChip(member, helpers)).join('') : '<span class="quiet-value">Members unavailable.</span>';
  const vehicles = box.vehicles.map(row => coldChip({ ticker: row.ticker, row }, helpers)).join('');
  return `<article class="theme-box cold ${box.tone}" role="button" tabindex="0" data-theme-card="${helpers.esc(box.name)}" aria-label="Open ${helpers.esc(box.name)} theme">
    ${boxHeader(box, helpers)}
    <div class="theme-cold-chips">${chips}${vehicles ? `<span class="theme-cold-divider" title="SC vehicles on today's board"></span>${vehicles}` : ''}</div>
  </article>`;
}

/**
 * helpers: { esc, fmtSigned, fmtPrice, fmtCompact, runLabel, bandLabel, relativeTime }
 */
export function renderThemeHeatBoard(boxes, helpers) {
  const ordered = orderThemeBoxes(boxes);
  const hot = ordered.filter(box => !box.cold);
  const cold = ordered.filter(box => box.cold);
  const hotMarkup = hot.length
    ? `<div class="theme-heat-board" aria-label="Themes with heat, hottest first">${hot.map(box => hotBox(box, helpers)).join('')}</div>`
    : '<div class="theme-heat-board empty"><div class="empty-state">No theme is moving. Every basket is flat on the day and over three sessions.</div></div>';
  const coldMarkup = cold.length
    ? `<div class="theme-cold-shelf" aria-label="Flat themes"><div class="theme-cold-shelf-head"><span>FLAT · ${cold.length}</span></div><div class="theme-cold-grid">${cold.map(box => coldBox(box, helpers)).join('')}</div></div>`
    : '';
  return hotMarkup + coldMarkup;
}
