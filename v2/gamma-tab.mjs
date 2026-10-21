// GAMMA tab V2.18.0 (GAMMA v3). Self-wiring ES module: <script type="module" src="./gamma-tab.mjs?v=V2.18.0">.
// Reads ./data/gamma.json (+ ./data/mrmap.json for the MR MAP 2-yr percentile, + the board's chart-bars 2m feed via window.radarFetchBars).
// Raw primitives only: no scores, no grades, no calls. Level lines come from OUR rules (dealer side assumed), not a vendor's.
import { hm12, mt12 } from './market-calendar.mjs';
export const VERSION = 'V2.18.0';
export const CSS = "#gammaRoot{\n  color-scheme:only dark;\n  --sans:\"Segoe UI Variable Text\",\"Segoe UI\",Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;\n  --bg:#191c1f;--panel:#191c1f;--panel2:#202428;--line:#30353a;--line2:#464b52;--line-mid:#30353a;\n  --text:#e0e5e7;--text2:#bec7cd;--green:#51c083;--red:#e17272;--gold:#e4b76e;\n  --gold-fill:rgba(228,183,110,.10);--blue-pct:#8fb0ff;\n}#gammaRoot *{box-sizing:border-box}#gammaRoot,#gammaRoot{margin:0;background:#191c1f;color:var(--text);font:500 13px/1.4 var(--sans)}#gammaRoot button,#gammaRoot select{font:inherit;color:inherit}#gammaRoot .gxl .mono{font-family:var(--sans);font-variant-numeric:tabular-nums}#gammaRoot .gxl .gx-unused{display:flex;gap:2px;align-items:stretch;border-bottom:1px solid var(--line);padding:0 10px;background:#202428;position:sticky;top:0;z-index:20;overflow-x:auto}#gammaRoot .gxl .gx-unused{padding:9px 11px 8px;font:600 13px/1 var(--sans);letter-spacing:0;color:var(--text2);border-bottom:2px solid transparent;white-space:nowrap}#gammaRoot .gxl .gx-unused{color:var(--text);border-bottom-color:var(--gold)}#gammaRoot .gxl .gx-unused{flex:1}#gammaRoot .gxl .gx-unused{align-self:center;font:600 12.5px var(--sans);color:var(--text2);white-space:nowrap;padding-left:12px}#gammaRoot .gxl .gx-unused{padding:12px 14px 30px;max-width:1920px;margin:0 auto}#gammaRoot .gxl .kick{font:600 12.5px var(--sans);letter-spacing:0;color:var(--text2);text-transform:none}#gammaRoot .gxl h1{margin:2px 0 4px;font:600 24px/1.2 var(--sans);letter-spacing:0}#gammaRoot .gxl h2{margin:0;font:600 15px/1.3 var(--sans)}#gammaRoot .gxl h2 small,#gammaRoot .gxl .h-sub{font:600 13px var(--sans);color:var(--text2);letter-spacing:0}#gammaRoot .gxl .meta{font:600 13px/1.5 var(--sans);color:var(--text2)}#gammaRoot .gxl .meta b{color:var(--text)}#gammaRoot .gxl .head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}#gammaRoot .gxl .head-main{flex:1 1 640px;min-width:0}#gammaRoot .gxl .badges{display:flex;flex-direction:column;gap:6px;flex:0 1 560px;min-width:0}#gammaRoot .gxl .fresh{border:1px solid var(--gold);border-radius:6px;padding:7px 10px;background:var(--gold-fill);font:600 13px/1.45 var(--sans);color:var(--text)}#gammaRoot .gxl .fresh .st{display:inline-block;padding:0 6px;margin-right:6px;border:1px solid var(--gold);border-radius:3px;font-weight:600;letter-spacing:0}#gammaRoot .gxl .rule{border:1px solid var(--line2);border-radius:6px;padding:7px 10px;background:var(--panel2);font:500 13px/1.45 var(--sans);color:var(--text)}#gammaRoot .gxl .rule b{font:600 12.5px var(--sans);letter-spacing:0;margin-right:6px}#gammaRoot .gxl .tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px}#gammaRoot .gxl .tile{border:1px solid var(--line);border-radius:7px;background:var(--panel);padding:8px 10px 9px;min-width:0;position:relative}#gammaRoot .gxl .tile.pick{cursor:pointer}#gammaRoot .gxl .tile.pick:hover{border-color:var(--line2)}#gammaRoot .gxl .tile.sel{border-color:#e0e5e7;box-shadow:inset 0 0 0 1px #e0e5e7}#gammaRoot .gxl .tile.gold{border-color:var(--gold)}#gammaRoot .gxl .tile.sel.gold{box-shadow:inset 0 0 0 1px var(--gold);border-color:#e0e5e7}#gammaRoot .gxl .tile .tt{display:flex;justify-content:space-between;gap:6px;font:600 13px var(--sans)}#gammaRoot .gxl .tile .tt span{font:600 12.5px var(--sans);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gammaRoot .gxl .tile .big{font:600 23px/1.2 var(--sans);margin:3px 0 2px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}#gammaRoot .gxl .tile .big small{font:600 13px var(--sans)}#gammaRoot .gxl .tile .ln{font:600 13px/1.5 var(--sans);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gammaRoot .gxl .tile .ln b{color:var(--text)}#gammaRoot .gxl .pbar{position:relative;height:5px;background:#444b52;border-radius:2px;margin:5px 0 2px}#gammaRoot .gxl .pbar i{position:absolute;top:-2px;width:2px;height:9px;background:#e0e5e7}#gammaRoot .gxl .pbar.g i{background:var(--gold);width:3px}#gammaRoot .gxl .spark{display:block;width:100%;height:30px;margin-top:4px}#gammaRoot .gxl .up{color:var(--green)}#gammaRoot .gxl .dn{color:var(--red)}#gammaRoot .gxl .panel{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px 12px;min-width:0}#gammaRoot .gxl .ph{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;justify-content:space-between;margin-bottom:6px}#gammaRoot .gxl .ph .l{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}#gammaRoot .gxl .src{font:600 12.5px var(--sans);color:var(--text2);border:1px solid var(--line2);border-radius:3px;padding:0 5px;white-space:nowrap}#gammaRoot .gxl .seg{display:inline-flex;border:1px solid var(--line2);border-radius:5px;overflow:hidden}#gammaRoot .gxl .seg button{background:transparent;border:0;padding:4px 9px;font:600 13px var(--sans);cursor:pointer;color:var(--text2);white-space:nowrap}#gammaRoot .gxl .seg button.on{background:#24272b;color:var(--text)}#gammaRoot .gxl .grid-lens{display:grid;grid-template-columns:minmax(0,1fr) 480px;gap:10px;margin-bottom:10px;align-items:start}#gammaRoot .gxl .grid-2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px;margin-bottom:10px;align-items:start}#gammaRoot .gxl .side{display:grid;gap:10px;min-width:0}#gammaRoot .gxl .legend{display:flex;flex-wrap:wrap;gap:4px 14px;font:600 13px var(--sans);color:var(--text2);margin-top:6px}#gammaRoot .gxl .legend span{white-space:nowrap;display:inline-flex;align-items:center;gap:5px}#gammaRoot .gxl .sw{display:inline-block;width:18px;height:0;border-top:2px solid}#gammaRoot .gxl .note{font:500 13px/1.45 var(--sans);color:var(--text2);margin-top:6px}#gammaRoot .gxl .note b{color:var(--text)}#gammaRoot .gxl .tw{overflow:auto;min-width:0}#gammaRoot .gxl table{border-collapse:collapse;width:100%;font:600 13px/1.25 var(--sans);font-variant-numeric:tabular-nums}#gammaRoot .gxl th,#gammaRoot .gxl td{padding:5px 7px;text-align:right;border-bottom:1px solid var(--line-mid);white-space:nowrap;color:var(--text)}#gammaRoot .gxl thead th{font:600 12.5px/1.2 var(--sans);color:var(--text2);vertical-align:bottom;position:sticky;top:0;background:var(--panel);z-index:2}#gammaRoot .gxl thead th small{display:block;font:600 12px/1.25 var(--sans);color:var(--text2)}#gammaRoot .gxl th.l,#gammaRoot .gxl td.l{text-align:left}#gammaRoot .gxl td.v{position:relative}#gammaRoot .gxl td.v i{position:absolute;right:5px;bottom:2px;height:3px;border-radius:1px;opacity:.95}#gammaRoot .gxl td.p{color:var(--green)}#gammaRoot .gxl td.n{color:var(--red)}#gammaRoot .gxl td.p i{background:var(--green)}#gammaRoot .gxl td.n i{background:var(--red)}#gammaRoot .gxl tr.goldrow td,#gammaRoot .gxl tr.goldrow th{background:var(--gold-fill)}#gammaRoot .gxl tr.goldrow th:first-child,#gammaRoot .gxl tr.goldrow td:first-child{box-shadow:inset 3px 0 0 var(--gold)}#gammaRoot .gxl td.goldcell{background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold)}#gammaRoot .gxl tr.spot td{border-bottom:1px solid #e0e5e7}#gammaRoot .gxl .role{display:inline-block;margin-left:5px;padding:0 4px;border:1px solid var(--line2);border-radius:3px;font:600 11.5px/1.45 var(--sans);letter-spacing:0;color:var(--text)}#gammaRoot .gxl .role.cw{border-color:var(--green)}#gammaRoot .gxl .role.pw{border-color:var(--red)}#gammaRoot .gxl .role.fl{border-style:dotted;border-color:#e0e5e7}#gammaRoot .gxl .bkt{display:inline-block;margin-left:5px;padding:0 4px;border:1px solid var(--line2);border-radius:3px;font:600 11.5px/1.45 var(--sans);color:var(--text)}#gammaRoot .gxl .gated{color:var(--text2);font-style:italic;font-weight:600}#gammaRoot .gxl .kv td{padding:5px 6px}#gammaRoot .gxl .kv td.l{white-space:normal;min-width:150px}#gammaRoot .gxl .stick th:first-child,#gammaRoot .gxl .stick td:first-child{position:sticky;left:0;background:var(--panel);z-index:1}#gammaRoot .gxl .stick thead th:first-child{z-index:3}#gammaRoot .gxl .stick tr.goldrow td:first-child,#gammaRoot .gxl .stick tr.goldrow th:first-child{background:#1e1a12}#gammaRoot .gxl .stick tr.selrow th:first-child{background:#1d2126}#gammaRoot .gxl .grid-b{display:grid;grid-template-columns:560px minmax(0,1fr);gap:10px;margin-bottom:10px;align-items:start}#gammaRoot .gxl .stack{display:grid;gap:10px;min-width:0}#gammaRoot .gxl .kv td.l{font:600 13px var(--sans);color:var(--text)}#gammaRoot .gxl .kv td.l small{display:block;font:600 12.5px var(--sans);color:var(--text2)}#gammaRoot .gxl .kv tr.sect td{font:600 12.5px var(--sans);letter-spacing:0;color:var(--text2);padding-top:9px;border-bottom:1px solid var(--line)}#gammaRoot .gxl .mr{border:1px solid var(--line2);border-radius:7px;background:var(--panel2);padding:8px 10px}#gammaRoot .gxl .mr h3{margin:0 0 4px;font:600 12.5px var(--sans);letter-spacing:0;color:var(--text)}#gammaRoot .gxl .mr ol{margin:0;padding-left:18px;font:500 13.5px/1.5 var(--sans)}#gammaRoot .gxl .mr li{margin:3px 0}#gammaRoot .gxl .mr li b{font-family:var(--sans)}#gammaRoot .gxl .mr .why{font:500 13px/1.4 var(--sans);color:var(--text2);margin-top:5px}#gammaRoot .gxl .ctrl{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font:600 13px var(--sans);color:var(--text2);margin-bottom:8px}#gammaRoot .gxl .ctrl label{display:inline-flex;align-items:center;gap:6px}#gammaRoot .gxl .ctrl select{background:#202428;border:1px solid var(--line2);border-radius:4px;padding:3px 6px;color:var(--text);font:600 13px var(--sans)}#gammaRoot .gxl .chart-host{background:#000;border-radius:6px;min-height:200px}#gammaRoot .gxl svg text{font-family:var(--sans)}#gammaRoot .gxl .foot{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px;font:500 13px/1.5 var(--sans);color:var(--text)}#gammaRoot .gxl .foot dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:6px 20px;margin:6px 0 0}#gammaRoot .gxl .foot dt{font:600 13px var(--sans)}#gammaRoot .gxl .foot dd{margin:1px 0 0;color:var(--text2)}#gammaRoot .gxl tr.clk{cursor:pointer}#gammaRoot .gxl tr.clk:hover td{box-shadow:inset 0 999px 0 rgba(255,255,255,.04)}#gammaRoot .gxl tr.selrow th,#gammaRoot .gxl tr.selrow td{background:#1d2126}\n\n@media (max-width:1299px){#gammaRoot .gxl .grid-lens,#gammaRoot .gxl .grid-b{grid-template-columns:minmax(0,1fr)}#gammaRoot .gxl .tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}\n@media (max-width:900px){#gammaRoot .gxl .grid-2,#gammaRoot .gxl .grid-b{grid-template-columns:minmax(0,1fr)}#gammaRoot .gxl .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media (max-width:900px){#gammaRoot .gxl .legend span,#gammaRoot .gxl .src{white-space:normal;min-width:0;max-width:100%}}\n@media (max-width:560px){#gammaRoot .gxl .gx-unused{padding:8px 8px 24px}#gammaRoot .gxl h1{font-size:20px}#gammaRoot .gxl .tiles{grid-template-columns:minmax(0,1fr)}#gammaRoot .gxl .tile .big{font-size:20px}#gammaRoot .gxl .panel{padding:8px}#gammaRoot .gxl .badges{flex-basis:100%}#gammaRoot .gxl .head-main{flex-basis:100%}#gammaRoot .gxl th,#gammaRoot .gxl td{padding:4px 5px;font-size:11.5px}#gammaRoot .gxl .seg button{padding:4px 7px}#gammaRoot .gxl .hide-n{display:none}\n}\n\n#gammaRoot{background:#191c1f;color:var(--text);font:500 13px/1.4 var(--sans);padding:12px 14px 30px;max-width:1920px;margin:0 auto}\n#gammaRoot .gxl em.bkt{font-style:normal}\n#gammaRoot .gx-err{border:1px solid var(--line2);border-radius:6px;padding:10px 12px;color:var(--text)}\n#gammaRoot .gxl input.gx-in{background:#202428;border:1px solid var(--line2);border-radius:4px;padding:3px 6px;color:var(--text);font:600 13px var(--sans);width:90px;text-transform:none}\n#gammaRoot .gxl .gx-warn{border:1px solid var(--line2);border-radius:6px;padding:7px 10px;margin-bottom:8px;font:600 13px var(--sans);color:var(--text)}\n\n/* board skin v2 (Oct 19 2026): Deep-view tables match the kit .t table; kit classes that share a legacy name must not leak in */\n#gammaRoot .gxl table{font:600 14px/1.3 var(--sans)}\n#gammaRoot .gxl th,#gammaRoot .gxl td{padding:7px 10px;border-bottom:1px solid #30353a}\n#gammaRoot .gxl thead th{font:600 12.5px/1.25 var(--sans);background:#202428;border-bottom:1px solid #444b52}\n#gammaRoot .gxl thead th small{font:400 12px/1.3 var(--sans)}\n#gammaRoot .gxl .kv td.l small{font:400 12.5px/1.3 var(--sans)}\n#gammaRoot .gxl .note{max-width:none}\n#gammaRoot .gxl .seg{padding:0;gap:0;background:transparent}\n#gammaRoot .gxl .gx-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}\n#gammaRoot .gxl .gx-head h2{margin:0 0 4px}\n#gammaRoot .sk .deep > .body.gxl{padding-top:14px}\n#gammaRoot .sk .t tbody th .chip{vertical-align:2px}\n#gammaRoot .sk .t td small{display:block}\n@media (max-width:560px){#gammaRoot .gxl th,#gammaRoot .gxl td{padding:5px 6px;font-size:12.5px}}\n";
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const flipDistX = (t) => (fin(t.flip) && fin(t.spot) && t.atr14 > 0 ? (t.flip - t.spot) / t.atr14 : null); // level minus spot, like every other distance
export function validate(doc) {
  if (!doc || typeof doc !== 'object') return 'not an object';
  if (!Array.isArray(doc.tickers) || !doc.tickers.length) return 'no tickers';
  if (typeof doc.built_at !== 'string' || !doc.levels_for_session) return 'missing built_at / levels_for_session';
  return null;
}
const ETD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function groupBars(bars, keep = 3) {
  const out = {};
  for (const x of bars || []) { if (![x.t, x.o, x.h, x.l, x.c].every(fin)) continue; (out[ETD.format(new Date(x.t))] ||= []).push([x.t, +x.o, +x.h, +x.l, +x.c, Math.round(+x.v || 0)]); }
  const days = Object.keys(out).sort().slice(-keep);
  return Object.fromEntries(days.map((d) => [d, out[d]]));
}
export function create(root, live, mm, keep = {}) {
  const ROOT = root;
  const $ = (s) => ROOT.querySelector(s);
  const BARS = keep.BARS || { cache: {}, loading: false, err: null };
  const mmCol = mm && Array.isArray(mm.cols) ? Object.fromEntries(mm.cols.map((c, i) => [c, i])) : null;
  const mmRow = mm && mmCol ? Object.fromEntries(mm.rows.map((r) => [r[0], r])) : {};
  const mmOf = (t) => { const r = mmRow[t]; if (!r || !mmCol) return null; const g = (k) => (fin(r[mmCol[k]]) ? r[mmCol[k]] : null); if (g('x') == null || g('pc') == null) return null; return { x: g('x'), pc: g('pc'), lo: g('lo'), hi: g('hi'), pn: g('pn') }; };
  const hb = Array.isArray(live.hist_builds) ? live.hist_builds : [];
  const M = { built_at: live.built_at, levels_for_session: live.levels_for_session, oi_asof: live.oi_asof, vol_asof: live.vol_asof, spot_asof: live.spot_asof, source: live.source, convention: live.convention, quality_gate: live.quality_gate, flip_method: live.flip_method,
    mm_asof: mm ? String(mm.asof || mm.asof_label || '') : '', mm_built: mm ? String(mm.built_mt || '') : '', n_snaps: hb.length || 1, first_snap: hb.length ? hb[0].spot_asof : live.spot_asof, last_snap: hb.length ? hb[hb.length - 1].spot_asof : live.spot_asof };
  const SKIP = new Set(['gex_profile', 'strikes', 'hist', 'strike_hist']);
  const universe = live.tickers.map((t) => { const o = {}; for (const k of Object.keys(t)) if (!SKIP.has(k)) o[k] = t[k]; if (o.coi_above === undefined) { o.coi_above = null; o.coi_above_pct = null; } const m = mmOf(t.t); o.mm_x = m ? m.x : null; o.mm_pc = m ? m.pc : null; return o; });
  const cache = {};
  const detail = (sym) => {
    if (cache[sym]) return cache[sym];
    const t = live.tickers.find((x) => x.t === sym); if (!t) return null;
    const o = {}; for (const k of Object.keys(t)) if (k !== 'hist' && k !== 'strike_hist') o[k] = t[k];
    const strikes = (t.strikes || []).filter((s) => s.k >= t.spot * 0.6 && s.k <= t.spot * 1.4);
    o.strikes = strikes; o.mm = mmOf(sym);
    o.abs_total_full = fin(t.abs_gex_total);
    o.abs_total = o.abs_total_full ? t.abs_gex_total : (t.strikes || []).reduce((a, s) => a + Math.abs(s.cg) + Math.abs(s.pg), 0);
    o.abs_total_near = fin(t.abs_gex_total_near) ? t.abs_gex_total_near : (t.strikes || []).reduce((a, s) => a + Math.abs(s.cg_near) + Math.abs(s.pg_near), 0);
    if (Array.isArray(t.hist) && hb.length === t.hist.length) o.hist = hb.map((b, i) => { const h = t.hist[i]; return { built_at: b.built_at, spot_asof: b.spot_asof, oi_asof: b.oi_asof, sess: b.sess, present: !!h, spot: h ? h[0] : null, cw: h ? h[1] : null, pw: h ? h[2] : null, flip: h ? h[3] : null, abs: h ? h[4] : null, g: h ? h[5] : null }; });
    else o.hist = [{ built_at: live.built_at, spot_asof: live.spot_asof, oi_asof: live.oi_asof, sess: live.levels_for_session, present: true, spot: t.spot, cw: t.call_wall, pw: t.put_wall, flip: t.flip, abs: t.abs_strike, g: t.gex_per_dv20_pct }];
    const sb = Array.isArray(live.strike_builds) ? live.strike_builds : [];
    if (Array.isArray(t.strike_hist) && sb.length) o.byBuild = sb.map((b, i) => { const net = {}; let present = false; for (const r of t.strike_hist) { if (r[i + 1] != null) { present = true; net[r[0]] = r[i + 1]; } } return { built_at: b.built_at, oi_asof: b.oi_asof, present, net }; });
    else { const net = {}; for (const s of strikes) net[s.k] = s.cg + s.pg; o.byBuild = [{ built_at: live.built_at, oi_asof: live.oi_asof, present: true, net }]; }
    o.bars = BARS.cache[sym] || {};
    return (cache[sym] = o);
  };
  const D = { index_regime: live.index_regime, universe, detail, meta: M };
  const tilePicks = () => [state.sym, 'SPY', 'QQQ'].filter((v, i, a) => a.indexOf(v) === i && universe.some((u) => u.t === v)).slice(0, 3);
  const radar = typeof window !== 'undefined' ? window : {};
  function ensureBars(sym) {
    if (BARS.cache[sym] || BARS.loading === sym) return;
    if (typeof radar.radarFetchBars !== 'function') { BARS.err = 'chart feed not available on this page'; return; }
    BARS.loading = sym; BARS.err = null;
    radar.radarFetchBars(sym, '2m').then((b) => { BARS.cache[sym] = groupBars(b); delete cache[sym]; }).catch((e) => { BARS.err = String((e && e.message) || e).slice(0, 80); }).finally(() => { if (BARS.loading === sym) BARS.loading = false; if (state.sym === sym) renderAll(); });
  }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MINUS = '\u2212';
const sgn = (v) => (v < 0 ? MINUS : v > 0 ? '+' : '');
const isNum = (v) => typeof v === 'number' && isFinite(v);
const px = (p) => !isNum(p) ? '—' : '$' + (p >= 1000 ? p.toFixed(0) : p >= 10 ? p.toFixed(2) : p.toFixed(3));
const usd = (v, signed = true) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v), s = signed ? sgn(v) : (v < 0 ? MINUS : '');
  const body = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : a.toFixed(0);
  return s + '$' + body;
};
const xx = (v, d = 2) => !isNum(v) ? '—' : sgn(v) + Math.abs(v).toFixed(d) + '\u00d7';
const ux = (v, d = 2) => !isNum(v) ? '—' : Math.abs(v).toFixed(d) + '\u00d7';
const pc = (v, d = 1, signed = true) => !isNum(v) ? '—' : (signed ? sgn(v) : (v < 0 ? MINUS : '')) + Math.abs(v).toFixed(d) + '%';
const int = (v) => !isNum(v) ? '—' : Math.round(v).toLocaleString('en-US');
const mtT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hour12: false });
const mtD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric' });
const etHM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const tMT = (ms) => mt12(ms) + ' MT';
const dMT = (ms) => mtD.format(new Date(ms)).replace(',', '');
const dayLbl = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).replace(',', ''); };
const etMin = (ms) => { const [h, m] = etHM.format(new Date(ms)).split(':').map(Number); return (h % 24) * 60 + m; };
const isExt = (ms) => { const m = etMin(ms); return m < 570 || m >= 960; };
const midRank = (arr, x) => { const v = arr.filter(isNum); if (!v.length || !isNum(x)) return null; let b = 0, e = 0; for (const a of v) { if (a < x) b++; else if (a === x) e++; } return (b + 0.5 * e) / v.length * 100; };
const NOW = Date.now();
const builtMs = Date.parse(M.built_at), spotMs = Date.parse(M.spot_asof);
const mmDate = M.mm_asof ? M.mm_asof.slice(0, 10) : null;
const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date(NOW));
const nearExpired = (iso) => iso && iso < todayISO;
const cls = (v) => (!isNum(v) || v === 0 ? '' : v > 0 ? 'p' : 'n');
const bar = (v, max) => (!isNum(v) || !max ? '' : `<i style="width:calc(${Math.min(1, Math.abs(v) / max).toFixed(3)} * (100% - 10px))"></i>`);
const vcell = (txt, v, max, extra = '') => `<td class="v ${cls(v)} ${extra}">${txt}${bar(v, max)}</td>`;

