// PHONE glance layout (V2.18.0). Below 600 px wide (or a landscape phone up to 520 px tall) the board is
// replaced by one-column cards, a bottom tab bar (NOW / MARKET / GAMMA / REGIME / MORE), a freshness badge
// and its own pull-to-refresh. Above that, nothing here is visible: the module only injects CSS scoped to
// `.ph-root` / `html.ph-on` and a hidden container, so the desktop board is untouched.
// Data = the same files the desktop tabs read: now-stretch.json (NOW), mrmap.json (MARKET), gamma.json
// (GAMMA), regime-2y.json + breadth-tape.json (REGIME). No network call other than those static files.
// Laws: bright text only (#e0e5e7 / #bec7cd), every number unit-marked, gold = fill / edge only (never text),
// D4 palette (#51c083 / #e17272), times in MT, raw primitives (no grades).
import { decode, rails, median, candleSpark } from './mr-map.mjs?v=V2.19.6';
import { hm12, marketSessionClock, previousTradingSession, sessionCloseMinute } from './market-calendar.mjs';

export const VERSION = 'V2.18.0';

// ---- The designer's 3 NEEDS-YOU picks, as easy-to-flip constants (Oct 7 2026) ----
export const PHONE_CHOICES = Object.freeze({
  // 1. What the GAMMA slot shows: 'spy+stretched' (pick) | 'spy' | 'themes' (card pointing at the full THEMES tab)
  gammaSlot: 'spy+stretched',
  // 2. Sparkline per card: 'daily20d' = 30 daily closes + 20D mean line (pick).
  //    'intraday' / 'daily-then-intraday' need one chart-bars call per card: NOT built, they fall back to daily.
  sparkline: 'daily20d',
  // 3. What a card tap does: 'expand' (pick) | 'chart' (straight to the full board's 2m chart) | 'longpress' (tap expands, hold opens the chart)
  cardTap: 'expand',
});

// Coarse pointer = a touch phone. A narrow or short DESKTOP window (mouse) keeps the desktop board.
export const PHONE_MQ = '(max-width: 600px) and (pointer: coarse), (orientation: landscape) and (max-height: 520px) and (max-width: 1000px) and (pointer: coarse)';
export const MIN_1YR_SESSIONS = 252; // a window shorter than this is never called a 1-yr extreme
export const EXT_LO = 5, EXT_HI = 95; // 2-yr / 1-yr percentile extremes (same cut as the MR MAP)
export const AH_FLOOR_PCT = 0.25; // |AH move| below this is flat, never counted as toward/away from the mean
export const PTR_THRESHOLD = 70; // px of pull before a refresh fires
export const STORE_KEY = 'radar.v2.phone';
export const FULL_KEY = 'radar.phone.full';
export const OPEN_KEY = 'radar.phone.open';

// ---------- formatting (every number unit-marked) ----------
const MINUS = '−';
export const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function sgn(v, d, u) {
  if (!fin(v)) return 'n/a';
  const r = Number(Math.abs(v).toFixed(d));
  if (r === 0) return `${(0).toFixed(d)}${u}`;
  return `${v > 0 ? '+' : MINUS}${r.toFixed(d)}${u}`;
}
export const fx = (v, d = 2) => sgn(v, d, '×');
export const fp = (v, d = 2) => sgn(v, d, '%');
export const fz = (v) => sgn(v, 2, 'σ');
export const px = (v) => (!fin(v) ? 'n/a' : `$${Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4)}`);
export function usd(v) {
  if (!fin(v)) return 'n/a';
  const a = Math.abs(v), s = v < 0 ? MINUS : '';
  return `${s}$${a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0)}`;
}
export const n0 = (v) => (fin(v) ? v.toLocaleString('en-US') : 'n/a');
export const cls = (v) => (!fin(v) ? 't2' : Math.abs(v) < 0.005 ? 'nt' : v > 0 ? 'up' : 'dn');
export const pctl = (v) => (fin(v) ? `${v.toFixed(1)}%` : 'n/a');

