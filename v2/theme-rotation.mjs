// THEMES rotation table (SPEC_themes_rotation.md D1–D7, V2.12.0).
//
// Reads the state of record written by the run-theme-rotation edge function
// (theme_rotation_state, one row per theme per session), its intraday/premarket/after-hours
// layer (theme_rotation_live), the promotion catalog (theme_catalog) and the AI captions
// (theme_stories). The page computes NOTHING that decides lit / rank / collapse: it only
// orders, formats and expands what the engine wrote.
//
// Display laws: no dim text; every number carries its unit (% × $); red only for a
// negative move; gold only for high-importance accents (BROAD, NEW); raw primitives only,
// no stage words, no scores. WARM on the shelf is the one state tag the spec asks for (D5).

export const TOP_N = 15;

// Board skin v2: the rotation table sits in a collapsed details.deep; remember its open state across app.js repaints.
let rotDeepOpen = false;
if (typeof document !== 'undefined') document.addEventListener('toggle', (ev) => { if (ev.target?.matches?.('details[data-rot-deep]')) rotDeepOpen = ev.target.open; }, true);

export const ROTATION_COLUMNS = Object.freeze([
  { key: 'name', label: 'Theme', title: 'Theme · the side that lit it (MC/LC or SC SWARM) · BROAD when a market-wide wave lit it' },
  { key: 'leader', label: 'Leader', title: 'MC/LC member with the biggest move in the group\'s direction, and its session % move' },
  { key: 'd1', label: '1D', title: 'Group move vs IWM, 1 session: median MC/LC member % move minus IWM % move' },
  { key: 'd3', label: '3D', title: 'Group move vs IWM over 3 sessions (median member 3-session % minus IWM\'s)' },
  { key: 'd5', label: '5D', title: 'Group move vs IWM over 5 sessions' },
  { key: 'd10', label: '10D', title: 'Group move vs IWM over 10 sessions' },
  { key: 'xs', label: '× swing', title: '|1D vs IWM| as a multiple of the group\'s normal swing (median |1D vs IWM| over the prior 20 sessions). Default order: largest first, ties by RVOL' },
  { key: 'movers', label: 'MC/LC moving', title: 'MC/LC members that moved in the group\'s direction by at least one normal swing vs IWM / MC/LC members' },
  { key: 'rvol', label: 'RVOL', title: 'Median MC/LC member volume ÷ its own 20-session average volume' },
  { key: 'days', label: 'Days lit', title: 'Consecutive sessions in the table up to this session' },
  { key: 'sc', label: 'SC sympathy', title: 'Small-cap members (< $2B) with their session % move, biggest first' },
  { key: 'ext', label: 'Gap / AH', title: 'Premarket gap % (06:00 MT run) or after-hours % (18:15 MT run): median MC/LC member' },
  { key: 'strip', label: '20 sessions', title: 'Each block is one session: bright = in the table, gold = WARM (easier re-entry), grey = off the table. Hover for the date' },
]);

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

