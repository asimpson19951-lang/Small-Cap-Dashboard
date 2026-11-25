// refresh-halts.mjs: D4 trading halts (LULD pauses included) from the Nasdaq Trader trade-halt RSS -> v2/data/halts.json
// Written Nov 24 2026 (finish build). Node 22, no dependencies, no keys. Used by BOTH the GitHub Actions workflow (every 5 min) and the nightly wrapper.
// Usage: node scripts/refresh-halts.mjs [--out v2/data/halts.json] [--from-file <saved.xml>] [--min-gap-min 30]
//   --from-file   parse a saved copy of the feed instead of fetching (tests)
// Source terms (https://m.nasdaqtrader.com/content/administrationsupport/agreementstrading/THRSSFeedTermsCond.pdf, read Nov 24 2026): halts are shown as published,
// not edited or blended with other vendors' data. Plain descriptive User-Agent, one request per run. The feed's own cache hint is 1 minute.
// Times in the feed are US Eastern. Every row carries ET text, UTC ISO and a 12-hour Mountain label.
// Reason codes are shown RAW. Only LUDP is described (LULD volatility pause); Nasdaq's code table page was a 404 on Nov 24 2026, so no other code is labelled.
// Fails closed: HTTP error, no items, or bad XML -> exit 1 and the previous file is left untouched.
// Write rule: if the halts are unchanged and the old file is younger than --min-gap-min, nothing is written (so the Action does not commit 144 times a day).
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const OUT = opt('--out', 'v2/data/halts.json');
const FROM = opt('--from-file');
const MIN_GAP_MIN = Number(opt('--min-gap-min', '30'));
const URL_FEED = 'https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts';
const UA = 'board-research-feed/1.0 (private research script)';
const KEEP_DAYS = 3;   // halts dated within the last 3 calendar days (ET): covers the prior session over a weekend
const EXCLUDED = new Set(['SNDK', 'SENEA']);   // board-wide standing exclusion (split artefacts)
const REASON_LABEL = { LUDP: 'LULD volatility pause' };

const ET = 'America/New_York', MT = 'America/Denver';
const tzOffsetMs = (utcMs, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
};
// wall-clock in `tz` -> UTC ms (two passes handle the DST edge)
const wallToUtc = (y, mo, d, h, mi, s, tz) => { const guess = Date.UTC(y, mo - 1, d, h, mi, s); let u = guess - tzOffsetMs(guess, tz); u = guess - tzOffsetMs(u, tz); return u; };
const mtLabel = (utcMs) => {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: MT, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return `${f.month} ${f.day} ${f.hour}:${f.minute}:${f.second} ${f.dayPeriod} MT`;
};
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const tag = (blk, name) => { const m = new RegExp(`<ndaq:${name}\\s*/>|<ndaq:${name}>([\\s\\S]*?)</ndaq:${name}>`).exec(blk); return m && m[1] != null ? m[1].trim() : ''; };
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
function whenEt(dateTxt, timeTxt) {   // "11/24/2026" + "19:50:00.000" (ET)
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateTxt || ''), t = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(timeTxt || '');
  if (!d || !t) return null;
  return wallToUtc(+d[3], +d[1], +d[2], +t[1], +t[2], +t[3], ET);
}