const state = { deep: false, sym: 'SPY', sess: M.levels_for_session, ladder: 'all', sx: 'stretch_x', sy: 'dvol_call_pct', cap: 'ALL', idx: false, sort: 'abs_stretch', sortDir: -1 };
const PICKS = () => D.universe.map((u) => u.t);
const det = (sym) => D.detail(sym);

// ---------- session counting for the freshness badge ----------
function missedSessions() {
  const out = []; const d = new Date(M.levels_for_session + 'T12:00:00Z');
  for (let i = 0; i < 10; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > todayISO) break;
    const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
    if (iso === todayISO) { const mtMin = (() => { const [h, m] = mtT.format(new Date(NOW)).split(':').map(Number); return (h % 24) * 60 + m; })(); if (mtMin < 450) break; }
    out.push(iso);
  }
  return out;
}

// ---------- header ----------
function header() {
  const ageH = (NOW - builtMs) / 3.6e6;
  const missed = missedSessions();
  const stale = missed.length > 0 || ageH > 1.5;
  const nGated = D.universe.filter((t) => t.greeks_ok === false).length;
  return `<div class="gx-head" data-sk-label="Freshness &amp; rules"><div class="head-main">
    <h2>Dealer gamma and levels · raw, no scores</h2>
    <div class="meta">Levels for <b>${dayLbl(M.levels_for_session)}</b> · OI as of <b>${dayLbl(M.oi_asof)} close</b> · spot &amp; volume <b>${dMT(spotMs)} ${tMT(spotMs)}</b> · built <b>${dMT(builtMs)} ${tMT(builtMs)}</b> · ${D.universe.length} names · history since <b>${M.first_snap ? dayLbl(M.first_snap.slice(0, 10)) : '—'}</b> (${M.n_snaps} builds)</div>
    <div class="meta">Data 15-min delayed (Massive $29 plan). OI is the prior session's close: today's new 0DTE positions are not in it.</div>
  </div><div class="badges">
    <div class="fresh"><span class="st">${stale ? 'Stale' : 'Fresh'}</span>built ${dMT(builtMs)} ${tMT(builtMs)} · ${ageH.toFixed(0)} h old${missed.length ? ` · <b>${missed.map(dayLbl).join(', ')}</b> ran with no build` : ''}<br>After-hours gate: ${nGated} name${nGated === 1 ? '' : 's'} with greeks withheld this build (walls, OI and volume still shown, marked <span class="gated">gated</span>).</div>
    <div class="rule"><b>Our rules</b>Dealer side assumed: long calls, short puts (SqueezeMetrics' published sign). Call wall = largest call GEX at or above spot; put wall = largest |put GEX| at or below spot; abs-γ = largest |call| + |put| GEX strike; flip = zero-gamma reprice of every contract (BS, own IV). These are our rules, not a vendor's.</div>
  </div></div>`;
}

