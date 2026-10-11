// THEMES · theme x timeframe matrix + treemap (V2.18.0).
// Renders ./data/themes-matrix.json (built offline by scripts/build-themes-matrix-snapshot.mjs).
// Every member move is a daily-bar close-to-close move at the RTH close; a group move is the equal-weight mean of its
// members' moves on those same bars; "vs IWM" = group move - IWM move, so the printed formula adds up.
// Gold = fill / outline only (a name at a 1-yr 8EMA-stretch extreme), never text. Times are MT. No scores, no grades.
import { squarify } from './mr-map.mjs?v=V2.17.2';

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

const d4 = (v, scale, fmt = fmtPct) => {
  if (!finite(v)) return '<td class="tx-n tx-na">n/a</td>';
  return `<td class="tx-n tx-d4 ${cls(v)}"><span>${fmt(v)}</span><i style="width:${(Math.min(1, Math.abs(v) / scale) * 100).toFixed(0)}%"></i></td>`;
};
const d4span = (v, scale, fmt = fmtPct) => (finite(v) ? `<span class="tx-d4s ${cls(v)}"><span>${fmt(v)}</span><i style="width:${(Math.min(1, Math.abs(v) / scale) * 100).toFixed(0)}%"></i></span>` : 'n/a');
const pbar = (p) => (finite(p) ? `<span class="tx-pb ${isExt(p) ? 'x' : ''}"><span class="tx-pbt"><i style="left:${Math.max(0, Math.min(100, p)).toFixed(1)}%"></i></span><b>${p.toFixed(1)}%</b></span>` : 'n/a');
function bars(vals, w = 90, h = 22) {
  const mx = Math.max(...vals.map((v) => Math.abs(v ?? 0)), 0.01); const bw = w / vals.length;
  return `<svg class="tx-sb" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" class="tx-z"/>${vals.map((v, i) => { const hh = (Math.abs(v ?? 0) / mx) * (h / 2 - 1); return `<rect x="${(i * bw + 0.6).toFixed(1)}" y="${(v >= 0 ? h / 2 - hh : h / 2).toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.max(0.8, hh).toFixed(1)}" class="${v >= 0 ? 'bu' : 'bd'}"/>`; }).join('')}</svg>`;
}
const ruleText = (t) => {
  if (t.rule_a) return `<span class="tx-rk on">MEETS L(a)</span> ${fmtU(t.ratio)} @ ${fmtU(t.rvol)} RVOL`;
  if (t.rule_b) return `<span class="tx-rk on">MEETS L(b)</span> ${fmtU(t.ratio)} @ ${fmtU(t.rvol)} RVOL`;
  if (t.rule_build3) return `<span class="tx-rk on">MEETS 3-DAY</span> sum ${fmtPct(t.sum3)}`;
  return `<span class="tx-rk">BELOW</span> ${fmtU(t.ratio)} @ ${fmtU(t.rvol)} RVOL`;
};
const whyHtml = (t) => (t.why.kind === 'NEWS'
  ? `<span class="tx-why"><span class="tx-wk">NEWS</span><span class="tx-wt">${esc(t.why.ticker)} · ${esc(t.why.text)}</span><span class="tx-ws">${esc(t.why.src)} · ${esc(t.why.at)}</span></span>`
  : `<span class="tx-why"><span class="tx-wk">PRICE</span><span class="tx-wt">${esc(t.why.text)}</span></span>`);
const tfVal = (t, tf, mode) => (mode === 'vs' ? t.vs[tf] : t[tf]);
const erTagHtml = (e) => (!e ? '' : e.status === 'CONFIRMED' ? ` <span class="tx-tag" title="${esc(e.ticker)} · company date">ER ≤${e.days}d</span>` : ` <span class="tx-tag" title="${esc(e.ticker)} · no company date yet">ER est. ~${e.days}d</span>`);
const extRow = (t) => t.top && isExt(t.top.p252);

