// THEMES · theme x timeframe matrix + treemap (V2.18.0).
// Renders ./data/themes-matrix.json (built offline by scripts/build-themes-matrix-snapshot.mjs).
// Every member move is a daily-bar close-to-close move at the RTH close; a group move is the equal-weight mean of its
// members' moves on those same bars; "vs IWM" = group move - IWM move, so the printed formula adds up.
// Gold = fill / outline only (a name at a 1-yr 8EMA-stretch extreme), never text. Times are MT. No scores, no grades.
import { squarify } from './mr-map.mjs?v=V2.19.0';

const MINUS = '−';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function signed(v, d, unit) {
  if (!finite(v)) return 'n/a';
  const r = Number(Math.abs(v).toFixed(d));
  return r === 0 ? `${(0).toFixed(d)}${unit}` : `${v > 0 ? '+' : MINUS}${r.toFixed(d)}${unit}`;
}
export const fmtPct = (v, d = 2) => signed(v, d, '%');
export const fmtX = (v, d = 2) => signed(v, d, '×');
export const fmtU = (v, d = 2) => (finite(v) ? `${v.toFixed(d)}×` : 'n/a');
const fmtCap = (v) => (!finite(v) ? 'n/a' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const cls = (v) => (!finite(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');
const isExt = (p) => finite(p) && (p <= 5 || p >= 95);
export const TF_LABEL = { d1: '1D', d3: '3D', d5: '5D', d20: '20D' };
const TF_SCALE = { d1: 5, d3: 8, d5: 10, d20: 15 };
export const TREE_MODES = { d1: { label: '1D %', scale: 6, fmt: (v) => fmtPct(v, 1) }, d5: { label: '5D %', scale: 12, fmt: (v) => fmtPct(v, 1) }, xatr: { label: '×ATR 8EMA', scale: 2.5, fmt: (v) => fmtX(v, 1) } };

// Board skin v2 (Oct 19 2026): markup uses the shared .sk kit (terminal-skin.css): .head .read .strip .tile .panel .t .db .pc .chip .seg details.deep.
const bw = (v, scale) => (Math.min(1, Math.abs(v) / scale) * 100).toFixed(0);
const d4 = (v, scale, fmt = fmtPct, opt = false) => {
  const o = opt ? ' opt' : '';
  if (!finite(v)) return `<td class="t2${o}">n/a</td>`;
  return `<td class="${cls(v)}${o}"><span class="db ${cls(v)}"><span>${fmt(v)}</span><i style="width:${bw(v, scale)}%"></i></span></td>`;
};
const d4span = (v, scale, fmt = fmtPct) => (finite(v) ? `<span class="db ${cls(v)}"><span class="${cls(v)}">${fmt(v)}</span><i style="width:${bw(v, scale)}%"></i></span>` : 'n/a');
const pbar = (p) => (finite(p) ? `<span class="pc ${isExt(p) ? 'ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>` : 'n/a');
function bars(vals, w = 90, h = 22) {
  const mx = Math.max(...vals.map((v) => Math.abs(v ?? 0)), 0.01); const bw = w / vals.length;
  return `<svg class="tx-sb" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" class="tx-z"/>${vals.map((v, i) => { const hh = (Math.abs(v ?? 0) / mx) * (h / 2 - 1); return `<rect x="${(i * bw + 0.6).toFixed(1)}" y="${(v >= 0 ? h / 2 - hh : h / 2).toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.max(0.8, hh).toFixed(1)}" class="${v >= 0 ? 'bu' : 'bd'}"/>`; }).join('')}</svg>`;
}
const ruleText = (t) => {
  if (t.rule_a) return `<span class="chip">Meets L(a)</span> ${fmtU(t.ratio)} on ${fmtU(t.rvol)} RVOL`;
  if (t.rule_b) return `<span class="chip">Meets L(b)</span> ${fmtU(t.ratio)} on ${fmtU(t.rvol)} RVOL`;
  if (t.rule_build3) return `<span class="chip">Meets 3-day</span> sum ${fmtPct(t.sum3)}`;
  return `<span class="t2">Below</span> ${fmtU(t.ratio)} on ${fmtU(t.rvol)} RVOL`;
};
const whyHtml = (t) => (t.why.kind === 'NEWS'
  ? `<span class="chip">News</span> ${esc(t.why.ticker)} · ${esc(t.why.text)}<small>${esc(t.why.src)} · ${esc(t.why.at)}</small>`
  : `<span class="chip">Price</span> ${esc(t.why.text)}`);
const tfVal = (t, tf, mode) => (mode === 'vs' ? t.vs[tf] : t[tf]);
const erTagHtml = (e) => (!e ? '' : e.status === 'CONFIRMED' ? `<span class="chip" title="${esc(e.ticker)} · company date">ER ≤${e.days}d</span>` : `<span class="chip" title="${esc(e.ticker)} · no company date yet">ER est. ~${e.days}d</span>`);
const extRow = (t) => t.top && isExt(t.top.p252);
const ruleMet = (t) => t.rule_a || t.rule_b || t.rule_build3;
const ruleName = (t) => [t.rule_a && 'L(a)', t.rule_b && 'L(b)', t.rule_build3 && '3-day'].filter(Boolean).join(' + ');
const namesTxt = (t) => (t.n_priced === t.n ? `${t.n} names` : `${t.n_priced} of ${t.n} priced`);

function drawerHtml(t, iwm) {
  const mem = [...t.members].sort((a, b) => (b.d1 ?? -1e9) - (a.d1 ?? -1e9));
  return `<div class="grid2 xgrid"><div><p class="sub"><b>${esc(t.name)}</b> · why it is (or is not) lit · themes spec L(a) / L(b)</p>
<p class="note">x = equal-weight member move <b>${fmtPct(t.d1)}</b> − IWM <b>${fmtPct(iwm.d1)}</b> = <b>${fmtPct(t.x)}</b> · normal swing (median |x|, prior 20 sessions) <b>${finite(t.swing) ? t.swing.toFixed(2) + '%' : 'n/a'}</b> · x ÷ swing <b>${fmtU(t.ratio)}</b> · member RVOL mean <b>${fmtU(t.rvol)}</b></p>
<p class="note">L(a) needs ≥2.0× on ≥1.3× RVOL → <b>${t.rule_a ? 'meets' : 'no'}</b> · L(b) needs ≥2.5× on ≥0.9× → <b>${t.rule_b ? 'meets' : 'no'}</b> · 3-day build: 3-day sum ${fmtPct(t.sum3)} vs 3× swing ${finite(t.swing) ? (3 * t.swing).toFixed(2) + '%' : 'n/a'} → <b>${t.rule_build3 ? 'meets' : 'no'}</b> (uses today's RVOL)</p><p class="note">${whyHtml(t)}</p>
${t.n_priced < t.n ? `<p class="note">${t.n - t.n_priced} of ${t.n} members have no daily bars and are left out of every mean.</p>` : ''}</div>
<div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>1D</th><th class="opt">3D</th><th>5D</th><th class="opt">20D</th><th class="opt">RVOL</th><th>×ATR 8EMA</th><th>1-yr pctile</th><th class="opt">BB</th><th class="opt">Mkt cap</th></tr></thead><tbody>${mem.map((m) => `<tr class="${isExt(m.p252) ? 'ext' : ''}"><th scope="row">${esc(m.t)}</th>${d4(m.d1, 10)}${d4(m.d3, 12, fmtPct, true)}${d4(m.d5, 15)}${d4(m.d20, 25, fmtPct, true)}<td class="opt">${fmtU(m.rvol, 1)}</td>${d4(m.xatr, 3, fmtX)}<td>${pbar(m.p252)}</td><td class="opt">${m.touch ? `${esc(m.bb)} ${esc(m.touch)}` : esc(m.bb ?? 'n/a')}</td><td class="opt">${fmtCap(m.cap)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

export function renderMatrix(data, { mode = 'abs', open = null } = {}) {
  const T = [...data.themes].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)); const I = data.iwm;
  const vsCol = mode === 'vs';
  const vs = vsCol ? ' vs IWM' : '';
  const row = (t) => `<tr class="click ${extRow(t) ? 'ext' : ''} ${open === t.name ? 'open' : ''}" data-tx-theme="${esc(t.name)}" tabindex="0" aria-expanded="${open === t.name}"><th scope="row">${esc(t.name)}${erTagHtml(t.er)}<small>${namesTxt(t)}</small></th>
${['d1', 'd3', 'd5', 'd20'].map((tf) => d4(tfVal(t, tf, mode), TF_SCALE[tf], fmtPct, tf === 'd3' || tf === 'd20')).join('')}
${d4(t.x, 5)}<td class="opt">${finite(t.swing) ? t.swing.toFixed(2) + '%' : 'n/a'}</td><td>${fmtU(t.ratio)}</td><td class="opt">${fmtU(t.rvol)}</td><td class="l opt">${ruleText(t)}</td>
<td class="opt">${t.up_bb} UBB · ${t.dn_bb} LBB</td>
<td class="${extRow(t) ? 'extc' : ''}">${t.top ? `<b>${esc(t.top.t)}</b> ${d4span(t.top.xatr, 3, fmtX)}<small>${finite(t.top.p252) ? t.top.p252.toFixed(1) + '% 1-yr pctile' : 'n/a'}</small>` : 'n/a'}</td>
<td class="opt">${bars(t.xs)}</td><td class="l w opt">${whyHtml(t)}</td></tr>${open === t.name ? `<tr class="xrow"><td colspan="14">${drawerHtml(t, I)}</td></tr>` : ''}`;
  return `<div class="tw"><table class="t tx-mx"><thead><tr><th class="l">Theme</th><th>1D${vs}</th><th class="opt">3D${vs}</th><th>5D${vs}</th><th class="opt">20D${vs}</th><th>1D vs IWM<small>x</small></th><th class="opt">Swing</th><th>x ÷ swing</th><th class="opt">RVOL</th><th class="l opt">Lighting rule<small>L(a) 2.0× on 1.3× · L(b) 2.5× on 0.9×</small></th><th class="opt">BB tags</th><th>Most stretched<small>×ATR 8EMA · 1-yr pctile</small></th><th class="opt">x · 21 sessions</th><th class="l opt">Why it moved</th></tr></thead>
<tbody><tr class="base"><th scope="row">IWM (benchmark)</th>${['d1', 'd3', 'd5', 'd20'].map((tf) => d4(I[tf], TF_SCALE[tf], fmtPct, tf === 'd3' || tf === 'd20')).join('')}<td colspan="9"></td></tr>${T.map(row).join('')}</tbody></table></div>`;
}

export function renderTreemap(data, { color = 'd1', narrow = false } = {}) {
  const W = narrow ? 380 : 1880, H = narrow ? 900 : 620; const mode = TREE_MODES[color];
  const key = color === 'xatr' ? 'xatr' : color;
  const outer = squarify(data.themes.map((t) => ({ id: t.name, v: 1, t })), 0, 0, W, H);
  const fit = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(3, n - 1))}…`);
  let s = `<svg class="tx-tm" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Theme treemap, colour ${esc(mode.label)}">`;
  for (const o of outer) {
    const groupVal = color === 'xatr' ? null : o.t[color];
    s += `<rect x="${o.x + 1}" y="${o.y + 1}" width="${Math.max(0, o.w - 2)}" height="${Math.max(0, o.h - 2)}" fill="#202428" stroke="#30353a"/><text x="${o.x + 5}" y="${o.y + 13}" class="tx-th">${esc(fit(o.t.name, Math.floor((o.w - 10) / 7) - 7))}${groupVal != null ? ` ${fmtPct(groupVal, 1)}` : ''}</text>`;
    const inner = squarify(o.t.members.filter((m) => m.priced).map((m) => ({ id: m.t, v: Math.sqrt(m.cap || 2e8), m })), o.x + 2, o.y + 18, o.w - 4, o.h - 22);
    for (const i of inner) {
      const v = i.m[key]; const k = Math.min(1, Math.abs(v ?? 0) / mode.scale);
      const fill = !finite(v) ? '#272c31' : v >= 0 ? `rgba(81,192,131,${(0.1 + k * 0.6).toFixed(2)})` : `rgba(225,114,114,${(0.12 + k * 0.62).toFixed(2)})`;
      const ex = isExt(i.m.p252);
      s += `<rect x="${(i.x + 0.5).toFixed(1)}" y="${(i.y + 0.5).toFixed(1)}" width="${Math.max(0, i.w - 1).toFixed(1)}" height="${Math.max(0, i.h - 1).toFixed(1)}" fill="${fill}" ${ex ? 'stroke="#e4b76e" stroke-width="2"' : 'stroke="#191c1f"'}><title>${esc(i.m.t)} · ${mode.label} ${esc(mode.fmt(v))} · cap ${fmtCap(i.m.cap)}</title></rect>`;
      if (i.w > (narrow ? 30 : 38) && i.h > 16) s += `<text x="${(i.x + i.w / 2).toFixed(1)}" y="${(i.y + i.h / 2 + (i.h > 32 ? -1 : 4)).toFixed(1)}" text-anchor="middle" class="tx-tt">${esc(i.m.t)}</text>`;
      if (i.w > 52 && i.h > 32) s += `<text x="${(i.x + i.w / 2).toFixed(1)}" y="${(i.y + i.h / 2 + 12).toFixed(1)}" text-anchor="middle" class="tx-tv">${esc(mode.fmt(v))}</text>`;
    }
  }
  return `${s}</svg>`;
}

export function freshness(data, nowDate) {
  // STALE when the bar session is older than the previous weekday (no holiday table: weekday arithmetic only)
  const d = new Date(`${nowDate}T12:00:00Z`); let back = 1; d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) { d.setUTCDate(d.getUTCDate() - 1); back++; }
  return data.session >= d.toISOString().slice(0, 10) ? 'FRESH' : 'STALE';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dShort = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${MON[m - 1]} ${dd}`; };
const mtStamp = (iso) => { if (!iso) return 'n/a'; const dt = new Date(iso); return `${dt.toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric' })}, ${dt.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hour12: false })} MT`; };

// ---------- quick view (board skin v2): read sentence, 5 tiles, leading themes + most stretched names ----------
const QUICK_ROWS = 12;
const MR_ROWS = 10;
export function stretchedNames(data, n = MR_ROWS) {
  const by = new Map();
  for (const t of data.themes) for (const m of t.members) {
    if (!m.priced || !finite(m.xatr)) continue;
    const cur = by.get(m.t);
    if (cur) { if (!cur.themes.includes(t.name)) cur.themes.push(t.name); } else by.set(m.t, { ...m, themes: [t.name] });
  }
  return [...by.values()].sort((a, b) => Math.abs(b.xatr) - Math.abs(a.xatr)).slice(0, n);
}
export function quickModel(data) {
  const T = [...data.themes].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const lit = T.filter(ruleMet);
  const uniq = new Map();
  for (const t of data.themes) for (const m of t.members) if (m.priced && !uniq.has(m.t)) uniq.set(m.t, m);
  const priced = [...uniq.values()];
  const ext = priced.filter((m) => isExt(m.p252));
  const top = stretchedNames(data, 1)[0] || null;
  return { T, lit, priced, ext, top, lead: T[0] || null };
}
export function renderQuick(data, { fresh = 'FRESH' } = {}) {
  const q = quickModel(data); const I = data.iwm; const day = dShort(data.session);
  const topTheme = q.top ? q.top.themes.join(', ') : '';
  const litTxt = q.lit.length ? `${q.lit.length} of ${data.themes.length} themes meet a lighting rule on ${esc(day)}: ${q.lit.map((t) => `<b>${esc(t.name)}</b> (${ruleName(t)})`).join(', ')}.` : `No theme meets a lighting rule on ${esc(day)}.`;
  const leadTxt = q.lead ? ` Biggest move against its own normal swing: <b>${esc(q.lead.name)} ${fmtPct(q.lead.x)} vs IWM</b>, ${fmtU(q.lead.ratio)} its ${finite(q.lead.swing) ? q.lead.swing.toFixed(2) + '%' : 'n/a'} swing. IWM ${fmtPct(I.d1)} on the day.` : '';
  const extTxt = q.ext.length ? ` ${q.ext.length} of ${q.priced.length} names sit at a 1-yr 8EMA-stretch extreme; the most stretched is <b>${esc(q.top.t)} ${fmtX(q.top.xatr)} ATR</b> (${finite(q.top.p252) ? q.top.p252.toFixed(1) + '% 1-yr pctile' : 'n/a'}).` : ' No name sits at a 1-yr 8EMA-stretch extreme.';
  const read = `<p class="read${q.ext.length ? ' ext' : ''}">${litTxt}${leadTxt}${extTxt}</p>`;
  const tile = (k, v, s, extra = '') => `<div class="tile${extra}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const strip = `<div class="strip">
${tile('Themes lit', `${q.lit.length} <small>of ${data.themes.length}</small>`, q.lit.length ? esc(q.lit.map((t) => `${t.name} ${ruleName(t)}`).join(' · ')) : 'none meet L(a), L(b) or 3-day')}
${q.lead ? tile('Biggest move vs swing', `${fmtU(q.lead.ratio)}`, `${esc(q.lead.name)} ${fmtPct(q.lead.x)} vs IWM · swing ${finite(q.lead.swing) ? q.lead.swing.toFixed(2) + '%' : 'n/a'}`) : ''}
${tile('IWM 1D', `<span class="${cls(I.d1)}">${fmtPct(I.d1)}</span>`, `5D ${fmtPct(I.d5)} · 20D ${fmtPct(I.d20)}`)}
${q.top ? tile('Most stretched name', `<span class="${cls(q.top.xatr)}">${fmtX(q.top.xatr)}</span> <small>ATR</small>`, `${esc(q.top.t)} · ${esc(topTheme)} · ${finite(q.top.p252) ? q.top.p252.toFixed(1) + '% 1-yr pctile' : 'n/a'}`, ` mr${isExt(q.top.p252) ? ' ext' : ''}`) : ''}
${tile('Names at a 1-yr stretch extreme', `${q.ext.length} <small>of ${q.priced.length}</small>`, '≤5th or ≥95th 1-yr pctile of ×ATR vs 8EMA')}
</div>`;
  const lead = q.T.slice(0, QUICK_ROWS).map((t) => `<tr class="${extRow(t) ? 'ext' : ''}"><th scope="row">${esc(t.name)}${ruleMet(t) ? `<span class="chip">${ruleName(t)}</span>` : ''}${erTagHtml(t.er)}<small>${namesTxt(t)}</small></th>${d4(t.d1, TF_SCALE.d1)}${d4(t.d5, TF_SCALE.d5, fmtPct, true)}${d4(t.x, 5)}<td>${fmtU(t.ratio)}</td><td class="opt">${fmtU(t.rvol)}</td><td>${t.top ? `<b>${esc(t.top.t)}</b> ${d4span(t.top.xatr, 3, fmtX)}` : 'n/a'}</td><td class="opt">${t.top ? pbar(t.top.p252) : 'n/a'}</td></tr>`).join('');
  const panelA = `<section class="panel"><h2>Leading themes</h2><p class="sub">Top ${Math.min(QUICK_ROWS, q.T.length)} of ${q.T.length} by move ÷ normal swing · ${esc(day)} close · gold row = its most stretched name is at a 1-yr extreme</p><div class="tw"><table class="t"><thead><tr><th class="l">Theme</th><th>1D</th><th class="opt">5D</th><th>1D vs IWM<small>x</small></th><th>x ÷ swing</th><th class="opt">RVOL</th><th>Most stretched<small>×ATR 8EMA</small></th><th class="opt">1-yr pctile</th></tr></thead><tbody>${lead}</tbody></table></div></section>`;
  const mr = stretchedNames(data).map((m) => `<tr class="${isExt(m.p252) ? 'ext' : ''}"><th scope="row">${esc(m.t)}<small>${esc(m.themes.join(', '))}</small></th>${d4(m.xatr, 3, fmtX)}<td>${pbar(m.p252)}</td>${d4(m.d1, 10)}${d4(m.d5, 15, fmtPct, true)}<td class="opt">${fmtU(m.rvol, 1)}</td></tr>`).join('');
  const panelB = `<section class="panel"><h2>Mean-reversion lens: most stretched names vs 8EMA</h2><p class="sub">Top ${MR_ROWS} theme members by |×ATR from the 8EMA| · 1-yr percentile of that stretch · gold row = ≤5th or ≥95th</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>×ATR 8EMA</th><th>1-yr pctile</th><th>1D</th><th class="opt">5D</th><th class="opt">RVOL</th></tr></thead><tbody>${mr}</tbody></table></div><p class="note">Descriptive, not an edge claim. Stretch = (close − 8EMA) ÷ ATR on daily bars at the ${esc(day)} close; the matrix file has no forward-return history, so no "what happened next" column.</p></section>`;
  return `${read}${strip}<div class="grid2 wide-left">${panelA}${panelB}</div>`;
}

const ui = { view: 'matrix', mode: 'abs', color: 'd1', open: null, deep: false };
let cache = null;
export function renderShell(data, state, { narrow = false, today } = {}) {
  const fresh = freshness(data, today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }));
  const tg = (key, val, items) => `<span class="seg" role="group">${items.map(([v, l]) => `<button type="button" class="${val === v ? 'on' : ''}" data-tx-${key}="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</span>`;
  const body = state.view === 'matrix' ? renderMatrix(data, { mode: state.mode, open: state.open }) : renderTreemap(data, { color: state.color, narrow });
  const head = `<div class="head"><h1>Themes</h1><span class="meta">Member moves from daily bars at the RTH close ${esc(dShort(data.session))}, 14:00 MT · membership updated ${esc(mtStamp(data.themes_updated_at))} · built ${esc(mtStamp(data.generated_at))}</span>${fresh === 'STALE' ? `<span class="status">Stale: last bars ${esc(dShort(data.session))}</span>` : ''}</div>`;
  const deep = `<details class="deep" data-tx-deep${state.deep ? ' open' : ''}><summary>Deep view <span>all ${data.themes.length} themes × 1D / 3D / 5D / 20D · lighting rule · BB tags · 21-session x · why it moved · treemap · members per theme · rotation engine · hit tape</span></summary><div class="body">
<section class="sec panel tx-panel" aria-labelledby="txTitle" data-sk-label="Theme matrix"><h2 id="txTitle">Theme × timeframe: who is moving, how unusual it is, and how stretched the names are</h2>
<p class="sub">${data.themes.length} themes · equal-weight member moves · sorted by x ÷ swing · group 1D / 3D / 5D / 20D = equal-weight mean of member % moves on those bars · vs IWM = group − IWM (IWM ${fmtPct(data.iwm.d1)} 1D)</p>
<p class="tx-ctl">${tg('view', state.view, [['matrix', 'Matrix'], ['tree', 'Treemap']])} ${state.view === 'matrix' ? tg('mode', state.mode, [['abs', 'Absolute %'], ['vs', 'vs IWM']]) : tg('color', state.color, Object.entries(TREE_MODES).map(([k, v]) => [k, v.label]))}</p>
<div class="tx-body">${body}</div>
<p class="note">x = theme 1D move minus IWM. Swing = the theme's median |x| over the prior 20 sessions. The rule column applies the themes spec (L(a) 2.0× on 1.3× RVOL · L(b) 2.5× on 0.9× · 3-day build) to these bars. Gold outline / row fill = the name sits at a 1-yr 8EMA-stretch extreme (≤5th or ≥95th pctile). Click a theme for its members and the formula.${state.view === 'tree' ? ' Theme tiles equal size; names sized by √ market cap.' : ''}</p></section></div></details>`;
  return `<div class="sk">${head}${renderQuick(data, { fresh })}${deep}</div>`;
}
export async function mountThemesMatrix(host, { dataUrl = './data/themes-matrix.json', today } = {}) {
  if (!host) return;
  try {
    if (!cache) { const res = await fetch(dataUrl, { cache: 'no-cache' }); if (!res.ok) throw new Error(`themes-matrix.json ${res.status}`); cache = await res.json(); }
    const narrow = () => (host.clientWidth || window.innerWidth) < 700;
    let wasNarrow = narrow();
    // One Deep view for the whole tab: the rotation engine (#themeBoard) and the hit tape (#themeTapeDisclosure) are parked back in the section before each repaint, then moved into the Deep view body (app.js keeps its element references, so their state survives).
    const rail = ['themeBoard', 'themeTapeDisclosure'];
    const paint = () => {
      const d = host.querySelector('details[data-tx-deep]'); if (d) ui.deep = d.open;
      const sec = host.parentElement; for (const id of rail) { const n = document.getElementById(id); if (n && n.parentElement !== sec) sec.appendChild(n); }
      host.innerHTML = renderShell(cache, ui, { narrow: narrow(), today });
      const body = host.querySelector('details[data-tx-deep] > .body'); if (body) for (const id of rail) { const n = document.getElementById(id); if (n) { n.dataset.skLabel = id === 'themeBoard' ? 'Rotation engine' : 'Hit tape'; body.appendChild(n); } }
    };
    paint();
    // keep Deep view open across repaints (toggle does not bubble: capture it)
    host.addEventListener('toggle', (ev) => { if (ev.target?.matches?.('details[data-tx-deep]')) ui.deep = ev.target.open; }, true);
    host.onclick = (ev) => {
      const b = ev.target.closest('button[data-tx-view],button[data-tx-mode],button[data-tx-color]');
      if (b) { if (b.dataset.txView) ui.view = b.dataset.txView; if (b.dataset.txMode) ui.mode = b.dataset.txMode; if (b.dataset.txColor) ui.color = b.dataset.txColor; paint(); return; }
      const tr = ev.target.closest('tr[data-tx-theme]'); if (tr) { const n = tr.dataset.txTheme; ui.open = ui.open === n ? null : n; paint(); }
    };
    host.onkeydown = (ev) => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const tr = ev.target.closest?.('tr[data-tx-theme]'); if (tr) { ev.preventDefault(); tr.click(); } };
    window.addEventListener('resize', () => { const n = narrow(); if (n !== wasNarrow) { wasNarrow = n; if (ui.view === 'tree') paint(); } });
  } catch (error) {
    host.innerHTML = `<div class="sk"><p class="note">Theme matrix unavailable: ${esc(error?.message || String(error))}</p></div>`;
  }
}