// ---------- tiles ----------
function spark(vals, w = 200, h = 30) {
  const v = vals.filter(isNum); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), sx = w / (vals.length - 1);
  const d = vals.map((a, i) => `${i ? 'L' : 'M'}${(i * sx).toFixed(1)} ${(h - 2 - ((a - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#bec7cd" stroke-width="1.3" vector-effect="non-scaling-stroke"/></svg>`;
}
function indexTiles() {
  const r = D.index_regime;
  const hist = r.hist.map((h) => h[1]), dix = r.hist.map((h) => h[2]);
  const ex = (p) => p <= 5 || p >= 95;
  return `<div class="tile ${ex(r.gex_pctl2y) ? 'gold' : ''}"><div class="tt">S&amp;P 500 GEX <span>${dayLbl(r.date)} · SqueezeMetrics</span></div>
    <div class="big">${usd(r.gex_usd, false)} <small>per 1% move</small></div>
    <div class="pbar ${ex(r.gex_pctl2y) ? 'g' : ''}"><i style="left:${r.gex_pctl2y}%"></i></div>
    <div class="ln"><b>${pc(r.gex_pctl2y, 1, false)}</b> 2-yr pctl · range ${usd(r.gex_lo2y)} → ${usd(r.gex_hi2y)}</div>${spark(hist)}</div>
  <div class="tile ${ex(r.dix_pctl2y) ? 'gold' : ''}"><div class="tt">DIX · dark-pool buy share <span>${dayLbl(r.date)}</span></div>
    <div class="big">${pc(r.dix_pct, 1, false)}</div>
    <div class="pbar ${ex(r.dix_pctl2y) ? 'g' : ''}"><i style="left:${r.dix_pctl2y}%"></i></div>
    <div class="ln"><b>${pc(r.dix_pctl2y, 1, false)}</b> 2-yr pctl · range ${pc(r.dix_lo2y, 1, false)} → ${pc(r.dix_hi2y, 1, false)}</div>${spark(dix)}</div>`;
}
function tickerTile(sym) {
  const t = det(sym);
  const gold = t.mm && (t.mm.pc <= 5 || t.mm.pc >= 95);
  const regime = isNum(t.flip) ? (t.spot >= t.flip ? 'spot above flip' : 'spot below flip') : (t.greeks_ok ? 'no flip in ±15%' : 'greeks gated');
  return `<div class="tile pick ${state.sym === sym ? 'sel' : ''} ${gold ? 'gold' : ''}" data-pick="${sym}" role="button" tabindex="0">
    <div class="tt">${sym}${t.bkt ? `<em class="bkt">${t.bkt[0] + t.bkt.slice(1).toLowerCase()}</em>` : '<em class="bkt">Index ETF</em>'} <span>${esc(t.name)}</span></div>
    <div class="big">${px(t.spot)} <small>${isNum(t.stretch_x) ? xx(t.stretch_x) + ' ATR · ' + dayLbl(t.close_date || M.oi_asof) + ' close' : 'stretch n/a'}</small></div>
    <div class="ln">Net GEX <b>${usd(t.net_gex)}</b>/1% · ${regime}</div>
    <div class="ln">CW <b>${px(t.call_wall)}</b> · PW <b>${px(t.put_wall)}</b> · Flip <b>${isNum(t.flip) ? px(t.flip) : 'none'}</b></div>
    <div class="ln">${t.mm && isNum(t.mm.pc) ? `MR MAP ${dayLbl(mmDate)} close: <b>${xx(t.mm.x)} ATR</b> = <b>${pc(t.mm.pc, 1, false)}</b> 2-yr pctl` : t.ca_note ? esc(t.ca_note) : 'Not in MR MAP (ETF or no history)'}</div></div>`;
}

// ---------- indicators + chart ----------
function seriesFor(sym, sess) {
  const b = det(sym).bars || {};
  const days = Object.keys(b).sort().filter((d) => d <= sess);
  const out = [];
  let a = 2 / 9, e = null;
  for (const d of days) {
    let pv = 0, vv = 0;
    for (const r of b[d]) {
      const c = { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], day: d };
      pv += ((c.h + c.l + c.c) / 3) * c.v; vv += c.v; c.vwap = vv ? pv / vv : null;
      e = e == null ? c.c : c.c * a + e * (1 - a); c.ema = e;
      out.push(c);
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (i < 19) { out[i].bbU = out[i].bbL = null; continue; }
    let s = 0; for (let j = i - 19; j <= i; j++) s += out[j].c; const m = s / 20;
    let q = 0; for (let j = i - 19; j <= i; j++) q += (out[j].c - m) ** 2; const sd = Math.sqrt(q / 20);
    out[i].bbU = m + 2 * sd; out[i].bbL = m - 2 * sd;
  }
  const prev = days.filter((d) => d < sess).pop();
  let prevClose = null;
  if (prev) { const pb = out.filter((c) => c.day === prev && etMin(c.t) < 960); prevClose = pb.length ? pb[pb.length - 1].c : null; }
  return { all: out, day: out.filter((c) => c.day === sess), prevClose };
}
function et0400(iso) { for (const h of [8, 9]) { const ms = Date.parse(iso + 'T0' + h + ':00:00Z'); if (etMin(ms) === 240) return ms; } return Date.parse(iso + 'T08:00:00Z'); }
function niceStep(range, target) { const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw); }

// level step-series for one session from the archive snapshots
function levelSteps(t, sess) {
  let snaps = t.hist.filter((h) => h.sess === sess && h.present);
  let carried = false;
  if (!snaps.length) { const p = t.hist.filter((h) => h.present && h.sess < sess); snaps = p.length ? [p[p.length - 1]] : []; carried = true; }
  return { snaps, carried };
}

function drawChart() {
  const host = $('#gxChart'); if (!host) return;
  const t = det(state.sym);
  const S = seriesFor(state.sym, state.sess);
  const C = S.day;
  if (!C.length) { host.innerHTML = '<div class="note" style="padding:20px">' + (BARS.err ? '2m bars unavailable (' + esc(BARS.err) + ').' : BARS.loading ? 'Loading 2m bars…' : 'No 2m bars for this session.') + '</div>'; return; }
  const W = Math.max(340, host.clientWidth), narrow = W < 700;
  const H = narrow ? 470 : Math.round(Math.min(780, Math.max(560, W * 0.52)));
  const PL = 6, PR = narrow ? 118 : 132, PT = narrow ? 40 : 24, PB = 22, VOL = narrow ? 56 : 84, GAP = 8;
  const plotW = W - PL - PR, priceH = H - PT - PB - VOL - GAP;
  const step = 120000;
  const t0 = et0400(state.sess);
  const t1 = t0 + 16 * 3600e3;
  const tEnd = t1 + 12 * step; // N6: 12 empty bars right of the newest one (TradingView rightOffset)
  const x = (ms) => PL + ((ms - t0) / (tEnd - t0)) * plotW;
  const { snaps, carried } = levelSteps(t, state.sess);
  const last = snaps[snaps.length - 1] || {};
  const anchor = state.sess === M.levels_for_session ? t.close : S.prevClose; // implied-move anchor = prior close
  const im = isNum(t.imove_1d_pct) && isNum(anchor) ? anchor * t.imove_1d_pct / 100 : null;
  // range
  const cLo = Math.min(...C.map((c) => c.l)), cHi = Math.max(...C.map((c) => c.h)), span = cHi - cLo || cHi * 0.01;
  const ind = C.flatMap((c) => [c.bbU, c.bbL, c.ema, c.vwap]).filter(isNum);
  let lo = Math.max(cLo - span * 0.25, Math.min(cLo, ...ind)), hi = Math.min(cHi + span * 0.25, Math.max(cHi, ...ind));
  const LV = [];
  const add = (key, label, color, dash, w) => {
    const segs = []; snaps.forEach((s, i) => { const v = s[key]; const st = Math.max(t0, Date.parse(s.spot_asof)); const en = i < snaps.length - 1 ? Math.max(t0, Date.parse(snaps[i + 1].spot_asof)) : t1; if (isNum(v)) segs.push([carried ? t0 : st, en, v]); });
    const cur = last[key];
    LV.push({ key, label, color, dash, w, segs, cur, n: snaps.length });
  };
  add('cw', 'CALL WALL', '#51c083', '7 4', 1.6);
  add('pw', 'PUT WALL', '#e17272', '7 4', 1.6);
  add('flip', 'FLIP', '#e0e5e7', '2 3', 1.5);
  add('abs', 'ABS-γ', '#b9c0c7', '9 3 2 3', 1.2);
  const reach = span * 0.6;
  for (const L of LV) for (const s of L.segs) if (s[2] >= cLo - reach && s[2] <= cHi + reach) { lo = Math.min(lo, s[2]); hi = Math.max(hi, s[2]); }
  if (im) { const a = anchor - im, b = anchor + im; if (a >= cLo - reach) lo = Math.min(lo, a); if (b <= cHi + reach) hi = Math.max(hi, b); }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const y = (p) => PT + (1 - (p - lo) / (hi - lo)) * priceH;
  const slot = plotW * step / (tEnd - t0), bw = Math.max(1, Math.min(9, slot * 0.68));
  const volTop = PT + priceH + GAP, volBase = volTop + VOL, vMax = Math.max(...C.map((c) => c.v), 1);
  let shade = '', run = null;
  for (let m = t0; m <= t1; m += step) { const ext = isExt(m) && m < t1; if (ext && run == null) run = m; if ((!ext || m >= t1) && run != null) { shade += `M${x(run).toFixed(1)} ${PT}H${x(m).toFixed(1)}V${volBase}H${x(run).toFixed(1)}z`; run = null; } }
  let wu = '', wd = '', bu = '', bd = '', vu = '', vd = '';
  for (const c of C) {
    const cx = x(c.t + step / 2).toFixed(1), up = c.c >= c.o, top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c)), bh = Math.max(0.8, bot - top);
    const body = `M${(cx - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${bh.toFixed(1)}h${(-bw).toFixed(1)}z`;
    if (up) { wu += `M${cx} ${y(c.h).toFixed(1)}V${top.toFixed(1)}M${cx} ${(top + bh).toFixed(1)}V${y(c.l).toFixed(1)}`; bu += body; } else { wd += `M${cx} ${y(c.h).toFixed(1)}V${y(c.l).toFixed(1)}`; bd += body; }
    const vb = `M${(cx - bw / 2).toFixed(1)} ${volBase}h${bw.toFixed(1)}v${(-(c.v / vMax) * (VOL - 4)).toFixed(1)}h${(-bw).toFixed(1)}z`;
    if (up) vu += vb; else vd += vb;
  }
  const line = (k) => { let d = '', pen = false; for (const c of C) { const v = c[k]; if (!isNum(v)) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(c.t + step / 2).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; } return d; };
  const ref = isNum(S.prevClose) && state.sess !== M.levels_for_session ? S.prevClose : (state.sess === M.levels_for_session ? t.close : C[0].o);
  const dayHi = cHi, dayLo = cLo;
  const tagYs = [dayHi, dayLo].map(y);
  const st = niceStep(hi - lo, narrow ? 7 : 10);
  let grid = '';
  for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) {
    const yy = y(p); if (yy < PT + 6 || tagYs.some((ty) => Math.abs(ty - yy) < 13)) continue;
    const pct = (p / ref - 1) * 100;
    grid += `<path d="M${PL} ${yy.toFixed(1)}H${PL + plotW}" stroke="#1c1c1c"/><text x="${W - PR + 6}" y="${(yy + 4).toFixed(1)}" fill="#d6dae0">${px(p)}</text><text x="${W - 4}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="#8fb0ff">${pc(pct, Math.abs(pct) < 10 ? 2 : 1)}</text>`;
  }
  // time axis (MT)
  let tax = '';
  const hrStep = narrow ? 4 : 2;
  for (let m = t0; m <= t1; m += 3600e3) { const mtH = Number(mtT.format(new Date(m)).slice(0, 2)) % 24; if (mtH % hrStep) continue; if (x(m) < PL + 18 || x(m) > PL + plotW - 18) continue; tax += `<path d="M${x(m).toFixed(1)} ${PT}V${volBase}" stroke="#121212"/><text x="${x(m).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="#d6dae0">${hm12(mtH, 0, { compact: true })}</text>`; }
  // levels (step lines from the intraday builds), tags on the right
  let lv = '', ltags = '', offTop = [], offBot = [];
  const tagRows = [];
  for (const L of LV) {
    if (!L.segs.length) continue;
    let d = '';
    for (const [a, b, v] of L.segs) { if (v < lo || v > hi) continue; d += `M${x(a).toFixed(1)} ${y(v).toFixed(1)}H${x(b).toFixed(1)}`; }
    // vertical joins between steps
    for (let i = 1; i < L.segs.length; i++) { const p0 = L.segs[i - 1], p1 = L.segs[i]; if (p0[1] === p1[0] && p0[2] !== p1[2] && p0[2] >= lo && p0[2] <= hi && p1[2] >= lo && p1[2] <= hi) d += `M${x(p1[0]).toFixed(1)} ${y(p0[2]).toFixed(1)}V${y(p1[2]).toFixed(1)}`; }
    if (d) lv += `<path d="${d}" fill="none" stroke="${L.color}" stroke-width="${L.w}" stroke-dasharray="${L.dash}" opacity="${carried ? .8 : 1}"/>`;
    const v = L.cur; if (!isNum(v)) continue;
    const dxATR = (v - t.spot) / t.atr14;
    const txt = `${L.label} ${px(v)} · ${xx(dxATR)} ATR`;
    if (v > hi) offTop.push({ txt: '\u2191 ' + txt + ' (off chart)', c: L.color });
    else if (v < lo) offBot.push({ txt: '\u2193 ' + txt + ' (off chart)', c: L.color });
    else tagRows.push({ y: y(v), txt, c: L.color, v });
  }
  if (im) {
    for (const [v, nm] of [[anchor + im, 'IMPL +1σ'], [anchor - im, 'IMPL −1σ']]) {
      if (v > hi) { offTop.push({ txt: `\u2191 ${nm} ${px(v)} (off chart)`, c: '#bec7cd' }); continue; }
      if (v < lo) { offBot.push({ txt: `\u2193 ${nm} ${px(v)} (off chart)`, c: '#bec7cd' }); continue; }
      lv += `<path d="M${PL} ${y(v).toFixed(1)}H${PL + plotW}" stroke="#bec7cd" stroke-width="1" stroke-dasharray="1 4" opacity=".9"/>`;
      tagRows.push({ y: y(v), txt: `${nm} ${px(v)} · ±${pc(t.imove_1d_pct, 2, false)}`, c: '#bec7cd', v, dim: true });
    }
  }
  // de-collide right-edge labels
  tagRows.sort((a, b) => a.y - b.y);
  let lastY = -99;
  for (const r of tagRows) { r.ly = Math.max(r.y - 4, lastY + 14); lastY = r.ly; }
  for (const r of tagRows) {
    const tx = PL + plotW - 6;
    ltags += `<text x="${tx}" y="${r.ly.toFixed(1)}" text-anchor="end" fill="${r.c === '#e17272' ? '#f0aaa8' : r.c === '#51c083' ? '#a2d7bd' : '#e0e5e7'}" stroke="#000" stroke-width="3" paint-order="stroke" font-size="${narrow ? 10 : 11}" font-weight="700">${esc(narrow ? r.txt.replace(/ · .*ATR/, '') : r.txt)}</text>`;
    ltags += `<rect x="${W - PR + 1}" y="${(r.y - 8).toFixed(1)}" width="${PR - 2}" height="16" rx="2" fill="#000" stroke="${r.c}"/><text x="${W - PR + 6}" y="${(r.y + 4).toFixed(1)}" fill="#fff">${px(r.v)}</text>`;
  }
  offTop.forEach((o, i) => { ltags += `<text x="${PL + 12}" y="${PT + 14 + i * 14}" text-anchor="start" fill="#e0e5e7" stroke="#000" stroke-width="3" paint-order="stroke" font-size="${narrow ? 10 : 11}" font-weight="700">${esc(o.txt)}</text><rect x="${PL + 6}" y="${PT + 6 + i * 14}" width="3" height="10" fill="${o.c}"/>`; });
  offBot.forEach((o, i) => { ltags += `<text x="${PL + 12}" y="${PT + priceH - 6 - i * 14}" text-anchor="start" fill="#e0e5e7" stroke="#000" stroke-width="3" paint-order="stroke" font-size="${narrow ? 10 : 11}" font-weight="700">${esc(o.txt)}</text><rect x="${PL + 6}" y="${PT + priceH - 15 - i * 14}" width="3" height="10" fill="${o.c}"/>`; });
  // build markers (when each level set was computed)
  let marks = '';
  if (!carried) for (const s of snaps) { const ms = Date.parse(s.spot_asof); if (ms < t0) continue; marks += `<path d="M${x(ms).toFixed(1)} ${PT + priceH}l-4 7h8z" fill="#bec7cd"><title>build ${tMT(Date.parse(s.built_at))} · spot ${tMT(ms)}</title></path>`; }
  const hiTag = (lbl, p) => `<rect x="${W - PR + 1}" y="${(y(p) - 8).toFixed(1)}" width="${PR - 2}" height="16" rx="2" fill="#1b2a55"/><text x="${W - PR + 6}" y="${(y(p) + 4).toFixed(1)}" fill="#fff">${lbl} ${px(p)}</text>`;
  const vwEnd = C[C.length - 1].vwap;
  const head = `${state.sym} · 2m · ${dayLbl(state.sess)} · ${tMT(t0).replace(' MT', '')}–${tMT(t1).replace(' MT', '')} MT`;
  const headInd = narrow ? '' : `<tspan fill="#8fb0ff" font-weight="600"> · VWAP ${px(vwEnd)}</tspan><tspan fill="#ff9800" font-weight="600"> · EMA 8</tspan><tspan fill="#c77ddf" font-weight="600"> · BB 20,2</tspan>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(head)}" style="display:block;background:#000;border-radius:6px" font-size="${narrow ? 10.5 : 11.5}">
    <defs><clipPath id="gxcp"><rect x="${PL}" y="${PT}" width="${plotW}" height="${priceH}"/></clipPath></defs>
    <path d="${shade}" fill="#141414"/>${tax}${grid}
    <path d="M${PL} ${volTop - GAP / 2}H${PL + plotW}" stroke="#2a2a2a"/>
    <path d="${vu}" fill="#1f8a4c"/><path d="${vd}" fill="#a8283a"/>
    <g clip-path="url(#gxcp)" fill="none">${lv}
      <path d="${line('bbU')}" stroke="#a23bc4" stroke-width="1.2"/><path d="${line('bbL')}" stroke="#a23bc4" stroke-width="1.2"/>
      <path d="${line('vwap')}" stroke="#2f55d4" stroke-width="1.7"/><path d="${line('ema')}" stroke="#ff9800" stroke-width="1.3"/>
      <path d="${wu}" stroke="#26c16a" stroke-width="1"/><path d="${wd}" stroke="#f23645" stroke-width="1"/>
      <path d="${bu}" stroke="#26c16a" stroke-width="1"/><path d="${bd}" fill="#f23645"/></g>
    ${marks}${ltags}${hiTag('High', dayHi)}${hiTag('Low', dayLo)}
    <text x="${PL + 4}" y="15" fill="#e0e5e7" font-weight="700">${esc(head)}${headInd}</text>
    <text x="${narrow ? PL + 4 : W - 4}" y="${narrow ? 31 : 15}" text-anchor="${narrow ? 'start' : 'end'}" fill="#8fb0ff">% vs prior close ${px(ref)}</text>
    <text x="${PL + 4}" y="${volTop + 12}" fill="#d6dae0">Vol</text>
  </svg>`;
  $('#gxChartNote').innerHTML = carried
    ? `<b>No build ran for ${dayLbl(state.sess)}.</b> Level lines are carried from the last build (${dMT(Date.parse(last.built_at))} ${tMT(Date.parse(last.built_at))}) and drawn flat. Implied-move band anchored on the prior close ${px(anchor)} with the ${dayLbl(M.vol_asof)} IV.`
    : `Level lines step at each build that day (▲ under the price pane = spot time of a build, ${snaps.length} builds on this session's levels). Implied-move band = prior close ${px(anchor)} ± ${pc(t.imove_1d_pct, 3, false)} (ATM IV ${pc(t.iv_atm_pct, 1, false)} ÷ √252, measured ${tMT(spotMs)}).`;
}