export function parseFeed(xml) {
  xml = xml.replace(/^﻿/, '');
  if (!/<rss[\s>]/.test(xml)) throw new Error('not an RSS document');
  const num = /<ndaq:numItems>(\d+)<\/ndaq:numItems>/.exec(xml);
  const pub = /<channel>[\s\S]*?<pubDate>([^<]+)<\/pubDate>/.exec(xml);
  const items = xml.split('<item>').slice(1).map((b) => b.split('</item>')[0]);
  const rows = [];
  for (const b of items) {
    const sym = unesc(tag(b, 'IssueSymbol')); if (!sym) continue;
    const haltMs = whenEt(tag(b, 'HaltDate'), tag(b, 'HaltTime'));
    if (haltMs == null) continue;
    const rq = whenEt(tag(b, 'ResumptionDate'), tag(b, 'ResumptionQuoteTime')), rt = whenEt(tag(b, 'ResumptionDate'), tag(b, 'ResumptionTradeTime'));
    const px = tag(b, 'PauseThresholdPrice'); const pxn = px === '' || isNaN(Number(px)) ? null : Number(px);
    const etDate = new Date(haltMs + tzOffsetMs(haltMs, ET));
    const code = unesc(tag(b, 'ReasonCode'));
    rows.push({
      symbol: sym, name: unesc(tag(b, 'IssueName')) || null, market: unesc(tag(b, 'Market')) || null,
      reason_code: code || null, reason_label: REASON_LABEL[code] || null,
      halt_et: `${tag(b, 'HaltDate')} ${tag(b, 'HaltTime')} ET`.replace(/\s+/g, ' '), halt_date_et: etDate.toISOString().slice(0, 10),
      halt_utc: iso(haltMs), halt_mt: mtLabel(haltMs),
      pause_threshold_price_usd: pxn,
      resume_quote_utc: rq == null ? null : iso(rq), resume_quote_mt: rq == null ? null : mtLabel(rq),
      resume_trade_utc: rt == null ? null : iso(rt), resume_trade_mt: rt == null ? null : mtLabel(rt),
      open: rt == null,
    });
  }
  return { items: items.length, numItems: num ? +num[1] : null, pubDate: pub ? pub[1].trim() : null, rows };
}

export function buildDoc(parsed, nowMs) {
  const cutoff = new Date(nowMs - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const rows = parsed.rows.filter((r) => r.halt_date_et >= cutoff && !EXCLUDED.has(r.symbol)).sort((a, b) => b.halt_utc.localeCompare(a.halt_utc) || a.symbol.localeCompare(b.symbol));
  const reasons = {}; for (const r of rows) reasons[r.reason_code ?? 'null'] = (reasons[r.reason_code ?? 'null'] || 0) + 1;
  const nulls = {}; for (const k of ['name', 'market', 'reason_code', 'pause_threshold_price_usd', 'resume_trade_utc']) nulls[k] = rows.filter((r) => r[k] == null).length;
  return {
    schema_version: 1, asof_utc: iso(nowMs), asof_mt: mtLabel(nowMs), source: 'Nasdaq Trader trade halts RSS (nasdaqtrader.com)',
    source_note: 'Halts shown as published; times are US Eastern in the feed, converted to UTC and Mountain Time here. The feed keeps old items, so only halts dated within the last 3 days (ET) are kept. Reason codes are raw; only LUDP is described. open = no resumption trade time yet.',
    feed_pubdate: parsed.pubDate, feed_items: parsed.items, feed_num_items: parsed.numItems, keep_from_et_date: cutoff,
    count: rows.length, open_count: rows.filter((r) => r.open).length, reason_counts: reasons, nulls, rows,
  };
}

async function main() {
  const nowMs = Date.now();
  let xml;
  if (FROM) xml = fs.readFileSync(FROM, 'utf8');
  else {
    const r = await fetch(URL_FEED, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, text/xml' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
    xml = await r.text();
  }
  const parsed = parseFeed(xml);
  if (!parsed.items) throw new Error('feed parsed but holds no items');
  const doc = buildDoc(parsed, FROM ? Date.parse(parsed.pubDate) || nowMs : nowMs);
  // unchanged + young -> leave the file alone
  try {
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^﻿/, ''));
    const same = JSON.stringify(old.rows) === JSON.stringify(doc.rows);
    const ageMin = (nowMs - Date.parse(old.asof_utc)) / 60000;
    if (!FROM && same && ageMin < MIN_GAP_MIN) { console.log(`halts unchanged (${doc.count} rows, file ${ageMin.toFixed(0)} min old): not rewritten`); return; }
  } catch { /* none yet */ }
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  const tmp = OUT + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(doc), 'utf8'); fs.renameSync(tmp, OUT);
  console.log(`wrote ${OUT}: ${doc.count} halts (${doc.open_count} open), feed items ${doc.feed_items}, asof ${doc.asof_utc}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FAIL:', String(e.message || e).slice(0, 200)); process.exit(1); });
}
