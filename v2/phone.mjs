// PHONE glance layout (V2.18.0). Below 600 px wide (or a landscape phone up to 520 px tall) the board is
// replaced by one-column cards, a bottom tab bar (NOW / MARKET / GAMMA / REGIME / MORE), a freshness badge
// and its own pull-to-refresh. Above that, nothing here is visible: the module only injects CSS scoped to
// `.ph-root` / `html.ph-on` and a hidden container, so the desktop board is untouched.
// Data = the same files the desktop tabs read: now-stretch.json (NOW), mrmap.json (MARKET), gamma.json
// (GAMMA), regime-2y.json + breadth-tape.json (REGIME). No network call other than those static files.
// Laws: bright text only (#e0e5e7 / #bec7cd), every number unit-marked, gold = fill / edge only (never text),
// D4 palette (#51c083 / #e17272), times in MT, raw primitives (no grades).
import { decode, rails, median } from './mr-map.mjs';
import { marketSessionClock, previousTradingSession, sessionCloseMinute } from './market-calendar.mjs';

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
  const q = denverParts(ms), hm = `${String(q.h).padStart(2, '0')}:${String(q.mi).padStart(2, '0')}`;
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
  return m == null ? '14:00' : `${String(Math.floor((m - 120) / 60)).padStart(2, '0')}:${String((m - 120) % 60).padStart(2, '0')}`; // ET close -> MT
}
// The state comes from the market calendar + the real clock, never from the file alone.
export function freshness({ sessionDate, builtMs, label = '', note = '' }, nowMs) {
  const clock = marketSessionClock(nowMs), exp = expectedSession(nowMs);
  if (!sessionDate || !exp || !clock) return { cls: 'unk', big: 'SOURCE UNKNOWN', small: note || 'no session date in the feed' };
  const day = fmtDay(sessionDate).toUpperCase();
  const bits = [builtMs ? `${label || 'built'} ${fmtMt(builtMs)}` : label, note].filter(Boolean).join(' \u00b7 ');
  if (sessionDate === clock.sessionDate && !clock.completed && !clock.closedDay) { // market day in progress: never "CLOSED"
    return { cls: '', big: builtMs ? `INTRADAY \u00b7 as of ${fmtMt(builtMs, { date: false })}` : 'INTRADAY', small: [note, 'session not closed'].filter(Boolean).join(' \u00b7 ') };
  }
  if (sessionDate < exp) return { cls: 'stale', big: `BEHIND \u00b7 ${day}`, small: bits || `latest feed is ${fmtDay(sessionDate)}` };
  return { cls: '', big: `LAST CLOSE \u00b7 ${day} ${closeMt(sessionDate)} MT`, small: bits };
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
  return `BUILT ${y(ms) !== y(nowMs) ? fmtMt(ms).replace(/^(\w+ \d+)/, `$1 ${y(ms)}`) : fmtMt(ms)}`;
}
export function gammaBadge({ builtMs, note = '' }, nowMs) {
  const clock = marketSessionClock(nowMs), bc = fin(builtMs) ? marketSessionClock(builtMs) : null;
  if (!clock || !bc || builtMs > nowMs + 60000) return { cls: 'unk', big: fin(builtMs) ? builtLbl(builtMs, nowMs) : 'SOURCE UNKNOWN', small: note || 'build time ambiguous' };
  const done = lastDoneSession(clock);
  if (!done) return { cls: 'unk', big: builtLbl(builtMs, nowMs), small: note };
  const built = fmtMt(builtMs, { date: false }), bits = [`built ${fmtMt(builtMs)}`, note].filter(Boolean).join(' · ');
  const inSession = !bc.closedDay && bc.minute >= OPEN_MIN_ET && bc.minute < sessionCloseMinute(bc.date);
  const closeLine = (close) => { // a completed close the build can honestly name
    if (!close || close > done) return { cls: 'unk', big: builtLbl(builtMs, nowMs), small: note };
    return close < done ? { cls: 'stale', big: `BEHIND · ${fmtDay(close).toUpperCase()}`, small: bits }
      : { cls: '', big: `LAST CLOSE · ${fmtDay(close).toUpperCase()} ${closeMt(close)} MT`, small: bits };
  };
  if (inSession) { // built during its session, before the close
    if (clock.date === bc.date && !clock.closedDay && clock.minute >= OPEN_MIN_ET && clock.minute < sessionCloseMinute(clock.date)) {
      return { cls: '', big: `INTRADAY · built ${built}`, small: [note, 'session not closed'].filter(Boolean).join(' · ') };
    }
    if (bc.date === done) return { cls: '', big: `PRE-CLOSE · ${dowDay(bc.date)} ${built}`, small: bits }; // newest session, nothing newer exists
    return closeLine(previousTradingSession(bc.date)); // a newer session has completed since the build's session
  }
  if (!bc.closedDay && bc.minute < sessionCloseMinute(bc.date)) return closeLine(previousTradingSession(bc.date)); // pre-open build: only the prior close is real
  return closeLine(bc.sessionDate); // post-close / non-session-day build
}