// ---------- key levels + MR read ----------
function persist(t, key) {
  const v = t[key === 'cw' ? 'call_wall' : key === 'pw' ? 'put_wall' : key === 'abs' ? 'abs_strike' : 'flip'];
  const h = t.hist.filter((s) => s.present);
  const tol = key === 'flip' && isNum(t.atr14) ? 0.25 * t.atr14 : 0;
  const same = h.filter((s) => isNum(s[key]) && isNum(v) && Math.abs(s[key] - v) <= tol).length;
  return { same, n: h.length };
}
function keyLevels() {
  const t = det(state.sym);
  const singles = D.universe.filter((u) => u.kind === 'single');
  const own = t.hist.filter((h) => h.present).map((h) => h.g);
  const ownN = own.filter(isNum).length;
  const ownP = midRank(own, t.gex_per_dv20_pct);
  const crossP = t.kind === 'single' ? midRank(singles.map((u) => u.gex_per_dv20_pct), t.gex_per_dv20_pct) : null;
  const crossN = singles.filter((u) => isNum(u.gex_per_dv20_pct)).length;
  const row = (name, sub, v, pctv, xatr) => `<tr><td class="l">${name}${sub ? `<small>${sub}</small>` : ''}</td><td>${v}</td><td class="${cls(pctv) === 'p' ? 'up' : cls(pctv) === 'n' ? 'dn' : ''}">${pc(pctv, 2)}</td><td>${xatr}</td></tr>`;
  const dp = (v) => isNum(v) ? (v / t.spot - 1) * 100 : null;
  const ps = (k) => { const p = persist(t, k); return `held ${p.same}/${p.n} builds`; };
  const flipCell = isNum(t.flip) ? px(t.flip) : (t.greeks_ok ? 'none' : '<span class="gated">gated</span>');
  const flipSub = isNum(t.flip) ? (t.spot >= t.flip ? 'spot above: positive-γ side' : 'spot below: negative-γ side') + ' · ' + ps('flip') : (t.greeks_ok ? `no zero crossing within ±15% of spot` : esc(t.quality_note));
  const ctx = (name, sub, v, vcls, c) => `<tr><td class="l">${name}${sub ? `<small>${sub}</small>` : ''}</td><td class="${vcls}">${v}</td><td colspan="2">${c}</td></tr>`;
  const ud = (v) => (cls(v) === 'p' ? 'up' : cls(v) === 'n' ? 'dn' : '');
  const gold = t.mm && (t.mm.pc <= 5 || t.mm.pc >= 95);
  return `<div class="panel"><div class="ph"><div class="l"><h2>${state.sym} key levels</h2><span class="h-sub">spot ${px(t.spot)} · ${tMT(spotMs)} ${dMT(spotMs)} · ATR14 ${px(t.atr14)}</span></div></div>
  <div class="tw"><table class="kv"><thead><tr><th class="l">Level</th><th>Price<small>$</small></th><th>vs spot<small>%</small></th><th>Distance<small>× ATR</small></th></tr></thead><tbody>
  ${row('Call wall', 'largest call GEX ≥ spot · ' + ps('cw'), px(t.call_wall), dp(t.call_wall), xx(t.call_wall_dist_x))}
  ${row('Abs-γ strike', `${pc(t.abs_strike_share_pct, 1, false)} of all |GEX| · ` + ps('abs'), px(t.abs_strike), dp(t.abs_strike), xx(t.abs_strike_dist_x))}
  ${row('Flip', flipSub, flipCell, dp(t.flip), isNum(t.flip) && isNum(t.atr14) ? xx((t.flip - t.spot) / t.atr14) : '—')}
  ${row('Put wall', 'largest |put GEX| ≤ spot · ' + ps('pw'), px(t.put_wall), dp(t.put_wall), xx(t.put_wall_dist_x))}
  <tr class="sect"><td class="l" colspan="4">Move &amp; stretch</td></tr>
  ${ctx('Implied move', `1-day · ATM IV ${pc(t.iv_atm_pct, 1, false)} ÷ √252`, '±' + pc(t.imove_1d_pct, 2, false), '', '±' + px(t.spot * t.imove_1d_pct / 100) + ' at spot')}
  ${ctx('Stretch', t.ca_note ? esc(t.ca_note) : `${dayLbl(t.close_date || M.oi_asof)} close ${px(t.close)} vs EMA8 ${px(t.ema8)}`, isNum(t.stretch_x) ? xx(t.stretch_x) + ' ATR' : 'n/a', ud(t.stretch_x), `<span class="${ud(t.stretch_vs_imove_x)}">${xx(t.stretch_vs_imove_x)}</span> impl. move`)}
  ${t.mm && isNum(t.mm.pc) ? `<tr class="${gold ? 'goldrow' : ''}"><td class="l">2-yr stretch pctl<small>MR MAP · ${dayLbl(mmDate)} close · ${t.mm.pn} sessions · range ${xx(t.mm.lo)} → ${xx(t.mm.hi)}</small></td><td>${pc(t.mm.pc, 1, false)}</td><td colspan="2">at ${xx(t.mm.x)} ATR (its own ${dayLbl(mmDate)} stretch)</td></tr>` : ctx('2-yr stretch pctl', t.ca_note ? 'history reset at a corporate action' : 'not in MR MAP (ETF or short history)', '—', '', '')}
  <tr class="sect"><td class="l" colspan="4">Dealer gamma size</td></tr>
  ${ctx('Net GEX', `calls ${usd(t.call_gex)} · puts ${usd(t.put_gex)}`, usd(t.net_gex), ud(t.net_gex), 'per 1% move')}
  ${ctx('GEX ÷ 20D $vol', `own pctl over ${ownN} builds over the build history${crossP == null ? '' : ` · ${pc(crossP, 0, false)} vs ${crossN} singles this build`}`, pc(t.gex_per_dv20_pct, 2), ud(t.gex_per_dv20_pct), ownP == null ? '—' : pc(ownP, 0, false) + ' own pctl')}
  ${ctx('Nearest expiry', `${dayLbl(t.near_exp)}${nearExpired(t.near_exp) ? ' · expired' : ''}`, pc(t.near_share_pct, 1, false), '', 'of all |GEX|')}
  </tbody></table></div></div>`;
}
function wallPath(t) {
  const seq = t.hist.filter((h) => h.present && h.sess === M.levels_for_session && isNum(h.cw)).map((h) => h.cw);
  if (!seq.length) return '';
  const path = seq.filter((v, i) => i === 0 || v !== seq[i - 1]);
  return path.length > 1 ? `Levels move: ${state.sym}'s call wall went ${path.map(px).join(' → ')} across the ${seq.length} builds for ${dayLbl(M.levels_for_session)}.` : `${state.sym}'s call wall held at ${px(path[0])} across all ${seq.length} builds for ${dayLbl(M.levels_for_session)}.`;
}
function mrRead() {
  const t = det(state.sym);
  const items = [];
  if (isNum(t.flip)) items.push(`Spot ${px(t.spot)} is <b>${pc((t.spot / t.flip - 1) * 100, 2)}</b> (${xx(t.flip_dist_x)} ATR) ${t.spot >= t.flip ? 'above' : 'below'} the flip ${px(t.flip)}: the <b>${t.spot >= t.flip ? 'positive' : 'negative'}-gamma</b> side.`);
  else if (t.greeks_ok) items.push(`No flip within ±15% of spot: net GEX stays <b>${t.net_gex >= 0 ? 'positive' : 'negative'}</b> (${usd(t.net_gex)}/1%) across the whole curve.`);
  else items.push(`Greeks gated (${esc(t.quality_note)}): only walls, OI and volume are live.`);
  const dir = !isNum(t.stretch_x) ? null : t.stretch_x >= 0 ? 'up' : 'down';
  if (isNum(t.stretch_x)) items.push(`Stretch (${dayLbl(t.close_date || M.oi_asof)} close) <b>${xx(t.stretch_x)} ATR</b> from EMA8${isNum(t.stretch_vs_imove_x) ? ` = <b>${ux(Math.abs(t.stretch_vs_imove_x))}</b> the implied 1-day move (±${pc(t.imove_1d_pct, 2, false)})` : ''}.`);
  else items.push(`Stretch n/a${t.ca_note ? ': ' + esc(t.ca_note) : ''}.`);
  const wallAhead = dir == null ? null : dir === 'up' ? ['call wall', t.call_wall, t.call_wall_dist_x, 'cw'] : ['put wall', t.put_wall, t.put_wall_dist_x, 'pw'];
  const wallBack = dir == null ? null : dir === 'up' ? ['put wall', t.put_wall, t.put_wall_dist_x] : ['call wall', t.call_wall, t.call_wall_dist_x];
  if (wallAhead) { const p = persist(t, wallAhead[3]); items.push(`Stretched ${dir}: next wall in that direction = ${wallAhead[0]} <b>${px(wallAhead[1])}</b> (${xx(wallAhead[2])} ATR), the wall in ${p.same} of ${p.n} builds over the build history. Other side: ${wallBack[0]} ${px(wallBack[1])} (${xx(wallBack[2])} ATR).`); }
  if (t.mm && isNum(t.mm.pc)) items.push(`MR MAP (${dayLbl(mmDate)} close, its own stretch <b>${xx(t.mm.x)} ATR</b>): 2-yr stretch percentile <b>${pc(t.mm.pc, 1, false)}</b>${mmDate !== (t.close_date || M.oi_asof) ? ' (different session than the stretch above)' : ''}.`);
  return `<div class="mr"><h3>MR read · primitives only</h3><ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>
  <div class="why">${wallPath(t)}</div></div>`;
}