// ---------- Mountain Time (DST-aware, computed from the instant) ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function denverParts(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((v) => [v.type, v.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}
// "2026-10-06 14:57" (wall clock in MT) -> UTC ms.
export function mtToUtc(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  for (const off of [6, 7]) { // MDT is UTC-6, MST is UTC-7
    const t = wall + off * 3600000, q = denverParts(t);
    if (q.y === +m[1] && q.mo === +m[2] && q.d === +m[3] && q.h === +m[4] && q.mi === +m[5]) return t;
  }
  return null;
}
export function instantMs(s) {
  if (fin(s)) return s;
  const str = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?!.*(Z|[+-]\d{2}:?\d{2}))/.test(str) && !str.endsWith('Z')) return mtToUtc(str.replace(/ MT$/, ''));
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
}
export function fmtMt(ms, { date = true } = {}) {
  if (!fin(ms)) return 'n/a';
  const q = denverParts(ms), hm = hm12(q.h, q.mi);
  return `${date ? `${MON[q.mo - 1]} ${q.d} ` : ''}${hm} MT`;
}
export function fmtDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${MON[+m[2] - 1]} ${+m[3]}` : 'n/a';
}
export function dowDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${MON[+m[2] - 1]} ${+m[3]}` : 'n/a';
}
export function ago(fromMs, toMs) {
  if (!fin(fromMs) || !fin(toMs)) return 'n/a';
  const m = Math.max(0, Math.round((toMs - fromMs) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
export function ageLong(fromMs, toMs) {
  if (!fin(fromMs) || !fin(toMs)) return 'n/a';
  const m = Math.max(0, Math.round((toMs - fromMs) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// ---------- freshness (calendar-aware; snapshots never claim to be live) ----------
// Last COMPLETED session = what a closed-snapshot feed should be on.
export function expectedSession(nowMs) {
  const c = marketSessionClock(nowMs);
  if (!c) return null;
  return c.completed ? c.sessionDate : previousTradingSession(c.sessionDate);
}
export function closeMt(sessionDate) {
  const m = sessionCloseMinute(sessionDate);
  return m == null ? hm12(14, 0) : hm12(Math.floor((m - 120) / 60), (m - 120) % 60); // ET close -> MT
}
// The state comes from the market calendar + the real clock, never from the file alone.
export function freshness({ sessionDate, builtMs, label = '', note = '' }, nowMs) {
  const clock = marketSessionClock(nowMs), exp = expectedSession(nowMs);
  if (!sessionDate || !exp || !clock) return { cls: 'unk', big: 'Source unknown', small: note || 'no session date in the feed' };
  const day = fmtDay(sessionDate);
  const bits = [builtMs ? `${label || 'built'} ${fmtMt(builtMs)}` : label, note].filter(Boolean).join(' \u00b7 ');
  if (sessionDate === clock.sessionDate && !clock.completed && !clock.closedDay) { // market day in progress: never "CLOSED"
    return { cls: '', big: builtMs ? `Intraday \u00b7 as of ${fmtMt(builtMs, { date: false })}` : 'Intraday', small: [note, 'session not closed'].filter(Boolean).join(' \u00b7 ') };
  }
  if (sessionDate < exp) return { cls: 'stale', big: `Behind \u00b7 ${day}`, small: bits || `latest feed is ${fmtDay(sessionDate)}` };
  return { cls: '', big: `Last close \u00b7 ${day} ${closeMt(sessionDate)} MT`, small: bits };
}

// GAMMA: the badge may only name a close at or before the clock. It is derived from the BUILD time, never from levels_for_session
// (the builder also writes next-session files, e.g. built Fri 13:55 MT for Monday).
const OPEN_MIN_ET = 570; // 09:30 ET
// Last session whose close time (not the calendar's +15 min grace) is at or before the clock.
function lastDoneSession(c) {
  return !c.closedDay && c.minute >= sessionCloseMinute(c.date) ? c.date : previousTradingSession(c.date);
}
function builtLbl(ms, nowMs) { // year only when it differs from the clock's year
  const y = (t) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric' }).format(new Date(t));
  return `Built ${y(ms) !== y(nowMs) ? fmtMt(ms).replace(/^(\w+ \d+)/, `$1 ${y(ms)}`) : fmtMt(ms)}`;
}
export function gammaBadge({ builtMs, note = '' }, nowMs) {
  const clock = marketSessionClock(nowMs), bc = fin(builtMs) ? marketSessionClock(builtMs) : null;
  if (!clock || !bc || builtMs > nowMs + 60000) return { cls: 'unk', big: fin(builtMs) ? builtLbl(builtMs, nowMs) : 'Source unknown', small: note || 'build time ambiguous' };
  const done = lastDoneSession(clock);
  if (!done) return { cls: 'unk', big: builtLbl(builtMs, nowMs), small: note };
  const built = fmtMt(builtMs, { date: false }), bits = [`built ${fmtMt(builtMs)}`, note].filter(Boolean).join(' · ');
  const inSession = !bc.closedDay && bc.minute >= OPEN_MIN_ET && bc.minute < sessionCloseMinute(bc.date);
  const closeLine = (close) => { // a completed close the build can honestly name
    if (!close || close > done) return { cls: 'unk', big: builtLbl(builtMs, nowMs), small: note };
    return close < done ? { cls: 'stale', big: `Behind · ${fmtDay(close)}`, small: bits }
      : { cls: '', big: `Last close · ${fmtDay(close)} ${closeMt(close)} MT`, small: bits };
  };
  if (inSession) { // built during its session, before the close
    if (clock.date === bc.date && !clock.closedDay && clock.minute >= OPEN_MIN_ET && clock.minute < sessionCloseMinute(clock.date)) {
      return { cls: '', big: `Intraday · built ${built}`, small: [note, 'session not closed'].filter(Boolean).join(' · ') };
    }
    if (bc.date === done) return { cls: '', big: `Pre-close · ${dowDay(bc.date)} ${built}`, small: bits }; // newest session, nothing newer exists
    return closeLine(previousTradingSession(bc.date)); // a newer session has completed since the build's session
  }
  if (!bc.closedDay && bc.minute < sessionCloseMinute(bc.date)) return closeLine(previousTradingSession(bc.date)); // pre-open build: only the prior close is real
  return closeLine(bc.sessionDate); // post-close / non-session-day build
}

// ---------- NOW cards ----------
export const pctOf = (r) => (r.book === 'ML' ? (fin(r.p2) ? r.p2 : null) : (fin(r.p1) ? r.p1 : null));
export const isStale = (r) => !!(r.poller_stale || r.stale);
export const shortWindow = (r) => r.book !== 'ML' && fin(r.n1) && r.n1 < MIN_1YR_SESSIONS;
export const winLabel = (r) => (r.book === 'ML' ? '2-yr' : shortWindow(r) ? `${r.n1} sess` : '1-yr');
export const isExt = (r) => { if (isStale(r) || shortWindow(r)) return false; const p = pctOf(r); return fin(p) && (p <= EXT_LO || p >= EXT_HI); };
export const SORTS = ['pct', 'chg', 'dvol'];
export const SORT_LABEL = { pct: 'pctl', chg: '|chg %|', dvol: '$vol' };
export function sortRows(list, sort) {
  return list.slice().sort((a, b) => {
    if (isStale(a) !== isStale(b)) return isStale(a) ? 1 : -1;
    if (sort === 'chg') return Math.abs(b.chg ?? 0) - Math.abs(a.chg ?? 0);
    if (sort === 'dvol') return (b.dvol || 0) - (a.dvol || 0);
    const pa = pctOf(a), pb = pctOf(b);
    return (fin(pb) ? Math.abs(pb - 50) : -1) - (fin(pa) ? Math.abs(pa - 50) : -1);
  });
}
// AH move sign opposite the stretch side = already moving toward the mean. A fact, not a score.
export function toward(r) {
  const p = pctOf(r);
  if (!fin(p) || !fin(r.ah_pct) || Math.abs(r.ah_pct) < AH_FLOOR_PCT) return '';
  return (p >= 50) === (r.ah_pct < 0) ? 'toward the mean' : 'away from the mean';
}
export function spark(closes) {
  const w = 200, h = 38, c = (closes || []).filter(fin).slice(-30);
  if (c.length < 3) return '<svg viewBox="0 0 200 38" preserveAspectRatio="none"></svg>';
  const m20 = c.slice(-20), mu = m20.reduce((a, v) => a + v, 0) / m20.length;
  const cs = candleSpark(c, { w, h, padTop: 3, padBot: 3, extra: [mu] }), y = (v) => cs.y(v).toFixed(1);
  const col = c[c.length - 1] >= c[0] ? '#51c083' : '#e17272';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(mu)}" y2="${y(mu)}" stroke="#bec7cd" stroke-opacity=".7" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>${cs.body}<circle cx="${cs.x(c.length - 1).toFixed(1)}" cy="${y(c[c.length - 1])}" r="3" fill="${col}"/></svg>`;
}
// Stretch bar: fill from the 50% line to the marker; ticks at 5 / 50 / 95 %. (Kept for callers; the skin-v2 phone uses pcCell.)
export function pbar(p) {
  if (!fin(p)) return '<div class="pb"><em></em></div>';
  const c = p >= 50 ? 'var(--up)' : 'var(--dn)', l = Math.min(p, 50), w = Math.abs(p - 50);
  return `<div class="pb"><em></em><s style="left:${l}%;width:${w}%;background:${c}"></s><i style="left:${p}%;background:${c}"></i></div>`;
}
// ---------- board skin v2 parts (shared .sk kit from terminal-skin.css) ----------
const isExtP = (p) => fin(p) && (p <= EXT_LO || p >= EXT_HI);
// 2-yr percentile cell: kit .pc track + bold value (the track hides under 700 px, as in the mocks).
export function pcCell(p, ext = isExtP(p)) {
  if (!fin(p)) return 'n/a';
  return `<span class="pc${ext ? ' ext' : ''}"><span class="trk"><i style="left:${Math.max(0, Math.min(100, p))}%"></i></span><b>${pctl(p)}</b></span>`;
}
const tile = (k, v, s = '', extra = '') => `<div class="tile${extra ? ` ${extra}` : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const panel = (h, sub, body, label = '') => `<section class="panel"${label ? ` data-sk-label="${label}"` : ''}><h2>${h}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
const table = (head, body) => `<div class="tw"><table class="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
const deep = (k, sum, body) => `<details class="deep" data-k="${k}"><summary>Deep view <span>${sum}</span></summary><div class="body">${body}</div></details>`;
const BKT = { SMALL: 'SC', MID: 'MC', LARGE: 'LC', MICRO: 'Micro', MEGA: 'Mega' };
const bktChip = (b) => (b ? `<span class="chip">${esc(BKT[String(b).toUpperCase()] || b)}</span>` : '');
const unavailable = (what, file, where) => `<p class="read">${what} unavailable: ${file} did not load. ${where}</p>`;
function whyTag(r) {
  if (isStale(r)) return 'Poller stale';
  if (r.news) return r.news.kind === 'MOVER LIST' ? 'Mover list' : 'News';
  const st = String(r.status || 'IN PLAY').toLowerCase();
  return st.charAt(0).toUpperCase() + st.slice(1);
}
function whyAge(r, refMs) {
  if (isStale(r)) return ago(instantMs(r.upd), refMs);
  if (r.news) return ago(instantMs(r.news.at), refMs);
  return r.run?.first ? fmtDay(r.run.first) : '';
}
function why(r, refMs) {
  if (isStale(r)) return `<span class="chip">Poller stale</span> last poll ${esc(fmtMt(instantMs(r.upd)))} · sorted last, no gold <span class="t2">· ${ago(instantMs(r.upd), refMs)}</span>`;
  if (r.news) return `<span class="chip">${whyTag(r)}</span> ${esc(r.news.h)} <span class="t2">· ${ago(instantMs(r.news.at), refMs)}</span>`;
  const first = r.run?.first ? `flag ${fmtDay(r.run.first)}` : 'n/a';
  return `<span class="chip">${esc(whyTag(r))}</span> ${esc(r.dlab || '')} · no named headline in the feed <span class="t2">· ${first}</span>`;
}
function detail(r, session, refMs) {
  const ema8 = fin(r.ema8) ? r.ema8 : (fin(r.e8p) ? r.p / (1 + r.e8p / 100) : null);
  const c20 = (r.cl || []).filter(fin).slice(-20), mu = c20.length ? c20.reduce((a, v) => a + v, 0) / c20.length : null;
  const tw = toward(r);
  const runLine = r.run ? `<p class="ln">Run flagged ${esc(fmtDay(r.run.first))}${fin(r.run.peak) ? ` · peak ${px(r.run.peak)}` : ''}${fin(r.run.peak) && fin(r.p) ? ` · <span class="${cls(r.p / r.run.peak - 1)}">${fp((r.p / r.run.peak - 1) * 100)}</span> off peak` : ''}</p>` : '';
  const news = r.news ? `<p class="ln t2">${esc(r.news.src || '')} · ${esc(fmtMt(instantMs(r.news.at)))}</p>` : '';
  return `<div class="xd"><p class="why">${why(r, refMs)}</p>${news}
<div class="sp">${spark(r.cl)}</div><p class="cap">Last 30 daily closes · dotted line = 20-day mean</p>
<div class="strip compact">
${tile('vs 8EMA · daily', `<span class="${cls(r.x8)}">${fx(r.x8)} ATR</span>`, `${fp(r.e8p)} · EMA8 ${px(ema8)}`)}
${tile('vs VWAP · session', `<span class="${cls(r.xv)}">${fx(r.xv)} ATR</span>`, `ATR ${px(r.atr)}`)}
${tile('z vs 20-day', `<span class="${cls(r.z20)}">${fz(r.z20)}</span>`, `20D mean ${px(mu)}`)}
${tile(`After hours${r.ah_t ? ` · to ${session ? `${esc(fmtDay(session))} ` : ''}${esc(r.ah_t)} MT` : ''}`, `<span class="${cls(r.ah_pct)}">${fp(r.ah_pct)}</span>`, `${tw || 'flat'} · not ranked`)}</div>
${runLine}
${r.book !== 'ML' && fin(r.n1) ? `<p class="ln t2">Pctl window ${r.n1} sessions${shortWindow(r) ? ' (under 1 yr: never counted as an extreme)' : ''}</p>` : ''}
<p class="ln">$vol ${usd(r.dvol)} · 5D ${fp(r.d5)} · prev close ${px(r.prev)}</p>
<span class="btn" role="button" data-chart="${esc(r.t)}" tabindex="0">Open the 2m chart on the full board →</span></div>`;
}
export function renderCard(r, { open = null, refMs = 0, session = '' } = {}) {
  const p = pctOf(r), ext = isExt(r), isOpen = open === r.t, stl = isStale(r), age = whyAge(r, refMs);
  return `<tr class="click${ext ? ' ext' : ''}${stl ? ' stl' : ''}${isOpen ? ' open' : ''}" data-t="${esc(r.t)}" tabindex="0" aria-expanded="${isOpen}">
<th><span class="sy">${esc(r.t)}<span class="chip">${r.book === 'SC' ? 'SC' : 'ML'}</span></span><small>${esc(whyTag(r))}${age ? ` · ${esc(age)}` : ''}</small></th><td>${px(r.p)}</td><td class="${cls(r.chg)}">${fp(r.chg)}</td><td>${pcCell(p, ext)}<small>${winLabel(r)}</small></td><td class="${cls(r.x8)}">${fx(r.x8)}</td></tr>${isOpen ? `<tr class="xrow"><td colspan="5">${detail(r, session, refMs)}</td></tr>` : ''}`;
}
export function nowSummary(rows, book = 'ALL') {
  const l = rows.filter((r) => book === 'ALL' || r.book === book);
  const ex = l.filter(isExt);
  return {
    list: l, ext: ex,
    hi: ex.filter((r) => pctOf(r) >= EXT_HI), lo: ex.filter((r) => pctOf(r) <= EXT_LO),
    tw: ex.filter((r) => toward(r) === 'toward the mean'),
  };
}
export const NOW_QUICK = 14; // rows in the quick view; the rest sit under Deep view
const nowHead = '<th class="l">Symbol</th><th>Price</th><th>Chg</th><th>Stretch<small>pctl</small></th><th>vs 8EMA<small>× ATR</small></th>';
export function renderNow(doc, S, nowMs) {
  const rows = Array.isArray(doc?.rows) ? doc.rows : null;
  if (!rows) return unavailable('Now feed', 'now-stretch.json', 'The full board still has the live books.');
  const refMs = instantMs(doc.built_mt) ?? nowMs;
  const sum = nowSummary(rows, S.book);
  const sorted = sortRows(sum.list, S.sort);
  const cnt = (b) => rows.filter((r) => b === 'ALL' || r.book === b).length;
  const sess = doc.session ? dowDay(doc.session) : 'n/a';
  const opt = { open: S.open, refMs, session: doc.session };
  const quick = sorted.slice(0, NOW_QUICK), rest = sorted.slice(NOW_QUICK);
  const read = `<b>${sum.ext.length} of ${sum.list.length} names</b> sit at a stretch extreme (small caps 1-yr, mid/large 2-yr pctl): ${sum.hi.length} at or above 95%, ${sum.lo.length} at or below 5%. After hours (${esc(fmtDay(doc.session))}, not ranked), ${sum.tw.length} of ${sum.ext.length} extremes moved toward the mean.`;
  const strip = `<div class="strip">
${tile('At a stretch extreme', `${sum.ext.length} <small>names</small>`, 'SC 1-yr · ML 2-yr pctl')}
${tile('At or above 95% pctl', `<span class="up">${sum.hi.length}</span> <small>names</small>`, 'stretched above')}
${tile('At or below 5% pctl', `<span class="dn">${sum.lo.length}</span> <small>names</small>`, 'stretched below')}
${tile('Toward the mean after hours', `${sum.tw.length} <small>of ${sum.ext.length}</small>`, `${esc(fmtDay(doc.session))} after hours · not ranked`, 'mr')}</div>`;
  const ctl = `<div class="ctl"><div class="bk" id="book">${['ALL', 'SC', 'ML'].map((b) => `<button type="button" data-b="${b}" aria-pressed="${S.book === b}">${{ ALL: 'All', SC: 'Small', ML: 'Mid/large' }[b]}<small>${cnt(b)} names</small></button>`).join('')}</div><div class="bk"><button type="button" class="srt" id="srt" aria-label="Change sort">Sort ↕<small>${SORT_LABEL[S.sort]}</small></button></div></div>`;
  const tap = PHONE_CHOICES.cardTap === 'chart' ? 'tap a row to open its 2m chart on the full board' : `tap a row for the stretch triplet${PHONE_CHOICES.cardTap === 'longpress' ? '; hold to open the 2m chart' : ''}`;
  const quickPanel = panel(`In play · ${sorted.length} names`, `Sorted by ${SORT_LABEL[S.sort]} · gold row = extreme · ${tap}`, table(nowHead, quick.map((r) => renderCard(r, opt)).join('')));
  const note = `<p class="note" data-sk-label="Definitions">Price + chg % = official RTH close, ${esc(sess)} 2:00 PM MT (never the AH poll). Stretch = <b>1-yr</b> (252 sessions) pctl for small caps and <b>2-yr</b> pctl for mid/large; a small cap with under 252 sessions shows its session count and is never counted as an extreme. Sparkline = last 30 daily closes; dotted line = 20-day mean. Why-tag age = headline time to the feed build (${esc(fmtMt(refMs))}).</p>`;
  const restPanel = rest.length ? panel(`The other ${rest.length} names`, `Same sort · ${tap}`, table(nowHead, rest.map((r) => renderCard(r, opt)).join('')), 'Other names') : '';
  return `<p class="read${sum.ext.length ? ' ext' : ''}">${read}</p>${strip}${ctl}${quickPanel}${deep('now', `${rest.length ? `the other ${rest.length} names · ` : ''}how the stretch is measured`, restPanel + note)}`;
}

// ---------- MARKET ----------
export function marketModel(mrDoc) {
  const tiles = decode(mrDoc);
  if (!tiles.length) return null;
  const liq = tiles.filter((t) => fin(t.dv) && t.dv >= 5e6);
  const two = liq.filter((t) => fin(t.pc) && (t.pn ?? 0) >= 504);
  const bySec = new Map();
  for (const t of two) { if (!bySec.has(t.sec)) bySec.set(t.sec, []); bySec.get(t.sec).push(t); }
  const sectors = [...bySec.entries()].map(([s, l]) => ({
    s, n: l.length, d1: median(l.map((t) => t.d1)), pc: median(l.map((t) => t.pc)),
    hi: l.filter((t) => t.pc >= EXT_HI).length, lo: l.filter((t) => t.pc <= EXT_LO).length,
  })).sort((a, b) => Math.abs(b.pc - 50) - Math.abs(a.pc - 50));
  const r = rails(two, { n: 6 }); // only names with a real 2-yr window and a pctl
  return {
    n: liq.length, npc: two.length,
    above50: two.filter((t) => t.pc >= 50).length, below50: two.filter((t) => t.pc < 50).length,
    hi: two.filter((t) => t.pc >= EXT_HI).length, lo: two.filter((t) => t.pc <= EXT_LO).length,
    up: liq.filter((t) => t.d1 > 0).length, dn: liq.filter((t) => t.d1 < 0).length, medd1: median(liq.map((t) => t.d1)),
    sectors, above: r.above, below: r.below,
    asof: mrDoc.asof_label || mrDoc.asof || '', builtMt: mrDoc.built_mt || '',
  };
}
const nameRow = (t) => `<tr${isExtP(t.pc) ? ' class="ext"' : ''}><th>${esc(t.t)}${bktChip(t.bkt)}<small>${esc(t.sec)} · ${px(t.c)}</small></th><td class="${cls(t.d1)}">${fp(t.d1)}</td><td class="${cls(t.x)}">${fx(t.x, 1)}</td><td>${pcCell(t.pc)}</td></tr>`;
const nameHead = '<th class="l">Symbol</th><th>1D</th><th>vs 8EMA<small>× ATR</small></th><th>2-yr pctl</th>';
export function renderMarket(m) {
  if (!m) return unavailable('Market feed', 'mrmap.json', 'Open the full board Market tab.');
  const tot = m.above50 + m.below50 || 1;
  const read = `<b>${n0(m.hi + m.lo)} of ${n0(m.npc)} names</b> sit at a 2-yr stretch extreme: ${n0(m.hi)} at or above 95% pctl, ${n0(m.lo)} at or below 5%. ${(m.above50 / tot * 100).toFixed(1)}% are above their own 2-yr median. On the day ${n0(m.up)} rose and ${n0(m.dn)} fell (median ${fp(m.medd1)}).`;
  const strip = `<div class="strip">
${tile('Above own 2-yr median', `${n0(m.above50)} <small>stocks</small>`, `${(m.above50 / tot * 100).toFixed(1)}% of names`)}
${tile('Below own 2-yr median', `${n0(m.below50)} <small>stocks</small>`, `${(m.below50 / tot * 100).toFixed(1)}% of names`)}
${tile('At a 2-yr extreme', `${n0(m.hi + m.lo)} <small>stocks</small>`, `<span class="up">${n0(m.hi)}</span> ≥95% · <span class="dn">${n0(m.lo)}</span> ≤5% pctl`, 'mr')}
${tile('Day · 1D %', `<span class="up">${n0(m.up)}</span> <small>up</small>`, `<span class="dn">${n0(m.dn)} down</span> · median ${fp(m.medd1)}`)}</div>`;
  const sub = '2-yr pctl of ×ATR from 8EMA · gold row = 2-yr extreme · descriptive, not an edge claim';
  const sectors = panel('Sectors', `Median 1D % and median 2-yr pctl · ${n0(m.npc)} names with 2 yrs of bars`, table('<th class="l">Sector</th><th>Median 1D</th><th>Median 2-yr pctl</th>', m.sectors.map((s) => `<tr${isExtP(s.pc) ? ' class="ext"' : ''}><th>${esc(s.s)}<small>${s.n} names · ${s.hi} ≥95% · ${s.lo} ≤5%</small></th><td class="${cls(s.d1)}">${fp(s.d1)}</td><td>${pcCell(s.pc)}</td></tr>`).join('')));
  const split = `<section class="sec panel" data-sk-label="Stretch breadth"><h2>Stretch breadth</h2><p class="sub">${n0(m.npc)} names with 2 yrs of bars</p><div class="split"><i style="flex:${m.above50};background:var(--up)"></i><i style="flex:${m.below50};background:var(--dn)"></i></div><p class="kv"><span class="up">${n0(m.above50)} above own 2-yr median · ${(m.above50 / tot * 100).toFixed(1)}%</span><span class="dn">${n0(m.below50)} below · ${(m.below50 / tot * 100).toFixed(1)}%</span></p></section>`;
  const note = `<p class="note" data-sk-label="Definitions"><b>Universe:</b> all caps with 20D $vol ≥ $5M = ${n0(m.n)} names (mrmap, ${esc(m.asof)}, built ${esc(m.builtMt)}). 2-yr pctl = today's 8EMA ×ATR inside the name's own last 504 sessions. The full MR map, themes map and 52-wk views stay on the desktop Market tab.</p>`;
  return `<p class="read ext">${read}</p>${strip}${panel('Most stretched above', sub, table(nameHead, m.above.map(nameRow).join('')))}${panel('Most stretched below', sub, table(nameHead, m.below.map(nameRow).join('')))}${deep('market', `all ${m.sectors.length} sectors · stretch breadth split · universe`, `<div class="sec" data-sk-label="All sectors">${sectors}</div>${split}${note}`)}`;
}

// ---------- GAMMA ----------
export function gammaModel(gDoc, mrDoc) {
  const ts = Array.isArray(gDoc?.tickers) ? gDoc.tickers : null;
  if (!ts) return null;
  const spy = ts.find((t) => t.t === 'SPY') || ts.find((t) => t.kind === 'index');
  const pcOf = new Map();
  for (const t of decode(mrDoc || {})) pcOf.set(t.t, t);
  const near = [];
  for (const t of ts) {
    if (t.kind === 'index') continue;
    const m = pcOf.get(t.t);
    if (!m || !fin(m.pc) || !(m.pc <= EXT_LO || m.pc >= EXT_HI)) continue;
    const above = m.pc >= EXT_HI; // stretched up -> the wall on its stretched side is the call wall
    const wall = above ? t.call_wall : t.put_wall, dist = above ? t.call_wall_dist_x : t.put_wall_dist_x;
    if (!fin(wall) || !fin(dist)) continue;
    if (!fin(t.spot) || (above ? wall < t.spot : wall > t.spot)) continue; // wall must sit on its side of the PRINTED price
    near.push({ t: t.t, b: m.bkt, c: t.spot, pc: m.pc, wk: above ? 'Call wall' : 'Put wall', wall, wx: dist });
  }
  near.sort((a, b) => Math.abs(a.wx) - Math.abs(b.wx));
  const asofIso = /^\d{4}-\d{2}-\d{2}/.exec(String(mrDoc?.asof || ''))?.[0] || '';
  return { doc: gDoc, spy, near: near.slice(0, 7), nNear: near.length, pctlAsof: asofIso };
}
export function renderGamma(g, choice = PHONE_CHOICES.gammaSlot) {
  if (!g || !g.spy) return unavailable('Gamma feed', 'gamma.json', 'Open the full board Gamma tab.');
  const s = g.spy, ix = g.doc.index_regime || {};
  const spot = s.spot;
  const lv = [['Call wall', s.call_wall], ['Abs γ strike', s.abs_strike], ['SPY spot', spot], ['Flip', s.flip], ['Put wall', s.put_wall]].filter((x) => fin(x[1]));
  const dist = (v) => (fin(s.atr14) && s.atr14 > 0 ? (v - spot) / s.atr14 : null);
  const spotAt = fmtMt(instantMs(g.doc.spot_asof));
  const imove = fin(s.imove_1d_pct) ? s.imove_1d_pct.toFixed(2) : 'n/a';
  const flipD = fin(s.flip) ? dist(s.flip) : null;
  const read = `SPY ${px(spot)} at ${esc(spotAt)}${fin(s.flip) ? `, ${fin(flipD) ? `${Math.abs(flipD).toFixed(2)}× ATR ${flipD <= 0 ? 'above' : 'below'}` : 'vs'} the gamma flip ${px(s.flip)}` : ''}. Walls for ${esc(dowDay(g.doc.levels_for_session))}: call ${px(s.call_wall)}, put ${px(s.put_wall)}. Options imply a ±${imove}% move for the day.`;
  const strip = `<div class="strip">
${tile('SPY spot', px(spot), `as of ${esc(fmtMt(instantMs(g.doc.spot_asof), { date: false }))}`)}
${tile('Implied 1D move', `±${imove}%`, `ATM IV ${fin(s.iv_atm_pct) ? s.iv_atm_pct.toFixed(2) : 'n/a'}%`)}
${tile('SPY net GEX', usd(s.net_gex), `${fin(s.gex_per_dv20_pct) ? s.gex_per_dv20_pct.toFixed(1) : 'n/a'}% of 20D $vol`)}
${tile('S&amp;P net GEX', pctl(ix.gex_pctl2y), `${usd(ix.gex_usd)} · 2-yr pctl`, isExtP(ix.gex_pctl2y) ? 'ext' : '')}
${tile('Dix', pctl(ix.dix_pctl2y), `${fin(ix.dix_pct) ? ix.dix_pct.toFixed(2) : 'n/a'}% · 2-yr pctl`, isExtP(ix.dix_pctl2y) ? 'ext' : '')}</div>`;
  const lvRows = lv.sort((x, y) => y[1] - x[1]).map(([k, v]) => {
    const me = k === 'SPY spot', d = dist(v), w = fin(d) ? Math.round(Math.min(1, Math.abs(d) / 5) * 64) : 0;
    return `<tr${me ? ' class="me"' : ''}><th>${k}</th><td>$${v.toFixed(2)}</td><td>${me ? 'spot' : `<span class="db ${d >= 0 ? 'up' : 'dn'}"><span class="${cls(d)}">${fx(d)} ATR</span><i style="width:${w}px"></i></span>`}</td></tr>`;
  }).join('');
  const spyPanel = panel('SPY levels', `Walls for ${esc(dowDay(g.doc.levels_for_session))} · spot @ ${esc(fmtMt(instantMs(g.doc.spot_asof), { date: false }))} · bar scale ±5× ATR`, table('<th class="l">Level</th><th>Price</th><th>vs spot</th>', lvRows));
  let slot = '';
  if (choice === 'spy+stretched') {
    slot = panel('Mean-reversion lens: stretched and near a wall', `${g.nNear} names at a ${g.pctlAsof ? `2-yr pctl (${esc(fmtDay(g.pctlAsof))} close)` : '2-yr pctl'} extreme with the wall on their stretched side · price = gamma spot @ ${esc(spotAt)} · descriptive, not an edge claim`,
      g.near.length ? table('<th class="l">Symbol</th><th>Wall</th><th>Distance<small>× ATR</small></th><th>2-yr pctl</th>', g.near.map((r) => `<tr class="ext"><th>${esc(r.t)}${bktChip(r.b)}<small>${px(r.c)}</small></th><td>${px(r.wall)}<small>${r.wk}</small></td><td class="${cls(r.wx)}">${fx(r.wx)}</td><td>${pcCell(r.pc)}</td></tr>`).join('')) : '<p class="sub">None right now.</p>');
  } else if (choice === 'themes') {
    slot = panel('Themes', 'Full board', '<ul class="lk"><li><a href="?layout=full#themes">Open themes<span>full board Themes tab →</span></a></li></ul>');
  }
  const ixPanel = panel('Index gamma and dark pool', `${esc(fmtDay(ix.date))} · 2-yr pctl`, table('<th class="l">Measure</th><th>Now</th><th>2-yr pctl</th>',
    `<tr${isExtP(ix.gex_pctl2y) ? ' class="ext"' : ''}><th>S&amp;P net GEX<small>2-yr range ${usd(ix.gex_lo2y)} → ${usd(ix.gex_hi2y)}</small></th><td>${usd(ix.gex_usd)}</td><td>${pcCell(ix.gex_pctl2y)}</td></tr>
<tr${isExtP(ix.dix_pctl2y) ? ' class="ext"' : ''}><th>Dix<small>2-yr range ${fin(ix.dix_lo2y) ? ix.dix_lo2y.toFixed(1) : 'n/a'}% → ${fin(ix.dix_hi2y) ? ix.dix_hi2y.toFixed(1) : 'n/a'}%</small></th><td>${fin(ix.dix_pct) ? ix.dix_pct.toFixed(2) : 'n/a'}%</td><td>${pcCell(ix.dix_pctl2y)}</td></tr>`));
  const note = `<p class="note">Implied 1D move ±${imove}% (ATM IV ${fin(s.iv_atm_pct) ? s.iv_atm_pct.toFixed(2) : 'n/a'}%) · ATR ${px(s.atr14)} · net GEX ${usd(s.net_gex)} = ${fin(s.gex_per_dv20_pct) ? s.gex_per_dv20_pct.toFixed(1) : 'n/a'}% of 20D $vol.</p><p class="note" data-sk-label="Definitions"><b>Source:</b> gamma build ${esc(fmtMt(instantMs(g.doc.built_at)))} (OI as of ${esc(fmtDay(g.doc.oi_asof))}, spot as of ${esc(spotAt)}). Prices and distances use that same spot. Dealer side assumed (dealers long calls, short puts). Stretch pctl = mrmap 2-yr.</p>`;
  return `<p class="read">${read}</p>${strip}${spyPanel}${slot}${deep('gamma', 'index gamma and dark pool · ranges · source', `<div class="sec" data-sk-label="Index gamma">${ixPanel}</div>${note}`)}`;
}

// ---------- REGIME ----------
export function regimeModel(rg, bt) {
  if (!rg?.iwm || !rg?.spy) return null;
  const tiles = [];
  const add = (k, o, kind, unit, dUnit) => o && tiles.push({ k, v: o.v, wk: o.wk, p: o.p, range: o.range, ext: o.ext, kind, unit, dUnit, pl: '2-yr pctl' });
  add('IWM vs SPY · 20 sessions', rg.iwmVsSpy20, 'pct', '%', ' pts');
  add('SPY ×ATR from 8EMA', rg.spy.stretch, 'x', '×', '×');
  add('IWM 20-day realised vol', rg.iwm.rv20, 'pct', '%', ' pts');
  add('IWM vs 50-day SMA', rg.iwm.v50, 'pct', '%', ' pts');
  add('IWM ×ATR from 8EMA', rg.iwm.stretch, 'x', '×', '×');
  const rows = Array.isArray(bt?.breadth?.rows) ? bt.breadth.rows : [];
  if (rows.length) {
    const last = rows[rows.length - 1], wkAgo = rows[rows.length - 6] || null;
    const rank = (key) => (rows.filter((r) => r[key] <= last[key]).length / rows.length) * 100;
    const b = (k, key) => tiles.push({
      k, v: last[key], wk: wkAgo ? wkAgo[key] : null, p: rank(key), kind: 'n', unit: ' stocks', dUnit: ' stocks',
      range: [Math.min(...rows.map((r) => r[key])), Math.max(...rows.map((r) => r[key]))], ext: null, pl: `${rows.length}-session pctl`,
    });
    b('Entries above 8EMA band', 'above');
    b('Entries below 8EMA band', 'below');
  }
  return { tiles, asOf: rg.as_of, generated: rg.generated_at, windowN: rg.windows?.pctileSessions, sessions: rg.source?.sessions, breadthAsOf: bt?.breadth?.as_of };
}
const rgVal = (t, v) => (t.kind === 'x' ? fx(v) : t.kind === 'n' ? `${n0(v)} stocks` : `${fin(v) ? (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2) : 'n/a'}%`);
const rgDelta = (t) => {
  const dlt = fin(t.v) && fin(t.wk) ? t.v - t.wk : null;
  return fin(dlt) ? `<span class="${cls(dlt)}">${dlt > 0 ? '▲' : dlt < 0 ? '▼' : '■'} ${Math.abs(dlt).toFixed(t.kind === 'n' ? 0 : 2)}${t.dUnit}</span>` : 'n/a';
};
export function renderRegime(m) {
  if (!m) return unavailable('Regime feed', 'regime-2y.json', 'It ships with the Sectors + Regime build; open the full board Regime tab.');
  const ex = m.tiles.filter((t) => isExtP(t.p));
  const most = m.tiles.filter((t) => fin(t.p)).sort((a, b) => Math.abs(b.p - 50) - Math.abs(a.p - 50))[0];
  const read = ex.length
    ? `<b>${ex.length} of ${m.tiles.length} tape readings</b> sit at an extreme: ${ex.map((t) => `${esc(t.k)} ${rgVal(t, t.v)} (${pctl(t.p)} pctl)`).join('; ')}.`
    : `None of the ${m.tiles.length} tape readings sits at an extreme${most ? `; the most stretched is ${esc(most.k)} at ${rgVal(most, most.v)} (${pctl(most.p)} pctl)` : ''}.`;
  const strip = `<div class="strip">${m.tiles.slice(0, 4).map((t) => tile(esc(t.k), rgVal(t, t.v), `${rgDelta(t)} vs 1 wk · ${pctl(t.p)} pctl`, isExtP(t.p) ? 'ext' : '')).join('')}</div>`;
  const quick = panel('Is the tape stretched?', `Raw · ${esc(fmtDay(m.asOf))} close · gold row = extreme · descriptive, not an edge claim`, table('<th class="l">Measure</th><th>Now</th><th class="opt">vs 1 wk ago</th><th>Pctl</th>',
    m.tiles.map((t) => `<tr${isExtP(t.p) ? ' class="ext"' : ''}><th>${esc(t.k)}<small>${esc(t.pl)}</small></th><td>${rgVal(t, t.v)}</td><td class="opt">${rgDelta(t)}</td><td>${pcCell(t.p)}</td></tr>`).join('')));
  const deepT = panel('Range and last extreme', 'Every reading, with its change on the week', table('<th class="l">Measure</th><th>vs 1 wk ago</th><th class="l">Range</th><th class="l">Last extreme</th>',
    m.tiles.map((t) => `<tr><th>${esc(t.k)}</th><td>${rgDelta(t)}</td><td class="l w">${t.range ? `${rgVal(t, t.range[0])} → ${rgVal(t, t.range[1])}` : 'n/a'}</td><td class="l w">${t.ext && t.ext.date ? `${t.ext.sessions} sessions ago · ${esc(fmtDay(t.ext.date))} ${rgVal(t, t.ext.val)}` : 'mid/large calibrated universe'}</td></tr>`).join('')));
  const note = `<p class="note" data-sk-label="Definitions"><b>Window:</b> IWM / SPY daily bars, ${n0(m.sessions)} sessions; pctl = last ${n0(m.windowN)} sessions ("2-yr"). Breadth = ${esc(fmtDay(m.breadthAsOf))} measured sessions only. CFTC positions, similar-day studies and the HOD/LOD tape stay on the desktop Regime tab.</p>`;
  return `<p class="read${ex.length ? ' ext' : ''}">${read}</p>${strip}${quick}${deep('regime', 'range and last extreme for every reading · window', `<div class="sec" data-sk-label="Range &amp; extremes">${deepT}</div>${note}`)}`;
}

// ---------- MORE ----------
export function renderMore() {
  const links = [['Sectors', 'sectors', 'quadrant + heat map'], ['Calendar', 'calendar', 'catalysts + event odds'], ['Themes', 'themes', 'theme board'], ['Internals', 'internals', 'breadth, flows, fear/greed'], ['Smart money', 'smartmoney', 'insiders, 13D/G, 13F'], ['History', 'history', 'resolved runs']];
  return `${panel('Other board tabs', 'Each opens in the full board', `<ul class="lk">${links.map(([n, h, d]) => `<li><a href="?layout=full${h === 'smartmoney' ? '&view=smartmoney' : ''}#${h}">${n}<span>${d} →</span></a></li>`).join('')}<li><a href="?layout=full#now">Full board (desktop layout)<span>whole board, pinch to zoom →</span></a></li><li><a href="../mobile.html">Legacy radar (mobile.html)<span>alerts, theme stages, morning brief →</span></a></li></ul>`)}
${panel('This phone', 'Chrome PWA · Samsung Internet', `<ul class="ctx"><li><b>Install as app</b><br><span>Chrome menu → Add to home screen. Samsung Internet menu → Add page to → Home screen.</span></li><li><b>Freshness key</b><br><span>white dot = snapshot is current for the last close · gold dot = a source is behind · tap the badge to refresh</span></li></ul>`)}`;
}

// ---------- shell ----------
export const TABS = {
  now: { title: 'Now', sub: (d) => `${d.now?.rows?.length ?? 0} in play` },
  market: { title: 'Market', sub: () => 'all caps' },
  gamma: { title: 'Gamma', sub: () => 'SPY + stretched' },
  regime: { title: 'Regime', sub: () => 'IWM / SPY tape' },
  more: { title: 'More', sub: () => 'tabs + settings' },
};
export function tabFreshness(tab, data, nowMs) {
  const d = data;
  if (tab === 'gamma' && d.gamma?.doc) {
    const g = d.gamma.doc;
    return gammaBadge({ builtMs: instantMs(g.built_at), note: `OI ${fmtDay(g.oi_asof)}` }, nowMs);
  }
  if (tab === 'market' && d.mrmap) return freshness({ sessionDate: d.mrmap.asof, builtMs: instantMs(d.mrmap.built_mt), label: 'mrmap built' }, nowMs);
  if (tab === 'regime' && d.regime) return freshness({ sessionDate: d.regime.as_of, builtMs: instantMs(d.regime.generated_at), label: 'built' }, nowMs);
  if ((tab === 'now' || tab === 'more') && d.now) return freshness({ sessionDate: d.now.session, builtMs: instantMs(d.now.built_mt), label: 'built' }, nowMs);
  return { cls: 'unk', big: 'No feed', small: 'tap to retry' };
}
export function shellHtml() {
  const ic = {
    now: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    market: '<rect x="3" y="3" width="10" height="11"/><rect x="13" y="3" width="8" height="6"/><rect x="13" y="9" width="8" height="12"/><rect x="3" y="14" width="10" height="7"/>',
    gamma: '<path d="M3 18 C8 18 9 6 12 6 S16 18 21 18"/><path d="M3 12h18" stroke-dasharray="2 3"/>',
    regime: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  };
  return `<header class="bar"><div class="r1"><h1 id="phTtl">NOW<small id="phSub"></small></h1>
<button class="fresh" id="phFresh" type="button" aria-label="Data freshness, tap to refresh"><i></i><span><b id="phFb">Loading</b><span id="phFs"></span></span></button></div>
<div class="pull" id="phPull"><span class="spin"></span><span id="phPullT">Refreshing…</span></div>
<div class="ptr" id="phPtr"><span class="ar">↓</span><span id="phPtrT">Pull to refresh</span></div></header>
<main id="phMain" class="sk">${Object.keys(TABS).map((t) => `<section class="pane" id="ph-${t}"></section>`).join('')}</main>
<nav class="tb" id="phTb" aria-label="Phone tabs">${Object.keys(TABS).map((t) => `<button type="button" data-tab="${t}" aria-label="${TABS[t].title}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic[t]}</svg>${TABS[t].title}<span class="dot" hidden></span></button>`).join('')}</nav>`;
}

// ---------- CSS (scoped: nothing applies unless html.ph-on or inside .ph-root) ----------
export const CSS = `
.ph-root{display:none}
html.ph-on{overscroll-behavior-y:contain;background:#191c1f}
html.ph-on body>:not(.ph-root):not(script):not(style):not(link):not(.ph-fullbtn){display:none!important}
html.ph-on .ph-root{display:block;--bg:#191c1f;--raised:#202428;--raised-2:#272c31;--line:#30353a;--line-strong:#444b52;--text:#e0e5e7;--text-2:#bec7cd;--gold:#e4b76e;--gold-fill:rgba(228,183,110,.10);--up:#51c083;--dn:#e17272;--font:"Segoe UI Variable Text","Segoe UI",Roboto,Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;--nav-h:60px;--safe-b:env(safe-area-inset-bottom,0px);min-height:100vh;background:var(--bg);color:var(--text);font:400 14px/1.45 var(--font)}
html.ph-on body{visibility:visible;margin:0;background:#191c1f;overflow-x:hidden}
.ph-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ph-root button{font:inherit;color:inherit;cursor:pointer}
.ph-root .up{color:var(--up)}.ph-root .dn{color:var(--dn)}.ph-root .t2{color:var(--text-2)}
/* shell: sticky title bar + freshness badge + pull-to-refresh (tokens only) */
.ph-root .bar{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line)}
.ph-root .bar .r1{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 10px}
.ph-root .bar h1{margin:0;font:600 19px/1.15 var(--font);color:var(--text)}
.ph-root .bar h1 small{display:block;margin-top:2px;color:var(--text-2);font:400 13px/1.2 var(--font)}
.ph-root .fresh{margin-left:auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;min-width:44px;max-width:64%;padding:4px 10px;border:0;border-radius:6px;background:var(--raised);text-align:left}
.ph-root .fresh i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--text)}
.ph-root .fresh.stale{background:linear-gradient(var(--gold-fill),var(--gold-fill)),var(--raised);box-shadow:inset 3px 0 0 var(--gold)}.ph-root .fresh.stale i{background:var(--gold)}
.ph-root .fresh>span{min-width:0}
.ph-root .fresh b{display:block;font:600 13px/1.2 var(--font);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph-root .fresh span span{display:block;font:400 12px/1.25 var(--font);color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ph-root .ptr{display:flex;align-items:center;justify-content:center;gap:6px;height:26px;color:var(--text-2);font:400 12.5px/1 var(--font);background:var(--raised)}
.ph-root .ptr .ar{display:inline-block;transition:transform .15s}
.ph-root .pull{height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text);font:600 13px/1 var(--font);background:var(--raised);transition:height .15s}
.ph-root .pull.on{height:52px;border-bottom:1px solid var(--line)}
.ph-root .spin{width:18px;height:18px;border:2px solid var(--line-strong);border-top-color:var(--text);border-radius:50%;animation:phsp .9s linear infinite}
@keyframes phsp{to{transform:rotate(360deg)}}
.ph-root main{padding:10px 10px calc(var(--nav-h) + var(--safe-b) + 18px)}
.ph-root main.sk{padding-top:10px}
.ph-root .pane{display:none}.ph-root .pane.on{display:block}
.ph-root .loading{padding:28px 12px;color:var(--text);font:600 14px/1.4 var(--font);text-align:center}
/* skin v2 on the phone: the shared .sk kit does the tiles, tables, pc, chip, deep view; these are phone-only parts */
.ph-root .sk .read{margin:0 0 12px}
.ph-root .sk .panel{margin:0 0 18px}
.ph-root .sk .deep{margin-top:6px}
.ph-root .sk .deep .panel:last-child{margin-bottom:0}
.ph-root .sk .t tbody th .chip{margin-left:6px}
.ph-root .sk .t tbody th{white-space:normal}
.ph-root .sk .t tbody th .sy{white-space:nowrap}
.ph-root .sk .t tr.click > th{min-width:104px}
.ph-root .sk .t tr.click > th small{white-space:nowrap}
@media (max-width:380px){.ph-root .sk .t th,.ph-root .sk .t td{padding-left:4px;padding-right:4px}.ph-root .sk .t tbody td{font-size:12.5px}}
.ph-root .sk .t tbody th small,.ph-root .sk .t tbody td small{white-space:normal}
.ph-root .sk .t td .pc + small{display:block}
.ph-root .sk .t tr.click > :first-child::before{width:12px}
.ph-root .sk .t tr.click > *{height:46px}
.ph-root .sk .t tr.stl > *{border-bottom-style:dashed}
.ph-root .sk .t tr.me > *{background:var(--raised-2)}
.ph-root .sk .t tr.xrow:hover > *{background:var(--raised-2)}
/* book + sort toggles: kit .seg look, 44 px touch targets (NEEDS_SHARED: .seg button variant) */
.ph-root .ctl{display:flex;gap:8px;margin:0 0 12px}
.ph-root .bk{display:flex;flex:1;gap:2px;padding:2px;border-radius:6px;background:var(--raised)}
.ph-root .bk:last-child{flex:0 0 auto}
.ph-root .bk button{flex:1;min-width:0;min-height:44px;padding:2px 8px;border:0;border-radius:4px;background:none;color:var(--text-2);font:600 13px/1.2 var(--font)}
.ph-root .bk button small{display:block;margin-top:1px;font:400 12px/1.2 var(--font);color:var(--text-2)}
.ph-root .bk button[aria-pressed=true]{background:var(--raised-2);color:var(--text);box-shadow:inset 0 -2px 0 var(--gold)}
.ph-root .bk .srt{color:var(--text)}
/* expanded row (NOW): why line, sparkline, the stretch triplet as compact tiles, chart button */
.ph-root .xd{padding-top:2px}
.ph-root .xd .why{margin:0 0 4px;font:400 13.5px/1.45 var(--font);color:var(--text)}
.ph-root .xd .why .chip{margin:0 4px 0 0}
.ph-root .xd .sp svg{display:block;width:100%;height:38px;margin-top:6px}
.ph-root .xd .strip.compact{grid-template-columns:repeat(2,minmax(0,1fr));margin:8px 0 2px}
.ph-root .xd .strip.compact .tile{background:var(--bg)}
.ph-root .xd .ln{margin:6px 0 0;font:400 13px/1.45 var(--font);color:var(--text)}
.ph-root .xd .ln.t2{color:var(--text-2)}
.ph-root .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:10px;padding:0 10px;border-radius:6px;background:var(--raised);color:var(--text);font:600 13.5px/1.2 var(--font);text-align:center;cursor:pointer}
/* market deep view: stretch-breadth split bar */
.ph-root .split{display:flex;height:8px;border-radius:2px;overflow:hidden;margin:4px 0 6px}
.ph-root .split i{display:block}
.ph-root .kv{display:flex;justify-content:space-between;gap:8px;margin:0;font:600 13px/1.4 var(--font)}
/* link list (MORE): 48 px rows on raised (NEEDS_SHARED: .lk link list) */
.ph-root .lk{margin:0;padding:0;list-style:none;border-radius:8px;overflow:hidden;background:var(--raised)}
.ph-root .lk li + li{border-top:1px solid var(--line)}
.ph-root .lk a{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:6px 14px;color:var(--text);font:600 14px/1.3 var(--font);text-decoration:none}
.ph-root .lk a span{color:var(--text-2);font:400 13px/1.3 var(--font);text-align:right;max-width:60%}
.ph-root .sk .ctx li span{line-height:1.45}
/* bottom tab bar */
.ph-root nav.tb{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;height:calc(var(--nav-h) + var(--safe-b));padding-bottom:var(--safe-b);border-top:1px solid var(--line);background:var(--raised)}
.ph-root nav.tb button{position:relative;flex:1;min-width:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:none;color:var(--text-2);font:600 12px/1 var(--font)}
.ph-root nav.tb button svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8}
.ph-root nav.tb button.on{color:var(--text);background:var(--raised-2);box-shadow:inset 0 3px 0 var(--gold)}
.ph-root nav.tb button .dot{position:absolute;top:10px;left:calc(50% + 10px);width:7px;height:7px;border-radius:50%;background:var(--gold)}
.ph-root nav.tb button .dot[hidden]{display:none}
.ph-fullbtn{position:fixed;right:8px;bottom:8px;z-index:99999;min-height:44px;padding:0 14px;border:0;border-radius:6px;background:#202428;color:#e0e5e7;font:600 13px/1 "Segoe UI Variable Text","Segoe UI",Roboto,system-ui,sans-serif;box-shadow:inset 0 -2px 0 #e4b76e}
@media (orientation:landscape) and (max-height:520px) and (max-width:1000px) and (pointer:coarse){
  html.ph-on body{padding-left:76px}
  .ph-root nav.tb{top:0;right:auto;width:76px;height:auto;flex-direction:column;border-top:0;border-right:1px solid var(--line);padding:0 0 0 env(safe-area-inset-left,0px)}
  .ph-root nav.tb button{flex:1;min-height:44px}
  .ph-root nav.tb button.on{box-shadow:inset 3px 0 0 var(--gold)}
  .ph-root main{padding:8px 12px 16px}
  .ph-root .bar .r1{min-height:44px;padding:4px 10px}
  .ph-root .ptr{display:none}
}
`;

// ---------- boot (browser only) ----------
async function getJson(name, bust) {
  try {
    const u = new URL(`./data/${name}`, import.meta.url);
    if (bust) u.searchParams.set('t', String(Date.now()));
    const r = await fetch(u, { cache: bust ? 'reload' : 'default' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
export async function loadFeeds(bust = false) {
  const [now, mrmap, gamma, regime, breadth] = await Promise.all(['now-stretch.json', 'mrmap.json', 'gamma.json', 'regime-2y.json', 'breadth-tape.json'].map((n) => getJson(n, bust)));
  return { now, mrmap, gamma, regime, breadth };
}
function readStore(storage) { try { return JSON.parse(storage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; } }
function writeStore(storage, v) { try { storage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private mode: fine */ } }

export function boot(doc = document, win = window) {
  const root = doc.documentElement;
  const params = new URLSearchParams(win.location.search);
  if (params.get('layout') === 'full') { try { win.sessionStorage.setItem(FULL_KEY, '1'); } catch { /* ignore */ } }
  if (params.get('layout') === 'phone') { try { win.sessionStorage.removeItem(FULL_KEY); } catch { /* ignore */ } }
  let full = false;
  try { full = win.sessionStorage.getItem(FULL_KEY) === '1'; } catch { /* ignore */ }
  const mq = win.matchMedia(PHONE_MQ);
  if (full) { // the whole desktop board on a phone, with one way back
    root.classList.remove('ph-on', 'ph-pre');
    win.__phReady = true;
    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ph-fullbtn'; b.textContent = 'Phone view';
    b.hidden = !mq.matches;
    mq.addEventListener('change', () => { b.hidden = !mq.matches; });
    b.addEventListener('click', () => { try { win.sessionStorage.removeItem(FULL_KEY); } catch { /* ignore */ } win.location.href = `${win.location.pathname}${win.location.hash}`; });
    doc.body.appendChild(b);
    let want = null; try { want = win.sessionStorage.getItem(OPEN_KEY); win.sessionStorage.removeItem(OPEN_KEY); } catch { /* ignore */ }
    if (want) {
      let tries = 0;
      const iv = win.setInterval(() => {
        const el = [...doc.querySelectorAll('[data-ticker]')].find((e) => e.dataset.ticker === want);
        if (el) { win.clearInterval(iv); el.click(); } else if (++tries > 60) win.clearInterval(iv);
      }, 500);
    }
    return null;
  }
  if (!mq.matches) { // desktop: no fetch, no timers, nothing mounted unless the window later becomes a phone
    const once = () => { if (mq.matches) { mq.removeEventListener('change', once); mount(); } };
    mq.addEventListener('change', once); win.__phReady = true; return null;
  }
  return mount();
  function mount() {
  const st = doc.createElement('style'); st.id = 'phone-css'; st.textContent = CSS; doc.head.appendChild(st);
  const host = doc.createElement('div'); host.className = 'ph-root'; host.id = 'phoneRoot'; host.innerHTML = shellHtml();
  doc.body.appendChild(host);
  const $ = (id) => doc.getElementById(id);
  const saved = readStore(win.localStorage);
  const S = { tab: TABS[saved.tab] ? saved.tab : 'now', book: ['ALL', 'SC', 'ML'].includes(saved.book) ? saved.book : 'ALL', sort: SORTS.includes(saved.sort) ? saved.sort : 'pct', open: null, deep: {} };
  const hashTab = (win.location.hash || '').replace('#', '').toLowerCase();
  if (TABS[hashTab]) S.tab = hashTab;
  let data = { now: null, mrmap: null, gamma: null, regime: null, breadth: null };
  let model = {};
  const save = () => writeStore(win.localStorage, { tab: S.tab, book: S.book, sort: S.sort });
  const apply = () => { root.classList.toggle('ph-on', mq.matches); };
  function derive() {
    model = { market: data.mrmap ? marketModel(data.mrmap) : null, gamma: data.gamma ? gammaModel(data.gamma, data.mrmap) : null, regime: regimeModel(data.regime, data.breadth) };
  }
  function renderPane(tab, nowMs) {
    const el = $(`ph-${tab}`);
    if (!el) return;
    if (tab === 'now') el.innerHTML = renderNow(data.now, S, nowMs);
    else if (tab === 'market') el.innerHTML = renderMarket(model.market);
    else if (tab === 'gamma') el.innerHTML = renderGamma(model.gamma);
    else if (tab === 'regime') el.innerHTML = renderRegime(model.regime);
    else el.innerHTML = renderMore();
    el.querySelectorAll('details.deep[data-k]').forEach((d) => { if (S.deep[d.dataset.k]) d.open = true; }); // keep Deep view open across re-renders
  }
  function header(nowMs) {
    const t = TABS[S.tab], f = tabFreshness(S.tab, { ...data, gamma: model.gamma, regime: data.regime }, nowMs);
    $('phTtl').firstChild.textContent = t.title; $('phSub').textContent = t.sub(data);
    const fe = $('phFresh'); fe.className = `fresh ${f.cls}`; $('phFb').textContent = f.big; $('phFs').textContent = f.small;
    const gf = model.gamma ? tabFreshness('gamma', { ...data, gamma: model.gamma }, nowMs) : null;
    const dot = doc.querySelector('#phTb [data-tab="gamma"] .dot'); if (dot) dot.hidden = !(gf && gf.cls === 'stale');
    const nf = data.now ? tabFreshness('now', data, nowMs) : null;
    const sinceClose = data.now && instantMs(data.now.built_mt) ? ageLong(instantMs(data.now.built_mt), nowMs) : null;
    $('phPtrT').textContent = `Pull to refresh${sinceClose ? ` · feed built ${sinceClose} ago` : ''}${nf && nf.cls === 'stale' ? ' · behind' : ''}`;
  }
  function paint() {
    const nowMs = Date.now();
    doc.querySelectorAll('#phTb button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    doc.querySelectorAll('.ph-root .pane').forEach((p) => p.classList.toggle('on', p.id === `ph-${S.tab}`));
    Object.keys(TABS).forEach((t) => renderPane(t, nowMs));
    header(nowMs);
  }
  function setTab(t) { S.tab = t; save(); paint(); win.scrollTo(0, 0); }
  async function refresh() {
    const pull = $('phPull'); pull.classList.add('on'); $('phPullT').textContent = 'Refreshing…';
    try { doc.getElementById('refreshButton')?.click(); } catch { /* board data refresh is best-effort */ }
    const d = await loadFeeds(true);
    for (const k of Object.keys(d)) if (d[k]) data[k] = d[k];
    derive(); paint();
    $('phPullT').textContent = `Updated ${fmtMt(Date.now(), { date: false })}`;
    win.setTimeout(() => pull.classList.remove('on'), 900);
  }
  function openChart(t) {
    try { win.sessionStorage.setItem(FULL_KEY, '1'); win.sessionStorage.setItem(OPEN_KEY, t); } catch { /* ignore */ }
    win.location.href = `${win.location.pathname}?layout=full#now`;
  }
  // events
  let held = null, suppress = false;
  doc.addEventListener('click', (e) => {
    if (!host.contains(e.target)) return;
    if (suppress) { suppress = false; return; }
    const ch = e.target.closest('[data-chart]'); if (ch) { openChart(ch.dataset.chart); return; }
    const a = e.target.closest('a'); if (a) return; // plain links navigate
    const tr = e.target.closest('tr[data-t]');
    if (tr) {
      if (PHONE_CHOICES.cardTap === 'chart') { openChart(tr.dataset.t); return; }
      S.open = S.open === tr.dataset.t ? null : tr.dataset.t; renderPane('now', Date.now()); return;
    }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'phFresh') { refresh(); return; }
    if (b.dataset.tab) { setTab(b.dataset.tab); win.history.replaceState(null, '', `#${b.dataset.tab}`); return; }
    if (b.dataset.b) { S.book = b.dataset.b; save(); renderPane('now', Date.now()); return; }
    if (b.id === 'srt') { S.sort = SORTS[(SORTS.indexOf(S.sort) + 1) % SORTS.length]; save(); renderPane('now', Date.now()); return; }
    if (b.dataset.t) {
      if (PHONE_CHOICES.cardTap === 'chart') { openChart(b.dataset.t); return; }
      S.open = S.open === b.dataset.t ? null : b.dataset.t; renderPane('now', Date.now()); return;
    }
  });
  doc.addEventListener('keydown', (e) => {
    if (!(e.key === 'Enter' || e.key === ' ')) return;
    if (e.target.dataset?.chart) { e.preventDefault(); openChart(e.target.dataset.chart); return; }
    if (e.target.matches?.('.ph-root tr[data-t]')) { e.preventDefault(); e.target.click(); }
  });
  host.addEventListener('toggle', (e) => { const d = e.target; if (d.matches?.('details.deep[data-k]')) S.deep[d.dataset.k] = d.open; }, true);
  if (PHONE_CHOICES.cardTap === 'longpress') {
    host.addEventListener('pointerdown', (e) => { const c = e.target.closest('tr[data-t]'); if (c) held = win.setTimeout(() => { suppress = true; openChart(c.dataset.t); }, 550); });
    for (const ev of ['pointerup', 'pointercancel', 'pointermove']) host.addEventListener(ev, () => { if (held) { win.clearTimeout(held); held = null; } });
  }
  // pull-to-refresh: a standalone PWA gets no browser pull-to-refresh, so the page owns the gesture
  let y0 = null, dy = 0;
  const arrow = () => doc.querySelector('#phPtr .ar');
  win.addEventListener('touchstart', (e) => { y0 = root.classList.contains('ph-on') && win.scrollY <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  win.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; arrow().style.transform = dy > PTR_THRESHOLD ? 'rotate(180deg)' : ''; }, { passive: true });
  win.addEventListener('touchend', () => { if (y0 != null && dy > PTR_THRESHOLD) refresh(); y0 = null; arrow().style.transform = ''; });
  mq.addEventListener('change', apply);
  win.addEventListener('hashchange', () => { const h = (win.location.hash || '').replace('#', '').toLowerCase(); if (TABS[h] && root.classList.contains('ph-on')) setTab(h); });
  apply();
  win.__phReady = true;
  $('ph-now').innerHTML = '<div class="loading">Loading feeds…</div>';
  paint();
  loadFeeds(false).then((d) => { data = d; derive(); paint(); });
  // keep the "feed built Xh ago" strip honest while the page stays open
  win.setInterval(() => { if (doc.visibilityState === 'visible') header(Date.now()); }, 60000);
  return { S, refresh, setTab, get data() { return data; } };
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !globalThis.__PHONE_NO_BOOT__) {
  const go = () => { try { boot(); } catch (err) { document.documentElement.classList.remove('ph-on', 'ph-pre'); console.error('phone layout failed, desktop board shown', err); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
}