// ---------- NOW cards ----------
export const pctOf = (r) => (r.book === 'ML' ? (fin(r.p2) ? r.p2 : null) : (fin(r.p1) ? r.p1 : null));
export const isStale = (r) => !!(r.poller_stale || r.stale);
export const shortWindow = (r) => r.book !== 'ML' && fin(r.n1) && r.n1 < MIN_1YR_SESSIONS;
export const winLabel = (r) => (r.book === 'ML' ? '2-YR' : shortWindow(r) ? `${r.n1} SESS` : '1-YR');
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
  const lo = Math.min(...c, mu), hi = Math.max(...c, mu);
  const y = (v) => (h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1);
  const d = c.map((v, i) => `${i ? 'L' : 'M'}${((i / (c.length - 1)) * w).toFixed(1)} ${y(v)}`).join('');
  const col = c[c.length - 1] >= c[0] ? '#51c083' : '#e17272';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(mu)}" y2="${y(mu)}" stroke="#8b959c" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${w}" cy="${y(c[c.length - 1])}" r="3" fill="${col}"/></svg>`;
}
// Stretch bar: fill from the 50% line to the marker; ticks at 5 / 50 / 95 %.
export function pbar(p) {
  if (!fin(p)) return '<div class="pb"><em></em></div>';
  const c = p >= 50 ? 'var(--up)' : 'var(--dn)', l = Math.min(p, 50), w = Math.abs(p - 50);
  return `<div class="pb"><em></em><s style="left:${l}%;width:${w}%;background:${c}"></s><i style="left:${p}%;background:${c}"></i></div>`;
}
function why(r, refMs) {
  if (isStale(r)) {
    const at = instantMs(r.upd);
    return `<span class="tag stale">Poller stale</span><span class="h">last poll ${esc(fmtMt(at))} · sorted last, no gold</span><span class="age">${ago(at, refMs)}</span>`;
  }
  if (r.news) {
    const k = r.news.kind === 'MOVER LIST' ? 'MOVER LIST' : 'NEWS';
    return `<span class="tag">${k}</span><span class="h">${esc(r.news.h)}</span><span class="age">${ago(instantMs(r.news.at), refMs)}</span>`;
  }
  const st = r.status || 'IN PLAY';
  const first = r.run?.first ? `flag ${fmtDay(r.run.first)}` : 'n/a';
  return `<span class="tag ${st === 'RUNNING' ? 'run' : st === 'FADING' ? 'fade' : ''}">${esc(st)}</span><span class="h">${esc(r.dlab || '')} · no named headline in the feed</span><span class="age">${first}</span>`;
}
function detail(r, session) {
  const ema8 = fin(r.ema8) ? r.ema8 : (fin(r.e8p) ? r.p / (1 + r.e8p / 100) : null);
  const c20 = (r.cl || []).filter(fin).slice(-20), mu = c20.length ? c20.reduce((a, v) => a + v, 0) / c20.length : null;
  const tw = toward(r);
  const runLine = r.run ? `<div class="ln">RUN flagged ${esc(fmtDay(r.run.first))}${fin(r.run.peak) ? ` · peak ${px(r.run.peak)}` : ''}${fin(r.run.peak) && fin(r.p) ? ` · <span class="${cls(r.p / r.run.peak - 1)}">${fp((r.p / r.run.peak - 1) * 100)}</span> off peak` : ''}</div>` : '';
  const news = r.news ? `<div class="hd">${esc(r.news.h)}<div class="ln t2">${esc(r.news.src || '')} · ${esc(fmtMt(instantMs(r.news.at)))}</div></div>` : '';
  return `<div class="tiles">
<div class="tl"><div class="k">vs 8EMA · daily</div><div class="v ${cls(r.x8)}">${fx(r.x8)} ATR</div><div class="s">${fp(r.e8p)} · EMA8 ${px(ema8)}</div></div>
<div class="tl"><div class="k">vs VWAP · session</div><div class="v ${cls(r.xv)}">${fx(r.xv)} ATR</div><div class="s">ATR ${px(r.atr)}</div></div>
<div class="tl"><div class="k">z vs 20-day</div><div class="v ${cls(r.z20)}">${fz(r.z20)}</div><div class="s">20D mean ${px(mu)}</div></div>
<div class="tl"><div class="k">After hours${r.ah_t ? ` · to ${session ? `${esc(fmtDay(session))} ` : ''}${esc(r.ah_t)} MT` : ''}</div><div class="v ${cls(r.ah_pct)}">${fp(r.ah_pct)}</div><div class="s">${tw || 'flat'} · not ranked</div></div></div>
${runLine}
${r.book !== 'ML' && fin(r.n1) ? `<div class="ln t2">pctl window ${r.n1} sessions${shortWindow(r) ? ' (under 1 yr: never counted as an extreme)' : ''}</div>` : ''}
<div class="ln">$VOL ${usd(r.dvol)} · 5D ${fp(r.d5)} · prev close ${px(r.prev)}</div>
${news}
<span class="btn" role="button" data-chart="${esc(r.t)}" tabindex="0">OPEN 2m CHART ON THE FULL BOARD →</span>`;
}
export function renderCard(r, { open = null, refMs = 0, session = '' } = {}) {
  const p = pctOf(r), ext = isExt(r), lab = winLabel(r), isOpen = open === r.t;
  return `<button class="gc${ext ? ' ext' : ''}${isStale(r) ? ' stl' : ''}${isOpen ? ' open' : ''}" type="button" data-t="${esc(r.t)}" aria-expanded="${isOpen}">
<div class="ga"><div class="tk"><b>${esc(r.t)}</b><span class="${esc(String(r.book).toLowerCase())}">${r.book === 'SC' ? 'SMALL' : 'MID/LG'}</span></div><div class="sp">${spark(r.cl)}</div><div class="px"><b>${px(r.p)}</b><span class="chp ${cls(r.chg)}">${fp(r.chg)}</span></div></div>
<div class="gb"><div class="k">Stretch<small>${lab} pctl</small></div>${pbar(p)}<div class="v ${fin(p) ? (p >= 50 ? 'up' : 'dn') : 't2'}">${pctl(p)}</div><div class="x ${cls(r.x8)}">${fx(r.x8)}</div></div>
<div class="gw">${why(r, refMs)}</div>
<div class="gx">${isOpen ? detail(r, session) : ''}</div></button>`;
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
export function renderNow(doc, S, nowMs) {
  const rows = Array.isArray(doc?.rows) ? doc.rows : null;
  if (!rows) return '<div class="card"><h3>NOW feed unavailable</h3><div class="ln">now-stretch.json did not load. The full board still has the live books.</div></div>';
  const refMs = instantMs(doc.built_mt) ?? nowMs;
  const sum = nowSummary(rows, S.book);
  const sorted = sortRows(sum.list, S.sort);
  const cnt = (b) => rows.filter((r) => b === 'ALL' || r.book === b).length;
  const sess = doc.session ? dowDay(doc.session) : 'n/a';
  return `<div class="ctl"><div class="mr in"><div class="g"><b>${sum.ext.length}</b><span>at an extreme<br>SC 1-yr · ML 2-yr</span></div><div><b class="up">${sum.hi.length}</b><span>≥95% pctl (above)</span></div><div><b class="dn">${sum.lo.length}</b><span>≤5% pctl (below)</span></div></div>
<div class="seg" id="book">${['ALL', 'SC', 'ML'].map((b) => `<button type="button" data-b="${b}" aria-pressed="${S.book === b}">${{ ALL: 'ALL', SC: 'SMALL', ML: 'MID/LG' }[b]}<small>${cnt(b)} names</small></button>`).join('')}<button type="button" class="srt" id="srt" aria-label="Change sort">Sort ↕<small>${SORT_LABEL[S.sort]}</small></button></div></div>
<div class="sec">IN PLAY · ${sorted.length} <span>${esc(fmtDay(doc.session))} after hours (not ranked): toward the mean on ${sum.tw.length} of ${sum.ext.length} extremes</span></div>
<div id="cards">${sorted.map((r) => renderCard(r, { open: S.open, refMs, session: doc.session })).join('')}</div>
<p class="foot"><b>${PHONE_CHOICES.cardTap === 'chart' ? 'Tap a card' : 'Tap a card'}</b> ${PHONE_CHOICES.cardTap === 'chart' ? 'to open its 2m chart on the full board' : 'for the stretch triplet'}${PHONE_CHOICES.cardTap === 'longpress' ? '; hold to open the 2m chart' : ''}. Price + chg % = official RTH close, ${esc(sess)} 14:00 MT (never the AH poll). Stretch bar = <b>1-yr</b> (252 sessions) pctl for small caps and <b>2-yr</b> pctl for mid/large; a small cap with under 252 sessions shows its session count and is never counted as an extreme; ticks at 5% · 50% · 95%. Sparkline = last 30 daily closes; dotted line = 20-day mean. Why-tag age = headline time to the feed build (${esc(fmtMt(refMs))}).</p>`;
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
const nameRow = (t) => `<div class="row${t.pc >= EXT_HI || t.pc <= EXT_LO ? ' ext' : ''}"><div class="n"><b>${esc(t.t)}</b> <small>${esc(t.sec)} · ${esc(t.bkt || '')} · ${px(t.c)}</small></div><div class="d ${cls(t.d1)}">${fp(t.d1)}</div><div class="pp"><span class="${t.pc >= 50 ? 'up' : 'dn'}">${pctl(t.pc)} · ${fx(t.x, 1)}</span>${pbar(t.pc)}</div></div>`;
export function renderMarket(m) {
  if (!m) return '<div class="card"><h3>Market feed unavailable</h3><div class="ln">mrmap.json did not load. Open the full board MARKET tab.</div></div>';
  const tot = m.above50 + m.below50 || 1;
  return `<div class="card"><h3>Stretch breadth <span>${n0(m.npc)} names with 2 yrs of bars</span></h3>
<div class="kv"><span class="up">${n0(m.above50)} above own 2-yr median</span><span class="dn">${n0(m.below50)} below</span></div>
<div class="split"><i style="flex:${m.above50};background:var(--up)"></i><i style="flex:${m.below50};background:var(--dn)"></i></div>
<div class="kv"><span class="up">${(m.above50 / tot * 100).toFixed(1)}% of names</span><span class="dn">${(m.below50 / tot * 100).toFixed(1)}% of names</span></div>
<div class="kv" style="margin-top:4px"><span>Day (1D %):</span><span><span class="up">${n0(m.up)} up</span> · <span class="dn">${n0(m.dn)} down</span> · median ${fp(m.medd1)}</span></div></div>
<div class="mr"><div class="g"><b>${n0(m.hi + m.lo)}</b><span>at a 2-yr extreme</span></div><div><b class="up">${n0(m.hi)}</b><span>≥95% pctl</span></div><div><b class="dn">${n0(m.lo)}</b><span>≤5% pctl</span></div></div>
<div class="lgrid"><div><div class="sec">Sectors <span>median 1D % · median 2-yr pctl</span></div>
<div class="card">${m.sectors.map((s) => `<div class="row"><div class="n">${esc(s.s)}<small>${s.n} names · ${s.hi} ≥95% · ${s.lo} ≤5%</small></div><div class="d ${cls(s.d1)}">${fp(s.d1)}</div><div class="pp"><span class="${s.pc >= 50 ? 'up' : 'dn'}">${pctl(s.pc)}</span>${pbar(s.pc)}</div></div>`).join('')}</div></div>
<div><div class="sec">Most stretched above <span>2-yr pctl · ×ATR from 8EMA</span></div><div class="card">${m.above.map(nameRow).join('')}</div>
<div class="sec">Most stretched below <span>2-yr pctl · ×ATR from 8EMA</span></div><div class="card">${m.below.map(nameRow).join('')}</div></div></div>
<p class="foot"><b>Universe:</b> all caps with 20D $vol ≥ $5M = ${n0(m.n)} names (mrmap, ${esc(m.asof)}, built ${esc(m.builtMt)}). 2-yr pctl = today's 8EMA ×ATR inside the name's own last 504 sessions. Full MR MAP, THEMES MAP and 52-WK views stay on the desktop MARKET tab.</p>`;
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
    near.push({ t: t.t, b: m.bkt, c: t.spot, pc: m.pc, wk: above ? 'CALL WALL' : 'PUT WALL', wall, wx: dist });
  }
  near.sort((a, b) => Math.abs(a.wx) - Math.abs(b.wx));
  const asofIso = /^\d{4}-\d{2}-\d{2}/.exec(String(mrDoc?.asof || ''))?.[0] || '';
  return { doc: gDoc, spy, near: near.slice(0, 7), nNear: near.length, pctlAsof: asofIso };
}
export function renderGamma(g, choice = PHONE_CHOICES.gammaSlot) {
  if (!g || !g.spy) return '<div class="card"><h3>Gamma feed unavailable</h3><div class="ln">gamma.json did not load. Open the full board GAMMA tab.</div></div>';
  const s = g.spy, ix = g.doc.index_regime || {};
  const spot = s.spot;
  const lv = [['CALL WALL', s.call_wall], ['ABS γ', s.abs_strike], ['SPY SPOT', spot], ['FLIP', s.flip], ['PUT WALL', s.put_wall]].filter((x) => fin(x[1]));
  const dist = (v) => (fin(s.atr14) && s.atr14 > 0 ? (v - spot) / s.atr14 : null);
  const spyCard = `<div class="card"><h3>SPY levels <span>walls for ${esc(dowDay(g.doc.levels_for_session))} · spot @ ${esc(fmtMt(instantMs(g.doc.spot_asof), { date: false }))}</span></h3>
${lv.sort((x, y) => y[1] - x[1]).map(([k, v]) => {
    const me = k === 'SPY SPOT', d = dist(v), w = fin(d) ? Math.min(1, Math.abs(d) / 5) * 50 : 0;
    return `<div class="row lv${me ? ' me' : ''}"><div class="n"><b style="font-size:12.5px">${k}</b></div><div class="d nt">$${v.toFixed(2)}</div><div class="pp">${me ? '<span class="nt">spot</span>' : `<span class="${cls(d)}">${fx(d)} ATR</span><div class="pb"><em></em><s style="opacity:.8;${d >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${d >= 0 ? 'var(--up)' : 'var(--dn)'}"></s></div>`}</div></div>`;
  }).join('')}
<div class="ln">Implied 1D move <b>±${fin(s.imove_1d_pct) ? s.imove_1d_pct.toFixed(2) : 'n/a'}%</b> (ATM IV ${fin(s.iv_atm_pct) ? s.iv_atm_pct.toFixed(2) : 'n/a'}%) · ATR ${px(s.atr14)} · net GEX ${usd(s.net_gex)} = ${fin(s.gex_per_dv20_pct) ? s.gex_per_dv20_pct.toFixed(1) : 'n/a'}% of 20D $vol · bar scale ±5× ATR</div></div>`;
  const ixCard = `<div class="card"><h3>Index gamma + dark pool <span>${esc(fmtDay(ix.date))} · 2-yr pctl</span></h3>
<div class="row"><div class="n">S&amp;P net GEX<small>2-yr range ${usd(ix.gex_lo2y)} → ${usd(ix.gex_hi2y)}</small></div><div class="d nt">${usd(ix.gex_usd)}</div><div class="pp"><span class="${ix.gex_pctl2y >= 50 ? 'up' : 'dn'}">${pctl(ix.gex_pctl2y)}</span>${pbar(ix.gex_pctl2y)}</div></div>
<div class="row"><div class="n">Dix<small>2-yr range ${fin(ix.dix_lo2y) ? ix.dix_lo2y.toFixed(1) : 'n/a'}% → ${fin(ix.dix_hi2y) ? ix.dix_hi2y.toFixed(1) : 'n/a'}%</small></div><div class="d nt">${fin(ix.dix_pct) ? ix.dix_pct.toFixed(2) : 'n/a'}%</div><div class="pp"><span class="${ix.dix_pctl2y >= 50 ? 'up' : 'dn'}">${pctl(ix.dix_pctl2y)}</span>${pbar(ix.dix_pctl2y)}</div></div></div>`;
  const spotAt = fmtMt(instantMs(g.doc.spot_asof));
  let slot = '';
  if (choice === 'spy+stretched') {
    slot = g.near.length
      ? `<div class="sec">Stretched + near a wall <span>${g.nNear} names · ${g.pctlAsof ? `2-yr pctl (${esc(fmtDay(g.pctlAsof))} close)` : '2-yr pctl'} extreme · price = gamma spot</span></div><div class="card">${g.near.map((r) => `<div class="row ext w"><div class="n"><b>${esc(r.t)}</b><small>${esc(r.b || '')} · ${px(r.c)} @ ${esc(spotAt)}</small></div><div class="d" style="font-size:11.5px;line-height:1.3"><span class="nt">${r.wk} ${px(r.wall)}</span><br><span class="${cls(r.wx)}">${fx(r.wx)} ATR</span></div><div class="pp"><span class="${r.pc >= 50 ? 'up' : 'dn'}">${pctl(r.pc)} pctl</span>${pbar(r.pc)}</div></div>`).join('')}</div>`
      : '<div class="sec">Stretched + near a wall <span>none right now</span></div>';
  } else if (choice === 'themes') {
    slot = '<div class="sec">Themes <span>full board</span></div><div class="card more" style="padding:0"><a href="?layout=full#themes">Open themes<span>full board THEMES tab →</span></a></div>';
  }
  return `${spyCard}${ixCard}${slot}<p class="foot"><b>Source:</b> gamma build ${esc(fmtMt(instantMs(g.doc.built_at)))} (OI as of ${esc(fmtDay(g.doc.oi_asof))}, spot as of ${esc(fmtMt(instantMs(g.doc.spot_asof)))}). Prices and distances use that same spot. Dealer side assumed (dealers long calls, short puts). Stretch pctl = mrmap 2-yr.</p>`;
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
    b('Entries ABOVE 8EMA band', 'above');
    b('Entries BELOW 8EMA band', 'below');
  }
  return { tiles, asOf: rg.as_of, generated: rg.generated_at, windowN: rg.windows?.pctileSessions, sessions: rg.source?.sessions, breadthAsOf: bt?.breadth?.as_of };
}
const rgVal = (t, v) => (t.kind === 'x' ? fx(v) : t.kind === 'n' ? `${n0(v)} stocks` : `${fin(v) ? (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2) : 'n/a'}%`);
export function renderRegime(m) {
  if (!m) return '<div class="card"><h3>Regime feed unavailable</h3><div class="ln">regime-2y.json did not load (it ships with the SECTORS + REGIME build). Open the full board REGIME tab.</div></div>';
  return `<div class="sec">Is the tape stretched? <span>raw · 2-yr pctl · ${esc(fmtDay(m.asOf))} close</span></div><div class="lgrid">${m.tiles.map((t) => {
    const ex = fin(t.p) && (t.p <= EXT_LO || t.p >= EXT_HI);
    const dlt = fin(t.v) && fin(t.wk) ? t.v - t.wk : null;
    const lastExt = t.ext && t.ext.date ? `last extreme ${t.ext.sessions} sessions ago · ${esc(fmtDay(t.ext.date))} ${rgVal(t, t.ext.val)}` : 'mid/large calibrated universe';
    return `<div class="card${ex ? ' ext' : ''}"><h3>${esc(t.k)}<span>${esc(t.pl)}</span></h3>
<div class="rgb"><div><div class="big nt">${rgVal(t, t.v)}</div><div class="ln ${cls(dlt)}" style="margin-top:4px">${fin(dlt) ? `${dlt > 0 ? '▲' : dlt < 0 ? '▼' : '●'} ${Math.abs(dlt).toFixed(t.kind === 'n' ? 0 : 2)}${t.dUnit} vs 1 wk ago` : 'n/a'}</div></div><div class="pp rgp"><span class="${t.p >= 50 ? 'up' : 'dn'}">${pctl(t.p)}</span>${pbar(t.p)}</div></div>
<div class="ln t2">range ${t.range ? `${rgVal(t, t.range[0])} → ${rgVal(t, t.range[1])}` : 'n/a'} · ${lastExt}</div></div>`;
  }).join('')}</div>
<p class="foot"><b>Window:</b> IWM / SPY daily bars, ${n0(m.sessions)} sessions; pctl = last ${n0(m.windowN)} sessions ("2-yr"). Breadth = ${esc(fmtDay(m.breadthAsOf))} measured sessions only. CFTC positions, similar-day studies and the HOD/LOD tape stay on the desktop REGIME tab.</p>`;
}

