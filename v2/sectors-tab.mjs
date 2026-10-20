// SECTORS tab, V2.18.0: relative-strength quadrant with tails, heat map, Stretch Watch and the
// 2-year-window columns. Pure read-only renderer. Inputs:
//   model  = buildSectorModel(...) from sector-board.mjs (live sector_board_runs rows)
//   snap   = ./data/sectors-2y.json (built offline by scripts/build-sectors-regime-snapshot.mjs)
// The page computes nothing here beyond layout; every number is a stored raw value.
// Display laws: no dim text, units on every number, gold = fill/edge only (never text),
// red only inside heat cells / bars, all-black surface, times in MT, raw values (no scores).
// The quadrant uses plain % returns vs IWM (no normalised ratios).

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
export const pct = (v, dp = 2) => (finite(v) == null ? '—' : `${sgn(v)}${Math.abs(v).toFixed(dp)}%`);
export const xx = (v, dp = 2) => (finite(v) == null ? '—' : `${sgn(v)}${Math.abs(v).toFixed(dp)}×`);
const isExt = (p) => finite(p) != null && (p <= 5 || p >= 95);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dshort = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return '—';
  return `${DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${MON[+m[2] - 1]} ${+m[3]}`;
};
export const dmd = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : '—'; };
export function mtStamp(iso) {
  const ms = Date.parse(iso ?? ''); if (!Number.isFinite(ms)) return '—';
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  return `${f} MT`;
}
const f1 = (v) => (finite(v) == null ? '—' : `${v.toFixed(1)}%`);
export const cls = (v) => (finite(v) == null || v === 0 ? '' : v > 0 ? 'tt-up' : 'tt-down');

import { marketSessionClock, previousTradingSession, tradingSessionGap } from './market-calendar.mjs';

/** The most recent COMPLETED NYSE session at nowMs (today only after close + 15 min). */
export function expectedBarSession(nowMs = Date.now()) {
  const c = marketSessionClock(nowMs); if (!c) return null;
  return c.completed ? c.sessionDate : previousTradingSession(c.sessionDate, false);
}
/** FRESH only when the snapshot's last session is the last completed session. sessionsBehind counts missing sessions. */
export function barsFreshness(asOf, nowMs = Date.now()) {
  const expected = expectedBarSession(nowMs);
  if (!asOf || !expected) return { fresh: false, expected, sessionsBehind: null, today: false };
  const behind = asOf >= expected ? 0 : tradingSessionGap(asOf, expected);
  const c = marketSessionClock(nowMs);
  return { fresh: behind === 0, expected, sessionsBehind: behind, today: asOf === c?.date };
}
/** 'today' only when the reading really is from today's session; otherwise 'on Tue Oct 6'. */
export function dayWord(asOf, nowMs = Date.now()) {
  return barsFreshness(asOf, nowMs).today ? 'today' : `on ${dshort(asOf)}`;
}

export function badge(src, stamp, status, note = '') {
  return `<span class="sx-fb sx-fb-${status.toLowerCase()}"><b>${esc(src)}</b><span>${esc(stamp)}</span><em>${esc(status)}</em>${note ? `<span class="sx-fbn">${esc(note)}</span>` : ''}</span>`;
}
export function pbar(p, w = 58) {
  if (finite(p) == null) return '<span class="sx-pbw"><b class="sx-pbn">—</b></span>';
  return `<span class="sx-pbw"><span class="sx-pb${isExt(p) ? ' sx-pbx' : ''}" style="width:${w}px"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b class="sx-pbn">${p.toFixed(1)}%</b></span>`;
}

/** Merge the offline 2-yr values onto the live board rows (keys are sortable). */
export function enrichRows(rows, snap) {
  const T = snap?.tickers || {};
  return rows.map((r) => {
    const s = T[r.ticker];
    return s ? { ...r, x20_pct: s.x20, x20_pctile: s.x20Pctile, stretch_x: s.stretch, stretch_pctile: s.stretchPctile } : { ...r, x20_pct: null, x20_pctile: null, stretch_x: null, stretch_pctile: null };
  });
}