// ---------- GEX 1-10 ladder ----------
const winLabel = (t) => isNum(t.win_gex_pct) ? `top ${t.win_n} strikes ${px(t.win_lo)}–${px(t.win_hi)} (${pc(t.win_gex_pct, 0, false)} of |GEX|, ${pc(t.win_oi_pct, 0, false)} of OI)` : `strike window ${px(t.strikes[0]?.k)}–${px(t.strikes.at(-1)?.k)} only (share of full chain not in this build)`;
function ladder() {
  const t = det(state.sym), near = state.ladder === 'near';
  const g = (s) => near ? [s.cg_near, s.pg_near] : [s.cg, s.pg];
  const tot = near ? t.abs_total_near : t.abs_total;
  const rows = t.strikes.map((s) => { const [c, p] = g(s); return { k: s.k, c, p, net: c + p, a: Math.abs(c) + Math.abs(p) }; }).filter((r) => r.a > 0).sort((a, b) => b.a - a.a).slice(0, 10);
  const max = Math.max(...rows.map((r) => Math.abs(r.net)), 1);
  const role = (k) => (k === t.call_wall ? '<span class="role cw">CW</span>' : '') + (k === t.put_wall ? '<span class="role pw">PW</span>' : '') + (k === t.abs_strike ? '<span class="role">Abs</span>' : '');
  const exp = nearExpired(t.near_exp) ? ` (expired ${dayLbl(t.near_exp)} close)` : '';
  return `<div class="panel"><div class="ph"><div class="l"><h2>GEX 1–10</h2><span class="h-sub">ranked by |call| + |put| GEX · ${winLabel(t)}</span></div>
    <div class="seg" data-seg="ladder"><button data-v="all" class="${near ? '' : 'on'}">All expiries</button><button data-v="near" class="${near ? 'on' : ''}">Nearest ${dayLbl(t.near_exp)}</button></div></div>
  ${near ? `<div class="note" style="margin:0 0 6px">Nearest expiry ${dayLbl(t.near_exp)}${exp} = ${pc(t.near_share_pct, 1, false)} of all |GEX|.</div>` : ''}
  <div class="tw"><table><thead><tr><th>#</th><th class="l">Strike<small>$</small></th><th>From spot<small>× ATR</small></th><th class="hide-n">From spot<small>%</small></th><th>Net GEX<small>$ per 1%</small></th><th>Share<small>${t.abs_total_full ? '% of all |GEX|' : '% of window |GEX|'}</small></th></tr></thead><tbody>
  ${rows.map((r, i) => { const dx = (r.k - t.spot) / t.atr14, dp = (r.k / t.spot - 1) * 100; return `<tr><td>${i + 1}</td><td class="l">${px(r.k)}${role(r.k)}</td><td class="${cls(dx) === 'p' ? 'up' : 'dn'}">${xx(dx)}</td><td class="hide-n">${pc(dp, 2)}</td>${vcell(usd(r.net), r.net, max)}<td>${pc(tot ? r.a / tot * 100 : null, 1, false)}</td></tr>`; }).join('')}${rows.length < 10 ? `<tr><td class="l" colspan="6">${rows.length} strike${rows.length === 1 ? '' : 's'} with GEX in the listed window.</td></tr>` : ''}
  </tbody></table></div>${imUnits(t)}</div>`;
}
function imUnits(t) {
  if (!isNum(t.imove_1d_pct)) return `<div class="note">Implied move gated for ${state.sym}: levels in implied-move units need IV.</div>`;
  const m = t.spot * t.imove_1d_pct / 100;
  const L = [['Call wall', t.call_wall], ['Abs-γ', t.abs_strike], ['Flip', t.flip], ['Put wall', t.put_wall]].filter(([, v]) => isNum(v));
  return `<div class="ph" style="margin:12px 0 4px"><div class="l"><h2 style="font-size:13.5px">Levels in implied-move units</h2><span class="h-sub">1σ = ±${px(m)} (±${pc(t.imove_1d_pct, 2, false)}) from spot ${px(t.spot)}</span></div></div>
  <div class="tw"><table><thead><tr><th class="l">Level</th><th>Price<small>$</small></th><th>From spot<small>× 1-day implied move</small></th><th class="hide-n">From spot<small>× ATR</small></th></tr></thead><tbody>
  ${L.map(([n, v]) => { const k = (v - t.spot) / m, a = (v - t.spot) / t.atr14; return `<tr><td class="l">${n}</td><td>${px(v)}</td><td class="${cls(k) === 'p' ? 'up' : 'dn'}">${xx(k)}</td><td class="hide-n">${xx(a)}</td></tr>`; }).join('')}
  <tr><td class="l">Stretch (close vs EMA8)</td><td>${px(t.close)}</td><td class="${cls(t.stretch_vs_imove_x) === 'p' ? 'up' : 'dn'}">${xx(t.stretch_vs_imove_x)}</td><td class="hide-n">${xx(t.stretch_x)}</td></tr>
  </tbody></table></div><div class="note">±1.00× = the options-implied one-standard-deviation 1-day move (ATM IV ÷ √252).</div>`;
}

// ---------- gex_profile curve + strike bars ----------
function profileSvg() {
  const t = det(state.sym), P = t.gex_profile;
  if (!P) return `<div class="note">Greeks gated for ${state.sym}: no curve this build (${esc(t.quality_note)}).</div>`;
  const host = $('#gxProf'); const W = Math.max(320, host ? host.clientWidth : 800), narrow = W < 600;
  const H = narrow ? 380 : 440, PL = narrow ? 58 : 70, PR = 12, PT = 22, PB = 28, BARH = narrow ? 90 : 120, GAP = 22;
  const curveH = H - PT - PB - BARH - GAP;
  const xs = P.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ys = P.map((p) => p[1]); let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); const pd = (y1 - y0) * 0.08; y0 -= pd; y1 += pd;
  const X = (v) => PL + (v - x0) / (x1 - x0) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - y0) / (y1 - y0)) * curveH;
  let pos = '', neg = '';
  for (let i = 1; i < P.length; i++) {
    const [a, va] = P[i - 1], [b, vb] = P[i];
    const seg = (s, e, vs, ve) => `M${X(s).toFixed(1)} ${Y(0).toFixed(1)}L${X(s).toFixed(1)} ${Y(vs).toFixed(1)}L${X(e).toFixed(1)} ${Y(ve).toFixed(1)}L${X(e).toFixed(1)} ${Y(0).toFixed(1)}z`;
    if ((va >= 0) === (vb >= 0)) { if (va >= 0) pos += seg(a, b, va, vb); else neg += seg(a, b, va, vb); }
    else { const z = a + (b - a) * (-va) / (vb - va); if (va >= 0) { pos += seg(a, z, va, 0); neg += seg(z, b, 0, vb); } else { neg += seg(a, z, va, 0); pos += seg(z, b, 0, vb); } }
  }
  const ln = P.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  let gy = ''; const stv = niceStep(y1 - y0, 5);
  for (let v = Math.ceil(y0 / stv) * stv; v <= y1; v += stv) gy += `<path d="M${PL} ${Y(v).toFixed(1)}H${W - PR}" stroke="${Math.abs(v) < stv / 2 ? '#5d646b' : '#17191c'}"/><text x="${PL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="#bec7cd">${usd(Math.abs(v) < stv / 2 ? 0 : v)}</text>`;
  let gx = ''; const sx = niceStep(x1 - x0, narrow ? 4 : 8);
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1; v += sx) gx += `<path d="M${X(v).toFixed(1)} ${PT}V${H - PB}" stroke="#121315"/><text x="${X(v).toFixed(1)}" y="${H - PB + 14}" text-anchor="middle" fill="#bec7cd">${px(v)}</text><text x="${X(v).toFixed(1)}" y="${H - PB + 26}" text-anchor="middle" fill="#8fb0ff">${pc((v / t.spot - 1) * 100, 0)}</text>`;
  const vl = (v, c, lbl, dash, row) => !isNum(v) || v < x0 || v > x1 ? '' : `<path d="M${X(v).toFixed(1)} ${PT}V${H - PB}" stroke="${c}" stroke-dasharray="${dash}" stroke-width="1.3"/><text x="${(X(v) + 4).toFixed(1)}" y="${PT + 12 + row * 16}" fill="#e0e5e7" stroke="#000" stroke-width="3" paint-order="stroke" font-size="11" font-weight="700">${lbl}</text>`;
  let flipMark = '';
  if (isNum(t.flip)) flipMark = `<circle cx="${X(t.flip).toFixed(1)}" cy="${Y(0).toFixed(1)}" r="5" fill="#000" stroke="#fff" stroke-width="2"/><text x="${(X(t.flip) - 8).toFixed(1)}" y="${(Y(0) + 18).toFixed(1)}" text-anchor="end" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" font-weight="700" font-size="11">ZERO CROSSING = FLIP ${px(t.flip)}</text>`;
  // strike bars (all expiries) + cumulative line (MenthorQ)
  const ks = t.strikes.filter((s) => s.k >= x0 && s.k <= x1);
  const bTop = PT + curveH + GAP, bBase = bTop + BARH / 2;
  const bmax = Math.max(...ks.map((s) => Math.abs(s.cg + s.pg)), 1);
  const bw = Math.max(1.2, Math.min(10, (W - PL - PR) / Math.max(ks.length, 1) * 0.7));
  let bars = '', cum = 0, cumPts = [];
  const cTot = ks.reduce((s, r) => s + r.cg + r.pg, 0);
  const cumAbsMax = (() => { let c = 0, m = 1; for (const s of ks) { c += s.cg + s.pg; m = Math.max(m, Math.abs(c)); } return m; })();
  for (const s of ks) {
    const v = s.cg + s.pg, h = Math.abs(v) / bmax * (BARH / 2 - 4);
    bars += `<rect x="${(X(s.k) - bw / 2).toFixed(1)}" y="${(v >= 0 ? bBase - h : bBase).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" fill="${v >= 0 ? '#45bb7b' : '#e16c6c'}"/>`;
    cum += v; cumPts.push([X(s.k), bBase - cum / cumAbsMax * (BARH / 2 - 4)]);
  }
  const cumLn = cumPts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;background:#000;border-radius:6px" font-size="${narrow ? 10 : 11}">
   ${gx}${gy}<path d="${pos}" fill="rgba(81,192,131,.22)"/><path d="${neg}" fill="rgba(225,114,114,.24)"/>
   <path d="${ln}" fill="none" stroke="#e0e5e7" stroke-width="1.6"/>
   ${vl(t.put_wall, '#e17272', 'PW ' + px(t.put_wall), '6 4', 2)}${vl(t.call_wall, '#51c083', 'CW ' + px(t.call_wall), '6 4', 1)}${vl(t.spot, '#ffffff', 'SPOT ' + px(t.spot), '0', 0)}
   ${flipMark}
   <text x="${PL}" y="12" fill="#e0e5e7" font-weight="700">${narrow ? 'Net GEX vs spot · $/1%' : 'Net GEX if spot moved to each price · $ per 1%'}</text>
   <path d="M${PL} ${bBase}H${W - PR}" stroke="#5d646b"/>${bars}<path d="${cumLn}" fill="none" stroke="#e0e5e7" stroke-width="1.4" stroke-dasharray="3 2"/>
   <text x="${PL}" y="${bTop - 6}" fill="#e0e5e7" font-weight="700">${narrow ? 'Listed strikes · cum. dashed' : `Net GEX by listed strikes, all expiries (bars) · cumulative (dashed, window sum ${usd(cTot)}; full-chain net ${usd(t.net_gex)})`}</text>
  </svg>`;
}

// ---------- strike x expiry / build heatmap + vol/OI ----------
function heatmap() {
  const t = det(state.sym);
  const lo = Math.min(t.put_wall ?? t.spot, t.spot - 2 * t.atr14), hi = Math.max(t.call_wall ?? t.spot, t.spot + 2 * t.atr14);
  let rows = t.strikes.filter((s) => s.k >= lo && s.k <= hi && (s.coi + s.poi + s.cv + s.pv) > 0);
  const CAP = 26;
  if (rows.length > CAP) { const keep = new Set([...rows].sort((a, b) => (Math.abs(b.cg) + Math.abs(b.pg)) - (Math.abs(a.cg) + Math.abs(a.pg))).slice(0, CAP).map((r) => r.k)); [t.call_wall, t.put_wall, t.abs_strike].forEach((k) => keep.add(k)); rows = rows.filter((r) => keep.has(r.k)); }
  rows.sort((a, b) => b.k - a.k);
  const builds = t.byBuild, EX = t.exps && rows.length && rows.every((r) => Array.isArray(r.by_exp)) ? t.exps : null;
  const expCols = (r) => EX ? [...r.by_exp, r.cg + r.pg - r.by_exp.reduce((a, b) => a + b, 0)] : [r.cg_near + r.pg_near, r.cg + r.pg - r.cg_near - r.pg_near];
  const vals = rows.flatMap((r) => [...expCols(r), ...builds.map((b) => b.net[r.k])]).filter(isNum);
  const max = Math.max(...vals.map(Math.abs), 1);
  const heat = (v) => { if (!isNum(v)) return `<td class="gated">—</td>`; const a = Math.min(1, Math.abs(v) / max); return `<td class="v ${cls(v)}" style="background:${v >= 0 ? `rgba(81,192,131,${(a * .16).toFixed(3)})` : `rgba(225,114,114,${(a * .18).toFixed(3)})`}">${usd(v)}${bar(v, max)}</td>`; };
  const vo = (v, oi) => { if (!oi) return `<td>${v ? '∞ new' : '—'}</td>`; const r = v / oi; return `<td class="${r >= 1 ? 'goldcell' : ''}">${ux(r, 2)}</td>`; };
  const role = (k) => (k === t.call_wall ? '<span class="role cw">CW</span>' : '') + (k === t.put_wall ? '<span class="role pw">PW</span>' : '') + (k === t.abs_strike ? '<span class="role">Abs</span>' : '');
  let html = '', spotDone = false;
  for (const r of rows) {
    const isSpotEdge = !spotDone && r.k < t.spot;
    if (isSpotEdge) { spotDone = true; html += `<tr class="spot"><td class="l" colspan="${6 + builds.length + (EX ? EX.length : 0)}" style="font-weight:600;color:#fff">— SPOT ${px(t.spot)} —${isNum(t.flip) ? ` flip ${px(t.flip)}` : ''}</td></tr>`; }
    html += `<tr><td class="l">${px(r.k)}${role(r.k)}</td>${expCols(r).map(heat).join('')}${builds.map((b) => heat(b.present ? (b.net[r.k] ?? 0) : null)).join('')}${vo(r.cv, r.coi)}${vo(r.pv, r.poi)}<td>${int(r.cv + r.pv)}</td></tr>`;
  }
  const exp = nearExpired(t.near_exp) ? ' · expired' : '';
  return `<div class="tw" style="max-height:640px"><table class="stick"><thead><tr><th class="l">Strike<small>$</small></th>
   ${EX ? EX.map((e) => `<th>${dayLbl(e)}<small>${e < todayISO ? 'expired · ' : ''}net GEX</small></th>`).join('') + '<th>Later<small>all minus listed</small></th>' : `<th>Nearest<small>${dayLbl(t.near_exp)}${exp}</small></th><th>Later expiries<small>all minus nearest</small></th>`}
   ${builds.map((b) => `<th>All exp · OI ${dayLbl(b.oi_asof)}<small>build ${dMT(Date.parse(b.built_at))} ${tMT(Date.parse(b.built_at))}${Date.parse(b.built_at) === builtMs ? ' · this one' : ''}</small></th>`).join('')}
   <th>Call vol ÷ OI<small>× today</small></th><th>Put vol ÷ OI<small>× today</small></th><th>Volume<small>contracts</small></th></tr></thead><tbody>${html}</tbody></table></div>`;
}

// ---------- wall / flip history ----------
function historySvg() {
  const t = det(state.sym), H0 = t.hist;
  const host = $('#gxHist'); const W = Math.max(320, host ? host.clientWidth : 800), narrow = W < 600;
  const H = narrow ? 300 : 340, PL = narrow ? 58 : 70, PR = 14, PT = 20, PB = 46;
  const keys = [['spot', '#ffffff', '0', 2], ['cw', '#51c083', '7 4', 1.8], ['pw', '#e17272', '7 4', 1.8], ['flip', '#e0e5e7', '2 3', 1.5], ['abs', '#b9c0c7', '9 3 2 3', 1.3]];
  const all = H0.flatMap((h) => keys.map(([k]) => h[k])).filter(isNum);
  let lo = Math.min(...all), hi = Math.max(...all); const pd = (hi - lo) * 0.06 || 1; lo -= pd; hi += pd;
  const n = H0.length, X = (i) => PL + (i + 0.5) / n * (W - PL - PR), Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  let g = ''; const st = niceStep(hi - lo, 6);
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) g += `<path d="M${PL} ${Y(v).toFixed(1)}H${W - PR}" stroke="#17191c"/><text x="${PL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="#bec7cd">${px(v)}</text>`;
  let ax = '', lastDay = '', lastLblX = -999;
  H0.forEach((h, i) => {
    const ms = Date.parse(h.spot_asof), day = dMT(ms);
    if (day !== lastDay) { const lx = X(i) - (W - PL - PR) / n / 2 + 4; ax += `<path d="M${(lx - 4).toFixed(1)} ${PT}V${H - PB + 30}" stroke="#2a2d31"/>`; if (lx - lastLblX > 70) { ax += `<text x="${lx.toFixed(1)}" y="${H - 6}" fill="#e0e5e7" font-weight="700">${day}</text>`; lastLblX = lx; } else ax += `<text x="${lx.toFixed(1)}" y="${H - 20}" fill="#e0e5e7" font-weight="700" font-size="9.5">${day.replace(/^\w+ /, '')}</text>`; lastDay = day; }
    if (!narrow || i % 2 === 0) ax += `<text x="${X(i).toFixed(1)}" y="${H - PB + 14}" text-anchor="middle" fill="#bec7cd">${mt12(ms)}</text>`;
    if (!h.present) ax += `<text x="${X(i).toFixed(1)}" y="${PT + 12}" text-anchor="middle" fill="#bec7cd">not in build</text>`;
  });
  let lines = '';
  for (const [k, c, dash, w] of keys) {
    let d = '', pen = false, prev = null;
    H0.forEach((h, i) => { const v = h[k]; if (!isNum(v)) { pen = false; prev = null; return; } const xa = X(i) - (k === 'spot' ? 0 : (W - PL - PR) / n / 2), xb = X(i) + (k === 'spot' ? 0 : (W - PL - PR) / n / 2);
      if (k === 'spot') { d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; }
      else { d += `${pen && prev != null ? `L${xa.toFixed(1)} ${Y(prev).toFixed(1)}L` : 'M'}${xa.toFixed(1)} ${Y(v).toFixed(1)}L${xb.toFixed(1)} ${Y(v).toFixed(1)}`; }
      pen = true; prev = v; });
    lines += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="${dash}"/>`;
    if (k === 'spot') H0.forEach((h, i) => { if (isNum(h.spot)) lines += `<circle cx="${X(i).toFixed(1)}" cy="${Y(h.spot).toFixed(1)}" r="2.6" fill="#fff"/>`; });
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;background:#000;border-radius:6px" font-size="${narrow ? 10 : 11}">${g}${ax}${lines}</svg>`;
}
function historyTable() {
  const t = det(state.sym), h = t.hist.filter((s) => s.present);
  const row = (name, key, cur) => {
    const vals = h.map((s) => s[key]); const nn = vals.filter(isNum);
    const counts = {}; nn.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, c]) => `${px(+v)} ×${c}`).join(' · ');
    const tol = key === 'flip' && isNum(t.atr14) ? 0.25 * t.atr14 : 0;
    const same = nn.filter((v) => isNum(cur) && Math.abs(v - cur) <= tol).length;
    const held = isNum(cur) && same / h.length >= 0.75;
    return `<tr class="${held ? 'goldrow' : ''}"><td class="l">${name}</td><td>${isNum(cur) ? px(cur) : 'none'}</td><td>${isNum(cur) ? `${same} of ${h.length}` : '—'}</td><td>${nn.length ? `${px(Math.min(...nn))} → ${px(Math.max(...nn))}` : '—'}</td><td class="l">${top || `null in ${h.length} of ${h.length}`}</td></tr>`;
  };
  return `<div class="tw"><table><thead><tr><th class="l">Level</th><th>Now<small>$</small></th><th>Same as now<small>${t.hist.length ? 'builds since ' + dayLbl(M.first_snap.slice(0, 10)) : ''}${'' }</small></th><th>Range<small>$ over these builds</small></th><th class="l">Most common<small>$ × builds</small></th></tr></thead><tbody>
  ${row('Call wall', 'cw', t.call_wall)}${row('Abs-γ strike', 'abs', t.abs_strike)}${row('Flip', 'flip', t.flip)}${row('Put wall', 'pw', t.put_wall)}</tbody></table></div>
  <div class="note">Gold row = level held in ≥ 75% of builds (flip counted within ±0.25× ATR). ${h.length} builds carry ${state.sym}, ${t.hist.length - h.length} do not. Window = the build history (last ${t.hist.length} builds); this is not a 2-yr view.</div>`;
}