// ---------- MORE ----------
export function renderMore() {
  const links = [['SECTORS', 'sectors', 'quadrant + heat map'], ['CALENDAR', 'calendar', 'catalysts + event odds'], ['THEMES', 'themes', 'theme board'], ['INTERNALS', 'internals', 'breadth, flows, fear/greed'], ['SMART MONEY', 'smartmoney', 'insiders, 13D/G, 13F'], ['HISTORY', 'history', 'resolved runs']];
  return `<div class="sec">Other board tabs <span>open in the full board</span></div><div class="card more" style="padding:0">${links.map(([n, h, d]) => `<a href="?layout=full${h === 'smartmoney' ? '&view=smartmoney' : ''}#${h}">${n}<span>${d} →</span></a>`).join('')}<a href="?layout=full#now">Full board (desktop layout)<span>whole board, pinch to zoom →</span></a><a href="../mobile.html">Legacy radar (mobile.html)<span>alerts, theme stages, morning brief →</span></a></div>
<div class="sec">This phone <span>Chrome PWA · Samsung Internet</span></div><div class="card more" style="padding:0"><div class="mi"><b>Install as app</b><span>Chrome menu → Add to home screen. Samsung Internet menu → Add page to → Home screen.</span></div><div class="mi"><b>Freshness key</b><span>white dot = snapshot is current for the last close · gold dot = a source is behind · tap the badge to refresh</span></div></div>`;
}