function drawerHtml(t, iwm) {
  const mem = [...t.members].sort((a, b) => (b.d1 ?? -1e9) - (a.d1 ?? -1e9));
  return `<div class="tx-dr"><div><div class="tx-sk">${esc(t.name.toUpperCase())} · WHY IT IS (OR IS NOT) LIT · THEMES SPEC L(a) / L(b)</div>
<div class="tx-ex"><div>x = equal-weight member move <b>${fmtPct(t.d1)}</b> − IWM <b>${fmtPct(iwm.d1)}</b> = <b>${fmtPct(t.x)}</b> · normal swing (median |x|, prior 20 sessions) <b>${finite(t.swing) ? t.swing.toFixed(2) + '%' : 'n/a'}</b> · x ÷ swing <b>${fmtU(t.ratio)}</b> · member RVOL mean <b>${fmtU(t.rvol)}</b></div>
<div>L(a) needs ≥2.0× on ≥1.3× RVOL → <b>${t.rule_a ? 'MEETS' : 'NO'}</b> · L(b) needs ≥2.5× on ≥0.9× → <b>${t.rule_b ? 'MEETS' : 'NO'}</b> · 3-day build: 3-day sum ${fmtPct(t.sum3)} vs 3× swing ${finite(t.swing) ? (3 * t.swing).toFixed(2) + '%' : 'n/a'} → <b>${t.rule_build3 ? 'MEETS' : 'NO'}</b> (uses today's RVOL)</div><div>${whyHtml(t)}</div>
${t.n_priced < t.n ? `<div>${t.n - t.n_priced} of ${t.n} members have no daily bars and are left out of every mean.</div>` : ''}</div></div>
<table class="tx-t tx-mini"><thead><tr><th class="l">NAME</th><th>1D</th><th>3D</th><th>5D</th><th>20D</th><th>RVOL</th><th>×ATR 8EMA</th><th>1-YR PCTILE</th><th>BB</th><th>MKT CAP</th></tr></thead><tbody>${mem.map((m) => `<tr class="${isExt(m.p252) ? 'ext' : ''}"><td class="l"><b>${esc(m.t)}</b></td>${d4(m.d1, 10)}${d4(m.d3, 12)}${d4(m.d5, 15)}${d4(m.d20, 25)}<td class="tx-n">${fmtU(m.rvol, 1)}</td>${d4(m.xatr, 3, fmtX)}<td class="tx-n">${pbar(m.p252)}</td><td class="tx-n">${m.touch ? `${esc(m.bb)} ${esc(m.touch)}` : esc(m.bb ?? 'n/a')}</td><td class="tx-n">${fmtCap(m.cap)}</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderMatrix(data, { mode = 'abs', open = null } = {}) {
  const T = [...data.themes].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)); const I = data.iwm;
  const vsCol = mode === 'vs';
  const row = (t) => `<tr class="tx-row ${extRow(t) ? 'ext' : ''} ${open === t.name ? 'open' : ''}" data-tx-theme="${esc(t.name)}" tabindex="0" aria-expanded="${open === t.name}"><td class="l"><b>${esc(t.name)}</b> <span class="tx-k">${t.n_priced === t.n ? `${t.n} names` : `${t.n_priced} of ${t.n} priced`}</span>${erTagHtml(t.er)}</td>
${['d1', 'd3', 'd5', 'd20'].map((tf) => d4(tfVal(t, tf, mode), TF_SCALE[tf])).join('')}
${d4(t.x, 5)}<td class="tx-n">${finite(t.swing) ? t.swing.toFixed(2) + '%' : 'n/a'}</td><td class="tx-n ${t.ratio >= 2 ? 'b' : ''}">${fmtU(t.ratio)}</td><td class="tx-n">${fmtU(t.rvol)}</td><td class="l tx-rule">${ruleText(t)}</td>
<td class="tx-n">${t.up_bb} <span class="tx-k">UBB</span> · ${t.dn_bb} <span class="tx-k">LBB</span></td>
<td class="tx-n ${extRow(t) ? 'extc' : ''}">${t.top ? `<b>${esc(t.top.t)}</b> ${d4span(t.top.xatr, 3, fmtX)} <span class="tx-k">${finite(t.top.p252) ? t.top.p252.toFixed(1) + '%' : 'n/a'}</span>` : 'n/a'}</td>
<td class="tx-n">${bars(t.xs)}</td><td class="l tx-whyc">${whyHtml(t)}</td></tr>${open === t.name ? `<tr class="tx-drawer"><td colspan="14" class="l">${drawerHtml(t, I)}</td></tr>` : ''}`;
  const card = (t) => `<div class="tx-card ${extRow(t) ? 'ext' : ''}" data-tx-theme="${esc(t.name)}"><div class="tx-ch"><b>${esc(t.name)}</b><span class="tx-k">${t.n} names</span></div><div class="tx-g">${['d1', 'd3', 'd5', 'd20'].map((tf) => `<div><em>${TF_LABEL[tf]}${vsCol ? ' vs IWM' : ''}</em>${d4span(tfVal(t, tf, mode), TF_SCALE[tf])}</div>`).join('')}<div><em>x ÷ SWING</em>${fmtU(t.ratio)}</div><div><em>RVOL</em>${fmtU(t.rvol)}</div></div><div class="tx-pr">${ruleText(t)}</div>${t.why.kind === 'NEWS' ? whyHtml(t) : ''}</div>`;
  return `<div class="tx-tw tx-wide"><table class="tx-t tx-mx"><thead><tr><th class="l">THEME</th><th>1D${vsCol ? ' vs IWM' : ''}</th><th>3D${vsCol ? ' vs IWM' : ''}</th><th>5D${vsCol ? ' vs IWM' : ''}</th><th>20D${vsCol ? ' vs IWM' : ''}</th><th>1D vs IWM (x)</th><th>SWING</th><th>x ÷ SWING</th><th>RVOL</th><th class="l">LIGHTING RULE · L(a) 2.0×@1.3× · L(b) 2.5×@0.9×</th><th>BB TAGS</th><th>MOST STRETCHED · 1-YR PCTILE</th><th>x · 21 SESSIONS</th><th class="l">WHY IT MOVED</th></tr>
<tr class="tx-iwm"><td class="l">IWM (benchmark)</td>${['d1', 'd3', 'd5', 'd20'].map((tf) => d4(I[tf], TF_SCALE[tf])).join('')}<td colspan="9"></td></tr></thead><tbody>${T.map(row).join('')}</tbody></table></div><div class="tx-cards">${T.map(card).join('')}</div>`;
}