export function signedPct(v, digits = 1) {
  const n = finite(v);
  if (n == null) return '—';
  const t = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${t === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : t}%`;
}
export function times(v, digits = 1) {
  const n = finite(v);
  return n == null ? '—' : `${n.toFixed(digits)}×`;
}
function signClass(v) {
  const n = finite(v);
  if (n == null || n === 0) return '';
  return n > 0 ? 'up' : 'dn';
}
function arrow(dir) {
  return dir === 1 ? '↑' : dir === -1 ? '↓' : '';
}
function shortDate(d) {
  const ms = Date.parse(`${d}T12:00:00Z`);
  if (!Number.isFinite(ms)) return d || '—';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

/**
 * Model for the board.
 * input: { stateRows, liveRows, stories, catalog, runs, marketRows, today }
 */
export function buildRotationModel({ stateRows = [], liveRows = [], stories = [], catalog = [], runs = [], marketRows = [], today = null } = {}) {
  const sessions = [...new Set(stateRows.map((r) => r.session))].sort();
  const session = sessions.at(-1) || null;
  const rows = stateRows.filter((r) => r.session === session);
  const byTicker = new Map();
  for (const m of Array.isArray(marketRows) ? marketRows : []) {
    const t = String(m?.ticker || '').toUpperCase();
    if (t && !byTicker.has(t)) byTicker.set(t, m);
  }
  // latest caption per theme; proposals for the Watching list
  const caption = new Map();
  const proposals = [];
  for (const s of [...stories].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    if (s.kind === 'caption' && s.theme_key && !caption.has(s.theme_key)) caption.set(s.theme_key, s);
    if (s.kind === 'proposal' && proposals.length < 20 && !proposals.some((p) => p.name === s.name)) proposals.push(s);
  }
  const live = new Map();
  for (const l of liveRows) {
    if (!live.has(l.theme_key)) live.set(l.theme_key, {});
    live.get(l.theme_key)[l.run_label] = l;
  }
  const liveDate = today || null;
  const toRow = (r) => {
    const p = r.payload || {};
    const cap = caption.get(r.theme_key) || null;
    const lv = live.get(r.theme_key) || {};
    const gap = lv['0600'] && (!liveDate || lv['0600'].session === liveDate) ? finite(lv['0600'].gap_pct) : null;
    const ah = lv['1815'] && lv['1815'].session === session ? finite(lv['1815'].ah_pct) : null;
    const intraday = ['1330', '1130', '0930'].map((k) => lv[k]).find((x) => x && liveDate && x.session === liveDate && x.session > session) || null;
    const members = (p.members || []).map((m) => {
      const mr = byTicker.get(String(m.t).toUpperCase()) || null;
      return { ticker: m.t, side: m.side, pct: finite(m.pct), rvol: finite(m.rvol), row: mr || { change_pct: finite(m.pct) }, market: mr };
    });
    return {
      name: r.theme_key, key: r.theme_key, kind: r.kind,
      label: cap?.name || r.name, engineName: r.name, why: cap?.why || null, sources: cap?.sources || [], captionAt: cap?.created_at || null,
      state: r.state, trig: r.trig, reason: r.reason, side: r.side, broad: r.broad === true, direction: r.direction,
      x: finite(r.x), swing: finite(r.swing), xs: finite(r.x_over_swing), rvol: finite(r.rvol), warmLeft: r.warm_left,
      rank: r.rank, days: r.sessions_lit, leader: p.leader || null, moves: p.moves || {}, movers: p.movers || {},
      sc: p.sc_sympathy || [], strip: p.strip || [], iwm: finite(p.iwm_pct), promo: p.promo || null, isNew: p.new_group === true,
      gap, ah, intraday, members, failed: false,
    };
  };
  const all = rows.map(toRow);
  const lit = all.filter((r) => r.state === 'LIT').sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  // intraday lighting (S2): a theme can light on any run; shown flagged until the 14:30 record
  const intradayLit = all.filter((r) => r.state !== 'LIT' && r.intraday?.lit_now && r.intraday?.reason)
    .map((r) => ({ ...r, intradayOnly: true, xs: finite(r.intraday.x_over_swing), rvol: finite(r.intraday.rvol), x: finite(r.intraday.x) }));
  const shelf = all.filter((r) => r.state !== 'LIT' && !intradayLit.some((q) => q.key === r.key))
    .sort((a, b) => (a.state === b.state ? (b.xs ?? -1) - (a.xs ?? -1) : a.state === 'WARM' ? -1 : 1));
  const recent = new Set(sessions.slice(-5));
  const newGroups = catalog.filter((c) => c.kind === 'promoted' && !c.retired_on && c.promoted_on && (recent.has(c.promoted_on) || (session && c.promoted_on >= sessions.at(-5))))
    .map((c) => ({ key: c.theme_key, label: caption.get(c.theme_key)?.name || c.name, promoted_on: c.promoted_on, story: c.story || null }))
    .sort((a, b) => String(b.promoted_on).localeCompare(String(a.promoted_on)));
  const lastRun = runs.find((x) => x.ok) || null;
  return { session, lit, intradayLit, shelf, newGroups, proposals, lastRun, broadToday: lit.some((r) => r.broad) };
}

function sortValue(row, key) {
  switch (key) {
    case 'name': return row.label;
    case 'leader': return row.leader ? Math.abs(finite(row.leader.pct) ?? 0) : null;
    case 'd1': return row.x;
    case 'd3': return finite(row.moves.d3);
    case 'd5': return finite(row.moves.d5);
    case 'd10': return finite(row.moves.d10);
    case 'xs': return row.xs;
    case 'movers': return row.movers.total ? (row.movers.moving ?? 0) / row.movers.total : null;
    case 'rvol': return row.rvol;
    case 'days': return row.days;
    case 'sc': return row.sc.length ? Math.abs(finite(row.sc[0].pct) ?? 0) : null;
    case 'ext': return row.gap ?? row.ah;
    default: return null;
  }
}

/** Default (sort null): the engine's rank (|x|/swing desc, ties rvol). Unknown values last. */
export function sortRotationRows(rows, sort = null) {
  const out = [...rows];
  if (!sort || !ROTATION_COLUMNS.some((c) => c.key === sort.key) || sort.key === 'strip') {
    return out.sort((a, b) => (a.intradayOnly ? 1 : 0) - (b.intradayOnly ? 1 : 0) || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  }
  const dir = sort.direction === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
    if (va == null && vb == null) return (a.rank ?? 1e9) - (b.rank ?? 1e9);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return dir * (typeof va === 'string' ? va.localeCompare(vb, 'en') : va - vb);
    return (a.rank ?? 1e9) - (b.rank ?? 1e9);
  });
}

function stripMarkup(strip, esc) {
  if (!strip.length) return '<span class="rot-strip-none">—</span>';
  const word = { L: 'in the table', W: 'WARM (easier re-entry)', C: 'off the table', '-': 'not in the catalog yet' };
  return `<span class="rot-strip" role="img" aria-label="${esc(`Last ${strip.length} sessions`)}">${strip.map(([d, s]) => `<i class="rot-s rot-s-${s === '-' ? 'n' : s}" title="${esc(`${shortDate(d)} · ${word[s] || s}`)}"></i>`).join('')}</span>`;
}

function tagsMarkup(row, esc) {
  const tags = [];
  if (row.intradayOnly) tags.push(`<span class="chip" title="${esc(`Lit on the ${row.intraday.run_label.slice(0, 2)}:${row.intraday.run_label.slice(2)} MT run (${row.intraday.reason}); the 14:30 MT run decides the record`)}">Lit ${esc(row.intraday.run_label.slice(0, 2))}:${esc(row.intraday.run_label.slice(2))}</span>`);
  if (row.side) tags.push(`<span class="chip" title="${row.side === 'SC SWARM' ? '3+ small-cap members moved 10%+ the same way' : 'Lit by the MC/LC members'}">${esc(row.side)}</span>`);
  if (row.broad) tags.push('<span class="chip" title="Market-wide wave: 4+ themes lit fresh the same way and IWM or QQQ moved 1.25%+">Broad</span>');
  if (row.isNew) tags.push('<span class="chip" title="Promoted into the catalog this session">New</span>');
  return tags.join('');
}

function rowMarkup(row, esc, open) {
  const safe = esc(row.name);
  const leader = row.leader ? `${esc(row.leader.t)} <span class="${signClass(row.leader.pct)}">${signedPct(row.leader.pct)}</span>` : '—';
  const mov = (v) => `<td class="${signClass(v)}">${signedPct(v)}</td>`;
  const sc = row.sc.length
    ? row.sc.slice(0, 4).map((m) => `<span class="rot-chip">${esc(m.t)} <span class="${signClass(m.pct)}">${signedPct(m.pct)}</span></span>`).join('')
    : '—';
  const ext = row.gap != null ? `Gap <span class="${signClass(row.gap)}">${signedPct(row.gap)}</span>` : row.ah != null ? `AH <span class="${signClass(row.ah)}">${signedPct(row.ah)}</span>` : '—';
  const why = row.why ? `<span class="rot-why" title="${esc(row.why)}">${esc(row.why)}</span>` : '';
  return `<tr class="tt-row rot-row${open ? ' open' : ''}" data-theme-row="${safe}" tabindex="0" aria-expanded="${open ? 'true' : 'false'}" title="${esc(row.label)} · click to ${open ? 'collapse' : 'expand'}">
    <th scope="row" class="tt-name-col rot-name"><span class="tt-chevron" aria-hidden="true">${open ? '▾' : '▸'}</span><span class="rot-dir ${row.direction === -1 ? 'dn' : row.direction === 1 ? 'up' : ''}" aria-label="${row.direction === -1 ? 'down' : 'up'}">${arrow(row.direction)}</span><span class="tt-name">${esc(row.label)}</span>${tagsMarkup(row, esc)}${why}</th>
    <td class="rot-leader">${leader}</td>
    ${mov(row.x)}${mov(row.moves.d3)}${mov(row.moves.d5)}${mov(row.moves.d10)}
    <td class="rot-xs">${times(row.xs)}</td>
    <td>${row.movers.total ? `${row.movers.moving ?? '—'}/${row.movers.total}` : '—'}</td>
    <td>${times(row.rvol)}</td>
    <td>${row.days ?? '—'}</td>
    <td class="rot-sc">${sc}</td>
    <td class="rot-ext">${ext}</td>
    <td class="rot-strip-cell">${stripMarkup(row.strip, esc)}</td>
  </tr>`;
}

function evidenceMarkup(row, esc) {
  const parts = [];
  if (row.why) {
    const src = (row.sources || []).slice(0, 6).map((s) => {
      const label = `${s.publisher || 'source'}${s.date ? ` · ${s.date}` : ''}`;
      return s.url && /^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || label)}</a> <small>${esc(label)}</small>` : `<span>${esc(s.title || label)}</span>`;
    }).join('</li><li>');
    parts.push(`<div class="rot-story"><strong>Why (AI caption · no input to the table)</strong><p>${esc(row.why)}</p>${src ? `<ul><li>${src}</li></ul>` : ''}</div>`);
  }
  if (row.promo) {
    const p = row.promo;
    const etf = (p.etf || []).map((h) => `${esc(h.etf)} <span class="${signClass(h.x)}">${signedPct(h.x)}</span> vs IWM · ${times(Math.abs(h.x_sw))} its swing · ${times(h.rvol)} volume · name word “${esc((h.words || []).join('/'))}” (${esc(shortDate(h.session))})`).join('<br>');
    const heads = (p.headlines || []).filter((h) => h.title).slice(0, 4).map((h) => `${h.url && /^https?:\/\//.test(h.url) ? `<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : esc(h.title)} <small>${esc(h.publisher || '')} · ${esc(shortDate(h.session))}</small>`).join('<br>');
    parts.push(`<div class="rot-promo"><strong>Promoted ${esc(shortDate(p.promoted_on))} · ${esc(p.trigger || '')} · ${p.route === 'etf' ? 'theme ETF move' : 'news'}</strong><p>${etf || heads || 'Evidence not stored'}</p></div>`);
  }
  return parts.join('');
}

function membersMarkup(row, helpers) {
  const { esc } = helpers;
  const members = [...row.members].sort((a, b) => (a.side === b.side ? Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) : a.side === 'MC/LC' ? -1 : 1));
  return `<div class="tt-members-wrap" role="region" aria-label="${esc(row.label)} members" tabindex="0">
    <table class="t tt-members rot-members" data-theme-members="${esc(row.name)}"><caption class="sr-only">${esc(row.label)} members</caption>
    <thead><tr><th scope="col" class="l">Ticker</th><th scope="col" class="l">Side</th><th scope="col">Session %</th><th scope="col">RVOL</th><th scope="col" class="opt">Price $</th><th scope="col" class="opt">Mkt cap $</th></tr></thead>
    <tbody>${members.map((m) => `<tr>
      <th scope="row"><button type="button" data-ticker="${esc(m.ticker)}" data-theme-member="${esc(row.name)}" title="Chart ${esc(m.ticker)}">${esc(m.ticker)}</button></th>
      <td class="l">${esc(m.side)}</td>
      <td class="${signClass(m.pct)}">${signedPct(m.pct)}</td>
      <td>${times(m.rvol)}</td>
      <td class="opt">${m.market && finite(m.market.price) != null ? esc(helpers.fmtPrice(m.market.price)) : '—'}</td>
      <td class="opt">${m.market && finite(m.market.market_cap) != null ? `$${esc(helpers.fmtCompact(m.market.market_cap))}` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function expandMarkup(row, helpers, chartTf) {
  const { esc } = helpers;
  const safe = esc(row.name);
  const tfs = [['2m', '2m'], ['10m', '10m'], ['D', 'D']];
  return `<tr class="tt-expand" data-theme-expand="${safe}"><td colspan="${ROTATION_COLUMNS.length}">
    <div class="tt-expand-grid rot-expand-grid">
      <div class="tt-left">
        ${evidenceMarkup(row, esc)}
        ${membersMarkup(row, helpers)}
      </div>
      <section class="tt-chart" aria-label="${esc(row.label)} member chart">
        <div class="tt-chart-head"><strong data-theme-row-chart-title="${safe}">—</strong>
          <span class="tt-chart-tabs chart-tabs">${tfs.map(([tf, label]) => `<button type="button" data-theme-row-tf="${tf}" class="${chartTf === tf ? 'active' : ''}"${tf === '2m' ? ' title="Delayed rail is not execution"' : ''}>${label}</button>`).join('')}</span>
          <small data-theme-row-chart-note="${safe}"></small></div>
        <div class="tt-chart-legend" aria-hidden="true"><span class="ema8-key">8EMA</span><span class="bb-key">BB</span></div>
        <div class="chart-host theme-chart-host tt-chart-host" data-theme-row-chart="${safe}"><div class="loading-card">Select a member to chart.</div></div>
      </section>
    </div></td></tr>`;
}

function headerMarkup(sort, esc) {
  return `<thead><tr>${ROTATION_COLUMNS.map((c) => {
    const active = sort?.key === c.key || (!sort && c.key === 'xs');
    const direction = sort?.key === c.key ? sort.direction : (!sort && c.key === 'xs' ? 'desc' : null);
    const arrowTxt = active ? (direction === 'asc' ? '▲' : '▼') : (c.key === 'strip' ? '' : '↕');
    const cls = c.key === 'name' ? ' class="tt-name-col"' : '';
    if (c.key === 'strip') return `<th scope="col"${cls} title="${esc(c.title)}"><span class="tt-sort rot-nosort">${esc(c.label)}</span></th>`;
    return `<th scope="col"${cls} aria-sort="${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="tt-sort" data-theme-sort="${c.key}" title="${esc(`${c.title}. Click to sort; third click restores the default order.`)}">${esc(c.label)}<span class="tt-arrow" aria-hidden="true">${arrowTxt}</span></button></th>`;
  }).join('')}</tr></thead>`;
}

function shelfMarkup(model, esc) {
  const warm = model.shelf.filter((r) => r.state === 'WARM').length;
  const rows = model.shelf.map((r) => {
    const lastLit = [...r.strip].reverse().find(([, s]) => s === 'L');
    return `<tr><th scope="row">${esc(r.label)}${r.state === 'WARM' ? ` <span class="chip" title="Collapsed after 3 quiet sessions; re-enters on half the bar (RVOL 1.15× and 1.0× swing) for ${r.warmLeft ?? '—'} more sessions">Warm · ${r.warmLeft ?? '—'} sessions left</span>` : ''}</th>
      <td class="${signClass(r.x)}">${signedPct(r.x)}</td><td>${times(r.xs)}</td><td class="opt">${times(r.rvol)}</td>
      <td class="opt">${lastLit ? esc(shortDate(lastLit[0])) : 'not in 20 sessions'}</td><td class="rot-strip-cell opt">${stripMarkup(r.strip, esc)}</td></tr>`;
  }).join('');
  const watching = model.proposals.length
    ? `<details class="rot-watch"><summary>Watching · ${model.proposals.length} AI-proposed stories (reach the table only when members light on price/volume)</summary>
        <ul>${model.proposals.map((p) => `<li><strong>${esc(p.name)}</strong> <small>${esc(shortDate(p.session))}${p.members?.length ? ` · ${esc(p.members.slice(0, 8).join(' '))}` : ''}</small>${p.why ? `<p>${esc(p.why)}</p>` : ''}${(p.sources || []).slice(0, 3).map((s) => s.url && /^https?:\/\//.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.publisher || 'source')}</a>` : '').join(' · ')}</li>`).join('')}</ul></details>`
    : '<p class="note">Watching: no AI-proposed stories yet.</p>';
  return `<details class="fold rot-shelf" data-rot-shelf><summary>Off the table<span>${model.shelf.length} themes · ${warm} warm</span></summary><div class="tw">
    <table class="t rot-shelf-table"><thead><tr><th scope="col" class="l">Theme</th><th scope="col">1D vs IWM</th><th scope="col">× swing</th><th scope="col" class="opt">RVOL</th><th scope="col" class="opt">Last in table</th><th scope="col" class="opt">20 sessions</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${watching}
  </details>`;
}

function newGroupsMarkup(model, esc) {
  if (!model.newGroups.length) return '';
  return `<div class="rot-new" aria-label="New groups"><strong>New groups</strong>${model.newGroups.map((g) => {
    const e = g.story?.etf?.[0];
    const h = (g.story?.headlines || []).find((x) => x.title);
    const ev = e ? `${e.etf} ${signedPct(e.x)} vs IWM, ${times(Math.abs(e.x_sw))} swing` : h ? h.title : '';
    return `<button type="button" class="rot-new-chip" data-theme-row="${esc(g.key)}" title="${esc(ev)}"><span class="chip">New</span> ${esc(g.label)} <small>${esc(shortDate(g.promoted_on))}</small></button>`;
  }).join('')}</div>`;
}

/**
 * helpers: { esc, fmtPrice, fmtCompact, onRowError }
 * options: { sort, openName, chartTf, showMore }
 */
export function renderRotationBoard(model, helpers, { sort = null, openName = null, chartTf = 'D', showMore = false } = {}) {
  const { esc } = helpers;
  if (!model.session) {
    return '<div class="error-state">Themes rotation has no state of record yet. The first run writes it after the 14:30 MT close run.</div>';
  }
  const ordered = sortRotationRows([...model.lit, ...model.intradayLit], sort);
  const visible = showMore ? ordered : ordered.slice(0, TOP_N);
  const hidden = ordered.length - visible.length;
  const body = visible.map((row) => {
    const open = row.name === openName;
    try {
      return `<tbody class="tt-group${open ? ' open' : ''}">${rowMarkup(row, esc, open)}${open ? expandMarkup(row, helpers, chartTf) : ''}</tbody>`;
    } catch (error) {
      helpers.onRowError?.(row.name, error);
      return `<tbody class="tt-group"><tr class="tt-row tt-failed" data-theme-row="${esc(row.name)}"><th scope="row">${esc(row.label)}</th><td colspan="${ROTATION_COLUMNS.length - 1}">row failed: ${esc(error?.message || String(error))}</td></tr></tbody>`;
    }
  }).join('');
  const more = hidden > 0 || (showMore && ordered.length > TOP_N)
    ? `<tbody><tr class="rot-more-row"><td colspan="${ROTATION_COLUMNS.length}"><button type="button" data-rot-more>${showMore ? `Show the top ${TOP_N} only` : `+${hidden} more lit`}</button></td></tr></tbody>`
    : '';
  const runAt = model.lastRun?.finished_at ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(model.lastRun.finished_at)) : null;
  const run = runAt ? ` · engine ran ${esc(runAt)} MT` : '';
  const empty = !ordered.length ? `<tbody><tr><td colspan="${ROTATION_COLUMNS.length}" class="rot-empty">No theme is lit this session. Every theme is on the shelf below.</td></tr></tbody>` : '';
  const litTxt = `${model.lit.length} lit${model.intradayLit.length ? ` · ${model.intradayLit.length} lit intraday` : ''}${model.broadToday ? ' · broad wave' : ''}`;
  const deepOpen = rotDeepOpen || Boolean(openName) || Boolean(sort) || showMore;
  return `<div class="sk"><details class="deep" data-rot-deep${deepOpen ? ' open' : ''}><summary>Rotation engine <span>${esc(litTxt)} · session of record ${esc(shortDate(model.session))} · members, evidence and a chart per theme · off-the-table shelf</span></summary><div class="body"><section class="panel theme-table-surface rot-surface" aria-label="Themes rotation" data-sk-label="Lit themes &amp; shelf">
    <h2>Rotation engine: lit themes</h2><p class="sub tt-freshness rot-head">Session of record ${esc(shortDate(model.session))}${run} · ${esc(litTxt)} · group moves are vs IWM (%) · click a row for members, evidence and chart</p>
    ${newGroupsMarkup(model, esc)}
    <div class="tw tt-wrap"><table class="t theme-table rot-table"><caption class="sr-only">Lit themes, largest move against the group's own normal swing first; click a row for members, evidence and chart</caption>
      ${headerMarkup(sort, esc)}${body}${empty}${more}
    </table></div>
    ${shelfMarkup(model, esc)}
  </section></div></details></div>`;
}