// ---------- shell ----------
export const TABS = {
  now: { title: 'NOW', sub: (d) => `${d.now?.rows?.length ?? 0} in play` },
  market: { title: 'MARKET', sub: () => 'all caps' },
  gamma: { title: 'GAMMA', sub: () => 'SPY + stretched' },
  regime: { title: 'REGIME', sub: () => 'IWM / SPY tape' },
  more: { title: 'MORE', sub: () => 'tabs + settings' },
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
  return { cls: 'unk', big: 'NO FEED', small: 'tap to retry' };
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
<main id="phMain">${Object.keys(TABS).map((t) => `<section class="pane" id="ph-${t}"></section>`).join('')}</main>
<nav class="tb" id="phTb" aria-label="Phone tabs">${Object.keys(TABS).map((t) => `<button type="button" data-tab="${t}" aria-label="${TABS[t].title}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic[t]}</svg>${TABS[t].title}<span class="dot" hidden></span></button>`).join('')}</nav>`;
}

// ---------- CSS (scoped: nothing applies unless html.ph-on or inside .ph-root) ----------
export const CSS = `
.ph-root{display:none}
html.ph-on{overscroll-behavior-y:contain;background:#191c1f}
html.ph-on body>:not(.ph-root):not(script):not(style):not(link):not(.ph-fullbtn){display:none!important}
html.ph-on .ph-root{display:block;--bg:#191c1f;--panel:#191c1f;--panel-2:#202428;--panel-deep:#15181b;--line:#353a40;--line-mid:#30353a;--line-bright:#59636a;--text:#e0e5e7;--text-2:#bec7cd;--gold:#e4b76e;--gold-fill:rgba(228,183,110,.12);--up:#51c083;--dn:#e17272;--up-t:rgba(81,192,131,.13);--dn-t:rgba(225,114,114,.13);--mono:"Segoe UI Variable Text","Segoe UI",Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;--sans:"Segoe UI Variable Text","Segoe UI",Roboto,Inter,ui-sans-serif,system-ui,sans-serif;--nav-h:60px;--safe-b:env(safe-area-inset-bottom,0px);min-height:100vh;background:var(--bg);color:var(--text);font:13px/1.35 var(--sans)}
html.ph-on body{visibility:visible;margin:0;background:#191c1f;overflow-x:hidden}
.ph-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ph-root button{font:inherit;color:inherit;cursor:pointer}
.ph-root .up{color:var(--up)}.ph-root .dn{color:var(--dn)}.ph-root .nt{color:var(--text)}.ph-root .t2{color:var(--text-2)}
.ph-root .bar{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line)}
.ph-root .bar .r1{display:flex;align-items:center;gap:8px;min-height:48px;padding:6px 10px 4px}
.ph-root .bar h1{margin:0;font:600 18px/1 var(--mono);letter-spacing:0;color:var(--text)}
.ph-root .bar h1 small{display:block;margin-top:3px;color:var(--text-2);font:600 11px/1 var(--mono);letter-spacing:0}
.ph-root .fresh{margin-left:auto;display:inline-flex;align-items:center;gap:7px;min-height:44px;min-width:44px;max-width:62%;padding:4px 10px;border:1px solid var(--line);border-radius:22px;background:var(--panel);text-align:left}
.ph-root .fresh i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--text)}
.ph-root .fresh.stale{border-color:#7a5a2a;background:#1e1a12}.ph-root .fresh.stale i{background:var(--gold)}
.ph-root .fresh>span{min-width:0}
.ph-root .fresh b{display:block;font:600 11.5px/1.15 var(--mono);color:var(--text);letter-spacing:0;white-space:nowrap}
.ph-root .fresh span span{display:block;font:600 11px/1.2 var(--mono);color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ph-root .ptr{display:flex;align-items:center;justify-content:center;gap:6px;height:24px;color:var(--text-2);font:600 11px/1 var(--mono);border-top:1px solid #1c2024;background:var(--panel-deep)}
.ph-root .ptr .ar{display:inline-block;transition:transform .15s}
.ph-root .pull{height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text);font:600 12px/1 var(--mono);background:var(--panel-deep);transition:height .15s}
.ph-root .pull.on{height:52px;border-bottom:1px solid var(--line)}
.ph-root .spin{width:18px;height:18px;border:2px solid var(--line-bright);border-top-color:var(--text);border-radius:50%;animation:phsp .9s linear infinite}
@keyframes phsp{to{transform:rotate(360deg)}}
.ph-root main{padding:8px 8px calc(var(--nav-h) + var(--safe-b) + 14px)}
.ph-root .pane{display:none}.ph-root .pane.on{display:block}
.ph-root .sec{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:12px 2px 6px;font:600 12px/1.2 var(--mono);letter-spacing:0;color:var(--text);white-space:nowrap}
.ph-root .sec span{white-space:normal;color:var(--text-2);font-weight:600;letter-spacing:0;text-align:right;font-size:11px}
.ph-root .seg{display:flex;gap:4px;margin:2px 0 6px}
.ph-root .seg button{flex:1;min-width:0;min-height:44px;padding:0 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text-2);font:600 12px/1.1 var(--mono);letter-spacing:0}
.ph-root .seg button small{display:block;margin-top:2px;font:600 11px/1 var(--mono);color:var(--text-2)}
.ph-root .seg button[aria-pressed=true]{border-color:var(--gold);background:var(--gold-fill);color:var(--text)}
.ph-root .seg .srt{flex:1.15;border-style:dashed;color:var(--text)}
.ph-root .mr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-bottom:4px}
.ph-root .mr div{padding:6px 8px;border:1px solid var(--line-mid);border-radius:7px;background:var(--panel)}
.ph-root .mr.in div{display:flex;align-items:center;gap:7px;min-height:44px}
.ph-root .mr.in b{font-size:20px}.ph-root .mr.in span{margin:0;line-height:1.15}
.ph-root .mr div.g{background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold);border-color:#8a6a35}
.ph-root .mr b{display:block;font:600 18px/1.05 var(--mono)}
.ph-root .mr span{display:block;margin-top:3px;color:var(--text-2);font:600 11px/1.25 var(--mono)}
.ph-root .gc{display:block;width:100%;margin:0 0 6px;padding:9px 10px 8px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel);text-align:left;color:var(--text)}
.ph-root .gc.ext{background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold);border-color:#8a6a35}
.ph-root .gc.stl{border-style:dashed}
.ph-root .ga{display:grid;grid-template-columns:88px minmax(0,1fr) 98px;align-items:center;gap:8px;min-height:44px}
.ph-root .tk b{display:block;font:600 19px/1 var(--mono);letter-spacing:0;color:var(--text)}
.ph-root .tk span{display:inline-block;margin-top:5px;padding:1px 5px;border:1px solid var(--line-bright);border-radius:3px;font:600 10.5px/1.25 var(--mono);color:var(--text);letter-spacing:0}
.ph-root .tk span.sc{border-color:#7a4a2a}.ph-root .tk span.ml{border-color:#2f6a46}
.ph-root .sp svg{display:block;width:100%;height:38px}
.ph-root .px{text-align:right}
.ph-root .px b{display:block;font:600 14px/1 var(--mono);color:var(--text)}
.ph-root .chp{display:inline-block;margin-top:5px;min-width:84px;padding:4px 7px;border-radius:5px;font:600 13.5px/1 var(--mono);text-align:center}
.ph-root .chp.up{background:var(--up-t);box-shadow:inset 0 0 0 1px rgba(81,192,131,.45)}
.ph-root .chp.dn{background:var(--dn-t);box-shadow:inset 0 0 0 1px rgba(225,114,114,.45)}
.ph-root .chp.nt{background:var(--panel-2)}
.ph-root .gb{display:grid;grid-template-columns:64px minmax(0,1fr) 52px 58px;align-items:center;gap:8px;margin-top:8px}
.ph-root .gb .k{font:600 11px/1.1 var(--mono);color:var(--text);letter-spacing:0}
.ph-root .gb .k small{display:block;color:var(--text-2);font-weight:600;letter-spacing:0}
.ph-root .pb{position:relative;height:8px;background:#24282c;border-radius:1px}
.ph-root .pb::before,.ph-root .pb::after{content:"";position:absolute;top:-2px;bottom:-2px;width:1px;background:#4a525a}
.ph-root .pb::before{left:5%}.ph-root .pb::after{left:95%}
.ph-root .pb em{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#6b757d}
.ph-root .pb s{position:absolute;top:0;height:8px;text-decoration:none;opacity:.55}
.ph-root .pb i{position:absolute;top:-4px;width:4px;height:16px;margin-left:-2px;border-radius:1px}
.ph-root .gb .v{font:600 13px/1 var(--mono);text-align:right}
.ph-root .gb .x{font:600 12px/1 var(--mono);text-align:right}
.ph-root .gw{display:flex;align-items:center;gap:6px;margin-top:8px;font:600 12.5px/1.3 var(--sans);color:var(--text);min-width:0}
.ph-root .gw .h{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph-root .tag{flex:none;display:inline-block;padding:1px 5px;border:1px solid var(--line-bright);border-radius:2px;font:600 10.5px/1.3 var(--mono);letter-spacing:0;color:var(--text);white-space:nowrap}
.ph-root .tag.run{border-color:#3f7a5d}.ph-root .tag.fade{border-style:dashed}.ph-root .tag.stale{border-color:#8a6a35;background:#221c12}
.ph-root .age{flex:none;padding:2px 6px;border-radius:10px;background:var(--panel-2);color:var(--text);font:600 11px/1.2 var(--mono)}
.ph-root .gx{display:none;margin-top:9px;padding-top:8px;border-top:1px solid var(--line-mid)}
.ph-root .gc.open .gx{display:block}
.ph-root .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.ph-root .tl{padding:7px 8px;border:1px solid var(--line-mid);border-radius:6px;background:var(--panel-2)}
.ph-root .tl .k{color:var(--text);font:600 11.5px/1.2 var(--sans)}
.ph-root .tl .v{margin-top:4px;font:600 17px/1 var(--mono)}
.ph-root .tl .s{margin-top:4px;color:var(--text-2);font:600 11px/1.3 var(--mono)}
.ph-root .ln{margin-top:7px;color:var(--text);font:600 11.5px/1.45 var(--mono)}
.ph-root .ln.t2{color:var(--text-2)}.ph-root .ln.up{color:var(--up)}.ph-root .ln.dn{color:var(--dn)}
.ph-root .hd{margin-top:7px;color:var(--text);font:600 12.5px/1.35 var(--sans);white-space:normal}
.ph-root .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:8px;padding:0 8px;border:1px solid var(--line-bright);border-radius:6px;background:var(--panel-deep);font:600 12px/1.2 var(--mono);letter-spacing:0;color:var(--text);text-align:center}
.ph-root .card{margin-bottom:6px;padding:9px 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel)}
.ph-root .card.ext{background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold);border-color:#8a6a35}
.ph-root .card h3{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 6px;font:600 12px/1.2 var(--mono);letter-spacing:0;color:var(--text)}
.ph-root .card h3 span{color:var(--text-2);font-weight:600;letter-spacing:0;text-align:right}
.ph-root .split{display:flex;height:10px;border-radius:2px;overflow:hidden;margin:6px 0 5px}
.ph-root .split i{display:block}
.ph-root .kv{display:flex;justify-content:space-between;gap:8px;font:600 12px/1.35 var(--mono)}
.ph-root .big{font:600 22px/1 var(--mono)}
.ph-root .row{display:grid;grid-template-columns:minmax(0,1fr) 68px 92px;align-items:center;gap:8px;min-height:44px;padding:4px 0;border-top:1px solid #262a2f}
.ph-root .card>.row:first-of-type,.ph-root .card>h3+.row{border-top:0}
.ph-root .row .n{font:600 12.5px/1.2 var(--sans);color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ph-root .row .n small{display:block;color:var(--text-2);font:600 11px/1.2 var(--mono);overflow:hidden;text-overflow:ellipsis}
.ph-root .row .n b{font:600 14px/1 var(--mono)}
.ph-root .row .d{font:600 12.5px/1 var(--mono);text-align:right}
.ph-root .row .pp,.ph-root .pp{display:flex;flex-direction:column;align-items:stretch;gap:4px;font:600 12px/1 var(--mono);text-align:right}
.ph-root .row.ext{background:var(--gold-fill);box-shadow:inset 3px 0 0 var(--gold);margin:0 -10px;padding:4px 10px}
.ph-root .row.w{grid-template-columns:minmax(0,1fr) 100px 90px}.ph-root .row.lv{min-height:40px}.ph-root .row.lv.me{background:var(--panel-2);margin:0 -10px;padding:4px 10px}
.ph-root .rgb{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:10px;align-items:center}
.ph-root .more a{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:52px;padding:0 12px;border-bottom:1px solid var(--line-mid);color:var(--text);font:600 13px/1.2 var(--mono);letter-spacing:0;text-decoration:none}
.ph-root .more a span{color:var(--text-2);font:600 12px/1.3 var(--sans);letter-spacing:0;text-align:right;max-width:62%}
.ph-root .more .mi{display:block;padding:10px 12px;border-bottom:1px solid var(--line-mid)}
.ph-root .more .mi b{display:block;font:600 13px/1.2 var(--mono);letter-spacing:0;color:var(--text)}
.ph-root .more .mi span{display:block;margin-top:4px;color:var(--text-2);font:600 12px/1.4 var(--sans)}
.ph-root .foot{margin:12px 2px 0;color:var(--text-2);font:600 11.5px/1.5 var(--sans)}
.ph-root .foot b{color:var(--text)}
.ph-root .loading{padding:28px 12px;color:var(--text);font:600 13px/1.4 var(--mono);text-align:center}
.ph-root nav.tb{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;height:calc(var(--nav-h) + var(--safe-b));padding-bottom:var(--safe-b);border-top:1px solid var(--line);background:#0e1012}
.ph-root nav.tb button{position:relative;flex:1;min-width:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:0;background:none;color:var(--text-2);font:600 11px/1 var(--mono);letter-spacing:0}
.ph-root nav.tb button svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8}
.ph-root nav.tb button.on{color:var(--text);box-shadow:inset 0 3px 0 var(--gold);background:rgba(228,183,110,.06)}
.ph-root nav.tb button .dot{position:absolute;top:10px;left:calc(50% + 10px);width:7px;height:7px;border-radius:50%;background:var(--gold)}
.ph-root nav.tb button .dot[hidden]{display:none}
.ph-fullbtn{position:fixed;right:8px;bottom:8px;z-index:99999;min-height:44px;padding:0 14px;border:1px solid #59636a;border-radius:22px;background:#15181b;color:#e0e5e7;font:600 12px/1 monospace;letter-spacing:0}
@media (orientation:landscape) and (max-height:520px) and (max-width:1000px) and (pointer:coarse){
  html.ph-on body{padding-left:76px}
  .ph-root nav.tb{top:0;right:auto;width:76px;height:auto;flex-direction:column;border-top:0;border-right:1px solid var(--line);padding:0 0 0 env(safe-area-inset-left,0px)}
  .ph-root nav.tb button{flex:1;min-height:44px}
  .ph-root nav.tb button.on{box-shadow:inset 3px 0 0 var(--gold)}
  .ph-root main{padding:8px 10px 16px}
  .ph-root .bar .r1{min-height:44px;padding:4px 10px}
  .ph-root .ctl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:6px;align-items:start}.ph-root .ctl .seg{margin:0}.ph-root .ptr{display:none}
  .ph-root #cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 8px}
  .ph-root .lgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 8px}
}
@media (max-width:380px){
  .ph-root .ga{grid-template-columns:80px minmax(0,1fr) 92px;gap:6px}
  .ph-root .chp{min-width:80px}
  .ph-root .gb{grid-template-columns:58px minmax(0,1fr) 50px 54px;gap:6px}
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
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ph-fullbtn'; b.textContent = 'PHONE VIEW';
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
  const S = { tab: TABS[saved.tab] ? saved.tab : 'now', book: ['ALL', 'SC', 'ML'].includes(saved.book) ? saved.book : 'ALL', sort: SORTS.includes(saved.sort) ? saved.sort : 'pct', open: null };
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
  }
  function header(nowMs) {
    const t = TABS[S.tab], f = tabFreshness(S.tab, { ...data, gamma: model.gamma, regime: data.regime }, nowMs);
    $('phTtl').firstChild.textContent = t.title; $('phSub').textContent = t.sub(data);
    const fe = $('phFresh'); fe.className = `fresh ${f.cls}`; $('phFb').textContent = f.big; $('phFs').textContent = f.small;
    const gf = model.gamma ? tabFreshness('gamma', { ...data, gamma: model.gamma }, nowMs) : null;
    const dot = doc.querySelector('#phTb [data-tab="gamma"] .dot'); if (dot) dot.hidden = !(gf && gf.cls === 'stale');
    const nf = data.now ? tabFreshness('now', data, nowMs) : null;
    const sinceClose = data.now && instantMs(data.now.built_mt) ? ageLong(instantMs(data.now.built_mt), nowMs) : null;
    $('phPtrT').textContent = `Pull to refresh${sinceClose ? ` · feed built ${sinceClose} ago` : ''}${nf && nf.cls === 'stale' ? ' · BEHIND' : ''}`;
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
  doc.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.chart) { e.preventDefault(); openChart(e.target.dataset.chart); } });
  if (PHONE_CHOICES.cardTap === 'longpress') {
    host.addEventListener('pointerdown', (e) => { const c = e.target.closest('.gc'); if (c) held = win.setTimeout(() => { suppress = true; openChart(c.dataset.t); }, 550); });
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