export function renderTreemap(data, { color = 'd1', narrow = false } = {}) {
  const W = narrow ? 380 : 1880, H = narrow ? 900 : 620; const mode = TREE_MODES[color];
  const key = color === 'xatr' ? 'xatr' : color;
  const outer = squarify(data.themes.map((t) => ({ id: t.name, v: 1, t })), 0, 0, W, H);
  const fit = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(3, n - 1))}…`);
  let s = `<svg class="tx-tm" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Theme treemap, colour ${esc(mode.label)}">`;
  for (const o of outer) {
    const groupVal = color === 'xatr' ? null : o.t[color];
    s += `<rect x="${o.x + 1}" y="${o.y + 1}" width="${Math.max(0, o.w - 2)}" height="${Math.max(0, o.h - 2)}" fill="#0b0c0d" stroke="#2c3036"/><text x="${o.x + 5}" y="${o.y + 13}" class="tx-th">${esc(fit(o.t.name.toUpperCase(), Math.floor((o.w - 10) / 7) - 7))}${groupVal != null ? ` ${fmtPct(groupVal, 1)}` : ''}</text>`;
    const inner = squarify(o.t.members.filter((m) => m.priced).map((m) => ({ id: m.t, v: Math.sqrt(m.cap || 2e8), m })), o.x + 2, o.y + 18, o.w - 4, o.h - 22);
    for (const i of inner) {
      const v = i.m[key]; const k = Math.min(1, Math.abs(v ?? 0) / mode.scale);
      const fill = !finite(v) ? '#1b1d20' : v >= 0 ? `rgba(81,192,131,${(0.1 + k * 0.6).toFixed(2)})` : `rgba(225,114,114,${(0.12 + k * 0.62).toFixed(2)})`;
      const ex = isExt(i.m.p252);
      s += `<rect x="${(i.x + 0.5).toFixed(1)}" y="${(i.y + 0.5).toFixed(1)}" width="${Math.max(0, i.w - 1).toFixed(1)}" height="${Math.max(0, i.h - 1).toFixed(1)}" fill="${fill}" ${ex ? 'stroke="#e4b76e" stroke-width="2"' : 'stroke="#000"'}><title>${esc(i.m.t)} · ${mode.label} ${esc(mode.fmt(v))} · cap ${fmtCap(i.m.cap)}</title></rect>`;
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

const ui = { view: 'matrix', mode: 'abs', color: 'd1', open: null };
let cache = null;
export function renderShell(data, state, { narrow = false, today } = {}) {
  const fresh = freshness(data, today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }));
  const tg = (key, val, items) => `<span class="tx-toggle" role="group">${items.map(([v, l]) => `<button type="button" data-tx-${key}="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</span>`;
  const body = state.view === 'matrix' ? renderMatrix(data, { mode: state.mode, open: state.open }) : renderTreemap(data, { color: state.color, narrow });
  return `<section class="breadth-panel tx-panel" aria-labelledby="txTitle">
<div class="breadth-panel-head"><div><div class="book-kicker">THEME × TIMEFRAME · ${data.themes.length} THEMES · EQUAL-WEIGHT MEMBER MOVES · SORTED BY x ÷ SWING</div><h3 id="txTitle">Who is moving, how unusual it is, and how stretched the names are</h3></div>
<div class="tx-ctl">${tg('view', state.view, [['matrix', 'MATRIX'], ['tree', 'TREEMAP']])} ${state.view === 'matrix' ? tg('mode', state.mode, [['abs', 'ABSOLUTE %'], ['vs', 'vs IWM']]) : tg('color', state.color, Object.entries(TREE_MODES).map(([k, v]) => [k, v.label]))}</div></div>
<p class="tx-stamp">Member moves from daily bars at the RTH close, <b>${esc(dShort(data.session))} 14:00 MT</b> · membership from the themes table, updated ${esc(mtStamp(data.themes_updated_at))} · group 1D / 3D / 5D / 20D = equal-weight mean of member % moves on those bars · vs IWM = group − IWM (IWM ${fmtPct(data.iwm.d1)} 1D) · <span class="tx-fb tx-fb-${fresh.toLowerCase()}">${fresh}</span></p>
<p class="breadth-definition">x = theme 1D move minus IWM. Swing = the theme's median |x| over the prior 20 sessions. The rule column applies the THEMES spec (L(a) 2.0× on 1.3× RVOL · L(b) 2.5× on 0.9× · 3-day build) to these bars. Gold outline / row fill = the name sits at a 1-yr 8EMA-stretch extreme (≤5th or ≥95th pctile). Click a theme for its members and the formula. ${state.view === 'tree' ? 'Theme tiles equal size; names sized by √ market cap.' : ''}</p>
<div class="tx-body">${body}</div></section>`;
}
export async function mountThemesMatrix(host, { dataUrl = './data/themes-matrix.json', today } = {}) {
  if (!host) return;
  try {
    if (!cache) { const res = await fetch(dataUrl, { cache: 'no-cache' }); if (!res.ok) throw new Error(`themes-matrix.json ${res.status}`); cache = await res.json(); }
    const narrow = () => (host.clientWidth || window.innerWidth) < 700;
    let wasNarrow = narrow();
    const paint = () => { host.innerHTML = renderShell(cache, ui, { narrow: narrow(), today }); };
    paint();
    host.onclick = (ev) => {
      const b = ev.target.closest('button[data-tx-view],button[data-tx-mode],button[data-tx-color]');
      if (b) { if (b.dataset.txView) ui.view = b.dataset.txView; if (b.dataset.txMode) ui.mode = b.dataset.txMode; if (b.dataset.txColor) ui.color = b.dataset.txColor; paint(); return; }
      const tr = ev.target.closest('tr[data-tx-theme]'); if (tr) { const n = tr.dataset.txTheme; ui.open = ui.open === n ? null : n; paint(); }
    };
    host.onkeydown = (ev) => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const tr = ev.target.closest?.('tr[data-tx-theme]'); if (tr) { ev.preventDefault(); tr.click(); } };
    window.addEventListener('resize', () => { const n = narrow(); if (n !== wasNarrow) { wasNarrow = n; if (ui.view === 'tree') paint(); } });
  } catch (error) {
    host.innerHTML = `<section class="breadth-panel"><div class="loading-card">Theme matrix unavailable: ${esc(error?.message || String(error))}</div></section>`;
  }
}