export function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.v, 0); const area = w * h;
  const scaled = items.map((i) => ({ ...i, a: (i.v / total) * area })).sort((a, b) => b.a - a.a);
  const out = []; let rect = { x, y, w, h }; let row = [];
  const worst = (r, side) => { const s = r.reduce((q, i) => q + i.a, 0); const mx = Math.max(...r.map((i) => i.a)), mn = Math.min(...r.map((i) => i.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  const layout = (r) => {
    const s = r.reduce((q, i) => q + i.a, 0);
    if (rect.w >= rect.h) { const cw = s / rect.h; let yy = rect.y; for (const i of r) { const hh = i.a / cw; out.push({ ...i, x: rect.x, y: yy, w: cw, h: hh }); yy += hh; } rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h }; }
    else { const rh = s / rect.w; let xx2 = rect.x; for (const i of r) { const ww = i.a / rh; out.push({ ...i, x: xx2, y: rect.y, w: ww, h: rh }); xx2 += ww; } rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh }; }
  };
  for (const it of scaled) { const side = Math.min(rect.w, rect.h); if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it); else { layout(row); row = [it]; } }
  if (row.length) layout(row);
  return out;
}

const niceStep = (span) => (span > 60 ? 10 : span > 24 ? 5 : span > 10 ? 2 : 1);
/** Quadrant: X = 20-session return vs IWM (%), Y = 5-session return vs IWM (%); tails = 20/15/10/5 sessions ago. */
export function quadrantSvg(items, W, H, tailTickers) {
  const pts = items.flatMap((r) => r.tail.map((q) => [q.x, q.y]));
  const xs = pts.map((p) => p[0]).filter(finite), ys = pts.map((p) => p[1]).filter(finite);
  // domain from the central mass (5th-95th of the displayed points) so one outlier cannot flatten the chart
  const q = (a, f) => { const s = [...a].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
  let X0 = Math.min(q(xs, 0.03), -2), X1 = Math.max(q(xs, 0.97), 2), Y0 = Math.min(q(ys, 0.03), -2), Y1 = Math.max(q(ys, 0.97), 2);
  const sx0 = niceStep(X1 - X0), sy0 = niceStep(Y1 - Y0);
  X0 = Math.floor(X0 / sx0) * sx0; X1 = Math.ceil(X1 / sx0) * sx0; Y0 = Math.floor(Y0 / sy0) * sy0; Y1 = Math.ceil(Y1 / sy0) * sy0;
  const pl = 46, pr = 14, pt = 14, pb = 36;
  const clampX = (v) => Math.max(X0, Math.min(X1, v)), clampY = (v) => Math.max(Y0, Math.min(Y1, v));
  const sx = (v) => pl + ((clampX(v) - X0) / (X1 - X0)) * (W - pl - pr);
  const sy = (v) => pt + ((Y1 - clampY(v)) / (Y1 - Y0)) * (H - pt - pb);
  const lab = (v) => `${sgn(v)}${Math.abs(v)}%`;
  let s = `<svg class="sx-quad" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Relative strength vs IWM: 20-session return on the x axis, 5-session return on the y axis">`;
  s += `<rect x="${sx(0)}" y="${pt}" width="${W - pr - sx(0)}" height="${sy(0) - pt}" class="sx-q-pos"/><rect x="${pl}" y="${sy(0)}" width="${sx(0) - pl}" height="${H - pb - sy(0)}" class="sx-q-neg"/>`;
  for (let v = X0; v <= X1; v += sx0) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${pt}" y2="${H - pb}" class="sx-q-g"/><text x="${sx(v)}" y="${H - pb + 14}" class="sx-q-ax" text-anchor="middle">${lab(v)}</text>`;
  for (let v = Y0; v <= Y1; v += sy0) s += `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" class="sx-q-g"/><text x="${pl - 5}" y="${sy(v) + 4}" class="sx-q-ax" text-anchor="end">${lab(v)}</text>`;
  s += `<line x1="${sx(0)}" x2="${sx(0)}" y1="${pt}" y2="${H - pb}" class="sx-q-0"/><line x1="${pl}" x2="${W - pr}" y1="${sy(0)}" y2="${sy(0)}" class="sx-q-0"/>`;
  s += `<text x="${W - pr - 6}" y="${pt + 14}" text-anchor="end" class="sx-q-lab">Ahead on both</text><text x="${W - pr - 6}" y="${H - pb - 7}" text-anchor="end" class="sx-q-lab">20D ahead · 5D behind</text><text x="${pl + 6}" y="${H - pb - 7}" class="sx-q-lab">Behind on both</text><text x="${pl + 6}" y="${pt + 14}" class="sx-q-lab">20D behind · 5D ahead</text>`;
  s += `<text x="${(pl + W - pr) / 2}" y="${H - 4}" text-anchor="middle" class="sx-q-axl">20-session return vs IWM (%) →</text><text transform="translate(11 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" class="sx-q-axl">5-session return vs IWM (%) →</text>`;
  const inD = (p) => p.x >= X0 && p.x <= X1 && p.y >= Y0 && p.y <= Y1;
  for (const r of items) {
    if (!tailTickers.has(r.t)) continue;
    const tt = r.tail.filter((p) => finite(p.x) != null && finite(p.y) != null && inD(p));
    for (let i = 1; i < tt.length; i++) s += `<line x1="${sx(tt[i - 1].x).toFixed(1)}" y1="${sy(tt[i - 1].y).toFixed(1)}" x2="${sx(tt[i].x).toFixed(1)}" y2="${sy(tt[i].y).toFixed(1)}" class="sx-q-tail" style="opacity:${(0.25 + 0.7 * i / Math.max(1, tt.length - 1)).toFixed(2)}"/>`;
    tt.slice(0, -1).forEach((p) => { s += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="1.8" class="sx-q-td"/>`; });
  }
  const off = [];
  for (const r of items) {
    const isOff = r.X > X1 || r.X < X0 || r.Y > Y1 || r.Y < Y0;
    const x = sx(r.X), y = sy(r.Y); const tl = tailTickers.has(r.t); const ext = isExt(r.Xp);
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${tl ? 4.6 : 3.2}" class="sx-q-d ${r.vs > 0 ? 'sx-q-up' : r.vs < 0 ? 'sx-q-dn' : ''}${tl ? '' : ' sx-q-dim'}"><title>${esc(r.t)} 20D ${pct(r.X)} · 5D ${pct(r.Y)} vs IWM</title></circle>`;
    if (ext) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" class="sx-q-ext"/>`;
    if (isOff) off.push(r); else if (tl || ext) s += `<text x="${(x + 7).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="sx-q-tk">${esc(r.t)}</text>`;
  }
  off.forEach((r, i) => { s += `<text x="${W - pr - 4}" y="${pt + 30 + i * 13}" text-anchor="end" class="sx-q-off">${esc(r.t)} ${pct(r.X, 1)} / ${pct(r.Y, 1)} off-scale</text>`; });
  return `${s}</svg>`;
}

export function heatSvg(items, W, H) {
  const tiles = squarify(items.map((r) => ({ id: r.t, v: Math.sqrt(Math.max(4, r.mapped || 0)), r })), 0, 0, W, H);
  return `<svg class="sx-heat" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Heat map: today versus IWM, tile size is the square root of members mapped">${tiles.map((t) => {
    const r = t.r; const v = r.vs; const s = Math.min(1, Math.abs(v ?? 0) / 4);
    const fill = finite(v) == null ? '#15171a' : v >= 0 ? `rgba(81,192,131,${(0.12 + s * 0.55).toFixed(2)})` : `rgba(225,114,114,${(0.14 + s * 0.6).toFixed(2)})`;
    const big = t.w > 74 && t.h > 40; const ext = isExt(r.stretchP) || isExt(r.Xp);
    return `<g><rect x="${(t.x + 1).toFixed(1)}" y="${(t.y + 1).toFixed(1)}" width="${(t.w - 2).toFixed(1)}" height="${(t.h - 2).toFixed(1)}" fill="${fill}"${ext ? ' stroke="#e4b76e" stroke-width="2"' : ''}/>${t.w > 34 && t.h > 20 ? `<text x="${(t.x + t.w / 2).toFixed(1)}" y="${(t.y + t.h / 2 + (big ? -2 : 4)).toFixed(1)}" text-anchor="middle" class="sx-h-t">${esc(r.t)}</text>` : ''}${big ? `<text x="${(t.x + t.w / 2).toFixed(1)}" y="${(t.y + t.h / 2 + 13).toFixed(1)}" text-anchor="middle" class="sx-h-v">${pct(v, 2)} · ${xx(r.mx, 1)}</text>` : ''}<title>${esc(r.t)} ${pct(v)} vs IWM · ${xx(r.mx)} swing</title></g>`;
  }).join('')}</svg>`;
}

/** items for quad / heat / watch: live board rows joined to the 2-yr snapshot. */
function joinItems(model, snap) {
  const T = snap?.tickers || {};
  return model.rows.filter((r) => T[r.ticker]).map((r) => {
    const s = T[r.ticker];
    return { t: r.ticker, label: r.label, grp: r.grp, vs: finite(r.vs_iwm_pct), mx: finite(r.move_x), mapped: finite(r.mapped), X: s.x20, Y: s.y5, Xp: s.x20Pctile, stretch: s.stretch, stretchP: s.stretchPctile, tail: s.tail };
  });
}

/**
 * opts: { group: 'SECTOR'|'INDUSTRY'|'ALL' (quadrant tails), laneStatus }
 * Returns the badge row + the three-card strip (quadrant / heat map / stretch watch) + footnote.
 */
export function renderSectorsInsight(model, snap, opts = {}) {
  const run = model?.run;
  const ok = snap && snap.tickers && snap.windows && Object.keys(snap.tickers).length > 0;
  const boardFresh = opts.laneStatus === undefined || opts.laneStatus === 'fresh';
  const badges = [];
  if (run) badges.push(badge('Sector board', `run ${esc(run.session)} · ${model.rows.length} ETFs`, boardFresh ? 'FRESH' : 'STALE', run.map_version ? `map ${run.map_version}` : ''));
  if (ok) {
    // FRESH only if the snapshot's last session is the last completed NYSE session right now.
    const fr = barsFreshness(snap.as_of, opts.nowMs ?? Date.now());
    const behind = !fr.fresh;
    badges.push(badge('Daily bars', `through ${dshort(snap.as_of)} · ${snap.source.sessions} sessions from ${dmd(snap.source.first)} ${snap.source.first.slice(0, 4)}`, behind ? 'STALE' : 'FRESH', behind ? `${fr.sessionsBehind ?? '?'} session(s) behind ${fr.expected ?? 'the calendar'}; rebuild the snapshot` : `built ${mtStamp(snap.generated_at)} · rebuilt by hand`));
  } else badges.push(badge('Daily bars', 'snapshot unavailable', 'GAP', '2-yr columns, quadrant and stretch watch are off'));
  const badgeRow = `<div class="sx-fbrow">${badges.join('')}</div>`;
  if (!ok || !run) return `<section class="sx-insight">${badgeRow}<div class="error-state">2-year relative-strength snapshot unavailable. Unknown remains unknown.</div></section>`;

  const W = snap.windows;
  const items = joinItems(model, snap);
  const group = opts.group || 'SECTOR';
  const shown = group === 'ALL' ? items : items.filter((r) => r.grp === group);
  const tailSet = new Set(shown.map((r) => r.t));
  const quadItems = group === 'ALL' ? items : shown;
  const extremes = items.filter((r) => isExt(r.Xp) || isExt(r.stretchP)).sort((a, b) => Math.max(Math.abs(b.Xp - 50), Math.abs(b.stretchP - 50)) - Math.max(Math.abs(a.Xp - 50), Math.abs(a.stretchP - 50)));
  const tog = (g, label) => `<button type="button" data-sector-quad="${g}" aria-pressed="${g === group}">${label}</button>`;
  const nSec = items.filter((r) => r.grp === 'SECTOR').length, nInd = items.filter((r) => r.grp === 'INDUSTRY').length;
  const bench = ['SPY', 'QQQ', 'IWM'].map((t) => snap.bench?.[t] ? `${t} ${xx(snap.bench[t].stretch)} (${f1(snap.bench[t].stretchPctile)})` : '').filter(Boolean).join(' · ');
  return `<section class="sx-insight">${badgeRow}
  <div class="sx-grid">
    <div class="sx-card"><div class="sx-ch"><div><div class="sx-k">RELATIVE STRENGTH vs IWM · 5-SESSION STEPS</div><h2>Who is leading the small-cap benchmark</h2></div><div class="sx-tog" role="group" aria-label="Quadrant group">${tog('SECTOR', `SECTORS ${nSec}`)}${tog('INDUSTRY', `INDUSTRIES ${nInd}`)}${tog('ALL', 'ALL')}</div></div>
      <p class="sx-sub">Dot = latest bar (${esc(dshort(snap.as_of))} close). Tail = where it sat 5, 10, 15 and 20 sessions ago, fading with age. Top-right = ahead of IWM on both windows. Gold ring = 20-session relative return at or beyond its 5th / 95th pctile of the last ${W.pctileSessions} sessions. Plain % returns, not normalised ratios.</p>${quadrantSvg(quadItems, 600, 440, tailSet)}</div>
    <div class="sx-card"><div class="sx-ch"><div><div class="sx-k">HEAT MAP · TODAY vs IWM</div><h2>Rotation at a glance</h2></div></div>
      <p class="sx-sub">Size = √ members mapped · colour = today's move minus IWM's (green above, red below) · gold outline = a ${W.pctileSessions}-session stretch or relative-strength extreme.</p>${heatSvg(items, 640, 440)}</div>
    <div class="sx-card"><div class="sx-k">Stretch watch · MR lens</div><h2>At an extreme vs its own history</h2>
      <p class="sx-sub">Every ETF at or beyond the 5th / 95th pctile on either primitive, 20-session returns run to the ${esc(dshort(snap.as_of))} close; ranked within the last ${W.pctileSessions} sessions (${W.xWindowN} valid for 20-session returns, ${W.stretchWindowN} for ×ATR). Raw values; no grade.</p>
      <div class="sx-tw"><table class="sx-mini"><thead><tr><th class="l">ETF</th><th>20D vs IWM</th><th>Pctile</th><th>×ATR 8ema</th><th>Pctile</th></tr></thead><tbody>${extremes.length ? extremes.map((r) => `<tr class="sx-ext"><td class="l"><b>${esc(r.t)}</b> <span class="sx-lbl">${esc(r.label ?? '')}</span></td><td class="${cls(r.X)}">${pct(r.X)}</td><td>${f1(r.Xp)}</td><td class="${cls(r.stretch)}">${xx(r.stretch)}</td><td>${f1(r.stretchP)}</td></tr>`).join('') : '<tr><td colspan="5" class="l">No ETF is at an extreme on either primitive today.</td></tr>'}</tbody></table></div>
      <p class="sx-sub" style="margin-top:8px">Benchmarks, ×ATR from the 8EMA (${W.pctileSessions}-session pctile): ${esc(bench)}.</p></div>
  </div></section>`;
}

export function renderSectorsFootnote(snap) {
  if (!snap?.windows) return '';
  const W = snap.windows;
  return `<details class="sx-foot" open><summary><b>Sources &amp; definitions</b></summary>
    <b>Board numbers</b> (TODAY, VS IWM, × SWING, RVOL, 5D, 20D, members, 20-session strip): the live <code>sector_board_runs</code> run, unchanged.
    <b>New primitives</b> (20D / 5D vs IWM, tails, ×ATR vs 8EMA, pctiles): computed offline from daily bars, ${snap.source.sessions} sessions ${esc(snap.source.first)} → ${esc(snap.source.last)}. Relative return = (ETF ÷ IWM) now vs N sessions ago. ×ATR = (close − EMA8) ÷ Wilder ATR14.
    <b>Pctile</b> = share of the last ${W.pctileSessions} sessions (about 2 years; ranked only against sessions up to the reading day) at or below the reading. EMA8 / ATR14 warm-up is ${W.warmupSessions}+ sessions deep before the window starts.
    <b>Not on this tab yet:</b> the why-it-moved catalyst tag (needs the news feed ported into the board build), the 8-K item tags (filings feed stale since Sep 1) and the heat-map colour modes.</details>`;
}