// ---------- universe scatter + table ----------
const FIELDS = {
  stretch_x: ['Stretch (gamma build)', '× ATR vs EMA8'], mm_x: ['MR MAP stretch', '× ATR, MR MAP date'], stretch_vs_imove_x: ['Stretch ÷ implied move', '×'], gex_per_dv20_pct: ['GEX ÷ 20D $vol', '%'],
  net_gex: ['Net GEX', '$ per 1%'], flip_dist_x: ['Spot vs flip', '× ATR'], call_wall_dist_x: ['Call wall', '× ATR from spot'], put_wall_dist_x: ['Put wall', '× ATR from spot'],
  iv_atm_pct: ['ATM IV', '%'], imove_1d_pct: ['Implied move', '% 1-day'], vol_oi_x: ['Vol ÷ OI', '×'], cp_vol_x: ['C/P vol', '×'], ndoi_pct: ['NDOI', '% shares out'],
  dvol_call_pct: ['Δ-adj call vol', '% stock vol'], coi_above_pct: ['Call OI above spot', '% of call OI'], near_share_pct: ['Nearest-exp share', '% of |GEX|'], mm_pc: ['2-yr pctl of MR MAP stretch', '% (MR MAP)'],
};
const fmtField = (k, v) => { const u = FIELDS[k][1]; if (k === 'net_gex') return usd(v); if (u.startsWith('%')) return pc(v, k === 'gex_per_dv20_pct' ? 2 : 1, !['iv_atm_pct', 'imove_1d_pct', 'coi_above_pct', 'near_share_pct', 'mm_pc'].includes(k)); return xx(v); };
function universeRows() {
  return D.universe.filter((u) => (state.idx || u.kind === 'single') && (state.cap === 'ALL' || u.bkt === state.cap || (u.kind === 'index' && state.idx)));
}
const mmAxis = () => ['sx', 'sy'].some((a) => state[a] === 'mm_x' || state[a] === 'mm_pc');
const ringOk = (u) => mmAxis() || (!!mmDate && mmDate === (u.close_date || M.oi_asof));
function scatterSvg() {
  const host = $('#gxScat'); const W = Math.max(320, host ? host.clientWidth : 800), narrow = W < 600;
  const H = narrow ? 380 : 460, PL = narrow ? 52 : 66, PR = 16, PT = 14, PB = 40;
  const rows = universeRows().filter((u) => isNum(u[state.sx]) && isNum(u[state.sy]));
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
  const xs = rows.map((u) => u[state.sx]), ys = rows.map((u) => u[state.sy]);
  let x0 = Math.min(q(xs, 0.02), 0), x1 = Math.max(q(xs, 0.98), 0), y0 = Math.min(q(ys, 0.02), 0), y1 = Math.max(q(ys, 0.98), 0);
  if (state.sy === 'mm_pc') { y0 = 0; y1 = 100; } if (state.sx === 'mm_pc') { x0 = 0; x1 = 100; }
  const px_ = (x1 - x0) * 0.06 || 1, py_ = (y1 - y0) * 0.08 || 1; x0 -= px_; x1 += px_; y0 -= py_; y1 += py_;
  const X = (v) => PL + (Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0) * (W - PL - PR), Y = (v) => PT + (1 - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0)) * (H - PT - PB);
  let g = '';
  const sx = niceStep(x1 - x0, narrow ? 5 : 9), sy = niceStep(y1 - y0, 7);
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1; v += sx) g += `<path d="M${X(v).toFixed(1)} ${PT}V${H - PB}" stroke="${Math.abs(v) < sx / 2 ? '#5d646b' : '#16181b'}"/><text x="${X(v).toFixed(1)}" y="${H - PB + 14}" text-anchor="middle" fill="#bec7cd">${fmtField(state.sx, Math.abs(v) < sx / 2 ? 0 : v)}</text>`;
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1; v += sy) g += `<path d="M${PL} ${Y(v).toFixed(1)}H${W - PR}" stroke="${Math.abs(v) < sy / 2 ? '#5d646b' : '#16181b'}"/><text x="${PL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="#bec7cd">${fmtField(state.sy, Math.abs(v) < sy / 2 ? 0 : v)}</text>`;
  const clipped = (u) => u[state.sx] < x0 || u[state.sx] > x1 || u[state.sy] < y0 || u[state.sy] > y1;
  const xsd = Math.max(...xs.map(Math.abs), 1e-9), ysd = Math.max(...ys.map(Math.abs), 1e-9);
  const lab = new Set([...rows].sort((a, b) => (Math.abs(b[state.sx]) / xsd + Math.abs(b[state.sy]) / ysd) - (Math.abs(a[state.sx]) / xsd + Math.abs(a[state.sy]) / ysd)).slice(0, narrow ? 6 : 12).map((u) => u.t));
  tilePicks().forEach((p) => lab.add(p));
  let dots = '', lbl = '';
  for (const u of rows) {
    const c = u.stretch_x >= 0 ? '#51c083' : '#e17272', sel = u.t === state.sym, cl = clipped(u);
    const gold = ringOk(u) && isNum(u.mm_pc) && (u.mm_pc <= 5 || u.mm_pc >= 95);
    dots += `<circle cx="${X(u[state.sx]).toFixed(1)}" cy="${Y(u[state.sy]).toFixed(1)}" r="${sel ? 6 : 4.2}" fill="${cl ? '#000' : c}" stroke="${sel ? '#fff' : gold ? '#e4b76e' : cl ? c : '#0a0a0b'}" stroke-width="${sel ? 2.2 : gold ? 1.8 : 1.2}" data-pick="${u.t}" style="cursor:pointer"><title>${u.t} · ${FIELDS[state.sx][0]} ${fmtField(state.sx, u[state.sx])} · ${FIELDS[state.sy][0]} ${fmtField(state.sy, u[state.sy])}${cl ? ' (beyond axis, pinned to edge)' : ''}</title></circle>`;
    const lx = X(u[state.sx]), rightSide = lx + 7 + u.t.length * 7.2 < W - PR; if (lab.has(u.t)) lbl += `<text x="${(rightSide ? lx + 7 : lx - 7).toFixed(1)}" text-anchor="${rightSide ? 'start' : 'end'}" y="${(Y(u[state.sy]) - 6).toFixed(1)}" fill="#e0e5e7" stroke="#0a0a0b" stroke-width="3" paint-order="stroke" font-weight="700" ${sel ? 'text-decoration="underline"' : ''}>${u.t}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;background:#000;border-radius:6px" font-size="${narrow ? 10 : 11}">${g}${dots}${lbl}
   <text x="${W - PR}" y="${H - 6}" text-anchor="end" fill="#e0e5e7" font-weight="700">${FIELDS[state.sx][0]} · ${FIELDS[state.sx][1]} →</text>
   <text x="${PL + 4}" y="${PT + 10}" fill="#e0e5e7" font-weight="700">↑ ${FIELDS[state.sy][0]} · ${FIELDS[state.sy][1]}</text></svg>
   <div class="legend"><span><i class="sw" style="border-top:6px solid #51c083;width:8px;border-radius:4px"></i>close above EMA8</span><span><i class="sw" style="border-top:6px solid #e17272;width:8px;border-radius:4px"></i>close below EMA8</span><span><i class="sw" style="border:2px solid #e4b76e;width:9px;height:9px;border-radius:5px"></i>2-yr stretch extreme (≤ 5% / ≥ 95%, MR MAP; drawn only when its date matches the plotted stretch)</span><span>hollow = beyond the 2–98% axis, pinned to the edge</span><span>${rows.length} names plotted</span>${!mmAxis() && mmDate && mmDate !== M.oi_asof ? `<span>no gold rings: pctl date ${dayLbl(mmDate)} ≠ gamma date ${dayLbl(M.oi_asof)} (pick an MR MAP axis to see them)</span>` : ''}</div>`;
}
const COLS = [
  ['t', 'Ticker', '', 'l'], ['stretch_x', 'Stretch', `× ATR, ${dayLbl(M.oi_asof)} close`], ['mm_x', 'MR MAP stretch', `× ATR, ${mmDate ? dayLbl(mmDate) : '—'} close`], ['mm_pc', '2-yr pctl of that', '% (MR MAP)'], ['stretch_vs_imove_x', 'Stretch ÷ impl.', '× 1-day move'],
  ['net_gex', 'Net GEX', '$ per 1%'], ['gex_per_dv20_pct', 'GEX ÷ $vol', '% of 20D $vol'], ['g_pctl', 'GEX÷$vol pctl', `% vs singles, ${dayLbl(M.levels_for_session)}`],
  ['flip_dist_x', 'Spot vs flip', '× ATR'], ['call_wall_dist_x', 'Call wall', '× ATR from spot'], ['put_wall_dist_x', 'Put wall', '× ATR from spot'],
  ['ndoi_pct', 'NDOI', '% shares out'], ['dvol_call_pct', 'Δ-adj call vol', '% stock vol'], ['coi_above', 'Call OI > spot', 'contracts'], ['coi_above_pct', 'Call OI > spot', '% of call OI'],
  ['cp_vol_x', 'C/P vol', '×'], ['vol_oi_x', 'Vol ÷ OI', '×'], ['iv_atm_pct', 'ATM IV', '%'], ['coverage_pct', 'Coverage', '% of OI'],
];
const GREEK = new Set(['net_gex', 'gex_per_dv20_pct', 'g_pctl', 'flip_dist_x', 'ndoi_pct', 'iv_atm_pct', 'stretch_vs_imove_x']);
function universeTable() {
  const singles = D.universe.filter((u) => u.kind === 'single').map((u) => u.gex_per_dv20_pct);
  let rows = universeRows().map((u) => ({ ...u, g_pctl: u.kind === 'single' ? midRank(singles, u.gex_per_dv20_pct) : null, abs_stretch: Math.abs(u.stretch_x) }));
  const k = state.sort; rows.sort((a, b) => { const va = a[k], vb = b[k]; if (!isNum(va) && !isNum(vb)) return 0; if (!isNum(va)) return 1; if (!isNum(vb)) return -1; return (va - vb) * state.sortDir; });
  const mx = {}; for (const [c] of COLS) { const a = rows.map((r) => Math.abs(r[c])).filter(isNum).sort((p, q) => p - q); mx[c] = a.length ? Math.max(a[Math.floor(0.95 * (a.length - 1))], 1e-9) : 1; } // bars scale to the 95th pct; larger values fill the cell
  const cell = (r, c) => {
    const v = r[c];
    if (c === 't') return `<th class="l">${r.t}<em class="bkt">${r.bkt ? r.bkt[0] + r.bkt.slice(1).toLowerCase() : 'Index'}</em></th>`;
    if (!isNum(v)) {
      if (r.greeks_ok === false && GREEK.has(c)) return `<td class="gated" title="${esc(r.quality_note)}">gated</td>`;
      if (c === 'flip_dist_x' && r.greeks_ok) return `<td title="no zero crossing within ±15% of spot">none ±15%</td>`;
      if (c === 'mm_pc') return `<td title="not in MR MAP universe">—</td>`;
      return `<td>—</td>`;
    }
    switch (c) {
      case 'stretch_x': return vcell(xx(v), v, mx[c]);
      case 'stretch_vs_imove_x': return vcell(xx(v), v, mx[c]);
      case 'net_gex': return vcell(usd(v), v, mx[c]);
      case 'gex_per_dv20_pct': return vcell(pc(v, 2), v, mx[c]);
      case 'flip_dist_x': case 'call_wall_dist_x': case 'put_wall_dist_x': return vcell(xx(v), v, mx[c]);
      case 'ndoi_pct': return vcell(pc(v, 2), v, mx[c]);
      case 'mm_pc': return `<td class="${v <= 5 || v >= 95 ? 'goldcell' : ''}">${pc(v, 1, false)}</td>`;
      case 'mm_x': return vcell(xx(v), v, mx[c]);
      case 'g_pctl': return `<td>${pc(v, 0, false)}</td>`;
      case 'coi_above': return `<td>${int(v)}</td>`;
      case 'coi_above_pct': case 'dvol_call_pct': case 'iv_atm_pct': case 'coverage_pct': return `<td>${pc(v, 1, false)}</td>`;
      default: return `<td>${ux(v, 2)}</td>`;
    }
  };
  const arrow = (c) => (state.sort === c || (state.sort === 'abs_stretch' && c === 'stretch_x') ? (state.sortDir < 0 ? ' ▼' : ' ▲') : '');
  return `<div class="tw" style="max-height:620px"><table class="stick"><thead><tr>${COLS.map(([c, n, u, a]) => `<th class="${a || ''}" data-sort="${c}" style="cursor:pointer">${n}${arrow(c)}<small>${u}</small></th>`).join('')}</tr></thead><tbody>
  ${rows.map((r) => `<tr class="clk ${r.t === state.sym ? 'selrow' : ''}" data-pick="${r.t}" title="open lens">${COLS.map(([c]) => cell(r, c)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---------- board skin v2 quick view (Oct 19 2026): head · read · strip · quick panels; everything else sits under Deep view ----------
const extP = (p) => isNum(p) && (p <= 5 || p >= 95);
const ud2 = (v) => (isNum(v) && v > 0 ? 'up' : isNum(v) && v < 0 ? 'dn' : '');
const pcTrk = (p) => (!isNum(p) ? '<span class="t2">—</span>' : `<span class="pc${extP(p) ? ' ext' : ''}"><span class="trk"><i style="left:${p.toFixed(1)}%"></i></span><b>${pc(p, 1, false)}</b></span>`);
const dbar = (txt, v, max) => (!isNum(v) ? '<span class="t2">—</span>' : `<span class="db ${v >= 0 ? 'up' : 'dn'}">${txt}<i style="width:${Math.max(4, Math.min(1, Math.abs(v) / (max || 1)) * 64).toFixed(0)}px"></i></span>`);
function quickHead() {
  const ageH = (NOW - builtMs) / 3.6e6, missed = missedSessions(), stale = missed.length > 0 || ageH > 1.5;
  return `<div class="head"><h1>Gamma</h1><span class="meta">Levels for ${dayLbl(M.levels_for_session)} · OI ${dayLbl(M.oi_asof)} close · spot ${dMT(spotMs)} ${tMT(spotMs)} · built ${dMT(builtMs)} ${tMT(builtMs)} · ${D.universe.length} names · 15-min delayed</span>${stale ? `<span class="status">Stale: built ${ageH.toFixed(0)} h ago${missed.length ? ` · no build for ${missed.map(dayLbl).join(', ')}` : ''}</span>` : ''}</div>`;
}
function quickRead() {
  const t = det(state.sym), r = D.index_regime;
  const flipTxt = isNum(t.flip) ? `sits <b>${pc((t.spot / t.flip - 1) * 100, 2)}</b> (${xx(t.flip_dist_x)} ATR) ${t.spot >= t.flip ? 'above' : 'below'} the flip ${px(t.flip)}, on the <b>${t.spot >= t.flip ? 'positive' : 'negative'}-gamma side</b>` : t.greeks_ok ? `has no flip within ±15% of spot (net GEX ${usd(t.net_gex)} per 1%)` : `has greeks gated this build`;
  const ext = extP(r.gex_pctl2y) || extP(r.dix_pctl2y);
  return `<p class="read${ext ? ' ext' : ''}"><b>${state.sym} ${px(t.spot)}</b> ${flipTxt}; call wall <b>${px(t.call_wall)}</b> (${xx(t.call_wall_dist_x)} ATR), put wall <b>${px(t.put_wall)}</b> (${xx(t.put_wall_dist_x)} ATR). S&amp;P 500 GEX <b>${usd(r.gex_usd, false)} per 1%</b> sits at the <b>${pc(r.gex_pctl2y, 1, false)}</b> 2-yr pctl (${dayLbl(r.date)}).</p>`;
}
function quickStrip() {
  const r = D.index_regime, t = det(state.sym);
  const singles = D.universe.filter((u) => u.kind === 'single');
  const nExt = singles.filter((u) => extP(u.mm_pc)).length;
  const tile = (k, v, s, ext = false, mr = false) => `<div class="tile${ext ? ' ext' : ''}${mr ? ' mr' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `<div class="strip">${[
    tile(`S&amp;P 500 GEX · ${dayLbl(r.date)}`, `${usd(r.gex_usd, false)} <small>per 1%</small>`, `${pc(r.gex_pctl2y, 1, false)} 2-yr pctl · SqueezeMetrics`, extP(r.gex_pctl2y)),
    tile(`DIX dark-pool buy share`, pc(r.dix_pct, 1, false), `${pc(r.dix_pctl2y, 1, false)} 2-yr pctl · range ${pc(r.dix_lo2y, 1, false)} → ${pc(r.dix_hi2y, 1, false)}`, extP(r.dix_pctl2y)),
    tile(`${state.sym} vs flip`, isNum(t.flip) ? `<span class="${ud2(t.flip_dist_x)}">${xx(t.flip_dist_x)}</span> <small>ATR</small>` : (t.greeks_ok ? 'none' : 'gated'), isNum(t.flip) ? `spot ${px(t.spot)} · flip ${px(t.flip)} · ${t.spot >= t.flip ? 'positive' : 'negative'}-gamma side` : 'no zero crossing within ±15%'),
    tile(`${state.sym} walls`, `${px(t.call_wall)} <small>/ ${px(t.put_wall)}</small>`, `call ${xx(t.call_wall_dist_x)} · put ${xx(t.put_wall_dist_x)} ATR from spot`),
    tile('At a 2-yr stretch extreme', `${nExt} <small>names</small>`, `of ${singles.length} singles · MR MAP ${mmDate ? dayLbl(mmDate) : '—'} close`, nExt > 0, true),
  ].join('')}</div>`;
}
function quickLens() {
  const rows = D.universe.filter((u) => isNum(u.stretch_x)).slice().sort((a, b) => Math.abs(b.stretch_x) - Math.abs(a.stretch_x)).slice(0, 12);
  const mx = Math.max(...rows.map((u) => Math.abs(u.stretch_x)), 1e-9), gx = Math.max(...rows.map((u) => Math.abs(u.net_gex || 0)), 1e-9);
  const body = rows.map((u) => `<tr class="click${extP(u.mm_pc) ? ' ext' : ''}${u.t === state.sym ? ' open' : ''}" data-pick="${u.t}"><th>${u.t}<span class="chip">${u.bkt ? u.bkt[0] + u.bkt.slice(1).toLowerCase() : 'Index ETF'}</span></th><td>${dbar(xx(u.stretch_x), u.stretch_x, mx)}</td><td>${pcTrk(u.mm_pc)}</td><td class="opt ${ud2(u.flip_dist_x)}">${isNum(u.flip_dist_x) ? xx(u.flip_dist_x) : (u.greeks_ok ? 'none' : 'gated')}</td><td class="opt">${xx(u.call_wall_dist_x)}</td><td class="opt">${xx(u.put_wall_dist_x)}</td><td class="opt">${dbar(usd(u.net_gex), u.net_gex, gx)}</td></tr>`).join('');
  return `<section class="panel"><h2>Mean-reversion lens: most stretched names</h2><p class="sub">12 of ${D.universe.length} names by |stretch| at the ${dayLbl(M.oi_asof)} close · gold row = MR MAP 2-yr pctl ≤ 5% or ≥ 95% · click a row to load its levels</p><div class="tw"><table class="t"><thead><tr><th class="l">Name</th><th>Stretch<small>× ATR vs 8EMA</small></th><th>2-yr pctl<small>MR MAP ${mmDate ? dayLbl(mmDate) : '—'}</small></th><th class="opt">Spot vs flip<small>× ATR</small></th><th class="opt">Call wall<small>× ATR from spot</small></th><th class="opt">Put wall<small>× ATR from spot</small></th><th class="opt">Net GEX<small>$ per 1%</small></th></tr></thead><tbody>${body}</tbody></table></div><p class="note">Descriptive, not an edge claim. Walls and flip are dealer-positioning levels under our sign rule (long calls, short puts).</p></section>`;
}
function quickLevels() {
  const t = det(state.sym), dp = (v) => (isNum(v) ? (v / t.spot - 1) * 100 : null);
  const row = (n, v, x, cls = '') => `<tr class="${cls}"><th>${n}</th><td>${isNum(v) ? px(v) : (t.greeks_ok ? 'none' : 'gated')}</td><td class="${ud2(dp(v))}">${isNum(v) ? pc(dp(v), 2) : '—'}</td><td class="${ud2(x)}">${xx(x)}</td></tr>`;
  const gold = t.mm && extP(t.mm.pc);
  return `<section class="panel"><h2>${state.sym} key levels</h2><p class="sub">spot ${px(t.spot)} · ${tMT(spotMs)} ${dMT(spotMs)} · ATR14 ${px(t.atr14)}</p><div class="tw"><table class="t"><thead><tr><th class="l">Level</th><th>Price<small>$</small></th><th>Vs spot<small>%</small></th><th>Distance<small>× ATR</small></th></tr></thead><tbody>
  ${row('Call wall', t.call_wall, t.call_wall_dist_x)}${row('Abs-γ strike', t.abs_strike, t.abs_strike_dist_x)}${row('Flip', t.flip, isNum(t.flip) && isNum(t.atr14) ? (t.flip - t.spot) / t.atr14 : null)}${row('Put wall', t.put_wall, t.put_wall_dist_x)}
  <tr><th>Implied move<small>1-day · ATM IV ${pc(t.iv_atm_pct, 1, false)}</small></th><td>±${isNum(t.imove_1d_pct) ? px(t.spot * t.imove_1d_pct / 100) : '—'}</td><td>±${pc(t.imove_1d_pct, 2, false)}</td><td></td></tr>
  <tr><th>Stretch<small>${dayLbl(t.close_date || M.oi_asof)} close vs EMA8</small></th><td>${px(t.close)}</td><td class="${ud2(t.stretch_vs_imove_x)}">${xx(t.stretch_vs_imove_x)}<small>impl. move</small></td><td class="${ud2(t.stretch_x)}">${xx(t.stretch_x)}</td></tr>
  <tr class="${gold ? 'ext' : ''}"><th>2-yr stretch pctl<small>${t.mm && isNum(t.mm.pc) ? `MR MAP · ${dayLbl(mmDate)} close` : 'not in MR MAP (ETF or short history)'}</small></th><td colspan="3">${t.mm ? pcTrk(t.mm.pc) : '—'}</td></tr>
  <tr><th>Net GEX<small>per 1% move</small></th><td colspan="3" class="${ud2(t.net_gex)}">${usd(t.net_gex)}</td></tr>
  </tbody></table></div></section>`;
}
function drawDeep() {
  if (!$('#gxChart')) return;
  drawChart();
  $('#gxProf').innerHTML = profileSvg();
  $('#gxHist').innerHTML = historySvg();
  $('#gxScat').innerHTML = scatterSvg();
}

// ---------- page ----------
function render() {
  const t = det(state.sym);
  const sessions = Object.keys(t.bars || {}).filter((d) => d >= M.levels_for_session).sort();
  if (!sessions.includes(state.sess) && sessions.length) state.sess = sessions[0];
  ROOT.innerHTML = `<div class="sk">${quickHead()}${quickRead()}${quickStrip()}<div class="grid2 wide-left">${quickLens()}${quickLevels()}</div>
  <details class="deep" id="gxDeep"${state.deep ? ' open' : ''}><summary>Deep view <span>freshness and rules, index and ticker tiles, 2m chart with levels, MR read, GEX 1–10, gamma curve, strike matrix, wall history, universe scatter and table, definitions</span></summary><div class="body gxl">${header()}
  <div class="tiles" data-sk-label="Index &amp; ticker tiles">${indexTiles()}${tilePicks().map(tickerTile).join('')}</div>
  <div class="ctrl"><label>Ticker <input class="gx-in" id="gxTk" list="gxTkL" value="${state.sym}" maxlength="10" aria-label="Ticker"></label><datalist id="gxTkL">${D.universe.map((u) => `<option value="${u.t}">`).join('')}</datalist><span>${D.universe.length} names in this build</span></div>
  <div class="grid-lens" data-sk-label="2m chart &amp; MR read">
    <div class="panel"><div class="ph"><div class="l"><h2>${state.sym} · levels on the 2m chart</h2><span class="src">copies SpotGamma TRACE / key levels on price</span></div>
      <div class="seg" data-seg="sess">${sessions.map((d) => `<button data-v="${d}" class="${state.sess === d ? 'on' : ''}">${dayLbl(d)}${d === M.levels_for_session ? ' · levels session' : ' · no build'}</button>`).join('')}</div></div>
      <div id="gxChart" class="chart-host"></div>
      <div class="legend"><span><i class="sw" style="border-color:#51c083;border-top-style:dashed"></i>call wall</span><span><i class="sw" style="border-color:#e17272;border-top-style:dashed"></i>put wall</span><span><i class="sw" style="border-color:#e0e5e7;border-top-style:dotted"></i>flip</span><span><i class="sw" style="border-color:#b9c0c7;border-top-style:dashed"></i>abs-γ strike</span><span><i class="sw" style="border-color:#bec7cd;border-top-style:dotted;border-top-width:1px"></i>implied ±1σ (1-day)</span><span><i class="sw" style="border-color:#2f55d4"></i>VWAP incl. ext hours</span><span><i class="sw" style="border-color:#ff9800"></i>EMA 8</span><span><i class="sw" style="border-color:#a23bc4"></i>BB 20,2</span></div>
      <div class="note" id="gxChartNote"></div></div>
    <div class="side">${mrRead()}${keyLevels()}</div>
  </div>
  <div class="grid-b" data-sk-label="GEX ladder &amp; gamma curve">
    ${ladder()}
    <div class="panel"><div class="ph"><div class="l"><h2>Gamma curve · ${state.sym}</h2><span class="src">copies OptionsAnalysisSuite curve + MenthorQ net-GEX bars</span></div><span class="h-sub">${t.gex_profile ? t.gex_profile.length + ' points · ±15% of spot' : 'gated'}</span></div>
      <div id="gxProf"></div><div class="note">${isNum(t.flip) ? `The curve crosses zero at the flip <b>${px(t.flip)}</b> (${xx(flipDistX(t))} ATR from spot).` : t.greeks_ok ? `<b>No zero crossing</b> from ${px(t.gex_profile[0][0])} to ${px(t.gex_profile[30][0])}: net GEX stays ${t.net_gex >= 0 ? 'positive' : 'negative'} across ±15% of spot, so no flip is printed.` : 'Greeks gated this build.'}</div></div>
  </div>
  <div class="grid-2" data-sk-label="Strike matrix &amp; wall history">
    <div class="panel"><div class="ph"><div class="l"><h2>Strike × expiry · strike × build</h2><span class="src">copies Quant Data / QuantWheel matrix + Barchart vol-vs-OI</span></div><span class="h-sub">net GEX $ per 1% · ${state.sym}</span></div>
      ${heatmap()}<div class="note">Green = net long-gamma strike, red = net short-gamma strike; tint and bar scale with size. <b>Gold cell</b> = today's volume ≥ 1× open interest at that strike (volume ≥ open interest). ${det(state.sym).strikes.some((r) => Array.isArray(r.by_exp)) ? 'Columns = the nearest expiries in this build; later = the rest.' : 'This build has no per-expiry split yet (Nearest vs Later only); it appears after the next builder run.'} ${winLabel(t)}.</div></div>
    <div class="stack">
    <div class="panel"><div class="ph"><div class="l"><h2>Wall &amp; flip history · ${state.sym}</h2><span class="src">build history</span></div><span class="h-sub">${det(state.sym).hist.length} builds · ${M.first_snap ? dMT(Date.parse(M.first_snap)) + ' → ' + dMT(Date.parse(M.last_snap)) : ''}</span></div>
      <div id="gxHist"></div>
      <div class="legend"><span><i class="sw" style="border-color:#fff"></i>spot at build</span><span><i class="sw" style="border-color:#51c083;border-top-style:dashed"></i>call wall</span><span><i class="sw" style="border-color:#e17272;border-top-style:dashed"></i>put wall</span><span><i class="sw" style="border-color:#e0e5e7;border-top-style:dotted"></i>flip</span><span><i class="sw" style="border-color:#b9c0c7;border-top-style:dashed"></i>abs-γ</span><span>times = spot time of each build, MT</span></div></div>
    <div class="panel"><div class="ph"><div class="l"><h2>Persistence</h2><span class="h-sub">how many of the last builds printed the same level</span></div></div>${historyTable()}</div>
    </div>
  </div>
  <div class="panel" style="margin-bottom:10px" data-sk-label="Universe scatter &amp; table"><div class="ph"><div class="l"><h2>Universe · pick any two columns</h2><span class="src">copies SpotGamma Compass, with your axes</span></div><span class="h-sub">${D.universe.length} names · build ${dMT(builtMs)} ${tMT(builtMs)}</span></div>
    <div class="ctrl"><label>X <select data-ax="sx">${Object.entries(FIELDS).map(([k, [n, u]]) => `<option value="${k}" ${state.sx === k ? 'selected' : ''}>${n} (${u})</option>`).join('')}</select></label>
      <label>Y <select data-ax="sy">${Object.entries(FIELDS).map(([k, [n, u]]) => `<option value="${k}" ${state.sy === k ? 'selected' : ''}>${n} (${u})</option>`).join('')}</select></label>
      <span>Caps</span><div class="seg" data-seg="cap">${['ALL', 'SMALL', 'MID', 'LARGE'].map((c) => `<button data-v="${c}" class="${state.cap === c ? 'on' : ''}">${c[0] + c.slice(1).toLowerCase()}</button>`).join('')}</div>
      <div class="seg" data-seg="idx"><button data-v="0" class="${state.idx ? '' : 'on'}">Singles</button><button data-v="1" class="${state.idx ? 'on' : ''}">+ Index ETFs</button></div></div>
    <div id="gxScat"></div>
    <div class="ph" style="margin:12px 0 4px"><div class="l"><h2 style="font-size:13.5px">Positioning · raw columns, no score</h2></div><span class="h-sub">click a header to sort · gold cell = MR MAP 2-yr pctl ≤ 5% / ≥ 95% · click a row to open its lens</span></div>${universeTable()}
  </div>
  <div class="foot" data-sk-label="Definitions"><b>Definitions &amp; sources</b>
   <dl>
    <div><dt>Net GEX · $ per 1%</dt><dd>Σ gamma × OI × 100 × spot² × 1%, calls +, puts − (dealer side assumed). OI = ${dayLbl(M.oi_asof)} close.</dd></div>
    <div><dt>Flip · $</dt><dd>${esc(M.flip_method)}; nearest zero crossing on a 0.25% grid, ±15% of spot. "none" = the curve never crosses zero in that range.</dd></div>
    <div><dt>Implied move · % 1-day</dt><dd>ATM IV ÷ √252 (call/put mean at the strike nearest spot, expiry nearest 30 days). Band on the chart is anchored on the prior close.</dd></div>
    <div><dt>Stretch · × ATR</dt><dd>(close − EMA8 of daily closes) ÷ ATR14 Wilder, the MR MAP definition. Stretch ÷ implied = $ stretch ÷ $ implied 1-day move.</dd></div>
    <div><dt>GEX ÷ 20D $vol · % and its percentiles</dt><dd>Own pctl = mid-rank among this ticker's builds in the archive (over the build history, n shown). Cross-section = mid-rank among singles in this build. Neither is a 2-yr figure.</dd></div>
    <div><dt>2-yr stretch pctl · %</dt><dd>From MR MAP (${esc(M.mm_asof)}, built ${esc(M.mm_built)}): mid-rank of today's stretch among that name's last 504 sessions.</dd></div>
    <div><dt>Positioning · raw</dt><dd>NDOI = Σ OI × delta × 100 ÷ shares out. Δ-adj call vol = Σ call vol × |delta| × 100 ÷ stock volume. Call OI &gt; spot = call contracts at strikes above spot. No composite score.</dd></div>
    <div><dt>After-hours gate</dt><dd>${esc(M.quality_gate)}</dd></div>
    <div><dt>Sources</dt><dd>${esc(M.source)}. 2m bars: the board's chart-bars feed (same as the NOW tab). History: the last ${M.n_snaps} builds carried in gamma.json.</dd></div>
   </dl></div></div></details></div>`;
  if (state.deep) drawDeep();
}

  Object.assign(state, keep.state || {});
  if (!universe.some((u) => u.t === state.sym)) state.sym = universe[0].t;
  function renderAll() { render(); ensureBars(state.sym); }
  ROOT.onclick = (e) => {
    const pk = e.target.closest('[data-pick]');
    if (pk && universe.some((u) => u.t === pk.dataset.pick)) { state.sym = pk.dataset.pick; state.sess = M.levels_for_session; renderAll(); return; }
    const b = e.target.closest('.seg button');
    if (b) { const s = b.parentElement.dataset.seg, v = b.dataset.v; if (s === 'ladder') state.ladder = v; if (s === 'sess') state.sess = v; if (s === 'cap') state.cap = v; if (s === 'idx') state.idx = v === '1'; renderAll(); return; }
    const th = e.target.closest('th[data-sort]');
    if (th) { const c = th.dataset.sort === 'stretch_x' ? 'abs_stretch' : th.dataset.sort; if (state.sort === c) state.sortDir *= -1; else { state.sort = c; state.sortDir = -1; } renderAll(); }
  };
  if (ROOT._gxToggle) ROOT.removeEventListener('toggle', ROOT._gxToggle, true);
  ROOT._gxToggle = (e) => { if (e.target && e.target.id === 'gxDeep') { state.deep = e.target.open; if (state.deep) drawDeep(); } };
  ROOT.addEventListener('toggle', ROOT._gxToggle, true);
  ROOT.onchange = (e) => {
    const s = e.target.closest('select[data-ax]'); if (s) { state[s.dataset.ax] = s.value; renderAll(); return; }
    const i = e.target.closest('#gxTk'); if (i) { const v = i.value.toUpperCase().trim(); if (universe.some((u) => u.t === v)) { state.sym = v; state.sess = M.levels_for_session; } renderAll(); }
  };
  return { render: renderAll, state, BARS };
}

// ---------- browser wiring ----------
function boot() {
  const STALE_MS = 10 * 60 * 1000;
  let live = null, mmDoc = null, loadedAt = 0, loading = null, inst = null, resizeT = 0;
  const qs = new URLSearchParams(window.location.search);
  const qT = (qs.get('t') || '').toUpperCase().trim();
  if (!document.getElementById('gammaTabCss')) { const st = document.createElement('style'); st.id = 'gammaTabCss'; st.textContent = CSS; document.head.appendChild(st); }
  const btn = document.querySelector('.view-tab[data-view="gamma"]');
  const panel = document.getElementById('view-gamma');
  if (!btn || !panel) return;
  let root = document.getElementById('gammaRoot');
  if (!root) { root = document.createElement('div'); root.id = 'gammaRoot'; panel.appendChild(root); }
  const paint = () => {
    if (!live) return;
    try {
      const keep = inst ? { state: inst.state, BARS: inst.BARS } : { state: /^[A-Z][A-Z0-9.-]{0,9}$/.test(qT) ? { sym: qT } : {} };
      inst = create(root, live, mmDoc, keep); inst.render();
    } catch (e) { root.innerHTML = '<div class="gx-err">GAMMA could not be drawn (' + String((e && e.message) || e).replace(/[<>&]/g, '') + ').</div>'; }
  };
  const getJson = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  function load() {
    if (loading) return loading;
    if (!live) root.innerHTML = '<div class="gx-err">Loading gamma data…</div>';
    loading = Promise.all([getJson('./data/gamma.json'), getJson('./data/mrmap.json').catch(() => null)])
      .then(([g, m]) => { const bad = validate(g); if (bad) throw new Error('data does not match the expected layout: ' + bad); live = g; mmDoc = m; loadedAt = Date.now(); loading = null; paint(); })
      .catch((e) => { loading = null; const msg = (e && e.message) || String(e); if (live) paint(); else root.innerHTML = '<div class="gx-err">Gamma data did not load (' + msg.replace(/[<>&]/g, '') + '). Press 0 to retry.</div>'; });
    return loading;
  }
  function activate() {
    document.querySelectorAll('[data-view-panel]').forEach((p) => { const on = p === panel; p.hidden = !on; p.classList.toggle('active', on); });
    document.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t === btn));
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (!live || Date.now() - loadedAt > STALE_MS) load(); else paint();
  }
  btn.addEventListener('click', activate);
  document.querySelectorAll('.view-tab').forEach((t) => { if (t !== btn) t.addEventListener('click', () => { panel.hidden = true; panel.classList.remove('active'); btn.classList.remove('active'); }); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '0' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    activate();
  });
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (inst && !panel.hidden) inst.render(); }, 150); });
  if (window.location.hash === '#gamma') activate();
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') boot();
